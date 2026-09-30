/* ================= 统一公司详情页（company） =================
 * 全站共用的公司详情视图（view='company'），以 6 位股票代码为通用键，
 * 聚合三个数据源：估值池 DB.valuation.companies / 财报池 DB.earnings.rows / 全站行情 DB.quotes。
 *
 * 渲染分档：
 *   - 估值池公司 → 复用 valuation.js 暴露的 renderCompanyDetail（完整板块：
 *     分季度财务 / 盈利预测 / 估值矩阵 / 触发线 / 买卖记录 / 评级 / 研究时间线…），
 *     末尾追加「📊 财报跟踪数据」板块展示财报池全部已有报告期记录
 *   - 非估值池公司 → 精简页：行情快照（只读）+ 财报池披露数据（只读）+ 「加入估值池」解锁区；
 *     未加入估值池前，估值专属板块永不出现（按需精简，不堆空板块）。
 *
 * 入口统一走 CompanyPage.open(ref, from)：
 *   ref = { valId } 或 { code6 } 或 { ticker, name? }；
 *   hash 形如 #/company?v=… / ?c=… / ?t=…，支持刷新保持与前进后退。
 * 自带 hashchange 监听：core 只在「视图变化」时渲染，公司→公司的 hash 查询串变化
 * （如 #/company?c=A → ?c=B）由本监听器补渲染，浏览器前进/后退同理。
 * 本模块无 nav 属性，不进侧边栏，仅由各列表的公司名/详情按钮跳入。
 */
(function(){
  /* ---------- 本地常量（与 valuation.js 口径一致，避免跨 IIFE 取内部变量） ---------- */
  const VAL_INDUSTRIES = [
    '电子', '计算机', '通信', '食品饮料', '汽车', '机械设备', '医药生物', '传媒',
    '交通运输', '轻工制造', '有色金属', '基础化工', '电力设备', '公用事业', '商贸零售',
    '家用电器', '建筑装饰', '国防军工', '环保', '银行', '非银金融', '石油石化',
    '煤炭', '钢铁', '纺织服饰', '社会服务', '农林牧渔', '建筑材料', '综合',
  ];
  const IND_CLS = VAL_INDUSTRIES.reduce((m, i, idx) => {
    const cls = ['indigo','pink','amber','green','blue','orange','red','gray'];
    m[i] = cls[idx % cls.length];
    return m;
  }, {});
  const BOARD_CLS = { '主板':'indigo', '科创板':'pink', '创业板':'amber' };
  const VAL_LYNCH_TYPES = [
    { key:'快速增长型', cls:'pink',   desc:'规模较小、高成长（年均 20%+），十倍股最可能出现的地方' },
    { key:'稳定增长型', cls:'indigo', desc:'大型公司、年增约 10~12%，抗周期，收益看买入时机与价格' },
    { key:'缓慢增长型', cls:'gray',   desc:'老牌巨头、年增仅 2~4%，主要靠股息，投资价值有限' },
    { key:'周期型',     cls:'amber',  desc:'业绩随经济周期波动，需把握买卖时机，周期顶峰买入最危险' },
    { key:'困境反转型', cls:'red',    desc:'遭受打击濒临破产但可能翻身，风险最高回报也可能最丰厚' },
    { key:'隐蔽资产型', cls:'green',  desc:'拥有价值巨大但未被市场发现的隐蔽资产，需深入理解并耐心等待' },
  ];
  const LYNCH_CLS = VAL_LYNCH_TYPES.reduce((m, t) => (m[t.key] = t.cls, m), {});
  const LYNCH_DESC = VAL_LYNCH_TYPES.reduce((m, t) => (m[t.key] = t.desc, m), {});
  /* 三级归档（与 valuation.js 的 VAL_TIERS 一致） */
  const VAL_TIERS = [
    { key:'咖啡罐', desc:'想清楚就封存：买点以下且失效条件未触发时，不看不动' },
    { key:'观察池', desc:'逻辑成立但价格未到 / 信息不足，持续跟踪等买点' },
    { key:'回避',   desc:'逻辑已破坏或估值透支，明确不参与（留档避免重复研究）' },
  ];
  const TIER_DESC = VAL_TIERS.reduce((m, t) => (m[t.key] = t.desc, m), {});
  const TIER_CLS = { '咖啡罐':'green', '观察池':'amber', '回避':'red' };
  /* 精简页财报表：全量列展示（与财报跟踪池同源，含自定义指标列）。
     优先取 earnings.js 暴露的 METRICS（单一数据源）；下列副本仅作加载顺序兜底。 */
  const FALLBACK_METRICS = [
    { key:'披露日期', label:'披露日期', type:'date' },
    { key:'报告期',   label:'报告期',   type:'text' },
    { key:'季度',     label:'季度',     type:'text' },
    { key:'营业收入', label:'营业收入', unit:'亿', type:'num' },
    { key:'营收同比', label:'营收同比', unit:'%',  type:'pct' },
    { key:'毛利润',   label:'毛利润',   unit:'亿', type:'num' },
    { key:'净利润',   label:'净利润',   unit:'亿', type:'num' },
    { key:'扣非净利润', label:'扣非净利润', unit:'亿', type:'num' },
    { key:'扣非净利同比', label:'扣非净利同比', unit:'%', type:'pct' },
    { key:'经营现金流', label:'经营现金流', unit:'亿', type:'num' },
    { key:'销售收现', label:'销售收现', unit:'亿', type:'num' },
    { key:'资本开支', label:'资本开支', unit:'亿', type:'num' },
    { key:'ROE',      label:'ROE',      unit:'%',  type:'pct' },
    { key:'毛利率',   label:'毛利率',   unit:'%',  type:'pct' },
  ];
  /* 列集 = 内置指标（披露日期单独作首列）+ 自定义指标（computeCustom 逐行求值） */
  function earnCols(){
    const base = (window.EarnMetricsApi && EarnMetricsApi.metrics) ? EarnMetricsApi.metrics : FALLBACK_METRICS;
    const cms = (window.EarnMetricsApi && EarnMetricsApi.customMetrics) ? EarnMetricsApi.customMetrics() : [];
    return base.concat(cms.map(cm => ({ key: '#' + cm.name, label: cm.name, type: 'num', custom: true })));
  }

  /* ---------- 工具 ----------
   * 代码规范化与跨池查找：实现收敛到统一数据访问层 Repo（modules/data-repo.js），此处仅保留调用入口 */
  function normCode6(s){ return Repo.normCode6(s); }
  function normTicker(t){ return Repo.normTicker(t); }
  /* 无估值池记录时推断完整代码（仅用于展示与查重兜底） */
  function fullTicker(c6){ return Repo.fullTicker(c6); }
  const money = n => (window.ValHelpers && ValHelpers.fmtMoney) ? ValHelpers.fmtMoney(n) : String(n);
  const fmtPctSafe = n => (window.ValHelpers && ValHelpers.fmtPct) ? ValHelpers.fmtPct(n) : (Number(n) || 0).toFixed(2) + '%';
  /* 财报池数值格式化：与财报跟踪列表同口径（<100 两位小数、≥100 一位小数）；
     元级大数（≥1 亿的原始值）自动换算为「亿」并保留两位，避免 13 位原始值撑爆表格。
     forcePct：百分比指标列（原值无 % 后缀时）统一补 %；非数字原样透传。 */
  function fmtMetricVal(v, forcePct){
    const raw = String(v == null ? '' : v);
    if(raw === '' || raw === '-') return '';
    const hasPct = raw.indexOf('%') >= 0;
    const n = Number(raw.replace(/[,%\s]/g, ''));
    if(isNaN(n)) return raw;
    const a = Math.abs(n);
    const suf = (hasPct || forcePct) ? '%' : '';
    if(a >= 1e8) return (n / 1e8).toFixed(2) + '亿' + suf;
    return (a >= 100 ? n.toFixed(1) : n.toFixed(2)) + suf;
  }

  /* ---------- 分析暂存区（非估值池公司） ----------
   * 未加入估值池也能先做分析：决策要点 / 评级 / 研究记录暂存 DB.companyNotes[code6]，
   * 结构与估值池公司对象上的同名字段一致（note/tier/invalidConds/condMarks/rating/researchLog），
   * 加入估值池时由 company.saveJoin 一并迁移进公司对象（移动语义，暂存区清空）。 */
  function notesStore(){
    if(!DB.companyNotes || typeof DB.companyNotes !== 'object') DB.companyNotes = {};
    return DB.companyNotes;
  }
  function notesOf(code6){
    const s = notesStore();
    if(!s[code6]) s[code6] = { note: '', tier: '', invalidConds: [], condMarks: {}, rating: null, researchLog: [] };
    return s[code6];
  }

  const BACK_LABELS = {
    valuation: '返回公司列表',
    earnings: '返回财报跟踪',
    industries: '返回行业研究',
    swing: '返回待击球',
    invest: '返回总览',
    macro: '返回宏观看板',
  };
  function backLabel(){ return BACK_LABELS[state.companyFrom] || '返回'; }

  /* ---------- ref ⇆ hash ---------- */
  function hashOf(ref){
    if(!ref) return '#/company';
    if(ref.valId) return '#/company?v=' + encodeURIComponent(ref.valId);
    if(ref.code6) return '#/company?c=' + encodeURIComponent(ref.code6);
    if(ref.ticker) return '#/company?t=' + encodeURIComponent(ref.ticker) + (ref.name ? '&n=' + encodeURIComponent(ref.name) : '');
    return '#/company';
  }
  function refFromHash(){
    const q = String(location.hash).split('?')[1] || '';
    if(!q) return null;
    const p = new URLSearchParams(q);
    if(p.get('v')) return { valId: p.get('v') };
    if(p.get('c')) return { code6: p.get('c') };
    if(p.get('t')) return { ticker: p.get('t'), name: p.get('n') || '' };
    return null;
  }

  /* ---------- 统一入口 ---------- */
  function open(ref, from){
    /* from = 打开详情前的来源视图，用于「返回」文案与回退目标 */
    if(from) state.companyFrom = from;
    else if(state.view && state.view !== 'company') state.companyFrom = state.view;
    state.companyRef = ref || null;
    const h = hashOf(ref);
    state.companyHash = h;
    if(location.hash === h){ render(); }        // hash 同值不触发 hashchange → 手动渲染
    else { location.hash = h; }                 // hashchange → core（跨视图）或本模块监听器（视图内）渲染
    window.scrollTo(0, 0);
  }
  function back(){
    const to = state.companyFrom || '';
    state.companyRef = null;
    if(to && MODULES[to] && to !== 'company'){ location.hash = '/' + to; }
    else { history.back(); }
  }

  /* 公司 → 公司的查询串变化（含前进/后退）由本监听器补渲染 */
  window.addEventListener('hashchange', () => {
    if(state.view !== 'company') return;
    if(location.hash === (state.companyHash || '')) return;
    state.companyRef = null;                    // 强制从新 hash 重新解析
    state.companyHash = location.hash;
    render();
    window.scrollTo(0, 0);
  });

  /* ---------- 解析：ref → { c, code6, rows, quote } ----------
   * c     估值池公司（可能为 null）
   * rows  财报池该公司所有披露行（按披露日期倒序）
   * quote 全站行情快照 DB.quotes[code6]
   * 三源全空返回 null（空态页）
   */
  function resolve(ref){
    const valCos = Repo.companies();
    let c = null;
    if(ref.valId){
      c = findById(valCos, ref.valId) || null;   // valId 失效（如被删除）→ 降级用 ticker/code 再试
    }
    if(!c && ref.ticker){
      c = Repo.companyByTicker(ref.ticker);      // 精确匹配（含大小写/空格归一）
    }
    const refC6 = normCode6(ref.ticker || ref.code6 || '');
    if(!c && refC6) c = Repo.company(refC6);     // 按 6 位代码兜底匹配
    if(!c && !refC6) return null;

    const code6 = normCode6((c && c.ticker) || '') || refC6;
    const rows = code6 ? Repo.earnRowsOf(code6) : [];   // 财报池披露行（按披露日期倒序）
    const quote = Repo.quoteOf(code6);                  // 全站行情快照
    if(!c && !rows.length && !quote) return null;
    return { c: c, code6: code6, rows: rows, quote: quote };
  }

  /* ---------- 渲染 ---------- */
  function render(){
    if(!state.companyRef){
      state.companyRef = refFromHash();          // 直接打开/刷新 #/company?…：从 hash 恢复
      state.companyHash = location.hash;
    }
    const ref = state.companyRef;
    if(!ref) return emptyPage(null);
    const R = resolve(ref);
    if(!R) return emptyPage(ref);
    /* 估值池公司 → 完整详情页（.val-detail 作用域包裹，样式见 style.css）；
       末尾追加「📊 财报跟踪数据」板块：财报跟踪池该公司的全部已有报告期记录
       （与分季度财务互补 —— 财报池积累的每期披露数据在此全量展示） */
    if(R.c){
      return '<div class="val-detail">' + (window.ValCompanyDetail
        ? ValCompanyDetail(R.c)
        : '<div class="empty">详情渲染器未就绪，请刷新页面</div>') + earnPoolSection(R.rows, false) + '</div>';
    }
    /* 精简页与完整页共用 .val-detail 卡片化样式作用域 */
    return '<div class="val-detail">' + slimPage(R, ref) + '</div>';
  }

  /* ---------- 空态 ---------- */
  function emptyPage(ref){
    let h = '<span class="back-link" data-action="company.back">← ' + backLabel() + '</span>';
    h += '<div class="card" style="padding:32px;text-align:center"><div style="font-size:36px">🫥</div>' +
      '<h3>未找到公司数据</h3>' +
      '<p class="muted">' + (ref && (ref.ticker || ref.code6)
        ? '代码 ' + esc(String(ref.ticker || ref.code6)) + ' 在估值池、财报池与行情缓存中均无记录。'
        : '请从列表页点击公司名称进入。') + '</p></div>';
    return h;
  }

  /* 财报池披露数据表（只读，全量指标列 + 自定义指标，按披露日期倒序）：
     精简页与估值池完整详情页共用。withEmpty=false（完整页用）：无数据时不渲染，
     避免在「分季度财务」下方多一个空板块。 */
  function earnPoolSection(rows, withEmpty){
    if(!rows.length && withEmpty === false) return '';
    const COLS = earnCols();
    /* 动态补列：CSV 可能带 METRICS 未覆盖的额外数据列（所有已有数据全量展示）；
       meta 列（代码/名称/行业/板块/林奇类型）在详情页其余板块已展示，不重复。
       全部行该列均为空的跳过；非空值可数值化的按数值列渲染，否则按文本。 */
    const META_KEYS = ['股票代码', '公司名称', '行业', '行业二级', '行业三级', '板块', '林奇类型'];
    const known = k => k === '披露日期' || COLS.some(d => d.key === k) || META_KEYS.includes(k);
    const extraKeys = [];
    rows.forEach(r => Object.keys(r).forEach(k => {
      if(known(k) || extraKeys.includes(k)) return;
      const hasVal = rows.some(r2 => String(r2[k] == null ? '' : r2[k]).trim() !== '');
      if(hasVal) extraKeys.push(k);
    }));
    const ALL_COLS = COLS.concat(extraKeys.map(k => {
      const isNum = rows.every(r => {
        const v = String(r[k] == null ? '' : r[k]).trim();
        return v === '' || !isNaN(Number(v));
      });
      return { key: k, label: k, type: isNum ? 'num' : 'text' };
    }));
    const BODY_COLS = ALL_COLS.filter(d => d.key !== '披露日期');
    const mvApi = window.EarnMetricsApi || null;
    let h = '<div class="val-section"><div class="vs-head"><h3>📊 财报跟踪数据 <span class="muted" style="font-weight:400;font-size:12px">来自财报跟踪池（只读）· 共 ' + rows.length + ' 条 · ' + (BODY_COLS.length) + ' 项指标</span></h3></div>';
    if(!rows.length){
      h += '<div class="empty">财报跟踪池暂无该公司的披露数据</div>';
    } else {
      h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
        '<th>披露日期</th>' +
        BODY_COLS.map(d => '<th class="num">' + esc(d.label) + '</th>').join('') + '</tr></thead><tbody>';
      rows.forEach(r => {
        h += '<tr><td><b>' + (r['披露日期'] ? esc(String(r['披露日期'])) : '<span class="muted">—</span>') + '</b></td>';
        BODY_COLS.forEach(d => {
          /* 自定义指标列：'#名称' 经 earnings.js 求值（支持嵌套引用） */
          let raw;
          if(d.custom){
            const v = mvApi ? mvApi.metricVal(r, d.key) : null;
            raw = (v == null || isNaN(v)) ? '' : String(v);
          } else {
            const v = r[d.key];
            raw = (v == null || v === '' || v === '-') ? '' : String(v);
          }
          if(!raw){ h += '<td class="num"><span class="muted">—</span></td>'; return; }
          if(d.type === 'pct'){
            const n = Number(raw.replace(/[,%\s]/g, ''));
            const cls = (isNaN(n) || n === 0) ? '' : (n > 0 ? 'up' : 'down');
            h += '<td class="num' + (cls ? ' ' + cls : '') + '">' + esc(fmtMetricVal(raw, true)) + '</td>';
          } else if(d.type === 'text'){
            /* 与表头 th.num 同为右对齐（日期/季度等文本列），避免表头与数值错位 */
            h += '<td class="num" style="white-space:nowrap">' + esc(raw) + '</td>';
          } else {
            h += '<td class="num">' + esc(fmtMetricVal(raw)) + '</td>';
          }
        });
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- 非估值池公司 · 精简页 ---------- */
  function slimPage(R, ref){
    const rows = R.rows, q = R.quote;
    const r0 = rows[0] || {};
    const name = (R.c && R.c.name) || String(r0['公司名称'] || '') || String(ref.name || '') || R.code6;
    const ticker = (R.c && R.c.ticker) || String(r0['股票代码'] || '') || fullTicker(R.code6);
    const industry = (R.c && R.c.industry) || String(r0['行业'] || '');
    const board = (R.c && R.c.board) || String(r0['板块'] || '');
    const lynch = (R.c && R.c.companyType) || String(r0['林奇类型'] || '');
    const mr = (R.code6 && typeof swMapIdx === 'function') ? swMapIdx()[R.code6] : null;
    const l2 = String((mr && mr.sw2) || r0['行业二级'] || '');
    const l3 = String((mr && mr.sw3) || r0['行业三级'] || '');
    const path = (typeof swPath === 'function') ? swPath(R.code6, { industry: industry, industryL2: l2, industryL3: l3 }) : industry;

    let h = '<span class="back-link" data-action="company.back">← ' + backLabel() + '</span>';
    /* 页头：名称 + 徽章 + 副行（对齐完整详情页 page-head 结构） */
    const NR = notesOf(R.code6);
    let badges = '';
    if(board && BOARD_CLS[board]) badges += ' <span class="badge ' + BOARD_CLS[board] + '">' + esc(board) + '</span>';
    if(industry) badges += ' <span class="badge ' + (IND_CLS[industry] || 'gray') + '" title="' + esc(path) + '">' +
      esc(industry) + (l3 && l3 !== industry ? '·' + esc(l3) : '') + '</span>';
    if(lynch && LYNCH_CLS[lynch]) badges += ' <span class="badge ' + LYNCH_CLS[lynch] + '" title="' + esc(LYNCH_DESC[lynch] || '') + '">' + esc(lynch) + '</span>';
    if(NR.tier) badges += ' <span class="badge ' + (TIER_CLS[NR.tier] || 'gray') + '" title="' + esc(TIER_DESC[NR.tier] || '') + '">' + esc(NR.tier) + '</span>';
    /* 评级徽章：非估值池公司显示暂存区预评级；估值池公司由 ratingBadgeByCode 取正式评级 */
    if(NR.rating && NR.rating.grade && window.ValCore){
      badges += ' ' + ValCore.ratingBadgeHTML(NR.rating);
    } else if(window.ValHelpers && ValHelpers.ratingBadgeByCode){
      const rb = ValHelpers.ratingBadgeByCode(R.code6);
      if(rb) badges += ' ' + rb;
    }
    h += '<div class="page-head"><div><h1>' + esc(name) + badges + '</h1><div class="muted">' +
      esc(ticker) + ' · A股' + (board ? ' · ' + esc(board) : '') +
      (path ? ' · ' + esc(path) : '') +
      (lynch ? ' · ' + esc(lynch) : '') +
      (rows.length ? ' · 最新披露 ' + esc(String(r0['披露日期'] || '')) : '') + '</div>' +
      /* 分析完成度链路：非估值池公司不显示「估值」项（未入池是常态） */
      (window.CompanyCompletion ? CompanyCompletion.chips(R.code6) : '') + '</div>' +
      '<div class="head-actions"><button class="btn primary sm" data-action="company.revealJoin" title="展开下方「加入估值池」表单，加入后解锁完整板块并带入已有分析">🔗 加入估值池</button></div></div>';

    /* 行情快照（只读，来源 DB.quotes；结构与完整详情页 val-summary-grid 一致） */
    if(q){
      const cls = (Number(q.pct) || 0) >= 0 ? 'up' : 'down';
      const flag = (Number(q.pct) || 0) > 0 ? '▲' : ((Number(q.pct) || 0) < 0 ? '▼' : '');
      const chg = (q.chg != null && !isNaN(Number(q.chg))) ? ((Number(q.chg) > 0 ? '+' : '') + Number(q.chg).toFixed(2)) : '';
      h += '<div class="val-summary-grid">';
      h += '<div class="val-stat"><div class="vs-label">当前股价</div><div class="vs-value">' +
        (q.price != null && q.price !== '' ? Number(q.price).toFixed(2) : '<span class="muted">—</span>') + '</div>' +
        (q.pct != null && q.pct !== ''
          ? '<div class="vs-sub ' + cls + '">' + flag + ' ' + chg + ' ' + fmtPctSafe(q.pct) + (q.date ? ' · ' + esc(String(q.date)) : '') + '</div>'
          : '') + '</div>';
      /* 行情快照指标卡（有值才显示），格式与完整详情页一致 */
      if(q.pct5 != null && q.pct5 !== ''){
        const p5 = Number(q.pct5);
        h += '<div class="val-stat"><div class="vs-label">5日涨幅</div><div class="vs-value">' + (p5 > 0 ? '+' : '') + p5.toFixed(2) + '%</div>' +
          '<div class="vs-sub ' + (p5 >= 0 ? 'up' : 'down') + '">近 5 个交易日累计</div></div>';
      }
      if(q.monthPct != null && q.monthPct !== ''){
        const mp = Number(q.monthPct);
        h += '<div class="val-stat"><div class="vs-label">本月涨幅</div><div class="vs-value">' + (mp > 0 ? '+' : '') + mp.toFixed(2) + '%</div>' +
          '<div class="vs-sub ' + (mp >= 0 ? 'up' : 'down') + '">本月累计（月K口径）</div></div>';
      }
      if(q.pe != null && q.pe !== '') h += '<div class="val-stat"><div class="vs-label">市盈率(动)</div><div class="vs-value">' + Number(q.pe).toFixed(2) + '</div>' +
        (Number(q.pe) < 0 ? '<div class="vs-sub muted">（亏损）</div>' : '') + '</div>';
      if(q.pb != null && q.pb !== '') h += '<div class="val-stat"><div class="vs-label">市净率</div><div class="vs-value">' + Number(q.pb).toFixed(2) + '</div></div>';
      if(q.turnover != null && q.turnover !== '') h += '<div class="val-stat"><div class="vs-label">换手率</div><div class="vs-value">' + Number(q.turnover).toFixed(2) + '%</div></div>';
      if(q.amount != null && q.amount !== '') h += '<div class="val-stat"><div class="vs-label">成交额(亿)</div><div class="vs-value">' + money(q.amount) + '</div></div>';
      if(q.volume != null && q.volume !== '') h += '<div class="val-stat"><div class="vs-label">成交量(手)</div><div class="vs-value">' + Number(q.volume).toFixed(0) + '</div></div>';
      if(q.mktcap != null && q.mktcap !== '') h += '<div class="val-stat"><div class="vs-label">总市值(亿)</div><div class="vs-value">' + money(q.mktcap) + '</div></div>';
      h += '</div>';
    }

    /* 财报池披露数据（只读，全量指标列 + 自定义指标，按披露日期倒序） */
    h += earnPoolSection(rows, true);

    /* 公司基础信息（basicSections 与 unlockSection 共用） */
    const info = { name: name, ticker: ticker, industry: industry, board: board, lynch: lynch, l2: l2, l3: l3 };

    /* 基础板块（默认展示、可直接编辑）：未加入估值池时数据暂存 DB.companyNotes，
       加入估值池后由完整详情页接管（分析数据一并带入） */
    h += basicSections(R, info);

    /* 解锁区：加入估值池后由详情页自动切换为完整板块 */
    h += unlockSection(R, info);
    return h;
  }

  /* ---------- 非估值池公司 · 可编辑分析板块（默认展示） ----------
   * ⚡ 决策要点 / 🏛 公司评级 / 🔬 公司研究：结构与完整详情页同名板块一致（子集），
   * 数据读写 DB.companyNotes[code6]；加入估值池后由完整页接管同名板块（评级联动参数、
   * 估值时效等依赖估值记录的部分届时自动生效）。 */
  function basicSections(R, info){
    const N = notesOf(R.code6);
    const cd = ' data-code="' + esc(R.code6) + '"';   // 公共 data-code 片段
    let h = '';

    /* ⚡ 决策要点：归档 + 公司描述 + 条件清单（估值时效依赖估值记录，加入后自动计算） */
    h += '<div class="val-section"><div class="vs-head"><h3>⚡ 决策要点 <span class="muted" style="font-weight:400;font-size:12px">归档 · 公司描述 · 条件清单——买之前想清楚，持有之中常复核</span></h3>' +
      '<button class="btn ghost sm" data-action="val.openReports" data-name="' + esc(info.name) + '" title="打开 valuations/ 下该公司的估值报告（按日期倒序）">📄 估值报告</button></div>';
    h += '<div class="dec-meta">' +
      '<span class="dm-chip"><i>🕒</i><span class="lb">估值时效</span><span class="muted" style="font-size:11.5px">加入估值池并录入估值记录后自动计算</span></span>' +
      '<span class="dm-chip"><i>🗄</i><span class="lb">归档</span>' +
        '<select class="val-inline-sel"' + cd + ' data-change="co.setTier" title="三级归档（决策分档）：咖啡罐=封存不动 / 观察池=等买点 / 回避=不参与">' +
          '<option value=""' + (!N.tier ? ' selected' : '') + '>未归档</option>' +
          VAL_TIERS.map(t => '<option value="' + esc(t.key) + '"' + (N.tier === t.key ? ' selected' : '') + '>' + esc(t.key) + '</option>').join('') +
        '</select>' +
        (N.tier ? '<span class="muted" style="font-size:11px">' + esc(TIER_DESC[N.tier] || '') + '</span>' : '<span class="muted" style="font-size:11px">咖啡罐 / 观察池 / 回避</span>') +
      '</span>' +
      '</div>';
    /* ① 公司描述 */
    const hasNote = N.note && String(N.note).trim();
    h += '<div class="ind-sub first"><div class="ind-sub-h"><span class="ind-sub-n">①</span><b>公司描述</b>' +
      '<span class="tip">主业与商业模式 · 核心竞争优势 · 当前关注逻辑</span></div>' +
      '<div style="display:flex;gap:10px;align-items:flex-start">' +
        (hasNote
          ? '<div class="md" style="flex:1;min-width:0">' + md(N.note) + '</div>'
          : '<div class="muted" style="flex:1;font-size:12.5px;line-height:1.7">尚未填写。建议记录：① 主业与商业模式（靠什么赚钱）② 核心竞争优势（真护城河）③ 当前为什么关注它。</div>') +
        '<button class="btn ghost sm" style="flex:none"' + cd + ' data-action="co.editNote" data-name="' + esc(info.name) + '">' + (hasNote ? '✎ 编辑' : '＋ 填写') + '</button>' +
      '</div></div>';
    /* ② 条件清单 */
    const conds = N.invalidConds || [];
    const marks = N.condMarks || {};
    h += '<div class="ind-sub"><div class="ind-sub-h"><span class="ind-sub-n">②</span><b>条件清单（失效条件 / 验证项）</b>' +
      '<span class="tip">把「什么情况下我的逻辑错了」拆成一条条可验证的句子</span></div>';
    if(conds.length){
      h += '<div class="cond-list">' + conds.map((x, i) => {
        const st = marks[x] || '';
        return '<div class="cond-row' + (st ? ' st-' + st : '') + '">' +
          '<span class="cond-st">' + (st === 'ok' ? '✓ 成立' : (st === 'bad' ? '✗ 失效' : '？ 未验证')) + '</span>' +
          '<span class="cond-tx">' + esc(x) + '</span>' +
          '<span class="cond-ops">' +
            '<button class="icon-btn' + (st === 'ok' ? ' on-ok' : '') + '" title="标记：复核通过 / 担忧解除"' + cd + ' data-action="co.condMark" data-i="' + i + '" data-v="ok">✓</button>' +
            '<button class="icon-btn' + (st === 'bad' ? ' on-bad' : '') + '" title="标记：条件触发 / 证伪信号"' + cd + ' data-action="co.condMark" data-i="' + i + '" data-v="bad">✗</button>' +
            (st ? '<button class="icon-btn" title="清除标记（回到未验证）"' + cd + ' data-action="co.condMark" data-i="' + i + '" data-v="">↺</button>' : '') +
            '<button class="icon-btn" title="删除该条"' + cd + ' data-action="co.condDel" data-i="' + i + '">✕</button>' +
          '</span></div>';
      }).join('') + '</div>';
    } else {
      h += '<div class="empty" style="padding:10px">还没有条件 · 在下方输入框逐条添加</div>';
    }
    h += '<form class="add-form" style="margin-top:8px;align-items:flex-start" data-form="co.addCond">' +
      '<input type="hidden" name="code" value="' + esc(R.code6) + '">' +
      '<textarea name="text" rows="1" required autocomplete="off" style="flex:1;resize:none;line-height:1.6;min-height:34px;overflow:hidden;text-align:left" placeholder="如：营收增速跌破 20% / 核心客户流失（可一次粘贴多行或中文分号分隔，自动拆分逐条加入；Ctrl+Enter 提交）" oninput="this.style.height=\'auto\';this.style.height=(this.scrollHeight+2)+\'px\'" onkeydown="if(event.ctrlKey&&event.key===\'Enter\'){event.preventDefault();this.form.requestSubmit();}"></textarea>' +
      '<button class="btn primary sm" style="flex:none">＋ 添加条件</button></form>';
    h += '</div>';

    /* 🏛 公司评级：四维打分 → 自动评级（可手动覆盖）；加入估值池后联动击球区/仓位/止损 */
    const rating = N.rating = (N.rating && typeof N.rating === 'object') ? N.rating : { scores: {}, flags: {} };
    const grade = rating.grade || '';
    const sc = rating.scores || {};
    const fl = rating.flags || {};
    const sug = ValCore.ratingAutoGrade(sc, fl);
    const dimCard = d => {
      const v = sc[d.key];
      return '<div class="rt-dim" title="' + esc(d.hint) + '">' +
        '<div class="lb"><b>' + esc(d.label) + '</b>' +
          (v == null ? '<span class="sc none">未评</span>' : '<span class="sc">' + v + ' 分</span>') + '</div>' +
        '<div class="ds">' + esc(d.hint) + '</div>' +
        '<select class="val-inline-sel"' + cd + ' data-change="co.setRatingScore" data-dim="' + d.key + '">' +
          '<option value=""' + (v == null ? ' selected' : '') + '>未评</option>' +
          [0, 1, 2, 3, 4].map(n => '<option value="' + n + '"' + (String(v) === String(n) ? ' selected' : '') + '>' + n + ' 分</option>').join('') +
        '</select></div>';
    };
    const flagItem = (key, strong, rest, title) =>
      '<label class="rt-flag' + (fl[key] ? ' on' : '') + '" title="' + esc(title) + '">' +
      '<input type="checkbox"' + cd + ' data-change="co.setRatingFlag" data-flag="' + key + '"' + (fl[key] ? ' checked' : '') + '>' +
      '<span><b>' + strong + '</b>' + rest + '</span></label>';
    h += '<div class="val-section"><div class="vs-head"><h3>🏛 公司评级 <span class="muted" style="font-weight:400;font-size:12px">先评级再入池：打分与门控随公司带入估值池，联动参数届时自动生效</span></h3>' +
      '<button class="btn primary sm" style="background:var(--indigo)"' + cd + ' data-action="co.ratingAuto" title="按当前打分与戒律门控自动计算评级（可再手动覆盖）">⚖ 自动评级</button></div>';
    h += '<div class="ind-note">' + ValCore.ratingBadgeHTML(grade ? { grade: grade } : null) + ' ' +
      (grade
        ? '<b>' + esc(grade) + '</b> 级预评级 · 加入估值池后自动联动击球区 / 仓位权限 / 止损参数'
        : '未评级：完成下方四维打分后点「⚖ 自动评级」，评级结果将显示在页头') + '</div>';
    h += '<div class="ind-sub first"><div class="ind-sub-h"><span class="ind-sub-n">①</span><b>四维打分</b>' +
      '<span class="tip">A 业绩 · E 弹性与预期差 · I 行业景气 · C 竞争格局，各 0–4 分满分 16；口径写在卡片内，悬停看完整说明</span></div>' +
      '<div class="rt-dims">' + ValCore.RATING_DIMS.map(dimCard).join('') + '</div></div>';
    h += '<div class="ind-sub"><div class="ind-sub-h"><span class="ind-sub-n">②</span><b>戒律门控与三重验证</b>' +
      '<span class="tip">门控 = 硬约束（勾选后自动评级封顶）；三重验证 = S 级准入（宽容是挣来的）</span></div>' +
      '<div class="rt-gp">戒律门控（勾选后自动封顶降分）</div>' +
      '<div class="rt-flags">' +
        flagItem('ocfDiverge', 'OCF 连续背离', ' → A 维度 ≤2 分（现金流与扣非净利连续背离时，盈利质量只给「是/否」，不打虚分）', '经营现金流与扣非净利连续背离：A 维度强制 ≤2') +
        flagItem('consensusHot', '一致预期 ≥90% 看多', ' → E 维度 ≤2 分（预期过度一致 = 预期差消失，研报戒律三）', '一致预期过度一致 = 预期差消失：E 维度强制 ≤2') +
      '</div>' +
      '<div class="rt-gp">S 级三重验证（缺一不可，新标的最高 A）</div>' +
      '<div class="rt-flags">' +
        flagItem('v1', '① 业绩验证', '：连续 2 个季度财报达标（增长 + 现金流 + 毛利率三线）', 'S 级准入①：连续 2 个季度财报达标') +
        flagItem('v2', '② 逻辑验证', '：成长逻辑能写成一篇你能辩护的论证', 'S 级准入②：论证可辩护') +
        flagItem('v3', '③ 时间验证', '：至少跟踪 1 个完整季度', 'S 级准入③：至少跟踪 1 个完整季度；新标的最高只能给 A（先观察再升级）') +
      '</div></div>';
    const mismatch = grade && sug.grade && sug.grade !== grade;
    h += '<div class="ind-sub"><div class="ind-sub-h"><span class="ind-sub-n">③</span><b>评级确认（可手动覆盖）</b>' +
      '<span class="tip">自动评级按打分 + 门控计算；手动覆盖后仍可随时点右上「⚖ 自动评级」重算</span></div>' +
      '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">' +
        '<span style="font-size:12px;color:var(--ink2)">评级：</span>' +
        '<select class="val-inline-sel" style="width:110px"' + cd + ' data-change="co.setRatingGrade">' +
          '<option value=""' + (!grade ? ' selected' : '') + '>未评级</option>' +
          ValCore.RATING_LEVELS.map(x => '<option value="' + x.g + '"' + (grade === x.g ? ' selected' : '') + '>' + x.g + ' 级</option>').join('') +
        '</select>' +
        '<span class="ind-note' + (mismatch ? ' warn' : '') + '" style="margin-top:0;display:inline-flex;align-items:center;gap:4px">自动建议 <b>' + (sug.grade || '—') + '</b>（' + sug.sum + '/16 分' + (sug.notes.length ? ' · ' + esc(sug.notes.join('；')) : '') + '）' +
          (mismatch ? ' — 与当前 ' + esc(grade) + ' 级不一致，可点「⚖ 自动评级」对齐' : '') + '</span>' +
        '<input type="text" class="val-inline" style="flex:1;min-width:240px" placeholder="评级依据备注（如：连 2 季达标 + OCF 回补，升 A）"' + cd + ' data-change="co.setRatingNote" value="' + esc(rating.note || '') + '">' +
      '</div></div>';
    h += '</div>';

    /* 🔬 公司研究：按日期归档的研究时间线（暂存区读写） */
    const rlogs = (N.researchLog || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    h += '<div class="val-section"><div class="vs-head"><h3>🔬 公司研究 <span class="muted" style="font-weight:400;font-size:12px">按日期归档：每次研究 / 调研 / 财报点评各记一条，累积成研究时间线</span></h3>' +
      '<button class="btn primary sm" style="background:var(--indigo)"' + cd + ' data-action="co.researchEdit" title="记录一条研究 / 调研 / 财报点评">＋ 添加记录</button></div>';
    if(rlogs.length){
      h += '<div class="rl-list">' + rlogs.map(g =>
        '<div class="rl-item"><div class="rl-head">' +
          (g.date ? '<span class="rl-date">📅 ' + esc(g.date) + '</span>' : '<span class="rl-date none">早期记录 · 未注明日期</span>') +
          '<span style="flex:1"></span>' +
          '<button class="icon-btn"' + cd + ' data-action="co.researchEdit" data-rid="' + esc(g.id) + '" title="编辑该条记录">✎</button>' +
          '<button class="icon-btn"' + cd + ' data-action="co.researchDel" data-rid="' + esc(g.id) + '" title="删除该条记录">🗑</button>' +
        '</div><div class="md">' + md(g.text) + '</div></div>'
      ).join('') + '</div>';
    } else {
      h += '<div class="empty">还没有研究记录 · 点击右上角「＋ 添加记录」按日期记录你的业务判断、关注重点、关键影响因素等</div>';
    }
    h += '</div>';
    return h;
  }

  /* ---------- 解锁区（details 折叠，默认收起） ---------- */
  function unlockSection(R, info){
    return '<details class="val-section co-unlock"><summary>🔗 加入估值池，解锁完整研究板块</summary>' +
      '<p class="muted" style="font-size:12px;margin:6px 0 10px">加入后该公司进入「公司估值」关注列表，解锁：批量导入财务 / 盈利预测 CSV、估值矩阵与触发线、买卖记录与仓位管理、自定义指标等完整功能；此前的分析（公司描述 / 条件清单 / 预评级 / 研究记录）将一并带入。</p>' +
      '<form class="add-form" data-form="company.saveJoin">' +
      '<input type="hidden" name="code" value="' + esc(R.code6) + '">' +
      '<input type="hidden" name="ticker" value="' + esc(info.ticker) + '">' +
      '<input type="hidden" name="name" value="' + esc(info.name) + '">' +
      '<input type="hidden" name="industry" value="' + esc(info.industry) + '">' +
      '<input type="hidden" name="l2" value="' + esc(info.l2) + '">' +
      '<input type="hidden" name="l3" value="' + esc(info.l3) + '">' +
      '<input type="hidden" name="board" value="' + esc(info.board) + '">' +
      '<input type="hidden" name="type" value="' + esc(info.lynch) + '">' +
      '<button class="btn primary sm" type="submit">＋ 加入估值池</button></form></details>';
  }

  /* ---------- 分析完成度链路（五步：财报→评级→估值→买点→台账） ----------
   * 用 Repo.completion() 统一判定，生成五枚小徽章：
   *   完成项 = 绿色 ✓；缺口 = 灰色 ✗，悬浮提示去哪补，点击直达对应操作：
   *     财报缺口 → 跳「财报跟踪」导入；评级/估值缺口 → 跳公司详情页；
   *     台账/买点缺口 → 跳「待击球」（已有条目时直接展开）。
   * 估值池/财报池/精简详情页/全局搜索共用本工具（window.CompanyCompletion）。
   */
  function completionChips(code6, opts){
    opts = opts || {};
    const info = Repo.completion(code6);
    if(!info) return '';
    const c6 = info.code6;
    const goCo = ' data-action="company.open" data-code="' + esc(c6) + '"';
    const goSwing = ' data-action="nav" data-view="swing"';
    const mk = (ok, label, okTip, missTip, missAttrs) => {
      const cls = ok ? 'ok' : 'miss';
      const mark = ok ? '✓' : '✗';
      const attrs = ok ? '' : (missAttrs || '');
      return '<span class="comp-chip ' + cls + '" title="' + esc(ok ? okTip : missTip) + '"' + attrs + '>' +
        mark + ' ' + label + '</span>';
    };
    const chips = [];
    // ① 财报：财报池有披露行
    chips.push(mk(info.earnings, '财报', '财报池已有披露行',
      '财报池无披露行：到「财报跟踪」导入财报 CSV', goSwing));
    // ② 评级：估值池正式评级 或 研究暂存区预评级
    chips.push(mk(info.rating, '评级' + (info.ratingGrade ? '·' + info.ratingGrade : ''), '已完成评级：' + (info.ratingGrade || ''),
      '未填写评级：在公司详情页评级区补齐', goCo));
    // ③ 估值：仅估值池公司有此项（非估值池公司没有估值记录是常态，不显示避免噪音）
    if(info.inValuation){
      chips.push(mk(info.valuation, '估值', '已有估值记录',
        '尚无估值记录：在公司详情页新增估值', goCo));
    }
    // ④⑤ 台账 / 买点：买点依赖台账条目，无台账时只显示「台账」一个缺口
    if(info.ledger){
      chips.push(mk(true, '台账', '已加入待击球台账', '', ''));
      const hasTicker = info.swingItem ? (info.swingItem.ticker || '') : '';
      chips.push(mk(info.buyPoint, '买点', '已填买点区间',
        '台账条目未填买点区间：跳转待击球补填',
        ' data-action="swing.openFromVal" data-ticker="' + esc(hasTicker) + '"'));
    } else {
      chips.push(mk(false, '台账', '已加入待击球台账',
        '未加入待击球台账：到「待击球」添加', goSwing));
    }
    return '<span class="comp-chips">' + chips.join('') + '</span>';
  }
  window.CompanyCompletion = { chips: completionChips };

  /* ---------- 对外接口 ---------- */
  window.CompanyPage = { open: open, back: back, backLabel: backLabel };

  Register.module({
    view: 'company',
    render: render,
    actions: {
      'company.open': el => {
        /* 来源视图 = 点击时的当前视图（各列表页公司名 / 详情按钮统一走此入口） */
        open({
          code6: el.dataset.code || '',
          ticker: el.dataset.ticker || '',
          name: el.dataset.name || '',
        }, state.view);
      },
      'company.back': () => back(),
      /* 页头「🔗 加入估值池」：展开底部解锁区并滚动定位 */
      'company.revealJoin': () => {
        const d = document.querySelector('details.val-section.co-unlock');
        if(d){ d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      },

      /* ----- 非估值池公司 · 分析暂存区编辑（co.*：决策要点 / 评级 / 研究） ----- */
      'co.editNote': el => {
        const N = notesOf(el.dataset.code);
        openModal('公司描述 · ' + (el.dataset.name || ''),
          '<input type="hidden" name="code" value="' + esc(el.dataset.code) + '">' +
          mdField('text', '主业与商业模式 · 核心竞争优势 · 当前关注逻辑（支持 Markdown）', N.note, 6),
          'co.saveNote');
      },
      'co.condMark': el => {
        const N = notesOf(el.dataset.code);
        const conds = N.invalidConds || [];
        const x = conds[parseInt(el.dataset.i, 10)];
        if(x == null) return;
        N.condMarks = N.condMarks || {};
        if(el.dataset.v) N.condMarks[x] = el.dataset.v;
        else delete N.condMarks[x];          // ↺ 清除标记 → 回到未验证
        save(); render();
      },
      'co.condDel': el => {
        const N = notesOf(el.dataset.code);
        const i = parseInt(el.dataset.i, 10);
        if(!N.invalidConds || i < 0 || i >= N.invalidConds.length) return;
        const removed = N.invalidConds.splice(i, 1)[0];
        if(N.condMarks && removed in N.condMarks) delete N.condMarks[removed];
        save(); render();
      },
      'co.ratingAuto': el => {
        const N = notesOf(el.dataset.code);
        const r = N.rating = (N.rating && typeof N.rating === 'object') ? N.rating : { scores: {}, flags: {} };
        const sug = ValCore.ratingAutoGrade(r.scores || {}, r.flags || {});
        r.grade = sug.grade || '';
        save(); render();
        toast('⚖ 自动评级：' + (sug.grade || '未评级') + '（' + sug.sum + '/16 分' + (sug.notes.length ? ' · ' + sug.notes.join('；') : '') + '）');
      },
      'co.researchEdit': el => {
        const code = el.dataset.code;
        const N = notesOf(code);
        const g = el.dataset.rid ? (N.researchLog || []).find(x => x.id === el.dataset.rid) : null;
        openModal(g ? '编辑研究记录' : '添加研究记录',
          '<input type="hidden" name="code" value="' + esc(code) + '">' +
          (g ? '<input type="hidden" name="rid" value="' + esc(g.id) + '">' : '') +
          '<div class="quick-row"><div class="field" style="flex:none;width:160px"><label>日期</label><input type="date" name="date" value="' + esc(g ? (g.date || '') : dateStr()) + '"></div></div>' +
          '<div class="field"><label>研究内容（业务判断 / 关注重点 / 关键影响因素，支持 Markdown）</label><textarea name="text" rows="8">' + esc(g ? (g.text || '') : '') + '</textarea></div>',
          'co.saveResearch');
      },
      'co.researchDel': el => {
        const N = notesOf(el.dataset.code);
        if(!N.researchLog) return;
        if(confirm('删除该条研究记录？')){
          N.researchLog = N.researchLog.filter(x => x.id !== el.dataset.rid);
          save(); render();
        }
      },
    },
    changes: {
      /* 归档 / 评级打分 / 门控 / 手动覆盖：即改即存（与估值模块完整页同一交互模式） */
      'co.setTier': el => {
        const N = notesOf(el.dataset.code);
        N.tier = el.value || '';
        save(); render();
      },
      'co.setRatingScore': el => {
        const N = notesOf(el.dataset.code);
        const r = N.rating = (N.rating && typeof N.rating === 'object') ? N.rating : { scores: {}, flags: {} };
        r.scores = r.scores || {};
        if(el.value === '') delete r.scores[el.dataset.dim];
        else r.scores[el.dataset.dim] = Number(el.value);
        save(); render();
      },
      'co.setRatingFlag': el => {
        const N = notesOf(el.dataset.code);
        const r = N.rating = (N.rating && typeof N.rating === 'object') ? N.rating : { scores: {}, flags: {} };
        r.flags = r.flags || {};
        if(el.checked) r.flags[el.dataset.flag] = true;
        else delete r.flags[el.dataset.flag];
        save(); render();
      },
      'co.setRatingGrade': el => {
        const N = notesOf(el.dataset.code);
        const r = N.rating = (N.rating && typeof N.rating === 'object') ? N.rating : { scores: {}, flags: {} };
        r.grade = el.value || '';
        save(); render();
      },
      'co.setRatingNote': el => {
        const N = notesOf(el.dataset.code);
        const r = N.rating = (N.rating && typeof N.rating === 'object') ? N.rating : { scores: {}, flags: {} };
        r.note = el.value;
        save();
      },
    },
    forms: {
      'co.saveNote': fd => {
        const N = notesOf(String(fd.get('code') || ''));
        N.note = String(fd.get('text') || '').trim();
        save(); closeModal(); render();
        toast('✅ 公司描述已保存（加入估值池时自动带入）');
      },
      'co.addCond': fd => {
        const N = notesOf(String(fd.get('code') || ''));
        const add = String(fd.get('text') || '').split(/\r?\n|；|;/).map(s => s.trim()).filter(Boolean);
        if(!add.length) return;
        N.invalidConds = N.invalidConds || [];
        let n = 0;
        add.forEach(x => { if(!N.invalidConds.includes(x)){ N.invalidConds.push(x); n++; } });
        if(n < add.length) toast('ℹ️ ' + (add.length - n) + ' 条重复已跳过');
        if(n) toast('✅ 已添加 ' + n + ' 条条件');
        save(); render();
      },
      'co.saveResearch': fd => {
        const N = notesOf(String(fd.get('code') || ''));
        const text = String(fd.get('text') || '').trim();
        if(!text){ toast('⚠️ 请填写研究内容'); return; }
        const date = String(fd.get('date') || '');
        const rid = String(fd.get('rid') || '');
        N.researchLog = N.researchLog || [];
        if(rid){
          const g = N.researchLog.find(x => x.id === rid);
          if(g){ g.text = text; g.date = date; }
        } else {
          N.researchLog.push({ id: uid(), date: date, text: text });
        }
        save(); closeModal(); render();
        toast('✅ 研究记录已保存（加入估值池时自动带入）');
      },

      /* 非估值池公司 → 加入估值池（独立 handler：需写入 industryL2/L3，
         与 val.saveCompany 编辑弹窗口径互不影响） */
      'company.saveJoin': fd => {
        const code = normCode6(fd.get('code'));
        const ticker = String(fd.get('ticker') || '').trim() || fullTicker(code);
        if(!ticker){ toast('⚠️ 缺少股票代码，无法加入'); return; }
        const list = (DB.valuation && DB.valuation.companies) || [];
        const nt = normTicker(ticker);
        const dup = list.find(x => normTicker(x.ticker) === nt) ||
                    (code ? list.find(x => normCode6(x.ticker) === code) : null);
        if(dup){ toast('ℹ️ ' + (dup.name || ticker) + ' 已在估值池'); return; }
        const name = String(fd.get('name') || '').trim() || ticker;
        const q = (code && DB.quotes && DB.quotes[code]) || null;
        const qp = q ? Number(q.price) : 0;
        const nc = {
          id: uid(),
          name: name,
          ticker: ticker,
          market: 'A股',
          board: ['主板', '创业板', '科创板'].includes(fd.get('board')) ? fd.get('board') : '',
          industry: String(fd.get('industry') || ''),
          industryL2: String(fd.get('l2') || ''),
          industryL3: String(fd.get('l3') || ''),
          companyType: VAL_LYNCH_TYPES.some(t => t.key === fd.get('type')) ? String(fd.get('type')) : '',
          currency: 'CNY',
          currentPrice: qp > 0 ? qp : '',
          quote: q ? Object.assign({}, q) : null,
          financials: [], valuations: [], investments: [], research: '',
        };
        /* 迁移暂存分析：此前的决策要点 / 预评级 / 研究记录一并带入公司对象（移动语义） */
        const n = (code && DB.companyNotes) ? DB.companyNotes[code] : null;
        if(n){
          if(n.tier) nc.tier = n.tier;
          if(n.note) nc.note = n.note;
          if(n.invalidConds && n.invalidConds.length){ nc.invalidConds = n.invalidConds; nc.condMarks = n.condMarks || {}; }
          if(n.rating && (n.rating.grade || (n.rating.scores && Object.keys(n.rating.scores).length))) nc.rating = n.rating;
          if(n.researchLog && n.researchLog.length) nc.researchLog = n.researchLog;
          delete DB.companyNotes[code];
        }
        list.push(nc);
        save(); closeModal(); render();
        toast('✅ 已将 ' + name + ' 加入估值池' + (n ? '，此前分析已一并带入' : '') + '，详情页已解锁完整板块');
      },
    },
  });
})();
