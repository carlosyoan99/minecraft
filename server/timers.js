"use strict";

// ============================================================
// TIMERS: bucle principal, trampa del templo, métricas y arranque
// ============================================================
// Fase 18 (D-1): el bucle principal (mainLoop), la trampa de los templos de
// jungla (tickTempleTraps), las métricas de rendimiento (perf/
// getServerMetrics) y el arranque del servidor (start) salen de net.js a
// este módulo. net.js conserva la conexión, el switch de mensajes y el
// broadcast; aquí vive el "reloj" del servidor (setInterval del tick) y
// todo lo que se ejecuta por tick.
//
// Ciclos de require: timers.js NO requiere net.js (ni net.js a timers — la
// fachada `start` se re-exporta en net.js llamando a timers.start). Los
// hooks que viven en net.js (broadcast, broadcastMining y worldTime) se
// inyectan aquí con set*Fn desde net.js al cargar. Los tests que ejercitan
// el bucle (unit-red, unit-metricas, unit-perf-server) siguen usando
// net.mainLoop/net.getServerMetrics/net.tickTempleTraps: net.js re-exporta
// estas fachadas sin cambios.
// ============================================================
const http = require("node:http");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const WebSocket = require("ws");
const constants = require("./constants.js");
const {
	PORT,
	TICK_MS,
	DESPAWN_DIST,
	WS_MAX_PAYLOAD,
	isNightTime, // C-1: noche estricta (fase ≥ duskEnd) — spawn hostil y dormir
	isDayTime // C-1: día estricto (sin crepúsculos) — quema solar
} = constants;
const state = require("./state.js");
const world = require("./world.js");
const playerHelpers = require("./players.js");
const crafting = require("./crafting.js");
const mobs = require("./mobs.js");
const mining = require("./mining.js");
const tnt = require("./tnt.js"); // Fase 10 (D2)
const fishing = require("./fishing.js"); // Fase 21.5 (A1): pesca
const chunkFill = require("./chunk-fill.js"); // Fase 18 (D-1): relleno progresivo

// ============================================================
// HOOKS INYECTADOS DESDE net.js (evitan el ciclo net↔timers)
// ============================================================
// Reloj del mundo ajustable (/time set): el día/noche, el ambiente y la IA
// de mobs siguen al mismo reloj (worldTime), así que el comando afecta a todo.
let worldTime = () => 0;
function setWorldTimeFn(fn) {
	worldTime = fn;
}

// broadcast a todos los jugadores conectados (definido en net.js).
let netBroadcast = () => {};
function setBroadcastFn(fn) {
	netBroadcast = fn;
}

// sendFn de minería (mining.js lo llama como (player, event, data)): en vez
// de enviar solo al minero, hace broadcast de las grietas a todos los que
// vean el bloque (definido en net.js, usa broadcastNear).
let netBroadcastMining = () => {};
function setBroadcastMiningFn(fn) {
	netBroadcastMining = fn;
}

// ============================================================
// TRAMPA DEL TEMPLO DE JUNGLA (Fase 12, Bloque B)
// Al pisar el pasadizo norte (celda de presión simplificada, templeTrapAt),
// el templo dispara 3-5 flechas hacia el jugador con cooldown por templo
// (~3s). Reusa la física de proyectiles (shootArrow de mobs.js) con un
// shooter sintético cuyo `from` es null: la flecha no pertenece a ningún
// jugador y daña a todos los que interseccione (como la trampa de
// Minecraft). Sin redstone: la detección es posicional (decisión E5).
// ============================================================
const TEMPLE_TRAP_COOLDOWN_MS = 3000;
const TEMPLE_TRAP_ARROWS = 4; // 3-5 flechas por disparo

// Fase 17 (A1): los jugadores del menú no pisaron ningún mundo (no hay
// trampa que disparar).
function tickTempleTraps() {
	for (const p of state.players.values()) {
		if (!p || p.inMenu || p.ws.readyState !== WebSocket.OPEN) continue;
		const bx = Math.floor(p.x);
		const bz = Math.floor(p.z);
		if (!world.templeTrapAt(bx, bz)) continue;
		// Cooldown por templo: la clave es el centro del templo más cercano.
		const s = world.structureAt(bx, bz);
		if (s?.type !== "temple") continue;
		const key = `${Math.floor(s.cx)},${Math.floor(s.cz)}`;
		const last = state.templeTrapCooldowns.get(key) || 0;
		if (Date.now() - last < TEMPLE_TRAP_COOLDOWN_MS) continue;
		state.templeTrapCooldowns.set(key, Date.now());
		// Flechas del dispensador: salen de la pared norte del pasillo (el
		// techo del templo, ~4 bloques sobre el piso) hacia el jugador.
		const shooter = {
			x: Math.floor(s.cx) - 2,
			y: world.getHeight(Math.floor(s.cx), Math.floor(s.cz)) + 4,
			z: Math.floor(s.cz) - 2,
			id: null
		};
		for (let i = 0; i < TEMPLE_TRAP_ARROWS; i++) {
			// Dispersión aleatoria: cada flecha se desvía un poco de la línea
			// directa (aún alcanza al jugador a corta distancia del pasillo).
			const target = {
				x: p.x + (Math.random() - 0.5) * 0.8,
				y: p.y + 1.4 + (Math.random() - 0.5) * 0.6,
				z: p.z + (Math.random() - 0.5) * 0.8
			};
			mobs.shootArrow(shooter, target);
		}
		netBroadcast("chat", {
			id: "⚙️ Templo",
			message: "¡Ssst! ¡Flechas!"
		});
	}
	// P9 (auditoría 2026-08-11): limpiar cooldowns huérfanos — antes cada
	// templo alguna vez visitado dejaba una entrada en el Map para siempre
	// (fuga menor en sesiones largas). Solo se conservan los templos con un
	// jugador encima AHORA; el resto se suelta (el próximo disparo lo recrea).
	if (state.templeTrapCooldowns.size > 0) {
		const active = new Set();
		for (const q of state.players.values()) {
			if (q.inMenu) continue;
			const t = world.structureAt(Math.floor(q.x), Math.floor(q.z));
			if (t?.type === "temple")
				active.add(`${Math.floor(t.cx)},${Math.floor(t.cz)}`);
		}
		for (const k of state.templeTrapCooldowns.keys())
			if (!active.has(k)) state.templeTrapCooldowns.delete(k);
	}
}

// ============================================================
// TRAMPA TNT DE LA PIRÁMIDE DEL DESIERTO (Fase 21, B2)
// Al pisar la celda central de la bandeja subterránea (pyramidTrapAt), se
// ignita el TNT enterrado 1 bloque bajo ella (cadena tnt.ignite/explode
// existente, F10/F11) con cooldown por pirámide (~3s): el cráter rompe el
// piso y los cofres de las esquinas (aunque no siempre todos: los cofres
// CON contenido se respetan en explode). Como en la del templo, sin
// redstone: la detección es posicional (decisión E5).
// ============================================================
const PYRAMID_TRAP_COOLDOWN_MS = 3000;
const PYRAMID_TRAP_TNT_Y = -3; // el TNT está 3 bloques bajo el piso exterior

function tickPyramidTraps() {
	for (const p of state.players.values()) {
		if (!p || p.inMenu || p.ws.readyState !== WebSocket.OPEN) continue;
		const bx = Math.floor(p.x);
		const bz = Math.floor(p.z);
		if (!world.pyramidTrapAt(bx, bz)) continue;
		const pr = world.pyramidAt(bx, bz);
		if (!pr) continue;
		const cx = Math.floor(pr.cx);
		const cz = Math.floor(pr.cz);
		const key = `${cx},${cz}`;
		const last = state.pyramidTrapCooldowns.get(key) || 0;
		if (Date.now() - last < PYRAMID_TRAP_COOLDOWN_MS) continue;
		state.pyramidTrapCooldowns.set(key, Date.now());
		// El TNT enterrado bajo el centro de la bandeja (baseY-3 en Y de mundo).
		const tntY = world.getHeight(cx, cz) + PYRAMID_TRAP_TNT_Y;
		if (!tnt.ignite(cx, tntY, cz)) continue;
		netBroadcast("chat", {
			id: "⚙️ Pirámide",
			message: "¡Tsss... TNT!"
		});
	}
	// P9 (mismo patrón que el templo): limpiar cooldowns huérfanos — solo se
	// conservan las pirámides con un jugador encima AHORA.
	if (state.pyramidTrapCooldowns.size > 0) {
		const active = new Set();
		for (const q of state.players.values()) {
			if (q.inMenu) continue;
			const pr = world.pyramidAt(Math.floor(q.x), Math.floor(q.z));
			if (pr) active.add(`${Math.floor(pr.cx)},${Math.floor(pr.cz)}`);
		}
		for (const k of state.pyramidTrapCooldowns.keys())
			if (!active.has(k)) state.pyramidTrapCooldowns.delete(k);
	}
}

// ============================================================
// BUCLE PRINCIPAL
// ============================================================
// Métricas de rendimiento (Fase 7): media móvil de 1s del tiempo por tick
// (tickMs) y del tiempo generando chunks (chunkGenMs, acumulado por
// world.takeChunkGenMs). Cada segundo se hace broadcast de server_metrics a
// los clientes, que lo exponen como window.__mcServerTickMs/__mcChunkGenMs
// para la auditoría y el HUD F3. getServerMetrics() lo expone a los tests.
const perf = {
	frames: 0,
	tickAccum: 0,
	genAccum: 0,
	lastSentAt: Date.now(), // la primera ventana empieza completa (1s), no truncada
	lastTickMs: 0,
	lastGenMs: 0
};

// Último snapshot serializado de mobs (Fase 14, M2): el broadcast de
// mobs_update a 20 Hz era incondicional aunque nada hubiera cambiado entre
// ticks. Ahora se serializa el snapshot una sola vez y solo se emite si el
// JSON difiere del anterior (barato y suficiente: sin cambios → sin mensaje).
let lastMobsJson = "";
function mainLoop() {
	const t0 = performance.now();
	// Fase 18 (C-1): noche/día ESTRICTOS por franjas MC (día 10 / atardecer
	// 1,5 / noche 7 / amanecer 1,5 sobre 20 min). El flag isNight pasa a los
	// mobs para el spawn hostil y la quema solar (tickSunBurn usa el día
	// estricto: solo arde fuera de la noche, incluido el crepúsculo como MC).
	const isNight = isNightTime(worldTime());
	const isDay = isDayTime(worldTime());
	for (const m of state.mobs) if (m.alive) m.tick(isNight, isDay);
	// Auditoría 2026-08-09 (§4.3): despawn por distancia como MC — un mob a
	// >128 bloques de TODO jugador conectado (y sin dueño) se elimina. Antes
	// los mobs se acumulaban indefinidamente lejos del pueblito (solo morían
	// de sol/combate), inflando state.mobs sin límite.
	{
		const playersArr = [...state.players.values()];
		if (playersArr.length) {
			state.mobs = state.mobs.filter((m) => {
				if (!m.alive) return false; // los muertos se limpian igualmente
				if (m.ownerId) return true; // las mascotas siguen al jugador
				// Fase 18 (C-8): los orbes de XP NO se despawnean por distancia —
				// expiran por su propio TTL (5 min) en tickXpOrbs; si no, un
				// jugador que muere lejos del spawn perdería el orbe al instante.
				if (m.type === "xp_orb") return true;
				return playersArr.some(
					(pl) =>
						Math.hypot(m.x - pl.x, m.z - pl.z) <= DESPAWN_DIST &&
						Math.abs(m.y - pl.y) <= DESPAWN_DIST
				);
			});
		}
	}
	state.mobs = state.mobs.filter((m) => m.alive);
	// Fase 18 (C-8): recogida y expiración de orbes de XP (se llama ANTES del
	// snapshot para que un orbe recogido este tick no se envíe al cliente).
	mobs.tickXpOrbs();
	const mobsData = state.mobs.map(mobs.mobSnapshot);
	const mobsJson = JSON.stringify(mobsData);
	if (mobsJson !== lastMobsJson) {
		lastMobsJson = mobsJson;
		netBroadcast("mobs_update", mobsData);
	}

	// Fase 9 (Bloque D): proyectiles del esqueleto — avanzar física y enviar.
	// Fase 21.5 (A1): los bobbers de pesca comparten el mismo canal (kind
	// "bobber") para que el cliente los dibuje con la misma maquinaria.
	const arrows = mobs.tickArrows(TICK_MS);
	const bobbers = fishing.tickBobbers(TICK_MS);
	const projectileData = [
		...arrows.map(mobs.arrowSnapshot),
		...bobbers.map(fishing.bobberSnapshot)
	];
	if (projectileData.length) netBroadcast("arrows_update", projectileData);

	// Fase 12 (Bloque B): trampa de los templos de jungla — al pisar el
	// pasadizo se disparan flechas (con cooldown por templo).
	tickTempleTraps();

	// Fase 21 (B2): trampa TNT de las pirámides del desierto — al pisar la
	// celda central de la bandeja se ignita el TNT enterrado (cooldown por
	// pirámide; la explosión se encadena sola).
	tickPyramidTraps();

	// Fase 9 (Bloque C): crecimiento de cultivos — cada ~1s los cultivos
	// sembrados avanzan de estado (hasta madurar, stage 7). Probabilidad por
	// tick para que el ritmo sea orgánico y no todos maduren a la vez.
	state.cropAccum = (state.cropAccum || 0) + TICK_MS;
	if (state.cropAccum >= 1000) {
		state.cropAccum = 0;
		for (const [key, c] of state.crops) {
			if (c.stage >= 7) continue;
			if (Math.random() < 0.5) {
				c.stage++;
				state.dirtyChunks.add(
					`${Math.floor(key.split(",")[0] / 16)},${Math.floor(key.split(",")[2] / 16)}`
				);
			}
		}
	}

	// Hambre: decae con el tiempo/actividad, regenera o inanición
	// (en modo creative no se aplica: /gamemode creative; los jugadores del
	// menú no están en el mundo — Fase 17 A1)
	for (const p of state.players.values()) {
		if (p.inMenu) continue;
		if (p.gamemode !== "creative") playerHelpers.tickPlayer(p, TICK_MS);
	}

	// Fase 19.5 (A1): bioma del jugador → evento biome_update solo al CRUZAR
	// de bioma (no cada tick). La música del cliente cambia con esto; es un
	// evento nuevo retrocompatible (el cliente lo ignora si no lo conoce).
	state.biomeAccum = (state.biomeAccum || 0) + TICK_MS;
	if (state.biomeAccum >= 1000) {
		state.biomeAccum = 0;
		sendBiomeUpdates();
	}

	// Minería (Fase 6): avanza las sesiones de rotura (dureza/velocidad); al
	// completarse se rompe el bloque (drop condicional, XP, desgaste). Las
	// grietas (block_break_progress) se hacen broadcast a TODOS los que vean
	// el bloque (Fase 7): no solo el minero ve el progreso de rotura.
	for (const p of state.players.values()) {
		if (p.inMenu) continue;
		if (p.mining)
			mining.tickMining(p, TICK_MS, world, playerHelpers, netBroadcastMining);
	}

	// Spawn de mobs por fase del día (Fase 6): de día solo pasivos, de noche
	// también hostiles, en cualquier chunk cargado del área de render.
	if (Math.random() < 0.03) mobs.spawnMobs(isNight);

	// Fase 14 (M5/C5) + Fase 18 (D-1): relleno progresivo del radio de render
	// (módulo server/chunk-fill.js) — lote por tick y jugador, por anillos.
	chunkFill.fillForPlayers(
		state,
		world,
		constants.CHUNK_SIZE,
		CHUNK_FILL_PER_TICK
	);

	// Fase 10 (D2): mechas de TNT (explotan al agotarse — cráter + cadena).
	tnt.tick(TICK_MS);

	crafting.tickFurnaces();
	// Fase 16 (C5/REN-2): notificar los hornos abiertos por SU índice de
	// watchers (O(H+J) por tick) en vez de escanear cada horno contra cada
	// jugador (O(H×J)). Un horno sin watchers o roto se limpia del índice
	// aquí mismo, sin tocar los tres sitios que borran el horno del mundo.
	for (const [key, watchers] of state.openFurnaceWatchers) {
		if (watchers.size === 0) {
			state.openFurnaceWatchers.delete(key);
			continue;
		}
		const f = state.furnaces.get(key);
		if (!f) {
			// Hornos rotos/explotados mientras estaban abiertos: nadie a quien
			// notificar, el índice se auto-limpia.
			state.openFurnaceWatchers.delete(key);
			continue;
		}
		const data = { key, ...crafting.furnaceSnapshot(f) };
		for (const pid of watchers) {
			const p = state.players.get(pid);
			if (p && p.ws.readyState === WebSocket.OPEN)
				p.ws.send(JSON.stringify({ event: "furnace_state", data }));
		}
	}

	// Métricas: acumular el tick; cada ~1s, media móvil + broadcast a los
	// clientes conectados (server_metrics → __mcServerTickMs/__mcChunkGenMs).
	perf.frames++;
	perf.tickAccum += performance.now() - t0;
	perf.genAccum += world.takeChunkGenMs();
	const now = Date.now();
	if (now - perf.lastSentAt >= 1000 && perf.frames > 0) {
		perf.lastTickMs = perf.tickAccum / perf.frames;
		perf.lastGenMs = perf.genAccum / perf.frames;
		netBroadcast("server_metrics", {
			tickMs: perf.lastTickMs,
			chunkGenMs: perf.lastGenMs
		});
		perf.frames = 0;
		perf.tickAccum = 0;
		perf.genAccum = 0;
		perf.lastSentAt = now;
	}
}

// Última ventana calculada de métricas (para tests/auditoría).
function getServerMetrics() {
	return { tickMs: perf.lastTickMs, chunkGenMs: perf.lastGenMs };
}

// Fase 14 (M2): al entrar un jugador NUEVO, el snapshot de mobs debe llegarle
// aunque nada haya cambiado desde el último mobs_update (el broadcast es
// condicional). net.js llama a resetMobsDirty() en handleConnection para
// forzar el envío en el próximo tick a todos, incluido el recién llegado.
function resetMobsDirty() {
	lastMobsJson = "";
}

// Tamaño del lote de relleno (chunks por tick y jugador): con TICK_MS=50
// (20 Hz) son ~6×20=120 chunks/s, el radio completo (169) se completa en
// ~1.5 s. Mismo valor que usaba net.js (CHUNK_FILL_PER_TICK).
const CHUNK_FILL_PER_TICK = 6;

// Auditoría 2026-08-15 (M1): CSWSH — un sitio ajeno en la misma LAN podía
// abrir sockets contra el servidor. `verifyClient` valida el Origin/Referer
// del handshake contra una allowlist: mismas IP (Host) o localhost. Se
// permite sin Origin (clientes WS crudos de tests/lanchas) y hosts de
// loopback; se rechaza un Host con puerto distinto al nuestro tras el proxy.
function originAllowed(origin) {
	if (!origin) return true; // WS sin navegador (tests/E2E): sin origen
	const OUR_HOST = `localhost:${PORT}`;
	const hostname = origin.replace(/^https?:\/\//i, "").split("/")[0];
	if (!hostname || hostname.indexOf(":") === -1) return true; // origen relativo/raro
	// Interfaces LAN (192.168/10./172.16-/172.31) cualquier puerto, y
	// localhost/nuestro puerto exacto.
	const hostOnly = hostname.split(":")[0];
	if (/^(127\.0\.0\.1|localhost|\[::1\])$/.test(hostOnly)) return true;
	if (
		/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostOnly) ||
		hostname === OUR_HOST
	)
		return true;
	return false;
}

// Arranque del servidor HTTP + WebSocket. `handleConnection` y `app` se
// pasan desde net.js (viven allí: conexión y estático); aquí solo se
// registran el tick, el keepalive y el listen. net.js re-exporta start()
// como fachada (server.js llama a net.start() sin cambios).
function start(handleConnection, app) {
	const server = http.createServer(app);
	// Fase 8 (mejora documentada): límite explícito de tamaño de mensaje
	// entrante (la librería ws usa ~100 MiB por defecto). Los mensajes del
	// protocolo son pequeños (moves, chat ≤200 chars, block_action), así que
	// 1 MiB basta para impedir que un cliente malicioso sature la memoria
	// del servidor con payloads gigantes (ws cierra la conexión con 1009).
	const wss = new WebSocket.Server({
		server,
		maxPayload: WS_MAX_PAYLOAD,
		// Auditoría 2026-08-15 (M1): allowlist de orígenes (CSWSH).
		verifyClient(info) {
			return originAllowed(info.origin);
		}
	});
	wss.on("connection", handleConnection);
	// Fase 17 (B2): keepalive — ping a todos los sockets cada 15s; el que no
	// responde al pong en dos rondas se termina (detecta conexiones muertas y
	// mantiene vivas las que pasan por proxies con timeout de inactividad).
	const heartbeat = setInterval(() => {
		for (const ws of wss.clients) {
			if (ws.isAlive === false) {
				ws.killedByHeartbeat = true;
				ws.terminate();
				continue;
			}
			ws.isAlive = false;
			try {
				ws.ping();
			} catch {
				ws.killedByHeartbeat = true;
				ws.terminate();
			}
		}
	}, 15000);
	heartbeat.unref?.(); // no impide que el proceso termine solo

	// F16-05 (auditoría 2026-08-11): el bucle del tick queda BLINDADO — una
	// excepción interna (como el crash F16-01 antes del guard) no debe tumbar
	// el proceso entero: se loguea y el siguiente tick continúa (el handler de
	// mensajes ya tenía su propio try/catch; el mainLoop no).
	setInterval(() => {
		try {
			mainLoop();
		} catch (err) {
			log.error("mainLoop:", err);
		}
	}, TICK_MS);

	server.listen(PORT, () => {
		log.info(`🚀 Servidor escuchando en http://localhost:${PORT}`);
		// Fase 17 (A1): sin SEED el banner muestra el modo menú.
		log.info(
			constants.MENU_MODE && !constants.worldPaths.currentSeed
				? "🗂️ Modo menú: sin mundo activo (los jugadores eligen/crean mundo)."
				: `🌍 Semilla: ${constants.worldPaths.currentSeed}  |  📦 Chunks: ${state.chunks.size}  |  🧟 Mobs: ${state.mobs.length}`
		);
	});
}

// Envía biome_update a los jugadores que cruzaron de bioma (exportado para
// el test; el mainLoop lo llama cada ~1s vía biomeAccum). Devuelve cuántos
// eventos se enviaron.
function sendBiomeUpdates() {
	let n = 0;
	for (const p of state.players.values()) {
		if (p.inMenu) continue;
		const b = world.getBiome(p.x, p.z);
		if (b !== p.lastBiome) {
			p.lastBiome = b;
			if (p.ws && p.ws.readyState === WebSocket.OPEN) {
				p.ws.send(
					JSON.stringify({ event: "biome_update", data: { biome: b } })
				);
				n++;
			}
		}
	}
	return n;
}

module.exports = {
	mainLoop,
	tickTempleTraps,
	tickPyramidTraps,
	getServerMetrics,
	sendBiomeUpdates,
	resetMobsDirty,
	originAllowed, // Auditoría 2026-08-15 (M1): allowlist de orígenes (test)
	start,
	setWorldTimeFn,
	setBroadcastFn,
	setBroadcastMiningFn
};
