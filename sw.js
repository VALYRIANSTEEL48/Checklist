const CACHE = "checklist-v17";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./checklist.js",
  "./workout.js",
  "./assignments.js",
  "./targets.js",
  "./missions.js",
  "./wins.js",
  "./gamification.js",
  "./profile.js",
  "./shell.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Network-first: always try to get the latest file when online, only
  // falling back to the cached copy if the network request fails (i.e.
  // actually offline). This is intentionally NOT cache-first — during
  // active development, a cache-first strategy can keep serving an old,
  // already-fixed bug indefinitely even after new files are uploaded.
  //
  // { cache: "no-store" } matters here and is not redundant with the
  // "network-first" idea above: without it, this fetch() still goes
  // through the *browser's* own HTTP cache (a layer below the service
  // worker), which can quietly hand back a stale response — e.g. a
  // previously-cached checklist.js — even though we "tried the network."
  // That produces a genuinely confusing bug class: index.html updates
  // (it's the navigation request, usually revalidated) but a .js file
  // doesn't, so the page looks like it has new UI wired to old logic.
  // no-store forces an actual round-trip every time we're online.
  e.respondWith(
    fetch(e.request, { cache: "no-store" })
      .then((res) => {
        if (res && res.status === 200) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
