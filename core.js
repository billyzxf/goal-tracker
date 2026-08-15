/* =====================================================================
 * GoalTracker · 内核（core）
 * ---------------------------------------------------------------------
 * 职责：
 *   1. 工具函数 / Markdown 渲染 / 公式排版 / Toast / 深色模式
 *   2. 数据层：IndexedDB + localStorage + JSON 备份，schema 驱动迁移（防抖批量写入）
 *   3. 模块注册机制（Register.module），供 modules/ 下各模块注册
 *   4. 全局状态 state、UI 组件库、弹窗
 *   5. 事件分发（actions / changes / inputs / forms 四表统一合并）
 *   6. 渲染入口（按 state.view 查表调用模块 render）、hash 路由（#/view，支持前进后退）、初始化
 *
 * 模块约定：modules/*.js 通过 IIFE 调用 window.Register.module({...})
 * ===================================================================== */

/* ================= 工具函数 ================= */
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const p2 = n => String(n).padStart(2, '0');
const dateStr = (d = new Date()) => d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
function mondayStr(d = new Date()) { const x = new Date(d); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return dateStr(x); }
const WEEK_CN = ['周日','周一','周二','周三','周四','周五','周六'];
const todayIdx = () => (new Date().getDay() + 6) % 7; // 周一=0
function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function fmtCN(dstr){ const d = dstr ? new Date(dstr + 'T00:00:00') : new Date();
  return d.getFullYear() + '年' + (d.getMonth()+1) + '月' + d.getDate() + '日 ' + WEEK_CN[d.getDay()]; }

/* ================= 深色模式 =================
 * 主题由 index.html 的内联脚本在首帧前应用（防闪白），
 * 这里负责切换、持久化与 UI 状态（按钮文案 / meta theme-color）同步。
 */
const THEME_KEY = 'goalTracker.theme';
function isDarkTheme(){ return document.documentElement.classList.contains('dark'); }
function applyTheme(dark){
  document.documentElement.classList.toggle('dark', !!dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.setAttribute('content', dark ? '#0d1117' : '#0ea97b');
  try { localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light'); } catch(e){}
  document.querySelectorAll('[data-action="theme.toggle"]').forEach(b => {
    b.textContent = dark ? '☀️ 浅色模式' : '🌙 深色模式';
  });
}
function toggleTheme(){ applyTheme(!isDarkTheme()); }

/* ================= Toast 轻提示 =================
 * 替代 alert() 的非阻断式反馈（导入/导出成功等场景）。
 */
function toast(msg, ms){
  let wrap = document.querySelector('.toast-wrap');
  if(!wrap){ wrap = document.createElement('div'); wrap.className = 'toast-wrap'; document.body.appendChild(wrap); }
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, ms || 2200);
}

/* ================= Markdown 渲染（支持 $公式$） ================= */
function md(src){
  if(!src || !String(src).trim()) return '<span class="muted">（暂无内容）</span>';
  const stash = [];
  const keep = html => { stash.push(html); return '\u0001' + (stash.length - 1) + '\u0001'; };
  let s = String(src);
  s = s.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, (m, c) => keep('<pre class="md-pre"><code>' + esc(c.replace(/\n$/, '')) + '</code></pre>'));
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (m, t) => keep('<span class="math-tex math-block" data-tex="' + encodeURIComponent(t) + '"></span>'));
  s = s.replace(/\$([^$\n]+?)\$/g, (m, t) => keep('<span class="math-tex" data-tex="' + encodeURIComponent(t) + '"></span>'));
  s = s.replace(/`([^`\n]+)`/g, (m, c) => keep('<code class="md-code">' + esc(c) + '</code>'));
  s = esc(s);
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const lines = s.split('\n'); let html = '', inList = null;
  const closeList = () => { if(inList){ html += inList === 'ul' ? '</ul>' : '</ol>'; inList = null; } };
  for(const line of lines){
    if(/^\u0001\d+\u0001$/.test(line)){ closeList(); html += line; continue; }
    let m;
    if((m = line.match(/^(#{1,4})\s+(.*)$/))){ closeList(); const lv = m[1].length + 2; html += '<h' + lv + ' class="md-h">' + m[2] + '</h' + lv + '>'; continue; }
    if((m = line.match(/^&gt;\s?(.*)$/))){ closeList(); html += '<blockquote class="md-quote">' + m[1] + '</blockquote>'; continue; }
    if(/^\s*(-{3,}|\*{3,})\s*$/.test(line)){ closeList(); html += '<hr class="md-hr">'; continue; }
    if((m = line.match(/^\s*[-*]\s+(.*)$/))){ if(inList !== 'ul'){ closeList(); html += '<ul class="md-ul">'; inList = 'ul'; } html += '<li>' + m[1] + '</li>'; continue; }
    if((m = line.match(/^\s*\d+[.)]\s+(.*)$/))){ if(inList !== 'ol'){ closeList(); html += '<ol class="md-ol">'; inList = 'ol'; } html += '<li>' + m[1] + '</li>'; continue; }
    if(line.trim() === ''){ closeList(); continue; }
    closeList(); html += '<p class="md-p">' + line + '</p>';
  }
  closeList();
  return html.replace(/\u0001(\d+)\u0001/g, (m, i) => stash[+i]);
}
function typesetMath(root){
  // 幂等优化：已成功渲染（data-typeset="1"）的公式直接跳过，避免每次 render 都全量重排 KaTeX。
  // 注意：KaTeX 渲染会清空元素内容，因此判定依据是"是否渲染过"，而非内容是否为空。
  root.querySelectorAll('.math-tex:not([data-typeset])').forEach(el => {
    const tex = decodeURIComponent(el.dataset.tex || '');
    if(window.katex){
      try {
        katex.render(tex, el, { displayMode: el.classList.contains('math-block'), throwOnError: false });
        el.setAttribute('data-typeset', '1'); // 标记已渲染，下次跳过
        return;
      } catch(e){}
    }
    el.textContent = tex; el.classList.add('math-fallback');
    el.setAttribute('data-typeset', '1');
  });
}

/* ================= 模块注册机制 =================
 * 每个模块提供一个统一注册对象：
 *   {
 *     view:   'fitness',                    // 唯一 key，同时作为数据根 key
 *     nav:    { ico:'🏋️', label:'减脂塑形', group:'重点目标' },  // 可选，用于侧边栏
 *     seed:   () => ({ ... }),              // 可选：返回默认数据子树
 *     ensure: (db, seedVal) => {},          // 可选：数据迁移/默认字段补齐
 *     render: () => html,                   // 渲染当前视图
 *     actions: { ... }, changes: { ... }, inputs: { ... }, forms: { ... }
 *   }
 * 新增模块 = 新增一个文件 + 在 index.html 加一行 script，无需改动内核。
 */
const SCHEMA_VERSION = 2; // 用于未来前向迁移
const MODULES = {};       // view -> module 注册表
const MODULE_ORDER = [];  // 注册顺序（决定侧边栏顺序）
const ACTIONS = {};
const CHANGES = {};
const INPUTS = {};
const FORMS = {};

function registerModule(def){
  if(!def || !def.view) throw new Error('module 缺少 view');
  MODULES[def.view] = def;
  MODULE_ORDER.push(def);
  Object.assign(ACTIONS, def.actions || {});
  Object.assign(CHANGES, def.changes || {});
  Object.assign(INPUTS,  def.inputs  || {});
  Object.assign(FORMS,   def.forms   || {});
}

/* ================= 数据 ================= */
const LS_KEY = 'goalTracker.v1';
function seed(){
  const s = {};
  MODULE_ORDER.forEach(m => { if(m.seed) s[m.view] = m.seed(); });
  s.meta = { created: dateStr(), updated: new Date().toISOString(), fresh: true, schemaVersion: SCHEMA_VERSION };
  return s;
}
function ensure(db){
  const s = seed();
  // 仅对「有数据」的模块（提供 seed）补齐默认数据与执行迁移；视图型模块（如 dashboard）无数据，跳过
  MODULE_ORDER.forEach(m => {
    if(!m.seed) return;
    const sv = s[m.view];
    if(!db[m.view]) db[m.view] = sv;
    if(m.ensure) m.ensure(db, sv);
  });
  db.meta = db.meta || {};
  if(!db.meta.schemaVersion) db.meta.schemaVersion = SCHEMA_VERSION;
  return db;
}
function hasRequiredModules(d){
  // 校验数据是否可导入/加载：只要 d 是对象、且包含"至少一个" seed 模块的数据即可。
  // 缺失的模块（如新增 macro 后旧备份里没有）由 ensure() 用默认 seed 自动补齐，
  // 而不是要求所有模块都存在——否则旧备份 JSON 会因缺新模块而被误判为"格式不正确"。
  if(!d || typeof d !== 'object' || Array.isArray(d)) return false;
  return MODULE_ORDER.some(m => m.seed && d[m.view] != null);
}

/* ================= 数据存储（IndexedDB 为主，localStorage 兜底） ================= */
function idbOpen(){ return new Promise((res, rej) => { const r = indexedDB.open('goalTrackerDB', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
async function idbSet(k, v){ const db = await idbOpen(); return new Promise((res, rej) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(v, k); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function idbGet(k){ const db = await idbOpen(); return new Promise((res, rej) => { const rq = db.transaction('kv').objectStore('kv').get(k); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); }); }

let DB = null;
let appReady = false;

async function loadAsync(){
  // 1. 优先从 IndexedDB 加载（主要存储）
  try {
    const d = await idbGet('data');
    if(hasRequiredModules(d)) return ensure(d);
  } catch(e){ console.warn('IndexedDB 读取失败:', e); }

  // 2. 尝试 fetch 同目录 JSON（首次使用 / 新设备）
  //    优先读应用根目录 goal-tracker-data.json，其次读 data/ 子目录（scripts 脚本实际写入的位置）
  for(const p of ['./goal-tracker-data.json', './data/goal-tracker-data.json']){
    try {
      const resp = await fetch(p + '?t=' + Date.now());
      if(resp.ok){
        const d = await resp.json();
        if(hasRequiredModules(d)){ await idbSet('data', d); return ensure(d); }
      }
    } catch(e){}
  }

  // 3. 回退到 localStorage（兼容旧数据）
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const d = JSON.parse(raw);
      if(hasRequiredModules(d)){ await idbSet('data', d); return ensure(d); }
    }
  } catch(e){}

  // 4. 使用种子数据
  return seed();
}

let saveTimer = null;
function persistLocal(){
  // localStorage 兜底快照（兼容旧数据迁移路径）；数据量大时 JSON 序列化开销高，故只在防抖批次里写
  try { localStorage.setItem(LS_KEY, JSON.stringify(DB)); } catch(e){ /* 超出配额时静默，IndexedDB 仍是主存储 */ }
}
function save(){
  if(!appReady || !DB) return;
  DB.meta = DB.meta || {};
  DB.meta.updated = new Date().toISOString();
  DB.meta.fresh = false;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    saveTimer = null;
    persistLocal();
    try { await idbSet('data', DB); } catch(e){ console.error('IndexedDB 写入失败:', e); }
  }, 300);
  refreshBackupReminder(); // 数据有改动时即时刷新侧边栏备份提醒
}
function flushSave(){
  // 页面隐藏 / 关闭前兜底落盘，防止防抖窗口内丢失最后一次改动
  if(!appReady || !DB || saveTimer === null) return;
  clearTimeout(saveTimer); saveTimer = null;
  persistLocal();
  idbSet('data', DB).catch(() => {});
}
window.addEventListener('pagehide', flushSave);
document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') flushSave(); });

/* ================= 自动导出提醒 =================
 * 数据保存在浏览器（IndexedDB/localStorage）里，不会自动写回磁盘 JSON。
 * 为方便多设备同步，提醒用户定期「导出备份」到同步盘。
 * 策略：记录"上次导出时间"，超过 EXPORT_REMIND_DAYS 天未导出且有过改动时，显示橙色提醒。
 */
const EXPORT_REMIND_DAYS = 3;
const LAST_EXPORT_KEY = 'goalTracker.lastExport';
const EXPORT_FILENAME = 'goal-tracker-data.json'; // 固定文件名，方便直接覆盖同步盘中的原 JSON
function lastExportTs(){ return parseInt(localStorage.getItem(LAST_EXPORT_KEY) || '0', 10) || 0; }
function sinceLastExport(){ // 返回距上次导出的毫秒数；从未导出返回 null
  const ts = lastExportTs();
  if(!ts) return null;
  return Date.now() - ts;
}
function timeAgo(ms){
  if(ms == null) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if(d > 0) return d + ' 天 ' + h + ' 小时前';
  if(h > 0) return h + ' 小时 ' + m + ' 分钟前';
  return Math.max(m, 1) + ' 分钟前';
}
function updateSyncUI(){
  const box = document.getElementById('sync-box');
  if(!box) return;
  const ago = sinceLastExport();
  let html = '<div class="sync-row"><span class="sync-dot on"></span><b>数据已自动保存</b></div>';
  if(ago === null){
    html += '<div class="sync-row" style="margin-top:4px"><span class="sync-dot warn"></span><b>尚未导出备份</b></div>';
    html += '<div class="side-note" style="font-size:10px;margin-top:2px">点上方「⬇ 导出备份」保存到同步盘，方便换设备导入</div>';
  } else if(ago >= EXPORT_REMIND_DAYS * 86400000){
    html += '<div class="sync-row" style="margin-top:4px"><span class="sync-dot warn"></span><b>已 ' + timeAgo(ago) + ' 未导出</b></div>';
    html += '<div class="side-note" style="font-size:10px;margin-top:2px">数据只在浏览器内，建议尽快「⬇ 导出备份」到同步盘</div>';
  } else {
    html += '<div class="side-note" style="font-size:10px;margin-top:4px">上次导出：' + timeAgo(ago) + '</div>';
  }
  box.innerHTML = html;
}
function refreshBackupReminder(){
  // 数据改动后调用：仅当需要提醒（未导出 / 超过阈值）时刷新，避免每次输入都重绘侧边栏
  const ago = sinceLastExport();
  if(ago === null || ago >= EXPORT_REMIND_DAYS * 86400000){
    updateSyncUI();
  }
}

/* ================= 全局状态 =================
 * 约定：模块的状态键使用「模块前缀.子键」命名（如 job.tag），避免键名冲突。
 */
const state = { view:'dashboard', jobQ:'', jobTag:'全部', jobTopicCat:'全部', jobTargetStatus:'全部', readBook:'全部', readTheme:'全部', readQ:'', sideStatus:'全部', valBoard:'全部', valCompanyId:null, valFinSort:'desc', macroRange:'5y', thOpen:null };

/* ================= 通用渲染片段（组件） ================= */
function ring(pct, color, size){
  size = size || 112;
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return '<div class="ring-wrap" style="width:' + size + 'px;height:' + size + 'px">' +
    '<svg viewBox="0 0 120 120" class="ring-svg">' +
    '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="var(--ring-track)" stroke-width="11"/>' +
    '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="' + color + '" stroke-width="11" stroke-linecap="round" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 60 60)"/>' +
    '</svg><div class="ring-num" style="color:' + color + '">' + Math.round(pct) + '<small>%</small></div></div>';
}
function progressBar(pct, color){
  return '<div class="progress"><i style="width:' + Math.round(pct) + '%;' + (color ? 'background:' + color : '') + '"></i></div>';
}
function header(title, sub, extra){
  return '<div class="page-head"><div><h1>' + title + '</h1><div class="muted">' + sub + '</div></div>' +
    (extra ? '<div class="head-actions">' + extra + '</div>' : '') + '</div>';
}
function checkList(items, opts){
  // opts: {toggle, del, cls}
  if(!items.length) return '<div class="empty">还没有内容，在上方添加第一条吧</div>';
  return items.map(it =>
    '<div class="item ' + (it.done ? 'done' : '') + ' ' + (opts.cls || '') + '">' +
    '<input type="checkbox" data-change="' + opts.toggle + '" data-id="' + it.id + '" ' + (it.done ? 'checked' : '') + '>' +
    '<div class="txt">' + esc(it.text) + '</div>' +
    '<button class="icon-btn" title="删除" data-action="' + opts.del + '" data-id="' + it.id + '">✕</button></div>'
  ).join('');
}
function addForm(form, ph, btnText){
  return '<form class="add-form" data-form="' + form + '"><input type="text" name="text" placeholder="' + ph + '" required autocomplete="off"><button class="btn primary sm" style="flex:none">' + (btnText || '添加') + '</button></form>';
}

/* ================= 弹窗 ================= */
const modalRoot = $('#modal-root');
function openModal(title, bodyHtml, formName, onMounted, readOnly){
  modalRoot.innerHTML = '<div class="modal-mask" data-action="modal.cancel"><div class="modal">' +
    '<div class="modal-head"><h3>' + title + '</h3><button class="icon-btn" data-action="modal.cancel">✕</button></div>' +
    '<form class="modal-body" data-form="' + (formName || '') + '">' + bodyHtml +
    '<div class="modal-foot"><button type="button" class="btn ghost" data-action="modal.cancel">' + (readOnly ? '关闭' : '取消') + '</button>' +
    (readOnly ? '' : '<button class="btn primary">保存</button>') + '</div></form></div></div>';
  // 弹窗挂载后的回调：用于初始化联动、聚焦等
  if(typeof onMounted === 'function'){ try { onMounted(modalRoot); } catch(e){ console.error('openModal onMounted:', e); } }
}
function closeModal(){ modalRoot.innerHTML = ''; }
function mdField(name, label, value, rows){
  return '<div class="field"><label>' + label + '</label>' +
    '<textarea name="' + name + '" rows="' + (rows || 8) + '">' + esc(value || '') + '</textarea>' +
    '<div class="md-preview" hidden></div>' +
    '<button type="button" class="btn ghost sm preview-toggle" data-action="md.preview">预览</button></div>';
}
function findById(arr, id){ return arr.find(x => x.id === id); }

/* ================= 内核通用行为（不属于任何模块） ================= */
Object.assign(ACTIONS, {
  // hash 路由：导航只改 hash，由 hashchange 统一驱动渲染（支持刷新保持 / 前进后退）
  'nav': el => { location.hash = '/' + el.dataset.view; },
  'theme.toggle': () => toggleTheme(),
  'modal.cancel': () => closeModal(),
  'app.reload': () => window.location.reload(),
  'md.preview': (el) => {
    const field = el.closest('.field'); const ta = field.querySelector('textarea'); const pv = field.querySelector('.md-preview');
    if(pv.hidden){ pv.innerHTML = md(ta.value); typesetMath(pv); pv.hidden = false; ta.hidden = true; el.textContent = '继续编辑'; }
    else { pv.hidden = true; ta.hidden = false; el.textContent = '预览'; }
  },
  'data.export': async () => {
    const blob = new Blob([JSON.stringify(DB, null, 2)], { type:'application/json' });
    const markExported = () => { localStorage.setItem(LAST_EXPORT_KEY, String(Date.now())); updateSyncUI(); toast('✅ 备份已导出'); };
    // 优先使用 File System Access API：弹出系统「另存为」对话框，可自行选择保存到任意文件夹
    if(window.showSaveFilePicker){
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: EXPORT_FILENAME,
          types: [{ description:'JSON 数据', accept:{ 'application/json':['.json'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        markExported();
        return;
      } catch(e){
        // 用户取消对话框（AbortError）或保存失败——取消时不记录导出时间
        if(e && e.name === 'AbortError') return;
        console.warn('另存为导出失败，改用下载方式:', e);
      }
    }
    // 回退：不支持该 API 的浏览器（Firefox/Safari）直接下载到默认下载目录
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = EXPORT_FILENAME;
    a.click(); URL.revokeObjectURL(a.href);
    markExported();
  },
  'data.import': () => $('#import-file').click(),
});

/* ================= hash 路由 =================
 * URL 形如 #/fitness。hashchange 由 导航点击 / 前进后退 / 刷新 共同触发，
 * 统一在此同步 state.view 并渲染，避免双重渲染。
 */
function viewFromHash(){
  const v = location.hash.replace(/^#\/?/, '').split(/[/?]/)[0];
  return MODULES[v] ? v : '';
}
window.addEventListener('hashchange', () => {
  // hash 为空（如从 #/fitness 后退回初始页）时回落到总览
  const v = viewFromHash() || 'dashboard';
  if(v !== state.view){ state.view = v; render(); }
});

/* ================= 事件委托 ================= */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if(!el) return;
  if(el.classList.contains('modal-mask') && e.target.closest('.modal')) return;
  const fn = ACTIONS[el.dataset.action];
  if(fn){ e.preventDefault(); fn(el, e); }
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if(!el) return;
  const fn = CHANGES[el.dataset.change];
  if(fn) fn(el);
});
document.addEventListener('input', e => {
  const el = e.target.closest('[data-input]');
  if(!el) return;
  const fn = INPUTS[el.dataset.input];
  if(fn) fn(el);
});
document.addEventListener('submit', e => {
  const form = e.target.closest('[data-form]');
  if(!form) return;
  e.preventDefault();
  const fn = FORMS[form.dataset.form];
  if(fn) fn(new FormData(form), form);
});
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeModal(); });
$('#import-file').addEventListener('change', e => {
  const file = e.target.files[0]; if(!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try{
      const d = JSON.parse(reader.result);
      if(hasRequiredModules(d)){ DB = ensure(d); save(); render(); toast('✅ 导入成功，已覆盖当前数据'); }
      else alert('文件格式不正确。\n\n请导入本应用导出的完整数据备份「goal-tracker-data.json」（含所有模块数据）。\n不要选财务/盈利预测/宏观的 CSV，那需要到对应模块里分别导入。');
    }catch(err){ alert('导入失败：' + err.message + '\n\n请选择「goal-tracker-data.json」格式的 JSON 数据文件。'); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* ================= 渲染入口 ================= */
function renderNav(){
  const renderedGroups = new Set();
  $('#nav').innerHTML = MODULE_ORDER.filter(m => m.nav).map(n => {
    let g = '';
    if(n.nav.group && !renderedGroups.has(n.nav.group)){
      renderedGroups.add(n.nav.group);
      g = '<div class="nav-group">' + n.nav.group + '</div>';
    }
    return g + '<a class="nav-item" data-action="nav" data-view="' + n.view + '"><span class="nav-ico">' + n.nav.ico + '</span>' + n.nav.label + '</a>';
  }).join('');
}
function renderKeep(inputKey){
  // 重新渲染但保持搜索框焦点
  const el = document.querySelector('[data-input="' + inputKey + '"]');
  const pos = el ? el.selectionStart : null;
  render();
  const el2 = document.querySelector('[data-input="' + inputKey + '"]');
  if(el2){ el2.focus(); el2.setSelectionRange(pos, pos); }
}
let lastRenderView = null;
function render(){
  // 视图切换检测：切换时滚动复位到顶部（同一视图内重绘才恢复滚动位置）
  const viewChanged = lastRenderView !== state.view;
  lastRenderView = state.view;
  // 记录重绘前焦点元素 + 滚动位置，重绘后尽量恢复，避免每次操作都跳回顶部
  const activeEl = document.activeElement;
  const focusedSel = (activeEl && activeEl !== document.body && activeEl.id)
    ? activeEl.id : null;
  const mainScrollTop = viewChanged ? 0 : window.scrollY;
  const main = $('#main');

  // 仅当视图真正切换时才重建整个容器；同一视图内的重绘走渲染函数
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === state.view));
  const mod = MODULES[state.view];
  if(mod && mod.render){
    try { main.innerHTML = mod.render(); }
    catch(e){ // 单个模块渲染异常不应拖垮整个应用
      console.error('渲染视图 [' + state.view + '] 失败:', e);
      main.innerHTML = '<div class="card"><div class="empty">⚠️ 视图渲染出错：' + esc(state.view) +
        '<br><span class="muted">' + esc((e && e.message) || e) + '</span>' +
        '<br><button class="btn ghost sm" style="margin-top:10px" data-action="app.reload">重新加载</button></div></div>';
    }
  }
  else { main.innerHTML = '<div class="empty">未找到视图：' + esc(state.view) + '</div>'; }

  // 标签页标题随视图切换；视图切换时加渐入动画
  document.title = (mod && mod.nav) ? mod.nav.label + ' · GoalTracker' : 'GoalTracker · 目标追踪';
  if(viewChanged){
    main.classList.remove('view-enter');
    void main.offsetWidth; // 强制 reflow，确保连续切换时动画能重新触发
    main.classList.add('view-enter');
  }

  // KaTeX 懒加载：仅当页面里确有公式且库未加载时，动态引入 CDN 脚本
  if(!window.katex && main.querySelector('.math-tex')){
    loadKatex();
  }
  typesetMath(main);

  // 恢复滚动位置；若在弹窗打开场景（modal 存在）则不干扰
  if(!modalRoot.innerHTML){
    window.scrollTo(0, mainScrollTop);
  }
  // 若之前焦点在一个带 id 的可聚焦元素上，尝试恢复焦点（如搜索框）
  if(focusedSel){
    const el = document.getElementById(focusedSel);
    if(el && el.focus) el.focus();
  }
}

/* KaTeX 动态懒加载：保证首次出现公式才去加载，避免无关页面空跑网络请求 */
let katexLoading = false;
function loadKatex(){
  if(window.katex || katexLoading) return;
  katexLoading = true;
  // CSS
  if(!document.querySelector('link[data-katex-css]')){
    const link = document.createElement('link');
    link.rel = 'stylesheet'; link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
    link.setAttribute('data-katex-css', ''); document.head.appendChild(link);
  }
  // JS
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
  s.onload = () => { katexLoading = false; typesetMath($('#main')); };
  s.onerror = () => { katexLoading = false; };
  document.head.appendChild(s);
}
async function initApp(){
  const main = document.getElementById('main');
  if(main) main.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:60vh"><div style="text-align:center;color:var(--ink2)"><div style="font-size:32px;margin-bottom:12px">⏳</div>正在加载数据...</div></div>';
  DB = await loadAsync();
  try { await idbSet('data', DB); } catch(e){}
  appReady = true;
  // 初始视图优先取 URL hash（刷新 / 分享链接保持视图），并同步主题按钮文案
  const hv = viewFromHash();
  if(hv) state.view = hv;
  applyTheme(isDarkTheme());
  renderNav();
  render();
  updateSyncUI();
}

/* 暴露给模块 / 外部 */
window.Register = { module: registerModule, modules: MODULES };
