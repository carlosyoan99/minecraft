"use strict";
// ============================================================
// TESTS UNITARIOS DE PERSISTENCIA (Fase 1)
// Cubre save.js (saveWorld, loadWorld, migrateLegacyWorld,
// unloadFarChunks) y el I/O de chunk de world.js (atomicWrite,
// writeChunkFile, readChunkFile, loadChunkFromDisk) sobre un
// directorio temporal — NUNCA toca el world/ real del proyecto.
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-persist-"));
const constants = require("../server/constants.js");
// Valores pristinos (derivación WORLD_DIR = WORLD_ROOT + seedDir) antes de
// redirigir a un directorio temporal ANTES de requerir world/save
// (capturan estos valores al cargarse: mutamos el objeto exportado).
const PRISTINE_WORLD_ROOT = constants.worldPaths.worldRoot;
const PRISTINE_WORLD_DIR = constants.worldPaths.worldDir;
const PRISTINE_CHUNKS_DIR = constants.worldPaths.chunksDir;
constants.worldPaths.worldRoot = path.join(TMP, "worldroot");
constants.worldPaths.worldDir = path.join(TMP, "world");
constants.worldPaths.chunksDir = path.join(TMP, "world", "chunks");
constants.worldPaths.legacyFile = path.join(TMP, "world", "world.dat");
constants.worldPaths.metaFile = path.join(TMP, "world", "world.json");
constants.LEGACY_ROOT_FILES = ["world.json", "chunks", "world.dat"];
const LEGACY_ROOT_META = path.join(TMP, "worldroot", "world.json");
const LEGACY_ROOT_CHUNKS = path.join(TMP, "worldroot", "chunks");

const world = require("../server/world.js");
const save = require("../server/save.js");
const state = require("../server/state.js");
const { SCHEMA_VERSION, CHUNK_SIZE, WORLD_HEIGHT, B, SEED } = constants;

let fails = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) fails++;
};

function resetWorld() {
	fs.rmSync(path.join(TMP, "world"), { recursive: true, force: true });
	fs.mkdirSync(constants.worldPaths.chunksDir, { recursive: true });
}

// --- 1) atomicWrite: crea el archivo y no deja .tmp ---
{
	const f = path.join(TMP, "atomic.txt");
	world.atomicWrite(f, "hola");
	check(
		"atomicWrite escribe el archivo",
		fs.readFileSync(f, "utf8") === "hola"
	);
	check("atomicWrite no deja .tmp", !fs.existsSync(`${f}.tmp`));
}

// --- 2) writeChunkFile / readChunkFile / loadChunkFromDisk round-trip ---
{
	resetWorld();
	const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	arr[0] = B.STONE;
	arr[1234] = B.WATER;
	world.writeChunkFile("3,-2", arr);
	const file = path.join(constants.worldPaths.chunksDir, "3_-2.json");
	const parsed = world.readChunkFile(file, "test");
	check(
		"writeChunkFile guarda schemaVersion",
		parsed && parsed.schemaVersion === SCHEMA_VERSION,
		`v=${parsed?.schemaVersion}`
	);
	check(
		"writeChunkFile guarda cx/cz",
		parsed && parsed.cx === 3 && parsed.cz === -2
	);
	check(
		"readChunkFile devuelve datos idénticos",
		parsed &&
			parsed.data[0] === B.STONE &&
			parsed.data[1234] === B.WATER &&
			parsed.data.length === arr.length
	);
	const back = world.loadChunkFromDisk(3, -2);
	check(
		"loadChunkFromDisk recupera Uint8Array",
		back && back[1234] === B.WATER
	);
}

// --- 3) readChunkFile rechaza datos corruptos / versiones nuevas ---
{
	resetWorld();
	const bad1 = path.join(constants.worldPaths.chunksDir, "bad1.json");
	fs.writeFileSync(bad1, "no-json");
	check(
		"JSON ilegible → null (con aviso)",
		world.readChunkFile(bad1, "test") === null
	);

	const bad2 = path.join(constants.worldPaths.chunksDir, "bad2.json");
	fs.writeFileSync(bad2, JSON.stringify({ cx: 0, cz: 0, data: [1, 2, 3] })); // longitud errónea
	check(
		"longitud inesperada → null",
		world.readChunkFile(bad2, "test") === null
	);

	const bad3 = path.join(constants.worldPaths.chunksDir, "bad3.json");
	fs.writeFileSync(
		bad3,
		JSON.stringify({
			schemaVersion: SCHEMA_VERSION + 1,
			cx: 0,
			cz: 0,
			data: new Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE).fill(0)
		})
	);
	check(
		"schemaVersion más nueva → null (se regenerará)",
		world.readChunkFile(bad3, "test") === null
	);

	const bad4 = path.join(constants.worldPaths.chunksDir, "bad4.json");
	fs.writeFileSync(
		bad4,
		JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: [] })
	); // sin cx/cz
	check("sin cx/cz → null", world.readChunkFile(bad4, "test") === null);
}

// --- 4) saveWorld incremental: escribe los chunks sucios y limpia dirtyChunks ---
{
	resetWorld();
	state.chunks.clear();
	state.dirtyChunks.clear();
	const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	arr[0] = B.GRASS;
	state.chunks.set("0,0", arr);
	state.dirtyChunks.add("0,0");
	save.saveWorld();
	check(
		"saveWorld escribe los chunks sucios",
		fs.existsSync(path.join(constants.worldPaths.chunksDir, "0_0.json"))
	);
	check(
		"saveWorld limpia dirtyChunks",
		state.dirtyChunks.size === 0,
		`size=${state.dirtyChunks.size}`
	);
	// Un chunk limpio no se reescribe: al guardar de nuevo el archivo no cambia de mtime
	const antes = fs.statSync(
		path.join(constants.worldPaths.chunksDir, "0_0.json")
	).mtimeMs;
	save.saveWorld();
	const despues = fs.statSync(
		path.join(constants.worldPaths.chunksDir, "0_0.json")
	).mtimeMs;
	check(
		"saveWorld no reescribe chunks limpios (incremental)",
		despues === antes
	);
}

// --- 5) loadWorld round-trip completo (chunks + mobs + hornos) ---
{
	resetWorld();
	state.chunks.clear();
	const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	arr[5] = B.GRASS;
	arr[999] = B.FURNACE;
	state.chunks.set("0,0", arr);
	state.dirtyChunks.add("0,0");
	state.mobs = [
		{
			id: "m1",
			type: "cow",
			x: 1,
			y: 2,
			z: 3,
			health: 10,
			isBaby: true,
			age: 5,
			alive: true
		}
	];
	state.furnaces.set("k1", {
		fuelItem: 4,
		fuelTicksLeft: 100,
		inputItem: { id: 9, count: 1 },
		progress: 5,
		requiredTicks: 200,
		outputItem: null,
		outputCount: 0
	});
	save.saveWorld();

	state.chunks.clear();
	state.mobs = [];
	state.furnaces.clear();
	const r = save.loadWorld();
	check("loadWorld devuelve true", r === true);
	check(
		"loadWorld restaura chunks",
		state.chunks.has("0,0") && state.chunks.get("0,0")[999] === B.FURNACE
	);
	check(
		"loadWorld restaura mobs (retrocompatible isBaby/age)",
		state.mobs.length === 1 &&
			state.mobs[0].type === "cow" &&
			state.mobs[0].isBaby === true,
		JSON.stringify(
			state.mobs[0] && {
				type: state.mobs[0].type,
				isBaby: state.mobs[0].isBaby
			}
		)
	);
	check("loadWorld restaura hornos", state.furnaces.has("k1"));
}

// --- 6) loadWorld se niega a abrir un mundo más nuevo (integridad) ---
{
	resetWorld();
	world.writeChunkFile(
		"9,9",
		new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE)
	);
	fs.writeFileSync(
		constants.worldPaths.metaFile,
		JSON.stringify({ schemaVersion: SCHEMA_VERSION + 5, seed: SEED })
	);
	const r = save.loadWorld();
	check(
		"schemaVersion más nueva → rechazo (no carga ni corrompe)",
		r === "rechazo",
		`r=${r}`
	);

	fs.rmSync(path.join(TMP, "world"), { recursive: true, force: true });
	check(
		"sin mundo guardado → false (se generará uno nuevo)",
		save.loadWorld() === false
	);
}

// --- 7) migrateLegacyWorld: world.dat v1 → archivos por chunk ---
{
	resetWorld();
	// La migración exige que CHUNKS_DIR NO exista todavía (v1 → v2).
	fs.rmSync(constants.worldPaths.chunksDir, { recursive: true, force: true });
	const legacy = {
		seed: SEED,
		chunks: [
			[
				"0,0",
				Array.from(new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE))
			]
		],
		mobs: [],
		furnaces: []
	};
	fs.writeFileSync(constants.worldPaths.legacyFile, JSON.stringify(legacy));
	const ok = save.migrateLegacyWorld();
	check("migrateLegacyWorld migra (true)", ok === true);
	check(
		"chunks escritos en archivos",
		fs.existsSync(path.join(constants.worldPaths.chunksDir, "0_0.json"))
	);
	check(
		"world.dat renombrado a .legacy",
		fs.existsSync(`${constants.worldPaths.legacyFile}.legacy`)
	);
	check("meta escrito", fs.existsSync(constants.worldPaths.metaFile));
	check("chunks en memoria tras migrar", state.chunks.has("0,0"));
	check(
		"no re-migra si ya hay chunks dir",
		save.migrateLegacyWorld() === false
	);
}

// --- 8) unloadFarChunks: descarga lejanos, conserva cercanos y persiste sucios ---
{
	resetWorld();
	state.chunks.clear();
	state.dirtyChunks.clear();
	state.players.clear();
	state.players.set("fake", { x: 0.5, y: 10, z: 0.5 }); // jugador en el chunk (0,0)
	const a = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	const b = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	a[1] = B.DIRT;
	b[1] = B.STONE;
	state.chunks.set("0,0", a); // cerca del jugador → se conserva
	state.chunks.set("30,0", b); // lejano (|30-0|=30 > 10) → se descarga
	state.dirtyChunks.add("30,0");
	save.unloadFarChunks();
	check("chunk lejano descargado", !state.chunks.has("30,0"));
	check("chunk cercano conservado", state.chunks.has("0,0"));
	check(
		"chunk sucio lejano persistido antes de descargar",
		fs.existsSync(path.join(constants.worldPaths.chunksDir, "30_0.json"))
	);
	check("dirtyChunks sin la clave descargada", !state.dirtyChunks.has("30,0"));
	state.players.clear();
}

// --- 9) generateChunk recupera de disco lo ya guardado (no regenera) ---
{
	resetWorld();
	state.chunks.clear();
	state.dirtyChunks.clear();
	const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	arr[7] = B.DIAMOND_ORE;
	world.writeChunkFile("2,2", arr);
	const gen = world.generateChunk(2, 2);
	check(
		"generateChunk recupera chunk guardado (no lo regenera)",
		gen[7] === B.DIAMOND_ORE
	);
}

// --- 10) Semilla por directorio: cambiar la SEED genera un mundo nuevo ---
{
	// seedDir: nombre seguro y distinto para cada semilla
	check(
		"seedDir saneja caracteres peligrosos",
		constants.seedDir("Mi Semilla 2026!") === "mi_semilla_2026"
	);
	check(
		"seedDir diferencia semillas",
		constants.seedDir("otra") === "otra" &&
			constants.seedDir("otra") !== constants.seedDir("Mi Semilla 2026!")
	);
	check(
		"seedDir vacío → default",
		constants.seedDir("") === "default" && constants.seedDir() === "default"
	);
	// Anti path-traversal: una SEED maliciosa (env var) nunca puede escapar de world/
	const hostile = constants.seedDir("../../etc/passwd");
	check(
		"seedDir neutraliza path-traversal (sin / ni ..)",
		!hostile.includes("/") && !hostile.includes("..") && hostile.length > 0,
		hostile
	);
	// CHUNKS_DIR/META_FILE derivan del directorio de la semilla (el guardado
	// incremental nunca vuelve a crear un world/chunks raíz y dividir el mundo)
	check(
		"CHUNKS_DIR vive dentro de WORLD_DIR",
		constants.worldPaths.chunksDir.startsWith(constants.worldPaths.worldDir),
		constants.worldPaths.chunksDir
	);
	check(
		"WORLD_DIR deriva de WORLD_ROOT + seedDir(SEED)",
		PRISTINE_WORLD_DIR ===
			path.join(PRISTINE_WORLD_ROOT, constants.seedDir(SEED)),
		PRISTINE_WORLD_DIR
	);
	check(
		"CHUNKS_DIR pristino deriva de WORLD_DIR",
		PRISTINE_CHUNKS_DIR === path.join(PRISTINE_WORLD_DIR, "chunks")
	);

	// migrateWorldLayout: mueve el layout antiguo (world.json + chunks en la raíz)
	// al directorio de la semilla actual — el mundo NO se pierde ni se reutiliza mal
	resetWorld();
	fs.rmSync(constants.worldPaths.worldDir, { recursive: true, force: true }); // sin dir de semilla todavía
	fs.rmSync(constants.worldPaths.worldRoot, { recursive: true, force: true });
	fs.mkdirSync(LEGACY_ROOT_CHUNKS, { recursive: true });
	const chunkArr = new Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE).fill(0);
	fs.writeFileSync(
		path.join(LEGACY_ROOT_CHUNKS, "0_0.json"),
		JSON.stringify({
			schemaVersion: SCHEMA_VERSION,
			cx: 0,
			cz: 0,
			data: chunkArr
		})
	);
	fs.writeFileSync(
		LEGACY_ROOT_META,
		JSON.stringify({ schemaVersion: SCHEMA_VERSION, seed: SEED })
	);
	check("migrateWorldLayout migra (true)", save.migrateWorldLayout() === true);
	check(
		"world.json movido a world/<semilla>/",
		fs.existsSync(constants.worldPaths.metaFile),
		constants.worldPaths.metaFile
	);
	check(
		"chunks movidos a world/<semilla>/chunks",
		fs.existsSync(path.join(constants.worldPaths.chunksDir, "0_0.json"))
	);
	check(
		"la raíz queda limpia",
		!fs.existsSync(LEGACY_ROOT_META) && !fs.existsSync(LEGACY_ROOT_CHUNKS)
	);
	check(
		"no re-migra si la semilla ya tiene mundo",
		save.migrateWorldLayout() === false
	);
}

// --- 11) switchWorld: cambio de semilla en runtime (Fase 6, menú del cliente) ---
{
	// Aislamiento: paths derivados de TMP/worldroot + la semilla por defecto
	constants.worldPaths.worldRoot = path.join(TMP, "worldroot");
	constants.setWorldSeed(SEED);
	fs.rmSync(path.join(TMP, "worldroot"), { recursive: true, force: true });
	fs.mkdirSync(constants.worldPaths.chunksDir, { recursive: true });
	state.chunks.clear();
	state.dirtyChunks.clear();
	state.mobs = [];
	state.furnaces.clear();

	// Mundo "viejo" con un chunk característico y un mob guardados
	const arrA = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	arrA[3] = B.DIAMOND_ORE;
	state.chunks.set("0,0", arrA);
	state.dirtyChunks.add("0,0");
	state.mobs = [
		{
			id: "m1",
			type: "cow",
			x: 1,
			y: 2,
			z: 3,
			health: 10,
			isBaby: false,
			age: 0,
			alive: true
		}
	];
	save.saveWorld();
	const oldDir = constants.worldPaths.worldDir; // worldroot/<seedDir(SEED)>
	check(
		"switchWorld: el mundo viejo queda guardado",
		fs.existsSync(path.join(oldDir, "chunks", "0_0.json"))
	);

	// Cambiar a otra semilla → mundo nuevo (paths nuevos, estado limpio)
	const r1 = save.switchWorld("Otra Semilla 2026!");
	check("switchWorld a otra semilla → true", r1 === true, `r=${r1}`);
	check(
		"switchWorld cambia worldDir al seedDir de la nueva semilla",
		constants.worldPaths.worldDir ===
			path.join(TMP, "worldroot", "otra_semilla_2026"),
		constants.worldPaths.worldDir
	);
	check("switchWorld limpia mobs del mundo anterior", state.mobs.length === 0);
	check(
		"switchWorld persiste el mundo anterior en disco (no se pierde)",
		fs.existsSync(path.join(oldDir, "chunks", "0_0.json")) &&
			fs.existsSync(path.join(oldDir, "world.json"))
	);
	check(
		"switchWorld: mundo fresco sin chunks en memoria aún",
		state.chunks.size === 0,
		`chunks=${state.chunks.size}`
	);

	// Misma semilla → 'same' (no toca nada)
	check(
		"switchWorld misma semilla → same",
		save.switchWorld("Otra Semilla 2026!") === "same"
	);

	// Volver a la semilla original → recupera el mundo guardado
	const r2 = save.switchWorld(SEED);
	check("switchWorld de vuelta → true", r2 === true, `r=${r2}`);
	check(
		"switchWorld recupera el chunk de la semilla anterior",
		state.chunks.get("0,0") && state.chunks.get("0,0")[3] === B.DIAMOND_ORE
	);
	check(
		"switchWorld restaura los mobs guardados",
		state.mobs.some((m) => m.type === "cow")
	);

	// Mundo ilegible (schemaVersion más nueva) → 'rechazo' y revierte
	const ilegibleDir = path.join(
		TMP,
		"worldroot",
		constants.seedDir("ilegible")
	);
	fs.mkdirSync(path.join(ilegibleDir, "chunks"), { recursive: true });
	fs.writeFileSync(
		path.join(ilegibleDir, "chunks", "0_0.json"),
		JSON.stringify({
			schemaVersion: SCHEMA_VERSION + 5,
			cx: 0,
			cz: 0,
			data: new Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE).fill(0)
		})
	);
	fs.writeFileSync(
		path.join(ilegibleDir, "world.json"),
		JSON.stringify({ schemaVersion: SCHEMA_VERSION + 5, seed: "ilegible" })
	);
	const dirAntesRechazo = constants.worldPaths.worldDir;
	const r3 = save.switchWorld("ilegible");
	check("switchWorld mundo ilegible → rechazo", r3 === "rechazo", `r=${r3}`);
	check(
		"switchWorld rechazo revierte el worldDir",
		constants.worldPaths.worldDir === dirAntesRechazo,
		constants.worldPaths.worldDir
	);
	check(
		"switchWorld rechazo mantiene cargado el mundo anterior",
		state.chunks.get("0,0") && state.chunks.get("0,0")[3] === B.DIAMOND_ORE
	);

	// Fallo de persistencia → 'error' y no se toca nada (integridad)
	fs.rmSync(constants.worldPaths.worldDir, { recursive: true, force: true });
	fs.writeFileSync(constants.worldPaths.worldDir, "soy-un-archivo"); // reemplaza el dir por un archivo
	const dirAntesError = constants.worldPaths.worldDir;
	const r4 = save.switchWorld("otra");
	check("switchWorld fallo de guardado → error", r4 === "error", `r=${r4}`);
	check(
		"switchWorld error no cambia worldDir",
		constants.worldPaths.worldDir === dirAntesError
	);
	check(
		"switchWorld error conserva el estado en memoria",
		state.chunks.get("0,0") && state.chunks.get("0,0")[3] === B.DIAMOND_ORE
	);
	fs.rmSync(constants.worldPaths.worldDir); // era un archivo: restaurar el dir
	fs.mkdirSync(path.join(constants.worldPaths.worldDir, "chunks"), {
		recursive: true
	});

	// reinitNoise: semillas distintas generan mundos distintos (determinista)
	const realRandom = Math.random;
	Math.random = () => 0.5; // sin árboles: la generación depende solo del ruido
	world.setDiskLoader(() => null); // generación fresca (sin disco)
	state.chunks.clear();
	const before = Array.from(world.generateChunk(0, 0));
	state.chunks.clear();
	world.reinitNoise("otraSemilla");
	const after = Array.from(world.generateChunk(0, 0));
	Math.random = realRandom;
	world.setDiskLoader(null);
	world.reinitNoise(SEED); // restaurar el ruido por defecto
	check(
		"reinitNoise: semillas distintas generan mundos distintos",
		JSON.stringify(before) !== JSON.stringify(after),
		`len=${before.length}`
	);
}

// --- 11b) Nombre del mundo (Fase 7): switchWorld con name, persistencia en
// world.json y renombrado del mundo activo (misma semilla + nombre) ---
{
	const ROOT = path.join(TMP, "worldroot");
	const SEED_BAK = constants.worldPaths.currentSeed;
	fs.rmSync(ROOT, { recursive: true, force: true });
	fs.mkdirSync(ROOT, { recursive: true });
	state.chunks.clear();
	state.mobs = [];
	state.furnaces.clear();
	state.chests.clear();

	// Crear un mundo nuevo con nombre: se fija worldName y world.json lo guarda
	let r = save.switchWorld("mundo_nuevo", "Mi Mundo");
	check("switchWorld con nombre → true", r === true, `r=${r}`);
	check(
		"switchWorld fija el nombre activo (worldName)",
		constants.worldPaths.worldName === "Mi Mundo",
		constants.worldPaths.worldName
	);
	// ANTES del autosave (sin directorio ni world.json en disco todavía), la
	// lista ya incluye el mundo activo recién creado con su nombre en memoria.
	let w = save.listWorlds().find((x) => x.seed === "mundo_nuevo");
	check(
		"listWorlds incluye el mundo recién creado sin guardar (nombre en memoria)",
		!!w && w.name === "Mi Mundo" && w.chunkCount === 0,
		JSON.stringify(w)
	);
	save.saveWorld();
	const meta = JSON.parse(
		fs.readFileSync(constants.worldPaths.metaFile, "utf8")
	);
	check(
		"world.json guarda el nombre del mundo",
		meta.name === "Mi Mundo",
		`name=${meta.name}`
	);
	check("world.json conserva la semilla", meta.seed === "mundo_nuevo");

	// Al recargar el mundo se restaura el nombre (no se pierde por la semilla)
	state.chunks.clear();
	const loaded = save.loadWorld();
	check("loadWorld carga el mundo nombrado", loaded === true);
	check(
		"loadWorld restaura el nombre desde world.json",
		constants.worldPaths.worldName === "Mi Mundo",
		constants.worldPaths.worldName
	);

	// listWorlds lo expone con su nombre
	w = save.listWorlds().find((x) => x.seed === "mundo_nuevo");
	check(
		"listWorlds expone el nombre del mundo",
		!!w && w.name === "Mi Mundo",
		JSON.stringify(w)
	);

	// Renombrar el mundo ACTIVO: misma semilla + nombre nuevo → 'same' y persiste
	r = save.switchWorld("mundo_nuevo", "Nuevo Nombre");
	check("switchWorld misma semilla + nombre → same", r === "same", `r=${r}`);
	check(
		"same con nombre renombra el mundo activo",
		constants.worldPaths.worldName === "Nuevo Nombre",
		constants.worldPaths.worldName
	);
	const meta2 = JSON.parse(
		fs.readFileSync(constants.worldPaths.metaFile, "utf8")
	);
	check(
		"world.json se actualiza al renombrar",
		meta2.name === "Nuevo Nombre",
		`name=${meta2.name}`
	);

	// Sin nombre → la semilla actúa de nombre
	r = save.switchWorld("otro_mundo");
	check("switchWorld sin nombre → true", r === true, `r=${r}`);
	check(
		"sin nombre usa la semilla como nombre",
		constants.worldPaths.worldName === "otro_mundo",
		constants.worldPaths.worldName
	);

	// Sanidad: nombres con caracteres de control / espacios se limpian
	r = save.switchWorld("saneada", "  Mi\u0000Mundo  ");
	check("switchWorld con nombre sucio → true", r === true, `r=${r}`);
	check(
		"sanitizeWorldName limpia el nombre (control + espacios)",
		constants.worldPaths.worldName === "MiMundo",
		constants.worldPaths.worldName
	);

	// Restaurar el estado global para los tests siguientes
	state.chunks.clear();
	world.reinitNoise(SEED_BAK);
	constants.setWorldSeed(SEED_BAK);
	constants.worldPaths.worldName = SEED_BAK;
	check(
		"restaurado: worldName vuelve a la semilla activa",
		constants.worldPaths.worldName === SEED_BAK
	);
}

// --- 12) listWorlds: lista de mundos guardados (Fase 7, menú del cliente) ---
{
	constants.worldPaths.worldRoot = path.join(TMP, "worldroot");
	fs.rmSync(constants.worldPaths.worldRoot, { recursive: true, force: true });
	fs.mkdirSync(
		path.join(constants.worldPaths.worldRoot, "mi_mundo", "chunks"),
		{ recursive: true }
	);
	fs.mkdirSync(path.join(constants.worldPaths.worldRoot, "otro"), {
		recursive: true
	});
	const arr = new Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE).fill(0);
	fs.writeFileSync(
		path.join(constants.worldPaths.worldRoot, "mi_mundo", "chunks", "0_0.json"),
		JSON.stringify({ schemaVersion: SCHEMA_VERSION, cx: 0, cz: 0, data: arr })
	);
	fs.writeFileSync(
		path.join(constants.worldPaths.worldRoot, "mi_mundo", "chunks", "1_0.json"),
		JSON.stringify({ schemaVersion: SCHEMA_VERSION, cx: 1, cz: 0, data: arr })
	);
	fs.writeFileSync(
		path.join(constants.worldPaths.worldRoot, "mi_mundo", "world.json"),
		JSON.stringify({
			schemaVersion: SCHEMA_VERSION,
			seed: "Mi Semilla",
			name: "Mi Mundo",
			lastSaved: "2026-08-02T10:00:00.000Z"
		})
	);

	const worlds = save.listWorlds();
	// 2 directorios + el mundo ACTIVO (aún sin directorio) que la lista incluye
	// siempre con su nombre en memoria (Fase 7).
	check(
		"listWorlds: un mundo por directorio + el activo sin guardar",
		worlds.length === 3,
		`${worlds.length} mundos`
	);
	check(
		"listWorlds: incluye el mundo activo aunque no tenga directorio aún",
		worlds.some(
			(w) => w.seed === "miSemilla2026" && w.name === "miSemilla2026"
		),
		worlds.map((w) => w.seed).join(", ")
	);
	const miMundo = worlds.find((w) => w.seed === "Mi Semilla");
	check(
		"listWorlds: lee seed, name y chunkCount de world.json",
		!!miMundo && miMundo.name === "Mi Mundo" && miMundo.chunkCount === 2,
		JSON.stringify(miMundo)
	);
	check(
		"listWorlds: dir sin world.json usa el nombre del directorio",
		worlds.some((w) => w.name === "otro" && w.chunkCount === 0)
	);
	check(
		"listWorlds: ordena por lastSaved (más reciente primero)",
		worlds[0].seed === "Mi Semilla",
		worlds.map((w) => w.seed).join(", ")
	);
}

fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
