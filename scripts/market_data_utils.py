"""Shared, standard-library-only helpers for audited dashboard datasets."""
import csv
import io
import json
import math
import os
import tempfile
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = Path(os.environ.get("GOLD_CACHE_DIR", ROOT / "work" / "source_cache"))
USER_AGENT = "gold-market-monitor/2.0 (+https://github.com/qrq3838/gold-market-monitor)"

def fetch(url, cache_name=None):
    error = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "*/*"})
            with urllib.request.urlopen(req, timeout=75) as response:
                if response.status != 200:
                    raise ValueError(f"HTTP {response.status}: {url}")
                content = response.read()
            if cache_name:
                atomic_write(CACHE / cache_name, content)
            return content
        except Exception as exc:
            error = exc
            if getattr(exc, "code", None) in (401, 403, 404):
                break
            time.sleep(attempt + 1)
    raise RuntimeError(f"Source download failed: {url}: {error}")

def atomic_write(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if isinstance(content, str):
        content = content.encode("utf-8")
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
        handle.write(content)
        temporary = Path(handle.name)
    os.replace(temporary, path)

def validate_dates(dates):
    if not dates or any(a >= b for a, b in zip(dates, dates[1:])):
        raise ValueError("Dates must be nonempty, unique and strictly increasing")
    from datetime import date
    for day in dates:
        if date.fromisoformat(day) > datetime.now(timezone.utc).date():
            raise ValueError(f"Future observation: {day}")

def save_dataset(stem, payload, columns, output_dir=DATA):
    output_dir = Path(output_dir)
    validate_dates(payload["dates"])
    n = len(payload["dates"])
    for key, values in payload["series"].items():
        if len(values) != n:
            raise ValueError(f"Length mismatch: {key}")
        if any(v is not None and not math.isfinite(v) for v in values):
            raise ValueError(f"Nonfinite value: {key}")
    path = output_dir / (stem + ".json")
    previous = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    identity = {k: v for k, v in previous.items() if k != "downloaded_at_utc"}
    if identity == payload:
        downloaded = previous.get("downloaded_at_utc")
    else:
        downloaded = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    payload = {**payload, "downloaded_at_utc": downloaded}
    out = io.StringIO(newline="")
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(["date", *columns])
    for i, day in enumerate(payload["dates"]):
        writer.writerow([day, *[payload["series"][key][i] for key in columns]])
    atomic_write(path, json.dumps(payload, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n")
    atomic_write(output_dir / (stem + ".csv"), out.getvalue())
    return payload
