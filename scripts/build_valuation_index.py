# -*- coding: utf-8 -*-
"""扫描 valuations/ 下的估值报告，生成 valuations/_index.json 供工作台前端读取。

前端「公司估值 → 某公司 → 📄 估值报告」会按公司名匹配该索引，
把散落的 .md 报告变成详情页里可一键打开的「报告历史」。

文件名约定：{公司名}_估值报告_{YYYYMMDD}.md
用法：py scripts/build_valuation_index.py
      （运行后再刷新工作台页面即可看到报告按钮）
"""
import sys, os, re, json

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(BASE)
VAL_DIR = os.path.join(ROOT, 'valuations')
OUT_PATH = os.path.join(VAL_DIR, '_index.json')

# 非报告文件（说明文档 / 模板）不进入索引
SKIP_NAMES = {'估值五步法_完整说明文档.md', '估值报告生成SOP.md', '_报告模板.md'}
# 允许标题写成「# 标题」或「# 公司名 估值报告」
TITLE_RE = re.compile(r'^#{1,2}\s+(.+?)\s*$')
NAME_RE = re.compile(r'^(.+?)_估值报告_(\d{8})$')


def read_title(path):
    try:
        with open(path, encoding='utf-8', errors='replace') as f:
            for _ in range(30):          # 只看前 30 行，够找标题了
                line = f.readline()
                if not line:
                    break
                m = TITLE_RE.match(line.strip())
                if m:
                    return m.group(1).strip()
    except Exception:
        pass
    return ''


def main():
    if not os.path.isdir(VAL_DIR):
        print('目录不存在：%s' % VAL_DIR)
        return 1

    reports = []
    for fn in os.listdir(VAL_DIR):
        if not fn.endswith('.md') or fn in SKIP_NAMES:
            continue
        stem = fn[:-3]
        m = NAME_RE.match(stem)
        if not m:
            continue                      # 不符合命名约定的文件跳过
        name, date = m.group(1), m.group(2)
        reports.append({
            'file': fn,
            'name': name,
            'date': date,
            'title': read_title(os.path.join(VAL_DIR, fn)) or ('%s 估值报告' % name),
        })

    # 排序：公司名 → 日期（前端读取后再按公司内日期倒序展示）
    reports.sort(key=lambda r: (r['name'], r['date']))

    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(reports, f, ensure_ascii=False, indent=1)

    names = sorted({r['name'] for r in reports})
    print('已索引 %d 份报告，覆盖 %d 家公司 → %s' % (len(reports), len(names), OUT_PATH))
    return 0


if __name__ == '__main__':
    sys.exit(main())
