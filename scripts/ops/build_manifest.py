# -*- coding: utf-8 -*-
"""扫描 data/ 目录，生成 data/manifest.json 数据清单，供前端做「数据新鲜度」提示。

前端（投资总览页）会读取该清单：
  - 若 data/prices/ 最新一份股价 CSV 距今超过 2 天，首页显示黄色横幅提醒重新导入行情；
  - manifest 不存在（未跑过本脚本）时静默，不打扰。

清单内容：每个数据文件（*.csv / *.json）的相对路径、所属子目录、修改时间、
大小、行数（仅 CSV，去掉表头）。顶层带 generatedAt / schema 版本。

用法：python scripts/ops/build_manifest.py
依赖：仅 Python 标准库（无第三方包），fetch 脚本跑完后执行一次即可。
"""
import sys, os, json, datetime

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

BASE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(BASE))  # ops/ → scripts/ → 仓库根
DATA_DIR = os.path.join(ROOT, 'data')
OUT_PATH = os.path.join(DATA_DIR, 'manifest.json')

# 参与扫描的扩展名；manifest.json 自身排除（避免自引用导致的反复变化）
SCAN_EXTS = ('.csv', '.json')
SKIP_NAMES = {'manifest.json'}


def count_csv_rows(path):
    """CSV 数据行数（减去表头）；读取失败返回 None（前端忽略该字段）"""
    try:
        with open(path, encoding='utf-8-sig', errors='replace') as f:
            n = sum(1 for _ in f)
        return max(0, n - 1)
    except Exception:
        return None


def main():
    if not os.path.isdir(DATA_DIR):
        print('目录不存在：%s' % DATA_DIR)
        return 1

    files = []
    for dirpath, dirnames, filenames in os.walk(DATA_DIR):
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in SCAN_EXTS or fn in SKIP_NAMES:
                continue
            full = os.path.join(dirpath, fn)
            try:
                st = os.stat(full)
            except OSError:
                continue
            sub = os.path.relpath(dirpath, DATA_DIR).replace(os.sep, '/')
            entry = {
                # 相对仓库根目录的路径（前端可直接 fetch）
                'path': os.path.relpath(full, ROOT).replace(os.sep, '/'),
                # data/ 下的子目录（prices / earnings / financial / forecast / industry / macro / ''）
                'dir': '' if sub == '.' else sub,
                'mtime': datetime.datetime.fromtimestamp(st.st_mtime).strftime('%Y-%m-%d %H:%M:%S'),
                'size': st.st_size,
            }
            if ext == '.csv':
                entry['rows'] = count_csv_rows(full)
            files.append(entry)

    files.sort(key=lambda x: x['path'])
    manifest = {
        'schema': 1,
        'generatedAt': datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'fileCount': len(files),
        'files': files,
    }
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)
    print('已生成 %s（共 %d 个数据文件）' % (OUT_PATH, len(files)))
    return 0


if __name__ == '__main__':
    sys.exit(main())
