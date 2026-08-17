"use strict";
// ============================================================
// REGRESIÓN: ÁRBOLES ASENTADOS EN EL SUELO (bug "árboles flotantes")
// El tronco debe empezar en el primer bloque de aire sobre la superficie
// (y = height) y descansar sobre el bloque de la superficie (y = height-1).
// Invariante: la base de cada tronco (OAK_LOG sin otro OAK_LOG debajo) tiene
// debajo un bloque sólido —césped en bosque/llanura—, nunca aire ni agua.
// Con el bug, la base quedaba en height+1 y debajo había aire (árbol flotante).
//
// Fase 15 (A2): COPA COMPLETA. Con un RNG determinista disperso (LCG), cada
// árbol interior y aislado debe tener su copa 5×5 completa y simétrica en los
// 4 lados. El bug pisaba las hojas de +x/+z al regenerar las columnas
// posteriores (copa recortada). Se verifica por árbol aislado (|±x|,|±z|≤1)
// y de forma agregada (ratio de masa ±x/±z en rango). También se mide que la
// densidad no baje perceptiblemente (observado ≥ 0.5 × esperado por bioma).
// ============================================================
const world = require("../server/world.js");
const generation = require("../server/generation.js");
const {
	CHUNK_SIZE,
	WORLD_MIN_Y,
	WORLD_MAX_Y,
	B
} = require("../server/constants.js");

let _passed = 0,
	failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
function check(_name, ok, _info) {
	if (ok) _passed++;
	else {
		failed++;
		failedChecks.push(_name);
	}
}

// PRNG determinista (Park-Miller LCG): secuencia reproducible → el test no
// depende de la suerte de Math.random. Produce una densidad REALISTA de
// árboles (no el modo denso de la segunda sección).
function lcg(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}
const isLog = (b) =>
	b === B.OAK_LOG ||
	b === B.BIRCH_LOG ||
	b === B.SPRUCE_LOG ||
	b === B.JUNGLE_LOG;
const isLeaf = (b) =>
	b === B.OAK_LEAVES ||
	b === B.BIRCH_LEAVES ||
	b === B.SPRUCE_LEAVES ||
	b === B.JUNGLE_LEAVES;
// Vegetación decorativa que cubre el césped (no cuenta como superficie).
const VEG = new Set([B.TALL_GRASS, B.POPPY, B.DANDELION, B.VINES]);
// Probabilidad de árbol por bioma (constantes de generación en world.js).
const THRESH = {
	forest: 0.05,
	plains: 0.012,
	swamp: 0.02,
	taiga: 0.03,
	snow: 0.02,
	mountain: 0.02,
	jungle: 0.09
};

world.setDiskLoader(() => null);
// Fase 20 B4 (P4): la generación ya no consulta Math.random — usa un RNG
// determinista por chunk (setChunkRng lo sustituye en los tests).
try {
	// ================== SECCIÓN 1 (Fase 15 A2): copa completa ==================
	// Zona central [-3,3] con LCG: árboles dispersos, verificables por copa.
	generation.setChunkRng(() => lcg(12345));
	for (let cx = -3; cx <= 3; cx++)
		for (let cz = -3; cz <= 3; cz++) world.generateChunk(cx, cz);

	// Recolectar bases de tronco en el área interior [-2,2] (margen de 1 chunk
	// para que las copas de los árboles de análisis no queden fuera del área).
	// Fase 15 (D5): el barrido recorre la Y de MUNDO (−64..+63); los árboles
	// viven anclados en y≈0 (getHeight devuelve Y de mundo, −8..+19).
	const bases = [];
	for (let cx = -2; cx <= 2; cx++)
		for (let cz = -2; cz <= 2; cz++)
			for (let x = 0; x < CHUNK_SIZE; x++)
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const wx = cx * CHUNK_SIZE + x,
						wz = cz * CHUNK_SIZE + z;
					for (let y = WORLD_MIN_Y + 1; y <= WORLD_MAX_Y; y++) {
						if (isLog(world.getBlock(wx, y, wz))) {
							const below = world.getBlock(wx, y - 1, wz);
							if (!isLog(below)) bases.push({ wx, y, z: wz });
						}
					}
				}

	// Árbol "válido": el área 5×5 de su copa no cubre un charco/lago (la copa
	// se omite ahí deliberadamente) y el tronco está entero.
	const validos = bases.filter((b) => {
		let topY = -1;
		for (let y = b.y; y <= WORLD_MAX_Y; y++) {
			if (isLog(world.getBlock(b.wx, y, b.z))) topY = y;
			else break;
		}
		if (topY < 0) return false;
		for (let dx = -2; dx <= 2; dx++)
			for (let dz = -2; dz <= 2; dz++) {
				const wx = b.wx + dx,
					wz = b.z + dz;
				if (
					world.isPondAt(wx, wz) ||
					world.isLavaPondAt(wx, wz) ||
					world.isRiver(wx, wz) ||
					world.isLake(wx, wz) ||
					world.isSwampPoolAt(wx, wz)
				)
					return false;
			}
		return true;
	});

	check(
		"hay árboles válidos en la zona A2 (condición del test)",
		validos.length > 0,
		`${validos.length} válidos de ${bases.length} bases`
	);

	// --- 1a) Simetría AGREGADA: masa de hojas a ±x y ±z sobre todos los válidos.
	let pX = 0,
		mX = 0,
		pZ = 0,
		mZ = 0;
	for (const b of validos) {
		let topY = -1;
		for (let y = b.y; y <= WORLD_MAX_Y; y++) {
			if (isLog(world.getBlock(b.wx, y, b.z))) topY = y;
			else break;
		}
		const ymin = topY - 2,
			ymax = topY + 2;
		for (const [dx, dz, k] of [
			[1, 0, "px"],
			[-1, 0, "mx"],
			[0, 1, "pz"],
			[0, -1, "mz"]
		]) {
			for (let d = 1; d <= 2; d++) {
				const wx = b.wx + dx * d,
					wz = b.z + dz * d;
				for (let y = ymin; y <= ymax && y <= WORLD_MAX_Y; y++)
					if (isLeaf(world.getBlock(wx, y, wz))) {
						if (k === "px") pX++;
						else if (k === "mx") mX++;
						else if (k === "pz") pZ++;
						else mZ++;
					}
			}
		}
	}
	// El bug dejaba +x y +z en ~19% del lado opuesto; el fix los iguala (~1.0).
	const rX = pX / mX,
		rZ = pZ / mZ;
	check(
		"masa de hojas simétrica en ±x (0.7–1.43)",
		rX >= 0.7 && rX <= 1.43,
		`+x=${pX} -x=${mX} ratio=${rX.toFixed(2)}`
	);
	check(
		"masa de hojas simétrica en ±z (0.7–1.43)",
		rZ >= 0.7 && rZ <= 1.43,
		`+z=${pZ} -z=${mZ} ratio=${rZ.toFixed(2)}`
	);

	// --- 1b) Por árbol AISLADO: la copa completa en los 4 lados.
	// Aislado = sin otro tronco en radio 5 (las copas no se fusionan). Para
	// cada árbol, contar hojas adyacentes en los 4 lados (±x, ±z a 1-2 bloques
	// en el rango de copa). El bug anulaba por completo +x/+z (0 vs ~6); el
	// fix los iguala. Tolerancia amplia (ratio ≥ 0.5 y ≥1 hoja por lado) para
	// absorber pendientes y la esquina aleatoria del pino (no detectar falsos).
	const aislados = validos.filter(
		(b) =>
			!validos.some(
				(o) => o !== b && Math.abs(o.wx - b.wx) <= 5 && Math.abs(o.z - b.z) <= 5
			)
	);
	check(
		"hay árboles aislados para la verificación por copa",
		aislados.length > 0,
		`${aislados.length} aislados`
	);
	const asimetricos = aislados.filter((b) => {
		let topY = -1;
		for (let y = b.y; y <= WORLD_MAX_Y; y++) {
			if (isLog(world.getBlock(b.wx, y, b.z))) topY = y;
			else break;
		}
		const cnt = { px: 0, mx: 0, pz: 0, mz: 0 };
		const ymin = topY - 2,
			ymax = topY + 2;
		for (const [dx, dz, k] of [
			[1, 0, "px"],
			[-1, 0, "mx"],
			[0, 1, "pz"],
			[0, -1, "mz"]
		]) {
			for (let d = 1; d <= 2; d++) {
				const wx = b.wx + dx * d,
					wz = b.z + dz * d;
				for (let y = ymin; y <= ymax && y <= WORLD_MAX_Y; y++)
					if (isLeaf(world.getBlock(wx, y, wz))) cnt[k]++;
			}
		}
		const bajos = (a, b2) =>
			a === 0 || b2 === 0 || Math.min(a, b2) < 0.5 * Math.max(a, b2);
		return bajos(cnt.px, cnt.mx) || bajos(cnt.pz, cnt.mz);
	});
	check(
		"todo árbol aislado tiene la copa completa en los 4 lados",
		asimetricos.length === 0,
		asimetricos.length > 0
			? `ej. x=${asimetricos[0].wx} z=${asimetricos[0].z}`
			: `${aislados.length} copas completas`
	);

	// --- 1c) Densidad: no baja perceptiblemente (observado ≥ 0.5 × esperado).
	// El esperado es la suma de probabilidades por bioma sobre las columnas
	// arbolables (césped firme, en margen, sin charco). Con el fix el ratio
	// observado/esperado se mantiene ≥ ~1.7 (verificado en varias semillas).
	let observado = 0,
		esperado = 0,
		arbolables = 0;
	for (let cx = -2; cx <= 2; cx++)
		for (let cz = -2; cz <= 2; cz++)
			for (let x = 0; x < CHUNK_SIZE; x++)
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const wx = cx * CHUNK_SIZE + x,
						wz = cz * CHUNK_SIZE + z;
					const bm = world.getBiome(wx, wz);
					if (!THRESH[bm]) continue;
					let surf = B.AIR;
					for (let y = WORLD_MAX_Y; y >= WORLD_MIN_Y; y--) {
						const b = world.getBlock(wx, y, wz);
						if (b === B.WATER) break;
						if (b !== B.AIR && !VEG.has(b)) {
							surf = b;
							break;
						}
					}
					const enMargen =
						x >= 2 && x <= CHUNK_SIZE - 3 && z >= 2 && z <= CHUNK_SIZE - 3;
					const sinAgua =
						!world.isPondAt(wx, wz) &&
						!world.isLavaPondAt(wx, wz) &&
						!world.isRiver(wx, wz) &&
						!world.isLake(wx, wz) &&
						!world.isSwampPoolAt(wx, wz);
					for (let y = WORLD_MIN_Y + 1; y <= WORLD_MAX_Y; y++)
						if (isLog(world.getBlock(wx, y, wz))) {
							observado++;
							break;
						}
					if (surf === B.GRASS && enMargen && sinAgua) {
						arbolables++;
						esperado += THRESH[bm];
					}
				}
	check(
		"la densidad de árboles no baja perceptiblemente",
		observado >= 0.5 * esperado,
		`observado=${observado} esperado=${esperado.toFixed(1)} ratio=${(
			observado / esperado
		).toFixed(2)} (${arbolables} columnas arbolables)`
	);

	// ============ SECCIÓN 2 (regresión): árboles sobre el suelo ============
	// Modo denso (RNG = 0): TODA columna de bosque/llanura genera un árbol
	// (de altura 4). Zona lejana [8,12] para no chocar con el caché de la
	// sección 1 (generada con otra RNG). Así el test encuentra muchos troncos
	// sin depender de la suerte y verifica el invariante de no-flote.
	generation.setChunkRng(() => () => 0);
	for (let cx = 8; cx <= 12; cx++)
		for (let cz = 8; cz <= 12; cz++) world.generateChunk(cx, cz);

	const densas = [];
	let forestPlains = 0;
	for (let cx = 9; cx <= 11; cx++) {
		for (let cz = 9; cz <= 11; cz++) {
			const baseX = cx * CHUNK_SIZE,
				baseZ = cz * CHUNK_SIZE;
			for (let x = 0; x < CHUNK_SIZE; x++) {
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const biome = world.getBiome(baseX + x, baseZ + z);
					if (biome === "forest" || biome === "plains") forestPlains++;
					for (let y = WORLD_MIN_Y + 1; y <= WORLD_MAX_Y; y++) {
						if (world.getBlock(baseX + x, y, baseZ + z) === B.OAK_LOG) {
							const below = world.getBlock(baseX + x, y - 1, baseZ + z);
							// Base de tronco = tronco sin otro tronco debajo
							if (below !== B.OAK_LOG)
								densas.push({ x: baseX + x, y, z: baseZ + z, below });
						}
					}
				}
			}
		}
	}

	check(
		"hay columnas de bosque/llanura (condición del test)",
		forestPlains > 0,
		`${forestPlains} columnas`
	);
	check(
		"se generaron troncos en la zona de prueba",
		densas.length > 0,
		`${densas.length} bases de tronco`
	);

	// Invariante principal del fix: ninguna base flota (debajo nunca aire/agua)
	const floating = densas.filter(
		(b) => b.below === B.AIR || b.below === B.WATER
	);
	check(
		"ningún tronco flota: base sobre bloque sólido",
		floating.length === 0,
		floating.length > 0
			? `ej. x=${floating[0].x} y=${floating[0].y} z=${floating[0].z} debajo=${floating[0].below}`
			: `${densas.length} troncos sobre superficie`
	);

	// Más fuerte: en bosque/llanura la base descansa sobre el césped (height-1)
	const notGrass = densas.filter((b) => b.below !== B.GRASS);
	check(
		"las bases descansan sobre césped (height-1)",
		notGrass.length === 0,
		notGrass
			.slice(0, 3)
			.map((b) => `x=${b.x} y=${b.y} debajo=${b.below}`)
			.join("; ")
	);
} finally {
	generation.setChunkRng(null); // restaurar el RNG determinista por chunk
}
process.exit(failed ? 1 : 0);
