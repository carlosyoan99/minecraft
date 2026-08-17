"use strict";

// ============================================================
// MUNDO: GENERACIÓN, ACCESO A BLOQUES Y ARCHIVOS DE CHUNK
// ============================================================
const fs = require("node:fs");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const path = require("node:path");
const zlib = require("node:zlib"); // gzip del guardado por chunk (Fase 7)
const constants = require("./constants.js");
const {
	CHUNK_SIZE,
	WORLD_HEIGHT,
	WORLD_MIN_Y,
	WORLD_MAX_Y,
	SCHEMA_VERSION,
	B,
	isSolidBlock,
	isDoor, // Fase 13 (L2): puertas/portones (estado de apertura)
	GRAVITY_BLOCKS
} = constants;
const state = require("./state.js");
const _chests = require("./chests.js"); // cofres de loot de las minas abandonadas (Fase 7)

const { chunks, dirtyChunks } = state;
// Fase 18 (D-3): ruido, biomas, estructuras y generación extraídos a sus
// módulos (noise.js, biomes.js, structures.js, generation.js). Este archivo
// queda con la clase World/Chunk, el acceso a bloques (getBlock/setBlock),
// la serialización de chunks y ensureChunksAround; las fachadas del api se
// re-exportan abajo.
const noise = require("./noise.js");
const biomes = require("./biomes.js");
const structures = require("./structures.js");
const generation = require("./generation.js");

const SPAWN_SEARCH_RADIUS = 24;
// Auditoría 2026-08-15 (F3): mayor ID de bloque definido (scripts de
// validación de rango del guardado). Se deriva de constants.B en el arranque.
const MAX_BLOCK_ID = Math.max(
	...Object.values(B).filter((v) => typeof v === "number")
);

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
	// Fase 11 (A1): una columna es APTA si no es ni lago ni río (cualquier
	// columna de agua). Antes solo se comprobaba isLake: el spawn podía caer
	// en un río de la Fase 10 (A4) y el jugador nacía nadando en un canal sin
	// bloques minables a ≤7 — el "clic no hace nada" de la Fase 11.
	const waterAt = (x, z) => biomes.columnFloorY(x, z) !== null;
	if (!waterAt(wx, wz)) {
		return { x: wx + 0.5, z: wz + 0.5, y: biomes.getHeight(wx, wz) + 2 };
	}
	for (let r = 1; r <= SPAWN_SEARCH_RADIUS; r++) {
		for (let dx = -r; dx <= r; dx++) {
			for (let dz = -r; dz <= r; dz++) {
				if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // solo el anillo del radio r
				const nx = wx + dx,
					nz = wz + dz;
				if (!waterAt(nx, nz)) {
					return { x: nx + 0.5, z: nz + 0.5, y: biomes.getHeight(nx, nz) + 2 };
				}
			}
		}
	}
	// Caso límite (sin tierra firme en el radio): sobre la superficie del agua.
	return { x: wx + 0.5, z: wz + 0.5, y: biomes.WORLD_SEA_LEVEL + 2 };
}

// Devuelve true si (wx, wy, wz) debe excavarse como cueva. Ruido 3D
// "ridged" (1 - |n|): donde el ruido cruza cerca de 0 se forman túneles
// tipo gusano (estilo Minecraft). La suma ponderada de dos octavas
// (gruesa + fina) da pasadizos con desvíos. Determinista por coordenada
// de mundo: mismo resultado en cualquier reinicio y continuo entre chunks.
// Fase 17 (B5): pocas cuevas, pero LARGAS Y GRANDES (explorables) — Notas

function idx(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

// Y de MUNDO → índice local del chunk (Fase 15 D5): el dato se guarda con
// local y = mundo y − WORLD_MIN_Y (mundo −64..63 → local 0..127).
function toLocal(wy) {
	return wy - WORLD_MIN_Y;
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
	// Fase 15 (D5): defensivo — si llega un array del layout viejo (16×64×16,
	// p. ej. la migración del world.dat legacy), se convierte a v6 antes de
	// escribir para que el chunk no quede ilegible al recargar.
	if (arr.length === CHUNK_SIZE * 64 * CHUNK_SIZE) arr = migrateV5Chunk(arr);
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
		log.warn(
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
		log.warn(`⚠️  Archivo de chunk ignorado (formato inválido): ${origen}`);
		return null;
	}
	if (
		typeof parsed.schemaVersion === "number" &&
		parsed.schemaVersion > SCHEMA_VERSION
	) {
		log.warn(
			`⚠️  Chunk (${parsed.cx},${parsed.cz}) es de una versión más nueva (v${parsed.schemaVersion}); se ignora (se regenerará y se sobrescribirá al guardar)`
		);
		return null;
	}
	// Fase 15 (D5): migración v5 → v6. Los chunks v5 son 16×64×16 (local y =
	// mundo y, 0..63); el mundo nuevo es −64..+63, así que el dato viejo se
	// desplaza al nuevo local y 64..127 (mundo 0..63) y el fondo nuevo
	// (mundo −64..−1) se rellena con bedrock + piedra. Las construcciones de
	// la superficie se conservan tal cual; solo el subsuelo nuevo queda sin
	// cuevas (los chunks recién generados con v6 sí las tienen).
	if (
		parsed.data.length === CHUNK_SIZE * 64 * CHUNK_SIZE &&
		(typeof parsed.schemaVersion !== "number" || parsed.schemaVersion < 6)
	) {
		parsed.data = Array.from(migrateV5Chunk(Uint8Array.from(parsed.data)));
		parsed.schemaVersion = SCHEMA_VERSION;
		return parsed;
	}
	if (parsed.data.length !== CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE) {
		log.warn(`⚠️  Archivo de chunk ignorado (longitud inesperada): ${origen}`);
		return null;
	}
	// Auditoría 2026-08-15 (F3): validación de rango — el dato de un chunk es
	// una lista de IDs de bloque; cualquier byte fuera del rango válido
	// (0..MAX_BLOCK_ID) revela corrupción (escritura a medias, versión de
	// otro mundo) y generaría bloques de aire con drops extraños. Se ignora
	// el archivo y se regenera. El escaneo es linear en 16384 bytes y ocurre
	// una sola vez por carga de chunk.
	const arr = Uint8Array.from(parsed.data);
	for (let i = 0; i < arr.length; i++) {
		if (arr[i] > MAX_BLOCK_ID) {
			log.warn(
				`⚠️  Archivo de chunk ignorado (bloque ${arr[i]} fuera de rango en ${i}): ${origen}`
			);
			return null;
		}
	}
	// Normalizar a Uint8Array (los archivos v6 se guardan como array plano).
	parsed.data = Array.from(arr);
	return parsed;
}

// Migra un chunk v5 (16×64×16, local y == mundo y 0..63) al layout v6
// (16×128×16, local y = mundo y − WORLD_MIN_Y): el dato viejo sube a local
// 64..127 y el fondo (local 0..63 = mundo −64..−1) se rellena con bedrock
// (local 0) y piedra. Determinista y sin estado: mismo input → mismo output.
function migrateV5Chunk(oldData) {
	const out = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	for (let ly = 0; ly < 64; ly++) {
		const src = ly * CHUNK_SIZE * CHUNK_SIZE;
		const dst = (ly - WORLD_MIN_Y) * CHUNK_SIZE * CHUNK_SIZE;
		out.set(oldData.subarray(src, src + CHUNK_SIZE * CHUNK_SIZE), dst);
	}
	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			out[idx(x, 0, z)] = B.BEDROCK; // local 0 = mundo −64
			for (let ly = 1; ly < -WORLD_MIN_Y; ly++) out[idx(x, ly, z)] = B.STONE;
		}
	}
	return out;
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

// Fase 11 (Bloque B): lianas — cuelgan del borde de la copa (hasta 3
// bloques, solo donde hay aire, sin tocar el suelo). Escritura directa
// sobre el chunk (lx/lz son coordenadas LOCALES del chunk). El bucle solo
// cuelga donde la celda de debajo es aire: en el interior de la copa las
// hojas cortan la liana (break), así que las lianas salen del envés de la
// copa hacia el suelo, como en Minecraft.

function getBlock(wx, wy, wz) {
	if (wy < WORLD_MIN_Y || wy > WORLD_MAX_Y) return B.AIR;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const chunk = chunks.get(`${cx},${cz}`);
	// Si el chunk no está en memoria (no generado o descargado), se trata como
	// aire hasta que se genere: las rutas de interacción pasan por generateChunk,
	// que lo recupera de disco, así que nunca se opera sobre un hueco real.
	if (!chunk) return B.AIR;
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	return chunk[idx(x, toLocal(wy), z)];
}

// ============================================================
// COLISIÓN POR FORMA (Fase 13, L2/L3)
// isSolidBlock(id) sigue siendo la función pura por ID (losas, escaleras,
// puertas y vallas devuelven true: SON bloques sólidos). La FORMA real la
// resuelve isSolidAt(wx, wy, wz) consultando el bloque y su geometría:
//  - LOSA (60/61): solo la mitad inferior de la celda es sólida (media caja)
//    → un jugador puede estar de pie sobre ella (y+0.5) y no puede
//    atravesarla; también puede saltar a media altura.
//  - ESCALERA (50/51): sólida en el escalón inferior (y+0.5); el escalón
//    superior se puede pisar (subir escaleras caminando es posible con salto).
//  - PUERTA/PORTÓN (48/49/71): la solidez depende del estado (state.doors):
//    cerrada = sólida, abierta = se atraviesa (como MC).
//  - VALLA (70): sólida en toda la celda (no se atraviesa; visualmente se
//    ve a través — es una simplificación del render, la colisión es real).
// El punto consultado es una posición de MUNDO flotante: la Y fraccionaria
// decide dentro de la celda. La usan net.js (validación de move) y la
// física de mobs para no caminar a través de las formas.
// ============================================================
function isSolidAt(wx, wy, wz) {
	const b = getBlock(Math.floor(wx), Math.floor(wy), Math.floor(wz));
	if (!isSolidBlock(b)) return false;
	// Puertas/portones: la celda de la puerta es sólida solo si está cerrada.
	if (isDoor(b)) {
		const d = state.doors.get(
			`${Math.floor(wx)},${Math.floor(wy)},${Math.floor(wz)}`
		);
		return !d?.open;
	}
	// Losa: media caja inferior (la Y fraccionaria del punto decide).
	if (b === B.OAK_SLAB || b === B.STONE_SLAB) {
		const fy = wy - Math.floor(wy);
		return fy < 0.5;
	}
	// Escalera: escalón inferior sólido, el superior se pisa (como MC).
	if (b === B.OAK_STAIRS || b === B.STONE_STAIRS) {
		const fy = wy - Math.floor(wy);
		return fy < 0.5;
	}
	return true; // valla y resto de sólidos: celda completa
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
	for (let y = Math.max(WORLD_MIN_Y, wy) + 1; y <= WORLD_MAX_Y; y++) {
		const b = getBlock(wx, y, wz);
		if (b !== B.AIR && b !== B.WATER && b !== B.LAVA) return true;
	}
	return false;
}

// Devuelve la Y del primer hueco de aire bajo tierra con techo opaco
// (celda de cueva) para spawn de hostiles de día, o null si la columna
// no tiene cueva (superficie sólida sin excavar).
function findDarkCaveY(wx, wz, surfaceH) {
	for (let y = surfaceH - 2; y > WORLD_MIN_Y + 1; y--) {
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
	for (let y = wy; y < WORLD_MAX_Y; y++) {
		const b = getBlock(wx, y, wz);
		if (!GRAVITY_BLOCKS.has(b)) break; // solo la primera columna contigua
		if (!isFallable(getBlock(wx, y - 1, wz))) break; // ya apoyado
		// Buscar el primer soporte hacia abajo (la celda cae DE UN TIRÓN a
		// través del hueco; si el hueco es agua/lava, las desplaza hacia arriba).
		let dest = y - 1;
		while (dest > WORLD_MIN_Y && isFallable(getBlock(wx, dest - 1, wz))) dest--;
		if (dest === y - 1 && !isFallable(getBlock(wx, dest, wz))) break; // sin hueco
		const cx = Math.floor(wx / CHUNK_SIZE),
			cz = Math.floor(wz / CHUNK_SIZE);
		const chunk = generation.generateChunk(cx, cz);
		const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const displaced = chunk[idx(x, toLocal(dest), z)]; // lo que había donde cae
		chunk[idx(x, toLocal(dest), z)] = b;
		chunk[idx(x, toLocal(y), z)] = displaced;
		markChunkDirty(cx, cz);
		if (blockChangeHandler) {
			blockChangeHandler(wx, dest, wz, b); // destino
			blockChangeHandler(wx, y, wz, displaced); // origen
		}
		// La celda que estaba encima ahora cae al hueco (el bucle continúa).
	}
}

// Fase 11 (C): fuente de agua infinita — nº de fuentes de agua ORTOGONALES
// adyacentes a una celda. Regla de Minecraft: si se retira un bloque de agua
// con ≥2 vecinas de agua, se rellena solo (la 2×2 con 3 fuentes y el canal de
// 1×3 con las dos puntas nunca se agotan; la única vía de retirarla es colocar
// un bloque sólido encima).
function countWaterNeighbors(wx, wy, wz) {
	let n = 0;
	if (getBlock(wx + 1, wy, wz) === B.WATER) n++;
	if (getBlock(wx - 1, wy, wz) === B.WATER) n++;
	if (getBlock(wx, wy, wz + 1) === B.WATER) n++;
	if (getBlock(wx, wy, wz - 1) === B.WATER) n++;
	return n;
}

function setBlock(wx, wy, wz, blockId) {
	if (wy < WORLD_MIN_Y || wy > WORLD_MAX_Y) return false;
	// Fase 10 (B1): no colocar fuera de los límites del mundo.
	if (!inBounds(wx, wz)) return false;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const chunk = generation.generateChunk(cx, cz);
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	chunk[idx(x, toLocal(wy), z)] = blockId;
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
			generation.generateChunk(x, z);
			// Fase 16 (C2/regresión del bug de semilla): fuera de los bordes
			// generateChunk devuelve vacío SIN cachear — no devolver la key o el
			// llamador haría Array.from(state.chunks.get(key)) → undefined is not
			// iterable (el crash que tiraba el servidor al crear una semilla).
			if (isNew && chunks.has(key)) generated.push(key);
		}
	}
	return generated;
}

// ============================================================
// POO (Fase 13, C3): clases Chunk y World
// ============================================================
// CHUNK: envoltura de un chunk (16×64×16) con serialización y dirty.
// Los datos en memoria siguen siendo Uint8Array en state.chunks (todos los
// consumidores —save, net, tests— los indexan directamente); esta clase
// añade la API orientada a objetos sin cambiar el almacenamiento.
// ============================================================

class Chunk {
	constructor(cx, cz, data = null) {
		this.cx = cx;
		this.cz = cz;
		this.data = data || new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
		this.dirty = false;
	}

	get key() {
		return `${this.cx},${this.cz}`;
	}

	// Coordenadas LOCALES (0..15): acceso directo al dato.
	getBlock(x, y, z) {
		return this.data[idx(x, y, z)];
	}
	setBlock(x, y, z, v) {
		this.data[idx(x, y, z)] = v;
		this.dirty = true;
	}
	markDirty() {
		this.dirty = true;
	}

	// Persistencia: mismo formato gzip que writeChunkFile (Fase 7).
	save() {
		writeChunkFile(this.key, this.data);
		this.dirty = false;
	}

	// Carga desde disco; null si no existe o es ilegible.
	static load(cx, cz) {
		const data = loadChunkFromDisk(cx, cz);
		return data ? new Chunk(cx, cz, data) : null;
	}

	// Envuelve el chunk en memoria; null si no está generado.
	static fromMemory(cx, cz) {
		const data = chunks.get(`${cx},${cz}`);
		return data ? new Chunk(cx, cz, data) : null;
	}
}

// Devuelve el chunk (cx, cz) como objeto Chunk: el de memoria si existe, si
// no se genera (y se cachea en state.chunks) y se envuelve.
function getChunk(cx, cz) {
	const c = Chunk.fromMemory(cx, cz);
	return c || new Chunk(cx, cz, generation.generateChunk(cx, cz));
}

// ============================================================
// WORLD: el mundo como clase (Fase 13, C3)
// La clase declara los métodos de instancia que ya exponía el módulo como
// funciones sueltas; se enlazan al prototipo debajo desde `api` para no
// duplicar firmas a mano. El singleton `world` (module.exports) es una
// instancia: `world.getBlock(...)` funciona igual que antes y los tests que
// parchean `world.getBlock = ...` siguen funcionando (asignan una propiedad
// propia sobre la instancia, como hacían sobre el objeto de exports).
// ============================================================
class World {}

// API del módulo (funciones sueltas de siempre, ahora métodos de World).
const api = {
	getBiome: biomes.getBiome,
	biomeCacheStats: biomes.biomeCacheStats,
	getHeight: biomes.getHeight,
	isSolidAt,
	findSpawn,
	generateChunk: generation.generateChunk,
	mineshaftAt: structures.mineshaftAt,
	mineshaftDepth: structures.mineshaftDepth,
	msLootSpot: structures.msLootSpot,
	structureAt: structures.structureAt,
	templeTrapAt: structures.templeTrapAt,
	placeTempleColumn: structures.placeTempleColumn,
	placeShipwreckColumn: structures.placeShipwreckColumn,
	templeBlockAt: structures.templeBlockAt,
	isPondAt: generation.isPondAt,
	isLavaPondAt: generation.isLavaPondAt,
	isSwampPoolAt: generation.isSwampPoolAt,
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
	reinitNoise: noise.reinitNoise,
	isLake: biomes.isLake,
	isRiver: biomes.isRiver,
	lakeFloorY: biomes.lakeFloorY,
	isOcean: biomes.isOcean,
	oceanFloorY: biomes.oceanFloorY,
	columnFloorY: biomes.columnFloorY,
	torchSupported,
	cleanUnsupportedTorches,
	countWaterNeighbors,
	getChunk
};
for (const name of Object.keys(api)) World.prototype[name] = api[name];

const world = new World();
// Constantes públicas que los tests/servidor leían desde el módulo, ahora
// propiedades de la instancia (misma API).
Object.assign(world, {
	World,
	Chunk,
	SEA_LEVEL: biomes.SEA_LEVEL,
	WORLD_SEA_LEVEL: biomes.WORLD_SEA_LEVEL,
	DESIGN_OFFSET: biomes.DESIGN_OFFSET,
	WORLD_MIN_Y,
	WORLD_MAX_Y,
	LAKE_FLOOR: biomes.LAKE_FLOOR,
	SNOW_TEMP: biomes.SNOW_TEMP,
	MOUNTAIN_THRESHOLD: biomes.MOUNTAIN_THRESHOLD,
	MOUNTAIN_SNOW_LINE: biomes.MOUNTAIN_SNOW_LINE,
	MS_TUNNEL_H: structures.MS_TUNNEL_H
});
// El generador/estructuras (generation.js/structures.js) no pueden requerir
// este módulo (ciclo): reciben los helpers del núcleo por inyección. El
// getter de diskLoader es vivo (setDiskLoader lo re-asigna en runtime).
generation.setCore({
	idx,
	toLocal,
	outOfBounds,
	inBounds,
	markChunkDirty,
	get diskLoader() {
		return diskLoader;
	},
	loadChunkFromDisk,
	addChunkGenMs: (ms) => {
		chunkGenMsAccum += ms;
	}
});
structures.setCore({ idx, toLocal });
module.exports = world;
