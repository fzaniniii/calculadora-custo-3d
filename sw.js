const CACHE_NAME = "calc3d-enxuto-4";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/config.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  /* Só cuidamos dos arquivos do próprio site. Chamadas a outros domínios
     (API do Supabase) passam direto: servi-las do cache devolveria dados
     velhos e a sincronização enxergaria uma lista desatualizada. */
  if (new URL(req.url).origin !== self.location.origin) return;

  const isPage =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  /* Páginas: rede primeiro, para a versão nova chegar assim que houver
     internet; cache só como reserva quando estiver offline. */
  if (isPage) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put("/index.html", clone));
          return res;
        })
        .catch(() =>
          caches.match(req).then((hit) => hit || caches.match("/index.html"))
        )
    );
    return;
  }

  /* Demais arquivos: cache primeiro, atualizando por trás. */
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, clone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
