/* ================= 移动端交互（mobile） =================
 * 职责：
 *   1. 手机端（<720px）抽屉导航开关 + 遮罩
 *   2. 点击导航项后自动收起抽屉
 *   3. 注册 Service Worker（PWA 离线缓存，仅 HTTPS / localhost）
 * 在 core.js 与 modules/*.js 加载后、boot.js 之前执行。
 */
(function(){
  var menu = document.getElementById('m-menu');
  var backdrop = document.getElementById('m-backdrop');

  function openDrawer(){ document.body.classList.add('drawer-open'); }
  function closeDrawer(){ document.body.classList.remove('drawer-open'); }

  if(menu) menu.addEventListener('click', function(){ document.body.classList.toggle('drawer-open'); });
  if(backdrop) backdrop.addEventListener('click', closeDrawer);

  // 点击任意导航项后收起抽屉
  document.addEventListener('click', function(e){
    if(e.target.closest('[data-action="nav"]')) closeDrawer();
  });

  // 注册 Service Worker（PWA）：仅 HTTPS 或 localhost 可用
  if('serviceWorker' in navigator){
    var ok = location.protocol === 'https:' || ['localhost','127.0.0.1'].indexOf(location.hostname) > -1;
    if(ok){
      window.addEventListener('load', function(){
        navigator.serviceWorker.register('./sw.js').catch(function(err){
          console.warn('Service Worker 注册失败:', err);
        });
      });
    }
  }
})();
