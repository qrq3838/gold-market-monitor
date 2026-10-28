"""Offline formula, schema, CSV and integration checks; run after all updaters."""
import csv
import io
import json
import math
import sys
import unittest
import zipfile
from datetime import date,timedelta
from html.parser import HTMLParser
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from update_cftc_positions import calculate as cftc,parse_archive
from update_yield_decomposition import calculate as yields
from update_gold_risk import calculate as risk

class FormulaTests(unittest.TestCase):
    def test_cftc_net_and_percentile(self):
        rows={}
        for i in range(160):
            rows[(date(2020,1,7)+timedelta(days=7*i)).isoformat()]={"open_interest":1000,"managed_long":100+i,"managed_short":200,"managed_spreading":20}
        dates,s=cftc(rows)
        self.assertEqual(s["net_long"][0],-100)
        self.assertEqual(s["net_long_pct_oi"][0],-10)
        self.assertIsNone(s["percentile_156_reports"][154])
        self.assertEqual(s["percentile_156_reports"][155],100)
        self.assertEqual(s["long_change"][1],1)
        self.assertEqual(s["short_change"][1],0)
        self.assertEqual(s["net_change"][1],1)
        rows.pop(dates[5])
        _,s=cftc(rows)
        self.assertIsNone(s["net_change"][5])
    def test_cftc_old_header(self):
        text="CFTC_Contract_Market_Code,FutOnly_or_Combined,Market_and_Exchange_Names,Report_Date_as_MM_DD_YYYY,Open_Interest_All,M_Money_Positions_Long_All,M_Money_Positions_Short_All,M_Money_Positions_Spread_All\n088691,FutOnly,GOLD - COMMODITY EXCHANGE INC.,2012-12-31,1000,400,200,50\n"
        b=io.BytesIO()
        with zipfile.ZipFile(b,"w") as z:z.writestr("f_year.txt",text)
        self.assertEqual(parse_archive(b.getvalue())["2012-12-31"]["managed_long"],400)
    def test_yield_common_dates_and_bp(self):
        raw={key:{} for key in ["DGS10","DFII10","T10YIE"]}
        for i in range(30):
            d=(date(2020,1,1)+timedelta(days=i)).isoformat()
            for k,v in [("DGS10",3+i*.02),("DFII10",1+i*.01),("T10YIE",2+i*.01)]:raw[k][d]=v
        raw["DFII10"].pop("2020-01-05")
        dates,s,diff=yields(raw)
        self.assertNotIn("2020-01-05",dates)
        self.assertEqual(s["nominal_change_20d_bp"][20],42)
        self.assertEqual(s["real_change_20d_bp"][20],21)
        self.assertEqual(s["breakeven_change_20d_bp"][20],21)
        self.assertIsNone(s["real_change_20d_bp"][19])
        self.assertLess(diff,1e-10)
    def test_yield_inconsistent_source_rejected(self):
        raw={"DGS10":{"2020-01-01":4},"DFII10":{"2020-01-01":2},"T10YIE":{"2020-01-01":3}}
        with self.assertRaises(ValueError):yields(raw)
    def test_risk_windows(self):
        s=risk([100.]*251+[80.])
        self.assertIsNone(s["drawdown_252d_percent"][250])
        self.assertEqual(s["drawdown_252d_percent"][251],-20)
        self.assertIsNone(s["volatility_20d_annualized_percent"][19])
        self.assertEqual(s["volatility_20d_annualized_percent"][20],0)
        r=math.log(.8)
        expected=math.sqrt((19*(r/20)**2+(r-r/20)**2)/19)*math.sqrt(252)*100
        self.assertAlmostEqual(s["volatility_20d_annualized_percent"][-1],expected,places=5)
    def test_risk_invalid_price(self):
        for prices in [[100,0],[100,-1],[100,float("nan")]]:
            with self.assertRaises(ValueError):risk(prices)
    def test_risk_rolling_peak_expires(self):
        s=risk([200.]+[100.]*252)
        self.assertEqual(s["drawdown_252d_percent"][251],-50)
        self.assertEqual(s["drawdown_252d_percent"][252],0)

class DataTests(unittest.TestCase):
    def payload(self,stem):return json.loads((ROOT/"data"/(stem+".json")).read_text(encoding="utf-8"))
    def test_schema_and_csv(self):
        for stem in ["cftc_gold_positions","us_yield_decomposition","comex_gold_risk"]:
            j=self.payload(stem);dates=j["dates"]
            self.assertEqual(dates,sorted(set(dates)))
            self.assertEqual(j["as_of_date"],dates[-1])
            self.assertEqual(j["observation_count"],len(dates))
            self.assertLessEqual(date.fromisoformat(dates[-1]),date.today())
            with (ROOT/"data"/(stem+".csv")).open(encoding="utf-8-sig",newline="") as handle:
                rows=list(csv.DictReader(handle))
            self.assertEqual([r["date"] for r in rows],dates)
            for key,values in j["series"].items():
                self.assertEqual(len(values),len(dates))
                for r,v in zip(rows,values):
                    if v is None:self.assertEqual(r[key],"")
                    else:
                        self.assertTrue(math.isfinite(v))
                        self.assertAlmostEqual(float(r[key]),v,places=8)
    def test_cftc_recompute(self):
        j=self.payload("cftc_gold_positions")
        rows={d:{k:j["series"][k][i] for k in ["open_interest","managed_long","managed_short","managed_spreading"]} for i,d in enumerate(j["dates"])}
        dates,s=cftc(rows)
        self.assertEqual(s,j["series"])
        self.assertGreater(len(dates),500)
    def test_yield_identity(self):
        s=self.payload("us_yield_decomposition")["series"]
        for n,r,b in zip(s["nominal_percent"],s["real_percent"],s["breakeven_percent"]):self.assertAlmostEqual(n,r+b,places=6)
        for n,r,b in zip(s["nominal_change_20d_bp"][20:],s["real_change_20d_bp"][20:],s["breakeven_change_20d_bp"][20:]):self.assertAlmostEqual(n,r+b,places=6)
    def test_gold_risk_source_and_recompute(self):
        j=self.payload("comex_gold_risk");gold=self.payload("comex_gold_futures")
        self.assertEqual(j["dates"],gold["dates"])
        self.assertEqual(j["as_of_date"],gold["as_of_date"])
        self.assertEqual(j["series"],risk(gold["values"]))
        self.assertTrue(all(v is None or -100<v<=0 for v in j["series"]["drawdown_252d_percent"]))
    def test_site_local_links_and_ids(self):
        class Parser(HTMLParser):
            def __init__(self):super().__init__();self.ids=[];self.links=[]
            def handle_starttag(self,tag,attrs):
                a=dict(attrs)
                if "id" in a:self.ids.append(a["id"])
                for k in ["href","src"]:
                    if k in a:self.links.append(a[k])
        p=Parser();p.feed((ROOT/"index.html").read_text(encoding="utf-8"))
        self.assertEqual(len(p.ids),len(set(p.ids)))
        for link in p.links:
            if link.startswith(("data/","assets/")):self.assertTrue((ROOT/link).is_file(),link)
            if link.startswith("#"):self.assertIn(link[1:],p.ids)
        js=(ROOT/"assets/research-modules.js").read_text(encoding="utf-8")
        for stem in ["cftc_gold_positions","us_yield_decomposition","comex_gold_risk"]:self.assertIn(stem,js)

if __name__=="__main__":unittest.main(verbosity=2)
