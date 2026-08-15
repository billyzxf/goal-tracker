# -*- coding: utf-8 -*-
"""
从东方财富抓取国内宏观经济指标，输出为 GoalTracker 宏观经济模块可导入的 CSV。

数据来源（东方财富宏观数据库，公开接口，免 key）：
  RPT_ECONOMY_GDP    → GDP 同比增速（季度）
  RPT_ECONOMY_CPI    → CPI 同比（月度）
  RPT_ECONOMY_PPI    → PPI 同比（月度）
  RPT_ECONOMY_PMI    → 制造业 PMI（月度）

输出文件（data/ 目录）：
  domestic_国内宏观经济.csv   —— 与宏观经济模块「⬇ 导出 / ⬆ 导入」CSV 完全兼容

用法：
  py fetch_macro.py                       # 抓取全部配置的国内指标
  py fetch_macro.py --outdir ../data      # 指定输出目录
  py fetch_macro.py --periods 24          # 每个指标抓取最近 N 期（默认 24）
  py fetch_macro.py --table-name 国内宏观经济

说明：
  - 以「可扩展配置」驱动：想加指标，往 INDICATORS 里加一项即可
    （需提供 reportName + 字段名 + 频率 + 日期解析方式）。
  - 该文件生成"国内"表；国际指标（美联储利率/美债收益率等）暂未接入，
    后续可在 GROUPS 增加 global 配置并扩展来源。
"""
import argparse
import csv
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

import requests

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
DATACENTER = 'https://datacenter-web.eastmoney.com/api/data/v1/get'


# ----------------------------------------------------------------------
# 指标配置（可扩展）
#   key      指标 key（写入 CSV 的"指标"行的 key 列）
#   name     指标名称
#   unit     单位（% 等）
#   freq     频率：月度 / 季度 / 年度 / 日度
#   category 显示分类（写入 CSV，用于 macro 模块内部分组展示）
#   desc     指标说明
#   report   reportName
#   field    取值字段
#   date     日期解析：'month' → '2026-07'（REPORT_DATE 的 2026-07-01）
#                      'quarter' → '2026Q2'（2026-06-01 → Q2）
# ----------------------------------------------------------------------
INDICATORS = [
    # ---- 国内经济 ----
    dict(key='gdp', name='GDP 同比增速', unit='%', freq='季度', category='国内经济',
         desc='国内生产总值不变价同比增速，反映整体经济增长动能。',
         report='RPT_ECONOMY_GDP', field='SUM_SAME', date='quarter'),
    dict(key='pmi', name='制造业 PMI', unit='', freq='月度', category='国内经济',
         desc='采购经理指数，荣枯线 50。高于 50 景气扩张，低于 50 收缩。',
         report='RPT_ECONOMY_PMI', field='MAKE_INDEX', date='month'),
    dict(key='nmpmi', name='非制造业 PMI', unit='', freq='月度', category='国内经济',
         desc='非制造业采购经理指数（服务业等），荣枯线 50。',
         report='RPT_ECONOMY_PMI', field='NMAKE_INDEX', date='month'),
    # ---- 产业（GDP 分产业同比）----
    dict(key='gdp_first', name='第一产业 GDP 同比', unit='%', freq='季度', category='国内经济',
         desc='第一产业（农林牧渔）GDP 不变价同比增速。',
         report='RPT_ECONOMY_GDP', field='FIRST_SAME', date='quarter'),
    dict(key='gdp_second', name='第二产业 GDP 同比', unit='%', freq='季度', category='国内经济',
         desc='第二产业（工业、建筑业）GDP 不变价同比增速。',
         report='RPT_ECONOMY_GDP', field='SECOND_SAME', date='quarter'),
    dict(key='gdp_third', name='第三产业 GDP 同比', unit='%', freq='季度', category='国内经济',
         desc='第三产业（服务业）GDP 不变价同比增速。',
         report='RPT_ECONOMY_GDP', field='THIRD_SAME', date='quarter'),
    # ---- 物价 ----
    dict(key='cpi', name='CPI 同比', unit='%', freq='月度', category='物价通胀',
         desc='居民消费价格指数同比，观察通胀与通缩压力。低于 0 意味着物价下行。',
         report='RPT_ECONOMY_CPI', field='NATIONAL_SAME', date='month'),
    dict(key='cpi_mom', name='CPI 环比', unit='%', freq='月度', category='物价通胀',
         desc='居民消费价格指数环比，反映短期物价变动动量。',
         report='RPT_ECONOMY_CPI', field='NATIONAL_SEQUENTIAL', date='month'),
    dict(key='cpi_city', name='CPI 城市同比', unit='%', freq='月度', category='物价通胀',
         desc='城市居民消费价格指数同比。',
         report='RPT_ECONOMY_CPI', field='CITY_SAME', date='month'),
    dict(key='cpi_rural', name='CPI 农村同比', unit='%', freq='月度', category='物价通胀',
         desc='农村居民消费价格指数同比。',
         report='RPT_ECONOMY_CPI', field='RURAL_SAME', date='month'),
    dict(key='ppi', name='PPI 同比', unit='%', freq='月度', category='物价通胀',
         desc='工业生产者出厂价格指数同比，反映工业品价格与利润压力。长期为负表明工业通缩。',
         report='RPT_ECONOMY_PPI', field='BASE_SAME', date='month'),
    dict(key='ppi_base', name='PPI 定基指数', unit='', freq='月度', category='物价通胀',
         desc='工业生产者出厂价格定基指数（基期=100），反映工业品绝对价格水平。',
         report='RPT_ECONOMY_PPI', field='BASE', date='month'),
    # ---- 景气动量 ----
    dict(key='pmi_chg', name='制造业 PMI 同比变化', unit='', freq='月度', category='国内经济',
         desc='制造业 PMI 与上年同期的变化，反映景气度动量。',
         report='RPT_ECONOMY_PMI', field='MAKE_SAME', date='month'),
]


def _parse_date(rd, kind):
    """把东财 REPORT_DATE（如 '2026-07-01 00:00:00'）转成模块使用的日期。"""
    date_part = str(rd or '')[:10]
    try:
        y, m, _ = date_part.split('-')
        if kind == 'quarter':
            q = (int(m) - 1) // 3 + 1
            return '%sQ%d' % (y, q)
        return '%s-%s' % (y, m)      # month / year 用前 7 位
    except Exception:                 # noqa: BLE001
        return date_part


def fetch_report(report, periods):
    """抓取某 reportName 的最近 periods 条数据。"""
    params = {
        'reportName': report, 'columns': 'ALL',
        'pageNumber': 1, 'pageSize': periods,
        'sortTypes': '-1', 'sortColumns': 'REPORT_DATE',
    }
    r = requests.get(DATACENTER, params=params, headers={'User-Agent': UA}, timeout=15)
    r.raise_for_status()
    j = r.json()
    res = j.get('result') or {}
    return res.get('data') or []


def esc_csv(v):
    if v is None or v == '':
        return ''
    s = str(v)
    return '"%s"' % s.replace('"', '""') if re.search(r'[",\n]', s) else s


def build_csv(periods, table_name):
    """抓取并生成 macro 兼容 CSV 内容。"""
    out = io.StringIO()
    w = csv.writer(out, lineterminator='\n')
    out.write('\ufeff')
    out.write('# GoalTracker 宏观经济数据\n')
    out.write('表,%s\n' % table_name)

    for cfg in INDICATORS:
        rows = fetch_report(cfg['report'], periods)
        if not rows:
            print('⚠️  %s (%s)：无数据返回，跳过' % (cfg['name'], cfg['report']))
            continue
        # 指标定义行
        out.write('指标,%s,%s,%s,%s,%s,%s\n' % (
            esc_csv(cfg['key']), esc_csv(cfg['name']), esc_csv(cfg['unit']),
            esc_csv(cfg['freq']), esc_csv(cfg['category']), esc_csv(cfg['desc'])))
        # 数据行（旧→新排序）
        pts = []
        for r in rows:
            val = r.get(cfg['field'])
            if val is None or val == '-':
                continue
            try:
                num = float(val)
            except (TypeError, ValueError):
                continue
            d = _parse_date(r.get('REPORT_DATE'), cfg['date'])
            if d:
                pts.append((d, num))
        pts.sort(key=lambda x: x[0])
        for d, num in pts:
            # 四舍五入到 2 位小数，去掉多余的尾随 0，与 macro 模块数据风格一致
            num2 = round(num, 2)
            num_s = ('%f' % num2).rstrip('0').rstrip('.')
            out.write('DATA,%s,%s,%s\n' % (cfg['key'], d, num_s))
        print('✅ %s：%d 期' % (cfg['name'], len(pts)))
    return out.getvalue()


def main():
    ap = argparse.ArgumentParser(description='抓取宏观数据 → GoalTracker macro CSV')
    ap.add_argument('--periods', type=int, default=150, help='每个指标抓取最近 N 期（默认 150，约覆盖 10~12 年；GDP 季度指标受接口 60 条上限约束自动取满）')
    ap.add_argument('--table-name', default='国内宏观经济', help='写入 CSV 的表名')
    ap.add_argument('--outdir', default=None, help='输出目录（默认 <scripts>/../data，即本地数据目录）')
    args = ap.parse_args()

    if args.outdir is None:
        # 默认输出到 data/macro/（宏观数据子目录）
        outdir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'macro'))
    else:
        outdir = os.path.normpath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    content = build_csv(args.periods, args.table_name)
    fname = 'domestic_%s.csv' % args.table_name
    path = os.path.join(outdir, fname)
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(content)
    print('已完成 → %s' % path)
    return 0


if __name__ == '__main__':
    sys.exit(main())
