/* ============================================================
 * 行业研究模块回归测试：vm 沙箱加载 industries.js，无需浏览器。
 * 运行：node scripts/tests/test_industries.js   （退出码 0 = 全部通过）
 * ============================================================ */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');   // 从脚本自身位置推导工作区根，不再硬编码机器路径
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
// Repo（modules/data-repo.js）沙箱简化版：镜像 normCode6/poolIndex 的真实口径
sb.Repo = {
  normCode6: s => { const m = String(s || '').match(/(\d{6})/); return m ? m[1] : ''; },
  poolIndex: () => {
    const m = {};
    ((sb.DB.earnings && sb.DB.earnings.rows) || []).forEach(r => {
      const c = sb.Repo.normCode6(r['股票代码']); if(!c) return;
      const st = m[c] || (m[c] = { earnRows: [], valCo: null });
      st.earnRows.push(r);
    });
    ((sb.DB.valuation && sb.DB.valuation.companies) || []).forEach(co => {
      const c = sb.Repo.normCode6(co.ticker || co.code); if(!c) return;
      const st = m[c] || (m[c] = { earnRows: [], valCo: null });
      st.valCo = co;
    });
    return m;
  },
};
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
// 说明列：notes 命中 → 显示精简环节定位；表头由「数据池」改为「说明」
ctx('DB.industries.list[0].notes = { "600001": "测试环节定位" }');
html = MOD.render();
ok(html.includes('<th>说明</th>'), '命中表表头为「说明」');
ok(html.includes('测试环节定位'), 'notes 精简定位渲染进说明列');
// 说明列：公司级 companyNotes 跟着公司走（行业级 notes 可覆写）
ctx('DB.industries.list[0].notes = {}; DB.industries.companyNotes = { "600001": "公司级定位" };');
html = MOD.render();
ok(html.includes('公司级定位'), 'companyNotes 公司级说明渲染（无行业 notes 时生效）');
ctx('DB.industries.list[0].notes = { "600001": "行业覆写" };');
html = MOD.render();
ok(html.includes('行业覆写') && !html.includes('公司级定位'), '行业级 notes 覆写公司级 companyNotes');
// 景气未评 badge 不抛错
ctx('DB.industries.list[0].prosperity = null');
html = MOD.render();
ok(html.includes('景气未评'), '景气未评徽章渲染');
// action 冒烟：collect / goEarnings（不抛错）
MOD.actions['ind.collect']({ dataset: { v: '有色金属' } });
eq(ctx('DB.industries.list.length'), 2, 'collect 新增行业');
ctx('state.view = "earnings"');
MOD.actions['ind.goEarnings']({ dataset: { v: '电子', codes: '600001,600002' } });
// 联动已演进为「按命中公司代码锁定」（比按行业名精确匹配更可靠，规避名称口径差异）
eq(ctx('state.earnLock && state.earnLock.label'), '电子', 'goEarnings 设置财报锁定 label');
eq(ctx('state.earnLock && state.earnLock.codes'), ['600001','600002'], 'goEarnings 带命中公司代码');
eq(ctx('state.indDetailId'), null, 'goEarnings 清空详情态');
ctx('state.view = "valuation"');
MOD.actions['ind.goValuation']({ dataset: { v: '电子', codes: '600001' } });
eq(ctx('state.valLock && state.valLock.label'), '电子', 'goValuation 设置估值锁定 label');
eq(ctx('state.valLock && state.valLock.codes'), ['600001'], 'goValuation 带命中公司代码');

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
ctx('state.indLevelFilter = "all"; state.view = "earnings"; state.earnLock = null;');
// 联动演进：三级行业同样按「命中代码锁定」跳转（data-lv/parent 已废弃，只用 data-v + data-codes）
MOD.actions['ind.goEarnings']({ dataset: { v:'集成电路制造', codes:'600001' } });
eq(ctx('state.earnLock && state.earnLock.label'), '集成电路制造', '三级行业锁定财报列表 label');
eq(ctx('state.earnLock && state.earnLock.codes'), ['600001'], '三级行业锁定命中公司代码');

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
// 概念命中屏蔽（ind.excludes）：过滤自动命中，手动导入不受影响
eq(Q.hitsOf('concept', 'AI算力', CI2, [], ['600002']).length, 1, 'excludes 过滤自动命中（剩甲）');
eq(Q.hitsOf('concept', 'AI算力', CI2, ['600002'], ['600002']).length, 2, 'excludes 不影响手动导入（手动 600002 保留）');
eq(Q.hitsOf('concept', 'AI算力', CI2, [], ['600002', '600001']).length, 0, '全部屏蔽后命中归零');
eq(Q.hitsOf('concept', 'AI算力', CI2, [], []).length, 2, '空 excludes = 不过滤');
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

/* ---------- 13. 定年纪（生命周期定位） ---------- */
// 分档锚点：对齐肖璟框架 15–40% = 成长期加速段（黄金介入区间）
const BANDS = Q.AGE_BANDS;
ok(Array.isArray(BANDS) && BANDS.length === 5, '五个生命周期分档');
eq(Q.ageStage(null), null, '未填 rate → 不判定');
eq(Q.ageStage(42).key, 'growth2', 'AI 算力 42% → 成长期中后段（主升浪）');
eq(Q.ageStage(35).key, 'growth', '设备 35% → 成长期加速段');
eq(Q.ageStage(15).key, 'growth', '材料 15% → 加速段下沿（15 落在 15–40 档）');
eq(Q.ageStage(3).key, 'intro0', '光刻机 3% → 导入期极早期');
eq(Q.ageStage(12).key, 'intro1', '先进制程 12% → 导入期→成长期过渡');
eq(Q.ageStage(70).key, 'mature', '70% → 成熟期（70 落在 ≥70 档）');
ok(Q.ageStage(25).cls === 'red' && Q.ageStage(80).cls === 'gray', '加速段红 / 成熟期灰');
// 研究重点判定：阶段决定研究什么
ok(Q.ageFocus('growth').indexOf('规模性') >= 0 && Q.ageFocus('growth').indexOf('防守性') >= 0,
  '成长期研究重点 = 规模性 + 防守性');
ok(Q.ageFocus('intro0').indexOf('可行性') >= 0, '导入期研究重点 = 可行性');
ok(Q.ageFocus('mature').indexOf('出清') >= 0, '成熟期研究重点 = 格局与出清');
// 爬坡速度：21→35 一年 = +14pct/年
const sl = Q.ageSlope(35, 21, '2025', '2024');
ok(Math.abs(sl.perYear - 14) < 1e-9, '设备 21→35（2024→2025）= +14pct/年');
ok(sl.txt.indexOf('+14.0pct') >= 0, '爬坡文案含 +14.0pct');
const sl2 = Q.ageSlope(42, 30, '', '');
eq(sl2.perYear, null, '年份缺失 → 不折算年化');
eq(Q.ageSlope(42, null, '2025', '2024'), null, '缺上期值 → 无爬坡');
// ensure 迁移：老条目补 age 结构、不覆盖已有值
ctx('DB.industries.list = [{ id:"a1", name:"电子", age:{ metric:"渗透率", rate:30 } }]');
MOD.ensure(sb.DB, sv);
const ag = ctx('DB.industries.list[0].age');
ok(ag.metric === '渗透率' && ag.rate === 30, 'ensure 保留已有 age 值');
ok(Array.isArray(ag.tracks) && ag.target === null && ag.note === '', 'ensure 补齐 age 缺失键');
// 详情页渲染：定年纪 section + 赛道自动判定徽章
ctx(`
  DB.industries.list = [{ id:"s1", name:"半导体", level:2, sys:"sw2", age:{
    metric:"国产化率", rate:42, rateYear:"2025", prevRate:30, prevYear:"2024", target:70, targetYear:"2030",
    note:"来源：机构测算",
    tracks:[
      { name:"半导体设备", rate:35, prevRate:21, note:"一年提了10pct" },
      { name:"光刻机", rate:3, prevRate:null, note:"十年长跑起点" },
    ] } }];
  DB.earnings = { rows: [] }; DB.valuation = { companies: [] }; DB.industryMap = { rows: [], importedAt: null };
`);
MOD.ensure(sb.DB, sv);   // 真实流程先过 ensure 补齐 drivers/tracked 等基础字段
MOD.actions['ind.open']({ dataset: { id: 's1' } });
const ageHtml = MOD.render();
ok(ageHtml.indexOf('🕰 定年纪') >= 0, '详情页含定年纪 section');
ok(ageHtml.indexOf('成长期中后段') >= 0, '整体 42% 自动判定为中后段');
ok(ageHtml.indexOf('+12.0pct / 1年 ≈ +12.0pct/年') >= 0, '整体爬坡 30→42 = +12pct/年');
ok(ageHtml.indexOf('剩余空间') >= 0 && ageHtml.indexOf('28pct') >= 0, '目标 70% → 剩余空间 28pct');
ok(ageHtml.indexOf('成长期加速段') >= 0, '赛道设备 35% 判定为加速段');
ok(ageHtml.indexOf('导入期极早期') >= 0, '赛道光刻机 3% 判定为导入期极早期');
ok(ageHtml.indexOf('规模性') >= 0, '渲染研究重点判定（成长期 → 规模性+防守性）');
// 赛道增删与行内编辑（changes/actions 冒烟）
MOD.actions['ind.ageTrackAdd']({ dataset: { id: 's1' } });
eq(ctx('DB.industries.list[0].age.tracks.length'), 3, 'ageTrackAdd 新增赛道');
MOD.changes['ind.ageTrackSet']({ dataset: { id:'s1', i:'2', k:'name' }, value: 'HBM存储' });
eq(ctx('DB.industries.list[0].age.tracks[2].name'), 'HBM存储', 'ageTrackSet 写赛道名');
MOD.changes['ind.ageTrackSet']({ dataset: { id:'s1', i:'2', k:'rate' }, value: '1' });
eq(ctx('DB.industries.list[0].age.tracks[2].rate'), 1, 'ageTrackSet 数字化当前%');
MOD.changes['ind.ageSet']({ dataset: { id:'s1', k:'rate' }, value: '' });
eq(ctx('DB.industries.list[0].age.rate'), null, 'ageSet 清空当前值 → null');
MOD.changes['ind.ageSet']({ dataset: { id:'s1', k:'rate' }, value: '42' });
eq(ctx('DB.industries.list[0].age.rate'), 42, 'ageSet 数字化整体当前值');
MOD.actions['ind.ageTrackDel']({ dataset: { id: 's1', i: '2' } });
eq(ctx('DB.industries.list[0].age.tracks.length'), 2, 'ageTrackDel 删除赛道');

/* ---------- 做体检：TAM 同比 / 自给率悖论 / 微笑曲线定位 ---------- */
// TAM 同比：相邻年份自动算
ok(Math.abs(Q.tamYoy(6271, 5269) - 19.0) < 0.1, 'TAM 2024 vs 2023 = +19%');
ok(Math.abs(Q.tamYoy(15100, 7960) - 89.7) < 0.1, 'TAM 2026E vs 2025 ≈ +90%（存储暴涨）');
eq(Q.tamYoy(7960, null), null, '缺上年数据 → 同比 null');
eq(Q.tamYoy(100, 0), null, '上年为 0 → 不除零');
// 自给率悖论：数量 70 vs 金额 27 → 替代的是价不是量
const sv1 = Q.selfVerdict(70, 27);
ok(sv1 && sv1.gap === 43 && sv1.txt.indexOf('高端化') >= 0, '数量70/金额27 → gap 43 + 提示替代空间在价');
ok(Q.selfVerdict(20, 40) && Q.selfVerdict(20, 40).txt.indexOf('高价值') >= 0, '金额反超 20pct → 已切入高价值环节');
ok(Q.selfVerdict(50, 45).txt.indexOf('基本同步') >= 0, '差 5pct → 基本同步');
eq(Q.selfVerdict(70, null), null, '缺金额自给率 → null');
// 微笑曲线：参考段与定位体检
eq(Q.smileSeg('传统封测（辛苦钱）').gm, 15, '传统封测参考毛利率 15%');
eq(Q.smileSeg('存储 · 瓶颈产能（哑铃倒置）').gm, 80, '存储瓶颈环节参考 80%（哑铃倒置）');
eq(Q.smileSeg('不存在的环节'), null, '未知环节 → null');
ok(Q.smileVerdict('传统封测（辛苦钱）', 46).d === 31, '封测但毛利 46% → 高出 31pct');
ok(Q.smileVerdict('传统封测（辛苦钱）', 46).txt.indexOf('超额') >= 0, '远超参考 → 提示查持续性');
ok(Q.smileVerdict('传统封测（辛苦钱）', 16).txt.indexOf('基本一致') >= 0, '贴近参考 → 一致');
eq(Q.smileVerdict('EDA / IP（收费站）', null), null, '未填毛利率 → null');
// healthInit 结构 + ensure 迁移（DB 是 vm 词法作用域，统一走 ctx 访问）
const hh = Q.healthInit();
ok(Array.isArray(hh.tam) && hh.qtySelf === null && hh.smile === '', 'healthInit 默认结构');
ctx('DB.industries.list.forEach(i => { if(i.health === undefined) i.health = Q.healthInit(); })');
ok(ctx('DB.industries.list[0].health') && ctx('Array.isArray(DB.industries.list[0].health.tam)'), 'ensure 后老条目补齐 health');
// tamAdd / tamDel / tamSet 事件
MOD.actions['ind.tamAdd']({ dataset: { id: 's1' } });
eq(ctx('DB.industries.list[0].health.tam.length'), 1, 'tamAdd 新增一行');
MOD.changes['ind.tamSet']({ dataset: { id: 's1', i: '0', k: 'year' }, value: '2026E' });
MOD.changes['ind.tamSet']({ dataset: { id: 's1', i: '0', k: 'size' }, value: '15100' });
MOD.changes['ind.tamSet']({ dataset: { id: 's1', i: '0', k: 'hot' }, checked: true });
eq(ctx('DB.industries.list[0].health.tam[0].year'), '2026E', 'tamSet 写年份');
eq(ctx('DB.industries.list[0].health.tam[0].size'), 15100, 'tamSet 数字化规模');
eq(ctx('DB.industries.list[0].health.tam[0].hot'), true, 'tamSet 勾选含金量存疑');
// healthSet：数字与文本字段
MOD.changes['ind.healthSet']({ dataset: { id: 's1', k: 'qtySelf' }, value: '70' });
MOD.changes['ind.healthSet']({ dataset: { id: 's1', k: 'valSelf' }, value: '27' });
MOD.changes['ind.healthSet']({ dataset: { id: 's1', k: 'smile' }, value: '传统封测（辛苦钱）' });
eq(ctx('DB.industries.list[0].health.qtySelf'), 70, 'healthSet 数字化数量自给率');
eq(ctx('DB.industries.list[0].health.smile'), '传统封测（辛苦钱）', 'healthSet 写微笑曲线定位');
MOD.actions['ind.tamDel']({ dataset: { id: 's1', i: '0' } });
eq(ctx('DB.industries.list[0].health.tam.length'), 0, 'tamDel 删除行');
// 详情页渲染包含做体检三块
MOD.actions['ind.open']({ dataset: { id: 's1' } });
const healthHtml = MOD.render();
ok(healthHtml.indexOf('做体检 · 市场与商业模式') >= 0 && healthHtml.indexOf('市场规模（TAM）') >= 0, '详情页渲染做体检 section');
ok(healthHtml.indexOf('微笑曲线定位') >= 0 && healthHtml.indexOf('中国自给率') >= 0, '三问齐全：TAM / 自给率 / 微笑曲线');

/* ---------- 看竞争：横向格局 / 护城河两分法 / 综合判定 ---------- */
// MOAT_TYPES 与 starsTxt
eq(Q.MOAT_TYPES.length, 6, 'MOAT_TYPES 六类');
ok(Q.moatType('稀缺产能').real && Q.moatType('稀缺产能').defStars === 4, '稀缺产能 = 真护城河 ★4');
ok(!Q.moatType('努力（无护城河）').real, '努力 = 假护城河');
eq(Q.starsTxt(4), '★★★★', '强度 4 → 四星');
eq(Q.starsTxt(null), '—', '未评强度 → —');
// moatVerdict：真护城河主导 / 含假护城河 / 空
const realMoats = [
  { type:'稀缺产能', strength:4 }, { type:'客户转换成本', strength:4 }, { type:'政策牌照', strength:4 },
];
const mvReal = Q.moatVerdict(realMoats);
ok(mvReal.real === 3 && mvReal.fake === 0 && mvReal.txt.indexOf('✅') >= 0, '三条 ≥3★ 真护城河 → ✅ 结论');
const mvFake = Q.moatVerdict([{ type:'努力（无护城河）', strength:2 }, { type:'稀缺产能', strength:4 }]);
ok(mvFake.fake === 1 && mvFake.txt.indexOf('⚠') >= 0 && mvFake.txt.indexOf('ETF') >= 0, '含假护城河 → ⚠ + ETF 提示');
ok(Q.moatVerdict([{ type:'网络效应/生态', strength:2 }]).txt.indexOf('弱护城河') >= 0, '≤2★ 真类型 → 弱护城河');
eq(Q.moatVerdict([]), null, '无条目 → null');
eq(Q.moatVerdict([{ type:'乱填', strength:4 }]), null, '未知类型被过滤 → null');
// competeInit 结构 + ensure 补齐
const cc = Q.competeInit();
ok(Array.isArray(cc.peers) && Array.isArray(cc.moats) && cc.vertical === '', 'competeInit 默认结构');
ctx('DB.industries.list.forEach(i => { if(i.compete === undefined) i.compete = Q.competeInit(); })');
ok(ctx('DB.industries.list[0].compete') && ctx('Array.isArray(DB.industries.list[0].compete.moats)'), 'ensure 后老条目补齐 compete');
// peerAdd / peerSet / peerDel
MOD.actions['ind.peerAdd']({ dataset: { id: 's1' } });
eq(ctx('DB.industries.list[0].compete.peers.length'), 1, 'peerAdd 新增一行');
MOD.changes['ind.peerSet']({ dataset: { id: 's1', i: '0', k: 'name' }, value: '先进制程代工' });
MOD.changes['ind.peerSet']({ dataset: { id: 's1', i: '0', k: 'pattern' }, value: '极高寡占' });
eq(ctx('DB.industries.list[0].compete.peers[0].pattern'), '极高寡占', 'peerSet 写格局');
MOD.actions['ind.peerDel']({ dataset: { id: 's1', i: '0' } });
eq(ctx('DB.industries.list[0].compete.peers.length'), 0, 'peerDel 删除行');
// moatAdd / moatSet / moatDel
MOD.actions['ind.moatAdd']({ dataset: { id: 's1' } });
MOD.changes['ind.moatSet']({ dataset: { id: 's1', i: '0', k: 'type' }, value: '稀缺产能' });
MOD.changes['ind.moatSet']({ dataset: { id: 's1', i: '0', k: 'strength' }, value: '4' });
eq(ctx('DB.industries.list[0].compete.moats[0].type'), '稀缺产能', 'moatSet 写类型');
eq(ctx('DB.industries.list[0].compete.moats[0].strength'), 4, 'moatSet 数字化强度');
MOD.changes['ind.competeSet']({ dataset: { id: 's1', k: 'vertical' }, value: '产能即话语权：缺口 38%' });
eq(ctx('DB.industries.list[0].compete.vertical'), '产能即话语权：缺口 38%', 'competeSet 写纵向话语权');
MOD.actions['ind.moatDel']({ dataset: { id: 's1', i: '0' } });
eq(ctx('DB.industries.list[0].compete.moats.length'), 0, 'moatDel 删除行');
// 详情页渲染包含看竞争四块
MOD.actions['ind.open']({ dataset: { id: 's1' } });
const compHtml = MOD.render();
ok(compHtml.indexOf('看竞争 · 谁在赚钱') >= 0 && compHtml.indexOf('横向格局') >= 0, '详情页渲染看竞争 section');
ok(compHtml.indexOf('谁有话语权') >= 0 && compHtml.indexOf('护城河评估') >= 0 && compHtml.indexOf('看竞争结论') >= 0, '四块齐全：横向 / 纵向 / 护城河 / 结论');

/* ---------- N. 周期位置综合判断（tamCagr / positionVerdict / ageGaugeHTML） ---------- */
// tamCagr：两点 CAGR（100 → 196 两年 = +40%/年）
const cg = Q.tamCagr({ tam: [{ year: '2023', size: 100 }, { year: '2025', size: 196 }] });
ok(cg && Math.abs(cg.cagr - 40) < 0.01 && cg.from === 2023 && cg.to === 2025, 'tamCagr = (196/100)^(1/2)−1 = 40%/年');
eq(Q.tamCagr({ tam: [{ year: '2025', size: 100 }] }), null, 'TAM 单点 → null（算不了 CAGR）');
eq(Q.tamCagr({ tam: [{ year: '2025', size: null }, { year: '2024', size: 50 }] }), null, 'TAM 缺数值 → null');
eq(Q.tamCagr({ tam: [{ year: '2025', size: 100 }, { year: '2025', size: 120 }] }), null, '年份相同 → null');
// positionVerdict：未填当前值 → null
eq(Q.positionVerdict({}, {}), null, '未填当前值 → 无综合判断');
// positionVerdict：加速段 + 陡峭爬坡 + TAM + 自给率悖论 合成
const pvA = Q.positionVerdict(
  { metric: '国产化率', rate: 28, rateYear: '2025', prevRate: 21, prevYear: '2024' },
  { tam: [{ year: '2023', size: 100 }, { year: '2025', size: 150 }], qtySelf: 70, valSelf: 27 });
ok(pvA && pvA.stage.key === 'growth', '28% → 成长期加速段');
ok(pvA.parts.length >= 3, '综合判断含 阶段/爬坡/TAM/自给率 多个维度');
ok(pvA.parts.some(p => p.indexOf('+22.5%') >= 0), 'TAM 年化 +22.5%（sqrt(150/100)−1）纳入判断');
ok(pvA.parts.some(p => p.indexOf('稳步爬坡') >= 0), '年化 +7pct/年（3≤7<8）→ 稳步爬坡');
ok(pvA.con.indexOf('黄金介入') >= 0, '加速段结论 = 黄金介入区间');
// 斜率放缓路径：40–70% 段 + 低斜率 → 主升浪后段提示
const pvB = Q.positionVerdict({ metric: '国产化率', rate: 55, rateYear: '2025', prevRate: 52, prevYear: '2024' }, {});
ok(pvB && pvB.stage.key === 'growth2' && pvB.con.indexOf('主升浪后段') >= 0, '55% 且年化 +3pct → 成长中后段结论');
// 爬坡为负 → 逻辑受损提示
const pvC = Q.positionVerdict({ metric: '国产化率', rate: 30, rateYear: '2025', prevRate: 35, prevYear: '2024' }, {});
ok(pvC && pvC.parts.some(p => p.indexOf('不升反降') >= 0), '30% < 上期 35% → 「不升反降」警示');
// ageGaugeHTML：含当前值标记；未填值返回空
const gauge = Q.ageGaugeHTML({ metric: '国产化率', rate: 28 });
ok(gauge.indexOf('28%') >= 0 && gauge.indexOf('加速段') >= 0, '标尺渲染当前值 28% 与分段标签');
eq(Q.ageGaugeHTML({}), '', '未填当前值 → 无标尺');
ok(Q.ageGaugeHTML({ rate: 28, prevRate: 21, target: 70 }).indexOf('title="上期 21%"') >= 0, '标尺含上期标记');

/* ---------- N+1. AI 预填草稿导入（只填空 + pending 标记 + 编辑即确认） ---------- */
// 用 indInit 建完整条目（renderDetail 依赖全部字段），再覆盖测试关注项
const pfInd = Q.indInit('测试行业');
pfInd.id = 'pf1';
// 用户已有值（不得覆盖）
pfInd.age.rate = 21; pfInd.age.rateYear = '2024';
const draft = {
  version: 1, industry: '测试行业',
  sources: { 'age.rate': 'SEMI', 'age.rateYear': 'SEMI', 'age.prevRate': 'SEMI', 'health.qtySelf': '海关总署', 'age.tracks': 'AI 整理' },
  prefill: {
    age: { metric: '', rate: 35, rateYear: '2025', prevRate: 21, prevYear: '2023' },
    ageTracks: [{ name: '刻蚀设备', rate: 30, prevRate: 18, note: '加速段' }],
    health: { tam: [], qtySelf: 70, valSelf: 27, selfNote: '按块数口径' },
    industry: { chain: '上游设备', lifecycle: '', policy: '', prosperityNote: '' },
  },
};
const r1 = Q.applyPrefill(pfInd, draft);
ok(r1.filled.indexOf('age.prevRate') >= 0 && r1.filled.indexOf('age.prevYear') >= 0, '空字段被填入');
ok(r1.skipped.some(s => s.indexOf('age.rate') === 0 && s.indexOf('已有值') >= 0), '已有值 age.rate 被跳过（绝不覆盖）');
eq(pfInd.age.rate, 21, 'age.rate 仍是用户原值 21');
eq(pfInd.age.rateYear, '2024', 'age.rateYear 仍是用户原值 2024');
eq(pfInd.age.prevRate, 21, '草稿 prevRate=21 填入空字段');
ok(pfInd.health.qtySelf === 70 && pfInd.health.valSelf === 27, '自给率两个口径填入');
ok(pfInd.health.tam.length === 0, '草稿 TAM 为空数组 → 不写入也不报错');
ok(pfInd.age.tracks.length === 1 && pfInd.age.tracks[0].name === '刻蚀设备', '赛道整组写入空数组');
ok(pfInd.prefill && pfInd.prefill.fields['age.prevRate'] && pfInd.prefill.fields['age.prevRate'].source === 'SEMI', 'pending 标记带来源');
ok(Q.pfCount(pfInd) >= 6, '待确认计数 = 已填字段数');
// badge：有预填显示 🤖；无预填字段返回空串
ok(Q.pfBadge(pfInd, 'age.prevRate').indexOf('🤖') >= 0, '待确认字段渲染 🤖 徽章');
eq(Q.pfBadge(pfInd, 'age.rate'), '', '用户自己填的字段无徽章');
// 再次导入：值不被覆盖（幂等）
const r2 = Q.applyPrefill(pfInd, { prefill: { age: { prevRate: 99, target: 80 }, health: {} } });
eq(pfInd.age.prevRate, 21, '二次导入不覆盖已预填值');
ok(r2.filled.indexOf('age.target') >= 0, '二次导入只补新的空字段（target=80）');
// 无效草稿
ok(Q.applyPrefill(pfInd, {}).invalid !== '', '非草稿 JSON → invalid 报错不崩');
ok(Q.applyPrefill(pfInd, null).invalid !== '', 'null 草稿 → invalid 不崩');
// 编辑即确认：ageSet 清对应标记（把 pfInd 挂进沙箱 DB 供 findInd 查找）
MOD.actions['ind.open']({ dataset: { id: 'pf1' } });
sb.DB.industries.list.push(pfInd);
const beforeCnt = Q.pfCount(pfInd);
MOD.changes['ind.ageSet']({ dataset: { id: 'pf1', k: 'prevRate' }, value: '22' });
eq(pfInd.age.prevRate, 22, 'ageSet 写入新值');
ok(Q.pfCount(pfInd) === beforeCnt - 1, '编辑 prevRate → 该项 pending 标记清除（人工确认）');
ok(Q.pfBadge(pfInd, 'age.prevRate') === '', '确认后徽章消失');
// healthSet / tamSet 同理
MOD.changes['ind.healthSet']({ dataset: { id: 'pf1', k: 'qtySelf' }, value: '72' });
ok(Q.pfBadge(pfInd, 'health.qtySelf') === '', 'healthSet 编辑 → 自给率标记清除');
// 全部确认
MOD.actions['ind.prefillClear']({ dataset: { id: 'pf1' } });
ok(!pfInd.prefill && Q.pfCount(pfInd) === 0, '「✓ 全部确认」清除全部标记');
// 详情页渲染：定年纪头部出现导入预填按钮
const pfHtml = MOD.render();
ok(pfHtml.indexOf('🤖 导入预填') >= 0, '详情页定年纪含「🤖 导入预填」按钮');
ok(pfHtml.indexOf('🧭 周期位置综合判断') >= 0, '定年纪渲染周期位置综合判断');
ok(pfHtml.indexOf('title="上期 22%"') >= 0, '定年纪渲染生命周期标尺（含上期标记，编辑后为 22%）');

/* ---------- 结果 ---------- */
console.log('\n== ' + passed + ' passed, ' + failed + ' failed ==');
process.exit(failed ? 1 : 0);
