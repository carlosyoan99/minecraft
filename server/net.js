"use strict";

// ============================================================
// RED: HTTP + WebSocket, handler de conexión y bucle principal
// ============================================================
const express = require("express");
const http = require("node:http");
const WebSocket = require("ws");
const path = require("node:path");
const { v4: uuidv4 } = require("uuid");
const constants = require("./constants.js");
const {
	PORT,
	TICK_MS,
	VIEW_DISTANCE_CHUNKS,
	DAY_CYCLE_MS,
	SPAWN_GRACE_MS,
	DESPAWN_DIST,
	VOID_Y,
	JUMP_SPEED,
	WS_MAX_PAYLOAD,
	MAX_CONNECTIONS,
	MAX_MSG_RATE,
	B,
	I,
	NOT_MINEABLE,
	FUEL_ITEMS,
	isSolidBlock,
	isTool,
	isArmor,
	ARMOR_SLOTS,
	ARMOR_DURABILITY,
	SWORD_DAMAGE,
	TOOL_DAMAGE,
	xpToNext,
	xpIntoLevel
} = constants;
const state = require("./state.js");
const world = require("./world.js");
const save = require("./save.js");
const playerHelpers = require("./players.js");
const { ItemStack } = require("./items.js"); // Fase 13 (C3): slots como clase
const crafting = require("./crafting.js");
const chests = require("./chests.js");
const mobs = require("./mobs.js");
const commands = require("./commands.js");
const mining = require("./mining.js");
const tnt = require("./tnt.js"); // Fase 10 (D2)

// Reloj del mundo ajustable (/time set): el día/noche, el ambiente y la IA
// de mobs siguen al mismo reloj (worldTime), así que el comando afecta a todo.
const worldTime = () => commands.worldTime(state);

// Fase 16 (C2, SV-3/SEC-3): valida que x/y/z sean números finitos ANTES de
// usarlos en handlers. Sin esto, coords `NaN`/strings/null degeneraban claves
// como "NaN,NaN" (chunks fantasma) y Math.hypot(NaN, ...) > 7 era false
// (pasaban el guard de distancia y mutaban el mundo con claves basura).
const validCoords = (x, y, z) =>
	typeof x === "number" &&
	typeof y === "number" &&
	typeof z === "number" &&
	Number.isFinite(x) &&
	Number.isFinite(y) &&
	Number.isFinite(z);

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
				arrows: state.arrows.map(mobs.arrowSnapshot),
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
					.map((q) => ({ id: q.id, name: q.name, x: q.x, y: q.y, z: q.z }))
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
	world.ensureChunksAround(player.x, player.z, player.renderDistance);
}

const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));

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
	// Fase 7 (auditoría): operador — el PRIMER jugador conectado (host) o
	// cualquiera en la lista OPS (env var OPS="Nombre1,Nombre2"). Permiso para
	// /tp /give /time /gamemode /reload /op (ver commands.js).
	const playerName = nameFromRequest(req) || `Jugador-${playerId.slice(0, 4)}`;
	// Fase 13 (C3): POO — el jugador es una instancia de Player (clase de
	// players.js) construida desde los mismos campos planos de siempre. El
	// resto del servidor lo sigue tratando por propiedades; los métodos de
	// entidad (damage/eat/respawn/...) quedan disponibles en la instancia.
	const player = playerHelpers.createPlayer({
		id: playerId,
		ws,
		name: playerName, // Fase 7: nombre visible
		isOp:
			state.players.size === 0 || constants.OPS.has(playerName.toLowerCase()),
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
	// los mobs; el cliente los recibe por mobs_update).
	lastMobsJson = "";
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
	// biome-ignore lint/suspicious/noConsole: log de conexión (operación normal del servidor)
	console.log(
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
			{ id: playerId, name: player.name, x: spawnX, y: spawnY, z: spawnZ },
			playerId
		);
	}

	ws.on("message", (raw) => {
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
		// sostenidos es flood (bots o cliente roto) y se corta la conexión. La
		// ventana es deslizante (1 s).
		if (realSocket) {
			const nowRate = Date.now();
			if (!ws.rateWindow) {
				ws.rateWindow = nowRate;
				ws.rateCount = 0;
			}
			if (nowRate - ws.rateWindow >= 1000) {
				ws.rateWindow = nowRate;
				ws.rateCount = 0;
			}
			if (++ws.rateCount > MAX_MSG_RATE) {
				try {
					ws.rateLimited = true;
					ws.close(1008, "demasiados mensajes"); // 1008 = policy violation
				} catch {
					/* ya cerrado */
				}
				return;
			}
		}

		try {
			switch (event) {
				case "move": {
					const { x, y, z, yaw, pitch } = data;
					// C2 (SV-3/SEC-3): `typeof number` deja pasar NaN; rechazarlo evita
					// corromper p.x/p.y/p.z y los chunks generados "NaN,NaN".
					if (!validCoords(x, y, z)) return;
					// Fase 7: caer del mundo (void). Se comprueba ANTES del anti-cheat de
					// velocidad: una caída acelerada supera el límite de 1.2 bloques/move y
					// sus moves se rechazarían (teleport al último punto aceptado), por lo
					// que el jugador nunca alcanzaría VOID_Y por debajo del mundo.
					if (y < VOID_Y) {
						playerHelpers.respawnPlayer(p, "void"); // Fase 10 (B2): causa
						return;
					}
					// Fase 10 (B1): límites del mundo — el jugador no puede salirse; si
					// el cliente reporta una posición fuera del borde se sujeta al límite
					// (en vez de teletransportar de vuelta, que haría "rebotar" en la
					// frontera de forma brusca).
					const half = constants.worldHalfExtent();
					const cx = Math.max(-half + 0.6, Math.min(half - 0.6, x));
					const cz = Math.max(-half + 0.6, Math.min(half - 0.6, z));
					const dist = Math.hypot(cx - p.x, cz - p.z, y - p.y);
					if (dist > 1.2) {
						// límite anti-cheat de velocidad
						ws.send(
							JSON.stringify({
								event: "teleport",
								data: { x: p.x, y: p.y, z: p.z }
							})
						);
						return;
					}
					// El agua no es sólida: nadar (estar dentro de un bloque de agua) es
					// legítimo. Solo se rechaza si el jugador está dentro de un sólido.
					// Fase 13 (L2/L3): la validación usa world.isSolidAt (COLISIÓN POR
					// FORMA), no isSolidBlock puro: una losa solo es sólida en su mitad
					// inferior, una escalera en su escalón, y una puerta abierta no
					// bloquea (state.doors). Sin esto, el servidor rechazaría al
					// jugador parado sobre una losa (media caja) o dentro de una
					// puerta abierta.
					if (world.isSolidAt(x, y, z) || world.isSolidAt(x, y + 1.5, z)) {
						ws.send(
							JSON.stringify({
								event: "teleport",
								data: { x: p.x, y: p.y, z: p.z }
							})
						);
						return;
					}
					// Fase 8 (mejora documentada): anti-cheat de vuelo — validar el
					// ASCENSO contra la parábola del salto. Un salto legítimo parte de
					// JUMP_SPEED bloques/s (máx ~0.35 bloques en un move de 50ms) y la
					// gravedad lo frena; subir más rápido (o subir durante >1s seguido
					// sin tocar suelo) es físicamente imposible aquí y denota un cliente
					// alterado "volando" (el límite de velocidad solo limitaba el daño,
					// no el ascenso sostenido). El dt se mide con mínimo de 50ms (el
					// intervalo de envío del cliente) para no falsear la velocidad con
					// ráfagas de red. En el agua no aplica (nadar hacia arriba es
					// legítimo, SWIM_UP_SPEED).
					const nowMs = Date.now();
					const dtSec = Math.max(
						0.05,
						(nowMs - (p.lastMoveTime || nowMs - 50)) / 1000
					);
					const vyObs = (y - p.y) / dtSec; // bloques/s (negativo = cae)
					p.vyObs = vyObs;
					const feetBlock = world.getBlock(
						Math.floor(x),
						Math.floor(y - constants.EYE_HEIGHT - 0.1),
						Math.floor(z)
					);
					const inWater = feetBlock === B.WATER;
					const inAir = !isSolidBlock(feetBlock) && !inWater;
					p.airTimeMs = inAir ? (p.airTimeMs || 0) + dtSec * 1000 : 0;
					// Fase 9 (Bloque C): en CREATIVE el ascenso sostenido es VUELO
					// legítimo (doble espacio), no un cheat: se salta la validación de la
					// parábola del salto. El límite de velocidad y los sólidos siguen
					// aplicando (el cliente colisiona; el servidor corrige si entra en un
					// bloque).
					// Fase 16 (C3, SEC-1): el anti-cheat también caza el HOVER — antes la
					// condición `y - p.y > 0` excluía dy = 0, así que mantenerse en el
					// aire >1s sin subir ni caer (flotar) no disparaba nada. Ahora, en el
					// aire y sin descender (dy ≥ −0.001; la caída legítima, dy < 0, sigue
					// exenta porque dura >1s), el tiempo acumulado cuenta igual.
					const dy = y - p.y;
					const hovering = dy >= -0.001; // sube o se mantiene (no cae)
					if (inAir && p.gamemode !== "creative") {
						// Parábola del salto: vy = JUMP_SPEED − GRAVITY·t (máx al iniciar
						// el salto). Margen 1.5× por latencia/jitter; además ningún salto
						// legítimo sube más de ~0.4s seguido (tras >1s en el aire, subir
						// o flotar es volar).
						if (
							(dy > 0 && (vyObs > JUMP_SPEED * 1.5 || p.airTimeMs > 1000)) ||
							(hovering && p.airTimeMs > 1000)
						) {
							ws.send(
								JSON.stringify({
									event: "teleport",
									data: { x: p.x, y: p.y, z: p.z }
								})
							);
							return;
						}
					}
					// Fase 16 (C3, SEC-1): ventana deslizante de velocidad horizontal.
					// Ráfagas de ~0.8 bloques a 20/s pasan el límite por-move (1.2) pero
					// son ~16 bloques/s sostenidos. La ventana mide bloques/s reales sobre
					// las muestras aceptadas (~1.2s), con el intervalo de cada muestra
					// clavado a ≥50 ms (igual que el anti-cheat vertical) para no falsar
					// con ráfagas de red. El sprint legítimo (~5.6 bloques/s) queda por
					// debajo del umbral (7 bloques/s).
					if (p.gamemode !== "creative") {
						const WINDOW_MS = 1200;
						const MAX_SPEED = 7; // bloques/s sostenidos (sprint ≈ 5.6)
						let sumDist = 0;
						let sumDur = 0;
						let prevT = nowMs - 50;
						for (const s of p.speedSamples) {
							if (nowMs - s.t > WINDOW_MS) continue; // muestra vieja
							sumDur += Math.max(0.05, s.t - prevT) / 1000;
							sumDist += s.dist;
							prevT = s.t;
						}
						if (sumDur >= 0.1 && sumDist / sumDur > MAX_SPEED) {
							ws.send(
								JSON.stringify({
									event: "teleport",
									data: { x: p.x, y: p.y, z: p.z }
								})
							);
							return;
						}
					}
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
					// Generar chunks nuevos bajo demanda al moverse
					const newChunks = world.ensureChunksAround(cx, cz, 2);
					if (newChunks.length) {
						const extra = {};
						for (const key of newChunks)
							extra[key] = Array.from(state.chunks.get(key));
						ws.send(
							JSON.stringify({
								event: "chunks_add",
								data: { chunkData: extra }
							})
						);
					}
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
					const name = sanitizeName(data?.name);
					if (!name) break;
					p.name = name;
					broadcast("player_rename", { id: playerId, name });
					break;
				}

				case "settings": {
					// Fase 7: ajustes que afectan al servidor. Por ahora solo la distancia
					// de render (2..10 chunks): al ampliarla se generan los chunks nuevos
					// y se reenvían TAMBIÉN los ya generados del radio (si antes se bajó,
					// el cliente descartó los lejanos y los necesita de nuevo). El cliente
					// decide qué construir/ocultar.
					const rd = data?.renderDistance;
					if (typeof rd === "number" && Number.isFinite(rd)) {
						const clamped = Math.min(10, Math.max(2, Math.round(rd)));
						if (clamped !== p.renderDistance) {
							p.renderDistance = clamped;
							const fresh = world.ensureChunksAround(
								p.x,
								p.z,
								p.renderDistance
							);
							const extra = {};
							for (const key of fresh)
								extra[key] = Array.from(state.chunks.get(key));
							const pcx = Math.floor(p.x / constants.CHUNK_SIZE),
								pcz = Math.floor(p.z / constants.CHUNK_SIZE);
							for (let x = pcx - clamped; x <= pcx + clamped; x++) {
								for (let z = pcz - clamped; z <= pcz + clamped; z++) {
									const key = `${x},${z}`;
									if (state.chunks.has(key) && !extra[key])
										extra[key] = Array.from(state.chunks.get(key));
								}
							}
							if (Object.keys(extra).length) {
								ws.send(
									JSON.stringify({
										event: "chunks_add",
										data: { chunkData: extra }
									})
								);
							}
						}
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
						if (itemId === B.TORCH && !world.torchSupported(x, y, z)) return;
						// Fase 13 (L2): puertas y portones ocupan 2 celdas de alto — se
						// colocan solo si hay hueco arriba (y + 1 libre) y necesitan un
						// bloque de apoyo debajo (no flotar).
						if (constants.isDoor(itemId)) {
							if (world.getBlock(x, y + 1, z) !== B.AIR) return;
							if (!isSolidBlock(world.getBlock(x, y - 1, z))) return;
							world.setBlock(x, y, z, itemId);
							world.setBlock(x, y + 1, z, itemId);
							playerHelpers.removeFromInventory(p, itemId, 1);
							playerHelpers.sendInventory(p);
							break;
						}
						world.setBlock(x, y, z, itemId);
						playerHelpers.removeFromInventory(p, itemId, 1);
						playerHelpers.sendInventory(p);
					}
					break;
				}

				case "craft": {
					// Auditoría 2026-08-09 (§1.2): la grid SIEMPRE es la del servidor
					// (p.craftingGrid), que solo se llena vía grid_set/grid_clear —
					// acciones que descuentan/repongan ítems del inventario real. Antes
					// se aceptaba data.grid del wire directamente: un cliente podía
					// reenviar la grid de cualquier receta cada frame y craftear ítems
					// infinitos sin coste (duplicación de recursos en survival).
					const recipe = crafting.matchRecipe(p.craftingGrid);
					if (recipe) {
						for (let i = 0; i < 9; i++) {
							const cell = p.craftingGrid[i];
							if (cell) {
								cell.count -= 1;
								p.craftingGrid[i] = cell.count > 0 ? cell : null;
							}
						}
						playerHelpers.addToInventory(
							p,
							recipe.result.id,
							recipe.result.count || 1
						);
						playerHelpers.sendInventory(p);
					}
					ws.send(
						JSON.stringify({
							event: "crafting_grid_update",
							data: { grid: p.craftingGrid, success: !!recipe }
						})
					);
					break;
				}

				case "grid_set": {
					// El cliente pide mover un item del inventario a una celda de crafteo
					const { fromInventorySlot, toGridSlot } = data;
					const item = p.inventory[fromInventorySlot];
					if (!item || toGridSlot < 0 || toGridSlot > 8) return;
					if (p.craftingGrid[toGridSlot]) return; // celda ocupada
					// Conservar la durabilidad al pasar una herramienta por la mesa
					// (evita "repararla" gratis y, por tanto, duplicar usos)
					// Fase 13 (C3): el slot es un ItemStack (JSON idéntico al wire).
					p.craftingGrid[toGridSlot] = new ItemStack(
						item.id,
						1,
						item.durability
					);
					item.count -= 1;
					if (item.count <= 0) p.inventory[fromInventorySlot] = null;
					playerHelpers.sendInventory(p);
					ws.send(
						JSON.stringify({
							event: "crafting_grid_update",
							data: { grid: p.craftingGrid, success: false }
						})
					);
					break;
				}

				case "grid_clear": {
					for (let i = 0; i < 9; i++) {
						const cell = p.craftingGrid[i];
						if (cell)
							playerHelpers.addToInventory(
								p,
								cell.id,
								cell.count,
								cell.durability
							);
					}
					p.craftingGrid.fill(null);
					playerHelpers.sendInventory(p);
					ws.send(
						JSON.stringify({
							event: "crafting_grid_update",
							data: { grid: p.craftingGrid, success: false }
						})
					);
					break;
				}

				case "furnace_open": {
					if (!validCoords(data.x, data.y, data.z)) break; // C2 (SV-3/SEC-3)
					const key = `${data.x},${data.y},${data.z}`;
					// Fase 7 (auditoría): validar distancia como chest_open — antes un
					// jugador podía abrir/operar cualquier horno del mundo desde lejos.
					if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) return;
					if (world.getBlock(data.x, data.y, data.z) !== B.FURNACE) return;
					p.openFurnace = key;
					const f = crafting.getOrCreateFurnace(key);
					ws.send(
						JSON.stringify({
							event: "furnace_state",
							data: { key, ...crafting.furnaceSnapshot(f) }
						})
					);
					break;
				}

				case "chest_open": {
					// Fase 6: abrir un cofre — valida distancia y que el bloque sea
					// realmente un cofre (fuente de verdad del servidor).
					if (!validCoords(data.x, data.y, data.z)) break; // C2 (SV-3/SEC-3)
					const key = `${data.x},${data.y},${data.z}`;
					if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) return;
					if (world.getBlock(data.x, data.y, data.z) !== B.CHEST) return;
					p.openChest = key;
					const c = chests.getOrCreateChest(key);
					ws.send(
						JSON.stringify({
							event: "chest_state",
							data: { key, slots: chests.chestSnapshot(c) }
						})
					);
					break;
				}

				case "chest_action": {
					// Mover items entre el cofre abierto y el inventario del jugador:
					//   put   — del slot del inventario (invSlot) al cofre (apila o 1er hueco)
					//   take  — del slot del cofre (chestSlot) al inventario (apila)
					//   close — cerrar
					if (!p.openChest) return;
					const key = p.openChest; // capturar antes de que 'close' lo anule
					// Revalidar distancia (como chest_open): en Minecraft hay que seguir
					// cerca del cofre para usarlo (defensivo contra alejarse y operar).
					const [bx, by, bz] = key.split(",").map(Number);
					if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
					const c = chests.getOrCreateChest(key);
					if (data.action === "put") {
						const invSlot = data.invSlot;
						const item = p.inventory[invSlot];
						if (!item) return;
						// Herramientas NUNCA se apilan (cada una con su durabilidad propia):
						// apilarlas por id fusionaría dos picos con durabilidades distintas
						// en un slot y el take (addToInventory fuerza count 1) perdería uno.
						let target = isTool(item.id)
							? -1
							: c.findIndex((s) => s && s.id === item.id);
						if (target === -1) target = c.findIndex((s) => !s);
						if (target === -1) return; // cofre lleno
						if (c[target]) c[target].count += item.count;
						else
							c[target] = new ItemStack(item.id, item.count, item.durability);
						p.inventory[invSlot] = null;
						playerHelpers.sendInventory(p);
					} else if (data.action === "take") {
						const chestSlot = data.chestSlot;
						const item = c[chestSlot];
						if (!item) return;
						if (
							!playerHelpers.addToInventory(
								p,
								item.id,
								item.count,
								item.durability
							)
						)
							return; // inventario lleno
						c[chestSlot] = null;
						playerHelpers.sendInventory(p);
					} else if (data.action === "close") {
						p.openChest = null;
					}
					ws.send(
						JSON.stringify({
							event: "chest_state",
							data: { key, slots: chests.chestSnapshot(c) }
						})
					);
					break;
				}

				case "furnace_action": {
					if (!p.openFurnace) return;
					const key = p.openFurnace; // capturar antes de que 'close' lo anule
					// Fase 7 (auditoría): revalidar distancia como chest_action — hay que
					// seguir cerca del horno para operarlo (como en Minecraft).
					const [bx, by, bz] = key.split(",").map(Number);
					if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
					const f = crafting.getOrCreateFurnace(key);
					if (data.action === "add_fuel") {
						const slot = p.inventory[data.invSlot];
						if (
							slot &&
							FUEL_ITEMS.has(slot.id) &&
							(!f.fuelItem || f.fuelItem === slot.id)
						) {
							f.fuelItem = slot.id;
							// Fase 16 (D1): registrar la unidad REAL cargada (fuelCount) —
							// sin esto el horno nunca arrancaba (canCook exige fuelCount > 0)
							// y el combustible añadido no se consumía nunca.
							f.fuelCount = (f.fuelCount || 0) + 1;
							slot.count -= 1;
							if (slot.count <= 0) p.inventory[data.invSlot] = null;
							playerHelpers.sendInventory(p);
						}
					} else if (data.action === "add_input") {
						const slot = p.inventory[data.invSlot];
						if (
							slot &&
							crafting.isCookable(slot.id) &&
							(!f.inputItem || f.inputItem.id === slot.id)
						) {
							f.inputItem = f.inputItem
								? { id: slot.id, count: f.inputItem.count + slot.count }
								: { id: slot.id, count: slot.count };
							p.inventory[data.invSlot] = null;
							playerHelpers.sendInventory(p);
						}
					} else if (data.action === "collect_output") {
						if (f.outputItem && f.outputCount > 0) {
							if (
								playerHelpers.addToInventory(p, f.outputItem, f.outputCount)
							) {
								f.outputItem = null;
								f.outputCount = 0;
								playerHelpers.sendInventory(p);
							}
						}
					} else if (data.action === "close") {
						p.openFurnace = null;
					}
					ws.send(
						JSON.stringify({
							event: "furnace_state",
							data: { key, ...crafting.furnaceSnapshot(f) }
						})
					);
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
					// Fase 9 (Bloque F): el libro de recetas pide TODAS las recetas
					// (crafteo + horno) para mostrarlas por categorías, sin desbloqueo
					// progresivo. Se responde al MISMO socket (es info de inventario/UI).
					ws.send(
						JSON.stringify({
							event: "recipe_book",
							data: crafting.getRecipeTables()
						})
					);
					break;
				}
				case "join_world": {
					// Fase 17 (A1/A5): el PRIMER jugador elige/crea el mundo activo
					// desde el menú. Reutiliza switchWorld (persiste el mundo actual si
					// lo hubiera, carga/genera el pedido y reenvía el init). Solo
					// aplica a jugadores que aún están en el menú; los que conectan
					// después de que el mundo esté activo reciben el init directo.
					if (!p.inMenu) break;
					if (typeof data.seed !== "string" || !data.seed.trim()) break;
					// Otro jugador ya está jugando (este cliente se quedó en el menú
					// mientras el mundo se cargaba): no cambiarle el mundo bajo sus pies.
					const someonePlaying = Array.from(state.players.values()).some(
						(q) => q.id !== playerId && !q.inMenu
					);
					if (someonePlaying) {
						p.ws.send(
							JSON.stringify({
								event: "seed_rejected",
								data: { reason: "others" }
							})
						);
						break;
					}
					// Fase 7: `name` (opcional) da nombre al mundo nuevo (world.json); si
					// la semilla ya existe, el nombre guardado en disco gana (loadWorld).
					// Fase 9 (Bloque B): `gamemode` fija el modo del mundo NUEVO.
					// Fase 10 (B1): `size` el tamaño del mundo NUEVO.
					const mode = constants.sanitizeGamemode(data.gamemode);
					const size = constants.sanitizeWorldSize(data.size);
					const seed = data.seed.trim();
					let r = save.switchWorld(seed, data.name, mode, size);
					if (r === "same" && !constants.worldPaths.currentSeed) {
						// En modo menú currentSeed es null → seedDir(null) = "default"
						// es el directorio del menú. Si el mundo pedido colisiona con él
						// (p. ej. semilla "default"), cargarlo directamente con la
						// semilla real (switchWorld devolvió "same" por la colisión).
						constants.setWorldSeed(seed, data.name || seed, mode);
						constants.worldPaths.worldSize = size;
						world.reinitNoise(seed);
						save.loadWorld();
						r = true;
					}
					if (r === "rechazo" || r === "error") {
						p.ws.send(
							JSON.stringify({ event: "seed_rejected", data: { reason: r } })
						);
						break;
					}
					p.inMenu = false;
					enterWorld(p);
					sendInit(p); // confirmación: el cliente la usa para cerrar la carga
					broadcast(
						"player_join",
						{ id: playerId, name: p.name, x: p.x, y: p.y, z: p.z },
						playerId
					);
					break;
				}

				case "set_seed": {
					// Fase 6: campo de semilla del menú del cliente. El servidor es la
					// fuente de verdad: cambia el mundo activo (persistiendo el actual) y
					// reenvía el init con el mundo de la semilla pedida. Servidor dedicado:
					// solo se cambia si este jugador es el ÚNICO en línea (los demás verían
					// el mundo cambiar bajo sus pies).
					if (typeof data.seed !== "string" || !data.seed.trim()) break;
					// Fase 16 (C4, SEC-2): cuota anti-spam — 1 cambio de semilla cada 10s
					// por jugador. switchWorld persiste el mundo actual (I/O a disco); sin
					// cuota un cliente podía martillear el evento y saturar el disco.
					const nowCooldown = Date.now();
					if (p.seedCooldownUntil && p.seedCooldownUntil > nowCooldown) {
						p.ws.send(
							JSON.stringify({
								event: "seed_rejected",
								data: { reason: "cooldown" }
							})
						);
						break;
					}
					p.seedCooldownUntil = nowCooldown + 10000; // 10 s (cuota)
					if (state.players.size > 1) {
						p.ws.send(
							JSON.stringify({
								event: "seed_rejected",
								data: { reason: "others" }
							})
						);
						break;
					}
					const seed = data.seed.trim();
					// Fase 7: `name` (opcional) da nombre al mundo nuevo (world.json); si la
					// semilla ya existe, el nombre guardado en disco gana (loadWorld).
					// Fase 9 (Bloque B): `gamemode` (opcional) fija el modo del mundo NUEVO
					// (survival/creative); un mundo existente conserva el suyo.
					const mode = constants.sanitizeGamemode(data.gamemode);
					// Fase 10 (B1): tamaño del mundo nuevo (pequeño/medio/grande).
					const size = constants.sanitizeWorldSize(data.size);
					const r = save.switchWorld(seed, data.name, mode, size);
					if (r === "rechazo" || r === "error") {
						p.ws.send(
							JSON.stringify({ event: "seed_rejected", data: { reason: r } })
						);
						break;
					}
					if (r === true) enterWorld(p); // mundo nuevo: entrar de cero
					sendInit(p); // confirmación: el cliente la usa para cerrar la carga
					break;
				}

				case "inventory_select": {
					if (typeof data.slot === "number" && data.slot >= 0 && data.slot < 9)
						p.selectedSlot = data.slot;
					break;
				}

				case "till": {
					// Fase 9 (Bloque C): arar la tierra con una azada — clic derecho con
					// azada en la mano sobre tierra/césped la convierte en tierra arada
					// (soporte para plantar semillas). La azada se desgasta (1 uso).
					if (!validCoords(data.x, data.y, data.z)) break; // C2 (SV-3/SEC-3)
					const block = world.getBlock(data.x, data.y, data.z);
					if (block !== B.DIRT && block !== B.GRASS) break;
					if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) break;
					const held = p.inventory[p.selectedSlot];
					if (!held || !constants.isHoe(held.id)) break;
					world.setBlock(data.x, data.y, data.z, B.FARMLAND);
					const broke = playerHelpers.applyToolWear(p);
					playerHelpers.sendInventory(p);
					if (broke)
						p.ws.send(
							JSON.stringify({
								event: "tool_broke",
								data: { slot: p.selectedSlot }
							})
						);
					break;
				}

				case "plant": {
					// Fase 9 (Bloque C): plantar semillas en tierra arada — clic derecho
					// con semillas sobre farmland coloca un cultivo de trigo (crece por
					// etapas en el bucle principal y se cosecha al madurar).
					if (!validCoords(data.x, data.y, data.z)) break; // C2 (SV-3/SEC-3)
					if (world.getBlock(data.x, data.y, data.z) !== B.FARMLAND) break;
					if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) break;
					const held = p.inventory[p.selectedSlot];
					if (!held || held.id !== I.SEEDS) break;
					if (!playerHelpers.removeFromInventory(p, I.SEEDS, 1)) break;
					world.setBlock(data.x, data.y, data.z, B.WHEAT);
					state.crops.set(`${data.x},${data.y},${data.z}`, {
						stage: 0,
						plantedAt: Date.now()
					});
					playerHelpers.sendInventory(p);
					break;
				}

				case "creative_pick": {
					// Fase 9 (Bloque C): picker creativo — el jugador coge un ítem del
					// catálogo completo (bloques, ítems, herramientas, armadura) y se
					// coloca en el slot seleccionado. Solo en un mundo creative; los ítems
					// deben estar en el catálogo (nunca IDs arbitrarios del wire).
					if (p.gamemode !== "creative") break;
					const id = data.itemId;
					if (typeof id !== "number") break;
					const isToolOrArmor =
						constants.isTool(id) ||
						constants.isArmor(id) ||
						constants.isHoe(id);
					if (
						!(
							constants.CREATIVE_ITEMS.includes(id) ||
							constants.ALL_TOOLS_AND_ARMOR.includes(id)
						)
					)
						break;
					p.inventory[p.selectedSlot] = new ItemStack(
						id,
						isToolOrArmor ? 1 : 64,
						isToolOrArmor
							? (constants.TOOL_DURABILITY[id] ??
									constants.ARMOR_DURABILITY[id] ??
									constants.HOE_DURABILITY[id])
							: undefined
					);
					playerHelpers.sendInventory(p);
					break;
				}

				case "creative_fly": {
					// Fase 9 (Bloque C): el cliente avisa del estado de vuelo (doble
					// espacio). Solo en creative; es informativo para el servidor (el
					// anti-cheat de ascenso ya se salta en creative) y para el F3.
					if (p.gamemode !== "creative") break;
					p.flying = !!data.enabled;
					break;
				}

				case "world_delete": {
					// Auditoría 2026-08-09 (§1.3): borrar un mundo borra archivos del
					// disco, así que es una operación SOLO de operadores (igual que
					// /give, /tp, /gamemode). Antes cualquier cliente podía eliminar
					// `world/<semilla>/` de mundos no activos.
					if (!p.isOp) {
						ws.send(
							JSON.stringify({
								event: "world_delete_result",
								data: {
									ok: false,
									reason: "solo operadores",
									worlds: save.listWorlds()
								}
							})
						);
						break;
					}
					// Fase 9 (Bloque B): borrar un mundo desde el menú. El servidor es la
					// fuente de verdad: rechaza el mundo ACTIVO y valida el nombre del
					// directorio (deleteWorld) antes de tocar el disco. Al terminar se
					// reenvía la lista de mundos al mismo socket.
					const r = save.deleteWorld(data?.seed);
					ws.send(
						JSON.stringify({
							event: "world_delete_result",
							data: {
								ok: r.ok,
								reason: r.ok ? null : r.reason,
								worlds: save.listWorlds()
							}
						})
					);
					break;
				}

				// Fase 17 (A3): gestión completa de mundos — clonar, renombrar y
				// cambiar el modo de juego desde el menú. Igual que world_delete,
				// son operaciones SOLO de operadores (tocan disco); responden al
				// MISMO socket con el resultado y la lista de mundos actualizada.
				// El mundo ACTIVO se puede renombrar/cambiar de modo (refleja el
				// estado en memoria) pero no clonarse/borrarse a sí mismo.
				case "world_clone": {
					if (!p.isOp) {
						ws.send(
							JSON.stringify({
								event: "worlds_list",
								data: { worlds: save.listWorlds() }
							})
						);
						break;
					}
					const r = save.cloneWorld(data?.seed, data?.name);
					ws.send(
						JSON.stringify({
							event: "world_clone_result",
							data: {
								ok: r.ok,
								seed: r.seed || null,
								reason: r.ok ? null : r.reason,
								worlds: save.listWorlds()
							}
						})
					);
					break;
				}

				case "world_rename": {
					if (!p.isOp) break;
					const r = save.renameWorld(data?.seed, data?.name);
					ws.send(
						JSON.stringify({
							event: "worlds_list",
							data: { worlds: save.listWorlds() }
						})
					);
					if (!r.ok) {
						ws.send(
							JSON.stringify({
								event: "flash",
								data: { text: "🌍 No se pudo renombrar el mundo." }
							})
						);
					}
					break;
				}

				case "world_gamemode": {
					if (!p.isOp) break;
					const r = save.setWorldMode(data?.seed, data?.gamemode);
					ws.send(
						JSON.stringify({
							event: "worlds_list",
							data: { worlds: save.listWorlds() }
						})
					);
					if (!r.ok) {
						ws.send(
							JSON.stringify({
								event: "flash",
								data: { text: "🌍 No se pudo cambiar el modo del mundo." }
							})
						);
					}
					break;
				}

				// Fase 17 (C1): volver al menú principal desde la pausa — el jugador
				// abandona el mundo (se persiste su estado) y, si es el último, el
				// servidor libera el mundo activo y vuelve al modo menú (A1). El
				// cliente sigue conectado: recibe menu_state y muestra el menú.
				case "leave_world": {
					if (p.inMenu) break;
					save.savePlayer(p);
					p.inMenu = true;
					// broadcast player_leave para que los demás clientes lo quiten.
					broadcast("player_leave", { id: playerId });
					if (constants.MENU_MODE && state.players.size === 1) {
						save.releaseWorld();
					} else {
						// Otros jugadores siguen en el mundo: el estado en memoria se
						// mantiene y este jugador deja de recibir broadcast de mundo.
						p.x = 0;
						p.y = 0;
						p.z = 0;
					}
					ws.send(
						JSON.stringify({
							event: "menu_state",
							data: { worlds: save.listWorlds() }
						})
					);
					break;
				}

				case "equip_armor": {
					// Fase 7: equipar una pieza de armadura desde el inventario (clic
					// derecho con la pieza en mano). Se intercambia con la pieza ya
					// equipada (vuelve al inventario, conservando su durabilidad).
					const slotIdx = data.inventorySlot;
					const item = p.inventory[slotIdx];
					if (!item || !isArmor(item.id)) return;
					const slotName = ARMOR_SLOTS[(item.id - 220) % 4];
					const prev = p.armor[slotName];
					// Devolver la pieza actual al MISMO slot si el hueco se queda libre;
					// si no había pieza, el slot del inventario queda vacío.
					p.inventory[slotIdx] = prev
						? new ItemStack(prev.id, 1, prev.durability)
						: null;
					p.armor[slotName] = new ItemStack(
						item.id,
						1,
						item.durability ?? ARMOR_DURABILITY[item.id]
					);
					playerHelpers.sendInventory(p);
					break;
				}

				case "unequip_armor": {
					// Fase 7: quitar una pieza del slot de armadura (clic en el panel
					// de inventario): vuelve al inventario conservando su durabilidad.
					const slotName = data.slot;
					if (!ARMOR_SLOTS.includes(slotName)) return;
					const piece = p.armor[slotName];
					if (!piece) return;
					if (!playerHelpers.addToInventory(p, piece.id, 1, piece.durability))
						return; // inventario lleno: no se pierde la pieza
					p.armor[slotName] = null;
					playerHelpers.sendInventory(p);
					break;
				}

				case "bucket_use": {
					// Fase 13 (L4): cubo de líquidos. Clic derecho: con el cubo VACÍO
					// sobre una fuente de agua/lava (B.WATER/B.LAVA) la recoge (deja
					// aire y devuelve WATER_BUCKET/LAVA_BUCKET); con el cubo LLENO
					// vierte el líquido donde se mira (deja BUCKET vacío). Compatible
					// con la fuente infinita 2×2 de la Fase 11: al recoger, si quedan
					// ≥2 fuentes ortogonales adyacentes, la celda se rellena sola.
					const { x, y, z } = data;
					if (!validCoords(x, y, z)) break; // C2 (SV-3/SEC-3)
					if (Math.hypot(x - p.x, y - p.y, z - p.z) > 7) break;
					const held = p.inventory[p.selectedSlot];
					if (!held) break;
					const block = world.getBlock(x, y, z);
					// RECOGER: cubo vacío sobre una fuente.
					if (held.id === I.BUCKET) {
						if (block === B.WATER || block === B.LAVA) {
							// Fuente infinita 2×2 (Fase 11): con ≥2 fuentes adyacentes la
							// celda se rellena sola (el patrón nunca se agota).
							if (block === B.WATER && world.countWaterNeighbors(x, y, z) >= 2)
								break; // no recoger: la 2×2 queda intacta (se puede sacar de ella)
							world.setBlock(x, y, z, B.AIR);
							playerHelpers.removeFromInventory(p, I.BUCKET, 1);
							playerHelpers.addToInventory(
								p,
								block === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET,
								1
							);
							playerHelpers.sendInventory(p);
						}
						break;
					}
					// VERTER: cubo lleno → el líquido se coloca donde se mira si es aire
					// (y la celda está dentro del mundo). Devuelve el cubo vacío.
					if (held.id === I.WATER_BUCKET || held.id === I.LAVA_BUCKET) {
						if (block !== B.AIR) break;
						world.setBlock(
							x,
							y,
							z,
							held.id === I.WATER_BUCKET ? B.WATER : B.LAVA
						);
						playerHelpers.removeFromInventory(p, held.id, 1);
						playerHelpers.addToInventory(p, I.BUCKET, 1);
						playerHelpers.sendInventory(p);
					}
					break;
				}

				case "door_use": {
					// Fase 13 (L2): abrir/cerrar una puerta o portón con clic derecho.
					// El servidor alterna el estado (state.doors) y hace broadcast
					// door_state para que todos los jugadores vean el cambio. La
					// puerta cerrada es sólida; la abierta se atraviesa (la valida
					// world.isSolidAt en el move).
					let bx = data.x,
						by = data.y,
						bz = data.z;
					if (!validCoords(bx, by, bz)) break; // C2 (SV-3/SEC-3)
					if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) break;
					let block = world.getBlock(bx, by, bz);
					// La puerta ocupa 2 celdas (ambas son bloque de puerta): el
					// estado de apertura vive SIEMPRE en la celda INFERIOR. Si el
					// clic cae en la mitad superior (también bloque de puerta) o
					// justo encima de la puerta, se remapea a la celda inferior —
					// fix de paridad: antes el remapeo exigía que la celda clicada
					// NO fuera puerta, así que clicar la mitad superior abría un
					// estado distinto en la celda alta (y la puerta seguía sólida).
					if (constants.isDoor(world.getBlock(bx, by - 1, bz))) {
						by = by - 1;
						block = world.getBlock(bx, by, bz);
					}
					if (!constants.isDoor(block)) break;
					const key = `${bx},${by},${bz}`;
					const cur = state.doors.get(key) || { open: false };
					const open = !cur.open;
					state.doors.set(key, { open });
					broadcast("door_state", { x: bx, y: by, z: bz, open });
					break;
				}

				case "sleep": {
					// Fase 7: dormir en una cama de noche — salta al amanecer y fija el
					// punto de reaparición en la cama (respawnPoint, usado por
					// players.damagePlayer al morir). De día se rechaza (como Minecraft).
					const bx = data.x,
						by = data.y,
						bz = data.z;
					if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
					if (world.getBlock(bx, by, bz) !== B.BED) return;
					if (worldTime() < DAY_CYCLE_MS / 2) {
						p.ws.send(
							JSON.stringify({
								event: "sleep_rejected",
								data: { reason: "day" }
							})
						);
						break;
					}
					// Saltar al amanecer: mismo mecanismo que /time set day (el reloj
					// del mundo sigue a state.timeOffset; todos los clientes re-sincronizan).
					state.timeOffset =
						(0 - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
					broadcast("time_set", {
						dayTime: worldTime(),
						moonTime: commands.moonTime(state) // Fase 8 (B8): fase lunar en sync
					});
					// Punto de reaparición: las coordenadas del BLOQUE de la cama (los
					// offsets se aplican al reaparecer en players.damagePlayer; guardarlos
					// ya desplazados rompería la limpieza al romper la cama).
					p.respawnPoint = { x: bx, y: by, z: bz };
					p.ws.send(
						JSON.stringify({
							event: "sleep_ok",
							data: { x: bx, y: by, z: bz }
						})
					);
					break;
				}

				case "eat": {
					// Comer el ítem seleccionado: valida que sea comida y aplica hambre+saturación
					const held = p.inventory[p.selectedSlot];
					if (!held) return;
					const verdict = playerHelpers.canEat(p, held.id);
					if (verdict === "full") {
						// Estilo Minecraft: avisar cuando no hay hambre ni saturación por recuperar
						p.ws.send(JSON.stringify({ event: "eat_rejected", data: {} }));
						return;
					}
					if (verdict !== "ok") return; // no es comida (no debería pasar vía UI)
					playerHelpers.eatFood(p, held.id);
					held.count -= 1;
					if (held.count <= 0) p.inventory[p.selectedSlot] = null;
					playerHelpers.sendInventory(p);
					break;
				}

				case "feed_mob": {
					// Alimentar a un animal con su comida de cría: modo amor → pareja → bebé
					const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
					if (!mob) return;
					if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
					const held = p.inventory[p.selectedSlot];
					if (!held) return;
					if (mobs.canFeed(mob, held.id) !== "ok") return;
					held.count -= 1;
					if (held.count <= 0) p.inventory[p.selectedSlot] = null;
					playerHelpers.sendInventory(p);
					const baby = mobs.applyFeed(mob, state.mobs);
					if (baby) broadcast("mob_breed", { x: baby.x, y: baby.y, z: baby.z });
					break;
				}

				case "shear_mob": {
					// Fase 11 (C): esquilar una oveja con tijeras — clic derecho da lana
					// sin matar al animal (la oveja queda esquilada hasta que le crece
					// el pelo). El servidor valida distancia, ítem y estado.
					const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
					if (!mob) return;
					if (
						Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > mobs.SHEAR_RANGE
					)
						return;
					const held = p.inventory[p.selectedSlot];
					if (!held || held.id !== I.SHEARS) return;
					if (mobs.canShear(mob, held.id) !== "ok") return;
					const woolCount = mobs.applyShear(mob);
					playerHelpers.addToInventory(p, B.WHITE_WOOL, woolCount);
					// Auditoría 2026-08-09 (§4.2): esquilar desgasta las tijeras
					// (como MC: -1 por corte). El break/sync lo gestiona applyToolWear.
					playerHelpers.applyToolWear(p);
					playerHelpers.sendInventory(p);
					break;
				}

				case "bonemeal": {
					// Fase 11 (C): harina de hueso — sobre trigo lo madura en salto
					// (avanza etapas hasta 7); sobre césped/tierra crea vegetación
					// encima (hierba alta o una flor). Consume 1 harina; el servidor
					// valida el ítem y la distancia.
					if (!validCoords(data.x, data.y, data.z)) break; // C2 (SV-3/SEC-3)
					if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) break;
					const held = p.inventory[p.selectedSlot];
					if (!held || held.id !== I.BONE_MEAL) break;
					const block = world.getBlock(data.x, data.y, data.z);
					if (block === B.WHEAT) {
						const key = `${data.x},${data.y},${data.z}`;
						const crop = state.crops.get(key) || {
							stage: 0,
							plantedAt: Date.now()
						};
						crop.stage = Math.min(
							7,
							crop.stage + 2 + Math.floor(Math.random() * 3)
						);
						state.crops.set(key, crop);
					} else if (block === B.GRASS || block === B.DIRT) {
						const above = world.getBlock(data.x, data.y + 1, data.z);
						if (above !== B.AIR) break;
						const r = Math.random();
						world.setBlock(
							data.x,
							data.y + 1,
							data.z,
							r < 0.5 ? B.TALL_GRASS : r < 0.75 ? B.POPPY : B.DANDELION
						);
					} else {
						break;
					}
					if (!playerHelpers.removeFromInventory(p, I.BONE_MEAL, 1)) break;
					playerHelpers.sendInventory(p);
					break;
				}

				case "chat": {
					if (typeof data.message !== "string") break;
					// Fase 6: los mensajes que empiezan por '/' son comandos de la consola
					// (fuente de verdad del servidor); el resto es chat normal.
					if (data.message.startsWith("/")) {
						commands.executeCommand(p, data.message, {
							state,
							world,
							broadcast,
							playerHelpers,
							crafting,
							viewDistance: p.renderDistance
						});
						break;
					}
					broadcast("chat", {
						id: p.name,
						message: data.message.slice(0, 200)
					});
					break;
				}

				case "tame_mob": {
					// Fase 12 (A1/A3): domesticar — hueso sobre lobo salvaje, pescado
					// crudo sobre ocelote. ~33% por intento (MC real); el ítem se
					// consume solo en el intento, se denomine o no. En éxito: corazones
					// (mob_breed) y el ocelote se vuelve gato.
					const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
					if (!mob) return;
					if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
					const held = p.inventory[p.selectedSlot];
					if (!held) return;
					if (mobs.canTame(mob, held.id) !== "ok") return;
					// Consumir el ítem del intento (hueso/pescado) y tirar la doma.
					if (!playerHelpers.removeFromInventory(p, held.id, 1)) return;
					if (mobs.applyTame(mob, p)) {
						broadcast("mob_breed", { x: mob.x, y: mob.y, z: mob.z });
						broadcast("tame_ok", { id: mob.id, type: mob.type });
					}
					playerHelpers.sendInventory(p);
					break;
				}

				case "sit_pet": {
					// Fase 12 (A1/E10): clic derecho con la mano vacía sobre la
					// mascota propia alterna sentado/levantado (sentada no sigue ni
					// ataca). Solo el dueño puede; se valida distancia y propiedad.
					const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
					if (!mob || mob.ownerId !== p.id) return;
					if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
					mobs.sitPet(mob);
					break;
				}

				case "throw_trident": {
					// Fase 12 (A4/E8): el jugador lanza su tridente (clic derecho) —
					// se retira del inventario, vuela con la física de proyectiles y
					// vuelve al inventario al impactar o expirar (mobs.tickArrows).
					if (mobs.throwPlayerTrident(p)) playerHelpers.sendInventory(p);
					break;
				}

				case "shoot_bow": {
					// Fase 13 (L1): el jugador dispara su arco (clic derecho). El
					// servidor valida que la mano es un arco y que HAY flechas en el
					// inventario; consume 1 flecha, lanza el proyectil (daño 9) y
					// desgasta el arco (BOW_DURABILITY, solo al disparar).
					const held = p.inventory[p.selectedSlot];
					if (!held || held.id !== constants.I.BOW) break;
					if (playerHelpers.countInInventory(p, constants.I.ARROW) < 1) break;
					if (mobs.shootPlayerArrow(p)) {
						const broke = playerHelpers.applyBowWear(p);
						playerHelpers.sendInventory(p);
						if (broke)
							p.ws.send(JSON.stringify({ event: "tool_broke", data: {} }));
					}
					break;
				}

				case "attack_mob": {
					const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
					if (!mob) return;
					// Fase 8 (B10): rango de ataque 7 bloques, alineado con el rayo del
					// cliente (raycaster.far = 7 en input.js). Antes era 4: los clics a
					// 5-7 bloques se descartaban en silencio (el mob no reaccionaba).
					if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 7) return;
					const tool = p.inventory[p.selectedSlot]
						? p.inventory[p.selectedSlot].id
						: 0;
					// Fase 5: daño de espada por material. Fase 13 (paridad B3): sin
					// espada el daño es 1 (mano desnuda, como Minecraft Java 1.9+).
					// Auditoría 2026-08-09 (§3.7): hachas/picos/palas también pegan
					// (TOOL_DAMAGE); lo que no está en ninguna tabla (azada, mano)
					// sigue en 1.
					const dmg = TOOL_DAMAGE[tool] || SWORD_DAMAGE[tool] || 1;
					mob.health -= dmg;
					// Fase 12 (A1/E10): los lobos domados del atacante se unen al
					// golpe (≤12 bloques del objetivo, daño 3 cada uno). Se aplica
					// ANTES de evaluar la muerte para que el golpe conjunto pueda
					// rematar al mob.
					const petsHit = mobs.petsJoinAttack(mob, p);
					// Fase 8 (B10): feedback del golpe para TODOS los que ven el mob —
					// flash de daño y sonido en el cliente (mob_hit). Antes el golpe no
					// producía ninguna reacción visible: el jugador creía que no servía.
					broadcast("mob_hit", {
						id: mob.id,
						dmg: dmg + petsHit * 3,
						health: mob.health
					});
					// Fase 8 (B10): knockback — el mob retrocede un poco en la dirección
					// contraria al atacante (se replica con el próximo mobs_update).
					const dist = Math.max(0.1, Math.hypot(mob.x - p.x, mob.z - p.z));
					mob.x += ((mob.x - p.x) / dist) * 0.6;
					mob.z += ((mob.z - p.z) / dist) * 0.6;
					// Fase 5: las espadas se desgastan al golpear (se rompen al llegar a 0)
					const broke = playerHelpers.applyToolWear(p, true);
					const isSword = !!SWORD_DAMAGE[tool];
					// Fase 9 (Bloque D): al golpear, los PASAVOS huyen del atacante
					// (~4s, dirección contraria) — ver mobs.js mobHit().
					mobs.Mob.prototype.mobHit.call(mob, p);
					if (mob.health <= 0) {
						// Fase 13 (C2): hook de muerte por especie — el slime se divide
						// (grande/mediano → 2 hijos del tamaño inferior; el pequeño no).
						// Debe ejecutarse ANTES de marcar alive=false: splitSlime
						// rechaza mobs muertos.
						mob.onDeath();
						mob.alive = false;
						broadcast("mob_death", { id: mob.id });
						// Drops de comida de animales al morir (directo al atacante)
						const drops = mobs.mobDrops(mob);
						if (drops)
							for (const d of drops)
								playerHelpers.addToInventory(p, d.id, d.count);
						// Fase 5: XP por matar mobs (auditoría §4.1: mobXp, slime por tamaño)
						playerHelpers.addXp(p, mobs.mobXp(mob));
						playerHelpers.sendInventory(p);
					} else if (isSword) {
						// Cada golpe de espada desgasta aunque el mob sobreviva:
						// sincronizar la durabilidad del HUD
						playerHelpers.sendInventory(p);
					}
					if (broke) {
						p.ws.send(
							JSON.stringify({
								event: "tool_broke",
								data: { slot: p.selectedSlot }
							})
						);
					}
					break;
				}
			}
		} catch (err) {
			// Auditoría 2026-08-09 (§1.1): ningún error lógico interno de un
			// mensaje puede derribar el proceso. Se registra y se ignora el
			// mensaje; el siguiente reintenta normal.
			console.error(`[net] error en handler de mensaje de ${playerId}:`, err);
		}
	});

	ws.on("close", () => {
		const leaver = state.players.get(playerId);
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
		state.players.delete(playerId);
		// biome-ignore lint/suspicious/noConsole: log de desconexión (operación normal del servidor)
		console.log(
			`🔴 Jugador desconectado: ${leaver ? leaver.name : playerId} (${state.players.size} en línea)`
		);
		broadcast("player_leave", { id: playerId });
		// Fase 17 (A1/C1): en modo menú, al quedarse el servidor sin jugadores
		// se libera el mundo activo y se vuelve al menú (el próximo jugador
		// elige/crea mundo de nuevo).
		if (constants.MENU_MODE && state.players.size === 0) save.releaseWorld();
	});

	ws.on("error", () => {});
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
		broadcast("chat", {
			id: "⚙️ Templo",
			message: "¡Ssst! ¡Flechas!"
		});
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
	const isNight = worldTime() > DAY_CYCLE_MS / 2;
	for (const m of state.mobs) if (m.alive) m.tick(isNight);
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
				return playersArr.some(
					(pl) =>
						Math.hypot(m.x - pl.x, m.z - pl.z) <= DESPAWN_DIST &&
						Math.abs(m.y - pl.y) <= DESPAWN_DIST
				);
			});
		}
	}
	state.mobs = state.mobs.filter((m) => m.alive);
	const mobsData = state.mobs.map(mobs.mobSnapshot);
	const mobsJson = JSON.stringify(mobsData);
	if (mobsJson !== lastMobsJson) {
		lastMobsJson = mobsJson;
		broadcast("mobs_update", mobsData);
	}

	// Fase 9 (Bloque D): proyectiles del esqueleto — avanzar física y enviar.
	const arrows = mobs.tickArrows(TICK_MS);
	if (arrows.length) broadcast("arrows_update", arrows.map(mobs.arrowSnapshot));

	// Fase 12 (Bloque B): trampa de los templos de jungla — al pisar el
	// pasadizo se disparan flechas (con cooldown por templo).
	tickTempleTraps();

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

	// Minería (Fase 6): avanza las sesiones de rotura (dureza/velocidad); al
	// completarse se rompe el bloque (drop condicional, XP, desgaste). Las
	// grietas (block_break_progress) se hacen broadcast a TODOS los que vean
	// el bloque (Fase 7): no solo el minero ve el progreso de rotura.
	for (const p of state.players.values()) {
		if (p.inMenu) continue;
		if (p.mining)
			mining.tickMining(p, TICK_MS, world, playerHelpers, broadcastMining);
	}

	// Spawn de mobs por fase del día (Fase 6): de día solo pasivos, de noche
	// también hostiles, en cualquier chunk cargado del área de render.
	if (Math.random() < 0.03) mobs.spawnMobs(isNight);

	// Fase 14 (M5/C5): relleno progresivo del radio de render. El init ya no
	// envía los ~169 chunks de golpe: genera un lote por tick y jugador y los
	// envía como chunks_add, sin bloquear el bucle. ensureChunksAround es
	// idempotente (los chunks del movimiento/settings antiguos no se regeneran)
	// y aquí solo se procesan los de dentro del radio NO generados aún.
	for (const p of state.players.values()) {
		if (p.inMenu) continue; // Fase 17 (A1): el menú no genera chunks
		if (p.ws.readyState !== WebSocket.OPEN) continue;
		const pcx = Math.floor(p.x / constants.CHUNK_SIZE),
			pcz = Math.floor(p.z / constants.CHUNK_SIZE);
		// Lista de claves del radio de render que faltan por generar
		// (Chebyshev, misma malla que sendInit y que el filtro del cliente).
		// Ordenadas por distancia Chebyshev (anillos): los chunks más cercanos
		// se rellenan PRIMERO y el terreno se "va ladrando" desde el jugador
		// hacia fuera, en vez de aparecer un cuadrado de bloques arbitrario.
		const missing = [];
		for (let dx = -p.renderDistance; dx <= p.renderDistance; dx++) {
			for (let dz = -p.renderDistance; dz <= p.renderDistance; dz++) {
				const key = `${pcx + dx},${pcz + dz}`;
				if (!state.chunks.has(key))
					missing.push({ key, ring: Math.max(Math.abs(dx), Math.abs(dz)) });
			}
		}
		missing.sort((a, b) => a.ring - b.ring);
		if (missing.length === 0) continue;
		const batch = missing.slice(0, CHUNK_FILL_PER_TICK);
		const DATA = {};
		for (const { key } of batch) {
			const [cx, cz] = key.split(",").map(Number);
			world.generateChunk(cx, cz); // idempotente (cachea en state.chunks)
			DATA[key] = Array.from(state.chunks.get(key));
		}
		p.ws.send(
			JSON.stringify({ event: "chunks_add", data: { chunkData: DATA } })
		);
	}

	// Fase 10 (D2): mechas de TNT (explotan al agotarse — cráter + cadena).
	tnt.tick(TICK_MS);

	crafting.tickFurnaces();
	for (const [key, f] of state.furnaces) {
		// Notificar a quien tenga ese horno abierto
		for (const p of state.players.values()) {
			if (p.openFurnace === key && p.ws.readyState === WebSocket.OPEN) {
				p.ws.send(
					JSON.stringify({
						event: "furnace_state",
						data: { key, ...crafting.furnaceSnapshot(f) }
					})
				);
			}
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
		broadcast("server_metrics", {
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

function start() {
	const server = http.createServer(app);
	// Fase 8 (mejora documentada): límite explícito de tamaño de mensaje
	// entrante (la librería ws usa ~100 MiB por defecto). Los mensajes del
	// protocolo son pequeños (moves, chat ≤200 chars, block_action), así que
	// 1 MiB basta para impedir que un cliente malicioso sature la memoria
	// del servidor con payloads gigantes (ws cierra la conexión con 1009).
	const wss = new WebSocket.Server({ server, maxPayload: WS_MAX_PAYLOAD });
	wss.on("connection", handleConnection);

	setInterval(mainLoop, TICK_MS);

	server.listen(PORT, () => {
		// biome-ignore lint/suspicious/noConsole: banner de arranque del servidor
		console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
		// biome-ignore lint/suspicious/noConsole: banner de arranque del servidor
		// Fase 17 (A1): sin SEED el banner muestra el modo menú.
		console.log(
			constants.MENU_MODE && !constants.worldPaths.currentSeed
				? "🗂️ Modo menú: sin mundo activo (los jugadores eligen/crean mundo)."
				: `🌍 Semilla: ${constants.worldPaths.currentSeed}  |  📦 Chunks: ${state.chunks.size}  |  🧟 Mobs: ${state.mobs.length}`
		);
	});
}

// handleConnection y mainLoop se exportan para tests unitarios (unit-red.js usa
// un ws fake para ejercitar los handlers; unit-metricas.js mide el tick).
module.exports = {
	broadcast,
	broadcastNear,
	handleConnection,
	mainLoop,
	getServerMetrics,
	start
};
