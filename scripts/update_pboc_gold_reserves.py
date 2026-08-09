#!/usr/bin/env python3
"""Download SAFE monthly official gold reserves and calculate PBOC net purchases."""

from __future__ import annotations

import base64
import calendar
import csv
import io
import json
import os
import re
import ssl
import subprocess
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import date
from html.parser import HTMLParser
from pathlib import Path
from xml.etree import ElementTree as ET


INDEX_URL = "https://www.safe.gov.cn/safe/gfcbzc/index.html"
OUTPUT_JSON = Path(__file__).resolve().parents[1] / "data" / "pboc_gold_reserve_changes.json"
OUTPUT_CSV = Path(__file__).resolve().parents[1] / "data" / "pboc_gold_reserve_changes.csv"
TROY_OUNCE_GRAMS = 31.1034768
TEN_THOUSAND_OUNCES_TO_TONNES = TROY_OUNCE_GRAMS * 10_000 / 1_000_000
USER_AGENT = "gold-market-monitor/1.0 (+https://github.com/qrq3838/gold-market-monitor)"


class LinkParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: str | None = None
        self._text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == "a":
            self._href = dict(attrs).get("href")
            self._text = []

    def handle_data(self, data: str) -> None:
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == "a" and self._href is not None:
            self.links.append((self._href, " ".join("".join(self._text).split())))
            self._href = None
            self._text = []


class TableParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.rows: list[list[str]] = []
        self._row: list[str] | None = None
        self._cell: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if tag == "tr":
            self._row = []
        elif tag in {"td", "th"} and self._row is not None:
            self._cell = []

    def handle_data(self, data: str) -> None:
        if self._cell is not None:
            self._cell.append(data)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if tag in {"td", "th"} and self._row is not None and self._cell is not None:
            self._row.append(" ".join("".join(self._cell).replace("\xa0", " ").split()))
            self._cell = None
        elif tag == "tr" and self._row is not None:
            self.rows.append(self._row)
            self._row = None


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            if response.status != 200:
                raise RuntimeError(f"SAFE request failed: HTTP {response.status} for {url}")
            return response.read()
    except urllib.error.URLError as error:
        if os.name == "nt" and isinstance(error.reason, ssl.SSLCertVerificationError):
            return fetch_with_windows_trust(url)
        raise


def fetch_with_windows_trust(url: str) -> bytes:
    """Use the Windows certificate store when OpenSSL cannot see an enterprise root."""
    safe_url = url.replace("'", "''")
    safe_agent = USER_AGENT.replace("'", "''")
    script = f"""
$ErrorActionPreference='Stop'
$client=New-Object System.Net.WebClient
$client.Headers['User-Agent']='{safe_agent}'
try {{
  $bytes=$client.DownloadData('{safe_url}')
  [Console]::Out.Write([Convert]::ToBase64String($bytes))
}} finally {{
  $client.Dispose()
}}
"""
    encoded = base64.b64encode(script.encode("utf-16le")).decode("ascii")
    result = subprocess.run(
        ["powershell.exe", "-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", encoded],
        check=True,
        capture_output=True,
        text=True,
        timeout=60,
    )
    return base64.b64decode(result.stdout.strip(), validate=True)


def parse_links(content: bytes, base_url: str) -> list[tuple[str, str]]:
    parser = LinkParser()
    parser.feed(content.decode("utf-8"))
    return [(urllib.parse.urljoin(base_url, href), text) for href, text in parser.links]


def ounce_values_from_rows(rows: list[list[str]]) -> list[int]:
    for row in rows:
        matches: list[int] = []
        for cell in row:
            match = re.search(r"([0-9][0-9,]*)\s*万\s*盎\s*司", cell)
            if match:
                matches.append(int(match.group(1).replace(",", "")))
        if matches:
            return collapse_usd_sdr_pairs(matches)
    return []


def collapse_usd_sdr_pairs(values: list[int]) -> list[int]:
    if len(values) % 2:
        raise ValueError(f"SAFE ounce row has an odd number of values: {len(values)}")
    result: list[int] = []
    for index in range(0, len(values), 2):
        if values[index] != values[index + 1]:
            raise ValueError("SAFE USD and SDR columns disagree on physical gold reserves")
        result.append(values[index])
    return result


def parse_html_ounces(content: bytes) -> list[int]:
    parser = TableParser()
    parser.feed(content.decode("utf-8"))
    return ounce_values_from_rows(parser.rows)


def xlsx_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    try:
        root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    except KeyError:
        return []
    namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    return ["".join(node.text or "" for node in item.findall(".//x:t", namespace)) for item in root]


def parse_xlsx_ounces(content: bytes) -> list[int]:
    namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        shared = xlsx_shared_strings(archive)
        for name in archive.namelist():
            if not re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml", name):
                continue
            root = ET.fromstring(archive.read(name))
            rows: list[list[str]] = []
            for row in root.findall(".//x:row", namespace):
                values: list[str] = []
                for cell in row.findall("x:c", namespace):
                    value_node = cell.find("x:v", namespace)
                    if value_node is None:
                        inline = "".join(node.text or "" for node in cell.findall(".//x:t", namespace))
                        values.append(inline)
                    elif cell.get("t") == "s":
                        values.append(shared[int(value_node.text or "0")])
                    else:
                        values.append(value_node.text or "")
                rows.append(values)
            values = ounce_values_from_rows(rows)
            if values:
                return values
    return []


def discover_year_pages() -> dict[int, str]:
    pages: dict[int, str] = {}
    for url, text in parse_links(fetch(INDEX_URL), INDEX_URL):
        if "官方储备资产" not in text:
            continue
        match = re.search(r"(20[0-9]{2})", text)
        if match:
            pages[int(match.group(1))] = url
    if not pages:
        raise ValueError("SAFE index did not expose any annual official-reserve pages")
    missing = [year for year in range(2016, max(pages) + 1) if year not in pages]
    if missing:
        raise ValueError(f"SAFE index is missing annual pages: {missing}")
    return pages


def fetch_year_values(year: int, page_url: str, latest_year: int) -> list[int]:
    content = fetch(page_url)
    values = parse_html_ounces(content)
    if not values:
        xlsx_links = [url for url, _ in parse_links(content, page_url) if url.lower().split("?", 1)[0].endswith(".xlsx")]
        if not xlsx_links:
            raise ValueError(f"No physical gold ounce series found for {year}: {page_url}")
        values = parse_xlsx_ounces(fetch(xlsx_links[0]))
    if not values:
        raise ValueError(f"Could not parse physical gold ounce series for {year}")
    if year < latest_year and len(values) != 12:
        raise ValueError(f"SAFE {year} archive has {len(values)} months, expected 12")
    if year == latest_year and not 1 <= len(values) <= 12:
        raise ValueError(f"SAFE current-year archive has unexpected month count: {len(values)}")
    if year == date.today().year and len(values) < max(1, date.today().month - 2):
        raise ValueError(f"SAFE current-year archive appears stale: only {len(values)} months")
    if year == date.today().year - 1 and date.today().month == 1 and len(values) < 10:
        raise ValueError(f"SAFE latest archive appears stale: only {len(values)} months")
    return values


def month_end(year: int, month: int) -> str:
    return f"{year:04d}-{month:02d}-{calendar.monthrange(year, month)[1]:02d}"


def build_rows() -> list[dict[str, object]]:
    pages = discover_year_pages()
    latest_year = max(pages)
    reserves: list[tuple[str, int]] = []
    for year in sorted(pages):
        if year < 2016:
            continue
        for month, value in enumerate(fetch_year_values(year, pages[year], latest_year), start=1):
            reserves.append((month_end(year, month), value))

    dates = [item[0] for item in reserves]
    if dates != sorted(set(dates)):
        raise ValueError("SAFE monthly dates are duplicated or not strictly increasing")
    if not dates or dates[0] != "2016-01-31" or len(dates) < 120:
        raise ValueError("SAFE physical gold history is shorter than the validated baseline")
    for previous, current in zip(dates, dates[1:]):
        year, month = map(int, previous[:7].split("-"))
        next_month = 1 if month == 12 else month + 1
        next_year = year + 1 if month == 12 else year
        if current[:7] != f"{next_year:04d}-{next_month:02d}":
            raise ValueError(f"SAFE monthly series has a gap after {previous[:7]}")

    rows: list[dict[str, object]] = []
    previous_value: int | None = None
    for period, reserve in reserves:
        if not 3_000 <= reserve <= 10_000:
            raise ValueError(f"SAFE gold reserve is outside the expected range at {period}: {reserve}")
        change = None if previous_value is None else reserve - previous_value
        if change is not None and not -500 <= change <= 500:
            raise ValueError(f"SAFE monthly gold change is outside the expected range at {period}: {change}")
        rows.append({
            "date": period,
            "month": period[:7],
            "reserve_10k_oz": reserve,
            "reserve_tonnes": round(reserve * TEN_THOUSAND_OUNCES_TO_TONNES, 3),
            "monthly_change_10k_oz": change,
            "monthly_change_tonnes": None if change is None else round(change * TEN_THOUSAND_OUNCES_TO_TONNES, 3),
        })
        previous_value = reserve
    return rows


def write_atomic(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", newline="", delete=False, dir=path.parent) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    os.replace(temporary, path)


def serialize_csv(rows: list[dict[str, object]]) -> str:
    output = io.StringIO(newline="")
    fields = ["Date", "Month", "Reserve (10k oz)", "Reserve (tonnes)", "Monthly change (10k oz)", "Monthly change (tonnes)"]
    writer = csv.DictWriter(output, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({
            "Date": row["date"],
            "Month": row["month"],
            "Reserve (10k oz)": row["reserve_10k_oz"],
            "Reserve (tonnes)": row["reserve_tonnes"],
            "Monthly change (10k oz)": "" if row["monthly_change_10k_oz"] is None else row["monthly_change_10k_oz"],
            "Monthly change (tonnes)": "" if row["monthly_change_tonnes"] is None else row["monthly_change_tonnes"],
        })
    return output.getvalue()


def main() -> None:
    rows = build_rows()
    payload = {
        "source": "State Administration of Foreign Exchange (SAFE)",
        "source_url": INDEX_URL,
        "metric": "Official gold reserves and month-over-month physical change",
        "frequency": "Monthly",
        "reserve_unit": "10,000 fine troy ounces",
        "change_unit": "tonnes",
        "conversion": "1 fine troy ounce = 31.1034768 grams",
        "first_observation_date": rows[0]["date"],
        "first_change_date": rows[1]["date"],
        "as_of_date": rows[-1]["date"],
        "observations": len(rows),
        "dates": [row["date"] for row in rows],
        "reserve_10k_oz": [row["reserve_10k_oz"] for row in rows],
        "reserve_tonnes": [row["reserve_tonnes"] for row in rows],
        "monthly_change_10k_oz": [row["monthly_change_10k_oz"] for row in rows],
        "monthly_change_tonnes": [row["monthly_change_tonnes"] for row in rows],
    }
    json_content = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    csv_content = serialize_csv(rows)
    write_atomic(OUTPUT_JSON, json_content)
    write_atomic(OUTPUT_CSV, csv_content)
    latest = rows[-1]
    print(
        f"SAFE gold reserves updated: {len(rows)} months, {rows[0]['month']} to {latest['month']}, "
        f"latest change {latest['monthly_change_tonnes']:+.3f} tonnes"
    )


if __name__ == "__main__":
    main()
