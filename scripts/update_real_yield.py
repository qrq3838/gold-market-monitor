#!/usr/bin/env python
"""Maintain the U.S. 10-year real Treasury yield series used by the dashboard."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import tempfile
import urllib.request
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable


SERIES_ID = "DFII10"
SOURCE_PAGE = "https://fred.stlouisfed.org/series/DFII10"
CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10"
REVISION_WINDOW_DAYS = 35


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="", delete=False, dir=path.parent
    ) as handle:
        handle.write(content)
        temporary_path = Path(handle.name)
    os.replace(temporary_path, path)


def fetch_fred_csv() -> str:
    request = urllib.request.Request(
        CSV_URL,
        headers={
            "User-Agent": "gold-market-monitor/1.0 (+https://github.com/qrq3838/gold-market-monitor)",
            "Accept": "text/csv,*/*;q=0.8",
        },
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError(f"FRED returned HTTP {response.status}")
        return response.read().decode("utf-8-sig")


def parse_fred_csv(content: str) -> dict[str, float]:
    reader = csv.DictReader(io.StringIO(content))
    if not reader.fieldnames:
        raise ValueError("FRED CSV has no header")
    date_column = next(
        (name for name in ("observation_date", "DATE", "date") if name in reader.fieldnames),
        None,
    )
    if date_column is None or SERIES_ID not in reader.fieldnames:
        raise ValueError(f"Unexpected FRED columns: {reader.fieldnames}")

    observations: dict[str, float] = {}
    for row in reader:
        day = (row.get(date_column) or "").strip()
        raw_value = (row.get(SERIES_ID) or "").strip()
        if not day or raw_value in {"", "."}:
            continue
        date.fromisoformat(day)
        observations[day] = float(raw_value)
    if len(observations) < 1000:
        raise ValueError(f"FRED returned too few numeric observations: {len(observations)}")
    return observations


def load_existing(path: Path) -> tuple[dict[str, float], dict]:
    if not path.exists():
        return {}, {}
    payload = json.loads(path.read_text(encoding="utf-8"))
    dates = payload.get("dates")
    values = payload.get("values")
    if not isinstance(dates, list) or not isinstance(values, list) or len(dates) != len(values):
        raise ValueError("Existing real-yield JSON is malformed")
    return {day: float(value) for day, value in zip(dates, values)}, payload


def load_bootstrap(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    rows = payload.get("observations")
    if not isinstance(rows, list):
        raise ValueError("Bootstrap JSON has no observations array")
    observations = {str(row["date"]): float(row["value"]) for row in rows}
    if len(observations) < 1000:
        raise ValueError("Bootstrap history is unexpectedly short")
    return observations


def validate(observations: dict[str, float]) -> list[str]:
    dates = sorted(observations)
    if len(dates) < 1000 or len(dates) != len(set(dates)):
        raise ValueError("Real-yield history failed count or uniqueness validation")
    for index, day in enumerate(dates):
        date.fromisoformat(day)
        value = observations[day]
        if not -10 < value < 20:
            raise ValueError(f"Implausible DFII10 value on {day}: {value}")
        if index and day <= dates[index - 1]:
            raise ValueError("Dates are not strictly increasing")
    return dates


def render_csv(dates: Iterable[str], observations: dict[str, float]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(("date", "real_yield_percent"))
    for day in dates:
        writer.writerow((day, format(observations[day], ".6f").rstrip("0").rstrip(".")))
    return output.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
    )
    parser.add_argument("--bootstrap-json", type=Path)
    parser.add_argument("--skip-fetch", action="store_true")
    args = parser.parse_args()

    json_path = args.output_dir / "us_10y_real_yield.json"
    csv_path = args.output_dir / "us_10y_real_yield.csv"
    observations, previous = load_existing(json_path)
    if not observations:
        if not args.bootstrap_json:
            raise ValueError("No existing history; pass --bootstrap-json for the first run")
        observations = load_bootstrap(args.bootstrap_json)

    previous_identity = sorted(observations.items())
    last_existing_date = max(observations)
    if not args.skip_fetch:
        fred = parse_fred_csv(fetch_fred_csv())
        revision_cutoff = (
            date.fromisoformat(last_existing_date) - timedelta(days=REVISION_WINDOW_DAYS)
        ).isoformat()
        for day, value in fred.items():
            if day >= revision_cutoff:
                observations[day] = value

    dates = validate(observations)
    identity_changed = previous_identity != sorted(observations.items())
    downloaded_at = previous.get("downloaded_at_utc")
    if identity_changed or not downloaded_at:
        downloaded_at = (
            datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
        )

    payload = {
        "schema_version": 1,
        "title": "U.S. 10-Year Treasury Inflation-Indexed Real Yield",
        "series_id": SERIES_ID,
        "source_page": SOURCE_PAGE,
        "csv_url": CSV_URL,
        "source": "Board of Governors of the Federal Reserve System (US), via FRED",
        "release": "H.15 Selected Interest Rates",
        "frequency": "Daily",
        "units": "Percent",
        "seasonal_adjustment": "Not Seasonally Adjusted",
        "baseline": {
            "description": "User-provided Excel export; source metadata: U.S. Treasury / Wind",
            "through_date": "2026-08-07",
        },
        "incremental_update": {
            "source": "FRED DFII10",
            "revision_window_days": REVISION_WINDOW_DAYS,
        },
        "as_of_date": dates[-1],
        "downloaded_at_utc": downloaded_at,
        "observation_count": len(dates),
        "dates": dates,
        "values": [observations[day] for day in dates],
    }
    atomic_write_text(json_path, json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    atomic_write_text(csv_path, render_csv(dates, observations))
    print(
        f"DFII10 through {dates[-1]}: {observations[dates[-1]]:.2f}% "
        f"({len(dates)} observations)"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
