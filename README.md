# 黄金市场监测

公开网页：[https://qrq3838.github.io/gold-market-monitor/](https://qrq3838.github.io/gold-market-monitor/)

当前页面展示 COMEX 黄金期货、全球实物黄金 ETF 地区资金流与持仓、美国实际利率和美元指数，支持：

- COMEX 黄金期货（Yahoo Finance GC=F）完整日度收盘曲线；
- 吨数和美元两种口径；
- 年度、季度、月度和周度四种频率；
- 北美、欧洲、亚洲和其他地区的交互式资金流堆叠柱状图；
- 同样按地区拆分的持仓堆叠面积图，支持持仓吨数和管理资产规模；
- ETF 资金流与持仓图都叠加可开关的 COMEX 金价右轴；
- 美国 10 年期通胀保值国债实际收益率（FRED DFII10）日度曲线，并叠加可开关的 COMEX 金价右轴；
- 美元指数（Yahoo Finance DX-Y.NYB）日度收盘曲线，并叠加可开关的 COMEX 金价右轴；
- 日期选择、快捷时间范围、地区显示切换和图表缩放；
- CSV、JSON 数据下载；
- GitHub Actions 工作日自动检查源数据更新。

## 数据文件

- `data/gold_etf_flows_by_region.json`：网页使用的紧凑结构化数据；
- `data/gold_etf_flows_by_region.csv`：长表格式，字段为频率、日期、地区、美元资金流和吨数需求；
- `data/gold_etf_holdings_by_region.json`：网页持仓图使用的结构化数据；
- `data/gold_etf_holdings_by_region.csv`：持仓长表，包含频率、日期、地区、美元管理资产、持仓吨数和金价；
- `data/gold_price_by_frequency.csv`：WGC 接口附带的年度、季度、月度和周度金价，仅作为源数据留存，不再用于网页曲线。
- `data/comex_gold_futures.json`、`data/comex_gold_futures.csv`：COMEX 连续黄金期货日度收盘及 OHLC、成交量数据。
- `data/us_10y_real_yield.json`、`data/us_10y_real_yield.csv`：美国 10 年期实际收益率日度数据。
- `data/us_dollar_index.json`、`data/us_dollar_index.csv`：美元指数日度收盘及 OHLC 数据。

## 本地更新

```powershell
python scripts/update_data.py
python scripts/update_real_yield.py
python scripts/update_comex_gold.py
python scripts/update_dollar_index.py
```

数据来源：[World Gold Council — Gold ETFs, holdings and flows](https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows)、[FRED DFII10](https://fred.stlouisfed.org/series/DFII10)、[Yahoo Finance GC=F](https://finance.yahoo.com/quote/GC%3DF/history/)、[Yahoo Finance DX-Y.NYB](https://finance.yahoo.com/quote/DX-Y.NYB/history/)

所有指标图的可选金价曲线统一读取 `GC=F`。网页按指标自身日期取当天或此前最近一个 COMEX 有效收盘价，不使用未来值；美元指数早于 2000-08-30 的历史区间不显示金价。

本项目仅供研究交流，不构成任何投资建议。
