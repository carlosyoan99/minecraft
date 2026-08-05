// ============================================================
// UI: HUD (hotbar, salud), chat, panel de crafteo y panel de horno
// ============================================================

import { isMuted, setMuted } from "./audio.js";
import { defaultName, send, setStoredName } from "./connection.js";
import {
	ARMOR_DURABILITY,
	ARMOR_SLOT_NAMES,
	DURABILITY,
	itemColor,
	itemLabel,
	XP_PER_LEVEL
} from "./constants.js";
import { finishLoading, showLoading } from "./loading.js";
import { controls, showBlocker } from "./scene.js";
import { getSettings, setSetting } from "./settings.js";

// Estado que dibuja el HUD (lo actualiza la red; lo lee el input)
let inventory = new Array(36).fill(null);
let selectedSlot = 0;
let craftingGrid = new Array(9).fill(null);
let openFurnaceKey = null;
let health = 20;
let maxHealth = 20; // Fase 5: sube con el nivel (máx +10)
let food = 20;
let saturation = 20; // barra dorada sobre la comida (como en Minecraft)
let xp = 0;
let level = 0; // Fase 5: niveles simples
let inventoryOpen = false;
let openChestKey = null; // Fase 6: cofre abierto ("x,y,z")
let chestSlots = new Array(27).fill(null);
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
// Índice de slot de armadura de un id de pieza (mismo orden que el servidor).
export function armorSlotName(id) {
	return ARMOR_SLOT_NAMES[(id - 220) % 4] || null;
}

export function getHeldItem() {
	return inventory[selectedSlot];
}
export function isChatFocused() {
	return document.activeElement === chatInput;
}

// ============================================================
// HOTBAR Y SALUD
// ============================================================
const hotbarEl = document.getElementById("hotbar");
function updateHotbarUI() {
	hotbarEl.innerHTML = "";
	for (let i = 0; i < 9; i++) {
		const item = inventory[i];
		const slot = document.createElement("div");
		slot.className = `hotbar-slot${i === selectedSlot ? " selected" : ""}`;
		if (item) {
			slot.innerHTML = `<div class="swatch" style="background:#${itemColor(item.id).toString(16).padStart(6, "0")}"></div><span class="count">${item.count}</span>`;
			// Fase 5/7: barra de durabilidad bajo la herramienta/armadura (verde→rojo)
			const maxD = DURABILITY[item.id] || ARMOR_DURABILITY[item.id];
			if (maxD) {
				const cur =
					typeof item.durability === "number" ? item.durability : maxD;
				const pct = Math.max(0, Math.min(100, (cur / maxD) * 100));
				const color = pct > 50 ? "#5fd34f" : pct > 20 ? "#e8b93f" : "#e8544f";
				slot.innerHTML += `<div class="durbar"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></div>`;
				slot.title = `${itemLabel(item.id)} (${cur}/${maxD})`;
			} else {
				slot.title = itemLabel(item.id);
			}
		}
		slot.addEventListener("click", () => {
			selectedSlot = i;
			send("inventory_select", { slot: i });
			updateHotbarUI();
		});
		hotbarEl.appendChild(slot);
	}
}
function updateHealthUI() {
	document.getElementById("hp").textContent = health;
	document.getElementById("maxhp").textContent = maxHealth;
}
function updateXpUI() {
	const fill = document.getElementById("xp-fill");
	fill.style.width =
		Math.max(0, Math.min(100, ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)) +
		"%";
	document.getElementById("level").textContent = level;
}

// Barra de hambre con saturación dorada encima (como en Minecraft): el track
// se llena de naranja con la comida y la capa dorada lo cubre desde la
// izquierda según la saturación; naranja oscuro al bajar y rojo al llegar a 0.
function updateFoodUI() {
	document.getElementById("food").textContent = food;
	const foodFill = document.getElementById("food-fill");
	foodFill.style.width = `${Math.max(0, Math.min(100, (food / 20) * 100))}%`;
	foodFill.style.background =
		food <= 0
			? "#ff5555"
			: food <= 6
				? "#e8862e"
				: "linear-gradient(#ffd27a, #ff9a2e)";
	const satFill = document.getElementById("sat-fill");
	satFill.style.width = `${Math.max(0, Math.min(100, (saturation / 20) * 100))}%`;
}

// ============================================================
// BOTÓN DE SILENCIO (persistido en localStorage)
// ============================================================
updateFoodUI(); // estado inicial coherente (barra llena/dorada) antes del primer init

const muteBtn = document.getElementById("mute-btn");
function updateMuteBtn() {
	muteBtn.textContent = isMuted() ? "🔇" : "🔊";
	muteBtn.title = isMuted() ? "Activar sonido" : "Silenciar sonido";
}
muteBtn.addEventListener("click", () => {
	setMuted(!isMuted());
	updateMuteBtn();
});
updateMuteBtn();

// ============================================================
// MENÚ (Fase 7): pantallas principal / mundos / ajustes, nombre de
// jugador y semilla del mundo. Al pulsar Jugar (o elegir un mundo) con una
// semilla distinta de la activa se pide al servidor cambiar el mundo activo
// (set_seed): persiste el actual, carga/genera el de la semilla y reenvía el
// init. La pantalla de carga cubre el cambio y el puntero se bloquea ya
// (gesto del usuario); onWorldLoaded() la cierra cuando llega el init que
// confirma la semilla pedida (data.seed === la enviada).
// ============================================================
const menuMain = document.getElementById("menu-main");
const menuWorlds = document.getElementById("menu-worlds");
const menuSettings = document.getElementById("menu-settings");
const startBtn = document.getElementById("start-btn");
const worldsBtn = document.getElementById("worlds-btn");
const settingsBtn = document.getElementById("settings-btn");
const worldsBackBtn = document.getElementById("worlds-back-btn");
const settingsBackBtn = document.getElementById("settings-back-btn");
const worldsListEl = document.getElementById("worlds-list");
const worldNameInput = document.getElementById("world-name-input");
const seedInput = document.getElementById("seed-input");
const seedCreateBtn = document.getElementById("seed-create-btn");
const randomSeedBtn = document.getElementById("random-seed-btn");
const nameInput = document.getElementById("name-input");
const rdSlider = document.getElementById("rd-slider");
const rdValue = document.getElementById("rd-value");
const coordsToggle = document.getElementById("coords-toggle");
let currentSeed = null; // semilla activa (la trae el init del servidor)
let seedPending = null; // semilla pedida en el menú, pendiente de confirmar

function showMenuScreen(which) {
	menuMain.classList.toggle("hidden", which !== menuMain);
	menuWorlds.classList.toggle("hidden", which !== menuWorlds);
	menuSettings.classList.toggle("hidden", which !== menuSettings);
}

// Nombre de jugador: se persiste en localStorage (mc_name) y se envía con
// set_name (el servidor es la fuente de verdad y lo sanea).
nameInput.value = defaultName();
nameInput.addEventListener("change", () => {
	const n = nameInput.value.trim();
	if (n) {
		nameInput.value = n;
		setStoredName(n);
		send("set_name", { name: n });
	} else nameInput.value = defaultName();
});
nameInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") startBtn.click();
});

worldsBtn.addEventListener("click", () => {
	showMenuScreen(menuWorlds);
	send("worlds_list"); // el servidor responde y renderWorldsList pinta la lista
});
settingsBtn.addEventListener("click", () => {
	showMenuScreen(menuSettings);
	const s = getSettings();
	rdSlider.value = s.renderDistance;
	rdValue.textContent = s.renderDistance;
	coordsToggle.checked = s.showCoords;
});
worldsBackBtn.addEventListener("click", () => showMenuScreen(menuMain));
settingsBackBtn.addEventListener("click", () => showMenuScreen(menuMain));

rdSlider.addEventListener("input", () => {
	rdValue.textContent = rdSlider.value;
	setSetting("renderDistance", parseInt(rdSlider.value, 10));
});
coordsToggle.addEventListener("change", () =>
	setSetting("showCoords", coordsToggle.checked)
);

// Entrar al juego con una semilla: si difiere de la activa (o llega un nombre
// nuevo para el mundo actual) se pide al servidor cambiar/renombrar el mundo
// (set_seed) y se espera el init que lo confirma (onWorldLoaded). Con semilla
// vacía se juega el mundo activo tal cual, salvo que llegue un nombre: en ese
// caso se renombra el mundo activo (el campo `name` nunca se ignora).
function startWithSeed(seed, worldName) {
	seed = (seed || "").trim();
	const name = (worldName || "").trim();
	if (seed && (seed !== currentSeed || name)) {
		seedPending = seed;
		showLoading(`Generando el mundo «${seed}»...`);
		send("set_seed", { seed, name });
	} else if (name && currentSeed) {
		seedPending = currentSeed;
		showLoading(`Renombrando el mundo «${currentSeed}»...`);
		send("set_seed", { seed: currentSeed, name });
	}
	controls.lock(); // el lock en el gesto es fiable; la carga cubre el cambio
}

startBtn.addEventListener("click", () => {
	const n = nameInput.value.trim();
	if (n) {
		setStoredName(n);
		send("set_name", { name: n });
	} else nameInput.value = defaultName();
	startWithSeed("");
});

seedCreateBtn.addEventListener("click", () =>
	startWithSeed(seedInput.value, worldNameInput.value)
);
seedInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") seedCreateBtn.click();
});
worldNameInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") seedCreateBtn.click();
});

// Semilla aleatoria (🎲): dos palabras + número — legible y con formato de
// semilla de Minecraft. Rellena el campo y CREA el mundo directamente (un
// solo gesto, como el "Random" de Minecraft al crear mundo).
const RANDOM_WORDS = [
	"bosque",
	"montaña",
	"llanura",
	"desierto",
	"lago",
	"valle",
	"cumbre",
	"pradera",
	"río",
	"colina",
	"isla",
	"sabana"
];
function randomSeed() {
	const a = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
	const b = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
	const n = Math.floor(Math.random() * 9000) + 1000;
	return `${a}-${b}-${n}`;
}
randomSeedBtn.addEventListener("click", () => {
	seedInput.value = randomSeed();
	startWithSeed(seedInput.value, worldNameInput.value);
});

// Lista de mundos guardados (evento worlds_list del servidor, Fase 7)
export function renderWorldsList(worlds) {
	worldsListEl.innerHTML = "";
	if (!worlds.length) {
		const empty = document.createElement("div");
		empty.className = "world-item empty";
		empty.textContent = "Todavía no hay mundos guardados.";
		worldsListEl.appendChild(empty);
		return;
	}
	for (const w of worlds) {
		const item = document.createElement("div");
		item.className = "world-item";
		const meta =
			`${w.chunkCount} chunks` +
			(w.lastSaved ? ` · ${w.lastSaved.slice(0, 19).replace("T", " ")}` : "");
		item.innerHTML =
			`<span class="wi-left"><span class="wi-name">${escapeHtml(w.name)}</span><span class="wi-seed">semilla: ${escapeHtml(w.seed)}</span></span>` +
			`<span class="wi-meta">${escapeHtml(meta)}</span>`;
		item.title = `Abrir el mundo «${w.name}» (semilla: ${w.seed})`;
		item.addEventListener("click", () => startWithSeed(w.seed));
		worldsListEl.appendChild(item);
	}
}

function escapeHtml(s) {
	return String(s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			]
	);
}

// Llamado desde network.js en cada init: actualiza la semilla activa y cierra
// la pantalla de carga. Si se pidió una semilla, espera el init que la
// confirma antes de cerrar (evita destapar el mundo anterior durante el
// cambio).
export function onWorldLoaded(seed) {
	currentSeed = seed;
	if (seedPending) {
		if (seed === seedPending) {
			seedPending = null;
			finishLoading();
		}
		return;
	}
	finishLoading();
}

// El servidor rechazó el cambio (otros jugadores en línea, mundo ilegible o
// fallo de guardado): volver al menú y avisar.
export function onSeedRejected(reason) {
	seedPending = null;
	finishLoading(); // ocultar la carga (fade) antes de mostrar el menú
	controls.unlock(); // el handler de unlock vuelve a mostrar el menú
	const msgs = {
		rechazo: "🌱 No se pudo abrir el mundo de esa semilla (formato más nuevo).",
		others:
			"🌱 Hay otros jugadores en línea: no se puede cambiar la semilla ahora.",
		error: "🌱 No se pudo guardar el mundo actual: cambio de semilla cancelado."
	};
	flashMessage(msgs[reason] || msgs.error);
}

export function applyInventory(inv) {
	inventory = inv;
	updateHotbarUI();
	updateCraftInventoryUI();
	updateFurnaceInventoryUI();
	// Solo repintar el inventario del cofre si el panel está abierto (es el
	// patrón del horno, pero sin reconstruir 36 divs en cada update si no).
	if (!chestUI.classList.contains("hidden")) updateChestInventoryUI();
}
export function applyArmor(a) {
	armor =
		a && typeof a === "object"
			? a
			: { helmet: null, chestplate: null, leggings: null, boots: null };
	updateArmorUI();
}
export function applyHealth(hp, maxHp) {
	health = hp;
	if (typeof maxHp === "number") maxHealth = maxHp;
	updateHealthUI();
}
export function applyXp(x, lvl) {
	xp = x;
	if (typeof lvl === "number") level = lvl;
	updateXpUI();
}
export function applyFood(f, s) {
	food = f;
	saturation = typeof s === "number" ? s : f; // defensivo: servidores viejos sin saturación
	updateFoodUI();
}
export function selectSlot(i) {
	selectedSlot = i;
	send("inventory_select", { slot: i });
	updateHotbarUI();
}
export function getSelectedSlot() {
	return selectedSlot;
}

export function flashMessage(text) {
	addChatLine("Sistema", text);
}

// ============================================================
// CHAT
// ============================================================
const chatLog = document.getElementById("chat-log");
const chatInput = document.getElementById("chat-input");
export function addChatLine(author, message) {
	const line = document.createElement("div");
	line.textContent = `${author}: ${message}`;
	chatLog.appendChild(line);
	while (chatLog.children.length > 8) chatLog.removeChild(chatLog.firstChild);
	setTimeout(() => line.remove(), 12000);
}
document.addEventListener("keydown", (e) => {
	if (e.key === "Enter") {
		if (chatInput.classList.contains("active")) {
			if (chatInput.value.trim())
				send("chat", { message: chatInput.value.trim() });
			chatInput.value = "";
			chatInput.classList.remove("active");
			chatInput.blur();
			controls.lock();
		} else {
			chatInput.classList.add("active");
			chatInput.focus();
			showBlocker(false); // el chat también libera el puntero sin el menú encima
			controls.unlock();
		}
	}
});

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
				`<span>${itemLabel(piece.id)}</span>` +
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
			? `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>`
			: "";
	}
	craftResultEl.style.borderColor = success ? "#8f8" : "#555";
}

function updateCraftInventoryUI() {
	craftInventoryEl.innerHTML = "";
	inventory.forEach((item, i) => {
		const el = document.createElement("div");
		el.className = "slot";
		if (item) {
			el.innerHTML = `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>`;
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

function updateFurnaceInventoryUI() {
	furnaceInventoryEl.innerHTML = "";
	inventory.forEach((item, i) => {
		const el = document.createElement("div");
		el.className = "slot";
		if (item) {
			el.innerHTML = `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>`;
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
	furnaceFuelEl.textContent = data.fuelItem
		? `${itemLabel(data.fuelItem)} (${data.fuelTicksLeft})`
		: "Combustible";
	furnaceInputEl.textContent = data.inputItem
		? `${itemLabel(data.inputItem)} x${data.inputCount}`
		: "Material";
	furnaceOutputEl.textContent = data.outputItem
		? `${itemLabel(data.outputItem)} x${data.outputCount}`
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
			el.innerHTML = `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>`;
			el.title = itemLabel(item.id);
			el.addEventListener("click", () =>
				send("chest_action", { action: "take", chestSlot: i })
			);
		}
		chestSlotsEl.appendChild(el);
	});
}

function updateChestInventoryUI() {
	chestInventoryEl.innerHTML = "";
	inventory.forEach((item, i) => {
		const el = document.createElement("div");
		el.className = "slot";
		if (item) {
			el.innerHTML = `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>`;
			el.title = itemLabel(item.id);
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

export function toggleChestUI(show, coords) {
	chestUI.classList.toggle("hidden", !show);
	if (show) {
		updateChestSlotsUI();
		updateChestInventoryUI();
		send("chest_open", coords);
		showBlocker(false); // quitar el menú para poder clicar los slots (bug inventario)
		controls.unlock();
	} else if (openChestKey) {
		send("chest_action", { action: "close" });
		openChestKey = null;
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
export function closePanels() {
	const hadPanel =
		inventoryOpen || openFurnaceKey !== null || openChestKey !== null;
	toggleCraftingUI(false);
	toggleFurnaceUI(false);
	toggleChestUI(false);
	inventoryOpen = false;
	if (hadPanel) controls.lock(); // Escape cierra el panel y reanuda el juego
}
