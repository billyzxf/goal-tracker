# -*- coding: utf-8 -*-
"""
按「财报实际披露日期」批量获取财报 → 财报跟踪 CSV。
=================================================================
从东方财富抓取财报的核心指标，生成一个或多个汇总 CSV，
供前端「财报跟踪」模块导入后排序 / 筛选（按披露日期、营收同比、扣非净利同比等）。

支持三种获取来源：
  ① 关注列表（默认）        —— 从 data/公司列表.csv（或 --json）读取关注公司，取每只最新一期财报
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

性能提示：
  - 每家公司需 3 次 F10 请求（扣非/现金流/毛利润），是批量获取的主要耗时来源；
    按日期批量时先用 --min-yoy 过滤（在补齐之前执行）可显著减少请求数，例如
    --min-yoy 20 通常能把 3000+ 家压到 800 家左右。
  - --no-full 可跳过这些补齐（每家公司只剩 1 次业绩报表请求，最快），
    但会缺少「扣非净利同比/扣非净利润/经营现金流/销售收现」等字段，L1 真实性筛选将失效。
  - --workers 可调整并发（默认 6），网络好时可适当调大。

用法示例：
  # ① 关注列表最新财报（默认）
  py fetch_earnings.py

  # ② 指定关注公司
  py fetch_earnings.py --codes 601138,300308,000977

  # ③ 指定披露日期（当天发布财报的全部公司）
  py fetch_earnings.py --date 2026-08-12

  # ③ 披露日期范围 + 只保留营收同比≥20% + 指定市场 + 分类标签
  py fetch_earnings.py --start 2026-08-01 --end 2026-08-31 --min-yoy 20 --market SH,SZ --category 8月

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
OUT_COLUMNS = [
    '股票代码', '公司名称', '行业', '行业二级', '行业三级', '板块', '林奇类型',
    '披露日期', '报告期', '季度',
    '营业收入', '营收同比', '毛利润', '净利润', '扣非净利润', '扣非净利同比',
    '经营现金流', '销售收现', '资本开支', 'ROE', '毛利率',
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


def load_companies_meta(json_path=None, csv_path=None):
    """读取公司列表元数据，返回 {ticker: {name, industry, industryL2, industryL3, board, companyType}}。
    来源优先级：CSV（data/公司列表.csv，按列名解析，兼容估值模块导出的
    10 列格式「股票代码,公司名称,市场,板块,行业,林奇类型,行业细分,货币,现价,总股本」
    与旧 7 列格式）→ JSON（valuation.companies）；后加载的覆盖同 ticker 字段。"""
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
                        'industryL2': c.get('industryL2') or '',
                        'industryL3': c.get('industryL3') or '',
                        'board': c.get('board') or '',
                        'companyType': c.get('companyType') or '',
                    }
        except Exception as e:   # noqa: BLE001
            print('  读取 JSON 公司列表失败: %s' % e)

    # 公司列表 CSV（默认 data/公司列表.csv）：按列名解析，兼容不同列序
    if csv_path and os.path.exists(csv_path):
        try:
            with open(csv_path, encoding='utf-8-sig') as f:
                lines = [ln for ln in f if not ln.lstrip().startswith('#')]
            for r in csv.DictReader(lines):
                code = str(r.get('股票代码') or '').strip().upper()
                if not re.match(r'^\d{6}\.(SH|SZ|BJ)$', code):
                    continue
                cur = meta.setdefault(code, {'name': '', 'industry': '', 'industryL2': '',
                                             'industryL3': '', 'board': '', 'companyType': ''})
                for col, key in (('公司名称', 'name'), ('板块', 'board'),
                                 ('行业', 'industry'), ('行业二级', 'industryL2'),
                                 ('行业三级', 'industryL3'), ('林奇类型', 'companyType')):
                    v = str(r.get(col) or '').strip()
                    if v:
                        cur[key] = v
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
                    ss = to_yi(r.get('SALES_SERVICES'))   # 销售商品、提供劳务收到的现金
                    if ss is not None:
                        row['销售收现'] = round(ss, 4)
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


def fetch_latest_earnings(em, ticker, name='', with_full=True):
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
    return row


def fetch_by_date(em, date_from, date_to, opts):
    """按披露日期获取全部公司财报。opts: {min_yoy, markets, with_full, limit, include_non_a, workers}。"""
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

    # 并发补齐每家公司的完整字段（每线程独立 client，避免共享 session 争用）
    import threading
    from concurrent.futures import ThreadPoolExecutor, as_completed
    local = threading.local()

    def _worker(task):
        r, secu, info = task
        if not hasattr(local, 'em'):
            local.em = EastmoneyClient()
        em_t = local.em
        row = {
            '股票代码': secu,
            '公司名称': r.get('SECURITY_NAME_ABBR') or '',
            '行业': info.get('industry') or '',
            '行业二级': info.get('industryL2') or '',
            '行业三级': info.get('industryL3') or '',
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
            _enrich_financials(em_t, row, r)
        return row

    tasks = []
    for r in items:
        code6 = str(r.get('SECURITY_CODE') or '')
        secu = '%s.%s' % (code6, market_of(code6))
        tasks.append((r, secu, org.get(code6, {})))

    rows = []
    done = 0
    workers = max(1, int(opts.get('workers', 6)))
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(_worker, t): t[1] for t in tasks}
        for fut in as_completed(futs):
            try:
                rows.append(fut.result())
            except Exception as e:   # noqa: BLE001
                print('  %s 补齐失败: %s' % (futs[fut], str(e)[:80]))
            done += 1
            if done % 100 == 0:
                print('  进度 %d/%d' % (done, len(tasks)))
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
    ap.add_argument('--json', default=None, help='公司列表来源 JSON（默认读 data/公司列表.csv，不存在时回退 data/goal-tracker-data.json）')
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
    ap.add_argument('--no-full', action='store_true', help='跳过补齐扣非/经营现金流/资本开支（更快，仅业绩报表字段）')
    ap.add_argument('--all-market', action='store_true', help='包含新三板/三板等非 A 股')
    ap.add_argument('--workers', type=int, default=6, help='按日期获取时的并发线程数（默认 6）')
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
        'limit': args.limit,
        'workers': args.workers,
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
        # 公司列表来源：默认 data/公司列表.csv（估值模块「⬇ 导出公司列表」生成）；
        # 文件不存在（或显式 --json）时回退 data/goal-tracker-data.json
        list_csv = os.path.join(base_data, '公司列表.csv')
        json_src = args.json
        if not json_src and not os.path.exists(list_csv):
            json_src = os.path.join(base_data, 'goal-tracker-data.json')
        # 模式②：指定关注公司
        if args.codes:
            mode = 'codes'
            codes = [norm_code(c) for c in args.codes.split(',') if norm_code(c)]
            if not codes:
                print('--codes 格式无效')
                return 1
            meta = {c: {'name': c, 'industry': '', 'board': '', 'companyType': ''} for c in codes}
            jm = load_companies_meta(json_path=json_src,
                                     csv_path=list_csv if os.path.exists(list_csv) else None)
            for c in codes:
                if c in jm:
                    meta[c] = jm[c]
            fname_date = datetime.date.today().strftime('%Y%m%d') + '_自选'
        else:
            # 模式①：关注列表（默认）
            mode = 'watchlist'
            meta = load_companies_meta(json_path=json_src,
                                       csv_path=list_csv if os.path.exists(list_csv) else None)
            if not meta:
                print('未找到公司列表：data/公司列表.csv 与 data/goal-tracker-data.json 均为空或不存在。')
                print('请先在估值模块「⬇ 导出公司列表」生成 data/公司列表.csv，或用 --json / --codes / --date 指定。')
                return 1

    if mode in ('watchlist', 'codes'):
        print('\n== %s %d 家公司 ==' % ('关注列表' if mode == 'watchlist' else '指定公司', len(meta)))
        # 批量补全行业层级：公司列表 CSV 可能只带一级行业，F10 可拿到二/三级（一次批量请求，成本极低）
        try:
            org = em.basic_orginfo(list(meta.keys()))
        except Exception as e:   # noqa: BLE001
            print('  行业层级补全失败（不影响主流程）：%s' % str(e)[:80])
            org = {}
        lv3_hit = sum(1 for v in org.values() if v.get('industryL3'))
        print('  行业层级：%d/%d 家拿到三级分类' % (lv3_hit, len(meta)))
        # 并发抓取（与按日期模式一致；每线程独立 client 避免共享 session 争用）
        import threading
        from concurrent.futures import ThreadPoolExecutor, as_completed
        local = threading.local()

        def _worker(item):
            ticker, info = item
            em_t = getattr(local, 'em', None)
            if em_t is None:
                em_t = local.em = EastmoneyClient()
            try:
                row = fetch_latest_earnings(em_t, ticker, info.get('name') or ticker,
                                            with_full=not args.no_full)
                if not row:
                    return (ticker, None, '无业绩报表数据')
                o = org.get(str(ticker).split('.')[0]) or {}
                row['行业'] = o.get('industry') or info.get('industry') or ''
                row['行业二级'] = o.get('industryL2') or info.get('industryL2') or ''
                row['行业三级'] = o.get('industryL3') or info.get('industryL3') or ''
                row['板块'] = info.get('board') or ''
                row['林奇类型'] = info.get('companyType') or ''
                if args.min_yoy is not None and (as_num(row['营收同比']) or -1e9) < args.min_yoy:
                    return (ticker, None, '营收同比低于阈值（已过滤）')
                return (ticker, row, None)
            except Exception as e:   # noqa: BLE001
                return (ticker, None, str(e)[:80])

        ok = fail = 0
        workers = max(1, int(getattr(args, 'workers', 6) or 6))
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(_worker, it): it[0] for it in meta.items()}
            for i, fut in enumerate(as_completed(futs), 1):
                ticker, row, err = fut.result()
                if err is None:
                    rows.append(row)
                    ok += 1
                else:
                    fail += 1
                    print('❌ %s：%s' % (ticker, err))
                if i % 100 == 0:
                    print('  进度 %d/%d（成功 %d / 失败 %d）' % (i, len(meta), ok, fail))
        print('  完成：成功 %d / 失败 %d' % (ok, fail))
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
