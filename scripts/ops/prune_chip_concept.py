# -*- coding: utf-8 -*-
"""
国产芯片（概念条目）· 概念噪声剔除（一次性脚本）
================================================
污染成因：国产芯片是概念型条目（sys='concept'），前端按东财「国产芯片」概念标签
动态解析成员——该标签是个大杂烩（军工电子/计算机设备/通信设备/房地产…都沾边）。

剔除机制：ind.excludes（屏蔽名单）——前端 hitsOf 过滤自动命中（手动导入不受影响）。
保留规则：概念命中 ∩ 申万 sw2=半导体（设计/制造/封测/设备/材料/分立器件）全部保留，
其余命中（半导体产业链之外的贴标签公司）全部写入 excludes。
- 刷新 meta.updated（同步盘比对依据）；写后回读断言
- 幂等：重复执行结果一致
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

IND_NAME = '国产芯片'
CONCEPT = '国产芯片'


def main():
    stocks = json.load(open(STOCKS, encoding='utf-8'))
    rows = stocks.get('stocks') or []
    tagged = [r for r in rows if CONCEPT in (r.get('concepts') or '')]
    keepers = {str(r.get('code') or '')[-6:] for r in tagged if r.get('sw2') == '半导体'}
    excludes = sorted(str(r.get('code') or '')[-6:] for r in tagged
                      if r.get('sw2') != '半导体' and r.get('code'))
    print(f'概念「{CONCEPT}」命中 {len(tagged)} 家：保留（申万半导体）{len(keepers)} 家，'
          f'剔除（标签噪声）{len(excludes)} 家')

    d = json.load(open(INVEST, encoding='utf-8'))
    ind = next((i for i in (d.get('industries') or {}).get('list')
                if i.get('name') == IND_NAME), None)
    assert ind is not None, f'找不到行业「{IND_NAME}」'
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
    assert len(ex2) == len(excludes), f'回读 excludes 数 {len(ex2)} != {len(excludes)}'
    overlap = ex2 & keepers
    assert not overlap, f'保留名单泄漏进 excludes：{sorted(overlap)[:5]}'
    print(f'回读确认：excludes {len(ex2)}/{len(excludes)} 落盘，保留名单零泄漏')
    print('前端生效逻辑：hitsOf 过滤自动命中 → 详情页命中数 = 池内 ∩ (标签命中 − excludes + 手动导入)')


if __name__ == '__main__':
    main()
