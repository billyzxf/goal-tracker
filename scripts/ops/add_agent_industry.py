# -*- coding: utf-8 -*-
"""
新增行业条目：AI应用/Agent
- 显式成员（sys='sw1'），26 家 = A 核心 16 + B 白名单 10（档位写在生态位说明前缀）
- 生态位说明写入 industries.companyNotes（占位符可覆盖、真说明绝不覆盖，沿用 seed_aiapp_notes 逻辑）
- 定年纪/体检/竞争字段预填建议值，rate 等决定权留给用户
- 写回前备份；meta.updated 刷 UTC ISO；逐条回读断言
"""
import json, os, sys, time, random, string, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
PATH = os.path.join(ROOT, 'data', 'invest-data.json')
STOCKS = os.path.join(ROOT, 'data', 'stocks.json')
NAME = 'AI应用/Agent'
TODAY = '2026-09-30'

# code, name, tier, 生态位说明
COMPANIES = [
    # ---- A · 核心（Agent 已落地、有量化数据披露）----
    ('688111', '金山办公', 'A', '【A·核心】办公Agent龙头：WPS灵犀智能体，个人年度付费用户4825万，WPS365收入4.97亿(H1 2026)+60.8%；订阅制为主，卡国民级入口'),
    ('002230', '科大讯飞', 'A', '【A·核心】星火大模型+教育/医疗/政企Agent矩阵，AI应用服务商培育政策直接受益者；政企场景know-how最深'),
    ('600588', '用友网络', 'A', '【A·核心】企业级Agent平台：BIP6内置65个垂直智能体，AI相关收入4.64亿/签约9.06亿(H1 2026)，签约>收入验证订单先行'),
    ('600570', '恒生电子', 'A', '【A·核心】金融垂类Agent：自研LightGPT金融大模型已备案，卡证券资管交易场景，金融数据壁垒高'),
    ('300033', '同花顺', 'A', '【A·核心】C端金融Agent：HithinkGPT升级问财助手+iFinD多智能体投研平台，C端付费意愿强、流量入口'),
    ('300170', '汉得信息', 'A', '【A·核心】企业级Agent先行者：AI智能化收入2.2亿(H1 2026)同比+100%+（Q1 0.81亿→Q2 1.4亿加速），得·灵体系+DataClaw数字员工，8000+中大型客户'),
    ('688258', '卓易信息', 'A', '【A·核心】AI IDE/智能体：EazyDevelop平台+FinBot智能体，AI开发工具收入占比>50%(H1 2026)，信创固件基本盘；项目制收费是主要扣分项'),
    ('300785', '值得买', 'A', '【A·核心】消费Agent：运营服务费(CPS按效果分成)3.77亿+136.6%，AI相关收入6852万占11%，海纳MCP Server输出量+474%；整体毛利率43.6%待修复'),
    ('603918', '金桥信息', 'A', '【A·核心】AI司法催收按回款结果收费——A股最纯正「按结果收费」标的；市值38.7亿最小弹性最大，但毛利率仅24%+仍亏损，左尾风险高'),
    ('601360', '三六零', 'A', '【A·核心】安全Agent：纳米AI搜索+AI安全大模型，网信办AI风控强推背景下安全类AI订单上半年+200%'),
    ('300418', '昆仑万维', 'A', '【A·核心】AI应用矩阵：天工大模型/Mureka音乐/短剧/社交Agent出海，收入53.6亿+43.5%净利10.9亿；市值偏大、Agent收入未单列'),
    ('603039', '泛微网络', 'A', '【A·核心】组织流程Agent：Agentic架构数智大脑Xiaoe.AI打通企业流程，协同办公市占率头部，毛利率90%+'),
    ('300229', '拓尔思', 'A', '【A·核心】NLP老牌+垂类大模型：媒体/金融/政务Agent，数据资产稀缺；近年收入承压，看Agent订单兑现'),
    ('688615', '合合信息', 'A', '【A·核心】智能文档Agent：扫描全能王+TextIn，C端订阅+B端文档智能，毛利率84%+，商业化最扎实的AI工具股之一'),
    ('300624', '万兴科技', 'A', '【A·核心】创作Agent出海：视频创意软件+AI素材生成，订阅制卡海外C端；竞争加剧致收入波动'),
    ('002115', '三维通信', 'A', '【A·核心】AIGC营销Agent：短剧/短视频生成平台+智能投放，净利预增1428%~2001%(低基数)；代投属性毛利率仅~12%，弹性大质量弱'),
    # ---- B · 白名单（有Agent叙事、待数据验证）----
    ('300766', '每日互动', 'B', '【B·白名单】数据智能+Agent：每日治数平台+SDK流量底盘，看Agent化收入单列'),
    ('300634', '彩讯股份', 'B', '【B·白名单】运营商邮箱AI化+智能体，RichMail+Agent运营；看收入单列'),
    ('688095', '福昕软件', 'B', '【B·白名单】PDF AI Agent出海，订阅制毛利率90%+；AI收入占比尚小'),
    ('688369', '致远互联', 'B', '【B·白名单】COP协同+Agent小市值标的，看AI订单'),
    ('688327', '云从科技', 'B', '【B·白名单】人机协同操作系统转Agent，从医院/政务场景切入；持续亏损'),
    ('300058', '蓝色光标', 'B', '【B·白名单】AI营销Agent：蓝标GPT+AI驱动广告投放，收入体量大但代投毛利率个位数，看AI收入结构'),
    ('301171', '易点天下', 'B', '【B·白名单】出海营销Agent：CyberKlick+AI素材生成，按效果计费基因；毛利率~25%'),
    ('600556', '天下秀', 'B', '【B·白名单】KOL营销数据+AIAgent匹配（红人经济），看Agent收入兑现'),
    ('300002', '神州泰岳', 'B', '【B·白名单】AI/ICT运营+游戏双轮：NLP起家，智能客服/运维Agent；游戏现金流托底'),
    ('300496', '中科创达', 'B', '【B·白名单】端侧Agent：魔方Rubik大模型+OS底层，与端侧AI行业双归属'),
]

# 占位符判定素材：stocks.json 全部行业字符串
s = json.load(open(STOCKS, encoding='utf-8'))
def iter_strings(o):
    if isinstance(o, str): yield o
    elif isinstance(o, list):
        for x in o: yield from iter_strings(x)
    elif isinstance(o, dict):
        for x in o.values(): yield from iter_strings(x)
ph = set(iter_strings(s))

# 校验 stocks.json 中代码-名称一致
rows = s.get('rows') or s.get('stocks') or []
assert rows, f'stocks.json 结构异常: keys={list(s.keys())}'
idx = {}
for r in rows:
    c = str(r.get('code') or r.get('c') or '')
    if len(c) == 6: idx[c] = r.get('name') or r.get('n') or ''
def norm(n):
    for p in ('XD', 'XR', 'ST', '*ST'):
        if n.startswith(p): n = n[len(p):]
    for sfx in ('-UW', '-U', '-W', '-N', '-CDR'):
        if n.endswith(sfx): n = n[:-len(sfx)]
    return n
def ok(a, b):
    a, b = norm(a), norm(b)
    return a == b or a in b or b in a
mismatch = [(c, n, idx.get(c, '<不存在>')) for c, n, _, _ in COMPANIES if not ok(idx.get(c, ''), n)]
if mismatch:
    print('!! 名称不匹配/不存在：'); [print('  ', m) for m in mismatch]
    sys.exit(1)

d = json.load(open(PATH, encoding='utf-8'))
lst = d['industries']['list']
# 幂等：已存在则移除重建
lst[:] = [x for x in lst if x['name'] != NAME]

# 备份
bak = PATH.replace('.json', f'.backup-{time.strftime("%Y%m%d")}-agent.json')
shutil.copyfile(PATH, bak)

def nid(): return ''.join(random.choices(string.ascii_lowercase + string.digits, k=13))

entry = {
    'id': nid(), 'name': NAME, 'level': 1, 'sys': 'sw1',
    'chain': '下游·软件应用',
    'lifecycle': '', 'policy': '',
    'prosperity': None, 'prosperityNote': '',
    'thesis': 'Agent即服务(AaaS)：AI从卖工具转向卖结果，按效果收费重构软件商业模式。IDC：中国企业级AI智能体市场 212亿(2025)→449亿(2026E)→3320亿(2029E)，CAGR≈99%；纯A股Agent标的稀缺，龙头明略科技在港股。',
    'drivers': [
        '企业Agent采纳率 17.3%(2024末)→40.3%(2026中，沙丘智库)，渗透刚过1/3',
        '按结果收费(AaaS)商业模式验证：明略智能体收入+605.7%、汉得AI+100%、百融AICC新场景+195%',
        '模型同质化+Token成本下降，行业Know-how/工作流/数据沉淀成为新护城河（杰富瑞：中国Agent工程不落后）',
    ],
    'invalidConds': [],
    'tracked': False, 'updated': TODAY,
    'age': {'metric': '企业Agent采纳率', 'rate': None, 'rateYear': '', 'prevRate': None, 'prevYear': '',
            'target': None, 'targetYear': '',
            'note': '建议值：40.3%(2026中，沙丘智库)。按「15-40%=加速段」标尺，渗透率正处加速段上沿；决定权留给复核',
            'tracks': []},
    'health': {'tam': [
        {'year': '2025', 'size': 212, 'hot': False, 'driver': 'IDC：中国企业级AI智能体市场约212亿元'},
        {'year': '2026', 'size': 449, 'hot': True, 'driver': 'IDC预测449亿元(+112%)，央国企预算+按效果付费落地驱动'},
        {'year': '2029', 'size': 3320, 'hot': False, 'driver': 'IDC预测突破3320亿元，2025→2029 CAGR≈99%（注意：远期预测方差极大）'},
    ], 'qtySelf': None, 'valSelf': None, 'selfNote': '「自给率」对软件业可改读为「国产Agent对海外SaaS的替代率」，口径待定', 'smile': '', 'smileMargin': None, 'smileNote': ''},
    'compete': {'peers': ['金山办公', '科大讯飞', '用友网络', '明略科技(HK)', '百融智能(HK)'],
                'vertical': '模型厂自上而下(字节/阿里/智谱) vs 行业Know-how自下而上(垂直Agent)；平台卡入口、垂类卡结果',
                'moats': ['行业Know-how+工作流/数据权限壁垒', '按效果收费的效果数据闭环反哺模型', '客户习惯/记忆/组织流程沉淀（席位制→结果制的迁移成本）'],
                'verdict': '三层分化：平台型(金山/讯飞/用友)卡流量入口、垂类Agent(明略/百融/金桥/汉得)按结果收费、营销代投型(三维/蓝标)毛利低弹性大。格局未定，梯队以「AI收入增速+毛利率」双指标季度跟踪'},
    'notes': {}, 'members': [c for c, _, _, _ in COMPANIES],
}

# 插入到大模型/AI应用软件 之后
pos = next(i for i, x in enumerate(lst) if x['name'] == '大模型/AI应用软件')
lst.insert(pos + 1, entry)

# 生态位说明：只填空、占位符可覆盖、真说明绝不覆盖
notes = d['industries'].setdefault('companyNotes', {})
written, kept = 0, 0
for c, n, tier, txt in COMPANIES:
    old = notes.get(c, '')
    if old and old not in ph:
        kept += 1; continue
    notes[c] = txt; written += 1
d['industries']['meta'] = {'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'agent_industry_seed': True}
d['meta']['updated'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

json.dump(d, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False)

# ---- 回读断言 ----
d2 = json.load(open(PATH, encoding='utf-8'))
e2 = [x for x in d2['industries']['list'] if x['name'] == NAME]
assert len(e2) == 1 and e2[0]['members'] == [c for c, _, _, _ in COMPANIES], '条目创建异常'
json.dump(d2, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False)
d3 = json.load(open(PATH, encoding='utf-8'))
e3 = [x for x in d3['industries']['list'] if x['name'] == NAME][0]
assert e3['members'] == [c for c, _, _, _ in COMPANIES], 'members 落盘异常'
n3 = d3['industries']['companyNotes']
ok = sum(1 for c, _, _, txt in COMPANIES if n3.get(c) == txt)
print(f'OK: 备份={os.path.basename(bak)} | 成员 {len(e3["members"])} 家 | 生态位说明 写入{written} 保留原有{kept} 回读一致{ok}/26 | meta.updated={d3["meta"]["updated"]}')
