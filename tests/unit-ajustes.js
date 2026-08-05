"use strict";
// ============================================================
// TESTS UNITARIOS DE LOS AJUSTES DE FASE 7 (public/quality.js)
// Cubre la lógica PURA (sin THREE ni DOM): perfiles de calidad y
// clamps de FOV, sensibilidad y volumen. La aplicación en escena,
// audio y cámara se verifica en navegador (no es testeable en Node).
// ============================================================
const path = require("node:path");

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

(async () => {
	const q = await import(
		`file://${path.join(__dirname, "..", "public", "quality.js")}`
	);

	// --- Perfiles de calidad ---
	check(
		"3 perfiles (baja/media/alta) con pixelRatio, shadows y shadowSize",
		Object.keys(q.QUALITY_PROFILES).length === 3 &&
			["baja", "media", "alta"].every(
				(n) =>
					q.QUALITY_PROFILES[n] &&
					typeof q.QUALITY_PROFILES[n].pixelRatio === "number" &&
					typeof q.QUALITY_PROFILES[n].shadows === "boolean" &&
					typeof q.QUALITY_PROFILES[n].shadowSize === "number"
			)
	);
	check(
		"baja: sin sombras, pixelRatio 1",
		q.qualityProfile("baja").shadows === false &&
			q.qualityProfile("baja").pixelRatio === 1
	);
	check(
		"media: sombras activas (perfil por defecto)",
		q.qualityProfile("media").shadows === true && q.QUALITY_DEFAULT === "media"
	);
	check(
		"alta: sombras con más resolución que media",
		q.qualityProfile("alta").shadowSize > q.qualityProfile("media").shadowSize
	);
	check(
		"perfil desconocido cae al por defecto",
		q.qualityProfile("ultra") === q.QUALITY_PROFILES[q.QUALITY_DEFAULT]
	);

	// --- FOV ---
	check("clampFov: dentro del rango se mantiene", q.clampFov(75) === 75);
	check("clampFov: por debajo del mínimo → 50", q.clampFov(10) === 50);
	check("clampFov: por encima del máximo → 110", q.clampFov(200) === 110);
	check("clampFov: redondea", q.clampFov(75.6) === 76);
	check("clampFov: no numérico → 75", q.clampFov("x") === 75);

	// --- Sensibilidad (multiplicador real de pointerSpeed, 0.2..3) ---
	check("clampSensitivity: 1 se mantiene", q.clampSensitivity(1) === 1);
	check("clampSensitivity: por debajo → 0.2", q.clampSensitivity(0.05) === 0.2);
	check("clampSensitivity: por encima → 3", q.clampSensitivity(5) === 3);
	check("clampSensitivity: no numérico → 1", q.clampSensitivity(null) === 1);

	// --- Volumen (0..1) ---
	check("clampVolume: 0.5 se mantiene", q.clampVolume(0.5) === 0.5);
	check("clampVolume: negativo → 0", q.clampVolume(-1) === 0);
	check("clampVolume: >1 → 1", q.clampVolume(2) === 1);
	check("clampVolume: no numérico → 1", q.clampVolume(NaN) === 1);

	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real del test (no silenciar, convención del proyecto)
	console.error("unit-ajustes:", e.message);
	process.exit(1);
});
