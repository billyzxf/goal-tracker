/* ================= 习惯看板（habits） =================
 * 你系统的发动机 —— 把"打算早睡"变成"今天 23:00 前上床 = 1 分"。
 * 每日打卡：早起 / 早睡 / 健身 / 阅读 / 冥想 / 内容输出
 * 连续天数徽章 + 周报自动生成
 */
(function(){
  // 习惯目标（可自行调整）：
  const WAKE_TARGET = '07:00';   // 早起：不晚于此视为达成
  const SLEEP_TARGET = '23:00';  // 早睡：不晚于此上床视为达成

  // 6 个核心习惯定义
  const HABITS = [
    { key:'wake',   label:'早起',  ico:'🌅', type:'time', field:'wakeTime',   target:WAKE_TARGET,  unit:'前', desc:'起床不晚于 ' + WAKE_TARGET },
    { key:'sleep',  label:'早睡',  ico:'🌙', type:'time', field:'sleepTime',  target:SLEEP_TARGET, unit:'前', desc:'上床不晚于 ' + SLEEP_TARGET },
    { key:'fitness',label:'健身',  ico:'💪', type:'bool', field:'exercise',   target:true,         unit:'',   desc:'锻炼 ≥20 分钟' },
    { key:'read',   label:'阅读',  ico:'📚', type:'min',  field:'readMin',    target:20,           unit:'分钟', desc:'阅读 ≥20 分钟' },
    { key:'med',    label:'冥想',  ico:'🧘', type:'bool', field:'meditation', target:true,         unit:'',   desc:'冥想练习' },
    { key:'output', label:'输出',  ico:'✍️', type:'bool', field:'output',     target:true,         unit:'',   desc:'写 / 分享 / 沉淀' },
  ];
  const HABIT_MAP = HABITS.reduce((m, h) => (m[h.key] = h, m), {});
  window.HABIT_CONST = { HABITS, WAKE_TARGET, SLEEP_TARGET };

  function seed(){
    // 预置最近 14 天的示例打卡，方便立即看到看板效果（可删除后重建）
    const today = new Date();
    const d = [];
    const mk = (i, w, s, ex, rm, md, op) => {
      const t = new Date(today); t.setDate(today.getDate() - i);
      const ds = dateStr(t); // 用本地日期，避免 toISOString 的 UTC 偏移
      d.push({ id:uid(), date:ds, wakeTime:w, sleepTime:s, exercise:ex, readMin:rm, meditation:md, output:op });
    };
    // 最近 7 天基本达标，营造连续感
    mk(0, '06:30', '22:50', true,  45, true, true);
    mk(1, '06:40', '22:45', true,  30, true, false);
    mk(2, '06:20', '22:55', true,  60, true, true);
    mk(3, '07:10', '23:20', false, 20, true, false);
    mk(4, '06:50', '22:40', true,  40, false, true);
    mk(5, '06:35', '22:50', true,  50, true, false);
    mk(6, '06:45', '22:35', true,  35, true, true);
    return { logs: d };
  }
  function ensure(db){
    db.habits = db.habits || { logs: seed().logs };
    if(!Array.isArray(db.habits.logs)) db.habits.logs = [];
  }

  /* ----- 达标判断 ----- */
  function timeOK(v, target){ if(!v) return false; return v <= target; } // "06:30" <= "07:00"
  function isOK(h, rec){
    if(!rec) return false;
    if(h.type === 'bool') return !!rec[h.field];
    if(h.type === 'min')  return (rec[h.field] || 0) >= h.target;
    if(h.type === 'time') return timeOK(rec[h.field], h.target);
    return false;
  }

  /* ----- 周报计算 ----- */
  function weekStats(logs){
    // 本周 = 从最近一条记录所在周的周一起算（简化：取当前 ISO 周）
    const now = new Date();
    const day = (now.getDay() + 6) % 7; // 周一起始
    const monday = new Date(now); monday.setDate(now.getDate() - day);
    const mon = dateStr(monday);
    const wk = logs.filter(r => r.date >= mon);
    const days = wk.length;
    const wakeCount = wk.filter(r => timeOK(r.wakeTime, WAKE_TARGET)).length;
    const sleepCount = wk.filter(r => timeOK(r.sleepTime, SLEEP_TARGET)).length;
    const fitnessCount = wk.filter(r => r.exercise).length;
    const readTotal = wk.reduce((s, r) => s + (r.readMin || 0), 0);
    const medCount = wk.filter(r => r.meditation).length;
    const outCount = wk.filter(r => r.output).length;
    return { days, wakeCount, sleepCount, fitnessCount, readTotal, medCount, outCount };
  }

  /* ----- 连续天数（从最近一天往前数连续达标） ----- */
  function streak(logs, h){
    const sorted = logs.slice().sort((a, b) => b.date.localeCompare(a.date));
    let n = 0;
    for(const rec of sorted){
      if(isOK(h, rec)) n++;
      else break;
    }
    return n;
  }

  /* ----- 单日打卡表单 ----- */
  function logForm(rec){
    const v = k => rec ? (rec[k] != null ? rec[k] : '') : '';
    return '<input type="hidden" name="id" value="' + (rec ? rec.id : '') + '">' +
      '<div class="field"><label>日期</label><input type="date" name="date" value="' + (rec ? rec.date : dateStr()) + '"></div>' +
      '<div class="quick-row">' +
        '<div class="field" style="flex:1"><label>🌅 早起时间</label><input type="time" name="wakeTime" value="' + esc(v('wakeTime')) + '"></div>' +
        '<div class="field" style="flex:1"><label>🌙 早睡时间</label><input type="time" name="sleepTime" value="' + esc(v('sleepTime')) + '"></div>' +
      '</div>' +
      '<div class="field"><label>阅读时长（分钟）</label><input type="number" name="readMin" min="0" value="' + esc(v('readMin')) + '" placeholder="0"></div>' +
      '<div class="field"><label>打卡项</label><div class="habit-check">' +
        HABITS.filter(h => h.type === 'bool').map(h =>
          '<label class="habit-opt"><input type="checkbox" name="' + h.field + '"' + (rec && rec[h.field] ? ' checked' : '') + '> ' + h.ico + ' ' + h.label + '</label>').join('') +
      '</div></div>' +
      '<div class="field"><label>备注</label><input type="text" name="note" value="' + esc(v('note')) + '" placeholder="今天感觉如何？"></div>';
  }

  /* ----- 看板渲染 ----- */
  function renderHabits(){
    const logs = DB.habits.logs.slice().sort((a, b) => b.date.localeCompare(a.date));
    const byDate = {};
    logs.forEach(r => byDate[r.date] = r);
    const today = dateStr();
    const todayRec = byDate[today] || { date: today };
    const ws = weekStats(DB.habits.logs);
    const sorted = logs.slice().sort((a, b) => a.date.localeCompare(b.date));

    let h = header('🏃 习惯看板', '你系统的发动机 · 不追踪就永远是愿望 · 今天 ' + today,
      '<button class="btn ghost sm" data-action="habits.log" title="补录 / 编辑某一天的打卡">🗓 打卡记录</button>' +
      '<button class="btn primary" style="background:var(--green)" data-action="habits.checkIn">＋ 今日打卡</button>');

    // —— 连续天数徽章（习惯追踪经典机制）——
    h += '<div class="hab-streaks">' + HABITS.map(hab => {
      const n = streak(DB.habits.logs, hab);
      return '<div class="hab-streak" data-action="habits.checkIn">' +
        '<div class="hab-streak-ico">' + hab.ico + '</div>' +
        '<div class="hab-streak-num">' + n + '</div>' +
        '<div class="hab-streak-label">' + hab.label + '</div>' +
        '<div class="hab-streak-days">天连续</div></div>';
    }).join('') + '</div>';

    // —— 今日打卡卡（内联，最快打卡）——
    h += '<div class="hab-today card"><div class="sec-title"><h2><span class="dot" style="background:var(--green)"></span>今日打卡</h2>' +
      (todayRec && todayRec.wakeTime ? '<span class="badge green" style="font-weight:600">已记录</span>' : '<span class="badge amber" style="font-weight:600">待打卡</span>') + '</div>' +
      '<form data-form="habits.today">' +
        '<div class="hab-today-grid">' +
          '<div class="hab-today-item"><label>🌅 早起</label><input type="time" name="wakeTime" value="' + esc(todayRec.wakeTime || '') + '"' + (todayRec.wakeTime ? '' : ' placeholder="07:00"') + '></div>' +
          '<div class="hab-today-item"><label>🌙 早睡</label><input type="time" name="sleepTime" value="' + esc(todayRec.sleepTime || '') + '"' + (todayRec.sleepTime ? '' : ' placeholder="23:00"') + '></div>' +
          '<div class="hab-today-item"><label>📚 阅读(分)</label><input type="number" name="readMin" min="0" value="' + esc(todayRec.readMin || '') + '" placeholder="20"></div>' +
          '<div class="hab-today-item"><label>💪 健身</label><input type="checkbox" name="exercise"' + (todayRec.exercise ? ' checked' : '') + '></div>' +
          '<div class="hab-today-item"><label>🧘 冥想</label><input type="checkbox" name="meditation"' + (todayRec.meditation ? ' checked' : '') + '></div>' +
          '<div class="hab-today-item"><label>✍️ 输出</label><input type="checkbox" name="output"' + (todayRec.output ? ' checked' : '') + '></div>' +
        '</div>' +
        '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:12px">' +
          '<button type="button" class="btn ghost sm" data-action="habits.undoToday" title="清除今天打卡">清除</button>' +
          '<button class="btn primary sm" style="background:var(--green)">保存打卡</button></div>' +
      '</form></div>';

    // —— 本周自动周报 ——
    const wakeRate = ws.days ? Math.round(ws.wakeCount / ws.days * 100) : 0;
    const sleepRate = ws.days ? Math.round(ws.sleepCount / ws.days * 100) : 0;
    h += '<div class="hab-report"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>本周自动周报</h2><span class="muted" style="font-weight:400">已记录 ' + ws.days + ' 天</span></div>' +
      '<div class="hab-report-grid">' +
        '<div class="hab-rep"><b>' + wakeRate + '%</b><span>早起率</span></div>' +
        '<div class="hab-rep"><b>' + sleepRate + '%</b><span>早睡率</span></div>' +
        '<div class="hab-rep"><b>' + ws.fitnessCount + '</b><span>健身次数</span></div>' +
        '<div class="hab-rep"><b>' + ws.readTotal + '分</b><span>阅读总时长</span></div>' +
        '<div class="hab-rep"><b>' + ws.medCount + '</b><span>冥想次数</span></div>' +
        '<div class="hab-rep"><b>' + ws.outCount + '</b><span>输出次数</span></div>' +
      '</div></div>';

    // —— 打卡历史 ——
    h += '<div class="card" style="margin-top:18px"><div class="sec-title"><h2><span class="dot" style="background:var(--amber)"></span>打卡历史</h2>' +
      '<span class="muted" style="font-weight:400;font-size:12px">共 ' + logs.length + ' 天</span></div>' +
      '<div style="overflow-x:auto"><table class="hab-table"><thead><tr><th>日期</th>' +
        HABITS.map(x => '<th>' + x.ico + ' ' + x.label + '</th>').join('') +
        '<th>备注</th><th></th></tr></thead><tbody>' +
      logs.map(rec => {
        return '<tr>' +
          '<td class="nowrap">' + esc(rec.date) + '</td>' +
          HABITS.map(x => {
            const ok = isOK(x, rec);
            let cell;
            if(x.type === 'bool') cell = ok ? '✅' : '<span class="muted">—</span>';
            else if(x.type === 'min') cell = (rec[x.field] || 0) + '<span class="muted">m</span>';
            else cell = (rec[x.field] ? esc(rec[x.field]) : '<span class="muted">—</span>');
            return '<td class="' + (ok ? 'hab-ok' : '') + '">' + cell + '</td>';
          }).join('') +
          '<td class="muted">' + esc(rec.note || '') + '</td>' +
          '<td class="nowrap"><button class="icon-btn" title="编辑" data-action="habits.edit" data-id="' + rec.id + '">✎</button>' +
          '<button class="icon-btn" title="删除" data-action="habits.del" data-id="' + rec.id + '">✕</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table></div></div>';

    return h;
  }

  Register.module({
    view: 'habits',
    nav: { ico:'🏃', label:'习惯看板', group:'重点目标' },
    seed: seed,
    ensure: ensure,
    render: renderHabits,
    actions: {
      'habits.checkIn': () => openModal('＋ 今日打卡', logForm(byDateFromDB(dateStr())), 'habits.save'),
      'habits.log': () => openModal('🗓 打卡记录', '<div class="muted" style="font-size:12px;margin-bottom:10px">在这里补录或编辑历史打卡，也可在历史表中直接点 ✎ 编辑。</div>' + logForm(null), 'habits.save'),
      'habits.edit': el => {
        const rec = findById(DB.habits.logs, el.dataset.id); if(!rec) return;
        openModal('✎ 编辑打卡 · ' + rec.date, logForm(rec), 'habits.save');
      },
      'habits.del': el => {
        if(confirm('删除这条打卡？')){ DB.habits.logs = DB.habits.logs.filter(x => x.id !== el.dataset.id); save(); render(); }
      },
      'habits.undoToday': () => {
        const t = dateStr();
        DB.habits.logs = DB.habits.logs.filter(x => x.date !== t);
        save(); render();
      },
    },
    forms: {
      'habits.save': fd => {
        const id = fd.get('id');
        const date = fd.get('date') || dateStr();
        const data = {
          date,
          wakeTime: fd.get('wakeTime') || '', sleepTime: fd.get('sleepTime') || '',
          readMin: +fd.get('readMin') || 0,
          exercise: !!fd.get('exercise'), meditation: !!fd.get('meditation'), output: !!fd.get('output'),
          note: fd.get('note') || '',
        };
        if(id){ const r = findById(DB.habits.logs, id); if(r) Object.assign(r, data); }
        else DB.habits.logs.push(Object.assign({ id:uid() }, data));
        save(); closeModal(); render();
      },
      'habits.today': fd => {
        // 今日打卡：若今日已有记录则更新，否则新建
        const date = dateStr();
        const data = {
          date,
          wakeTime: fd.get('wakeTime') || '', sleepTime: fd.get('sleepTime') || '',
          readMin: +fd.get('readMin') || 0,
          exercise: !!fd.get('exercise'), meditation: !!fd.get('meditation'), output: !!fd.get('output'),
          note: '',
        };
        const existing = DB.habits.logs.find(x => x.date === date);
        if(existing) Object.assign(existing, data);
        else DB.habits.logs.push(Object.assign({ id:uid() }, data));
        save(); render();
      },
    },
  });

  // 辅助：按日期取今天的记录（供今日打卡弹窗预填）
  function byDateFromDB(date){
    return (DB.habits.logs || []).find(r => r.date === date) || null;
  }
})();
