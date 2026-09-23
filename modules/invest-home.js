/* ================= 投资研究 · 总览（invest-home） =================
 * 投资研究独立应用的首页（view='invest'），聚合 5 个投资模块的概览：
 *   待击球 swing / 公司估值 valuation / 财报跟踪 earnings / 行业研究 industries / 宏观经济 macro
 * 数据只读展示，入口跳转到对应模块视图（data-action="nav"）。
 * 依赖：val-core（window.ValHelpers，经 valuation.js 加载）用于估值口径复用。
 * 本模块仅在 invest.html 中加载；goal 应用由 dashboard.js 提供自己的首页。
 */
(function(){
  function renderHome(){
    const V = window.ValHelpers || {};
    const money = n => (V && V.fmtMoney) ? V.fmtMoney(n) : '¥' + (Number(n) || 0).toLocaleString();
    const pct = n => (V && V.fmtPct) ? V.fmtPct(n) : (Number(n) || 0).toFixed(1) + '%';

    /* —— 待击球 swing —— */
    const sw = DB.swing.items || [];
    const swPending = sw.filter(x => x.status === '待击球').length;
    const swHeld    = sw.filter(x => x.status === '持仓中').length;
    const swCapital = Number(DB.swing.capital) || 0;

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

    /* —— 行业研究 industries —— */
    const inds = DB.industries.list || [];
    const mapCnt  = (DB.industryMap && DB.industryMap.rows) ? DB.industryMap.rows.length : 0;

    /* —— 宏观经济 macro —— */
    const macroGroups = (DB.macro && DB.macro.groups) ? DB.macro.groups.length : 0;
    const macroScores = (DB.macro && DB.macro.scores) || {};

    let h = '';
    h += '<div class="hero"><h1>📈 投资研究</h1>' +
      '<div class="hero-date">' + fmtCN() + ' · 待击球 ' + swPending + ' · 持仓中 ' + swHeld + ' · 关注公司 ' + valCos.length + ' 家 · 行业研究 ' + inds.length + ' 项</div></div>';

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
  });
})();