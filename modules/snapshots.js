/* ================= 数据快照服务（snapshots） =================
 * 定位：导入/清空等批量写库操作前的自动快照 + 一键回滚（财报季数据更新保险）。
 *
 * 设计：
 *   - 独立 IndexedDB（gt-snapshots），不触碰主数据库，读写失败不影响导入主流程。
 *   - 按数据域快照：earnings（财报跟踪）/ valuation（公司估值）/ quotes（全站行情）。
 *   - capture(domain, dataObj, reason)：调用方在修改 DB 之前传入旧值本身（同步深拷贝），
 *     内部异步落盘——保证快照一定是「写库前」的状态。
 *   - 每域保留最近 KEEP 份，超出自动清理。
 *   - 快照动作通过全局 ACTIONS 注入（本模块是非视图工具模块，同 val-core 模式）：
 *       data-action="snap.list"     打开快照列表弹窗（各模块工具行入口）
 *       data-action="snap.restore"  回滚指定快照（列表弹窗内按钮）
 *       data-action="snap.remove"   删除指定快照（列表弹窗内按钮）
 * 依赖 core.js 全局：ACTIONS / openModal / closeModal / toast / esc / save / render / DB。
 */
(function(){
  const DB_NAME = 'gt-snapshots';
  const STORE = 'snaps';
  const KEEP = 5;   // 每个数据域保留的快照份数
  const DOMAIN_META = {
    earnings:  { label: '财报跟踪', ico: '📊' },
    valuation: { label: '公司估值', ico: '📈' },
    quotes:    { label: '全站行情', ico: '💰' },
  };

  function dbOpen(){
    return new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }

  function summarize(domain, obj){
    if(!obj) return '空';
    if(domain === 'earnings')  return (obj.rows || []).length + ' 行财报';
    if(domain === 'valuation') return (obj.companies || []).length + ' 家公司';
    if(domain === 'quotes')    return Object.keys(obj || {}).length + ' 只行情';
    return '—';
  }
  function fmtTime(iso){ return String(iso || '').replace('T', ' ').slice(0, 16); }

  /* ---------- 快照写入 ---------- */
  async function capture(domain, dataObj, reason){
    try {
      const snap = {
        id: domain + '|' + Date.now() + '|' + Math.random().toString(36).slice(2, 6),
        domain: domain,
        at: new Date().toISOString(),
        reason: reason || '导入前自动快照',
        summary: summarize(domain, dataObj),
        data: JSON.parse(JSON.stringify(dataObj || null)),
      };
      const db = await dbOpen();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(snap);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      await prune(domain);
      toast('📸 已自动快照「' + (DOMAIN_META[domain] || {}).label + '」· ' + snap.summary + '（可随时回滚）');
      return snap.id;
    } catch(e){
      console.warn('快照失败（不影响本次导入）:', e);
      return null;
    }
  }

  async function prune(domain){
    try {
      const mine = (await list(domain)).slice(KEEP);
      if(!mine.length) return;
      const db = await dbOpen();
      await new Promise((res, rej) => {
        const tx = db.transaction(STORE, 'readwrite');
        const st = tx.objectStore(STORE);
        mine.forEach(s => st.delete(s.id));
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
    } catch(e){ console.warn('快照清理失败:', e); }
  }

  /* ---------- 快照读取 ---------- */
  async function list(domain){
    const all = await listAll();
    return domain ? all.filter(s => s.domain === domain) : all;
  }
  async function listAll(){
    const db = await dbOpen();
    return new Promise((res, rej) => {
      const rq = db.transaction(STORE).objectStore(STORE).getAll();
      rq.onsuccess = () => res((rq.result || []).sort((a, b) => String(b.at).localeCompare(String(a.at))));
      rq.onerror = () => rej(rq.error);
    });
  }
  async function get(id){
    const db = await dbOpen();
    return new Promise((res, rej) => {
      const rq = db.transaction(STORE).objectStore(STORE).get(id);
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
  }

  /* ---------- 回滚 / 删除 ---------- */
  async function restore(id){
    const snap = await get(id);
    if(!snap || !snap.data){ toast('⚠️ 快照数据缺失，无法回滚'); return false; }
    DB[snap.domain] = snap.data;
    save(); render(); closeModal();
    toast('✅ 已回滚「' + (DOMAIN_META[snap.domain] || {}).label + '」至 ' + fmtTime(snap.at));
    return true;
  }
  async function remove(id){
    const db = await dbOpen();
    await new Promise((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  /* ---------- 快照列表弹窗 ---------- */
  function openList(){
    listAll().then(snaps => {
      let h = '<div class="muted" style="margin-bottom:8px">导入财报 / 财务 / 预测 / 行情、清空财报数据等批量写库操作前会自动快照对应数据域（每域保留最近 ' + KEEP + ' 份）。<b>回滚会把该域数据整体恢复到快照时点，当前数据被覆盖</b>；如需保留当前数据，请先手动导出 CSV/JSON。</div>';
      if(!snaps.length){
        h += '<div class="empty">暂无快照。下次导入或清空操作时会自动创建。</div>';
      } else {
        snaps.forEach(s => {
          const m = DOMAIN_META[s.domain] || { label: s.domain, ico: '❓' };
          h += '<div class="stat-line" style="justify-content:space-between;align-items:flex-start;gap:8px">' +
            '<span style="min-width:0">' +
              '<b>' + m.ico + ' ' + esc(m.label) + '</b> <span class="muted">' + esc(s.summary) + '</span>' +
              '<div class="muted" style="font-size:11px">' + esc(fmtTime(s.at)) + (s.reason ? ' · ' + esc(s.reason) : '') + '</div>' +
            '</span>' +
            '<span style="display:flex;gap:4px;flex-shrink:0">' +
              '<button type="button" class="btn ghost sm" data-action="snap.restore" data-id="' + esc(s.id) + '">↺ 回滚</button>' +
              '<button type="button" class="btn ghost sm" data-action="snap.remove" data-id="' + esc(s.id) + '" title="删除该快照">🗑</button>' +
            '</span></div>';
        });
      }
      openModal('📸 数据快照与回滚', h, null, null, true);
    }).catch(e => toast('⚠️ 快照读取失败: ' + (e && e.message || e)));
  }

  /* ---------- 动作注册（非视图模块直接注入全局事件委托） ---------- */
  Object.assign(ACTIONS, {
    'snap.list': () => openList(),
    'snap.restore': el => {
      const id = el.dataset.id;
      if(confirm('确认回滚到该快照？对应数据域将被整体覆盖为快照时点的内容。')) restore(id);
    },
    'snap.remove': el => {
      const id = el.dataset.id;
      if(confirm('确认删除该快照？')) remove(id).then(openList);
    },
  });

  window.Snapshots = { capture, list, listAll, get, restore, remove, openList };
})();
