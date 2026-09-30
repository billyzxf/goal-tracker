# -*- coding: utf-8 -*-
"""
「消费电子组装(终端制造)」条目成员精简
====================================
条目 sys='sw1' 但名字不匹配任何申万分类 → 自动命中 0，成员全部来自显式 members
（当初按申万「消费电子零部件及组装」全量导入 80 家 + 品牌 10 家）。

条目焦点 = 组装/终端制造环节，保留规则：
  A. 整机/终端 ODM·EMS 代工（智能控制器、声学/耳机整机、充电器 ODM 一并归入）
  B. 头部结构件/精密件（组装直接配套）
剔除：
  - 品牌消费电子 10 家（品牌运营，非组装制造；如需跟踪可另建条目）
  - 纯元器件（连接器/天线/声学元件/线缆/马达/散热材料/屏蔽件/弹簧）
  - 功能性器件/模切小件
  - 混业/设备/ST
直接重写 members；回读断言；刷新 ind.updated 与 meta.updated。幂等可重跑。
"""
import json
import os
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
PATH = os.path.join(ROOT, 'data', 'invest-data.json')
NAME = '消费电子组装(终端制造)'

KEEP = {
    # —— A. 整机/终端 ODM·EMS 代工 ——
    '601138': '工业富联：全球最大 EMS，AI 服务器/高端智能手机代工',
    '002475': '立讯精密：EMS 龙头，果链整机/连接模组代工',
    '601231': '环旭电子：SiP 模组 + EMS（穿戴/汽车电子）',
    '603296': '华勤技术：ODM 三巨头，手机/笔电/服务器 ODM',
    '603341': '龙旗科技：ODM 三巨头，手机/平板 ODM',
    '002241': '歌尔股份：声学整机 + VR/AR 整机代工',
    '300735': '光弘科技：EMS 代工（手机/汽车电子）',
    '002369': '卓翼科技：EMS（网络设备/手机代工）',
    '000021': '深科技：EMS（存储封测/计量仪表/手机代工）',
    '300857': '协创数据：IoT/服务器 ODM（算力租赁第二曲线）',
    '001314': '亿道信息：平板/笔记本 ODM',
    '600203': '福日电子：手机 EMS/ODM（国企）',
    '600130': '波导股份：手机主板贴片/EMS',
    '603380': '易德龙：EMS（工控/医疗/汽车电子）',
    '301491': '汉桑科技：音频功放/音响 ODM',
    '300822': '贝仕达克：智能控制器 ODM',
    '300916': '朗特智能：智能控制器 ODM',
    '002139': '拓邦股份：智能控制器龙头（家电/工具/锂电）',
    '002925': '盈趣科技：智能控制部件 ODM（IQOS 核心供应商）',
    '002866': '传艺科技：键盘/笔电 ODM',
    '300793': '佳禾智能：TWS 耳机整机 ODM',
    '301383': '天键股份：耳机整机 ODM',
    '002981': '朝阳科技：耳机整机 ODM/组装',
    '002993': '奥海科技：充电器/电源适配器 ODM 龙头',
    '002681': '奋达科技：声学整机（音箱/耳机/穿戴）ODM',
    # —— B. 头部结构件/精密件 ——
    '300433': '蓝思科技：玻璃盖板龙头 + 整机组装（自建组装产能）',
    '002600': '领益智造：精密功能件/结构件 + 组装',
    '300115': '长盈精密：金属结构件/精密件（手机笔电）',
    '002635': '安洁科技：苹果链功能件/模切大厂',
    '603626': '科森科技：精密金属结构件',
    '603890': '春秋电子：笔电精密结构件龙头',
    '002855': '捷荣技术：手机精密模具/结构件（华为链）',
    '300709': '精研科技：MIM 精密件（折叠屏铰链核心）',
    '688210': '统联精密：MIM 精密件',
}


def main():
    d = json.load(open(PATH, encoding='utf-8'))
    ind = next((i for i in (d.get('industries') or {}).get('list')
                if i.get('name') == NAME), None)
    if ind is None:
        print('!! 未找到条目:', NAME)
        return 1
    old = ind.get('members') or []
    removed = [c for c in old if c not in KEEP]
    kept = [c for c in old if c in KEEP]
    missing = [c for c in KEEP if c not in old]
    if missing:
        print('!! 白名单中不在原成员里的代码:', missing)
        return 1
    ind['members'] = kept
    ind['updated'] = datetime.now().strftime('%Y-%m-%d')
    d.setdefault('meta', {})['updated'] = (datetime.now(timezone.utc)
                                           .strftime('%Y-%m-%dT%H:%M:%S') + '.000Z')
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)

    # 回读断言
    d2 = json.load(open(PATH, encoding='utf-8'))
    ind2 = next(i for i in (d2.get('industries') or {}).get('list')
                if i.get('name') == NAME)
    got = ind2.get('members') or []
    assert len(got) == len(KEEP) and all(c in KEEP for c in got), '回读不完整'
    assert not any(c in got for c in removed), '剔除项泄漏'
    print(f'成员 {len(old)} → {len(got)}（剔除 {len(removed)} 家），回读断言通过')
    print('meta.updated =', d2['meta']['updated'])
    print('\n剔除分类统计：')
    cats = {
        '品牌消费电子': ['002045', '002351', '002841', '002888', '300866', '301189',
                        '301606', '688007', '688036', '688775'],
        '纯元器件（连接器/天线/声学件/线缆/马达/散热/屏蔽）': [
            '300679', '300136', '300322', '002655', '002861', '300843', '301329',
            '603633', '301285', '301486', '300032', '300602', '300647', '301626',
            '301086', '301389', '605277', '600363'],
        '功能性器件/模切小件': ['002947', '603052', '300951', '300976', '301180',
                               '301326', '688678', '688260', '301123', '300784',
                               '300868', '301387', '300686', '300256', '300128'],
        '非主业/设备/ST/混业': ['002055', '603595', '002660', '300812', '002426',
                                '301051', '300956', '300968', '603327', '301067',
                                '300787', '603629'],
    }
    counted = [c for v in cats.values() for c in v]
    extra = [c for c in removed if c not in counted]
    for k, v in cats.items():
        n = sum(1 for c in v if c in removed)
        print(f'  {k}: {n}')
    if extra:
        print('  其他:', len(extra), extra)
    assert sum(len([c for c in v if c in removed]) for v in cats.values()) + len(extra) == len(removed)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
