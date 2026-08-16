"use strict";
// ============================================================
// TESTS UNITARIOS DE LA FASE 19.5 (skills del proyecto)
// Bloque A1: paleta musical por bioma — lógica pura de
// public/musicpalette.js (sin Web Audio ni DOM). La cueva manda
// sobre el bioma; cada bioma del servidor tiene su carácter.
// ============================================================
const { Reporter, loaderESM } = require("./helpers.js");

(async () => {
	const r = new Reporter();
	const mp = await loaderESM("public/musicpalette.js");

	// --- Paleta por bioma: cubre los 8 biomas del servidor ---
	// server/biomes.js devuelve: snow, taiga, desert, swamp, jungle,
	// forest, plains, mountain (más ocean si llega). Cada uno debe tener
	// paleta propia: pool no vacío, volumen y espaciado razonables.
	const EXPECTED = {
		snow: [3, 4, 6],
		taiga: [3, 4, 6],
		desert: [4, 5, 6],
		swamp: [0, 1, 2],
		jungle: [0, 1, 2, 3, 4, 5, 6],
		forest: [1, 2, 3, 4, 5],
		plains: [1, 2, 3, 4, 5],
		mountain: [1, 3, 5],
		ocean: [0, 2, 4]
	};
	for (const [biome, pool] of Object.entries(EXPECTED)) {
		const p = mp.paletteForBiome(biome);
		r.check(
			`paletteForBiome("${biome}") devuelve paleta`,
			!!p && Array.isArray(p.pool) && p.pool.length > 0
		);
		r.check(
			`${biome}: pool esperado [${pool}]`,
			p && JSON.stringify(p.pool) === JSON.stringify(pool),
			p && `pool=${JSON.stringify(p.pool)}`
		);
		r.check(
			`${biome}: volumen y espaciado en rango`,
			p && p.vol > 0 && p.vol <= 1.5 && p.gapMin >= 2000 && p.gapMin <= 6000,
			p && `vol=${p.vol} gap=${p.gapMin}`
		);
	}

	// --- Índices válidos dentro de la escala base ---
	const N = mp.BASE_SCALE.length;
	r.check(
		"todos los índices de paleta están dentro de BASE_SCALE",
		mp.KNOWN_BIOMES.every((b) =>
			mp
				.paletteForBiome(b)
				.pool.every((i) => Number.isInteger(i) && i >= 0 && i < N)
		)
	);

	// --- Cueva manda (el llamador la aplica antes que el bioma) ---
	const cave = mp.cavePalette();
	r.check(
		"cavePalette: escala grave (0..2) y espaciado largo",
		JSON.stringify(cave.pool) === JSON.stringify([0, 1, 2]) &&
			cave.gapMin >= 4500
	);

	// --- Día/noche por defecto (bioma desconocido) ---
	r.check(
		"defaultDayNightPool: día brillante (2..6)",
		JSON.stringify(mp.defaultDayNightPool(0.8)) ===
			JSON.stringify([2, 3, 4, 5, 6])
	);
	r.check(
		"defaultDayNightPool: noche grave (0..4)",
		JSON.stringify(mp.defaultDayNightPool(0.2)) ===
			JSON.stringify([0, 1, 2, 3, 4])
	);

	// --- Bioma desconocido → null (el llamador cae al día/noche) ---
	r.check(
		"paletteForBiome(null) y desconocido → null",
		mp.paletteForBiome(null) === null && mp.paletteForBiome("nether") === null
	);

	// --- Frecuencias válidas (nota real de la escala) ---
	r.check("freqAt(0) = A3 (220 Hz)", Math.abs(mp.freqAt(0) - 220) < 1e-6);

	process.exit(r.fails ? 1 : 0);
})();
