"use strict";
// E2E del cofre (Fase 6) — ciclo de vida completo por WebSocket:
//   1) /give 8 tablones → craftear el cofre (patrón ["###","# #","###"])
//   2) Encontrar una celda de aire cerca (con suelo) y COLOCAR el cofre
//   3) chest_open → chest_state con 27 slots
//   4) /give 5 adoquines → chest_action put → el cofre los guarda
//   5) chest_action take → vuelven al inventario (slot del cofre vacío)
//   6) Fase 16 (G4/B2): dejar 1 adoquín DENTRO, cerrar y romper el cofre
//      CON contenido → el item cae al inventario y el contenido también
//      (drops) con block_update de aire
//   7) Fase 16 (G4/B5): roundtrip recipe_book — el servidor responde las
//      tablas de crafteo y horno
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
let _chestSlot = -1; // slot del cofre en el inventario
let placeAt = null; // {x,y,z} donde se colocó el cofre
let _breaksSent = false; // ¿se envió el break del cofre?
let takeInventoryOk = false; // ¿el inventory_update del take confirmó el adoquín?
// G4 (B2): inventario del take — capturar el conteo de adoquines previo al
// put-drop (el break debe devolver el inventario a ese mismo conteo: el
// adoquín metido en el cofre cae al romperlo) y el slot para re-meterlo.
let _cobbleBefore = 0;
let _cobbleSlot = -1;

function check(name, ok, _info) {
	results.push({ name, ok });
}
function finish(exitCode) {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	const fails = results.filter((r) => r.ok === false).length;
	process.exit(exitCode !== undefined ? exitCode : fails ? 1 : 0);
}
const timer = setTimeout(() => {
	// Diagnóstico al expirar: sin esto un timeout moría sin decir qué faltó.
	console.error(
		`⏰ TIMEOUT E2E (${Math.round((Date.now() - t0) / 1000)}s): fase "${phase}", ${results.length} checks (${results.filter((r) => r.ok === false).length} FAIL)`
	);
	for (const r of results) console.error(`  ${r.ok ? "OK" : "FAIL"} ${r.name}`);
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

// Fase 10 (A6: lagos profundos en la generación): el spawn de una semilla
// nueva puede caer EN MEDIO de un lago (columna de aire sobre agua, sin suelo
// a mano). El test necesita terreno firme para colocar el cofre: si no hay
// celda aire+suelo a <= REACH, se usa /tp hacia la columna de tierra firme
// más cercana del chunkData y se reintenta desde allí (el servidor acepta /tp
// para jugadores: ver commands.js).
function nearestSolidColumn() {
	let best = null;
	for (const [key, arr] of worldMap) {
		const [cx, cz] = key.split(",").map(Number);
		for (let wx = cx * 16; wx < cx * 16 + 16; wx++) {
			for (let wz = cz * 16; wz < cz * 16 + 16; wz++) {
				const lx = ((wx % 16) + 16) % 16,
					lz = ((wz % 16) + 16) % 16;
				// Superficie sólida: primer bloque no aire/agua/lava bajando.
				let solidY = null;
				for (let wy = WORLD_H - 1; wy >= 0; wy--) {
					const id = arr[(wy * 16 + lz) * 16 + lx];
					if (id === AIR || id === WATER) continue;
					solidY = wy;
					break;
				}
				if (solidY === null) continue;
				const d = Math.hypot(wx - cur.x, wz - cur.z);
				if (!best || d < best.d) best = { x: wx, y: solidY, z: wz, d };
			}
		}
	}
	return best;
}

let _tpPending = false; // evita reintentos en bucle si el /tp no llega

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
	const _t = Math.round((Date.now() - t0) / 1000);

	// ============ INIT: guardar el mundo y pedir tablones ============
	if (phase === "init" && m.event === "init") {
		cur = { x: m.data.spawnX, y: m.data.spawnY, z: m.data.spawnZ };
		for (const [key, arr] of Object.entries(m.data.chunkData))
			worldMap.set(key, arr);
		send("chat", { message: "/give 7 8" }); // 8 tablones para el cofre
		phase = "give-tablones";
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
		// Craftear el cofre: ["###","# #","###"] → 8 tablones alrededor del centro.
		// Auditoría 2026-08-09 (§1.2): `craft` ya NO acepta data.grid — la grid
		// es siempre la del servidor (p.craftingGrid), llenada vía grid_set
		// (descuenta ítems reales del inventario). Se replica el flujo del
		// cliente: 8 grid_set (celdas 0,1,2,3,5,6,7,8) + craft.
		const planksSlot = m.data.inventory.findIndex((s) => s && s.id === PLANKS);
		// grid_set descuenta de un SOLO slot; si los 8 tablones están repartidos
		// en varios slots (mundo reutilizado), la grid quedaría incompleta y el
		// craft nunca dispararía — fallar claro en vez de un timeout mudo.
		if (planksSlot === -1 || (m.data.inventory[planksSlot].count || 0) < 8) {
			check(
				"hay 8 tablones en un solo slot para la grid del cofre",
				false,
				`slot=${planksSlot}`
			);
			finish(1);
			return;
		}
		for (let i = 0; i < 9; i++)
			if (i !== 4)
				send("grid_set", { fromInventorySlot: planksSlot, toGridSlot: i });
		send("craft", {});
		phase = "craft";
		return;
	}

	// ============ CRAFT → SELECT + COLOCAR ============
	if (phase === "craft" && m.event === "inventory_update") {
		const idx = m.data.inventory.findIndex((s) => s && s.id === CHEST);
		if (idx === -1) return;
		check("el cofre se craftea (ID 22)", true, `slot=${idx}`);
		_chestSlot = idx;
		send("inventory_select", { slot: idx });
		const spot = airWithGroundNear(cur.x, cur.y, cur.z);
		if (!spot && !_tpPending) {
			// Spawn en medio del agua (Fase 10): ir a tierra firme y reintentar.
			const target = nearestSolidColumn();
			if (target) {
				check(
					"spawn acuático → /tp a la tierra más cercana",
					true,
					`${target.x},${target.y},${target.z}`
				);
				_tpPending = true;
				send("chat", {
					message: `/tp ${target.x} ${target.y + 2} ${target.z}`
				});
				return; // el teleport re-dispara este bloque (fase craft)
			}
		}
		if (!spot) {
			check(
				"hay una celda de aire con suelo para colocar el cofre",
				false,
				"sin sitio cerca"
			);
			finish(1);
			return;
		}
		_tpPending = false;
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

	// ============ TELEPORT: corregir cur y, si era el /tp a tierra firme,
	// reintentar la colocación del cofre desde la nueva posición ============
	if (m.event === "teleport") {
		cur = { x: m.data.x, y: m.data.y, z: m.data.z };
		if (_tpPending) {
			_tpPending = false;
			const spot = airWithGroundNear(cur.x, cur.y, cur.z);
			if (spot) {
				placeAt = spot;
				send("block_action", {
					action: "place",
					x: spot.x,
					y: spot.y,
					z: spot.z,
					itemId: CHEST
				});
				phase = "place";
			} else {
				// Tierra aún sin celda válida (p. ej. el target era agua): fallo claro
				check(
					"hay una celda de aire con suelo para colocar el cofre",
					false,
					"sin sitio ni tras /tp a tierra"
				);
				finish(1);
			}
		}
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
			`${m.data.slots.length} slots`
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
		_cobbleBefore = cobble;
		_cobbleSlot = m.data.inventory.findIndex((s) => s && s.id === COBBLESTONE);
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
		// Fase 16 (G4/B2): dejar la pila de adoquines DENTRO antes de romper —
		// al romper un cofre el servidor reparte su contenido al inventario
		// (players.js). El put mueve la pila COMPLETA (como el shift-click de
		// Minecraft): el cofre se queda con los 5 y el inventario con 0.
		if (_cobbleSlot === -1) {
			check("put-drop: hay adoquín en el inventario para dejar dentro", false);
			finish(1);
			return;
		}
		send("chest_action", { action: "put", invSlot: _cobbleSlot });
		phase = "put-drops";
		return;
	}

	// ============ PUT-DROPS → CERRAR → ROMPER EL COFRE CON CONTENIDO ============
	if (phase === "put-drops" && m.event === "chest_state") {
		const stored = m.data.slots.filter((s) => s && s.id === COBBLESTONE);
		check(
			"put-drops: el cofre guarda la pila de adoquines antes de romper",
			stored.length === 1 && stored[0].count === _cobbleBefore,
			JSON.stringify(m.data.slots.filter(Boolean).map((s) => [s.id, s.count]))
		);
		send("chest_action", { action: "close" });
		phase = "close-full";
		return;
	}

	if (phase === "close-full" && m.event === "chest_state") {
		// El close responde otro chest_state; romper el cofre (aún con contenido)
		send("block_action", {
			action: "break",
			x: placeAt.x,
			y: placeAt.y,
			z: placeAt.z
		});
		_breaksSent = true;
		phase = "break-full";
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
		_breaksSent = true;
		phase = "break";
		return;
	}

	// El break devuelve block_update (cofre → aire) y, al completarse la
	// minería, inventory_update con el cofre de vuelta (drop) y el CONTENIDO
	// (Fase 16, G4/B2): la pila guardada (5) cae al romper el cofre — el
	// inventario vuelve al conteo previo (_cobbleBefore). Si el contenido NO
	// cayera, el conteo sería 0 (el put vació el inventario).
	if (phase === "break-full" && m.event === "block_update") {
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
	if (phase === "break-full" && m.event === "inventory_update") {
		const back = m.data.inventory.some((s) => s && s.id === CHEST);
		const cobble = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === COBBLESTONE ? s.count : 0),
			0
		);
		check(
			"break: el cofre cae como item al inventario (drop con la mano)",
			back
		);
		check(
			"break: el contenido del cofre cae al romperlo (drops)",
			cobble === _cobbleBefore,
			`adoquín=${cobble} (esperado ${_cobbleBefore})`
		);
		if (back) {
			// Fase 16 (G4/B5): roundtrip del libro de recetas — el servidor
			// responde las tablas completas al mismo socket. IMPORTANTE: data
			// debe ser objeto ({} como el send del cliente) — la guardia del
			// handler descarta mensajes sin data.
			send("recipe_book", {});
			phase = "recipe-book";
		}
		return;
	}

	// ============ RECIPE BOOK (G4/B5): abrir (pedir tablas) y verificar ============
	if (phase === "recipe-book" && m.event === "recipe_book") {
		const c = m.data?.crafting;
		const f = m.data?.furnace;
		check(
			"recipe_book: el servidor responde las tablas de crafteo",
			c && typeof c === "object" && Object.keys(c).length > 0,
			`${c ? Object.keys(c).length : 0} recetas`
		);
		check(
			"recipe_book: el servidor responde las tablas de horno",
			f && typeof f === "object" && Object.keys(f).length > 0,
			`${f ? Object.keys(f).length : 0} recetas`
		);
		phase = "done";
		finish();
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
ws.on("error", (_e) => {
	finish(1);
});
