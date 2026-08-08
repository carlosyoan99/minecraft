"use strict";
// ============================================================
// TESTS UNITARIOS DEL RESPAWN SEGÚN GAMEMODE (Fase 7)
// Cubre `damagePlayer` (server/players.js): en SURVIVAL al morir se pierde
// el inventario, la armadura y la mesa de crafteo (con inventory_update
// vacío para el HUD), se cierran cofres/hornos abiertos, la XP/nivel se
// conservan y el wire de `player_die` avisa con `lostInventory`. En
// CREATIVE el jugador no recibe daño: nada se pierde (conserva).
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const { I, ARMOR_SLOTS, xpToNext } = require("../server/constants.js");

world.setDiskLoader(() => null); // sin I/O de disco en los tests

let fails = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) fails++;
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

// Capturar los broadcasts (player_die) como hace server.js con net.broadcast.
const broadcasts = [];
playerHelpers.setBroadcastHandler((event, data) =>
	broadcasts.push({ event, data })
);

function connect() {
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	return { ws, init, player: state.players.get(init.data.playerId) };
}

// ============================================================
// SURVIVAL: AL MORIR SE PIERDE TODO (inventario, armadura y mesa)
// ============================================================
{
	const { ws, player: p } = connect();
	// Items en el inventario, una pieza de armadura equipada y la mesa ocupada.
	playerHelpers.addToInventory(p, I.STICK);
	const stickSlot = p.inventory.findIndex((s) => s && s.id === I.STICK);
	p.inventory[stickSlot].count = 5;
	playerHelpers.addToInventory(p, I.WOODEN_PICKAXE);
	playerHelpers.addToInventory(p, I.IRON_HELMET);
	const helmSlot = p.inventory.findIndex((s) => s && s.id === I.IRON_HELMET);
	ws.emit(
		"message",
		JSON.stringify({ event: "equip_armor", data: { inventorySlot: helmSlot } })
	);
	p.craftingGrid[0] = { id: I.STICK, count: 1 };
	p.openChest = "1,2,3";
	// Fase 13 (paridad B2/B1): la curva de XP es la oficial por tramos
	// (xpToNext(0)=7, xpToNext(1)=9 → nivel 2 = 16 XP) y la salud máxima es
	// SIEMPRE 20 (el nivel no da vida, como Minecraft real).
	playerHelpers.addXp(p, xpToNext(0) + xpToNext(1)); // nivel 2 = 16 XP
	p.health = 3;
	ws.sent.length = 0;
	broadcasts.length = 0;

	playerHelpers.damagePlayer(p, 10); // muerte

	check(
		"survival: el inventario se vacía al morir",
		p.inventory.every((s) => s === null),
		JSON.stringify(p.inventory.filter(Boolean))
	);
	check(
		"survival: la armadura se vacía al morir",
		ARMOR_SLOTS.every((s) => p.armor[s] === null),
		JSON.stringify(p.armor)
	);
	check(
		"survival: la mesa de crafteo se vacía al morir",
		p.craftingGrid.every((s) => s === null),
		JSON.stringify(p.craftingGrid.filter(Boolean))
	);
	check(
		"survival: cofre/horno abiertos se cierran",
		p.openChest === null && p.openFurnace === null
	);
	check(
		"survival: la XP y el nivel se conservan",
		p.xp === xpToNext(0) + xpToNext(1) && p.level === 2,
		`xp=${p.xp} level=${p.level}`
	);
	check(
		"survival: respawn con salud máxima 20 (sin bonus por nivel)",
		p.health === 20,
		`health=${p.health}`
	);
	check(
		"survival: se reenvía inventory_update vacío (HUD)",
		(() => {
			const inv = ws.events("inventory_update");
			const last = inv[inv.length - 1];
			return (
				inv.length > 0 &&
				last.data.inventory.every((s) => s === null) &&
				ARMOR_SLOTS.every((s) => last.data.armor[s] === null)
			);
		})()
	);
	check(
		"survival: player_die avisa lostInventory:true",
		broadcasts.some(
			(b) =>
				b.event === "player_die" &&
				b.data.id === p.id &&
				b.data.lostInventory === true
		)
	);
	check("survival: respawn con teleport", ws.events("teleport").length === 1);
}

// ============================================================
// CREATIVE: NO RECIBE DAÑO → NADA SE PIERDE (conserva)
// ============================================================
{
	const { ws, player: p } = connect();
	p.gamemode = "creative";
	playerHelpers.addToInventory(p, I.STICK);
	playerHelpers.addToInventory(p, I.DIAMOND);
	p.health = 3;
	ws.sent.length = 0;
	broadcasts.length = 0;

	playerHelpers.damagePlayer(p, 999); // creative ignora el daño

	check(
		"creative: el daño se ignora (no muere)",
		p.health === 3,
		`health=${p.health}`
	);
	check(
		"creative: el inventario se conserva",
		p.inventory.filter(Boolean).length === 2,
		JSON.stringify(p.inventory.filter(Boolean))
	);
	check(
		"creative: no se envía player_die",
		broadcasts.filter((b) => b.event === "player_die" && b.data.id === p.id)
			.length === 0
	);
	check(
		"creative: no hay teleport de respawn",
		ws.events("teleport").length === 0
	);
}

process.exit(fails === 0 ? 0 : 1);
