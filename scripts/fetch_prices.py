# -*- coding: utf-8 -*-
"""
批量获取 GoalTracker 全部投资标的的「行情快照」，输出为股价 CSV。
=================================================================
从东方财富行情接口批量拉取所有公司的实时/延时行情，生成一个股价 CSV 到
`data/prices/当前股价_YYYYMMDD.csv`（按日期存档，或 `--outdir`/`--out` 指定）。

每家公司包含的指标：
  现价、涨跌额、涨跌幅%、5日涨幅%（近5个交易日累计，东财 f109）、
  本月涨幅%（腾讯月K：当月收盘/上月收盘−1，前复权；6 线程并行全量计算，
  停牌/上市不足两月/无月K数据的公司留空）、市盈率(动)、市净率、换手率%、
  成交量(手)、成交额(亿)、总市值(亿)、流通市值(亿)、总股本(亿股)

公司来源（默认三源合并、按代码去重，保证财报池与估值池的所有公司都有行情）：
  ① data/公司列表.csv（估值模块「⬇ 导出公司列表」生成，若存在）
  ② data/goal-tracker-data.json 的估值池 companies + 财报池 earnings.rows（若存在）
  ③ data/earnings/ 下最新的 财报跟踪_*.csv（直接从财报池取代码）
  --from-csv 指定公司列表文件时只用该文件。

之后在浏览器「公司估值 → ⬆ 导入股价」选择该 CSV：除批量更新估值池公司的
现价/总股本外，还会写入全站行情快照（DB.quotes）——财报跟踪、行业研究、
公司估值三个板块共用同一份现价/涨幅/本月涨幅，任一入口导入一次全站生效。

数据来源（东方财富公开接口，免费、免 key）：
  push2delay.eastmoney.com/api/qt/ulist.np/get  批量行情（延时约15分钟）
  push2.eastmoney.com/api/qt/ulist.np/get       批量行情（实时，本环境代理可能不可达，自动回退）

用法：
  # 默认三源合并估值池+财报池全部公司（见上「公司来源」），按代码去重，
  # 输出到 data/prices/当前股价_YYYYMMDD.csv
  py fetch_prices.py

  # 指定公司列表来源 CSV / JSON
  py fetch_prices.py --from-csv ../data/公司列表.csv
  py fetch_prices.py --json ../data/goal-tracker-data.json

  # 指定输出目录 / 文件名
  py fetch_prices.py --outdir ../data/prices --out 当前股价.csv

  # 只预览（打印将写入的行情，不写文件）
  py fetch_prices.py --dry-run

说明：
  - 现价来自东财延时行情（约 15 分钟延迟），对日常估值足够。
  - 只生成 CSV，不修改 data/goal-tracker-data.json。
  - 导入：公司估值 → 「⬆ 导入股价」→ 选择本 CSV。
"""
import argparse
import csv
import datetime
import io
import json
import os
import re
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass
import requests

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
UT = 'bd1d9ddb04089700cf9c27f6f7426281'

# 批量行情接口（按可达性依次尝试）：延时优先，实时回退
ULIST_HOSTS = [
    'https://push2delay.eastmoney.com/api/qt/ulist.np/get',
    'https://push2.eastmoney.com/api/qt/ulist.np/get',
]
# 本月涨幅数据源：腾讯月K（当月K收盘/上月K收盘−1，前复权，与行情软件口径一致）。
# 东财 push2his 月K在部分网络不可达；东财 clist 无可靠的"月初至今"字段（f127/f160/f171
# 经三票交叉标定均与官方月涨幅对不上），故弃用。仅对核心跟踪公司逐家计算（估值池量级）。
TENCENT_MONTH_URL = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get'


def secid_of(ticker):
    """'601138.SH' / '000977.SZ' → 东财 secid（1.上交所/北交，0.深交）。"""
    t = str(ticker).strip().upper()
    if '.' not in t:
        return '1.' + t
    code, market = t.split('.')
    return ('0.' + code) if market == 'SZ' else ('1.' + code)


def _num(v):
    """东财返回 '-'（停牌/无效）或 None → None；否则 float。"""
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


_host_fail = {}   # host -> 连续失败批次数（≥3 视为本轮运行内不可达，跳过不再请求）


def fetch_batch(secids):
    """批量拉取行情快照，返回 {代码(6位): info}。失败返回 {}。

    字段（fltt=2，返回值已格式化为小数）：
      f2 最新价   f4 涨跌额    f3 涨跌幅%   f9 市盈率(动)  f23 市净率
      f8 换手率%  f5 成交量(手) f6 成交额(元) f20 总市值(元) f21 流通市值(元)

    限流防护：整轮失败等 5s 重试一次；host 连续失败 ≥3 批后本轮运行内跳过
    （push2 在部分网络环境本就不可达，避免逐批白试触发限流）。"""
    if not secids:
        return {}
    params = {
        'secids': ','.join(secids),
        # f109 = 5日涨跌幅%（近5个交易日累计，已用腾讯日K交叉验证）
        'fields': 'f2,f3,f4,f5,f6,f8,f9,f12,f14,f20,f21,f23,f109',
        'fltt': 2, 'invt': 2, 'pn': 1, 'pz': len(secids), 'po': 1, 'np': 1, 'ut': UT,
    }
    last = None
    for attempt in (1, 2):
        if attempt == 2:
            time.sleep(5)   # 两个 host 整轮失败：等 5s 再试一轮（应对临时限流）
        for host in ULIST_HOSTS:
            if _host_fail.get(host, 0) >= 3:
                continue    # 本轮运行内已确认不可达，跳过（省时+降低触发限流概率）
            try:
                r = requests.get(host, params=params,
                                 headers={'User-Agent': UA, 'Referer': 'https://quote.eastmoney.com/'},
                                 timeout=20)
                j = r.json()
                diff = (j.get('data') or {}).get('diff') or []
                if diff:
                    out = {}
                    for x in diff:
                        code = x.get('f12')
                        if not code:
                            continue
                        out[str(code)] = {
                            'name': x.get('f14', ''),
                            'price': _num(x.get('f2')),
                            'chg': _num(x.get('f4')),
                            'pct': _num(x.get('f3')),
                            'pct5': _num(x.get('f109')),     # 5日涨跌幅%
                            'pe': _num(x.get('f9')),
                            'pb': _num(x.get('f23')),
                            'turnover': _num(x.get('f8')),
                            'volume': _num(x.get('f5')),      # 手
                            'amount': _num(x.get('f6')),      # 元
                            'mktcap': _num(x.get('f20')),     # 元
                            'floatmv': _num(x.get('f21')),    # 元
                        }
                    _host_fail.pop(host, None)
                    return out
                _host_fail[host] = _host_fail.get(host, 0) + 1
            except Exception as e:   # noqa: BLE001
                _host_fail[host] = _host_fail.get(host, 0) + 1
                last = e
                continue
    if last:
        print('⚠️  行情接口全部不可达（已重试1轮）：%s' % str(last)[:80])
    return {}


def fetch_month_pct(ticker):
    """本月涨幅（%）＝ 当月K收盘 ÷ 上月K收盘 − 1（腾讯月K，前复权，口径与行情软件一致）。
    失败返回 None。供并行调用（调用方控制并发与进度）。"""
    t = str(ticker).strip().upper()
    code, _, mkt = t.partition('.')
    sym = mkt.lower() + code
    try:
        r = requests.get(TENCENT_MONTH_URL, params={'param': '%s,month,,,2,qfq' % sym},
                         headers={'User-Agent': UA}, timeout=10)
        d = r.json().get('data', {}).get(sym, {})
        mon = d.get('qfqmonth') or d.get('month') or []
        if len(mon) >= 2:
            cur, prev = float(mon[-1][2]), float(mon[-2][2])
            if prev > 0:
                return round((cur / prev - 1) * 100, 2)
    except Exception:   # noqa: BLE001
        pass
    return None


def fetch_month_all(secid_list, price_map, workers=6):
    """全量计算本月涨幅：核心跟踪公司先串行（保序优先），其余并行（6 线程 ≈ 3-4 分钟）。
    返回 {ticker: pct}。"""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    month_map = {}
    def tradable(item):
        t, name, sid, core = item
        info = price_map.get(sid.split('.')[1])
        return (info and info.get('price') is not None)
    core = [(t, s) for t, n, s, c in secid_list if c and tradable((t, n, s, c))]
    ext = [(t, s) for t, n, s, c in secid_list if not c and tradable((t, n, s, c))]
    print('📈 本月涨幅：核心跟踪 %d 家（串行）…' % len(core))
    for i, (t, s) in enumerate(core, 1):
        v = fetch_month_pct(t)
        if v is not None:
            month_map[t] = v
        if i % 25 == 0:
            print('    核心 %d/%d' % (i, len(core)))
    print('📈 扩展公司 %d 家（%d 线程并行）…' % (len(ext), workers))
    done = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futs = {ex.submit(fetch_month_pct, t): t for t, s in ext}
        for fu in as_completed(futs):
            t = futs[fu]
            v = fu.result()
            if v is not None:
                month_map[t] = v
            done += 1
            if done % 500 == 0:
                print('    扩展 %d/%d' % (done, len(ext)))
    print('📈 本月涨幅完成：%d/%d 家' % (len(month_map), len(core) + len(ext)))
    return month_map


def load_companies(json_path):
    """读取 JSON 里的公司列表（需存在 valuation.companies）。"""
    with open(json_path, encoding='utf-8') as f:
        d = json.load(f)
    return (d.get('valuation', {}).get('companies') or [])


def _norm_ticker(s):
    """'601138' / '601138.SH' → '601138.SH'；无法识别返回原值大写。
    无后缀时按代码前缀推断市场（60/68/90→SH，00/30/20/39→SZ，其余→BJ）。"""
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


def load_companies_from_csv(path):
    """从公司列表 CSV 读取 [{ticker, name}]，需含「股票代码」列（「公司名称」可选）。
    兼容三种来源格式：估值模块「⬇ 导出公司列表」/ 财报跟踪「⬇ 导出 CSV」/ 公司组「📤 导出该组」；
    支持 6 位纯代码（自动推断 .SH/.SZ/.BJ 后缀）；# 注释行跳过，按股票代码去重。"""
    with open(path, encoding='utf-8-sig') as f:
        lines = [ln for ln in f if not ln.lstrip().startswith('#')]
    out, seen = [], set()
    for r in csv.DictReader(lines):
        t = _norm_ticker(r.get('股票代码'))
        if not re.match(r'^\d{6}\.(SH|SZ|BJ)$', t) or t in seen:
            continue
        seen.add(t)
        out.append({'ticker': t, 'name': (r.get('公司名称') or '').strip()})
    return out


def esc_csv(v):
    s = str(v)
    return '"%s"' % s.replace('"', '""') if re.search(r'[",\n]', s) else s


def main():
    ap = argparse.ArgumentParser(description='批量获取当前股价 → 股价 CSV（用于浏览器批量导入更新股价）')
    ap.add_argument('--from-csv', dest='from_csv', default=None,
                    help='公司列表来源 CSV（列：股票代码[,公司名称]，默认 data/公司列表.csv）')
    ap.add_argument('--json', default=None, help='公司列表来源 JSON（默认回退 data/goal-tracker-data.json）')
    ap.add_argument('--outdir', default=None, help='输出目录（默认 data/prices/）')
    ap.add_argument('--out', default=None, help='输出文件名（默认 当前股价.csv）')
    ap.add_argument('--dry-run', action='store_true', help='只打印将写入的价格，不写文件')
    args = ap.parse_args()

    base_data = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
    # 公司列表来源（--from-csv 指定时只用该文件）：
    #   默认三源合并 → ① data/公司列表.csv（估值模块导出）② goal-tracker-data.json 的
    #   估值池 companies + 财报池 earnings.rows ③ data/earnings/ 下最新财报 CSV；
    #   按 6 位代码去重——保证财报池与估值池的所有公司都有行情。
    cs, srcs = [], []
    if args.from_csv:
        csv_path = os.path.normpath(args.from_csv)
        if not os.path.exists(csv_path):
            print('找不到公司列表文件：%s' % csv_path)
            return 1
        cs = load_companies_from_csv(csv_path)
        srcs.append('%s(%d)' % (csv_path, len(cs)))
    else:
        seen = set()

        def merge(part, tag, core=False):
            n = 0
            for c in part:
                t = _norm_ticker(c.get('ticker'))
                if re.match(r'^\d{6}\.(SH|SZ|BJ)$', t) and t not in seen:
                    seen.add(t)
                    cs.append({'ticker': t, 'name': (c.get('name') or '').strip(), 'core': core})
                    n += 1
            if n:
                srcs.append('%s(+%d)' % (tag, n))

        default_csv = os.path.join(base_data, '公司列表.csv')
        if os.path.exists(default_csv):
            merge(load_companies_from_csv(default_csv), '公司列表.csv', core=True)
        json_path = os.path.normpath(args.json) if args.json else os.path.join(base_data, 'goal-tracker-data.json')
        if os.path.exists(json_path):
            try:
                with open(json_path, encoding='utf-8') as f:
                    d = json.load(f)
                merge(d.get('valuation', {}).get('companies') or [], 'JSON估值池', core=True)
                merge([{'ticker': r.get('股票代码'), 'name': r.get('公司名称')}
                       for r in (d.get('earnings', {}).get('rows') or [])], 'JSON财报池')
            except Exception as e:   # noqa: BLE001
                print('⚠️ 读取 %s 失败（跳过）：%s' % (json_path, str(e)[:60]))
        earn_dir = os.path.join(base_data, 'earnings')
        if os.path.isdir(earn_dir):
            earn_files = sorted(f for f in os.listdir(earn_dir)
                                if f.endswith('.csv') and '财报跟踪' in f)
            if earn_files:
                try:
                    with open(os.path.join(earn_dir, earn_files[-1]), encoding='utf-8-sig') as f:
                        rows = [r for r in csv.DictReader(
                            ln for ln in f if not ln.lstrip().startswith('#'))]
                    merge([{'ticker': r.get('股票代码'), 'name': r.get('公司名称')}
                           for r in rows], '财报CSV(%s)' % earn_files[-1])
                except Exception as e:   # noqa: BLE001
                    print('⚠️ 读取财报 CSV 失败（跳过）：%s' % str(e)[:60])
    if not cs:
        print('公司列表为空：未找到 公司列表.csv / goal-tracker-data.json / data/earnings/*.csv 任一来源。')
        return 1
    print('📋 公司列表（去重后 %d 家）：%s' % (len(cs), ' + '.join(srcs) if srcs else '指定文件'))

    # 构造 secids（分批拉取，每次最多 60）
    secid_list = []
    for c in cs:
        t = (c.get('ticker') or '').strip().upper()
        if re.match(r'^\d{6}\.(SH|SZ|BJ)$', t):
            secid_list.append((t, c.get('name') or t, secid_of(t), bool(c.get('core'))))

    price_map = {}
    batch = []
    for t, name, sid, core in secid_list:
        batch.append(sid)
        if len(batch) >= 60:
            price_map.update(fetch_batch(batch))
            time.sleep(0.4)   # 批间间隔，降低触发接口限流的概率
            batch = []
    if batch:
        price_map.update(fetch_batch(batch))

    if not price_map:
        print('未能获取到任何行情。')
        return 1

    # 组装输出行（行情快照：现价/涨跌/估值/成交/市值/股本 + 本月涨幅）
    rows = []
    # 本月涨幅：全量计算（核心先串行、扩展并行，6 线程约 3-4 分钟）
    month_map = fetch_month_all(secid_list, price_map)

    ok = 0
    for ticker, name, sid, core in secid_list:
        code6 = sid.split('.')[1]
        info = price_map.get(code6)
        if not info or info['price'] is None:
            continue
        price = info['price']
        month_pct = month_map.get(ticker)
        shares = None   # 总股本(亿股) = 总市值(元) ÷ 现价 ÷ 1e8
        if info.get('mktcap') and price > 0:
            shares = round(info['mktcap'] / price / 1e8, 4)
        rows.append({
            'ticker': ticker, 'name': info['name'] or name, 'price': round(price, 2),
            'chg': info.get('chg'), 'pct': info.get('pct'), 'pct5': info.get('pct5'),
            'monthPct': month_pct,
            'pe': info.get('pe'), 'pb': info.get('pb'), 'turnover': info.get('turnover'),
            'volume': info.get('volume'),
            'amount': round(info['amount'] / 1e8, 4) if info.get('amount') else None,    # 元→亿
            'mktcap': round(info['mktcap'] / 1e8, 4) if info.get('mktcap') else None,    # 元→亿
            'floatmv': round(info['floatmv'] / 1e8, 4) if info.get('floatmv') else None, # 元→亿
            'shares': shares,
        })
        ok += 1

    if args.dry_run:
        print('[预览] 共 %d 家将写入行情快照：' % ok)
        for r in rows:
            pct = ('%+.2f%%' % r['pct']) if r['pct'] is not None else '—'
            pct5 = ('%+.2f%%' % r['pct5']) if r['pct5'] is not None else '—'
            pe = ('%.2f' % r['pe']) if r['pe'] is not None else '—'
            print('  %s  %s  现价 %s  日 %s  5日 %s  PE(动) %s' % (r['ticker'], r['name'], r['price'], pct, pct5, pe))
        return 0

    # 输出目录
    outdir = os.path.normpath(args.outdir) if args.outdir else os.path.join(base_data, 'prices')
    os.makedirs(outdir, exist_ok=True)
    today = datetime.date.today().strftime('%Y%m%d')
    outname = args.out or ('当前股价_%s.csv' % today)   # 按日期存档，保留历史行情快照
    outpath = os.path.join(outdir, outname)

    cols = ['股票代码', '公司', '现价', '涨跌额', '涨跌幅%', '5日涨幅%', '本月涨幅%', '市盈率(动)', '市净率', '换手率%',
            '成交量(手)', '成交额(亿)', '总市值(亿)', '流通市值(亿)', '总股本(亿股)']
    buf = io.StringIO()
    buf.write('\ufeff')                       # BOM，Excel 识别 UTF-8
    buf.write('# GoalTracker 股价数据（行情快照，由 fetch_prices.py 生成）\n')
    buf.write(','.join(cols) + '\n')
    for r in rows:
        vals = [r['ticker'], r['name'], r['price'], r['chg'], r['pct'], r['pct5'], r['monthPct'], r['pe'], r['pb'],
                r['turnover'], r['volume'], r['amount'], r['mktcap'], r['floatmv'], r['shares']]
        buf.write(','.join('' if v is None else esc_csv(v) for v in vals) + '\n')
    with open(outpath, 'w', encoding='utf-8', newline='') as f:
        f.write(buf.getvalue())

    print('✅ 已写入 %d/%d 家行情快照 → %s' % (ok, len(cs), outpath))
    print('   导入：公司估值 → 「⬆ 导入股价」→ 选择该 CSV，批量更新现价/总股本，'
          '并带出涨跌/市盈率(动)/市净率/换手率/成交额/总市值等行情快照。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
