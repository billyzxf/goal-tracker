/* ================= 副业探索（side） ================= */
(function(){
  const SIDE_STATUSES = ['灵感', '进行中', '已完成', '搁置'];
  const SIDE_COLOR = { '灵感':'amber', '进行中':'green', '已完成':'indigo', '搁置':'gray' };
  window.SIDE_CONST = { SIDE_STATUSES, SIDE_COLOR };

  function seed(){
    return {
      projects: [
        { id:uid(), title:'太湖打鸟摄影攻略', category:'摄影', status:'进行中',
          desc:'佳能 EOS R7，太湖沿岸水鸟拍摄 + 参数记录，产出小红书攻略。',
          updates:[{ id:uid(), date:dateStr(), note:'确定周六发布节奏，整理第一批样片。' }] },
        { id:uid(), title:'Godot 独立游戏开发', category:'游戏开发', status:'进行中',
          desc:'AI + Godot 独立游戏，Build in Public 记录开发过程。',
          updates:[{ id:uid(), date:dateStr(), note:'搭建项目骨架，确定周日发布节奏。' }] }
      ]
    };
  }
  function ensure(db){
    db.side.projects = db.side.projects || [];
  }
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
        '<div class="tl-item"><div class="tl-head">' +
        '<div class="tl-date">' + u.date + '</div>' +
        '<div class="tl-actions">' +
        '<button class="icon-btn" title="编辑这条进展" data-action="side.editUpdate" data-id="' + p.id + '" data-uid="' + u.id + '">✎</button>' +
        '<button class="icon-btn" title="删除这条进展" data-action="side.delUpdate" data-id="' + p.id + '" data-uid="' + u.id + '">✕</button>' +
        '</div></div>' +
        '<div class="md">' + md(u.note) + '</div></div>').join('') + '</div>' +
      '<button class="btn ghost sm" data-action="side.addUpdate" data-id="' + p.id + '" style="margin-top:8px">＋ 记录进展</button></div>').join('');
    return h;
  }

  Register.module({
    view: 'side',
    nav: { ico:'💡', label:'副业探索', group:null },
    seed: seed,
    ensure: ensure,
    render: renderSide,
    actions: {
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
          '<input type="hidden" name="pid" value="' + p.id + '">' +
          '<input type="hidden" name="uid" value="">', 'side.saveUpdate');
      },
      'side.editUpdate': el => {
        const p = findById(DB.side.projects, el.dataset.id); if(!p) return;
        const u = findById(p.updates, el.dataset.uid); if(!u) return;
        openModal('编辑进展 · ' + p.title,
          '<div class="field"><label>日期</label><input type="date" name="date" value="' + esc(u.date) + '" required></div>' +
          mdField('note', '进展内容', u.note, 6) +
          '<input type="hidden" name="pid" value="' + p.id + '">' +
          '<input type="hidden" name="uid" value="' + u.id + '">', 'side.saveUpdate');
      },
      'side.delUpdate': el => {
        const p = findById(DB.side.projects, el.dataset.id); if(!p) return;
        if(!confirm('删除这条进展记录？')) return;
        p.updates = p.updates.filter(x => x.id !== el.dataset.uid);
        save(); render();
      },
    },
    changes: {
      'side.status': el => { findById(DB.side.projects, el.dataset.id).status = el.value; save(); render(); },
    },
    forms: {
      'side.save': fd => {
        const id = fd.get('id');
        if(id){ const p = findById(DB.side.projects, id); Object.assign(p, { title:fd.get('title'), category:fd.get('category'), status:fd.get('status'), desc:fd.get('desc') }); }
        else DB.side.projects.push({ id:uid(), title:fd.get('title'), category:fd.get('category') || '其他', status:fd.get('status'), desc:fd.get('desc'), updates:[{ id:uid(), date:dateStr(), note:'项目创建。' }] });
        save(); closeModal(); render();
      },
      'side.saveUpdate': fd => {
        const p = findById(DB.side.projects, fd.get('pid')); if(!p) return;
        const uidVal = fd.get('uid');
        const date = fd.get('date') || dateStr();
        const note = fd.get('note');
        if(uidVal){
          // 编辑现有进展
          const u = findById(p.updates, uidVal);
          if(u){ u.date = date; u.note = note; }
        } else {
          // 新增进展
          p.updates.push({ id:uid(), date, note });
        }
        save(); closeModal(); render();
      },
    },
  });
})();
