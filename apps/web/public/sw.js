// 앱 껍데기만 캐시한다. 데이터(Supabase)는 항상 네트워크에서 가져온다.
const CACHE = "our-money-v5";
const SHELL = ["/", "/plan/", "/check/", "/ledger/", "/settings/", "/manifest.webmanifest", "/icon-192.png", "/fonts/pretendard/pretendard.css", "/fonts/alan-sans/alan-sans.woff2"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  // 페이지: 네트워크 우선, 실패하면 캐시
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          // 정상 응답만, 주소의 ?쿼리(로그인 콜백의 code 등)는 빼고 경로로만 저장한다
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(url.pathname, copy));
          }
          return res;
        })
        .catch(() => caches.match(url.pathname).then((r) => r || caches.match("/"))),
    );
    return;
  }
  // 빌드 산출물: 캐시 우선
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/fonts/")) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
