/* ================= 财报跟踪（earnings） =================
 * 跟踪财报披露后的最新财务数据，用于筛选财务质量与增长兼具的公司。
 *
 * 数据来源：scripts/fetch_earnings.py 生成的汇总 CSV
 *   data/earnings/财报跟踪_YYYYMMDD.csv
 * 前端「⬆ 导入财报 CSV」选择该文件即可加载。
 *
 * 功能：
 *   - 按每个指标排序（点击列头，营收同比/扣非净利同比/营收/净利…）
 *   - 剔除营收同比 < 40% 的公司（默认关闭，可手动开启）
 *   - 行业 / 板块 / 林奇类型标签筛选，区分公司
 *   - 展示披露日期，跟踪最近披露的财报
 *   - 与估值/行业模块联动：未跟踪的公司可「📈 公司」加入估值（带出行业/板块/林奇类型），
 *     所有公司可「🏭 行业」加入行业研究池（选已有行业或输入新名创建）；
 *   - 自定义指标：由两个内置指标做 + − × ÷ 计算生成新列（存 DB 持久化），
 *     可像普通指标一样排序，并支持按自定义指标筛选（对数值 / 对字段）
 */
(function(){
  // 指标列定义（key 与 fetch_earnings.py 的 OUT_COLUMNS 列名一致）
  // source:'csv' 表示来自导入的 CSV；'meta' 表示公司标签
  const METRICS = [
    { key:'披露日期', label:'披露日期', type:'date',   sortable:true },
    { key:'报告期',   label:'报告期',   type:'text',   sortable:true },
    { key:'季度',     label:'季度',     type:'text',   sortable:true },
    { key:'营业收入', label:'营业收入', unit:'亿', type:'num',    sortable:true },
    { key:'营收同比', label:'营收同比', unit:'%',  type:'pct',    sortable:true },
    { key:'毛利润',   label:'毛利润',   unit:'亿', type:'num',    sortable:true },
    { key:'净利润',   label:'净利润',   unit:'亿', type:'num',    sortable:true },
    { key:'扣非净利润', label:'扣非净利润', unit:'亿', type:'num', sortable:true },
    { key:'扣非净利同比', label:'扣非净利同比', unit:'%', type:'pct', sortable:true },
    { key:'经营现金流', label:'经营现金流', unit:'亿', type:'num', sortable:true },
    { key:'销售收现', label:'销售收现', unit:'亿', type:'num', sortable:true },
    { key:'资本开支', label:'资本开支', unit:'亿', type:'num',   sortable:true },
    { key:'ROE',      label:'ROE',      unit:'%',  type:'pct',    sortable:true },
    { key:'毛利率',   label:'毛利率',   unit:'%',  type:'pct',    sortable:true },
  ];
  const REVENUE_YOY_KEY = '营收同比';
  const MIN_REVENUE_YOY = 40;          // 营收同比过滤阈值（默认关闭，开启后剔除 <40%）

  // 行业配色（与 valuation 模块一致，独立维护避免跨模块耦合）
  const VAL_INDUSTRIES = [
    '电子', '计算机', '通信', '食品饮料', '汽车', '机械设备', '医药生物', '传媒',
    '交通运输', '轻工制造', '有色金属', '基础化工', '电力设备', '公用事业', '商贸零售',
    '家用电器', '建筑装饰', '国防军工', '环保', '银行', '非银金融', '石油石化',
    '煤炭', '钢铁', '纺织服饰', '社会服务', '农林牧渔', '建筑材料', '综合',
  ];
  const INDUSTRY_CLS = VAL_INDUSTRIES.reduce((m, i, idx) => {
    const cls = ['indigo','pink','amber','green','blue','orange','red','gray'];
    m[i] = cls[idx % cls.length];
    return m;
  }, {});
  // 板块 / 林奇类型配色
  const BOARD_CLS = { '主板':'indigo', '科创板':'pink', '创业板':'amber' };
  const LYNCH_CLS = {
    '快速增长型':'pink', '稳定增长型':'indigo', '缓慢增长型':'gray',
    '周期型':'amber', '困境反转型':'red', '隐蔽资产型':'green',
  };

  function seed(){
    return { rows: [], importedAt: null, customMetrics: [] };
  }

  // 从 DB 里读数据
  function dataRows(){
    const rows = DB.earnings.rows;
    // L0 静态字典回填：行业/二三级/板块缺失的行按代码补齐（幂等，只填空、不覆盖已有值；
    // stocks.json 未加载时 Repo.stocksIndex 回退 industryMap，均无则跳过）
    if(typeof Repo !== 'undefined' && Repo.stocksIndex){
      const idx = Repo.stocksIndex();
      if(Object.keys(idx).length){
        rows.forEach(r => {
          const s = idx[Repo.normCode6(r['股票代码'])];
          if(!s) return;
          if(!r['行业']) r['行业'] = s.sw1 || '';
          if(!r['行业二级']) r['行业二级'] = s.sw2 || '';
          if(!r['行业三级']) r['行业三级'] = s.sw3 || '';
          if(!r['板块'] && s.bd) r['板块'] = s.bd;
        });
      }
    }
    return rows;
  }

  // 统一行情快照（公司估值「⬆ 导入股价」写入 DB.quotes，全站共用）：按代码取现价/涨幅
  // （查找实现收敛到统一数据访问层 Repo，本模块只保留调用入口）
  function quoteOf(code){
    return Repo.quoteOf(code);
  }

  // 最近一次渲染过滤+排序后的公司列表（供「⬇ 导出 CSV」使用）
  let lastList = [];

  // ---- CSV 解析（与 valuation 一致的轻量解析器） ----
  function parseCsv(text){
    const out = [];
    const lines = String(text || '').split(/\r?\n/);
    for(const line of lines){
      if(!line.trim()) continue;
      if(line.trim().charAt(0) === '#') continue;   // 注释行
      const cells = [];
      let cur = '', inQ = false;
      for(let i=0;i<line.length;i++){
        const ch = line[i];
        if(inQ){ if(ch === '"'){ if(line[i+1] === '"'){ cur += '"'; i++; } else inQ = false; } else cur += ch; }
        else if(ch === '"') inQ = true;
        else if(ch === ','){ cells.push(cur); cur = ''; }
        else cur += ch;
      }
      cells.push(cur);
      out.push(cells);
    }
    return out;
  }

  function csvToRows(csvLines){
    // 找表头行（包含 股票代码 / 公司名称 等列）
    let header = null, headerIdx = -1;
    for(let i=0;i<csvLines.length;i++){
      const r = csvLines[i];
      if(!r.length) continue;
      const f = String(r[0] || '').trim();
      if(f === '股票代码'){ header = r.map(x => String(x).trim()); headerIdx = i; break; }
    }
    if(!header) return [];
    const rows = [];
    for(let i=headerIdx+1; i<csvLines.length; i++){
      const r = csvLines[i];
      if(!r.length) continue;
      const obj = {};
      header.forEach((col, ci) => {
        const raw = r[ci];
        obj[col] = (raw === undefined || raw === null) ? '' : String(raw).trim();
      });
      if(!obj['股票代码'] && !obj['公司名称']) continue;
      rows.push(obj);
    }
    return rows;
  }

  // ---- 与估值模块联动：按 ticker 查找估值关注公司（转发 Repo，实现收敛到统一数据访问层） ----
  function findValCompany(ticker){
    return Repo.companyByTicker(ticker);
  }

  // ---- 工具：数值化 ----
  function num(v){
    if(v == null || v === '' || v === '-') return null;
    const n = Number(String(v).replace(/[,\s%]/g, ''));
    return isNaN(n) ? null : n;
  }

  // ---- 自定义指标 ----
  // 定义存 DB.earnings.customMetrics：{name, op:'+'|'-'|'*'|'/', a, b}
  // 内部引用键为 '#名称'，操作数可以是内置指标或其他自定义指标（嵌套引用，不支持自引用）
  function getCustomMetrics(){ return Array.isArray(DB.earnings.customMetrics) ? DB.earnings.customMetrics : []; }
  function customKey(name){ return '#' + name; }
  const CM_OP_LABEL = { '+':'+', '-':'−', '*':'×', '/':'÷' };

  function computeCustom(row, def){
    const va = metricVal(row, def.a), vb = metricVal(row, def.b);
    if(va == null || vb == null) return null;
    switch(def.op){
      case '+': return va + vb;
      case '-': return va - vb;
      case '*': return va * vb;
      case '/': return vb === 0 ? null : va / vb;
    }
    return null;
  }

  // 取某行某指标的可比较数值
  //  - '#名称' → 自定义指标（递归求值）
  //  - 其他   → CSV 列数值化
  function metricVal(row, key){
    if(typeof key === 'string' && key.charAt(0) === '#'){
      const def = getCustomMetrics().find(d => customKey(d.name) === key);
      return def ? computeCustom(row, def) : null;
    }
    return num(row[key]);
  }

  // 自定义筛选条件：{key, op:'>='|'<='|'>'|'<', value, cmpField?}
  // cmpField=true 时 value 为另一字段名，做字段间比较（行内逐条对比）
  function applyCustomFilters(list, filters){
    (filters || []).forEach(f => {
      list = list.filter(r => {
        const lv = metricVal(r, f.key);
        const rv = f.cmpField ? metricVal(r, f.value) : f.value;
        if(lv == null || rv == null) return false;
        if(f.op === '>=') return lv >= rv;
        if(f.op === '<=') return lv <= rv;
        if(f.op === '>')  return lv > rv;
        if(f.op === '<')  return lv < rv;
        return true;
      });
    });
    return list;
  }

  // ---- 固定筛选：拆分为独立筛选项，可任意勾选组合（AND 叠加，勾得越多越严格）----
  // 缺数据或分母 ≤0 判不通过（宁缺毋滥）。short = 筛选钮上的简写，name = 完整口径。
  const PRESETS = [
    {
      id: 'l1', name: 'L1 真实性', icon: '🛡️',
      desc: '利润是不是真的（一票否决）',
      rules: [
        { short: '扣非≥30%', name: '扣非净利同比 ≥ 30%，且营收同比 > 0',
          why: '利润增长必须有收入配合',
          ok: r => { const a = num(r['扣非净利同比']), b = num(r['营收同比']);
                     return a != null && b != null && a >= 30 && b > 0; } },
        { short: '扣非/净利≥0.7', name: '扣非 ÷ 净利润 ≥ 0.7',
          why: '非经常性损益占比过高（反面：通富微电 0.44）',
          ok: r => { const a = num(r['扣非净利润']), b = num(r['净利润']);
                     return a != null && b > 0 && a / b >= 0.7; } },
        { short: '扣非≥1亿', name: '扣非净利润 > 0 且 ≥ 1 亿',
          why: '“亏损收窄”≠真实增长（反面：南京熊猫）',
          ok: r => { const a = num(r['扣非净利润']); return a != null && a >= 1; } },
        { short: '净现比≥0.8', name: '净现比 ≥ 0.8（经营现金流 ÷ 净利润）',
          why: '利润没有现金流背书（反面：金安国纪 0.39、宝胜 −5.01）',
          ok: r => { const a = num(r['经营现金流']), b = num(r['净利润']);
                     return a != null && b > 0 && a / b >= 0.8; } },
        { short: '收现比≥0.9', name: '收现比 ≥ 0.9（销售收现 ÷ 营业收入）',
          why: '收入未转化为真金白银（反面：金安 78.2%）',
          ok: r => { const a = num(r['销售收现']), b = num(r['营业收入']);
                     return a != null && b > 0 && a / b >= 0.9; } },
      ],
    },
  ];
  // 规则 id = 'l1:0' 形式；map 便于按 id 取规则
  const RULE_MAP = {};
  PRESETS.forEach(p => p.rules.forEach((rl, i) => { RULE_MAP[p.id + ':' + i] = { preset: p, rule: rl }; }));
  function activeRuleIds(){ return state.earnPresetRules || []; }
  // 全部规则 id（默认值 / 「全选」按钮共用，避免两处硬编码）
  function allRuleIds(){ return PRESETS.flatMap(p => p.rules.map((_, i) => p.id + ':' + i)); }

  /* ---------- 财报季进度面板 ----------
   * 估值池 ∪ 财报池全部公司，按「最新披露日期距今天数」分为：
   *   ✅ 已更新（≤ SEASON_FRESH_DAYS 天）/ ⏳ 待更新（> N 天或无数据）。
   * 财报季打开此面板即可看出哪些关注公司还没披露，点击行直达公司详情页。
   */
  const SEASON_FRESH_DAYS = 100;   // 最新披露距今 ≤ N 天视为「已更新」（约一个财报季）

  /* 性能要点（面板每次渲染都会调用，收起状态也在算，必须足够便宜）：
   *   1. 一次遍历财报行构建「代码 → 最新披露」索引，复杂度 O(M)；
   *      绝不能对每家公司各调一次 Repo.earnLatest（内部对全部财报行 filter+正则+sort，
   *      财报池上千家 × 数千行 = 数百万次匹配，页面会卡死数秒）。
   *   2. 结果按 DB.earnings.rows 引用缓存：搜索输入触发的重渲染直接复用，
   *      导入/清空财报（rows 数组被整体替换）后自动失效重算。 */
  let seasonCache = { rows: null, items: null };

  function seasonItems(){
    const rows = Repo.earningsRows();
    if(seasonCache.rows === rows && seasonCache.items) return seasonCache.items;

    const tMs = new Date(dateStr() + 'T00:00:00').getTime();
    // ① 估值池索引：code6 → 公司（一次遍历，代替逐家 Repo.company 的重复 find）
    const valMap = {};
    Repo.companies().forEach(co => {
      const c6 = Repo.normCode6(co.ticker || co.code);
      if(c6) valMap[c6] = co;
    });
    // ② 一次遍历财报行：每家公司只留最新披露日期（YYYY-MM-DD 字符串可直接字典序比较取最大）
    const latestMap = {};   // code6 → { date, name }
    rows.forEach(r => {
      const c6 = Repo.normCode6(r['股票代码']); if(!c6) return;
      const d = String(r['披露日期'] || '');
      const cur = latestMap[c6];
      if(!cur || d > cur.date) latestMap[c6] = { date: d, name: String(r['公司名称'] || '') };
    });
    // ③ 财报池公司（有披露行）
    const items = [];
    Object.keys(latestMap).forEach(c6 => {
      const lm = latestMap[c6];
      let days = null;
      if(lm.date){
        const dt = new Date(lm.date + 'T00:00:00');
        if(!isNaN(dt)) days = Math.floor((tMs - dt.getTime()) / 86400000);
      }
      const valCo = valMap[c6];
      items.push({
        code6: c6,
        name: (valCo && valCo.name) || lm.name,
        lastDate: lm.date, days: days,
        inVal: !!valCo, inEarn: true,
      });
    });
    // ④ 估值池独有公司（尚无财报行 → 无数据）
    Object.keys(valMap).forEach(c6 => {
      if(latestMap[c6]) return;
      items.push({ code6: c6, name: valMap[c6].name || '', lastDate: '', days: null, inVal: true, inEarn: false });
    });
    // 无数据的排最前（最需要补），其余按距今天数倒序（越久未披露越靠前）
    items.sort((a, b) => (a.days == null ? -1 : b.days == null ? 1 : b.days - a.days));
    seasonCache = { rows: rows, items: items };
    return items;
  }

  function seasonRow(x){
    const badges =
      (x.inVal ? '<span class="badge indigo" title="在估值池关注列表">估值</span> ' : '') +
      (x.inEarn ? '<span class="badge green" title="在财报跟踪池">财报</span>' : '');
    const dayTxt = x.days == null ? '<span class="muted">无数据</span>' : x.days + ' 天前';
    return '<tr data-action="company.open" data-code="' + esc(x.code6) + '" data-ticker="' + esc(Repo.fullTicker(x.code6)) + '" data-name="' + esc(x.name) + '" style="cursor:pointer" title="打开公司详情页">' +
      '<td><b>' + esc(x.name || '—') + '</b></td>' +
      '<td class="muted">' + esc(Repo.fullTicker(x.code6)) + '</td>' +
      '<td>' + (x.lastDate ? esc(x.lastDate) : '<span class="muted">—</span>') + '</td>' +
      '<td class="num">' + dayTxt + '</td>' +
      '<td>' + badges + '</td></tr>';
  }

  function seasonPanel(){
    const items = seasonItems();
    const fresh = items.filter(x => x.days != null && x.days <= SEASON_FRESH_DAYS);
    const stale = items.filter(x => x.days == null || x.days > SEASON_FRESH_DAYS);
    const open = !!state.earnSeasonOpen;
    let h = '<div class="card" style="margin-bottom:14px">' +
      '<div class="sec-title" style="cursor:pointer" data-action="earn.seasonToggle" title="点击展开/收起">' +
      '<h2>📅 财报季进度</h2>' +
      '<span class="muted">✅ 已更新 ' + fresh.length + ' · ⏳ 待更新 ' + stale.length + '（口径：最新披露 ≤' + SEASON_FRESH_DAYS + ' 天）</span>' +
      '<button class="btn ghost sm">' + (open ? '收起 ▲' : '展开 ▼') + '</button></div>';
    if(open){
      h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
        '<th>公司</th><th>代码</th><th>最新披露</th><th class="num">距今</th><th>所属池</th></tr></thead><tbody>';
      h += '<tr><td colspan="5" style="background:var(--bg2);font-weight:600">✅ 已更新（' + fresh.length + '）</td></tr>';
      h += fresh.map(seasonRow).join('') || '<tr><td colspan="5" class="muted">无</td></tr>';
      h += '<tr><td colspan="5" style="background:var(--bg2);font-weight:600">⏳ 待更新（' + stale.length + '）</td></tr>';
      h += stale.map(seasonRow).join('') || '<tr><td colspan="5" class="muted">无</td></tr>';
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h;
  }

  // ---- 渲染 ----
  function renderEarnings(){
    // L1 真实性默认全选：进入模块即只展示通过真实性筛选的公司，避免一进来就渲染全部公司；
    // 用户手动调整（取消部分规则）后不再重置，仅在「清空」数据时恢复默认。
    if(state.earnPresetRules == null) state.earnPresetRules = allRuleIds();
    const rows = dataRows();
    let h = header('📊 财报跟踪',
      '展示全部已有报告期的财报数据（每行 = 公司 × 报告期），默认按营业收入排序 · 共 ' + rows.length + ' 条财报记录',
      '<button class="btn ghost sm" data-action="earn.import" title="导入财报跟踪 CSV（data/earnings/财报跟踪_YYYYMMDD.csv），由 scripts/fetch_earnings.py 生成。导入前自动 diff 预览（新增/更新/不变）并快照当前数据">⬆ 导入财报 CSV</button>' +
      '<button class="btn ghost sm" data-action="earn.syncToVal" title="把当前满足筛选条件的财报数据一键同步到「公司估值」：先沉淀到共享财务库（DB.finstats），再按公司×季度投影到估值池（已有季度只填空缺字段，不覆盖已有值；未入估值池的公司自动跳过）。同步前自动快照">⇒ 同步到估值</button>' +
      '<button class="btn ghost sm" data-action="snap.list" title="数据快照与回滚：导入/清空前自动快照，可一键恢复到快照时点">📸 快照</button>' +
      '<button class="btn ghost sm" data-action="val.importPrices" title="导入行情 CSV（fetch_prices.py 生成），与「公司估值」共用同一入口：一次更新全站现价/涨幅/本月涨幅（财报跟踪·行业研究·公司估值三处同步生效）">⬆ 导入股价</button>' +
      '<button class="btn ghost sm" data-action="earn.export" title="导出当前满足全部筛选条件的公司及指标为 CSV，可重新导入">⬇ 导出 CSV</button>' +
      '<button class="btn ghost sm" data-action="earn.exportCompanies" title="将满足筛选条件的公司导出为公司列表 CSV（市场/板块/行业/林奇类型），可直接到「公司估值」点「⬆ 导入公司列表」批量添加">⬇ 导出公司列表</button>' +
      '<button class="btn ghost sm" data-action="earn.clear" title="清空已导入的财报数据">🗑 清空</button>');

    /* 财报季进度面板：估值池 ∪ 财报池「已披露 / 待更新」清单（默认收起） */
    h += seasonPanel();

    if(!rows.length){
      h += '<div class="card"><div class="empty">还没有财报数据。<br><br>' +
        '运行 <code>py scripts/fetch_earnings.py</code> 生成 <code>data/earnings/财报跟踪_YYYYMMDD.csv</code>，' +
        '然后点击右上角「⬆ 导入财报 CSV」。</div></div>';
      return h;
    }

    // ---- 过滤（提前计算：统计概览的「当前展示」卡片与表格共用同一份 list）----
    let list = rows.slice();
    // 公司名称 / 股票代码搜索：支持汉字原文、全拼、拼音首字母（见 core.js kwMatch），与其余筛选叠加
    const kw = String(state.earnKw || '').trim().toLowerCase();
    if(kw) list = list.filter(r => kwMatch(r['公司名称'], kw) || kwMatch(r['股票代码'], kw));
    if(state.earnIndustries && state.earnIndustries.length) list = list.filter(r => state.earnIndustries.includes(r['行业']));
    if(state.earnIndustriesL2 && state.earnIndustriesL2.length) list = list.filter(r => state.earnIndustriesL2.includes(r['行业二级']));
    if(state.earnIndustriesL3 && state.earnIndustriesL3.length) list = list.filter(r => state.earnIndustriesL3.includes(r['行业三级']));
    if(state.earnBoards && state.earnBoards.length) list = list.filter(r => state.earnBoards.includes(r['板块']));
    // 临时代码锁定（来自行业详情「在财报跟踪中查看」）：按 6 位代码精确过滤，覆盖其它行业/名称筛选的匹配差异
    const earnLock = state.earnLock;
    if(earnLock && earnLock.codes && earnLock.codes.length){
      list = list.filter(r => earnLock.codes.some(c => String(r['股票代码']).indexOf(c) >= 0));
    }
    if(state.earnFilterLow) list = list.filter(r => {
      const v = num(r[REVENUE_YOY_KEY]);
      return v != null && v >= MIN_REVENUE_YOY;
    });
    list = applyCustomFilters(list, state.earnCustomFilters);
    // 固定筛选：已勾选的规则逐条 AND（勾得越多越严格）
    const earlyRuleIds = activeRuleIds();
    if(earlyRuleIds.length){
      list = list.filter(r => earlyRuleIds.every(id => {
        const item = RULE_MAP[id];
        return item ? item.rule.ok(r) : true;
      }));
    }

    // ---- 统计概览 ----
    // L1 真实性卡片：数量随勾选的规则组合变化（AND 叠加，与表格筛选逻辑一致）
    const ruleIds = activeRuleIds();
    const l1Rows = ruleIds.length
      ? rows.filter(r => ruleIds.every(id => { const it = RULE_MAP[id]; return it ? it.rule.ok(r) : true; }))
      : rows;
    const l1Sub = ruleIds.length
      ? Math.round(l1Rows.length / rows.length * 100) + '% 的公司 · ' + ruleIds.length + ' 条规则'
      : '未勾选规则 = 全部';
    h += '<div class="val-summary-grid">' +
      '<div class="val-stat"><div class="vs-label">跟踪公司</div><div class="vs-value">' + rows.length + '</div></div>' +
      '<div class="val-stat"><div class="vs-label">🛡️ L1 真实性</div><div class="vs-value up">' + l1Rows.length + '</div><div class="vs-sub">' + l1Sub + '</div></div>' +
      '<div class="val-stat"><div class="vs-label">有披露日期</div><div class="vs-value">' + rows.filter(r => r['披露日期']).length + '</div></div>' +
      '<div class="val-stat"><div class="vs-label">✅ 当前展示</div><div class="vs-value up">' + list.length + '</div><div class="vs-sub">满足全部筛选条件 · ' + Math.round(list.length / rows.length * 100) + '%</div></div>' +
      '</div>';

    // ---- 公司名称搜索框（输入实时过滤下方表格）----
    h += '<input type="text" class="kw-search" placeholder="🔍 搜索公司名称 / 股票代码…" data-input="earn.kw" value="' + esc(state.earnKw || '') + '" style="margin-top:12px">';

    // ---- 筛选 chips：行业（多选，点击切换选中，再点取消；不选 = 全部）----
    const industries = [...new Set(rows.map(r => r['行业']).filter(Boolean))];
    const selInd = state.earnIndustries || [];
    if(earnLock && earnLock.codes && earnLock.codes.length){
      h += '<div class="chips" style="margin:10px 0 8px">' +
        '<span class="chip active" style="cursor:default" title="来自行业详情「在财报跟踪中查看该行业」的临时锁定，按 6 位代码精确匹配">🔒 临时锁定：' + esc(earnLock.label || '该行业') + '（' + earnLock.codes.length + ' 家）</span>' +
        '<button class="chip" data-action="earn.lockClear">✕ 清除锁定</button>' +
        '</div>';
    }
    h += '<div class="chips" style="margin:12px 0 8px">' +
      '<button class="chip ' + (selInd.length ? '' : 'active') + '" data-action="earn.fIndustryClear">全部行业</button>' +
      industries.map(i => '<button class="chip ' + (selInd.includes(i) ? 'active' : '') + '" data-action="earn.fIndustry" data-v="' + esc(i) + '">' + i + '</button>').join('') +
      '</div>';
    // 二/三级行业级联（选中上级后展开下级，细化到细分行业，避免一次平铺几百个 chip）
    const selInd2 = state.earnIndustriesL2 || [];
    const selInd3 = state.earnIndustriesL3 || [];
    if(selInd.length){
      const scope2 = rows.filter(r => selInd.includes(r['行业']));
      const pool2 = [...new Set(scope2.map(r => r['行业二级']).filter(Boolean))].sort();
      if(pool2.length){
        h += '<div class="chips chips-sub" style="margin:-4px 0 8px">' +
          '<span class="chips-label">二级</span>' +
          '<button class="chip ' + (selInd2.length ? '' : 'active') + '" data-action="earn.fIndustryL2Clear">全部</button>' +
          pool2.map(i => '<button class="chip ' + (selInd2.includes(i) ? 'active' : '') + '" data-action="earn.fIndustryL2" data-v="' + esc(i) + '">' + esc(i) + '</button>').join('') +
          '</div>';
      }
    }
    if(selInd2.length){
      const scope3 = rows.filter(r => selInd2.includes(r['行业二级']));
      const pool3 = [...new Set(scope3.map(r => r['行业三级']).filter(Boolean))].sort();
      if(pool3.length){
        h += '<div class="chips chips-sub" style="margin:-4px 0 8px">' +
          '<span class="chips-label">三级</span>' +
          '<button class="chip ' + (selInd3.length ? '' : 'active') + '" data-action="earn.fIndustryL3Clear">全部</button>' +
          pool3.map(i => '<button class="chip ' + (selInd3.includes(i) ? 'active' : '') + '" data-action="earn.fIndustryL3" data-v="' + esc(i) + '">' + esc(i) + '</button>').join('') +
          '</div>';
      }
    }

    // ---- 筛选 chips：板块（多选，点击切换选中，再点取消；不选 = 全部）----
    const boards = [...new Set(rows.map(r => r['板块']).filter(Boolean))];
    if(boards.length){
      const selBoard = state.earnBoards || [];
      h += '<div class="chips" style="margin-bottom:8px">' +
        '<button class="chip ' + (selBoard.length ? '' : 'active') + '" data-action="earn.fBoardClear">全部板块</button>' +
        boards.map(b => '<button class="chip ' + (selBoard.includes(b) ? 'active' : '') + '" data-action="earn.fBoard" data-v="' + esc(b) + '">' + b + '</button>').join('') +
        '</div>';
    }

    // ---- 固定筛选：L1 真实性（每条规则独立勾选，自由组合）----
    const activeIds = activeRuleIds();
    h += '<div class="earn-filterbar">' +
      '<span class="hint" style="margin-right:2px">🛡️ L1 真实性</span>' +
      '<button class="chip' + (activeIds.length === PRESETS[0].rules.length ? ' active' : '') + '" data-action="earn.allRules" title="勾选全部规则 = 完整 L1 一票否决">全选</button>' +
      PRESETS[0].rules.map((rl, i) => {
        const id = PRESETS[0].id + ':' + i;
        const on = activeIds.includes(id);
        const pass = rows.filter(rl.ok).length;
        return '<button class="chip ' + (on ? 'active' : '') + '" data-action="earn.toggleRule" data-v="' + id + '"' +
          ' title="' + esc(rl.name) + ' — ' + esc(rl.why) + ' · 满足 ' + pass + '/' + rows.length + ' 家">' +
          (on ? '✓ ' : '') + esc(rl.short) + '（' + pass + '）</button>';
      }).join('') +
      '</div>';
    if(activeIds.length){
      // 默认全选后这段说明会一直出现，折叠起来保持页面紧凑（点开可看完整口径）
      h += '<details class="earn-rule-detail"><summary>当前组合：' + activeIds.length + ' 条规则 AND 叠加（点开查看口径）</summary>' +
        activeIds.map(id => '✓ ' + esc(RULE_MAP[id].rule.name) + ' <span style="opacity:.6">— ' + esc(RULE_MAP[id].rule.why) + '</span>').join('<br>') +
        '</details>';
    }

    // ---- 营收同比开关（默认关，开启后剔除 <MIN_REVENUE_YOY%）+ 自定义数值筛选（紧凑单行）----
    const cf = state.earnCustomFilters || [];
    const isFieldMode = state.earnFilterMode === 'field';
    const OP_LABEL = { '>=':'≥', '<=':'≤', '>':'>', '<':'<' };
    const numMetrics = METRICS.filter(m => ['num','pct'].includes(m.type));
    // 可选指标 = 内置数值列 + 自定义指标，供筛选下拉使用
    const cmDefs = getCustomMetrics();
    const metricOptions = numMetrics.concat(cmDefs.map(d => ({ key: customKey(d.name), label: d.name })));
    const labelOf = key => { const m = metricOptions.find(x => x.key === key); return m ? m.label : key; };
    h += '<div class="earn-filterbar">' +
      '<button class="chip ' + (state.earnFilterLow ? 'active' : '') + '" data-action="earn.toggleLow" title="开启后剔除营收同比低于 ' + MIN_REVENUE_YOY + '% 的公司，便于聚焦高增长标的（默认关闭）">营收同比≥' + MIN_REVENUE_YOY + '%（' + (state.earnFilterLow ? '开' : '关') + '）</button>' +
      // 已添加的自定义条件 → 可删除的 chip
      cf.map((f, i) => '<button class="chip active" data-action="earn.delFilter" data-idx="' + i + '" title="点击移除该筛选条件">' +
        esc(labelOf(f.key)) + ' ' + esc(OP_LABEL[f.op] || f.op) + ' ' + esc(f.cmpField ? labelOf(f.value) + '（字段）' : f.value) + ' ✕</button>').join('') +
      // 模式切换：对数值 / 对字段
      '<button class="chip" data-action="earn.toggleFfMode" title="切换筛选模式：与固定数值比较，或两个字段之间逐行比较">' + (isFieldMode ? '字段对比' : '数值对比') + '</button>' +
      // 新增条件：字段 / 运算符 / 数值(或字段)
      '<select id="earnFfKey" title="选择筛选字段">' +
        metricOptions.map(m => '<option value="' + esc(m.key) + '">' + esc(m.label) + '</option>').join('') + '</select>' +
      '<select id="earnFfOp" title="选择比较符">' +
        Object.keys(OP_LABEL).map(op => '<option value="' + op + '">' + OP_LABEL[op] + '</option>').join('') + '</select>' +
      (isFieldMode
        ? '<select id="earnFfVal" title="选择比较字段">' + metricOptions.map(m => '<option value="' + esc(m.key) + '">' + esc(m.label) + '</option>').join('') + '</select>'
        : '<input id="earnFfVal" type="number" step="any" placeholder="数值">') +
      '<button class="btn ghost sm" data-action="earn.addFilter">＋</button>' +
      '<span class="hint">点列头排序 · 点已添加条件可移除</span>' +
      '</div>';

    // ---- 自定义指标定义（两个指标的 + − × ÷）----
    h += '<div class="earn-filterbar">' +
      '<button class="chip ' + (state.earnMetricOpen ? 'active' : '') + '" data-action="earn.toggleMetricDef" title="定义自定义指标（如两指标的差/比），将作为新列展示，可排序、可参与筛选">🧮 自定义指标(' + cmDefs.length + ')</button>' +
      cmDefs.map((d, i) => '<button class="chip active" data-action="earn.delMetric" data-idx="' + i + '" title="点击删除该自定义指标（引用它的筛选条件会一并移除）">' +
        esc(d.name) + ' = ' + esc(labelOf(d.a)) + ' ' + esc(CM_OP_LABEL[d.op] || d.op) + ' ' + esc(labelOf(d.b)) + ' ✕</button>').join('') +
      '</div>';
    if(state.earnMetricOpen){
      h += '<div class="earn-filterbar" style="margin-bottom:12px">' +
        '<input id="earnCmName" type="text" placeholder="指标名称" style="width:110px">' +
        '<select id="earnCmA" title="指标 A">' + metricOptions.map(m => '<option value="' + esc(m.key) + '">' + esc(m.label) + '</option>').join('') + '</select>' +
        '<select id="earnCmOp" title="运算符">' +
          Object.keys(CM_OP_LABEL).map(op => '<option value="' + op + '">' + CM_OP_LABEL[op] + '</option>').join('') + '</select>' +
        '<select id="earnCmB" title="指标 B">' + metricOptions.map(m => '<option value="' + esc(m.key) + '">' + esc(m.label) + '</option>').join('') + '</select>' +
        '<button class="btn ghost sm" data-action="earn.addMetric">＋ 定义</button>' +
        '<span class="hint">示例：质量 = 扣非净利同比 − 营收同比；现金流覆盖 = 经营现金流 ÷ 净利润</span>' +
        '</div>';
    }

    // ---- 排序（list 已在统计概览前完成过滤，此处直接排序）----

    // 日期/文本列不能用 num() 数值化（会变 null 导致排序失效），按类型选择比较方式
    const sortKey = state.earnSort || '营业收入';   // 默认按营业收入排序（desc，营收大户在前）
    const sortCol = METRICS.find(m => m.key === sortKey);
    const sortVal = (row, key) => {
      if(sortCol && sortCol.type === 'date'){
        const t = Date.parse(String(row[key] || ''));
        return isNaN(t) ? null : t;
      }
      if(sortCol && sortCol.type === 'text'){
        const s = String(row[key] || '').trim();
        return s || null;
      }
      return metricVal(row, key);
    };
    const sortDir = state.earnSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const na = sortVal(a, sortKey), nb = sortVal(b, sortKey);
      if(na != null && nb != null){
        if(typeof na === 'string' || typeof nb === 'string'){
          return String(na).localeCompare(String(nb)) * sortDir;   // 文本列（如季度）按字典序
        }
        return (na - nb) * sortDir;
      }
      if(na == null && nb == null) return 0;
      return na == null ? 1 : -1;   // 空值排最后
    });
    lastList = list;   // 记录当前过滤+排序结果，供「⬇ 导出 CSV」使用

    if(!list.length){
      // L1 默认全选后可能出现 0 家（如 CSV 缺列），给出原因说明与一键取消入口
      const nowRules = activeRuleIds();
      h += '<div class="card"><div class="empty">' +
        (kw ? '没有匹配「' + esc(String(state.earnKw||'').trim()) + '」的公司' : '当前筛选条件下没有符合条件的公司') +
        (nowRules.length
          ? '<br><br><span style="font-size:12px">L1 真实性当前勾选 <b>' + nowRules.length + '</b> 条规则（AND 叠加，勾得越多越严格）。' +
            '部分财报 CSV 缺少「销售收现 / 经营现金流」等列时会导致全部落选。</span>' +
            '<br><button class="btn ghost sm" style="margin-top:10px" data-action="earn.clearRules">取消全部 L1 规则</button>'
          : '') +
        '</div></div>';
      return h;
    }

    // ---- 表格 ----
    // 列 = 内置指标 + 自定义指标（计算列）
    const cols = METRICS.concat(cmDefs.map(d => ({
      key: customKey(d.name), label: d.name, type: 'calc', sortable: true, group: '自定义',
    })));
    // wide-table-wrap：宽屏下表格按内容自动扩宽（占满可视区），窄屏才出现横向滚动条。
    //   - width:auto + min-width:100%：内容 ≤ 容器时填满；内容 > 容器时按 max-content 撑开由外层 overflow 滚动
    h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
      '<th>公司</th><th>行业</th>' +
      cols.map(m => {
        let th = esc(m.label);
        if(m.unit) th += ' <span class="unit">(' + m.unit + ')</span>';
        let arrow = '';
        if(state.earnSort === m.key){
          arrow = state.earnSortDir === 'asc' ? ' ▲' : ' ▼';
        }
        // 列头提示：自定义指标给出算式，其余提示可排序
        const def = m.type === 'calc' ? cmDefs.find(d => customKey(d.name) === m.key) : null;
        const tip = def
          ? '自定义指标：' + labelOf(def.a) + ' ' + (CM_OP_LABEL[def.op] || def.op) + ' ' + labelOf(def.b)
          : '点击按此列排序';
        const sorter = m.sortable ? ' data-action="earn.sort" data-key="' + esc(m.key) + '" style="cursor:pointer" title="' + esc(tip) + '"' : '';
        const headCls = m.group === '自定义' ? ' style="border-left:2px solid var(--amber);"' : '';
        return '<th class="num"' + headCls + ' ' + sorter + '>' + th + arrow + '</th>';
      }).join('') +
      '<th class="num" title="行情快照（「⬆ 导入股价」更新，全站共用）">现价</th>' +
      '<th class="num" title="当日涨跌幅（「⬆ 导入股价」更新）">涨幅</th>' +
      '<th class="num" title="本月累计涨跌幅（「⬆ 导入股价」更新）">本月</th>' +
      '<th style="border-left:2px solid var(--green)">操作</th>' +
      '</tr></thead><tbody>';

    list.forEach(r => {
      const name = r['公司名称'] || r['股票代码'] || '—';
      const ticker = r['股票代码'] || '';
      const industry = r['行业'] || '';
      const industryL2 = r['行业二级'] || '';
      const industryL3 = r['行业三级'] || '';
      const board = r['板块'] || '';
      const lynch = r['林奇类型'] || '';
      // 行业列：申万一级/二级/三级拼接（与分类地图同源，自动去重罗马数字后缀），一级彩色徽章 + 细分级灰色徽章
      const ipath = swPath(ticker, r);
      const irest = swRest(ticker, r);
      h += '<tr>' +
        /* 公司名即详情入口：统一跳转公司详情页（#/company，modules/company.js） */
        '<td><b class="co-link" data-action="company.open" data-ticker="' + esc(ticker) + '" data-name="' + esc(name) + '" title="打开公司详情页">' + esc(name) + '</b>' +
          ((window.ValHelpers && ValHelpers.ratingBadgeByCode) ? ValHelpers.ratingBadgeByCode(ticker) : '') +
          '<div class="muted" style="font-size:11px">' + esc(ticker) + '</div></td>' +
        '<td>' +
          (industry ? '<span class="badge ' + (INDUSTRY_CLS[industry] || 'gray') + '" title="申万行业：' + esc(ipath) + '">' + esc(industry) + '</span>' : '') +
          (irest ? ' <span class="badge gray" title="申万行业：' + esc(ipath) + '">' + esc(irest) + '</span>' : '') +
          (lynch ? ' <span class="badge ' + (LYNCH_CLS[lynch] || 'gray') + '" title="林奇分类：' + esc(lynch) + '">' + esc(lynch) + '</span>' : '') +
        '</td>';
      cols.forEach(m => {
        const raw = r[m.key];
        if(m.type === 'date'){
          h += '<td class="num" style="white-space:nowrap">' + esc(raw || '—') + '</td>';
        } else if(m.type === 'text'){
          // 文本列（如季度）直接显示原值
          h += '<td class="num" style="white-space:nowrap">' + esc(raw || '—') + '</td>';
        } else if(m.type === 'calc'){
          // 自定义指标（计算列）：指标 A op 指标 B
          const v = metricVal(r, m.key);
          if(v == null){ h += '<td class="num"><span class="muted">—</span></td>'; }
          else {
            const str = Math.abs(v) < 100 ? v.toFixed(2) : v.toFixed(1);
            h += '<td class="num" title="' + esc(m.label) + '">' + str + '</td>';
          }
        } else {
          const n = num(raw);
          if(n == null){ h += '<td class="num"><span class="muted">—</span></td>'; return; }
          let str;
          if(m.type === 'pct'){
            str = n.toFixed(1) + '%';
            const cls = n >= 0 ? 'up' : 'down';
            h += '<td class="num ' + cls + '">' + (n > 0 ? '+' : '') + str + '</td>';
          } else {
            str = Math.abs(n) < 100 ? n.toFixed(2) : n.toFixed(1);
            h += '<td class="num">' + str + '</td>';
          }
        }
      });
      // 行情两列：统一行情快照（DB.quotes），无数据显示 —
      const gq = quoteOf(ticker);
      if(gq && gq.price != null){
        h += '<td class="num" style="white-space:nowrap"><b>' + Number(gq.price).toFixed(2) + '</b>' +
          (gq.date ? '<div class="muted" style="font-size:10px">' + esc(gq.date) + '</div>' : '') + '</td>';
      } else {
        h += '<td class="num"><span class="muted">—</span></td>';
      }
      if(gq && gq.pct != null){
        const p = Number(gq.pct);
        h += '<td class="num"><span class="' + (p > 0 ? 'up' : (p < 0 ? 'down' : 'muted')) + '" style="font-size:12px;white-space:nowrap">' +
          (p > 0 ? '▲ ' : (p < 0 ? '▼ ' : '')) + Math.abs(p).toFixed(2) + '%</span></td>';
      } else {
        h += '<td class="num"><span class="muted">—</span></td>';
      }
      if(gq && gq.monthPct != null){
        const mp = Number(gq.monthPct);
        h += '<td class="num"><span class="' + (mp > 0 ? 'up' : (mp < 0 ? 'down' : 'muted')) + '" style="font-size:12px;white-space:nowrap">' +
          (mp > 0 ? '▲ ' : (mp < 0 ? '▼ ' : '')) + Math.abs(mp).toFixed(2) + '%</span></td>';
      } else {
        h += '<td class="num"><span class="muted">—</span></td>';
      }
      // 操作列：📈 公司（加入公司估值，未跟踪时）+ 🏭 行业（加入行业研究池）——按钮统一「板块图标+板块名」风格
      const known = findValCompany(ticker);
      const indBtn = '<button class="btn ghost sm" data-action="earn.addInd" data-code="' + esc(Repo.normCode6(ticker)) + '" data-name="' + esc(name) + '" data-industry="' + esc(industry) + '" title="加入行业研究池：选择已有行业，或输入新名称直接创建">🏭 行业</button>';
      if(known){
        h += '<td style="white-space:nowrap">' + indBtn + '</td>';
      } else {
        h += '<td style="white-space:nowrap">' +
          '<button class="btn ghost sm" data-action="earn.addVal" data-ticker="' + esc(ticker) + '" data-name="' + esc(name) + '" data-industry="' + esc(industry) + '" data-board="' + esc(board) + '" data-type="' + esc(lynch) + '" title="加入「公司估值」关注列表（自动带出行业/板块/林奇类型），之后可导入财务/盈利预测 CSV 做深度分析">📈 公司</button> ' + indBtn + '</td>';
      }
      h += '</tr>';
    });

    h += '</tbody></table></div>';

    // 提示数据时间
    const imported = DB.earnings.importedAt;
    if(imported) h += '<div class="muted" style="margin-top:10px;font-size:12px">数据导入时间：' + esc(imported) + '</div>';

    return h;
  }

  // CSV 保存：统一走 modules/csv-kit.js 的 downloadCsv（另存为对话框，降级直接下载；
  // 本文件原有的一份实现已并入）
  function saveCsvFile(fname, content){
    return GT_CSV.downloadCsv(fname, content);
  }

  // ---- 导出 CSV（当前满足全部筛选条件的公司 + 指标）----
  // 导出文件含 # 注释头与「股票代码」表头，可直接重新「⬆ 导入财报 CSV」
  // 导出列 = 基础信息列 + 全部指标列 + 自定义指标列
  const EXPORT_BASE = ['股票代码', '公司名称', '行业', '板块', '林奇类型', '披露日期', '报告期', '季度'];
  function exportCsv(){
    if(!lastList.length){ toast('⚠️ 当前没有满足筛选条件的公司'); return; }
    const metricKeys = METRICS.map(m => m.key).filter(k => k !== '披露日期' && k !== '季度');
    const cols = EXPORT_BASE.concat(metricKeys, getCustomMetrics().map(d => customKey(d.name)));
    const lines = ['# GoalTracker 财报跟踪（满足筛选条件 ' + lastList.length + ' 家，导出于 ' + dateStr() + '）',
      cols.map(c => c.charAt(0) === '#' ? c.slice(1) : c).join(',')];
    lastList.forEach(r => {
      lines.push(cols.map(c => {
        // 自定义指标列不在 row 上存储，按定义实时计算
        let v = c.charAt(0) === '#' ? metricVal(r, c) : r[c];
        if(v == null) return '';
        v = String(v);
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    saveCsvFile('财报跟踪_筛选_' + dateStr() + '.csv', '\ufeff' + lines.join('\r\n'));
    toast('✅ 已导出 ' + lastList.length + ' 家公司及指标数据');
  }

  // ---- 导出为公司估值模块可直接导入的公司列表 CSV（满足当前全部筛选条件的公司）----
  // 列格式与估值模块「⬆ 导入公司列表」兼容；同时可作为 fetch_financial.py --from-csv 的输入
  const VAL_LIST_COLS = ['股票代码', '公司名称', '市场', '板块', '行业', '行业二级', '行业三级', '林奇类型'];
  function exportCompaniesForVal(){
    if(!lastList.length){ toast('⚠️ 当前没有满足筛选条件的公司'); return; }
    const lines = ['# GoalTracker 公司列表（财报跟踪筛选 ' + lastList.length + ' 家，导出于 ' + dateStr() + '）',
      VAL_LIST_COLS.join(',')];
    lastList.forEach(r => {
      lines.push(VAL_LIST_COLS.map(c => {
        const v = c === '市场' ? 'A股' : String(r[c] || '');
        return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }).join(','));
    });
    saveCsvFile('公司列表_筛选_' + dateStr() + '.csv', '\ufeff' + lines.join('\r\n'));
    toast('✅ 已导出 ' + lastList.length + ' 家，到「公司估值」点「⬆ 导入公司列表」即可批量添加');
  }

  // ---- 导入 CSV（diff 预览确认制）----
  /* 流程：选文件 → 解析 → 与现有 rows 按「报告期键（6位代码+季度）」diff → 弹窗预览
     新增/更新/不变 三类（更新行展示差异字段新旧值）→ 用户确认才写库。
     写库前自动快照 DB.earnings（快照服务 Snapshots，可一键回滚）。 */
  let pendingImport = null;   // 预览待确认数据 { added, updated, unchanged, total }
  function importCsv(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.multiple = true;   // 多文件合并导入（按报告期键去重）
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if(!files.length) return;
      let left = files.length, parsed = [], skipped = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const csvLines = parseCsv(reader.result);
            const rows = csvToRows(csvLines);
            if(rows.length) parsed.push(...rows); else skipped++;
          } catch(e){ skipped++; }
          if(--left === 0) previewImport(parsed, files.length, skipped);
        };
        reader.readAsText(file, 'utf-8');
      });
    };
    input.click();
  }

  /* 报告期键：6位代码 + 季度（同一次披露唯一；project_memory 口径：代码+报告期合并） */
  function rowKey(r){
    const m = String(r['股票代码'] || '').match(/(\d{6})/);
    const code = m ? m[1] : String(r['股票代码'] || '').trim();
    return code + '|' + String(r['季度'] || '').trim();
  }
  /* 值级差异字段列表（字符串化比较，空值视为 ''） */
  function diffFields(a, b){
    const keys = new Set(Object.keys(a || {}).concat(Object.keys(b || {})));
    const out = [];
    keys.forEach(k => {
      if(String(a[k] == null ? '' : a[k]) !== String(b[k] == null ? '' : b[k])) out.push(k);
    });
    return out;
  }
  function shortVal(v){
    const s = String(v == null ? '' : v);
    return s.length > 14 ? s.slice(0, 14) + '…' : s;
  }

  /* 预览弹窗：汇总 + 新增/更新明细（各取前 12 条）+ 确认/取消按钮 */
  function previewImport(parsed, fileCnt, skipped){
    if(!parsed.length){
      toast('⚠️ ' + skipped + ' 个文件未识别到财报数据');
      return;
    }
    /* 待导入集合按报告期键去重（同键后到者覆盖，多文件合并） */
    const map = new Map();
    parsed.forEach(r => { map.set(rowKey(r), r); });
    const olds = DB.earnings.rows || [];
    const oldMap = new Map(olds.map(r => [rowKey(r), r]));
    const added = [], updated = [];
    map.forEach((r, k) => {
      const o = oldMap.get(k);
      if(!o) added.push(r);
      else {
        const df = diffFields(o, r);
        if(df.length) updated.push({ key: k, oldRow: o, newRow: r, diffs: df });
      }
    });
    const unchanged = map.size - added.length - updated.length;
    pendingImport = { added: added, updated: updated, unchanged: unchanged, total: map.size };

    let h = '<div class="stat-line"><span>待导入</span><b>' + map.size + ' 条（' + fileCnt + ' 个文件）</b></div>' +
      '<div class="stat-line"><span>对比现有 ' + olds.length + ' 行（合并键：股票代码 + 季度）</span><b>' +
      '<span class="up">新增 ' + added.length + '</span> · <span class="down">更新 ' + updated.length + '</span> · 不变 ' + unchanged + '</b></div>';

    if(added.length){
      h += '<div class="muted" style="margin:10px 0 4px;font-size:12px">新增明细（前 ' + Math.min(12, added.length) + ' 条）：</div>' +
        '<table class="val-table"><thead><tr><th>代码</th><th>公司</th><th>季度</th><th>披露日期</th></tr></thead><tbody>' +
        added.slice(0, 12).map(r => '<tr><td>' + esc(String(r['股票代码'] || '')) + '</td><td>' + esc(String(r['公司名称'] || '')) + '</td><td>' + esc(String(r['季度'] || '')) + '</td><td>' + esc(String(r['披露日期'] || '')) + '</td></tr>').join('') +
        '</tbody></table>' + (added.length > 12 ? '<div class="muted" style="font-size:11px">…其余 ' + (added.length - 12) + ' 条确认后全部导入</div>' : '');
    }
    if(updated.length){
      h += '<div class="muted" style="margin:10px 0 4px;font-size:12px">更新明细（前 ' + Math.min(12, updated.length) + ' 条，展示前两项差异）：</div>' +
        '<table class="val-table"><thead><tr><th>公司</th><th>季度</th><th>变化内容</th></tr></thead><tbody>' +
        updated.slice(0, 12).map(u => {
          const txt = u.diffs.slice(0, 2).map(k => '<b>' + esc(k) + '</b> ' + esc(shortVal(u.oldRow[k])) + ' → ' + esc(shortVal(u.newRow[k]))).join('；') +
            (u.diffs.length > 2 ? ' …等 ' + u.diffs.length + ' 项' : '');
          return '<tr><td>' + esc(String(u.newRow['公司名称'] || '')) + '</td><td>' + esc(String(u.newRow['季度'] || '')) + '</td><td>' + txt + '</td></tr>';
        }).join('') +
        '</tbody></table>' + (updated.length > 12 ? '<div class="muted" style="font-size:11px">…其余 ' + (updated.length - 12) + ' 条确认后全部更新</div>' : '');
    }
    if(!added.length && !updated.length){
      h += '<div class="empty">待导入数据与现有数据完全一致，无需导入。</div>';
    }

    h += '<div style="margin-top:12px;display:flex;gap:8px">' +
      '<button type="button" class="btn primary" data-action="earn.importConfirm"' + (!added.length && !updated.length ? ' disabled' : '') + '>✅ 确认导入（新增 ' + added.length + ' · 更新 ' + updated.length + '）</button>' +
      '<button type="button" class="btn ghost" data-action="modal.cancel">取消</button></div>' +
      '<div class="muted" style="margin-top:6px;font-size:11px">确认后自动快照当前财报数据（📸 数据快照可随时回滚），再合并写入。</div>';

    openModal('📥 导入预览', h, null, null, true);
    if(skipped) toast('⚠️ ' + skipped + ' 个文件未识别到财报数据');
  }

  // ---- 加入行业研究池（行业详情/财报跟踪双向联动）----
  // 弹窗内 datalist 列出已有行业；输入名与已有行业一致 → 直接加入；否则创建新行业。
  // 新行业对象字段与 industries.js 的 indInit 对齐（该函数在对方 IIFE 内，此处独立实现）。
  let pendingIndAdd = null;   // { code6, name, industry }：弹窗期间暂存待加入的公司
  function _newIndustry(name){
    return {
      id: uid(), name: name, level: 1, sys: 'sw1',
      members: [], notes: {},
      chain: '', lifecycle: '', policy: '', prosperity: null, prosperityNote: '',
      thesis: '', drivers: [], invalidConds: [], tracked: true, updated: dateStr(),
      age: { metric: '国产化率', rate: null, rateYear: '', prevRate: null, prevYear: '', target: null, targetYear: '', note: '', tracks: [] },
      health: { tam: [], qtySelf: null, valSelf: null, selfNote: '' },
      compete: { peers: [], vertical: '', moats: [], verdict: '' },
    };
  }
  function openAddIndustry(el){
    const code6 = String(el.dataset.code || '');
    if(!code6){ toast('⚠️ 缺少公司代码'); return; }
    pendingIndAdd = { code6: code6, name: el.dataset.name || code6, industry: el.dataset.industry || '' };
    const list = DB.industries.list || [];
    const joined = list.filter(x => Array.isArray(x.members) && x.members.includes(code6)).map(x => x.name);
    const opts = list.map(x => x.name).filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'zh')).map(n => '<option value="' + esc(n) + '">').join('');
    // 已加入的行业前置提示：chip 展示，避免重复加入（确认时也有兜底校验）
    const joinedHtml = joined.length
      ? '<div style="margin:0 0 8px;font-size:12px">已在行业（' + joined.length + '）：' +
        joined.map(n => '<span class="chip active" style="cursor:default">' + esc(n) + '</span>').join(' ') + '</div>'
      : '<div class="muted" style="margin:0 0 8px;font-size:12px">尚未加入任何行业</div>';
    const h =
      '<div class="muted" style="font-size:12px;margin-bottom:8px">将 <b>' + esc(pendingIndAdd.name) + '</b>（' + esc(code6) + '）加入行业研究池' +
      (pendingIndAdd.industry ? ' · 三级行业：' + esc(pendingIndAdd.industry) : '') + '</div>' +
      joinedHtml +
      '<input id="earn-ind-name" list="earn-ind-list" placeholder="选择已有行业，或输入新名称创建" style="width:100%;padding:7px 9px;border:1px solid var(--bd,#d0d7de);border-radius:6px" />' +
      '<datalist id="earn-ind-list">' + opts + '</datalist>' +
      '<div class="muted" style="margin-top:6px;font-size:11px">名称与已有行业一致 → 直接加入；否则创建新行业（之后可到「行业研究」完善定年纪/体检表与成员生态位）。</div>' +
      '<div style="margin-top:12px;display:flex;gap:8px">' +
      '<button type="button" class="btn primary" data-action="earn.addIndConfirm">✅ 确认加入</button>' +
      '<button type="button" class="btn ghost" data-action="modal.cancel">取消</button></div>';
    openModal('🏭 加入行业', h, null, null, true);
    const inp = document.getElementById('earn-ind-name');
    if(inp) inp.focus();
  }
  function confirmAddIndustry(){
    if(!pendingIndAdd) return;
    const inp = document.getElementById('earn-ind-name');
    const indName = String((inp && inp.value) || '').trim();
    if(!indName){ toast('⚠️ 请填写行业名称'); return; }
    const code6 = pendingIndAdd.code6, coName = pendingIndAdd.name;
    pendingIndAdd = null;
    if(!DB.industries.list) DB.industries.list = [];
    const ind = DB.industries.list.find(x => x.name === indName);
    if(!ind){
      const ni = _newIndustry(indName);
      ni.members.push(code6);
      DB.industries.list.push(ni);
      save(); closeModal(); render();
      toast('✅ 已创建行业「' + indName + '」并加入 ' + coName + '（成员 1 家）');
      return;
    }
    ind.members = Array.isArray(ind.members) ? ind.members : [];
    if(ind.members.includes(code6)){
      closeModal(); render();
      toast('ℹ️ ' + coName + ' 已在行业「' + indName + '」中');
      return;
    }
    ind.members.push(code6);
    ind.updated = dateStr();
    save(); closeModal(); render();
    toast('✅ 已将 ' + coName + ' 加入行业「' + indName + '」（成员 ' + ind.members.length + ' 家）');
  }

  // ---- 注册 ----
  Register.module({
    view: 'earnings',
    nav: { ico:'📊', label:'财报跟踪', group:'投资追踪' },
    seed: seed,
    ensure: (db, sv) => {
      if(!Array.isArray(db.earnings.rows)) db.earnings.rows = sv.rows;
      if(!db.earnings.importedAt) db.earnings.importedAt = sv.importedAt;
      if(!Array.isArray(db.earnings.customMetrics)) db.earnings.customMetrics = sv.customMetrics;
    },
    render: renderEarnings,
    actions: {
      'earn.import': () => importCsv(),
      /* 预览确认后的写库：先快照旧数据，再原地更新（保持行引用）+ 追加新增 */
      'earn.importConfirm': () => {
        if(!pendingImport) return;
        const added = pendingImport.added, updated = pendingImport.updated;
        const unchanged = pendingImport.unchanged;
        if(window.Snapshots) Snapshots.capture('earnings', DB.earnings,
          '导入财报 CSV 前（新增 ' + added.length + ' · 更新 ' + updated.length + '）');
        const olds = DB.earnings.rows || [];
        const idxMap = new Map(olds.map((r, i) => [rowKey(r), i]));
        updated.forEach(u => {
          const i = idxMap.get(u.key);
          if(i != null) olds[i] = u.newRow;
        });
        added.forEach(r => olds.push(r));
        DB.earnings.rows = olds;
        DB.earnings.importedAt = dateStr();
        pendingImport = null;
        // 镜像写入共享财务库（幂等）：导入的财报数据统一沉淀到 DB.finstats
        if(window.FinStats) FinStats.ingestEarnings(added.concat(updated.map(u => u.newRow)));
        save(); closeModal(); render();
        toast('✅ 导入完成：新增 ' + added.length + ' · 更新 ' + updated.length + ' · 不变 ' + unchanged);
      },
      'earn.export': () => exportCsv(),
      'earn.exportCompanies': () => exportCompaniesForVal(),
      /* 一键互转：当前筛选结果（与 ⬇ 导出 CSV 同源）→ 共享财务库 → 估值池 */
      'earn.syncToVal': () => {
        if(!(window.FinStats)) return;
        if(!lastList.length){ toast('⚠️ 当前没有满足筛选条件的公司'); return; }
        if(window.Snapshots){
          Snapshots.capture('earnings', DB.earnings, '财报同步到估值前');
          Snapshots.capture('valuation', DB.valuation, '财报同步到估值前');
        }
        const res = FinStats.transferToValuation(lastList);
        save(); render();
        toast('✅ 已同步到估值：匹配 ' + res.matched + ' 家 · 新增 ' + res.addedQ + ' 季度 · 更新 ' + res.updatedQ +
          (res.skipped ? ' · 未入估值池跳过 ' + res.skipped + ' 条' : ''));
      },
      'earn.seasonToggle': () => { state.earnSeasonOpen = !state.earnSeasonOpen; render(); },
      'earn.clear': () => {
        if(confirm('确认清空所有已导入的财报跟踪数据？')){
          if(window.Snapshots) Snapshots.capture('earnings', DB.earnings, '清空财报跟踪前');
          DB.earnings.rows = []; DB.earnings.importedAt = null;
          // 共享财务库同步回收：只删无估值财务背书（src 不含 val）的行，估值侧数据保留
          if(window.FinStats) FinStats.onEarningsClear();
          state.earnSort = '营业收入'; state.earnSortDir = 'desc';   // 恢复默认排序：营业收入降序
          state.earnFilterLow = false;
          state.earnPresetRules = allRuleIds();   // 恢复默认：L1 真实性全选
          state.earnCustomFilters = [];
          state.earnIndustries = []; state.earnBoards = [];
          state.earnKw = '';
          save(); render();
        }
      },
      'earn.sort': el => {
        const key = el.dataset.key;
        if(state.earnSort === key){
          state.earnSortDir = state.earnSortDir === 'desc' ? 'asc' : 'desc';
        } else {
          state.earnSort = key;
          // 比率类默认降序（大→小），日期类默认降序（新→旧），数值默认降序
          state.earnSortDir = 'desc';
        }
        render();
      },
      'earn.fIndustry': el => {
        // 多选：点击选中，再次点击取消
        const v = el.dataset.v;
        const set = new Set(state.earnIndustries || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.earnIndustries = [...set];
        state.earnIndustriesL2 = [];   // 一级变化时重置下级，保持级联一致
        state.earnIndustriesL3 = [];
        render();
      },
      'earn.fIndustryClear': () => { state.earnIndustries = []; state.earnIndustriesL2 = []; state.earnIndustriesL3 = []; render(); },
      'earn.fIndustryL2': el => {
        const v = el.dataset.v;
        const set = new Set(state.earnIndustriesL2 || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.earnIndustriesL2 = [...set];
        state.earnIndustriesL3 = [];
        render();
      },
      'earn.fIndustryL2Clear': () => { state.earnIndustriesL2 = []; state.earnIndustriesL3 = []; render(); },
      'earn.fIndustryL3': el => {
        const v = el.dataset.v;
        const set = new Set(state.earnIndustriesL3 || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.earnIndustriesL3 = [...set];
        render();
      },
      'earn.fIndustryL3Clear': () => { state.earnIndustriesL3 = []; render(); },
      'earn.lockClear': () => { state.earnLock = null; render(); },
      'earn.fBoard': el => {
        // 多选：点击选中，再次点击取消
        const v = el.dataset.v;
        const set = new Set(state.earnBoards || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.earnBoards = [...set];
        render();
      },
      'earn.fBoardClear': () => { state.earnBoards = []; render(); },
      'earn.toggleLow': el => { state.earnFilterLow = !state.earnFilterLow; render(); },
      // —— 固定筛选：规则独立勾选，自由组合 ——
      'earn.toggleRule': el => {
        const v = el.dataset.v;
        const set = new Set(activeRuleIds());
        set.has(v) ? set.delete(v) : set.add(v);
        state.earnPresetRules = [...set];
        render();
      },
      'earn.allRules': () => { state.earnPresetRules = allRuleIds(); render(); },
      'earn.clearRules': () => { state.earnPresetRules = []; render(); },
      // —— 自定义数值筛选（字段+运算符+数值，可叠加）——
      'earn.addFilter': () => {
        const key = document.getElementById('earnFfKey').value;
        const op = document.getElementById('earnFfOp').value;
        const raw = document.getElementById('earnFfVal').value;
        state.earnCustomFilters = state.earnCustomFilters || [];
        if(state.earnFilterMode === 'field'){
          // 字段间比较：逐行取两字段数值对比
          if(raw === key){ toast('⚠️ 比较字段不能与筛选字段相同'); return; }
          state.earnCustomFilters.push({ key, op, value: raw, cmpField: true });
        } else {
          const value = parseFloat(raw);
          if(isNaN(value)){ toast('⚠️ 请先输入筛选数值'); return; }
          state.earnCustomFilters.push({ key, op, value });
        }
        render();
      },
      'earn.toggleFfMode': () => { state.earnFilterMode = state.earnFilterMode === 'field' ? 'value' : 'field'; render(); },
      // —— 自定义指标（两指标的 + − × ÷，存 DB 持久化）——
      'earn.toggleMetricDef': () => { state.earnMetricOpen = !state.earnMetricOpen; render(); },
      'earn.addMetric': () => {
        const name = (document.getElementById('earnCmName').value || '').trim();
        const a = document.getElementById('earnCmA').value;
        const op = document.getElementById('earnCmOp').value;
        const b = document.getElementById('earnCmB').value;
        if(!name){ toast('⚠️ 请先输入指标名称'); return; }
        const defs = getCustomMetrics();
        if(defs.some(d => d.name === name)){ toast('⚠️ 已存在同名指标'); return; }
        if(a === b){ toast('⚠️ 两个操作数不能是同一指标'); return; }
        defs.push({ name, op, a, b });
        DB.earnings.customMetrics = defs;
        save(); render();
        toast('✅ 自定义指标「' + name + '」已添加，可点击列头排序或加入筛选');
      },
      'earn.delMetric': el => {
        const idx = parseInt(el.dataset.idx, 10);
        const defs = getCustomMetrics();
        if(idx < 0 || idx >= defs.length) return;
        const key = customKey(defs[idx].name);
        defs.splice(idx, 1);
        DB.earnings.customMetrics = defs;
        // 一并移除引用该指标的筛选条件，避免残留失效条件
        state.earnCustomFilters = (state.earnCustomFilters || []).filter(f => f.key !== key && f.value !== key);
        save(); render();
      },
      'earn.delFilter': el => {
        const idx = parseInt(el.dataset.idx, 10);
        if(state.earnCustomFilters && idx >= 0 && idx < state.earnCustomFilters.length){
          state.earnCustomFilters.splice(idx, 1);
          render();
        }
      },
      // —— 与估值模块联动 ——
      'earn.addInd': el => openAddIndustry(el),
      'earn.addIndConfirm': () => confirmAddIndustry(),
      'earn.addVal': el => {
        const ticker = String(el.dataset.ticker || '').trim();
        if(!ticker) return;
        if(findValCompany(ticker)){ toast('ℹ️ ' + (el.dataset.name || ticker) + ' 已在估值关注列表'); return; }
        DB.valuation.companies.push({
          id: uid(),
          name: el.dataset.name || ticker,
          ticker,
          market: 'A股',
          board: ['主板', '创业板', '科创板'].includes(el.dataset.board) ? el.dataset.board : '',
          industry: el.dataset.industry || '',
          companyType: el.dataset.type || '',
          financials: [], valuations: [], investments: [], research: '',
        });
        save(); render();
        toast('✅ 已将 ' + (el.dataset.name || ticker) + ' 加入「公司估值」，可到该板块导入财务/盈利预测 CSV');
      },
    },
    inputs: {
      // 公司列表搜索框：renderKeep 保持输入框焦点与光标位置；
      // 120ms 去抖合并连续击键，减少每键全量重绘带来的闪烁
      'earn.kw': (function(){
        let t = 0;
        return function(el){ state.earnKw = el.value; clearTimeout(t); t = setTimeout(function(){ renderKeep('earn.kw'); }, 120); };
      })(),
    },
  });

  /* 跨模块复用：指标列定义 + 自定义指标求值（公司详情页精简表全列展示用） */
  window.EarnMetricsApi = {
    metrics: METRICS,
    customMetrics: getCustomMetrics,
    metricVal: metricVal,          // metricVal(row, '#名称') → 自定义指标数值
  };
})();
