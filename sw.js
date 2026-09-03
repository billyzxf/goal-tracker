/* ================= GoalTracker Service Worker（PWA 离线缓存） =================
 * 策略：
 *   - 应用外壳 HTML → 网络优先（部署后立即拿到新版），失败回退缓存（离线可用）
 *   - 静态资源（JS/CSS/图标）→ 缓存优先 + 后台更新（SWR）：秒开离线缓存，
 *     同时在后台拉取最新版写入缓存，下次打开即为新版，无需手动改版本号
 *   - 数据文件（JSON/CSV）→ 网络优先，失败回退缓存（离线可用）
 * 版本号仅在需要清空全部缓存时才需要修改。
 */
const CACHE = 'goal-tracker-v4';

const CORE = [
  './',
  './index.html',
  './style.css',
  './core.js',
  './lib/pinyin-pro.js',
  './boot.js',
  './mobile.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './modules/dashboard.js',
  './modules/fitness.js',
  './modules/habits.js',
  './modules/review.js',
  './modules/garden.js',
  './modules/job.js',
  './modules/reading.js',
  './modules/side.js',
  './modules/threshold.js',
  './modules/val-core.js',
  './modules/valuation.js',
  './modules/earnings.js',
  './modules/macro.js',
  './modules/principles.js'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){
      return c.addAll(CORE);
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);
  if(url.origin !== location.origin) return; // 跨域（如 KaTeX CDN）不拦截

  // 数据文件：网络优先，失败回退缓存（忽略查询串，便于离线命中）
  if(/\.json$/.test(url.pathname) || /\.csv$/.test(url.pathname)){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req, { ignoreSearch:true });
      })
    );
    return;
  }

  // 页面导航（HTML）：网络优先，保证部署后第一时间拿到新外壳；离线回退缓存
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put('./index.html', copy); });
        return res;
      }).catch(function(){
        return caches.match('./index.html').then(function(r){ return r || Response.error(); });
      })
    );
    return;
  }

  // 其余静态资源：缓存优先 + 后台更新（SWR）
  e.respondWith(
    caches.match(req).then(function(cached){
      var fetchAndCache = fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
      if(cached){
        fetchAndCache.catch(function(){}); // 后台更新失败不影响本次响应
        return cached;
      }
      return fetchAndCache;
    })
  );
});
