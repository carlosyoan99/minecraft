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

const { chests } = state;
const CHEST_SLOTS = 27; // 3 filas de 9, como el cofre pequeño de Minecraft

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
	restoreChests
};
