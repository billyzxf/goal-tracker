/* ================= 共享财务库 FinStats（写路径统一层） =================
 * 定位：公司估值 companies[].financials 与 财报跟踪 DB.earnings.rows 同源（东财财报），
 * 本模块把「财务数据的写入」统一到 DB.finstats（每行 = 公司 × 报告期的全指标快照），
 * 两个板块是它的消费方。读路径一行不改（Repo.earnRowsOf / c.financials 照旧）。
 *
 * 数据流：
 *   导入/编辑钩子 --ingest--> DB.finstats（同侧镜像，幂等）
 *   「⇒ 同步」按钮 ----------> projectToValuation / projectToEarnings（显式跨模块投影）
 *   ensure(migrate) ---------> 存量数据一次性灌入（估值优先、空位填充，重复运行是固定点）
 *
 * 设计要点：
 *   - 去重键 = 6位代码 + '|' + reportDate（quarter 与 reportDate 一一对应）
 *   - 值一律 Number 化存储；投影回 earnings 时 String() 化，避免 diff 假差异
 *   - 合并语义与两侧既有导入一致：新值覆盖非空、空位保留旧值、src 记来源
 *   - 报告期三态兼容：'2026Q2' | '2026-06-30' | '2026-06'（normPeriod 互推）
 *
 * 依赖：core.js 的 uid/dateStr/toast/save（调用时才引用）；Register（模块注册）。
 * 注意：本模块必须晚于 earnings/valuation 完成数据 seed——invest.html 中插在
 * valuation.js 之后、company.js 之前，保证 ensure 迁移时两源数据已就绪。
 */
window.FinStats = (function(){

  /* ---------- 指标 key 并集（估值 METRICS 19 项 + salesCash） ---------- */
  const METRIC_KEYS = [
    'totalAssets', 'equity', 'revenue', 'revenueYoy', 'grossProfit', 'netProfit',
    'deductedNetProfit', 'deductedNetProfitYoy', 'opCashFlow', 'salesCash', 'capex',
    'roe', 'grossMargin', 'netMargin', 'assetLiabRatio',
    'accountsReceivable', 'inventory', 'contractLiab', 'cash', 'totalAssetTurnover',
  ];

  /* 财报跟踪中文列 ↔ 英文 key（行 key 为中文列名，与 fetch_earnings.py 表头一致） */
  const EARN_COL_MAP = {
    '营业收入': 'revenue', '营收同比': 'revenueYoy', '毛利润': 'grossProfit',
    '净利润': 'netProfit', '扣非净利润': 'deductedNetProfit', '扣非净利同比': 'deductedNetProfitYoy',
    '经营现金流': 'opCashFlow', '销售收现': 'salesCash', '资本开支': 'capex',
    'ROE': 'roe', '毛利率': 'grossMargin',
  };
  const EARN_COL_REV = Object.keys(EARN_COL_MAP).reduce((m, cn) => { m[EARN_COL_MAP[cn]] = cn; return m; }, {});
  /* 公司维度 meta 列（存 companies 表，不随报告期重复） */
  const EARN_META_MAP = {
    '公司名称': 'name', '行业': 'industry', '行业二级': 'industryL2', '行业三级': 'industryL3',
    '板块': 'board', '林奇类型': 'lynchType',
  };
  const EARN_META_REV = Object.keys(EARN_META_MAP).reduce((m, cn) => { m[EARN_META_MAP[cn]] = cn; return m; }, {});

  /* ---------- 小工具 ---------- */
  function normCode6(s){ const m = String(s || '').match(/(\d{6})/); return m ? m[1] : ''; }
  function isEmptyVal(v){ return v === undefined || v === null || v === '' || (typeof v === 'number' && isNaN(v)); }
  function toNum(v){
    if(isEmptyVal(v)) return null;
    const n = Number(String(v).replace(/[,\s%]/g, ''));
    return isNaN(n) ? null : n;
  }
  /* 报告期归一：'2026Q2' | '2026-06-30' | '2026-06' → { quarter:'2026Q2', reportDate:'2026-06-30' }；非法 → null */
  function normPeriod(s){
    const str = String(s || '').trim();
    let y, q;
    let m = str.match(/^(20\d{2})[-/](\d{1,2})/);            // '2026-06-30' / '2026-06' / '2026/6/30'
    if(m){ y = +m[1]; q = Math.floor((+m[2] - 1) / 3) + 1; }
    else {
      m = str.match(/^(20\d{2})Q([1-4])$/i);                 // '2026Q2' / '2026q2'
      if(!m) return null;
      y = +m[1]; q = +m[2];
    }
    if(q < 1 || q > 4) return null;
    const reportDate = y + '-' + ('0' + (q * 3)).slice(-2) + '-' + ((q === 1 || q === 4) ? '31' : '30');
    return { quarter: y + 'Q' + q, reportDate: reportDate };
  }

  /* ---------- 数据访问 ---------- */
  function dbBag(){
    if(typeof DB === 'undefined' || !DB) return null;
    if(!DB.finstats || typeof DB.finstats !== 'object') DB.finstats = { version: 1, updatedAt: '', companies: {}, rows: [] };
    if(!Array.isArray(DB.finstats.rows)) DB.finstats.rows = [];
    if(!DB.finstats.companies || typeof DB.finstats.companies !== 'object') DB.finstats.companies = {};
    return DB.finstats;
  }
  function rows(){ const b = dbBag(); return b ? b.rows : []; }
  function metas(){ const b = dbBag(); return b ? b.companies : {}; }
  /* 懒构建索引 Map('code6|reportDate' → row)；rows 引用未变时复用缓存 */
  function index(){
    const b = dbBag(); if(!b) return new Map();
    if(index.rows === b.rows) return index.m;
    const m = new Map();
    b.rows.forEach(r => { m.set(r.code6 + '|' + r.reportDate, r); });
    index.m = m; index.rows = b.rows;
    return m;
  }
  function metaOf(code6){
    const mt = metas();
    const c6 = normCode6(code6);
    if(!c6) return { ticker:'', name:'', industry:'', industryL2:'', industryL3:'', board:'', lynchType:'' };
    return mt[c6] || (mt[c6] = { ticker:'', name:'', industry:'', industryL2:'', industryL3:'', board:'', lynchType:'' });
  }

  /* ---------- 源数据 → 规范化部分字段 ---------- */
  /* 财报跟踪中文行 → 部分字段（指标 + meta + 披露/报告期） */
  function fromEarningsRow(r){
    if(!r) return null;
    const c6 = normCode6(r['股票代码']); if(!c6) return null;
    const p = normPeriod(r['报告期']) || normPeriod(r['季度']); if(!p) return null;
    const part = { code6: c6, reportDate: p.reportDate, quarter: p.quarter, disclosedAt: String(r['披露日期'] || '').trim() };
    Object.keys(EARN_COL_MAP).forEach(cn => {
      const v = toNum(r[cn]);
      if(v != null) part[EARN_COL_MAP[cn]] = v;
    });
    Object.keys(EARN_META_MAP).forEach(cn => {
      const v = String(r[cn] || '').trim();
      if(v) part[EARN_META_MAP[cn]] = v;
    });
    part.tickerMeta = String(r['股票代码'] || '').trim();
    return part;
  }
  /* 估值公司 + financial 元素 → 部分字段（指标 key 直通 + note） */
  function fromValuationFin(c, f){
    if(!c || !f) return null;
    const p = normPeriod(f.quarter); if(!p) return null;
    const c6 = normCode6(c.ticker); if(!c6) return null;
    const part = { code6: c6, reportDate: p.reportDate, quarter: p.quarter,
      disclosedAt: '', name: String(c.name || '').trim(), tickerMeta: String(c.ticker || '').trim() };
    METRIC_KEYS.forEach(k => {
      const v = toNum(f[k]);
      if(v != null) part[k] = v;
    });
    if(f.note) part.note = String(f.note);
    return part;
  }

  /* ---------- 核心：upsert 合并（非空覆盖、空位填充、src 并集） ----------
   * fillOnly=true（迁移专用）：已有值的字段一律不动（估值优先，先到先得）。 */
  function upsertFinstats(list, srcTag, fillOnly){
    const b = dbBag(); if(!b || !Array.isArray(list)) return { added: 0, updated: 0 };
    const idx = index();
    let added = 0, updated = 0;
    list.forEach(part => {
      if(!part || !part.code6 || !part.reportDate) return;
      const key = part.code6 + '|' + part.reportDate;
      const row = idx.get(key);
      if(row){
        let changed = false;
        Object.keys(part).forEach(k => {
          if(k === 'code6' || k === 'reportDate' || k === 'tickerMeta') return;
          const v = part[k];
          if(isEmptyVal(v)) return;                    // 空位保留旧值
          if(fillOnly && !isEmptyVal(row[k])) return;  // 迁移模式：已有值不动（估值优先）
          if(String(row[k] == null ? '' : row[k]) !== String(v)){ row[k] = v; changed = true; }
        });
        // meta 一并合并（name/industry/... 与 ticker）
        if(part.name || part.industry || part.industryL2 || part.industryL3 || part.board || part.lynchType || part.tickerMeta){
          const mt = metaOf(part.code6);
          ['name', 'industry', 'industryL2', 'industryL3', 'board', 'lynchType'].forEach(k => {
            const v = part[k];
            if(!isEmptyVal(v) && mt[k] !== v){ mt[k] = v; changed = true; }
          });
          if(part.tickerMeta && mt.ticker !== part.tickerMeta){ mt.ticker = part.tickerMeta; changed = true; }
        }
        if(srcTag && !row.src.includes(srcTag)){ row.src.push(srcTag); changed = true; }
        if(changed) updated++;
      } else {
        const nr = { code6: part.code6, reportDate: part.reportDate, quarter: part.quarter,
          disclosedAt: part.disclosedAt || '', note: part.note || '', src: srcTag ? [srcTag] : [] };
        METRIC_KEYS.forEach(k => { nr[k] = (part[k] != null && !isEmptyVal(part[k])) ? part[k] : null; });
        b.rows.push(nr);
        idx.set(key, nr);
        if(part.name || part.industry || part.tickerMeta){
          const mt = metaOf(part.code6);
          ['name', 'industry', 'industryL2', 'industryL3', 'board', 'lynchType'].forEach(k => {
            if(!isEmptyVal(part[k])) mt[k] = part[k];
          });
          if(part.tickerMeta) mt.ticker = part.tickerMeta;
        }
        added++;
      }
    });
    if(added || updated) b.updatedAt = dateStr();
    return { added: added, updated: updated };
  }

  /* ---------- 投影：finstats → 估值池 financials（按 quarter 合并，非空覆盖，保留 id） ---------- */
  function projectToValuation(rowsIn){
    const list = Array.isArray(rowsIn) ? rowsIn : rows();
    const cs = (DB.valuation && DB.valuation.companies) || [];
    const touched = new Set();
    let addedQ = 0, updatedQ = 0, skipped = 0;
    // 按公司分组，减少重复查找
    const byC6 = new Map();
    cs.forEach(c => { const c6 = normCode6(c.ticker); if(c6) byC6.set(c6, c); });
    list.forEach(r => {
      const target = byC6.get(r.code6);
      if(!target){ skipped++; return; }
      if(!Array.isArray(target.financials)) target.financials = [];
      // 兼容历史 quarter 格式（'2026Q2' / '2026-06' / '2026-03'）：按归一化报告期匹配，避免同季重复建行
      const exist = target.financials.find(f => {
        const fp = normPeriod(f.quarter);
        return fp && fp.reportDate === r.reportDate;
      });
      if(exist){
        let changed = false;
        METRIC_KEYS.forEach(k => {
          const v = r[k];
          if(isEmptyVal(v)) return;                    // 空字段不清空已有值
          if(Number(exist[k]) !== Number(v)){ exist[k] = v; changed = true; }
        });
        if(r.note && !exist.note){ exist.note = r.note; changed = true; }
        if(changed){
          updatedQ++;
          exist.id = exist.id || uid();
          target.updated = dateStr();
          touched.add(r.code6);
        }
      } else {
        const nf = { id: uid(), quarter: r.quarter, note: r.note || '' };
        METRIC_KEYS.forEach(k => { nf[k] = isEmptyVal(r[k]) ? null : r[k]; });
        target.financials.push(nf);
        target.financials.sort((a, b) => String(a.quarter).localeCompare(String(b.quarter)));
        target.updated = dateStr();
        addedQ++;
        touched.add(r.code6);
      }
    });
    return { companies: touched.size, addedQ: addedQ, updatedQ: updatedQ, skipped: skipped };
  }

  /* ---------- 投影：finstats → 财报跟踪 rows（中文 key、String 化、rowKey upsert） ---------- */
  function earnRowKey(r){
    const c6 = normCode6(r['股票代码']);
    return (c6 || String(r['股票代码'] || '').trim()) + '|' + String(r['季度'] || '').trim();
  }
  function toEarningsRow(r){
    const mt = metas()[r.code6] || {};
    const out = { '股票代码': mt.ticker || '', '公司名称': mt.name || '',
      '行业': mt.industry || '', '行业二级': mt.industryL2 || '', '行业三级': mt.industryL3 || '',
      '板块': mt.board || '', '林奇类型': mt.lynchType || '',
      '披露日期': r.disclosedAt || '', '报告期': r.reportDate, '季度': r.quarter };
    Object.keys(EARN_COL_MAP).forEach(cn => {
      const v = r[EARN_COL_MAP[cn]];
      out[cn] = isEmptyVal(v) ? '' : String(v);
    });
    return out;
  }
  function projectToEarnings(rowsIn){
    if(typeof DB === 'undefined' || !DB || !DB.earnings || !Array.isArray(DB.earnings.rows)) return { added: 0, updated: 0, unchanged: 0 };
    const list = (Array.isArray(rowsIn) ? rowsIn : rows()).filter(r => {
      // 只投影「财报跟踪列有内容」的行：纯估值侧指标（总资产等）对跟踪表无意义
      return Object.keys(EARN_COL_MAP).some(cn => !isEmptyVal(r[EARN_COL_MAP[cn]]));
    });
    let added = 0, updated = 0;
    const idx = new Map(DB.earnings.rows.map(r => [earnRowKey(r), r]));
    list.forEach(fr => {
      const nr = toEarningsRow(fr);
      const old = idx.get(earnRowKey(nr));
      if(old){
        let changed = false;
        Object.keys(nr).forEach(k => {
          const v = nr[k];
          if(v === '' || v == null) return;            // 空位保留旧值
          if(String(old[k] == null ? '' : old[k]) !== String(v)){ old[k] = v; changed = true; }
        });
        if(changed) updated++;
      } else {
        DB.earnings.rows.push(nr);
        idx.set(earnRowKey(nr), nr);
        added++;
      }
    });
    if(added || updated) DB.earnings.importedAt = dateStr();
    return { added: added, updated: updated, unchanged: list.length - added - updated };
  }

  /* ---------- 钩子：导入/编辑镜像写入（幂等） ---------- */
  function ingestValuation(co, fins){
    if(!co || !Array.isArray(fins)) return { added: 0, updated: 0 };
    return upsertFinstats(fins.map(f => fromValuationFin(co, f)).filter(Boolean), 'val');
  }
  function ingestEarnings(rowsIn){
    if(!Array.isArray(rowsIn)) return { added: 0, updated: 0 };
    return upsertFinstats(rowsIn.map(fromEarningsRow).filter(Boolean), 'earn');
  }

  /* ---------- 删除钩子：只回收「无对方背书」的行 ---------- */
  function onValuationDelete(co, f){
    const b = dbBag(); if(!b || !co || !f) return;
    const p = normPeriod(f.quarter); const c6 = normCode6(co.ticker);
    if(!p || !c6) return;
    const row = index().get(c6 + '|' + p.reportDate);
    if(row && !row.src.includes('earn')){
      b.rows.splice(b.rows.indexOf(row), 1);
    }
  }
  function onEarningsClear(){
    const b = dbBag(); if(!b) return;
    b.rows = b.rows.filter(r => r.src && r.src.includes('val'));
  }

  /* ---------- 一键互转 ---------- */
  /* 财报跟踪筛选行 → finstats → 投影到估值池（只投这些公司） */
  function transferToValuation(earnRows){
    if(!Array.isArray(earnRows) || !earnRows.length) return { matched: 0, addedQ: 0, updatedQ: 0, skipped: 0 };
    ingestEarnings(earnRows);
    const c6s = new Set(earnRows.map(r => normCode6(r['股票代码'])).filter(Boolean));
    const rel = rows().filter(r => c6s.has(r.code6));
    const res = projectToValuation(rel);
    return { matched: res.companies, addedQ: res.addedQ, updatedQ: res.updatedQ, skipped: res.skipped };
  }
  /* 估值池全部 financials → finstats → 投影到财报跟踪 */
  function transferToEarnings(){
    const cs = (DB.valuation && DB.valuation.companies) || [];
    const all = [];
    cs.forEach(c => (c.financials || []).forEach(f => { const p = fromValuationFin(c, f); if(p) all.push(p); }));
    upsertFinstats(all, 'val');
    return projectToEarnings();
  }

  /* ---------- ensure 幂等迁移（估值优先：先 val 后 earn，先到占位、后到填空位） ---------- */
  function migrate(db){
    if(!db || typeof db !== 'object') return;
    if(!db.finstats || typeof db.finstats !== 'object') db.finstats = { version: 1, updatedAt: '', companies: {}, rows: [] };
    if(!Array.isArray(db.finstats.rows)) db.finstats.rows = [];
    if(!db.finstats.companies || typeof db.finstats.companies !== 'object') db.finstats.companies = {};
    const vs = (db.valuation && db.valuation.companies) || [];
    vs.forEach(c => {
      (Array.isArray(c.financials) ? c.financials : []).forEach(f => {
        const p = fromValuationFin(c, f); if(p) upsertFinstats([p], 'val');
      });
    });
    const es = (db.earnings && db.earnings.rows) || [];
    if(Array.isArray(es) && es.length){
      upsertFinstats(es.map(fromEarningsRow).filter(Boolean), 'earn', true);   // fillOnly：只填估值没给的空位
    }
  }

  return {
    METRIC_KEYS: METRIC_KEYS, EARN_COL_MAP: EARN_COL_MAP, EARN_COL_REV: EARN_COL_REV,
    normCode6: normCode6, normPeriod: normPeriod,
    rows: rows, metas: metas, index: index, metaOf: metaOf,
    fromEarningsRow: fromEarningsRow, fromValuationFin: fromValuationFin,
    upsertFinstats: upsertFinstats,
    projectToValuation: projectToValuation, projectToEarnings: projectToEarnings,
    ingestValuation: ingestValuation, ingestEarnings: ingestEarnings,
    onValuationDelete: onValuationDelete, onEarningsClear: onEarningsClear,
    transferToValuation: transferToValuation, transferToEarnings: transferToEarnings,
    migrate: migrate,
  };
})();

/* 模块注册：seed 提供数据骨架（ensure 自动建库），无 nav → 侧边栏不渲染 */
Register.module({
  view: 'finstats',
  seed: () => ({ version: 1, updatedAt: '', companies: {}, rows: [] }),
  ensure: (db, sv) => { window.FinStats.migrate(db); },
});
