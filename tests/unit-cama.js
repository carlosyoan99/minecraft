"use strict";
// ============================================================
// TESTS UNITARIOS DE LA CAMA (Fase 7)
// Cubre el servidor: receta (3 lana + 3 tablones → 24), el handler
// `sleep` (valida noche + bloque + distancia; salta al amanecer con
// time_set; fija respawnPoint), el respawn en la cama al morir y la
// limpieza del respawnPoint al romper la cama (finishMining).
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const crafting = require("../server/crafting.js");
const playerHelpers = require("../server/players.js");
const { B, I, DAY_CYCLE_MS } = require("../server/constants.js");

world.setDiskLoader(() => null);
crafting.loadRecipes();

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
		this.readyState = 1;
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
	return { ws, init, player: state.players.get(init.data.playerId) };
}

function setNight() {
	state.timeOffset =
		(DAY_CYCLE_MS / 2 + 5000 - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) %
		DAY_CYCLE_MS;
}
function setDay() {
	// Forzar el reloj del mundo a día (worldTime = 0): el offset depende de la
	// hora real, no se puede fijar a 0 a secas (dependería de Date.now() % ciclo).
	state.timeOffset =
		(0 - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
}

// ============================================================
// RECETA DE LA CAMA
// ============================================================
{
	const grid = [
		{ id: 18, count: 1 },
		{ id: 18, count: 1 },
		{ id: 18, count: 1 },
		{ id: 7, count: 1 },
		{ id: 7, count: 1 },
		{ id: 7, count: 1 },
		null,
		null,
		null
	];
	const r = crafting.matchRecipe(grid);
	check(
		"receta de la cama (3 lana + 3 tablones → 24)",
		r && r.result.id === 24,
		r ? `${r.result.id}` : "sin receta"
	);
	check(
		"receta NO sale sin el patrón",
		!crafting.matchRecipe([
			{ id: 18, count: 1 },
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null
		])
	);
}

// ============================================================
// HANDLER SLEEP
// ============================================================
const ctx = connect();
const p = ctx.player;
// Colocar una cama al lado del jugador y acercarlo
const bx = Math.floor(p.x) + 2,
	by = Math.floor(p.y),
	bz = Math.floor(p.z);
world.setBlock(bx, by, bz, B.BED);
p.x = bx;
p.y = by;
p.z = bz;

// De día: rechazado con motivo 'day'
setDay();
ctx.ws.sent.length = 0;
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "sleep", data: { x: bx, y: by, z: bz } })
);
const rej = ctx.ws.events("sleep_rejected")[0];
check("dormir de día → sleep_rejected (day)", rej && rej.data.reason === "day");

// De noche: amanece (time_set) y fija el respawnPoint
setNight();
ctx.ws.sent.length = 0;
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "sleep", data: { x: bx, y: by, z: bz } })
);
const ok = ctx.ws.events("sleep_ok")[0];
check("dormir de noche → sleep_ok", !!ok);
check(
	"dormir de noche → broadcast time_set al amanecer",
	ctx.ws.events("time_set").length === 1
);
const t = ctx.ws.events("time_set")[0];
check(
	"time_set apunta al día (< mitad del ciclo)",
	t && t.data.dayTime < DAY_CYCLE_MS / 2,
	t ? `${t.data.dayTime}` : ""
);
check(
	"respawnPoint fijado en la cama (coordenadas del bloque)",
	!!p.respawnPoint &&
		Math.floor(p.respawnPoint.x) === bx &&
		Math.floor(p.respawnPoint.y) === by &&
		Math.floor(p.respawnPoint.z) === bz,
	JSON.stringify(p.respawnPoint)
);

// No es una cama / lejos → ignorado sin respuesta
world.setBlock(bx + 3, by, bz, B.STONE);
setNight();
ctx.ws.sent.length = 0;
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "sleep", data: { x: bx + 3, y: by, z: bz } })
);
check(
	"dormir sobre un no-cama → ignorado",
	ctx.ws.events("sleep_ok").length === 0 &&
		ctx.ws.events("sleep_rejected").length === 0
);
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "sleep", data: { x: bx + 40, y: by, z: bz } })
);
check("dormir a >7 bloques → ignorado", ctx.ws.events("sleep_ok").length === 0);

// F16-04 (C2, residual): coords inválidas → ignorado sin efectos
p.respawnPoint = null;
setNight();
ctx.ws.sent.length = 0;
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "sleep", data: { x: "foo", y: by, z: bz } })
);
check(
	"F16-04: dormir con coords inválidas → ignorado",
	ctx.ws.events("sleep_ok").length === 0 &&
		ctx.ws.events("sleep_rejected").length === 0 &&
		!p.respawnPoint
);

// ============================================================
// RESPAWN EN LA CAMA AL MORIR
// ============================================================
{
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const p2 = state.players.get(ws.events("init")[0].data.playerId);
	p2.respawnPoint = { x: 42, y: 11, z: -9 }; // bloque de la cama
	p2.health = 5;
	playerHelpers.damagePlayer(p2, 10);
	const tp = ws.events("teleport")[0];
	// El respawn aplica +0.5/+1/+0.5 sobre la cama (no es sólida)
	check(
		"morir con respawnPoint → reaparece sobre la cama",
		tp && tp.data.x === 42.5 && tp.data.y === 12 && tp.data.z === -8.5,
		tp ? JSON.stringify(tp.data) : "sin teleport"
	);
	check("morir con respawnPoint → salud restaurada", p2.health === 20);
}

// ============================================================
// ROMPER LA CAMA LIMPIA EL RESPAWN POINT
// ============================================================
{
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const p3 = state.players.get(ws.events("init")[0].data.playerId);
	const cx = 10,
		cy = 30,
		cz = 10;
	p3.respawnPoint = { x: cx, y: cy, z: cz }; // coordenadas del bloque de la cama
	world.setBlock(cx, cy, cz, B.BED);
	// Player puede "romper" la cama (finishMining, como hace mining al completar)
	playerHelpers.finishMining(p3, cx, cy, cz, B.BED);
	check("romper la cama limpia el respawnPoint", p3.respawnPoint === null);
	check(
		"romper la cama suelta el ítem de cama",
		p3.inventory.some((s) => s && s.id === B.BED)
	);
}

setDay(); // dejar el reloj en día para no contaminar otros tests
process.exit(fails === 0 ? 0 : 1);
