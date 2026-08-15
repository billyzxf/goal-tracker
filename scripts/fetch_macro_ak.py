# -*- coding: utf-8 -*-
"""
从 akshare 抓取债务/货币与国际宏观指标，输出为 GoalTracker 宏观经济模块可导入的 CSV。

数据来源（akshare，免费开源）：
  国内债务/货币：LPR、M2 货币供应、政府债务余额、社融、新增信贷
  国际宏观：美国 GDP/CPI/联邦基金利率/非农/失业率/10Y国债、欧元区 CPI/GDP、日本 GDP/CPI

输出文件（data/ 目录）：
  domestic_债务货币.csv    —— 表「国内宏观经济」（LPR/M2/政府债务等）
  global_国际宏观经济.csv  —— 表「国际宏观经济」（美国/欧元区/日本等）

用法：
  py fetch_macro_ak.py                      # 抓取全部指标，输出到 data/
  py fetch_macro_ak.py --outdir ../data     # 指定输出目录
  py fetch_macro_ak.py --only global        # 只抓国际（global）或 domestic
  py fetch_macro_ak.py --skip-global        # 跳过国际

说明：
  - 以「配置驱动」：往 INDICATORS 里加一项即可扩展。
  - 自动处理 akshare 的日期格式：季度 YYYY-MM-DD → YYYYQn，月度 YYYY-MM 直接使用。
  - 依赖：pip install akshare pandas
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

import akshare as ak


# ----------------------------------------------------------------------
# 指标配置（可扩展）。字段说明：
#   key      指标 key（CSV 指标行）
#   name     指标名称
#   unit     单位
#   freq     频率：月度/季度/年度/日度
#   category 显示分类
#   desc     指标说明
#   table    'domestic'（国内宏观经济）或 'global'（国际宏观经济）
#   fn       akshare 接口名
#   date_col 日期列名
#   val_col  数值列名（字符串，支持用 '~' 分隔的多个候选）
#   date_kind 'month'（YYYY-MM）/ 'quarter'（YYYY-MM-DD→YYYYQn）/ 'day'（保留月份）
#   recent   'max' 取全部，或数字取最近 N 期
# ----------------------------------------------------------------------
INDICATORS = [
    # ============ 国内债务/货币（table=domestic） ============
    dict(key='lpr1y', name='1 年期 LPR', unit='%', freq='月度', category='货币与金融',
         desc='贷款市场报价利率（1 年期），货币政策宽松程度的核心观测指标。',
         table='domestic', fn='macro_china_lpr', date_col='TRADE_DATE', val_col='LPR1Y',
         date_kind='day'),
    dict(key='lpr5y', name='5 年期以上 LPR', unit='%', freq='月度', category='货币与金融',
         desc='长期贷款基准，与房贷、企业长期融资成本直接相关。',
         table='domestic', fn='macro_china_lpr', date_col='TRADE_DATE', val_col='LPR5Y',
         date_kind='day'),
    dict(key='m2', name='M2 同比', unit='%', freq='月度', category='货币与金融',
         desc='广义货币供应量同比，反映货币供给与信用扩张力度。',
         table='domestic', fn='macro_china_money_supply', date_col='月份',
         val_col='货币和准货币(M2)-同比增长', date_kind='month'),

    # ============ 国际宏观（table=global） ============
    # 注：这些接口"今值/现值"最新一期常为 nan（数据未发布），用 val_fb（前值）兜底。
    dict(key='us_gdp', name='美国 GDP 同比', unit='%', freq='季度', category='海外与利率',
         desc='美国国内生产总值同比增速。',
         table='global', fn='macro_usa_gdp_monthly', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='quarter'),
    dict(key='us_cpi', name='美国 CPI 同比', unit='%', freq='月度', category='海外与利率',
         desc='美国居民消费价格指数同比，反映美国通胀水平。',
         table='global', fn='macro_usa_cpi_yoy', date_col='时间', val_col='现值',
         val_fb='前值', date_kind='month'),
    dict(key='fed_rate', name='美联储联邦基金利率', unit='%', freq='月度', category='海外与利率',
         desc='美国联邦基金目标利率，加息→紧货币，降息→宽货币。',
         table='global', fn='macro_bank_usa_interest_rate', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='us_nonfarm', name='美国非农就业新增', unit='万人', freq='月度', category='海外与利率',
         desc='美国非农就业月度新增人数，反映就业动能。',
         table='global', fn='macro_usa_non_farm', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='us_unemployment', name='美国失业率', unit='%', freq='月度', category='海外与利率',
         desc='美国失业率。失业率上行通常伴随经济走弱。',
         table='global', fn='macro_usa_unemployment_rate', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='us10y', name='美国 10 年期国债收益率', unit='%', freq='日度', category='海外与利率',
         desc='全球资产定价之锚。上行压制成长股估值，下行利好估值抬升。',
         table='global', fn='bond_zh_us_rate', date_col='日期', val_col='美国国债收益率10年',
         date_kind='day'),
    dict(key='euro_cpi', name='欧元区 CPI 同比', unit='%', freq='月度', category='海外与利率',
         desc='欧元区居民消费价格指数同比，反映欧洲通胀水平。',
         table='global', fn='macro_euro_cpi_yoy', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='month'),
    dict(key='euro_gdp', name='欧元区 GDP 同比', unit='%', freq='季度', category='海外与利率',
         desc='欧元区国内生产总值同比增速。',
         table='global', fn='macro_euro_gdp_yoy', date_col='日期', val_col='今值',
         val_fb='前值', date_kind='quarter'),
]


# ----------------------------------------------------------------------
# 日期与数值解析
# ----------------------------------------------------------------------
def parse_date(raw, kind):
    """把 akshare 日期转为模块使用的格式。"""
    s = str(raw).strip()
    # 处理 pandas Timestamp / datetime
    if hasattr(raw, 'strftime'):
        s = raw.strftime('%Y-%m-%d')
    if kind == 'quarter':
        m = re.match(r'^(\d{4})-(\d{1,2})-', s) or re.match(r'^(\d{4})', s)
        if m:
            y = int(m.group(1))
            mo = int(m.group(2)) if len(m.groups()) > 1 and m.group(2) else 1
            q = (mo - 1) // 3 + 1
            return '%dQ%d' % (y, q)
        return s
    if kind == 'month':
        m = re.match(r'^(\d{4})-(\d{1,2})$', s)
        if m:
            return '%s-%02d' % (m.group(1), int(m.group(2)))
        m2 = re.match(r'^(\d{4})-(\d{1,2})-', s)
        if m2:
            return '%s-%02d' % (m2.group(1), int(m2.group(2)))
        # 兼容 akshare 的 '2008年01月份' 格式
        m3 = re.match(r'^(\d{4})年(\d{1,2})', s)
        if m3:
            return '%s-%02d' % (m3.group(1), int(m3.group(2)))
        return s
    if kind == 'day':
        # 日度（如 LPR/国债收益率）：降频为年月（去重取每个月的最后一个）
        m = re.match(r'^(\d{4})-(\d{1,2})', s)
        if m:
            return '%s-%02d' % (m.group(1), int(m.group(2)))
        return s
    return s


def to_num(v):
    if v is None:
        return None
    s = str(v).strip()
    s = s.replace('%', '').replace(',', '').replace('亿元', '')
    if s in ('', '-', '--', 'nan', 'None'):
        return None
    try:
        return float(s)
    except (TypeError, ValueError):
        return None


def find_val_col(df, candidate):
    """从候选列名找实际列；支持模糊匹配（含关键词）。"""
    for col in df.columns:
        c = str(col)
        if c == candidate or candidate in c:
            return col
    return None


def esc_csv(v):
    if v is None:
        return ''
    s = str(v)
    return '"%s"' % s.replace('"', '""') if re.search(r'[",\n]', s) else s


# ----------------------------------------------------------------------
# 抓取并生成单表 CSV
# ----------------------------------------------------------------------
def fetch_indicators(indicators, recent='max'):
    """按配置抓取，返回 [(cfg, points)]，points 为 [(date, value)] 已按日期升序。"""
    results = []
    for cfg in indicators:
        try:
            fn = getattr(ak, cfg['fn'])
            df = fn()
        except Exception as e:   # noqa: BLE001
            print('⚠️  %s（%s）调用失败: %s' % (cfg['name'], cfg['fn'], str(e)[:60]))
            continue
        date_col = cfg['date_col']
        val_col = find_val_col(df, cfg['val_col'])
        if val_col is None:
            print('⚠️  %s：未找到数值列「%s」，可用列: %s' % (cfg['name'], cfg['val_col'], list(df.columns)[:8]))
            continue
        if date_col not in df.columns:
            print('⚠️  %s：未找到日期列「%s」' % (cfg['name'], date_col))
            continue
        # 兜底列：今值/现值为 nan 时用前值（用于数据未发布的最新一期）
        fb_col = find_val_col(df, cfg['val_fb']) if cfg.get('val_fb') else None
        points = []
        for _, row in df.iterrows():
            d = parse_date(row.get(date_col), cfg['date_kind'])
            v = to_num(row.get(val_col))
            if v is None and fb_col is not None:
                v = to_num(row.get(fb_col))
            if d and v is not None:
                points.append((d, v))
        # 按日期升序、去重（同日期保留最后一个）、日度降频后截取最近
        seen = {}
        for d, v in points:
            seen[d] = v
        pts = sorted(seen.items())
        if recent != 'max':
            pts = pts[-recent:]
        print('✅ %-22s %3d 期  %s ~ %s' % (cfg['name'], len(pts), pts[0][0] if pts else '-', pts[-1][0] if pts else '-'))
        results.append((cfg, pts))
    return results


def build_table(indicator_configs):
    """生成一份 macro 兼容 CSV 内容。"""
    out = io.StringIO()
    out.write('\ufeff')
    # 表名：由第一个指标的 table 决定
    table_name = '国内宏观经济' if indicator_configs[0]['table'] == 'domestic' else '国际宏观经济'
    out.write('# GoalTracker 宏观经济数据\n')
    out.write('表,%s\n' % table_name)
    results = fetch_indicators(indicator_configs)
    for cfg, pts in results:
        out.write('指标,%s,%s,%s,%s,%s,%s\n' % (
            esc_csv(cfg['key']), esc_csv(cfg['name']), esc_csv(cfg['unit']),
            esc_csv(cfg['freq']), esc_csv(cfg['category']), esc_csv(cfg['desc'])))
        for d, v in pts:
            v_s = ('%f' % v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)
            out.write('DATA,%s,%s,%s\n' % (cfg['key'], d, v_s))
    return table_name, out.getvalue()


def main():
    ap = argparse.ArgumentParser(description='akshare 抓取债务/国际宏观 → GoalTracker CSV')
    ap.add_argument('--outdir', default=None, help='输出目录（默认 data/）')
    ap.add_argument('--only', choices=['domestic', 'global'], default=None,
                    help='只抓 domestic（国内债务）或 global（国际宏观）')
    args = ap.parse_args()

    if args.outdir is None:
        # 默认输出到 data/macro/（宏观数据子目录）
        outdir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'macro'))
    else:
        outdir = os.path.normpath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    for table in ['domestic', 'global']:
        if args.only and args.only != table:
            continue
        confs = [c for c in INDICATORS if c['table'] == table]
        if not confs:
            continue
        print('=' * 60)
        print('抓取「%s」指标...' % ('国内宏观经济' if table == 'domestic' else '国际宏观经济'))
        table_name, content = build_table(confs)
        fname = ('domestic_债务货币.csv' if table == 'domestic' else 'global_国际宏观经济.csv')
        path = os.path.join(outdir, fname)
        with open(path, 'w', encoding='utf-8', newline='') as f:
            f.write(content)
        print('生成 → %s（%s）' % (path, table_name))
    print('\n全部完成。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
