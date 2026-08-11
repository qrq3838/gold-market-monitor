#!/usr/bin/env python
"""Download and normalize Yahoo Finance daily U.S. Dollar Index history."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import tempfile
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo


SYMBOL = "DX-Y.NYB"
SOURCE_PAGE = "https://finance.yahoo.com/quote/DX-Y.NYB/history/"
API_HOSTS = ("query1.finance.yahoo.com", "query2.finance.yahoo.com")
CANONICAL_API_URL = f"https://query1.finance.yahoo.com/v8/finance/chart/{SYMBOL}"


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="", delete=False, dir=path.parent
    ) as handle:
        handle.write(content)
        temporary_path = Path(handle.name)
    os.replace(temporary_path, path)


def build_api_url(host: str) -> str:
    period2 = int(time.time()) + 86400
    query = urllib.parse.urlencode(
        {
            "period1": 0,
            "period2": period2,
            "interval": "1d",
            "events": "history",
            "includeAdjustedClose": "true",
        }
    )
    return f"https://{host}/v8/finance/chart/{urllib.parse.quote(SYMBOL)}?{query}"


def fetch_yahoo() -> tuple[dict[str, Any], str]:
    errors: list[str] = []
    for host in API_HOSTS:
        url = build_api_url(host)
        request = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (compatible; gold-market-monitor/1.0)",
                "Accept": "application/json,text/plain,*/*",
                "Referer": SOURCE_PAGE,
            },
        )
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                if response.status != 200:
                    raise RuntimeError(f"HTTP {response.status}")
                payload = json.load(response)
            return payload, url
        except Exception as error:  # try the second official Yahoo chart host
            errors.append(f"{host}: {error}")
    raise RuntimeError("Yahoo Finance download failed: " + "; ".join(errors))


def normalize(source: dict[str, Any]) -> tuple[list[dict[str, float | str]], dict[str, Any]]:
    chart = source.get("chart")
    if not isinstance(chart, dict) or chart.get("error") is not None:
        raise ValueError(f"Yahoo chart error: {chart.get('error') if isinstance(chart, dict) else chart}")
    results = chart.get("result")
    if not isinstance(results, list) or len(results) != 1:
        raise ValueError("Yahoo response did not contain exactly one chart result")
    result = results[0]
    meta = result.get("meta")
    if not isinstance(meta, dict) or meta.get("symbol") != SYMBOL:
        raise ValueError(f"Unexpected Yahoo symbol metadata: {meta}")
    exchange_timezone_name = meta.get("exchangeTimezoneName")
    if not isinstance(exchange_timezone_name, str) or not exchange_timezone_name:
        raise ValueError("Yahoo response has no exchange timezone")
    exchange_timezone = ZoneInfo(exchange_timezone_name)
    regular_market_time = meta.get("regularMarketTime")

    timestamps = result.get("timestamp")
    quote_blocks = result.get("indicators", {}).get("quote")
    adjusted_blocks = result.get("indicators", {}).get("adjclose")
    if not isinstance(timestamps, list) or not timestamps:
        raise ValueError("Yahoo response has no timestamps")
    if not isinstance(quote_blocks, list) or len(quote_blocks) != 1:
        raise ValueError("Yahoo response has no quote block")
    quote = quote_blocks[0]
    adjusted = (
        adjusted_blocks[0].get("adjclose")
        if isinstance(adjusted_blocks, list) and adjusted_blocks
        else quote.get("close")
    )
    fields = {name: quote.get(name) for name in ("open", "high", "low", "close")}
    fields["adjusted_close"] = adjusted
    if any(not isinstance(values, list) or len(values) != len(timestamps) for values in fields.values()):
        raise ValueError("Yahoo price arrays are missing or misaligned")

    by_date: dict[str, dict[str, float | str]] = {}
    for index, timestamp in enumerate(timestamps):
        values = {name: series[index] for name, series in fields.items()}
        if values["close"] is None:
            continue
        exchange_datetime = datetime.fromtimestamp(float(timestamp), tz=exchange_timezone)
        if (
            isinstance(regular_market_time, (int, float))
            and int(timestamp) == int(regular_market_time)
            and exchange_datetime.time().replace(tzinfo=None) != datetime.min.time()
        ):
            # Yahoo appends the live quote as the last "1d" row while the
            # exchange session is still open. Its timestamp follows the clock
            # instead of exchange midnight, so it is not a completed daily bar.
            continue
        if any(values[name] is None for name in ("open", "high", "low", "adjusted_close")):
            raise ValueError(f"Incomplete Yahoo OHLC row at timestamp {timestamp}")
        day = exchange_datetime.date().isoformat()
        by_date[day] = {
            "date": day,
            **{name: round(float(value), 6) for name, value in values.items()},
        }

    rows = [by_date[day] for day in sorted(by_date)]
    if len(rows) < 10000:
        raise ValueError(f"Yahoo history is unexpectedly short: {len(rows)} rows")
    for row in rows:
        close = float(row["close"])
        if not 20 < close < 200:
            raise ValueError(f"Implausible dollar-index close on {row['date']}: {close}")
        if not float(row["low"]) <= close <= float(row["high"]):
            raise ValueError(f"Close outside daily range on {row['date']}")
    return rows, meta


def render_csv(rows: list[dict[str, float | str]]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(("date", "open", "high", "low", "close", "adjusted_close"))
    for row in rows:
        writer.writerow(
            (
                row["date"],
                *(
                    format(float(row[name]), ".6f").rstrip("0").rstrip(".")
                    for name in ("open", "high", "low", "close", "adjusted_close")
                ),
            )
        )
    return output.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
    )
    args = parser.parse_args()
    json_path = args.output_dir / "us_dollar_index.json"
    csv_path = args.output_dir / "us_dollar_index.csv"

    previous: dict[str, Any] = {}
    if json_path.exists():
        try:
            previous = json.loads(json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = {}

    source, _ = fetch_yahoo()
    rows, meta = normalize(source)
    dates = [str(row["date"]) for row in rows]
    values = [float(row["close"]) for row in rows]
    unchanged = previous.get("dates") == dates and previous.get("values") == values
    downloaded_at = previous.get("downloaded_at_utc") if unchanged else None
    if not downloaded_at:
        downloaded_at = (
            datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        )

    payload = {
        "schema_version": 1,
        "title": "U.S. Dollar Index",
        "symbol": SYMBOL,
        "source_page": SOURCE_PAGE,
        "api_url": CANONICAL_API_URL,
        "source": "Yahoo Finance",
        "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
        "exchange_timezone": meta.get("exchangeTimezoneName"),
        "frequency": "Daily",
        "units": "Index points",
        "series": "Close",
        "missing_value_policy": (
            "Rows with null close and the live in-progress Yahoo daily quote are omitted; "
            "no interpolation"
        ),
        "as_of_date": dates[-1],
        "downloaded_at_utc": downloaded_at,
        "observation_count": len(dates),
        "dates": dates,
        "values": values,
    }
    atomic_write_text(json_path, json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    atomic_write_text(csv_path, render_csv(rows))
    print(
        f"{SYMBOL} through {dates[-1]}: {values[-1]:.2f} "
        f"({len(dates)} daily observations)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
