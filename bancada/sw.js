/* Bancada — service worker.
 *
 * Ao mexer em qualquer arquivo da lista abaixo, incremente o CACHE. Sem
 * isso o app já instalado continua servindo a versão velha.
 */

const CACHE = "bancada-1";

const ARQUIVOS = [
  "./",
  "./index.html",
  "./estilo.css",
  "./app.js",
  "./config.js",
  "./manifest.webmanifest",
  "./fontes/geist-latin.woff2",
  "./fontes/geist-latin-ext.woff2",
  "./icones/icone-192.png",
  "./icones/icone-512.png"
];

self.addEventListener("install", (ev) => {
  ev.waitUntil(caches.open(CACHE).then((c) => c.addAll(ARQUIVOS)));
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(
    caches.keys()
      .then((chaves) => Promise.all(
        chaves.filter((k) => k !== CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

/* A tarja de atualização manda esta mensagem quando o usuário toca em
   Atualizar. Sem ela, a versão nova só assume no próximo fechamento. */
self.addEventListener("message", (ev) => {
  if (ev.data && ev.data.tipo === "assumir") self.skipWaiting();
});

self.addEventListener("fetch", (ev) => {
  const req = ev.request;
  if (req.method !== "GET") return;

  /* Só cuidamos dos arquivos do próprio site. Chamadas a outros domínios
     passam direto: servi-las do cache devolveria dado velho. */
  if (new URL(req.url).origin !== self.location.origin) return;

  const éPágina = req.mode === "navigate" ||
                  (req.headers.get("accept") || "").includes("text/html");

  /* Páginas: rede primeiro, para a versão nova chegar assim que houver
     internet; cache como reserva quando estiver offline. */
  if (éPágina) {
    ev.respondWith(
      fetch(req)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copia));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
    );
    return;
  }

  /* Demais arquivos: cache primeiro, atualizando por trás. */
  ev.respondWith(
    caches.match(req).then((cacheado) => {
      const rede = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const copia = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copia));
          }
          return res;
        })
        .catch(() => cacheado);
      return cacheado || rede;
    })
  );
});
