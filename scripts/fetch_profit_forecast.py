# -*- coding: utf-8 -*-
"""
从东方财富 F10「盈利预测」接口抓取数据，保存为 CSV。

接口：emweb.securities.eastmoney.com/PC_HSF10/ProfitForecast/PageAjax
  （一个接口返回 5 部分：评级统计 / 一致预期EPS / 一致预期图表(营收净利) / 历史预期 / 券商明细）

生成 CSV 结构（data/盈利预测_{公司名}.csv，含两个区块）：
  ① 券商预测明细（每家券商：EPS + 归母净利预测 + 分析师 + 评级 + 报告日期）
  ② 一致预期（按年份：EPS / PE / ROE / 营收 / 归母净利 / 同比）

用法：
  py fetch_profit_forecast.py --ticker 002463.SZ
  py fetch_profit_forecast.py --tickers 002463.SZ,601138.SH
  py fetch_profit_forecast.py --outdir ../data
"""
import argparse
import csv
import io
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
EMWEB = 'https://emweb.securities.eastmoney.com/PC_HSF10/ProfitForecast/PageAjax'


def to_sec_code(code):
    """'002463.SZ' → 'SZ002463'（emweb 用市场+代码）。"""
    t = str(code).strip().upper()
    if '.' in t:
        c, m = t.split('.')
        return m + c
    # 无后缀，按前缀推断市场
    return 'SH' + t if t[0] in '689' else 'SZ' + t


def fetch_forecast(code):
    """抓取单只股票盈利预测，返回 dict（含 pjtj/jgyc/yctj_chart/yctj_list/ycmx）。"""
    r = requests.get(EMWEB, params={'code': to_sec_code(code)},
                     headers={'User-Agent': UA, 'Referer': 'https://emweb.securities.eastmoney.com/'}, timeout=20)
    r.raise_for_status()
    j = r.json()
    return {
        'name': (j.get('yctj_chart') or [{}])[0].get('SECURITY_NAME_ABBR', ''),
        'rating': j.get('pjtj') or [],         # 评级统计（按时间窗）
        'consensus': j.get('jgyc') or [],      # 一致预期EPS（含近六月平均）
        'chart': j.get('yctj_chart') or [],    # 一致预期图表（营收/净利/EPS/ROE）
        'detail': j.get('ycmx') or [],         # 券商预测明细
    }


def fmt_yi(v):
    """元 → 亿（保留 2 位）。"""
    if v is None or v == '':
        return ''
    try:
        return round(float(v) / 1e8, 2)
    except (TypeError, ValueError):
        return v


def esc_csv(v):
    if v is None or v == '':
        return ''
    s = str(v)
    return '"%s"' % s.replace('"', '""') if re.search(r'[",\n]', s) else s


def build_csv(data):
    """输出与估值模块「盈利预测导入」兼容的格式（ORG/CONS/EPSR 区块标记）。"""
    out = io.StringIO()
    out.write('\ufeff')
    out.write('# GoalTracker 盈利预测\n')
    out.write('公司,%s\n' % data['name'])
    out.write('股票代码,%s\n' % data['code'])

    # 区块①：券商预测明细（ORG,券商,分析师,报告日期,评级,年份1,EPS1,净利1,年份2,EPS2,净利2,年份3,EPS3,净利3）
    for d in data['detail']:
        org = d.get('ORG_NAME_ABBR', '')
        researcher = d.get('RESEARCHER', '')
        date = str(d.get('PUBLISH_DATE', ''))[:10]
        rating = d.get('RATING', '')
        row = ['ORG', org, researcher, date, rating]
        for i in range(1, 4):
            yr = d.get('YEAR%d' % i)
            eps = d.get('EPS%d' % i)
            np_ = d.get('PARENT_NETPROFIT%d' % i)
            row.append(yr if yr is not None else '')
            row.append(eps if eps is not None else '')
            row.append(fmt_yi(np_))
        out.write(','.join(esc_csv(x) for x in row) + '\n')

    # 区块②：一致预期（CONS,年份,标记,EPS,PE,ROE,营收(亿),净利(亿),营收同比%,净利同比%）
    for c in data['chart']:
        row = ['CONS', c.get('YEAR') or '', c.get('YEAR_MARK') or '', c.get('EPS') or '', c.get('PE') or '',
               c.get('ROE') or '', fmt_yi(c.get('TOTAL_OPERATE_INCOME')), fmt_yi(c.get('PARENT_NETPROFIT')),
               c.get('TOTAL_OPERATE_INCOME_RATIO') or '', c.get('PARENT_NETPROFIT_RATIO') or '']
        out.write(','.join(esc_csv(x) for x in row) + '\n')

    # 区块③：机构一致预期 EPS（EPSR,机构,报告日期,年份1,EPS1,PE1,年份2,EPS2,PE2,年份3,EPS3,PE3）
    for jg in data['consensus']:
        row = ['EPSR', jg.get('ORG_NAME_ABBR', ''), str(jg.get('PUBLISH_DATE', ''))[:10]]
        for i in range(1, 4):
            key = 'YEAR%d' % i
            row.append(jg.get(key) if jg.get(key) is not None else '')
            row.append(jg.get('EPS%d' % i) if jg.get('EPS%d' % i) is not None else '')
            row.append(jg.get('PE%d' % i) if jg.get('PE%d' % i) is not None else '')
        out.write(','.join(esc_csv(x) for x in row) + '\n')
    return out.getvalue()


# ----------------------------------------------------------------------
# 把东财原始数据结构转换为估值模块 c.forecast 格式
#   c.forecast = { updated, detail:[{org,researcher,date,rating,pred:[{year,mark,eps,np}]}],
#                  consensus:[{year,mark,eps,pe,roe,revenue,np,revRatio,npRatio}],
#                  eps:[{org,date,year1,eps1,pe1,year2,eps2,pe2,year3,eps3,pe3}] }
# ----------------------------------------------------------------------
def to_forecast_json(d):
    detail = []
    for row in d['detail']:
        pred = []
        for i in range(1, 4):
            yr = row.get('YEAR%d' % i)
            if yr is None:
                continue
            pred.append({
                'year': yr,
                'mark': row.get('YEAR_MARK%d' % i) or '',
                'eps': row.get('EPS%d' % i) if row.get('EPS%d' % i) is not None else None,
                'np': (row.get('PARENT_NETPROFIT%d' % i) / 1e8) if row.get('PARENT_NETPROFIT%d' % i) else None,
            })
        detail.append({
            'org': row.get('ORG_NAME_ABBR', ''),
            'researcher': row.get('RESEARCHER', ''),
            'date': str(row.get('PUBLISH_DATE', ''))[:10],
            'rating': row.get('RATING', ''),
            'pred': pred,
        })
    consensus = []
    for row in d['chart']:
        consensus.append({
            'year': row.get('YEAR'),
            'mark': row.get('YEAR_MARK') or '',
            'eps': row.get('EPS'), 'pe': row.get('PE'), 'roe': row.get('ROE'),
            'revenue': (row.get('TOTAL_OPERATE_INCOME') / 1e8) if row.get('TOTAL_OPERATE_INCOME') else None,
            'np': (row.get('PARENT_NETPROFIT') / 1e8) if row.get('PARENT_NETPROFIT') else None,
            'revRatio': row.get('TOTAL_OPERATE_INCOME_RATIO'),
            'npRatio': row.get('PARENT_NETPROFIT_RATIO'),
        })
    eps = []
    for row in d['consensus']:
        e = {'org': row.get('ORG_NAME_ABBR', ''), 'date': str(row.get('PUBLISH_DATE', ''))[:10]}
        for i in range(1, 4):
            e['year%d' % i] = row.get('YEAR%d' % i)
            e['eps%d' % i] = row.get('EPS%d' % i)
            e['pe%d' % i] = row.get('PE%d' % i)
        eps.append(e)
    return {'updated': time.strftime('%Y-%m-%d'), 'detail': detail, 'consensus': consensus, 'eps': eps}


def load_companies_from_json(json_path):
    """从 goal-tracker-data.json 读取全部 A 股公司，返回 [(ticker, name)]。"""
    import json
    with open(json_path, encoding='utf-8') as f:
        d = json.load(f)
    cs = d.get('valuation', {}).get('companies') or []
    out = []
    for c in cs:
        t = (c.get('ticker') or '').strip().upper()
        if re.match(r'^\d{6}\.(SH|SZ|BJ)$', t):
            out.append((t, c.get('name') or t))
    return out


def update_json_forecast(json_path, ticker, fc):
    """把盈利预测写入 JSON 对应公司的 forecast 字段。"""
    import json
    with open(json_path, encoding='utf-8') as f:
        d = json.load(f)
    target = None
    for c in d.get('valuation', {}).get('companies') or []:
        if (c.get('ticker') or '').strip().upper() == ticker:
            target = c; break
    if target is None:
        return False
    target['forecast'] = fc
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    return True


def load_targets_from_csv(path):
    """从公司列表 CSV 读取目标公司，返回 [(ticker, 公司名), ...]。
    兼容估值模块「⬇ 导出公司列表」与财报跟踪「⬇ 导出 CSV」两种格式，
    只要求含「股票代码」列（「公司名称」可选）；# 注释行跳过，按代码去重。"""
    if not os.path.exists(path):
        print('⚠️  文件不存在：%s' % path)
        return []
    with open(path, encoding='utf-8-sig') as f:
        lines = [ln for ln in f if not ln.lstrip().startswith('#')]

    def norm(s):
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

    targets, seen = [], set()
    for r in csv.DictReader(lines):
        t = norm(r.get('股票代码'))
        n = (r.get('公司名称') or '').strip()
        if not t and not n:
            continue
        if t and t in seen:
            continue
        if t:
            seen.add(t)
        targets.append((t or n, n))
    return targets


def main():
    ap = argparse.ArgumentParser(description='东财F10盈利预测（券商明细+一致预期）→ CSV / 写入 JSON')
    ap.add_argument('--ticker', help='单只股票代码，如 002463.SZ')
    ap.add_argument('--tickers', help='多只，逗号分隔')
    ap.add_argument('--json', dest='json_src', default=None, help='从 goal-tracker-data.json 读取全部公司')
    ap.add_argument('--auto', action='store_true',
                    help='读取 data/公司列表_当前汇总.csv（估值模块「⬇ 导出公司列表」生成）获取公司列表；文件不存在时回退 JSON')
    ap.add_argument('--from-csv', dest='from_csv', default=None,
                    help='从公司列表 CSV 读取目标公司（列：股票代码[,公司名称]，兼容估值模块导出/财报跟踪导出格式）')
    ap.add_argument('--update-json', action='store_true', help='抓取后把盈利预测写入 goal-tracker-data.json')
    ap.add_argument('--no-csv', action='store_true', help='不生成 CSV 文件')
    ap.add_argument('--outdir', default=None, help='输出目录（默认 data/forecast/）')
    args = ap.parse_args()

    if args.outdir is None:
        outdir = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'forecast'))
    else:
        outdir = os.path.normpath(args.outdir)
    os.makedirs(outdir, exist_ok=True)

    # 确定目标公司列表
    tlist = []
    json_path = None
    if args.auto:
        # auto 模式：默认读 data/公司列表_当前汇总.csv（估值模块「⬇ 导出公司列表」生成的完整列表）；
        # 文件不存在时回退 goal-tracker-data.json
        summary_csv = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', '公司列表_当前汇总.csv'))
        if os.path.exists(summary_csv):
            tlist = load_targets_from_csv(summary_csv)
            print('📋 公司列表：data/公司列表_当前汇总.csv（%d 家）' % len(tlist))
        else:
            print('⚠️  未找到 data/公司列表_当前汇总.csv，回退到 goal-tracker-data.json')
            json_path = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'goal-tracker-data.json'))
            tlist = load_companies_from_json(json_path)
    elif args.json_src:
        json_path = os.path.normpath(args.json_src)
        tlist = load_companies_from_json(json_path)
    elif args.from_csv:
        tlist = load_targets_from_csv(args.from_csv)
    else:
        tickers = args.ticker or args.tickers
        if not tickers:
            ap.print_help(); return 1
        tlist = [(t.strip().upper(), '') for t in re.split(r'[,，\s]+', tickers) if t.strip()]
        json_path = None
    if args.update_json and json_path is None:
        json_path = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'goal-tracker-data.json'))

    if not tlist:
        print('没有找到目标公司。'); return 1

    ok = fail = 0
    for t, name in tlist:
        try:
            d = fetch_forecast(t)
            if not d['detail'] and not d['chart']:
                print('⚠️  %s 无盈利预测数据' % t)
                fail += 1; continue
            data = {'code': t, 'name': d['name'] or name, **d}
            # 写 JSON
            if args.update_json and json_path:
                fc = to_forecast_json(d)
                if update_json_forecast(json_path, t, fc):
                    print('  [JSON] %s 已写入 forecast' % t)
            # 写 CSV
            if not args.no_csv:
                content = build_csv(data)
                fname = '盈利预测_%s_%s.csv' % (t, data['name'] or '未知')
                path = os.path.join(outdir, fname)
                with open(path, 'w', encoding='utf-8', newline='') as f:
                    f.write(content)
                print('✅ %s %s → 券商明细%d条, 一致预期%d年 → %s' % (
                    t, data['name'], len(d['detail']), len(d['chart']), path))
            else:
                print('✅ %s %s → 券商明细%d条, 一致预期%d年' % (t, data['name'], len(d['detail']), len(d['chart'])))
            ok += 1
        except Exception as e:
            print('❌ %s 抓取失败: %s' % (t, str(e)[:80]))
            fail += 1
    print('\n完成：成功 %d，失败 %d' % (ok, fail))
    return 0 if fail == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
