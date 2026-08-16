"use strict";

// ============================================================
// PERSISTENCIA — ORQUESTADOR (Fase 18, D-4)
// save.js decide QUÉ se guarda y CUÁNDO; el formato y las operaciones
// concretas viven en módulos hermanos:
//   · save-chunks.js  — cola asíncrona del autosave (setImmediate por lotes)
//   · save-meta.js    — world.json, gestión de mundos y migraciones
//   · save-players.js — persistencia de jugadores por nombre (F17 B1)
// Aquí quedan el guardado síncrono (saveWorld), la carga (loadWorld), el
// cambio de mundo (switchWorld), la liberación del modo menú (releaseWorld)
// y la descarga de chunks lejanos (unloadFarChunks), más la fachada pública.
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const constants = require("./constants.js");
const { SCHEMA_VERSION, UNLOAD_DISTANCE_CHUNKS, CHUNK_SIZE } = constants;
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const state = require("./state.js");
const world = require("./world.js");
const { restoreMobs } = require("./mobs.js");
const { restoreFurnaces } = require("./crafting.js");
const { restoreChests } = require("./chests.js");
const {
	sanitizeWorldName,
	buildMeta,
	dawnOffsetMs,
	migrateWorldLayout,
	migrateLegacyWorld,
	listWorlds,
	deleteWorld,
	cloneWorld,
	renameWorld,
	setWorldMode
} = require("./save-meta.js");
const { saveWorldAsync } = require("./save-chunks.js");
const {
	playerSnapshot,
	savePlayer,
	restorePlayer
} = require("./save-players.js");

const { chunks, players, furnaces, chests, dirtyChunks } = state;
// Atajos a las rutas del mundo ACTIVO (holder mutable de constants.js: la
// semilla puede cambiar en runtime con switchWorld, y los tests redirigen el
// I/O a un directorio temporal mutando constants.worldPaths).
const P = constants.worldPaths;

// ============================================================
// LIBERAR EL MUNDO ACTIVO (Fase 17, A1/C1)
// En modo menú, al quedarse el servidor sin jugadores se vuelve al estado
// de menú: persiste el mundo, limpia el estado en memoria y deja la semilla
// activa a null (el próximo jugador elige/crea mundo de nuevo).
// ============================================================
function releaseWorld() {
	if (!P.currentSeed) return;
	saveWorld(); // persistir antes de soltar
	state.chunks.clear();
	state.dirtyChunks.clear();
	state.mobs = [];
	state.furnaces.clear();
	state.chests.clear();
	state.crops.clear();
	state.arrows = [];
	state.doors.clear();
	constants.setWorldSeed(null, null);
	world.reinitNoise("menu");
	log.info("🗂️ Modo menú: mundo liberado (sin jugadores).");
}

// Devuelve true si la persistencia terminó correctamente; false si hubo un
// error (que queda loggeado). switchWorld la usa para abortar el cambio de
// semilla si no se pudo guardar el mundo actual (integridad: nada se pierde).
function saveWorld() {
	// Fase 17 (A1): en modo menú no hay mundo activo — nada que persistir
	// (switchWorld lo llama antes de cargar el mundo elegido).
	if (!P.currentSeed) return true;
	try {
		if (!fs.existsSync(P.worldDir))
			fs.mkdirSync(P.worldDir, { recursive: true });
		if (!fs.existsSync(P.chunksDir))
			fs.mkdirSync(P.chunksDir, { recursive: true });

		// Incremental: solo se reescriben los chunks que cambiaron desde el
		// último guardado, nunca el mundo entero.
		let written = 0;
		for (const key of dirtyChunks) {
			const arr = chunks.get(key);
			if (!arr) continue;
			world.writeChunkFile(key, arr);
			written++;
		}
		dirtyChunks.clear();

		// Copia de seguridad del último world.json válido (Fase 10, skill
		// save-systems): si el principal se corrompe (corte de luz, disco
		// defectuoso), loadWorld puede restaurar el .bak en vez de perder el
		// mundo. Se copia el archivo ANTERIOR (antes de sobrescribir), así el
		// .bak siempre es el último guardado completo.
		if (fs.existsSync(P.metaFile)) {
			try {
				fs.copyFileSync(P.metaFile, `${P.metaFile}.bak`);
			} catch (e) {
				log.warn(`⚠️  No se pudo crear el backup de world.json: ${e.message}`);
			}
		}
		world.atomicWrite(P.metaFile, JSON.stringify(buildMeta(), null, 2));
		log.info(
			`💾 Mundo guardado (${written} chunks escritos, ${chunks.size} en memoria, ${state.mobs.length} mobs)`
		);
		return true;
	} catch (e) {
		log.error("Error guardando mundo:", e.message);
		return false;
	}
}

// Devuelve:
//   true       — mundo cargado correctamente
//   false      — no hay mundo guardado: se generará uno nuevo
//   'rechazo'  — hay mundo guardado pero no se puede abrir de forma segura
//                (schemaVersion más nuevo, world.json ilegible, ...): no cargar ni tocar
// Offset de reloj para que el mundo arranque al amanecer (fase 0): el mismo
// cálculo que /time set day y dormir en la cama. Así un mundo nuevo nunca
// empieza a una hora arbitraria del día (bug reportado por el usuario).
function loadWorld() {
	try {
		if (!fs.existsSync(P.chunksDir)) {
			// Mundo nuevo: arrancar al amanecer.
			state.timeOffset = dawnOffsetMs();
			return false;
		}

		chunks.clear();
		for (const file of fs.readdirSync(P.chunksDir)) {
			if (!file.endsWith(".json")) continue;
			const parsed = world.readChunkFile(path.join(P.chunksDir, file), file);
			if (!parsed) continue;
			chunks.set(`${parsed.cx},${parsed.cz}`, Uint8Array.from(parsed.data));
		}

		if (fs.existsSync(P.metaFile)) {
			// Leer el meta de forma defensiva: si el principal está corrupto,
			// restaurar desde el .bak (el último guardado completo). Solo si el
			// backup tampoco es legible se propaga el error (el catch exterior
			// devuelve 'rechazo' y no toca nada).
			let meta;
			try {
				meta = JSON.parse(fs.readFileSync(P.metaFile, "utf8"));
			} catch (e) {
				const bak = `${P.metaFile}.bak`;
				if (fs.existsSync(bak)) {
					log.warn("⚠️  world.json ilegible; restaurando el backup (.bak)");
					meta = JSON.parse(fs.readFileSync(bak, "utf8"));
				} else {
					throw e;
				}
			}
			if (
				typeof meta.schemaVersion === "number" &&
				meta.schemaVersion > SCHEMA_VERSION
			) {
				// Mundo más nuevo de lo que este servidor sabe leer: negarse a
				// cargarlo evita que un guardado posterior lo corrompa.
				log.error(
					`❌ El mundo guardado usa schemaVersion ${meta.schemaVersion}, pero este servidor soporta hasta v${SCHEMA_VERSION}.`
				);
				log.error(
					"   No se cargará. Actualiza el servidor o restaura un backup compatible."
				);
				return "rechazo";
			}
			if (meta.seed && meta.seed !== P.currentSeed) {
				log.warn(
					`⚠️  La semilla del mundo guardado (${meta.seed}) difiere de la configurada (${P.currentSeed}): los chunks nuevos no encajarán con los guardados.`
				);
			}
			// Fase 7: restaurar el nombre mostrado del mundo (lectura defensiva: los
			// world.json antiguos no lo traen y usan la semilla como nombre, y un
			// world.json manipulado se sanea igual que el del menú).
			P.worldName = sanitizeWorldName(meta.name) || P.currentSeed;
			// Fase 9 (Bloque B): restaurar el modo de juego del mundo (los mundos
			// v3 sin el campo abren como survival — decisión del usuario).
			P.worldGamemode = constants.sanitizeGamemode(meta.gamemode);
			// Fase 10 (B1): tamaño del mundo (los mundos viejos sin el campo abren
			// con 8192 — el tamaño "infinito" previo, retrocompatible).
			P.worldSize = constants.sanitizeWorldSize(meta.worldSize);
			state.mobs = restoreMobs(meta.mobs);
			restoreFurnaces(meta.furnaces);
			restoreChests(meta.chests);
			// Fase 9 (Bloque C): cultivos (los mundos v3 sin el campo → sin cultivos).
			state.crops.clear();
			for (const [k, v] of meta.crops || []) state.crops.set(k, v);
			// Fase 10 (nota del usuario): restaurar la hora del mundo (los mundos
			// viejos sin el campo siguen con el reloj real, retrocompatible).
			state.timeOffset =
				Number.isFinite(meta.timeOffset) && meta.timeOffset >= 0
					? meta.timeOffset
					: 0;
		} else {
			log.warn(
				"⚠️  world.json no encontrado: mobs, hornos y cofres se reinician (chunks intactos)"
			);
			// Hora desconocida (sin metadatos): amanecer, como en un mundo nuevo.
			state.timeOffset = dawnOffsetMs();
		}
		log.info(
			`✅ Mundo cargado (${chunks.size} chunks, ${state.mobs.length} mobs)`
		);
		return true;
	} catch (e) {
		log.error("Error cargando mundo:", e.message);
		// Si existe el directorio de chunks, hay un mundo real: negarse a
		// regenerar encima en lugar de arriesgar pérdida de datos.
		return fs.existsSync(P.chunksDir) ? "rechazo" : false;
	}
}

// Cambio de mundo en runtime (Fase 6: campo de semilla del menú del cliente).
// Devuelve:
//   true     — mundo cambiado a la nueva semilla (cargado de disco o fresco)
//   'same'   — misma semilla (mismo directorio): normaliza la semilla activa
//              y, si llega un nombre nuevo, renombra el mundo (persistido)
//   'rechazo'— el mundo de esa semilla existe pero no se puede abrir (formato
//              más nuevo): se revierte y no se toca nada (integridad)
//   'error'  — no se pudo persistir el mundo actual antes de cambiar: no se
//              toca nada (nada se pierde)
// Secuencia segura: persiste el mundo actual → limpia el estado en memoria →
// cambia rutas y re-seeda el ruido → carga (o deja listo para generar) el
// mundo de la nueva semilla. El jugador que la pidió genera/recibe los chunks
// del spawn en net.js (set_seed → ensureChunksAround + init).
// Fase 9 (Bloque B): `newGamemode` (opcional) fija el modo del mundo NUEVO
// (world.json lo persiste en el primer guardado); un mundo EXISTENTE conserva
// el suyo (loadWorld restaura el de su world.json).
function switchWorld(newSeed, newName, newGamemode, newSize) {
	const prevSeed = P.currentSeed;
	if (constants.seedDir(newSeed) === constants.seedDir(prevSeed)) {
		// Misma semilla: solo normalizar la semilla activa (si difiere en formato)
		// sin tocar el mundo; el cliente recibe un init de confirmación igualmente.
		if (newSeed !== prevSeed) constants.setWorldSeed(newSeed);
		// Fase 7: con un nombre nuevo se RENOMBRA el mundo activo (el campo `name`
		// del menú sirve también para esto) y se persiste en world.json. Si el
		// guardado fallara, el nombre queda en memoria y el autosave lo reintenta.
		const name = sanitizeWorldName(newName);
		if (name && name !== P.worldName) {
			P.worldName = name;
			saveWorld();
		}
		return "same";
	}

	// Persistir el mundo actual ANTES de soltarlo. Si la persistencia falla,
	// abortar el cambio: limpiar el estado en memoria perdería el mundo (la
	// integridad de datos está por encima de poder cambiar de semilla).
	if (!saveWorld()) {
		log.error(
			"❌ No se pudo cambiar la semilla: falló el guardado del mundo actual."
		);
		return "error";
	}
	state.chunks.clear();
	state.dirtyChunks.clear();
	state.mobs = [];
	state.furnaces.clear();
	state.chests.clear();
	state.crops.clear(); // Fase 9 (Bloque C): los cultivos no viajan entre mundos

	constants.setWorldSeed(
		newSeed,
		sanitizeWorldName(newName) || newSeed,
		newGamemode
	);
	// Fase 10 (B1): tamaño pedido para el mundo NUEVO (si el mundo ya existe en
	// disco, loadWorld restaura su tamaño guardado y este valor se descarta).
	P.worldSize = constants.sanitizeWorldSize(newSize);
	world.reinitNoise(newSeed);

	const r = loadWorld();
	if (r === "rechazo") {
		log.error(
			`❌ No se puede abrir el mundo de la semilla "${newSeed}" (formato más nuevo o ilegible); se mantiene la semilla actual.`
		);
		constants.setWorldSeed(prevSeed);
		world.reinitNoise(prevSeed);
		loadWorld(); // restaura también el nombre del mundo anterior
		return "rechazo";
	}
	log.info(
		`🌱 Semilla activa: ${prevSeed} → ${newSeed} (${state.chunks.size} chunks, ${state.mobs.length} mobs)`
	);
	return true;
}

// Hook para que la entrada (net) conecte el broadcast de chunks_unload;
// evita un ciclo de require entre save y net.
let unloadHandler = null;
function setUnloadHandler(fn) {
	unloadHandler = fn;
}

// Descarga chunks sin jugadores cerca: los persiste primero (por si fueron
// modificados o generados con Math.random) y avisa al cliente para que libere
// la geometría. Mantiene acotada la memoria del servidor en sesiones largas.
function unloadFarChunks() {
	if (players.size === 0) return;
	const toUnload = [];
	for (const key of chunks.keys()) {
		const [cx, cz] = key.split(",").map(Number);
		let nearPlayer = false;
		for (const p of players.values()) {
			const pcx = Math.floor(p.x / CHUNK_SIZE),
				pcz = Math.floor(p.z / CHUNK_SIZE);
			if (
				Math.abs(cx - pcx) <= UNLOAD_DISTANCE_CHUNKS &&
				Math.abs(cz - pcz) <= UNLOAD_DISTANCE_CHUNKS
			) {
				nearPlayer = true;
				break;
			}
		}
		if (!nearPlayer) toUnload.push(key);
	}
	if (toUnload.length === 0) return;

	for (const key of toUnload) {
		try {
			if (dirtyChunks.has(key)) {
				const arr = chunks.get(key);
				if (arr) {
					world.writeChunkFile(key, arr);
					dirtyChunks.delete(key);
				}
			}
		} catch (e) {
			// Integridad: si no se pudo persistir, no soltar el chunk de memoria
			log.error(
				`⚠️  No se pudo persistir ${key} al descargar; se mantiene en memoria:`,
				e.message
			);
			continue;
		}
		chunks.delete(key);
	}

	if (unloadHandler) unloadHandler(toUnload);
	log.info(
		`🗑️ Descargados ${toUnload.length} chunks lejanos (${chunks.size} en memoria)`
	);
}

module.exports = {
	// Orquestación (este archivo)
	saveWorld,
	loadWorld,
	switchWorld,
	releaseWorld,
	unloadFarChunks,
	setUnloadHandler,
	// Fase 18 (D-4): fachada de los módulos hermanos (API pública sin cambios)
	saveWorldAsync, // save-chunks: autosave por lotes fuera del event loop
	buildMeta, // save-meta: los tests verifican los campos de mascota/slime
	migrateWorldLayout,
	migrateLegacyWorld,
	listWorlds,
	deleteWorld,
	cloneWorld,
	renameWorld,
	setWorldMode,
	playerSnapshot, // save-players (F17 B1)
	savePlayer,
	restorePlayer
};
