# 黄金市场监测：模块、数据源与日更逻辑

更新日期：2026-10-28

- 网站：https://qrq3838.github.io/gold-market-monitor/
- GitHub 发布源：https://github.com/qrq3838/gold-market-monitor ，分支 main。
- 服务器镜像：F:\res4\rqqin\strategy research\gold
- 定时检查：每天北京时间 22:40（UTC 14:40）；源数据日期以各 JSON 的 as_of_date 为准。
- 本次范围：新增 CFTC 仓位、实际利率分解、金价回撤和波动率。全球央行月度净购金按用户要求暂缓，保留已有季度储备与中国月度购金。

## 1. 页面模块

JSON 用于绘图，同名 CSV 用于下载。下表文件均位于 data/，扩展名为 .json / .csv。

| 顺序 | 模块与文件名 | 数据源、口径 | 频率 |
|---|---|---|---|
| 1 | COMEX 金价：comex_gold_futures | Yahoo GC=F Close，美元/金衡盎司；MA5/20/60/120 可选 | 日 |
| 2 | CFTC 仓位：cftc_gold_positions | COMEX GOLD 088691；Disaggregated Futures Only；Managed Money | 周 |
| 3 | 实际利率分解：us_yield_decomposition | FRED DGS10、DFII10、T10YIE；名义、实际及盈亏平衡通胀率 | 日 |
| 4 | 金价回撤与波动：comex_gold_risk | 由同一份 GC=F Close 计算 252 日高点回撤、20 日年化波动率 | 日 |
| 5 | 中国央行购金：pboc_gold_reserve_changes | SAFE 月末黄金实物存量变化，吨 | 月 |
| 6 | 全球央行储备：central_bank_gold_reserves_by_region | WGC 123 个地理经济体、11 地区，季度末吨数；可扣除美国 | 季 |
| 7 | ETF 资金流：gold_etf_flows_by_region | WGC，北美/欧洲/亚洲/其他；吨/美元 | 年/季/月/周 |
| 8 | ETF 持仓：gold_etf_holdings_by_region | WGC，地区持仓吨数/资产规模 | 年/季/月/周 |
| 9 | 原实际利率：us_10y_real_yield | 用户历史 Excel + FRED DFII10，% | 日 |
| 10 | 美元指数：us_dollar_index | Yahoo DX-Y.NYB Close，指数点 | 日 |

每个指标模块支持日期筛选、快捷区间、图例开关及可选的 COMEX 右轴叠加。新模块由 assets/research-modules.js 绘制，保留原七个模块的代码和交互。

## 2. 数据源

- COMEX：https://finance.yahoo.com/quote/GC%3DF/history/
- 美元指数：https://finance.yahoo.com/quote/DX-Y.NYB/history/
- CFTC 历史报告：https://www.cftc.gov/MarketReports/CommitmentsofTraders/HistoricalCompressed/index.htm
- CFTC 年度文件：https://www.cftc.gov/files/dea/history/fut_disagg_txt_2026.zip （年份随更新变化）
- CFTC 口径：https://www.cftc.gov/MarketReports/CommitmentsofTraders/DisaggregatedExplanatoryNotes/index.htm
- 名义利率：https://fred.stlouisfed.org/series/DGS10
- 实际利率：https://fred.stlouisfed.org/series/DFII10
- 盈亏平衡通胀率：https://fred.stlouisfed.org/series/T10YIE
- FRED CSV：https://fred.stlouisfed.org/graph/fredgraph.csv?id=DGS10&cosd=2003-01-01 （替换序列 ID 获取另两项）
- SAFE：https://www.safe.gov.cn/safe/gfcbzc/index.html
- WGC ETF：https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows
- WGC 央行储备：https://www.gold.org/goldhub/data/gold-reserves-by-country

DGS10、DFII10 原始发布为美联储 H.15，经 FRED 提供；T10YIE 来源为圣路易斯联储。源数据可能修订。

## 3. 新增指标的计算

### CFTC 管理基金仓位

- 读取 2012 年以来 Disaggregated Futures Only 年度 ZIP，仅保留合约代码 088691。
- 原始字段：Open_Interest_All、M_Money_Positions_Long_All、M_Money_Positions_Short_All、M_Money_Positions_Spread_All。
- 净多头 = 多头 − 空头；净多占比 = 100 × 净多头 / 全市场期货总持仓。
- 156 期历史分位 = 最近 156 份报告中净多占比小于等于当期的数量 / 156 × 100；窗口含当期，前 155 期为空。分位只用于描述拥挤程度。
- 多头、空头、净多周变化均为前后报告之差。相邻日期相差 7 天才计算；假日变更持仓日期或缺报导致其他间隔时留空。
- 净多头不计入套利仓位；该报告不含期权，不能与 futures-and-options combined 数据混用。
- 横轴是持仓日期，通常为周二；常规公布时间为周五美国东部时间 15:30，节假日及延迟会改变公布时间。周二的点不能当作当天可获得的交易信号。
- 日常重新获取本年度文件，1–2 月同时回看前一年；已存历史保留。全历史修订可加 --full-refresh。
- 兼容旧档案日期字段 Report_Date_as_MM_DD_YYYY 和新字段 Report_Date_as_YYYY-MM-DD；字段内容按 ISO 日期核验。

### 美国 10 年期利率分解

- 直接使用 FRED 自 2003-01-02 起的三项官方序列，与原用户 Excel 基线模块分别存储。
- 使用三项都有有效观测的日期交集，不插值、不前向填充。
- 名义利率 = 实际利率 + 盈亏平衡通胀率；图上的盈亏平衡通胀率由 DGS10 − DFII10 计算，并与官方 T10YIE 独立核对。
- 保存 official T10YIE 和逐源末日；差异超过 0.051 个百分点则报错。
- 20 日变化 = 当期 − 20 个共同有效观测日前的值，再乘 100 转为 bp。前 20 期留空。
- 盈亏平衡通胀率是市场通胀补偿，其中含通胀风险和流动性溢价。
- 下图实际利率与通胀补偿的变化采用有符号叠加，总和等于名义利率变化线。
- 日更重新下载三项公开历史，吸收官方修订，防止日期倒退。

### COMEX 回撤与波动率

- 当前回撤（%）= 100 ×（当天 Close / 最近 252 个有效交易日最高 Close − 1）。
- 该值表示当前距一年滚动高点的跌幅；前 251 个收盘观测为空。
- 20 日年化波动率（%）= 最近 20 个日对数收益率的样本标准差（ddof=1）× √252 × 100；需要 21 个收盘价。
- 基于完整历史先计算，再截取用户展示区间，改变筛选日期不改变同一天的指标值。
- 必须在 update_comex_gold.py 成功后运行，指标日期与金价日期完全一致。
- GC=F 连续期货 Close 包含换月影响；这里衡量报价序列的波动。

## 4. 保留模块的更新规则

- COMEX / 美元指数：Yahoo Chart API query1/query2 双主机；校验标的、日期、OHLC 数组、价格合理性。排除 Close 为空、当前未结束交易日及接口附加的盘中报价；有效日不插值。COMEX CSV 保留源站早期 OHLC 的换月差异，网页只用 Close。
- MA：前端对全历史 Close 计算 N 个有效交易日简单平均，N=5/20/60/120；窗口不足留空；默认关闭。
- ETF：WGC flows-chart2 / holdings-chart2；四频率、四地区；两份 JSON 的 as_of_date 必须一致。美元图单位为十亿美元。WGC 原附带金价继续保存，但网页金价统一使用 COMEX。
- 全球季度央行储备：getFilters + getPage，periodicity=QTD_FULL，gold_reserves_tns。123 个有地区分类的经济体按 11 地区加总，多边机构不计入地理合计。AWAITED 沿用该经济体此前最近已报库存，首次报告前不回填。扣除美国只影响 North America 和全球总量；差额逐季等于 USA。
- SAFE：中国央行从 2016-01 实物存量开始；基准月变化留空。相邻月份“万盎司”差分 × 0.311034768 = 吨；校验 USD/SDR 重复列一致，不使用美元估值推算购买量。
- 原 DFII10 模块：保留用户 Excel 作为早期历史基线；追加 FRED 新日，回看最近 35 个日历日吸收修订。Excel 初始覆盖 2003-01-02 至 2026-08-07，5,904 条；最新日期以现有 JSON 为准。

## 5. COMEX 叠加

assets/gold-overlay.js 缓存一次 COMEX JSON 请求。每个指标日期匹配当天或此前最近有效 COMEX 收盘价，无未来匹配；早于金价首日的日期为空。代码没有最大回溯天数硬限制，因此需同时检查基础金价末日。关闭金价开关后，相应曲线、右轴及提示关闭。独立 COMEX 图不重复叠加。

## 6. 自动更新和验证

.github/workflows/update-data.yml 每天北京时间 22:40 运行，也可 workflow_dispatch。依次执行：

1. update_data.py
2. update_central_bank_reserves.py
3. update_pboc_gold_reserves.py
4. update_real_yield.py
5. update_comex_gold.py
6. update_dollar_index.py
7. update_cftc_positions.py
8. update_yield_decomposition.py
9. update_gold_risk.py
10. python -m unittest discover -s tests -v

脚本、校验均成功后，工作流只提交明确列出的数据文件。任一步失败，工作流停止发布，GitHub 上保留上一份完整数据。无真实数据变化时不制造新提交。CSV/JSON 采用同目录临时文件原子替换；数据集没有变化时保留下载时间。

tests/test_research_modules.py 验证净头寸与分位、旧表头、日期断档、利率勾稽、bp 换算、回撤窗口、样本波动率、缺失窗口、JSON/CSV 一致性、金价源一致性及网页本地链接。

新增脚本只用 Python 标准库；无需 CFTC/FRED API 密钥。原始下载缓存放在 GOLD_CACHE_DIR 指定目录，默认 work/source_cache/，不进入 Git。

## 7. 日更与服务器同步

正式更新环境为 GitHub Actions。服务器 Yahoo 可能返回 HTTP 403；保留已验证数据，转由 Actions 更新，不关闭 HTTPS 验证、不写盘中替代值。

GitHub Actions 不会自动同步内网服务器。Actions、Pages 成功后，从固定提交 SHA 获取变更文件，先写入服务器同目录临时文件，再原子替换并核对 SHA-256。服务器保留 work/ 缓存、开发副本、日志及备份，不覆盖其他研究文件。

服务器计算必须使用 F:\res4\rqqin\anaconda3\python.exe。连接使用固定 rqqin-server-connect 环境；禁止临时安装连接依赖。开发前检查项目 AGENTS.md。保留本机仓库已有未提交改动，数据加工留在服务器。

本机黄金监测目录只同步本文、交接文档等最终交付文件。各指标最新观测日期不同：每日检查低频源不代表每日新增观测。
