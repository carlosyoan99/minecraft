"use strict";
// ============================================================
// RUNNER SIMPLE DE TESTS (sin framework, como el resto del proyecto)
// Ejecuta los tests unitarios de tests/ y, si hay un servidor vivo,
// el E2E de comer (tests/e2e-comer.js).
//
//   node tests/run.js                   → unitarios + E2E si hay servidor
//   node tests/run.js --unit            → solo unitarios
//   WS_URL=ws://host:puerto node tests/run.js --e2e  → solo E2E contra ese servidor
// ============================================================
const { spawnSync } = require("node:child_process");
const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");

const UNIT = [
	"unit-hambre.js",
	"unit-cria.js",
	"unit-crafting.js",
	"unit-mundo.js",
	"unit-mobs-agua.js",
	"unit-spawn.js",
	"unit-biomas.js",
	"unit-durabilidad.js",
	"unit-persistencia.js",
	"unit-mobs-ia.js",
	"unit-mobs-poo.js",
	"unit-poo-entities.js", // Fase 13 (C3): Player/World/Chunk/ItemStack como clases
	"unit-lagunas.js", // Fase 13 (D2): arco, puertas, escaleras/losas/vallas, cubo y recetas nuevas
	"unit-red.js",
	"unit-recetas.js",
	"unit-recipecats.js", // Fase 9 (F): categorías del libro de recetas (regresión: armadura en su pestaña)
	"unit-sync.js",
	"unit-paridad.js", // Fase 13 (B): fija la tabla oficial de MC (vida, XP, espadas, armadura, durezas, durabilidad) — falla si alguien desvía un valor
	"unit-commands.js",
	"unit-arboles.js",
	"unit-reload.js",
	"unit-mineria.js",
	"unit-lod.js",
	"unit-geopool.js",
	"unit-greedy.js", // Fase 13 (A1): greedy meshing — menos caras + identidad con la referencia per-celda
	"unit-workers.js", // Fase 13 (A2): worker de chunks — geometría idéntica al camino síncrono
	"unit-raycast.js", // Fase 8 (B3): bounds obsoletos en el pool → raycast de minería
	"unit-mobray.js", // Fase 8 (B9): raycast de mobs multibloque (grupo de partes)
	"unit-camara.js", // Fase 11 (A2): fix del clamp de pitch — PLC r160 limita ±90° sin vueltas
	"unit-fase11.js", // Fase 11 (B/C): biomas nuevos + esquileo, agua infinita + pendientes Fase 10
	"unit-fase12.js", // Fase 12 (A): slimes, mascotas, ocelote→gato, tridentes, drops + pendientes B/C
	"unit-mining-click.js", // Fase 9 (A): decisión de clic — mob delante/detrás y fix de matrixWorld obsoleto
	"unit-fase9.js", // Fase 9 (B/C/F): gamemode por mundo, world_delete, cultivos, creative_pick/fly, libro
	"unit-cofre.js",
	"unit-antorchas.js",
	"unit-cama.js",
	"unit-armadura.js",
	"unit-respawn.js",
	"unit-caida.js",
	"unit-anticheat.js", // Mejoras documentadas: maxPayload WS + anti-cheat de vuelo
	"unit-crack.js",
	"unit-terreno.js",
	"unit-itemicons.js",
	"unit-ajustes.js",
	"unit-metricas.js",
	"unit-perf-server.js", // Fase 13 (A4): perfilado servidor — snapshot 1/tick, broadcast solo si cambia, getBiome cacheado
	"unit-damage.js",
	"unit-sky.js"
];
const E2E = [
	"e2e-comer.js",
	"e2e-durabilidad.js",
	"e2e-reload.js",
	"e2e-cofre.js"
];
const args = process.argv.slice(2);

let failed = 0;
// Fase 10 (C1): resultado por test para el test.log (saber qué falló sin
// re-ejecutar la suite).
const results = [];

function run(file) {
	const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
		stdio: "inherit"
	});
	const ok = r.status === 0;
	if (!ok) failed++;
	results.push({ file, ok });
	return ok;
}

// Fase 10 (C1): `test.log` — persistencia del resultado de la última
// ejecución (fecha, modo, total, fallos y qué tests fallaron). Lo escribe
// tests/run.js al terminar en cualquier modo (unit, e2e o completo).
// Está en .gitignore (los logs no se versionan).
function writeTestLog() {
	const mode = args.includes("--e2e")
		? "e2e"
		: args.includes("--unit")
			? "unit"
			: "full";
	const failedFiles = results.filter((r) => !r.ok).map((r) => r.file);
	const entry = `# test.log — resultado de la última ejecución de tests
fecha: ${new Date().toISOString()}
modo: ${mode}
total: ${results.length}
fallos: ${failedFiles.length}
${
	failedFiles.length
		? `tests con fallo: ${failedFiles.join(", ")}`
		: "tests con fallo: (ninguno)"
}
exit: ${failed ? 1 : 0}
`;
	try {
		fs.writeFileSync(path.join(__dirname, "test.log"), entry);
	} catch {
		// no bloquea el runner si no se puede escribir el log
	}
}

// ¿Hay un servidor HTTP escuchando en el host/puerto del WS?
function serverUp(wsUrl) {
	const u = new URL(wsUrl);
	const port = Number(u.port) || 3998;
	return new Promise((resolve) => {
		const req = http.get(
			{ hostname: u.hostname, port, path: "/", timeout: 2000 },
			() => resolve(true)
		);
		req.on("error", () => resolve(false));
		req.on("timeout", () => {
			req.destroy();
			resolve(false);
		});
	});
}

(async () => {
	if (!args.includes("--e2e")) {
		for (const f of UNIT) run(f);
	}

	if (!args.includes("--unit")) {
		const wsUrl = process.env.WS_URL || "ws://localhost:3998";
		if (await serverUp(wsUrl)) {
			for (const f of E2E) run(f);
		} else {
		}
	}
	writeTestLog(); // Fase 10 (C1)
	process.exit(failed ? 1 : 0);
})();
