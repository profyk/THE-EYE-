const CACHE = "the-eye-v1";

// Pre-cache the app shell on install
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/"])));
  self.skipWaiting();
});

// Purge old cache versions on activate
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);

  // Never intercept: cross-origin, API calls, or non-GET requests
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/v1/") ||
    e.request.method !== "GET"
  ) {
    return;
  }

  // Next.js static assets: cache-first (they are content-hashed, safe to cache forever)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/_next/image")) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Public assets (icons, images): cache-first
  if (
    url.pathname.startsWith("/app-icon") ||
    url.pathname.startsWith("/logo") ||
    url.pathname.endsWith(".png") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".ico")
  ) {
    e.respondWith(
      caches.match(e.request).then(
        (hit) =>
          hit ||
          fetch(e.request).then((res) => {
            if (res.ok) {
              const clone = res.clone();
              caches.open(CACHE).then((c) => c.put(e.request, clone));
            }
            return res;
          })
      )
    );
    return;
  }

  // Page navigations: network-first so auth state is always checked,
  // fall back to cached shell if offline
  if (e.request.mode === "navigate") {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(e.request) || caches.match("/"))
    );
  }
});
