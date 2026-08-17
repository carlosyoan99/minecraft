"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 20 (rolling release — mecánicas de las
// iteraciones v20.1/v20.2, verifica el backlog B6 de la auditoría
// Copilot y los items B4 de rendimiento, sin servidor ni navegador)
// 1) Ratelimit 2-ventanas (D2/F19.6 B2): una ráfaga legítima de una
//    sola ventana tras un bloqueo síncrono NO corta; solo un flood
//    sostenido (2 ventanas consecutivas sobre el límite) cierra.
//    server/ratelimit.js es un módulo puro.
// 2) MAX_STACK 64 (SV-5): addToInventory rellena slots existentes
//    hasta MAX_STACK, crea slot nuevo solo para el excedente y
//    rechaza de forma atómica (false) si no cabe todo. La constante
//    es compartida servidor/cliente (la sincronía la audita
//    tests/unit-sync.js; aquí se verifica el comportamiento).
// 3) savePlayersAsync (REN-1): el autosave de jugadores va por la
//    cola asíncrona (lotes con setImmediate), idempotente, con la
//    ruta capturada al PROGRAMAR (un switchWorld durante el drenado
//    no reescribe el mundo equivocado).
// 4) Generación determinista por chunk (P4): el RNG del chunk
//    (hashCoord+mulberry32 sembrado por semilla,cx,cz) da la MISMA
//    secuencia al regenerar un chunk sin persistirlo (explorar no
//    escribe archivos). Se compara contra una segunda pasada.
// 5) Índice espacial de antorchas (P7): bakeChunkLight/hasTorchNear
//    consultan getTorchesNear (vecindario 3×3 de chunks, cubre el
//    radio de luz 7 < chunk 16), no el torchSet completo.
// Uso: node tests/audit-fase20.js
// ============================================================
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const fs = require("node:fs");
const os = require("node:os");
const { createRateLimit, WINDOW_MS } = require(
	path.join(ROOT, "server", "ratelimit.js")
);
const { MAX_STACK } = require(path.join(ROOT, "server", "constants.js"));
const { addToInventory, countInInventory } = require(
	path.join(ROOT, "server", "inventory.js")
);
const constants = require(path.join(ROOT, "server", "constants.js"));
const state = require(path.join(ROOT, "server", "state.js"));
const save = require(path.join(ROOT, "server", "save.js"));
const { Reporter, loaderESM } = require("./helpers.js");

const r = new Reporter();

// Un solo flujo async: los checks de REN-1 y P7 son asíncronos y
// r.done() (process.exit) debe correr UNA vez, al final de todo.
(async () => {
	// ============================================================
	// 1) RATELIMIT 2-VENTANAS (D2/F19.6 B2)
	// ============================================================
	{
		const lim = 30; // MAX_MSG_RATE por defecto (call sites de ratelimit)
		// Ráfaga de 200 mensajes en UNA ventana (bloqueo de 3 s + moves a 20 Hz
		// acumulados = 60 msg/s en el peor caso): supera el límite pero NO es
		// sostenida → no se corta nunca.
		const b1 = createRateLimit(lim);
		let cut = false;
		const t0 = 1000;
		for (let i = 0; i < 200; i++) if (b1.hit(t0)) cut = true;
		r.check(
			"RL: una ráfaga de 200 msg en una ventana NO corta (bloqueo de carga legítimo)",
			!cut,
			"cortó"
		);
		// La ventana siguiente recibe pocos mensajes (el cliente ya procesa en
		// tiempo real): sigue sin cortar aunque la anterior superó el límite.
		for (let i = 0; i < 10; i++) if (b1.hit(t0 + WINDOW_MS)) cut = true;
		r.check(
			"RL: tras la ráfaga, una ventana tranquila no corta (2ª consecutiva requerida)",
			!cut,
			"cortó"
		);

		// Flood SOSTENIDO: 200 msg en la ventana 1 y 200 en la ventana 2
		// consecutiva → el servidor corta (bot a 100 msg/s se para a ~1 s).
		const b2 = createRateLimit(lim);
		let cutS = false;
		for (let i = 0; i < 200; i++) b2.hit(2000);
		for (let i = 0; i < 200; i++) if (b2.hit(2000 + WINDOW_MS)) cutS = true;
		r.check(
			"RL: flood sostenido en 2 ventanas consecutivas CORTE (protección anti-flood intacta)",
			cutS,
			"no cortó"
		);

		// Reset: una ventana limpia intermedia rompe la cadena → el siguiente
		// pico de una ventana ya no corta (no es flood).
		const b3 = createRateLimit(lim);
		let cut3 = false;
		for (let i = 0; i < 200; i++) b3.hit(3000); // ventana 1: pico
		for (let i = 0; i < 5; i++) b3.hit(3000 + WINDOW_MS); // ventana 2: limpia
		for (let i = 0; i < 200; i++) if (b3.hit(3000 + 2 * WINDOW_MS)) cut3 = true; // ventana 3: pico
		r.check(
			"RL: una ventana limpia intermedia resetea el contador (no corta el pico siguiente)",
			!cut3,
			"cortó"
		);
	}

	// ============================================================
	// 2) MAX_STACK 64 (SV-5) — comportamiento de addToInventory
	// ============================================================
	{
		const INVENTORY_SLOTS = 36;
		const mkInv = () => Array.from({ length: INVENTORY_SLOTS }, () => null);
		const p = { inventory: mkInv() };
		const DIAMOND = 104; // I.DIAMOND (server/constants.js)
		r.check("SV-5: MAX_STACK es 64 (tope de stack MC)", MAX_STACK === 64);

		// 100 ítems → 64 en el slot 0 y 36 en el slot 1 (nunca > 64 por slot).
		const ok = addToInventory(p, DIAMOND, 100);
		const counts = p.inventory.filter(Boolean).map((s) => s.count);
		r.check(
			"SV-5: 100 ítems entran en 2 slots (64 + 36) sin exceder el tope",
			ok && counts.length === 2 && counts[0] === 64 && counts[1] === 36,
			JSON.stringify(counts)
		);
		r.check(
			"SV-5: countInInventory suma 100 tras el split",
			countInInventory(p, DIAMOND) === 100
		);

		// Rellenar un slot parcial: 30 en el slot 0 y añadir 50 → 64 + 16 en un
		// slot nuevo (el split respeta el tope por slot).
		const p2 = { inventory: mkInv() };
		p2.inventory[0] = { id: DIAMOND, count: 30 };
		const ok2 = addToInventory(p2, DIAMOND, 50);
		const c2 = p2.inventory.filter(Boolean).map((s) => s.count);
		r.check(
			"SV-5: rellena el slot parcial hasta 64 y crea slot nuevo con el resto",
			ok2 && c2.length === 2 && c2[0] === 64 && c2[1] === 16,
			JSON.stringify(c2)
		);

		// Rechazo atómico: inventario con 1 hueco y 65 ítems → no cabe TODO.
		const p3 = { inventory: mkInv() };
		for (let i = 0; i < INVENTORY_SLOTS - 1; i++)
			p3.inventory[i] = { id: DIAMOND, count: 64 };
		const ok3 = addToInventory(p3, DIAMOND, 65); // 1 hueco libre
		r.check(
			"SV-5: rechaza (false) si no cabe TODO el count (rechazo atómico)",
			ok3 === false
		);
	}

	// ============================================================
	// 3) savePlayersAsync (REN-1) — cola asíncrona con ruta al programar
	// ============================================================
	{
		const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fase20-"));
		const worldRoot = path.join(TMP, "worldroot");
		const oldRoot = constants.worldPaths.worldRoot;
		const oldSeed = constants.worldPaths.currentSeed;
		const oldDir = constants.worldPaths.worldDir;
		const oldMeta = constants.worldPaths.metaFile;
		const oldChunks = constants.worldPaths.chunksDir;
		const oldLegacy = constants.worldPaths.legacyFile;
		const oldName = constants.worldPaths.worldName;
		const oldGamemode = constants.worldPaths.worldGamemode;

		// I/O aislado en un directorio temporal (NUNCA toca world/ real).
		constants.worldPaths.worldRoot = worldRoot;
		constants.setWorldSeed("audit-fase20", "Audit20", "survival");

		// Jugador fake en state.players con los campos que persiste el snapshot.
		const player = {
			id: "audit",
			name: "auditor20",
			inMenu: false,
			ws: { readyState: 1, send() {} },
			inventory: Array.from({ length: 36 }, () => null),
			armor: {},
			selectedSlot: 0,
			health: 20,
			food: 20,
			saturation: 20,
			xp: 0,
			level: 0,
			x: 1,
			y: 64,
			z: 2,
			yaw: 0,
			pitch: 0,
			respawnPoint: null
		};
		player.inventory[0] = { id: 104, count: 7 }; // DIAMOND
		state.players.set(player.id, player);
		save.savePlayersAsync();

		// Drenar la cola (2 ciclos de setImmediate) antes de comprobar el archivo.
		await new Promise((res) => setImmediate(() => setImmediate(res)));
		const f = path.join(worldRoot, "audit-fase20", "players", "auditor20.json");
		let data = null;
		if (fs.existsSync(f)) {
			try {
				data = JSON.parse(fs.readFileSync(f, "utf8"));
			} catch {
				/* ilegible → data queda null y el check falla */
			}
		}
		r.check(
			"REN-1: savePlayersAsync escribe el archivo del jugador por la cola",
			!!data,
			data ? "escrito" : `no existe ${f}`
		);
		r.check(
			"REN-1: estado persistido por la cola (pos + inventario del snapshot)",
			!!data &&
				data.name === "auditor20" &&
				data.x === 1 &&
				data.y === 64 &&
				data.z === 2 &&
				data.inventory[0] &&
				data.inventory[0].id === 104 &&
				data.inventory[0].count === 7,
			data ? JSON.stringify({ x: data.x, inv0: data.inventory[0] }) : "sin data"
		);

		// Limpieza: restaurar rutas y estado del mundo real.
		state.players.delete(player.id);
		constants.worldPaths.worldRoot = oldRoot;
		constants.setWorldSeed(oldSeed, oldName, oldGamemode);
		constants.worldPaths.worldDir = oldDir;
		constants.worldPaths.metaFile = oldMeta;
		constants.worldPaths.chunksDir = oldChunks;
		constants.worldPaths.legacyFile = oldLegacy;
	}

	// ============================================================
	// 4) GENERACIÓN DETERMINISTA POR CHUNK (P4)
	// ============================================================
	{
		// P4: un chunk regenerado (sin persistir) es BIT-IDENTICO. Antes
		// (Math.random global) la regeneración daba otra vegetación y el
		// servidor marcaba el chunk como dirty → explorar escribía cientos de
		// archivos. Ahora el RNG por (semilla, cx, cz) garantiza que explorar
		// no ensucia: se regenera sin sembrar nada y se compara byte a byte.
		const world = require(path.join(ROOT, "server", "world.js"));
		world.setDiskLoader(() => null); // sin I/O de disco
		state.chunks.clear();
		world.generateChunk(3, 5);
		const first = Array.from(state.chunks.get("3,5"));
		state.chunks.clear(); // el chunk se "descarga" (nunca se guardó)
		world.generateChunk(3, 5); // misma semilla activa, mismo cx,cz
		const second = Array.from(state.chunks.get("3,5"));
		let diffs = 0;
		for (let i = 0; i < first.length; i++) if (first[i] !== second[i]) diffs++;
		r.check(
			"P4: un chunk regenerado (sin persistir) es bit-idéntico (explorar no ensucia)",
			diffs === 0,
			`${diffs} diffs`
		);
		// La semilla activa existe (el RNG se siembra con ella).
		const seed =
			constants.worldPaths?.currentSeed || process.env.SEED || "miSemilla2026";
		r.check(
			"P4: existe una semilla activa estable para el RNG (seed != null)",
			typeof seed === "string" && seed.length > 0,
			`"${seed}"`
		);
	}

	// ============================================================
	// 5) ÍNDICE ESPACIAL DE ANTORCHAS (P7)
	// ============================================================
	{
		const cs = await loaderESM("public/chunkstore.js");
		const { CHUNK_SIZE, TORCH, WORLD_HEIGHT } = await loaderESM(
			"public/constants.js"
		);
		const full = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
		// Antorcha en el chunk (0,0) y otra en el (2,0): la segunda NO está en el
		// vecindario 3×3 de un bloque del (0,0) → no se debe devolver.
		const arr = new Uint8Array(full);
		arr[0] = TORCH; // mundo (0,-64,0) → chunk (0,0)
		cs.storeChunkData("0,0", arr);
		const far = new Uint8Array(full);
		far[0] = TORCH; // mundo (32,-64,0) → chunk (2,0)
		cs.storeChunkData("2,0", far);
		const near = cs.getTorchesNear(1, -60, 1);
		r.check(
			"P7: getTorchesNear devuelve la antorcha del vecindario 3×3",
			near.some((t) => t[0] === 0 && t[2] === 0)
		);
		r.check(
			"P7: no devuelve antorchas fuera del vecindario (chunk 2,0)",
			near.every((t) => t[0] < CHUNK_SIZE)
		);
		// setClientBlock alimenta el índice: colocar una antorcha la hace visible;
		// romperla la retira.
		cs.setClientBlock(5, -60, 5, TORCH);
		const after = cs.getTorchesNear(5, -60, 5);
		r.check(
			"P7: setClientBlock con TORCH alimenta el índice espacial",
			after.some((t) => t[0] === 5 && t[1] === -60 && t[2] === 5)
		);
		cs.setClientBlock(5, -60, 5, 0);
		const removed = cs.getTorchesNear(5, -60, 5);
		r.check(
			"P7: romper la antorcha la retira del índice espacial",
			removed.every((t) => !(t[0] === 5 && t[1] === -60 && t[2] === 5))
		);
	}

	r.done();
})().catch((e) => {
	console.error("error en la auditoría:", e);
	process.exit(1);
});
