// ============================================================
// MENU-INPUT (Fase 18, D-8): input del MENÚ/PAUSA — la tecla Escape que
// abre la pausa en el juego (F17 C1), la reanuda si ya está abierta o cierra
// los paneles si hay alguno. Extraído de input.js; input.js es el
// despachador que importa este módulo (y game-input.js y touch.js).
// ============================================================
import { controls } from "./scene.js";
import {
	closePanels,
	inMenu,
	isPauseOpen,
	isTyping,
	resumeGame,
	showPause
} from "./ui.js";

document.addEventListener("keydown", (e) => {
	if (e.code !== "Escape" || isTyping()) return;
	// Fase 17 (C1): Esc abre la pausa en el juego; con la pausa abierta
	// la reanuda; con un panel abierto lo cierra (comportamiento previo).
	if (isPauseOpen()) {
		resumeGame();
	} else if (controls.isLocked) {
		showPause();
	} else {
		closePanels();
	}
});

// Fase 21.5 (bug usuario #4): al perder el foco de la pestaña del
// navegador, el browser libera el pointer lock automáticamente — esto
// dispara pointerlockchange con document.pointerLockElement === null.
// Si estamos en juego (no en el menú principal) y no hay panel/ pausa
// abierta, mostrar la pausa en vez de dejar el bloqueador sin menú.
document.addEventListener("pointerlockchange", () => {
	if (document.pointerLockElement) return; // se bloqueó, nada que hacer
	if (inMenu) return; // estamos en el menú principal, no en juego
	if (isPauseOpen()) return; // la pausa ya está visible
	// Verificar que no haya un panel abierto (inventario, cofre, horno,
	// chat, libro de recetas, picker creativo o mochila): si hay panel, el
	// bloqueador se queda oculto (patrón de scene.js). Fase 21.5 (Z1): el
	// libro/picker/mochila también liberan el puntero al abrirse — sin este
	// matiz, abrirlos disparaba showPause() encima (fallaba B5 de
	// audit-fase7: Escape "cerraba" la pausa, no el libro).
	const panelOpen =
		!document.getElementById("crafting-ui").classList.contains("hidden") ||
		!document.getElementById("furnace-ui").classList.contains("hidden") ||
		!document.getElementById("chest-ui").classList.contains("hidden") ||
		!document.getElementById("recipe-book").classList.contains("hidden") ||
		!document.getElementById("picker-ui").classList.contains("hidden") ||
		!document.getElementById("bundle-ui").classList.contains("hidden") ||
		document.getElementById("chat-input").classList.contains("active");
	if (panelOpen) return;
	showPause();
});
