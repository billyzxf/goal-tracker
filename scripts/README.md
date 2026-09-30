# 数据抓取脚本（Python）

从东方财富 / akshare 公开接口抓取 A 股财务数据、盈利预测、宏观经济数据，生成 GoalTracker 可导入的 CSV，并可直接写入主数据文件 `data/goal-tracker-data.json`。

## 环境要求

- Python 3.8+
- 依赖：`pip install -r requirements.txt`（requests）
- 若用 akshare 脚本：`pip install akshare pandas`

## 文件说明

目录分组：**根目录 = 生产抓取脚本**（日常定时跑，fetch_* 前缀）；**`ops/` = 数据维护工具**（按需手动跑）；**`tests/` = 回归测试**（node 直接跑）。

**根目录 · 生产抓取**

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
| `fetch_industry_map.py` | 全市场分类地图（申万一/二/三级 + 东财行业 + 概念主题，~5500 家）→ 行业分类地图 CSV | `data/industry/` |
| `update_invest.py` | **一键研究流水线**：宏观 → 财务 → 行业跟踪 → 盈利预测 → 财报跟踪 → 行情，串行跑完汇总结果（`--only`/`--skip`/`--list`） | 各自目录 |
| `requirements.txt` | Python 依赖清单 | - |

**`ops/` · 数据维护工具（按需）**

| 文件 | 作用 | 输出目录 |
|---|---|---|
| `ops/build_stocks.py` | L0 静态公司字典（全 A 股 code/name/mkt/bd/em/sw1-3/concepts）→ stocks.json | `data/stocks.json` |
| `ops/build_manifest.py` | 扫描 data/ 生成数据清单（前端「数据新鲜度」横幅数据源） | `data/manifest.json` |
| `ops/build_valuation_index.py` | 扫描估值报告，生成前端可读索引 | `valuations/_index.json` |
| `ops/export_companies.py` | 从数据 JSON 导出公司列表 CSV（供抓取脚本 --from-csv） | `data/公司列表.csv` |
| `ops/clean_industry_members.py` | 行业池成员清洗（申万骨架 + 白名单 + 生态位说明预填，直改 invest-data.json） | `data/invest-data.json` |
| `ops/industry_prefill.py` | 行业定年纪/体检预填草稿（生成→AI 检索填充→校验，前端审核式导入） | `data/prefill/` |
| `ops/build_ai_chain.py` | 从分类地图构建 AI 产业链细分行业 JSON（行业研究导入用） | `data/industry/` |
| `ops/prune_*.py` | 概念条目噪声剔除（芯片/AI伞形/概念池/CE组装/AIApp，共 5 个） | `data/invest-data.json` |
| `ops/add_*.py` / `ops/seed_*.py` | 行业条目新增（固态电池/AI应用·Agent）、投资原则导入、生态位说明预填 | `data/invest-data.json` |

**`tests/` · 回归测试（node 直接跑，无需浏览器）**

| 文件 | 作用 |
|---|---|
| `tests/test_valuation.js` | 估值 / 待击球模块回归测试（71 项断言） |
| `tests/test_sync_check.js` | 内核「同步盘数据比对」回归测试（52 项断言） |
| `tests/test_industries.js` | 行业研究模块回归测试（251 项断言） |
| `tests/test_macro.js` | 宏观模块冒烟测试 |

## 数据目录结构

```
data/
├── financial/     # 各公司财务数据 CSV（{ticker}_{公司名}.csv）
├── earnings/      # 财报跟踪 CSV（财报跟踪_YYYYMMDD.csv）
├── macro/         # 宏观经济数据 CSV（宏观经济_全部数据.csv 等）
├── forecast/      # 盈利预测 CSV（盈利预测_{代码}_{公司名}.csv）
├── prices/        # 行情快照 CSV（当前股价_YYYYMMDD.csv，按日期存档）
├── industry/      # 全市场分类地图 CSV（行业分类地图_YYYYMMDD.csv，行业研究模块导入）
├── 公司列表.csv   # 公司列表（估值模块「⬇ 导出公司列表」生成，所有脚本的默认公司来源）
├── goal-tracker-data.json   # 主数据文件（可被脚本直接更新）
└── 公司财务数据_累计.xlsx     # 其他
```

> 各脚本默认输出到对应子目录，也可用 `--outdir` 指定。

## 用法

### 0. 一键研究流水线（推荐日常用）

```bash
py scripts/update_invest.py                 # 全部 6 步：宏观→财务→行业跟踪→盈利预测→财报跟踪→行情（--auto 模式）
py scripts/update_invest.py --only prices   # 只跑某几步（逗号分隔：macro,financial,industry,forecast,earnings,prices）
py scripts/update_invest.py --skip macro    # 跳过某几步
py scripts/update_invest.py --quarters 18   # 传给财务/预测抓取的期数
py scripts/update_invest.py --list          # 只列出步骤，不执行
```

- 单步失败**不中断**后续步骤，末尾打印汇总表；任一步失败退出码为 1（便于 CI/计划任务告警）。
- 各步均以 `--auto` 运行：默认读 `data/公司列表.csv`，缺失时回退 `data/goal-tracker-data.json`。

### 1. 财务数据（估值模块）→ `data/financial/`

```bash
# 自动模式（推荐）：读取 data/公司列表.csv（估值模块「⬇ 导出公司列表」生成）；
# --skip-unchanged 增量加速：MAIN 报告期无新增且档案最新期已有营收+净利润时，
# 跳过利润表/资产负债表/现金流量表 3 次请求（日常巡检省约 75% 请求量）
py fetch_financial.py --auto --quarters 18 --skip-unchanged

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

CSV 包含的列（顺序固定，与前端一致）：总资产、所有者权益、营业收入、**营收同比%**、毛利润、净利润、扣非净利润、**扣非净利润同比%**、经营现金流、**销售收现**、资本开支、ROE、毛利率、净利率、资产负债率、总资产周转率。同比字段取自东方财富核心财务指标接口的累计值同比（如 Q2 = 上半年累计 vs 去年同期上半年）。

> **增量档案（重要）**：每次写盘前自动读入同代码已有 CSV（公司改名也能按 6 位代码找到），
> 与本次抓取合并后写回 —— 历史报告期整期保留、新值只覆盖非空字段。因此可以长期用
> 小 `--quarters`（如 2~4 期）只拉最近财报，老数据不会丢；财报季每次新增的报告期会自动累积。

> **共享财务库 FinStats（前端架构）**：公司估值 `companies[].financials` 与财报跟踪
> `DB.earnings.rows` 同源（东财财报），两者的「财务数据写入」统一沉淀到共享库
> `DB.finstats`（`modules/finstats.js`，每行 = 公司 × 报告期全指标快照，记 `src` 来源）：
> - 两侧的 CSV 导入 / 手动编辑会自动镜像写入共享库（幂等），读路径与既有功能零改动；
> - 「📊 财报跟踪 ⇒ 同步到估值」「📈 公司估值 ⇒ 同步财报数据」两个按钮做显式跨模块
>   互转（只填空缺字段、不覆盖已有值，同步前自动快照）；
> - 首次打开投资研究时自动把存量两源数据迁移进共享库（估值优先、空位补齐、幂等）。

### 1a. 财报跟踪（财报跟踪模块）→ `data/earnings/`

按「财报实际披露日期」批量抓取最新财报，生成汇总 CSV，供前端「📊 财报跟踪」模块导入后排序 / 筛选（跟踪财务质量与增长兼具的公司）。

**三种获取来源**：

```bash
# ① 关注列表（默认）：从 data/公司列表.csv 读关注公司（不存在时回退 data/goal-tracker-data.json），取每只最新一期财报
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
财报跟踪_累计.csv                  # 增量累计档（每次运行自动维护，见下）
```

> **增量累计档**：除日期快照外，每次运行会把本次抓取并入 `data/earnings/财报跟踪_累计.csv`
> （按「6位代码+报告期」去重，新值覆盖非空字段、公司名称/行业等 meta 空位保留旧值，
> 按披露日期倒序）。财报季想累积全量历史时，**只导入这一个文件即可**，无需逐份导入日期快照；
> 快照文件行为完全不变，仍可按日期/分类分别导入分析。

**CSV 列**：股票代码、公司名称、行业、**行业二级**、**行业三级**、板块、林奇类型、披露日期、报告期、季度、营业收入(亿)、**营收同比%**、毛利润(亿)、净利润(亿)、扣非净利润(亿)、**扣非净利同比%**、经营现金流(亿)、**销售收现(亿)**、资本开支(亿)、ROE、毛利率。

> 行业三级分类取自东财 F10 `BOARD_NAME_LEVEL`（申万口径，如「电子-消费电子-消费电子零部件及组装」），实测覆盖率 100%。

**导入**：前端「财报跟踪」→ 「⬆ 导入财报 CSV」→ 可多选文件分别导入分析。支持按任意指标排序（点击列头，含披露日期/季度）、行业**三级级联**筛选（选一级后展开二级、再展开三级）、板块**多选**筛选、L1 真实性五项规则独立勾选组合（扣非净利同比、扣非/净利比、净现比、收现比 = 销售收现÷营收 等，chip 上实时显示满足家数，**默认全选**）。

**导出**（均弹出另存为对话框）：
- 「⬇ 导出 CSV」：导出满足全部筛选条件的公司及指标数据，可回导
- 「⬇ 导出公司列表」：导出估值模块「⬆ 导入公司列表」可直接使用的公司列表 CSV

> 说明：
> - 披露日期取自东方财富业绩报表接口（`RPT_LICO_FN_CPD`），即财报实际发布日。
> - 按日期获取的"更多公司"会通过 `RPT_F10_BASIC_ORGINFO` 批量补充行业/板块标签，与关注列表公司展示一致。
> - 完整指标（扣非/经营现金流/资本开支/毛利润）需逐公司补齐，默认开启（`--no-full` 可跳过）。
> - 性能：批量获取的主要耗时是每家公司 3 次 F10 请求；按日期抓取时先用 `--min-yoy 20` 过滤（在补齐之前执行）通常可把 3000+ 家压到 800 家左右，或适当调大 `--workers`（默认 6）。
> - 指定公司列表来源 JSON / 输出目录：`py fetch_earnings.py --json 其他数据.json --outdir 目标目录`（默认读 `data/公司列表.csv`，行业/板块/林奇类型标签同步取自该文件）。

### 1b. 行情快照（估值模块）→ 生成股价 CSV（按日期存档），浏览器批量导入

无需在浏览器手动一个个更新股价。运行脚本批量拉取行情快照，生成「股价 CSV」到 `data/prices/当前股价_YYYYMMDD.csv`（按日期存档，保留历史），再在浏览器「公司估值 → ⬆ 导入股价」选择它即可批量更新（脚本不修改 JSON）：

```bash
# 默认只拉 data/公司列表.csv 的核心跟踪池（控制请求量，避免触发接口限流）
py fetch_prices.py

# 全量模式：三源合并估值池 + 财报池全部公司（按 6 位代码去重，5000+ 家，易触发限流，慎用）：
#   ① data/公司列表.csv（估值模块「⬇ 导出公司列表」生成）
#   ② data/goal-tracker-data.json 的估值池 companies + 财报池 earnings.rows
#   ③ data/earnings/ 下最新的 财报跟踪_*.csv
py fetch_prices.py --all

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

### 1c. 全市场分类地图（行业研究模块）→ `data/industry/`

```bash
py fetch_industry_map.py                 # 全量：申万三级 + 东财行业 + 概念主题（~5500 家，约 2-4 分钟）
py fetch_industry_map.py --no-sw         # 跳过申万（财报 CSV 已带申万时可省）
py fetch_industry_map.py --no-concept    # 跳过概念（省 ~350 请求）
```

- 数据源：东财 push2 clist（全市场 + 东财行业）+ RPT_F10_BASIC_ORGINFO（申万一/二/三级）+ RPT_F10_CORETHEME_BOARDTYPE（F10 核心题材/概念标签）。
- 生成 `data/industry/行业分类地图_YYYYMMDD.csv`，列：`股票代码,股票名称,东财行业,申万一级,申万二级,申万三级,概念标签,数据日期`（代码为 6 位纯数字）。
- 导入：行业研究 → 「⬆ 导入分类地图」。导入后可按 申万一级/二级/三级、东财行业、概念·主题 五个体系浏览全市场分类，点击任意分类查看财报池/估值池命中公司的最新财务数据。
- 网络说明：https 主站 push2 在部分网络下会被 RST，脚本自动回退 http 数字镜像与延时镜像；默认直连，失败再走系统代理。

### 2. 宏观数据（宏观模块）→ `data/macro/`

**统一脚本（推荐，含全部 47 个指标，支持增量）**：

```bash
py fetch_macro_all.py                 # 增量：保留已有数据，只补充新日期（默认）
py fetch_macro_all.py --fresh         # 全量：重新抓取全部数据
py fetch_macro_all.py --only global   # 只抓国际宏观（可选）
py fetch_macro_all.py --outdir ../data/macro
```

生成：`data/macro/宏观经济_全部数据.csv`（含「国内宏观经济」+「国际宏观经济」两张表，47 个指标）

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

**更新全量公司（推荐）**：`--auto` 读取 `data/公司列表.csv`（估值模块「⬇ 导出公司列表」生成）获取全部公司；文件不存在时回退 `data/goal-tracker-data.json`。

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

生成：`data/forecast/盈利预测_{代码}_{公司名}.csv`；`--update-json` 时写入 `data/goal-tracker-data.json` 的 `forecast` 字段。

> 数据包含三部分：券商预测明细（每家券商 EPS/净利/分析师/评级）、一致预期（营收/净利/PE/ROE）、机构一致预期 EPS。

### 4. 估值报告索引（公司估值 → 📄 估值报告）→ `valuations/_index.json`

把 `valuations/` 下的 `.md` 估值报告登记成前端可读的索引，之后公司详情页「⚡ 决策要点 → 📄 估值报告」会按公司名自动列出报告（按日期倒序，天然形成报告历史），点一下即可在弹窗里阅读。

```bash
py scripts/ops/build_valuation_index.py
```

- 文件名需为 `{公司名}_估值报告_{YYYYMMDD}.md`（如 `生益科技_估值报告_20260831.md`），不符合约定的文件自动跳过。
- 说明文档/模板（`估值五步法_完整说明文档.md`、`估值报告生成SOP.md`、`_报告模板.md`）不进入索引。
- **新增或重命名报告后要重跑一次本脚本**，再刷新工作台页面。
- 页面需通过 http(s) / 本地服务器打开，直接双击 HTML（file://）无法读取报告文件。

### 4a. L0 静态公司字典（数据导入模块）→ `data/stocks.json`

全 A 股 ~5500 家静态公司字典（L0 层，管道拥有、整体替换），供估值自动带出行业/板块、财报池行业回填、行业研究等模块复用。**导入入口：「🗃️ 数据导入」模块**（http(s) 打开页面时启动自动加载，无需手动导入；file:// 下在模块里手动导入一次并缓存到浏览器）。

```bash
py scripts/ops/build_stocks.py                 # 自动：data/industry/ 下 CSV 30 天内够新则零联网
py scripts/ops/build_stocks.py --force-fetch   # 强制联网重抓（同时落一份新 CSV）
py scripts/ops/build_stocks.py --csv 路径.csv  # 指定 行业分类地图_*.csv
```

- 字段：code(6位)/name/mkt/bd/em/sw1/sw2/sw3/concepts，键名与旧 industryMap.rows 一致。
- 建议周期：**每月 1 次**，或申万行业调整后（`--force-fetch`）。
- 上游数据源：`fetch_industry_map.py` 的产物 CSV（超过 30 天会被自动判定为过期并联网重抓）。

### 4b. 更新周期速查（各数据的执行方法与频率）

| 数据 | 脚本 | 周期 | 导入入口 |
|---|---|---|---|
| **全量一键更新** | `py scripts/update_invest.py` | **每交易日收盘后**（替代逐个跑） | 各模块分别导入，或看运行末尾汇总 |
| L0 静态字典 stocks.json | `py scripts/ops/build_stocks.py` | 每月 1 次 / 行业调整后 | 「🗃️ 数据导入」（http 自动加载） |
| 行情快照（现价/涨幅/PE/市值） | `py scripts/fetch_prices.py` | **每交易日收盘后** | 「🗃️ 数据导入 ⬆ 导入股价 CSV」或「公司估值 ⬆ 导入股价」 |
| 财报跟踪池 | `py scripts/fetch_earnings.py` | 财报季每日 | 「📊 财报跟踪 ⬆ 导入财报 CSV」 |
| 公司财务 18 期 | `py scripts/fetch_financial.py --auto --skip-unchanged` | 财报季 / 按需 | 「公司估值 ⬆ 批量导入财务」 |
| 盈利预测 | `py scripts/fetch_profit_forecast.py --auto` | 每周 | 「公司估值 ⬆ 批量导入预测」 |
| 行业分类地图 | `py scripts/fetch_industry_map.py` | 每月 / rebuild stocks.json 前 | 「🏭 行业研究 ⬆ 导入分类地图」 |
| 宏观日度/周度 | `py scripts/fetch_daily.py` | **每日**（已配 GitHub Actions） | 「🌐 宏观经济 🔄 同步最新数据」 |
| 宏观月度全量 | `py scripts/fetch_macro_all.py` | 每周 | 同上 |
| 估值报告索引 | `py scripts/ops/build_valuation_index.py` | 新增/重命名报告后 | 公司详情页「📄 估值报告」（自动列出） |
| 行业池成员清洗 | `py scripts/ops/clean_industry_members.py` | 按需 | 直改 invest-data.json，浏览器端同步提示 |
| 概念条目噪声剔除 | `py scripts/ops/prune_chip_concept.py` | 按需 | 写 ind.excludes 屏蔽名单（国产芯片 426→133），详情页可 🚫/解除 |

> 行情快照是全站一份数据（DB.quotes）：任何入口导入一次，财报跟踪 / 行业研究 / 待击球 / 公司估值全部生效。

### 4c. 行业定年纪/体检 AI 预填（行业研究模块）→ `data/prefill/`

把「手工填表」变成「审核草稿」：国产化率（定年纪）、TAM / 自给率（做体检）目前全手工录入，本工具走三步：

```bash
py scripts/ops/industry_prefill.py --list                  # 列出已收录行业与已有草稿
py scripts/ops/industry_prefill.py --new 半导体设备         # ① 生成草稿（含 AI 检索指引 _howto + 现有值 + 成分公司样本）
# ② 把草稿 JSON 交给 AI 助手：按 _howto 联网检索，填 prefill、来源写 sources
py scripts/ops/industry_prefill.py --check data/prefill/半导体设备_预填草稿.json   # ③ 导入前校验 + 模拟（填什么/跳什么）
```

- **导入**：行业研究 → 行业详情 → 「🕰 定年纪」→「🤖 导入预填」选草稿 JSON。
- **只填空、绝不覆盖**：已有值自动跳过（导入完成会列出跳过明细）；待确认项标 🤖 徽章（hover 看来源），编辑任一字段即确认该项，「✓ 全部确认」一键清除标记。
- **前端自动交叉判断**：定年纪新增「生命周期标尺」（0–100% 五段：导入极早 / 导入→成长 / 加速段⭐ / 成长中后 / 成熟尾声，● 当前 ○ 上期 ▲ 目标）与「🧭 周期位置综合判断」（阶段 × 爬坡斜率 × TAM CAGR × 自给率结构 → 介入窗口结论）。
- 本脚本不联网：检索由 AI 助手完成；前端导入是唯一写入口，脚本绝不直改 invest-data.json。

### 5. 回归测试（改完相关代码后跑一次）

```bash
node scripts/tests/test_valuation.js     # 估值 / 待击球模块，退出码 0 = 全部通过
node scripts/tests/test_sync_check.js    # 内核「同步盘比对」逻辑（core.js）
node scripts/tests/test_industries.js    # 行业研究模块（industries.js）
node scripts/tests/test_macro.js         # 宏观模块冒烟（macro.js）
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
6. **估值报告**：运行 `py scripts/ops/build_valuation_index.py` 生成 `valuations/_index.json`，公司详情页「⚡ 决策要点」→「📄 估值报告」按公司名自动列出并可弹窗阅读

### 新批次公司完整工作流

```
财报跟踪筛选 → 「⬇ 导出公司列表」→ 公司估值「⬆ 导入公司列表」批量建卡
→ 导出文件另存/覆盖为 data/公司列表.csv
→ py scripts/fetch_financial.py --auto --quarters 18      （抓财务）
→ py scripts/fetch_profit_forecast.py --auto              （抓盈利预测）
→ 公司估值「⬆ 批量导入财务」（多选财务 CSV）+「⬆ 批量导入预测」（多选盈利预测 CSV）
```

> 若用 `--update-json` 直接更新了 `data/goal-tracker-data.json`，需在浏览器「⬆ 导入数据」重新导入该 JSON（会覆盖 IndexedDB，建议先「⬇ 导出备份」）。

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
- 行业高频（L2 行业温度计数据源）：Yahoo（WTI `CL=F`、VIX `^VIX`，日度）、dramx.com（DRAM DDR4 8Gb / DDR5 16Gb 现货盘平均，每日爬虫，公开数据）
- 行业跟踪 9 项已自动化（`fetch_daily.py` 或 `update_invest.py` 的 industry 步骤更新）：
  VLCC 运价（上海航交所 CTFI 页 CT1 指数点，失败时 akshare `macro_china_freight_index` 的 BDTI 兜底）、
  电源设备 PE（akshare `sw_index_second_info` 申万二级「其他电源设备Ⅱ」TTM 快照，日度一点逐步积累历史）、
  游戏版号（NPPA 官网列表页+详情页，最大序号=当月发放数量，月度）、
  云厂 CapEx 同比（stockanalysis.com 四家季度现金流量表爬取汇总，季度）、
  存储 ROE / 军工合同负债同比 / 巨化毛利率 / 江铜毛利率 / 沪电营收同比
  （读 `data/financial/` 本地档案：香农芯创 roe、中国船舶 contractLiab 同比、巨化股份 grossMargin、
  江西铜业 grossMargin、沪电股份 revenueYoy，季度——后三项为 R32/铜TC/PCB 能见度无免费源时的替代观测）
- 统一脚本 `fetch_macro_all.py` 已合并两者为 `宏观经济_全部数据.csv`（56 个指标），`fetch_daily.py` 自动复用其指标清单
- 仍无稳定自动源、需手动录入：社融存量同比、PMI 新订单、城镇调查失业率，以及行业跟踪中的 R32（生意社反爬，可借巨化毛利率替代观测）/ 铜 TC（SMM 付费，可借 BDI 铜矿运量侧面观测）/ PCB 能见度（纯调研口径）（脚本结束时会打印提醒）。已下线（无源且无数据）：政府债券融资、居民中长贷、商品房销售、工业企业利润、核心 CPI、ETF 资金流、企业/居民中长贷分项、BDTI

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
