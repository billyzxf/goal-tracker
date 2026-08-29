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
 *
 * 三温度计 + Regime：流动性/经济/估值三个 0-100 分（自动环比投票 + 人工修正），
 *   再派生两组 Regime：盈利×估值四象限、流动性×经济四状态。
 *
 * 兼容：旧结构（扁平 indicators / 无 layer 元数据）由 ensure() 自动迁移。
 */
(function(){
  const GROUPS = [
    { key:'domestic', name:'国内宏观经济' },
    { key:'global',   name:'国际宏观经济' },
  ];
  const CAT_TO_GROUP = { '海外与利率':'global' };   // 其余分类默认归入 domestic
  const FREQS = ['日度','月度','季度','年度'];
  const CATS = ['国内经济', '物价通胀', '货币与金融', '海外与利率', '就业与民生'];

  /* ===== 五层体系 ===== */
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
    put('dr007', 'DR007（7天回购利率）', '货币与金融', '%', '日度', 'cn_liq', 'S', 'down_good', 'liquidity',
      '银行间资金面松紧最直接的观测：持续低位=资金宽松、风险偏好改善；快速上行=资金收紧、杠杆承压。', null);
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
    put('corploan', '企业中长期贷款同比', '货币与金融', '%', '月度', 'cn_liq', 'A', 'up_good', 'growth',
      '企业借钱扩产的意愿，是社融里质量最高的分项：企业中长期贷款改善 = 真实的资本开支需求回暖。', null);
    put('hhloan', '居民中长期贷款同比', '货币与金融', '%', '月度', 'cn_liq', 'B', 'up_good', 'growth',
      '主要是房贷，与地产销售互相印证。居民加杠杆意愿恢复是地产链信用扩张的前提。', null);
    put('govbond', '政府债券融资', '货币与金融', '亿', '月度', 'cn_liq', 'A', 'up_good', 'growth',
      '社融中越来越重要的分项：财政发力（专项债/特别国债）主要靠它。货币宽松+财政积极 > 单纯降息的刺激效果。', null);
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
    put('indprofit', '工业企业利润同比', '国内经济', '%', '月度', 'cn_econ', 'A', 'up_good', 'growth',
      '上市公司盈利的宏观映射：收入-成本=利润，与 PPI 高度相关。比 GDP 更贴近 A 股盈利。', null);
    put('fixedasset', '固定资产投资同比', '国内经济', '%', '月度', 'cn_econ', 'A', 'up_good', 'growth',
      '细分制造业投资/基建投资/地产投资三条线看：基建对应财政发力，制造业对应产业周期。', null);
    put('retail', '社会消费品零售同比', '国内经济', '%', '月度', 'cn_econ', 'A', 'up_good', 'growth',
      '内需消费动能。', null);
    put('exports', '出口同比', '国内经济', '%', '月度', 'cn_econ', 'S', 'up_good', 'growth',
      '外需是中国宏观周期重要支撑。重点看"超预期/低于预期"而非绝对值。',
      [['2024-06',10.7],['2024-12',10.9],['2025-06',5.8],['2025-12',6.7],['2026-06',12.5],['2026-07',14.0]]);
    put('prop_sale', '商品房销售面积同比', '国内经济', '%', '月度', 'cn_econ', 'S', 'up_good', 'growth',
      '地产是信用之母：销售恢复→开发商现金流→拿地投资→建材家电→银行信用→财富效应。销售比开工更重要。', null);
    put('unemp', '城镇调查失业率', '就业与民生', '%', '月度', 'cn_econ', 'B', null, null,
      '就业形势与内需基础。失业率上行通常伴随消费与风险偏好走弱。',
      [['2023-06',5.2],['2023-12',5.1],['2024-06',5.0],['2024-12',5.1],['2025-06',5.0],['2025-12',5.0],['2026-03',5.1],['2026-06',5.0]]);

    /* ===== 第四层 · 价格周期 ===== */
    put('cpi', 'CPI 同比', '物价通胀', '%', '月度', 'price', 'A', 'up_good', 'growth',
      '居民物价。核心CPI（剔除食品能源）更值得长期跟踪：核心CPI↑ = 内需+定价能力改善。',
      [['2023-06',0.0],['2023-12',-0.3],['2024-06',0.2],['2024-12',0.1],['2025-06',0.3],['2025-12',0.5],['2026-03',0.8],['2026-06',0.6],['2026-07',0.7]]);
    put('corecpi', '核心 CPI 同比', '物价通胀', '%', '月度', 'price', 'A', 'up_good', 'growth',
      '剔除食品和能源后的 CPI：油价上涨推高 headline CPI 但核心不变 = 内需未变。核心CPI 持续上行才是真内需改善。', null);
    put('ppi', 'PPI 同比', '物价通胀', '%', '月度', 'price', 'S', 'up_good', 'growth',
      '工业品出厂价格：直接决定工业企业"收入-成本=利润"。对钢铁/化工/有色/煤炭影响明显。对 A 股重要性不低于 CPI。',
      [['2023-06',-5.4],['2023-12',-2.7],['2024-06',-0.8],['2024-12',-2.3],['2025-06',-2.0],['2025-12',-1.5],['2026-03',-1.2],['2026-06',-0.9],['2026-07',3.5]]);

    /* ===== 第五层 · 市场自身 ===== */
    put('turnover', 'A股成交额', '市场', '万亿', '日度', 'market', 'S', 'up_good', 'valuation',
      '指数涨但成交额缩（2万亿→1.3万亿）不健康；横盘但放量可能在风格切换。', null);
    put('hs300pe', '沪深300 PE', '市场', '倍', '周度', 'market', 'S', null, 'valuation',
      '估值本身无意义，历史分位数才有意义（如 18 倍若处于 10 年 95% 分位则完全不同）。用于计算股债收益差。', null);
    put('us30y', '美债 30Y 收益率', '海外与利率', '%', '日度', 'global_liq', 'B', 'down_good', 'liquidity',
      '长期通胀、财政与债务预期、期限溢价。30Y 快速上行常反映财政/通胀担忧。', null);
    put('breakeven', '10Y 盈亏平衡通胀', '海外与利率', '%', '日度', 'global_liq', 'A', null, null,
      '名义10Y − 实际利率 = 通胀预期。与实际利率组合判断：通胀预期↑ 利好黄金/资源。', null);
    put('margin', '两融余额', '市场', '万亿', '日度', 'market', 'A', 'up_good', 'valuation',
      '杠杆资金情绪。两融快速上升 = 风险偏好高，但也意味着波动放大。', null);
    put('etfflow', '股票 ETF 资金流', '市场', '亿', '周度', 'market', 'A', 'up_good', 'valuation',
      '配置型资金方向。持续净流入 = 增量资金入场。', null);
    put('northbound', '北向资金净流入', '市场', '亿', '日度', 'market', 'A', 'up_good', 'valuation',
      '外资风险偏好观测。持续流出常与美元走强/人民币贬值压力同期出现——先看 DXY 再解读。', null);
    put('csi500pe', '中证500 PE', '市场', '倍', '周度', 'market', 'A', null, 'valuation',
      '中盘估值。与沪深300 PE 对比看大小盘风格：中证500/沪深300 PE 比值走阔 = 成长/小盘占优。', null);
    put('allape', '全部A股市盈率', '市场', '倍', '周度', 'market', 'A', null, 'valuation',
      '全市场估值中枢，代表整体贵贱。同样必须结合历史分位数看（见卡片上的分位徽章）。', null);
    return { groups, fedwatch: [
      { id:uid(), meeting:'2026-09', cut:20, hold:50, hike:30, updated:dateStr() },
      { id:uid(), meeting:'2026-10', cut:35, hold:45, hike:20, updated:dateStr() },
      { id:uid(), meeting:'2026-12', cut:60, hold:30, hike:10, updated:dateStr() },
    ] };
  }
  function ensure(db){
    const m = db.macro = db.macro || {};
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
        const s = seed();
        m.groups = s.groups; m.fedwatch = s.fedwatch;
        m.seedDataVersion = 2;
        return;
      }
    }
    // ---- 迁移1：旧指标补层级/重要性元数据（按 KEY_META 映射，不覆盖已有） ----
    let changed = false;
    (m.groups||[]).forEach(g => (g.indicators||[]).forEach(i => {
      const meta = KEY_META[i.key];
      if(meta){
        ['layer','importance','direction','scoreLayer'].forEach(k => {
          if(i[k] === undefined && meta[k] !== undefined){ i[k] = meta[k]; changed = true; }
        });
      }
      if(i.interpret === undefined){ i.interpret = ''; }
    }));
    // ---- 迁移2：合并 seed 新指标 + FedWatch（按 key 去重，只补缺失，版本化一次性执行） ----
    const SEED_VER = 4;
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
      m.seedDataVersion = SEED_VER;
    }
    // ---- 打分手动修正值初始化（半自动温度计，二期） ----
    m.scores = m.scores || { liquidity:0, growth:0, valuation:0 };
    if(changed){ /* 有变更时由调用方 save() 持久化 */ }
  }

  /* ----- 通用工具 ----- */
  function groups(){ return DB.macro.groups; }
  function allIndicators(){ return (groups()||[]).reduce((a, g) => a.concat(g.indicators||[]), []); }
  function ind(name){ return allIndicators().find(i => i.key === name); }

  // 取指标最后一个值及其环比变化（相邻两个点的差值）
  function latest2(i){
    const pts = (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(!pts.length) return { latest:null, prev:null, delta:null };
    const latest = pts[pts.length-1];
    const prev = pts.length > 1 ? pts[pts.length-2] : null;
    return { latest: latest.value, prev: prev ? prev.value : null,
      delta: prev ? latest.value - prev.value : null, date: latest.date };
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

  /* ----- 折线趋势图（纯 SVG，含 0 轴参考线与均值参考线） ----- */
  function lineChart(i, opts){
    // 按日期筛选（近1/3/5/10年/全部）
    const pts = filterByRange(i.points).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(pts.length < 2) return '<div class="muted" style="text-align:center;padding:20px;font-size:13px">该区间内数据点不足，无法绘制趋势图</div>';

    const w = 640, h = 210, pad = {l:50, r:16, t:18, b:32};
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
    let h = '<div style="overflow-x:auto"><table class="val-table"><thead><tr><th>时间</th><th class="num">' + esc(i.name) + (i.unit ? ' (' + esc(i.unit) + ')' : '') + '</th><th class="num">环比变化</th><th></th></tr></thead><tbody>';
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
      '<div class="sec-title" style="margin-bottom:6px"><h2>' + esc(i.name) + '</h2>' +
      '<div class="q-actions">' +
        impBadge(i.importance) +
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
    let good = 0, bad = 0, contrib = [];
    list.forEach(i => {
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
    return { auto, manual, final, good, bad, n, contrib };
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
        '<div class="th-sub muted">自动 ' + (s.auto == null ? '—' : s.auto) + ' · 人工 <b>' + (s.manual > 0 ? '+' : '') + s.manual + '</b> · ' + s.n + ' 项参评（好' + s.good + '/坏' + s.bad + '）' +
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
      '<div class="quad-grid">' +
      cell('q-lt','盈利↑ 估值↓','结构性行情') +
      cell('q-rb','盈利↑ 估值↑','🟢 最强牛市') +
      cell('q-rt','盈利↓ 估值↓','🔴 最危险') +
      cell('q-lb','盈利↓ 估值↑','流动性牛市') +
      '</div><div class="quad-verdict">' + esc(warn) + '</div></div>';
  }

  /* ===== 变化速度预警 ===== */
  function speedWarn(i){
    const pts = (i.points||[]).slice().sort((a,b) => a.date.localeCompare(b.date));
    if(pts.length < 2) return '';
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
    { key:'prop_sale',dir:1,  label:'地产销售 ↑', sectors:'银行 · 地产 · 建材 · 家电' },
    { key:'exports',  dir:1,  label:'出口 ↑',     sectors:'出口制造 · 机械 · 电子' },
  ];
  function rotationTable(){
    // 判断某行当前是否处于"受益"状态
    const active = r => {
      const i = ind(r.key);
      if(!i) return false;
      const l2 = latest2(i);
      if(l2.delta == null || isNaN(l2.delta) || l2.delta === 0) return false;
      return r.dir === 1 ? l2.delta > 0 : l2.delta < 0;
    };
    let h = '<div class="card macro-rot"><div class="sec-title" style="margin-bottom:8px">' +
      '<h2>🔄 宏观 → 行业轮动映射 <span class="muted" style="font-weight:400;font-size:12px">高亮 = 该方向当前成立（按最新环比）</span></h2></div>' +
      '<div style="overflow-x:auto"><table class="val-table"><thead><tr><th>宏观方向</th><th>受益行业</th></tr></thead><tbody>';
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
      h += '<div class="daily-item" title="' + esc(i.interpret || i.desc || '') + '">' +
        '<div class="d-name">' + esc(i.name) + '</div>' +
        '<div class="d-val ' + cls + '">' + (l2.latest != null ? Number(l2.latest).toFixed(2) : '—') +
        '<small>' + esc(i.unit || '') + ' ' + arrow + '</small></div>' +
        '<div class="d-date muted">' + esc(l2.date || '') + '</div></div>';
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
    h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
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
      '<div class="quad-grid">' +
      cell('r2','流动性宽松 · 经济弱','宽松交易 / 成长占优') +
      cell('r1','流动性宽松 · 经济强','🟢 宽松复苏') +
      cell('r4','流动性紧缩 · 经济弱','🔴 紧缩衰退') +
      cell('r3','流动性紧缩 · 经济强','价值/周期占优') +
      '</div><div class="quad-verdict">' + esc(warn) + '</div></div>';
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
    return '<div class="card macro-scissors"><div class="sec-title" style="margin-bottom:6px">' +
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

  /* ----- 主视图：五层体系渲染 ----- */
  function renderMacro(){
    const gs = groups() || [];
    let h = header('🌐 宏观雷达', '传导链：海外利率/美元 → 全球流动性 → 人民币 → 中国货币 → 信用 → 经济 → 盈利 → A股估值',
      '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
      '<button class="btn ghost sm" data-action="macro.exportAll" title="导出全部宏观经济数据为一个 CSV">⬇ 导出全部</button>' +
      '<button class="btn ghost sm" data-action="macro.importAll" title="导入宏观经济数据 CSV（含全部指标）">⬆ 导入全部</button>' +
      '<button class="btn primary" style="background:var(--indigo)" data-action="macro.add">＋ 添加指标</button>' +
      '</div>');

    // ① 每日速览（S级日度 + FedWatch 摘要）
    h += dailyBrief();

    // ② 宏观仪表盘：三温度计 + Regime 四象限 + 流动性×经济 Regime（半自动打分）
    h += thermometersHtml();
    h += regimeQuad();
    h += regimeLxG();

    // 顶部快捷录入按钮
    h += '<div style="margin:0 0 14px;display:flex;justify-content:flex-end">' +
      '<button class="btn ghost sm" data-action="macro.quickDaily" title="一次性录入今天的全部日度指标">⚡ 每日快捷录入</button></div>';

    // 日期范围筛选
    h += '<div class="chips" style="margin:0 0 14px">' +
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
    },
    forms: {
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
