/*
 * IMPOSTR service worker: makes the app installable and opens it offline.
 *
 * - Build assets (/_next/static, /icons, /logos) never change once published:
 *   served from cache first.
 * - Pages: network first, falling back to the last cached copy when offline. The network copy
 *   comes from navigation preload, the browser's own request: it keeps the Sec-Fetch headers that
 *   tell the server whether the app was opened from outside (a request re-sent from here would
 *   always look same-origin, and a demo visitor reopening the app would skip the sign-in page).
 * - The API (/api) and images (/media) are private, per-browser data: never cached.
 */
const CACHE = "impostr-v3";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.resolve(self.registration.navigationPreload?.enable())
      .then(() => caches.keys())
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/media/")) return;

  const immutable = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/logos/");
  if (immutable) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone(); // clone now, before the page reads the body
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      Promise.resolve(event.preloadResponse)
        .then((preloaded) => preloaded || fetch(req))
        .then((res) => {
          if (res.ok) {
            const copy = res.clone(); // clone now, before the page reads the body
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});
