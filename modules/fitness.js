/* ================= 减脂塑形（fitness） ================= */
(function(){
  function seed(){
    return {
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
    };
  }
  function ensure(db){
    const f = db.fitness;
    f.weekStart = f.weekStart || mondayStr();
    f.weekPlan  = f.weekPlan  || [];
    f.diet      = f.diet      || [];
    f.shopping  = f.shopping  || [];
    f.logs      = f.logs      || [];
  }
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

  Register.module({
    view: 'fitness',
    nav: { ico:'🏋️', label:'减脂塑形', group:'重点目标' },
    seed: seed,
    ensure: ensure,
    render: renderFitness,
    actions: {
      'fit.resetWeek': () => { DB.fitness.weekPlan.forEach(d => d.done = false); DB.fitness.weekStart = mondayStr(); save(); render(); },
      'fit.delDiet': el => { DB.fitness.diet = DB.fitness.diet.filter(x => x.id !== el.dataset.id); save(); render(); },
      'fit.delShop': el => { DB.fitness.shopping = DB.fitness.shopping.filter(x => x.id !== el.dataset.id); save(); render(); },
      'fit.delLog': el => { if(confirm('删除这条日志？')){ DB.fitness.logs = DB.fitness.logs.filter(x => x.id !== el.dataset.id); save(); render(); } },
    },
    changes: {
      'fit.toggleDay': el => { DB.fitness.weekPlan[+el.dataset.i].done = el.checked; save(); render(); },
      'fit.planText': el => { DB.fitness.weekPlan[+el.dataset.i].plan = el.value; save(); },
      'fit.toggleDiet': el => { findById(DB.fitness.diet, el.dataset.id).done = el.checked; save(); render(); },
      'fit.toggleShop': el => { findById(DB.fitness.shopping, el.dataset.id).done = el.checked; save(); render(); },
    },
    forms: {
      'fit.addDiet': fd => { DB.fitness.diet.push({ id:uid(), text:fd.get('text'), done:false }); save(); render(); },
      'fit.addShop': fd => { DB.fitness.shopping.push({ id:uid(), text:fd.get('text'), done:false }); save(); render(); },
      'fit.addLog': fd => { DB.fitness.logs.push({ id:uid(), date:fd.get('date') || dateStr(), tag:fd.get('tag'), text:fd.get('text') }); save(); render(); },
    },
  });
})();
