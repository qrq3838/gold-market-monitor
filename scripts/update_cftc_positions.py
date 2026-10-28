"""COMEX gold managed-money positions, CFTC Disaggregated Futures Only."""
import argparse
import csv
import io
import json
import zipfile
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from market_data_utils import DATA, CACHE, fetch, save_dataset, validate_dates

CODE = "088691"
STEM = "cftc_gold_positions"
PAGE = "https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm"
START_YEAR = 2012

def parse_archive(content):
    with zipfile.ZipFile(io.BytesIO(content)) as z:
        names = [n for n in z.namelist() if n.lower().endswith(".txt")]
        if len(names) != 1:
            raise ValueError("Expected one CFTC text file")
        reader = csv.DictReader(io.StringIO(z.read(names[0]).decode("utf-8-sig")))
        rows = {}
        for r in reader:
            if r["CFTC_Contract_Market_Code"].strip() != CODE:
                continue
            if r["FutOnly_or_Combined"].strip() != "FutOnly" or "GOLD - COMMODITY EXCHANGE" not in r["Market_and_Exchange_Names"]:
                raise ValueError("Wrong CFTC contract/report")
            day = (r.get("Report_Date_as_YYYY-MM-DD") or r.get("Report_Date_as_MM_DD_YYYY") or "").strip()
            date.fromisoformat(day)
            row = {
                "open_interest": int(r["Open_Interest_All"]),
                "managed_long": int(r["M_Money_Positions_Long_All"]),
                "managed_short": int(r["M_Money_Positions_Short_All"]),
                "managed_spreading": int(r["M_Money_Positions_Spread_All"]),
            }
            if row["open_interest"] <= 0 or any(v < 0 or v > row["open_interest"] for v in row.values()):
                raise ValueError(f"Invalid CFTC position: {day}")
            if day in rows:
                raise ValueError(f"Duplicate CFTC report: {day}")
            rows[day] = row
        if len(rows) < 1:
            raise ValueError("COMEX gold is missing")
        return rows

def download_year(year, refresh=False):
    path = CACHE / f"cftc_{year}.zip"
    content = fetch(f"https://www.cftc.gov/files/dea/history/fut_disagg_txt_{year}.zip", path.name) if refresh or not path.exists() else path.read_bytes()
    rows = parse_archive(content)
    if any(int(day[:4]) != year for day in rows):
        raise ValueError(f"Wrong CFTC archive year: {year}")
    return rows

def calculate(rows):
    dates = sorted(rows)
    validate_dates(dates)
    series = {key: [rows[d][key] for d in dates] for key in ("open_interest", "managed_long", "managed_short", "managed_spreading")}
    net = [a-b for a,b in zip(series["managed_long"], series["managed_short"])]
    ratios = [100*n/o for n,o in zip(net,series["open_interest"])]
    series["net_long"] = net
    series["net_long_pct_oi"] = [round(v,6) for v in ratios]
    series["percentile_156_reports"] = [None if i<155 else round(100*sum(v<=ratios[i] for v in ratios[i-155:i+1])/156,6) for i in range(len(dates))]
    for source, target in (("managed_long","long_change"),("managed_short","short_change"),("net_long","net_change")):
        series[target] = [None]
        for i in range(1,len(dates)):
            gap = (date.fromisoformat(dates[i])-date.fromisoformat(dates[i-1])).days
            series[target].append(series[source][i]-series[source][i-1] if gap==7 else None)
    return dates,series

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir",type=Path,default=DATA)
    parser.add_argument("--full-refresh",action="store_true")
    args=parser.parse_args()
    path=args.output_dir/(STEM+".json")
    previous=json.loads(path.read_text()) if path.exists() else {}
    rows={}
    if previous and not args.full_refresh:
        for i,day in enumerate(previous["dates"]):
            rows[day]={k:previous["series"][k][i] for k in ("open_interest","managed_long","managed_short","managed_spreading")}
        years=[date.today().year]
        if date.today().month <= 2: years.insert(0,date.today().year-1)
    else:
        years=list(range(START_YEAR,date.today().year+1))
    with ThreadPoolExecutor(max_workers=3) as pool:
        batches=list(pool.map(lambda y:download_year(y, y==date.today().year or args.full_refresh),years))
    for batch in batches: rows.update(batch)
    dates,series=calculate(rows)
    if previous and dates[-1]<previous["as_of_date"]:
        raise ValueError("CFTC freshness regressed")
    if len(dates)<500:
        raise ValueError("CFTC history unexpectedly short")
    payload={
        "schema_version":1,"title":"COMEX gold managed-money positions",
        "source_page":PAGE,"contract_market_code":CODE,"report_type":"Disaggregated Futures Only",
        "frequency":"Weekly","units":"contracts; percent","as_of_date":dates[-1],
        "observation_count":len(dates),"dates":dates,"series":series,
        "methodology":{
            "net_long":"Managed Money long minus short; spreading positions excluded from net.",
            "net_long_pct_oi":"100 * net long / total COMEX gold futures open interest.",
            "percentile_156_reports":"Percentage of the most recent 156 reports, including current, with net/OI <= current net/OI. Null before 156 reports.",
            "changes":"Difference from prior report only when report dates are seven days apart; no interpolation.",
            "release":"Report dates are position dates, usually Tuesday. Usually published Friday 15:30 US Eastern; holidays and delays can change release."
        }}
    save_dataset(STEM,payload,list(series),args.output_dir)
    print(f"CFTC {dates[0]}..{dates[-1]}, {len(dates)} reports; net={series['net_long'][-1]}, net/OI={series['net_long_pct_oi'][-1]:.2f}%")
if __name__=="__main__": main()
