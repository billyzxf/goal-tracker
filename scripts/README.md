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
| `fetch_macro_all.py` | 统一宏观脚本（东财+akshare 全部指标，支持增量） | `data/macro/` |
| `fetch_macro.py` | 东财宏观指标（GDP/CPI/PPI/PMI 等） | `data/macro/` |
| `fetch_macro_ak.py` | akshare 宏观指标（债务/货币/国际） | `data/macro/` |
| `fetch_profit_forecast.py` | 东财 F10 盈利预测（券商明细+一致预期）→ CSV / 写入 JSON | `data/forecast/` |
| `requirements.txt` | Python 依赖清单 | - |

## 数据目录结构

```
data/
├── financial/     # 各公司财务数据 CSV（{ticker}_{公司名}.csv）
├── macro/         # 宏观经济数据 CSV（宏观经济_全部数据.csv 等）
├── forecast/      # 盈利预测 CSV（盈利预测_{代码}_{公司名}.csv）
├── goal-tracker-data.json   # 主数据文件（可被脚本直接更新）
└── 公司财务数据_累计.xlsx     # 其他
```

> 各脚本默认输出到对应子目录，也可用 `--outdir` 指定。

## 用法

### 1. 财务数据（估值模块）→ `data/financial/`

```bash
# 从 data/goal-tracker-data.json 读取全部公司，抓取最近 9 期并保存 CSV
py fetch_financial.py --auto

# 只抓取单只
py fetch_financial.py --ticker 688256.SH

# 抓取多只（逗号分隔）
py fetch_financial.py --tickers 601138.SH,000977.SZ,300308.SZ

# 指定抓取期数（默认最近 9 期）
py fetch_financial.py --auto --quarters 12

# 指定公司列表来源 / 输出目录
py fetch_financial.py --auto --json 其他数据.json --outdir 目标目录
```

生成：`data/financial/{ticker}_{公司名}.csv`，与估值模块「⬇ 导出 / ⬆ 导入 CSV」完全兼容。

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

**更新全量公司（推荐）**：从 `goal-tracker-data.json` 读取全部公司，抓取盈利预测并写入 JSON，同时生成 CSV。

```bash
# 全量更新：抓取所有公司 + 写入 JSON + 生成 CSV
py fetch_profit_forecast.py --json ../data/goal-tracker-data.json --update-json

# 全量更新：只写 JSON，不生成 CSV
py fetch_profit_forecast.py --json ../data/goal-tracker-data.json --update-json --no-csv
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

1. **财务数据**：公司估值 → 该公司详情 → 「财务数据」→ 「⬆ 导入 CSV」→ 选 `data/financial/{ticker}_{名}.csv`
2. **宏观数据**：宏观经济 → 顶部「⬆ 导入全部」→ 选 `data/macro/宏观经济_全部数据.csv`（一次性导入国内+国际两张表）
   - 导出：「⬇ 导出全部」→ `宏观经济_全部数据.csv`
3. **盈利预测**：公司估值 → 该公司详情 → 「📈 盈利预测」→ 「⬆ 导入预测」→ 选 `data/forecast/盈利预测_{代码}_{名}.csv`
   - 导出：「⬇ 导出预测」

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
