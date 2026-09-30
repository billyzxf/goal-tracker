/* ================= 全局公司搜索（Ctrl+K / ⌘K） =================
 * 跨三个池（估值池 ∪ 财报池 ∪ 待击球台账）一键搜索公司并跳详情页。
 *
 * 用法：任意视图按 Ctrl+K（Mac 为 ⌘K）弹出搜索框，支持：
 *   - 汉字原文 / 全拼 / 拼音首字母模糊匹配（core.js kwMatch，依赖 pinyin-pro）
 *   - 6 位代码 / 行业名匹配
 *   - 空关键词：默认展示估值池公司（最多 10 家）作为快速入口
 *   - 结果行显示名称 / 代码 / 所属池徽章 / 行业，点击直达统一公司详情页
 *
 * 定位：无 Register.module（不占视图、不进侧边栏），仅注册快捷键。
 * 依赖：core.js（openModal/closeModal/state/kwMatch/esc）、data-repo.js（Repo）。
 */
(function(){
  /* ---------- 三池合并数据源 ----------
   * { code6, name, industry, inVal, inEarn, inLedger }，台账里不在两池的公司也纳入。 */
  function allCompanies(){
    const idx = Repo.poolIndex();
    const map = {};
    Object.keys(idx).forEach(c6 => {
      const st = idx[c6];
      const er0 = st.earnRows[0] || {};
      map[c6] = {
        code6: c6,
        name: (st.valCo && st.valCo.name) || String(er0['公司名称'] || ''),
        industry: (st.valCo && st.valCo.industry) || String(er0['行业'] || ''),
        inVal: !!st.valCo, inEarn: st.earnRows.length > 0, inLedger: false,
      };
    });
    (Repo.swingItems() || []).forEach(x => {
      const k = Repo.tickerKey(x.ticker);          // '002008.SZ' → '002008'；非 A 股（非 6 位数字）不纳入
      if(!k || !/^\d{6}$/.test(k)) return;
      const it = map[k] || (map[k] = { code6: k, name: '', industry: '', inVal: false, inEarn: false, inLedger: false });
      it.inLedger = true;
      if(!it.name) it.name = x.name || '';
    });
    return Object.keys(map).map(k => map[k]);
  }

  /* ---------- 结果渲染 ---------- */
  const MAX_SHOW = 30;      // 有关键词时最多展示条数（提示继续输入缩小范围）
  const MAX_IDLE = 10;      // 空关键词时展示的估值池公司数

  function resultsHTML(kw){
    kw = String(kw || '').trim().toLowerCase();
    let list = allCompanies();
    if(kw){
      list = list.filter(x => kwMatch(x.name, kw) || x.code6.includes(kw) || kwMatch(x.industry, kw));
    } else {
      list = list.filter(x => x.inVal);
    }
    list.sort((a, b) => (b.inVal - a.inVal) || String(a.name).localeCompare(String(b.name), 'zh'));
    if(!list.length) return '<div class="empty">没有匹配的公司（支持名称 / 代码 / 拼音 / 行业）</div>';
    const badge = (on, cls, label) => on ? '<span class="badge ' + cls + '">' + label + '</span>' : '';
    return '<div class="gsk-list">' + list.slice(0, MAX_SHOW).map(x =>
      '<div class="gsk-row" data-code="' + esc(x.code6) + '" title="打开公司详情页（' + esc(Repo.fullTicker(x.code6)) + '）">' +
        '<b class="gsk-name">' + esc(x.name || x.code6) + '</b>' +
        '<span class="muted gsk-code">' + esc(Repo.fullTicker(x.code6)) + '</span>' +
        '<span class="gsk-badges">' +
          badge(x.inVal, 'indigo', '估值') + badge(x.inEarn, 'green', '财报') + badge(x.inLedger, 'amber', '台账') +
          (x.industry ? '<span class="badge gray">' + esc(x.industry) + '</span>' : '') +
        '</span>' +
      '</div>').join('') + '</div>' +
      (kw && list.length > MAX_SHOW
        ? '<div class="muted" style="font-size:12px;padding:8px 4px 2px">共 ' + list.length + ' 条，仅显示前 ' + MAX_SHOW + ' 条，请继续输入缩小范围</div>'
        : '');
  }

  /* ---------- 弹窗 ---------- */
  function openSearch(){
    if(!window.CompanyPage){ toast('详情页组件未就绪'); return; }
    openModal('🔍 全局公司搜索',
      '<input type="text" id="gsk-input" class="kw-search" style="width:100%" ' +
        'placeholder="输入公司名称 / 代码 / 拼音 / 行业…（估值池 · 财报池 · 台账）" autocomplete="off">' +
      '<div id="gsk-results" style="margin-top:12px;max-height:60vh;overflow-y:auto"></div>',
      null,
      function(root){
        const input = root.querySelector('#gsk-input');
        const box = root.querySelector('#gsk-results');
        if(!input || !box) return;
        input.addEventListener('input', () => { box.innerHTML = resultsHTML(input.value); });
        box.addEventListener('click', e => {
          const row = e.target.closest('[data-code]');
          if(!row) return;
          closeModal();
          CompanyPage.open({ code6: row.dataset.code }, state.view);
        });
        box.innerHTML = resultsHTML('');
        input.focus();
      },
      true);   // readOnly → 底部只有「关闭」按钮（搜索弹窗无「保存」语义）
  }

  /* ---------- 快捷键：Ctrl+K / ⌘K（输入法组词期间不触发） ---------- */
  document.addEventListener('keydown', e => {
    if((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')){
      e.preventDefault();
      if(e.isComposing) return;
      openSearch();
    }
  });
})();
