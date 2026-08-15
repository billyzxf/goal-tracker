/* ================= 求职准备（job） ================= */
(function(){
  const TOPIC_CATS = ['推荐算法', '机器学习', '大数据与工程', '系统与架构', '编程语言', '业务与软技能'];
  const TARGET_STAGES = ['想投', '已投递', '笔试', '一面', '二面', '三面', 'HR面', 'offer', '拒信'];
  const TARGET_COLOR = { '想投':'gray', '已投递':'indigo', '笔试':'amber', '一面':'indigo', '二面':'indigo', '三面':'indigo', 'HR面':'green', 'offer':'green', '拒信':'gray' };
  // 供其他模块（如 dashboard 过滤状态、快速入口）在运行时读取
  window.JOB_CONST = { TOPIC_CATS, TARGET_STAGES, TARGET_COLOR };

  function seed(){
    return {
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
    };
  }
  function ensure(db, seedVal){
    const j = db.job;
    j.daily     = j.daily     || [];
    j.plan      = j.plan      || [];
    j.questions = j.questions || [];
    j.topics    = j.topics    || seedVal.topics;   // 旧数据注入默认学习主题
    j.targets   = j.targets   || seedVal.targets;  // 旧数据注入默认求职目标
  }
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

  Register.module({
    view: 'job',
    nav: { ico:'💼', label:'求职准备', group:null },
    seed: seed,
    ensure: ensure,
    render: renderJob,
    actions: {
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
    },
    changes: {
      'job.toggleDaily': el => { findById(DB.job.daily, el.dataset.id).done = el.checked; save(); render(); },
      'job.togglePlan': el => { findById(DB.job.plan, el.dataset.id).done = el.checked; save(); render(); },
      'job.topicLevel': el => {
        const t = findById(DB.job.topics, el.dataset.id); if(!t) return;
        t.level = +el.value; save();
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
    },
    inputs: {
      'job.q': el => { state.jobQ = el.value; renderKeep('job.q'); },
    },
    forms: {
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
    },
  });
})();
