# -*- coding: utf-8 -*-
"""
全市场行业/概念分类地图抓取
============================
为「行业研究」模块生成 A 股全市场的分类地图（data/industry/行业分类地图_YYYYMMDD.csv）：

  - 东财行业        push2 clist 股票列表 f100 字段（镜像每页上限 100，自动翻页 ~56 页）
  - 申万一/二/三级   RPT_F10_BASIC_ORGINFO 批量接口（50 只/批，~112 批）
  - 概念/主题标签    RPT_F10_CORETHEME_BOARDTYPE 批量接口（50 只/批，即 F10「核心题材」板块）

用法：
  py scripts/fetch_industry_map.py                    # 全量（约 2-4 分钟）
  py scripts/fetch_industry_map.py --no-sw            # 跳过申万（省 ~112 请求）
  py scripts/fetch_industry_map.py --no-concept       # 跳过概念（省 ~350 请求）
  py scripts/fetch_industry_map.py --outdir data/industry

输出 CSV 列：
  股票代码,股票名称,东财行业,申万一级,申万二级,申万三级,概念标签,数据日期
  - 股票代码为 6 位纯数字（前端按前 6 位与财报池/估值池匹配）
  - 概念标签以「、」连接；字段内不含逗号，无需引号转义

网络说明：https 主站 push2 在部分网络下 TLS 被 RST，clist 自动回退
http 数字镜像（80.push2）与延时镜像（push2delay）；默认直连，全镜像失败再走系统代理。
"""
import argparse
import csv
import os
import re
import sys
import time
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eastmoney import EastmoneyClient   # noqa: E402

CLIST_HOSTS = ['http://80.push2.eastmoney.com/api/qt/clist/get',      # 数字镜像（http）
               'https://push2delay.eastmoney.com/api/qt/clist/get',   # 延时镜像（约15min，分类数据不敏感）
               'https://push2.eastmoney.com/api/qt/clist/get']        # 主站（部分网络会被 RST）
CLIST = CLIST_HOSTS[0]
DATACENTER = 'https://datacenter-web.eastmoney.com/api/data/v1/get'


def _get_clist(em, params):
    """clist 多镜像请求：https 主站被 RST 的网络下自动回退 http 镜像 / 延时镜像。"""
    last = None
    for url in CLIST_HOSTS:
        try:
            return em._get(url, params)
        except Exception as e:   # noqa: BLE001
            last = e
    raise RuntimeError('clist 全部镜像失败: %s' % (last or '未知错误'))
# A 股全市场：沪主板 m:1+t:2、科创板 m:1+t:23、深主板 m:0+t:6、创业板 m:0+t:80
FS_ALL_A = 'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23'
OUT_COLUMNS = ['股票代码', '股票名称', '东财行业', '申万一级', '申万二级', '申万三级', '概念标签', '数据日期']


def _suffix(code6):
    """6 位代码 → SECUCODE 后缀：43/83/87/920 北交所、6/9 开头沪市、其余深市。"""
    if code6.startswith('920') or code6.startswith(('4', '8')):
        return '.BJ'
    if code6.startswith(('6', '9')):
        return '.SH'
    return '.SZ'


def _clist(em, fs, fields, max_pages=120):
    """push2 clist 分页抓取（镜像每页上限 100），返回 data.diff 列表。"""
    out, page = [], 1
    total = None
    while page <= max_pages:
        params = {'pn': page, 'pz': 100, 'po': 1, 'np': 1, 'fltt': 2, 'invt': 2,
                  'fid': 'f12', 'fs': fs, 'fields': fields}
        j = _get_clist(em, params)
        data = (j or {}).get('data') or {}
        diff = data.get('diff') or []
        if isinstance(diff, dict):          # 旧接口返回 {n: row}
            diff = list(diff.values())
        if not diff:
            break
        out.extend(diff)
        total = data.get('total')
        if total is not None and len(out) >= int(total):
            break
        if len(diff) < 100:
            break
        page += 1
        time.sleep(0.05)
    return out, total


def fetch_all_stocks(em):
    """全市场 A 股：{code6: {name, em_industry}}。"""
    rows, total = _clist(em, FS_ALL_A, 'f12,f13,f14,f100')
    out = {}
    for r in rows:
        code = str(r.get('f12') or '').strip()
        if not re.match(r'^\d{6}$', code):
            continue
        ind = str(r.get('f100') or '').strip()
        out[code] = {'name': str(r.get('f14') or '').strip(),
                     'em': '' if ind in ('-',) else ind}
    print('  [1/3] 全市场 A 股：%d 家（接口 total=%s）' % (len(out), total))
    return out


def fetch_concepts(em, codes):
    """概念/主题标签（RPT_F10_CORETHEME_BOARDTYPE 批量，50 只/批自动翻页）。
    返回 {code6: set(概念名)}。"""
    by_code = {}
    codes = list(codes)
    nfail = 0
    for i in range(0, len(codes), 50):
        batch = codes[i:i + 50]
        filt = '(SECUCODE in ("%s"))' % '","'.join(c + _suffix(c) for c in batch)
        page = 1
        try:
            while True:
                params = {'reportName': 'RPT_F10_CORETHEME_BOARDTYPE', 'columns': 'ALL',
                          'filter': filt, 'pageNumber': page, 'pageSize': 500,
                          'source': 'HSF10', 'client': 'PC'}
                j = em._get(DATACENTER, params)
                res = (j or {}).get('result') or {}
                data = res.get('data') or []
                for d in data:
                    c6 = str(d.get('SECUCODE') or '').split('.')[0]
                    nm = str(d.get('BOARD_NAME') or '').strip()
                    if c6 and nm:
                        by_code.setdefault(c6, set()).add(nm)
                total = res.get('count')
                if not data or (total is not None and page * 500 >= int(total)):
                    break
                page += 1
        except Exception as e:   # noqa: BLE001
            nfail += 1
            print('    ⚠ 批 %d-%d 概念抓取失败：%s' % (i + 1, i + len(batch), str(e)[:60]))
        if (i // 50) % 10 == 0:
            print('    概念进度 %d/%d 家' % (min(i + 50, len(codes)), len(codes)))
        time.sleep(0.05)
    print('  [2/3] 概念/主题标签：覆盖 %d/%d 家（失败批 %d）' % (len(by_code), len(codes), nfail))
    return by_code


def fetch_sw_all(em, codes):
    """申万一/二/三级（批量 basic_orginfo，50 只/批）。返回 {code6: {sw1,sw2,sw3}}。"""
    out = {}
    codes = list(codes)
    n = (len(codes) + 49) // 50
    for i in range(0, len(codes), 50):
        batch = [c + _suffix(c) for c in codes[i:i + 50]]
        try:
            info = em.basic_orginfo(batch)
        except Exception:   # noqa: BLE001
            info = {}
        for c in batch:
            d = info.get(c.split('.')[0])
            if d:
                out[c.split('.')[0]] = {'sw1': d.get('industry') or '',
                                        'sw2': d.get('industryL2') or '',
                                        'sw3': d.get('industryL3') or ''}
        done = min(i + 50, len(codes))
        if (i // 50) % 10 == 0:
            print('    申万进度 %d/%d 批' % (done, len(codes)))
        time.sleep(0.05)
    print('  [3/3] 申万三级分类：覆盖 %d/%d 家' % (len(out), len(codes)))
    return out


def main():
    ap = argparse.ArgumentParser(description='抓取 A 股全市场行业/概念分类地图')
    # 输出锚定到仓库根的 data/industry，与当前工作目录无关
    _root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    ap.add_argument('--outdir', default=os.path.join(_root, 'data', 'industry'))
    ap.add_argument('--no-sw', action='store_true', help='跳过申万一/二/三级')
    ap.add_argument('--no-concept', action='store_true', help='跳过概念/主题标签')
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:   # noqa: BLE001
        pass

    os.makedirs(args.outdir, exist_ok=True)

    em = EastmoneyClient(retries=3, timeout=15, sleep=0.3)

    # 连通性探测：默认直连（本机代理可能只对部分流量可用）；全镜像失败再回退系统代理
    probe = {'pn': 1, 'pz': 1, 'po': 1, 'np': 1, 'fltt': 2, 'invt': 2,
             'fid': 'f12', 'fs': 'm:1+t:2', 'fields': 'f12'}
    try:
        em.session.trust_env = False
        _get_clist(em, probe)
    except Exception:   # noqa: BLE001
        em.session.trust_env = True
        _get_clist(em, probe)

    print('==== 全市场分类地图抓取 ====')
    stocks = fetch_all_stocks(em)

    concepts = {}
    if not args.no_concept:
        concepts = fetch_concepts(em, stocks.keys())
    else:
        print('  [2/3] 概念：--no-concept 跳过')

    sw = {}
    if not args.no_sw:
        sw = fetch_sw_all(em, stocks.keys())
    else:
        print('  [3/3] 申万：--no-sw 跳过')

    today = date.today().isoformat()
    rows = []
    n_em = n_sw = n_cp = 0
    for code in sorted(stocks.keys()):
        s = stocks[code]
        cp = sorted(concepts.get(code) or [])
        w = sw.get(code) or {}
        if s['em']:
            n_em += 1
        if w.get('sw3') or w.get('sw1'):
            n_sw += 1
        if cp:
            n_cp += 1
        rows.append({
            '股票代码': code,
            '股票名称': s['name'],
            '东财行业': s['em'],
            '申万一级': w.get('sw1', ''),
            '申万二级': w.get('sw2', ''),
            '申万三级': w.get('sw3', ''),
            '概念标签': '、'.join(cp),
            '数据日期': today,
        })

    out_path = os.path.join(args.outdir, '行业分类地图_%s.csv' % today.replace('-', ''))
    with open(out_path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=OUT_COLUMNS)
        w.writeheader()
        w.writerows(rows)

    print('\n==== 结果 ====')
    print('输出：%s（%d 行）' % (out_path, len(rows)))
    print('覆盖：东财行业 %d · 申万 %d · 概念 %d' % (n_em, n_sw, n_cp))
    # 简单质量报表
    em_cnt, sw3_cnt, cp_cnt = {}, {}, {}
    for r in rows:
        if r['东财行业']:
            em_cnt[r['东财行业']] = em_cnt.get(r['东财行业'], 0) + 1
        if r['申万三级']:
            sw3_cnt[r['申万三级']] = sw3_cnt.get(r['申万三级'], 0) + 1
        for c in (r['概念标签'].split('、') if r['概念标签'] else []):
            cp_cnt[c] = cp_cnt.get(c, 0) + 1
    top = lambda d: '、'.join('%s(%d)' % (k, v) for k, v in sorted(d.items(), key=lambda x: -x[1])[:6])
    print('东财行业 %d 类 · 申万三级 %d 类 · 概念 %d 个' % (len(em_cnt), len(sw3_cnt), len(cp_cnt)))
    print('最大东财行业：%s' % top(em_cnt))
    print('最大概念板块：%s' % top(cp_cnt))


if __name__ == '__main__':
    main()
