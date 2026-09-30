# -*- coding: utf-8 -*-
"""
L0 静态公司字典构建（data/stocks.json）
========================================
为投资研究系统生成全 A 股静态公司字典（L0 层，管道拥有、整体替换）：

  字段：code(6位)/name/mkt(沪/深/京)/bd(主板/科创板/创业板/北交所)
        /em(东财行业)/sw1/sw2/sw3(申万三级)/concepts(概念标签，'、'连接)

  数据源优先级：
    1. --csv 指定的 行业分类地图_*.csv（fetch_industry_map.py 的产物）
    2. data/industry/ 下最新的 行业分类地图_*.csv（默认，30 天内视为新鲜）
    3. 都没有 → 联网调 fetch_industry_map 的抓取函数现场抓一次（约 2-4 分钟）

  键名与 DB.industryMap.rows 完全一致（code/name/em/sw1/sw2/sw3/concepts），
  前端 swPath / Repo 可零成本切换数据源；额外补 mkt/bd 静态字段。

用法：
  py scripts/ops/build_stocks.py                 # 自动：本地 CSV 够新就直接用，否则联网
  py scripts/ops/build_stocks.py --force-fetch   # 强制联网重抓（同时落一份新 CSV）
  py scripts/ops/build_stocks.py --csv 路径.csv  # 指定 CSV
"""
import argparse
import csv
import glob
import json
import os
import re
import sys
from datetime import date, datetime, timezone

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # scripts/（惰性导入 fetch_industry_map）

OUT_PATH = os.path.join(_ROOT, 'data', 'stocks.json')
CSV_DIR = os.path.join(_ROOT, 'data', 'industry')
CSV_FRESH_DAYS = 30          # 本地 CSV 视为新鲜的天数
CSV_GLOB = '行业分类地图_*.csv'


def _mkt_bd(code6):
    """6 位代码 → (市场, 板块)。8/4/92 开头北交所、6/9 开头沪市、其余深市。"""
    if code6.startswith(('43', '83', '87', '92')):
        return '京', '北交所'
    if code6.startswith('68'):
        return '沪', '科创板'
    if code6.startswith('30'):
        return '深', '创业板'
    if code6.startswith('6'):
        return '沪', '主板'
    return '深', '主板'


def load_from_csv(path):
    """行业分类地图 CSV → {code6: row-dict}（列名与 fetch_industry_map 输出一致）。"""
    out = {}
    with open(path, encoding='utf-8-sig', newline='') as f:
        for r in csv.DictReader(f):
            code = str(r.get('股票代码') or '').strip()
            if not re.match(r'^\d{6}$', code):
                continue
            out[code] = {
                'name': str(r.get('股票名称') or '').strip(),
                'em': str(r.get('东财行业') or '').strip(),
                'sw1': str(r.get('申万一级') or '').strip(),
                'sw2': str(r.get('申万二级') or '').strip(),
                'sw3': str(r.get('申万三级') or '').strip(),
                'concepts': str(r.get('概念标签') or '').strip().strip('、'),
            }
    print('  从 CSV 载入 %d 家：%s' % (len(out), path))
    return out


def find_latest_csv():
    """data/industry/ 下最新的 行业分类地图_*.csv；超过新鲜期返回 None。"""
    cands = glob.glob(os.path.join(CSV_DIR, CSV_GLOB))
    if not cands:
        return None
    latest = max(cands, key=os.path.getmtime)
    age_days = (datetime.now().timestamp() - os.path.getmtime(latest)) / 86400
    if age_days > CSV_FRESH_DAYS:
        print('  最新 CSV 已 %.0f 天（>%d 天视为过期）：%s' % (age_days, CSV_FRESH_DAYS, latest))
        return None
    return latest


def fetch_fresh_csv():
    """联网重抓一份行业分类地图 CSV（复用 fetch_industry_map 的函数与镜像回退）。
    惰性导入：本地 CSV 路径不依赖 requests。"""
    import fetch_industry_map as fim   # noqa: E402
    import argparse as _ap
    em = fim.EastmoneyClient(retries=3, timeout=15, sleep=0.3)
    probe = {'pn': 1, 'pz': 1, 'po': 1, 'np': 1, 'fltt': 2, 'invt': 2,
             'fid': 'f12', 'fs': 'm:1+t:2', 'fields': 'f12'}
    try:
        em.session.trust_env = False
        fim._get_clist(em, probe)
    except Exception:   # noqa: BLE001
        em.session.trust_env = True
        fim._get_clist(em, probe)

    print('==== 联网抓取全市场分类地图 ====')
    stocks = fim.fetch_all_stocks(em)
    concepts = fim.fetch_concepts(em, stocks.keys())
    sw = fim.fetch_sw_all(em, stocks.keys())

    today = date.today().isoformat()
    os.makedirs(CSV_DIR, exist_ok=True)
    out_path = os.path.join(CSV_DIR, '行业分类地图_%s.csv' % today.replace('-', ''))
    with open(out_path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=fim.OUT_COLUMNS)
        w.writeheader()
        for code in sorted(stocks.keys()):
            s = stocks[code]
            w.writerow({
                '股票代码': code, '股票名称': s['name'], '东财行业': s['em'],
                '申万一级': (sw.get(code) or {}).get('sw1', ''),
                '申万二级': (sw.get(code) or {}).get('sw2', ''),
                '申万三级': (sw.get(code) or {}).get('sw3', ''),
                '概念标签': '、'.join(sorted(concepts.get(code) or [])),
                '数据日期': today,
            })
    print('  已落盘 CSV：%s' % out_path)
    return out_path


def main():
    ap = argparse.ArgumentParser(description='构建 L0 静态公司字典 data/stocks.json')
    ap.add_argument('--csv', help='指定行业分类地图 CSV 路径')
    ap.add_argument('--force-fetch', action='store_true', help='强制联网重抓（忽略本地 CSV）')
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:   # noqa: BLE001
        pass

    # 1. 数据源解析
    csv_path = args.csv
    if not csv_path and not args.force_fetch:
        csv_path = find_latest_csv()
    if not csv_path:
        csv_path = fetch_fresh_csv()
    raw = load_from_csv(csv_path)

    # 2. 组装 stocks 行（与 industryMap.rows 同键名 + 静态 mkt/bd）
    rows = []
    n_sw = n_em = n_cp = 0
    for code in sorted(raw.keys()):
        r = raw[code]
        mkt, bd = _mkt_bd(code)
        if r['sw1'] or r['sw3']:
            n_sw += 1
        if r['em']:
            n_em += 1
        if r['concepts']:
            n_cp += 1
        rows.append({
            'code': code, 'name': r['name'], 'mkt': mkt, 'bd': bd,
            'em': r['em'], 'sw1': r['sw1'], 'sw2': r['sw2'], 'sw3': r['sw3'],
            'concepts': r['concepts'],
        })

    payload = {
        'meta': {
            'version': datetime.now(timezone.utc).strftime('%Y%m%d'),
            'generatedAt': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
            'source': os.path.basename(csv_path),
            'count': len(rows),
            'covered': {'sw': n_sw, 'em': n_em, 'concepts': n_cp},
        },
        'stocks': rows,
    }

    # 3. 落盘 + 回读校验（同步盘偶发写入不同步，必须验证）
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    tmp = OUT_PATH + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))
    os.replace(tmp, OUT_PATH)

    chk = json.load(open(OUT_PATH, encoding='utf-8'))
    assert len(chk['stocks']) == len(rows), '回读行数不一致'
    sample = next(x for x in chk['stocks'] if x['code'] == '002463')
    assert sample['name'] and sample['sw3'], '样例行字段缺失: %s' % sample
    size_kb = os.path.getsize(OUT_PATH) // 1024

    print('\n==== stocks.json 构建完成 ====')
    print('输出：%s（%d 家，%d KB）' % (OUT_PATH, len(rows), size_kb))
    print('数据源：%s' % csv_path)
    print('覆盖：申万 %d · 东财行业 %d · 概念 %d' % (n_sw, n_em, n_cp))
    print('meta.version = %s' % payload['meta']['version'])


if __name__ == '__main__':
    main()
