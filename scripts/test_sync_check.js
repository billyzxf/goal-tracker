/* ================= 内核 · 同步盘比对回归测试（core.js） =================
 * 用 vm 造一个最小沙箱加载 core.js，断言「同步盘有更新」的判定逻辑：
 *   条目统计 / 时间戳解析 / HEAD 预筛（省下载）/ meta.updated 才是判定依据 /
 *   30s 容差 / 节流 / 按版本忽略 / 手动比对换候选 / 加载替换与取消 / 异常不崩
 *
 * 运行：node scripts/test_sync_check.js      （退出码 0 = 全部通过）
 * 注意：这些用例只覆盖「比对与提示」，不含落盘（IndexedDB 在沙箱里是缺失的，写失败被静默）。
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const out = [];
const log = s => { out.push(s); };
let pass = 0, fail = 0;
function ok(cond, name, extra){ if(cond){ pass++; log('  PASS ' + name); } else { fail++; log('  FAIL ' + name + (extra !== undefined ? ' :: ' + extra : '')); } }

/* ---------- 假 DOM：core.js 顶层会取 #modal-root / #nav / #main / #sync-box 等 ---------- */
function fakeEl(){
  const el = {
    style: {}, dataset: {}, hidden: false, innerHTML: '', value: '', textContent: '', title: '',
    classList: { add(){}, remove(){}, toggle(){}, contains: () => false },
    addEventListener(){}, removeEventListener(){}, appendChild(){}, remove(){},
    setAttribute(){}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null,
    focus(){}, setSelectionRange(){}, offsetWidth: 0,
  };
  return el;
}
const elStore = {};                                   // id → 同一实例（便于断言 bar.innerHTML）
const byId = id => (elStore[id] || (elStore[id] = fakeEl()));
const bySel = sel => (elStore['sel:' + sel] || (elStore['sel:' + sel] = fakeEl()));

/* ---------- 假 localStorage ---------- */
const ls = new Map();
const localStorage = {
  getItem: k => (ls.has(k) ? ls.get(k) : null),
  setItem: (k, v) => ls.set(k, String(v)),
  removeItem: k => ls.delete(k),
  clear: () => ls.clear(),
};

/* ---------- 假 fetch：按路径路由，区分 HEAD / GET，记录调用次数 ---------- */
let routes = {};     // path → { lm, size, body, throw, status }
let calls = { head: [], get: [] };
function headersOf(obj){
  return { get: k => { const lk = String(k).toLowerCase(); return Object.prototype.hasOwnProperty.call(obj, lk) ? obj[lk] : null; } };
}
async function fakeFetch(url, init){
  const p = String(url).split('?')[0];
  const r = routes[p];
  if(!r) return { ok: false, status: 404, headers: headersOf({}), json: async () => { throw new Error('404'); } };
  if(r.throw) throw new Error('network down');
  if(init && init.method === 'HEAD'){
    calls.head.push(p);
    const h = {};
    if(r.lm) h['last-modified'] = new Date(r.lm).toUTCString();
    if(r.size != null) h['content-length'] = String(r.size);
    return { ok: true, status: 200, headers: headersOf(h) };
  }
  calls.get.push(p);
  return { ok: true, status: 200, headers: headersOf({}), json: async () => r.body };
}

let toasts = [];
const sandbox = {
  // 沙箱没有 IndexedDB，core.js 落盘会失败并 console.error —— 这是预期路径（写入被 try 包住），
  // 静音掉以免污染测试输出；落盘是否成功不影响本文件测的「比对与提示」逻辑。
  console: { log: console.log, warn(){}, error(){}, info: console.info },
  setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, Number, String, Array, Object, Boolean, Set, Map, Promise, Error, RegExp,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  fetch: fakeFetch, localStorage, scrollTo(){},
  addEventListener(){}, removeEventListener(){}, matchMedia: () => ({ matches: false }),
  confirm: () => true, alert: m => log('  [alert] ' + m),
  location: { hash: '' }, navigator: { onLine: true },
  document: {
    title: '',
    documentElement: { classList: { add(){}, remove(){}, toggle(){}, contains: () => false } },
    body: { appendChild(){} },
    head: { appendChild(){} },
    querySelector: bySel, querySelectorAll: () => [], getElementById: byId,
    createElement: () => fakeEl(), addEventListener(){},
  },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'core.js'), 'utf8'), sandbox, { filename: 'core.js' });

/* ---------- 被测函数的取值方式 ----------
 * core.js 里 DB / appReady / state 是顶层 let/const → 属于 context 的词法作用域，
 * 不能靠 sandbox.xxx 读写；函数声明（function xxx）则挂在全局对象上，可直接取用。
 */
const run = code => vm.runInContext(code, sandbox);
const setDB = db => run('DB = ' + JSON.stringify(db) + '; appReady = true; state.view = "demo";');
const reset = () => { routes = {}; calls = { head: [], get: [] }; toasts = []; ls.clear(); run('remoteCandidate = null; renderRemoteBar();'); };

const F = {
  dataItemCount: sandbox.dataItemCount,
  remoteTs: sandbox.remoteTs,
  fmtRemoteTime: sandbox.fmtRemoteTime,
  checkRemoteData: sandbox.checkRemoteData,
  renderRemoteBar: sandbox.renderRemoteBar,
};

/* ---------- 注册一个假模块：hasRequiredModules 需要至少一个带 seed 的模块 ---------- */
sandbox.Register.module({ view: 'demo', seed: () => ({ items: [] }), render: () => '<div>demo</div>' });
sandbox.Register.module({ view: 'list', seed: () => ({ rows: [] }), render: () => '<div>list</div>' });

log('== GoalTracker 内核 · 同步盘比对 ==');
ok(typeof F.checkRemoteData === 'function' && typeof F.remoteTs === 'function', 'core.js 加载成功，被测函数可用');
sandbox.toast = m => toasts.push(m);           // 覆盖成可观测的假 toast

/* ================= 1. 纯函数 ================= */
const T_REMOTE = Date.parse('2026-09-01T01:49:48.985Z');
const T_LOCAL  = Date.parse('2026-08-30T00:00:00.000Z');

ok(F.remoteTs({ meta: { updated: '2026-09-01T01:49:48.985Z' } }) === T_REMOTE, 'remoteTs 解析 meta.updated');
ok(F.remoteTs({ meta: {} }) === 0, 'remoteTs 缺 updated → 0');
ok(F.remoteTs({ meta: { updated: '不是时间' } }) === 0, 'remoteTs 非法时间 → 0');
ok(F.remoteTs(null) === 0, 'remoteTs(null) → 0');
ok(F.fmtRemoteTime(0) === '无时间戳', 'fmtRemoteTime(0) → 无时间戳');
ok(/^2026-09-01 09:49$/.test(F.fmtRemoteTime(T_REMOTE)), 'fmtRemoteTime 本地时区格式', F.fmtRemoteTime(T_REMOTE));

ok(F.dataItemCount({ demo: { items: [1, 2, 3], other: { a: [1] }, note: 'x' }, list: { rows: [1, 2] } }) === 5,
  'dataItemCount 只数模块下的一层数组（3+2=5，嵌套数组与非数组不计）', F.dataItemCount({ demo: { items: [1, 2, 3], other: { a: [1] }, note: 'x' } }));
ok(F.dataItemCount({}) === 0 && F.dataItemCount(null) === 0, 'dataItemCount 空数据 → 0');

/* ================= 2. 自动比对：远端确实更新 ================= */
async function main(){
  reset();
  setDB({ demo: { items: [1, 2, 3] }, list: { rows: [1] }, meta: { updated: '2026-08-30T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-01T02:00:00Z'), size: 9500000,
    body: { demo: { items: [1, 2, 3, 4] }, list: { rows: [1, 2] }, meta: { updated: '2026-09-01T01:49:48.985Z' } } };
  await F.checkRemoteData(false);
  const c1 = run('remoteCandidate');
  ok(!!c1, '远端更新 → 生成候选');
  ok(c1 && c1.updated === T_REMOTE, '候选取远端 meta.updated', c1 && c1.updated);
  ok(c1 && c1.path === './goal-tracker-data.json', '候选路径 = 根目录 JSON', c1 && c1.path);
  ok(c1 && c1.count === 6 && c1.localCount === 4, '候选条目数 6 / 本机 4', c1 && [c1.count, c1.localCount]);
  ok(byId('remote-bar').hidden === false, '提示条已显示');
  ok(/同步盘有更新的数据/.test(byId('remote-bar').innerHTML), '提示条含标题');
  ok(/多 2 条/.test(byId('remote-bar').innerHTML), '提示条标出条数差异');
  ok(/last-modified/i.test(JSON.stringify(calls.head)) === false && calls.head.length === 1, 'HEAD 只探一个候选', calls.head.length);

  /* ================= 3. 节流：20 分钟内不重复自动比对 ================= */
  calls = { head: [], get: [] };
  run('remoteCandidate = null; renderRemoteBar();');
  ls.set('goalTracker.remoteCheckedAt', String(Date.now()));
  await F.checkRemoteData(false);
  ok(calls.head.length === 0 && calls.get.length === 0, '节流期内自动比对不发请求', JSON.stringify(calls));
  ok(run('remoteCandidate') === null, '节流期内不生成候选');

  /* ================= 4. HEAD 预筛：文件时间不比本机新 → 不下载 ================= */
  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-09-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-08-31T00:00:00Z'), size: 900,
    body: { demo: { items: [1, 2, 3, 4, 5] }, meta: { updated: '2026-09-05T00:00:00Z' } } };
  await F.checkRemoteData(false);
  ok(calls.get.length === 0, 'HEAD 判定不必下载 → GET 次数 0', JSON.stringify(calls));
  ok(run('remoteCandidate') === null, 'HEAD 预筛后无候选');

  /* ================= 5. 关键：文件时间晚 ≠ 数据更新（导出时间晚于落盘时间） ================= */
  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-09-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-10T00:00:00Z'), size: 900,
    body: { demo: { items: [1, 2, 3] }, meta: { updated: '2026-09-01T00:00:00.000Z' } } };  // 内容其实一样旧
  await F.checkRemoteData(false);
  ok(calls.get.length === 1, 'HEAD 认为可能更新 → 下载一次确认', JSON.stringify(calls.get));
  ok(run('remoteCandidate') === null, '内容 meta.updated 未变 → 不提示（避免"刚导出就被提醒"）');

  /* ================= 6. 30s 容差边界 ================= */
  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-09-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-01T00:00:10Z'), size: 900,
    body: { demo: { items: [1, 2] }, meta: { updated: '2026-09-01T00:00:10.000Z' } } };  // 只新 10 秒
  await F.checkRemoteData(false);
  ok(run('remoteCandidate') === null, '远端仅新 10 秒（<30s）→ 不提示');

  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-09-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-01T01:00:00Z'), size: 900,
    body: { demo: { items: [1, 2] }, meta: { updated: '2026-09-01T01:00:00.000Z' } } };  // 新 1 小时
  await F.checkRemoteData(false);
  ok(!!run('remoteCandidate'), '远端新 1 小时（>30s）→ 提示');

  /* ================= 7. 按版本忽略 ================= */
  run('ACTIONS["data.remoteDismiss"]()');
  ok(run('remoteCandidate') === null && byId('remote-bar').hidden === true, '忽略后提示条收起');
  ok(ls.get('goalTracker.remoteDismissed') === String(Date.parse('2026-09-01T01:00:00Z')), '记录了被忽略的远端版本', ls.get('goalTracker.remoteDismissed'));
  // 只清节流与候选，保留「已忽略」记录与路由
  calls = { head: [], get: [] };
  ls.delete('goalTracker.remoteCheckedAt');
  run('remoteCandidate = null; renderRemoteBar();');
  setDB({ demo: { items: [1] }, meta: { updated: '2026-09-01T00:00:00.000Z' } });
  await F.checkRemoteData(false);
  ok(run('remoteCandidate') === null, '同一版本不再自动打扰');
  await F.checkRemoteData(true);
  ok(!!run('remoteCandidate'), '手动检查无视忽略记录，仍可加载', run('remoteCandidate && remoteCandidate.path'));

  /* ================= 8. 多候选：手动比对挑出真正更新的那个 ================= */
  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-09-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-02T00:00:00Z'), size: 900,
    body: { demo: { items: [1, 2] }, meta: { updated: '2026-09-02T00:00:00Z' } } };
  // data/ 下的文件更新（脚本产出的那份）
  routes['./data/goal-tracker-data.json'] = { lm: Date.parse('2026-09-05T00:00:00Z'), size: 800,
    body: { demo: { items: [1, 2, 3] }, meta: { updated: '2026-09-05T00:00:00Z' } } };
  await F.checkRemoteData(true);
  const c8 = run('remoteCandidate');
  ok(c8 && c8.path === './data/goal-tracker-data.json', '手动比对选中更新的那份（data/）', c8 && c8.path);
  ok(calls.get.length === 1, '找到更新的候选即停止下载', JSON.stringify(calls.get));

  /* ================= 9. 加载：取消不覆盖 / 确认才覆盖 ================= */
  reset();
  setDB({ demo: { items: [1, 2, 3, 4, 5, 6, 7, 8, 9] }, meta: { updated: '2026-08-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-10T00:00:00Z'), size: 900,
    body: { demo: { items: [1, 2] }, list: { rows: [7] }, meta: { updated: '2026-09-10T00:00:00Z' } } };
  await F.checkRemoteData(true);
  ok(!!run('remoteCandidate'), '手动检查发现更新');
  sandbox.confirm = () => false;
  await run('ACTIONS["data.remoteLoad"]()');
  ok(run('DB.demo.items.length') === 9, '取消加载 → 本机数据不动', run('DB.demo.items.length'));
  ok(!!run('remoteCandidate'), '取消后提示条仍在（可稍后再决定）');

  sandbox.confirm = () => true;
  await run('ACTIONS["data.remoteLoad"]()');
  ok(run('DB.demo.items.length') === 2, '确认加载 → 本机数据被替换', run('DB.demo.items.length'));
  ok(run('DB.list.rows.length') === 1, '加载后缺失模块由 ensure 补齐', run('DB.list.rows.length'));
  ok(run('DB.meta.updated') === '2026-09-10T00:00:00Z' || run('remoteTs(DB)') === Date.parse('2026-09-10T00:00:00Z'), '加载后 meta.updated 来自同步盘', run('DB.meta.updated'));
  ok(run('remoteCandidate') === null && byId('remote-bar').hidden === true, '加载后提示条收起');
  ok(!!ls.get('goalTracker.lastExport'), '加载后重置导出提醒时间（视为已与磁盘对齐）');
  ok(toasts.some(m => /已加载同步盘数据/.test(m)), '给出加载成功提示', JSON.stringify(toasts));

  /* ================= 10. 异常：404 / 网络失败 / 无时间戳 / 本机无数据 ================= */
  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-08-01T00:00:00.000Z' } });
  toasts = [];
  await F.checkRemoteData(true);                       // 两个路径都不存在
  ok(run('remoteCandidate') === null, '找不到文件 → 无候选（不崩）');
  ok(toasts.some(m => /没有可用的 goal-tracker-data\.json/.test(m)), '手动检查给出「不可用」提示', JSON.stringify(toasts));

  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-08-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: 0, size: 0, throw: true };   // file:// 或断网
  await F.checkRemoteData(true);
  ok(run('remoteCandidate') === null, 'fetch 抛错 → 无候选（file:// 静默）');

  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-08-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-10T00:00:00Z'), size: 900,
    body: { 无关字段: 1 } };                                         // 缺模块 → 格式不符
  await F.checkRemoteData(true);
  ok(run('remoteCandidate') === null, 'JSON 格式不符 → 无候选');

  reset();
  setDB({ demo: { items: [1] }, meta: { updated: '2026-08-01T00:00:00.000Z' } });
  routes['./goal-tracker-data.json'] = { lm: 0, size: 0, body: { demo: { items: [1, 2] } } };  // 无 meta.updated
  await F.checkRemoteData(false);
  ok(run('remoteCandidate') === null, '远端无 meta.updated → 不提示（没有可信依据）');

  reset();
  setDB({ demo: { items: [1] }, meta: {} });                        // 本机无 updated
  routes['./goal-tracker-data.json'] = { lm: Date.parse('2026-09-10T00:00:00Z'), size: 900,
    body: { demo: { items: [1, 2] }, meta: { updated: '2026-09-10T00:00:00Z' } } };
  await F.checkRemoteData(false);
  ok(!!run('remoteCandidate'), '本机无时间戳 + 远端有 → 可提示');

  /* ================= 11. 渲染健壮性 ================= */
  const bar = byId('remote-bar');
  run('remoteCandidate = { path: "./x.json", updated: 0, count: 0, localCount: 0, localUpdated: 0 }; renderRemoteBar();');
  ok(/无时间戳/.test(bar.innerHTML) && /条数相同/.test(bar.innerHTML), '时间戳缺失时文案兜底', bar.innerHTML.slice(0, 120));
  run('remoteCandidate = null; renderRemoteBar();');
  ok(bar.hidden === true && bar.innerHTML === '', '无候选时清空并隐藏');
  run('remoteCandidate = { path: "./x.json", updated: Date.parse("2026-09-10T00:00:00Z"), count: 3, localCount: 2, localUpdated: 0 }; renderRemoteBar();');
  ok(bar.hidden === false, '有候选时显示');
  ok(/data-action="data\.remoteLoad"/.test(bar.innerHTML) && /data-action="data\.remoteDismiss"/.test(bar.innerHTML) && /data-action="data\.remoteBackup"/.test(bar.innerHTML),
    '三个按钮事件齐备（加载 / 忽略 / 先备份）');
  ok(/覆盖本机数据/.test(bar.innerHTML), '提示条明确说明会覆盖本机');
  ok(/多 1 条/.test(bar.innerHTML), '条数差异文案正确');

  /* ---------- 输出 ---------- */
  log('');
  log('passed ' + pass + ' / failed ' + fail);
  const text = out.join('\n');
  // 日志落到系统临时目录（Windows 控制台对 UTF-8 中文会乱码，需要时读这个文件）
  try { fs.writeFileSync(path.join(require('os').tmpdir(), 'goal-tracker-sync-check.log'), text, 'utf8'); } catch(e){}
  process.stdout.write(text + '\n');
  process.exit(fail ? 1 : 0);
}
main().catch(e => { log('发生异常: ' + (e && e.stack || e)); log('passed ' + pass + ' / failed ' + fail); process.stdout.write(out.join('\n') + '\n'); process.exit(1); });
