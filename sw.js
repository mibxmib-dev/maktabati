/* home movie: عامل الخدمة
   1) يمرّر الفيديو من Google Drive إلى مشغّل الصفحة مع صلاحية الدخول (للتقديم والترجيع وحفظ مكان التوقف)
   2) يشغّل الحلقات المحمّلة من ذاكرة الجهاز، حتى بدون إنترنت
   3) يحفظ واجهة التطبيق ليفتح بدون إنترنت */
var SHELL = 'hm-shell-v1', DL = 'hm-dl';
var FILES = ['./', 'manifest.webmanifest', 'assets/scene.webp', 'assets/scene-p.webp', 'assets/title.webp', 'assets/title-p.webp', 'assets/icon-192-v2.png', 'assets/favicon-v2.png'];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) { return Promise.all(FILES.map(function (f) { return c.add(f).catch(function () {}); })); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('hm-shell-') === 0 && k !== SHELL; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
function fromDownloads(id, req) {
  return caches.open(DL).then(function (c) { return c.match(new URL('dl/' + id, self.registration.scope).href); }).then(function (r) {
    if (!r) return null;
    var range = req.headers.get('Range');
    if (!range) return r;
    return r.blob().then(function (blob) {
      var size = blob.size, m = /bytes=(\d*)-(\d*)/.exec(range) || [], start, end;
      if (m[1] === '' && m[2]) { start = Math.max(0, size - Number(m[2])); end = size - 1; }
      else { start = Number(m[1] || 0); end = m[2] ? Math.min(Number(m[2]), size - 1) : size - 1; }
      if (start >= size) return new Response('', { status: 416, headers: { 'Content-Range': 'bytes */' + size } });
      return new Response(blob.slice(start, end + 1), { status: 206, headers: {
        'Content-Type': r.headers.get('Content-Type') || 'video/mp4', 'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
        'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
    });
  });
}
self.addEventListener('fetch', function (e) {
  var req = e.request, u = new URL(req.url);
  if (u.origin !== self.location.origin || req.method !== 'GET') return;
  var m = u.pathname.match(/\/stream\/([\w-]+)$/);
  if (m) {
    var id = m[1], t = u.searchParams.get('t') || '';
    e.respondWith(fromDownloads(id, req).then(function (hit) {
      if (hit) return hit;
      var h = new Headers({ Authorization: 'Bearer ' + t }), range = req.headers.get('Range');
      if (range) h.set('Range', range);
      return fetch('https://www.googleapis.com/drive/v3/files/' + id + '?alt=media&supportsAllDrives=true', { headers: h });
    }));
    return;
  }
  if (/\/dl\//.test(u.pathname)) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) { var cp = res.clone(); caches.open(SHELL).then(function (c) { c.put('./', cp); }); return res; })
      .catch(function () { return caches.match('./', { ignoreSearch: true }); }));
    return;
  }
  if (/\/assets\/|manifest\.webmanifest$/.test(u.pathname) && !/demo\.mp4$/.test(u.pathname)) {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res.ok) { var cp = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, cp); }); } return res; });
      return hit || net;
    }));
  }
});
