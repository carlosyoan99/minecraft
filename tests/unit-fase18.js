"use strict";
// ============================================================
// TESTS UNITARIOS DE LA FASE 18 (C-8): ORBES DE XP AL MORIR
// B12 (paridad): al morir en SURVIVAL la XP se pierde — el servidor suelta
// un orbe (entidad `xp_orb` en state.mobs) con la XP del jugador en el
// punto de muerte; al caminar encima (radio XP_ORB_RADIUS) se recoge y la
// XP vuelve al jugador (curva MC via addXp). En CREATIVE la XP se conserva
// (no se suelta orbe). Los orbes NO se persisten (filtro en save.js) y
// expiran a los 5 min (tickXpOrbs). Sin cambios de SCHEMA_VERSION ni de
// protocolo (los orbes viajan en el snapshot de mobs).
// ============================================================
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const mobs = require("../server/mobs.js");
const { XP_ORB_RADIUS } = require("../server/mobs.js");

world.setDiskLoader(() => null); // sin I/O de disco en los tests

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		fails++;
		failedChecks.push(_name);
	}
};

class FakeWS {
	constructor() {
		this.sent = [];
		this.handlers = {};
		this.readyState = 3; // CLOSED: send* no envía (tests aislados)
	}
	send() {}
	on() {}
	emit() {}
}

// Conectar el hook de orbes como server.js: al morir en survival se suelta
// el orbe en la posición del jugador con su XP.
playerHelpers.setXpDropHandler((player, xp) =>
	mobs.spawnXpOrb(player.x, player.y, player.z, xp)
);

function mkPlayer(over = {}) {
	return {
		id: "p-f18",
		ws: new FakeWS(),
		gamemode: "survival",
		x: 4.5,
		y: 10,
		z: 4.5,
		yaw: 0,
		pitch: 0,
		health: 20,
		maxHealth: 20,
		food: 20,
		saturation: 20,
		foodAccum: 0,
		regenAccum: 0,
		starveAccum: 0,
		xp: 0,
		level: 0,
		inventory: new Array(36).fill(null),
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		craftingGrid: new Array(9).fill(null),
		openFurnace: null,
		openChest: null,
		fallFromY: null,
		lastGroundY: null,
		fallVy: 0,
		vyObs: 0,
		airTimeMs: 0,
		fireUntil: 0,
		fireAccum: 0,
		lastFireOn: false,
		spawnGraceUntil: 0,
		speedSamples: [],
		...over
	};
}

function reset() {
	state.mobs = state.mobs.filter((m) => m.type !== "xp_orb");
	state.players.clear();
}

// ============================================================
// SURVIVAL: morir suelta un orbe con la XP y el jugador pasa a 0
// ============================================================
{
	reset();
	const p = mkPlayer({ xp: 37, level: 3 });
	state.players.set(p.id, p);
	playerHelpers.respawnPlayer(p, "mob");
	const orbes = state.mobs.filter((m) => m.type === "xp_orb");
	check(
		"morir en survival suelta UN orbe de XP",
		orbes.length === 1,
		`${orbes.length} orbes`
	);
	check(
		"el orbe lleva la XP del jugador",
		orbes[0]?.xp === 37,
		`xp=${orbes[0]?.xp}`
	);
	check(
		"el orbe nace en la posición de muerte",
		orbes[0]?.x === 4.5 && orbes[0]?.z === 4.5,
		`${orbes[0]?.x},${orbes[0]?.z}`
	);
	check(
		"la XP del jugador pasa a 0 (y el nivel a 0)",
		p.xp === 0 && p.level === 0,
		`xp=${p.xp} level=${p.level}`
	);
	// Sin XP acumulada no se suelta orbe (nada que recuperar).
	reset();
	const p2 = mkPlayer({ xp: 0 });
	playerHelpers.respawnPlayer(p2, "fall");
	check(
		"sin XP previa no se suelta orbe",
		state.mobs.filter((m) => m.type === "xp_orb").length === 0
	);
}

// ============================================================
// RECOGIDA: caminar encima (radio XP_ORB_RADIUS) restaura la XP
// ============================================================
{
	reset();
	// El orbe queda en el punto de muerte; otro jugador (o el mismo tras
	// reaparecer) lo recoge al acercarse a radio 2 (horizontal).
	const orb = mobs.spawnXpOrb(10, 5, 10, 25);
	check("spawnXpOrb crea el orbe", orb && orb.type === "xp_orb" && orb.xp === 25);

	// Lejos (> radio): no se recoge.
	const lejos = mkPlayer({ id: "p-lejos", x: 10 + XP_ORB_RADIUS + 3, z: 10 });
	state.players.set(lejos.id, lejos);
	lejos.xp = 0;
	mobs.tickXpOrbs();
	check(
		"fuera del radio no se recoge (el orbe sigue vivo)",
		state.mobs.find((m) => m.id === orb.id)?.alive === true
	);
	check("fuera del radio no da XP", lejos.xp === 0, `xp=${lejos.xp}`);

	// Encima: se recoge y la XP se re-añade con la curva MC.
	const encima = mkPlayer({ id: "p-encima", x: 10.4, z: 10.2 });
	state.players.set(encima.id, encima);
	mobs.tickXpOrbs();
	const restante = state.mobs.find((m) => m.id === orb.id);
	check("al pisarlo se recoge (alive=false)", !restante || !restante.alive);
	check(
		"la XP recogida se re-añade al jugador",
		encima.xp === 25,
		`xp=${encima.xp}`
	);
	// No se duplica al volver a tickear (el orbe ya no está vivo).
	mobs.tickXpOrbs();
	check(
		"no se re-recoge un orbe ya recogido",
		encima.xp === 25,
		`xp=${encima.xp}`
	);
}

// ============================================================
// CREATIVE: la XP se conserva (no se suelta orbe)
// ============================================================
{
	reset();
	const p = mkPlayer({ gamemode: "creative", xp: 52, level: 5 });
	state.players.set(p.id, p);
	playerHelpers.respawnPlayer(p, "void");
	check(
		"creative: no se suelta orbe de XP",
		state.mobs.filter((m) => m.type === "xp_orb").length === 0
	);
	check(
		"creative: la XP se conserva",
		p.xp === 52 && p.level === 5,
		`xp=${p.xp} level=${p.level}`
	);
}

// ============================================================
// PERSISTENCIA: save.js excluye los orbes (no se guardan)
// ============================================================
{
	reset();
	const p = mkPlayer({ xp: 13 });
	playerHelpers.respawnPlayer(p, "fall");
	const orb = state.mobs.find((m) => m.type === "xp_orb");
	check("hay un orbe en memoria tras morir", !!orb);
	// El snapshot de save.js filtra por tipo: el meta de world.json no debe
	// contener el orbe (se pierden al reiniciar, decisión de la spec C-8).
	const save = require("../server/save.js");
	const meta = save.buildMeta();
	const savedMobs = meta.mobs || [];
	check(
		"los orbes NO se persisten en world.json (filtro save.js)",
		!savedMobs.some((m) => m.type === "xp_orb"),
		JSON.stringify(savedMobs.map((m) => m.type))
	);
}

process.exit(fails === 0 ? 0 : 1);
