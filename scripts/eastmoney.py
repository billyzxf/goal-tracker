# -*- coding: utf-8 -*-
"""
东方财富（Eastmoney）数据接口客户端
=====================================
提供 A 股财务数据 / 行情估值 / 宏观数据的抓取封装。

接口均为东方财富公开接口，免费、免鉴权。使用 requests 库。

用法：
    from eastmoney import EastmoneyClient
    em = EastmoneyClient()
    rows = em.finance_main('601138.SH')      # 核心财务指标（165 字段）
    rows = em.finance_income('601138.SH')    # 利润表（203 字段）
    rows = em.finance_balance('601138.SH')   # 资产负债表
    rows = em.finance_cashflow('601138.SH')  # 现金流量表
    rows = em.predict('601138.SH')           # 业绩预告
    q = em.quote('601138.SH')                # 实时行情（22 字段）
    rows = em.macro_gdp()                    # 宏观 GDP（含分产业）
    rows = em.macro_cpi()                    # 宏观 CPI（全国/城市/农村、同比/环比/累计）
"""
import time
import requests

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/120.0 Safari/537.36')

DATACENTER = 'https://datacenter-web.eastmoney.com/api/data/v1/get'
PUSH2 = 'https://push2.eastmoney.com/api/qt/stock/get'


def secid(ticker):
    """把 '601138.SH' / '000977.SZ' / '830799.BJ' 转成东财 secid 格式。
    规则：沪市(6/9开头、8/4开头北交) = 1.代码；深市(0/2/3开头) = 0.代码。
    东财 secid 前缀：1=上交所/北交所，0=深交所。
    """
    t = str(ticker).strip().upper()
    if '.' not in t:
        return '1.' + t
    code, market = t.split('.')
    if market in ('SZ',):
        return '0.' + code
    return '1.' + code


# ----------------------------------------------------------------------
# 财务核心指标字段说明（RPT_F10_FINANCE_MAINFINADATA，共 165 字段）
# 这里列出最有分析价值的字段（key → 中文名 / 单位 / 说明）。仅供阅读，未全部用于换算。
# ----------------------------------------------------------------------
FINANCE_MAIN_FIELDS = {
    # 基本信息
    'SECUCODE': '证券代码', 'SECURITY_NAME_ABBR': '证券简称', 'REPORT_DATE': '报告期',
    'REPORT_TYPE': '报表类型', 'CURRENCY': '币种',
    # 每股指标
    'EPSJB': '基本每股收益(元)', 'EPSKCJB': '扣非每股收益(元)', 'EPSXS': '稀释每股收益(元)',
    'BPS': '每股净资产(元)', 'MGZBGJ': '每股资本公积(元)', 'MGWFPLR': '每股未分配利润(元)',
    'MGJYXJJE': '每股经营现金流(元)',
    # 盈利能力
    'ROEJQ': '净资产收益率ROE(%)', 'ROEKCJQ': '扣非ROE(%)',
    'XSJLL': '净利率(%)', 'XSMLL': '毛利率(%)', 'XSJXLYYSR': '销售净利率(%)',
    'JYXJLYYSR': '经营现金流/营收(%)', 'ROIC': '投入资本回报率(%)',
    'NET_ROI': '净资产收益率(加权)(%)', 'TOTAL_ROI': '总资产收益率(%)',
    # 营运能力
    'ZZCJLL': '总资产周转率(次)', 'YSZKZZTS': '应收账款周转天数(天)',
    'CHZZTS': '存货周转天数(天)', 'ZZCZZTS': '总资产周转天数(天)',
    # 偿债能力
    'ZCFZL': '资产负债率(%)', 'INTEREST_DEBT_RATIO': '有息负债率(%)',
    'LD': '流动比率', 'SD': '速动比率', 'CASH_RATIO': '现金比率(%)',
    'INTEREST_COVERAGE_RATIO': '利息保障倍数', 'XJLLB': '现金流动负债比(%)',
    # 成长能力（同比）
    'TOTALOPERATEREVETZ': '营业总收入同比(%)', 'PARENTNETPROFITTZ': '归母净利润同比(%)',
    'KCFJCXSYJLRTZ': '扣非净利润同比(%)', 'EPSJBTZ': '基本EPS同比(%)',
    'ROEJQTZ': 'ROE同比(%)', 'ZZCJLLTZ': '总资产周转率同比(%)',
    # 规模指标（元，需 ÷1e8）
    'TOTAL_ASSETS_PK': '总资产(元)', 'TOTAL_EQUITY_PK': '所有者权益合计(元)',
    'OPERATE_INCOME_PK': '营业收入(元)', 'OPERATE_PROFIT_PK': '营业利润(元)',
    'NETCASH_OPERATE_PK': '经营现金流净额(元)', 'NETCASH_INVEST_PK': '投资现金流净额(元)',
    'NETCASH_FINANCE_PK': '筹资现金流净额(元)', 'PARENTNETPROFIT': '归母净利润(元)',
    'KCFJCXSYJLR': '扣非净利润(元)',
    # 股本
    'TOTAL_SHARE': '总股本(股)', 'A_FREE_SHARE': 'A股流通股(股)', 'B_FREE_SHARE': 'B股流通股(股)',
    # 其他
    'STAFF_NUM': '员工数(人)', 'RDPERSONNEL': '研发人员数(人)',
    'RDEXPEND': '研发费用(元)', 'RCAPITAL_RATIO': '研发资本化比例(%)',
}
# 规模类字段（元 → 亿需要 ÷1e8）
FINANCE_SCALE_FIELDS = {
    'TOTAL_ASSETS_PK', 'TOTAL_EQUITY_PK', 'OPERATE_INCOME_PK', 'OPERATE_PROFIT_PK',
    'NETCASH_OPERATE_PK', 'NETCASH_INVEST_PK', 'NETCASH_FINANCE_PK',
    'PARENTNETPROFIT', 'KCFJCXSYJLR', 'RDEXPEND', 'TOTAL_SHARE', 'A_FREE_SHARE', 'B_FREE_SHARE',
}

# ----------------------------------------------------------------------
# 行情字段说明（push2 接口，fltt=1）
# key → (中文名, 是否需÷100)  价格/涨幅类需÷100，市值/股本类不需要
# ----------------------------------------------------------------------
QUOTE_FIELDS = {
    'f43': ('现价', True), 'f44': ('最高', True), 'f45': ('最低', True),
    'f46': ('今开', True), 'f60': ('昨收', True), 'f169': ('涨跌额', True),
    'f170': ('涨跌幅%', True), 'f171': ('振幅%', True), 'f168': ('换手率%', True),
    'f47': ('成交量(手)', False), 'f48': ('成交额(元)', False),
    'f57': ('代码', False), 'f58': ('名称', False),
    'f84': ('总股本(股)', False), 'f103': ('流通股本(股)', False),
    'f116': ('总市值(元)', False), 'f117': ('流通市值(元)', False),
    'f162': ('PE动', True), 'f167': ('PB', True), 'f184': ('委比%', True),
}

# ----------------------------------------------------------------------
# 宏观接口定义（reportName → 说明）
# ----------------------------------------------------------------------
MACRO = {
    'GDP': 'RPT_ECONOMY_GDP', 'CPI': 'RPT_ECONOMY_CPI',
    'PPI': 'RPT_ECONOMY_PPI', 'PMI': 'RPT_ECONOMY_PMI',
}


class EastmoneyClient:
    def __init__(self, retries=3, timeout=15, sleep=0.3):
        self.session = requests.Session()
        self.session.headers['User-Agent'] = UA
        self.session.headers['Referer'] = 'https://data.eastmoney.com/'
        self.retries = retries
        self.timeout = timeout
        self.sleep = sleep

    def _get(self, url, params=None):
        last = None
        for i in range(self.retries):
            try:
                r = self.session.get(url, params=params, timeout=self.timeout)
                if r.status_code == 200:
                    return r.json()
            except Exception as e:   # noqa: BLE001
                last = e
            time.sleep(self.sleep)
        raise RuntimeError('请求失败: %s' % (last or 'HTTP 错误'))

    def _datacenter(self, report_name, secu, columns='ALL', page_size=50):
        """通用 datacenter 接口请求，返回 data 列表（无数据返回 []）。"""
        params = {
            'reportName': report_name,
            'columns': columns,
            'filter': '(SECUCODE="%s")' % secu,
            'pageNumber': 1,
            'pageSize': page_size,
            'sortTypes': '-1',
            'sortColumns': 'REPORT_DATE',
            'source': 'HSF10',
            'client': 'PC',
        }
        j = self._get(DATACENTER, params)
        result = (j or {}).get('result') or {}
        return result.get('data') or []

    def _macro(self, report_name, page_size=50):
        """通用宏观接口（无需 filter）。"""
        params = {
            'reportName': report_name, 'columns': 'ALL',
            'pageNumber': 1, 'pageSize': page_size,
            'sortTypes': '-1', 'sortColumns': 'REPORT_DATE',
            'source': 'HSF10', 'client': 'PC',
        }
        j = self._get(DATACENTER, params)
        result = (j or {}).get('result') or {}
        return result.get('data') or []

    # ============ 财务接口 ============
    def finance_main(self, secu, periods=50):
        """核心财务指标（EPS/BPS/ROE/毛利率/负债率/总资产/营收/现金流等 165 字段）。
        periods: 返回最近 N 个报告期（东财最多约 39 期/10年，可按需控制）。"""
        return self._datacenter('RPT_F10_FINANCE_MAINFINADATA', secu, page_size=periods)

    def finance_income(self, secu, periods=50):
        """利润表（营业收入/营业成本/净利润/研发费用等 203 字段）。"""
        return self._datacenter('RPT_F10_FINANCE_GINCOME', secu, page_size=periods)

    def finance_balance(self, secu, periods=50):
        """资产负债表（总资产/所有者权益等）。"""
        return self._datacenter('RPT_F10_FINANCE_GBALANCE', secu, page_size=periods)

    def finance_cashflow(self, secu, periods=50):
        """现金流量表（经营/投资/筹资现金流）。"""
        return self._datacenter('RPT_F10_FINANCE_GCASHFLOW', secu, page_size=periods)

    def predict(self, secu, periods=5):
        """业绩预告（预测净利润区间/同比幅度等 27 字段）。"""
        return self._datacenter('RPT_PUBLIC_OP_NEWPREDICT', secu, page_size=periods)

    def finance_earnings(self, secu, periods=8):
        """业绩报表（RPT_LICO_FN_CPD）：最新一期业绩 + 实际披露日期(NOTICE_DATE)。
        提供营收/净利/同比/ROE/毛利率等，且带财报实际发布日期，用于「财报跟踪」。
        secu 需带后缀（如 601138.SH）；内部按 6 位代码查询。"""
        code6 = str(secu).split('.')[0]
        params = {
            'reportName': 'RPT_LICO_FN_CPD',
            'columns': 'ALL',
            'filter': '(SECURITY_CODE="%s")' % code6,
            'pageNumber': 1,
            'pageSize': periods,
            'sortTypes': '-1',
            'sortColumns': 'REPORTDATE',
            'source': 'HSF10',
            'client': 'PC',
        }
        j = self._get(DATACENTER, params)
        result = (j or {}).get('result') or {}
        return result.get('data') or []

    def finance_earnings_by_date(self, date_from=None, date_to=None, page_size=200, max_pages=100):
        """按「披露日期」批量获取业绩报表（不限股票列表）。
        返回该披露日期/区间内发布财报的**全部公司**最新一期数据（含 NOTICE_DATE/QDATE/营收/净利/同比等）。
        date_from/date_to：'YYYY-MM-DD'，单日可只传 date_from（=date_to）。
        自动分页直到取完；返回 (data_list, count)。"""
        conds = []
        if date_from:
            conds.append("(NOTICE_DATE>='%s')" % date_from)
        if date_to:
            conds.append("(NOTICE_DATE<='%s')" % date_to)
        if not conds:
            raise ValueError('finance_earnings_by_date 需要至少一个日期条件')
        filt = ''.join(conds)
        all_data, page = [], 1
        while page <= max_pages:
            params = {
                'reportName': 'RPT_LICO_FN_CPD',
                'columns': 'ALL',
                'filter': filt,
                'pageNumber': page,
                'pageSize': page_size,
                'sortTypes': '-1',
                'sortColumns': 'NOTICE_DATE',
                'source': 'HSF10',
                'client': 'PC',
            }
            j = self._get(DATACENTER, params)
            result = (j or {}).get('result') or {}
            data = result.get('data') or []
            if not data:
                break
            all_data.extend(data)
            total = result.get('count')
            if total is not None and len(all_data) >= int(total):
                break
            page += 1
        return all_data, (result or {}).get('count')

    def basic_orginfo(self, codes):
        """批量查公司基础资料/行业分类（RPT_F10_BASIC_ORGINFO）。
        codes: 带后缀的股票代码列表，如 ['601138.SH','300308.SZ']。
        返回 {code6: {industry, board}}；industry 为东财三级行业第一级（如"电子"），board 为市场（如"上交所主板A股"）。"""
        out = {}
        # 分批（单批 ≤ 50）
        for i in range(0, len(codes), 50):
            batch = codes[i:i + 50]
            code6s = [str(c).split('.')[0] for c in batch]
            filt = '(SECUCODE in ("%s"))' % '","'.join(batch)
            params = {
                'reportName': 'RPT_F10_BASIC_ORGINFO',
                'columns': 'ALL',
                'filter': filt,
                'pageNumber': 1,
                'pageSize': 200,
                'source': 'HSF10',
                'client': 'PC',
            }
            try:
                j = self._get(DATACENTER, params)
                data = ((j or {}).get('result') or {}).get('data') or []
            except Exception:   # noqa: BLE001
                continue
            for r in data:
                code6 = str(r.get('SECUCODE') or '').split('.')[0]
                if not code6:
                    continue
                lvl = (r.get('BOARD_NAME_LEVEL') or '').split('-')[0].strip()
                out[code6] = {
                    'industry': lvl or '',
                    'board': (r.get('SECURITY_TYPE') or '').strip(),
                }
        return out

    # ============ 宏观接口 ============
    def macro_gdp(self, size=50):
        """GDP（总量/分产业/同比，10 字段）。"""
        return self._macro(MACRO['GDP'], size)

    def macro_cpi(self, size=50):
        """CPI（全国/城市/农村，同比/环比/累计，14 字段）。"""
        return self._macro(MACRO['CPI'], size)

    def macro_ppi(self, size=50):
        """PPI（定基/同比/累计，5 字段）。"""
        return self._macro(MACRO['PPI'], size)

    def macro_pmi(self, size=50):
        """PMI（制造业/非制造业/同比，6 字段）。"""
        return self._macro(MACRO['PMI'], size)

    # ============ 行情估值 ============
    # push2 多镜像：实时行情在某些网络不可达，回退到延时行情（约15分钟延迟）
    PUSH2_HOSTS = ['https://push2.eastmoney.com/api/qt/stock/get',
                   'https://push2delay.eastmoney.com/api/qt/stock/get']

    def quote(self, secu, fields=None):
        """实时行情估值。默认返回全部 22 个可用字段。
        自动在 push2 / push2delay 镜像间回退。
        返回值：{key: {name, raw, value}}。"""
        if fields is None:
            fields = ','.join(QUOTE_FIELDS.keys())
        params = {'secid': secid(secu), 'fields': fields, 'invt': 2, 'fltt': 1}
        data = {}
        last = None
        for host in self.PUSH2_HOSTS:
            try:
                j = self._get(host, params)
                data = (j or {}).get('data') or {}
                if data:
                    break
            except Exception as e:   # noqa: BLE001
                last = e
                continue
        if not data and last:
            raise RuntimeError('行情接口全部不可达: %s' % last)
        out = {}
        for k, v in data.items():
            if k in QUOTE_FIELDS:
                name, div100 = QUOTE_FIELDS[k]
                raw = v
                out[k] = {'name': name, 'raw': raw,
                          'value': (raw / 100) if div100 and isinstance(raw, (int, float)) else raw}
        return out

    def quote_simple(self, secu):
        """实时行情简版：返回 {中文名: 换算后的值}。"""
        q = self.quote(secu)
        return {v['name']: v['value'] for v in q.values()}


# ===================== 工具函数 =====================

def _norm_report_date(report_date):
    """'2026-03-31 00:00:00' → '2026Q1'（用于财务季度标注）。"""
    s = str(report_date or '')
    date_part = s[:10]
    try:
        y, m, _ = date_part.split('-')
        q = (int(m) - 1) // 3 + 1
        return '%sQ%d' % (y, q)
    except Exception:   # noqa: BLE001
        return date_part


def to_yi(value):
    """把"元"数值转成"亿"；None/'-' 返回 None。"""
    if value is None or value == '-' or value == '':
        return None
    try:
        return float(value) / 1e8
    except (TypeError, ValueError):
        return None


# 财务各接口字段的中文注释（除 MAINFINADATA 外，其他接口字段补充说明）
_FINANCE_EXTRA_CN = {
    # 利润表（GINCOME）
    'TOTAL_OPERATE_INCOME': '营业总收入(元)', 'TOTAL_OPERATE_INCOME_YOY': '营业总收入同比(%)',
    'OPERATE_INCOME': '营业收入(元)', 'OPERATE_INCOME_YOY': '营业收入同比(%)',
    'OPERATE_COST': '营业成本(元)', 'OPERATE_PROFIT': '营业利润(元)',
    'TOTAL_PROFIT': '利润总额(元)', 'NETPROFIT': '净利润(元)', 'PARENT_NETPROFIT': '归母净利润(元)',
    'PARENT_NETPROFIT_YOY': '归母净利润同比(%)', 'RESEARCH_EXPENSE': '研发费用(元)',
    'FINANCE_EXPENSE': '财务费用(元)', 'SELLING_EXPENSE': '销售费用(元)', 'MANAGE_EXPENSE': '管理费用(元)',
    # 业绩预告
    'PREDICT_TYPE': '预告类型', 'PREDICT_FINANCE': '预测指标', 'PREDICT_AMT_LOWER': '预测下限(元)',
    'PREDICT_AMT_UPPER': '预测上限(元)', 'ADD_AMP_LOWER': '同比增幅下限(%)', 'ADD_AMP_UPPER': '同比增幅上限(%)',
    'FORECAST_STATE': '预告状态', 'PREDICT_RATIO_LOWER': '预测比例下限(%)', 'PREDICT_RATIO_UPPER': '预测比例上限(%)',
    # 宏观
    'DOMESTICL_PRODUCT_BASE': 'GDP总量(亿元)', 'SUM_SAME': 'GDP同比(%)', 'FIRST_PRODUCT_BASE': '第一产业(亿元)',
    'SECOND_PRODUCT_BASE': '第二产业(亿元)', 'THIRD_PRODUCT_BASE': '第三产业(亿元)',
    'FIRST_SAME': '第一产业同比(%)', 'SECOND_SAME': '第二产业同比(%)', 'THIRD_SAME': '第三产业同比(%)',
    'NATIONAL_SAME': '全国CPI同比(%)', 'NATIONAL_BASE': '全国CPI定基', 'NATIONAL_SEQUENTIAL': '全国CPI环比(%)',
    'NATIONAL_ACCUMULATE': '全国CPI累计', 'CITY_SAME': '城市CPI同比(%)', 'RURAL_SAME': '农村CPI同比(%)',
    'BASE': 'PPI定基', 'BASE_SAME': 'PPI同比(%)', 'BASE_ACCUMULATE': 'PPI累计',
    'MAKE_INDEX': '制造业PMI', 'MAKE_SAME': '制造业PMI同比', 'NMAKE_INDEX': '非制造业PMI', 'NMAKE_SAME': '非制造业PMI同比',
}


def _cn(key):
    """返回字段的中文注释。"""
    if key in FINANCE_MAIN_FIELDS:
        return FINANCE_MAIN_FIELDS[key]
    if key in _FINANCE_EXTRA_CN:
        return _FINANCE_EXTRA_CN[key]
    if key in QUOTE_FIELDS:
        return QUOTE_FIELDS[key][0]
    return ''


def print_indicator(label, rows, max_fields=None, indent='  '):
    """打印一组指标数据。rows 为 list（取首行）或 dict。
    max_fields: 限制打印字段数（不提供则全部打印）。"""
    if not rows:
        print('%s%s：无数据' % (indent, label))
        return
    row = rows[0] if isinstance(rows, list) else rows
    keys = list(row.keys())
    if max_fields:
        keys = keys[:max_fields]
    print('%s%s（%d 个字段）：' % (indent, label, len(keys)))
    for k in keys:
        v = row.get(k)
        if isinstance(v, (list, dict)):
            v = str(v)[:60]
        cn = _cn(k)
        if cn:
            print('%s  %-24s = %-18s (%s)' % (indent, k, v, cn))
        else:
            print('%s  %-24s = %-18s' % (indent, k, v))


if __name__ == '__main__':
    # ============ 单测试用例：打印可获取的所有指标 ============
    import sys
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

    test_secu = sys.argv[1] if len(sys.argv) > 1 else '601138.SH'
    em = EastmoneyClient()

    print('=' * 70)
    print('测试标的：%s（secid=%s）' % (test_secu, secid(test_secu)))
    print('=' * 70)

    # 1) 财务核心指标
    print('\n【1】财务核心指标 RPT_F10_FINANCE_MAINFINADATA')
    try:
        main = em.finance_main(test_secu)
        print_indicator('核心财务指标', main)
    except Exception as e:
        print('  获取失败:', e)

    # 2) 利润表
    print('\n【2】利润表 RPT_F10_FINANCE_GINCOME')
    try:
        inc = em.finance_income(test_secu)
        print_indicator('利润表', inc)
    except Exception as e:
        print('  获取失败:', e)

    # 3) 业绩预告
    print('\n【3】业绩预告 RPT_PUBLIC_OP_NEWPREDICT')
    try:
        pred = em.predict(test_secu)
        print_indicator('业绩预告', pred)
    except Exception as e:
        print('  获取失败:', e)

    # 4) 实时行情
    print('\n【4】实时行情（push2）')
    try:
        q = em.quote(test_secu)
        if q:
            for k, v in q.items():
                print('  %-10s %-10s = %s' % (k, v['name'], v['value']))
        else:
            print('  无行情数据')
    except Exception as e:
        print('  获取失败:', e)

    # 5) 宏观指标
    print('\n【5】宏观经济指标')
    for name, fn in [('GDP', em.macro_gdp), ('CPI', em.macro_cpi),
                     ('PPI', em.macro_ppi), ('PMI', em.macro_pmi)]:
        try:
            rows = fn(2)
            print_indicator(name, rows, max_fields=20)
        except Exception as e:
            print('  %s 获取失败: %s' % (name, e))
