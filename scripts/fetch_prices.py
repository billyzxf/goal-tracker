# -*- coding: utf-8 -*-
"""
批量获取 GoalTracker 全部投资标的的「当前股价」，输出为股价 CSV。
=================================================================
从东方财富行情接口批量拉取所有公司的实时/延时现价，生成一个股价 CSV 到
`data/prices/当前股价.csv`（或 `--outdir` 指定目录）。

之后在浏览器「公司估值 → ⬆ 批量导入 CSV」选择该 CSV 即可批量更新全部
公司的 `currentPrice`，无需一个个手动填。

数据来源（东方财富公开接口，免费、免 key）：
  push2delay.eastmoney.com/api/qt/ulist.np/get  批量行情（延时约15分钟）
  push2.eastmoney.com/api/qt/ulist.np/get       批量行情（实时，本环境代理可能不可达，自动回退）

用法：
  # 从默认 data/goal-tracker-data.json 读取公司列表，输出到 data/prices/当前股价.csv
  py fetch_prices.py

  # 指定公司列表来源 JSON
  py fetch_prices.py --json ../goal-tracker-data.json

  # 指定输出目录 / 文件名
  py fetch_prices.py --outdir ../data/prices --out 当前股价.csv

  # 只预览（打印将写入的价格，不写文件）
  py fetch_prices.py --dry-run

说明：
  - 现价来自东财延时行情（约 15 分钟延迟），对日常估值足够。
  - 只生成 CSV，不修改 goal-tracker-data.json。
  - 导入：公司估值 → 「⬆ 批量导入 CSV」→ 选择本 CSV。
"""
import argparse
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


def secid_of(ticker):
    """'601138.SH' / '000977.SZ' → 东财 secid（1.上交所/北交，0.深交）。"""
    t = str(ticker).strip().upper()
    if '.' not in t:
        return '1.' + t
    code, market = t.split('.')
    return ('0.' + code) if market == 'SZ' else ('1.' + code)


def fetch_batch(secids):
    """批量拉取现价，返回 {代码(6位): {name, price, pct}}。失败返回 {}。"""
    if not secids:
        return {}
    params = {
        'secids': ','.join(secids),
        'fields': 'f2,f3,f12,f14',
        'fltt': 2, 'invt': 2, 'pn': 1, 'pz': len(secids), 'po': 1, 'np': 1, 'ut': UT,
    }
    last = None
    for host in ULIST_HOSTS:
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
                    out[str(code)] = {'name': x.get('f14', ''), 'price': x.get('f2'), 'pct': x.get('f3')}
                return out
        except Exception as e:   # noqa: BLE001
            last = e
            continue
    if last:
        print('⚠️  行情接口全部不可达：%s' % str(last)[:80])
    return {}


def load_companies(json_path):
    """读取 JSON 里的公司列表（需存在 valuation.companies）。"""
    with open(json_path, encoding='utf-8') as f:
        d = json.load(f)
    return (d.get('valuation', {}).get('companies') or [])


def esc_csv(v):
    s = str(v)
    return '"%s"' % s.replace('"', '""') if re.search(r'[",\n]', s) else s


def main():
    ap = argparse.ArgumentParser(description='批量获取当前股价 → 股价 CSV（用于浏览器批量导入更新股价）')
    ap.add_argument('--json', default=None, help='公司列表来源 JSON（默认 data/goal-tracker-data.json）')
    ap.add_argument('--outdir', default=None, help='输出目录（默认 data/prices/）')
    ap.add_argument('--out', default=None, help='输出文件名（默认 当前股价.csv）')
    ap.add_argument('--dry-run', action='store_true', help='只打印将写入的价格，不写文件')
    args = ap.parse_args()

    base_data = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data'))
    # 公司列表来源
    if args.json:
        json_path = os.path.normpath(args.json)
    else:
        json_path = os.path.join(base_data, 'goal-tracker-data.json')
    if not os.path.exists(json_path):
        print('找不到公司列表文件：%s' % json_path)
        print('请用 --json 指定，例如：py fetch_prices.py --json ../goal-tracker-data.json')
        return 1
    cs = load_companies(json_path)
    if not cs:
        print('JSON 中没有 valuation.companies 数据。')
        return 1

    # 构造 secids（分批拉取，每次最多 60）
    secid_list = []
    for c in cs:
        t = (c.get('ticker') or '').strip().upper()
        if re.match(r'^\d{6}\.(SH|SZ|BJ)$', t):
            secid_list.append((t, c.get('name') or t, secid_of(t)))

    price_map = {}
    batch = []
    for t, name, sid in secid_list:
        batch.append(sid)
        if len(batch) >= 60:
            price_map.update(fetch_batch(batch))
            batch = []
    if batch:
        price_map.update(fetch_batch(batch))

    if not price_map:
        print('未能获取到任何行情。')
        return 1

    # 组装输出行：代码,公司,现价
    rows = []
    ok = 0
    for ticker, name, sid in secid_list:
        code6 = sid.split('.')[1]
        info = price_map.get(code6)
        if not info or info['price'] is None:
            continue
        price = float(info['price'])
        rows.append((ticker, info['name'] or name, round(price, 2)))
        ok += 1

    if args.dry_run:
        print('[预览] 共 %d 家将写入股价：' % ok)
        for ticker, name, price in rows:
            print('  %s  %s  %s' % (ticker, name, price))
        return 0

    # 输出目录
    outdir = os.path.normpath(args.outdir) if args.outdir else os.path.join(base_data, 'prices')
    os.makedirs(outdir, exist_ok=True)
    outname = args.out or '当前股价.csv'
    outpath = os.path.join(outdir, outname)

    buf = io.StringIO()
    buf.write('\ufeff')                       # BOM，Excel 识别 UTF-8
    buf.write('# GoalTracker 股价数据\n')
    buf.write('股票代码,公司,现价\n')
    for ticker, name, price in rows:
        buf.write('%s,%s,%s\n' % (esc_csv(ticker), esc_csv(name), price))
    with open(outpath, 'w', encoding='utf-8', newline='') as f:
        f.write(buf.getvalue())

    print('✅ 已写入 %d/%d 家股价 → %s' % (ok, len(cs), outpath))
    print('   导入：公司估值 → 「⬆ 批量导入 CSV」→ 选择该 CSV 即可更新全部公司股价。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
