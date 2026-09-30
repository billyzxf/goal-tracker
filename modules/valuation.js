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
  // 业绩三情景（《估值五步法》Step2）：给估值记录标注情景后，矩阵与触发线自动汇总。
  // 配色沿用中国惯例：保守=绿（对应下行）、乐观=红（对应上行）、中性=靛蓝。
  const VAL_SCENARIOS = ['保守', '中性', '乐观'];
  const SCENARIO_CLS = { '保守':'green', '中性':'indigo', '乐观':'red' };
  /* 三级归档（决策分档）——与「公司组」正交：组=主题/行业归属，档=是否参与及参与方式。
   * 对齐"咖啡罐"理论：想清楚后封存不动，只在买点以下且失效条件未触发时才动手。 */
  const VAL_TIERS = [
    { key:'咖啡罐', cls:'green',  desc:'想清楚就封存：买点以下且失效条件未触发时，不看不动' },
    { key:'观察池', cls:'indigo', desc:'逻辑成立但价格未到 / 信息不足，持续跟踪等买点' },
    { key:'回避',   cls:'gray',   desc:'逻辑已破坏或估值透支，明确不参与（留档避免重复研究）' },
  ];
  const TIER_CLS  = VAL_TIERS.reduce((m, t) => (m[t.key] = t.cls,  m), {});
  const TIER_DESC = VAL_TIERS.reduce((m, t) => (m[t.key] = t.desc, m), {});
  const TIER_NONE = '__none__';   // 筛选哨兵值：未归档
  // 估值时效：最新估值记录距今超过该天数 → 标记「待重估」
  const VAL_STALE_DAYS = 90;
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
        {key:'profitYi',label:'预期净利润(亿)·选填',shortLabel:'净利亿',
          help:'填入后自动计算 EPS = 净利润 ÷ 总股本（需已在公司信息里填总股本），「预期EPS」会被自动覆盖'},
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
        {key:'revenueYi',label:'预期营收(亿)·选填',shortLabel:'营收亿',
          help:'填入后自动计算 每股营收 = 营收 ÷ 总股本（需已在公司信息里填总股本），「每股营收」会被自动覆盖'},
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
    /* SOTP 分部估值：控股型 / 多元化公司的加总法（藏格矿业-巨龙铜业、中科曙光-海光敞口等）。
     * 最多 4 个分部（净利 × PE），再加回「持有上市股权市值 + 净现金 − 净债务」，最后除以总股本。
     * 参数分组标签由 field.group 驱动（changed 即插入一行小标题），故此处按分部逐组命名。 */
    { key:'SOTP', label:'SOTP分部估值', cls:'m-sotp',
      desc:'估算价值 =（Σ 分部净利 × 分部PE + 持有上市股权市值 + 净现金 − 净债务）÷ 总股本。适用控股型 / 多元化公司（如 藏格矿业—巨龙铜业、中科曙光—海光敞口），以及「主业 + 参股上市平台」导致单一 PE 失真的结构。',
      inlineKeys:['seg1np','seg1pe','seg2np','seg2pe','seg3np','seg3pe','seg4np','seg4pe'],
      fields:[
        {key:'seg1np',   label:'分部①净利(亿)',      group:'分部①', shortLabel:'①净利'},
        {key:'seg1pe',   label:'分部①目标PE(倍)',    group:'分部①', shortLabel:'①PE'},
        {key:'seg2np',   label:'分部②净利(亿)',      group:'分部②', shortLabel:'②净利'},
        {key:'seg2pe',   label:'分部②目标PE(倍)',    group:'分部②', shortLabel:'②PE'},
        {key:'seg3np',   label:'分部③净利(亿)',      group:'分部③', shortLabel:'③净利'},
        {key:'seg3pe',   label:'分部③目标PE(倍)',    group:'分部③', shortLabel:'③PE'},
        {key:'seg4np',   label:'分部④净利(亿)',      group:'分部④', shortLabel:'④净利'},
        {key:'seg4pe',   label:'分部④目标PE(倍)',    group:'分部④', shortLabel:'④PE'},
        {key:'listedHold',label:'持有上市股权市值(亿)',group:'调整项', shortLabel:'上市股权'},
        {key:'netCash',  label:'净现金(亿)',          group:'调整项', shortLabel:'净现金'},
        {key:'netDebt',  label:'净债务(亿)',          group:'调整项', shortLabel:'净债'},
        {key:'shares',   label:'总股本(亿股)',        group:'调整项', shortLabel:'股本'}
      ] },
  ];
  function valMethodInfo(key){ return VAL_METHODS.find(m => m.key === key) || VAL_METHODS[0]; }

  /* ----- PE/PS 快捷推导：填了预期净利润/营收（亿）→ 自动算 EPS/每股营收（元/股）写回 baseValue -----
   * 总股本单位是「亿股」，亿 ÷ 亿股 = 元/股，无需换算。
   * 源字段为空/0 时返回 null（不覆盖手填的 baseValue）；总股本未填时同样返回 null。
   */
  function deriveBaseValue(method, params, totalShares){
    const shares = Number(totalShares) || 0;
    if(shares <= 0 || !params) return null;
    const src = method === 'PE' ? params.profitYi : (method === 'PS' ? params.revenueYi : null);
    if(!src || !isFinite(src)) return null;
    return Math.round((src / shares) * 10000) / 10000;
  }

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
    { key:'salesCash',        label:'销售收现',     unit:'亿', priority:3, category:'现金流量表', source:'input', desc:'销售商品、提供劳务收到的现金（现金流量表，观察收现质量：与营收对比）' },
    { key:'capex',            label:'资本开支',     unit:'亿', priority:4, category:'核心指标', source:'input', desc:'购建固定资产、无形资产和其他长期资产支付的现金（≈资本开支，用于估算FCF）' },
    { key:'roe',              label:'ROE',          unit:'%',  priority:4, category:'核心指标', source:'input', desc:'净资产收益率' },
    { key:'grossMargin',      label:'毛利率',       unit:'%',  priority:4, category:'核心指标', source:'input', desc:'毛利率' },
    { key:'netMargin',        label:'净利率',       unit:'%',  priority:4, category:'核心指标', source:'input', desc:'净利率 = 净利润/营业收入' },
    { key:'assetLiabRatio',   label:'资产负债率',   unit:'%',  priority:4, category:'核心指标', source:'input', desc:'资产负债率（资产负债表）' },
    { key:'accountsReceivable',label:'应收账款',    unit:'亿', priority:3, category:'资产负债表', source:'input', desc:'应收账款（资产负债表，观察收入质量与下游占款）' },
    { key:'inventory',        label:'存货',         unit:'亿', priority:3, category:'资产负债表', source:'input', desc:'存货（资产负债表，观察备货节奏与需求景气）' },
    { key:'contractLiab',     label:'合同负债',     unit:'亿', priority:3, category:'资产负债表', source:'input', desc:'合同负债（资产负债表，订单能见度的前瞻信号）' },
    { key:'cash',             label:'货币资金',     unit:'亿', priority:3, category:'资产负债表', source:'input', desc:'货币资金（资产负债表，现金储备）' },
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
    { key:'revenue',              label:'营业收入',     unit:'亿' },
    { key:'revenueYoy',           label:'营收同比',     unit:'%' },
    { key:'deductedNetProfit',    label:'扣非净利润',   unit:'亿' },
    { key:'deductedNetProfitYoy', label:'扣非净利同比', unit:'%' },
    { key:'roe',                  label:'ROE',          unit:'%' },
    { key:'grossMargin',          label:'毛利率',       unit:'%' },
    { key:'netMargin',            label:'净利率',       unit:'%' },
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

  /* ================= 估值矩阵 / 触发线（对齐《估值五步法》Step2→Step4） =================
   * 矩阵：把带「情景」标注的估值记录汇总为 方法 × 情景，推导各档均值与合理股价区间。
   * 触发线：由 中性中枢 / 保守 / 乐观 推出四档价格，可一键写入「待击球」台账。
   * 纯计算，不改数据 —— 渲染与写入分离，符合「数据层→计算层→渲染层」单向调用。
   */
  function round2(v){ return (v == null || isNaN(v)) ? null : Math.round(v * 100) / 100; }

  /* ================= 通用小工具：日期差 / 归档 / 估值时效 / 报告索引 ================= */
  /* 日期差（按自然日，规避时区）：a - b 的天数 */
  function dayDiff(a, b){
    if(!a || !b) return null;
    const t = new Date(String(a).slice(0,10) + 'T00:00:00') - new Date(String(b).slice(0,10) + 'T00:00:00');
    return Math.round(t / 86400000);
  }
  function daysSince(ds){ return dayDiff(dateStr(), ds); }   // 正数 = 已过去 N 天
  function daysUntil(ds){ return dayDiff(ds, dateStr()); }   // 正数 = 还有 N 天

  /* 三级归档徽章 */
  function tierBadge(c){
    if(!c || !c.tier) return '';
    return '<span class="badge ' + (TIER_CLS[c.tier] || 'gray') + '" title="三级归档：' + esc(TIER_DESC[c.tier] || '') + '">' + esc(c.tier) + '</span>';
  }

  /* 最新一条估值记录的日期（按 date 倒序） */
  function latestValDate(c){
    const v = (c.valuations || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    return v ? String(v.date || '') : '';
  }
  /* 估值时效：{ code:'empty'|'stale'|'ok', days, date } */
  function valFreshness(c){
    const d0 = latestValDate(c);
    if(!d0) return { code:'empty', days:null, date:'' };
    const d = daysSince(d0);
    if(d != null && d > VAL_STALE_DAYS) return { code:'stale', days:d, date:d0 };
    return { code:'ok', days:d, date:d0 };
  }
  /* 时效徽章（仅在 empty / stale 时产出，ok 返回空串） */
  function freshnessBadge(c){
    const f = valFreshness(c);
    if(f.code === 'empty') return '<span class="badge amber" title="还没有任何估值记录，无法推导买点">⏳ 未估值</span>';
    if(f.code === 'stale') return '<span class="badge red" title="最新估值 ' + esc(f.date) + '，已 ' + f.days + ' 天未更新（阈值 ' + VAL_STALE_DAYS + ' 天），建议重估">⏳ 待重估 ' + f.days + 'd</span>';
    return '';
  }

  /* 弹窗内的公式排版：KaTeX 未加载时先懒加载，加载完成或超时后统一排版 */
  function typesetModalMath(){
    const root = modalRoot;
    if(!root || !root.querySelector('.math-tex')) return;
    if(window.katex){ typesetMath(root); return; }
    loadKatex();
    let n = 0;
    const timer = setInterval(function(){
      if(window.katex || ++n > 40){
        clearInterval(timer);
        if(root.querySelector('.math-tex')) typesetMath(root);
      }
    }, 200);
  }

  function valMatrixSummary(c){
    const vals = (c.valuations || []).filter(v => Number(v.estimatedValue) > 0);
    const cell = {};                                   // method -> { 保守/中性/乐观/'' : valuation }
    const buckets = { 保守: [], 中性: [], 乐观: [] };
    const methodSet = [];
    // 日期升序遍历：同一「方法 × 情景」有多条时，后写入的（更新的记录）覆盖前者
    vals.slice().sort((a, b) => String(a.date || '').localeCompare(String(b.date || ''))).forEach(v => {
      const sc = VAL_SCENARIOS.indexOf(v.scenario) >= 0 ? v.scenario : '';
      if(methodSet.indexOf(v.method) < 0) methodSet.push(v.method);
      cell[v.method] = cell[v.method] || {};
      cell[v.method][sc] = v;
      if(sc) buckets[sc].push(Number(v.estimatedValue));
    });
    // 方法按 VAL_METHODS 声明顺序排列（未知方法沉底）
    const methods = methodSet.sort((a, b) => {
      const ia = VAL_METHODS.findIndex(m => m.key === a), ib = VAL_METHODS.findIndex(m => m.key === b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;
    return { methods: methods, cell: cell, mean: { 保守: avg(buckets.保守), 中性: avg(buckets.中性), 乐观: avg(buckets.乐观) } };
  }

  function valMatrixHTML(c){
    const m = valMatrixSummary(c);
    const n2f = v => (v == null || isNaN(v)) ? '<span class="muted">—</span>' : Number(v).toFixed(2);
    let h = '<div class="val-section"><div class="vs-head"><h3>🧮 估值矩阵 <span class="muted" style="font-weight:400;font-size:12px">方法 × 情景 · 同口径交叉验证，自动汇总中枢与区间</span></h3></div>';
    if(!m.methods.length){
      h += '<div class="card"><div class="empty">还没有估值记录。到下方「💰 估值记录」添加，并在弹窗里标注<b>情景</b>（保守/中性/乐观），这里会自动排成矩阵。</div></div></div>';
      return h;
    }
    h += '<div class="wide-table-wrap"><table class="val-table vm-table"><thead><tr><th>估值方法</th>' +
      VAL_SCENARIOS.map(s => '<th class="num"><span class="badge ' + SCENARIO_CLS[s] + '">' + s + '</span></th>').join('') + '<th class="num">未标注</th></tr></thead><tbody>';
    m.methods.forEach(mk => {
      const mi = valMethodInfo(mk), row = m.cell[mk] || {};
      h += '<tr><td><span class="method-badge ' + mi.cls + '">' + mi.label + '</span></td>' +
        VAL_SCENARIOS.map(s => '<td class="num">' + (row[s] ? '<b>' + n2f(row[s].estimatedValue) + '</b>' : '<span class="muted">—</span>') + '</td>').join('') +
        '<td class="num muted">' + (row[''] ? n2f(row[''].estimatedValue) : '—') + '</td></tr>';
    });
    h += '<tr class="vm-mean"><td><b>各档均值</b></td>' +
      VAL_SCENARIOS.map(s => '<td class="num">' + (m.mean[s] == null ? '<span class="muted">—</span>' : '<b>' + m.mean[s].toFixed(2) + '</b>') + '</td>').join('') +
      '<td class="num">—</td></tr>';
    h += '</tbody></table></div>';
    // 结论条：中性中枢 / 合理区间 / 现价对比
    if(m.mean.中性 != null){
      const low = m.mean.保守, high = m.mean.乐观, cur = Number(c.currentPrice) || 0;
      h += '<div class="vm-conclusion">' +
        '<span class="vmc-item">中性中枢 <b>' + m.mean.中性.toFixed(2) + '</b></span>' +
        (low != null && high != null ? '<span class="vmc-item">合理区间 <b>' + low.toFixed(2) + ' – ' + high.toFixed(2) + '</b></span>' : '') +
        (cur > 0 ? '<span class="vmc-item">现价 ' + cur.toFixed(2) + ' · 距中性中枢 <b class="' + (cur <= m.mean.中性 ? 'mos-pos' : 'mos-neg') + '">' +
          ((cur - m.mean.中性) / m.mean.中性 * 100).toFixed(1) + '%</b></span>' : '') +
        '</div>';
    } else {
      h += '<div class="hint" style="margin-top:8px">矩阵已就绪，但还缺「中性」情景的估值记录 —— 标注后才能推导中枢与触发线。</div>';
    }
    h += '</div>';
    return h;
  }

  /* 四档触发线：中性持有区与 1/4 档为推导值，动作沿用《估值五步法》Step4 口径。
   * 评级联动：已评级（非 D）→ 第一买点 = 中性 × 宽容度下沿（S 0.90 合理价就买 … C 0.60 极端恐慌）；
   * 未评级沿用默认 ×0.85；D 禁入（触发线回退默认口径，由触发线区显示禁入横幅）。 */
  function valTriggerLines(mean, c){
    const mid = mean.中性;
    if(mid == null) return null;
    const low = mean.保守 != null ? mean.保守 : mid * 0.8;
    const high = mean.乐观 != null ? mean.乐观 : mid * 1.25;
    const p = ratingParams(c);
    const firstMul = (p && p.tol) ? p.tol[0] : 0.85;
    const deepV = p ? mid * firstMul * 0.9 : low * 0.9;   // 评级后深度买点跟随宽容度，保证 深度 < 第一买点
    return [
      { key:'deep',  label:'深度买点',   value: deepV,          act:'重仓区：分批第一笔可加大仓位', cls:'mos-pos' },
      { key:'first', label:'第一买点',   value: mid * firstMul, act:'分批建仓（4:3:3 第一笔）' + (p ? ' · 评级 ' + p.g + ' 击球区 ×' + p.tol[0] + '–' + p.tol[1] : ''), cls:'mos-pos', main:true },
      { key:'hold',  label:'中性持有区', value: mid,            act:'持有不动（±5% 属合理波动）',     cls:'' },
      { key:'trim',  label:'止盈观察区', value: mid * 1.2,      act:'涨入此区不追高，可减 1/3 锁利',  cls:'mos-neg' },
      { key:'over',  label:'透支卖出区', value: high * 1.05,    act:'减仓（已超出乐观值）',           cls:'mos-neg' },
    ];
  }

  /* ----- 公司评级（S/A/B/C/D）：数据访问与联动参数 ----- */
  function ratingOf(c){
    return (c && c.rating && c.rating.grade) ? c.rating : null;
  }
  function ratingParams(c){
    const r = ratingOf(c);
    if(!r) return null;
    const L = ValCore.RATING_LEVELS.find(x => x.g === r.grade);
    return (L && L.tol) ? Object.assign({ g: r.grade }, L) : null;   // D 级 tol=null → 触发线回退默认口径
  }
  function ensureRating(c){
    if(!c.rating || typeof c.rating !== 'object') c.rating = {};
    c.rating.scores = c.rating.scores || {};
    c.rating.flags = c.rating.flags || {};
    return c.rating;
  }
  // 按 6 位代码索引公司（财报跟踪/行业研究/待击球 等模块按代码取评级徽章与仓位上限）
  let _ratingIdx = null, _ratingIdxRef = null, _ratingIdxLen = -1;
  function ratingIdx(){
    const cs = (DB.valuation && DB.valuation.companies) || [];
    if(_ratingIdx && _ratingIdxRef === cs && _ratingIdxLen === cs.length) return _ratingIdx;
    const m = {};
    cs.forEach(c => {
      const c6 = (String(c.ticker || '').match(/(\d{6})/) || [])[1];
      if(c6) m[c6] = c;
    });
    _ratingIdx = m; _ratingIdxRef = cs; _ratingIdxLen = cs.length;
    return m;
  }
  function ratingBadgeByCode(code6){
    const c6 = (String(code6 || '').match(/(\d{6})/) || [])[1] || '';
    const c = c6 ? ratingIdx()[c6] : null;
    return ValCore.ratingBadgeHTML(c ? ratingOf(c) : null);
  }
  function ratingCapByTicker(ticker){
    const c6 = (String(ticker || '').match(/(\d{6})/) || [])[1] || '';
    const c = c6 ? ratingIdx()[c6] : null;
    const r = ratingOf(c);
    if(!r) return null;
    const L = ValCore.RATING_LEVELS.find(x => x.g === r.grade);
    return L ? { grade: L.g, posCap: L.posCap, tol: L.tol } : null;
  }

  /* 触发线面板内的失效条件摘要（编辑入口已上移到「⚡ 决策要点」） */
  function valInvalidCondsBrief(c){
    const conds = c.invalidConds || [];
    return '<div class="ib-brief">⛔ 失效条件 ' + (conds.length ? '<b>' + conds.length + '</b> 条' : '未填写') +
      ' <span class="muted">· 编辑入口在「⚡ 决策要点」板块（公司评级上方）；点「⚾ 写入待击球」会一并带过去</span></div>';
  }

  /* ----- 🏛 公司评级卡（公司研究上方）：四维打分 → 自动评级（可手动覆盖）-----
   * 评级联动：触发线第一买点 = 中性 × 宽容度下沿；组合仓位单票上限 = min(仓位池, 评级权限)；D 禁入。 */
  function valRatingHTML(c){
    const r = ratingOf(c);
    const sc = (r && r.scores) || {};
    const fl = (r && r.flags) || {};
    const grade = (r && r.grade) || '';
    const L = (grade && grade !== 'D') ? ValCore.RATING_LEVELS.find(x => x.g === grade) : null;
    const sug = ValCore.ratingAutoGrade(sc, fl);
    // ① 四维打分：卡片网格——打分口径直接写在卡片里，不再只藏在悬停提示
    const dimCard = (d) => {
      const v = sc[d.key];
      return '<div class="rt-dim" title="' + esc(d.hint) + '">' +
        '<div class="lb"><b>' + esc(d.label) + '</b>' +
          (v == null ? '<span class="sc none">未评</span>' : '<span class="sc">' + v + ' 分</span>') + '</div>' +
        '<div class="ds">' + esc(d.hint) + '</div>' +
        '<select class="val-inline-sel" data-change="val.setRatingScore" data-id="' + c.id + '" data-dim="' + d.key + '">' +
          '<option value=""' + (v == null ? ' selected' : '') + '>未评</option>' +
          [0, 1, 2, 3, 4].map(n => '<option value="' + n + '"' + (String(v) === String(n) ? ' selected' : '') + '>' + n + ' 分</option>').join('') +
        '</select></div>';
    };
    // ② 戒律门控 / S 级三重验证：勾选项带完整说明，勾中即高亮
    const flagItem = (key, strong, rest, title) =>
      '<label class="rt-flag' + (fl[key] ? ' on' : '') + '" title="' + esc(title) + '">' +
      '<input type="checkbox" data-change="val.setRatingFlag" data-id="' + c.id + '" data-flag="' + key + '"' + (fl[key] ? ' checked' : '') + '>' +
      '<span><b>' + strong + '</b>' + rest + '</span></label>';
    let h = '<div class="val-section"><div class="vs-head"><h3>🏛 公司评级 <span class="muted" style="font-weight:400;font-size:12px">不确定性越大，参数越苛刻 · S 级的宽容是挣来的（三重验证），C 级的苛刻是应得的</span></h3>' +
      '<button class="btn primary sm" style="background:var(--indigo)" data-action="val.ratingAuto" data-id="' + c.id + '" title="按当前打分与戒律门控自动计算评级（可再手动覆盖）">⚖ 自动评级</button></div>';
    // 当前评级状态条：徽章 + 联动参数（击球区 / 仓位权限 / 止损 / 验证频率）
    h += '<div class="ind-note' + (L ? ' good' : (grade === 'D' ? ' warn' : '')) + '">' +
      ValCore.ratingBadgeHTML(grade ? { grade: grade } : null) + ' ' +
      (L ? '击球区 <b>×' + L.tol[0] + '–' + L.tol[1] + '</b>（第一买点 = 中性 ×' + L.tol[0] + '） · 仓位权限 ≤<b>' + L.posCap + '%</b> · 止损宽度 <b>' + L.stop + '%</b> · 验证频率 ' + esc(L.review) + ' — ' + esc(L.desc) : '') +
      (grade === 'D' ? '<b>禁入</b>：不建仓，已有持仓按止损纪律退出' : '') +
      (!grade ? '未评级：触发线按默认口径（中性 ×0.85）——完成下方四维打分后点「⚖ 自动评级」，击球区与仓位权限即自动联动' : '') +
      '</div>';
    // ① 四维打分（A/E/I/C 各 0–4 分）
    h += '<div class="ind-sub first"><div class="ind-sub-h"><span class="ind-sub-n">①</span><b>四维打分</b>' +
      '<span class="tip">A 业绩 · E 弹性与预期差 · I 行业景气 · C 竞争格局，各 0–4 分满分 16；口径写在卡片内，悬停看完整说明</span></div>' +
      '<div class="rt-dims">' + ValCore.RATING_DIMS.map(dimCard).join('') + '</div></div>';
    // ② 戒律门控 + S 级三重验证
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
    // ③ 评级确认：自动建议（与手动不一致时警示）+ 手动覆盖 + 依据备注
    const mismatch = grade && sug.grade && sug.grade !== grade;
    h += '<div class="ind-sub"><div class="ind-sub-h"><span class="ind-sub-n">③</span><b>评级确认（可手动覆盖）</b>' +
      '<span class="tip">自动评级按打分 + 门控计算；手动覆盖后仍可随时点右上「⚖ 自动评级」重算</span></div>' +
      '<div class="rt-confirm">' +
        '<div class="ind-fld"><span class="lb">最终评级</span><span class="ctl">' +
          '<select class="val-inline-sel" style="min-width:120px" data-change="val.setRatingGrade" data-id="' + c.id + '">' +
            '<option value=""' + (!grade ? ' selected' : '') + '>未评级</option>' +
            ValCore.RATING_LEVELS.map(x => '<option value="' + x.g + '"' + (grade === x.g ? ' selected' : '') + '>' + x.g + ' 级</option>').join('') +
          '</select></span></div>' +
        '<div class="ind-fld" style="flex:1;min-width:230px"><span class="lb">自动建议（打分 + 门控）</span><span class="ctl">' +
          '<span class="ind-note' + (mismatch ? ' warn' : ' good') + '" style="margin-top:0;display:inline-flex;align-items:center;gap:4px">⚖ 建议 <b>' + sug.grade + '</b>（' + sug.sum + '/16 分' + (sug.notes.length ? ' · ' + esc(sug.notes.join('；')) : '') + '）' +
            (mismatch ? ' — 与当前 ' + esc(grade) + ' 级不一致，点「⚖ 自动评级」对齐' : '') + '</span></span></div>' +
        '<div class="ind-fld" style="flex:2;min-width:260px"><span class="lb">评级依据备注</span>' +
          '<input type="text" class="val-inline" style="width:100%" placeholder="如：连 2 季达标 + OCF 回补，升 A" data-change="val.setRatingNote" data-id="' + c.id + '" value="' + esc((r && r.note) || '') + '"></div>' +
      '</div></div>';
    // 升降级纪律
    h += '<div class="ind-note">升降级路径：<b>观察池 → C（试仓）→ B（验证）→ A（连 2 季）→ S（三重验证）</b>。降级触发（业绩 miss &gt;20% / 证伪线触发 / 格局恶化 / 管理层异常）自动执行——触发即降，不打商量。</div>';
    h += '</div>';
    return h;
  }

  function valTriggerHTML(c){
    const lines = valTriggerLines(valMatrixSummary(c).mean, c);
    const rp = ratingParams(c);
    const rGr = (ratingOf(c) || {}).grade || '';
    let h = '<div class="val-section"><div class="vs-head"><h3>🎯 触发线 <span class="muted" style="font-weight:400;font-size:12px">由中性中枢推导 · 对齐《估值五步法》Step4' +
      (rp ? ' · 评级 ' + rp.g + ' 宽容度 ×' + rp.tol[0] + '–' + rp.tol[1] : (rGr === 'D' ? ' · 评级 D 禁入' : ' · 未评级（默认 ×0.85）')) + '</span></h3>' +
      (lines && rGr !== 'D' ? '<button class="btn primary sm" style="background:var(--indigo)" data-action="val.pushToSwing" data-id="' + c.id + '" title="把 买点区间/中枢/减持区/失效条件 写入「待击球」台账；已有条目则原地更新">⚾ 写入待击球</button>' : '') +
      '</div>';
    if(rGr === 'D'){
      h += '<div class="banner" style="border-color:var(--red);background:var(--pink-bg,#fdecea)"><span>⛔ 评级 <b>D</b>：禁入。以下触发线仅作观察参考，不构成买点；已有持仓按止损纪律退出。</span></div>';
    }
    if(!lines){
      h += '<div class="card"><div class="empty">需要至少一条<b>「中性」</b>情景的估值记录，才能推导触发线。</div></div>';
      h += valInvalidCondsBrief(c);
      h += '</div>';
      return h;
    }
    const cur = Number(c.currentPrice) || 0;
    const first = lines.find(x => x.key === 'first').value;
    h += '<div class="trigger-wrap"><table class="val-table trigger-table"><thead><tr>' +
      '<th>触发线</th><th class="num">价格</th><th>操作动作</th></tr></thead><tbody>';
    lines.forEach(l => {
      const isHold = l.key === 'hold';
      const priceTxt = isHold
        ? '<span class="muted">' + (l.value * 0.95).toFixed(2) + ' – ' + (l.value * 1.05).toFixed(2) + '</span>'
        : '<b class="' + l.cls + '">' + l.value.toFixed(2) + '</b>';
      // 已触及判定：买点类看「现价 ≤ 触发线」，止盈/透支类看「现价 ≥ 触发线」
      const hit = cur > 0 && !isHold && ((l.key === 'deep' || l.key === 'first') ? cur <= l.value : cur >= l.value);
      h += '<tr' + (hit ? ' class="trigger-hit"' : '') + '><td><b>' + l.label + '</b>' + (l.main ? ' <span class="badge indigo">主锚</span>' : '') + '</td>' +
        '<td class="num">' + priceTxt + '</td>' +
        '<td class="muted">' + l.act + (hit ? ' <span class="badge ' + (l.cls === 'mos-neg' ? 'red' : 'green') + '">当前已触及</span>' : '') + '</td></tr>';
    });
    h += '</tbody></table>';
    if(cur > 0){
      const gap = (cur - first) / first * 100;
      const cls = gap <= 0 ? 'mos-pos' : (gap <= 15 ? '' : 'mos-neg');
      const tail = gap <= 0 ? '已到买点区间，按分批计划执行' : (gap <= 15 ? '候击区：接近买点，暂不建仓（铁律④）' : '距买点 >15%，禁止击球（铁律④）');
      h += '<div class="trigger-gap">现价 ' + cur.toFixed(2) + ' · 距第一买点 <b class="' + cls + '">' + (gap > 0 ? '+' : '') + gap.toFixed(1) + '%</b> ' +
        '<span class="muted">' + tail + '</span></div>';
    }
    h += '</div>';
    h += valInvalidCondsBrief(c);
    h += '</div>';
    return h;
  }

  /* ----- 估值趋势图（纯 SVG）：平滑曲线 + 渐变面积 + 方法标注 + 悬停详情 ----- */
  function valChart(valuations){
    const data = valuations.filter(v => v.estimatedValue > 0).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    if(data.length < 2) return '<div class="muted" style="text-align:center;padding:16px;font-size:13px">需要至少 2 条估值记录才能绘制趋势图</div>';
    const w = 720, h = 280, pad = {l:52, r:20, t:36, b:40};
    const plotW = w - pad.l - pad.r, plotH = h - pad.t - pad.b;
    const allVals = data.flatMap(v => [v.estimatedValue, v.actualPrice].filter(x => x > 0));
    const minV = Math.min(...allVals) * 0.92, maxV = Math.max(...allVals) * 1.08;
    const range = maxV - minV || 1;
    const xS = i => pad.l + (i / (data.length - 1)) * plotW;
    const yS = v => h - pad.b - ((v - minV) / range) * plotH;
    const fmtY = x => Math.abs(x) >= 1000 ? x.toFixed(0) : x.toFixed(1);
    // Catmull-Rom → 三次贝塞尔：轻度平滑
    const smooth = pts => {
      let d = 'M ' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
      for(let i = 0; i < pts.length - 1; i++){
        const p0 = pts[Math.max(0, i-1)], p1 = pts[i], p2 = pts[i+1], p3 = pts[Math.min(pts.length-1, i+2)];
        d += ' C ' + (p1[0]+(p2[0]-p0[0])/6).toFixed(1) + ' ' + (p1[1]+(p2[1]-p0[1])/6).toFixed(1) +
             ', ' + (p2[0]-(p3[0]-p1[0])/6).toFixed(1) + ' ' + (p2[1]-(p3[1]-p1[1])/6).toFixed(1) +
             ', ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
      }
      return d;
    };
    let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto;display:block">';
    svg += '<defs><linearGradient id="valChartGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#5b64f2" stop-opacity="0.16"/>' +
      '<stop offset="100%" stop-color="#5b64f2" stop-opacity="0"/></linearGradient></defs>';
    for(let i = 0; i <= 4; i++){
      const y = pad.t + i * plotH / 4;
      const val = maxV - i * range / 4;
      svg += '<line class="cgrid" x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + y.toFixed(1) + '" stroke-width="1"' + (i === 4 ? '' : ' stroke-dasharray="3,3"') + '/>';
      svg += '<text x="' + (pad.l-8) + '" y="' + (y+3.5).toFixed(1) + '" text-anchor="end" font-size="10" fill="#98a1b3">' + fmtY(val) + '</text>';
    }
    // 估算价值：渐变面积 + 平滑主线
    const estPts = data.map((v,i) => [xS(i), yS(v.estimatedValue)]);
    const estPath = smooth(estPts);
    svg += '<path d="' + estPath + ' L ' + estPts[estPts.length-1][0].toFixed(1) + ' ' + (h-pad.b).toFixed(1) + ' L ' + estPts[0][0].toFixed(1) + ' ' + (h-pad.b).toFixed(1) + ' Z" fill="url(#valChartGrad)"/>';
    svg += '<path d="' + estPath + '" fill="none" stroke="#5b64f2" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
    // 实际股价：平滑虚线 + 描边点
    const actIdx = data.map((v,i) => v.actualPrice > 0 ? i : -1).filter(i => i >= 0);
    if(actIdx.length >= 2){
      svg += '<path d="' + smooth(actIdx.map(i => [xS(i), yS(data[i].actualPrice)])) + '" fill="none" stroke="#0ea97b" stroke-width="2" stroke-dasharray="6,4" stroke-linecap="round" stroke-linejoin="round"/>';
      actIdx.forEach(i => { svg += '<circle cx="' + xS(i).toFixed(1) + '" cy="' + yS(data[i].actualPrice).toFixed(1) + '" r="3.5" fill="#0ea97b" stroke="var(--card)" stroke-width="1.5"/>'; });
    }
    // 估算价值点 + 估值方法缩写标签（置于背离实际股价的一侧避免遮挡）+ 悬停命中区
    data.forEach((v,i) => {
      const px = xS(i), py = yS(v.estimatedValue);
      const mos = calcMoS(v.estimatedValue, v.actualPrice);
      const tipLines = [
        v.date || '',
        (v.method || '—') + ' · 估算 ' + (v.estimatedValue||0).toFixed(2),
        v.actualPrice > 0 ? '实际 ' + v.actualPrice.toFixed(2) + ' · MoS ' + (mos == null ? '—' : fmtPct(mos)) : ''
      ].join('|');
      svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="4" fill="#5b64f2" stroke="var(--card)" stroke-width="2"/>';
      const above = !(v.actualPrice > 0 && v.actualPrice < v.estimatedValue);
      svg += '<text x="' + px.toFixed(1) + '" y="' + (above ? py - 11 : py + 18).toFixed(1) + '" text-anchor="middle" font-size="9" font-weight="700" fill="#5b64f2" opacity="0.85">' + esc(v.method || '') + '</text>';
      svg += '<circle cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="11" fill="transparent" style="cursor:crosshair" data-x="' + px.toFixed(1) + '" data-y="' + py.toFixed(1) + '" data-tip="' + esc(tipLines) + '" onmouseover="valChartTip(this)" onmouseout="valChartTipHide(this)"/>';
    });
    // X 轴日期：限数量 + 相邻去重（同日多条记录只标一次）
    let lastX = -1e9, lastDate = '';
    const minGap = plotW / 6;
    data.forEach((v,i) => {
      const x = xS(i), d = (v.date || '').slice(5);
      if(x - lastX < minGap || d === lastDate) return;
      const anchor = x < pad.l + 16 ? 'start' : (x > w - pad.r - 16 ? 'end' : 'middle');
      svg += '<text x="' + x.toFixed(1) + '" y="' + (h - pad.b + 18) + '" text-anchor="' + anchor + '" font-size="10" fill="#98a1b3">' + esc(d) + '</text>';
      lastX = x; lastDate = d;
    });
    {
      const x = xS(data.length - 1), d = (data[data.length-1].date || '').slice(5);
      if(d && d !== lastDate && x - lastX >= 34)
        svg += '<text x="' + x.toFixed(1) + '" y="' + (h - pad.b + 18) + '" text-anchor="end" font-size="10" fill="#98a1b3">' + esc(d) + '</text>';
    }
    // 图例（方法唯一时并入图例文案）
    const methods = [...new Set(data.map(v => v.method).filter(Boolean))];
    let lx = pad.l;
    const drawLegend = (color, dash, text) => {
      svg += '<line x1="' + lx + '" y1="' + (pad.t - 12) + '" x2="' + (lx + 18) + '" y2="' + (pad.t - 12) + '" stroke="' + color + '" stroke-width="2.5" stroke-linecap="round"' + (dash ? ' stroke-dasharray="6,4"' : '') + '/>';
      svg += '<text x="' + (lx + 23) + '" y="' + (pad.t - 8.5) + '" font-size="10.5" fill="#66707f">' + esc(text) + '</text>';
      lx += 23 + text.length * 10.5 + 18;
    };
    drawLegend('#5b64f2', false, methods.length === 1 ? '估算价值 (' + methods[0] + ')' : '估算价值');
    if(actIdx.length >= 1) drawLegend('#0ea97b', true, '实际股价');
    // 悬停详情层（最上层，默认隐藏）
    svg += '<g class="chart-tip" visibility="hidden">' +
      '<line class="tip-line" x1="0" y1="' + pad.t + '" x2="0" y2="' + (h-pad.b) + '" stroke="#5b64f2" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"/>' +
      '<g class="tip-box"><rect x="0" y="0" width="176" height="58" rx="8" fill="#262b36" opacity="0.95"/>' +
      '<text class="tip-l1" x="88" y="17" text-anchor="middle" font-size="10" fill="#9aa4b8"></text>' +
      '<text class="tip-l2" x="88" y="33" text-anchor="middle" font-size="11.5" fill="#fff" font-weight="600"></text>' +
      '<text class="tip-l3" x="88" y="48" text-anchor="middle" font-size="10" fill="#7ee2b8"></text>' +
      '</g></g>';
    svg += '</svg>';
    return svg;
  }
  // 悬停详情：竖直参考线 + 信息框（供 SVG 内联 onmouseover 调用；720/36/40/280 与 valChart 布局常量对应）
  window.valChartTip = function(el){
    if(!el || !el.closest) return;
    const svg = el.closest('svg'); if(!svg) return;
    const tip = svg.querySelector('.chart-tip'); if(!tip) return;
    const px = parseFloat(el.getAttribute('data-x')), py = parseFloat(el.getAttribute('data-y'));
    const lines = (el.getAttribute('data-tip') || '').split('|');
    const line = tip.querySelector('.tip-line');
    line.setAttribute('x1', px.toFixed(1)); line.setAttribute('x2', px.toFixed(1));
    const box = tip.querySelector('.tip-box');
    const rect = box.querySelector('rect');
    const bw = parseFloat(rect.getAttribute('width'));
    const bh = lines[2] ? 58 : 42;
    rect.setAttribute('height', bh);
    const bx = Math.min(Math.max(px - bw / 2, 4), 720 - bw - 4);
    const by = py > 36 + bh + 20 ? 40 : 280 - 40 - bh - 6;
    box.setAttribute('transform', 'translate(' + bx.toFixed(1) + ',' + by.toFixed(1) + ')');
    box.querySelector('.tip-l1').textContent = lines[0] || '';
    box.querySelector('.tip-l2').textContent = lines[1] || '';
    box.querySelector('.tip-l3').textContent = lines[2] || '';
    tip.setAttribute('visibility', 'visible');
  };
  window.valChartTipHide = function(el){
    if(!el || !el.closest) return;
    const svg = el.closest('svg'); if(!svg) return;
    const tip = svg.querySelector('.chart-tip');
    if(tip) tip.setAttribute('visibility', 'hidden');
  };

  /* ----- 估值弹窗辅助 ----- */
  function valParamFields(method, params){
    const m = valMethodInfo(method);
    let html = '';
    let lastGroup = null;
    m.fields.forEach(f => {
      // 对带 group 的字段（如 DCF 的外推/手动模式、SOTP 的各分部）插入分组标题
      if(f.group && f.group !== lastGroup){
        lastGroup = f.group;
        html += '<div class="param-group-label">' + esc(f.group) + '</div>';
      }
      html += '<div class="field" style="flex:1;min-width:130px"><label>' + f.label + '</label>' +
        '<input type="number" step="0.01" name="param_' + f.key + '" value="' + (params && params[f.key] != null ? params[f.key] : '') + '" placeholder="0" oninput="recalcValuation()">' +
        (f.help ? '<div class="muted" style="font-size:11px;margin-top:2px;line-height:1.4">' + esc(f.help) + '</div>' : '') + '</div>';
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
    // 行内只展示「主参数」，其余放 ⚙ 弹窗：
    //   DCF  → 外推模式两个字段（基年FCF + 增长率）
    //   SOTP → 四个分部的 净利 × PE（调整项在 ⚙ 中编辑）
    const keys = m.inlineKeys || (v.method === 'DCF' ? ['baseFcf','growthRate'] : null);
    const fields = keys ? m.fields.filter(f => keys.includes(f.key)) : m.fields;
    // 被折叠的字段数：给一个明确提示，避免用户以为参数丢了
    const hiddenN = m.fields.length - fields.length;
    const more = hiddenN > 0
      ? '<span class="vp-more muted" title="点本行右侧的 ⚙ 可编辑全部参数">＋' + hiddenN + ' 项在 ⚙</span>'
      : '';
    return '<div class="val-param-inline' + (fields.length > 3 ? ' wrap' : '') + '">' + fields.map(f => vpFieldHTML(c, v, params, f)).join('') + more + '</div>';
  }
  /* ----- 估值弹窗 · 参考指标区（实时行情 / 最新季度财务 / 一致预期） -----
   * 添加/编辑估值时把该公司已有数据摆在眼前，免去翻回详情页对照。
   * 可填充项（.ref-stat.fill / .ref-fill）点击后自动填入对应表单字段并触发重算。
   */
  function fillValRef(el){
    const form = el.closest('form'); if(!form) return;
    const target = form.querySelector('[name="' + el.dataset.fill + '"]');
    if(!target) return;
    target.value = Number(el.dataset.value).toFixed(2);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  }
  window.fillValRef = fillValRef;
  // 单个参考指标 chip；fill 传目标输入框 name 时可点击填入
  function refStatHTML(label, value, unit, fill, tip){
    if(value == null || value === '' || isNaN(Number(value))) return '';
    const v = Number(value);
    return '<span class="ref-stat' + (fill ? ' fill' : '') + '"' +
      (fill ? ' data-fill="' + fill + '" data-value="' + v + '" title="' + esc(tip) + '" onclick="fillValRef(this)"' : '') + '>' +
      '<span class="label">' + esc(label) + '</span>' +
      '<span class="val">' + n2(v) + (unit ? ' <span class="muted" style="font-weight:400;font-size:11px">' + esc(unit) + '</span>' : '') + '</span></span>';
  }
  // 一致预期表格单元格后的「填」链接（如把 2026E EPS 填入预期EPS 参数）
  function refCellLink(value, fill, tip){
    if(fill == null || value == null || value === '' || isNaN(Number(value))) return '';
    return ' <a class="ref-fill" data-fill="' + fill + '" data-value="' + Number(value) + '" title="' + esc(tip) + '" onclick="fillValRef(this)">填</a>';
  }
  function refGroup(title, inner, sub){
    if(!inner) return '';
    return '<div class="ref-group"><div class="ref-group-title">' + title +
      (sub ? ' <span class="muted" style="font-weight:400">' + esc(sub) + '</span>' : '') + '</div>' + inner + '</div>';
  }
  // 组装三组参考指标：实时行情 / 最新季度财务 / 一致预期（无数据组自动省略）
  function valRefDataHTML(c, method){
    const hasField = key => valMethodInfo(method).fields.some(f => f.key === key);
    const shares = Number(c.totalShares) || 0;
    let groups = '';
    // ① 实时行情（行情快照来自「导入股价」）
    const q = (c.quote && typeof c.quote === 'object') ? c.quote : null;
    let quoteStats = '';
    if((c.currentPrice || 0) > 0) quoteStats += refStatHTML('当前股价', c.currentPrice, c.currency || '', 'actualPrice', '点击填入「当时实际股价」');
    if(shares > 0) quoteStats += refStatHTML('总股本', shares, '亿股', hasField('shares') ? 'param_shares' : null, '点击填入「总股本(亿股)」');
    if(q && q.pe != null) quoteStats += refStatHTML('市盈率(动)', q.pe);
    if(q && q.pb != null) quoteStats += refStatHTML('市净率', q.pb);
    groups += refGroup('📈 实时行情', quoteStats ? '<div class="ref-stats">' + quoteStats + '</div>' : '', q && q.date ? q.date : '');
    // ② 最新季度财务（FCF = 经营现金流 − 资本开支）
    const latestFin = getLatestFin(c);
    if(latestFin){
      const fv = k => { const v = latestFin[k]; return (v == null || v === '' || isNaN(v)) ? null : Number(v); };
      const ocf = fv('opCashFlow'), capex = fv('capex'), eq = fv('equity');
      const fcf = (ocf != null && capex != null) ? ocf - capex : null;
      let finStats = '';
      finStats += refStatHTML('净利润', fv('netProfit'), '亿');
      finStats += refStatHTML('所有者权益', eq, '亿');
      finStats += refStatHTML('营业收入', fv('revenue'), '亿');
      finStats += refStatHTML('FCF', fcf, '亿', (fcf != null && hasField('baseFcf')) ? 'param_baseFcf' : null, '点击填入「基年FCF」');
      if(eq != null && shares > 0){
        finStats += refStatHTML('每股净资产', eq / shares, '元', method === 'PB' ? 'param_baseValue' : null, '点击填入「每股净资产」（所有者权益/总股本）');
      }
      groups += refGroup('📊 最新季度财务', finStats ? '<div class="ref-stats">' + finStats + '</div>' : '', latestFin.quarter);
    }
    // ③ 一致预期（实际 + 预测年份，行=指标、列=年份；每个年份列均提供「填」入口）
    const consAll = ((c.forecast || {}).consensus || []).slice()
      .sort((a,b) => String(a.year).localeCompare(String(b.year)));
    if(consAll.length){
      // 年份列标题：按 mark 区分实际(A)/预测(E)，兼容 year 自带后缀的写法
      const yearLabel = x => String(x.year).replace(/[AE]$/i,'') + (x.mark === 'A' ? 'A' : 'E');
      const rows = [
        { label:'EPS(元)',     get: x => x.eps,      fill: (method === 'PE' || method === 'PEG') ? 'param_baseValue' : null,
          tip: y => '点击填入「' + (method === 'PEG' ? '当前EPS' : '预期EPS') + '」（' + y + '）' },
        { label:'PE(倍)',      get: x => x.pe },
        { label:'ROE(%)',      get: x => x.roe },
        { label:'营收(亿)',    get: x => x.revenue,  fill: (method === 'PS' && shares > 0) ? 'param_baseValue' : null,
          altVal: x => (method === 'PS' && shares > 0) ? Number(x.revenue) / shares : null,
          tip: y => '点击填入「每股营收」（' + y + ' 营收/总股本）' },
        { label:'净利(亿)',    get: x => x.np },
        { label:'营收同比(%)', get: x => x.revRatio },
        { label:'净利同比(%)', get: x => x.npRatio,  fill: method === 'PEG' ? 'param_growthRate' : null,
          tip: y => '点击填入「预期增长率」（' + y + ' 净利同比）' },
      ];
      const body = rows.map(r => '<tr><td>' + esc(r.label) + '</td>' + consAll.map(x => {
        const link = r.fill ? refCellLink(r.altVal ? r.altVal(x) : r.get(x), r.fill, r.tip(yearLabel(x))) : '';
        return '<td>' + n2(r.get(x)) + link + '</td>';
      }).join('') + '</tr>').join('');
      groups += refGroup('🔮 一致预期（营收/净利）', '<table class="ref-table"><thead><tr><th>指标</th>' +
        consAll.map(x => '<th>' + esc(yearLabel(x)) + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table>');
    }
    return groups;
  }
  function valModalBody(company, val){
    const method = val ? val.method : 'PE';
    const params = val ? (val.params || {}) : {};
    const est = val ? (val.estimatedValue || 0) : 0;
    const refHtml = valRefDataHTML(company, method);
    return '<input type="hidden" name="cid" value="' + company.id + '">' +
      '<input type="hidden" name="id" value="' + (val ? val.id : '') + '">' +
      (refHtml ? '<div id="valRefData" class="ref-panel" title="该公司已有数据 · 点击高亮项可自动填入下方参数">' + refHtml + '</div>' : '') +
      '<div class="quick-row">' +
        '<div class="field" style="flex:1;min-width:140px"><label>估算日期</label><input type="date" name="date" value="' + (val ? val.date : dateStr()) + '"></div>' +
        '<div class="field" style="flex:1;min-width:110px"><label>情景</label><select name="scenario" title="标注情景后，详情页的「估值矩阵」与「触发线」会自动汇总">' +
          '<option value=""' + (!val || !val.scenario ? ' selected' : '') + '>未标注</option>' +
          VAL_SCENARIOS.map(s => '<option value="' + s + '"' + (val && val.scenario === s ? ' selected' : '') + '>' + s + '</option>').join('') +
        '</select></div>' +
        '<div class="field" style="flex:1;min-width:110px"><label>预测年份</label><input type="text" name="year" value="' + esc(val ? (val.year || '') : '') + '" placeholder="如：2026E"></div>' +
      '</div>' +
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
    // 参考指标区的「可填入目标」随方法变化（如 EPS 仅 PE/PEG 可填），同步刷新
    const c = findById(DB.valuation.companies, (form.querySelector('[name="cid"]')||{}).value);
    const refEl = form.querySelector('#valRefData');
    if(refEl && c){
      const refHtml = valRefDataHTML(c, method);
      refEl.innerHTML = refHtml;
      refEl.style.display = refHtml ? '' : 'none';
    }
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
    // PE/PS 快捷推导：填了预期净利润/营收 → 自动算 EPS/每股营收并回写输入框（实时可见）
    const c = findById(DB.valuation.companies, (form.querySelector('[name="cid"]')||{}).value);
    if(c){
      const derived = deriveBaseValue(method, params, c.totalShares);
      if(derived != null){
        params.baseValue = derived;
        const bi = form.querySelector('[name="param_baseValue"]');
        if(bi && document.activeElement !== bi) bi.value = derived;
      }
    }
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
  /* ================= 「今日要处理（投资版）」 =================
   * 只读汇总四类需要动作的事：已触及买点 / 估值待重估 / 复核日临期 / 尚未归档。
   * 单向调用：本函数只做「计算 + 产出 HTML」，不触发任何其他渲染函数。 */
  function valTodayHTML(){
    const cos = DB.valuation.companies || [];
    const hitList = [], staleList = [];
    let untier = 0;
    cos.forEach(c => {
      const cur = Number(c.currentPrice) || 0;
      if(cur > 0){
        const lines = valTriggerLines(valMatrixSummary(c).mean, c);
        if(lines){
          const first = lines.find(l => l.key === 'first').value;
          if(cur <= first) hitList.push({ c: c, cur: cur, first: first, gap: (cur - first) / first * 100 });
        }
      }
      const fr = valFreshness(c);
      if(fr.code !== 'ok') staleList.push({ c: c, fr: fr });
      if(!c.tier) untier++;
    });
    hitList.sort((a, b) => a.gap - b.gap);
    staleList.sort((a, b) => ((b.fr.days == null ? 999999 : b.fr.days) - (a.fr.days == null ? 999999 : a.fr.days)));
    // 复核日临期 / 逾期：只读待击球台账（跨模块读，不写）
    const reviewList = [];
    ((DB.swing && DB.swing.items) || []).forEach(it => {
      if(it.status !== '待击球' && it.status !== '持仓中') return;
      const d = daysUntil(it.nextReview);
      if(d != null && d <= 7) reviewList.push({ it: it, d: d });
    });
    reviewList.sort((a, b) => a.d - b.d);

    const total = hitList.length + staleList.length + reviewList.length + (untier ? 1 : 0);
    const row = (name, why, btn) =>
      '<div class="tp-item"><span class="tp-name">' + name + '</span><span class="tp-why">' + why + '</span>' + btn + '</div>';
    const group = (title, n, inner) => n
      ? '<div class="tp-group"><div class="tp-label">' + title + ' <b>' + n + '</b></div>' + inner + '</div>'
      : '';
    const CAP = 5;

    let h = '<div class="today-panel' + (total ? '' : ' is-clear') + '">' +
      '<div class="tp-head"><h3>⚡ 今日要处理 · 投资版</h3>' +
      '<span class="muted">' + (total ? '共 ' + total + ' 项待处理' : '暂无待处理事项 · 按计划持有，不动手') + '</span></div>';

    h += group('🔴 已触及买点', hitList.length, hitList.slice(0, CAP).map(x =>
      row(esc(x.c.name), '现价 <b>' + x.cur.toFixed(2) + '</b> ≤ 第一买点 ' + x.first.toFixed(2) +
        ' <span class="mos-pos">（' + x.gap.toFixed(1) + '%）</span>',
        '<button class="btn ghost sm" data-action="val.openCompany" data-id="' + x.c.id + '">查看</button>')).join('') +
      (hitList.length > CAP ? '<div class="tp-more muted">…另有 ' + (hitList.length - CAP) + ' 家</div>' : ''));

    h += group('⏳ 估值待重估', staleList.length, staleList.slice(0, CAP).map(x =>
      row(esc(x.c.name), x.fr.code === 'empty' ? '从未录入估值记录' :
        '最新估值 ' + esc(x.fr.date) + ' · 已 ' + x.fr.days + ' 天未更新',
        '<button class="btn ghost sm" data-action="val.openCompany" data-id="' + x.c.id + '">去补估值</button>')).join('') +
      (staleList.length > CAP ? '<div class="tp-more muted">…另有 ' + (staleList.length - CAP) + ' 家</div>' : ''));

    h += group('🔔 复核日临期／逾期', reviewList.length, reviewList.slice(0, CAP).map(x =>
      row(esc(x.it.name || x.it.ticker), (x.d < 0 ? '<b class="mos-neg">已逾期 ' + (-x.d) + ' 天</b>' : '还有 <b>' + x.d + '</b> 天') +
        ' · 复核日 ' + esc(x.it.nextReview || '—'),
        '<button class="btn ghost sm" data-action="swing.openFromVal" data-ticker="' + esc(x.it.ticker || '') + '">去复核</button>')).join('') +
      (reviewList.length > CAP ? '<div class="tp-more muted">…另有 ' + (reviewList.length - CAP) + ' 项</div>' : ''));

    if(untier) h += group('🏷 尚未分档', untier, row(untier + ' 家公司还没做三级归档',
      '<span class="muted">分档后可用「咖啡罐 / 观察池 / 回避」筛选定位</span>',
      '<button class="btn ghost sm" data-action="val.fTierOnly" data-v="' + TIER_NONE + '">去分档</button>'));

    h += '</div>';
    return h;
  }

  /* ================= 横向对比：排序指标 / 排行榜视图 / 对比表导出 =================
   * 纯计算层：给定公司 → 返回一个可横向比较的指标值（null = 无数据，排序时恒沉底）。
   * 数据来源全部是模块已有的东西（估值记录 / 最新季度财务 / 行情快照 / 触发线），不新增录入。
   * 单向调用：本块只读 DB 与计算结果，不触发任何渲染函数。
   */
  /* 最新一条估值记录（按 date 倒序） */
  function latestValOf(c){
    return (c.valuations || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0] || null;
  }
  /* 最新估值的安全边际（%）：估算价值 vs（现价 or 当时实际股价） */
  function mosOf(c){
    const lv = latestValOf(c);
    if(!lv) return null;
    return calcMoS(lv.estimatedValue, c.currentPrice || lv.actualPrice);
  }
  /* 距第一买点%（= 现价 vs 中性中枢 × 宽容度下沿：未评级 0.85 / 评级后取评级口径），负数 = 已到买点 */
  function gapToFirstBuy(c){
    const cur = Number(c.currentPrice) || 0;
    if(!(cur > 0)) return null;
    const lines = valTriggerLines(valMatrixSummary(c).mean, c);
    if(!lines) return null;
    const first = lines.find(l => l.key === 'first');
    if(!first || !(first.value > 0)) return null;
    return (cur - first.value) / first.value * 100;
  }
  /* 最新季度财务里的某个指标（数值型；空/非数返回 null） */
  function finVal(c, key){
    const f = getLatestFin(c);
    if(!f) return null;
    const v = f[key];
    return (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
  }
  /* 排序指标注册表：get 返回数值或字符串；dir 为该指标的「顺眼方向」（点选时默认方向） */
  const VAL_SORT_METRICS = [
    { key:'mos',         label:'安全边际',   get:c => mosOf(c),                       fmt:v => v == null ? '—' : fmtPct(v), dir:'desc', good:'pos' },
    { key:'name',        label:'名称',       get:c => c.name || '' },
    { key:'gap1',        label:'距第一买点', get:c => gapToFirstBuy(c),               fmt:v => v == null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1) + '%', dir:'asc', good:'gap' },
    { key:'est',         label:'最新估值',   get:c => { const l = latestValOf(c); return l ? (Number(l.estimatedValue) || null) : null; }, fmt:v => v == null ? '—' : Number(v).toFixed(2), dir:'desc' },
    { key:'revenueYoy',  label:'营收同比',   get:c => finVal(c, 'revenueYoy'),        fmt:v => v == null ? '—' : v.toFixed(1) + '%', dir:'desc', good:'pos' },
    { key:'dnpYoy',      label:'扣非同比',   get:c => finVal(c, 'deductedNetProfitYoy'), fmt:v => v == null ? '—' : v.toFixed(1) + '%', dir:'desc', good:'pos' },
    { key:'roe',         label:'ROE',        get:c => finVal(c, 'roe'),               fmt:v => v == null ? '—' : v.toFixed(2) + '%', dir:'desc', good:'pos' },
    { key:'grossMargin', label:'毛利率',     get:c => finVal(c, 'grossMargin'),       fmt:v => v == null ? '—' : v.toFixed(2) + '%', dir:'desc', good:'pos' },
    { key:'netMargin',   label:'净利率',     get:c => finVal(c, 'netMargin'),         fmt:v => v == null ? '—' : v.toFixed(2) + '%', dir:'desc', good:'pos' },
    { key:'pe',          label:'PE(动)',     get:c => (c.quote && c.quote.pe != null) ? Number(c.quote.pe) : null, fmt:v => v == null ? '—' : v.toFixed(2), dir:'asc' },
    { key:'tier',        label:'归档',       get:c => c.tier || '',                    fmt:v => v || '—', dir:'asc' },
  ];
  const VAL_SORT_MAP = VAL_SORT_METRICS.reduce((m, x) => (m[x.key] = x, m), {});
  function valSortMetric(key){ return VAL_SORT_MAP[key] || VAL_SORT_MAP.name; }
  /* 按 state.valSortKey / valSortDir 排序；空值恒沉底（与升降序无关，符合直觉） */
  function sortCompanies(list){
    const m = valSortMetric(state.valSortKey);
    const dir = state.valSortDir === 'asc' ? 1 : -1;
    return list.slice().sort((a, b) => {
      const va = m.get(a), vb = m.get(b);
      const ea = (va == null || va === ''), eb = (vb == null || vb === '');
      if(ea && eb) return 0;
      if(ea) return 1;
      if(eb) return -1;
      if(typeof va === 'string' || typeof vb === 'string') return String(va).localeCompare(String(vb)) * dir;
      return (va - vb) * dir;
    });
  }
  /* 排序工具条：指标 chips（当前指标带 ▲▼）+ 视图切换 */
  function valSortBarHTML(){
    return '<div class="sort-bar">' +
      '<span class="sb-label">排序</span>' +
      VAL_SORT_METRICS.map(x => '<button class="chip' + (state.valSortKey === x.key ? ' active' : '') +
        '" data-action="val.sortBy" data-v="' + x.key + '" title="点击按「' + x.label + '」排序，再点切换升/降序">' + x.label +
        (state.valSortKey === x.key ? (state.valSortDir === 'asc' ? ' ▲' : ' ▼') : '') + '</button>').join('') +
      '<span class="sb-sep muted">|</span>' +
      '<button class="chip' + (state.valView === 'rank' ? ' active' : '') + '" data-action="val.toggleView" title="卡片适合逐家看细节，排行榜适合横向粗筛对比">' +
        (state.valView === 'rank' ? '📊 排行榜视图' : '📇 卡片视图') + '</button>' +
      (state.valView === 'rank' ? '<button class="btn ghost sm" data-action="val.exportRank" title="导出当前筛选 + 排序结果为 CSV（含安全边际/距买点/增速/ROE/毛利率），可直接在 Excel 里做粗筛">⬇ 导出对比表</button>' : '') +
      '</div>';
  }
  /* 指标单元格的颜色：安全边际正=绿负=红；距第一买点 ≤0 已到买点(绿) / ≤15 候击(琥珀) / >15 灰 */
  function rankCellCls(key, v){
    if(v == null) return '';
    if(key === 'mos') return v >= 0 ? 'mos-pos' : 'mos-neg';
    if(key === 'gap1') return v <= 0 ? 'mos-pos' : (v <= 15 ? '' : 'muted');
    return '';
  }
  /* 排行榜表格：列 = 横向对比维度，表头可点排序，行可点进详情 */
  function valRankTableHTML(list){
    const cols = [
      { key:'name', label:'公司', cls:'rk-name' },
      { key:'mos', label:'安全边际', num:true },
      { key:'gap1', label:'距第一买点', num:true },
      { key:'tier', label:'归档' },
      { key:'_price', label:'现价', num:true },
      { key:'est', label:'最新估值', num:true },
      { key:'pe', label:'PE(动)', num:true },
      { key:'revenueYoy', label:'营收同比', num:true },
      { key:'dnpYoy', label:'扣非同比', num:true },
      { key:'roe', label:'ROE', num:true },
      { key:'grossMargin', label:'毛利率', num:true },
      { key:'_type', label:'林奇类型' },
    ];
    let h = '<div class="wide-table-wrap"><table class="val-table rank-table"><thead><tr>';
    cols.forEach(col => {
      const sortable = !!VAL_SORT_MAP[col.key];
      const arrow = (sortable && state.valSortKey === col.key) ? (state.valSortDir === 'asc' ? ' ▲' : ' ▼') : '';
      h += '<th class="' + (col.num ? 'num ' : '') + (sortable ? 'rk-sortable' : '') + '"' +
        (sortable ? ' data-action="val.sortBy" data-v="' + col.key + '" title="点击按「' + col.label + '」排序"' : '') + '>' +
        col.label + arrow + '</th>';
    });
    h += '</tr></thead><tbody>';
    list.forEach(c => {
      const lv = latestValOf(c);
      const q = (c.quote && typeof c.quote === 'object') ? c.quote : null;
      const cells = {
        name: '<span class="rk-name-link">' + esc(c.name) + '</span><div class="muted rk-sub">' + esc(c.ticker || '') + (c.sector ? ' · ' + esc(c.sector) : '') + '</div>',
        tier: c.tier ? '<span class="badge ' + (TIER_CLS[c.tier] || 'gray') + '">' + esc(c.tier) + '</span>' : '<span class="muted">—</span>',
        _price: '$',
        est: lv ? '<b style="color:var(--indigo)">' + Number(lv.estimatedValue || 0).toFixed(2) + '</b><div class="muted rk-sub">' + esc(lv.date || '') + '</div>' : '<span class="muted">—</span>',
        _type: c.companyType ? '<span class="badge ' + (LYNCH_TYPE_CLS[c.companyType] || 'gray') + '">' + esc(c.companyType) + '</span>' : '<span class="muted">—</span>',
      };
      h += '<tr data-action="val.openCompany" data-id="' + c.id + '">';
      cols.forEach(col => {
        if(col.key === '_price'){
          h += '<td class="num">' + ((c.currentPrice || 0) > 0 ? Number(c.currentPrice).toFixed(2) : '<span class="muted">—</span>') +
            (q && q.pct != null ? '<div class="rk-sub ' + (q.pct >= 0 ? 'up' : 'down') + '">' + fmtPct(q.pct) + '</div>' : '') + '</td>';
          return;
        }
        if(cells[col.key] != null){ h += '<td class="' + (col.num ? 'num ' : '') + '">' + cells[col.key] + '</td>'; return; }
        const m = valSortMetric(col.key), v = m.get(c);
        const cls = rankCellCls(col.key, v);
        h += '<td class="num ' + cls + '" title="' + esc(m.label) + '">' + (m.fmt ? m.fmt(v) : (v == null ? '—' : esc(v))) + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }
  /* 对比表 CSV：与排行榜同列，供 Excel 粗筛 */
  function valRankCsv(list){
    // 列序与排行榜一致：安全边际 / 距第一买点 紧跟名称，方便在 Excel 里直接看「谁更便宜」
    const head = ['股票代码', '名称', '安全边际%', '距第一买点%', '归档', '现价', '最新估值', '估值日期', 'PE(动)', '营收同比%', '扣非同比%', 'ROE%', '毛利率%'];
    const lines = ['# GoalTracker 估值横向对比表（导出于 ' + dateStr() + '，排序：' + valSortMetric(state.valSortKey).label + (state.valSortDir === 'asc' ? ' 升序' : ' 降序') + '，共 ' + list.length + ' 家）', head.join(',')];
    list.forEach(c => {
      const lv = latestValOf(c);
      const rowVals = {
        name: c.name || '', tier: c.tier || '',
        price: (c.currentPrice || 0) > 0 ? Number(c.currentPrice).toFixed(2) : '',
        est: lv ? Number(lv.estimatedValue || 0).toFixed(2) : '',
        date: lv ? (lv.date || '') : '',
        mos: mosOf(c), gap1: gapToFirstBuy(c),
        pe: (c.quote && c.quote.pe != null) ? Number(c.quote.pe).toFixed(2) : '',
        revenueYoy: finVal(c, 'revenueYoy'), dnpYoy: finVal(c, 'deductedNetProfitYoy'),
        roe: finVal(c, 'roe'), grossMargin: finVal(c, 'grossMargin'),
      };
      const dec = v => (v == null || isNaN(v)) ? '' : Number(v).toFixed(2);
      lines.push([c.ticker || '', rowVals.name, dec(rowVals.mos), dec(rowVals.gap1), rowVals.tier,
        rowVals.price, rowVals.est, rowVals.date, rowVals.pe,
        dec(rowVals.revenueYoy), dec(rowVals.dnpYoy), dec(rowVals.roe), dec(rowVals.grossMargin)].map(csvEscape).join(','));
    });
    return '\ufeff' + lines.join('\r\n');
  }

  /* 当前筛选条件下的公司列表（不含排序）：
   * 渲染与「导出对比表」共用同一份口径，避免两处筛选逻辑漂移。
   * 组筛选 → 归档 → 板块 → 行业 → 林奇类型 → 关键词，各组之间 AND、组内多选 OR。 */
  function filteredCompanies(){
    let list = DB.valuation.companies.slice();
    const selGroup = state.valGroupSel ? groupById(state.valGroupSel) : null;
    if(state.valGroupSel && !selGroup) state.valGroupSel = null;   // 组已被删除
    if(selGroup){ const ids = new Set(groupMembers(selGroup).exist.map(c => c.id)); list = list.filter(c => ids.has(c.id)); }
    if(state.valTiers && state.valTiers.length){
      list = list.filter(c => state.valTiers.some(t => t === TIER_NONE ? !c.tier : c.tier === t));
    }
    if(state.valBoards && state.valBoards.length) list = list.filter(c => state.valBoards.includes(c.board));
    if(state.valIndustries && state.valIndustries.length) list = list.filter(c => state.valIndustries.includes(c.industry));
    // 二/三级行业（申万口径，来自东财 F10）：级联细化到细分行业
    if(state.valIndustriesL2 && state.valIndustriesL2.length) list = list.filter(c => state.valIndustriesL2.includes(c.industryL2));
    if(state.valIndustriesL3 && state.valIndustriesL3.length) list = list.filter(c => state.valIndustriesL3.includes(c.industryL3));
    if(state.valLynchs && state.valLynchs.length) list = list.filter(c => state.valLynchs.includes(c.companyType));
    // 临时代码锁定（来自行业详情「在估值池中查看」）：按 6 位代码精确过滤
    const valLock = state.valLock;
    if(valLock && valLock.codes && valLock.codes.length){
      list = list.filter(c => valLock.codes.some(code => String(c.ticker).indexOf(code) >= 0));
    }
    const kw = String(state.valKw || '').trim().toLowerCase();
    if(kw) list = list.filter(c => kwMatch(c.name, kw) || kwMatch(c.ticker, kw) || kwMatch(c.sector, kw));
    return list;
  }

  function renderValuation(){
    /* 公司详情已迁移至统一详情页（view='company'，modules/company.js），
       本视图只保留公司列表；val.openCompany 统一跳转 #/company?v=… */
    const companies = DB.valuation.companies;
    // 横向对比状态（懒初始化，避免污染 core 的 state 定义）
    // 默认按「安全边际」降序：安全边际最高（最便宜）的排最前，与粗筛流程一致
    state.valSortKey = state.valSortKey || 'mos';
    state.valSortDir = state.valSortDir || (valSortMetric(state.valSortKey).dir || 'asc');
    state.valView = state.valView || 'card';
    // 公司组过滤（与其它筛选叠加）：选中组 = 只看组内公司
    const selGroup = state.valGroupSel ? groupById(state.valGroupSel) : null;
    if(state.valGroupSel && !selGroup) state.valGroupSel = null;   // 组已被删除
    // 关键词（空态文案用） + 筛选（与「导出对比表」共用 filteredCompanies 同一口径）
    const kw = String(state.valKw || '').trim().toLowerCase();
    // 横向排序：filter 之后、渲染之前，只改顺序不改数据
    let list = sortCompanies(filteredCompanies());

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
      '<button class="btn ghost sm" data-action="val.importCompanies" title="导入公司列表 CSV 批量添加公司（兼容估值模块导出的列表格式、财报跟踪导出的筛选结果格式），按股票代码去重">⬆ 导入公司列表</button>' +
      '<button class="btn ghost sm" data-action="val.exportCompanies" title="导出全部公司基础信息为 CSV（股票代码/名称/市场/板块/行业/类型等），可直接作为 fetch_financial.py --from-csv 的输入">⬇ 导出公司列表</button>' +
      '<button class="btn ghost sm" data-action="val.syncIndustry" title="按「财报跟踪」已导入的行业三级分类（申万口径：一级/二级/三级）刷新关注公司的行业字段，适用于早先已存在、尚无细分行业的公司">🏷 同步行业分类</button>' +
      '<button class="btn ghost sm" data-action="val.importPrices" title="导入行情快照 CSV（fetch_prices.py 生成：当前股价_日期.csv），批量更新现价/总股本，并带出涨跌/市盈率(动)/市净率/换手率/成交额/总市值显示在详情页上方">⬆ 导入股价</button>' +
      '<button class="btn ghost sm" data-action="val.importAllCsv" title="批量导入财务数据 CSV，文件名：{股票代码}_{公司名}.csv，可多选。\n这些文件可由 scripts/fetch_financial.py 从东方财富自动抓取生成">⬆ 批量导入财务</button>' +
      '<button class="btn ghost sm" data-action="val.importForecastAll" title="批量导入盈利预测 CSV（文件名：盈利预测_{代码}_{公司名}.csv，可多选；由 scripts/fetch_profit_forecast.py 生成），按代码/名称自动匹配公司">⬆ 批量导入预测</button>' +
      '<button class="btn ghost sm" data-action="val.syncEarn" title="把估值池全部公司的财务数据一键同步到「财报跟踪」：先沉淀到共享财务库（DB.finstats），再投影出财报跟踪表（只投含营收/净利等跟踪指标的季度，已有行只填空缺字段）。同步前自动快照">⇒ 同步财报数据</button>' +
      '<button class="btn ghost sm" data-action="snap.list" title="数据快照与回滚：导入公司/财务/预测/股价前自动快照，可一键恢复到快照时点">📸 快照</button>' +
      '<button class="btn primary" style="background:var(--indigo)" data-action="val.addCompany">＋ 添加公司</button>');

    // —— ⚡ 今日要处理（投资版）：置顶，只汇总"需要动手"的事项 ——
    h += valTodayHTML();

    // —— 导入导出说明 ——
    h += '<div class="import-help">' +
      '<b>📦 数据导入 / 导出</b>' +
      '<span>📈 行情：运行 <code>py scripts/fetch_prices.py</code> 生成 <code>data/prices/当前股价_日期.csv</code>（含现价/涨跌/市盈率(动)/市净率/换手率/成交额/总市值/总股本，按日期存档），「⬆ 导入股价」后详情页上方展示行情快照。</span>' +
      '<span>📊 财务：文件 <code>{股票代码}_{公司名}.csv</code>，如 <code>688256.SH_寒武纪.csv</code>；运行 <code>py scripts/fetch_financial.py --auto</code> 抓取后「⬆ 批量导入财务」。</span>' +
      '<span>📈 盈利预测：文件 <code>盈利预测_{代码}_{公司名}.csv</code>；运行 <code>py scripts/fetch_profit_forecast.py --auto</code> 抓取后「⬆ 批量导入预测」批量导入。</span>' +
      '<span>🆕 新批次公司：「⬆ 导入公司列表」批量添加（支持财报跟踪导出的筛选结果）→ <code>py scripts/fetch_financial.py --from-csv 公司列表.csv</code> 抓财务、<code>py scripts/fetch_profit_forecast.py --from-csv 公司列表.csv</code> 抓预期 → 「⬆ 批量导入财务」。</span>' +
      '</div>';

    h += '<div class="val-summary-grid">';
    h += '<div class="val-stat"><div class="vs-label">关注公司</div><div class="vs-value">' + companies.length + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">持仓市值</div><div class="vs-value">' + fmtMoney(totalMv) + '</div><div class="vs-sub">' + totalPos.toFixed(0) + ' 股</div></div>';
    h += '<div class="val-stat"><div class="vs-label">持仓成本</div><div class="vs-value">' + fmtMoney(totalCost) + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">浮动盈亏</div><div class="vs-value ' + (totalPnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(totalPnl) + '</div><div class="vs-sub ' + (totalPnl >= 0 ? 'up' : 'down') + '">' + fmtPct(totalCost > 0 ? totalPnl/totalCost*100 : 0) + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">已实现盈亏</div><div class="vs-value ' + (totalRealized >= 0 ? 'up' : 'down') + '">' + fmtMoney(totalRealized) + '</div></div>';
    // 三级归档分布：已分档 / 总数 + 各档计数
    const tierCntOf = k => companies.filter(c => c.tier === k).length;
    const tiered = companies.filter(c => c.tier).length;
    h += '<div class="val-stat"><div class="vs-label">三级归档</div><div class="vs-value">' + tiered +
      '<span class="muted" style="font-size:14px;font-weight:600"> / ' + companies.length + '</span></div>' +
      '<div class="vs-sub muted">' + VAL_TIERS.map(t => esc(t.key) + ' ' + tierCntOf(t.key)).join(' · ') + '</div></div>';
    h += '</div>';

    // 公司名称 / 股票代码搜索框：所有筛选项的最上方（先搜后筛，最常用的操作离手最近）
    // 刻意放在空态判断之外的所有筛选 chips 之前 —— 搜不到结果时输入框仍要留在页面上，否则改不了关键词
    h += '<input type="text" class="kw-search" placeholder="🔍 搜索公司名称 / 股票代码…" data-input="val.kw" value="' + esc(state.valKw || '') + '">';

    // 公司组 chips：点击组名 = 只看组内公司；「＋ 组」新建（可携带当前勾选的公司）
    const groups = valGroups();
    h += '<div class="chips" style="margin-bottom:10px">' +
      '<button class="chip ' + (selGroup ? '' : 'active') + '" data-action="val.fGroupClear">🎯 全部公司</button>' +
      groups.map(g => '<button class="chip ' + (selGroup && selGroup.id === g.id ? 'active' : '') + '" data-action="val.fGroup" data-v="' + g.id + '" title="' + esc(g.note || '') + '">🏷 ' + esc(g.name) + '（' + (g.tickers || []).length + '）</button>').join('') +
      '<button class="chip" data-action="val.groupNew" title="把勾选的公司存为新组（未勾选则建空组）">＋ 组</button></div>';
    // 三级归档筛选 chips（多选）：对应"是否参与及参与方式"的决策分档，与公司组正交
    const selTiers = state.valTiers || [];
    h += '<div class="chips" style="margin-bottom:10px">' +
      '<button class="chip ' + (selTiers.length ? '' : 'active') + '" data-action="val.fTierClear">全部归档（' + companies.length + '）</button>' +
      VAL_TIERS.map(t => '<button class="chip ' + (selTiers.includes(t.key) ? 'active' : '') + '" data-action="val.fTier" data-v="' + t.key + '" title="' + esc(t.desc) + '">' + esc(t.key) + '（' + tierCntOf(t.key) + '）</button>').join('') +
      '<button class="chip ' + (selTiers.includes(TIER_NONE) ? 'active' : '') + '" data-action="val.fTier" data-v="' + TIER_NONE + '" title="还未做三级归档的公司，建议尽快分档">未归档（' + (companies.length - tiered) + '）</button></div>';
    // 选中组时显示组操作条：导出该组 CSV / 管理组 / 删除组
    if(selGroup){
      const gm = groupMembers(selGroup);
      h += '<div class="group-bar">' +
        '<div class="gb-info">🏷 <b>' + esc(selGroup.name) + '</b> · 组内 ' + gm.exist.length + ' 家在库' +
        (gm.missing.length ? '，<span style="color:var(--amber)">' + gm.missing.length + ' 家未在列表（' + esc(gm.missing.join('、')) + '）</span>' : '') +
        (selGroup.note ? '<div class="muted" style="margin-top:2px">' + esc(selGroup.note.slice(0, 80) + (selGroup.note.length > 80 ? '…' : '')) + '</div>' : '') + '</div>' +
        '<div class="gb-actions">' +
        '<button class="btn ghost sm" data-action="val.groupExport" data-v="' + selGroup.id + '" title="导出组内公司列表 CSV，格式与「导出公司列表」一致，可直接 py fetch_financial.py / fetch_profit_forecast.py / fetch_prices.py --from-csv 批量抓取分析">📤 导出该组</button>' +
        '<button class="btn ghost sm" data-action="val.groupManage" data-v="' + selGroup.id + '">✎ 管理</button>' +
        '<button class="btn danger-ghost sm" data-action="val.groupDel" data-v="' + selGroup.id + '">🗑 删除组</button></div></div>';
    }

    // 临时代码锁定横幅（来自行业详情「在估值池中查看」）
    const valLockB = state.valLock;
    if(valLockB && valLockB.codes && valLockB.codes.length){
      h += '<div class="chips" style="margin-bottom:10px">' +
        '<span class="chip active" style="cursor:default" title="来自行业详情「在估值池中查看该行业」的临时锁定，按 6 位代码精确匹配">🔒 临时锁定：' + esc(valLockB.label || '该行业') + '（' + valLockB.codes.length + ' 家）</span>' +
        '<button class="chip" data-action="val.lockClear">✕ 清除锁定</button>' +
        '</div>';
    }
    // 板块筛选 chips（多选：点击选中/取消，不选 = 全部）
    const selBoards = state.valBoards || [];
    h += '<div class="chips" style="margin-bottom:10px">' +
      '<button class="chip ' + (selBoards.length ? '' : 'active') + '" data-action="val.fBoardClear">全部（' + companies.length + '）</button>' +
      VAL_BOARD_FILTER.map(b => '<button class="chip ' + (selBoards.includes(b) ? 'active' : '') + '" data-action="val.fBoard" data-v="' + b + '">' + b + '（' + companies.filter(c => c.board === b).length + '）</button>').join('') + '</div>';
    // 行业筛选 chips（多选，按申万一级行业顺序，只显示实际存在的行业）
    const usedIndustries = [...new Set(companies.map(c => c.industry).filter(Boolean))];
    const indList = VAL_INDUSTRIES.filter(i => usedIndustries.includes(i)).concat(
      usedIndustries.filter(i => !VAL_INDUSTRIES.includes(i)));   // 未在标准列表中的行业附加在后面
    const selInd = state.valIndustries || [];
    h += '<div class="chips" style="margin-bottom:16px">' +
      '<button class="chip ' + (selInd.length ? '' : 'active') + '" data-action="val.fIndustryClear">全部（' + companies.length + '）</button>' +
      indList.map(i => '<button class="chip ' + (selInd.includes(i) ? 'active' : '') + '" data-action="val.fIndustry" data-v="' + esc(i) + '">' + i + '（' + companies.filter(c => c.industry === i).length + '）</button>').join('') + '</div>';
    // —— 二/三级行业级联（选中上级后才展开下级，避免一次平铺几百个 chip）——
    const selInd2 = state.valIndustriesL2 || [];
    const selInd3 = state.valIndustriesL3 || [];
    if(selInd.length){
      const scope2 = companies.filter(c => selInd.includes(c.industry));
      const pool2 = [...new Set(scope2.map(c => c.industryL2).filter(Boolean))].sort();
      if(pool2.length){
        h += '<div class="chips chips-sub" style="margin:-8px 0 16px">' +
          '<span class="chips-label">二级</span>' +
          '<button class="chip ' + (selInd2.length ? '' : 'active') + '" data-action="val.fIndustryL2Clear">全部（' + scope2.length + '）</button>' +
          pool2.map(i => '<button class="chip ' + (selInd2.includes(i) ? 'active' : '') + '" data-action="val.fIndustryL2" data-v="' + esc(i) + '">' + esc(i) + '（' + scope2.filter(c => c.industryL2 === i).length + '）</button>').join('') +
          '</div>';
      }
    }
    if(selInd2.length){
      const scope3 = companies.filter(c => selInd2.includes(c.industryL2));
      const pool3 = [...new Set(scope3.map(c => c.industryL3).filter(Boolean))].sort();
      if(pool3.length){
        h += '<div class="chips chips-sub" style="margin:-8px 0 16px">' +
          '<span class="chips-label">三级</span>' +
          '<button class="chip ' + (selInd3.length ? '' : 'active') + '" data-action="val.fIndustryL3Clear">全部（' + scope3.length + '）</button>' +
          pool3.map(i => '<button class="chip ' + (selInd3.includes(i) ? 'active' : '') + '" data-action="val.fIndustryL3" data-v="' + esc(i) + '">' + esc(i) + '（' + scope3.filter(c => c.industryL3 === i).length + '）</button>').join('') +
          '</div>';
      }
    }
    // 林奇公司类型筛选 chips（多选，按 VAL_LYNCH_TYPES 顺序，只显示实际存在的类型）
    const usedLynch = [...new Set(companies.map(c => c.companyType).filter(Boolean))];
    const usedLynchList = VAL_LYNCH_TYPES.map(t => t.key).filter(k => usedLynch.includes(k)).concat(
      usedLynch.filter(k => !VAL_LYNCH_TYPES.some(t => t.key === k)));
    const selLynch = state.valLynchs || [];
    h += '<div class="chips" style="margin-bottom:16px">' +
      '<button class="chip ' + (selLynch.length ? '' : 'active') + '" data-action="val.fLynchClear">全部（' + companies.length + '）</button>' +
      usedLynchList.map(k => {
        const desc = LYNCH_TYPE_DESC[k] ? ' title="' + esc(LYNCH_TYPE_DESC[k]) + '"' : '';
        return '<button class="chip ' + (selLynch.includes(k) ? 'active' : '') + '" data-action="val.fLynch" data-v="' + esc(k) + '"' + desc + '>' + k + '（' + companies.filter(c => c.companyType === k).length + '）</button>';
      }).join('') + '</div>';

    // （搜索框已移至全部筛选项最上方）

    if(!list.length){ h += '<div class="card"><div class="empty">' + (kw ? '没有匹配「' + esc(String(state.valKw||'').trim()) + '」的公司' : '该市场下暂无公司，点击右上角添加') + '</div></div>'; return h; }

    // 排序工具条 + 视图切换（卡片 ↔ 排行榜）
    h += valSortBarHTML();

    // 排行榜视图：横向对比表（表头可点排序，行可点进详情）
    if(state.valView === 'rank'){
      h += valRankTableHTML(list);
      h += '<div class="hint" style="margin-top:8px">点表头可按该列排序，点行进入公司详情；上方筛选（归档 / 板块 / 行业 / 类型 / 搜索）同样作用于本表。切回「📇 卡片视图」可逐家看财务与估值细节。</div>';
      return h;
    }

    const selTickers = new Set(state.valSel || []);
    h += '<div class="company-grid">' + list.map(c => {
      const pos = calcPosition(c.investments || []);
      const mv = pos.position * (c.currentPrice || 0);
      const pnl = mv - pos.cost;
      const pnlPct = pos.cost > 0 ? pnl / pos.cost * 100 : 0;
      const latestVal = (c.valuations || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
      const mos = latestVal ? calcMoS(latestVal.estimatedValue, c.currentPrice || latestVal.actualPrice) : null;
      const marketBadge = { 'A股':'indigo', '港股':'pink', '美股':'green', '其他':'gray' }[c.market || 'A股'] || 'gray';
      // ---- 卡片指标分 3 组展示：实时行情 / 最新财务数据 / 估值数据 ----
      // ① 实时行情：最新股价 + 涨跌（行情快照来自「⬆ 导入股价」），有持仓时附持仓市值/浮盈亏
      const q = (c.quote && typeof c.quote === 'object') ? c.quote : null;
      let quoteStats = '<div class="cc-stat"><span class="label">最新股价</span><span class="val">' + (c.currentPrice||0).toFixed(2) + (c.currency ? ' <span class="muted" style="font-weight:400">' + esc(c.currency) + '</span>' : '') + '</span></div>';
      if(q && (q.pct != null || q.chg != null)){
        const cls = (q.pct || 0) >= 0 ? 'up' : 'down';
        const flag = (q.pct || 0) > 0 ? '▲' : ((q.pct || 0) < 0 ? '▼' : '');
        const chgStr = q.chg != null ? ((q.chg > 0 ? '+' : '') + q.chg.toFixed(2)) : '';
        quoteStats += '<div class="cc-stat"' + (q.date ? ' title="行情快照 ' + esc(q.date) + '"' : '') + '><span class="label">涨跌</span><span class="val ' + cls + '">' + flag + ' ' + chgStr + ' ' + fmtPct(q.pct || 0) + '</span></div>';
      }
      if(q && q.pct5 != null){
        const cls5 = (q.pct5 || 0) >= 0 ? 'up' : 'down';
        const flag5 = (q.pct5 || 0) > 0 ? '▲' : ((q.pct5 || 0) < 0 ? '▼' : '');
        quoteStats += '<div class="cc-stat"><span class="label">5日涨幅</span><span class="val ' + cls5 + '">' + flag5 + ' ' + fmtPct(q.pct5) + '</span></div>';
      }
      // 市盈率(动)/成交额：行情快照带出，有值才显示
      if(q && q.pe != null){
        quoteStats += '<div class="cc-stat"' + (q.pe < 0 ? ' title="亏损"' : '') + '><span class="label">市盈率(动)</span><span class="val">' + q.pe.toFixed(2) + '</span></div>';
      }
      if(q && q.amount != null){
        quoteStats += '<div class="cc-stat"><span class="label">成交额(亿)</span><span class="val">' + q.amount.toFixed(2) + '</span></div>';
      }
      if(pos.position > 0){
        quoteStats += '<div class="cc-stat"><span class="label">持仓市值</span><span class="val">' + fmtMoney(mv) + '</span></div>';
        quoteStats += '<div class="cc-stat"><span class="label">浮盈亏</span><span class="val ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(pnl) + ' (' + fmtPct(pnlPct) + ')</span></div>';
      }
      // ② 最新财务数据（最近季度的关键指标）
      const latestFin = getLatestFin(c);
      let finStats = '';
      if(latestFin){
        finStats = SUMMARY_METRICS.map(sm =>
          '<div class="cc-stat"' + (latestFin.quarter ? ' title="' + esc(latestFin.quarter) + '"' : '') + '><span class="label">' + esc(sm.label) + '</span><span class="val">' + fmtFinValue(latestFin[sm.key], sm.unit) + '</span></div>'
        ).join('');
      }
      // ③ 估值数据：最新估值 + 安全边际
      let valStats = '';
      if(latestVal){
        valStats += '<div class="cc-stat"><span class="label">最新估值</span><span class="val">' + (latestVal.estimatedValue||0).toFixed(2) + ' <span class="method-badge ' + valMethodInfo(latestVal.method).cls + '">' + valMethodInfo(latestVal.method).label + '</span></span></div>';
        if(mos != null) valStats += '<div class="cc-stat"><span class="label">安全边际</span><span class="val ' + (mos >= 0 ? 'mos-pos' : 'mos-neg') + '">' + fmtPct(mos) + '</span></div>';
      }
      const statGroup = (title, inner, extra) => inner
        ? '<div class="cc-group"><div class="cc-group-title">' + title + (extra || '') + '</div><div class="cc-stats">' + inner + '</div></div>'
        : '';
      return '<div class="company-card">' +
        '<div class="cc-head"><div>' +
          '<span class="cc-name" data-action="val.openCompany" data-id="' + c.id + '">' + esc(c.name) + '</span>' +
          ' <span class="badge ' + marketBadge + '">' + esc(c.market||'A股') + '</span>' +
          (c.market === 'A股' && c.board ? ' <span class="badge ' + (BOARD_CLS[c.board]||'gray') + '">' + esc(c.board) + '</span>' : '') +
          (c.industry ? ' <span class="badge ' + (INDUSTRY_CLS[c.industry]||'gray') + '"' +
            (c.industryL2 ? ' title="' + esc(swPath(c.ticker, c)) + '"' : '') +
            '>' + esc(c.industry) + '</span>' : '') +
          (swRest(c.ticker, c) ? ' <span class="badge gray" title="申万行业：' + esc(swPath(c.ticker, c)) + '">' + esc(swRest(c.ticker, c)) + '</span>' : '') +
          (c.companyType ? ' <span class="badge ' + (LYNCH_TYPE_CLS[c.companyType]||'gray') + '" title="' + esc(LYNCH_TYPE_DESC[c.companyType]||'') + '">' + esc(c.companyType) + '</span>' : '') +
          (c.tier ? ' ' + tierBadge(c) : '') + ' ' + ValCore.ratingBadgeHTML(ratingOf(c)) +
          (freshnessBadge(c) ? ' ' + freshnessBadge(c) : '') +
          '<div class="cc-meta">' + esc(c.ticker||'') + (c.sector ? ' · ' + esc(c.sector) : '') + (c.currency ? ' · ' + c.currency : '') + '</div>' +
          (window.CompanyCompletion ? CompanyCompletion.chips(c.ticker) : '') +
        '</div><div class="q-actions">' +
          '<label class="cc-sel" title="勾选后可「存为新组」或「加入已有组」"><input type="checkbox" data-input="val.sel" data-t="' + esc(c.ticker || '') + '"' + (selTickers.has(c.ticker) ? ' checked' : '') + '></label>' +
          (selGroup ? '<button class="icon-btn" title="从公司组「' + esc(selGroup.name) + '」移出" data-action="val.groupRemove" data-v="' + selGroup.id + '" data-t="' + esc(c.ticker || '') + '">➖</button>' : '') +
          '<button class="icon-btn" title="编辑" data-action="val.editCompany" data-id="' + c.id + '">✎</button>' +
          '<button class="icon-btn" title="删除" data-action="val.delCompany" data-id="' + c.id + '">✕</button></div></div>' +
        (statGroup('📈 实时行情', quoteStats) + statGroup('📊 最新财务', finStats, latestFin && latestFin.quarter ? ' <span class="muted" style="font-weight:400">' + esc(latestFin.quarter) + '</span>' : '') + statGroup('💰 估值数据', valStats)) +
      '</div>';
    }).join('') + '</div>';
    // 底部浮动选择条：勾选公司后出现，可存为新组 / 加入已有组（勾选时只轻量更新数字，不重绘列表）
    const selN = (state.valSel || []).length;
    h += '<div class="val-selbar" id="valSelBar"' + (selN ? '' : ' hidden') + '>' +
      '<span class="vsb-count">已选 <b>' + selN + '</b> 家</span>' +
      '<button class="btn primary sm" data-action="val.selSaveGroup" title="把勾选的公司存为一个新组">📦 存为新组</button>' +
      (groups.length ? '<button class="btn ghost sm" data-action="val.selAddTo">➕ 加入已有组</button>' : '') +
      '<button class="btn ghost sm" data-action="val.selClear">取消</button></div>';
    return h;
  }

  /* 从季度字符串解析 Q1~Q4（支持 "2025Q3" / "2025-09" 两种格式），解析失败返回 0 */
  function finQuarterNum(q){
    const s = String(q || '');
    let m = s.match(/Q([1-4])$/i);
    if(m) return +m[1];
    m = s.match(/-(\d{2})$/);
    if(m){ const mo = +m[1]; return (mo >= 1 && mo <= 12) ? Math.ceil(mo/3) : 0; }
    return 0;
  }

  /* ----- 公司详情视图 ----- */
  /* ================= 📄 估值报告（valuations/_index.json · 按公司名匹配） =================
   * 索引由 scripts/ops/build_valuation_index.py 生成（{file,name,date,title} 数组）；
   * 报告正文按需拉取——点「阅读」才请求对应 .md。file:// 打开时浏览器禁止读取，
   * 统一 toast 提示改用 http(s)。 */
  let _rptIdx = null;   // 索引缓存（null = 未加载）
  function rptIndex(){
    if(_rptIdx) return Promise.resolve(_rptIdx);
    return fetch('valuations/_index.json')
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(list => {
        _rptIdx = (Array.isArray(list) ? list : [])
          .slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
        return _rptIdx;
      });
  }
  function rptOpen(name){
    name = String(name || '').trim();
    if(!name) return;
    rptIndex().then(list => {
      const hits = list.filter(x => x.name === name);
      if(!hits.length){ toast('📭 valuations/ 暂无「' + name + '」的估值报告'); return; }
      openModal('📄 估值报告 · ' + esc(name),
        '<div class="metric-help">散落在 valuations/ 的报告按日期倒序归拢；新增/重命名报告后重跑 <code>py scripts/ops/build_valuation_index.py</code> 即可收录。</div>' +
        hits.map(r =>
          '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)">' +
          '<div style="min-width:0"><b>' + esc(r.title && r.title !== '一、数据快照（Step1）' ? r.title : r.file) + '</b>' +
          '<div class="muted" style="font-size:12px">' + esc(String(r.date || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')) + '</div></div>' +
          '<button class="btn ghost sm" style="flex:none" data-action="val.readReport" data-file="' + esc(r.file) + '">📖 阅读</button></div>'
        ).join(''), null, null, true);
    }).catch(() => toast('⚠️ 报告索引不可读：file:// 下浏览器会拦截，请用 http(s) 打开页面（或重跑 py scripts/ops/build_valuation_index.py）'));
  }

  /* ---------- ⚡ 决策要点面板（公司评级之前） ----------
   * 归档 + 估值时效 + 公司描述（可编辑）+ 条件清单（逐条添加、✓/✗ 快速验证）。
   * 单向：只产出 HTML；交互通过 data-action / data-change 回到外层处理器。 */
  function valDecisionHTML(c){
    const fresh = valFreshness(c);
    const conds = c.invalidConds || [];
    const marks = c.condMarks || {};
    const lines = valTriggerLines(valMatrixSummary(c).mean, c);
    const cur = Number(c.currentPrice) || 0;
    const first = lines ? lines.find(l => l.key === 'first').value : null;
    // 现价跌破第一买点 → 提示逐条复核（不是自动止损）
    const broke = cur > 0 && first != null && cur <= first;
    const nOk = conds.filter(x => marks[x] === 'ok').length;
    const nBad = conds.filter(x => marks[x] === 'bad').length;
    const hasNote = c.note && String(c.note).trim();

    let h = '<div class="val-section"><div class="vs-head"><h3>⚡ 决策要点 <span class="muted" style="font-weight:400;font-size:12px">归档 · 时效 · 公司描述 · 条件清单——买之前想清楚，持有之中常复核</span></h3>' +
      '<button class="btn ghost sm" data-action="val.openReports" data-name="' + esc(c.name) + '" title="打开 valuations/ 下该公司的估值报告（按日期倒序）">📄 估值报告</button></div>';

    // 时效 + 归档：芯片式元信息条（时效徽章色随新鲜度；归档选择就地完成，不再挤在标题行）
    const freshCls = fresh.code === 'ok' ? ' good' : (fresh.code === 'none' ? ' warn' : '');
    const freshTxt = fresh.code === 'ok'
      ? '<b class="mos-pos">✓ ' + esc(fresh.date) + '（' + fresh.days + ' 天前）</b>'
      : (fresh.code === 'stale'
        ? '<b class="mos-neg">⚠ ' + esc(fresh.date) + '（已 ' + fresh.days + ' 天，超 ' + VAL_STALE_DAYS + ' 天阈值）</b>'
        : '<b class="mos-neg">尚未录入估值记录</b>');
    h += '<div class="dec-meta">' +
      '<span class="dm-chip' + freshCls + '"><i>🕒</i><span class="lb">估值时效</span>' + freshTxt + '</span>' +
      '<span class="dm-chip"><i>🗄</i><span class="lb">归档</span>' +
        '<select class="val-inline-sel" data-change="val.setTier" data-id="' + c.id + '" title="三级归档（决策分档）：咖啡罐=封存不动 / 观察池=等买点 / 回避=不参与">' +
          '<option value=""' + (!c.tier ? ' selected' : '') + '>未归档</option>' +
          VAL_TIERS.map(t => '<option value="' + esc(t.key) + '"' + (c.tier === t.key ? ' selected' : '') + '>' + esc(t.key) + '</option>').join('') +
        '</select>' +
        (c.tier ? '<span class="muted" style="font-size:11px">' + esc(TIER_DESC[c.tier] || '') + '</span>' : '<span class="muted" style="font-size:11px">咖啡罐 / 观察池 / 回避</span>') +
      '</span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn ghost sm" data-action="val.editCompany" data-id="' + c.id + '">✎ 编辑公司</button>' +
      '</div>';

    // ① 公司描述：干什么 / 凭什么赚钱 / 当前关注逻辑（板块内直接编辑）
    h += '<div class="ind-sub first"><div class="ind-sub-h"><span class="ind-sub-n">①</span><b>公司描述</b>' +
      '<span class="tip">主业与商业模式 · 核心竞争优势 · 当前关注逻辑</span></div>' +
      '<div style="display:flex;gap:10px;align-items:flex-start">' +
        (hasNote
          ? '<div class="md" style="flex:1;min-width:0">' + md(c.note) + '</div>'
          : '<div class="muted" style="flex:1;font-size:12.5px;line-height:1.7">尚未填写。建议记录：① 主业与商业模式（靠什么赚钱）② 核心竞争优势（真护城河）③ 当前为什么关注它。</div>') +
        '<button class="btn ghost sm" style="flex:none" data-action="val.editNote" data-id="' + c.id + '">' + (hasNote ? '✎ 编辑' : '＋ 填写') + '</button>' +
      '</div></div>';

    // ② 条件清单：逐条添加，✓=复核通过/担忧解除，✗=条件触发/证伪信号，↺=清除标记
    h += '<div class="ind-sub"><div class="ind-sub-h"><span class="ind-sub-n">②</span><b>条件清单（失效条件 / 验证项）</b>' +
      '<span class="tip">把「什么情况下我的逻辑错了」拆成一条条可验证的句子</span></div>';
    if(broke) h += '<div class="ind-note warn" style="margin-top:0">现价已跌破第一买点（' + (first == null ? '' : '第一买点 ' + Number(first).toFixed(2)) + '）——请逐条复核下方条件，但复核 ≠ 自动止损。</div>';
    if(nBad) h += '<div class="ind-note warn" style="margin-top:0">⛔ 已有 <b>' + nBad + '</b> 条条件被标记「失效」——证伪信号出现，按纪律执行（撤单 / 止损 / 评级降级），触发即降，不打商量。</div>';
    if(conds.length){
      h += '<div class="cond-list">' + conds.map((x, i) => {
        const st = marks[x] || '';
        return '<div class="cond-row' + (st ? ' st-' + st : '') + '">' +
          '<span class="cond-st">' + (st === 'ok' ? '✓ 成立' : (st === 'bad' ? '✗ 失效' : '？ 未验证')) + '</span>' +
          '<span class="cond-tx">' + esc(x) + '</span>' +
          '<span class="cond-ops">' +
            '<button class="icon-btn' + (st === 'ok' ? ' on-ok' : '') + '" title="标记：复核通过 / 担忧解除" data-action="val.condMark" data-id="' + c.id + '" data-i="' + i + '" data-v="ok">✓</button>' +
            '<button class="icon-btn' + (st === 'bad' ? ' on-bad' : '') + '" title="标记：条件触发 / 证伪信号" data-action="val.condMark" data-id="' + c.id + '" data-i="' + i + '" data-v="bad">✗</button>' +
            (st ? '<button class="icon-btn" title="清除标记（回到未验证）" data-action="val.condMark" data-id="' + c.id + '" data-i="' + i + '" data-v="">↺</button>' : '') +
            '<button class="icon-btn" title="删除该条" data-action="val.condDel" data-id="' + c.id + '" data-i="' + i + '">🗑</button>' +
          '</span></div>';
      }).join('') + '</div>';
      h += '<div class="ind-note' + (nBad ? ' warn' : (nOk === conds.length ? ' good' : '')) + '" style="display:flex;gap:18px;flex-wrap:wrap;align-items:center;margin-top:10px">验证进度：共 <b>' + conds.length + '</b> 条' +
        '<span>✓ 成立 <b>' + nOk + '</b></span><span>✗ 失效 <b>' + nBad + '</b></span><span>？ 未验证 <b>' + (conds.length - nOk - nBad) + '</b></span>' +
        (nBad ? '<span style="font-weight:600">——存在失效信号，按纪律执行</span>' : (nOk === conds.length ? '<span style="font-weight:600">——全部成立，逻辑有效</span>' : '')) +
        '</div>';
    } else {
      h += '<div class="muted" style="font-size:12px;margin-top:2px">还没有条件。示例：Q3 经营现金流未回补 / 在手订单增速转负 / 存储涨价红利退坡。</div>';
    }
    h += '<div style="display:flex;gap:8px;margin-top:8px;align-items:flex-start">' +
      '<textarea class="val-inline" rows="1" style="flex:1;text-align:left;resize:none;line-height:1.6;min-height:34px;overflow:hidden" placeholder="新增条件（可一次粘贴多行 / 中文分号分隔，点「＋ 添加」自动拆分逐条加入；Ctrl+Enter 快捷提交）" data-cond-add="' + c.id + '" oninput="this.style.height=\'auto\';this.style.height=(this.scrollHeight+2)+\'px\'" onkeydown="if(event.ctrlKey&&event.key===\'Enter\'){event.preventDefault();var b=this.parentElement.querySelector(\'[data-action]\');if(b)b.click();}"></textarea>' +
      '<button class="btn ghost sm" style="flex:none" data-action="val.condAdd" data-id="' + c.id + '">＋ 添加</button></div>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  function renderCompanyDetail(c){
    const pos = calcPosition(c.investments || []);
    const mv = pos.position * (c.currentPrice || 0);
    const pnl = mv - pos.cost;
    const pnlPct = pos.cost > 0 ? pnl / pos.cost * 100 : 0;

    let h = '<span class="back-link" data-action="val.back">← ' + (window.CompanyPage ? CompanyPage.backLabel() : '返回公司列表') + '</span>';
    h += '<div class="page-head"><div><h1>' + esc(c.name) + (c.market === 'A股' && c.board ? ' <span class="badge ' + (BOARD_CLS[c.board]||'gray') + '">' + esc(c.board) + '</span>' : '') + (c.industry ? ' <span class="badge ' + (INDUSTRY_CLS[c.industry]||'gray') + '"' + (c.industryL2 ? ' title="' + esc(swPath(c.ticker, c)) + '"' : '') + '>' + esc(c.industry) + (c.industryL3 || c.industryL2 ? '·' + esc(c.industryL3 || c.industryL2) : '') + '</span>' : '') + (c.companyType ? ' <span class="badge ' + (LYNCH_TYPE_CLS[c.companyType]||'gray') + '" title="' + esc(LYNCH_TYPE_DESC[c.companyType]||'') + '">' + esc(c.companyType) + '</span>' : '') + (c.tier ? ' ' + tierBadge(c) : '') + ' ' + ValCore.ratingBadgeHTML(ratingOf(c)) + '</h1><div class="muted">' + esc(c.ticker||'') + ' · ' + esc(c.market||'') + (c.market === 'A股' && c.board ? ' · ' + esc(c.board) : '') + (c.industry ? ' · ' + esc(swPath(c.ticker, c)) : '') + (c.companyType ? ' · ' + esc(c.companyType) : '') + ' · ' + esc(c.sector||'') + (c.currency ? ' · ' + c.currency : '') + '</div>' +
      (window.CompanyCompletion ? CompanyCompletion.chips(c.ticker) : '') + '</div></div>' +
      '<div class="head-actions"><button class="btn ghost sm" data-action="val.addGroup" data-id="' + c.id + '" title="把该公司加入某个公司组，或新建组">🏷 公司组</button>' +
        (window.SwingLink && SwingLink.findByTicker(c.ticker)
          ? '<button class="btn ghost sm" data-action="swing.openFromVal" data-ticker="' + esc(c.ticker || '') + '" title="该公司已在待击球台账，点击跳转并展开对应条目">⚾ 到待击球</button>'
          : '<button class="btn ghost sm" data-action="swing.addFromVal" data-ticker="' + esc(c.ticker || '') + '" data-name="' + esc(c.name || '') + '" title="带出代码/名称，加入待击球台账">🎯 加入待击球</button>') +
      '<button class="btn ghost sm" data-action="val.editCompany" data-id="' + c.id + '">✎ 编辑</button>' +
      '<button class="btn danger-ghost sm" data-action="val.delCompany" data-id="' + c.id + '">🗑 删除</button></div></div>';

    h += '<div class="val-summary-grid">';
    // 行情快照（⬆ 导入股价 CSV 时带出：涨跌/市盈率(动)/市净率/换手率/成交/市值）
    const q = (c.quote && typeof c.quote === 'object') ? c.quote : null;
    let priceSub = '';
    if(q && (q.pct != null || q.chg != null)){
      const cls = (q.pct || 0) >= 0 ? 'up' : 'down';
      const flag = (q.pct || 0) > 0 ? '▲' : ((q.pct || 0) < 0 ? '▼' : '');
      const chgStr = q.chg != null ? ((q.chg > 0 ? '+' : '') + q.chg.toFixed(2)) : '';
      priceSub = '<div class="vs-sub ' + cls + '">' + flag + ' ' + chgStr + ' ' + fmtPct(q.pct || 0) + (q.date ? ' · ' + esc(q.date) : '') + '</div>';
    }
    h += '<div class="val-stat"><div class="vs-label">当前股价</div><div class="vs-value">' + (c.currentPrice||0).toFixed(2) + '</div>' +
      priceSub +
      '<input type="number" step="0.01" class="price-input" data-change="val.price" data-id="' + c.id + '" value="' + (c.currentPrice||'') + '" placeholder="更新现价"></div>';
    // 总市值 = 当前股价 × 总股本（亿股）；有行情快照时优先用东财行情总市值（更准）
    const totalShares = Number(c.totalShares) || 0;
    const qMktcap = q && Number(q.mktcap) > 0 ? Number(q.mktcap) : null;
    const totalMvVal = qMktcap != null ? qMktcap : (totalShares > 0 ? (c.currentPrice || 0) * totalShares : null);
    // 总股本显示：去掉无意义的尾随 0（如 4.2100 → 4.21，4.0000 → 4）
    const sharesStr = totalShares > 0 ? String(parseFloat(totalShares.toFixed(4))) : '';
    h += '<div class="val-stat"><div class="vs-label">总市值</div><div class="vs-value">' + (totalMvVal == null ? '<span class="muted">—</span>' : fmtMoney(totalMvVal)) + '</div>' +
      '<div class="vs-sub muted">总股本 ' + (totalShares > 0 ? sharesStr + ' 亿股' : '未填') + (qMktcap != null ? ' · 行情快照' : '') + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">总股本（亿股）</div><div class="vs-value">' + (totalShares > 0 ? sharesStr : '<span class="muted">—</span>') + '</div>' +
      '<input type="number" step="0.0001" class="price-input" data-change="val.totalShares" data-id="' + c.id + '" value="' + (totalShares > 0 ? sharesStr : '') + '" placeholder="如：4.21"></div>';
    // 行情快照指标卡（有值才显示）：5日涨幅 / 市盈率(动) / 市净率 / 换手率 / 成交额 / 成交量
    if(q){
      const p5Cls = (q.pct5 || 0) >= 0 ? 'up' : 'down';
      const mpCls = (q.monthPct || 0) >= 0 ? 'up' : 'down';
      [['5日涨幅', q.pct5 != null ? ((q.pct5 > 0 ? '+' : '') + q.pct5.toFixed(2) + '%') : null, q.pct5 != null ? '<div class="vs-sub ' + p5Cls + '">近 5 个交易日累计</div>' : ''],
       ['本月涨幅', q.monthPct != null ? ((q.monthPct > 0 ? '+' : '') + q.monthPct.toFixed(2) + '%') : null, q.monthPct != null ? '<div class="vs-sub ' + mpCls + '">本月累计（月K口径）</div>' : ''],
       ['市盈率(动)', q.pe != null ? q.pe.toFixed(2) : null, q.pe != null && q.pe < 0 ? '（亏损）' : ''],
       ['市净率', q.pb != null ? q.pb.toFixed(2) : null, ''],
       ['换手率', q.turnover != null ? q.turnover.toFixed(2) + '%' : null, ''],
       ['成交额(亿)', q.amount != null ? fmtMoney(q.amount) : null, ''],
       ['成交量(手)', q.volume != null ? q.volume.toFixed(0) : null, ''],
      ].forEach(cd => {
        if(cd[1] == null) return;
        const sub = cd[2] ? (cd[2].indexOf('<div') === 0 ? cd[2] : '<div class="vs-sub muted">' + cd[2] + '</div>') : '';
        h += '<div class="val-stat"><div class="vs-label">' + cd[0] + '</div><div class="vs-value">' + cd[1] + '</div>' + sub + '</div>';
      });
    }
    if(pos.position > 0){
      h += '<div class="val-stat"><div class="vs-label">持仓</div><div class="vs-value">' + pos.position.toFixed(0) + ' 股</div><div class="vs-sub">均成本 ' + pos.avgCost.toFixed(2) + '</div></div>';
      h += '<div class="val-stat"><div class="vs-label">市值</div><div class="vs-value">' + fmtMoney(mv) + '</div></div>';
      h += '<div class="val-stat"><div class="vs-label">浮动盈亏</div><div class="vs-value ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(pnl) + '</div><div class="vs-sub ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtPct(pnlPct) + '</div></div>';
      if(pos.realized !== 0) h += '<div class="val-stat"><div class="vs-label">已实现盈亏</div><div class="vs-value ' + (pos.realized >= 0 ? 'up' : 'down') + '">' + fmtMoney(pos.realized) + '</div></div>';
    }
    h += '</div>';

    const fins = (c.financials||[]).slice().sort((a,b) => state.valFinSort === 'asc'
      ? (a.quarter||'').localeCompare(b.quarter||'')
      : (b.quarter||'').localeCompare(a.quarter||''));
    h += '<div class="val-section"><div class="vs-head"><h3>📋 分季度财务数据 <span class="muted" style="font-weight:400;font-size:12px">共 ' + fins.length + ' 个季度 · 行底色按 Q1→Q4 渐深，同色行即同比可比季度</span></h3><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
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
      h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr><th>季度</th>';
      displayMetrics.forEach(mi => {
        // 表头保留单位后缀（总资产(亿)、ROE(%)…），数据单元格里不再重复带单位
        h += '<th class="num" title="' + esc(mi.desc||mi.label) + '">' + esc(mi.label) +
          (mi.unit ? ' <span class="unit">(' + mi.unit + ')</span>' : '') +
          (mi.source === 'formula' || mi.source === 'auto' || mi.source === 'custom' ? ' 📐' : '') + '</th>';
      });
      h += '<th>备注</th><th></th></tr></thead><tbody>';
      fins.forEach(f => {
        const qn = finQuarterNum(f.quarter);
        h += '<tr' + (qn ? ' class="fin-q' + qn + '"' : '') + '><td><b>' + esc(f.quarter) + '</b></td>';
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

    // ============ 估值矩阵 + 触发线（由带情景标注的估值记录汇总，对齐《估值五步法》Step2→Step4）============
    h += valMatrixHTML(c);
    h += valTriggerHTML(c);

    h += '<div class="val-section"><div class="vs-head"><h3>💰 估值记录 <span class="muted" style="font-weight:400;font-size:12px">标注「情景」后自动进入上方矩阵</span></h3><button class="btn primary sm" style="background:var(--indigo)" data-action="val.addVal" data-id="' + c.id + '">＋ 添加估值</button></div>';
    const vals = (c.valuations||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
    if(!vals.length) h += '<div class="empty">还没有估值记录</div>';
    else {
      h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
        '<th>日期</th><th>方法</th><th>情景</th><th>参数</th><th class="num">估算价值</th><th class="num">实际股价</th><th class="num">安全边际</th><th>备注</th><th></th>' +
        '</tr></thead><tbody>';
      h += vals.map(v => {
        const mi = valMethodInfo(v.method);
        const mos = calcMoS(v.estimatedValue, v.actualPrice);
        const mosCls = mos == null ? '' : (mos >= 0 ? 'mos-pos' : 'mos-neg');
        return '<tr data-val-row="' + v.id + '">' +
          '<td>' + esc(v.date||'') + (v.year ? '<div class="muted" style="font-size:11px">' + esc(v.year) + '</div>' : '') + '</td>' +
          '<td><span class="method-badge ' + mi.cls + '">' + mi.label + '</span></td>' +
          '<td><select class="val-inline-sel" data-change="val.setScenario" data-id="' + c.id + '" data-vid="' + v.id + '" title="标注业绩情景（保守/中性/乐观），标注后进入上方矩阵">' +
            '<option value=""' + (!v.scenario ? ' selected' : '') + '>未标注</option>' +
            VAL_SCENARIOS.map(s => '<option value="' + s + '"' + (v.scenario === s ? ' selected' : '') + '>' + s + '</option>').join('') +
          '</select></td>' +
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
      h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
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

    // ============ ⚡ 决策要点（归档 / 时效 / 公司描述 / 条件清单）——位于公司评级之前 ============
    h += valDecisionHTML(c);

    /* ----- 🏛 公司评级（S/A/B/C/D）：四维打分 → 自动评级（可手动覆盖），联动击球区/仓位/止损 ----- */
    h += valRatingHTML(c);

    /* ----- 公司研究模块（按日期归档的研究记录时间线：每次研究/调研/点评各记一条） ----- */
    const rlogs = (c.researchLog || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
    h += '<div class="val-section"><div class="vs-head"><h3>🔬 公司研究 <span class="muted" style="font-weight:400;font-size:12px">按日期归档：每次研究 / 调研 / 财报点评各记一条，累积成研究时间线</span></h3>' +
      '<button class="btn primary sm" style="background:var(--indigo)" data-action="val.addResearch" data-id="' + c.id + '">＋ 添加记录</button></div>';
    if(rlogs.length){
      h += '<div class="rl-list">' + rlogs.map(g =>
        '<div class="rl-item"><div class="rl-head">' +
          (g.date ? '<span class="rl-date">📅 ' + esc(g.date) + '</span>' : '<span class="rl-date none">早期记录 · 未注明日期</span>') +
          '<span style="flex:1"></span>' +
          '<button class="icon-btn" data-action="val.editResearch" data-id="' + c.id + '" data-rid="' + g.id + '" title="编辑该条记录">✎</button>' +
          '<button class="icon-btn" data-action="val.delResearch" data-id="' + c.id + '" data-rid="' + g.id + '" title="删除该条记录">🗑</button>' +
        '</div><div class="md">' + md(g.text) + '</div></div>'
      ).join('') + '</div>';
    } else {
      h += '<div class="empty">还没有研究记录 · 点击右上角「＋ 添加记录」按日期记录你的业务判断、关注重点、关键影响因素等</div>';
    }
    h += '</div>';
    return h;
  }

  function n2(v){
    if(v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if(isNaN(n)) return esc(String(v));
    return Math.abs(n) < 100 ? n.toFixed(2) : n.toFixed(1);
  }
  function num(v){
    if(v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
  }



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
    db.quotes = db.quotes || {};   // 全站行情快照（代码 → 现价/涨幅/本月涨幅…），财报跟踪/行业研究共用
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
      // 行业字段缺失时优先用全市场分类地图回填（申万口径，与行业研究模块同源；仅补缺不覆盖）
      if(typeof swMapIdx === 'function'){
        const c6 = (String(c.ticker || '').match(/(\d{6})/) || [])[1];
        const mr = c6 ? swMapIdx(db)[c6] : null;
        if(mr){
          if(!c.industry && mr.sw1) c.industry = mr.sw1;
          if(!c.industryL2 && mr.sw2) c.industryL2 = mr.sw2;
          if(!c.industryL3 && mr.sw3) c.industryL3 = mr.sw3;
        }
      }
      // 旧数据无 companyType 字段：按 ticker 从映射表回填林奇公司类型
      if(!c.companyType && c.ticker && COMPANY_LYNCH_TYPE[c.ticker]) c.companyType = COMPANY_LYNCH_TYPE[c.ticker];
      // 旧数据无 research 字段，初始化为空串（避免显示 undefined）
      if(c.research === undefined || c.research === null) c.research = '';
      // 研究记录改为按日期归档（researchLog[]）：旧的单条 research 字符串迁移为一条「未注明日期」记录，只补不覆盖
      if(!Array.isArray(c.researchLog)){
        c.researchLog = [];
        if(c.research && String(c.research).trim()) c.researchLog.push({ id:uid(), date:'', text:String(c.research) });
      }
      // 旧数据无 totalShares 字段，初始化为 0（用户可手动填入真实总股本）
      if(c.totalShares === undefined || c.totalShares === null) c.totalShares = 0;
      // 旧数据无 invalidConds 字段（决策要点的条件清单），初始化为空数组
      if(!Array.isArray(c.invalidConds)) c.invalidConds = [];
      // 条件验证标记（{条件文本: 'ok'|'bad'}）：按文本索引，条件删除时同步清除
      if(!c.condMarks || typeof c.condMarks !== 'object' || Array.isArray(c.condMarks)) c.condMarks = {};
      // 旧数据无 tier 字段（三级归档：咖啡罐/观察池/回避），初始化为空串（未分档）
      if(c.tier === undefined || c.tier === null) c.tier = '';
      // 旧数据无 valuations 数组（个别历史条目），兜底为空数组避免读取报错
      if(!Array.isArray(c.valuations)) c.valuations = [];
      // 估值记录补齐 scenario / year 字段（提前初始化，避免显示 undefined）
      c.valuations.forEach(v => {
        if(v.scenario === undefined || v.scenario === null) v.scenario = '';
        if(v.year === undefined || v.year === null) v.year = '';
        // 存量迁移：旧流程把情景写在备注里（如「浪潮-中性-PE」），仅当 scenario 为空
        // 且备注唯一命中一个情景词时才回填，避免误判（如「中性偏乐观」多个命中则跳过）
        if(!v.scenario && v.note){
          const hits = VAL_SCENARIOS.filter(s => String(v.note).indexOf(s) >= 0);
          if(hits.length === 1) v.scenario = hits[0];
        }
      });
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

  /* ----- 扩展装配：val-forecast.js / val-io.js（先于本文件加载，经 VAL_PLUGINS 注入） -----
   * 从本文件拆出的盈利预测与 CSV 导入导出实现：build(K) 从内核 K 取常量/工具，
   * 返回的函数在此绑定回本地作用域——原有渲染/操作调用点零改动。 */
  const VALX = {};
  (window.VAL_PLUGINS || []).forEach(fn => Object.assign(VALX, fn({
    METRICS, customMetrics, VAL_MARKETS, VAL_BOARDS, VAL_LYNCH_TYPES, VAL_SCENARIOS,
    COMPANY_INDUSTRY, COMPANY_LYNCH_TYPE, inferBoard, num, n2,
  }, VALX)));
  const { hasForecast, renderForecastSection, forecastToCsv, csvToForecast, importForecastFiles,
    financialsToCsv, csvEscape, companiesToCsv, downloadCsv, parseCsvSimple,
    importCsvFiles, importCompaniesCsv, importPriceFiles,
    valFinModalBody, valInvModalBody, customMetricsModalBody,
    valGroups, groupById, groupMembers, openGroupNewModal } = VALX;

  /* ================= 模块注册 ================= */
  Register.module({
    view: 'valuation',
    nav: { ico:'📈', label:'公司估值', group:'投资追踪' },
    seed: seed,
    ensure: ensure,
    render: renderValuation,
    actions: {
      /* ----- 公司组 ----- */
      'val.fGroup': el => { state.valGroupSel = el.dataset.v; state.valSel = []; render(); },
      'val.fGroupClear': () => { state.valGroupSel = null; render(); },
      'val.groupNew': () => openGroupNewModal(),
      'val.selSaveGroup': () => openGroupNewModal(),
      'val.selClear': () => { state.valSel = []; render(); },
      'val.selAddTo': () => {
        const sel = state.valSel || [];
        const gs = valGroups();
        if(!gs.length){ alert('还没有公司组，请先「＋ 组」新建一个'); return; }
        openModal('把已选 ' + sel.length + ' 家公司加入公司组',
          '<div class="field"><label>选择组</label><select name="gid">' +
          gs.map(g => '<option value="' + g.id + '">' + esc(g.name) + '（' + (g.tickers || []).length + '）</option>').join('') + '</select></div>' +
          '<input type="hidden" name="tickers" value="' + esc(sel.join(',')) + '">', 'val.groupJoin');
      },
      'val.groupExport': el => {
        const g = groupById(el.dataset.v); if(!g) return;
        const gm = groupMembers(g);
        if(!gm.exist.length){ alert('组内没有已导入的公司，无法导出。\n未导入的代码：' + (gm.missing.join('、') || '无')); return; }
        downloadCsv('公司组_' + g.name + '_' + dateStr() + '.csv',
          companiesToCsv(gm.exist, '公司组「' + g.name + '」 · ' + gm.exist.length + ' 家'));
      },
      'val.groupManage': el => {
        const g = groupById(el.dataset.v); if(!g) return;
        const gm = groupMembers(g);
        openModal('管理公司组 · ' + g.name,
          '<div class="field"><label>组名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required value="' + esc(g.name) + '"></div>' +
          mdField('note', '组备注（关注逻辑等，支持 Markdown）', g.note || '', 3) +
          '<input type="hidden" name="id" value="' + g.id + '">' +
          '<div class="muted" style="font-size:12px">组内 ' + gm.exist.length + ' 家在库' +
          (gm.missing.length ? '，' + gm.missing.length + ' 家未在列表：' + esc(gm.missing.join('、')) : '') +
          '。添加成员：勾选公司卡片 → 浮动条「➕ 加入已有组」；移除成员：点组名过滤后用卡片上的 ➖ 按钮。</div>',
          'val.saveGroupEdit');
      },
      'val.groupDel': el => {
        const g = groupById(el.dataset.v); if(!g) return;
        if(!confirm('删除公司组「' + g.name + '」？\n只删除分组，不影响公司本身。')) return;
        DB.valuation.groups = valGroups().filter(x => x.id !== g.id);
        if(state.valGroupSel === g.id) state.valGroupSel = null;
        closeModal(); save(); render();
      },
      'val.groupRemove': el => {
        const g = groupById(el.dataset.v); if(!g) return;
        const t = el.dataset.t; if(!t) return;
        g.tickers = (g.tickers || []).filter(x => String(x).trim().toUpperCase() !== String(t).trim().toUpperCase());
        save(); render();
      },
      'val.addGroup': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const gs = valGroups();
        openModal('公司组 · ' + c.name,
          (gs.length ? '<div class="field"><label>加入已有组</label><select name="gid"><option value="">（不加入）</option>' +
            gs.map(g => '<option value="' + g.id + '">' + esc(g.name) + '（' + (g.tickers || []).length + '）</option>').join('') + '</select></div>' : '') +
          '<div class="field"><label>或新建组（填组名）</label><input type="text" name="newname" placeholder="如：AI算力；留空则不新建"></div>' +
          '<input type="hidden" name="ticker" value="' + esc(c.ticker || '') + '">', 'val.detailGroupJoin');
      },
      'val.fBoard': el => {
        // 多选：点击选中，再次点击取消
        const v = el.dataset.v;
        const set = new Set(state.valBoards || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.valBoards = [...set];
        render();
      },
      'val.fBoardClear': () => { state.valBoards = []; render(); },
      'val.fIndustry': el => {
        const v = el.dataset.v;
        const set = new Set(state.valIndustries || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.valIndustries = [...set];
        state.valIndustriesL2 = [];   // 一级变化时重置下级，保持级联一致
        state.valIndustriesL3 = [];
        render();
      },
      'val.fIndustryClear': () => { state.valIndustries = []; state.valIndustriesL2 = []; state.valIndustriesL3 = []; render(); },
      'val.lockClear': () => { state.valLock = null; render(); },
      'val.fIndustryL2': el => {
        const v = el.dataset.v;
        const set = new Set(state.valIndustriesL2 || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.valIndustriesL2 = [...set];
        state.valIndustriesL3 = [];
        render();
      },
      'val.fIndustryL2Clear': () => { state.valIndustriesL2 = []; state.valIndustriesL3 = []; render(); },
      'val.fIndustryL3': el => {
        const v = el.dataset.v;
        const set = new Set(state.valIndustriesL3 || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.valIndustriesL3 = [...set];
        render();
      },
      'val.fIndustryL3Clear': () => { state.valIndustriesL3 = []; render(); },
      // —— 按「财报跟踪」导入的行业三级分类刷新公司行业字段（存量公司补全细分行业）——
      'val.syncIndustry': () => {
        const rows = DB.earnings.rows || [];
        if(!rows.length){ toast('⚠️ 财报跟踪还没有数据：先到「财报跟踪」导入财报 CSV'); return; }
        const byTicker = {};
        rows.forEach(r => { const t = String(r['股票代码'] || '').trim().toUpperCase(); if(t) byTicker[t] = r; });
        let n = 0;
        DB.valuation.companies.forEach(c => {
          const r = byTicker[String(c.ticker || '').trim().toUpperCase()];
          if(!r) return;
          let ch = false;
          const ni = r['行业'], n2 = r['行业二级'], n3 = r['行业三级'];
          if(ni && c.industry !== ni){ c.industry = ni; ch = true; }
          if(n2 && c.industryL2 !== n2){ c.industryL2 = n2; ch = true; }
          if(n3 && c.industryL3 !== n3){ c.industryL3 = n3; ch = true; }
          if(ch) n++;
        });
        if(n) save();
        render();
        toast(n ? '✅ 已按财报数据刷新 ' + n + ' 家公司的行业分类' : 'ℹ️ 行业分类已是最新，无需更新');
      },
      'val.fLynch': el => {
        const v = el.dataset.v;
        const set = new Set(state.valLynchs || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.valLynchs = [...set];
        render();
      },
      'val.fLynchClear': () => { state.valLynchs = []; render(); },
      /* 三级归档筛选（多选）：__none__ = 未归档 */
      'val.fTier': el => {
        const v = el.dataset.v;
        const set = new Set(state.valTiers || []);
        set.has(v) ? set.delete(v) : set.add(v);
        state.valTiers = [...set];
        render();
      },
      'val.fTierClear': () => { state.valTiers = []; render(); },
      /* 「今日要处理」的一键直达：直接切到该档筛选（替换而非切换） */
      'val.fTierOnly': el => {
        state.valTiers = el.dataset.v ? [el.dataset.v] : [];
        state.valGroupSel = null;
        render();
        window.scrollTo(0, 0);
      },
      'val.back': () => {
        /* 详情页可能位于统一详情视图（company）或旧入口（valuation 视图内），视图感知回退 */
        if(state.view === 'company' && window.CompanyPage){ CompanyPage.back(); return; }
        state.valCompanyId = null; render();
      },
      'val.openCompany': el => {
        /* 统一详情页入口：所有板块共用 #/company?v=…，点击公司名自动跳转 */
        if(window.CompanyPage){ CompanyPage.open({ valId: el.dataset.id }, state.view); return; }
        state.valCompanyId = el.dataset.id; render(); window.scrollTo(0,0);
      },
      'val.addCompany': () => openModal('添加关注公司',
        '<div class="quick-row"><div class="field" style="flex:1"><label>公司名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required placeholder="如：寒武纪"></div>' +
        '<div class="field" style="flex:none;width:160px"><label>代码</label><input type="text" name="ticker" placeholder="如：00700.HK"></div></div>' +
        '<div class="quick-row"><div class="field" style="flex:1"><label>市场</label><select name="market" data-board-toggle>' + VAL_MARKETS.map(m => '<option>' + m + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1;min-width:140px" data-board-field><label>A 股板块</label><select name="board">' + VAL_BOARDS.map(b => '<option value="' + esc(b.key) + '">' + esc(b.label) + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1"><label>行业分类</label><select name="industry"><option value="">（未指定）</option>' + VAL_INDUSTRIES.map(i => '<option>' + i + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1"><label>林奇公司类型</label><select name="companyType"><option value="">（未指定）</option>' + VAL_LYNCH_TYPES.map(t => '<option value="' + esc(t.key) + '" title="' + esc(t.desc) + '">' + t.key + '</option>').join('') + '</select></div>' +
        '<div class="field" style="flex:1"><label>行业 / 细分</label><input type="text" name="sector" placeholder="如：光模块"></div>' +
        '<div class="field" style="flex:none;width:130px"><label>三级归档</label><select name="tier" title="决策分档：咖啡罐=封存不动 / 观察池=等买点 / 回避=不参与"><option value="">（未分档）</option>' + VAL_TIERS.map(t => '<option value="' + esc(t.key) + '" title="' + esc(t.desc) + '">' + esc(t.key) + '</option>').join('') + '</select></div>' +
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
          '<div class="field" style="flex:none;width:130px"><label>三级归档</label><select name="tier" title="决策分档：咖啡罐=封存不动 / 观察池=等买点 / 回避=不参与"><option value="">（未分档）</option>' + VAL_TIERS.map(t => '<option value="' + esc(t.key) + '"' + (c.tier === t.key ? ' selected' : '') + ' title="' + esc(t.desc) + '">' + esc(t.key) + '</option>').join('') + '</select></div>' +
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
          /* 在统一详情页删除当前公司 → 回到来源列表；否则原地重渲染 */
          if(state.view === 'company' && window.CompanyPage &&
             state.companyRef && state.companyRef.valId === c.id){
            CompanyPage.back(); save(); return;
          }
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
      'val.importAllCsv': () => {
        importCsvFiles(DB.valuation.companies);
      },
      'val.importForecastAll': () => {
        importForecastFiles();
      },
      'val.exportCompanies': () => {
        if(!DB.valuation.companies.length){ alert('还没有公司数据'); return; }
        downloadCsv('公司列表_' + dateStr() + '.csv', companiesToCsv());
      },
      /* 横向排序：点当前指标切升/降序，点其它指标则换指标并取该指标的「顺眼方向」 */
      'val.sortBy': el => {
        const key = el.dataset.v;
        if(!VAL_SORT_MAP[key]) return;
        if(state.valSortKey === key) state.valSortDir = state.valSortDir === 'asc' ? 'desc' : 'asc';
        else { state.valSortKey = key; state.valSortDir = valSortMetric(key).dir || 'desc'; }
        render();
      },
      /* 卡片视图 ↔ 排行榜视图 */
      'val.toggleView': () => {
        state.valView = state.valView === 'rank' ? 'card' : 'rank';
        render();
      },
      /* 导出当前筛选 + 排序结果为对比表 CSV（供 Excel 粗筛） */
      'val.exportRank': () => {
        const list = sortCompanies(filteredCompanies());
        if(!list.length){ alert('当前筛选条件下没有公司'); return; }
        downloadCsv('估值对比表_' + dateStr() + '.csv', valRankCsv(list));
      },
      'val.importCompanies': () => {
        importCompaniesCsv();
      },
      'val.importPrices': () => {
        importPriceFiles();
      },
      /* 一键互转：估值池全部 financials → 共享财务库 → 财报跟踪表 */
      'val.syncEarn': () => {
        if(!(window.FinStats)) return;
        const cs = DB.valuation.companies || [];
        if(!cs.length){ toast('⚠️ 估值池为空，先添加公司'); return; }
        if(window.Snapshots){
          Snapshots.capture('valuation', DB.valuation, '估值同步到财报跟踪前');
          Snapshots.capture('earnings', DB.earnings, '估值同步到财报跟踪前');
        }
        const res = FinStats.transferToEarnings();
        save(); render();
        toast('✅ 已同步到财报跟踪：新增 ' + res.added + ' 家/季 · 更新 ' + res.updated + ' · 不变 ' + res.unchanged);
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
        // 先定位被删条目（共享财务库回收判断用），再删除
        const removed = el.dataset.fid
          ? c.financials.find(x => x.id === el.dataset.fid)
          : c.financials.find(x => x.quarter === el.dataset.fquarter);
        // 优先按 id 删除；若无 id（历史/异常数据），按季度兜底删除
        if(el.dataset.fid){
          c.financials = c.financials.filter(x => x.id !== el.dataset.fid);
        } else if(el.dataset.fquarter){
          c.financials = c.financials.filter(x => x.quarter !== el.dataset.fquarter);
        }
        // 共享财务库同步回收（该报告期若无财报跟踪数据背书则一并删除，避免互转时复活）
        if(window.FinStats && removed) FinStats.onValuationDelete(c, removed);
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
      /* 触发线 → 待击球台账：写入 买点区间/中枢/减持区/失效条件（已有条目原地更新，不改其状态） */
      'val.pushToSwing': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        if(!window.SwingLink || !window.SwingLink.applyPlan){ toast('⚠️ 待击球模块未加载，请刷新后重试'); return; }
        if(!c.ticker){ toast('⚠️ 该公司缺少股票代码，无法写入台账'); return; }
        const lines = valTriggerLines(valMatrixSummary(c).mean, c);
        if(!lines){ toast('⚠️ 至少需要一条「中性」情景的估值记录'); return; }
        // 失效条件文本域可能仍在去抖窗口内，先从 DOM 取最新值落库，保证写入台账的是最新内容
        const valOf = k => { const x = lines.find(l => l.key === k); return x ? round2(x.value) : null; };
        // 评级适配：已评级（非 D）→ 买点区间 = 评级击球区 [中性×宽容度下沿, 中性×上沿]；
        // 未评级沿用 深度买点 ~ 第一买点。D 禁入：写入仅作观察参考，待击球模块会拦截击球。
        const p = ratingParams(c);
        const plan = p ? {
          buyLow: valOf('first'), buyHigh: round2(valOf('hold') * p.tol[1]), hub: valOf('hold'),
          trimZone: valOf('trim'), invalidConds: (c.invalidConds || []).slice(),
        } : {
          buyLow: valOf('deep'), buyHigh: valOf('first'), hub: valOf('hold'),
          trimZone: valOf('trim'), invalidConds: (c.invalidConds || []).slice(),
        };
        const r = window.SwingLink.applyPlan(c.ticker, c.name, plan);
        save(); render();
        if(!r || !r.ok){ toast('⚠️ 写入失败：' + ((r && r.msg) || '未知原因')); return; }
        toast((r.isNew ? '✅ 已新建待击球标的并写入触发线' : '✅ 已更新「' + (r.name || c.name) + '」的触发线') +
          (p ? '（评级 ' + p.g + ' 击球区 ×' + p.tol[0] + '–' + p.tol[1] + '）' : '') +
          '（' + ((c.invalidConds || []).length ? '含 ' + c.invalidConds.length + ' 条失效条件' : '失效条件为空，记得补') + '）');
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
      'val.addResearch': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        openModal('添加研究记录 · ' + c.name,
          '<div class="metric-help">每次研究 / 调研 / 财报点评各记一条，按日期归档成研究时间线。支持 Markdown 语法（标题、列表、引用、代码块等），可点击「预览」实时查看效果。</div>' +
          '<div class="field"><label>日期</label><input type="date" name="rdate" value="' + dateStr() + '"></div>' +
          mdField('research', '研究内容', '', 14) +
          '<input type="hidden" name="cid" value="' + c.id + '"><input type="hidden" name="rid" value="">',
          'val.saveResearch');
      },
      'val.editResearch': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const g = findById(c.researchLog || [], el.dataset.rid); if(!g) return;
        openModal('编辑研究记录 · ' + c.name + (g.date ? '（' + g.date + '）' : ''),
          '<div class="metric-help">支持 Markdown 语法（标题、列表、引用、代码块等），可点击「预览」实时查看效果。</div>' +
          '<div class="field"><label>日期</label><input type="date" name="rdate" value="' + esc(g.date || '') + '"></div>' +
          mdField('research', '研究内容', g.text || '', 14) +
          '<input type="hidden" name="cid" value="' + c.id + '"><input type="hidden" name="rid" value="' + g.id + '">',
          'val.saveResearch');
      },
      'val.delResearch': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const g = findById(c.researchLog || [], el.dataset.rid); if(!g) return;
        if(confirm('删除该条研究记录' + (g.date ? '（' + g.date + '）' : '') + '？删除后不可恢复。')){
          c.researchLog = c.researchLog.filter(x => x.id !== g.id);
          save(); render();
        }
      },
      /* ----- 决策要点 · 条件清单：逐条添加 / 删除 / ✓✗ 快速验证 ----- */
      'val.condAdd': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const inp = document.querySelector('textarea[data-cond-add="' + c.id + '"],input[data-cond-add="' + c.id + '"]'); if(!inp) return;
        const add = String(inp.value || '').split(/\r?\n|；|;/).map(s => s.trim()).filter(Boolean);
        if(!add.length){ toast('请先输入条件内容'); return; }
        c.invalidConds = c.invalidConds || [];
        let n = 0;
        add.forEach(x => { if(c.invalidConds.indexOf(x) < 0){ c.invalidConds.push(x); n++; } });
        if(n < add.length) toast((add.length - n) + ' 条重复已跳过');
        inp.value = '';
        inp.style.height = 'auto';
        save(); render();
      },
      'val.condDel': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const i = parseInt(el.dataset.i, 10);
        const arr = c.invalidConds || [];
        if(!(i >= 0 && i < arr.length)) return;
        if(confirm('删除条件「' + arr[i] + '」？')){
          if(c.condMarks) delete c.condMarks[arr[i]];
          arr.splice(i, 1);
          save(); render();
        }
      },
      'val.condMark': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const i = parseInt(el.dataset.i, 10);
        const arr = c.invalidConds || [];
        if(!(i >= 0 && i < arr.length)) return;
        c.condMarks = c.condMarks || {};
        const v = el.dataset.v || '';
        if(v) c.condMarks[arr[i]] = v; else delete c.condMarks[arr[i]];
        save(); render();
        if(v === 'bad') toast('⛔ 已标记失效：' + arr[i] + '（证伪信号，按纪律执行）');
      },
      /* ----- 决策要点 · 估值报告：索引匹配 + 按需读正文 ----- */
      'val.openReports': el => rptOpen(el.dataset.name),
      'val.readReport': el => {
        const f = String(el.dataset.file || ''); if(!f) return;
        fetch('valuations/' + f)
          .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then(t => openModal('📄 ' + esc(f.replace(/_估值报告_\d{8}\.md$/, '')),
            '<div class="md">' + md(t) + '</div>', null, null, true))
          .catch(() => toast('⚠️ 报告读取失败：file:// 下浏览器禁止读取本地文件，请用 http(s) 打开页面'));
      },
      /* ----- 决策要点 · 公司描述：板块内直接编辑 ----- */
      'val.editNote': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        openModal('公司描述 · ' + c.name,
          '<div class="metric-help">主业与商业模式 · 核心竞争优势 · 当前关注逻辑。支持 Markdown 语法（标题、列表、引用、代码块等），可点击「预览」实时查看效果。</div>' +
          mdField('note', '公司描述', c.note || '', 10) +
          '<input type="hidden" name="cid" value="' + c.id + '">', 'val.saveNote');
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
      // 估值记录行内标注情景：写入后重渲染，让「估值矩阵 / 触发线」立即重算
      'val.setScenario': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const v = findById(c.valuations, el.dataset.vid); if(!v) return;
        v.scenario = VAL_SCENARIOS.indexOf(el.value) >= 0 ? el.value : '';
        save(); render();
      },
      /* ----- 🏛 公司评级：打分 / 门控 / 手动覆盖 / 自动评级（即改即存，触发线与仓位联动） ----- */
      'val.setRatingScore': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const r = ensureRating(c);
        const v = el.value === '' ? null : parseInt(el.value, 10);
        if(v == null || v < 0 || v > 4) delete r.scores[el.dataset.dim]; else r.scores[el.dataset.dim] = v;
        r.updated = dateStr();
        save(); render();
      },
      'val.setRatingFlag': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const r = ensureRating(c);
        r.flags[el.dataset.flag] = !!el.checked;
        // 戒律即时钳制：OCF 背离 → A≤2；一致预期 ≥90% 看多 → E≤2
        if(el.dataset.flag === 'ocfDiverge' && el.checked && (r.scores.A || 0) > 2) r.scores.A = 2;
        if(el.dataset.flag === 'consensusHot' && el.checked && (r.scores.E || 0) > 2) r.scores.E = 2;
        r.updated = dateStr();
        save(); render();
      },
      'val.setRatingGrade': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const r = ensureRating(c);
        r.grade = ValCore.RATING_LEVELS.some(x => x.g === el.value) ? el.value : '';
        r.updated = dateStr();
        save(); render();
        toast(r.grade ? '🏛 评级 → ' + r.grade + ' 级（触发线宽容度与仓位上限已联动）' : '评级已清空（未评级，触发线回退默认口径）');
      },
      'val.setRatingNote': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const r = ensureRating(c);
        r.note = String(el.value || '').trim();
        r.updated = dateStr();
        save();
      },
      'val.ratingAuto': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        const r = ensureRating(c);
        const g = ValCore.ratingAutoGrade(r.scores, r.flags);
        r.grade = g.grade;
        r.autoSum = g.sum;
        r.updated = dateStr();
        save(); render();
        toast('🏛 自动评级：' + g.grade + ' 级（' + g.sum + '/16 分' + (g.notes.length ? ' · ' + g.notes.join('；') : '') + '）');
      },
      /* 三级归档：详情页「⚡ 决策要点」下拉即时切换 */
      'val.setTier': el => {
        const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
        c.tier = VAL_TIERS.some(t => t.key === el.value) ? el.value : '';
        save(); render();
        toast(c.tier ? '🏷 已归档为「' + c.tier + '」' : '已清除归档');
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
        // PE/PS 快捷推导：填了预期净利润/营收（亿）→ 自动重算 EPS/每股营收写回 baseValue，并同步行内输入框
        if((v.method === 'PE' && key === 'profitYi') || (v.method === 'PS' && key === 'revenueYi')){
          const derived = deriveBaseValue(v.method, v.params, c.totalShares);
          if(derived != null){
            v.params.baseValue = derived;
            const row = el.closest('tr');
            const bi = row && row.querySelector('.vp-input[data-key="baseValue"]');
            if(bi && document.activeElement !== bi) bi.value = derived;
          }
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
      // 公司组多选框：只更新状态与浮动条数字，不重绘列表（避免 checkbox 状态丢失与闪烁）
      'val.sel': el => {
        const t = el.dataset.t; if(!t) return;
        const set = new Set(state.valSel || []);
        el.checked ? set.add(t) : set.delete(t);
        state.valSel = [...set];
        const bar = document.getElementById('valSelBar');
        if(bar){
          bar.hidden = !state.valSel.length;
          const cnt = bar.querySelector('.vsb-count');
          if(cnt) cnt.innerHTML = '已选 <b>' + state.valSel.length + '</b> 家';
        }
      },
      // 公司列表搜索框：renderKeep 保持输入框焦点与光标位置；
      // 120ms 去抖合并连续击键，减少每键全量重绘带来的闪烁
      'val.kw': (function(){
        let t = 0;
        return function(el){ state.valKw = el.value; clearTimeout(t); t = setTimeout(function(){ renderKeep('val.kw'); }, 120); };
      })(),
    },
    forms: {
      /* ----- 公司组 ----- */
      'val.saveGroup': fd => {
        const name = String(fd.get('name') || '').trim();
        if(!name){ alert('请填写组名称'); return; }
        const tickers = String(fd.get('tickers') || '').split(',').map(s => s.trim()).filter(Boolean);
        valGroups().push({ id: uid(), name: name, note: String(fd.get('note') || ''), tickers: tickers, createdAt: dateStr() });
        state.valSel = [];
        closeModal(); save(); render();
        alert('公司组「' + name + '」已创建' + (tickers.length ? '（含 ' + tickers.length + ' 家公司）' : '（空组）') +
          '。点组名可只看组内公司；「📤 导出该组」生成 CSV，可直接 py fetch_financial.py / fetch_profit_forecast.py --from-csv 批量抓取财务与盈利预测。');
      },
      'val.saveGroupEdit': fd => {
        const g = groupById(fd.get('id')); if(!g) return;
        const name = String(fd.get('name') || '').trim();
        if(!name){ alert('请填写组名称'); return; }
        g.name = name; g.note = String(fd.get('note') || '');
        closeModal(); save(); render();
      },
      'val.groupJoin': fd => {
        const g = groupById(fd.get('gid')); if(!g){ alert('请选择公司组'); return; }
        const tickers = String(fd.get('tickers') || '').split(',').map(s => s.trim()).filter(Boolean);
        const set = new Set((g.tickers || []));
        let added = 0;
        tickers.forEach(t => {
          const k = String(t).toUpperCase();
          if(![...set].some(x => String(x).toUpperCase() === k)){ set.add(t); added++; }
        });
        g.tickers = [...set];
        state.valSel = [];
        closeModal(); save(); render();
        if(added) alert('已把 ' + added + ' 家公司加入组「' + g.name + '」（重复的自动跳过）');
      },
      'val.detailGroupJoin': fd => {
        const ticker = String(fd.get('ticker') || '').trim();
        const gid = String(fd.get('gid') || '');
        const newname = String(fd.get('newname') || '').trim();
        if(!ticker || (!gid && !newname)){ closeModal(); return; }
        if(newname && valGroups().some(g => g.name === newname)){ alert('已存在同名组「' + newname + '」，请换一个名字'); return; }
        let msg = '';
        if(gid){
          const g = groupById(gid);
          if(g){
            if(!(g.tickers || []).some(t => String(t).trim().toUpperCase() === ticker.toUpperCase())){
              g.tickers.push(ticker);
              const cc = DB.valuation.companies.find(x => String(x.ticker || '').trim().toUpperCase() === ticker.toUpperCase());
              msg = '已把「' + (cc ? cc.name : ticker) + '」加入组「' + g.name + '」';
            } else msg = '该公司已在组「' + g.name + '」中';
          }
        }
        if(newname){
          valGroups().push({ id: uid(), name: newname, note: '', tickers: [ticker], createdAt: dateStr() });
          msg = (msg ? msg + '；' : '') + '新组「' + newname + '」已创建并加入';
        }
        save(); render();
        if(msg) alert(msg);
      },
      'val.saveCompany': fd => {
        const id = fd.get('id');
        const market = fd.get('market') || 'A股';
        // 板块只对 A 股有意义：港/美/其他 一律置空
        let board = market === 'A股' ? (fd.get('board') || '') : '';
        let industry = fd.get('industry') || '';
        let sector = fd.get('sector') || '';
        // L0 静态字典自动带出（仅新增时；只补空字段、不覆盖用户已填）：
        // 板块 ← bd，行业分类 ← sw1（需在预设列表内），行业/细分 ← sw3 || em
        if(!id && market === 'A股'){
          const c6 = (String(fd.get('ticker') || '').match(/(\d{6})/) || [])[1];
          const s = (c6 && typeof Repo !== 'undefined' && Repo.stock) ? Repo.stock(c6) : null;
          if(s){
            if(!board && s.bd && VAL_BOARDS.some(b => b.key === s.bd)) board = s.bd;
            if(!industry && s.sw1 && VAL_INDUSTRIES.includes(s.sw1)) industry = s.sw1;
            if(!sector) sector = s.sw3 || s.em || '';
          }
        }
        const data = { name:fd.get('name'), ticker:fd.get('ticker')||'', market, board,
          industry, companyType:fd.get('companyType')||'', tier:fd.get('tier')||'',
          sector, currency:fd.get('currency')||'CNY', currentPrice:parseFloat(fd.get('currentPrice'))||0, totalShares:parseFloat(fd.get('totalShares'))||0, note:fd.get('note')||'' };
        if(id){ Object.assign(findById(DB.valuation.companies, id), data); }
        else DB.valuation.companies.push(Object.assign({ id:uid(), financials:[], valuations:[], investments:[], research:'' }, data));
        save(); closeModal(); render();
      },
      'val.saveResearch': fd => {
        const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
        c.researchLog = c.researchLog || [];
        const rid = fd.get('rid');
        const text = fd.get('research') || '';
        const rdate = fd.get('rdate') || '';
        if(rid){
          const g = findById(c.researchLog, rid);
          if(g){ g.date = rdate; g.text = text; }
        } else if(String(text).trim()){
          c.researchLog.push({ id:uid(), date:rdate, text:text });
        }
        save(); closeModal(); render();
      },
      'val.saveNote': fd => {
        const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
        c.note = fd.get('note') || '';
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
        if(fid){
          const oldF = findById(c.financials, fid);
          // quarter 改名时先回收共享财务库旧行（无 earnings 背书才删），再镜像新值
          if(window.FinStats && oldF && oldF.quarter !== data.quarter) FinStats.onValuationDelete(c, oldF);
          if(oldF) Object.assign(oldF, data);
        }
        else c.financials.push(Object.assign({ id:uid() }, data));
        // 镜像写入共享财务库：手动编辑/新增的财务数据同样沉淀到 DB.finstats
        if(window.FinStats) FinStats.ingestValuation(c, [data]);
        save(); closeModal(); render();
      },
      'val.saveVal': fd => {
        const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
        const vid = fd.get('id');
        const method = fd.get('method');
        const params = {};
        valMethodInfo(method).fields.forEach(f => { params[f.key] = parseFloat(fd.get('param_' + f.key)) || 0; });
        // PE/PS 快捷推导兜底：以预期净利润/营收自动重算 baseValue（recalc 已实时回写，此处防边缘未同步）
        const derived = deriveBaseValue(method, params, c.totalShares);
        if(derived != null) params.baseValue = derived;
        const estimatedValue = calcValuation(method, params);
        const actualPrice = parseFloat(fd.get('actualPrice')) || 0;
        const scenario = VAL_SCENARIOS.indexOf(fd.get('scenario')) >= 0 ? fd.get('scenario') : '';
        const data = { date:fd.get('date')||dateStr(), method, params, estimatedValue, actualPrice,
          scenario, year:String(fd.get('year') || '').trim(), note:fd.get('note')||'' };
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
  window.ValHelpers = { calcPosition, fmtMoney, fmtPct, calcMoS, calcValuation, valMethodInfo, metricInfo, fmtMetric, evalFormula, customMetrics, valMatrixSummary, valTriggerLines, valFreshness, latestValDate, daysUntil, VAL_TIERS,
    // 横向对比（排序 / 排行榜 / 导出）——导出供测试直接断言，避免只能"看界面"
    latestValOf, mosOf, gapToFirstBuy, valSortMetric, VAL_SORT_METRICS, sortCompanies, filteredCompanies, valRankCsv,
    // 公司评级（S/A/B/C/D）：跨模块徽章与仓位权限
    ratingOf, ratingParams, ratingBadgeByCode, ratingCapByTicker };

  // 统一公司详情页渲染器（modules/company.js）：估值池公司复用完整详情板块
  window.ValCompanyDetail = renderCompanyDetail;
})();
