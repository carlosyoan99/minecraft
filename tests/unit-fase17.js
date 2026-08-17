"use strict";
// ============================================================
// TESTS UNITARIOS DE LA FASE 17
// Cubre: A1/A5 (modo menú: menu_state → join_world → init →
// leave_world → menu_state), B1 (persistencia del jugador por
// nombre), B4 (romper el bloque bajo una planta la destruye con
// su drop), B6 (los hostiles no agreden a jugadores en creativo)
// y B5 (cuevas: pocas pero grandes — % excavado y conectividad
// en una muestra determinista).
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Reporter, withRandom } = require("./helpers.js");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fase17-"));
const constants = require("../server/constants.js");
// I/O aislado en un directorio temporal (NUNCA toca el world/ real).
constants.worldPaths.worldRoot = path.join(TMP, "worldroot");
constants.setWorldSeed(null, null); // empieza en modo menú (sin mundo activo)

const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const save = require("../server/save.js");
const mobs = require("../server/mobs.js");
const playerHelpers = require("../server/players.js");
const { B, I } = constants;

// Generación sin I/O de disco (los chunks se quedan en memoria); la
// persistencia B1 SÍ usa el disco temporal.
world.setDiskLoader(() => null);
const r = new Reporter();

// --- ws fake: captura mensajes salientes y permite inyectar entrantes ---
class FakeWS {
	constructor() {
		this.sent = [];
		this.handlers = {};
		this.readyState = 1; // WebSocket.OPEN
	}
	send(str) {
		this.sent.push(JSON.parse(str));
	}
	on(ev, fn) {
		this.handlers[ev] = fn;
	}
	emit(ev, data) {
		if (this.handlers[ev]) this.handlers[ev](data);
	}
	events(name) {
		return this.sent.filter((m) => m.event === name);
	}
}

function connect() {
	const ws = new FakeWS();
	net.handleConnection(ws);
	return ws;
}

function mkPlayer(name, overrides = {}) {
	return playerHelpers.createPlayer({
		id: `id-${name}`,
		name,
		x: 0,
		y: 64,
		z: 0,
		yaw: 0,
		pitch: 0,
		health: 20,
		maxHealth: 20,
		food: 20,
		saturation: 20,
		xp: 0,
		level: 0,
		gamemode: "survival",
		inventory: new Array(36).fill(null),
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		selectedSlot: 0,
		craftingGrid: new Array(9).fill(null),
		ws: { readyState: 1, send: () => {} },
		...overrides
	});
}

// ============================================================
// A1/A5 — MODO MENÚ (sin mundo activo)
// ============================================================
{
	constants.setWorldSeed(null, null);
	fs.mkdirSync(constants.worldPaths.worldRoot, { recursive: true });
	state.players.clear();
	const ws = connect();
	r.check("A1: en modo menú NO llega init", ws.events("init").length === 0);
	const menuStates = ws.events("menu_state");
	r.check(
		"A1: en modo menú llega menu_state con la lista de mundos",
		menuStates.length === 1 &&
			Array.isArray(menuStates[0].data.worlds) &&
			!menuStates[0].data.worlds.some((w) => w.active)
	);

	// join_world → el servidor carga/crea el mundo y responde init.
	ws.emit(
		"message",
		JSON.stringify({
			event: "join_world",
			data: { seed: "menu-semilla", name: "Mundo Menú" }
		})
	);
	const init = ws.events("init")[0];
	r.check(
		"A5: join_world responde con init de la semilla pedida",
		!!init && init.data.seed === "menu-semilla"
	);
	r.check(
		"A5: init con modo y chunks del mundo",
		!!init &&
			init.data.gamemode === "survival" &&
			init.data.chunkData &&
			Object.keys(init.data.chunkData).length > 0
	);

	// leave_world → el servidor vuelve a mandar menu_state (C1/A1).
	ws.emit("message", JSON.stringify({ event: "leave_world", data: {} }));
	r.check(
		"C1: leave_world devuelve al menú (segundo menu_state)",
		ws.events("menu_state").length >= 2
	);
}

// ============================================================
// B1 — PERSISTENCIA DEL JUGADOR POR NOMBRE (aditiva, sin SCHEMA)
// ============================================================
{
	constants.setWorldSeed("persist-b1", "B1", "survival");
	state.players.clear();
	const ws = connect(); // con mundo activo → init clásico
	const init = ws.events("init")[0];
	const p = state.players.get(init.data.playerId);
	p.inventory[0] = { id: I.DIAMOND, count: 5 };
	p.health = 14;
	p.food = 9;
	p.x = 11;
	p.y = 66;
	p.z = -2;
	save.savePlayer(p);

	// Re-vincular por nombre (patrón de las mascotas F12): un jugador nuevo
	// con el MISMO nombre recupera inventario/salud/comida/posición.
	const p2 = mkPlayer(init.data.name, {
		x: 0,
		y: 64,
		z: 0,
		health: 20,
		food: 20
	});
	const restored = save.restorePlayer(p2);
	r.check(
		"B1: restorePlayer encuentra el archivo del jugador",
		restored === true
	);
	r.check(
		"B1: inventario restaurado (diamante ×5)",
		p2.inventory[0] &&
			p2.inventory[0].id === I.DIAMOND &&
			p2.inventory[0].count === 5
	);
	r.check(
		"B1: salud/comida/posición restauradas",
		p2.health === 14 &&
			p2.food === 9 &&
			p2.x === 11 &&
			p2.y === 66 &&
			p2.z === -2
	);

	// Retrocompatibilidad: un mundo v6 sin archivos de jugador carga igual.
	const p3 = mkPlayer("nadie-jugo");
	r.check(
		"B1: sin archivo previo → false (retrocompatible, sin romper)",
		save.restorePlayer(p3) === false
	);
	// Guardar otra vez y comprobar idempotencia del archivo.
	save.savePlayer(p2);
	r.check(
		"B1: el archivo del jugador existe en world/<semilla>/players/",
		fs.existsSync(
			path.join(
				constants.worldPaths.worldRoot,
				"persist-b1",
				"players",
				`${init.data.name}.json`
			)
		)
	);
}

// REN-1 (v20.2): el autosave de jugadores va por la cola asíncrona
// (savePlayersAsync, lotes con setImmediate). El test espera a que drene
// la cola y comprueba que el archivo queda escrito con el estado del
// momento de programar (no del de escribir).
{
	constants.setWorldSeed("persist-ren1", "REN1", "survival");
	state.players.clear();
	const ws = connect();
	const init = ws.events("init")[0];
	const p = state.players.get(init.data.playerId);
	p.inventory[0] = { id: I.DIAMOND, count: 3 };
	p.health = 11;
	p.x = 4;
	p.y = 63;
	p.z = 1;
	const f = path.join(
		constants.worldPaths.worldRoot,
		"persist-ren1",
		"players",
		`${init.data.name}.json`
	);
	save.savePlayersAsync();
	// drenar la cola (al menos 2 ciclos de setImmediate) antes de comprobar
	setImmediate(() =>
		setImmediate(() => {
			const data = fs.existsSync(f)
				? JSON.parse(fs.readFileSync(f, "utf8"))
				: null;
			r.check("REN-1: savePlayersAsync escribe el archivo del jugador", !!data);
			r.check(
				"REN-1: estado del jugador persistido por la cola",
				data &&
					data.health === 11 &&
					data.inventory[0] &&
					data.inventory[0].id === I.DIAMOND &&
					data.inventory[0].count === 3 &&
					data.x === 4,
				data ? JSON.stringify(data).slice(0, 80) : "sin archivo"
			);
		})
	);
}

// ============================================================
// B4 — ROMPER EL BLOQUE BAJO UNA PLANTA LA DESTRUYE (con drop)
// ============================================================
{
	constants.setWorldSeed("persist-b4", "B4", "survival");
	world.reinitNoise("persist-b4");
	// Hierba alta sobre tierra; con azar fijo (semillas ~30%).
	world.setBlock(20, 40, 20, B.GRASS);
	world.setBlock(20, 41, 20, B.TALL_GRASS);
	let seedCount = 0;
	withRandom(42, () => {
		const p = mkPlayer("minero");
		playerHelpers.finishMining(p, 20, 40, 20, B.GRASS, {});
		seedCount = p.inventory
			.filter((s) => s && s.id === I.SEEDS)
			.reduce((a, s) => a + s.count, 0);
	});
	r.check(
		"B4: romper el soporte destruye la hierba alta",
		world.getBlock(20, 41, 20) === B.AIR
	);
	r.check(
		"B4: el bloque de soporte quedó roto",
		world.getBlock(20, 40, 20) === B.AIR
	);
	r.check(
		"B4: la planta suelta su drop (semillas con azar fijo)",
		seedCount > 0
	);

	// Sin planta encima: no hay cambio extra.
	world.setBlock(30, 40, 30, B.DIRT);
	withRandom(7, () => {
		const p2 = mkPlayer("minero2");
		playerHelpers.finishMining(p2, 30, 40, 30, B.DIRT, {});
	});
	r.check(
		"B4: sin planta encima no se toca el bloque de arriba",
		world.getBlock(30, 41, 30) === B.AIR
	);

	// En CREATIVE la planta se quita igual pero SIN drop (opts.creative).
	world.setBlock(40, 40, 40, B.DIRT);
	world.setBlock(40, 41, 40, B.POPPY);
	const pC = mkPlayer("creativo", { gamemode: "creative" });
	playerHelpers.finishMining(pC, 40, 40, 40, B.DIRT, { creative: true });
	r.check(
		"B4: en creative la planta se quita sin drop",
		world.getBlock(40, 41, 40) === B.AIR &&
			!pC.inventory.some((s) => s && s.id === I.RED_DYE)
	);
}

// ============================================================
// B6 — HOSTILES NO AGRE DEN A JUGADORES EN CREATIVO
// ============================================================
{
	constants.setWorldSeed("persist-b6", "B6", "survival");
	state.players.clear();
	// Lejos del spawn seguro (radio 32 en (0,0)) para que el targeteo no se
	// vea afectado por la zona de seguridad de recién llegados.
	const zombi = mobs.createMob("zombie", 105, 65, 105);
	// Survival → el zombi lo elige como objetivo.
	const surv = mkPlayer("survivor", { x: 106, y: 65, z: 105 });
	state.players.set(surv.id, surv);
	const found = zombi.findNearestPlayer();
	r.check(
		"B6: en survival el hostil targetea al jugador",
		found.nearest === surv
	);
	// Creative → excluido del targeteo (el survival sigue siendo el objetivo).
	const creativo = mkPlayer("creativo", {
		x: 106,
		y: 65,
		z: 105,
		gamemode: "creative"
	});
	state.players.set(creativo.id, creativo);
	const found2 = zombi.findNearestPlayer();
	r.check(
		"B6: en creative el hostil NO targetea al jugador (sigue al survival)",
		found2.nearest === surv
	);
	// Golpear en creative tampoco genera aggro.
	zombi.mobHit(creativo);
	r.check("B6: golpear en creative no genera aggro", zombi.aggroUntil === 0);
	// Golpear en survival sí (y marca al agresor).
	const zombi2 = mobs.createMob("zombie", 5, 65, 5);
	zombi2.mobHit(surv);
	r.check(
		"B6: golpear en survival sí genera aggro contra el agresor",
		zombi2.aggroUntil > Date.now() && zombi2.aggroTarget === surv.id
	);
	state.players.clear();
}

// ============================================================
// B5 — CUEVAS: POCAS PERO GRANDES (muestra determinista)
// La calibración del WIP (CAVE_FREQ 0.032, umbral 0.86) excava
// ~7-9% del subsuelo (antes ~14% con 0.07/0.84) en pasadizos más
// amplios. El test fija una muestra pequeña y comprueba el rango
// excavado y que las cavidades conectan (no hay muchas islas).
// ============================================================
{
	// Muestra de 16x16 columnas en el subsuelo (Y −52..−4, por debajo de la
	// superficie anclada en ~0 y por encima del bedrock −64). Dentro de los
	// límites del mundo de tamaño mediano (512 → half 256) que crea el flujo
	// de conexión, y lejos del spawn para no chocar con estructuras/lagunas.
	// Determinista: misma semilla → mismo mundo.
	const X0 = 100,
		Z0 = 100,
		Y0 = -52,
		Y1 = -4,
		S = 16;
	constants.setWorldSeed("persist-b5", "B5", "survival");
	world.reinitNoise("persist-b5");
	// Generar explícitamente la muestra (getBlock trata como aire lo no
	// generado; el modo de test no pasa por ensureChunksAround).
	for (
		let cx = Math.floor(X0 / 16);
		cx <= Math.floor((X0 + S - 1) / 16);
		cx++
	) {
		for (
			let cz = Math.floor(Z0 / 16);
			cz <= Math.floor((Z0 + S - 1) / 16);
			cz++
		) {
			world.generateChunk(cx, cz);
		}
	}
	let excavated = 0;
	let solid = 0;
	const caveCells = [];
	for (let dx = 0; dx < S; dx++) {
		for (let dz = 0; dz < S; dz++) {
			for (let wy = Y0; wy < Y1; wy++) {
				const b = world.getBlock(X0 + dx, wy, Z0 + dz);
				if (b === B.AIR) {
					excavated++;
					caveCells.push(`${dx},${dz},${wy}`);
				} else solid++;
			}
		}
	}
	const pct = excavated / (excavated + solid);
	// Rango calibrado con la semilla de test (~4.6%): menos que el ~14% de la
	// línea base de Fase 4 (B5 quiere cuevas POCAS), pero con cavidades
	// reales (no el 0% de un mundo sin cuevas).
	r.check(
		"B5: % de subsuelo excavado en rango (2-12%)",
		pct > 0.02 && pct < 0.12
	);
	// Conectividad horizontal (B5: cuevas LARGAS): con pasadizos anchos, la
	// mayoría de celdas de cueva tocan al menos otra celda de cueva a su
	// misma altura (94% en la muestra). Un mundo de bolsas aisladas quedaría
	// muy por debajo del 50%.
	let withNeighbor = 0;
	for (const cell of caveCells) {
		const [dx, dz, wy] = cell.split(",").map(Number);
		const n =
			(dx + 1 < S && world.getBlock(X0 + dx + 1, wy, Z0 + dz) === B.AIR
				? 1
				: 0) +
			(dz + 1 < S && world.getBlock(X0 + dx, wy, Z0 + dz + 1) === B.AIR
				? 1
				: 0) +
			(dx - 1 >= 0 && world.getBlock(X0 + dx - 1, wy, Z0 + dz) === B.AIR
				? 1
				: 0) +
			(dz - 1 >= 0 && world.getBlock(X0 + dx, wy, Z0 + dz - 1) === B.AIR
				? 1
				: 0);
		if (n >= 1) withNeighbor++;
	}
	const connectedPct = caveCells.length ? withNeighbor / caveCells.length : 0;
	r.check(
		"B5: las cuevas son pasadizos conectados (≥50% con vecino)",
		connectedPct >= 0.5
	);
}

// ============================================================
// Auditoría 2026-08-15 (M3/M4) — nombre duplicado y operador explícito
// ============================================================
{
	constants.setWorldSeed("audit-m34", "M34", "survival");
	state.players.clear();
	// M3: dos sockets con el MISMO nombre → el segundo se rechaza (antes
	// entrelazaba el mismo archivo de inventario: suplantación). El nombre
	// llega por ?name= (vía req con url); se compara insensible a mayúsculas.
	const wsA = new FakeWS();
	net.handleConnection(wsA, { url: "/?name=Carlos" });
	const playerA = [...state.players.values()][0];
	r.check(
		"M3: primer jugador con nombre en línea (isOp=host, sin OPS)",
		!!playerA && playerA.name === "Carlos" && playerA.isOp === true,
		JSON.stringify(playerA && { name: playerA.name, isOp: playerA.isOp })
	);
	const wsB = new FakeWS();
	const before = state.players.size;
	net.handleConnection(wsB, { url: "/?name=carlos" }); // mismo nombre (otra caja)
	r.check(
		"M3: segundo socket con el MISMO nombre se rechaza",
		state.players.size === before,
		`players=${before}→${state.players.size}`
	);
	// M3: set_name a un nombre en uso también se rechaza.
	const wsC = new FakeWS();
	net.handleConnection(wsC, { url: "/?name=Ana" });
	const playerC = [...state.players.values()].find((q) => q.ws === wsC);
	wsC.emit(
		"message",
		JSON.stringify({ event: "set_name", data: { name: "Carlos" } })
	);
	r.check(
		"M3: set_name a un nombre en línea se rechaza (sigue Ana)",
		playerC && playerC.name === "Ana",
		playerC ? `name=${playerC.name}` : "sin jugador C"
	);
	// Renombrar a SÍ mismo es válido (ny otras mayúsculas no chocan).
	wsC.emit(
		"message",
		JSON.stringify({ event: "set_name", data: { name: "ANA" } })
	);
	r.check(
		"M3: set_name a sí mismo con distinto case se permite",
		playerC && playerC.name === "ANA",
		playerC ? `name=${playerC.name}` : "sin jugador C"
	);
	wsC.emit(
		"message",
		JSON.stringify({ event: "set_name", data: { name: "Ana" } })
	);
}

// Los checks async de savePlayersAsync (bloque REN-1) corren en la cola de
// setImmediate; hay que diferir done() dos niveles para no salir antes.
setImmediate(() => setImmediate(() => r.done()));
