# -*- coding: utf-8 -*-
"""
统一宏观数据抓取：把东财 + akshare 的所有宏观指标合并输出到一个 CSV。
生成文件可被宏观模块「⬇ 导出全部 / ⬆ 导入全部」直接使用（含国内/国际两张表）。

数据源：
  东财（datacenter）：GDP/CPI/PPI/PMI 等国内指标
  akshare：LPR/M2 等国内债务货币 + 美国/欧元区等国际指标

用法：
  py fetch_macro_all.py                  # 抓取全部（增量：跳过已有日期）
  py fetch_macro_all.py --fresh          # 全量重抓（覆盖全部）
  py fetch_macro_all.py --incremental    # 显式增量（默认）
  py fetch_macro_all.py --outdir ../data/macro # 指定输出目录

说明：
  - 默认输出 data/macro/宏观经济_全部数据.csv（与 macro 模块「导入全部」格式一致）。
  - 增量模式：读取现有 CSV 中已存在的 (指标key, 日期)，跳过它们，只补充新数据。
  - 依赖：requests、akshare、pandas
"""
import argparse
import io
import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass


# ----------------------------------------------------------------------
# 统一指标配置（融合东财 + akshare）
#   source : 'eastmoney' 或 'akshare'
#   东财: report / field / date(month|quarter)
#   akshare: fn / date_col / val_col / date_kind(month|quarter|day) / val_fb(可选前值兜底)
# ----------------------------------------------------------------------
INDICATORS = [
    # ============ 国内宏观经济（表：国内宏观经济） ============
    # --- 东财 ---
    dict(key='gdp', name='GDP 同比增速', unit='%', freq='季度', category='国内经济',
         desc='国内生产总值不变价同比增速，反映整体经济增长动能。',
         source='eastmoney', report='RPT_ECONOMY_GDP', field='SUM_SAME', date='quarter'),
    dict(key='gdp_first', name='第一产业 GDP 同比', unit='%', freq='季度', category='国内经济',
         desc='第一产业（农林牧渔）GDP 不变价同比增速。',
         source='eastmoney', report='RPT_ECONOMY_GDP', field='FIRST_SAME', date='quarter'),
    dict(key='gdp_second', name='第二产业 GDP 同比', unit='%', freq='季度', category='国内经济',
         desc='第二产业（工业、建筑业）GDP 不变价同比增速。',
         source='eastmoney', report='RPT_ECONOMY_GDP', field='SECOND_SAME', date='quarter'),
    dict(key='gdp_third', name='第三产业 GDP 同比', unit='%', freq='季度', category='国内经济',
         desc='第三产业（服务业）GDP 不变价同比增速。',
         source='eastmoney', report='RPT_ECONOMY_GDP', field='THIRD_SAME', date='quarter'),
    dict(key='pmi', name='制造业 PMI', unit='', freq='月度', category='国内经济',
         desc='采购经理指数，荣枯线 50。高于 50 景气扩张，低于 50 收缩。',
         source='eastmoney', report='RPT_ECONOMY_PMI', field='MAKE_INDEX', date='month'),
    dict(key='nmpmi', name='非制造业 PMI', unit='', freq='月度', category='国内经济',
         desc='非制造业采购经理指数（服务业等），荣枯线 50。',
         source='eastmoney', report='RPT_ECONOMY_PMI', field='NMAKE_INDEX', date='month'),
    dict(key='cpi', name='CPI 同比', unit='%', freq='月度', category='物价通胀',
         desc='居民消费价格指数同比，观察通胀与通缩压力。',
         source='eastmoney', report='RPT_ECONOMY_CPI', field='NATIONAL_SAME', date='month'),
    dict(key='cpi_mom', name='CPI 环比', unit='%', freq='月度', category='物价通胀',
         desc='居民消费价格指数环比，反映短期物价变动动量。',
         source='eastmoney', report='RPT_ECONOMY_CPI', field='NATIONAL_SEQUENTIAL', date='month'),
    dict(key='cpi_city', name='CPI 城市同比', unit='%', freq='月度', category='物价通胀',
         desc='城市居民消费价格指数同比。',
         source='eastmoney', report='RPT_ECONOMY_CPI', field='CITY_SAME', date='month'),
    dict(key='cpi_rural', name='CPI 农村同比', unit='%', freq='月度', category='物价通胀',
         desc='农村居民消费价格指数同比。',
         source='eastmoney', report='RPT_ECONOMY_CPI', field='RURAL_SAME', date='month'),
    dict(key='ppi', name='PPI 同比', unit='%', freq='月度', category='物价通胀',
         desc='工业生产者出厂价格指数同比，反映工业品价格与利润压力。',
         source='eastmoney', report='RPT_ECONOMY_PPI', field='BASE_SAME', date='month'),
    dict(key='ppi_base', name='PPI 定基指数', unit='', freq='月度', category='物价通胀',
         desc='工业生产者出厂价格定基指数（基期=100）。',
         source='eastmoney', report='RPT_ECONOMY_PPI', field='BASE', date='month'),
    # --- akshare 债务/货币 ---
    dict(key='lpr1y', name='1 年期 LPR', unit='%', freq='月度', category='货币与金融',
         desc='贷款市场报价利率（1 年期），货币政策宽松程度的核心观测指标。',
         source='akshare', fn='macro_china_lpr', date_col='TRADE_DATE', val_col='LPR1Y', date_kind='day'),
    dict(key='lpr5y', name='5 年期以上 LPR', unit='%', freq='月度', category='货币与金融',
         desc='长期贷款基准，与房贷、企业长期融资成本直接相关。',
         source='akshare', fn='macro_china_lpr', date_col='TRADE_DATE', val_col='LPR5Y', date_kind='day'),
    dict(key='m2', name='M2 同比', unit='%', freq='月度', category='货币与金融',
         desc='广义货币供应量同比，反映货币供给与信用扩张力度。',
         source='akshare', fn='macro_china_money_supply', date_col='月份',
         val_col='货币和准货币(M2)-同比增长', date_kind='month'),

    # ============ 国际宏观经济（表：国际宏观经济） ============
    dict(key='us_gdp', name='美国 GDP 同比', unit='%', freq='季度', category='海外与利率',
         desc='美国国内生产总值同比增速。',
         source='akshare', fn='macro_usa_gdp_monthly', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='quarter'),
    dict(key='us_cpi', name='美国 CPI 同比', unit='%', freq='月度', category='海外与利率',
         desc='美国居民消费价格指数同比，反映美国通胀水平。',
         source='akshare', fn='macro_usa_cpi_yoy', date_col='时间', val_col='现值',
         val_fb='前值', date_kind='month'),
    dict(key='fed_rate', name='美联储联邦基金利率', unit='%', freq='月度', category='海外与利率',
         desc='美国联邦基金目标利率，加息→紧货币，降息→宽货币。',
         source='akshare', fn='macro_bank_usa_interest_rate', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='us_nonfarm', name='美国非农就业新增', unit='万人', freq='月度', category='海外与利率',
         desc='美国非农就业月度新增人数，反映就业动能。',
         source='akshare', fn='macro_usa_non_farm', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='us_unemployment', name='美国失业率', unit='%', freq='月度', category='海外与利率',
         desc='美国失业率。失业率上行通常伴随经济走弱。',
         source='akshare', fn='macro_usa_unemployment_rate', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='us10y', name='美国 10 年期国债收益率', unit='%', freq='日度', category='海外与利率',
         desc='全球资产定价之锚。上行压制成长股估值，下行利好估值抬升。',
         source='akshare', fn='bond_zh_us_rate', date_col='日期', val_col='美国国债收益率10年', date_kind='day'),
    dict(key='euro_cpi', name='欧元区 CPI 同比', unit='%', freq='月度', category='海外与利率',
         desc='欧元区居民消费价格指数同比，反映欧洲通胀水平。',
         source='akshare', fn='macro_euro_cpi_yoy', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='euro_gdp', name='欧元区 GDP 同比', unit='%', freq='季度', category='海外与利率',
         desc='欧元区国内生产总值同比增速。',
         source='akshare', fn='macro_euro_gdp_yoy', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='quarter'),
]


TABLE_NAMES = {'domestic': '国内宏观经济', 'global': '国际宏观经济'}


def table_of(cfg):
    """国内指标归 domestic，其余归 global。"""
    return 'domestic' if cfg['key'] in {'gdp', 'gdp_first', 'gdp_second', 'gdp_third',
                                        'pmi', 'nmpmi', 'cpi', 'cpi_mom', 'cpi_city',
                                        'cpi_rural', 'ppi', 'ppi_base', 'lpr1y', 'lpr5y', 'm2'} else 'global'


# ----------------------------------------------------------------------
# 抓取
# ----------------------------------------------------------------------
def fetch_eastmoney(cfg, periods=150):
    import requests
    UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
          '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
    DC = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
    params = {'reportName': cfg['report'], 'columns': 'ALL', 'pageNumber': 1,
              'pageSize': periods, 'sortTypes': '-1', 'sortColumns': 'REPORT_DATE',
              'source': 'HSF10', 'client': 'PC'}
    r = requests.get(DC, params=params, headers={'User-Agent': UA}, timeout=20)
    rows = (r.json().get('result') or {}).get('data') or []
    pts = []
    for row in rows:
        v = row.get(cfg['field'])
        if v in (None, '', '-'):
            continue
        try:
            v = float(v)
        except (TypeError, ValueError):
            continue
        d = parse_em_date(row.get('REPORT_DATE'), cfg['date'])
        if d:
            pts.append((d, v))
    return pts


def parse_em_date(rd, kind):
    s = str(rd or '')[:10]
    try:
        y, m, _ = s.split('-')
        if kind == 'quarter':
            return '%sQ%d' % (y, (int(m) - 1) // 3 + 1)
        return '%s-%s' % (y, m)
    except Exception:   # noqa: BLE001
        return s


def fetch_akshare(cfg):
    import akshare as ak
    df = getattr(ak, cfg['fn'])()
    date_col = cfg['date_col']
    val_col = None
    for c in df.columns:
        if str(c) == cfg['val_col'] or cfg['val_col'] in str(c):
            val_col = c; break
    if val_col is None:
        print('  ⚠️  %s：未找到列「%s」' % (cfg['name'], cfg['val_col'])); return []
    fb_col = None
    if cfg.get('val_fb'):
        for c in df.columns:
            if cfg['val_fb'] in str(c):
                fb_col = c; break
    pts = []
    for _, row in df.iterrows():
        d = parse_ak_date(row.get(date_col), cfg['date_kind'])
        v = to_num(row.get(val_col))
        if v is None and fb_col is not None:
            v = to_num(row.get(fb_col))
        if d and v is not None:
            pts.append((d, v))
    return pts


def parse_ak_date(raw, kind):
    s = str(raw).strip()
    if hasattr(raw, 'strftime'):
        s = raw.strftime('%Y-%m-%d')
    if kind == 'quarter':
        m = re.match(r'^(\d{4})-(\d{1,2})-', s) or re.match(r'^(\d{4})', s)
        if m:
            y = int(m.group(1)); mo = int(m.group(2)) if len(m.groups()) > 1 and m.group(2) else 1
            return '%dQ%d' % (y, (mo - 1) // 3 + 1)
        return s
    if kind == 'month':
        m = re.match(r'^(\d{4})-(\d{1,2})$', s) or re.match(r'^(\d{4})-(\d{1,2})-', s) or re.match(r'^(\d{4})年(\d{1,2})', s)
        if m:
            return '%s-%02d' % (m.group(1), int(m.group(2)))
        return s
    if kind == 'day':
        m = re.match(r'^(\d{4})-(\d{1,2})', s)
        if m:
            return '%s-%02d' % (m.group(1), int(m.group(2)))
        return s
    return s


def to_num(v):
    if v is None:
        return None
    s = str(v).strip().replace('%', '').replace(',', '').replace('亿元', '')
    if s in ('', '-', '--', 'nan', 'None'):
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def esc_csv(v):
    if v is None or v == '':
        return ''
    s = str(v)
    return '"%s"' % s.replace('"', '""') if re.search(r'[",\n]', s) else s


def load_existing(path):
    """读取已有 CSV，返回 {key: {name,unit,freq,category,desc, points:{date:value}}}。
    增量模式用：保留已有数据，合并新抓取的数据点。"""
    existing = {}
    if not os.path.exists(path):
        return existing
    cur_key = None
    for line in open(path, encoding='utf-8'):
        line = line.strip()
        if not line or line.startswith('#') or line.startswith('表,'):
            continue
        p = line.split(',')
        if len(p) < 2:
            continue
        if p[0] == '指标':
            cur_key = p[1].strip()
            existing.setdefault(cur_key, {
                'name': p[2] if len(p) > 2 else cur_key,
                'unit': p[3] if len(p) > 3 else '',
                'freq': p[4] if len(p) > 4 else '月度',
                'category': p[5] if len(p) > 5 else '',
                'desc': p[6] if len(p) > 6 else '',
                'points': {},
            })
        elif p[0] == 'DATA' and cur_key and cur_key in existing and len(p) >= 4:
            try:
                existing[cur_key]['points'][p[2].strip()] = float(p[3])
            except ValueError:
                pass
    return existing


def main():
    ap = argparse.ArgumentParser(description='统一抓取东财+akshare宏观数据 → 单个 CSV')
    ap.add_argument('--outdir', default=None)
    ap.add_argument('--fresh', action='store_true', help='全量重抓（覆盖已有数据）')
    ap.add_argument('--incremental', action='store_true', help='增量：保留已有数据，只补充新日期（默认）')
    args = ap.parse_args()
    incremental = not args.fresh

    if args.outdir is None:
        # 默认输出到 data/macro/（宏观数据子目录）
        outdir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'macro'))
    else:
        outdir = os.path.normpath(args.outdir)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, '宏观经济_全部数据.csv')

    # 增量模式：加载已有完整数据；全量模式：空
    store = load_existing(path) if incremental else {}
    if incremental:
        print('增量模式：保留已有数据，仅补充新日期（不覆盖）。')
    else:
        print('全量模式：重新抓取全部数据。')

    # 按表分组
    tables = {'domestic': [], 'global': []}
    for cfg in INDICATORS:
        tables[table_of(cfg)].append(cfg)

    total_add = 0
    # 1) 抓取并把新点合并进 store
    for tkey in tables:
        for cfg in tables[tkey]:
            try:
                pts = fetch_eastmoney(cfg) if cfg['source'] == 'eastmoney' else fetch_akshare(cfg)
            except Exception as e:   # noqa: BLE001
                print('  ❌ %s：抓取失败 %s' % (cfg['name'], str(e)[:60]))
                continue
            if not pts:
                print('  ⚠️  %s：无数据' % cfg['name']); continue
            # 去重
            seen = {}
            for d, v in pts:
                seen[d] = v
            ent = store.setdefault(cfg['key'], {
                'name': cfg['name'], 'unit': cfg['unit'], 'freq': cfg['freq'],
                'category': cfg['category'], 'desc': cfg['desc'], 'points': {},
            })
            ent['name'] = cfg['name']; ent['unit'] = cfg['unit']; ent['freq'] = cfg['freq']
            ent['category'] = cfg['category']; ent['desc'] = cfg['desc']
            # 合并新点
            added = 0
            for d, v in seen.items():
                if d not in ent['points']:
                    ent['points'][d] = v
                    added += 1
            total_add += added
            print('  ✓ %-20s 新增 %d 期（已有 %d）' % (cfg['name'], added, len(ent['points'])))

    # 2) 输出完整 CSV（含所有 store 中的指标）
    out = io.StringIO()
    out.write('\ufeff')
    out.write('# GoalTracker 宏观经济数据（全部）\n')
    for tkey, tname in TABLE_NAMES.items():
        confs = tables[tkey]
        if not confs:
            continue
        # 该表有哪些 key（含增量从已有 CSV 带入但本次可能没抓到的）
        keys = [c['key'] for c in confs]
        block = [k for k in keys if k in store]
        if not block:
            continue
        out.write('表,%s\n' % tname)
        for key in block:
            ent = store[key]
            out.write('指标,%s,%s,%s,%s,%s,%s\n' % (
                esc_csv(key), esc_csv(ent['name']), esc_csv(ent['unit']),
                esc_csv(ent['freq']), esc_csv(ent['category']), esc_csv(ent['desc'])))
            for d, v in sorted(ent['points'].items()):
                v_s = ('%f' % v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)
                out.write('DATA,%s,%s,%s\n' % (key, d, v_s))

    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(out.getvalue())
    print('\n完成 → %s（本次新增 %d 条，全文件共 %d 个指标）' % (path, total_add, len(store)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
