// ============================================================
// CHUNKSTORE (Fase 18, D-7): almacén de datos de chunks del cliente.
// Extraído de world.js: aquí vive el Mapa de chunkStore (Uint8Array por
// chunk), el acceso por bloque (getClientBlock/setClientBlock), el swap de
// datos en chunks_add/chunks_unload y el registro de antorchas (torchSet)
// con su limpieza. world.js (ciclo de vida de mallas) importa de aquí.
// ============================================================
import {
	CHUNK_SIZE,
	TORCH,
	LANTERN,
	WORLD_HEIGHT,
	WORLD_MAX_Y,
	WORLD_MIN_Y
} from "./constants.js";

const chunkStore = new Map(); // "cx,cz" -> Uint8Array

// torchSet: posiciones de fuentes de luz puntual conocidas (antorchas y,
// Fase 21.5 B2, linternas: "wx,wy,wz" -> [wx,wy,wz]).
// Lo alimenta setClientBlock y el swap de chunks_add; lo consumen la luz
// horneada (lightclient.js) y la limpieza de chunks_unload.
const torchSet = new Map();

// Fase 20 B4 (P7, REN-7): índice ESPACIAL por chunk de antorchas
// ("cx,cz" -> Set de "wx,wy,wz"). bakeChunkLight y hasTorchNear escaneaban
// el torchSet COMPLETO (O(todas las antorchas) por consulta — con 2000+
// antorchas y cambios de bloque frecuentes era el cuello de botella). Como
// LIGHT_RADIUS (7) < CHUNK_SIZE (16), una antorcha solo afecta a su propio
// chunk y a los 8 vecinos: consultar el vecindario 3×3 acota la búsqueda a
// decenas de antorchas, no a miles. torchSet se mantiene (lo usa la limpieza
// de chunks_unload) y el índice se alimenta en paralelo.
const torchesByChunk = new Map(); // "cx,cz" -> Set("wx,wy,wz")
function addTorch(wx, wy, wz) {
	const ck = `${Math.floor(wx / CHUNK_SIZE)},${Math.floor(wz / CHUNK_SIZE)}`;
	let s = torchesByChunk.get(ck);
	if (!s) {
		s = new Set();
		torchesByChunk.set(ck, s);
	}
	s.add(`${wx},${wy},${wz}`);
}
function removeTorch(wx, wy, wz) {
	const ck = `${Math.floor(wx / CHUNK_SIZE)},${Math.floor(wz / CHUNK_SIZE)}`;
	const s = torchesByChunk.get(ck);
	if (s) {
		s.delete(`${wx},${wy},${wz}`);
		if (!s.size) torchesByChunk.delete(ck);
	}
}
// Antorchas del vecindario 3×3 de chunks de un bloque: cubre SIEMPRE el
// radio de luz (LIGHT_RADIUS 7 < 16). O(torchSet del vecindario), no O(todas).
export function getTorchesNear(wx, _wy, wz) {
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const out = [];
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			const s = torchesByChunk.get(`${cx + dx},${cz + dz}`);
			if (!s) continue;
			for (const k of s) {
				const [tx, ty, tz] = k.split(",").map(Number);
				out.push([tx, ty, tz]);
			}
		}
	}
	return out;
}

export function cIdx(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

// ¿Hay datos para el chunk? (lo usan los rebuild de vecinos y el LOD).
export function hasChunkData(key) {
	return chunkStore.has(key);
}

// Claves de todos los chunks con datos (para descargas y recuentos).
export function chunkKeys() {
	return chunkStore.keys();
}

// Fase 15 (D5): el mundo va de WORLD_MIN_Y (−64) a WORLD_MAX_Y (+63).
export function getClientBlock(wx, wy, wz) {
	if (wy < WORLD_MIN_Y || wy > WORLD_MAX_Y) return 0;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const chunk = chunkStore.get(`${cx},${cz}`);
	if (!chunk) return -1; // -1 = desconocido (chunk no cargado): no dibujar cara para evitar huecos falsos
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	return chunk[cIdx(x, wy - WORLD_MIN_Y, z)]; // mundo → local
}

// Cambia un bloque del store cliente y mantiene el registro de antorchas
// (lo usa la iluminación). Devuelve el bloque anterior para que la red decida
// si reconstruir el vecindario.
export function setClientBlock(wx, wy, wz, block) {
	// Auditoría 2026-08-15 (CL-4): las coordenadas vienen de la red. Un
	// NaN/∞ corrompía el índice (Math.floor(NaN)=NaN) y aterraba basura en
	// el chunk (o en otro, al desbordar) sin forma de detectarlo.
	if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(wz))
		return -1;
	if (wy < WORLD_MIN_Y || wy > WORLD_MAX_Y) return -1;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const key = `${cx},${cz}`;
	let chunk = chunkStore.get(key);
	if (!chunk) {
		chunk = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
		chunkStore.set(key, chunk);
	}
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const wyL = wy - WORLD_MIN_Y; // mundo → local
	const prev = chunk[cIdx(x, wyL, z)];
	chunk[cIdx(x, wyL, z)] = block;
	const torchKey = `${wx},${wy},${wz}`;
	if (prev === TORCH || prev === LANTERN) {
		torchSet.delete(torchKey);
		removeTorch(wx, wy, wz); // Fase 20 B4 (P7): índice espacial
	}
	if (block === TORCH || block === LANTERN) {
		torchSet.set(torchKey, [wx, wy, wz]);
		addTorch(wx, wy, wz);
	}
	return prev;
}

// Guarda los datos de un chunk (chunks_add): copia el Uint8Array y registra
// las antorchas que trae (puede venir con un mundo guardado). Devuelve el
// array guardado (el mismo objeto del store).
export function storeChunkData(key, arr) {
	// Auditoría 2026-08-15 (CL-5): un chunk_add malformado (longitud != 16384)
	// corrompía el store y, al escanear antorchas, leía fuera del buffer
	// (undefined). Se descarta y devuelve null; el llamador debe ignorarlo.
	if (
		!arr ||
		typeof arr.length !== "number" ||
		arr.length !== CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE
	)
		return null;
	const data = Uint8Array.from(arr);
	chunkStore.set(key, data);
	const [cx, cz] = key.split(",").map(Number); // Registrar las antorchas/linternas del chunk (puede venir con un mundo guardado).
	for (let i = 0; i < data.length; i++) {
		if (data[i] === TORCH || data[i] === LANTERN) {
			const lx = i % CHUNK_SIZE;
			const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
			const ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
			// Fase 15 (D5): el índice local es Y de mundo − WORLD_MIN_Y.
			const wy = ly + WORLD_MIN_Y;
			const wx = cx * CHUNK_SIZE + lx,
				wz = cz * CHUNK_SIZE + lz;
			torchSet.set(`${wx},${wy},${wz}`, [wx, wy, wz]);
			addTorch(wx, wy, wz); // Fase 20 B4 (P7): índice espacial
		}
	}
	return data;
}

// Datos crudos de un chunk (lo usa el build de geometría 3x3 y el LOD).
export function getChunkData(key) {
	return chunkStore.get(key);
}

// Borra los datos de un chunk (chunks_unload): quita sus antorchas y el
// Uint8Array. La luz horneada (lightStore) y las mallas las limpia world.js.
export function removeChunkData(key) {
	const [cx, cz] = key.split(",").map(Number);
	const x0 = cx * CHUNK_SIZE,
		z0 = cz * CHUNK_SIZE;
	for (const [tKey, t] of torchSet) {
		if (
			t[0] >= x0 &&
			t[0] < x0 + CHUNK_SIZE &&
			t[2] >= z0 &&
			t[2] < z0 + CHUNK_SIZE
		)
			torchSet.delete(tKey);
	}
	// Fase 20 B4 (P7): el índice espacial se limpia por chunk directamente.
	torchesByChunk.delete(`${cx},${cz}`);
	chunkStore.delete(key);
}

// Todas las antorchas conocidas (lo recorre la luz horneada).
export function getTorches() {
	return torchSet;
}
