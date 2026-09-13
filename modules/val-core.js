/* =====================================================================
 * GoalTracker · 估值纯函数（val-core）
 * ---------------------------------------------------------------------
 * 职责：估值计算相关的"纯函数"，不依赖 DOM / DB / 任何模块。
 *       便于独立测试与复用（valuation 模块、dashboard 汇总等）。
 * 说明：由 modules/valuation.js 加载；index.html 需在 valuation.js 前引入。
 * ===================================================================== */

window.ValCore = (function(){

  /* ----- 安全公式引擎（仅支持数字 + ${key} 引用 + 四则 + 括号） ----- */
  function evalFormula(formula, values){
    if(!formula || typeof formula !== 'string') return null;
    try {
      let expr = formula;
      const refKeys = (formula.match(/\$\{(\w+)\}/g) || []).map(s => s.slice(2,-1));
      for(const k of refKeys){
        const v = values ? values[k] : null;
        const num = (v == null || v === '' || isNaN(v)) ? 0 : Number(v);
        expr = expr.replace(new RegExp('\\$\\{' + k + '\\}', 'g'), '(' + num + ')');
      }
      if(!/^[\d\s+\-*/().]+$/.test(expr)) return null;
      return Function('"use strict"; return (' + expr + ')')();
    } catch(e){ return null; }
  }

  /* ===== 估值计算 =====
   * 注意：所有价格/股本类参数单位为「元」和「亿股」，返回「每股价值（元）」。
   * DCF 增强：兼容两种输入方式——
   *   1) 手动模式：直接给 fcf1~fcf5（各年自由现金流，亿）
   *   2) 外推模式：给 baseFcf（基年 FCF，亿）+ growthRate（年增长率 %），
   *      自动生成 5 年现金流 = baseFcf × (1+g)^t
   * 若同时提供，优先使用手动 fcf1~fcf5；否则尝试外推。
   */
  function calcValuation(method, params){
    const p = params || {};
    let v = 0;
    switch(method){
      case 'PE': case 'PB': case 'PS':
        v = (p.targetMultiple||0) * (p.baseValue||0); break;
      case 'PEG':
        v = (p.targetMultiple||1) * (p.growthRate||0) * (p.baseValue||0); break;
      case 'DCF': {
        const r = (p.discountRate||10)/100, g = (p.terminalGrowth||3)/100;
        // 解析 5 年现金流：优先手动模式，其次外推模式
        let fcfs = [p.fcf1,p.fcf2,p.fcf3,p.fcf4,p.fcf5].map(x => (+x || 0));
        const hasManual = fcfs.some(x => x !== 0);
        if(!hasManual && p.baseFcf && p.growthRate != null){
          const base = +p.baseFcf || 0;
          const gr = (+p.growthRate || 0) / 100;
          fcfs = [1,2,3,4,5].map(t => base * Math.pow(1 + gr, t));
        }
        let pv = 0;
        fcfs.forEach((f,i) => { pv += f / Math.pow(1+r, i+1); });
        // 用第 5 年现金流算永续终值
        const tv = fcfs[4] * (1+g) / (r-g);
        pv += tv / Math.pow(1+r, 5);
        v = pv / (p.shares||1); break;
      }
      case 'EV': {
        const ev = (p.targetMultiple||0) * (p.baseValue||0);
        v = (ev - (p.netDebt||0)) / (p.shares||1); break;
      }
      /* SOTP 分部估值（Sum of The Parts）：
       * 估算每股价值 =（Σ 第 i 分部净利 × 第 i 分部 PE
       *                + 持有上市股权市值 + 净现金 − 净债务）÷ 总股本
       * 分部最多 4 个（seg1np/seg1pe ... seg4np/seg4pe），未填写的分部按 0 计。
       * 适用：控股型 / 多元化公司（如「藏格矿业—巨龙铜业投资收益」「中科曙光—海光信息敞口」），
       *       以及单一 PE 会严重失真的「主业 + 参股上市平台」结构。
       * 与其它方法口径一致：净利/金额单位为「亿元」，返回「每股价值（元）」。
       */
      case 'SOTP': {
        let sum = 0;
        for(let i = 1; i <= 4; i++){
          const np = +(p['seg' + i + 'np'] || 0);
          const pe = +(p['seg' + i + 'pe'] || 0);
          if(np) sum += np * pe;
        }
        sum += (+(p.listedHold || 0)) + (+(p.netCash || 0)) - (+(p.netDebt || 0));
        v = sum / (p.shares || 1); break;
      }
    }
    return Math.round(v * 100) / 100;
  }

  /* ===== 安全边际（%） =====
   * est 为估算价值，actual 为实际价。返回 (est-actual)/est*100。
   * est 无效（0/负）返回 null。
   */
  function calcMoS(est, actual){
    if(!est || est <= 0) return null;
    return (est - actual) / est * 100;
  }

  /* ===== 持仓计算 =====
   * 按时间顺序累计买卖，返回 { position(股数), cost(成本), avgCost(均成本), realized(已实现盈亏) }。
   * 兼容历史：sell 超过持仓时按实际可卖股数结算。
   */
  function calcPosition(investments){
    let position = 0, cost = 0, realized = 0;
    const sorted = (investments||[]).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
    for(const inv of sorted){
      if(inv.action === 'buy'){
        cost += (inv.price||0) * (inv.shares||0);
        position += (inv.shares||0);
      } else {
        if(position > 0){
          const avg = cost / position;
          const sell = Math.min(inv.shares||0, position);
          realized += ((inv.price||0) - avg) * sell;
          cost -= avg * sell;
          position -= sell;
        }
      }
    }
    return { position, cost, avgCost: position > 0 ? cost/position : 0, realized };
  }

  /* ===== 金额格式化（万/亿） ===== */
  function fmtMoney(n, cur){
    if(n == null || isNaN(n)) return '—';
    const sign = n < 0 ? '-' : '';
    const abs = Math.abs(n);
    let str;
    if(abs >= 1e8) str = (abs/1e8).toFixed(2) + '亿';
    else if(abs >= 1e4) str = (abs/1e4).toFixed(2) + '万';
    else str = abs.toFixed(2);
    return sign + str + (cur ? ' ' + cur : '');
  }

  /* ===== 百分比格式化 ===== */
  function fmtPct(n){
    if(n == null || isNaN(n)) return '—';
    return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
  }

  return { evalFormula, calcValuation, calcMoS, calcPosition, fmtMoney, fmtPct };
})();
