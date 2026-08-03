"use strict";
// E2E del cofre (Fase 6) — ciclo de vida completo por WebSocket:
//   1) /give 8 tablones → craftear el cofre (patrón ["###","# #","###"])
//   2) Encontrar una celda de aire cerca (con suelo) y COLOCAR el cofre
//   3) chest_open → chest_state con 27 slots
//   4) /give 5 adoquines → chest_action put → el cofre los guarda
//   5) chest_action take → vuelven al inventario (slot del cofre vacío)
//   6) chest_action close → se cierra
//   7) break → la minería fina rompe el cofre (~1.5s a mano) y el item
//      vuelve al inventario (drop) con block_update de aire
//
// Requiere un servidor vivo: WS_URL (por defecto ws://localhost:3998).
// Ejecutar contra un servidor DESECHABLE (modifica el mundo: coloca y rompe
// un cofre cerca del spawn).
const WebSocket = require("ws");
const URL = process.env.WS_URL || "ws://localhost:3998";

const CHEST = 22,
	PLANKS = 7,
	COBBLESTONE = 8,
	AIR = 0,
	WATER = 20;
const REACH = 6.0; // el servidor rechaza acciones a > 7 bloques
const WORLD_H = 64;

const results = [];
let finished = false;
const t0 = Date.now();
const worldMap = new Map(); // "cx,cz" -> array de ids (init + chunks_add)
let cur = { x: 0, y: 64, z: 0 }; // posición conocida del jugador
let phase = "init";
let chestSlot = -1; // slot del cofre en el inventario
let placeAt = null; // {x,y,z} donde se colocó el cofre
let breaksSent = false; // ¿se envió el break del cofre?
let takeInventoryOk = false; // ¿el inventory_update del take confirmó el adoquín?

function check(name, ok, info) {
	results.push({ name, ok });
	console.log(
		`${ok ? "PASS" : "FAIL"}: ${name}${info ? "  (" + info + ")" : ""}`
	);
}
function finish(exitCode) {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	const fails = results.filter((r) => r.ok === false).length;
	console.log(`\nRESULTADO: ${results.length - fails}/${results.length} OK`);
	process.exit(exitCode !== undefined ? exitCode : fails ? 1 : 0);
}
const timer = setTimeout(() => {
	console.log(
		`[t=${Math.round((Date.now() - t0) / 1000)}s] TIMEOUT en fase=${phase}`
	);
	finish(1);
}, 60000);

// ============================================================
// HELPERS SOBRE EL CHUNKDATA (mismo idx que world.js: (y*16+z)*16+x)
// ============================================================
function blockAt(wx, wy, wz) {
	if (wy < 0 || wy >= WORLD_H) return AIR;
	const arr = worldMap.get(`${Math.floor(wx / 16)},${Math.floor(wz / 16)}`);
	if (!arr) return -1; // desconocido
	const x = ((wx % 16) + 16) % 16,
		z = ((wz % 16) + 16) % 16;
	return arr[(wy * 16 + z) * 16 + x];
}

// Celda de aire (con bloque sólido DEBAJO) a <= REACH del jugador, para
// colocar el cofre sin que quede flotando. Prioriza cerca de la altura del
// jugador (el spawn está sobre terreno firme).
function airWithGroundNear(x, y, z) {
	const candidates = [];
	for (let dy = -2; dy <= 3; dy++) {
		for (let dx = -3; dx <= 3; dx++) {
			for (let dz = -3; dz <= 3; dz++) {
				const wx = Math.floor(x) + dx,
					wy = Math.floor(y) + dy,
					wz = Math.floor(z) + dz;
				if (Math.hypot(wx - x, wy - y, wz - z) > REACH) continue;
				const b = blockAt(wx, wy, wz);
				if (b !== AIR && b !== WATER) continue; // la celda debe estar libre
				const below = blockAt(wx, wy - 1, wz);
				if (below === AIR || below === WATER || below === -1) continue; // necesita suelo
				candidates.push({ x: wx, y: wy, z: wz });
			}
		}
	}
	candidates.sort(
		(a, b) =>
			Math.hypot(a.x - x, a.y - y, a.z - z) -
			Math.hypot(b.x - x, b.y - y, b.z - z)
	);
	return candidates[0] || null;
}

function send(event, data) {
	ws.send(JSON.stringify({ event, data }));
}

const ws = new WebSocket(URL);
ws.on("message", (d) => {
	let m;
	try {
		m = JSON.parse(d);
	} catch {
		return;
	}
	const t = Math.round((Date.now() - t0) / 1000);

	// ============ INIT: guardar el mundo y pedir tablones ============
	if (phase === "init" && m.event === "init") {
		cur = { x: m.data.spawnX, y: m.data.spawnY, z: m.data.spawnZ };
		for (const [key, arr] of Object.entries(m.data.chunkData))
			worldMap.set(key, arr);
		send("chat", { message: "/give 7 8" }); // 8 tablones para el cofre
		phase = "give-tablones";
		console.log(`[t=${t}s] pidiendo 8 tablones...`);
		return;
	}

	if (m.event === "chunks_add") {
		for (const [key, arr] of Object.entries(m.data.chunkData))
			worldMap.set(key, arr);
		return;
	}

	// ============ GIVE TABLONES → CRAFT DEL COFRE ============
	if (phase === "give-tablones" && m.event === "inventory_update") {
		const planks = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === PLANKS ? s.count : 0),
			0
		);
		if (planks < 8) return; // esperar a que llegue el /give
		check(
			"se obtienen 8 tablones (/give 7 8)",
			planks >= 8,
			`tablones=${planks}`
		);
		// Craftear el cofre: ["###","# #","###"] → 8 tablones alrededor del centro
		const grid = new Array(9).fill(null);
		for (let i = 0; i < 9; i++) if (i !== 4) grid[i] = { id: PLANKS, count: 1 };
		send("craft", { grid });
		phase = "craft";
		return;
	}

	// ============ CRAFT → SELECT + COLOCAR ============
	if (phase === "craft" && m.event === "inventory_update") {
		const idx = m.data.inventory.findIndex((s) => s && s.id === CHEST);
		if (idx === -1) return;
		check("el cofre se craftea (ID 22)", true, `slot=${idx}`);
		chestSlot = idx;
		send("inventory_select", { slot: idx });
		const spot = airWithGroundNear(cur.x, cur.y, cur.z);
		if (!spot) {
			check(
				"hay una celda de aire con suelo para colocar el cofre",
				false,
				"sin sitio cerca"
			);
			finish(1);
			return;
		}
		check(
			"hay una celda de aire con suelo para colocar el cofre",
			true,
			`${spot.x},${spot.y},${spot.z}`
		);
		placeAt = spot;
		send("block_action", {
			action: "place",
			x: spot.x,
			y: spot.y,
			z: spot.z,
			itemId: CHEST
		});
		phase = "place";
		return;
	}

	// ============ PLACE → OPEN ============
	if (phase === "place" && m.event === "block_update") {
		if (
			!placeAt ||
			m.data.x !== placeAt.x ||
			m.data.y !== placeAt.y ||
			m.data.z !== placeAt.z
		)
			return;
		check(
			"el cofre se coloca en el mundo (block_update)",
			m.data.block === CHEST,
			`block=${m.data.block}`
		);
		send("chest_open", placeAt);
		phase = "open";
		return;
	}

	// ============ OPEN → GIVE ADOQUINES + PUT ============
	if (phase === "open" && m.event === "chest_state") {
		check(
			"chest_state con 27 slots",
			Array.isArray(m.data.slots) && m.data.slots.length === 27,
			m.data.slots.length + " slots"
		);
		check(
			"el cofre está vacío al abrirlo",
			m.data.slots.every((s) => s === null)
		);
		send("chat", { message: "/give 8 5" }); // 5 adoquines para probar put/take
		phase = "give-adoquin";
		return;
	}

	if (phase === "give-adoquin" && m.event === "inventory_update") {
		const cobble = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === COBBLESTONE ? s.count : 0),
			0
		);
		if (cobble < 5) return;
		const idx = m.data.inventory.findIndex((s) => s && s.id === COBBLESTONE);
		check(
			"se obtienen 5 adoquines (/give 8 5)",
			cobble >= 5,
			`adoquín=${cobble}`
		);
		send("chest_action", { action: "put", invSlot: idx });
		phase = "put";
		return;
	}

	// ============ PUT → TOMAR (TAKE) ============
	if (phase === "put" && m.event === "chest_state") {
		const stored = m.data.slots.filter((s) => s && s.id === COBBLESTONE);
		check(
			"put: los 5 adoquines quedan guardados en el cofre",
			stored.length === 1 && stored[0].count === 5,
			JSON.stringify(m.data.slots.filter(Boolean).map((s) => [s.id, s.count]))
		);
		const chestIdx = m.data.slots.findIndex((s) => s && s.id === COBBLESTONE);
		takeInventoryOk = false;
		send("chest_action", { action: "take", chestSlot: chestIdx });
		phase = "take";
		return;
	}

	// El servidor envía inventory_update (sendInventory) ANTES del chest_state
	// del take: primero verificamos que el adoquín volvió al inventario y luego
	// (al llegar el chest_state) que el slot del cofre quedó vacío y cerramos.
	if (phase === "take" && m.event === "inventory_update") {
		const cobble = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === COBBLESTONE ? s.count : 0),
			0
		);
		if (cobble < 5) return; // esperar el inventory_update del take
		takeInventoryOk = true;
		return;
	}

	if (phase === "take" && m.event === "chest_state") {
		check(
			"take: el slot del cofre queda vacío",
			m.data.slots.every((s) => s === null)
		);
		check(
			"take: los adoquines vuelven al inventario",
			takeInventoryOk,
			takeInventoryOk
				? "adoquín confirmado por inventory_update"
				: "sin inventory_update con el adoquín"
		);
		send("chest_action", { action: "close" });
		phase = "close";
		return;
	}

	// ============ CLOSE → ROMPER EL COFRE ============
	if (phase === "close" && m.event === "chest_state") {
		// El close responde otro chest_state; solo avanzar tras confirmar el cierre
		send("block_action", {
			action: "break",
			x: placeAt.x,
			y: placeAt.y,
			z: placeAt.z
		});
		breaksSent = true;
		phase = "break";
		console.log(`[t=${t}s] rompiendo el cofre (minería fina ~1.5s a mano)...`);
		return;
	}

	// El break devuelve block_update (cofre → aire) y, al completarse la
	// minería, inventory_update con el cofre de vuelta (drop).
	if (phase === "break" && m.event === "block_update") {
		if (
			m.data.x === placeAt.x &&
			m.data.y === placeAt.y &&
			m.data.z === placeAt.z
		) {
			check(
				"break: el cofre se convierte en aire",
				m.data.block === AIR,
				`block=${m.data.block}`
			);
		}
		return;
	}
	if (phase === "break" && m.event === "inventory_update") {
		const back = m.data.inventory.some((s) => s && s.id === CHEST);
		check(
			"break: el cofre cae como item al inventario (drop con la mano)",
			back
		);
		if (back) {
			phase = "done";
			finish();
		}
		return;
	}

	// Esperar a que el /give del inicio confirme antes de seguir (los chat de
	// sistema llegan entre medias; los ignoramos salvo fallos de /give).
	if (
		m.event === "chat" &&
		m.data.id === "Server" &&
		m.data.message.includes("Item desconocido")
	) {
		check("comandos /give disponibles", false, m.data.message);
		finish(1);
	}
});
ws.on("error", (e) => {
	console.log("WS ERROR: " + e.message);
	finish(1);
});
