# -*- coding: utf-8 -*-
"""临时：把剩余文件移到对应子目录（用后删除）"""
import os, shutil, sys
try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

base = r'c:/Users/DT-Liuxiangfei/Documents/MyFiles/WPSSyncdisk/goal-tracker/data'
fin = os.path.join(base, 'financial')
mac = os.path.join(base, 'macro')
fore = os.path.join(base, 'forecast')

# 移动：宏观经济 → macro，盈利预测 → forecast
for fn in os.listdir(fin):
    if '宏观经济' in fn:
        shutil.move(os.path.join(fin, fn), os.path.join(mac, fn))
        print('→ macro:', fn)
    elif fn.startswith('盈利预测'):
        shutil.move(os.path.join(fin, fn), os.path.join(fore, fn))
        print('→ forecast:', fn)

print('---')
print('financial:', len([f for f in os.listdir(fin) if f.endswith('.csv')]))
print('macro:', len([f for f in os.listdir(mac) if f.endswith('.csv')]))
print('forecast:', len([f for f in os.listdir(fore) if f.endswith('.csv')]))
