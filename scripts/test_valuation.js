/* ================= 投资追踪回归测试（val-core + valuation + swing） =================
 * 用 vm 造一个最小沙箱加载 val-core.js / valuation.js / swing.js，直接断言纯逻辑与渲染输出，
 * 不需要浏览器。改完估值或待击球模块后跑一次，能挡住"哑巴 bug"（渲染互调、空数据崩、口径写错）。
 *
 * 运行：node scripts/test_valuation.js      （退出码 0 = 全部通过）
 * 覆盖：三级归档 / 估值时效 / 今日要处理 / 决策要点 / 归档筛选 / SOTP 分部估值 /
 *       横向排序与排行榜 / 对比表导出 / 组合仓位（目标达成度 + 单票超限）/ 空数据不崩
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const out = [];
const log = s => { out.push(s); };
let pass = 0, fail = 0;
function ok(cond, name, extra){ if(cond){ pass++; log('  PASS ' + name); } else { fail++; log('  FAIL ' + name + (extra ? ' :: ' + extra : '')); } }

/* ---------- 沙箱：只实现被测模块真正用到的全局 ---------- */
let uidN = 0;
const sandbox = {
  console: console, setTimeout, clearTimeout, setInterval, clearInterval,
  Math, Date, JSON, Number, String, Array, Object, Boolean, Set, Map, Promise, Error, RegExp,
  isNaN, parseInt, parseFloat, encodeURIComponent, decodeURIComponent,
  confirm: () => true, alert: m => log('  [alert] ' + m),
  fetch: () => new Promise(() => {}),           // 永不 resolve：报告索引保持"加载中"，结果可预期
  location: { hash: '' },
  document: {
    querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    createElement: () => ({ style: {}, dataset: {}, classList: { add(){}, toggle(){} }, appendChild(){}, setAttribute(){} }),
    head: { appendChild(){} }, addEventListener(){},
  },
  modalRoot: { innerHTML: '', querySelector: () => null },
  localStorage: { getItem: () => null, setItem(){} },
  uid: () => 'u' + (++uidN),
  dateStr: (d) => { d = d || new Date(); const p2 = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p2(d.getMonth()+1) + '-' + p2(d.getDate()); },
  esc: s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  md: s => '<div class="md">' + String(s || '') + '</div>',
  header: (t, s, e) => '<div class="page-head"><h1>' + t + '</h1><div class="muted">' + s + '</div>' + (e || '') + '</div>',
  kwMatch: () => true,
  findById: (arr, id) => (arr || []).find(x => x.id === id),
  toast: () => {}, openModal: () => {}, closeModal: () => {}, render: () => {}, renderKeep: () => {},
  typesetMath: () => {}, loadKatex: () => {}, save: () => {}, scrollTo: () => {},
  Register: { module: def => { sandbox.__mods[def.view] = def; } },
};
sandbox.__mods = {};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules/val-core.js'), 'utf8'), sandbox, { filename: 'val-core.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules/valuation.js'), 'utf8'), sandbox, { filename: 'valuation.js' });
vm.runInContext(fs.readFileSync(path.join(ROOT, 'modules/swing.js'), 'utf8'), sandbox, { filename: 'swing.js' });

const V = sandbox.ValHelpers;
const mod = sandbox.__mods.valuation;
const SW = sandbox.__mods.swing;
ok(!!mod && typeof mod.render === 'function', '模块注册成功');
ok(!!V && typeof V.valFreshness === 'function', 'ValHelpers 导出 valFreshness');

/* ---------- 造数据：A=合规咖啡罐且已到买点 / B=估值过期 / C=从未估值 ---------- */
const mk = (o) => Object.assign({ id: o.id, name: o.name, ticker: o.ticker, market: 'A股', board: '主板', financials: [], investments: [], research: '', invalidConds: [], totalShares: 0 }, o);
const A = mk({ id: 'c-a', name: '甲公司', ticker: '600001.SH', tier: '咖啡罐', currentPrice: 90,
  invalidConds: ['Q3 经营现金流未回补', '在手订单增速转负'],
  valuations: [{ id: 'v-a1', date: '2026-09-01', method: 'PE', params: { targetMultiple: 30, baseValue: 4 }, estimatedValue: 120, actualPrice: 90, scenario: '中性', year: '2026E' }] });
const B = mk({ id: 'c-b', name: '乙公司', ticker: '600002.SH', currentPrice: 50,
  valuations: [{ id: 'v-b1', date: '2026-01-01', method: 'PE', params: {}, estimatedValue: 40, actualPrice: 50, scenario: '', year: '' }] });
const C = mk({ id: 'c-c', name: '丙公司', ticker: '600003.SH', currentPrice: 10 });

sandbox.DB = { valuation: { companies: [A, B, C], groups: [], customMetrics: [], hiddenSeeds: [], seedDataVersion: 0 }, swing: { items: [] } };
sandbox.state = { view: 'valuation', valCompanyId: null, valFinSort: 'desc', valKw: '' };

mod.ensure(sandbox.DB, null);
ok(A.tier === '咖啡罐' && B.tier === '' && C.tier === '', 'ensure 补齐 tier 字段', JSON.stringify([A.tier, B.tier, C.tier]));

/* ---------- 估值时效 ---------- */
ok(V.valFreshness(A).code === 'ok', 'A 时效 = ok', JSON.stringify(V.valFreshness(A)));
ok(V.valFreshness(B).code === 'stale', 'B 时效 = stale（>90 天）', JSON.stringify(V.valFreshness(B)));
ok(V.valFreshness(C).code === 'empty', 'C 时效 = empty（无估值）', JSON.stringify(V.valFreshness(C)));
ok(V.latestValDate(A) === '2026-09-01', 'latestValDate(A)', V.latestValDate(A));
ok(typeof V.daysUntil('2026-09-20') === 'number', 'daysUntil 可用', String(V.daysUntil('2026-09-20')));

/* ---------- 触发线（Step4 口径） ---------- */
const lines = V.valTriggerLines(V.valMatrixSummary(A).mean);
ok(lines && Math.abs(lines.find(l => l.key === 'first').value - 102) < 0.01, '第一买点 = 中性均值 × 0.85 = 102',
  lines ? String(lines.find(l => l.key === 'first').value) : 'null');

/* ---------- 列表页 ---------- */
sandbox.state.valCompanyId = null;
const listHtml = mod.render();
ok(listHtml.indexOf('今日要处理') >= 0, '列表页含「今日要处理」');
ok(listHtml.indexOf('已触及买点') >= 0 && listHtml.indexOf('甲公司') >= 0, '「已触及买点」列出甲公司');
ok(listHtml.indexOf('估值待重估') >= 0 && listHtml.indexOf('乙公司') >= 0 && listHtml.indexOf('丙公司') >= 0, '「估值待重估」列出乙/丙');
ok(listHtml.indexOf('尚未分档') >= 0, '「尚未分档」分组出现');
ok(listHtml.indexOf('三级归档') >= 0, '汇总卡含「三级归档」');
ok(listHtml.indexOf('咖啡罐（1）') >= 0, '归档 chip 计数正确');
ok(listHtml.indexOf('未归档（2）') >= 0, '未归档 chip 计数正确');

/* ---------- 归档筛选 ---------- */
sandbox.state.valTiers = ['咖啡罐'];
const filtered = mod.render();
ok((filtered.match(/company-card/g) || []).length === 1, '归档筛选后只剩 1 张卡片', String((filtered.match(/company-card/g) || []).length));
ok(filtered.indexOf('该市场下暂无公司') < 0, '筛选后有结果不显示空态');
sandbox.state.valTiers = ['__none__'];
ok((mod.render().match(/company-card/g) || []).length === 2, '未归档筛选 = 2 张卡片');
sandbox.state.valTiers = [];

/* ---------- 详情页 ---------- */
sandbox.state.valCompanyId = 'c-a';
const detail = mod.render();
ok(detail.indexOf('决策要点') >= 0, '详情页含「⚡ 决策要点」');
ok(detail.indexOf('失效条件') >= 0 && detail.indexOf('Q3 经营现金流未回补') >= 0, '失效条件置顶并列出内容');
ok(detail.indexOf('is-broke') >= 0, '现价跌破第一买点 → 失效条件高亮');
ok(detail.indexOf('估值报告') >= 0, '详情页含「📄 估值报告」区');
ok(detail.indexOf('触发线') >= 0 && detail.indexOf('写入待击球') >= 0, '触发线面板仍在');
ok((detail.match(/data-input="val.invalidConds"/g) || []).length === 1, '失效条件文本域全局唯一');

sandbox.state.valCompanyId = 'c-b';
ok(mod.render().indexOf('is-broke') < 0, 'B（无中性情景）不触发 is-broke');

/* ---------- 空数据不崩 ---------- */
sandbox.DB.valuation.companies = [];
sandbox.state.valCompanyId = null;
sandbox.state.valTiers = [];
const emptyHtml = mod.render();
ok(typeof emptyHtml === 'string' && emptyHtml.length > 0, '空公司列表渲染不崩');

/* ---------- P2-1：SOTP 分部估值 ---------- */
ok(V.valMethodInfo('SOTP').label === 'SOTP分部估值', 'SOTP 方法已注册', V.valMethodInfo('SOTP').label);
const sotp = sandbox.ValCore.calcValuation('SOTP', {
  seg1np: 20, seg1pe: 15,      // 300
  seg2np: 10, seg2pe: 25,      // 250
  listedHold: 80, netCash: 30, netDebt: 10, shares: 10,
});                            // (300+250+80+30-10)/10 = 65
ok(Math.abs(sotp - 65) < 1e-6, 'SOTP =（Σ 分部净利×PE + 上市股权 + 净现金 − 净债）÷ 股本 = 65', String(sotp));
const sotpEmpty = sandbox.ValCore.calcValuation('SOTP', { shares: 10 });
ok(sotpEmpty === 0, 'SOTP 空参数不崩，返回 0', String(sotpEmpty));
ok(V.valMethodInfo('SOTP').inlineKeys.length === 8, 'SOTP 行内只展示 8 个分部参数（调整项折叠进 ⚙）');
// 详情页「估值记录」表里 SOTP 参数行内渲染（验证 valParamInline 对 inlineKeys 的处理）
const S = mk({ id: 'c-s', name: '分部公司', ticker: '600004.SH', currentPrice: 30,
  valuations: [{ id: 'v-s1', date: '2026-09-01', method: 'SOTP', scenario: '中性', year: '2026E',
    params: { seg1np: 20, seg1pe: 15, seg2np: 10, seg2pe: 25, listedHold: 80, netCash: 30, netDebt: 10, shares: 10 },
    estimatedValue: 65, actualPrice: 30 }] });
sandbox.DB.valuation.companies = [S];
sandbox.state.valCompanyId = 'c-s';
const sotpDetail = mod.render();
ok(sotpDetail.indexOf('①净利') >= 0 && sotpDetail.indexOf('②PE') >= 0, 'SOTP 记录行内渲染分部参数');
ok(sotpDetail.indexOf('＋4 项在 ⚙') >= 0, 'SOTP 行内提示其余 4 项在 ⚙ 中编辑');
ok(sotpDetail.indexOf('SOTP分部估值') >= 0, 'SOTP 方法徽章出现');
sandbox.state.valCompanyId = null;

/* ---------- P2-3：横向排序 / 排行榜 / 对比表导出 ---------- */
// 上一条用例把公司列表清空了，这里恢复（A/B/C 三家）
sandbox.DB.valuation.companies = [A, B, C];
sandbox.state.valTiers = [];
sandbox.state.valKw = '';
sandbox.state.valSortKey = 'mos';
sandbox.state.valSortDir = 'desc';
ok(Math.abs(V.mosOf(A) - 25) < 1e-6, 'mosOf(A) =（120−90）/120 = 25%', String(V.mosOf(A)));
ok(V.mosOf(C) === null, 'mosOf(C) = null（无估值记录）');
ok(Math.abs(V.gapToFirstBuy(A) - (-11.7647)) < 0.01, 'gapToFirstBuy(A) =（90−102）/102 ≈ −11.76%', String(V.gapToFirstBuy(A)));
ok(V.gapToFirstBuy(C) === null, 'gapToFirstBuy(C) = null（无中性情景）');
const byMos = V.sortCompanies(sandbox.DB.valuation.companies);
ok(byMos.map(c => c.id).join(',') === 'c-a,c-b,c-c', '按安全边际倒序：A(25%) → B(−25%) → C(空值沉底)', byMos.map(c => c.id).join(','));
sandbox.state.valSortKey = 'name'; sandbox.state.valSortDir = 'asc';
ok(V.sortCompanies(sandbox.DB.valuation.companies).length === 3, '按名称排序不丢公司');
sandbox.state.valSortKey = 'mos'; sandbox.state.valSortDir = 'desc';
const rankHtml = mod.render ? '' : '';
sandbox.state.valView = 'rank';
const rankView = mod.render();
ok(rankView.indexOf('rank-table') >= 0, '排行榜视图渲染出表格');
ok(rankView.indexOf('导出对比表') >= 0, '排行榜视图带「⬇ 导出对比表」');
ok(rankView.indexOf('安全边际') >= 0 && rankView.indexOf('距第一买点') >= 0, '排行榜含关键对比列');
ok(rankView.indexOf('company-card') < 0, '排行榜视图不渲染卡片（避免两套 DOM 并存）');
sandbox.state.valView = 'card';
const csv = V.valRankCsv(V.sortCompanies(sandbox.DB.valuation.companies));
ok(csv.indexOf('股票代码,名称') > 0, '对比表 CSV 含表头');
ok(csv.indexOf('甲公司') > 0, '对比表 CSV 含公司行');
ok(csv.split('\r\n').length === 5, '对比表 CSV = 标题 + 表头 + 3 家公司', String(csv.split('\r\n').length));

/* ---------- 默认排序：安全边际（首位 + 降序） ---------- */
ok(V.VAL_SORT_METRICS[0].key === 'mos', '排序指标首位 = 安全边际', V.VAL_SORT_METRICS.map(m => m.key).join(','));
ok(V.VAL_SORT_METRICS[0].dir === 'desc', '安全边际的默认方向 = 降序');
// 清空排序状态（模拟首次打开）：renderValuation 应回落为 安全边际 ▼
sandbox.state.valSortKey = undefined; sandbox.state.valSortDir = undefined; sandbox.state.valView = 'card';
const defHtml = mod.render();
ok(sandbox.state.valSortKey === 'mos' && sandbox.state.valSortDir === 'desc',
  '首次进入默认按「安全边际」降序', sandbox.state.valSortKey + ' / ' + sandbox.state.valSortDir);
ok(/data-v="mos"[^>]*>安全边际 ▼/.test(defHtml), '排序条上安全边际为当前项且带 ▼');
ok(defHtml.indexOf('data-v="mos"') >= 0 && defHtml.indexOf('data-v="mos"') < defHtml.indexOf('data-v="name"'),
  '安全边际 chip 排在名称之前（第一个位置）');
// 排行榜列序：安全边际紧跟公司名，排在归档/现价之前
sandbox.state.valView = 'rank';
const rank2 = mod.render();
// 只在表头区段内比位置（表头文字会带排序箭头，如「安全边际 ▼」，故用前缀匹配）
const thead = rank2.slice(rank2.indexOf('<thead>'), rank2.indexOf('</thead>'));
const iMos = thead.indexOf('>安全边际'), iTier = thead.indexOf('>归档<'), iPrice = thead.indexOf('>现价');
ok(iMos > 0 && iMos < iTier && iMos < iPrice, '排行榜「安全边际」列排在 归档/现价 之前', iMos + '/' + iTier + '/' + iPrice);
sandbox.state.valView = 'card';
const csvHead = csv.split('\r\n')[1].split(',');
ok(csvHead[0] === '股票代码' && csvHead[1] === '名称' && csvHead[2] === '安全边际%' && csvHead[3] === '距第一买点%',
  '对比表 CSV 列序：代码 / 名称 / 安全边际% / 距第一买点% …', csvHead.slice(0, 5).join(','));
sandbox.state.valSortKey = 'mos'; sandbox.state.valSortDir = 'desc';

/* ---------- 搜索框位置：紧贴公司列表上方，不夹在筛选 chips 中间 ---------- */
sandbox.DB.valuation.companies = [A, B, C];
sandbox.state.valTiers = []; sandbox.state.valKw = ''; sandbox.state.valView = 'card';
const layHtml = mod.render();
const iKw = layHtml.indexOf('data-input="val.kw"');
const iLynch = layHtml.indexOf('data-action="val.fLynchClear"');   // 最后一个筛选 chips 行
const iSort = layHtml.indexOf('sort-bar');                          // 紧贴列表的排序条
ok(iKw > 0 && iKw > iLynch && iKw < iSort,
  '搜索框位于筛选 chips 之后、公司列表之前（不再夹在筛选中间）', iLynch + ' < ' + iKw + ' < ' + iSort);
// 搜不到结果时输入框必须还在页面上，否则改不了关键词。
// 沙箱默认 kwMatch 恒为 true（其它用例依赖），这里临时换成真实子串匹配才能进入空态。
const kwMatchOrig = sandbox.kwMatch;
sandbox.kwMatch = (text, k) => String(text == null ? '' : text).toLowerCase().includes(k);
sandbox.state.valKw = 'zzz查无此司zzz';
const noneHtml = mod.render();
ok(noneHtml.indexOf('data-input="val.kw"') > 0 && noneHtml.indexOf('没有匹配') > 0, '无匹配结果时搜索框仍保留（否则改不了关键词）');
ok(noneHtml.indexOf('data-input="val.kw"') < noneHtml.indexOf('没有匹配'), '空态下搜索框渲染在提示文案之前');
sandbox.kwMatch = kwMatchOrig;
sandbox.state.valKw = '';

/* ---------- P2-2：组合仓位（目标达成度 + 单票超限） ---------- */
ok(!!SW && typeof SW.render === 'function', 'swing 模块注册成功');
const swItem = o => Object.assign({ id: o.id, ticker: o.ticker, name: o.name, pool: '轮动', status: '待击球',
  hub: null, buyLow: null, buyHigh: null, trimZone: null, events: [], invalidConds: [], reasons: { r1:'', r2:'', r3:'' } }, o);
const HOLD = mk({ id: 'c-h', name: '持仓公司', ticker: '600009.SH', currentPrice: 12,
  investments: [{ id: 'i1', date: '2026-08-01', action: 'buy', price: 10, shares: 1000 }] });     // 市值 12000
const UNK  = mk({ id: 'c-u', name: '未归类公司', ticker: '600010.SH', currentPrice: 20,
  investments: [{ id: 'i2', date: '2026-08-02', action: 'buy', price: 16, shares: 500 }] });      // 市值 10000
const swState = () => ({ view: 'swing', swingKw: '', swingStatus: '全部', swingPool: '全部', swingSort: 'gap', swingSortDir: 'asc', swingDetailId: null });

sandbox.DB = { valuation: { companies: [HOLD, UNK] }, swing: { capital: 0, items: [swItem({ id: 's1', ticker: '600009.SH', name: '持仓公司', pool: '核心候选' })] } };
sandbox.state = swState();
let swHtml = SW.render();
ok(swHtml.indexOf('组合仓位') >= 0, '待击球页含「⚖ 组合仓位」面板');
ok(swHtml.indexOf('未填总资金') >= 0, '未填总资金 → 明确提示占比为相对值');
ok(swHtml.indexOf('未归类') >= 0, '持仓不在台账 → 标记未归类');
ok(swHtml.indexOf('标记「持仓中」但查不到持仓记录') < 0, '无幽灵持仓时不误报');

sandbox.DB.swing.capital = 100000;
swHtml = SW.render();
ok(swHtml.indexOf('12.00%') >= 0, '核心候选占比 = 12000/100000 = 12.00%');
ok(swHtml.indexOf('pp-low') >= 0, '12% 远低于目标 60% → 提示需加仓');
ok(swHtml.indexOf('超限') < 0, '12% < 单票上限 15% → 不误报超限');

sandbox.DB.swing.capital = 50000;
swHtml = SW.render();
ok(swHtml.indexOf('超限') >= 0, '12000/50000 = 24% > 15% → 触发单票超限预警');
ok(swHtml.indexOf('pp-over-row') >= 0, '超限行高亮');

sandbox.DB = { valuation: { companies: [] }, swing: { capital: 0, items: [swItem({ id: 's2', ticker: '600011.SH', name: '幽灵仓', pool: '轮动', status: '持仓中' })] } };
sandbox.state = swState();
const ghostHtml = SW.render();
ok(ghostHtml.indexOf('还没有持仓份额') >= 0, '无持仓 → 空态引导文案');
ok(ghostHtml.indexOf('标记「持仓中」但查不到持仓记录') >= 0, '无持仓但有幽灵条目 → 仍给出一致性提示');

log('');
log('== ' + pass + ' passed, ' + fail + ' failed ==');
console.log(out.join('\n'));
process.exit(fail ? 1 : 0);
