// ============================================================
// LIGHTCLIENT (Fase 18, D-7): luz de antorcha del cliente.
// Extraído de world.js: aquí vive lightStore (luz horneada por chunk) y las
// funciones que la producen/consultam (bakeChunkLight, hasTorchNear). world.js
// (ciclo de vida de mallas) importa de aquí.
// ============================================================

import { getChunkData, getClientBlock, getTorches } from "./chunkstore.js";
import { CHUNK_SIZE, WORLD_HEIGHT, WORLD_MIN_Y } from "./constants.js";
import { computeChunkLight, LIGHT_RADIUS } from "./lighting.js";

// lightStore: luz horneada por chunk ("cx,cz" -> Float32Array o null si no
// hay antorchas relevantes cerca). Se hornea al construir la geometría y se
// re-hornea al colocar/romper una antorcha (rebuildAround de 3x3 chunks).
const lightStore = new Map();

// Hornea la luz de antorcha de un chunk (lo llama buildChunkGeometry). Solo
// aloja el array si hay antorchas relevantes en la caja de radio alrededor:
// sin antorchas el chunk queda con null y chunkLightAt devuelve 0 (sin coste
// de memoria para el mundo normal).
export function bakeChunkLight(cx, cz) {
	const key = `${cx},${cz}`;
	const chunk = getChunkData(key);
	if (!chunk) return;
	const x0 = cx * CHUNK_SIZE,
		z0 = cz * CHUNK_SIZE;
	const relevant = [];
	for (const t of getTorches().values()) {
		if (
			t[0] >= x0 - LIGHT_RADIUS &&
			t[0] <= x0 + CHUNK_SIZE - 1 + LIGHT_RADIUS &&
			t[2] >= z0 - LIGHT_RADIUS &&
			t[2] <= z0 + CHUNK_SIZE - 1 + LIGHT_RADIUS
		) {
			relevant.push(t);
		}
	}
	if (relevant.length === 0) {
		lightStore.set(key, null);
		return;
	}
	lightStore.set(
		key,
		computeChunkLight(
			cx,
			cz,
			CHUNK_SIZE,
			WORLD_HEIGHT,
			WORLD_MIN_Y,
			getClientBlock,
			relevant
		)
	);
}

// Luz horneada de un chunk (null si no hay antorchas cerca). La consume el
// build de geometría 3x3 (collectChunkData en world.js).
export function getChunkLight(key) {
	return lightStore.get(key) || null;
}

// Fase 14 (M4): ¿hay una antorcha conocida dentro del radio de luz (caja
// horizontal 2*LIGHT_RADIUS+1 centrada en el bloque) que pueda verse
// afectada por este cambio de bloque NO-antorcha? Solo la luz que puede
// cruzar un borde de chunk (o un borde entre bloques) necesita un re-horneado
// de vecinos; sin antorchas cerca, rebuildAffectedChunks basta. La BFS de
// lighting.js se difracta arriba/abajo, así que se usa la distancia 3D.
export function hasTorchNear(wx, wy, wz) {
	const r = LIGHT_RADIUS;
	const x0 = wx - r,
		x1 = wx + r,
		z0 = wz - r,
		z1 = wz + r,
		y0 = wy - r,
		y1 = wy + r;
	for (const t of getTorches().values()) {
		if (
			t[0] >= x0 &&
			t[0] <= x1 &&
			t[1] >= y0 &&
			t[1] <= y1 &&
			t[2] >= z0 &&
			t[2] <= z1
		)
			return true;
	}
	return false;
}

// Limpia la luz horneada de un chunk (chunks_unload).
export function clearChunkLight(key) {
	lightStore.delete(key);
}
