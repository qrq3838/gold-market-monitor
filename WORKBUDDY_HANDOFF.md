# 黄金市场监测网页：WorkBuddy 日度更新交接文档

最后核对日期：2026-08-19
维护对象：<https://qrq3838.github.io/gold-market-monitor/>

## 1. 接手后先记住的四件事

1. **GitHub `main` 是公开网页的发布源**：仓库为 <https://github.com/qrq3838/gold-market-monitor>，GitHub Pages 会在 `main` 更新后自动部署。
2. **服务器目录是部署镜像，不是 Git 源仓库**：服务器副本位于 `F:\res4\rqqin\strategy research\gold`。GitHub 更新成功后，还要把真实变化的文件同步到这里并校验哈希。
3. **日更优先使用 GitHub Actions**：`.github/workflows/update-data.yml` 在每天北京时间 22:40 自动运行，也支持手工触发。这个时间点能避开 Yahoo 将上一美国交易日仍标记为进行中而产生的盘中值；周末没有新观测时不会制造数据提交。
4. **只接收完整、通过校验的正式观测**：周末、节假日、源站尚未发布或低频数据没有变化，都属于正常情况；不要为了让日期“看起来更新”而填充、插值或写入盘中价格。

## 2. 路径、账号与操作规则

| 用途 | 位置 |
|---|---|
| 本机 Git 仓库 | `D:\OneDrive - SAIF\RA\Li Feng\服务器\gold-market-monitor` |
| 本机黄金监测资料 | `D:\OneDrive - SAIF\RA\Li Feng\服务器\黄金监测` |
| 服务器项目镜像 | `F:\res4\rqqin\strategy research\gold` |
| GitHub 仓库 | <https://github.com/qrq3838/gold-market-monitor> |
| 公开网页 | <https://qrq3838.github.io/gold-market-monitor/> |

每次连接服务器前，先完整阅读本机上层规则：

`D:\OneDrive - SAIF\RA\Li Feng\服务器\AGENTS.md`

连接后再次检查以下文件是否出现；如果存在，必须完整阅读并以它为项目最高优先级规则：

`F:\res4\rqqin\strategy research\gold\AGENTS.md`

交接文档不保存密码。服务器登录信息只从上层 `AGENTS.md` 或安全凭据存储读取，不得复制到代码、日志、PR 或聊天回复中。若在服务器运行 Python，只能使用：

`F:\res4\rqqin\anaconda3\python.exe`

## 3. 网页结构和数据流

这是一个纯静态 GitHub Pages 项目：

```text
源站/API
  ↓ 六个 Python 更新脚本
data/*.json + data/*.csv
  ↓ index.html + assets/*.js
浏览器中的 ECharts 交互图表
  ↓ main 分支更新
GitHub Pages 自动发布
  ↓ 人工/SFTP同步
服务器 gold 目录镜像
```

- `index.html`：页面结构、下载链接和图表容器。
- `assets/*.js`：读取 JSON、日期筛选、图例开关、ECharts 配置和金价对齐。
- `assets/gold-overlay.js`：统一读取 `data/comex_gold_futures.json`，为其他六张指标图提供可开关的右轴 COMEX 金价。
- 浏览器请求 JSON 时使用 `cache: no-store`，避免缓存旧数据。
- CSV 用于下载和审计；JSON 是网页绘图的直接输入。

### 当前七个图表模块

| 顺序 | 图表 | 页面逻辑 | 主数据文件 |
|---|---|---|---|
| 1 | COMEX 黄金期货 | `GC=F` 日收盘；MA5、MA20、MA60、MA120 可独立开关 | `comex_gold_futures.*` |
| 2 | 中国人民银行月度增持 | SAFE 月末实物黄金存量的一阶差分柱状图；可叠加 COMEX 金价 | `pboc_gold_reserve_changes.*` |
| 3 | 全球央行黄金储备 | 11 个地区季度堆叠柱状图；可切换计入/不计入美国；可叠加 COMEX 金价 | `central_bank_gold_reserves_by_region.*` |
| 4 | Gold ETF flows by region | 北美、欧洲、亚洲、其他地区资金流柱状图；吨/美元、年/季/月/周切换 | `gold_etf_flows_by_region.*` |
| 5 | Gold ETFs holdings by region | 地区持仓堆叠面积图；吨/管理资产、年/季/月/周切换 | `gold_etf_holdings_by_region.*` |
| 6 | 美国10年期实际收益率 | FRED `DFII10` 日频曲线；可叠加 COMEX 金价 | `us_10y_real_yield.*` |
| 7 | 美元指数 | Yahoo `DX-Y.NYB` 日收盘曲线；可叠加 COMEX 金价 | `us_dollar_index.*` |

除第一张独立金价图外，其余六张图的金价均按指标日期匹配“当天或此前最近一个有效 COMEX 收盘价”，绝不使用未来值。美元指数在 2000-08-30 以前没有 `GC=F` 历史，因此该区间的金价保持空白。

## 4. 数据源、脚本和刷新频率

| 数据 | 官方页面/API | 更新脚本 | 正常频率与注意事项 |
|---|---|---|---|
| COMEX 黄金 | [Yahoo GC=F](https://finance.yahoo.com/quote/GC%3DF/history/)；`query1/query2.finance.yahoo.com/v8/finance/chart/GC%3DF` | `scripts/update_comex_gold.py` | 美国交易日更新；自动剔除当前未结束交易日和盘中实时报价；Yahoo 可能修订最近成交量 |
| 美元指数 | [Yahoo DX-Y.NYB](https://finance.yahoo.com/quote/DX-Y.NYB/history/)；Yahoo Chart API | `scripts/update_dollar_index.py` | 美国交易日更新；同样剔除未结束交易日和盘中值 |
| 美国实际收益率 | [FRED DFII10](https://fred.stlouisfed.org/series/DFII10)；[官方CSV](https://fred.stlouisfed.org/graph/fredgraph.csv?id=DFII10) | `scripts/update_real_yield.py` | 日频但可能滞后；`.` 缺失日忽略；回看最近35个日历日吸收官方修订，更早的用户Excel历史基线不覆盖 |
| 中国央行黄金储备 | [SAFE 官方储备资产](https://www.safe.gov.cn/safe/gfcbzc/index.html) | `scripts/update_pboc_gold_reserves.py` | 月频；只用“万盎司”实物存量，不用美元估值；相邻月差分后按 `1万盎司=0.311034768吨` 换算 |
| 黄金ETF资金流与持仓 | [World Gold Council](https://www.gold.org/goldhub/data/gold-etfs-holdings-and-flows)；`flows-chart2`、`holdings-chart2` | `scripts/update_data.py` | 主要关注周度新增，也保留年/季/月频；两个接口 `as_of_date` 必须一致，否则失败 |
| 全球央行黄金储备 | [World Gold Council](https://www.gold.org/goldhub/data/gold-reserves-by-country)；`getFilters`、`getPage` | `scripts/update_central_bank_reserves.py` | 季频；123个经济体按11地区聚合；AWAITED 沿用该经济体此前最近库存；计入/不计入美国必须勾稽 |

更完整的数据口径、当前覆盖范围和字段说明见项目根目录的 `DATA_MODULES_AND_REFRESH.md`。如网页逻辑、数据源或脚本发生变化，必须同时更新该文件和本交接文档。

## 5. 推荐的每日操作流程

### A. 正常情况：检查并使用 GitHub Actions

建议在北京时间 22:45 之后执行。

1. 进入本机仓库，确认没有未归属的用户修改：

   ```powershell
   Set-Location 'D:\OneDrive - SAIF\RA\Li Feng\服务器\gold-market-monitor'
   git status -sb
   git fetch origin
   git pull --ff-only origin main
   ```

2. 查看当天定时任务：

   ```powershell
   gh run list --workflow update-data.yml --limit 5
   ```

3. 如果当天任务尚未运行、失败或需要立即重试，手工触发：

   ```powershell
   gh workflow run update-data.yml --ref main
   gh run list --workflow update-data.yml --limit 3
   gh run watch <run-id> --exit-status
   ```

4. 工作流依次运行六个脚本。只有数据真实变化时，机器人提交 `Update gold market data` 并推送 `main`；没有变化时显示 `No source data change.`，这是正常成功结果。

5. 再次拉取 `main`，检查最新提交及修改文件：

   ```powershell
   git pull --ff-only origin main
   git show --stat --oneline HEAD
   git status -sb
   ```

### B. GitHub Actions失败时：本地分源补跑

在仓库根目录按以下顺序运行：

```powershell
python scripts/update_data.py
python scripts/update_central_bank_reserves.py
python scripts/update_pboc_gold_reserves.py
python scripts/update_real_yield.py
python scripts/update_comex_gold.py
python scripts/update_dollar_index.py
```

每个脚本都应打印最新日期、观测数或模块摘要。单个源站临时超时、TLS握手中断或Yahoo主机失败时，应先单独重试该脚本；不要因一个源失败而手工拼接未经校验的数据。

本地更新后：

1. 用 `git diff --stat` 和逐文件 `git diff` 确认真正变化。
2. 只提交真实变化的文件，不要使用未经确认的 `git add -A`。
3. 检查日期唯一且递增、JSON日期和值数组等长、CSV行数与JSON观测数一致、末日与 `as_of_date` 一致。
4. 将“新增日期、最新值、历史修订、无变化源、校验结果”写入PR说明。
5. 建立 `agent/...` 分支，提交、推送并开PR；合并后等待 GitHub Pages 部署成功。

### C. 验证公开网页

1. 查看 Pages 部署是否成功：

   ```powershell
   gh run list --workflow pages-build-deployment --limit 3
   ```

2. 用带时间戳的URL直接读取变更后的JSON，避免CDN缓存。例如：

   `https://qrq3838.github.io/gold-market-monitor/data/comex_gold_futures.json?ts=<当前时间戳>`

3. 核对公开JSON的最后日期、最后值和观测数，再打开网页确认图表、图例和右轴金价正常显示。

### D. 同步服务器镜像

GitHub Actions不会自动更新服务器镜像。GitHub `main` 和 Pages验证成功后：

1. 按上层 `AGENTS.md` 的SSH/SFTP规范连接服务器并验证主机密钥。
2. 只上传本次真实变化的文件，保持仓库内相对路径不变；数据文件放到：

   `F:\res4\rqqin\strategy research\gold\data`

3. 先上传为同目录临时文件，再原子替换正式文件，避免留下半文件。
4. 对本机与服务器文件计算 SHA-256；必须逐文件一致。
5. 如果改了网页、脚本、工作流或说明文档，也同步对应的 `index.html`、`assets`、`scripts`、`.github` 或根目录文档。

## 6. 每日最低质量检查

| 检查项 | 合格标准 |
|---|---|
| 工作树 | 更新前明确干净；更新后只出现本次数据或文档变化 |
| 日期 | 每个序列唯一、严格递增；无未来日期 |
| JSON/CSV一致性 | 日期、末值、观测数一致；数组等长 |
| Yahoo日线 | 不包含当前未结束交易日；Close为正；DXY Close位于High/Low内 |
| FRED | `.` 缺失值不填充；仅追加新日并允许最近35天修订 |
| WGC ETF | flows与holdings的 `as_of_date` 一致；四种频率和地区集合完整 |
| 全球央行储备 | 11地区、123经济体、季度日期对齐；计入/不计入美国差额等于USA |
| SAFE | 月份连续；USD/SDR重复列的万盎司存量一致；吨数换算正确 |
| 发布 | PR/机器人提交成功；Pages成功；公开JSON为新版本 |
| 服务器 | 所有同步文件SHA-256与本机一致 |

## 7. 常见问题与处理原则

### Yahoo日期没有推进

北京时间上午，上一美国交易日可能仍被Yahoo元数据标记为进行中。脚本会主动排除该日，这是正确保护。优先等待每天北京时间22:40的自动任务；如需提前补跑，也应确认对应美国交易日已经结束，不要把盘中快照手工写入。

### WGC、SAFE或央行季度储备长期不变

这些不是日频源。脚本成功且最新官方日期未推进时，不应制造提交。ETF主要看周度，SAFE通常次月发布，全球央行储备按季度发布且可能有AWAITED。

### 网络超时、TLS或HTTP 403

- 临时超时或TLS EOF：分源重试一次并保留完整错误记录。
- Yahoo对服务器出口IP返回403：不要关闭证书校验或绕过安全限制；改用GitHub Actions正式链路。
- SAFE证书问题：脚本只在明确证书链错误时使用Windows系统证书库，禁止“不验证HTTPS”。

### Windows显示很多文件已修改，但实际没有内容差异

这是常见的LF/CRLF换行表现。以 `git diff --stat` 和逐文件diff为准；没有内容差异的文件不要暂存，可以在确认后对这些文件单独执行 `git restore -- <文件>`。绝不能用会覆盖用户修改的批量重置命令。

### 源站修订历史数据

Yahoo可能修订最近成交量，FRED可能修订近期数值，WGC也可能回补季度报告。接受源站正式修订，但必须在PR或更新记录中明确写出修订日期、字段和前后值；若出现大范围历史重写，先停止发布并调查接口或口径变化。

## 8. 完成一次日更后的汇报模板

向用户汇报时至少包含：

- 各新增数据的最新日期和最新值；
- 哪些低频源没有新增；
- 是否发生历史修订；
- GitHub提交或PR链接；
- Pages是否部署成功；
- 服务器是否同步及哈希是否一致；
- 若Yahoo日线因尚未收盘被排除，说明下一次检查时间。

## 9. 维护边界

- 不擅自改变指标定义、单位、地区分类、缺失值策略或金价匹配规则。
- 不把WGC接口附带金价重新用于网页；网页统一使用COMEX `GC=F`。
- 不把SAFE黄金美元估值当作实物储备。
- 不将多边机构混入WGC 11个地理地区堆叠总量。
- 不在未经用户授权时增加新模块、删除历史或改变公开URL。
- 如源站结构变化导致脚本失败，先保留现有已验证数据，再修复解析和测试，不得发布半成品。

完成上述步骤后，WorkBuddy即可独立执行每日检查、增量更新、发布验证和服务器同步。
