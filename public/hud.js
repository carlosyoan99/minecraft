// ============================================================
// HUD (Fase 18, D-6): hotbar, salud/comida/XP, tooltip, silencio,
// badge de gamemode, chat y pantalla de muerte. Extraído de ui.js;
// ui.js es el orquestador que re-exporta esta fachada.
// ============================================================
import { isMuted, setMuted } from "./audio.js";
import { send } from "./connection.js";
import {
	ARMOR_DURABILITY,
	ARMOR_SLOT_NAMES,
	BOW,
	BOW_DURABILITY,
	DURABILITY,
	itemLabel
} from "./constants.js";
import { itemIconCss } from "./itemicons.js";
import { controls, showBlocker } from "./scene.js";

// Estado que dibuja el HUD (lo actualiza la red; lo lee el input)
export let inventory = new Array(36).fill(null);
let selectedSlot = 0;
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
export function itemVisual(id, scale = 1) {
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
export const tooltipEl = document.getElementById("tooltip");

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
let _hoveredSlot = -1; // para no reescribir el tooltip si ya está mostrando este slot

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

export function updateHotbarUI() {
	tooltipEl.classList.add("hidden");
	_hoveredSlot = -1;
	for (let i = 0; i < 9; i++) {
		const slot = slotEls[i];
		const _item = inventory[i];
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
export const slotTooltipHtml = (item) => {
	const maxD = maxDurability(item);
	let html = `<span class="tt-name">${itemLabel(item.id)}</span>`;
	if (maxD) {
		const cur = typeof item.durability === "number" ? item.durability : maxD;
		html += `<span class="tt-dur">${cur}/${maxD}</span>`;
	}
	return html;
};

// Fase 19 (C): aparición del tooltip con delay (~200 ms al hover, como
// Minecraft) y ocultación inmediata al salir. Centraliza el timer para que
// hotbar y paneles usen el mismo comportamiento (y el mismo estilo).
let tooltipTimer = null;
export function showTooltip(html, delay = 200) {
	clearTimeout(tooltipTimer);
	tooltipTimer = setTimeout(() => {
		tooltipEl.innerHTML = html;
		tooltipEl.classList.remove("hidden");
	}, delay);
}
export function hideTooltip() {
	clearTimeout(tooltipTimer);
	tooltipEl.classList.add("hidden");
}

hotbarEl.addEventListener("mouseover", (ev) => {
	const slot = ev.target.closest(".hotbar-slot");
	const i = slot ? Number(slot.dataset.i) : -1;
	if (i < 0) return;
	const item = inventory[i];
	if (!item) return;
	_hoveredSlot = i;
	showTooltip(slotTooltipHtml(item));
});
hotbarEl.addEventListener("mouseout", (ev) => {
	const slot = ev.target.closest(".hotbar-slot");
	if (!slot || slot.contains(ev.relatedTarget)) return;
	_hoveredSlot = -1;
	hideTooltip();
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
// BADGE DEL MODO DE JUEGO (Fase 9, Bloque B) + estado del modo
// ============================================================
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

// ============================================================
// APLICADORES DE ESTADO (los llama network.js)
// ============================================================
// Actualiza el inventario y repinta la hotbar. Los paneles (craft/cofre/
// horno) los repinta el orquestador ui.js (applyInventory) después.
export function setInventory(inv) {
	inventory = inv;
	updateHotbarUI();
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

// ============================================================
// CHAT + MENSAJES FLASH
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
export function flashMessage(text) {
	addChatLine("Sistema", text);
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
