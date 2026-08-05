"use strict";
// ============================================================
// TESTS DE LA CONSOLA DE COMANDOS (Fase 6)
// Ejercita commands.executeCommand() con un ws fake y un ctx real
// (state/world/playerHelpers reales, broadcast espiado):
//  - /help lista los comandos
//  - /tp teletransporta (evento teleport + chunks_add + player_move) y
//    corrige la Y si el destino es sólido/agua/void
//  - /give añade items por ID o nombre (y herramientas con durabilidad)
//  - /time set ajusta state.timeOffset y hace broadcast de time_set
//  - /gamemode cambia el modo (creative sin daño ni hambre)
//  - comandos desconocidos / argumentos inválidos dan mensaje de sistema
// ============================================================
const _assert = require("node:assert");
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const commands = require("../server/commands.js");
const {
	DAY_CYCLE_MS,
	B,
	I,
	TOOL_DURABILITY
} = require("../server/constants.js");

let _passed = 0,
	failed = 0;
function check(_name, ok, _info) {
	if (ok) _passed++;
	else {
		failed++;
	}
}

function makeHarness() {
	const sent = []; // mensajes directos al ws del jugador
	const broadcasts = []; // eventos broadcast
	const ws = { readyState: 1, send: (s) => sent.push(JSON.parse(s)) };
	const player = {
		id: "p1",
		ws,
		x: 0.5,
		y: 10,
		z: 0.5,
		yaw: 0,
		pitch: 0,
		health: 20,
		maxHealth: 20,
		xp: 0,
		level: 0,
		food: 20,
		saturation: 20,
		lastMoveTime: 0,
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		craftingGrid: new Array(9).fill(null),
		openFurnace: null,
		// Fase 7 (auditoría): el harness es operador por defecto (los tests
		// existentes ejercitan la lógica de los comandos); el gate se prueba
		// aparte con isOp: false.
		isOp: true
	};
	const broadcast = (event, data, exceptId) =>
		broadcasts.push({ event, data, exceptId });
	const ctx = { state, world, broadcast, playerHelpers, viewDistance: 2 };
	return { player, sent, broadcasts, ctx };
}
const countEvents = (arr, name) => arr.filter((e) => e.event === name).length;
const systemMsgs = (sent) =>
	sent
		.filter((e) => e.event === "chat" && e.data && e.data.id === "Server")
		.map((e) => e.data.message);

// --- /help ---
{
	const h = makeHarness();
	check(
		"executeCommand(/help) devuelve true",
		commands.executeCommand(h.player, "/help", h.ctx) === true
	);
	const msgs = systemMsgs(h.sent);
	check("/help lista /tp", msgs.length === 1 && msgs[0].includes("/tp"));
	check("/help lista /gamemode", msgs[0].includes("/gamemode"));
}

// --- /give por ID numérico ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give 4 10", h.ctx); // OAK_LOG x10
	const slot = h.player.inventory[0];
	check(
		"/give 4 10: inventario tiene 10 troncos",
		slot && slot.id === B.OAK_LOG && slot.count === 10,
		JSON.stringify(slot)
	);
	check(
		"/give 4 10: envía inventory_update",
		countEvents(h.sent, "inventory_update") >= 1
	);
	check(
		"/give 4 10: mensaje de sistema",
		systemMsgs(h.sent).some((m) => m.startsWith("+10"))
	);
}

// --- /give por nombre (diamante) ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give diamante 3", h.ctx);
	const slot = h.player.inventory[0];
	check(
		"/give diamante 3: inventario tiene 3 diamantes",
		slot && slot.id === I.DIAMOND && slot.count === 3,
		JSON.stringify(slot)
	);
}

// --- /give por nombre en inglés (clave de B/I) ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give stone 2", h.ctx);
	const slot = h.player.inventory[0];
	check(
		"/give stone 2: inventario tiene 2 piedras",
		slot && slot.id === B.STONE && slot.count === 2,
		JSON.stringify(slot)
	);
}

// --- /give herramienta (con durabilidad plena) ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give wooden_pickaxe", h.ctx);
	const slot = h.player.inventory[0];
	check(
		"/give wooden_pickaxe: pico con durabilidad plena",
		slot &&
			slot.id === I.WOODEN_PICKAXE &&
			slot.durability === TOOL_DURABILITY[I.WOODEN_PICKAXE],
		JSON.stringify(slot)
	);
	check(
		"/give herramienta: mensaje +1 (no apila)",
		systemMsgs(h.sent).some((m) => m.startsWith("+1"))
	);
}

// --- /give item inexistente ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give cosa_inexistente 5", h.ctx);
	check(
		"/give inexistente: inventario vacío",
		h.player.inventory.every((s) => !s)
	);
	check(
		"/give inexistente: avisa del item desconocido",
		systemMsgs(h.sent).some((m) => m.includes("Item desconocido"))
	);
}

// --- /give aire (ID 0) rechazado ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give 0 5", h.ctx);
	check(
		"/give 0 (aire): rechazado",
		systemMsgs(h.sent).some((m) => m.includes("Item desconocido"))
	);
}

// --- /give bloques no rompibles rechazados (griefing) ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give bedrock 1", h.ctx);
	check(
		"/give bedrock: rechazado (no rompible)",
		systemMsgs(h.sent).some((m) => m.includes("No puedes obtener"))
	);
	check(
		"/give bedrock: inventario vacío",
		h.player.inventory.every((s) => !s)
	);
	const h2 = makeHarness();
	commands.executeCommand(h2.player, "/give agua 1", h2.ctx);
	check(
		"/give agua: rechazado (no rompible)",
		systemMsgs(h2.sent).some((m) => m.includes("No puedes obtener"))
	);
}

// --- /give sin argumentos ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/give", h.ctx);
	check(
		"/give sin args: muestra uso",
		systemMsgs(h.sent).some((m) => m.includes("Uso: /give"))
	);
}

// --- /tp en el aire (se respeta la Y) ---
{
	const h = makeHarness();
	const gx = 10,
		gz = 30;
	const ground = world.getHeight(gx, gz) + 1;
	const ty = ground + 20; // siempre en el aire (WORLD_HEIGHT=64)
	commands.executeCommand(h.player, `/tp ${gx} ${ty} ${gz}`, h.ctx);
	check(
		"/tp aire: posición x/z",
		h.player.x === gx && h.player.z === gz,
		`x=${h.player.x} z=${h.player.z}`
	);
	check(
		"/tp aire: se respeta la Y pedida",
		h.player.y === ty,
		`y=${h.player.y} esperado=${ty}`
	);
	check(
		"/tp aire: envía teleport",
		h.sent.some((e) => e.event === "teleport" && e.data.x === gx)
	);
	check(
		"/tp aire: broadcast player_move",
		countEvents(h.broadcasts, "player_move") === 1
	);
	check("/tp aire: envía chunks_add", countEvents(h.sent, "chunks_add") >= 1);
}

// --- /tp dentro del terreno (se corrige a la superficie) ---
{
	const h = makeHarness();
	const gx = 20,
		gz = 40;
	const ground = world.getHeight(gx, gz) + 1;
	commands.executeCommand(h.player, `/tp ${gx} ${ground - 5} ${gz}`, h.ctx); // enterrado 5 bloques
	check(
		"/tp sólido: Y corregida a la superficie",
		h.player.y === ground,
		`y=${h.player.y} esperado=${ground}`
	);
}

// --- /tp argumentos inválidos ---
{
	const h = makeHarness();
	const before = { x: h.player.x, y: h.player.y, z: h.player.z };
	commands.executeCommand(h.player, "/tp a b c", h.ctx);
	check(
		"/tp a b c: no mueve al jugador",
		h.player.x === before.x &&
			h.player.y === before.y &&
			h.player.z === before.z
	);
	check(
		"/tp a b c: muestra uso",
		systemMsgs(h.sent).some((m) => m.includes("Uso: /tp"))
	);
}

// --- /time set night ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/time set night", h.ctx);
	const t = (Date.now() + state.timeOffset) % DAY_CYCLE_MS;
	const drift = Math.abs(t - DAY_CYCLE_MS / 2);
	check(
		"/time set night: reloj en mitad de ciclo (±250ms)",
		drift < 250,
		`t=${t}`
	);
	check(
		"/time set night: broadcast time_set",
		countEvents(h.broadcasts, "time_set") === 1
	);
	check(
		"/time set night: mensaje de confirmación",
		systemMsgs(h.sent).some((m) => m.includes("Hora fijada"))
	);
}

// --- /time set con ms ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/time set 60000", h.ctx);
	const t = (Date.now() + state.timeOffset) % DAY_CYCLE_MS;
	check(
		"/time set 60000: reloj ≈ 60000 (±250ms)",
		Math.abs(t - 60000) < 250,
		`t=${t}`
	);
}

// --- /time set inválido ---
{
	const h = makeHarness();
	const offsetBefore = state.timeOffset;
	commands.executeCommand(h.player, "/time set mal", h.ctx);
	check("/time set mal: no toca el reloj", state.timeOffset === offsetBefore);
	check(
		"/time set mal: no hace broadcast",
		countEvents(h.broadcasts, "time_set") === 0
	);
	check(
		"/time set mal: muestra uso",
		systemMsgs(h.sent).some((m) => m.includes("Uso: /time set"))
	);
}

// --- /gamemode ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/gamemode creative", h.ctx);
	check("/gamemode creative: flag activo", h.player.gamemode === "creative");
	check(
		"/gamemode creative: mensaje de confirmación",
		systemMsgs(h.sent).some((m) => m.includes("creative"))
	);
	commands.executeCommand(h.player, "/gamemode survival", h.ctx);
	check(
		"/gamemode survival: vuelve a survival",
		h.player.gamemode === "survival"
	);
	commands.executeCommand(h.player, "/gamemode 1", h.ctx);
	check("/gamemode 1: alias creative", h.player.gamemode === "creative");
	commands.executeCommand(h.player, "/gamemode raro", h.ctx);
	check(
		"/gamemode raro: muestra uso y no cambia",
		h.player.gamemode === "creative" &&
			systemMsgs(h.sent).some((m) => m.includes("Uso: /gamemode"))
	);
}

// --- /gamemode creative bloquea el daño (damagePlayer) ---
{
	const h = makeHarness();
	h.player.gamemode = "creative";
	playerHelpers.damagePlayer(h.player, 5);
	check(
		"creative: damagePlayer no resta salud",
		h.player.health === 20,
		`health=${h.player.health}`
	);
	h.player.gamemode = "survival";
	playerHelpers.damagePlayer(h.player, 5);
	check(
		"survival: damagePlayer sí resta salud",
		h.player.health === 15,
		`health=${h.player.health}`
	);
}

// --- GATE DE OPERADOR (Fase 7, auditoría): solo ops ejecutan /tp /give /
// time /gamemode /reload (/op). Un no-operador no muta nada y recibe aviso.
{
	const h = makeHarness();
	h.player.isOp = false;
	const before = { x: h.player.x, y: h.player.y, z: h.player.z };
	commands.executeCommand(h.player, "/give diamante 5", h.ctx);
	check(
		"no-op /give: rechazado y sin items",
		h.player.inventory.every((s) => !s)
	);
	commands.executeCommand(h.player, "/gamemode creative", h.ctx);
	check("no-op /gamemode: no cambia el modo", h.player.gamemode !== "creative");
	commands.executeCommand(h.player, "/time set day", h.ctx);
	check(
		"no-op /time: sin broadcast time_set",
		countEvents(h.broadcasts, "time_set") === 0
	);
	commands.executeCommand(h.player, "/tp 10 20 30", h.ctx);
	check(
		"no-op /tp: no mueve al jugador",
		h.player.x === before.x &&
			h.player.y === before.y &&
			h.player.z === before.z
	);
	commands.executeCommand(h.player, "/op cualquiera", h.ctx);
	const lastOpMsg = systemMsgs(h.sent).at(-1);
	check(
		"no-op /op: rechazado por permisos (no llega al comando)",
		!!lastOpMsg && lastOpMsg.includes("solo para operadores")
	);
	commands.executeCommand(h.player, "/reload", h.ctx);
	check("no-op /reload: rechazado", h.broadcasts.length === 0);
	commands.executeCommand(h.player, "/help", h.ctx);
	check(
		"no-op /help: sigue disponible para todos",
		systemMsgs(h.sent).some((m) => m.includes("/tp"))
	);
}

// --- /op (solo operador): otorga permisos a otro jugador conectado ---
{
	const h = makeHarness();
	const p2 = { id: "p2", ws: { readyState: 1, send() {} }, name: "Ana" };
	state.players.clear();
	state.players.set("p1", h.player);
	state.players.set("p2", p2);
	commands.executeCommand(h.player, "/op Ana", h.ctx);
	check("/op otorga isOp al jugador conectado", p2.isOp === true);
	p2.isOp = false;
	commands.executeCommand(h.player, "/op ana", h.ctx);
	check(
		"/op es insensible a mayúsculas (mismo jugador por nombre)",
		p2.isOp === true
	);
	commands.executeCommand(h.player, "/op Fantasma", h.ctx);
	check(
		"/op a un no conectado: avisa y no rompe nada",
		systemMsgs(h.sent).some((m) => m.includes("Uso: /op"))
	);
	check(
		"/op confirma con mensaje de sistema",
		systemMsgs(h.sent).some((m) => m.includes("ahora es operador"))
	);
	commands.executeCommand(h.player, "/op Desconocido", h.ctx);
	check(
		"/op a un jugador no conectado: muestra uso",
		systemMsgs(h.sent).some((m) => m.includes("Uso: /op"))
	);
	state.players.clear();
}

// --- comando desconocido y no-comando ---
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/desconocido", h.ctx);
	check(
		"/desconocido: avisa",
		systemMsgs(h.sent).some((m) => m.includes("Comando desconocido"))
	);
	const h2 = makeHarness();
	check(
		"mensaje sin /: no es comando (false)",
		commands.executeCommand(h2.player, "hola a todos", h2.ctx) === false
	);
	check(
		"mensaje sin /: no envía nada",
		h2.sent.length === 0 && h2.broadcasts.length === 0
	);
}
state.timeOffset = DAY_CYCLE_MS * 3; // offset mayor que el ciclo (se modula)
check("worldTime modula al ciclo", commands.worldTime(state) < DAY_CYCLE_MS);
state.timeOffset = 0;
check(
	"worldTime con offset 0",
	commands.worldTime(state) === Date.now() % DAY_CYCLE_MS
);

// --- Fase 8 (B8): fases lunares ---
const {
	MOON_CYCLE_MS,
	MOON_DAYS,
	seedMoonOffsetMs
} = require("../server/constants.js");
check(
	"MOON_CYCLE_MS = DAY_CYCLE_MS * 8",
	MOON_CYCLE_MS === DAY_CYCLE_MS * MOON_DAYS
);
check(
	"moonTime modula al ciclo lunar",
	commands.moonTime(state) < MOON_CYCLE_MS
);
// Determinismo por semilla: la misma semilla da siempre el mismo offset y
// semillas distintas (en general) offsets distintos.
const off1 = seedMoonOffsetMs("miSemilla2026");
const off2 = seedMoonOffsetMs("miSemilla2026");
check(
	"seedMoonOffsetMs determinista (misma semilla → mismo offset)",
	off1 === off2
);
check(
	"seedMoonOffsetMs en [0, MOON_CYCLE_MS)",
	off1 >= 0 && off1 < MOON_CYCLE_MS
);
check(
	"seedMoonOffsetMs cambia con la semilla (semilla distinta → offset distinto)",
	seedMoonOffsetMs("otraSemilla") !== off1
);
// /time set re-sincroniza la luna: el broadcast time_set lleva moonTime y
// moonTime y worldTime se mueven juntos (el mismo timeOffset desplaza ambos).
{
	const h = makeHarness();
	commands.executeCommand(h.player, "/time set night", h.ctx);
	const ev = h.broadcasts.find((b) => b.event === "time_set");
	check(
		"/time set: el broadcast incluye moonTime",
		!!ev?.data?.moonTime && Number.isFinite(ev.data.moonTime)
	);
}
// La luna comparte timeOffset con el día: subir el reloj del mundo un día
// (DAY_CYCLE_MS) avanza moonTime exactamente un día dentro del ciclo lunar.
{
	const off0 = state.timeOffset;
	const mt0 = commands.moonTime(state);
	state.timeOffset = off0 + DAY_CYCLE_MS; // +1 día de juego
	const mt1 = commands.moonTime(state);
	check(
		"moonTime avanza 1 día con timeOffset (+DAY_CYCLE_MS)",
		(mt1 - mt0 + MOON_CYCLE_MS) % MOON_CYCLE_MS === DAY_CYCLE_MS,
		`delta=${(mt1 - mt0 + MOON_CYCLE_MS) % MOON_CYCLE_MS}`
	);
	state.timeOffset = off0; // restaurar
}
process.exit(failed ? 1 : 0);
