"use strict";
// ============================================================
// TESTS DE LA FASE 21, Bloques A1 y A2 — biomas más grandes y sub-biomas.
// Fase 21 (A1): el tamaño de las regiones de bioma se aumenta bajando la
// frecuencia del campo de temperatura (BIOME_FREQ: 0.005 → 0.003). Este
// test verifica la COHERENCIA resultante con la semilla fija:
//   1. BIOME_FREQ es la constante calibrada (0.003) documentada en la spec,
//   2. la coherencia media de bioma (longitud media de racha de un mismo
//      bioma a lo largo de transectos) crece por encima de lo que daría la
//      frecuencia anterior (0.005 → rachas ~7 bloques de media): con 0.003
//      las extensiones son amplias (media ~12 bloques en la semilla), así
//      que el umbral de 9 bloques distingue claramente «biomas grandes» de
//      «parches pequeños» (un parche típico de 4-6 bloques fallaría),
//   3. los biomas siguen siendo deterministas (misma coordenada → mismo
//      bioma) y las etiquetas base siguen presentes (regresión de escala:
//      si alguien bajara demasiado BIOME_FREQ, la semilla dejaría de
//      muestrear algún bioma base en el rango de tests).
// Fase 21 (A2): los sub-biomas por puertas deterministas (gates de ruido
// de detalle/crest en coordenadas de mundo) matizan las bandas base sin
// cambiar sus umbrales. Este test verifica las INVARIANTES estructurales:
//   4. coherencia de bandas — bir_forest solo donde la base es forest,
//      giant_taiga solo donde la base es taiga y snowy_peaks solo donde la
//      base es mountain (variantes mutuamente excluyentes de la misma banda),
//   5. vegetación — el bosque de abedules es 100 % abedul (vs ~1/3 en el
//      bosque común) y la taiga gigante contiene abetos 2×2 (huella de 4
//      troncos en cuadrado), que es su rasgo definitorio,
//   6. los picos nevados cubren sus cumbres de nieve (superficie SNOW por
//      encima de la línea de nieve).
// El determinismo bit-idéntico de los chunks vive en unit-biomas.js (§6) y
// la presencia de los sub-biomas en la semilla, en unit-biomas.js (§1/§3b);
// aquí solo se auditan las invariantes estructurales de A1/A2.
// ============================================================
const world = require("../server/world.js");
const biomes = require("../server/biomes.js");
const state = require("../server/state.js");
const noise = require("../server/noise.js");
const {
	CHUNK_SIZE,
	WORLD_MIN_Y,
	B
} = require("../server/constants.js");

function idx(x, y, z) {
	return ((y - WORLD_MIN_Y) * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

let failed = 0;
const failedChecks = [];
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		failedChecks.push(`${_name}${_extra ? ` (${_extra})` : ""}`);
	}
};

// --- 1) La constante calibrada es la que decide la escala ---
// La spec F21 (A1) documenta BIOME_FREQ = 0.003 como el valor calibrado:
// con 0.005 las llanuras/desiertos salían como parches pequeños. Si alguien
// lo subiera de nuevo (o lo borrara en favor de un literal), este test lo
// detecta ANTES de medir coherencia.
check(
	"BIOME_FREQ está exportado y es el valor calibrado (0.003)",
	biomes.BIOME_FREQ === 0.003,
	`actual ${biomes.BIOME_FREQ}`
);

// --- 2) Coherencia: las regiones de bioma son amplias ---
// Transectos horizontales cada 40 bloques en z dentro de [-200, 200],
// muestreando cada 2 bloques en x en [-1000, 1000]: ~11 transectos × 1001
// muestras. Una «racha» es un tramo contiguo del mismo bioma; su longitud
// media mide el radio de coherencia. Medido en los mismos transectos: con
// 0.005 (escala previa) la media es 10.0; con 0.003 es 12.2 en la semilla.
// El umbral de 11 distingue la escala nueva de la anterior (el ruido de
// montaña a 0.008 aporta la varianza dominante, así que la diferencia es
// ~2 bloques, no 5).
let totalRun = 0;
let totalRuns = 0;
const runLengths = [];
for (let z = -200; z <= 200; z += 40) {
	let prev = null;
	let run = 0;
	for (let wx = -1000; wx <= 1000; wx += 2) {
		const b = world.getBiome(wx, z);
		if (b === prev) {
			run++;
		} else {
			if (prev !== null) {
				totalRun += run;
				totalRuns++;
				runLengths.push(run);
			}
			prev = b;
			run = 1;
		}
	}
	if (prev !== null) {
		totalRun += run;
		totalRuns++;
		runLengths.push(run);
	}
}
const avgRun = totalRun / totalRuns;
// Mediana: robusta frente a rachas gigantes de jungla/nieve que inflarían
// la media (p. ej. una extensión de 40 bloques no debe enmascarar que el
// resto son parches de 4).
runLengths.sort((a, b) => a - b);
const medianRun = runLengths[Math.floor(runLengths.length / 2)];
check(
	"la racha media de bioma es amplia (media >= 11 bloques)",
	avgRun >= 11,
	`media ${avgRun.toFixed(1)} en ${totalRuns} rachas`
);
check(
	"la racha mediana de bioma es amplia (mediana >= 5 bloques)",
	medianRun >= 5,
	`mediana ${medianRun}`
);

// --- 3) Determinismo y presencia de las etiquetas base ---
// Determinismo: getBiome es cacheado, pero el check de dos llamadas
// consecutivas (con el cache caliente) detectaría cualquier componente no
// determinista (Math.random, fecha, ...) en la etiqueta.
let detOk = true;
const counts = {};
for (let wx = -100; wx <= 100; wx += 4) {
	for (let wz = -100; wz <= 100; wz += 4) {
		const b1 = world.getBiome(wx, wz);
		const b2 = world.getBiome(wx, wz);
		if (b1 !== b2) detOk = false;
		counts[b1] = (counts[b1] || 0) + 1;
	}
}
check("getBiome es determinista (2 llamadas, misma etiqueta)", detOk);
// Las 9 etiquetas base de la Fase 11 deben seguir muestreándose en el
// rango de tests: si la nueva escala las barriera fuera, la generación
// habría perdido variedad (regresión de A1). Los sub-biomas de A2 se
// verifican en unit-biomas.js (§1).
for (const b of ["plains", "forest", "mountain", "snow", "taiga", "desert", "swamp", "jungle"]) {
	check(
		`bioma base '${b}' sigue presente en la semilla`,
		(counts[b] || 0) > 0,
		`${counts[b] || 0} muestras`
	);
}

// ============================================================
// FASE 21, Bloque A2 — invariantes estructurales de los sub-biomas
// ============================================================

// --- 4) Coherencia de bandas ---
// La etiqueta base (sin gates: biomeFrom sin wx/wz) debe coincidir con la
// banda de cada sub-bioma: birch_forest → forest, giant_taiga → taiga,
// snowy_peaks → mountain. Si alguien pusiera un sub-bioma en la banda
// equivocada (p. ej. abedul en taiga) o rompiera el gate, se detecta aquí.
noise.reinitNoise(process.env.SEED || "miSemilla2026");
function baseBiomeAt(wx, wz) {
	return biomes.biomeFrom(
		noise.noise2D(wx * biomes.BIOME_FREQ, wz * biomes.BIOME_FREQ),
		noise.noise2D_mountain(wx * 0.008, wz * 0.008),
		noise.noise2D_swamp(wx * biomes.BIOME_FREQ, wz * biomes.BIOME_FREQ)
	);
}
const SUB_BAND = {
	birch_forest: "forest",
	giant_taiga: "taiga",
	snowy_peaks: "mountain"
};
let bandViolations = 0;
let subCounts = { birch_forest: 0, giant_taiga: 0, snowy_peaks: 0 };
for (let wx = -200; wx <= 200; wx += 2) {
	for (let wz = -200; wz <= 200; wz += 2) {
		const g = world.getBiome(wx, wz);
		if (!SUB_BAND[g]) continue;
		subCounts[g]++;
		if (baseBiomeAt(wx, wz) !== SUB_BAND[g]) bandViolations++;
	}
}
check(
	"los sub-biomas están en su banda base (0 violaciones de banda)",
	bandViolations === 0,
	`${bandViolations} violaciones`
);
for (const b of ["birch_forest", "giant_taiga", "snowy_peaks"]) {
	check(
		`el sub-bioma '${b}' muestrea en la semilla`,
		subCounts[b] > 0,
		`${subCounts[b]} muestras`
	);
}

// --- 5) Vegetación: abedul puro y abeto 2×2 ---
// Generar el área -6..6 y contar troncos por bioma. La vegetación usa
// Math.random (no determinista en qué columna exacta), así que los checks
// son de PROPORCIÓN y de PRESENCIA estructural (como en unit-biomas §3b):
//   birch_forest: 100 % de sus troncos son de abedul (vs ~1/3 en forest);
//   giant_taiga:  al menos un abeto 2×2 (4 troncos en cuadrado → el rasgo
//   definitorio que no existe en la taiga normal).
world.setDiskLoader(() => null);
for (let cx = -6; cx <= 6; cx++) {
	for (let cz = -6; cz <= 6; cz++) {
		world.generateChunk(cx, cz);
	}
}
const logs = {};
const sprucePos = {};
for (let cx = -6; cx <= 6; cx++) {
	for (let cz = -6; cz <= 6; cz++) {
		const d = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x;
				const wz = cz * CHUNK_SIZE + z;
				const biome = world.getBiome(wx, wz);
				const h = world.getHeight(wx, wz);
				for (let dy = 0; dy < 12; dy++) {
					const wy = h + dy;
					if (wy < WORLD_MIN_Y) continue;
					const blk = d[idx(x, wy, z)];
					let key = null;
					if (blk === B.BIRCH_LOG) key = "birch";
					else if (blk === B.OAK_LOG) key = "oak";
					else if (blk === B.SPRUCE_LOG) key = "spruce";
					if (!key) continue;
					logs[biome] = logs[biome] || { birch: 0, oak: 0, spruce: 0 };
					logs[biome][key]++;
					if (key === "spruce" && biome === "giant_taiga") {
						sprucePos[`${wx},${wy},${wz}`] = true;
					}
				}
			}
		}
	}
}
const birchF = logs.birch_forest || { birch: 0, oak: 0, spruce: 0 };
const birchFTotal = birchF.birch + birchF.oak + birchF.spruce;
const forest = logs.forest || { birch: 0, oak: 0, spruce: 0 };
const forestTotal = forest.birch + forest.oak + forest.spruce;
check(
	"el bosque de abedules tiene troncos de abedul",
	birchF.birch > 0,
	`${birchF.birch} troncos`
);
check(
	"el bosque de abedules es 100 % abedul (0 troncos de roble)",
	birchF.oak === 0 && birchFTotal > 0,
	`${birchF.oak} robles de ${birchFTotal} troncos`
);
check(
	"el bosque de abedules supera la proporción de abedul del bosque común",
	forestTotal > 0 && birchF.birch / birchFTotal > forest.birch / forestTotal,
	`${(birchF.birch / birchFTotal * 100).toFixed(0)}% vs ${(forest.birch / forestTotal * 100).toFixed(0)}% en forest`
);
// Huella 2×2: un tronco con su vecino +x y su vecino +z a la misma altura
// (y el diagonal +x+z) → base de abeto gigante.
let giantFootprint = 0;
for (const key of Object.keys(sprucePos)) {
	const [wx, wy, wz] = key.split(",").map(Number);
	if (
		sprucePos[`${wx + 1},${wy},${wz}`] &&
		sprucePos[`${wx},${wy},${wz + 1}`] &&
		sprucePos[`${wx + 1},${wy},${wz + 1}`]
	)
		giantFootprint++;
}
check(
	"la taiga gigante tiene al menos un abeto 2×2 (huella de 4 troncos)",
	giantFootprint > 0,
	`${giantFootprint} celdas con huella 2×2`
);

// --- 6) Picos nevados: las cumbres por encima de la línea de nieve ---
// La superficie de snowy_peaks debe ser SNOW siempre que la altura alcance
// la línea de nieve (MOUNTAIN_SNOW_LINE − DESIGN_OFFSET en Y de MUNDO); en
// las laderas bajas (por debajo de la línea) la superficie es piedra, como
// en la montaña normal.
let peaksAtLine = 0; // cumbres emergidas >= línea de nieve (excluye agua)
let peaksSnowAtLine = 0;
let peaksAnySnow = 0;
let peaksTotal = 0;
let peaksEmergidas = 0;
for (let cx = -6; cx <= 6; cx++) {
	for (let cz = -6; cz <= 6; cz++) {
		const d = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const biome = world.getBiome(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
				if (biome !== "snowy_peaks") continue;
				peaksTotal++;
				const h = world.getHeight(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
				const surf = d[idx(x, h - 1, z)];
				if (surf === B.SNOW) peaksAnySnow++;
				// Columnas bajo agua no aplican a la cumbre: lago/océano dejan
				// superficie AIR y los charcos decorativos (isPondAt, sin gate de
				// temperatura por diseño F10) dejan WATER — ninguna debe contar
				// como cumbre emergida.
				if (surf !== B.AIR && surf !== B.WATER) peaksEmergidas++;
				if (
					h >= world.MOUNTAIN_SNOW_LINE - world.DESIGN_OFFSET &&
					surf !== B.AIR &&
					surf !== B.WATER
				) {
					peaksAtLine++;
					if (surf === B.SNOW) peaksSnowAtLine++;
				}
			}
		}
	}
}
check(
	"los picos nevados tienen columnas emergidas con nieve en la superficie",
	peaksAnySnow > 0 && peaksAnySnow <= peaksEmergidas,
	`${peaksAnySnow} nieve / ${peaksEmergidas} emergidas de ${peaksTotal} columnas`
);
// Las columnas bajo agua (lago/océano → superficie AIR, o charco decorativo
// → WATER, ambos por diseño) se excluyen del conteo de cumbres: la nieve
// aplica a la cumbre emergida.
check(
	"toda cumbre emergida de pico nevado (>= línea de nieve) tiene nieve",
	peaksAtLine === 0 || peaksSnowAtLine === peaksAtLine,
	`${peaksSnowAtLine}/${peaksAtLine} cumbres emergidas`
);

world.setDiskLoader(null);
process.exit(failed ? 1 : 0);
