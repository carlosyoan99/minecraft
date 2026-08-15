// ============================================================
// UI (Fase 18, D-6): ORQUESTADOR del HUD en juego.
// El estado y el DOM por responsabilidad viven en:
//   hud.js       — hotbar, salud/comida/XP, tooltip, silencio, badge de
//                  gamemode, chat y pantalla de muerte
//   menus.js     — pantallas principal/mundos/crear/ajustes/pausa, skins
//   panels.js    — inventario/crafteo, armadura, horno, cofre y picker
//   recipebook.js— libro de recetas por categorías
// Este archivo re-exporta la MISMA API pública que exportaba el ui.js
// monolítico (input.js, network.js, debug.js y client.js no cambian) y
// orquesta lo que cruza módulos (p. ej. applyInventory repinta HUD+paneles).
// ============================================================
import { setInventory } from "./hud.js";
import {
	isChestOpen,
	updateChestInventoryUI,
	updateCraftInventoryUI,
	updateFurnaceInventoryUI
} from "./panels.js";

// ============================================================
// FACHADA: re-exporta el API público que usan input.js, network.js y
// debug.js. Los imports de esos módulos no cambian (mismo nombre/firma).
// ============================================================
// hud.js — HUD en juego
export {
	addChatLine,
	applyFood,
	applyGamemode,
	applyHealth,
	applyXp,
	armorSlotName,
	flashMessage,
	getGamemode,
	getHeldItem,
	getSelectedSlot,
	isTyping,
	selectSlot,
	showDeathScreen
} from "./hud.js";
// menus.js — pantallas y flujo de menú/pausa
export {
	isPauseOpen,
	isTouchDevice,
	onSeedRejected,
	onWorldDeleted,
	onWorldLoaded,
	renderWorldsList,
	resumeGame,
	showMenu,
	showPause
} from "./menus.js";
// panels.js — inventario/cofre/horno/picker
export {
	applyArmor,
	applyChestState,
	applyCraftingGrid,
	applyFurnaceState,
	closePanels,
	openCraftingFromBlock,
	setCreativeCatalog,
	toggleChestUI,
	toggleFurnaceUI,
	toggleInventory,
	togglePicker
} from "./panels.js";
// recipebook.js — libro de recetas
export { renderRecipeBook, toggleRecipeBook } from "./recipebook.js";

// ============================================================
// ORQUESTACIÓN entre módulos
// ============================================================
// Llamado desde network.js en cada inventory_update: actualiza el inventario
// y repinta TODO lo que depende de él (hotbar + paneles abiertos). El
// hotbar lo repinta hud.js (setInventory); los paneles (craft/cofre/horno)
// se repintan aquí solo si están visibles.
export function applyInventory(inv) {
	setInventory(inv); // hud.js: inventory = inv + updateHotbarUI
	updateCraftInventoryUI();
	updateFurnaceInventoryUI();
	if (isChestOpen()) updateChestInventoryUI();
}
