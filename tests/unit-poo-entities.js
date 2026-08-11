"use strict";
// ============================================================
// TESTS DE LA FASE 13 (C3) — POO DE ENTIDADES: Player, World, Chunk e
// ItemStack como clases con fachadas compatibles.
//   - `world` (server/world.js) es una INSTANCIA de World: los métodos de
//     siempre (getBlock/setBlock/getHeight/getBiome/...) viven en su
//     prototipo; las constantes públicas (SEA_LEVEL, ...) cuelgan de la
//     instancia. Los tests que parchean `world.getBlock = ...` siguen
//     funcionando (propiedad propia sobre la instancia).
//   - `Chunk` envuelve un chunk (16×128×16, Fase 15 D5) con get/set
//     locales, dirty y serialización (gzip, mismo formato que writeChunkFile).
//   - `ItemStack` es la clase de los slots de inventario/cofre/drop; su
//     JSON es idéntico a los literales { id, count, durability } previos
//     (el wire y el guardado no cambian).
//   - `Player` encapsula los campos planos del estado; createPlayer lo
//     fabrica y los métodos de entidad (damage/heal/eat/addItem/respawn/
//     addXp/applyFallDamage) delegan en las fachadas de players.js.
//     Los jugadores que conectan por net.js SON instancias de Player.
// ============================================================
const world = require("../server/world.js");
const state = require("../server/state.js");
const { ItemStack } = require("../server/items.js");
const playerHelpers = require("../server/players.js");
const net = require("../server/net.js");
const { B, I } = require("../server/constants.js");

let total = 0;
let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (typeof failedChecks !== "undefined" && failedChecks.length)
		console.log(`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`);
});
const check = (_name, ok, _extra = "") => {
	total++;
	if (!ok) {
		failed++;
		failedChecks.push(_name);
		// biome-ignore lint/suspicious/noConsole: resumen del test (convención del repo)
		console.log(`FAIL: ${_name} | ${_extra}`);
	}
};

// ============================================================
// 1) WORLD como clase
// ============================================================
{
	check("world es una instancia de World", world instanceof world.World);
	check(
		"los métodos viven en el prototipo (fachada idéntica)",
		typeof world.getBlock === "function" &&
			world.getBlock === world.World.prototype.getBlock
	);
	check(
		"getBlock fuera del mundo devuelve aire",
		world.getBlock(0, 999, 0) === B.AIR
	);
	check(
		"getHeight devuelve una altura positiva",
		typeof world.getHeight(137, 421) === "number" &&
			world.getHeight(137, 421) > 0
	);
	check(
		"getBiome devuelve una etiqueta de bioma",
		typeof world.getBiome(137, 421) === "string"
	);
	check(
		"las constantes públicas cuelgan de la instancia",
		world.SEA_LEVEL === 5 &&
			typeof world.MOUNTAIN_THRESHOLD === "number" &&
			typeof world.MS_TUNNEL_H === "number"
	);
	// Las clases quedan expuestas para los tests/consumidores nuevos.
	check(
		"World y Chunk expuestos en la instancia",
		typeof world.World === "function" && typeof world.Chunk === "function"
	);
}

// ============================================================
// 2) CHUNK como clase (get/set locales, dirty, serialización)
// ============================================================
{
	const c = world.getChunk(7, 3);
	check(
		"getChunk devuelve un Chunk con la key correcta",
		c instanceof world.Chunk && c.key === "7,3"
	);
	check(
		"el chunk envuelto es el de memoria (misma data)",
		c.data === world.getChunk(7, 3).data
	);
	check(
		"dimensiones 16×128×16 (Fase 15 D5)",
		c.data.length === 16 * 128 * 16
	);
	// Escritura local + dirty.
	const cc = new world.Chunk(1, 1);
	check("Chunk nuevo nace sin dirty", cc.dirty === false);
	cc.setBlock(0, 0, 0, B.STONE);
	check(
		"setBlock local escribe y marca dirty",
		cc.getBlock(0, 0, 0) === B.STONE && cc.dirty === true
	);
	// Serialización: save() persiste (gzip, mismo formato que el guardado) y
	// limpia el dirty. Se redirige el I/O a un directorio temporal para no
	// tocar el mundo real (patrón de unit-persistencia).
	const fs = require("node:fs");
	const os = require("node:os");
	const path = require("node:path");
	const constants = require("../server/constants.js");
	const tmpChunks = fs.mkdtempSync(path.join(os.tmpdir(), "chunk-c3-"));
	const prevChunksDir = constants.worldPaths.chunksDir;
	constants.worldPaths.chunksDir = tmpChunks;
	try {
		cc.save();
		const savedFile = path.join(tmpChunks, "1_1.json");
		check(
			"Chunk.save() escribe el archivo del chunk y limpia dirty",
			fs.existsSync(savedFile) && cc.dirty === false
		);
		const loaded = world.Chunk.load(1, 1);
		check(
			"Chunk.load() recupera lo guardado (dato intacto)",
			loaded instanceof world.Chunk && loaded.getBlock(0, 0, 0) === B.STONE
		);
		// Carga de disco inexistente: DENTRO del directorio temporal para que
		// el test siga siendo hermético (no sondea el mundo real).
		check(
			"Chunk.load de disco inexistente = null",
			world.Chunk.load(999, 999) === null
		);
	} finally {
		constants.worldPaths.chunksDir = prevChunksDir;
		fs.rmSync(tmpChunks, { recursive: true, force: true });
	}
}

// ============================================================
// 3) ITEMSTACK como clase
// ============================================================
{
	const s = new ItemStack(B.COBBLESTONE, 4);
	check("ItemStack instanceof", s instanceof ItemStack);
	check(
		"sin durabilidad serializa { id, count } (wire intacto)",
		JSON.stringify(s) === `{"id":${B.COBBLESTONE},"count":4}`
	);
	const tool = new ItemStack(200, 1, 59);
	check(
		"con durabilidad serializa { id, count, durability }",
		JSON.stringify(tool) === `{"id":200,"count":1,"durability":59}`
	);
	check(
		"ItemStack.from normaliza un literal",
		ItemStack.from({ id: 5, count: 2 }) instanceof ItemStack &&
			ItemStack.from({ id: 5, count: 2 }).count === 2
	);
	check(
		"ItemStack.from(null/undefined) = null",
		ItemStack.from(null) === null && ItemStack.from(undefined) === null
	);
	check(
		"ItemStack.from de una instancia devuelve la misma",
		ItemStack.from(s) === s
	);
	check("add/consume/empty", s.add(2).count === 6 && s.consume(6).empty);
	check(
		"ItemStack.slots(n) crea n huecos vacíos",
		ItemStack.slots(36).length === 36 && ItemStack.slots(36).every((x) => x === null)
	);
	check(
		"toPlain() devuelve el shape histórico",
		tool.toPlain().id === 200 && tool.toPlain().durability === 59
	);
}

// ============================================================
// 4) PLAYER como clase
// ============================================================
{
	const p = playerHelpers.createPlayer({
		id: "p3",
		ws: { readyState: 3, send() {} },
		health: 20,
		maxHealth: 20,
		x: 0,
		y: 10,
		z: 0,
		gamemode: "survival",
		inventory: ItemStack.slots(36),
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		selectedSlot: 0,
		craftingGrid: ItemStack.slots(9),
		xp: 0,
		level: 0,
		food: 20,
		saturation: 20
	});
	check("createPlayer fabrica un Player", p instanceof playerHelpers.Player);
	check(
		"addItem crea un ItemStack en el inventario",
		(p.addItem(B.COBBLESTONE, 5), p.inventory[0] instanceof ItemStack)
	);
	check("addItem apila en el slot existente", (p.addItem(B.COBBLESTONE, 3), p.inventory[0].count === 8));
	check("countItem cuenta por id", p.countItem(B.COBBLESTONE) === 8);
	check("removeItem retira el stack", (p.removeItem(B.COBBLESTONE, 8), p.inventory[0] === null));
	check("damage() descuenta salud", (p.damage(5, { armor: false }), p.health === 15));
	check("heal() restaura hasta maxHealth", (p.heal(3), p.health === 18));
	check("heal() no supera la salud máxima", (p.heal(99), p.health === 20));
	check("addXp acumula experiencia", (p.addXp(10), p.xp === 10));
	check(
		"eat() aplica comida si no está lleno",
		((p.food = 10), p.eat(I.BREAD) === true && p.food > 10)
	);
	check(
		"eat() con hambre y saturación llenas se rechaza",
		((p.food = 20), (p.saturation = 20), p.eat(I.BREAD) === false)
	);
	check("applyFallDamage() no revienta en el aire", typeof p.applyFallDamage(-10) === "undefined");
	check("tick() no revienta", typeof p.tick(50) === "undefined");
	// Una herramienta equipada: applyToolWear desgasta el ItemStack.
	const p2 = playerHelpers.createPlayer({
		id: "p4",
		ws: { readyState: 3, send() {} },
		health: 20,
		maxHealth: 20,
		gamemode: "survival",
		inventory: ItemStack.slots(36),
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		selectedSlot: 0,
		craftingGrid: ItemStack.slots(9)
	});
	p2.addItem(200, 1, 10); // pico de piedra con 10 usos
	const broke = p2.applyToolWear();
	check(
		"applyToolWear desgasta el ItemStack de la mano",
		broke === false && p2.inventory[0].durability === 9
	);
}

// ============================================================
// 5) RED: los jugadores que conectan son instancias de Player
// ============================================================
{
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
	state.players.clear();
	state.mobs = [];
	const ws = new FakeWS();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	const player = state.players.get(init.data.playerId);
	check("el jugador conectado es instancia de Player", player instanceof playerHelpers.Player);
	check(
		"el init serializa el inventario plano (36 slots)",
		Array.isArray(init.data.inventory) && init.data.inventory.length === 36
	);
	// Los métodos de entidad están disponibles en la instancia conectada.
	check(
		"la instancia conectada tiene addItem/damage",
		typeof player.addItem === "function" && typeof player.damage === "function"
	);
	state.players.clear();
	state.mobs = [];
}

// ============================================================
// RESUMEN
// ============================================================
// biome-ignore lint/suspicious/noConsole: resumen del test (convención del repo)
console.log(`${total} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
