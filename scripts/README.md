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
| `fetch_macro.py` | 东财宏观指标（GDP/CPI/PPI/PMI 等） | `data/macro/` |
| `fetch_macro_ak.py` | akshare 宏观指标（债务/货币/国际） | `data/macro/` |
| `fetch_profit_forecast.py` | 东财 F10 盈利预测（券商明细+一致预期）→ CSV / 写入 JSON | `data/forecast/` |
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

# 从任意公司列表 CSV 批量抓取（兼容估值模块导出 / 财报跟踪导出格式，列：股票代码[,公司名称]）
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

# 指定公司列表来源 CSV / JSON
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

**统一脚本（推荐，含全部 23 个指标，支持增量）**：

```bash
py fetch_macro_all.py                 # 增量：保留已有数据，只补充新日期（默认）
py fetch_macro_all.py --fresh         # 全量：重新抓取全部数据
py fetch_macro_all.py --only global   # 只抓国际宏观（可选）
py fetch_macro_all.py --outdir ../data/macro
```

生成：`data/macro/宏观经济_全部数据.csv`（含「国内宏观经济」+「国际宏观经济」两张表，23 个指标）

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

# 从任意公司列表 CSV 批量抓取（兼容估值模块导出 / 财报跟踪导出格式）
py fetch_profit_forecast.py --from-csv ../data/公司列表.csv
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

## 导入到 GoalTracker

1. **财务数据**：公司估值 → 该公司详情 → 「财务数据」→ 「⬆ 导入 CSV」→ 选 `data/financial/{ticker}_{名}.csv`；或「⬆ 批量导入财务」多选批量导入
2. **行情快照**：公司估值 → 「⬆ 导入股价」→ 选 `data/prices/当前股价_YYYYMMDD.csv`（批量更新现价/总股本，并显示涨跌/市盈率等行情快照）
3. **财报跟踪**：财报跟踪 → 「⬆ 导入财报 CSV」→ 可多选 `data/earnings/` 下的多个 CSV（不同日期/类别分别导入分析）
4. **宏观数据**：宏观经济 → 顶部「⬆ 导入全部」→ 选 `data/macro/宏观经济_全部数据.csv`（一次性导入国内+国际两张表）
   - 导出：「⬇ 导出全部」→ `宏观经济_全部数据.csv`
5. **盈利预测**：公司估值 → 「⬆ 批量导入预测」多选 `data/forecast/` 下全部 CSV（按代码/名称自动匹配公司）；单家公司也可在详情 → 「📈 盈利预测」→「⬆ 导入预测」导入
   - 导出：详情页「⬇ 导出预测」

### 新批次公司完整工作流

```
财报跟踪筛选 → 「⬇ 导出公司列表」→ 公司估值「⬆ 导入公司列表」批量建卡
→ 导出文件另存/覆盖为 data/公司列表.csv
→ py scripts/fetch_financial.py --auto --quarters 18      （抓财务）
→ py scripts/fetch_profit_forecast.py --auto              （抓盈利预测）
→ 公司估值「⬆ 批量导入财务」（多选财务 CSV）+「⬆ 批量导入预测」（多选盈利预测 CSV）
```

> 若用 `--update-json` 直接更新了 `goal-tracker-data.json`，需在浏览器「⬆ 导入数据」重新导入该 JSON（会覆盖 IndexedDB，建议先「⬇ 导出备份」）。

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

- 东财：GDP/CPI/PPI/PMI（及分产业、定基等）
- akshare：LPR、M2、政府债务（国内）；美国 GDP/CPI/利率/非农/失业率/10Y国债、欧元区 CPI/GDP（国际）
- 统一脚本 `fetch_macro_all.py` 已合并两者为 `宏观经济_全部数据.csv`

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
