/* ================= 财报跟踪（earnings） =================
 * 跟踪财报披露后的最新财务数据，用于筛选「财报超预期」的公司。
 *
 * 数据来源：scripts/fetch_earnings.py 生成的汇总 CSV
 *   data/earnings/财报跟踪_YYYYMMDD.csv
 * 前端「⬆ 导入财报 CSV」选择该文件即可加载。
 *
 * 功能：
 *   - 按每个指标排序（点击列头，营收同比/扣非净利同比/营收/净利…）
 *   - 剔除营收同比 < 20% 的公司（默认开启，可切换）
 *   - 行业 / 板块 / 林奇类型标签筛选，区分公司
 *   - 展示披露日期，跟踪最近披露的财报
 *   - 与估值模块联动：未跟踪的公司可「➕ 加入估值」（带出行业/板块/林奇类型），
 *     已跟踪的可「🔍 详情」跳转到估值模块公司详情页
 */
(function(){
  // 指标列定义（key 与 fetch_earnings.py 的 OUT_COLUMNS 列名一致）
  // source:'csv' 表示来自导入的 CSV；'meta' 表示公司标签
  const METRICS = [
    { key:'披露日期', label:'披露日期', type:'date',   sortable:true },
    { key:'季度',     label:'季度',     type:'text',   sortable:true },
    { key:'营业收入', label:'营业收入', unit:'亿', type:'num',    sortable:true },
    { key:'营收同比', label:'营收同比', unit:'%',  type:'pct',    sortable:true },
    { key:'毛利润',   label:'毛利润',   unit:'亿', type:'num',    sortable:true },
    { key:'净利润',   label:'净利润',   unit:'亿', type:'num',    sortable:true },
    { key:'扣非净利润', label:'扣非净利润', unit:'亿', type:'num', sortable:true },
    { key:'扣非净利同比', label:'扣非净利同比', unit:'%', type:'pct', sortable:true },
    { key:'经营现金流', label:'经营现金流', unit:'亿', type:'num', sortable:true },
    { key:'资本开支', label:'资本开支', unit:'亿', type:'num',   sortable:true },
    { key:'ROE',      label:'ROE',      unit:'%',  type:'pct',    sortable:true },
    { key:'毛利率',   label:'毛利率',   unit:'%',  type:'pct',    sortable:true },
    // —— 当年一致预期（财报发布年份），用于判断财报是否超预期 ——
    { key:'预期营收', label:'预期营收', unit:'亿', type:'num',    sortable:true, group:'一致预期' },
    { key:'预期净利', label:'预期净利', unit:'亿', type:'num',    sortable:true, group:'一致预期' },
    { key:'预期营收同比', label:'预期营收同比', unit:'%', type:'pct', sortable:true, group:'一致预期' },
    { key:'预期净利同比', label:'预期净利同比', unit:'%', type:'pct', sortable:true, group:'一致预期' },
    // —— 超预期判定（实际 vs 一致预期，单位 %）——
    { key:'超预期', label:'超预期', unit:'%', type:'beat', sortable:true },
  ];
  const REVENUE_YOY_KEY = '营收同比';
  const MIN_REVENUE_YOY = 20;          // 默认剔除营收同比 <20%

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
    return { rows: [], importedAt: null };
  }

  // 从 DB 里读数据
  function dataRows(){ return DB.earnings.rows; }

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

  // ---- 与估值模块联动：按 ticker 查找估值关注公司 ----
  function findValCompany(ticker){
    const t = String(ticker || '').trim().toUpperCase();
    if(!t) return null;
    return (DB.valuation.companies || []).find(c => String(c.ticker || '').trim().toUpperCase() === t) || null;
  }

  // ---- 工具：数值化 ----
  function num(v){
    if(v == null || v === '' || v === '-') return null;
    const n = Number(String(v).replace(/[,\s%]/g, ''));
    return isNaN(n) ? null : n;
  }

  // 取某行某指标的可比较数值（超预期列为计算值：实际营收同比 - 预期营收同比）
  function metricVal(row, key){
    if(key === '超预期'){
      const a = num(row['营收同比']), e = num(row['预期营收同比']);
      return (a != null && e != null) ? a - e : null;
    }
    return num(row[key]);
  }

  // 自定义筛选条件：{key, op:'>='|'<='|'>'|'<', value}
  function applyCustomFilters(list, filters){
    (filters || []).forEach(f => {
      list = list.filter(r => {
        const v = metricVal(r, f.key);
        if(v == null) return false;
        if(f.op === '>=') return v >= f.value;
        if(f.op === '<=') return v <= f.value;
        if(f.op === '>')  return v > f.value;
        if(f.op === '<')  return v < f.value;
        return true;
      });
    });
    return list;
  }

  // ---- 渲染 ----
  function renderEarnings(){
    const rows = dataRows();
    let h = header('📊 财报跟踪',
      '按披露日期跟踪财报后的最新财务数据，筛选超预期公司 · 共 ' + rows.length + ' 家',
      '<button class="btn ghost sm" data-action="earn.import" title="导入财报跟踪 CSV（data/earnings/财报跟踪_YYYYMMDD.csv），由 scripts/fetch_earnings.py 生成">⬆ 导入财报 CSV</button>' +
      '<button class="btn ghost sm" data-action="earn.clear" title="清空已导入的财报数据">🗑 清空</button>');

    if(!rows.length){
      h += '<div class="card"><div class="empty">还没有财报数据。<br><br>' +
        '运行 <code>py scripts/fetch_earnings.py</code> 生成 <code>data/earnings/财报跟踪_YYYYMMDD.csv</code>，' +
        '然后点击右上角「⬆ 导入财报 CSV」。</div></div>';
      return h;
    }

    // ---- 统计概览 ----
    const yoyVals = rows.map(r => num(r[REVENUE_YOY_KEY])).filter(x => x != null);
    const highGrowth = yoyVals.filter(v => v >= MIN_REVENUE_YOY).length;
    const withConsensus = rows.filter(r => num(r['预期营收']) != null || num(r['预期净利']) != null).length;
    h += '<div class="val-summary-grid">' +
      '<div class="val-stat"><div class="vs-label">跟踪公司</div><div class="vs-value">' + rows.length + '</div></div>' +
      '<div class="val-stat"><div class="vs-label">营收同比≥' + MIN_REVENUE_YOY + '%</div><div class="vs-value up">' + highGrowth + '</div><div class="vs-sub">' + (yoyVals.length ? Math.round(highGrowth / yoyVals.length * 100) : 0) + '% 的公司</div></div>' +
      '<div class="val-stat"><div class="vs-label">有当年一致预期</div><div class="vs-value">' + withConsensus + '</div><div class="vs-sub">可判断超预期</div></div>' +
      '<div class="val-stat"><div class="vs-label">有披露日期</div><div class="vs-value">' + rows.filter(r => r['披露日期']).length + '</div></div>' +
      '</div>';

    // ---- 筛选 chips：行业 ----
    const industries = [...new Set(rows.map(r => r['行业']).filter(Boolean))];
    h += '<div class="chips" style="margin:12px 0 8px">' +
      '<button class="chip ' + (state.earnIndustry === '全部' || !state.earnIndustry ? 'active' : '') + '" data-action="earn.fIndustry" data-v="全部">全部行业</button>' +
      industries.map(i => '<button class="chip ' + (state.earnIndustry === i ? 'active' : '') + '" data-action="earn.fIndustry" data-v="' + esc(i) + '">' + i + '</button>').join('') +
      '</div>';

    // ---- 筛选 chips：板块 ----
    const boards = [...new Set(rows.map(r => r['板块']).filter(Boolean))];
    if(boards.length){
      h += '<div class="chips" style="margin-bottom:8px">' +
        '<button class="chip ' + (state.earnBoard === '全部' || !state.earnBoard ? 'active' : '') + '" data-action="earn.fBoard" data-v="全部">全部板块</button>' +
        boards.map(b => '<button class="chip ' + (state.earnBoard === b ? 'active' : '') + '" data-action="earn.fBoard" data-v="' + esc(b) + '">' + b + '</button>').join('') +
        '</div>';
    }

    // ---- 剔除营收同比<20% 开关 + 自定义数值筛选（紧凑单行）----
    const cf = state.earnCustomFilters || [];
    const OP_LABEL = { '>=':'≥', '<=':'≤', '>':'>', '<':'<' };
    // 可选指标：所有数值列（含超预期计算列）
    const numMetrics = METRICS.filter(m => ['num','pct','beat'].includes(m.type));
    h += '<div class="earn-filterbar">' +
      '<button class="chip ' + (state.earnFilterLow ? 'active' : '') + '" data-action="earn.toggleLow" title="默认剔除营收同比低于 ' + MIN_REVENUE_YOY + '% 的公司，便于聚焦高增长标的">营收同比≥' + MIN_REVENUE_YOY + '%（' + (state.earnFilterLow ? '开' : '关') + '）</button>' +
      // 已添加的自定义条件 → 可删除的 chip
      cf.map((f, i) => '<button class="chip active" data-action="earn.delFilter" data-idx="' + i + '" title="点击移除该筛选条件">' +
        esc(f.key) + ' ' + esc(OP_LABEL[f.op] || f.op) + ' ' + f.value + ' ✕</button>').join('') +
      // 新增条件：字段 / 运算符 / 数值
      '<select id="earnFfKey" title="选择筛选字段">' +
        numMetrics.map(m => '<option value="' + esc(m.key) + '">' + esc(m.label) + '</option>').join('') + '</select>' +
      '<select id="earnFfOp" title="选择比较符">' +
        Object.keys(OP_LABEL).map(op => '<option value="' + op + '">' + OP_LABEL[op] + '</option>').join('') + '</select>' +
      '<input id="earnFfVal" type="number" step="any" placeholder="数值">' +
      '<button class="btn ghost sm" data-action="earn.addFilter">＋</button>' +
      '<span class="hint">点列头排序 · 点已添加条件可移除</span>' +
      '</div>';

    // ---- 过滤 + 排序 ----
    let list = rows.slice();
    if(state.earnIndustry && state.earnIndustry !== '全部') list = list.filter(r => r['行业'] === state.earnIndustry);
    if(state.earnBoard && state.earnBoard !== '全部') list = list.filter(r => r['板块'] === state.earnBoard);
    if(state.earnFilterLow) list = list.filter(r => {
      const v = num(r[REVENUE_YOY_KEY]);
      return v != null && v >= MIN_REVENUE_YOY;
    });
    list = applyCustomFilters(list, state.earnCustomFilters);

    const sortVal = (row, key) => metricVal(row, key);
    const sortKey = state.earnSort || '披露日期';
    const sortDir = state.earnSortDir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const na = sortVal(a, sortKey), nb = sortVal(b, sortKey);
      if(na != null && nb != null) return (na - nb) * sortDir;
      if(na == null && nb == null) return 0;
      return na == null ? 1 : -1;   // 空值排最后
    });

    if(!list.length){
      h += '<div class="card"><div class="empty">当前筛选条件下没有符合条件的公司</div></div>';
      return h;
    }

    // ---- 表格 ----
    // wide-table-wrap：宽屏下表格按内容自动扩宽（占满可视区），窄屏才出现横向滚动条。
    //   - width:auto + min-width:100%：内容 ≤ 容器时填满；内容 > 容器时按 max-content 撑开由外层 overflow 滚动
    h += '<div class="wide-table-wrap"><table class="val-table"><thead><tr>' +
      '<th>公司</th><th>行业</th>' +
      METRICS.map(m => {
        let th = esc(m.label);
        if(m.unit) th += ' <span class="unit">(' + m.unit + ')</span>';
        let arrow = '';
        if(state.earnSort === m.key){
          arrow = state.earnSortDir === 'asc' ? ' ▲' : ' ▼';
        }
        // 分组说明：一致预期列 / 超预期列给出提示
        let tip = '';
        if(m.group === '一致预期') tip = '当年一致预期（券商预测均值）';
        else if(m.key === '超预期') tip = '实际营收同比 - 预期营收同比（>0 表示财报超预期）';
        else tip = '点击按此列排序';
        const sorter = m.sortable ? ' data-action="earn.sort" data-key="' + m.key + '" style="cursor:pointer" title="' + tip + '"' : '';
        const headCls = m.group === '一致预期' ? ' style="border-left:2px solid var(--indigo);"' : (m.key === '超预期' ? ' style="border-left:2px solid var(--pink);"' : '');
        return '<th class="num"' + headCls + ' ' + sorter + '>' + th + arrow + '</th>';
      }).join('') +
      '<th style="border-left:2px solid var(--green)">操作</th>' +
      '</tr></thead><tbody>';

    list.forEach(r => {
      const name = r['公司名称'] || r['股票代码'] || '—';
      const ticker = r['股票代码'] || '';
      const industry = r['行业'] || '';
      const board = r['板块'] || '';
      const lynch = r['林奇类型'] || '';
      h += '<tr>' +
        '<td><b>' + esc(name) + '</b><div class="muted" style="font-size:11px">' + esc(ticker) + '</div></td>' +
        '<td>' +
          (industry ? '<span class="badge ' + (INDUSTRY_CLS[industry] || 'gray') + '">' + esc(industry) + '</span>' : '') +
          (board ? ' <span class="badge ' + (BOARD_CLS[board] || 'gray') + '">' + esc(board) + '</span>' : '') +
          (lynch ? ' <span class="badge ' + (LYNCH_CLS[lynch] || 'gray') + '" title="林奇分类：' + esc(lynch) + '">' + esc(lynch) + '</span>' : '') +
        '</td>';
      METRICS.forEach(m => {
        const raw = r[m.key];
        if(m.type === 'date'){
          h += '<td class="num" style="white-space:nowrap">' + esc(raw || '—') + '</td>';
        } else if(m.type === 'text'){
          // 文本列（如季度）直接显示原值
          h += '<td class="num" style="white-space:nowrap">' + esc(raw || '—') + '</td>';
        } else if(m.type === 'beat'){
          // 超预期判定：实际营收同比 vs 预期营收同比（百分点差）
          const actYoy = num(r['营收同比']);
          const expYoy = num(r['预期营收同比']);
          if(actYoy == null || expYoy == null){
            h += '<td class="num"><span class="muted">—</span></td>';
          } else {
            const diff = actYoy - expYoy;
            const cls = diff > 0 ? 'up' : 'down';
            const flag = diff > 0 ? '▲' : (diff < 0 ? '▼' : '');
            h += '<td class="num ' + cls + '" title="实际营收同比 - 预期营收同比">' + flag + (diff > 0 ? '+' : '') + diff.toFixed(1) + '%</td>';
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
      // 操作列：已跟踪 → 跳转估值详情；未跟踪 → 一键加入估值关注列表
      const known = findValCompany(ticker);
      if(known){
        h += '<td style="white-space:nowrap">' +
          '<button class="btn ghost sm" data-action="earn.openVal" data-ticker="' + esc(ticker) + '" title="跳转到「公司估值」模块查看该公司详情">🔍 详情</button></td>';
      } else {
        h += '<td style="white-space:nowrap">' +
          '<button class="btn ghost sm" data-action="earn.addVal" data-ticker="' + esc(ticker) + '" data-name="' + esc(name) + '" data-industry="' + esc(industry) + '" data-board="' + esc(board) + '" data-type="' + esc(lynch) + '" title="加入估值模块关注列表（自动带出行业/板块/林奇类型），之后可导入财务/盈利预测 CSV 做深度分析">➕ 加入估值</button></td>';
      }
      h += '</tr>';
    });

    h += '</tbody></table></div>';

    // 提示数据时间
    const imported = DB.earnings.importedAt;
    if(imported) h += '<div class="muted" style="margin-top:10px;font-size:12px">数据导入时间：' + esc(imported) + '</div>';

    return h;
  }

  // ---- 导入 CSV ----
  function importCsv(){
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,text/csv';
    input.onchange = () => {
      const files = Array.from(input.files || []);
      if(!files.length) return;
      let total = 0, skipped = 0;
      files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const csvLines = parseCsv(reader.result);
            const rows = csvToRows(csvLines);
            if(rows.length){ DB.earnings.rows = rows; total = rows.length; }
            else skipped++;
          } catch(e){ skipped++; }
          // 所有文件处理完统一保存渲染
          if(skipped > 0 || total > 0){
            DB.earnings.importedAt = dateStr();
            save(); render();
            if(total) toast('✅ 已导入 ' + total + ' 家公司的财报数据');
            if(skipped) toast('⚠️ ' + skipped + ' 个文件未识别到财报数据');
          }
        };
        reader.readAsText(file, 'utf-8');
      });
    };
    input.click();
  }

  // ---- 注册 ----
  Register.module({
    view: 'earnings',
    nav: { ico:'📊', label:'财报跟踪', group:'投资追踪' },
    seed: seed,
    ensure: (db, sv) => {
      if(!Array.isArray(db.earnings.rows)) db.earnings.rows = sv.rows;
      if(!db.earnings.importedAt) db.earnings.importedAt = sv.importedAt;
    },
    render: renderEarnings,
    actions: {
      'earn.import': () => importCsv(),
      'earn.clear': () => {
        if(confirm('确认清空所有已导入的财报跟踪数据？')){
          DB.earnings.rows = []; DB.earnings.importedAt = null;
          state.earnSort = '披露日期'; state.earnSortDir = 'desc';
          state.earnFilterLow = true;
          state.earnCustomFilters = [];
          state.earnIndustry = '全部'; state.earnBoard = '全部';
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
      'earn.fIndustry': el => { state.earnIndustry = el.dataset.v; render(); },
      'earn.fBoard': el => { state.earnBoard = el.dataset.v; render(); },
      'earn.toggleLow': el => { state.earnFilterLow = !state.earnFilterLow; render(); },
      // —— 自定义数值筛选（字段+运算符+数值，可叠加）——
      'earn.addFilter': () => {
        const key = document.getElementById('earnFfKey').value;
        const op = document.getElementById('earnFfOp').value;
        const value = parseFloat(document.getElementById('earnFfVal').value);
        if(isNaN(value)){ toast('⚠️ 请先输入筛选数值'); return; }
        state.earnCustomFilters = state.earnCustomFilters || [];
        state.earnCustomFilters.push({ key, op, value });
        render();
      },
      'earn.delFilter': el => {
        const idx = parseInt(el.dataset.idx, 10);
        if(state.earnCustomFilters && idx >= 0 && idx < state.earnCustomFilters.length){
          state.earnCustomFilters.splice(idx, 1);
          render();
        }
      },
      // —— 与估值模块联动 ——
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
        toast('✅ 已将 ' + (el.dataset.name || ticker) + ' 加入估值跟踪，可到「公司估值」导入财务/盈利预测 CSV');
      },
      'earn.openVal': el => {
        const c = findValCompany(el.dataset.ticker);
        if(!c){ toast('⚠️ 该公司尚未加入估值跟踪'); return; }
        state.valCompanyId = c.id;
        window.scrollTo(0, 0);
        if(state.view === 'valuation'){ render(); }
        else { location.hash = '#/valuation'; }
      },
    },
  });
})();
