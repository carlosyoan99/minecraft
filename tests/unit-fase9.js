"use strict";
// ============================================================
// TESTS UNITARIOS DE LAS MECÁNICAS DE LA FASE 9 (paridad, IA, mundo y menú)
// Cubre las mecánicas nuevas de la Fase 9 que no tenían test propio:
//   B — modo de juego por mundo (persistencia en world.json, migración v3 →
//       survival, init con gamemode, inventario creativo al entrar) y borrado
//       de mundos (world_delete: seguridad, activo rechazado, lista refrescada)
//   C — cultivos (till/plant/crecimiento/cosecha) y picker/vuelo creativos
//   F — libro de recetas (recipe_book: crafteo + horno)
// Usa ws fake (patrón unit-red) y redirige el I/O a un directorio temporal
// (patrón unit-persistencia) — NUNCA toca el world/ real del proyecto.
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fase9-"));
const constants = require("../server/constants.js");
// Redirigir el I/O a un directorio temporal ANTES de requerir world/save/net
// (capturan las rutas al cargarse, como en unit-persistencia).
constants.worldPaths.worldRoot = path.join(TMP, "worldroot");
constants.worldPaths.worldDir = path.join(TMP, "worldroot", "default");
constants.worldPaths.chunksDir = path.join(
	TMP,
	"worldroot",
	"default",
	"chunks"
);
constants.worldPaths.legacyFile = path.join(
	TMP,
	"worldroot",
	"default",
	"world.dat"
);
constants.worldPaths.metaFile = path.join(
	TMP,
	"worldroot",
	"default",
	"world.json"
);
constants.LEGACY_ROOT_FILES = ["world.json", "chunks", "world.dat"];

const world = require("../server/world.js");
const save = require("../server/save.js");
const net = require("../server/net.js");
const state = require("../server/state.js");
const crafting = require("../server/crafting.js");
const playerHelpers = require("../server/players.js");
const { B, I, SCHEMA_VERSION, CREATIVE_ITEMS } = constants;

// Forzar generación fresca (sin leer el world/ real del proyecto).
world.setDiskLoader(() => null);
crafting.loadRecipes();

let fails = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) fails++;
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
// B — MODO DE JUEGO POR MUNDO: sanitizeGamemode y persistencia
// ============================================================
{
	check(
		"sanitizeGamemode: creative/survival se conservan",
		constants.sanitizeGamemode("creative") === "creative" &&
			constants.sanitizeGamemode("survival") === "survival"
	);
	check(
		"sanitizeGamemode: valores inválidos/ausentes → survival",
		constants.sanitizeGamemode("god") === "survival" &&
			constants.sanitizeGamemode(undefined) === "survival" &&
			constants.sanitizeGamemode(null) === "survival" &&
			constants.sanitizeGamemode(123) === "survival"
	);
	check(
		"worldGamemode por defecto es survival",
		constants.worldPaths.worldGamemode === "survival"
	);

	// switchWorld con gamemode a un mundo NUEVO: worldGamemode activo cambia y
	// world.json lo persiste en el primer guardado.
	const r = save.switchWorld("mundo_creativo", "Mundo Creativo", "creative");
	check("switchWorld con gamemode → true", r === true, `r=${r}`);
	check(
		"el mundo nuevo queda en creative (worldGamemode activo)",
		constants.worldPaths.worldGamemode === "creative",
		constants.worldPaths.worldGamemode
	);
	save.saveWorld();
	const meta = JSON.parse(
		fs.readFileSync(constants.worldPaths.metaFile, "utf8")
	);
	check("world.json persiste gamemode creative", meta.gamemode === "creative");

	// Recargar el mundo restaura el modo desde world.json.
	state.chunks.clear();
	check("loadWorld carga el mundo creativo", save.loadWorld() === true);
	check(
		"loadWorld restaura gamemode desde world.json",
		constants.worldPaths.worldGamemode === "creative"
	);

	// Un mundo EXISTENTE conserva su modo (el gamemode pedido se ignora al
	// entrar a un mundo ya guardado: loadWorld gana).
	check(
		"switchWorld a un mundo existente conserva su gamemode",
		save.switchWorld("mundo_creativo", undefined, "survival") === "same" &&
			constants.worldPaths.worldGamemode === "creative"
	);

	// listWorlds expone el gamemode del mundo (badge del menú).
	const listed = save.listWorlds().find((w) => w.seed === "mundo_creativo");
	check(
		"listWorlds expone gamemode creative",
		!!listed && listed.gamemode === "creative",
		JSON.stringify(listed)
	);

	// Migración retrocompatible: un world.json v3 SIN el campo gamemode se lee
	// como survival (decisión del usuario: los mundos antiguos abren survival).
	const ROOT = constants.worldPaths.worldRoot;
	const dirViejo = path.join(ROOT, constants.seedDir("mundo_viejo"));
	fs.mkdirSync(path.join(dirViejo, "chunks"), { recursive: true });
	fs.writeFileSync(
		path.join(dirViejo, "world.json"),
		JSON.stringify({
			schemaVersion: SCHEMA_VERSION,
			seed: "mundo_viejo",
			name: "Mundo Viejo",
			lastSaved: new Date().toISOString()
			// sin `gamemode` → debe abrir como survival
		})
	);
	const rViejo = save.switchWorld("mundo_viejo");
	check(
		"switchWorld a mundo v3 sin gamemode → true",
		rViejo === true,
		`r=${rViejo}`
	);
	check(
		"mundo v3 sin gamemode abre como SURVIVAL (migración)",
		constants.worldPaths.worldGamemode === "survival",
		constants.worldPaths.worldGamemode
	);

	// Restaurar un estado conocido para el resto del archivo.
	save.switchWorld("mundo_creativo");
}

// ============================================================
// B — INIT CON GAMEMODE + INVENTARIO CREATIVO AL ENTRAR
// ============================================================
{
	// En un mundo survival, el init trae gamemode survival y el inventario
	// vacío (comportamiento original). El modo del jugador se toma del mundo
	// ACTIVO (worldPaths.worldGamemode), así que se fija antes de conectar.
	const prevMode = constants.worldPaths.worldGamemode;
	constants.worldPaths.worldGamemode = "survival";
	const { init: initS, player: pS } = connect();
	check(
		"init incluye gamemode del mundo (survival)",
		initS.data.gamemode === "survival"
	);
	check(
		"survival: el jugador entra con gamemode survival",
		pS.gamemode === "survival"
	);
	check(
		"survival: inventario vacío al entrar (no creativo)",
		pS.inventory.every((s) => s === null)
	);
	state.players.clear();

	// En un mundo creative, el init trae gamemode creative y el inventario se
	// resetea y se entrega el inventario creativo completo (decisión Fase 9).
	constants.worldPaths.worldGamemode = "creative";
	const { init: initC, player: pC } = connect();
	check(
		"init incluye gamemode del mundo (creative)",
		initC.data.gamemode === "creative"
	);
	check(
		"creative: el jugador entra con gamemode creative",
		pC.gamemode === "creative"
	);
	check(
		"creative: inventario lleno con el catálogo creativo (no vacío)",
		pC.inventory.every((s) => s && s.count === 64)
	);
	check(
		"creative: cada slot es un ítem del catálogo (CREATIVE_ITEMS)",
		pC.inventory.every((s) => CREATIVE_ITEMS.includes(s.id))
	);
	constants.worldPaths.worldGamemode = prevMode;
	state.players.clear();
}

// ============================================================
// B — ELIMINAR MUNDOS (world_delete: seguridad y mundo activo)
// ============================================================
{
	// Crear un mundo de relleno borrable (además del activo mundo_creativo).
	const ROOT = constants.worldPaths.worldRoot;
	const dirBasura = path.join(ROOT, constants.seedDir("mundo_basura"));
	fs.mkdirSync(path.join(dirBasura, "chunks"), { recursive: true });
	fs.writeFileSync(
		path.join(dirBasura, "world.json"),
		JSON.stringify({ schemaVersion: SCHEMA_VERSION, seed: "mundo_basura" })
	);

	// El mundo ACTIVO no se puede borrar.
	const delActive = save.deleteWorld(constants.worldPaths.currentSeed);
	check(
		"deleteWorld del mundo activo → rechazado (active)",
		delActive.ok === false && delActive.reason === "active",
		JSON.stringify(delActive)
	);

	// Un mundo no activo se borra completo (dir + chunks).
	const delOk = save.deleteWorld("mundo_basura");
	check(
		"deleteWorld de mundo no activo → ok",
		delOk.ok === true,
		JSON.stringify(delOk)
	);
	check(
		"deleteWorld elimina el directorio completo",
		!fs.existsSync(dirBasura),
		dirBasura
	);
	check(
		"deleteWorld refresca la lista (ya no está)",
		!save.listWorlds().some((w) => w.seed === "mundo_basura")
	);

	// Semilla inválida / path traversal: el nombre del directorio se deriva de
	// seedDir (nunca .., / ni la raíz), así que un traversal se NEUTRALIZA y
	// apunta a un directorio inofensivo dentro de world/ que no existe — el
	// borrado nunca toca rutas arbitrarias del sistema.
	const delTraversal = save.deleteWorld("../../etc/passwd");
	check(
		"deleteWorld con path traversal se neutraliza (no borra fuera de world/)",
		delTraversal.ok === true && fs.existsSync("/etc/passwd"),
		JSON.stringify(delTraversal)
	);
	const delVacia = save.deleteWorld("   ");
	check("deleteWorld con semilla vacía → invalid", delVacia.ok === false);
	// Borrar algo inexistente no es error (idempotente).
	check(
		"deleteWorld de mundo inexistente → ok (ya no existe)",
		save.deleteWorld("nunca_existio").ok === true
	);

	// Wire: world_delete → world_delete_result con la lista actualizada.
	const { ws, player } = connect();
	ws.emit(
		"message",
		JSON.stringify({ event: "world_delete", data: { seed: "nunca_existio" } })
	);
	const result = ws.events("world_delete_result").at(-1);
	check(
		"wire world_delete responde world_delete_result con la lista",
		!!result &&
			result.data.ok === true &&
			Array.isArray(result.data.worlds) &&
			result.data.worlds.some((w) => w.seed === "mundo_creativo"),
		JSON.stringify(result?.data)
	);
	state.players.clear();
}

// ============================================================
// C — CULTIVOS: arar (till), sembrar (plant), crecimiento y cosecha
// ============================================================
{
	const { ws, player: p } = connect();
	// Los cultivos se prueban en SURVIVAL con inventario vacío (el inventario
	// creativo traería trigo/semillas del catálogo y contaminaría los counts).
	p.gamemode = "survival";
	p.inventory = new Array(36).fill(null);
	const fx = Math.floor(p.x + 2),
		fy = Math.floor(p.y),
		fz = Math.floor(p.z);
	world.setBlock(fx, fy, fz, B.DIRT);

	// till: azada en la mano sobre tierra → tierra arada + desgaste.
	p.inventory[0] = { id: I.WOODEN_HOE, count: 1, durability: 59 }; // Fase 13 B6: max real 59
	p.selectedSlot = 0;
	ws.emit(
		"message",
		JSON.stringify({ event: "till", data: { x: fx, y: fy, z: fz } })
	);
	check(
		"till: la tierra se convierte en tierra arada (farmland)",
		world.getBlock(fx, fy, fz) === B.FARMLAND
	);
	check(
		"till: la azada se desgasta (-1)",
		p.inventory[0].durability === 58,
		`dur=${p.inventory[0].durability}`
	);

	// till sin azada → rechazado (no ara).
	const fx2 = fx + 1;
	world.setBlock(fx2, fy, fz, B.DIRT);
	p.inventory[0] = { id: B.DIRT, count: 1 };
	ws.emit(
		"message",
		JSON.stringify({ event: "till", data: { x: fx2, y: fy, z: fz } })
	);
	check(
		"till sin azada → rechazado (sigue tierra)",
		world.getBlock(fx2, fy, fz) === B.DIRT
	);

	// plant: semillas sobre farmland → cultivo de trigo + estado en crops.
	p.inventory[0] = { id: I.WOODEN_HOE, count: 1, durability: 58 };
	p.inventory[1] = { id: I.SEEDS, count: 5 };
	p.selectedSlot = 1;
	ws.emit(
		"message",
		JSON.stringify({ event: "plant", data: { x: fx, y: fy, z: fz } })
	);
	check(
		"plant: semillas sobre farmland → bloque de trigo",
		world.getBlock(fx, fy, fz) === B.WHEAT
	);
	check(
		"plant: consume 1 semilla",
		p.inventory[1].count === 4,
		`count=${p.inventory[1].count}`
	);
	const cropKey = `${fx},${fy},${fz}`;
	check(
		"plant: registra el estado del cultivo (stage 0)",
		!!state.crops.get(cropKey) && state.crops.get(cropKey).stage === 0,
		JSON.stringify(state.crops.get(cropKey))
	);

	// plant sobre tierra sin arar → rechazado.
	const fx3 = fx + 2;
	world.setBlock(fx3, fy, fz, B.DIRT);
	ws.emit(
		"message",
		JSON.stringify({ event: "plant", data: { x: fx3, y: fy, z: fz } })
	);
	check(
		"plant sobre tierra (sin arar) → rechazado",
		world.getBlock(fx3, fy, fz) === B.DIRT
	);

	// Cosecha: inmaduro suelta semillas; maduro (stage 7) trigo + semillas.
	state.crops.set(cropKey, { stage: 4, plantedAt: 0 });
	const invAntes = p.inventory.filter(Boolean).map((s) => [s.id, s.count]);
	playerHelpers.finishMining(p, fx, fy, fz, B.WHEAT);
	check(
		"cosechar trigo inmaduro → solo semillas (sin trigo)",
		!p.inventory.some((s) => s && s.id === I.WHEAT) &&
			p.inventory.reduce(
				(a, s) => a + (s && s.id === I.SEEDS ? s.count : 0),
				0
			) >
				invAntes.reduce((a, [, c]) => a + c, 0) - 1,
		JSON.stringify(p.inventory.filter(Boolean))
	);
	check("cosechar limpia el estado del cultivo", !state.crops.has(cropKey));

	// Maduro: el bloque WHEAT roto suelta trigo (1) + semillas.
	world.setBlock(fx, fy, fz, B.WHEAT);
	state.crops.set(cropKey, { stage: 7, plantedAt: 0 });
	playerHelpers.finishMining(p, fx, fy, fz, B.WHEAT);
	check(
		"cosechar trigo MADURO → trigo al inventario",
		p.inventory.some((s) => s && s.id === I.WHEAT && s.count >= 1)
	);
	check("cosecha madura limpia el estado", !state.crops.has(cropKey));
	state.players.clear();
}

// ============================================================
// C — PICKER CREATIVO (creative_pick) Y VUELO (creative_fly)
// ============================================================
{
	const { ws, player: p } = connect();
	const prevMode = constants.worldPaths.worldGamemode;
	constants.worldPaths.worldGamemode = "creative";
	p.gamemode = "creative";
	p.inventory = new Array(36).fill(null);
	p.selectedSlot = 0;

	// creative_pick de un bloque del catálogo → slot seleccionado.
	ws.emit(
		"message",
		JSON.stringify({ event: "creative_pick", data: { itemId: B.DIAMOND_ORE } })
	);
	check(
		"creative_pick: coloca el ítem pedido en el slot seleccionado",
		p.inventory[0] &&
			p.inventory[0].id === B.DIAMOND_ORE &&
			p.inventory[0].count === 64,
		JSON.stringify(p.inventory[0])
	);

	// creative_pick de una herramienta → con durabilidad plena.
	ws.emit(
		"message",
		JSON.stringify({
			event: "creative_pick",
			data: { itemId: I.DIAMOND_PICKAXE }
		})
	);
	check(
		"creative_pick: herramienta con durabilidad plena",
		p.inventory[0] &&
			p.inventory[0].id === I.DIAMOND_PICKAXE &&
			p.inventory[0].durability ===
				constants.TOOL_DURABILITY[I.DIAMOND_PICKAXE],
		JSON.stringify(p.inventory[0])
	);

	// creative_pick con un ID arbitrario (fuera del catálogo) → rechazado.
	ws.emit(
		"message",
		JSON.stringify({ event: "creative_pick", data: { itemId: 9999 } })
	);
	check(
		"creative_pick con ID fuera del catálogo → rechazado",
		p.inventory[0].id === I.DIAMOND_PICKAXE
	);

	// creative_pick en survival → ignorado (el modo del mundo manda).
	p.gamemode = "survival";
	ws.emit(
		"message",
		JSON.stringify({ event: "creative_pick", data: { itemId: B.GOLD_ORE } })
	);
	check(
		"creative_pick en survival → ignorado",
		p.inventory[0].id === I.DIAMOND_PICKAXE
	);

	// creative_fly: solo en creative; marca el estado de vuelo del jugador.
	p.gamemode = "creative";
	ws.emit(
		"message",
		JSON.stringify({ event: "creative_fly", data: { enabled: true } })
	);
	check("creative_fly: activa el vuelo (solo creative)", p.flying === true);
	ws.emit(
		"message",
		JSON.stringify({ event: "creative_fly", data: { enabled: false } })
	);
	check("creative_fly: desactiva el vuelo", p.flying === false);
	p.gamemode = "survival";
	ws.emit(
		"message",
		JSON.stringify({ event: "creative_fly", data: { enabled: true } })
	);
	check("creative_fly en survival → ignorado", p.flying === false);

	constants.worldPaths.worldGamemode = prevMode;
	state.players.clear();
}

// ============================================================
// F — LIBRO DE RECETAS (recipe_book: crafteo + horno, todas visibles)
// ============================================================
{
	const { ws } = connect();
	ws.emit("message", JSON.stringify({ event: "recipe_book", data: {} }));
	const book = ws.events("recipe_book").at(-1);
	check(
		"recipe_book responde con las tablas (crafting + furnace)",
		!!book &&
			book.data &&
			typeof book.data.crafting === "object" &&
			typeof book.data.furnace === "object",
		book
			? `${Object.keys(book.data?.crafting || {}).length} crafteo`
			: "sin respuesta"
	);
	check(
		"el libro incluye las recetas nuevas de Fase 9 (pan, azadas, tintes)",
		!!book &&
			book.data.crafting &&
			(book.data.crafting.bread ||
				book.data.crafting.wooden_hoe ||
				book.data.crafting.red_dye),
		Object.keys(book?.data?.crafting || {}).join(",")
	);
	check(
		"el libro incluye el horno (pescado crudo → cocinado)",
		!!book && book.data.furnace && book.data.furnace["134"],
		Object.keys(book?.data?.furnace || {}).join(",")
	);
	state.players.clear();
}

// ============================================================
// LIMPIEZA
// ============================================================
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(fails ? 1 : 0);
