"use strict";

// ============================================================
// JUGADORES (Fase 18, D-5 — fachada)
// Orquestador de la entidad jugador: las operaciones de slots viven en
// inventory.js (addToInventory/removeFromInventory/countInInventory/
// sendInventory) y el combate/daño/XP/hambre en combat.js (damagePlayer,
// applyToolWear, addXp, respawnPlayer, fallDamage, tickPlayer, ...).
// Este módulo mantiene la clase Player (POO, Fase 13 C3) y la minería fina
// (finishMining/breakPlant) — lo que depende del mundo y del inventario a
// la vez — y RE-EXPORTA todo lo demás con las mismas firmas: net.js,
// commands.js, tnt.js, projectiles.js, mobs.js y la suite usan
// players.* y no deben cambiar (fachadas intactas, convención D-1..D-4).
// ============================================================
const world = require("./world.js");
const state = require("./state.js");
const {
	B,
	I,
	canHarvest,
	isDoor, // Fase 13 (L2): limpieza al romper puertas/portones
	ORE_DROP, // Fase 14 (Bloque B): mena → gema/lingote al minar
	ORE_XP // Fase 5: XP al minar minerales
} = require("./constants.js");
// Fase 18 (D-5): inventario extraído — mismas firmas, re-exportadas abajo.
const {
	addToInventory,
	removeFromInventory,
	countInInventory,
	sendInventory
} = require("./inventory.js");
// Fase 18 (D-5): combate/daño/XP/hambre extraídos — re-exportados abajo.
const {
	damagePlayer,
	applyToolWear,
	applyBowWear,
	applyFishingWear, // Fase 21.5 (A1): caña de pescar
	addXp,
	sendXp,
	sendHealth,
	sendFood,
	sendFireState,
	respawnPlayer,
	setBroadcastHandler,
	setXpDropHandler,
	fallDamage,
	applyFallDamage,
	canEat,
	eatFood,
	tickPlayer
} = require("./combat.js");

// ============================================================
// MINERÍA FINA (Fase 6): completa la rotura de un bloque al terminar de
// minarlo (el progreso lo avanza mining.js en el bucle principal). Mismo
// flujo que el handler break original: setBlock(AIR) → drop → XP → desgaste
// → inventario. Drop condicional: piedra/minerales solo con pico
// (canHarvest) — con la herramienta equivocada o a mano el bloque se rompe
// igual (lento) pero sin drop. Devuelve true si la herramienta se rompió
// (para que el llamador envíe tool_broke).
//
// opts.creative (modo creativo, /gamemode creative): el bloque se rompe
// igual pero SIN drop, SIN XP y SIN desgaste de herramienta (durabilidad
// infinita, como en Minecraft creativo — el inventario se gestiona con
// /give). Lo usa net.js para la minería instantánea en creative.
// ============================================================
// Fase 17 (B4): rompe una planta (hierba alta, flores, cultivo) con su drop,
// mismo comportamiento que si se minara directamente. Devuelve false (estas
// roturas no desgastan herramienta — las plantas se rompen al instante).
function breakPlant(player, x, y, z, block) {
	if (block === B.WHEAT) {
		const key = `${x},${y},${z}`;
		const crop = state.crops.get(key);
		state.crops.delete(key);
		const mature = (crop?.stage ?? 0) >= 7;
		addToInventory(player, I.SEEDS, 1 + Math.floor(Math.random() * 3));
		if (mature) addToInventory(player, I.WHEAT, 1);
		return false;
	}
	const tool = player.inventory[player.selectedSlot]
		? player.inventory[player.selectedSlot].id
		: 0;
	if (canHarvest(tool, block)) {
		// Flores → tinte; hierba alta → a veces semillas (misma tabla que abajo).
		if (block === B.POPPY) addToInventory(player, I.RED_DYE, 1);
		if (block === B.DANDELION) addToInventory(player, I.YELLOW_DYE, 1);
		if (block === B.TALL_GRASS && Math.random() < 0.3)
			addToInventory(player, I.SEEDS, 1);
		// Fase 21.5 (B3): el bambú cae a sí mismo (es el material de los
		// tablones y andamios). El andamio también se recicla al romperlo.
		if (block === B.BAMBOO) addToInventory(player, B.BAMBOO, 1);
		if (block === B.SCAFFOLDING) addToInventory(player, B.SCAFFOLDING, 1);
		// Fase 21.5 (B5): el coral y las algas se dropean a sí mismos al
		// romperlas a mano (sin decoloración — estático, como el arrecife de
		// la D2). El CORAL_BLOCK (72) es sólido y cae por el camino normal.
		if (block === B.CORAL_FAN) addToInventory(player, B.CORAL_FAN, 1);
		if (block === B.KELP) addToInventory(player, B.KELP, 1);
		if (block === B.SEAGRASS) addToInventory(player, B.SEAGRASS, 1);
	}
	return false;
}

// Plantas que viven SOBRE un bloque de soporte y se destruyen si se rompe
// (Fase 17, B4). Las lianas cuelgan del techo y no aplican.
// Fase 21.5 (B3): el bambú es una planta alta con base en el suelo — al
// romper el bloque de debajo se destruye el tallo (breakPlant lo dropea).
const GROUND_PLANTS = new Set([B.TALL_GRASS, B.POPPY, B.DANDELION, B.WHEAT, B.BAMBOO, B.CORAL_FAN, B.KELP, B.SEAGRASS]);

function finishMining(player, x, y, z, block, opts = {}) {
	world.setBlock(x, y, z, B.AIR);
	// Fase 17 (B4): romper el bloque de soporte de una planta (hierba/flor)
	// la destruye también con su drop (survival) — como en Minecraft. El
	// cambio se replica con el broadcast de setBlock.
	const aboveId = world.getBlock(x, y + 1, z);
	if (GROUND_PLANTS.has(aboveId)) {
		world.setBlock(x, y + 1, z, B.AIR);
		if (!opts.creative) breakPlant(player, x, y + 1, z, aboveId);
	}
	// Fase 11 (C): fuente de agua infinita — si se retira un bloque de agua
	// (solo ocurre en creative: en survival el agua es irrompible) con ≥2
	// fuentes ortogonales adyacentes, se rellena solo (regla de Minecraft:
	// la 2×2 nunca se agota; para limpiarla hay que colocar un sólido).
	if (block === B.WATER && world.countWaterNeighbors(x, y, z) >= 2)
		world.setBlock(x, y, z, B.WATER);
	// Cofre roto (Fase 16, B2): en survival su contenido pasa al inventario del
	// jugador (no hay entidades de item en el suelo — simplificación
	// documentada; en MC caerían al suelo como ítems recogibles). En creative
	// el contenido se descarta (como el resto de drops). Se hace ANTES del
	// camino creative (que no dropea).
	if (block === B.CHEST) {
		const slots = state.chests.get(`${x},${y},${z}`);
		state.chests.delete(`${x},${y},${z}`);
		if (slots && !opts.creative)
			for (const s of slots)
				if (s) addToInventory(player, s.id, s.count, s.durability);
	}
	// Fase 13 (L2): al romper la celda inferior de una puerta/portón se rompe
	// también la superior (2 celdas de alto) y se limpia su estado de
	// apertura (state.doors).
	if (isDoor(block)) {
		state.doors.delete(`${x},${y},${z}`);
		if (world.getBlock(x, y + 1, z) === block)
			world.setBlock(x, y + 1, z, B.AIR);
	}
	// C5 (REN-2): horno roto → se elimina su estado (fuga de memoria y
	// world.json engordando con hornos huérfanos). El jugador que lo tenía
	// abierto deja de recibir furnace_state (net.js ya salta los que no
	// existen). Su contenido se pierde (no hay entidades de item en el
	// suelo — misma simplificación que los drops sueltos).
	if (block === B.FURNACE) state.furnaces.delete(`${x},${y},${z}`);
	// Cama rota: los jugadores que tenían ahí su punto de reaparición vuelven
	// a reaparecer en el spawn inicial (como en Minecraft).
	if (block === B.BED) {
		for (const p of state.players.values()) {
			if (
				p.respawnPoint &&
				Math.floor(p.respawnPoint.x) === x &&
				Math.floor(p.respawnPoint.y) === y &&
				Math.floor(p.respawnPoint.z) === z
			)
				p.respawnPoint = null;
		}
	}
	// Antorchas que se quedaron sin soporte al romper el bloque: caen también.
	world.cleanUnsupportedTorches(x, y, z);
	const creative = opts.creative;
	if (creative) {
		// Creative: sin drop, sin XP, sin desgaste. Se sincroniza el inventario
		// igualmente (no cambia nada, pero mantiene el flujo del wire uniforme).
		sendInventory(player);
		return false;
	}
	// Fase 9 (Bloque C): cosecha de trigo — el drop depende del estado de
	// crecimiento (state.crops): maduro suelta trigo + semillas; inmaduro solo
	// semillas. El estado se limpia al cosechar.
	if (block === B.WHEAT) {
		breakPlant(player, x, y, z, block);
		sendInventory(player);
		return false;
	}
	const tool = player.inventory[player.selectedSlot]
		? player.inventory[player.selectedSlot].id
		: 0;
	if (canHarvest(tool, block)) {
		let drop = block;
		if (block === B.STONE) drop = B.COBBLESTONE;
		if (block === B.GRASS) drop = B.DIRT;
		// Fase 13 (L1): la grava suelta pedernal ~10% (material de las
		// flechas), como en Minecraft; el resto de las veces cae grava.
		if (block === B.GRAVEL) drop = Math.random() < 0.1 ? I.FLINT : B.GRAVEL;
		// Fase 14 (Bloque B): los minerales sueltan su gema/lingote/carbón
		// directamente (no el bloque de mena, que no es un ítem utilizable).
		if (ORE_DROP[block]) drop = ORE_DROP[block];
		addToInventory(player, drop, 1);
		// La hierba también suelta comida de cría (semillas → pollo, trigo →
		// vaca/oveja, zanahoria → cerdo), como en el handler original.
		if (block === B.GRASS) {
			const grassFeed = [
				[I.SEEDS, 0.25],
				[I.WHEAT, 0.1],
				[I.CARROT, 0.06]
			];
			for (const [id, prob] of grassFeed) {
				if (Math.random() < prob) addToInventory(player, id, 1);
			}
		}
		// Fase 9 (Bloque F): las flores sueltan su tinte (amapola → rojo,
		// diente de león → amarillo) y la hierba alta a veces semillas.
		if (block === B.POPPY) addToInventory(player, I.RED_DYE, 1);
		if (block === B.DANDELION) addToInventory(player, I.YELLOW_DYE, 1);
		if (block === B.TALL_GRASS && Math.random() < 0.3)
			addToInventory(player, I.SEEDS, 1);
		// Fase 5: XP al minar minerales (solo si se obtiene el drop).
		if (ORE_XP[block]) addXp(player, ORE_XP[block]);
	}
	const broke = applyToolWear(player);
	sendInventory(player);
	return broke;
}

// ============================================================
// PLAYER (Fase 13, C3): entidad del jugador como clase
// Encapsula los campos planos del estado (id, x/y/z, health, inventory,
// armor, ...) que net.js crea al conectar y que el resto del servidor ya
// leía. Los métodos de entidad delegan en las fachadas del módulo (misma
// implementación y firma): el wire, el guardado y los tests no cambian.
// La fábrica createPlayer construye la instancia desde los campos; net.js
// la usa para el jugador nuevo y save.js para restaurar al reconectar.
// ============================================================
class Player {
	constructor(fields = {}) {
		Object.assign(this, fields);
		// Fase 17: skin del jugador (preferencia del cliente, la valida
		// net.js contra constants.PLAYER_SKINS). Default defensivo: cualquier
		// instancia sin skin (tests, restore) tiene una válida.
		this.skin = fields.skin || "steve";
	}

	// --- Inventario (Fase 13, C3) ---
	addItem(itemId, count = 1, durability) {
		return addToInventory(this, itemId, count, durability);
	}
	removeItem(itemId, count = 1) {
		return removeFromInventory(this, itemId, count);
	}
	countItem(itemId) {
		return countInInventory(this, itemId);
	}

	// --- Salud / daño ---
	damage(amount, opts = {}) {
		return damagePlayer(this, amount, opts);
	}
	heal(amount) {
		const max = this.maxHealth || 20;
		if (this.health >= max) return false;
		this.health = Math.min(max, this.health + amount);
		sendHealth(this);
		return true;
	}
	applyFallDamage(vyObs = 0) {
		return applyFallDamage(this, vyObs);
	}

	// --- Comida / hambre ---
	eat(itemId) {
		return eatFood(this, itemId);
	}
	canEat(itemId) {
		return canEat(this, itemId);
	}

	// --- Ciclo de vida ---
	tick(dtMs) {
		return tickPlayer(this, dtMs);
	}
	respawn(cause) {
		return respawnPlayer(this, cause);
	}
	addXp(amount) {
		return addXp(this, amount);
	}

	// --- Desgaste ---
	applyToolWear(onlySwords = false) {
		return applyToolWear(this, onlySwords);
	}
	applyBowWear() {
		return applyBowWear(this);
	}

	// --- Sincronización con el cliente ---
	sendInventory() {
		return sendInventory(this);
	}
	sendHealth() {
		return sendHealth(this);
	}
	sendFood() {
		return sendFood(this);
	}
	sendXp() {
		return sendXp(this);
	}
}

// Fábrica del jugador nuevo: construye un Player desde los campos planos
// (los crea net.js en handleConnection con el literal de siempre).
function createPlayer(fields) {
	return new Player(fields);
}

module.exports = {
	// Fase 18 (D-5): inventario (server/inventory.js)
	addToInventory,
	removeFromInventory,
	countInInventory,
	sendInventory,
	// Fase 18 (D-5): combate/daño/XP/hambre (server/combat.js)
	sendHealth,
	sendFood,
	sendXp,
	sendFireState,
	damagePlayer,
	tickPlayer,
	eatFood,
	canEat,
	applyToolWear,
	applyBowWear,
	applyFishingWear, // Fase 21.5 (A1): caña de pescar
	addXp,
	setBroadcastHandler,
	setXpDropHandler, // Fase 18 (C-8): orbe de XP al morir
	respawnPlayer,
	fallDamage,
	applyFallDamage,
	// Minería fina (este módulo)
	finishMining,
	// Fase 13 (C3): POO del servidor
	Player,
	createPlayer
};
