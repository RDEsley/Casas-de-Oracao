// Service worker mínimo: torna o site instalável e mantém a última versão vista disponível
// sem conexão. Sempre tenta a rede primeiro, então o app instalado nunca fica preso em versão antiga.
const CACHE = "casas-de-oracao-v4";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Rotas e distâncias dependem da posição do momento: nunca vêm do cache.
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const shell = request.mode === "navigate" ? await caches.match("/") : undefined;
        return shell ?? Response.error();
      }),
  );
});
