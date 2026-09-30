# -*- coding: utf-8 -*-
"""
AI 产业链细分行业构建
======================
读取 data/industry/行业分类地图_{date}.csv（全市场分类地图，由 fetch_industry_map.py 生成），
按 ~20 个「AI 产业链细分行业」的匹配规则，把每家 A 股公司分配到对应的细分行业，
输出 data/industry/AI产业链细分行业.json，供「行业研究」页导入为研究条目。

设计要点：
  - 一家公司（6 位股票代码）可属于多个细分行业（members 出现多次）。
  - 每个细分行业的匹配 = 「申万三级 ∈ 白名单」 OR 「概念/行业字段命中任一关键词」。
  - 关键词覆盖概念板块命名（东财「核心题材」板块名），尽量覆盖全市场相关公司；
    精确分类优先依赖申万三级，关键词兜底补漏。
  - 输出 JSON 结构为 indInit 兼容的条目数组：
      [{ name, level:1, sys:'sw1', chain:'上游·半导体', thesis:'', members:[6位代码] }]
    （id 由前端导入时用 uid() 生成；前端 merge 按 name 去重，只会新增 / 合并 members）

用法：
  py scripts/build_ai_chain.py                       # 自动用最新一份分类地图
  py scripts/build_ai_chain.py --csv 路径.csv          # 指定地图文件
  py scripts/build_ai_chain.py --outdir data/industry  # 指定输出目录
"""
import argparse
import csv
import glob
import json
import os
import sys

# 顶层阶段（写入条目 chain 字段，便于页面分组）
STAGE_UP = '上游·半导体'
STAGE_MID = '中游·算力互联'
STAGE_DOWN = '下游·软件应用'
STAGE_TERM = '终端·场景落地'

# 细分行业定义
#   sw3  : 申万三级白名单（精确跟随官方行业分类）
#   kw   : 关键词（命中 概念/东财行业/申万一二三级 任一即纳入，子串匹配，覆盖全市场）
#   anchor: 兜底补充的高置信公司代码（关键词命不中的关键标的）
CHAIN = [
    # ---------- 上游·半导体 ----------
    {'name': 'AI芯片设计(GPU/ASIC/NPU)', 'stage': STAGE_UP,
     'sw3': {'数字芯片设计', '模拟芯片设计', '其他芯片设计'},
     'kw': ['AI芯片', '人工智能芯片', 'GPU', 'NPU', '算力芯片', 'AI算力', 'ASIC'],
     'anchor': ['688256', '688041', '688521', '002230', '300474', '603501'],
     'thesis': 'AI算力最上游：GPU/ASIC/NPU等专用芯片设计，决定大模型训练/推理基础设施的成本与性能上限。'},
    {'name': '存储芯片(HBM/DRAM/闪存)', 'stage': STAGE_UP,
     'sw3': {'数字芯片设计'},
     'kw': ['存储芯片', 'HBM', '内存芯片', '闪存', 'NAND', 'DRAM', '先进存储', '存储模组', '高带宽内存'],
     'anchor': ['688012', '688981', '002185', '000021', '300782'],
     'thesis': 'HBM/DRAM/NAND等存储是AI算力的“货架”与瓶颈，HBM高价放量，涨价周期驱动板块弹性。'},
    {'name': '半导体设备', 'stage': STAGE_UP,
     'sw3': {'半导体设备'},
     'kw': ['半导体设备', '刻蚀', '光刻机', '光刻设备', '薄膜沉积', '离子注入', 'CMP', '清洗设备', '涂胶显影'],
     'anchor': ['688012', '002371', '688072', '688041'],
     'thesis': '国产替代核心环节：前道/后道工艺设备，AI资本开支上行带动设备订单。'},
    {'name': '半导体材料', 'stage': STAGE_UP,
     'sw3': {'半导体材料', '电子化学品'},
     'kw': ['半导体材料', '光刻胶', '电子特气', '硅片', '靶材', 'CMP材料', '抛光', '石英材料'],
     'anchor': ['688536', '300346', '605358'],
     'thesis': '晶圆制造/封测上游耗材：硅片、光刻胶、电子特气、靶材等，国产化率提升主线。'},
    {'name': '先进封装/EDA', 'stage': STAGE_UP,
     'sw3': {'集成电路封测'},
     'kw': ['先进封装', '封测', 'Chiplet', 'EDA', '芯片封装', '系统级封装', 'CoWoS', '载板'],
     'anchor': ['688981', '600584', '002156', '300223'],
     'thesis': '算力芯片堆叠与设计工具：2.5D/3D先进封装与Chiplet成算力主流，EDA为芯片设计入口。'},

    # ---------- 中游·算力互联 ----------
    {'name': 'AI服务器/算力整机', 'stage': STAGE_MID,
     'sw3': {'服务器', 'PC、服务器及硬件', '计算机设备'},
     'kw': ['AI服务器', '服务器', '算力整机', '算力主机', '液冷服务器', 'GPU服务器', '服务器OEM'],
     'anchor': ['601138', '000977', '000066', '002415', '603019'],
     'thesis': '算力的物理载体：AI服务器(训练/推理)整机与品牌，是AI资本开支最直接的受益制造环节。'},
    {'name': '服务器零部件(电源/液冷/连接器)', 'stage': STAGE_MID,
     'sw3': {},
     'kw': ['液冷', '温控', '服务器电源', '连接器', '高速铜缆', '散热', '均热板'],
     'anchor': ['002837', '300832', '603501', '6833'],
     'thesis': '高功耗服务器的供配电与热管理：液冷、温控、电源、连接器等随单机功率提升大幅放量。'},
    {'name': 'PCB/覆铜板/铜箔', 'stage': STAGE_MID,
     'sw3': {'印制电路板'},
     'kw': ['PCB', '覆铜板', '覆铜', '铜箔', 'CCL', 'HDI', '载板', '印制电路'],
     'anchor': ['002938', '300476', '600183', '603527'],
     'thesis': '算力电路的“骨架”：高多层PCB/高速覆铜板/铜箔是AI服务器、交换机的核心载板材料。'},
    {'name': '光模块/光器件/光芯片(CPO/硅光)', 'stage': STAGE_MID,
     'sw3': {'光学元件', '通信设备'},
     'kw': ['光模块', '光通信', 'CPO', '硅光', '光器件', '光芯片', '光引擎', '1.6T', '800G', '光收发'],
     'anchor': ['300308', '300502', '002281', '603232'],
     'thesis': '数据中心内部互连核心：高速光模块(800G/1.6T)、CPO/硅光与光芯片，AI集群升级受益最前的环节之一。'},
    {'name': '交换机/网络/高速铜缆', 'stage': STAGE_MID,
     'sw3': {'通信网络设备及器件', '通信线缆及配套', '通信设备'},
     'kw': ['交换机', '网络设备', '高速铜缆', '铜缆', '路由器', '数据交换', 'AI网络'],
     'anchor': ['000063', '000938', '603556'],
     'thesis': '算力集群网络互联：数据中心交换机、高速铜缆/AOC等，Scale-out组网需求随集群规模放大。'},
    {'name': 'IDC数据中心/供电', 'stage': STAGE_MID,
     'sw3': {'云服务(含IDC、CDN)', '通信运营'},
     'kw': ['数据中心', 'IDC', '算力中心', '数据中心运维', 'UPS', '供电', '边缘计算'],
     'anchor': ['002415', '600845', '688047'],
     'thesis': '算力的“地产与电力”：IDC机房、供配电与制冷基础设施，AI机柜对电力/制冷需求倍增。'},

    # ---------- 下游·软件应用 ----------
    {'name': '算力租赁/云服务', 'stage': STAGE_DOWN,
     'sw3': {'云服务(含IDC、CDN)'},
     'kw': ['算力租赁', '云计算', 'IDC', '数据中心服务', '智算中心'],
     'anchor': ['600845', '000503'],
     'thesis': '算力的公共化供给：公有云/AI云/算力租赁，AI需求从自建转向租用的商业闭环。'},
    {'name': '大模型/AI应用软件', 'stage': STAGE_DOWN,
     'sw3': {'垂直应用软件', '横向通用软件', '行业应用软件', '基础软件', '软件开发'},
     'kw': ['大模型', 'AIGC', 'AI应用', '人工智能大模型', 'Sora', '智能办公', 'AI办公', 'Agent', '智能搜索', 'AI编程'],
     'anchor': ['688228', '300496', '600536'],
     'thesis': 'AI的价值层：通用/垂类大模型与AI应用软件(办公/搜索/Agent)，商业化落地决定板块成色。'},
    {'name': 'AI安防/机器视觉', 'stage': STAGE_DOWN,
     'sw3': {'安防设备'},
     'kw': ['机器视觉', 'AI视觉', '安防', '人脸识别', '智能安防', '工业视觉'],
     'anchor': ['002415', '300098'],
     'thesis': '感知与识别落地：AI安防与工业机器视觉，是最早变现的AI应用方向。'},
    {'name': 'AI医疗', 'stage': STAGE_DOWN,
     'sw3': {},
     'kw': ['AI医疗', '智慧医疗', '医疗AI', '智能医疗', '医疗大模型', '医学影像', 'AI制药', '互联网医疗', '精准医疗', '医疗信息化'],
     'anchor': ['300244', '300246', '002316'],
     'thesis': 'AI在医疗的落地：辅助诊断、医学影像、药物研发与患者服务，政策与技术双催化。'},
    {'name': 'AI教育', 'stage': STAGE_DOWN,
     'sw3': {'教育信息化服务'},
     'kw': ['AI教育', '智慧教育', '智能教育', '教育信息化', 'AI学习', '在线教育', '教育AI'],
     'anchor': [],
     'thesis': 'AI在教育场景的落地：智慧课堂、个性化学习、教育信息化改造。'},

    # ---------- 终端·场景落地 ----------
    {'name': '端侧AI芯片(AI PC/手机/眼镜)', 'stage': STAGE_TERM,
     'sw3': {'消费电子零部件及组装'},
     'kw': ['AI眼镜', 'AI手机', 'AIPC', 'AI PC', '端侧', '端侧AI', 'AI终端', '智能穿戴'],
     'anchor': ['688517', '002036'],
     'thesis': '从云端走向终端：AI PC/手机/眼镜/可穿戴内置NPU，端云协同打开单价与换机周期。'},
    {'name': '具身智能/机器人', 'stage': STAGE_TERM,
     'sw3': {'机器人', '工业机器人', '自动化设备', '机床工具'},
     'kw': ['人形机器人', '具身', '机器人', '减速器', '机器人关节', '伺服'],
     'anchor': ['002747', '688017', '603667', '002050'],
     'thesis': 'AI的“身体”：人形机器人/具身智能与核心零部件(减速器/伺服/传感)，量级最大想象空间。'},
    {'name': '智能驾驶/激光雷达', 'stage': STAGE_TERM,
     'sw3': {'汽车电子电气系统', '汽车零部件'},
     'kw': ['智能驾驶', '无人驾驶', '自动驾驶', '激光雷达', '智能汽车', '车联网', 'ADAS', '高级驾驶辅助'],
     'anchor': ['002920', '600699', '688028'],
     'thesis': 'AI的“移动终端”：智能驾驶软硬件(激光雷达/域控/传感器)，Robotaxi与智驾平权驱动放量。'},
    {'name': '消费电子组装(终端制造)', 'stage': STAGE_TERM,
     'sw3': {'消费电子零部件及组装', '品牌消费电子', '消费电子设备', '通信终端及配件'},
     'kw': ['消费电子', '智能穿戴', '3C', '苹果概念', 'ODM', '精密制造'],
     'anchor': ['002475', '301308', '601138'],
     'thesis': 'AI终端制造承接：消费电子整机组装与精密结构件，AI新形态终端打开新一轮迭代。'},
]


def tokens(r):
    """合并该行的 东财/申万一二三级 + 全部概念，用于子串关键词匹配。"""
    return set(x for x in [
        r.get('东财行业', ''), r.get('申万一级', ''), r.get('申万二级', ''), r.get('申万三级', '')
    ] if x.strip()) | set(x for x in (r.get('概念标签', '') or '').split('、') if x.strip())


def build(rows):
    by_code = {}          # code -> row
    for r in rows:
        c = str(r.get('股票代码', '') or '').strip()
        if c and len(c) >= 6:
            by_code[c[:6]] = r

    out = []
    for seg in CHAIN:
        members = set(seg.get('anchor') or [])
        for r in rows:
            c = str(r.get('股票代码', '') or '').strip()
            if not c or len(c) < 6:
                continue
            c = c[:6]
            toks = tokens(r)
            hit = (r.get('申万三级', '').strip() in seg['sw3']) or \
                  any(k in t for t in toks for k in seg['kw'])
            if hit:
                members.add(c)
        out.append({
            'name': seg['name'],
            'level': 1,
            'sys': 'sw1',
            'chain': seg['stage'],
            'thesis': seg['thesis'],
            'members': sorted(members),
        })
    return out


def main():
    ap = argparse.ArgumentParser(description='构建 AI 产业链细分行业 JSON')
    # 路径锚定到仓库根（脚本所在目录的上级），与当前工作目录无关
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(script_dir)
    ap.add_argument('--csv', help='分类地图 CSV 路径（默认 data/industry/ 下最新一份）')
    ap.add_argument('--outdir', default=os.path.join(root, 'data', 'industry'))
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:   # noqa: BLE001
        pass

    if args.csv:
        csv_path = args.csv
    else:
        cands = sorted(glob.glob(os.path.join(root, 'data', 'industry', '行业分类地图_*.csv')))
        if not cands:
            print('⚠️ 未找到分类地图 CSV，请先运行 py scripts/fetch_industry_map.py')
            return
        csv_path = cands[-1]

    with open(csv_path, encoding='utf-8-sig', newline='') as f:
        rows = list(csv.DictReader(f))
    print('读取地图：%s（%d 家）' % (csv_path, len(rows)))

    data = build(rows)
    # 汇总上报每个细分行业覆盖家数
    total_members = set()
    for seg in data:
        total_members |= set(seg['members'])
    for seg in data:
        print('%3d 家  %s | %s' % (len(seg['members']), seg['name'], seg['chain']))
    print('去重覆盖公司总数：%d 家（跨细分行业可重复计入）' % len(total_members))

    os.makedirs(args.outdir, exist_ok=True)
    out_path = os.path.join(args.outdir, 'AI产业链细分行业.json')
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print('\n输出：%s（%d 个细分行业）' % (out_path, len(data)))


if __name__ == '__main__':
    main()