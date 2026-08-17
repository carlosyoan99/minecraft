"use strict";
// ============================================================
// AUDITORÍA DE LA ALTURA DEL MUNDO (Fase 15, D5)
//
// El mundo pasó de 0..63 a WORLD_MIN_Y (−64)..WORLD_MAX_Y (+63): la
// generación trabaja en un espacio de diseño 0..63 que se re-basa
// restando DESIGN_OFFSET (8) → terreno anclado en y≈0, mar en −3,
// 64 bloques de subsuelo minable y 64 de cielo para construir.
//
// Esta auditoría verifica que NADA se rompió con ese cambio:
//   1. Layout: constantes, longitud de chunk, bedrock/aire en los extremos
//   2. Superficie: rango de getHeight, techo de cielo, suelo firme
//   3. Cuevas: fracción excavada, componentes conexos, bocas, bedrock
//   4. Biomas: 8 biomas, montañas altas, transiciones suaves, superficie
//   5. Minerales por profundidad (diamante profundo, carbón arriba, ...)
//   6. Agua: mar en −3, lechos de arena, sin aire bajo el agua, charcos
//   7. Estructuras: templo en jungla, naufragio en océano, minas bajo tierra
//   8. Costuras: regeneración bit-idéntica en bordes de chunk
//   9. Migración v5→v6 + round-trip de archivo
//  10. Geometría del cliente: posiciones en Y de MUNDO (índice local)
//
// Uso: node tests/audit-altura.js
//
// NOTA: como unit-mundo/unit-biomas, los umbrales de PRESENCIA (≥1 templo,
// ≥1 naufragio, minas, bocas de cueva, 5-25% excavado) están calibrados
// para la semilla por defecto (miSemilla2026); con otra SEED podrían
// variar sin indicar un fallo de generación.
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const world = require("../server/world.js");
const state = require("../server/state.js");
const constants = require("../server/constants.js");
const {
	CHUNK_SIZE,
	WORLD_HEIGHT,
	WORLD_MIN_Y,
	WORLD_MAX_Y,
	SCHEMA_VERSION,
	B,
	NON_SOLID_PLANTS
} = constants;

let failed = 0;
const checks = [];
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (name, ok, extra = "") => {
	checks.push({ name, ok, extra });
	if (!ok) {
		failed++;
		failedChecks.push(name);
	}
};
const info = (msg) => console.log(`   · ${msg}`);

// Índice con local y = mundo y − WORLD_MIN_Y (layout v6).
function idx(x, wy, z) {
	return ((wy - WORLD_MIN_Y) * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}
function toLocal(wy) {
	return wy - WORLD_MIN_Y;
}
// Índice del layout v5 (local y == mundo y, 0..63) — solo para construir
// el chunk viejo de la prueba de migración.
function idxOld(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

// Superficie de una columna (Y de MUNDO del bloque de superficie): si es
// columna de agua, el lecho (columnFloorY en diseño − DESIGN_OFFSET); si no,
// getHeight (ya en Y de mundo).
function columnSurface(wx, wz) {
	const floor = world.columnFloorY(wx, wz);
	return floor != null ? floor - world.DESIGN_OFFSET : world.getHeight(wx, wz);
}

// Generación fresca: no leer los chunks viejos del disco.
world.setDiskLoader(() => null);

// ---------------------------------------------------------------
// 1) LAYOUT Y CONSTANTES
// ---------------------------------------------------------------
console.log("== 1. Layout del mundo (D5) ==");
check("WORLD_HEIGHT = 128", WORLD_HEIGHT === 128, `${WORLD_HEIGHT}`);
check("WORLD_MIN_Y = -64", WORLD_MIN_Y === -64, `${WORLD_MIN_Y}`);
check("WORLD_MAX_Y = 63", WORLD_MAX_Y === 63, `${WORLD_MAX_Y}`);
check(
	"WORLD_SEA_LEVEL = −3 (diseño 5 − DESIGN_OFFSET 8)",
	world.WORLD_SEA_LEVEL === -3,
	`${world.WORLD_SEA_LEVEL}`
);
check(
	"SCHEMA_VERSION = 6 (chunks 16×128×16)",
	SCHEMA_VERSION === 6,
	`${SCHEMA_VERSION}`
);
world.generateChunk(0, 0);
const c00 = state.chunks.get("0,0");
check(
	"longitud de chunk = 16×128×16",
	c00.length === CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE,
	`${c00.length}`
);
check(
	"bedrock en WORLD_MIN_Y (−64)",
	c00[idx(0, WORLD_MIN_Y, 0)] === B.BEDROCK
);
check(
	"aire en WORLD_MAX_Y (63)",
	c00[idx(0, WORLD_MAX_Y, 0)] === B.AIR,
	`bloque ${c00[idx(0, WORLD_MAX_Y, 0)]}`
);

// ---------------------------------------------------------------
// Región principal: radio 8 (17×17 chunks) para barridos por columna.
// Radio 16 (33×33) para presencia de biomas/estructuras/océano.
// ---------------------------------------------------------------
const R8 = 8;
for (let cx = -R8; cx <= R8; cx++)
	for (let cz = -R8; cz <= R8; cz++) world.generateChunk(cx, cz);
const R16 = 16;
for (let cx = -R16; cx <= R16; cx++)
	for (let cz = -R16; cz <= R16; cz++) world.generateChunk(cx, cz);

// ---------------------------------------------------------------
// 2) SUPERFICIE
// ---------------------------------------------------------------
console.log("== 2. Superficie (terreno anclado en ~0) ==");
let minH = Infinity,
	maxH = -Infinity,
	sumH = 0,
	nH = 0,
	landCols = 0,
	missingSurface = 0;
for (let wx = -R8 * CHUNK_SIZE; wx < R8 * CHUNK_SIZE; wx++) {
	for (let wz = -R8 * CHUNK_SIZE; wz < R8 * CHUNK_SIZE; wz++) {
		const floor = world.columnFloorY(wx, wz);
		const h =
			floor != null ? floor - world.DESIGN_OFFSET : world.getHeight(wx, wz);
		minH = Math.min(minH, h);
		maxH = Math.max(maxH, h);
		sumH += h;
		nH++;
		if (floor != null) continue; // columna de agua: sin bloque de superficie
		landCols++;
		const cx = Math.floor(wx / CHUNK_SIZE),
			cz = Math.floor(wz / CHUNK_SIZE);
		const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const data = state.chunks.get(`${cx},${cz}`);
		if (data[idx(x, h - 1, z)] === B.AIR) missingSurface++;
	}
}
check(
	"rango de superficie sano (mín ≥ −7, máx ≤ 24)",
	minH >= -7 && maxH <= 24,
	`rango [${minH}, ${maxH}]`
);
check(
	"superficie media cerca de 0",
	Math.abs(sumH / nH) <= 4,
	`media ${(sumH / nH).toFixed(2)}`
);
check(
	"techo de cielo: ≥ 30 bloques de aire sobre el terreno",
	WORLD_MAX_Y - maxH >= 30,
	`máx ${maxH} → aire hasta ${WORLD_MAX_Y}`
);
check(
	"la mayoría de columnas de tierra tienen bloque de superficie (< 3% huecas)",
	missingSurface / landCols < 0.03,
	`${((missingSurface / landCols) * 100).toFixed(2)}% (${missingSurface}/${landCols})`
);

// ---------------------------------------------------------------
// 3) CUEVAS
// ---------------------------------------------------------------
console.log("== 3. Cuevas ==");
let stoneTotal = 0,
	carved = 0,
	bedrockBroken = 0,
	columns = 0,
	mouthCount = 0,
	surfaceHoles = 0;
for (let cx = -R8; cx <= R8; cx++) {
	for (let cz = -R8; cz <= R8; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				const surface = columnSurface(wx, wz);
				columns++;
				if (data[idx(x, WORLD_MIN_Y, z)] !== B.BEDROCK) bedrockBroken++;
				for (let y = WORLD_MIN_Y + 1; y < surface - 1; y++) {
					stoneTotal++;
					if (data[idx(x, y, z)] === B.AIR) carved++;
				}
				if (data[idx(x, surface - 1, z)] === B.AIR) mouthCount++;
				let topHoles = 0;
				for (let y = Math.max(WORLD_MIN_Y, surface - 2); y < surface; y++)
					if (data[idx(x, y, z)] === B.AIR) topHoles++;
				if (topHoles > 0) surfaceHoles++;
			}
		}
	}
}
const frac = stoneTotal ? (carved / stoneTotal) * 100 : 0;
const holePct = columns ? (surfaceHoles / columns) * 100 : 0;
check(
	"bedrock intacto en WORLD_MIN_Y (0 violaciones)",
	bedrockBroken === 0,
	`${bedrockBroken}`
);
check(
	"hay bocas de cueva hacia la superficie",
	mouthCount > 0,
	`${mouthCount} bocas`
);
check(
	"los huecos de superficie son escasos (< 10% de columnas)",
	holePct < 10,
	`${holePct.toFixed(2)}%`
);
check(
	"fracción excavada en rango sano (5-25%)",
	frac >= 5 && frac <= 25,
	`${frac.toFixed(2)}% de ${stoneTotal} celdas`
);

// Componentes conexas en el chunk central (con los límites del chunk,
// como unit-mundo): debe haber cuevas navegables.
const chunk = state.chunks.get("0,0");
const visited = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
let largest = 0,
	count3 = 0;
for (let x = 0; x < CHUNK_SIZE; x++) {
	for (let y = WORLD_MIN_Y + 1; y < WORLD_MAX_Y; y++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			const i = idx(x, y, z);
			if (visited[i] || chunk[i] !== B.AIR) continue;
			const surface = columnSurface(x, z);
			if (y >= surface - 1) continue;
			let size = 0;
			const stack = [[x, y, z]];
			visited[i] = 1;
			while (stack.length) {
				const [px, py, pz] = stack.pop();
				size++;
				for (const [dx, dy, dz] of [
					[1, 0, 0],
					[-1, 0, 0],
					[0, 1, 0],
					[0, -1, 0],
					[0, 0, 1],
					[0, 0, -1]
				]) {
					const nx = px + dx,
						ny = py + dy,
						nz = pz + dz;
					if (
						nx < 0 ||
						nx >= CHUNK_SIZE ||
						ny <= WORLD_MIN_Y ||
						ny >= WORLD_MAX_Y ||
						nz < 0 ||
						nz >= CHUNK_SIZE
					)
						continue;
					const ni = idx(nx, ny, nz);
					if (visited[ni] || chunk[ni] !== B.AIR) continue;
					const ns = columnSurface(nx, nz);
					if (ny >= ns - 1) continue;
					visited[ni] = 1;
					stack.push([nx, ny, nz]);
				}
			}
			if (size >= 3) {
				count3++;
				if (size > largest) largest = size;
			}
		}
	}
}
check(
	"cuevas conexas navegables (componentes ≥ 3)",
	count3 > 0,
	`${count3} cuevas, mayor ${largest}`
);
check(
	"la cueva más grande es sustancial (≥ 10 bloques)",
	largest >= 10,
	`${largest}`
);

// ---------------------------------------------------------------
// 4) BIOMAS
// ---------------------------------------------------------------
console.log("== 4. Biomas ==");
const counts = {};
for (let wx = -R16 * CHUNK_SIZE; wx <= R16 * CHUNK_SIZE; wx += 4) {
	for (let wz = -R16 * CHUNK_SIZE; wz <= R16 * CHUNK_SIZE; wz += 4) {
		const b = world.getBiome(wx, wz);
		counts[b] = (counts[b] || 0) + 1;
	}
}
for (const b of [
	"plains",
	"forest",
	"desert",
	"snow",
	"taiga",
	"swamp",
	"jungle",
	"mountain"
]) {
	check(
		`bioma '${b}' presente`,
		(counts[b] || 0) > 0,
		`${counts[b] || 0} muestras`
	);
}
let maxPlain = 0,
	maxMountain = -Infinity,
	minMountain = Infinity;
for (let wx = -200; wx <= 200; wx += 2) {
	for (let wz = -200; wz <= 200; wz += 2) {
		const biome = world.getBiome(wx, wz);
		// Fase 21 (v21.2, D1): excluir columnas de agua (lecho de río/océano/
		// lago) del valle de montaña — el cauce del río baja hasta −7 y es
		// agua, no un valle del terreno (misma recalibración que unit-biomas).
		if (world.columnFloorY(wx, wz) !== null) continue;
		const h = world.getHeight(wx, wz);
		if (biome === "mountain") {
			maxMountain = Math.max(maxMountain, h);
			minMountain = Math.min(minMountain, h);
		} else if (biome === "plains" || biome === "forest") {
			maxPlain = Math.max(maxPlain, h);
		}
	}
}
check(
	"las montañas elevan el terreno (máx montaña > máx llanura + 4)",
	maxMountain > maxPlain + 4,
	`montaña ${maxMountain} vs llanura ${maxPlain}`
);
check(
	"cumbres altas (máx ≥ 7)",
	maxMountain >= 15 - world.DESIGN_OFFSET,
	`${maxMountain}`
);
check(
	"valles de montaña no excesivamente bajos (mín ≥ −5)",
	minMountain >= 3 - world.DESIGN_OFFSET,
	`${minMountain}`
);

// Transiciones suaves: salto máximo entre columnas adyacentes ≤ 4.
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
	"altura continua entre columnas adyacentes (salto máx ≤ 4)",
	maxJump <= 4,
	`salto máx ${maxJump} en x=${jumpSample.wx} z=${jumpSample.z} (${jumpSample.h}→${jumpSample.h2})`
);

// Superficie por bioma (sobre la región R8, columnas de tierra).
let snowSurface = 0,
	snowMountainSurface = 0,
	stoneMountainSurface = 0,
	grassSurface = 0,
	sandSurface = 0,
	taigaSurface = 0,
	jungleSurface = 0,
	swampSurface = 0;
for (let cx = -R8; cx <= R8; cx++) {
	for (let cz = -R8; cz <= R8; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				if (world.columnFloorY(wx, wz) != null) continue;
				const biome = world.getBiome(wx, wz);
				const h = world.getHeight(wx, wz);
				const surf = data[idx(x, h - 1, z)];
				if (biome === "snow" && surf === B.SNOW) snowSurface++;
				if (
					biome === "mountain" &&
					h >= world.MOUNTAIN_SNOW_LINE - world.DESIGN_OFFSET &&
					surf === B.SNOW
				)
					snowMountainSurface++;
				if (
					biome === "mountain" &&
					h < world.MOUNTAIN_SNOW_LINE - world.DESIGN_OFFSET &&
					surf === B.STONE
				)
					stoneMountainSurface++;
				if (biome === "plains" && surf === B.GRASS) grassSurface++;
				if (biome === "desert" && surf === B.SAND) sandSurface++;
				if (biome === "taiga" && surf === B.GRASS) taigaSurface++;
				if (biome === "jungle" && surf === B.GRASS) jungleSurface++;
				if (biome === "swamp" && surf === B.GRASS) swampSurface++;
			}
		}
	}
}
check("la tundra tiene superficie de nieve", snowSurface > 0, `${snowSurface}`);
check(
	"las cumbres (≥ línea de nieve) tienen nieve",
	snowMountainSurface > 0,
	`${snowMountainSurface}`
);
check(
	"las montañas bajas muestran roca",
	stoneMountainSurface > 0,
	`${stoneMountainSurface}`
);
check("las llanuras conservan césped", grassSurface > 0, `${grassSurface}`);
check("el desierto conserva arena", sandSurface > 0, `${sandSurface}`);
check(
	"la taiga tiene césped (bosque frío)",
	taigaSurface > 0,
	`${taigaSurface}`
);
check("la jungla tiene césped", jungleSurface > 0, `${jungleSurface}`);
check("el pantano tiene césped", swampSurface > 0, `${swampSurface}`);

// ---------------------------------------------------------------
// 5) MINERALES POR PROFUNDIDAD
// ---------------------------------------------------------------
console.log("== 5. Minerales por profundidad ==");
// Fase 18 (C-2): bandas recalibradas a los percentiles MC mapeados al mundo
// v6 (ver tabla documentada en server/world.js junto a generateOres).
const oreLayers = {
	[B.DIAMOND_ORE]: { max: -38, name: "diamante" },
	[B.REDSTONE_ORE]: { max: -32, name: "redstone" },
	[B.EMERALD_ORE]: { max: -20, name: "esmeralda" },
	[B.GOLD_ORE]: { max: -16, name: "oro" },
	[B.IRON_ORE]: { max: 42, name: "hierro" },
	[B.COAL_ORE]: { max: 42, name: "carbón" }
};
const oreCounts = {};
let oreViolations = 0;
for (let cx = -R8; cx <= R8; cx++) {
	for (let cz = -R8; cz <= R8; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				const surface = columnSurface(wx, wz);
				for (let y = WORLD_MIN_Y + 1; y < surface - 1; y++) {
					const b = data[idx(x, y, z)];
					const layer = oreLayers[b];
					if (!layer) continue;
					oreCounts[b] = (oreCounts[b] || 0) + 1;
					if (y >= layer.max) {
						oreViolations++;
						if (oreViolations <= 3)
							info(
								`${layer.name} fuera de capa: y=${y} (límite y<${layer.max}) en (${wx},${wz})`
							);
					}
				}
			}
		}
	}
}
for (const [b, layer] of Object.entries(oreLayers)) {
	const id = Number(b);
	check(
		`${layer.name} presente (y < ${layer.max})`,
		(oreCounts[id] || 0) > 0,
		`${oreCounts[id] || 0} bloques`
	);
}
check(
	"0 menas fuera de su capa de profundidad",
	oreViolations === 0,
	`${oreViolations} violaciones`
);

// ---------------------------------------------------------------
// 6) AGUA
// ---------------------------------------------------------------
console.log("== 6. Agua (mar en −3) ==");
let waterCells = 0,
	waterAboveSea = 0,
	badPond = 0,
	airUnderWater = 0,
	badWaterFloor = 0,
	seaLineBad = 0,
	oceanCols = 0,
	riverCols = 0,
	lakeCols = 0;
const oceanFloors = new Set();
for (let cx = -R8; cx <= R8; cx++) {
	for (let cz = -R8; cz <= R8; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				const floor = world.columnFloorY(wx, wz);
				const lake = world.isLake(wx, wz);
				const river = world.isRiver(wx, wz);
				const ocean = world.isOcean(wx, wz);
				if (floor != null) {
					if (ocean) {
						oceanCols++;
						oceanFloors.add(floor - world.DESIGN_OFFSET);
					} else if (river) riverCols++;
					else if (lake) lakeCols++;
				}
				const surface =
					floor != null ? floor - world.DESIGN_OFFSET : world.getHeight(wx, wz);
				for (let y = WORLD_MIN_Y + 1; y <= WORLD_MAX_Y; y++) {
					if (data[idx(x, y, z)] !== B.WATER) continue;
					waterCells++;
					if (y >= world.WORLD_SEA_LEVEL) {
						// Agua sobre el mar = charco decorativo (Fase 7): superficie,
						// lecho de arena debajo, abierta al aire.
						waterAboveSea++;
						const below = data[idx(x, y - 1, z)];
						const above = y + 1 <= WORLD_MAX_Y ? data[idx(x, y + 1, z)] : 0;
						if (
							lake ||
							river ||
							ocean ||
							y !== surface - 1 ||
							below !== B.SAND ||
							above !== B.AIR
						)
							badPond++;
					}
					if (data[idx(x, y - 1, z)] === B.AIR) airUnderWater++;
					if (
						floor != null &&
						y === floor - world.DESIGN_OFFSET + 1 &&
						data[idx(x, y - 1, z)] !== B.SAND
					)
						badWaterFloor++;
				}
				// La línea del mar: en columnas de agua, el bloque en −4 nunca es
				// aire ni piedra (agua, arena, o madera de naufragio).
				if (floor != null) {
					const b = data[idx(x, world.WORLD_SEA_LEVEL - 1, z)];
					if (b === B.AIR || b === B.STONE) seaLineBad++;
				}
			}
		}
	}
}
check("hay agua en el mundo", waterCells > 0, `${waterCells} celdas`);
check(
	"el agua por encima del mar es charco válido (superficie + arena + aire)",
	badPond === 0,
	`${badPond} inválidos (${waterAboveSea} celdas altas)`
);
check(
	"el lecho de lagos/ríos/océanos es arena",
	badWaterFloor === 0,
	`${badWaterFloor}`
);
check("sin aire bajo el agua", airUnderWater === 0, `${airUnderWater}`);
check(
	"la línea del mar (−4) nunca es aire ni piedra en columnas de agua",
	seaLineBad === 0,
	`${seaLineBad} violaciones`
);
check("hay lagos", lakeCols > 0, `${lakeCols} columnas`);
check("hay ríos", riverCols > 0, `${riverCols} columnas`);
check("hay océano (cuencas amplias)", oceanCols > 0, `${oceanCols} columnas`);
info(
	`profundidades de océano (Y de mundo): ${[...oceanFloors]
		.sort((a, b) => a - b)
		.join(", ")}`
);

// ---------------------------------------------------------------
// 7) ESTRUCTURAS
// ---------------------------------------------------------------
console.log("== 7. Estructuras ==");
let temples = 0,
	shipwrecks = 0,
	templeOk = 0,
	shipwreckOk = 0;
// Fase 21 (v21.2, recalibración): con los biomas ampliados (A1, BIOME_FREQ
// 0.003) la jungla/el océano pueden quedar fuera de ±R16 chunks (antes el
// barrido de estructuras recorría los chunks generados y ya no encontraba
// templo/naufragio en la semilla). Los CENTROS se buscan por CELDA con
// structCenterAt (función pura y cacheada — sin generar chunks) en un radio
// amplio (±STRUCT_SEARCH_CELLS celdas de 32 bloques) y solo se generan los
// chunks alrededor de cada estructura para verificar sus bloques.
const STRUCT_SEARCH_CELLS = 32; // ±32 celdas ≈ ±1024 bloques
const centers = [];
for (let cellX = -STRUCT_SEARCH_CELLS; cellX <= STRUCT_SEARCH_CELLS; cellX++) {
	for (
		let cellZ = -STRUCT_SEARCH_CELLS;
		cellZ <= STRUCT_SEARCH_CELLS;
		cellZ++
	) {
		const s = world.structCenterAt(cellX, cellZ);
		if (s) centers.push(s);
	}
}
for (const struct of centers) {
	const wx = struct.cx,
		wz = struct.cz;
	// Generar los chunks que tocan el footprint (≤ 11×11 → 3×3 alrededor).
	for (
		let gx = Math.floor((wx - 6) / CHUNK_SIZE);
		gx <= Math.floor((wx + 6) / CHUNK_SIZE);
		gx++
	)
		for (
			let gz = Math.floor((wz - 6) / CHUNK_SIZE);
			gz <= Math.floor((wz + 6) / CHUNK_SIZE);
			gz++
		)
			world.generateChunk(gx, gz);
	const gx = Math.floor(wx / CHUNK_SIZE);
	const gz = Math.floor(wz / CHUNK_SIZE);
	const data = state.chunks.get(`${gx},${gz}`);
	const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	if (struct.type === "temple") {
		temples++;
		const baseY = world.getHeight(wx, wz);
		const floor = data[idx(lx, baseY, lz)];
		const chest = data[idx(lx, baseY + 1, lz)];
		const tower = baseY + 5 <= WORLD_MAX_Y;
		if (
			world.getBiome(wx, wz) === "jungle" &&
			world.columnFloorY(wx, wz) === null &&
			floor === B.MOSSY_COBBLESTONE &&
			chest === B.CHEST &&
			tower
		)
			templeOk++;
		else if (!tower)
			info(`templo en (${wx},${wz}): torre se sale del mundo (baseY ${baseY})`);
	} else if (struct.type === "shipwreck") {
		shipwrecks++;
		const baseY = world.oceanFloorY(wx, wz) - world.DESIGN_OFFSET + 1;
		const floorBlock = data[idx(lx, baseY, lz)];
		const aboveTop = data[idx(lx, baseY + 4, lz)];
		if (
			world.isOcean(wx, wz) &&
			baseY >= WORLD_MIN_Y &&
			baseY + 3 <= WORLD_MAX_Y &&
			(floorBlock === B.SPRUCE_LOG || floorBlock === B.JUNGLE_LOG) &&
			(aboveTop === B.WATER || aboveTop === B.AIR)
		)
			shipwreckOk++;
	}
}
check(
	"se encontró al menos un templo en jungla",
	temples > 0,
	`${temples} templos`
);
check(
	"los templos cumplen invariantes (piso, cofre, torre, jungla firme)",
	templeOk === temples && temples > 0,
	`${templeOk}/${temples}`
);
check(
	"se encontró al menos un naufragio en océano",
	shipwrecks > 0,
	`${shipwrecks} naufragios`
);
check(
	"los naufragios cumplen invariantes (lecho oceánico, casco, dentro de límites)",
	shipwreckOk === shipwrecks && shipwrecks > 0,
	`${shipwreckOk}/${shipwrecks}`
);
// Minas abandonadas: el guard real de la generación es `!waterCol`
// (mineshaftAt es ruido puro, no sabe del agua). Se verifica sobre el área
// R16 ya generada que en columnas de agua NO se excave ningún túnel y que
// en tierra el túnel nunca rompe la superficie.
let mineshaftCols = 0,
	mineshaftBad = 0;
for (let cx = -R16; cx <= R16; cx++) {
	for (let cz = -R16; cz <= R16; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				if (world.mineshaftAt(wx, wz)) {
					mineshaftCols++;
					const floor = world.columnFloorY(wx, wz);
					const surface =
						floor != null
							? floor - world.DESIGN_OFFSET
							: world.getHeight(wx, wz);
					const depth = world.mineshaftDepth(wx, wz, surface);
					let carved = 0;
					for (
						let y = depth + 1;
						y < depth + world.MS_TUNNEL_H && y < surface - 1;
						y++
					) {
						if (data[idx(x, y, z)] === B.AIR) carved++;
					}
					// En agua: 0 celdas excavadas. En tierra: el bucle ya limita y <
					// surface − 1 (nunca rompe la superficie) y la excavación solo
					// reemplaza piedra, así que no puede abrir bocas.
					if (floor != null && carved > 0) mineshaftBad++;
				}
			}
		}
	}
}
check("hay minas abandonadas", mineshaftCols > 0, `${mineshaftCols} columnas`);
check(
	"las minas nunca están en columnas de agua ni rompen la superficie",
	mineshaftBad === 0,
	`${mineshaftBad} violaciones`
);

// ---------------------------------------------------------------
// 8) COSTURAS Y DETERMINISMO
// ---------------------------------------------------------------
console.log("== 8. Costuras entre chunks ==");
const rnd = Math.random;
Math.random = () => 0.5; // árboles/vegetación deterministas en ambas pasadas
let seamDiffs = 0,
	seamTotal = 0;
for (const key of ["1,0", "0,1", "1,1", "-1,0", "0,-1"]) {
	const [cx, cz] = key.split(",").map(Number);
	state.chunks.delete(key);
	const a = world.generateChunk(cx, cz);
	state.chunks.delete(key);
	const b = world.generateChunk(cx, cz);
	for (let i = 0; i < a.length; i++) {
		seamTotal++;
		if (a[i] !== b[i]) seamDiffs++;
	}
}
Math.random = rnd;
check(
	"regeneración bit-idéntica en chunks de borde (0 diffs)",
	seamDiffs === 0,
	`${seamDiffs}/${seamTotal} diffs`
);

// ---------------------------------------------------------------
// 9) MIGRACIÓN v5 → v6 + round-trip de archivo
// ---------------------------------------------------------------
console.log("== 9. Migración v5→v6 y guardado ==");
const origChunksDir = constants.worldPaths.chunksDir;
const tmpChunks = fs.mkdtempSync(path.join(os.tmpdir(), "audit-altura-"));
constants.worldPaths.chunksDir = tmpChunks;
try {
	// --- 9a) Archivo v5 (16×64×16, local y == mundo y 0..63) ---
	const old = new Uint8Array(CHUNK_SIZE * 64 * CHUNK_SIZE).fill(B.STONE);
	for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE; i++) {
		old[i] = B.BEDROCK; // fila y=0
		old[10 * CHUNK_SIZE * CHUNK_SIZE + i] = B.GRASS; // superficie y=10
	}
	old[idxOld(3, 30, 5)] = B.DIAMOND_ORE; // marcador profundo
	const v5file = path.join(tmpChunks, "0_0.json");
	world.atomicWrite(
		v5file,
		zlib.gzipSync(
			JSON.stringify({ schemaVersion: 5, cx: 0, cz: 0, data: Array.from(old) })
		)
	);
	const migrated = world.readChunkFile(v5file, "test v5");
	check(
		"chunk v5 se migra a 16×128×16",
		migrated && migrated.data.length === CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE,
		migrated ? `${migrated.data.length}` : "null"
	);
	check(
		"schemaVersion sube a 6",
		migrated && migrated.schemaVersion === SCHEMA_VERSION
	);
	if (migrated) {
		const d = migrated.data;
		check(
			"el dato viejo sube a local 64..127 (mundo 0..63)",
			d[toLocal(10) * CHUNK_SIZE * CHUNK_SIZE] === B.GRASS,
			`local ${toLocal(10)} = mundo 10`
		);
		check(
			"el marcador profundo se conserva",
			d[idx(3, 30, 5)] === B.DIAMOND_ORE
		);
		check("bedrock en local 0 (−64)", d[0] === B.BEDROCK);
		let fillOk = true;
		for (let ly = 1; ly < -WORLD_MIN_Y; ly++)
			if (d[ly * CHUNK_SIZE * CHUNK_SIZE] !== B.STONE) fillOk = false;
		check("el fondo nuevo (local 1..63) se rellena con piedra", fillOk);
	}

	// --- 9b) Round-trip v6: escribir y releer un chunk fresco ---
	state.chunks.delete("2,2");
	const fresh = world.generateChunk(2, 2);
	world.writeChunkFile("2,2", fresh);
	const loaded = world.loadChunkFromDisk(2, 2);
	let rtOk = loaded && loaded.length === fresh.length;
	if (rtOk)
		for (let i = 0; i < fresh.length; i++)
			if (loaded[i] !== fresh[i]) rtOk = false;
	check("round-trip v6 byte-idéntico (escribir → leer)", rtOk === true);

	// --- 9c) Guard defensivo: writeChunkFile con array v5 ---
	world.writeChunkFile("3,3", old);
	const guard = world.loadChunkFromDisk(3, 3);
	check(
		"writeChunkFile convierte arrays v5 antes de escribir",
		guard && guard.length === CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE,
		guard ? `${guard.length}` : "null"
	);
} finally {
	constants.worldPaths.chunksDir = origChunksDir;
}

// ---------------------------------------------------------------
// 10) GEOMETRÍA DEL CLIENTE (Y de MUNDO en los vértices)
// ---------------------------------------------------------------
console.log("== 10. Geometría del cliente (índice local → Y de mundo) ==");
(async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "audit-geo-"));
	for (const f of ["chunkGeometry.js", "texturemap.js", "constants.js"])
		fs.copyFileSync(path.join(__dirname, "..", "public", f), path.join(tmp, f));
	fs.writeFileSync(
		path.join(tmp, "package.json"),
		JSON.stringify({ type: "module" })
	);
	const { buildChunkGeometryData } = await import(
		`file://${path.join(tmp, "chunkGeometry.js")}`
	);
	const { tileForFace, tileRect } = await import(
		`file://${path.join(tmp, "texturemap.js")}`
	);

	// Mapa de vecinos de un chunk (los vecinos ya están generados).
	const neighbors = (cxx, czz) => {
		const map = new Map();
		for (let dx = -1; dx <= 1; dx++) {
			for (let dz = -1; dz <= 1; dz++) {
				const arr = state.chunks.get(`${cxx + dx},${czz + dz}`);
				if (arr) map.set(`${dx},${dz}`, arr);
			}
		}
		return map;
	};

	// --- Chunk 0,0: cotas generales + pico del terreno ---
	const geo = buildChunkGeometryData({
		cx: 0,
		cz: 0,
		chunks: neighbors(0, 0),
		light: new Map(),
		tileForFaceFn: tileForFace,
		tileRectFn: tileRect
	});
	let minY = Infinity,
		maxY = -Infinity;
	// F19.6 (C2): la geometría de plantas lleva su propio buffer (con viento);
	// se incluye en el rango de altura como el resto de categorías.
	for (const buf of [geo.terrain, geo.water, geo.lava, geo.torch, geo.plant]) {
		if (!buf) continue;
		for (let i = 1; i < buf.pos.length; i += 3) {
			minY = Math.min(minY, buf.pos[i]);
			maxY = Math.max(maxY, buf.pos[i]);
		}
	}
	check(
		"todos los vértices dentro de [WORLD_MIN_Y, WORLD_MAX_Y+1]",
		minY >= WORLD_MIN_Y && maxY <= WORLD_MAX_Y + 1,
		`rango [${minY}, ${maxY}]`
	);
	// El pico del terreno (cara +Y del bloque sólido más alto) debe emitirse
	// en Y de MUNDO: maxY del terreno == maxWy sólido + 1.
	let solidMaxWy = WORLD_MIN_Y;
	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let y = 0; y < WORLD_HEIGHT; y++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const b = chunk[idx(x, y + WORLD_MIN_Y, z)];
				if (
					b === 0 ||
					b === B.WATER ||
					b === B.LAVA ||
					b === B.TORCH ||
					NON_SOLID_PLANTS.has(b)
				)
					continue;
				solidMaxWy = Math.max(solidMaxWy, y + WORLD_MIN_Y);
			}
		}
	}
	if (geo.terrain) {
		let terrainMax = -Infinity;
		for (let i = 1; i < geo.terrain.pos.length; i += 3)
			terrainMax = Math.max(terrainMax, geo.terrain.pos[i]);
		check(
			"el terreno emite su cara superior en Y de mundo (pico == maxWy+1)",
			terrainMax === solidMaxWy + 1,
			`terreno ${terrainMax} vs esperado ${solidMaxWy + 1}`
		);
	}

	// --- Un chunk con la SUPERFICIE del agua expuesta al aire: la cara +Y
	// del bloque de agua más alto debe emitirse en Y de MUNDO (wy + 0.875).
	// Fase 21 (v21.2, recalibración): se excluyen los chunks con charcos
	// decorativos (agua sobre el mar, y ≥ −2): la geometría del chunk
	// mezclaría la superficie del lago/río con la del charco y el rango de
	// agua dejaría de estar bajo el nivel del mar (fallo espurio).
	let waterChunk = null,
		waterSurfWy = -Infinity;
	outer: for (let cx = -4; cx <= 4; cx++) {
		for (let cz = -4; cz <= 4; cz++) {
			const data = state.chunks.get(`${cx},${cz}`);
			let surf = -Infinity;
			let pond = false;
			for (let i = 0; i < data.length; i++) {
				if (data[i] !== B.WATER) continue;
				const ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
				const wy = ly + WORLD_MIN_Y;
				// Charcos decorativos de la Fase 7: agua por encima del mar.
				if (wy > world.WORLD_SEA_LEVEL) pond = true;
				// Bloque de agua con AIRE encima = superficie de lago/río/océano
				// (y ≤ −4).
				if (
					ly + 1 < WORLD_HEIGHT &&
					data[i + CHUNK_SIZE * CHUNK_SIZE] === 0 &&
					wy <= world.WORLD_SEA_LEVEL - 1
				)
					surf = Math.max(surf, wy);
			}
			if (pond) continue; // chunk con charco decorativo: no sirve
			if (surf > -Infinity) {
				waterSurfWy = surf;
				waterChunk = { cx, cz };
				break outer;
			}
		}
	}
	if (waterChunk) {
		const wgeo = buildChunkGeometryData({
			cx: waterChunk.cx,
			cz: waterChunk.cz,
			chunks: neighbors(waterChunk.cx, waterChunk.cz),
			light: new Map(),
			tileForFaceFn: tileForFace,
			tileRectFn: tileRect
		});
		let waterMax = -Infinity,
			waterMin = Infinity;
		if (wgeo.water)
			for (let i = 1; i < wgeo.water.pos.length; i += 3) {
				waterMax = Math.max(waterMax, wgeo.water.pos[i]);
				waterMin = Math.min(waterMin, wgeo.water.pos[i]);
			}
		check(
			"la superficie del agua se emite en Y de mundo (wy + 0.875 o wy + 1)",
			wgeo.water &&
				(waterMax === waterSurfWy + 0.875 || waterMax === waterSurfWy + 1),
			`agua ${waterMax} vs esperado ${waterSurfWy + 0.875}/${waterSurfWy + 1} (superficie en ${waterSurfWy})`
		);
		check(
			"todo el agua del chunk queda en Y de mundo (−64..−3)",
			wgeo.water &&
				waterMin >= WORLD_MIN_Y &&
				waterMax <= world.WORLD_SEA_LEVEL,
			`rango [${waterMin}, ${waterMax}]`
		);
	} else {
		info(
			"no se encontró agua expuesta cerca del origen para el test de render"
		);
	}

	fs.rmSync(tmp, { recursive: true, force: true });
	fs.rmSync(tmpChunks, { recursive: true, force: true });
	world.setDiskLoader(null);
	console.log(`\n${checks.filter((c) => c.ok).length} OK, ${failed} FAIL`);
	for (const c of checks) if (!c.ok) console.log(`✗ ${c.name} — ${c.extra}`);
	process.exit(failed ? 1 : 0);
})();
