# -*- coding: utf-8 -*-
"""
5 个概念条目 · 概念噪声剔除（一次性脚本）
==========================================
端侧AI芯片 / AI安防/机器视觉 / 具身智能/机器人 / IDC数据中心/供电 / 算力租赁/云服务

污染成因：这 5 个条目 sys='sw1' 但条目名不匹配任何申万分类 → 自动命中为 0，
成员全部来自当初按东财概念标签导入的显式 members 名单——标签是宽口径主题
（如「机器人概念」全市场 735 家），把组装厂/集成商/机床/安全软件全扫了进来。

剔除机制：直接精简 members（无需 excludes——本就没有自动命中）。
保留规则 = KEEP_SW3（申万三级骨架，主业主焦点）+ KEEP_CODES（白名单，分类错位
但确属产业链核心：如 IDC 主业公司在「通信应用增值服务」、减速器公司在「金属制品」）。
- ind.updated 同步刷新；meta.updated 刷新；写后回读断言；幂等可重跑
"""
import io
import json
import os
import sys
from datetime import datetime, timezone

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
INVEST = os.path.join(ROOT, 'data', 'invest-data.json')
STOCKS = os.path.join(ROOT, 'data', 'stocks.json')
TODAY = '2026-09-29'

# —— 保留规则：条目名 → (KEEP_SW3 骨架, KEEP_CODES 白名单) ——
RULES = {
    # 焦点：端侧 SoC/AI 芯片 + AI 终端整机与核心光学/模组；剔除果链组装、面板、LED、被动元件、芯片分销
    '端侧AI芯片(AI PC/手机/眼镜)': (
        {'电子/半导体/数字芯片设计', '电子/半导体/模拟芯片设计',
         '电子/消费电子/品牌消费电子', '电子/光学光电子/光学元件',
         '通信/通信设备/通信终端及配件'},
        {'688781',  # 视涯科技 Micro-OLED（AI 眼镜近眼显示）
         '002241', '001314', '603296', '603341'},  # 歌尔(AI眼镜代工龙头)/亿道(AI PC ODM)/华勤/龙旗(AI手机PC ODM)
    ),
    # 焦点：安防设备本体 + 机器视觉（镜头/3D视觉/工业相机/视觉算法）；剔除集成商/IT运维/安全软件/服务器
    'AI安防/机器视觉': (
        {'计算机/计算机设备/安防设备', '电子/光学光电子/光学元件',
         '机械设备/自动化设备/其他自动化设备'},
        {'688400',                       # 凌云光 机器视觉龙头
         '688610', '301360',             # 埃科光电(工业相机)/荣旗科技(视觉检测)
         '688088', '688207', '688327', '688343',  # 虹软/格灵深瞳/云从/云天励飞 视觉算法
         '002970', '603660'},            # 锐明技术(车载视觉)/苏州科达(安防视频)
    ),
    # 焦点：本体 + 执行器/传动 + 电机 + 工控 + 核心传感/视觉；剔除机床、通用机械、集成商
    '具身智能/机器人': (
        {'机械设备/自动化设备/机器人', '机械设备/自动化设备/工控设备',
         '电力设备/电机Ⅱ/电机Ⅲ'},
        {'002050', '300403',                       # 三花(执行器总成)/汉宇(谐波减速器)
         '002896', '300718', '603667', '603915',   # 中大(减速器)/长盛(轴承)/五洲新春(丝杠)/国茂(减速器)
         '002472', '300580', '601689', '603009', '300100',  # 双环/贝斯特/拓普/北特/双林(丝杠·执行器)
         '002527', '300853',                        # 新时达(运动控制)/申昊(巡检机器人)
         '688322', '688003', '688686',              # 奥比中光(3D视觉)/天准/奥普特(机器视觉)
         '300007', '301413', '603662', '300354', '688583',  # 汉威/安培龙/柯力/东华测试(传感)/思看(3D扫描)
         '002031', '300503', '688557'},             # 巨轮智能(RV减速器)/昊志机电(谐波)/兰剑智能(仓储机器人)
    ),
    # 焦点：IDC/AIDC 主业 + 数据中心供电（UPS/HVDC/温控/配电）+ 运营商；剔除输变电、通信施工、网络设备、集成商
    'IDC数据中心/供电': (
        {'电力设备/其他电源设备Ⅱ/其他电源设备Ⅲ'},
        {'300846', '688158', '300017',              # 首都在线(云)/优刻得(云)/网宿(CDN边缘)
         '600845', '603887', '000815', '300895', '002771', '301085',  # 宝信/城地香江/美利云/铜牛/真视通/亚康(IDC)
         '600602',                                   # 云赛智联(上海国资云+IDC)
         '300249', '002197',                         # 依米康(精密温控)/证通电子(自建IDC)
         '600050', '600941', '601728',               # 三大运营商(算力+IDC)
         '301291',                                   # 明阳电气(数据中心配电)
         '300065', '002015',                         # 海兰信(海底IDC)/协鑫能科(算力供能)
         '300383', '300442', '300738', '603881'},    # 光环新网/润泽/奥飞数据/数据港(IDC主业)
    ),
    # 焦点：算力租赁 + 云服务（IaaS/PaaS）；剔除安全软件、ERP、行业IT外包、服务器制造商
    '算力租赁/云服务': (
        set(),
        {'002229',                                   # 鸿博股份(英博数科,AI算力租赁首家)
         '300846', '688158', '688316', '688227', '688258',  # 首都在线/优刻得/青云/品高/卓易(云)
         '300017', '600845', '000815', '300895', '002771',  # 网宿/宝信/美利云/铜牛/真视通
         '000938', '600410',                          # 紫光股份(新华三+紫光云)/华胜天成(智算服务)
         '002261',                                    # 拓维信息(昇腾算力生态)
         '002197',                                    # 证通电子(智算中心)
         '300857', '603629',                          # 协创数据/利通电子(算力租赁)
         '600941', '601728',                          # 移动/电信(天翼云)
         '603220',                                    # 中贝通信(智算建设+租赁)
         '300383', '300738', '603881', '300442',      # 光环新网(AWS中国)/奥飞/数据港/润泽(AIDC)
         '000032'},                                   # 深桑达A(中国电子云)
    ),
}


def sw3key(s):
    return '%s/%s/%s' % (s.get('sw1') or '-', s.get('sw2') or '-', s.get('sw3') or '-')


def main():
    stocks = json.load(open(STOCKS, encoding='utf-8'))
    idx = {}
    for r in stocks.get('stocks') or []:
        c = str(r.get('code') or '')
        if len(c) >= 6:
            idx[c[-6:]] = r

    # 骨架合法性预检：KEEP_SW3 里写了 stocks.json 不存在的三级分类名 → 提醒（防笔误静默失效）
    known = {sw3key(r) for r in stocks.get('stocks') or []}
    for name, (sk, _) in RULES.items():
        for k in sk:
            if k not in known:
                print('⚠ 骨架笔误？%s 条目 KEEP_SW3 含不存在的分类：%s' % (name, k))

    d = json.load(open(INVEST, encoding='utf-8'))
    total_before, total_after = 0, 0
    for name, (sk, wl) in RULES.items():
        ind = next((i for i in (d.get('industries') or {}).get('list')
                    if i.get('name') == name), None)
        assert ind is not None, '找不到行业「%s」' % name
        ms = ind.get('members') or []
        kept, cut = [], []
        for m in ms:
            c = m[-6:] if len(m) >= 6 else m
            s = idx.get(c) or {}
            (kept if (sw3key(s) in sk or c in wl) else cut).append(c)
        ind['members'] = kept
        ind['updated'] = TODAY
        total_before += len(ms)
        total_after += len(kept)
        print('%s：%d → %d（剔除 %d）' % (name, len(ms), len(kept), len(cut)))

    d.setdefault('meta', {})['updated'] = (
        datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S') + '.000Z')
    with open(INVEST, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    print('meta.updated =', d['meta']['updated'])

    # 回读断言
    d2 = json.load(open(INVEST, encoding='utf-8'))
    ok = True
    for name, (sk, wl) in RULES.items():
        ind2 = next(i for i in (d2.get('industries') or {}).get('list')
                    if i.get('name') == name)
        kept2 = {m[-6:] for m in (ind2.get('members') or [])}
        if not (kept2 <= (sk | set()) or True):
            pass
        # 逐条核对：保留的都在骨架或白名单里
        for c in kept2:
            s = idx.get(c) or {}
            if sw3key(s) not in sk and c not in wl:
                print('✗ 回读异常：%s 保留了规则外公司 %s' % (name, c))
                ok = False
        print('回读 %s：%d 家，全部符合保留规则' % (name, len(kept2)))
    print('合计：%d → %d（剔除 %d 家噪声）' % (total_before, total_after, total_before - total_after))
    assert ok, '存在规则外保留项'
    print('剔除完成。')


if __name__ == '__main__':
    main()
