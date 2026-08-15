/* ================= 总览（dashboard） =================
 * 依赖：fitness / job / reading / side / valuation 数据与工具（运行时解析）
 */
(function(){
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
    const V = window.ValHelpers || {};
    const valCos = DB.valuation.companies;
    let valPos = 0, valCost = 0, valMv = 0;
    valCos.forEach(c => { const p = V.calcPosition(c.investments||[]); valPos += p.position; valCost += p.cost; valMv += p.position * (c.currentPrice||0); });
    const valPnl = valMv - valCost;
    h += '<div class="dash-grid">';
    h += '<div class="card"><div class="sec-title"><h2><span class="dot" style="background:var(--indigo)"></span>公司估值</h2>' +
      '<button class="btn ghost sm" data-action="nav" data-view="valuation">进入 →</button></div>' +
      '<div class="stat-line"><span>关注公司</span><b>' + valCos.length + ' 家</b></div>' +
      (valPos > 0 ? '<div class="stat-line"><span>持仓市值</span><b>' + V.fmtMoney(valMv) + '</b></div>' +
      '<div class="stat-line"><span>浮动盈亏</span><b class="' + (valPnl >= 0 ? 'up' : 'down') + '">' + V.fmtMoney(valPnl) + ' (' + V.fmtPct(valCost > 0 ? valPnl/valCost*100 : 0) + ')</b></div>' : '<div class="stat-line muted">暂无持仓</div>') + '</div>';
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

  Register.module({
    view: 'dashboard',
    nav: { ico:'🏠', label:'总览', group:null },
    render: renderDashboard,
    forms: {
      'dash.capture': fd => {
        DB.side.projects.push({ id:uid(), title:fd.get('text'), category:'灵感', status:'灵感', desc:'', updates:[{ id:uid(), date:dateStr(), note:'灵感速记，待补充细节。' }] });
        save(); render();
      },
    },
  });
})();
