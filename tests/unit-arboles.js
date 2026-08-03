"use strict";
// ============================================================
// REGRESIÓN: ÁRBOLES ASENTADOS EN EL SUELO (bug "árboles flotantes")
// El tronco debe empezar en el primer bloque de aire sobre la superficie
// (y = height) y descansar sobre el bloque de la superficie (y = height-1).
// Invariante: la base de cada tronco (OAK_LOG sin otro OAK_LOG debajo) tiene
// debajo un bloque sólido —césped en bosque/llanura—, nunca aire ni agua.
// Con el bug, la base quedaba en height+1 y debajo había aire (árbol flotante).
// ============================================================
const world = require("../server/world.js");
const { CHUNK_SIZE, WORLD_HEIGHT, B } = require("../server/constants.js");

let passed = 0,
	failed = 0;
function check(name, ok, info) {
	if (ok) passed++;
	else {
		failed++;
		console.log(`❌ ${name}${info ? "  (" + info + ")" : ""}`);
	}
}

// Generación fresca (sin leer disco) y RNG determinista: con Math.random = 0
// TODA columna de bosque/llanura genera un árbol (de altura 4). Así el test
// encuentra muchos troncos sin depender de la suerte.
world.setDiskLoader(() => null);
const realRandom = Math.random;
Math.random = () => 0;

try {
	const bases = [];
	let forestPlains = 0;
	for (let cx = -1; cx <= 1; cx++) {
		for (let cz = -1; cz <= 1; cz++) {
			world.generateChunk(cx, cz);
			const baseX = cx * CHUNK_SIZE,
				baseZ = cz * CHUNK_SIZE;
			for (let x = 0; x < CHUNK_SIZE; x++) {
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const biome = world.getBiome(baseX + x, baseZ + z);
					if (biome === "forest" || biome === "plains") forestPlains++;
					for (let y = 1; y < WORLD_HEIGHT; y++) {
						if (world.getBlock(baseX + x, y, baseZ + z) === B.OAK_LOG) {
							const below = world.getBlock(baseX + x, y - 1, baseZ + z);
							// Base de tronco = tronco sin otro tronco debajo
							if (below !== B.OAK_LOG)
								bases.push({ x: baseX + x, y, z: baseZ + z, below });
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
		bases.length > 0,
		`${bases.length} bases de tronco`
	);

	// Invariante principal del fix: ninguna base flota (debajo nunca aire/agua)
	const floating = bases.filter(
		(b) => b.below === B.AIR || b.below === B.WATER
	);
	check(
		"ningún tronco flota: base sobre bloque sólido",
		floating.length === 0,
		floating.length > 0
			? `ej. x=${floating[0].x} y=${floating[0].y} z=${floating[0].z} debajo=${floating[0].below}`
			: `${bases.length} troncos sobre superficie`
	);

	// Más fuerte: en bosque/llanura la base descansa sobre el césped (height-1)
	const notGrass = bases.filter((b) => b.below !== B.GRASS);
	check(
		"las bases descansan sobre césped (height-1)",
		notGrass.length === 0,
		notGrass
			.slice(0, 3)
			.map((b) => `x=${b.x} y=${b.y} debajo=${b.below}`)
			.join("; ")
	);
} finally {
	Math.random = realRandom;
}

console.log(
	failed === 0
		? `✅ unit-arboles: ${passed} checks OK`
		: `❌ unit-arboles: ${failed}/${passed + failed} fallaron`
);
process.exit(failed ? 1 : 0);
