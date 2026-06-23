// Service worker de toctoc: cachea el "app shell" (HTML/CSS/JS/iconos) para que
// la app cargue al instante y offline e instalable como PWA. La identidad y los
// datos (/api/*) y el tiempo real (/ws) NUNCA se cachean: siempre van a la red.
//
// Estrategia: stale-while-revalidate del shell. Sube la versión del CACHE al
// cambiar el shell.
const CACHE = "toctoc-v1";
const SHELL = [
  "/",
  "/style.css",
  "/js/main.js",
  "/js/util.js",
  "/js/api.js",
  "/js/session.js",
  "/js/ws.js",
  "/js/render.js",
  "/js/conversation.js",
  "/js/chats.js",
  "/manifest.webmanifest",
  "/icon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET") return; // login/color/chats → red
  if (url.origin !== location.origin) return; // fuentes/terceros → red
  if (url.pathname.startsWith("/api") || url.pathname === "/ws") return; // datos/realtime → red

  e.respondWith(
    (async () => {
      const cached = await caches.match(e.request);
      const network = fetch(e.request)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })(),
  );
});
