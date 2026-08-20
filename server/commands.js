"use strict";

// ============================================================
// COMANDOS (Fase 6): consola básica vía chat (/help, /tp, /give,
// /time set, /gamemode). El servidor es la fuente de verdad: cada
// comando muta el estado del servidor y sincroniza al cliente con
// los eventos existentes (teleport, inventory_update, time_set,
// chunks_add, chat de sistema). Los mensajes de sistema van solo
// al emisor; el chat normal (sin /) sigue igual.
// ============================================================
const WebSocket = require("ws");
const log = require("./log.js");
const constants = require("./constants.js");
// Fase 21.5 (G1): estructuras (para /locate) y mobs (para /summon). No hay
// ciclo: estructuras/mobs no requieren commands.js (lo carga actions.js).
const structures = require("./structures.js");
const mobs = require("./mobs.js");
const {
	B,
	I,
	DAY_CYCLE_MS,
	DAY_PHASES, // Fase 18 (C-1): franjas MC — /time set night = inicio de la noche estricta
	MOON_CYCLE_MS,
	seedMoonOffsetMs,
	WORLD_MIN_Y,
	WORLD_MAX_Y,
	isTool,
	NOT_MINEABLE,
	MAX_STACK
} = constants;

// Índice nombre -> ID: claves de B/I en minúsculas (wooden_pickaxe, diamond,
// stone...) + alias en español (pico_de_madera, diamante, piedra...).
const NAME_TO_ID = {};
for (const [k, v] of Object.entries(B))
	if (typeof v === "number" && v !== B.AIR) NAME_TO_ID[k.toLowerCase()] = v;
for (const [k, v] of Object.entries(I))
	if (typeof v === "number") NAME_TO_ID[k.toLowerCase()] = v;
Object.assign(NAME_TO_ID, {
	// Bloques
	tierra: B.DIRT,
	cesped: B.GRASS,
	piedra: B.STONE,
	tronco: B.OAK_LOG,
	madera: B.OAK_LOG,
	hojas: B.OAK_LEAVES,
	arena: B.SAND,
	tablones: B.PLANKS,
	adoquin: B.COBBLESTONE,
	mineral_de_carbon: B.COAL_ORE,
	mineral_de_hierro: B.IRON_ORE,
	mineral_de_oro: B.GOLD_ORE,
	mineral_de_diamante: B.DIAMOND_ORE,
	mineral_de_redstone: B.REDSTONE_ORE,
	mineral_de_esmeralda: B.EMERALD_ORE,
	mesa_de_crafteo: B.CRAFTING_TABLE,
	crafteo: B.CRAFTING_TABLE,
	horno: B.FURNACE,
	vidrio: B.GLASS,
	lana: B.WOOL,
	bedrock: B.BEDROCK,
	agua: B.WATER,
	nieve: B.SNOW,
	// Ítems
	palo: I.STICK,
	carbon: I.COAL,
	lingote_de_hierro: I.IRON_INGOT,
	hierro: I.IRON_INGOT,
	lingote_de_oro: I.GOLD_INGOT,
	oro: I.GOLD_INGOT,
	diamante: I.DIAMOND,
	redstone: I.REDSTONE,
	esmeralda: I.EMERALD,
	carne_de_vaca: I.BEEF,
	carne_de_cerdo: I.PORKCHOP,
	pollo_crudo: I.CHICKEN,
	cordero_crudo: I.MUTTON,
	filete: I.COOKED_BEEF,
	cerdo_cocinado: I.COOKED_PORKCHOP,
	pollo_asado: I.COOKED_CHICKEN,
	cordero_asado: I.COOKED_MUTTON,
	trigo: I.WHEAT,
	zanahoria: I.CARROT,
	semillas: I.SEEDS,
	conejo: I.RABBIT,
	conejo_asado: I.COOKED_RABBIT,
	hilo: I.STRING,
	// Herramientas
	pico_de_madera: I.WOODEN_PICKAXE,
	pico_de_piedra: I.STONE_PICKAXE,
	pico_de_hierro: I.IRON_PICKAXE,
	pico_de_oro: I.GOLDEN_PICKAXE,
	pico_de_diamante: I.DIAMOND_PICKAXE,
	hacha_de_madera: I.WOODEN_AXE,
	hacha_de_piedra: I.STONE_AXE,
	hacha_de_hierro: I.IRON_AXE,
	hacha_de_oro: I.GOLDEN_AXE,
	hacha_de_diamante: I.DIAMOND_AXE,
	pala_de_madera: I.WOODEN_SHOVEL,
	pala_de_piedra: I.STONE_SHOVEL,
	pala_de_hierro: I.IRON_SHOVEL,
	pala_de_oro: I.GOLDEN_SHOVEL,
	pala_de_diamante: I.DIAMOND_SHOVEL,
	espada_de_madera: I.WOODEN_SWORD,
	espada_de_piedra: I.STONE_SWORD,
	espada_de_hierro: I.IRON_SWORD,
	espada_de_oro: I.GOLDEN_SWORD,
	espada_de_diamante: I.DIAMOND_SWORD
});
const ALL_IDS = new Set(Object.values(NAME_TO_ID));

const HELP = [
	"/help — lista de comandos",
	"/tp <x> <y> <z> — teletransportarte a unas coordenadas (solo operadores)",
	"/give <item> [cantidad] — añade items al inventario (ID numérico o nombre, ej. 4, diamante, wooden_pickaxe) (solo operadores)",
	"/time set <day|noon|night|midnight|ms> — fija la hora del mundo (0-239999 ms) (solo operadores)",
	"/gamemode <creative|survival> — cambia el modo de juego (creative: sin hambre ni daño) (solo operadores)",
	"/op <nombre> — otorga permisos de operador a un jugador conectado (solo operadores)",
	"/kill [@s|@p|@a|@e|@r|nombre|mobs] — elimina jugadores (selectores o nombres) o criaturas con @e/mobs (solo operadores)",
	"/summon <mob> [x y z] — invoca un mob (solo operadores)",
	"/effect <give absorption [cantidad]|clear|get> [@s|@p|@a|@r|nombre] — gestiona efectos (solo operadores)",
	"/locate <estructura|bioma> — encuentra la estructura (well/pyramid/temple/shipwreck) o bioma más cercano",
	"/reload — recarga recetas (recetas.json, recetas_horno.json) y el atlas del cliente (solo operadores)",
	"Selectores: @s emisor · @p más cercano · @a todos · @e todas las criaturas · @r aleatorio",
	"Los comandos con (solo operadores) los ejecuta el host (primer jugador) o la lista OPS (env var OPS)"
].join("\n");

// Guía rápida para jugadores (se envía con /help en el chat, además de la
// lista de comandos). Controles espejo de la pestaña Controles de Ajustes y
// de la pantalla ❓ Ayuda del menú; la guía completa vive en
// docs/public/help.md (jugador) y docs/server/help.md (administración).
const CONTROLS_HELP =
	"\nControles: WASD mover · Espacio saltar · Shift agacharse · Click izq romper · Click der colocar/usar · E inventario · B recetas · Enter chat · F3 depuración · F11 pantalla completa";

// Comandos que mutan el mundo o al jugador: solo para OPERADORES (el primer
// jugador conectado o la lista OPS, ver net.js). /help y el chat normal
// siguen abiertos a todos. Fase 7 (auditoría): antes cualquier jugador podía
// darse todo en creative (/give, /gamemode) y cambiar la hora para todos.
const OP_ONLY = new Set([
	"tp",
	"give",
	"time",
	"gamemode",
	"reload",
	"op",
	"kill",
	"summon",
	"effect"
]);

function systemMessage(player, text) {
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(
			JSON.stringify({ event: "chat", data: { id: "Server", message: text } })
		);
	}
}

// Reloj del mundo: (tiempo real + offset) % ciclo. El offset lo ajusta
// /time set; el resto del servidor usa esta misma función (net.js) para
// que día/noche, ambiente y IA de mobs sigan al reloj ajustado.
function worldTime(state) {
	return (Date.now() + (state.timeOffset || 0)) % DAY_CYCLE_MS;
}

// Fase 8 (B8): reloj de la LUNA en ms dentro del ciclo lunar de 8 días.
// Mismo reloj base que worldTime (Date.now() + timeOffset) + offset
// determinista de la semilla: todos los jugadores ven la misma fase en el
// mismo instante y el reinicio del servidor conserva la fase correcta.
// `timeOffset` desplaza el reloj entero, así que /time set también mueve la
// fase lunar (fiel a Minecraft). Se envía ya con el offset aplicado para que
// el cliente no necesite la función de hash.
function moonTime(state) {
	const seed = constants.worldPaths.currentSeed || "";
	return (
		(Date.now() + (state.timeOffset || 0) + seedMoonOffsetMs(seed)) %
		MOON_CYCLE_MS
	);
}

function parseId(tok) {
	if (/^\d+$/.test(tok)) return ALL_IDS.has(Number(tok)) ? Number(tok) : null;
	return NAME_TO_ID[tok.toLowerCase().replace(/[\s-]+/g, "_")] ?? null;
}

// ============================================================
// SELECTORES DE OBJETIVO (Fase 21.5, G1)
// Resolución de @s/@p/@a/@r (jugadores) y @e (mobs) en el handler, como MC.
//  - @s → el emisor; @p → el jugador más cercano al emisor; @a → TODOS los
//    jugadores conectados; @r → un jugador aleatorio (excluye al emisor si
//    hay otro). @e → todas las criaturas vivas (state.mobs).
// El resto de tokens se interpretan como nombre de jugador (búsqueda por
// nombre, sin distinguir mayúsculas). Devuelve { players: [], mobs: false }.
// ============================================================
function resolveTargets(tok, player, state) {
	const t = (tok || "").trim();
	const allPlayers = [...state.players.values()];
	const playersList = [];
	switch (t) {
		case "@s":
			return { players: [player] };
		case "@p": {
			// Distancia en 2D (horizontal): el más cercano en el plano XZ,
			// incluye al propio emisor (MC: @p siempre apunta al más cercano).
			let best = null,
				bestD = Infinity;
			for (const q of allPlayers) {
				const d = Math.hypot(q.x - player.x, q.z - player.z);
				if (d < bestD) {
					bestD = d;
					best = q;
				}
			}
			return { players: best ? [best] : [] };
		}
		case "@a":
			return { players: allPlayers };
		case "@r": {
			const pool = allPlayers.filter((q) => q !== player);
			if (pool.length === 0) return { players: [] };
			const rnd = Math.floor(Math.random() * pool.length);
			return { players: [pool[rnd]] };
		}
		case "@e":
			return { players: [], mobs: true };
		default: {
			if (t === "") return { players: [player] }; // sin argumento → el emisor
			return {
				players: allPlayers.filter(
					(q) => (q.name || "").toLowerCase() === t.toLowerCase()
				)
			};
		}
	}
}

// ============================================================
// /locate (Fase 21.5, G1): búsqueda determinista de la estructura más
// cercana reusando la localización por celda con hash 2D con sal de
// structures.js (mismo esquema que genera el mundo: F12 templo/naufragio,
// F21 pozo/pirámide). Escanea anillos de celdas alrededor del jugador y
// devuelve el centro más próximo (validado por el filtro de bioma que ya
// aplica cada función). El corte `(r-1)*cell < bestDist` garantiza que un
// anillo más lejano no puede contener algo más cercano.
// ============================================================
const LOCATE_STRUCTURES = {
	well: { cell: 40, fn: structures.wellCenterAt },
	pyramid: { cell: 48, fn: structures.pyramidCenterAt },
	temple: { cell: 32, fn: structures.structCenterAt, type: "temple" },
	shipwreck: { cell: 32, fn: structures.structCenterAt, type: "shipwreck" }
};
const LOCATE_MAX_RINGS = 64; // celdas (~40·64 = 2560 bloques máx. de barrido)

function locateStructure(type, wx, wz) {
	const cfg = LOCATE_STRUCTURES[type];
	if (!cfg) return null;
	const pcx = Math.floor(wx / cfg.cell),
		pcz = Math.floor(wz / cfg.cell);
	let best = null,
		bestDist = Infinity;
	for (let r = 1; r <= LOCATE_MAX_RINGS && (r - 1) * cfg.cell < bestDist; r++) {
		for (let i = -r; i <= r; i++) {
			const edges = [
				[pcx + i, pcz - r],
				[pcx + i, pcz + r],
				[pcx - r, pcz + i],
				[pcx + r, pcz + i]
			];
			for (let e = 0; e < 4; e++) {
				const c = cfg.fn(edges[e][0], edges[e][1]);
				if (!c) continue;
				if (cfg.type && c.type !== cfg.type) continue;
				const d = Math.hypot(c.cx - wx, c.cz - wz);
				if (d < bestDist) {
					bestDist = d;
					best = c;
				}
			}
		}
	}
	return best;
}

// Bioma más cercano: escanea una cuadrícula de puntos (paso 8 bloques, media
// celda de chunk) en espiral alrededor del jugador. getBiome es determinista
// (solo ruido + umbrales), así que el resultado es estable entre reinicios.
const LOCATE_BIOMES = [
	"plains",
	"forest",
	"birch_forest",
	"jungle",
	"swamp",
	"desert",
	"badlands",
	"taiga",
	"giant_taiga",
	"snow",
	"snowy_peaks",
	"mountain"
];
const LOCATE_BIOME_RADIUS = 1024; // bloques

const biomes = require("./biomes.js");

function locateBiome(name, wx, wz) {
	const target = name.toLowerCase();
	if (!LOCATE_BIOMES.includes(target)) return null;
	let best = null,
		bestDist = Infinity;
	const step = 8;
	for (let r = step; r <= LOCATE_BIOME_RADIUS && r - step < bestDist; r += step) {
		for (let i = -r; i <= r; i += step) {
			const edges = [
				[wx + i, wz - r],
				[wx + i, wz + r],
				[wx - r, wz + i],
				[wx + r, wz + i]
			];
			for (let e = 0; e < 4; e++) {
				if (Math.hypot(edges[e][0] - wx, edges[e][1] - wz) >= bestDist) continue;
				if (biomes.getBiome(edges[e][0], edges[e][1]) !== target) continue;
				const d = Math.hypot(edges[e][0] - wx, edges[e][1] - wz);
				if (d < bestDist) {
					bestDist = d;
					best = { x: edges[e][0], z: edges[e][1] };
				}
			}
		}
	}
	return best;
}

// Devuelve true si `raw` era un comando (se procesó) y false si es chat
// normal. ctx = { state, world, broadcast, playerHelpers, viewDistance }.
function executeCommand(player, raw, ctx) {
	if (typeof raw !== "string" || !raw.startsWith("/")) return false;
	const { state, world, broadcast, playerHelpers } = ctx;
	const parts = raw.slice(1).trim().split(/\s+/);
	const cmd = parts[0].toLowerCase();
	const args = parts.slice(1);

	// Permisos: los comandos de operador se rechazan con un aviso de sistema
	// (el cliente los muestra en el chat) sin tocar nada.
	if (OP_ONLY.has(cmd) && !player.isOp) {
		systemMessage(
			player,
			"Ese comando es solo para operadores (el host o la lista OPS)"
		);
		return true;
	}
	// Auditoría 2026-08-15 (B3): cada comando de operador ejecutado se deja
	// en el log del servidor (quién hizo qué y con qué argumentos). Antes la
	// consola no registraba ninguna acción administrativa: sin rastro
	// auditable de /give, /tp, /op, etc. Los comandos rechazados NO se
	// registran (se atajan en el guard anterior).
	if (OP_ONLY.has(cmd)) {
		log.info(`${player.name} ejecutó /${cmd} ${args.join(" ")} (es operador)`);
	}

	switch (cmd) {
		case "help":
			systemMessage(player, HELP + CONTROLS_HELP);
			break;

		case "kill": {
			// Fase 10 (B3): /kill [objetivo] — solo operadores; sin objetivo, al
			// emisor. Usa respawnPlayer directamente (funciona en creative, donde
			// damagePlayer se ignora) y respeta el respawn por gamemode.
			// Fase 13 (cierre): `/kill mobs` elimina TODAS las criaturas vivas
			// (herramienta dev para liberar el tope de spawn de 30 mobs cuando
			// el mundo se llena; la usa e2e-mascotas para que el lobo de taiga
			// tenga hueco). El bucle principal difunde el snapshot vacío.
			// Fase 21.5 (G1): selectores @s/@p/@a/@e/@r + nombre de jugador.
			const target = (args[0] || "").trim();
			if (target.toLowerCase() === "mobs") {
				state.mobs = state.mobs.filter((m) => !m.alive);
				systemMessage(
					player,
					`🧟 ${state.mobs.length === 0 ? "Sin" : state.mobs.length} criaturas vivas en el mundo.`
				);
				break;
			}
			const resolved = resolveTargets(target, player, state);
			if (resolved.mobs) {
				state.mobs = state.mobs.filter((m) => !m.alive);
				const remaining = state.mobs.length;
				systemMessage(
					player,
					`💨 ${remaining === 0 ? "Sin" : remaining} criaturas vivas en el mundo.`
				);
				break;
			}
			if (resolved.players.length === 0) {
				systemMessage(player, `No hay ningún jugador «${target}» conectado.`);
				break;
			}
			for (const t of resolved.players) {
				ctx.playerHelpers.respawnPlayer(t, "kill");
			}
			const who =
				resolved.players.length === 1 &&
				resolved.players[0] === player
					? "Te has eliminado"
					: `${resolved.players.map((t) => t.name).join(", ")} ${resolved.players.length === 1 ? "ha sido eliminado" : "han sido eliminados"}`;
			systemMessage(player, `💀 ${who}.`);
			break;
		}

		case "summon": {
			// Fase 21.5 (G1): invoca un mob en la posición del jugador (o en las
			// coordenadas opcionales). El tick del servidor (mobs_update) lo
			// difunde a los clientes en el siguiente ciclo, igual que los spawns
			// naturales. Solo acepta especies del MOB_CLASSES real.
			const name = (args[0] || "").toLowerCase();
			if (!Object.prototype.hasOwnProperty.call(mobs.MOB_CLASSES, name)) {
				systemMessage(
					player,
					`Mob desconocido: ${args[0] || ""}. Disponibles: ${Object.keys(mobs.MOB_CLASSES).join(", ")}`
				);
				break;
			}
			let x = player.x,
				y = player.y + 1.5,
				z = player.z;
			if (
				args.length >= 4 &&
				args.slice(1, 4).every((a) => /^-?\d+(\.\d+)?$/.test(a))
			) {
				x = parseFloat(args[1]);
				y = parseFloat(args[2]);
				z = parseFloat(args[3]);
			} else {
				// Sin coordenadas: 2 bloques hacia donde mira el jugador (yaw en
				// radianes de Three.js, mirada base −Z).
				const dx = -Math.sin(player.yaw || 0),
					dz = -Math.cos(player.yaw || 0);
				x = player.x + dx * 2;
				z = player.z + dz * 2;
			}
			const mob = mobs.createMob(name, x, y, z);
			state.mobs.push(mob);
			systemMessage(
				player,
				`✨ ${name} invocado en ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}`
			);
			break;
		}

		case "locate": {
			// Fase 21.5 (G1): /locate <structure|biome|lista> — devuelve el
			// centro de la estructura o la celda del bioma más cercanos.
			const what = (args[0] || "").toLowerCase();
			if (!what || what === "lista" || what === "help") {
				systemMessage(
					player,
					`Uso: /locate <estructura|bioma> — estructuras: ${Object.keys(LOCATE_STRUCTURES).join(", ")} · biomas: ${LOCATE_BIOMES.join(", ")}`
				);
				break;
			}
			if (what.startsWith("b") || LOCATE_BIOMES.includes(what)) {
				const found = locateBiome(what, player.x, player.z);
				systemMessage(
					player,
					found
						? `🌍 Bioma ${what}: ${Math.round(found.x)}, ${Math.round(found.z)} (a ${Math.round(Math.hypot(found.x - player.x, found.z - player.z))} bloques)`
						: `No encontré bioma «${what}». Prueba /locate lista`
				);
				break;
			}
			const found = locateStructure(what, player.x, player.z);
			systemMessage(
				player,
				found
					? `🏛️ ${what} encontrado en ${Math.round(found.cx)}, ${Math.round(found.cz)} (a ${Math.round(Math.hypot(found.cx - player.x, found.cz - player.z))} bloques)`
					: `No encontré estructura «${what}» en un radio razonable. Usa /locate lista`
			);
			break;
		}

		case "effect": {
			// Fase 21.5 (G1): /effect give|clear <efecto> [cantidad] — el juego
			// tiene absorción (tótem, Fase 21.5 C3) como efecto de estado con
			// HUD propio (corazones dorados); es el único efecto implementado y
			// por eso es el único invocable. give suma HP de absorción; clear
			// la quita. Objetivo por selector @s (por defecto el emisor).
			const action = (args[0] || "").toLowerCase();
			const what = (args[1] || "").toLowerCase();
			const rest = args.slice(2); // [cantidad?, @selector?] en cualquier orden
			const selIdx = rest.findIndex((a) => a.startsWith("@"));
			const targetTok = selIdx >= 0 ? rest[selIdx] : "@s";
			const amountTok =
				selIdx >= 0 ? rest.find((a, i) => i !== selIdx) : rest[0];
			const resolved = resolveTargets(targetTok, player, state);
			if (resolved.mobs || resolved.players.length === 0) {
				systemMessage(player, "No hay un jugador objetivo válido.");
				break;
			}
			if (action === "clear") {
				for (const t of resolved.players) {
					t.absorption = 0;
					ctx.playerHelpers.sendHealth(t);
				}
				systemMessage(
					player,
					`🧪 Efectos limpiados a ${resolved.players.map((t) => t.name).join(", ")}.`
				);
				break;
			}
			if (action === "get") {
				const t = resolved.players[0];
				systemMessage(
					player,
					`${t.name}: absorción ${t.absorption || 0} HP (efectos: ${t.absorption ? "absorption" : "ninguno"})`
				);
				break;
			}
			if (action === "give" && what === "absorption") {
				const amount = Math.min(
					40,
					Math.max(0, parseInt(amountTok, 10) || 0) +
						(resolved.players[0].absorption || 0)
				);
				for (const t of resolved.players) t.absorption = amount;
				for (const t of resolved.players) ctx.playerHelpers.sendHealth(t);
				systemMessage(
					player,
					`✨ Absorción ${amount} HP dada a ${resolved.players.map((t) => t.name).join(", ")}.`
				);
				break;
			}
			systemMessage(
				player,
				"Uso: /effect <give absorption [cantidad]|clear|get> [@s|@p|@a|@r|nombre]"
			);
			break;
		}

		case "tp": {
			if (args.length < 3 || args.some((a) => !/^-?\d+(\.\d+)?$/.test(a))) {
				systemMessage(player, "Uso: /tp <x> <y> <z>");
				break;
			}
			const tx0 = parseFloat(args[0]),
				ty0 = parseFloat(args[1]),
				tz0 = parseFloat(args[2]);
			// SV-6 (C6): /tp se sujeta a los bordes del mundo (mismo clamp que el
			// move handler) — antes se podía teletransportar fuera del mapa y
			// quedar en el vacío. `half` es media arista del mundo (256/512/...).
			const half = constants.worldHalfExtent();
			const tx = Math.max(-half + 0.6, Math.min(half - 0.6, tx0));
			const tz = Math.max(-half + 0.6, Math.min(half - 0.6, tz0));
			const ty = ty0;
			const fx = Math.floor(tx),
				fz = Math.floor(tz);
			// Cargar el chunk destino ANTES de validar, para no teletransportar a
			// un punto dentro de un sólido (getBlock devuelve aire en chunk no generado).
			world.ensureChunksAround(fx, fz, 1);
			const ground = world.getHeight(fx, fz) + 1; // superficie (top del bloque sólido)
			let y = ty;
			const feet = world.getBlock(fx, Math.floor(y), fz);
			const head = world.getBlock(fx, Math.floor(y + 1.5), fz);
			if (feet !== B.AIR || head !== B.AIR || y < WORLD_MIN_Y + 1) y = ground; // sólido/agua/void → superficie
			// En un lago, getHeight no conoce el nivel del agua: subir hasta salir
			// de ella para que el jugador nunca aparezca nadando (como findSpawn).
			while (
				world.getBlock(fx, Math.floor(y), fz) === B.WATER &&
				y < WORLD_MAX_Y
			)
				y++;
			// SV-6: tampoco por encima del límite superior del mundo.
			if (y > WORLD_MAX_Y) y = WORLD_MAX_Y;
			player.x = tx;
			player.y = y;
			player.z = tz;
			player.lastMoveTime = Date.now();
			player.fallFromY = null; // teletransportarse no es caerse (Fase 7)
			player.lastGroundY = null;
			// Fase 16 (C3): el /tp salta la posición — la ventana de velocidad
			// horizontal no debe heredar muestras de la posición anterior.
			player.speedSamples = [];
			// Fase 10 (A5): fix "el mundo deja de cargar" tras un /tp lejano.
			// 1) El TELEPORT se envía ANTES que los chunks: loadChunkData del
			//    cliente filtra por withinRenderDistance(cámara) y, si la cámara
			//    aún está en el origen, DESCARTA todos los chunks nuevos (bug).
			// 2) No se generan los 169 chunks del viewDistance de golpe (bloquea
			//    el servidor síncronamente): solo el radio 2; el streaming del
			//    move handler carga el resto al moverse (como en el juego normal).
			player.ws.send(
				JSON.stringify({
					event: "teleport",
					data: { x: player.x, y: player.y, z: player.z }
				})
			);
			const fresh = world.ensureChunksAround(tx, tz, 2);
			if (fresh.length) {
				const extra = {};
				// Defensivo (bug de semilla): nunca Array.from de un chunk que
				// pueda no estar cacheado (fuera de bordes → undefined).
				for (const key of fresh) {
					const arr = state.chunks.get(key);
					if (arr) extra[key] = Array.from(arr);
				}
				player.ws.send(
					JSON.stringify({ event: "chunks_add", data: { chunkData: extra } })
				);
			}
			broadcast(
				"player_move",
				{
					id: player.id,
					x: player.x,
					y: player.y,
					z: player.z,
					yaw: player.yaw,
					pitch: player.pitch
				},
				player.id
			);
			systemMessage(
				player,
				`Teletransportado a ${tx.toFixed(1)}, ${y.toFixed(1)}, ${tz.toFixed(1)}`
			);
			break;
		}

		case "give": {
			if (args.length < 1) {
				systemMessage(player, "Uso: /give <item> [cantidad]");
				break;
			}
			const id = parseId(args[0]);
			if (id == null) {
				systemMessage(
					player,
					`Item desconocido: ${args[0]} (usa un ID numérico o un nombre, ej. 4, diamante, wooden_pickaxe)`
				);
				break;
			}
			// No se pueden obtener bloques no removibles (bedrock, agua): colocarlos
			// dejaría estado permanente/ingriefable en el mundo de todos.
			if (NOT_MINEABLE.has(id)) {
				systemMessage(
					player,
					`No puedes obtener ${args[0]}: es un bloque no rompible (bedrock o agua)`
				);
				break;
			}
			// SV-5 (C6): /give con tope de stack 64 (paridad MC) — antes se podía
			// pedir 999 y meter un stack infinito en un slot. Las herramientas y
			// la armadura siguen siendo 1 (no apilan; addToInventory lo ignora).
			const count = Math.max(
				1,
				Math.min(MAX_STACK, parseInt(args[1], 10) || 1)
			);
			if (!playerHelpers.addToInventory(player, id, count)) {
				systemMessage(player, "Inventario lleno");
				break;
			}
			playerHelpers.sendInventory(player);
			systemMessage(
				player,
				`+${isTool(id) ? 1 : count} × ${args[0]} (ID ${id})`
			);
			break;
		}

		case "time": {
			const sub = (args[0] || "").toLowerCase();
			const targets = {
				day: 0,
				noon: DAY_CYCLE_MS / 4,
				// Fase 18 (C-1): "night" ahora es el INICIO de la noche ESTRICTA
				// (duskEnd, 65%) y no la mitad del ciclo (50%, que con las franjas
				// MC cae en el ATARDECER y no spawneaba hostiles — regresión C-1
				// detectada por e2e-mascotas). midnight sigue en la noche (75%).
				night: DAY_CYCLE_MS * DAY_PHASES.duskEnd,
				midnight: (DAY_CYCLE_MS * 3) / 4
			};
			let target;
			if (sub === "set") {
				const val = (args[1] || "").toLowerCase();
				if (val in targets) target = targets[val];
				else if (/^\d+$/.test(val))
					target = Math.min(DAY_CYCLE_MS - 1, Number(val));
			}
			if (target === undefined) {
				systemMessage(
					player,
					"Uso: /time set <day|noon|night|midnight|ms 0-239999>"
				);
				break;
			}
			state.timeOffset =
				(target - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
			const t = worldTime(state);
			// Fase 8 (B8): time_set también re-sincroniza la fase lunar (moonTime
			// ya incluye el offset de semilla, así el cliente no necesita el hash).
			broadcast("time_set", { dayTime: t, moonTime: moonTime(state) });
			systemMessage(
				player,
				`Hora fijada a ${Math.round(t)} ms del ciclo (${
					t >= DAY_CYCLE_MS * DAY_PHASES.duskEnd ? "noche" : "día"
				})`
			);
			break;
		}

		case "gamemode": {
			const mode = (args[0] || "").toLowerCase();
			if (mode === "creative" || mode === "1") player.gamemode = "creative";
			else if (mode === "survival" || mode === "0")
				player.gamemode = "survival";
			else {
				systemMessage(player, "Uso: /gamemode <creative|survival>");
				break;
			}
			systemMessage(
				player,
				`Modo de juego: ${player.gamemode} (${player.gamemode === "creative" ? "sin hambre ni daño" : "supervivencia"})`
			);
			break;
		}

		case "op": {
			// Otorgar permisos de operador a otro jugador CONECTADO (por nombre,
			// como en Minecraft /op). Solo un operador puede dar permisos.
			// La búsqueda ignora mayúsculas, igual que la lista OPS (env var).
			const target = args[0];
			const t = target
				? Array.from(state.players.values()).find(
						(q) => (q.name || "").toLowerCase() === target.toLowerCase()
					)
				: null;
			if (!t) {
				systemMessage(player, `Uso: /op <nombre> (debe estar conectado)`);
				break;
			}
			t.isOp = true;
			systemMessage(player, `+ ${t.name} ahora es operador`);
			break;
		}

		case "reload": {
			// Fase 6: hot-reload sin reiniciar el servidor. Recarga recetas desde
			// disco (swap atómico: si el archivo es inválido se mantienen las
			// anteriores) y pide a todos los clientes regenerar el atlas.
			if (!ctx.crafting) {
				systemMessage(player, "Reload no disponible en este contexto");
				break;
			}
			const r = ctx.crafting.reloadRecipes();
			if (r.ok) {
				broadcast("textures_reload", {});
				systemMessage(
					player,
					`♻️ Recetas recargadas (${r.crafting} crafteo, ${r.furnace} horno) y atlas solicitado`
				);
			} else {
				systemMessage(
					player,
					`⚠️ Recetas NO recargadas: ${r.error} (se mantienen las anteriores)`
				);
			}
			break;
		}

		default:
			systemMessage(
				player,
				`Comando desconocido: /${cmd}. Escribe /help para ver los disponibles.`
			);
	}
	return true;
}

module.exports = { executeCommand, worldTime, moonTime, resolveTargets };
