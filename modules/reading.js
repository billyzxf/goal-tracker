/* ================= 阅读笔记（reading） ================= */
(function(){
  function seed(){
    return {
      notes: [
        { id:uid(), book:'原子习惯', theme:'习惯养成', title:'微小的 1% 改进', created:dateStr(),
          content:'每天进步 1%，一年约提升 $1.01^{365} \\approx 37.8$ 倍。\n\n- 习惯四定律：提示、渴求、反应、奖励\n- 让它显而易见、有吸引力、简便易行、令人满足' }
      ]
    };
  }
  function ensure(db){
    db.reading.notes = db.reading.notes || [];
  }
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

  Register.module({
    view: 'reading',
    nav: { ico:'📚', label:'阅读笔记', group:'长期积累' },
    seed: seed,
    ensure: ensure,
    render: renderReading,
    actions: {
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
    },
    changes: {
      'read.fBook': el => { state.readBook = el.value; render(); },
      'read.fTheme': el => { state.readTheme = el.value; render(); },
    },
    inputs: {
      'read.q': el => { state.readQ = el.value; renderKeep('read.q'); },
    },
    forms: {
      'read.save': fd => {
        const id = fd.get('id');
        if(id){ const n = findById(DB.reading.notes, id); Object.assign(n, { book:fd.get('book'), theme:fd.get('theme'), title:fd.get('title'), content:fd.get('content') }); }
        else DB.reading.notes.push({ id:uid(), book:fd.get('book'), theme:fd.get('theme'), title:fd.get('title'), content:fd.get('content'), created:dateStr() });
        save(); closeModal(); render();
      },
    },
  });
})();
