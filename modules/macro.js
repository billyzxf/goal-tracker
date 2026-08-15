/* ================= 宏观经济（macro） =================
 * 目的：呈现重要宏观经济指标，判断宏观经济基本面变化。
 * 呈现方式：数据 + 趋势图（纯 SVG）。
 *
 * 数据模型（存在 DB.macro.groups）：
 *   按「区域/表」分组，每张表是一个独立数据集，便于导入导出 CSV 与后续扩展。
 *   groups: [
 *     { id, key:'domestic', name:'国内宏观经济',
 *       indicators: [ { id, key, name, unit, freq, desc, updated, points:[{date,value}] } ] }
 *   ]
 * 说明：
 *   - 离线场景下指标数据需手动维护；框架已内置示例指标与历史数据。
 *   - 预留扩展：freq 支持 月度/季度/年度/日度，可为"分季、分年"指标扩展；
 *     新增表只需往 groups 加一个分组即可（含其 CSV 导入导出）。
 *   - 兼容旧结构 DB.macro.indicators（扁平数组），ensure() 会自动迁移到 groups。
 */
(function(){
  const GROUPS = [
    { key:'domestic', name:'国内宏观经济' },
    { key:'global',   name:'国际宏观经济' },
  ];
  // 旧结构下的分类 → 新表 key 映射（用于数据迁移）
  const CAT_TO_GROUP = { '海外与利率':'global' };   // 其余分类默认归入 domestic
  const FREQS = ['月度','季度','年度','日度'];
  // 表内指标的分组展示标签（按此顺序显示分类小标题）
  const CATS = ['国内经济', '物价通胀', '货币与金融', '海外与利率', '就业与民生'];
  // 日期筛选范围（所有指标共用同一套按钮）。key 存 state.macroRange
  const MACRO_RANGES = [
    { key:'1y', label:'近1年' },
    { key:'3y', label:'近3年' },
    { key:'5y', label:'近5年' },
    { key:'10y', label:'近10年' },
    { key:'all', label:'全部' },
  ];
  // 按 state.macroRange 过滤数据点（date 形如 '2026Q1' / '2026-07' / '2026'）
  function filterByRange(points){
    const range = state.macroRange || '5y';
    const cutoff = macroRangeCutoff(range);
    if(cutoff === null) return points || [];
    return (points || []).filter(p => {
      const n = numDate(p.date);
      return n != null && n >= cutoff;
    });
  }
  // 返回筛选起点的"数值日期"（YYYY*100 + MM），'all' 返回 null（不过滤）
  function macroRangeCutoff(key){
    if(key === 'all') return null;
    const now = new Date();
    const years = { '1y':1, '3y':3, '5y':5, '10y':10 }[key];
    if(!years) return 0;
    const y0 = now.getFullYear() - years;
    return y0 * 100 + (now.getMonth() + 1);
  }
  // '2026Q1' → 202601；'2026-07' → 202607；'2026' → 202600
  function numDate(s){
    const q = String(s).match(/^(\d{4})Q([1-4])$/);
    if(q) return +q[1] * 100 + (+q[2] - 1) * 3 + 1;
    const m = String(s).match(/^(\d{4})-(\d{2})$/);
    if(m) return +m[1] * 100 + +m[2];
    const y = String(s).match(/^(\d{4})$/);
    if(y) return +y[1] * 100 + 1;
    return null;
  }

  function seed(){
    const mk = (key, name, category, unit, freq, desc, points) =>
      ({ id:uid(), key, name, category, unit, freq, desc, updated:dateStr(), points:points.map(p => ({date:p[0], value:p[1]})) });
    const groups = GROUPS.map(g => ({ id:uid(), key:g.key, name:g.name, indicators:[] }));
    const put = (key, name, category, unit, freq, desc, points) => {
      const g = groups.find(x => x.key === (CAT_TO_GROUP[category] || 'domestic'));
      if(g) g.indicators.push(mk(key, name, category, unit, freq, desc, points));
    };
    // --- 国内 ---
    put('gdp', 'GDP 同比增速', '国内经济', '%', '季度',
      '国内生产总值不变价同比增速，反映整体经济增长动能。',
      [['2023Q1',4.5],['2023Q2',6.3],['2023Q3',4.9],['2023Q4',5.2],['2024Q1',5.3],['2024Q2',4.7],['2024Q3',4.6],['2024Q4',5.4],['2025Q1',5.4],['2025Q2',4.5]]);
    put('pmi', '制造业 PMI', '国内经济', '', '月度',
      '采购经理指数，荣枯线 50。高于 50 景气扩张，低于 50 收缩。',
      [['2024-03',50.8],['2024-06',49.5],['2024-09',49.8],['2024-12',50.1],['2025-03',50.5],['2025-06',49.5],['2025-09',49.8],['2025-12',50.1],['2026-03',50.2],['2026-06',50.1]]);
    put('cpi', 'CPI 同比', '物价通胀', '%', '月度',
      '居民消费价格指数同比，观察通胀与通缩压力。低于 0 意味着物价下行。',
      [['2023-06',0.0],['2023-12',-0.3],['2024-06',0.2],['2024-12',0.1],['2025-06',0.3],['2025-12',0.5],['2026-03',0.8],['2026-06',0.6]]);
    put('ppi', 'PPI 同比', '物价通胀', '%', '月度',
      '工业生产者出厂价格指数同比，反映工业品价格与利润压力。长期为负表明工业通缩。',
      [['2023-06',-5.4],['2023-12',-2.7],['2024-06',-0.8],['2024-12',-2.3],['2025-06',-2.0],['2025-12',-1.5],['2026-03',-1.2],['2026-06',-0.9]]);
    put('lpr1y', '1 年期 LPR', '货币与金融', '%', '月度',
      '贷款市场报价利率（1 年期），货币政策宽松程度的核心观测指标。',
      [['2023-06',3.55],['2023-12',3.45],['2024-06',3.45],['2024-12',3.10],['2025-06',3.00],['2025-12',3.00],['2026-03',3.00],['2026-06',3.00]]);
    put('lpr5y', '5 年期以上 LPR', '货币与金融', '%', '月度',
      '长期贷款基准，与房贷、企业长期融资成本直接相关。',
      [['2023-06',4.20],['2023-12',3.95],['2024-06',3.95],['2024-12',3.60],['2025-06',3.50],['2025-12',3.50],['2026-03',3.50],['2026-06',3.50]]);
    put('m2', 'M2 同比', '货币与金融', '%', '月度',
      '广义货币供应量同比，反映货币供给与信用扩张力度。',
      [['2023-06',11.3],['2023-12',9.7],['2024-06',6.2],['2024-12',7.3],['2025-06',7.0],['2025-12',7.4],['2026-03',7.5],['2026-06',7.6]]);
    put('unemp', '城镇调查失业率', '就业与民生', '%', '月度',
      '反映就业形势与内需基础。失业率上行通常伴随消费与风险偏好走弱。',
      [['2023-06',5.2],['2023-12',5.1],['2024-06',5.0],['2024-12',5.1],['2025-06',5.0],['2025-12',5.0],['2026-03',5.1],['2026-06',5.0]]);
    // --- 国际 ---
    put('fed', '美联储政策利率', '海外与利率', '%', '日度',
      '美国联邦基金目标利率区间上限。加息→紧货币，降息→宽货币。',
      [['2023-06',5.50],['2023-12',5.50],['2024-06',5.50],['2024-12',4.50],['2025-06',4.00],['2025-12',3.75],['2026-03',3.50],['2026-06',3.25]]);
    put('us10y', '美国 10 年期国债收益率', '海外与利率', '%', '日度',
      '全球资产定价之锚。上行压制成长股估值，下行利好估值抬升。',
      [['2023-06',3.81],['2023-12',3.88],['2024-06',4.36],['2024-12',4.57],['2025-06',4.28],['2025-12',4.20],['2026-03',4.10],['2026-06',4.05]]);
    return { groups };
  }
  function ensure(db){
    const m = db.macro = db.macro || {};
    // 迁移旧结构：DB.macro.indicators（扁平数组）→ 新的 groups 分组结构
    if(m.groups && Array.isArray(m.groups)) return;
    const old = m.indicators;
    if(old && Array.isArray(old) && old.length){
      const groups = GROUPS.map(g => ({ id:uid(), key:g.key, name:g.name, indicators:[] }));
      old.forEach(i => {
        const g = groups.find(x => x.key === (CAT_TO_GROUP[i.category] || 'domestic'));
        const copy = Object.assign({}, i, { category:i.category });
        if(g) g.indicators.push(copy);
      });
      m.groups = groups;
      delete m.indicators;
    } else {
      m.groups = seed().groups;
    }
  }

  /* ----- 通用工具 ----- */
  function groups(){ return DB.macro.groups; }
  function allIndicators(){ return (groups()||[]).reduce((a, g) => a.concat(g.indicators||[]), []); }
  function ind(name){ return allIndicators().find(i => i.key === name); }

  // 取指标最后一个值及其环比变化（相邻两个点的差值）
  function latest2(i){
    const pts = (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(!pts.length) return { latest:null, prev:null, delta:null };
    const latest = pts[pts.length-1];
    const prev = pts.length > 1 ? pts[pts.length-2] : null;
    return { latest: latest.value, prev: prev ? prev.value : null,
      delta: prev ? latest.value - prev.value : null, date: latest.date };
  }
  function fmtNum(n, unit, digits){
    if(n == null || n === '' || isNaN(n)) return '<span class="muted">—</span>';
    const d = digits != null ? digits : (Math.abs(n) < 100 ? 2 : 1);
    return Number(n).toFixed(d) + (unit || '');
  }
  function deltaHtml(delta, unit){
    if(delta == null || isNaN(delta)) return '';
    const cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'muted');
    const sign = delta > 0 ? '↑' : (delta < 0 ? '↓' : '→');
    return ' <span class="' + cls + '" style="font-size:12px">' + sign + ' ' + Math.abs(delta).toFixed(2) + (unit||'') + '</span>';
  }

  /* ----- 折线趋势图（纯 SVG，含 0 轴参考线与均值参考线） ----- */
  function lineChart(i, opts){
    // 按日期筛选（近1/3/5/10年/全部）
    const pts = filterByRange(i.points).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(pts.length < 2) return '<div class="muted" style="text-align:center;padding:20px;font-size:13px">该区间内数据点不足，无法绘制趋势图</div>';

    const w = 640, h = 210, pad = {l:50, r:16, t:18, b:32};
    const color = opts && opts.color ? opts.color : '#5b64f2';
    const mid = i.id || ('m' + Date.now() + '_' + (i.key||''));
    let vals = pts.map(p => p.value);
    const allVals = vals.filter(v => v != null && !isNaN(v));
    if(!allVals.length) return '<div class="muted">暂无有效数据</div>';
    let minV = Math.min(...allVals), maxV = Math.max(...allVals);
    // 若所有值同号且为正，底轴从 0 开始（便于观察量级）
    const allPos = allVals.every(v => v >= 0);
    if(allPos) minV = 0;
    // 指标若为"比值/率"，加一条均值虚线做参考
    const avg = allVals.reduce((s,v)=>s+v,0) / allVals.length;
    const range = (maxV - minV) || 1;
    const xS = i2 => pad.l + (i2 / (pts.length - 1)) * (w - pad.l - pad.r);
    const yS = v => h - pad.b - ((v - minV) / range) * (h - pad.t - pad.b);
    let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto" data-mid="' + esc(mid) + '">';
    // 横向网格线 + 刻度
    for(let gi = 0; gi <= 4; gi++){
      const gy = pad.t + gi * (h - pad.t - pad.b) / 4;
      const gv = maxV - gi * range / 4;
      svg += '<line class="cgrid" x1="' + pad.l + '" y1="' + gy.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + gy.toFixed(1) + '" stroke-width="1"/>';
      svg += '<text x="' + (pad.l-6) + '" y="' + (gy+3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#8a93a3">' + (Math.abs(gv) < 100 ? gv.toFixed(2) : gv.toFixed(1)) + '</text>';
    }
    // 0 轴加粗（若在画布内）
    if(0 >= minV && 0 <= maxV){
      const y0 = yS(0);
      svg += '<line class="czero" x1="' + pad.l + '" y1="' + y0.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + y0.toFixed(1) + '" stroke-width="1.2" stroke-dasharray="4,3"/>';
    }
    // 均值虚线
    const yAvg = yS(avg);
    svg += '<line x1="' + pad.l + '" y1="' + yAvg.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + yAvg.toFixed(1) + '" stroke="#e6b23c" stroke-width="1" stroke-dasharray="2,3"/>';
    // 折线 + 数据点（点数越多圆圈越小，避免密集时糊成一团）
    let path = '';
    const n = pts.length;
    // 动态半径/线宽：≤20 期保留原视觉，>100 期用最小样式
    const rDot = n <= 20 ? 3.2 : (n <= 40 ? 2.4 : (n <= 60 ? 1.8 : (n <= 100 ? 1.4 : 1.0)));
    const swLine = n <= 40 ? 2.4 : (n <= 80 ? 2.0 : 1.6);
    pts.forEach((p, k) => {
      if(p.value == null || isNaN(p.value)) return;
      const px = xS(k), py = yS(p.value);
      path += (path ? 'L' : 'M') + ' ' + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
    });
    if(path) svg += '<path d="' + path.trim() + '" fill="none" stroke="' + color + '" stroke-width="' + swLine + '" stroke-linejoin="round" stroke-linecap="round"/>';
    // 数据点（保留原生 title 兜底提示）
    pts.forEach((p, k) => {
      if(p.value == null || isNaN(p.value)) return;
      const px = xS(k), py = yS(p.value);
      svg += '<circle class="chart-pt" data-mid="' + esc(mid) + '" data-date="' + esc(p.date) + '" data-value="' + p.value + '" data-idx="' + k + '" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + rDot + '" stroke="' + color + '" stroke-width="' + Math.max(1, rDot * 0.6).toFixed(1) + '"><title>' + esc(p.date) + '：' + p.value + '</title></circle>';
    });
    // x 轴时间标签（抽样显示）
    const step = Math.ceil(pts.length / 6);
    pts.forEach((p, k) => {
      if(k % step === 0 || k === pts.length - 1){
        svg += '<text x="' + xS(k).toFixed(1) + '" y="' + (h - pad.b + 16) + '" text-anchor="middle" font-size="10" fill="#8a93a3">' + p.date + '</text>';
      }
    });
    // 提示层（默认隐藏，鼠标悬停竖线时在对应位置显示）
    svg += '<g class="chart-tip" visibility="hidden">' +
      '<line class="tip-line" x1="0" y1="' + pad.t + '" x2="0" y2="' + (h-pad.b) + '" stroke="' + color + '" stroke-width="1" stroke-dasharray="3,2"/>' +
      '<g class="tip-box">' +
        '<rect rx="4" ry="4" fill="#2b2f36" opacity="0.92"/>' +
        '<text class="tip-date" x="0" y="0" text-anchor="middle" font-size="10" fill="#fff"></text>' +
        '<text class="tip-val" x="0" y="0" text-anchor="middle" font-size="12" fill="#fff" font-weight="600"></text>' +
      '</g></g>';
    // 透明竖线 hover 区：鼠标移到某季度对应的 X 位置即显示该点值
    // 宽度 = 相邻点间距的一半（两端用第一个/最后一个间距），覆盖整个绘图区高度
    const stepX = pts.length > 1 ? (w - pad.l - pad.r) / (pts.length - 1) : (w - pad.l - pad.r);
    pts.forEach((p, k) => {
      if(p.value == null || isNaN(p.value)) return;
      const px = xS(k), py = yS(p.value);
      let hw = stepX / 2;
      if(k === 0) hw = stepX / 2;          // 首点向左到边界
      if(k === pts.length - 1) hw = stepX / 2; // 末点向右到边界
      const hx0 = (k === 0) ? pad.l : px - hw;
      const hx1 = (k === pts.length - 1) ? w - pad.r : px + hw;
      svg += '<rect class="chart-hover" x="' + hx0.toFixed(1) + '" y="' + pad.t + '" width="' + Math.max(0.5, (hx1 - hx0)).toFixed(1) + '" height="' + (h - pad.t - pad.b).toFixed(1) + '" fill="transparent" stroke="none" style="cursor:pointer" data-date="' + esc(p.date) + '" data-value="' + p.value + '" data-idx="' + k + '" data-x="' + px.toFixed(1) + '" data-y="' + py.toFixed(1) + '" onmouseover="macroChartTip(this)" onmouseout="macroChartTipHide(this)"/>';
    });
    svg += '</svg>';
    return svg;
  }

  /* ----- 数据表 ----- */
  function tableHtml(i){
    const pts = filterByRange(i.points).slice().sort((a,b) => b.date.localeCompare(a.date));
    if(!pts.length) return '<div class="empty">该区间内还没有数据，点击「添加数据」</div>';
    let h = '<div style="overflow-x:auto"><table class="val-table"><thead><tr><th>时间</th><th class="num">' + esc(i.name) + (i.unit ? ' (' + esc(i.unit) + ')' : '') + '</th><th class="num">环比变化</th><th></th></tr></thead><tbody>';
    pts.forEach((p, idx) => {
      const next = pts[idx+1]; // 更早的一个点（表已倒序）
      let d = '';
      if(next && next.value != null && p.value != null){
        const dd = p.value - next.value;
        const cls = dd > 0 ? 'up' : (dd < 0 ? 'down' : 'muted');
        const sign = dd > 0 ? '↑' : (dd < 0 ? '↓' : '→');
        d = '<span class="' + cls + '">' + sign + ' ' + Math.abs(dd).toFixed(2) + '</span>';
      }
      h += '<tr><td>' + esc(p.date) + '</td>' +
        '<td class="num"><b>' + Number(p.value).toFixed(2) + '</b></td>' +
        '<td class="num">' + d + '</td>' +
        '<td class="actions-cell"><button class="icon-btn" data-action="macro.delPoint" data-id="' + i.id + '" data-pdate="' + esc(p.date) + '">✕</button></td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  /* ----- 指标卡片渲染 ----- */
  function indicatorCard(i){
    const l2 = latest2(i);
    const delta = l2.delta != null ? deltaHtml(l2.delta, i.unit) : '';
    return '<div class="card macro-card">' +
      '<div class="sec-title" style="margin-bottom:6px"><h2>' + esc(i.name) + '</h2>' +
      '<div class="q-actions">' +
        '<span class="badge ' + (l2.delta > 0 ? 'up-badge' : (l2.delta < 0 ? 'down-badge' : 'gray')) + '" style="font-size:11px">' + (l2.delta > 0 ? '↑' : (l2.delta < 0 ? '↓' : '→')) + '</span>' +
        '<button class="icon-btn" title="编辑指标" data-action="macro.edit" data-id="' + i.id + '">✎</button>' +
        '<button class="icon-btn" title="删除指标" data-action="macro.del" data-id="' + i.id + '">✕</button>' +
      '</div></div>' +
      '<div class="macro-latest"><span class="macro-value">' + (l2.latest != null ? Number(l2.latest).toFixed(2) : '—') + '</span>' +
        (i.unit ? '<span class="macro-unit">' + esc(i.unit) + '</span>' : '') + delta +
        (l2.date ? '<span class="macro-date">' + esc(l2.date) + '</span>' : '') + '</div>' +
      (i.desc ? '<div class="muted" style="font-size:12px;margin:2px 0 12px">' + esc(i.desc) + '</div>' : '') +
      '<div class="macro-chart">' + lineChart(i) + '</div>' +
      '<div class="macro-actions">' +
        '<button class="btn ghost sm" data-action="macro.addPoint" data-id="' + i.id + '">＋ 添加数据</button>' +
        ((i.points||[]).length ?
          '<button class="btn ghost sm" data-action="macro.viewTable" data-id="' + i.id + '">📋 查看数据</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* ----- 主视图：按「区域表」分组渲染，每张表独立 CSV 导入导出 ----- */
  function renderMacro(){
    const gs = groups() || [];
    let h = header('🌐 宏观经济', '重要宏观指标 · 数据 + 趋势，辅助判断基本面变化',
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" data-action="macro.exportAll" title="导出全部宏观经济数据为一个 CSV：宏观经济_全部数据.csv">⬇ 导出全部</button>' +
      '<button class="btn ghost sm" data-action="macro.importAll" title="导入宏观经济数据 CSV：宏观经济_全部数据.csv（含国内+国际全部指标）">⬆ 导入全部</button>' +
      '<button class="btn primary" style="background:var(--indigo)" data-action="macro.add">＋ 添加指标</button>' +
      '</div>');

    // —— 导入导出说明 ——
    h += '<div class="import-help">' +
      '<b>📦 宏观数据导入 / 导出</b>' +
      '<span>文件：<code>宏观经济_全部数据.csv</code>（一次性导入国内+国际两张表）</span>' +
      '<span>获取方式：运行 <code>py scripts/fetch_macro_all.py</code> 自动抓取全部指标到 <code>data/macro/宏观经济_全部数据.csv</code>，然后「⬆ 导入全部」。</span>' +
      '</div>';

    // 最新快照汇总卡（跨表查找已有 key）
    h += '<div class="val-summary-grid macro-summary">';
    const snapshotKeys = ['gdp','cpi','ppi','pmi','lpr1y','fed'];
    snapshotKeys.forEach(k => {
      const i = ind(k);
      if(!i) return;
      const l2 = latest2(i);
      const cls = l2.delta > 0 ? 'up' : (l2.delta < 0 ? 'down' : '');
      h += '<div class="val-stat"><div class="vs-label">' + esc(i.name) + '</div>' +
        '<div class="vs-value ' + cls + '">' + (l2.latest != null ? Number(l2.latest).toFixed(2) : '—') + '</div>' +
        '<div class="vs-sub muted">' + (l2.delta != null ? (l2.delta>0?'↑':'↓') + ' ' + Math.abs(l2.delta).toFixed(2) + (i.unit||'') : '') + ' · ' + esc(l2.date||'') + '</div></div>';
    });
    h += '</div>';

    // 日期筛选（所有指标共用）：近1年/3年/5年/10年/全部
    h += '<div class="chips" style="margin:0 0 14px">' +
      MACRO_RANGES.map(r => '<button class="chip ' + ((state.macroRange||'5y') === r.key ? 'active' : '') + '" data-action="macro.fRange" data-v="' + r.key + '">' + r.label + '</button>').join('') +
      '<span class="muted" style="font-size:12px;margin-left:8px">所有图表按所选区间显示</span>' +
      '</div>';

    if(!gs.length){ h += '<div class="card"><div class="empty">还没有宏观数据表，点击右上角添加指标</div></div>'; return h; }
    // 按表分组渲染：每张表一个区块，标题 + CSV 导入/导出 + 指标卡片
    gs.forEach(g => {
      const list = g.indicators || [];
      h += '<div class="macro-table">' +
        '<div class="macro-table-head"><h2>' + esc(g.name) + '</h2>' +
        '<div class="macro-table-actions">' +
          '<button class="btn ghost sm" data-action="macro.exportCsv" data-gid="' + g.id + '" title="导出本表为 CSV，文件名：' + esc(g.key||'macro') + '_' + esc(g.name||'') + '.csv">⬇ 导出 CSV</button>' +
          '<button class="btn ghost sm" data-action="macro.importCsv" data-gid="' + g.id + '" title="导入/更新本表指标（文件名：' + esc(g.key||'macro') + '_' + esc(g.name||'') + '.csv）">⬆ 导入 CSV</button>' +
        '</div></div>';
      if(!list.length){
        h += '<div class="card"><div class="empty">该表还没有指标，点击上方「＋ 添加指标」或导入 CSV</div></div>';
      } else {
        // 保留旧分类标签的分组展示（国内经济/物价通胀/…）
        const cats = CATS.filter(cat => list.some(i => (i.category||'') === cat));
        const others = list.filter(i => !cats.includes(i.category||''));
        cats.forEach(cat => {
          const inCat = list.filter(i => i.category === cat);
          h += '<div class="macro-cat-title">' + esc(cat) + '（' + inCat.length + '）</div>';
          h += inCat.map(indicatorCard).join('');
        });
        if(others.length){
          h += '<div class="macro-cat-title">其他（' + others.length + '）</div>';
          h += others.map(indicatorCard).join('');
        }
      }
      h += '</div>';
    });
    return h;
  }

  /* ----- 弹窗辅助 ----- */
  // 查找某指标所属的表（group）；找不到返回 null
  function groupOfIndicator(iid){
    return (groups()||[]).find(g => (g.indicators||[]).some(x => x.id === iid)) || null;
  }
  function indModalBody(i){
    const d = i || {};
    // 所属表：编辑时取指标所在组；新建时默认第一张表（国内）
    const curGid = d.id ? (groupOfIndicator(d.id) || { id:'' }).id : ((groups()||[])[0] || {}).id;
    return '<input type="hidden" name="id" value="' + (d.id || '') + '">' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>指标名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required value="' + esc(d.name||'') + '" placeholder="如：CPI 同比"></div>' +
      '<div class="field" style="flex:none;width:120px"><label>单位</label><input type="text" name="unit" value="' + esc(d.unit||'') + '" placeholder="如：%"></div></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>所属表</label><select name="gid">' + (groups()||[]).map(g => '<option value="' + esc(g.id) + '" ' + (g.id === curGid ? 'selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:none;width:140px"><label>频率</label><select name="freq">' + FREQS.map(f => '<option value="' + f + '" ' + ((d.freq||'月度') === f ? 'selected' : '') + '>' + f + '</option>').join('') + '</select></div></div>' +
      '<div class="field"><label>指标说明</label><textarea name="desc" rows="2" placeholder="这个指标代表什么？怎么解读？">' + esc(d.desc||'') + '</textarea></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>显示分类（可选）</label><input type="text" name="category" value="' + esc(d.category||'') + '" placeholder="如：国内经济 / 物价通胀"></div>' +
      '<div class="field" style="flex:1"><label>指标 key（英文标识，留空自动生成）</label><input type="text" name="key" value="' + esc(d.key||'') + '" placeholder="如：cpi"></div></div>';
  }
  function pointModalBody(i){
    const pts = (i.points||[]).slice().sort((a,b) => b.date.localeCompare(a.date));
    const lastDate = pts.length ? pts[0].date : '';
    const guess = guessNextDate(lastDate, i.freq);
    const ph = i.freq === '季度' ? '如 2026Q1' : (i.freq === '年度' ? '如 2026' : '如 2026-01');
    return '<input type="hidden" name="id" value="' + i.id + '">' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>时间 <span style="color:var(--red)">*</span></label><input type="text" name="date" required value="' + esc(guess) + '" placeholder="' + ph + '"></div>' +
      '<div class="field" style="flex:1"><label>数值 ' + (i.unit ? '(' + esc(i.unit) + ')' : '') + ' <span style="color:var(--red)">*</span></label><input type="number" step="0.01" name="value" required placeholder="0.00"></div></div>';
  }
  // 根据上一个时间点与频率，推断下一个时间点（支持 年度/季度/月度）
  function guessNextDate(lastDate, freq){
    const mth = String(lastDate).match(/^(\d{4})-(\d{2})$/);
    const qtr = String(lastDate).match(/^(\d{4})Q([1-4])$/);
    const yr  = String(lastDate).match(/^(\d{4})$/);
    if(freq === '年度'){ return yr ? String(+yr[1] + 1) : String(new Date().getFullYear() + 1); }
    if(freq === '季度'){
      if(qtr){ let q = +qtr[2] + 1; let y = +qtr[1]; if(q > 4){ q = 1; y++; } return y + 'Q' + q; }
      return '2026Q1';
    }
    // 月度（含日度默认按年月）
    if(mth){ let y = +mth[1], mo = +mth[2] + 1; if(mo > 12){ mo = 1; y++; } return y + '-' + String(mo).padStart(2,'0'); }
    return dateStr().slice(0,7);
  }
  function nextMonthStr(dstr){
    const m = String(dstr).match(/^(\d{4})-(\d{2})$/); if(!m) return dateStr().slice(0,7);
    let y = +m[1], mo = +m[2] + 1; if(mo > 12){ mo = 1; y++; }
    return y + '-' + String(mo).padStart(2,'0');
  }
  function nextQuarterStr(dstr){
    const m = String(dstr).match(/^(\d{4})Q([1-4])$/); if(!m) return '2026Q1';
    let q = +m[2] + 1; let y = +m[1]; if(q > 4){ q = 1; y++; }
    return y + 'Q' + q;
  }

  /* ================= CSV 导入 / 导出（按表 group 为单位） =================
   * 格式（长表）：
   *   # GoalTracker 宏观经济数据
   *   表,{表名}
   *   指标,{key},{名称},{单位},{频率},{分类},{说明}
   *   DATA,{key},{时间},{数值}
   * 说明：DATA 行按 key 归属指标；指标行创建/更新指标元信息（不存在则新建）。
   */
  function groupToCsv(g){
    const escC = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    let csv = '表,' + escC(g.name) + '\n';
    (g.indicators||[]).forEach(i => {
      csv += '指标,' + escC(i.key) + ',' + escC(i.name) + ',' + escC(i.unit||'') + ',' + escC(i.freq||'') + ',' + escC(i.category||'') + ',' + escC(i.desc||'') + '\n';
      (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(p => {
        csv += 'DATA,' + escC(i.key) + ',' + escC(p.date) + ',' + escC(p.value) + '\n';
      });
    });
    return csv;
  }
  // 导出全部表到一个 CSV（每张表一个"表"块）
  function allGroupsToCsv(){
    const escC = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    let csv = '\uFEFF# GoalTracker 宏观经济数据（全部）\n';
    (groups()||[]).forEach(g => {
      if(!(g.indicators||[]).length) return;
      csv += groupToCsv(g);
    });
    return csv;
  }
  function csvToGroup(g, csvLines){
    let created = 0, updated = 0, points = 0;
    const byKey = {};
    const ensureInd = key => {
      if(!key) return null;
      if(byKey[key]) return byKey[key];
      let it = (g.indicators||[]).find(x => x.key === key);
      if(!it){ it = { id:uid(), key, name:key, unit:'', freq:'月度', category:'', desc:'', points:[] }; g.indicators.push(it); created++; }
      byKey[key] = it;
      return it;
    };
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const tag = String(r[0]).trim();
      if(tag === '#') continue;
      if(tag === '指标'){
        const it = ensureInd(r[1] ? String(r[1]).trim() : '');
        if(!it) continue;
        if(r[2] != null && String(r[2]) !== '') it.name = String(r[2]).trim();
        if(r[3] != null) it.unit = String(r[3]).trim();
        if(r[4] != null) it.freq = String(r[4]).trim() || '月度';
        if(r[5] != null) it.category = String(r[5]).trim();
        if(r[6] != null) it.desc = String(r[6]).trim();
        updated++;
      } else if(tag === 'DATA'){
        const it = ensureInd(r[1] ? String(r[1]).trim() : '');
        if(!it) continue;
        const date = r[2] ? String(r[2]).trim() : '';
        const num = Number(String(r[3]).replace(/[,\s%]/g,''));
        if(!date || isNaN(num)) continue;
        const ex = it.points.find(p => p.date === date);
        if(ex) ex.value = num; else it.points.push({ date, value:num });
        points++;
      }
    }
    // 标记所有指标已更新
    Object.values(byKey).forEach(x => { x.updated = dateStr(); });
    return { created, updated, points };
  }
  // 从 CSV 导入全部表：按"表,{表名}"行分派到对应 group（找不到则创建）。
  function csvToAllGroups(csvLines){
    // 默认目标 = 当前第一个 group（无表标记时兜底）
    let cur = (groups()||[])[0] || null;
    let created = 0, updated = 0, points = 0, tables = 0;
    const pending = [];          // [{group, lines}]
    let block = null;
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const tag = String(r[0]).trim();
      if(tag === '#') continue;
      if(tag === '表'){
        if(block && block.lines.length) pending.push(block);
        const tname = r[1] ? String(r[1]).trim() : '';
        block = { name: tname, lines: [] };
        tables++;
        continue;
      }
      if(block) block.lines.push(r);
    }
    if(block && block.lines.length) pending.push(block);
    if(!pending.length){ // 没有任何"表"块，全部归入第一个 group
      pending.push({ name: cur ? cur.name : '', lines: csvLines });
    }
    pending.forEach(b => {
      let g = cur;
      if(b.name){
        g = (groups()||[]).find(x => x.name === b.name) || cur;
        if(!g && b.name){ // 表名未知：创建新表（key 用拼音/表名）
          const key = 'tbl' + (tables);
          g = { id:uid(), key, name:b.name, indicators:[] };
          groups().push(g);
        }
      }
      if(!g) return;
      const res = csvToGroup(g, b.lines);
      created += res.created; updated += res.updated; points += res.points;
    });
    return { created, updated, points, tables };
  }
  // 简单 CSV 行解析（逐行 + 引号内逗号处理 + 跨行合并）
  function parseCsvSimple(text){
    const rawLines = String(text||'').replace(/\r\n/g,'\n').replace(/^\uFEFF/,'').split('\n');
    const lines = [];
    let pending = null;
    for(const ln of rawLines){
      if(pending != null) pending += '\n' + ln; else pending = ln;
      let q=0; for(const ch of pending) if(ch==='"') q++;
      if(q % 2 === 0){ lines.push(pending); pending = null; }
    }
    if(pending != null) lines.push(pending);
    const out = [];
    for(const ln of lines){
      if(!ln.trim()) continue;
      const f = []; let field='', inQ=false;
      for(let i=0;i<ln.length;i++){
        const ch = ln[i];
        if(inQ){
          if(ch === '"'){ if(ln[i+1]==='"'){ field+='"'; i++; } else inQ=false; }
          else field += ch;
        } else {
          if(ch === '"') inQ = true;
          else if(ch === ','){ f.push(field); field=''; }
          else field += ch;
        }
      }
      f.push(field); out.push(f);
    }
    return out;
  }
  // 触发浏览器下载 CSV（优先系统「另存为」可选定文件夹，不支持则直接下载）
  function downloadCsv(filename, content){
    const blob = new Blob([content], { type:'text/csv;charset=utf-8;' });
    const trySave = async () => {
      if(window.showSaveFilePicker){
        try {
          const handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: [{ description:'CSV 数据', accept:{ 'text/csv':['.csv'] } }],
          });
          const writable = await handle.createWritable();
          await writable.write(blob); await writable.close();
          return true;
        } catch(e){
          if(e && e.name === 'AbortError') return false;
          console.warn('另存为导出失败，改用下载:', e);
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    };
    return trySave();
  }

  /* ----- 组内查找工具 ----- */
  function findGroup(gid){ return (groups()||[]).find(g => g.id === gid); }
  function findIndicatorGlobal(iid){
    for(const g of (groups()||[])){
      const it = (g.indicators||[]).find(x => x.id === iid);
      if(it) return it;
    }
    return null;
  }

  /* ----- 图表竖线 hover：鼠标移到某季度对应的 X 位置即显示该点值 -----
   * 通过 window 全局函数供 SVG 内联 onmouseover/onmouseout 调用。 */
  window.macroChartTip = function(el){
    if(!el || !el.closest) return;
    const svg = el.closest('svg');
    if(!svg) return;
    const tip = svg.querySelector('.chart-tip');
    if(!tip) return;
    const date = el.getAttribute('data-date');
    const value = el.getAttribute('data-value');
    const px = parseFloat(el.getAttribute('data-x'));
    const py = parseFloat(el.getAttribute('data-y'));
    // 垂直参考线
    tip.querySelector('.tip-line').setAttribute('x1', px.toFixed(1));
    tip.querySelector('.tip-line').setAttribute('x2', px.toFixed(1));
    // 值标签（在折线上方，避免遮挡曲线）
    tip.querySelector('.tip-date').textContent = date;
    tip.querySelector('.tip-val').textContent = value;
    const tw = 70, th = 34;
    const bx = Math.min(Math.max(px - tw/2, 4), 640 - tw - 4);
    const by = py - th - 8;
    const rect = tip.querySelector('rect');
    rect.setAttribute('x', bx.toFixed(1));
    rect.setAttribute('y', Math.max(by, 4).toFixed(1));
    rect.setAttribute('width', tw);
    rect.setAttribute('height', th);
    tip.querySelector('.tip-date').setAttribute('x', (bx + tw/2).toFixed(1));
    tip.querySelector('.tip-date').setAttribute('y', (Math.max(by,4) + 14).toFixed(1));
    tip.querySelector('.tip-val').setAttribute('x', (bx + tw/2).toFixed(1));
    tip.querySelector('.tip-val').setAttribute('y', (Math.max(by,4) + 28).toFixed(1));
    tip.setAttribute('visibility', 'visible');
    // 高亮当前数据点（用内联 style，基色由 CSS .chart-pt{fill:var(--card)} 提供，深浅色均适配）
    svg.querySelectorAll('.chart-pt').forEach(c => { c.style.fill = ''; });
    const pt = svg.querySelector('.chart-pt[data-idx="' + (el.getAttribute('data-idx') || '') + '"]');
    if(pt) pt.style.fill = 'var(--indigo)';
  };
  window.macroChartTipHide = function(el){
    if(!el || !el.closest) return;
    const svg = el.closest('svg');
    if(!svg) return;
    const tip = svg.querySelector('.chart-tip');
    if(tip) tip.setAttribute('visibility', 'hidden');
    svg.querySelectorAll('.chart-pt').forEach(c => { c.style.fill = ''; });
  };

  /* ================= 模块注册 ================= */
  Register.module({
    view: 'macro',
    nav: { ico:'🌐', label:'宏观经济', group:'投资追踪' },
    seed: seed,
    ensure: ensure,
    render: renderMacro,
    actions: {
      'macro.add': () => openModal('添加宏观指标', indModalBody(null), 'macro.save'),
      'macro.fRange': el => { state.macroRange = el.dataset.v; render(); },
      'macro.edit': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        openModal('编辑指标 · ' + i.name, indModalBody(i), 'macro.save');
      },
      'macro.del': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        if(!confirm('删除指标「' + i.name + '」及其所有数据？')) return;
        const g = findGroup(groupOfIndicator(i.id));
        if(g) g.indicators = g.indicators.filter(x => x.id !== el.dataset.id);
        save(); render();
      },
      'macro.addPoint': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        openModal('添加数据 · ' + i.name, pointModalBody(i), 'macro.savePoint');
      },
      'macro.viewTable': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        openModal('数据明细 · ' + i.name, '<div style="max-height:60vh;overflow:auto">' + tableHtml(i) + '</div>', '', null, true);
      },
      'macro.delPoint': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        if(confirm('删除这条数据？')){
          i.points = i.points.filter(p => p.date !== el.dataset.pdate);
          i.updated = dateStr(); save(); render();
        }
      },
      'macro.exportCsv': el => {
        const g = findGroup(el.dataset.gid); if(!g) return;
        const content = groupToCsv(g);
        const fname = (g.key || 'macro') + '_' + (g.name || '宏观经济') + '.csv';
        downloadCsv(fname, content).then(done => {
          if(done) alert('已导出「' + g.name + '」' + (g.indicators||[]).length + ' 个指标');
        });
      },
      'macro.importCsv': el => {
        const g = findGroup(el.dataset.gid); if(!g) return;
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.onchange = () => {
          const file = input.files && input.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const lines = parseCsvSimple(reader.result);
              const r = csvToGroup(g, lines);
              save(); render();
              alert('导入完成：新增 ' + r.created + ' 个指标，更新 ' + r.updated + ' 个指标，写入 ' + r.points + ' 条数据');
            } catch(e){
              alert('导入失败：' + e.message);
            }
          };
          reader.readAsText(file, 'utf-8');
        };
        input.click();
      },
      'macro.exportAll': () => {
        const content = allGroupsToCsv();
        downloadCsv('宏观经济_全部数据.csv', content).then(done => {
          if(done) alert('已导出全部宏观经济数据');
        });
      },
      'macro.importAll': () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.csv,text/csv';
        input.onchange = () => {
          const file = input.files && input.files[0];
          if(!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            try {
              const lines = parseCsvSimple(reader.result);
              const r = csvToAllGroups(lines);
              save(); render();
              alert('导入完成：' + (r.tables||0) + ' 张表，新增 ' + r.created + ' 个指标，更新 ' + r.updated + ' 个指标，写入 ' + r.points + ' 条数据');
            } catch(e){
              alert('导入失败：' + e.message);
            }
          };
          reader.readAsText(file, 'utf-8');
        };
        input.click();
      },
    },
    forms: {
      'macro.save': fd => {
        const id = fd.get('id');
        const gid = fd.get('gid');
        const keyVal = String(fd.get('key')||'').trim();
        const data = { name:fd.get('name'), category:fd.get('category')||'', unit:fd.get('unit')||'', freq:fd.get('freq')||'月度', desc:fd.get('desc')||'', key:keyVal || undefined };
        if(id){
          const it = findIndicatorGlobal(id); if(!it) return;
          Object.assign(it, data, { key: keyVal || it.key || uid(), updated:dateStr() });
          // 若所属表改变，移动到目标组
          const curG = findGroup(groupOfIndicator(id));
          const newG = findGroup(gid);
          if(newG && curG && curG !== newG){
            curG.indicators = curG.indicators.filter(x => x.id !== id);
            newG.indicators.push(it);
          }
        } else {
          const g = findGroup(gid) || (groups()||[])[0];
          if(g) g.indicators.push(Object.assign({ id:uid(), key:keyVal || uid(), points:[], updated:dateStr() }, data));
        }
        save(); closeModal(); render();
      },
      'macro.savePoint': fd => {
        const i = findIndicatorGlobal(fd.get('id')); if(!i) return;
        const date = fd.get('date'); const value = parseFloat(fd.get('value'));
        if(!date || isNaN(value)){ alert('请填写有效的时间与数值'); return; }
        // 去重：同时间点覆盖更新
        const exist = i.points.findIndex(p => p.date === date);
        if(exist >= 0) i.points[exist].value = value;
        else i.points.push({ date, value });
        i.updated = dateStr();
        save(); closeModal(); render();
      },
    },
  });
})();
