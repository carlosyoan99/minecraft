"use strict";

// ============================================================
// PERSISTENCIA (guardado incremental por chunk) Y DESCARGA DE CHUNKS
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const constants = require("./constants.js");
const {
	SCHEMA_VERSION,
	UNLOAD_DISTANCE_CHUNKS,
	CHUNK_SIZE,
	DAY_CYCLE_MS // Fase 10: amanecer de los mundos nuevos (nota del usuario)
} = constants;
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
			.filter((m) => m.alive)
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
		// Fase 9 (Bloque C): estado de crecimiento de los cultivos ("x,y,z" → stage).
		crops: Array.from(state.crops.entries()),
		// Fase 10 (nota del usuario): hora del mundo (timeOffset) persistida —
		// al reiniciar el servidor el reloj continúa desde donde quedó, y los
		// mundos nuevos arrancan al amanecer (ver loadWorld).
		timeOffset: state.timeOffset || 0
	};
}

// ============================================================
// PERSISTENCIA DE JUGADORES (Fase 17, B1)
// El estado del jugador (inventario, salud/comida, XP, posición, armadura,
// punto de reaparición) se guarda por NOMBRE en un archivo ADITIVO
// world/<semilla>/players/<nombre>.json. No toca SCHEMA_VERSION ni el
// formato de chunks/meta: retrocompatible por definición (un mundo v6 sin
// carpeta players/ carga igual). Se guarda al desconectar y en el autosave;
// se restaura al conectar por nombre (patrón de las mascotas F12: el nombre
// es la identidad persistida, los ids son de sesión).
// ============================================================
function playersDir() {
	return path.join(P.worldDir, "players");
}
function playerFilePath(name) {
	return path.join(playersDir(), `${sanitizePlayerFile(name)}.json`);
}
function sanitizePlayerFile(name) {
	return (
		String(name || "jugador")
			.replace(/[^a-zA-Z0-9_-]+/g, "_")
			.slice(0, 40) || "jugador"
	);
}

// Snapshot de los campos del jugador que se persisten (null si no aplica:
// en menú o jugador fantasma). El wire del jugador es el mismo JSON plano.
function playerSnapshot(player) {
	if (!player || player.inMenu || !P.currentSeed) return null;
	return {
		name: player.name,
		inventory: player.inventory,
		armor: player.armor,
		selectedSlot: player.selectedSlot,
		health: player.health,
		food: player.food,
		saturation: player.saturation,
		xp: player.xp,
		level: player.level,
		x: player.x,
		y: player.y,
		z: player.z,
		yaw: player.yaw,
		pitch: player.pitch,
		respawnPoint: player.respawnPoint
	};
}
function savePlayer(player) {
	const data = playerSnapshot(player);
	if (!data) return;
	try {
		if (!fs.existsSync(playersDir()))
			fs.mkdirSync(playersDir(), { recursive: true });
		world.atomicWrite(
			playerFilePath(player.name),
			JSON.stringify(data, null, 2)
		);
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: error real de persistencia (no silenciar)
		console.warn(
			`⚠️  No se pudo guardar el jugador ${player.name}: ${e.message}`
		);
	}
}

// Restaura el estado persistido del jugador (por nombre) en la instancia
// recién creada. Lectura defensiva: campos inválidos se ignoran (los
// archivos son locales, pero nunca se confía en el formato). Devuelve true
// si había datos y se aplicaron (posiblemente en parte).
function restorePlayer(player) {
	if (!player || player.inMenu || !P.currentSeed) return false;
	let data;
	try {
		const f = playerFilePath(player.name);
		if (!fs.existsSync(f)) return false;
		data = JSON.parse(fs.readFileSync(f, "utf8"));
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: aviso de jugador ilegible
		console.warn(
			`⚠️  Jugador guardado ilegible (${player.name}), se empieza de cero: ${e.message}`
		);
		return false;
	}
	if (Array.isArray(data.inventory) && data.inventory.length === 36)
		player.inventory = data.inventory;
	if (data.armor && typeof data.armor === "object")
		player.armor = {
			helmet: data.armor.helmet ?? null,
			chestplate: data.armor.chestplate ?? null,
			leggings: data.armor.leggings ?? null,
			boots: data.armor.boots ?? null
		};
	if (
		typeof data.selectedSlot === "number" &&
		data.selectedSlot >= 0 &&
		data.selectedSlot < 9
	)
		player.selectedSlot = data.selectedSlot;
	if (typeof data.health === "number")
		player.health = Math.min(player.maxHealth || 20, data.health);
	if (typeof data.food === "number")
		player.food = Math.min(20, Math.max(0, data.food));
	if (typeof data.saturation === "number")
		player.saturation = Math.min(20, Math.max(0, data.saturation));
	if (typeof data.xp === "number" && data.xp >= 0) {
		player.xp = data.xp;
		player.level = typeof data.level === "number" ? data.level : 0;
	}
	if (
		typeof data.x === "number" &&
		typeof data.y === "number" &&
		typeof data.z === "number" &&
		Number.isFinite(data.x) &&
		Number.isFinite(data.y) &&
		Number.isFinite(data.z)
	) {
		player.x = data.x;
		player.y = data.y;
		player.z = data.z;
	}
	if (typeof data.yaw === "number") player.yaw = data.yaw;
	if (typeof data.pitch === "number") player.pitch = data.pitch;
	if (data.respawnPoint && typeof data.respawnPoint === "object")
		player.respawnPoint = data.respawnPoint;
	return true;
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
		// biome-ignore lint/suspicious/noConsole: log de clonado
		console.log(`📋 Mundo clonado: ${seed} → ${newSeed}`);
		return { ok: true, seed: newSeed };
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: error real de clonado
		console.error("⚠️  No se pudo clonar el mundo:", e.message);
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
		// biome-ignore lint/suspicious/noConsole: error real de renombrado
		console.error("⚠️  No se pudo renombrar el mundo:", e.message);
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
		// biome-ignore lint/suspicious/noConsole: error real de cambio de modo
		console.error("⚠️  No se pudo cambiar el modo del mundo:", e.message);
		return { ok: false, reason: "error" };
	}
}

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
	// biome-ignore lint/suspicious/noConsole: log del modo menú
	console.log("🗂️ Modo menú: mundo liberado (sin jugadores).");
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
				// biome-ignore lint/suspicious/noConsole: error real de backup (no silenciar)
				console.warn(
					`⚠️  No se pudo crear el backup de world.json: ${e.message}`
				);
			}
		}
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
// Offset de reloj para que el mundo arranque al amanecer (fase 0): el mismo
// cálculo que /time set day y dormir en la cama. Así un mundo nuevo nunca
// empieza a una hora arbitraria del día (bug reportado por el usuario).
function dawnOffsetMs() {
	return (0 - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
}

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
					// biome-ignore lint/suspicious/noConsole: aviso de restauración
					console.warn("⚠️  world.json ilegible; restaurando el backup (.bak)");
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
			// biome-ignore lint/suspicious/noConsole: aviso de mundo sin metadatos
			console.warn(
				"⚠️  world.json no encontrado: mobs, hornos y cofres se reinician (chunks intactos)"
			);
			// Hora desconocida (sin metadatos): amanecer, como en un mundo nuevo.
			state.timeOffset = dawnOffsetMs();
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
		// biome-ignore lint/suspicious/noConsole: error real de cambio de semilla
		console.error(
			`❌ No se puede abrir el mundo de la semilla "${newSeed}" (formato más nuevo o ilegible); se mantiene la semilla actual.`
		);
		constants.setWorldSeed(prevSeed);
		world.reinitNoise(prevSeed);
		loadWorld(); // restaura también el nombre del mundo anterior
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
			// biome-ignore lint/suspicious/noConsole: aviso de mundo ilegible en el menú
			console.warn(`⚠️  Mundo ilegible en world/${dir}: ${e.message}`);
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
		// biome-ignore lint/suspicious/noConsole: log de borrado de mundo
		console.log(`🗑️ Mundo eliminado: ${dirName}`);
		return { ok: true };
	} catch (e) {
		// biome-ignore lint/suspicious/noConsole: error real de borrado
		console.error("⚠️  No se pudo borrar el mundo:", e.message);
		return { ok: false, reason: "error" };
	}
}

// ============================================================
// GUARDADO ASÍNCRONO (C1, REN-1/SV-4)
// El autosave periódico no debe congelar el event loop: con cientos de
// chunks sucios, escribir todo síncronamente de golpe bloquea el servidor
// (causa más probable de los timeouts E2E). La cola procesa los chunks por
// lotes con setImmediate, cediendo el paso al bucle principal entre lotes.
// El formato de disco, la atomicidad (tmp+rename) y el .bak no cambian.
// saveWorld() (síncrono) se conserva para los puntos que necesitan el
// resultado inmediato (switchWorld y SIGINT); el setInterval usa esta cola.
// ============================================================
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
				// biome-ignore lint/suspicious/noConsole: error real de persistencia
				console.error(`Error escribiendo chunk ${key}:`, e.message);
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
				// biome-ignore lint/suspicious/noConsole: error real de backup (no silenciar)
				console.warn(
					`⚠️  No se pudo crear el backup de world.json: ${e.message}`
				);
			}
		}
		try {
			world.atomicWrite(P.metaFile, JSON.stringify(buildMeta(), null, 2));
		} catch (e) {
			// biome-ignore lint/suspicious/noConsole: error real de persistencia
			console.error("Error escribiendo world.json:", e.message);
		}
		// biome-ignore lint/suspicious/noConsole: log periódico del guardado automático
		console.log(
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
		// biome-ignore lint/suspicious/noConsole: error real de persistencia
		console.error("Error creando directorios de guardado:", e.message);
		return;
	}
	setImmediate(processBatch);
}

module.exports = {
	saveWorld,
	saveWorldAsync, // C1: autosave por lotes fuera del event loop
	buildMeta, // Fase 12 (D): los tests verifican los campos de mascota/slime
	loadWorld,
	migrateLegacyWorld,
	migrateWorldLayout,
	switchWorld,
	unloadFarChunks,
	setUnloadHandler,
	listWorlds,
	deleteWorld,
	// Fase 17 (A1/A3/B1): menú, gestión de mundos y persistencia de jugadores
	releaseWorld,
	cloneWorld,
	renameWorld,
	setWorldMode,
	playerSnapshot,
	savePlayer,
	restorePlayer
};
