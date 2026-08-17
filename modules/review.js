/* ================= 周复盘工作台（review） =================
 * 你的导航仪 —— 让"每周复盘 + 10%周增长"从口号变成可量化指标。
 * 三栏输入：✅完成 / 🚧阻碍 / 💡下周改进
 * 与习惯看板联动：自动带入本周打卡数据
 * 季度汇总：近 13 周的进步曲线，回答"我到底成长了没有"
 */
(function(){
  function seed(){
    const thisMon = mondayStr();
    // 预置近 13 周示例复盘，方便立即看到季度曲线
    const d = [];
    for(let i=12; i>=1; i--){
      const m = new Date(thisMon + 'T00:00:00'); m.setDate(m.getDate() - i*7);
      const ws = dateStr(m);
      d.push({
        id:uid(), weekStart:ws, created:ws,
        done:'完成了一部分目标，方向明确。',
        blocked:'时间被琐事占据，专注度不够。',
        next:'下一周聚焦 1 个最核心目标，减少干扰。',
        rating: i<=4 ? 6 : (i<=8 ? 7 : (i<=11 ? 8 : 6))
      });
    }
    d.push({ id:uid(), weekStart:thisMon, created:dateStr(), done:'', blocked:'', next:'', rating:0 });
    return { weeks: d };
  }
  function ensure(db){
    db.review = db.review || { weeks: seed().weeks };
    if(!Array.isArray(db.review.weeks)) db.review.weeks = [];
  }

  // 本周习惯联动数据（从习惯看板 DB.habits.logs 读取）
  function habitWeekStats(){
    const logs = (DB.habits && DB.habits.logs) || [];
    const mon = mondayStr();
    const wk = logs.filter(r => r.date >= mon);
    const days = wk.length;
    const wakeRate = days ? Math.round(wk.filter(r => r.wakeTime && r.wakeTime <= '07:00').length / days * 100) : 0;
    const sleepRate = days ? Math.round(wk.filter(r => r.sleepTime && r.sleepTime <= '23:00').length / days * 100) : 0;
    const fitness = wk.filter(r => r.exercise).length;
    const readTotal = wk.reduce((s, r) => s + (r.readMin || 0), 0);
    const med = wk.filter(r => r.meditation).length;
    const output = wk.filter(r => r.output).length;
    return { days, wakeRate, sleepRate, fitness, readTotal, med, output };
  }

  // 季度进步曲线（近 13 周，用周评分 rating；无评分周用习惯达标率兜底）
  function quarterChart(){
    const weeks = DB.review.weeks.slice().sort((a, b) => a.weekStart.localeCompare(b.weekStart)).slice(-13);
    const w = 680, h = 200, pad = { l:36, r:16, t:20, b:30 };
    let pts = [];
    weeks.forEach((wk, i) => {
      let v = +wk.rating || 0;
      if(!v && DB.habits){ // 兜底：习惯达标率作为进步分
        const wkLogs = (DB.habits.logs||[]).filter(r => r.date >= wk.weekStart && r.date < addDays(wk.weekStart, 7));
        const n = wkLogs.length;
        const score = n ? Math.round(wkLogs.filter(r => r.wakeTime && r.wakeTime <= '07:00').length / n * 10) : 0;
        v = score;
      }
      pts.push({ x:i, y:v, label:wk.weekStart.slice(5), week:wk.weekStart });
    });
    const valid = pts.filter(p => p.y > 0);
    const maxV = Math.max(10, ...valid.map(p => p.y)) * 1.1;
    const xS = i => pad.l + (weeks.length > 1 ? i / (weeks.length - 1) * (w - pad.l - pad.r) : 0);
    const yS = v => h - pad.b - (v / maxV) * (h - pad.t - pad.b);
    let svg = '<svg viewBox="0 0 ' + w + ' ' + h + '" style="width:100%;height:auto">';
    for(let i=0;i<=4;i++){
      const y = pad.t + i * (h - pad.t - pad.b) / 4;
      const val = Math.round(maxV - i * maxV / 4);
      svg += '<line x1="' + pad.l + '" y1="' + y + '" x2="' + (w-pad.r) + '" y2="' + y + '" stroke="var(--line)" stroke-width="1"/>';
      svg += '<text x="' + (pad.l-5) + '" y="' + (y+3) + '" text-anchor="end" font-size="9" fill="var(--ink2)">' + val + '</text>';
    }
    // 曲线
    const hasY = pts.some(p => p.y > 0);
    if(hasY){
      const path = pts.map((p, i) => (i===0 ? 'M' : 'L') + ' ' + xS(i).toFixed(1) + ' ' + yS(p.y).toFixed(1)).join(' ');
      svg += '<path d="' + path + '" fill="none" stroke="var(--indigo)" stroke-width="2.5" stroke-linejoin="round"/>';
      pts.forEach((p, i) => { if(p.y > 0) svg += '<circle cx="' + xS(i).toFixed(1) + '" cy="' + yS(p.y).toFixed(1) + '" r="3" fill="var(--indigo)"/>'; });
    } else {
      svg += '<text x="' + (w/2) + '" y="' + (h/2) + '" text-anchor="middle" fill="var(--ink2)" font-size="12">暂无评分数据，完成每周复盘后自动生成曲线</text>';
    }
    const step = Math.max(1, Math.ceil(weeks.length / 6));
    pts.forEach((p, i) => {
      if(i % step === 0 || i === weeks.length - 1)
        svg += '<text x="' + xS(i) + '" y="' + (h - pad.b + 15) + '" text-anchor="middle" font-size="9" fill="var(--ink2)">' + p.label + '</text>';
    });
    svg += '</svg>';
    return svg;
  }
  function addDays(ds, n){ const d = new Date(ds + 'T00:00:00'); d.setDate(d.getDate() + n); return dateStr(d); }

  // 单条周复盘卡（本周可编辑，历史只读展开）
  function weekCardHTML(wk){
    const isThisWeek = wk.weekStart === mondayStr();
    const hasContent = wk.done || wk.blocked || wk.next;
    const open = state.reviewOpen === wk.id;
    let h = '<div class="rv-card ' + (isThisWeek ? 'current' : '') + (open ? ' open' : '') + '">';
    h += '<div class="rv-head" data-action="review.toggle" data-id="' + wk.id + '">' +
      '<div class="rv-title"><span class="badge ' + (isThisWeek ? 'indigo' : 'gray') + '">' + (isThisWeek ? '本周' : '') + '</span> ' +
        esc(wk.weekStart) + ' ~ ' + esc(addDays(wk.weekStart, 6)) + '</div>' +
      (wk.rating ? '<div class="rv-rating">评分 <b>' + wk.rating + '</b></div>' : '') +
      '<span class="rv-chevron">' + (open ? '▾' : '▸') + '</span></div>';
    if(open || isThisWeek){
      h += '<div class="rv-body">' +
        '<div class="rv-col"><div class="rv-col-title">✅ 完成</div><div class="md">' + md(wk.done || '') + '</div></div>' +
        '<div class="rv-col"><div class="rv-col-title">🚧 阻碍</div><div class="md">' + md(wk.blocked || '') + '</div></div>' +
        '<div class="rv-col"><div class="rv-col-title">💡 下周改进</div><div class="md">' + md(wk.next || '') + '</div></div>' +
        '<div class="rv-actions"><button class="btn ghost sm" data-action="review.edit" data-id="' + wk.id + '">✎ 编辑</button>' +
        '<button class="icon-btn" title="删除" data-action="review.del" data-id="' + wk.id + '">✕</button></div>' +
        '</div>';
    }
    h += '</div>';
    return h;
  }

  // 周复盘编辑表单
  function reviewFormBody(wk){
    const v = k => wk ? (wk[k] || '') : '';
    return '<input type="hidden" name="id" value="' + ((wk && wk.id) ? wk.id : '') + '">' +
      '<div class="field"><label>周起始（周一）</label><input type="date" name="weekStart" value="' + ((wk && wk.weekStart) ? wk.weekStart : mondayStr()) + '"></div>' +
      '<div class="field"><label>本周评分（1-10，用于季度进步曲线）</label>' +
        '<input type="range" name="rating" min="0" max="10" step="1" value="' + (wk ? (wk.rating||0) : 0) + '" ' +
        'oninput="this.closest(\'.field\').querySelector(\'.rv-rate-label\').textContent=\'本周评分：\'+this.value+\'/10\'">' +
        '<div class="rv-rate-label">本周评分：' + (wk ? (wk.rating||0) : 0) + '/10</div></div>' +
      mdField('done', '✅ 本周完成了什么？', v('done'), 4) +
      mdField('blocked', '🚧 有什么阻碍 / 卡在哪？', v('blocked'), 4) +
      mdField('next', '💡 下周怎样变得轻松？（10% 周增长）', v('next'), 4);
  }

  function renderReview(){
    const weeks = DB.review.weeks.slice().sort((a, b) => b.weekStart.localeCompare(a.weekStart));
    const hw = habitWeekStats();
    const thisWeek = weeks.find(w => w.weekStart === mondayStr());

    let h = header('🧭 周复盘工作台', '每周问自己：完成了什么？有什么阻碍？下周怎样更轻松？ · 让 10% 周增长可量化',
      '<button class="btn ghost sm" data-action="review.add">＋ 新建周复盘</button>');

    // —— 本周复盘 + 习惯联动 ——
    h += '<div class="rv-today"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>本周复盘</h2>' +
      '<span class="muted" style="font-weight:400">' + (thisWeek && (thisWeek.done || thisWeek.next) ? '已填写' : '待填写') + '</span></div>';
    // 习惯联动数据
    h += '<div class="rv-habits" title="来自习惯看板">' +
      '<span class="rv-hab"><b>' + hw.wakeRate + '%</b><i>早起率</i></span>' +
      '<span class="rv-hab"><b>' + hw.sleepRate + '%</b><i>早睡率</i></span>' +
      '<span class="rv-hab"><b>' + hw.fitness + '</b><i>健身</i></span>' +
      '<span class="rv-hab"><b>' + hw.readTotal + '分</b><i>阅读</i></span>' +
      '<span class="rv-hab"><b>' + hw.med + '</b><i>冥想</i></span>' +
      '<span class="rv-hab"><b>' + hw.output + '</b><i>输出</i></span>' +
      '</div>';
    if(!(thisWeek && (thisWeek.done || thisWeek.next))){
      h += '<div class="rv-edit-prompt"><button class="btn primary sm" style="background:var(--indigo)" data-action="review.editThis">✍️ 开始本周复盘</button></div>';
    } else {
      h += '<div class="rv-three">' +
        '<div class="rv-col"><div class="rv-col-title">✅ 完成</div><div class="md">' + md(thisWeek.done || '') + '</div></div>' +
        '<div class="rv-col"><div class="rv-col-title">🚧 阻碍</div><div class="md">' + md(thisWeek.blocked || '') + '</div></div>' +
        '<div class="rv-col"><div class="rv-col-title">💡 下周改进</div><div class="md">' + md(thisWeek.next || '') + '</div></div>' +
        '</div>' +
        '<div style="margin-top:10px;text-align:right"><button class="btn ghost sm" data-action="review.edit" data-id="' + (thisWeek ? thisWeek.id : '') + '">✎ 编辑本周</button></div>';
    }
    h += '</div>';

    // —— 季度进步曲线 ——
    h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--green)"></span>季度进步曲线 <span class="muted" style="font-weight:400">（近 13 周 · 自评分数）</span></h2></div>' +
      quarterChart() + '</div>';

    // —— 历史周复盘 ——
    h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--amber)"></span>周复盘记录</h2>' +
      '<span class="muted" style="font-weight:400;font-size:12px">共 ' + weeks.length + ' 周</span></div>';
    if(!weeks.length) h += '<div class="empty">还没有复盘记录，点击右上角新建</div>';
    h += weeks.map(weekCardHTML).join('');
    h += '</div>';

    return h;
  }

  Register.module({
    view: 'review',
    nav: { ico:'🧭', label:'周复盘', group:'重点目标' },
    seed: seed,
    ensure: ensure,
    render: renderReview,
    actions: {
      'review.toggle': el => { const id = el.dataset.id; state.reviewOpen = (state.reviewOpen === id ? null : id); render(); },
      'review.add': () => openModal('＋ 新建周复盘', reviewFormBody(null), 'review.save'),
      'review.editThis': () => {
        const wk = (DB.review.weeks||[]).find(w => w.weekStart === mondayStr());
        openModal('本周复盘 · 10% 周增长', reviewFormBody(wk || { weekStart: mondayStr(), rating:0, done:'', blocked:'', next:'' }), 'review.save');
      },
      'review.edit': el => {
        const wk = findById(DB.review.weeks, el.dataset.id); if(!wk) return;
        openModal('✎ 编辑周复盘', reviewFormBody(wk), 'review.save');
      },
      'review.del': el => { if(confirm('删除这条周复盘？')){ DB.review.weeks = DB.review.weeks.filter(x => x.id !== el.dataset.id); save(); render(); } },
    },
    forms: {
      'review.save': fd => {
        const id = fd.get('id');
        const data = {
          weekStart: fd.get('weekStart') || mondayStr(), rating: +fd.get('rating') || 0,
          done: fd.get('done') || '', blocked: fd.get('blocked') || '', next: fd.get('next') || '', created: dateStr(),
        };
        if(id){ const r = findById(DB.review.weeks, id); if(r) Object.assign(r, data); }
        else DB.review.weeks.push(Object.assign({ id:uid() }, data));
        save(); closeModal(); render();
      },
    },
  });
})();
