# 数据抓取脚本（Python）

从东方财富 / akshare 公开接口抓取 A 股财务数据、盈利预测、宏观经济数据，生成 GoalTracker 可导入的 CSV，并可直接写入主数据文件 `goal-tracker-data.json`。

## 环境要求

- Python 3.8+
- 依赖：`pip install -r requirements.txt`（requests）
- 若用 akshare 脚本：`pip install akshare pandas`

## 文件说明

| 文件 | 作用 | 输出目录 |
|---|---|---|
| `eastmoney.py` | 东方财富接口客户端（财务/利润/资产负债/现金流/行情/宏观） | - |
| `fetch_financial.py` | 抓取公司财务数据 → 财务 CSV | `data/financial/` |
| `fetch_earnings.py` | 按披露日期批量抓取最新财报 → 财报跟踪 CSV | `data/earnings/` |
| `fetch_prices.py` | 批量拉取行情快照（现价/涨跌/PE/成交等）→ 股价 CSV | `data/prices/` |
| `fetch_macro_all.py` | 统一宏观脚本（东财+akshare 全部指标，支持增量） | `data/macro/` |
| `fetch_daily.py` | 宏观每日增量（仅日度/周度指标，只补缺失日期） | `data/macro/` |
| `fetch_macro.py` | 东财宏观指标（GDP/CPI/PPI/PMI 等） | `data/macro/` |
| `fetch_macro_ak.py` | akshare 宏观指标（债务/货币/国际） | `data/macro/` |
| `fetch_profit_forecast.py` | 东财 F10 盈利预测（券商明细+一致预期）→ CSV / 写入 JSON | `data/forecast/` |
| `build_valuation_index.py` | 扫描估值报告，生成前端可读索引 | `valuations/_index.json` |
| `export_companies.py` | 从数据 JSON 导出公司列表 CSV（供抓取脚本 --from-csv） | `data/公司列表.csv` |
| `test_valuation.js` | 估值 / 待击球模块回归测试（node 直接跑，无需浏览器） | - |
| `test_sync_check.js` | 内核「同步盘数据比对」回归测试（vm 加载 core.js） | - |
| `requirements.txt` | Python 依赖清单 | - |

## 数据目录结构

```
data/
├── financial/     # 各公司财务数据 CSV（{ticker}_{公司名}.csv）
├── earnings/      # 财报跟踪 CSV（财报跟踪_YYYYMMDD.csv）
├── macro/         # 宏观经济数据 CSV（宏观经济_全部数据.csv 等）
├── forecast/      # 盈利预测 CSV（盈利预测_{代码}_{公司名}.csv）
├── prices/        # 行情快照 CSV（当前股价_YYYYMMDD.csv，按日期存档）
├── 公司列表.csv   # 公司列表（估值模块「⬇ 导出公司列表」生成，所有脚本的默认公司来源）
├── goal-tracker-data.json   # 主数据文件（可被脚本直接更新）
└── 公司财务数据_累计.xlsx     # 其他
```

> 各脚本默认输出到对应子目录，也可用 `--outdir` 指定。

## 用法

### 1. 财务数据（估值模块）→ `data/financial/`

```bash
# 自动模式（推荐）：读取 data/公司列表.csv（估值模块「⬇ 导出公司列表」生成），
# 抓取最近 18 期并保存 CSV；文件不存在时回退：JSON → 扫描已有 CSV
py fetch_financial.py --auto --quarters 18

# 只抓取单只
py fetch_financial.py --ticker 688256.SH

# 抓取多只（逗号分隔）
py fetch_financial.py --tickers 601138.SH,000977.SZ,300308.SZ

# 从任意公司列表 CSV 批量抓取（兼容估值模块「⬇ 导出公司列表」/ 财报跟踪「⬇ 导出 CSV」/
# 公司组「📤 导出该组」三种格式，列：股票代码[,公司名称]，6 位纯代码也可）
py fetch_financial.py --from-csv ../data/公司列表.csv

# 指定公司列表来源 JSON / 输出目录
py fetch_financial.py --auto --json 其他数据.json --outdir 目标目录
```

生成：`data/financial/{ticker}_{公司名}.csv`，与估值模块「⬆ 批量导入财务 / 详情页 ⬆ 导入 CSV」完全兼容。

CSV 包含的列（顺序固定，与前端一致）：总资产、所有者权益、营业收入、**营收同比%**、毛利润、净利润、扣非净利润、**扣非净利润同比%**、经营现金流、资本开支、ROE、毛利率、净利率、资产负债率、总资产周转率。同比字段取自东方财富核心财务指标接口的累计值同比（如 Q2 = 上半年累计 vs 去年同期上半年）。

### 1a. 财报跟踪（财报跟踪模块）→ `data/earnings/`

按「财报实际披露日期」批量抓取最新财报，生成汇总 CSV，供前端「📊 财报跟踪」模块导入后排序 / 筛选（跟踪超预期公司）。

**三种获取来源**：

```bash
# ① 关注列表（默认）：从 data/公司列表.csv 读关注公司（不存在时回退 goal-tracker-data.json），取每只最新一期财报
py fetch_earnings.py

# ② 指定关注公司列表（逗号分隔，可带或不带 .SH/.SZ 后缀；PowerShell 下务必加引号）
py fetch_earnings.py --codes "601138,300308,000977"
py fetch_earnings.py --codes "601138.SH,300308.SZ"

# ③ 按披露日期获取【全部】公司（不限股票列表）：指定日期/范围内发布财报的公司
py fetch_earnings.py --date 2026-08-12            # 单日
py fetch_earnings.py --date 2026-08-12 --date 2026-08-15   # 两个单日
py fetch_earnings.py --start 2026-08-01 --end 2026-08-31   # 日期范围
```

**常用筛选与增强参数**（可与上述来源组合）：

```bash
# 只保留营收同比 ≥ 20% 的公司（默认不过滤）
py fetch_earnings.py --start 2026-08-01 --end 2026-08-31 --min-yoy 20

# 按披露日期获取时【默认仅 A 股主板】（上证主板 60 开头 / 深证主板 00 开头）
# 如需包含其他板块：
py fetch_earnings.py --date 2026-08-12 --include-gem    # +创业板
py fetch_earnings.py --date 2026-08-12 --include-star   # +科创板
py fetch_earnings.py --date 2026-08-12 --include-bj     # +北交所
py fetch_earnings.py --date 2026-08-12 --all-board      # 全部板块

# 指定市场：SH(沪)/SZ(深)/BJ(北交)，默认全部市场
py fetch_earnings.py --date 2026-08-12 --market SH,SZ

# 分类标签：写入文件名后缀（如 电子 / 8月 / 自选），同一日期可存多个分类文件
py fetch_earnings.py --date 2026-08-12 --category 电子

# 按日期获取时最多处理 N 家（0=不限）
py fetch_earnings.py --date 2026-08-12 --limit 100

# 快模式：跳过补齐扣非/经营现金流/资本开支（更快，仅业绩报表自带指标）
py fetch_earnings.py --date 2026-08-12 --no-full

# 按日期获取时同时拉取当年一致预期（较慢，仅对关注列表默认开启）
py fetch_earnings.py --date 2026-08-12 --consensus

# 包含新三板/三板等非 A 股
py fetch_earnings.py --date 2026-08-12 --all-market
```

**CSV 命名（按财报发布日期 + 类别，支持存多个、互不覆盖）**：

```
财报跟踪_20260827.csv              # 关注列表 / 默认（今日日期）
财报跟踪_20260827_自选.csv         # --codes 指定公司（追加"_自选"）
财报跟踪_20260812.csv              # --date 单日（按披露日期）
财报跟踪_20260812_电子.csv         # 单日 + --category 分类
财报跟踪_20260801-20260831.csv     # --start/--end 日期范围
```

**CSV 列**：股票代码、公司名称、行业、板块、林奇类型、披露日期、报告期、季度、营业收入(亿)、**营收同比%**、毛利润(亿)、净利润(亿)、扣非净利润(亿)、**扣非净利同比%**、经营现金流(亿)、**销售收现(亿)**、资本开支(亿)、ROE、毛利率，以及**当年一致预期**（财报发布年份）：预期营收(亿)、预期净利(亿)、预期营收同比%、预期净利同比%。

**导入**：前端「财报跟踪」→ 「⬆ 导入财报 CSV」→ 可多选文件分别导入分析。支持按任意指标排序（点击列头，含披露日期/季度）、行业/板块**多选**筛选、L1 真实性五项规则独立勾选组合（扣非净利同比、扣非/净利比、TTM 净现比、收现比 = 销售收现÷营收 等，chip 上实时显示满足家数）；「超预期」列 = 实际营收同比 − 预期营收同比（正=财报超预期）。

**导出**（均弹出另存为对话框）：
- 「⬇ 导出 CSV」：导出满足全部筛选条件的公司及指标数据，可回导
- 「⬇ 导出公司列表」：导出估值模块「⬆ 导入公司列表」可直接使用的公司列表 CSV

> 说明：
> - 披露日期取自东方财富业绩报表接口（`RPT_LICO_FN_CPD`），即财报实际发布日。
> - 按日期获取的"更多公司"会通过 `RPT_F10_BASIC_ORGINFO` 批量补充行业/板块标签，与关注列表公司展示一致。
> - 完整指标（扣非/经营现金流/资本开支/毛利润）需逐公司补齐，默认开启（`--no-full` 可跳过）；一致预期默认只对关注列表/指定公司拉取，按日期获取需 `--consensus` 显式开启。
> - 一致预期取自东财 F10 盈利预测接口（`fetch_profit_forecast.py` 同源），按财报发布年份取当年券商一致预期。
> - 指定公司列表来源 JSON / 输出目录：`py fetch_earnings.py --json 其他数据.json --outdir 目标目录`（默认读 `data/公司列表.csv`，行业/板块/林奇类型标签同步取自该文件）。

### 1b. 行情快照（估值模块）→ 生成股价 CSV（按日期存档），浏览器批量导入

无需在浏览器手动一个个更新股价。运行脚本批量拉取行情快照，生成「股价 CSV」到 `data/prices/当前股价_YYYYMMDD.csv`（按日期存档，保留历史），再在浏览器「公司估值 → ⬆ 导入股价」选择它即可批量更新（脚本不修改 JSON）：

```bash
# 默认读取 data/公司列表.csv 生成当日行情快照 CSV（不存在时回退 data/goal-tracker-data.json）
py fetch_prices.py

# 指定公司列表来源 CSV / JSON（CSV 兼容估值模块导出 / 财报跟踪导出 / 公司组导出格式，6 位纯代码也可）
py fetch_prices.py --from-csv ../data/公司列表.csv
py fetch_prices.py --json ../data/goal-tracker-data.json

# 指定输出目录 / 文件名
py fetch_prices.py --outdir ../data/prices --out 当前股价.csv

# 只预览将写入的行情，不写文件
py fetch_prices.py --dry-run
```

- 使用东方财富批量行情接口（延时约 15 分钟），一次拉取全部公司行情。
- 生成 `data/prices/当前股价_YYYYMMDD.csv`，列：`股票代码,公司,现价,涨跌额,涨跌幅%,市盈率(动),市净率,换手率%,成交量(手),成交额(亿),总市值(亿),流通市值(亿),总股本(亿股)`（总股本由总市值÷现价推算）。
- 导入：公司估值 → 「⬆ 导入股价」→ 选当日 CSV，自动更新 `currentPrice`、补全 `totalShares`，并带出行情快照（涨跌/市盈率/市净率/换手率/成交额/总市值），显示在公司卡片「📈 实时行情」组和公司详情页上方。

### 2. 宏观数据（宏观模块）→ `data/macro/`

**统一脚本（推荐，含全部 42 个指标，支持增量）**：

```bash
py fetch_macro_all.py                 # 增量：保留已有数据，只补充新日期（默认）
py fetch_macro_all.py --fresh         # 全量：重新抓取全部数据
py fetch_macro_all.py --only global   # 只抓国际宏观（可选）
py fetch_macro_all.py --outdir ../data/macro
```

生成：`data/macro/宏观经济_全部数据.csv`（含「国内宏观经济」+「国际宏观经济」两张表，42 个指标）

**每日增量脚本（推荐每日跑）**：每次执行自动补齐各指标缺失的日期（含当天/近期缺口），增量写回 CSV，已有日期不重复落盘：

```bash
py fetch_daily.py                      # 日度+周度，自动补齐缺失日期（默认）
py fetch_daily.py --freq 日度          # 只更日度
py fetch_daily.py --freq all           # 不限频率（月度指标也补缺）
py fetch_daily.py --only us10y,oil     # 只补指定指标（key 逗号分隔，不受 --freq 限制）
py fetch_daily.py --force              # 忽略已有日期，全部重抓并覆盖同日值
py fetch_daily.py --outdir D:\data\macro
```

执行流程：
1. 读取现有 CSV → 逐指标抓取 → **只写入 CSV 中不存在的日期**（无新增则完全不写盘）；
2. **每个指标一旦有新数据立即落盘**，中途中断/超时也不会丢失本次已抓内容；
3. 日志明确列出补齐的日期（如 `补 1 期：2026-09-10`）或 `已是最新（最新 2026-09-10）`；
4. 结束时输出**数据新鲜度报告**，列出仍未更新到位的指标与滞后天数（日度>7天 / 周度>21天 / 月度>45天 / 季度>120天），便于第一时间发现数据源失效。

- 月度指标（GDP/CPI/PMI/LPR/M1/M2 等）默认不在其范围，仍由 `fetch_macro_all.py` 周/月跑一次维护；临时要补可加 `--freq all` 或 `--only <key>`。
- 已配置 GitHub Actions 每日任务（`.github/workflows/macro-data.yml`：工作日先跑本脚本补日度/周度，周一额外跑 `fetch_macro_all.py` 补月度）；也可用 Windows 计划任务（脚本头部注释有 `schtasks` 示例）。
- 日志：控制台 + `data/macro/fetch_daily.log`（1MB 滚动、保留 3 份），单指标 600s 看门狗防数据源挂死。

**单独脚本**：
```bash
py fetch_macro.py --periods 150       # 东财 GDP/CPI/PPI/PMI 等
py fetch_macro_ak.py                  # akshare 债务/货币/国际
```

> 增量模式读取已有 CSV，合并新数据点，不会丢失已有数据。

### 3. 盈利预测（公司估值盈利预测模块）→ `data/forecast/` + 写入 JSON

**更新全量公司（推荐）**：`--auto` 读取 `data/公司列表.csv`（估值模块「⬇ 导出公司列表」生成）获取全部公司；文件不存在时回退 `goal-tracker-data.json`。

```bash
# 自动模式（推荐）：抓取汇总列表全部公司 + 生成 CSV；加 --update-json 同时写入 JSON
py fetch_profit_forecast.py --auto
py fetch_profit_forecast.py --auto --update-json

# 全量更新（JSON 来源）：抓取所有公司 + 写入 JSON + 生成 CSV
py fetch_profit_forecast.py --json ../data/goal-tracker-data.json --update-json

# 全量更新：只写 JSON，不生成 CSV
py fetch_profit_forecast.py --json ../data/goal-tracker-data.json --update-json --no-csv

# 从任意公司列表 CSV 批量抓取（兼容估值模块「⬇ 导出公司列表」/ 财报跟踪「⬇ 导出 CSV」/
# 公司组「📤 导出该组」三种格式；适合只分析某个公司组，无需全量列表）
py fetch_profit_forecast.py --from-csv ../data/公司组_AI算力_2026-09-03.csv
```

**更新单个公司**：

```bash
# 抓取单只并写入 JSON + 生成 CSV
py fetch_profit_forecast.py --ticker 002463.SZ --update-json

# 抓取单只只生成 CSV（不写 JSON）
py fetch_profit_forecast.py --ticker 002463.SZ
```

**多只指定**：
```bash
py fetch_profit_forecast.py --tickers 002463.SZ,601138.SH --update-json
```

生成：`data/forecast/盈利预测_{代码}_{公司名}.csv`；`--update-json` 时写入 `goal-tracker-data.json` 的 `forecast` 字段。

> 数据包含三部分：券商预测明细（每家券商 EPS/净利/分析师/评级）、一致预期（营收/净利/PE/ROE）、机构一致预期 EPS。

### 4. 估值报告索引（公司估值 → 📄 估值报告）→ `valuations/_index.json`

把 `valuations/` 下的 `.md` 估值报告登记成前端可读的索引，之后公司详情页「⚡ 决策要点 → 📄 估值报告」会按公司名自动列出报告（按日期倒序，天然形成报告历史），点一下即可在弹窗里阅读。

```bash
py scripts/build_valuation_index.py
```

- 文件名需为 `{公司名}_估值报告_{YYYYMMDD}.md`（如 `生益科技_估值报告_20260831.md`），不符合约定的文件自动跳过。
- 说明文档/模板（`估值五步法_完整说明文档.md`、`估值报告生成SOP.md`、`_报告模板.md`）不进入索引。
- **新增或重命名报告后要重跑一次本脚本**，再刷新工作台页面。
- 页面需通过 http(s) / 本地服务器打开，直接双击 HTML（file://）无法读取报告文件。

### 5. 回归测试（改完相关代码后跑一次）

```bash
node scripts/test_valuation.js        # 估值 / 待击球模块，退出码 0 = 全部通过
node scripts/test_sync_check.js       # 内核「同步盘比对」逻辑（core.js）
```

- `test_valuation.js`：用 node 的 `vm` 造最小沙箱加载 `val-core.js` + `valuation.js` + `swing.js`，直接断言纯逻辑与渲染输出（不启浏览器）：
  三级归档、估值时效、今日要处理、「⚡ 决策要点」、归档筛选、SOTP 分部估值口径、
  横向排序与排行榜（**默认按「安全边际」降序**，安全边际列/ chip 均在第一位）、对比表 CSV、组合仓位（目标达成度 + 单票超限）、空数据不崩、触发线口径。
- `test_sync_check.js`：同样用 vm 加载 `core.js`（假 DOM / 假 fetch / 假 localStorage），断言
  HEAD 预筛是否省下载、`meta.updated` 才是判定依据、30s 容差、20 分钟节流、按版本忽略、
  手动比对挑更新的候选、加载替换与取消、404 / 断网 / 格式不符 / 无时间戳时不崩。

改完对应模块（含渲染函数互调、口径调整）建议先跑一遍，能挡住"语法正确但运行时才炸"的问题。

### 6. 同步盘数据比对（不需要额外脚本）

数据主存是浏览器 IndexedDB，磁盘上的 `goal-tracker-data.json` **不会自动写回**，也只在
「本机 IndexedDB 为空（首次 / 换设备）」或「手动导入」时被读入。

于是内核加了一次启动比对（`core.js` 的 `checkRemoteData`）：

1. 先对 `./goal-tracker-data.json`、`./data/goal-tracker-data.json` 发 **HEAD**，读 `Last-Modified`；
   判断出「不可能更新」时连正文都不下载（JSON 有几 MB）。
2. 真正下载后，**以 JSON 内部的 `meta.updated` 为准**与浏览器内数据比（文件时间不可信：
   导出时间总是晚于最后落盘时间，直接用文件时间会在「刚导出」时误报）。
3. 远端确实更新 → 右上角浮出提示条（同步盘时间/条数 vs 本机时间/条数），由用户选择
   「先导出本机备份」或「加载同步盘数据」。**绝不自动覆盖**。
4. 「✕ 本次忽略」会按远端 `meta.updated` 记名，同一版本不再自动提示；侧边栏
   「🔄 检查同步盘」可随时手动比对（无视节流与忽略记录）。

阈值/行为常量都在 `core.js` 顶部：`REMOTE_MIN_GAP_MS`（默认 30s）、`REMOTE_RECHECK_MS`（默认 20 分钟）。

> 注意：两个路径同名文件时以「`meta.updated` 更新者」胜出。若你同时用脚本产出
> `data/goal-tracker-data.json`、又手动导出到根目录 `goal-tracker-data.json`，两边内容会不一致，
> 提示条会明确显示各自的时间与条数，按需选择即可。

### 7. 组合仓位的数据从哪来（不需要额外脚本）

待击球页的「⚖ 组合仓位」不维护第二份持仓，它读的是**公司估值的投资买卖记录**：

- 份额 / 成本 / 已实现盈亏：`公司估值 → 公司详情 → 📝 投资买卖记录`（买入/卖出 价格+股数）
- 仓位归类：`待击球` 台账条目上的「仓位类型」（核心候选 / 轮动 / 另册周期）
- 分母：待击球页「账户总资金」输入框（未填则退化为「持仓市值合计」，只反映相对结构）

所以要让组合仓位有数：先建估值公司 → 导入行情（现价）→ 录投资买卖记录 → 再到待击球给该公司选仓位类型。

## 导入到 GoalTracker

1. **财务数据**：公司估值 → 该公司详情 → 「财务数据」→ 「⬆ 导入 CSV」→ 选 `data/financial/{ticker}_{名}.csv`；或「⬆ 批量导入财务」多选批量导入
2. **行情快照**：公司估值 → 「⬆ 导入股价」→ 选 `data/prices/当前股价_YYYYMMDD.csv`（批量更新现价/总股本，并显示涨跌/市盈率等行情快照）
3. **财报跟踪**：财报跟踪 → 「⬆ 导入财报 CSV」→ 可多选 `data/earnings/` 下的多个 CSV（不同日期/类别分别导入分析）
4. **宏观数据**：宏观经济 → 顶部「🔄 同步最新数据」→ 直接读取仓库 `data/macro/宏观经济_全部数据.csv` 并增量合并（需通过 http(s) 打开页面，离线时用下面的方式）
   - 手动导入：「⬆ 导入全部」→ 选 `data/macro/宏观经济_全部数据.csv`（一次性导入国内+国际两张表）
   - 导出：「⬇ 导出全部」→ `宏观经济_全部数据.csv`
5. **盈利预测**：公司估值 → 「⬆ 批量导入预测」多选 `data/forecast/` 下全部 CSV（按代码/名称自动匹配公司）；单家公司也可在详情 → 「📈 盈利预测」→「⬆ 导入预测」导入
   - 导出：详情页「⬇ 导出预测」
6. **估值报告**：运行 `py scripts/build_valuation_index.py` 生成 `valuations/_index.json`，公司详情页「⚡ 决策要点」→「📄 估值报告」按公司名自动列出并可弹窗阅读

### 新批次公司完整工作流

```
财报跟踪筛选 → 「⬇ 导出公司列表」→ 公司估值「⬆ 导入公司列表」批量建卡
→ 导出文件另存/覆盖为 data/公司列表.csv
→ py scripts/fetch_financial.py --auto --quarters 18      （抓财务）
→ py scripts/fetch_profit_forecast.py --auto              （抓盈利预测）
→ 公司估值「⬆ 批量导入财务」（多选财务 CSV）+「⬆ 批量导入预测」（多选盈利预测 CSV）
```

> 若用 `--update-json` 直接更新了 `goal-tracker-data.json`，需在浏览器「⬆ 导入数据」重新导入该 JSON（会覆盖 IndexedDB，建议先「⬇ 导出备份」）。

### 公司组分析工作流

估值模块勾选若干公司 → 建公司组（如「AI算力」）→「📤 导出该组」得到 `公司组_组名_日期.csv`，三个抓取脚本都可直接消费（无需全量列表）：

```
→ py scripts/fetch_financial.py --from-csv 公司组_AI算力_2026-09-03.csv        （抓财务）
→ py scripts/fetch_profit_forecast.py --from-csv 公司组_AI算力_2026-09-03.csv  （抓盈利预测）
→ py scripts/fetch_prices.py --from-csv 公司组_AI算力_2026-09-03.csv           （抓行情快照）
→ 公司估值「⬆ 批量导入财务」+「⬆ 批量导入预测」+「⬆ 导入股价」
```

> 公司组成员按股票代码记录：公司删除后组保留，重新导入同一代码自动回到组；
> 未导入的成员在组操作条中黄字提示，抓取脚本会照常抓取（`--from-csv` 只依赖「股票代码」列）。

## 数据来源与字段说明

### 财务（东方财富 datacenter API）

- 核心财务指标：`RPT_F10_FINANCE_MAINFINADATA`
- 利润表：`RPT_F10_FINANCE_GINCOME`

映射到估值模块 12 个指标（单位：亿元 / % / 次）：

| 指标 | 东财字段 | 单位换算 |
|---|---|---|
| 总资产 totalAssets | `TOTAL_ASSETS_PK` | 元→亿 |
| 所有者权益 equity | `TOTAL_EQUITY_PK` | 元→亿 |
| 营业收入 revenue | `OPERATE_INCOME_PK` | 元→亿 |
| 毛利润 grossProfit | `TOTAL_OPERATE_INCOME - OPERATE_COST` | 元→亿 |
| 净利润 netProfit | `PARENT_NETPROFIT` | 元→亿 |
| 扣非净利润 deductedNetProfit | `KCFJCXSYJLR` | 元→亿 |
| 经营现金流 opCashFlow | `NETCASH_OPERATE_PK` | 元→亿 |
| ROE | `ROEJQ` | %（直接用） |
| 毛利率 grossMargin | `XSMLL` | % |
| 净利率 netMargin | `XSJLL` | % |
| 资产负债率 assetLiabRatio | `ZCFZL` | % |
| 总资产周转率 totalAssetTurnover | `ZZCJLL` | 次 |

> 东财接口返回「报告期累计值」，与估值模块现有财务数据口径一致。

### 宏观（东财 + akshare）

- 东财：GDP/CPI/PPI/PMI（及分产业、定基等）、海关进出口（`RPT_ECONOMY_CUSTOMS` → 出口同比）、两融余额、货币供应兜底
- akshare：LPR、M2、DR007（`repo_rate_query` 的 FR007 定盘利率，公开可得替代）、工业增加值（`gyzjz`）、社零（`consumer_goods_retail`）、固投（`gdzctz`）、出口兜底（`hgjck`）；美国 GDP/CPI/利率/非农/失业率/美债、欧元区 CPI/GDP（国际）
- 补充参考指标（akshare）：全社会用电量（`society_electricity`，经济晴雨表）、新增人民币贷款（`new_financial_credit`，信用扩张）、财政收入（`czsr`，财政发力）、企业景气指数（`enterprise_boom_index`，季度）、大宗商品价格指数（`commodity_price_index`，日度、PPI 领先）
- 统一脚本 `fetch_macro_all.py` 已合并两者为 `宏观经济_全部数据.csv`（42 个指标），`fetch_daily.py` 自动复用其指标清单
- 仍无稳定自动源、需每月手动录入：社融存量同比、核心 CPI、PMI 新订单、工业企业利润、商品房销售面积、企业/居民中长期贷款、政府债券融资、城镇调查失业率、ETF 资金流（脚本结束时会打印提醒）

> 想加宏观指标：在对应脚本的 `INDICATORS` 列表加一项即可。
> akshare 接口「今值/现值」最新一期常为 nan（未发布），脚本自动用「前值」兜底。

### 盈利预测（东方财富 F10 emweb 接口）

`https://emweb.securities.eastmoney.com/PC_HSF10/ProfitForecast/PageAjax`

一个接口返回：券商预测明细（`ycmx`）、一致预期营收/净利（`yctj_chart`）、机构一致预期 EPS（`jgyc`）、评级统计（`pjtj`）。

## 常见问题

- **控制台中文/emoji 乱码**：脚本已设置 UTF-8 输出，若终端仍乱码请用 `chcp 65001` 切换代码页。
- **接口失败**：东财接口偶尔限流，脚本内置重试；仍失败请稍后重试。
- **只想更新部分指标**：财务 CSV 中留空某列即可（导入时空值不覆盖已有数据）。
- **盈利预测更新最新数据**：重新运行 `--update-json` 会覆盖该公司 forecast 为最新抓取结果（当前为全量覆盖，非增量）。
- **换了设备 / 别处导出了新数据，本机没反应**：点侧边栏「🔄 检查同步盘」手动比对；页面启动时也会自动比对一次
  （20 分钟内不重复），发现磁盘更新会在右上角提示，由你决定是否加载。详见上文「6. 同步盘数据比对」。
- **提示条不出现**：确认页面是通过 http(s) / 本地服务器打开的——`file://` 直接双击 HTML 时浏览器禁止读取本地 JSON，
  比对与估值报告都会失效。
