"use strict";

// ============================================================
// GUARDADO ASÍNCRONO (C1, REN-1/SV-4 — extraído en Fase 18, D-4)
// El autosave periódico no debe congelar el event loop: con cientos de
// chunks sucios, escribir todo síncronamente de golpe bloquea el servidor
// (causa más probable de los timeouts E2E). La cola procesa los chunks por
// lotes con setImmediate, cediendo el paso al bucle principal entre lotes.
// El formato de disco, la atomicidad (tmp+rename) y el .bak no cambian.
// saveWorld() (síncrono, en save.js) se conserva para los puntos que
// necesitan el resultado inmediato (switchWorld y SIGINT); el setInterval
// usa esta cola.
// ============================================================
const fs = require("node:fs");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const path = require("node:path");
const constants = require("./constants.js");
const state = require("./state.js");
const world = require("./world.js");
const { buildMeta } = require("./save-meta.js");

const { chunks, dirtyChunks } = state;
// Atajos a las rutas del mundo ACTIVO (holder mutable de constants.js).
const P = constants.worldPaths;

const SAVE_BATCH_SIZE = 6; // chunks por lote (~6-15 ms de escritura por iteración)
let asyncSaving = false;

// Programa el guardado asíncrono de los chunks sucios. Idempotente: si ya
// hay una cola en curso, esta llamada no hace nada (esa cola drena el resto).
function saveWorldAsync() {
	// Fase 17 (A1): en modo menú no hay mundo — sin chunks sucios ni meta,
	// nada que guardar (y no se crea un directorio "default" fantasma).
	if (!P.currentSeed) return;
	if (asyncSaving) return;
	if (!dirtyChunks.size && fs.existsSync(P.metaFile)) return; // nada que guardar
	asyncSaving = true;
	let written = 0;
	const processBatch = () => {
		let n = 0;
		for (const key of dirtyChunks) {
			const arr = chunks.get(key);
			if (!arr) {
				dirtyChunks.delete(key);
				continue;
			}
			try {
				world.writeChunkFile(key, arr);
				dirtyChunks.delete(key); // se borra AL escribir (no al final: un
				written++; // chunk ensuciado durante el guardado no se pierde)
			} catch (e) {
				log.error(`Error escribiendo chunk ${key}:`, e.message);
				dirtyChunks.delete(key); // no reintentar en bucle infinito
			}
			if (++n >= SAVE_BATCH_SIZE) break;
		}
		if (dirtyChunks.size) {
			setImmediate(processBatch); // ceder el turno: el juego sigue
			return;
		}
		asyncSaving = false;
		// world.json (pequeño): backup del anterior + escritura atómica al final.
		if (fs.existsSync(P.metaFile)) {
			try {
				fs.copyFileSync(P.metaFile, `${P.metaFile}.bak`);
			} catch (e) {
				log.warn(`⚠️  No se pudo crear el backup de world.json: ${e.message}`);
			}
		}
		try {
			world.atomicWrite(P.metaFile, JSON.stringify(buildMeta(), null, 2));
		} catch (e) {
			log.error("Error escribiendo world.json:", e.message);
		}
		log.info(
			`💾 Mundo guardado (${written} chunks escritos, ${chunks.size} en memoria, ${state.mobs.length} mobs)`
		);
	};
	// Directorios una sola vez (baratos) antes del primer lote.
	try {
		if (!fs.existsSync(P.worldDir))
			fs.mkdirSync(P.worldDir, { recursive: true });
		if (!fs.existsSync(P.chunksDir))
			fs.mkdirSync(P.chunksDir, { recursive: true });
	} catch (e) {
		asyncSaving = false;
		log.error("Error creando directorios de guardado:", e.message);
		return;
	}
	setImmediate(processBatch);
}

module.exports = {
	saveWorldAsync,
	SAVE_BATCH_SIZE
};
