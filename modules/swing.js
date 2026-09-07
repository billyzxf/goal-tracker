/* ============================================================
 * 待击球系统（swing）
 *
 * 定位：研读财报 → 初筛公司估值 → 导入待击球台账 → 严格按纪律执行买卖。
 * 仓位架构：核心仓 60%（咖啡罐长持，单票 ≤15%）/ 轮动仓 40%（其中 20% 做高抛低吸止盈，单票 ≤8%）/ 现金·另册周期仓。
 *
 * 数据复用原则（V1）：
 *   - 现价直接复用估值模块 DB.valuation.companies 的 currentPrice / quote（导入股价 CSV 刷新），
 *     本模块不存价格；未入估值的公司可用条目上的「手填现价」兜底。
 *   - 展开行附带复用财报跟踪 DB.earnings.rows 的最新披露数据（只读展示）。
 *
 * 纪律内建：
 *   - 距买点% =（现价 − 买点区间上沿）/ 上沿；>15% 显示"禁止击球"（铁律④）
 *   - 季度复核日临期（≤7天）高亮、过期标红；过期时击球弹窗红字警告（铁律①）
 *   - 卖出必先对照买入理由三行（防情绪化），卖出三分类：止损/止盈/周期离场
 *   - 跌破买点先查失效条件（展开行置顶展示），触发 = 撤单/止损（铁律③）
 * ============================================================ */
(function(){
  /* ---------- 常量 ---------- */
  const POOLS = ['核心候选', '轮动', '另册周期'];
  const POOL_CLS  = { '核心候选':'green', '轮动':'indigo', '另册周期':'amber' };
  const POOL_DESC = {
    '核心候选': '咖啡罐式长期持有（3-10年），单票上限 15%；须过核心仓准入三问',
    '轮动':    '击球执行 + 止盈操作（其中 20% 做高抛低吸），单票上限 8%',
    '另册周期': '商品周期仓，只按价格锚操作，不占轮动指标',
  };
  const STATUSES = ['待击球', '持仓中', '已止盈', '失效撤单'];
  const STATUS_CLS = { '待击球':'indigo', '持仓中':'pink', '已止盈':'green', '失效撤单':'gray' };

  const RULES = [
    ['买点时效', '每次财报披露后强制复核买点（中枢变了买点跟着变），锚定过期中枢 = 无效击球。'],
    ['分批规则', '触及买点区间分 2-3 批建仓，比例 4:3:3；第二批触发 = 较首仓再跌 8-10% 或 季报二次验证（二选一，写死）。'],
    ['失效条件是一等公民', '跌破买点不是加仓信号——先查失效条件是否触发。触发 = 撤单/止损；未触发 = 按计划加仓。'],
    ['禁止提前击球', '距买点 >15% 不建仓（长飞 52x 教训：估值恐高才是风控）。'],
    ['止盈规则化', '轮动仓 20%：到中枢合理区分批减 1/3 → 减持区再减 1/3 → 底仓跟趋势或周期离场信号。'],
    ['换仓门槛', '击球点到了但仓位满：只有新标的预期赔率显著优于持仓（保守估计差 ≥1 倍空间）才换，否则拒绝击球。'],
  ];

  /* ---------- 工具 ---------- */
  function num(v){
    if(v == null || v === '' || v === '-') return null;
    const n = Number(String(v).replace(/[,\s%]/g, ''));
    return isNaN(n) ? null : n;
  }
  function normTicker(t){ return String(t || '').trim().toUpperCase(); }
  function tickerKey(t){ return normTicker(t).split('.')[0]; }

  function findVal(ticker){
    const nt = normTicker(ticker); if(!nt) return null;
    const list = (DB.valuation && DB.valuation.companies) || [];
    return list.find(c => normTicker(c.ticker) === nt) ||
           list.find(c => tickerKey(c.ticker) && tickerKey(c.ticker) === tickerKey(nt)) || null;
  }

  /* 财报跟踪最新一条（复用 earnings 数据，只读展示） */
  function earningsLatest(it){
    const key = tickerKey(it.ticker); if(!key) return null;
    const rows = (DB.earnings && DB.earnings.rows) || [];
    const mine = rows.filter(r => tickerKey(r['股票代码']) === key);
    if(!mine.length) return null;
    mine.sort((a, b) => String(b['披露日期']||'').localeCompare(String(a['披露日期']||'')));
    return mine[0];
  }

  /* 现价：优先估值模块行情（导入股价CSV刷新），否则条目手填现价兜底
     与公司估值模块完全同一数据源（DB.valuation.companies.currentPrice / quote.date） */
  function priceInfo(it){
    const c = findVal(it.ticker);
    if(c && (c.currentPrice || 0) > 0){
      return { price: c.currentPrice, date: (c.quote && c.quote.date) || '', src: 'quote' };
    }
    if((it.manualPrice || 0) > 0) return { price: it.manualPrice, date: '', src: 'manual' };
    return null;
  }

  /* 最新估值记录（复用估值模块 c.valuations，按日期倒序取第一条） */
  function latestValuation(ticker){
    const c = findVal(ticker);
    const vals = (c && c.valuations) || [];
    return vals.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
  }

  /* 距买点% =（现价 − 买点上沿）/ 上沿 ×100；负数 = 已到买点 */
  function gapPct(it){
    const pi = priceInfo(it);
    if(!pi || !it.buyHigh) return null;
    return (pi.price - it.buyHigh) / it.buyHigh * 100;
  }

  function fmtN(v, d){
    if(v == null || isNaN(v)) return '';
    return String(parseFloat(Number(v).toFixed(d == null ? 2 : d)));
  }
  /* 买点区间文案：low+high → "low–high"；仅 high → "≤high"（草案"≤82"口径）；low=high → "≈high" */
  function fmtBuy(it){
    if(it.buyHigh == null && it.buyLow == null) return '<span class="muted">—</span>';
    if(it.buyLow != null && it.buyHigh != null && it.buyLow !== it.buyHigh) return fmtN(it.buyLow) + ' – ' + fmtN(it.buyHigh);
    const v = it.buyHigh != null ? it.buyHigh : it.buyLow;
    const pre = it.buyLow == null ? '≤' : '≈';
    return pre + fmtN(v);
  }
  function fmtGap(g){
    if(g == null) return '<span class="muted">—</span>';
    const txt = (g > 0 ? '+' : '') + g.toFixed(1) + '%';
    if(g <= 0) return '<span class="swing-gap-tag hit" title="已到买点区间，按分批计划执行">已到买点</span>';
    if(g <= 15) return '<span class="swing-gap-tag hot" title="候击区：接近买点，暂不建仓（铁律④）">' + txt + '</span>';
    return '<span class="swing-gap-tag" title="距买点 >15%，禁止击球（铁律④）">' + txt + '</span>';
  }
  /* 复核日距今天数（T00:00:00 规避时区） */
  function daysTo(ds){
    if(!ds) return null;
    const t = new Date(ds + 'T00:00:00') - new Date(dateStr() + 'T00:00:00');
    return Math.round(t / 86400000);
  }
  function addMonths(ds, m){
    if(!ds) return '';
    const d = new Date(ds + 'T00:00:00');
    d.setMonth(d.getMonth() + m);
    return d.toISOString().slice(0, 10);
  }
  function pushEvent(it, text){
    it.events.push({ date: dateStr(), text: text });
    if(it.events.length > 50) it.events = it.events.slice(-50);
    it.updatedAt = dateStr();
  }
  function todayWarn(it){
    const d = daysTo(it.nextReview);
    return d != null && d < 0;
  }

  /* ---------- 默认数据 ---------- */
  function mk(o){
    return Object.assign({
      id: uid(), form: '', pool: '轮动', hub: null, buyLow: null, buyHigh: null, trimZone: null,
      invalidConds: [], cycleAnchor: '', status: '待击球', manualPrice: null,
      nextReview: '2026-10-31', reasons: { r1:'', r2:'', r3:'' }, note: '',
      events: [], createdAt: dateStr(), updatedAt: dateStr(),
    }, o);
  }
  function seed(){
    return { seedDataVersion: 1, items: [
      /* —— 首批导入标的（2026-09-03 收盘草案，现价以估值模块行情为准 / 未入估值的用手填价兜底） —— */
      mk({ id:'sw-seed-01', ticker:'002008.SZ', name:'大族激光', form:'AI PCB 设备超预期', buyHigh:82,
           invalidConds:['在手订单增速转负','H1 现金流未回补'],
           note:'已估值：valuations/大族激光_估值报告_20260831.md' }),
      mk({ id:'sw-seed-02', ticker:'001389.SZ', name:'广合科技', form:'AI 服务器 PCB 超预期', buyHigh:145, manualPrice:154.36,
           invalidConds:['Q3 毛利率跌破 38%','云擎智造爬坡失败'] }),
      mk({ id:'sw-seed-03', ticker:'003022.SZ', name:'联泓新科', form:'EVA/新材料超预期', buyHigh:18.3, buyLow:18.3, manualPrice:19.54,
           invalidConds:['EVA 价格指数破位下行','格润爬坡不及预期'] }),
      mk({ id:'sw-seed-04', ticker:'603061.SH', name:'金海通', form:'测试分选机超预期', buyHigh:290,
           invalidConds:['H2 营收 <8亿（指引失效）','Q3 现金流未回补'],
           note:'已估值：valuations/金海通_估值报告_20260831.md' }),
      mk({ id:'sw-seed-05', ticker:'002841.SZ', name:'视源股份', form:'板卡+教育业务修复', buyHigh:45, buyLow:45, manualPrice:49.72,
           invalidConds:['存储涨价退坡后板卡毛利率大幅回吐','Q3 现金流未回补'] }),
      mk({ id:'sw-seed-06', ticker:'002648.SZ', name:'卫星化学', form:'轻烃价差超预期', buyHigh:25, buyLow:25,
           invalidConds:['乙烷价格趋势性反弹超 30%'],
           note:'已估值：valuations/卫星化学_估值报告_20260831.md' }),
      mk({ id:'sw-seed-07', ticker:'001232.SZ', name:'嘉立创', form:'EDA+多层板超预期', buyHigh:115, buyLow:115,
           invalidConds:['多层板增速转负','现金流恶化'],
           note:'已估值：valuations/嘉立创_估值报告_20260831.md' }),
      mk({ id:'sw-seed-08', ticker:'600487.SH', name:'亨通光电', form:'海缆+光通信超预期', buyHigh:59, buyLow:59,
           invalidConds:['海缆订单萎缩','光棒价格战重启'],
           note:'已估值：valuations/亨通光电_估值报告_20260831.md' }),
      mk({ id:'sw-seed-09', ticker:'603893.SH', name:'瑞芯微', form:'SoC 国产化超预期', buyHigh:130,
           invalidConds:['Q3 毛利率跌破 45%','RK182X 放量不及预期'],
           note:'已估值：valuations/瑞芯微_估值报告_20260831.md' }),
      mk({ id:'sw-seed-10', ticker:'600601.SH', name:'方正科技', form:'PCB 产能释放超预期', buyHigh:9.5, buyLow:9.5,
           invalidConds:['Q3 毛利率环比回落','2027 断档提前'],
           note:'已估值：valuations/方正科技_估值报告_20260831.md' }),
      mk({ id:'sw-seed-11', ticker:'601869.SH', name:'长飞光纤', form:'空芯光纤超预期', buyHigh:220, buyLow:220, manualPrice:406.94,
           invalidConds:['空芯光纤集采价大幅下调'] }),
      mk({ id:'sw-seed-12', ticker:'002916.SZ', name:'深南电路', form:'AI PCB + 载板超预期', buyHigh:300,
           invalidConds:['AI PCB 订单增速转负','毛利率连续两季回落'],
           note:'已估值：失效条件沿用 valuations/深南电路_估值报告_20260831.md' }),
      mk({ id:'sw-seed-13', ticker:'002602.SZ', name:'世纪华通', form:'游戏流水超预期', buyHigh:12.5, manualPrice:13.97,
           invalidConds:['游戏流水增速转负','新游表现不及预期'],
           note:'已估值：失效条件沿用 valuations/世纪华通_估值报告_20260831.md（如未导入该报告请自行校准）' }),
      mk({ id:'sw-seed-14', ticker:'603019.SH', name:'中科曙光', form:'算力服务器超预期', buyHigh:62,
           invalidConds:['海光信息股价大幅波动','算力订单增速转负'],
           note:'已估值（SOTP 分部，海光敞口）：valuations/中科曙光_估值报告_20260831.md' }),
      mk({ id:'sw-seed-15', ticker:'603268.SH', name:'松发股份', form:'新造船周期超预期', buyHigh:130,
           invalidConds:['新造船价格指数环比转负'],
           note:'已估值：valuations/松发股份_估值报告_20260831.md' }),
    ] };
  }

  /* ---------- 渲染 ---------- */
  function statCard(label, val, sub){
    return '<div class="val-stat"><div class="vs-label">' + label + '</div><div class="vs-value">' + val + '</div>' +
      (sub ? '<div class="vs-sub muted">' + sub + '</div>' : '') + '</div>';
  }

  function renderSwing(){
    state.swingKw = state.swingKw || '';
    state.swingStatus = state.swingStatus || '全部';
    state.swingPool = state.swingPool || '全部';
    state.swingSort = state.swingSort || 'gap';
    state.swingSortDir = state.swingSortDir || 'asc';

    const items = DB.swing.items || [];
    /* 统计（只统计待击球/持仓中） */
    const active = items.filter(x => x.status === '待击球' || x.status === '持仓中');
    const hitCnt   = items.filter(x => x.status === '待击球' && gapPct(x) != null && gapPct(x) <= 0).length;
    const hotCnt   = items.filter(x => x.status === '待击球' && gapPct(x) != null && gapPct(x) > 0 && gapPct(x) <= 15).length;
    const reviewCnt = active.filter(x => { const d = daysTo(x.nextReview); return d != null && d <= 7; }).length;
    const lastPriceDate = items.map(x => priceInfo(x)).filter(p => p && p.date).map(p => p.date).sort().pop() || '';

    /* 筛选 + 排序 */
    let list = items.slice();
    if(state.swingStatus !== '全部') list = list.filter(x => x.status === state.swingStatus);
    if(state.swingPool !== '全部') list = list.filter(x => x.pool === state.swingPool);
    if(state.swingKw){
      const kw = state.swingKw.toLowerCase();
      list = list.filter(x => kwMatch((x.name || '') + ' ' + normTicker(x.ticker) + ' ' + (x.form || ''), kw));
    }
    const dir = state.swingSortDir === 'asc' ? 1 : -1;
    const key = state.swingSort;
    list.sort((a, b) => {
      let va, vb;
      if(key === 'gap'){ va = gapPct(a); vb = gapPct(b); }
      else { va = a[key]; vb = b[key]; }
      if(va == null && vb == null) return 0;
      if(va == null) return 1;          // 空值沉底
      if(vb == null) return -1;
      if(typeof va === 'string') return va.localeCompare(vb) * dir;
      return (va - vb) * dir;
    });

    /* 头部 */
    let h = header('🎯 待击球', '击球纪律台账 · 严格按纪律执行买卖 · 现价/名称复用估值与财报跟踪模块' +
      (lastPriceDate ? ' · 行情快照 ' + esc(lastPriceDate) : ''),
      '<button class="btn primary sm" data-action="swing.add">＋ 新增标的</button>');

    /* 统计卡 */
    h += '<div class="val-summary-grid">' +
      statCard('待击球', items.filter(x => x.status === '待击球').length, '台账中等待买点的标的') +
      statCard('持仓中', items.filter(x => x.status === '持仓中').length, '已击球持仓') +
      statCard('已到买点', hitCnt, '距买点 ≤0（待击球）') +
      statCard('候击区', hotCnt, '0 < 距买点 ≤15%（铁律④禁建仓）') +
      statCard('复核临期', reviewCnt, '复核日 ≤7 天 / 已过期，需强制重估买点') +
      '</div>';

    /* 仓位架构卡 + 六铁律卡 */
    h += '<div class="swing-arch">' +
      POOLS.map(p => '<div class="card swing-arch-col"><b>' + p + '</b><div class="muted" style="font-size:12px;margin-top:4px">' + POOL_DESC[p] + '</div></div>').join('') +
      '</div>';
    h += '<div class="card" style="margin:10px 0">';
    h += '<div style="display:flex;align-items:center;justify-content:space-between"><b>⚾ 击球六条铁律</b>' +
      '<button class="btn ghost sm" data-action="swing.toggleRules">' + (state.swingRulesOpen ? '收起' : '展开') + '</button></div>';
    if(state.swingRulesOpen){
      h += '<ol class="swing-rule-list">' + RULES.map(r => '<li><b>' + r[0] + '：</b>' + r[1] + '</li>').join('') + '</ol>';
      h += '<div class="hint" style="margin-top:6px">核心仓准入三问：值得持 3 年吗？失效条件清单写了吗？跌 30% 你会加仓还是逃跑？——答不好就留在轮动仓。</div>';
    }
    h += '</div>';

    /* 筛选行 */
    h += '<div class="chips" style="margin-bottom:8px">' +
      ['全部'].concat(STATUSES).map(s => '<button class="chip' + (state.swingStatus === s ? ' active' : '') + '" data-action="swing.fStatus" data-v="' + s + '">' + s + '</button>').join('') +
      '<span class="muted" style="margin:0 4px">|</span>' +
      ['全部'].concat(POOLS).map(s => '<button class="chip' + (state.swingPool === s ? ' active' : '') + '" data-action="swing.fPool" data-v="' + s + '">' + s + '</button>').join('') +
      '</div>';
    h += '<div style="margin-bottom:10px"><input type="text" class="kw-search" data-input="swing.kw" value="' + esc(state.swingKw) + '" placeholder="搜索名称 / 代码 / 形态（支持拼音）" style="max-width:320px"></div>';

    /* 主表 */
    if(!list.length){
      h += '<div class="empty">没有符合条件的标的。点击「＋ 新增标的」添加，或在估值模块公司详情页点「🎯 加入待击球」。</div>';
      return h;
    }
    const th = (label, k, extraCls) => {
      const arrow = state.swingSort === k ? (state.swingSortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th' + (extraCls ? ' class="' + extraCls + '"' : '') + (k ? ' data-action="swing.sort" data-key="' + k + '" style="cursor:pointer"' : '') + '>' + label + arrow + '</th>';
    };
    h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
      th('标的') + th('仓位') + th('状态') + th('买点区间', 'buyHigh') + th('中枢', 'hub', 'swing-opt') +
      th('减持区', 'trimZone', 'swing-opt') + th('现价') + th('距买点', 'gap') +
      th('估值数据') + th('复核日', 'nextReview') + th('操作') +
      '</tr></thead><tbody>';
    list.forEach(it => { h += rowHtml(it); if(state.swingDetailId === it.id) h += detailHtml(it); });
    h += '</tbody></table></div>';
    return h;
  }

  function rowHtml(it){
    const c = findVal(it.ticker);
    const pi = priceInfo(it);
    const d = daysTo(it.nextReview);
    let reviewHtml = esc(it.nextReview || '—');
    if(d != null && d < 0) reviewHtml = '<span class="swing-review-over">' + reviewHtml + ' ⚠需重估</span>';
    else if(d != null && d <= 7) reviewHtml = '<span class="swing-review-warn">' + reviewHtml + '</span>';

    /* 操作列：按状态出现 */
    let ops = '';
    if(it.status === '待击球') ops += '<button class="btn primary sm" data-action="swing.hit" data-id="' + it.id + '">击球</button> ';
    if(it.status === '持仓中') ops += '<button class="btn sm" data-action="swing.sell" data-id="' + it.id + '">卖出</button> ';
    ops += '<button class="btn ghost sm" data-action="swing.review" data-id="' + it.id + '" title="财报披露后强制复核买点（铁律①）">复核</button> ';
    ops += '<button class="icon-btn" data-action="swing.toggleRow" data-id="' + it.id + '" title="展开详情">▾</button>' +
           '<button class="icon-btn" data-action="swing.edit" data-id="' + it.id + '" title="编辑">✎</button>' +
           '<button class="icon-btn" data-action="swing.del" data-id="' + it.id + '" title="删除（不进回收站，建议先导出备份）">✕</button>';

    /* 名称：已入估值可点击跳转估值详情；未入估值行内「➕估值」一键补齐 */
    const nm = esc(it.name || (c && c.name) || it.ticker);
    const nameHtml = (c
      ? '<b class="swing-name-link" data-action="swing.openVal" data-ticker="' + esc(it.ticker) + '" title="到公司估值模块查看详情">' + nm + '</b>'
      : '<b>' + nm + '</b> <button class="btn ghost sm" data-action="swing.addVal" data-ticker="' + esc(it.ticker) + '" data-name="' + esc(it.name || '') + '" title="加入公司估值，获得现价/行情/估值数据">➕估值</button>') +
      '<div class="muted" style="font-size:11px">' + esc(normTicker(it.ticker)) +
      (c ? '' : ' · <span title="未加入估值模块，现价为手填">未入估值</span>') +
      (it.form ? '<br>' + esc(it.form) : '') + '</div>';

    /* 估值数据：估值模块最新一条估值记录（价格 + 日期 + 方法） */
    const v = latestValuation(it.ticker);
    const valHtml = v
      ? fmtN(v.estimatedValue) + '<div class="muted" style="font-size:11px">' + esc(v.date || '') + (v.method ? ' · ' + esc(v.method) : '') + '</div>'
      : (c ? '<span class="muted" style="font-size:12px">无估值记录</span>' : '<span class="muted">—</span>');

    /* 现价 cell：quote 来源时带当日涨跌幅（口径与估值模块一致，涨红跌绿） */
    let priceHtml = '<span class="muted">—</span>';
    if(pi){
      const q = (pi.src === 'quote' && c && c.quote) ? c.quote : null;
      let sub;
      if(q && (q.pct != null || q.chg != null)){
        const cls = (q.pct || 0) >= 0 ? 'up' : 'down';
        const flag = (q.pct || 0) > 0 ? '▲' : ((q.pct || 0) < 0 ? '▼' : '');
        const chgStr = q.chg != null ? ((q.chg > 0 ? '+' : '') + q.chg.toFixed(2)) : '';
        const pctStr = q.pct != null ? ((q.pct > 0 ? '+' : '') + q.pct.toFixed(2) + '%') : '';
        sub = '<div class="' + cls + '" style="font-size:11px"' + (q.date ? ' title="行情快照 ' + esc(q.date) + '"' : '') + '>' +
          [flag, chgStr, pctStr].filter(Boolean).join(' ') + '</div>';
      } else {
        sub = '<div class="muted" style="font-size:11px">' + (pi.src === 'quote' ? esc(pi.date || '行情') : '手填') + '</div>';
      }
      priceHtml = fmtN(pi.price) + sub;
    }

    return '<tr data-action="swing.toggleRow" data-id="' + it.id + '" style="cursor:pointer">' +
      '<td>' + nameHtml + '</td>' +
      '<td><span class="badge ' + (POOL_CLS[it.pool] || 'gray') + '" title="' + esc(POOL_DESC[it.pool] || '') + '">' + esc(it.pool) + '</span></td>' +
      '<td><span class="badge ' + (STATUS_CLS[it.status] || 'gray') + '">' + esc(it.status) + '</span></td>' +
      '<td>' + fmtBuy(it) + '</td>' +
      '<td class="swing-opt">' + (it.hub != null ? fmtN(it.hub) : '<span class="muted">—</span>') + '</td>' +
      '<td class="swing-opt">' + (it.trimZone != null ? fmtN(it.trimZone) : '<span class="muted">—</span>') + '</td>' +
      '<td>' + priceHtml + '</td>' +
      '<td>' + fmtGap(gapPct(it)) + '</td>' +
      '<td>' + valHtml + '</td>' +
      '<td>' + reviewHtml + '</td>' +
      '<td style="white-space:nowrap">' + ops + '</td>' +
      '</tr>';
  }

  function detailHtml(it){
    const e = earningsLatest(it);
    const rs = it.reasons || {};
    const hasReasons = rs.r1 || rs.r2 || rs.r3;

    let h = '<tr class="swing-detail-row"><td colspan="11">';
    h += '<div class="swing-detail-grid">';

    /* 失效条件（一等公民，置顶） */
    h += '<div><b>⛔ 失效条件</b>（跌破买点先查这里，触发 = 撤单/止损，铁律③）<ul class="swing-events">' +
      (it.invalidConds && it.invalidConds.length ? it.invalidConds.map(x => '<li>' + esc(x) + '</li>').join('') : '<li class="muted">（未填写——去「✎ 编辑」补上，失效条件是一等公民）</li>') + '</ul></div>';

    /* 买入理由三行 */
    h += '<div><b>📝 买入理由（三行）</b>' + (hasReasons ? '' : '<span class="muted">（击球时填写，卖出时对照复盘）</span>') +
      '<ul class="swing-events">' +
      '<li>' + (rs.r1 ? esc(rs.r1) : '<span class="muted">① —</span>') + '</li>' +
      '<li>' + (rs.r2 ? esc(rs.r2) : '<span class="muted">② —</span>') + '</li>' +
      '<li>' + (rs.r3 ? esc(rs.r3) : '<span class="muted">③ —</span>') + '</li></ul></div>';

    /* 财报跟踪复用（口径与 earnings.js 一致：同比/毛利率列原始值即百分数） */
    h += '<div><b>📊 财报跟踪（最新）</b>';
    if(e){
      const pct = (k, d) => { const v = num(e[k]); return v == null ? '—' : v.toFixed(d == null ? 1 : d) + '%'; };
      const qty = (k, d) => { const v = num(e[k]); return v == null ? '—' : v.toFixed(d == null ? 2 : d) + ' 亿'; };
      h += '<ul class="swing-events"><li>披露日期 ' + esc(e['披露日期'] || '—') + ' · ' + esc(e['季度'] || e['报告期'] || '') + '</li>' +
        '<li>营收同比 ' + pct('营收同比') +
        ' · 扣非同比 ' + pct('扣非净利同比') +
        ' · 毛利率 ' + pct('毛利率') + '</li>' +
        '<li>经营现金流 ' + qty('经营现金流') + '（现金流未回补 = 常见失效信号）</li></ul>';
    } else {
      h += '<div class="muted" style="font-size:12px">财报跟踪模块暂无该公司数据（导入财报 CSV 后自动带出）</div>';
    }
    h += '</div>';

    /* 周期离场锚 + 备注 */
    if(it.pool === '另册周期' || it.cycleAnchor){
      h += '<div><b>⚓ 周期离场锚</b><div style="font-size:13px;margin-top:4px">' + (it.cycleAnchor ? esc(it.cycleAnchor) : '<span class="muted">未填写</span>') + '</div><div class="hint">价格锚见顶 → 周期离场，不看 PE（卖出三分类）</div></div>';
    }
    if(it.note){
      h += '<div><b>📌 备注</b><div style="font-size:13px;margin-top:4px">' + esc(it.note) + '</div></div>';
    }

    /* 事件记录 */
    h += '<div><b>🕘 事件记录</b><ul class="swing-events">' +
      (it.events && it.events.length ? it.events.slice(-10).reverse().map(ev => '<li><span class="muted">' + esc(ev.date) + '</span> ' + esc(ev.text) + '</li>').join('') : '<li class="muted">暂无</li>') +
      '</ul></div>';

    h += '</div>';
    h += '</td></tr>';
    return h;
  }

  /* ---------- 弹窗 ---------- */
  function fieldNum(name, label, v, step, ph){
    return '<div class="field"><label>' + label + '</label><input type="number" step="' + (step || '0.01') + '" name="' + name + '" value="' + (v == null ? '' : v) + '" placeholder="' + (ph || '') + '"></div>';
  }
  function openForm(it){
    const isNew = !it;
    it = it || mk({});
    openModal(isNew ? '新增击球标的' : '编辑 · ' + (it.name || it.ticker),
      '<div class="quick-row">' +
        '<div class="field" style="flex:1"><label>公司名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required value="' + esc(it.name || '') + '" placeholder="如：大族激光"></div>' +
        '<div class="field" style="flex:none;width:150px"><label>代码 <span style="color:var(--red)">*</span></label><input type="text" name="ticker" required value="' + esc(normTicker(it.ticker)) + '" placeholder="如：002008.SZ"></div>' +
        '<div class="field" style="flex:1;min-width:140px"><label>超预期形态</label><input type="text" name="form" value="' + esc(it.form || '') + '" placeholder="如：第2种超预期形态"></div>' +
      '</div>' +
      '<div class="quick-row">' +
        '<div class="field"><label>仓位类型</label><select name="pool">' + POOLS.map(p => '<option' + (it.pool === p ? ' selected' : '') + ' title="' + esc(POOL_DESC[p]) + '">' + p + '</option>').join('') + '</select></div>' +
        fieldNum('hub', '估值中枢', it.hub) +
      '</div>' +
      '<div class="quick-row">' +
        fieldNum('buyLow', '买点下沿（可空）', it.buyLow) +
        fieldNum('buyHigh', '买点上沿（距买点%以此计算）', it.buyHigh) +
        fieldNum('trimZone', '减持区', it.trimZone) +
      '</div>' +
      '<div class="quick-row">' +
        '<div class="field" style="flex:1"><label>季度复核日（财报披露后强制重估）</label><input type="date" name="nextReview" value="' + esc(it.nextReview || '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>失效条件（每行一条，可验证、结构化；触发 = 无条件撤单/止损）</label>' +
        '<textarea name="invalidConds" rows="3" placeholder="如：Q3 经营现金流未回补&#10;如：在手订单增速转负">' + esc((it.invalidConds || []).join('\n')) + '</textarea></div>' +
      '<div class="quick-row">' +
        fieldNum('manualPrice', '手填现价（仅未入估值时用）', it.manualPrice) +
        '<div class="field" style="flex:2"><label>周期离场锚（另册周期专用，如 新造船价格指数）</label><input type="text" name="cycleAnchor" value="' + esc(it.cycleAnchor || '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>备注（估值报告位置、核心逻辑等）</label><textarea name="note" rows="2">' + esc(it.note || '') + '</textarea></div>' +
      '<input type="hidden" name="id" value="' + (it.id || '') + '">',
      'swing.form');
  }
  function openHit(it){
    const late = todayWarn(it);
    const g = gapPct(it);
    let warn = '';
    if(late) warn = '<div style="color:var(--red);font-weight:600;margin-bottom:8px">⚠ 复核日 ' + esc(it.nextReview) + ' 已过期：锚定过期中枢 = 无效击球（铁律①）。请先「复核」更新买点，再击球。</div>';
    if(g != null && g > 15) warn += '<div style="color:var(--red);font-weight:600;margin-bottom:8px">⚠ 当前距买点 ' + g.toFixed(1) + '%（>15%）：禁止提前击球（铁律④）。</div>';
    openModal('🎯 击球 · ' + (it.name || it.ticker),
      warn +
      '<div class="hint" style="margin-bottom:10px">买点 ' + fmtBuy(it) + ' · 现价距买点 ' + (g == null ? '—' : g.toFixed(1) + '%') + ' · 分批 4:3:3，第二批触发 = 再跌 8-10% 或 季报二次验证（铁律②）。跌破买点先查失效条件（铁律③）。</div>' +
      '<div class="field"><label>买入理由 ①（必填）</label><textarea name="r1" rows="2" required></textarea></div>' +
      '<div class="field"><label>买入理由 ②</label><textarea name="r2" rows="2"></textarea></div>' +
      '<div class="field"><label>买入理由 ③</label><textarea name="r3" rows="2"></textarea></div>' +
      '<input type="hidden" name="id" value="' + it.id + '">',
      'swing.hitForm');
  }
  function openSell(it){
    const rs = it.reasons || {};
    const isCycle = it.pool === '另册周期';
    openModal('卖出复盘 · ' + (it.name || it.ticker),
      '<div class="card" style="margin-bottom:12px"><b>买入时理由（对照复盘，防情绪化）</b><ul class="swing-events">' +
        '<li>' + (rs.r1 ? esc(rs.r1) : '<span class="muted">①（未记录）</span>') + '</li>' +
        '<li>' + (rs.r2 ? esc(rs.r2) : '<span class="muted">②（未记录）</span>') + '</li>' +
        '<li>' + (rs.r3 ? esc(rs.r3) : '<span class="muted">③（未记录）</span>') + '</li></ul></div>' +
      '<div class="quick-row">' +
        '<div class="field"><label>卖出类型（三分类）</label><select name="type">' +
          '<option value="止损">止损（失效条件触发 → 无条件清仓，不讲故事）</option>' +
          '<option value="止盈">止盈（价格到：估值回归中枢以上 / 减持区，分批规则化）</option>' +
          (isCycle ? '<option value="周期离场">周期离场（价格锚转向，不看 PE）</option>' : '') +
        '</select></div>' +
      '</div>' +
      '<div class="field"><label>卖出笔记（对照买入理由：逻辑变了还是价格到了？）</label><textarea name="note" rows="3"></textarea></div>' +
      '<input type="hidden" name="id" value="' + it.id + '">',
      'swing.sellForm');
  }
  function openReview(it){
    openModal('复核 · ' + (it.name || it.ticker),
      '<div class="hint" style="margin-bottom:10px">铁律①：每次财报披露后强制复核买点（中枢变了买点跟着变），锚定过期中枢 = 无效击球。可到「财报跟踪」核对最新披露数据。</div>' +
      '<div class="quick-row">' +
        '<div class="field"><label>复核结论</label><select name="concl">' +
          '<option value="维持">维持买点不变</option>' +
          '<option value="调整">调整买点（下方填新区间）</option>' +
          '<option value="失效">失效条件触发 → 撤单</option>' +
        '</select></div>' +
        '<div class="field" style="flex:none;width:170px"><label>下次复核日</label><input type="date" name="nextReview" value="' + esc(addMonths(it.nextReview || dateStr(), 3)) + '"></div>' +
      '</div>' +
      '<div class="quick-row">' +
        fieldNum('buyLow', '新买点下沿（调整时填）', it.buyLow) +
        fieldNum('buyHigh', '新买点上沿', it.buyHigh) +
        fieldNum('hub', '新估值中枢', it.hub) +
      '</div>' +
      '<div class="field"><label>复核笔记（新信息 / 中枢变化原因）</label><textarea name="note" rows="2"></textarea></div>' +
      '<input type="hidden" name="id" value="' + it.id + '">',
      'swing.reviewForm');
  }

  /* ---------- 注册 ---------- */
  Register.module({
    view: 'swing',
    nav: { ico:'⚾', label:'待击球', group:'投资追踪' },
    seed: seed,
    ensure: (db, sv) => {
      const v = db.swing;
      if(!Array.isArray(v.items)) v.items = sv.items;
      v.items.forEach(it => {
        if(!Array.isArray(it.invalidConds)) it.invalidConds = [];
        if(!Array.isArray(it.events)) it.events = [];
        if(!it.reasons) it.reasons = { r1:'', r2:'', r3:'' };
        if(!it.status || STATUSES.indexOf(it.status) < 0) it.status = '待击球';
        if(!it.pool || POOLS.indexOf(it.pool) < 0) it.pool = '轮动';
        it.ticker = normTicker(it.ticker);
      });
    },
    render: renderSwing,
    actions: {
      'swing.add': () => openForm(null),
      'swing.edit': el => {
        const it = DB.swing.items.find(x => x.id === el.dataset.id); if(it) openForm(it);
      },
      'swing.del': el => {
        const it = DB.swing.items.find(x => x.id === el.dataset.id); if(!it) return;
        if(confirm('确认删除「' + (it.name || it.ticker) + '」？删除不进回收站，建议先「导出备份」留档。')){
          DB.swing.items = DB.swing.items.filter(x => x.id !== it.id);
          save(); render();
        }
      },
      'swing.sort': el => {
        const key = el.dataset.key;
        if(state.swingSort === key) state.swingSortDir = state.swingSortDir === 'asc' ? 'desc' : 'asc';
        else { state.swingSort = key; state.swingSortDir = key === 'gap' ? 'asc' : 'desc'; }
        render();
      },
      'swing.fStatus': el => { state.swingStatus = state.swingStatus === el.dataset.v ? '全部' : el.dataset.v; render(); },
      'swing.fPool': el => { state.swingPool = state.swingPool === el.dataset.v ? '全部' : el.dataset.v; render(); },
      'swing.toggleRules': () => { state.swingRulesOpen = !state.swingRulesOpen; render(); },
      'swing.toggleRow': el => { state.swingDetailId = state.swingDetailId === el.dataset.id ? null : el.dataset.id; render(); },
      'swing.hit': el => {
        const it = DB.swing.items.find(x => x.id === el.dataset.id); if(!it) return;
        if(it.status !== '待击球'){ toast('ℹ️ 仅「待击球」状态可击球'); return; }
        openHit(it);
      },
      'swing.sell': el => {
        const it = DB.swing.items.find(x => x.id === el.dataset.id); if(!it) return;
        if(it.status !== '持仓中'){ toast('ℹ️ 仅「持仓中」状态可卖出'); return; }
        openSell(it);
      },
      'swing.review': el => {
        const it = DB.swing.items.find(x => x.id === el.dataset.id); if(it) openReview(it);
      },
      /* 台账 → 估值：未入估值的一键补齐（复用 earn.addVal 模式） */
      'swing.addVal': el => {
        const ticker = normTicker(el.dataset.ticker); if(!ticker) return;
        if(findVal(ticker)){ toast('ℹ️ 已在估值关注列表'); return; }
        DB.valuation.companies.push({
          id: uid(), name: el.dataset.name || ticker, ticker, market: 'A股',
          board: '', industry: '', companyType: '',
          financials: [], valuations: [], investments: [], research: '',
        });
        save(); render();
        toast('✅ 已加入估值跟踪，请到「公司估值」导入财务/行情 CSV');
      },
      'swing.openVal': el => {
        const c = findVal(el.dataset.ticker);
        if(!c){ toast('⚠️ 该公司尚未加入估值跟踪'); return; }
        state.valCompanyId = c.id;
        window.scrollTo(0, 0);
        if(state.view === 'valuation'){ render(); }
        else { location.hash = '#/valuation'; }
      },
      /* 估值 → 台账：公司详情页「🎯 加入待击球」 */
      'swing.addFromVal': el => {
        const ticker = normTicker(el.dataset.ticker); if(!ticker) return;
        if(DB.swing.items.some(x => tickerKey(x.ticker) === tickerKey(ticker))){ toast('ℹ️ 已在待击球台账'); return; }
        const it = mk({ ticker: ticker, name: el.dataset.name || ticker });
        pushEvent(it, '自估值模块加入');
        DB.swing.items.push(it);
        save();
        openForm(it);   // 直接打开编辑表单，补买点/失效条件
      },
      /* 估值 → 台账：公司详情页跳转到待击球并展开对应条目 */
      'swing.openFromVal': el => {
        const ticker = normTicker(el.dataset.ticker);
        const it = DB.swing.items.find(x => tickerKey(x.ticker) === tickerKey(ticker));
        if(!it){ toast('⚠️ 该公司在台账中未找到（可能已删除）'); return; }
        state.swingStatus = '全部'; state.swingPool = '全部'; state.swingKw = '';
        state.swingDetailId = it.id;
        window.scrollTo(0, 0);
        if(state.view === 'swing'){ render(); }
        else { location.hash = '#/swing'; }
      },
    },
    inputs: {
      'swing.kw': (function(){
        let t = 0;
        return function(el){ state.swingKw = el.value; clearTimeout(t); t = setTimeout(function(){ renderKeep('swing.kw'); }, 120); };
      })(),
    },
    forms: {
      /* 新增/编辑条目 */
      'swing.form': fd => {
        const id = fd.get('id');
        const ticker = normTicker(fd.get('ticker'));
        if(!ticker){ toast('⚠️ 代码必填'); return; }
        const numOrNull = s => { const v = parseFloat(s); return isNaN(v) ? null : v; };
        let it;
        if(id){
          it = DB.swing.items.find(x => x.id === id);
          if(!it) return;
          pushEvent(it, '编辑台账条目');
        } else {
          if(DB.swing.items.some(x => tickerKey(x.ticker) === tickerKey(ticker))){ toast('⚠️ 该代码已在台账中'); return; }
          it = mk({ ticker: ticker });
          pushEvent(it, '新建台账条目');
          DB.swing.items.push(it);
        }
        it.name = String(fd.get('name') || '').trim() || it.name || ticker;
        it.form = String(fd.get('form') || '').trim();
        it.pool = POOLS.indexOf(fd.get('pool')) >= 0 ? fd.get('pool') : '轮动';
        it.hub = numOrNull(fd.get('hub'));
        it.buyLow = numOrNull(fd.get('buyLow'));
        it.buyHigh = numOrNull(fd.get('buyHigh'));
        it.trimZone = numOrNull(fd.get('trimZone'));
        it.nextReview = String(fd.get('nextReview') || '') || null;
        it.invalidConds = String(fd.get('invalidConds') || '').split('\n').map(s => s.trim()).filter(Boolean);
        it.manualPrice = numOrNull(fd.get('manualPrice'));
        it.cycleAnchor = String(fd.get('cycleAnchor') || '').trim();
        it.note = String(fd.get('note') || '').trim();
        save(); closeModal(); render();
        toast('✅ 已保存「' + it.name + '」');
      },
      /* 击球：填理由三行 → 持仓中 */
      'swing.hitForm': fd => {
        const it = DB.swing.items.find(x => x.id === fd.get('id')); if(!it) return;
        const r1 = String(fd.get('r1') || '').trim();
        if(!r1){ toast('⚠️ 买入理由① 必填'); return; }
        it.reasons = { r1: r1, r2: String(fd.get('r2') || '').trim(), r3: String(fd.get('r3') || '').trim() };
        const pi = priceInfo(it);
        it.status = '持仓中';
        pushEvent(it, '击球买入' + (pi ? '（现价 ' + pi.price + '）' : '') + '，理由已记录');
        save(); closeModal(); render();
        toast('🎯 已击球：' + it.name + ' → 持仓中');
      },
      /* 卖出：对照理由复盘 → 已止盈 / 失效撤单 */
      'swing.sellForm': fd => {
        const it = DB.swing.items.find(x => x.id === fd.get('id')); if(!it) return;
        const type = String(fd.get('type') || '止盈');
        const note = String(fd.get('note') || '').trim();
        it.status = type === '止损' ? '失效撤单' : '已止盈';
        pushEvent(it, '卖出 · ' + type + (note ? '：' + note : ''));
        save(); closeModal(); render();
        toast('已卖出（' + type + '）：' + it.name + ' → ' + it.status);
      },
      /* 复核：更新复核日 / 调整买点 / 触发失效 */
      'swing.reviewForm': fd => {
        const it = DB.swing.items.find(x => x.id === fd.get('id')); if(!it) return;
        const numOrNull = s => { const v = parseFloat(s); return isNaN(v) ? null : v; };
        const concl = String(fd.get('concl') || '维持');
        const nextReview = String(fd.get('nextReview') || '') || it.nextReview;
        const changes = [];
        if(concl === '调整'){
          const nLow = numOrNull(fd.get('buyLow')), nHigh = numOrNull(fd.get('buyHigh')), nHub = numOrNull(fd.get('hub'));
          if(nLow !== it.buyLow || nHigh !== it.buyHigh || nHub !== it.hub){
            it.buyLow = nLow; it.buyHigh = nHigh; it.hub = nHub;
            changes.push('买点调整为 ' + (nLow != null && nHigh != null && nLow !== nHigh ? nLow + '–' + nHigh : (nHigh != null ? '≤' + nHigh : '—')) + (nHub != null ? '，中枢 ' + nHub : ''));
          }
        }
        if(concl === '失效') it.status = '失效撤单';
        it.nextReview = nextReview;
        const note = String(fd.get('note') || '').trim();
        pushEvent(it, '复核 · ' + concl + (changes.length ? '（' + changes.join('；') + '）' : '') + (note ? '：' + note : ''));
        save(); closeModal(); render();
        toast('✅ 已复核「' + it.name + '」' + (concl === '失效' ? '，已撤单' : ''));
      },
    },
  });

  /* 供估值模块调用：按代码查台账（已入台账则估值详情页不显示「加入待击球」按钮） */
  window.SwingLink = {
    findByTicker: t => DB.swing.items.find(x => normTicker(x.ticker) === normTicker(t) || (tickerKey(x.ticker) && tickerKey(x.ticker) === tickerKey(t))) || null,
  };
})();
