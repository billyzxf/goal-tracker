# -*- coding: utf-8 -*-
"""
按「财报实际披露日期」批量获取财报 → 财报跟踪 CSV。
=================================================================
从东方财富抓取财报的核心指标，生成一个或多个汇总 CSV，
供前端「财报跟踪」模块导入后排序 / 筛选（按披露日期、营收同比、扣非净利同比等）。

支持三种获取来源：
  ① 关注列表（默认）        —— 从公司列表 JSON / CSV 读取关注公司，取每只最新一期财报
  ② 指定关注公司 --codes    —— 只获取指定股票代码的公司
  ③ 按披露日期 --date       —— 不限股票列表，获取指定披露日期/范围内发布财报的【全部】公司

CSV 命名规则（按财报发布日期 + 类别，支持存多个、互不覆盖）：
  关注列表/指定公司   → 财报跟踪_今日.csv（或追加 _类别）
  按披露日期（单日）   → 财报跟踪_YYYYMMDD.csv（或追加 _类别）
  按披露日期（范围）   → 财报跟踪_YYYYMMDD-YYYYMMDD.csv（或追加 _类别）

数据来源（东方财富公开接口，免费、免 key）：
  ① RPT_LICO_FN_CPD（业绩报表）     最新一期业绩 + 实际披露日期 NOTICE_DATE
                                     营收/净利/同比/ROE/毛利率/每股经营现金流
  ② RPT_F10_FINANCE_MAINFINADATA    扣非净利润(元)/扣非净利同比%/经营现金流净额(元)
  ③ RPT_F10_FINANCE_GCASHFLOW       资本开支（购建固定资产等，元）
  ④ RPT_F10_BASIC_ORGINFO           行业/板块（按日期获取的公司补充标签）
  ⑤ F10 盈利预测接口                当年一致预期（--consensus 开启）

用法示例：
  # ① 关注列表最新财报（默认）
  py fetch_earnings.py

  # ② 指定关注公司
  py fetch_earnings.py --codes 601138,300308,000977

  # ③ 指定披露日期（当天发布财报的全部公司）
  py fetch_earnings.py --date 2026-08-12

  # ③ 披露日期范围 + 只保留营收同比≥20% + 指定市场 + 分类标签
  py fetch_earnings.py --start 2026-08-01 --end 2026-08-31 --min-yoy 20 --market SH,SZ --category 8月
  py fetch_earnings.py --date 2026-08-12 --consensus --limit 100

说明：
  - 按披露日期获取（模式③）默认【仅 A 股主板】（上证主板 60/深证主板 00），
    如需包含创业板/科创板/北交所，加 --include-gem / --include-star / --include-bj，
    或直接 --all-board 包含全部板块。
  - 关注列表 / 指定公司（模式①②）为用户显式选择的公司，不额外过滤板块。
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import time
import datetime

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from eastmoney import EastmoneyClient, to_yi, _norm_report_date

# 汇总 CSV 列（与前端 earnings.js 的列定义顺序一致）
# 「当年一致预期」取财报发布年份（披露日期年份）的一致预期：
#   预期营收(亿)/预期净利(亿)/预期营收同比%/预期净利同比%
#   —— 用于判断财报是否超预期（实际营收/净利 vs 当年一致预期）。
OUT_COLUMNS = [
    '股票代码', '公司名称', '行业', '板块', '林奇类型',
    '披露日期', '报告期', '季度',
    '营业收入', '营收同比', '毛利润', '净利润', '扣非净利润', '扣非净利同比',
    '经营现金流', '资本开支', 'ROE', '毛利率',
    '预期营收', '预期净利', '预期营收同比', '预期净利同比',
]

# 业绩报表接口能直接提供的字段 → 仅依赖业绩报表时的列（按日期获取可快速生成）
EARNINGS_ONLY_COLUMNS = [
    '股票代码', '公司名称', '行业', '板块', '林奇类型',
    '披露日期', '报告期', '季度',
    '营业收入', '营收同比', '净利润', 'ROE', '毛利率',
]


def as_num(v):
    if v is None or v == '-' or v == '':
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def date_key(s):
    """披露日期字符串 → 可比较的 (年,月,日) 元组；无效返回 (0,0,0)。"""
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})', str(s or ''))
    if m:
        return tuple(int(x) for x in m.groups())
    return (0, 0, 0)


def norm_code(s):
    """'601138'/'601138.SH' → '601138.SH'；无法识别返回 None。"""
    s = str(s or '').strip().upper()
    m = re.match(r'^(\d{6})(?:\.(SH|SZ|BJ))?$', s)
    if not m:
        return None
    code, mkt = m.group(1), m.group(2)
    if not mkt:
        if code.startswith(('60', '68', '90')):
            mkt = 'SH'
        elif code.startswith(('00', '30', '20', '39')):
            mkt = 'SZ'
        else:
            mkt = 'BJ'
    return '%s.%s' % (code, mkt)


def market_of(code):
    """根据股票代码判断市场；返回 'SH'/'SZ'/'BJ'，北交所/新三板返回 'BJ'。"""
    c = str(code or '').split('.')[0]
    if c.startswith(('60', '68', '90')):
        return 'SH'
    if c.startswith(('00', '30', '20', '39')):
        return 'SZ'
    return 'BJ'


def is_a_share(r):
    """业绩报表记录是否属于 A 股（主板/创业板/科创板/北交所），排除新三板/三板股。"""
    typ = str(r.get('SECURITY_TYPE') or '')
    return 'A股' in typ or '北交' in typ or ('主板' in typ) or ('创业' in typ) or ('科创' in typ)


def board_of(code):
    """根据股票代码判断板块；返回 '主板'/'创业板'/'科创板'/'北交所'。"""
    c = str(code or '').split('.')[0]
    if c.startswith(('60', '90')):      # 600/601/603/605 上证主板、900 B股
        return '主板'
    if c.startswith('68'):              # 688 科创板
        return '科创板'
    if c.startswith(('00', '20')):      # 000/001/002/003 深证主板、200 B股
        return '主板'
    if c.startswith('30'):              # 300/301 创业板
        return '创业板'
    return '北交所'


def is_main_board(code):
    """是否 A 股主板（上证主板 60 开头 / 深证主板 00 开头）。"""
    c = str(code or '').split('.')[0]
    return c.startswith('60') or c.startswith('00')


def load_companies_meta(json_path):
    """从 JSON 读公司列表；并尝试从 data/公司列表.csv 读取行业/板块/林奇类型。
    返回 {ticker: {name, industry, board, companyType}}。"""
    meta = {}
    if json_path and os.path.exists(json_path):
        try:
            with open(json_path, encoding='utf-8') as f:
                d = json.load(f)
            for c in (d.get('valuation', {}).get('companies') or []):
                t = (c.get('ticker') or '').strip().upper()
                if re.match(r'^\d{6}\.(SH|SZ|BJ)$', t):
                    meta[t] = {
                        'name': c.get('name') or t.split('.')[0],
                        'industry': c.get('industry') or '',
                        'board': c.get('board') or '',
                        'companyType': c.get('companyType') or '',
                    }
        except Exception as e:   # noqa: BLE001
            print('  读取 JSON 公司列表失败: %s' % e)

    # 补充：公司列表 CSV（若存在且 JSON 里缺标签）
    csv_path = os.path.normpath(os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'data', '公司列表.csv'))
    if os.path.exists(csv_path):
        try:
            with open(csv_path, encoding='utf-8-sig') as f:
                rd = csv.reader(f)
                header = None
                for row in rd:
                    if not row:
                        continue
                    if header is None:
                        header = row
                        continue
                    if len(row) < 2:
                        continue
                    code = (row[0] or '').strip().upper()
                    if re.match(r'^\d{6}\.(SH|SZ|BJ)$', code):
                        cur = meta.setdefault(code, {'name': row[1].strip(), 'industry': '', 'board': '', 'companyType': ''})
                        if len(row) > 1 and row[1].strip():
                            cur['name'] = row[1].strip()
                        # 公司列表 CSV 列：股票代码,公司名称,板块,行业,细分领域,市场,林奇类型
                        if len(row) > 2 and row[2].strip():
                            cur['board'] = row[2].strip()
                        if len(row) > 3 and row[3].strip():
                            cur['industry'] = row[3].strip()
                        if len(row) > 6 and row[6].strip():
                            cur['companyType'] = row[6].strip()
        except Exception as e:   # noqa: BLE001
            print('  读取公司列表 CSV 失败: %s' % e)
    return meta


def _enrich_financials(em, row, latest):
    """补齐扣非净利润/扣非净利同比/经营现金流/资本开支（基于最新一期）。"""
    secu = row['股票代码']
    q = _norm_report_date(latest.get('REPORTDATE'))
    try:
        main = em.finance_main(secu, periods=6)
        if main:
            for r in main:
                if _norm_report_date(r.get('REPORT_DATE')) == q:
                    row['扣非净利润'] = to_yi(r.get('KCFJCXSYJLR'))
                    row['扣非净利同比'] = as_num(r.get('KCFJCXSYJLRTZ'))
                    row['经营现金流'] = to_yi(r.get('NETCASH_OPERATE_PK'))
                    break
    except Exception:   # noqa: BLE001
        pass
    try:
        cf = em.finance_cashflow(secu, periods=6)
        if cf:
            for r in cf:
                if _norm_report_date(r.get('REPORT_DATE')) == q:
                    capex = to_yi(r.get('CONSTRUCT_LONG_ASSET'))
                    if capex is not None:
                        row['资本开支'] = round(capex, 4)
                    break
    except Exception:   # noqa: BLE001
        pass
    try:
        inc = em.finance_income(secu, periods=6)
        if inc:
            for r in inc:
                if _norm_report_date(r.get('REPORT_DATE')) == q:
                    rev = to_yi(r.get('TOTAL_OPERATE_INCOME'))
                    cost = to_yi(r.get('OPERATE_COST'))
                    if rev is not None and cost is not None:
                        row['毛利润'] = round(rev - cost, 4)
                    break
    except Exception:   # noqa: BLE001
        pass


# 本地盈利预测缓存目录（fetch_profit_forecast.py 生成的 盈利预测_{代码}_{名称}.csv）
FORECAST_DIR = os.path.normpath(os.path.join(
    os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'forecast'))

_FC_CACHE = {}   # 股票代码 → {年份: {...一致预期}}；None 表示本地无该股票缓存（需走 API）


def _forecast_from_cache(secu, year):
    """从 data/forecast/盈利预测_{secu}_*.csv 读取指定年份的一致预期。

    返回 {revenue, np, revRatio, npRatio}（营收/净利单位：亿，CSV 中已是亿），
    无缓存文件 / 解析失败 / 该年份缺失返回 None。每只股票的 CSV 只解析一次。
    """
    if secu in _FC_CACHE:
        return (_FC_CACHE[secu] or {}).get(year)

    # 找该股票的全部预测 CSV，取最新修改的一份
    prefix = '盈利预测_%s_' % secu
    candidates = []
    if os.path.isdir(FORECAST_DIR):
        for fn in os.listdir(FORECAST_DIR):
            if fn.startswith(prefix) and fn.endswith('.csv'):
                p = os.path.join(FORECAST_DIR, fn)
                candidates.append((os.path.getmtime(p), p))
    if not candidates:
        _FC_CACHE[secu] = None
        return None

    path = max(candidates)[1]
    by_year = {}
    try:
        with open(path, encoding='utf-8-sig') as f:
            for parts in csv.reader(f):
                if not parts or parts[0].strip().upper() != 'CONS':
                    continue
                # CONS,年份,标记,EPS,PE,ROE,营收(亿),净利(亿),营收同比%,净利同比%
                if len(parts) < 10:
                    continue

                def _f(idx):
                    v = parts[idx].strip()
                    try:
                        return float(v) if v else None
                    except ValueError:
                        return None

                y = parts[1].strip()
                if y.isdigit():
                    by_year[y] = {'revenue': _f(6), 'np': _f(7),
                                  'revRatio': _f(8), 'npRatio': _f(9)}
    except Exception:   # noqa: BLE001
        by_year = {}

    _FC_CACHE[secu] = by_year or None
    return (by_year or {}).get(year)


def _add_consensus(em, row):
    """补当年一致预期（营收/净利/同比）——取财报发布年份的一致预期。

    优先读本地缓存 data/forecast/盈利预测_{股票代码}_*.csv（由 fetch_profit_forecast.py
    生成，CONS 区块：年份/标记/EPS/PE/ROE/营收(亿)/净利(亿)/营收同比%/净利同比%），
    缓存未命中该股票或该年份时才请求 F10 接口——批量场景下大幅提速。
    """
    pub_year = None
    m = re.match(r'^(\d{4})', str(row.get('披露日期') or ''))
    if m:
        pub_year = int(m.group(1))
    if not pub_year:
        return

    # —— 第一优先级：本地 CSV 缓存 ——
    hit = _forecast_from_cache(row['股票代码'], str(pub_year))
    if hit:
        row['预期营收'] = hit['revenue']
        row['预期净利'] = hit['np']
        row['预期营收同比'] = hit['revRatio']
        row['预期净利同比'] = hit['npRatio']
        return

    # —— 回退：请求 F10 接口 ——
    try:
        from fetch_profit_forecast import fetch_forecast as _fc
        fc = _fc(row['股票代码'])
        raw = next((c for c in (fc.get('chart') or []) if str(c.get('YEAR')) == str(pub_year)), None)
        if raw:
            row['预期营收'] = (raw.get('TOTAL_OPERATE_INCOME') / 1e8) if raw.get('TOTAL_OPERATE_INCOME') else None
            row['预期净利'] = (raw.get('PARENT_NETPROFIT') / 1e8) if raw.get('PARENT_NETPROFIT') else None
            row['预期营收同比'] = as_num(raw.get('TOTAL_OPERATE_INCOME_RATIO'))
            row['预期净利同比'] = as_num(raw.get('PARENT_NETPROFIT_RATIO'))
    except Exception:   # noqa: BLE001
        pass


def fetch_latest_earnings(em, ticker, name='', with_consensus=True, with_full=True):
    """抓取单公司最新一期财报，返回汇总行 dict（键为 OUT_COLUMNS 中文名）。"""
    secu = ticker.upper()
    try:
        earnings = em.finance_earnings(secu, periods=6)
    except Exception:   # noqa: BLE001
        return None
    if not earnings:
        return None
    # 取披露日期最近的一期
    latest = max(earnings, key=lambda r: date_key(r.get('NOTICE_DATE')))

    row = {
        '股票代码': ticker,
        '公司名称': latest.get('SECURITY_NAME_ABBR') or name,
        '披露日期': (latest.get('NOTICE_DATE') or '')[:10],
        '报告期': (latest.get('REPORTDATE') or '')[:10],
        '季度': latest.get('QDATE') or '',
        '营业收入': to_yi(latest.get('TOTAL_OPERATE_INCOME')),
        '营收同比': as_num(latest.get('YSTZ')),
        '净利润': to_yi(latest.get('PARENT_NETPROFIT')),
        'ROE': as_num(latest.get('WEIGHTAVG_ROE')),
        '毛利率': as_num(latest.get('XSMLL')),
    }

    if with_full:
        _enrich_financials(em, row, latest)
    if with_consensus:
        _add_consensus(em, row)
    return row


def fetch_by_date(em, date_from, date_to, opts):
    """按披露日期获取全部公司财报。opts: {min_yoy, markets, with_full, with_consensus, limit, include_non_a}。"""
    try:
        data, count = em.finance_earnings_by_date(date_from, date_to, page_size=500)
    except Exception as e:   # noqa: BLE001
        print('  按日期查询业绩报表失败: %s' % str(e)[:100])
        return []
    if not data:
        print('  %s ~ %s 无披露财报记录' % (date_from, date_to))
        return []

    # 市场过滤：默认排除新三板/三板股，只留 A 股；默认仅主板（可通过 include_* 放开）
    markets = set(opts['markets'])
    boards = opts['boards']             # set，如 {'主板'}
    filtered = []
    for r in data:
        if not opts['include_non_a'] and not is_a_share(r):
            continue
        code6 = str(r.get('SECURITY_CODE') or '')
        if markets and market_of(code6) not in markets:
            continue
        # 板块过滤：默认只留主板
        b = board_of(code6)
        if boards and b not in boards:
            continue
        filtered.append(r)
    print('  披露记录 %d 条，过滤后 %d 家（板块=%s，市场=%s）' % (
        len(data), len(filtered), sorted(boards) if boards else 'ALL', markets or 'ALL'))

    # 每只取最新一期（同一公司可能在范围内多次披露，去重取最新）
    by_code = {}
    for r in filtered:
        code6 = str(r.get('SECURITY_CODE') or '')
        if not code6:
            continue
        if code6 not in by_code or date_key(r.get('NOTICE_DATE')) > date_key(by_code[code6].get('NOTICE_DATE')):
            by_code[code6] = r
    items = list(by_code.values())

    # 营收同比过滤
    if opts['min_yoy'] is not None:
        before = len(items)
        items = [r for r in items if (as_num(r.get('YSTZ')) or -1e9) >= opts['min_yoy']]
        print('  营收同比 ≥ %d%%：%d/%d 家' % (opts['min_yoy'], len(items), before))

    if opts['limit']:
        items = items[:opts['limit']]

    # 批量补行业/板块
    secus = []
    for r in items:
        c6 = str(r.get('SECURITY_CODE') or '')
        secus.append('%s.%s' % (c6, market_of(c6)))
    org = em.basic_orginfo(secus)

    rows = []
    for r in items:
        code6 = str(r.get('SECURITY_CODE') or '')
        secu = '%s.%s' % (code6, market_of(code6))
        info = org.get(code6, {})
        row = {
            '股票代码': secu,
            '公司名称': r.get('SECURITY_NAME_ABBR') or '',
            '行业': info.get('industry') or '',
            '板块': info.get('board') or '',
            '林奇类型': '',
            '披露日期': (r.get('NOTICE_DATE') or '')[:10],
            '报告期': (r.get('REPORTDATE') or '')[:10],
            '季度': r.get('QDATE') or '',
            '营业收入': to_yi(r.get('TOTAL_OPERATE_INCOME')),
            '营收同比': as_num(r.get('YSTZ')),
            '净利润': to_yi(r.get('PARENT_NETPROFIT')),
            'ROE': as_num(r.get('WEIGHTAVG_ROE')),
            '毛利率': as_num(r.get('XSMLL')),
        }
        if opts['with_full']:
            _enrich_financials(em, row, r)
        if opts['with_consensus']:
            _add_consensus(em, row)
        rows.append(row)
    return rows


def write_csv(rows, outpath):
    os.makedirs(os.path.dirname(outpath), exist_ok=True)
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator='\n')
    buf.write('\ufeff')
    buf.write('# GoalTracker 财报跟踪\n')
    w.writerow(OUT_COLUMNS)
    for row in rows:
        w.writerow([row.get(c, '') if row.get(c) is not None else '' for c in OUT_COLUMNS])
    with open(outpath, 'w', encoding='utf-8', newline='') as f:
        f.write(buf.getvalue())
    return outpath


def main():
    ap = argparse.ArgumentParser(
        description='按财报发布日期批量获取财报 → 财报跟踪 CSV',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__)
    ap.add_argument('--json', default=None, help='公司列表来源 JSON（默认项目根目录 goal-tracker-data.json）')
    ap.add_argument('--outdir', default=None, help='输出目录（默认 data/earnings/）')
    ap.add_argument('--codes', default=None,
                    help='指定关注公司股票代码（逗号分隔，如 601138,300308.SZ），可带或不带后缀')
    ap.add_argument('--date', action='append', metavar='YYYY-MM-DD',
                    help='按披露日期获取全部公司；可多次；单日即可')
    ap.add_argument('--start', metavar='YYYY-MM-DD', help='披露日期范围开始')
    ap.add_argument('--end', metavar='YYYY-MM-DD', help='披露日期范围结束')
    ap.add_argument('--category', default=None, help='分类标签（写入文件名后缀，如 电子 / 8月 / 自选）')
    ap.add_argument('--min-yoy', type=float, default=None, help='营收同比过滤阈值（百分数），只保留大于等于该值的公司（默认不过滤）')
    ap.add_argument('--market', default=None, help='市场过滤，逗号分隔 SH,SZ,BJ（默认全部 A 股，自动排除新三板/三板）')
    ap.add_argument('--include-gem', action='store_true', help='包含创业板（默认仅主板）')
    ap.add_argument('--include-star', action='store_true', help='包含科创板（默认仅主板）')
    ap.add_argument('--include-bj', action='store_true', help='包含北交所（默认仅主板）')
    ap.add_argument('--all-board', action='store_true', help='包含全部板块（主板+创业板+科创板+北交所）')
    ap.add_argument('--limit', type=int, default=0, help='按日期获取时最多处理的公司数（0=不限）')
    ap.add_argument('--consensus', action='store_true', help='按日期获取时也拉取当年一致预期（较慢）')
    ap.add_argument('--no-full', action='store_true', help='跳过补齐扣非/经营现金流/资本开支（更快，仅业绩报表字段）')
    ap.add_argument('--all-market', action='store_true', help='包含新三板/三板等非 A 股')
    args = ap.parse_args()

    root = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
    base_data = os.path.normpath(os.path.join(root, 'data'))
    em = EastmoneyClient()

    # 解析披露日期
    dates = list(args.date) if args.date else []
    if args.start and args.end:
        dates.append('%s~%s' % (args.start, args.end))

    markets = None
    if args.market:
        markets = set(m.strip().upper() for m in args.market.split(',') if m.strip())

    # 板块过滤：默认仅 A 股主板（可通过 --include-* / --all-board 放开）
    boards = {'主板'}
    if args.include_gem:
        boards.add('创业板')
    if args.include_star:
        boards.add('科创板')
    if args.include_bj:
        boards.add('北交所')
    if args.all_board:
        boards = {'主板', '创业板', '科创板', '北交所'}

    opts = {
        'min_yoy': args.min_yoy,
        'markets': markets or set(),
        'boards': boards,
        'with_full': not args.no_full,
        'with_consensus': args.consensus,
        'limit': args.limit,
        'include_non_a': args.all_market,
    }

    rows = []
    mode = ''
    fname_date = datetime.date.today().strftime('%Y%m%d')

    if dates:
        # 模式③：按披露日期批量获取
        mode = 'date'
        for d in dates:
            if '~' in d:
                d_from, d_to = d.split('~')
            else:
                d_from = d_to = d
            print('\n== 披露日期 %s ~ %s ==' % (d_from, d_to))
            sub = fetch_by_date(em, d_from, d_to, opts)
            rows.extend(sub)
            time.sleep(0.5)
        # 文件名日期：单日 → 20260812；范围 → 20260801-20260831
        def _compact(d):
            return re.sub(r'\D', '', d)
        if '~' in dates[0]:
            a, b = dates[0].split('~')
            fname_date = _compact(a) + '-' + _compact(b)
        else:
            fname_date = _compact(dates[0])
    else:
        # 模式②：指定关注公司
        if args.codes:
            mode = 'codes'
            codes = [norm_code(c) for c in args.codes.split(',') if norm_code(c)]
            if not codes:
                print('--codes 格式无效')
                return 1
            meta = {c: {'name': c, 'industry': '', 'board': '', 'companyType': ''} for c in codes}
            if args.json or os.path.exists(os.path.join(root, 'goal-tracker-data.json')):
                jp = args.json or os.path.join(root, 'goal-tracker-data.json')
                jm = load_companies_meta(jp)
                for c in codes:
                    if c in jm:
                        meta[c] = jm[c]
            fname_date = datetime.date.today().strftime('%Y%m%d') + '_自选'
        else:
            # 模式①：关注列表（默认）
            mode = 'watchlist'
            jp = args.json or os.path.join(root, 'goal-tracker-data.json')
            if not os.path.exists(jp):
                print('找不到公司列表文件：%s' % jp)
                print('请用 --json 指定，或改用 --codes / --date')
                return 1
            meta = load_companies_meta(jp)
            if not meta:
                print('JSON 中没有 valuation.companies 数据。')
                return 1

    if mode in ('watchlist', 'codes'):
        print('\n== %s %d 家公司 ==' % ('关注列表' if mode == 'watchlist' else '指定公司', len(meta)))
        ok = fail = 0
        for ticker, info in meta.items():
            try:
                row = fetch_latest_earnings(em, ticker, info.get('name') or ticker,
                                            with_consensus=True, with_full=not args.no_full)
                if not row:
                    print('⚠️  跳过 %s：无业绩报表数据' % ticker)
                    fail += 1
                    continue
                row['行业'] = info.get('industry') or ''
                row['板块'] = info.get('board') or ''
                row['林奇类型'] = info.get('companyType') or ''
                if args.min_yoy is not None and (as_num(row['营收同比']) or -1e9) < args.min_yoy:
                    print('➖ %s 营收同比 < %d%% 跳过' % (ticker, args.min_yoy))
                    continue
                rows.append(row)
                print('✅ %s  %-8s 披露=%s %s 营收同比=%s%%' % (
                    ticker, row['公司名称'], row['披露日期'], row['季度'],
                    '' if row['营收同比'] is None else round(row['营收同比'], 1)))
                ok += 1
            except Exception as e:   # noqa: BLE001
                print('❌ %s 抓取失败：%s' % (ticker, str(e)[:80]))
                fail += 1
        if not rows:
            print('\n未获取到任何财报数据。')
            return 1

    if not rows:
        print('\n未获取到任何财报数据。')
        return 1

    # 按披露日期倒序排列
    rows.sort(key=lambda r: date_key(r['披露日期']), reverse=True)

    outdir = os.path.normpath(args.outdir) if args.outdir else os.path.join(base_data, 'earnings')
    fname = '财报跟踪_' + fname_date
    if args.category:
        fname += '_' + args.category
    fname += '.csv'
    outpath = write_csv(rows, os.path.join(outdir, fname))

    print('\n完成：%d 家公司。' % len(rows))
    print('输出：%s' % outpath)
    print('导入：前端「财报跟踪」模块 → 「⬆ 导入财报 CSV」→ 选择该文件。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
