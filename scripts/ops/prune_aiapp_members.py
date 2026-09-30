# -*- coding: utf-8 -*-
"""
大模型/AI应用软件 · 成员剔除（一次性脚本）
- 保留名单 = seed_aiapp_notes.py 的 NOTES 34 家（真命中）
- 其余 207 家概念噪声剔除（游戏/广告影视/网络安全/金融IT外包/系统集成等）
- 保留原始顺序中保留项的相对位置；刷新 meta.updated；写后回读断言
"""
import io
import json
import os
import re
import sys
from datetime import datetime, timezone

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # ops/ → scripts/ → 仓库根
PATH = os.path.join(ROOT, 'data', 'invest-data.json')
SEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_aiapp_notes.py')

IND_NAME = '大模型/AI应用软件'


def keeper_codes():
    """从 seed 脚本源码提取 NOTES 字典的键（34 家），单一事实来源。"""
    src = open(SEED, encoding='utf-8').read()
    m = re.search(r'NOTES\s*=\s*\{(.*?)\n\}', src, re.S)
    assert m, 'seed 脚本中找不到 NOTES 字典'
    codes = re.findall(r"'(\d{6})'\s*:", m.group(1))
    assert len(codes) == 34, f'期望 34 家，实际提取 {len(codes)} 家'
    assert len(set(codes)) == 34, '保留名单有重复代码'
    return set(codes)


def main():
    keep = keeper_codes()
    d = json.load(open(PATH, encoding='utf-8'))
    inds = (d.get('industries') or {}).get('list') or []
    ind = next((i for i in inds if i.get('name') == IND_NAME), None)
    assert ind is not None, f'找不到行业「{IND_NAME}」'
    members = ind.get('members') or []
    before = len(members)

    removed = [c for c in members if c not in keep]
    kept = [c for c in members if c in keep]
    missing = keep - set(kept)  # NOTES 里有但行业成员里没有的（不应存在）
    ind['members'] = kept

    d.setdefault('meta', {})['updated'] = (
        datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S') + '.000Z')
    with open(PATH, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False)
    print(f'{IND_NAME}：{before} → {len(kept)} 家（剔除 {len(removed)} 家）')
    if missing:
        print('⚠ NOTES 中但不在原成员里：', sorted(missing))
    print('meta.updated =', d['meta']['updated'])

    # 回读断言
    d2 = json.load(open(PATH, encoding='utf-8'))
    ind2 = next(i for i in (d2.get('industries') or {}).get('list')
                if i.get('name') == IND_NAME)
    m2 = set(ind2.get('members') or [])
    assert len(m2) == 34, f'回读成员数 {len(m2)} != 34'
    assert m2 == keep, '回读保留名单与 NOTES 不一致！'
    notes = (d2['industries'].get('companyNotes') or {})
    with_note = sum(1 for c in m2 if notes.get(c))
    print(f'回读确认：34/34 落盘，{with_note}/34 带生态位说明')
    assert with_note == 34, '有保留公司缺生态位说明'
    print('剔除完成。')


if __name__ == '__main__':
    main()
