(function(){
  /* =====================================================================
   * GoalTracker · 行业研究模块（industries）
   * ---------------------------------------------------------------------
   * 定位：二级市场式的行业研究层——从行业景气与产业链视角先找「好行业」，
   *       再配合财报跟踪（超预期个股）与公司估值（归档/安全边际）下沉到好公司。
   * 数据：DB.industries.list[]（人工维护的研究台账，条目自带 level：
   *       1=申万一级「行业」、2=二级「行业二级」、3=三级「行业三级」，
   *       与 earnings/valuation 对应层级的字段对齐）；财报池/估值池统计均从既有
   *       数据实时聚合，不存第二份。
   * 细分：详情页「🧩 细分行业」列出下一层级行业（一级→二级→三级），可一键收录成
   *       独立研究条目（自己的逻辑/景气/跟踪指标/失效条件），用于更细粒度的行业研究。
   * 联动：行业详情 → 一键跳转财报跟踪 / 公司估值（按条目层级设置对应层级筛选）；
   *       财报/估值中出现的新行业 → 一键收录（按层级分组）。
   * nav 顺序由 index.html 的 script 顺序决定：财报跟踪 → 行业研究 → 宏观经济。
   * ===================================================================== */

  const CHAINS = ['上游', '中游', '下游', '应用', '服务', '全产业链'];
  const LIFECYCLES = ['导入期', '成长期', '成熟期', '衰退期'];
  const POLICIES = ['扶持', '中性', '承压'];
  // 景气度 0–3：延续「锚点强制」的纪律，但行业级只要求一句话依据
  const PROSPERITY = [
    { v:0, label:'寒冬/出清', cls:'gray',  tip:'价格 bottoms · 产能出清中 · 关注供给侧拐点' },
    { v:1, label:'回暖/改善', cls:'green', tip:'需求或价格边际改善 · 盈利环比修复' },
    { v:2, label:'高景气',    cls:'red',   tip:'量价齐升 · 盈利上修密集 · 全行业受益' },
    { v:3, label:'过热/拥挤', cls:'amber', tip:'资本开支涌向供给端 · 警惕景气顶部与估值拥挤' },
  ];
  const TIERS = ['咖啡罐', '观察池', '回避'];
  const TIER_CLS = { '咖啡罐':'green', '观察池':'amber', '回避':'red' };

  /* ================= 行业层级（对齐财报跟踪 / 公司估值的三级行业字段） =================
   * 研究台账条目自带 level：1 = 申万一级（行业 / industry）、
   * 2 = 二级（行业二级 / industryL2）、3 = 三级（行业三级 / industryL3）。
   * 聚合统计按条目自身层级取对应字段，同一张地图可并存「电子」与「半导体」两条研究线。
   */
  const LEVELS = [
    { v:1, label:'一级', earnKey:'行业',     valKey:'industry',   tip:'申万一级（如 电子）' },
    { v:2, label:'二级', earnKey:'行业二级', valKey:'industryL2', tip:'申万二级（如 半导体 / 消费电子）' },
    { v:3, label:'三级', earnKey:'行业三级', valKey:'industryL3', tip:'申万三级（如 集成电路制造）' },
  ];
  function lv(v){ const n = Number(v); return LEVELS.find(x => x.v === ((n >= 1 && n <= 3) ? n : 1)); }
  function lvOf(ind){ return lv(ind && ind.level).v; }
  function earnKey(v){ return lv(v).earnKey; }
  function valKey(v){ return lv(v).valKey; }
  // 条目分类体系标注（申万一级为默认体系，不额外标注保持清爽）
  function lvBadge(ind){
    const key = sysKeyOf(ind);
    if(key === 'sw1') return '';
    const s = CLS_SYSTEMS.find(x => x.key === key);
    return '<span class="badge indigo" style="font-size:10px" title="' + esc(s.label + '（分类体系）') + '">' + esc(s.label) + '</span>';
  }
  // 条目在数据中的完整路径（如 电子 / 半导体 / 集成电路制造）；数据里查不到时只返回自身
  function pathOf(ind){
    const L = lvOf(ind), name = String(ind.name || '').trim();
    if(L === 1 || !name) return [name];
    for(const r of (DB.earnings.rows || [])){
      if(L === 2 && String(r[earnKey(2)] || '').trim() === name)
        return [String(r[earnKey(1)] || '').trim(), name].filter(Boolean);
      if(L === 3 && String(r[earnKey(3)] || '').trim() === name)
        return [String(r[earnKey(1)] || '').trim(), String(r[earnKey(2)] || '').trim(), name].filter(Boolean);
    }
    for(const c of (DB.valuation.companies || [])){
      if(L === 2 && String(c[valKey(2)] || '').trim() === name)
        return [String(c[valKey(1)] || '').trim(), name].filter(Boolean);
      if(L === 3 && String(c[valKey(3)] || '').trim() === name)
        return [String(c[valKey(1)] || '').trim(), String(c[valKey(2)] || '').trim(), name].filter(Boolean);
    }
    return [name];
  }

  /* ================= 全市场分类地图（DB.industryMap） =================
   * rows: { code(6位), name, em(东财行业), sw1/sw2/sw3(申万), concepts('、'连接) }
   * 来源：scripts/fetch_industry_map.py → data/industry/行业分类地图_YYYYMMDD.csv
   * 覆盖 A 股全市场（~5500 家），用于「行业研究」自带全部分类并匹配池内公司。
   */
  const CLS_SYSTEMS = [
    { key:'sw1',     label:'申万一级', col:'sw1',   earn:'行业',     val:'industry' },
    { key:'sw2',     label:'申万二级', col:'sw2',   earn:'行业二级', val:'industryL2' },
    { key:'sw3',     label:'申万三级', col:'sw3',   earn:'行业三级', val:'industryL3' },
    { key:'em',      label:'东财行业', col:'em' },
    { key:'concept', label:'概念·主题', col:'concepts', multi:true },
  ];
  // 条目的分类体系：显式 sys 优先；历史条目按申万层级（sw1/sw2/sw3）
  function sysKeyOf(ind){
    const s = String(ind && ind.sys || '');
    if(CLS_SYSTEMS.some(x => x.key === s)) return s;
    return 'sw' + lvOf(ind);
  }
  function normCode6(s){
    const m = String(s || '').match(/(\d{6})/);
    return m ? m[1] : '';
  }
  // 分类地图按代码索引
  function mapByCode(){
    const m = {};
    ((DB.industryMap && DB.industryMap.rows) || []).forEach(r => {
      const c = normCode6(r.code); if(c) m[c] = r;
    });
    return m;
  }
  // 池内公司索引：代码 → { earnRows:[], valCo }（财报池与估值池合并视图）
  function poolIndex(){
    const m = {};
    (DB.earnings.rows || []).forEach(r => {
      const c = normCode6(r['股票代码']); if(!c) return;
      const st = m[c] || (m[c] = { earnRows: [], valCo: null });
      st.earnRows.push(r);
    });
    (DB.valuation.companies || []).forEach(co => {
      const c = normCode6(co.ticker || co.code); if(!c) return;
      const st = m[c] || (m[c] = { earnRows: [], valCo: null });
      st.valCo = co;
    });
    return m;
  }
  // 某公司最新一条财报行（披露日期 → 季度）
  function latestEarnRow(rows){
    return (rows || []).slice().sort((a, b) =>
      String(b['披露日期'] || '').localeCompare(String(a['披露日期'] || '')) ||
      String(b['季度'] || '').localeCompare(String(a['季度'] || '')))[0] || null;
  }
  // 估值池公司最近一季度财务
  function latestFinOf(c){
    return (c.financials || []).slice().sort((a, b) =>
      String(b.quarter || '').localeCompare(String(a.quarter || '')))[0] || null;
  }
  /* 分类索引：一次遍历地图 → sysKey → 分类名 → { codes }。
   * 每次渲染构建一次并复用，避免逐卡重复扫描 5500+ 行地图。 */
  function clsIndex(){
    const cmap = mapByCode();
    const idx = {};
    CLS_SYSTEMS.forEach(s => { idx[s.key] = {}; });
    Object.keys(cmap).forEach(code => {
      const r = cmap[code];
      CLS_SYSTEMS.forEach(s => {
        let names;
        if(s.multi) names = String(r.concepts || '').split(/[、,，]/).map(x => x.trim()).filter(Boolean);
        else { const n = String(r[s.col] || '').trim(); names = n ? [n] : []; }
        names.forEach(n => {
          const b = idx[s.key][n] || (idx[s.key][n] = { codes: {} });
          b.codes[code] = 1;
        });
      });
    });
    return { idx, pool: poolIndex(), cmap, hasMap: Object.keys(cmap).length > 0 };
  }
  /* 命中某分类的池内公司：财报池行 + 估值池公司按代码合并。
   * 有地图 → 按地图列匹配（全市场口径）；无地图 → 申万体系退回财报/估值自带列。
   * extraCodes：条目手动导入的成员代码——即使分类字段未命中也并入（标 manual 供 UI 区分来源）。 */
  function hitsOf(sysKey, name, CI, extraCodes){
    CI = CI || clsIndex();
    const sys = CLS_SYSTEMS.find(s => s.key === sysKey) || CLS_SYSTEMS[0];
    const out = [];
    const push = code => {
      const st = CI.pool[code];
      if(st) out.push({ code, earnRows: st.earnRows, valCo: st.valCo, earnRow: latestEarnRow(st.earnRows), mapRow: CI.cmap[code] || null });
    };
    if(CI.hasMap){
      const b = CI.idx[sys.key] && CI.idx[sys.key][name];
      if(b) Object.keys(b.codes).forEach(push);
    } else if(sysKey === 'sw1' || sysKey === 'sw2' || sysKey === 'sw3'){
      const eCol = { sw1:'行业', sw2:'行业二级', sw3:'行业三级' }[sysKey];
      const vCol = { sw1:'industry', sw2:'industryL2', sw3:'industryL3' }[sysKey];
      Object.keys(CI.pool).forEach(code => {
        const st = CI.pool[code];
        const hit = st.earnRows.some(r => String(r[eCol] || '').trim() === name) ||
          (st.valCo && String(st.valCo[vCol] || '').trim() === name);
        if(hit) out.push({ code, earnRows: st.earnRows, valCo: st.valCo, earnRow: latestEarnRow(st.earnRows) });
      });
    }
    (extraCodes || []).forEach(code => {
      if(out.some(h => h.code === code)) return;      // 已自动命中：不重复、不标手动
      const st = CI.pool[code];
      if(!st) return;                                  // 不在财报/估值池中（数据未导入）
      out.push({ code, earnRows: st.earnRows, valCo: st.valCo, earnRow: latestEarnRow(st.earnRows),
        mapRow: CI.cmap[code] || null, manual: true });
    });
    return out;
  }
  // 命中公司的聚合统计（财报池指标 + 估值池归档）
  function statsForHits(hits){
    const st = { companies:0, rows:0, beat:0, beatN:0, revYoy:[], dedYoy:[], gm:[], roe:[], lastDate:'', valTotal:0, valTiers:{}, nQuote:0, p5:[], mp:[], pe:[] };
    (hits || []).forEach(h => {
      if(h.earnRows && h.earnRows.length){
        st.companies++; st.rows += h.earnRows.length;
        h.earnRows.forEach(r => {
          const d = String(r['披露日期'] || ''); if(d > st.lastDate) st.lastDate = d;
          if(isNum(r['营收同比'])) st.revYoy.push(Number(r['营收同比']));
          if(isNum(r['扣非净利同比'])) st.dedYoy.push(Number(r['扣非净利同比']));
          if(isNum(r['毛利率'])) st.gm.push(Number(r['毛利率']));
          if(isNum(r['ROE'])) st.roe.push(Number(r['ROE']));
          if(isNum(r['超预期'])){ st.beatN++; if(Number(r['超预期']) > 0) st.beat++; }
        });
      }
      if(h.valCo){
        st.valTotal++;
        if(h.valCo.tier) st.valTiers[h.valCo.tier] = (st.valTiers[h.valCo.tier] || 0) + 1;
      }
      // 行情/PE：每家公司取一值（统一行情快照：估值池 quote 或全站 DB.quotes），用于行业中位
      const q = quoteOf(h);
      if(q){ st.nQuote++; if(isNum(q.pct5)) st.p5.push(Number(q.pct5)); if(isNum(q.monthPct)) st.mp.push(Number(q.monthPct)); if(isNum(q.pe)) st.pe.push(Number(q.pe)); }
    });
    return st;
  }
  // 某体系下的分类清单（全市场家数 + 池内命中数），按命中/覆盖排序
  function clsListFor(sysKey, CI){
    CI = CI || clsIndex();
    const b = CI.idx[sysKey] || {};
    return Object.keys(b).map(name => {
      let universe = 0, poolHits = 0;
      const codes = b[name].codes;
      for(const c in codes){ universe++; if(CI.pool[c]) poolHits++; }
      return { name, universe, poolHits };
    }).sort((x, y) => y.poolHits - x.poolHits || y.universe - x.universe || x.name.localeCompare(y.name, 'zh'));
  }
  // 地图体系（东财行业/概念）的收录候选：池内财报≥3 行或估值池≥1 家
  function candidatesFromMap(CI, known){
    const out = [];
    ['em', 'concept'].forEach(sysKey => {
      const b = CI.idx[sysKey] || {};
      Object.keys(b).forEach(name => {
        if(known.has(sysKey + '|' + name)) return;
        let earnRows = 0, valN = 0;
        for(const c in b[name].codes){
          const st = CI.pool[c];
          if(!st) continue;
          earnRows += st.earnRows.length;
          if(st.valCo) valN++;
        }
        if(earnRows >= 3 || valN >= 1) out.push({ name, sys:sysKey, level:1, earnRows, valTotal:valN });
      });
    });
    out.sort((a, b) => (b.earnRows + b.valTotal * 2) - (a.earnRows + a.valTotal * 2) || a.name.localeCompare(b.name, 'zh'));
    return out;
  }

  /* ================= 种子与迁移 ================= */
  function seed(){
    return { list: [] };
  }
  function indInit(name, level, sys){
    return {
      id: uid(), name: name || '', level: lv(level).v,
      sys: CLS_SYSTEMS.some(s => s.key === sys) ? sys : 'sw1',
      members: [],          // 手动导入的财报池公司（6 位代码）：行业字段缺失/归类偏差时定向纳入跟踪
      chain: '', lifecycle: '', policy: '', prosperity: null, prosperityNote: '',
      thesis: '', drivers: [], invalidConds: [], tracked: true, updated: dateStr(),
    };
  }
  function ensure(db, sv){
    if(!Array.isArray(db.industries.list)) db.industries.list = sv.list;
    // 全市场分类地图：无则初始化空结构（由「⬆ 导入分类地图」填充）
    if(!db.industryMap || !Array.isArray(db.industryMap.rows)) db.industryMap = { rows: [], importedAt: null };
    // 只补字段、不覆盖用户已有值
    db.industries.list.forEach(ind => {
      const base = indInit();
      Object.keys(base).forEach(k => { if(ind[k] === undefined) ind[k] = base[k]; });
      if(!Array.isArray(ind.drivers)) ind.drivers = [];
      if(!Array.isArray(ind.invalidConds)) ind.invalidConds = [];
      // 历史条目没有层级 → 按一级行业处理（它们原本就是对齐「行业」字段的）
      const L = Number(ind.level);
      if(!(L >= 1 && L <= 3)) ind.level = 1;
    });
  }
  function findInd(id){ return (DB.industries.list || []).find(i => i.id === id) || null; }

  /* ================= 聚合统计（实时计算，不存第二份数据） ================= */
  function isNum(v){ return v !== '' && v != null && !isNaN(Number(v)); }
  function median(arr){
    if(!arr.length) return null;
    const a = arr.slice().sort((x,y) => x-y);
    const mid = Math.floor(a.length/2);
    return a.length % 2 ? a[mid] : (a[mid-1]+a[mid])/2;
  }
  // 财报池（DB.earnings.rows，中文键）：按指定层级的行业字段聚合（默认一级「行业」）
  function earnStatsByIndustry(level){
    const key = earnKey(level);
    const m = {};
    (DB.earnings.rows || []).forEach(r => {
      const k = String(r[key] || '').trim() || '(未分类)';
      const st = m[k] || (m[k] = { rows:0, tickers:{}, quarters:{}, revYoy:[], dedYoy:[], gm:[], roe:[], beat:0, beatN:0, lastDate:'' });
      st.rows++;
      const tk = r['股票代码']; if(tk) st.tickers[tk] = 1;
      const q = r['季度']; if(q) st.quarters[q] = 1;
      const d = String(r['披露日期'] || ''); if(d > st.lastDate) st.lastDate = d;
      if(isNum(r['营收同比'])) st.revYoy.push(Number(r['营收同比']));
      if(isNum(r['扣非净利同比'])) st.dedYoy.push(Number(r['扣非净利同比']));
      if(isNum(r['毛利率'])) st.gm.push(Number(r['毛利率']));
      if(isNum(r['ROE'])) st.roe.push(Number(r['ROE']));
      if(isNum(r['超预期'])){ st.beatN++; if(Number(r['超预期']) > 0) st.beat++; }
    });
    Object.keys(m).forEach(k => { m[k].companies = Object.keys(m[k].tickers).length; });
    return m;
  }
  // 估值池（DB.valuation.companies）：按指定层级的行业字段聚合（默认 industry 一级）
  function valStatsByIndustry(level){
    const key = valKey(level);
    const m = {};
    (DB.valuation.companies || []).forEach(c => {
      const k = String(c[key] || '').trim() || '(未分类)';
      const st = m[k] || (m[k] = { total:0, tiers:{} });
      st.total++;
      if(c.tier) st.tiers[c.tier] = (st.tiers[c.tier] || 0) + 1;
    });
    return m;
  }
  // 三个层级一次性聚合（地图/详情共用，避免同一份数据反复遍历）
  function allStats(){
    const e = {}, v = {};
    LEVELS.forEach(l => { e[l.v] = earnStatsByIndustry(l.v); v[l.v] = valStatsByIndustry(l.v); });
    return { e, v };
  }
  /* 细分行业：某条目的下一层级行业（一级→二级、二级→三级），
   * 从财报池与估值池合并，按覆盖公司数排序——用于「对更细分的行业做研究」。 */
  function childrenOf(ind){
    const L = lvOf(ind);
    if(L >= 3) return [];
    const name = String(ind.name || '').trim();
    if(!name) return [];
    const pk = earnKey(L), ck = earnKey(L + 1);
    const m = {};
    const slot = n => m[n] || (m[n] = { rows:0, tickers:{}, valTotal:0 });
    (DB.earnings.rows || []).forEach(r => {
      if(String(r[pk] || '').trim() !== name) return;
      const n = String(r[ck] || '').trim(); if(!n) return;
      const st = slot(n); st.rows++;
      const tk = r['股票代码']; if(tk) st.tickers[tk] = 1;
    });
    const vk = valKey(L), vk2 = valKey(L + 1);
    (DB.valuation.companies || []).forEach(c => {
      if(String(c[vk] || '').trim() !== name) return;
      const n = String(c[vk2] || '').trim(); if(!n) return;
      slot(n).valTotal++;
    });
    return Object.keys(m).map(n => ({ name:n, level:L + 1, rows:m[n].rows,
      companies:Object.keys(m[n].tickers).length, valTotal:m[n].valTotal }))
      .sort((a, b) => (b.companies + b.valTotal) - (a.companies + a.valTotal) || a.name.localeCompare(b.name, 'zh'));
  }
  /* 各层级的收录候选：一级沿用原阈值（财报≥3 行或估值池有公司）；
   * 二/三级数量多，只提示「估值池里有公司」或「财报池样本足够」的细分行业。 */
  function collectAllCandidates(S, CI){
    S = S || allStats();
    const out = collectCandidates(S.e[1] || {}, S.v[1] || {}).map(c => Object.assign({}, c, { level: 1, sys: 'sw1' }));
    const known = new Set((DB.industries.list || []).map(i => sysKeyOf(i) + '|' + i.name));
    [2, 3].forEach(L => {
      const e = S.e[L] || {}, v = S.v[L] || {};
      const minRows = L === 2 ? 5 : 3;
      new Set(Object.keys(e).concat(Object.keys(v))).forEach(n => {
        if(!n || n === '(未分类)' || known.has('sw' + L + '|' + n)) return;
        const er = e[n] ? e[n].rows : 0, vt = v[n] ? v[n].total : 0;
        if(vt >= 1 || er >= minRows) out.push({ name:n, level:L, sys:'sw' + L, earnRows:er, valTotal:vt });
      });
    });
    // 东财行业 / 概念：只能来自分类地图（财报/估值数据没有这两列）
    if(CI && CI.hasMap) candidatesFromMap(CI, known).forEach(c => out.push(c));
    return out;
  }
  // 数据中出现但尚未收录的行业 → 一键收录候选（财报池≥3行 或 估值池≥1家 才提示）
  function collectCandidates(earn, val){
    const known = new Set((DB.industries.list || []).map(i => i.name));
    const out = [];
    Object.keys(earn).forEach(k => {
      if(!known.has(k) && k !== '(未分类)' && (earn[k].rows >= 3)) out.push({ name:k, earnRows:earn[k].rows, valTotal:0 });
    });
    Object.keys(val).forEach(k => {
      if(known.has(k) || k === '(未分类)') return;
      const hit = out.find(o => o.name === k);
      if(hit) hit.valTotal = val[k].total;
      else out.push({ name:k, earnRows:0, valTotal:val[k].total });
    });
    return out;
  }
  // 暴露纯函数供测试 / dashboard 复用
  window.IndResearch = { seed, indInit, ensure, median, earnStatsByIndustry, valStatsByIndustry, collectCandidates, PROSPERITY, CHAINS, LIFECYCLES, POLICIES,
    LEVELS, lv, lvOf, earnKey, valKey, allStats, childrenOf, collectAllCandidates, pathOf,
    CLS_SYSTEMS, sysKeyOf, normCode6, hitsOf, statsForHits, clsIndex, clsListFor, latestEarnRow, latestFinOf };

  /* ================= 格式化小件 ================= */
  function pct(v, digits){
    return v == null ? '—' : (v > 0 ? '+' : '') + Number(v).toFixed(digits == null ? 1 : digits) + '%';
  }
  function beatCls(rate){
    if(rate == null) return 'gray';
    if(rate >= 40) return 'red';      // 超预期密集（红=强势，A 股约定）
    if(rate >= 20) return 'amber';
    return 'gray';
  }
  // 同比着色（红涨绿跌；|v|>1000% 为上年基数极小导致的失真，弱化显示）
  function yoyHtml(v){
    if(!isNum(v)) return '<span class="muted">—</span>';
    const n = Number(v);
    if(Math.abs(n) > 1000) return '<span class="muted" style="font-size:11px" title="上年同期基数极小（扭亏/微利），同比失真，请看绝对值">≈' + pct(n, 0) + '</span>';
    return '<b style="color:' + (n >= 0 ? 'var(--up,#c0392b)' : 'var(--down,#27ae60)') + '">' + pct(n) + '</b>';
  }
  function fmtYi(v){
    return isNum(v) ? (Math.abs(Number(v)) < 100 ? Number(v).toFixed(2) : Number(v).toFixed(1)) : '<span class="muted">—</span>';
  }
  function pctCell(v){
    return '<td class="num">' + (isNum(v) ? Number(v).toFixed(1) : '<span class="muted">—</span>') + '</td>';
  }
  // 统计指标小方块：kind = 'pct'（同比/涨幅，红涨绿跌） | 'pe'（PE，带 ×） | 'num'（绝对数/%，无着色）
  function mTile(label, v, kind){
    let val = '—', cls = 'muted';
    if(v != null && !isNaN(v)){
      if(kind === 'pct'){
        val = pct(v);
        if(isNum(v)) cls = Number(v) >= 0 ? 'up' : 'down';
      } else if(kind === 'pe'){
        val = toFixed2(v) + '×';
        cls = 'num';
      } else {
        val = toFixed2(v) + '%';
        cls = 'num';
      }
    }
    return '<span class="ind-mini" title="' + label + ' · 行业中位数"><i>' + label + '</i><b class="' + cls + '">' + val + '</b></span>';
  }
  function toFixed2(n){ return (Math.round(Number(n) * 10) / 10).toFixed(1); }
  // 行业景气统计指标（紧凑单行，地图卡 / 详情页复用）——营收/扣非/毛利率/ROE/5日/本月 中位 + PE
  function indMetricsGrid(r){
    const g = r.gmMed, roe = r.roeMed, p5 = r.p5Med, mp = r.mpMed, pe = r.peMed;
    if(g == null && roe == null && p5 == null && mp == null && pe == null && r.revMed == null && r.dedMed == null) return '';
    let h = '<div class="ind-mline" title="各指标均为样本公司的行业中位数"><span class="muted" style="font-size:10px">中位·</span>';
    h += mTile('营收', r.revMed, 'pct');
    h += mTile('扣非', r.dedMed, 'pct');
    h += mTile('毛利', g, 'num');
    h += mTile('ROE', roe, 'num');
    h += mTile('5日', p5, 'pct');
    h += mTile('月涨', mp, 'pct');
    h += mTile('PE', pe, 'pe');
    h += '</div>';
    return h;
  }
  // 行业详情页用的「大号」统计卡片（比地图卡紧凑行更大更醒目）
  function indMetricsBig(m){
    const cell = (label, v, kind) => {
      let val = '—', cls = 'muted';
      if(v != null && !isNaN(v)){
        if(kind === 'pct'){ val = pct(v); if(isNum(v)) cls = Number(v) >= 0 ? 'up' : 'down'; }
        else if(kind === 'pe'){ val = toFixed2(v) + '×'; cls = 'num'; }
        else { val = toFixed2(v) + '%'; cls = 'num'; }
      }
      return '<div class="ind-mtile"><div class="ind-mtile-v ' + cls + '">' + val + '</div><div class="ind-mtile-l">' + label + '</div></div>';
    };
    return '<div class="ind-mbig">' +
      cell('营收同比', m.revMed, 'pct') +
      cell('扣非同比', m.dedMed, 'pct') +
      cell('毛利率', m.gmMed, 'num') +
      cell('ROE', m.roeMed, 'num') +
      cell('5日涨幅', m.p5Med, 'pct') +
      cell('本月涨幅', m.mpMed, 'pct') +
      cell('PE', m.peMed, 'pe') +
      cell('超预期率', m.beatRate, 'pct') +
      '</div>';
  }
  function proBadge(ind, big){
    const p = PROSPERITY.find(x => x.v === ind.prosperity);
    if(!p) return '<span class="badge gray' + (big ? '' : '') + '" title="未评景气度（点编辑或用快速下拉评）">景气未评</span>';
    return '<span class="badge ' + p.cls + '" title="' + esc(p.tip) + '">景气 · ' + p.label + '</span>';
  }
  function tierSummary(tiers){
    const parts = TIERS.filter(t => tiers[t]).map(t => '<span class="badge ' + (TIER_CLS[t]||'gray') + '" style="font-size:10px">' + t + ' ' + tiers[t] + '</span>');
    return parts.length ? parts.join(' ') : '<span class="muted" style="font-size:11px">估值池暂无归档</span>';
  }

  /* ================= 行业地图（主视图） ================= */
  function renderMap(){
    const inds = DB.industries.list || [];
    const S = allStats();                 // 申万三层列聚合（收录候选 + 无地图兜底）
    const CI = clsIndex();                // 分类地图索引（导入后可用）
    const cands = collectAllCandidates(S, CI);
    const lf = state.indLevelFilter || 'all';

    let rows = inds.map(ind => {
      const st = statsForHits(hitsOf(sysKeyOf(ind), ind.name, CI, ind.members));
      return {
        ind, level: lvOf(ind),
        companies: st.companies,
        rows: st.rows,
        beatRate: st.beatN >= 2 ? st.beat / st.beatN * 100 : null,
        dedMed: median(st.dedYoy),
        revMed: median(st.revYoy),
        gmMed: median(st.gm),
        roeMed: median(st.roe),
        p5Med: median(st.p5),
        mpMed: median(st.mp),
        peMed: median(st.pe),
        qN: st.nQuote,
        valTotal: st.valTotal,
        valTiers: st.valTiers,
      };
    });
    if(lf !== 'all') rows = rows.filter(r => r.level === +lf);
    if(state.indHideUntracked) rows = rows.filter(r => r.ind.tracked);
    const sortKey = state.indSort || 'rev';
    rows.sort((a, b) => {
      if(a.ind.tracked !== b.ind.tracked) return a.ind.tracked ? -1 : 1;
      switch(sortKey){
        case 'beat': return (b.beatRate ?? -1) - (a.beatRate ?? -1);
        case 'ded':  return (b.dedMed ?? -999) - (a.dedMed ?? -999);
        case 'rev':  return (b.revMed ?? -999) - (a.revMed ?? -999);
        case 'gm':   return (b.gmMed ?? -999) - (a.gmMed ?? -999);
        case 'roe':  return (b.roeMed ?? -999) - (a.roeMed ?? -999);
        case 'p5':   return (b.p5Med ?? -999) - (a.p5Med ?? -999);
        case 'mp':   return (b.mpMed ?? -999) - (a.mpMed ?? -999);
        case 'pe':   return (b.peMed ?? -999) - (a.peMed ?? -999);
        default:     return (b.companies + b.valTotal) - (a.companies + a.valTotal) || a.ind.name.localeCompare(b.ind.name, 'zh');
      }
    });

    const lvCnt = { 1:0, 2:0, 3:0 };
    inds.forEach(i => { lvCnt[lvOf(i)]++; });

    let h = '<div class="page-head"><div><h1>🏭 行业研究</h1>' +
      '<div class="muted">先找好行业，再下沉好公司 · 自带全市场分类地图（申万一/二/三级 · 东财行业 · 概念主题），按分类浏览池内命中公司</div></div>' +
      '<div class="head-actions">' +
        '<button class="btn ghost sm" data-action="ind.mapImport" title="导入 scripts/fetch_industry_map.py 生成的行业分类地图 CSV（全市场 申万三级/东财行业/概念标签）">⬆ 导入分类地图</button>' +
        '<button class="btn ghost sm" data-action="ind.aiImport" title="导入 scripts/build_ai_chain.py 生成的 AI产业链细分行业.json（含各细分行业全市场成分公司），按名称合并为研究条目">⬆ 导入AI产业链</button>' +
        '<button class="btn ghost sm" data-action="ind.add">➕ 新增行业</button></div></div>';

    // 全市场分类地图浏览（导入 data/industry/行业分类地图_*.csv 后可用）
    if(CI.hasMap){
      const sysKey = CLS_SYSTEMS.some(s => s.key === state.indClsSys) ? state.indClsSys : 'em';
      const all = clsListFor(sysKey, CI);
      const q = String(state.indClsQ || '').trim().toLowerCase();
      const list = q ? all.filter(x => x.name.toLowerCase().includes(q)) : all;
      const CAP = state.indClsAll ? 9999 : 40;
      h += '<div class="card" style="padding:10px 14px;margin-top:12px">' +
        '<b style="font-size:13px">🗂 全市场分类地图</b>' +
        '<span class="muted" style="font-size:12px">（A股 ' + Object.keys(CI.cmap).length + ' 家 · 地图数据 ' +
        esc((DB.industryMap && DB.industryMap.importedAt) || '—') + ' · 点分类查看池内命中公司的最新财务数据）</span>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
          CLS_SYSTEMS.map(s => '<button class="chip ' + (s.key === sysKey ? 'active' : '') + '" data-action="ind.clsSys" data-v="' + s.key + '">' +
            esc(s.label) + '（' + Object.keys(CI.idx[s.key] || {}).length + '）</button>').join('') +
        '</div>' +
        '<div style="margin-top:8px"><input type="text" value="' + esc(state.indClsQ || '') + '" data-change="ind.clsQ" placeholder="搜索分类名（如 半导体 / AI算力），回车或失焦生效" style="max-width:340px;width:100%"></div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">' +
          list.slice(0, CAP).map(x => '<button class="chip" data-action="ind.openCls" data-sys="' + sysKey + '" data-v="' + esc(x.name) + '" title="全市场 ' + x.universe + ' 家 · 池内命中 ' + x.poolHits + ' 家">' + esc(x.name) +
            ' <span class="muted" style="font-size:10px">' + x.universe + (x.poolHits ? ' · 命中' + x.poolHits : '') + '</span></button>').join('') +
          (!list.length ? '<span class="muted" style="font-size:12px">没有匹配的分类</span>' : '') +
        '</div>' +
        (list.length > CAP ? '<div style="margin-top:8px"><button class="btn ghost sm" data-action="ind.clsAll">▼ 显示全部 ' + list.length + ' 个分类</button></div>' : '') +
        '</div>';
    } else {
      h += '<div class="card" style="padding:10px 14px;margin-top:12px"><b style="font-size:13px">🗂 全市场分类地图（未导入）</b>' +
        '<span class="muted" style="font-size:12px"> 运行 <code>py scripts/fetch_industry_map.py</code> 生成 data/industry/行业分类地图_YYYYMMDD.csv' +
        '（全市场 申万一/二/三级 · 东财行业 · 概念主题标签），点右上「⬆ 导入分类地图」后，即可按任何细分行业或概念浏览池内命中公司。</span></div>';
    }

    // 数据中出现、尚未收录的行业：一键收录（按分类体系分组，二/三级与概念默认折叠）
    if(cands.length){
      const showAll = !!state.indCandAll;
      const CAP = showAll ? 999 : 12;
      h += '<div class="card" style="padding:10px 14px"><b style="font-size:13px">📥 数据中出现、尚未收录的分类</b>' +
        '<span class="muted" style="font-size:12px">（财报池样本足够或估值池有公司才提示）点一下即收录：</span>';
      CLS_SYSTEMS.forEach(s => {
        const grp = cands.filter(c => (c.sys || ('sw' + c.level)) === s.key);
        if(!grp.length) return;
        h += '<div style="margin-top:8px">' +
          '<span class="muted" style="font-size:11px">' + esc(s.label) + '（' + grp.length + '）</span>' +
          '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">' +
          grp.slice(0, CAP).map(c => '<button class="chip" data-action="ind.collect" data-v="' + esc(c.name) + '" data-sys="' + s.key + '" title="' + esc(s.label) + ' · 财报池 ' + c.earnRows + ' 行 · 估值池 ' + c.valTotal + ' 家">＋ ' + esc(c.name) + (c.earnRows ? '（' + c.earnRows + '）' : '') + '</button>').join('') +
          '</div></div>';
      });
      if(!showAll && cands.length > 12){
        h += '<div style="margin-top:8px"><button class="btn ghost sm" data-action="ind.candAll">▼ 显示全部 ' + cands.length + ' 个候选</button></div>';
      }
      h += '</div>';
    }

    // 工具条：筛选 + 排序
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:14px">' +
      '<button class="chip ' + (!state.indHideUntracked ? 'active' : '') + '" data-action="ind.toggleHide">全部（' + inds.length + '）</button>' +
      '<button class="chip ' + (state.indHideUntracked ? 'active' : '') + '" data-action="ind.toggleHide">⭐ 重点跟踪（' + inds.filter(i => i.tracked).length + '）</button>' +
      '<span class="muted" style="font-size:12px;margin-left:8px">层级：</span>' +
      [['all','全部'],['1','一级'],['2','二级'],['3','三级']].map(o =>
        '<button class="chip ' + (String(lf) === o[0] ? 'active' : '') + '" data-action="ind.level" data-v="' + o[0] + '">' + o[1] +
        '（' + (o[0] === 'all' ? inds.length : (lvCnt[+o[0]] || 0)) + '）</button>').join('') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:8px">' +
      '<span class="muted" style="font-size:12px">排序：</span>' +
      [['rev','营收中位'],['ded','扣非中位'],['gm','毛利中位'],['roe','ROE中位'],['p5','5日中位'],['mp','月涨中位'],['pe','PE中位'],['cnt','公司数'],['beat','超预期率']].map(o =>
        '<button class="chip ' + (sortKey === o[0] ? 'active' : '') + '" data-action="ind.sort" data-v="' + o[0] + '" title="按该项降序（空样本排末尾）">' + o[1] + '</button>').join('') +
      '</div>';

    if(!rows.length){
      h += '<div class="card"><div class="empty">' + (inds.length ? '当前层级筛选下没有行业。' : '还没有收录任何行业。') +
        '上方「一键收录」可以从财报/估值数据直接带入（含二级/三级细分行业），或点「➕ 新增行业」手工建卡。</div></div>';
    } else {
      h += '<div class="grid-cards ind-grid" style="margin-top:12px">';
      rows.forEach(r => {
        const ind = r.ind;
        const parents = pathOf(ind).slice(0, -1).join(' / ');
        h += '<div class="card" style="cursor:pointer;padding:14px 16px" data-action="ind.open" data-id="' + ind.id + '" title="点击进入行业详情">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<b style="font-size:15px">' + esc(ind.name) + '</b>' +
            lvBadge(ind) +
            (ind.chain ? '<span class="badge indigo" style="font-size:10px">' + esc(ind.chain) + '</span>' : '') +
            proBadge(ind) +
            (ind.tracked ? '<span title="重点跟踪">⭐</span>' : '<span class="muted" style="font-size:11px">未跟</span>') +
          '</div>' +
          (parents ? '<div class="muted" style="font-size:11px;margin-top:4px">' + esc(parents) + '</div>' : '') +
          '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:12px;color:var(--ink2)">' +
            '<span>财报池 <b style="color:var(--ink)">' + r.companies + '</b> 家</span>' +
            '<span>估值池 <b style="color:var(--ink)">' + r.valTotal + '</b> 家</span>' +
            '<span>超预期率 <b class="badge ' + beatCls(r.beatRate) + '" style="font-size:11px">' + (r.beatRate == null ? '样本不足' : r.beatRate.toFixed(0) + '%') + '</b></span>' +
          '</div>' +
          indMetricsGrid(r) +
        '</div>';
      });
      h += '</div>';
    }

    // 汇总脚注
    const cntKeys = m => Object.keys(m).filter(k => k !== '(未分类)').length;   // 未分类不计入覆盖度
    const n1 = cntKeys(S.e[1]), n2 = cntKeys(S.e[2]), n3 = cntKeys(S.e[3]);
    h += '<div class="muted" style="font-size:12px;margin-top:16px">数据覆盖：财报池一级 ' + n1 + ' / 二级 ' + n2 + ' / 三级 ' + n3 +
      ' 个行业分类；已收录 ' + inds.length + ' 个（一级 ' + lvCnt[1] + ' · 二级 ' + lvCnt[2] + ' · 三级 ' + lvCnt[3] + '）。' +
      '收录 ≠ 跟踪：用 ⭐ 标出重点，排序与筛选会优先呈现。细分行业名取自财报 CSV 的「行业二级 / 行业三级」列（东财 F10，申万口径）；若显示为空，请重新抓取并导入财报数据。</div>';
    return h;
  }

  /* ================= 行业详情 ================= */
  function renderDetail(ind){
    const sysKey = sysKeyOf(ind);
    const L = lvOf(ind);
    const isSw = sysKey === 'sw1' || sysKey === 'sw2' || sysKey === 'sw3';
    const CI = clsIndex();
    const hits = hitsOf(sysKey, ind.name, CI, ind.members);
    const st = statsForHits(hits);
    const parents = isSw ? pathOf(ind).slice(0, -1).join(' / ') : '';

    let h = '<span class="back-link" data-action="ind.back">← 返回行业地图</span>';
    h += '<div class="page-head"><div><h1>🏭 ' + esc(ind.name) +
      lvBadge(ind) +
      (ind.chain ? ' <span class="badge indigo">' + esc(ind.chain) + '</span>' : '') +
      proBadge(ind, true) +
      (ind.tracked ? ' <span title="重点跟踪">⭐</span>' : '') + '</h1>' +
      '<div class="muted">' +
        (parents ? esc(parents) + ' / ' : '') +
        (ind.lifecycle ? '生命周期 ' + esc(ind.lifecycle) + ' · ' : '') +
        (ind.policy ? '政策 ' + esc(ind.policy) + ' · ' : '') +
        (st.companies ? '财报池 ' + st.companies + ' 家/' + st.rows + ' 行（最新披露 ' + esc(st.lastDate || '—') + '）' : '财报池暂无数据') +
        (st.valTotal ? ' · 估值池 ' + st.valTotal + ' 家 ' + tierSummary(st.valTiers) : '') +
      '</div></div>' +
      '<div class="head-actions">' +
        '<button class="btn ghost sm" data-action="ind.toggleTracked" data-id="' + ind.id + '">' + (ind.tracked ? '☆ 取消重点' : '⭐ 重点跟踪') + '</button>' +
        '<button class="btn ghost sm" data-action="ind.edit" data-id="' + ind.id + '">✎ 编辑</button>' +
        '<button class="btn danger-ghost sm" data-action="ind.del" data-id="' + ind.id + '">🗑 删除</button>' +
      '</div></div>';

    // 联动入口（申万体系：跳转后按对应层级筛选；东财行业/概念按代码匹配，无对应筛选字段）
    if(isSw){
      const codesAttr = esc((hits || []).map(h => h.code).filter(Boolean).join(','));
      h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px">' +
        '<button class="btn sm" data-action="ind.goEarnings" data-v="' + esc(ind.name) + '" data-lv="' + L + '" data-parent="' + esc(parents) + '" data-codes="' + codesAttr + '">📊 在财报跟踪中查看该行业' + (st.companies ? '（' + st.companies + ' 家）' : '') + '</button>' +
        '<button class="btn sm" data-action="ind.goValuation" data-v="' + esc(ind.name) + '" data-lv="' + L + '" data-parent="' + esc(parents) + '" data-codes="' + codesAttr + '">📈 在估值池中查看该行业' + (st.valTotal ? '（' + st.valTotal + ' 家）' : '') + '</button>' +
      '</div>';
    } else {
      h += '<div class="muted" style="font-size:12px;margin-top:4px">' +
        esc((CLS_SYSTEMS.find(s => s.key === sysKey) || {}).label) +
        '为全市场口径（按股票代码匹配）；财报跟踪 / 公司估值的行业筛选是申万体系，暂不支持按此体系联动跳转。</div>';
    }

    // 🧮 统计指标 · 行业景气（财报池中位 + 行情中位 + 估值中位，一眼看景气）
    {
      const m = { revMed: median(st.revYoy), dedMed: median(st.dedYoy), gmMed: median(st.gm), roeMed: median(st.roe), p5Med: median(st.p5), mpMed: median(st.mp), peMed: median(st.pe), qN: st.nQuote, beatRate: st.beatN >= 2 ? st.beat / st.beatN * 100 : null };
      h += '<div class="val-section"><div class="vs-head"><h3>📊 统计指标 · 行业景气</h3>' +
        '<span class="muted" style="font-size:12px">样本：财报池 ' + st.companies + ' 家 / ' + st.rows + ' 行（最新披露 ' + esc(st.lastDate || '—') + '）' +
        (st.nQuote ? ' · 行情/估值 ' + st.nQuote + ' 家' : '') +
        '</span></div>' +
        indMetricsBig(m) +
        '<div class="muted" style="font-size:11px;margin-top:10px">中位数口径：营收/扣非/毛利率/ROE 取自财报池各公司最新一期数值分布的中位；5日/本月/PE 取自最近行情快照（个股中位）；超预期率为财报池中「业绩超预期」公司占比（样本≥2 才显示）。为空表示该指标样本数为 0。</div>' +
        '</div>';
    }

    // 细分行业（申万专属：一级→二级→三级）
    if(isSw && L < 3){
      const kids = childrenOf(ind);
      const nextLv = lv(L + 1).label;
      h += '<div class="val-section"><div class="vs-head"><h3>🧩 细分行业（' + nextLv + '）</h3>' +
        '<span class="muted" style="font-size:12px">' + (kids.length
          ? '共 ' + kids.length + ' 个 · 点「＋ 收录」即可为某个细分行业单独建卡（自己的逻辑/景气/失效条件）'
          : '财报数据中暂无' + nextLv + '分类') + '</span></div>';
      if(kids.length){
        h += '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
          kids.map(k => {
            const stat = (k.companies ? '财报 ' + k.companies + ' 家' : '') +
              (k.companies && k.valTotal ? ' · ' : '') + (k.valTotal ? '估值 ' + k.valTotal + ' 家' : '');
            return '<span class="chip" style="cursor:default;display:inline-flex;align-items:center;gap:6px">' + esc(k.name) +
              (stat ? '<span class="muted" style="font-size:10px">' + stat + '</span>' : '') +
              '<button class="btn ghost sm" style="padding:0 6px;font-size:10px" data-action="ind.collect" data-v="' + esc(k.name) + '" data-sys="' + (sysKey === 'sw1' ? 'sw2' : 'sw3') + '" title="收录为独立研究条目（' + lv(k.level).label + '）：后续可单独写逻辑、评景气、跟踪指标">＋ 收录</button>' +
              '</span>';
          }).join('') +
          '</div>';
        h += '<div class="muted" style="font-size:11px;margin-top:8px">研究价值：细分行业能剥离一级行业的内部差异（如同属「电子」，半导体设备与消费电子组装的景气、毛利完全不同），比较时样本也更可比。</div>';
      }
      h += '</div>';
    }

    // 研究卡：景气 + 逻辑 + 驱动 + 失效条件
    h += '<div class="val-section"><div class="vs-head"><h3>🧭 行业逻辑</h3></div>';
    h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<span class="muted" style="font-size:12px">景气度快速调整：</span>' +
      '<select class="val-inline-sel" style="width:150px" data-change="ind.setProsperity" data-id="' + ind.id + '">' +
        '<option value=""' + (ind.prosperity == null ? ' selected' : '') + '>未评</option>' +
        PROSPERITY.map(p => '<option value="' + p.v + '"' + (ind.prosperity === p.v ? ' selected' : '') + '>' + p.v + ' · ' + p.label + '</option>').join('') +
      '</select>' +
      (ind.prosperityNote ? '<span class="muted" style="font-size:12px">依据：' + esc(ind.prosperityNote) + '</span>' : '') +
    '</div>';
    if(ind.thesis) h += '<div class="card md" style="margin-top:10px">' + md(ind.thesis) + '</div>';
    if(ind.drivers.length){
      h += '<div style="margin-top:10px"><span class="muted" style="font-size:12px">核心跟踪指标：</span>' +
        ind.drivers.map(d => '<span class="badge gray" style="margin-left:4px">' + esc(d) + '</span>').join('') + '</div>';
    }
    if(ind.invalidConds.length){
      h += '<div style="margin-top:10px"><b style="font-size:13px;color:#c0392b">⚠ 行业逻辑失效条件</b>' +
        '<ul style="margin:6px 0 0 18px;font-size:13px;line-height:1.8">' +
        ind.invalidConds.map(c => '<li>' + esc(c) + '</li>').join('') + '</ul></div>';
    }
    if(!ind.thesis && !ind.drivers.length && !ind.invalidConds.length){
      h += '<div class="muted" style="font-size:13px;margin-top:8px">尚未填写行业逻辑。点右上「✎ 编辑」补上：为什么研究这个行业、跟踪什么指标、什么情况下逻辑作废。</div>';
    }
    h += '</div>';

    // 池内公司最新财务数据：财报池取最新一期财报行，估值池公司取最近季度录入数据 + 行情（双池合并）
    const manualN = (ind.members || []).length;
    h += '<div class="val-section"><div class="vs-head"><h3>🔥 池内公司最新财务数据</h3>' +
      '<span class="muted" style="font-size:12px">命中 ' + hits.length + ' 家（财报池 ' + st.companies + ' · 估值池 ' + st.valTotal + '）' +
      (manualN ? ' · 手动导入 ' + manualN + ' 家' : '') + ' · ' + hitSortDesc() + ' · 点列头可换列/换向</span>' +
      '<button class="btn ghost sm" data-action="ind.memberSearch" data-id="' + ind.id + '" title="按名称/代码搜索财报池公司，手动导入到本行业（行业字段缺失或归类偏差时使用）">＋ 搜索导入公司</button></div>' +
      hitTable(hits, ind) +
      '</div>';
    return h;
  }

  /* ----- 手动导入成员：搜索财报池公司 → 加入条目 members（6 位代码） ----- */
  // 财报池去重公司清单（按财报行数降序）：{code, name, ind, rows}
  function uniqueEarnCompanies(){
    const m = {};
    (DB.earnings.rows || []).forEach(r => {
      const c = normCode6(r['股票代码']); if(!c) return;
      const st = m[c] || (m[c] = { code: c, name: String(r['公司名称'] || '').trim(),
        ind: String(r['行业'] || '').trim(), rows: 0 });
      st.rows++;
    });
    return Object.keys(m).map(k => m[k]).sort((a, b) => b.rows - a.rows);
  }
  // 代码 → 展示名（财报池名称优先，估值池兜底）
  function codeNameOf(code, CI){
    const st = (CI || clsIndex()).pool[code];
    if(!st) return code;
    return (st.earnRows[0] && st.earnRows[0]['公司名称']) ||
      (st.valCo && (st.valCo.name || st.valCo.ticker)) || code;
  }
  // 成员管理：不再单列 chips 条——移除入口收敛到命中表操作列（见 hitTable）
  // 搜索导入弹窗：可点击的公司清单（名称/代码/现属行业一目了然），输入即时过滤，行内直接导入
  function memberModalBody(ind, CI){
    const auto = {};
    hitsOf(sysKeyOf(ind), ind.name, CI).forEach(h => { auto[h.code] = 1; });
    const cos = uniqueEarnCompanies();
    const rows = cos.map(x => {
      const imported = (ind.members || []).indexOf(x.code) >= 0;
      const kw = esc(String(x.name + ' ' + x.code + ' ' + x.ind).toLowerCase());
      return '<div class="ind-mrow" data-kw="' + kw + '" style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px dashed var(--line,#e5e7eb)">' +
        '<b style="min-width:110px">' + esc(x.name || x.code) + '</b>' +
        '<span class="muted" style="font-size:11px;font-variant-numeric:tabular-nums">' + esc(x.code) + '</span>' +
        (x.ind ? '<span class="badge gray" style="font-size:10px">现属 ' + esc(x.ind) + '</span>' : '') +
        '<span class="muted" style="font-size:10px">' + x.rows + ' 行财报</span>' +
        '<span style="flex:1"></span>' +
        (auto[x.code]
          ? '<span class="badge green" style="font-size:10px" title="分类字段已命中本行业，无需导入">✓ 已在行业内</span>'
          : (imported
            ? '<span class="badge indigo" style="font-size:10px">✓ 已导入</span>'
            : '<button class="btn sm" style="padding:2px 10px;font-size:11px" data-action="ind.memberAdd" data-id="' + ind.id + '" data-code="' + x.code + '">导入</button>')) +
        '</div>';
    }).join('');
    // 弹窗内即时过滤（纯 DOM 操作，不触发页面重绘）
    window.indMemberFilter = function(v){
      const q = String(v || '').trim().toLowerCase();
      const list = document.querySelectorAll('#ind-member-list .ind-mrow');
      list.forEach(r => { r.style.display = (!q || r.getAttribute('data-kw').indexOf(q) >= 0) ? '' : 'none'; });
    };
    return '<div class="metric-help">把财报池中的公司手动导入「' + esc(ind.name) + '」一起跟踪：适合行业字段缺失、归类有偏差，或跨行业研究的情况。导入后与自动命中的公司合并统计、同表展示（标「手动」徽章）。</div>' +
      '<div class="field"><input type="text" oninput="indMemberFilter(this.value)" placeholder="🔍 输入名称 / 代码 / 行业 过滤下方列表" style="width:100%"></div>' +
      '<div id="ind-member-list" style="max-height:46vh;overflow:auto;border:1px solid var(--line,#e5e7eb);border-radius:8px">' +
      (rows || '<div class="muted" style="padding:12px;text-align:center">财报池暂无公司数据（先到「财报跟踪」导入财报 CSV）</div>') +
      '</div>' +
      '<div class="muted" style="font-size:11px;margin-top:6px">共 ' + cos.length + ' 家（财报池去重，按财报行数排序）· 已自动命中的公司不提供导入按钮</div>';
  }

  /* ============ 命中公司表：财报池最新一期 + 估值池最近季度，双池合并展示 ============ */
  // sub: 可选的细分列（申万体系传 {key:财报列, col:地图列, label}）
  // 合并视图取值：优先财报池最新一期，估值池公司回退最近季度录入数据
  // ind: 所属研究条目（传入时，手动导入行在操作列提供 ✕ 移除）
  // 统一行情：估值池公司自带 quote 与全站快照（DB.quotes）取日期较新者——
  // 纯财报池公司（未入估值池）也能显示现价/涨幅（数据来自「⬆ 导入股价」）
  function quoteOf(h){
    const c = h.valCo;
    const gq = (DB.quotes && DB.quotes[h.code]) || null;
    const cq = (c && c.quote) || null;
    if(cq && (!gq || String(cq.date || '') >= String(gq.date || ''))) return cq;
    return gq || cq;
  }
  function priceOf(h){
    const q = quoteOf(h);
    if(q && isNum(q.price)) return Number(q.price);
    return (h.valCo && h.valCo.currentPrice > 0) ? Number(h.valCo.currentPrice) : null;
  }
  function hitVal(h, earnKey, finKey){
    if(h.earnRow && isNum(h.earnRow[earnKey])) return Number(h.earnRow[earnKey]);
    const f = h.valCo ? latestFinOf(h.valCo) : null;
    return (f && isNum(f[finKey])) ? Number(f[finKey]) : null;
  }
  // 命中表排序列注册表（get 从合并视图取原始值；缺失值排序时永远排最后）
  const HIT_COLS = [
    { key:'name',    label:'公司',      type:'text', get:v => (v.h.earnRow && v.h.earnRow['公司名称']) || (v.h.valCo && v.h.valCo.name) || v.h.code },
    { key:'ind',     label:'行业',      type:'text', get:v => swPath(v.h.code, v.h.earnRow || v.h.valCo || {}) },
    { key:'quarter', label:'季度',      type:'text', get:v => (v.h.earnRow && v.h.earnRow['季度']) || (v.f && v.f.quarter) || '' },
    { key:'date',    label:'披露日期',  type:'text', get:v => (v.h.earnRow && v.h.earnRow['披露日期']) || '' },
    { key:'rev',     label:'营收(亿)',  type:'num',  get:v => hitVal(v.h, '营业收入', 'revenue') },
    { key:'revYoy',  label:'营收同比',  type:'num',  get:v => hitVal(v.h, '营收同比', 'revenueYoy') },
    { key:'np',      label:'净利(亿)',  type:'num',  get:v => hitVal(v.h, '净利润', 'netProfit') },
    { key:'dedYoy',  label:'扣非同比',  type:'num',  get:v => hitVal(v.h, '扣非净利同比', 'deductedNetProfitYoy') },
    { key:'gm',      label:'毛利率',    type:'num',  get:v => hitVal(v.h, '毛利率', 'grossMargin') },
    { key:'roe',     label:'ROE',       type:'num',  get:v => hitVal(v.h, 'ROE', 'roe') },
    { key:'price',   label:'现价',      type:'num',  get:v => priceOf(v.h) },
    { key:'pct',     label:'涨幅',      type:'num',  get:v => { const q = quoteOf(v.h); return (q && isNum(q.pct)) ? Number(q.pct) : null; } },
    { key:'pct5',    label:'5日涨幅',   type:'num',  get:v => { const q = quoteOf(v.h); return (q && isNum(q.pct5)) ? Number(q.pct5) : null; } },
    { key:'monthPct',label:'本月涨幅',  type:'num',  get:v => { const q = quoteOf(v.h); return (q && isNum(q.monthPct)) ? Number(q.monthPct) : null; } },
    { key:'pe',      label:'PE',        type:'num',  get:v => { const q = quoteOf(v.h); return (q && isNum(q.pe)) ? Number(q.pe) : null; } },
  ];
  // 命中表当前的排序说明（用于副标题）
  function hitSortDesc(){
    const c = HIT_COLS.find(x => x.key === (state.indHitSort || 'rev')) || HIT_COLS.find(x => x.key === 'rev');
    return '按「' + c.label + '」' + ((state.indHitDir || 'desc') === 'asc' ? '升序' : '降序');
  }
  function hitTable(hits, ind){
    if(!hits.length) return '<div class="muted" style="font-size:13px">财报池 / 估值池中没有公司命中该分类。</div>';
    // 排序：默认营收降序（营收最高的公司在前）；点任意列头切换（再点一次升/降）
    const sortKey = state.indHitSort || 'rev';
    const sortDir = state.indHitDir || 'desc';
    const sortCol = HIT_COLS.find(c => c.key === sortKey) || HIT_COLS.find(c => c.key === 'rev');
    const dirMul = sortDir === 'asc' ? 1 : -1;
    const views = hits.map(h => ({ h, f: h.earnRow ? null : (h.valCo ? latestFinOf(h.valCo) : null) }));
    views.sort((a, b) => {
      if(sortCol.type === 'text') return dirMul * String(sortCol.get(a)).localeCompare(String(sortCol.get(b)), 'zh');
      const av = sortCol.get(a), bv = sortCol.get(b);
      if(av == null && bv == null) return 0;
      if(av == null) return 1;   // 缺失值永远排在最后，不随方向翻转
      if(bv == null) return -1;
      return dirMul * (av - bv);
    });
    // 显示条数筛选（排序后截取；全市场数据下默认只渲染前 50 行，避免单分类数千行卡顿）
    const lim = state.indHitLimit == null ? 50 : state.indHitLimit;
    const shown = lim === 'all' ? views : views.slice(0, +lim || 50);
    const limChips = [20, 50, 100, 'all'].map(n =>
      '<button class="chip ' + (String(lim) === String(n) ? 'active' : '') + '" data-action="ind.hitLimit" data-v="' + n + '" title="排序后显示前 ' + (n === 'all' ? '全部' : n) + ' 条">' +
      (n === 'all' ? '全部 ' + views.length : '前 ' + n) + '</button>').join('');
    const poolBadges = h => {
      const bs = [];
      if(h.earnRows.length) bs.push('<span class="badge gray" style="font-size:10px">财报池</span>');
      if(h.valCo) bs.push('<span class="badge indigo" style="font-size:10px">估值池</span>');
      if(h.manual) bs.push('<span class="badge amber" style="font-size:10px" title="分类字段未命中，由本条目手动导入">手动</span>');
      return bs.join(' ') || '<span class="muted">—</span>';
    };
    const th = c => {
      const arrow = c.key === sortKey ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th' + (c.type === 'num' ? ' class="num"' : '') + ' data-action="ind.hitSort" data-key="' + c.key + '" style="cursor:pointer;user-select:none" title="点击按此列排序，再点切换升/降序">' + esc(c.label) + arrow + '</th>';
    };
    return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px">' +
      '<span class="muted" style="font-size:11px">显示条数：</span>' + limChips +
      (lim !== 'all' && views.length > shown.length ? '<span class="muted" style="font-size:11px">（共 ' + views.length + ' 家，点「全部」展开）</span>' : '') +
      '</div>' +
      '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
      th(HIT_COLS[0]) + '<th>数据池</th>' + th(HIT_COLS[1]) + th(HIT_COLS[2]) + th(HIT_COLS[3]) +
      th(HIT_COLS[4]) + th(HIT_COLS[5]) + th(HIT_COLS[6]) +
      th(HIT_COLS[7]) + th(HIT_COLS[8]) + th(HIT_COLS[9]) +
      th(HIT_COLS[10]) + th(HIT_COLS[11]) + th(HIT_COLS[12]) + th(HIT_COLS[13]) + th(HIT_COLS[14]) + '<th></th>' +
      '</tr></thead><tbody>' +
      shown.map(v => {
        const h = v.h, er = v.h.earnRow, f = v.f;
        const name = (er && er['公司名称']) || (h.valCo && h.valCo.name) || h.code;
        const q = (er && er['季度']) || (f && f.quarter) || '';
        const dd = (er && er['披露日期']) || '';
        const gv = x => '<td class="num">' + fmtYi(x) + '</td>';
        const gy = x => '<td class="num">' + yoyHtml(x) + '</td>';
        // 操作列：已在估值池 → 打开详情；纯财报池公司 → 一键加入估值（带出申万分类）
        const fullTicker = (er && er['股票代码']) || (h.valCo && h.valCo.ticker) ||
          (h.code + (/^[69]/.test(h.code) ? '.SH' : /^[48]/.test(h.code) ? '.BJ' : '.SZ'));
        const indL1 = (er && er['行业']) || (h.valCo && h.valCo.industry) || (h.mapRow && h.mapRow.sw1) || '';
        const indL2 = (er && er['行业二级']) || (h.valCo && h.valCo.industryL2) || (h.mapRow && h.mapRow.sw2) || '';
        const indL3 = (er && er['行业三级']) || (h.valCo && h.valCo.industryL3) || (h.mapRow && h.mapRow.sw3) || '';
        const bd = (er && er['板块']) || (h.valCo && h.valCo.board) || '';
        const lynch = (er && er['林奇类型']) || (h.valCo && h.valCo.companyType) || '';
        const act = (h.valCo
          ? '<button class="btn ghost sm" style="padding:0 8px;font-size:11px" data-action="ind.openCompany" data-id="' + h.valCo.id + '" title="打开估值池公司详情">🔍 详情</button>'
          : '<button class="btn ghost sm" style="padding:0 8px;font-size:11px" data-action="ind.addVal" data-code="' + esc(h.code) + '" data-ticker="' + esc(fullTicker) + '" data-name="' + esc(name) + '" data-ind="' + esc(indL1) + '" data-l2="' + esc(indL2) + '" data-l3="' + esc(indL3) + '" data-board="' + esc(bd) + '" data-type="' + esc(lynch) + '" title="加入估值模块关注列表（自动带出申万一/二/三级行业）">➕ 加入估值</button>') +
          (h.manual && ind
            ? ' <button class="icon-btn" style="font-size:11px;padding:0 5px" data-action="ind.memberDel" data-id="' + ind.id + '" data-code="' + esc(h.code) + '" title="移出本行业（不影响财报/估值数据）">✕</button>'
            : '');
        return '<tr>' +
          '<td><b>' + esc(name) + '</b> <span class="muted" style="font-size:11px">' + esc(h.code) + '</span>' +
          ((window.ValHelpers && ValHelpers.ratingBadgeByCode) ? ValHelpers.ratingBadgeByCode(h.code) : '') + '</td>' +
          '<td style="white-space:nowrap">' + poolBadges(h) + '</td>' +
          '<td style="font-size:11px;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + esc(swPath(h.code, er || h.valCo || {})) + '">' + esc(swPath(h.code, er || h.valCo || {})) + '</td>' +
          '<td class="muted">' + esc(q) + '</td>' +
          '<td class="muted" style="font-size:11px">' + esc(dd) + '</td>' +
          gv(er ? er['营业收入'] : f && f.revenue) +
          gy(er ? er['营收同比'] : f && f.revenueYoy) +
          gv(er ? er['净利润'] : f && f.netProfit) +
          gy(er ? er['扣非净利同比'] : f && f.deductedNetProfitYoy) +
          pctCell(er ? er['毛利率'] : f && f.grossMargin) +
          pctCell(er ? er['ROE'] : f && f.roe) +
          (() => {   // 现价（统一行情：估值池 quote 或全站快照；下附行情日期小字）
            const q = quoteOf(h);
            const p = priceOf(h);
            if(p == null) return '<td class="num"><span class="muted">—</span></td>';
            const qd = (q && q.date) ? '<div class="muted" style="font-size:10px">' + esc(q.date) + '</div>' : '';
            return '<td class="num" style="white-space:nowrap"><b>' + p.toFixed(2) + '</b>' + qd + '</td>';
          })() +
          (() => {   // 当日涨幅 / 5日涨幅 / 本月涨幅（涨红跌绿，缺失留白）
            const q = quoteOf(h);
            const cell = k => {
              const v = (q && isNum(q[k])) ? Number(q[k]) : null;
              if(v == null) return '<span class="muted">—</span>';
              const cls = v > 0 ? 'up' : (v < 0 ? 'down' : 'muted');
              const flag = v > 0 ? '▲' : (v < 0 ? '▼' : '');
              return '<span class="' + cls + '" style="font-size:12px;white-space:nowrap">' + flag + ' ' + Math.abs(v).toFixed(2) + '%</span>';
            };
            return '<td class="num">' + cell('pct') + '</td><td class="num">' + cell('pct5') + '</td><td class="num">' + cell('monthPct') + '</td>';
          })() +
          '<td class="num">' + (() => { const q = quoteOf(h); return (q && isNum(q.pe)) ? Number(q.pe).toFixed(1) : '<span class="muted">—</span>'; })() + '</td>' +
          '<td>' + act + '</td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /* ============ 分类详情：全市场分类地图的某个分类 → 池内命中公司 ============ */
  function renderCls(){
    const sel = state.indCls || {};
    const sys = CLS_SYSTEMS.find(s => s.key === sel.sys) || CLS_SYSTEMS[0];
    const name = String(sel.name || '');
    const CI = clsIndex();
    const hits = hitsOf(sel.sys, name, CI);
    const st = statsForHits(hits);
    const b = CI.hasMap ? ((CI.idx[sys.key] || {})[name] || null) : null;
    const universe = b ? Object.keys(b.codes).length : null;
    const known = (DB.industries.list || []).some(i => sysKeyOf(i) === sel.sys && i.name === name);

    let h = '<span class="back-link" data-action="ind.clsBack">← 返回行业地图</span>';
    h += '<div class="page-head"><div><h1>🗂 ' + esc(name) +
      ' <span class="badge indigo">' + esc(sys.label) + '</span></h1>' +
      '<div class="muted">' +
        (universe != null ? '全市场 ' + universe + ' 家 · ' : '') +
        '池内命中 ' + hits.length + ' 家（财报池 ' + st.companies + ' · 估值池 ' + st.valTotal + '）' +
        (st.lastDate ? ' · 最新披露 ' + esc(st.lastDate) : '') +
      '</div></div>' +
      '<div class="head-actions">' +
        (known
          ? '<span class="badge green" title="已在研究台账中，可在行业地图点卡片进入">✓ 已收录研究条目</span>'
          : '<button class="btn sm" data-action="ind.collect" data-v="' + esc(name) + '" data-sys="' + sys.key + '" title="收录为独立研究条目（自己的逻辑/景气/跟踪指标/失效条件）">＋ 收录为研究条目</button>') +
      '</div></div>';

    h += '<div class="val-section"><div class="vs-head"><h3>🔥 池内公司最新财务数据</h3>' +
      '<span class="muted" style="font-size:12px">财报池取最新一期财报 · 估值池公司取最近季度录入数据与行情 · ' + hitSortDesc() + ' · 点列头可换列/换向</span></div>' +
      hitTable(hits) + '</div>';

    h += '<div class="muted" style="font-size:12px;margin-top:10px">' +
      (universe != null
        ? '该' + esc(sys.label) + '下全市场共 ' + universe + ' 家公司，上表仅展示财报池 / 估值池命中的 ' + hits.length + ' 家。' +
          '想覆盖更多公司：在「财报跟踪」抓取导入，或在「公司估值」添加。'
        : '尚未导入「分类地图」，无法按' + esc(sys.label) + '匹配。点右上「⬆ 导入分类地图」导入 scripts/fetch_industry_map.py 生成的 CSV。') +
      '</div>';
    return h;
  }

  function renderView(){
    if(state.indCls && state.indCls.name) return renderCls();
    if(state.indDetailId){
      const ind = findInd(state.indDetailId);
      if(ind) return renderDetail(ind);
      state.indDetailId = null;
    }
    return renderMap();
  }

  /* ================= 编辑表单 ================= */
  function openForm(ind){
    const isNew = !ind;
    ind = ind || indInit();
    const sel = (arr, cur, ph) =>
      '<option value="">' + ph + '</option>' + arr.map(x => '<option value="' + esc(x) + '"' + (cur === x ? ' selected' : '') + '>' + esc(x) + '</option>').join('');
    const curSys = sysKeyOf(ind);
    const body =
      '<div class="metric-help">分类体系：申万一/二/三级的名称对齐财报跟踪、公司估值的「行业 / 行业二级 / 行业三级」字段；「东财行业」「概念·主题」来自全市场分类地图（scripts/fetch_industry_map.py），按股票代码匹配。细分行业建议在上一级行业详情页的「🧩 细分行业」里点「＋ 收录」，名称最准。</div>' +
      '<div class="field"><label>分类体系 *</label><select name="sys">' +
        CLS_SYSTEMS.map(s => '<option value="' + s.key + '"' + (curSys === s.key ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>名称 *</label><input name="name" type="text" required value="' + esc(ind.name) + '" list="indNames" placeholder="如：电子 / 半导体 / 集成电路制造 / AI算力"></div>' +
      '<datalist id="indNames">' +
        Array.from(new Set([]
          .concat(LEVELS.reduce((a, l) => a.concat(Object.keys(earnStatsByIndustry(l.v))), []))
          .concat(LEVELS.reduce((a, l) => a.concat(Object.keys(valStatsByIndustry(l.v))), []))
          .concat((DB.industries.list || []).map(i => i.name))
          .concat(['em', 'concept'].reduce((a, k) => a.concat(clsListFor(k).slice(0, 300).map(x => x.name)), []))
        )).filter(n => n && n !== '(未分类)').slice(0, 1200).map(n => '<option value="' + esc(n) + '">').join('') +
      '</datalist>' +
      '<div class="field"><label>产业链定位</label><select name="chain">' + sel(CHAINS, ind.chain, '未标注') + '</select></div>' +
      '<div class="field"><label>生命周期</label><select name="lifecycle">' + sel(LIFECYCLES, ind.lifecycle, '未标注') + '</select></div>' +
      '<div class="field"><label>政策态度</label><select name="policy">' + sel(POLICIES, ind.policy, '未标注') + '</select></div>' +
      '<div class="field"><label>景气度</label><select name="prosperity">' +
        '<option value="">未评</option>' +
        PROSPERITY.map(p => '<option value="' + p.v + '"' + (ind.prosperity === p.v ? ' selected' : '') + '>' + p.v + ' · ' + p.label + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>景气度依据（一句话，注明数据来源）</label><input name="prosperityNote" type="text" value="' + esc(ind.prosperityNote) + '" placeholder="如：硅料价格连续 8 周企稳回升（PVInfoLink 0912）"></div>' +
      '<div class="field"><label>投资逻辑（为什么现在研究它，支持 Markdown）</label><textarea name="thesis" rows="5" placeholder="需求端…供给端…格局…当前处于什么位置…">' + esc(ind.thesis) + '</textarea></div>' +
      '<div class="field"><label>核心跟踪指标（用、/、分隔）</label><input name="drivers" type="text" value="' + esc(ind.drivers.join('、')) + '" placeholder="如：硅料价格、N型电池溢价、组件出口量"></div>' +
      '<div class="field"><label>行业逻辑失效条件（每行一条，可证伪）</label><textarea name="invalidConds" rows="3" placeholder="如：光伏装机同比连续两个季度转负">' + esc(ind.invalidConds.join('\n')) + '</textarea></div>' +
      '<div class="field" style="display:flex;gap:6px;align-items:center"><input type="checkbox" name="tracked"' + (ind.tracked ? ' checked' : '') + ' id="indTrackedChk"><label for="indTrackedChk" style="margin:0"> ⭐ 重点跟踪（在地图中优先展示）</label></div>' +
      (isNew ? '' : '<input type="hidden" name="id" value="' + ind.id + '">');
    openModal(isNew ? '➕ 新增行业' : '✎ 编辑行业 · ' + ind.name, body, 'ind.save');
  }

  /* ================= 分类地图 CSV 导入 ================= */
  // 轻量 CSV 解析（支持引号包裹 / 转义引号 / CRLF）
  function parseCsvLines(text){
    const s = String(text || '').replace(/^\ufeff/, '');
    const rows = [];
    let row = [], cur = '', inQ = false;
    for(let i = 0; i < s.length; i++){
      const ch = s[i];
      if(inQ){
        if(ch === '"'){
          if(s[i + 1] === '"'){ cur += '"'; i++; } else inQ = false;
        } else cur += ch;
      } else if(ch === '"'){ inQ = true; }
      else if(ch === ','){ row.push(cur); cur = ''; }
      else if(ch === '\n' || ch === '\r'){
        if(ch === '\r' && s[i + 1] === '\n') i++;
        row.push(cur); cur = '';
        if(row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else cur += ch;
    }
    row.push(cur);
    if(row.length > 1 || row[0] !== '') rows.push(row);
    return rows;
  }
  function importMapCsv(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const grid = parseCsvLines(reader.result);
          if(!grid.length){ toast('⚠️ 文件为空'); return; }
          const hdr = grid[0].map(s => String(s || '').trim());
          const col = n => hdr.indexOf(n);
          const iCode = col('股票代码');
          if(iCode < 0){ toast('⚠️ 未识别到「股票代码」列，请导入 fetch_industry_map.py 生成的地图 CSV'); return; }
          const iName = col('股票名称'), iEm = col('东财行业'), iS1 = col('申万一级'),
                iS2 = col('申万二级'), iS3 = col('申万三级'), iCp = col('概念标签');
          const rows = [];
          for(let i = 1; i < grid.length; i++){
            const g = grid[i];
            const code = normCode6(g[iCode]);
            if(!code) continue;
            rows.push({
              code,
              name: iName >= 0 ? String(g[iName] || '').trim() : '',
              em: iEm >= 0 ? String(g[iEm] || '').trim() : '',
              sw1: iS1 >= 0 ? String(g[iS1] || '').trim() : '',
              sw2: iS2 >= 0 ? String(g[iS2] || '').trim() : '',
              sw3: iS3 >= 0 ? String(g[iS3] || '').trim() : '',
              concepts: iCp >= 0 ? String(g[iCp] || '').trim() : '',
            });
          }
          if(!rows.length){ toast('⚠️ 未解析到有效数据行'); return; }
          DB.industryMap = { rows, importedAt: dateStr() };
          save(); render();
          toast('✅ 已导入分类地图 ' + rows.length + ' 家公司（申万/东财行业/概念）');
        } catch(e){
          toast('⚠️ 解析失败：' + e.message);
        }
      };
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  }
  /* 导入 scripts/build_ai_chain.py 生成的 AI 产业链细分行业 JSON。
   * 条目格式（与 indInit 兼容）：{ name, level, sys, chain, thesis, members:[6位代码] }
   * 合并策略：按 name 去重——已存在条目时询问一次：替换成员（AI JSON 为准，清除旧分类残留）
   * 或仅合并（只增不减）；不存在则新建。 */
  function importAiChainJson(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const arr = JSON.parse(reader.result);
          if(!Array.isArray(arr)){ toast('⚠️ 文件应为「AI产业链细分行业」JSON 数组'); return; }
          const entries = arr.map(e => ({
            name: String(e && e.name || '').trim(),
            codes: (Array.isArray(e.members) ? e.members : []).map(c => normCode6(c)).filter(Boolean),
            level: e && e.level || 1, sys: e && e.sys || 'sw1',
            chain: e && e.chain || '', thesis: e && e.thesis || '',
          })).filter(e => e.name);
          if(!entries.length){ toast('⚠️ 未解析到有效细分行业条目'); return; }
          const overlap = entries.filter(e => (DB.industries.list || []).some(i => i.name === e.name)).length;
          // 同名条目已存在：选「替换」（以 AI JSON 为准，清除旧的分类残留）或「合并」（只增不减）
          const replace = overlap > 0 &&
            confirm('发现 ' + overlap + ' 个同名细分行业条目。\n\n【确定】= 以本次导入替换其成员（AI 产业链 JSON 为准，清除旧的错误分类；此前手动添加的成员也会被移除）\n【取消】= 仅合并（旧的错误成员不会被清除）');
          let added = 0, merged = 0, members = 0;
          entries.forEach(e => {
            const ex = (DB.industries.list || []).find(i => i.name === e.name);
            if(ex){
              if(replace){
                ex.members = e.codes;
                if(e.chain) ex.chain = e.chain;
                if(e.thesis) ex.thesis = e.thesis;
              } else {
                ex.members = ex.members || [];
                const uniq = new Map(ex.members.map(c => [c, 1]));
                e.codes.forEach(c => { if(!uniq.has(c)){ uniq.set(c, 1); } });
                ex.members = Array.from(uniq.keys());
                if(e.chain && !ex.chain) ex.chain = e.chain;
                if(e.thesis && !ex.thesis) ex.thesis = e.thesis;
              }
              ex.updated = dateStr();
              merged++;
            } else {
              const ind = indInit(e.name, e.level, e.sys);
              ind.members = e.codes;
              if(e.chain) ind.chain = e.chain;
              if(e.thesis) ind.thesis = e.thesis;
              DB.industries.list.push(ind);
              added++;
            }
            members += e.codes.length;
          });
          save(); render();
          toast('✅ 导入AI产业链（' + (replace ? '替换' : '合并') + '）：新增 ' + added + ' 个 · 合并 ' + merged + ' 个 · 记入公司 ' + members + ' 家/次');
        } catch(e){
          toast('⚠️ 解析失败：' + e.message);
        }
      };
      reader.readAsText(file, 'utf-8');
    };
    input.click();
  }

  /* ================= 注册 ================= */
  Register.module({
    view: 'industries',
    nav: { ico:'🏭', label:'行业研究', group:'投资追踪' },
    seed: seed,
    ensure: ensure,
    render: renderView,
    actions: {
      'ind.add': () => openForm(null),
      'ind.edit': el => openForm(findInd(el.dataset.id)),
      'ind.open': el => { state.indDetailId = el.dataset.id; state.indCls = null; window.scrollTo(0, 0); render(); },
      'ind.back': () => { state.indDetailId = null; window.scrollTo(0, 0); render(); },
      // 全市场分类地图
      'ind.openCls': el => {
        state.indCls = { sys: String(el.dataset.sys || 'em'), name: String(el.dataset.v || '') };
        state.indDetailId = null;
        window.scrollTo(0, 0); render();
      },
      'ind.clsBack': () => { state.indCls = null; window.scrollTo(0, 0); render(); },
      'ind.clsSys': el => { state.indClsSys = el.dataset.v; state.indClsAll = false; render(); },
      'ind.clsAll': () => { state.indClsAll = !state.indClsAll; render(); },
      'ind.mapImport': () => importMapCsv(),
      'ind.aiImport': () => importAiChainJson(),
      'ind.del': el => {
        const ind = findInd(el.dataset.id); if(!ind) return;
        if(!confirm('确认删除行业「' + ind.name + '」？聚合统计不受影响（财报/估值数据不动）。')) return;
        DB.industries.list = DB.industries.list.filter(i => i.id !== ind.id);
        state.indDetailId = null;
        save(); render();
        toast('🗑 已删除「' + ind.name + '」');
      },
      'ind.toggleTracked': el => {
        const ind = findInd(el.dataset.id); if(!ind) return;
        ind.tracked = !ind.tracked; ind.updated = dateStr();
        save(); render();
      },
      // 手动导入财报池公司：清单点「导入」→ 加入条目 members；移除
      'ind.memberSearch': el => {
        const ind = findInd(el.dataset.id); if(!ind) return;
        openModal('搜索导入财报池公司 · ' + ind.name, memberModalBody(ind, clsIndex()), '', null, true);
      },
      'ind.memberAdd': el => {
        const ind = findInd(el.dataset.id); if(!ind) return;
        const code = normCode6(el.dataset.code); if(!code) return;
        ind.members = ind.members || [];
        if(ind.members.indexOf(code) >= 0){ toast('ℹ️ 「' + codeNameOf(code, clsIndex()) + '」已导入过'); return; }
        ind.members.push(code);
        ind.updated = dateStr();
        save(); closeModal(); render();
        toast('✅ 已把「' + codeNameOf(code, clsIndex()) + '」导入「' + ind.name + '」');
      },
      'ind.memberDel': el => {
        const ind = findInd(el.dataset.id); if(!ind) return;
        ind.members = (ind.members || []).filter(c => c !== el.dataset.code);
        save(); render();
        toast('已移出「' + ind.name + '」（财报/估值数据不受影响）');
      },
      'ind.collect': el => {
        const name = String(el.dataset.v || '').trim(); if(!name) return;
        const sysKey = String(el.dataset.sys || '') ||
          (el.dataset.lv ? 'sw' + (Number(el.dataset.lv) || 1) : 'sw1');   // 兼容旧 data-lv
        const L = sysKey.indexOf('sw') === 0 ? (Number(sysKey.slice(2)) || 1) : 1;
        if((DB.industries.list || []).some(i => i.name === name && sysKeyOf(i) === sysKey)){
          toast('ℹ️ 「' + name + '」已收录'); return;
        }
        DB.industries.list.push(indInit(name, L, sysKey));
        save(); render();
        const lb = (CLS_SYSTEMS.find(s => s.key === sysKey) || {}).label || sysKey;
        toast('📥 已收录「' + name + '」（' + lb + '），点卡片补行业逻辑');
      },
      'ind.sort': el => { state.indSort = el.dataset.v; render(); },
      'ind.level': el => { state.indLevelFilter = el.dataset.v; render(); },
      // 命中公司表列排序（行业详情 / 分类详情共用一套状态）
      'ind.hitSort': el => {
        const k = el.dataset.key;
        if((state.indHitSort || 'rev') === k){
          state.indHitDir = (state.indHitDir || 'desc') === 'asc' ? 'desc' : 'asc';
        } else {
          state.indHitSort = k;
          // 文本列默认升序，数值列默认降序（大的在前）
          state.indHitDir = (k === 'name' || k === 'quarter' || k === 'date') ? 'asc' : 'desc';
        }
        render();
      },
      'ind.hitLimit': el => {
        state.indHitLimit = el.dataset.v === 'all' ? 'all' : parseInt(el.dataset.v, 10);
        render();
      },
      'ind.candAll': () => { state.indCandAll = !state.indCandAll; render(); },
      'ind.toggleHide': () => { state.indHideUntracked = !state.indHideUntracked; render(); },
      // 联动：临时按「命中公司代码」锁定跳转到财报跟踪 / 公司估值（比按行业名精确匹配更可靠，规避名称口径差异）
      'ind.goEarnings': el => {
        const name = el.dataset.v;
        const codes = String(el.dataset.codes || '').split(',').map(s => s.trim()).filter(Boolean);
        state.earnLock = { codes: codes, label: name };
        state.indDetailId = null;
        window.scrollTo(0, 0);
        if(state.view === 'earnings'){ render(); } else { location.hash = '#/earnings'; }
      },
      'ind.goValuation': el => {
        const name = el.dataset.v;
        const codes = String(el.dataset.codes || '').split(',').map(s => s.trim()).filter(Boolean);
        state.valLock = { codes: codes, label: name };
        state.indDetailId = null;
        window.scrollTo(0, 0);
        if(state.view === 'valuation'){ render(); } else { location.hash = '#/valuation'; }
      },
      'ind.openCompany': el => {
        const c = (DB.valuation.companies || []).find(x => x.id === el.dataset.id); if(!c) return;
        state.valCompanyId = c.id;
        state.indDetailId = null;
        window.scrollTo(0, 0);
        if(state.view === 'valuation'){ render(); } else { location.hash = '#/valuation'; }
      },
      // 命中表「➕ 加入估值」：与财报跟踪的 earn.addVal 同构，另带出申万一/二/三级行业
      'ind.addVal': el => {
        const d = el.dataset;
        const ticker = String(d.ticker || '').trim();
        if(!ticker){ toast('⚠️ 缺少股票代码'); return; }
        const code6 = String(d.code || '').trim() || (ticker.match(/(\d{6})/) || [])[1] || '';
        if((DB.valuation.companies || []).some(c => String(c.ticker || '').indexOf(code6) >= 0)){
          toast('ℹ️ ' + (d.name || ticker) + ' 已在估值池中'); return;
        }
        DB.valuation.companies.push({
          id: uid(),
          name: d.name || ticker,
          ticker,
          market: 'A股',
          board: ['主板', '创业板', '科创板', '北交所'].includes(d.board) ? d.board : '',
          industry: d.ind || '',
          industryL2: d.l2 || '',
          industryL3: d.l3 || '',
          companyType: d.type || '',
          financials: [], valuations: [], investments: [], research: '',
        });
        save(); render();
        toast('✅ 已将 ' + (d.name || ticker) + ' 加入估值跟踪');
      },
    },
    changes: {
      // 分类地图搜索框（change 事件 = 回车或失焦后重渲染）
      'ind.clsQ': el => { state.indClsQ = el.value; state.indClsAll = false; render(); },
      // 景气度快速下拉（详情页）：即存即渲染
      'ind.setProsperity': el => {
        const ind = findInd(el.dataset.id); if(!ind) return;
        ind.prosperity = el.value === '' ? null : parseInt(el.value, 10);
        ind.updated = dateStr();
        save(); render();
        toast(ind.prosperity == null ? '景气度已清空' : '景气度 → ' + PROSPERITY.find(p => p.v === ind.prosperity).label);
      },
    },
    forms: {
      'ind.save': fd => {
        const name = String(fd.get('name') || '').trim();
        if(!name){ alert('请填写行业名称'); return; }
        const id = fd.get('id');
        let ind = id ? findInd(id) : null;
        if(!ind){
          ind = indInit(name);
          DB.industries.list.push(ind);
        }
        ind.name = name;
        const sysRaw = String(fd.get('sys') || '');
        if(CLS_SYSTEMS.some(s => s.key === sysRaw)) ind.sys = sysRaw;
        ind.level = sysKeyOf(ind) === 'sw2' ? 2 : sysKeyOf(ind) === 'sw3' ? 3 : 1;
        ind.chain = String(fd.get('chain') || '');
        ind.lifecycle = String(fd.get('lifecycle') || '');
        ind.policy = String(fd.get('policy') || '');
        const p = String(fd.get('prosperity') || '');
        ind.prosperity = p === '' ? null : parseInt(p, 10);
        ind.prosperityNote = String(fd.get('prosperityNote') || '').trim();
        ind.thesis = String(fd.get('thesis') || '').trim();
        ind.drivers = String(fd.get('drivers') || '').split(/[、,，/]/).map(s => s.trim()).filter(Boolean);
        ind.invalidConds = String(fd.get('invalidConds') || '').split('\n').map(s => s.trim()).filter(Boolean);
        ind.tracked = !!fd.get('tracked');
        ind.updated = dateStr();
        save(); render();
        toast('✅ 已保存「' + ind.name + '」');
      },
    },
  });
})();
