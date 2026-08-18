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
const { CHUNK_SIZE, WORLD_MIN_Y, B, I } = require("../server/constants.js");

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
for (const b of [
	"plains",
	"forest",
	"mountain",
	"snow",
	"taiga",
	"desert",
	"swamp",
	"jungle"
]) {
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
const subCounts = { birch_forest: 0, giant_taiga: 0, snowy_peaks: 0 };
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
	`${((birchF.birch / birchFTotal) * 100).toFixed(0)}% vs ${((forest.birch / forestTotal) * 100).toFixed(0)}% en forest`
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

// ============================================================
// FASE 21, Bloque B1 — pozo del desierto (estructura pasiva determinista)
// ============================================================
// Patrón del templo/naufragio (unit-fase12 §16-17): hash 2D con sal sobre
// celdas de 40×40, solo en desierto firme. Verifica:
//   7. determinismo — misma celda → mismo centro (wellCenterAt), y
//      wellAt devuelve el mismo footprint en llamadas repetidas,
//   8. ubicación — todo pozo está en desierto (getBiome) y nunca sobre
//      agua (columnFloorY nula, la fuente no sería una piscina flotante),
//   9. layout de bloques — el footprint 5×5 se genera como el pozo MC:
//      piso de arena, brocal de piedra de 2 capas en el borde, fuente de
//      agua central y aire en el interior (en el primer pozo de la semilla).
let wellsFound = 0;
let wellsInDesert = 0;
let wellsOnWater = 0;
let firstWell = null;
for (let ccx = -32; ccx < 32 && !firstWell; ccx++) {
	for (let ccz = -32; ccz < 32; ccz++) {
		const w = world.wellCenterAt(ccx, ccz);
		if (!w) continue;
		wellsFound++;
		if (world.getBiome(w.cx, w.cz) === "desert") wellsInDesert++;
		if (world.columnFloorY(w.cx, w.cz) !== null) wellsOnWater++;
		if (!firstWell) firstWell = w;
	}
}
check(
	"hay al menos 1 pozo del desierto en la semilla",
	wellsFound > 0,
	`${wellsFound} pozos en ±1280`
);
check(
	"todo pozo está en desierto",
	wellsFound === wellsInDesert,
	`${wellsInDesert}/${wellsFound} en desierto`
);
check(
	"ningún pozo sobre agua",
	wellsOnWater === 0,
	`${wellsOnWater} sobre agua`
);
// Determinismo: el centro de una celda dada y el footprint de una columna
// dada son estables entre llamadas (mismo hash 2D, sin Math.random).
if (firstWell) {
	const cellX = Math.floor(firstWell.cx / 40);
	const cellZ = Math.floor(firstWell.cz / 40);
	const again = world.wellCenterAt(cellX, cellZ);
	check(
		"wellCenterAt es determinista (misma celda → mismo centro)",
		again?.cx === firstWell.cx && again?.cz === firstWell.cz,
		`(${firstWell.cx},${firstWell.cz}) vs (${again?.cx},${again?.cz})`
	);
	const w1 = world.wellAt(firstWell.cx, firstWell.cz);
	// El footprint es 5×5 (dx,dz ∈ [−2,2]): +3 cae FUERA (el +1 del check
	// anterior queda dentro y devolvería el pozo correctamente).
	const w2 = world.wellAt(firstWell.cx + 3, firstWell.cz);
	const w3 = world.wellAt(firstWell.cx, firstWell.cz + 3);
	check(
		"wellAt devuelve el footprint (centro) y null fuera de él",
		w1 !== null && w1.cx === firstWell.cx && w2 === null && w3 === null,
		`centro ${w1 && w1.cx},${w1 && w1.cz} | fuera ${w2 || w3}`
	);
	// Layout de bloques del primer pozo: generar los chunks que tocan el
	// footprint 5×5 y comprobar el patrón del brocal (las capas y el bloque
	// central se leen como en el resto de asserts de estructura).
	const { cx: wx0, cz: wz0 } = firstWell;
	const R = 3;
	for (
		let cgx = Math.floor((wx0 - R) / 16);
		cgx <= Math.floor((wx0 + R) / 16);
		cgx++
	) {
		for (
			let cgz = Math.floor((wz0 - R) / 16);
			cgz <= Math.floor((wz0 + R) / 16);
			cgz++
		) {
			world.generateChunk(cgx, cgz);
		}
	}
	const baseY = world.getHeight(wx0, wz0);
	const blk = (wx, wz, y) => {
		const gx = Math.floor(wx / 16);
		const gz = Math.floor(wz / 16);
		const lx = ((wx % 16) + 16) % 16;
		const lz = ((wz % 16) + 16) % 16;
		const d = state.chunks.get(`${gx},${gz}`);
		return d[idx(lx, y, lz)];
	};
	let borderOk = 0;
	let borderCells = 0;
	let interiorAir = 0;
	let interiorCells = 0;
	let centerWater = false;
	let floorSand = 0;
	for (let dx = -2; dx <= 2; dx++) {
		for (let dz = -2; dz <= 2; dz++) {
			const wx = wx0 + dx;
			const wz = wz0 + dz;
			if (blk(wx, wz, baseY) === B.SAND) floorSand++;
			if (dx === 0 && dz === 0) {
				centerWater = blk(wx, wz, baseY + 1) === B.WATER;
				continue;
			}
			const border = Math.abs(dx) === 2 || Math.abs(dz) === 2;
			if (border) {
				borderCells++;
				if (
					blk(wx, wz, baseY + 1) === B.STONE &&
					blk(wx, wz, baseY + 2) === B.STONE
				)
					borderOk++;
			} else {
				interiorCells++;
				if (blk(wx, wz, baseY + 1) === B.AIR) interiorAir++;
			}
		}
	}
	check(
		"el pozo tiene piso de arena en todo el footprint",
		floorSand === 25,
		`${floorSand}/25`
	);
	check(
		"el pozo tiene brocal de piedra de 2 capas en el borde",
		borderOk === borderCells && borderCells === 16,
		`${borderOk}/${borderCells} celdas de borde`
	);
	check(
		"el pozo tiene aire en el interior (excepto la fuente)",
		interiorAir === interiorCells && interiorCells === 8,
		`${interiorAir}/${interiorCells} celdas interiores`
	);
	check("el pozo tiene la fuente de agua en el centro", centerWater);
}

// ============================================================
// FASE 21, Bloque B2 — pirámide del desierto (estructura activa).
// Patrón del pozo/wellAt pero con esquema de celdas propio
// (PYRAMID_CELL 48, gate 5 %, hash 2D con sal): solo en desierto firme,
// determinista. Verifica:
//   1. determinismo — misma celda → mismo centro; pyramidAt devuelve el
//      footprint y null fuera; la trampa (pyramidTrapAt) cae en el centro,
//   2. ubicación — todo pyramid está en desierto y nunca sobre agua,
//   3. layout de bloques — cofres en las esquinas de la bandeja subterránea
//      (foso 5×5, 2 de alto) con loot, y TNT en la celda central de la
//      placa; el pozo de bajada central es AIR de la cima al fondo.
// ============================================================
let pyramidsFound = 0;
let pyramidsInDesert = 0;
let pyramidsOnWater = 0;
let firstPyramid = null;
for (let ccx = -24; ccx < 24 && !firstPyramid; ccx++) {
	for (let ccz = -24; ccz < 24; ccz++) {
		const p = world.pyramidCenterAt(ccx, ccz);
		if (!p) continue;
		pyramidsFound++;
		if (world.getBiome(p.cx, p.cz) === "desert") pyramidsInDesert++;
		if (world.columnFloorY(p.cx, p.cz) !== null) pyramidsOnWater++;
		if (!firstPyramid) firstPyramid = p;
	}
}
check(
	"hay al menos 1 pirámide del desierto en la semilla",
	pyramidsFound > 0,
	`${pyramidsFound} pirámides en ±1152`
);
check(
	"toda pirámide está en desierto firme",
	pyramidsFound === pyramidsInDesert && pyramidsOnWater === 0,
	`${pyramidsInDesert}/${pyramidsFound} en desierto; ${pyramidsOnWater} sobre agua`
);
if (firstPyramid) {
	const cellX = Math.floor(firstPyramid.cx / 48);
	const cellZ = Math.floor(firstPyramid.cz / 48);
	const again = world.pyramidCenterAt(cellX, cellZ);
	check(
		"pyramidCenterAt es determinista (misma celda → mismo centro)",
		again !== null &&
			again.cx === firstPyramid.cx &&
			again.cz === firstPyramid.cz,
		`(${firstPyramid.cx},${firstPyramid.cz}) vs (${again && again.cx},${again && again.cz})`
	);
	const p1 = world.pyramidAt(firstPyramid.cx, firstPyramid.cz);
	const px = world.pyramidAt(firstPyramid.cx + 8, firstPyramid.cz);
	check(
		"pyramidAt devuelve el footprint (centro) y null fuera (8 bloques)",
		p1 !== null && p1.cx === firstPyramid.cx && px === null,
		`centro ${p1 && p1.cx} | fuera ${px}`
	);
	check(
		"pyramidTrapAt es true SOLO en la celda central",
		world.pyramidTrapAt(firstPyramid.cx, firstPyramid.cz) === true &&
			world.pyramidTrapAt(firstPyramid.cx + 1, firstPyramid.cz) === false,
		`centro ${world.pyramidTrapAt(firstPyramid.cx, firstPyramid.cz)} | +1 ${world.pyramidTrapAt(firstPyramid.cx + 1, firstPyramid.cz)}`
	);
	// Layout de bloques: generar los chunks que tocan el footprint 15×15 +
	// sótano (la bandeja) y comprobar cofres, TNT y pozo de bajada.
	const { cx: wx0, cz: wz0 } = firstPyramid;
	const R = 10;
	for (
		let cgx = Math.floor((wx0 - R) / 16);
		cgx <= Math.floor((wx0 + R) / 16);
		cgx++
	) {
		for (
			let cgz = Math.floor((wz0 - R) / 16);
			cgz <= Math.floor((wz0 + R) / 16);
			cgz++
		) {
			world.generateChunk(cgx, cgz);
		}
	}
	const pBaseY = world.getHeight(wx0, wz0);
	const pBlk = (wx, wz, y) => {
		const gx = Math.floor(wx / 16);
		const gz = Math.floor(wz / 16);
		const lx = ((wx % 16) + 16) % 16;
		const lz = ((wz % 16) + 16) % 16;
		const d = state.chunks.get(`${gx},${gz}`);
		return d[idx(lx, y, lz)];
	};
	// Bandeja: foso 5×5 bajo el centro (baseY-2 a baseY-1), cofres en las
	// esquinas interiores (±1,±1), TNT bajo la celda central (baseY-3).
	let chestsInPyramid = 0;
	let tntUnderCenter = false;
	let shaftOpen = true;
	for (let dx = -2; dx <= 2; dx++) {
		for (let dz = -2; dz <= 2; dz++) {
			if (Math.abs(dx) === 1 && Math.abs(dz) === 1) {
				if (pBlk(wx0 + dx, wz0 + dz, pBaseY - 2) === B.CHEST) chestsInPyramid++;
			}
		}
	}
	tntUnderCenter = pBlk(wx0, wz0, pBaseY - 3) === B.TNT;
	// Pozo de bajada central AIR desde el nivel superior (cima) hasta el piso.
	for (let dy = 0; dy < 7; dy++) {
		const y = pBaseY + dy;
		if (dy === 0) continue; // el hueco central del nivel 0 es AIR
		if (pBlk(wx0, wz0, y) !== B.AIR) {
			shaftOpen = false;
			break;
		}
	}
	check(
		"la pirámide tiene los 4 cofres en las esquinas de la bandeja",
		chestsInPyramid === 4,
		`${chestsInPyramid}/4 cofres`
	);
	check("la pirámide tiene TNT bajo la celda central (trampa)", tntUnderCenter);
	check(
		"el pozo de bajada central es AIR de la cima al piso (está abierto)",
		shaftOpen
	);
	// Los cofres de la pirámide se registran en state.chests con loot.
	let pyramidLootOk = 0;
	for (const [key, slots] of state.chests) {
		const m = key.split(",").map(Number);
		if (m.length !== 3) continue;
		if (Math.abs(m[0] - wx0) <= 2 && Math.abs(m[2] - wz0) <= 2) {
			if (Array.isArray(slots) && slots.some((s) => s && s.id)) pyramidLootOk++;
		}
	}
	check(
		"los cofres de la pirámide están en state.chests con loot",
		pyramidLootOk >= 1,
		`${pyramidLootOk} cofres con items`
	);
}

// ============================================================
// FASE 21, Bloque C1 — vaca ordeñable y gallina ponedora.
// Ordeñar (clic derecho con cubo sobre una vaca cercana) consume el cubo y
// da leche (I.MILK); la gallina pone un huevo (I.EGG) en el inventario del
// jugador más cercano cuando le toca (cooldown 5-10 min, tickChicken).
// ============================================================
{
	const tnt = require("../server/tnt.js");
	const actions = require("../server/actions.js");
	const inventory = require("../server/inventory.js");
	const mobsModule = require("../server/mobs.js");
	// Jugador con cubo en la mano, junto a una vaca.
	const p = {
		id: "cowP",
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		x: 0,
		y: 64,
		z: 0,
		ws: { readyState: 3, send() {} },
		inMenu: false
	};
	p.inventory[0] = { id: I.BUCKET, count: 1 };
	inventory.addToInventory(p, I.MILK, 0) === false; // (no op, deja el cubo)
	// Vaca a distancia corta (dentro del radio de ordeñar, 4 bloques).
	const cow = mobsModule.createMob("cow", 0, 64, 1);
	cow.id = "cow1";
	state.mobs.push(cow);
	const before = p.inventory.filter((s) => s && s.id === I.BUCKET).length;
	actions.handleMilkCow(p, { mobId: cow.id });
	const milkAfter = p.inventory.filter((s) => s && s.id === I.MILK).length;
	const bucketAfter = p.inventory.filter((s) => s && s.id === I.BUCKET).length;
	check(
		"ordeñar: consume el cubo y da leche (I.MILK)",
		bucketAfter === before - 1 && milkAfter === 1,
		`cubos ${before}→${bucketAfter}, leche ${milkAfter}`
	);
	// Sin cubo en la mano: no hace nada.
	const p2 = {
		id: "cowP2",
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		x: 0,
		y: 64,
		z: 0,
		ws: { readyState: 3, send() {} },
		inMenu: false
	};
	actions.handleMilkCow(p2, { mobId: cow.id });
	check(
		"ordeñar sin cubo: no da leche",
		p2.inventory.filter((s) => s && s.id === I.MILK).length === 0
	);
	// Gallina: forzar el cooldown a pasado y tickear con el jugador cerca.
	const hen = mobsModule.createMob("chicken", 0, 64, 2);
	hen.id = "hen1";
	hen.nextEggAt = 0; // ya le toca poner
	state.mobs.push(hen);
	const p3 = {
		id: "eggP",
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		x: 0,
		y: 64,
		z: 0,
		ws: { readyState: 3, send() {} },
		inMenu: false
	};
	state.players.set(p3.id, p3);
	hen.tickSpecies(false, p3, 2);
	check(
		"la gallina pone 1 huevo (I.EGG) en el jugador cercano",
		p3.inventory.filter((s) => s && s.id === I.EGG).length === 1,
		`huevos ${p3.inventory.filter((s) => s && s.id === I.EGG).length}`
	);
	state.mobs.length = 0;
	state.players.clear();
}

// ============================================================
// FASE 21, Bloque C2 — enderman neutral: solo agrede si lo miran.
// La línea de visión (isPlayerLookingAt) usa radianes (convención three
// cliente); mirando al enderman (aggro) → hostil contra ese jugador;
// sin mirar ni golpear → idle sin atacar.
// ============================================================
{
	const mobsModule = require("../server/mobs.js");
	const fakeWs = { readyState: 1, send() {} };
	const viewer = {
		id: "viewer",
		x: 0,
		y: 1.6,
		z: 0,
		yaw: 0,
		pitch: 0,
		gamemode: "survival",
		inMenu: false,
		ws: fakeWs
	};
	state.players.set(viewer.id, viewer);
	// Enderman delante (yaw 0 → mira a -Z): a 4 bloques al -Z.
	const e = mobsModule.createMob("enderman", 0, 0, -4);
	e.id = "end1";
	state.mobs.push(e);
	check(
		"isPlayerLookingAt(true): enderman delante de la mirada",
		mobsModule.isPlayerLookingAt(viewer, e) === true
	);
	viewer.yaw = Math.PI; // ahora mira a +Z (el enderman queda detrás)
	check(
		"isPlayerLookingAt(false): enderman tras la mirada",
		mobsModule.isPlayerLookingAt(viewer, e) === false
	);
	viewer.yaw = 0;
	check(
		"isEndermanWatched devuelve el jugador que lo mira",
		mobsModule.isEndermanWatched(e, state) === viewer
	);
	// tickEnderman con alguien mirándolo → aggro contra ese jugador.
	mobsModule.tickEnderman(e, false, viewer, 4);
	check(
		"al mirar al enderman se agrava contra el jugador (aggro 20s)",
		e.isAggroed() && e.aggroTarget === viewer.id,
		`aggro ${e.isAggroed()} target ${e.aggroTarget}`
	);
	// Enderman sin nadie que lo mire: no se agrava.
	state.players.clear();
	state.mobs.length = 0;
	state.players.set("lejos", {
		id: "lejos",
		x: 999,
		y: 1.6,
		z: 999,
		yaw: 0,
		pitch: 0,
		gamemode: "survival",
		inMenu: false,
		ws: fakeWs
	});
	const e2 = mobsModule.createMob("enderman", 0, 0, 0);
	e2.id = "end2";
	e2.aggroUntil = 0;
	e2.aggroTarget = null;
	mobsModule.tickEnderman(e2, false, state.players.get("lejos"), 999);
	check(
		"enderman sin mirada ni golpe: sigue neutral (sin aggro)",
		!e2.isAggroed() && !e2.aggroTarget
	);
	state.players.clear();
	state.mobs.length = 0;
}

// ============================================================
// FASE 21, Bloque D1 (v21.2) — ríos al nivel del mar
// ============================================================
// Bug de las Notas: "el agua no llega al nivel del mar, parecen un bug de
// generación". La iteración v21.2 (spec F21 §5.4, D1) rediseña el río:
//   - el cauce se clava SIEMPRE bajo el nivel del mar (RIVER_FLOOR_CAP = 2
//     en diseño → lecho en −7..−6 de mundo) y el agua lo cubre con ≥ 2
//     bloques (antes el lecho podía quedar en SEA_LEVEL−1 y la columna NO
//     generaba agua en terreno alto),
//   - las orillas se hunden gradualmente hacia el cauce (riverCarvedHeight)
//     → el salto orilla→cauce y el salto global del terreno quedan ≤ 4
//     (patrón unit-biomas §5; antes había acantilados de 8-10 bloques),
//   - menos densidad (RIVER_WIDTH 0.14 → 0.08: ~17 % → ~9 % de columnas)
//     y ancho VARIABLE (RIVER_WIDTH_VAR: tramos estrechos y amplios),
//   - más profundidad (riverDepth 3..6 vs 2..4).
// Verifica las invariantes con la semilla fija (los umbrales se calibraron
// midiendo la implementación D1: 9.18 % de columnas, salto máx 4, anchos
// 1..32).
const R = 4; // área 9×9 chunks (misma que la vegetación, reusada abajo)
let riverCols = 0;
let totalCols = 0;
let minRiverWater = Infinity;
let riverNoWater = 0;
let bankJumpsMax = 0;
const runLens = [];
for (let cx = -R; cx <= R; cx++) {
	for (let cz = -R; cz <= R; cz++) {
		const d = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x;
				const wz = cz * CHUNK_SIZE + z;
				totalCols++;
				if (!world.isRiver(wx, wz)) continue;
				riverCols++;
				// Agua del cauce: celdas entre el lecho y el nivel del mar.
				const floorW = world.columnFloorY(wx, wz) - world.DESIGN_OFFSET;
				let wc = 0;
				for (let y = world.WORLD_SEA_LEVEL - 1; y > floorW; y--) {
					if (d[idx(x, y, z)] === B.WATER) wc++;
				}
				if (wc < minRiverWater) minRiverWater = wc;
				if (wc === 0) riverNoWater++;
				// Salto de orilla: vecinos ortogonales que NO son río.
				for (const [dx, dz] of [
					[1, 0],
					[-1, 0],
					[0, 1],
					[0, -1]
				]) {
					if (world.isRiver(wx + dx, wz + dz)) continue;
					const j = Math.abs(world.getHeight(wx + dx, wz + dz) - floorW);
					if (j > bankJumpsMax) bankJumpsMax = j;
				}
			}
		}
	}
}
check(
	"D1: la densidad de ríos baja (fracción < 12 % vs ~17 % en v21.1)",
	riverCols / totalCols < 0.12 && riverCols / totalCols > 0.005,
	`${((riverCols / totalCols) * 100).toFixed(2)}% (${riverCols} de ${totalCols})`
);
check(
	"D1: todo río tiene agua en su cauce (lecho bajo el nivel del mar)",
	riverCols > 0 && riverNoWater === 0 && minRiverWater >= 2,
	`mín ${minRiverWater} celdas, ${riverNoWater} ríos sin agua`
);
check(
	"D1: orillas sin acantilados (salto orilla→cauce <= 4)",
	bankJumpsMax <= 4,
	`salto máx ${bankJumpsMax}`
);
// Racha de columnas de río en transectos X: anchos estrechos y amplios.
for (let wz = -R * CHUNK_SIZE; wz <= R * CHUNK_SIZE; wz++) {
	let run = 0;
	for (let wx = -R * CHUNK_SIZE; wx <= R * CHUNK_SIZE; wx++) {
		if (world.isRiver(wx, wz)) {
			run++;
		} else if (run > 0) {
			runLens.push(run);
			run = 0;
		}
	}
	if (run > 0) runLens.push(run);
}
runLens.sort((a, b) => a - b);
const minRun = runLens.length ? runLens[0] : 0;
const maxRun = runLens.length ? runLens[runLens.length - 1] : 0;
check(
	"D1: anchos variados (tramos estrechos <= 3 y amplios >= 8)",
	runLens.length > 0 && minRun <= 3 && maxRun >= 8,
	`${runLens.length} tramos, min ${minRun}, max ${maxRun}`
);
// Constantes calibradas (patrón A1/BIOME_FREQ): si alguien toca los
// valores, el test lo detecta antes de medir.
check(
	"D1: RIVER_WIDTH calibrado (0.08) y RIVER_FLOOR_CAP (2) exportados",
	biomes.RIVER_WIDTH === 0.08 && biomes.RIVER_FLOOR_CAP === 2,
	`width ${biomes.RIVER_WIDTH}, cap ${biomes.RIVER_FLOOR_CAP}`
);
// Salto GLOBAL del terreno con el valle del río (patrón unit-biomas §5):
// el carving de las orillas no puede crear acantilados en ningún transecto.
let d1MaxJump = 0;
for (let wz = -60; wz <= 60; wz += 2) {
	for (let wx = -300; wx < 300; wx++) {
		const j = Math.abs(world.getHeight(wx + 1, wz) - world.getHeight(wx, wz));
		if (j > d1MaxJump) d1MaxJump = j;
	}
}
check(
	"D1: el terreno con valles de río sigue continuo (salto máx <= 4)",
	d1MaxJump <= 4,
	`salto máx ${d1MaxJump}`
);

// ============================================================
// FASE 21.5, heredado D2 — océanos profundos/cálidos (spec F21.5 §1.4)
// ============================================================
// Bug de las Notas: "océanos poco profundos, sin variantes". La iteración
// D2 (diferida de F21 v21.2) subdivide el océano SIN tocar la probabilidad
// (OCEAN_FREQ/OCEAN_GATE intactos):
//   - "warm" (temp alta, banda de jungla → ~33% del océano) lleva arrecifes
//     de CORAL_BLOCK sobre el lecho (primera celda de agua, arena debajo),
//   - "deep" (cuenca honda, ~14%) baja el fondo a diseño 0..2 (agua 3..5;
//     antes el fondo era 1..3 en TODO el océano),
//   - "normal" (el resto) conserva la profundidad de v21.1.
// Verifica las invariantes con la semilla fija (umbrales calibrados
// midiendo la implementación D2: 32.9% warm, 14.3% deep, coral en 26.2% de
// las columnas cálidas, fondo deep hasta −8 de mundo).
const D2R = 8; // área 17×17 chunks
for (let cx = -D2R; cx <= D2R; cx++) {
	for (let cz = -D2R; cz <= D2R; cz++) {
		world.generateChunk(cx, cz);
	}
}
let d2OceanCols = 0,
	d2Warm = 0,
	d2Deep = 0;
let d2CoralCols = 0,
	d2BadCoral = 0;
let d2DeepFloorMin = Infinity;
for (let cx = -D2R; cx <= D2R; cx++) {
	for (let cz = -D2R; cz <= D2R; cz++) {
		const d = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				if (!world.isOcean(wx, wz)) continue;
				d2OceanCols++;
				const v = world.oceanVariant(wx, wz);
				const floorW = world.columnFloorY(wx, wz) - world.DESIGN_OFFSET;
				if (v === "warm") {
					d2Warm++;
					// Coral sobre el lecho: primera celda de agua = CORAL_BLOCK,
					// arena debajo y agua encima (invariante de arrecife).
					const b = d[idx(x, floorW + 1, z)];
					if (b === B.CORAL_BLOCK) {
						d2CoralCols++;
						if (d[idx(x, floorW, z)] !== B.SAND) d2BadCoral++;
						if (d[idx(x, floorW + 2, z)] !== B.WATER) d2BadCoral++;
					} else if (b !== B.WATER) d2BadCoral++;
				} else if (v === "deep") {
					d2Deep++;
					d2DeepFloorMin = Math.min(d2DeepFloorMin, floorW);
				}
			}
		}
	}
}
check(
	"D2: OCEAN_FREQ/OCEAN_GATE intactos (no se sube la probabilidad de océano)",
	biomes.OCEAN_FREQ === 0.0025 && biomes.OCEAN_GATE === 0.5,
	`freq ${biomes.OCEAN_FREQ}, gate ${biomes.OCEAN_GATE}`
);
check(
	"D2: existen regiones de océano cálido (minoría) y profundo",
	d2OceanCols > 0 && d2Warm > 0 && d2Deep > 0 && d2Warm / d2OceanCols < 0.5,
	`warm ${((d2Warm / d2OceanCols) * 100).toFixed(1)}%, deep ${((d2Deep / d2OceanCols) * 100).toFixed(1)}%`
);
check(
	"D2: el océano profundo baja el fondo (min ≤ −7 mundo, antes −6)",
	d2DeepFloorMin <= -7,
	`min ${d2DeepFloorMin}`
);
check(
	"D2: el océano cálido lleva arrecifes de coral válidos (arena + agua)",
	d2CoralCols > 0 && d2BadCoral === 0,
	`${d2CoralCols} columnas con coral, ${d2BadCoral} inválidas`
);

// ============================================================
// FASE 21.5, heredado D3 — montañas altas y nevadas (spec F21.5 §1.4)
// ============================================================
// Bug de las Notas: "las montañas son bajas; no hay montañas nevadas
// reales". D3 eleva la base de la cordillera (12 → 16 en heightFrom) y
// widen la rampa (MOUNTAIN_RAMP [0.4,0.65] → [0.35,0.7]) para repartir el
// desnivel extra sin romper el salto ≤ 4 (D1/audit-altura). v21.1: cima
// mundo 12, media 6.5, 14% de cumbres sobre la línea de nieve. Con D3:
// cima 16-17, media ~9.5, ~50-57% de cumbres nevadas (calibrado: 375 de
// 743 en la semilla). El techo queda en diseño ~31 (mundo ~23), bajo el
// presupuesto de audit-altura (máx ≤ 24).
let d3Samples = 0,
	d3Max = -Infinity,
	d3Sum = 0,
	d3Snow = 0;
for (let wx = -100; wx <= 100; wx += 2) {
	for (let wz = -100; wz <= 100; wz += 2) {
		if (world.columnFloorY(wx, wz) !== null) continue; // agua: no terreno
		if (world.getBiome(wx, wz) !== "mountain") continue;
		const h = world.getHeight(wx, wz);
		d3Samples++;
		d3Sum += h;
		d3Max = Math.max(d3Max, h);
		if (h >= world.MOUNTAIN_SNOW_LINE - world.DESIGN_OFFSET) d3Snow++;
	}
}
check(
	"D3: la cima de montaña crece vs v21.1 (max mundo >= 15, antes 12)",
	d3Max >= 15,
	`máx ${d3Max}`
);
check(
	"D3: la cima media crece vs v21.1 (media >= 8, antes ~6.5)",
	d3Samples > 0 && d3Sum / d3Samples >= 8,
	`media ${(d3Sum / d3Samples).toFixed(2)}`
);
check(
	"D3: la línea de nieve cubre más cumbres (>= 40%, antes ~14%)",
	d3Samples > 0 && d3Snow / d3Samples >= 0.4,
	`${((d3Snow / d3Samples) * 100).toFixed(1)}% (${d3Snow}/${d3Samples})`
);

world.setDiskLoader(null);
process.exit(failed ? 1 : 0);
