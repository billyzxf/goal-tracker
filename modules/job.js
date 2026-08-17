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
      ],
      // 工作项目深化（把普通项目做成 P7 级项目：量化业务价值 + 讲清技术复杂度 + 沉淀方法论）
      deepProjects: [
        { id:uid(), name:'推荐排序模型升级项目', p7Goal:'把「排序模型升级」讲成 P7 级：量化业务收益（CTR/时长/留存提升）、讲清技术难点（多目标、实时性、稳定性）、沉淀可复用方法论。',
          stage:'链路还原', metrics:'AB：CTR +3.2%、人均时长 +1.8%；核心难点：多目标权重调优、特征延迟、模型回滚机制。',
          techPoints:'双塔召回 + DeepFM 精排 → 多目标排序（ESMM）；线上特征一致性校验；AB 实验平台与显著性检验。',
          progress:45, nextAction:'梳理模型上线前后的特征链路图，标出可量化收益点。',
          notes:[{ id:uid(), date:dateStr(), text:'已画出精排模型演进时间线：LR → FM → DeepFM → ESMM，标注每次迭代的收益来源。' }] },
        { id:uid(), name:'实时特征平台建设', p7Goal:'体现工程复杂度与业务价值：从 0 到 1 搭建实时特征平台，支撑在线推荐低延迟决策。',
          stage:'素材梳理', metrics:'特征时效从 T+1 降到秒级；覆盖核心场景 80% 特征；P99 延迟 <50ms。',
          techPoints:'Flink 实时计算、特征一致性校验、离线实时对账、降级与容灾。',
          progress:20, nextAction:'整理平台架构图与关键指标（延迟、吞吐、覆盖率）。',
          notes:[] }
      ]
    };
  }
  function ensure(db, seedVal){
    const j = db.job;
    j.daily     = j.daily     || [];
    j.plan      = j.plan      || [];
    j.topics    = j.topics    || seedVal.topics;   // 旧数据注入默认学习主题
    j.targets   = j.targets   || seedVal.targets;  // 旧数据注入默认求职目标
    j.deepProjects = j.deepProjects || [];         // 旧数据兼容：工作项目深化
  }
  // 工作项目深化阶段
  const DEEP_STAGES = ['素材梳理', '链路还原', '量化指标', '方案验证', '复盘沉淀'];

  // 单个深化项目卡（可展开：目标 / 指标 / 技术亮点 / 深化记录）
  function deepCardHTML(p){
    const open = state.jobDeepOpen === p.id;
    const stage = p.stage || '素材梳理';
    const stc = { '素材梳理':'gray', '链路还原':'indigo', '量化指标':'amber', '方案验证':'green', '复盘沉淀':'pink' }[stage] || 'gray';
    const notes = (p.notes || []).slice().sort((a, b) => b.date.localeCompare(a.date));
    let h = '<div class="deep-card ' + (open ? 'open' : '') + '">';
    // 头部：点击展开
    h += '<div class="deep-head" data-action="job.toggleDeep" data-id="' + p.id + '">' +
      '<div class="deep-title">' + esc(p.name) +
        '<span class="badge ' + stc + '">' + esc(stage) + '</span></div>' +
      '<span class="deep-chevron">' + (open ? '▾' : '▸') + '</span></div>';
    // 进度条 + 最近进展
    const lvl = p.progress || 0;
    h += '<div class="deep-prog"><div class="deep-prog-label">深化进度 <b>' + lvl + '%</b></div>' +
      '<input type="range" min="0" max="100" step="5" value="' + lvl + '" data-change="job.deepLevel" data-id="' + p.id + '"></div>';
    h += '<div class="deep-next">▶ 下一步：' + (p.nextAction ? esc(p.nextAction) : '<span class="muted">未设定</span>') + '</div>';
    h += '<div class="deep-actions">' +
      '<button class="icon-btn" title="编辑项目" data-action="job.editDeep" data-id="' + p.id + '">✎</button>' +
      '<button class="icon-btn" title="添加深化记录" data-action="job.addDeepNote" data-id="' + p.id + '">📝</button>' +
      '<button class="icon-btn" title="删除" data-action="job.delDeep" data-id="' + p.id + '">✕</button></div>';
    if(open){
      h += '<div class="deep-body">' +
        '<div class="deep-field"><div class="deep-field-label">🎯 P7 目标</div><div class="md">' + md(p.p7Goal || '') + '</div></div>' +
        '<div class="deep-field"><div class="deep-field-label">📊 量化指标</div><div class="md">' + md(p.metrics || '') + '</div></div>' +
        '<div class="deep-field"><div class="deep-field-label">⚙️ 技术亮点 / 复杂度</div><div class="md">' + md(p.techPoints || '') + '</div></div>' +
        '<div class="deep-field"><div class="deep-field-label">▶ 下一步</div><div class="md">' + md(p.nextAction || '') + '</div></div>' +
        '<div class="deep-field"><div class="deep-field-label">📒 深化记录（' + notes.length + '）</div><div class="deep-notes">' +
        (notes.length ? notes.map(n =>
          '<div class="deep-note"><div class="deep-note-head"><span class="muted">' + n.date + '</span>' +
          '<button class="icon-btn" title="删除" data-action="job.delDeepNote" data-id="' + p.id + '" data-nid="' + n.id + '">✕</button></div>' +
          '<div class="md">' + md(n.text) + '</div></div>').join('') : '<div class="empty">还没有深化记录</div>') +
        '</div></div></div>';
    }
    h += '</div>';
    return h;
  }

  // 深化项目编辑弹窗表单（新建 + 编辑共用）
  function deepFormBody(p){
    const v = k => p ? (p[k] != null ? p[k] : '') : '';
    return '<input type="hidden" name="id" value="' + (p ? p.id : '') + '">' +
      '<div class="field"><label>项目名称 *</label><input type="text" name="name" required value="' + esc(v('name')) + '" placeholder="如：推荐排序模型升级项目"></div>' +
      '<div class="quick-row"><div class="field" style="flex:1"><label>当前阶段</label><select name="stage">' +
        DEEP_STAGES.map(s => '<option value="' + s + '"' + ((p ? p.stage : '素材梳理') === s ? ' selected' : '') + '>' + s + '</option>').join('') +
      '</select></div>' +
      '<div class="field" style="flex:none;width:180px"><label class="lvl-label">深化进度 ' + (p ? (p.progress||0) : 0) + '%</label><input type="range" name="progress" min="0" max="100" step="5" value="' + (p ? (p.progress||0) : 0) + '" oninput="this.closest(\'.field\').querySelector(\'.lvl-label\').textContent=\'深化进度 \'+this.value+\'%\'"></div></div>' +
      mdField('p7Goal', '🎯 P7 目标（做成什么样算 P7 级：量化业务收益 + 技术复杂度 + 可复用方法论）', v('p7Goal'), 3) +
      mdField('metrics', '📊 量化指标（业务收益 / 技术指标）如：AB CTR +3.2%、人均时长 +1.8%、P99 延迟 <50ms', v('metrics'), 3) +
      mdField('techPoints', '⚙️ 技术亮点 / 复杂度（模型 / 架构 / 难点与解法）', v('techPoints'), 3) +
      '<div class="field"><label>▶ 下一步</label><input type="text" name="nextAction" value="' + esc(v('nextAction')) + '" placeholder="30 分钟内能开始的一步"></div>';
  }

  function renderJob(){
    const j = DB.job;
    const done = j.plan.filter(x => x.done).length, pct = j.plan.length ? done / j.plan.length * 100 : 0;

    let h = header('💼 求职准备', '每天进步一点，offer 就近一点 · ' + fmtCN());

    // 快速入口链接：刷题 + Kaggle 实战
    h += '<div class="job-links">' +
      '<a href="https://labuladong.online/zh/algo/home/" target="_blank" rel="noopener" class="job-link"><span class="job-link-ico">⌨️</span><span><b>算法刷题</b><i>labuladong 算法笔记 · 高频题模板</i></span></a>' +
      '<a href="https://www.kaggle.com/competitions" target="_blank" rel="noopener" class="job-link"><span class="job-link-ico">🏆</span><span><b>Kaggle 实战</b><i>真实竞赛 · 练模型与特征工程</i></span></a>' +
      '</div>';

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

    // 工作项目深化（把项目做成 P7 级）
    h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--pink)"></span>工作项目深化 <span class="muted" style="font-weight:400">（把普通项目做成 P7 级）</span></h2>' +
      '<button class="btn ghost sm" data-action="job.addDeep">＋ 添加项目</button></div>' +
      '<div class="muted" style="font-size:12px;margin-bottom:12px">围绕「业务价值量化 + 技术复杂度 + 可复用方法论」逐层深化，面试时把一个项目讲透。</div>';
    if(!j.deepProjects.length) h += '<div class="empty">还没有深化项目，点击右上角添加</div>';
    h += j.deepProjects.map(deepCardHTML).join('');
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
      // 工作项目深化
      'job.toggleDeep': el => { const id = el.dataset.id; state.jobDeepOpen = (state.jobDeepOpen === id ? null : id); render(); },
      'job.addDeep': () => openModal('＋ 添加深化项目', deepFormBody(null), 'job.saveDeep'),
      'job.editDeep': el => {
        const p = findById(DB.job.deepProjects, el.dataset.id); if(!p) return;
        openModal('✎ 编辑深化项目 · ' + p.name, deepFormBody(p), 'job.saveDeep');
      },
      'job.delDeep': el => { if(confirm('删除这个深化项目？')){ DB.job.deepProjects = DB.job.deepProjects.filter(x => x.id !== el.dataset.id); save(); render(); } },
      'job.addDeepNote': el => {
        const p = findById(DB.job.deepProjects, el.dataset.id); if(!p) return;
        openModal('📝 深化记录 · ' + p.name,
          '<div class="field"><label>日期</label><input type="date" name="date" value="' + dateStr() + '"></div>' +
          mdField('text', '这次深化做了什么？（还原链路 / 量化指标 / 复盘方法…）', '', 6) +
          '<input type="hidden" name="cid" value="' + p.id + '">', 'job.saveDeepNote');
      },
      'job.delDeepNote': el => {
        const p = findById(DB.job.deepProjects, el.dataset.id); if(!p) return;
        if(confirm('删除这条深化记录？')){ p.notes = (p.notes || []).filter(x => x.id !== el.dataset.nid); save(); render(); }
      },
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
      'job.deepLevel': el => {
        const p = findById(DB.job.deepProjects, el.dataset.id); if(!p) return;
        p.progress = +el.value; save();
        const card = el.closest('.deep-card'); if(!card) return;
        const lbl = card.querySelector('.deep-prog-label b'); if(lbl) lbl.textContent = p.progress + '%';
      },
    },
    inputs: {
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
      'job.saveDeep': fd => {
        const id = fd.get('id');
        const data = { name:fd.get('name'), stage:fd.get('stage') || '素材梳理', progress:+fd.get('progress') || 0,
          p7Goal:fd.get('p7Goal') || '', metrics:fd.get('metrics') || '', techPoints:fd.get('techPoints') || '', nextAction:fd.get('nextAction') || '' };
        if(!data.name){ alert('请填写项目名称'); return; }
        if(id){ Object.assign(findById(DB.job.deepProjects, id), data); }
        else DB.job.deepProjects.push(Object.assign({ id:uid(), notes:[] }, data));
        save(); closeModal(); render();
      },
      'job.saveDeepNote': fd => {
        const p = findById(DB.job.deepProjects, fd.get('cid')); if(!p) return;
        p.notes = p.notes || [];
        p.notes.push({ id:uid(), date:fd.get('date') || dateStr(), text:fd.get('text') });
        save(); closeModal(); render();
      },
    },
  });
})();
