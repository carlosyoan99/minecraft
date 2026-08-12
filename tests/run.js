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
	"unit-sky.js",
	"unit-ao.js", // Fase 10 (E1): AO por vértice — sombreado de esquinas internas/bloques empotrados
	"unit-muerte.js", // Fase 10 (B2): causas de player_die (caída, mob, fuego, ...)
	"unit-fase16.js", // Fase 16: niebla (B1), cofre Shift (B2), horno combustible (D1), drops (D2), puertas/vidrio/carbón (D3-D5), XP (D6)
	"unit-dia.js" // Fase 16 (G3): matemática pura del ciclo día/noche (public/daymath.js)
];
const E2E = [
	// e2e-mascotas va PRIMERO: necesita spawn fresco (el servidor deja de
	// spaw near lobos cuando el mundo acumula >30 mobs; al ser el primero el
	// lobo de taiga aparece en pocos segundos).
	"e2e-mascotas.js", // Fase 12 (A1/E10): domar un lobo de taiga → aliado que sigue y se sienta
	"e2e-comer.js",
	"e2e-durabilidad.js",
	"e2e-reload.js",
	"e2e-cofre.js",
	"e2e-templo.js" // Fase 12 (B1/E5): templo de jungla — trampa de flechas + cofre con loot
];
// G0.2: auditorías por fase standalone, ejecutables con `node tests/run.js
// --audit`. Antes esta constante no existía y el modo lanzaba ReferenceError.
const AUDIT = [
	"audit-fase3.js",
	"audit-fase4.js",
	"audit-fase5.js",
	"audit-fase6.js",
	"audit-fase7.js",
	"audit-altura.js" // Fase 15 (D5): mundo de 128 bloques (−64..+63) — 72 checks
];
const args = process.argv.slice(2);

let failed = 0;
// Fase 10 (C1): resultado por test para el test.log (saber qué falló sin
// re-ejecutar la suite).
const results = [];

// Fase 15 (cierre): la salida de cada test se captura a tests/last-run/
// para poder inspeccionar qué checks fallaron sin re-ejecutar la suite.
const LAST_RUN_DIR = path.join(__dirname, "last-run");
try {
	fs.mkdirSync(LAST_RUN_DIR, { recursive: true });
} catch {
	// no bloquea el runner si no se puede crear el directorio
}

// Ejecuta un test con banner, captura su salida (stderr incluido) y la
// guarda en tests/last-run/<test>.log. Mide el tiempo por test (G1.4).
function run(file) {
	const t0 = process.hrtime.bigint();
	const r = spawnSync(process.execPath, [path.join(__dirname, file)], {
		stdio: ["inherit", "pipe", "pipe"],
		// Fase 17 (A1): sin SEED el servidor arranca en modo menú (sin mundo
		// activo). Los tests unitarios asumen un mundo cargado (handleConnection
		// devuelve init), así que se les inyecta la semilla por defecto si el
		// entorno no trae una (los tests de menú la anulan con setWorldSeed).
		env: { ...process.env, SEED: process.env.SEED || "miSemilla2026" }
	});
	const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
	const out = `${r.stdout || ""}${r.stderr || ""}`;
	const ok = r.status === 0;
	if (!ok) failed++;
	results.push({ file, ok, out });
	console.log(
		`${ok ? "✅" : "❌"} ${file}${ok ? "" : ` (exit ${r.status})`} — ${elapsedMs.toFixed(0)} ms`
	);
	try {
		fs.writeFileSync(path.join(LAST_RUN_DIR, file + ".log"), out);
	} catch {
		// no bloquea el runner
	}
	return ok;
}

// G1.4: `--filter <regex>` limita la ejecución a los tests cuyo nombre de
// archivo coincide (subconjunto sin tocar el resto).
const FILTER_ARG = "--filter";
let filterRe = null;
if (args.includes(FILTER_ARG)) {
	const i = args.indexOf(FILTER_ARG);
	const pat = args[i + 1];
	if (pat) filterRe = new RegExp(pat);
}
const matches = (file) => !filterRe || filterRe.test(file);

// Extrae de la salida capturada de un test los nombres de los checks que
// fallaron. Prioriza el reporte uniforme que los tests instrumentados
// imprimen al salir (`# checks fallidos: n — a; b; ...`); si no existe,
// busca líneas con el marcador de fallo del estilo por-check (✗/FAIL).
function failedChecksFrom(out) {
	const m = out.match(/# checks fallidos: \d+ — ([^\n]+)/);
	if (m) return m[1].split("; ").filter(Boolean);
	const names = [];
	for (const line of out.split("\n")) {
		const t = line.trim();
		if (/^✗/.test(t)) names.push(t.replace(/^✗\s*/, "").split(" — ")[0]);
		else if (/^FAIL:?/.test(t))
			names.push(t.replace(/^FAIL:?\s*/, "").split(" | ")[0]);
	}
	return names;
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
	const failedFiles = results.filter((r) => !r.ok);
	const entry = `# test.log — resultado de la última ejecución de tests
fecha: ${new Date().toISOString()}
modo: ${mode}
total: ${results.length}
fallos: ${failedFiles.length}
${
	failedFiles.length
		? `tests con fallo: ${failedFiles
				.map((r) => {
					const checks = failedChecksFrom(r.out);
					return checks.length ? `${r.file} → ${checks.join("; ")}` : r.file;
				})
				.join(" | ")}`
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

// Resumen final en terminal: qué tests fallaron y qué checks, sin tener que
// re-ejecutar la suite ni buscar a mano en la salida.
function printSummary() {
	const bad = results.filter((r) => !r.ok);
	if (!bad.length) return;
	console.error("\n================ RESULTADO ================");
	console.error(`tests fallidos: ${bad.length}/${results.length}`);
	for (const r of bad) {
		const checks = failedChecksFrom(r.out);
		console.error(`  ❌ ${r.file} (exit ${r.status})`);
		for (const c of checks) console.error(`       ✗ ${c}`);
	}
	console.error("Detalle completo por test en tests/last-run/<test>.log");
	console.error("============================================");
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
	if (args.includes("--audit")) {
		// Modo auditoría: solo las auditorías por fase standalone (sin
		// servidor ni navegador). Lento a propósito (audit-altura genera
		// radio 16 de chunks); no mezclar con unit/E2E en la misma ejecución.
		for (const f of AUDIT) if (matches(f)) run(f);
	} else {
		if (!args.includes("--e2e")) {
			for (const f of UNIT) if (matches(f)) run(f);
		}

		if (!args.includes("--unit")) {
			const wsUrl = process.env.WS_URL || "ws://localhost:3998";
			if (await serverUp(wsUrl)) {
				for (const f of E2E) if (matches(f)) run(f);
			} else {
			}
		}
	}
	writeTestLog(); // Fase 10 (C1)
	printSummary(); // Fase 15 (cierre)
	process.exit(failed ? 1 : 0);
})();
