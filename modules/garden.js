/* ================= 心灵花园（garden） =================
 * 情绪与心态——你所有模块的"心理底座"。
 * 每日情绪打卡 / 消极念头捕捉 / 积极暗示库 / 感恩记录
 * 核心：减脂塑形练身体，心灵花园练心。痛苦不来自不够努力，而来自努力时内心的自我消耗。
 */
(function(){
  // 心情标签（用于评分对应）
  const MOOD_LABEL = ['很糟','低落','一般','还行','不错','很好','极好'];
  window.GARDEN_CONST = { MOOD_LABEL };

  function seed(){
    const today = dateStr();
    const ds = (i) => { const d = new Date(); d.setDate(d.getDate() - i); return dateStr(d); };
    return {
      // 每日情绪打卡
      moods: [
        { id:uid(), date:today, score:6, trigger:'完成了早睡早起，一整天状态在线，节奏很顺。' },
        { id:uid(), date:ds(1), score:4, trigger:'想到 32 岁还没达成目标，有点焦虑，但写了感恩清单后缓过来。' },
        { id:uid(), date:ds(2), score:7, trigger:'读到《生命的重建》关于接纳自己的章节，有被点亮的感觉。' },
      ],
      // 消极念头捕捉（负面想法 + 反证）
      negThoughts: [
        { id:uid(), date:today, thought:'我是不是开始得太晚了，别人都跑在前面。', antidote:'但我的优势是积累足够深、方向清晰，且我开始认真对待内心了——这本身就在加速。' },
        { id:uid(), date:ds(1), thought:'这个目标太难了，我可能做不到。', antidote:'我已经把大目标拆成了每周最小闭环，过去的每个小胜利都是证据。' },
      ],
      // 积极暗示库（早晚诵读）
      affirmations: [
        { id:uid(), text:'我正在走向财富自由的过程中，每一天都离目标更近。', note:'早晚诵读' },
        { id:uid(), text:'我接纳自己的现在，同时相信未来的我可以更好。', note:'《生命的重建》' },
        { id:uid(), text:'我的内心干净而有力，我不再自我消耗。', note:'净化潜意识·三步法' },
      ],
      // 感恩记录（每天 1 件具体的新证据）
      gratitude: [
        { id:uid(), date:today, item:'今天有精力早起，并且顺利完成了最重要的一件事——这是身体在变好的证据。' },
        { id:uid(), date:ds(1), item:'有人愿意耐心听我说话，让我感到被支持。' },
      ],
    };
  }
  function ensure(db){
    db.garden = db.garden || seed();
    db.garden.moods   = db.garden.moods   || [];
    db.garden.negThoughts = db.garden.negThoughts || [];
    db.garden.affirmations = db.garden.affirmations || [];
    db.garden.gratitude = db.garden.gratitude || [];
  }

  // 心情评分对应文案
  function moodLabel(s){ return MOOD_LABEL[Math.min(6, Math.max(0, Math.round((s||0)/2)-1))] || '一般'; }
  function moodEmoji(s){ return s>=8?'😄':s>=6?'🙂':s>=4?'😐':s>=2?'😞':'😢'; }

  // 今日情绪打卡表单
  function moodForm(rec){
    const v = k => rec ? (rec[k] != null ? rec[k] : '') : '';
    const score = rec ? (rec.score||0) : 0;
    return '<input type="hidden" name="id" value="' + ((rec && rec.id) ? rec.id : '') + '">' +
      '<div class="field"><label>日期</label><input type="date" name="date" value="' + ((rec && rec.date) ? rec.date : dateStr()) + '"></div>' +
      '<div class="field"><label>今天的心情评分（1-10）</label>' +
        '<input type="range" name="score" min="1" max="10" step="1" value="' + score + '" ' +
        'oninput="this.closest(\'.field\').querySelector(\'.mood-live\').textContent=this.value+\'/10\'">' +
        '<div class="mood-live">' + score + '/10</div></div>' +
      '<div class="field"><label>触发事件 / 今天发生了什么（一句话）</label>' +
        '<textarea name="trigger" rows="3" placeholder="今天心情好/差的触发点是什么？">' + esc(v('trigger')) + '</textarea></div>';
  }

  function renderGarden(){
    const g = DB.garden;
    const today = dateStr();
    const todayMood = g.moods.find(m => m.date === today);
    // 情绪趋势（近 7 天）
    const last7 = [];
    for(let i=6;i>=0;i--){
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = dateStr(d);
      const m = g.moods.find(x => x.date === ds);
      last7.push({ date: ds.slice(5), score: m ? m.score : null });
    }

    let h = header('🌸 心灵花园', '情绪与心态 · 你所有模块的心理底座 · 减脂塑形练身体，这里练心',
      '<button class="btn ghost sm" data-action="garden.affirm" title="积极暗示库 · 早晚诵读">🔔 早晚诵读</button>' +
      '<button class="btn ghost sm" data-action="garden.neg" title="记录消极念头及其反证">🧠 消极念头</button>' +
      '<button class="btn primary" style="background:var(--pink)" data-action="garden.mood">＋ 情绪打卡</button>');

    // —— 今日情绪打卡 ——
    h += '<div class="garden-today card"><div class="sec-title"><h2><span class="dot" style="background:var(--pink)"></span>今日心情</h2>' +
      (todayMood ? '<span class="badge pink" style="font-weight:600">' + moodEmoji(todayMood.score) + ' ' + todayMood.score + '/10 · ' + moodLabel(todayMood.score) + '</span>' : '<span class="badge gray">未打卡</span>') + '</div>';
    if(todayMood){
      h += '<div class="garden-today-body">' +
        '<div class="garden-today-score">' + moodEmoji(todayMood.score) + ' <b>' + todayMood.score + '/10</b> <span class="muted">' + moodLabel(todayMood.score) + '</span></div>' +
        '<div class="muted">' + esc(todayMood.trigger || '') + '</div>' +
        '<div style="margin-top:10px"><button class="btn ghost sm" data-action="garden.mood">✎ 更新今日</button></div>' +
        '</div>';
    } else {
      h += '<div class="garden-today-body"><button class="btn primary sm" style="background:var(--pink)" data-action="garden.mood">记录今天的心情</button></div>';
    }
    h += '</div>';

    // —— 情绪趋势（近 7 天）——
    h += '<div class="card" style="margin-top:16px"><div class="sec-title"><h2><span class="dot" style="background:var(--amber)"></span>情绪趋势 <span class="muted" style="font-weight:400">（近 7 天）</span></h2></div>' +
      '<div class="garden-trend">' + last7.map(x =>
        '<div class="garden-trend-item"><div class="garden-trend-bar"><div class="garden-trend-fill" style="height:' + (x.score ? x.score*10 : 0) + '%"></div></div>' +
        '<div class="garden-trend-val">' + (x.score ? x.score : '—') + '</div>' +
        '<div class="garden-trend-date">' + esc(x.date) + '</div></div>').join('') + '</div></div>';

    // —— 消极念头捕捉 ——
    h += '<div class="garden-two">';
    h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--gray)"></span>消极念头捕捉 <span class="muted" style="font-weight:400">（写反证）</span></h2>' +
      '<button class="btn ghost sm" data-action="garden.neg">＋ 记录</button></div>' +
      (g.negThoughts.length ? g.negThoughts.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(n =>
        '<div class="garden-neg"><div class="garden-neg-thought">💭 ' + esc(n.thought) + '<span class="muted"> · ' + n.date + '</span>' +
        '<button class="icon-btn" title="删除" data-action="garden.delNeg" data-id="' + n.id + '">✕</button></div>' +
        '<div class="garden-neg-antidote"><b>反证：</b>' + esc(n.antidote) + '</div></div>').join('')
        : '<div class="empty">没有消极念头记录</div>') + '</div>';

    // —— 积极暗示库 ——
    h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--green)"></span>积极暗示库 <span class="muted" style="font-weight:400">（早晚诵读）</span></h2>' +
      '<button class="btn ghost sm" data-action="garden.addAffirm">＋ 添加</button></div>' +
      (g.affirmations.length ? g.affirmations.map(a =>
        '<div class="garden-affirm"><div class="garden-affirm-text">“' + esc(a.text) + '”</div>' +
        (a.note ? '<div class="garden-affirm-note">' + esc(a.note) + '</div>' : '') +
        '<div class="garden-affirm-actions"><button class="icon-btn" title="删除" data-action="garden.delAffirm" data-id="' + a.id + '">✕</button></div></div>').join('')
        : '<div class="empty">还没有积极暗示</div>') + '</div>';
    h += '</div>';

    // —— 感恩记录 ——
    h += '<div class="card" style="margin-top:16px"><div class="sec-title"><h2><span class="dot" style="background:var(--amber)"></span>感恩记录 <span class="muted" style="font-weight:400">（每天 1 件具体的新证据）</span></h2>' +
      '<button class="btn ghost sm" data-action="garden.gratitude">＋ 感恩今天</button></div>' +
      (g.gratitude.length ? g.gratitude.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(x =>
        '<div class="garden-grat"><div class="garden-grat-head"><span class="muted">' + x.date + '</span>' +
        '<button class="icon-btn" title="删除" data-action="garden.delGrat" data-id="' + x.id + '">✕</button></div>' +
        '<div>🙏 ' + esc(x.item) + '</div></div>').join('') : '<div class="empty">还没有感恩记录</div>') + '</div>';

    return h;
  }

  Register.module({
    view: 'garden',
    nav: { ico:'🌸', label:'心灵花园', group:'长期积累' },
    seed: seed,
    ensure: ensure,
    render: renderGarden,
    actions: {
      'garden.mood': () => {
        const today = dateStr();
        const rec = (DB.garden.moods||[]).find(m => m.date === today) || { date: today, score: 0, trigger: '' };
        openModal('🌸 情绪打卡', moodForm(rec), 'garden.saveMood');
      },
      'garden.neg': () => openModal('🧠 消极念头捕捉',
        '<div class="field"><label>日期</label><input type="date" name="date" value="' + dateStr() + '"></div>' +
        '<div class="field"><label>今天脑子里冒出的负面想法</label><textarea name="thought" rows="3" required placeholder="把那个念头原样写下来"></textarea></div>' +
        '<div class="field"><label>它的反证是什么</label><textarea name="antidote" rows="3" placeholder="事实/证据/另一个角度，反驳这个念头"></textarea></div>',
        'garden.saveNeg'),
      'garden.delNeg': el => { DB.garden.negThoughts = DB.garden.negThoughts.filter(x => x.id !== el.dataset.id); save(); render(); },
      'garden.affirm': () => {
        const a = DB.garden.affirmations;
        if(!a.length){ alert('积极暗示库还是空的'); return; }
        openModal('🔔 早晚诵读', '<div class="garden-affirm-practice">' +
          a.map(x => '<div class="garden-affirm-p-item">“' + esc(x.text) + '”</div>').join('') +
          '<div class="muted" style="margin-top:10px;text-align:center">早晚各读一遍，给自己重复的积极证据</div></div>', null, null, true);
      },
      'garden.addAffirm': () => openModal('＋ 添加积极暗示',
        '<div class="field"><label>积极暗示（精准、现在时、正向）</label><textarea name="text" rows="3" required placeholder="我正在走向财富自由的过程中，每一天都离目标更近"></textarea></div>' +
        '<div class="field"><label>来源 / 备注</label><input type="text" name="note" placeholder="如：早晚诵读 / 《生命的重建》"></div>', 'garden.saveAffirm'),
      'garden.delAffirm': el => { DB.garden.affirmations = DB.garden.affirmations.filter(x => x.id !== el.dataset.id); save(); render(); },
      'garden.gratitude': () => openModal('🙏 感恩今天',
        '<div class="field"><label>日期</label><input type="date" name="date" value="' + dateStr() + '"></div>' +
        '<div class="field"><label>今天 1 件具体的新证据</label><textarea name="item" rows="3" required placeholder="一件具体的、今天真实发生的好事"></textarea></div>', 'garden.saveGrat'),
      'garden.delGrat': el => { DB.garden.gratitude = DB.garden.gratitude.filter(x => x.id !== el.dataset.id); save(); render(); },
    },
    forms: {
      'garden.saveMood': fd => {
        const id = fd.get('id');
        const data = { date: fd.get('date') || dateStr(), score: +fd.get('score') || 1, trigger: fd.get('trigger') || '' };
        // 有有效 id → 更新已有记录；否则（无 id 或今天无记录）→ 新增
        if(id && id !== 'undefined'){
          const m = findById(DB.garden.moods, id);
          if(m) Object.assign(m, data);
          else DB.garden.moods.push(Object.assign({ id:uid() }, data)); // 兜底：id 失效时新增
        } else {
          DB.garden.moods.push(Object.assign({ id:uid() }, data));
        }
        save(); closeModal(); render();
      },
      'garden.saveNeg': fd => {
        DB.garden.negThoughts.push({ id:uid(), date:fd.get('date') || dateStr(), thought:fd.get('thought'), antidote:fd.get('antidote') || '' });
        save(); closeModal(); render();
      },
      'garden.saveAffirm': fd => {
        const t = fd.get('text'); if(!t){ alert('请填写积极暗示'); return; }
        DB.garden.affirmations.push({ id:uid(), text:t, note:fd.get('note') || '' });
        save(); closeModal(); render();
      },
      'garden.saveGrat': fd => {
        const it = fd.get('item'); if(!it){ alert('请填写感恩内容'); return; }
        DB.garden.gratitude.push({ id:uid(), date:fd.get('date') || dateStr(), item:it });
        save(); closeModal(); render();
      },
    },
  });
})();
