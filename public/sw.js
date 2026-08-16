// ============================================================
// SERVICE WORKER (offline LAN): cachea los estáticos del juego para
// que la segunda carga y siguientes funcionen sin red y sin depender
// de CDN externos (Three.js ya se sirve local en public/vendor/).
//
// IMPORTANTE (limitación del navegador): un service worker solo se
// registra en contexto seguro — `localhost` o HTTPS. En una LAN
// accesible como http://192.168.x.x:3000 el SW NO se registra (por
// política del navegador, no del servidor); el juego sigue funcionando
// igual porque todos los módulos se sirven locales.
//
// Estrategia: runtime-cache por alcance (scope "mx").
//   - navegaciones e índices: network-first (siempre la versión nueva,
//     con fallback a caché si el servidor está caído);
//   - arquitectura (módulos JS/CSS): network-first con caché en
//     background (sirve la versión nueva, pero si la red falla usa la
//     caché) — clave mantener hot-reload del atlas/recetas al día;
//   - el Web Worker de chunks (module worker) también pasa por aquí.
// cache-busting (`textures.js?t=...`) genera URLs nuevas → se descargan
// y cachean como claves distintas, no pisan la versión vieja.
// ============================================================
const SCOPE = "mx-v1";

// Precache mínimo: la aplicación ya no depende de CDN (clave del fix),
// así que el install solamente prepara la caché del SW.
self.addEventListener("install", (e) => {
	self.skipWaiting();
	e.waitUntil(
		caches
			.open(SCOPE)
			.then((c) => c.addAll(["./"]))
			.catch(() => {})
	);
});

// Limpia versiones viejas del alcance al activarse.
self.addEventListener("activate", (e) => {
	e.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((k) => k.startsWith("mx-") && k !== SCOPE)
						.map((k) => caches.delete(k))
				)
			)
			.then(() => self.clients.claim())
	);
});

function isSameOrigin(url) {
	const u = new URL(url);
	return u.origin === self.location.origin;
}

// GET mismo-origen de tipo document (navegación) o el propio SW/manifest.
function isNavigation(request) {
	return request.mode === "navigate";
}

// GET mismo-origen que NO sea un WebSocket (los WS no pasan por fetch).
self.addEventListener("fetch", (e) => {
	const { request } = e;
	if (request.method !== "GET" || !isSameOrigin(request.url)) return;
	if (isNavigation(request)) {
		e.respondWith(
			fetch(request)
				.then((res) => {
					const copy = res.clone();
					caches.open(SCOPE).then((c) => c.put(request, copy));
					return res;
				})
				.catch(
					async () =>
						(await caches.match(request)) || (await caches.match("./"))
				)
		);
		return;
	}
	// Arquitectura (JS/CSS/imágenes/fuentes): network-first con respaldo.
	// El hot-reload del atlas/recetas cambia estos archivos en caliente; con
	// cache-first se serviría la versión vieja. Network-first mantiene el
	// juego fresco en LAN y la caché es solo el plan B sin servidor.
	e.respondWith(
		fetch(request)
			.then((res) => {
				if (res.ok) {
					const copy = res.clone();
					caches.open(SCOPE).then((c) => c.put(request, copy));
				}
				return res;
			})
			.catch(() => caches.match(request))
	);
});
