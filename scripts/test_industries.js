/* ============================================================
 * 行业研究模块回归测试：vm 沙箱加载 industries.js，无需浏览器。
 * 运行：node scripts/test_industries.js   （退出码 0 = 全部通过）
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');

const ROOT = 'C:/Users/DT-Liuxiangfei/Documents/myfiles/wpssyncdisk/goal-tracker';
const sb = {};
sb.__mods = {};
sb.window = {};
sb.window.scrollTo = () => {};
sb.console = console;
sb.DB = {};
sb.state = {};
sb.save = () => {};
sb.render = () => {};
sb.toast = () => {};
sb.location = { hash: '' };
sb.scrollTo = () => {};
sb.confirm = () => true;
sb.alert = m => { throw new Error('alert 被触发: ' + m); };
sb.esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
sb.uid = () => 'test-' + Math.random().toString(36).slice(2, 8);
sb.dateStr = () => '2026-09-14';
sb.kwMatch = (t, k) => String(t || '').toLowerCase().includes(String(k || '').toLowerCase());
sb.md = s => s;
// core.js 的申万行业路径工具在沙箱中的简化版（不含地图匹配与去重）
sb.swPath = (code, fb) => { fb = fb || {}; return [fb['行业'] || fb.industry, fb['行业二级'] || fb.industryL2, fb['行业三级'] || fb.industryL3].filter(Boolean).join(' / '); };
sb.swRest = (code, fb) => sb.swPath(code, fb).split(' / ').slice(1).join(' / ');
sb.openModal = (t, b) => { sb.__lastModalBody = b; };
sb.closeModal = () => {};
sb.mdField = () => '';
sb.Register = { module(m){ sb.__mods[m.view] = m; } };
vm.createContext(sb);
vm.runInContext(fs.readFileSync(ROOT + '/modules/industries.js', 'utf8'), sb);

const Q = sb.window.IndResearch;
const MOD = sb.__mods.industries;

let passed = 0, failed = 0;
function ok(cond, msg){
  if(cond){ passed++; }
  else { failed++; console.log('✗ ' + msg); }
}
function eq(a, b, msg){
  const ja = JSON.stringify(a), jb = JSON.stringify(b);
  ok(ja === jb, msg + '（期望 ' + jb + '，实际 ' + ja + '）');
}
const ctx = code => vm.runInContext(code, sb);

/* ---------- 1. 模块注册 ---------- */
ok(!!MOD, '注册了 industries 模块');
eq(MOD.view, 'industries', 'view 名');
eq(MOD.nav.group, '投资追踪', 'nav 分组');
eq(MOD.nav.label, '行业研究', 'nav 标签');
ok(typeof MOD.render === 'function' && typeof MOD.ensure === 'function', 'render/ensure 存在');
ok(MOD.actions['ind.goEarnings'] && MOD.actions['ind.collect'] && MOD.changes['ind.setProsperity'] && MOD.forms['ind.save'], '关键 actions/changes/forms 齐全');

/* ---------- 2. seed / ensure 迁移 ---------- */
const sv = Q.seed();
eq(Object.keys(sv), ['list'], 'seed 只有 list');
ctx('DB.industries = { list: [{ id:"x1", name:"电子", prosperity:2, thesis:"已有逻辑" }] }');
ctx('state.view = "industries"');
MOD.ensure(sb.DB, sv);
let lst = ctx('DB.industries.list');
eq(lst.length, 1, 'ensure 不新增条目');
ok(lst[0].prosperity === 2 && lst[0].thesis === '已有逻辑', 'ensure 不覆盖已有值');
ok(lst[0].chain === '' && Array.isArray(lst[0].drivers) && lst[0].tracked === true, 'ensure 补齐缺失字段');
MOD.ensure(sb.DB, sv);   // 幂等
eq(ctx('DB.industries.list').length, 1, 'ensure 幂等');

/* ---------- 3. median ---------- */
eq(Q.median([3, 1, 2]), 2, '奇数中位');
eq(Q.median([4, 1, 2, 3]), 2.5, '偶数中位');
eq(Q.median([]), null, '空数组');

/* ---------- 4. 财报池聚合 ---------- */
ctx(`
  DB.earnings = { rows: [
    { '公司名称':'甲', '股票代码':'600001', '行业':'电子', '季度':'2026Q2', '披露日期':'2026-08-20', '营收同比':30, '扣非净利同比':50, '毛利率':20, 'ROE':10, '超预期':5 },
    { '公司名称':'乙', '股票代码':'600002', '行业':'电子', '季度':'2026Q2', '披露日期':'2026-08-21', '营收同比':10, '扣非净利同比':-5, '超预期':-2 },
    { '公司名称':'甲', '股票代码':'600001', '行业':'电子', '季度':'2026Q1', '披露日期':'2026-04-25', '营收同比':25, '扣非净利同比':40, '超预期':'' },
    { '公司名称':'丙', '股票代码':'600003', '行业':'通信', '季度':'2026Q2', '披露日期':'2026-08-22', '营收同比':60, '扣非净利同比':80, '超预期':12 },
  ] };
`);
const earn = Q.earnStatsByIndustry();
eq(Object.keys(earn).length, 2, '按行业分 2 组');
eq(earn['电子'].companies, 2, '电子去重公司数（甲跨季度只算 1 家）');
eq(earn['电子'].rows, 3, '电子行数');
eq(earn['电子'].beatN, 2, '电子有效超预期样本（空串不计）');
eq(earn['电子'].beat, 1, '电子超预期家次');
eq(Q.median(earn['电子'].dedYoy), 40, '电子扣非中位 = median(50,-5,40)=40');
eq(earn['电子'].lastDate, '2026-08-21', '最新披露日期');
eq(earn['通信'].beat, 1, '通信超预期');

/* ---------- 5. 估值池聚合 ---------- */
ctx(`
  DB.valuation = { companies: [
    { id:'c1', name:'甲', industry:'电子', tier:'咖啡罐' },
    { id:'c2', name:'丁', industry:'电子', tier:'观察池' },
    { id:'c3', name:'戊', industry:'电子', tier:'' },
    { id:'c4', name:'己', industry:'医药生物', tier:'回避' },
  ] };
`);
const val = Q.valStatsByIndustry();
eq(val['电子'].total, 3, '电子估值池家数');
eq(val['电子'].tiers['咖啡罐'], 1, '咖啡罐计数');
eq(val['医药生物'].tiers['回避'], 1, '回避计数');

/* ---------- 6. 一键收录候选 ---------- */
ctx('DB.industries = { list: [{ id:"x1", name:"电子", chain:"", lifecycle:"", policy:"", prosperity:null, prosperityNote:"", thesis:"", drivers:[], invalidConds:[], tracked:true, updated:"" }] }');
const cands = Q.collectCandidates(earn, val);
const candNames = cands.map(c => c.name);
ok(!candNames.includes('电子'), '已收录行业不再提示');
ok(candNames.includes('医药生物'), '医药生物（估值池 1 家）入选');
ok(!candNames.includes('通信'), '通信仅 1 行财报且不在估值池 → 低于阈值不提示');
ok(!candNames.includes('(未分类)'), '未分类不入选');

/* ---------- 7. forms.ind.save：新建 + 编辑 ---------- */
function fakeFD(obj){ return { get: k => (k in obj ? obj[k] : null) }; }
ctx('DB.industries = { list: [] }');
MOD.forms['ind.save'](fakeFD({
  name: ' 电子 ', chain: '上游', lifecycle: '成长期', policy: '扶持',
  prosperity: '2', prosperityNote: '量价齐升', thesis: '逻辑A',
  drivers: '硅料价格、 组件出口 ,海外库存', invalidConds: '装机转负\n 需求滑坡 ',
  tracked: 'on',
}));
eq(ctx('DB.industries.list.length'), 1, '新建 1 条');
let ind = ctx('DB.industries.list[0]');
eq(ind.name, '电子', '名称去空格');
eq(ind.drivers, ['硅料价格', '组件出口', '海外库存'], '驱动指标拆分（顿号/逗号）');
eq(ind.invalidConds, ['装机转负', '需求滑坡'], '失效条件按行拆分');
eq(ind.prosperity, 2, '景气度转数字');
eq(ind.tracked, true, 'tracked 勾选');
ok(ind.id && ind.updated === '2026-09-14', 'id/updated 自动填');
// 编辑同一条（带 id）
const theId = ind.id;
MOD.forms['ind.save'](fakeFD({ id: theId, name: '电子', prosperity: '', drivers: '', invalidConds: '', tracked: null, thesis: '逻辑B', chain:'', lifecycle:'', policy:'', prosperityNote:'' }));
eq(ctx('DB.industries.list.length'), 1, '编辑不新增条目');
ind = ctx('DB.industries.list[0]');
eq(ind.prosperity, null, '景气度可清空');
eq(ind.tracked, false, '不勾选 tracked → false');
eq(ind.thesis, '逻辑B', 'thesis 更新');

/* ---------- 8. render 冒烟（地图 + 详情，不抛错即过） ---------- */
ctx('state.indSort = "beat"; state.indHideUntracked = false; state.indDetailId = null;');
let html = MOD.render();
ok(typeof html === 'string' && html.includes('行业研究') && html.includes('电子'), '地图渲染包含行业卡片');
ok(html.includes('一键收录') || html.includes('尚未收录') || html.includes('数据覆盖'), '地图渲染含收录区或空态/脚注');
ctx('state.indDetailId = DB.industries.list[0].id');
html = MOD.render();
ok(typeof html === 'string' && html.includes('行业逻辑'), '详情渲染包含行业逻辑区');
ok(html.includes('在财报跟踪中查看') && html.includes('在估值池中查看'), '详情渲染包含联动按钮');
ok(html.includes('池内公司最新财务'), '详情渲染包含池内公司最新财务数据');
ok(!html.includes('估值池公司（'), '估值池清单已并入命中表（不再单独展示）');
// 景气未评 badge 不抛错
ctx('DB.industries.list[0].prosperity = null');
html = MOD.render();
ok(html.includes('景气未评'), '景气未评徽章渲染');
// action 冒烟：collect / goEarnings（不抛错）
MOD.actions['ind.collect']({ dataset: { v: '有色金属' } });
eq(ctx('DB.industries.list.length'), 2, 'collect 新增行业');
ctx('state.view = "earnings"');
MOD.actions['ind.goEarnings']({ dataset: { v: '电子' } });
eq(ctx('state.earnIndustries'), ['电子'], 'goEarnings 设置财报行业筛选');
eq(ctx('state.indDetailId'), null, 'goEarnings 清空详情态');
ctx('state.view = "valuation"');
MOD.actions['ind.goValuation']({ dataset: { v: '电子' } });
eq(ctx('state.valIndustries'), ['电子'], 'goValuation 设置估值行业筛选');

/* ---------- 9. 细分行业（一/二/三级层级） ---------- */
ctx(`
  DB.earnings = { rows: [
    { '公司名称':'甲', '股票代码':'600001', '行业':'电子', '行业二级':'半导体', '行业三级':'集成电路制造', '季度':'2026Q2', '披露日期':'2026-08-20', '营收同比':30 },
    { '公司名称':'乙', '股票代码':'600002', '行业':'电子', '行业二级':'半导体', '行业三级':'数字芯片设计', '季度':'2026Q2', '披露日期':'2026-08-21', '营收同比':40 },
    { '公司名称':'丙', '股票代码':'600003', '行业':'电子', '行业二级':'消费电子', '行业三级':'消费电子零部件及组装', '季度':'2026Q2', '披露日期':'2026-08-22', '营收同比':10 },
  ] };
  DB.valuation = { companies: [
    { id:'c1', name:'甲', ticker:'600001', industry:'电子', industryL2:'半导体', industryL3:'集成电路制造', tier:'咖啡罐' },
    { id:'c2', name:'丙', ticker:'600003', industry:'电子', industryL2:'消费电子', industryL3:'消费电子零部件及组装', tier:'' },
  ] };
  DB.industries = { list: [
    { id:'i1', name:'电子', level:1, chain:'', lifecycle:'', policy:'', prosperity:null, prosperityNote:'', thesis:'', drivers:[], invalidConds:[], tracked:true, updated:'' },
    { id:'i2', name:'半导体', level:2, chain:'', lifecycle:'', policy:'', prosperity:null, prosperityNote:'', thesis:'', drivers:[], invalidConds:[], tracked:true, updated:'' }
  ] };
`);
const st2 = Q.allStats();
eq(Object.keys(st2.e[2]).length, 2, '二级聚合得到 2 个行业');
eq(st2.e[2]['半导体'].companies, 2, '二级「半导体」覆盖 2 家（同公司跨行只算 1 家）');
eq(st2.e[3]['集成电路制造'].companies, 1, '三级「集成电路制造」覆盖 1 家');
eq(st2.v[2]['消费电子'].total, 1, '估值池按二级聚合');
const kids1 = Q.childrenOf({ name:'电子', level:1 });
eq(kids1.length, 2, '「电子」细分出 2 个二级行业');
eq(kids1[0].name, '半导体', '细分按覆盖公司数排序（半导体在前）');
eq(kids1[0].level, 2, '细分层级 = 二级');
const kids2 = Q.childrenOf({ name:'半导体', level:2 });
eq(kids2.length, 2, '「半导体」细分出 2 个三级行业');
eq(kids2[0].level, 3, '细分层级 = 三级');
ok(Q.childrenOf({ name:'集成电路制造', level:3 }).length === 0, '三级已是最细，无细分');
eq(Q.pathOf({ name:'集成电路制造', level:3 }), ['电子','半导体','集成电路制造'], '三级条目路径完整');
const cands2 = Q.collectAllCandidates(st2);
ok(!cands2.some(c => c.name === '半导体' && c.level === 2), '已收录的二级行业不再提示');
ok(cands2.some(c => c.name === '消费电子' && c.level === 2), '估值池有公司的二级行业进入候选');
ok(cands2.every(c => c.level >= 1 && c.level <= 3), '候选均带层级');
ctx('state.indDetailId = "i1"');
html = MOD.render();
ok(html.includes('细分行业'), '一级行业详情渲染细分行业区');
ok(html.includes('消费电子'), '细分行业区列出二级行业');
ctx('state.indDetailId = "i2"');
html = MOD.render();
ok(html.includes('集成电路制造'), '二级行业详情的财报表含三级细分列');
MOD.actions['ind.collect']({ dataset: { v:'消费电子', lv:'2' } });
eq(ctx('DB.industries.list').length, 3, '按二级收录新增条目');
eq(ctx('DB.industries.list[2].level'), 2, '收录条目自带层级');
MOD.actions['ind.collect']({ dataset: { v:'消费电子', lv:'2' } });
eq(ctx('DB.industries.list').length, 3, '同层级重复收录不新增');
ctx('state.indDetailId = null; state.indLevelFilter = "2";');
html = MOD.render();
const cardCnt = (html.match(/style="cursor:pointer;padding:14px 16px"/g) || []).length;
eq(cardCnt, 2, '层级筛选「二级」后只剩 2 张卡');
ctx('state.indLevelFilter = "all"; state.view = "earnings"; state.earnIndustries = []; state.earnIndustriesL2 = []; state.earnIndustriesL3 = [];');
MOD.actions['ind.goEarnings']({ dataset: { v:'集成电路制造', lv:'3', parent:'电子 / 半导体' } });
eq(ctx('state.earnIndustries'), ['电子'], '三级联动选中一级父行业');
eq(ctx('state.earnIndustriesL2'), ['半导体'], '三级联动选中二级父行业');
eq(ctx('state.earnIndustriesL3'), ['集成电路制造'], '三级联动选中三级自身');

/* ---------- 10. 全市场分类地图（东财行业/概念命中、双池合并） ---------- */
ctx(`
  DB.industryMap = { importedAt: '2026-09-16', rows: [
    { code:'600001', name:'甲', em:'半导体', sw1:'电子', sw2:'半导体', sw3:'集成电路制造', concepts:'AI算力、芯片' },
    { code:'600002', name:'乙', em:'半导体', sw1:'电子', sw2:'半导体', sw3:'数字芯片设计', concepts:'AI算力' },
    { code:'600009', name:'庚', em:'白酒',   sw1:'食品饮料', sw2:'白酒', sw3:'白酒', concepts:'' },
  ] };
`);
const CI2 = Q.clsIndex();
ok(CI2.hasMap, '地图已导入');
const hitsEm = Q.hitsOf('em', '半导体', CI2);
eq(hitsEm.length, 2, '东财行业「半导体」命中池内 2 家（庚不在池内不出现）');
const stEm = Q.statsForHits(hitsEm);
eq(stEm.companies, 2, '命中公司财报池家数');
eq(stEm.valTotal, 1, '命中公司估值池家数（仅甲）');
ok(hitsEm.every(h => h.earnRow), '命中项带最新财报行');
ok(hitsEm.every(h => h.mapRow && h.mapRow.em === '半导体'), '命中项带地图行');
eq(Q.hitsOf('concept', 'AI算力', CI2).length, 2, '概念「AI算力」命中 2 家');
eq(Q.hitsOf('concept', '芯片', CI2).length, 1, '概念「芯片」命中 1 家');
const listEm = Q.clsListFor('em', CI2);
eq(listEm.length, 2, '东财行业共 2 个分类');
eq(listEm[0].name, '半导体', '按池内命中排序（半导体在前）');
eq(listEm[0].universe, 2, '半导体全市场 2 家');
eq(listEm[1].poolHits, 0, '白酒无池内命中');
// 收录候选：地图体系（估值池有公司即入选，无命中的不进）
ctx('DB.industries = { list: [] }');
const cands3 = Q.collectAllCandidates(Q.allStats(), CI2);
ok(cands3.some(c => c.sys === 'em' && c.name === '半导体'), '东财行业候选含半导体');
ok(!cands3.some(c => c.sys === 'em' && c.name === '白酒'), '无池内命中的分类不进候选');
// 分类详情渲染
ctx('state.indCls = { sys: "em", name: "半导体" }; state.indDetailId = null;');
html = MOD.render();
ok(html.includes('池内公司最新财务'), '分类详情渲染命中公司表');
ok(html.includes('乙'), '命中表包含池内公司');
ok(html.includes('收录为研究条目'), '未收录分类显示收录按钮');
// 命中表列排序
MOD.actions['ind.hitSort']({ dataset: { key: 'revYoy' } });
eq(ctx('state.indHitSort'), 'revYoy', '命中表换列排序');
eq(ctx('state.indHitDir'), 'desc', '数值列默认降序');
MOD.actions['ind.hitSort']({ dataset: { key: 'revYoy' } });
eq(ctx('state.indHitDir'), 'asc', '同列再点切换升序');
MOD.actions['ind.hitLimit']({ dataset: { v: '20' } });
eq(ctx('state.indHitLimit'), 20, '命中表条数筛选');
MOD.actions['ind.hitLimit']({ dataset: { v: 'all' } });
eq(ctx('state.indHitLimit'), 'all', '条数筛选可切全部');
// 台账 sys 字段贯通
MOD.actions['ind.collect']({ dataset: { v: '半导体', sys: 'em' } });
eq(ctx('DB.industries.list[0].sys'), 'em', '按东财行业收录带 sys');
eq(Q.sysKeyOf({ name:'半导体', sys:'em', level:1 }), 'em', 'sysKeyOf 读取显式 sys');
eq(Q.sysKeyOf({ name:'电子', level:1 }), 'sw1', '历史条目回退申万层级');
MOD.actions['ind.collect']({ dataset: { v: '半导体', sys: 'em' } });
eq(ctx('DB.industries.list.length'), 1, '同体系重复收录不新增');

/* ---------- 10. 手动导入财报池公司（搜索 → members） ---------- */
ctx(`
  DB.earnings = { rows: [
    { '公司名称':'甲', '股票代码':'600001', '行业':'电子', '季度':'2026Q2', '披露日期':'2026-08-20', '营收同比':30 },
    { '公司名称':'乙', '股票代码':'000002', '行业':'银行', '季度':'2026Q2', '披露日期':'2026-08-21', '营收同比':5 },
    { '公司名称':'乙二', '股票代码':'000003', '行业':'银行', '季度':'2026Q2', '披露日期':'2026-08-21', '营收同比':6 },
  ] };
  DB.valuation = { companies: [
    { name:'甲', ticker:'600001.SH', industry:'电子', currentPrice:25.5, quote:{ date:'2026-09-17', pct:2.5, pct5:-1.5, monthPct:-3.1, pe:30 } },
  ] };
  DB.industries = { list: [] };
`);
MOD.ensure(ctx('DB'));
eq(ctx('DB.industries.list.length'), 0, '空台账');
MOD.actions['ind.collect']({ dataset: { v: '电子', sys: 'sw1' } });
eq(ctx('DB.industries.list.length'), 1, '收录「电子」');
ok(ctx('DB.industries.list[0].members && DB.industries.list[0].members.length === 0'), '新条目自带空 members');
const indId = ctx('DB.industries.list[0].id');
ctx('state.view = "industries"; state.indCls = null; state.indDetailId = ' + JSON.stringify(ctx('DB.industries.list[0].id')));
let html2 = MOD.render();
ok(html2.indexOf('甲') >= 0 && html2.indexOf('乙') < 0, '导入前：详情只含自动命中的甲');
// 打开搜索弹窗：导入前就能看到公司（名称/代码/现属行业）——用户痛点回归
MOD.actions['ind.memberSearch']({ dataset: { id: indId } });
const modalBody = sb.__lastModalBody || '';
ok(modalBody.indexOf('乙') >= 0 && modalBody.indexOf('000002') >= 0, '弹窗列出乙（名称+代码可见）');
ok(modalBody.indexOf('现属 银行') >= 0, '弹窗展示现属行业');
ok(modalBody.indexOf('✓ 已在行业内') >= 0, '自动命中的甲标「已在行业内」不提供导入按钮');
ok(modalBody.indexOf('indMemberFilter') >= 0, '弹窗带即时过滤');
// 列表行内点「导入」
MOD.actions['ind.memberAdd']({ dataset: { id: indId, code: '000002' } });
eq(ctx('DB.industries.list[0].members'), ['000002'], '导入乙 → members 写入 6 位代码');
html2 = MOD.render();
ok(html2.indexOf('乙') >= 0, '导入后详情包含乙');
ok(html2.indexOf('手动') >= 0, '手动来源徽章渲染');
ok(html2.indexOf('手动导入（1）') < 0 && html2.indexOf('ind.memberDel') >= 0, '无冗余 chips 条，移除入口在操作列');
ok(html2.indexOf('手动导入 1 家') >= 0, '副标题轻量计数');
/* 行情三列：现价（带日期小字）/ 涨幅 / 本月涨幅 */
ok(html2.indexOf('<b>25.50</b>') >= 0 && html2.indexOf('2026-09-17') >= 0, '现价列渲染且带日期小字');
ok(html2.indexOf('▲ 2.50%') >= 0, '涨幅列渲染（涨红▲）');
ok(html2.indexOf('▼ 1.50%') >= 0, '5日涨幅列渲染（跌绿▼）');
ok(html2.indexOf('▼ 3.10%') >= 0, '本月涨幅列渲染（跌绿▼）');
/* 全站行情回退：乙不在估值池，仅 DB.quotes 有行情 → 导入后同样显示现价/涨幅 */
ctx(`DB.quotes = { '000002': { price: 12.34, pct: 1.2, pct5: 3.6, monthPct: -2.4, date: '2026-09-18' } };`);
html2 = MOD.render();
ok(html2.indexOf('<b>12.34</b>') >= 0 && html2.indexOf('▲ 1.20%') >= 0, '纯财报池公司回退全站行情（DB.quotes）');
ok(html2.indexOf('▲ 3.60%') >= 0, '全站行情的5日涨幅同样生效');
ok(html2.indexOf('▼ 2.40%') >= 0, '全站行情的本月涨幅同样生效');
// 重复导入去重（弹窗内显示「已导入」状态）
MOD.actions['ind.memberSearch']({ dataset: { id: indId } });
const modalBody2 = sb.__lastModalBody || '';
ok(modalBody2.indexOf('✓ 已导入') >= 0, '已导入公司在弹窗中标「✓ 已导入」');
MOD.actions['ind.memberAdd']({ dataset: { id: indId, code: '000002' } });
eq(ctx('DB.industries.list[0].members.length'), 1, '重复导入去重');
// 移除
MOD.actions['ind.memberDel']({ dataset: { id: indId, code: '000002' } });
eq(ctx('DB.industries.list[0].members'), [], 'memberDel 移除成员');
html2 = MOD.render();
ok(html2.indexOf('乙') < 0, '移除后详情不再含乙');

/* ---------- 结果 ---------- */
console.log('\n== ' + passed + ' passed, ' + failed + ' failed ==');
process.exit(failed ? 1 : 0);
