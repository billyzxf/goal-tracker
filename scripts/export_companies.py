# -*- coding: utf-8 -*-
"""导出 goal-tracker-data.json 中全部公司列表为 CSV（data/公司列表.csv，名称/代码/市场/板块/行业等）。"""
import sys, csv, io, os, json
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

json_path = '../data/goal-tracker-data.json'
out_path = '../data/公司列表.csv'

with open(json_path, encoding='utf-8') as f:
    d = json.load(f)

cs = d.get('valuation', {}).get('companies') or []

# 按 ticker 排序，更整齐
cs = sorted(cs, key=lambda c: (c.get('ticker') or ''))

buf = io.StringIO()
buf.write('\ufeff')  # BOM，Excel 识别 UTF-8
w = csv.writer(buf, lineterminator='\n')
w.writerow(['股票代码', '公司名称', '板块', '行业', '细分领域', '市场', '林奇类型'])
for c in cs:
    w.writerow([
        c.get('ticker') or '',
        c.get('name') or '',
        c.get('board') or '',
        c.get('industry') or '',
        c.get('sector') or '',
        c.get('market') or '',
        c.get('companyType') or '',
    ])

with open(out_path, 'w', encoding='utf-8', newline='') as f:
    f.write(buf.getvalue())

print('已导出 %d 家公司 → %s' % (len(cs), os.path.abspath(out_path)))
