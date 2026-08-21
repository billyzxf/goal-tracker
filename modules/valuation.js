/* ================= 公司估值（valuation） ================= */
(function(){
  const VAL_MARKETS = ['A股','港股','美股','其他'];
  // A 股内的子板（港/美/其他不显示该字段）
  const VAL_BOARDS = [
    { key:'',         label:'(未选)', cls:'' },           // 空值表示"未指定"，但仅在弹窗编辑时可见；卡片上不渲染
    { key:'主板',     label:'主板',   cls:'indigo' },
    { key:'科创板',   label:'科创板', cls:'pink' },
    { key:'创业板',   label:'创业板', cls:'amber' },
  ];
  const BOARD_CLS = VAL_BOARDS.reduce((m, b) => (m[b.key] = b.cls, m), {});
  // 顶部筛选 chips 用的板列表（不含空值选项，顺序固定）
  const VAL_BOARD_FILTER = ['主板', '科创板', '创业板'];
  // 申万一级行业（东方财富行业分类）——用于行业筛选 chips 的顺序与配色
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
  // 公司行业映射（按 ticker → 申万一级行业），用于旧数据回填 industry 字段。
  // 东方财富行业分类（申万一级）。
  const COMPANY_INDUSTRY = {
    '688256.SH':'电子', '300308.SZ':'通信', '300502.SZ':'通信', '688008.SH':'电子',
    '688041.SH':'电子', '603019.SH':'计算机', '688012.SH':'电子', '688981.SH':'电子',
    '002371.SZ':'电子', '603986.SH':'电子', '601138.SH':'电子', '002463.SZ':'电子',
    '600183.SH':'电子', '000977.SZ':'计算机', '000938.SZ':'计算机', '600206.SH':'有色金属',
    '605338.SH':'食品饮料', '601872.SH':'交通运输', '002884.SZ':'机械设备', '605099.SH':'轻工制造',
    '002690.SZ':'机械设备', '603025.SH':'机械设备', '000915.SZ':'医药生物', '300770.SZ':'传媒',
    '603871.SH':'交通运输', '300926.SZ':'汽车', '001380.SZ':'汽车', '300181.SZ':'医药生物',
    '603173.SH':'机械设备', '605305.SH':'电力设备', '605499.SH':'食品饮料', '300628.SZ':'通信',
    '603444.SH':'传媒', '000848.SZ':'食品饮料', '002867.SZ':'商贸零售', '000528.SZ':'机械设备',
    '002648.SZ':'基础化工', '000791.SZ':'公用事业', '002957.SZ':'机械设备',
  };
  // 彼得·林奇 6 类公司分类（筛选 chips 顺序 / 配色 / 描述）
  const VAL_LYNCH_TYPES = [
    { key:'快速增长型', cls:'pink',   desc:'规模较小、高成长（年均 20%+），十倍股最可能出现的地方' },
    { key:'稳定增长型', cls:'indigo', desc:'大型公司、年增约 10~12%，抗周期，收益看买入时机与价格' },
    { key:'缓慢增长型', cls:'gray',   desc:'老牌巨头、年增仅 2~4%，主要靠股息，投资价值有限' },
    { key:'周期型',     cls:'amber',  desc:'业绩随经济周期波动，需把握买卖时机，周期顶峰买入最危险' },
    { key:'困境反转型', cls:'red',    desc:'遭受打击濒临破产但可能翻身，风险最高回报也可能最丰厚' },
    { key:'隐蔽资产型', cls:'green',  desc:'拥有价值巨大但未被市场发现的隐蔽资产，需深入理解并耐心等待' },
  ];
  const LYNCH_TYPE_CLS = VAL_LYNCH_TYPES.reduce((m, t) => (m[t.key] = t.cls, m), {});
  const LYNCH_TYPE_DESC = VAL_LYNCH_TYPES.reduce((m, t) => (m[t.key] = t.desc, m), {});
  // 公司林奇类型映射（按 ticker → 6 类之一），用于旧数据回填 companyType。
  const COMPANY_LYNCH_TYPE = {
    '688256.SH':'快速增长型', '300308.SZ':'快速增长型', '300502.SZ':'快速增长型', '688008.SH':'快速增长型',
    '688041.SH':'快速增长型', '603019.SH':'快速增长型', '688012.SH':'快速增长型', '688981.SH':'快速增长型',
    '002371.SZ':'快速增长型', '603986.SH':'快速增长型', '601138.SH':'稳定增长型', '002463.SZ':'快速增长型',
    '600183.SH':'快速增长型', '000977.SZ':'快速增长型', '000938.SZ':'稳定增长型', '600206.SH':'稳定增长型',
    '605338.SH':'稳定增长型', '601872.SH':'周期型', '002884.SZ':'稳定增长型', '605099.SH':'稳定增长型',
    '002690.SZ':'稳定增长型', '603025.SH':'稳定增长型', '000915.SZ':'稳定增长型', '300770.SZ':'稳定增长型',
    '603871.SH':'快速增长型', '300926.SZ':'快速增长型', '001380.SZ':'稳定增长型', '300181.SZ':'快速增长型',
    '603173.SH':'快速增长型', '605305.SH':'快速增长型', '605499.SH':'快速增长型', '300628.SZ':'稳定增长型',
    '603444.SH':'稳定增长型', '000848.SZ':'缓慢增长型', '002867.SZ':'稳定增长型', '000528.SZ':'周期型',
    '002648.SZ':'周期型', '000791.SZ':'缓慢增长型', '002957.SZ':'快速增长型',
  };
  // 基于股票代码启发式推断板（仅在 board 字段缺失时兜底用一次）
  function inferBoard(ticker){
    if(!ticker) return '';
    const t = String(ticker).toUpperCase();
    if(/^68[89]\d{3}\.SH$/.test(t)) return '科创板';        // 688/689 上交所 = 科创板（A股代码共6位，68 + 8 + 3位数字）
    if(/^30[01]\d{3}\.SZ$/.test(t)) return '创业板';        // 300/301 深交所 = 创业板
    if(/^60[0-5]\d{3}\.SH$/.test(t)) return '主板';         // 600/601/603/605 上交所主板
    if(/^00[012]\d{3}\.SZ$/.test(t)) return '主板';         // 000/001/002 深交所主板/中小板（合并后统称主板）
    return '';
  }
  // 弹窗里的"市场 ↔ 板块"联动：选 A 股时显示板块下拉，否则隐藏
  function setupBoardToggle(){
    const root = modalRoot;
    if(!root) return;
    const sel = root.querySelector('select[data-board-toggle]');
    const field = root.querySelector('[data-board-field]');
    if(!sel || !field) return;
    const sync = () => { field.style.display = sel.value === 'A股' ? '' : 'none'; };
    sync();
    sel.addEventListener('change', sync);
  }
  const VAL_METHODS = [
    { key:'PE',  label:'市盈率法',     cls:'m-pe',  desc:'估算价值 = 目标PE × 预期EPS',
      fields:[
        {key:'targetMultiple',label:'目标PE(倍)',shortLabel:'PE×'},
        {key:'baseValue',label:'预期EPS',shortLabel:'EPS'},
      ] },
    { key:'PB',  label:'市净率法',     cls:'m-pb',  desc:'估算价值 = 目标PB × 每股净资产',
      fields:[
        {key:'targetMultiple',label:'目标PB(倍)',shortLabel:'PB×'},
        {key:'baseValue',label:'每股净资产',shortLabel:'BV'},
      ] },
    { key:'PS',  label:'市销率法',     cls:'m-ps',  desc:'估算价值 = 目标PS × 每股营收',
      fields:[
        {key:'targetMultiple',label:'目标PS(倍)',shortLabel:'PS×'},
        {key:'baseValue',label:'每股营收',shortLabel:'SR'},
      ] },
    { key:'PEG', label:'PEG估值法',    cls:'m-peg', desc:'估算价值 = PEG基准 × 增长率(%) × EPS',
      fields:[
        {key:'targetMultiple',label:'PEG基准(通常=1)',shortLabel:'基准'},
        {key:'baseValue',label:'当前EPS',shortLabel:'EPS'},
        {key:'growthRate',label:'预期增长率(%)',shortLabel:'g%'},
      ] },
    { key:'DCF', label:'DCF现金流折现', cls:'m-dcf', desc:'折现未来5年自由现金流 + 永续价值，再除以总股本。可手动填各年FCF，或用「基年FCF+增长率」自动外推。',
      fields:[
        {key:'baseFcf',label:'基年FCF(亿)',group:'外推',shortLabel:'FCF₀'},
        {key:'growthRate',label:'年增长率(%)',group:'外推',shortLabel:'g%'},
        {key:'fcf1',label:'第1年FCF(亿)',group:'手动',shortLabel:'F1'},
        {key:'fcf2',label:'第2年FCF(亿)',group:'手动',shortLabel:'F2'},
        {key:'fcf3',label:'第3年FCF(亿)',group:'手动',shortLabel:'F3'},
        {key:'fcf4',label:'第4年FCF(亿)',group:'手动',shortLabel:'F4'},
        {key:'fcf5',label:'第5年FCF(亿)',group:'手动',shortLabel:'F5'},
        {key:'discountRate',label:'折现率(%)',shortLabel:'r%'},
        {key:'terminalGrowth',label:'永续增长率(%)',shortLabel:'g永%'},
        {key:'shares',label:'总股本(亿股)',shortLabel:'股本'}
      ] },
    { key:'EV',  label:'EV/EBITDA',    cls:'m-ev',  desc:'估算价值 = (目标倍数 × EBITDA − 净债务) / 总股本',
      fields:[
        {key:'targetMultiple',label:'目标EV/EBITDA(倍)',shortLabel:'EV×'},
        {key:'baseValue',label:'EBITDA(亿)',shortLabel:'EBITDA'},
        {key:'netDebt',label:'净债务(亿)',shortLabel:'净债'},
        {key:'shares',label:'总股本(亿股)',shortLabel:'股本'}
      ] },
  ];
  function valMethodInfo(key){ return VAL_METHODS.find(m => m.key === key) || VAL_METHODS[0]; }

  /* ================= 财务指标注册表 ================= */
  // 12 个分析指标。source:'input' 表示手动录入（每季度一个值）。
  // 已移除"有息负债率"（interestBearingLiabRatio）：数据无法可靠获取且暂不影响估值。
  // 旧字段 key（revenue/netProfit/grossMargin/opCashFlow/assetLiabRatio/roe）保持不变，已有数据自动保留。
  const METRICS = [
    { key:'totalAssets',      label:'总资产',       unit:'亿', priority:5, category:'核心指标', source:'input', desc:'总资产（资产负债表）' },
    { key:'equity',           label:'所有者权益',   unit:'亿', priority:5, category:'核心指标', source:'input', desc:'所有者权益（净资产）' },
    { key:'revenue',          label:'营业收入',     unit:'亿', priority:5, category:'核心指标', source:'input', desc:'营业收入（利润表）' },
    { key:'revenueYoy',       label:'营收同比',     unit:'%',  priority:5, category:'核心指标', source:'input', desc:'营业收入同比增长(%)（报告期累计值同比）' },
    { key:'grossProfit',      label:'毛利润',       unit:'亿', priority:5, category:'核心指标', source:'input', desc:'毛利润（利润表）' },
    { key:'netProfit',        label:'净利润',       unit:'亿', priority:5, category:'核心指标', source:'input', desc:'归母净利润（利润表）' },
    { key:'deductedNetProfit',label:'扣非净利润',   unit:'亿', priority:4, category:'核心指标', source:'input', desc:'扣除非经常性损益净利润' },
    { key:'deductedNetProfitYoy',label:'扣非净利同比', unit:'%', priority:4, category:'核心指标', source:'input', desc:'扣非净利润同比增长(%)（报告期累计值同比）' },
    { key:'opCashFlow',       label:'经营现金流',   unit:'亿', priority:4, category:'核心指标', source:'input', desc:'经营活动现金流净额（现金流量表）' },
    { key:'capex',            label:'资本开支',     unit:'亿', priority:4, category:'核心指标', source:'input', desc:'购建固定资产、无形资产和其他长期资产支付的现金（≈资本开支，用于估算FCF）' },
    { key:'roe',              label:'ROE',          unit:'%',  priority:4, category:'核心指标', source:'input', desc:'净资产收益率' },
    { key:'grossMargin',      label:'毛利率',       unit:'%',  priority:4, category:'核心指标', source:'input', desc:'毛利率' },
    { key:'netMargin',        label:'净利率',       unit:'%',  priority:4, category:'核心指标', source:'input', desc:'净利率 = 净利润/营业收入' },
    { key:'assetLiabRatio',   label:'资产负债率',   unit:'%',  priority:4, category:'核心指标', source:'input', desc:'资产负债率（资产负债表）' },
    { key:'totalAssetTurnover',label:'总资产周转率', unit:'次', priority:4, category:'核心指标', source:'input', desc:'总资产周转率 = 营业收入/总资产' },
  ];

  /* ----- 公司卡片列表要展示的"近期财务"指标（最近一季度的值） -----
   * 想再加新指标只需要在这里 push 一项即可。
   * key    : 财务数据里的字段名（与 METRICS / 录入表单一致）
   * label  : 卡片上显示的中文名
   * unit   : 显示用的单位后缀
   * format : 数字格式化函数（默认保留 1~2 位小数；负数显示负号）
   */
  const SUMMARY_METRICS = [
    { key:'grossMargin',    label:'毛利率',     unit:'%' },
    { key:'assetLiabRatio', label:'资产负债率', unit:'%' },
    { key:'roe',            label:'ROE',        unit:'%' },
  ];
  function getLatestFin(c){
    // 取最近一个季度（按 quarter 字符串字典序倒序，取首个）
    return (c.financials || []).slice().sort((a,b) => (b.quarter||'').localeCompare(a.quarter||''))[0] || null;
  }
  function fmtFinValue(n, unit){
    if(n == null || n === '' || isNaN(n)) return '<span class="muted">—</span>';
    const s = Math.abs(Number(n)) < 100 ? Number(n).toFixed(2) : Number(n).toFixed(1);
    return s + (unit || '');
  }
  function metricInfo(key){
    const built = METRICS.find(m => m.key === key);
    if(built) return built;
    const cm = (DB.valuation.customMetrics || []).find(m => m.key === key);
    if(cm) return Object.assign({}, cm, { source:'custom', category:'自定义' }); // 强制补 source/category，兼容历史数据（早期未存这两个字段）
    return { key, label:key, unit:'', priority:0, category:'自定义', source:'custom' };
  }
  // 复用独立纯函数模块（val-core.js）中的估值计算工具
  const { evalFormula, calcValuation, calcMoS, calcPosition, fmtMoney, fmtPct } = window.ValCore;

  /* ----- 计算某季度某指标的取值（支持自动增速 / 公式 / 自定义） ----- */
  function getMetricValue(fin, key, allFins){
    const m = metricInfo(key);
    const stored = fin ? fin[key] : null;
    if(stored != null && stored !== '' && !isNaN(stored)) return Number(stored);

    // 优先按 source 分支处理；自定义公式在 source 缺失时也兜底执行
    const isFormulaLike = m.source === 'formula' || m.source === 'custom';
    if(isFormulaLike && m.formula){
      return evalFormula(m.formula, fin || {});
    }
    if(m.source === 'auto' && m.growthBase && fin && fin.quarter && allFins){
      const m1 = (fin.quarter || '').match(/^(\d{4})Q([1-4])$/);
      if(m1){
        const prevQ = (parseInt(m1[1]) - 1) + 'Q' + m1[2];
        const prev = allFins.find(f => f.quarter === prevQ);
        const curr = fin[m.growthBase];
        const prevVal = prev ? prev[m.growthBase] : null;
        if(curr != null && prevVal != null && !isNaN(prevVal) && prevVal !== 0 && !isNaN(curr)){
          return (curr - prevVal) / Math.abs(prevVal) * 100;
        }
      }
      return null;
    }
    return null;
  }

  /* ----- 指标格式化 ----- */
  function fmtMetric(v, m){
    if(v == null || v === '' || isNaN(v)) return '<span class="muted">—</span>';
    let n = Number(v);
    let cls = '';
    if(m && (m.category === '增长率' || m.key === 'dividendYield')){
      cls = n > 0 ? 'up' : (n < 0 ? 'down' : '');
    }
    let str = Math.abs(n) < 100 ? n.toFixed(2) : n.toFixed(1);
    if(m && m.category === '增长率' && n !== 0) str = (n > 0 ? '+' : '') + str;
    const computed = m && (m.source === 'formula' || m.source === 'auto' || m.source === 'custom') ? 'computed-val' : '';
    // 数据单元格不带单位：单位已在表头列名（(亿)/(%)/(次)）中标明，数字后重复加会冗余
    return '<span class="' + computed + ' ' + cls + '">' + str + '</span>';
  }

  /* ----- 获取某公司的自定义指标列表 ----- */
  function customMetrics(){
    return DB.valuation.customMetrics || (DB.valuation.customMetrics = []);
  }

  /* ----- 估值趋势图（纯 SVG） ----- */
  function valChart(valuations){
    const data = valuations.filter(v => v.estimatedValue > 0).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    if(data.length < 2) return '<div class="muted" style="text-align:center;padding:16px;font-size:13px">需要至少 2 条估值记录才能绘制趋势图</div>';
    const w = 640, h = 200, pad = {l:54, r:16, t:18, b:36};
    const allVals = data.flatMap(v => [v.estimatedValue, v.actualPrice].filter(x => x > 0));
    const minV = Math.min(...allVals) * 0.92, maxV = Math.max(...allVals) * 1.08;
    const range = maxV - minV || 1;
    const xS = i => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
    const yS = v => h - pad.b - ((v - minV) / range) * (h - pad.t - pad.b);
    let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto">';
    for(let i = 0; i <= 4; i++){
      const y = pad.t + i * (h - pad.t - pad.b) / 4;
      const val = maxV - i * range / 4;
      svg += '<line class="cgrid" x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + y.toFixed(1) + '" stroke-width="1"/>';
      svg += '<text x="' + (pad.l-6) + '" y="' + (y+3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#8a93a3">' + val.toFixed(1) + '</text>';
    }
    let estPath = data.map((v,i) => (i===0?'M':'L') + ' ' + xS(i).toFixed(1) + ' ' + yS(v.estimatedValue).toFixed(1)).join(' ');
    svg += '<path d="' + estPath + '" fill="none" stroke="#5b64f2" stroke-width="2.5"/>';
    data.forEach((v,i) => { svg += '<circle cx="' + xS(i).toFixed(1) + '" cy="' + yS(v.estimatedValue).toFixed(1) + '" r="3.5" fill="#5b64f2"/>'; });
    const actData = data.filter(v => v.actualPrice > 0);
    if(actData.length >= 2){
      let actPath = '';
      actData.forEach((v) => {
        const i = data.indexOf(v);
        actPath += (actPath ? 'L' : 'M') + ' ' + xS(i).toFixed(1) + ' ' + yS(v.actualPrice).toFixed(1) + ' ';
      });
      svg += '<path d="' + actPath + '" fill="none" stroke="#0ea97b" stroke-width="2" stroke-dasharray="5,3"/>';
      actData.forEach(v => { const i = data.indexOf(v); svg += '<circle cx="' + xS(i).toFixed(1) + '" cy="' + yS(v.actualPrice).toFixed(1) + '" r="3" fill="#0ea97b"/>'; });
    }
    const step = Math.ceil(data.length / 6);
    data.forEach((v,i) => {
      if(i % step === 0 || i === data.length - 1)
        svg += '<text x="' + xS(i).toFixed(1) + '" y="' + (h - pad.b + 16) + '" text-anchor="middle" font-size="10" fill="#8a93a3">' + (v.date||'').slice(5) + '</text>';
    });
    svg += '<line x1="' + (w-pad.r-130) + '" y1="' + pad.t + '" x2="' + (w-pad.r-114) + '" y2="' + pad.t + '" stroke="#5b64f2" stroke-width="2.5"/>';
    svg += '<text x="' + (w-pad.r-108) + '" y="' + (pad.t+4) + '" font-size="10" fill="#66707f">估算价值</text>';
    svg += '<line x1="' + (w-pad.r-62) + '" y1="' + pad.t + '" x2="' + (w-pad.r-46) + '" y2="' + pad.t + '" stroke="#0ea97b" stroke-width="2" stroke-dasharray="3,2"/>';
    svg += '<text x="' + (w-pad.r-40) + '" y="' + (pad.t+4) + '" font-size="10" fill="#66707f">实际股价</text>';
    svg += '</svg>';
    return svg;
  }

  /* ----- 估值弹窗辅助 ----- */
  function valParamFields(method, params){
    const m = valMethodInfo(method);
    let html = '';
    let lastGroup = null;
    m.fields.forEach(f => {
      // 对带 group 的字段（如 DCF 的外推/手动两组）插入分组标题
      if(f.group && f.group !== lastGroup){
        lastGroup = f.group;
        html += '<div class="param-group-label">' + esc(f.group) + '模式</div>';
      }
      html += '<div class="field" style="flex:1;min-width:130px"><label>' + f.label + '</label>' +
        '<input type="number" step="0.01" name="param_' + f.key + '" value="' + (params && params[f.key] != null ? params[f.key] : '') + '" placeholder="0" oninput="recalcValuation()"></div>';
    });
    return html;
  }
  /* ----- 行内估值参数编辑（估值记录表内直接修改各方法参数，估算价值自动重算） -----
   * 不同估值方法所需参数不同（PE: 目标倍数+基数；PEG: 多一个增长率；DCF: 多组现金流+折现率；
   * EV: 多净债务+总股本）。为在统一表格中展示，采用"参数单元格按方法动态渲染"：
   * 表头统一为「参数」，单元格内根据每条记录的 method 渲染该方法的字段，行内可编辑。
   */
  // 单个参数输入框（短标签 + 步进器：输入框 + ▲▼ 上下三角按钮）
  function vpFieldHTML(c, v, params, f){
    const cur = params[f.key] != null && params[f.key] !== '' ? params[f.key] : '';
    const tag = f.shortLabel || f.label || f.key; // 短标签优先
    return '<span class="vp-field" title="' + esc(f.label) + (f.group ? '（' + esc(f.group) + '模式）' : '') + '">' +
      '<span class="vp-tag">' + esc(tag) + '</span>' +
      '<span class="vp-stepper">' +
        '<input type="number" step="0.01" class="vp-input" value="' + cur + '" placeholder="—" ' +
        'data-input="val.updateParam" data-id="' + c.id + '" data-vid="' + v.id + '" data-key="' + f.key + '">' +
        '<span class="vp-btns">' +
          '<button type="button" class="vp-btn vp-up" title="加 0.01（按住可连点）" onclick="vpStep(this,1)">▲</button>' +
          '<button type="button" class="vp-btn vp-down" title="减 0.01（按住可连点）" onclick="vpStep(this,-1)">▼</button>' +
        '</span>' +
      '</span>' +
      '</span>';
  }
  // 步进按钮：调整同行 input 的值（按 0.01 步长），然后触发 input 事件让 val.updateParam 实时重算
  // 暴露为 window.vpStep 供内联 onclick 调用
  function vpStep(btn, dir){
    const input = btn.parentElement.parentElement.querySelector('.vp-input');
    if(!input) return;
    const step = parseFloat(input.step) || 0.01;
    const cur = parseFloat(input.value) || 0;
    const next = Math.round((cur + dir * step) * 1000) / 1000; // 保留 3 位精度避免浮点累加
    input.value = (Math.abs(next) < 1e-10 ? 0 : next);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // 暴露给行内 onclick 使用
  window.vpStep = vpStep;
  function valParamInline(c, v){
    const m = valMethodInfo(v.method);
    const params = v.params || (v.params = {});
    // DCF 外推模式：行内只显示外推输入（基年FCF + 年增长率），
    // 折现率/永续增长率/总股本/手动 fcf1-5 均只在 ⚙ 弹窗中编辑。
    if(v.method === 'DCF'){
      const mainKeys = ['baseFcf','growthRate'];
      const main = m.fields.filter(f => mainKeys.includes(f.key));
      return '<div class="val-param-inline">' + main.map(f => vpFieldHTML(c, v, params, f)).join('') + '</div>';
    }
    return '<div class="val-param-inline">' + m.fields.map(f => vpFieldHTML(c, v, params, f)).join('') + '</div>';
  }
  function valModalBody(company, val){
    const method = val ? val.method : 'PE';
    const params = val ? (val.params || {}) : {};
    const est = val ? (val.estimatedValue || 0) : 0;
    return '<input type="hidden" name="cid" value="' + company.id + '">' +
      '<input type="hidden" name="id" value="' + (val ? val.id : '') + '">' +
      '<div class="field"><label>估算日期</label><input type="date" name="date" value="' + (val ? val.date : dateStr()) + '"></div>' +
      '<div class="field"><label>估值方法</label><select name="method" onchange="switchValMethod()">' +
      VAL_METHODS.map(m => '<option value="' + m.key + '"' + (method === m.key ? ' selected' : '') + '>' + m.label + '</option>').join('') + '</select>' +
      '<div class="muted" id="methodDesc" style="margin-top:4px;font-size:12px">' + valMethodInfo(method).desc + '</div></div>' +
      '<div class="param-grid" id="valParams">' + valParamFields(method, params) + '</div>' +
      '<div class="field"><label>估算每股价值 <span class="muted" style="font-weight:400">（自动计算）</span></label>' +
      '<div id="estValueDisplay" style="font-size:24px;font-weight:800;color:var(--indigo)">' + est.toFixed(2) + '</div></div>' +
      '<div class="field"><label>当时实际股价</label><input type="number" step="0.01" name="actualPrice" value="' + (val ? (val.actualPrice || '') : '') + '" placeholder="填入当时的实际股价" oninput="updateMoSDisplay()"></div>' +
      '<div id="mosDisplay" style="margin-bottom:12px"></div>' +
      mdField('note', '备注', val ? val.note : '', 3);
  }
  function switchValMethod(){
    const form = document.querySelector('[data-form="val.saveVal"]');
    if(!form) return;
    const method = form.querySelector('[name="method"]').value;
    const existing = {};
    form.querySelectorAll('[name^="param_"]').forEach(inp => { existing[inp.name.replace('param_','')] = inp.value; });
    form.querySelector('#valParams').innerHTML = valParamFields(method, existing);
    form.querySelector('#methodDesc').textContent = valMethodInfo(method).desc;
    recalcValuation();
    updateMoSDisplay();
  }
  function recalcValuation(){
    const form = document.querySelector('[data-form="val.saveVal"]');
    if(!form) return;
    const method = form.querySelector('[name="method"]').value;
    const params = {};
    valMethodInfo(method).fields.forEach(f => {
      const el = form.querySelector('[name="param_' + f.key + '"]');
      if(el) params[f.key] = parseFloat(el.value) || 0;
    });
    const est = calcValuation(method, params);
    const disp = form.querySelector('#estValueDisplay');
    if(disp) disp.textContent = est.toFixed(2);
    updateMoSDisplay();
  }
  function updateMoSDisplay(){
    const form = document.querySelector('[data-form="val.saveVal"]');
    if(!form) return;
    const est = parseFloat(form.querySelector('#estValueDisplay').textContent) || 0;
    const actual = parseFloat(form.querySelector('[name="actualPrice"]').value) || 0;
    const el = form.querySelector('#mosDisplay');
    if(!el) return;
    if(est > 0 && actual > 0){
      const mos = calcMoS(est, actual);
      const cls = mos >= 0 ? 'mos-pos' : 'mos-neg';
      const txt = mos >= 0 ? '安全边际 +' + mos.toFixed(1) + '%（被低估）' : '安全边际 ' + mos.toFixed(1) + '%（被高估）';
      el.innerHTML = '<span class="' + cls + '">' + txt + '</span>';
    } else el.innerHTML = '';
  }
  window.switchValMethod = switchValMethod;
  window.recalcValuation = recalcValuation;
  window.updateMoSDisplay = updateMoSDisplay;

  /* ----- 公司列表视图 ----- */
  function renderValuation(){
    if(state.valCompanyId){
      const c = findById(DB.valuation.companies, state.valCompanyId);
      if(c) return renderCompanyDetail(c);
      state.valCompanyId = null;
    }
    const companies = DB.valuation.companies;
    let list = companies.slice();
    // 按板筛选：state.valBoard='全部' 显示全部；否则只显示对应板（c.board 匹配的）
    // 兼容：旧 state.valMarket 值（A股/港股/美股/其他）如果还在，回退为'全部'，避免没有 chip active
    if(!['全部', ...VAL_BOARD_FILTER].includes(state.valBoard)) state.valBoard = '全部';
    if(state.valBoard !== '全部') list = list.filter(c => c.board === state.valBoard);
    // 按行业筛选：state.valIndustry='全部' 显示全部；否则只显示对应行业（c.industry 匹配的）
    const usedIndustries = [...new Set(companies.map(c => c.industry).filter(Boolean))];
    if(state.valIndustry && state.valIndustry !== '全部' && !usedIndustries.includes(state.valIndustry)){
      state.valIndustry = '全部';   // 行业列表中已不存在的筛选值回退为全部
    }
    if(state.valIndustry && state.valIndustry !== '全部') list = list.filter(c => c.industry === state.valIndustry);
    // 按林奇公司类型筛选：state.valLynchType='全部' 显示全部；否则只显示对应类型（c.companyType 匹配的）
    const usedLynch = [...new Set(companies.map(c => c.companyType).filter(Boolean))];
    if(state.valLynchType && state.valLynchType !== '全部' && !usedLynch.includes(state.valLynchType)){
      state.valLynchType = '全部';
    }
    if(state.valLynchType && state.valLynchType !== '全部') list = list.filter(c => c.companyType === state.valLynchType);

    let totalPos = 0, totalCost = 0, totalRealized = 0, totalMv = 0;
    companies.forEach(c => {
      const pos = calcPosition(c.investments || []);
      totalPos += pos.position;
      totalCost += pos.cost;
      totalRealized += pos.realized;
      totalMv += pos.position * (c.currentPrice || 0);
    });
    const totalPnl = totalMv - totalCost;

    let h = header('📈 公司估值', '追踪关注公司的财务数据与估值 · 共 ' + companies.length + ' 家',
      '<button class="btn ghost sm" data-action="val.importPrices" title="导入最新股价 CSV（data/prices/当前股价.csv），批量更新全部公司现价">⬆ 导入股价</button>' +
      '<button class="btn ghost sm" data-action="val.exportAllCsv" title="导出全部公司的财务数据 CSV，文件名：{股票代码}_{公司名}.csv（如 688256.SH_寒武纪.csv）">⬇ 导出全部 CSV</button>' +
      '<button class="btn ghost sm" data-action="val.importAllCsv" title="批量导入财务数据 CSV，文件名：{股票代码}_{公司名}.csv，可多选。\n这些文件可由 scripts/fetch_financial.py 从东方财富自动抓取生成">⬆ 批量导入 CSV</button>' +
      '<button class="btn primary" style="background:var(--indigo)" data-action="val.addCompany">＋ 添加公司</button>');

    // —— 导入导出说明 ——
    h += '<div class="import-help">' +
      '<b>📦 数据导入 / 导出</b>' +
      '<span>📈 股价：运行 <code>py scripts/fetch_prices.py --json ../goal-tracker-data.json</code> 生成 <code>data/prices/当前股价.csv</code>，再点「⬆ 导入股价」批量更新现价。</span>' +
      '<span>📊 财务：文件 <code>{股票代码}_{公司名}.csv</code>，如 <code>688256.SH_寒武纪.csv</code>；运行 <code>py scripts/fetch_financial.py --auto</code> 抓取后「⬆ 批量导入 CSV」。</span>' +
      '</div>';

    h += '<div class="val-summary-grid">';
    h += '<div class="val-stat"><div class="vs-label">关注公司</div><div class="vs-value">' + companies.length + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">持仓市值</div><div class="vs-value">' + fmtMoney(totalMv) + '</div><div class="vs-sub">' + totalPos.toFixed(0) + ' 股</div></div>';
    h += '<div class="val-stat"><div class="vs-label">持仓成本</div><div class="vs-value">' + fmtMoney(totalCost) + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">浮动盈亏</div><div class="vs-value ' + (totalPnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(totalPnl) + '</div><div class="vs-sub ' + (totalPnl >= 0 ? 'up' : 'down') + '">' + fmtPct(totalCost > 0 ? totalPnl/totalCost*100 : 0) + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">已实现盈亏</div><div class="vs-value ' + (totalRealized >= 0 ? 'up' : 'down') + '">' + fmtMoney(totalRealized) + '</div></div>';
    h += '</div>';

    h += '<div class="chips" style="margin-bottom:10px">' +
      ['全部'].concat(VAL_BOARD_FILTER).map(b => '<button class="chip ' + (state.valBoard === b ? 'active' : '') + '" data-action="val.fBoard" data-v="' + b + '">' + b + (b === '全部' ? '（' + companies.length + '）' : '（' + companies.filter(c => c.board === b).length + '）') + '</button>').join('') + '</div>';
    // 行业筛选 chips（按申万一级行业顺序，只显示实际存在的行业）
    const indList = VAL_INDUSTRIES.filter(i => usedIndustries.includes(i)).concat(
      usedIndustries.filter(i => !VAL_INDUSTRIES.includes(i)));   // 未在标准列表中的行业附加在后面
    h += '<div class="chips" style="margin-bottom:16px">' +
      '<button class="chip ' + (state.valIndustry === '全部' || !state.valIndustry ? 'active' : '') + '" data-action="val.fIndustry" data-v="全部">全部（' + companies.length + '）</button>' +
      indList.map(i => '<button class="chip ' + (state.valIndustry === i ? 'active' : '') + '" data-action="val.fIndustry" data-v="' + esc(i) + '">' + i + '（' + companies.filter(c => c.industry === i).length + '）</button>').join('') + '</div>';
    // 林奇公司类型筛选 chips（按 VAL_LYNCH_TYPES 顺序，只显示实际存在的类型）
    const usedLynchList = VAL_LYNCH_TYPES.map(t => t.key).filter(k => usedLynch.includes(k)).concat(
      usedLynch.filter(k => !VAL_LYNCH_TYPES.some(t => t.key === k)));
    h += '<div class="chips" style="margin-bottom:16px">' +
      '<button class="chip ' + (state.valLynchType === '全部' || !state.valLynchType ? 'active' : '') + '" data-action="val.fLynch" data-v="全部">全部（' + companies.length + '）</button>' +
      usedLynchList.map(k => {
        const desc = LYNCH_TYPE_DESC[k] ? ' title="' + esc(LYNCH_TYPE_DESC[k]) + '"' : '';
        return '<button class="chip ' + (state.valLynchType === k ? 'active' : '') + '" data-action="val.fLynch" data-v="' + esc(k) + '"' + desc + '>' + k + '（' + companies.filter(c => c.companyType === k).length + '）</button>';
      }).join('') + '</div>';

    if(!list.length){ h += '<div class="card"><div class="empty">该市场下暂无公司，点击右上角添加</div></div>'; return h; }

    h += list.map(c => {
      const pos = calcPosition(c.investments || []);
      const mv = pos.position * (c.currentPrice || 0);
      const pnl = mv - pos.cost;
      const pnlPct = pos.cost > 0 ? pnl / pos.cost * 100 : 0;
      const latestVal = (c.valuations || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
      const mos = latestVal ? calcMoS(latestVal.estimatedValue, c.currentPrice || latestVal.actualPrice) : null;
      const marketBadge = { 'A股':'indigo', '港股':'pink', '美股':'green', '其他':'gray' }[c.market || 'A股'] || 'gray';
      let stats = '';
      if(pos.position > 0){
        stats += '<div class="cc-stat"><span class="label">持仓</span><span class="val">' + pos.position.toFixed(0) + ' 股</span></div>';
        stats += '<div class="cc-stat"><span class="label">成本</span><span class="val">' + (pos.avgCost || 0).toFixed(2) + '</span></div>';
        stats += '<div class="cc-stat"><span class="label">现价</span><span class="val">' + (c.currentPrice || 0).toFixed(2) + '</span></div>';
        stats += '<div class="cc-stat"><span class="label">浮盈亏</span><span class="val ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(pnl) + ' (' + fmtPct(pnlPct) + ')</span></div>';
      } else if(c.currentPrice){
        stats += '<div class="cc-stat"><span class="label">现价</span><span class="val">' + (c.currentPrice || 0).toFixed(2) + ' ' + (c.currency||'') + '</span></div>';
      }
      // 近期财务概览（最近一季度的关键指标）
      const latestFin = getLatestFin(c);
      if(latestFin){
        SUMMARY_METRICS.forEach(sm => {
          const v = latestFin[sm.key];
          const tip = latestFin.quarter ? ' title="' + esc(latestFin.quarter) + '"' : '';
          stats += '<div class="cc-stat"' + tip + '><span class="label">' + esc(sm.label) + '</span><span class="val">' + fmtFinValue(v, sm.unit) + '</span></div>';
        });
      }
      if(latestVal){
        stats += '<div class="cc-stat"><span class="label">最新估值</span><span class="val">' + (latestVal.estimatedValue||0).toFixed(2) + ' <span class="method-badge ' + valMethodInfo(latestVal.method).cls + '">' + valMethodInfo(latestVal.method).label + '</span></span></div>';
        if(mos != null) stats += '<div class="cc-stat"><span class="label">安全边际</span><span class="val ' + (mos >= 0 ? 'mos-pos' : 'mos-neg') + '">' + fmtPct(mos) + '</span></div>';
      }
      return '<div class="company-card">' +
        '<div class="cc-head"><div>' +
          '<span class="cc-name" data-action="val.openCompany" data-id="' + c.id + '">' + esc(c.name) + '</span>' +
          ' <span class="badge ' + marketBadge + '">' + esc(c.market||'A股') + '</span>' +
          (c.market === 'A股' && c.board ? ' <span class="badge ' + (BOARD_CLS[c.board]||'gray') + '">' + esc(c.board) + '</span>' : '') +
          (c.industry ? ' <span class="badge ' + (INDUSTRY_CLS[c.industry]||'gray') + '">' + esc(c.industry) + '</span>' : '') +
          (c.companyType ? ' <span class="badge ' + (LYNCH_TYPE_CLS[c.companyType]||'gray') + '" title="' + esc(LYNCH_TYPE_DESC[c.companyType]||'') + '">' + esc(c.companyType) + '</span>' : '') +
          '<div class="cc-meta">' + esc(c.ticker||'') + (c.sector ? ' · ' + esc(c.sector) : '') + (c.currency ? ' · ' + c.currency : '') + '</div>' +
        '</div><div class="q-actions">' +
          '<button class="icon-btn" title="编辑" data-action="val.editCompany" data-id="' + c.id + '">✎</button>' +
          '<button class="icon-btn" title="删除" data-action="val.delCompany" data-id="' + c.id + '">✕</button></div></div>' +
        (stats ? '<div class="cc-stats">' + stats + '</div>' : '') +
        (c.note ? '<div class="muted" style="margin-top:8px;font-size:12px">' + esc(c.note.slice(0,60) + (c.note.length > 60 ? '…' : '')) + '</div>' : '') +
      '</div>';
    }).join('');
    return h;
  }

  /* ----- 公司详情视图 ----- */
  function renderCompanyDetail(c){
    const pos = calcPosition(c.investments || []);
    const mv = pos.position * (c.currentPrice || 0);
    const pnl = mv - pos.cost;
    const pnlPct = pos.cost > 0 ? pnl / pos.cost * 100 : 0;

    let h = '<span class="back-link" data-action="val.back">← 返回公司列表</span>';
    h += '<div class="page-head"><div><h1>' + esc(c.name) + (c.market === 'A股' && c.board ? ' <span class="badge ' + (BOARD_CLS[c.board]||'gray') + '">' + esc(c.board) + '</span>' : '') + (c.industry ? ' <span class="badge ' + (INDUSTRY_CLS[c.industry]||'gray') + '">' + esc(c.industry) + '</span>' : '') + (c.companyType ? ' <span class="badge ' + (LYNCH_TYPE_CLS[c.companyType]||'gray') + '" title="' + esc(LYNCH_TYPE_DESC[c.companyType]||'') + '">' + esc(c.companyType) + '</span>' : '') + '</h1><div class="muted">' + esc(c.ticker||'') + ' · ' + esc(c.market||'') + (c.market === 'A股' && c.board ? ' · ' + esc(c.board) : '') + (c.industry ? ' · ' + esc(c.industry) : '') + (c.companyType ? ' · ' + esc(c.companyType) : '') + ' · ' + esc(c.sector||'') + (c.currency ? ' · ' + c.currency : '') + '</div></div>' +
      '<div class="head-actions"><button class="btn ghost sm" data-action="val.editCompany" data-id="' + c.id + '">✎ 编辑</button>' +
      '<button class="btn danger-ghost sm" data-action="val.delCompany" data-id="' + c.id + '">🗑 删除</button></div></div>';

    h += '<div class="val-summary-grid">';
    h += '<div class="val-stat"><div class="vs-label">当前股价</div><div class="vs-value">' + (c.currentPrice||0).toFixed(2) + '</div>' +
      '<input type="number" step="0.01" class="price-input" data-change="val.price" data-id="' + c.id + '" value="' + (c.currentPrice||'') + '" placeholder="更新现价"></div>';
    // 总市值 = 当前股价 × 总股本（亿股）；无总股本时显示 —
    const totalShares = Number(c.totalShares) || 0;
    const totalMvVal = totalShares > 0 ? (c.currentPrice || 0) * totalShares : null;
    // 总股本显示：去掉无意义的尾随 0（如 4.2100 → 4.21，4.0000 → 4）
    const sharesStr = totalShares > 0 ? String(parseFloat(totalShares.toFixed(4))) : '';
    h += '<div class="val-stat"><div class="vs-label">总市值</div><div class="vs-value">' + (totalMvVal == null ? '<span class="muted">—</span>' : fmtMoney(totalMvVal)) + '</div>' +
      '<div class="vs-sub muted">总股本 ' + (totalShares > 0 ? sharesStr + ' 亿股' : '未填') + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">总股本（亿股）</div><div class="vs-value">' + (totalShares > 0 ? sharesStr : '<span class="muted">—</span>') + '</div>' +
      '<input type="number" step="0.0001" class="price-input" data-change="val.totalShares" data-id="' + c.id + '" value="' + (totalShares > 0 ? sharesStr : '') + '" placeholder="如：4.21"></div>';
    if(pos.position > 0){
      h += '<div class="val-stat"><div class="vs-label">持仓</div><div class="vs-value">' + pos.position.toFixed(0) + ' 股</div><div class="vs-sub">均成本 ' + pos.avgCost.toFixed(2) + '</div></div>';
      h += '<div class="val-stat"><div class="vs-label">市值</div><div class="vs-value">' + fmtMoney(mv) + '</div></div>';
      h += '<div class="val-stat"><div class="vs-label">浮动盈亏</div><div class="vs-value ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(pnl) + '</div><div class="vs-sub ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtPct(pnlPct) + '</div></div>';
      if(pos.realized !== 0) h += '<div class="val-stat"><div class="vs-label">已实现盈亏</div><div class="vs-value ' + (pos.realized >= 0 ? 'up' : 'down') + '">' + fmtMoney(pos.realized) + '</div></div>';
    }
    h += '</div>';

    if(c.note) h += '<div class="card"><div class="md">' + md(c.note) + '</div></div>';

    const fins = (c.financials||[]).slice().sort((a,b) => state.valFinSort === 'asc'
      ? (a.quarter||'').localeCompare(b.quarter||'')
      : (b.quarter||'').localeCompare(a.quarter||''));
    h += '<div class="val-section"><div class="vs-head"><h3>📋 分季度财务数据 <span class="muted" style="font-weight:400;font-size:12px">共 ' + fins.length + ' 个季度</span></h3><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
      '<div class="fin-sort">' +
        '<button class="sort-btn ' + (state.valFinSort === 'desc' ? 'active' : '') + '" data-action="val.toggleFinSort" data-v="desc" title="最新季度在前">新→旧</button>' +
        '<button class="sort-btn ' + (state.valFinSort === 'asc' ? 'active' : '') + '" data-action="val.toggleFinSort" data-v="asc" title="最早季度在前">旧→新</button>' +
      '</div>' +
      '<button class="btn ghost sm" data-action="val.metricsConfig" data-id="' + c.id + '">⚙ 自定义指标（' + customMetrics().length + '）</button>' +
      '<button class="btn ghost sm" data-action="val.addFin" data-id="' + c.id + '">＋ 添加季度</button>' +
      '<button class="btn ghost sm" data-action="val.exportCsv" data-id="' + c.id + '" title="导出本公司的财务数据 CSV，文件名：' + esc(c.ticker || '') + '_' + esc(c.name || '') + '.csv，可在 Excel 处理或批量填数后导入">⬇ 导出 CSV</button>' +
      '<button class="btn ghost sm" data-action="val.importCsv" data-id="' + c.id + '" title="导入/更新本公司的财务数据 CSV（文件名：' + esc(c.ticker || '') + '_' + esc(c.name || '') + '.csv，可用 fetch_financial.py 生成）">⬆ 导入 CSV</button>' +
      '</div></div>';
    if(!fins.length) h += '<div class="empty">还没有财务数据，点击右上角添加</div>';
    else {
      const displayMetrics = METRICS.map(m => ({...m}));
      customMetrics().forEach(cm => displayMetrics.push({ ...cm, source:'custom', category:'自定义' }));
      h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr><th>季度</th>';
      displayMetrics.forEach(mi => {
        // 表头保留单位后缀（总资产(亿)、ROE(%)…），数据单元格里不再重复带单位
        h += '<th class="num" title="' + esc(mi.desc||mi.label) + '">' + esc(mi.label) +
          (mi.unit ? ' <span class="unit">(' + mi.unit + ')</span>' : '') +
          (mi.source === 'formula' || mi.source === 'auto' || mi.source === 'custom' ? ' 📐' : '') + '</th>';
      });
      h += '<th>备注</th><th></th></tr></thead><tbody>';
      fins.forEach(f => {
        h += '<tr><td><b>' + esc(f.quarter) + '</b></td>';
        displayMetrics.forEach(mi => { h += '<td class="num">' + fmtMetric(getMetricValue(f, mi.key, fins), mi) + '</td>'; });
        h += '<td class="muted" style="max-width:120px">' + esc(f.note || '') + '</td>';
        h += '<td class="actions-cell"><button class="icon-btn" data-action="val.editFin" data-id="' + c.id + '" data-fid="' + f.id + '">✎</button><button class="icon-btn" data-action="val.delFin" data-id="' + c.id + '" data-fid="' + f.id + '" data-fquarter="' + esc(f.quarter) + '">✕</button></td>';
        h += '</tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';

    // ============ 盈利预测模块 ============
    h += renderForecastSection(c);

    h += '<div class="val-section"><div class="vs-head"><h3>💰 估值记录</h3><button class="btn primary sm" style="background:var(--indigo)" data-action="val.addVal" data-id="' + c.id + '">＋ 添加估值</button></div>';
    const vals = (c.valuations||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
    if(!vals.length) h += '<div class="empty">还没有估值记录</div>';
    else {
      h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
        '<th>日期</th><th>方法</th><th>参数</th><th class="num">估算价值</th><th class="num">实际股价</th><th class="num">安全边际</th><th>备注</th><th></th>' +
        '</tr></thead><tbody>';
      h += vals.map(v => {
        const mi = valMethodInfo(v.method);
        const mos = calcMoS(v.estimatedValue, v.actualPrice);
        const mosCls = mos == null ? '' : (mos >= 0 ? 'mos-pos' : 'mos-neg');
        return '<tr data-val-row="' + v.id + '">' +
          '<td>' + esc(v.date||'') + '</td>' +
          '<td><span class="method-badge ' + mi.cls + '">' + mi.label + '</span></td>' +
          // 参数：行内按方法动态渲染各字段输入框（可编辑，估算价值随之自动重算）
          '<td>' + valParamInline(c, v) + '</td>' +
          // 估算价值：只读，由参数自动计算得出
          '<td class="num"><b data-est-cell style="color:var(--indigo)">' + (v.estimatedValue||0).toFixed(2) + '</b></td>' +
          // 实际股价：行内可直接调整
          '<td class="num"><input class="val-inline" type="number" step="0.01" value="' + (v.actualPrice != null ? v.actualPrice : '') + '" data-change="val.updateVal" data-id="' + c.id + '" data-vid="' + v.id + '" data-field="actualPrice" style="width:80px" placeholder="—" title="调整实际股价"></td>' +
          '<td class="num ' + mosCls + '" data-mos-cell>' + (mos == null ? '—' : fmtPct(mos)) + '</td>' +
          '<td class="muted" style="max-width:150px">' + esc(v.note || '') + '</td>' +
          '<td class="actions-cell">' +
            '<button class="icon-btn" data-action="val.editVal" data-id="' + c.id + '" data-vid="' + v.id + '" title="编辑方法参数/备注">⚙</button>' +
            '<button class="icon-btn" data-action="val.delVal" data-id="' + c.id + '" data-vid="' + v.id + '">✕</button></td>' +
          '</tr>';
      }).join('');
      h += '</tbody></table></div>';
      // 估值趋势图：移到估值记录下方
      if(vals.length >= 2){
        h += '<div class="val-chart" style="margin-top:14px">' + valChart(vals) + '</div>';
      }
    }
    h += '</div>';

    h += '<div class="val-section"><div class="vs-head"><h3>📝 投资买卖记录</h3><button class="btn primary sm" style="background:var(--indigo)" data-action="val.addInv" data-id="' + c.id + '">＋ 添加记录</button></div>';
    const invs = (c.investments||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
    if(!invs.length) h += '<div class="empty">还没有投资记录</div>';
    else {
      h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
        '<th>日期</th><th>操作</th><th class="num">价格</th><th class="num">股数</th><th class="num">金额</th><th>备注</th><th></th>' +
        '</tr></thead><tbody>';
      h += invs.map(inv => {
        const isBuy = inv.action === 'buy';
        return '<tr>' +
          '<td>' + esc(inv.date||'') + '</td>' +
          '<td><span class="badge ' + (isBuy ? 'green' : 'pink') + '">' + (isBuy ? '买入' : '卖出') + '</span></td>' +
          '<td class="num">' + (inv.price||0).toFixed(2) + '</td>' +
          '<td class="num">' + (inv.shares||0) + '</td>' +
          '<td class="num">' + fmtMoney((inv.price||0) * (inv.shares||0)) + '</td>' +
          '<td class="muted">' + esc(inv.note || '') + '</td>' +
          '<td class="actions-cell"><button class="icon-btn" data-action="val.delInv" data-id="' + c.id + '" data-iid="' + inv.id + '">✕</button></td>' +
          '</tr>';
      }).join('');
      h += '</tbody></table></div>';
      if(pos.position > 0){
        h += '<div style="margin-top:10px;font-size:13px;color:var(--ink2)">当前持仓：<b>' + pos.position.toFixed(0) + '</b> 股 · 均成本 <b>' + pos.avgCost.toFixed(2) + '</b>';
        if(pos.realized !== 0) h += ' · 已实现盈亏 <b class="' + (pos.realized >= 0 ? 'up' : 'down') + '">' + fmtMoney(pos.realized) + '</b>';
        h += '</div>';
      }
    }
    h += '</div>';

    /* ----- 公司研究模块（业务判断 / 关注重点 / 关键影响因素） ----- */
    h += '<div class="val-section"><div class="vs-head"><h3>🔬 公司研究</h3>' +
      '<button class="btn primary sm" style="background:var(--indigo)" data-action="val.editResearch" data-id="' + c.id + '">' +
      (c.research ? '✎ 编辑' : '＋ 开始记录') + '</button></div>';
    if(c.research && String(c.research).trim()){
      h += '<div class="card" style="padding:16px 18px"><div class="md">' + md(c.research) + '</div></div>';
    } else {
      h += '<div class="empty">还没有研究记录 · 点击右上角「＋ 开始记录」记录你的业务判断、关注重点、关键影响因素等</div>';
    }
    h += '</div>';
    return h;
  }

  /* ================= CSV 导入 / 导出 =================
   * CSV 用途：把某公司的财务数据导出为结构化文本，可在 Excel/外部批量处理、
   *           批量获取数据后，再导入回项目，实现跨设备同步与外部分析。
   * CSV 格式：
   *   第1行:  # GoalTracker 财务数据
   *   第2行:  公司,股票代码
   *   第3行:  寒武纪,688256.SH
   *   第4行:  季度,totalAssets,equity,revenue,...  （指标英文 key，与数据字段一致）
   *   第5行起: 各季度数据
   * 支持自定义指标（customMetrics）额外导出/导入。
   */
  /* ================= 盈利预测模块 =================
   * 数据存于 c.forecast：
   *   { updated, detail:[{org,researcher,date,rating,pred:[{year,mark,eps,np}]}],
   *     consensus:[{year,mark,eps,pe,roe,revenue,np,revRatio,npRatio}],
   *     eps:[{org,date,year1,eps1,pe1,year2,eps2,pe2,year3,eps3,pe3}] }
   */
  function hasForecast(c){ return !!(c.forecast && ((c.forecast.detail||[]).length || (c.forecast.consensus||[]).length || (c.forecast.eps||[]).length)); }
  // 判断日期是否在近 N 个月内（用于过滤券商明细/机构EPS等条目多的）
  function isRecent3m(dateStr){
    if(!dateStr) return true;
    const d = new Date(dateStr);
    if(isNaN(d)) return true;
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 3);
    return d >= cutoff;
  }
  // 把年份标记转成可读文本（A=实际/E=预测）
  function yearMarkLabel(mark){
    if(!mark) return '';
    return mark === 'A' ? '实际' : (mark === 'E' ? '预测' : '');
  }
  function renderForecastSection(c){
    let h = '<div class="val-section"><div class="vs-head"><h3>📈 盈利预测 ' +
      (c.forecast && c.forecast.updated ? '<span class="muted" style="font-weight:400;font-size:12px">更新于 ' + esc(c.forecast.updated) + '</span>' : '') +
      '</h3><div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" data-action="val.exportForecast" data-id="' + c.id + '" title="导出盈利预测 CSV，文件名：盈利预测_' + esc(c.ticker || '') + '_' + esc(c.name || '') + '.csv">⬇ 导出预测</button>' +
      '<button class="btn ghost sm" data-action="val.importForecast" data-id="' + c.id + '" title="导入盈利预测 CSV（文件名：盈利预测_{代码}_{公司名}.csv，如 盈利预测_688256.SH_寒武纪.csv）">⬆ 导入预测</button>' +
      '</div></div>';
    if(!hasForecast(c)){
      h += '<div class="empty">还没有盈利预测数据。<br>' +
        '<span class="muted" style="font-size:12px">导入文件名：<code>盈利预测_{代码}_{公司名}.csv</code>（如 <code>盈利预测_688256.SH_寒武纪.csv</code>）。<br>' +
        '可由 <code>py scripts/fetch_profit_forecast.py --json ../data/goal-tracker-data.json --update-json</code> 自动抓取到 <code>data/forecast/</code>，再点「⬆ 导入预测」选择该文件。</span></div>';
      return h + '</div>';
    }
    const fc = c.forecast;
    // —— 1) 一致预期（按年份，营收/净利） ——
    if((fc.consensus||[]).length){
      h += '<div class="fc-block"><div class="fc-title">一致预期（营收/净利）</div>' +
        '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
        '<th>年份</th><th>类型</th><th class="num">EPS</th><th class="num">PE</th><th class="num">ROE%</th>' +
        '<th class="num">营收(亿)</th><th class="num">净利(亿)</th><th class="num">营收同比%</th><th class="num">净利同比%</th>' +
        '</tr></thead><tbody>';
      fc.consensus.slice().sort((a,b) => String(a.year).localeCompare(String(b.year))).forEach(cn => {
        h += '<tr><td><b>' + esc(cn.year) + '</b></td><td><span class="method-badge ' + (cn.mark === 'A' ? 'blue' : 'green') + '">' + yearMarkLabel(cn.mark) + '</span></td>' +
          '<td class="num">' + n2(cn.eps) + '</td><td class="num">' + n2(cn.pe) + '</td><td class="num">' + n2(cn.roe) + '</td>' +
          '<td class="num">' + n2(cn.revenue) + '</td><td class="num"><b>' + n2(cn.np) + '</b></td>' +
          '<td class="num">' + n2(cn.revRatio) + '</td><td class="num">' + n2(cn.npRatio) + '</td></tr>';
      });
      h += '</tbody></table></div></div>';
    }
    // —— 2) 券商预测明细（仅近3个月） ——
    const detail3 = (fc.detail||[]).filter(d => isRecent3m(d.date));
    h += '<div class="fc-block"><div class="fc-title">券商预测明细' +
      '<span class="muted" style="font-weight:400;font-size:12px;margin-left:6px">共 ' + (fc.detail||[]).length + ' 家，显示近3个月 ' + detail3.length + ' 家</span>' +
      '</div>';
    if(!detail3.length){
      h += '<div class="empty">近 3 个月无券商更新预测</div>';
    } else {
      h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
        '<th>券商</th><th>分析师</th><th>报告日期</th><th>评级</th>' +
        '<th class="num">年份</th><th class="num">EPS</th><th class="num">净利(亿)</th>' +
        '<th class="num">年份</th><th class="num">EPS</th><th class="num">净利(亿)</th>' +
        '<th class="num">年份</th><th class="num">EPS</th><th class="num">净利(亿)</th>' +
        '</tr></thead><tbody>';
      detail3.forEach(dt => {
        const p = dt.pred || [];
        const cells = [];
        for(let i=0;i<3;i++){
          const pr = p[i] || {};
          cells.push('<td class="num">' + esc(pr.year||'') + '</td><td class="num">' + n2(pr.eps) + '</td><td class="num">' + n2(pr.np) + '</td>');
        }
        h += '<tr><td><b>' + esc(dt.org||'') + '</b></td><td>' + esc(dt.researcher||'') + '</td>' +
          '<td>' + esc(dt.date||'') + '</td><td><span class="method-badge ' + (dt.rating==='买入'?'green':'gray') + '">' + esc(dt.rating||'') + '</span></td>' +
          cells.join('') + '</tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    // —— 3) 机构一致预期 EPS（仅近3个月） ——
    const eps3 = (fc.eps||[]).filter(e => isRecent3m(e.date));
    h += '<div class="fc-block"><div class="fc-title">机构一致预期 EPS' +
      '<span class="muted" style="font-weight:400;font-size:12px;margin-left:6px">共 ' + (fc.eps||[]).length + ' 条，显示近3个月 ' + eps3.length + ' 条</span>' +
      '</div>';
    if(!eps3.length){
      h += '<div class="empty">近 3 个月无机构一致预期更新</div>';
    } else {
      h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
        '<th>机构</th><th>报告日期</th>' +
        '<th class="num">年份</th><th class="num">EPS</th><th class="num">PE</th>' +
        '<th class="num">年份</th><th class="num">EPS</th><th class="num">PE</th>' +
        '<th class="num">年份</th><th class="num">EPS</th><th class="num">PE</th>' +
        '</tr></thead><tbody>';
      eps3.forEach(e => {
        const cells = [];
        for(let i=1;i<=3;i++){
          cells.push('<td class="num">' + esc(e['year'+i]||'') + '</td><td class="num">' + n2(e['eps'+i]) + '</td><td class="num">' + n2(e['pe'+i]) + '</td>');
        }
        h += '<tr><td><b>' + esc(e.org||'') + '</b></td><td>' + esc(e.date||'') + '</td>' + cells.join('') + '</tr>';
      });
      h += '</tbody></table></div>';
    }
    h += '</div>';
    return h + '</div>';
  }
  function n2(v){
    if(v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if(isNaN(n)) return esc(String(v));
    return Math.abs(n) < 100 ? n.toFixed(2) : n.toFixed(1);
  }

  function finKeys(){
    return METRICS.map(m => m.key);
  }
  // 把公司 financials 转成 CSV 文本（含 BOM，Excel 可直接打开中文）
  function financialsToCsv(c){
    const keys = finKeys();
    const extra = (customMetrics()||[]).map(m => m.key).filter(k => !keys.includes(k));
    const allKeys = keys.concat(extra);
    const escCsv = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    let csv = '\uFEFF# GoalTracker 财务数据\n';            // BOM 保证 Excel 识别 UTF-8
    csv += '公司,' + escCsv(c.name) + '\n';
    csv += '股票代码,' + escCsv(c.ticker) + '\n';
    csv += '季度,' + allKeys.join(',') + '\n';
    (c.financials||[]).slice().sort((a,b) => a.quarter.localeCompare(b.quarter)).forEach(f => {
      csv += escCsv(f.quarter);
      allKeys.forEach(k => { csv += ',' + escCsv(f[k]); });
      csv += '\n';
    });
    return csv;
  }
  // ================= 盈利预测 CSV =================
  function forecastToCsv(c){
    const ec = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    const fc = c.forecast || {};
    let csv = '\uFEFF# GoalTracker 盈利预测\n';
    csv += '公司,' + ec(c.name) + '\n';
    csv += '股票代码,' + ec(c.ticker) + '\n';
    // 券商预测明细
    (fc.detail||[]).forEach(d => {
      const p = d.pred || [];
      const row = ['ORG', d.org||'', d.researcher||'', d.date||'', d.rating||''];
      for(let i=0;i<3;i++){ const pr = p[i]||{}; row.push(pr.year||'', pr.eps==null?'':pr.eps, pr.np==null?'':pr.np); }
      csv += row.map(ec).join(',') + '\n';
    });
    // 一致预期
    (fc.consensus||[]).forEach(cn => {
      csv += ['CONS', cn.year||'', cn.mark||'', cn.eps==null?'':cn.eps, cn.pe==null?'':cn.pe, cn.roe==null?'':cn.roe,
        cn.revenue==null?'':cn.revenue, cn.np==null?'':cn.np, cn.revRatio==null?'':cn.revRatio, cn.npRatio==null?'':cn.npRatio]
        .map(ec).join(',') + '\n';
    });
    // 机构一致预期EPS
    (fc.eps||[]).forEach(e => {
      const row = ['EPSR', e.org||'', e.date||''];
      for(let i=1;i<=3;i++){ row.push(e['year'+i]||'', e['eps'+i]==null?'':e['eps'+i], e['pe'+i]==null?'':e['pe'+i]); }
      csv += row.map(ec).join(',') + '\n';
    });
    return csv;
  }
  function csvToForecast(csvLines){
    const fc = { updated: dateStr(), detail:[], consensus:[], eps:[] };
    for(const r of csvLines){
      if(!r || !r.length) continue;
      // tag 统一大写并去空白，兼容 org/Org、前导空格、注释行等变体
      const tag = String(r[0]).trim().toUpperCase().replace(/^[#\s]+/, '').split(/[：:、\s]/)[0];
      if(tag === '' || tag === '#') continue;
      if(tag === 'ORG'){
        const pred = [];
        for(let i=0;i<3;i++){
          const base = 5 + i*3;
          if(r.length <= base) continue;
          pred.push({ year: r[base], eps: r[base+1] !== '' ? Number(r[base+1]) : null, np: r[base+2] !== '' ? Number(r[base+2]) : null });
        }
        fc.detail.push({ org:r[1]||'', researcher:r[2]||'', date:r[3]||'', rating:r[4]||'', pred });
      } else if(tag === 'CONS'){
        fc.consensus.push({ year:r[1]||'', mark:r[2]||'', eps:num(r[3]), pe:num(r[4]), roe:num(r[5]),
          revenue:num(r[6]), np:num(r[7]), revRatio:num(r[8]), npRatio:num(r[9]) });
      } else if(tag === 'EPSR'){
        const e = { org:r[1]||'', date:r[2]||'' };
        for(let i=0;i<3;i++){
          const base = 3 + i*3;
          if(r.length <= base) continue;
          e['year'+(i+1)] = r[base]; e['eps'+(i+1)] = num(r[base+1]); e['pe'+(i+1)] = num(r[base+2]);
        }
        fc.eps.push(e);
      }
    }
    return fc;
  }
  function num(v){
    if(v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }
  // 触发导出 CSV 文件。
  // 优先使用 File System Access API：弹出系统「另存为」对话框，可自行选定保存文件夹；
  // 不支持该 API 的浏览器（Firefox/Safari）回退为直接下载到默认下载目录。
  // 返回 Promise<boolean>：是否成功完成（用户取消返回 false）。
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
          await writable.write(blob);
          await writable.close();
          return true;
        } catch(e){
          if(e && e.name === 'AbortError') return false;   // 用户取消，不报错不下载
          console.warn('另存为导出失败，改用下载方式:', e);
        }
      }
      // 回退：不支持 API 或保存失败，直接下载
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    };
    return trySave();
  }
  // 批量导出到选定文件夹（File System Access API 的 showDirectoryPicker）。
  // 一次选定文件夹后，把多份 CSV 全部写入该文件夹，避免逐份弹窗。
  // 不支持时回退为逐份 download（浏览器会询问允许多次下载）。
  function exportCsvToFolder(files){   // files: [{ filename, content }]
    if(!files || !files.length) return Promise.resolve(0);
    const doEach = async dir => {
      let n = 0;
      for(const f of files){
        try {
          const handle = await dir.getFileHandle(f.filename, { create:true });
          const w = await handle.createWritable();
          await w.write(new Blob([f.content], { type:'text/csv;charset=utf-8;' }));
          await w.close();
          n++;
        } catch(e){ console.warn('写入文件失败:', f.filename, e); }
      }
      return n;
    };
    if(window.showDirectoryPicker){
      return window.showDirectoryPicker({ mode:'readwrite' }).then(doEach).catch(e => {
        if(e && e.name === 'AbortError') return Promise.resolve(0);   // 用户取消
        // 不支持/失败回退逐份下载
        files.forEach(f => downloadCsv(f.filename, f.content));
        return Promise.resolve(files.length);
      });
    }
    files.forEach(f => downloadCsv(f.filename, f.content));
    return Promise.resolve(files.length);
  }
  // CSV 行解析（逐行 + 引号内逗号处理，跨行字段合并）
  function parseCsvSimple(text){
    const rawLines = text.replace(/\r\n/g,'\n').replace(/^\uFEFF/,'').split('\n');
    const lines = [];
    let pending = null;
    for(const ln of rawLines){
      if(pending != null){ pending += '\n' + ln; }
      else pending = ln;
      // 统计引号是否闭合
      let q=0; for(const ch of pending) if(ch==='"') q++;
      if(q % 2 === 0){ lines.push(pending); pending = null; }
    }
    if(pending != null) lines.push(pending);
    const out = [];
    for(const ln of lines){
      if(!ln.trim()) continue;
      const f = [];
      let field = '', inQ = false;
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
      f.push(field);
      out.push(f);
    }
    return out;
  }
  // 判断是否「股价 CSV」（# GoalTracker 股价数据 或 含 现价 列）
  function isPriceCsv(csvLines){
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const first = String(r[0]).trim();
      if(first.indexOf('# GoalTracker 股价数据') === 0) return true;
    }
    return false;
  }
  // 把「股价 CSV」解析为 [{ticker, name, price}]。格式：
  //   # GoalTracker 股价数据
  //   股票代码,公司,现价
  //   688256.SH,寒武纪,1050.49
  // 兼容列头顺序变动：按「列名」定位列索引（支持 股票代码/代码, 公司/名称, 现价/价格）
  function csvToPrices(csvLines){
    let idx = null;
    const out = [];
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const cells = r.map(x => String(x == null ? '' : x).trim());
      const first = cells[0];
      // 识别列头行：第一格是「股票代码」或「代码」
      if(idx === null && (first === '股票代码' || first === '代码')){
        const i = { code:-1, name:-1, price:-1 };
        cells.forEach((c, j) => {
          if(c === '股票代码' || c === '代码') i.code = j;
          else if(c === '公司' || c === '名称' || c === '股票名称') i.name = j;
          else if(c === '现价' || c === '价格' || c === '最新价') i.price = j;
        });
        if(i.price >= 0){ idx = i; }
        continue;
      }
      if(!idx) continue;                          // 尚未遇到列头
      const code = cells[idx.code >= 0 ? idx.code : 0] || '';
      if(!/^\d{6}(\.(SH|SZ|BJ))?$/.test(code)) continue;
      const price = parseFloat((cells[idx.price] || '').replace(/[,\s]/g,''));
      if(isNaN(price)) continue;
      out.push({ ticker: code.toUpperCase(), name: cells[idx.name >= 0 ? idx.name : 1] || '', price });
    }
    return out;
  }
  // 把解析出的 CSV 行转为财务数据数组（季度 + 指标值），跳过注释/表头
  function csvRowsToFinancials(csvLines){
    let headerIdx = -1, cols = null, ticker = null, cname = null;
    for(let i=0;i<csvLines.length;i++){
      const r = csvLines[i];
      if(!r || !r.length) continue;
      const first = String(r[0]).trim();
      if(first === '#') continue;
      if(first === '公司'){ cname = r[1] ? String(r[1]).trim() : ''; continue; }
      if(first === '股票代码'){ ticker = r[1] ? String(r[1]).trim() : ''; continue; }
      if(first === '季度'){
        headerIdx = i;
        cols = r.map(x => String(x).trim());
        break;
      }
    }
    if(headerIdx < 0 || !cols) return null;
    const fin = [];
    for(let i=headerIdx+1; i<csvLines.length; i++){
      const r = csvLines[i];
      if(!r || r.length < 2) continue;
      const q = String(r[0]).trim();
      if(!/^20\d{2}(Q[1-4]|-\d{2})$/.test(q)) continue;   // 合法季度格式
      // 生成条目时补上 id（避免导入新增的季度缺 id，导致删除/编辑异常）
      const obj = { id: uid(), quarter:q, note:'' };
      cols.forEach((col, ci) => {
        if(ci === 0 || !col) return;
        const raw = r[ci];
        if(raw === undefined || raw === null || String(raw).trim() === '') return;
        if(col === 'note'){ obj.note = String(raw); return; }
        const num = Number(String(raw).replace(/[,\s%]/g,''));
        if(!isNaN(num)) obj[col] = num;
      });
      fin.push(obj);
    }
    return { ticker, name: cname, financials: fin };
  }

  // 导入 CSV：支持单文件或多文件。targets 为要写入的目标公司列表（传单个公司 = 单公司导入）。
  // 若 CSV 头部标明了公司/代码，会自动匹配；否则写入手动选择的目标公司。
  function importCsvFiles(targets){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files||[]);
      if(!files.length) return;
      let matched = 0, skipped = 0, errors = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const csvLines = parseCsvSimple(reader.result);
            // 股价 CSV（# GoalTracker 股价数据 / 现价列）→ 批量更新 currentPrice
            if(isPriceCsv(csvLines)){
              const prices = csvToPrices(csvLines);
              if(!prices.length){ errors++; }
              else {
                let updated = 0;
                prices.forEach(p => {
                  const target = DB.valuation.companies.find(x =>
                    x.ticker === p.ticker || (p.name && x.name === p.name));
                  if(!target) return;
                  target.currentPrice = p.price;
                  target.updated = dateStr();
                  updated++;
                });
                if(updated){ matched++; } else { skipped++; }
              }
              if(matched + skipped + errors >= files.length){ save(); render(); alert('股价导入完成：更新 ' + matched + ' 家，跳过 ' + skipped + ' 家，失败 ' + errors + ' 个'); }
              return;
            }
            const parsed = csvRowsToFinancials(csvLines);
            if(!parsed || !parsed.financials.length){ errors++; return; }
            // 定位目标公司：优先按 CSV 内代码/名称匹配，其次用传进来的 targets
            let target = null;
            if(parsed.ticker) target = DB.valuation.companies.find(x => x.ticker === parsed.ticker);
            if(!target && parsed.name) target = DB.valuation.companies.find(x => x.name === parsed.name);
            if(!target && targets && targets.length === 1) target = targets[0];
            if(!target){ skipped++; return; }
            // 合并财务数据：按季度对齐，用 CSV 覆盖更新相同季度。
            // 覆盖原则：只覆盖 CSV 中「有值」的字段（非空/非 NaN），空字段保留原值，
            // 避免 CSV 里未填的列把已有数据清空。
            parsed.financials.forEach(pf => {
              const exist = target.financials.find(f => f.quarter === pf.quarter);
              if(exist){
                const keepId = exist.id;
                Object.keys(pf).forEach(k => {
                  const v = pf[k];
                  const hasVal = v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && isNaN(v));
                  if(hasVal) exist[k] = v;
                });
                exist.id = keepId || exist.id;
              } else {
                // CSV 里有的季度 target 缺失（可能被用户删除）→ 用带 id 的条目新增
                target.financials.push(pf);
              }
            });
            target.financials.sort((a,b) => a.quarter.localeCompare(b.quarter));
            target.updated = dateStr();
            matched++;
            // 处理完后统一保存渲染
            if(matched + skipped + errors >= files.length){ save(); render(); alert('导入完成：成功 ' + matched + ' 个，跳过 ' + skipped + ' 个，失败 ' + errors + ' 个'); }
          } catch(e){ errors++; if(matched+skipped+errors >= files.length){ save(); render(); alert('导入完成：成功 ' + matched + ' 个，跳过 ' + skipped + ' 个，失败 ' + errors + ' 个'); } }
        };
        reader.readAsText(file, 'utf-8');
      });
    };
    input.click();
  }

  // 专门导入「股价 CSV」（data/prices/当前股价.csv），批量更新各公司 currentPrice。
  function importPriceFiles(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files||[]);
      if(!files.length) return;
      let updated = 0, skipped = 0, bad = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const csvLines = parseCsvSimple(reader.result);
            const prices = csvToPrices(csvLines);
            if(!prices.length){ bad++; }
            else {
              prices.forEach(p => {
                const target = DB.valuation.companies.find(x =>
                  x.ticker === p.ticker || (p.name && x.name === p.name));
                if(!target){ skipped++; return; }
                target.currentPrice = p.price;
                target.updated = dateStr();
                updated++;
              });
            }
          } catch(e){ bad++; }
          if(updated + skipped + bad >= files.length){ save(); render(); alert('股价导入完成：更新 ' + updated + ' 家，跳过 ' + skipped + ' 家，失败 ' + bad + ' 个'); }
        };
        reader.readAsText(file, 'utf-8');
      });
    };
    input.click();
  }

  /* ----- 财务/投资/自定义指标 弹窗辅助 ----- */
  function valFinModalBody(cid, f){
    let h = '<input type="hidden" name="cid" value="' + cid + '">' +
      '<input type="hidden" name="fid" value="' + (f ? f.id : '') + '">' +
      '<div class="field"><label>季度 <span style="color:var(--red)">*</span></label><input type="text" name="quarter" required value="' + (f ? esc(f.quarter) : '') + '" placeholder="如：2024Q3"></div>' +
      '<div class="param-grid">';
    // 遍历 METRICS 里所有手动录入(input)指标生成表单，保证与数据表/注册表一致
    METRICS.forEach(m => {
      if(m.source !== 'input') return;
      const v = f ? f[m.key] : '';
      h += '<div class="field"><label>' + m.label + ' <span class="muted">(' + m.unit + ')</span></label>' +
        '<input type="number" step="0.0001" name="m_' + m.key + '" value="' + (v != null && v !== '' ? v : '') + '" placeholder="' + (m.desc ? esc(m.desc) : '') + '"></div>';
    });
    h += '</div>' + mdField('note', '备注', f ? f.note : '', 2);
    return h;
  }
  window.recalcFinModal = function(){ /* 6 个核心指标均为手动输入，无需实时计算 */ };
  function valInvModalBody(cid, inv){
    return '<input type="hidden" name="cid" value="' + cid + '">' +
      '<input type="hidden" name="iid" value="' + (inv ? inv.id : '') + '">' +
      '<div class="quick-row"><div class="field" style="flex:none;width:150px"><label>日期</label><input type="date" name="date" value="' + (inv ? inv.date : dateStr()) + '"></div>' +
      '<div class="field" style="flex:none;width:120px"><label>操作</label><select name="action"><option value="buy"' + (inv && inv.action === 'buy' ? ' selected' : '') + '>买入</option><option value="sell"' + (inv && inv.action === 'sell' ? ' selected' : '') + '>卖出</option></select></div></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>价格</label><input type="number" step="0.01" name="price" required value="' + (inv ? inv.price : '') + '"></div>' +
      '<div class="field" style="flex:1"><label>股数</label><input type="number" step="1" name="shares" required value="' + (inv ? inv.shares : '') + '"></div></div>' +
      mdField('note', '备注', inv ? inv.note : '', 2);
  }

  /* ----- 自定义指标管理 ----- */
  function customMetricsModalBody(editKey){
    const cms = customMetrics();
    const ed = editKey ? cms.find(m => m.key === editKey) : null;
    const chip = m => '<span class="metric-key-chip" onclick="insertMetricKey(\'' + m.key + '\')" title="点击插入 ${' + m.key + '}">' +
      '<code>' + m.key + '</code>' +
      '<span class="muted">' + esc(m.label) + (m.unit ? '(' + esc(m.unit) + ')' : '') + '</span></span>';
    const builtInHtml = METRICS.map(chip).join('');
    const otherCustoms = cms.filter(cm => !ed || cm.key !== ed.key).slice().sort((a,b) => a.key.localeCompare(b.key));
    const customHtml = otherCustoms.length ? otherCustoms.map(chip).join('') : '<span class="muted" style="font-size:12px">（暂无自定义指标）</span>';

    let h = '';
    if(ed){
      h += '<div class="metric-help"><b>编辑自定义指标</b> · 已有 ' + cms.length + ' 个自定义指标</div>';
    } else {
      h += '<div class="metric-help">自定义指标通过 <code>${key}</code> 引用同季度的其他指标（内置或自定义），结合 <code>+ - * / ( )</code> 计算出新指标。<br><b>点击下方指标 chip</b> 即可插入到公式输入框光标位置。</div>';
    }
    h += '<input type="hidden" name="origKey" value="' + (ed ? ed.key : '') + '">' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>指标 Key（英文，唯一） <span style="color:var(--red)">*</span></label><input type="text" name="key" required value="' + esc(ed ? ed.key : '') + '" placeholder="如：netMargin"></div>' +
      '<div class="field" style="flex:1"><label>显示名 <span style="color:var(--red)">*</span></label><input type="text" name="label" required value="' + esc(ed ? ed.label : '') + '" placeholder="如：销售净利率"></div>' +
      '<div class="field" style="flex:none;width:90px"><label>单位</label><input type="text" name="unit" value="' + esc(ed ? ed.unit : '') + '" placeholder="%"></div></div>' +
      '<div class="field"><label>公式 <span style="color:var(--red)">*</span></label><input type="text" name="formula" required value="' + esc(ed ? ed.formula : '') + '" placeholder="如：${netProfit}/${revenue}*100" oninput="recalcCustomMetricPreview()"></div>' +
      '<div class="metric-help" style="max-height:240px;overflow-y:auto;padding:12px">' +
        '<b style="display:block;margin-bottom:6px">📦 内置指标（点击插入）：</b>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px">' + builtInHtml + '</div>' +
        '<b style="display:block;margin:12px 0 6px">🧮 自定义指标（点击插入）：</b>' +
        '<div style="display:flex;flex-wrap:wrap;gap:4px">' + customHtml + '</div>' +
      '</div>' +
      '<div class="field"><label>预览（基于示例数据）</label><div id="customPreview" style="font-size:18px;font-weight:700;color:var(--indigo);padding:6px 0">—</div></div>';
    return h;
  }
  window.insertMetricKey = function(key){
    const form = document.querySelector('[data-form="val.saveCustomMetric"]');
    if(!form) return;
    const inp = form.querySelector('[name="formula"]');
    if(!inp) return;
    const insertText = '${' + key + '}';
    const start = (inp.selectionStart != null) ? inp.selectionStart : inp.value.length;
    const end = (inp.selectionEnd != null) ? inp.selectionEnd : inp.value.length;
    inp.value = inp.value.slice(0, start) + insertText + inp.value.slice(end);
    inp.focus();
    const newPos = start + insertText.length;
    inp.setSelectionRange(newPos, newPos);
    window.recalcCustomMetricPreview && window.recalcCustomMetricPreview();
  };
  window.recalcCustomMetricPreview = function(){
    const form = document.querySelector('[data-form="val.saveCustomMetric"]');
    if(!form) return;
    const formula = form.querySelector('[name="formula"]').value;
    const mock = { revenue:100, netProfit:20, eps:2.0, bvps:30, grossMargin:40, rdExpense:5, roe:14, ebitda:35,
      opCashFlow:25, capex:8, dAndA:10, assetLiabRatio:35, totalDebt:50, cashBalance:30, marketCap:500,
      dividend:5, dividendYield:2 };
    const v = evalFormula(formula, mock);
    const el = form.querySelector('#customPreview');
    if(el) el.textContent = v != null && !isNaN(v) ? v.toFixed(2) : '公式错误';
  };

  /* ----- 种子数据 ----- */
  function seed(){
    return {
      seedDataVersion: 4,  // v4: 补齐 seed financials 到完整 12 指标（旧版缺 totalAssets/equity/grossProfit/deductedNetProfit/netMargin/totalAssetTurnover），让 ensure() 可补齐用户缺失字段
      customMetrics: [],
      hiddenSeeds: [],
      companies: [
        { id:uid(), name:'寒武纪', ticker:'688256.SH', market:'A股', sector:'半导体AI芯片', currency:'CNY', currentPrice:1199.93,
          note:'国产AI芯片龙头。思元系列云端训练/推理芯片，受益大模型算力需求爆发。2025年首次全年盈利。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:61.04,equity:55.49,revenue:0.26,grossProfit:0.15,netProfit:-2.27,deductedNetProfit:-2.61,opCashFlow:-2.34,roe:-4.08,grossMargin:57.61,netMargin:-892.43,assetLiabRatio:9.09,totalAssetTurnover:0, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:61.41,equity:53.01,revenue:0.65,grossProfit:0.41,netProfit:-5.3,deductedNetProfit:-6.09,opCashFlow:-6.31,roe:-9.75,grossMargin:62.72,netMargin:-823.49,assetLiabRatio:13.67,totalAssetTurnover:0.01, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:60.95,equity:51.47,revenue:1.85,grossProfit:1.02,netProfit:-1.94,deductedNetProfit:-8.62,opCashFlow:-18.1,roe:-13.43,grossMargin:55.23,netMargin:-393.12,assetLiabRatio:15.56,totalAssetTurnover:0.03, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:67.18,equity:54.3,revenue:11.74,grossProfit:6.66,netProfit:2.72,deductedNetProfit:-8.65,opCashFlow:-16.18,roe:-8.17,grossMargin:56.71,netMargin:-38.91,assetLiabRatio:19.16,totalAssetTurnover:0.18, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:69.45,equity:58.36,revenue:11.11,grossProfit:6.22,netProfit:3.55,deductedNetProfit:2.76,opCashFlow:-13.99,roe:6.32,grossMargin:55.99,netMargin:31.96,assetLiabRatio:15.97,totalAssetTurnover:0.16, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:84.2,equity:67.63,revenue:28.81,grossProfit:16.11,netProfit:10.38,deductedNetProfit:9.13,opCashFlow:9.11,roe:17.05,grossMargin:55.93,netMargin:36.02,assetLiabRatio:19.68,totalAssetTurnover:0.38, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:125.92,equity:113.18,revenue:46.07,grossProfit:25.48,netProfit:16.05,deductedNetProfit:14.19,opCashFlow:-0.29,roe:19.18,grossMargin:55.29,netMargin:34.81,assetLiabRatio:10.12,totalAssetTurnover:0.48, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:134.38,equity:118.43,revenue:64.97,grossProfit:35.83,netProfit:20.59,deductedNetProfit:17.7,opCashFlow:-4.98,roe:23.86,grossMargin:55.15,netMargin:31.68,assetLiabRatio:11.87,totalAssetTurnover:0.64, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:154.01,equity:128.78,revenue:28.85,grossProfit:15.67,netProfit:10.13,deductedNetProfit:9.34,opCashFlow:8.34,roe:8.2,grossMargin:54.33,netMargin:35.12,assetLiabRatio:16.38,totalAssetTurnover:0.2, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中际旭创', ticker:'300308.SZ', market:'A股', sector:'光模块', currency:'CNY', currentPrice:1016.49,
          note:'全球光模块龙头。800G/1.6T高速光模块量产，受益AI算力网络建设。毛利率持续提升。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:223.4,equity:166.56,revenue:48.43,grossProfit:15.86,netProfit:10.09,deductedNetProfit:9.9,opCashFlow:6.5,roe:6.74,grossMargin:32.76,netMargin:21.22,assetLiabRatio:25.45,totalAssetTurnover:0.23, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:244.23,equity:171.4,revenue:107.99,grossProfit:35.78,netProfit:23.58,deductedNetProfit:23.33,opCashFlow:9.68,roe:15.49,grossMargin:33.13,netMargin:22.29,assetLiabRatio:29.82,totalAssetTurnover:0.49, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:271.24,equity:186.87,revenue:173.13,grossProfit:57.69,netProfit:13.94,deductedNetProfit:37.18,opCashFlow:13.16,roe:23.51,grossMargin:33.32,netMargin:22.36,assetLiabRatio:31.11,totalAssetTurnover:0.73, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:288.66,equity:202.93,revenue:238.62,grossProfit:80.67,netProfit:14.19,deductedNetProfit:50.68,opCashFlow:31.65,roe:30.97,grossMargin:33.8,netMargin:22.51,assetLiabRatio:29.7,totalAssetTurnover:0.98, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:315.83,equity:219.84,revenue:66.74,grossProfit:24.49,netProfit:15.83,deductedNetProfit:15.68,opCashFlow:21.64,roe:7.94,grossMargin:36.7,netMargin:25.33,assetLiabRatio:30.39,totalAssetTurnover:0.22, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:347.87,equity:242.44,revenue:147.89,grossProfit:58.16,netProfit:39.95,deductedNetProfit:39.75,opCashFlow:32.18,roe:19.05,grossMargin:39.33,netMargin:28.69,assetLiabRatio:30.31,totalAssetTurnover:0.46, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:397.26,equity:280.18,revenue:250.05,grossProfit:101.87,netProfit:71.32,deductedNetProfit:70.84,opCashFlow:54.55,roe:31.33,grossMargin:40.74,netMargin:30.27,assetLiabRatio:29.47,totalAssetTurnover:0.73, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:452.89,equity:316.21,revenue:382.4,grossProfit:160.74,netProfit:107.97,deductedNetProfit:107.1,opCashFlow:108.96,roe:44.16,grossMargin:42.04,netMargin:30.28,assetLiabRatio:30.18,totalAssetTurnover:1.03, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:565.81,equity:381.15,revenue:194.96,grossProfit:89.8,netProfit:57.34,deductedNetProfit:57.18,opCashFlow:33.68,roe:17.55,grossMargin:46.06,netMargin:32.4,assetLiabRatio:32.64,totalAssetTurnover:0.38, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'新易盛', ticker:'300502.SZ', market:'A股', sector:'光模块', currency:'CNY', currentPrice:447.99,
          note:'高速光模块第二梯队龙头。净利率行业领先，800G/1.6T产品放量。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:73.54,equity:57.97,revenue:11.13,grossProfit:4.67,netProfit:3.25,deductedNetProfit:3.25,opCashFlow:1.65,roe:5.76,grossMargin:42,netMargin:29.16,assetLiabRatio:21.17,totalAssetTurnover:0.16, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:83.03,equity:62.43,revenue:27.28,grossProfit:11.74,netProfit:8.65,deductedNetProfit:8.65,opCashFlow:-2.91,roe:14.78,grossMargin:43.04,netMargin:31.72,assetLiabRatio:24.81,totalAssetTurnover:0.37, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:98.22,equity:70.84,revenue:51.3,grossProfit:21.72,netProfit:7.81,deductedNetProfit:16.44,opCashFlow:2.85,roe:26.23,grossMargin:42.34,netMargin:32.08,assetLiabRatio:27.88,totalAssetTurnover:0.63, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:122.67,equity:83.28,revenue:86.47,grossProfit:38.67,netProfit:11.92,deductedNetProfit:28.3,opCashFlow:6.41,roe:41.15,grossMargin:44.72,netMargin:32.82,assetLiabRatio:32.11,totalAssetTurnover:0.92, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:148.5,equity:99.28,revenue:40.52,grossProfit:19.72,netProfit:15.73,deductedNetProfit:15.69,opCashFlow:1.99,roe:17.23,grossMargin:48.66,netMargin:38.81,assetLiabRatio:33.14,totalAssetTurnover:0.3, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:180.71,equity:120.94,revenue:104.37,grossProfit:49.5,netProfit:39.42,deductedNetProfit:39.34,opCashFlow:9.53,roe:38.61,grossMargin:47.43,netMargin:37.77,assetLiabRatio:33.08,totalAssetTurnover:0.69, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:213.56,equity:145.24,revenue:165.05,grossProfit:77.98,netProfit:63.27,deductedNetProfit:63.01,opCashFlow:46.37,roe:55.37,grossMargin:47.25,netMargin:38.33,assetLiabRatio:31.99,totalAssetTurnover:0.98, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:258.81,equity:180.64,revenue:248.42,grossProfit:118.76,netProfit:95.32,deductedNetProfit:95.07,opCashFlow:77.01,roe:72.62,grossMargin:47.81,netMargin:38.46,assetLiabRatio:30.2,totalAssetTurnover:1.3, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:297.36,equity:205.08,revenue:83.38,grossProfit:40.99,netProfit:27.8,deductedNetProfit:27.68,opCashFlow:6.84,roe:14.52,grossMargin:49.16,netMargin:33.27,assetLiabRatio:31.04,totalAssetTurnover:0.3, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'澜起科技', ticker:'688008.SH', market:'A股', sector:'内存接口芯片', currency:'CNY', currentPrice:202.87,
          note:'内存接口芯片全球龙头。DDR5渗透率提升+MRCD/MDB/PCIe Retimer新品放量，毛利率突破70%。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:107.08,equity:102.14,revenue:7.37,grossProfit:4.25,netProfit:2.23,deductedNetProfit:2.2,opCashFlow:3.55,roe:2.19,grossMargin:57.7,netMargin:30.3,assetLiabRatio:4.6,totalAssetTurnover:0.07, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:106.61,equity:101.7,revenue:16.65,grossProfit:9.62,netProfit:5.93,deductedNetProfit:5.44,opCashFlow:8.2,roe:5.83,grossMargin:57.78,netMargin:35.63,assetLiabRatio:4.6,totalAssetTurnover:0.16, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:111.82,equity:105.47,revenue:25.71,grossProfit:14.94,netProfit:3.85,deductedNetProfit:8.74,opCashFlow:12.61,roe:9.45,grossMargin:58.12,netMargin:37.98,assetLiabRatio:5.68,totalAssetTurnover:0.23, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:122.19,equity:113.97,revenue:36.39,grossProfit:21.15,netProfit:4.34,deductedNetProfit:12.48,opCashFlow:16.91,roe:13.08,grossMargin:58.13,netMargin:36.84,assetLiabRatio:6.73,totalAssetTurnover:0.32, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:126.66,equity:119.42,revenue:12.22,grossProfit:7.39,netProfit:5.25,deductedNetProfit:5.03,opCashFlow:1.88,roe:4.5,grossMargin:60.45,netMargin:41.21,assetLiabRatio:5.72,totalAssetTurnover:0.1, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:128.79,equity:120.6,revenue:26.33,grossProfit:15.92,netProfit:11.59,deductedNetProfit:10.91,opCashFlow:10.59,roe:9.86,grossMargin:60.44,netMargin:42.24,assetLiabRatio:6.36,totalAssetTurnover:0.21, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:137.52,equity:122.57,revenue:40.58,grossProfit:24.94,netProfit:16.32,deductedNetProfit:14.67,opCashFlow:16.01,roe:13.8,grossMargin:61.46,netMargin:38.85,assetLiabRatio:10.87,totalAssetTurnover:0.31, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:137.48,equity:128.71,revenue:54.56,grossProfit:33.95,netProfit:22.36,deductedNetProfit:20.22,opCashFlow:20.22,roe:18.38,grossMargin:62.23,netMargin:39.03,assetLiabRatio:6.38,totalAssetTurnover:0.42, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:216.81,equity:207.75,revenue:14.61,grossProfit:10.19,netProfit:8.47,deductedNetProfit:6.04,opCashFlow:6.27,roe:5.02,grossMargin:69.79,netMargin:56.8,assetLiabRatio:4.17,totalAssetTurnover:0.08, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'海光信息', ticker:'688041.SH', market:'A股', sector:'CPU/DCU', currency:'CNY', currentPrice:274.9,
          note:'国产CPU/DCU双龙头。x86架构CPU+AI加速芯片，受益国产替代。研发费用率近30%。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:233.26,equity:207.77,revenue:15.92,grossProfit:10.01,netProfit:2.89,deductedNetProfit:2.72,opCashFlow:-0.68,roe:1.53,grossMargin:62.87,netMargin:24.77,assetLiabRatio:10.93,totalAssetTurnover:0.07, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:243.33,equity:212.01,revenue:37.63,grossProfit:23.87,netProfit:8.53,deductedNetProfit:8.18,opCashFlow:-1.13,roe:4.5,grossMargin:63.43,netMargin:32.58,assetLiabRatio:12.87,totalAssetTurnover:0.16, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:270.61,equity:220.2,revenue:61.37,grossProfit:40.28,netProfit:15.26,deductedNetProfit:14.75,opCashFlow:3.99,roe:7.92,grossMargin:65.63,netMargin:34.33,assetLiabRatio:18.63,totalAssetTurnover:0.25, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:285.59,equity:226.52,revenue:91.62,grossProfit:58.38,netProfit:19.31,deductedNetProfit:18.16,opCashFlow:9.77,roe:9.91,grossMargin:63.72,netMargin:29.65,assetLiabRatio:20.68,totalAssetTurnover:0.36, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:310.06,equity:233.92,revenue:24,grossProfit:14.69,netProfit:5.06,deductedNetProfit:4.42,opCashFlow:25.22,roe:2.47,grossMargin:61.19,netMargin:29.74,assetLiabRatio:24.56,totalAssetTurnover:0.08, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:323.02,equity:239.52,revenue:54.64,grossProfit:32.87,netProfit:12.01,deductedNetProfit:10.9,opCashFlow:21.77,roe:5.81,grossMargin:60.15,netMargin:30.05,assetLiabRatio:25.85,totalAssetTurnover:0.18, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:331.82,equity:251.77,revenue:94.9,grossProfit:57.03,netProfit:19.61,deductedNetProfit:18.17,opCashFlow:22.55,roe:9.31,grossMargin:60.1,netMargin:29.93,assetLiabRatio:24.12,totalAssetTurnover:0.31, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:356.38,equity:259.68,revenue:143.77,grossProfit:83.14,netProfit:5.83,deductedNetProfit:23.05,opCashFlow:20.97,roe:11.91,grossMargin:57.83,netMargin:25.17,assetLiabRatio:27.13,totalAssetTurnover:0.45, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:351.85,equity:271.63,revenue:40.34,grossProfit:22.43,netProfit:6.87,deductedNetProfit:5.97,opCashFlow:0.68,roe:2.99,grossMargin:55.6,netMargin:21.75,assetLiabRatio:22.8,totalAssetTurnover:0.11, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中科曙光', ticker:'603019.SH', market:'A股', sector:'算力服务器', currency:'CNY', currentPrice:88.65,
          note:'国产算力服务器龙头。中科院系，海光信息大股东。布局智算中心+液冷。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:318.95,equity:196.17,revenue:24.79,grossProfit:6.66,netProfit:1.43,deductedNetProfit:0.57,opCashFlow:-4.94,roe:0.76,grossMargin:26.85,netMargin:5.3,assetLiabRatio:38.5,totalAssetTurnover:0.08, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:320.92,equity:198.19,revenue:57.12,grossProfit:14.99,netProfit:5.63,deductedNetProfit:3.66,opCashFlow:-9.34,roe:2.99,grossMargin:26.25,netMargin:9.93,assetLiabRatio:38.24,totalAssetTurnover:0.18, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:326.16,equity:200.3,revenue:80.41,grossProfit:21.56,netProfit:7.7,deductedNetProfit:4.45,opCashFlow:-12.77,roe:4.07,grossMargin:26.81,netMargin:10.01,assetLiabRatio:38.59,totalAssetTurnover:0.25, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:366.17,equity:213.27,revenue:131.48,grossProfit:38.34,netProfit:19.11,deductedNetProfit:13.72,opCashFlow:27.22,roe:9.79,grossMargin:29.16,netMargin:15.16,assetLiabRatio:41.76,totalAssetTurnover:0.39, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:359.3,equity:211.12,revenue:25.86,grossProfit:6.74,netProfit:1.86,deductedNetProfit:1.07,opCashFlow:-11.18,roe:0.92,grossMargin:26.07,netMargin:6.55,assetLiabRatio:41.24,totalAssetTurnover:0.07, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:366.24,equity:217.17,revenue:58.5,grossProfit:15.59,netProfit:7.29,deductedNetProfit:5.69,opCashFlow:-13.81,roe:3.54,grossMargin:26.65,netMargin:12,assetLiabRatio:40.7,totalAssetTurnover:0.16, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:369.9,equity:219.47,revenue:88.2,grossProfit:21.57,netProfit:9.66,deductedNetProfit:7.57,opCashFlow:-12.96,roe:4.66,grossMargin:24.45,netMargin:10.46,assetLiabRatio:40.67,totalAssetTurnover:0.24, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:409.54,equity:230.69,revenue:149.64,grossProfit:45.76,netProfit:12.1,deductedNetProfit:18.38,opCashFlow:13.13,roe:10.21,grossMargin:30.58,netMargin:14.42,assetLiabRatio:43.67,totalAssetTurnover:0.39, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:393.37,equity:231.56,revenue:31.99,grossProfit:8.5,netProfit:2.28,deductedNetProfit:1.64,opCashFlow:-13.91,roe:1.02,grossMargin:26.56,netMargin:6,assetLiabRatio:41.14,totalAssetTurnover:0.08, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中微公司', ticker:'688012.SH', market:'A股', sector:'半导体设备', currency:'CNY', currentPrice:317.86,
          note:'刻蚀设备龙头。CCP/ICP刻蚀+薄膜设备，受益晶圆厂扩产。研发投入大增。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:223.73,equity:179.25,revenue:16.05,grossProfit:7.21,netProfit:2.49,deductedNetProfit:2.63,opCashFlow:-5.86,roe:1.39,grossMargin:44.94,netMargin:15.5,assetLiabRatio:19.88,totalAssetTurnover:0.07, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:242.42,equity:181.71,revenue:34.48,grossProfit:14.25,netProfit:5.17,deductedNetProfit:4.83,opCashFlow:3.82,roe:2.87,grossMargin:41.32,netMargin:14.97,assetLiabRatio:25.04,totalAssetTurnover:0.15, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:252.71,equity:187.39,revenue:55.07,grossProfit:23.25,netProfit:9.13,deductedNetProfit:8.13,opCashFlow:2.68,roe:4.99,grossMargin:42.22,netMargin:16.56,assetLiabRatio:25.85,totalAssetTurnover:0.24, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:262.18,equity:197.36,revenue:90.65,grossProfit:37.22,netProfit:16.16,deductedNetProfit:13.88,opCashFlow:14.58,roe:8.6,grossMargin:41.06,netMargin:17.81,assetLiabRatio:24.72,totalAssetTurnover:0.38, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:271.19,equity:201.38,revenue:21.73,grossProfit:9.03,netProfit:3.13,deductedNetProfit:2.98,opCashFlow:3.77,roe:1.57,grossMargin:41.54,netMargin:14.18,assetLiabRatio:25.74,totalAssetTurnover:0.08, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:284.21,equity:208.49,revenue:49.61,grossProfit:19.77,netProfit:7.06,deductedNetProfit:5.39,opCashFlow:2.03,roe:3.48,grossMargin:39.86,netMargin:13.83,assetLiabRatio:26.64,totalAssetTurnover:0.18, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:297.87,equity:214.41,revenue:80.63,grossProfit:31.53,netProfit:12.11,deductedNetProfit:8.87,opCashFlow:12.98,roe:5.88,grossMargin:39.1,netMargin:14.64,assetLiabRatio:28.02,totalAssetTurnover:0.29, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:298.46,equity:227.29,revenue:123.85,grossProfit:48.51,netProfit:9,deductedNetProfit:15.5,opCashFlow:22.95,roe:9.95,grossMargin:39.17,netMargin:16.67,assetLiabRatio:23.85,totalAssetTurnover:0.44, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:312.7,equity:243.36,revenue:29.15,grossProfit:11.63,netProfit:9.3,deductedNetProfit:4.78,opCashFlow:-1.59,roe:3.96,grossMargin:39.89,netMargin:31.51,assetLiabRatio:22.18,totalAssetTurnover:0.1, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中芯国际', ticker:'688981.SH', market:'A股', sector:'晶圆代工', currency:'CNY', currentPrice:121.03,
          note:'大陆晶圆代工龙头。成熟制程为主，产能利用率93%+。A股按CAS人民币列报，港股按IFRS美元列报。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:3417.58,equity:2187.18,revenue:125.94,grossProfit:17.86,netProfit:5.09,deductedNetProfit:6.22,opCashFlow:35.67,roe:0.36,grossMargin:14.19,netMargin:3.57,assetLiabRatio:36,totalAssetTurnover:0.04, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:3374.67,equity:2207.15,revenue:262.69,grossProfit:36.53,netProfit:16.46,deductedNetProfit:12.88,opCashFlow:32.46,roe:1.15,grossMargin:13.91,netMargin:6.25,assetLiabRatio:34.6,totalAssetTurnover:0.08, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:3309.55,equity:2202.99,revenue:418.79,grossProfit:73.87,netProfit:27.06,deductedNetProfit:21.99,opCashFlow:122.64,roe:1.89,grossMargin:17.64,netMargin:7.72,assetLiabRatio:33.44,totalAssetTurnover:0.13, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:3534.15,equity:2291.08,revenue:577.96,grossProfit:107.44,netProfit:36.99,deductedNetProfit:26.45,opCashFlow:226.59,roe:2.54,grossMargin:18.59,netMargin:9.3,assetLiabRatio:35.17,totalAssetTurnover:0.17, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:3441.61,equity:2312.31,revenue:163.01,grossProfit:37.65,netProfit:13.56,deductedNetProfit:11.7,opCashFlow:-11.72,roe:0.91,grossMargin:23.1,netMargin:14.24,assetLiabRatio:32.81,totalAssetTurnover:0.05, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:3541.68,equity:2345.2,revenue:323.48,grossProfit:70.87,netProfit:23.01,deductedNetProfit:19.04,opCashFlow:58.98,roe:1.54,grossMargin:21.91,netMargin:10.41,assetLiabRatio:33.78,totalAssetTurnover:0.09, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:3513.68,equity:2351.37,revenue:495.1,grossProfit:114.62,netProfit:38.18,deductedNetProfit:31.77,opCashFlow:122.88,roe:2.55,grossMargin:23.15,netMargin:11.65,assetLiabRatio:33.08,totalAssetTurnover:0.14, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:3677.18,equity:2463.62,revenue:673.23,grossProfit:145.58,netProfit:12.23,deductedNetProfit:41.24,opCashFlow:200.81,roe:3.37,grossMargin:21.62,netMargin:10.71,assetLiabRatio:33,totalAssetTurnover:0.19, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:3805.46,equity:2477.57,revenue:176.17,grossProfit:37.83,netProfit:13.61,deductedNetProfit:12.32,opCashFlow:51.32,roe:0.91,grossMargin:21.48,netMargin:9.05,assetLiabRatio:34.89,totalAssetTurnover:0.05, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'北方华创', ticker:'002371.SZ', market:'A股', sector:'半导体设备', currency:'CNY', currentPrice:753.1,
          note:'国内半导体设备平台型龙头。刻蚀/PVD/CVD/氧化/退火全品类，受益国产替代+晶圆厂扩产。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:562.57,equity:260.39,revenue:58.59,grossProfit:25.43,netProfit:11.27,deductedNetProfit:10.72,opCashFlow:2.6,roe:4.51,grossMargin:43.4,netMargin:19.09,assetLiabRatio:53.71,totalAssetTurnover:0.11, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:600.21,equity:278.85,revenue:123.35,grossProfit:56.12,netProfit:16.54,deductedNetProfit:26.4,opCashFlow:-2.92,roe:10.82,grossMargin:45.5,netMargin:22.54,assetLiabRatio:53.54,totalAssetTurnover:0.22, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:634.3,equity:298.82,revenue:203.53,grossProfit:90,netProfit:44.63,deductedNetProfit:42.66,opCashFlow:4.55,roe:16.71,grossMargin:44.22,netMargin:21.91,assetLiabRatio:52.89,totalAssetTurnover:0.35, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:657.09,equity:322.25,revenue:298.38,grossProfit:127.87,netProfit:56.21,deductedNetProfit:55.7,opCashFlow:15.73,roe:20.28,grossMargin:42.85,netMargin:19.08,assetLiabRatio:50.96,totalAssetTurnover:0.5, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:682.42,equity:341.24,revenue:82.06,grossProfit:35.3,netProfit:15.81,deductedNetProfit:15.7,opCashFlow:-17.29,roe:4.96,grossMargin:43.02,netMargin:19.1,assetLiabRatio:50,totalAssetTurnover:0.12, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:843.45,equity:400.73,revenue:161.42,grossProfit:68.07,netProfit:32.08,deductedNetProfit:31.81,opCashFlow:-31.91,roe:9.89,grossMargin:42.17,netMargin:19.83,assetLiabRatio:52.49,totalAssetTurnover:0.22, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:858.94,equity:421.71,revenue:273.01,grossProfit:113.05,netProfit:51.3,deductedNetProfit:51.02,opCashFlow:-25.66,roe:15.29,grossMargin:41.41,netMargin:18.24,assetLiabRatio:50.9,totalAssetTurnover:0.36, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:898.01,equity:439.28,revenue:393.53,grossProfit:157.82,netProfit:55.22,deductedNetProfit:53.36,opCashFlow:21.33,roe:16.05,grossMargin:40.1,netMargin:13.74,assetLiabRatio:51.08,totalAssetTurnover:0.51, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:910.57,equity:455.2,revenue:103.23,grossProfit:42.09,netProfit:16.35,deductedNetProfit:16.27,opCashFlow:7.48,roe:4.25,grossMargin:40.77,netMargin:15.19,assetLiabRatio:50.01,totalAssetTurnover:0.11, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'兆易创新', ticker:'603986.SH', market:'A股', sector:'半导体存储+MCU', currency:'CNY', currentPrice:385.44,
          note:'国产存储+MCU双轮驱动。NOR Flash全球第三，DRAM自研突破。MCU切入车规、工业。',
          financials:[
            { id:uid(), quarter:'2024Q1', totalAssets:170.66,equity:153.38,revenue:16.27,grossProfit:6.21,netProfit:2.05,deductedNetProfit:1.84,opCashFlow:6.27,roe:1.34,grossMargin:38.16,netMargin:12.58,assetLiabRatio:10.13,totalAssetTurnover:0.1, note:'' },
            { id:uid(), quarter:'2024Q2', totalAssets:174.29,equity:156.35,revenue:36.09,grossProfit:13.77,netProfit:3.12,deductedNetProfit:4.73,opCashFlow:12.49,roe:3.35,grossMargin:38.16,netMargin:14.33,assetLiabRatio:10.3,totalAssetTurnover:0.21, note:'' },
            { id:uid(), quarter:'2024Q3', totalAssets:181.63,equity:159.97,revenue:56.5,grossProfit:22.29,netProfit:8.32,deductedNetProfit:7.77,opCashFlow:18.57,roe:5.34,grossMargin:39.46,netMargin:14.73,assetLiabRatio:11.93,totalAssetTurnover:0.33, note:'' },
            { id:uid(), quarter:'2024Q4', totalAssets:192.29,equity:166.79,revenue:73.56,grossProfit:27.95,netProfit:11.03,deductedNetProfit:10.3,opCashFlow:20.32,roe:6.96,grossMargin:38,netMargin:14.97,assetLiabRatio:13.26,totalAssetTurnover:0.41, note:'' },
            { id:uid(), quarter:'2025Q1', totalAssets:194.67,equity:169.83,revenue:19.09,grossProfit:7.15,netProfit:2.35,deductedNetProfit:2.24,opCashFlow:3.36,roe:1.41,grossMargin:37.44,netMargin:12.56,assetLiabRatio:12.76,totalAssetTurnover:0.1, note:'' },
            { id:uid(), quarter:'2025Q2', totalAssets:198,equity:174.35,revenue:41.5,grossProfit:15.44,netProfit:5.75,deductedNetProfit:5.44,opCashFlow:9.58,roe:3.41,grossMargin:37.21,netMargin:14.16,assetLiabRatio:11.94,totalAssetTurnover:0.21, note:'' },
            { id:uid(), quarter:'2025Q3', totalAssets:207.56,equity:184,revenue:68.32,grossProfit:26.36,netProfit:10.83,deductedNetProfit:10.42,opCashFlow:17.96,roe:6.24,grossMargin:38.59,netMargin:16.17,assetLiabRatio:11.35,totalAssetTurnover:0.34, note:'' },
            { id:uid(), quarter:'2025Q4', totalAssets:213.97,equity:192.23,revenue:92.03,grossProfit:37.01,netProfit:16.48,deductedNetProfit:14.69,opCashFlow:21.29,roe:9.28,grossMargin:40.22,netMargin:18.23,assetLiabRatio:10.16,totalAssetTurnover:0.45, note:'' },
            { id:uid(), quarter:'2026Q1', totalAssets:277.74,equity:255.15,revenue:41.88,grossProfit:23.9,netProfit:14.61,deductedNetProfit:14.1,opCashFlow:17.83,roe:6.6,grossMargin:57.08,netMargin:35.16,assetLiabRatio:8.13,totalAssetTurnover:0.17, note:'' }
          ],
          valuations:[],
          investments:[] }
      ]
    };
  }
  function ensure(db, seedVal){
    const v = db.valuation;
    v.companies = v.companies || [];
    v.customMetrics = v.customMetrics || [];
    // 迁移：删除与内置指标 key 重名的自定义指标（如旧版把"净利率"做成了自定义 netMargin，
    // 现内置后会导致重复列/冲突，一并移除，保留内置版本）
    const builtKeys = new Set(METRICS.map(m => m.key));
    v.customMetrics = v.customMetrics.filter(cm => !builtKeys.has(cm.key));
    v.hiddenSeeds = v.hiddenSeeds || [];
    v.seedDataVersion = v.seedDataVersion || 0;
    // 迁移：旧数据没有 board 字段（undefined）或为空字符串时，对 A 股公司按 ticker 启发式回填。
    // 仅当推断出非空值时才写入，避免覆盖用户已选的有效板块。
    v.companies.forEach(c => {
      if(c.market === 'A股' && (c.board === undefined || c.board === null || c.board === '')){
        const inferred = inferBoard(c.ticker);
        if(inferred) c.board = inferred;
      }
      // 旧数据无 industry 字段：按 ticker 从映射表回填申万一级行业
      if(!c.industry && c.ticker && COMPANY_INDUSTRY[c.ticker]) c.industry = COMPANY_INDUSTRY[c.ticker];
      // 旧数据无 companyType 字段：按 ticker 从映射表回填林奇公司类型
      if(!c.companyType && c.ticker && COMPANY_LYNCH_TYPE[c.ticker]) c.companyType = COMPANY_LYNCH_TYPE[c.ticker];
      // 旧数据无 research 字段，初始化为空串（避免显示 undefined）
      if(c.research === undefined || c.research === null) c.research = '';
      // 旧数据无 totalShares 字段，初始化为 0（用户可手动填入真实总股本）
      if(c.totalShares === undefined || c.totalShares === null) c.totalShares = 0;
    });
    // 迁移：把种子里的新示例公司合并进已有数据（按 ticker 去重，不覆盖用户已有内容，不重复加回用户已删除的）
    if(seedVal && seedVal.companies){
      const seedVer = seedVal.seedDataVersion || 0;
      const needUpdate = v.seedDataVersion < seedVer;
      seedVal.companies.forEach(seedCo => {
        const ticker = seedCo.ticker;
        if(!ticker) return;
        if(v.hiddenSeeds.includes(ticker)) return;
        const existing = v.companies.find(c => c.ticker === ticker);
        if(existing){
          existing.seed = true;
          // 字段级合并：永远只补缺失字段，不覆盖用户已有的（即使值是 null/空）。这样
          // 既能修复"被旧 seed 覆盖而缺失字段"的历史问题，也能安全地从 seed 升级字段。
          if(seedCo.note) existing.note = existing.note || seedCo.note;
          if(seedCo.currentPrice) existing.currentPrice = existing.currentPrice || seedCo.currentPrice;
          Object.keys(seedCo).forEach(k => {
            if(!['financials','note','currentPrice','id','seed'].includes(k)
                && (existing[k] === undefined || existing[k] === null || existing[k] === '')){
              existing[k] = seedCo[k];
            }
          });
          if(seedCo.financials){
            // 按 quarter 对齐，逐字段补齐用户缺失的指标，绝不覆盖用户已有数据。
            // 注意：不新增 seed 里有但用户没有的季度——用户删除季度是明确意图，不应被 seed 恢复。
            // 只对用户已存在的季度做字段级补齐。
            const byQ = Object.fromEntries(existing.financials.map(f => [f.quarter, f]));
            seedCo.financials.forEach(seedFin => {
              const userFin = byQ[seedFin.quarter];
              if(!userFin) return;   // 用户已删除该季度 → 不补回
              Object.keys(seedFin).forEach(k => {
                if(!['id','quarter','note'].includes(k) && userFin[k] === undefined){
                  userFin[k] = seedFin[k];
                }
              });
            });
            existing.financials.sort((a,b) => (a.quarter||'').localeCompare(b.quarter||''));
          }
        } else {
          v.companies.push({...seedCo, seed: true});
        }
      });
      if(needUpdate) v.seedDataVersion = seedVer;
    }
    if(seedVal && seedVal.customMetrics){
      seedVal.customMetrics.forEach(seedCm => {
        if(!v.customMetrics.some(cm => cm.key === seedCm.key)){
          v.customMetrics.push(seedCm);
        }
      });
    }
  }

  /* ================= 模块注册 ================= */
  Register.module({
    view: 'valuation',
    nav: { ico:'📈', label:'公司估值', group:'投资追踪' },
    seed: seed,
    ensure: ensure,
    render: renderValuation,
    actions: {
      'val.fBoard': el => { state.valBoard = el.dataset.v; render(); },
      'val.fIndustry': el => { state.valIndustry = el.dataset.v; render(); },
      'val.fLynch': el => { state.valLynchType = el.dataset.v; render(); },
      'val.back': () => { state.valCompanyId = null; render(); },
      'val.openCompany': el => { state.valCompanyId = el.dataset.id; render(); window.scrollTo(0,0); },
      'val.addCompany': () => openModal('添加关注公司',
        '<div class="quick-row"><div class="field" style="flex:1"><label>公司名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required placeholder="如：寒武纪"></div>' +
        '<div class="field" style="flex:none;width:160px"><label>代码</label><input type="text" name="ticker" placeholder="如：00700.HK"></div></div>' +
        '<div class="quick-row"><div class="field" style="flex:1"><label>市场</label><select name="market" data-board-toggle>' + VAL_MARKETS.map(m => '<option>' + m + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1;min-width:140px" data-board-field><label>A 股板块</label><select name="board">' + VAL_BOARDS.map(b => '<option value="' + esc(b.key) + '">' + esc(b.label) + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1"><label>行业分类</label><select name="industry"><option value="">（未指定）</option>' + VAL_INDUSTRIES.map(i => '<option>' + i + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1"><label>林奇公司类型</label><select name="companyType"><option value="">（未指定）</option>' + VAL_LYNCH_TYPES.map(t => '<option value="' + esc(t.key) + '" title="' + esc(t.desc) + '">' + t.key + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1"><label>行业 / 细分</label><input type="text" name="sector" placeholder="如：光模块"></div>' +
        '<div class="field" style="flex:none;width:120px"><label>货币</label><input type="text" name="currency" placeholder="HKD" value="CNY"></div></div>' +
        '<div class="quick-row"><div class="field" style="flex:1"><label>当前股价</label><input type="number" step="0.01" name="currentPrice" placeholder="0.00"></div>' +
        '<div class="field" style="flex:1"><label>总股本（亿股）</label><input type="number" step="0.0001" name="totalShares" placeholder="如：4.21"></div></div>' +
        mdField('note', '公司备注（业务概况、关注逻辑等，支持 Markdown）', '', 4) +
        '<input type="hidden" name="id" value="">', 'val.saveCompany',
        () => setupBoardToggle()),
      'val.editCompany': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        openModal('编辑公司 · ' + c.name,
          '<div class="quick-row"><div class="field" style="flex:1"><label>公司名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required value="' + esc(c.name) + '"></div>' +
          '<div class="field" style="flex:none;width:160px"><label>代码</label><input type="text" name="ticker" value="' + esc(c.ticker||'') + '"></div></div>' +
          '<div class="quick-row"><div class="field" style="flex:1"><label>市场</label><select name="market" data-board-toggle>' + VAL_MARKETS.map(m => '<option' + (c.market === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' +
          '<div class="field" style="flex:1;min-width:140px" data-board-field><label>A 股板块</label><select name="board">' + VAL_BOARDS.map(b => '<option value="' + esc(b.key) + '"' + (c.board === b.key ? ' selected' : '') + '>' + esc(b.label) + '</option>').join('') + '</select></div>' +
          '<div class="field" style="flex:1"><label>行业分类</label><select name="industry"><option value="">（未指定）</option>' + VAL_INDUSTRIES.map(i => '<option' + (c.industry === i ? ' selected' : '') + '>' + i + '</option>').join('') + '</select></div>' +
          '<div class="field" style="flex:1"><label>林奇公司类型</label><select name="companyType"><option value="">（未指定）</option>' + VAL_LYNCH_TYPES.map(t => '<option value="' + esc(t.key) + '"' + (c.companyType === t.key ? ' selected' : '') + ' title="' + esc(t.desc) + '">' + t.key + '</option>').join('') + '</select></div>' +
          '<div class="field" style="flex:1"><label>行业 / 细分</label><input type="text" name="sector" value="' + esc(c.sector||'') + '"></div>' +
          '<div class="field" style="flex:none;width:120px"><label>货币</label><input type="text" name="currency" value="' + esc(c.currency||'CNY') + '"></div></div>' +
          '<div class="quick-row"><div class="field" style="flex:1"><label>当前股价</label><input type="number" step="0.01" name="currentPrice" value="' + (c.currentPrice||'') + '"></div>' +
          '<div class="field" style="flex:1"><label>总股本（亿股）</label><input type="number" step="0.0001" name="totalShares" value="' + (c.totalShares || '') + '" placeholder="如：4.21"></div></div>' +
          mdField('note', '公司备注', c.note, 4) +
          '<input type="hidden" name="id" value="' + c.id + '">', 'val.saveCompany',
          () => setupBoardToggle());
      },
      'val.delCompany': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        if(confirm('确认删除「' + c.name + '」及其所有财务数据、估值记录和投资记录？')){
          DB.valuation.companies = DB.valuation.companies.filter(x => x.id !== c.id);
          if(c.seed && c.ticker){
            DB.valuation.hiddenSeeds = DB.valuation.hiddenSeeds || [];
            if(!DB.valuation.hiddenSeeds.includes(c.ticker)) DB.valuation.hiddenSeeds.push(c.ticker);
          }
          if(state.valCompanyId === c.id) state.valCompanyId = null;
          save(); render();
        }
      },
      'val.toggleFinSort': el => { state.valFinSort = el.dataset.v; render(); },
      'val.addFin': el => { openModal('添加季度财务数据', valFinModalBody(el.dataset.id, null), 'val.saveFin'); setTimeout(()=>window.recalcFinModal&&recalcFinModal(), 30); },
      'val.exportCsv': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const content = financialsToCsv(c);
        const fname = (c.ticker||'company') + '_' + (c.name||'财务数据') + '.csv';
        downloadCsv(fname, content).then(done => {
          if(done) alert('已导出 ' + (c.financials||[]).length + ' 条财务数据，请选择保存位置');
        });
      },
      'val.importCsv': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        importCsvFiles([c]);
      },
      'val.exportForecast': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        if(!hasForecast(c)){ alert('该公司还没有盈利预测数据'); return; }
        const content = forecastToCsv(c);
        const fname = (c.ticker||'company') + '_' + (c.name||'盈利预测') + '.csv';
        downloadCsv(fname, content).then(done => {
          if(done) alert('已导出盈利预测数据');
        });
      },
      'val.importForecast': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
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
              const fc = csvToForecast(lines);
              if(!(fc.detail.length || fc.consensus.length || fc.eps.length)){
                // 识别不到：给出诊断信息，便于判断是否选错文件/格式
                const total = lines.length;
                const kinds = {};
                lines.forEach(r => { if(r && r[0]){ const t = String(r[0]).trim().toUpperCase(); kinds[t] = (kinds[t]||0)+1; } });
                const sample = Object.keys(kinds).slice(0,6).map(k => k + '×' + kinds[k]).join(', ');
                alert('CSV 中没有识别到盈利预测数据（共 ' + total + ' 行）。\n\n' +
                  '检测到的行类型：' + (sample || '无') + '\n\n' +
                  '请确认导入的是「盈利预测」CSV（数据行以 ORG/CONS/EPSR 开头），而非「财务数据」CSV。');
                return;
              }
              c.forecast = fc;
              save(); render();
              alert('导入成功：券商明细 ' + fc.detail.length + ' 家、一致预期 ' + fc.consensus.length + ' 年、机构EPS ' + fc.eps.length + ' 条');
            } catch(e){ alert('导入失败：' + e.message); }
          };
          reader.readAsText(file, 'utf-8');
        };
        input.click();
      },
      'val.exportAllCsv': () => {
        const cs = DB.valuation.companies;
        if(!cs.length){ alert('还没有公司数据'); return; }
        // 一次选定文件夹，把有数据的公司全部写入该文件夹；不支持则逐份下载
        const files = cs.filter(c => (c.financials||[]).length).map(c => ({
          filename: (c.ticker||'company') + '_' + (c.name||'财务数据') + '.csv',
          content: financialsToCsv(c),
        }));
        if(!files.length){ alert('所有公司都还没有财务数据'); return; }
        exportCsvToFolder(files).then(n => {
          if(n) alert('已导出 ' + n + ' 家公司的 CSV 到所选文件夹');
        });
      },
      'val.importAllCsv': () => {
        importCsvFiles(DB.valuation.companies);
      },
      'val.importPrices': () => {
        importPriceFiles();
      },
      'val.editFin': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const f = findById(c.financials, el.dataset.fid); if(!f) return;
        openModal('编辑财务数据 · ' + f.quarter, valFinModalBody(c.id, f), 'val.saveFin');
        setTimeout(()=>window.recalcFinModal&&recalcFinModal(), 30);
      },
      'val.delFin': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        if(!confirm('删除这条财务数据？')) return;
        // 优先按 id 删除；若无 id（历史/异常数据），按季度兜底删除
        if(el.dataset.fid){
          c.financials = c.financials.filter(x => x.id !== el.dataset.fid);
        } else if(el.dataset.fquarter){
          c.financials = c.financials.filter(x => x.quarter !== el.dataset.fquarter);
        }
        save(); render();
      },
      'val.addVal': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        openModal('添加估值记录 · ' + c.name, valModalBody(c, null), 'val.saveVal');
        setTimeout(recalcValuation, 50);
      },
      'val.editVal': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const v = findById(c.valuations, el.dataset.vid); if(!v) return;
        openModal('编辑估值记录', valModalBody(c, v), 'val.saveVal');
        setTimeout(() => { recalcValuation(); updateMoSDisplay(); }, 50);
      },
      'val.delVal': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        if(confirm('删除这条估值记录？')){ c.valuations = c.valuations.filter(x => x.id !== el.dataset.vid); save(); render(); }
      },
      'val.addInv': el => openModal('添加投资记录',
        valInvModalBody(el.dataset.id, null), 'val.saveInv'),
      'val.delInv': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        if(confirm('删除这条投资记录？')){ c.investments = c.investments.filter(x => x.id !== el.dataset.iid); save(); render(); }
      },
      'val.metricsConfig': () => {
        const cms = customMetrics();
        let body = '<div class="metric-help">自定义指标基于 <code>${key}</code> 引用公式自动计算，会出现在财务表中"自定义"类别。<br>' +
          '当前已有 ' + cms.length + ' 个自定义指标。</div>';
        if(cms.length){
          body += '<div style="margin-bottom:12px">' + cms.map(m =>
            '<div class="custom-chip"><b>' + esc(m.label) + '</b>' + (m.unit ? ' <span class="muted">(' + esc(m.unit) + ')</span>' : '') +
            ' <span class="cm-formula">' + esc(m.formula) + '</span>' +
            '<span class="cm-actions"><button data-action="val.editCustomMetric" data-key="' + esc(m.key) + '" title="编辑">✎</button><button data-action="val.delCustomMetric" data-key="' + esc(m.key) + '" title="删除">✕</button></span></div>'
          ).join('') + '</div>';
        } else {
          body += '<div class="empty">还没有自定义指标</div>';
        }
        body += '<button class="btn primary" style="background:var(--indigo)" data-action="val.addCustomMetric">＋ 添加自定义指标</button>';
        openModal('⚙ 自定义指标管理', body, null);
      },
      'val.addCustomMetric': () => {
        openModal('添加自定义指标', customMetricsModalBody(null), 'val.saveCustomMetric');
        setTimeout(()=>window.recalcCustomMetricPreview&&recalcCustomMetricPreview(), 30);
      },
      'val.editCustomMetric': el => {
        openModal('编辑自定义指标', customMetricsModalBody(el.dataset.key), 'val.saveCustomMetric');
        setTimeout(()=>window.recalcCustomMetricPreview&&recalcCustomMetricPreview(), 30);
      },
      'val.delCustomMetric': el => {
        const k = el.dataset.key;
        if(confirm('删除自定义指标「' + k + '」？')){
          DB.valuation.customMetrics = (DB.valuation.customMetrics || []).filter(m => m.key !== k);
          save(); closeModal(); render();
        }
      },
      'val.editResearch': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        openModal('公司研究 · ' + c.name,
          '<div class="metric-help">这里记录你对该公司业务的判断、关注重点、关键影响因素等。支持 Markdown 语法（标题、列表、引用、代码块等），可点击「预览」实时查看效果。</div>' +
          mdField('research', '研究内容', c.research || '', 16) +
          '<input type="hidden" name="cid" value="' + c.id + '">', 'val.saveResearch');
      },
    },
    changes: {
      'val.price': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        c.currentPrice = parseFloat(el.value) || 0; save();
      },
      'val.totalShares': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        c.totalShares = parseFloat(el.value) || 0;
        save(); render(); // 总市值是计算值，需要重渲染才能看到变化
      },
      'val.updateVal': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const v = findById(c.valuations, el.dataset.vid); if(!v) return;
        const field = el.dataset.field;
        const val = parseFloat(el.value);
        if(field === 'actualPrice'){
          v.actualPrice = isNaN(val) ? null : val;
        } else if(field === 'estimatedValue'){
          v.estimatedValue = isNaN(val) ? 0 : val;
        }
        save(); render(); // 重渲染以更新安全边际与趋势图
      },
    },
    inputs: {
      // 行内编辑估值方法参数（input 事件实时触发，局部更新 DOM 不重渲染，
      // 这样步进按钮 ▲▼ 可以连续点击不会丢失焦点/按钮）。
      'val.updateParam': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const v = findById(c.valuations, el.dataset.vid); if(!v) return;
        v.params = v.params || {};
        const key = el.dataset.key;
        const raw = el.value;
        v.params[key] = (raw === '' || raw == null) ? 0 : parseFloat(raw);
        if(isNaN(v.params[key])) v.params[key] = 0;
        // DCF 行内只编辑外推参数：编辑 baseFcf/growthRate 时清空手动 fcf，避免历史残留值优先覆盖外推
        if(v.method === 'DCF' && (key === 'baseFcf' || key === 'growthRate')){
          ['fcf1','fcf2','fcf3','fcf4','fcf5'].forEach(k => { v.params[k] = 0; });
        }
        v.estimatedValue = calcValuation(v.method, v.params);
        save(); // 持久化（不 render，避免重渲染造成按钮/焦点丢失）
        // 局部更新：本行的「估算价值」和「安全边际」单元格
        const row = el.closest('tr[data-val-row]');
        if(row){
          const estCell = row.querySelector('[data-est-cell]');
          if(estCell) estCell.textContent = (v.estimatedValue || 0).toFixed(2);
          const mosCell = row.querySelector('[data-mos-cell]');
          if(mosCell){
            const mos = calcMoS(v.estimatedValue, v.actualPrice);
            mosCell.className = 'num ' + (mos == null ? '' : (mos >= 0 ? 'mos-pos' : 'mos-neg'));
            mosCell.textContent = mos == null ? '—' : fmtPct(mos);
          }
        }
      },
    },
    forms: {
      'val.saveCompany': fd => {
        const id = fd.get('id');
        const market = fd.get('market') || 'A股';
        // 板块只对 A 股有意义：港/美/其他 一律置空
        const board = market === 'A股' ? (fd.get('board') || '') : '';
        const data = { name:fd.get('name'), ticker:fd.get('ticker')||'', market, board,
          industry:fd.get('industry')||'', companyType:fd.get('companyType')||'', sector:fd.get('sector')||'', currency:fd.get('currency')||'CNY', currentPrice:parseFloat(fd.get('currentPrice'))||0, totalShares:parseFloat(fd.get('totalShares'))||0, note:fd.get('note')||'' };
        if(id){ Object.assign(findById(DB.valuation.companies, id), data); }
        else DB.valuation.companies.push(Object.assign({ id:uid(), financials:[], valuations:[], investments:[], research:'' }, data));
        save(); closeModal(); render();
      },
      'val.saveResearch': fd => {
        const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
        c.research = fd.get('research') || '';
        save(); closeModal(); render();
      },
      'val.saveFin': fd => {
        const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
        const fid = fd.get('fid');
        const data = { quarter:fd.get('quarter'), note:fd.get('note')||'' };
        METRICS.forEach(m => {
          if(m.source === 'input'){
            const raw = fd.get('m_' + m.key);
            data[m.key] = (raw === '' || raw == null) ? null : parseFloat(raw);
          }
        });
        if(fid){ Object.assign(findById(c.financials, fid), data); }
        else c.financials.push(Object.assign({ id:uid() }, data));
        save(); closeModal(); render();
      },
      'val.saveVal': fd => {
        const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
        const vid = fd.get('id');
        const method = fd.get('method');
        const params = {};
        valMethodInfo(method).fields.forEach(f => { params[f.key] = parseFloat(fd.get('param_' + f.key)) || 0; });
        const estimatedValue = calcValuation(method, params);
        const actualPrice = parseFloat(fd.get('actualPrice')) || 0;
        const data = { date:fd.get('date')||dateStr(), method, params, estimatedValue, actualPrice, note:fd.get('note')||'' };
        if(vid){ Object.assign(findById(c.valuations, vid), data); }
        else c.valuations.push(Object.assign({ id:uid() }, data));
        save(); closeModal(); render();
      },
      'val.saveInv': fd => {
        const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
        const iid = fd.get('iid');
        const data = { date:fd.get('date')||dateStr(), action:fd.get('action'), price:parseFloat(fd.get('price'))||0,
          shares:parseFloat(fd.get('shares'))||0, note:fd.get('note')||'' };
        if(iid){ Object.assign(findById(c.investments, iid), data); }
        else c.investments.push(Object.assign({ id:uid() }, data));
        save(); closeModal(); render();
      },
      'val.saveCustomMetric': fd => {
        const origKey = fd.get('origKey');
        const data = { key:fd.get('key'), label:fd.get('label'), unit:fd.get('unit')||'', formula:fd.get('formula') };
        if(!data.key || !data.label || !data.formula){ alert('请填写完整'); return; }
        const cms = DB.valuation.customMetrics = DB.valuation.customMetrics || [];
        const exist = cms.findIndex(m => m.key === data.key);
        if(exist >= 0 && (!origKey || origKey !== data.key)){ alert('指标 Key 已存在，请换一个'); return; }
        if(origKey){
          const idx = cms.findIndex(m => m.key === origKey);
          if(idx >= 0) cms[idx] = data;
        } else {
          cms.push(data);
        }
        save(); closeModal(); render();
      },
    },
  });

  // 暴露给其他模块复用的估值工具（例如 dashboard 汇总需要用到）
  window.ValHelpers = { calcPosition, fmtMoney, fmtPct, calcMoS, calcValuation, valMethodInfo, metricInfo, fmtMetric, evalFormula, customMetrics };
})();
