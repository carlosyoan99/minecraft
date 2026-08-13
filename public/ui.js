// ============================================================
// UI: HUD (hotbar, salud), chat, panel de crafteo y panel de horno
// ============================================================

import { isMuted, playChestClose, playChestOpen, setMuted } from "./audio.js"; // Fase 10 (F2): cofres
import {
	defaultName,
	defaultSkin,
	send,
	setStoredName,
	setStoredSkin
} from "./connection.js";
import {
	ARMOR_DURABILITY,
	ARMOR_SLOT_NAMES,
	BOW,
	BOW_DURABILITY,
	DURABILITY,
	itemLabel
} from "./constants.js";
import { itemIconCss } from "./itemicons.js";
import { finishLoading, showLoading } from "./loading.js";
import { recipeCategory } from "./recipeCategories.js"; // Fase 9 (F): pestañas del libro
import { controls, showBlocker } from "./scene.js";
import {
	getSettings,
	setSetting,
	settingUiValue,
	toggleFullscreen // Fase 16 (E1): pantalla completa
} from "./settings.js";
import { initSkinPreview, setPreviewSkin } from "./skinpreview.js"; // Fase 17: vista previa 3D del personaje
import { isValidSkin, paintHeadPreview, SKINS } from "./skins.js"; // Fase 17: skins de jugador

// Estado que dibuja el HUD (lo actualiza la red; lo lee el input)
let inventory = new Array(36).fill(null);
let selectedSlot = 0;
let craftingGrid = new Array(9).fill(null);
let openFurnaceKey = null;
let health = 20;
let maxHealth = 20; // Fase 5: sube con el nivel (máx +10)
let food = 20;
let saturation = 20; // barra dorada sobre la comida (como en Minecraft)
let level = 0; // Fase 5: niveles simples
// Fase 9 (Bloque C): progreso DENTRO del nivel actual para la barra de XP
// (curva MC no lineal). El servidor los manda en cada xp_update (sendXp);
// por defecto 0/100 para no romper la barra antes del primer update.
let xpInto = 0;
let xpToNext = 100;
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
// ¿Hay un campo editable enfocado? (chat, nombre de jugador/mundo, semilla…).
// Con un input enfocado, las teclas de juego (E, WASD, 1-9, F3, Espacio) se
// ignoran en input.js: si no, pulsar "e" al escribir un nombre abriría el
// inventario (B5) o W/A/S/D moverían al jugador mientras se teclea.
export function isTyping() {
	const el = document.activeElement;
	if (!el) return false;
	const tag = el.tagName;
	return (
		tag === "INPUT" ||
		tag === "TEXTAREA" ||
		tag === "SELECT" ||
		el.isContentEditable
	);
}

// Icono procedural del ítem (Fase 7): sprite del atlas recortado por CSS.
// Fallback al texto si el ítem aún no tiene icono (defensivo para ítems
// futuros). `scale` agranda la tesela (hotbar 1.5x, paneles 1x).
function itemVisual(id, scale = 1) {
	const css = itemIconCss(id, scale);
	return css
		? `<div class="item-ico${scale > 1 ? " item-ico-lg" : ""}" style="background:${css}"></div>`
		: `<span class="item-txt">${itemLabel(id)}</span>`;
}

// ============================================================
// HOTBAR Y SALUD
// ============================================================
const hotbarEl = document.getElementById("hotbar");

// Fase 15 (D3): tooltip estilizado del hotbar. Muestra el nombre del ítem y,
// si tiene durabilidad, el estado actual (igual que la barrita bajo el slot).
const tooltipEl = document.getElementById("tooltip");

// Auditoría 2026-08-09 (§4.5): el hotbar usaba updateHotbarUI → innerHTML = ""
// y recreaba 9 divs + 2 listeners cada vez que llegaba un inventory_update
// (más de 18 nodos DOM descartados y re-fabricados por recarga, incluso si
// solo había cambiado un slot o nada). Ahora los 9 slots se crean UNA vez,
// se re-renderiza solo el slot cuyo contenido cambió y los eventos se delegan
// en el contenedor (click/mouseenter/mouseleave con data-i), sin attach por
// slot en cada refresco.
const slotEls = Array.from({ length: 9 }, (_, i) => {
	const s = document.createElement("div");
	s.className = "hotbar-slot";
	s.dataset.i = i;
	hotbarEl.appendChild(s);
	return s;
});
let hoveredSlot = -1; // para no reescribir el tooltip si ya está mostrando este slot

// Fase 16 (B4, CL-1): durabilidad máxima real de un ítem. El fallback global
// BOW_DURABILITY hacía que TODO ítem sin durabilidad (adoquín, comida, ...)
// mostrara una barra fantasma "384/384" — solo el arco (BOW) usa ese valor.
function maxDurability(item) {
	return (
		DURABILITY[item.id] ||
		ARMOR_DURABILITY[item.id] ||
		(item.id === BOW ? BOW_DURABILITY : 0)
	);
}

const slotHtml = (i) => {
	const item = inventory[i];
	if (!item) return "";
	let html = `${itemVisual(item.id, 1.5)}<span class="count">${item.count}</span>`;
	const maxD = maxDurability(item);
	if (maxD) {
		const cur = typeof item.durability === "number" ? item.durability : maxD;
		const pct = Math.max(0, Math.min(100, (cur / maxD) * 100));
		const color = pct > 50 ? "#5fd34f" : pct > 20 ? "#e8b93f" : "#e8544f";
		html += `<div class="durbar"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></div>`;
	}
	return html;
};

function updateHotbarUI() {
	tooltipEl.classList.add("hidden");
	hoveredSlot = -1;
	for (let i = 0; i < 9; i++) {
		const slot = slotEls[i];
		const item = inventory[i];
		// Solo tocar el DOM si cambió el contenido o la selección.
		const nextHtml = slotHtml(i);
		if (slot.innerHTML !== nextHtml) slot.innerHTML = nextHtml;
		const cls = `hotbar-slot${i === selectedSlot ? " selected" : ""}`;
		if (slot.className !== cls) slot.className = cls;
	}
}

// Selección por click (delegado en el contenedor, no por slot).
hotbarEl.addEventListener("click", (ev) => {
	const slot = ev.target.closest(".hotbar-slot");
	if (!slot) return;
	const i = Number(slot.dataset.i);
	if (i === selectedSlot) return;
	selectedSlot = i;
	send("inventory_select", { slot: i });
	updateHotbarUI();
});

// Tooltip por hover (delegado; requiere DOM un poco: el texto va al elemento).
const slotTooltipHtml = (item) => {
	const maxD = maxDurability(item);
	let html = `<span class="tt-name">${itemLabel(item.id)}</span>`;
	if (maxD) {
		const cur = typeof item.durability === "number" ? item.durability : maxD;
		html += `<span class="tt-dur">${cur}/${maxD}</span>`;
	}
	return html;
};
hotbarEl.addEventListener("mouseover", (ev) => {
	const slot = ev.target.closest(".hotbar-slot");
	const i = slot ? Number(slot.dataset.i) : -1;
	if (i < 0) return;
	if (i === hoveredSlot && !tooltipEl.classList.contains("hidden")) return;
	const item = inventory[i];
	if (!item) return;
	hoveredSlot = i;
	tooltipEl.innerHTML = slotTooltipHtml(item);
	tooltipEl.classList.remove("hidden");
});
hotbarEl.addEventListener("mouseout", (ev) => {
	const slot = ev.target.closest(".hotbar-slot");
	if (!slot || slot.contains(ev.relatedTarget)) return;
	hoveredSlot = -1;
	tooltipEl.classList.add("hidden");
});
function updateHealthUI() {
	document.getElementById("hp").textContent = health;
	document.getElementById("maxhp").textContent = maxHealth;
}
function updateXpUI() {
	const fill = document.getElementById("xp-fill");
	// Fase 9 (Bloque C): la curva de niveles ya no es lineal — el servidor
	// manda xpInto (XP dentro del nivel) y xpToNext (XP para el siguiente) en
	// cada xp_update, y la barra pinta el progreso real de la curva MC.
	const pct = xpToNext > 0 ? (xpInto / xpToNext) * 100 : 0;
	fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
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
// MENÚ (Fase 7 + Fase 17): pantallas principal / mundos / nuevo mundo /
// ajustes / pausa, nombre de jugador y semilla del mundo. Fase 17 (A5): el
// servidor puede arrancar en MODO MENÚ (sin mundo activo — sin SEED): el
// cliente recibe `menu_state` con la lista de mundos y NO entra al juego
// hasta que el jugador elige/crea uno (join_world). Con SEED en el entorno
// el servidor arranca directo al mundo (init) y el flujo es el clásico.
// ============================================================
const menuMain = document.getElementById("menu-main");
const menuWorlds = document.getElementById("menu-worlds");
const menuCreate = document.getElementById("menu-create");
const menuSettings = document.getElementById("menu-settings");
const menuPause = document.getElementById("menu-pause");
const startBtn = document.getElementById("start-btn");
const settingsBtn = document.getElementById("settings-btn");
const quitBtn = document.getElementById("quit-btn");
const worldsBackBtn = document.getElementById("worlds-back-btn");
const createBackBtn = document.getElementById("create-back-btn");
const newWorldBtn = document.getElementById("new-world-btn");
const settingsBackBtn = document.getElementById("settings-back-btn");
const worldsListEl = document.getElementById("worlds-list");
const worldNameInput = document.getElementById("world-name-input");
const seedInput = document.getElementById("seed-input");
const seedCreateBtn = document.getElementById("seed-create-btn");
const randomSeedBtn = document.getElementById("random-seed-btn");
// Fase 17 (C1): pantalla de pausa (Esc dentro del juego).
const pauseResumeBtn = document.getElementById("pause-resume-btn");
const pauseSettingsBtn = document.getElementById("pause-settings-btn");
const pauseQuitBtn = document.getElementById("pause-quit-btn");
// Fase 9 (Bloque B): selector de modo al crear un mundo NUEVO.
const gamemodeSelect = document.getElementById("gamemode-select");
// Fase 10 (B1): tamaño del mundo nuevo (small/medium/large; debug/infinito
// quedan internos y no se ofrecen aquí).
const sizeSelect = document.getElementById("world-size-select");
const nameInput = document.getElementById("name-input");
const rdSlider = document.getElementById("rd-slider");
const rdValue = document.getElementById("rd-value");
const coordsToggle = document.getElementById("coords-toggle");
// B1 (Fase 8): invertir el eje lateral A/D (persistido en mc_settings)
const invertToggle = document.getElementById("invert-toggle");
// Fase 7: FOV, sensibilidad, volumen por categoría y calidad gráfica
const fovSlider = document.getElementById("fov-slider");
const fovValue = document.getElementById("fov-value");
const sensSlider = document.getElementById("sens-slider");
const sensValue = document.getElementById("sens-value");
const volMaster = document.getElementById("vol-master");
const volMasterValue = document.getElementById("vol-master-value");
const volEffects = document.getElementById("vol-effects");
const volEffectsValue = document.getElementById("vol-effects-value");
const volAmbient = document.getElementById("vol-ambient");
const volAmbientValue = document.getElementById("vol-ambient-value");
const qualitySelect = document.getElementById("quality-select");
// Fase 16 (E1): pantalla completa (F11 / checkbox de ajustes)
const fullscreenToggle = document.getElementById("fullscreen-toggle");
let currentSeed = null; // semilla activa (la trae el init del servidor)
let seedPending = null; // semilla pedida en el menú, pendiente de confirmar
// Fase 17 (A5): el cliente empieza EN EL MENÚ hasta recibir el init de un
// mundo (join_world). Con SEED (modo clásico) el init llega al conectar y
// pasa a false de inmediato; tras leave_world vuelve a true.
let inMenu = true;
// Fase 9 (Bloque B): modo de juego del mundo activo (survival/creative). El
// servidor es la fuente de verdad (init.gamemode); el cliente lo refleja en
// el HUD (badge) y lo usa para avisos de vuelo/creativo.
let gamemode = "survival";
export function getGamemode() {
	return gamemode;
}

export function applyGamemode(mode) {
	gamemode = mode === "creative" ? "creative" : "survival";
	updateGamemodeBadge();
}

// Badge del modo en el HUD (esquina superior izquierda, sobre la salud): en
// creative se ve el modo y un aviso de doble-espacio para volar.
const gamemodeEl = document.createElement("div");
gamemodeEl.id = "gamemode-badge";
gamemodeEl.className = "hidden";
document.body.insertBefore(gamemodeEl, document.getElementById("info"));
function updateGamemodeBadge() {
	gamemodeEl.classList.toggle("hidden", !controls.isLocked);
	if (gamemode === "creative") {
		gamemodeEl.innerHTML = "✦ CREATIVO <small>— doble Espacio vuela</small>";
		gamemodeEl.className = "creative";
	} else {
		gamemodeEl.innerHTML = "✦ Supervivencia";
		gamemodeEl.className = "";
	}
}

function showMenuScreen(which) {
	for (const el of [menuMain, menuWorlds, menuCreate, menuSettings, menuPause])
		el.classList.toggle("hidden", el !== which);
}

// Fase 17 (A5/D1): ¿pantalla táctil? (joystick virtual + botones). El ratón
// y el teclado siguen siendo el camino principal; el HUD táctil es un extra.
export function isTouchDevice() {
	return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

// Fase 17 (A1/A5/C1): muestra el MENÚ (estado `menu_state` del servidor o
// al volver al menú principal): cierra la carga, pinta la lista de mundos y
// deja el bloqueador visible. `worlds` opcional refresca la lista.
export function showMenu(worlds) {
	inMenu = true;
	setTouchVisible(false);
	if (worlds) renderWorldsList(worlds);
	showMenuScreen(menuMain);
	showBlocker(true);
	finishLoading();
}

// Fase 17 (C1): pantalla de pausa — Esc en el juego (sin paneles abiertos).
// Libera el puntero para clicar los botones; Continuar lo vuelve a bloquear.
export function showPause() {
	showMenuScreen(menuPause);
	showBlocker(true);
	controls.unlock();
}
export function resumeGame() {
	menuPause.classList.add("hidden");
	controls.lock();
}
export function isPauseOpen() {
	return !menuPause.classList.contains("hidden");
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

// ============================================================
// SELECTOR DE SKINS (Fase 17)
// Grid de los 9 skins oficiales (Steve, Alex, Noor, Sunny, Ari,
// Zuri, Makena, Kai, Efe) con miniatura procedural de la cabeza.
// La elección se persiste en localStorage (mc_skin, connection.js)
// y se envía al servidor con set_skin (lo propaga a los demás en
// vivo con player_skin). Es preferencia del CLIENTE, como el
// nombre: no viaja en el guardado de mundos.
// ============================================================
let selectedSkin = defaultSkin();
const skinGrid = document.getElementById("skin-grid");
function selectSkin(id) {
	if (!isValidSkin(id) || id === selectedSkin) return;
	selectedSkin = id;
	setStoredSkin(id);
	send("set_skin", { skin: id });
	refreshSkinSelector();
	setPreviewSkin(id); // la figura 3D del menú cambia en vivo
}
function refreshSkinSelector() {
	for (const card of skinGrid.children)
		card.classList.toggle("selected", card.dataset.skin === selectedSkin);
}
// Se construye una vez: miniatura 56px (escala 3) + nombre bajo la cabeza.
for (const s of SKINS) {
	const card = document.createElement("button");
	card.type = "button";
	card.className = "skin-card";
	card.dataset.skin = s.id;
	card.title = `Skin de ${s.label}`;
	const c = document.createElement("canvas");
	c.width = c.height = 48;
	const g = c.getContext("2d");
	g.imageSmoothingEnabled = false;
	paintHeadPreview(g, s.id, 48);
	const label = document.createElement("span");
	label.textContent = s.label;
	card.append(c, label);
	card.addEventListener("click", () => selectSkin(s.id));
	skinGrid.appendChild(card);
}
refreshSkinSelector();
// Vista previa 3D giratoria del personaje (arranca con la skin guardada).
initSkinPreview();

// Fase 17 (A2): «Un jugador» muestra la lista de mundos (el flujo de
// set_seed directo queda solo para el modo clásico con SEED).
startBtn.addEventListener("click", () => {
	const n = nameInput.value.trim();
	if (n) {
		setStoredName(n);
		send("set_name", { name: n });
	} else nameInput.value = defaultName();
	showMenuScreen(menuWorlds);
	send("worlds_list"); // el servidor responde y renderWorldsList pinta la lista
});
newWorldBtn.addEventListener("click", () => showMenuScreen(menuCreate));
worldsBackBtn.addEventListener("click", () => showMenuScreen(menuMain));
createBackBtn.addEventListener("click", () => showMenuScreen(menuWorlds));
// Fase 17 (A2): «Salir» no hace nada destructivo (el navegador bloquea
// window.close() salvo pestañas abiertas por el propio script).
quitBtn.addEventListener("click", () => {
	flashMessage(
		"👋 Salir no está disponible en el navegador (cierra la pestaña)."
	);
	try {
		window.close();
	} catch {
		/* sin acción */
	}
});

// Rellena los controles de ajustes con los valores guardados (lo usa tanto
// el menú principal como la pausa — Fase 17, C1).
let settingsReturnTo = menuMain; // pantalla a la que vuelve «Volver» de ajustes
function refreshSettingsUI() {
	const s = getSettings();
	rdSlider.value = s.renderDistance;
	rdValue.textContent = s.renderDistance;
	coordsToggle.checked = s.showCoords;
	invertToggle.checked = s.invertControls;
	// Fase 7: rellenar los nuevos controles con los valores guardados
	fovSlider.value = s.fov;
	fovValue.textContent = `${s.fov}°`;
	sensSlider.value = settingUiValue("sensitivity");
	sensValue.textContent = `${settingUiValue("sensitivity")}%`;
	volMaster.value = settingUiValue("volumeMaster");
	volMasterValue.textContent = `${settingUiValue("volumeMaster")}%`;
	volEffects.value = settingUiValue("volumeEffects");
	volEffectsValue.textContent = `${settingUiValue("volumeEffects")}%`;
	volAmbient.value = settingUiValue("volumeAmbient");
	volAmbientValue.textContent = `${settingUiValue("volumeAmbient")}%`;
	qualitySelect.value = s.quality;
	// Fase 16 (E1): el checkbox refleja la preferencia guardada (el estado real
	// del navegador puede divergir si se salió con Esc — lo sincroniza
	// fullscreenchange en settings.js).
	fullscreenToggle.checked = !!s.fullscreen;
}
settingsBtn.addEventListener("click", () => {
	settingsReturnTo = menuMain;
	showMenuScreen(menuSettings);
	refreshSettingsUI();
});
pauseSettingsBtn.addEventListener("click", () => {
	settingsReturnTo = menuPause;
	showMenuScreen(menuSettings);
	refreshSettingsUI();
});
settingsBackBtn.addEventListener("click", () =>
	showMenuScreen(settingsReturnTo)
);

// Fase 17 (A4): pestañas de ajustes (Video / Audio / Controles) — solo
// alternan paneles; la lógica de cada ajuste sigue intacta en settings.js.
for (const tab of document.querySelectorAll(".st-tab")) {
	tab.addEventListener("click", () => {
		for (const t of document.querySelectorAll(".st-tab"))
			t.classList.toggle("active", t === tab);
		const pane = document.getElementById(`pane-${tab.dataset.tab}`);
		for (const p of document.querySelectorAll(".settings-pane"))
			p.classList.toggle("hidden", p !== pane);
	});
}

// Fase 17 (C1): pausa — Continuar reanuda; Volver al menú principal envía
// leave_world (el servidor persiste al jugador y responde menu_state).
pauseResumeBtn.addEventListener("click", resumeGame);
pauseQuitBtn.addEventListener("click", () => {
	if (inMenu) return;
	showLoading("Volviendo al menú...");
	send("leave_world");
});

rdSlider.addEventListener("input", () => {
	rdValue.textContent = rdSlider.value;
	setSetting("renderDistance", parseInt(rdSlider.value, 10));
});
// Fase 7: FOV, sensibilidad, volúmenes y calidad (persisten en mc_settings)
fovSlider.addEventListener("input", () => {
	fovValue.textContent = `${fovSlider.value}°`;
	setSetting("fov", parseInt(fovSlider.value, 10));
});
sensSlider.addEventListener("input", () => {
	sensValue.textContent = `${sensSlider.value}%`;
	setSetting("sensitivity", parseInt(sensSlider.value, 10) / 100);
});
volMaster.addEventListener("input", () => {
	volMasterValue.textContent = `${volMaster.value}%`;
	setSetting("volumeMaster", parseInt(volMaster.value, 10) / 100);
});
volEffects.addEventListener("input", () => {
	volEffectsValue.textContent = `${volEffects.value}%`;
	setSetting("volumeEffects", parseInt(volEffects.value, 10) / 100);
});
volAmbient.addEventListener("input", () => {
	volAmbientValue.textContent = `${volAmbient.value}%`;
	setSetting("volumeAmbient", parseInt(volAmbient.value, 10) / 100);
});
qualitySelect.addEventListener("change", () =>
	setSetting("quality", qualitySelect.value)
);
coordsToggle.addEventListener("change", () =>
	setSetting("showCoords", coordsToggle.checked)
);
invertToggle.addEventListener("change", () =>
	setSetting("invertControls", invertToggle.checked)
);
// Fase 16 (E1): el cambio del checkbox es un gesto de usuario válido para el
// Fullscreen API — toggleFullscreen() hace la petición real al navegador.
fullscreenToggle.addEventListener("change", () => toggleFullscreen());

// Fase 17 (A5): entrar a un mundo (existente o nuevo) desde el menú — envía
// join_world { seed, name, gamemode, size }; el servidor carga/crea el mundo
// y responde con el init (onWorldLoaded lo espera para cerrar la carga). Con
// semilla vacía se genera una aleatoria (el servidor exige semilla no vacía).
// El puntero se bloquea en el gesto (patrón de siempre); en táctil no hay
// pointer lock: se oculta el bloqueador directamente.
function joinWorld(worldSeed, worldName, mode, size) {
	const seed = (worldSeed || "").trim() || randomSeed();
	const name = (worldName || "").trim();
	seedPending = seed;
	showLoading(`Generando el mundo «${seed}»...`);
	send("join_world", {
		seed,
		name: name || undefined,
		gamemode: mode || undefined,
		size: size || undefined
	});
	if (isTouchDevice()) {
		showBlocker(false);
	} else {
		controls.lock(); // el lock en el gesto es fiable; la carga cubre el cambio
	}
}

seedCreateBtn.addEventListener("click", () =>
	joinWorld(
		seedInput.value,
		worldNameInput.value,
		gamemodeSelect.value,
		sizeSelect ? sizeSelect.value : undefined
	)
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
	joinWorld(seedInput.value, worldNameInput.value, gamemodeSelect.value);
});

// Botón pequeño de acción por mundo (Fase 17, A3): clonar, renombrar,
// cambiar modo y borrar. `onClick` no abre el mundo (stopPropagation).
function makeWorldActionBtn(icon, title, onClick) {
	const b = document.createElement("button");
	b.type = "button";
	b.className = "world-action";
	b.textContent = icon;
	b.title = title;
	b.addEventListener("click", (e) => {
		e.stopPropagation();
		onClick();
	});
	return b;
}

// Lista de mundos guardados (evento worlds_list del servidor, Fase 7).
// Fase 9 (Bloque B): badge de modo por mundo. Fase 17 (A3): gestión completa
// — reproducir (clic en el ítem), clonar (world_clone), renombrar
// (world_rename), cambiar modo (world_gamemode) y borrar (world_delete; el
// activo no se puede borrar — el servidor lo rechaza). Clonar/renombrar/camb
// mode son SOLO de operadores (el primer jugador conectado es op).
export function renderWorldsList(worlds) {
	worldsListEl.innerHTML = "";
	if (!worlds.length) {
		const empty = document.createElement("div");
		empty.className = "world-item empty";
		empty.innerHTML =
			"Todavía no hay mundos guardados.<br><small>Pulsa «✨ Crear nuevo mundo» para empezar.</small>";
		worldsListEl.appendChild(empty);
		return;
	}
	for (const w of worlds) {
		const item = document.createElement("div");
		item.className = "world-item";
		const mode = w.gamemode === "creative" ? "creative" : "survival";
		const meta =
			`${w.chunkCount} chunks` +
			(w.lastSaved ? ` · ${w.lastSaved.slice(0, 19).replace("T", " ")}` : "");
		const badge = `<span class="mode-badge ${mode}">${mode === "creative" ? "✦" : "⛏"} ${mode === "creative" ? "Creativo" : "Supervivencia"}</span>`;
		// Fase 10 (B1): badge de tamaño (256/512/1024 bloques por lado; los
		// mundos viejos sin el campo se ven como 8192 = "Infinito").
		const sizeName = {
			256: "Pequeño",
			512: "Medio",
			1024: "Grande",
			8192: "Infinito"
		};
		const sizeBadge = `<span class="mode-badge size">🗺 ${sizeName[w.worldSize] || `${w.worldSize}×${w.worldSize}`}</span>`;
		const left = document.createElement("span");
		left.className = "wi-left";
		left.innerHTML = `<span class="wi-name">${escapeHtml(w.name)}</span>${badge}${sizeBadge}<span class="wi-seed">semilla: ${escapeHtml(w.seed)}</span>`;
		const metaEl = document.createElement("span");
		metaEl.className = "wi-meta";
		metaEl.textContent = meta;
		const actions = document.createElement("span");
		actions.className = "world-actions";
		actions.append(
			makeWorldActionBtn(
				"📋",
				`Clonar «${w.name}» (copia a una semilla nueva)`,
				() => {
					const name = prompt(
						`Nombre del clon de «${w.name}»:`,
						`${w.name} (copia)`
					);
					if (name === null) return;
					send("world_clone", { seed: w.seed, name: name.trim() });
				}
			),
			makeWorldActionBtn("✏️", `Renombrar «${w.name}»`, () => {
				const name = prompt(`Nuevo nombre del mundo «${w.name}»:`, w.name);
				if (name === null || !name.trim()) return;
				send("world_rename", { seed: w.seed, name: name.trim() });
			}),
			makeWorldActionBtn(
				mode === "creative" ? "⛏" : "✦",
				mode === "creative"
					? `«${w.name}» es Creativo → cambiar a Supervivencia`
					: `«${w.name}» es Supervivencia → cambiar a Creativo`,
				() =>
					send("world_gamemode", {
						seed: w.seed,
						gamemode: mode === "creative" ? "survival" : "creative"
					})
			),
			makeWorldActionBtn(
				"🗑️",
				`Borrar «${w.name}» (no se puede deshacer)`,
				() => {
					if (w.active) {
						flashMessage(
							"🌍 No se puede borrar el mundo activo: entra a otro y vuelve."
						);
						return;
					}
					if (
						confirm(
							`¿Borrar el mundo «${w.name}» (semilla ${w.seed})? No se puede deshacer.`
						)
					) {
						send("world_delete", { seed: w.seed });
					}
				}
			)
		);
		item.append(left, metaEl, actions);
		item.title = `Abrir el mundo «${w.name}» (semilla: ${w.seed})`;
		item.addEventListener("click", () => joinWorld(w.seed, "", w.gamemode));
		worldsListEl.appendChild(item);
	}
}

// Resultado de un borrado de mundo (world_delete_result del servidor). El
// servidor ya reenvía la lista nueva (data.worlds) en el mismo evento.
export function onWorldDeleted(ok, reason) {
	if (ok) {
		flashMessage("🗑️ Mundo borrado.");
	} else if (reason === "active") {
		flashMessage(
			"🌍 No se puede borrar el mundo activo: entra a otro y vuelve."
		);
	} else if (reason === "invalid") {
		flashMessage("🌍 Semilla no válida: no se borró nada.");
	} else {
		flashMessage("🌍 No se pudo borrar el mundo (¿está en uso?).");
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
// Fase 17 (D1): mostrar/ocultar el HUD táctil — evento a window que escucha
// input.js (así no hay ciclo de imports; ui.js e input.js se importan entre
// sí). En táctil se muestran al entrar al mundo y se ocultan en el menú.
function setTouchVisible(show) {
	window.dispatchEvent(
		new CustomEvent("mc-touch-visibility", { detail: !!show })
	);
}

export function onWorldLoaded(seed) {
	currentSeed = seed;
	inMenu = false;
	setTouchVisible(true);
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
	inMenu = true;
	finishLoading(); // ocultar la carga (fade) antes de mostrar el menú
	showBlocker(true);
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

// ============================================================
// LIBRO DE RECETAS (Fase 9, Bloque F)
// Todas las recetas visibles, agrupadas por categoría del resultado
// (bloques, herramientas, armadura, comida, materiales). Se abre con B
// (input.js) y pide las tablas al servidor (recipe_book). Sin desbloqueo
// progresivo: el libro enseña TODO desde el principio.
// ============================================================
const recipeBook = document.getElementById("recipe-book");
const recipeTabs = document.getElementById("recipe-tabs");
const recipeList = document.getElementById("recipe-list");
let recipeData = { crafting: {}, furnace: {} };
let recipeTab = "bloques";

const RECIPE_CATEGORIES = [
	["bloques", "🧱 Bloques"],
	["herramientas", "🛠️ Herramientas"],
	["armadura", "🛡️ Armadura"],
	["comida", "🍗 Comida"],
	["materiales", "📦 Materiales"]
];

// Icono pequeño (escala 0.9) del ítem para las listas del libro.
function recipeIcon(id) {
	return itemVisual(id, 0.9);
}

// Pinta el resultado del crafteo como fila de iconos del shape 3x3.
function shapeRow(shape, ingredients) {
	let html = '<div class="recipe-shape">';
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			const ch = shape[r]?.[c] || " ";
			const id = ingredients[ch];
			html +=
				id !== undefined
					? `<span class="recipe-cell" title="${itemLabel(id)}">${recipeIcon(id)}</span>`
					: '<span class="recipe-cell empty"></span>';
		}
	}
	return `${html}</div>`;
}

export function renderRecipeBook(data) {
	recipeData = {
		crafting: data?.crafting || {},
		furnace: data?.furnace || {}
	};
	buildRecipeTabs();
	if (!recipeBook.classList.contains("hidden")) renderRecipeTab();
}

function buildRecipeTabs() {
	recipeTabs.innerHTML = "";
	for (const [key, label] of RECIPE_CATEGORIES) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = `recipe-tab${recipeTab === key ? " active" : ""}`;
		btn.textContent = label;
		btn.addEventListener("click", () => {
			recipeTab = key;
			buildRecipeTabs();
			renderRecipeTab();
		});
		recipeTabs.appendChild(btn);
	}
}

function renderRecipeTab() {
	recipeList.innerHTML = "";
	const items = [];
	// Crafteo: cada receta agrupada por el resultado (puede haber varias con
	// el mismo resultado → distintas formas: tablones, escaleras...).
	for (const [name, r] of Object.entries(recipeData.crafting)) {
		const resultId = r.result?.id;
		if (recipeCategory(resultId) !== recipeTab) continue;
		items.push({ name, r });
	}
	// Horno: fundición (resultado de horno en la categoría correspondiente).
	for (const [name, r] of Object.entries(recipeData.furnace)) {
		const resultId = r.result?.id;
		if (recipeCategory(resultId) !== recipeTab) continue;
		items.push({ name, r, furnace: true });
	}
	if (!items.length) {
		const empty = document.createElement("div");
		empty.className = "recipe-item empty";
		empty.textContent = "No hay recetas en esta categoría.";
		recipeList.appendChild(empty);
		return;
	}
	for (const { name, r, furnace } of items) {
		const el = document.createElement("div");
		el.className = "recipe-item";
		const result = r.result;
		// Horno: la clave de la receta ES el id del ítem de entrada
		// (recetas_horno.json: "107" → carne cruda → cocinada). El campo `time`
		// es solo duración; no se busca dentro del objeto.
		const inputId = furnace ? parseInt(name, 10) : null;
		el.innerHTML = `
			<span class="recipe-result" title="${itemLabel(result.id)}">${recipeIcon(result.id)}</span>
			<span class="recipe-info">
				<b>${itemLabel(result.id)}</b>${result.count > 1 ? ` ×${result.count}` : ""}
				<small>${furnace ? `Horno · ${itemLabel(inputId)}` : "Crafteo"}</small>
			</span>
			${furnace ? `<span class="recipe-time">⏱ ${r.time / 10}s</span>` : shapeRow(r.shape, r.ingredients)}
		`;
		recipeList.appendChild(el);
	}
}

// Abre/cierra el libro (tecla B). Al abrirlo pide las recetas si no las
// tiene aún (recipe_book del servidor); el pointer se libera para clicar.
export function toggleRecipeBook() {
	// Auditoría 2026-08-09 (§3.3): classList.toggle devuelve true cuando la
	// clase QUEDA presente, no cuando el panel se abre. Antes el puntero se
	// bloqueaba al ABRIR el libro (las pestañas no eran clicables) y se
	// liberaba al cerrarlo — justo al revés. Se captura el estado previo.
	const opening = recipeBook.classList.contains("hidden");
	recipeBook.classList.toggle("hidden");
	if (opening) {
		send("recipe_book");
		showBlocker(false);
		controls.unlock();
	} else {
		controls.lock();
	}
	return opening;
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
export function applyXp(_xp, lvl, into, toNext) {
	// _xp: XP total (sin uso visual directo; la barra usa xpInto/xpToNext).
	if (typeof lvl === "number") level = lvl;
	// Fase 9 (Bloque C): el servidor envía xpInto/xpToNext de la curva MC
	// (players.js sendXp); el init también los incluye desde la Fase 9.
	if (typeof into === "number") xpInto = into;
	if (typeof toNext === "number" && toNext > 0) xpToNext = toNext;
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
// PANTALLA DE MUERTE CON CAUSA (Fase 10, B2)
// El servidor envía `cause` en player_die (source de la telemetría de daño:
// mob/fall/lava/starve/void/kill...). Se muestra ~3s con el texto legible y
// desaparece sola (el respawn ya lo hizo el servidor al instante).
// ============================================================
const deathScreen = document.getElementById("death-screen");
const deathCauseEl = document.getElementById("death-cause");
const DEATH_CAUSES = {
	mob: "Te ha matado un mob (o una explosión).",
	fall: "Has caído desde muy alto.",
	lava: "Has ardido en la lava.",
	starve: "Has muerto de inanición.",
	void: "Has caído al vacío.",
	kill: "Has sido eliminado."
};
let deathTimer = null;
export function showDeathScreen(cause) {
	if (!deathScreen || !deathCauseEl) return;
	deathCauseEl.textContent = DEATH_CAUSES[cause] || "Has muerto.";
	deathScreen.classList.remove("hidden");
	clearTimeout(deathTimer);
	deathTimer = setTimeout(() => deathScreen.classList.add("hidden"), 3000);
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

// Fase 16 (B4): tooltip estilizado (patrón del hotbar) para los slots del
// inventario en paneles — nombre + durabilidad al hover.
function attachSlotTooltip(el, item) {
	if (!item) return;
	el.addEventListener("mouseenter", () => {
		tooltipEl.innerHTML = slotTooltipHtml(item);
		tooltipEl.classList.remove("hidden");
	});
	el.addEventListener("mouseleave", () => tooltipEl.classList.add("hidden"));
}

function updateCraftInventoryUI() {
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

function updateFurnaceInventoryUI() {
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

function updateChestInventoryUI() {
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
export function closePanels() {
	const hadPanel =
		inventoryOpen ||
		pickerOpen || // Fase 10 (D4): el picker creativo también se cierra con Escape
		openFurnaceKey !== null ||
		openChestKey !== null ||
		!recipeBook.classList.contains("hidden");
	toggleCraftingUI(false);
	toggleFurnaceUI(false);
	toggleChestUI(false);
	if (pickerOpen) togglePicker();
	inventoryOpen = false;
	if (!recipeBook.classList.contains("hidden")) toggleRecipeBook();
	if (hadPanel) controls.lock(); // Escape cierra el panel y reanuda el juego
}
