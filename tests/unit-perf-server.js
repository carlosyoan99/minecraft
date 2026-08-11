"use strict";
// ============================================================
// TESTS DE PERFILADO DEL SERVIDOR (Fase 13, A4)
// Verifica las invariantes de rendimiento del tick 20 Hz:
//  - el snapshot de mobs del tick se computa UNA vez por tick
//    (contador inyectado sobre mobs.mobSnapshot), no por broadcast;
//  - el broadcast mobs_update NO se envía si el snapshot no cambió
//    (dirty flag por JSON, Fase 14 M2);
//  - getBiome se cachea por celda (1 cómputo real por celda) y la
//    caché se invalida al re-seedar (reinitNoise).
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const mobs = require("../server/mobs.js");

let ok = 0;
let fail = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (typeof failedChecks !== "undefined" && failedChecks.length)
		console.log(`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`);
});
const check = (name, cond, extra = "") => {
	if (cond) ok++;
	else {
		fail++;
		failedChecks.push(name);
		// biome-ignore lint/suspicious/noConsole: fallo real del test (convención del proyecto)
		console.log(`✗ ${name} ${extra}`.trim());
	}
};

// Fake WS como en unit-metricas.js (readyState 1 = OPEN).
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

// Estado aislado: forzar generación fresca (sin disco) y limpiar el estado
// previo (cada test corre en su propio proceso vía tests/run.js).
state.mobs.length = 0;
state.players.clear();
state.furnaces.clear();
world.setDiskLoader(() => null);

(async () => {
	// --- 1) Caché de getBiome por celda ---
	const before = world.biomeCacheStats().computations;
	// La misma celda consultada N veces → 1 solo cómputo real.
	world.getBiome(5, 7);
	world.getBiome(5, 7);
	world.getBiome(5, 7);
	const after = world.biomeCacheStats().computations;
	check(
		"getBiome cachea por celda: 3 consultas → 1 cómputo real",
		after - before === 1,
		`delta=${after - before}`
	);

	// Celda distinta → otro cómputo (la caché no devuelve valores erróneos).
	world.getBiome(5, 8);
	check(
		"getBiome celda distinta → cómputo nuevo",
		world.biomeCacheStats().computations - after === 1
	);

	// reinitNoise invalida la caché (biomas dependen del seed).
	const cBefore = world.biomeCacheStats().computations;
	world.reinitNoise("seed-perf-test");
	world.getBiome(5, 7);
	check(
		"reinitNoise invalida la caché de bioma (re-cómputo)",
		world.biomeCacheStats().computations - cBefore === 1
	);

	// --- 2) Snapshot de mobs: 1 cómputo por tick ---
	// Contador inyectado: envolver mobSnapshot temporalmente.
	const origSnapshot = mobs.mobSnapshot;
	let snapshotCalls = 0;
	mobs.mobSnapshot = (m) => {
		snapshotCalls++;
		return origSnapshot(m);
	};

	// Un jugador conectado (recibe broadcasts) + 2 mobs vivos congelados
	// (tick no-op: nada cambia entre ticks → el JSON del snapshot es igual).
	state.players.clear();
	const ws = new FakeWS();
	state.players.set("p-perf", {
		id: "p-perf",
		ws,
		name: "perf",
		gamemode: "creative",
		mining: null,
		// Posición (auditoría §4.3): el despawn por distancia requiere jugador
		// con coordenadas; a 0,10,0 los mobs de (10/12,10,10/12) quedan <128.
		x: 0,
		y: 10,
		z: 0
	});
	const a = new mobs.Mob("cow", 10, 10, 10);
	const b = new mobs.Mob("zombie", 12, 10, 12);
	a.tick = () => {};
	b.tick = () => {};
	state.mobs.push(a, b);

	net.mainLoop();
	check(
		"el snapshot del tick se computa 1 vez por mob (2 mobs → 2 llamadas)",
		snapshotCalls === 2,
		`llamadas=${snapshotCalls}`
	);
	snapshotCalls = 0;

	// --- 3) Broadcast condicional: sin cambios → sin mobs_update ---
	const updatesAfterFirst = ws.events("mobs_update").length;
	// El primer tick envió mobs_update (hay jugador y snapshot distinto de
	// lastMobsJson, que arranca vacío). Verificarlo.
	check(
		"primer tick con jugador envía mobs_update",
		updatesAfterFirst === 1,
		`enviados=${updatesAfterFirst}`
	);

	// Segundo tick con los MISMOS mobs congelados → nada cambió → no reenvía.
	net.mainLoop();
	check(
		"sin cambios en el snapshot → el segundo tick NO reenvía mobs_update",
		ws.events("mobs_update").length === updatesAfterFirst,
		`enviados=${ws.events("mobs_update").length}`
	);
	// Y tampoco se recomputó el snapshot de más (1 por mob, 2 llamadas).
	check(
		"segundo tick sin cambios: snapshot igualmente 1 vez por mob",
		snapshotCalls === 2,
		`llamadas=${snapshotCalls}`
	);

	// Cambiar un mob (moverse) → el siguiente tick SÍ reenvía.
	a.x += 1;
	net.mainLoop();
	check(
		"si un mob cambia → el tick reenvía mobs_update",
		ws.events("mobs_update").length === updatesAfterFirst + 1,
		`enviados=${ws.events("mobs_update").length}`
	);

	// Restaurar la fachada original (limpieza para otros tests del proceso).
	mobs.mobSnapshot = origSnapshot;
	state.players.delete("p-perf");

	// --- 4) Despawn por distancia (auditoría §4.3): mobs >128 bloques de todo
	//     jugador sin dueño se eliminan del tick; los cercanos y las mascotas
	//     permanecen. ---
	{
		state.mobs.length = 0;
		state.players.clear();
		state.players.set("p-cull", {
			id: "p-cull",
			ws: new FakeWS(),
			x: 0,
			y: 64,
			z: 0
		});
		const cerca = new mobs.Mob("cow", 10, 64, 0); // < 128 → sobrevive
		const lejos = new mobs.Mob("zombie", 400, 64, 0); // > 128 → se va
		const mascota = new mobs.Mob("wolf", 500, 64, 0); // con dueño → sobrevive
		mascota.ownerId = "p-cull";
		for (const m0 of [cerca, lejos, mascota]) m0.tick = () => {};
		state.mobs.push(cerca, lejos, mascota);
		net.mainLoop();
		check(
			"despawn: mob a >128 bloques sin dueño se elimina",
			!state.mobs.some((m) => m.id === lejos.id),
			`vivos=${state.mobs.length}`
		);
		check(
			"despawn: mob <128 bloques permanece",
			state.mobs.some((m) => m.id === cerca.id)
		);
		check(
			"despawn: la mascota con dueño permanece aunque lejos",
			state.mobs.some((m) => m.id === mascota.id)
		);
		state.mobs.length = 0;
		state.players.clear();
	}

	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real del test (no silenciar, convención del proyecto)
	console.error("unit-perf-server:", e.message);
	process.exit(1);
});
