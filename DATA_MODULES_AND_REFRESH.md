# 黄金市场监测网站：模块、数据源与日更逻辑

最后更新：2026-08-09

项目目录（服务器）：`F:\res4\rqqin\strategy research\gold`

公开网站：<https://qrq3838.github.io/gold-market-monitor/>

## 一、现有模块

| 模块 | 页面内容 | 指标口径 | 网站数据文件 | 原始数据源 | 更新频率 |
|---|---|---|---|---|---|
| COMEX 黄金期货价格 | 网页首张图，展示连续黄金期货日度收盘走势 | Yahoo Finance `GC=F`；单位：US$/oz；日频；图表使用 Close | `data/comex_gold_futures.json`、`data/comex_gold_futures.csv` | Yahoo Finance，交易所元数据为 COMEX | 工作日每日检查并更新 |
| Gold ETF flows by region | 北美、欧洲、亚洲、其他地区的资金流柱状图，并叠加金价曲线 | 资金流：美元或吨；金价：US$/oz；年、季、月、周四种频率 | `data/gold_etf_flows_by_region.json`、`data/gold_etf_flows_by_region.csv`、`data/gold_price_by_frequency.csv` | World Gold Council（WGC）Gold ETFs holdings and flows 页面，接口 `flows-chart2` | 工作日检查；源站有新一期数据时更新 |
| Gold ETFs holdings by region | 北美、欧洲、亚洲、其他地区的持仓堆叠面积图，并叠加金价曲线 | 持仓：吨或管理资产规模（美元）；金价：US$/oz；年、季、月、周四种频率 | `data/gold_etf_holdings_by_region.json`、`data/gold_etf_holdings_by_region.csv` | WGC Gold ETFs holdings and flows 页面，接口 `holdings-chart2` | 工作日检查；源站有新一期数据时更新 |
| 美国 10 年期国债实际收益率 | 美国 10 年期通胀保值国债（TIPS）恒定期限实际收益率曲线 | DFII10；单位：%；日频；非季调；非交易日缺失值不插值 | `data/us_10y_real_yield.json`、`data/us_10y_real_yield.csv` | 历史基线：用户提供的 Excel（表内标注美国财政部、Wind）；增量：FRED DFII10，美联储 H.15 | 工作日每日检查并增量更新 |
| 美元指数 | ICE 美元指数日度收盘走势 | Yahoo Finance `DX-Y.NYB`；单位：指数点；日频；图表使用 Close | `data/us_dollar_index.json`、`data/us_dollar_index.csv` | Yahoo Finance，交易所元数据为 ICE Futures | 工作日每日检查并更新 |

## 二、原始数据页面

- WGC ETF 数据：<https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows>
- FRED DFII10：<https://fred.stlouisfed.org/series/DFII10>
- FRED CSV：<https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10>
- Yahoo Finance COMEX 黄金期货：<https://finance.yahoo.com/quote/GC%3DF/history/>
- Yahoo Finance 美元指数：<https://finance.yahoo.com/quote/DX-Y.NYB/history/>

DFII10 的正式名称为“10 年期通胀保值美国国债恒定期限市场收益率”，原始发布机构为美联储，所属发布为 H.15 Selected Interest Rates。FRED 页面口径为 Percent、Daily、Not Seasonally Adjusted。

## 三、美国实际利率历史基线

- 基线文件：`美国_国债实际收益率_10年.xlsx`
- 本次实际读取位置：`D:\OneDrive - SAIF\RA\Li Feng\服务器\黄金监测\数据\美国_国债实际收益率_10年.xlsx`
- 工作表：`美国_国债实际收益率_10年`
- 有效观测：5,904 条
- 起止日期：2003-01-02 至 2026-08-07
- 最新值：2.40%
- 表内元数据：频率“日”、单位“%”、指标来源“美国财政部”，页尾标注“数据来源：Wind”

历史基线不会在日更时被 FRED 全量覆盖。这样既保留用户提供文件作为可追溯的初始版本，又能从 2026-08-07 以后稳定续接官方公开序列。

## 四、工作日日更逻辑

GitHub Actions 工作流位于 `.github/workflows/update-data.yml`，计划时间为每周一至周五 07:15 UTC（北京时间 15:15），也支持手工触发。

### 1. COMEX 黄金期货

1. `scripts/update_comex_gold.py` 通过 Yahoo Finance 图表接口下载 `GC=F` 全量日频历史；主接口失败时自动尝试 Yahoo 的备用图表主机。
2. 校验返回标的必须为 `GC=F`，交易所元数据为 COMEX，并校验时间戳与 OHLC、复权收盘、成交量数组对齐。
3. 剔除 Close 为空的缺失占位，不做插值；有效日期必须唯一、严格递增，价格必须为正且位于预设合理区间，成交量不得为负。
4. JSON 为网页使用的紧凑日期/收盘值序列；CSV 原样保留 Date、Open、High、Low、Close、Adjusted Close 和 Volume。
5. 当前有效覆盖范围为 2000-08-30 至 2026-08-07，共 6,508 条日度观测，最新收盘价为 US$4,340.70/oz。
6. Yahoo 的连续合约早期 OHLC 与结算 Close 存在换月口径差异：430 日的 Close 不在同日 High/Low 区间内，且 2009-11-23 的源站 High 低于 Low。网页只使用 Close；CSV 保留源站原值，不擅自修正。

### 2. ETF 资金流、持仓与金价

1. `scripts/update_data.py` 分别请求 WGC 的资金流接口和持仓接口。
2. 校验 `Yearly`、`Quarterly`、`Monthly`、`Weekly` 四种频率，校验地区名称、日期对齐、金价序列及资金流/持仓数据结构。
3. 资金流与持仓的 `as_of_date` 必须一致；不一致时任务失败，不覆盖为“看似成功”的混合快照。
4. 通过临时文件和原子替换写入 JSON/CSV；源数据没有变化时不制造无意义的数据提交。

### 3. 美国 10 年期实际收益率

1. `scripts/update_real_yield.py` 读取网站现有历史序列。
2. 从 FRED 官方 CSV 下载 DFII10 全量公开记录，仅保留可解析的数值观测；FRED 以 `.` 表示的缺失日被忽略，不做前值填充。
3. 对晚于当前末日的新日期执行追加。
4. 同时回看并覆盖最近 35 个日历日的重叠数据，以吸收 FRED 可能发布的近期修订；更早的 Excel 历史基线保持不变。
5. 写入前校验日期唯一、严格递增、观测数不少于 1,000，且数值位于合理范围 `(-10%, 20%)`。
6. 通过原子替换生成 `data/us_10y_real_yield.json` 和 `data/us_10y_real_yield.csv`；没有增量或修订时不产生提交。

### 4. 美元指数

1. `scripts/update_dollar_index.py` 通过 Yahoo Finance 图表接口下载 `DX-Y.NYB` 全量日频历史；主接口失败时自动尝试 Yahoo 的备用图表主机。
2. 校验返回标的必须为 `DX-Y.NYB`，并校验时间戳与 OHLC、复权收盘数组对齐。
3. 剔除 Close 为空的周末或缺失占位，不做插值；有效日期必须唯一、严格递增。
4. 对收盘值执行合理区间校验，并确认收盘价位于当日最高价与最低价之间。
5. JSON 为网页使用的紧凑日期/收盘值序列；CSV 保留 Date、Open、High、Low、Close、Adjusted Close。
6. 当前有效覆盖范围为 1971-01-04 至 2026-08-07，共 14,117 条日度观测，最新收盘值为 99.60。

### 5. 发布

1. 任一数据文件发生真实变化后，GitHub Actions 以机器人账号提交并推送。
2. GitHub Pages 从主分支重新发布网站。
3. 浏览器端每次载入 JSON 时使用 `cache: no-store`，避免显示旧的数据快照。

## 五、失败保护与巡检要点

- 网络请求失败、HTTP 状态异常、JSON/CSV 格式变化、字段缺失或校验失败时，更新脚本以非零状态退出。
- 所有数据文件先写入同目录临时文件，再原子替换，避免留下半写入文件。
- ETF 模块重点巡检 WGC `as_of_date` 是否前进、周度观测数是否增加、两个接口日期是否一致。
- COMEX 金价模块重点巡检 `as_of_date`、最新 Close 和有效观测数；连续合约的早期 OHLC 口径异常不影响仅使用 Close 的网页曲线。
- 实际利率模块重点巡检 `as_of_date`、最新值与 FRED 页面是否一致；周末及美国节假日无新观测属于正常情况。
- 美元指数模块重点巡检 `as_of_date`、最新收盘值和有效观测数；Yahoo 返回的空值占位被忽略属于正常处理。
- 如果连续两个美国工作日没有新实际利率数据，先检查 FRED 页面是否延迟，再检查 GitHub Actions 日志。

## 六、服务器手工更新命令

服务器上所有 Python 脚本必须使用项目规定的解释器：

```powershell
Set-Location 'F:\res4\rqqin\strategy research\gold'
& 'F:\res4\rqqin\anaconda3\python.exe' 'scripts\update_data.py'
& 'F:\res4\rqqin\anaconda3\python.exe' 'scripts\update_real_yield.py'
& 'F:\res4\rqqin\anaconda3\python.exe' 'scripts\update_comex_gold.py'
& 'F:\res4\rqqin\anaconda3\python.exe' 'scripts\update_dollar_index.py'
```

运行后应检查各脚本的末行摘要、数据文件修改时间、最新日期和观测数，再决定是否提交发布。

注意：Yahoo Finance 可能按出口 IP 限制图表接口。若服务器手工运行 COMEX 金价或美元指数脚本返回 HTTP 403，脚本会在写文件前失败并保留现有数据；此时应在 GitHub Actions 中手工触发 `Update gold market data`，以该自动更新链路为网站日更的正式运行环境。
