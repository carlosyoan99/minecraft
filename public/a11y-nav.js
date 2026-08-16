// ============================================================
// NAVEGACIÓN POR TECLADO EN PANELES (Fase 19.5, B1 — accesibilidad)
// Con un panel abierto (inventario/crafteo, horno, cofre, picker), Tab /
// Shift+Tab recorren los slots visibles con foco visible (clase .a11y-focus)
// y Enter/Espacio dispara el click real del slot enfocado (que ya ejecuta su
// acción: grid_set, chest_action, etc.). Escape sigue cerrando el panel
// (menu-input.js). El juego (pointer lock) NO se toca: solo actúa cuando hay
// un panel visible y el puntero NO está bloqueado.
// ============================================================
import { isChestOpen, isCraftingOpen, isFurnaceOpen } from "./panels.js";
import { controls } from "./scene.js";

let focusedSlot = null;

function visibleSlots() {
	// Slots de los paneles abiertos (el selector cubre todos los contenedores
	// de slots; los del hotbar no: están bajo el HUD, no en un panel).
	const panel = document.querySelector(
		"#crafting-ui:not(.hidden), #furnace-ui:not(.hidden), #chest-ui:not(.hidden), #picker-ui:not(.hidden)"
	);
	if (!panel) return [];
	return Array.from(panel.querySelectorAll(".slot"));
}

function clearFocus() {
	if (focusedSlot) focusedSlot.classList.remove("a11y-focus");
	focusedSlot = null;
}

function setFocus(el) {
	clearFocus();
	focusedSlot = el;
	focusedSlot.classList.add("a11y-focus");
	focusedSlot.scrollIntoView({ block: "nearest" });
}

// ¿Hay un panel abierto con el puntero liberado (no en el juego)? El menú de
// pausa y el propio juego no navegan con Tab (el pointer lock captura el foco).
function panelActive() {
	if (controls.isLocked) return false;
	// El picker no tiene getter (variable local de panels.js); la clase hidden
	// del DOM es la fuente (el selector de visibleSlots la usa igualmente).
	return (
		isCraftingOpen() ||
		isFurnaceOpen() ||
		isChestOpen() ||
		!document.getElementById("picker-ui")?.classList.contains("hidden")
	);
}

document.addEventListener("keydown", (e) => {
	if (!panelActive()) return;
	// Los inputs de texto (chat, nombre de mundo) se respetan: Tab en un
	// input editable sale del campo con el comportamiento nativo del
	// navegador, no recorre slots.
	const tag = document.activeElement?.tagName;
	if (tag === "INPUT" || tag === "TEXTAREA") return;

	if (e.key === "Tab") {
		e.preventDefault();
		const slots = visibleSlots();
		if (!slots.length) return;
		const idx = slots.indexOf(focusedSlot);
		const next = e.shiftKey
			? (idx <= 0 ? slots.length : idx) - 1
			: (idx + 1) % slots.length;
		setFocus(slots[next]);
	} else if ((e.key === "Enter" || e.key === " ") && focusedSlot) {
		// Enter/Espacio activa el slot enfocado: dispara el mismo handler de
		// click que el ratón (grid_set / chest_action / furnace_action / pick).
		e.preventDefault();
		focusedSlot.click();
	}
});

// Al cerrarse el panel o liberarse el puntero se limpia el foco (evita que
// una clase .a11y-focus quede colgando sobre un slot de un panel oculto).
document.addEventListener("pointerlockchange", () => {
	if (controls.isLocked) clearFocus();
});
