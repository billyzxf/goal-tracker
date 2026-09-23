/* ================= 宏观经济（macro）· A股宏观雷达 =================
 * 目的：沿「传导链」分层跟踪可能影响 A 股行情的宏观经济指标：
 *   海外利率/美元 → 全球流动性 → 人民币汇率 → 中国货币政策
 *   → 国内信用/流动性 → 经济基本面 → 企业盈利 → A股估值 → 风格与行业
 *
 * 五层体系（LAYERS）：
 *   global_liq 全球流动性（每日）——美债/美元/Fed/大宗
 *   cn_liq     中国流动性（每日/每月）——资金利率/信用/货币
 *   cn_econ    中国经济周期（每月）——PMI/工业/消费/出口/地产
 *   price      价格周期（每月）——CPI/PPI 四象限
 *   market     市场自身（每日/每周）——成交/两融/估值/股债收益差
 *   industry   行业高频（每日/每周）——DRAM/运价/制冷剂等板块高频数据（L2 行业温度计的数据源）
 *
 * 数据模型（存在 DB.macro）：
 *   groups: [ { id, key, name, indicators: [...] } ]   // CSV 表（保留，导入导出单位）
 *   indicator: { id, key, name, unit, freq, desc, category, updated, points:[{date,value}],
 *                layer,        // 所属层级 key
 *                importance,   // 'S' | 'A' | 'B'
 *                direction,    // 'up_good' | 'down_good' | null（对温度计的方向）
 *                scoreLayer,   // 'liquidity' | 'growth' | 'valuation' | null
 *                interpret }   // 解读提示（怎么读这个指标）
 *   fedwatch: [ { id, meeting:'2026-09', cut, hold, hike, updated,
 *                 prev:{cut,hold,hike,updated} } ]       // FOMC 利率概率 + 上次快照（边际变化）
 *   scores: { liquidity, growth, valuation }             // 温度计人工修正（-25~+25）
 *   pools: [ { id, key, name, icon, desc, fixed, falsify,        // L1/L2 温度计池
 *              items:[{ id, label, ref, unit, dir, green, yellow,
 *                       falsify, action, note }] } ]
 *     // ref: 'ind:<指标key>'（引用 DB.macro 指标）或 'fedwatch'（取最新会议加息概率）
 *     // dir: 'above' 值≥green绿/≥yellow黄/否则红；'below' 值≤green绿/≤yellow黄/否则红；
 *     //      'up' 环比↑绿 / 'down' 环比↓绿（价格类高频指标用环比，不设绝对阈值）
 *
 * 三温度计 + Regime：流动性/经济/估值三个 0-100 分（自动环比投票 + 人工修正），
 *   再派生两组 Regime：盈利×估值四象限、流动性×经济四状态。
 * L1/L2 温度计：阈值红黄绿灯体系（独立于环比投票温度计）——
 *   L1 宏观温度计（天气层，5-6 项核心指标）影响全部持仓；
 *   L2 行业温度计（季节层，行业池 × 2-5 指标）决定板块轮动；每项绑阈值 + 证伪线 + 触发动作。
 *
 * 兼容：旧结构（扁平 indicators / 无 layer 元数据）由 ensure() 自动迁移。
 */
(function(){
  const GROUPS = [
    { key:'domestic', name:'国内宏观经济' },
    { key:'global',   name:'国际宏观经济' },
  ];
  const CAT_TO_GROUP = { '海外与利率':'global' };   // 其余分类默认归入 domestic
  const FREQS = ['日度','周度','月度','季度','年度'];
  const CATS = ['国内经济', '物价通胀', '货币与金融', '海外与利率', '就业与民生', '行业跟踪'];

  /* ===== 六层体系 ===== */
  const LAYERS = [
    { key:'global_liq', name:'第一层 · 全球流动性', icon:'🌍', tag:'每日 ★★★★★',
      desc:'全球的钱贵不贵？——美债利率是A股定价的外部锚，美元决定新兴市场流动性。' },
    { key:'cn_liq', name:'第二层 · 中国流动性', icon:'🏦', tag:'每日/每月 ★★★★★',
      desc:'国内的钱松不松？——资金利率看松紧，社融/M1 看信用扩张与资金活化。' },
    { key:'cn_econ', name:'第三层 · 中国经济周期', icon:'🏭', tag:'每月 ★★★★★',
      desc:'经济强不强？——PMI 比 GDP 快，新订单比生产更接近需求，地产是信用之母。' },
    { key:'price', name:'第四层 · 价格周期', icon:'🌡️', tag:'每月 ★★★★',
      desc:'企业定价能力怎么样？——PPI 对 A 股盈利尤其重要，CPI×PPI 组合看通缩风险。' },
    { key:'market', name:'第五层 · 市场自身', icon:'📊', tag:'每日/每周 ★★★★★',
      desc:'钱最终有没有进入股票？——成交、两融看情绪，估值分位与股债收益差看位置。' },
    { key:'industry', name:'第六层 · 行业高频', icon:'🧩', tag:'每日/每周 ★★★',
      desc:'板块景气的高频代理变量——DRAM 现货价、运价指数、制冷剂价格、云厂商 CapEx 等，为 L2 行业温度计提供数据源。' },
  ];
  // 每日速览（S级 · 日度频率）：每日 5 分钟只看这些
  const DAILY_KEYS = ['us2y','us10y','real10y','dxy','usdcny','oil','gold','copper','turnover'];
  // 旧指标 key → 元数据映射（迁移用）
  const KEY_META = {
    gdp:    { layer:'cn_econ', importance:'A' },
    pmi:    { layer:'cn_econ', importance:'S', direction:'up_good',   scoreLayer:'growth' },
    cpi:    { layer:'price',   importance:'A', direction:'up_good',   scoreLayer:'growth' },
    ppi:    { layer:'price',   importance:'S', direction:'up_good',   scoreLayer:'growth' },
    lpr1y:  { layer:'cn_liq',  importance:'A', direction:'down_good', scoreLayer:'liquidity' },
    lpr5y:  { layer:'cn_liq',  importance:'A', direction:'down_good', scoreLayer:'liquidity' },
    m2:     { layer:'cn_liq',  importance:'A', direction:'up_good',   scoreLayer:'liquidity' },
    unemp:  { layer:'cn_econ', importance:'B' },
    fed:    { layer:'global_liq', importance:'S', direction:'down_good', scoreLayer:'liquidity' },
    us10y:  { layer:'global_liq', importance:'S', direction:'down_good', scoreLayer:'liquidity' },
    // 估值层：PE 环比上行=估值扩张（偏多），下行=估值收缩（偏空），与 Regime 四象限口径一致
    hs300pe:  { layer:'market', importance:'S', direction:'up_good', scoreLayer:'valuation' },
    csi500pe: { layer:'market', importance:'A', direction:'up_good', scoreLayer:'valuation' },
    allape:   { layer:'market', importance:'A', direction:'up_good', scoreLayer:'valuation' },
    // 补充参考指标（已接入自动抓取，用于替代拿不到的分项数据）
    elec:      { layer:'cn_econ', importance:'A', direction:'up_good', scoreLayer:'growth' },
    czsr:      { layer:'cn_econ', importance:'B', direction:'up_good', scoreLayer:'growth' },
    boom:      { layer:'cn_econ', importance:'B', direction:'up_good', scoreLayer:'growth' },
    newcredit: { layer:'cn_liq',  importance:'A', direction:'up_good', scoreLayer:'growth' },
    commprice: { layer:'price',   importance:'A', direction:'up_good', scoreLayer:'growth' },
  };
  // 日期筛选范围（所有指标共用同一套按钮）。key 存 state.macroRange
  const MACRO_RANGES = [
    { key:'1y', label:'近1年' },
    { key:'3y', label:'近3年' },
    { key:'5y', label:'近5年' },
    { key:'10y', label:'近10年' },
    { key:'all', label:'全部' },
  ];
  // 按 state.macroRange 过滤数据点（date 形如 '2026Q1' / '2026-07' / '2026'）
  function filterByRange(points){
    const range = state.macroRange || '5y';
    const cutoff = macroRangeCutoff(range);
    if(cutoff === null) return points || [];
    return (points || []).filter(p => {
      const n = numDate(p.date);
      return n != null && n >= cutoff;
    });
  }
  // 返回筛选起点的"数值日期"（YYYY*100 + MM），'all' 返回 null（不过滤）
  function macroRangeCutoff(key){
    if(key === 'all') return null;
    const now = new Date();
    const years = { '1y':1, '3y':3, '5y':5, '10y':10 }[key];
    if(!years) return 0;
    const y0 = now.getFullYear() - years;
    return y0 * 100 + (now.getMonth() + 1);
  }
  // '2026Q1' → 202601；'2026-07' → 202607；'2026-08-29' → 202608；'2026' → 202600
  function numDate(s){
    const q = String(s).match(/^(\d{4})Q([1-4])$/);
    if(q) return +q[1] * 100 + (+q[2] - 1) * 3 + 1;
    const m = String(s).match(/^(\d{4})-(\d{2})/);
    if(m) return +m[1] * 100 + +m[2];
    const y = String(s).match(/^(\d{4})$/);
    if(y) return +y[1] * 100 + 1;
    return null;
  }

  function seed(){
    // mk(key, 名称, 分类, 单位, 频率, 层级, 重要性, 方向, 温度计, 说明, 数据点)
    const mk = (key, name, category, unit, freq, layer, importance, direction, scoreLayer, desc, points) =>
      ({ id:uid(), key, name, category, unit, freq, layer, importance, direction, scoreLayer,
         interpret:'', updated:dateStr(), points:(points||[]).map(p => ({date:p[0], value:p[1]})) });
    const groups = GROUPS.map(g => ({ id:uid(), key:g.key, name:g.name, indicators:[] }));
    const put = (key, name, category, unit, freq, layer, importance, direction, scoreLayer, desc, points) => {
      const g = groups.find(x => x.key === (CAT_TO_GROUP[category] || 'domestic'));
      if(g) g.indicators.push(mk(key, name, category, unit, freq, layer, importance, direction, scoreLayer, desc, points));
    };

    /* ===== 第一层 · 全球流动性 ===== */
    put('us2y', '美债 2Y 收益率', '海外与利率', '%', '日度', 'global_liq', 'S', 'down_good', 'liquidity',
      '2Y ≈ 市场对未来 Fed 政策路径的定价。上行 = 市场交易"更高更久"。', null);
    put('us10y', '美债 10Y 收益率', '海外与利率', '%', '日度', 'global_liq', 'S', 'down_good', 'liquidity',
      '全球资产定价之锚：股票价值 ≈ 未来现金流/折现率。10Y↑ 压制成长股估值。注意：10Y↓ 若因衰退，A股未必涨——先问"为什么跌"。',
      [['2023-06',3.81],['2023-12',3.88],['2024-06',4.36],['2024-12',4.57],['2025-06',4.28],['2025-12',4.20],['2026-03',4.10],['2026-06',4.05],['2026-07',4.12],['2026-08',4.18]]);
    put('real10y', '10Y TIPS 实际利率', '海外与利率', '%', '日度', 'global_liq', 'S', 'down_good', 'liquidity',
      '名义10Y = 实际利率 + 通胀预期。实际利率↑ 对成长股最不友好；实际利率↓+通胀预期↑ 反而利好黄金/资源。',
      [['2024-06',2.20],['2024-12',2.25],['2025-06',2.05],['2025-12',1.95],['2026-03',1.90],['2026-06',1.88],['2026-07',1.92],['2026-08',1.96]]);
    put('dxy', '美元指数 DXY', '海外与利率', '', '日度', 'global_liq', 'S', 'down_good', 'liquidity',
      '美元↑ = 全球美元流动性收紧，新兴市场资产承压，人民币贬值压力↑，约束央行宽松空间。',
      [['2024-06',104.5],['2024-12',108.0],['2025-06',97.5],['2025-12',99.0],['2026-03',98.2],['2026-06',97.8],['2026-07',98.5],['2026-08',99.2]]);
    put('oil', '原油（布伦特）', '海外与利率', '美元', '日度', 'global_liq', 'A', null, null,
      '油价↑ → 通胀预期↑ → Fed 降息空间↓ → 美债↑ → 估值承压。通过通胀链条传导到 A 股。', null);
    put('copper', '铜（Doctor Copper）', '海外与利率', '美元', '日度', 'global_liq', 'A', 'up_good', 'growth',
      '铜与电力/制造/地产/新能源需求高度相关，是全球工业周期的晴雨表。', null);
    put('gold', '黄金', '海外与利率', '美元', '日度', 'global_liq', 'A', null, null,
      '核心看"黄金 vs 实际利率"：实际利率↓利好黄金。黄金≠股市跌，它反映避险/央行购金/地缘。', null);
    put('fed', '美联储政策利率', '海外与利率', '%', '月度', 'global_liq', 'S', 'down_good', 'liquidity',
      'Fed Funds Rate：美国短端利率之锚。但比"现在的利率"更重要的是 FedWatch 市场预期概率（见上方概率表）。',
      [['2023-06',5.50],['2023-12',5.50],['2024-06',5.50],['2024-12',4.50],['2025-06',4.00],['2025-12',3.75],['2026-03',3.50],['2026-06',3.25]]);

    /* ===== 第二层 · 中国流动性 ===== */
    put('dr007', '银行间 7 天回购利率', '货币与金融', '%', '日度', 'cn_liq', 'S', 'down_good', 'liquidity',
      '银行间资金面松紧最直接的观测：持续低位=资金宽松、风险偏好改善；快速上行=资金收紧、杠杆承压。数据取 FR007 回购定盘利率（与 DR007 高度同步的公开可得替代）。', null);
    put('newcredit', '新增人民币贷款同比', '货币与金融', '%', '月度', 'cn_liq', 'A', 'up_good', 'growth',
      '信用扩张的流量观测：新增贷款同比回升=实体融资需求改善（存量看社融，目前需手动录入）。', null);
    put('cn1y', '中国 1Y 国债收益率', '货币与金融', '%', '日度', 'cn_liq', 'A', 'down_good', 'liquidity',
      '短端无风险利率，反映银行体系资金成本。', null);
    put('cn10y', '中国 10Y 国债收益率', '货币与金融', '%', '日度', 'cn_liq', 'S', null, null,
      '中国无风险利率锚，是"股债收益差"的分母之一（见市场层）。', null);
    put('lpr1y', '1 年期 LPR', '货币与金融', '%', '月度', 'cn_liq', 'A', 'down_good', 'liquidity',
      '贷款市场报价利率（1 年期），观察货币政策宽松力度。',
      [['2023-06',3.55],['2023-12',3.45],['2024-06',3.45],['2024-12',3.10],['2025-06',3.00],['2025-12',3.00],['2026-03',3.00],['2026-06',3.00]]);
    put('lpr5y', '5 年期以上 LPR', '货币与金融', '%', '月度', 'cn_liq', 'A', 'down_good', 'liquidity',
      '与房贷、企业长期融资成本直接相关。',
      [['2023-06',4.20],['2023-12',3.95],['2024-06',3.95],['2024-12',3.60],['2025-06',3.50],['2025-12',3.50],['2026-03',3.50],['2026-06',3.50]]);
    put('tsf', '社融存量同比', '货币与金融', '%', '月度', 'cn_liq', 'S', 'up_good', 'growth',
      '信用周期之母：政策宽松→信贷→投资/消费→经济→企业利润。社融是传导链的关键观察窗口。',
      [['2024-06',8.1],['2024-12',8.0],['2025-06',8.2],['2025-12',8.3],['2026-03',8.5],['2026-06',8.4],['2026-07',8.6]]);
    put('m1', 'M1 同比', '货币与金融', '%', '月度', 'cn_liq', 'S', 'up_good', 'growth',
      'M1 偏企业活期资金=交易活跃度。M1↑ 或 M1-M2 剪刀差收窄 = 资金从"存起来"转向"流动起来"，利好权益。',
      [['2024-06',-5.0],['2024-12',-1.4],['2025-06',3.6],['2025-12',5.0],['2026-03',4.5],['2026-06',4.2],['2026-07',4.6]]);
    put('m2', 'M2 同比', '货币与金融', '%', '月度', 'cn_liq', 'A', 'up_good', 'liquidity',
      '广义货币/资金总量。单独看意义有限，重点是 M1-M2 剪刀差。',
      [['2023-06',11.3],['2023-12',9.7],['2024-06',6.2],['2024-12',7.3],['2025-06',7.0],['2025-12',7.4],['2026-03',7.5],['2026-06',7.6]]);
    put('usdcny', '人民币汇率 USDCNY', '海外与利率', '', '日度', 'cn_liq', 'S', null, null,
      '比绝对值更重要的是变化速度：短时间快速贬值（如 7.05→7.20）比长期横盘更值得警惕。整数关口（7.0/7.1/7.2）是市场关注点。',
      [['2024-06',7.25],['2024-12',7.30],['2025-06',7.17],['2025-12',7.08],['2026-03',7.02],['2026-06',7.05],['2026-07',7.08],['2026-08',7.10]]);

    /* ===== 第三层 · 中国经济周期 ===== */
    put('pmi', '制造业 PMI', '国内经济', '', '月度', 'cn_econ', 'S', 'up_good', 'growth',
      '荣枯线 50。比 GDP 快、是企业现状调查。别只看总数——重点看下方"新订单"（需求领先于生产）。',
      [['2024-03',50.8],['2024-06',49.5],['2024-09',49.8],['2024-12',50.1],['2025-03',50.5],['2025-06',49.5],['2025-09',49.8],['2025-12',50.1],['2026-03',50.2],['2026-06',50.1],['2026-07',49.2]]);
    put('pmi_new', 'PMI 新订单', '国内经济', '', '月度', 'cn_econ', 'S', 'up_good', 'growth',
      '生产是结果，新订单更接近需求。PMI 持平但新订单 52→49 = 需求恶化的领先信号。',
      [['2024-06',49.5],['2024-12',50.1],['2025-06',49.6],['2025-12',50.1],['2026-03',50.4],['2026-06',49.8],['2026-07',48.5]]);
    put('gdp', 'GDP 同比增速', '国内经济', '%', '季度', 'cn_econ', 'A', null, null,
      '滞后指标：回答"经济现在什么状态"而非"下月涨不涨"。权重低于 PMI/社融。',
      [['2023Q1',4.5],['2023Q2',6.3],['2023Q3',4.9],['2023Q4',5.2],['2024Q1',5.3],['2024Q2',4.7],['2024Q3',4.6],['2024Q4',5.4],['2025Q1',5.4],['2025Q2',4.5]]);
    put('indval', '工业增加值同比', '国内经济', '%', '月度', 'cn_econ', 'A', 'up_good', 'growth',
      'A股=制造业+科技高权重市场，工业周期直接影响盈利。关注高技术制造业分项。', null);
    put('fixedasset', '固定资产投资同比', '国内经济', '%', '月度', 'cn_econ', 'A', 'up_good', 'growth',
      '细分制造业投资/基建投资/地产投资三条线看：基建对应财政发力，制造业对应产业周期。', null);
    put('retail', '社会消费品零售同比', '国内经济', '%', '月度', 'cn_econ', 'A', 'up_good', 'growth',
      '内需消费动能。', null);
    put('exports', '出口同比', '国内经济', '%', '月度', 'cn_econ', 'S', 'up_good', 'growth',
      '外需是中国宏观周期重要支撑。重点看"超预期/低于预期"而非绝对值。',
      [['2024-06',10.7],['2024-12',10.9],['2025-06',5.8],['2025-12',6.7],['2026-06',12.5],['2026-07',14.0]]);
    put('elec', '全社会用电量同比', '国内经济', '%', '月度', 'cn_econ', 'A', 'up_good', 'growth',
      '经济晴雨表：用电量比 GDP 更实时地反映工业生产与经济活动强度。', null);
    put('czsr', '财政收入同比', '国内经济', '%', '月度', 'cn_econ', 'B', 'up_good', 'growth',
      '财政发力程度：收入改善配合支出扩张，对基建与总需求形成支撑。', null);
    put('boom', '企业景气指数', '国内经济', '', '季度', 'cn_econ', 'B', 'up_good', 'growth',
      '央行调查的企业景气度（>100 为景气区间）：环比改善=企业预期回暖。', null);
    put('unemp', '城镇调查失业率', '就业与民生', '%', '月度', 'cn_econ', 'B', null, null,
      '就业形势与内需基础。失业率上行通常伴随消费与风险偏好走弱。',
      [['2023-06',5.2],['2023-12',5.1],['2024-06',5.0],['2024-12',5.1],['2025-06',5.0],['2025-12',5.0],['2026-03',5.1],['2026-06',5.0]]);

    /* ===== 第四层 · 价格周期 ===== */
    put('cpi', 'CPI 同比', '物价通胀', '%', '月度', 'price', 'A', 'up_good', 'growth',
      '居民物价。核心CPI（剔除食品能源）更值得长期跟踪：核心CPI↑ = 内需+定价能力改善。',
      [['2023-06',0.0],['2023-12',-0.3],['2024-06',0.2],['2024-12',0.1],['2025-06',0.3],['2025-12',0.5],['2026-03',0.8],['2026-06',0.6],['2026-07',0.7]]);
    put('ppi', 'PPI 同比', '物价通胀', '%', '月度', 'price', 'S', 'up_good', 'growth',
      '工业品出厂价格：直接决定工业企业"收入-成本=利润"。对钢铁/化工/有色/煤炭影响明显。对 A 股重要性不低于 CPI。',
      [['2023-06',-5.4],['2023-12',-2.7],['2024-06',-0.8],['2024-12',-2.3],['2025-06',-2.0],['2025-12',-1.5],['2026-03',-1.2],['2026-06',-0.9],['2026-07',3.5]]);
    put('commprice', '大宗商品价格指数', '物价通胀', '', '日度', 'price', 'A', 'up_good', 'growth',
      'PPI 的领先观测：大宗商品价格上行→工业企业成本与通胀预期变化；日度更新更及时。', null);

    /* ===== 第五层 · 市场自身 ===== */
    put('turnover', 'A股成交额', '市场', '万亿', '日度', 'market', 'S', 'up_good', 'valuation',
      '指数涨但成交额缩（2万亿→1.3万亿）不健康；横盘但放量可能在风格切换。', null);
    put('hs300pe', '沪深300 PE', '市场', '倍', '周度', 'market', 'S', 'up_good', 'valuation',
      '估值本身无意义，历史分位数才有意义。方向口径：PE 环比上行=估值扩张（偏多）、下行=估值收缩（偏空）；同时用于计算股债收益差。', null);
    put('us30y', '美债 30Y 收益率', '海外与利率', '%', '日度', 'global_liq', 'B', 'down_good', 'liquidity',
      '长期通胀、财政与债务预期、期限溢价。30Y 快速上行常反映财政/通胀担忧。', null);
    put('breakeven', '10Y 盈亏平衡通胀', '海外与利率', '%', '日度', 'global_liq', 'A', null, null,
      '名义10Y − 实际利率 = 通胀预期。与实际利率组合判断：通胀预期↑ 利好黄金/资源。', null);
    put('margin', '两融余额', '市场', '万亿', '日度', 'market', 'A', 'up_good', 'valuation',
      '杠杆资金情绪。两融快速上升 = 风险偏好高，但也意味着波动放大。', null);
    put('northbound', '北向资金净流入', '市场', '亿', '日度', 'market', 'A', 'up_good', 'valuation',
      '外资风险偏好观测。持续流出常与美元走强/人民币贬值压力同期出现——先看 DXY 再解读。', null);
    put('csi500pe', '中证500 PE', '市场', '倍', '周度', 'market', 'A', 'up_good', 'valuation',
      '中盘估值。与沪深300 PE 对比看大小盘风格；方向口径同沪深300 PE（环比上行=估值扩张）。', null);
    put('allape', '全部A股市盈率', '市场', '倍', '周度', 'market', 'A', 'up_good', 'valuation',
      '全市场估值中枢，必须结合历史分位数看（见卡片上的分位徽章）；方向同沪深300 PE（环比上行=估值扩张）。', null);

    /* ===== 第六层 · 行业高频（L2 行业温度计的数据源） ===== */
    put('wti', 'WTI 原油', '海外与利率', '美元', '日度', 'global_liq', 'A', null, null,
      '美油基准，比布伦特对美国通胀/库存更敏感。>100 = 通胀压力红灯。', null);
    put('vix', 'VIX 恐慌指数', '海外与利率', '', '日度', 'global_liq', 'A', null, null,
      '标普期权隐含波动率：>28 全球 risk-off，与 A 股外资流向负相关。', null);
    put('dram_ddr4', 'DRAM 现货价 · DDR4 8Gb', '行业跟踪', '美元', '日度', 'industry', 'A', null, null,
      '存储周期最直观的高频代理：现货价环比连涨 = 存储景气上行（dramx.com 每交易日更新）。', null);
    put('dram_ddr5', 'DRAM 现货价 · DDR5 16Gb', '行业跟踪', '美元', '日度', 'industry', 'A', null, null,
      'DDR5 是当前主力合约，对存储模组/接口芯片厂商的业绩弹性更直接（dramx.com 每交易日更新）。', null);
    put('roe_storage', '存储分销商 ROE', '行业跟踪', '%', '季度', 'industry', 'B', null, null,
      '存储板块分销/模组公司 ROE（财报模块手动同步）：ROE 触顶回落 = 景气见顶预警。', null);
    put('vlcc_tce', 'VLCC TCE 运价', '行业跟踪', '美元/天', '周度', 'industry', 'A', null, null,
      '超大型油轮等价期租租金：油运公司盈利的直接决定变量，券商周报每周更新。', null);
    put('r32', 'R32 制冷剂价格', '行业跟踪', '万元/吨', '周度', 'industry', 'A', null, null,
      '氟化工配额周期核心品种：价格持续上行 = 巨化等龙头量价齐升（百川盈孚/周报，手动录入）。', null);
    put('tc_rc', '铜精矿加工费 TC', '行业跟踪', '美元/吨', '周度', 'industry', 'A', null, null,
      '铜矿供给的反向指标：TC 暴跌 = 矿端紧缺 = 供给约束逻辑强化（利好铜价与矿企）。', null);
    put('capex_big4', '北美四大云厂商 CapEx 同比', '行业跟踪', '%', '季度', 'industry', 'A', null, null,
      'MSFT+GOOG+AMZN+META 资本开支合计同比：算力/光模块/PCB 需求的源头。上修周期 = 算力链景气确认。', null);
    put('pcb_vis', 'PCB 订单能见度', '行业跟踪', '月', '月度', 'industry', 'B', null, null,
      '头部 PCB 厂订单排产能见度（月）：≥6 个月 = AI 服务器板需求扎实。', null);
    put('pe_power', '电源板块 PE', '行业跟踪', '倍', '周度', 'industry', 'B', null, null,
      '电源/散热板块整体 PE：景气再好也怕估值，>80x 进入观察池深处，控制击球纪律。', null);
    put('game_lic', '游戏版号数量', '行业跟踪', '款', '月度', 'industry', 'B', null, null,
      '国产网游版号月度发放数量：供给端政策信号，连续放量 = 行业监管回暖。', null);
    put('mil_contr', '军工合同负债同比', '行业跟踪', '%', '季度', 'industry', 'B', null, null,
      '军工主机厂合同负债/预收款同比：订单先行指标，与地缘/五年规划共振时弹性大。', null);

    return { groups, fedwatch: [
      { id:uid(), meeting:'2026-09', cut:20, hold:50, hike:30, updated:dateStr() },
      { id:uid(), meeting:'2026-10', cut:35, hold:45, hike:20, updated:dateStr() },
      { id:uid(), meeting:'2026-12', cut:60, hold:30, hike:10, updated:dateStr() },
    ] };
  }

  /* ===== L1/L2 温度计池 seed =====
   * item: { label, ref, unit, dir, green, yellow, falsify(证伪线), action(触发动作), note } */
  function seedPools(){
    const mkItem = o => Object.assign({ id:uid(), unit:'', falsify:'', action:'', note:'' }, o);
    const pools = [
      { key:'l1', name:'L1 · 宏观温度计', icon:'🌡️', fixed:true,
        desc:'天气层：影响全部持仓。红多 = 宏观逆风，先降仓位弹性再看个股。',
        items:[
          mkItem({ label:'美债 10Y', ref:'ind:us10y', unit:'%', dir:'below', green:4.0, yellow:4.5,
            falsify:'10Y 快速上行至 4.8%+ 且实际利率同步上行 → 成长股估值系统性承压，与"利好出尽"无关',
            action:'>4.5%：降低成长股仓位弹性，优先高现金流/低估红利；急跌破 4.0% 且因衰退→反而要小心' }),
          mkItem({ label:'Fed 加息概率', ref:'fedwatch', unit:'%', dir:'below', green:20, yellow:50,
            falsify:'加息概率 >50% 且 2Y 同步跳升 → 政策路径彻底重定价',
            action:'>50%：暂停加仓成长；<20% 且降息概率升 → 成长股分母端转顺风' }),
          mkItem({ label:'美元指数', ref:'ind:dxy', unit:'', dir:'below', green:98, yellow:103,
            falsify:'DXY >105 且 USDCNH 同步走弱 → 新兴市场流动性危机式外流',
            action:'>103：控制两融/高贝塔仓位；人民币汇率企稳前不加仓' }),
          mkItem({ label:'WTI 油价', ref:'ind:wti', unit:'美元', dir:'below', green:80, yellow:100,
            falsify:'WTI >100 且核心 CPI 回升 → 通胀二次抬头，Fed 宽松预期证伪',
            action:'>100：利空航空/化工中游成本端，利好油气开采；成长估值再压一格' }),
          mkItem({ label:'北向资金', ref:'ind:northbound', unit:'亿', dir:'above', green:0, yellow:-50,
            note:'看 5 日累计趋势而非单日；口径调整/停发实时数据时改看 ETF 流',
            falsify:'连续 2 周净流出 + 人民币贬值 → 外资系统性减仓，权重白马承压',
            action:'5 日累计 < -100亿：暂避外资重仓方向（白酒/白电/银行核心）' }),
          mkItem({ label:'VIX 恐慌指数', ref:'ind:vix', unit:'', dir:'below', green:20, yellow:28,
            falsify:'VIX >35 → 全球 risk-off，A 股难以独善其身',
            action:'>28：降杠杆；>35 后快速回落常是阶段性底部信号' }),
        ] },
      { key:'storage', name:'存储', icon:'💾',
        desc:'存储周期看现货价环比与分销盈利：涨价传导到 ROE 才是真景气。周期位置：现货价从底部连涨 = 上行早期（右侧加仓），高分位滞涨 + eTT 涨幅趋缓 = 顶部区。',
        falsify:'DRAM 现货价连续 4 周回落 + 分销商 ROE 环比下滑 → 景气拐点确认，撤出模组/接口芯片',
        items:[
          mkItem({ label:'DRAM DDR5 16Gb', ref:'ind:dram_ddr5', unit:'美元', dir:'up',
            falsify:'现货价较近 8 周高点回落 >10% → 周期见顶信号', action:'环比连涨 4 周：模组/主控加仓窗口' }),
          mkItem({ label:'DRAM DDR4 8Gb', ref:'ind:dram_ddr4', unit:'美元', dir:'up',
            note:'DDR4 涨价多因停产转产，弹性看 DDR5', action:'' }),
          mkItem({ label:'分销商 ROE', ref:'ind:roe_storage', unit:'%', dir:'above', green:8, yellow:5,
            falsify:'ROE 触顶回落两个季度 → 涨价利润未留存，景气成色打折', action:'' }),
        ] },
      { key:'tanker', name:'油运', icon:'🚢',
        desc:'地缘 + 拉长运距驱动；运价是唯一真相，股价涨停不等于景气。VLCC TCE 券商周报每周更新（手动录入）。',
        falsify:'VLCC TCE 连续 3 周低于 2 万美元/天 → 淡季证伪，等运价回升再谈景气',
        items:[
          mkItem({ label:'VLCC TCE', ref:'ind:vlcc_tce', unit:'美元/天', dir:'above', green:40000, yellow:20000,
            falsify:'TCE <2万 持续 1 个月 → 盈利下修，估值锚失效', action:'TCE >4万：旺季行情确认，Q4 传统旺季前布局' }),
        ] },
      { key:'compute', name:'算力/光模块', icon:'⚡',
        desc:'需求源头是北美云厂 CapEx；光模块/交换机/液冷全链条跟随。周期位置：CapEx 同比连续上修 = 景气中段，价格年降幅度是利润率的边际变量。',
        falsify:'CapEx 指引下修 + 800G 价格年降超 15% → 需求与价格双杀，成长逻辑证伪',
        items:[
          mkItem({ label:'云厂 CapEx 同比', ref:'ind:capex_big4', unit:'%', dir:'above', green:20, yellow:10,
            falsify:'同比 <10% 或指引下修 → 订单能见度坍塌，光模块杀估值', action:'上修季：光模块/PCB/液冷链条全面受益' }),
          mkItem({ label:'美债 10Y（贴现率）', ref:'ind:us10y', unit:'%', dir:'below', green:4.0, yellow:4.5,
            note:'算力是久期最长的成长资产，对折现率最敏感', action:'' }),
        ] },
      { key:'pcb', name:'PCB', icon:'🧩',
        desc:'AI 服务器板 + 汽车板双轮；能见度决定估值给法。',
        falsify:'订单能见度 <2 个月 → 周期股估值，等财报超预期再介入',
        items:[
          mkItem({ label:'订单能见度', ref:'ind:pcb_vis', unit:'月', dir:'above', green:6, yellow:3,
            falsify:'能见度从 6 个月骤降至 3 个月以内 → AI 订单不及预期', action:'≥6 个月：可给成长股估值，4-6 月：PEG 口径' }),
        ] },
      { key:'fluoro', name:'氟化工', icon:'🧪',
        desc:'配额制下的供给收缩周期：R32 价格是巨化们盈利的先行变量。',
        falsify:'R32 价格环比连跌 4 周 → 配额逻辑被需求下滑击穿',
        items:[
          mkItem({ label:'R32 价格', ref:'ind:r32', unit:'万元/吨', dir:'above', green:3, yellow:2,
            falsify:'价格跌破成本线 → 配额红利证伪', action:'价格创新高 + 库存低位：S 级击球机会（配额垄断 = 盈利确定性）' }),
        ] },
      { key:'defense', name:'军工', icon:'🚀',
        desc:'地缘 + 十五五订单周期：合同负债是订单先行指标。',
        falsify:'合同负债连续 2 个季度负增长 → 订单周期下行为主导，事件驱动难改趋势',
        items:[
          mkItem({ label:'合同负债同比', ref:'ind:mil_contr', unit:'%', dir:'above', green:10, yellow:0,
            note:'地缘事件只改变节奏，不改方向——以合同负债为准', action:'同比转正且加速：主机厂优先' }),
        ] },
      { key:'copper', name:'铜', icon:'🟠',
        desc:'全球工业周期晴雨表：极值区看供给约束（TC）与库存。周期位置：铜价历史极值 + TC 新低 = 供给约束主导（事件驱动强波动），铜价分位回落但 TC 仍低 = 回调即机会。',
        falsify:'TC 回升 + 铜库存累库 → 供给约束逻辑证伪，铜价回落',
        items:[
          mkItem({ label:'铜价', ref:'ind:copper', unit:'美元', dir:'up',
            note:'历史极值区时绿灯仅代表动能，警惕高位波动', action:'' }),
          mkItem({ label:'加工费 TC', ref:'ind:tc_rc', unit:'美元/吨', dir:'below', green:30, yellow:60,
            falsify:'TC 快速反弹 >60 → 矿端宽松，约束逻辑解除', action:'TC <30：矿端紧缺确认，铜矿股盈利上修' }),
        ] },
      { key:'power', name:'电源/散热', icon:'🔌',
        desc:'AI 供电单元高景气，但估值是最大的敌人。',
        falsify:'PE >80x 且 CapEx 增速下修 → 双高组合，回撤风险最大',
        items:[
          mkItem({ label:'板块 PE', ref:'ind:pe_power', unit:'倍', dir:'below', green:50, yellow:80,
            falsify:'PE 突破 100x → 观察池深处，任何风吹草动都是 20% 级回撤', action:'PE <50：击球区；>80：只看不买，等回调' }),
        ] },
      { key:'game', name:'游戏', icon:'🎮',
        desc:'版号供给 + 爆款周期：监管信号决定板块估值下限。',
        falsify:'版号数量连续 3 个月环比下降 → 供给收缩，行业逻辑转防守',
        items:[
          mkItem({ label:'版号数量', ref:'ind:game_lic', unit:'款', dir:'above', green:100, yellow:80,
            falsify:'单月 <60 款 → 政策收紧信号', action:'连续放量 + 新游流水超预期：板块贝塔向上' }),
        ] },
    ];
    return pools.map(p => Object.assign({ id:uid(), desc:'', falsify:'', items:[] }, p,
      { items: p.items.map(i => Object.assign({ unit:'' }, i)) }));
  }
  function ensure(db){
    const m = db.macro = db.macro || {};
    const SEED_VER = 7;   // seed 结构版本（新增指标/池时 +1）
    // v7 下线的指标（无稳定自动源且无数据，卡片恒为空）：从用户库中移除，历史 CSV 不受影响
    const REMOVED_KEYS = ['govbond', 'hhloan', 'prop_sale', 'indprofit', 'corecpi', 'etfflow', 'corploan', 'bdti'];
    // ---- 迁移0：最旧结构 DB.macro.indicators（扁平数组）→ groups 分组结构 ----
    if(!m.groups || !Array.isArray(m.groups)){
      const old = m.indicators;
      if(old && Array.isArray(old) && old.length){
        const gs = GROUPS.map(g => ({ id:uid(), key:g.key, name:g.name, indicators:[] }));
        old.forEach(i => {
          const g = gs.find(x => x.key === (CAT_TO_GROUP[i.category] || 'domestic'));
          if(g) g.indicators.push(Object.assign({}, i, { category:i.category }));
        });
        m.groups = gs;
        delete m.indicators;
      } else {
        // 全新安装：seed 一步到位（含完整元数据 + 温度计池），后续迁移自然跳过
        const s = seed();
        m.groups = s.groups; m.fedwatch = s.fedwatch; m.pools = seedPools();
        m.scores = { liquidity:0, growth:0, valuation:0 };
        m.seedDataVersion = SEED_VER;
        return;
      }
    }
    // ---- 迁移1：旧指标补层级/重要性元数据（按 KEY_META 映射，不覆盖已有） ----
    let changed = false;
    (m.groups||[]).forEach(g => (g.indicators||[]).forEach(i => {
      const meta = KEY_META[i.key];
      if(meta){
        // 注意：老数据的 direction 可能是 null（seed 中显式留空），用 == null 一并按映射补齐
        ['layer','importance','direction','scoreLayer'].forEach(k => {
          if(i[k] == null && meta[k] !== undefined){ i[k] = meta[k]; changed = true; }
        });
      }
      if(i.interpret === undefined){ i.interpret = ''; }
    }));
    // ---- 迁移2：合并 seed 新指标 + FedWatch（按 key 去重，只补缺失，版本化一次性执行） ----
    if((m.seedDataVersion || 0) < SEED_VER){
      const sv = seed();
      const byKey = {};
      (m.groups||[]).forEach(g => (g.indicators||[]).forEach(i => { byKey[i.key] = i; }));
      sv.groups.forEach(sg => {
        // 找到目标表（按 key），没有则创建
        let g = (m.groups||[]).find(x => x.key === sg.key);
        if(!g){ g = { id:uid(), key:sg.key, name:sg.name, indicators:[] }; m.groups.push(g); }
        sg.indicators.forEach(si => {
          if(byKey[si.key]) return;            // 用户已有，跳过
          g.indicators.push(si); byKey[si.key] = si; changed = true;
        });
      });
      if(!Array.isArray(m.fedwatch) || !m.fedwatch.length){ m.fedwatch = sv.fedwatch; changed = true; }
      // ---- 迁移3（v6）：L1/L2 温度计池——按池 key 合并，已有池只补缺失的指标项 ----
      if(!Array.isArray(m.pools)) m.pools = [];
      const sp = seedPools();
      sp.forEach(p => {
        const ex = m.pools.find(x => x.key === p.key);
        if(!ex){ m.pools.push(p); return; }
        (p.items||[]).forEach(si => {
          if(!(ex.items||[]).some(x => x.ref === si.ref && x.label === si.label)) ex.items.push(si);
        });
      });
      m.seedDataVersion = SEED_VER;
    }
    m.pools = m.pools || [];
    // BDTI 无稳定免费数据源已下线 → 幂等清理引用它的池项（指标本体不删，历史数据保留）
    (m.pools).forEach(p => {
      if(Array.isArray(p.items) && p.items.some(it => it.ref === 'ind:bdti')){
        p.items = p.items.filter(it => it.ref !== 'ind:bdti'); changed = true;
      }
    });
    // ---- 打分手动修正值初始化（半自动温度计，二期） ----
    m.scores = m.scores || { liquidity:0, growth:0, valuation:0 };
    // ---- v7：移除已下线指标（每次加载幂等执行，删空表） ----
    (m.groups||[]).forEach(g => {
      const before = (g.indicators||[]).length;
      g.indicators = (g.indicators||[]).filter(i => REMOVED_KEYS.indexOf(i.key) < 0);
      if(g.indicators.length !== before) changed = true;
    });
    if(changed){ /* 有变更时由调用方 save() 持久化 */ }
  }

  /* ----- 通用工具 ----- */
  function groups(){ return DB.macro.groups; }
  function allIndicators(){ return (groups()||[]).reduce((a, g) => a.concat(g.indicators||[]), []); }
  function ind(name){ return allIndicators().find(i => i.key === name); }

  // 取指标最后一个值及其环比变化（相邻两个点的差值）
  // 环比仅在相邻两期处于正常间隔内才有效（跨期断层如"2026-08"月度点接日度点，不能当上一期用）
  function latest2(i){
    const pts = (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(!pts.length) return { latest:null, prev:null, delta:null, date:null, prevDate:null, gap:null, contig:false };
    const latest = pts[pts.length-1];
    const prev = pts.length > 1 ? pts[pts.length-2] : null;
    const ok = prev && prev.value != null && latest.value != null && !isNaN(prev.value) && !isNaN(latest.value);
    let gap = null, contig = false;
    if(ok){
      gap = dayGap(prev.date, latest.date);
      contig = (gap == null) ? true : (gap >= 0 && gap <= (CONTIG_DAYS[i.freq] || 62));
    }
    return { latest: latest.value, prev: prev ? prev.value : null,
      delta: (ok && contig) ? latest.value - prev.value : null,
      date: latest.date, prevDate: prev ? prev.date : null, gap, contig };
  }
  function fmtNum(n, unit, digits){
    if(n == null || n === '' || isNaN(n)) return '<span class="muted">—</span>';
    const d = digits != null ? digits : (Math.abs(n) < 100 ? 2 : 1);
    return Number(n).toFixed(d) + (unit || '');
  }
  function deltaHtml(delta, unit){
    if(delta == null || isNaN(delta)) return '';
    const cls = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'muted');
    const sign = delta > 0 ? '↑' : (delta < 0 ? '↓' : '→');
    return ' <span class="' + cls + '" style="font-size:12px">' + sign + ' ' + Math.abs(delta).toFixed(2) + (unit||'') + '</span>';
  }

  /* ----- 数据新鲜度（防止用陈旧数据打分/发信号） -----
   * FRESH_DAYS：各频率允许的最大滞后天数（按"期末日"计，如 '2026-07' 从 7/31 起算）
   * CONTIG_DAYS：相邻两期的最大正常间隔（超过则视为跨期断层，环比无效）
   */
  const FRESH_DAYS  = { '日度':7,  '周度':21, '月度':45,  '季度':120, '年度':400 };
  const CONTIG_DAYS = { '日度':4,  '周度':21, '月度':62,  '季度':200, '年度':400 };
  // 日期字符串 → 该期最后一天（'2026-08-29'→自身；'2026-08'→月末；'2026Q2'→季末；'2026'→年末）
  function periodEndDate(s){
    const str = String(s||'').trim();
    let m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(m) return new Date(+m[1], +m[2]-1, +m[3]);
    m = str.match(/^(\d{4})-(\d{2})$/);
    if(m) return new Date(+m[1], +m[2], 0);          // 该月最后一天
    m = str.match(/^(\d{4})Q([1-4])$/);
    if(m) return new Date(+m[1], +m[2]*3, 0);       // 该季最后一天
    m = str.match(/^(\d{4})$/);
    if(m) return new Date(+m[1], 12, 0);            // 12/31
    return null;
  }
  // 最新数据距今的滞后天数（无法解析返回 null；未来日期按 0）
  function staleness(i){
    const pts = (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(!pts.length) return null;
    const end = periodEndDate(pts[pts.length-1].date);
    if(!end) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((today - end) / 86400000));
  }
  // 数据是否够新：可参与温度计打分与方向信号；陈旧数据只展示、不发信号
  function freshnessOk(i){
    const s = staleness(i);
    if(s == null) return false;
    return s <= (FRESH_DAYS[i.freq] || 45);
  }
  // 滞后徽章（无数据或数据新鲜时返回空）
  function staleBadge(i){
    const s = staleness(i);
    const lim = FRESH_DAYS[i.freq] || 45;
    if(s == null || s <= lim) return '';
    return '<span class="badge amber stale-tip" title="最新数据距今 ' + s + ' 天，超出「' +
      esc(i.freq || '月度') + '」正常更新周期（' + lim + ' 天），已不参与温度计打分与轮动高亮，仅作参考">⚠ 滞后 ' + s + ' 天</span>';
  }
  /* seed 内置演示数据清单（key → 演示点日期）。
   * 用途：识别"仍是示例数据"的指标——点数与清单完全一致即判定为未导入真实数据，
   * 该类指标不参与温度计打分/轮动高亮，避免演示值冒充真实信号；
   * 一旦导入真实 CSV 或手动补录新数据，点数变化即自动恢复参评。
   */
  const DEMO_POINTS = {
    us10y:   ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07','2026-08'],
    real10y: ['2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07','2026-08'],
    dxy:     ['2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07','2026-08'],
    fed:     ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06'],
    lpr1y:   ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06'],
    lpr5y:   ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06'],
    tsf:     ['2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07'],
    m1:      ['2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07'],
    m2:      ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06'],
    usdcny:  ['2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07','2026-08'],
    pmi:     ['2024-03','2024-06','2024-09','2024-12','2025-03','2025-06','2025-09','2025-12','2026-03','2026-06','2026-07'],
    pmi_new: ['2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07'],
    gdp:     ['2023Q1','2023Q2','2023Q3','2023Q4','2024Q1','2024Q2','2024Q3','2024Q4','2025Q1','2025Q2'],
    exports: ['2024-06','2024-12','2025-06','2025-12','2026-06','2026-07'],
    unemp:   ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06'],
    cpi:     ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07'],
    ppi:     ['2023-06','2023-12','2024-06','2024-12','2025-06','2025-12','2026-03','2026-06','2026-07'],
  };
  // 是否仍为"纯演示数据"（点数与演示清单完全一致；导入真实数据或补录后自动失效）
  function isDemoOnly(i){
    const ds = DEMO_POINTS[i.key];
    if(!ds) return false;
    const pts = i.points || [];
    if(pts.length !== ds.length) return false;
    const set = Object.create(null);
    ds.forEach(d => { set[d] = 1; });
    return pts.every(p => set[p.date]);
  }
  function demoBadge(i){
    if(!isDemoOnly(i)) return '';
    return '<span class="badge amber stale-tip" title="该指标目前仍是内置示例数据（尚未导入真实数据），不参与温度计打分与轮动高亮">示例数据</span>';
  }
  // 两个完整日期（YYYY-MM-DD）相差的天数；非完整日期返回 null
  function dayGap(d1, d2){
    const a = String(d1||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const b = String(d2||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if(!a || !b) return null;
    return Math.round((Date.UTC(+b[1], +b[2]-1, +b[3]) - Date.UTC(+a[1], +a[2]-1, +a[3])) / 86400000);
  }
  // 日度指标「较前一日」的变化量（卡片内极简展示，细节放 title）
  // 相邻两期若为连续日期（含跨周末 ≤4 天）视为「前一日」，否则 title 里标注真实对比日期
  function dailyChangeHtml(i, l2){
    if(l2.delta == null || isNaN(l2.delta) || !l2.prevDate) return '';
    const d = l2.delta;
    const cls = d > 0 ? 'up' : (d < 0 ? 'down' : 'muted');
    const digits = Math.abs(d) < 0.01 ? 3 : 2;                // 微小变化（如汇率）保留 3 位，避免舍入失真
    const abs = (d > 0 ? '+' : '') + d.toFixed(digits);
    // title：完整对比信息（含 bp / 相对%）
    const gap = dayGap(l2.prevDate, l2.date);
    const when = (gap != null && gap <= 4) ? '较前一日' : ('较 ' + l2.prevDate);
    let detail = '';
    if(i.unit === '%'){                                       // 利率类：附带基点
      const bp = Math.round(d * 1000) / 10;
      if(bp) detail = '，' + (bp > 0 ? '+' : '') + bp + 'bp';
    } else if(l2.prev != null && Math.abs(l2.prev) > 1e-9){   // 价格/指数/成交额：附带相对变化
      const pct = d / Math.abs(l2.prev) * 100;
      detail = '，' + (pct > 0 ? '+' : '') + pct.toFixed(2) + '%';
    }
    const tip = when + '（' + l2.prevDate + '：' + Number(l2.prev).toFixed(2) + ' → ' + Number(l2.latest).toFixed(2) + '）' + abs + detail;
    return '<span class="d-chg ' + cls + '" title="' + esc(tip) + '">' + abs + '</span>';
  }

  /* ----- 折线趋势图（纯 SVG，含 0 轴参考线与均值参考线） ----- */
  function lineChart(i, opts){
    // 按日期筛选（近1/3/5/10年/全部）
    const pts = filterByRange(i.points).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(pts.length < 2) return '<div class="muted" style="text-align:center;padding:20px;font-size:13px">该区间内数据点不足，无法绘制趋势图</div>';

    const w = 640, h = 150, pad = {l:46, r:14, t:14, b:26};
    const color = opts && opts.color ? opts.color : '#5b64f2';
    const mid = i.id || ('m' + Date.now() + '_' + (i.key||''));
    let vals = pts.map(p => p.value);
    const allVals = vals.filter(v => v != null && !isNaN(v));
    if(!allVals.length) return '<div class="muted">暂无有效数据</div>';
    let minV = Math.min(...allVals), maxV = Math.max(...allVals);
    // 若所有值同号且为正，底轴从 0 开始（便于观察量级）
    const allPos = allVals.every(v => v >= 0);
    if(allPos) minV = 0;
    // 指标若为"比值/率"，加一条均值虚线做参考
    const avg = allVals.reduce((s,v)=>s+v,0) / allVals.length;
    const range = (maxV - minV) || 1;
    const xS = i2 => pad.l + (i2 / (pts.length - 1)) * (w - pad.l - pad.r);
    const yS = v => h - pad.b - ((v - minV) / range) * (h - pad.t - pad.b);
    let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto" data-mid="' + esc(mid) + '">';
    // 横向网格线 + 刻度
    for(let gi = 0; gi <= 4; gi++){
      const gy = pad.t + gi * (h - pad.t - pad.b) / 4;
      const gv = maxV - gi * range / 4;
      svg += '<line class="cgrid" x1="' + pad.l + '" y1="' + gy.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + gy.toFixed(1) + '" stroke-width="1"/>';
      svg += '<text x="' + (pad.l-6) + '" y="' + (gy+3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#8a93a3">' + (Math.abs(gv) < 100 ? gv.toFixed(2) : gv.toFixed(1)) + '</text>';
    }
    // 0 轴加粗（若在画布内）
    if(0 >= minV && 0 <= maxV){
      const y0 = yS(0);
      svg += '<line class="czero" x1="' + pad.l + '" y1="' + y0.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + y0.toFixed(1) + '" stroke-width="1.2" stroke-dasharray="4,3"/>';
    }
    // 均值虚线
    const yAvg = yS(avg);
    svg += '<line x1="' + pad.l + '" y1="' + yAvg.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + yAvg.toFixed(1) + '" stroke="#e6b23c" stroke-width="1" stroke-dasharray="2,3"/>';
    // 折线 + 数据点（点数越多圆圈越小，避免密集时糊成一团）
    let path = '';
    const n = pts.length;
    // 动态半径/线宽：≤20 期保留原视觉，>100 期用最小样式
    const rDot = n <= 20 ? 3.2 : (n <= 40 ? 2.4 : (n <= 60 ? 1.8 : (n <= 100 ? 1.4 : 1.0)));
    const swLine = n <= 40 ? 2.4 : (n <= 80 ? 2.0 : 1.6);
    pts.forEach((p, k) => {
      if(p.value == null || isNaN(p.value)) return;
      const px = xS(k), py = yS(p.value);
      path += (path ? 'L' : 'M') + ' ' + px.toFixed(1) + ' ' + py.toFixed(1) + ' ';
    });
    if(path) svg += '<path d="' + path.trim() + '" fill="none" stroke="' + color + '" stroke-width="' + swLine + '" stroke-linejoin="round" stroke-linecap="round"/>';
    // 数据点（保留原生 title 兜底提示）
    pts.forEach((p, k) => {
      if(p.value == null || isNaN(p.value)) return;
      const px = xS(k), py = yS(p.value);
      svg += '<circle class="chart-pt" data-mid="' + esc(mid) + '" data-date="' + esc(p.date) + '" data-value="' + p.value + '" data-idx="' + k + '" cx="' + px.toFixed(1) + '" cy="' + py.toFixed(1) + '" r="' + rDot + '" stroke="' + color + '" stroke-width="' + Math.max(1, rDot * 0.6).toFixed(1) + '"><title>' + esc(p.date) + '：' + p.value + '</title></circle>';
    });
    // x 轴时间标签（抽样显示）
    const step = Math.ceil(pts.length / 6);
    pts.forEach((p, k) => {
      if(k % step === 0 || k === pts.length - 1){
        svg += '<text x="' + xS(k).toFixed(1) + '" y="' + (h - pad.b + 16) + '" text-anchor="middle" font-size="10" fill="#8a93a3">' + p.date + '</text>';
      }
    });
    // 提示层（默认隐藏，鼠标悬停竖线时在对应位置显示）
    svg += '<g class="chart-tip" visibility="hidden">' +
      '<line class="tip-line" x1="0" y1="' + pad.t + '" x2="0" y2="' + (h-pad.b) + '" stroke="' + color + '" stroke-width="1" stroke-dasharray="3,2"/>' +
      '<g class="tip-box">' +
        '<rect rx="4" ry="4" fill="#2b2f36" opacity="0.92"/>' +
        '<text class="tip-date" x="0" y="0" text-anchor="middle" font-size="10" fill="#fff"></text>' +
        '<text class="tip-val" x="0" y="0" text-anchor="middle" font-size="12" fill="#fff" font-weight="600"></text>' +
      '</g></g>';
    // 透明竖线 hover 区：鼠标移到某季度对应的 X 位置即显示该点值
    // 宽度 = 相邻点间距的一半（两端用第一个/最后一个间距），覆盖整个绘图区高度
    const stepX = pts.length > 1 ? (w - pad.l - pad.r) / (pts.length - 1) : (w - pad.l - pad.r);
    pts.forEach((p, k) => {
      if(p.value == null || isNaN(p.value)) return;
      const px = xS(k), py = yS(p.value);
      let hw = stepX / 2;
      if(k === 0) hw = stepX / 2;          // 首点向左到边界
      if(k === pts.length - 1) hw = stepX / 2; // 末点向右到边界
      const hx0 = (k === 0) ? pad.l : px - hw;
      const hx1 = (k === pts.length - 1) ? w - pad.r : px + hw;
      svg += '<rect class="chart-hover" x="' + hx0.toFixed(1) + '" y="' + pad.t + '" width="' + Math.max(0.5, (hx1 - hx0)).toFixed(1) + '" height="' + (h - pad.t - pad.b).toFixed(1) + '" fill="transparent" stroke="none" style="cursor:pointer" data-date="' + esc(p.date) + '" data-value="' + p.value + '" data-idx="' + k + '" data-x="' + px.toFixed(1) + '" data-y="' + py.toFixed(1) + '" onmouseover="macroChartTip(this)" onmouseout="macroChartTipHide(this)"/>';
    });
    svg += '</svg>';
    return svg;
  }

  /* ----- 数据表 ----- */
  function tableHtml(i){
    const pts = filterByRange(i.points).slice().sort((a,b) => b.date.localeCompare(a.date));
    if(!pts.length) return '<div class="empty">该区间内还没有数据，点击「添加数据」</div>';
    let h = '<div class="wide-table-wrap"><table class="val-table"><thead><tr><th>时间</th><th class="num">' + esc(i.name) + (i.unit ? ' (' + esc(i.unit) + ')' : '') + '</th><th class="num">环比变化</th><th></th></tr></thead><tbody>';
    pts.forEach((p, idx) => {
      const next = pts[idx+1]; // 更早的一个点（表已倒序）
      let d = '';
      if(next && next.value != null && p.value != null){
        const dd = p.value - next.value;
        const cls = dd > 0 ? 'up' : (dd < 0 ? 'down' : 'muted');
        const sign = dd > 0 ? '↑' : (dd < 0 ? '↓' : '→');
        d = '<span class="' + cls + '">' + sign + ' ' + Math.abs(dd).toFixed(2) + '</span>';
      }
      h += '<tr><td>' + esc(p.date) + '</td>' +
        '<td class="num"><b>' + Number(p.value).toFixed(2) + '</b></td>' +
        '<td class="num">' + d + '</td>' +
        '<td class="actions-cell"><button class="icon-btn" data-action="macro.delPoint" data-id="' + i.id + '" data-pdate="' + esc(p.date) + '">✕</button></td></tr>';
    });
    h += '</tbody></table></div>';
    return h;
  }

  /* ----- 指标卡片渲染 ----- */
  function impBadge(im){
    if(im === 'S') return '<span class="badge red" title="S级：每日必看">S</span>';
    if(im === 'A') return '<span class="badge amber" title="A级：每周复盘">A</span>';
    return '';
  }
  function indicatorCard(i){
    const l2 = latest2(i);
    const delta = l2.delta != null ? deltaHtml(l2.delta, i.unit) : '';
    const tip = i.interpret || i.desc;
    return '<div class="card macro-card">' +
      '<div class="sec-title"><h2>' + esc(i.name) + '</h2>' +
      '<div class="q-actions">' +
        impBadge(i.importance) +
        demoBadge(i) +
        staleBadge(i) +
        percentileBadge(i) +
        '<span class="badge ' + (l2.delta > 0 ? 'up-badge' : (l2.delta < 0 ? 'down-badge' : 'gray')) + '" style="font-size:11px">' + (l2.delta > 0 ? '↑' : (l2.delta < 0 ? '↓' : '→')) + '</span>' +
        '<button class="icon-btn" title="编辑指标" data-action="macro.edit" data-id="' + i.id + '">✎</button>' +
        '<button class="icon-btn" title="删除指标" data-action="macro.del" data-id="' + i.id + '">✕</button>' +
      '</div></div>' +
      '<div class="macro-latest"><span class="macro-value">' + (l2.latest != null ? Number(l2.latest).toFixed(2) : '—') + '</span>' +
        (i.unit ? '<span class="macro-unit">' + esc(i.unit) + '</span>' : '') + delta +
        (l2.date ? '<span class="macro-date">' + esc(l2.date) + '</span>' : '') + '</div>' +
      (tip ? '<div class="muted" style="font-size:12px;margin:2px 0 12px" title="' + esc(tip) + '">' + esc(tip) + '</div>' : '') +
      speedWarn(i) +
      '<div class="macro-chart">' + lineChart(i) + '</div>' +
      '<div class="macro-actions">' +
        '<button class="btn ghost sm" data-action="macro.addPoint" data-id="' + i.id + '">＋ 添加数据</button>' +
        ((i.points||[]).length ?
          '<button class="btn ghost sm" data-action="macro.viewTable" data-id="' + i.id + '">📋 查看数据</button>' : '') +
      '</div>' +
    '</div>';
  }

  /* ===== 三温度计（半自动打分） =====
   * 自动分：对每个配置了 scoreLayer + direction 的指标，取最新环比 delta，
   *   方向"好"贡献 +1、"坏"贡献 -1，好占比 × 100 得 0-100 分。
   * 手动修正：m.scores[layer]（-25 ~ +25），用于体现"指标背后的原因/预期差"——
   *   因为指标 ≠ 信号，方向对不对取决于原因（如 10Y↓ 因衰退未必是好事）。
   */
  const THERMOS = [
    { key:'liquidity', name:'流动性', icon:'💧', desc:'全球+国内的钱松不松' },
    { key:'growth',    name:'经济',   icon:'🏭', desc:'中国经济强不强（≈企业盈利）' },
    { key:'valuation', name:'估值',   icon:'💹', desc:'A股贵不便宜、钱进没进股市' },
  ];
  function calcScore(tk){
    const list = allIndicators().filter(i => i.scoreLayer === tk && i.direction);
    let good = 0, bad = 0, contrib = [], skipped = [];
    list.forEach(i => {
      // ① 仍是内置示例数据：不参评（导入真实数据后自动恢复）
      if(isDemoOnly(i)){ skipped.push(i.name + '（示例数据）'); return; }
      // ② 数据滞后（超出该频率正常更新周期）：不参评，避免用一年前的环比投票
      if(!freshnessOk(i)){
        const s = staleness(i);
        skipped.push(i.name + (s == null ? '（无数据）' : '（滞后 ' + s + ' 天）'));
        return;
      }
      const l2 = latest2(i);
      if(l2.delta == null || isNaN(l2.delta) || l2.delta === 0) return;
      const isGood = i.direction === 'up_good' ? l2.delta > 0 : l2.delta < 0;
      if(isGood) good++; else bad++;
      contrib.push({ name:i.name, isGood, delta:l2.delta });
    });
    const n = good + bad;
    const auto = n ? Math.round(good / n * 100) : null;
    const manual = Number((DB.macro.scores || {})[tk]) || 0;
    const final = auto == null ? null : Math.max(0, Math.min(100, auto + manual));
    return { auto, manual, final, good, bad, n, contrib, skipped };
  }
  function scoreColor(v){
    if(v == null) return 'var(--gray)';
    return v >= 65 ? 'var(--green)' : (v >= 40 ? 'var(--amber)' : 'var(--red)');
  }
  function thermometersHtml(){
    let h = '<div class="thermo-grid">';
    THERMOS.forEach(t => {
      const s = calcScore(t.key);
      const c = scoreColor(s.final);
      const barW = s.final == null ? 0 : s.final;
      h += '<div class="thermo card">' +
        '<div class="th-head"><span class="th-name">' + t.icon + ' ' + t.name + '温度计</span>' +
        '<span class="th-val" style="color:' + c + '">' + (s.final == null ? '—' : s.final) + '</span></div>' +
        '<div class="th-bar"><div class="th-fill" style="width:' + barW + '%;background:' + c + '"></div>' +
        '<div class="th-mid"></div></div>' +
        '<div class="th-sub muted"><span class="th-sub-txt" title="自动 ' + (s.auto == null ? '—' : s.auto) + ' · 人工 ' + (s.manual > 0 ? '+' : '') + s.manual + ' · ' + s.n + ' 项参评（好' + s.good + '/坏' + s.bad + '）' + (s.skipped.length ? ' · 未参评：' + esc(s.skipped.join('、')) : '') + '">自动 ' + (s.auto == null ? '—' : s.auto) + ' · 人工 <b>' + (s.manual > 0 ? '+' : '') + s.manual + '</b> · ' + s.n + ' 项参评（好' + s.good + '/坏' + s.bad + '）</span>' +
        (s.skipped.length ? '<span class="stale-tip" title="未参评：' + esc(s.skipped.join('、')) + '">' + s.skipped.length + '项未参评</span>' : '') +
        '<span class="th-adj">' +
          '<button class="icon-btn" title="人工下调 5" data-action="macro.scoreAdj" data-v="' + t.key + '" data-d="-5">−</button>' +
          '<button class="icon-btn" title="人工上调 5" data-action="macro.scoreAdj" data-v="' + t.key + '" data-d="5">＋</button>' +
        '</span></div>' +
        '<div class="th-desc muted" title="' + esc(t.desc) + '">' + esc(t.desc) + '</div>' +
        (s.contrib.length ?
          '<details class="th-detail"><summary>参评明细（' + s.n + '）</summary>' +
          s.contrib.map(c => '<div class="th-contrib"><span>' + esc(c.name) + '</span>' +
            '<span class="' + (c.isGood ? 'good' : 'bad') + '">' + (c.isGood ? '好' : '坏') +
            ' <small>' + (c.delta > 0 ? '+' : '') + c.delta.toFixed(2) + '</small></span></div>').join('') +
          '</details>' : '') +
        '</div>';
    });
    return h + '</div>';
  }

  /* ===== 温度计依据（Regime 卡片的数据支撑） =====
   * 展示分数由哪些指标、以什么方向投出，以及未参评项及原因，
   * 避免只看到一个 0/100 的极端分数却不知道依据。
   */
  function scoreReliability(s){
    if(s.n === 0) return '⚠ 无有效参评数据：请补齐数据或更新滞后指标，此温度计暂不可用';
    if(s.n < 3) return '⚠ 仅 ' + s.n + ' 项参评，样本过少，分数与结论仅供参考';
    if(s.n < 5) return '提示：仅 ' + s.n + ' 项参评，样本偏少';
    if(s.good === 0 || s.bad === 0) return '提示：参评指标全部同向，分数达边界（' + (s.good ? '全好' : '全坏') + '），注意样本代表性';
    return '';
  }
  function scoreBasisHtml(key, name){
    const s = calcScore(key);
    const items = s.contrib.map(c =>
      '<span class="qb-item ' + (c.isGood ? 'qb-good' : 'qb-bad') + '" title="' +
      (c.isGood ? '方向有利' : '方向不利') + '">' + esc(c.name) + ' ' +
      (c.delta > 0 ? '+' : '') + c.delta.toFixed(2) + '</span>').join('');
    const rel = scoreReliability(s);
    return '<div class="qb">' +
      '<div class="qb-line"><b>' + esc(name) + ' ' + (s.final == null ? '—' : s.final) + '</b>' +
      '<span class="qb-sub">参评 ' + s.n + ' 项（好' + s.good + ' / 坏' + s.bad + '）' +
      (s.manual ? ' · 人工修正 ' + (s.manual > 0 ? '+' : '') + s.manual : '') + '</span></div>' +
      '<div class="qb-items">' + (items || '<span class="muted" style="font-size:11px">无有效参评指标</span>') + '</div>' +
      (s.skipped.length ? '<div class="qb-skip">未参评 ' + s.skipped.length + ' 项：' + esc(s.skipped.slice(0, 8).join('、')) + (s.skipped.length > 8 ? ' 等' : '') + '</div>' : '') +
      (rel ? '<div class="qb-warn">' + esc(rel) + '</div>' : '') +
      '</div>';
  }

  /* ===== Regime 四象限：盈利(Growth) × 估值(Valuation) ===== */
  function regimeQuad(){
    const g = calcScore('growth'), v = calcScore('valuation');
    if(g.final == null || v.final == null) return '';
    const gUp = g.final >= 50, vUp = v.final >= 50;
    let cur, warn;
    if(gUp && vUp){ cur='q-rb'; warn='🟢 盈利↑ + 估值扩张 = 最强牛市环境，适合增加权益'; }
    else if(gUp && !vUp){ cur='q-lt'; warn='🟡 盈利↑ + 估值收缩 = 结构性行情，重行业轻指数'; }
    else if(!gUp && vUp){ cur='q-lb'; warn='🟡 盈利↓ + 估值扩张 = 流动性牛市，警惕利率反转'; }
    else { cur='q-rt'; warn='🔴 盈利↓ + 估值收缩 = 最危险组合，降低风险敞口'; }
    const cell = (id, t, s) => '<div class="quad-cell' + (cur===id ? ' quad-cur' : '') + '"><b>' + t + '</b><span>' + s + '</span></div>';
    return '<div class="card macro-quad"><div class="sec-title" style="margin-bottom:8px">' +
      '<h2>🧭 A股 Regime <span class="muted" style="font-weight:400;font-size:12px">经济 ' + g.final + ' × 估值 ' + v.final + '（以 50 为界）</span></h2></div>' +
      '<div class="regime-layout">' +
        '<div class="quad-grid">' +
        cell('q-lt','盈利↑ 估值↓','结构性行情') +
        cell('q-rb','盈利↑ 估值↑','🟢 最强牛市') +
        cell('q-rt','盈利↓ 估值↓','🔴 最危险') +
        cell('q-lb','盈利↓ 估值↑','流动性牛市') +
        '</div>' +
        '<div class="qb-grid">' + scoreBasisHtml('growth', '经济') + scoreBasisHtml('valuation', '估值') + '</div>' +
      '</div>' +
      '<div class="quad-verdict">' + esc(warn) + '</div></div>';
  }

  /* ===== 变化速度预警 ===== */
  function speedWarn(i){
    const pts = (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(pts.length < 2) return '';
    if(!freshnessOk(i)) return '';   // 数据滞后时不发预警，避免用陈旧变化报警
    const l2 = latest2(i);
    const out = [];
    // 汇率：近5期内变化超 ±1.5%（USDCNY 上涨 = 人民币贬值）
    if(i.key === 'usdcny' && pts.length >= 5){
      const a = pts[pts.length-5].value, b = l2.latest;
      if(a && b){
        const chg = (b - a) / a * 100;
        if(chg >= 1.5) out.push(['⚠ 人民币近4期快速贬值 ' + chg.toFixed(2) + '%——贬值速度比绝对值更值得警惕','red']);
        else if(chg <= -1.5) out.push(['人民币近4期快速升值 ' + Math.abs(chg).toFixed(2) + '%','green']);
      }
    }
    // 成交额：近3期均值 vs 前3期均值萎缩超 30%
    if(i.key === 'turnover' && pts.length >= 6){
      const r = pts.slice(-3), p = pts.slice(-6,-3);
      const ra = r.reduce((s,x)=>s+(x.value||0),0)/3, pa = p.reduce((s,x)=>s+(x.value||0),0)/3;
      if(pa && (ra - pa) / pa <= -0.3) out.push(['⚠ 成交额较前期萎缩超 30%——量能不健康','red']);
    }
    if(!out.length) return '';
    return '<div class="speed-warn">' + out.map(o => '<div class="' + (o[1]==='red'?'warn-red':'warn-green') + '">' + o[0] + '</div>').join('') + '</div>';
  }

  /* ===== 宏观 → 行业轮动映射（动态高亮当前受益方向） ===== */
  const ROTATION = [
    { key:'us10y',    dir:-1, label:'美债 10Y ↓', sectors:'成长 · 科技 · 创新药 · 高端制造' },
    { key:'real10y',  dir:-1, label:'实际利率 ↓', sectors:'科技 · 黄金 · 贵金属' },
    { key:'dxy',      dir:-1, label:'美元指数 ↓', sectors:'新兴市场 · 有色资源' },
    { key:'ppi',      dir:1,  label:'PPI ↑',      sectors:'周期 · 资源 · 钢铁化工煤炭' },
    { key:'pmi',      dir:1,  label:'PMI ↑',      sectors:'工业 · 制造' },
    { key:'tsf',      dir:1,  label:'社融 ↑',     sectors:'金融 · 地产 · 周期' },
    { key:'cpi',      dir:1,  label:'CPI ↑',      sectors:'消费' },
    { key:'oil',      dir:1,  label:'原油 ↑',     sectors:'石油 · 化工' },
    { key:'copper',   dir:1,  label:'铜 ↑',       sectors:'有色 · 电力设备' },
    { key:'exports',  dir:1,  label:'出口 ↑',     sectors:'出口制造 · 机械 · 电子' },
  ];
  function rotationTable(){
    // 判断某行当前是否处于"受益"状态
    const active = r => {
      const i = ind(r.key);
      if(!i || isDemoOnly(i) || !freshnessOk(i)) return false;   // 示例数据/数据滞后：不高亮，避免误导
      const l2 = latest2(i);
      if(l2.delta == null || isNaN(l2.delta) || l2.delta === 0) return false;
      return r.dir === 1 ? l2.delta > 0 : l2.delta < 0;
    };
    let h = '<div class="card macro-rot"><div class="sec-title" style="margin-bottom:8px">' +
      '<h2>🔄 宏观 → 行业轮动映射 <span class="muted" style="font-weight:400;font-size:12px">高亮 = 该方向当前成立（按最新环比；数据滞后的指标不参与）</span></h2></div>' +
      '<div class="wide-table-wrap"><table class="val-table"><thead><tr><th>宏观方向</th><th>受益行业</th></tr></thead><tbody>';
    ROTATION.forEach(r => {
      const on = active(r);
      h += '<tr' + (on ? ' class="rot-on"' : '') + '><td>' + esc(r.label) + (on ? ' <span class="badge green">✓</span>' : '') + '</td>' +
        '<td' + (on ? ' style="font-weight:700"' : '') + '>' + esc(r.sectors) + '</td></tr>';
    });
    h += '</tbody></table></div>' +
      '<div class="muted" style="font-size:12px;margin-top:8px">宏观分析的正确打开方式：宏观变量 → 资产定价变量 → 估值/盈利 → 风格 → 行业。机械的"指标↑=涨"长期必然失效。</div></div>';
    return h;
  }

  /* ===== 每日速览条（S级 · 日度） ===== */
  function dailyBrief(){
    const keys = DAILY_KEYS.filter(k => ind(k));
    if(!keys.length) return '';
    let h = '<div class="card macro-daily"><div class="sec-title" style="margin-bottom:10px">' +
      '<h2>⏱ 每日速览 <span class="muted" style="font-weight:400;font-size:12px">每日 5 分钟 · 方向比绝对值重要</span></h2></div>';
    h += '<div class="daily-grid">';
    keys.forEach(k => {
      const i = ind(k);
      const l2 = latest2(i);
      const cls = l2.delta > 0 ? 'up' : (l2.delta < 0 ? 'down' : '');
      const arrow = l2.delta > 0 ? '↑' : (l2.delta < 0 ? '↓' : '—');
      const chg = i.freq === '日度' ? dailyChangeHtml(i, l2) : '';
      const st = staleness(i);
      const demo = isDemoOnly(i);
      const stale = !demo && st != null && st > (FRESH_DAYS[i.freq] || 45);
      const warn = demo ? '（⚠ 仍为内置示例数据，变化量仅供参考）' : (stale ? '（⚠ 数据滞后 ' + st + ' 天，变化量仅供参考）' : '');
      h += '<div class="daily-item' + ((stale || demo) ? ' is-stale' : '') + '" title="' + esc(i.interpret || i.desc || '') + warn + '">' +
        '<div class="d-name">' + esc(i.name) + '</div>' +
        '<div class="d-val ' + cls + '">' + (l2.latest != null ? Number(l2.latest).toFixed(2) : '—') +
        '<small>' + esc(i.unit || '') + (chg ? '' : ' ' + arrow) + '</small></div>' +
        '<div class="d-date muted">' + esc(l2.date || '') + chg + '</div></div>';
    });
    h += '</div>';
    // FedWatch 概率摘要（下一次会议）
    const fw = (DB.macro.fedwatch || []).slice().sort((a,b) => String(a.meeting).localeCompare(String(b.meeting)));
    if(fw.length){
      const n = fw[0];
      h += '<div class="daily-fedwatch">🧭 FedWatch · ' + esc(n.meeting) + ' 会议：' +
        '<b>降息 ' + n.cut + '%' + fwDeltaHtml(n, 'cut') + '</b> · 不变 ' + n.hold + '%' + fwDeltaHtml(n, 'hold') +
        ' · 加息 ' + n.hike + '%' + fwDeltaHtml(n, 'hike') +
        '<span class="muted" style="font-size:11px;margin-left:8px">关注概率的边际变化，而非利率本身</span></div>';
    }
    return h + '</div>';
  }

  /* ===== FedWatch 概率表 ===== */
  function fedwatchTable(){
    const list = (DB.macro.fedwatch || []).slice().sort((a,b) => String(a.meeting).localeCompare(String(b.meeting)));
    let h = '<div class="card macro-fw"><div class="sec-title" style="margin-bottom:8px">' +
      '<h2>🧭 FedWatch 利率概率 <span class="muted" style="font-weight:400;font-size:12px">市场对未来利率路径的重新定价 · 比 FOMC 结果更重要</span></h2>' +
      '<button class="btn ghost sm" data-action="macro.fwAdd">＋ 记录</button></div>';
    if(!list.length) return h + '<div class="empty">暂无记录 · 从 CME FedWatch 查询未来 FOMC 会议的降息/不变/加息概率后录入</div></div>';
    h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
      '<th>FOMC 会议</th><th class="num">降息 %</th><th class="num">不变 %</th><th class="num">加息 %</th><th>更新</th><th></th></tr></thead><tbody>';
    list.forEach(n => {
      const dsum = (n.cut||0)+(n.hold||0)+(n.hike||0);
      const warn = dsum !== 100 ? '<span class="badge amber" title="概率合计≠100">!</span>' : '';
      h += '<tr><td><b>' + esc(n.meeting) + '</b> ' + warn + '</td>' +
        '<td class="num up">' + (n.cut||0) + fwDeltaHtml(n, 'cut') + '</td>' +
        '<td class="num">' + (n.hold||0) + fwDeltaHtml(n, 'hold') + '</td>' +
        '<td class="num down">' + (n.hike||0) + fwDeltaHtml(n, 'hike') + '</td>' +
        '<td class="muted" style="font-size:12px">' + esc(n.updated||'') + '</td>' +
        '<td class="actions-cell"><button class="icon-btn" title="编辑" data-action="macro.fwEdit" data-id="' + n.id + '">✎</button>' +
        '<button class="icon-btn" title="删除" data-action="macro.fwDel" data-id="' + n.id + '">✕</button></td></tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  /* ===== CPI × PPI 四象限 ===== */
  function cpiPpiQuad(){
    const c = ind('cpi'), p = ind('ppi');
    if(!c || !p) return '';
    const cv = latest2(c).latest, pv = latest2(p).latest;
    if(cv == null || pv == null) return '';
    const cUp = cv >= 0, pUp = pv >= 0;
    // 四象限判定
    let cur, warn = '';
    if(cUp && pUp){ cur = 'q1'; warn = '需求/通胀较强，周期与消费均有支撑'; }
    else if(cUp && !pUp){ cur = 'q2'; warn = '消费相对强、工业承压——利好下游消费，利空上游周期'; }
    else if(!cUp && pUp){ cur = 'q4'; warn = '上游供给/结构性问题——成本挤压中下游利润'; }
    else { cur = 'q3'; warn = '⚠ CPI↓ + PPI↓ = 通缩风险，企业盈利承压，需政策强刺激对冲'; }
    const cell = (id, title, sub) =>
      '<div class="quad-cell' + (cur === id ? ' quad-cur' : '') + '"><b>' + title + '</b><span>' + sub + '</span></div>';
    return '<div class="card macro-quad"><div class="sec-title" style="margin-bottom:8px">' +
      '<h2>🎯 CPI × PPI 组合 <span class="muted" style="font-weight:400;font-size:12px">CPI ' + cv.toFixed(1) + '% · PPI ' + pv.toFixed(1) + '%</span></h2></div>' +
      '<div class="quad-grid">' +
      cell('q2', 'CPI↑ PPI↓', '消费强 · 工业承压') +
      cell('q1', 'CPI↑ PPI↑', '需求/通胀较强') +
      cell('q3', 'CPI↓ PPI↓', '⚠ 通缩风险') +
      cell('q4', 'CPI↓ PPI↑', '上游/结构问题') +
      '</div><div class="quad-verdict">' + esc(warn) + '</div></div>';
  }

  /* ===== 股债收益差 ===== */
  function equityBondSpread(){
    const pe = ind('hs300pe'), cn = ind('cn10y');
    if(!pe || !cn) return '';
    const pv = latest2(pe).latest, yv = latest2(cn).latest;
    if(pv == null || yv == null || pv <= 0) return '';
    const ey = 100 / pv;                       // 盈利收益率 = 1/PE
    const spread = ey - yv;
    const pos = spread >= 4 ? '高（股票相对便宜，适合配置）' : (spread <= 2 ? '低（股票相对贵，谨慎）' : '中性');
    let h = '<div class="card macro-spread"><div class="sec-title" style="margin-bottom:8px">' +
      '<h2>⚖️ 股债收益差 <span class="muted" style="font-weight:400;font-size:12px">沪深300盈利收益率 − 10Y国债 · 长期资产配置温度计</span></h2></div>';
    h += '<div class="spread-line">盈利收益率 ' + ey.toFixed(2) + '%（1/' + pv.toFixed(1) + '）− 10Y国债 ' + yv.toFixed(2) + '% = ' +
      '<b class="' + (spread >= 4 ? 'up' : (spread <= 2 ? 'down' : '')) + '">' + spread.toFixed(2) + '%</b>' +
      '<span class="muted" style="margin-left:8px">' + pos + '</span></div>';
    // 历史曲线：PE 与 10Y 国债按月对齐后逐月计算收益差（遵循顶部日期区间筛选）
    const series = spreadSeries();
    if(series.length >= 3){
      h += '<div class="macro-chart">' + lineChart(
        { id:'__spread', key:'__spread', name:'股债收益差', unit:'%', points: series.map(s => ({date:s.date, value:+s.value.toFixed(2)})) }
      ) + '</div>' +
      '<div class="muted" style="font-size:12px;margin-top:6px">≥4% 股票相对便宜 · ≤2% 股票相对贵。不是精准择时指标，但适合做长期配置温度计。</div>';
    } else {
      h += '<div class="muted" style="font-size:12px;margin-top:6px">不是精准择时指标，但适合做长期配置温度计：收益差非常高 = 股票相对便宜；非常低 = 股票相对贵。沪深300 PE 与 10Y 国债数据齐全后自动绘制历史曲线。</div>';
    }
    return h + '</div>';
  }

  /* ================= 三期：分位数 / 流动性×经济 Regime / M1-M2 剪刀差 / FedWatch 边际变化 ================= */

  // 历史分位数：最新值在全部历史中的百分位（0-100，越高代表当前值比历史上越多时期大）
  function percentileOf(i){
    const pts = (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date));
    const vals = pts.map(p => p.value).filter(v => v != null && !isNaN(v));
    if(vals.length < 24) return null;          // 少于 24 期没有统计意义
    const latest = vals[vals.length-1];
    const below = vals.filter(v => v <= latest).length;
    return Math.round(below / vals.length * 100);
  }
  // 指标卡片右上角的分位徽章（market 层 + 数据充足时显示）
  function percentileBadge(i){
    if(i.layer !== 'market') return '';
    const pc = percentileOf(i);
    if(pc == null) return '';
    return '<span class="badge indigo pct-badge" title="最新值处于全部历史（≥24期）的第 ' + pc + '% 分位。估值本身无意义，分位数才有意义。">' + pc + '% 分位</span>';
  }

  // 股债收益差历史序列：PE（周度）与 10Y 国债（日度）按月对齐，取每月末值计算 1/PE − Y
  function spreadSeries(){
    const pe = ind('hs300pe'), cn = ind('cn10y');
    if(!pe || !cn) return [];
    const ym = {};                              // 月 → 该月最后一个国债收益率
    (cn.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(p => {
      const k = monthKey(p.date);
      if(k && p.value != null && !isNaN(p.value)) ym[k] = p.value;
    });
    const pm = {};                              // 月 → 该月最后一个 PE
    (pe.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(p => {
      const k = monthKey(p.date);
      if(k && p.value != null && p.value > 0) pm[k] = p.value;
    });
    return Object.keys(pm).filter(k => ym[k] != null).sort()
      .map(k => ({ date:k, value: 100 / pm[k] - ym[k] }));
  }
  // 任意日期字符串 → 'YYYY-MM'（'2026-08-29'/'2026-08'→'2026-08'；'2026Q1'→'2026-01'；'2026'→'2026-01'）
  function monthKey(d){
    const s = String(d);
    let m = s.match(/^(\d{4})-(\d{2})/);
    if(m) return m[1] + '-' + m[2];
    m = s.match(/^(\d{4})Q([1-4])$/);
    if(m) return m[1] + '-0' + ((+m[2]-1)*3+1);
    m = s.match(/^(\d{4})$/);
    if(m) return m[1] + '-01';
    return null;
  }

  // 流动性 × 经济 Regime（建议§48）：宽松复苏/宽松衰退/紧缩强劲/紧缩衰退
  function regimeLxG(){
    const l = calcScore('liquidity'), g = calcScore('growth');
    if(l.final == null || g.final == null) return '';
    const lUp = l.final >= 50, gUp = g.final >= 50;
    let cur, warn;
    if(lUp && gUp){ cur='r1'; warn='🟢 Regime 1 · 宽松 + 复苏：盈利估值双击的最佳环境，适合增加权益'; }
    else if(lUp && !gUp){ cur='r2'; warn='🟡 Regime 2 · 宽松 + 衰退：流动性牛市，成长风格可能占优，警惕盈利持续恶化'; }
    else if(!lUp && gUp){ cur='r3'; warn='🟡 Regime 3 · 紧缩 + 强劲：价值/周期相对占优，提防估值收缩'; }
    else { cur='r4'; warn='🔴 Regime 4 · 紧缩 + 衰退：最危险组合，降低风险敞口'; }
    const cell = (id, t, s) => '<div class="quad-cell' + (cur===id ? ' quad-cur' : '') + '"><b>' + t + '</b><span>' + s + '</span></div>';
    return '<div class="card macro-quad macro-regime"><div class="sec-title" style="margin-bottom:8px">' +
      '<h2>🧭 宏观 Regime <span class="muted" style="font-weight:400;font-size:12px">流动性 ' + l.final + ' × 经济 ' + g.final + '（以 50 为界）</span></h2></div>' +
      '<div class="regime-layout">' +
        '<div class="quad-grid">' +
        cell('r2','流动性宽松 · 经济弱','宽松交易 / 成长占优') +
        cell('r1','流动性宽松 · 经济强','🟢 宽松复苏') +
        cell('r4','流动性紧缩 · 经济弱','🔴 紧缩衰退') +
        cell('r3','流动性紧缩 · 经济强','价值/周期占优') +
        '</div>' +
        '<div class="qb-grid">' + scoreBasisHtml('liquidity', '流动性') + scoreBasisHtml('growth', '经济') + '</div>' +
      '</div>' +
      '<div class="quad-verdict">' + esc(warn) + '</div></div>';
  }

  // M1 − M2 剪刀差（建议§14）：资金活化程度观测
  function m1m2Scissors(){
    const m1 = ind('m1'), m2 = ind('m2');
    if(!m1 || !m2) return '';
    const a = latest2(m1), b = latest2(m2);
    if(a.latest == null || b.latest == null) return '';
    const cur = a.latest - b.latest;
    const prev = (a.prev != null && b.prev != null) ? a.prev - b.prev : null;
    const d = prev != null ? cur - prev : null;
    const narrowing = d != null && d > 0.01;   // 剪刀差收窄（差值上升，向 0 靠拢或转正）
    let verdict;
    if(cur >= 0) verdict = '资金活化：企业活期资金活跃，利好权益';
    else if(narrowing) verdict = '剪刀差收窄中：资金开始从"存起来"转向"流动起来"，边际改善';
    else verdict = '资金存款化：企业资金活跃度弱，内需动能待改善';
    return '<div class="card macro-scissors"><div class="sec-title">' +
      '<h2>✂️ M1−M2 剪刀差 <span class="muted" style="font-weight:400;font-size:12px">资金活化程度 · M1 ' + a.latest.toFixed(1) + '% − M2 ' + b.latest.toFixed(1) + '%</span></h2></div>' +
      '<div class="scissors-box"><span class="scissors-val ' + (d != null ? (d > 0 ? 'up' : 'down') : '') + '">' + (cur > 0 ? '+' : '') + cur.toFixed(1) + 'pp</span>' +
      (d != null ? '<span class="' + (d > 0 ? 'up' : 'down') + '" style="font-size:13px;font-weight:700">环比 ' + (d > 0 ? '↑' : '↓') + ' ' + Math.abs(d).toFixed(1) + 'pp</span>' : '') +
      '<span class="muted" style="font-size:12px">' + esc(verdict) + '</span></div></div>';
  }

  // FedWatch 概率相对上次记录的边际变化（建议§4：关注概率的边际变化，而非利率本身）
  function fwDeltaHtml(n, k){
    if(!n.prev || n.prev[k] == null || n.prev[k] === n[k]) return '';
    const d = n[k] - n.prev[k];
    if(!d) return '';
    return '<span class="fw-delta ' + (d > 0 ? 'up' : 'down') + '">' + (d > 0 ? '↑' : '↓') + Math.abs(d) + '</span>';
  }

  /* ===== L1/L2 温度计池：阈值红黄绿灯体系 =====
   * 与上面的「环比投票温度计」互补：投票温度计回答"方向"，阈值灯回答"位置/边界"。
   * 灯判定：
   *   dir='above'：值 ≥ green 绿 / ≥ yellow 黄 / 否则红（越高越好）
   *   dir='below'：值 ≤ green 绿 / ≤ yellow 黄 / 否则红（越低越好）
   *   dir='up'   ：环比 ↑ 绿 / ↓ 红（价格类高频指标用环比，不设绝对阈值）
   *   dir='down' ：环比 ↓ 绿 / ↑ 红
   *   无数据 → ⚪ 待更新（不参与池汇总） */
  const LAMP = { green:'🟢', yellow:'🟡', red:'🔴', none:'⚪' };
  function findPool(pid){ return (DB.macro.pools||[]).find(p => p.id === pid) || null; }
  function poolItemValue(item){
    if(item.ref === 'fedwatch'){
      const fw = (DB.macro.fedwatch||[]).slice().sort((a,b) => String(a.meeting).localeCompare(String(b.meeting)));
      const n = fw[fw.length-1];
      if(!n) return { val:null };
      return { val:n.hike, date:n.meeting + ' 会议',
        delta:(n.prev && n.prev.hike != null) ? (n.hike - n.prev.hike) : null };
    }
    const m = /^ind:(.+)$/.exec(item.ref || '');
    const i = m ? ind(m[1]) : null;
    if(!i) return { val:null, missing:true };
    const l2 = latest2(i);
    return { val:l2.latest, date:l2.date, delta:l2.delta, ind:i };
  }
  function lampOf(item){
    const r = poolItemValue(item);
    if(r.val == null) return Object.assign({ lamp:'none' }, r);
    const v = Number(r.val);
    let lamp = 'red';
    if(item.dir === 'above'){ lamp = v >= item.green ? 'green' : (v >= item.yellow ? 'yellow' : 'red'); }
    else if(item.dir === 'below'){ lamp = v <= item.green ? 'green' : (v <= item.yellow ? 'yellow' : 'red'); }
    else if(item.dir === 'up'){ lamp = r.delta == null ? 'none' : (r.delta > 0 ? 'green' : (r.delta < 0 ? 'red' : 'yellow')); }
    else if(item.dir === 'down'){ lamp = r.delta == null ? 'none' : (r.delta < 0 ? 'green' : (r.delta > 0 ? 'red' : 'yellow')); }
    else { lamp = 'none'; }
    return Object.assign({ lamp }, r);
  }
  function poolWorst(pool){
    const lamps = (pool.items||[]).map(it => lampOf(it).lamp);
    if(lamps.indexOf('red') >= 0) return 'red';
    if(lamps.indexOf('yellow') >= 0) return 'yellow';
    if(lamps.indexOf('green') >= 0) return 'green';
    return 'none';
  }
  function fmtVal(v){
    if(v == null || isNaN(Number(v))) return '—';
    return Number(v).toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  }
  // 数值 + 趋势箭头（环比 delta 可用时显示）
  function trendHtml(r){
    if(r.delta == null || isNaN(Number(r.delta)) || Number(r.delta) === 0) return '';
    const d = Number(r.delta);
    const cls = d > 0 ? 'var(--up,#c0392b)' : 'var(--down,#27ae60)';
    return ' <span style="font-size:11px;color:' + cls + '">' + (d > 0 ? '▲' : '▼') + fmtVal(Math.abs(d)) + '</span>';
  }
  // 单元格数值：优先用指标自己的单位，item.unit 仅作覆盖
  function itemUnit(item, r){ return item.unit || (r.ind && r.ind.unit) || ''; }
  function lampSummaryText(status){
    return status === 'red' ? '有红灯' : (status === 'yellow' ? '有黄灯' : (status === 'green' ? '全绿' : '待更新'));
  }
  function l1Conclusion(red, yellow){
    if(red >= 3) return '🔴×' + red + ' 宏观对成长股全面逆风——防守优先，先降仓位弹性再看个股';
    if(red >= 2) return '宏观逆风明显：控制总仓位，红灯指向的方向坚决回避';
    if(red === 1) return '宏观中性偏谨慎：避开红灯项压制的方向，其余按个股逻辑执行';
    if(yellow) return '宏观中性：暂无红灯，盯住黄灯项的边际变化';
    return '宏观顺风：环境不构成约束，按行业池与个股纪律进攻';
  }
  /* ----- 数据自动同步：进入宏观雷达时自动拉取仓库 CSV（http/https 下可用） -----
   * file:// 打开时浏览器拦截 fetch → 给出明确的「导入全部」指引（FileReader 不受限制）。 */
  let macroAutoSynced = false;
  function maybeAutoSync(){
    if(macroAutoSynced) return;
    macroAutoSynced = true;
    if(location.protocol === 'file:'){ state.macroSyncHint = true; return; }
    fetch('data/macro/宏观经济_全部数据.csv', { cache: 'no-store' })
      .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
      .then(t => {
        const r = csvToAllGroups(parseCsvSimple(t));
        if(r.points){ save(); render(); toast('宏观雷达已自动同步仓库数据（写入 ' + r.points + ' 条）'); }
      })
      .catch(() => { state.macroSyncHint = true; });
  }
  /* ----- 迷你走势图（近 N 期）+ 周期位置分位：让"当前处于周期什么位置"一眼可见 ----- */
  function _sparkWindow(points, n){
    return (points||[]).filter(p => p.value != null && !isNaN(Number(p.value)))
      .slice(-n).map(p => Number(p.value));
  }
  function sparkSvg(points, w, h, n){
    const vs = _sparkWindow(points, n || 10);
    if(vs.length < 2) return '';
    const mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    const rng = (mx - mn) || 1;
    const step = w / (vs.length - 1);
    const xy = vs.map((v, i) => (i * step).toFixed(1) + ',' + (h - 2 - (v - mn) / rng * (h - 4)).toFixed(1));
    const up = vs[vs.length - 1] >= vs[0];
    return '<svg width="' + w + '" height="' + h + '" style="vertical-align:middle;overflow:visible;flex:none">' +
      '<polyline points="' + xy.join(' ') + '" fill="none" stroke="' +
      (up ? 'var(--up,#c0392b)' : 'var(--down,#27ae60)') + '" stroke-width="1.5"/>' +
      '</svg>';
  }
  // 最新值在近 N 期中的分位（0=区间最低，100=区间最高）；样本不足返回 null
  function windowPct(points, n){
    const vs = _sparkWindow(points, n || 10);
    if(vs.length < 3) return null;
    const last = vs[vs.length - 1];
    const below = vs.filter(v => v < last).length;
    return Math.round(below / (vs.length - 1) * 100);
  }
  // 周期位置文字：分位 → 白话解读
  function cyclePosText(pct, dir){
    if(pct == null) return '';
    if(dir === 'below'){   // 越低越好的指标（如美债利率）：高分位反而是压力位
      if(pct >= 80) return '近10期 ' + pct + '% 分位（区间顶部·压力区）';
      if(pct <= 20) return '近10期 ' + pct + '% 分位（区间底部·缓解区）';
      return '近10期 ' + pct + '% 分位（区间中位）';
    }
    if(pct >= 80) return '近10期 ' + pct + '% 分位（区间顶部·过热警惕）';
    if(pct <= 20) return '近10期 ' + pct + '% 分位（区间底部·左侧机会）';
    return '近10期 ' + pct + '% 分位（区间中位）';
  }
  function poolsHtml(){
    const pools = DB.macro.pools || [];
    const l1 = pools.find(p => p.fixed) || null;
    const l2 = pools.filter(p => p !== l1);
    let h = '';
    /* ---- L1 宏观温度计（天气层） ---- */
    if(l1){
      const rows = (l1.items||[]).map(it => ({ it, r: lampOf(it) }));
      const red = rows.filter(x => x.r.lamp === 'red').length;
      const yellow = rows.filter(x => x.r.lamp === 'yellow').length;
      const green = rows.filter(x => x.r.lamp === 'green').length;
      const worst = red ? 'red' : (yellow ? 'yellow' : (green ? 'green' : 'none'));
      h += '<div class="card macro-quad" style="margin-top:16px">' +
        '<div class="sec-title" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
          '<h2 style="margin:0">🌡️ ' + esc(l1.name) + '</h2>' +
          '<span class="badge ' + (worst === 'red' ? 'red' : (worst === 'yellow' ? 'amber' : 'green')) + '">' +
            '红 ' + red + ' · 黄 ' + yellow + ' · 绿 ' + green + '</span>' +
          '<span class="muted" style="font-weight:400;font-size:12px">天气层 · 影响全部持仓</span>' +
          '<span style="flex:1"></span>' +
          '<button class="btn ghost sm" data-action="macro.poolItemAdd" data-pid="' + l1.id + '">＋ 指标</button>' +
        '</div>' +
        '<div class="muted" style="font-size:12px;margin-bottom:10px">' + esc(l1.desc || '') + '</div>' +
        '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
          '<th>灯</th><th style="min-width:110px">指标</th><th>最新值</th><th style="min-width:150px">阈值口径</th><th style="min-width:220px">证伪线</th><th style="min-width:220px">触发动作</th><th></th>' +
        '</tr></thead><tbody>';
      rows.forEach(x => {
        const it = x.it, r = x.r;
        const th = (it.dir === 'above' ? '≥' + fmtVal(it.green) + ' 绿 / ≥' + fmtVal(it.yellow) + ' 黄'
          : it.dir === 'below' ? '≤' + fmtVal(it.green) + ' 绿 / ≤' + fmtVal(it.yellow) + ' 黄'
          : it.dir === 'up' ? '环比↑ 绿 / ↓ 红' : '环比↓ 绿 / ↑ 红');
        h += '<tr>' +
          '<td style="font-size:15px" title="' + esc(it.falsify || '') + '">' + LAMP[r.lamp] + '</td>' +
          '<td><b>' + esc(it.label) + '</b>' + (it.note ? '<div class="muted" style="font-size:11px">' + esc(it.note) + '</div>' : '') + '</td>' +
          '<td style="white-space:nowrap"><b style="font-size:14px">' + fmtVal(r.val) + '</b>' +
            (itemUnit(it, r) ? '<span class="muted" style="font-size:11px"> ' + esc(itemUnit(it, r)) + '</span>' : '') + trendHtml(r) +
            (r.ind ? ' ' + sparkSvg(r.ind.points, 72, 20) : '') +
            (r.date ? '<div class="muted" style="font-size:11px">' + esc(r.date) + (r.ind ? ' · ' + esc(cyclePosText(windowPct(r.ind.points, 10), it.dir)) : '') + '</div>' : '') + '</td>' +
          '<td class="muted" style="font-size:12px">' + esc(th) + '</td>' +
          '<td class="muted" style="font-size:12px">' + (it.falsify ? esc(it.falsify) : '—') + '</td>' +
          '<td style="font-size:12px">' + (it.action ? esc(it.action) : '—') + '</td>' +
          '<td class="actions-cell" style="white-space:nowrap">' +
            '<button class="icon-btn" title="编辑" data-action="macro.poolItemEdit" data-pid="' + l1.id + '" data-iid="' + it.id + '">✎</button>' +
            '<button class="icon-btn" title="移除" data-action="macro.poolItemDel" data-pid="' + l1.id + '" data-iid="' + it.id + '">✕</button></td>' +
        '</tr>';
      });
      h += '</tbody></table></div>' +
        '<div style="font-size:13px;margin-top:10px;padding:8px 12px;background:var(--bg2,#f6f7f9);border-radius:8px">' +
          '<b>→ 结论：</b>' + l1Conclusion(red, yellow) + '</div>' +
        '<div class="muted" style="font-size:11px;margin-top:6px">⚪ = 数据待更新（去对应指标卡或「⚡ 每日快捷录入」补数）。灯体系回答"位置"，三温度计回答"方向"，两者结合再看 Regime。</div>' +
        '</div>';
    }
    /* ---- L2 行业温度计（季节层） ---- */
    h += '<div class="sec-title" style="margin:20px 0 4px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">' +
      '<h2 style="margin:0">🧩 L2 · 行业温度计</h2>' +
      '<span class="muted" style="font-weight:400;font-size:12px">季节层 · 决定板块轮动 · 每池绑定阈值 + 证伪线 + 触发动作</span>' +
      '<span style="flex:1"></span>' +
      '<button class="btn ghost sm" data-action="macro.poolAdd">＋ 新增行业池</button></div>' +
      '<div class="muted" style="font-size:11px;margin:0 0 10px">读法：🟢🟡🔴 回答「现在能不能碰」，📉 迷你走势 + <b>近10期分位</b> 回答「处于周期什么位置」——' +
      '低位连涨 = 上行早期（右侧加仓窗口），高分位滞涨 = 顶部区（只减不加）。⚪ 待更新 = 到对应指标卡录入数据（周报口径项按周补）。</div>';
    if(!l2.length){
      h += '<div class="card"><div class="empty">还没有行业池。点「＋ 新增行业池」把你在跟踪的板块加进来（数据源用第六层「行业高频」指标或任意宏观指标）。</div></div>';
      return h;
    }
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(560px,1fr));gap:14px">';
    l2.forEach(p => {
      const worst = poolWorst(p);
      h += '<div class="card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
          '<b style="font-size:15px">' + esc((p.icon ? p.icon + ' ' : '') + p.name) + '</b>' +
          '<span title="' + esc(lampSummaryText(worst)) + '" style="font-size:15px">' + LAMP[worst] + '</span>' +
          '<span class="badge ' + (worst === 'red' ? 'red' : (worst === 'yellow' ? 'amber' : 'green')) + '" style="font-size:10px">' + esc(lampSummaryText(worst)) + '</span>' +
          '<span style="flex:1"></span>' +
          '<button class="icon-btn" title="编辑池（名称/逻辑/证伪线）" data-action="macro.poolEdit" data-pid="' + p.id + '">✎</button>' +
          '<button class="icon-btn" title="添加指标项" data-action="macro.poolItemAdd" data-pid="' + p.id + '">＋</button>' +
          '<button class="icon-btn" title="删除池" data-action="macro.poolDel" data-pid="' + p.id + '">✕</button>' +
        '</div>' +
        (p.desc ? '<div style="font-size:12px;margin-top:4px;color:var(--ink2)"><b>核心逻辑：</b>' + esc(p.desc) + '</div>' : '') +
        '<div style="margin-top:10px">';
      (p.items||[]).forEach(it => {
        const r = lampOf(it);
        const pct = r.ind ? windowPct(r.ind.points, 10) : null;
        const tip = [it.note,
          it.falsify ? '证伪线：' + it.falsify : '',
          it.action ? '触发动作：' + it.action : ''].filter(Boolean).join('　|　');
        h += '<div style="padding:7px 0;border-bottom:1px dashed var(--line,#e5e7eb)">' +
          '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
            '<span style="font-size:15px" title="' + esc(tip) + '">' + LAMP[r.lamp] + '</span>' +
            '<b style="min-width:110px;font-size:13px">' + esc(it.label) + '</b>' +
            '<span style="white-space:nowrap"><b style="font-size:14px">' + fmtVal(r.val) + '</b>' +
              (itemUnit(it, r) ? '<span class="muted" style="font-size:10px"> ' + esc(itemUnit(it, r)) + '</span>' : '') + trendHtml(r) + '</span>' +
            (r.ind ? sparkSvg(r.ind.points, 110, 24) : '') +
            (pct != null ? '<span class="badge gray" style="font-size:10px" title="最新值在近 10 期数据中的相对位置">' + esc(cyclePosText(pct, it.dir)) + '</span>' : '') +
            (r.date ? '<span class="muted" style="font-size:10px">' + esc(r.date) + '</span>' : '') +
            '<span style="flex:1"></span>' +
            '<button class="icon-btn" style="font-size:10px;padding:0 4px" title="' + esc(tip || '编辑') + '" data-action="macro.poolItemEdit" data-pid="' + p.id + '" data-iid="' + it.id + '">✎</button>' +
          '</div>' +
          (it.note ? '<div class="muted" style="font-size:11px;padding-left:24px;margin-top:2px">💡 ' + esc(it.note) + '</div>' : '') +
          (it.action ? '<div style="font-size:11px;padding-left:24px;margin-top:2px">🎯 <b>触发动作：</b>' + esc(it.action) + '</div>' : '') +
          (it.falsify ? '<div class="muted" style="font-size:11px;padding-left:24px;margin-top:2px">⛔ <b>证伪线：</b>' + esc(it.falsify) + '</div>' : '') +
          '</div>';
      });
      if(!(p.items||[]).length) h += '<div class="muted" style="font-size:12px">暂无指标项，点右上「＋」添加。</div>';
      if(p.falsify) h += '<div style="font-size:12px;margin-top:10px;padding:8px 12px;background:var(--bg2,#f6f7f9);border-radius:8px">⛔ <b>池级证伪线：</b>' + esc(p.falsify) + '</div>';
      h += '</div></div>';
    });
    h += '</div>';
    return h;
  }

  /* ----- 主视图：五层体系渲染 ----- */
  function renderMacro(){
    maybeAutoSync();
    const gs = groups() || [];
    let h = header('🌐 宏观雷达', '传导链：海外利率/美元 → 全球流动性 → 人民币 → 中国货币 → 信用 → 经济 → 盈利 → A股估值',
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" data-action="macro.syncCsv" title="从仓库 data/macro/宏观经济_全部数据.csv 拉取最新数据并增量合并（需通过 http(s) 打开页面）">🔄 同步最新数据</button>' +
      '<button class="btn ghost sm" data-action="macro.exportAll" title="导出全部宏观经济数据为一个 CSV">⬇ 导出全部</button>' +
      '<button class="btn ghost sm" data-action="macro.importAll" title="导入宏观经济数据 CSV（含全部指标）">⬆ 导入全部</button>' +
      '<button class="btn primary" style="background:var(--indigo)" data-action="macro.add">＋ 添加指标</button>' +
      '</div>');
    if(state.macroSyncHint){
      h += '<div class="card" style="padding:10px 14px;border-left:4px solid var(--amber,#e67e22)">' +
        '<b>📥 指标数据还没同步进来</b><span class="muted" style="font-size:12px">——当前通过 file:// 打开，浏览器禁止自动读取数据文件。' +
        '点右上角「⬆ 导入全部」，选择仓库的 <code>data/macro/宏观经济_全部数据.csv</code>，即可一次填充全部指标' +
        '（文件选择不受该限制）。用 http(s) 打开时会自动同步，无需手动。</span></div>';
    }

    // ① 每日速览（S级日度 + FedWatch 摘要）
    h += dailyBrief();

    // ①½ L1 宏观温度计（阈值红黄绿灯）+ L2 行业温度计（板块池）
    h += poolsHtml();

    // ② 宏观仪表盘：三温度计 + Regime 四象限 + 流动性×经济 Regime（半自动打分）
    h += thermometersHtml();
    h += regimeQuad();
    h += regimeLxG();

    // 顶部快捷录入按钮
    h += '<div style="margin:0 0 16px;display:flex;justify-content:flex-end">' +
      '<button class="btn ghost sm" data-action="macro.quickDaily" title="一次性录入今天的全部日度指标">⚡ 每日快捷录入</button></div>';

    // 日期范围筛选
    h += '<div class="chips" style="margin:0 0 16px">' +
      MACRO_RANGES.map(r => '<button class="chip ' + ((state.macroRange||'5y') === r.key ? 'active' : '') + '" data-action="macro.fRange" data-v="' + r.key + '">' + r.label + '</button>').join('') +
      '<span class="muted" style="font-size:12px;margin-left:8px">所有图表按所选区间显示</span></div>';

    if(!gs.length){ h += '<div class="card"><div class="empty">还没有宏观数据，点击右上角添加指标或导入 CSV</div></div>'; return h; }

    // ②~⑥ 五层分区
    LAYERS.forEach(layer => {
      const list = allIndicators().filter(i => i.layer === layer.key);
      if(!list.length) return;
      const sCount = list.filter(i => i.importance === 'S').length;
      h += '<div class="macro-layer">' +
        '<div class="macro-layer-head"><div class="ml-title">' + layer.icon + ' <b>' + esc(layer.name) + '</b>' +
        '<span class="badge indigo">' + esc(layer.tag) + '</span>' +
        (sCount ? '<span class="badge red" title="S级指标数">S×' + sCount + '</span>' : '') + '</div>' +
        '<div class="muted" style="font-size:12px">' + esc(layer.desc) + '</div></div>';
      // 层内特殊组件
      if(layer.key === 'global_liq') h += fedwatchTable();
      if(layer.key === 'cn_liq') h += m1m2Scissors();
      if(layer.key === 'price') h += cpiPpiQuad();
      if(layer.key === 'market'){ h += equityBondSpread(); h += rotationTable(); }
      // 指标卡片：S 级在前
      const sorted = list.slice().sort((a,b) => ({S:0,A:1,B:2}[a.importance||'B'] - {S:0,A:1,B:2}[b.importance||'B']));
      h += '<div class="macro-cards">' + sorted.map(indicatorCard).join('') + '</div></div>';
    });

    // 数据管理说明
    h += '<div class="import-help">' +
      '<b>📦 数据导入 / 导出</b>' +
      '<span>运行 <code>py scripts/fetch_macro_all.py</code> 抓取数据到 <code>data/macro/宏观经济_全部数据.csv</code>，然后「⬆ 导入全部」。新导入的指标默认归入对应层（按 key 自动识别），也可在编辑指标时调整层级。</span></div>';
    return h;
  }

  /* ----- 弹窗辅助 ----- */
  // 查找某指标所属的表（group）；找不到返回 null
  function groupOfIndicator(iid){
    return (groups()||[]).find(g => (g.indicators||[]).some(x => x.id === iid)) || null;
  }
  function indModalBody(i){
    const d = i || {};
    // 所属表：编辑时取指标所在组；新建时默认第一张表（国内）
    const curGid = d.id ? (groupOfIndicator(d.id) || { id:'' }).id : ((groups()||[])[0] || {}).id;
    const curLayer = d.layer || 'cn_econ';
    const curImp = d.importance || 'B';
    return '<input type="hidden" name="id" value="' + (d.id || '') + '">' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>指标名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required value="' + esc(d.name||'') + '" placeholder="如：CPI 同比"></div>' +
      '<div class="field" style="flex:none;width:120px"><label>单位</label><input type="text" name="unit" value="' + esc(d.unit||'') + '" placeholder="如：%"></div></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>所属层级</label><select name="layer">' + LAYERS.map(l => '<option value="' + l.key + '" ' + (l.key === curLayer ? 'selected' : '') + '>' + esc(l.name.replace(/^第.层 · /,'')) + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:none;width:100px"><label>重要性</label><select name="importance">' + ['S','A','B'].map(x => '<option ' + (x === curImp ? 'selected' : '') + '>' + x + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:none;width:140px"><label>频率</label><select name="freq">' + FREQS.map(f => '<option value="' + f + '" ' + ((d.freq||'月度') === f ? 'selected' : '') + '>' + f + '</option>').join('') + '</select></div></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>所属表（CSV）</label><select name="gid">' + (groups()||[]).map(g => '<option value="' + esc(g.id) + '" ' + (g.id === curGid ? 'selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:1"><label>指标 key（英文标识，留空自动生成）</label><input type="text" name="key" value="' + esc(d.key||'') + '" placeholder="如：cpi"></div></div>' +
      '<div class="field"><label>指标说明 / 解读提示</label><textarea name="desc" rows="2" placeholder="这个指标代表什么？怎么解读？（如：10Y↓ 未必利好，先问为什么跌）">' + esc(d.desc||'') + '</textarea></div>';
  }
  /* ----- L1/L2 温度计池：编辑弹窗体 ----- */
  function poolItemModalBody(p, it){
    const d = it || {};
    const refVal = d.ref || '';
    const refOpts = '<option value="fedwatch"' + (refVal === 'fedwatch' ? ' selected' : '') + '>FedWatch 最新会议加息概率</option>' +
      (groups()||[]).map(g => '<optgroup label="' + esc(g.name) + '">' +
        (g.indicators||[]).map(i => '<option value="ind:' + esc(i.key) + '"' + (refVal === 'ind:' + i.key ? ' selected' : '') + '>' +
          esc(i.name) + (i.key ? '（' + esc(i.key) + '）' : '') + '</option>').join('') + '</optgroup>').join('');
    const dirSel = ['above','below','up','down'];
    const dirLbl = { above:'阈值：越高越好（≥绿值 绿）', below:'阈值：越低越好（≤绿值 绿）', up:'环比：上行 = 绿（不设阈值）', down:'环比：下行 = 绿（不设阈值）' };
    return '<input type="hidden" name="pid" value="' + p.id + '">' +
      '<input type="hidden" name="iid" value="' + (d.id || '') + '">' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>显示名称 <span style="color:var(--red)">*</span></label><input type="text" name="label" required value="' + esc(d.label||'') + '" placeholder="如：美债 10Y"></div>' +
      '<div class="field" style="flex:1"><label>数据源</label><select name="ref">' + refOpts + '</select></div></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>判定方向</label><select name="dir">' +
        dirSel.map(k => '<option value="' + k + '" ' + ((d.dir||'above') === k ? 'selected' : '') + '>' + dirLbl[k] + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:none;width:130px"><label>绿灯阈值</label><input type="number" step="0.01" name="green" value="' + (d.green != null ? d.green : '') + '"></div>' +
      '<div class="field" style="flex:none;width:130px"><label>黄灯阈值</label><input type="number" step="0.01" name="yellow" value="' + (d.yellow != null ? d.yellow : '') + '"></div></div>' +
      '<div class="field"><label>证伪线（什么情况说明逻辑错了）</label><input type="text" name="falsify" value="' + esc(d.falsify||'') + '" placeholder="如：现货价较近 8 周高点回落 >10% → 景气见顶"></div>' +
      '<div class="field"><label>触发动作（灯亮时做什么）</label><input type="text" name="action" value="' + esc(d.action||'') + '" placeholder="如：>4.5%：降低成长股仓位弹性"></div>' +
      '<div class="field"><label>备注（口径说明，可空）</label><input type="text" name="note" value="' + esc(d.note||'') + '" placeholder="如：看 5 日累计趋势而非单日"></div>';
  }
  function poolModalBody(p){
    const d = p || {};
    return '<input type="hidden" name="pid" value="' + (d.id || '') + '">' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>池名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required value="' + esc(d.name||'') + '" placeholder="如：半导体设备"></div>' +
      '<div class="field" style="flex:none;width:90px"><label>图标</label><input type="text" name="icon" value="' + esc(d.icon||'') + '" placeholder="如：🔧"></div></div>' +
      '<div class="field"><label>一句话逻辑</label><input type="text" name="desc" value="' + esc(d.desc||'') + '" placeholder="这个板块的核心矛盾是什么？"></div>' +
      '<div class="field"><label>池级证伪线（整个板块逻辑何时作废）</label><input type="text" name="falsify" value="' + esc(d.falsify||'') + '" placeholder="如：DRAM 连跌 4 周 + ROE 下滑 → 景气拐点"></div>';
  }
  function pointModalBody(i){
    const pts = (i.points||[]).slice().sort((a,b) => b.date.localeCompare(a.date));
    const lastDate = pts.length ? pts[0].date : '';
    // 日度指标默认今天（完整日期），其余按频率推断下一期
    const guess = i.freq === '日度' ? dateStr() : guessNextDate(lastDate, i.freq);
    const ph = i.freq === '季度' ? '如 2026Q1' : (i.freq === '年度' ? '如 2026' : (i.freq === '日度' ? '如 2026-08-29' : '如 2026-01'));
    return '<input type="hidden" name="id" value="' + i.id + '">' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>时间 <span style="color:var(--red)">*</span></label><input type="text" name="date" required value="' + esc(guess) + '" placeholder="' + ph + '"></div>' +
      '<div class="field" style="flex:1"><label>数值 ' + (i.unit ? '(' + esc(i.unit) + ')' : '') + ' <span style="color:var(--red)">*</span></label><input type="number" step="0.01" name="value" required placeholder="0.00"></div></div>';
  }
  // 根据上一个时间点与频率，推断下一个时间点（支持 年度/季度/月度）
  function guessNextDate(lastDate, freq){
    const mth = String(lastDate).match(/^(\d{4})-(\d{2})$/);
    const qtr = String(lastDate).match(/^(\d{4})Q([1-4])$/);
    const yr  = String(lastDate).match(/^(\d{4})$/);
    if(freq === '年度'){ return yr ? String(+yr[1] + 1) : String(new Date().getFullYear() + 1); }
    if(freq === '季度'){
      if(qtr){ let q = +qtr[2] + 1; let y = +qtr[1]; if(q > 4){ q = 1; y++; } return y + 'Q' + q; }
      return '2026Q1';
    }
    // 月度（含日度默认按年月）
    if(mth){ let y = +mth[1], mo = +mth[2] + 1; if(mo > 12){ mo = 1; y++; } return y + '-' + String(mo).padStart(2,'0'); }
    return dateStr().slice(0,7);
  }
  function nextMonthStr(dstr){
    const m = String(dstr).match(/^(\d{4})-(\d{2})$/); if(!m) return dateStr().slice(0,7);
    let y = +m[1], mo = +m[2] + 1; if(mo > 12){ mo = 1; y++; }
    return y + '-' + String(mo).padStart(2,'0');
  }
  function nextQuarterStr(dstr){
    const m = String(dstr).match(/^(\d{4})Q([1-4])$/); if(!m) return '2026Q1';
    let q = +m[2] + 1; let y = +m[1]; if(q > 4){ q = 1; y++; }
    return y + 'Q' + q;
  }

  /* ================= CSV 导入 / 导出（按表 group 为单位） =================
   * 格式（长表）：
   *   # GoalTracker 宏观经济数据
   *   表,{表名}
   *   指标,{key},{名称},{单位},{频率},{分类},{说明}
   *   DATA,{key},{时间},{数值}
   * 说明：DATA 行按 key 归属指标；指标行创建/更新指标元信息（不存在则新建）。
   */
  function groupToCsv(g){
    const escC = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    let csv = '表,' + escC(g.name) + '\n';
    (g.indicators||[]).forEach(i => {
      csv += '指标,' + escC(i.key) + ',' + escC(i.name) + ',' + escC(i.unit||'') + ',' + escC(i.freq||'') + ',' + escC(i.category||'') + ',' + escC(i.desc||'') + '\n';
      (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(p => {
        csv += 'DATA,' + escC(i.key) + ',' + escC(p.date) + ',' + escC(p.value) + '\n';
      });
    });
    return csv;
  }
  // 导出全部表到一个 CSV（每张表一个"表"块）
  function allGroupsToCsv(){
    const escC = v => {
      if(v === null || v === undefined) return '';
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
    };
    let csv = '\uFEFF# GoalTracker 宏观经济数据（全部）\n';
    (groups()||[]).forEach(g => {
      if(!(g.indicators||[]).length) return;
      csv += groupToCsv(g);
    });
    return csv;
  }
  function csvToGroup(g, csvLines){
    let created = 0, updated = 0, points = 0;
    const byKey = {};
    const ensureInd = key => {
      if(!key) return null;
      if(byKey[key]) return byKey[key];
      let it = (g.indicators||[]).find(x => x.key === key);
      if(!it){ it = { id:uid(), key, name:key, unit:'', freq:'月度', category:'', desc:'', points:[] }; g.indicators.push(it); created++; }
      byKey[key] = it;
      return it;
    };
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const tag = String(r[0]).trim();
      if(tag === '#') continue;
      if(tag === '指标'){
        const it = ensureInd(r[1] ? String(r[1]).trim() : '');
        if(!it) continue;
        if(r[2] != null && String(r[2]) !== '') it.name = String(r[2]).trim();
        if(r[3] != null) it.unit = String(r[3]).trim();
        if(r[4] != null) it.freq = String(r[4]).trim() || '月度';
        if(r[5] != null) it.category = String(r[5]).trim();
        if(r[6] != null) it.desc = String(r[6]).trim();
        updated++;
      } else if(tag === 'DATA'){
        const it = ensureInd(r[1] ? String(r[1]).trim() : '');
        if(!it) continue;
        const date = r[2] ? String(r[2]).trim() : '';
        const num = Number(String(r[3]).replace(/[,\s%]/g,''));
        if(!date || isNaN(num)) continue;
        const ex = it.points.find(p => p.date === date);
        if(ex) ex.value = num; else it.points.push({ date, value:num });
        points++;
      }
    }
    // 标记所有指标已更新
    Object.values(byKey).forEach(x => { x.updated = dateStr(); });
    return { created, updated, points };
  }
  // 从 CSV 导入全部表：按"表,{表名}"行分派到对应 group（找不到则创建）。
  function csvToAllGroups(csvLines){
    // 默认目标 = 当前第一个 group（无表标记时兜底）
    let cur = (groups()||[])[0] || null;
    let created = 0, updated = 0, points = 0, tables = 0;
    const pending = [];          // [{group, lines}]
    let block = null;
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const tag = String(r[0]).trim();
      if(tag === '#') continue;
      if(tag === '表'){
        if(block && block.lines.length) pending.push(block);
        const tname = r[1] ? String(r[1]).trim() : '';
        block = { name: tname, lines: [] };
        tables++;
        continue;
      }
      if(block) block.lines.push(r);
    }
    if(block && block.lines.length) pending.push(block);
    if(!pending.length){ // 没有任何"表"块，全部归入第一个 group
      pending.push({ name: cur ? cur.name : '', lines: csvLines });
    }
    pending.forEach(b => {
      let g = cur;
      if(b.name){
        g = (groups()||[]).find(x => x.name === b.name) || cur;
        if(!g && b.name){ // 表名未知：创建新表（key 用拼音/表名）
          const key = 'tbl' + (tables);
          g = { id:uid(), key, name:b.name, indicators:[] };
          groups().push(g);
        }
      }
      if(!g) return;
      const res = csvToGroup(g, b.lines);
      created += res.created; updated += res.updated; points += res.points;
    });
    return { created, updated, points, tables };
  }
  // 简单 CSV 行解析（逐行 + 引号内逗号处理 + 跨行合并）
  function parseCsvSimple(text){
    const rawLines = String(text||'').replace(/\r\n/g,'\n').replace(/^\uFEFF/,'').split('\n');
    const lines = [];
    let pending = null;
    for(const ln of rawLines){
      if(pending != null) pending += '\n' + ln; else pending = ln;
      let q=0; for(const ch of pending) if(ch==='"') q++;
      if(q % 2 === 0){ lines.push(pending); pending = null; }
    }
    if(pending != null) lines.push(pending);
    const out = [];
    for(const ln of lines){
      if(!ln.trim()) continue;
      const f = []; let field='', inQ=false;
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
      f.push(field); out.push(f);
    }
    return out;
  }
  // 触发浏览器下载 CSV（优先系统「另存为」可选定文件夹，不支持则直接下载）
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
          await writable.write(blob); await writable.close();
          return true;
        } catch(e){
          if(e && e.name === 'AbortError') return false;
          console.warn('另存为导出失败，改用下载:', e);
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
      return true;
    };
    return trySave();
  }

  /* ----- 组内查找工具 ----- */
  function findGroup(gid){ return (groups()||[]).find(g => g.id === gid); }
  function findIndicatorGlobal(iid){
    for(const g of (groups()||[])){
      const it = (g.indicators||[]).find(x => x.id === iid);
      if(it) return it;
    }
    return null;
  }

  /* ----- 图表竖线 hover：鼠标移到某季度对应的 X 位置即显示该点值 -----
   * 通过 window 全局函数供 SVG 内联 onmouseover/onmouseout 调用。 */
  window.macroChartTip = function(el){
    if(!el || !el.closest) return;
    const svg = el.closest('svg');
    if(!svg) return;
    const tip = svg.querySelector('.chart-tip');
    if(!tip) return;
    const date = el.getAttribute('data-date');
    const value = el.getAttribute('data-value');
    const px = parseFloat(el.getAttribute('data-x'));
    const py = parseFloat(el.getAttribute('data-y'));
    // 垂直参考线
    tip.querySelector('.tip-line').setAttribute('x1', px.toFixed(1));
    tip.querySelector('.tip-line').setAttribute('x2', px.toFixed(1));
    // 值标签（在折线上方，避免遮挡曲线）
    tip.querySelector('.tip-date').textContent = date;
    tip.querySelector('.tip-val').textContent = value;
    const tw = 70, th = 34;
    const bx = Math.min(Math.max(px - tw/2, 4), 640 - tw - 4);
    const by = py - th - 8;
    const rect = tip.querySelector('rect');
    rect.setAttribute('x', bx.toFixed(1));
    rect.setAttribute('y', Math.max(by, 4).toFixed(1));
    rect.setAttribute('width', tw);
    rect.setAttribute('height', th);
    tip.querySelector('.tip-date').setAttribute('x', (bx + tw/2).toFixed(1));
    tip.querySelector('.tip-date').setAttribute('y', (Math.max(by,4) + 14).toFixed(1));
    tip.querySelector('.tip-val').setAttribute('x', (bx + tw/2).toFixed(1));
    tip.querySelector('.tip-val').setAttribute('y', (Math.max(by,4) + 28).toFixed(1));
    tip.setAttribute('visibility', 'visible');
    // 高亮当前数据点（用内联 style，基色由 CSS .chart-pt{fill:var(--card)} 提供，深浅色均适配）
    svg.querySelectorAll('.chart-pt').forEach(c => { c.style.fill = ''; });
    const pt = svg.querySelector('.chart-pt[data-idx="' + (el.getAttribute('data-idx') || '') + '"]');
    if(pt) pt.style.fill = 'var(--indigo)';
  };
  window.macroChartTipHide = function(el){
    if(!el || !el.closest) return;
    const svg = el.closest('svg');
    if(!svg) return;
    const tip = svg.querySelector('.chart-tip');
    if(tip) tip.setAttribute('visibility', 'hidden');
    svg.querySelectorAll('.chart-pt').forEach(c => { c.style.fill = ''; });
  };

  /* ================= 模块注册 ================= */
  Register.module({
    view: 'macro',
    nav: { ico:'🌐', label:'宏观经济', group:'投资追踪' },
    seed: seed,
    ensure: ensure,
    render: renderMacro,
    actions: {
      'macro.add': () => openModal('添加宏观指标', indModalBody(null), 'macro.save'),
      // ---- L1/L2 温度计池管理 ----
      'macro.poolAdd': () => openModal('新增行业池', poolModalBody(null), 'macro.savePool'),
      'macro.poolEdit': el => {
        const p = findPool(el.dataset.pid); if(!p) return;
        openModal('编辑行业池 · ' + p.name, poolModalBody(p), 'macro.savePool');
      },
      'macro.poolDel': el => {
        const p = findPool(el.dataset.pid); if(!p) return;
        if(p.fixed){ toast('⚠️ L1 宏观温度计是固定池，不可删除（可编辑/移除其中的指标项）'); return; }
        if(!confirm('删除行业池「' + p.name + '」？（不影响宏观指标数据本身）')) return;
        DB.macro.pools = (DB.macro.pools||[]).filter(x => x.id !== p.id);
        save(); render();
      },
      'macro.poolItemAdd': el => {
        const p = findPool(el.dataset.pid); if(!p) return;
        openModal('添加温度计指标 · ' + p.name, poolItemModalBody(p, null), 'macro.savePoolItem');
      },
      'macro.poolItemEdit': el => {
        const p = findPool(el.dataset.pid); if(!p) return;
        const it = (p.items||[]).find(x => x.id === el.dataset.iid); if(!it) return;
        openModal('编辑温度计指标 · ' + it.label, poolItemModalBody(p, it), 'macro.savePoolItem');
      },
      'macro.poolItemDel': el => {
        const p = findPool(el.dataset.pid); if(!p) return;
        const it = (p.items||[]).find(x => x.id === el.dataset.iid); if(!it) return;
        if(!confirm('从「' + p.name + '」移除「' + it.label + '」？')) return;
        p.items = p.items.filter(x => x.id !== it.id);
        save(); render();
      },
      'macro.fRange': el => { state.macroRange = el.dataset.v; render(); },
      // ---- 三温度计人工修正（±5，范围 -25~+25）----
      'macro.scoreAdj': el => {
        const tk = el.dataset.v, d = Number(el.dataset.d) || 0;
        DB.macro.scores = DB.macro.scores || { liquidity:0, growth:0, valuation:0 };
        DB.macro.scores[tk] = Math.max(-25, Math.min(25, (Number(DB.macro.scores[tk]) || 0) + d));
        save(); render();
      },
      // ---- 每日快捷录入：一次性录入全部日度指标 ----
      'macro.quickDaily': () => {
        const list = allIndicators().filter(i => i.freq === '日度');
        if(!list.length){ alert('暂无日度指标'); return; }
        let h = '<div class="metric-help">一次录入今天的全部日度数据。留空的项跳过。日度数据按日期（今天）存入对应指标。</div>' +
          '<div class="quick-grid">';
        list.forEach(i => {
          const l2 = latest2(i);
          h += '<div class="qg-row"><label>' + esc(i.name) + (i.unit ? ' <span class="muted">(' + esc(i.unit) + ')</span>' : '') + '</label>' +
            '<input type="number" step="0.0001" name="ind_' + i.id + '" placeholder="' + (l2.latest != null ? '上次 ' + Number(l2.latest).toFixed(2) : '未录入') + '"></div>';
        });
        h += '</div>';
        openModal('⚡ 每日快捷录入 · ' + dateStr(), h, 'macro.saveQuickDaily');
      },
      // ---- FedWatch 概率记录 ----
      'macro.fwAdd': () => openModal('记录 FedWatch 概率',
        '<div class="quick-row"><div class="field" style="flex:1"><label>FOMC 会议 <span style="color:var(--red)">*</span></label><input type="text" name="meeting" required placeholder="如：2026-09"></div></div>' +
        '<div class="quick-row"><div class="field" style="flex:1"><label>降息概率 %</label><input type="number" min="0" max="100" name="cut" value="0"></div>' +
        '<div class="field" style="flex:1"><label>不变概率 %</label><input type="number" min="0" max="100" name="hold" value="100"></div>' +
        '<div class="field" style="flex:1"><label>加息概率 %</label><input type="number" min="0" max="100" name="hike" value="0"></div></div>' +
        '<input type="hidden" name="id" value="">', 'macro.saveFw'),
      'macro.fwEdit': el => {
        const n = (DB.macro.fedwatch || []).find(x => x.id === el.dataset.id); if(!n) return;
        openModal('编辑 FedWatch · ' + n.meeting,
          '<div class="quick-row"><div class="field" style="flex:1"><label>FOMC 会议 <span style="color:var(--red)">*</span></label><input type="text" name="meeting" required value="' + esc(n.meeting) + '"></div></div>' +
          '<div class="quick-row"><div class="field" style="flex:1"><label>降息概率 %</label><input type="number" min="0" max="100" name="cut" value="' + (n.cut||0) + '"></div>' +
          '<div class="field" style="flex:1"><label>不变概率 %</label><input type="number" min="0" max="100" name="hold" value="' + (n.hold||0) + '"></div>' +
          '<div class="field" style="flex:1"><label>加息概率 %</label><input type="number" min="0" max="100" name="hike" value="' + (n.hike||0) + '"></div></div>' +
          '<input type="hidden" name="id" value="' + n.id + '">', 'macro.saveFw');
      },
      'macro.fwDel': el => {
        if(confirm('删除这条 FedWatch 记录？')){
          DB.macro.fedwatch = (DB.macro.fedwatch || []).filter(x => x.id !== el.dataset.id);
          save(); render();
        }
      },
      'macro.edit': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        openModal('编辑指标 · ' + i.name, indModalBody(i), 'macro.save');
      },
      'macro.del': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        if(!confirm('删除指标「' + i.name + '」及其所有数据？')) return;
        const g = findGroup(groupOfIndicator(i.id));
        if(g) g.indicators = g.indicators.filter(x => x.id !== el.dataset.id);
        save(); render();
      },
      'macro.addPoint': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        openModal('添加数据 · ' + i.name, pointModalBody(i), 'macro.savePoint');
      },
      'macro.viewTable': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        openModal('数据明细 · ' + i.name, '<div style="max-height:60vh;overflow:auto">' + tableHtml(i) + '</div>', '', null, true);
      },
      'macro.delPoint': el => {
        const i = findIndicatorGlobal(el.dataset.id); if(!i) return;
        if(confirm('删除这条数据？')){
          i.points = i.points.filter(p => p.date !== el.dataset.pdate);
          i.updated = dateStr(); save(); render();
        }
      },
      'macro.exportCsv': el => {
        const g = findGroup(el.dataset.gid); if(!g) return;
        const content = groupToCsv(g);
        const fname = (g.key || 'macro') + '_' + (g.name || '宏观经济') + '.csv';
        downloadCsv(fname, content).then(done => {
          if(done) toast('已导出「' + g.name + '」' + (g.indicators||[]).length + ' 个指标');
        });
      },
      'macro.importCsv': el => {
        const g = findGroup(el.dataset.gid); if(!g) return;
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
              const r = csvToGroup(g, lines);
              save(); render();
              toast('导入完成：新增 ' + r.created + ' 个指标，更新 ' + r.updated + ' 个指标，写入 ' + r.points + ' 条数据');
            } catch(e){
              alert('导入失败：' + e.message);
            }
          };
          reader.readAsText(file, 'utf-8');
        };
        input.click();
      },
      'macro.exportAll': () => {
        const content = allGroupsToCsv();
        downloadCsv('宏观经济_全部数据.csv', content).then(done => {
          if(done) toast('已导出全部宏观经济数据');
        });
      },
      'macro.importAll': () => {
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
              const r = csvToAllGroups(lines);
              save(); render();
              toast('导入完成：' + (r.tables||0) + ' 张表，新增 ' + r.created + ' 个指标，更新 ' + r.updated + ' 个指标，写入 ' + r.points + ' 条数据');
            } catch(e){
              alert('导入失败：' + e.message);
            }
          };
          reader.readAsText(file, 'utf-8');
        };
        input.click();
      },
      // ---- 一键同步：直接从仓库 CSV 拉取并增量合并，免去手动选择文件 ----
      'macro.syncCsv': () => {
        const url = 'data/macro/宏观经济_全部数据.csv';
        toast('正在同步仓库最新宏观数据…');
        fetch(url, { cache: 'no-store' })
          .then(r => { if(!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
          .then(text => {
            const r = csvToAllGroups(parseCsvSimple(text));
            save(); render();
            toast('同步完成：' + (r.tables||0) + ' 张表，新增 ' + r.created + ' 个指标，更新 ' + r.updated +
              ' 个指标，写入 ' + r.points + ' 条数据');
          })
          .catch(e => {
            alert('同步失败：' + e.message + '\n\n' +
              '请确认通过 http(s) 方式打开页面（file:// 无法读取数据文件）；\n' +
              '也可改用「⬆ 导入全部」手动选择 data/macro/宏观经济_全部数据.csv。');
          });
      },
    },
    forms: {
      'macro.savePool': fd => {
        const pid = fd.get('pid');
        const data = { name:String(fd.get('name')||'').trim(), icon:String(fd.get('icon')||'').trim(),
          desc:String(fd.get('desc')||'').trim(), falsify:String(fd.get('falsify')||'').trim() };
        if(!data.name){ alert('请填写池名称'); return; }
        if(pid){
          const p = findPool(pid); if(!p) return;
          Object.assign(p, data);
        } else {
          DB.macro.pools.push(Object.assign({ id:uid(), key:'pool_' + Date.now().toString(36), items:[] }, data));
        }
        save(); closeModal(); render();
      },
      'macro.savePoolItem': fd => {
        const p = findPool(fd.get('pid')); if(!p) return;
        const ref = String(fd.get('ref')||'').trim();
        const label = String(fd.get('label')||'').trim();
        if(!label || !ref){ alert('请填写显示名称与数据源'); return; }
        const num = k => { const v = parseFloat(fd.get(k)); return isNaN(v) ? null : v; };
        const data = { label, ref, unit:'', dir:String(fd.get('dir')||'above'),
          green:num('green'), yellow:num('yellow'),
          falsify:String(fd.get('falsify')||'').trim(), action:String(fd.get('action')||'').trim(),
          note:String(fd.get('note')||'').trim() };
        const iid = fd.get('iid');
        if(iid){
          const it = (p.items||[]).find(x => x.id === iid); if(!it) return;
          Object.assign(it, data);
        } else {
          (p.items = p.items||[]).push(Object.assign({ id:uid() }, data));
        }
        save(); closeModal(); render();
      },
      'macro.save': fd => {
        const id = fd.get('id');
        const gid = fd.get('gid');
        const keyVal = String(fd.get('key')||'').trim();
        const data = { name:fd.get('name'), unit:fd.get('unit')||'', freq:fd.get('freq')||'月度',
          layer:fd.get('layer')||'cn_econ', importance:fd.get('importance')||'B',
          desc:fd.get('desc')||'', key:keyVal || undefined };
        if(id){
          const it = findIndicatorGlobal(id); if(!it) return;
          Object.assign(it, data, { key: keyVal || it.key || uid(), updated:dateStr() });
          // 若所属表改变，移动到目标组
          const curG = findGroup(groupOfIndicator(id));
          const newG = findGroup(gid);
          if(newG && curG && curG !== newG){
            curG.indicators = curG.indicators.filter(x => x.id !== id);
            newG.indicators.push(it);
          }
        } else {
          const g = findGroup(gid) || (groups()||[])[0];
          if(g) g.indicators.push(Object.assign({ id:uid(), key:keyVal || uid(), points:[], updated:dateStr() }, data));
        }
        save(); closeModal(); render();
      },
      'macro.saveFw': fd => {
        const id = fd.get('id');
        const num = k => { const v = parseFloat(fd.get(k)); return isNaN(v) ? 0 : Math.max(0, Math.min(100, v)); };
        const meeting = String(fd.get('meeting')||'').trim();
        if(!meeting){ alert('请填写 FOMC 会议'); return; }
        DB.macro.fedwatch = DB.macro.fedwatch || [];
        // 同一会议去重：按会议名找已有记录（新建时），避免同会议出现多条
        let n = id ? DB.macro.fedwatch.find(x => x.id === id)
          : DB.macro.fedwatch.find(x => x.meeting === meeting);
        if(!n){
          n = { id: uid(), meeting };
          DB.macro.fedwatch.push(n);
        }
        const next = { meeting, cut:num('cut'), hold:num('hold'), hike:num('hike'), updated:dateStr() };
        // 概率发生变化时，把当前值存为 prev 快照 —— 用于展示「边际变化」（建议§4）
        const changedP = n.cut !== next.cut || n.hold !== next.hold || n.hike !== next.hike;
        if(changedP){
          next.prev = { cut:n.cut, hold:n.hold, hike:n.hike, updated:n.updated };
        } else if(n.prev){
          next.prev = n.prev;   // 只改了会议名等字段时保留原快照
        }
        Object.assign(n, next);
        save(); closeModal(); render();
      },
      'macro.savePoint': fd => {
        const i = findIndicatorGlobal(fd.get('id')); if(!i) return;
        const date = fd.get('date'); const value = parseFloat(fd.get('value'));
        if(!date || isNaN(value)){ alert('请填写有效的时间与数值'); return; }
        // 去重：同时间点覆盖更新
        const exist = i.points.findIndex(p => p.date === date);
        if(exist >= 0) i.points[exist].value = value;
        else i.points.push({ date, value });
        i.updated = dateStr();
        save(); closeModal(); render();
      },
      'macro.saveQuickDaily': fd => {
        const list = allIndicators().filter(i => i.freq === '日度');
        const date = dateStr();
        let wrote = 0;
        list.forEach(i => {
          const raw = fd.get('ind_' + i.id);
          if(raw == null || String(raw).trim() === '') return;
          const v = parseFloat(raw);
          if(isNaN(v)) return;
          const ex = i.points.findIndex(p => p.date === date);
          if(ex >= 0) i.points[ex].value = v;
          else i.points.push({ date, value:v });
          i.updated = dateStr();
          wrote++;
        });
        save(); closeModal(); render();
        toast('已录入 ' + wrote + ' 项日度数据（' + date + '）');
      },
    },
  });
})();
