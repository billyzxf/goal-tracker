/* 宏观模块冒烟测试：模拟浏览器全局，验证 ensure 迁移 + renderMacro + 灯逻辑 */
const path = require('path');
const mods = {};
global.window = global;
global.Register = { module: m => { mods[m.view] = m; } };
global.DB = {};
global.state = { macroRange: '5y' };
global.save = () => {};
global.render = () => {};
global.toast = () => {};
global.openModal = () => {};
global.closeModal = () => {};
global.esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
global.dateStr = () => '2026-09-17';
global.uid = () => 'u' + Math.random().toString(36).slice(2, 9);
global.header = (t, d, b) => '<div>' + t + '</div>';
global.location = { protocol: 'file:' };

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '✓ ' : '✗ ') + msg); if(!cond) failed++; };

require(path.join(__dirname, '..', 'modules', 'macro.js'));
const MOD = mods['macro'];
ok(!!MOD, 'macro 模块注册成功');

MOD.ensure(DB);
const M = DB.macro;
ok(Array.isArray(M.groups) && M.groups.length === 2, 'seed: 两张表');
const all = M.groups.reduce((a, g) => a.concat(g.indicators), []);
ok(all.length >= 50, 'seed: 指标数 ' + all.length);
const REMOVED = ['bdti', 'govbond', 'hhloan', 'prop_sale', 'indprofit', 'corecpi', 'etfflow', 'corploan'];
ok(!all.some(i => REMOVED.indexOf(i.key) >= 0), '无自动源的空指标已全部下线');
ok(all.some(i => i.key === 'cn10y') && all.some(i => i.key === 'cn1y'), 'cn10y/cn1y 保留（有自动源）');
ok(Array.isArray(M.pools) && M.pools.length === 10, 'seed: L1 + 9 个行业池 = 10');
ok(M.seedDataVersion === 7, 'seedDataVersion = 7');
ok(!M.pools.some(p => (p.items||[]).some(it => it.ref === 'ind:bdti')), '池中无 BDTI 引用');

/* 幂等：再跑一次 ensure 不重复 */
const n1 = M.groups.reduce((a, g) => a + g.indicators.length, 0);
MOD.ensure(DB);
const n2 = M.groups.reduce((a, g) => a + g.indicators.length, 0);
ok(n1 === n2, 'ensure 幂等（指标不重复）');

/* 旧用户数据（v5，含 bdti 池项）迁移 */
const DB2 = { macro: { seedDataVersion: 5, groups: [], fedwatch: [], scores: { liquidity:0, growth:0, valuation:0 },
  pools: [ { id:'p1', key:'tanker', name:'油运', icon:'🚢', items:[ { id:'x1', label:'BDTI', ref:'ind:bdti', dir:'up' }, { id:'x2', label:'VLCC TCE', ref:'ind:vlcc_tce', dir:'above', green:4, yellow:2 } ] } ] } };
MOD.ensure(DB2);
ok(DB2.macro.seedDataVersion === 7, 'v5 → v7 迁移');
ok(!DB2.macro.pools[0].items.some(it => it.ref === 'ind:bdti'), '存量 bdti 池项被清理');
ok(DB2.macro.pools[0].items.some(it => it.ref === 'ind:vlcc_tce'), '用户已有池项保留');

/* v6 → v7：已下线指标从存量库中移除，正常指标保留 */
const ind6 = k => ({ id: 'i_' + k, key: k, name: k, unit: '', freq: '月度', points: [] });
const DB3 = { macro: { seedDataVersion: 6, fedwatch: [],
  groups: [ { id:'g1', key:'domestic', name:'国内宏观经济', indicators:
    [ ind6('govbond'), ind6('etfflow'), ind6('cn10y'), ind6('m1') ] } ],
  pools: [], scores: { liquidity:0, growth:0, valuation:0 } } };
MOD.ensure(DB3);
const keys3 = DB3.macro.groups[0].indicators.map(i => i.key);
ok(keys3.indexOf('govbond') < 0 && keys3.indexOf('etfflow') < 0, 'v7: 存量空指标被移除');
ok(keys3.indexOf('cn10y') >= 0 && keys3.indexOf('m1') >= 0, 'v7: 正常指标保留');

/* 渲染 */
const html = MOD.render();
ok(html.includes('L1 · 宏观温度计'), '渲染: L1 温度计');
ok(html.includes('L2 · 行业温度计'), '渲染: L2 行业温度计');
ok(html.includes('近10期'), '渲染: 周期分位说明');
ok(html.includes('导入全部'), 'file:// 同步提示条出现');
ok(html.includes('DRAM'), '渲染: DRAM 指标（行业高频层）');

/* 灯逻辑：us10y seed 2026-08 = 4.18 → below green4.0/yellow4.5 → 黄 */
const u10 = all.find(i => i.key === 'us10y');
const poolL1 = M.pools.find(p => p.fixed);
const it10y = poolL1.items.find(it => it.ref === 'ind:us10y');
const rows = html.match(/🟡/g) || [];
ok(rows.length > 0, '灯判定输出红黄绿灯（含 🟡）');
ok(!!it10y, 'L1 含美债10Y项');

console.log(failed ? ('\n== ' + failed + ' FAILED ==') : '\n== ALL SMOKE TESTS PASSED ==');
process.exit(failed ? 1 : 0);
