"use strict";
// ============================================================
// TESTS UNITARIOS DE LA PALETA DEL CIELO (Fase 7, public/skycolors.js)
// Cubre la lógica PURA (sin THREE ni DOM): interpolación de colores y
// paleta por hora del día. El dome, el sol/luna y las estrellas son
// visuales (ShaderMaterial) que se verifican en navegador.
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
		console.log(`✗ ${name} ${extra}`.trim());
	}
};

(async () => {
	const s = await import(
		`file://${path.join(__dirname, "..", "public", "skycolors.js")}`
	);

	// --- Colores clave definidos ---
	check(
		"las 3 fases (día/atardecer/noche) tienen horizonte y cenit",
		["day", "dusk", "night"].every(
			(n) =>
				s.SKY_COLORS[n] &&
				typeof s.SKY_COLORS[n].horizon.r === "number" &&
				typeof s.SKY_COLORS[n].top.b === "number"
		)
	);

	// --- lerpRGB ---
	check(
		"lerpRGB: t=0 devuelve a",
		s.lerpRGB({ r: 0, g: 10, b: 20 }, { r: 100, g: 200, b: 0 }, 0).r === 0 &&
			s.lerpRGB({ r: 0, g: 10, b: 20 }, { r: 100, g: 200, b: 0 }, 0).b === 20
	);
	check(
		"lerpRGB: t=1 devuelve b",
		s.lerpRGB({ r: 0, g: 10, b: 20 }, { r: 100, g: 200, b: 0 }, 1).g === 200
	);
	check(
		"lerpRGB: t=0.5 interpola a la mitad",
		s.lerpRGB({ r: 0, g: 0, b: 0 }, { r: 100, g: 100, b: 100 }, 0.5).r === 50
	);
	check(
		"lerpRGB: clampa t fuera de rango",
		s.lerpRGB({ r: 0, g: 0, b: 0 }, { r: 10, g: 10, b: 10 }, 2).r === 10 &&
			s.lerpRGB({ r: 0, g: 0, b: 0 }, { r: 10, g: 10, b: 10 }, -1).r === 0
	);

	// --- skyPalette: mediodía = día, noche = noche ---
	const noon = s.skyPalette(1, 0);
	check(
		"mediodía: horizonte azul claro (del día)",
		noon.horizon.r > 100 && noon.horizon.b > 150,
		JSON.stringify(noon.horizon)
	);
	const midnight = s.skyPalette(0, 0);
	check(
		"medianoche: horizonte azul oscuro (de la noche)",
		midnight.horizon.r < 30 && midnight.horizon.b < 60,
		JSON.stringify(midnight.horizon)
	);
	check(
		"medianoche: cenit casi negro",
		midnight.top.r < 15 && midnight.top.b < 30,
		JSON.stringify(midnight.top)
	);

	// --- Atardecer: el horizonte se tiñe de naranja (rojo > azul) ---
	const dusk = s.skyPalette(0.35, 1);
	check(
		"atardecer: el horizonte es cálido (rojo dominante)",
		dusk.horizon.r > dusk.horizon.b * 1.8,
		JSON.stringify(dusk.horizon)
	);
	check(
		"atardecer: duskTint es el naranja definido",
		dusk.duskTint.r > 200 && dusk.duskTint.g > 100 && dusk.duskTint.b < 100
	);

	// --- Continuidad: fase de día con dusk nulo ≈ colores del día ---
	const base = s.skyPalette(1, 0);
	check(
		"sin atardecer, el horizonte coincide con el color del día",
		Math.abs(base.horizon.r - s.SKY_COLORS.day.horizon.r) < 1 &&
			Math.abs(base.horizon.g - s.SKY_COLORS.day.horizon.g) < 1
	);

	// --- Determinismo: dos llamadas con la misma entrada dan el mismo color ---
	const palA = s.skyPalette(0.4, 0.6);
	const palB = s.skyPalette(0.4, 0.6);
	check(
		"skyPalette es determinista (misma entrada → mismo resultado)",
		JSON.stringify(palA) === JSON.stringify(palB)
	);

	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("unit-sky:", e.message);
	process.exit(1);
});
