#!/usr/bin/env node
global.state = { macroRange:'all' };
global.uid = () => 'id' + Math.random().toString(36).slice(2,9);
global.dateStr = () => '2026-08-29';
global.esc = s => String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
global.md = s => String(s||'');
global.findById = (a,i) => (a||[]).find(x => x.id === i);
global.header = (t,s,b) => '<header>'+t+'</header>';
global.openModal = (title, body, form) => { global.__modal = { title, body, form }; };
global.closeModal = () => {};
global.confirm = () => true;
global.render = () => {};
global.save = () => { global.__saved = true; };
global.alert = () => {};
global.toast = () => {};
global.window = global;
let mod = null;
global.Register = { module: d => { mod = d; } };
require('./modules/macro.js');

// seed
const s = mod.seed();
const all = s.groups.reduce((a,g)=>a.concat(g.indicators),[]);
console.log('seed 指标数:', all.length, '（期望 42）');
console.log('三期新指标齐全:', ['corploan','hhloan','govbond','corecpi','indprofit','fixedasset','northbound','csi500pe','allape'].every(k => all.some(i=>i.key===k)));

// 全新加载
global.DB = { macro: mod.seed() };
mod.ensure(DB, null);

// 给部分指标加数据点，测试打分/轮动
const setPts = (key, arr) => { const i = DB.macro.groups.flatMap(g=>g.indicators).find(x=>x.key===key); if(i) i.points = arr.map(p=>({date:p[0],value:p[1]})); };
setPts('us10y', [['2026-07',4.12],['2026-08',4.18]]);      // delta>0, down_good → 坏
setPts('pmi',   [['2026-06',49.5],['2026-07',50.1]]);      // delta>0, up_good → 好
setPts('ppi',   [['2026-06',-1.0],['2026-07',3.5]]);       // 好
setPts('tsf',   [['2026-06',8.4],['2026-07',8.6]]);        // 好
setPts('m1',    [['2026-06',4.2],['2026-07',4.6]]);        // 好
setPts('m2',    [['2026-06',7.5],['2026-07',7.6]]);        // 剪刀差数据
setPts('usdcny',[['2026-04',7.02],['2026-05',7.10],['2026-06',7.19],['2026-07',7.29],['2026-08',7.33]]); // 快速贬值
setPts('turnover',[['2026-06-01',2.0],['2026-06-02',2.1],['2026-06-03',2.05],['2026-07-01',1.3],['2026-07-02',1.2],['2026-07-03',1.25]]); // 缩量

// 三期：分位数 + 股债收益差历史（hs300pe 30 期 + cn10y 同月对齐）
const pePts = [], yPts = [];
for(let k=0;k<30;k++){
  const y = 2024 + Math.floor(k/12), m = k%12+1;
  const d = y + '-' + String(m).padStart(2,'0');
  pePts.push([d, 10 + k*0.1]);          // 递增 → 最新值 = 100% 分位
  yPts.push([d + '-28', 2.0]);
}
setPts('hs300pe', pePts);
setPts('cn10y', yPts);

// 渲染
const html = mod.render();
console.log('\n温度计渲染:', html.includes('流动性温度计'), '· Regime:', html.includes('A股 Regime'));
console.log('三期 · 宏观Regime条带:', html.includes('宏观 Regime') && html.includes('宽松复苏'));
console.log('三期 · 分位徽章:', html.includes('% 分位'));
console.log('三期 · 股债收益差历史曲线:', html.includes('data-mid="__spread"'));
console.log('三期 · M1-M2 剪刀差:', html.includes('M1−M2 剪刀差'));
console.log('三期 · 参评明细:', html.includes('参评明细'));

// Growth 应为 100%（pmi/ppi/tsf/m1 全好）
console.log('Growth 温度计=100:', /经济温度计.*?th-val" style="color:[^"]+">100</.test(html.replace(/\n/g,'')));
// 轮动高亮 / 速度预警
console.log('轮动表渲染:', html.includes('宏观 → 行业轮动映射'), '· PPI 行高亮:', html.includes('rot-on'));
console.log('汇率快速贬值预警:', html.includes('快速贬值'), '· 成交额缩量预警:', html.includes('量能不健康'));

// 三期：FedWatch 边际变化（同会议去重 + prev 快照）
const fd1 = { get: k => ({meeting:'2026-09',cut:'20',hold:'50',hike:'30',id:''}[k]) };
mod.forms['macro.saveFw'](fd1);   // 与 seed 相同值 → 应去重更新，不新增
const fwCount1 = DB.macro.fedwatch.length;
const fd2 = { get: k => ({meeting:'2026-09',cut:'40',hold:'40',hike:'20',id:''}[k]) };
mod.forms['macro.saveFw'](fd2);   // 概率变化 → 记录 prev
const fwRec = DB.macro.fedwatch.find(x => x.meeting === '2026-09');
console.log('\nFedWatch 同会议去重（仍 3 条）:', fwCount1 === 3 && DB.macro.fedwatch.length === 3);
console.log('FedWatch prev 快照:', !!fwRec.prev && fwRec.prev.cut === 20 && fwRec.cut === 40);
const html2 = mod.render();
console.log('FedWatch 边际变化箭头:', html2.includes('fw-delta'));

// 快捷录入弹窗（toast 反馈）
global.__modal = null;
mod.actions['macro.quickDaily']();
console.log('\n快捷录入弹窗:', global.__modal ? global.__modal.title : '未打开', '· 表单:', global.__modal && global.__modal.form);
const dailyIds = DB.macro.groups.flatMap(g=>g.indicators).filter(i=>i.freq==='日度');
const fd = { get: k => { if(k==='ind_'+dailyIds[0].id) return '4.25'; return ''; } };
mod.forms['macro.saveQuickDaily'](fd);
const i0 = dailyIds[0];
console.log('快捷录入写入:', i0.points.some(p=>p.date==='2026-08-29' && p.value===4.25), '· 指标:', i0.key);

// 迁移：旧 v3 数据升级到 v4（补三期新指标）
const old = { macro: mod.seed() };
old.macro.groups.forEach(g => { g.indicators = g.indicators.filter(i => !['corploan','hhloan','govbond','corecpi','indprofit','fixedasset','northbound','csi500pe','allape'].includes(i.key)); });
old.macro.seedDataVersion = 3;
mod.ensure(old, null);
const after = old.macro.groups.flatMap(g=>g.indicators);
console.log('\nv3→v4 迁移后指标数:', after.length, '（期望 42）');
console.log('✓ 三期验证完成');
