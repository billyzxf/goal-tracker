/* ================= 门槛追踪（threshold） =================
 * 追踪各项目上「无法行动的障碍（门槛）」，帮用户降低启动成本、提供行动方向。
 *
 * 数据结构（每张门槛卡）：
 *   {
 *     id, name, goal,               // 项目名 + 项目目标（一句话）
 *     status,                       // 待识别 / 门槛转移中 / 已跨越 / 已沉淀
 *     thresholdTypes: [],           // 门槛类型多选：认知/技能/方法/资源/时间/环境/决策/心理
 *     obstacleDesc,                 // 门槛具体描述（"我卡在什么感觉上"）
 *     transferPlan,                 // 门槛转移方案（工具/AI/方式）
 *     outsourcePart,                // 外包给工具的部分
 *     internalPart,                 // 必须自己内化的部分
 *     nextAction,                   // 下一个最小动作（30分钟内能开始）
 *     feedbackLoop,                 // 预期反馈回路（做完后多久看到结果）
 *     notes: [{ id, date, text }],  // 克服记录
 *     createdAt
 *   }
 * 看板式布局：按 status 分四列。顶部显示门槛类型分布统计。
 */
(function(){
  // 看板四列 = 四个状态
  const TH_STATUSES = ['待识别', '门槛转移中', '已跨越', '已沉淀'];
  const TH_STATUS_ICO = { '待识别':'🔍', '门槛转移中':'🔄', '已跨越':'✅', '已沉淀':'🧭' };
  // 卡片主题色（列头圆点 / 卡片左侧色条 / 状态徽章）
  const TH_STATUS_COLOR = { '待识别':'amber', '门槛转移中':'indigo', '已跨越':'green', '已沉淀':'gray' };
  // 门槛类型（多选）——参考「门槛自检」8 类划分
  // key:类型名；feeling:核心感觉；signal:识别信号（心里/嘴里怎么说）；transfer:转移方向；desc:一句话说明
  const TH_TYPES = [
    { key:'认知', label:'认知', ico:'🧠', feeling:'我看不懂', signal:'“这术语啥意思？”“没学过”', transfer:'AI讲解、找课程、读入门书', desc:'看不懂、不会、知识储备不够' },
    { key:'技能', label:'技能', ico:'🛠️', feeling:'我不会做', signal:'“我知道要这样，但做不出来”', transfer:'AI代做、找模板、买服务', desc:'知道目标但手上做不出来' },
    { key:'方法', label:'方法', ico:'🧭', feeling:'我不知道怎么做', signal:'“该先干嘛？步骤是啥？”', transfer:'AI拆步骤、找对标案例', desc:'不知道步骤、方法太多不会选' },
    { key:'资源', label:'资源', ico:'📦', feeling:'我没有', signal:'“缺素材/数据/工具”', transfer:'API、素材库、购买', desc:'没数据、没素材、没工具、拿不到' },
    { key:'时间', label:'时间', ico:'⏰', feeling:'我没时间', signal:'“安排不过来”“被占满了”', transfer:'重排优先级、碎片时间、砍低价值事', desc:'时间被占满、安排不过来' },
    { key:'环境', label:'环境', ico:'🌤️', feeling:'条件不允许', signal:'“太热/太远/没场地”', transfer:'换时间、换地点、创造条件', desc:'客观条件/场地/设备不允许' },
    { key:'决策', label:'决策', ico:'⚖️', feeling:'我不知道选哪个', signal:'“去哪？选哪个方案？”', transfer:'预设清单、缩小选项、让AI推荐', desc:'选项太多、无法抉择' },
    { key:'心理', label:'心理', ico:'💭', feeling:'我不敢', signal:'“没准备好”“怕做不好”', transfer:'最小闭环、降低期待、先做再说', desc:'怕失败、怕白做、完美主义、觉得没准备好' },
  ];
  const TH_TYPE_MAP = TH_TYPES.reduce((m, t) => (m[t.key] = t, m), {});
  // 旧类型名 → 新类型名（兼容早期 4 类：流程→方法、数据→资源）
  const TH_TYPE_ALIAS = { '流程':'方法', '数据':'资源' };
  // 规范化门槛类型名：旧名映射到新名，未知名原样返回
  function normType(k){ return TH_TYPE_ALIAS[k] || k; }
  window.TH_CONST = { TH_STATUSES, TH_TYPES, TH_STATUS_COLOR };

  function seed(){
    return {
      cards: [
        { id:uid(), name:'搭建个人投资组合跟踪表', goal:'用一张表看清全市场持仓与收益，避免漏看个股。', status:'门槛转移中',
          thresholdTypes:['资源','方法'],
          obstacleDesc:'数据散在东方财富、同花顺、雪球，手动粘贴太耗时，不知道统一格式怎么定。',
          transferPlan:'用 python 脚本 + 东财公开接口自动抓取财务/行情，落到统一 CSV。',
          outsourcePart:'行情与财务数据的自动抓取、格式清洗、增量更新。',
          internalPart:'组合的行业配比判断、每只股票的跟踪逻辑、止盈止损阈值设定。',
          nextAction:'跑通 fetch_financial.py 抓取第一只股票并核对数值。',
          feedbackLoop:'30 分钟内能跑通第一只，1 小时内能批量抓完所有股票。',
          notes:[], createdAt:dateStr() },
        { id:uid(), name:'更新我的估值方法论文章', goal:'把 DCF + 多方法估值实践写成可复用教程。', status:'待识别',
          thresholdTypes:['认知','心理'],
          obstacleDesc:'觉得自己估值模型理解得还不够透，怕写出来被同行挑毛病。',
          transferPlan:'先列大纲，用 AI 帮忙梳理逻辑漏洞，再逐节写。',
          outsourcePart:'查资料、整理案例、初稿润色。',
          internalPart:'估值逻辑的最终判断、结论与个人观点。',
          nextAction:'30 分钟内先写出大纲的 5 个小标题。',
          feedbackLoop:'写完后 1 周内看有没有读者反馈或纠错。',
          notes:[], createdAt:dateStr() },
      ]
    };
  }
  function ensure(db){
    db.threshold.cards = db.threshold.cards || [];
    // 数据迁移：把早期 4 类门槛名（流程/数据）规范化到新 8 类（方法/资源），并清理未知名
    db.threshold.cards.forEach(c => {
      if(c.thresholdTypes && c.thresholdTypes.length){
        c.thresholdTypes = c.thresholdTypes.map(normType).filter(k => !!TH_TYPE_MAP[k]);
      }
    });
  }

  /* ----- 状态计数 / 门槛类型统计 ----- */
  function statusCount(status){ return DB.threshold.cards.filter(c => c.status === status).length; }
  // 8 种门槛各有多少项目「卡着」（不含已跨越/已沉淀）
  function typeStats(){
    const stats = TH_TYPES.map(t => ({ key:t.key, label:t.label, ico:t.ico, count:0 }));
    DB.threshold.cards.forEach(c => {
      if(c.status === '已跨越' || c.status === '已沉淀') return; // 已解决的不计入"卡着"
      (c.thresholdTypes || []).forEach(k => { const s = stats.find(x => x.key === normType(k)); if(s) s.count++; });
    });
    return stats;
  }

  /* ----- 门槛类型标签（多选 → 多个 badge，hover 显示核心感觉/识别信号/转移方向） ----- */
  const TH_TYPE_CLS = { '认知':'indigo', '技能':'pink', '方法':'amber', '资源':'gray', '时间':'green', '环境':'blue', '决策':'orange', '心理':'red' };
  function typeBadges(types){
    return (types || []).map(k => {
      const kk = normType(k);
      const t = TH_TYPE_MAP[kk];
      if(!t) return '';
      const cls = TH_TYPE_CLS[kk] || 'gray';
      const tip = t.feeling + '｜' + t.signal + '｜转移：' + t.transfer;
      return '<span class="badge ' + cls + '" title="' + esc(tip) + '">' + t.ico + ' ' + t.label + '</span>';
    }).join('') || '<span class="muted">（未选门槛类型）</span>';
  }

  // 已选门槛类型的「转移方向」汇总（在展开区展示，帮用户看到该往哪个方向转移）
  function typeTransfers(types){
    const list = (types || []).map(k => { const t = TH_TYPE_MAP[normType(k)]; return t ? t : null; }).filter(Boolean);
    if(!list.length) return '';
    return '<div class="th-transfer-tip"><div class="th-transfer-title">💡 建议转移方向</div>' +
      list.map(t => '<div class="th-transfer-item">' + t.ico + ' <b>' + t.label + '</b>：' + esc(t.transfer) + '</div>').join('') +
      '</div>';
  }

  /* ----- 卡片字段行（展开用） -----
   * isMd  : true → 用 md() 渲染（支持 Markdown 语法）
   * isHtml: true → 原样输出 HTML（调用方需自担安全，例如来自 typeBadges 等内部渲染器）
   * 默认  : esc() 转义纯文本
   */
  function fieldRow(label, value, mode){
    if(value == null || String(value).trim() === '') return '';
    let body;
    if(mode === 'html') body = value; // typeBadges 等已渲染好的 HTML，原样插入
    else if(mode === 'md') body = md(value);
    else body = esc(value);
    return '<div class="th-field"><div class="th-field-label">' + label + '</div><div class="th-field-val">' + body + '</div></div>';
  }

  /* ----- 单张门槛卡（折叠时只显示概要，点击展开全部字段） ----- */
  function cardHTML(c){
    const color = TH_STATUS_COLOR[c.status];
    const isOpen = state.thOpen === c.id; // 是否展开
    const notes = (c.notes || []).slice().sort((a,b) => b.date.localeCompare(a.date));
    let h = '<div class="th-card ' + (isOpen ? 'open' : '') + '" style="--thc:' + (color === 'amber' ? 'var(--amber)' : color === 'green' ? 'var(--green)' : color === 'gray' ? 'var(--gray)' : 'var(--indigo)') + '">';
    // 卡片头：点击整卡展开/收起
    h += '<div class="th-card-head" data-action="th.toggle" data-id="' + c.id + '">' +
      '<div class="th-card-title">' + esc(c.name) +
        (c.goal ? '<div class="th-card-goal">' + esc(c.goal) + '</div>' : '') +
      '</div>' +
      '<span class="th-chevron">' + (isOpen ? '▾' : '▸') + '</span></div>';
    // 概要行：门槛类型标签 + 状态徽章 + 最小动作
    h += '<div class="th-card-meta">' + typeBadges(c.thresholdTypes) + '</div>';
    h += '<div class="th-next-action"><span class="th-na-label">▶ 最小动作</span>' +
      (c.nextAction ? esc(c.nextAction) : '<span class="muted">未设定</span>') + '</div>';
    h += '<div class="th-card-status" data-action="th.toggle" data-id="' + c.id + '">' +
      '<span class="badge ' + color + '">' + TH_STATUS_ICO[c.status] + ' ' + c.status + '</span></div>';
    // 操作按钮
    h += '<div class="th-card-actions">' +
      '<button class="icon-btn" title="编辑门槛卡" data-action="th.edit" data-id="' + c.id + '">✎</button>' +
      '<button class="icon-btn" title="状态→已跨越" data-action="th.status" data-id="' + c.id + '" data-v="已跨越">✅</button>' +
      '<button class="icon-btn" title="添加克服记录" data-action="th.addNote" data-id="' + c.id + '">📝</button>' +
      '<button class="icon-btn" title="删除" data-action="th.del" data-id="' + c.id + '">✕</button></div>';

    // 展开区：全部字段 + 克服记录
    if(isOpen){
      h += '<div class="th-card-body">' +
        fieldRow('🎯 项目目标', c.goal) +
        fieldRow('🧩 门槛类型', typeBadges(c.thresholdTypes), 'html') +
        typeTransfers(c.thresholdTypes) +
        fieldRow('🚧 我卡在什么感觉上', c.obstacleDesc, 'md') +
        fieldRow('🛠 门槛转移方案', c.transferPlan, 'md') +
        fieldRow('🤖 外包给工具的部分', c.outsourcePart) +
        fieldRow('🧠 必须自己内化的部分', c.internalPart) +
        fieldRow('▶ 下一个最小动作', c.nextAction) +
        fieldRow('⏱ 预期反馈回路', c.feedbackLoop) +
        '<div class="th-field"><div class="th-field-label">📌 状态</div><div class="th-field-val">' +
          '<select data-change="th.status" data-id="' + c.id + '" class="th-status-select">' +
          TH_STATUSES.map(s => '<option value="' + s + '"' + (c.status === s ? ' selected' : '') + '>' + s + '</option>').join('') +
          '</select></div></div>' +
        // 克服记录
        '<div class="th-notes"><div class="th-notes-title">📒 克服记录（' + notes.length + '）</div>' +
        (notes.length
          ? notes.map(n => '<div class="th-note"><div class="th-note-head"><span class="muted">' + n.date + '</span>' +
              '<button class="icon-btn" title="删除" data-action="th.delNote" data-id="' + c.id + '" data-nid="' + n.id + '">✕</button></div>' +
              '<div class="md">' + md(n.text) + '</div></div>').join('')
          : '<div class="empty">还没有克服记录 · 每次跨越后记录一句「这个门槛是怎么被抹平的」</div>') +
        '</div>' +
        '</div>';
    }
    h += '</div>';
    return h;
  }

  /* ----- 看板视图 ----- */
  function renderThreshold(){
    const cards = DB.threshold.cards;
    const stats = typeStats();

    let h = header('🚧 门槛追踪', '拆解「无法行动的障碍」，降低启动成本 · 共 ' + cards.length + ' 张门槛卡',
      '<button class="btn ghost sm" data-action="th.check" title="面对新项目无法行动时，按问题逐项自检">🧾 门槛自检</button>' +
      '<button class="btn ghost sm" data-action="th.fromIdea" title="从灵感速记直接创建门槛卡">💡 从灵感创建</button>' +
      '<button class="btn primary" style="background:var(--indigo)" data-action="th.add">＋ 新门槛卡</button>');

    // —— 门槛自检引导横幅 ——
    h += '<div class="th-banner" data-action="th.check"><div class="th-banner-ico">🧾</div>' +
      '<div class="th-banner-txt"><b>面对新项目，卡住动不了？</b>' +
      '<div class="th-banner-sub">按顺序回答 5 个问题，自动判断你的门槛类型并给出转移建议</div></div>' +
      '<button class="btn primary sm" style="background:var(--indigo);flex:none">开始自检</button></div>';

    // —— 门槛类型分布统计 ——
    h += '<div class="th-stats">' + stats.map(s =>
      '<div class="th-stat"><span class="th-stat-ico">' + s.ico + '</span>' +
      '<div><div class="th-stat-num">' + s.count + '</div>' +
      '<div class="th-stat-label">' + s.label + '门槛</div></div></div>').join('') +
      '</div>';

    // —— 看板四列 ——
    h += '<div class="th-board">' + TH_STATUSES.map(st => {
      const list = cards.filter(c => c.status === st);
      const color = TH_STATUS_COLOR[st];
      return '<div class="th-col">' +
        '<div class="th-col-head" style="--thc:' + (color === 'amber' ? 'var(--amber)' : color === 'green' ? 'var(--green)' : color === 'gray' ? 'var(--gray)' : 'var(--indigo)') + '">' +
          '<span class="th-col-dot"></span>' + TH_STATUS_ICO[st] + ' ' + st +
          '<span class="th-col-count">' + list.length + '</span></div>' +
        '<div class="th-col-body">' +
          (list.length ? list.map(cardHTML).join('') : '<div class="empty">暂无</div>') +
        '</div></div>';
    }).join('') + '</div>';
    return h;
  }

  /* ================= 门槛自检清单 =================
   * 面对新项目无法行动时，按顺序回答 5 个问题，自动判断门槛类型并给出转移建议。
   * 决策树：
   *   Q1 看不懂/不想做 → 看不懂=认知；不想做→Q2
   *   Q2 不知道开始/知道但麻烦 → 不知道=方法；知道但麻烦→Q3
   *   Q3 缺资料数据工具? → 缺=资源；不缺→Q4
   *   Q4 等准备好才行动? → 是=心理；不是→Q5
   *   Q5 反馈多久? → 太长=反馈回路优化；还行=可直接启动
   */
  const TH_CHECK = [
    { q:'Q1 · 这件事我"看不懂"还是"不想做"？', options:[
      { k:'不懂', label:'😕 看不懂', next:'end:认知' },
      { k:'不想', label:'🙄 不想做', next:'Q2' },
    ]},
    { q:'Q2 · 我"不知道怎么开始"还是"知道但觉得麻烦"？', options:[
      { k:'不知', label:'🤯 不知道怎么开始', next:'end:方法' },
      { k:'麻烦', label:'🥱 知道但觉得麻烦', next:'Q3' },
    ]},
    { q:'Q3 · 这件事缺"资料/数据/工具"吗？', options:[
      { k:'缺', label:'📉 缺，拿不到', next:'end:资源' },
      { k:'不缺', label:'✅ 资料工具都有', next:'Q4' },
    ]},
    { q:'Q4 · 我是不是在等"准备好"才行动？', options:[
      { k:'等', label:'⏳ 是，总觉得没准备好', next:'end:心理' },
      { k:'不等', label:'🏃 不是，可以马上做', next:'Q5' },
    ]},
    { q:'Q5 · 做完最小闭环后，我多久能拿到反馈？', options:[
      { k:'长', label:'🐢 要很久才有反馈', next:'end:反馈' },
      { k:'快', label:'⚡ 很快能看到结果', next:'end:无' },
    ]},
  ];
  // 自检结果：门槛类型 + 转移方案 + 下一个最小动作（可直接用于创建门槛卡）
  const TH_CHECK_RESULT = {
    '认知': { types:['认知'], ico:'🧠', title:'认知门槛', advice:'让 AI 解释，先搞懂 30% 就够启动，不用全懂。',
      action:'用一句话向 AI 提问，请它用大白话讲清核心概念；记住"懂 30% 就能开始"。' },
    '方法': { types:['方法'], ico:'🧭', title:'方法门槛', advice:'让 AI 拆解成 5 步以内，别想全流程，先做第 1 步。',
      action:'让 AI 列出不超过 5 步的启动清单，然后只执行第 1 步（30 分钟内）。' },
    '资源': { types:['资源'], ico:'📦', title:'资源门槛', advice:'找 API / 工具 / 现成模板，先拿一份数据试试，别自己造轮子。',
      action:'搜索可用的 API / 工具 / 模板，获取第一份示例数据并跑通。' },
    '心理': { types:['心理'], ico:'💭', title:'心理门槛', advice:'做 30 分钟最小闭环，用行动代替准备；"没准备好"往往是完美主义。',
      action:'设 30 分钟计时，做最小闭环的第一步，先求完成再求完美。' },
    '反馈': { types:[], ico:'⏱', title:'反馈回路待优化', advice:'反馈太长会消磨动力，把任务拆成更小、更快看到结果的步骤。',
      action:'把当前任务再拆小，让每一步 ≤30 分钟且做完就能看到结果。' },
    '无': { types:[], ico:'🚀', title:'门槛较轻，可直接启动', advice:'你的启动障碍不大，问题可能只是缺一个开始的动作。',
      action:'今天就开始第 1 步，别等"准备好"，先做起来。' },
  };
  function thCheckQHTML(qi, idx){
    return '<div class="th-check-step">' +
      '<div class="th-check-progress">第 ' + (idx + 1) + ' / 5 题</div>' +
      '<div class="th-check-q">' + esc(qi.q) + '</div>' +
      '<div class="th-check-options">' + qi.options.map(o =>
        '<button type="button" class="btn th-check-opt" data-action="th.checkPick" data-idx="' + idx + '" data-next="' + o.next + '">' + o.label + '</button>'
      ).join('') + '</div></div>';
  }
  // 判断并渲染结果（含"创建门槛卡"按钮，把结果沉淀下来）
  function thCheckResultHTML(res, name){
    const r = TH_CHECK_RESULT[res];
    const types = (r.types || []).join(',');
    return '<div class="th-check-result">' +
      '<div class="th-check-res-ico">' + r.ico + '</div>' +
      '<div class="th-check-res-title">判断结果：' + r.title + '</div>' +
      '<div class="th-check-res-item"><b>🧩 门槛类型</b><div>' + (r.types.length ? typeBadges(r.types) : '<span class="badge gray">—</span>') + '</div></div>' +
      '<div class="th-check-res-item"><b>🛠 转移方案</b><div>' + esc(r.advice) + '</div></div>' +
      '<div class="th-check-res-item"><b>▶ 下一个最小动作</b><div>' + esc(r.action) + '</div></div>' +
      '<div class="th-check-res-item"><b>🗂 项目名称（可选）</b>' +
        '<input type="text" id="thCheckName" class="th-check-input" value="' + esc(name || '') + '" placeholder="把这个结果存成一张门槛卡？"></div>' +
      '<div style="display:flex;gap:8px;margin-top:14px">' +
        '<button type="button" class="btn ghost sm" data-action="th.checkRestart">↺ 重新自检</button>' +
        '<button type="button" class="btn primary sm" style="background:var(--indigo)" data-action="th.checkSave" data-types="' + esc(types) + '" data-action-text="' + esc(r.action) + '" data-advice="' + esc(r.advice) + '">📌 存为门槛卡</button>' +
      '</div></div>';
  }
  // 全局步进状态：记录已答题目（用于展示进度）
  window.thCheckState = { step:0, name:'' };

  // 渲染自检向导（第一题）
  function thCheckModal(name){
    window.thCheckState = { step:0, name: name || '' };
    const qi = TH_CHECK[0];
    openModal('🧾 门槛自检', 
      '<div class="th-check-wrap">' +
      '<div class="th-check-hint">遇到新项目动不了？按顺序回答，自动判断门槛并给建议。</div>' +
      thCheckQHTML(qi, 0) + '</div>',
      null, null, true); // readOnly=true：只保留关闭按钮，避免出现无意义的"保存"触发表单提交
  }
  // 处理自检选项点击（推进到下一题或展示结果）
  function thCheckPick(btn){
    const idx = parseInt(btn.dataset.idx, 10);
    const next = btn.dataset.next;
    window.thCheckState.step = idx + 1;
    const wrap = btn.closest('.th-check-wrap');
    if(!wrap) return;
    if(next.startsWith('end:')){
      const res = next.slice(4);
      wrap.innerHTML = thCheckResultHTML(res, window.thCheckState.name);
    } else {
      const nextIdx = Number(next.slice(1)) - 1; // 'Q2' → 1
      const qi = TH_CHECK[nextIdx];
      wrap.innerHTML = thCheckQHTML(qi, nextIdx);
    }
  }
  // 暴露给事件委托用的钩子：th.checkPick / th.checkRestart / th.checkSave / th.check
  window.thCheckPick = thCheckPick;

  /* ----- 门槛卡编辑弹窗表单（新建 + 编辑共用） ----- */
  function thFormBody(c){
    const v = k => c ? (c[k] != null ? c[k] : '') : '';
    return '<input type="hidden" name="id" value="' + (c ? c.id : '') + '">' +
      '<div class="field"><label>项目名称 *</label><input type="text" name="name" required value="' + esc(v('name')) + '" placeholder="如：搭一个自动估值表"></div>' +
      '<div class="field"><label>项目目标（一句话）</label><input type="text" name="goal" value="' + esc(v('goal')) + '" placeholder="这个项目最终想达成什么？"></div>' +
      '<div class="field"><label>当前状态</label><select name="status">' +
        TH_STATUSES.map(s => '<option value="' + s + '"' + ((c ? c.status : '待识别') === s ? ' selected' : '') + '>' + s + '</option>').join('') +
      '</select></div>' +
      '<div class="field"><label>主要门槛类型（可多选）</label><div class="th-type-check">' +
        TH_TYPES.map(t => '<label class="th-type-opt"><input type="checkbox" name="thType" value="' + t.key + '"' +
          ((c && (c.thresholdTypes||[]).includes(t.key)) ? ' checked' : '') + '> ' + t.ico + ' ' + t.label +
          '<span class="th-type-feel">' + esc(t.feeling) + '</span>' +
          '<span class="th-type-desc">识别：' + esc(t.signal) + '<br>转移：' + esc(t.transfer) + '</span></label>').join('') +
      '</div></div>' +
      '<div class="field"><label>门槛具体描述（我卡在什么感觉上）</label><textarea name="obstacleDesc" rows="3" placeholder="用一句话说清楚你现在卡在哪、是什么感觉">' + esc(v('obstacleDesc')) + '</textarea></div>' +
      '<div class="field"><label>门槛转移方案（工具 / AI / 方式）</label><textarea name="transferPlan" rows="2" placeholder="用什么方式抹平这个门槛？">' + esc(v('transferPlan')) + '</textarea></div>' +
      '<div class="quick-row">' +
        '<div class="field" style="flex:1"><label>外包给工具的部分</label><input type="text" name="outsourcePart" value="' + esc(v('outsourcePart')) + '" placeholder="信息获取 / 计算 / 初稿等"></div>' +
      '</div>' +
      '<div class="field"><label>必须自己内化的部分</label><input type="text" name="internalPart" value="' + esc(v('internalPart')) + '" placeholder="判断 / 决策 / 审美 / 目标设定"></div>' +
      '<div class="field"><label>下一个最小动作（30分钟内能开始）</label><input type="text" name="nextAction" value="' + esc(v('nextAction')) + '" placeholder="例如：跑通第一只股票的数据抓取"></div>' +
      '<div class="field"><label>预期反馈回路（做完后多久看到结果）</label><input type="text" name="feedbackLoop" value="' + esc(v('feedbackLoop')) + '" placeholder="例如：1 小时内看到首批数据"></div>';
  }

  Register.module({
    view: 'threshold',
    nav: { ico:'🚧', label:'门槛追踪', group:'重点目标' },
    seed: seed,
    ensure: ensure,
    render: renderThreshold,
    actions: {
      // 门槛自检
      'th.check': () => thCheckModal(),
      'th.checkPick': el => thCheckPick(el),
      'th.checkRestart': () => thCheckModal(),
      'th.checkSave': el => {
        const nameEl = document.getElementById('thCheckName');
        const name = (nameEl && nameEl.value.trim()) || '（自检结果）';
        const types = (el.dataset.types || '').split(',').filter(Boolean);
        DB.threshold.cards.push({
          id:uid(), name, goal:'', status:'门槛转移中', thresholdTypes:types,
          obstacleDesc:'通过门槛自检生成', transferPlan:el.dataset.advice || '',
          outsourcePart:'', internalPart:'', nextAction:el.dataset.actionText || '',
          feedbackLoop:'', notes:[], createdAt:dateStr(),
        });
        save(); closeModal(); render();
      },
      'th.toggle': el => {
        const id = el.dataset.id;
        state.thOpen = (state.thOpen === id ? null : id);
        render();
      },
      'th.add': () => openModal('＋ 新门槛卡', thFormBody(null), 'th.save'),
      'th.edit': el => {
        const c = findById(DB.threshold.cards, el.dataset.id); if(!c) return;
        openModal('✎ 编辑门槛卡 · ' + c.name, thFormBody(c), 'th.save');
      },
      'th.del': el => {
        if(confirm('删除这张门槛卡？')){ DB.threshold.cards = DB.threshold.cards.filter(x => x.id !== el.dataset.id); save(); render(); }
      },
      'th.status': el => {
        const c = findById(DB.threshold.cards, el.dataset.id); if(!c) return;
        c.status = el.dataset.v || el.value;
        save(); render();
      },
      'th.addNote': el => {
        const c = findById(DB.threshold.cards, el.dataset.id); if(!c) return;
        openModal('📒 克服记录 · ' + c.name,
          '<div class="field"><label>日期</label><input type="date" name="date" value="' + dateStr() + '"></div>' +
          '<div class="field"><label>这个门槛是怎么被抹平的？</label><textarea name="text" rows="4" placeholder="写一句：用了什么方法 / 工具 / 思路跨越了这个门槛"></textarea></div>' +
          '<input type="hidden" name="cid" value="' + c.id + '">', 'th.saveNote');
      },
      'th.delNote': el => {
        const c = findById(DB.threshold.cards, el.dataset.id); if(!c) return;
        if(confirm('删除这条克服记录？')){ c.notes = (c.notes || []).filter(x => x.id !== el.dataset.nid); save(); render(); }
      },
      // 从灵感速记创建门槛卡：列出 side 模块中状态为「灵感」的项目，一键创建
      'th.fromIdea': () => {
        const ideas = ((DB.side && DB.side.projects) || []).filter(p => p.status === '灵感');
        if(!ideas.length){ alert('「副业探索」里还没有状态为「灵感」的项目'); return; }
        openModal('💡 从灵感创建门槛卡', 
          '<div class="field"><label>选择一个灵感项目</label><select name="ideaId">' +
          ideas.map(p => '<option value="' + p.id + '">' + esc(p.title) + '</option>').join('') + '</select></div>' +
          '<div class="muted" style="font-size:12px">将用该灵感的标题创建一个「待识别」门槛卡，可在编辑中补充门槛细节。</div>' +
          '<input type="hidden" name="cid" value="">', 'th.fromIdeaSave');
      },
    },
    changes: {
      'th.status': el => {
        const c = findById(DB.threshold.cards, el.dataset.id); if(!c) return;
        c.status = el.value;
        save(); render();
      },
    },
    forms: {
      'th.save': fd => {
        const id = fd.get('id');
        const types = fd.getAll('thType');
        const data = {
          name: fd.get('name'), goal: fd.get('goal') || '', status: fd.get('status') || '待识别',
          thresholdTypes: types,
          obstacleDesc: fd.get('obstacleDesc') || '', transferPlan: fd.get('transferPlan') || '',
          outsourcePart: fd.get('outsourcePart') || '', internalPart: fd.get('internalPart') || '',
          nextAction: fd.get('nextAction') || '', feedbackLoop: fd.get('feedbackLoop') || '',
        };
        if(!data.name){ alert('请填写项目名称'); return; }
        if(id){ Object.assign(findById(DB.threshold.cards, id), data); }
        else DB.threshold.cards.push(Object.assign({ id:uid(), notes:[], createdAt:dateStr() }, data));
        save(); closeModal(); render();
      },
      'th.saveNote': fd => {
        const c = findById(DB.threshold.cards, fd.get('cid')); if(!c) return;
        c.notes = c.notes || [];
        c.notes.push({ id:uid(), date:fd.get('date') || dateStr(), text:fd.get('text') });
        save(); closeModal(); render();
      },
      'th.fromIdeaSave': fd => {
        const idea = ((DB.side && DB.side.projects) || []).find(p => p.id === fd.get('ideaId'));
        if(idea){
          DB.threshold.cards.push({
            id:uid(), name:idea.title, goal:'', status:'待识别', thresholdTypes:[],
            obstacleDesc:'', transferPlan:'', outsourcePart:'', internalPart:'',
            nextAction:'', feedbackLoop:'', notes:[], createdAt:dateStr(),
          });
          save(); closeModal(); render();
        }
      },
    },
  });
})();
