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

	// --- dayFactor: puntos clave del ciclo [0,1) (Fase 18, C-1) ---
	// Perfil trapezoidal por franjas: 0 en el amanecer inicial, 1 durante
	// todo el día, rampa en los crepúsculos, 0 en la noche. Antes era un
	// seno que se apagaba en fase 0.5 (visual adelantada a la franja de juego).
	r.check(
		"dayFactor: mediodía (fase 0.25) = 1",
		Math.abs(dm.dayFactor(0.25) - 1) < 1e-6
	);
	r.check("dayFactor: medianoche (fase 0.75) = 0", dm.dayFactor(0.75) === 0);
	r.check(
		"dayFactor: inicio de amanecer (fase 0) = 0",
		dm.dayFactor(0) === 0
	);
	r.check(
		"dayFactor: fase 0.5 sigue siendo DÍA (atardecer real en 0.575)",
		dm.dayFactor(0.5) === 1
	);
	r.check(
		"dayFactor: rampa en el amanecer [0, 0.075)",
		dm.dayFactor(0.0375) > 0 && dm.dayFactor(0.0375) < 1
	);
	r.check(
		"dayFactor: rampa en el atardecer [0.575, 0.65)",
		dm.dayFactor(0.6) > 0 && dm.dayFactor(0.6) < 1 &&
			dm.dayFactor(0.6) < dm.dayFactor(0.585)
	);
	r.check(
		"dayFactor: noche estricta (fase ≥ 0.65) = 0",
		dm.dayFactor(0.65) === 0 && dm.dayFactor(0.9) === 0 && dm.dayFactor(0.99) === 0
	);
	r.check(
		"dayFactor: nunca negativo y rango [0,1]",
		[0, 0.1, 0.2, 0.35, 0.5, 0.6, 0.8, 0.99].every(
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
	r.check("duskFactor: 0 al mediodía (dayFactor 1)", dm.duskFactor(1) === 0);
	r.check("duskFactor: 0 en la noche (dayFactor 0)", dm.duskFactor(0) === 0);
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
		Math.abs(dm.fogDistances(0, 1).far - (dm.fogDistances(0, 0).far + 40)) <
			1e-9
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
	r.check("cloudTint: día (d=1) = 1.0", Math.abs(dm.cloudTint(1) - 1.0) < 1e-9);
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
	const d1 = dm.dayFactor(0.333),
		d2 = dm.dayFactor(0.333);
	const u1 = dm.duskFactor(0.35),
		u2 = dm.duskFactor(0.35);
	r.check(
		"daymath es determinista (misma entrada → mismo resultado)",
		d1 === d2 && u1 === u2
	);

	// ============================================================
	// FRANJAS DÍA/NOCHE ESTILO MC (Fase 18, C-1)
	// Duración: día 10 min / atardecer 1,5 / noche 7 / amanecer 1,5 sobre
	// DAY_CYCLE_MS (20 min) — fracciones 0.5 / 0.075 / 0.35 / 0.075.
	// ============================================================
	r.check(
		"DAY_PHASES: dawnEnd = 0.075 (1,5 min de amanecer)",
		Math.abs(dm.DAY_PHASES.dawnEnd - 0.075) < 1e-9
	);
	r.check(
		"DAY_PHASES: dayEnd = 0.575 (10 min de día → 0.5 de duración)",
		Math.abs(dm.DAY_PHASES.dayEnd - 0.575) < 1e-9
	);
	r.check(
		"DAY_PHASES: duskEnd = 0.65 (atardecer de 1,5 min → 0.075)",
		Math.abs(dm.DAY_PHASES.duskEnd - 0.65) < 1e-9
	);
	r.check(
		"DAY_PHASES: la noche dura 7 min (0.35 del ciclo)",
		Math.abs(1 - dm.DAY_PHASES.duskEnd - 0.35) < 1e-9
	);
	r.check(
		"DAY_PHASES: las 4 franjas suman el ciclo completo (20 min)",
		Math.abs(dm.DAY_PHASES.dawnEnd + (dm.DAY_PHASES.dayEnd - dm.DAY_PHASES.dawnEnd) + (dm.DAY_PHASES.duskEnd - dm.DAY_PHASES.dayEnd) + (1 - dm.DAY_PHASES.duskEnd) - 1) < 1e-9
	);

	// --- segmentOf: clasificación de fase ---
	r.check("segmentOf: amanecer (0.03) → dawn", dm.segmentOf(0.03) === "dawn");
	r.check("segmentOf: día (0.25 mediodía) → day", dm.segmentOf(0.25) === "day");
	r.check(
		"segmentOf: atardecer (0.6) → dusk",
		dm.segmentOf(0.6) === "dusk"
	);
	r.check(
		"segmentOf: noche (0.8) → night",
		dm.segmentOf(0.8) === "night"
	);
	r.check(
		"segmentOf: límites exactos — dawnEnd es día, duskEnd es noche",
		dm.segmentOf(0.075) === "day" && dm.segmentOf(0.65) === "night"
	);

	// --- isNightPhase / isDayPhase (uso en spawn hostil y quema solar) ---
	r.check(
		"isNightPhase: noche estricta solo desde duskEnd (0.65)",
		!dm.isNightPhase(0.6) && dm.isNightPhase(0.65) && dm.isNightPhase(0.9)
	);
	r.check(
		"isDayPhase: día estricto sin crepúsculos (0.075..0.575)",
		dm.isDayPhase(0.075) &&
			dm.isDayPhase(0.25) &&
			dm.isDayPhase(0.574) &&
			!dm.isDayPhase(0.575) &&
			!dm.isDayPhase(0.03) &&
			!dm.isDayPhase(0.6)
	);
	r.check(
		"isNightPhase e isDayPhase son complementarios en los extremos",
		!dm.isNightPhase(0.25) && dm.isDayPhase(0.25) &&
			dm.isNightPhase(0.8) && !dm.isDayPhase(0.8)
	);

	// --- Coherencia visual: mediodía y atardecer caen en sus franjas ---
	r.check(
		"dayFactor: máximo (1) dentro de la franja de día",
		dm.segmentOf(0.25) === "day" && dm.dayFactor(0.25) === 1
	);
	r.check(
		"dayFactor: 0 en la noche estricta (0.65..1)",
		dm.isNightPhase(0.7) && dm.dayFactor(0.7) === 0
	);
	r.check(
		"duskFactor: máximo visible en el atardecer (0.575..0.65)",
		dm.segmentOf(0.6) === "dusk" &&
			dm.duskFactor(dm.dayFactor(0.6)) > 0.05
	);

	r.done();
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real del test (no silenciar, convención del proyecto)
	console.error("unit-dia:", e.message);
	process.exit(1);
});
