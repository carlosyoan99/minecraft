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
import { inventory, setInventory } from "./hud.js";
import {
	isChestOpen,
	updateChestInventoryUI,
	updateCraftInventoryUI,
	updateFurnaceInventoryUI
} from "./panels.js";
import { panelTileCss } from "./textures.js";

// Fase 19 (B): fondos texturizados de los paneles estilo Minecraft — madera
// de roble para inventario/cofre/libro/picker y piedra para el horno (teselas
// del atlas de terreno repetidas, sin assets). Se aplican como variable CSS
// (el .panel usa var(--panel-bg)); se hace aquí, en el orquestador, porque
// los paneles viven en módulos distintos (panels/recipebook).
for (const [id, kind] of [
	["crafting-ui", "wood"],
	["chest-ui", "wood"],
	["recipe-book", "wood"],
	["picker-ui", "wood"],
	["furnace-ui", "stone"],
	["tooltip", "wood"] // Fase 19 (C): el tooltip comparte el fondo del panel
]) {
	document
		.getElementById(id)
		?.style.setProperty("--panel-bg", panelTileCss(kind));
}

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
	inMenu,
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

// Fase 19 (E): tras recargar el atlas de iconos (hot-reload), repintar todo
// lo visible que usa iconos: hotbar + paneles abiertos. Lo llama network.js
// en el evento textures_reload (mismo gancho que el atlas de terreno).
export function repaintIcons() {
	setInventory(inventory); // hud.js: inventory + updateHotbarUI
	updateCraftInventoryUI();
	updateFurnaceInventoryUI();
	if (isChestOpen()) updateChestInventoryUI();
}
