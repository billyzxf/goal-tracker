# -*- coding: utf-8 -*-
r"""
每日增量抓取：只更新「日度 / 周度」指标，且只补 CSV 中缺失的日期（最小化请求量与耗时）。
月度指标（GDP/CPI/PMI/LPR/M1/M2 等）不在本脚本范围，请用 fetch_macro_all.py（周/月跑一次即可）。

日志：控制台 + <outdir>/fetch_daily.log（1MB 滚动、保留 3 份），
每条记录含指标状态（新增/已是最新/失败/超时）与耗时。

用法：
  py scripts/fetch_daily.py                # 日度+周度，只补缺失日期
  py scripts/fetch_daily.py --freq 日度    # 只更日度
  py scripts/fetch_daily.py --force       # 忽略已有日期，全部重抓（覆盖同日值）

定期执行（任选其一）：
  1) GitHub Actions（推荐，见 .github/workflows/macro-data.yml 已含每日任务）
  2) Windows 计划任务（工作日 18:00 示例）：
     schtasks /create /tn "GoalTracker每日数据" /tr "py d:\WPSSyncdisk\goal-tracker\scripts\fetch_daily.py" /sc weekly /d MON,TUE,WED,THU,FRI /st 18:00

依赖：requests、pandas、akshare（与 fetch_macro_all.py 相同）
"""
import argparse
import logging
import os
import sys
from datetime import datetime
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
    ap = argparse.ArgumentParser(description='每日增量：仅抓日度/周度指标，只补缺失日期')
    ap.add_argument('--outdir', default=None)
    ap.add_argument('--freq', default=','.join(DAILY_FREQS),
                    help='要更新的频率，逗号分隔（默认：日度,周度）')
    ap.add_argument('--force', action='store_true', help='重抓全部日期（覆盖同日值），默认只补缺失日期')
    args = ap.parse_args()

    freqs = tuple(f.strip() for f in args.freq.split(',') if f.strip())
    targets = [c for c in fm.INDICATORS if c['freq'] in freqs]

    if args.outdir:
        outdir = os.path.normpath(args.outdir)
    else:
        outdir = os.path.normpath(os.path.join(
            os.path.dirname(os.path.abspath(__file__)), '..', 'data', 'macro'))
    os.makedirs(outdir, exist_ok=True)
    path = os.path.join(outdir, '宏观经济_全部数据.csv')
    log = setup_log(outdir)

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
        added = 0
        for d, v in sorted(pts):
            if not args.force and d in have:
                continue            # 已有日期直接跳过，不做重复请求落盘
            have[d] = v
            added += 1
        cost = (datetime.now() - t0).total_seconds()
        ok.append((cfg['key'], cost))
        if added:
            total_new += added
            log.info('✓ %-20s 新增 %3d 期（最新 %s，共 %d，耗时 %.1fs）',
                     cfg['name'], added, sorted(have)[-1], len(have), cost)
        else:
            log.info('✓ %-20s 已是最新（共 %d 期，耗时 %.1fs）', cfg['name'], len(have), cost)

    fm.write_csv(path, store)

    run_cost = (datetime.now() - run_t0).total_seconds()
    log.info('── 完成：新增 %d 条；成功 %d / 失败 %d；总耗时 %.0fs',
             total_new, len(ok), len(failed), run_cost)
    if failed:
        log.warning('失败（下次自动重试）：%s',
                    ', '.join('%s(%.0fs)' % (k, c) for k, c in failed))
    # 全部失败视为异常（便于 CI/计划任务告警），部分失败返回 0
    return 1 if (failed and not ok) else 0


if __name__ == '__main__':
    sys.exit(main())
