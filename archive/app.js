
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
  root.querySelectorAll('.math-tex').forEach(el => {
    const tex = decodeURIComponent(el.dataset.tex || '');
    if(window.katex){
      try { katex.render(tex, el, { displayMode: el.classList.contains('math-block'), throwOnError: false }); return; } catch(e){}
    }
    el.textContent = tex; el.classList.add('math-fallback');
  });
}

/* ================= 数据 ================= */
const LS_KEY = 'goalTracker.v1';
function seed(){
  return {
    fitness: {
      weekStart: mondayStr(),
      weekPlan: [
        { day:'周一', plan:'推（胸 + 肩前束 + 三头）40min + 爬坡 20min', done:false },
        { day:'周二', plan:'拉（背 + 肩后束 + 二头）40min + 爬坡 20min', done:false },
        { day:'周三', plan:'肩日强化：侧平举 3 组起步（倒三角重点）+ 游泳 zone2 30min', done:false },
        { day:'周四', plan:'腿（深蹲 / 硬拉变式）40min + 爬坡 20min', done:false },
        { day:'周五', plan:'肩背强化日 + HIIT 10min', done:false },
        { day:'周六', plan:'游泳 / 户外有氧 zone2（顺便打鸟）', done:false },
        { day:'周日', plan:'休息复盘 · 记录体重与体脂', done:false }
      ],
      diet: [
        { id:uid(), text:'早餐：奥乐齐组装（粗粮 + 高蛋白）', done:false },
        { id:uid(), text:'午餐：外卖健康餐（400–600kcal、蛋白 ≥35g、酱料减半）', done:false },
        { id:uid(), text:'晚餐：奥乐齐即食（鸡胸 + 玉米 + 小番茄）', done:false },
        { id:uid(), text:'练后：蛋白粉', done:false },
        { id:uid(), text:'全天约 2050kcal · 蛋白 175g · 戒糖戒酒 · 睡眠 7–8h', done:false }
      ],
      shopping: [
        { id:uid(), text:'真空即食鸡胸肉（蛋白 ≥15g/100g、脂肪 ≤5g/100g）', done:false },
        { id:uid(), text:'玉米 / 粗粮主食', done:false },
        { id:uid(), text:'小番茄 / 黄瓜', done:false },
        { id:uid(), text:'鸡蛋', done:false },
        { id:uid(), text:'无糖酸奶 / 牛奶', done:false },
        { id:uid(), text:'蛋白粉补货', done:false }
      ],
      logs: [
        { id:uid(), date:dateStr(), tag:'结果', text:'**起始数据**：183cm / 83kg / BMI 24.8 / 体脂 23%（瘦体重 64kg）。\n\n**目标**：倒三角 + 腹肌 + 薄肌美感，先减脂塑形。\n\n- 热量：约 $2050\\,kcal/天$（缺口约 500）\n- 蛋白 $175\\,g$ · 碳水 ×2.2g · 脂肪 ×0.8g\n- 三餐不开火：早餐奥乐齐组装 + 午餐外卖健康餐 + 晚餐奥乐齐即食' }
      ]
    },
    job: {
      daily: [
        { id:uid(), date:dateStr(), content:'示例：用 STAR 法则整理 2 条项目经历', done:false }
      ],
      plan: [
        { id:uid(), text:'刷题：数组 / 哈希表 10 题', done:false },
        { id:uid(), text:'刷题：双指针 / 滑动窗口 10 题', done:false },
        { id:uid(), text:'整理自我介绍（1 分钟 & 3 分钟版）', done:false },
        { id:uid(), text:'梳理 3 个重点项目（STAR 表述）', done:false },
        { id:uid(), text:'模拟面试 1 次并复盘', done:false }
      ],
      questions: [
        { id:uid(), title:'请做一下自我介绍', tag:'行为面试', created:dateStr(),
          content:'**结构**：现状 → 亮点经历 → 匹配点 → 收尾表达意愿。\n\n> 控制在 90 秒以内，突出与岗位最相关的 2 件事。' },
        { id:uid(), title:'二分查找的时间复杂度？', tag:'算法', created:dateStr(),
          content:'每次折半，复杂度为：\n\n$$T(n)=T(n/2)+O(1)=O(\\log n)$$\n\n代码模板：\n```\nwhile (lo <= hi) {\n  mid = (lo + hi) >> 1;\n  ...\n}\n```' }
      ],
      topics: [
        { id:uid(), name:'多路召回（协同过滤 / 向量召回 / 图召回）', cat:'推荐算法', level:60, note:'召回层决定天花板。重点：双塔模型、ANN 检索（FAISS / HNSW）、多路融合策略。' },
        { id:uid(), name:'精排模型（LR / FM / DeepFM / 双塔）', cat:'推荐算法', level:55, note:'精排核心。掌握 FM 如何解决稀疏特征交叉，DeepFM 结构，以及多目标排序（ESMM / MMoE）。' },
        { id:uid(), name:'重排与多样性（DPP / MMR / 业务约束）', cat:'推荐算法', level:30, note:'兼顾点击率与用户体验，避免信息茧房。' },
        { id:uid(), name:'特征工程与 Embedding', cat:'推荐算法', level:65, note:'特征交叉、特征重要性、embedding 训练与上线一致性（线上线下一致）。' },
        { id:uid(), name:'用户画像与标签体系', cat:'推荐算法', level:50, note:'人群分层、兴趣标签、长短期兴趣建模。' },
        { id:uid(), name:'冷启动问题', cat:'推荐算法', level:35, note:'新用户 / 新物料：基于内容、探索利用（EE）、流量扶持策略。' },
        { id:uid(), name:'机器学习基础（LR / GBDT / 树模型）', cat:'机器学习', level:70, note:'XGBoost / LightGBM 原理与调参，偏差方差权衡。' },
        { id:uid(), name:'深度学习（DNN / Transformer / 序列建模）', cat:'机器学习', level:50, note:'序列推荐中的 Transformer / DIN / DIEN，注意力机制。' },
        { id:uid(), name:'Spark / Flink 离线实时计算', cat:'大数据与工程', level:45, note:'离线特征生产、实时流处理、数据一致性。' },
        { id:uid(), name:'A/B 实验与评估指标', cat:'系统与架构', level:60, note:'置信区间、显著性检验、核心指标（CTR / 时长 / 留存）设计。' },
        { id:uid(), name:'推荐服务高并发架构', cat:'系统与架构', level:40, note:'召回→排序→重排的在线服务链路、缓存、降级。' },
        { id:uid(), name:'系统设计（高可用 / 可扩展）', cat:'系统与架构', level:35, note:'限流、熔断、分库分表、缓存策略。' },
        { id:uid(), name:'SQL 与数仓查询', cat:'编程语言', level:75, note:'复杂窗口函数、拉链表、留存分析 SQL。' },
        { id:uid(), name:'Python 工程化', cat:'编程语言', level:70, note:'pandas / numpy / 特征脚本、代码规范与可维护性。' }
      ],
      targets: [
        { id:uid(), company:'某头部内容平台', role:'推荐算法工程师', status:'一面', deadline:'', note:'重点准备召回与排序的深度模型，复盘上个项目 AB 指标提升。' },
        { id:uid(), company:'某电商独角兽', role:'算法工程师（推荐方向）', status:'已投递', deadline:'', note:'关注电商场景下的多目标与冷启动。' },
        { id:uid(), company:'某 AI 实验室', role:'机器学习工程师', status:'想投', deadline:'', note:'偏研究，准备论文与项目深度。' }
      ]
    },
    reading: {
      notes: [
        { id:uid(), book:'原子习惯', theme:'习惯养成', title:'微小的 1% 改进', created:dateStr(),
          content:'每天进步 1%，一年约提升 $1.01^{365} \\approx 37.8$ 倍。\n\n- 习惯四定律：提示、渴求、反应、奖励\n- 让它显而易见、有吸引力、简便易行、令人满足' }
      ]
    },
    side: {
      projects: [
        { id:uid(), title:'太湖打鸟摄影攻略', category:'摄影', status:'进行中',
          desc:'佳能 EOS R7，太湖沿岸水鸟拍摄 + 参数记录，产出小红书攻略。',
          updates:[{ id:uid(), date:dateStr(), note:'确定周六发布节奏，整理第一批样片。' }] },
        { id:uid(), title:'Godot 独立游戏开发', category:'游戏开发', status:'进行中',
          desc:'AI + Godot 独立游戏，Build in Public 记录开发过程。',
          updates:[{ id:uid(), date:dateStr(), note:'搭建项目骨架，确定周日发布节奏。' }] }
      ]
    },
    valuation: {
      seedDataVersion: 3,
      customMetrics: [],
      companies: [
        { id:uid(), name:'寒武纪', ticker:'688256.SH', market:'A股', sector:'半导体AI芯片', currency:'CNY', currentPrice:1200,
          note:'国产AI芯片龙头。思元系列云端训练/推理芯片，受益大模型算力需求爆发。2025年首次全年盈利。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:0.26, netProfit:-2.27, grossMargin:57.61, opCashFlow:-2.34, assetLiabRatio:9.1, roe:-4.09, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:0.39, netProfit:-3.03, grossMargin:66.08, opCashFlow:-3.97, assetLiabRatio:13.7, roe:-5.72, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:1.21, netProfit:-1.94, grossMargin:51.2, opCashFlow:-11.78, assetLiabRatio:15.6, roe:-3.77, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:9.89, netProfit:2.72, grossMargin:56.99, opCashFlow:1.92, assetLiabRatio:19.2, roe:5.01, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:11.11, netProfit:3.55, grossMargin:55.99, opCashFlow:-13.99, assetLiabRatio:16.0, roe:6.08, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:17.69, netProfit:6.83, grossMargin:55.88, opCashFlow:23.11, assetLiabRatio:19.7, roe:10.1, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:17.27, netProfit:5.67, grossMargin:54.24, opCashFlow:-9.4, assetLiabRatio:10.1, roe:5.01, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:18.9, netProfit:4.55, grossMargin:54.81, opCashFlow:-4.69, assetLiabRatio:11.9, roe:3.84, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:28.85, netProfit:10.13, grossMargin:54.33, opCashFlow:8.34, assetLiabRatio:16.4, roe:7.87, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中际旭创', ticker:'300308.SZ', market:'A股', sector:'光模块', currency:'CNY', currentPrice:165,
          note:'全球光模块龙头。800G/1.6T高速光模块量产，受益AI算力网络建设。毛利率持续提升。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:48.43, netProfit:10.09, grossMargin:32.76, opCashFlow:6.51, assetLiabRatio:25.4, roe:6.06, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:59.56, netProfit:13.49, grossMargin:33.44, opCashFlow:3.18, assetLiabRatio:29.8, roe:7.87, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:65.14, netProfit:13.94, grossMargin:33.64, opCashFlow:3.48, assetLiabRatio:31.1, roe:7.46, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:65.5, netProfit:14.19, grossMargin:35.08, opCashFlow:18.49, assetLiabRatio:29.7, roe:6.99, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:66.74, netProfit:15.83, grossMargin:36.7, opCashFlow:21.64, assetLiabRatio:30.4, roe:7.2, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:81.15, netProfit:24.12, grossMargin:41.49, opCashFlow:10.54, assetLiabRatio:30.3, roe:9.95, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:102.16, netProfit:31.37, grossMargin:42.79, opCashFlow:22.36, assetLiabRatio:29.5, roe:11.2, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:132.35, netProfit:36.65, grossMargin:44.48, opCashFlow:54.41, assetLiabRatio:30.2, roe:11.59, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:194.96, netProfit:57.35, grossMargin:46.06, opCashFlow:33.68, assetLiabRatio:32.6, roe:15.05, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'新易盛', ticker:'300502.SZ', market:'A股', sector:'光模块', currency:'CNY', currentPrice:280,
          note:'高速光模块第二梯队龙头。净利率行业领先，800G/1.6T产品放量。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:11.13, netProfit:3.25, grossMargin:42.0, opCashFlow:1.65, assetLiabRatio:21.2, roe:5.61, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:16.15, netProfit:5.41, grossMargin:43.76, opCashFlow:-4.56, assetLiabRatio:24.8, roe:8.67, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:24.03, netProfit:7.81, grossMargin:41.53, opCashFlow:5.75, assetLiabRatio:27.9, roe:11.03, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:35.16, netProfit:11.92, grossMargin:48.19, opCashFlow:3.56, assetLiabRatio:32.1, roe:14.31, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:40.52, netProfit:15.73, grossMargin:48.66, opCashFlow:1.99, assetLiabRatio:33.1, roe:15.84, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:63.85, netProfit:23.7, grossMargin:46.64, opCashFlow:7.54, assetLiabRatio:33.1, roe:19.6, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:60.68, netProfit:23.85, grossMargin:46.94, opCashFlow:36.85, assetLiabRatio:32.0, roe:16.42, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:83.37, netProfit:32.05, grossMargin:48.91, opCashFlow:30.64, assetLiabRatio:30.2, roe:17.74, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:83.38, netProfit:27.8, grossMargin:49.16, opCashFlow:6.84, assetLiabRatio:31.0, roe:13.56, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'澜起科技', ticker:'688008.SH', market:'A股', sector:'内存接口芯片', currency:'CNY', currentPrice:85,
          note:'内存接口芯片全球龙头。DDR5渗透率提升+MRCD/MDB/PCIe Retimer新品放量，毛利率突破70%。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:7.37, netProfit:2.23, grossMargin:57.7, opCashFlow:3.55, assetLiabRatio:4.6, roe:2.18, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:9.28, netProfit:3.7, grossMargin:57.83, opCashFlow:4.65, assetLiabRatio:4.6, roe:3.64, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:9.06, netProfit:3.85, grossMargin:58.74, opCashFlow:4.41, assetLiabRatio:5.7, roe:3.65, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:10.68, netProfit:4.34, grossMargin:58.17, opCashFlow:4.31, assetLiabRatio:6.7, roe:3.81, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:12.22, netProfit:5.25, grossMargin:60.45, opCashFlow:1.88, assetLiabRatio:5.7, roe:4.4, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:14.11, netProfit:6.34, grossMargin:60.43, opCashFlow:8.7, assetLiabRatio:6.4, roe:5.26, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:14.24, netProfit:4.73, grossMargin:63.34, opCashFlow:5.42, assetLiabRatio:10.9, roe:3.86, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:13.99, netProfit:6.03, grossMargin:64.46, opCashFlow:4.21, assetLiabRatio:6.4, roe:4.68, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:14.61, netProfit:8.47, grossMargin:69.79, opCashFlow:6.27, assetLiabRatio:4.2, roe:4.08, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'海光信息', ticker:'688041.SH', market:'A股', sector:'CPU/DCU', currency:'CNY', currentPrice:140,
          note:'国产CPU/DCU双龙头。x86架构CPU+AI加速芯片，受益国产替代。研发费用率近30%。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:15.92, netProfit:2.89, grossMargin:62.87, opCashFlow:-0.68, assetLiabRatio:10.9, roe:1.39, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:21.71, netProfit:5.65, grossMargin:63.83, opCashFlow:-0.45, assetLiabRatio:12.9, roe:2.67, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:23.74, netProfit:6.72, grossMargin:69.13, opCashFlow:5.12, assetLiabRatio:18.6, roe:3.05, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:30.26, netProfit:4.05, grossMargin:59.84, opCashFlow:5.79, assetLiabRatio:20.7, roe:1.79, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:24.0, netProfit:5.06, grossMargin:61.19, opCashFlow:25.22, assetLiabRatio:24.6, roe:2.16, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:30.64, netProfit:6.96, grossMargin:59.33, opCashFlow:-3.45, assetLiabRatio:25.8, roe:2.91, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:40.26, netProfit:7.6, grossMargin:60.03, opCashFlow:0.78, assetLiabRatio:24.1, roe:3.02, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:48.87, netProfit:5.83, grossMargin:53.42, opCashFlow:-1.58, assetLiabRatio:27.1, roe:2.25, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:40.34, netProfit:6.87, grossMargin:55.6, opCashFlow:0.68, assetLiabRatio:22.8, roe:2.53, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中科曙光', ticker:'603019.SH', market:'A股', sector:'算力服务器', currency:'CNY', currentPrice:75,
          note:'国产算力服务器龙头。中科院系，海光信息大股东。布局智算中心+液冷。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:24.79, netProfit:1.43, grossMargin:26.85, opCashFlow:-4.94, assetLiabRatio:38.5, roe:0.73, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:32.33, netProfit:4.21, grossMargin:25.78, opCashFlow:-4.4, assetLiabRatio:38.2, roe:2.12, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:23.29, netProfit:2.06, grossMargin:28.2, opCashFlow:-3.43, assetLiabRatio:38.6, roe:1.03, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:51.06, netProfit:11.42, grossMargin:32.86, opCashFlow:39.99, assetLiabRatio:41.8, roe:5.35, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:25.86, netProfit:1.86, grossMargin:26.07, opCashFlow:-11.18, assetLiabRatio:41.2, roe:0.88, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:32.64, netProfit:5.42, grossMargin:27.11, opCashFlow:-2.64, assetLiabRatio:40.7, roe:2.5, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:29.7, netProfit:2.37, grossMargin:20.13, opCashFlow:0.86, assetLiabRatio:40.7, roe:1.08, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:61.43, netProfit:12.1, grossMargin:39.38, opCashFlow:26.09, assetLiabRatio:43.7, roe:5.25, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:31.99, netProfit:2.28, grossMargin:26.56, opCashFlow:-13.91, assetLiabRatio:41.1, roe:0.98, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中微公司', ticker:'688012.SH', market:'A股', sector:'半导体设备', currency:'CNY', currentPrice:220,
          note:'刻蚀设备龙头。CCP/ICP刻蚀+薄膜设备，受益晶圆厂扩产。研发投入大增。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:16.05, netProfit:2.49, grossMargin:42.51, opCashFlow:-5.86, assetLiabRatio:19.9, roe:1.39, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:18.43, netProfit:2.68, grossMargin:40.28, opCashFlow:9.68, assetLiabRatio:25.0, roe:1.47, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:20.59, netProfit:3.96, grossMargin:43.73, opCashFlow:-1.14, assetLiabRatio:25.8, roe:2.11, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:35.58, netProfit:7.03, grossMargin:39.26, opCashFlow:11.91, assetLiabRatio:24.7, roe:3.56, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:21.73, netProfit:3.13, grossMargin:41.54, opCashFlow:3.77, assetLiabRatio:25.7, roe:1.55, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:27.87, netProfit:3.93, grossMargin:38.54, opCashFlow:-1.74, assetLiabRatio:26.6, roe:1.89, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:31.02, netProfit:5.05, grossMargin:37.89, opCashFlow:10.95, assetLiabRatio:28.0, roe:2.36, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:43.22, netProfit:9.0, grossMargin:39.29, opCashFlow:9.97, assetLiabRatio:23.8, roe:3.96, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:29.15, netProfit:9.3, grossMargin:39.89, opCashFlow:-1.59, assetLiabRatio:22.2, roe:3.82, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'中芯国际', ticker:'688981.SH', market:'A股', sector:'晶圆代工', currency:'CNY', currentPrice:95,
          note:'大陆晶圆代工龙头。成熟制程为主，产能利用率93%+。A股按CAS人民币列报，港股按IFRS美元列报。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:125.94, netProfit:5.09, grossMargin:14.19, opCashFlow:35.67, assetLiabRatio:36.0, roe:0.23, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:136.76, netProfit:11.37, grossMargin:13.65, opCashFlow:-3.2, assetLiabRatio:34.6, roe:0.52, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:156.09, netProfit:10.6, grossMargin:23.92, opCashFlow:90.18, assetLiabRatio:33.4, roe:0.48, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:159.17, netProfit:9.92, grossMargin:21.09, opCashFlow:103.94, assetLiabRatio:35.2, roe:0.43, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:163.01, netProfit:13.56, grossMargin:23.1, opCashFlow:-11.72, assetLiabRatio:32.8, roe:0.59, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:160.47, netProfit:9.44, grossMargin:20.7, opCashFlow:70.69, assetLiabRatio:33.8, roe:0.4, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:171.62, netProfit:15.17, grossMargin:25.49, opCashFlow:63.9, assetLiabRatio:33.1, roe:0.65, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:178.13, netProfit:12.23, grossMargin:17.38, opCashFlow:77.93, assetLiabRatio:33.0, roe:0.5, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:176.17, netProfit:13.61, grossMargin:21.48, opCashFlow:51.32, assetLiabRatio:34.9, roe:0.55, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'北方华创', ticker:'002371.SZ', market:'A股', sector:'半导体设备', currency:'CNY', currentPrice:430,
          note:'国内半导体设备平台型龙头。刻蚀/PVD/CVD/氧化/退火全品类，受益国产替代+晶圆厂扩产。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:59.51, netProfit:11.39, grossMargin:43.97, opCashFlow:2.36, assetLiabRatio:53.7, roe:4.37, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:65.13, netProfit:16.51, grossMargin:47.34, opCashFlow:-5.49, assetLiabRatio:53.5, roe:5.92, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:80.68, netProfit:16.77, grossMargin:42.24, opCashFlow:7.32, assetLiabRatio:52.9, roe:5.61, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:95.43, netProfit:11.54, grossMargin:39.87, opCashFlow:11.33, assetLiabRatio:51.0, roe:3.55, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:82.06, netProfit:15.81, grossMargin:43.02, opCashFlow:-17.29, assetLiabRatio:50.0, roe:4.63, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:79.36, netProfit:16.27, grossMargin:41.29, opCashFlow:-14.63, assetLiabRatio:52.5, roe:4.06, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:111.6, netProfit:19.22, grossMargin:40.31, opCashFlow:6.25, assetLiabRatio:50.9, roe:4.56, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:120.52, netProfit:3.92, grossMargin:37.15, opCashFlow:47.0, assetLiabRatio:51.1, roe:0.89, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:103.23, netProfit:16.35, grossMargin:40.77, opCashFlow:7.48, assetLiabRatio:50.0, roe:3.59, note:'' }
          ],
          valuations:[],
          investments:[] },
        { id:uid(), name:'兆易创新', ticker:'603986.SH', market:'A股', sector:'半导体存储+MCU', currency:'CNY', currentPrice:115,
          note:'国产存储+MCU双轮驱动。NOR Flash全球第三，DRAM自研突破。MCU切入车规、工业。',
          financials:[
            { id:uid(), quarter:'2024Q1', revenue:16.27, netProfit:2.05, grossMargin:38.16, opCashFlow:6.27, assetLiabRatio:10.1, roe:1.34, note:'' },
            { id:uid(), quarter:'2024Q2', revenue:19.82, netProfit:3.12, grossMargin:38.15, opCashFlow:6.21, assetLiabRatio:10.3, roe:2.0, note:'' },
            { id:uid(), quarter:'2024Q3', revenue:20.41, netProfit:3.15, grossMargin:41.77, opCashFlow:6.08, assetLiabRatio:11.9, roe:1.97, note:'' },
            { id:uid(), quarter:'2024Q4', revenue:17.06, netProfit:2.7, grossMargin:33.17, opCashFlow:1.75, assetLiabRatio:13.3, roe:1.62, note:'' },
            { id:uid(), quarter:'2025Q1', revenue:19.09, netProfit:2.35, grossMargin:37.44, opCashFlow:3.36, assetLiabRatio:12.8, roe:1.38, note:'' },
            { id:uid(), quarter:'2025Q2', revenue:22.41, netProfit:3.41, grossMargin:37.01, opCashFlow:6.22, assetLiabRatio:11.9, roe:1.96, note:'' },
            { id:uid(), quarter:'2025Q3', revenue:26.81, netProfit:5.08, grossMargin:40.72, opCashFlow:8.38, assetLiabRatio:11.4, roe:2.76, note:'' },
            { id:uid(), quarter:'2025Q4', revenue:23.72, netProfit:5.65, grossMargin:44.91, opCashFlow:3.33, assetLiabRatio:10.2, roe:2.94, note:'' },
            { id:uid(), quarter:'2026Q1', revenue:41.88, netProfit:14.61, grossMargin:57.08, opCashFlow:17.83, assetLiabRatio:8.1, roe:5.73, note:'' }
          ],
          valuations:[],
          investments:[] }
      ]
    },
    meta: { created: dateStr(), updated: new Date().toISOString(), fresh: true }
  };
}
function ensure(db){
  const s = seed();
  db.fitness  = db.fitness  || s.fitness;
  db.job      = db.job      || s.job;
  db.reading  = db.reading  || s.reading;
  db.side     = db.side     || s.side;
  db.valuation = db.valuation || s.valuation;
  db.fitness.weekPlan  = db.fitness.weekPlan  || [];
  db.fitness.diet      = db.fitness.diet      || [];
  db.fitness.shopping  = db.fitness.shopping  || [];
  db.fitness.logs      = db.fitness.logs      || [];
  db.job.daily     = db.job.daily     || [];
  db.job.plan      = db.job.plan      || [];
  db.job.questions = db.job.questions || [];
  db.job.topics    = db.job.topics    || s.job.topics;     // 旧数据注入默认学习主题
  db.job.targets   = db.job.targets   || s.job.targets;    // 旧数据注入默认求职目标
  db.reading.notes   = db.reading.notes   || [];
  db.side.projects  = db.side.projects  || [];
  db.valuation.companies = db.valuation.companies || [];
  db.valuation.customMetrics = db.valuation.customMetrics || [];
  db.valuation.hiddenSeeds = db.valuation.hiddenSeeds || []; // 用户主动删除过的种子 ticker，确保不再加回
  db.valuation.seedDataVersion = db.valuation.seedDataVersion || 0;
  // 迁移：把种子里的新示例公司合并进已有数据（按 ticker 去重，不覆盖用户已有内容，不重复加回用户已删除的）
  if(s.valuation && s.valuation.companies){
    const seedVer = s.valuation.seedDataVersion || 0;
    const needUpdate = db.valuation.seedDataVersion < seedVer;
    s.valuation.companies.forEach(seedCo => {
      const ticker = seedCo.ticker;
      if(!ticker) return;
      if(db.valuation.hiddenSeeds.includes(ticker)) return;
      const existing = db.valuation.companies.find(c => c.ticker === ticker);
      if(existing){
        existing.seed = true;
        if(needUpdate && seedCo.financials){
          existing.financials = seedCo.financials;
          existing.note = seedCo.note || existing.note;
          existing.currentPrice = seedCo.currentPrice || existing.currentPrice;
        }
      } else {
        db.valuation.companies.push({...seedCo, seed: true});
      }
    });
    if(needUpdate) db.valuation.seedDataVersion = seedVer;
  }
  if(s.valuation && s.valuation.customMetrics){
    s.valuation.customMetrics.forEach(seedCm => {
      if(!db.valuation.customMetrics.some(cm => cm.key === seedCm.key)){
        db.valuation.customMetrics.push(seedCm);
      }
    });
  }
  db.meta = db.meta || {};
  return db;
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
    if(d && d.fitness && d.job && d.reading && d.side){
      return ensure(d);
    }
  } catch(e){ console.warn('IndexedDB 读取失败:', e); }

  // 2. 尝试 fetch 同目录 JSON（首次使用 / 新设备）
  try {
    const resp = await fetch('./goal-tracker-data.json?t=' + Date.now());
    if(resp.ok){
      const d = await resp.json();
      if(d && d.fitness && d.job && d.reading && d.side){
        await idbSet('data', d);
        return ensure(d);
      }
    }
  } catch(e){}

  // 3. 回退到 localStorage（兼容旧数据）
  try {
    const raw = localStorage.getItem(LS_KEY);
    if(raw){
      const d = JSON.parse(raw);
      if(d && d.fitness && d.job && d.reading && d.side){
        await idbSet('data', d);
        return ensure(d);
      }
    }
  } catch(e){}

  // 4. 使用种子数据
  return seed();
}

let saveTimer = null;
function save(){
  if(!appReady) return;
  DB.meta = DB.meta || {};
  DB.meta.updated = new Date().toISOString();
  DB.meta.fresh = false;
  localStorage.setItem(LS_KEY, JSON.stringify(DB));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try { await idbSet('data', DB); } catch(e){ console.error('IndexedDB 写入失败:', e); }
  }, 300);
}

function updateSyncUI(){
  const box = document.getElementById('sync-box');
  if(!box) return;
  let html = '<div class="sync-row"><span class="sync-dot on"></span><b>数据已自动保存</b></div>';
  html += '<div class="side-note" style="font-size:10px;margin-top:4px">IndexedDB 本地存储 · 定期「⬇ 导出备份」到同步盘</div>';
  box.innerHTML = html;
}

const state = { view:'dashboard', jobQ:'', jobTag:'全部', jobTopicCat:'全部', jobTargetStatus:'全部', readBook:'全部', readTheme:'全部', readQ:'', sideStatus:'全部', valMarket:'全部', valCompanyId:null, valFinSort:'desc' };

/* ================= 通用渲染片段 ================= */
function ring(pct, color, size){
  size = size || 112;
  const r = 52, c = 2 * Math.PI * r, off = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return '<div class="ring-wrap" style="width:' + size + 'px;height:' + size + 'px">' +
    '<svg viewBox="0 0 120 120" class="ring-svg">' +
    '<circle cx="60" cy="60" r="' + r + '" fill="none" stroke="#eef0f4" stroke-width="11"/>' +
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

/* ================= 仪表盘 ================= */
function renderDashboard(){
  const f = DB.fitness, j = DB.job;
  const fDone = f.weekPlan.filter(x => x.done).length, fPct = fDone / f.weekPlan.length * 100;
  const jDone = j.plan.filter(x => x.done).length, jPct = j.plan.length / 1 ? jDone / j.plan.length * 100 : 0;
  const skillPct = j.topics.length ? Math.round(j.topics.reduce((s, t) => s + (t.level || 0), 0) / j.topics.length) : 0;
  const activeTargets = j.targets.filter(t => !['offer', '拒信'].includes(t.status)).length;
  const today = f.weekPlan[todayIdx()];
  const todayLog = j.daily.find(x => x.date === dateStr());
  const shopLeft = f.shopping.filter(x => !x.done).length;
  const books = new Set(DB.reading.notes.map(n => n.book)).size;
  const sideActive = DB.side.projects.filter(p => p.status === '进行中').length;
  const sideIdea = DB.side.projects.filter(p => p.status === '灵感').length;
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const yearPct = dayOfYear / 365 * 100;

  let h = '';
  h += '<div class="hero"><h1>' + greet + '，今天也是向上的一天 💪</h1>' +
    '<div class="hero-date">' + fmtCN() + ' · 本周训练 ' + fDone + '/' + f.weekPlan.length + ' · 求职任务 ' + jDone + '/' + j.plan.length + '</div>' +
    '<div class="year-bar">' + progressBar(yearPct) + '<div class="year-text">' + new Date().getFullYear() + ' 年已过去 ' + yearPct.toFixed(1) + '%（第 ' + dayOfYear + ' 天）</div></div></div>';

  // 两大重点卡片
  h += '<div class="dash-grid">';
  h += '<div class="card big-card">' + ring(fPct, 'var(--green)') +
    '<div class="info"><h3><span class="dot" style="background:var(--green);width:8px;height:8px;border-radius:50%;display:inline-block"></span>减脂塑形</h3>' +
    '<div class="stat-line"><span>本周训练</span><b>' + fDone + ' / ' + f.weekPlan.length + ' 天</b></div>' +
    '<div class="stat-line"><span>今日安排</span><b>' + esc(today.plan ? today.plan.slice(0, 14) + (today.plan.length > 14 ? '…' : '') : '未安排') + '</b></div>' +
    '<div class="stat-line"><span>待采购</span><b>' + shopLeft + ' 项</b></div>' +
    '<button class="btn primary sm" style="margin-top:8px" data-action="nav" data-view="fitness">进入 →</button></div></div>';
  h += '<div class="card big-card">' + ring(jPct, 'var(--indigo)') +
    '<div class="info"><h3><span class="dot" style="background:var(--indigo);width:8px;height:8px;border-radius:50%;display:inline-block"></span>求职准备</h3>' +
    '<div class="stat-line"><span>准备任务</span><b>' + jDone + ' / ' + j.plan.length + '</b></div>' +
    '<div class="stat-line"><span>今日记录</span><b>' + (todayLog ? (todayLog.done ? '已完成 ✓' : '已记录') : '未记录') + '</b></div>' +
    '<div class="stat-line"><span>技能掌握</span><b>' + skillPct + '%</b></div>' +
    '<div class="stat-line"><span>求职目标</span><b>' + j.targets.length + ' 个（' + activeTargets + ' 进行中）</b></div>' +
    '<button class="btn primary indigo sm" style="margin-top:8px" data-action="nav" data-view="job">进入 →</button></div></div>';
  h += '</div>';

  // 两个次要卡片
  h += '<div class="dash-grid">';
  h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--amber)"></span>阅读笔记</h2>' +
    '<button class="btn ghost sm" data-action="nav" data-view="reading">进入 →</button></div>' +
    '<div class="stat-line"><span>笔记总数</span><b>' + DB.reading.notes.length + ' 篇</b></div>' +
    '<div class="stat-line"><span>涉及书籍</span><b>' + books + ' 本</b></div></div>';
  h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--pink)"></span>副业探索</h2>' +
    '<button class="btn ghost sm" data-action="nav" data-view="side">进入 →</button></div>' +
    '<div class="stat-line"><span>进行中项目</span><b>' + sideActive + ' 个</b></div>' +
    '<div class="stat-line"><span>灵感储备</span><b>' + sideIdea + ' 个</b></div></div>';
  h += '</div>';

  // 公司估值汇总
  const valCos = DB.valuation.companies;
  let valPos = 0, valCost = 0, valMv = 0;
  valCos.forEach(c => { const p = calcPosition(c.investments||[]); valPos += p.position; valCost += p.cost; valMv += p.position * (c.currentPrice||0); });
  const valPnl = valMv - valCost;
  h += '<div class="dash-grid">';
  h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>公司估值</h2>' +
    '<button class="btn ghost sm" data-action="nav" data-view="valuation">进入 →</button></div>' +
    '<div class="stat-line"><span>关注公司</span><b>' + valCos.length + ' 家</b></div>' +
    (valPos > 0 ? '<div class="stat-line"><span>持仓市值</span><b>' + fmtMoney(valMv) + '</b></div>' +
    '<div class="stat-line"><span>浮动盈亏</span><b class="' + (valPnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(valPnl) + ' (' + fmtPct(valCost > 0 ? valPnl/valCost*100 : 0) + ')</b></div>' : '<div class="stat-line muted">暂无持仓</div>') + '</div>';
  h += '<div class="card"><div class="sec-title"><h2>📌 快速入口</h2></div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn ghost sm" data-action="nav" data-view="fitness">🏋️ 减脂塑形</button>' +
    '<button class="btn ghost sm" data-action="nav" data-view="job">💼 求职准备</button>' +
    '<button class="btn ghost sm" data-action="nav" data-view="reading">📚 阅读笔记</button>' +
    '<button class="btn ghost sm" data-action="nav" data-view="side">💡 副业探索</button>' +
    '<button class="btn ghost sm" data-action="nav" data-view="valuation">📈 公司估值</button></div></div>';
  h += '</div>';

  // 今日聚焦 + 灵感速记
  h += '<div class="dash-grid">';
  h += '<div class="card"><div class="sec-title"><h2>📌 今日聚焦</h2></div><div class="focus-list">';
  h += '<div class="item ' + (today.done ? 'done' : '') + '"><input type="checkbox" data-change="fit.toggleDay" data-i="' + todayIdx() + '" ' + (today.done ? 'checked' : '') + '>' +
    '<div class="txt"><b>今日训练</b> · ' + esc(today.plan || '未安排') + '</div></div>';
  if(todayLog){
    h += '<div class="item ' + (todayLog.done ? 'done' : '') + ' accent-indigo"><input type="checkbox" data-change="job.toggleDaily" data-id="' + todayLog.id + '" ' + (todayLog.done ? 'checked' : '') + '>' +
      '<div class="txt"><b>今日工作</b> · ' + esc(todayLog.content) + '</div></div>';
  } else {
    h += '<form class="quick-row" data-form="job.addDaily" style="padding:11px 2px"><input type="text" name="text" placeholder="记录今天的工作内容…" required autocomplete="off"><button class="btn primary indigo sm" style="flex:none">记录</button></form>';
  }
  if(shopLeft) h += '<div class="item"><div class="txt muted">🛒 采购清单还有 <b>' + shopLeft + '</b> 项未买</div><button class="btn-link" data-action="nav" data-view="fitness">去看看</button></div>';
  // 临近节点提醒（截止日期在 21 天内且仍在进行中）
  const upcoming = j.targets.filter(t => t.deadline && !['offer', '拒信'].includes(t.status))
    .map(t => ({ t, days: Math.round((new Date(t.deadline + 'T00:00:00') - new Date()) / 86400000) }))
    .filter(x => x.days >= 0 && x.days <= 21).sort((a, b) => a.days - b.days);
  upcoming.slice(0, 2).forEach(x => {
    const soon = x.days <= 7;
    h += '<div class="item"><div class="txt">⏰ <b>' + esc(x.t.company) + '</b> · ' + esc(x.t.role || x.t.status) + ' · 还剩 <b' + (soon ? ' style="color:var(--red)"' : '') + '>' + x.days + '</b> 天</div>' +
      '<button class="btn-link" data-action="nav" data-view="job">查看</button></div>';
  });
  h += '</div></div>';
  h += '<div class="card"><div class="sec-title"><h2>💡 灵感速记</h2></div>' +
    '<div class="muted" style="margin-bottom:10px">任何新想法，随手记下来，自动收入「副业探索 · 灵感」。</div>' +
    '<form class="quick-row" data-form="dash.capture"><input type="text" name="text" placeholder="比如：拍一组太湖日出延时…" required autocomplete="off"><button class="btn primary sm" style="flex:none;background:var(--pink)">记下</button></form></div>';
  h += '</div>';
  return h;
}

/* ================= 减脂塑形 ================= */
function renderFitness(){
  const f = DB.fitness;
  const done = f.weekPlan.filter(x => x.done).length, pct = done / f.weekPlan.length * 100;
  const newWeek = f.weekStart !== mondayStr();

  let h = header('🏋️ 减脂塑形', '本周从 ' + f.weekStart + ' 开始 · ' + fmtCN(),
    '<button class="btn ghost" data-action="fit.resetWeek">↻ 开启新一周</button>');
  if(newWeek){
    h += '<div class="banner">📅 检测到新的一周已经开始，点击下方按钮重置本周训练打卡。<button class="btn primary sm" data-action="fit.resetWeek">开启新一周</button></div>';
  }

  // 本周训练计划
  h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--green)"></span>本周训练计划</h2>' +
    '<span class="muted">已完成 ' + done + ' / ' + f.weekPlan.length + ' 天</span></div>' +
    '<div style="margin-bottom:10px">' + progressBar(pct) + '</div>';
  h += f.weekPlan.map((d, i) =>
    '<div class="item ' + (d.done ? 'done' : '') + '">' +
    '<span class="day-chip ' + (i === todayIdx() ? 'today' : '') + '">' + d.day + '</span>' +
    '<input type="checkbox" data-change="fit.toggleDay" data-i="' + i + '" ' + (d.done ? 'checked' : '') + '>' +
    '<input type="text" class="plan-input txt" data-change="fit.planText" data-i="' + i + '" value="' + esc(d.plan) + '" placeholder="点击填写当日训练安排…">' +
    '</div>').join('');
  h += '<div class="muted" style="margin-top:8px;font-size:12px">提示：直接点击文字即可修改当天安排，勾选完成打卡。</div></div>';

  // 饮食 + 采购
  h += '<div class="two-col" style="margin-top:18px">';
  h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--green)"></span>饮食计划</h2></div>' +
    addForm('fit.addDiet', '添加一条饮食规则 / 餐食安排…') +
    checkList(f.diet, { toggle:'fit.toggleDiet', del:'fit.delDiet' }) + '</div>';
  h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--amber)"></span>采购清单</h2></div>' +
    addForm('fit.addShop', '添加要买的食材…') +
    checkList(f.shopping, { toggle:'fit.toggleShop', del:'fit.delShop' }) + '</div>';
  h += '</div>';

  // 日志
  h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>训练日志 · 想法与结果</h2></div>' +
    '<form data-form="fit.addLog" style="margin-bottom:14px"><div class="quick-row">' +
    '<input type="date" name="date" value="' + dateStr() + '" style="flex:none;width:150px">' +
    '<select name="tag" style="flex:none;width:130px"><option>训练感受</option><option>身体数据</option><option>饮食记录</option><option>想法</option><option>结果</option></select></div>' +
    '<textarea name="text" rows="2" placeholder="记录今天的训练感受、体重变化或任何想法（支持 Markdown）…" required style="margin-top:8px"></textarea>' +
    '<div style="text-align:right;margin-top:8px"><button class="btn primary sm">添加日志</button></div></form>';
  if(!f.logs.length) h += '<div class="empty">还没有日志，记录第一条吧</div>';
  h += f.logs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(l =>
    '<div class="q-card"><div class="q-head"><div class="q-meta" style="margin:0"><span class="badge indigo">' + esc(l.tag) + '</span><span class="muted">' + l.date + '</span></div>' +
    '<div class="q-actions"><button class="icon-btn" title="删除" data-action="fit.delLog" data-id="' + l.id + '">✕</button></div></div>' +
    '<div class="md">' + md(l.text) + '</div></div>').join('');
  h += '</div>';
  return h;
}

/* ================= 求职准备 ================= */
function renderJob(){
  const j = DB.job;
  const done = j.plan.filter(x => x.done).length, pct = j.plan.length ? done / j.plan.length * 100 : 0;
  const tags = ['全部'].concat([...new Set(j.questions.map(q => q.tag || '未分类'))]);
  let qs = j.questions.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if(state.jobTag !== '全部') qs = qs.filter(q => (q.tag || '未分类') === state.jobTag);
  if(state.jobQ){ const k = state.jobQ.toLowerCase(); qs = qs.filter(q => (q.title + q.content).toLowerCase().includes(k)); }

  let h = header('💼 求职准备', '每天进步一点，offer 就近一点 · ' + fmtCN(),
    '<button class="btn primary indigo" data-action="job.addQ">＋ 记录面试题</button>');

  h += '<div class="two-col">';
  // 每日工作记录
  h += '<div class="card accent-indigo"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>每日工作记录</h2></div>' +
    '<form class="add-form" data-form="job.addDaily"><input type="text" name="text" placeholder="今天做了什么？完成情况如何？" required autocomplete="off"><button class="btn primary indigo sm" style="flex:none">记录</button></form>';
  if(!j.daily.length) h += '<div class="empty">还没有记录</div>';
  h += j.daily.slice().sort((a, b) => b.date.localeCompare(a.date)).map(d =>
    '<div class="item ' + (d.done ? 'done' : '') + '"><input type="checkbox" data-change="job.toggleDaily" data-id="' + d.id + '" ' + (d.done ? 'checked' : '') + '>' +
    '<div class="txt"><span class="badge ' + (d.date === dateStr() ? 'indigo' : 'gray') + '" style="margin-right:6px">' + d.date.slice(5) + '</span>' + esc(d.content) + '</div>' +
    '<button class="icon-btn" title="删除" data-action="job.delDaily" data-id="' + d.id + '">✕</button></div>').join('');
  h += '</div>';
  // 刷题与准备计划
  h += '<div class="card accent-indigo"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>刷题与准备计划</h2>' +
    '<span class="muted">' + done + ' / ' + j.plan.length + '</span></div>' +
    '<div style="margin-bottom:10px">' + progressBar(pct, 'var(--indigo)') + '</div>' +
    addForm('job.addPlan', '添加一项准备任务…') +
    checkList(j.plan, { toggle:'job.togglePlan', del:'job.delPlan', cls:'accent-indigo' }) + '</div>';
  h += '</div>';

  // 面试题库
  h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--green)"></span>面试题库 <span class="muted" style="font-weight:400">（支持 Markdown 与公式）</span></h2>' +
    '<input type="text" placeholder="搜索题目…" data-input="job.q" value="' + esc(state.jobQ) + '" style="width:200px"></div>' +
    '<div class="chips" style="margin-bottom:14px">' +
    tags.map(t => '<button class="chip ' + (state.jobTag === t ? 'active' : '') + '" data-action="job.fTag" data-v="' + esc(t) + '">' + esc(t) + '</button>').join('') + '</div>';
  if(!qs.length) h += '<div class="empty">没有匹配的题目</div>';
  h += qs.map(q =>
    '<div class="q-card"><div class="q-head"><div class="q-title">' + esc(q.title) + '</div>' +
    '<div class="q-actions"><button class="icon-btn" title="编辑" data-action="job.editQ" data-id="' + q.id + '">✎</button>' +
    '<button class="icon-btn" title="删除" data-action="job.delQ" data-id="' + q.id + '">✕</button></div></div>' +
    '<div class="q-meta"><span class="badge green">' + esc(q.tag || '未分类') + '</span><span class="muted">' + (q.created || '') + '</span></div>' +
    '<div class="md">' + md(q.content) + '</div></div>').join('');
  h += '</div>';

  // 学习主题列表
  const cats = ['全部'].concat([...new Set(j.topics.map(t => t.cat).filter(Boolean))]);
  let topics = j.topics.slice();
  if(state.jobTopicCat !== '全部') topics = topics.filter(t => t.cat === state.jobTopicCat);
  const skPct = j.topics.length ? Math.round(j.topics.reduce((s, t) => s + (t.level || 0), 0) / j.topics.length) : 0;
  h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>学习主题列表 <span class="muted" style="font-weight:400">（工作核心技能掌握度）</span></h2>' +
    '<span class="muted">平均掌握 ' + skPct + '%</span></div>' +
    '<div style="margin-bottom:10px">' + progressBar(skPct, 'var(--indigo)') + '</div>' +
    '<div class="chips" style="margin-bottom:14px">' +
    cats.map(c => '<button class="chip ' + (state.jobTopicCat === c ? 'active' : '') + '" data-action="job.fTopicCat" data-v="' + esc(c) + '">' + esc(c) + '</button>').join('') + '</div>';
  if(!topics.length) h += '<div class="empty">该分类下暂无主题，在下方添加</div>';
  else {
    const grouped = {};
    topics.forEach(t => { (grouped[t.cat || '未分类'] = grouped[t.cat || '未分类'] || []).push(t); });
    h += Object.keys(grouped).map(cat => {
      let g = '<div class="cat-group-title">' + esc(cat) + '（' + grouped[cat].length + '）</div>';
      g += grouped[cat].map(t => {
        const lvl = t.level || 0;
        const st = lvl >= 100 ? '已掌握' : lvl > 0 ? '学习中' : '未开始';
        const stc = lvl >= 100 ? 'green' : lvl > 0 ? 'indigo' : 'gray';
        return '<div class="topic-row"><div class="txt"><div class="t-name">' + esc(t.name) +
          ' <button class="icon-btn" title="编辑 / 笔记" data-action="job.editTopic" data-id="' + t.id + '">✎</button></div>' +
          '<div class="topic-meta"><span class="badge ' + stc + '">' + st + '</span>' +
          (t.note ? '<span class="muted">' + esc(t.note.slice(0, 42) + (t.note.length > 42 ? '…' : '')) + '</span>' : '') + '</div></div>' +
          '<input type="range" min="0" max="100" step="5" value="' + lvl + '" data-change="job.topicLevel" data-id="' + t.id + '" title="拖动调整掌握度">' +
          '<span class="mastery-num">' + lvl + '%</span>' +
          '<button class="icon-btn" title="删除" data-action="job.delTopic" data-id="' + t.id + '">✕</button></div>';
      }).join('');
      return g;
    }).join('');
  }
  h += '<form class="add-form" data-form="job.addTopic" style="margin-top:14px;flex-wrap:wrap">' +
    '<input type="text" name="name" placeholder="新增学习主题，如：Graph Embedding / 多目标排序…" required autocomplete="off" style="flex:1;min-width:200px">' +
    '<input type="text" name="cat" list="topiccats" placeholder="分类" autocomplete="off" style="flex:none;width:150px">' +
    '<datalist id="topiccats">' + TOPIC_CATS.map(c => '<option>' + c + '</option>').join('') + '</datalist>' +
    '<button class="btn primary indigo sm" style="flex:none">添加</button></form>';
  h += '</div>';

  // 求职目标追踪
  const stages = ['全部'].concat(TARGET_STAGES);
  let targets = j.targets.slice();
  if(state.jobTargetStatus !== '全部') targets = targets.filter(t => t.status === state.jobTargetStatus);
  h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--amber)"></span>求职目标追踪</h2>' +
    '<button class="btn ghost sm" data-action="job.addTarget">＋ 添加目标 / 公司</button></div>' +
    '<div class="chips" style="margin-bottom:14px">' +
    stages.map(s => '<button class="chip ' + (state.jobTargetStatus === s ? 'active' : '') + '" data-action="job.fTargetStatus" data-v="' + esc(s) + '">' + esc(s) +
      (s === '全部' ? '（' + j.targets.length + '）' : '（' + j.targets.filter(t => t.status === s).length + '）') + '</button>').join('') + '</div>';
  if(!targets.length) h += '<div class="empty">暂无目标，点击右上角添加</div>';
  h += targets.map(t => {
    const c = TARGET_COLOR[t.status] || 'gray';
    let dl = '';
    if(t.deadline){ const days = Math.round((new Date(t.deadline + 'T00:00:00') - new Date()) / 86400000); const soon = days >= 0 && days <= 7;
      dl = '<span class="target-deadline ' + (soon ? 'deadline-soon' : '') + '">📅 ' + t.deadline + (days >= 0 ? '（' + days + ' 天）' : '（已过期）') + '</span>'; }
    return '<div class="target-row"><div class="target-main"><div class="t-co">' + esc(t.company || '未命名') + '</div>' +
      '<div class="t-role">' + esc(t.role || '') + '</div>' +
      '<div class="q-meta" style="margin-top:6px"><span class="badge ' + c + '">' + esc(t.status) + '</span>' + dl +
      (t.note ? '<span class="muted">' + esc(t.note.slice(0, 28) + (t.note.length > 28 ? '…' : '')) + '</span>' : '') + '</div></div>' +
      '<div class="q-actions"><button class="icon-btn" title="编辑" data-action="job.editTarget" data-id="' + t.id + '">✎</button>' +
      '<button class="icon-btn" title="删除" data-action="job.delTarget" data-id="' + t.id + '">✕</button></div></div>';
  }).join('');
  h += '</div>';

  return h;
}

/* ================= 阅读笔记 ================= */
function renderReading(){
  const notes = DB.reading.notes;
  const books = ['全部'].concat([...new Set(notes.map(n => n.book).filter(Boolean))]);
  const themes = ['全部'].concat([...new Set(notes.map(n => n.theme).filter(Boolean))]);
  let list = notes.slice().sort((a, b) => (b.created || '').localeCompare(a.created || ''));
  if(state.readBook !== '全部') list = list.filter(n => n.book === state.readBook);
  if(state.readTheme !== '全部') list = list.filter(n => n.theme === state.readTheme);
  if(state.readQ){ const k = state.readQ.toLowerCase(); list = list.filter(n => (n.title + n.content + n.book + n.theme).toLowerCase().includes(k)); }

  let h = header('📚 阅读与思考', '共 ' + notes.length + ' 篇笔记 · ' + (books.length - 1) + ' 本书',
    '<button class="btn primary" style="background:var(--amber)" data-action="read.add">＋ 写笔记</button>');

  h += '<div class="card"><div class="quick-row" style="margin-bottom:16px;flex-wrap:wrap">' +
    '<select data-change="read.fBook" style="flex:none;width:180px">' + books.map(b => '<option ' + (state.readBook === b ? 'selected' : '') + '>' + esc(b) + '</option>').join('') + '</select>' +
    '<select data-change="read.fTheme" style="flex:none;width:180px">' + themes.map(t => '<option ' + (state.readTheme === t ? 'selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>' +
    '<input type="text" placeholder="搜索笔记…" data-input="read.q" value="' + esc(state.readQ) + '" style="flex:1;min-width:160px"></div>';
  if(!list.length) h += '<div class="empty">没有匹配的笔记，点击右上角「写笔记」开始记录</div>';
  h += list.map(n =>
    '<div class="q-card"><div class="q-head"><div class="q-title">' + esc(n.title) + '</div>' +
    '<div class="q-actions"><button class="icon-btn" title="编辑" data-action="read.edit" data-id="' + n.id + '">✎</button>' +
    '<button class="icon-btn" title="删除" data-action="read.del" data-id="' + n.id + '">✕</button></div></div>' +
    '<div class="q-meta"><span class="badge amber">📖 ' + esc(n.book || '未命名书籍') + '</span>' +
    '<span class="badge pink">🏷 ' + esc(n.theme || '未分类') + '</span><span class="muted">' + (n.created || '') + '</span></div>' +
    '<div class="md">' + md(n.content) + '</div></div>').join('');
  h += '</div>';
  return h;
}

/* ================= 副业探索 ================= */
const SIDE_STATUSES = ['灵感', '进行中', '已完成', '搁置'];
const SIDE_COLOR = { '灵感':'amber', '进行中':'green', '已完成':'indigo', '搁置':'gray' };

/* ================= 求职：学习主题 / 目标追踪 ================= */
const TOPIC_CATS = ['推荐算法', '机器学习', '大数据与工程', '系统与架构', '编程语言', '业务与软技能'];
const TARGET_STAGES = ['想投', '已投递', '笔试', '一面', '二面', '三面', 'HR面', 'offer', '拒信'];
const TARGET_COLOR = { '想投':'gray', '已投递':'indigo', '笔试':'amber', '一面':'indigo', '二面':'indigo', '三面':'indigo', 'HR面':'green', 'offer':'green', '拒信':'gray' };
function renderSide(){
  const ps = DB.side.projects;
  let list = ps.slice();
  if(state.sideStatus !== '全部') list = list.filter(p => p.status === state.sideStatus);

  let h = header('💡 副业探索', '灵感不漏接，进展看得见 · 共 ' + ps.length + ' 个项目',
    '<button class="btn primary" style="background:var(--pink)" data-action="side.add">＋ 新项目 / 灵感</button>');

  h += '<div class="chips" style="margin-bottom:16px">' +
    ['全部'].concat(SIDE_STATUSES).map(s => '<button class="chip ' + (state.sideStatus === s ? 'active' : '') + '" data-action="side.fStatus" data-v="' + s + '">' + s + (s === '全部' ? '（' + ps.length + '）' : '（' + ps.filter(p => p.status === s).length + '）') + '</button>').join('') + '</div>';

  if(!list.length) h += '<div class="card"><div class="empty">该状态下暂无项目</div></div>';
  h += list.map(p =>
    '<div class="card" style="margin-bottom:16px"><div class="sec-title" style="margin-bottom:6px">' +
    '<h2>' + esc(p.title) + '</h2>' +
    '<div class="q-actions">' +
    '<select data-change="side.status" data-id="' + p.id + '" style="width:auto;padding:4px 10px;font-size:12px">' +
    SIDE_STATUSES.map(s => '<option ' + (p.status === s ? 'selected' : '') + '>' + s + '</option>').join('') + '</select>' +
    '<button class="icon-btn" title="编辑" data-action="side.edit" data-id="' + p.id + '">✎</button>' +
    '<button class="icon-btn" title="删除" data-action="side.del" data-id="' + p.id + '">✕</button></div></div>' +
    '<div class="q-meta"><span class="badge pink">' + esc(p.category || '其他') + '</span>' +
    '<span class="badge ' + SIDE_COLOR[p.status] + '">' + p.status + '</span></div>' +
    (p.desc ? '<div class="md" style="margin-bottom:10px">' + md(p.desc) + '</div>' : '') +
    '<div class="tl">' + p.updates.slice().sort((a, b) => b.date.localeCompare(a.date)).map(u =>
      '<div class="tl-item"><div class="tl-date">' + u.date + '</div><div class="md">' + md(u.note) + '</div></div>').join('') + '</div>' +
    '<button class="btn ghost sm" data-action="side.addUpdate" data-id="' + p.id + '" style="margin-top:8px">＋ 记录进展</button></div>').join('');
  return h;
}

/* ================= 弹窗 ================= */
const modalRoot = $('#modal-root');
function openModal(title, bodyHtml, formName){
  modalRoot.innerHTML = '<div class="modal-mask" data-action="modal.cancel"><div class="modal">' +
    '<div class="modal-head"><h3>' + title + '</h3><button class="icon-btn" data-action="modal.cancel">✕</button></div>' +
    '<form class="modal-body" data-form="' + formName + '">' + bodyHtml +
    '<div class="modal-foot"><button type="button" class="btn ghost" data-action="modal.cancel">取消</button>' +
    '<button class="btn primary">保存</button></div></form></div></div>';
}
function closeModal(){ modalRoot.innerHTML = ''; }
function mdField(name, label, value, rows){
  return '<div class="field"><label>' + label + '</label>' +
    '<textarea name="' + name + '" rows="' + (rows || 8) + '">' + esc(value || '') + '</textarea>' +
    '<div class="md-preview" hidden></div>' +
    '<button type="button" class="btn ghost sm preview-toggle" data-action="md.preview">预览</button></div>';
}

/* ================= 行为处理 ================= */
function findById(arr, id){ return arr.find(x => x.id === id); }

const ACTIONS = {
  'nav': el => { state.view = el.dataset.view; render(); },
  'modal.cancel': () => closeModal(),
  'md.preview': (el) => {
    const field = el.closest('.field'); const ta = field.querySelector('textarea'); const pv = field.querySelector('.md-preview');
    if(pv.hidden){ pv.innerHTML = md(ta.value); typesetMath(pv); pv.hidden = false; ta.hidden = true; el.textContent = '继续编辑'; }
    else { pv.hidden = true; ta.hidden = false; el.textContent = '预览'; }
  },
  // 减脂
  'fit.resetWeek': () => { DB.fitness.weekPlan.forEach(d => d.done = false); DB.fitness.weekStart = mondayStr(); save(); render(); },
  'fit.delDiet': el => { DB.fitness.diet = DB.fitness.diet.filter(x => x.id !== el.dataset.id); save(); render(); },
  'fit.delShop': el => { DB.fitness.shopping = DB.fitness.shopping.filter(x => x.id !== el.dataset.id); save(); render(); },
  'fit.delLog': el => { if(confirm('删除这条日志？')){ DB.fitness.logs = DB.fitness.logs.filter(x => x.id !== el.dataset.id); save(); render(); } },
  // 求职
  'job.delDaily': el => { DB.job.daily = DB.job.daily.filter(x => x.id !== el.dataset.id); save(); render(); },
  'job.delPlan': el => { DB.job.plan = DB.job.plan.filter(x => x.id !== el.dataset.id); save(); render(); },
  'job.fTag': el => { state.jobTag = el.dataset.v; render(); },
  'job.addQ': () => openModal('记录面试题',
    '<div class="field"><label>题目</label><input type="text" name="title" required placeholder="如：讲讲你最难忘的项目"></div>' +
    '<div class="field"><label>标签</label><input type="text" name="tag" list="qtags" placeholder="如：算法 / 行为面试 / 项目"><datalist id="qtags">' +
    [...new Set(DB.job.questions.map(q => q.tag))].filter(Boolean).map(t => '<option>' + esc(t) + '</option>').join('') + '</datalist></div>' +
    mdField('content', '答案要点（支持 Markdown，$行内公式$，$$独立公式$$，```代码块）', '', 9) +
    '<input type="hidden" name="id" value="">', 'job.saveQ'),
  'job.editQ': el => {
    const q = findById(DB.job.questions, el.dataset.id); if(!q) return;
    openModal('编辑面试题',
      '<div class="field"><label>题目</label><input type="text" name="title" required value="' + esc(q.title) + '"></div>' +
      '<div class="field"><label>标签</label><input type="text" name="tag" list="qtags" value="' + esc(q.tag) + '"><datalist id="qtags">' +
      [...new Set(DB.job.questions.map(x => x.tag))].filter(Boolean).map(t => '<option>' + esc(t) + '</option>').join('') + '</datalist></div>' +
      mdField('content', '答案要点', q.content, 9) +
      '<input type="hidden" name="id" value="' + q.id + '">', 'job.saveQ');
  },
  'job.delQ': el => { if(confirm('删除这道题？')){ DB.job.questions = DB.job.questions.filter(x => x.id !== el.dataset.id); save(); render(); } },
  // 求职：学习主题
  'job.fTopicCat': el => { state.jobTopicCat = el.dataset.v; render(); },
  'job.editTopic': el => {
    const t = findById(DB.job.topics, el.dataset.id); if(!t) return;
    openModal('编辑学习主题',
      '<div class="field"><label>主题</label><input type="text" name="name" required value="' + esc(t.name) + '"></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>分类</label><input type="text" name="cat" list="topiccats-e" value="' + esc(t.cat) + '"><datalist id="topiccats-e">' + TOPIC_CATS.map(c => '<option>' + c + '</option>').join('') + '</datalist></div>' +
      '<div class="field" style="flex:none;width:180px"><label class="lvl-label">掌握度 ' + t.level + '%</label><input type="range" name="level" min="0" max="100" step="5" value="' + t.level + '" oninput="this.closest(\'.field\').querySelector(\'.lvl-label\').textContent=\'掌握度 \'+this.value+\'%\'"></div></div>' +
      mdField('note', '学习笔记 / 资源（支持 Markdown）', t.note, 6) +
      '<input type="hidden" name="id" value="' + t.id + '">', 'job.saveTopic');
  },
  'job.delTopic': el => { if(confirm('删除这个学习主题？')){ DB.job.topics = DB.job.topics.filter(x => x.id !== el.dataset.id); save(); render(); } },
  // 求职：目标追踪
  'job.fTargetStatus': el => { state.jobTargetStatus = el.dataset.v; render(); },
  'job.addTarget': () => openModal('添加求职目标',
    '<div class="field"><label>公司 / 团队</label><input type="text" name="company" required placeholder="如：某头部内容平台"></div>' +
    '<div class="field"><label>岗位</label><input type="text" name="role" placeholder="如：推荐算法工程师"></div>' +
    '<div class="quick-row"><div class="field" style="flex:1"><label>状态</label><select name="status">' + TARGET_STAGES.map(s => '<option>' + s + '</option>').join('') + '</select></div>' +
    '<div class="field" style="flex:1"><label>截止 / 节点日期</label><input type="date" name="deadline"></div></div>' +
    mdField('note', '备注（面试安排、准备重点等）', '', 4) +
    '<input type="hidden" name="id" value="">', 'job.saveTarget'),
  'job.editTarget': el => {
    const t = findById(DB.job.targets, el.dataset.id); if(!t) return;
    openModal('编辑求职目标',
      '<div class="field"><label>公司 / 团队</label><input type="text" name="company" required value="' + esc(t.company) + '"></div>' +
      '<div class="field"><label>岗位</label><input type="text" name="role" value="' + esc(t.role) + '"></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>状态</label><select name="status">' + TARGET_STAGES.map(s => '<option ' + (t.status === s ? 'selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:1"><label>截止 / 节点日期</label><input type="date" name="deadline" value="' + esc(t.deadline || '') + '"></div></div>' +
      mdField('note', '备注', t.note, 4) +
      '<input type="hidden" name="id" value="' + t.id + '">', 'job.saveTarget');
  },
  'job.delTarget': el => { if(confirm('删除这个目标？')){ DB.job.targets = DB.job.targets.filter(x => x.id !== el.dataset.id); save(); render(); } },
  // 阅读
  'read.add': () => openModal('写阅读笔记',
    '<div class="quick-row"><div class="field" style="flex:1"><label>书籍</label><input type="text" name="book" list="rbooks" required placeholder="书名"><datalist id="rbooks">' +
    [...new Set(DB.reading.notes.map(n => n.book))].filter(Boolean).map(b => '<option>' + esc(b) + '</option>').join('') + '</datalist></div>' +
    '<div class="field" style="flex:1"><label>主题</label><input type="text" name="theme" list="rthemes" placeholder="如：习惯 / 投资 / 心理"><datalist id="rthemes">' +
    [...new Set(DB.reading.notes.map(n => n.theme))].filter(Boolean).map(t => '<option>' + esc(t) + '</option>').join('') + '</datalist></div></div>' +
    '<div class="field"><label>标题</label><input type="text" name="title" required placeholder="这篇笔记的核心观点"></div>' +
    mdField('content', '笔记内容（支持 Markdown 与公式）', '', 9) +
    '<input type="hidden" name="id" value="">', 'read.save'),
  'read.edit': el => {
    const n = findById(DB.reading.notes, el.dataset.id); if(!n) return;
    openModal('编辑笔记',
      '<div class="quick-row"><div class="field" style="flex:1"><label>书籍</label><input type="text" name="book" required value="' + esc(n.book) + '"></div>' +
      '<div class="field" style="flex:1"><label>主题</label><input type="text" name="theme" value="' + esc(n.theme) + '"></div></div>' +
      '<div class="field"><label>标题</label><input type="text" name="title" required value="' + esc(n.title) + '"></div>' +
      mdField('content', '笔记内容', n.content, 9) +
      '<input type="hidden" name="id" value="' + n.id + '">', 'read.save');
  },
  'read.del': el => { if(confirm('删除这篇笔记？')){ DB.reading.notes = DB.reading.notes.filter(x => x.id !== el.dataset.id); save(); render(); } },
  // 副业
  'side.fStatus': el => { state.sideStatus = el.dataset.v; render(); },
  'side.add': () => openModal('新项目 / 灵感',
    '<div class="field"><label>名称</label><input type="text" name="title" required placeholder="想尝试什么？"></div>' +
    '<div class="quick-row"><div class="field" style="flex:1"><label>分类</label><input type="text" name="category" list="scats" placeholder="如：摄影 / 游戏开发"><datalist id="scats"><option>摄影</option><option>游戏开发</option><option>写作</option><option>自媒体</option><option>其他</option></datalist></div>' +
    '<div class="field" style="flex:1"><label>状态</label><select name="status">' + SIDE_STATUSES.map(s => '<option>' + s + '</option>').join('') + '</select></div></div>' +
    mdField('desc', '描述（这个想法是什么？打算怎么做？）', '', 6) +
    '<input type="hidden" name="id" value="">', 'side.save'),
  'side.edit': el => {
    const p = findById(DB.side.projects, el.dataset.id); if(!p) return;
    openModal('编辑项目',
      '<div class="field"><label>名称</label><input type="text" name="title" required value="' + esc(p.title) + '"></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>分类</label><input type="text" name="category" value="' + esc(p.category) + '"></div>' +
      '<div class="field" style="flex:1"><label>状态</label><select name="status">' + SIDE_STATUSES.map(s => '<option ' + (p.status === s ? 'selected' : '') + '>' + s + '</option>').join('') + '</select></div></div>' +
      mdField('desc', '描述', p.desc, 6) +
      '<input type="hidden" name="id" value="' + p.id + '">', 'side.save');
  },
  'side.del': el => { if(confirm('删除这个项目及其所有进展记录？')){ DB.side.projects = DB.side.projects.filter(x => x.id !== el.dataset.id); save(); render(); } },
  'side.addUpdate': el => {
    const p = findById(DB.side.projects, el.dataset.id); if(!p) return;
    openModal('记录进展 · ' + p.title,
      '<div class="field"><label>日期</label><input type="date" name="date" value="' + dateStr() + '"></div>' +
      mdField('note', '进展内容', '', 6) +
      '<input type="hidden" name="pid" value="' + p.id + '">', 'side.saveUpdate');
  },
  // 数据
  'data.export': () => {
    const blob = new Blob([JSON.stringify(DB, null, 2)], { type:'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'goal-tracker-backup-' + dateStr() + '.json';
    a.click(); URL.revokeObjectURL(a.href);
  },
  'data.import': () => $('#import-file').click(),
};

const CHANGES = {
  'fit.toggleDay': el => { DB.fitness.weekPlan[+el.dataset.i].done = el.checked; save(); render(); },
  'fit.planText': el => { DB.fitness.weekPlan[+el.dataset.i].plan = el.value; save(); },
  'fit.toggleDiet': el => { findById(DB.fitness.diet, el.dataset.id).done = el.checked; save(); render(); },
  'fit.toggleShop': el => { findById(DB.fitness.shopping, el.dataset.id).done = el.checked; save(); render(); },
  'job.toggleDaily': el => { findById(DB.job.daily, el.dataset.id).done = el.checked; save(); render(); },
  'job.togglePlan': el => { findById(DB.job.plan, el.dataset.id).done = el.checked; save(); render(); },
  'job.topicLevel': el => {
    const t = findById(DB.job.topics, el.dataset.id); if(!t) return;
    t.level = +el.value; save();
    // 就地更新数字与状态徽章，避免整页重绘导致滚动跳动
    const row = el.closest('.topic-row'); if(!row) return;
    const num = row.querySelector('.mastery-num'); if(num) num.textContent = t.level + '%';
    const lvl = t.level || 0;
    const st = lvl >= 100 ? '已掌握' : lvl > 0 ? '学习中' : '未开始';
    const stc = lvl >= 100 ? 'green' : lvl > 0 ? 'indigo' : 'gray';
    const badge = row.querySelector('.topic-meta .badge'); if(badge){ badge.textContent = st; badge.className = 'badge ' + stc; }
    const card = row.closest('.card');
    const prog = card && card.querySelector('.progress > i'); if(prog){ const j = DB.job; const p = j.topics.length ? Math.round(j.topics.reduce((s, x) => s + (x.level || 0), 0) / j.topics.length) : 0; prog.style.width = p + '%'; }
    const lbl = card && card.querySelector('.sec-title .muted'); if(lbl){ const j = DB.job; const p = j.topics.length ? Math.round(j.topics.reduce((s, x) => s + (x.level || 0), 0) / j.topics.length) : 0; lbl.textContent = '平均掌握 ' + p + '%'; }
  },
  'read.fBook': el => { state.readBook = el.value; render(); },
  'read.fTheme': el => { state.readTheme = el.value; render(); },
  'side.status': el => { findById(DB.side.projects, el.dataset.id).status = el.value; save(); render(); },
};

const INPUTS = {
  'job.q': el => { state.jobQ = el.value; renderKeep('job.q'); },
  'read.q': el => { state.readQ = el.value; renderKeep('read.q'); },
};

const FORMS = {
  'fit.addDiet': fd => { DB.fitness.diet.push({ id:uid(), text:fd.get('text'), done:false }); save(); render(); },
  'fit.addShop': fd => { DB.fitness.shopping.push({ id:uid(), text:fd.get('text'), done:false }); save(); render(); },
  'fit.addLog': fd => { DB.fitness.logs.push({ id:uid(), date:fd.get('date') || dateStr(), tag:fd.get('tag'), text:fd.get('text') }); save(); render(); },
  'job.addDaily': fd => { DB.job.daily.push({ id:uid(), date:dateStr(), content:fd.get('text'), done:false }); save(); render(); },
  'job.addPlan': fd => { DB.job.plan.push({ id:uid(), text:fd.get('text'), done:false }); save(); render(); },
  'job.addTopic': fd => { DB.job.topics.push({ id:uid(), name:fd.get('name'), cat:fd.get('cat') || '未分类', level:0, note:'' }); save(); render(); },
  'job.saveTopic': fd => {
    const id = fd.get('id'), lvl = +fd.get('level');
    if(id){ const t = findById(DB.job.topics, id); Object.assign(t, { name:fd.get('name'), cat:fd.get('cat') || '未分类', level:lvl, note:fd.get('note') }); }
    else DB.job.topics.push({ id:uid(), name:fd.get('name'), cat:fd.get('cat') || '未分类', level:lvl, note:fd.get('note') });
    save(); closeModal(); render();
  },
  'job.saveTarget': fd => {
    const id = fd.get('id');
    const data = { company:fd.get('company'), role:fd.get('role'), status:fd.get('status') || '想投', deadline:fd.get('deadline') || '', note:fd.get('note') };
    if(id){ Object.assign(findById(DB.job.targets, id), data); }
    else DB.job.targets.push(Object.assign({ id:uid() }, data));
    save(); closeModal(); render();
  },
  'job.saveQ': fd => {
    const id = fd.get('id');
    if(id){ const q = findById(DB.job.questions, id); Object.assign(q, { title:fd.get('title'), tag:fd.get('tag') || '未分类', content:fd.get('content') }); }
    else DB.job.questions.push({ id:uid(), title:fd.get('title'), tag:fd.get('tag') || '未分类', content:fd.get('content'), created:dateStr() });
    save(); closeModal(); render();
  },
  'read.save': fd => {
    const id = fd.get('id');
    if(id){ const n = findById(DB.reading.notes, id); Object.assign(n, { book:fd.get('book'), theme:fd.get('theme'), title:fd.get('title'), content:fd.get('content') }); }
    else DB.reading.notes.push({ id:uid(), book:fd.get('book'), theme:fd.get('theme'), title:fd.get('title'), content:fd.get('content'), created:dateStr() });
    save(); closeModal(); render();
  },
  'side.save': fd => {
    const id = fd.get('id');
    if(id){ const p = findById(DB.side.projects, id); Object.assign(p, { title:fd.get('title'), category:fd.get('category'), status:fd.get('status'), desc:fd.get('desc') }); }
    else DB.side.projects.push({ id:uid(), title:fd.get('title'), category:fd.get('category') || '其他', status:fd.get('status'), desc:fd.get('desc'), updates:[{ id:uid(), date:dateStr(), note:'项目创建。' }] });
    save(); closeModal(); render();
  },
  'side.saveUpdate': fd => {
    const p = findById(DB.side.projects, fd.get('pid')); if(!p) return;
    p.updates.push({ id:uid(), date:fd.get('date') || dateStr(), note:fd.get('note') });
    save(); closeModal(); render();
  },
  'dash.capture': fd => {
    DB.side.projects.push({ id:uid(), title:fd.get('text'), category:'灵感', status:'灵感', desc:'', updates:[{ id:uid(), date:dateStr(), note:'灵感速记，待补充细节。' }] });
    save(); render();
  },
};

/* ================= 公司估值 ================= */
const VAL_MARKETS = ['A股','港股','美股','其他'];
const VAL_METHODS = [
  { key:'PE',  label:'市盈率法',     cls:'m-pe',  desc:'估算价值 = 目标PE × 预期EPS',
    fields:[{key:'targetMultiple',label:'目标PE(倍)'},{key:'baseValue',label:'预期EPS'}] },
  { key:'PB',  label:'市净率法',     cls:'m-pb',  desc:'估算价值 = 目标PB × 每股净资产',
    fields:[{key:'targetMultiple',label:'目标PB(倍)'},{key:'baseValue',label:'每股净资产'}] },
  { key:'PS',  label:'市销率法',     cls:'m-ps',  desc:'估算价值 = 目标PS × 每股营收',
    fields:[{key:'targetMultiple',label:'目标PS(倍)'},{key:'baseValue',label:'每股营收'}] },
  { key:'PEG', label:'PEG估值法',    cls:'m-peg', desc:'估算价值 = PEG基准 × 增长率(%) × EPS',
    fields:[{key:'targetMultiple',label:'PEG基准(通常=1)'},{key:'baseValue',label:'当前EPS'},{key:'growthRate',label:'预期增长率(%)'}] },
  { key:'DCF', label:'DCF现金流折现', cls:'m-dcf', desc:'折现未来5年自由现金流 + 永续价值，再除以总股本',
    fields:[{key:'fcf1',label:'第1年FCF(亿)'},{key:'fcf2',label:'第2年FCF(亿)'},{key:'fcf3',label:'第3年FCF(亿)'},{key:'fcf4',label:'第4年FCF(亿)'},{key:'fcf5',label:'第5年FCF(亿)'},{key:'discountRate',label:'折现率(%)'},{key:'terminalGrowth',label:'永续增长率(%)'},{key:'shares',label:'总股本(亿股)'}] },
  { key:'EV',  label:'EV/EBITDA',    cls:'m-ev',  desc:'估算价值 = (目标倍数 × EBITDA − 净债务) / 总股本',
    fields:[{key:'targetMultiple',label:'目标EV/EBITDA(倍)'},{key:'baseValue',label:'EBITDA(亿)'},{key:'netDebt',label:'净债务(亿)'},{key:'shares',label:'总股本(亿股)'}] },
];
function valMethodInfo(key){ return VAL_METHODS.find(m => m.key === key) || VAL_METHODS[0]; }

/* ================= 财务指标注册表 ================= */
const METRIC_CATEGORIES = ['核心指标'];
const METRICS = [
  { key:'revenue',        label:'营收',     unit:'亿', priority:5, category:'核心指标', source:'input', desc:'营业收入（利润表）' },
  { key:'netProfit',      label:'净利润',   unit:'亿', priority:5, category:'核心指标', source:'input', desc:'归母净利润（利润表）' },
  { key:'grossMargin',    label:'毛利率',   unit:'%',  priority:5, category:'核心指标', source:'input', desc:'（利润表）' },
  { key:'opCashFlow',     label:'现金流',   unit:'亿', priority:4, category:'核心指标', source:'input', desc:'经营现金流净额（现金流量表）' },
  { key:'assetLiabRatio', label:'资产负债率', unit:'%', priority:4, category:'核心指标', source:'input', desc:'（资产负债表）' },
  { key:'roe',            label:'ROE',     unit:'%',  priority:4, category:'核心指标', source:'input', desc:'净资产收益率（财务指标摘要）' },
];
function metricInfo(key){
  return METRICS.find(m => m.key === key) ||
    (DB.valuation.customMetrics || []).find(m => m.key === key) ||
    { key, label:key, unit:'', priority:0, category:'自定义', source:'custom' };
}
function priorityStars(p){ return '⭐'.repeat(Math.max(0, Math.min(5, p || 0))) || '<span class="metric-priority">·</span>'; }

/* ----- 安全公式引擎（仅支持数字 + ${key} 引用 + 四则 + 括号） ----- */
function evalFormula(formula, values){
  if(!formula || typeof formula !== 'string') return null;
  try {
    let expr = formula;
    // 检查 ${key} 引用合法性
    const refKeys = (formula.match(/\$\{(\w+)\}/g) || []).map(s => s.slice(2,-1));
    for(const k of refKeys){
      const v = values ? values[k] : null;
      // 未定义或非数字的引用视为 0
      const num = (v == null || v === '' || isNaN(v)) ? 0 : Number(v);
      expr = expr.replace(new RegExp('\\$\\{' + k + '\\}', 'g'), '(' + num + ')');
    }
    // 仅允许数字、运算符、括号、小数点
    if(!/^[\d\s+\-*/().]+$/.test(expr)) return null;
    return Function('"use strict"; return (' + expr + ')')();
  } catch(e){ return null; }
}

/* ----- 计算某季度某指标的取值（支持自动增速 / 公式 / 自定义） ----- */
function getMetricValue(fin, key, allFins){
  const m = metricInfo(key);
  // 优先使用存储值
  const stored = fin ? fin[key] : null;
  if(stored != null && stored !== '' && !isNaN(stored)) return Number(stored);

  if(m.source === 'formula' && m.formula){
    return evalFormula(m.formula, fin || {});
  }
  if(m.source === 'auto' && m.growthBase && fin && fin.quarter && allFins){
    const m1 = (fin.quarter || '').match(/^(\d{4})Q([1-4])$/);
    if(m1){
      const prevQ = (parseInt(m1[1]) - 1) + 'Q' + m1[2];
      const prev = allFins.find(f => f.quarter === prevQ);
      const curr = fin[m.growthBase];
      const prevVal = prev ? prev[m.growthBase] : null;
      if(curr != null && prevVal != null && !isNaN(prevVal) && prevVal !== 0 && !isNaN(curr)){
        return (curr - prevVal) / Math.abs(prevVal) * 100;
      }
    }
    return null;
  }
  if(m.source === 'custom' && m.formula){
    return evalFormula(m.formula, fin || {});
  }
  return null;
}

/* ----- 指标格式化 ----- */
function fmtMetric(v, m){
  if(v == null || v === '' || isNaN(v)) return '<span class="muted">—</span>';
  let n = Number(v);
  let cls = '';
  // 增长率/股息率正负着色
  if(m && (m.category === '增长率' || m.key === 'dividendYield')){
    cls = n > 0 ? 'up' : (n < 0 ? 'down' : '');
  }
  let str = Math.abs(n) < 100 ? n.toFixed(2) : n.toFixed(1);
  // 带正负号（增长率）
  if(m && m.category === '增长率' && n !== 0) str = (n > 0 ? '+' : '') + str;
  const computed = m && (m.source === 'formula' || m.source === 'auto' || m.source === 'custom') ? 'computed-val' : '';
  return '<span class="' + computed + ' ' + cls + '">' + str + '</span>' +
    (m && m.unit ? '<span class="unit">' + m.unit + '</span>' : '');
}

/* ----- 获取某公司的自定义指标列表 ----- */
function customMetrics(){
  return DB.valuation.customMetrics || (DB.valuation.customMetrics = []);
}

function calcValuation(method, params){
  const p = params || {};
  let v = 0;
  switch(method){
    case 'PE': case 'PB': case 'PS':
      v = (p.targetMultiple||0) * (p.baseValue||0); break;
    case 'PEG':
      // PE = PEG × G(G为增长率百分数), Price = PE × EPS
      v = (p.targetMultiple||1) * (p.growthRate||0) * (p.baseValue||0); break;
    case 'DCF': {
      const r = (p.discountRate||10)/100, g = (p.terminalGrowth||3)/100;
      const fcfs = [p.fcf1,p.fcf2,p.fcf3,p.fcf4,p.fcf5].map(x => +x||0);
      let pv = 0;
      fcfs.forEach((f,i) => { pv += f / Math.pow(1+r, i+1); });
      const tv = fcfs[4] * (1+g) / (r-g);
      pv += tv / Math.pow(1+r, 5);
      v = pv / (p.shares||1); break;
    }
    case 'EV': {
      const ev = (p.targetMultiple||0) * (p.baseValue||0);
      v = (ev - (p.netDebt||0)) / (p.shares||1); break;
    }
  }
  return Math.round(v * 100) / 100;
}
function calcMoS(est, actual){
  if(!est || est <= 0) return null;
  return (est - actual) / est * 100;
}
function calcPosition(investments){
  let position = 0, cost = 0, realized = 0;
  const sorted = investments.slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
  for(const inv of sorted){
    if(inv.action === 'buy'){
      cost += (inv.price||0) * (inv.shares||0);
      position += (inv.shares||0);
    } else {
      if(position > 0){
        const avg = cost / position;
        const sell = Math.min(inv.shares||0, position);
        realized += ((inv.price||0) - avg) * sell;
        cost -= avg * sell;
        position -= sell;
      }
    }
  }
  return { position, cost, avgCost: position > 0 ? cost/position : 0, realized };
}
function fmtMoney(n, cur){
  if(n == null || isNaN(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  let str;
  if(abs >= 1e8) str = (abs/1e8).toFixed(2) + '亿';
  else if(abs >= 1e4) str = (abs/1e4).toFixed(2) + '万';
  else str = abs.toFixed(2);
  return sign + str + (cur ? ' ' + cur : '');
}
function fmtPct(n){
  if(n == null || isNaN(n)) return '—';
  return (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
}

/* ----- 估值趋势图（纯 SVG） ----- */
function valChart(valuations){
  const data = valuations.filter(v => v.estimatedValue > 0).slice().sort((a,b) => (a.date||'').localeCompare(b.date||''));
  if(data.length < 2) return '<div class="muted" style="text-align:center;padding:16px;font-size:13px">需要至少 2 条估值记录才能绘制趋势图</div>';
  const w = 640, h = 200, pad = {l:54, r:16, t:18, b:36};
  const allVals = data.flatMap(v => [v.estimatedValue, v.actualPrice].filter(x => x > 0));
  const minV = Math.min(...allVals) * 0.92, maxV = Math.max(...allVals) * 1.08;
  const range = maxV - minV || 1;
  const xS = i => pad.l + (i / (data.length - 1)) * (w - pad.l - pad.r);
  const yS = v => h - pad.b - ((v - minV) / range) * (h - pad.t - pad.b);
  let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto">';
  for(let i = 0; i <= 4; i++){
    const y = pad.t + i * (h - pad.t - pad.b) / 4;
    const val = maxV - i * range / 4;
    svg += '<line x1="' + pad.l + '" y1="' + y.toFixed(1) + '" x2="' + (w-pad.r) + '" y2="' + y.toFixed(1) + '" stroke="#eef0f4" stroke-width="1"/>';
    svg += '<text x="' + (pad.l-6) + '" y="' + (y+3).toFixed(1) + '" text-anchor="end" font-size="10" fill="#8a93a3">' + val.toFixed(1) + '</text>';
  }
  // 估算价值线
  let estPath = data.map((v,i) => (i===0?'M':'L') + ' ' + xS(i).toFixed(1) + ' ' + yS(v.estimatedValue).toFixed(1)).join(' ');
  svg += '<path d="' + estPath + '" fill="none" stroke="#5b64f2" stroke-width="2.5"/>';
  data.forEach((v,i) => { svg += '<circle cx="' + xS(i).toFixed(1) + '" cy="' + yS(v.estimatedValue).toFixed(1) + '" r="3.5" fill="#5b64f2"/>'; });
  // 实际股价线（虚线）
  const actData = data.filter(v => v.actualPrice > 0);
  if(actData.length >= 2){
    let actPath = '';
    actData.forEach((v) => {
      const i = data.indexOf(v);
      actPath += (actPath ? 'L' : 'M') + ' ' + xS(i).toFixed(1) + ' ' + yS(v.actualPrice).toFixed(1) + ' ';
    });
    svg += '<path d="' + actPath + '" fill="none" stroke="#0ea97b" stroke-width="2" stroke-dasharray="5,3"/>';
    actData.forEach(v => { const i = data.indexOf(v); svg += '<circle cx="' + xS(i).toFixed(1) + '" cy="' + yS(v.actualPrice).toFixed(1) + '" r="3" fill="#0ea97b"/>'; });
  }
  // x轴标签
  const step = Math.ceil(data.length / 6);
  data.forEach((v,i) => {
    if(i % step === 0 || i === data.length - 1)
      svg += '<text x="' + xS(i).toFixed(1) + '" y="' + (h - pad.b + 16) + '" text-anchor="middle" font-size="10" fill="#8a93a3">' + (v.date||'').slice(5) + '</text>';
  });
  // 图例
  svg += '<line x1="' + (w-pad.r-130) + '" y1="' + pad.t + '" x2="' + (w-pad.r-114) + '" y2="' + pad.t + '" stroke="#5b64f2" stroke-width="2.5"/>';
  svg += '<text x="' + (w-pad.r-108) + '" y="' + (pad.t+4) + '" font-size="10" fill="#66707f">估算价值</text>';
  svg += '<line x1="' + (w-pad.r-62) + '" y1="' + pad.t + '" x2="' + (w-pad.r-46) + '" y2="' + pad.t + '" stroke="#0ea97b" stroke-width="2" stroke-dasharray="3,2"/>';
  svg += '<text x="' + (w-pad.r-40) + '" y="' + (pad.t+4) + '" font-size="10" fill="#66707f">实际股价</text>';
  svg += '</svg>';
  return svg;
}

/* ----- 估值弹窗辅助 ----- */
function valParamFields(method, params){
  const m = valMethodInfo(method);
  return m.fields.map(f =>
    '<div class="field" style="flex:1;min-width:130px"><label>' + f.label + '</label>' +
    '<input type="number" step="0.01" name="param_' + f.key + '" value="' + (params && params[f.key] != null ? params[f.key] : '') + '" placeholder="0" oninput="recalcValuation()"></div>'
  ).join('');
}
function valModalBody(company, val){
  const method = val ? val.method : 'PE';
  const params = val ? (val.params || {}) : {};
  const est = val ? (val.estimatedValue || 0) : 0;
  return '<input type="hidden" name="cid" value="' + company.id + '">' +
    '<input type="hidden" name="id" value="' + (val ? val.id : '') + '">' +
    '<div class="field"><label>估算日期</label><input type="date" name="date" value="' + (val ? val.date : dateStr()) + '"></div>' +
    '<div class="field"><label>估值方法</label><select name="method" onchange="switchValMethod()">' +
    VAL_METHODS.map(m => '<option value="' + m.key + '"' + (method === m.key ? ' selected' : '') + '>' + m.label + '</option>').join('') + '</select>' +
    '<div class="muted" id="methodDesc" style="margin-top:4px;font-size:12px">' + valMethodInfo(method).desc + '</div></div>' +
    '<div class="param-grid" id="valParams">' + valParamFields(method, params) + '</div>' +
    '<div class="field"><label>估算每股价值 <span class="muted" style="font-weight:400">（自动计算）</span></label>' +
    '<div id="estValueDisplay" style="font-size:24px;font-weight:800;color:var(--indigo)">' + est.toFixed(2) + '</div></div>' +
    '<div class="field"><label>当时实际股价</label><input type="number" step="0.01" name="actualPrice" value="' + (val ? (val.actualPrice || '') : '') + '" placeholder="填入当时的实际股价" oninput="updateMoSDisplay()"></div>' +
    '<div id="mosDisplay" style="margin-bottom:12px"></div>' +
    mdField('note', '备注', val ? val.note : '', 3);
}
function switchValMethod(){
  const form = document.querySelector('[data-form="val.saveVal"]');
  if(!form) return;
  const method = form.querySelector('[name="method"]').value;
  const existing = {};
  form.querySelectorAll('[name^="param_"]').forEach(inp => { existing[inp.name.replace('param_','')] = inp.value; });
  form.querySelector('#valParams').innerHTML = valParamFields(method, existing);
  form.querySelector('#methodDesc').textContent = valMethodInfo(method).desc;
  recalcValuation();
  updateMoSDisplay();
}
function recalcValuation(){
  const form = document.querySelector('[data-form="val.saveVal"]');
  if(!form) return;
  const method = form.querySelector('[name="method"]').value;
  const params = {};
  valMethodInfo(method).fields.forEach(f => {
    const el = form.querySelector('[name="param_' + f.key + '"]');
    if(el) params[f.key] = parseFloat(el.value) || 0;
  });
  const est = calcValuation(method, params);
  const disp = form.querySelector('#estValueDisplay');
  if(disp) disp.textContent = est.toFixed(2);
  updateMoSDisplay();
}
function updateMoSDisplay(){
  const form = document.querySelector('[data-form="val.saveVal"]');
  if(!form) return;
  const est = parseFloat(form.querySelector('#estValueDisplay').textContent) || 0;
  const actual = parseFloat(form.querySelector('[name="actualPrice"]').value) || 0;
  const el = form.querySelector('#mosDisplay');
  if(!el) return;
  if(est > 0 && actual > 0){
    const mos = calcMoS(est, actual);
    const cls = mos >= 0 ? 'mos-pos' : 'mos-neg';
    const txt = mos >= 0 ? '安全边际 +' + mos.toFixed(1) + '%（被低估）' : '安全边际 ' + mos.toFixed(1) + '%（被高估）';
    el.innerHTML = '<span class="' + cls + '">' + txt + '</span>';
  } else el.innerHTML = '';
}
window.switchValMethod = switchValMethod;
window.recalcValuation = recalcValuation;
window.updateMoSDisplay = updateMoSDisplay;

/* ----- 公司列表视图 ----- */
function renderValuation(){
  if(state.valCompanyId){
    const c = findById(DB.valuation.companies, state.valCompanyId);
    if(c) return renderCompanyDetail(c);
    state.valCompanyId = null;
  }
  const companies = DB.valuation.companies;
  let list = companies.slice();
  if(state.valMarket !== '全部') list = list.filter(c => (c.market || 'A股') === state.valMarket);

  // 汇总统计
  let totalPos = 0, totalCost = 0, totalRealized = 0, totalMv = 0;
  companies.forEach(c => {
    const pos = calcPosition(c.investments || []);
    totalPos += pos.position;
    totalCost += pos.cost;
    totalRealized += pos.realized;
    totalMv += pos.position * (c.currentPrice || 0);
  });
  const totalPnl = totalMv - totalCost;

  let h = header('📈 公司估值', '追踪关注公司的财务数据与估值 · 共 ' + companies.length + ' 家',
    '<button class="btn primary" style="background:var(--indigo)" data-action="val.addCompany">＋ 添加公司</button>');

  // 汇总卡片
  h += '<div class="val-summary-grid">';
  h += '<div class="val-stat"><div class="vs-label">关注公司</div><div class="vs-value">' + companies.length + '</div></div>';
  h += '<div class="val-stat"><div class="vs-label">持仓市值</div><div class="vs-value">' + fmtMoney(totalMv) + '</div><div class="vs-sub">' + totalPos.toFixed(0) + ' 股</div></div>';
  h += '<div class="val-stat"><div class="vs-label">持仓成本</div><div class="vs-value">' + fmtMoney(totalCost) + '</div></div>';
  h += '<div class="val-stat"><div class="vs-label">浮动盈亏</div><div class="vs-value ' + (totalPnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(totalPnl) + '</div><div class="vs-sub ' + (totalPnl >= 0 ? 'up' : 'down') + '">' + fmtPct(totalCost > 0 ? totalPnl/totalCost*100 : 0) + '</div></div>';
  h += '<div class="val-stat"><div class="vs-label">已实现盈亏</div><div class="vs-value ' + (totalRealized >= 0 ? 'up' : 'down') + '">' + fmtMoney(totalRealized) + '</div></div>';
  h += '</div>';

  // 市场筛选
  h += '<div class="chips" style="margin-bottom:16px">' +
    ['全部'].concat(VAL_MARKETS).map(m => '<button class="chip ' + (state.valMarket === m ? 'active' : '') + '" data-action="val.fMarket" data-v="' + m + '">' + m + (m === '全部' ? '（' + companies.length + '）' : '（' + companies.filter(c => (c.market||'A股') === m).length + '）') + '</button>').join('') + '</div>';

  if(!list.length){ h += '<div class="card"><div class="empty">该市场下暂无公司，点击右上角添加</div></div>'; return h; }

  // 公司卡片
  h += list.map(c => {
    const pos = calcPosition(c.investments || []);
    const mv = pos.position * (c.currentPrice || 0);
    const pnl = mv - pos.cost;
    const pnlPct = pos.cost > 0 ? pnl / pos.cost * 100 : 0;
    const latestVal = (c.valuations || []).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''))[0];
    const mos = latestVal ? calcMoS(latestVal.estimatedValue, c.currentPrice || latestVal.actualPrice) : null;
    const marketBadge = { 'A股':'indigo', '港股':'pink', '美股':'green', '其他':'gray' }[c.market || 'A股'] || 'gray';
    let stats = '';
    if(pos.position > 0){
      stats += '<div class="cc-stat"><span class="label">持仓</span><span class="val">' + pos.position.toFixed(0) + ' 股</span></div>';
      stats += '<div class="cc-stat"><span class="label">成本</span><span class="val">' + (pos.avgCost || 0).toFixed(2) + '</span></div>';
      stats += '<div class="cc-stat"><span class="label">现价</span><span class="val">' + (c.currentPrice || 0).toFixed(2) + '</span></div>';
      stats += '<div class="cc-stat"><span class="label">浮盈亏</span><span class="val ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(pnl) + ' (' + fmtPct(pnlPct) + ')</span></div>';
    } else if(c.currentPrice){
      stats += '<div class="cc-stat"><span class="label">现价</span><span class="val">' + (c.currentPrice || 0).toFixed(2) + ' ' + (c.currency||'') + '</span></div>';
    }
    if(latestVal){
      stats += '<div class="cc-stat"><span class="label">最新估值</span><span class="val">' + (latestVal.estimatedValue||0).toFixed(2) + ' <span class="method-badge ' + valMethodInfo(latestVal.method).cls + '">' + valMethodInfo(latestVal.method).label + '</span></span></div>';
      if(mos != null) stats += '<div class="cc-stat"><span class="label">安全边际</span><span class="val ' + (mos >= 0 ? 'mos-pos' : 'mos-neg') + '">' + fmtPct(mos) + '</span></div>';
    }
    return '<div class="company-card">' +
      '<div class="cc-head"><div>' +
        '<span class="cc-name" data-action="val.openCompany" data-id="' + c.id + '">' + esc(c.name) + '</span>' +
        ' <span class="badge ' + marketBadge + '">' + esc(c.market||'A股') + '</span>' +
        '<div class="cc-meta">' + esc(c.ticker||'') + (c.sector ? ' · ' + esc(c.sector) : '') + (c.currency ? ' · ' + c.currency : '') + '</div>' +
      '</div><div class="q-actions">' +
        '<button class="icon-btn" title="编辑" data-action="val.editCompany" data-id="' + c.id + '">✎</button>' +
        '<button class="icon-btn" title="删除" data-action="val.delCompany" data-id="' + c.id + '">✕</button></div></div>' +
      (stats ? '<div class="cc-stats">' + stats + '</div>' : '') +
      (c.note ? '<div class="muted" style="margin-top:8px;font-size:12px">' + esc(c.note.slice(0,60) + (c.note.length > 60 ? '…' : '')) + '</div>' : '') +
    '</div>';
  }).join('');
  return h;
}

/* ----- 公司详情视图 ----- */
function renderCompanyDetail(c){
  const pos = calcPosition(c.investments || []);
  const mv = pos.position * (c.currentPrice || 0);
  const pnl = mv - pos.cost;
  const pnlPct = pos.cost > 0 ? pnl / pos.cost * 100 : 0;
  const marketBadge = { 'A股':'indigo', '港股':'pink', '美股':'green', '其他':'gray' }[c.market || 'A股'] || 'gray';

  let h = '<span class="back-link" data-action="val.back">← 返回公司列表</span>';
  h += '<div class="page-head"><div><h1>' + esc(c.name) + '</h1><div class="muted">' + esc(c.ticker||'') + ' · ' + esc(c.market||'') + ' · ' + esc(c.sector||'') + (c.currency ? ' · ' + c.currency : '') + '</div></div>' +
    '<div class="head-actions"><button class="btn ghost sm" data-action="val.editCompany" data-id="' + c.id + '">✎ 编辑</button>' +
    '<button class="btn danger-ghost sm" data-action="val.delCompany" data-id="' + c.id + '">🗑 删除</button></div></div>';

  // 现价 + 持仓汇总
  h += '<div class="val-summary-grid">';
  h += '<div class="val-stat"><div class="vs-label">当前股价</div><div class="vs-value">' + (c.currentPrice||0).toFixed(2) + '</div>' +
    '<input type="number" step="0.01" class="price-input" data-change="val.price" data-id="' + c.id + '" value="' + (c.currentPrice||'') + '" placeholder="更新现价"></div>';
  if(pos.position > 0){
    h += '<div class="val-stat"><div class="vs-label">持仓</div><div class="vs-value">' + pos.position.toFixed(0) + ' 股</div><div class="vs-sub">均成本 ' + pos.avgCost.toFixed(2) + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">市值</div><div class="vs-value">' + fmtMoney(mv) + '</div></div>';
    h += '<div class="val-stat"><div class="vs-label">浮动盈亏</div><div class="vs-value ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtMoney(pnl) + '</div><div class="vs-sub ' + (pnl >= 0 ? 'up' : 'down') + '">' + fmtPct(pnlPct) + '</div></div>';
    if(pos.realized !== 0) h += '<div class="val-stat"><div class="vs-label">已实现盈亏</div><div class="vs-value ' + (pos.realized >= 0 ? 'up' : 'down') + '">' + fmtMoney(pos.realized) + '</div></div>';
  }
  h += '</div>';

  if(c.note) h += '<div class="card"><div class="md">' + md(c.note) + '</div></div>';

  // 估值趋势图
  if((c.valuations||[]).length >= 2){
    h += '<div class="val-section"><div class="vs-head"><h3>📊 估值趋势</h3></div><div class="val-chart">' + valChart(c.valuations) + '</div></div>';
  }

  // 分季度财务数据
    // 分季度财务数据（按类别分组；自定义指标追加在"自定义"类别）
  const fins = (c.financials||[]).slice().sort((a,b) => state.valFinSort === 'asc'
    ? (a.quarter||'').localeCompare(b.quarter||'')
    : (b.quarter||'').localeCompare(a.quarter||''));
  h += '<div class="val-section"><div class="vs-head"><h3>📋 分季度财务数据 <span class="muted" style="font-weight:400;font-size:12px">共 ' + fins.length + ' 个季度</span></h3><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' +
    '<div class="fin-sort">' +
      '<button class="sort-btn ' + (state.valFinSort === 'desc' ? 'active' : '') + '" data-action="val.toggleFinSort" data-v="desc" title="最新季度在前">新→旧</button>' +
      '<button class="sort-btn ' + (state.valFinSort === 'asc' ? 'active' : '') + '" data-action="val.toggleFinSort" data-v="asc" title="最早季度在前">旧→新</button>' +
    '</div>' +
    '<button class="btn ghost sm" data-action="val.metricsConfig" data-id="' + c.id + '">⚙ 自定义指标（' + customMetrics().length + '）</button>' +
    '<button class="btn primary sm" style="background:var(--indigo)" data-action="val.addFin" data-id="' + c.id + '">＋ 添加季度</button>' +
    '</div></div>';
  if(!fins.length) h += '<div class="empty">还没有财务数据，点击右上角添加</div>';
  else {
    // 收集展示指标：内置核心 + 自定义
    const displayMetrics = METRICS.map(m => ({...m}));
    customMetrics().forEach(cm => displayMetrics.push({ ...cm, source:'custom', category:'自定义' }));
    h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr><th>季度</th>';
    displayMetrics.forEach(mi => {
      h += '<th class="num" title="' + esc(mi.desc||mi.label) + '">' + esc(mi.label) +
        (mi.unit ? ' <span class="unit">(' + mi.unit + ')</span>' : '') +
        (mi.source === 'formula' || mi.source === 'auto' || mi.source === 'custom' ? ' 📐' : '') + '</th>';
    });
    h += '<th>备注</th><th></th></tr></thead><tbody>';
    fins.forEach(f => {
      h += '<tr><td><b>' + esc(f.quarter) + '</b></td>';
      displayMetrics.forEach(mi => { h += '<td class="num">' + fmtMetric(getMetricValue(f, mi.key, fins), mi) + '</td>'; });
      h += '<td class="muted" style="max-width:120px">' + esc(f.note || '') + '</td>';
      h += '<td class="actions-cell"><button class="icon-btn" data-action="val.editFin" data-id="' + c.id + '" data-fid="' + f.id + '">✎</button><button class="icon-btn" data-action="val.delFin" data-id="' + c.id + '" data-fid="' + f.id + '">✕</button></td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
  }
  h += '</div>';

  // 估值记录
  h += '<div class="val-section"><div class="vs-head"><h3>💰 估值记录</h3><button class="btn primary sm" style="background:var(--indigo)" data-action="val.addVal" data-id="' + c.id + '">＋ 添加估值</button></div>';
  const vals = (c.valuations||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if(!vals.length) h += '<div class="empty">还没有估值记录</div>';
  else {
    h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
      '<th>日期</th><th>方法</th><th class="num">估算价值</th><th class="num">实际股价</th><th class="num">安全边际</th><th>备注</th><th></th>' +
      '</tr></thead><tbody>';
    h += vals.map(v => {
      const mi = valMethodInfo(v.method);
      const mos = calcMoS(v.estimatedValue, v.actualPrice);
      return '<tr>' +
        '<td>' + esc(v.date||'') + '</td>' +
        '<td><span class="method-badge ' + mi.cls + '">' + mi.label + '</span></td>' +
        '<td class="num"><b>' + (v.estimatedValue||0).toFixed(2) + '</b></td>' +
        '<td class="num">' + (v.actualPrice != null ? v.actualPrice.toFixed(2) : '—') + '</td>' +
        '<td class="num ' + (mos == null ? '' : (mos >= 0 ? 'mos-pos' : 'mos-neg')) + '">' + (mos == null ? '—' : fmtPct(mos)) + '</td>' +
        '<td class="muted" style="max-width:150px">' + esc(v.note || '') + '</td>' +
        '<td class="actions-cell"><button class="icon-btn" data-action="val.editVal" data-id="' + c.id + '" data-vid="' + v.id + '">✎</button><button class="icon-btn" data-action="val.delVal" data-id="' + c.id + '" data-vid="' + v.id + '">✕</button></td>' +
        '</tr>';
    }).join('');
    h += '</tbody></table></div>';
  }
  h += '</div>';

  // 投资记录
  h += '<div class="val-section"><div class="vs-head"><h3>📝 投资买卖记录</h3><button class="btn primary sm" style="background:var(--indigo)" data-action="val.addInv" data-id="' + c.id + '">＋ 添加记录</button></div>';
  const invs = (c.investments||[]).slice().sort((a,b) => (b.date||'').localeCompare(a.date||''));
  if(!invs.length) h += '<div class="empty">还没有投资记录</div>';
  else {
    h += '<div style="overflow-x:auto"><table class="val-table"><thead><tr>' +
      '<th>日期</th><th>操作</th><th class="num">价格</th><th class="num">股数</th><th class="num">金额</th><th>备注</th><th></th>' +
      '</tr></thead><tbody>';
    h += invs.map(inv => {
      const isBuy = inv.action === 'buy';
      return '<tr>' +
        '<td>' + esc(inv.date||'') + '</td>' +
        '<td><span class="badge ' + (isBuy ? 'green' : 'pink') + '">' + (isBuy ? '买入' : '卖出') + '</span></td>' +
        '<td class="num">' + (inv.price||0).toFixed(2) + '</td>' +
        '<td class="num">' + (inv.shares||0) + '</td>' +
        '<td class="num">' + fmtMoney((inv.price||0) * (inv.shares||0)) + '</td>' +
        '<td class="muted">' + esc(inv.note || '') + '</td>' +
        '<td class="actions-cell"><button class="icon-btn" data-action="val.delInv" data-id="' + c.id + '" data-iid="' + inv.id + '">✕</button></td>' +
        '</tr>';
    }).join('');
    h += '</tbody></table></div>';
    if(pos.position > 0){
      h += '<div style="margin-top:10px;font-size:13px;color:var(--ink2)">当前持仓：<b>' + pos.position.toFixed(0) + '</b> 股 · 均成本 <b>' + pos.avgCost.toFixed(2) + '</b>';
      if(pos.realized !== 0) h += ' · 已实现盈亏 <b class="' + (pos.realized >= 0 ? 'up' : 'down') + '">' + fmtMoney(pos.realized) + '</b>';
      h += '</div>';
    }
  }
  h += '</div>';
  return h;
}

/* ----- 扩展 ACTIONS / CHANGES / FORMS ----- */
Object.assign(ACTIONS, {
  'val.fMarket': el => { state.valMarket = el.dataset.v; render(); },
  'val.back': () => { state.valCompanyId = null; render(); },
  'val.openCompany': el => { state.valCompanyId = el.dataset.id; render(); window.scrollTo(0,0); },
  'val.addCompany': () => openModal('添加关注公司',
    '<div class="quick-row"><div class="field" style="flex:1"><label>公司名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required placeholder="如：寒武纪"></div>' +
    '<div class="field" style="flex:none;width:160px"><label>代码</label><input type="text" name="ticker" placeholder="如：00700.HK"></div></div>' +
    '<div class="quick-row"><div class="field" style="flex:1"><label>市场</label><select name="market">' + VAL_MARKETS.map(m => '<option>' + m + '</option>').join('') + '</select></div>' +
    '<div class="field" style="flex:1"><label>行业 / 板块</label><input type="text" name="sector" placeholder="如：互联网科技"></div>' +
    '<div class="field" style="flex:none;width:120px"><label>货币</label><input type="text" name="currency" placeholder="HKD" value="CNY"></div></div>' +
    '<div class="field"><label>当前股价</label><input type="number" step="0.01" name="currentPrice" placeholder="0.00"></div>' +
    mdField('note', '公司备注（业务概况、关注逻辑等，支持 Markdown）', '', 4) +
    '<input type="hidden" name="id" value="">', 'val.saveCompany'),
  'val.editCompany': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    openModal('编辑公司 · ' + c.name,
      '<div class="quick-row"><div class="field" style="flex:1"><label>公司名称 <span style="color:var(--red)">*</span></label><input type="text" name="name" required value="' + esc(c.name) + '"></div>' +
      '<div class="field" style="flex:none;width:160px"><label>代码</label><input type="text" name="ticker" value="' + esc(c.ticker||'') + '"></div></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>市场</label><select name="market">' + VAL_MARKETS.map(m => '<option' + (c.market === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:1"><label>行业 / 板块</label><input type="text" name="sector" value="' + esc(c.sector||'') + '"></div>' +
      '<div class="field" style="flex:none;width:120px"><label>货币</label><input type="text" name="currency" value="' + esc(c.currency||'CNY') + '"></div></div>' +
      '<div class="field"><label>当前股价</label><input type="number" step="0.01" name="currentPrice" value="' + (c.currentPrice||'') + '"></div>' +
      mdField('note', '公司备注', c.note, 4) +
      '<input type="hidden" name="id" value="' + c.id + '">', 'val.saveCompany');
  },
  'val.delCompany': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    if(confirm('确认删除「' + c.name + '」及其所有财务数据、估值记录和投资记录？')){
      DB.valuation.companies = DB.valuation.companies.filter(x => x.id !== c.id);
      // 如果是种子公司，记入 hiddenSeeds，下次 ensure() 不会再加回
      if(c.seed && c.ticker){
        DB.valuation.hiddenSeeds = DB.valuation.hiddenSeeds || [];
        if(!DB.valuation.hiddenSeeds.includes(c.ticker)) DB.valuation.hiddenSeeds.push(c.ticker);
      }
      if(state.valCompanyId === c.id) state.valCompanyId = null;
      save(); render();
    }
  },
  'val.toggleFinSort': el => { state.valFinSort = el.dataset.v; render(); },
  // 财务数据
  'val.addFin': el => { openModal('添加季度财务数据', valFinModalBody(el.dataset.id, null), 'val.saveFin'); setTimeout(()=>window.recalcFinModal&&recalcFinModal(), 30); },
  'val.editFin': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    const f = findById(c.financials, el.dataset.fid); if(!f) return;
    openModal('编辑财务数据 · ' + f.quarter, valFinModalBody(c.id, f), 'val.saveFin');
    setTimeout(()=>window.recalcFinModal&&recalcFinModal(), 30);
  },
  'val.delFin': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    if(confirm('删除这条财务数据？')){ c.financials = c.financials.filter(x => x.id !== el.dataset.fid); save(); render(); }
  },
  // 估值记录
  'val.addVal': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    openModal('添加估值记录 · ' + c.name, valModalBody(c, null), 'val.saveVal');
    setTimeout(recalcValuation, 50);
  },
  'val.editVal': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    const v = findById(c.valuations, el.dataset.vid); if(!v) return;
    openModal('编辑估值记录', valModalBody(c, v), 'val.saveVal');
    setTimeout(() => { recalcValuation(); updateMoSDisplay(); }, 50);
  },
  'val.delVal': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    if(confirm('删除这条估值记录？')){ c.valuations = c.valuations.filter(x => x.id !== el.dataset.vid); save(); render(); }
  },
  // 投资记录
  'val.addInv': el => openModal('添加投资记录',
    valInvModalBody(el.dataset.id, null), 'val.saveInv'),
  'val.delInv': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    if(confirm('删除这条投资记录？')){ c.investments = c.investments.filter(x => x.id !== el.dataset.iid); save(); render(); }
  },
});

function valFinModalBody(cid, f){
  const fields = [
    { key:'revenue',        label:'营收',       unit:'亿', placeholder:'如：1611' },
    { key:'netProfit',      label:'净利润',     unit:'亿', placeholder:'如：476' },
    { key:'grossMargin',    label:'毛利率',     unit:'%',  placeholder:'如：43.2' },
    { key:'opCashFlow',     label:'现金流',     unit:'亿', placeholder:'经营现金流净额，如：420' },
    { key:'assetLiabRatio', label:'资产负债率', unit:'%',  placeholder:'如：45' },
    { key:'roe',            label:'ROE',        unit:'%',  placeholder:'净资产收益率，如：14.8' },
  ];
  let h = '<input type="hidden" name="cid" value="' + cid + '">' +
    '<input type="hidden" name="fid" value="' + (f ? f.id : '') + '">' +
    '<div class="field"><label>季度 <span style="color:var(--red)">*</span></label><input type="text" name="quarter" required value="' + (f ? esc(f.quarter) : '') + '" placeholder="如：2024Q3"></div>' +
    '<div class="param-grid">';
  fields.forEach(({key, label, unit, placeholder}) => {
    const v = f ? f[key] : '';
    h += '<div class="field"><label>' + label + ' <span class="muted">(' + unit + ')</span></label>' +
      '<input type="number" step="0.01" name="m_' + key + '" value="' + (v != null && v !== '' ? v : '') + '" placeholder="' + placeholder + '"></div>';
  });
  h += '</div>' + mdField('note', '备注', f ? f.note : '', 2);
  return h;
}
window.recalcFinModal = function(){ /* 6 个核心指标均为手动输入，无需实时计算 */ };
function valInvModalBody(cid, inv){
  return '<input type="hidden" name="cid" value="' + cid + '">' +
    '<input type="hidden" name="iid" value="' + (inv ? inv.id : '') + '">' +
    '<div class="quick-row"><div class="field" style="flex:none;width:150px"><label>日期</label><input type="date" name="date" value="' + (inv ? inv.date : dateStr()) + '"></div>' +
    '<div class="field" style="flex:none;width:120px"><label>操作</label><select name="action"><option value="buy"' + (inv && inv.action === 'buy' ? ' selected' : '') + '>买入</option><option value="sell"' + (inv && inv.action === 'sell' ? ' selected' : '') + '>卖出</option></select></div></div>' +
    '<div class="quick-row"><div class="field" style="flex:1"><label>价格</label><input type="number" step="0.01" name="price" required value="' + (inv ? inv.price : '') + '"></div>' +
    '<div class="field" style="flex:1"><label>股数</label><input type="number" step="1" name="shares" required value="' + (inv ? inv.shares : '') + '"></div></div>' +
    mdField('note', '备注', inv ? inv.note : '', 2);
}

/* ----- 自定义指标管理 ----- */
function customMetricsModalBody(editKey){
  const cms = customMetrics();
  const ed = editKey ? cms.find(m => m.key === editKey) : null;
  // 单个指标的 key chip
  const chip = m => '<span class="metric-key-chip" onclick="insertMetricKey(\'' + m.key + '\')" title="点击插入 ${' + m.key + '}">' +
    '<code>' + m.key + '</code>' +
    '<span class="muted">' + esc(m.label) + (m.unit ? '(' + esc(m.unit) + ')' : '') + '</span></span>';
  const builtInHtml = METRICS.map(chip).join('');
  // 自定义指标（编辑自身时排除，避免自引用；按 key 字母排序）
  const otherCustoms = cms.filter(cm => !ed || cm.key !== ed.key).slice().sort((a,b) => a.key.localeCompare(b.key));
  const customHtml = otherCustoms.length ? otherCustoms.map(chip).join('') : '<span class="muted" style="font-size:12px">（暂无自定义指标）</span>';

  let h = '';
  if(ed){
    h += '<div class="metric-help"><b>编辑自定义指标</b> · 已有 ' + cms.length + ' 个自定义指标</div>';
  } else {
    h += '<div class="metric-help">自定义指标通过 <code>${key}</code> 引用同季度的其他指标（内置或自定义），结合 <code>+ - * / ( )</code> 计算出新指标。<br><b>点击下方指标 chip</b> 即可插入到公式输入框光标位置。</div>';
  }
  // 表单字段（编辑/新增复用）
  h += '<input type="hidden" name="origKey" value="' + (ed ? ed.key : '') + '">' +
    '<div class="quick-row"><div class="field" style="flex:1"><label>指标 Key（英文，唯一） <span style="color:var(--red)">*</span></label><input type="text" name="key" required value="' + esc(ed ? ed.key : '') + '" placeholder="如：netMargin"></div>' +
    '<div class="field" style="flex:1"><label>显示名 <span style="color:var(--red)">*</span></label><input type="text" name="label" required value="' + esc(ed ? ed.label : '') + '" placeholder="如：销售净利率"></div>' +
    '<div class="field" style="flex:none;width:90px"><label>单位</label><input type="text" name="unit" value="' + esc(ed ? ed.unit : '') + '" placeholder="%"></div></div>' +
    '<div class="field"><label>公式 <span style="color:var(--red)">*</span></label><input type="text" name="formula" required value="' + esc(ed ? ed.formula : '') + '" placeholder="如：${netProfit}/${revenue}*100" oninput="recalcCustomMetricPreview()"></div>' +
    // 可点击的指标列表
    '<div class="metric-help" style="max-height:240px;overflow-y:auto;padding:12px">' +
      '<b style="display:block;margin-bottom:6px">📦 内置指标（点击插入）：</b>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px">' + builtInHtml + '</div>' +
      '<b style="display:block;margin:12px 0 6px">🧮 自定义指标（点击插入）：</b>' +
      '<div style="display:flex;flex-wrap:wrap;gap:4px">' + customHtml + '</div>' +
    '</div>' +
    '<div class="field"><label>预览（基于示例数据）</label><div id="customPreview" style="font-size:18px;font-weight:700;color:var(--indigo);padding:6px 0">—</div></div>';
  return h;
}
window.insertMetricKey = function(key){
  const form = document.querySelector('[data-form="val.saveCustomMetric"]');
  if(!form) return;
  const inp = form.querySelector('[name="formula"]');
  if(!inp) return;
  const insertText = '${' + key + '}';
  const start = (inp.selectionStart != null) ? inp.selectionStart : inp.value.length;
  const end = (inp.selectionEnd != null) ? inp.selectionEnd : inp.value.length;
  inp.value = inp.value.slice(0, start) + insertText + inp.value.slice(end);
  inp.focus();
  const newPos = start + insertText.length;
  inp.setSelectionRange(newPos, newPos);
  window.recalcCustomMetricPreview && window.recalcCustomMetricPreview();
};
window.recalcCustomMetricPreview = function(){
  const form = document.querySelector('[data-form="val.saveCustomMetric"]');
  if(!form) return;
  const formula = form.querySelector('[name="formula"]').value;
  // 用 mock 数据预览
  const mock = { revenue:100, netProfit:20, eps:2.0, bvps:30, grossMargin:40, rdExpense:5, roe:14, ebitda:35,
    opCashFlow:25, capex:8, dAndA:10, assetLiabRatio:35, totalDebt:50, cashBalance:30, marketCap:500,
    dividend:5, dividendYield:2 };
  const v = evalFormula(formula, mock);
  const el = form.querySelector('#customPreview');
  if(el) el.textContent = v != null && !isNaN(v) ? v.toFixed(2) : '公式错误';
};

Object.assign(ACTIONS, {
  'val.metricsConfig': el => {
    // 渲染自定义指标列表
    const cms = customMetrics();
    let body = '<div class="metric-help">自定义指标基于 <code>${key}</code> 引用公式自动计算，会出现在财务表中"自定义"类别。<br>' +
      '当前已有 ' + cms.length + ' 个自定义指标。</div>';
    if(cms.length){
      body += '<div style="margin-bottom:12px">' + cms.map(m =>
        '<div class="custom-chip"><b>' + esc(m.label) + '</b>' + (m.unit ? ' <span class="muted">(' + esc(m.unit) + ')</span>' : '') +
        ' <span class="cm-formula">' + esc(m.formula) + '</span>' +
        '<span class="cm-actions"><button data-action="val.editCustomMetric" data-key="' + esc(m.key) + '" title="编辑">✎</button><button data-action="val.delCustomMetric" data-key="' + esc(m.key) + '" title="删除">✕</button></span></div>'
      ).join('') + '</div>';
    } else {
      body += '<div class="empty">还没有自定义指标</div>';
    }
    body += '<button class="btn primary" style="background:var(--indigo)" data-action="val.addCustomMetric">＋ 添加自定义指标</button>';
    openModal('⚙ 自定义指标管理', body, null);
  },
  'val.addCustomMetric': () => {
    openModal('添加自定义指标', customMetricsModalBody(null), 'val.saveCustomMetric');
    setTimeout(()=>window.recalcCustomMetricPreview&&recalcCustomMetricPreview(), 30);
  },
  'val.editCustomMetric': el => {
    openModal('编辑自定义指标', customMetricsModalBody(el.dataset.key), 'val.saveCustomMetric');
    setTimeout(()=>window.recalcCustomMetricPreview&&recalcCustomMetricPreview(), 30);
  },
  'val.delCustomMetric': el => {
    const k = el.dataset.key;
    if(confirm('删除自定义指标「' + k + '」？')){
      DB.valuation.customMetrics = (DB.valuation.customMetrics || []).filter(m => m.key !== k);
      save(); closeModal(); render();
    }
  },
});

Object.assign(CHANGES, {
  'val.price': el => {
    const c = findById(DB.valuation.companies, el.dataset.id); if(!c) return;
    c.currentPrice = parseFloat(el.value) || 0; save();
  },
});

Object.assign(FORMS, {
  'val.saveCompany': fd => {
    const id = fd.get('id');
    const data = { name:fd.get('name'), ticker:fd.get('ticker')||'', market:fd.get('market')||'A股',
      sector:fd.get('sector')||'', currency:fd.get('currency')||'CNY', currentPrice:parseFloat(fd.get('currentPrice'))||0, note:fd.get('note')||'' };
    if(id){ Object.assign(findById(DB.valuation.companies, id), data); }
    else DB.valuation.companies.push(Object.assign({ id:uid(), financials:[], valuations:[], investments:[] }, data));
    save(); closeModal(); render();
  },
  'val.saveFin': fd => {
    const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
    const fid = fd.get('fid');
    const data = { quarter:fd.get('quarter'), note:fd.get('note')||'' };
    // 收集所有输入指标（m_* 字段）
    METRICS.forEach(m => {
      if(m.source === 'input'){
        const raw = fd.get('m_' + m.key);
        data[m.key] = (raw === '' || raw == null) ? null : parseFloat(raw);
      }
    });
    if(fid){ Object.assign(findById(c.financials, fid), data); }
    else c.financials.push(Object.assign({ id:uid() }, data));
    save(); closeModal(); render();
  },
  'val.saveVal': fd => {
    const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
    const vid = fd.get('id');
    const method = fd.get('method');
    const params = {};
    valMethodInfo(method).fields.forEach(f => { params[f.key] = parseFloat(fd.get('param_' + f.key)) || 0; });
    const estimatedValue = calcValuation(method, params);
    const actualPrice = parseFloat(fd.get('actualPrice')) || 0;
    const data = { date:fd.get('date')||dateStr(), method, params, estimatedValue, actualPrice, note:fd.get('note')||'' };
    if(vid){ Object.assign(findById(c.valuations, vid), data); }
    else c.valuations.push(Object.assign({ id:uid() }, data));
    save(); closeModal(); render();
  },
  'val.saveInv': fd => {
    const c = findById(DB.valuation.companies, fd.get('cid')); if(!c) return;
    const iid = fd.get('iid');
    const data = { date:fd.get('date')||dateStr(), action:fd.get('action'), price:parseFloat(fd.get('price'))||0,
      shares:parseFloat(fd.get('shares'))||0, note:fd.get('note')||'' };
    if(iid){ Object.assign(findById(c.investments, iid), data); }
    else c.investments.push(Object.assign({ id:uid() }, data));
    save(); closeModal(); render();
  },
  'val.saveCustomMetric': fd => {
    const origKey = fd.get('origKey');
    const data = { key:fd.get('key'), label:fd.get('label'), unit:fd.get('unit')||'', formula:fd.get('formula') };
    // 简单校验
    if(!data.key || !data.label || !data.formula){ alert('请填写完整'); return; }
    const cms = DB.valuation.customMetrics = DB.valuation.customMetrics || [];
    // 检查 key 唯一
    const exist = cms.findIndex(m => m.key === data.key);
    if(exist >= 0 && (!origKey || origKey !== data.key)){ alert('指标 Key 已存在，请换一个'); return; }
    if(origKey){
      const idx = cms.findIndex(m => m.key === origKey);
      if(idx >= 0) cms[idx] = data;
    } else {
      cms.push(data);
    }
    save(); closeModal(); render();
  },
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
      if(d && d.fitness && d.job && d.reading && d.side){ DB = ensure(d); save(); render(); alert('导入成功！'); }
      else alert('文件格式不正确');
    }catch(err){ alert('导入失败：' + err.message); }
    e.target.value = '';
  };
  reader.readAsText(file);
});

/* ================= 渲染入口 ================= */
const NAVS = [
  { view:'dashboard', ico:'🏠', label:'总览', group:null },
  { view:'fitness', ico:'🏋️', label:'减脂塑形', group:'重点目标' },
  { view:'job', ico:'💼', label:'求职准备', group:null },
  { view:'reading', ico:'📚', label:'阅读笔记', group:'长期积累' },
  { view:'side', ico:'💡', label:'副业探索', group:null },
  { view:'valuation', ico:'📈', label:'公司估值', group:'投资追踪' },
];
function renderNav(){
  $('#nav').innerHTML = NAVS.map(n =>
    (n.group ? '<div class="nav-group">' + n.group + '</div>' : '') +
    '<a class="nav-item" data-action="nav" data-view="' + n.view + '"><span class="nav-ico">' + n.ico + '</span>' + n.label + '</a>'
  ).join('');
}
function renderKeep(inputKey){
  // 重新渲染但保持搜索框焦点
  const el = document.querySelector('[data-input="' + inputKey + '"]');
  const pos = el ? el.selectionStart : null;
  render();
  const el2 = document.querySelector('[data-input="' + inputKey + '"]');
  if(el2){ el2.focus(); el2.setSelectionRange(pos, pos); }
}
function render(){
  document.querySelectorAll('.nav-item').forEach(a => a.classList.toggle('active', a.dataset.view === state.view));
  const main = $('#main');
  if(state.view === 'dashboard') main.innerHTML = renderDashboard();
  else if(state.view === 'fitness') main.innerHTML = renderFitness();
  else if(state.view === 'job') main.innerHTML = renderJob();
  else if(state.view === 'reading') main.innerHTML = renderReading();
  else if(state.view === 'side') main.innerHTML = renderSide();
  else if(state.view === 'valuation') main.innerHTML = renderValuation();
  typesetMath(main);
}
async function initApp(){
  const main = document.getElementById('main');
  if(main) main.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:60vh"><div style="text-align:center;color:#888"><div style="font-size:32px;margin-bottom:12px">⏳</div>正在加载数据...</div></div>';
  DB = await loadAsync();
  try { await idbSet('data', DB); } catch(e){}
  appReady = true;
  renderNav();
  render();
  updateSyncUI();
}
initApp();
window.addEventListener('load', () => { if(appReady) render(); }); // KaTeX 加载完成后重排公式
