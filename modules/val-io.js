/* ================= 估值 CSV 导入 / 导出（val-io） =================
 * 从 valuation.js 拆出：财务/股价/公司列表 CSV 导入导出、公司组、
 * 财务与自定义指标编辑弹窗（含 window.recalcFinModal / insertMetricKey 等全局挂载）。
 * CSV 用途：把某公司的财务数据导出为结构化文本，可在 Excel/外部批量处理、
 *           批量获取数据后，再导入回项目，实现跨设备同步与外部分析。
 * 本文件不注册视图/动作：build(K) 返回实现函数，由 valuation.js 末尾的「扩展装配」
 * 绑定回本地作用域后，原渲染/操作调用点零改动。加载顺序：必须先于 valuation.js。
 * 依赖：core.js 全局（DB/state/esc/toast/save/render/openModal/closeModal/mdField/
 *       findById/dateStr/uid）、csv-kit.js（GT_CSV）、snapshots.js（Snapshots）。
 */
(function(){
  function build(K){
    const { METRICS, customMetrics, VAL_MARKETS, VAL_BOARDS, VAL_LYNCH_TYPES, VAL_SCENARIOS, COMPANY_INDUSTRY, COMPANY_LYNCH_TYPE, inferBoard, num, n2 } = K;

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
  // CSV 导出 / 解析：统一走 modules/csv-kit.js（本文件原有两份重复实现已并入）
  function downloadCsv(filename, content){
    return GT_CSV.downloadCsv(filename, content);
  }
  function parseCsvSimple(text){
    return GT_CSV.parseCsvSimple(text);
  }

  /* ----- 公司列表批量导入 / 导出（对一批新公司做分析）-----
   * 导出列与「⬆ 导入公司列表」互相兼容，同时可作为脚本输入：
   *   py scripts/fetch_financial.py --from-csv 公司列表.csv
   *   py scripts/fetch_profit_forecast.py --from-csv 公司列表.csv
   * 导入时兼容两种格式（都要求含「股票代码」表头列）：
   *   ① 本模块导出的公司列表 CSV
   *   ② 财报跟踪模块「⬇ 导出 CSV」的筛选结果宽表（指标列自动忽略）
   * 按股票代码去重，已存在的公司跳过。 */
  const COMPANY_CSV_COLS = ['股票代码','公司名称','市场','板块','行业','行业二级','行业三级','林奇类型','行业细分','货币','现价','总股本'];

  /* ----- 公司组（把一批公司圈在一起，便于过滤查看与导出给脚本批量分析）-----
   * 数据存 DB.valuation.groups：[{ id, name, note, tickers:[股票代码...], createdAt }]
   * 成员按股票代码（ticker）记录而非内部 id：公司删除后组保留，重新导入同一代码自动回到组；
   * 导出格式与「⬇ 导出公司列表」一致，可直接作为脚本输入：
   *   py scripts/fetch_financial.py --from-csv 公司组_组名_日期.csv
   *   py scripts/fetch_profit_forecast.py --from-csv 公司组_组名_日期.csv */
  function valGroups(){ return DB.valuation.groups || (DB.valuation.groups = []); }
  function groupById(id){ return valGroups().find(g => g.id === id); }
  // 解析组成员：exist = 组内已导入的公司对象，missing = 尚未导入的股票代码（公司删除后残留）
  function groupMembers(g){
    const byTicker = new Map(DB.valuation.companies.map(c => [String(c.ticker||'').trim().toUpperCase(), c]));
    const exist = [], missing = [];
    (g.tickers || []).forEach(t => {
      const c = byTicker.get(String(t).trim().toUpperCase());
      c ? exist.push(c) : missing.push(t);
    });
    return { exist, missing };
  }
  // 新建组弹窗：自动携带当前勾选的公司（浮动条「📦 存为新组」与 chips「＋ 组」共用）
  function openGroupNewModal(){
    const sel = state.valSel || [];
    openModal('新建公司组',
      '<div class="field"><label>组名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required placeholder="如：AI算力、光模块、核心持仓"></div>' +
      mdField('note', '组备注（关注逻辑等，支持 Markdown）', '', 3) +
      (sel.length
        ? '<div class="muted" style="font-size:12px">将包含当前勾选的 ' + sel.length + ' 家公司：' + esc(sel.join('、')) + '</div>'
        : '<div class="muted" style="font-size:12px">创建空组。之后勾选公司卡片 → 浮动条「➕ 加入已有组」即可添加成员。</div>') +
      '<input type="hidden" name="tickers" value="' + esc(sel.join(',')) + '">',
      'val.saveGroup');
  }

  function csvEscape(v){
    v = String(v == null ? '' : v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
  }
  // list 不传 = 全部公司；headNote = 注释行标题（如「公司组「AI算力」 · 12 家」）
  function companiesToCsv(list, headNote){
    const cs = list || DB.valuation.companies;
    const lines = ['# GoalTracker ' + (headNote || '公司列表') + '（导出于 ' + dateStr() + '，可用 fetch_financial.py --from-csv 批量抓取）', COMPANY_CSV_COLS.join(',')];
    cs.forEach(c => {
      lines.push([c.ticker, c.name, c.market || 'A股', c.board || '', c.industry || '', c.industryL2 || '',
        c.industryL3 || '', c.companyType || '', c.sector || '', c.currency || '',
        c.currentPrice || '', c.totalShares || ''].map(csvEscape).join(','));
    });
    return '\ufeff' + lines.join('\r\n');
  }
  function importCompaniesCsv(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const file = input.files && input.files[0];
      if(!file) return;
      if(window.Snapshots) Snapshots.capture('valuation', DB.valuation, '导入公司列表 CSV 前');
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rows = parseCsvSimple(reader.result);
          // 找表头行（含「股票代码」列，# 注释行自动跳过）
          let header = null, headerIdx = -1;
          for(let i = 0; i < rows.length; i++){
            const cells = (rows[i] || []).map(x => String(x == null ? '' : x).trim());
            if(cells[0] && cells[0].charAt(0) === '#') continue;
            if(cells.includes('股票代码')){ header = cells; headerIdx = i; break; }
          }
          if(!header){ alert('CSV 中未找到「股票代码」表头列。\n请导入公司列表 CSV，或财报跟踪模块导出的筛选结果 CSV。'); return; }
          const get = (r, n) => { const idx = header.indexOf(n); return idx >= 0 ? String(r[idx] == null ? '' : r[idx]).trim() : ''; };
          const boardKeys = VAL_BOARDS.map(b => b.key).filter(Boolean);
          const lynchKeys = VAL_LYNCH_TYPES.map(t => t.key);
          const existTicker = new Set(DB.valuation.companies.map(c => String(c.ticker || '').trim().toUpperCase()));
          const existName = new Set(DB.valuation.companies.map(c => String(c.name || '').trim()));
          let added = 0, skipped = 0, updated = 0;
          for(let i = headerIdx + 1; i < rows.length; i++){
            const r = rows[i] || [];
            const ticker = get(r, '股票代码').toUpperCase();
            const name = get(r, '公司名称');
            if(!ticker && !name) continue;
            if((ticker && existTicker.has(ticker)) || (!ticker && name && existName.has(name))){
              // 已存在：用 CSV 中的行业分类刷新（行业是客观数据，取最新；其余字段保持不动）
              const ex = DB.valuation.companies.find(c =>
                (ticker && String(c.ticker || '').trim().toUpperCase() === ticker) ||
                (!ticker && name && String(c.name || '').trim() === name));
              if(ex){
                let ch = false;
                const ni = get(r, '行业'), n2 = get(r, '行业二级'), n3 = get(r, '行业三级');
                if(ni && ex.industry !== ni){ ex.industry = ni; ch = true; }
                if(n2 && ex.industryL2 !== n2){ ex.industryL2 = n2; ch = true; }
                if(n3 && ex.industryL3 !== n3){ ex.industryL3 = n3; ch = true; }
                if(ch) updated++;
              }
              skipped++;
              continue;
            }
            let market = get(r, '市场');
            if(!VAL_MARKETS.includes(market)){
              market = /\.HK$/i.test(ticker) ? '港股' : (/\.US$/i.test(ticker) ? '美股' : 'A股');
            }
            const board = get(r, '板块');
            let ctype = get(r, '林奇类型') || get(r, '公司类型');
            if(ctype && !lynchKeys.includes(ctype)) ctype = '';   // 非标准类型不带入，避免筛选混乱
            DB.valuation.companies.push({
              id: uid(),
              name: name || ticker,
              ticker,
              market,
              board: boardKeys.includes(board) ? board : '',
              industry: get(r, '行业'),
              industryL2: get(r, '行业二级'),
              industryL3: get(r, '行业三级'),
              companyType: ctype,
              sector: get(r, '行业细分') || get(r, '细分'),
              currency: get(r, '货币') || (market === 'A股' ? 'CNY' : ''),
              currentPrice: parseFloat(get(r, '现价')) || 0,
              totalShares: parseFloat(get(r, '总股本')) || '',
              financials: [], valuations: [], investments: [], research: '',
            });
            if(ticker) existTicker.add(ticker);
            if(name) existName.add(name);
            added++;
          }
          if(added || updated) save();
          render();
          alert('导入完成：新增 ' + added + ' 家' + (updated ? '，更新行业分类 ' + updated + ' 家' : '') +
            (skipped ? '，跳过已存在 ' + skipped + ' 家' : '') +
            (added ? '\n\n下一步可运行：\npy scripts/fetch_financial.py --from-csv <公司列表CSV>\npy scripts/fetch_profit_forecast.py --from-csv <公司列表CSV>\n抓取财务与预期数据后「⬆ 批量导入 CSV」' : ''));
        } catch(e){ alert('导入失败：' + e.message); }
      };
      reader.readAsText(file, 'utf-8');
    };
    input.click();
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
  // 把「股价 CSV」解析为行情快照数组。格式（fetch_prices.py 生成，按日期存档）：
  //   股票代码,公司,现价,涨跌额,涨跌幅%,市盈率(动),市净率,换手率%,成交量(手),成交额(亿),总市值(亿),流通市值(亿),总股本(亿股)
  // 兼容列头顺序变动与旧格式（只有 现价 列）
  function csvToPrices(csvLines){
    let idx = null;
    const out = [];
    const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isNaN(n) ? null : n; };
    const COLMAP = {
      '现价':'price', '价格':'price', '最新价':'price',
      '涨跌额':'chg', '涨跌':'chg', '涨跌幅%':'pct', '涨跌幅':'pct',
      '5日涨幅%':'pct5', '5日涨幅':'pct5', '近5日涨幅%':'pct5',
      '本月涨幅%':'monthPct', '本月涨幅':'monthPct', '月涨幅%':'monthPct', '月涨幅':'monthPct',
      '市盈率(动)':'pe', '市盈率':'pe', '市净率':'pb',
      '换手率%':'turnover', '换手率':'turnover',
      '成交量(手)':'volume', '成交量':'volume',
      '成交额(亿)':'amount', '成交额':'amount',
      '总市值(亿)':'mktcap', '总市值':'mktcap',
      '流通市值(亿)':'floatmv', '总股本(亿股)':'shares', '总股本':'shares',
    };
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const cells = r.map(x => String(x == null ? '' : x).trim());
      const first = cells[0];
      // 识别列头行：第一格是「股票代码」或「代码」
      if(idx === null && (first === '股票代码' || first === '代码')){
        const i = { code:-1, name:-1, price:-1, chg:-1, pct:-1, pe:-1, pb:-1, turnover:-1, volume:-1, amount:-1, mktcap:-1, floatmv:-1, shares:-1 };
        cells.forEach((c, j) => {
          if(c === '股票代码' || c === '代码') i.code = j;
          else if(c === '公司' || c === '名称' || c === '股票名称') i.name = j;
          else if(COLMAP[c]) i[COLMAP[c]] = j;
        });
        if(i.price >= 0){ idx = i; }
        continue;
      }
      if(!idx) continue;                          // 尚未遇到列头
      const code = cells[idx.code >= 0 ? idx.code : 0] || '';
      if(!/^\d{6}(\.(SH|SZ|BJ))?$/.test(code)) continue;
      const price = num(cells[idx.price]);
      if(price == null) continue;
      const get = k => idx[k] >= 0 ? num(cells[idx[k]]) : null;
      out.push({
        ticker: code.toUpperCase(),
        name: cells[idx.name >= 0 ? idx.name : 1] || '',
        price,
        chg: get('chg'), pct: get('pct'), pct5: get('pct5'), monthPct: get('monthPct'),
        pe: get('pe'), pb: get('pb'),
        turnover: get('turnover'), volume: get('volume'), amount: get('amount'),
        mktcap: get('mktcap'), floatmv: get('floatmv'), shares: get('shares'),
      });
    }
    return out;
  }
  // 全站行情快照：按 6 位代码存最新行情（与估值池公司解耦）——
  // 财报跟踪、行业研究等模块直接按代码取用，公司不必先加入估值池
  function saveGlobalQuote(p){
    const c6 = (String(p.ticker || '').match(/(\d{6})/) || [])[1] || '';
    if(!c6) return;
    DB.quotes = DB.quotes || {};
    const q = { date: dateStr() };
    ['price','chg','pct','pct5','monthPct','pe','pb','turnover','volume','amount','mktcap','floatmv']
      .forEach(k => { if(p[k] != null) q[k] = p[k]; });
    DB.quotes[c6] = q;
  }
  // 把一条行情快照写入公司：更新现价/总股本，并带出涨跌/估值/成交等快照
  // （「⬆ 导入股价」与「⬆ 批量导入 CSV」识别到股价 CSV 时共用此逻辑）
  function applyPriceUpdate(target, p){
    target.currentPrice = p.price;
    target.updated = dateStr();
    // 总股本（行情快照推算，亿股）：有值时自动补全
    if(p.shares != null && p.shares > 0) target.totalShares = p.shares;
    // 行情快照（详情页上方展示）：涨跌/市盈率(动)/市净率/换手率/成交额/市值
    const q = {};
    ['chg','pct','pct5','monthPct','pe','pb','turnover','volume','amount','mktcap','floatmv']
      .forEach(k => { if(p[k] != null) q[k] = p[k]; });
    target.quote = Object.keys(q).length ? Object.assign({ date: dateStr() }, q) : target.quote;
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
      // 写库前自动快照：财务 CSV 影响估值域；股价 CSV 还会更新全站行情（quotes），两域都拍
      if(window.Snapshots){
        Snapshots.capture('valuation', DB.valuation, '导入财务/股价 CSV 前（' + files.length + ' 个文件）');
        Snapshots.capture('quotes', DB.quotes, '导入财务/股价 CSV 前（股价 CSV 会更新全站行情）');
      }
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
                let updated = 0, quoted = 0;
                prices.forEach(p => {
                  saveGlobalQuote(p);   // 全站行情：无论是否在估值池都写入（财报跟踪/行业研究取用）
                  quoted++;
                  const target = DB.valuation.companies.find(x =>
                    x.ticker === p.ticker || (p.name && x.name === p.name));
                  if(!target) return;
                  applyPriceUpdate(target, p);
                  updated++;
                });
                if(updated){ matched++; } else { skipped++; }
              }
              if(matched + skipped + errors >= files.length){ save(); render(); alert('股价导入完成：更新估值池 ' + matched + ' 家，全站行情 ' + quoted + ' 条（财报跟踪/行业研究同步生效），跳过 ' + skipped + ' 家'); }
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
            // 镜像写入共享财务库（幂等）：导入的财务数据统一沉淀到 DB.finstats
            if(window.FinStats) FinStats.ingestValuation(target, parsed.financials);
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
      // 写库前自动快照：股价导入同时更新估值域与全站行情域
      if(window.Snapshots){
        Snapshots.capture('valuation', DB.valuation, '导入股价 CSV 前（' + files.length + ' 个文件）');
        Snapshots.capture('quotes', DB.quotes, '导入股价 CSV 前（' + files.length + ' 个文件）');
      }
      let updated = 0, skipped = 0, bad = 0, quoted = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const csvLines = parseCsvSimple(reader.result);
            const prices = csvToPrices(csvLines);
            if(!prices.length){ bad++; }
            else {
              prices.forEach(p => {
                saveGlobalQuote(p);   // 全站行情：无论是否在估值池都写入（财报跟踪/行业研究取用）
                quoted++;
                const target = DB.valuation.companies.find(x =>
                  x.ticker === p.ticker || (p.name && x.name === p.name));
                if(!target){ skipped++; return; }
                applyPriceUpdate(target, p);
                updated++;
              });
            }
          } catch(e){ bad++; }
          if(updated + skipped + bad >= files.length){
            save(); render();
            alert('股价导入完成：更新估值池 ' + updated + ' 家，全站行情 ' + quoted + ' 条（财报跟踪/行业研究同步生效），仅行情未入估值池 ' + skipped + ' 家，失败 ' + bad + ' 个');
          }
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

    return { finKeys, financialsToCsv, downloadCsv, parseCsvSimple, COMPANY_CSV_COLS, valGroups, groupById, groupMembers, openGroupNewModal, csvEscape, companiesToCsv, importCompaniesCsv, csvToPrices, saveGlobalQuote, applyPriceUpdate, csvRowsToFinancials, importCsvFiles, importPriceFiles, valFinModalBody, valInvModalBody, customMetricsModalBody };
  }
  (window.VAL_PLUGINS = window.VAL_PLUGINS || []).push(build);
})();
