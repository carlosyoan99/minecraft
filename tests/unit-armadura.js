"use strict";
// ============================================================
// TESTS UNITARIOS DE LA ARMADURA (Fase 7)
// Cubre el servidor: las 12 recetas (4 piezas × 3 materiales), el handler
// `equip_armor` (intercambio con la pieza ya equipada conservando
// durabilidad), `unequip_armor`, la reducción de daño con desgaste en
// `damagePlayer`, que la armadura NO se apila en el inventario, que la
// inanición ignora la armadura, y el wire (init + inventory_update la
// incluyen).
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const crafting = require("../server/crafting.js");
const playerHelpers = require("../server/players.js");
const { I, ARMOR_SLOTS, ARMOR_DURABILITY } = require("../server/constants.js");

world.setDiskLoader(() => null);
crafting.loadRecipes();

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (typeof failedChecks !== "undefined" && failedChecks.length)
		console.log(`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) { fails++; failedChecks.push(_name); }
};

class FakeWS {
	constructor() {
		this.sent = [];
		this.handlers = {};
		this.readyState = 1;
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
	return { ws, init, player: state.players.get(init.data.playerId) };
}

// ============================================================
// RECETAS (4 piezas × 3 materiales) + cuero no crafteable (drop)
// ============================================================
{
	const shapes = {
		helmet: ["###", "# #"],
		chestplate: ["# #", "###", "###"],
		leggings: ["###", "# #", "# #"],
		boots: ["# #", "# #"]
	};
	const materials = { leather: 132, iron: 102, diamond: 104 };
	const base = { leather: 220, iron: 224, diamond: 228 };
	let allOk = 0;
	for (const [mat, mid] of Object.entries(materials)) {
		for (const [piece, shape] of Object.entries(shapes)) {
			const grid = new Array(9).fill(null);
			let gi = 0;
			for (const row of shape)
				for (const ch of row) {
					if (ch === "#") grid[gi] = { id: mid, count: 1 };
					gi++;
				}
			const r = crafting.matchRecipe(grid);
			const expected =
				base[mat] +
				["helmet", "chestplate", "leggings", "boots"].indexOf(piece);
			if (r && r.result.id === expected) allOk++;
			else
				console.log(
					`FAIL: receta ${mat}_${piece} → ${r ? r.result.id : "sin receta"} (esperado ${expected})`
				);
		}
	}
	check(`las 12 recetas de armadura (${allOk}/12)`, allOk === 12);
	check(
		"el cuero NO es crafteable (se obtiene de la vaca/conejo)",
		!crafting.matchRecipe([
			{ id: 132, count: 1 },
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null
		])
	);
}

// ============================================================
// EQUIPAR / DESEQUIPAR
// ============================================================
const ctx = connect();
const p = ctx.player;

// Dar un casco de hierro en el primer hueco libre y equiparlo
playerHelpers.addToInventory(p, I.IRON_HELMET);
const helmSlot = p.inventory.findIndex((s) => s && s.id === I.IRON_HELMET);
ctx.ws.sent.length = 0;
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "equip_armor", data: { inventorySlot: helmSlot } })
);
check(
	"equipar el casco → armor.helmet asignado",
	p.armor.helmet && p.armor.helmet.id === I.IRON_HELMET
);
check("equipar el casco → slot del inventario vacío", !p.inventory[helmSlot]);
check(
	"equipar crea la pieza con durabilidad plena",
	p.armor.helmet.durability === ARMOR_DURABILITY[I.IRON_HELMET],
	`${p.armor.helmet.durability}`
);
check(
	"inventory_update incluye la armadura",
	ctx.ws.events("inventory_update").some((m) => m.data.armor?.helmet)
);

// Intercambio: equipar otro casco (usado) → el anterior vuelve al inventario
p.armor.helmet.durability = 100;
playerHelpers.addToInventory(p, I.IRON_HELMET);
const helmSlot2 = p.inventory.findIndex((s) => s && s.id === I.IRON_HELMET);
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "equip_armor", data: { inventorySlot: helmSlot2 } })
);
check(
	"equipar otro casco → el previo vuelve con su durabilidad (100)",
	p.inventory.some((s) => s && s.id === I.IRON_HELMET && s.durability === 100),
	JSON.stringify(p.inventory.filter((s) => s && s.id === I.IRON_HELMET))
);
check(
	"el casco nuevo queda con durabilidad plena",
	p.armor.helmet.durability === ARMOR_DURABILITY[I.IRON_HELMET]
);

// Desequipar: vuelve al inventario con su durabilidad
ctx.ws.sent.length = 0;
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "unequip_armor", data: { slot: "helmet" } })
);
const back = p.inventory.find((s) => s && s.id === I.IRON_HELMET);
check("desequipar → la pieza vuelve al inventario", !!back);
check("desequipar → armor.helmet vacío", !p.armor.helmet);

// Equipar un ítem que no es armadura → ignorado
p.inventory[0] = { id: I.STICK, count: 1 };
ctx.ws.emit(
	"message",
	JSON.stringify({ event: "equip_armor", data: { inventorySlot: 0 } })
);
check(
	"equipar un no-armadura → ignorado",
	!p.armor.helmet && p.inventory[0].id === I.STICK
);

// ============================================================
// REDUCCIÓN DE DAÑO + DESGASTE
// ============================================================
{
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const p2 = state.players.get(ws.events("init")[0].data.playerId);
	playerHelpers.addToInventory(p2, I.IRON_CHESTPLATE);
	const slot = p2.inventory.findIndex((s) => s && s.id === I.IRON_CHESTPLATE);
	ws.emit(
		"message",
		JSON.stringify({ event: "equip_armor", data: { inventorySlot: slot } })
	);
	p2.health = 20;
	// Fase 13 (paridad B4): pechera de hierro = 6 puntos de armadura → 24% →
	// round(10 × 0.76) = 8 (antes 9 con la tabla de porcentajes vieja).
	playerHelpers.damagePlayer(p2, 10);
	check(
		"daño 10 con pechera de hierro → recibe 8",
		p2.health === 12,
		`health=${p2.health}`
	);
	check(
		"la pechera se desgasta (-2 por 10 de daño bruto)",
		p2.armor.chestplate.durability === ARMOR_DURABILITY[I.IRON_CHESTPLATE] - 2,
		`${p2.armor.chestplate.durability}`
	);
}

// ============================================================
// LA ARMADURA NO SE APILA (cada pieza con su durabilidad)
// ============================================================
{
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const p3 = state.players.get(ws.events("init")[0].data.playerId);
	playerHelpers.addToInventory(p3, I.LEATHER_BOOTS);
	const slot1 = p3.inventory.findIndex((s) => s && s.id === I.LEATHER_BOOTS);
	p3.inventory[slot1].durability = 10;
	playerHelpers.addToInventory(p3, I.LEATHER_BOOTS);
	const boots = p3.inventory.filter((s) => s && s.id === I.LEATHER_BOOTS);
	check(
		"dos botas de cuero → 2 slots separados (no se apilan)",
		boots.length === 2,
		`slots=${boots.length}`
	);
	check(
		"cada pieza conserva su durabilidad (10 y plena)",
		boots.some((s) => s.durability === 10) &&
			boots.some((s) => s.durability === ARMOR_DURABILITY[I.LEATHER_BOOTS])
	);
}

// ============================================================
// LA INANICIÓN IGNORA LA ARMADURA (no la desgasta)
// ============================================================
{
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const p4 = state.players.get(ws.events("init")[0].data.playerId);
	playerHelpers.addToInventory(p4, I.DIAMOND_CHESTPLATE);
	const slot = p4.inventory.findIndex(
		(s) => s && s.id === I.DIAMOND_CHESTPLATE
	);
	ws.emit(
		"message",
		JSON.stringify({ event: "equip_armor", data: { inventorySlot: slot } })
	);
	p4.food = 0;
	p4.health = 10;
	playerHelpers.tickPlayer(p4, 2000); // 1 tick de inanición
	check(
		"inanición daña sin desgastar la armadura",
		p4.armor.chestplate.durability === ARMOR_DURABILITY[I.DIAMOND_CHESTPLATE],
		`dur=${p4.armor.chestplate.durability}`
	);
	check(
		"la inanición sigue restando salud",
		p4.health === 9,
		`health=${p4.health}`
	);
}

// ============================================================
// WIRE: EL INIT LLEVA LA ARMADURA
// ============================================================
{
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	check(
		"el init incluye armor",
		!!init.data.armor &&
			init.data.armor.helmet === null &&
			ARMOR_SLOTS.every((s) => s in init.data.armor),
		JSON.stringify(Object.keys(init.data.armor || {}))
	);
}
process.exit(fails === 0 ? 0 : 1);
