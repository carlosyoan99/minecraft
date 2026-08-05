"use strict";
// ============================================================
// TESTS UNITARIOS DE LA TELEMETRÍA DE DAÑO (Fase 8, B2)
// Verifica que logDamage (players.js) registre cada daño por origen:
//  - state.damageLog es un anillo con las últimas ~50 entradas.
//  - el jugador afectado recibe el evento WS damage_debug con los campos
//    del spec (source, amount, realAmount, healthBefore/After, x/y/z, time
//    y la meta por origen: mobId/mobType/dist, fallBlocks, food/saturation).
//  - creative (/gamemode) no registra daño.
//  - los call sites reales pasan su source: mobs.attack() (mob),
//    mobs.explode() (creeper), applyFallDamage (fall) y el daño de lava.
//
// Igual que unit-red.js, usa ws fake — sin levantar el servidor real.
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const mobs = require("../server/mobs.js");
const playerHelpers = require("../server/players.js");

// Forzar generación fresca (sin leer el world/ real del proyecto).
world.setDiskLoader(() => null);

let ok = 0;
let fail = 0;
const check = (name, cond, extra = "") => {
	if (cond) ok++;
	else {
		fail++;
		// biome-ignore lint/suspicious/noConsole: fallo real del test (convención del proyecto)
		console.log(`✗ ${name} ${extra}`.trim());
	}
};

// --- ws fake: captura mensajes salientes (como unit-red.js) ---
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
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	const player = state.players.get(init.data.playerId);
	return { ws, init, player };
}

// ============================================================
// LOG DE DAÑO: EVENTO WS + ANILLO state.damageLog
// ============================================================
{
	state.damageLog.length = 0;
	const { ws, player } = connect();
	// Daño de mob: los campos del evento y de la entrada del anillo.
	playerHelpers.damagePlayer(player, 5, {
		source: "mob",
		meta: { mobId: "m1", mobType: "zombie", dist: 1.5 }
	});
	const evt = ws.events("damage_debug")[0];
	check("damage_debug: evento enviado al jugador afectado", !!evt);
	check(
		"damage_debug: source/amount/realAmount",
		evt?.data.source === "mob" &&
			evt.data.amount === 5 &&
			evt.data.realAmount === 5
	);
	check(
		"damage_debug: healthBefore/After correctos",
		evt?.data.healthBefore === 20 && evt.data.healthAfter === 15
	);
	check(
		"damage_debug: posición y time presentes",
		typeof evt?.data.x === "number" &&
			typeof evt.data.y === "number" &&
			typeof evt.data.z === "number" &&
			typeof evt.data.time === "number"
	);
	check(
		"damage_debug: meta de mob (mobId/mobType/dist)",
		evt?.data.mobId === "m1" &&
			evt.data.mobType === "zombie" &&
			evt.data.dist === 1.5
	);
	check(
		"state.damageLog: entrada con la misma forma",
		state.damageLog.length === 1 &&
			state.damageLog[0].source === "mob" &&
			state.damageLog[0].realAmount === 5
	);
	// second: el anillo conserva el orden (última entrada al final).
	playerHelpers.damagePlayer(player, 2, { source: "lava" });
	check(
		"state.damageLog: orden FIFO (última al final)",
		state.damageLog.length === 2 && state.damageLog.at(-1).source === "lava"
	);
}

// ============================================================
// ANILLO: MÁXIMO ~50 ENTRADAS (la más antigua sale al llenarse)
// ============================================================
{
	const p = state.players.values().next().value;
	state.damageLog.length = 0;
	// Primera entrada con fuente distintiva: debe salir del anillo al llenarse.
	playerHelpers.damagePlayer(p, 1, { source: "seed" });
	for (let i = 1; i < 60; i++)
		playerHelpers.damagePlayer(p, 1, {
			source: "starve",
			meta: { food: 0, saturation: 0 },
			armor: false
		});
	check(
		"state.damageLog: anillo limitado a ~50",
		state.damageLog.length === 50
	);
	check(
		"state.damageLog: descarta las más antiguas (seed fuera)",
		!state.damageLog.some((e) => e.source === "seed")
	);
	state.players.clear();
}

// ============================================================
// CREATIVE: NO REGISTRA DAÑO (damagePlayer lo descarta antes)
// ============================================================
{
	state.damageLog.length = 0;
	const { ws, player } = connect();
	player.gamemode = "creative";
	playerHelpers.damagePlayer(player, 5, { source: "mob" });
	check(
		"damage_debug: creative no registra ni envía daño",
		state.damageLog.length === 0 && ws.events("damage_debug").length === 0
	);
	check("damage_debug: creative conserva la salud", player.health === 20);
	state.players.clear();
}

// ============================================================
// CALL SITES REALES: mobs.attack() y mobs.explode()
// ============================================================
{
	state.damageLog.length = 0;
	const { player } = connect();
	const zombie = new mobs.Mob(
		"zombie",
		Math.floor(player.x) + 1,
		Math.floor(player.y),
		Math.floor(player.z)
	);
	zombie.attack(player, 5, 0);
	check(
		"mobs.attack: source mob + mobType zombie + dist",
		state.damageLog.at(-1)?.source === "mob" &&
			state.damageLog.at(-1).mobType === "zombie" &&
			typeof state.damageLog.at(-1).dist === "number" &&
			state.damageLog.at(-1).mobId === zombie.id
	);
	state.damageLog.length = 0;
	const creeper = new mobs.Mob(
		"creeper",
		Math.floor(player.x) + 1,
		Math.floor(player.y),
		Math.floor(player.z)
	);
	creeper.explode();
	check(
		"mobs.explode: source mob + mobType creeper",
		state.damageLog.at(-1)?.source === "mob" &&
			state.damageLog.at(-1).mobType === "creeper"
	);
	state.players.clear();
}

// ============================================================
// CALL SITES REALES: CAÍDA (applyFallDamage) Y LAVA (tickPlayer)
// ============================================================
{
	const { B, EYE_HEIGHT } = require("../server/constants.js");
	state.damageLog.length = 0;
	const { player } = connect();
	// Caída: columna controlada (piso de piedra en y=5, aire encima) como en
	// unit-caida.js, y caída de 8 bloques → 5 de daño (8 - 3 libres).
	const PX = 5,
		PZ = 5;
	for (let y = 5; y <= 25; y++)
		world.setBlock(PX, y, PZ, y === 5 ? B.STONE : B.AIR);
	player.x = PX + 0.5;
	player.z = PZ + 0.5;
	player.y = 5 + EYE_HEIGHT + 1; // de pie sobre el piso
	player.fallFromY = player.y + 8;
	playerHelpers.applyFallDamage(player);
	const fall = state.damageLog.at(-1);
	check(
		"applyFallDamage: source fall + fallBlocks",
		fall?.source === "fall" &&
			Math.abs(fall.fallBlocks - 8) < 0.01 &&
			fall.realAmount === fallDamageExpect(8)
	);
	state.damageLog.length = 0;
	// Lava: inyectar lava bajo los pies y forzar el daño del tick.
	// (inLava lee world.getBlock; se coloca lava en la celda bajo los pies.)
	const bx = Math.floor(player.x);
	const bz = Math.floor(player.z);
	world.setBlock(
		bx,
		Math.floor(player.y) - 1,
		bz,
		require("../server/constants.js").B.LAVA
	);
	player.lavaAccum = 490; // casi a punto: el siguiente tick acumula hasta 500ms
	playerHelpers.tickPlayer(player, 10);
	check(
		"tickPlayer (lava): source lava",
		state.damageLog.at(-1)?.source === "lava"
	);
	state.players.clear();
}

function fallDamageExpect(blocks) {
	const { FALL_DAMAGE_FREE_BLOCKS } = require("../server/constants.js");
	return Math.max(0, Math.floor(blocks) - FALL_DAMAGE_FREE_BLOCKS);
}

world.setDiskLoader(null);
// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
console.log(`${ok} OK, ${fail} FAIL (telemetría de daño)`);
process.exit(fail ? 1 : 0);
