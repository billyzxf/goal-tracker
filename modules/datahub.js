/* ================= 数据导入（datahub） =================
 * 全局可复用数据的集中导入 / 管理入口（L0/L2 分层中的「管道侧数据」）：
 *
 *   1. L0 静态公司字典  data/stocks.json（scripts/ops/build_stocks.py 产出，~5500 家）
 *      - http(s) 打开时 core.js loadStocks 启动后自动 fetch（主路径，无需手动导入）；
 *      - file:// 下 fetch 被 CORS 拦截 → 在此手动导入，缓存于 DB.datahub.stocksCache；
 *        下次启动 loadStocks 失败时自动回填缓存；缓存版本比磁盘新时以缓存为准。
 *   2. 全站行情快照  DB.quotes（scripts/fetch_prices.py 产出的股价 CSV）
 *      - 与「公司估值 ⬆ 导入股价」同一解析/写入口径：按 6 位代码写 DB.quotes
 *        （财报跟踪 / 行业研究 / 待击球全站共用），命中估值池公司时同步更新
 *        currentPrice / totalShares / quote。
 *   3. 数据更新脚本速查表：脚本 / 作用 / 输出 / 执行命令 / 建议周期。
 *
 * 原则：本模块只管「全局复用数据」的导入与状态展示，不做任何业务加工；
 *       财务 / 财报 / 盈利预测 / 宏观等业务数据仍在各自模块导入（文末给入口指引）。
 */
(function(){
  const QKEYS = ['price','chg','pct','pct5','monthPct','pe','pb','turnover','volume','amount','mktcap','floatmv'];

  function seed(){ return { stocksCache: null }; }   // stocksCache: { rows, meta, importedAt }
  function ensure(db){
    const d = db.datahub;
    if(d.stocksCache && !Array.isArray(d.stocksCache.rows)) d.stocksCache = null;
  }

  /* ---------- STOCKS 访问（core.js 顶层 const，沙箱/未加载时安全降级） ---------- */
  function getSTOCKS(){
    try { return (typeof STOCKS !== 'undefined') ? STOCKS : null; } catch(e){ return null; }
  }
  // 缓存行有效（非空数组）
  function cacheRows(){
    const c = DB.datahub && DB.datahub.stocksCache;
    return (c && Array.isArray(c.rows) && c.rows.length) ? c : null;
  }

  /* ---------- core.js loadStocks 钩子（core.js 在 fetch 成功/失败两处回调） ---------- */
  // 磁盘 stocks.json 加载成功后：若手动导入的缓存版本更新，用缓存覆盖（防磁盘旧版降级）
  // 返回 true 表示已覆盖，调用方需重绘。
  function onStocksLoaded(){
    const st = getSTOCKS(); if(!st) return false;
    const c = cacheRows(); if(!c) return false;
    const cv = c.meta && c.meta.version, dv = st.meta && st.meta.version;
    if(cv && (!dv || String(cv) > String(dv))){
      st.rows = c.rows; st.meta = c.meta || null;
      return true;
    }
    return false;
  }
  // 磁盘 stocks.json 加载失败（404 / 离线 / file://）：回填手动导入的缓存
  function onStocksFailed(){
    const st = getSTOCKS(); if(!st || st.rows) return false;
    const c = cacheRows(); if(!c) return false;
    st.rows = c.rows; st.meta = c.meta || null;
    return true;
  }
  window.DataHub = { stocksCache: cacheRows, onStocksLoaded: onStocksLoaded, onStocksFailed: onStocksFailed };

  /* ---------- 状态统计 ---------- */
  function stocksInfo(){
    const st = getSTOCKS();
    const rows = (st && st.rows) || null;
    const cache = cacheRows();
    let src = '未加载', cls = 'gray';
    if(rows){
      const diskNewer = !cache || !(cache.meta && cache.meta.version &&
        (!st.meta || !st.meta.version || String(cache.meta.version) > String(st.meta.version)));
      if(cache && !diskNewer){ src = '手动导入缓存 v' + cache.meta.version; cls = 'blue'; }
      else { src = '在线 data/stocks.json'; cls = 'green'; }
    } else if(cache){
      src = '缓存待回填（重启后生效）'; cls = 'amber';
    }
    return {
      count: rows ? rows.length : 0,
      version: (st && st.meta && st.meta.version) || '',
      generated: (st && st.meta && (st.meta.generated || st.meta.date)) || '',
      hasCache: !!cache,
      cacheVersion: cache && cache.meta && cache.meta.version || '',
      cacheImportedAt: cache && cache.importedAt || '',
      loaded: !!rows, src: src, srcCls: cls,
    };
  }
  function quotesInfo(){
    const q = (DB.quotes && typeof DB.quotes === 'object') ? DB.quotes : {};
    const keys = Object.keys(q);
    let latest = '';
    keys.forEach(k => { const d = q[k] && q[k].date; if(d && d > latest) latest = d; });
    let stale = null;
    if(latest){
      const diff = Date.now() - Date.parse(latest + 'T00:00:00');
      stale = diff > 0 ? Math.floor(diff / 86400000) : 0;
    }
    let cls = 'gray', label = '暂无数据';
    if(stale != null){
      if(stale <= 4){ cls = 'green'; label = '新鲜'; }        // 覆盖周末 + 小长假
      else if(stale <= 15){ cls = 'amber'; label = '较旧'; }
      else { cls = 'red'; label = '过期'; }
    }
    return { count: keys.length, latest: latest, stale: stale, cls: cls, label: label };
  }
  function mapInfo(){
    const m = (DB.industryMap && Array.isArray(DB.industryMap.rows)) ? DB.industryMap : null;
    return { count: m ? m.rows.length : 0, importedAt: (m && m.importedAt) || '' };
  }

  /* ---------- 股价 CSV 解析（与 valuation.js「⬆ 导入股价」同口径） ---------- */
  // CSV 解析统一走 modules/csv-kit.js（本文件原有一份重复实现已并入）
  function parseCsvSimple(text){
    return GT_CSV.parseCsvSimple(text);
  }
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
  function csvToPrices(csvLines){
    let idx = null; const out = [];
    const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[,\s%]/g, '')); return isNaN(n) ? null : n; };
    for(const r of csvLines){
      if(!r || !r.length) continue;
      const cells = r.map(x => String(x == null ? '' : x).trim());
      const first = cells[0];
      if(idx === null && (first === '股票代码' || first === '代码')){
        const i = { code:-1, name:-1, price:-1, chg:-1, pct:-1, pct5:-1, monthPct:-1, pe:-1, pb:-1, turnover:-1, volume:-1, amount:-1, mktcap:-1, floatmv:-1, shares:-1 };
        cells.forEach((c, j) => {
          if(c === '股票代码' || c === '代码') i.code = j;
          else if(c === '公司' || c === '名称' || c === '股票名称') i.name = j;
          else if(COLMAP[c]) i[COLMAP[c]] = j;
        });
        if(i.price >= 0) idx = i;
        continue;
      }
      if(!idx) continue;
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
  // 全站行情快照：按 6 位代码写 DB.quotes（与 valuation.js saveGlobalQuote 同口径）
  function saveGlobalQuote(p){
    const m = String(p.ticker || '').match(/(\d{6})/); if(!m) return false;
    DB.quotes = DB.quotes || {};
    const q = { date: dateStr() };
    QKEYS.forEach(k => { if(p[k] != null) q[k] = p[k]; });
    DB.quotes[m[1]] = q;
    return true;
  }
  // 命中估值池公司时同步更新现价/总股本/行情快照（与 valuation.js applyPriceUpdate 同口径）
  function applyPriceUpdate(co, p){
    co.currentPrice = p.price;
    co.updated = dateStr();
    if(p.shares != null && p.shares > 0) co.totalShares = p.shares;
    const q = {};
    ['chg','pct','pct5','monthPct','pe','pb','turnover','volume','amount','mktcap','floatmv']
      .forEach(k => { if(p[k] != null) q[k] = p[k]; });
    if(Object.keys(q).length) co.quote = Object.assign({ date: dateStr() }, q);
  }

  /* ---------- 数据更新脚本速查（执行命令在仓库根目录运行；首次 pip install -r scripts/requirements.txt） ---------- */
  const DH_SCRIPTS = [
    { ico:'📒', script:'build_stocks.py', what:'L0 静态公司字典（全 A 股：代码/名称/市场/板块/申万三级/概念）', out:'data/stocks.json',
      cmd:'py scripts/ops/build_stocks.py', cycle:'每月 1 次', cycleCls:'gray',
      note:'本地「行业分类地图_*.csv」30 天内够新则零联网；行业调整后加 --force-fetch 强制联网重抓' },
    { ico:'📈', script:'fetch_prices.py', what:'行情快照 CSV（现价/涨跌/PE/PB/市值/总股本）→ 本页导入', out:'data/prices/当前股价_YYYYMMDD.csv',
      cmd:'py scripts/fetch_prices.py', cycle:'每交易日收盘后', cycleCls:'green',
      note:'默认只拉核心跟踪池（data/公司列表.csv）；--all 合并估值池+财报池全量（5000+ 家，易限流）' },
    { ico:'📊', script:'fetch_earnings.py', what:'财报跟踪 CSV（按披露日期/关注列表）', out:'data/earnings/',
      cmd:'py scripts/fetch_earnings.py --start 2026-09-01 --end 2026-09-30', cycle:'财报季每日', cycleCls:'green',
      note:'先 --min-yoy 20 预过滤可大幅提速；导入入口在「📊 财报跟踪」' },
    { ico:'💰', script:'fetch_financial.py', what:'单公司 18 期财务 CSV', out:'data/financial/',
      cmd:'py scripts/fetch_financial.py --auto --quarters 18', cycle:'财报季 / 按需', cycleCls:'amber',
      note:'导入入口在「公司估值 ⬆ 批量导入财务」' },
    { ico:'🔮', script:'fetch_profit_forecast.py', what:'盈利预测（券商明细 + 一致预期）', out:'data/forecast/ + JSON',
      cmd:'py scripts/fetch_profit_forecast.py --auto', cycle:'每周', cycleCls:'amber',
      note:'--update-json 直接写 JSON，需在「⬆ 导入数据」回导生效' },
    { ico:'🗺', script:'fetch_industry_map.py', what:'全市场分类地图（申万三级 + 东财行业 + 概念）', out:'data/industry/',
      cmd:'py scripts/fetch_industry_map.py', cycle:'每月 / rebuild stocks.json 前', cycleCls:'gray',
      note:'build_stocks.py 的上游数据源；导入入口在「🏭 行业研究 ⬆ 导入分类地图」' },
    { ico:'🌐', script:'fetch_macro_all.py', what:'宏观全部 47 指标（增量）', out:'data/macro/宏观经济_全部数据.csv',
      cmd:'py scripts/fetch_macro_all.py', cycle:'每周（补月度指标）', cycleCls:'gray',
      note:'导入入口在「🌐 宏观经济 🔄 同步最新数据」' },
    { ico:'📅', script:'fetch_daily.py', what:'宏观日度/周度增量（只补缺失日期）', out:'data/macro/',
      cmd:'py scripts/fetch_daily.py', cycle:'每日（已配 GitHub Actions）', cycleCls:'green',
      note:'结束时打印数据新鲜度报告；日志 data/macro/fetch_daily.log' },
    { ico:'📄', script:'build_valuation_index.py', what:'估值报告索引（公司详情页「📄 估值报告」）', out:'valuations/_index.json',
      cmd:'py scripts/ops/build_valuation_index.py', cycle:'新增/重命名报告后', cycleCls:'amber',
      note:'报告命名约定 {公司名}_估值报告_{YYYYMMDD}.md 不能破' },
    { ico:'🧹', script:'clean_industry_members.py', what:'行业池成员清洗（申万骨架 + 白名单 + 生态位预填）', out:'invest-data.json 直改',
      cmd:'py scripts/ops/clean_industry_members.py', cycle:'按需', cycleCls:'gray',
      note:'直改后自动刷新 meta.updated，浏览器端会收到同步盘更新提示' },
    { ico:'🤖', script:'industry_prefill.py', what:'行业定年纪/体检预填草稿（生成→AI 检索填充→审核式导入）', out:'data/prefill/',
      cmd:'py scripts/ops/industry_prefill.py --new 半导体设备', cycle:'收录新行业时', cycleCls:'amber',
      note:'草稿交给 AI 按 _howto 联网检索填充，行业详情「🕰 定年纪 → 🤖 导入预填」导入（只填空、带来源、逐项确认）' },
    { ico:'✂️', script:'prune_chip_concept.py', what:'概念条目噪声剔除（「国产芯片」excludes 名单：保留申万半导体、屏蔽标签噪声）', out:'invest-data.json 直改',
      cmd:'py scripts/ops/prune_chip_concept.py', cycle:'按需', cycleCls:'gray',
      note:'概念命中仍可在详情页点 🚫 屏蔽 / 弹窗解除；端侧AI芯片等概念条目可仿此扩写' },
  ];

  /* ---------- 渲染 ---------- */
  function sec(no, title, tip){
    return '<div class="val-section"><div class="vs-head"><h3><span class="badge indigo">' + no + '</span> ' + title + '</h3>' +
      (tip ? '<span class="muted" style="font-size:12px">' + tip + '</span>' : '') + '</div>';
  }
  // 速查表里可复制的命令（title 提示；word-break 允许长命令折行，表格随窗口宽度伸缩）
  function cmdCell(cmd){
    return '<code class="md-code" title="在仓库根目录执行" style="word-break:break-all">' + esc(cmd) + '</code>';
  }
  function statCard(ico, title, main, sub, badgeCls, badgeTxt){
    // flex:1 1 200px + min-width:0：三卡按剩余宽度均分，窄窗自动换行堆叠，不设固定像素
    return '<div class="card" style="flex:1 1 200px;min-width:0;margin:0;padding:16px">' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span style="font-size:18px">' + ico + '</span>' +
      '<b style="font-size:13px">' + title + '</b>' +
      (badgeTxt ? '<span class="badge ' + badgeCls + '" style="margin-left:auto">' + badgeTxt + '</span>' : '') + '</div>' +
      '<div style="font-size:22px;font-weight:700">' + main + '</div>' +
      '<div class="muted" style="font-size:12px;margin-top:4px">' + sub + '</div></div>';
  }

  function renderDatahub(){
    const si = stocksInfo(), qi = quotesInfo(), mi = mapInfo();

    let h = header('🗃️ 数据导入', '全局可复用数据的集中导入与管理：L0 静态字典 / 全站行情 · 附数据更新脚本速查',
      '<button class="btn ghost sm" data-action="dh.importStocks" title="手动导入 data/stocks.json（file:// 打开或磁盘文件未生成时使用）">⬆ 导入 stocks.json</button>' +
      '<button class="btn primary" data-action="dh.importPrices" title="多选 data/prices/ 下的股价 CSV，写入全站行情快照（fetch_prices.py 产出）">⬆ 导入股价 CSV</button>');

    // —— 数据资产总览 ——
    h += sec('1', '数据资产总览', 'L0 = 管道侧静态字典 · L2 = 脚本抓取的动态快照');
    const staleTxt = qi.stale == null ? '—' : (qi.stale === 0 ? '今天' : qi.stale + ' 天前');
    const l0Sub = si.loaded ? ('版本 v' + (si.version || '?') + ' · ' + si.src) : ('来源：' + si.src);
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:4px">' +
      statCard('📒', 'L0 静态公司字典', si.loaded ? si.count.toLocaleString() + ' 家' : '未加载',
        l0Sub, si.srcCls, si.loaded ? '已加载' : (si.hasCache ? '有缓存' : '缺失')) +
      statCard('📈', '全站行情快照', qi.count.toLocaleString() + ' 条',
        '最新 ' + (qi.latest || '—') + '（' + staleTxt + '）· 财报/行业/待击球共用', qi.cls, qi.label) +
      statCard('🗺', '行业分类地图（兜底）', mi.count ? mi.count.toLocaleString() + ' 家' : '未导入',
        mi.importedAt ? '导入于 ' + mi.importedAt + ' · L0 缺失时兜底' : 'L0 加载成功时无需此数据', 'gray', mi.count ? '已导入' : '未导入') +
      '</div></div>';

    // —— L0 静态字典 ——
    h += sec('2', 'L0 静态公司字典（stocks.json）', '股票代码/名称/市场/板块/申万三级/概念 · 整体替换，不含股价等动态数据');
    h += '<div class="card" style="margin-top:4px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
        '<button class="btn primary sm" data-action="dh.importStocks">⬆ 导入 stocks.json</button>' +
        (si.hasCache ? '<button class="btn ghost sm" data-action="dh.clearStocksCache" title="删除浏览器内缓存的字典（http(s) 打开时磁盘 fetch 会自动接管）">🗑 清除缓存</button>' : '') +
        '<span class="muted" style="font-size:12px">' +
          (si.loaded
            ? '当前已加载 ' + si.count.toLocaleString() + ' 家 · 来源：' + si.src
            : (si.hasCache ? '尚未加载，缓存将在下次启动时自动回填' : '尚未加载（财报/行业等模块暂用已导入数据兜底）')) +
        '</span></div>' +
      '<div class="muted" style="font-size:12px;line-height:1.9">' +
        '① <b>主路径</b>：通过 http(s) / 本地服务器打开页面时，启动后自动读取 <code class="md-code">data/stocks.json</code>，无需手动导入；<br>' +
        '② <b>手动导入</b>：<code class="md-code">file://</code> 直接双击打开时浏览器禁止 fetch，用左侧按钮选择 <code class="md-code">data/stocks.json</code> 导入，' +
        '导入内容缓存于浏览器（约 +2MB，随导出备份同步），下次启动 fetch 失败时自动回填；<br>' +
        '③ <b>更新</b>：重跑构建脚本生成新文件后，http(s) 打开即自动生效；file:// 下需重新导入一次（缓存版本比磁盘新时以缓存为准）。' +
      '</div>' +
      '<div style="margin-top:10px;font-size:12px">' + cmdCell('py scripts/ops/build_stocks.py') +
      ' <span class="muted">（每月 1 次或申万行业调整后；本地 CSV 30 天内够新则零联网）</span></div>' +
      '</div></div>';

    // —— 全站行情快照 ——
    h += sec('3', '全站行情快照（DB.quotes）', '现价/涨跌幅/5日涨幅/本月涨幅/PE/PB/换手/成交/市值 · 全站一份，任何入口导入全站生效');
    h += '<div class="card" style="margin-top:4px">' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">' +
        '<button class="btn primary sm" data-action="dh.importPrices">⬆ 导入股价 CSV（可多选）</button>' +
        (qi.count ? '<button class="btn ghost sm" data-action="dh.clearQuotes" title="清空全部行情快照（导入前自动快照，可回滚）">🗑 清空行情</button>' : '') +
        '<span class="muted" style="font-size:12px">共 ' + qi.count.toLocaleString() + ' 条 · 最新 ' + (qi.latest || '—') +
        ' · <span class="badge ' + qi.cls + '">' + qi.label + (qi.stale != null ? ' ' + staleTxt : '') + '</span></span></div>' +
      '<div class="muted" style="font-size:12px;line-height:1.9">' +
        '① 先跑抓取脚本生成股价 CSV（默认只拉核心跟踪池，按日期存档到 <code class="md-code">data/prices/</code>）；<br>' +
        '② 本页多选导入（或「公司估值 ⬆ 导入股价」，两者口径完全一致）：写入全站行情快照，' +
        '命中估值池公司时同步更新现价/总股本/行情卡片；财报跟踪、行业研究、待击球按代码直接取用；<br>' +
        '③ 导入前自动创建数据快照，导错可「🗃️ 快照回滚」。' +
      '</div>' +
      '<div style="margin-top:10px;font-size:12px">' + cmdCell('py scripts/fetch_prices.py') +
      ' <span class="muted">（每交易日收盘后；--all 全量 5000+ 家易触发限流）</span></div>' +
      '</div></div>';

    // —— 数据更新脚本速查 ——
    // wide-table-wrap：与其他宽表模块同一逻辑——#main 解除 1220px 上限随窗口铺满，
    // 表格 min-width:max-content 按内容撑开，窄屏由容器横向滚动
    h += sec('4', '数据更新脚本速查', '在仓库根目录执行 · 首次先 pip install -r scripts/requirements.txt · 详见 scripts/README.md');
    h += '<div class="card wide-table-wrap" style="margin-top:4px;padding:14px"><table class="val-table"><thead><tr>' +
      '<th>脚本</th><th>作用</th><th>输出</th><th>执行命令</th><th>建议周期</th><th>备注</th>' +
      '</tr></thead><tbody>' +
      DH_SCRIPTS.map(s =>
        '<tr>' +
        '<td><b>' + s.ico + ' ' + s.script + '</b></td>' +
        '<td>' + esc(s.what) + '</td>' +
        '<td class="muted">' + esc(s.out) + '</td>' +
        '<td>' + cmdCell(s.cmd) + '</td>' +
        '<td><span class="badge ' + s.cycleCls + '">' + s.cycle + '</span></td>' +
        '<td class="muted" style="font-size:12px">' + esc(s.note) + '</td>' +
        '</tr>').join('') +
      '</tbody></table></div></div>';

    // —— 其他业务数据导入入口（指引） ——
    h += sec('5', '其他业务数据的导入入口', '业务数据与公司/组合耦合，在各自模块导入并随 invest-data.json 同步');
    h += '<div class="card wide-table-wrap" style="margin-top:4px;padding:14px"><table class="val-table"><thead><tr>' +
      '<th>数据</th><th>导入入口</th><th>数据来源</th></tr></thead><tbody>' +
      '<tr><td>公司财务（18 期）</td><td>公司估值 → ⬆ 批量导入财务</td><td class="muted">data/financial/*.csv</td></tr>' +
      '<tr><td>财报跟踪池</td><td>财报跟踪 → ⬆ 导入财报 CSV（可多选）</td><td class="muted">data/earnings/*.csv</td></tr>' +
      '<tr><td>盈利预测</td><td>公司估值 → ⬆ 批量导入预测</td><td class="muted">data/forecast/*.csv</td></tr>' +
      '<tr><td>宏观数据</td><td>宏观经济 → 🔄 同步最新数据（离线时 ⬆ 导入全部）</td><td class="muted">data/macro/宏观经济_全部数据.csv</td></tr>' +
      '<tr><td>行业分类地图（兜底）</td><td>行业研究 → ⬆ 导入分类地图</td><td class="muted">data/industry/行业分类地图_*.csv</td></tr>' +
      '<tr><td>全量备份 / 换设备</td><td>侧边栏 ⬆ 导入数据 / 🔄 检查同步盘</td><td class="muted">invest-data.json</td></tr>' +
      '</tbody></table></div></div>';

    return h;
  }

  /* ---------- 动作 ---------- */
  function pickFile(accept, multiple, onFiles){
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept; input.multiple = !!multiple;
    input.onchange = () => { const fs = Array.from(input.files || []); if(fs.length) onFiles(fs); };
    input.click();
  }

  Register.module({
    view: 'datahub',
    nav: { ico:'🗃️', label:'数据导入', group:'投资追踪' },
    seed: seed,
    ensure: ensure,
    render: renderDatahub,
    actions: {
      // 导入 stocks.json：整体替换 STOCKS + 缓存到 DB.datahub（file:// / 磁盘文件未生成时用）
      'dh.importStocks': () => pickFile('.json,application/json', false, files => {
        const reader = new FileReader();
        reader.onload = () => {
          try{
            const j = JSON.parse(reader.result);
            if(!j || !Array.isArray(j.stocks) || !j.stocks.length) throw new Error('不是有效的 stocks.json（缺少非空 stocks 数组）');
            const st = getSTOCKS();
            if(!st) throw new Error('内核 STOCKS 未就绪，请刷新页面后重试');
            st.rows = j.stocks; st.meta = j.meta || null;
            DB.datahub.stocksCache = { rows: j.stocks, meta: j.meta || null, importedAt: new Date().toISOString() };
            save(); render();
            toast('L0 字典导入成功：' + j.stocks.length.toLocaleString() + ' 家（版本 v' + ((j.meta && j.meta.version) || '?') + '）');
          }catch(e){ alert('导入失败：' + e.message); }
        };
        reader.readAsText(files[0], 'utf-8');
      }),
      // 清除字典缓存（http(s) 打开时磁盘 fetch 会自动接管）
      'dh.clearStocksCache': () => {
        if(!confirm('清除浏览器内缓存的 stocks.json？\nhttp(s) 打开页面时会自动从磁盘读取，不影响已加载的数据。')) return;
        DB.datahub.stocksCache = null;
        save(); render();
        toast('字典缓存已清除');
      },
      // 导入股价 CSV（可多选）：写 DB.quotes 全站快照 + 命中估值池同步更新（与「公司估值 ⬆ 导入股价」同口径）
      'dh.importPrices': () => pickFile('.csv,text/csv', true, files => {
        if(window.Snapshots) Snapshots.capture('quotes', DB.quotes, '数据导入页导入股价 CSV 前（' + files.length + ' 个文件）');
        let done = 0, quoted = 0, updated = 0, errors = 0;
        files.forEach(file => {
          const reader = new FileReader();
          reader.onload = () => {
            try{
              const prices = csvToPrices(parseCsvSimple(reader.result));
              if(!prices.length){ errors++; }
              else prices.forEach(p => {
                if(saveGlobalQuote(p)) quoted++;
                const co = ((DB.valuation && DB.valuation.companies) || []).find(x =>
                  (window.Repo ? Repo.normTicker(x.ticker) : String(x.ticker || '').trim().toUpperCase()) === p.ticker ||
                  (p.name && x.name === p.name));
                if(co){ applyPriceUpdate(co, p); updated++; }
              });
            }catch(e){ errors++; }
            if(++done >= files.length){
              save(); render();
              alert('行情导入完成：全站快照 ' + quoted + ' 条' +
                (updated ? '，同步更新估值池 ' + updated + ' 家' : '') +
                (errors ? '，失败/非股价 CSV ' + errors + ' 个' : ''));
            }
          };
          reader.readAsText(file, 'utf-8');
        });
      }),
      // 清空行情快照（导入前已自动快照，可回滚）
      'dh.clearQuotes': () => {
        const n = Object.keys(DB.quotes || {}).length;
        if(!n){ toast('当前没有行情快照'); return; }
        if(!confirm('清空全部 ' + n + ' 条行情快照？\n（清空前自动创建快照，可在「🗃️ 快照回滚」恢复）')) return;
        if(window.Snapshots) Snapshots.capture('quotes', DB.quotes, '清空全站行情前');
        DB.quotes = {};
        save(); render();
        toast('行情快照已清空');
      },
    },
  });
})();
