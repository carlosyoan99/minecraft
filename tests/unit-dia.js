"use strict";
// ============================================================
// TESTS UNITARIOS DE LA MATEMÁTICA DEL CICLO DÍA/NOCHE (Fase 16, G3)
// Cubre la lógica PURA de public/daymath.js (sin THREE ni DOM): factor
// de día, atardecer, niebla y tinte de nubes. La aplicación a la escena
// (dome, luces, niebla del scene) es visual y se verifica en navegador
// (G3.7, CDP); aquí solo se testean las fórmulas. Primer consumidor de
// tests/helpers.js (G1.3).
// ============================================================
const { Reporter, loaderESM } = require("./helpers.js");

(async () => {
	const r = new Reporter();
	const dm = await loaderESM("public/daymath.js");

	// --- dayFactor: puntos clave del ciclo [0,1) ---
	// 0 = amanecer, 0.25 = mediodía, 0.5 = atardecer, 0.75 = medianoche
	r.check(
		"dayFactor: mediodía (fase 0.25) = 1",
		Math.abs(dm.dayFactor(0.25) - 1) < 1e-6
	);
	r.check(
		"dayFactor: medianoche (fase 0.75) = 0",
		dm.dayFactor(0.75) === 0
	);
	r.check(
		"dayFactor: amanecer/atardecer (fase 0/0.5) ≈ 0",
		dm.dayFactor(0) === 0 && Math.abs(dm.dayFactor(0.5)) < 1e-9
	);
	r.check(
		"dayFactor: nunca negativo (hemisferio nocturno → 0)",
		dm.dayFactor(0.9) === 0 && dm.dayFactor(0.55) >= 0
	);
	r.check(
		"dayFactor: rango [0,1] para toda fase",
		[0, 0.1, 0.2, 0.35, 0.6, 0.8, 0.99].every(
			(p) => dm.dayFactor(p) >= 0 && dm.dayFactor(p) <= 1
		)
	);

	// --- duskFactor: máximo en el crepúsculo (dayFactor ~0.4), 0 de noche ---
	// El máximo real de d*(1 - |d-0.35|*2.2) está en d≈0.402 (el comentario
	// de daynight.js lo redondea a 0.35); lo verificamos por muestreo.
	let peakD = 0;
	let peakV = -1;
	for (let d = 0.05; d < 1; d += 0.005) {
		const v = dm.duskFactor(d);
		if (v > peakV) {
			peakV = v;
			peakD = d;
		}
	}
	r.check(
		"duskFactor: máximo en el crepúsculo (dayFactor entre 0.35 y 0.45)",
		peakD >= 0.35 && peakD <= 0.45,
		`pico en d=${peakD.toFixed(3)} (v=${peakV.toFixed(3)})`
	);
	r.check(
		"duskFactor: pico con fuerza visible (>0.3)",
		peakV > 0.3,
		`v=${peakV.toFixed(3)}`
	);
	r.check(
		"duskFactor: 0 al mediodía (dayFactor 1)",
		dm.duskFactor(1) === 0
	);
	r.check(
		"duskFactor: 0 en la noche (dayFactor 0)",
		dm.duskFactor(0) === 0
	);
	r.check(
		"duskFactor: rango [0,1] y no negativo",
		[0, 0.1, 0.2, 0.35, 0.5, 0.8, 1].every(
			(d) => dm.duskFactor(d) >= 0 && dm.duskFactor(d) <= 1
		)
	);

	// --- fogDistances: la niebla se acerca de noche y se aleja de día ---
	r.check(
		"niebla: far de día (d=1) ≫ far de noche (d=0)",
		dm.fogDistances(1, 0).far > dm.fogDistances(0, 0).far * 2
	);
	r.check(
		"niebla: near de día (d=1) > near de noche (d=0)",
		dm.fogDistances(1, 0).near > dm.fogDistances(0, 0).near
	);
	r.check(
		"niebla: el atardecer espesa (far +40 con dusk)",
		Math.abs(
			dm.fogDistances(0, 1).far - (dm.fogDistances(0, 0).far + 40)
		) < 1e-9
	);
	r.check(
		"niebla: valores de noche = 30/70 (documentados)",
		dm.fogDistances(0, 0).near === 30 && dm.fogDistances(0, 0).far === 70
	);
	r.check(
		"niebla: valores de día = 75/200 (documentados)",
		dm.fogDistances(1, 0).near === 75 && dm.fogDistances(1, 0).far === 200
	);

	// --- cloudTint: blanco de día, gris azulado de noche ---
	r.check(
		"cloudTint: día (d=1) = 1.0",
		Math.abs(dm.cloudTint(1) - 1.0) < 1e-9
	);
	r.check(
		"cloudTint: noche (d=0) = 0.35",
		Math.abs(dm.cloudTint(0) - 0.35) < 1e-9
	);
	r.check(
		"cloudTint: rango [0.35, 1] para toda fase",
		[0, 0.3, 0.6, 1].every((d) => {
			const t = dm.cloudTint(d);
			return t >= 0.35 && t <= 1;
		})
	);
	r.check(
		"CLOUD_TINT_STEP: 0.03 (cuantización ~8 cambios por ciclo)",
		Math.abs(dm.CLOUD_TINT_STEP - 0.03) < 1e-9
	);

	// --- Determinismo: misma entrada → mismo resultado ---
	r.check(
		"daymath es determinista (misma entrada → mismo resultado)",
		dm.dayFactor(0.333) === dm.dayFactor(0.333) &&
			dm.duskFactor(0.35) === dm.duskFactor(0.35)
	);

	r.done();
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real del test (no silenciar, convención del proyecto)
	console.error("unit-dia:", e.message);
	process.exit(1);
});

