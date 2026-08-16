"use strict";
// ============================================================
// TESTS UNITARIOS DEL COFRE (Fase 6)
// Cubre la lógica del servidor (chests.js + handlers de red):
//   1) chests.getOrCreateChest / chestSnapshot / restoreChests
//   2) chest_open: valida distancia y que el bloque sea un cofre
//   3) chest_action put/take/close: mover items entre el cofre y
//      el inventario (apilado, cofre lleno, inventario lleno)
//   4) Receta del cofre (8 tablones alrededor, centro vacío)
//   5) finishMining: al romper un cofre se elimina su estado
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const chests = require("../server/chests.js");
const playerHelpers = require("../server/players.js");
const { B, I } = require("../server/constants.js");

// Forzar generación fresca (sin leer el world/ real del proyecto).
world.setDiskLoader(() => null);

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		fails++;
		failedChecks.push(_name);
	}
};

// --- ws fake: captura mensajes salientes y permite inyectar entrantes ---
class FakeWS {
	constructor() {
		this.sent = [];
		this.handlers = {};
		this.readyState = 1; // WebSocket.OPEN
	}
	send(str) {
		this.sent.push(JSON.parse(str));
	}
	on(ev, fn) {
		this.handlers[ev] = fn;
	}
	emit(ev, data) {
		if (this.handlers[ev]) this.handlers[ev](data);
	}
	events(name) {
		return this.sent.filter((m) => m.event === name);
	}
}

function connect() {
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	const player = state.players.get(init.data.playerId);
	return { ws, init, player };
}

// ============================================================
// 1) CHESTS.JS: getOrCreateChest / snapshot / restore
// ============================================================
{
	state.chests.clear();
	const c1 = chests.getOrCreateChest("1,2,3");
	check(
		"getOrCreateChest crea 27 slots vacíos",
		Array.isArray(c1) && c1.length === 27 && c1.every((s) => s === null)
	);
	check(
		"getOrCreateChest es idempotente (misma instancia)",
		chests.getOrCreateChest("1,2,3") === c1
	);

	c1[0] = { id: I.COOKED_BEEF, count: 3 };
	c1[5] = { id: I.WOODEN_PICKAXE, count: 1, durability: 30 };
	const snap = chests.chestSnapshot(c1);
	check(
		"chestSnapshot copia los slots (sin referencias)",
		snap !== c1 && snap[0] !== c1[0] && snap[0].id === I.COOKED_BEEF
	);
	snap[0].count = 99; // mutar la copia no toca el estado real
	check(
		"chestSnapshot aísla el estado (mutación no afecta)",
		c1[0].count === 3
	);

	// restoreChests: repone del guardado y tolera arrays cortos/dados
	const saved = [["1,2,3", [{ id: I.DIAMOND, count: 1 }]]];
	chests.restoreChests(saved);
	const restored = chests.getOrCreateChest("1,2,3");
	check(
		"restoreChests restaura con 27 slots (rellena el resto con null)",
		restored.length === 27 &&
			restored[0].id === I.DIAMOND &&
			restored[1] === null
	);
	chests.restoreChests(null);
	check(
		"restoreChests con null limpia (defensivo)",
		chests.getOrCreateChest("1,2,3")[0] === null
	);
}

// ============================================================
// 2) CHEST_OPEN: valida distancia y bloque
// ============================================================
const { ws, player: p } = connect();
{
	const cx = Math.floor(p.x + 3),
		cy = Math.floor(p.y),
		cz = Math.floor(p.z);
	const key = `${cx},${cy},${cz}`;
	world.setBlock(cx, cy, cz, B.CHEST);

	// Abrir un cofre real → chest_state con 27 slots
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({ event: "chest_open", data: { x: cx, y: cy, z: cz } })
	);
	const st = ws.events("chest_state")[0];
	check(
		"chest_open envía chest_state con 27 slots",
		st && Array.isArray(st.data.slots) && st.data.slots.length === 27,
		st ? `${st.data.slots.length}` : "sin estado"
	);
	check("chest_open registra el cofre abierto (clave)", p.openChest === key);

	// Bloque que NO es cofre → rechazado
	world.setBlock(cx + 1, cy, cz, B.STONE);
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({ event: "chest_open", data: { x: cx + 1, y: cy, z: cz } })
	);
	check(
		"chest_open sobre no-cofre → rechazado (sin chest_state)",
		ws.events("chest_state").length === 0 && p.openChest === key
	);

	// A >7 bloques → rechazado
	const farX = Math.floor(p.x) + 10;
	world.setBlock(farX, cy, cz, B.CHEST);
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({ event: "chest_open", data: { x: farX, y: cy, z: cz } })
	);
	check(
		"chest_open a >7 bloques → rechazado",
		ws.events("chest_state").length === 0 && p.openChest === key
	);
}

// ============================================================
// 3) CHEST_ACTION: PUT / TAKE / CLOSE
// ============================================================
{
	const cx = Math.floor(p.x + 3),
		cy = Math.floor(p.y),
		cz = Math.floor(p.z);
	const key = `${cx},${cy},${cz}`;
	const c = chests.getOrCreateChest(key);
	c.fill(null); // cofre limpio para el test

	// --- put: guardar items del inventario en el cofre (apila iguales) ---
	p.inventory[0] = { id: B.PLANKS, count: 5 };
	p.inventory[1] = { id: I.WOODEN_PICKAXE, count: 1, durability: 45 };
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 0 }
		})
	);
	check(
		"put mueve los 5 tablones al cofre",
		c[0] && c[0].id === B.PLANKS && c[0].count === 5,
		JSON.stringify(c[0])
	);
	check("put vacía el slot del inventario", p.inventory[0] === null);

	// Segundo put de tablones → apila en el mismo slot del cofre
	p.inventory[0] = { id: B.PLANKS, count: 2 };
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 0 }
		})
	);
	check(
		"put apila items iguales en el cofre (5+2=7)",
		c[0].count === 7,
		`count=${c[0].count}`
	);

	// put de herramienta → conserva su durabilidad (no se apila)
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 1 }
		})
	);
	const pickInChest = c.find((s) => s && s.id === I.WOODEN_PICKAXE);
	check(
		"put conserva la durabilidad de la herramienta",
		pickInChest && pickInChest.durability === 45,
		JSON.stringify(pickInChest)
	);
	check(
		"put envía chest_state actualizado + inventory_update",
		ws.events("chest_state").length >= 3 &&
			ws.events("inventory_update").length >= 3
	);

	// --- cofre lleno → put rechazado (no se pierde el item) ---
	c.forEach((s, i) => {
		c[i] = s || { id: B.DIRT, count: 1 };
	});
	p.inventory[2] = { id: B.COBBLESTONE, count: 1 };
	const beforeFull = p.inventory[2].count;
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 2 }
		})
	);
	check(
		"put con cofre lleno → no consume el item",
		p.inventory[2] && p.inventory[2].count === beforeFull
	);

	// --- take: recuperar items (inventario lleno → rechazado) ---
	c.forEach((_s, i) => {
		c[i] = null;
	}); // vaciar para no llenar el inventario del jugador
	c[0] = { id: I.DIAMOND, count: 3 };
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "take", chestSlot: 0 }
		})
	);
	check(
		"take mueve el item al inventario",
		p.inventory.some((s) => s && s.id === I.DIAMOND && s.count === 3)
	);
	check("take vacía el slot del cofre", c[0] === null);

	// --- Fase 19 (D2): put/take con destino EXPLÍCITO (drag & drop) ---
	c.fill(null);
	p.inventory = new Array(36).fill(null);
	ws.sent.length = 0;
	p.inventory[4] = { id: B.COBBLESTONE, count: 2 };
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 4, chestSlot: 10 }
		})
	);
	check(
		"put con chestSlot explícito coloca en ESE slot",
		c[10] && c[10].id === B.COBBLESTONE && c[10].count === 2,
		JSON.stringify(c[10])
	);
	check("put con chestSlot explícito no toca el primer hueco", c[0] === null);
	check(
		"put con chestSlot explícito vacía el inventario",
		p.inventory[4] === null
	);
	// put a un slot ocupado con OTRO ítem → rechazado (no lo pisa)
	p.inventory[4] = { id: B.DIRT, count: 1 };
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 4, chestSlot: 10 }
		})
	);
	check(
		"put a slot ocupado con otro ítem → no lo pisa ni consume",
		c[10].id === B.COBBLESTONE && p.inventory[4] !== null
	);
	// put con chestSlot fuera de rango → ignorado
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 4, chestSlot: 99 }
		})
	);
	check("put con chestSlot fuera de rango se ignora", p.inventory[4] !== null);
	// take con invSlot explícito → cae en ESE slot del inventario
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "take", chestSlot: 10, invSlot: 7 }
		})
	);
	check(
		"take con invSlot explícito coloca en ESE slot",
		p.inventory[7] &&
			p.inventory[7].id === B.COBBLESTONE &&
			p.inventory[7].count === 2,
		JSON.stringify(p.inventory[7])
	);
	check("take con invSlot explícito vacía el cofre", c[10] === null);

	// --- close ---
	ws.emit(
		"message",
		JSON.stringify({ event: "chest_action", data: { action: "close" } })
	);
	check("close cierra el cofre", p.openChest === null);

	// --- chest_action sin cofre abierto → rechazado (no mueve nada) ---
	p.inventory[3] = { id: B.DIRT, count: 1 };
	const dirtInChestBefore = c.filter((s) => s && s.id === B.DIRT).length;
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 3 }
		})
	);
	check(
		"chest_action sin cofre abierto → rechazado (no mueve items)",
		p.inventory[3] &&
			p.inventory[3].count === 1 &&
			c.filter((s) => s && s.id === B.DIRT).length === dirtInChestBefore,
		`inv=${JSON.stringify(p.inventory[3])} dirtChest=${c.filter((s) => s && s.id === B.DIRT).length}`
	);
	p.inventory[3] = null;

	// --- Herramientas en el cofre: NUNCA se apilan (cada una con su durabilidad) ---
	{
		p.openChest = key;
		c.fill(null);
		p.inventory[0] = { id: I.WOODEN_PICKAXE, count: 1, durability: 30 };
		p.inventory[1] = { id: I.WOODEN_PICKAXE, count: 1, durability: 10 };
		ws.emit(
			"message",
			JSON.stringify({
				event: "chest_action",
				data: { action: "put", invSlot: 0 }
			})
		);
		ws.emit(
			"message",
			JSON.stringify({
				event: "chest_action",
				data: { action: "put", invSlot: 1 }
			})
		);
		const picks = c.filter((s) => s && s.id === I.WOODEN_PICKAXE);
		check(
			"put de 2 picos de madera → 2 slots separados (no se apilan)",
			picks.length === 2 && picks.every((s) => s.count === 1),
			JSON.stringify(picks.map((s) => [s.count, s.durability]))
		);
		check(
			"cada pico conserva su propia durabilidad",
			picks.some((s) => s.durability === 30) &&
				picks.some((s) => s.durability === 10),
			JSON.stringify(picks.map((s) => s.durability))
		);
		// Take de uno: vuelve al inventario íntegro (sin perder el segundo)
		ws.emit(
			"message",
			JSON.stringify({
				event: "chest_action",
				data: {
					action: "take",
					chestSlot: c.findIndex((s) => s && s.durability === 30)
				}
			})
		);
		const picksInv = p.inventory.filter((s) => s && s.id === I.WOODEN_PICKAXE);
		check(
			"take de un pico del cofre → devuelve 1 pico con su durabilidad (el otro sigue en el cofre)",
			picksInv.length === 1 &&
				picksInv[0].durability === 30 &&
				c.filter((s) => s && s.id === I.WOODEN_PICKAXE).length === 1,
			`inv=${JSON.stringify(picksInv.map((s) => [s.count, s.durability]))}`
		);
		// Restaurar: devolver el pico restante al inventario y cerrar
		ws.emit(
			"message",
			JSON.stringify({
				event: "chest_action",
				data: {
					action: "take",
					chestSlot: c.findIndex((s) => s && s.id === I.WOODEN_PICKAXE)
				}
			})
		);
		ws.emit(
			"message",
			JSON.stringify({ event: "chest_action", data: { action: "close" } })
		);
		p.openChest = null;
		c.fill(null);
		p.inventory.fill(null);
	}
	p.openChest = key;
	c.fill(null);
	p.inventory.fill(null);
	ws.sent.length = 0;
	// put con invSlot "length": p.inventory["length"] === 36 (truthy) → el
	// guard falso lo dejaba pasar y el `inventory[invSlot]=null` truncaba.
	p.inventory[0] = { id: B.STONE, count: 2 };
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: "length" }
		})
	);
	check(
		"H1 put con invSlot no entero → ignorado (inventario intacto, sin truncar)",
		p.inventory.length === 36 &&
			p.inventory[0].id === B.STONE &&
			c.every((s) => s === null),
		`inv.len=${p.inventory.length} c[0]=${JSON.stringify(c[0])}`
	);
	// take con chestSlot "length": c["length"] === 27 (truthy) → el guard
	// falso lo dejaba llegar al `c[chestSlot]=null` que vaciaba el cofre.
	c[5] = { id: I.DIAMOND, count: 1 };
	p.inventory.fill(null);
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "take", chestSlot: "length" }
		})
	);
	check(
		"H1 take con chestSlot no entero → ignorado (cofre intacto, sin truncar)",
		c.length === 27 && c[5] && c[5].id === I.DIAMOND,
		`c.len=${c.length} c[5]=${JSON.stringify(c[5])}`
	);
	// put con invSlot fuera de rango (-1 / 36) → igualmente rechazado
	ws.emit(
		"message",
		JSON.stringify({
			event: "chest_action",
			data: { action: "put", invSlot: 36 }
		})
	);
	check(
		"H1 put con invSlot fuera de rango se ignora",
		p.inventory[0] === null && c.every((s) => s === null || s.id === I.DIAMOND)
	);
	ws.emit(
		"message",
		JSON.stringify({ event: "chest_action", data: { action: "close" } })
	);
	p.openChest = null;
	c.fill(null);
	p.inventory.fill(null);
}

// ============================================================
// 4) RECETA DEL COFRE (8 tablones alrededor, centro vacío)
// ============================================================
{
	const crafting = require("../server/crafting.js");
	crafting.loadRecipes(); // las tablas de recetas se leen del disco (como unit-red.js)
	const grid = new Array(9).fill(null);
	const center = 4; // el centro del 3x3 queda vacío: ["###","# #","###"]
	for (let i = 0; i < 9; i++)
		if (i !== center) grid[i] = { id: B.PLANKS, count: 1 };
	const recipe = crafting.matchRecipe(grid);
	check(
		"receta del cofre: 8 tablones alrededor → cofre",
		recipe && recipe.result.id === B.CHEST,
		recipe ? `id=${recipe.result.id}` : "sin receta"
	);
}

// ============================================================
// 5) FINISH_MINING: al romper el cofre se elimina su estado
// ============================================================
{
	const cx = Math.floor(p.x + 4),
		cy = Math.floor(p.y),
		cz = Math.floor(p.z);
	const key = `${cx},${cy},${cz}`;
	world.setBlock(cx, cy, cz, B.CHEST);
	const c = chests.getOrCreateChest(key);
	c[0] = { id: I.DIAMOND, count: 1 };
	p.inventory.fill(null);
	p.inventory[0] = { id: I.WOODEN_PICKAXE, count: 1, durability: 59 }; // Fase 13 B6: max real 59
	p.selectedSlot = 0;
	ws.sent.length = 0;
	playerHelpers.finishMining(p, cx, cy, cz, B.CHEST);
	check(
		"romper el cofre lo convierte en aire",
		world.getBlock(cx, cy, cz) === B.AIR
	);
	check(
		"romper el cofre elimina su estado (contenido perdido, simplificación)",
		!state.chests.has(key)
	);
	check(
		"romper el cofre lo dropea como item (con pico, canHarvest)",
		p.inventory.some((s) => s && s.id === B.CHEST)
	);
}

world.setDiskLoader(null);
process.exit(fails ? 1 : 0);
