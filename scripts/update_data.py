#!/usr/bin/env python
"""Download and normalize World Gold Council regional gold ETF flow data.

The output intentionally excludes the Gold Price (rhs) series.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


API_URL = "https://fsapi.gold.org/api/v11/charts/etfv2/revised/flows-chart2"
SOURCE_PAGE = "https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows"
FREQUENCIES = ("Yearly", "Quarterly", "Monthly", "Weekly")
UNITS = ("usd", "tonnes")
REGIONS = (
    ("North America", "#215785"),
    ("Europe", "#64c8ff"),
    ("Asia", "#00d296"),
    ("Other", "#704287"),
)
EXCLUDED_SERIES = "Gold Price (rhs)"


def fetch_json(url: str) -> dict[str, Any]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "gold-market-monitor/1.0 (+https://github.com/qrq3838/gold-market-monitor)",
            "Accept": "application/json",
            "Origin": "https://www.gold.org",
            "Referer": SOURCE_PAGE,
        },
    )
    with urllib.request.urlopen(request, timeout=45) as response:
        if response.status != 200:
            raise RuntimeError(f"WGC API returned HTTP {response.status}")
        return json.load(response)


def timestamp_to_date(timestamp_ms: int | float) -> str:
    return datetime.fromtimestamp(timestamp_ms / 1000, tz=timezone.utc).date().isoformat()


def atomic_write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", newline="", delete=False, dir=path.parent
    ) as handle:
        handle.write(content)
        temporary_path = Path(handle.name)
    os.replace(temporary_path, path)


def normalize(source: dict[str, Any], previous: dict[str, Any] | None = None) -> dict[str, Any]:
    chart_data = source.get("chartData")
    if not isinstance(chart_data, dict):
        raise ValueError("Missing chartData object")
    source_data = chart_data.get("data")
    if not isinstance(source_data, dict):
        raise ValueError("Missing chartData.data object")

    region_names = [name for name, _ in REGIONS]
    normalized_frequencies: dict[str, Any] = {}
    observation_counts: dict[str, int] = {}

    for frequency in FREQUENCIES:
        frequency_data = source_data.get(frequency)
        if not isinstance(frequency_data, dict) or not isinstance(frequency_data.get("series"), dict):
            raise ValueError(f"Missing {frequency} series")

        normalized_units: dict[str, dict[str, list[float]]] = {}
        reference_dates: list[str] | None = None

        for unit in UNITS:
            raw_series = frequency_data["series"].get(unit)
            if not isinstance(raw_series, list):
                raise ValueError(f"Missing {frequency}.{unit} series")
            if any(item.get("name") == EXCLUDED_SERIES for item in raw_series):
                raw_series = [item for item in raw_series if item.get("name") != EXCLUDED_SERIES]

            by_name = {item.get("name"): item for item in raw_series}
            if set(by_name) != set(region_names):
                raise ValueError(
                    f"Unexpected regions in {frequency}.{unit}: {sorted(str(name) for name in by_name)}"
                )

            unit_values: dict[str, list[float]] = {}
            for region_name in region_names:
                points = by_name[region_name].get("data")
                if not isinstance(points, list) or not points:
                    raise ValueError(f"Empty {frequency}.{unit}.{region_name} data")
                dates = [timestamp_to_date(point[0]) for point in points]
                values = [float(point[1]) for point in points]
                if reference_dates is None:
                    reference_dates = dates
                elif dates != reference_dates:
                    raise ValueError(f"Date mismatch in {frequency}.{unit}.{region_name}")
                unit_values[region_name] = values
            normalized_units[unit] = unit_values

        assert reference_dates is not None
        normalized_frequencies[frequency] = {
            "dates": reference_dates,
            "usd": normalized_units["usd"],
            "tonnes": normalized_units["tonnes"],
        }
        observation_counts[frequency] = len(reference_dates)

    as_of_date = str(chart_data.get("asOfDate") or normalized_frequencies["Weekly"]["dates"][-1])
    data_identity = {
        "as_of_date": as_of_date,
        "frequencies": normalized_frequencies,
    }
    if previous and {
        "as_of_date": previous.get("as_of_date"),
        "frequencies": previous.get("frequencies"),
    } == data_identity:
        downloaded_at = previous.get("downloaded_at_utc")
    else:
        downloaded_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    return {
        "schema_version": 1,
        "title": "Gold ETF flows by region",
        "source_page": SOURCE_PAGE,
        "api_url": API_URL,
        "as_of_date": as_of_date,
        "downloaded_at_utc": downloaded_at,
        "excluded_series": [EXCLUDED_SERIES],
        "units": {
            "usd": "US dollars",
            "tonnes": "tonnes",
        },
        "regions": [{"name": name, "color": color} for name, color in REGIONS],
        "observation_counts": observation_counts,
        "frequencies": normalized_frequencies,
    }


def render_csv(payload: dict[str, Any]) -> str:
    import io

    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(("frequency", "date", "region", "usd_flow", "tonnes_demand"))
    region_names = [region["name"] for region in payload["regions"]]
    for frequency in FREQUENCIES:
        block = payload["frequencies"][frequency]
        for index, date in enumerate(block["dates"]):
            for region in region_names:
                writer.writerow(
                    (
                        frequency,
                        date,
                        region,
                        format(block["usd"][region][index], ".10f").rstrip("0").rstrip("."),
                        format(block["tonnes"][region][index], ".10f").rstrip("0").rstrip("."),
                    )
                )
    return output.getvalue()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data",
        help="Directory for normalized JSON and CSV files",
    )
    args = parser.parse_args()

    json_path = args.output_dir / "gold_etf_flows_by_region.json"
    csv_path = args.output_dir / "gold_etf_flows_by_region.csv"
    previous = None
    if json_path.exists():
        try:
            previous = json.loads(json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = None

    payload = normalize(fetch_json(API_URL), previous)
    atomic_write_text(json_path, json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    atomic_write_text(csv_path, render_csv(payload))
    counts = ", ".join(f"{key}={value}" for key, value in payload["observation_counts"].items())
    print(f"Updated through {payload['as_of_date']} ({counts}); excluded {EXCLUDED_SERIES}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
