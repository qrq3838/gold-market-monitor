# 黄金市场监测

公开网页：[https://qrq3838.github.io/gold-market-monitor/](https://qrq3838.github.io/gold-market-monitor/)

当前页面展示世界黄金协会的全球实物黄金 ETF 地区资金流和持仓数据，支持：

- 吨数和美元两种口径；
- 年度、季度、月度和周度四种频率；
- 北美、欧洲、亚洲和其他地区的交互式资金流堆叠柱状图；
- 同样按地区拆分的持仓堆叠面积图，支持持仓吨数和管理资产规模；
- 两幅图都包含右轴金价曲线；
- 日期选择、快捷时间范围、地区显示切换和图表缩放；
- CSV、JSON 数据下载；
- GitHub Actions 工作日自动检查源数据更新。

## 数据文件

- `data/gold_etf_flows_by_region.json`：网页使用的紧凑结构化数据；
- `data/gold_etf_flows_by_region.csv`：长表格式，字段为频率、日期、地区、美元资金流和吨数需求；
- `data/gold_etf_holdings_by_region.json`：网页持仓图使用的结构化数据；
- `data/gold_etf_holdings_by_region.csv`：持仓长表，包含频率、日期、地区、美元管理资产、持仓吨数和金价；
- `data/gold_price_by_frequency.csv`：年度、季度、月度和周度金价，单位为美元/金衡盎司。

## 本地更新

```powershell
python scripts/update_data.py
```

数据来源：[World Gold Council — Gold ETFs, holdings and flows](https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows)

本项目仅供研究交流，不构成任何投资建议。
