# 黄金市场监测

公开网页：[https://qrq3838.github.io/gold-market-monitor/](https://qrq3838.github.io/gold-market-monitor/)

当前页面展示世界黄金协会的全球实物黄金 ETF 地区资金流数据，支持：

- 吨数和美元两种口径；
- 年度、季度、月度和周度四种频率；
- 北美、欧洲、亚洲和其他地区的交互式堆叠柱状图；
- 日期选择、快捷时间范围、地区显示切换和图表缩放；
- CSV、JSON 数据下载；
- GitHub Actions 工作日自动检查源数据更新。

## 数据文件

- `data/gold_etf_flows_by_region.json`：网页使用的紧凑结构化数据；
- `data/gold_etf_flows_by_region.csv`：长表格式，字段为频率、日期、地区、美元资金流和吨数需求；
- 两个文件均明确排除了 `Gold Price (rhs)` 金价序列。

## 本地更新

```powershell
python scripts/update_data.py
```

数据来源：[World Gold Council — Gold ETFs, holdings and flows](https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows)

本项目仅供研究交流，不构成任何投资建议。
