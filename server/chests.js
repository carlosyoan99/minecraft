"use strict";

// ============================================================
// COFRES (Fase 6): bloque de almacenamiento con inventario propio.
// Cada cofre del mundo tiene un array de CHEST_SLOTS slots (null o
// { id, count, durability }), con la misma semántica que el
// inventario del jugador (las herramientas llevan durabilidad y no
// se apilan). Sigue el patrón de los hornos (state.furnaces +
// crafting.js): estado en state.chests, snapshot para el wire y
// restauración desde el guardado (save.js lo persiste en el meta).
// La lógica de mover items (put/take) vive en el handler de red
// (net.js), igual que con el horno.
// ============================================================
const state = require("./state.js");
const { I } = require("./constants.js");

const { chests } = state;
const CHEST_SLOTS = 27; // 3 filas de 9, como el cofre pequeño de Minecraft

// ============================================================
// LOOT DE MINAS ABANDONADAS (Fase 7): los cofres que genera el mundo en
// los pasillos traen 1-3 stacks de una tabla estilo Minecraft (carbón,
// lingotes, redstone, diamante raro...). Se crea el estado del cofre en
// generation (world.js) para que la persistencia del meta lo conserve.
// ============================================================
// [id, min, max] — el diamante es raro (solo en el 8% de los cofres).
const LOOT_TABLE = [
	[I.COAL, 1, 4],
	[I.IRON_INGOT, 1, 3],
	[I.GOLD_INGOT, 1, 2],
	[I.REDSTONE, 1, 4],
	[I.STICK, 1, 3],
	[I.DIAMOND, 1, 1]
];

// Devuelve un array de CHEST_SLOTS slots con loot aleatorio (1-3 stacks).
function lootSlots() {
	const slots = new Array(CHEST_SLOTS).fill(null);
	const n = 1 + Math.floor(Math.random() * 3); // 1..3 stacks
	for (let i = 0; i < n; i++) {
		const [id, min, max] = LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)];
		slots[i] = { id, count: min + Math.floor(Math.random() * (max - min + 1)) };
	}
	return slots;
}

function getOrCreateChest(key) {
	let c = chests.get(key);
	if (!c) {
		c = new Array(CHEST_SLOTS).fill(null);
		chests.set(key, c);
	}
	return c;
}

// Copia plana para el wire (los slots van sin referencias al estado).
function chestSnapshot(chest) {
	return chest.map((s) => (s ? { ...s } : null));
}

function restoreChests(entries) {
	chests.clear();
	for (const [k, v] of entries || []) {
		if (!Array.isArray(v)) continue;
		// Defensivo: guardados viejos/dañados con menos slots o nulls sueltos.
		const slots = v.slice(0, CHEST_SLOTS).map((s) => (s ? { ...s } : null));
		while (slots.length < CHEST_SLOTS) slots.push(null);
		chests.set(k, slots);
	}
}

module.exports = {
	CHEST_SLOTS,
	getOrCreateChest,
	chestSnapshot,
	restoreChests,
	lootSlots
};
