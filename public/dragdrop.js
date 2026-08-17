// ============================================================
// DRAG & DROP DE PANELES (Fase 19, D1/D2)
// Arrastrar un ítem entre slots del inventario, al grid de crafteo,
// al cofre y al horno, con el mini-ícono fantasma estilo Minecraft.
// El click simple conserva su comportamiento (este módulo NO hace
// preventDefault en pointerdown): solo si el puntero se mueve más de
// DRAG_THRESHOLD px sin soltar se entra en modo arrastre, y al soltar
// se envía el evento de transporte correspondiente (el servidor es la
// fuente de verdad y valida cada movimiento).
// ============================================================
import { send } from "./connection.js";
import { dropAction } from "./draglogic.js";

const DRAG_THRESHOLD = 5; // px de movimiento para entrar en modo arrastre

// Identifica un slot y su contexto. Devuelve { kind, index } o null.
// kind: "inv" | "grid" | "chest" | "fuel" | "input" | "output" | "armor"
function slotInfo(el) {
	if (!el?.classList?.contains("slot")) return null;
	let kind = null;
	if (el.id === "furnace-fuel") kind = "fuel";
	else if (el.id === "furnace-input") kind = "input";
	else if (el.id === "furnace-output") kind = "output";
	else if (el.closest("#craft-grid")) kind = "grid";
	else if (el.closest("#chest-slots")) kind = "chest";
	else if (el.closest("#craft-armor")) kind = "armor";
	else if (
		el.closest("#craft-inventory") ||
		el.closest("#furnace-inventory") ||
		el.closest("#chest-inventory")
	)
		kind = "inv";
	if (!kind) return null;
	const parent = el.parentNode;
	const index = parent ? Array.prototype.indexOf.call(parent.children, el) : 0;
	return { kind, index };
}

// ¿El slot tiene un ítem que se pueda arrastrar? (icono o fallback de texto;
// los labels "Combustible/Material/Salida" de los slots vacíos no son ítems).
function hasItem(el) {
	return !!el.querySelector(".item-ico, .item-txt");
}

let drag = null; // { src, ghost, moved, lastX, lastY }

function startDrag(el, x, y) {
	const src = slotInfo(el);
	if (!src || src.kind === "armor" || !hasItem(el)) return;
	drag = { src, moved: false, lastX: x, lastY: y, ghost: null };
	el.setPointerCapture?.(drag.pointerId);
}

function moveDrag(el, x, y) {
	if (!drag) return;
	if (
		!drag.moved &&
		Math.hypot(x - drag.lastX, y - drag.lastY) < DRAG_THRESHOLD
	)
		return;
	if (!drag.moved) {
		// Entrar en modo arrastre: crear el fantasma con el icono del ítem.
		drag.moved = true;
		const item = el.querySelector(".item-ico");
		const ghost = document.createElement("div");
		ghost.className = "drag-ghost";
		ghost.innerHTML = item ? item.outerHTML : el.innerHTML;
		document.body.appendChild(ghost);
		drag.ghost = ghost;
	}
	drag.ghost.style.left = `${x + 8}px`;
	drag.ghost.style.top = `${y + 8}px`;
}

function endDrag(_el, x, y) {
	if (!drag) return;
	if (drag.ghost) drag.ghost.remove();
	const src = drag.src;
	drag = null;
	if (!src.moved) return; // sin movimiento → el click sigue haciendo su trabajo

	// Destino bajo el cursor (el fantasma tiene pointer-events: none).
	const targetEl = document.elementFromPoint(x, y)?.closest(".slot");
	const dst = slotInfo(targetEl);
	if (!dst || (dst.kind === src.kind && dst.index === src.index)) return;

	// Transporte por par (origen → destino) — lógica pura en draglogic.js
	// (testeable). El servidor valida cada uno; un destino inválido se
	// ignora en silencio (no se pierde nada).
	const action = dropAction(src, dst);
	if (action) send(action.event, action.data);
}

// Listeners delegados sobre los contenedores de paneles (los slots se
// recrean en cada repintado; la delegación evita re-attach).
for (const id of ["crafting-ui", "furnace-ui", "chest-ui"]) {
	const panel = document.getElementById(id);
	if (!panel) continue;
	panel.addEventListener("pointerdown", (e) => {
		if (e.button !== undefined && e.button !== 0) return; // solo botón izq
		const slot = e.target.closest(".slot");
		if (!slot) return;
		drag = null;
		startDrag(slot, e.clientX, e.clientY);
	});
	panel.addEventListener("pointermove", (e) => {
		if (!drag) return;
		moveDrag(e.target.closest(".slot") || panel, e.clientX, e.clientY);
	});
	panel.addEventListener("pointerup", (e) => {
		if (!drag) return;
		endDrag(e.target.closest(".slot") || panel, e.clientX, e.clientY);
	});
	panel.addEventListener("pointercancel", () => {
		if (drag?.ghost) drag.ghost.remove();
		drag = null;
	});
}
