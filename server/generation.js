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
// Fase 20 B4 (P4): semilla activa del mundo para el RNG determinista por chunk.
const constants = require("./constants.js");
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

// ============================================================
// RNG DETERMINISTA POR CHUNK (Fase 20 B4, P4)
// Árboles y vegetación usan un PRNG sembrado por (semilla del mundo, cx, cz)
// en vez del Math.random global. Con generación determinista un chunk nunca
// tocado por el jugador se regenera IDÉNTICO en la próxima sesión, así que
// NO hace falta persistirlo (se retira el markChunkDirty de la generación):
// explorar 300+ chunks ya no escribe 300+ archivos en cada sesión. Mismo
// mulberry32 que noise.js; `setChunkRng` permite a los tests inyectar su
// PRNG (antes inyectaban Math.random, que la generación ya no consulta).
// ============================================================
function hashCoord(seedStr, cx, cz) {
	let h = 1779033703 ^ seedStr.length;
	const s = `${seedStr},${cx},${cz}`;
	for (let i = 0; i < s.length; i++)
		h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
	h = Math.imul(h ^ (h >>> 13), 3896748745);
	return (h ^ (h >>> 16)) >>> 0;
}
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
let chunkRngFactory = null; // tests: inyectan su PRNG (null = determinista)
function setChunkRng(fn) {
	chunkRngFactory = fn;
}
function chunkRngFor(cx, cz) {
	const seed =
		constants.worldPaths?.currentSeed || process.env.SEED || "miSemilla2026";
	return chunkRngFactory
		? chunkRngFactory(cx, cz)
		: mulberry32(hashCoord(seed, cx, cz));
}

const CAVE_FREQ = 0.025; // Fase 22 (A2): cuevas 1.18 — más grandes y
// conectadas; frecuencia más baja = túneles más largos/anchos
const CAVE_FREQ_Y = 0.035; // túneles más horizontales (se exploran en plano)
const CAVE_FINE_FREQ = 0.07; // desvíos amplios (conectan túneles vecinos)
const CAVE_THRESHOLD = 0.84; // Fase 22 (A2): umbral bajado de 0.86 a 0.84
// → cuevas más voluminosas (~10-12% del subsuelo, pocas pero grandes y
// largas como pidió el usuario: "pocas cuevas pero largas y grandes")
// Fase 15 (cierre): el muestreo fino se salta cuando la octava GRUESA no
// puede alcanzar el umbral: caveStrength = base*0.6 + fine*0.4 con fine ≤ 1,
// así que si base*0.6 + 0.4 ≤ 0.84 (= CAVE_THRESHOLD) ningún fine llega al
// umbral (ni al de superficie 0.91) → la celda NO es cueva. Evita el noise3D
// fino en ~73% de las celdas de piedra (26K muestras por chunk); el resultado
// es bit-idéntico (solo se omite un cálculo que no podía cambiar la decisión).
const CAVE_FINE_MAX_BASE = (CAVE_THRESHOLD - 0.4) / 0.6; // ≈ 0.733
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
	const temp = noise.noise2D(wx * biomes.BIOME_FREQ, wz * biomes.BIOME_FREQ);
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

// Fase 21.5 (D2): parche de arrecife de coral en el océano cálido — gate
// de ruido de detalle a frecuencia de arrecife (~35% de las columnas
// cálidas llevan coral, en parches continuos como en Minecraft). Lo usa
// generateChunk para poner CORAL_BLOCK sobre el lecho (la primera celda de
// agua encima de la arena) — el lecho sigue siendo arena y el agua llena
// el resto de la columna (invariantes de unit-mundo/unit-fase11 intactas).
const REEF_FREQ = 0.08;
const REEF_GATE = 0.3;
function isCoralReefAt(wx, wz) {
	return noise.noise2D_detail(wx * REEF_FREQ, wz * REEF_FREQ) > REEF_GATE;
}

// Fase 21.5 (B5): kelp — plantas altas en el océano (fuera del arrecife):
// gate de ruido (~40% del océano) y altura 2-6 bloques, ambas deterministas
// por columna (misma frecuencia de detalle que el broad stroke de abajo).
function kelpTallAt(wx, wz) {
	return noise.noise2D_detail(wx * REEF_FREQ + 5.3, wz * REEF_FREQ - 2.7) > 0.1;
}
function kelpHeightAt(wx, wz) {
	// 2-6 bloques, determinista (hash de la columna).
	const h = Math.abs(
		Math.floor(noise.noise2D_detail(wx * 0.37, wz * 0.37) * 457) % 5
	);
	return 2 + h;
}

function hangVines(data, lx, y, lz, height) {
	const maxV = Math.max(height, y - 3);
	for (let v = y - 1; v >= maxV; v--) {
		const i = core.idx(lx, core.toLocal(v), lz);
		if (data[i] !== B.AIR) break;
		data[i] = B.VINES;
	}
}

// Fase 21.5 (B1): vetas de piedra pulida — granito, diorita y andesita se
// generan en el subsuelo con un patrón por hash 2D (misma receta que los
// minerales de Fase 18 C-2: umbral de ruido + franja de profundidad). MC
// 1.8: granito/diorita/andesita aparecen en vetas de ~30 bloques entre la
// superficie y Y≈80; aquí, mapeado al mundo v6 (−64..+63), van en la banda
// media (y ≥ −8) con puertas independientes. Cada celda de piedra lanza un
// `roll` [0,1): > 0.94 → granito, > 0.91 → diorita, > 0.88 → andesita
// (~6 % de la piedra en total, en parches orgánicos por la octava de
// detalle; los umbrales se calibraron contra la distribución real del ruido
// — unos pocos miles de bloques por chunk de 16×16 en la franja).
function polishedStoneAt(wx, y, wz) {
	if (y < -8) return null;
	const roll = (noise.noise2D_ore(wx * 0.22 + y * 5.3, wz * 0.22) + 1) / 2;
	if (roll > 0.94) return B.GRANITE;
	if (roll > 0.91) return B.DIORITE;
	if (roll > 0.88) return B.ANDESITE;
	return null;
}

function generateChunk(cx, cz) {
	const key = `${cx},${cz}`;
	if (chunks.has(key)) return chunks.get(key);
	// Fase 10 (B1): fuera de los bordes → chunk vacío (no se cachea).
	if (core.outOfBounds(cx, cz)) {
		return new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	}
	// Si el chunk ya fue guardado en disco (p.ej. tras descargarse), recuperarlo
	// tal cual en vez de regenerarlo: puede tener modificaciones del jugador
	// (aunque la generación base ya sea determinista, Fase 20 B4/P4).
	const fromDisk = core.diskLoader
		? core.diskLoader(cx, cz)
		: core.loadChunkFromDisk(cx, cz);
	if (fromDisk) {
		chunks.set(key, fromDisk);
		return fromDisk;
	}

	const genT0 = performance.now();
	const rand = chunkRngFor(cx, cz); // Fase 20 B4 (P4): determinista por chunk
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
			// Fase 21.5 (D2): arrecife de coral — solo en el océano CÁLIDO (la
			// variante por temperatura de oceanVariant; ~1/3 del océano), en
			// parches deterministas. El coral se coloca sobre el lecho (primera
			// celda de agua encima de la arena), como en Minecraft.
			const coralReef =
				ocean &&
				biomes.oceanVariant(wx, wz) === "warm" &&
				isCoralReefAt(wx, wz);
			// En un lago el terreno se hunde hasta su fondo (profundidad variable,
			// Fase 10 A4) y el agua llena la depresión hasta biomes.SEA_LEVEL; los ríos
			// cortan un canal bajo el terreno natural. No hay árboles ni minerales
			// bajo el agua. Ruidos compartidos por columna (getHeight/getBiome son
			// ruido puro: recalcularlos daría valores idénticos, pero se evita el
			// triple muestreo en el bucle de generación).
			const temp = noise.noise2D(
				wx * biomes.BIOME_FREQ,
				wz * biomes.BIOME_FREQ
			);
			const mnt = noise.noise2D_mountain(wx * 0.008, wz * 0.008);
			// Fase 21 (v21.2, D1): altura base en ESPACIO DE DISEÑO; el río la
			// hunde después (riverCarvedHeight: orillas inclinadas hacia el
			// cauce, cauce bajo el nivel del mar). El lecho del río se deriva
			// de baseDesign (el cauce YA es el fondo, no se vuelve a hundir).
			const baseDesign = biomes.heightFrom(
				temp,
				biomes.smoothstep(
					biomes.MOUNTAIN_RAMP[0],
					biomes.MOUNTAIN_RAMP[1],
					mnt
				),
				wx,
				wz
			);
			const baseHeight =
				biomes.riverCarvedHeight(wx, wz, baseDesign) - biomes.DESIGN_OFFSET; // diseño → MUNDO
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
				// Fase 21 (v21.2, D1): lecho compartido con columnFloorY — el
				// cauce se clava bajo el nivel del mar (RIVER_FLOOR_CAP) y el
				// agua SIEMPRE lo cubre (≥ 2 bloques). Antes el tope era
				// SEA_LEVEL−1 y en terreno alto el río no generaba agua.
				floorY = biomes.riverFloorY(wx, wz, baseDesign) - biomes.DESIGN_OFFSET;
			} else if (ocean)
				floorY = biomes.oceanFloorY(wx, wz) - biomes.DESIGN_OFFSET;
			const height = waterCol ? floorY : baseHeight; // Y de MUNDO de la superficie
			// Fase 11 (Bloque B): el bioma ahora conoce la puerta de pantano
			// (el ruido de pantano, muestreado a baja frecuencia).
			const swampNoise = noise.noise2D_swamp(
				wx * biomes.BIOME_FREQ,
				wz * biomes.BIOME_FREQ
			);
			const biome = biomes.biomeFrom(temp, mnt, swampNoise, wx, wz);
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
			// Fase 21.5 (B5): kelp — planta alta que sube desde el lecho del
			// océano (2-6 bloques, como en MC; determinista por columna). La
			// base es SEAGRASS (floorY+1) y el tallo KELP hasta kelpTop.
			const kelp = waterCol && ocean && !coralReef && kelpTallAt(wx, wz);
			const kelpTop = kelp
				? Math.max(floorY + 2, floorY + 1 + kelpHeightAt(wx, wz))
				: floorY + 1;
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
						else block = y < 0 ? B.DEEPSLATE : B.STONE;
					} else if (y === floorY) block = B.SAND;
					// Fase 21.5 (D2): coral del arrecife sobre el lecho (la primera
					// celda de agua) — el resto de la columna sigue siendo agua.
					// Fase 21.5 (B5): solo en el OCÉANO (no lagos/ríos, que tenían
					// invariantes de agua puras): el arrecife (y+1) es CORAL_BLOCK
					// sólido con un abanico CORAL_FAN encima (y+2); en el resto del
					// lecho, pasto marino (y+1) y, en columnas de kelp, el tallo
					// sube hasta kelpTop sin tocar el arrecife.
					else if (y === floorY + 1 && coralReef) block = B.CORAL_BLOCK;
					else if (y === floorY + 2 && coralReef) block = B.CORAL_FAN;
					else if (y === floorY + 1 && ocean)
						block = kelp ? B.KELP : B.SEAGRASS;
					else if (y > floorY + 1 && y <= kelpTop) block = B.KELP;
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
							// Fase 21.5 (B1): veta de piedra pulida — la piedra base se
							// sustituye ANTES de evaluar los minerales (las menas tienen
							// prioridad por estar más arriba en la cadena; si el roll de
							// veta coincide con el de mineral, manda el mineral, como en
							// MC donde las vetas de piedra y las menas son independientes).
							block = polishedStoneAt(wx, y, wz) ?? (y < 0 ? B.DEEPSLATE : B.STONE);
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
								else if (y < -16 && roll > 0.945) block = B.GOLD_ORE;									else if (y < 42 && roll > 0.9) block = B.IRON_ORE;
								// Fase 22 (A5): cobre — banda ~Y 0..16, frecuencia media
								// (más común que el oro, menos que el hierro).
								else if (y >= 0 && y <= 16 && roll > 0.92) block = B.COPPER_ORE;
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
			// Fase 21 (B1): pozo del desierto — esquema de celdas propio; también
			// se calcula antes de los árboles para que no crezca ninguno en el
			// brocal de piedra (es un footprint 5×5 con fuente de agua).
			const well = structures.wellAt(wx, wz);
			// Fase 21 (B2): pirámide del desierto — se calcula antes que los
			// árboles y el pilar de piedra para que ninguna vegetación crezca
			// sobre el cuerpo escalonado (footprint 15×15) ni tape la cima.
			const pyramid = structures.pyramidAt(wx, wz);
			// Fase 21.5 (D1): Trial Chambers — se calcula antes que los árboles
			// para que no crezca vegetación sobre el footprint de la cámara
			// subterránea (la excavación va más abajo, pero así el terreno por
			// encima queda limpio para que el techo se soporte en el chunk).
			const trial = structures.trialAt(wx, wz);

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
					const bl = data[core.idx(x, core.toLocal(y), z)];
					// Fase 22 (A3): excavar también deepslate (bajo Y=0).
					if (bl === B.STONE || bl === B.DEEPSLATE)
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
				!well &&
				!pyramid &&
				!trial &&
				surfaceBlock === B.GRASS;

			// Fase 15 (A2): el tronco debe estar a ≥2 bloques del borde del chunk
			// para que la copa 5×5 (radio 2) quepa entera — así ningún árbol queda
			// con la copa recortada por el borde (el vecino no coloca esas hojas).
			const treeFits =
				x >= 2 && x <= CHUNK_SIZE - 3 && z >= 2 && z <= CHUNK_SIZE - 3;

			const treeRoll = rand();
			if (canGrowTree && treeFits && biome === "jungle" && treeRoll < 0.09) {
				// Árbol de jungla (Fase 11, B): tronco alto (5-8) y copa ancha y
				// densa con lianas colgando del envés — el sello de la selva.
				const treeHeight = 5 + Math.floor(rand() * 4);
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
				(biome === "forest" ||
					biome === "birch_forest" ||
					biome === "plains" ||
					biome === "swamp") &&
				treeRoll <
					(biome === "forest"
						? 0.05
						: biome === "birch_forest"
							? 0.05
							: biome === "swamp"
								? 0.02
								: 0.012)
			) {
				// Roble (bosque/llanura/pantano) o abedul (bosque, ~1/3; bosque de
				// abedules F21 A2, SIEMPRE): misma forma, madera distinta (tronco
				// claro). En el pantano (Fase 11, B) los robles llevan lianas
				// colgando del borde, como en Minecraft.
				const birch =
					biome === "birch_forest" || (biome === "forest" && rand() < 0.33);
				const log = birch ? B.BIRCH_LOG : B.OAK_LOG;
				const leaves = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
				const treeHeight = 4 + Math.floor(rand() * 3);
				for (let i = 0; i < treeHeight; i++) {
					const y = height + i;
					if (y <= WORLD_MAX_Y) data[core.idx(x, core.toLocal(y), z)] = log;
				}
				// Fase 21.5 (B4): nido de abeja en el tronco (bosque/bosque de
				// abedules/llanura) — colgado de la cara +x del tronco a media
				// altura, ~6% de los árboles (estático, no hay abejas alrededor;
				// la especificación simplifica la polinización).
				if (
					(leaves === B.OAK_LEAVES || leaves === B.BIRCH_LEAVES) &&
					x + 1 < CHUNK_SIZE &&
					rand() < 0.06
				) {
					const ny = height + 1 + Math.floor(rand() * treeHeight);
					if (ny <= WORLD_MAX_Y)
						data[core.idx(x + 1, core.toLocal(ny), z)] = B.BEE_NEST;
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
				biome === "pale_garden" &&
				treeRoll < 0.04
			) {
				// Fase 21.5 (F1): roble pálido — tronco medio (4-6 bloques) con copa
				// redondeada similar al roble normal pero usando PALE_OAK_LOG/LEAVES.
				// ~1/12 de las columnas del pale garden generan un árbol.
				const treeHeight = 4 + Math.floor(rand() * 3);
				for (let i = 0; i < treeHeight; i++) {
					const y = height + i;
					if (y <= WORLD_MAX_Y)
						data[core.idx(x, core.toLocal(y), z)] = B.PALE_OAK_LOG;
				}
				// 10% de probabilidad de un Creaking Heart en el tronco.
				if (x + 1 < CHUNK_SIZE && rand() < 0.1) {
					const hy = height + 1 + Math.floor(rand() * treeHeight);
					if (hy <= WORLD_MAX_Y)
						data[core.idx(x + 1, core.toLocal(hy), z)] = B.CREAKING_HEART;
				}
				// Copa de hojas de roble pálido.
				for (let dx = -2; dx <= 2; dx++) {
					for (let dz = -2; dz <= 2; dz++) {
						for (let dy = treeHeight - 2; dy <= treeHeight; dy++) {
							if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === treeHeight)
								continue;
							const lx = x + dx,
								lz = z + dz;
							if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE)
								continue;
							const y = height + dy;
							if (y <= WORLD_MAX_Y)
								pendingLeaves.push({
									lx,
									y,
									lz,
									block: B.PALE_OAK_LEAVES,
									vines: false,
									height
								});
						}
					}
				}
			} else if (
				canGrowTree &&
				treeFits &&					biome === "giant_taiga" &&
					treeRoll < 0.03
			) {
				// Taiga de árboles gigantes (Fase 21, A2: abeto 2×2 con copa cónica
				// amplia). El tronco ocupa un cuadrado de 2×2 (como Montenegro);
				// la pareja +x/+z se reserva con base de tronco en este chunk para
				// que las columnas vecinas no planten su propio pino encima.
				const treeHeight = 7 + Math.floor(rand() * 4);
				for (let dx = 0; dx < 2; dx++) {
					for (let dz = 0; dz < 2; dz++) {
						for (let i = 0; i < treeHeight; i++) {
							const y = height + i;
							if (y <= WORLD_MAX_Y)
								data[core.idx(x + dx, core.toLocal(y), z + dz)] = B.SPRUCE_LOG;
						}
					}
				}
				// Copa cónica amplia (radio 3 en el centro, esfuerzo 2×2): hojas
				// por capas como el pino normal pero más altas y anchas.
				for (let dy = 0; dy < treeHeight - 1; dy++) {
					const radius = dy < 2 ? 1 : dy < treeHeight - 3 ? 3 : 2;
					for (let dx = -radius; dx <= radius + 1; dx++) {
						for (let dz = -radius; dz <= radius + 1; dz++) {
							if (
								Math.abs(dx) === radius + 1 &&
								Math.abs(dz) === radius + 1 &&
								dy < treeHeight - 3 &&
								rand() < 0.5
							)
								continue;
							const lx = x + dx,
								lz = z + dz;
							if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE)
								continue;
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
			} else if (
				canGrowTree &&
				treeFits &&
				(biome === "taiga" || biome === "snow" || biome === "mountain") &&
				treeRoll < (biome === "taiga" ? 0.03 : 0.02)
			) {
				// Pino cónico (abeto) en frío: tronco alto y estrecho con copa cónica.
				// En la taiga (Fase 11, B) es el árbol dominante (pinos densos).
				const treeHeight = 5 + Math.floor(rand() * 4);
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
								rand() < 0.5
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
				// Fase 21.5 (B3): bambú en la jungla — planta alta que nace
				// estáticamente con 3-12 tallos de 3-8 bloques (parche orgánico;
				// sin crecimiento con el tiempo). Se coloca la base en esta celda
				// y los tallos se escriben directamente (la jungla es densa, el
				// borde del chunk lo recorta el vecino como en los árboles).
				if (biome === "jungle" && rand() < 0.18) {
					const stalks = 3 + Math.floor(rand() * 10);
					for (let s = 0; s < stalks; s++) {
						const bx = x + Math.floor(rand() * 5) - 2;
						const bz = z + Math.floor(rand() * 5) - 2;
						if (bx < 0 || bx >= CHUNK_SIZE || bz < 0 || bz >= CHUNK_SIZE)
							continue;
						const stalk = 3 + Math.floor(rand() * 6); // 3-8 de alto
						const baseWx = cx * CHUNK_SIZE + bx,
							baseWz = cz * CHUNK_SIZE + bz;
						if (
							data[core.idx(bx, core.toLocal(height), bz)] !== B.AIR ||
							isPondAt(baseWx, baseWz) ||
							isLavaPondAt(baseWx, baseWz)
						)
							continue;
						for (let i = 0; i < stalk; i++) {
							const y = height + i;
							if (y <= WORLD_MAX_Y)
								data[core.idx(bx, core.toLocal(y), bz)] = B.BAMBOO;
						}
					}
				}
				// Fase 21.5 (E3): vegetación decorativa por bioma.
				// La paleta cambia según el bioma: arbustos en bosque/llanura,
				// luciérnagas en pantano, hojarasca bajo árboles del bosque.
				// La hierba seca de desierto/badlands corre fuera de canGrowTree
				// (ver más abajo) porque el suelo no es GRASS.
				const veg = rand();
				if (biome === "swamp") {
					// Pantano: arbusto de luciérnagas (brillo suave) y hierba alta.
					if (veg < 0.06)
						data[core.idx(x, core.toLocal(height), z)] = B.FIREFLY_BUSH;
					else if (veg < 0.14)
						data[core.idx(x, core.toLocal(height), z)] = B.TALL_GRASS;
				} else if (
					biome === "plains" ||
					biome === "forest" ||
					biome === "birch_forest"
				) {
					// Llanura/bosque: flores silvestres, arbusto, hierba alta y
					// las flores clásicas (amapola/diente de león).
					if (veg < 0.05)
						data[core.idx(x, core.toLocal(height), z)] = B.WILDFLOWERS;
					else if (veg < 0.08)
						data[core.idx(x, core.toLocal(height), z)] = B.BUSH;
					else if (veg < 0.14)
						data[core.idx(x, core.toLocal(height), z)] = B.TALL_GRASS;
					else if (veg < 0.155)
						data[core.idx(x, core.toLocal(height), z)] = B.POPPY;
					else if (veg < 0.17)
						data[core.idx(x, core.toLocal(height), z)] = B.DANDELION;
				} else if (biome === "taiga" || biome === "giant_taiga") {
					// Taiga: hierba alta + hojarasca (bajo pinos).
					if (veg < 0.08)
						data[core.idx(x, core.toLocal(height), z)] = B.LEAF_LITTER;
					else if (veg < 0.14)
						data[core.idx(x, core.toLocal(height), z)] = B.TALL_GRASS;
				} else {
					// Otros biomas (montaña, jungla, snow): hierba alta + flores.
					if (veg < 0.1)
						data[core.idx(x, core.toLocal(height), z)] = B.TALL_GRASS;
					else if (veg < 0.12)
						data[core.idx(x, core.toLocal(height), z)] = B.POPPY;
					else if (veg < 0.14)
						data[core.idx(x, core.toLocal(height), z)] = B.DANDELION;
				}
			}
			// Fase 21.5 (E3): hierba seca en desierto/badlands — corre fuera
			// de canGrowTree (que exige GRASS); en estos biomas el suelo es
			// arena/terracota, así que se coloca directamente sobre la superficie.
			if (
				(biome === "desert" || biome === "badlands") &&
				data[core.idx(x, core.toLocal(height), z)] === B.AIR
			) {
				const dry = rand();
				if (dry < 0.08)
					data[core.idx(x, core.toLocal(height), z)] =
						biome === "badlands" && dry < 0.03
							? B.TALL_DRY_GRASS
							: B.SHORT_DRY_GRASS;
			}
			if (
				canGrowTree &&
				(biome === "plains" || biome === "forest") &&
				rand() < 0.004
			) {
				// Pilar de piedra: columna de 1-3 bloques con la cima de musgo.
				const h = 1 + Math.floor(rand() * 3);
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
			// Fase 21 (B1): pozo del desierto — pisa el terreno después del resto.
			if (well) structures.placeWellColumn(data, x, z, wx, wz, well, height);
			// Fase 21 (B2): pirámide del desierto — pisa el terreno después del
			// resto (escribe el sótano y el cuerpo escalonado completo).
			if (pyramid)
				structures.placePyramidColumn(data, x, z, wx, wz, pyramid, height);
			// Fase 21.5 (D1): Trial Chambers — excava el volumen de la cámara
			// bajo el terreno (piso baseY-TRIAL_DEPTH) tras el resto.
			if (trial) structures.placeTrialColumn(data, x, z, wx, wz, trial, height);
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
	// Fase 20 B4 (P4): NO se marca dirty al generar — el RNG por chunk hace la
	// generación determinista, así que un chunk nunca modificado se regenera
	// idéntico en la próxima sesión y no necesita escribirse a disco. Solo las
	// modificaciones del jugador marcan dirty (world.js markChunkDirty).
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
	setCore,
	setChunkRng // Fase 20 B4 (P4): inyección de PRNG para los tests
};
