/* ================= GoalTracker Service Worker（PWA 离线缓存） =================
 * 策略：
 *   - 应用外壳（HTML/CSS/JS/manifest/图标）→ 缓存优先，安装时预缓存
 *   - 数据文件（goal-tracker-data.json）→ 网络优先，失败回退缓存（离线可用）
 * 更新：每次部署改 CACHE 版本号即可强制刷新缓存。
 */
const CACHE = 'goal-tracker-v2';

const CORE = [
  './',
  './index.html',
  './style.css',
  './core.js',
  './boot.js',
  './mobile.js',
  './manifest.json',
  './modules/dashboard.js',
  './modules/fitness.js',
  './modules/job.js',
  './modules/reading.js',
  './modules/side.js',
  './modules/threshold.js',
  './modules/val-core.js',
  './modules/valuation.js',
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

  // 静态资源：缓存优先，未命中则网络并写入缓存
  e.respondWith(
    caches.match(req).then(function(cached){
      if(cached) return cached;
      return fetch(req).then(function(res){
        if(res && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
