# 黄金市场监测：WorkBuddy 日更交接

更新日期：2026-10-28

## 1. 入口与权限

- 网站：https://qrq3838.github.io/gold-market-monitor/
- 发布仓库：https://github.com/qrq3838/gold-market-monitor ，main 分支。
- 服务器镜像：F:\res4\rqqin\strategy research\gold
- 本机资料：D:\OneDrive - SAIF\RA\Li Feng\服务器\黄金监测
- 本机旧 Git 仓库：D:\OneDrive - SAIF\RA\Li Feng\服务器\gold-market-monitor 。存在用户未提交数据修改时，保持原样，不拉取覆盖、不 reset、不 stash。
- 项目数据定义和计算公式见同目录 DATA_MODULES_AND_REFRESH.md。

服务器连接先读上层 AGENTS.md 和服务器项目 AGENTS.md（若存在）。使用固定 rqqin-server-connect 工具和受信任主机密钥，凭据由环境变量或本机安全存储提供，不写入文档或仓库。远程 Python 固定为 F:\res4\rqqin\anaconda3\python.exe；计算、缓存、测试、日志留在 gold 项目下。

GitHub 读取公开仓库无需登录；触发任务需要已登录的 gh 或授权连接。当前代理是否有权限必须自行执行 gh auth status 核验，不从另一代理的登录状态推断。不要让用户把 token 贴进聊天。

## 2. 网站怎样更新

源站 → 九个 Python 更新脚本 → data/*.json 和 *.csv → main → GitHub Pages → 浏览器 ECharts 图表。

- 这是静态网站，抓取在 GitHub Actions 的计算环境中执行。
- 工作流 .github/workflows/update-data.yml 每天北京时间 22:40 自动运行，也可手动触发。调度可能排队延迟。
- Actions 失败时不会提交这一轮的部分数据；无新数据时成功结束且不提交。
- 服务器是独立镜像，Actions 不会自动同步内网服务器。
- 所有图的金价统一为 COMEX GC=F Close；用户可选右轴叠加，第一张金价图有 MA5/20/60/120。
- 页面的十个模块：COMEX、CFTC 仓位、利率分解、回撤与波动率、中国央行购金、全球季度央行储备、ETF 资金流、ETF 持仓、原实际利率、美元指数。
- 全球央行月度净购金暂缓。不要将季度储备差分伪装成月度净购买。

## 3. 每日操作

无需进入或修改本机旧 Git 工作树，直接指定仓库：

~~~powershell
gh auth status
gh run list --repo qrq3838/gold-market-monitor --workflow update-data.yml --limit 5
~~~

当天尚未成功且需要立即更新时：

~~~powershell
gh workflow run update-data.yml --repo qrq3838/gold-market-monitor --ref main
gh run list --repo qrq3838/gold-market-monitor --workflow update-data.yml --limit 3
gh run view <run-id> --repo qrq3838/gold-market-monitor
~~~

长任务用有间隔的状态检查。若失败：

~~~powershell
gh run view <run-id> --repo qrq3838/gold-market-monitor --log-failed
~~~

按失败源排查。网络暂时失败可以重试；格式或校验错误需要修复代码并经过测试。不要通过跳过检查、填充日期、写入盘中价格来让任务通过。

## 4. 九个更新脚本

| 脚本 | 数据来源与增量逻辑 |
|---|---|
| scripts/update_data.py | WGC flows-chart2 / holdings-chart2；四种频率、四地区，末日一致 |
| scripts/update_central_bank_reserves.py | WGC 季度官方持有量；11 地区、123 经济体；缺报沿用此前库存，保留覆盖数 |
| scripts/update_pboc_gold_reserves.py | SAFE 月末实物“万盎司”差分转吨；从 2016-01 开始 |
| scripts/update_real_yield.py | FRED DFII10；追加新日、回看 35 天；保留更早 Excel 基线 |
| scripts/update_comex_gold.py | Yahoo GC=F Close；剔除未完成交易日与盘中附加报价 |
| scripts/update_dollar_index.py | Yahoo DX-Y.NYB；同样排除未完成日 |
| scripts/update_cftc_positions.py | CFTC 年度 Futures Only ZIP，088691；从 2012 年开始；日更本年度，年初回看上一年度 |
| scripts/update_yield_decomposition.py | FRED DGS10、DFII10、T10YIE 全历史共同有效日期；核对利率恒等式与 20 日变化 |
| scripts/update_gold_risk.py | 以上述已更新 COMEX JSON 计算 252 日高点回撤和 20 日样本年化波动率 |

CFTC 日期是持仓日，通常周二，常规周五发布；不要拿周二日期当已知信息时间。FRED 三个序列可能末日不同，分解采用共同有效日期。WGC/SAFE 低频没有新增观测可保持不变。

## 5. 验证与发布

1. Actions 必须成功，包括 python -m unittest discover -s tests -v。
2. 查看 main 最新提交，核对数据文件变化；CFTC/FRED 日期不可倒退。
3. 查看 Pages 部署成功：
   gh run list --repo qrq3838/gold-market-monitor --workflow pages-build-deployment --limit 3
4. 读取公开网页的对应 JSON（可附 ?ts=时间戳），核对 as_of_date、末值、观测数、JSON/CSV 一致性。
5. 新增模块应检查：CFTC 净多=多−空，净多/OI 与分位；名义=实际+通胀补偿，20 日变化同样勾稽；风险日期与 COMEX 完全一致、回撤≤0、波动率≥0。
6. 打开网页检查全部图表能显示、日期过滤有效、COMEX 开关可以关闭曲线及右轴；抽查手机宽度、下载链接和浏览器错误。
7. 发布代码改动使用独立 agent/... 分支、PR、测试后合并；不夹带无关文件。数据自动更新由机器人直接提交。

## 6. 同步服务器

Actions 与 Pages 成功后，从 GitHub main 解析固定提交 SHA，再按该 SHA 下载发布文件到服务器 gold。保留服务器备份并执行逐文件 SHA-256 核对。同步范围为 data/、assets/、scripts/、tests/、index.html、.github/workflows/ 和项目说明文档；不要覆盖 gold/work/、研究报告或其他未列入发布的文件。

数据、缓存、原始下载与脚本无需在本机留副本。只把最终说明文档同步到本机黄金监测目录。GitHub 最新版本、Pages 公开文件和服务器镜像三者一致后，才能汇报已完成同步。

## 7. 常见处理

- Yahoo 返回 403：通过 GitHub Actions 更新；服务器保留原数据，不修改防护或认证设置。
- CFTC 年度表头变化：已兼容旧/新日期字段；其他变化需检查官方 ZIP。
- 某序列无新日：先核对源站发布时间，按实际观测日汇报；不能统一把所有模块写成“今日数据”。
- 金价回撤/波动率滞后：先检查 COMEX 更新是否成功，再运行风险脚本；不单独改末日。
- 本机旧仓库脏：保留修改。用独立开发目录或直接在服务器工作副本处理。
- 数据修订：保留来源，记录变动范围；更新交接文档、公式文档和相应测试。
- 凭据缺失：交给用户完成受信任的登录授权；交接文档不包含密码或 token。

## 8. 每次完成后的汇报

简要列出：COMEX/美元指数/FRED/CFTC/ETF/SAFE/季度储备各自最新日期，Actions 和 Pages 结果，服务器哈希校验结果。未更新的低频数据写明官方末期；失败则写具体源和错误，保留已完成事项。
