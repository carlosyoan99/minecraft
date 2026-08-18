"use strict";

// ============================================================
// RED: HTTP + WebSocket, handler de conexión y bucle principal
// ============================================================
const express = require("express");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const _http = require("node:http");
const WebSocket = require("ws");
const path = require("node:path");
const { v4: uuidv4 } = require("uuid");
const constants = require("./constants.js");
const {
	VIEW_DISTANCE_CHUNKS,
	SPAWN_GRACE_MS,
	MAX_CONNECTIONS,
	MAX_MSG_RATE,
	MAX_ACTION_RATE,
	MAX_MSG_BYTES,
	B,
	NOT_MINEABLE,
	isSolidBlock,
	xpToNext,
	xpIntoLevel
} = constants;
const state = require("./state.js");
const world = require("./world.js");
const save = require("./save.js");
const playerHelpers = require("./players.js");
const mobs = require("./mobs.js");
const commands = require("./commands.js");
const mining = require("./mining.js");
const tnt = require("./tnt.js"); // Fase 10 (D2)
const fishing = require("./fishing.js"); // Fase 21.5 (A1): pesca
// Fase 18 (D-1): validación del move extraída — coords, void, bordes,
// sólidos, parábola del salto/hover y ventana de velocidad (anticheat.js).
const anticheat = require("./anticheat.js");
// F20 v20.2: rate-limit por conexión en módulo puro (ventanas consecutivas —
// una ráfaga tras un bloqueo del event loop no se confunde con un flood).
const { createRateLimit } = require("./ratelimit.js");
// Fase 18 (D-1): el relleno progresivo (chunkFill) lo consume el mainLoop de
// timers.js; aquí solo se re-exporta lo que los handlers del switch necesitan.
const worldSession = require("./world-session.js"); // Fase 18 (D-1): sesión de mundos
// Fase 18 (D-1): el bucle principal, la trampa del templo y el arranque
// (mainLoop/tickTempleTraps/getServerMetrics/start) viven en timers.js; se
// re-exportan aquí como fachada (server.js llama a net.start(); los tests
// usan net.mainLoop/net.getServerMetrics/net.tickTempleTraps). Los hooks de
// broadcast/worldTime/broadcastMining se inyectan al final del cargue
// (después de definir esas funciones) para romper el ciclo net↔timers.
const timers = require("./timers.js");
// Fase 18 (D-1): handlers de juego del switch extraídos a actions.js (hoja:
// requiere state/world/crafting/... y recibe los broadcast inyectados).
const actions = require("./actions.js");

// Reloj del mundo ajustable (/time set): el día/noche, el ambiente y la IA
// de mobs siguen al mismo reloj (worldTime), así que el comando afecta a todo.
const worldTime = () => commands.worldTime(state);

// Fase 16 (C2, SV-3/SEC-3): valida que x/y/z sean números finitos ANTES de
// usarlos en handlers (extraído a anticheat.js en la Fase 18, D-1; se reexporta
// aquí porque los handlers del switch lo usan por todo el archivo).
const { validCoords } = anticheat;

// Distancia máxima (bloques) a la que se ven las grietas de rotura de otro
// jugador: la misma que el alcance de interacción (7), como en Minecraft el
// progreso de rotura es visible para cualquiera que pueda minar ese bloque.
const CRACK_VIEW_DISTANCE = 7;

// Fase 14 (M5/C5): radio (chunks, Chebyshev) del área que se genera y
// serializa en el `init` de una conexión. Antes se generaban los ~169 chunks
// del radio de render completo y se serializaban en un único mensaje (~2.7 MB)
// por conexión. Ahora solo se preparan los chunks inmediatos al spawn y el
// resto del radio se rellena progresivamente en mainLoop (chunks_add por
// lotes), sin bloquear la conexión ni las demás tareas del bucle.
const INIT_CHUNK_RADIUS = 2;
// Tamaño del lote de relleno (chunks por tick y jugador): con TICK_MS=50
// (20 Hz) son ~6×20=120 chunks/s, el radio completo (169) se completa en ~1.5 s.
const CHUNK_FILL_PER_TICK = 6;

// C6-REN-3 (auditoría 2026-08-11): envía una lista de claves de chunk en
// LOTES de CHUNK_FILL_PER_TICK repartidos con setImmediate, en vez de un único
// `chunks_add` gigante (hasta ~441 chunks = ~7,2M de números al ampliar
// renderDistance a 10) que congelaba el event loop del servidor y la
// reconstrucción del cliente (Uint8Array.from + escaneo de antorchas por chunk).
// Cada mensaje es pequeño, el socket se procesa entre lotes y, si se cierra a
// mitad, el envío se aborta sin lanzar.
function sendChunksFragmented(ws, keys) {
	if (ws.readyState !== WebSocket.OPEN || !keys.length) return;
	const DATA = {};
	for (const key of keys.slice(0, CHUNK_FILL_PER_TICK))
		if (state.chunks.has(key)) DATA[key] = Array.from(state.chunks.get(key));
	if (Object.keys(DATA).length) {
		try {
			ws.send(
				JSON.stringify({ event: "chunks_add", data: { chunkData: DATA } })
			);
		} catch {
			return; // socket cerrado a mitad del envío en lote
		}
	}
	const rest = keys.slice(CHUNK_FILL_PER_TICK);
	if (rest.length) setImmediate(() => sendChunksFragmented(ws, rest));
}

function broadcast(event, data, exceptId = null) {
	const msg = JSON.stringify({ event, data });
	for (const p of state.players.values()) {
		if (p.id === exceptId) continue;
		if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
	}
}

// Broadcast a los jugadores que están a `maxDist` bloques de un punto del
// mundo (los demás no deberían ver ese bloque de cerca). Se usa para la
// animación de rotura sincronizada: el progreso de la mina llega a todos los
// que pueden ver el bloque, no solo al minero.
function broadcastNear(x, y, z, event, data, maxDist = CRACK_VIEW_DISTANCE) {
	const msg = JSON.stringify({ event, data });
	for (const p of state.players.values()) {
		if (p.ws.readyState !== WebSocket.OPEN) continue;
		if (Math.hypot(x - p.x, y - p.y, z - p.z) > maxDist) continue;
		p.ws.send(msg);
	}
}

// sendFn de minería (mining.js lo llama como (player, event, data)): en vez
// de enviar solo al minero, hace broadcast de las grietas a todos los que
// vean el bloque (el parámetro player se ignora: el propio minero también
// queda dentro del radio). tool_broke es específico del minero (slot de su
// inventario): se envía SOLO a él. Fix de regresión (Fase 7, animación de
// rotura): antes este sendFn descartaba todo lo que no fuera
// block_break_progress y el jugador nunca recibía tool_broke (ni el
// feedback de rotura en el cliente ni el e2e-durabilidad).
function broadcastMining(player, event, data) {
	if (event === "block_break_progress") {
		if (
			typeof data?.x !== "number" ||
			typeof data?.y !== "number" ||
			typeof data?.z !== "number"
		)
			return;
		broadcastNear(data.x, data.y, data.z, event, data);
		return;
	}
	if (event === "tool_broke" && player?.ws?.readyState === 1) {
		player.ws.send(JSON.stringify({ event, data }));
	}
}

// Estado inicial completo para un jugador (init). Se reenvía tras un cambio
// de semilla (set_seed) para que el cliente reciba el mundo del seed elegido.
// data.seed permite al cliente confirmar que ya tiene el mundo pedido.
function sendInit(p) {
	const chunkData = {};
	// Fase 7 (auditoría): solo los chunks dentro del radio de render del
	// jugador (Chebyshev en chunks, como el filtro del cliente en world.js).
	// Antes se enviaba TODO el mundo en cada conexión: con 795 chunks son
	// ~13 MB de JSON por jugador, y crece con el mundo y con los jugadores.
	// Los chunks que faltan llegan con chunks_add al moverse (move handler).
	const pcx = Math.floor(p.x / constants.CHUNK_SIZE),
		pcz = Math.floor(p.z / constants.CHUNK_SIZE);
	for (const [key, data] of state.chunks) {
		const [cx, cz] = key.split(",").map(Number);
		if (
			Math.abs(cx - pcx) <= p.renderDistance &&
			Math.abs(cz - pcz) <= p.renderDistance
		)
			chunkData[key] = Array.from(data);
	}
	p.ws.send(
		JSON.stringify({
			event: "init",
			data: {
				playerId: p.id,
				name: p.name,
				chunkData,
				spawnX: p.x,
				spawnY: p.y,
				spawnZ: p.z,
				dayTime: worldTime(), // reloj del servidor: el cliente extrapola el ciclo visual
				// Fase 8 (B8): reloj de la luna (ciclo de 8 días) con el offset de
				// semilla ya aplicado — el cliente lo extrapola igual que el día.
				moonTime: commands.moonTime(state),
				mobs: state.mobs.filter((m) => m.alive).map(mobs.mobSnapshot),
				// Fase 9 (Bloque D): flechas vivas del esqueleto (para que el cliente
				// las dibuje desde el primer frame, no solo tras el primer broadcast).
				// Fase 21.5 (A1): también los bobbers de pesca (kind "bobber").
				arrows: [
					...state.arrows.map(mobs.arrowSnapshot),
					...state.bobbers.map(fishing.bobberSnapshot)
				],
				inventory: p.inventory,
				armor: p.armor, // Fase 7: 4 slots (casco, pechera, pantalones, botas)
				health: p.health,
				maxHealth: p.maxHealth,
				xp: p.xp,
				level: p.level, // Fase 5
				// Fase 9 (Bloque C): progreso DENTRO del nivel (curva MC no
				// lineal) para la barra de XP del HUD — el cliente la pinta con
				// xpInto/xpToNext en vez de la curva lineal antigua.
				xpInto: xpIntoLevel(p.xp, p.level || 0),
				xpToNext: xpToNext(p.level || 0),
				food: p.food,
				saturation: p.saturation,
				// Fase 10 (A2): quemadura residual de lava — el cliente pinta la
				// llamarada si el jugador reconecta ardiendo.
				burning: (p.fireUntil || 0) > Date.now(),
				seed: constants.worldPaths.currentSeed, // Fase 6: semilla activa del mundo
				// Fase 9 (Bloque B): modo de juego del MUNDO (fijo por mundo). El
				// cliente lo usa para el HUD, el inventario creativo y el vuelo.
				gamemode: p.gamemode,
				// Fase 10 (B1): tamaño del mundo (bloques por lado) para el menú.
				worldSize: constants.worldPaths.worldSize,
				// Fase 10 (D4): catálogo completo del picker creativo (bloques,
				// ítems, herramientas y armadura) — el cliente lo dibuja al pulsar E
				// en un mundo creative y valida que lo pedido esté en el catálogo.
				creativeCatalog: [
					...constants.CREATIVE_ITEMS,
					...constants.ALL_TOOLS_AND_ARMOR
				].filter((id, i, a) => a.indexOf(id) === i), // sin duplicados
				otherPlayers: Array.from(state.players.values())
					.filter((q) => q.id !== p.id)
					.map((q) => ({
						id: q.id,
						name: q.name,
						x: q.x,
						y: q.y,
						z: q.z,
						skin: q.skin || "steve" // Fase 17: skin del jugador remoto
					}))
			}
		})
	);
}

// Fase 17 (A5): al cargar un mundo (join_world / set_seed con mundo nuevo) el
// jugador entra en él de cero: spawn, salud, comida, XP, inventario
// (creativo completo o survival vacío → restaurado en B1) y limpieza del
// estado de sesión (caída, vuelo, cofres/hornos abiertos). El inventario no
// viaja entre mundos; la restauración de B1 aplica al MUNDO activo.
function enterWorld(player) {
	const spawn = world.findSpawn(0, 0);
	player.x = spawn.x;
	player.y = spawn.y;
	player.z = spawn.z;
	player.health = 20;
	player.maxHealth = 20;
	player.xp = 0;
	player.level = 0;
	player.food = 20;
	player.saturation = 20;
	// Fase 9 (Bloque B/C): el modo del mundo nuevo aplica al jugador. En
	// creative el inventario se resetea y se entrega el creativo completo (no
	// se persiste); en survival, vacío (restaurado por B1 si ya jugó antes).
	player.gamemode = constants.worldPaths.worldGamemode;
	player.flying = false;
	player.inventory = new Array(36).fill(null).map((_, i) =>
		player.gamemode === "creative"
			? {
					id: constants.CREATIVE_ITEMS[i % constants.CREATIVE_ITEMS.length],
					count: 64
				}
			: null
	);
	player.craftingGrid = new Array(9).fill(null);
	player.openFurnace = null;
	player.openChest = null;
	player.fallFromY = null; // la caída no viaja entre mundos
	player.lastGroundY = null;
	player.fallVy = 0;
	player.vyObs = 0;
	player.airTimeMs = 0;
	player.speedSamples = []; // Fase 16 (C3): sin muestras de la posición previa
	// Fase 17 (B1): en survival, restaurar el inventario/posición guardados
	// del jugador en ESTE mundo (el inventario de cero es solo la primera vez).
	if (player.gamemode !== "creative") save.restorePlayer(player);
	// Fase 14 (M5/C5): generar solo el radio INMEDIATO al spawn (igual que el
	// arranque clásico); el resto se rellena progresivamente en mainLoop
	// (chunks_add por lotes). ensureChunksAround es idempotente.
	world.ensureChunksAround(player.x, player.z, INIT_CHUNK_RADIUS);
}

const app = express();
// SEC-4 (auditoría 2026-08-11, F16-05): cabecera de seguridad mínima en el
// estático — `X-Content-Type-Options: nosniff` evita que el navegador
// interprete un `.js`/`.css` servido con el tipo equivocado. Desde la Fase
// 19.6 Three.js se sirve LOCAL (public/vendor/) — el riesgo del CDN externo
// (unpkg sin SRI) desapareció; el CSP queda diferido (el importmap inline
// exige `script-src 'unsafe-inline'` y el juego es localhost/LAN sin
// autenticación). Decisiones en docs/spec/fase18-spec.md §8.
app.use(
	express.static(path.join(__dirname, "..", "public"), {
		setHeaders(res) {
			res.setHeader("X-Content-Type-Options", "nosniff");
		}
	})
);

// ============================================================
// NOMBRE DE JUGADOR (Fase 7)
// El servidor es la fuente de verdad del nombre: se recibe con `?name=` en
// la URL del WebSocket (el cliente lo lee de localStorage antes de conectar)
// o con el evento `set_name`. Se sanea: sin caracteres de control, recortado
// y con máximo de 16 caracteres. Nombre por defecto: "Jugador-XXXX".
// ============================================================
function sanitizeName(raw) {
	if (typeof raw !== "string") return null;
	const name = raw
		// biome-ignore lint/suspicious/noControlCharactersInRegex: saneo intencional de caracteres de control (0x00-0x1f y DEL) del nombre
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.trim()
		.slice(0, 16);
	return name || null;
}

function nameFromRequest(req) {
	try {
		const u = new URL(req.url, "http://localhost");
		return sanitizeName(u.searchParams.get("name"));
	} catch {
		return null;
	}
}

// Skin del jugador (Fase 17): llega en la URL del WebSocket (?skin=), como el
// nombre. Se valida contra la lista oficial (PLAYER_SKINS); cualquier otra
// cosa (o ausencia) devuelve null y el cliente queda con el default "steve".
// Es preferencia del CLIENTE (persistida en localStorage): no se persiste en
// los mundos ni en el jugador guardado.
function skinFromRequest(req) {
	try {
		const u = new URL(req.url, "http://localhost");
		const s = u.searchParams.get("skin");
		return constants.PLAYER_SKINS.includes(s) ? s : null;
	} catch {
		return null;
	}
}

function handleConnection(ws, req) {
	// Auditoría 2026-08-09 (§3.1): el rate-limit de mensajes solo aplica a
	// conexiones reales (las que llegan con request HTTP de upgrade). Los
	// sockets fake de los tests unitarios llaman a handleConnection sin req y
	// reutilizan un mismo objeto para decenas de mensajes en milisegundos (no
	// son un flood real); exigir req evita que las pruebas disparen el límite.
	const realSocket = !!req;
	// Auditoría 2026-08-09 (§3.1): tope de conexiones simultáneas. Cada
	// conexión dispara ensureChunksAround + sendInit (~25 chunks) y entra en
	// todos los broadcasts; sin tope, un atacante abriendo cientos de sockets
	// agota memoria/CPU.
	if (realSocket && state.players.size >= MAX_CONNECTIONS) {
		try {
			ws.close(1013, "server lleno"); // 1013 = try again later
		} catch {
			/* ya cerrado */
		}
		return;
	}
	const playerId = uuidv4();
	// Fase 17 (B2): heartbeat — el cliente (navegador) responde al pong
	// automáticamente; si no llega, el intervalo del heartbeat lo termina.
	ws.isAlive = true;
	ws.on("pong", () => {
		ws.isAlive = true;
	});
	// Fase 17 (A1): MODO MENÚ. Sin mundo activo (currentSeed null — el
	// servidor arrancó sin SEED o liberó el mundo), el jugador entra al MENÚ
	// (menu_state) y no al mundo: sin spawn, sin chunks y sin init.
	// `join_world` carga el mundo elegido (switchWorld + init). Con mundo ya
	// activo el flujo es el clásico: spawn + init.
	const menuMode = !constants.worldPaths.currentSeed;
	let spawn;
	if (menuMode) {
		spawn = { x: 0, y: 0, z: 0 };
	} else {
		// Spawn sobre tierra firme: si (0,0) es un lago, findSpawn busca la
		// columna firme más cercana para que el jugador no aparezca nadando
		// (Fase 4).
		spawn = world.findSpawn(0, 0);
		// Fase 14 (M5/C5): generar solo el radio INMEDIATO al spawn en lugar
		// del radio de render completo. El resto se rellena progresivamente en
		// mainLoop (chunks_add por lotes); ensureChunksAround es idempotente.
		world.ensureChunksAround(spawn.x, spawn.z, INIT_CHUNK_RADIUS);
	}
	const spawnX = spawn.x,
		spawnY = spawn.y,
		spawnZ = spawn.z;
	// Fase 7 (auditoría): operador — cualquiera en la lista OPS (env var
	// OPS="Nombre1,Nombre2"). Permiso para /tp /give /time /gamemode /reload
	// /op (ver commands.js).
	// Auditoría 2026-08-15 (M4): el "PRIMER jugador conectado es OP" es una
	// carrera de privilegios — el primer extraño en conectar tras un reinicio
	// quedaba con poderes. Solo se mantiene ese fallback (host) cuando el
	// admin NO configuró OPS explícito (LAN/E2E sin lista); con OPS definida,
	// nada de "primero conectado": solo la lista manda.
	const playerName = nameFromRequest(req) || `Jugador-${playerId.slice(0, 4)}`;
	// Auditoría 2026-08-15 (M3): SUPLANTACIÓN por nombre. Un segundo socket con
	// el MISMO nombre entraba en línea y restorePlayer le devolvía el inventario
	// guardado del nombre (dos jugadores sobre el mismo archivo). Se rechaza la
	// conexión nueva si el nombre ya está en línea (insensible a mayúsculas).
	// En modo menú aún no hay identidad mundial compartida (cada jugador elige
	// mundo en join_world): el duplicado se permite ahí (no restaura inventario
	// hasta ese momento) y se comprueba de verdad al enlazar el nombre.
	for (const q of state.players.values()) {
		if (q.name && q.name.toLowerCase() === playerName.toLowerCase()) {
			try {
				ws.close(4001, "nombre en uso"); // 4001 = policy (definido por app)
			} catch {
				/* fake de test sin close: basta con no registrar */
			}
			return;
		}
	}
	// Fase 17: skin del jugador (preferencia del cliente; la valida la lista
	// oficial — ver skinFromRequest).
	const playerSkin = skinFromRequest(req) || "steve";
	const hostIsOp = constants.OPS.size === 0 && state.players.size === 0;
	const player = playerHelpers.createPlayer({
		id: playerId,
		ws,
		name: playerName, // Fase 7: nombre visible
		skin: playerSkin, // Fase 17: skin (Steve por defecto)
		isOp: hostIsOp || constants.OPS.has(playerName.toLowerCase()),
		x: spawnX,
		y: spawnY,
		z: spawnZ,
		yaw: 0,
		pitch: 0,
		health: 20,
		maxHealth: 20,
		// B2 (Fase 8): gracia inicial al entrar (30s sin daño de mobs; la zona
		// segura del spawn en mobs.js es la otra mitad del fix).
		spawnGraceUntil: Date.now() + SPAWN_GRACE_MS,
		xp: 0,
		level: 0, // Fase 5: experiencia simple / niveles
		// Fase 9 (Bloque B): modo de juego FIJO por mundo — el jugador entra con
		// el modo del mundo activo (survival/creative). /gamemode solo lo cambia
		// en runtime (sin persistir): al reconectar vuelve el modo del mundo.
		gamemode: constants.worldPaths.worldGamemode,
		// Fase 9 (Bloque C): vuelo creativo (doble espacio). Solo se usa en
		// creative; el servidor lo conoce para no penalizar el ascenso sostenido.
		flying: false,
		food: 20,
		saturation: 20,
		foodAccum: 0,
		regenAccum: 0,
		starveAccum: 0,
		lastMoveTime: 0,
		renderDistance: VIEW_DISTANCE_CHUNKS, // Fase 7: ajustable por el cliente (settings)
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		craftingGrid: new Array(9).fill(null),
		openFurnace: null,
		openChest: null, // Fase 6: cofre abierto ("x,y,z"), para mover items entre él y el inventario
		mining: null, // Fase 6: sesión de minería activa (progreso en el bucle principal)
		// Fase 7: armadura equipada (4 slots; cada pieza con su durabilidad) y
		// punto de reaparición fijado al dormir en una cama (no se persisten: el
		// estado del jugador se reinicia al reconectar, como el inventario).
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		respawnPoint: null,
		// Fase 7: caída en curso (pico alcanzado y último suelo firme) para el
		// daño por caída (applyFallDamage en players.js).
		fallFromY: null,
		lastGroundY: null,
		// Fase 8 (mejora anti-cheat): velocidad vertical observada en el último
		// move (dy/dt con dt mínimo de 50ms), tiempo acumulado en el aire y
		// velocidad de descenso más rápida de la caída en curso (fallVy). El
		// anti-cheat de vuelo valida el ascenso contra la parábola del salto y
		// el daño de caída por velocidad usa fallVy.
		vyObs: 0, // diagnóstico (última velocidad vertical observada, no se consume)
		airTimeMs: 0,
		fallVy: 0,
		// Fase 16 (C3, SEC-1): ventana deslizante de velocidad horizontal — pares
		// {t, dist} de los movimientos ACEPTADOS (distancia horizontal desde la
		// posición anterior). El límite por-move (1.2 bloques) no cazaba ráfagas
		// sostenidas de ~0.8 bloques a 20/s; esta ventana mide bloques/s reales.
		speedSamples: []
	});
	state.players.set(playerId, player);
	// Fase 17 (A1): el jugador del menú aún no está en ningún mundo (no recibe
	// init ni entra en los bucles de juego hasta join_world).
	if (menuMode) player.inMenu = true;
	// Fase 14 (M2, fix de revisión): al entrar un jugador NUEVO, el snapshot de
	// mobs debe llegarle aunque nada haya cambiado desde el último mobs_update
	// (el broadcast es condicional). Resetear el último JSON fuerza el envío en
	// el próximo tick a todos, incluido el recién llegado (el init no incluye
	// los mobs; el cliente los recibe por mobs_update). La variable vive en
	// timers.js (mainLoop); aquí se resetea vía la fachada (Fase 18, D-1).
	timers.resetMobsDirty();
	// Fase 12 (Bloque D): al conectar, las mascotas persistidas reconocen a su
	// dueño por NOMBRE (los IDs de jugador son por sesión; el ownerId guardado
	// es de una sesión anterior y ya no vale). Si el ownerName del mob coincide
	// con este jugador, se re-vincula el ownerId de la sesión actual para que
	// lo siga y ataque con él. Guarda anti-homónimos: si la mascota ya tiene un
	// ownerId de un jugador CONECTADO (mismo nombre en dos sesiones a la vez),
	// no se la arrebata al primero.
	// Fase 12 (Bloque D): el nombre es la identidad persistida de la mascota
	// (ownerId es solo de sesión). Al conectar se re-vinculan las mascotas cuyo
	// ownerName coincide con el jugador, SIEMPRE QUE su ownerId actual no
	// pertenezca a un jugador conectado (dos jugadores conectados con el mismo
	// nombre: el segundo no le arrebata la mascota al primero). Decisión de
	// diseño documentada: si el dueño legítimo está desconectado y conecta un
	// homónimo, este se queda con la mascota (no hay unicidad de nombres en el
	// wire; es la misma regla que un mundo compartido sin autenticación). En
	// modo menú no hay mobs (no se ha cargado ningún mundo).
	if (!menuMode) {
		for (const m of state.mobs) {
			if (
				m.alive &&
				m.ownerName &&
				m.ownerName === player.name &&
				!state.players.has(m.ownerId)
			) {
				m.ownerId = playerId;
			}
		}
		// Fase 9 (Bloque C): en un mundo CREATIVO el inventario no se persiste —
		// se resetea al entrar y se entrega el inventario creativo completo
		// (decisión del usuario). El survival restaura el inventario guardado.
		if (player.gamemode === "creative") {
			player.inventory = new Array(36).fill(null).map((_, i) => ({
				id: constants.CREATIVE_ITEMS[i % constants.CREATIVE_ITEMS.length],
				count: 64
			}));
		}
		// Fase 17 (B1): restaurar el estado persistido del jugador (survival)
		// por nombre — inventario, salud/comida, XP y posición.
		if (player.gamemode !== "creative") save.restorePlayer(player);
	}
	log.info(
		`🟢 Jugador conectado: ${player.name} (${state.players.size} en línea)`
	);

	if (menuMode) {
		// Fase 17 (A1/A5): estado del menú — la lista de mundos guardados para
		// que el cliente pinte la pantalla de mundos (reproducir/crear/...).
		ws.send(
			JSON.stringify({
				event: "menu_state",
				data: { worlds: save.listWorlds() }
			})
		);
	} else {
		sendInit(player);
		broadcast(
			"player_join",
			{
				id: playerId,
				name: player.name,
				x: spawnX,
				y: spawnY,
				z: spawnZ,
				skin: player.skin || "steve" // Fase 17
			},
			playerId
		);
	}

	// Rate-limits por conexión (F20 v20.2): un contador para el tope global
	// de mensajes y otro para el tope de acciones. Estado propio en el cierre
	// del handler (el socket se comparte con los tests fake, que no deben
	// arrastrar ventanas entre conexiones).
	const msgRate = createRateLimit(MAX_MSG_RATE);
	const actionRate = createRateLimit(MAX_ACTION_RATE);
	ws.on("message", (raw) => {
		// Auditoría 2026-08-15 (Notas del usuario): tope de tamaño del JSON
		// por mensaje (MAX_MSG_BYTES, 64 KiB). `maxPayload` del WS limita el
		// FRAME entero (1 MiB), pero un cliente hostil podía enviar frames
		// pequeños con un JSON gigante y saturar el parse sin tocar el
		// rate-limit por-ventana. Los mensajes legítimos son de ~100 B-2 KiB;
		// el descarte es silencioso para el emisor (misma política que la
		// guardia de forma) y no muta estado ni inventario.
		if (raw.length > MAX_MSG_BYTES) {
			log.warn(
				`[net] mensaje de ${raw.length} B descartado (tope ${MAX_MSG_BYTES})`
			);
			return;
		}
		let msg;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		// Auditoría 2026-08-09 (§1.1): guardia de forma. Un evento sin `data`
		// (o con `data: null`) reventaba el destructuring del handler con un
		// TypeError que, al no haber uncaughtException, tiraba el servidor
		// entero (DoS sin autenticar). También lensa contra mensajes como
		// `{"event":null}` o arrays.
		if (
			!msg ||
			typeof msg !== "object" ||
			typeof msg.event !== "string" ||
			typeof msg.data !== "object" ||
			!msg.data ||
			Array.isArray(msg.data)
		)
			return;
		const { event, data } = msg;
		const p = state.players.get(playerId);
		if (!p) return;

		// Auditoría 2026-08-09 (§3.1): rate-limit por conexión (solo sockets
		// reales — los fakes de los tests reutilizan el mismo objeto con decenas
		// de mensajes en milisegundos y no son un flood). El juego normal emite
		// ~20 mensajes/s (moves) con picos al chatear/minear; más de 30/s
		// sostenidos es flood (bots o cliente roto) y se corta la conexión.
		// F20 v20.2 (bug de Notas del usuario): el cierre exige superar el
		// límite en ventanas CONSECUTIVAS — una ráfaga legítima tras un
		// bloqueo síncrono del event loop (carga de mundo en join_world) ya no
		// se confunde con un flood (ver server/ratelimit.js).
		if (realSocket) {
			if (msgRate.hit()) {
				try {
					ws.rateLimited = true;
					ws.close(1008, "demasiados mensajes"); // 1008 = policy violation
				} catch {
					/* ya cerrado */
				}
				return;
			}
			// Auditoría 2026-08-15 (B2): rate-limit POR ACCIÓN. El tope global
			// de MAX_MSG_RATE lo agota casi solo `move` (~20/s de juego normal),
			// así que antes un cliente hostil podía disparar hasta 30
			// block_action/chest_action/interact/chat por segundo sin tocar el
			// límite. Este contador SEPARADO pesa solo los eventos de mutación
			// del mundo/inventario/chat: más de MAX_ACTION_RATE por segundo
			// sostenido es flood de acciones y se corta. `move` y `tick` no
			// cuentan (el rate global ya los cubre). Mismo criterio de ventanas
			// consecutivas que el global.
			if (
				event !== "move" &&
				event !== "tick" &&
				event !== "textures_reload" // del lado del SERVIDOR (reload)
			) {
				if (actionRate.hit()) {
					try {
						ws.rateLimited = true;
						ws.close(1008, "demasiadas acciones"); // 1008 = policy violation
					} catch {
						/* ya cerrado */
					}
					return;
				}
			}
		}

	// Fase 21.5 (B3): ¿el andamio colocado en (x,y,z) queda bajo los pies del
	// jugador (la celda que ocupa)? Si es la misma celda donde se colocó, al
	// colocarlo "desde dentro" el jugador se sube encima (escalar el andamio).
	function placeLifts(p, x, y, z) {
		return (
			Math.floor(p.x) === x &&
			Math.floor(p.y) === y &&
			Math.floor(p.z) === z
		);
	}

		try {
			switch (event) {
				case "move": {
					// Fase 18 (D-1): toda la validación del move (coords, void, bordes,
					// sólidos, parábola del salto/hover y ventana de velocidad) vive en
					// server/anticheat.js. Devuelve null si el move se rechazó (el
					// teleport de corrección ya se envió) o los valores aceptados.
					const res = anticheat.handleMove(p, ws, data, {
						world,
						constants,
						isSolidBlock,
						respawnPlayer: (pl, cause) => playerHelpers.respawnPlayer(pl, cause)
					});
					if (!res) break; // move rechazado (teleport enviado por anticheat)
					const { x, y, z, cx, cz, yaw, pitch, vyObs, nowMs } = res;
					// Fase 10 (B1): se asignan las coordenadas YA sujetas a los bordes
					// (cx/cz calculados antes del anti-cheat).
					// Fase 16 (C3): registrar la muestra horizontal del move aceptado
					// (distancia desde la última posición aceptada) para la ventana de
					// velocidad. Se empuja ANTES de sobrescribir p.x/p.z.
					p.speedSamples.push({
						t: nowMs,
						dist: Math.hypot(cx - p.x, cz - p.z)
					});
					if (p.speedSamples.length > 100) p.speedSamples.shift();
					p.x = cx;
					p.y = y;
					p.z = cz;
					p.yaw = yaw || 0;
					p.pitch = pitch || 0;
					p.lastMoveTime = nowMs;
					// Fase 7: daño por caída — el servidor infiere el suelo desde el
					// mundo y aplica el daño al aterrizar (el agua lo anula; en creative
					// lo descarta damagePlayer). Fase 8: además usa la velocidad vertical
					// observada (vyObs) para detectar descensos acelerados que la
					// trayectoria posicional no reflejaría (un cliente que baja "sin
					// daño" reportando alturas falsas).
					playerHelpers.applyFallDamage(p, vyObs);
					// P1 (auditoría 2026-08-15): ya no se genera la frontera de forma
					// síncrona aquí (world.ensureChunksAround(cx,cz,2) generaba hasta
					// ~25 chunks por salto de chunk y congelaba el event loop de todos
					// los jugadores). La generación progresiva de chunk-fill.js
					// (fillForPlayers, un lote CHUNK_FILL_PER_TICK por tick, anillos
					// Chebyshev desde el jugador) cubre todo el radio de render,
					// frontera incluida, sin picos bloqueantes.
					broadcast(
						"player_move",
						{ id: playerId, name: p.name, x, y, z, yaw: p.yaw, pitch: p.pitch },
						playerId
					);
					break;
				}

				case "set_name": {
					// Fase 7: cambiar el nombre visible (desde el menú/ajustes). Se sanea y
					// se propaga a todos los clientes con player_rename (tags flotantes).
					// Auditoría 2026-08-15 (M3): renombrar a un nombre YA en línea se
					// rechaza (un homónimo activo permitiría suplantarlo en el chat y a
					// las mascotas); renombrarse a SÍ mismo está permitido.
					const name = sanitizeName(data?.name);
					if (!name) break;
					let taken = false;
					for (const q of state.players.values()) {
						if (
							q.id !== playerId &&
							q.name.toLowerCase() === name.toLowerCase()
						) {
							taken = true;
							break;
						}
					}
					if (taken) break;
					p.name = name;
					broadcast("player_rename", { id: playerId, name });
					break;
				}

				case "set_skin": {
					// Fase 17: cambio de skin (selector del menú). Preferencia del
					// cliente; el servidor solo la valida contra la lista oficial y
					// la propaga a los demás en vivo (player_skin → el cliente
					// reconstruye el humanoide remoto con el atlas nuevo).
					const skin = typeof data?.skin === "string" ? data.skin : "";
					if (!constants.PLAYER_SKINS.includes(skin)) break;
					if (p.skin === skin) break;
					p.skin = skin;
					broadcast("player_skin", { id: playerId, skin });
					break;
				}

				case "settings": {
					// Fase 7: ajustes que afectan al servidor. Por ahora solo la distancia
					// de render (2..10 chunks). P1 (auditoría 2026-08-15): al cambiarla NO
					// se generan los chunks nuevos de golpe (world.ensureChunksAround con
					// r=10 eran hasta 441 chunks síncronos que congelaban el event loop);
					// los que falten los genera progresivamente fillForPlayers (chunk-fill).
					// Aquí solo se REENVÍA lo YA cacheado en estado. P3 (misma auditoría):
					// al AMPLIAR solo se reenvía la CORONA (anillo prevRd+1..clamped: los
					// chunks que el cliente descartó al reducir); al reducir se mantiene el
					// reenvío fragmentado del radio completo (C6-REN-3).
					const rd = data?.renderDistance;
					if (typeof rd === "number" && Number.isFinite(rd)) {
						const clamped = Math.min(10, Math.max(2, Math.round(rd)));
						if (clamped !== p.renderDistance) {
							const prevRd = p.renderDistance;
							p.renderDistance = clamped;
							const pcx = Math.floor(p.x / constants.CHUNK_SIZE),
								pcz = Math.floor(p.z / constants.CHUNK_SIZE);
							// Ampliar → solo la corona (distancia Chebyshev > prevRd);
							// reducir/igual → todo el radio nuevo fragmentado.
							const lo = clamped > prevRd ? prevRd + 1 : 0;
							const keys = [];
							for (let x = pcx - clamped; x <= pcx + clamped; x++) {
								for (let z = pcz - clamped; z <= pcz + clamped; z++) {
									if (Math.max(Math.abs(x - pcx), Math.abs(z - pcz)) < lo)
										continue;
									const key = `${x},${z}`;
									if (state.chunks.has(key)) keys.push(key);
								}
							}
							sendChunksFragmented(p.ws, keys);
						}
					}
					break;
				}

				// Auditoría 2026-08-15 (CL-6): telemetría de errores del cliente para
				// monitorización (mirror de window.__mcClientErrors). Solo se LOGUEA;
				// nunca se cierra el socket ni se responde (el cliente no espera nada).
				case "client_errors": {
					const errs = Array.isArray(data?.errors)
						? data.errors.slice(0, 5)
						: [];
					for (const e of errs) {
						if (e && typeof e.text === "string" && e.text.length <= 500)
							log.warn(`[cliente:${playerId}] ${e.text.slice(0, 500)}`);
					}
					break;
				}

				case "block_action": {
					const { action, x, y, z, itemId } = data;
					// C2 (SV-3/SEC-3): solo las acciones CON coordenadas las validan;
					// `break_cancel` no lleva x/y/z y no debe quedar bloqueado por el
					// guard (regresión: el cooldown del guard rompía la cancelación).
					if (action === "break" || action === "place" || action === "ignite") {
						if (!validCoords(x, y, z)) return;
						if (Math.hypot(x - p.x, y - p.y, z - p.z) > 7) return;
					}
					// Fase 10 (D2): clic derecho sobre un TNT enciende la mecha.
					if (action === "ignite") {
						tnt.ignite(x, y, z);
						break;
					}
					if (action === "break") {
						const block = world.getBlock(x, y, z);
						// Fase 9 (Bloque C): en creative se pueden romper también el agua y
						// la lava (colocadas desde el inventario creativo); en survival siguen
						// siendo irrompibles sin cubo.
						if (NOT_MINEABLE.has(block) && p.gamemode !== "creative") return;
						// Creative (/gamemode creative): minería INSTANTÁNEA como en
						// Minecraft — el bloque se rompe al momento, sin sesión de
						// progreso ni grietas, y sin desgaste de herramienta ni drops
						// (finishMining con opts.creative). Se cancela cualquier sesión
						// previa para que el cliente oculte sus grietas.
						if (p.gamemode === "creative") {
							mining.cancelMining(p, broadcastMining);
							playerHelpers.finishMining(p, x, y, z, block, { creative: true });
							return;
						}
						// Fase 6 (minería fina): iniciar/continuar la sesión de rotura. El
						// bloque NO se rompe al instante: el progreso avanza en el bucle
						// principal (dureza del bloque / velocidad de la herramienta) y al
						// completarse se rompe con drop condicional. Repetir break sobre el
						// mismo bloque continúa la mina (no reinicia el progreso).
						if (
							p.mining &&
							p.mining.x === x &&
							p.mining.y === y &&
							p.mining.z === z
						)
							return;
						mining.startMining(p, x, y, z, block);
					} else if (action === "break_cancel") {
						mining.cancelMining(p, broadcastMining);
					} else if (action === "place") {
						if (world.getBlock(x, y, z) !== B.AIR) return;
						const slot = p.inventory[p.selectedSlot];
						if (!slot || slot.id !== itemId || slot.count < 1) return;
						// Fase 9 (Bloque C): el agua y la lava solo se colocan en creative
						// (en survival no hay cubo; el /give las rechaza igualmente).
						if (
							(itemId === B.WATER || itemId === B.LAVA) &&
							p.gamemode !== "creative"
						)
							return;
						// Antorchas: necesitan un bloque sólido adyacente (soporte), como en
						// Minecraft — no se pueden colocar flotando en el aire. El agua y
						// otra antorcha no dan soporte (isSolidBlock las excluye).
						// Fase 21.5 (B2): la linterna usa el mismo soporte (cuelga del techo
						// o se apoya en el suelo/una pared; sin cadena).
						if (
							(itemId === B.TORCH || itemId === B.LANTERN) &&
							!world.torchSupported(x, y, z)
						)
							return;
						// Fase 13 (L2): puertas y portones ocupan 2 celdas de alto — se
						// colocan solo si hay hueco arriba (y + 1 libre) y necesitan un
						// bloque de apoyo debajo (no flotar).
						if (constants.isDoor(itemId)) {
							if (world.getBlock(x, y + 1, z) !== B.AIR) return;
							if (!isSolidBlock(world.getBlock(x, y - 1, z))) return;
							// F16-04 (auditoría 2026-08-11): solo se consume el ítem si la
							// colocación REALMENTE se hizo — setBlock devuelve false fuera de
							// rango (y+1 > +63 en el tope del mundo) y antes el ítem se
							// restaba igual (un cliente en el límite perdía el bloque sin
							// colocarlo). Si solo cabe la mitad inferior, se deshace.
							const bottom = world.setBlock(x, y, z, itemId);
							const top = world.setBlock(x, y + 1, z, itemId);
							if (bottom && top) {
								playerHelpers.removeFromInventory(p, itemId, 1);
								playerHelpers.sendInventory(p);
							} else if (bottom) {
								world.setBlock(x, y, z, B.AIR);
							}
							break;
						}
						// F16-04 (auditoría 2026-08-11): solo se consume el ítem si
						// world.setBlock devolvió true (false = wy fuera de −64..63 o
						// wx/wz fuera de los bordes). Antes el ítem se restaba igual: un
						// cliente en el límite del mundo perdía el bloque sin colocarlo.
						if (world.setBlock(x, y, z, itemId)) {
							playerHelpers.removeFromInventory(p, itemId, 1);
							playerHelpers.sendInventory(p);
							// Fase 21.5 (B3): al colocar un andamio donde está el
							// jugador (bajo sus pies), se le sube un bloque — única
							// forma de escalar el andamio (es un bloque no sólido; el
							// cliente lo predice igual). Como en Minecraft simplificado.
							if (itemId === B.SCAFFOLDING && placeLifts(p, x, y, z)) {
								p.y += 1;
								broadcast(
									"player_move",
									{
										id: playerId,
										name: p.name,
										x: p.x,
										y: p.y,
										z: p.z,
										yaw: p.yaw,
										pitch: p.pitch
									},
									playerId
								);
							}
						}
					}
					break;
				}

				case "craft": {
					// Fase 18 (D-1): handler extraído a actions.js (crafteo 3x3).
					actions.handleCraft(p, ws, data);
					break;
				}

				case "grid_set": {
					actions.handleGridSet(p, ws, data);
					break;
				}

				case "grid_clear": {
					actions.handleGridClear(p, ws);
					break;
				}

				case "grid_return": {
					// Fase 19 (D1): devolver una celda del grid al inventario
					actions.handleGridReturn(p, ws, data);
					break;
				}

				case "inventory_swap": {
					// Fase 19 (D1): intercambiar dos slots del inventario (drag)
					actions.handleInventorySwap(p, ws, data);
					break;
				}

				case "furnace_open": {
					actions.handleFurnaceOpen(p, ws, data, playerId);
					break;
				}

				case "chest_open": {
					actions.handleChestOpen(p, ws, data);
					break;
				}

				case "chest_action": {
					actions.handleChestAction(p, ws, data);
					break;
				}

				case "furnace_action": {
					actions.handleFurnaceAction(p, ws, data, playerId);
					break;
				}

				case "worlds_list": {
					// Fase 7: el menú de mundos pide la lista de mundos guardados. El
					// servidor responde al MISMO socket (no broadcast): es info de menú.
					ws.send(
						JSON.stringify({
							event: "worlds_list",
							data: { worlds: save.listWorlds() }
						})
					);
					break;
				}

				case "recipe_book": {
					// Fase 9 (Bloque F): todas las recetas (crafteo + horno), sin
					// desbloqueo progresivo. Fase 18 (D-1): actions.handleRecipeBook.
					actions.handleRecipeBook(ws);
					break;
				}
				case "join_world": {
					// Fase 17 (A1/A5) + Fase 18 (D-1): elegir/crear el mundo activo
					// desde el menú (módulo server/world-session.js — cuota
					// anti-spam, switchWorld y confirmación con init).
					worldSession.handleJoinWorld(
						{ state, save, world, constants, enterWorld, sendInit, broadcast },
						p,
						ws,
						data,
						playerId
					);
					break;
				}

				case "set_seed": {
					// Fase 6 + Fase 18 (D-1): cambiar la semilla del mundo activo
					// (módulo server/world-session.js).
					worldSession.handleSetSeed(
						{ state, save, constants, enterWorld, sendInit },
						p,
						ws,
						data
					);
					break;
				}

				case "inventory_select": {
					if (typeof data.slot === "number" && data.slot >= 0 && data.slot < 9)
						p.selectedSlot = data.slot;
					break;
				}

				case "till": {
					// Fase 9 (Bloque C): arar con la azada. Fase 18 (D-1): actions.
					actions.handleTill(p, ws, data);
					break;
				}

				case "plant": {
					actions.handlePlant(p, data);
					break;
				}

				case "creative_pick": {
					actions.handleCreativePick(p, data);
					break;
				}

				case "creative_fly": {
					actions.handleCreativeFly(p, data);
					break;
				}

				case "world_delete": {
					// Fase 9/17 (A3) + Fase 18 (D-1): borrar un mundo (solo
					// operadores — toca disco; módulo server/world-session.js).
					worldSession.handleWorldDelete({ save }, p, ws, data);
					break;
				}

				case "world_clone": {
					// Fase 17 (A3) + Fase 18 (D-1): clonar un mundo (solo operadores).
					worldSession.handleWorldClone({ save }, p, ws, data);
					break;
				}

				case "world_rename": {
					// Fase 17 (A3) + Fase 18 (D-1): renombrar un mundo (solo op).
					worldSession.handleWorldRename({ save }, p, ws, data);
					break;
				}

				case "world_gamemode": {
					// Fase 17 (A3) + Fase 18 (D-1): modo de juego de un mundo (solo op).
					worldSession.handleWorldGamemode({ save }, p, ws, data);
					break;
				}

				// Fase 17 (C1) + Fase 18 (D-1): volver al menú principal desde la
				// pausa (módulo server/world-session.js — persiste el estado, libera
				// el mundo si es el último y envía menu_state).
				case "leave_world": {
					worldSession.handleLeaveWorld(
						{ state, save, broadcast, constants },
						p,
						ws,
						playerId
					);
					break;
				}

				case "equip_armor": {
					actions.handleEquipArmor(p, data);
					break;
				}

				case "unequip_armor": {
					actions.handleUnequipArmor(p, data);
					break;
				}

				case "bucket_use": {
					actions.handleBucketUse(p, data);
					break;
				}

				case "door_use": {
					actions.handleDoorUse(p, data);
					break;
				}

				case "sleep": {
					actions.handleSleep(p, ws, data);
					break;
				}

				case "eat": {
					actions.handleEat(p, ws);
					break;
				}

				case "feed_mob": {
					actions.handleFeedMob(p, data);
					break;
				}

				case "shear_mob": {
					actions.handleShearMob(p, data);
					break;
				}

				case "milk_cow": {
					// Fase 21 (C1): ordeñar la vaca con el cubo vacío → leche
					actions.handleMilkCow(p, data);
					break;
				}

				case "bonemeal": {
					actions.handleBonemeal(p, data);
					break;
				}

				case "chat": {
					actions.handleChat(p, data);
					break;
				}

				case "tame_mob": {
					actions.handleTameMob(p, data);
					break;
				}

				case "sit_pet": {
					actions.handleSitPet(p, data);
					break;
				}

				case "throw_trident": {
					actions.handleThrowTrident(p);
					break;
				}

				case "shoot_bow": {
					actions.handleShootBow(p, ws);
					break;
				}

				case "fishing": {
					// Fase 21.5 (A1): clic derecho con la caña → lanzar/recoger.
					actions.handleFishing(p, ws);
					break;
				}

				case "honey_bottle": {
					// Fase 21.5 (B4): botella de vidrio sobre la colmena → miel.
					actions.handleHoneyBottle(p, data);
					break;
				}

				case "attack_mob": {
					actions.handleAttackMob(p, ws, data);
					break;
				}
			}
		} catch (err) {
			// Auditoría 2026-08-09 (§1.1): ningún error lógico interno de un
			// mensaje puede derribar el proceso. Se registra y se ignora el
			// mensaje; el siguiente reintenta normal.
			log.error(`[net] error en handler de mensaje de ${playerId}:`, err);
		}
	});

	ws.on("close", (code, reason) => {
		const leaver = state.players.get(playerId);
		// Diagnóstico de desconexión (bug usuario #2): heartbeat, cierre
		// limpio del cliente, error de socket, etc. Código 1006 = abnormal
		// closure (típico de terminate() del heartbeat sin close frame).
		const reasonStr = reason?.toString() || "";
		const killSource = ws.killedByHeartbeat ? "heartbeat" : (code === 1000 ? "cliente" : code === 1006 ? "anómalo" : "otro");
		log.info(
			`🔴 Jugador desconectado: ${leaver ? leaver.name : playerId} ` +
			`(${state.players.size} en línea) ` +
			`code=${code} reason=${reasonStr || "(vacío)"} causa=${killSource}`
		);
		// Si se desconecta a mitad de una mina, el bloque NO cambia (no llega
		// block_update), así que los demás jugadores que veían las grietas se
		// quedarían con el crack colgado: enviar stage -1 a los del radio.
		if (leaver?.mining) {
			const { x, y, z } = leaver.mining;
			broadcastNear(x, y, z, "block_break_progress", { x, y, z, stage: -1 });
		}
		// Fase 17 (B1): persistir el estado del jugador al desconectar (el
		// autosave ya lo va guardando; este cierre garantiza el último estado).
		if (leaver && !leaver.inMenu) save.savePlayer(leaver);
		// Fase 16 (C5/REN-2): al desconectar, dejar de mirar el horno abierto
		// (el índice de watchers no debe acumular jugadores que ya no están).
		if (leaver?.openFurnace) {
			const watchers = state.openFurnaceWatchers.get(leaver.openFurnace);
			if (watchers) {
				watchers.delete(playerId);
				if (watchers.size === 0)
					state.openFurnaceWatchers.delete(leaver.openFurnace);
			}
		}
		// Fase 21.5 (A1): al desconectar se retira su línea de pesca activa
		// (el bobber no debe quedar flotando sin dueño).
		if (leaver) fishing.removePlayerBobbers(playerId);
		state.players.delete(playerId);
		broadcast("player_leave", { id: playerId });
		// Fase 17 (A1/C1): en modo menú, al quedarse el servidor sin jugadores
		// se libera el mundo activo y se vuelve al menú (el próximo jugador
		// elige/crea mundo de nuevo).
		if (constants.MENU_MODE && state.players.size === 0) save.releaseWorld();
	});

	// Auditoría 2026-08-15 (F7): el error de socket antes eran silencioso
	// (vacío). Se loguea sin romper la desconexión normal (el close handler
	// sigue limpiando al jugador). Un socket roto genera un 'error' justo
	// antes del 'close'; no es un error lógico del servidor.
	ws.on("error", (err) => {
		log.warn(`[net] socket de ${playerId} con error: ${err.message}`);
	});
}

// ============================================================
// FASE 18 (D-1): BUCLE PRINCIPAL Y ARRANQUE EXTRAÍDOS A timers.js
// El bucle (mainLoop), la trampa del templo (tickTempleTraps), las métricas
// (getServerMetrics) y el arranque (start) viven en server/timers.js. Aquí
// solo se cablean los hooks (broadcast/worldTime/broadcastMining) y se
// re-exporta la fachada para no cambiar ni server.js (net.start()) ni los
// tests (net.mainLoop/net.getServerMetrics/net.tickTempleTraps).
// ============================================================
timers.setWorldTimeFn(worldTime);
timers.setBroadcastFn(broadcast);
timers.setBroadcastMiningFn(broadcastMining);
// Mismos hooks para actions.js (handlers de juego).
actions.setWorldTimeFn(worldTime);
actions.setBroadcastFn(broadcast);
actions.setBroadcastNearFn(broadcastNear);

// handleConnection y mainLoop se exportan para tests unitarios (unit-red.js usa
// un ws fake para ejercitar los handlers; unit-metricas.js mide el tick).
module.exports = {
	broadcast,
	broadcastNear,
	handleConnection,
	mainLoop: timers.mainLoop,
	tickTempleTraps: timers.tickTempleTraps,
	tickPyramidTraps: timers.tickPyramidTraps,
	getServerMetrics: timers.getServerMetrics,
	// server.js llama a net.start(): el arranque vive en timers.js y recibe
	// handleConnection + app (estático Express) desde aquí.
	start: () => timers.start(handleConnection, app)
};
