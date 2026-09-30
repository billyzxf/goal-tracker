# -*- coding: utf-8 -*-
"""
新增行业条目：固态电池
- 显式成员（sys='sw1'），28 家 = A 核心 14 + B 白名单 14（档位写在生态位说明前缀）
- lifecycle 按用户定位：导入期末/加速段前夜（半固态先行）
- 装车验证事件写入 drivers；age.metric 建议半固态装车渗透率，rate 留给用户
- 幂等；备份；meta.updated UTC ISO；回读断言
"""
import json, os, sys, time, random, string, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
PATH = os.path.join(ROOT, 'data', 'invest-data.json')
STOCKS = os.path.join(ROOT, 'data', 'stocks.json')
NAME = '固态电池'
TODAY = '2026-09-30'

COMPANIES = [
    # ---- A · 核心 ----
    ('002594', '比亚迪', 'A', '【A·核心】全固态车规认证已通过，2027小批量/2028大批量；电池+整车双归属，垂直一体化自供'),
    ('300750', '宁德时代', 'A', '【A·核心】凝聚态半固态2026H2量产，硫化物全固态2027小批量、2030前规模化；硫化物路线全球领跑者之一'),
    ('002074', '国轩高科', 'A', '【A·核心】金石全固态400Wh/kg，2GWh量产线建设中；硫化锂年产能2027目标2万吨——硫化物原料最直接标的'),
    ('688567', '孚能科技', 'A', '【A·核心】半固态最早规模化装车（软包+叠片路线），动力/低空两用；软包半固态供应赛力斯等'),
    ('002460', '赣锋锂业', 'A', '【A·核心】赣锋锂电二代固态含金属锂负极，上游锂资源+电池垂直一体；金属锂是全固态负极终极受益'),
    ('300073', '当升科技', 'A', '【A·核心】固态正极+固态电解质双线送样，海外客户全固态定点供应'),
    ('688005', '容百科技', 'A', '【A·核心】高镍正极龙头，固态专用高镍/富锂锰基正极已批量出货给头部全固态客户'),
    ('688778', '厦钨新能', 'A', '【A·核心】硫化物/氧化物电解质双路线中试，固态电解质吨级出货'),
    ('002709', '天赐材料', 'A', '【A·核心】电解液龙头转硫化物电解质；悖论标的——全固态终局电解液归零，转型成败决定第二曲线'),
    ('603200', '上海洗霸', 'A', '【A·核心】氧化物(LLZO等)固态电解质粉体吨级产线，中科院系技术合作，纯正电解质小市值弹性标的'),
    ('603663', '三祥新材', 'A', '【A·核心】锆基材料(LLZO前驱体氯氧化锆)——氧化物电解质上游资源卡位，硫化锂布局同步'),
    ('300450', '先导智能', 'A', '【A·核心】全固态整线设备龙头（干法电极/等静压/叠片），卖铲人逻辑——技术路线之争中确定性最高'),
    ('600104', '上汽集团', 'A', '【A·核心】清陶半固态已量产搭载（智己/MG4半固态9.98万起），2027全固态车型；A股最直接装车验证标的'),
    ('601238', '广汽集团', 'A', '【A·核心】400Wh/kg准固态2026内装车（昊铂首发），2026装车验证事件主角之一'),
    # ---- B · 白名单 ----
    ('300014', '亿纬锂能', 'B', '【B·白名单】全固态「龙泉二号」60Ah电芯下线，2026建成10Ah级产线；储能+动力双轮'),
    ('300207', '欣旺达', 'B', '【B·白名单】聚合物全固态中试，消费+动力双场景；进度偏后'),
    ('300438', '鹏辉能源', 'B', '【B·白名单】第一代固态电池发布（氧化物复合），储能场景切入'),
    ('300037', '新宙邦', 'B', '【B·白名单】电解液+氟化工，硫化物电解质/CeLT中试；与天赐同样的转型悖论'),
    ('603659', '璞泰来', 'B', '【B·白名单】负极+硅碳负极/涂覆膜，固态负极与半固态涂布膜双受益'),
    ('002812', '恩捷股份', 'B', '【B·白名单】半固态涂布膜已出货（卫蓝供应），全固态终局隔膜归零——与电解液同属转型悖论'),
    ('300568', '星源材质', 'B', '【B·白名单】同恩捷逻辑：半固态涂布膜缓冲，全固态终局风险'),
    ('002167', '东方锆业', 'B', '【B·白名单】锆资源（氧化物电解质上游），弹性大于确定性'),
    ('688499', '利元亨', 'B', '【B·白名单】全固态整线设备第二梯队，叠片/化成分容设备'),
    ('688559', '海目星', 'B', '【B·白名单】激光+干法电极设备，全固态工艺增量环节'),
    ('688518', '联赢激光', 'B', '【B·白名单】焊接设备，全固态封装工艺增量'),
    ('301325', '曼恩斯特', 'B', '【B·白名单】高精密涂布——半固态电解质涂布直接受益，小市值弹性'),
    ('688392', '骄成超声', 'B', '【B·白名单】超声焊接（极耳/复合集流体），全固态工艺适配'),
    ('002085', '万丰奥威', 'B', '【B·白名单】eVTOL映射（钻石飞机+万丰钻石eVTOL），低空放量场景的整车侧代表'),
]

def norm(n):
    for p in ('XD', 'XR', 'ST', '*ST'):
        if n.startswith(p): n = n[len(p):]
    for sfx in ('-UW', '-U', '-W', '-N', '-CDR'):
        if n.endswith(sfx): n = n[:-len(sfx)]
    return n

s = json.load(open(STOCKS, encoding='utf-8'))
rows = s.get('rows') or s.get('stocks') or []
idx = {}
for r in rows:
    c = str(r.get('code') or r.get('c') or '')
    if len(c) == 6: idx[c] = r.get('name') or r.get('n') or ''
def ok(a, b):
    a, b = norm(a), norm(b)
    return a == b or a in b or b in a
mismatch = [(c, n, idx.get(c, '<不存在>')) for c, n, _, _ in COMPANIES if not ok(idx.get(c, ''), n)]
if mismatch:
    print('!! 名称不匹配/不存在：'); [print('  ', m) for m in mismatch]
    sys.exit(1)

d = json.load(open(PATH, encoding='utf-8'))
lst = d['industries']['list']
lst[:] = [x for x in lst if x['name'] != NAME]  # 幂等

bak = PATH.replace('.json', f'.backup-{time.strftime("%Y%m%d")}-ssb.json')
shutil.copyfile(PATH, bak)

entry = {
    'id': ''.join(random.choices(string.ascii_lowercase + string.digits, k=13)),
    'name': NAME, 'level': 1, 'sys': 'sw1',
    'chain': '中游·电池产业链',
    'lifecycle': '导入期末/加速段前夜（半固态先行）',
    'policy': '工信部等八部门：2027年前打造3-5家全球龙头；全固态标准体系顶层设计；新型储能列入六大新兴支柱',
    'prosperity': None,
    'prosperityNote': '半固态装车量：2025年31.7GWh(+272%)→2026E 82GWh（中汽协口径）→2030E 420GWh',
    'thesis': '半固态已规模化交付（2025装车31.7GWh +272%），全固态2027小批量节点临近；国标2026.7实施（失重率≤0.5%）终结概念混乱；eVTOL/低空是400Wh/kg+的最高溢价放量场景。终局是创造性破坏：电解液/隔膜归零，设备与硫化锂是纯增量。',
    'drivers': [
        '奇瑞「犀牛S」全固态600Wh/kg/续航1500km：2026Q4定向运营装车（网约车/公务车队），2027批量上市',
        '东风350Wh/kg半固态2026.9量产上车（奕派eπ007）；广汽400Wh/kg准固态2026内装车（昊铂）；比亚迪车规认证通过2027小批量',
        '丰田硫化物全固态2026初期量产（雷克萨斯优先）2027-28全面商业化；国轩金石2GWh量产线建设中、硫化锂2027目标2万吨',
        'eVTOL/低空经济：400Wh/kg+是电动垂直起降硬门槛，半固态/固态最早的高溢价放量场景',
    ],
    'invalidConds': [],
    'tracked': False, 'updated': TODAY,
    'age': {'metric': '半固态装车渗透率（占动力电池GWh）', 'rate': None, 'rateYear': '',
            'prevRate': None, 'prevYear': '', 'target': None, 'targetYear': '',
            'note': '测算：31.7/约550≈5.8%(2025)→82/约700≈12%(2026E，中汽协口径)。按「15-40%=加速段」标尺，2027年前后穿越15%线进入加速段，与「导入期末/加速段前夜」定位自洽',
            'tracks': []},
    'health': {'tam': [
        {'year': '2025', 'size': 190, 'hot': False, 'driver': '半固态31.7GWh装车，按约0.6元/Wh测算约190亿元（自估口径，待复核）'},
        {'year': '2026', 'size': 450, 'hot': True, 'driver': '中汽协预计半固态装车82GWh，按约0.55元/Wh测算约450亿元；全固态尚在2GWh级中试'},
        {'year': '2030', 'size': 2300, 'hot': False, 'driver': '中汽协：半固态2030突破420GWh（占全球动力26%），按约0.55元/Wh测算约2300亿元；全固态另计'},
    ], 'qtySelf': None, 'valSelf': None, 'selfNote': '「自给率」建议读作：全固态材料/设备的国产化率（当前硫化物电解质/干法设备国产化领先，海外丰田自闭环）', 'smile': '', 'smileMargin': None, 'smileNote': ''},
    'compete': {'peers': ['宁德时代', '比亚迪', '国轩高科', '丰田(未上市映射)', '清陶/卫蓝(未上市)'],
                'vertical': '三条电解质路线并行：硫化物（宁德/国轩/丰田，能量密度上限高但怕水氧）vs 氧化物（清陶/卫蓝半固态，工艺成熟）vs 聚合物（成本 lows、室温电导差）',
                'moats': ['材料体系专利+工艺良率（干法电极/等静压know-how）', '车规认证周期3-5年=先发者时间壁垒', '上游资源卡位（锆/锂/硫化锂）'],
                'verdict': '两层悖论：①半固态放量利好液态链存量玩家（隔膜涂布/电解液缓冲），但全固态终局反而消灭它们——材料股赚的是时间差；②设备（先导/利元亨）与硫化锂（三祥/国轩自供）是路线中立的纯增量，确定性最高。整车装车验证事件（奇瑞Q4/东风已量产/丰田2026）是板块beta开关'},
    'notes': {}, 'members': [c for c, _, _, _ in COMPANIES],
}

pos = next(i for i, x in enumerate(lst) if x['name'] == 'AI应用/Agent')
lst.insert(pos + 1, entry)

notes = d['industries'].setdefault('companyNotes', {})
def iter_strings(o):
    if isinstance(o, str): yield o
    elif isinstance(o, list):
        for x in o: yield from iter_strings(x)
    elif isinstance(o, dict):
        for x in o.values(): yield from iter_strings(x)
PLACEHOLDER_SET = set(iter_strings(s))
written, kept = 0, 0
for c, n, tier, txt in COMPANIES:
    old = notes.get(c, '')
    if old and old not in PLACEHOLDER_SET:
        kept += 1; continue
    notes[c] = txt; written += 1
d['industries']['meta'] = {'updated': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()), 'ssb_industry_seed': True}
d['meta']['updated'] = time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())

json.dump(d, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False)

d2 = json.load(open(PATH, encoding='utf-8'))
e2 = [x for x in d2['industries']['list'] if x['name'] == NAME]
assert len(e2) == 1 and e2[0]['members'] == [c for c, _, _, _ in COMPANIES], '落盘异常'
n2 = d2['industries']['companyNotes']
okc = sum(1 for c, _, _, txt in COMPANIES if n2.get(c) == txt)
print(f'OK: 备份={os.path.basename(bak)} | 成员 {len(e2[0]["members"])} 家 | 说明 新写{written}/保留{kept}/回读一致{okc}/{len(COMPANIES)} | meta.updated={d2["meta"]["updated"]}')
