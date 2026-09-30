# -*- coding: utf-8 -*-
"""
投资研究数据一键更新流水线：按顺序调用各 fetch_* 脚本，把 data/ 下全部研究数据刷新一遍。
================================================================================
一条命令替代六条：宏观 → 财务 → 行业跟踪 → 盈利预测 → 财报跟踪 → 行情快照。
单步失败不中断后续步骤（最后统一汇报，任一步失败退出码为 1），方便挂计划任务/GitHub Actions。

步骤顺序（研究数据流：先基础面后行情）：
  macro      fetch_daily.py               宏观日度增量（快，先跑）
  financial  fetch_financial.py --auto --skip-unchanged   公司财务三表（增量） → data/financial/
  industry   fetch_daily.py --only ...    行业跟踪 9 指标（VLCC/电源PE/版号/云厂CapEx/存储ROE/军工合同负债/
                                          巨化毛利率/江铜毛利率/沪电营收同比；3 项读 data/financial/，故排在 financial 之后）
  forecast   fetch_profit_forecast.py --auto  盈利预测 → data/forecast/
  earnings   fetch_earnings.py            财报跟踪 → data/earnings/
  prices     fetch_prices.py --auto       行情快照 → data/prices/（本月涨幅计算耗时最长，放最后）

公司列表统一来源 data/公司列表.csv（估值模块「⬇ 导出公司列表」生成），
各 fetch_* 脚本 --auto 均读该文件、缺失时回退 goal-tracker-data.json，口径一致。

用法：
  py update_invest.py                     # 全部 6 步（推荐每日收盘后跑一次）
  py update_invest.py --only prices       # 只跑行情快照
  py update_invest.py --only financial,forecast
  py update_invest.py --skip macro        # 跳过宏观（周末宏观数据不更新时）
  py update_invest.py --list              # 只列出步骤，不执行

定时任务示例（工作日 18:00）：
  schtasks /create /tn "GoalTracker投资数据" /tr "py d:\\WPSSyncdisk\\goal-tracker\\scripts\\update_invest.py" /sc weekly /d MON,TUE,WED,THU,FRI /st 18:00

说明：
  - 抓完后在浏览器投资研究 → 数据导入，把新生成的 CSV 批量导入即可生效。
  - 单步耗时参考：macro ≈ 1-2 分钟、financial ≈ 2-3 分钟、forecast ≈ 1-2 分钟、
    earnings ≈ 2-4 分钟、prices ≈ 4-6 分钟（本月涨幅逐家计算是大头）。
"""
import argparse
import subprocess
import sys
import time

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

# 步骤定义：key → (标题, 脚本, 固定参数)。顺序即执行顺序。
INDUSTRY_KEYS = 'vlcc_tce,pe_power,game_lic,capex_big4,roe_storage,mil_contr,jh_gpm,cu_smelt_gpm,pcb_rev'
STEPS = [
    ('macro',     '宏观日度增量', 'fetch_daily.py', ()),
    ('financial', '公司财务三表', 'fetch_financial.py', ('--auto', '--skip-unchanged')),
    ('industry',  '行业跟踪指标', 'fetch_daily.py', ('--only', INDUSTRY_KEYS)),
    ('forecast',  '盈利预测',     'fetch_profit_forecast.py', ('--auto',)),
    ('earnings',  '财报跟踪',     'fetch_earnings.py', ()),
    ('prices',    '行情快照',     'fetch_prices.py', ('--auto',)),
]


def main():
    ap = argparse.ArgumentParser(description='投资研究数据一键更新：按序调用全部 fetch_* 脚本')
    ap.add_argument('--only', default=None,
                    help='只跑指定步骤（逗号分隔 key：%s）' % ','.join(k for k, _, _, _ in STEPS))
    ap.add_argument('--skip', default=None, help='跳过指定步骤（逗号分隔 key，如 --skip macro,earnings）')
    ap.add_argument('--quarters', type=int, default=None,
                    help='传给 fetch_financial.py：抓取最近 N 期财务数据（默认该脚本自带的 9）')
    ap.add_argument('--list', action='store_true', help='只列出步骤，不执行')
    args = ap.parse_args()

    only = [s.strip() for s in args.only.split(',')] if args.only else None
    skip = {s.strip() for s in args.skip.split(',')} if args.skip else set()
    unknown = (set(only or []) | skip) - {k for k, _, _, _ in STEPS}
    if unknown:
        print('未知步骤 key：%s（可用：%s）' % (','.join(sorted(unknown)), ','.join(k for k, _, _, _ in STEPS)))
        return 1

    steps = [s for s in STEPS if (only is None or s[0] in only) and s[0] not in skip]
    if not steps:
        print('没有要执行的步骤。')
        return 1

    print('=' * 64)
    print('GoalTracker 投资研究 · 数据一键更新（%d 步）' % len(steps))
    print('=' * 64)
    for i, (key, title, script, _) in enumerate(steps, 1):
        print('  %d. %-9s %s（%s）' % (i, key, title, script))
    if args.list:
        return 0

    import os
    here = os.path.dirname(os.path.abspath(__file__))
    results = []   # (key, title, 耗时s, 退出码)
    t_all = time.time()
    for i, (key, title, script, extra) in enumerate(steps, 1):
        cmd = [sys.executable, script, *extra]
        if key == 'financial' and args.quarters:
            cmd += ['--quarters', str(args.quarters)]
        print('\n' + '─' * 64)
        print('▶ [%d/%d] %s · %s' % (i, len(steps), title, ' '.join(cmd[1:])))
        print('─' * 64)
        t0 = time.time()
        try:
            rc = subprocess.call(cmd, cwd=here)
        except Exception as e:   # noqa: BLE001
            print('⚠️ 启动失败：%s' % e)
            rc = -1
        dt = time.time() - t0
        results.append((key, title, dt, rc))
        print('%s [%d/%d] %s 耗时 %d分%02d秒' % (
            '✅' if rc == 0 else '❌', i, len(steps), title, dt // 60, dt % 60))

    # 汇总报告
    print('\n' + '=' * 64)
    print('📋 汇总（总耗时 %d分%02d秒）' % ((time.time() - t_all) // 60, (time.time() - t_all) % 60))
    fails = 0
    for key, title, dt, rc in results:
        mark = '✅' if rc == 0 else '❌'
        if rc != 0:
            fails += 1
        print('  %s %-9s %-8s %4d分%02d秒%s' % (
            mark, key, title, dt // 60, dt % 60, '' if rc == 0 else '（退出码 %s）' % rc))
    if fails:
        print('⚠️  %d 步失败：可单步重跑，如 py update_invest.py --only prices' % fails)
    else:
        print('✅ 全部完成。到浏览器「投资研究 → 数据导入」批量导入新 CSV 即可生效。')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
