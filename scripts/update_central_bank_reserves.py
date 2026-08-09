#!/usr/bin/env python
"""Download WGC quarterly official gold holdings and aggregate them by region."""

from __future__ import annotations

import argparse
import csv
import io
import json
import os
import tempfile
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


SOURCE_PAGE = "https://www.gold.org/goldhub/data/gold-reserves-by-country"
FILTERS_API_URL = "https://fsapi.gold.org/api/cbd/v11/charts/getFilters"
DATA_API_BASE_URL = "https://fsapi.gold.org/api/cbd/v11/charts/getPage"
PERIODICITY = "QTD_FULL"
METRIC_KEY = "gold_reserves_tns"
UNIT = "tonnes"
FIRST_AVAILABLE_DATE = "2000-12-31"
FUTURE_END_DATE = "2099-12-31"
US_ISO3 = "USA"
REGION_ORDER = (
    ("North America", "#215785"),
    ("Western Europe", "#7a3271"),
    ("East Asia", "#00a67d"),
    ("Central and Eastern Europe", "#bd6848"),
    ("Central Asia", "#8f78b8"),
    ("South Asia", "#d4a63f"),
    ("Middle East & North Africa", "#a36675"),
    ("South East Asia", "#57a3c8"),
    ("Latin America & Caribbean", "#d6707d"),
    ("Sub-Saharan Africa", "#6f8f83"),
    ("Australasia / Oceania", "#82c896"),
)


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
    with urllib.request.urlopen(request, timeout=75) as response:
        if response.status != 200:
            raise RuntimeError(f"WGC API returned HTTP {response.status}")
        return json.load(response)


def data_api_url() -> str:
    query = urllib.parse.urlencode(
        {
            "page": "date_range",
            "periodicity": PERIODICITY,
            "startDate": FIRST_AVAILABLE_DATE,
            "endDate": FUTURE_END_DATE,
        }
    )
    return f"{DATA_API_BASE_URL}?{query}"


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


def normalize(
    filters_source: dict[str, Any],
    data_source: dict[str, Any],
    previous: dict[str, Any] | None = None,
) -> dict[str, Any]:
    try:
        filters_chart = filters_source["chartData"]
        filters_data = filters_chart["data"]
        countries = filters_chart["countries"]
        region_items = filters_data["filters"]["geography"]["items"]["regionGroup"]["items"]
        chart_data = data_source["chartData"]
        options = chart_data["options"]
        metric = chart_data["linechart"][PERIODICITY][METRIC_KEY]
        raw_series = metric["data"]
    except (KeyError, TypeError) as exc:
        raise ValueError(f"WGC central-bank response structure changed: {exc}") from exc

    if not isinstance(countries, dict) or len(countries) < 100:
        raise ValueError("WGC country metadata is missing or unexpectedly short")
    expected_regions = [name for name, _ in REGION_ORDER]
    if set(region_items) != set(expected_regions):
        raise ValueError(f"Unexpected WGC regions: {sorted(region_items)}")
    if metric.get("unit") != "Tonnes":
        raise ValueError(f"Unexpected WGC reserve unit: {metric.get('unit')}")
    if not isinstance(raw_series, list) or len(raw_series) != len(countries):
        raise ValueError("WGC country series count does not match country metadata")

    series_by_iso3 = {item.get("name"): item.get("data") for item in raw_series}
    if set(series_by_iso3) != set(countries):
        missing = sorted(set(countries) - set(series_by_iso3))
        extra = sorted(set(series_by_iso3) - set(countries))
        raise ValueError(f"Country series mismatch; missing={missing}, extra={extra}")
    if countries[US_ISO3].get("regionGroup") != "North America":
        raise ValueError("United States is no longer classified under North America")

    reference_dates: list[str] | None = None
    filled_by_country: dict[str, list[float | None]] = {}
    raw_available_by_country: dict[str, list[bool]] = {}
    for iso3, points in series_by_iso3.items():
        if not isinstance(points, list) or len(points) < 100:
            raise ValueError(f"Quarterly history is missing or too short for {iso3}")
        dates = [timestamp_to_date(point[0]) for point in points]
        if reference_dates is None:
            reference_dates = dates
        elif dates != reference_dates:
            raise ValueError(f"Quarterly dates do not align for {iso3}")

        filled: list[float | None] = []
        raw_available: list[bool] = []
        last_value: float | None = None
        for point in points:
            raw_value = point[1]
            if raw_value is not None:
                value = float(raw_value)
                if not 0 <= value <= 10_000:
                    raise ValueError(f"Implausible reserve value for {iso3}: {value}")
                last_value = value
                raw_available.append(True)
            else:
                raw_available.append(False)
            filled.append(last_value)
        filled_by_country[iso3] = filled
        raw_available_by_country[iso3] = raw_available

    assert reference_dates is not None
    if reference_dates[0] != options.get("minDateAvailable"):
        raise ValueError("First observation does not match WGC minDateAvailable")
    if reference_dates[-1] != options.get("maxDateAvailable"):
        raise ValueError("Last observation does not match WGC maxDateAvailable")
    if any(left >= right for left, right in zip(reference_dates, reference_dates[1:])):
        raise ValueError("Quarterly dates are not strictly increasing")

    region_including_us = {region: [0.0] * len(reference_dates) for region in expected_regions}
    region_excluding_us = {region: [0.0] * len(reference_dates) for region in expected_regions}
    us_values = filled_by_country[US_ISO3]
    reported_counts: list[int] = []
    carried_counts: list[int] = []
    unavailable_counts: list[int] = []

    for index in range(len(reference_dates)):
        reported = carried = unavailable = 0
        for iso3, metadata in countries.items():
            region = metadata.get("regionGroup")
            if region not in region_including_us:
                raise ValueError(f"Missing or unknown region for {iso3}: {region}")
            value = filled_by_country[iso3][index]
            raw_available = raw_available_by_country[iso3][index]
            if value is None:
                unavailable += 1
                continue
            if raw_available:
                reported += 1
            else:
                carried += 1
            region_including_us[region][index] += value
            if iso3 != US_ISO3:
                region_excluding_us[region][index] += value
        reported_counts.append(reported)
        carried_counts.append(carried)
        unavailable_counts.append(unavailable)

    def rounded(values: list[float]) -> list[float]:
        return [round(value, 2) for value in values]

    region_including_us = {key: rounded(values) for key, values in region_including_us.items()}
    region_excluding_us = {key: rounded(values) for key, values in region_excluding_us.items()}
    world_including_us = rounded(
        [sum(region_including_us[region][i] for region in expected_regions) for i in range(len(reference_dates))]
    )
    world_excluding_us = rounded(
        [sum(region_excluding_us[region][i] for region in expected_regions) for i in range(len(reference_dates))]
    )
    us_values_rounded = [None if value is None else round(value, 2) for value in us_values]

    for index, (including, excluding, us_value) in enumerate(
        zip(world_including_us, world_excluding_us, us_values_rounded)
    ):
        if us_value is not None and abs((including - excluding) - us_value) > 0.02:
            raise ValueError(f"US exclusion does not reconcile on {reference_dates[index]}")

    data_identity = {
        "as_of_date": reference_dates[-1],
        "dates": reference_dates,
        "tonnes_including_us": region_including_us,
        "tonnes_excluding_us": region_excluding_us,
        "world_total_including_us": world_including_us,
        "world_total_excluding_us": world_excluding_us,
        "united_states_tonnes": us_values_rounded,
        "reported_countries": reported_counts,
        "carried_forward_countries": carried_counts,
        "unavailable_countries": unavailable_counts,
    }
    previous_identity = None if previous is None else {
        key: previous.get(key) for key in data_identity
    }
    if previous_identity == data_identity:
        downloaded_at = previous.get("downloaded_at_utc")
    else:
        downloaded_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    return {
        "schema_version": 1,
        "title": "Official gold reserves by region",
        "source_page": SOURCE_PAGE,
        "filters_api_url": FILTERS_API_URL,
        "data_api_url": data_api_url(),
        "metric": "Official gold holdings",
        "unit": UNIT,
        "frequency": "quarterly",
        "as_of_date": reference_dates[-1],
        "downloaded_at_utc": downloaded_at,
        "country_series_count": len(countries),
        "region_count": len(expected_regions),
        "aggregation": {
            "region_field": "regionGroup",
            "missing_value_treatment": "Forward-fill from each economy's latest reported quarterly stock; never backfill before its first observation.",
            "world_total_definition": "Sum of the 123 geographic country and territory series assigned by WGC to 11 regions; multilateral organisations without a WGC region are outside this geographic total.",
            "exclude_us_definition": "Subtract the USA series from North America and from the world total; all other regions are unchanged.",
        },
        "regions": [{"name": name, "color": color} for name, color in REGION_ORDER],
        **data_identity,
    }


def render_csv(payload: dict[str, Any]) -> str:
    output = io.StringIO(newline="")
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(
        (
            "date",
            "region",
            "tonnes_including_us",
            "tonnes_excluding_us",
            "world_total_including_us",
            "world_total_excluding_us",
            "united_states_tonnes",
            "reported_countries",
            "carried_forward_countries",
            "unavailable_countries",
        )
    )
    region_names = [region["name"] for region in payload["regions"]]
    for index, date in enumerate(payload["dates"]):
        for region in region_names:
            writer.writerow(
                (
                    date,
                    region,
                    f"{payload['tonnes_including_us'][region][index]:.2f}",
                    f"{payload['tonnes_excluding_us'][region][index]:.2f}",
                    f"{payload['world_total_including_us'][index]:.2f}",
                    f"{payload['world_total_excluding_us'][index]:.2f}",
                    "" if payload["united_states_tonnes"][index] is None else f"{payload['united_states_tonnes'][index]:.2f}",
                    payload["reported_countries"][index],
                    payload["carried_forward_countries"][index],
                    payload["unavailable_countries"][index],
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
    json_path = args.output_dir / "central_bank_gold_reserves_by_region.json"
    csv_path = args.output_dir / "central_bank_gold_reserves_by_region.csv"
    previous = None
    if json_path.exists():
        try:
            previous = json.loads(json_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            previous = None

    payload = normalize(fetch_json(FILTERS_API_URL), fetch_json(data_api_url()), previous)
    atomic_write_text(json_path, json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    atomic_write_text(csv_path, render_csv(payload))
    print(
        f"Updated {payload['country_series_count']} country/territory series in "
        f"{payload['region_count']} regions through {payload['as_of_date']} "
        f"({len(payload['dates'])} quarters); latest world total "
        f"{payload['world_total_including_us'][-1]:,.2f} tonnes including USA and "
        f"{payload['world_total_excluding_us'][-1]:,.2f} tonnes excluding USA; "
        f"latest raw reports={payload['reported_countries'][-1]}, "
        f"carried forward={payload['carried_forward_countries'][-1]}, "
        f"unavailable={payload['unavailable_countries'][-1]}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
