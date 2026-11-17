/* home movie: يمرّر الفيديو من Google Drive إلى مشغّل الصفحة مع صلاحية الدخول،
   فيعمل التقديم والترجيع ويُحفظ مكان التوقف. لا يخزّن أي ملف. */
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  var m = u.pathname.match(/\/stream\/([\w-]+)$/);
  if (!m || u.origin !== self.location.origin) return;
  var t = u.searchParams.get('t') || '';
  var h = new Headers({ Authorization: 'Bearer ' + t });
  var range = e.request.headers.get('Range');
  if (range) h.set('Range', range);
  e.respondWith(fetch('https://www.googleapis.com/drive/v3/files/' + m[1] + '?alt=media&supportsAllDrives=true', { headers: h }));
});
