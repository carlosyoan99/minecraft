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
		// biome-ignore lint/suspicious/noConsole: fallo real del test (convención del proyecto)
		console.log(`✗ ${name} ${extra}`.trim());
	}
};

(async () => {
	const q = await import(
		`file://${path.join(__dirname, "..", "public", "quality.js")}`
	);

	// --- Perfiles de calidad (Fase 16 B6: renderScale — escala la resolución
	// nativa; antes un pixelRatio máximo que min(dpr, perfil) anulaba en dpr=1) ---
	check(
		"3 perfiles (baja/media/alta) con renderScale, shadows y shadowSize",
		Object.keys(q.QUALITY_PROFILES).length === 3 &&
			["baja", "media", "alta"].every(
				(n) =>
					q.QUALITY_PROFILES[n] &&
					typeof q.QUALITY_PROFILES[n].renderScale === "number" &&
					typeof q.QUALITY_PROFILES[n].shadows === "boolean" &&
					typeof q.QUALITY_PROFILES[n].shadowSize === "number"
			)
	);
	check(
		"baja: sin sombras, renderScale 0.6",
		q.qualityProfile("baja").shadows === false &&
			q.qualityProfile("baja").renderScale === 0.6
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
	check(
		"los niveles escalan la resolución real (0.6 < 0.85 < 1)",
		q.qualityProfile("baja").renderScale <
			q.qualityProfile("media").renderScale &&
			q.qualityProfile("media").renderScale <
				q.qualityProfile("alta").renderScale
	);

	// --- pixelRatio efectivo (B6): el efecto es VISIBLE en cualquier pantalla.
	// En dpr=1 los tres niveles dan pixelRatio distintos (0.6/0.85/1) — antes
	// min(dpr, perfil) los aplanaba a 1 (la opción "no hacía nada").
	check(
		"dpr=1: baja/media/alta producen pixelRatio distintos y crecientes",
		q.qualityPixelRatio("baja", 1) < q.qualityPixelRatio("media", 1) &&
			q.qualityPixelRatio("media", 1) < q.qualityPixelRatio("alta", 1) &&
			q.qualityPixelRatio("baja", 1) === 0.6 &&
			q.qualityPixelRatio("alta", 1) === 1
	);
	check(
		"dpr=2: alta == resolución nativa (2), baja la escala",
		q.qualityPixelRatio("alta", 2) === 2 &&
			q.qualityPixelRatio("baja", 2) === 1.2
	);
	check(
		"pixelRatio nunca baja de 0.5 ni supera 2",
		q.qualityPixelRatio("baja", 0.5) === 0.5 &&
			q.qualityPixelRatio("alta", 3) === 2
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
