"use strict";

// ============================================================
// META DE MUNDOS (Fase 18, D-4 — extraído de save.js)
// world.json (schemaVersion, semilla, nombre, modo, tamaño, mobs, hornos,
// cofres, cultivos, hora), gestión de mundos del menú (clonar/renombrar/
// cambiar modo/borrar) y las migraciones de formato (layout v2→semilla y
// world.dat→chunks). El "qué se guarda y cuándo" lo decide save.js
// (orquestador); aquí vive el formato y las operaciones por semilla.
// ============================================================
const fs = require("node:fs");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const path = require("node:path");
const constants = require("./constants.js");
const {
	SCHEMA_VERSION,
	DAY_CYCLE_MS // Fase 10: amanecer de los mundos nuevos (nota del usuario)
} = constants;
const state = require("./state.js");
const world = require("./world.js");
const { restoreMobs } = require("./mobs.js");
const { restoreFurnaces } = require("./crafting.js");
const { restoreChests } = require("./chests.js");

const { chunks, furnaces, chests } = state;
// Atajos a las rutas del mundo ACTIVO (holder mutable de constants.js: la
// semilla puede cambiar en runtime con switchWorld, y los tests redirigen el
// I/O a un directorio temporal mutando constants.worldPaths).
const P = constants.worldPaths;

// Offset de reloj para que el mundo arranque al amanecer (fase 0): el mismo
// cálculo que /time set day y dormir en la cama. Así un mundo nuevo nunca
// empieza a una hora arbitraria del día (bug reportado por el usuario).
// Fase 18 (D-4): vivía en save.js y se perdió en el refactor; se recoloca
// aquí junto a DAY_CYCLE_MS (el import ya existía para esto).
function dawnOffsetMs() {
	return (0 - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
}

// Nombre mostrado de un mundo (Fase 7, campo `name` del menú): se sanea como
// el nombre del jugador pero con más margen (40 caracteres). Un mundo sin
// nombre usa su semilla como nombre (buildMeta/listWorlds ya lo asumen).
function sanitizeWorldName(raw) {
	if (typeof raw !== "string") return null;
	const name = raw
		// biome-ignore lint/suspicious/noControlCharactersInRegex: saneo intencional de caracteres de control (0x00-0x1f y DEL) del nombre del mundo
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.trim()
		.slice(0, 40);
	return name || null;
}

// Estado global (mobs, hornos, metadatos): pequeño, cabe en un solo archivo.
function buildMeta() {
	return {
		schemaVersion: SCHEMA_VERSION,
		seed: P.currentSeed,
		name: P.worldName || P.currentSeed, // Fase 7: nombre mostrado en el menú de mundos (por defecto, la semilla)
		// Fase 9 (Bloque B): modo de juego FIJO por mundo. buildMeta lo persiste
		// en world.json; loadWorld lo restaura (mundos v3 sin el campo → survival).
		gamemode: P.worldGamemode,
		// Fase 10 (B1): tamaño del mundo en bloques por lado (256/512/1024/8192).
		worldSize: P.worldSize,
		lastSaved: new Date().toISOString(),
		mobs: state.mobs
			// Fase 18 (C-8): los orbes de XP NO se persisten (se pierden al
			// reiniciar, como en sesiones cortas del clon — decisión de la spec).
			.filter((m) => m.alive && m.type !== "xp_orb")
			.map((m) => ({
				id: m.id,
				type: m.type,
				x: m.x,
				y: m.y,
				z: m.z,
				health: m.health,
				isBaby: m.isBaby,
				age: m.age, // Fase 12 (Bloque D): persistencia COMPLETA de mascotas y slimes —
				// ownerId/ownerName/sitting (la mascota no vuelve salvaje al
				// reiniciar) y slimeSize (no se pierde el tamaño del slime).
				// Se condiciona en ownerName (la identidad persistida es el
				// NOMBRE del dueño; el ownerId es solo de sesión — spec E14):
				// una mascota con dueño persiste aunque su ownerId momentáneo
				// sea null. Los mobs normales y los mundos v4 no llevan estos
				// campos (retrocompatible).
				...(m.ownerName
					? {
							ownerId: m.ownerId ?? null,
							ownerName: m.ownerName,
							sitting: !!m.sitting
						}
					: {}),
				...(typeof m.slimeSize === "number" ? { slimeSize: m.slimeSize } : {})
			})),
		furnaces: Array.from(furnaces.entries()),
		chests: Array.from(chests.entries()),
		// Fase 21.6 (D3): discos insertados en jukeboxes ("x,y,z" → {disc}) —
		// campo aditivo como cofres/hornos: los world.json viejos sin el
		// campo abren sin jukeboxes activos (SCHEMA_VERSION intacto).
		jukeboxes: Array.from(state.jukeboxes.entries()),
		// Fase 9 (Bloque C): estado de crecimiento de los cultivos ("x,y,z" → stage).
		crops: Array.from(state.crops.entries()),
		// Fase 10 (nota del usuario): hora del mundo (timeOffset) persistida —
		// al reiniciar el servidor el reloj continúa desde donde quedó, y los
		// mundos nuevos arrancan al amanecer (ver loadWorld).
		timeOffset: state.timeOffset || 0
	};
}

// ============================================================
// GESTIÓN DE MUNDOS (Fase 17, A3): clonar, renombrar y cambiar modo
// Operaciones sobre world/<semilla>/ con la misma validación defensiva
// de deleteWorld (nombres saneados con seedDir; nunca rutas arbitrarias).
// ============================================================
// Clona un mundo a una semilla nueva (copia el directorio completo; el
// world.json del clon lleva su propia semilla y el nombre pedido). Si la
// semilla destino ya existe, se desambigua con sufijos -2, -3...
function cloneWorld(seed, newName) {
	if (typeof seed !== "string" || !seed.trim())
		return { ok: false, reason: "invalid" };
	const srcDir = path.join(P.worldRoot, constants.seedDir(seed));
	if (!fs.existsSync(srcDir) || !fs.statSync(srcDir).isDirectory())
		return { ok: false, reason: "invalid" };
	const base = (newName || "").trim() || `${seed}-copia`;
	let newSeed = base;
	let dir = constants.seedDir(newSeed);
	let n = 2;
	while (fs.existsSync(path.join(P.worldRoot, dir))) {
		newSeed = `${base}-${n++}`;
		dir = constants.seedDir(newSeed);
	}
	try {
		fs.cpSync(srcDir, path.join(P.worldRoot, dir), { recursive: true });
		const metaFile = path.join(P.worldRoot, dir, "world.json");
		if (fs.existsSync(metaFile)) {
			const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
			meta.seed = newSeed;
			const name = sanitizeWorldName(newName);
			if (name) meta.name = name;
			world.atomicWrite(metaFile, JSON.stringify(meta, null, 2));
		}
		log.info(`📋 Mundo clonado: ${seed} → ${newSeed}`);
		return { ok: true, seed: newSeed };
	} catch (e) {
		log.error("⚠️  No se pudo clonar el mundo:", e.message);
		return { ok: false, reason: "error" };
	}
}

// Renombra un mundo (edita `name` de world.json sin tocar la semilla/directorio).
function renameWorld(seed, newName) {
	const name = sanitizeWorldName(newName);
	if (!name) return { ok: false, reason: "invalid" };
	const dirName = constants.seedDir(seed);
	const metaFile = path.join(P.worldRoot, dirName, "world.json");
	if (!fs.existsSync(metaFile)) return { ok: false, reason: "invalid" };
	try {
		const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
		meta.name = name;
		world.atomicWrite(metaFile, JSON.stringify(meta, null, 2));
		if (dirName === constants.seedDir(P.currentSeed)) P.worldName = name;
		return { ok: true };
	} catch (e) {
		log.error("⚠️  No se pudo renombrar el mundo:", e.message);
		return { ok: false, reason: "error" };
	}
}

// Cambia el modo de juego de un mundo (survival/creative, persiste en
// world.json). El mundo activo lo refleja también en memoria.
function setWorldMode(seed, mode) {
	const m = constants.sanitizeGamemode(mode);
	const dirName = constants.seedDir(seed);
	const metaFile = path.join(P.worldRoot, dirName, "world.json");
	if (!fs.existsSync(metaFile)) return { ok: false, reason: "invalid" };
	try {
		const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
		meta.gamemode = m;
		world.atomicWrite(metaFile, JSON.stringify(meta, null, 2));
		if (dirName === constants.seedDir(P.currentSeed)) P.worldGamemode = m;
		return { ok: true, gamemode: m };
	} catch (e) {
		log.error("⚠️  No se pudo cambiar el modo del mundo:", e.message);
		return { ok: false, reason: "error" };
	}
}

// ============================================================
// ELIMINAR MUNDOS (Fase 9, Bloque B)
// Borra el directorio completo de una semilla (world/<semilla>/) del menú.
// Devuelve { ok: true } o { ok: false, reason }: 'active' (es el mundo en
// uso — no se puede borrar), 'invalid' (nombre de directorio no validado) o
// 'error'. Seguridad: solo se borra un directorio bajo world/ cuyo nombre
// coincide EXACTAMENTE con seedDir(semilla) validado — nunca rutas arbitrarias
// ni la raíz de world/.
// ============================================================
function deleteWorld(seed) {
	if (typeof seed !== "string" || !seed.trim())
		return { ok: false, reason: "invalid" };
	const dirName = constants.seedDir(seed);
	// El mundo activo no se puede borrar (se perdería el estado en memoria y
	// el jugador jugaría sobre un mundo sin directorio).
	if (dirName === constants.seedDir(P.currentSeed))
		return { ok: false, reason: "active" };
	const target = path.join(P.worldRoot, dirName);
	// Defensa: el destino debe estar DENTRO de world/ y su nombre debe ser el
	// del directorio derivado de la semilla (nunca .., vacío o la raíz).
	const resolved = path.resolve(target);
	const root = path.resolve(P.worldRoot);
	if (
		dirName.length === 0 ||
		resolved === root ||
		!resolved.startsWith(root + path.sep)
	)
		return { ok: false, reason: "invalid" };
	if (!fs.existsSync(resolved)) return { ok: true }; // ya no existe
	const stat = fs.statSync(resolved);
	if (!stat.isDirectory()) return { ok: false, reason: "invalid" };
	try {
		fs.rmSync(resolved, { recursive: true, force: true });
		log.info(`🗑️ Mundo eliminado: ${dirName}`);
		return { ok: true };
	} catch (e) {
		log.error("⚠️  No se pudo borrar el mundo:", e.message);
		return { ok: false, reason: "error" };
	}
}

// ============================================================
// MIGRACIONES DE FORMATO (retrocompatibles, ver docs/ y unit-persistencia)
// ============================================================
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
				log.warn(
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
		log.info(
			`🔁 Mundo movido al directorio de su semilla (${path.basename(P.worldDir)}): ${existing.join(", ")}`
		);
		return true;
	} catch (e) {
		log.error("⚠️  No se pudo migrar el layout del mundo:", e.message);
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
			log.warn(
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
		log.info(
			`🔁 Mundo migrado de world.dat → archivos por chunk (${chunks.size} chunks)`
		);
		return true;
	} catch (e) {
		log.error("⚠️  No se pudo migrar world.dat:", e.message);
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
	// Fase 17 (A1): en modo menú no hay mundo activo (currentSeed null) — la
	// lista no marca ningún mundo como activo ni inventa uno.
	let activeFound = !P.currentSeed; // ¿el mundo activo ya tiene directorio en disco?
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
			chunkCount = 0,
			gamemode = "survival",
			worldSize = 8192; // Fase 10 (B1): mundos viejos sin el campo → 8192
		try {
			const metaFile = path.join(dirPath, "world.json");
			if (fs.existsSync(metaFile)) {
				const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
				if (typeof meta.seed === "string" && meta.seed) seed = meta.seed;
				if (typeof meta.name === "string" && meta.name) name = meta.name;
				if (typeof meta.lastSaved === "string") lastSaved = meta.lastSaved;
				// Fase 9 (Bloque B): modo de juego del mundo para el badge del menú
				// (los mundos v3 sin el campo → survival).
				gamemode = constants.sanitizeGamemode(meta.gamemode);
				// Fase 10 (B1): tamaño del mundo para el badge del menú.
				worldSize = constants.sanitizeWorldSize(meta.worldSize);
			}
			const chunksDir = path.join(dirPath, "chunks");
			if (fs.existsSync(chunksDir)) {
				chunkCount = fs
					.readdirSync(chunksDir)
					.filter((f) => f.endsWith(".json")).length;
			}
			// Fase 7: el mundo ACTIVO muestra su nombre en memoria (puede ser más
			// reciente que world.json — mundo recién creado o renombrado en esta
			// sesión, antes de que el autosave haya vuelto a escribir el archivo).
			// Fase 9 (Bloque B): `active: true` marca el mundo en uso — el menú no
			// permite borrarlo (el servidor también lo rechaza en deleteWorld).
			if (
				P.currentSeed &&
				constants.seedDir(seed) === constants.seedDir(P.currentSeed)
			) {
				activeFound = true;
				if (P.worldName) name = P.worldName;
				out.push({
					seed,
					name,
					chunkCount,
					lastSaved,
					gamemode,
					worldSize,
					active: true
				});
				continue;
			}
		} catch (e) {
			log.warn(`⚠️  Mundo ilegible en world/${dir}: ${e.message}`);
		}
		out.push({ seed, name, chunkCount, lastSaved, gamemode, worldSize });
	}
	// El mundo activo recién creado aún no tiene directorio (los chunks se
	// escriben en el primer autosave): incluirlo igualmente para que el menú lo
	// muestre con su nombre sin esperar los 30s del guardado automático.
	if (!activeFound) {
		out.push({
			seed: P.currentSeed,
			worldSize: P.worldSize, // Fase 10 (B1)
			name: P.worldName || P.currentSeed,
			chunkCount: 0,
			lastSaved: null,
			gamemode: P.worldGamemode,
			active: true
		});
	}
	out.sort((a, b) => (b.lastSaved || "").localeCompare(a.lastSaved || ""));
	return out;
}

module.exports = {
	sanitizeWorldName,
	buildMeta,
	dawnOffsetMs,
	cloneWorld,
	renameWorld,
	setWorldMode,
	deleteWorld,
	migrateWorldLayout,
	migrateLegacyWorld,
	listWorlds
};
