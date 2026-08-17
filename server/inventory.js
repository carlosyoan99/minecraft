"use strict";

// ============================================================
// INVENTARIO (Fase 18, D-5 — extraído de players.js)
// Operaciones de slots: añadir/restar/apilar ítems y sincronizar el
// inventario con el cliente (inventory_update). Los slots son instancias
// de ItemStack (server/items.js, Fase 13 C3): misma forma al serializar
// que los literales anteriores — el wire y el guardado no cambian.
// Lo usan players.js (fachada), commands.js (/give), chests.js y
// projectiles.js vía `players.addToInventory`.
// ============================================================
const WebSocket = require("ws");
const {
	isTool,
	isArmor,
	TOOL_DURABILITY,
	ARMOR_DURABILITY,
	HOE_DURABILITY,
	isBow,
	BOW_DURABILITY,
	MAX_STACK
} = require("./constants.js");
const { ItemStack } = require("./items.js"); // Fase 13 (C3): slots como clase

function addToInventory(player, itemId, count = 1, durability) {
	// Las herramientas Y la armadura no se apilan (cada una con su durabilidad
	// propia) y su count es siempre 1: ignoramos count a propósito (ningún
	// call site añade más de 1 a la vez — el crafteo da 1 y el grid 1).
	if (isTool(itemId) || isArmor(itemId)) {
		const empty = player.inventory.findIndex((s) => !s);
		if (empty === -1) return false;
		// Fase 13 (C3): los slots del inventario son instancias de ItemStack
		// (misma forma al serializar que los literales anteriores).
		player.inventory[empty] = new ItemStack(
			itemId,
			1,
			durability ??
				TOOL_DURABILITY[itemId] ??
				ARMOR_DURABILITY[itemId] ??
				HOE_DURABILITY[itemId] ??
				(isBow(itemId) ? BOW_DURABILITY : undefined)
		);
		return true;
	}
	// SV-5 (v20.2): apilar respetando el tope de stack MC (MAX_STACK, 64).
	// Antes se sumaba sin límite en el primer slot del mismo tipo. Ahora se
	// rellena cada slot hasta MAX_STACK y se pasa al siguiente (como MC), y
	// solo se crea slot nuevo para el excedente. Devuelve false si no cabe
	// TODO el count (el invocador decide — MC descarta el sobrante).
	let remaining = count;
	// 1) Rellenar slots existentes del mismo tipo hasta MAX_STACK.
	for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
		const s = player.inventory[i];
		if (!s || s.id !== itemId || s.count >= MAX_STACK) continue;
		const add = Math.min(MAX_STACK - s.count, remaining);
		s.count += add;
		remaining -= add;
	}
	// 2) Crear slots nuevos con el excedente (cada uno hasta MAX_STACK).
	for (let i = 0; i < player.inventory.length && remaining > 0; i++) {
		if (player.inventory[i]) continue;
		const add = Math.min(MAX_STACK, remaining);
		player.inventory[i] = new ItemStack(itemId, add);
		remaining -= add;
	}
	return remaining === 0;
}

function removeFromInventory(player, itemId, count = 1) {
	// SV-2 (C6): antes, si el primer stack no cubría la cantidad devolvía
	// false sin mirar los posteriores (perdía stacks válidos). Ahora resta
	// de TODOS los stacks del ítem hasta cubrir `count` (como Minecraft).
	for (let i = 0; i < player.inventory.length && count > 0; i++) {
		const s = player.inventory[i];
		if (!s || s.id !== itemId) continue;
		if (s.count > count) {
			s.count -= count;
			count = 0;
		} else {
			count -= s.count;
			player.inventory[i] = null;
		}
	}
	return count === 0;
}

function countInInventory(player, itemId) {
	let total = 0;
	for (const s of player.inventory) if (s && s.id === itemId) total += s.count;
	return total;
}

// El servidor es la fuente de verdad: tras cada cambio se reenvía el
// inventario completo al jugador para que el HUD del cliente lo pinte.
function sendInventory(player) {
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(
			JSON.stringify({
				event: "inventory_update",
				data: { inventory: player.inventory, armor: player.armor }
			})
		);
	}
}

module.exports = {
	addToInventory,
	removeFromInventory,
	countInInventory,
	sendInventory
};
