# -*- coding: utf-8 -*-
r"""
统一宏观数据抓取：多数据源候选链 → 增量合并 → 单个 CSV。
生成文件可被宏观模块「⬆ 导入全部」直接使用。

指标 key 与 modules/macro.js 的 seed 严格对齐（导入后自动归入五层体系并参与打分）。

数据源（每个指标配置候选链，依次尝试，第一个成功者生效）：
  eastmoney  东财 datacenter 接口（GDP/CPI/PPI/PMI 等国内指标）
  ak         akshare（中美国债收益率/LPR/货币供给/北向/指数PE 等；fn 不存在时自动跳过）
  fred       FRED 官方 CSV（实际利率 DFII10 / 盈亏平衡通胀 T10YIE / 联邦基金目标上限 DFEDTARU；需非浏览器 UA）
  treasury   美财政部官方日度收益率曲线 CSV（美债 2Y/10Y/30Y 兜底，最稳官方源）
  yahoo      Yahoo Finance 日线（DXY/布伦特/COMEX金/铜/离岸人民币 兜底）
  sina_hq    新浪实时行情（预留）
  em_kline   东财 K线接口（COMEX 金 101.GC00Y / 铜 101.HG00Y / WTI 102.CL00Y / 人民币 133.USDCNH / 美元指数 100.UDI；主域失败自动切镜像域）
  em_kline_sum  多 secid 成交额合计（A股成交额 = 上证 1.000001 + 深证综指 0.399106）
  em_dc      东财 datacenter 通用报表（两融余额 RPTA_RZRQ_LSHJ.RZRQYE / LPR / 货币供给兜底）
  stooq      stooq.com 日线（优先尝试；该站有每日请求限额，可能 404，失败自动走下一候选）

所有 HTTP 请求内置 3 次重试（2s 间隔），应对代理/网络抖动。

用法：
  py fetch_macro_all.py                  # 抓取全部（增量：跳过已有日期，默认）
  py fetch_macro_all.py --fresh          # 全量重抓（覆盖全部）
  py fetch_macro_all.py --outdir PATH    # 指定输出目录

定期执行：
  1) GitHub Actions（推荐）：.github/workflows/macro-data.yml 已配置工作日
     14:30 / 22:00（北京时间）自动抓取并提交 CSV，页面导入即为最新。
  2) 本机 Windows 计划任务（示例）：
     schtasks /create /tn "GoalTracker宏观" /tr "py d:\WPSSyncdisk\goal-tracker\scripts\fetch_macro_all.py" /sc weekly /d MON,TUE,WED,THU,FRI /st 15:30

无稳定自动源、需每月手动录入的指标（脚本结束时也会打印）：
  社融存量同比/核心CPI/PMI新订单/工业增加值/社零/固投/工业企业利润/地产销售/DR007/ETF资金流
  （国家统计局/央行发布，月度频率，手动录入成本很低）

依赖：requests、akshare、pandas（akshare 缺失时仅跳过 ak 源，其余源照常工作）
"""
import argparse
import csv
import io
import os
import re
import socket
import sys
from datetime import datetime, timedelta, timezone

socket.setdefaulttimeout(30)   # 兜底：akshare 内部 requests 未设超时，防挂起

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')

# 旧 CSV key → 新 key（导入增量时自动把旧数据并过来，避免历史丢失）
LEGACY_MERGE = {'fed': ['fed_rate']}

TABLE_NAMES = {'domestic': '国内宏观经济', 'global': '国际宏观经济'}


def I(key, name, unit, freq, category, desc, chain):
    """指标配置：category 决定所属 CSV 表与前端分组（海外与利率→global，其余→domestic）。"""
    return dict(key=key, name=name, unit=unit, freq=freq, category=category,
                desc=desc, chain=chain)


# ----------------------------------------------------------------------
# 统一指标配置（key 与 macro.js seed 对齐）
# ----------------------------------------------------------------------
INDICATORS = [
    # ============ 全球流动性 / 海外利率（表：国际宏观经济） ============
    I('us2y', '美债 2Y 收益率', '%', '日度', '海外与利率',
      '美联储政策预期的镜像。2Y上行=加息预期升温，压制成长股估值。',
      [dict(type='ak', fn='bond_zh_us_rate', date_col='日期', val_col='美国国债收益率2年', date_kind='day'),
       dict(type='treasury', tenor='2 Yr')]),
    I('us10y', '美债 10Y 收益率', '%', '日度', '海外与利率',
      '全球资产定价之锚。上行压制成长股估值，下行利好估值抬升。',
      [dict(type='ak', fn='bond_zh_us_rate', date_col='日期', val_col='美国国债收益率10年', date_kind='day'),
       dict(type='treasury', tenor='10 Yr')]),
    I('us30y', '美债 30Y 收益率', '%', '日度', '海外与利率',
      '长期通胀、财政与期限溢价的观测窗口。',
      [dict(type='ak', fn='bond_zh_us_rate', date_col='日期', val_col='美国国债收益率30年', date_kind='day'),
       dict(type='treasury', tenor='30 Yr')]),
    I('real10y', '10Y TIPS 实际利率', '%', '日度', '海外与利率',
      '名义10Y = 实际利率 + 通胀预期。实际利率↑对成长股最不友好。',
      [dict(type='fred', series='DFII10')]),
    I('breakeven', '10Y 盈亏平衡通胀', '%', '日度', '海外与利率',
      '10Y名义 − 10Y实际 = 通胀预期。上行利好黄金/能源/资源股。',
      [dict(type='fred', series='T10YIE')]),
    I('dxy', '美元指数 DXY', '', '日度', '海外与利率',
      '美元↑=全球美元流动性收紧，新兴市场承压、人民币贬值压力上升。',
      [dict(type='yahoo', symbol='DX-Y.NYB'),
       dict(type='em_kline', secid='100.UDI', field='close'),
       dict(type='stooq', symbols=['dx.f', '^dxy'])]),
    I('oil', '原油（布伦特）', '美元', '日度', '海外与利率',
      '油价↑→通胀↑→美联储宽松空间↓→美债利率↑→估值承压。',
      [dict(type='yahoo', symbol='BZ=F'),
       dict(type='stooq', symbols=['cb.f', 'cl.f'])]),
    I('gold', '黄金', '美元', '日度', '海外与利率',
      '实际利率/美元/避险/央行购金的综合温度计，与实际利率负相关最稳定。',
      [dict(type='yahoo', symbol='GC=F'),
       dict(type='em_kline', secid='101.GC00Y', field='close'),
       dict(type='stooq', symbols=['xauusd', 'gc.f'])]),
    I('copper', '铜（Doctor Copper）', '美元', '日度', '海外与利率',
      '全球工业周期风向标：电力/制造/地产/新能源需求同步指标。',
      [dict(type='yahoo', symbol='HG=F'),
       dict(type='em_kline', secid='101.HG00Y', field='close'),
       dict(type='stooq', symbols=['hg.f'])]),
    I('fed', '美联储政策利率', '%', '月度', '海外与利率',
      '美国短端利率之锚：加息→全球无风险利率↑→估值承压；降息反之（但要看降息原因）。',
      [dict(type='ak', fn='macro_bank_usa_interest_rate', date_col='日期', val_col='今值',
            val_fb='前值', date_kind='month'),
       dict(type='fred', series='DFEDTARU')]),
    # ---- 遗留指标（旧 CSV 已有，保留导出以不丢历史） ----
    I('us_gdp', '美国 GDP 同比', '%', '季度', '海外与利率', '美国GDP同比（参考）。',
      [dict(type='ak', fn='macro_usa_gdp_monthly', date_col='日期', val_col='今值', val_fb='前值', date_kind='quarter')]),
    I('us_cpi', '美国 CPI 同比', '%', '月度', '海外与利率', '美国通胀（参考，影响 Fed 预期）。',
      [dict(type='ak', fn='macro_usa_cpi_yoy', date_col='时间', val_col='现值', val_fb='前值', date_kind='month')]),
    I('us_nonfarm', '美国非农就业新增', '万人', '月度', '海外与利率', '美国就业动能（参考）。',
      [dict(type='ak', fn='macro_usa_non_farm', date_col='日期', val_col='今值', val_fb='前值', date_kind='month')]),
    I('euro_cpi', '欧元区 CPI 同比', '%', '月度', '海外与利率', '欧洲通胀（参考）。',
      [dict(type='ak', fn='macro_euro_cpi_yoy', date_col='日期', val_col='今值', val_fb='前值', date_kind='month')]),
    I('euro_gdp', '欧元区 GDP 同比', '%', '季度', '海外与利率', '欧元区增长（参考）。',
      [dict(type='ak', fn='macro_euro_gdp_yoy', date_col='日期', val_col='今值', val_fb='前值', date_kind='quarter')]),

    # ============ 中国流动性 / 汇率（表：国内宏观经济） ============
    I('usdcny', '人民币汇率 USDCNY', '', '日度', '海外与利率',
      '比绝对值更重要的是变化速度：快速贬值→央行政策空间受限→外资风险偏好下降。',
      [dict(type='em_kline', secid='133.USDCNH', field='close'),
       dict(type='yahoo', symbol='CNH=X'),
       dict(type='stooq', symbols=['usdcnh'])]),
    I('cn10y', '中国 10Y 国债收益率', '%', '日度', '海外与利率',
      '人民币资产定价锚。股债收益差的分母之一。',
      [dict(type='ak', fn='bond_zh_us_rate', date_col='日期', val_col='中国国债收益率10年', date_kind='day')]),
    I('cn1y', '中国 1Y 国债收益率', '%', '日度', '海外与利率',
      '短端资金面观测，与 DR007 互相印证。',
      [dict(type='ak', fn='bond_china_yield', params={'start_date': '{T-120}', 'end_date': '{T}'},
            date_col='日期', val_candidates=['1年', '收益率', '收益率(%)'], date_kind='day',
            filters=[dict(col='曲线名称', contains='国债')]),
       dict(type='chinamoney', term=1, days=120)]),
    I('lpr1y', '1 年期 LPR', '%', '月度', '货币与金融',
      '贷款市场报价利率（1 年期），货币政策宽松程度的核心观测指标。',
      [dict(type='ak', fn='macro_china_lpr', date_col='TRADE_DATE', val_col='LPR1Y', date_kind='day'),
       dict(type='em_dc', report='RPT_ECONOMY_LPR', field_candidates=['LPR1Y'],
            date_field='TRADE_DATE')]),
    I('lpr5y', '5 年期以上 LPR', '%', '月度', '货币与金融',
      '长期贷款基准，与房贷、企业长期融资成本直接相关。',
      [dict(type='ak', fn='macro_china_lpr', date_col='TRADE_DATE', val_col='LPR5Y', date_kind='day'),
       dict(type='em_dc', report='RPT_ECONOMY_LPR', field_candidates=['LPR5Y'],
            date_field='TRADE_DATE')]),
    I('m1', 'M1 同比', '%', '月度', '货币与金融',
      '企业活期资金与交易活跃度。M1↑/剪刀差收窄=资金活化，利好权益。',
      [dict(type='ak', fn='macro_china_money_supply', date_col='月份',
            val_candidates=['货币(M1)-同比增长', '货币和准货币(M1)-同比增长'], date_kind='month'),
       dict(type='em_dc', report='RPT_ECONOMY_MONEY_SUPPLY',
            field_candidates=['M1_SAME', 'M1_YOY'], date_field='TIME')]),
    I('m2', 'M2 同比', '%', '月度', '货币与金融',
      '广义货币/资金总量。单独看意义有限，重点是 M1-M2 剪刀差。',
      [dict(type='ak', fn='macro_china_money_supply', date_col='月份',
            val_col='货币和准货币(M2)-同比增长', date_kind='month'),
       dict(type='em_dc', report='RPT_ECONOMY_MONEY_SUPPLY',
            field_candidates=['M2_SAME', 'M2_YOY'], date_field='TIME')]),

    # ============ 中国经济周期 / 价格（表：国内宏观经济） ============
    I('gdp', 'GDP 同比增速', '%', '季度', '国内经济',
      '滞后指标：回答"经济处于什么状态"，不适合预测下月涨跌。',
      [dict(type='eastmoney', report='RPT_ECONOMY_GDP', field='SUM_SAME', date='quarter')]),
    I('pmi', '制造业 PMI', '', '月度', '国内经济',
      '荣枯线50，比GDP快的领先指标。重点拆新订单（需求）而非只看headline。',
      [dict(type='eastmoney', report='RPT_ECONOMY_PMI', field='MAKE_INDEX', date='month')]),
    I('cpi', 'CPI 同比', '%', '月度', '物价通胀',
      '居民物价。核心CPI（剔除食品能源）更值得长期跟踪。',
      [dict(type='eastmoney', report='RPT_ECONOMY_CPI', field='NATIONAL_SAME', date='month')]),
    I('ppi', 'PPI 同比', '%', '月度', '物价通胀',
      '工业品价格=企业利润先行指标。PPI↑利好周期资源，PPI持续为负警惕通缩。',
      [dict(type='eastmoney', report='RPT_ECONOMY_PPI', field='BASE_SAME', date='month')]),

    # ============ 市场自身（表：国内宏观经济，分类"市场"） ============
    I('turnover', 'A股成交额', '万亿', '日度', '市场',
      '钱有没有真正进入股票：指数涨但缩量≠健康；横盘放量可能在风格切换。',
      [dict(type='em_kline_sum', secids=['1.000001', '0.399106'], factor=1e-12)]),   # 元 → 万亿
    I('northbound', '北向资金净流入', '亿', '日度', '市场',
      '外资风险偏好观测。持续流出常与美元走强同期出现——先看 DXY 再解读。',
      [dict(type='ak', fn='stock_hsgt_hist_em', params={'symbol': '北向资金'},
            date_col='日期', val_candidates=['当日成交净买额', '净买额'], date_kind='day')]),
    I('margin', '两融余额', '万亿', '日度', '市场',
      '杠杆资金规模。快速上行=风险偏好高（也是脆弱点），快速下行=去杠杆压力。',
      [dict(type='em_dc', report='RPTA_RZRQ_LSHJ', field_candidates=['RZRQYE'],
            date_field='DIM_DATE', factor=1e-12)]),   # 元 → 万亿
    I('hs300pe', '沪深300 PE', '倍', '周度', '市场',
      '大盘估值锚（股债收益差的分子）。PE本身无意义，看分位数才有意义。',
      [dict(type='ak', fn='stock_index_pe_lg', params={'symbol': '沪深300'},
            date_col='日期', val_candidates=['滚动市盈率', '静态市盈率', '市盈率'], date_kind='day')]),
    I('csi500pe', '中证500 PE', '倍', '周度', '市场',
      '中盘估值。与沪深300 PE 比值走阔=成长/小盘占优。',
      [dict(type='ak', fn='stock_index_pe_lg', params={'symbol': '中证500'},
            date_col='日期', val_candidates=['滚动市盈率', '静态市盈率', '市盈率'], date_kind='day')]),
    I('allape', '全部A股市盈率', '倍', '周度', '市场',
      '全市场估值中枢，必须结合历史分位数看。',
      [dict(type='ak', fn='stock_a_ttm_lyr', date_col='日期', date_candidates=['日期', 'date'],
            val_candidates=['市盈率TTM', 'middlePETTM', 'TTM市盈率', '市盈率'], date_kind='day')]),
]

# 无稳定自动源、需手动录入的 seed 指标（结束时打印提醒）
MANUAL_KEYS = ['tsf', 'corecpi', 'pmi_new', 'indval', 'indprofit', 'fixedasset',
               'retail', 'exports', 'prop_sale', 'unemp', 'dr007', 'etfflow',
               'corploan', 'hhloan', 'govbond', 'cpi_mom']

# 遗留指标（旧 CSV 有历史数据，保留导出）
LEGACY_KEYS = {'gdp_first', 'gdp_second', 'gdp_third', 'nmpmi', 'cpi_mom',
               'cpi_city', 'cpi_rural', 'ppi_base', 'us_unemployment'}


def table_of(key, category):
    if key in LEGACY_KEYS:
        return 'global' if key in {'us_unemployment'} else 'domestic'
    return 'global' if category == '海外与利率' else 'domestic'


# ----------------------------------------------------------------------
# 各数据源抓取
# ----------------------------------------------------------------------
UA_BROWSER = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
              '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')
UA_PLAIN = 'goal-tracker-data/1.0'


def _http_get(url, params=None, headers=None, timeout=20, retries=3):
    """带重试的 GET：网络/代理抖动时退避重试。headers 不含 UA 时用浏览器 UA。"""
    import requests
    import time
    h = {'User-Agent': UA_BROWSER}
    if headers:
        h.update(headers)
    last = None
    for i in range(retries):
        try:
            r = requests.get(url, params=params, headers=h, timeout=timeout)
            r.raise_for_status()
            return r
        except Exception as e:   # noqa: BLE001
            last = e
            if i < retries - 1:
                time.sleep(2 * (i + 1))
    raise last


def _tmpl(v):
    """参数日期模板：{T} → 今天，{T-n} → n 天前（YYYYMMDD / YYYY-MM-DD 视目标而定，
    统一给 YYYY-MM-DD，akshare 兼容两者）。"""
    s = str(v)
    today = datetime.now()

    def rep(m):
        return (today - timedelta(days=int(m.group(1) or 0))).strftime('%Y-%m-%d')
    return re.sub(r'\{T(?:-(\d+))?\}', rep, s)


def fetch_eastmoney(cfg, periods=150):
    dc = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
    params = {'reportName': cfg['report'], 'columns': 'ALL', 'pageNumber': 1,
              'pageSize': periods, 'sortTypes': '-1', 'sortColumns': 'REPORT_DATE',
              'source': 'HSF10', 'client': 'PC'}
    rows = (_http_get(dc, params=params).json().get('result') or {}).get('data') or []
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


_AK_CACHE = {}   # (fn, params) → DataFrame，bond_zh_us_rate 等一次抓取多指标复用


def fetch_ak(step):
    """akshare 抓取：fn 不存在 / 列不匹配均抛异常进入下一个候选源。
    step: fn, date_col, val_col|val_candidates, date_kind, params?, val_fb?, filters?"""
    import akshare as ak
    fn = getattr(ak, step['fn'], None)
    if fn is None:
        raise RuntimeError('akshare 无函数 %s（版本不含此接口）' % step['fn'])
    params = {k: _tmpl(v) for k, v in (step.get('params') or {}).items()}
    ck = (step['fn'], tuple(sorted(params.items())))
    if ck in _AK_CACHE:
        df = _AK_CACHE[ck]
    else:
        df = fn(**params) if params else fn()
        _AK_CACHE[ck] = df
    if df is None or df.empty:
        raise RuntimeError('返回空数据')

    cands = step.get('val_candidates') or [step.get('val_col')]
    val_col = fb_col = None
    cols = [str(c) for c in df.columns]
    for want in cands:
        if want and want in cols:
            val_col = want
            break
    if val_col is None:
        for want in cands:
            if not want:
                continue
            for c in cols:
                if want in c:
                    val_col = c
                    break
            if val_col:
                break
    if val_col is None:
        raise RuntimeError('未找到值列 %s（实际列：%s）' % (cands, cols[:8]))
    if step.get('val_fb'):
        for c in cols:
            if step['val_fb'] in c:
                fb_col = c
                break

    date_col = None
    want_ds = step.get('date_candidates') or [step['date_col']]
    for want_d in want_ds:
        for c in cols:
            if c == want_d or want_d in c:
                date_col = c
                break
        if date_col:
            break
    if date_col is None:
        raise RuntimeError('未找到日期列 %s' % want_ds)

    filters = step.get('filters') or []
    pts = []
    for _, row in df.iterrows():
        ok = True
        for f in filters:
            v = str(row.get(f['col'], ''))
            if ('contains' in f and f['contains'] not in v) or \
               ('equals' in f and v.strip() != f['equals']):
                ok = False
                break
        if not ok:
            continue
        d = parse_ak_date(row.get(date_col), step['date_kind'])
        v = to_num(row.get(val_col))
        if v is None and fb_col:
            v = to_num(row.get(fb_col))
        if d and v is not None:
            pts.append((d, v))
    if not pts:
        raise RuntimeError('过滤后无数据点')
    return pts


def fetch_fred(series, limit=900):
    """FRED 官方 CSV：https://fred.stlouisfed.org/graph/fredgraph.csv?id=SERIES"""
    txt = _http_get('https://fred.stlouisfed.org/graph/fredgraph.csv',
                    params={'id': series}, timeout=25,
                    headers={'User-Agent': UA_PLAIN}).text
    pts = []
    for line in txt.strip().splitlines()[1:]:
        p = line.split(',')
        if len(p) < 2 or p[1] in ('.', ''):
            continue
        try:
            v = float(p[1])
        except ValueError:
            continue
        pts.append((p[0][:10], v))
    return pts


def fetch_treasury(step):
    """美财政部官方日度收益率曲线 CSV（home.treasury.gov），tenor 形如 '2 Yr'/'10 Yr'。
    抓当年 + 去年两年合并，保证增量历史足够。"""
    tenor = step['tenor']
    now = datetime.now()
    pts = {}
    last_err = '无年份'
    for y in (now.year, now.year - 1):
        url = ('https://home.treasury.gov/resource-center/data-chart-center/'
               'interest-rates/daily-treasury-rates.csv/%d/all' % y)
        try:
            txt = _http_get(url, params={'type': 'daily_treasury_yield_curve',
                                         'field_tdr_date_value': y, 'page': '',
                                         '_format': 'csv'},
                            headers={'User-Agent': UA_PLAIN},
                            timeout=30).text
        except Exception as e:   # noqa: BLE001
            last_err = '%d: %s' % (y, str(e)[:60])
            continue
        rows = list(csv.reader(io.StringIO(txt)))
        if len(rows) < 2:
            last_err = '%d 空表' % y
            continue
        head = [c.strip() for c in rows[0]]
        if tenor not in head:
            raise RuntimeError('无列 %s（实际：%s…）' % (tenor, head[:6]))
        ci = head.index(tenor)
        for r in rows[1:]:
            if len(r) <= ci:
                continue
            try:
                d = datetime.strptime(r[0].strip(), '%m/%d/%Y').strftime('%Y-%m-%d')
                pts[d] = float(r[ci])
            except ValueError:
                continue
    if not pts:
        raise RuntimeError(last_err)
    return sorted(pts.items())


def fetch_yahoo(step):
    """Yahoo Finance 日线：query1.finance.yahoo.com/v8/finance/chart/{symbol}。"""
    j = _http_get('https://query1.finance.yahoo.com/v8/finance/chart/%s' % step['symbol'],
                  params={'range': step.get('range', '2y'), 'interval': '1d'},
                  headers={'User-Agent': UA_PLAIN}, timeout=25).json()
    res = (j.get('chart') or {}).get('result') or []
    if not res:
        raise RuntimeError('chart 无数据')
    r = res[0]
    ts = r.get('timestamp') or []
    quote = ((r.get('indicators') or {}).get('quote') or [{}])[0]
    closes = quote.get('close') or []
    pts = []
    for t, v in zip(ts, closes):
        if v is None:
            continue
        d = datetime.fromtimestamp(t, tz=timezone.utc).strftime('%Y-%m-%d')
        pts.append((d, float(v)))
    if not pts:
        raise RuntimeError('无收盘价')
    return pts


def fetch_chinamoney(step):
    """中国货币网国债收益率曲线（chinamoney.com.cn）。
    term=期限年数（如 1）；接口按日分页（每日 20 条、pageSize 不可调），
    故按单日逐日抓取 days 天。"""
    term = float(step['term'])
    days = int(step.get('days', 120))
    h = {'Referer': 'https://www.chinamoney.com.cn/chinese/bkcurvfix/'}
    url = 'https://www.chinamoney.com.cn/ags/ms/cm-u-bk-currency/ClsYldCurvHis'
    today = datetime.now()
    pts = {}
    for off in range(days, -1, -1):
        d = (today - timedelta(days=off)).strftime('%Y-%m-%d')
        try:
            j = _http_get(url, params={'lang': 'CN', 'reference': '1',
                                       'bondType': 'CYCC000',
                                       'startDate': d, 'endDate': d},
                          headers=h, timeout=15, retries=1).json()
        except Exception:   # noqa: BLE001
            continue   # 单日失败跳过（节假日/网络抖动），不阻断整段
        for r in j.get('records') or []:
            try:
                if abs(float(r.get('yearTermStr', -1)) - term) > 1e-6:
                    continue
                pts[r['newDateValueCN']] = float(r['maturityYieldStr'])
            except (KeyError, ValueError):
                continue
    if not pts:
        raise RuntimeError('无 %s 年期数据' % step['term'])
    return sorted(pts.items())


def fetch_stooq(symbols):
    """stooq 日线 CSV：https://stooq.com/q/d/l/?s=SYM&i=d（取收盘价）"""
    last_err = '无候选符号'
    for sym in symbols:
        try:
            txt = _http_get('https://stooq.com/q/d/l/',
                            params={'s': sym, 'i': 'd'}, timeout=25).text
            rows = [l.split(',') for l in txt.strip().splitlines()[1:] if l]
            pts = []
            for p in rows:
                if len(p) < 5 or p[4] in ('', 'N/D', 'NULL'):
                    continue
                try:
                    pts.append((p[0][:10], float(p[4])))
                except ValueError:
                    continue
            if pts:
                return pts
            last_err = '%s 无数据' % sym
        except Exception as e:   # noqa: BLE001
            last_err = '%s: %s' % (sym, str(e)[:50])
    raise RuntimeError(last_err)


_EM_FLD = {'close': 2, 'amount': 6}   # klines 字段下标：date,open,close,high,low,volume,amount
_EM_HOSTS = ['https://push2his.eastmoney.com', 'https://90.push2his.eastmoney.com',
             'http://push2his.eastmoney.com']   # 末位 http 兜底：部分代理会拦该域 HTTPS


def fetch_em_kline(step):
    """东财K线：secid（如 133.USDCNH / 1.000001），field=close|amount；主域失败自动切镜像域。"""
    idx = _EM_FLD[step.get('field', 'close')]
    params = {'secid': step['secid'], 'klt': step.get('klt', 101), 'fqt': 1,
              'lmt': step.get('lmt', 500), 'end': '20500101',
              'fields1': 'f1,f2,f3,f4,f5,f6',
              'fields2': 'f51,f52,f53,f54,f55,f56,f57'}
    klines, last = [], None
    for host in _EM_HOSTS:
        try:
            j = _http_get(host + '/api/qt/stock/kline/get', params=params).json()
            klines = (j.get('data') or {}).get('klines') or []
            if klines:
                break
        except Exception as e:   # noqa: BLE001
            last = e
            klines = []
    if not klines:
        raise RuntimeError('kline 无数据%s' % ('：%s' % str(last)[:50] if last else ''))
    factor = step.get('factor', 1.0)
    pts = []
    for s in klines:
        p = s.split(',')
        if len(p) <= idx:
            continue
        try:
            pts.append((p[0][:10], float(p[idx]) * factor))
        except ValueError:
            continue
    if not pts:
        raise RuntimeError('kline 无数据')
    return pts


def fetch_em_kline_sum(step):
    """多 secid 成交额合计（上证+深证综指 → 全A成交额），按日期对齐求和。"""
    from collections import defaultdict
    acc = defaultdict(float)
    hit = defaultdict(set)
    for secid in step['secids']:
        sub = fetch_em_kline(dict(step, secids=None, secid=secid, field='amount', factor=1.0))
        for d, v in sub:
            acc[d] += v
            hit[d].add(secid)
    n = len(step['secids'])
    factor = step.get('factor', 1.0)
    return [(d, acc[d] * factor) for d in sorted(acc) if len(hit[d]) == n]


def fetch_em_dc(step):
    """东财 datacenter 通用报表（两融余额等）：report + field_candidates + date_field"""
    dc = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
    params = {'reportName': step['report'], 'columns': 'ALL', 'pageNumber': 1,
              'pageSize': step.get('periods', 600), 'sortTypes': '-1',
              'sortColumns': step['date_field'], 'source': 'WEB', 'client': 'WEB'}
    rows = (_http_get(dc, params=params).json().get('result') or {}).get('data') or []
    factor = step.get('factor', 1.0)
    dfld = step['date_field']
    pts = []
    for row in rows:
        d = parse_ak_date(str(row.get(dfld, ''))[:10], 'day')
        if not d or '-' not in d:
            continue
        for f in step['field_candidates']:
            v = to_num(row.get(f))
            if v is not None:
                pts.append((d, v * factor))
                break
    if not pts:
        raise RuntimeError('报表无数据')
    return pts


FETCHERS = {
    'eastmoney': lambda s: fetch_eastmoney(s),
    'ak': fetch_ak,
    'fred': lambda s: fetch_fred(s['series']),
    'treasury': fetch_treasury,
    'yahoo': fetch_yahoo,
    'chinamoney': fetch_chinamoney,
    'stooq': lambda s: fetch_stooq(s['symbols']),
    'em_kline': fetch_em_kline,
    'em_kline_sum': fetch_em_kline_sum,
    'em_dc': fetch_em_dc,
}


def _run_with_timeout(fn, timeout=90):
    """带超时执行：部分数据源（如 akshare 内部 requests）无超时参数，
    挂起时会卡死整个脚本；超时后放弃该源、走下一候选。"""
    import threading
    result = {}

    def target():
        try:
            result['ok'] = fn()
        except Exception as e:   # noqa: BLE001
            result['err'] = e
    t = threading.Thread(target=target, daemon=True)
    t.start()
    t.join(timeout)
    if t.is_alive():
        raise RuntimeError('超时（%ds，数据源挂起）' % timeout)
    if 'err' in result:
        raise result['err']
    return result.get('ok')


def fetch_chain(cfg):
    """候选链依次尝试，第一个成功且非空的源生效；单源超时 120s 自动放弃。"""
    errs = []
    for step in cfg['chain']:
        fn = FETCHERS.get(step['type'])
        if not fn:
            errs.append('未知源 %s' % step['type'])
            continue
        try:
            return _run_with_timeout(lambda f=fn, s=step: f(s),
                                     step.get('timeout', 120))
        except Exception as e:   # noqa: BLE001
            errs.append('%s: %s' % (step['type'], str(e)[:70]))
    raise RuntimeError('；'.join(errs))


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
        m = re.match(r'^(\d{4}-\d{2}-\d{2})', s)
        if m:
            return m.group(1)
        m = re.match(r'^(\d{4})-(\d{1,2})$', s)
        if m:
            return '%s-%02d' % (m.group(1), int(m.group(2)))
        return s
    return s


def to_num(v):
    if v is None:
        return None
    s = str(v).strip().replace('%', '').replace(',', '').replace('亿元', '')
    if s in ('', '-', '--', 'nan', 'None', '.'):
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
    """读取已有 CSV → {key: {name,unit,freq,category,desc,points{date:value}}}。"""
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


def write_csv(path, store):
    """按配置序输出 CSV（国内表 → 国际表；含旧数据保留键）。"""
    out = io.StringIO()
    out.write('\ufeff')
    out.write('# GoalTracker 宏观经济数据（全部）\n')
    written = set()
    for tkey, tname in TABLE_NAMES.items():
        block = []
        for cfg in INDICATORS:
            if table_of(cfg['key'], cfg['category']) == tkey and cfg['key'] in store and cfg['key'] not in written:
                block.append(cfg['key'])
        # 旧 CSV 里有、但配置已删除的键也保留（不丢历史）
        for k, ent in store.items():
            if k not in written and k not in block and table_of(k, ent.get('category', '')) == tkey:
                block.append(k)
        if not block:
            continue
        out.write('表,%s\n' % tname)
        for key in block:
            ent = store[key]
            written.add(key)
            out.write('指标,%s,%s,%s,%s,%s,%s\n' % (
                esc_csv(key), esc_csv(ent.get('name', key)), esc_csv(ent.get('unit', '')),
                esc_csv(ent.get('freq', '月度')), esc_csv(ent.get('category', '')), esc_csv(ent.get('desc', ''))))
            for d, v in sorted(ent['points'].items()):
                v_s = ('%f' % v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)
                out.write('DATA,%s,%s,%s\n' % (key, d, v_s))
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(out.getvalue())


def main():
    ap = argparse.ArgumentParser(description='多源抓取宏观数据 → 单个 CSV（增量合并）')
    ap.add_argument('--outdir', default=None)
    ap.add_argument('--fresh', action='store_true', help='全量重抓（覆盖已有数据）')
    ap.add_argument('--incremental', action='store_true', help='增量（默认）')
    args = ap.parse_args()
    incremental = not args.fresh

    if args.outdir is None:
        outdir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'macro'))
    else:
        outdir = os.path.normpath(args.outdir)
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, '宏观经济_全部数据.csv')

    store = load_existing(path) if incremental else {}
    print('%s → %s' % ('增量模式：保留已有数据，只补新日期' if incremental else '全量模式：重新抓取', path))

    # 遗留 key 合并（fed_rate → fed 等），避免改 key 后历史丢失
    for new_k, old_ks in LEGACY_MERGE.items():
        tgt = store.setdefault(new_k, {'points': {}})
        for ok in old_ks:
            old = store.pop(ok, None)
            if old:
                tgt.setdefault('name', old.get('name', ok))
                for d, v in old.get('points', {}).items():
                    tgt['points'].setdefault(d, v)
                print('  ↳ 合并历史 %s → %s（%d 条）' % (ok, new_k, len(old.get('points', {}))))

    total_add = 0
    failed = []
    ok_keys = []
    for cfg in INDICATORS:
        tkey = table_of(cfg['key'], cfg['category'])
        try:
            pts = fetch_chain(cfg)
        except Exception as e:   # noqa: BLE001
            print('  ❌ %-22s %s' % (cfg['name'], str(e)[:80]))
            failed.append(cfg['key'])
            pts = None
        if pts:
            ent = store.setdefault(cfg['key'], {
                'name': cfg['name'], 'unit': cfg['unit'], 'freq': cfg['freq'],
                'category': cfg['category'], 'desc': cfg['desc'], 'points': {}})
            ent.update(name=cfg['name'], unit=cfg['unit'], freq=cfg['freq'],
                       category=cfg['category'], desc=cfg['desc'])
            added = 0
            for d, v in sorted(pts):        # 后写的同日覆盖先写（源内去重，新值优先）
                ent['points'][d] = v
                added += 1
            total_add += added
            ok_keys.append(cfg['key'])
            print('  ✓ %-22s %-8s 新增 %d 期（共 %d）' % (cfg['name'], tkey, added, len(ent['points'])))

    # 输出
    write_csv(path, store)

    print('\n完成 → %s（本次新增 %d 条，共 %d 个指标；成功 %d / 失败 %d）'
          % (path, total_add, len(store), len(ok_keys), len(failed)))
    if failed:
        print('失败（不影响其他源，下次自动重试）：%s' % ', '.join(failed))
    have = {c['key'] for c in INDICATORS} | set(store)
    manual = [k for k in MANUAL_KEYS if k not in ok_keys]
    if manual:
        print('仍需手动录入（无稳定自动源）：%s' % ', '.join(manual))
    return 0


if __name__ == '__main__':
    sys.exit(main())
