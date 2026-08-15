"use strict";

// ============================================================
// GENERACIÓN DE CHUNKS (Fase 18, D-3)
// Extraído de world.js: cuevas (ruido 3D), pozos de agua/lava en superficie
// y generateChunk (columnas, minerales, árboles, lagos, ríos, océanos,
// estructuras y lianas) — el bloque más pesado de la generación. Requiere
// los biomas, las estructuras y el ruido compartido; los helpers del núcleo
// (idx, toLocal, outOfBounds, markChunkDirty, diskLoader/loadChunkFromDisk,
// addChunkGenMs) se inyectan desde world.js con setCore (evita el ciclo
// world→generation→world). chunks y chests vienen de state/chests.js.
// ============================================================
const {
	B,
	CHUNK_SIZE,
	WORLD_HEIGHT,
	WORLD_MIN_Y,
	WORLD_MAX_Y
} = require("./constants.js");
const state = require("./state.js");
const { chunks } = state;
const chests = require("./chests.js");
const noise = require("./noise.js");
const biomes = require("./biomes.js");
const structures = require("./structures.js");

// Helpers del núcleo (world.js los inyecta al cargar con setCore).
let core = null;
function setCore(c) {
	core = c;
}

const CAVE_FREQ = 0.032; // escala horizontal: túneles ~2x más largos/anchas
const CAVE_FREQ_Y = 0.045; // túneles más horizontales (se exploran en plano)
const CAVE_FINE_FREQ = 0.09; // desvíos amplios (no fragmentan el túnel)
const CAVE_THRESHOLD = 0.86; // solo pasajes fuertes excavan: menos cuevas,
// cada una con más volumen (calibrado por barrido: ~7-9% del subsuelo)
// Fase 15 (cierre): el muestreo fino se salta cuando la octava GRUESA no
// puede alcanzar el umbral: caveStrength = base*0.6 + fine*0.4 con fine ≤ 1,
// así que si base*0.6 + 0.4 ≤ 0.84 (= CAVE_THRESHOLD) ningún fine llega al
// umbral (ni al de superficie 0.91) → la celda NO es cueva. Evita el noise3D
// fino en ~73% de las celdas de piedra (26K muestras por chunk); el resultado
// es bit-idéntico (solo se omite un cálculo que no podía cambiar la decisión).
const CAVE_FINE_MAX_BASE = (CAVE_THRESHOLD - 0.4) / 0.6; // ≈ 0.833
function caveStrength(wx, wy, wz) {
	const base =
		1 -
		Math.abs(
			noise.noise3D_cave(wx * CAVE_FREQ, wy * CAVE_FREQ_Y, wz * CAVE_FREQ)
		);
	if (base <= CAVE_FINE_MAX_BASE) return 0; // ninguna fine alcanza el umbral
	const fine =
		1 -
		Math.abs(
			noise.noise3D_cave_fine(
				wx * CAVE_FINE_FREQ,
				wy * CAVE_FINE_FREQ * 1.25,
				wz * CAVE_FINE_FREQ
			)
		);
	return base * 0.6 + fine * 0.4;
}

function isCaveBlock(wx, wy, wz, nearSurface) {
	// Cerca de la superficie el umbral sube: los túneles se estrechan y solo
	// los más fuertes alcanzan la capa superior (boca de cueva).
	return (
		caveStrength(wx, wy, wz) >
		(nearSurface ? CAVE_THRESHOLD + 0.07 : CAVE_THRESHOLD)
	);
}

// Umbral para abrir el bloque de superficie: solo un pico de ruido fuerte
// excava la boca (≈0.5-1% de columnas) → entradas de cueva escasas y visibles
// hacia el exterior. La conexión real exige además la capa inferior excavada
// (nearSurface 0.97), así que nunca hay hoyos aislados.
const CAVE_MOUTH_THRESHOLD = 0.96;

// ============================================================
// POZOS DE AGUA/LAVA EN SUPERFICIE (Fase 7, decorativos): charcos de 1
// bloque que sustituyen al bloque de superficie y entierran el siguiente
// con arena (lecho del charco). Escasos y solo en regiones permitidas;
// nunca sobre lagos ni en bocas de cueva.
// ============================================================
const POND_REGION_GATE = 0.35; // ~32% del mapa puede tener charcos
const POND_THRESHOLD = 0.7; // calibrado: ~1-1.5% global de columnas con charco
const LAVA_REGION_GATE = 0.5; // Fase 10 (A3): la lava, más rara (antes 0.45)
const LAVA_THRESHOLD = 0.84; // Fase 10 (A3): ~0.3% global (antes 0.78 → demasiados lagos)
function isPondAt(wx, wz) {
	return (
		noise.noise2D_pond_region(wx * 0.01, wz * 0.01) > POND_REGION_GATE &&
		noise.noise2D_pond(wx * 0.06, wz * 0.06) > POND_THRESHOLD
	);
}
function isLavaPondAt(wx, wz) {
	// Fase 10 (A3): nunca lava en biomas de hielo/tundra (bug de las notas) y
	// solo en regiones templadas o cálidas (el ruido de temperatura es el
	// mismo que usa biomeFrom, así que es consistente con el bioma real).
	const temp = noise.noise2D(wx * 0.005, wz * 0.005);
	if (temp < biomes.SNOW_TEMP) return false;
	return (
		noise.noise2D_pond_region(wx * 0.01, wz * 0.01) > LAVA_REGION_GATE &&
		noise.noise2D_lava(wx * 0.07, wz * 0.07) > LAVA_THRESHOLD
	);
}

// Fase 11 (Bloque B): columna de charco pantanoso — agua en la superficie
// del pantano (poza entre la hierba, lecho de arena debajo). Fuente de
// verdad única del patrón (lo usa generateChunk para crear el charco y las
// copas de los árboles para NO taparlo: la copa encima del charco dejaría
// su celda superior sin aire y rompería la invariante de unit-mundo sobre
// charcos válidos).
function isSwampPoolAt(wx, wz) {
	if (biomes.getBiome(wx, wz) !== "swamp") return false;
	return noise.noise2D_swamp(wx * 0.06, wz * 0.06) > 0.4;
}

function hangVines(data, lx, y, lz, height) {
	const maxV = Math.max(height, y - 3);
	for (let v = y - 1; v >= maxV; v--) {
		const i = core.idx(lx, core.toLocal(v), lz);
		if (data[i] !== B.AIR) break;
		data[i] = B.VINES;
	}
}

function generateChunk(cx, cz) {
	const key = `${cx},${cz}`;
	if (chunks.has(key)) return chunks.get(key);
	// Fase 10 (B1): fuera de los bordes → chunk vacío (no se cachea).
	if (core.outOfBounds(cx, cz)) {
		return new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	}
	// Si el chunk ya fue guardado en disco (p.ej. tras descargarse), recuperarlo
	// tal cual en vez de regenerarlo: la generación usa Math.random y perdería cambios.
	const fromDisk = core.diskLoader
		? core.diskLoader(cx, cz)
		: core.loadChunkFromDisk(cx, cz);
	if (fromDisk) {
		chunks.set(key, fromDisk);
		return fromDisk;
	}

	const genT0 = performance.now();
	const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;

	// Fase 15 (A2): las copas de los árboles se buferizan durante el bucle de
	// columnas y se aplican al final. Escribirlas dentro del bucle hacía que
	// las columnas generadas después pisaran las hojas en +x/+z, dejando las
	// copas recortadas de forma asimétrica (causa raíz del bug de bordes).
	const pendingLeaves = [];

	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			const wx = baseX + x,
				wz = baseZ + z;
			const lake = biomes.isLake(wx, wz);
			// Fase 10 (A4): ríos — canales que cortan el terreno (los lagos
			// siguen siendo depresiones; los ríos se hunden en el terreno natural).
			const river = !lake && biomes.isRiver(wx, wz);
			// Fase 11 (Bloque B): océano — cuencas amplias que inundan la región
			// (más profundas que los lagos). Las tres fuentes son excluyentes.
			const ocean = !lake && !river && biomes.isOcean(wx, wz);
			const waterCol = lake || river || ocean; // columna de agua (lago/río/océano)
			// En un lago el terreno se hunde hasta su fondo (profundidad variable,
			// Fase 10 A4) y el agua llena la depresión hasta biomes.SEA_LEVEL; los ríos
			// cortan un canal bajo el terreno natural. No hay árboles ni minerales
			// bajo el agua. Ruidos compartidos por columna (getHeight/getBiome son
			// ruido puro: recalcularlos daría valores idénticos, pero se evita el
			// triple muestreo en el bucle de generación).
			const temp = noise.noise2D(wx * 0.005, wz * 0.005);
			const mnt = noise.noise2D_mountain(wx * 0.008, wz * 0.008);
			const baseHeight =
				biomes.heightFrom(
					temp,
					biomes.smoothstep(
						biomes.MOUNTAIN_RAMP[0],
						biomes.MOUNTAIN_RAMP[1],
						mnt
					),
					wx,
					wz
				) - biomes.DESIGN_OFFSET; // diseño (3..27) → MUNDO (terreno anclado en ~0)
			// Fase 15 (cierre): lecho de la columna de agua derivado de los flags
			// y ruidos YA muestreados (lake/river/ocean + baseHeight). Antes se
			// llamaba a biomes.columnFloorY(wx, wz), que volvía a muestrear isLake +
			// isRiver + isOcean y, para ríos, temp + mnt + heightFrom + riverDepth
			// (~8 ruidos duplicados por columna). El resultado es idéntico
			// (columnFloorY usa exactamente estos ruidos): mismo mundo, sin
			// recálculos. Solo aplica a columnas de agua (si no, 0 como antes).
			let floorY = 0; // Y de MUNDO del lecho
			if (lake) floorY = biomes.lakeFloorY(wx, wz) - biomes.DESIGN_OFFSET;
			else if (river) {
				// columnFloorY: max(1, min(h − riverDepth, biomes.SEA_LEVEL−1)) con
				// h = biomes.heightFrom(...) = baseHeight + biomes.DESIGN_OFFSET.
				floorY =
					Math.max(
						1,
						Math.min(
							baseHeight + biomes.DESIGN_OFFSET - biomes.riverDepth(wx, wz),
							biomes.SEA_LEVEL - 1
						)
					) - biomes.DESIGN_OFFSET;
			} else if (ocean)
				floorY = biomes.oceanFloorY(wx, wz) - biomes.DESIGN_OFFSET;
			const height = waterCol ? floorY : baseHeight; // Y de MUNDO de la superficie
			// Fase 11 (Bloque B): el bioma ahora conoce la puerta de pantano
			// (el ruido de pantano, muestreado a baja frecuencia).
			const swampNoise = noise.noise2D_swamp(wx * 0.005, wz * 0.005);
			const biome = biomes.biomeFrom(temp, mnt, swampNoise);
			const surfaceBlock = waterCol
				? B.AIR
				: // Fase 9 (Bloque F): playa — la costa de un lago se cubre de arena
					// (transición suave agua → arena → tierra).
					biomes.nearLake(wx, wz)
					? B.SAND
					: biomes.surfaceBlockFor(wx, wz, height, temp, mnt);
			// Boca de cueva: pico de ruido extremo justo en el bloque de superficie,
			// y solo si la capa inferior ya fue excavada (entrada real conectada al
			// túnel, no un hoyo aislado de 1 bloque). ≈1-2% de columnas.
			const mouthPeak =
				!lake && caveStrength(wx, height - 1, wz) > CAVE_MOUTH_THRESHOLD;
			let carvedTop = false;
			let mouth = false;

			// Fase 15 (D5): el bucle recorre el MUNDO (−64..+63). El bedrock va en
			// WORLD_MIN_Y; el subsuelo baja 64 bloques (cuevas + minerales por
			// profundidad); la superficie en `height` (≈0) y el aire hasta +63.
			// Fase 15 (cierre): el aire por encima del contenido ya es 0 en el
			// Uint8Array (AIR = 0), así que el bucle solo escribe hasta la última
			// fila CON contenido: la superficie en tierra (height − 1) o la
			// última fila de agua en columnas de agua (biomes.WORLD_SEA_LEVEL − 1).
			// Antes recorría las ~60 filas de aire vacío por columna (~47% de
			// las iteraciones sin trabajo útil). Las estructuras/árboles se
			// escriben después del bucle y no dependen de este límite.
			const yEnd = waterCol ? biomes.WORLD_SEA_LEVEL - 1 : height - 1;
			for (let y = WORLD_MIN_Y; y <= yEnd; y++) {
				let block = B.AIR;
				if (y === WORLD_MIN_Y) block = B.BEDROCK;
				else if (waterCol) {
					// Columna de agua (lago, río u océano): piedra bajo el lecho, arena
					// en el lecho y agua encima hasta biomes.WORLD_SEA_LEVEL. Fase 10 (A4): las
					// CUEVAS bajo el agua se inundan (cuevas acuáticas) — nunca hay
					// bolsas de aire bajo el agua (invariante de unit-mundo).
					if (y < floorY) {
						if (y > WORLD_MIN_Y + 1 && isCaveBlock(wx, y, wz, false))
							block = B.WATER;
						else block = B.STONE;
					} else if (y === floorY) block = B.SAND;
					else if (y < biomes.WORLD_SEA_LEVEL) block = B.WATER;
				} else if (y < height - 1) {
					// Cuevas (Fase 4): el ruido 3D excava la piedra sin tocar el
					// bedrock. Muestreado en coordenadas de mundo → continuo entre
					// chunks vecinos y determinista. Cerca de la superficie el umbral
					// sube (nearSurface): los túneles se estrechan y solo los más
					// fuertes alcanzan la capa superior (boca de cueva).
					if (y > WORLD_MIN_Y + 1 && isCaveBlock(wx, y, wz, y >= height - 3)) {
						block = B.AIR;
						if (y === height - 2) carvedTop = true;
					} else {
						block = B.STONE;
						if (y > WORLD_MIN_Y + 4) {
							// Fase 18 (C-2): minerales por PROFUNDIDAD mapeados al mundo
							// v6 (−64..+63, 128 bloques). Distribución MC 1.18 (mundo
							// −64..+320, 384 bloques) mapeada POR PERCENTIL de columna:
							//   MC −64..+16   (fondo 21 %)  → diamante y ≤ −38
							//   MC −64..+16   (fondo 21 %)  → redstone y ≤ −32 (misma banda,
							//        con umbral de rareza menor; antes y < −12/−20)
							//   MC −64..+80   (fondo 37 %)  → oro y ≤ −16
							//   MC −64..+256  (fondo 83 %)  → hierro y ≤ +42
							//   MC 0..+256    (banda 17-83 %) → carbón −42 ≤ y ≤ +42
							//   esmeralda: MC solo montañas (rango alto); aquí se mantiene
							//   como mena rara media-profunda (y ≤ −20) por no haber
							//   generación de montañas con esmeralda — decisión heredada
							//   de la Fase 15, documentada.
							// Antes (F15) los cortes eran absolutos (−20/−12/−4/12/28) y no
							// seguían los percentiles MC; hierro/carbón quedaban en capas
							// demasiado someras y diamante/redstone demasiado altos.
							// Segunda octava de ruido para vetas más orgánicas.
							// Fase 15 (cierre): early-exit — roll = oreRoll*0.7 +
							// oreFine*0.3 con oreFine ≤ 1, y el umbral MÁS BAJO de
							// mineral es el carbón (0.86): si oreRoll*0.7 + 0.3 ≤ 0.86
							// (oreRoll ≤ 0.8) ningún oreFine alcanza NINGÚN mineral →
							// se omite el noise2D de detalle en ~80% de las celdas
							// de piedra. Bit-idéntico: solo se salta un cálculo que
							// no podía cambiar la decisión.
							const oreRoll =
								(noise.noise2D_ore(wx * 0.3 + y * 7.1, wz * 0.3) + 1) / 2;
							if (oreRoll * 0.7 + 0.3 > 0.86) {
								const oreFine =
									(noise.noise2D_detail(wx * 0.15 + y * 3.7, wz * 0.15) + 1) /
									2;
								const roll = oreRoll * 0.7 + oreFine * 0.3;
								if (y < -38 && roll > 0.965) block = B.DIAMOND_ORE;
								else if (y < -32 && roll > 0.955) block = B.REDSTONE_ORE;
								else if (y < -20 && roll > 0.955) block = B.EMERALD_ORE;
								else if (y < -16 && roll > 0.945) block = B.GOLD_ORE;
								else if (y < 42 && roll > 0.9) block = B.IRON_ORE;
								else if (y > -42 && y < 42 && roll > 0.86) block = B.COAL_ORE;
							}
						}
					}
				} else if (y === height - 1) {
					// Superficie: bloque del bioma dominante (tundra nevada, cumbres
					// con nieve, desierto con arena, resto césped) o aire si hay boca
					// de cueva hacia la superficie (solo si la capa inferior se excavó).
					mouth = mouthPeak && carvedTop;
					block = mouth ? B.AIR : surfaceBlock;
				}
				data[core.idx(x, y - WORLD_MIN_Y, z)] = block;
			}

			// Pozos decorativos (Fase 7): charco de agua o lava que reemplaza al
			// bloque de superficie y deja lecho de arena debajo. Nunca sobre lagos,
			// ni en ríos, ni en bocas de cueva, ni donde no quepa el lecho (height
			// justo sobre el nivel del mar). El charco gana a la boca de cueva
			// (rarísimo). Fase 11 (Bloque B): en el PANTANO se añaden charcos
			// propios — el mismo ruido de pantano a frecuencia alta decide dónde
			// hay agua (pozas pantanosas entre la hierba, como en Minecraft).
			const swampPool = isSwampPoolAt(wx, wz);
			// Fase 15 (D5): `height` es Y de MUNDO, así que el charco necesita
			// superficie por encima del nivel del mar de MUNDO (biomes.WORLD_SEA_LEVEL).
			const pond =
				!waterCol &&
				!mouth &&
				height > biomes.WORLD_SEA_LEVEL + 1 &&
				(isPondAt(wx, wz) || swampPool);
			const lavaPond =
				!pond &&
				!waterCol &&
				!mouth &&
				height > biomes.WORLD_SEA_LEVEL + 1 &&
				isLavaPondAt(wx, wz);
			if (pond) {
				data[core.idx(x, core.toLocal(height - 1), z)] = B.WATER;
				data[core.idx(x, core.toLocal(height - 2), z)] = B.SAND;
			} else if (lavaPond) {
				data[core.idx(x, core.toLocal(height - 1), z)] = B.LAVA;
				data[core.idx(x, core.toLocal(height - 2), z)] = B.SAND;
			}

			// Fase 12 (Bloque B): estructura de la celda (templo de jungla o
			// naufragio oceánico) si la columna cae en su footprint. Se calcula
			// ANTES que los árboles: dentro del footprint no crecen árboles ni
			// vegetación (la estructura pisa el terreno; se rellena y recorta en
			// placeTempleColumn/placeShipwreckColumn).
			const struct = structures.structureAt(wx, wz);

			// Minas abandonadas (Fase 7): excavar el pasillo horizontal en piedra
			// (preserva minerales y el techo) a la profundidad del túnel; nunca
			// rompen la superficie (y < height - 1). Los cofres de loot van en el
			// suelo del pasillo (raro y determinista). Fase 15 (D5): nunca en
			// columnas de agua — el túnel (hasta 9 bloques bajo la superficie)
			// caería dentro del lecho del río/océano y dejaría aire bajo el agua.
			if (structures.mineshaftAt(wx, wz) && !waterCol) {
				const depth = structures.mineshaftDepth(wx, wz, height);
				for (
					let y = depth + 1;
					y < depth + structures.MS_TUNNEL_H && y < height - 1;
					y++
				) {
					if (data[core.idx(x, core.toLocal(y), z)] === B.STONE)
						data[core.idx(x, core.toLocal(y), z)] = B.AIR;
				}
				if (
					structures.msLootSpot(wx, wz) &&
					depth + 1 < height - 1 &&
					data[core.idx(x, core.toLocal(depth + 1), z)] === B.AIR
				) {
					data[core.idx(x, core.toLocal(depth + 1), z)] = B.CHEST;
					state.chests.set(`${wx},${depth + 1},${wz}`, chests.lootSlots());
				}
			}

			// Árboles (nunca dentro de un lago). El tronco empieza en el primer
			// bloque de aire sobre la superficie (y = height) y descansa sobre el
			// bloque de la superficie (y = height - 1): la base NUNCA flota. Bug
			// corregido: antes empezaba en height + 1 y los árboles quedaban
			// flotando un bloque por encima del terreno (ver tests/unit-arboles.js).
			// Solo sobre césped firme (ni boca de cueva, ni charco, ni estribación
			// rocosa, ni arena del borde del desierto) y nunca dentro de un lago.
			// Fase 9 (Bloque F): variedad — abedul en el bosque (tronco claro,
			// copa normal) y pino cónico en tundra/montaña (tronco de abeto).
			const canGrowTree =
				!waterCol &&
				!mouth &&
				!pond &&
				!lavaPond &&
				!struct &&
				surfaceBlock === B.GRASS;

			// Fase 15 (A2): el tronco debe estar a ≥2 bloques del borde del chunk
			// para que la copa 5×5 (radio 2) quepa entera — así ningún árbol queda
			// con la copa recortada por el borde (el vecino no coloca esas hojas).
			const treeFits =
				x >= 2 && x <= CHUNK_SIZE - 3 && z >= 2 && z <= CHUNK_SIZE - 3;

			const treeRoll = Math.random();
			if (canGrowTree && treeFits && biome === "jungle" && treeRoll < 0.09) {
				// Árbol de jungla (Fase 11, B): tronco alto (5-8) y copa ancha y
				// densa con lianas colgando del envés — el sello de la selva.
				const treeHeight = 5 + Math.floor(Math.random() * 4);
				for (let i = 0; i < treeHeight; i++) {
					const y = height + i;
					if (y <= WORLD_MAX_Y)
						data[core.idx(x, core.toLocal(y), z)] = B.JUNGLE_LOG;
				}
				for (let dx = -2; dx <= 2; dx++) {
					for (let dz = -2; dz <= 2; dz++) {
						for (let dy = treeHeight - 3; dy <= treeHeight + 1; dy++) {
							// Esquinas recortadas en las dos capas superiores (copa irregular).
							if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy >= treeHeight)
								continue;
							const lx = x + dx,
								lz = z + dz;
							if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE)
								continue;
							// Fase 9 (fix): la copa no tapa los charcos decorativos.
							const leafWx = cx * CHUNK_SIZE + lx,
								leafWz = cz * CHUNK_SIZE + lz;
							if (
								isPondAt(leafWx, leafWz) ||
								isLavaPondAt(leafWx, leafWz) ||
								isSwampPoolAt(leafWx, leafWz)
							)
								continue;
							const y = height + dy;
							if (y <= WORLD_MAX_Y)
								pendingLeaves.push({
									lx,
									y,
									lz,
									block: B.JUNGLE_LEAVES,
									// Lianas bajo el borde de la copa (donde hay aire debajo).
									vines: Math.abs(dx) === 2 || Math.abs(dz) === 2,
									height
								});
						}
					}
				}
			} else if (
				canGrowTree &&
				treeFits &&
				(biome === "forest" || biome === "plains" || biome === "swamp") &&
				treeRoll <
					(biome === "forest" ? 0.05 : biome === "swamp" ? 0.02 : 0.012)
			) {
				// Roble (bosque/llanura/pantano) o abedul (bosque, ~1/3): misma
				// forma, madera distinta (tronco claro). En el pantano (Fase 11,
				// B) los robles llevan lianas colgando del borde, como en Minecraft.
				const birch = biome === "forest" && Math.random() < 0.33;
				const log = birch ? B.BIRCH_LOG : B.OAK_LOG;
				const leaves = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
				const treeHeight = 4 + Math.floor(Math.random() * 3);
				for (let i = 0; i < treeHeight; i++) {
					const y = height + i;
					if (y <= WORLD_MAX_Y) data[core.idx(x, core.toLocal(y), z)] = log;
				}
				for (let dx = -2; dx <= 2; dx++) {
					for (let dz = -2; dz <= 2; dz++) {
						for (let dy = treeHeight - 2; dy <= treeHeight; dy++) {
							if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === treeHeight)
								continue;
							const lx = x + dx,
								lz = z + dz;
							if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE)
								continue;
							// Fase 9 (fix): las copas de los árboles NO caen sobre los
							// charcos decorativos de agua/lava de la Fase 7 (los taparían
							// y el charco dejaría de ser visible). La densidad mayor de
							// árboles de la Fase 9 (abedul/pino) hacía esto probable.
							const leafWx = cx * CHUNK_SIZE + lx,
								leafWz = cz * CHUNK_SIZE + lz;
							if (
								isPondAt(leafWx, leafWz) ||
								isLavaPondAt(leafWx, leafWz) ||
								isSwampPoolAt(leafWx, leafWz)
							)
								continue;
							const y = height + dy;
							if (y <= WORLD_MAX_Y)
								pendingLeaves.push({
									lx,
									y,
									lz,
									block: leaves,
									// Pantano (Fase 11, B): lianas del borde de la copa.
									vines:
										biome === "swamp" &&
										(Math.abs(dx) === 2 || Math.abs(dz) === 2),
									height
								});
						}
					}
				}
			} else if (
				canGrowTree &&
				treeFits &&
				(biome === "taiga" || biome === "snow" || biome === "mountain") &&
				treeRoll < (biome === "taiga" ? 0.03 : 0.02)
			) {
				// Pino cónico (abeto) en frío: tronco alto y estrecho con copa cónica.
				// En la taiga (Fase 11, B) es el árbol dominante (pinos densos).
				const treeHeight = 5 + Math.floor(Math.random() * 4);
				for (let i = 0; i < treeHeight; i++) {
					const y = height + i;
					if (y <= WORLD_MAX_Y)
						data[core.idx(x, core.toLocal(y), z)] = B.SPRUCE_LOG;
				}
				for (let dy = 0; dy < treeHeight - 1; dy++) {
					const radius = dy < 2 ? 1 : 2;
					for (let dx = -radius; dx <= radius; dx++) {
						for (let dz = -radius; dz <= radius; dz++) {
							if (
								Math.abs(dx) === radius &&
								Math.abs(dz) === radius &&
								Math.random() < 0.5
							)
								continue;
							const lx = x + dx,
								lz = z + dz;
							if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE)
								continue;
							// Fase 9 (fix): la copa cónica del pino tampoco tapa los
							// charcos decorativos (mismo criterio que las hojas de roble).
							const leafWx = cx * CHUNK_SIZE + lx,
								leafWz = cz * CHUNK_SIZE + lz;
							if (
								isPondAt(leafWx, leafWz) ||
								isLavaPondAt(leafWx, leafWz) ||
								isSwampPoolAt(leafWx, leafWz)
							)
								continue;
							const y = height + dy;
							if (y <= WORLD_MAX_Y)
								pendingLeaves.push({
									lx,
									y,
									lz,
									block: B.SPRUCE_LEAVES,
									vines: false,
									height
								});
						}
					}
				}
			}

			// Fase 9 (Bloque F): estructuras y vegetación sobre césped firme —
			// hierba alta, flores (amapola/diente de león) y, raramente, un pilar
			// de piedra con piedra de musgo (estructura decorativa).
			if (canGrowTree && data[core.idx(x, core.toLocal(height), z)] === B.AIR) {
				const veg = Math.random();
				if (veg < 0.1)
					data[core.idx(x, core.toLocal(height), z)] = B.TALL_GRASS;
				else if (veg < 0.12)
					data[core.idx(x, core.toLocal(height), z)] = B.POPPY;
				else if (veg < 0.14)
					data[core.idx(x, core.toLocal(height), z)] = B.DANDELION;
			}
			if (
				canGrowTree &&
				(biome === "plains" || biome === "forest") &&
				Math.random() < 0.004
			) {
				// Pilar de piedra: columna de 1-3 bloques con la cima de musgo.
				const h = 1 + Math.floor(Math.random() * 3);
				for (let i = 0; i < h; i++) {
					const y = height + i;
					if (
						y <= WORLD_MAX_Y &&
						data[core.idx(x, core.toLocal(y), z)] === B.AIR
					)
						data[core.idx(x, core.toLocal(y), z)] =
							i === h - 1 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE;
				}
			}

			// Fase 12 (Bloque B): colocar la estructura de la celda (templo o
			// naufragio) — va DESPUÉS de árboles/vegetación para pisar el terreno
			// ya generado (rellena, recorta y crea los cofres de loot).
			if (struct) {
				if (struct.type === "temple")
					structures.placeTempleColumn(data, x, z, wx, wz, struct, height);
				else structures.placeShipwreckColumn(data, x, z, wx, wz, struct);
			}
		}
	}

	// Fase 15 (A2): aplicar las copas buferizadas. Como se escribe tras
	// rellenar todas las columnas, el chequeo de aire se hace contra el chunk
	// completo y ninguna columna posterior pisa las hojas. La comprobación de
	// charcos ya se hizo al buferizar (leafWx/leafWz), así que aquí basta el
	// aire: las hojas no caen sobre troncos, terreno ni estructuras.
	for (const leaf of pendingLeaves) {
		const i = core.idx(leaf.lx, core.toLocal(leaf.y), leaf.lz);
		if (data[i] === B.AIR) {
			data[i] = leaf.block;
			if (leaf.vines) hangVines(data, leaf.lx, leaf.y, leaf.lz, leaf.height);
		}
	}

	chunks.set(key, data);
	core.markChunkDirty(cx, cz); // la generación usa Math.random (árboles), así que se persiste
	core.addChunkGenMs(performance.now() - genT0);
	return data;
}

module.exports = {
	generateChunk,
	isPondAt,
	isLavaPondAt,
	isSwampPoolAt,
	isCaveBlock,
	caveStrength,
	setCore
};
