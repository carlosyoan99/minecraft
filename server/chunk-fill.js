"use strict";
// ============================================================
// RELLENO PROGRESIVO DE CHUNKS (Fase 18, D-1 — extraído de server/net.js)
// El init ya no envía los ~169 chunks del radio de render de golpe: genera
// un lote por tick y jugador y los envía como chunks_add, sin bloquear el
// bucle. `fillForPlayers` recorre los jugadores conectados y rellena su
// radio de render por anillos (Chebyshev), los más cercanos primero.
//
// Dependencias inyectadas (evita ciclos de require): state, world,
// CHUNK_SIZE (constants) y el tamaño de lote CHUNK_FILL_PER_TICK.
// ============================================================

// Genera y envía un lote de chunks por cada jugador en juego. Idempotente:
// ensureChunksAround/moves ya cachearon los chunks (no se regeneran) y aquí
// solo se procesan los del radio NO generados aún.
function fillForPlayers(state, world, CHUNK_SIZE, perTick) {
	for (const p of state.players.values()) {
		if (p.inMenu) continue; // Fase 17 (A1): el menú no genera chunks
		if (p.ws.readyState !== WebSocket.OPEN) continue;
		const pcx = Math.floor(p.x / CHUNK_SIZE),
			pcz = Math.floor(p.z / CHUNK_SIZE);
		// Lista de claves del radio de render que faltan por generar
		// (Chebyshev, misma malla que sendInit y que el filtro del cliente).
		// Ordenadas por distancia Chebyshev (anillos): los chunks más cercanos
		// se rellenan PRIMERO y el terreno se "va ladrando" desde el jugador
		// hacia fuera, en vez de aparecer un cuadrado de bloques arbitrario.
		const missing = [];
		for (let dx = -p.renderDistance; dx <= p.renderDistance; dx++) {
			for (let dz = -p.renderDistance; dz <= p.renderDistance; dz++) {
				const cx = pcx + dx,
					cz = pcz + dz;
				const key = `${cx},${cz}`;
				// F16-07 (auditoría 2026-08-11): fuera de los bordes generateChunk
				// devuelve vacío SIN cachear → si estas claves entraran en `missing`
				// nunca saldrían de ahí (el guard de abajo evita el crash pero el
				// escaneo+sort O(r²) por tick seguiría sin converger en el borde).
				if (world.outOfBounds(cx, cz)) continue;
				if (!state.chunks.has(key))
					missing.push({ key, ring: Math.max(Math.abs(dx), Math.abs(dz)) });
			}
		}
		missing.sort((a, b) => a.ring - b.ring);
		if (missing.length === 0) continue;
		const batch = missing.slice(0, perTick);
		const DATA = {};
		for (const { key } of batch) {
			const [cx, cz] = key.split(",").map(Number);
			world.generateChunk(cx, cz); // idempotente (cachea en state.chunks)
			// Fase 16 (C2): fuera de los bordes generateChunk devuelve vacío SIN
			// cachear → state.chunks.get(key) sería undefined y Array.from
			// tiraba `undefined is not iterable`, matando el proceso (el crash
			// de "al crear una semilla nueva el servidor se detiene"). Mismo
			// guard que ensureChunksAround: solo enviar lo que quedó cacheado.
			if (state.chunks.has(key)) DATA[key] = Array.from(state.chunks.get(key));
		}
		if (Object.keys(DATA).length)
			p.ws.send(
				JSON.stringify({ event: "chunks_add", data: { chunkData: DATA } })
			);
	}
}

module.exports = { fillForPlayers };
