"use strict";

// ============================================================
// PERSISTENCIA (guardado incremental por chunk) Y DESCARGA DE CHUNKS
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const constants = require("./constants.js");
const { SCHEMA_VERSION, UNLOAD_DISTANCE_CHUNKS, CHUNK_SIZE } = constants;
const state = require("./state.js");
const world = require("./world.js");
const { restoreMobs } = require("./mobs.js");
const { restoreFurnaces } = require("./crafting.js");
const { restoreChests } = require("./chests.js");

const { chunks, players, furnaces, chests, dirtyChunks } = state;
// Atajos a las rutas del mundo ACTIVO (holder mutable de constants.js: la
// semilla puede cambiar en runtime con switchWorld, y los tests redirigen el
// I/O a un directorio temporal mutando constants.worldPaths).
const P = constants.worldPaths;

// Estado global (mobs, hornos, metadatos): pequeño, cabe en un solo archivo.
function buildMeta() {
	return {
		schemaVersion: SCHEMA_VERSION,
		seed: P.currentSeed,
		name: P.currentSeed, // Fase 7: nombre mostrado en el menú de mundos (por defecto, la semilla)
		lastSaved: new Date().toISOString(),
		mobs: state.mobs
			.filter((m) => m.alive)
			.map((m) => ({
				id: m.id,
				type: m.type,
				x: m.x,
				y: m.y,
				z: m.z,
				health: m.health,
				isBaby: m.isBaby,
				age: m.age
			})),
		furnaces: Array.from(furnaces.entries()),
		chests: Array.from(chests.entries())
	};
}

// Devuelve true si la persistencia terminó correctamente; false si hubo un
// error (que queda loggeado). switchWorld la usa para abortar el cambio de
// semilla si no se pudo guardar el mundo actual (integridad: nada se pierde).
function saveWorld() {
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

		world.atomicWrite(P.metaFile, JSON.stringify(buildMeta(), null, 2));
		// biome-ignore lint/suspicious/noConsole: log periódico del guardado automático
		console.log(
			`💾 Mundo guardado (${written} chunks escritos, ${chunks.size} en memoria, ${state.mobs.length} mobs)`
		);
		return true;
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: error real de persistencia (no silenciar, convención del proyecto)
		console.error("Error guardando mundo:", e.message);
		return false;
	}
}

// Devuelve:
//   true       — mundo cargado correctamente
//   false      — no hay mundo guardado: se generará uno nuevo
//   'rechazo'  — hay mundo guardado pero no se puede abrir de forma segura
//                (schemaVersion más nuevo, world.json ilegible, ...): no cargar ni tocar
function loadWorld() {
	try {
		if (!fs.existsSync(P.chunksDir)) return false;

		chunks.clear();
		for (const file of fs.readdirSync(P.chunksDir)) {
			if (!file.endsWith(".json")) continue;
			const parsed = world.readChunkFile(path.join(P.chunksDir, file), file);
			if (!parsed) continue;
			chunks.set(`${parsed.cx},${parsed.cz}`, Uint8Array.from(parsed.data));
		}

		if (fs.existsSync(P.metaFile)) {
			const meta = JSON.parse(fs.readFileSync(P.metaFile, "utf8"));
			if (
				typeof meta.schemaVersion === "number" &&
				meta.schemaVersion > SCHEMA_VERSION
			) {
				// Mundo más nuevo de lo que este servidor sabe leer: negarse a
				// cargarlo evita que un guardado posterior lo corrompa.
				// biome-ignore lint/suspicious/noConsole: error de formato del mundo (no silenciar)
				console.error(
					`❌ El mundo guardado usa schemaVersion ${meta.schemaVersion}, pero este servidor soporta hasta v${SCHEMA_VERSION}.`
				);
				// biome-ignore lint/suspicious/noConsole: error de formato del mundo (no silenciar)
				console.error(
					"   No se cargará. Actualiza el servidor o restaura un backup compatible."
				);
				return "rechazo";
			}
			if (meta.seed && meta.seed !== P.currentSeed) {
				// biome-ignore lint/suspicious/noConsole: aviso de semilla discrepante
				console.warn(
					`⚠️  La semilla del mundo guardado (${meta.seed}) difiere de la configurada (${P.currentSeed}): los chunks nuevos no encajarán con los guardados.`
				);
			}
			state.mobs = restoreMobs(meta.mobs);
			restoreFurnaces(meta.furnaces);
			restoreChests(meta.chests);
		} else {
			// biome-ignore lint/suspicious/noConsole: aviso de mundo sin metadatos
			console.warn(
				"⚠️  world.json no encontrado: mobs, hornos y cofres se reinician (chunks intactos)"
			);
		}
		// biome-ignore lint/suspicious/noConsole: log de carga del servidor
		console.log(
			`✅ Mundo cargado (${chunks.size} chunks, ${state.mobs.length} mobs)`
		);
		return true;
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: error real de carga (no silenciar, convención del proyecto)
		console.error("Error cargando mundo:", e.message);
		// Si existe el directorio de chunks, hay un mundo real: negarse a
		// regenerar encima en lugar de arriesgar pérdida de datos.
		return fs.existsSync(P.chunksDir) ? "rechazo" : false;
	}
}

// Cambio de mundo en runtime (Fase 6: campo de semilla del menú del cliente).
// Devuelve:
//   true     — mundo cambiado a la nueva semilla (cargado de disco o fresco)
//   'same'   — misma semilla (mismo directorio): solo se actualiza el nombre
//   'rechazo'— el mundo de esa semilla existe pero no se puede abrir (formato
//              más nuevo): se revierte y no se toca nada (integridad)
//   'error'  — no se pudo persistir el mundo actual antes de cambiar: no se
//              toca nada (nada se pierde)
// Secuencia segura: persiste el mundo actual → limpia el estado en memoria →
// cambia rutas y re-seeda el ruido → carga (o deja listo para generar) el
// mundo de la nueva semilla. El jugador que la pidió genera/recibe los chunks
// del spawn en net.js (set_seed → ensureChunksAround + init).
function switchWorld(newSeed) {
	const prevSeed = P.currentSeed;
	if (constants.seedDir(newSeed) === constants.seedDir(prevSeed)) {
		// Misma semilla: solo normalizar el nombre activo (si difiere en formato)
		// sin tocar el mundo; el cliente recibe un init de confirmación igualmente.
		if (newSeed !== prevSeed) constants.setWorldSeed(newSeed);
		return "same";
	}

	// Persistir el mundo actual ANTES de soltarlo. Si la persistencia falla,
	// abortar el cambio: limpiar el estado en memoria perdería el mundo (la
	// integridad de datos está por encima de poder cambiar de semilla).
	if (!saveWorld()) {
		// biome-ignore lint/suspicious/noConsole: error real de cambio de semilla
		console.error(
			"❌ No se pudo cambiar la semilla: falló el guardado del mundo actual."
		);
		return "error";
	}
	state.chunks.clear();
	state.dirtyChunks.clear();
	state.mobs = [];
	state.furnaces.clear();
	state.chests.clear();

	constants.setWorldSeed(newSeed);
	world.reinitNoise(newSeed);

	const r = loadWorld();
	if (r === "rechazo") {
		// biome-ignore lint/suspicious/noConsole: error real de cambio de semilla
		console.error(
			`❌ No se puede abrir el mundo de la semilla "${newSeed}" (formato más nuevo o ilegible); se mantiene la semilla actual.`
		);
		constants.setWorldSeed(prevSeed);
		world.reinitNoise(prevSeed);
		loadWorld();
		return "rechazo";
	}
	// biome-ignore lint/suspicious/noConsole: log de cambio de semilla
	console.log(
		`🌱 Semilla activa: ${prevSeed} → ${newSeed} (${state.chunks.size} chunks, ${state.mobs.length} mobs)`
	);
	return true;
}

// Migración del layout antiguo (v2 pre-semilla: world.json + chunks + world.dat
// en la raíz de world/) → directorio de la semilla (world/<semilla>/). Así al
// cambiar la SEED (env var) se genera un mundo totalmente nuevo sin pisar el
// anterior, y cada semilla conserva su propio mundo (bug de la semilla).
function migrateWorldLayout() {
	try {
		if (fs.existsSync(P.worldDir)) {
			// Esta semilla ya tiene mundo propio: si además queda layout antiguo en
			// la raíz (p. ej. por haber arrancado antes con otra semilla), avisar en
			// vez de ignorarlo en silencio (integridad: convención del proyecto).
			const orphan = constants.LEGACY_ROOT_FILES.filter((n) =>
				fs.existsSync(path.join(P.worldRoot, n))
			);
			if (orphan.length > 0) {
				// biome-ignore lint/suspicious/noConsole: aviso de layout antiguo huérfano
				console.warn(
					`⚠️  Layout antiguo huérfano en world/ (${orphan.join(", ")}): esta semilla ya tiene mundo, se ignoran esos archivos.`
				);
			}
			return false;
		}
		const existing = constants.LEGACY_ROOT_FILES.filter((n) =>
			fs.existsSync(path.join(P.worldRoot, n))
		);
		if (existing.length === 0) return false; // no hay layout antiguo que migrar
		fs.mkdirSync(P.worldDir, { recursive: true });
		for (const n of existing) {
			fs.renameSync(path.join(P.worldRoot, n), path.join(P.worldDir, n));
		}
		// biome-ignore lint/suspicious/noConsole: log de migración del layout
		console.log(
			`🔁 Mundo movido al directorio de su semilla (${path.basename(P.worldDir)}): ${existing.join(", ")}`
		);
		return true;
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: error real de migración
		console.error("⚠️  No se pudo migrar el layout del mundo:", e.message);
		return false;
	}
}

// Migración del formato antiguo (world.dat único) → archivos por chunk.
// Primero se vuelca todo a los archivos nuevos; solo si eso funciona se
// renombra el .dat original a world.dat.legacy (copia de seguridad).
function migrateLegacyWorld() {
	try {
		if (!fs.existsSync(P.legacyFile) || fs.existsSync(P.chunksDir))
			return false;
		const data = JSON.parse(fs.readFileSync(P.legacyFile, "utf8"));
		if (data.seed && data.seed !== P.currentSeed) {
			// biome-ignore lint/suspicious/noConsole: aviso de semilla discrepante
			console.warn(
				`⚠️  La semilla del world.dat (${data.seed}) difiere de la configurada (${P.currentSeed}): los chunks nuevos no encajarán con los guardados.`
			);
		}
		chunks.clear();
		for (const [k, arr] of data.chunks || [])
			chunks.set(k, Uint8Array.from(arr));
		state.mobs = restoreMobs(data.mobs);
		restoreFurnaces(data.furnaces);
		restoreChests(data.chests); // defensivo: el world.dat antiguo no tenía cofres

		fs.mkdirSync(P.chunksDir, { recursive: true });
		for (const [key, arr] of chunks) {
			world.writeChunkFile(key, arr);
		}
		world.atomicWrite(P.metaFile, JSON.stringify(buildMeta(), null, 2));

		fs.renameSync(P.legacyFile, `${P.legacyFile}.legacy`);
		// biome-ignore lint/suspicious/noConsole: log de migración de world.dat
		console.log(
			`🔁 Mundo migrado de world.dat → archivos por chunk (${chunks.size} chunks)`
		);
		return true;
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: error real de migración
		console.error("⚠️  No se pudo migrar world.dat:", e.message);
		return false;
	}
}

// Lista los mundos guardados (Fase 7: menú de selección del cliente). Devuelve
// [{ seed, name, chunkCount, lastSaved }] ordenados por última modificación
// (más reciente primero). Un mundo es un directorio en world/; la identidad es
// la semilla (nombre del directorio) y el `name` mostrado se lee de world.json.
function listWorlds() {
	const out = [];
	if (!fs.existsSync(P.worldRoot)) return out;
	for (const dir of fs.readdirSync(P.worldRoot)) {
		const dirPath = path.join(P.worldRoot, dir);
		let stat;
		try {
			stat = fs.statSync(dirPath);
		} catch {
			continue;
		}
		if (!stat.isDirectory()) continue;
		let seed = dir,
			name = dir,
			lastSaved = null,
			chunkCount = 0;
		try {
			const metaFile = path.join(dirPath, "world.json");
			if (fs.existsSync(metaFile)) {
				const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
				if (typeof meta.seed === "string" && meta.seed) seed = meta.seed;
				if (typeof meta.name === "string" && meta.name) name = meta.name;
				if (typeof meta.lastSaved === "string") lastSaved = meta.lastSaved;
			}
			const chunksDir = path.join(dirPath, "chunks");
			if (fs.existsSync(chunksDir)) {
				chunkCount = fs
					.readdirSync(chunksDir)
					.filter((f) => f.endsWith(".json")).length;
			}
		} catch (e) {
			// biome-ignore lint/suspicious/noConsole: aviso de mundo ilegible en el menú
			console.warn(`⚠️  Mundo ilegible en world/${dir}: ${e.message}`);
		}
		out.push({ seed, name, chunkCount, lastSaved });
	}
	out.sort((a, b) => (b.lastSaved || "").localeCompare(a.lastSaved || ""));
	return out;
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
			// biome-ignore lint/suspicious/noConsole: error real de persistencia (no silenciar)
			console.error(
				`⚠️  No se pudo persistir ${key} al descargar; se mantiene en memoria:`,
				e.message
			);
			continue;
		}
		chunks.delete(key);
	}

	if (unloadHandler) unloadHandler(toUnload);
	// biome-ignore lint/suspicious/noConsole: log de descarga de chunks
	console.log(
		`🗑️ Descargados ${toUnload.length} chunks lejanos (${chunks.size} en memoria)`
	);
}

module.exports = {
	saveWorld,
	loadWorld,
	migrateLegacyWorld,
	migrateWorldLayout,
	switchWorld,
	unloadFarChunks,
	setUnloadHandler,
	listWorlds
};
