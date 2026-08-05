"use strict";
// ============================================================
// TESTS UNITARIOS DE LAS MÉTRICAS DE TICK (Fase 7)
// Verifica que:
//  - world.takeChunkGenMs() acumula el tiempo de generar chunks NUEVOS y se
//    resetea al leerlo (no cuenta los que llegan del disco ni los repetidos).
//  - el bucle principal (net.mainLoop) acumula el tiempo por tick y expone
//    la media de la última ventana en getServerMetrics().
//  - un jugador conectado recibe el broadcast server_metrics (el canal por
//    el que el cliente expone window.__mcServerTickMs/__mcChunkGenMs).
//
// Igual que unit-red.js, usa ws fake — sin levantar el servidor real.
// ============================================================
const path = require("node:path");
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");

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

// Fake WS como el de unit-red.js (readyState 1 = OPEN).
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
	emit(ev, d) {
		if (this.handlers[ev]) this.handlers[ev](d);
	}
	events(name) {
		return this.sent.filter((m) => m.event === name);
	}
}

// Estado aislado: forzar generación fresca (sin disco) para medir chunkGenMs
// y limpiar mobs/chunks previos (puede que otro test haya corrido antes en
// el mismo proceso — no aquí, pero defensivo).
state.mobs.length = 0;
state.players.clear();
state.furnaces.clear();
world.setDiskLoader(() => null);

(async () => {
	// --- 1) takeChunkGenMs: mide la generación de chunks nuevos ---
	const gen0 = world.takeChunkGenMs();
	check("takeChunkGenMs arranca en 0", gen0 === 0, `${gen0}`);

	const c1 = world.generateChunk(0, 0);
	check("generar un chunk nuevo devuelve datos", !!c1 && c1.length > 0);
	const gen1 = world.takeChunkGenMs();
	check("generar un chunk nuevo acumula tiempo > 0", gen1 > 0, `${gen1} ms`);
	check("takeChunkGenMs resetea el acumulador", world.takeChunkGenMs() === 0);

	// Repetir el MISMO chunk (ya en memoria) no debe acumular tiempo.
	world.generateChunk(0, 0);
	check(
		"regenerar un chunk en memoria no acumula",
		world.takeChunkGenMs() === 0
	);

	// --- 2) mainLoop: acumula el tiempo por tick y expone la media ---
	const before = net.getServerMetrics();
	check(
		"getServerMetrics arranca con medias a 0",
		before.tickMs === 0 && before.chunkGenMs === 0
	);

	// Conectar un jugador fake para recibir el broadcast server_metrics.
	const ws = new FakeWS();
	// El jugador debe ser del tipo que espera mainLoop (mínimo: gamemode y ws).
	state.players.set("p-metricas", {
		id: "p-metricas",
		ws,
		name: "metricas",
		gamemode: "creative", // creative: tickPlayer no se ejecuta (evita dependencias)
		mining: null
	});

	// ~25 ticks (a 50 ms serían 1.25 s reales): forzar la ventana de 1 s
	// llamando mainLoop en bucle (los ticks son instantáneos en el test).
	for (let i = 0; i < 25; i++) net.mainLoop();

	// La media se calcula cuando pasa la ventana de 1s desde el último envío.
	// Como el test es instantáneo, forzar el corte ajustando el reloj interno.
	const metrics = net.getServerMetrics(); // Si la ventana no se cerró aún, tickMs queda en 0; el test de broadcast
	// con reloj forzado está abajo. Aquí comprobamos que el bucle no rompió
	// el estado compartido (mobs sigue siendo un array tras los filtros del
	// tick y el jugador de prueba sigue conectado).
	check(
		"mainLoop corre 25 ticks sin romper el estado",
		Array.isArray(state.mobs) && state.players.size === 1
	);
	// Forzar el cierre de ventana: esperar a que pase el segundo real es lento
	// para un unit; en su lugar verificamos que los ticks acumulan tiempo de
	// tick (se mide en la siguiente ventana). Simulamos el paso del tiempo
	// consultando el broadcast con una espera corta.
	await new Promise((r) => setTimeout(r, 1100));
	// Tras 1.1 s reales, un mainLoop adicional cierra la ventana y envía.
	net.mainLoop();

	const srv = net.getServerMetrics();
	check(
		"getServerMetrics reporta tickMs > 0 tras la ventana",
		srv.tickMs > 0,
		`${srv.tickMs} ms`
	);

	// --- 3) Broadcast server_metrics al cliente ---
	const serverMetrics = ws.events("server_metrics");
	check(
		"el jugador recibe el broadcast server_metrics",
		serverMetrics.length >= 1,
		`${serverMetrics.length}`
	);
	if (serverMetrics.length) {
		const d = serverMetrics[serverMetrics.length - 1].data;
		check(
			"server_metrics lleva tickMs y chunkGenMs numéricos",
			typeof d.tickMs === "number" &&
				typeof d.chunkGenMs === "number" &&
				d.tickMs >= 0 &&
				d.chunkGenMs >= 0,
			JSON.stringify(d)
		);
	}

	// Limpieza: no dejar jugadores de este test en el estado compartido.
	state.players.delete("p-metricas");

	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real del test (no silenciar, convención del proyecto)
	console.error("unit-metricas:", e.message);
	process.exit(1);
});
