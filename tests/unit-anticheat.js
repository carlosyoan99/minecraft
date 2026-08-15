"use strict";
// ============================================================
// TESTS UNITARIOS: MEJORAS DOCUMENTADAS (cierre de Fase 8)
//  1. maxPayload del WebSocket: límite de 1 MiB en el servidor WS para
//     impedir que un cliente malicioso sature la memoria con payloads
//     gigantes (ws cierra la conexión con 1009).
//  2. Anti-cheat de vuelo: el ASCENSO se valida contra la parábola del
//     salto (vy = JUMP_SPEED − GRAVITY·t). Subir más rápido que 1.5×
//     JUMP_SPEED (o subir durante >1s seguido en el aire) es físicamente
//     imposible aquí y se rechaza con teleport al último punto aceptado.
//     El daño de caída por velocidad vertical inferida (h = v²/(2·GRAVITY))
//     está cubierto en unit-caida.js.
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const {
	B,
	EYE_HEIGHT,
	JUMP_SPEED,
	WS_MAX_PAYLOAD
} = require("../server/constants.js");

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

playerHelpers.setBroadcastHandler(() => {});

function connect() {
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	return { ws, init, player: state.players.get(init.data.playerId) };
}

// Columna controlada: piso de piedra en y=5 y aire de 6..30 (sin árboles).
function clearColumn(px, pz) {
	for (let y = 5; y <= 30; y++)
		world.setBlock(px, y, pz, y === 5 ? B.STONE : B.AIR);
}

// ============================================================
// 1) maxPayload del WebSocket
// ============================================================
{
	const netSrc = fs.readFileSync(
		path.join(__dirname, "..", "server", "net.js"),
		"utf8"
	);
	check("WS_MAX_PAYLOAD = 1 MiB", WS_MAX_PAYLOAD === 1 * 1024 * 1024);
	// Fase 18 (D-1): el arranque (start con el WebSocket.Server) vive en
	// server/timers.js; net.js solo re-exporta la fachada.
	const timersSrc = fs.readFileSync(
		path.join(__dirname, "..", "server", "timers.js"),
		"utf8"
	);
	check(
		"timers.js pasa maxPayload al WebSocket.Server",
		timersSrc.includes("maxPayload: WS_MAX_PAYLOAD")
	);
	// El umbral de vuelo debe separar un salto legítimo (vy≈6) de un vuelo
	// (vy≈16): 1.5×JUMP_SPEED queda entre ambos.
	check(
		"el umbral de vuelo (1.5×JUMP_SPEED) separa salto de vuelo",
		JUMP_SPEED * 1.5 > 6 && JUMP_SPEED * 1.5 < 16
	);
}

// ============================================================
// 2) SALTO LEGÍTIMO: ascenso a velocidad de salto → aceptado
// ============================================================
{
	const { ws, player: p } = connect();
	clearColumn(5, 5);
	p.x = 5.5;
	p.z = 5.5;
	const landing = 5 + EYE_HEIGHT + 1; // ojo de pie sobre el piso (y=5)
	p.y = landing;
	const move = (y) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: p.x, y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	move(landing); // de pie (suelo firme)
	move(landing + 0.3); // primer move en el aire: vy = 0.3/0.05 = 6 < 1.5×7
	check(
		"salto legítimo: la posición se acepta",
		p.y === landing + 0.3,
		`p.y=${p.y}`
	);
	check("salto legítimo: sin teleport", ws.events("teleport").length === 0);
	check("salto legítimo: el tiempo en el aire acumula", p.airTimeMs > 0);
}

// ============================================================
// 3) EL TIEMPO EN EL AIRE SE REINICIA AL ATERRIZAR
// ============================================================
{
	const { ws, player: p } = connect();
	clearColumn(6, 6);
	p.x = 6.5;
	p.z = 6.5;
	const landing = 5 + EYE_HEIGHT + 1;
	p.y = landing;
	const move = (y) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: p.x, y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	move(landing);
	move(landing + 0.3); // salta → en el aire
	move(landing); // aterriza → airTimeMs = 0
	move(landing + 0.3); // salta de nuevo → aceptado
	check(
		"el segundo salto tras aterrizar también es aceptado",
		p.y === landing + 0.3 && ws.events("teleport").length === 0,
		`p.y=${p.y} teleports=${ws.events("teleport").length}`
	);
}

// ============================================================
// 4) VOLAR: ascenso > 1.5×JUMP_SPEED en el aire → teleport
// ============================================================
{
	const { ws, player: p } = connect();
	clearColumn(7, 7);
	p.x = 7.5;
	p.z = 7.5;
	p.y = 20; // ya en el aire
	const move = (y) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: p.x, y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	move(20.8); // vy = 0.8/0.05 = 16 > 1.5×7 = 10.5
	check(
		"ascenso de 16 bloques/s → teleport",
		ws.events("teleport").length === 1
	);
	check("el vuelo no actualiza la posición", p.y === 20, `p.y=${p.y}`);
}

// ============================================================
// 5) VOLAR LENTO PERO SOSTENIDO: subir >1s seguido en el aire → teleport
// ============================================================
{
	const { ws, player: p } = connect();
	clearColumn(8, 8);
	p.x = 8.5;
	p.z = 8.5;
	p.y = 20; // en el aire
	const move = (y) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: p.x, y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	// 20 subidas de 0.3 bloques (vy = 6, legítima por sí sola): 1000ms de aire
	// (net.js incrementa airTimeMs ANTES del check: el move 20 deja 1000ms).
	for (let i = 1; i <= 20; i++) move(p.y + 0.3);
	const yAceptada = p.y; // 20 + 20×0.3 = 26.0
	move(p.y + 0.3); // el 21º: el aire supera 1s → teleport
	check(
		"subir >1s seguido en el aire → teleport",
		ws.events("teleport").length >= 1
	);
	check(
		"la posición se congela en la última aceptada",
		p.y === yAceptada,
		`p.y=${p.y} esperado=${yAceptada}`
	);
}

// ============================================================
// 6) DESCENSO LEGÍTIMO: caer no dispara el anti-cheat de vuelo
// ============================================================
{
	const { ws, player: p } = connect();
	clearColumn(9, 9);
	p.x = 9.5;
	p.z = 9.5;
	p.y = 25; // en el aire
	const move = (y) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: p.x, y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	for (let i = 1; i <= 10; i++) move(p.y - 0.5); // cae 5 bloques en pasos de 0.5
	check(
		"caer en pasos de 0.5 bloques → sin teleport",
		ws.events("teleport").length === 0
	);
	check("la caída avanza la posición", p.y === 25 - 10 * 0.5, `p.y=${p.y}`);
}

// ============================================================
// 6) C3 (SEC-1): hover en el aire y speedhack horizontal
// ============================================================
// Hover: mantener la altitud en el aire (dy = 0) más de ~1s era volar sin
// límite — el anti-cheat vertical solo miraba `dy > 0`, así que el bypass
// nunca cumplía la condición. Ahora el tiempo en el aire también cuenta con
// dy = 0 (caer, dy < 0, sigue exento: la caída legítima dura >1s).
{
	const { ws, player: p } = connect();
	clearColumn(9, 9);
	p.x = 9.5;
	p.z = 9.5;
	p.y = 25; // en el aire (piedra en y=5)
	p.airTimeMs = 1500; // ya lleva >1s en el aire sin tocar suelo
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({
			event: "move",
			data: { x: 9.5, y: 25, z: 9.5, yaw: 0, pitch: 0 } // dy = 0: hover
		})
	);
	check(
		"hover (dy=0) en el aire >1s → teleport (C3)",
		ws.events("teleport").length === 1,
		`teleports=${ws.events("teleport").length}`
	);
	check("hover: la posición no avanza", p.y === 25, `p.y=${p.y}`);
}

// Corredor de piedra: pre-generar el área (árboles incluidos) y allanar un
// pasillo x=9..34 a z=9 con piedra en y=5 y aire encima, para que el jugador
// SIEMPRE tenga suelo firme (inAir=false) y nada sólido en el camino — los
// árboles generados con Math.random no deben falsear los tests.
function paveRunway() {
	world.ensureChunksAround(9, 9, 3);
	for (let x = 9; x <= 34; x++) clearColumn(x, 9);
}

// Speedhack horizontal: una ráfaga de moves a 20/s con 0.8 bloques cada uno
// son ~16 bloques/s sostenidos — el límite por-move (1.2) no los cazaba. Se
// simula el reloj para que la ventana deslizante de ~1.2s vea el exceso.
{
	const { ws, player: p } = connect();
	paveRunway();
	p.x = 9.5;
	p.z = 9.5;
	p.y = 7; // en el suelo (piedra en y=5): el anti-cheat vertical no interviene
	const origNow = Date.now;
	let fakeNow = origNow();
	Date.now = () => fakeNow;
	const moveTo = (x) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x, y: p.y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	for (let i = 1; i <= 30; i++) {
		fakeNow += 50; // 20 movimientos/s
		moveTo(9.5 + i * 0.8);
	}
	Date.now = origNow;
	check(
		"speedhack horizontal sostenido (>10 bloques/s) → teleport (C3)",
		ws.events("teleport").length >= 1,
		`teleports=${ws.events("teleport").length}`
	);
}

// El jugador LEGÍTIMO (caminar ~4.4 bloques/s) no se ve afectado por la
// ventana horizontal.
{
	const { ws, player: p } = connect();
	paveRunway();
	p.x = 9.5;
	p.z = 9.5;
	p.y = 7;
	const origNow = Date.now;
	let fakeNow = origNow();
	Date.now = () => fakeNow;
	const moveTo = (x) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x, y: p.y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	for (let i = 1; i <= 30; i++) {
		fakeNow += 50;
		moveTo(9.5 + i * 0.22); // ~4.4 bloques/s
	}
	Date.now = origNow;
	check(
		"caminar normal (~4.4 bloques/s) → sin teleport (C3)",
		ws.events("teleport").length === 0,
		`teleports=${ws.events("teleport").length}`
	);
}

// ============================================================
// F16-03 (auditoría 2026-08-11): los DOS bypasses del C3
// ============================================================
// Bypass A: a 30 msg/s el intervalo real es ~33 ms — el clamp antiguo a ≥50 ms
// inflaba el tiempo medido a ~1,5× y la velocidad medida era ~2/3 de la real.
// Una ráfaga de 0.35 bloques/move (10,5 bloques/s = 1,9× sprint) pasaba como
// ≤7; ahora la ventana mide con los timestamps reales y la caza.
{
	const { ws, player: p } = connect();
	paveRunway();
	p.x = 9.5;
	p.z = 9.5;
	p.y = 7;
	const origNow = Date.now;
	let fakeNow = origNow();
	Date.now = () => fakeNow;
	const moveTo = (x) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x, y: p.y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	for (let i = 1; i <= 40; i++) {
		fakeNow += 33; // 30 msg/s
		moveTo(9.5 + i * 0.35); // 10,5 bloques/s sostenidos
	}
	Date.now = origNow;
	check(
		"speedhack a 30 msg/s (10,5 bloques/s) → teleport (F16-03)",
		ws.events("teleport").length >= 1,
		`teleports=${ws.events("teleport").length}`
	);
}

// Bypass B: hundimiento LENTO — dy entre −0.02 y −0.001 por move nunca daba
// `hovering` (dy ≥ −0.001), así que un cliente podía flotar descendiendo
// indefinidamente. La deriva acumulada en el aire (<2 bloques tras >1s) se
// caza ahora.
{
	const { ws, player: p } = connect();
	clearColumn(9, 9);
	p.x = 9.5;
	p.z = 9.5;
	p.y = 25; // en el aire (piedra en y=5)
	const move = (y) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: p.x, y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	ws.sent.length = 0;
	// 25 moves de −0.01: ~1250 ms en el aire descendiendo en total 0.25 bloques.
	for (let i = 1; i <= 25; i++) move(p.y - 0.01);
	check(
		"hundimiento lento (>1s en el aire descendiendo poco) → teleport (F16-03)",
		ws.events("teleport").length >= 1,
		`teleports=${ws.events("teleport").length}`
	);
	// La caída LEGÍTIMA sigue exenta: descender rápido acumula >2 bloques.
	ws.sent.length = 0;
	const { ws: ws2, player: q } = connect();
	clearColumn(9, 9);
	q.x = 9.5;
	q.z = 9.5;
	q.y = 25;
	const moveQ = (y) =>
		ws2.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: q.x, y, z: q.z, yaw: 0, pitch: 0 }
			})
		);
	for (let i = 1; i <= 10; i++) moveQ(q.y - 0.5); // cae 5 bloques en 10 pasos
	check(
		"caída legítima rápida → sin teleport (F16-03, no regresión)",
		ws2.events("teleport").length === 0,
		`teleports=${ws2.events("teleport").length}`
	);
}

process.exit(fails === 0 ? 0 : 1);
