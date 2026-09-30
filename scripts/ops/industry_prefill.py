# -*- coding: utf-8 -*-
"""
行业研究 · 定年纪/做体检 AI 预填草稿工具（批量版）
==================================================
默认不带参数 = 拉取 invest-data.json 已收录的全部行业，逐一生成草稿；
已有草稿的行业自动跳过（--fresh 覆盖重新生成）。

工作流：① 本脚本全量生成草稿 → ② 草稿逐个交给 AI 按 _howto 检索填充
       → ③ 前端「🤖 导入预填」审核导入（只填空、绝不覆盖）。
本脚本不联网、绝不直改 invest-data.json——前端导入是唯一写入口。
"""
import argparse
import glob
import json
import os
import re
import sys
from datetime import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
INVEST_JSON = os.path.join(ROOT, 'data', 'invest-data.json')
PREFILL_DIR = os.path.join(ROOT, 'data', 'prefill')

# —— AI 检索指引（按行业名实例化，写进草稿 _howto）——
HOWTO_AGE = [
    '检索「{ind} 国产化率 2025」「{ind} 国产化份额 按金额」',
    '有上期数据一并取（如 2024），前端两点自动算年化爬坡（pct/年）',
    '区分口径：按金额 or 按数量/台数，口径写进 age.note',
    '政策目标（十五五规划/大基金指引）填 target/targetYear',
    '判定锚点：15–40% = 加速段⭐（黄金介入）；>70% 成熟红海；<5% 导入极早期',
]
HOWTO_TAM = [
    '检索「{ind} market size 2024 2025 forecast」「{ind} 市场规模 亿美元」',
    '取 2–4 个年份点（最新实际值 + 权威机构预测：SEMI/WSTS/TechInsights/Yole）',
    '前端按首尾两点自动算 CAGR；涨价/通胀驱动的暴增年份勾 hot（含金量存疑）',
    'driver 写当年主驱动（如 AI 数据中心/存储涨价）',
]
HOWTO_SELF = [
    '检索「{ind} 自给率 按金额」「{ind} self-sufficiency rate by value」',
    '尽量拿两个口径：数量自给率（台/块数）与金额自给率——差 ≥15pct 即「量的替代 ≠ 价的替代」',
    'selfNote 写口径与来源（如：按台数 70% 是封装环节，按金额 27% 因先进制程仍进口）',
]


def _load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def _save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def _industries(data):
    return (data.get('industries') or {}).get('list') or []


def _find(data, name):
    for ind in _industries(data):
        if ind.get('name') == name:
            return ind
    return None


def _code6(s):
    """提取 6 位数字代码：'002119' / '002119.SZ' / 'sz002119' → '002119'。"""
    m = re.search(r'(\d{6})', str(s or ''))
    return m.group(1) if m else ''


def _code_name_map(data):
    """代码 → 公司名（估值池 ticker + 财报池 股票代码/公司名称）。
    行业成员若只存了股票代码，用它补出名称，让 AI 检索时有公司上下文。"""
    m = {}
    for co in ((data.get('valuation') or {}).get('companies') or []):
        c = _code6(co.get('ticker') or co.get('code'))
        if c and co.get('name'):
            m.setdefault(c, co['name'])
    for r in ((data.get('earnings') or {}).get('rows') or []):
        c = _code6(r.get('股票代码'))
        if c and r.get('公司名称'):
            m.setdefault(c, r['公司名称'])
    return m


def _members(ind, name_map=None, limit=30):
    """成员公司样本（给 AI 上下文）；兼容 [{name}] 与 ['名'] 两种存法。
    成员是纯 6 位代码时，用 name_map 补出「代码 名称」便于 AI 识别。"""
    out = []
    for m in (ind.get('members') or []):
        n = (m.get('name') if isinstance(m, dict) else str(m)) or ''
        if not n:
            continue
        if name_map and re.fullmatch(r'\d{6}', n.strip()) and _code6(n) in name_map:
            n = f'{n.strip()} {name_map[_code6(n)]}'
        out.append(n)
        if len(out) >= limit:
            break
    return out


def _safe_name(name):
    """行业名 → 文件名安全化：Windows 非法字符 \\ / : * ? " < > | 替换为 -。
    否则含 / 的行业名（如「AI芯片设计(GPU/ASIC/NPU)」）会被当成子目录路径，
    草稿散落进嵌套目录，前端导入和 --list 都对不上。"""
    return re.sub(r'[\\/:*?"<>|]', '-', name)


def gen_draft(ind, force=False, name_map=None):
    """为单个行业生成草稿。返回 (path, 'new'|'skip')。"""
    name = ind.get('name') or ''
    if not name:
        return None, 'skip'
    out = os.path.join(PREFILL_DIR, f'{_safe_name(name)}_预填草稿.json')
    if os.path.exists(out) and not force:
        return out, 'skip'
    age = ind.get('age') or {}
    health = ind.get('health') or {}
    draft = {
        'version': 1,
        'industry': name,
        'generatedAt': datetime.now().strftime('%Y-%m-%dT%H:%M:%S'),
        '_howto': {
            '_说明': '把本文件交给 AI 助手：按下面指引联网检索，把结果填入 prefill 对应字段，'
                    '每填一项在 sources 里写来源（报告名/URL）。只能填 prefill/sources，不要改 existing。',
            'age（定年纪·国产化率/渗透率）': [q.format(ind=name) for q in HOWTO_AGE],
            'tam（市场规模，亿美元）': [q.format(ind=name) for q in HOWTO_TAM],
            'self（自给率，数量 vs 金额）': [q.format(ind=name) for q in HOWTO_SELF],
        },
        'members': _members(ind, name_map),
        'existing': {  # 已有值：AI 跳过、前端导入也绝不覆盖
            'age': {k: age.get(k) for k in
                    ('metric', 'rate', 'rateYear', 'prevRate', 'prevYear', 'target', 'targetYear', 'note')},
            'health': {
                'tam': [{'year': t.get('year'), 'size': t.get('size'),
                         'hot': t.get('hot'), 'driver': t.get('driver')}
                        for t in (health.get('tam') or [])],
                'qtySelf': health.get('qtySelf'),
                'valSelf': health.get('valSelf'),
                'selfNote': health.get('selfNote') or '',
            },
        },
        'sources': {},
        'prefill': {
            'age': {'metric': '', 'rate': None, 'rateYear': '', 'prevRate': None,
                    'prevYear': '', 'target': None, 'targetYear': '', 'note': ''},
            'ageTracks': [],
            'health': {'tam': [], 'qtySelf': None, 'valSelf': None, 'selfNote': ''},
            'industry': {'chain': '', 'lifecycle': '', 'policy': '', 'prosperityNote': ''},
        },
    }
    _save(out, draft)
    return out, 'new'


def gen_all(force=False):
    """默认入口：invest-data.json 里每个已收录行业各生成一份草稿。"""
    if not os.path.exists(INVEST_JSON):
        print(f'✗ 找不到 {INVEST_JSON}')
        return 1
    data = _load(INVEST_JSON)
    inds = _industries(data)
    if not inds:
        print('invest-data.json 中没有已收录行业')
        return 1
    name_map = _code_name_map(data)
    made, skipped = [], []
    for ind in inds:
        p, st = gen_draft(ind, force, name_map)
        (made if st == 'new' else skipped).append(os.path.basename(p or (ind.get('name') or '?')))
    print(f'已收录行业 {len(inds)} 个：新生成 {len(made)} 份草稿，'
          f'跳过 {len(skipped)} 份（已有草稿，--fresh 可覆盖）')
    for p in made:
        print(f'  + {p}')
    if skipped:
        print('跳过：' + '、'.join(skipped[:10]) + ('…' if len(skipped) > 10 else ''))
    print('\n下一步：草稿逐个交给 AI 按 _howto 检索填充 → '
          '行业研究 → 详情 → 「🕰 定年纪」→「🤖 导入预填」审核导入。')
    return 0


def check_draft(path):
    """导入前校验：版本/数值范围/来源覆盖，并预告「会填什么」。"""
    try:
        d = _load(path)
    except Exception as e:
        print(f'✗ 读取失败：{e}')
        return 1
    errs = []
    if d.get('version') != 1:
        errs.append(f'version={d.get("version")}（本工具按 1 校验）')
    pf = d.get('prefill') or {}
    age = pf.get('age') or {}
    h = pf.get('health') or {}
    for k in ('rate', 'prevRate', 'target'):
        v = age.get(k)
        if v is not None and not (isinstance(v, (int, float)) and 0 <= v <= 100):
            errs.append(f'prefill.age.{k}={v} 应为 0–100 数值')
    for k in ('qtySelf', 'valSelf'):
        v = h.get(k)
        if v is not None and not (isinstance(v, (int, float)) and 0 <= v <= 100):
            errs.append(f'prefill.health.{k}={v} 应为 0–100 数值')
    src = d.get('sources') or {}
    if age.get('rate') is not None and not src.get('age.rate'):
        errs.append('prefill.age.rate 已填但 sources 缺 age.rate 来源')
    for k in ('qtySelf', 'valSelf'):
        if h.get(k) is not None and not src.get(f'health.{k}'):
            errs.append(f'prefill.health.{k} 已填但 sources 缺 health.{k} 来源')
    if errs:
        print('✗ 校验未通过：')
        for e in errs:
            print(f'  - {e}')
        return 1
    will = []
    if age.get('rate') is not None:
        will.append(f"age.rate={age['rate']}%（{age.get('rateYear') or '?'}）")
    if age.get('target') is not None:
        will.append(f"target={age['target']}%（{age.get('targetYear') or '?'}）")
    if h.get('tam'):
        will.append(f'health.tam {len(h["tam"])} 行')
    for k in ('qtySelf', 'valSelf'):
        if h.get(k) is not None:
            will.append(f'health.{k}={h[k]}%')
    if pf.get('ageTracks'):
        will.append(f'ageTracks {len(pf["ageTracks"])} 条')
    print('✅ 校验通过。将填入：' + ('、'.join(will) if will else '（草稿为空）'))
    print('导入只填空字段、绝不覆盖已有值；待确认项 🤖 徽章（hover 看来源），编辑即确认。')
    return 0


def list_all():
    data = _load(INVEST_JSON) if os.path.exists(INVEST_JSON) else {}
    inds = _industries(data)
    drafts = {os.path.basename(p) for p in
              glob.glob(os.path.join(PREFILL_DIR, '*_预填草稿.json'))}
    print(f'已收录 {len(inds)} 个行业（草稿目录已有 {len(drafts)} 份）：')
    for ind in inds:
        name = ind.get('name') or '?'
        age = ind.get('age') or {}
        h = ind.get('health') or {}
        marks = []
        if age.get('rate') is not None:
            marks.append(f"定年纪 {age['rate']}%")
        if h.get('tam'):
            marks.append(f"TAM {len(h['tam'])} 年")
        if h.get('qtySelf') is not None or h.get('valSelf') is not None:
            marks.append('自给率')
        has = f'{_safe_name(name)}_预填草稿.json' in drafts
        print(f"  · {name}｜{' / '.join(marks) if marks else '未预填'}｜草稿：{'✓' if has else '—'}")
    return 0


def main():
    ap = argparse.ArgumentParser(description='行业定年纪/体检 AI 预填草稿工具（默认全量生成）')
    ap.add_argument('--new', metavar='行业名', help='只为指定行业生成草稿')
    ap.add_argument('--fresh', action='store_true', help='覆盖已存在的草稿重新生成')
    ap.add_argument('--list', action='store_true', help='列出行业与草稿进度')
    ap.add_argument('--check', metavar='草稿.json', help='导入前校验草稿')
    args = ap.parse_args()

    if args.check:
        sys.exit(check_draft(args.check))
    if args.list:
        sys.exit(list_all())
    if args.new:
        if not os.path.exists(INVEST_JSON):
            print(f'✗ 找不到 {INVEST_JSON}')
            sys.exit(1)
        data = _load(INVEST_JSON)
        ind = _find(data, args.new)
        if ind is None:
            print(f'⚠ 行业「{args.new}」未收录（invest-data.json industries.list）')
            sys.exit(1)
        p, st = gen_draft(ind, args.fresh, _code_name_map(data))
        print((f'草稿：{p}' if st == 'new' else f'草稿已存在：{p}（--fresh 覆盖）'))
        sys.exit(0)
    sys.exit(gen_all(args.fresh))


if __name__ == '__main__':
    main()
