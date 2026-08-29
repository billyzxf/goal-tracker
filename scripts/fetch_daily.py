# -*- coding: utf-8 -*-
r"""
每日增量抓取：只更新「日度 / 周度」指标，且只补 CSV 中缺失的日期（最小化请求量与耗时）。
月度指标（GDP/CPI/PMI/LPR/M1/M2 等）不在本脚本范围，请用 fetch_macro_all.py（周/月跑一次即可）。

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
import os
import sys
from datetime import datetime

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

    store = fm.load_existing(path)
    print('[%s] 每日增量：%d 个指标（%s）→ %s'
          % (datetime.now().strftime('%F %T'), len(targets), '/'.join(freqs), path))

    total_new = 0
    ok, failed = [], []
    for cfg in targets:
        ent = store.setdefault(cfg['key'], {
            'name': cfg['name'], 'unit': cfg['unit'], 'freq': cfg['freq'],
            'category': cfg['category'], 'desc': cfg['desc'], 'points': {}})
        ent.update(name=cfg['name'], unit=cfg['unit'], freq=cfg['freq'],
                   category=cfg['category'], desc=cfg['desc'])
        have = ent['points']
        try:
            # 日常增量只需近几天的数据：chinamoney 等逐日请求源把回补窗口压到 14 天
            chain = []
            for st in cfg['chain']:
                if st['type'] == 'chinamoney' and st.get('days', 0) > 14:
                    st = dict(st, days=14)
                chain.append(st)
            t0 = datetime.now()
            # 单指标看门狗 600s：即使数据源在 socket 层挂死也能跳过继续
            pts = fm._run_with_timeout(lambda: fm.fetch_chain(dict(cfg, chain=chain)), timeout=600)
        except Exception as e:   # noqa: BLE001
            print('  ❌ %-20s %s' % (cfg['name'], str(e)[:80]))
            failed.append(cfg['key'])
            continue
        added = 0
        for d, v in sorted(pts):
            if not args.force and d in have:
                continue            # 已有日期直接跳过，不做重复请求落盘
            have[d] = v
            added += 1
        if added:
            ok.append(cfg['key'])
            total_new += added
            print('  ✓ %-20s 新增 %d 期（最新 %s，共 %d）'
                  % (cfg['name'], added, sorted(have)[-1], len(have)))
        else:
            ok.append(cfg['key'])
            print('  ✓ %-20s 已是最新（共 %d 期，耗时 %.0fs）'
                  % (cfg['name'], len(have), (datetime.now() - t0).total_seconds()))

    fm.write_csv(path, store)

    print('\n完成：新增 %d 条；成功 %d / 失败 %d' % (total_new, len(ok), len(failed)))
    if failed:
        print('失败（下次自动重试）：%s' % ', '.join(failed))
    # 全部失败视为异常（便于 CI/计划任务告警），部分失败返回 0
    return 1 if (failed and not ok) else 0


if __name__ == '__main__':
    sys.exit(main())
