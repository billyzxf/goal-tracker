# -*- coding: utf-8 -*-
"""
人工智能（概念条目）· 概念噪声剔除（一次性脚本）
==================================================
污染成因：与「国产芯片」同类——sys='concept'、members=0，前端按东财「人工智能」
概念标签动态解析成员（722 家全市场命中）。该标签是超级大杂烩：从海螺水泥、
张家港行到顺丰控股都因「用 AI」被贴标签。

剔除机制：ind.excludes（屏蔽名单，前端 hitsOf 过滤自动命中）。
保留标准 = 主业是 AI 技术供给方（芯片/算法/算力/机器人/AI 软件硬件）：
- KEEP_SW3 骨架 9 类全保留：AI 芯片设计、AI 消费硬件、安防设备、AI 原生软件
  （横向通用软件：讯飞/金山办公/三六零/万兴…）、机器人/工控/机器视觉自动化
- KEEP_CODES 白名单：分类错位但确属 AI 核心链（算力服务器在 IT 服务、
  AI 金融应用在垂直软件、IDC/云在计算机设备等）
剔除：AI 仅作应用场景的行业（医疗/教育/传媒/电商/军工/建筑/电网/汽车/地产…，
各自已有专用条目或无关）。各细分链（AI安防/端侧芯片/机器人/IDC/算力租赁等）
已有专属条目，本伞形条目不与之冲突（公司可多池共存）。
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

IND_NAME = '人工智能'
CONCEPT = '人工智能'

KEEP_SW3 = {
    '电子/半导体/数字芯片设计',        # 寒武纪/海光/瑞芯微…AI 芯片
    '电子/半导体/模拟芯片设计',        # 圣邦/汇顶/艾为…端侧 AI 模拟
    '电子/光学光电子/光学元件',        # 奥比中光(3D视觉)/弘景光电(AI眼镜光学)
    '电子/消费电子/品牌消费电子',      # 视源股份/安克创新 AI 终端
    '计算机/计算机设备/安防设备',      # 海康/大华 AI 安防
    '计算机/软件开发/横向通用软件',    # 科大讯飞/金山办公/三六零/万兴/星环/致远/福昕
    '机械设备/自动化设备/机器人',      # 埃斯顿/埃夫特/宇树
    '机械设备/自动化设备/工控设备',    # 雷赛/天玛智控(工控+AI)
    '机械设备/自动化设备/其他自动化设备',  # 矩子/天准(机器视觉)
}

KEEP_CODES = {
    # —— IT服务桶里的 AI 原生算法/数据/算力 ——
    '300496',  # 中科创达 端侧 AI OS
    '688088', '688207', '688327', '688343',  # 虹软/格灵深瞳/云从/云天励飞 视觉算法
    '688787',  # 海天瑞声 AI 语料
    '688158', '688227',  # 优刻得/品高股份 云计算
    '688228',  # 开普云 AIGC 内容安全
    '688568',  # 中科星图 数字地球+AI
    '300017', '600845', '600410', '002229',  # 网宿(CDN边缘)/宝信(IDC+AIDC)/华胜天成(智算)/鸿博(算力租赁)
    '688039',  # 当虹科技 AIGC 视频
    # —— 垂直应用软件桶里的 AI 应用核心 ——
    '300033', '300803', '601519', '688318', '600570',  # 同花顺/指南针/大智慧/财富趋势/恒生电子(AI金融)
    '300229', '688615', '002362',  # 拓尔思(NLP大模型)/合合信息(识别)/汉王科技(OCR)
    '300253', '300451',  # 卫宁健康/创业慧康(AI医疗软件)
    '002410', '002405',  # 广联达(AI造价)/四维图新(智驾地图)
    '301269', '688083', '688507',  # 华大九天(EDA+AI)/中望(CAD)/索辰(CAE)
    '688692',  # 达梦数据(数据库)
    '300188',  # 国投智能(AI取证)
    '002261',  # 拓维信息(昇腾算力)
    # —— 其他计算机设备桶：算力服务器/视频/温控 ——
    '000977', '603019',  # 浪潮信息/中科曙光 AI 服务器
    '002197',            # 证通电子(智算中心)
    '002970', '603660',  # 锐明技术(车载视觉)/苏州科达(安防视频)
    '300249',            # 依米康(数据中心温控)
    '688208',            # 道通科技(ADAS+AI诊断)
    # —— 仪器仪表/专用设备里的机器视觉/传感 ——
    '603662', '301360',  # 柯力传感(力传感)/荣旗科技(视觉检测)
    '002031', '688400',  # 巨轮智能(RV减速器)/凌云光(机器视觉)
    # —— 消费电子零部件：AI 硬件制造/算力 ——
    '601138', '001314', '300793', '300857', '603629',  # 工业富联(AI服务器)/亿道(AI PC)/佳禾(AI耳机)/协创/利通(算力)
    # —— 通信设备里的算力网络 ——
    '000063', '002396',  # 中兴通讯/星网锐捷
    # —— 数字媒体里的大模型核心 ——
    '300418',  # 昆仑万维 天工大模型
}


def sw3key(r):
    return '%s/%s/%s' % (r.get('sw1') or '-', r.get('sw2') or '-', r.get('sw3') or '-')


def main():
    stocks = json.load(open(STOCKS, encoding='utf-8'))
    rows = stocks.get('stocks') or []
    known = {sw3key(r) for r in rows}
    for k in KEEP_SW3:
        assert k in known, '骨架笔误？stocks.json 无此分类：%s' % k

    tagged = [r for r in rows if CONCEPT in (r.get('concepts') or '')]
    keepers = {str(r.get('code') or '')[-6:] for r in tagged
               if sw3key(r) in KEEP_SW3 or str(r.get('code') or '')[-6:] in KEEP_CODES}
    excludes = sorted(str(r.get('code') or '')[-6:] for r in tagged
                      if str(r.get('code') or '')[-6:] not in keepers and r.get('code'))
    print('标签「%s」命中 %d 家：保留 %d，剔除 %d' % (CONCEPT, len(tagged), len(keepers), len(excludes)))

    d = json.load(open(INVEST, encoding='utf-8'))
    ind = next((i for i in (d.get('industries') or {}).get('list')
                if i.get('name') == IND_NAME), None)
    assert ind is not None, '找不到行业「%s」' % IND_NAME
    ind['excludes'] = excludes

    d.setdefault('meta', {})['updated'] = (
        datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S') + '.000Z')
    with open(INVEST, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    print('meta.updated =', d['meta']['updated'])

    # 回读断言
    d2 = json.load(open(INVEST, encoding='utf-8'))
    ind2 = next(i for i in (d2.get('industries') or {}).get('list')
                if i.get('name') == IND_NAME)
    ex2 = set(ind2.get('excludes') or [])
    assert len(ex2) == len(excludes), '回读 excludes 数 %d != %d' % (len(ex2), len(excludes))
    overlap = ex2 & keepers
    assert not overlap, '保留名单泄漏进 excludes：%s' % sorted(overlap)[:5]
    print('回读确认：excludes %d/%d 落盘，保留名单零泄漏' % (len(ex2), len(excludes)))
    print('剔除完成。前端命中 = 池内 ∩ (标签命中 − excludes)。')


if __name__ == '__main__':
    main()
