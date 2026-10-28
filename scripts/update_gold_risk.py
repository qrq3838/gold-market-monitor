"""Close-based trailing drawdown and 20-return annualised volatility for GC=F."""
import argparse
import json
import math
import statistics
from pathlib import Path
from market_data_utils import DATA,save_dataset,validate_dates
STEM="comex_gold_risk"

def calculate(values):
    if any(not math.isfinite(v) or v<=0 for v in values):raise ValueError("Invalid gold close")
    returns=[None]+[math.log(values[i]/values[i-1]) for i in range(1,len(values))]
    drawdown=[None if i<251 else round(100*(v/max(values[i-251:i+1])-1),6) for i,v in enumerate(values)]
    volatility=[None if i<20 else round(statistics.stdev(returns[i-19:i+1])*math.sqrt(252)*100,6) for i in range(len(values))]
    return {"close":values,"drawdown_252d_percent":drawdown,"volatility_20d_annualized_percent":volatility}

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument("--output-dir",type=Path,default=DATA);a=p.parse_args()
    source=json.loads((a.output_dir/"comex_gold_futures.json").read_text(encoding="utf-8"))
    if source.get("symbol")!="GC=F" or len(source["dates"])!=len(source["values"]):raise ValueError("Wrong gold source")
    validate_dates(source["dates"]);series=calculate(source["values"])
    payload={
        "schema_version":1,"title":"COMEX gold drawdown and realised volatility","frequency":"Daily","units":"percent; USD/oz",
        "symbol":"GC=F","source_file":"comex_gold_futures.json","source_as_of_date":source["as_of_date"],
        "source_page":"https://finance.yahoo.com/quote/GC%3DF/history/","as_of_date":source["as_of_date"],
        "observation_count":len(source["dates"]),"dates":source["dates"],"series":series,
        "methodology":{
            "drawdown":"100 * (close / maximum of trailing 252 valid closes including today - 1). Null until 252 closes. This is distance below trailing high, not window maximum drawdown.",
            "volatility":"Sample standard deviation (ddof=1) of trailing 20 daily log returns * sqrt(252) * 100. Requires 21 closes.",
            "missing":"No interpolation; windows count valid trading observations.",
            "contract":"GC=F unadjusted continuous close includes contract rolls; measures quoted-price risk, not a fixed-expiry strategy return."
        }}
    save_dataset(STEM,payload,list(series),a.output_dir)
    print(f"Gold risk {payload['as_of_date']}: drawdown={series['drawdown_252d_percent'][-1]:.2f}%, vol20={series['volatility_20d_annualized_percent'][-1]:.2f}%")
if __name__=="__main__":main()
