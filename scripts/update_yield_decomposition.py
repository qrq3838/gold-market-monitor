"""Official FRED 10-year nominal/real/breakeven yields and 20-observation changes."""
import argparse
import csv
import io
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from market_data_utils import DATA,fetch,save_dataset,validate_dates

STEM="us_yield_decomposition"
IDS=("DGS10","DFII10","T10YIE")
def get_series(series_id):
    url=f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series_id}&cosd=2003-01-01"
    raw=fetch(url,f"fred_{series_id}.csv").decode("utf-8-sig")
    reader=csv.DictReader(io.StringIO(raw))
    if not reader.fieldnames or series_id not in reader.fieldnames:
        raise ValueError(f"Unexpected FRED columns: {series_id}")
    date_key=next((k for k in ("observation_date","DATE","date") if k in reader.fieldnames),None)
    if not date_key:raise ValueError("No FRED date column")
    rows={}
    for r in reader:
        if r[series_id] in ("","."):continue
        day=r[date_key];v=float(r[series_id])
        if day in rows or not -10<v<25:raise ValueError(f"Invalid {series_id} observation {day}")
        rows[day]=v
    validate_dates(sorted(rows))
    if len(rows)<5000:raise ValueError(f"Short FRED history: {series_id}")
    return rows

def calculate(raw):
    dates=sorted(set.intersection(*(set(raw[k]) for k in IDS)))
    validate_dates(dates)
    series={
        "nominal_percent":[raw["DGS10"][d] for d in dates],
        "real_percent":[raw["DFII10"][d] for d in dates],
        "breakeven_percent":[round(raw["DGS10"][d]-raw["DFII10"][d],6) for d in dates],
        "fred_t10yie_percent":[raw["T10YIE"][d] for d in dates],
    }
    max_difference=max(abs(a-b) for a,b in zip(series["breakeven_percent"],series["fred_t10yie_percent"]))
    if max_difference>0.051:raise ValueError(f"FRED decomposition differs by {max_difference:.4f} pp")
    for src,dst in (("nominal_percent","nominal_change_20d_bp"),("real_percent","real_change_20d_bp"),("breakeven_percent","breakeven_change_20d_bp")):
        series[dst]=[None if i<20 else round(100*(series[src][i]-series[src][i-20]),6) for i in range(len(dates))]
    return dates,series,max_difference

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--output-dir",type=Path,default=DATA);a=p.parse_args()
    with ThreadPoolExecutor(max_workers=3) as pool:raw=dict(zip(IDS,pool.map(get_series,IDS)))
    dates,series,difference=calculate(raw)
    payload={
        "schema_version":1,"title":"US 10-year yield decomposition","frequency":"Daily","units":"percent; basis points",
        "as_of_date":dates[-1],"source_series_as_of":{k:max(v) for k,v in raw.items()},
        "source_pages":{k:f"https://fred.stlouisfed.org/series/{k}" for k in IDS},
        "observation_count":len(dates),"dates":dates,"series":series,
        "max_t10yie_reconciliation_pp":round(difference,6),
        "methodology":{
            "scope":"FRED official data since 2003, independent of the existing user-Excel DFII10 historical baseline.",
            "alignment":"Intersection of dates having all three official series. No forward fill or interpolation.",
            "decomposition":"Nominal DGS10 = real DFII10 + breakeven (DGS10-DFII10); independently checked against published T10YIE.",
            "breakeven":"Market inflation compensation; also contains inflation-risk and liquidity premia.",
            "changes":"Current minus 20 common valid observations earlier, multiplied by 100 to basis points. First 20 are null."
        }}
    old=a.output_dir/(STEM+".json")
    if old.exists() and json.loads(old.read_text())["as_of_date"]>dates[-1]:raise ValueError("FRED freshness regressed")
    save_dataset(STEM,payload,list(series),a.output_dir)
    print(f"Yield decomposition {dates[0]}..{dates[-1]}, {len(dates)} common dates; nominal={series['nominal_percent'][-1]:.2f}, real={series['real_percent'][-1]:.2f}, breakeven={series['breakeven_percent'][-1]:.2f}")
if __name__=="__main__":main()
