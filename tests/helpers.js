"use strict";
// ============================================================
// UTILIDADES COMPARTIDAS PARA LOS TESTS (Fase 16, G1.3)
// Los tests nuevos usan estos helpers en lugar de repetir el
// boilerplate de cada archivo; el reporte que produce `Reporter`
// es el uniforme que parsea tests/run.js:
//   - exit 0 → test verde; exit 1 → test rojo
//   - "# checks fallidos: n — a; b; ..." en el exit para saber qué
//     checks fallaron sin re-ejecutar la suite (tests/last-run/).
// ============================================================
const path = require("node:path");

// --- Reporte uniforme de checks (lo parsea run.js) ---
class Reporter {
	constructor() {
		this.ok = 0;
		this.fail = 0;
		this.failedChecks = [];
		process.on("exit", () => {
			if (this.failedChecks.length)
				console.log(
					`# checks fallidos: ${this.failedChecks.length} — ${this.failedChecks.join("; ")}`
				);
		});
	}
	// Registra un check. `cond` true → OK; si no, cuenta el fallo y lo imprime
	// (marcador ✗ que también busca run.js como respaldo del reporte).
	check(name, cond, extra = "") {
		if (cond) this.ok++;
		else {
			this.fail++;
			this.failedChecks.push(name);
			console.log(`✗ ${name} ${extra}`.trim());
		}
	}
	// Cierra el test con el balance y el exit code (0 verde / 1 rojo).
	done() {
		console.log(`${this.ok} OK, ${this.fail} FAIL`);
		process.exit(this.fail ? 1 : 0);
	}
}

// Jugador mínimo para tests que solo necesitan el estado (sin socket real).
// Los tests de servidor lo extienden con overrides por caso.
function mkPlayer(overrides = {}) {
	return {
		id: "p-test",
		name: "test",
		x: 0,
		y: 64,
		z: 0,
		yaw: 0,
		pitch: 0,
		health: 20,
		hunger: 20,
		gamemode: "survival",
		...overrides
	};
}

// Fija Math.random a un LCG determinista durante `cb` y lo restaura al final
// (para tests que dependen del azar sin volverse flaky).
function withRandom(seed, cb) {
	const prev = Math.random;
	let s = seed >>> 0;
	Math.random = () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
	try {
		return cb();
	} finally {
		Math.random = prev;
	}
}

// Importa un módulo del proyecto (cliente ESM puro o server) vía file://.
// `relPath` es relativo a la raíz del repo, p. ej. "public/daymath.js".
async function loaderESM(relPath) {
	return import(`file://${path.join(__dirname, "..", relPath)}`);
}

module.exports = { Reporter, mkPlayer, withRandom, loaderESM };
