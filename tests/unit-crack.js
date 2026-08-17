"use strict";
// ============================================================
// TESTS UNITARIOS DE LA ANIMACIÓN DE ROTURA SINCRONIZADA (Fase 7)
// El servidor hace broadcast de block_break_progress a TODOS los
// jugadores que estén en rango del bloque (no solo al minero). Verifica:
//  - el minero y un jugador cercano reciben la MISMA secuencia de fases;
//  - un jugador lejano (> 7 bloques) NO recibe las grietas;
//  - break_cancel hace broadcast de stage -1 a los del radio;
//  - desconectarse a mitad de una mina también oculta las grietas (-1);
//  - al completarse, el bloque se rompe y llega el block_update (el crack
//    del cliente se oculta por-bloque con hideCrackIfAt).
// Igual que unit-red.js/unit-metricas.js: ws fake, sin levantar el servidor.
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const { B, I } = require("../server/constants.js");

let ok = 0;
let fail = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (name, cond, extra = "") => {
	if (cond) ok++;
	else {
		fail++;
		failedChecks.push(name);
		console.log(`✗ ${name} ${extra}`.trim());
	}
};

// ws fake (como unit-red.js): captura salidas y permite inyectar entradas.
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

// Estado aislado: generación fresca (sin disco) y sin jugadores previos.
world.setDiskLoader(() => null);
state.mobs.length = 0;
state.furnaces.clear();
state.players.clear();

// Simular el cableado de server.js (hooks de broadcast): cualquier cambio de
// bloque se replica a todos los clientes (así el crack se oculta al romper).
world.setBlockChangeHandler((x, y, z, blockId) =>
	net.broadcast("block_update", { x, y, z, blockId })
);

// Jugador real vía handleConnection (minero: inventario, XP, armadura...).
function connectPlayer(x, y, z) {
	const ws = new FakeWS();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	const player = state.players.get(init.data.playerId);
	player.x = x;
	player.y = y;
	player.z = z;
	return { ws, player };
}

// Jugador mínimo (solo ws + posición): suficiente para recibir el broadcast
// y que mainLoop no lo toque (creative: sin hambre ni mina).
function connectObserver(id, x, y, z) {
	const ws = new FakeWS();
	state.players.set(id, {
		id,
		ws,
		name: id,
		x,
		y,
		z,
		gamemode: "creative",
		mining: null
	});
	return { ws, player: state.players.get(id) };
}

const A = connectPlayer(0, 5, 0); // minero, encima del bloque
const obsNear = connectObserver("obsNear", 3, 5, 0); // a 3 bloques: ve grietas
const obsFar = connectObserver("obsFar", 20, 5, 0); // a 20 bloques: fuera de rango
const bx = 0,
	by = 5,
	bz = 0;

// ============================================================
// ROTURA COMPLETA: broadcast a los que ven el bloque
// ============================================================
{
	world.setBlock(bx, by, bz, B.STONE);
	A.player.inventory[0] = { id: I.STONE_PICKAXE, count: 1, durability: 131 }; // Fase 13 B6: max real 131
	A.player.selectedSlot = 0;
	A.ws.sent.length = 0;
	obsNear.ws.sent.length = 0;
	obsFar.ws.sent.length = 0;

	A.ws.emit(
		"message",
		JSON.stringify({
			event: "block_action",
			data: { action: "break", x: bx, y: by, z: bz }
		})
	);
	check("A inicia la sesión de minería", !!A.player.mining);

	// Conducir el bucle principal (como net.mainLoop en producción) hasta que
	// la mina complete (piedra + pico de piedra: <200 ticks de 50 ms).
	for (let i = 0; i < 400 && A.player.mining; i++) net.mainLoop();
	check(
		"al completar, el bloque queda AIR",
		world.getBlock(bx, by, bz) === B.AIR
	);

	const progA = A.ws.events("block_break_progress").map((m) => m.data);
	const progNear = obsNear.ws.events("block_break_progress").map((m) => m.data);
	check(
		"el minero recibió fases de grieta (block_break_progress)",
		progA.length >= 1,
		`${progA.length}`
	);
	check(
		"el jugador cercano recibe la MISMA secuencia de grietas que A",
		JSON.stringify(progA) === JSON.stringify(progNear),
		`A=${progA.length} cercano=${progNear.length}`
	);
	check(
		"el jugador lejano NO recibe grietas",
		obsFar.ws.events("block_break_progress").length === 0
	);
	const stages = progA.map((d) => d.stage);
	check(
		"las fases suben de 0 hacia 9 sin decrecer y sin -1 (durante la rotura)",
		stages.every((s, i) => s >= 0 && s <= 9 && (i === 0 || s >= stages[i - 1]))
	);
	check(
		"block_update (bloque roto) llega a A y al cercano (oculta el crack)",
		A.ws.events("block_update").length >= 1 &&
			obsNear.ws.events("block_update").length >= 1
	);
}
world.setBlock(bx, by + 1, bz, B.STONE);
A.ws.sent.length = 0;
obsNear.ws.sent.length = 0;
obsFar.ws.sent.length = 0;
A.ws.emit(
	"message",
	JSON.stringify({
		event: "block_action",
		data: { action: "break", x: bx, y: by + 1, z: bz }
	})
);
check("sesión nueva iniciada", !!A.player.mining);
net.mainLoop(); // primer tick → stage 0 en broadcast
check(
	"el cercano recibe el stage 0 de la sesión nueva",
	obsNear.ws.events("block_break_progress").length >= 1
);
A.ws.emit(
	"message",
	JSON.stringify({ event: "block_action", data: { action: "break_cancel" } })
);
check("break_cancel cancela la sesión", A.player.mining === null);
check(
	"cancel: A y el cercano reciben stage -1 (broadcast)",
	A.ws.events("block_break_progress").some((m) => m.data.stage === -1) &&
		obsNear.ws.events("block_break_progress").some((m) => m.data.stage === -1)
);
check(
	"cancel: el lejano no recibe nada",
	obsFar.ws.events("block_break_progress").length === 0
);
check(
	"el bloque cancelado sigue intacto",
	world.getBlock(bx, by + 1, bz) === B.STONE
);
world.setBlock(bx, by + 2, bz, B.STONE);
A.ws.sent.length = 0;
obsNear.ws.sent.length = 0;
A.ws.emit(
	"message",
	JSON.stringify({
		event: "block_action",
		data: { action: "break", x: bx, y: by + 2, z: bz }
	})
);
net.mainLoop();
check(
	"el cercano ve grietas de la sesión activa",
	obsNear.ws.events("block_break_progress").length >= 1
);
obsNear.ws.sent.length = 0;
A.ws.emit("close", {});
check(
	"al desconectarse minando, el cercano recibe stage -1 (grietas ocultas)",
	obsNear.ws.events("block_break_progress").some((m) => m.data.stage === -1)
);
check("A ya no está conectado", !state.players.has(A.player.id));

state.players.clear();
world.setDiskLoader(null);
console.log(`${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
