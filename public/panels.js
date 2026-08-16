// ============================================================
// PANELES (Fase 18, D-6): inventario/crafteo, armadura, horno, cofre y
// picker creativo. Extraído de ui.js; ui.js es el orquestador que
// re-exporta esta fachada.
// ============================================================
import { playChestClose, playChestOpen } from "./audio.js"; // Fase 10 (F2): cofres
import { send } from "./connection.js";
import { ARMOR_DURABILITY, itemLabel } from "./constants.js";
import {
	hideTooltip,
	inventory,
	itemVisual,
	showTooltip,
	slotTooltipHtml
} from "./hud.js"; // Fase 18 (D-6): helpers del HUD
import { isRecipeBookOpen, toggleRecipeBook } from "./recipebook.js"; // Fase 18 (D-6): libro de recetas
import { controls, showBlocker } from "./scene.js";

// Estado de los paneles (lo actualiza la red; lo lee el input)
export let inventoryOpen = false;
let openChestKey = null; // Fase 6: cofre abierto ("x,y,z")
export let chestSlots = new Array(27).fill(null);
let craftingGrid = new Array(9).fill(null);
let openFurnaceKey = null;
// Fase 7: armadura equipada (fuente de verdad: el servidor; llega en init e
// inventory_update). Cada pieza con su durabilidad.
let armor = { helmet: null, chestplate: null, leggings: null, boots: null };
const ARMOR_LABELS = {
	helmet: "Casco",
	chestplate: "Pechera",
	leggings: "Pantalones",
	boots: "Botas"
};
const ARMOR_ORDER = ["helmet", "chestplate", "leggings", "boots"];

// ============================================================
// PANEL DE CRAFTEO
// ============================================================
const craftingUI = document.getElementById("crafting-ui");
const craftGridEl = document.getElementById("craft-grid");
const craftInventoryEl = document.getElementById("craft-inventory");
const craftResultEl = document.getElementById("craft-result");

function buildCraftGridSlots() {
	craftGridEl.innerHTML = "";
	for (let i = 0; i < 9; i++) {
		const cell = document.createElement("div");
		cell.className = "slot";
		cell.dataset.gridSlot = i;
		craftGridEl.appendChild(cell);
	}
}
buildCraftGridSlots();

// Fase 7: los 4 slots de armadura equipada (columna izquierda del panel).
// Clic en una pieza la desequipa (vuelve al inventario).
const armorColEl = document.getElementById("craft-armor");
function updateArmorUI() {
	armorColEl.innerHTML = "";
	for (const slotName of ARMOR_ORDER) {
		const piece = armor[slotName];
		const el = document.createElement("div");
		el.className = "slot armor-slot";
		if (piece) {
			const maxD = ARMOR_DURABILITY[piece.id];
			const cur =
				typeof piece.durability === "number" ? piece.durability : maxD;
			const pct = maxD ? Math.max(0, Math.min(100, (cur / maxD) * 100)) : 100;
			const color = pct > 50 ? "#5fd34f" : pct > 20 ? "#e8b93f" : "#e8544f";
			el.innerHTML =
				`${itemVisual(piece.id)}` +
				`<div class="durbar"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></div>`;
			el.title = `${itemLabel(piece.id)} (${cur}/${maxD}) — clic para quitarla`;
			el.addEventListener("click", () =>
				send("unequip_armor", { slot: slotName })
			);
		} else {
			el.innerHTML = `<span class="armor-empty">${ARMOR_LABELS[slotName]}</span>`;
			el.title = `${ARMOR_LABELS[slotName]} (vacío)`;
		}
		armorColEl.appendChild(el);
	}
}
updateArmorUI(); // estado inicial coherente antes del primer init

function updateCraftGridUI(success) {
	const cells = craftGridEl.children;
	for (let i = 0; i < 9; i++) {
		const item = craftingGrid[i];
		cells[i].innerHTML = item
			? `${itemVisual(item.id)}<span class="count">${item.count}</span>`
			: "";
	}
	craftResultEl.style.borderColor = success ? "#8f8" : "#555";
}

// Fase 16 (B4) + Fase 19 (C): tooltip estilizado (patrón del hotbar) para
// los slots del inventario en paneles — nombre + durabilidad al hover, con el
// delay uniforme (~200 ms) y el estilo unificado del hotbar (hud.js).
function attachSlotTooltip(el, item) {
	if (!item) return;
	el.addEventListener("mouseenter", () => showTooltip(slotTooltipHtml(item)));
	el.addEventListener("mouseleave", () => hideTooltip());
}

export function updateCraftInventoryUI() {
	craftInventoryEl.innerHTML = "";
	inventory.forEach((item, i) => {
		const el = document.createElement("div");
		el.className = "slot";
		if (item) {
			el.innerHTML = `${itemVisual(item.id)}<span class="count">${item.count}</span>`;
			attachSlotTooltip(el, item);
			el.addEventListener("click", () => {
				const emptyGridSlot = craftingGrid.findIndex((c) => !c);
				if (emptyGridSlot !== -1)
					send("grid_set", { fromInventorySlot: i, toGridSlot: emptyGridSlot });
			});
		}
		craftInventoryEl.appendChild(el);
	});
}

document
	.getElementById("craft-clear-btn")
	.addEventListener("click", () => send("grid_clear"));

export function applyCraftingGrid(grid, success) {
	craftingGrid = grid;
	updateCraftGridUI(success);
}

function toggleCraftingUI(show) {
	craftingUI.classList.toggle("hidden", !show);
	if (show) {
		updateCraftInventoryUI();
		updateCraftGridUI(false);
		showBlocker(false); // quitar el menú para poder clicar los slots (bug inventario)
		controls.unlock();
	}
}

// Enviar el grid para intentar craftear cada vez que cambie (auto-craft al llenar el patrón)
let lastGridSignature = "";
setInterval(() => {
	if (craftingUI.classList.contains("hidden")) return;
	const sig = JSON.stringify(craftingGrid);
	if (sig !== lastGridSignature) {
		lastGridSignature = sig;
		send("craft", { grid: craftingGrid });
	}
}, 400);

// ============================================================
// PANEL DE HORNO
// ============================================================
const furnaceUI = document.getElementById("furnace-ui");
const furnaceInventoryEl = document.getElementById("furnace-inventory");
const furnaceFuelEl = document.getElementById("furnace-fuel");
const furnaceInputEl = document.getElementById("furnace-input");
const furnaceOutputEl = document.getElementById("furnace-output");
const furnaceProgressEl = document.getElementById("furnace-progress");

export function updateFurnaceInventoryUI() {
	furnaceInventoryEl.innerHTML = "";
	inventory.forEach((item, i) => {
		const el = document.createElement("div");
		el.className = "slot";
		if (item) {
			el.innerHTML = `${itemVisual(item.id)}<span class="count">${item.count}</span>`;
			attachSlotTooltip(el, item);
			el.addEventListener("click", () => {
				send("furnace_action", { action: "add_fuel", invSlot: i });
				send("furnace_action", { action: "add_input", invSlot: i });
			});
		}
		furnaceInventoryEl.appendChild(el);
	});
}

export function applyFurnaceState(data) {
	openFurnaceKey = data.key;
	furnaceFuelEl.innerHTML = data.fuelItem
		? `${itemVisual(data.fuelItem)}<span class="count">${data.fuelTicksLeft}</span>`
		: "Combustible";
	furnaceFuelEl.title = data.fuelItem
		? itemLabel(data.fuelItem)
		: "Combustible";
	furnaceInputEl.innerHTML = data.inputItem
		? `${itemVisual(data.inputItem)}<span class="count">x${data.inputCount}</span>`
		: "Material";
	furnaceInputEl.title = data.inputItem
		? itemLabel(data.inputItem)
		: "Material";
	furnaceOutputEl.innerHTML = data.outputItem
		? `${itemVisual(data.outputItem)}<span class="count">x${data.outputCount}</span>`
		: "Salida";
	furnaceOutputEl.title = data.outputItem
		? itemLabel(data.outputItem)
		: "Salida";
	const pct = data.requiredTicks
		? Math.round((data.progress / data.requiredTicks) * 100)
		: 0;
	furnaceProgressEl.textContent = pct > 0 ? `${pct}%` : "→";
}

furnaceOutputEl.addEventListener("click", () =>
	send("furnace_action", { action: "collect_output" })
);

export function toggleFurnaceUI(show, coords) {
	furnaceUI.classList.toggle("hidden", !show);
	if (show) {
		updateFurnaceInventoryUI();
		send("furnace_open", coords);
		showBlocker(false); // quitar el menú para poder clicar los slots (bug inventario)
		controls.unlock();
	} else if (openFurnaceKey) {
		send("furnace_action", { action: "close" });
		openFurnaceKey = null;
	}
}

// ============================================================
// PANEL DE COFRE (Fase 6): 27 slots propios + el inventario del jugador.
// El servidor es la fuente de verdad (chest_state con los slots); el cliente
// solo pide mover items (chest_action put/take) y repinta lo que recibe.
// ============================================================
const chestUI = document.getElementById("chest-ui");
const chestSlotsEl = document.getElementById("chest-slots");
const chestInventoryEl = document.getElementById("chest-inventory");

function updateChestSlotsUI() {
	chestSlotsEl.innerHTML = "";
	chestSlots.forEach((item, i) => {
		const el = document.createElement("div");
		el.className = "slot";
		if (item) {
			el.innerHTML = `${itemVisual(item.id)}<span class="count">${item.count}</span>`;
			attachSlotTooltip(el, item);
			el.addEventListener("click", () =>
				send("chest_action", { action: "take", chestSlot: i })
			);
		}
		chestSlotsEl.appendChild(el);
	});
}

export function updateChestInventoryUI() {
	chestInventoryEl.innerHTML = "";
	inventory.forEach((item, i) => {
		const el = document.createElement("div");
		el.className = "slot";
		if (item) {
			el.innerHTML = `${itemVisual(item.id)}<span class="count">${item.count}</span>`;
			attachSlotTooltip(el, item);
			el.addEventListener("click", () =>
				send("chest_action", { action: "put", invSlot: i })
			);
		}
		chestInventoryEl.appendChild(el);
	});
}

export function applyChestState(data) {
	openChestKey = data.key;
	chestSlots = data.slots || new Array(27).fill(null);
	updateChestSlotsUI();
}

// ¿El cofre está abierto? (lo consulta el orquestador ui.js en applyInventory).
// Fase 19.5 (B1): estado de los paneles para la navegación por teclado.
export function isCraftingOpen() {
	return !craftingUI.classList.contains("hidden");
}
export function isFurnaceOpen() {
	return !furnaceUI.classList.contains("hidden");
}
export function isChestOpen() {
	return !chestUI.classList.contains("hidden");
}

// Fase 7: armadura equipada desde el servidor (init/inventory_update).
export function applyArmor(a) {
	armor =
		a && typeof a === "object"
			? a
			: { helmet: null, chestplate: null, leggings: null, boots: null };
	updateArmorUI();
}

export function toggleChestUI(show, coords) {
	chestUI.classList.toggle("hidden", !show);
	if (show) {
		updateChestSlotsUI();
		updateChestInventoryUI();
		send("chest_open", coords);
		showBlocker(false); // quitar el menú para poder clicar los slots (bug inventario)
		controls.unlock();
		playChestOpen(); // Fase 10 (F2): bisagra de la tapa
	} else if (openChestKey) {
		send("chest_action", { action: "close" });
		openChestKey = null;
		playChestClose(); // Fase 10 (F2): tapa que se cierra
	}
}

// ============================================================
// PANELES: abrir/cerrar desde el input
// ============================================================
export function openCraftingFromBlock() {
	inventoryOpen = true;
	toggleCraftingUI(true);
}
export function toggleInventory() {
	inventoryOpen = !inventoryOpen;
	toggleCraftingUI(inventoryOpen);
	if (!inventoryOpen) controls.lock();
}

// ============================================================
// PICKER CREATIVO (Fase 10, D4)
// En un mundo creative, la tecla E abre un selector con el catálogo completo
// de bloques e ítems (lo manda el servidor en el init: creativeCatalog).
// Click en un ítem → creative_pick → se coloca en el slot seleccionado.
// ============================================================
const pickerUI = document.getElementById("picker-ui");
const pickerGridEl = document.getElementById("picker-grid");
let creativeCatalog = [];
let pickerOpen = false;

export function setCreativeCatalog(list) {
	creativeCatalog = Array.isArray(list) ? list : [];
	if (pickerOpen) renderPickerGrid();
}

export function togglePicker() {
	pickerOpen = !pickerOpen;
	pickerUI.classList.toggle("hidden", !pickerOpen);
	if (pickerOpen) {
		renderPickerGrid();
		showBlocker(false); // poder clicar los slots (mismo patrón que el inventario)
		controls.unlock();
	} else {
		controls.lock();
	}
}

function renderPickerGrid() {
	pickerGridEl.innerHTML = "";
	if (creativeCatalog.length === 0) {
		pickerGridEl.innerHTML = '<p class="hint">Catálogo vacío</p>';
		return;
	}
	for (const id of creativeCatalog) {
		const el = document.createElement("div");
		el.className = "slot picker-slot";
		el.innerHTML = itemVisual(id);
		el.title = itemLabel(id);
		el.addEventListener("click", () => {
			send("creative_pick", { itemId: id });
			togglePicker(); // cierra y devuelve el puntero al juego
		});
		pickerGridEl.appendChild(el);
	}
}

// Cierre de paneles con Escape (Esc también cierra el libro de recetas).
export function closePanels() {
	const hadPanel =
		inventoryOpen ||
		pickerOpen || // Fase 10 (D4): el picker creativo también se cierra con Escape
		openFurnaceKey !== null ||
		openChestKey !== null ||
		isRecipeBookOpen();
	toggleCraftingUI(false);
	toggleFurnaceUI(false);
	toggleChestUI(false);
	if (pickerOpen) togglePicker();
	inventoryOpen = false;
	if (isRecipeBookOpen()) toggleRecipeBook();
	if (hadPanel) controls.lock(); // Escape cierra el panel y reanuda el juego
}
