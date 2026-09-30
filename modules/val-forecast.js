/* ================= 盈利预测（val-forecast） =================
 * 从 valuation.js 拆出：盈利预测面板（渲染 + hasForecast）与盈利预测 CSV 导入导出。
 * 数据存于 c.forecast：
 *   { updated, detail:[{org,researcher,date,rating,pred:[{year,mark,eps,np}]}],
 *     consensus:[{year,mark,eps,pe,roe,revenue,np,revRatio,npRatio}],
 *     eps:[{org,date,year1,eps1,pe1,year2,eps2,pe2,year3,eps3,pe3}] }
 * 本文件不注册视图/动作：build(K) 返回实现函数，由 valuation.js 末尾的「扩展装配」
 * 绑定回本地作用域后，原渲染/操作调用点零改动。加载顺序：必须先于 valuation.js。
 * 依赖：core.js 全局（DB/state/esc/toast/save/render/openModal/closeModal/mdField/
 *       findById/dateStr/uid）、csv-kit.js（GT_CSV）、snapshots.js（Snapshots）。
 */
(function(){
  function build(K){
    const { METRICS, customMetrics, VAL_MARKETS, VAL_BOARDS, VAL_LYNCH_TYPES, VAL_SCENARIOS, COMPANY_INDUSTRY, COMPANY_LYNCH_TYPE, inferBoard, num, n2 } = K;

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
        '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
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
      h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
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
      h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
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
  // 批量导入「盈利预测 CSV」（盈利预测_{代码}_{公司名}.csv，可多选；
  // 由 fetch_profit_forecast.py --auto 生成）。
  // 公司匹配优先级：CSV 头部「股票代码」行 → 文件名中的 6 位代码 → 头部「公司」名称。
  function importForecastFiles(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.multiple = true;
    input.onchange = () => {
      const files = Array.from(input.files||[]);
      if(!files.length) return;
      if(window.Snapshots) Snapshots.capture('valuation', DB.valuation, '导入盈利预测 CSV 前（' + files.length + ' 个文件）');
      let ok = 0, skipped = 0, bad = 0;
      const code6 = t => { const m = String(t||'').match(/(\d{6})/); return m ? m[1] : ''; };
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const lines = GT_CSV.parseCsvSimple(reader.result);
            const fc = csvToForecast(lines);
            if(!(fc.detail.length || fc.consensus.length || fc.eps.length)){
              bad++;   // 不是盈利预测 CSV（无 ORG/CONS/EPSR 行）
            } else {
              let ticker = '', cname = '';
              for(const r of lines){
                const k = String(r[0]||'').trim();
                if(k === '公司') cname = String(r[1]||'').trim();
                else if(k === '股票代码') ticker = String(r[1]||'').trim().toUpperCase();
                if(ticker && cname) break;
              }
              // fallback：从文件名提取 6 位代码（盈利预测_688256.SH_寒武纪.csv）
              if(!ticker) ticker = code6(file.name);
              let target = null;
              if(ticker) target = DB.valuation.companies.find(x => code6(x.ticker) === code6(ticker));
              if(!target && cname) target = DB.valuation.companies.find(x => x.name === cname);
              if(!target){ skipped++; }
              else { target.forecast = fc; target.updated = dateStr(); ok++; }
            }
          } catch(e){ bad++; }
          if(ok + skipped + bad >= files.length){
            save(); render();
            alert('盈利预测批量导入完成：成功 ' + ok + ' 个，未匹配公司 ' + skipped + ' 个，失败/格式不符 ' + bad + ' 个');
          }
        };
        reader.readAsText(file, 'utf-8');
      });
    };
    input.click();
  }

    return { hasForecast, isRecent3m, yearMarkLabel, renderForecastSection, forecastToCsv, csvToForecast, importForecastFiles };
  }
  (window.VAL_PLUGINS = window.VAL_PLUGINS || []).push(build);
})();
