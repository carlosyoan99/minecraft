"use strict";

// ============================================================
// MUNDO: GENERACIÓN, ACCESO A BLOQUES Y ARCHIVOS DE CHUNK
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib"); // gzip del guardado por chunk (Fase 7)
const { createNoise2D, createNoise3D } = require("simplex-noise");
const constants = require("./constants.js");
const {
	CHUNK_SIZE,
	WORLD_HEIGHT,
	SCHEMA_VERSION,
	B,
	isSolidBlock,
	GRAVITY_BLOCKS
} = constants;
const state = require("./state.js");
const chests = require("./chests.js"); // cofres de loot de las minas abandonadas (Fase 7)

const { chunks, dirtyChunks } = state;

function seededNoise(seedStr) {
	// PRNG determinista simple (mulberry32) sembrado con el string, para
	// que el mundo sea siempre el mismo entre reinicios del servidor.
	let h = 1779033703 ^ seedStr.length;
	for (let i = 0; i < seedStr.length; i++) {
		h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return (h >>> 0) / 4294967296;
	};
}
// Generadores MUTABLES: reinitNoise(seed) los recrea todos (Fase 6, el menú
// del cliente puede cambiar la semilla en runtime con save.switchWorld).
let noise2D, noise2D_detail, noise2D_ore, noise2D_mountain;
let noise3D_cave,
	noise3D_cave_fine,
	noise2D_lake,
	noise2D_lakeDepth,
	noise2D_river;
// Ruidos de las minas abandonadas (Fase 7): dos campos de "corredores"
// (bandas finas alrededor de las curvas de nivel del ruido), una puerta de
// región (solo ~1/3 del mapa tiene minas) y la profundidad del túnel.
let noise2D_ms_a, noise2D_ms_b, noise2D_ms_region, noise2D_ms_depth;
// Ruidos de pozos decorativos (Fase 7): agua y lava en superficie.
let noise2D_pond, noise2D_pond_region, noise2D_lava;
function reinitNoise(seed) {
	noise2D = createNoise2D(seededNoise(seed));
	noise2D_detail = createNoise2D(seededNoise(`${seed}_detail`));
	noise2D_ore = createNoise2D(seededNoise(`${seed}_ore`));
	// Ruido 2D para montañas (Fase 4): donde es alto, el bioma es montaña (el
	// terreno se eleva y las cumbres altas se cubren de nieve). Determinista y
	// continuo entre chunks, como el resto de la generación.
	noise2D_mountain = createNoise2D(seededNoise(`${seed}_mountain`));
	// Ruido 3D para cuevas (Fase 4): dos octavas sembradas, muestreadas en
	// coordenadas de mundo para que las cuevas sean continuas entre chunks.
	noise3D_cave = createNoise3D(seededNoise(`${seed}_cave`));
	noise3D_cave_fine = createNoise3D(seededNoise(`${seed}_cave_fine`));
	// Ruido 2D para lagos (Fase 4): donde es alto, el terreno se hunde y el
	// agua llena la depresión hasta SEA_LEVEL. Muestreado en coordenadas de
	// mundo → lagos continuos entre chunks y deterministas.
	noise2D_lake = createNoise2D(seededNoise(`${seed}_lake`));
	// Fase 10 (A4): profundidad variable del lago y ríos pequeños (canales
	// que cortan el terreno y se llenan de agua).
	noise2D_lakeDepth = createNoise2D(seededNoise(`${seed}_lake_depth`));
	noise2D_river = createNoise2D(seededNoise(`${seed}_river`));
	// Minas abandonadas (Fase 7).
	noise2D_ms_a = createNoise2D(seededNoise(`${seed}_ms_a`));
	noise2D_ms_b = createNoise2D(seededNoise(`${seed}_ms_b`));
	noise2D_ms_region = createNoise2D(seededNoise(`${seed}_ms_region`));
	noise2D_ms_depth = createNoise2D(seededNoise(`${seed}_ms_depth`));
	// Pozos decorativos (Fase 7).
	noise2D_pond = createNoise2D(seededNoise(`${seed}_pond`));
	noise2D_pond_region = createNoise2D(seededNoise(`${seed}_pond_region`));
	noise2D_lava = createNoise2D(seededNoise(`${seed}_lava`));
}
reinitNoise(constants.SEED); // al arrancar, la SEED de la env var
const SEA_LEVEL = 5; // bloques de agua: y ∈ (LAKE_FLOOR, SEA_LEVEL)
const LAKE_FREQ = 0.012; // frecuencia baja → lagos amplios
const LAKE_THRESHOLD = 0.65; // calibrado por barrido: ~5% de columnas con lago
// (0.35 daba ~26% = mundo lleno de charcos)
const LAKE_FLOOR = 2; // fondo del lago: arena en y=LAKE_FLOOR, piedra debajo
function isLake(wx, wz) {
	return noise2D_lake(wx * LAKE_FREQ, wz * LAKE_FREQ) > LAKE_THRESHOLD;
}

// Fase 10 (A4): profundidad VARIABLE del lago (0..LAKE_FLOOR → de 3 a ~6
// bloques de agua). Antes todos los lagos tenían el mismo fondo plano.
function lakeFloorY(wx, wz) {
	const d = (noise2D_lakeDepth(wx * 0.05, wz * 0.05) + 1) / 2; // 0..1
	return Math.max(1, Math.floor(d * (LAKE_FLOOR + 1))); // 1..3 → agua de 2 a 4 bloques
}

// Fase 10 (A4): RÍOS pequeños — banda estrecha del ruido de río donde el
// terreno se hunde en un canal y el agua lo llena hasta SEA_LEVEL (agua
// siempre por debajo del nivel del mar: la invariante de unit-mundo de
// "agua sobre SEA_LEVEL = charco" se conserva).
const RIVER_FREQ = 0.008; // frecuencia baja → meandros amplios
const RIVER_WIDTH = 0.14; // banda del ruido que es río (≈5% de columnas)
function isRiver(wx, wz) {
	return (
		Math.abs(noise2D_river(wx * RIVER_FREQ, wz * RIVER_FREQ)) < RIVER_WIDTH
	);
}
// Profundidad del canal (1-4 bloques bajo el terreno, según la fuerza del
// ruido en esa columna) — los ríos son valles, no zanjas rectas.
function riverDepth(wx, wz) {
	const n = noise2D_river(wx * RIVER_FREQ, wz * RIVER_FREQ);
	return 2 + Math.floor((Math.abs(n) / RIVER_WIDTH) * 2); // 2..4
}

// Fondo real de una columna de agua (lago o río): Y del lecho (el bloque
// SAND) o null si la columna no es de agua. Lo usan generateChunk y los
// tests (unit-mundo) — la profundidad ya no es LAKE_FLOOR fijo.
function columnFloorY(wx, wz) {
	if (isLake(wx, wz)) return lakeFloorY(wx, wz);
	if (isRiver(wx, wz)) {
		const temp = noise2D(wx * 0.005, wz * 0.005);
		const mnt = noise2D_mountain(wx * 0.008, wz * 0.008);
		const h = heightFrom(
			temp,
			smoothstep(MOUNTAIN_RAMP[0], MOUNTAIN_RAMP[1], mnt),
			wx,
			wz
		);
		return Math.max(1, Math.min(h - riverDepth(wx, wz), SEA_LEVEL - 1));
	}
	return null;
}

// Playas costeras (Fase 9, Bloque F): una columna es "costa" si hay un lago a
// ≤2 bloques (transición suave agua → arena → tierra, sin cortes). Las costas
// llevan arena en la superficie, como en Minecraft.
function nearLake(wx, wz) {
	for (let dx = -2; dx <= 2; dx++) {
		for (let dz = -2; dz <= 2; dz++) {
			if (isLake(wx + dx, wz + dz)) return true;
		}
	}
	return false;
}

// Umbral de temperatura para tundra: por debajo hace tanto frío que nieva.
const SNOW_TEMP = -0.3;
// Umbral del ruido de montaña: por encima el terreno se eleva en cordilleras.
// Calibrado por barrido en la semilla: con 0.35 las montañas ocupaban el 25%
// del mundo y eclipsaban a las llanuras; con 0.45 quedan en ~19% (desierto
// ~9%, bosque ~31%, llanura ~20%, nieve ~20%).
const MOUNTAIN_THRESHOLD = 0.45;
// Altura mínima de cumbre para que la superficie de una montaña sea nieve
// (por debajo, la roca queda al descubierto). Calibrado: con 15, ~91% de las
// montañas quedaban nevadas y se confundían con la tundra; con 18 solo las
// cumbres altas (alturas 12-26) llevan nieve y hay contraste entre biomas.
const MOUNTAIN_SNOW_LINE = 18;

// --- Blend continuo entre biomas (fix: transiciones bruscas) ---
// getBiome() sigue devolviendo la etiqueta discreta dominante (fuente de
// verdad para superficie, árboles y spawn de mobs), pero la ALTURA se
// interpola con funciones continuas del mismo ruido: sin acantilados de
// 4-8 bloques en las fronteras de bioma.
function smoothstep(e0, e1, x) {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}

// Afinidad térmica gaussiana de cada bioma plano (centro = su región de
// temperatura, r = radio de transición): la altura base resultante es una
// media ponderada que varía de forma continua entre biomas vecinos.
const FLAT_AFFINITY = [
	{ center: -0.4, base: 3, r: 0.24 }, // nieve/tundra
	{ center: -0.22, base: 3, r: 0.24 }, // desierto
	{ center: 0.02, base: 4, r: 0.24 }, // llanura
	{ center: 0.32, base: 6, r: 0.28 } // bosque
];
// Rampa del ruido de montaña: 0 en llanuras, 1 dentro de la cordillera.
// Arranca tarde (0.40) para que las columnas con etiqueta de llanura
// (ruido ≤ 0.45) apenas se eleven: estribaciones suaves, no muros.
const MOUNTAIN_RAMP = [0.4, 0.65];

function flatBaseHeight(temp) {
	let num = 0,
		den = 0;
	for (const a of FLAT_AFFINITY) {
		const d = (temp - a.center) / a.r;
		const w = Math.exp(-d * d);
		num += w * a.base;
		den += w;
	}
	return num / den;
}

function biomeFrom(temp, mnt) {
	// Montañas primero: el ruido de montaña manda sobre la temperatura.
	if (mnt > MOUNTAIN_THRESHOLD) return "mountain";
	if (temp < SNOW_TEMP) return "snow"; // tundra: nieve en la superficie
	if (temp < -0.15) return "desert";
	if (temp > 0.2) return "forest";
	return "plains";
}

function getBiome(wx, wz) {
	return biomeFrom(
		noise2D(wx * 0.005, wz * 0.005),
		noise2D_mountain(wx * 0.008, wz * 0.008)
	);
}

function heightFrom(temp, wMnt, wx, wz) {
	const h = noise2D(wx * 0.02, wz * 0.02) * 0.5 + 0.5;
	const detail = noise2D_detail(wx * 0.08, wz * 0.08) * 1.5;
	const flat = flatBaseHeight(temp) + h * 8 + detail;
	// Crestas: octava adicional de mayor amplitud para picos pronunciados.
	const crest = noise2D_mountain(wx * 0.05, wz * 0.05) * 0.5 + 0.5;
	const mountainH = 12 + crest * 14 + detail;
	// Interpolación lineal entre la altura plana y la de cordillera según la
	// rampa: los pies de montaña crecen gradualmente en vez de saltar.
	return Math.max(3, Math.floor(flat * (1 - wMnt) + mountainH * wMnt));
}

function getHeight(wx, wz) {
	const mnt = noise2D_mountain(wx * 0.008, wz * 0.008);
	return heightFrom(
		noise2D(wx * 0.005, wz * 0.005),
		smoothstep(MOUNTAIN_RAMP[0], MOUNTAIN_RAMP[1], mnt),
		wx,
		wz
	);
}

// Bloque de superficie: la etiqueta dominante manda (nieve en tundra y
// cumbres, roca en montañas bajas, arena en desierto, césped en el resto),
// pero el umbral de temperatura se desplaza con un jitter de ruido
// determinista para que las fronteras entre biomas sean onduladas y
// orgánicas en vez de una línea recta dura.
function flatSurfaceBlock(temp, j) {
	const t = temp + j * 0.03;
	if (t < SNOW_TEMP) return B.SNOW;
	if (t < -0.15) return B.SAND;
	return B.GRASS; // bosque y llanura comparten césped
}

function surfaceBlockFor(wx, wz, height, temp, mnt) {
	if (mnt > MOUNTAIN_THRESHOLD) {
		if (height >= MOUNTAIN_SNOW_LINE) return B.SNOW;
		return B.STONE;
	}
	return flatSurfaceBlock(temp, noise2D_detail(wx * 0.11, wz * 0.11));
}

// Radio de búsqueda de tierra firme para el punto de aparición (bloques).
const SPAWN_SEARCH_RADIUS = 24;

// Punto de aparición del jugador sobre terreno firme (Fase 4): si la columna
// pedida es un lago, busca en espiral la columna firme más cercana para que
// el jugador no aparezca nadando. Devuelve { x, y, z } con x/z en el centro de
// la columna elegida e y sobre el suelo firme (getHeight + 2, como el spawn
// original). Es determinista: misma entrada → mismo punto (el ruido de lagos
// depende solo de la semilla).
function findSpawn(wx, wz) {
	// Normalizar a la columna: el espiral y el centro (+0.5) asumen enteros.
	wx = Math.floor(wx);
	wz = Math.floor(wz);
	if (!isLake(wx, wz)) {
		return { x: wx + 0.5, z: wz + 0.5, y: getHeight(wx, wz) + 2 };
	}
	for (let r = 1; r <= SPAWN_SEARCH_RADIUS; r++) {
		for (let dx = -r; dx <= r; dx++) {
			for (let dz = -r; dz <= r; dz++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // solo el anillo del radio r
				const nx = wx + dx,
					nz = wz + dz;
				if (!isLake(nx, nz)) {
					return { x: nx + 0.5, z: nz + 0.5, y: getHeight(nx, nz) + 2 };
				}
			}
		}
	}
	// Caso límite (sin tierra firme en el radio): sobre la superficie del agua.
	return { x: wx + 0.5, z: wz + 0.5, y: SEA_LEVEL + 2 };
}

// Devuelve true si (wx, wy, wz) debe excavarse como cueva. Ruido 3D
// "ridged" (1 - |n|): donde el ruido cruza cerca de 0 se forman túneles
// tipo gusano (estilo Minecraft). La suma ponderada de dos octavas
// (gruesa + fina) da pasadizos con desvíos. Determinista por coordenada
// de mundo: mismo resultado en cualquier reinicio y continuo entre chunks.
const CAVE_FREQ = 0.07; // escala horizontal de los túneles
const CAVE_FREQ_Y = 0.09; // algo mayor en Y para túneles más horizontales
const CAVE_FINE_FREQ = 0.2; // octava fina (desvíos)
const CAVE_THRESHOLD = 0.84; // calibrado por barrido: ~14% del subsuelo excavado,
// túneles conexos sin queso suizo (0.62 daba ~58%)
function caveStrength(wx, wy, wz) {
	const base =
		1 -
		Math.abs(noise3D_cave(wx * CAVE_FREQ, wy * CAVE_FREQ_Y, wz * CAVE_FREQ));
	const fine =
		1 -
		Math.abs(
			noise3D_cave_fine(
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
// excava la boca (≈1-2% de columnas) → entradas de cueva escasas y visibles
// hacia el exterior. La conexión real exige además la capa inferior excavada
// (nearSurface 0.91), así que nunca hay hoyos aislados.
const CAVE_MOUTH_THRESHOLD = 0.9;

// ============================================================
// MINAS ABANDONADAS (Fase 7): pasillos subterráneos + cofres de loot.
// Se modelan como bandas finas alrededor de las curvas de nivel de dos
// ruidos independientes (dos familias de túneles que se cruzan), limitadas
// a regiones donde una puerta de ruido lo permite. Los túneles son
// horizontales (MS_TUNNEL_H de alto) a profundidad variable, se excavan
// SOLO en piedra (preservan minerales) y nunca rompen la superficie
// (y < height - 1). Deterministas por coordenada de mundo → continuos
// entre chunks, como las cuevas.
// ============================================================
const MS_REGION_GATE = 0.25; // ruido en [-1,1]: < 0.25 ≈ 60% del mapa puede tener minas
const MS_BAND = 0.055; // banda de cada familia de túneles (~2.7% por familia)
const MS_TUNNEL_H = 3; // alto del túnel (bloques excavados sobre su suelo)
// Profundidad del túnel RELATIVA a la superficie (fix): 4-16 bloques por
// debajo de ella, con variación de ruido suave y continua entre chunks
// (el túnel serpentea en profundidad, nunca queda en el aire sobre el
// terreno ni rompe la superficie: el guard y < height - 1 lo garantiza).
const MS_BELOW_MIN = 3;
const MS_BELOW_RANGE = 6;

function mineshaftAt(wx, wz) {
	if (noise2D_ms_region(wx * 0.005, wz * 0.005) < MS_REGION_GATE) return false;
	const a = noise2D_ms_a(wx * 0.035, wz * 0.035);
	const b = noise2D_ms_b(wz * 0.035, -wx * 0.035);
	return Math.abs(a) < MS_BAND || Math.abs(b) < MS_BAND;
}
// Suelo del túnel: `height` es la altura de la superficie. El túnel queda
// siempre bajo tierra, a MS_BELOW_MIN..+RANGE bloques de profundidad.
function mineshaftDepth(wx, wz, height) {
	const below =
		MS_BELOW_MIN +
		Math.floor(
			((noise2D_ms_depth(wx * 0.06, wz * 0.06) + 1) / 2) * MS_BELOW_RANGE
		);
	return Math.max(2, height - 1 - below);
}
// Cofre de loot: ~0.6% de las celdas de pasillo llevan cofre (hash 2D
// determinista, sin Math.random: estable entre reinicios y por columna).
function msLootSpot(wx, wz) {
	let h = (Math.imul(wx, 374761393) + Math.imul(wz, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < 0.006;
}

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
		noise2D_pond_region(wx * 0.01, wz * 0.01) > POND_REGION_GATE &&
		noise2D_pond(wx * 0.06, wz * 0.06) > POND_THRESHOLD
	);
}
function isLavaPondAt(wx, wz) {
	// Fase 10 (A3): nunca lava en biomas de hielo/tundra (bug de las notas) y
	// solo en regiones templadas o cálidas (el ruido de temperatura es el
	// mismo que usa biomeFrom, así que es consistente con el bioma real).
	const temp = noise2D(wx * 0.005, wz * 0.005);
	if (temp < SNOW_TEMP) return false;
	return (
		noise2D_pond_region(wx * 0.01, wz * 0.01) > LAVA_REGION_GATE &&
		noise2D_lava(wx * 0.07, wz * 0.07) > LAVA_THRESHOLD
	);
}

function idx(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

// --- Archivos de chunk (escritura atómica) ---
// La ruta se lee del holder mutable en tiempo de llamada: si el menú cambia
// la semilla (save.switchWorld → constants.setWorldSeed), los archivos se
// escriben/leen en el directorio del mundo activo.
function chunkFilePath(cx, cz) {
	return path.join(constants.worldPaths.chunksDir, `${cx}_${cz}.json`);
}

// Escritura atómica (archivo temporal + renombrado): si el proceso muere
// a mitad de escritura, no se queda un archivo de chunk a medias.
function atomicWrite(file, data) {
	const tmp = `${file}.tmp`;
	fs.writeFileSync(tmp, data);
	fs.renameSync(tmp, file);
}

// Serializa y escribe un chunk (clave "cx,cz") en su archivo, COMPRIMIDO con
// gzip (Fase 7): el JSON de un chunk (16×64×16 bytes como array) se comprime
// ~10-15x y los mundos grandes ocupan mucho menos disco. El nombre de archivo
// no cambia (misma extensión .json); la lectura detecta la cabecera gzip
// (0x1f 0x8b) y descomprime si procede, así que los mundos viejos en JSON
// plano se siguen leyendo sin migración (retrocompatible, sin bump de schema).
function writeChunkFile(key, arr) {
	const [cx, cz] = key.split(",").map(Number);
	const json = JSON.stringify({
		schemaVersion: SCHEMA_VERSION,
		cx,
		cz,
		data: Array.from(arr)
	});
	atomicWrite(chunkFilePath(cx, cz), zlib.gzipSync(json));
}

// Lee y valida un archivo de chunk; devuelve el objeto {cx, cz, data} o null
// si el archivo no existe como JSON válido (con aviso, nunca silencioso).
// Acepta tanto JSON plano (formatos v1-v3) como gzip (Fase 7).
function readChunkFile(file, origen) {
	let parsed;
	try {
		const buf = fs.readFileSync(file);
		// Cabecera gzip (0x1f 0x8b): descomprimir; si no, JSON plano (retrocompat).
		const text =
			buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b
				? zlib.gunzipSync(buf).toString("utf8")
				: buf.toString("utf8");
		parsed = JSON.parse(text);
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: aviso de chunk ilegible (no silenciar)
		console.warn(
			`⚠️  Archivo de chunk ilegible, se ignora: ${origen}: ${e.message}`
		);
		return null;
	}
	if (
		!parsed ||
		!Array.isArray(parsed.data) ||
		typeof parsed.cx !== "number" ||
		typeof parsed.cz !== "number"
	) {
		// biome-ignore lint/suspicious/noConsole: aviso de chunk con formato inválido
		console.warn(`⚠️  Archivo de chunk ignorado (formato inválido): ${origen}`);
		return null;
	}
	if (
		typeof parsed.schemaVersion === "number" &&
		parsed.schemaVersion > SCHEMA_VERSION
	) {
		// biome-ignore lint/suspicious/noConsole: aviso de chunk de versión futura
		console.warn(
			`⚠️  Chunk (${parsed.cx},${parsed.cz}) es de una versión más nueva (v${parsed.schemaVersion}); se ignora (se regenerará y se sobrescribirá al guardar)`
		);
		return null;
	}
	if (parsed.data.length !== CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE) {
		// biome-ignore lint/suspicious/noConsole: aviso de chunk con longitud inesperada
		console.warn(
			`⚠️  Archivo de chunk ignorado (longitud inesperada): ${origen}`
		);
		return null;
	}
	return parsed;
}

function markChunkDirty(cx, cz) {
	dirtyChunks.add(`${cx},${cz}`);
}

// Recupera un chunk desde su archivo si existe; null si no está guardado o es ilegible.
function loadChunkFromDisk(cx, cz) {
	const file = chunkFilePath(cx, cz);
	if (!fs.existsSync(file)) return null;
	const parsed = readChunkFile(file, `chunk ${cx},${cz}`);
	return parsed ? Uint8Array.from(parsed.data) : null;
}

// Hook de tests: permite forzar generación fresca (sin leer disco) como el
// servidor real hace con setBlockChangeHandler. Si se instala, generateChunk
// usa esta función en vez de loadChunkFromDisk.
let diskLoader = null;
function setDiskLoader(fn) {
	diskLoader = fn;
}

// Métrica de rendimiento (Fase 7): ms acumulados generando chunks NUEVOS
// (no los que llegan del disco o ya estaban en memoria). El bucle principal
// la lee con takeChunkGenMs() cada tick y la publica en la media de 1s
// (server_metrics → __mcChunkGenMs del cliente).
let chunkGenMsAccum = 0;
function takeChunkGenMs() {
	const v = chunkGenMsAccum;
	chunkGenMsAccum = 0;
	return v;
}

// Fase 10 (B1): límites del mundo (tamaño por semilla, world.json). Fuera de
// [-half, half) los chunks se devuelven VACÍOS (aire) sin cachear: el cliente
// nunca los recibe (no están en state.chunks) y getBlock devuelve aire.
function outOfBounds(cx, cz) {
	const half = constants.worldHalfExtent();
	const minC = Math.floor(-half / CHUNK_SIZE);
	const maxC = Math.floor((half - 1) / CHUNK_SIZE);
	return cx < minC || cx > maxC || cz < minC || cz > maxC;
}

function inBounds(wx, wz) {
	const half = constants.worldHalfExtent();
	return wx >= -half && wx < half && wz >= -half && wz < half;
}

function generateChunk(cx, cz) {
	const key = `${cx},${cz}`;
	if (chunks.has(key)) return chunks.get(key);
	// Fase 10 (B1): fuera de los bordes → chunk vacío (no se cachea).
	if (outOfBounds(cx, cz)) {
		return new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	}
	// Si el chunk ya fue guardado en disco (p.ej. tras descargarse), recuperarlo
	// tal cual en vez de regenerarlo: la generación usa Math.random y perdería cambios.
	const fromDisk = diskLoader ? diskLoader(cx, cz) : loadChunkFromDisk(cx, cz);
	if (fromDisk) {
		chunks.set(key, fromDisk);
		return fromDisk;
	}

	const genT0 = performance.now();
	const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;

	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			const wx = baseX + x,
				wz = baseZ + z;
			const lake = isLake(wx, wz);
			// Fase 10 (A4): ríos — canales que cortan el terreno (los lagos
			// siguen siendo depresiones; los ríos se hunden en el terreno natural).
			const river = !lake && isRiver(wx, wz);
			const waterCol = lake || river; // columna de agua (lago o río)
			// En un lago el terreno se hunde hasta su fondo (profundidad variable,
			// Fase 10 A4) y el agua llena la depresión hasta SEA_LEVEL; los ríos
			// cortan un canal bajo el terreno natural. No hay árboles ni minerales
			// bajo el agua. Ruidos compartidos por columna (getHeight/getBiome son
			// ruido puro: recalcularlos daría valores idénticos, pero se evita el
			// triple muestreo en el bucle de generación).
			const temp = noise2D(wx * 0.005, wz * 0.005);
			const mnt = noise2D_mountain(wx * 0.008, wz * 0.008);
			const baseHeight = heightFrom(
				temp,
				smoothstep(MOUNTAIN_RAMP[0], MOUNTAIN_RAMP[1], mnt),
				wx,
				wz
			);
			const floorY = columnFloorY(wx, wz) ?? 0; // fondo del agua (columna de agua)
			const height = waterCol ? floorY : baseHeight;
			const biome = biomeFrom(temp, mnt);
			const surfaceBlock = waterCol
				? B.AIR
				: // Fase 9 (Bloque F): playa — la costa de un lago se cubre de arena
					// (transición suave agua → arena → tierra).
					nearLake(wx, wz)
					? B.SAND
					: surfaceBlockFor(wx, wz, height, temp, mnt);
			// Boca de cueva: pico de ruido extremo justo en el bloque de superficie,
			// y solo si la capa inferior ya fue excavada (entrada real conectada al
			// túnel, no un hoyo aislado de 1 bloque). ≈1-2% de columnas.
			const mouthPeak =
				!lake && caveStrength(wx, height - 1, wz) > CAVE_MOUTH_THRESHOLD;
			let carvedTop = false;
			let mouth = false;

			for (let y = 0; y < WORLD_HEIGHT; y++) {
				let block = B.AIR;
				if (y === 0) block = B.BEDROCK;
				else if (waterCol) {
					// Columna de agua (lago o río): piedra bajo el lecho, arena en el
					// lecho y agua encima hasta SEA_LEVEL. Fase 10 (A4): las CUEVAS
					// bajo el agua se inundan (cuevas acuáticas) — nunca hay bolsas
					// de aire bajo el agua (invariante de unit-mundo).
					if (y < floorY) {
						if (y > 1 && isCaveBlock(wx, y, wz, false)) block = B.WATER;
						else block = B.STONE;
					} else if (y === floorY) block = B.SAND;
					else if (y < SEA_LEVEL) block = B.WATER;
				} else if (y < height - 1) {
					// Cuevas (Fase 4): el ruido 3D excava la piedra sin tocar el
					// bedrock (y === 0). Muestreado en coordenadas de mundo → continuo
					// entre chunks vecinos y determinista. Cerca de la superficie el
					// umbral sube (nearSurface): los túneles se estrechan y solo los
					// más fuertes alcanzan la capa superior (boca de cueva).
					if (y > 1 && isCaveBlock(wx, y, wz, y >= height - 3)) {
						block = B.AIR;
						if (y === height - 2) carvedTop = true;
					} else {
						block = B.STONE;
						if (y > 4) {
							// Fase 9 (Bloque F): minerales por altura estilo Minecraft —
							// carbón abundante en profundidad media-alta, hierro medio-
							// bajo, oro bajo, diamante/redstone solo en lo profundo.
							// Segunda octava de ruido para vetas más orgánicas.
							const oreRoll =
								(noise2D_ore(wx * 0.3 + y * 7.1, wz * 0.3) + 1) / 2;
							const oreFine =
								(noise2D_detail(wx * 0.15 + y * 3.7, wz * 0.15) + 1) / 2;
							const roll = oreRoll * 0.7 + oreFine * 0.3;
							if (y < 14 && roll > 0.978) block = B.DIAMOND_ORE;
							else if (y < 18 && roll > 0.968) block = B.REDSTONE_ORE;
							else if (y < 32 && roll > 0.955) block = B.EMERALD_ORE;
							else if (y < 32 && roll > 0.945) block = B.GOLD_ORE;
							else if (y < 48 && roll > 0.9) block = B.IRON_ORE;
							else if (y < 56 && roll > 0.86) block = B.COAL_ORE;
						}
					}
				} else if (y === height - 1) {
					// Superficie: bloque del bioma dominante (tundra nevada, cumbres
					// con nieve, desierto con arena, resto césped) o aire si hay boca
					// de cueva hacia la superficie (solo si la capa inferior se excavó).
					mouth = mouthPeak && carvedTop;
					block = mouth ? B.AIR : surfaceBlock;
				}
				data[idx(x, y, z)] = block;
			}

			// Pozos decorativos (Fase 7): charco de agua o lava que reemplaza al
			// bloque de superficie y deja lecho de arena debajo. Nunca sobre lagos,
			// ni en ríos, ni en bocas de cueva, ni donde no quepa el lecho (height
			// justo sobre el nivel del mar). El charco gana a la boca de cueva
			// (rarísimo).
			const pond =
				!waterCol && !mouth && height > SEA_LEVEL + 1 && isPondAt(wx, wz);
			const lavaPond =
				!pond &&
				!waterCol &&
				!mouth &&
				height > SEA_LEVEL + 1 &&
				isLavaPondAt(wx, wz);
			if (pond) {
				data[idx(x, height - 1, z)] = B.WATER;
				data[idx(x, height - 2, z)] = B.SAND;
			} else if (lavaPond) {
				data[idx(x, height - 1, z)] = B.LAVA;
				data[idx(x, height - 2, z)] = B.SAND;
			}

			// Minas abandonadas (Fase 7): excavar el pasillo horizontal en piedra
			// (preserva minerales y el techo) a la profundidad del túnel; nunca
			// rompen la superficie (y < height - 1). Los cofres de loot van en el
			// suelo del pasillo (raro y determinista).
			if (mineshaftAt(wx, wz)) {
				const depth = mineshaftDepth(wx, wz, height);
				for (
					let y = depth + 1;
					y < depth + MS_TUNNEL_H && y < height - 1;
					y++
				) {
					if (data[idx(x, y, z)] === B.STONE) data[idx(x, y, z)] = B.AIR;
				}
				if (
					msLootSpot(wx, wz) &&
					depth + 1 < height - 1 &&
					data[idx(x, depth + 1, z)] === B.AIR
				) {
					data[idx(x, depth + 1, z)] = B.CHEST;
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
				!waterCol && !mouth && !pond && !lavaPond && surfaceBlock === B.GRASS;
			const treeRoll = Math.random();
			if (
				canGrowTree &&
				(biome === "forest" || biome === "plains") &&
				treeRoll < (biome === "forest" ? 0.05 : 0.012)
			) {
				// Roble (bosque/llanura) o abedul (bosque, ~1/3): misma forma,
				// madera distinta (tronco claro).
				const birch = biome === "forest" && Math.random() < 0.33;
				const log = birch ? B.BIRCH_LOG : B.OAK_LOG;
				const leaves = birch ? B.BIRCH_LEAVES : B.OAK_LEAVES;
				const treeHeight = 4 + Math.floor(Math.random() * 3);
				for (let i = 0; i < treeHeight; i++) {
					const y = height + i;
					if (y < WORLD_HEIGHT) data[idx(x, y, z)] = log;
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
							if (isPondAt(leafWx, leafWz) || isLavaPondAt(leafWx, leafWz))
								continue;
							const y = height + dy;
							if (y < WORLD_HEIGHT && data[idx(lx, y, lz)] === B.AIR)
								data[idx(lx, y, lz)] = leaves;
						}
					}
				}
			} else if (
				canGrowTree &&
				(biome === "snow" || biome === "mountain") &&
				treeRoll < 0.02
			) {
				// Pino cónico (abeto) en frío: tronco alto y estrecho con copa cónica.
				const treeHeight = 5 + Math.floor(Math.random() * 4);
				for (let i = 0; i < treeHeight; i++) {
					const y = height + i;
					if (y < WORLD_HEIGHT) data[idx(x, y, z)] = B.SPRUCE_LOG;
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
							if (isPondAt(leafWx, leafWz) || isLavaPondAt(leafWx, leafWz))
								continue;
							const y = height + dy;
							if (y < WORLD_HEIGHT && data[idx(lx, y, lz)] === B.AIR)
								data[idx(lx, y, lz)] = B.SPRUCE_LEAVES;
						}
					}
				}
			}

			// Fase 9 (Bloque F): estructuras y vegetación sobre césped firme —
			// hierba alta, flores (amapola/diente de león) y, raramente, un pilar
			// de piedra con piedra de musgo (estructura decorativa).
			if (canGrowTree && data[idx(x, height, z)] === B.AIR) {
				const veg = Math.random();
				if (veg < 0.1) data[idx(x, height, z)] = B.TALL_GRASS;
				else if (veg < 0.12) data[idx(x, height, z)] = B.POPPY;
				else if (veg < 0.14) data[idx(x, height, z)] = B.DANDELION;
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
					if (y < WORLD_HEIGHT && data[idx(x, y, z)] === B.AIR)
						data[idx(x, y, z)] =
							i === h - 1 ? B.MOSSY_COBBLESTONE : B.COBBLESTONE;
				}
			}
		}
	}
	chunks.set(key, data);
	markChunkDirty(cx, cz); // la generación usa Math.random (árboles), así que se persiste
	chunkGenMsAccum += performance.now() - genT0;
	return data;
}

function getBlock(wx, wy, wz) {
	if (wy < 0 || wy >= WORLD_HEIGHT) return B.AIR;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const chunk = chunks.get(`${cx},${cz}`);
	// Si el chunk no está en memoria (no generado o descargado), se trata como
	// aire hasta que se genere: las rutas de interacción pasan por generateChunk,
	// que lo recupera de disco, así que nunca se opera sobre un hueco real.
	if (!chunk) return B.AIR;
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	return chunk[idx(x, wy, z)];
}

// Hook que conecta la red (broadcast de block_update) desde la entrada del
// servidor; evita un ciclo de require entre world y net.
let blockChangeHandler = null;
function setBlockChangeHandler(fn) {
	blockChangeHandler = fn;
}

// ============================================================
// ANTORCHAS: SOPORTE Y CAÍDA (Fase 6)
// En Minecraft una antorcha necesita un bloque sólido adyacente
// (suelo, pared o techo); si el bloque de apoyo se rompe, la
// antorcha cae. Aquí la regla se simplifica a "al menos un vecino
// sólido" (el agua y otra antorcha no dan soporte). El servidor es
// la fuente de verdad: el cliente solo puede confiar en el
// block_update que recibe.
// ============================================================
const NEIGHBORS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];

// ¿La antorcha en (wx, wy, wz) tiene al menos un vecino sólido?
function torchSupported(wx, wy, wz) {
	for (const [dx, dy, dz] of NEIGHBORS) {
		if (isSolidBlock(getBlock(wx + dx, wy + dy, wz + dz))) return true;
	}
	return false;
}

// Tras romper el bloque (wx, wy, wz), se rompen también las antorchas de su
// entorno que se quedaron sin soporte (el setBlock de cada una hace broadcast
// de block_update al cliente, que las quita de su luz).
function cleanUnsupportedTorches(wx, wy, wz) {
	for (const [dx, dy, dz] of NEIGHBORS) {
		const nx = wx + dx,
			ny = wy + dy,
			nz = wz + dz;
		if (getBlock(nx, ny, nz) === B.TORCH && !torchSupported(nx, ny, nz)) {
			setBlock(nx, ny, nz, B.AIR);
		}
	}
}

// ============================================================
// OSCURIDAD (Fase 10, A6): nivel de luz servidor-side, BARATO.
// El servidor no simula luz de antorchas (solo el cliente); para que los
// hostiles aparezcan de día en cuevas/zona oscuras basta con una métrica
// de "cielo visible": una columna es oscura si tiene un bloque opaco
// encima (techo, árboles, sobrehangs) o si la posición está bajo tierra.
// getHeight(0,0) devuelve -1 fuera del mundo generado (lo usan los tests).
// ============================================================

// ¿La posición (wy = pies) tiene el cielo bloqueado (oscuro de día)?
function isColumnDark(wx, wy, wz) {
	for (let y = Math.max(0, wy) + 1; y < WORLD_HEIGHT; y++) {
		const b = getBlock(wx, y, wz);
		if (b !== B.AIR && b !== B.WATER && b !== B.LAVA) return true;
	}
	return false;
}

// Devuelve la Y del primer hueco de aire bajo tierra con techo opaco
// (celda de cueva) para spawn de hostiles de día, o null si la columna
// no tiene cueva (superficie sólida sin excavar).
function findDarkCaveY(wx, wz, surfaceH) {
	for (let y = surfaceH - 2; y > 1; y--) {
		if (
			getBlock(wx, y, wz) === B.AIR &&
			isSolidBlock(getBlock(wx, y + 1, wz))
		) {
			return y; // aire de cueva con techo opaco justo encima → oscuro
		}
	}
	return null;
}

// ============================================================
// BLOQUES CON GRAVEDAD (Fase 10, D1)
// Arena y grava caen si el bloque de debajo no es sólido (o es agua/lava:
// la desplazan y se hunden hasta el fondo, como en Minecraft). Se llama al
// final de cada setBlock sobre la columna del bloque cambiado: si se rompe
// un bloque bajo la arena, la columna cae; si se coloca un bloque sólido
// bajo la arena, deja de caer. Escritura directa de datos + blockChangeHandler
// (no setBlock, para no recurrir) y límite de WORLD_HEIGHT (bucle acotado).
// ============================================================
// ¿Celda por la que puede caer un bloque con gravedad? (aire o líquido: la
// arena/grava se hunde a través del agua/lava hasta el fondo, desplazándola).
function isFallable(b) {
	return b === B.AIR || b === B.WATER || b === B.LAVA;
}

function settleColumn(wx, wy, wz) {
	// wy: celda recién cambiada. La gravedad afecta a la propia celda (si se
	// colocó arena/grava en el aire) y a las de encima (si se rompió su apoyo).
	for (let y = wy; y < WORLD_HEIGHT - 1; y++) {
		const b = getBlock(wx, y, wz);
		if (!GRAVITY_BLOCKS.has(b)) break; // solo la primera columna contigua
		if (!isFallable(getBlock(wx, y - 1, wz))) break; // ya apoyado
		// Buscar el primer soporte hacia abajo (la celda cae DE UN TIRÓN a
		// través del hueco; si el hueco es agua/lava, las desplaza hacia arriba).
		let dest = y - 1;
		while (dest >= 1 && isFallable(getBlock(wx, dest - 1, wz))) dest--;
		if (dest === y - 1 && !isFallable(getBlock(wx, dest, wz))) break; // sin hueco
		const cx = Math.floor(wx / CHUNK_SIZE),
			cz = Math.floor(wz / CHUNK_SIZE);
		const chunk = generateChunk(cx, cz);
		const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const displaced = chunk[idx(x, dest, z)]; // lo que había donde cae (aire/líquido)
		chunk[idx(x, dest, z)] = b;
		chunk[idx(x, y, z)] = displaced;
		markChunkDirty(cx, cz);
		if (blockChangeHandler) {
			blockChangeHandler(wx, dest, wz, b); // destino
			blockChangeHandler(wx, y, wz, displaced); // origen
		}
		// La celda que estaba encima ahora cae al hueco (el bucle continúa).
	}
}

function setBlock(wx, wy, wz, blockId) {
	if (wy < 0 || wy >= WORLD_HEIGHT) return false;
	// Fase 10 (B1): no colocar fuera de los límites del mundo.
	if (!inBounds(wx, wz)) return false;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const chunk = generateChunk(cx, cz);
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	chunk[idx(x, wy, z)] = blockId;
	markChunkDirty(cx, cz);
	// Fase 10 (D1): después de cambiar el bloque, la gravedad asienta la
	// columna (la arena/grava de encima cae si perdió el soporte).
	settleColumn(wx, wy, wz);
	if (blockChangeHandler) blockChangeHandler(wx, wy, wz, blockId);
	return true;
}

function ensureChunksAround(wx, wz, radius) {
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const generated = [];
	for (let x = cx - radius; x <= cx + radius; x++) {
		for (let z = cz - radius; z <= cz + radius; z++) {
			const key = `${x},${z}`;
			const isNew = !chunks.has(key);
			generateChunk(x, z);
			if (isNew) generated.push(key);
		}
	}
	return generated;
}

module.exports = {
	getBiome,
	getHeight,
	findSpawn,
	generateChunk,
	mineshaftAt,
	mineshaftDepth,
	msLootSpot,
	MS_TUNNEL_H,
	isPondAt,
	isLavaPondAt,
	getBlock,
	setBlock,
	ensureChunksAround,
	atomicWrite,
	writeChunkFile,
	readChunkFile,
	loadChunkFromDisk,
	setBlockChangeHandler,
	setDiskLoader,
	isColumnDark,
	findDarkCaveY,
	inBounds,
	outOfBounds,
	takeChunkGenMs,
	reinitNoise,
	isLake,
	isRiver,
	lakeFloorY,
	columnFloorY,
	SEA_LEVEL,
	LAKE_FLOOR,
	SNOW_TEMP,
	MOUNTAIN_THRESHOLD,
	MOUNTAIN_SNOW_LINE,
	torchSupported,
	cleanUnsupportedTorches
};
