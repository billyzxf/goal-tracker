# -*- coding: utf-8 -*-
"""
大模型/AI应用软件 · 生态位说明预填（一次性脚本）
- 只写 companyNotes 空缺项，绝不覆盖
- 按 6 位代码直写（规避 XD/*ST 名称别名）
- 刷新 meta.updated（同步盘比对依据）
"""
import io
import json
import os
import sys
from datetime import datetime, timezone

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
PATH = os.path.join(ROOT, 'data', 'invest-data.json')

# 代码 → 生态位一句话（34 家真命中，代码来自 stocks.json L0 实名核对）
NOTES = {
    # —— 核心层：大模型与 AI 原生应用 ——
    '002230': '国产认知大模型第一梯队（星火），AI 教育/办公/医疗全场景落地，收入含 AI 成色最高',
    '688111': 'WPS AI 办公软件 AI 化标杆，信创办公龙头，订阅模式受益 AI 变现',
    '601360': '360 智脑大模型 + AI 搜索/安全大模型，流量入口型 AI 应用',
    '300418': '天工大模型 + 海外 AI 应用矩阵（音乐/短剧/Agent），A 股最激进 AI 出海',
    '300624': 'AI 视频创意软件出海龙头（Filmora/万兴播爆），AIGC 工具订阅制',
    '300229': 'NLP 老牌，拓天大模型（媒体/金融/政务），自建数据中心+语料资产',
    '688327': 'AI 四小龙之一，人机协同操作系统 + 行业大模型（治理/金融/出行）',
    '688088': '视觉 AI 算法授权龙头（智能手机/智驾），按设备计费轻资产模式',
    '688615': '扫描全能王/名片全能王，智能文字识别 C 端订阅现金牛 + 商业大数据',
    '688787': 'AI 训练数据（语料）专业服务商，大模型数据要素稀缺标的',
    # —— 行业应用层：行业软件 × AI 真实产品化 ——
    '300033': '金融信息软件龙头，问财 HithinkGPT 金融大模型，C 端流量+AI 变现',
    '688318': '通达信（券商网上行情交易系统市占率第一），AI 研发提效，高分红现金牛',
    '300803': '金融信息服务（麦高证券协同），AI 量化工具面向个人投资者',
    '601519': '金融信息服务老牌，AI 化追赶者（营收体量小于同花顺/指南针）',
    '600570': '金融 IT 绝对龙头，LightGPT 金融大模型，券商/基金/资管全客户覆盖',
    '600588': '企业级 ERP 龙头，YonGPT 企业服务大模型，AI+大型央国企客户',
    '300253': '医疗 IT 龙头，WiNGPT 医疗大模型 + HinDoc AI 助手',
    '300451': '医疗卫生信息化（公卫/医保），AI 辅诊与医疗数据要素',
    '688246': '电子病历细分龙头，AI 病历质控/临床辅助',
    '603171': '财税 SaaS（亿企赢），AI 财税助手，G 端金税 + B 端小微企业双轮',
    '002410': '数字建筑 SaaS 龙头，AI 造价/设计工具，建筑行业下行期承压',
    '603039': '协同 OA 龙头（e-cology），AI 办公助手 + 低代码平台',
    '688369': '协同 OA 第二梯队（V5），AI+低代码政企协同',
    '688095': 'PDF 全球第二（订阅制出海为主），AIGC 文档智能工具',
    '688228': '政务网站内容平台龙头，AIGC 内容安全检测 + 政务大模型',
    '688232': '智慧政务软件龙头（招投标/一网通办），AI 政务应用',
    '688031': '大数据基础软件（TDH），分布式大模型 InfLLM + 无涯金融大模型',
    '300496': '端侧智能 OS 龙头（智能汽车/机器人），魔方大模型，高通系端侧 AI 落地',
    '688207': '计算机视觉 AI 应用（银行安防/体育教育），少数量产盈利的 AI 算法公司',
    '300188': '电子取证龙头（美亚柏科），天擎公共安全大模型，公安大数据',
    '002362': '智能识别老牌（OCR/手写/NLP），汉王天地大模型 + 电纸书硬件',
    '300785': '消费内容社区（什么值得买），AIGC 内容生产 + 商品数据库语料价值',
    '300766': '数据智能（个推 SDK），用户画像+数据要素，大模型语料/Agent 数据服务',
    '688039': '视频编解码软件（广电/互联网），AIGC 视频内容生产工具',
}


def main():
    root = os.path.dirname(PATH)
    stocks = json.load(open(os.path.join(root, 'stocks.json'), encoding='utf-8'))
    # 占位符集合：stocks.json 里所有行业分类字符串（sw1/sw2/sw3/em）——这些是批量填充的分类名，非生态位说明
    ph = set()
    for r in stocks.get('stocks') or []:
        for k in ('sw1', 'sw2', 'sw3', 'em'):
            v = r.get(k)
            if v:
                ph.add(v)
    d = json.load(open(PATH, encoding='utf-8'))
    inds = (d.get('industries') or {}).get('list') or []
    ind = next((i for i in inds if i.get('name') == '大模型/AI应用软件'), None)
    members = {m[-6:] for m in (ind.get('members') or [])}
    notes = d['industries'].setdefault('companyNotes', {})
    added, overwritten, kept, not_member = [], [], [], []
    for c, txt in NOTES.items():
        if c not in members:
            not_member.append(c)
            continue
        cur = notes.get(c)
        if cur and cur not in ph:  # 已有真说明，绝不覆盖
            kept.append(c)
            continue
        notes[c] = txt
        (overwritten if cur else added).append(c)
    d.setdefault('meta', {})['updated'] = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S') + '.000Z'
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    print(f'生态位说明：新增 {len(added)} 条，覆盖占位符 {len(overwritten)} 条，'
          f'已有真说明跳过 {len(kept)} 条，非本行业成员 {not_member if not_member else 0}')
    print('meta.updated =', d['meta']['updated'])
    # 回读校验
    d2 = json.load(open(PATH, encoding='utf-8'))
    n2 = d2['industries'].get('companyNotes') or {}
    ok = sum(1 for c in NOTES if c in (added + overwritten + kept) and n2.get(c))
    print(f'回读确认：{ok}/{len(added) + len(overwritten) + len(kept)} 条就绪')
    assert ok == len(added) + len(overwritten) + len(kept), '落盘不完整！'


if __name__ == '__main__':
    main()
