// Наше кіно — service worker.
// 1) Makes the site installable and quick to open: the page is fetched fresh when online (falls back to
//    the saved copy offline); versioned files (?v=…) and the pinned Supabase library are served from cache.
// 2) Shows phone notifications sent by the server when your partner changes something.
const CACHE = "oc-v1";

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.add("./")).catch(() => {}));
});
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (!same && url.hostname !== "cdn.jsdelivr.net") return; // Supabase, TMDB, YouTube: straight to the network
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).then((r) => {
      if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put("./", c)); }
      return r;
    }).catch(async () => (await caches.match("./")) || Response.error()));
    return;
  }
  if (same && !url.search) return; // unversioned files: normal browser caching
  e.respondWith((async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    const r = await fetch(req);
    if (r.ok) {
      const c = r.clone(), cache = await caches.open(CACHE);
      // drop older versions of the same file
      for (const k of await cache.keys()) { const u = new URL(k.url); if (u.pathname === url.pathname && u.search !== url.search) cache.delete(k); }
      cache.put(req, c);
    }
    return r;
  })());
});

self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Наше кіно", {
    body: d.body || "", lang: "uk", icon: "icons/icon-192.png", badge: "icons/badge-96.png",
    tag: d.tag || undefined, renotify: !!d.tag, data: { tab: d.tab || "" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const tab = (e.notification.data && e.notification.data.tab) || "";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = wins.find((w) => w.url.startsWith(self.registration.scope));
    if (open) { await open.focus(); open.postMessage({ type: "open-tab", tab }); return; }
    await self.clients.openWindow(self.registration.scope + (tab ? "#" + tab : ""));
  })());
});
