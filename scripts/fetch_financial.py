# -*- coding: utf-8 -*-
"""
从东方财富抓取 A 股公司财务数据，输出为 GoalTracker 估值模块可导入的 CSV。

数据来源（东方财富公开接口，免 key）：
  ① RPT_F10_FINANCE_MAINFINADATA  核心财务指标（ROE/毛利率/净利率/负债率/总资产/营收/现金流/扣非等，
                                    含营收同比% TOTALOPERATEREVETZ、扣非净利润同比% KCFJCXSYJLRTZ）
  ② RPT_F10_FINANCE_GINCOME       利润表（营收 / 营业成本 → 毛利润 / 归母净利润）
  ③ RPT_F10_FINANCE_GBALANCE      资产负债表（应收账款 / 存货 / 合同负债 / 货币资金）

输出文件（data/ 目录）：
  {ticker}_{公司名}.csv   —— 与估值模块「⬇ 导出 / ⬆ 导入」CSV 完全兼容

用法：
  # 抓取单只
  py fetch_financial.py --ticker 688256.SH
  # 抓取多只（逗号分隔）
  py fetch_financial.py --tickers 601138.SH,000977.SZ,300308.SZ
  # 自动读取 data/公司列表_当前汇总.csv（估值模块「⬇ 导出公司列表」生成）批量抓取；
  # 文件不存在时回退：JSON → 扫描已有 CSV
  py fetch_financial.py --auto --quarters 18
  # 从公司列表 CSV 批量抓取（估值模块「⬇ 导出公司列表」或财报跟踪「⬇ 导出 CSV」均可）
  py fetch_financial.py --from-csv 公司列表.csv
  # 指定输出目录 / 最多抓取季度数（默认输出到 data/financial/）
  py fetch_financial.py --ticker 688256.SH --quarters 9
  py fetch_financial.py --ticker 688256.SH --outdir ../data/financial

说明：
  - 东财接口返回的是「报告期累计值」（一季报=Q1累计，半年报=Q1+Q2，年报=全年），
    与 GoalTracker 现有财务数据的口径一致，直接落盘即可。
  - 单个字段抓取失败时该格留空（不影响其他指标）。
"""
import argparse
import csv
import glob
import io
import os
import re
import sys

# 兼容 Windows GBK 控制台：统一用 UTF-8 输出（避免 emoji/中文打印报错）
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from eastmoney import EastmoneyClient, to_yi, _norm_report_date

# 输出文件表头（与 valuation.js 的 METRICS 顺序一致）
# 营收同比(%) 紧跟在营业收入(亿)后，扣非净利润同比(%) 紧跟在扣非净利润(亿)后。
OUT_COLUMNS = [
    'totalAssets', 'equity', 'revenue', 'revenueYoy', 'grossProfit', 'netProfit',
    'deductedNetProfit', 'deductedNetProfitYoy', 'opCashFlow', 'capex', 'roe',
    'grossMargin', 'netMargin', 'assetLiabRatio',
    'accountsReceivable', 'inventory', 'contractLiab', 'cash',
    'totalAssetTurnover',
]

# 东财字段 → (目标列, 东财字段名, 是否"元→亿"换算)。
# 说明（实测确认）：
#   - MAINFINADATA 的 *_PK 字段、净利润类字段单位是"元"，需 ÷1e8 得"亿"；
#   - ROEJQ/XSMLL/XSJLL/ZCFZL/ZZCJLL 等比率类字段已是 % / 次，直接用。
#   - GINCOME 的字段单位也是"元"，用 to_yi 换算。
MAIN_MAP = [
    ('totalAssets',          'TOTAL_ASSETS_PK',    True),   # 总资产(元→亿)
    ('equity',               'TOTAL_EQUITY_PK',    True),   # 所有者权益(元→亿)
    ('revenue',              'OPERATE_INCOME_PK',  True),   # 营业收入(元→亿)
    ('revenueYoy',           'TOTALOPERATEREVETZ', False),  # 营业总收入同比(%)，已是百分比，直接用
    ('deductedNetProfit',    'KCFJCXSYJLR',        True),   # 扣非净利润(元→亿)
    ('deductedNetProfitYoy', 'KCFJCXSYJLRTZ',      False),  # 扣非净利润同比(%)，已是百分比，直接用
    ('opCashFlow',           'NETCASH_OPERATE_PK', True),   # 经营现金流净额(元→亿)
    ('roe',                  'ROEJQ',              False),  # 净资产收益率(%)
    ('grossMargin',          'XSMLL',              False),  # 毛利率(%)
    ('netMargin',            'XSJLL',              False),  # 净利率(%)
    ('assetLiabRatio',       'ZCFZL',              False),  # 资产负债率(%)
    ('totalAssetTurnover',   'ZZCJLL',             False),  # 总资产周转率(次)
]

# 资产负债表字段（RPT_F10_FINANCE_GBALANCE）→ 目标列（单位均为"元"，用 to_yi 换算为"亿"）
BALANCE_MAP = [
    ('accountsReceivable', 'ACCOUNTS_RECE'),    # 应收账款(元)
    ('inventory',          'INVENTORY'),        # 存货(元)
    ('contractLiab',       'CONTRACT_LIAB'),    # 合同负债(元)
    ('cash',               'MONETARYFUNDS'),    # 货币资金(元)
]


def as_num(v):
    """数值转换：'-'/None/'' → None，否则 float。"""
    if v is None or v == '-' or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def scan_existing(outdir):
    """扫描 outdir 下 {ticker}_{公司名}.csv，返回 [(ticker, 公司名), ...]。"""
    result = []
    pat = re.compile(r'^([0-9]{6}\.(SH|SZ|BJ))_(.+)\.csv$')
    for f in sorted(glob.glob(os.path.join(outdir, '*.csv'))):
        base = os.path.basename(f)
        m = pat.match(base)
        if m:
            result.append((m.group(1), m.group(3)))
    return result


def _norm_ticker(s):
    """'601138' / '601138.SH' → '601138.SH'；无法识别返回原值大写。"""
    s = str(s or '').strip().upper()
    m = re.match(r'^(\d{6})(?:\.(SH|SZ|BJ))?$', s)
    if not m:
        return s or ''
    code, mkt = m.group(1), m.group(2)
    if not mkt:
        if code.startswith(('60', '68', '90')):
            mkt = 'SH'
        elif code.startswith(('00', '30', '20', '39')):
            mkt = 'SZ'
        else:
            mkt = 'BJ'
    return '%s.%s' % (code, mkt)


def load_targets_from_csv(path):
    """从公司列表 CSV 读取目标公司，返回 [(ticker, 公司名), ...]。
    兼容两种来源（都要求含「股票代码」列，「公司名称」可选）：
      ① 估值模块「⬇ 导出公司列表」生成的 CSV
      ② 财报跟踪模块「⬇ 导出 CSV」生成的筛选结果宽表（含指标列，自动忽略）
    # 开头的注释行自动跳过；按股票代码去重。"""
    if not os.path.exists(path):
        print('⚠️  文件不存在：%s' % path)
        return []
    with open(path, encoding='utf-8-sig') as f:
        lines = [ln for ln in f if not ln.lstrip().startswith('#')]
    targets, seen = [], set()
    for r in csv.DictReader(lines):
        t = _norm_ticker(r.get('股票代码'))
        n = (r.get('公司名称') or '').strip()
        if not t and not n:
            continue
        if t and t in seen:
            continue
        if t:
            seen.add(t)
        targets.append((t or n, n))
    return targets


def scan_from_json(json_path):
    """从 goal-tracker-data.json 读取全部 A 股公司，返回 [(ticker, 公司名), ...]。
    优先用于 --auto：能覆盖 JSON 里所有公司（而不只是已有 CSV 的公司）。"""
    if not os.path.exists(json_path):
        return []
    try:
        import json as _json
        with open(json_path, encoding='utf-8') as f:
            d = _json.load(f)
        cs = d.get('valuation', {}).get('companies') or []
        out = []
        for c in cs:
            t = (c.get('ticker') or '').strip().upper()
            if re.match(r'^\d{6}\.(SH|SZ|BJ)$', t):
                out.append((t, c.get('name') or t.split('.')[0]))
        return out
    except Exception as e:   # noqa: BLE001
        print('  读取 JSON 公司列表失败: %s' % e)
        return []


def fetch_one(em, ticker, name, quarters=8):
    """抓取单公司财务数据。
    返回 (真实公司名, {quarter: {col: value}})，数据按报告期排序截取最近 N 期。"""
    secu = ticker.upper()
    if '.' not in secu:
        secu = secu + '.SH' if secu[0] in '689' else secu + '.SZ'

    # 按需拉取：只请求需要的报告期数，减少网络开销（东财单次最多约 39 期）
    main = em.finance_main(secu, periods=quarters)
    income = em.finance_income(secu, periods=quarters)
    balance = em.finance_balance(secu, periods=quarters)
    cashflow = em.finance_cashflow(secu, periods=quarters)

    # 优先用东财返回的公司简称（--ticker 方式未传公司名时也能用真名）
    real_name = name
    if main:
        sn = (main[0].get('SECURITY_NAME_ABBR') or '').strip()
        if sn and (not real_name or re.fullmatch(r'[0-9]{6}(\.(SH|SZ|BJ))?', real_name or '')):
            real_name = sn

    # 以 MAINFINADATA 的报告期为基准，构建季度 → 数据行
    rows = {}
    for r in main:
        q = _norm_report_date(r.get('REPORT_DATE'))
        if not q:
            continue
        rows.setdefault(q, {})

    # 填充主指标（*_PK / 净利润类字段需"元→亿"，比率类直接用）
    for r in main:
        q = _norm_report_date(r.get('REPORT_DATE'))
        if q not in rows:
            continue
        for col, emfield, toyi in MAIN_MAP:
            val = as_num(r.get(emfield))
            if val is None:
                continue
            if toyi:
                val = round(val / 1e8, 4)
            if rows[q].get(col) is None:
                rows[q][col] = val

    # 利润表：营收(亿)/毛利润(亿)/归母净利润(亿)
    inc_by_q = {}
    for r in income:
        inc_by_q[_norm_report_date(r.get('REPORT_DATE'))] = r
    for q, r in inc_by_q.items():
        if q not in rows:
            continue
        rev = to_yi(r.get('TOTAL_OPERATE_INCOME'))
        cost = to_yi(r.get('OPERATE_COST'))
        np_ = to_yi(r.get('PARENT_NETPROFIT'))
        if rev is not None:
            rows[q]['revenue'] = rev
        if rev is not None and cost is not None:
            rows[q]['grossProfit'] = round(rev - cost, 4)
        if np_ is not None:
            rows[q]['netProfit'] = np_

    # 现金流量表：资本开支（购建固定资产、无形资产和其他长期资产支付的现金，元→亿）
    cf_by_q = {}
    for r in cashflow:
        cf_by_q[_norm_report_date(r.get('REPORT_DATE'))] = r
    for q, r in cf_by_q.items():
        if q not in rows:
            continue
        capex = to_yi(r.get('CONSTRUCT_LONG_ASSET'))
        if capex is not None:
            rows[q]['capex'] = round(capex, 4)

    # 资产负债表：应收账款/存货/合同负债/货币资金（元→亿）
    bal_by_q = {}
    for r in balance:
        bal_by_q[_norm_report_date(r.get('REPORT_DATE'))] = r
    for q, r in bal_by_q.items():
        if q not in rows:
            continue
        for col, emfield in BALANCE_MAP:
            val = to_yi(r.get(emfield))
            if val is not None:
                rows[q][col] = round(val, 4)

    # 排序并截取最近 N 期
    sorted_q = sorted(rows.keys(), key=lambda x: _qkey(x), reverse=True)[:quarters]
    return real_name, {q: rows[q] for q in sorted_q}


def _qkey(q):
    m = re.match(r'^(\d{4})Q([1-4])$', q)
    if m:
        return int(m.group(1)) * 4 + int(m.group(2))
    return 0


def write_csv(ticker, name, data, outdir, outname=None):
    """把 {quarter: {col: value}} 写成估值模块兼容的 CSV。"""
    if outname is None:
        outname = '%s_%s.csv' % (ticker, name)
    path = os.path.join(outdir, outname)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\n')
    buf.write('\ufeff')                      # BOM，Excel 识别 UTF-8
    buf.write('# GoalTracker 财务数据\n')
    buf.write('公司,%s\n' % name)
    buf.write('股票代码,%s\n' % ticker)
    buf.write('季度,' + ','.join(OUT_COLUMNS) + '\n')
    for q in sorted(data.keys(), key=_qkey):
        row = data[q]
        line = [q] + ['' if row.get(c) is None else _fmt(row.get(c)) for c in OUT_COLUMNS]
        w.writerow(line)
    content = buf.getvalue()
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    return path


def _fmt(v):
    if isinstance(v, float):
        # 去掉无意义的尾随 0
        return ('%f' % v).rstrip('0').rstrip('.')
    return str(v)


def main():
    ap = argparse.ArgumentParser(description='抓取 A 股财务数据 → GoalTracker CSV')
    ap.add_argument('--ticker', help='单只股票代码，如 688256.SH')
    ap.add_argument('--tickers', help='多只股票代码，逗号分隔')
    ap.add_argument('--auto', action='store_true', help='自动扫描 data/ 下已有公司')
    ap.add_argument('--from-csv', dest='from_csv', default=None,
                    help='从公司列表 CSV 读取目标公司（列：股票代码[,公司名称]，兼容估值模块导出/财报跟踪导出格式）')
    ap.add_argument('--quarters', type=int, default=9, help='抓取最近 N 期（默认 9）')
    ap.add_argument('--outdir', default=None, help='输出目录（默认 <scripts>/../data，即本地数据目录）')
    ap.add_argument('--json', default=None, help='公司列表来源 JSON（默认 data/goal-tracker-data.json）')
    args = ap.parse_args()

    base_data = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
    # 输出目录：默认 data/financial（公司财务数据子目录）；--outdir 显式指定时写指定目录
    if args.outdir is None:
        outdir = os.path.normpath(os.path.join(base_data, 'financial'))
    else:
        outdir = os.path.normpath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    # 确定目标公司列表
    targets = []
    if args.auto:
        # auto 模式：默认读 data/公司列表_当前汇总.csv（估值模块「⬇ 导出公司列表」生成的完整列表）；
        # 文件不存在时回退：JSON → 扫描已有 CSV
        summary_csv = os.path.join(base_data, '公司列表_当前汇总.csv')
        if os.path.exists(summary_csv):
            targets = load_targets_from_csv(summary_csv)
            print('📋 公司列表：data/公司列表_当前汇总.csv（%d 家）' % len(targets))
        else:
            print('⚠️  未找到 data/公司列表_当前汇总.csv，回退到 JSON / 已有 CSV 扫描')
            json_path = args.json or os.path.join(base_data, 'goal-tracker-data.json')
            targets = scan_from_json(json_path)
            if not targets:
                targets = scan_existing(outdir)
        if not targets:
            print('未找到公司列表，请先在估值模块「⬇ 导出公司列表」并另存为 data/公司列表_当前汇总.csv，或用 --ticker/--tickers/--json 指定。')
            return 1
    elif args.from_csv:
        targets = load_targets_from_csv(args.from_csv)
        if not targets:
            print('公司列表 CSV 中未找到任何公司（需要「股票代码」列）。')
            return 1
    else:
        tickers = args.ticker or args.tickers
        if not tickers:
            ap.print_help()
            return 1
        for t in re.split(r'[,，\s]+', tickers.strip()):
            if t:
                targets.append((t.upper(), t.split('.')[0]))   # 名字先用代码，稍后可改名

    em = EastmoneyClient()
    ok = fail = 0
    for ticker, name in targets:
        try:
            real_name, data = fetch_one(em, ticker, name, args.quarters)
            if not data:
                print('⚠️  跳过 %s：无财务数据返回' % ticker)
                fail += 1
                continue
            path = write_csv(ticker, real_name, data, outdir)
            print('✅ %s  %s → 写入 %s 期数据 → %s' % (ticker, real_name, len(data), path))
            ok += 1
        except Exception as e:   # noqa: BLE001
            print('❌ %s 抓取失败：%s' % (ticker, e))
            fail += 1

    print('\n完成：成功 %d，失败 %d。输出目录：%s' % (ok, fail, outdir))
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
