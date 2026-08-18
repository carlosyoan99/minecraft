"use strict";
// ============================================================
// TESTS UNITARIOS DE BIOMAS (Fase 4: nieve + montaña)
// Verifica que la generación de world.js:
//   1. genera los 5 biomas (plains, forest, desert, snow, mountain)
//   2. las montañas elevan el terreno (alturas >> llanuras)
//   3. la superficie es nieve en tundra y en cumbres de montaña
//   4. la nieve es un bloque sólido y rompible (no en NOT_MINEABLE)
//   5. todo sigue siendo determinista (sin costuras)
// ============================================================
const world = require("../server/world.js");
const state = require("../server/state.js");
const {
	CHUNK_SIZE,
	WORLD_MIN_Y,
	WORLD_MAX_Y,
	B,
	isSolidBlock,
	NOT_MINEABLE
} = require("../server/constants.js");

// Fase 15 (D5): el índice local usa Y de MUNDO (local = mundo − WORLD_MIN_Y);
// getHeight devuelve Y de mundo (−8..+19) y columnFloorY, espacio de diseño.
function idx(x, y, z) {
	return ((y - WORLD_MIN_Y) * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		failedChecks.push(_name);
	}
};

// --- 1) Los 5 biomas existen en la semilla ---
const counts = {};
for (let wx = -100; wx <= 100; wx += 4) {
	for (let wz = -100; wz <= 100; wz += 4) {
		const b = world.getBiome(wx, wz);
		counts[b] = (counts[b] || 0) + 1;
	}
}
for (const b of ["plains", "forest", "desert", "snow", "mountain"]) {
	check(
		`bioma '${b}' existe en la semilla`,
		(counts[b] || 0) > 0,
		`${counts[b] || 0} muestras`
	);
}
// Fase 21 (A2): los sub-biomas de superficie nuevos existen (misma semilla).
for (const b of ["birch_forest", "giant_taiga", "snowy_peaks"]) {
	check(
		`sub-bioma '${b}' existe en la semilla`,
		(counts[b] || 0) > 0,
		`${counts[b] || 0} muestras`
	);
}

// --- 2) Las montañas elevan el terreno ---
let maxPlain = 0,
	maxMountain = 0,
	minMountain = Infinity,
	samples = 0;
for (let wx = -100; wx <= 100; wx += 2) {
	for (let wz = -100; wz <= 100; wz += 2) {
		const biome = world.getBiome(wx, wz);
		// Fase 21 (v21.2, D1): las columnas de agua (lecho de río/océano/lago)
		// no cuentan como terreno de montaña — el lecho del río baja al nivel
		// del mar (−7..−6) y es AGUA, no un valle del terreno. Antes el río
		// cortaba con lecho en −4; con D1 baja hasta −7 (cauce más profundo).
		if (world.columnFloorY(wx, wz) !== null) continue;
		const h = world.getHeight(wx, wz);
		if (biome === "mountain") {
			maxMountain = Math.max(maxMountain, h);
			minMountain = Math.min(minMountain, h);
			samples++;
		} else if (biome === "plains" || biome === "forest") {
			maxPlain = Math.max(maxPlain, h);
		}
	}
}
check(
	"las montañas existen (muestras > 0)",
	samples > 0,
	`${samples} muestras`
);
check(
	"la cima de montaña supera el techo de llanuras/bosques",
	maxMountain > maxPlain + 4,
	`montaña máx ${maxMountain} vs llanura máx ${maxPlain}`
);
// Fase 15 (D5): el diseño (máx 15, mín 3) se re-basa restando DESIGN_OFFSET
// (terreno anclado en ~0): cumbres desde y=7, valles nunca bajo y=−5.
check(
	"las montañas tienen terreno alto (máx >= 7)",
	maxMountain >= 15 - world.DESIGN_OFFSET,
	`máx ${maxMountain}`
);
check(
	"el valle de montaña no es más bajo que el suelo normal (mín >= −5)",
	minMountain >= 3 - world.DESIGN_OFFSET,
	`mín ${minMountain}`
);

// --- 3) Superficie: nieve en tundra y cumbres; roca en montañas bajas ---
world.setDiskLoader(() => null);
let snowSurface = 0,
	snowSurfaceMountain = 0,
	stoneSurfaceMountain = 0;
let grassSurface = 0,
	sandSurface = 0,
	waterSurface = 0;
for (let cx = -4; cx <= 4; cx++) {
	for (let cz = -4; cz <= 4; cz++) {
		world.generateChunk(cx, cz);
	}
}
for (let cx = -4; cx <= 4; cx++) {
	for (let cz = -4; cz <= 4; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				const biome = world.getBiome(wx, wz);
				const height = world.getHeight(wx, wz);
				const surf = data[idx(x, height - 1, z)];
				if (biome === "snow" && surf === B.SNOW) snowSurface++;
				// Fase 15 (D5): la línea de nieve (diseño 18) en Y de MUNDO es
				// MOUNTAIN_SNOW_LINE − DESIGN_OFFSET (cumbres desde y=10).
				if (
					biome === "mountain" &&
					height >= world.MOUNTAIN_SNOW_LINE - world.DESIGN_OFFSET &&
					surf === B.SNOW
				)
					snowSurfaceMountain++;
				if (
					biome === "mountain" &&
					height < world.MOUNTAIN_SNOW_LINE &&
					surf === B.STONE
				)
					stoneSurfaceMountain++;
				if (biome === "plains" && surf === B.GRASS) grassSurface++;
				if (biome === "desert" && surf === B.SAND) sandSurface++;
				// Lago: el lecho real es columnFloorY (diseño 1..3) re-basado a Y de
				// MUNDO (getHeight no contempla lagos; la profundidad es variable).
				if (
					world.isLake(wx, wz) &&
					data[idx(x, world.columnFloorY(wx, wz) - world.DESIGN_OFFSET, z)] ===
						B.SAND
				)
					waterSurface++;
			}
		}
	}
}
check(
	"la tundra tiene superficie de nieve",
	snowSurface > 0,
	`${snowSurface} columnas`
);
check(
	"las cumbres de montaña (>= SNOW_LINE) tienen nieve",
	snowSurfaceMountain > 0,
	`${snowSurfaceMountain} columnas`
);
check(
	"las montañas bajas (< SNOW_LINE) muestran roca",
	stoneSurfaceMountain > 0,
	`${stoneSurfaceMountain} columnas`
);
check(
	"las llanuras conservan césped",
	grassSurface > 0,
	`${grassSurface} columnas`
);
check("el desierto conserva arena", sandSurface > 0, `${sandSurface} columnas`);
check(
	"los lagos siguen teniendo fondo de arena",
	waterSurface > 0,
	`${waterSurface} columnas`
);

// --- 3b) Fase 21 (A2): vegetación de los sub-biomas nuevos ---
// Los árboles usan Math.random global: fijarlo durante la generación NO da
// un patrón de árboles exacto, así que los checks son de PRESENCIA (≥1
// bloque del tronco esperado por bioma) en el área -4..4 ya generada.
let birchLogs = 0,
	giantSpruceLogs = 0,
	spruceLogs = 0;
let birchLogInBirch = 0,
	giantLogInGiant = 0;
for (let cx = -4; cx <= 4; cx++) {
	for (let cz = -4; cz <= 4; cz++) {
		const d = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const biome = world.getBiome(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
				const height = world.getHeight(
					cx * CHUNK_SIZE + x,
					cz * CHUNK_SIZE + z
				);
				// Ciclo de 1 a 6 bloques por encima del suelo: el tronco (o la
				// base de un abeto gigante) está ahí si hubo árbol en la columna.
				for (let dy = 0; dy < 6; dy++) {
					const wy = height + dy;
					if (wy < WORLD_MIN_Y || wy > WORLD_MAX_Y) continue;
					const blk = d[idx(x, wy, z)];
					if (blk === B.BIRCH_LOG) {
						birchLogs++;
						if (biome === "birch_forest") birchLogInBirch++;
					} else if (blk === B.SPRUCE_LOG) {
						spruceLogs++;
						if (biome === "giant_taiga") giantLogInGiant++;
					}
				}
			}
		}
	}
}
// 1) El bosque de abedules contiene al menos un tronco de abedul (y no se
// limita a los abedules sueltos del bosque común).
check(
	"el bosque de abedules tiene troncos de abedul",
	birchLogInBirch > 0,
	`${birchLogInBirch} troncos`
);
// 2) La taiga gigante tiene abetos (tronco SPRUCE). Los checks de densidad
// exacta (2×2) viven en unit-fase21 (determinista con RNG sembrado).
check(
	"la taiga gigante tiene abetos gigantes",
	giantLogInGiant > 0,
	`${giantLogInGiant} troncos (de ${spruceLogs} de pino total)`
);

// --- 4) La nieve es sólida y rompible ---
check("isSolidBlock(SNOW) === true", isSolidBlock(B.SNOW) === true);
check(
	"SNOW no está en NOT_MINEABLE (se rompe a mano)",
	!NOT_MINEABLE.has(B.SNOW)
);

// --- 5) Transiciones suaves entre biomas (fix: sin acantilados) ---
// La altura se interpola de forma continua (blend por afinidad + rampa de
// montaña): cruzar una frontera de bioma no debe producir saltos de 8+
// bloques en una sola columna (el bug original saltaba de la altura de
// llanura a la de cordillera de golpe). Barrido de transectos con el salto
// máximo entre columnas adyacentes.
let maxJump = 0,
	jumpSample = null;
for (let z = -40; z <= 40; z += 8) {
	for (let wx = -200; wx < 200; wx++) {
		const h = world.getHeight(wx, z);
		const h2 = world.getHeight(wx + 1, z);
		const j = Math.abs(h2 - h);
		if (j > maxJump) {
			maxJump = j;
			jumpSample = { wx, z, h, h2 };
		}
	}
}
check(
	"altura continua entre columnas adyacentes (salto máximo <= 4)",
	maxJump <= 4,
	`salto máx ${maxJump} en x=${jumpSample.wx} z=${jumpSample.z} (${jumpSample.h}→${jumpSample.h2})`
);

// --- 6) Determinismo: regenerar un chunk de montaña es bit-idéntico ---
// Buscar un chunk con montaña para asegurarse de probar el caso difícil.
let mountainChunk = null;
outer: for (let cx = -4; cx <= 4; cx++) {
	for (let cz = -4; cz <= 4; cz++) {
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				if (
					world.getBiome(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z) ===
					"mountain"
				) {
					mountainChunk = { cx, cz };
					break outer;
				}
			}
		}
	}
}
check(
	"se encontró un chunk con montaña para el test de determinismo",
	mountainChunk !== null
);
if (mountainChunk) {
	const key = `${mountainChunk.cx},${mountainChunk.cz}`;
	// Los árboles usan Math.random (no determinista): fijarlo durante la
	// regeneración para que la comparación cubra solo la parte determinista
	// (ruido de terreno/ore/bioma), que es lo que este check quiere validar.
	const rnd = Math.random;
	Math.random = () => 0.5; // 0.5 >= 0.04 → no genera árboles en ninguna pasada
	state.chunks.delete(key);
	const a = world.generateChunk(mountainChunk.cx, mountainChunk.cz);
	state.chunks.delete(key);
	const b = world.generateChunk(mountainChunk.cx, mountainChunk.cz);
	Math.random = rnd;
	let diffs = 0;
	for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
	check(
		"regeneración de chunk con montaña bit-idéntica (sin árboles)",
		diffs === 0,
		`${diffs} diffs`
	);
}

world.setDiskLoader(null);
process.exit(failed ? 1 : 0);
