/* ================= 统一数据访问层（Repo） =================
 * 定位：投资研究各模块跨模块查找/聚合的「唯一入口」。
 *
 * 背景：此前 earnings.js / swing.js / industries.js / company.js / valuation.js
 * 各自维护一份「按代码/代码查公司」「按代码过滤财报行」「代码规范化」实现，
 * 口径相近但重复四处，改一处漏三处。本模块把公共查找收敛为一份实现，
 * 各模块的原函数改为一行转发（函数签名与行为不变）。
 *
 * 设计原则：
 *   - 纯只读聚合：本模块只读 DB、只做查找/派生计算，不写库、不渲染、不弹窗。
 *   - 未来切 HTTP API（阶段四预留）：前端只需把本模块的实现换成 fetch，
 *     各模块继续调用 Repo.xxx() 即可，零改动。
 *   - 归一键统一为 6 位代码 normCode6：A股代码在任何写法（002008.SZ / 002008 /
 *     sz002008）下都取同一段 6 位数字；完整代码推断规则与 company.js 一致。
 *
 * 依赖 core.js 全局：DB（boot 后才可用——本模块所有函数都在调用时才读 DB）。
 */
window.Repo = (function(){
  const SCHEMA = 1;   // exportAll 输出结构版本（进 _meta.schema，便于 pandas 侧兼容判断）

  /* ---------- 代码规范化（全站统一口径） ---------- */
  // 提取 6 位数字代码：'002008.SZ' / 'sz002008' / ' 002008 ' → '002008'
  function normCode6(s){
    const m = String(s || '').match(/(\d{6})/);
    return m ? m[1] : '';
  }
  // 代码统一大写去空格：'002008.sz' → '002008.SZ'
  function normTicker(t){ return String(t || '').trim().toUpperCase(); }
  // 代码的交易所前缀键：'002008.SZ' → '002008'（与 swing.js tickerKey 一致）
  function tickerKey(t){ return normTicker(t).split('.')[0]; }
  // 无交易所后缀时推断完整代码（仅展示/兜底用；6 开头沪、4/8 开头北交、其余深）
  function fullTicker(c6){
    if(!c6) return '';
    return c6 + (/^[69]/.test(c6) ? '.SH' : /^[48]/.test(c6) ? '.BJ' : '.SZ');
  }

  /* ---------- 估值池 ---------- */
  function companies(){ return (DB.valuation && DB.valuation.companies) || []; }
  // 按 6 位代码查估值池公司（估值池内 ticker 可能带/不带后缀，统一归一到 6 位比较）
  function company(code6){
    const c6 = normCode6(code6); if(!c6) return null;
    return companies().find(c => normCode6(c.ticker) === c6) || null;
  }
  // 按完整代码精确匹配（与 earnings.js findValCompany 原实现一致）
  function companyByTicker(t){
    const nt = normTicker(t); if(!nt) return null;
    return companies().find(c => normTicker(c.ticker) === nt) || null;
  }
  // 精确匹配失败时按交易所前缀键兜底（与 swing.js findVal 原实现一致）
  function companyByTickerLoose(t){
    const nt = normTicker(t); if(!nt) return null;
    const cs = companies();
    return cs.find(c => normTicker(c.ticker) === nt) ||
           cs.find(c => tickerKey(c.ticker) && tickerKey(c.ticker) === tickerKey(nt)) || null;
  }

  /* ---------- 财报池 ---------- */
  function earningsRows(){ return (DB.earnings && DB.earnings.rows) || []; }
  /* 共享财务库（DB.finstats，FinStats 模块维护）：按 6 位代码取全部报告期行（报告期倒序） */
  function finRows(){ return (DB.finstats && Array.isArray(DB.finstats.rows)) ? DB.finstats.rows : []; }
  function finRowsOf(code6){
    const c6 = normCode6(code6); if(!c6) return [];
    return finRows()
      .filter(r => r.code6 === c6)
      .sort((a, b) => String(b.reportDate || '').localeCompare(String(a.reportDate || '')));
  }
  function finLatest(code6){
    const rows = finRowsOf(code6);
    return rows[0] || null;
  }
  // 某公司全部披露行（按披露日期倒序——与 company.js resolve 一致）
  function earnRowsOf(code6){
    const c6 = normCode6(code6); if(!c6) return [];
    return earningsRows()
      .filter(r => normCode6(r['股票代码']) === c6)
      .sort((a, b) => String(b['披露日期'] || '').localeCompare(String(a['披露日期'] || '')));
  }
  // 某公司最新一条披露行
  function earnLatest(code6){
    const rows = earnRowsOf(code6);
    return rows[0] || null;
  }

  /* ---------- 全站行情 / 研究暂存 / 台账 ---------- */
  function quotes(){ return (DB.quotes && typeof DB.quotes === 'object') ? DB.quotes : {}; }
  function quoteOf(code){
    const c6 = normCode6(code);
    return (c6 && quotes()[c6]) || null;
  }

  /* ---------- L0 静态公司字典（data/stocks.json，core.js loadStocks 异步加载） ----------
   * 行键名与 DB.industryMap.rows 一致（code/name/em/sw1/sw2/sw3/concepts）+ mkt/bd；
   * 未加载 / 加载失败时回退 DB.industryMap.rows（仅覆盖已导入公司）。
   * stocksIndex() 返回 {6位代码: 行}；stock(code6) 单查；stocksVersion() 数据版本。
   * 注意：本模块自带 stocksRows（局部），core.js 的同名全局函数经 window 访问——
   * 经典脚本的全局 function 会挂到 window；vm 沙箱未加载 core.js 时安全降级。 */
  function stocksRows(){
    if(typeof window !== 'undefined' && typeof window.stocksRows === 'function'){
      const rs = window.stocksRows();
      if(rs) return rs;
    }
    return (DB.industryMap && Array.isArray(DB.industryMap.rows) && DB.industryMap.rows.length)
      ? DB.industryMap.rows : null;
  }
  function stocksIndex(){
    const rows = stocksRows(); if(!rows) return {};
    if(stocksIndex.rows === rows) return stocksIndex.m;
    const m = {};
    rows.forEach(r => {
      const c6 = normCode6(r.code); if(c6) m[c6] = r;
    });
    stocksIndex.m = m; stocksIndex.rows = rows;
    return m;
  }
  function stock(code6){
    const c6 = normCode6(code6); if(!c6) return null;
    return stocksIndex()[c6] || null;
  }
  function stocksVersion(){
    try { return (STOCKS && STOCKS.meta && STOCKS.meta.version) || ''; }
    catch(e) { return ''; }   // 沙箱未加载 core.js：STOCKS 未声明
  }
  // 公司研究暂存区（DB.companyNotes[6位代码]）：未入估值池的分析暂存
  function notes(code6){
    const c6 = normCode6(code6);
    const s = DB.companyNotes;
    return (c6 && s && s[c6]) || null;
  }
  function swingItems(){ return (DB.swing && DB.swing.items) || []; }
  // 按代码查台账条目（strip 后缀精确匹配，与 swing 模块 tickerKey 口径一致）
  function swingByTicker(t){
    const k = tickerKey(t); if(!k) return null;
    return swingItems().find(x => tickerKey(x.ticker) === k) || null;
  }

  /* ---------- 三池合并索引（industries.js poolIndex 同口径） ----------
   * 返回 { 6位代码: { earnRows: [], valCo: null } }，财报池与估值池合并视图。 */
  function poolIndex(){
    const m = {};
    earningsRows().forEach(r => {
      const c = normCode6(r['股票代码']); if(!c) return;
      const st = m[c] || (m[c] = { earnRows: [], valCo: null });
      st.earnRows.push(r);
    });
    companies().forEach(co => {
      const c = normCode6(co.ticker || co.code); if(!c) return;
      const st = m[c] || (m[c] = { earnRows: [], valCo: null });
      st.valCo = co;
    });
    return m;
  }

  /* ---------- 分析完成度（五步链路：财报→评级→估值→买点→台账） ----------
   * 各步骤判定口径：
   *   财报 = 财报池有该公司的披露行
   *   评级 = 估值池公司 rating.grade，或研究暂存区 companyNotes.rating.grade
   *   估值 = 估值池公司有 valuations 记录
   *   买点 = 待击球台账条目填了买点区间（buyHigh/buyLow 任一非空）
   *   台账 = 待击球台账有该公司的条目
   * 返回 null 表示该公司在三池中都不存在。 */
  function completion(code6){
    const c6 = normCode6(code6); if(!c6) return null;
    const valCo = company(c6);
    const note = notes(c6) || {};
    const sw = swingByTicker(c6);
    const earnRows = earnRowsOf(c6);
    const rating = (valCo && valCo.rating && valCo.rating.grade) ? valCo.rating
                 : ((note && note.rating && note.rating.grade) ? note.rating : null);
    return {
      code6: c6,
      name: (valCo && valCo.name) || (earnRows[0] && earnRows[0]['公司名称']) || '',
      valCo: valCo,
      swingItem: sw || null,
      inValuation: !!valCo,
      earnings: earnRows.length > 0,
      rating: !!rating,
      ratingGrade: rating ? rating.grade : '',
      valuation: !!(valCo && valCo.valuations && valCo.valuations.length),
      buyPoint: !!(sw && (sw.buyHigh != null || sw.buyLow != null)),
      ledger: !!sw,
    };
  }

  /* ---------- 全量导出（标准化 JSON，可直接进 pandas 复用） ----------
   * 覆盖投资研究全部数据域 + _meta（导出时间/结构版本/各域行数）。
   * 深拷贝后返回纯 JSON 安全对象（不含函数/循环引用）。 */
  function exportAll(){
    const pick = k => (DB && DB[k] != null) ? JSON.parse(JSON.stringify(DB[k])) : null;
    const payload = {
      _meta: {
        app: 'goal-tracker/invest',
        schema: SCHEMA,
        exportedAt: new Date().toISOString(),
        counts: {
          valuationCompanies: companies().length,
          earningsRows: earningsRows().length,
          quotes: Object.keys(quotes()).length,
          swingItems: swingItems().length,
          industries: (DB.industries && DB.industries.list) ? DB.industries.list.length : 0,
          industryMapRows: (DB.industryMap && DB.industryMap.rows) ? DB.industryMap.rows.length : 0,
          macroGroups: (DB.macro && DB.macro.groups) ? DB.macro.groups.length : 0,
        },
      },
      valuation: pick('valuation'),
      earnings: pick('earnings'),
      finstats: pick('finstats'),
      quotes: pick('quotes'),
      swing: pick('swing'),
      industries: pick('industries'),
      industryMap: pick('industryMap'),
      macro: pick('macro'),
      companyNotes: pick('companyNotes'),
    };
    return payload;
  }

  return {
    SCHEMA: SCHEMA,
    normCode6: normCode6, normTicker: normTicker, tickerKey: tickerKey, fullTicker: fullTicker,
    companies: companies, company: company,
    companyByTicker: companyByTicker, companyByTickerLoose: companyByTickerLoose,
    earningsRows: earningsRows, earnRowsOf: earnRowsOf, earnLatest: earnLatest,
    finRows: finRows, finRowsOf: finRowsOf, finLatest: finLatest,
    quotes: quotes, quoteOf: quoteOf,
    stocksRows: stocksRows, stocksIndex: stocksIndex, stock: stock, stocksVersion: stocksVersion,
    notes: notes, swingItems: swingItems, swingByTicker: swingByTicker,
    poolIndex: poolIndex,
    completion: completion,
    exportAll: exportAll,
  };
})();
