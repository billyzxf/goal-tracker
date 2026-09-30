/* ================= 投资研究 · 总览（invest-home） =================
 * 投资研究独立应用的首页（view='invest'），聚合 5 个投资模块的概览：
 *   待击球 swing / 公司估值 valuation / 财报跟踪 earnings / 行业研究 industries / 宏观经济 macro
 * 数据只读展示，入口跳转到对应模块视图（data-action="nav"）。
 * 依赖：val-core（window.ValHelpers，经 valuation.js 加载）用于估值口径复用；
 *       Repo（data-repo.js）用于「导出全部数据」。
 * 附加：数据新鲜度横幅——读 data/manifest.json（scripts/ops/build_manifest.py 生成），
 *       行情（data/prices/）最新文件距今超过 2 天时提醒重新导入；manifest
 *       不存在 / file:// 打开 fetch 失败时一律静默，不打扰。
 * 本模块仅在 invest.html 中加载；goal 应用由 dashboard.js 提供自己的首页。
 */
(function(){
  /* ---------- 数据新鲜度（行情 X 天未更新提醒） ---------- */
  const PRICE_STALE_DAYS = 2;   // 行情超过 N 天未更新时提示
  let freshLoaded = false;      // manifest 只拉取一次（会话内）
  let freshInfo = null;         // { days, date } 或 null（无 prices 文件 / 解析失败）

  function parseFresh(m){
    try{
      if(!m || !Array.isArray(m.files)) return null;
      let latest = null;                       // YYYYMMDD 字符串，取最大即最新
      (m.files || []).forEach(f => {
        if(f.dir !== 'prices') return;
        const dm = String(f.path || '').match(/(\d{8})/);
        if(dm && (!latest || dm[1] > latest)) latest = dm[1];
      });
      if(!latest) return null;
      const d = new Date(latest.slice(0,4) + '-' + latest.slice(4,6) + '-' + latest.slice(6,8) + 'T00:00:00');
      const days = Math.floor((Date.now() - d.getTime()) / 86400000);
      return { days: days, date: latest.slice(0,4) + '-' + latest.slice(4,6) + '-' + latest.slice(6,8) };
    }catch(e){ return null; }
  }

  function bannerHTML(info){
    if(!info || info.days == null || info.days <= PRICE_STALE_DAYS) return '';
    return '<div class="card" style="border-left:4px solid #f0a020;margin-bottom:14px;padding:12px 16px">' +
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<span>⚠️ <b>行情数据 ' + info.days + ' 天未更新</b></span>' +
      '<span class="muted">（最新：' + esc(info.date) + '）建议到「公司估值」页重新导入股价 CSV</span>' +
      '<button class="btn ghost sm" data-action="nav" data-view="valuation" style="margin-left:auto">去更新 →</button>' +
      '</div></div>';
  }

  function loadFreshness(){
    if(freshLoaded) return;
    freshLoaded = true;
    fetch('./data/manifest.json', { cache:'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(m => {
        freshInfo = parseFresh(m);
        const box = document.getElementById('fresh-banner');   // 页面已渲染时直接注入
        if(box) box.innerHTML = bannerHTML(freshInfo);
      })
      .catch(() => {});   // file:// / manifest 不存在：静默
  }

  /* ---------- 导出全部数据（标准化 JSON，可直接进 pandas） ---------- */
  function exportAllData(){
    try{
      const payload = Repo.exportAll();
      const d = new Date();
      const fname = 'invest-data-export_' + d.getFullYear() + p2(d.getMonth()+1) + p2(d.getDate()) +
                    '_' + p2(d.getHours()) + p2(d.getMinutes()) + '.json';
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click(); URL.revokeObjectURL(a.href);
      const n = (payload._meta && payload._meta.counts) || {};
      toast('✅ 已导出标准化数据：估值 ' + (n.valuationCompanies || 0) + ' 家 · 财报 ' + (n.earningsRows || 0) + ' 行 · 行情 ' + (n.quotes || 0) + ' 条');
    }catch(e){ toast('导出失败：' + (e && e.message || e)); }
  }

  function renderHome(){
    loadFreshness();
    const V = window.ValHelpers || {};
    const money = n => (V && V.fmtMoney) ? V.fmtMoney(n) : '¥' + (Number(n) || 0).toLocaleString();
    const pct = n => (V && V.fmtPct) ? V.fmtPct(n) : (Number(n) || 0).toFixed(1) + '%';

    /* —— 待击球 swing（懒加载：模块就绪前 DB.swing 可能不存在） —— */
    const sw = (DB.swing && DB.swing.items) || [];
    const swPending = sw.filter(x => x.status === '待击球').length;
    const swHeld    = sw.filter(x => x.status === '持仓中').length;
    const swCapital = Number(DB.swing && DB.swing.capital) || 0;

    /* —— 公司估值 valuation —— */
    const valCos = (DB.valuation.companies || []);
    let valPos = 0, valCost = 0, valMv = 0;
    valCos.forEach(c => {
      const p = (V && V.calcPosition) ? V.calcPosition(c.investments || []) : { position: 0, cost: 0 };
      valPos += p.position; valCost += p.cost; valMv += p.position * (c.currentPrice || 0);
    });
    const valPnl = valMv - valCost;
    const staleCnt = (typeof V.valFreshness === 'function')
      ? valCos.filter(c => V.valFreshness(c).code !== 'ok').length : 0;

    /* —— 财报跟踪 earnings —— */
    const earn = DB.earnings.rows || [];
    let earnLast = '';
    earn.forEach(r => { const d = String(r['披露日期'] || ''); if(d > earnLast) earnLast = d; });

    /* —— 行业研究 industries（懒加载：模块就绪前 DB.industries 可能不存在） —— */
    const inds = (DB.industries && DB.industries.list) || [];
    // 分类地图口径：L0 静态字典（stocks.json）优先，兜底旧导入地图
    const mapRows = (typeof stocksRows === 'function')
      ? (stocksRows() || ((DB.industryMap && DB.industryMap.rows) || []))
      : ((DB.industryMap && DB.industryMap.rows) || []);
    const mapCnt = mapRows.length;

    /* —— 宏观经济 macro —— */
    const macroGroups = (DB.macro && DB.macro.groups) ? DB.macro.groups.length : 0;
    const macroScores = (DB.macro && DB.macro.scores) || {};

    let h = '';
    h += '<div class="hero"><h1>📈 投资研究</h1>' +
      '<div class="hero-date">' + fmtCN() + ' · 待击球 ' + swPending + ' · 持仓中 ' + swHeld + ' · 关注公司 ' + valCos.length + ' 家 · 行业研究 ' + inds.length + ' 项</div></div>';

    /* 数据新鲜度横幅（manifest 就绪后异步注入；无异常时为空） */
    h += '<div id="fresh-banner">' + (freshLoaded && freshInfo ? bannerHTML(freshInfo) : '') + '</div>';

    /* 组合总览 + 快速入口 */
    h += '<div class="dash-grid">';
    h += '<div class="card big-card"><div class="info"><h3><span class="dot" style="background:var(--indigo);width:8px;height:8px;border-radius:50%;display:inline-block"></span>组合总览</h3>' +
      '<div class="stat-line"><span>持仓市值</span><b>' + money(valMv) + '</b></div>' +
      '<div class="stat-line"><span>持仓成本</span><b>' + money(valCost) + '</b></div>' +
      '<div class="stat-line"><span>浮动盈亏</span><b class="' + (valPnl >= 0 ? 'up' : 'down') + '">' + money(valPnl) + '（' + pct(valCost > 0 ? valPnl / valCost * 100 : 0) + '）</b></div>' +
      (staleCnt ? '<div class="stat-line"><span>估值待重估</span><b class="down">' + staleCnt + ' 家</b></div>' : '') +
      '<button class="btn primary sm" style="margin-top:8px" data-action="nav" data-view="valuation">公司估值 →</button></div></div>';
    h += '<div class="card"><div class="sec-title"><h2>📌 快速入口</h2></div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" data-action="nav" data-view="swing">⚾ 待击球</button>' +
      '<button class="btn ghost sm" data-action="nav" data-view="earnings">📊 财报跟踪</button>' +
      '<button class="btn ghost sm" data-action="nav" data-view="industries">🏭 行业研究</button>' +
      '<button class="btn ghost sm" data-action="nav" data-view="macro">🌐 宏观经济</button>' +
      '<button class="btn ghost sm" data-action="home.exportAll" title="导出全部投资数据为标准化 JSON（估值/财报/行情/台账/行业/宏观），可直接用 pandas 分析复用">⬇ 导出全部数据</button>' +
      '<button class="btn ghost sm" onclick="location.href=\'index.html\'">🎯 目标追踪 →</button></div></div>';
    h += '</div>';

    /* 各模块统计卡片 */
    h += '<div class="dash-grid">';
    h += '<div class="card"><div class="sec-title"><h2>⚾ 待击球</h2>' +
      '<button class="btn ghost sm" data-action="nav" data-view="swing">进入 →</button></div>' +
      '<div class="stat-line"><span>待击球</span><b>' + swPending + ' 只</b></div>' +
      '<div class="stat-line"><span>持仓中</span><b>' + swHeld + ' 只</b></div>' +
      (swCapital ? '<div class="stat-line"><span>账户总资金</span><b>' + money(swCapital) + '</b></div>' : '') +
      '<div class="stat-line"><span>台账总条数</span><b>' + sw.length + '</b></div></div>';
    h += '<div class="card"><div class="sec-title"><h2>📊 财报跟踪</h2>' +
      '<button class="btn ghost sm" data-action="nav" data-view="earnings">进入 →</button></div>' +
      '<div class="stat-line"><span>财报行数</span><b>' + earn.length + ' 行</b></div>' +
      '<div class="stat-line"><span>最新披露</span><b>' + (earnLast ? earnLast : '—') + '</b></div></div>';
    h += '<div class="card"><div class="sec-title"><h2>🏭 行业研究</h2>' +
      '<button class="btn ghost sm" data-action="nav" data-view="industries">进入 →</button></div>' +
      '<div class="stat-line"><span>研究行业数</span><b>' + inds.length + ' 项</b></div>' +
      '<div class="stat-line"><span>分类地图覆盖</span><b>' + (mapCnt ? mapCnt + ' 家' : '未导入') + '</b></div></div>';
    h += '<div class="card"><div class="sec-title"><h2>🌐 宏观经济</h2>' +
      '<button class="btn ghost sm" data-action="nav" data-view="macro">进入 →</button></div>' +
      '<div class="stat-line"><span>指标分组</span><b>' + macroGroups + ' 组</b></div>' +
      '<div class="stat-line"><span>宏观评分</span><b>流动 ' + (macroScores.liquidity || 0) + ' · 增长 ' + (macroScores.growth || 0) + ' · 估值 ' + (macroScores.valuation || 0) + '</b></div></div>';
    h += '</div>';

    return h;
  }

  Register.module({
    view: 'invest',
    nav: { ico: '🏠', label: '投资总览', group: null },
    render: renderHome,
    actions: { 'home.exportAll': exportAllData },
  });
})();