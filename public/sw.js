/* Minimal service worker — network-first; never return a non-Response to respondWith(). */
const CACHE = "clarify-ai-v4";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function offlineResponse() {
  return new Response("Offline", {
    status: 503,
    statusText: "Service Unavailable",
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Let SPA navigations and API calls go straight to the network (no SW interception).
  if (request.mode === "navigate") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/assets/")) {
    // Hashed build assets — network first, cache fallback.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached ?? offlineResponse())),
    );
    return;
  }

  // Other same-origin GET (icons, manifest, etc.)
  event.respondWith(
    fetch(request)
      .catch(() => caches.match(request))
      .then((response) => response ?? offlineResponse()),
  );
});
