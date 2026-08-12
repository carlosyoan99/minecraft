"use strict";
// ============================================================
// TESTS DE LA PANTALLA DE MUERTE CON CAUSA (Fase 10, B2)
// Pendientes que cita docs/fase11-spec.md §12.1 y que nunca se
// consolidaron en un test propio. Verifica que `player_die`
// viaja con la `cause` correcta (fall/lava/starve/void/kill/
// mob/damage) según la fuente real de cada muerte, y que NO se
// emite en los casos donde el jugador no muere (creative y la
// gracia de 30s sin daño de mobs al reaparecer).
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const commands = require("../server/commands.js");
const crafting = require("../server/crafting.js");

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
const check = (name, ok, extra = "") => {
	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(`${ok ? "OK " : "✗  "}${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) {
		fails++;
		failedChecks.push(name);
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

// Capturar los broadcasts (player_die) como hace server.js con net.broadcast.
const broadcasts = [];
playerHelpers.setBroadcastHandler((event, data) =>
	broadcasts.push({ event, data })
);

function connect() {
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	return { ws, init, player: state.players.get(init.data.playerId) };
}

function lastDie() {
	return broadcasts.filter((b) => b.event === "player_die").at(-1)?.data;
}

// Reinicia el jugador para una muerte limpia (misma salud, fuera de la
// gracia de spawn para poder morir por mobs).
function fresh(player) {
	player.health = 1;
	player.spawnGraceUntil = 0;
	wsSent = 0;
	broadcasts.length = 0;
}
let wsSent = 0;
const countSent = (ws) => {
	wsSent = ws.sent.length;
};

// ============================================================
// CADA FUENTE REAL DE MUERTE → SU CAUSA EN player_die
// ============================================================
{
	const { ws, player: p } = connect();
	countSent(ws);

	// fall: damagePlayer con source "fall" (applyFallDamage, players.js)
	fresh(p);
	playerHelpers.damagePlayer(p, 10, { source: "fall" });
	check(
		"fall: player_die con cause=fall",
		lastDie()?.cause === "fall",
		JSON.stringify(lastDie())
	);
	check(
		"fall: lostInventory:true en survival",
		lastDie()?.lostInventory === true
	);

	// lava: damagePlayer con source "lava" (tickPlayer, players.js)
	fresh(p);
	playerHelpers.damagePlayer(p, 10, { source: "lava" });
	check(
		"lava: player_die con cause=lava",
		lastDie()?.cause === "lava",
		JSON.stringify(lastDie())
	);

	// starve: damagePlayer con source "starve" y armor:false (tickPlayer)
	fresh(p);
	playerHelpers.damagePlayer(p, 10, { source: "starve", armor: false });
	check(
		"starve: player_die con cause=starve",
		lastDie()?.cause === "starve",
		JSON.stringify(lastDie())
	);

	// mob: damagePlayer con source "mob" (daño de criaturas)
	fresh(p);
	playerHelpers.damagePlayer(p, 10, { source: "mob" });
	check(
		"mob: player_die con cause=mob",
		lastDie()?.cause === "mob",
		JSON.stringify(lastDie())
	);

	// sin source → causa por defecto "damage"
	fresh(p);
	playerHelpers.damagePlayer(p, 10);
	check(
		"sin source: player_die con cause=damage",
		lastDie()?.cause === "damage",
		JSON.stringify(lastDie())
	);
}

// ============================================================
// VOID: caer del mundo → cause=void (net.js, antes del anti-cheat)
// ============================================================
{
	const { ws, player: p } = connect();
	fresh(p);
	p.x = 0;
	p.y = 10;
	p.z = 0;
	broadcasts.length = 0;
	// Fase 15 (D5): el mundo va de WORLD_MIN_Y (−64) a WORLD_MAX_Y (63);
	// VOID_Y = −72 (por debajo del fondo). El move debe ir por debajo de
	// VOID_Y para morir por void (antes −30 caía bajo el mundo de 0..63).
	ws.emit(
		"message",
		JSON.stringify({ event: "move", data: { x: 0, y: -80, z: 0 } })
	);
	check(
		"void: move con y<VOID_Y → player_die con cause=void",
		lastDie()?.cause === "void",
		JSON.stringify(lastDie())
	);
	check("void: respawn con teleport", ws.events("teleport").length > 0);
	check("void: salud reiniciada a 20", p.health === 20, `health=${p.health}`);
}

// ============================================================
// KILL: /kill → cause=kill (commands.js, respawnPlayer directo)
// ============================================================
{
	const { ws, player: p } = connect();
	fresh(p);
	broadcasts.length = 0;
	// El primer jugador conectado es op (net.js línea 247-248).
	check("kill: el jugador es op", p.isOp === true);
	commands.executeCommand(p, "/kill", {
		state,
		world,
		broadcast: () => {},
		playerHelpers,
		crafting,
		viewDistance: p.renderDistance
	});
	check(
		"kill: /kill → player_die con cause=kill",
		lastDie()?.cause === "kill",
		JSON.stringify(lastDie())
	);
	check("kill: respawn con teleport", ws.events("teleport").length > 0);
}

// ============================================================
// CASOS DONDE NO HAY MUERTE: creative y gracia de spawn
// ============================================================
{
	const { player: p } = connect();
	// Creative ignora el daño (damagePlayer retorna en línea 545).
	p.gamemode = "creative";
	fresh(p);
	broadcasts.length = 0;
	playerHelpers.damagePlayer(p, 999, { source: "lava" });
	check(
		"creative: el daño se ignora (no hay player_die)",
		broadcasts.filter((b) => b.event === "player_die").length === 0,
		JSON.stringify(broadcasts)
	);
	check("creative: la salud no cambia", p.health === 1, `health=${p.health}`);
}

{
	const { player: p } = connect();
	// Gracia de spawn activa (30s sin daño de mobs).
	fresh(p);
	p.spawnGraceUntil = Date.now() + 30000;
	broadcasts.length = 0;
	playerHelpers.damagePlayer(p, 999, { source: "mob" });
	check(
		"gracia de spawn: daño de mobs ignorado (no hay player_die)",
		broadcasts.filter((b) => b.event === "player_die").length === 0,
		JSON.stringify(broadcasts)
	);
	check(
		"gracia de spawn: la salud no cambia",
		p.health === 1,
		`health=${p.health}`
	);

	// La gracia NO protege de lava/caída/hambre (players.js línea 549).
	p.spawnGraceUntil = Date.now() + 30000;
	broadcasts.length = 0;
	playerHelpers.damagePlayer(p, 10, { source: "fall" });
	check(
		"gracia de spawn: la caída SÍ mata (cause=fall)",
		lastDie()?.cause === "fall",
		JSON.stringify(lastDie())
	);
}

process.exit(fails === 0 ? 0 : 1);
