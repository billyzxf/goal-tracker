# -*- coding: utf-8 -*-
r"""
每日增量抓取：每次运行自动补齐指标中缺失的日期（含当天/近期缺口），增量写回 CSV。
月度指标（GDP/CPI/PMI/LPR/M1/M2 等）更新频率低，默认不在本脚本范围，
需要时可加 --freq all 一并补缺；完整重抓请用 fetch_macro_all.py（周/月跑一次即可）。

每次执行会：
  1) 读取现有 CSV，逐指标抓取最新数据（跳过 CSV 中已存在的日期，不重复落盘）；
  2) 每个指标一旦有新数据立即写盘，意外中断/超时也不会丢失本次已抓内容；
  3) 日志明确列出补齐了哪些日期（如「补 1 期：2026-09-10」）或「已是最新」；
  4) 结束时输出「数据新鲜度报告」，标出仍未更新到位的指标及滞后天数。

日志：控制台 + <outdir>/fetch_daily.log（1MB 滚动、保留 3 份），
每条记录含指标状态（补齐哪些日期/已是最新/失败/超时）与耗时。

用法：
  py scripts/fetch_daily.py                  # 日度+周度，自动补齐缺失日期（推荐每日跑）
  py scripts/fetch_daily.py --freq 日度      # 只更日度
  py scripts/fetch_daily.py --freq all       # 不限频率（月度指标也补缺）
  py scripts/fetch_daily.py --only us10y,oil,turnover   # 只补指定指标（key 逗号分隔，不受 --freq 限制）
  py scripts/fetch_daily.py --force          # 忽略已有日期，全部重抓并覆盖同日值
  py scripts/fetch_daily.py --outdir D:\data\macro

定期执行（任选其一）：
  1) GitHub Actions（推荐，见 .github/workflows/macro-data.yml 已含每日任务）
  2) Windows 计划任务（工作日 18:00 示例）：
     schtasks /create /tn "GoalTracker每日数据" /tr "py d:\WPSSyncdisk\goal-tracker\scripts\fetch_daily.py" /sc weekly /d MON,TUE,WED,THU,FRI /st 18:00

依赖：requests、pandas、akshare（与 fetch_macro_all.py 相同）
"""
import argparse
import logging
import os
import re
import sys
from datetime import date, datetime
from logging.handlers import RotatingFileHandler

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

import importlib.util

_spec = importlib.util.spec_from_file_location(
    'fetch_macro_all', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'fetch_macro_all.py'))
fm = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fm)

DAILY_FREQS = ('日度', '周度')

# 数据新鲜度阈值（天）：最新数据的"期末日"距今天超过该值即视为滞后（与前端口径一致）
STALE_LIMIT = {'日度': 7, '周度': 21, '月度': 45, '季度': 120, '年度': 400}


def period_end(s):
    """日期字符串 → 该期最后一天（'2026-09-09'→自身；'2026-08'→月末；'2026Q2'→季末；'2026'→年末）。"""
    t = str(s).strip()
    m = re.match(r'^(\d{4})-(\d{2})-(\d{2})$', t)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    m = re.match(r'^(\d{4})-(\d{2})$', t)
    if m:
        y, mo = int(m.group(1)), int(m.group(2))
        nxt = date(y + (mo == 12), 1 if mo == 12 else mo + 1, 1)
        return date.fromordinal(nxt.toordinal() - 1)
    m = re.match(r'^(\d{4})Q([1-4])$', t, re.I)
    if m:
        y, q = int(m.group(1)), int(m.group(2))
        nxt = date(y + (q == 4), 1 if q == 4 else q * 3 + 1, 1)
        return date.fromordinal(nxt.toordinal() - 1)
    m = re.match(r'^(\d{4})$', t)
    if m:
        return date(int(m.group(1)), 12, 31)
    return None


def staleness(last):
    """最新数据距今的滞后天数（无法解析日期返回 None）。"""
    pe = period_end(last)
    if pe is None:
        return None
    return max(0, (date.today() - pe).days)


def freshness_report(log, store, targets):
    """结束时输出滞后报告：指出仍未更新到正常更新周期内的指标。"""
    rows = []
    for cfg in targets:
        pts = (store.get(cfg['key']) or {}).get('points') or {}
        if not pts:
            rows.append((cfg['name'], cfg['freq'], '无数据', None)); continue
        last = max(pts)
        gap = staleness(last)
        if gap is None or gap > STALE_LIMIT.get(cfg['freq'], 45):
            rows.append((cfg['name'], cfg['freq'], last, gap))
    if not rows:
        log.info('新鲜度检查：全部指标均在正常更新周期内 ✓')
        return
    log.warning('新鲜度检查：%d 个指标未在正常更新周期内（日度>7天 / 周度>21天 / 月度>45天 / 季度>120天）：', len(rows))
    for name, fq, last, gap in rows:
        log.warning('   ⚠ %-20s %-6s 最新 %-12s %s', name, fq, last,
                    '无数据' if gap is None else '滞后 %d 天' % gap)


def setup_log(outdir):
    """控制台 + 滚动文件双写；文件记录完整状态便于事后排查。"""
    log = logging.getLogger('fetch_daily')
    log.setLevel(logging.INFO)
    fmt = logging.Formatter('%(asctime)s %(levelname)-7s %(message)s', datefmt='%F %T')

    ch = logging.StreamHandler(sys.stdout)
    ch.setFormatter(fmt)
    log.addHandler(ch)

    fh = RotatingFileHandler(os.path.join(outdir, 'fetch_daily.log'),
                             maxBytes=1024 * 1024, backupCount=3, encoding='utf-8')
    fh.setFormatter(fmt)
    log.addHandler(fh)
    return log


def main():
    ap = argparse.ArgumentParser(description='每日增量：自动补齐缺失日期，增量写回 CSV')
    ap.add_argument('--outdir', default=None)
    ap.add_argument('--freq', default=','.join(DAILY_FREQS),
                    help='要更新的频率，逗号分隔（默认：日度,周度；all=不限频率）')
    ap.add_argument('--only', default=None, help='只更新指定指标 key（逗号分隔），如 us10y,oil,turnover')
    ap.add_argument('--force', action='store_true', help='重抓全部日期（覆盖同日值），默认只补缺失日期')
    args = ap.parse_args()

    freqs = tuple(f.strip() for f in args.freq.split(',') if f.strip())
    targets = list(fm.INDICATORS) if 'all' in freqs else [c for c in fm.INDICATORS if c['freq'] in freqs]
    wanted = None
    if args.only:
        wanted = {k.strip() for k in args.only.split(',') if k.strip()}
        # 显式指定 key 时不受 --freq 限制（例如 --only pmi 可直接补月度指标）
        targets = [c for c in fm.INDICATORS if c['key'] in wanted]

    if args.outdir:
        outdir = os.path.normpath(args.outdir)
    else:
        outdir = os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'macro'))
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, '宏观经济_全部数据.csv')
    log = setup_log(outdir)

    if wanted:
        miss = wanted - {c['key'] for c in targets}
        if miss:
            log.warning('未匹配到指标 key：%s', ', '.join(sorted(miss)))
    if not targets:
        log.error('没有匹配的指标，退出')
        return 1

    run_t0 = datetime.now()
    log.info('── 每日增量开始：%d 个指标（%s）%s → %s',
             len(targets), '/'.join(freqs), '【force 重抓】' if args.force else '【只补缺失日期】', path)

    store = fm.load_existing(path)

    total_new = 0
    ok, failed = [], []
    for cfg in targets:
        ent = store.setdefault(cfg['key'], {
            'name': cfg['name'], 'unit': cfg['unit'], 'freq': cfg['freq'],
            'category': cfg['category'], 'desc': cfg['desc'], 'points': {}})
        ent.update(name=cfg['name'], unit=cfg['unit'], freq=cfg['freq'],
                   category=cfg['category'], desc=cfg['desc'])
        have = ent['points']
        t0 = datetime.now()
        try:
            # 日常增量只需近几天的数据：chinamoney 等逐日请求源把回补窗口压到 14 天
            chain = []
            for st in cfg['chain']:
                if st['type'] == 'chinamoney' and st.get('days', 0) > 14:
                    st = dict(st, days=14)
                chain.append(st)
            # 单指标看门狗 600s：即使数据源在 socket 层挂死也能跳过继续
            pts = fm._run_with_timeout(lambda: fm.fetch_chain(dict(cfg, chain=chain)), timeout=600)
        except Exception as e:   # noqa: BLE001
            cost = (datetime.now() - t0).total_seconds()
            log.error('❌ %-20s 失败（耗时 %.1fs）：%s', cfg['name'], cost, str(e)[:100])
            failed.append((cfg['key'], cost))
            continue
        new_dates = []
        for d, v in sorted(pts):
            if not args.force and d in have:
                continue            # 已有日期直接跳过，不重复落盘
            have[d] = v
            new_dates.append(d)
        added = len(new_dates)
        cost = (datetime.now() - t0).total_seconds()
        ok.append((cfg['key'], cost))
        if added:
            total_new += added
            # 抓到即落盘：中途中断/被杀也不会丢失本次已抓数据
            fm.write_csv(path, store)
            show = '、'.join(new_dates[-3:])
            more = '' if added <= 3 else ' 等 %d 天' % added
            log.info('✓ %-20s 补 %2d 期：%s%s（最新 %s，共 %d，耗时 %.1fs）',
                     cfg['name'], added, show, more, sorted(have)[-1], len(have), cost)
        else:
            log.info('✓ %-20s 已是最新（最新 %s，共 %d，耗时 %.1fs）',
                     cfg['name'], sorted(have)[-1] if have else '—', len(have), cost)

    if total_new:
        fm.write_csv(path, store)   # 兜底：确保最终文件一致

    run_cost = (datetime.now() - run_t0).total_seconds()
    log.info('── 完成：补齐 %d 条；成功 %d / 失败 %d；总耗时 %.0fs',
             total_new, len(ok), len(failed), run_cost)
    if failed:
        log.warning('失败（下次自动重试）：%s',
                    ', '.join('%s(%.0fs)' % (k, c) for k, c in failed))
    # 数据新鲜度报告：指出仍未更新到位的指标（便于及时发现源失效）
    freshness_report(log, store, targets)
    # 全部失败视为异常（便于 CI/计划任务告警），部分失败返回 0
    return 1 if (failed and not ok) else 0


if __name__ == '__main__':
    sys.exit(main())
