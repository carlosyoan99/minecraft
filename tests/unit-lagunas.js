"use strict";
// ============================================================
// TESTS DE LA FASE 13 (D2) — LAGUNAS DE PARIDAD (L1-L5)
// Cubren las mecánicas nuevas contra el servidor real (handlers de net.js
// con FakeWS, patrón unit-fase12):
//   L1 — ARCO: receta (247/248), disparo (shoot_bow → flecha daño 9,
//        playerArrow), consumo de flecha, desgaste del arco al disparar y
//        flecha recogible (vuelve al inventario al expirar).
//   L2 — PUERTAS: recetas (48/49), door_use alterna state.doors con
//        broadcast door_state y la solidez cambia (cerrada sólida, abierta
//        atravesable — isSolidAt).
//   L3 — ESCALERAS/LOSAS/VALLAS: recetas (50/51/60/61/70/71) y colisión por
//        forma en isSolidAt (losa media caja, escalera escalón, valla
//        celda completa).
//   L4 — CUBO: receta (249), recoger fuente (agua → WATER_BUCKET), verter
//        (WATER_BUCKET → agua + BUCKET) y la fuente infinita 2×2 no se
//        recoge (countWaterNeighbors ≥ 2).
//   L5 — RECETAS NUEVAS: presencia e IDs de resultado correctos (oro 232-235,
//        compás 254); la malla (236-239) NO tiene receta (decisión MC, ver
//        constants.js — se documenta aquí como invariante).
// ============================================================
const mobs = require("../server/mobs.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const net = require("../server/net.js");
const { B, I } = require("../server/constants.js");
const recetas = require("../recetas.json");

// Arena determinista (patrón unit-fase12): sin disco, sin zona segura. Los
// bloques se colocan de VERDAD (world.setBlock) para que isSolidAt —que lee
// el getBlock del cierre del módulo— vea las formas; L4 parchea setBlock
// localmente porque el handler del cubo lo invoca a través de la instancia.
world.setDiskLoader(() => null);
mobs.setSpawnSafeRadius(0);

let total = 0;
let failed = 0;
const check = (_name, ok, _extra = "") => {
	total++;
	if (!ok) {
		failed++;
		// biome-ignore lint/suspicious/noConsole: resumen del test (convención del repo)
		console.log(`FAIL: ${_name} | ${_extra}`);
	}
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

const connect = (name) => {
	state.players.clear();
	state.mobs = [];
	state.doors.clear();
	state.arrows.length = 0;
	const ws = new FakeWS();
	net.handleConnection(ws, name ? { url: `/?name=${name}` } : undefined);
	const init = ws.events("init")[0];
	const player = state.players.get(init.data.playerId);
	return { ws, player };
};

// ============================================================
// L1 — ARCO (receta, disparo, desgaste y recogida)
// ============================================================
{
	// Receta: arco → 247 (BOW) y flechas → 248 (ARROW ×4).
	check(
		"receta del arco (247) presente",
		recetas.bow && recetas.bow.result.id === I.BOW && recetas.bow.result.count === 1
	);
	check(
		"receta de 4 flechas (248) presente",
		recetas.arrow && recetas.arrow.result.id === I.ARROW && recetas.arrow.result.count === 4
	);
	// Disparo por el handler shoot_bow.
	const { ws, player } = connect("arco");
	playerHelpers.addToInventory(player, I.BOW, 1); // slot 0 (mano)
	playerHelpers.addToInventory(player, I.ARROW, 4); // slot 1
	ws.emit("message", JSON.stringify({ event: "shoot_bow", data: {} }));
	check(
		"shoot_bow crea una flecha del jugador",
		state.arrows.length === 1,
		`arrows=${state.arrows.length}`
	);
	if (state.arrows.length === 1) {
		const a = state.arrows[0];
		check(
			"flecha del jugador: kind arrow, daño 9 (BOW_DAMAGE), playerArrow",
			a.kind === "arrow" && a.damage === 9 && a.playerArrow === true && a.from === player.id,
			JSON.stringify({ kind: a.kind, dmg: a.damage, pa: a.playerArrow })
		);
	}
	check(
		"el disparo consume 1 flecha (4 → 3)",
		player.countItem(I.ARROW) === 3,
		`flechas=${player.countItem(I.ARROW)}`
	);
	check(
		"el disparo desgasta el arco (384 → 383)",
		player.inventory[0]?.id === I.BOW && player.inventory[0].durability === 383,
		`dur=${player.inventory[0]?.durability}`
	);
	// Sin flechas → no dispara.
	state.arrows.length = 0;
	playerHelpers.removeFromInventory(player, I.ARROW, 3);
	ws.emit("message", JSON.stringify({ event: "shoot_bow", data: {} }));
	check(
		"shoot_bow sin flechas no dispara",
		state.arrows.length === 0
	);
	// Flecha recogible: al expirar vuelve al inventario (no hay items en el
	// suelo — simplificación documentada; la recogida es automática).
	playerHelpers.addToInventory(player, I.ARROW, 1);
	ws.emit("message", JSON.stringify({ event: "shoot_bow", data: {} }));
	state.arrows[0].life = 10;
	mobs.tickArrows(50);
	check(
		"la flecha del jugador que expira vuelve al inventario (recogible)",
		player.countItem(I.ARROW) === 1,
		`flechas=${player.countItem(I.ARROW)}`
	);
	state.arrows.length = 0;
	state.players.clear();
	state.mobs = [];
}

// ============================================================
// L2 — PUERTAS (recetas, apertura por handler y solidez)
// ============================================================
{
	check(
		"receta de puerta de roble (48) y hierro (49)",
		recetas.oak_door?.result?.id === B.OAK_DOOR &&
			recetas.iron_door?.result?.id === B.IRON_DOOR
	);
	// La solidez se prueba con bloques REALES (world.setBlock): isSolidAt es
	// una función interna del módulo que lee el getBlock del cierre, así que
	// parchear world.getBlock no la afecta (solo afecta a los handlers de
	// net.js, que llaman a través de la instancia). La puerta se coloca en la
	// posición del jugador para que el door_use (distancia ≤ 7) la alcance.
	const { ws, player } = connect("puertas");
	const dx = Math.floor(player.x),
		dy = Math.floor(player.y),
		dz = Math.floor(player.z);
	world.setBlock(dx, dy, dz, B.OAK_DOOR);
	world.setBlock(dx, dy + 1, dz, B.OAK_DOOR); // la puerta ocupa 2 celdas
	check(
		"puerta cerrada es sólida (isSolidAt true)",
		world.isSolidAt(dx, dy + 0.5, dz) === true
	);
	// Abrir por el handler door_use: alterna state.doors + broadcast.
	const key = `${dx},${dy},${dz}`;
	ws.emit(
		"message",
		JSON.stringify({ event: "door_use", data: { x: dx, y: dy, z: dz } })
	);
	const st = state.doors.get(key);
	check(
		"door_use abre la puerta (state.doors open) y emite door_state",
		st && st.open === true && ws.events("door_state").length === 1,
		JSON.stringify(st)
	);
	check(
		"puerta abierta ya no es sólida (isSolidAt false)",
		world.isSolidAt(dx, dy + 0.5, dz) === false
	);
	// Cerrar de nuevo.
	ws.emit(
		"message",
		JSON.stringify({ event: "door_use", data: { x: dx, y: dy, z: dz } })
	);
	check(
		"door_use alterna a cerrada",
		state.doors.get(key).open === false &&
			world.isSolidAt(dx, dy + 0.5, dz) === true
	);
	// La mitad SUPERIOR de la puerta abre la misma (el estado vive abajo).
	ws.emit(
		"message",
		JSON.stringify({ event: "door_use", data: { x: dx, y: dy + 1, z: dz } })
	);
	check(
		"clic en la mitad superior abre la puerta (mismo estado)",
		state.doors.get(key)?.open === true
	);
	// Limpieza del mundo real.
	world.setBlock(dx, dy, dz, B.AIR);
	world.setBlock(dx, dy + 1, dz, B.AIR);
	state.players.clear();
	state.mobs = [];
	state.doors.clear();
}

// ============================================================
// L3 — ESCALERAS, LOSAS Y VALLAS (recetas y colisión por forma)
// ============================================================
{
	check(
		"recetas de escaleras (50/51), losas (60/61), valla y portón (70/71)",
		recetas.oak_stairs?.result?.id === B.OAK_STAIRS &&
			recetas.stone_stairs?.result?.id === B.STONE_STAIRS &&
			recetas.oak_slab?.result?.id === B.OAK_SLAB &&
			recetas.stone_slab?.result?.id === B.STONE_SLAB &&
			recetas.oak_fence?.result?.id === B.OAK_FENCE &&
			recetas.oak_fence_gate?.result?.id === B.OAK_FENCE_GATE
	);
	// LOSA: media caja inferior — se pisa por arriba (y+0.7) y bloquea en la
	// mitad inferior (y+0.2). Bloques reales (isSolidAt usa el getBlock del
	// cierre, no la instancia parcheada).
	world.setBlock(0, 10, 0, B.OAK_SLAB);
	check(
		"losa sólida solo en su mitad inferior",
		world.isSolidAt(0, 10.2, 0) === true && world.isSolidAt(0, 10.7, 0) === false
	);
	// ESCALERA: escalón inferior sólido, el superior se pisa.
	world.setBlock(0, 10, 0, B.OAK_STAIRS);
	check(
		"escalera sólida en el escalón inferior",
		world.isSolidAt(0, 10.2, 0) === true && world.isSolidAt(0, 10.7, 0) === false
	);
	// VALLA: celda completa (no se atraviesa).
	world.setBlock(0, 10, 0, B.OAK_FENCE);
	check(
		"valla sólida en toda la celda",
		world.isSolidAt(0, 10.2, 0) === true && world.isSolidAt(0, 10.7, 0) === true
	);
	world.setBlock(0, 10, 0, B.AIR);
}

// ============================================================
// L4 — CUBO (receta, recoger, verter y fuente infinita 2×2)
// ============================================================
{
	check(
		"receta del cubo (249)",
		recetas.bucket && recetas.bucket.result.id === I.BUCKET
	);
	const origGetBlock = world.getBlock;
	const origSetBlock = world.setBlock;
	const origCWN = world.countWaterNeighbors;
	world.setBlock = () => true; // el handler escribe en el mundo: no interesa aquí
	// RECOGER: cubo vacío sobre una fuente de agua → se retira el agua y el
	// cubo se llena (WATER_BUCKET).
	const { ws, player } = connect("cubo");
	playerHelpers.addToInventory(player, I.BUCKET, 1);
	world.getBlock = (x, y, z) => (x === 2 && y === 10 && z === 0 ? B.WATER : B.AIR);
	world.countWaterNeighbors = () => 0;
	ws.emit(
		"message",
		JSON.stringify({ event: "bucket_use", data: { x: 2, y: 10, z: 0 } })
	);
	check(
		"recoger agua: BUCKET se consume y WATER_BUCKET entra al inventario",
		player.countItem(I.BUCKET) === 0 && player.countItem(I.WATER_BUCKET) === 1,
		`bucket=${player.countItem(I.BUCKET)} wb=${player.countItem(I.WATER_BUCKET)}`
	);
	// VERTER: cubo lleno sobre aire → se coloca agua y vuelve el cubo vacío.
	world.getBlock = () => B.AIR;
	// Seleccionar el slot del cubo lleno.
	const wbSlot = player.inventory.findIndex((s) => s && s.id === I.WATER_BUCKET);
	player.selectedSlot = wbSlot;
	ws.emit(
		"message",
		JSON.stringify({ event: "bucket_use", data: { x: 3, y: 10, z: 0 } })
	);
	check(
		"verter agua: WATER_BUCKET se consume y BUCKET vuelve",
		player.countItem(I.WATER_BUCKET) === 0 && player.countItem(I.BUCKET) === 1,
		`wb=${player.countItem(I.WATER_BUCKET)} bucket=${player.countItem(I.BUCKET)}`
	);
	// FUENTE INFINITA 2×2: con ≥2 fuentes adyacentes la celda NO se recoge.
	// (tras el vertido el jugador tiene 1 BUCKET; se añade otro → 2).
	playerHelpers.addToInventory(player, I.BUCKET, 1);
	player.selectedSlot = player.inventory.findIndex((s) => s && s.id === I.BUCKET);
	world.getBlock = (x, y, z) => (x === 2 && y === 10 && z === 0 ? B.WATER : B.AIR);
	world.countWaterNeighbors = () => 2; // patrón 2×2 con 3 fuentes
	ws.emit(
		"message",
		JSON.stringify({ event: "bucket_use", data: { x: 2, y: 10, z: 0 } })
	);
	check(
		"la fuente infinita 2×2 no se recoge (siguen los 2 BUCKET)",
		player.countItem(I.BUCKET) === 2 && player.countItem(I.WATER_BUCKET) === 0
	);
	world.getBlock = origGetBlock;
	world.setBlock = origSetBlock;
	world.countWaterNeighbors = origCWN;
	state.players.clear();
	state.mobs = [];
}

// ============================================================
// L5 — RECETAS NUEVAS (oro 232-235 y compás 254; la malla no lleva receta)
// ============================================================
{
	check(
		"armadura de oro (232-235) con receta",
		recetas.golden_helmet?.result?.id === I.GOLD_HELMET &&
			recetas.golden_chestplate?.result?.id === I.GOLD_CHESTPLATE &&
			recetas.golden_leggings?.result?.id === I.GOLD_LEGGINGS &&
			recetas.golden_boots?.result?.id === I.GOLD_BOOTS
	);
	check(
		"compás (254) con receta",
		recetas.compass?.result?.id === I.COMPASS
	);
	// Invariante documentada (constants.js): la malla (236-239) NO tiene
	// receta de crafteo, igual que en Minecraft — llega solo por drops.
	check(
		"la malla (236-239) no tiene receta (decisión MC documentada)",
		!Object.keys(recetas).some((k) => k.includes("chain"))
	);
}

// ============================================================
// RESUMEN
// ============================================================
// biome-ignore lint/suspicious/noConsole: resumen del test (convención del repo)
console.log(`${total} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
