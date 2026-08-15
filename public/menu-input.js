// ============================================================
// MENU-INPUT (Fase 18, D-8): input del MENÚ/PAUSA — la tecla Escape que
// abre la pausa en el juego (F17 C1), la reanuda si ya está abierta o cierra
// los paneles si hay alguno. Extraído de input.js; input.js es el
// despachador que importa este módulo (y game-input.js y touch.js).
// ============================================================
import { controls } from "./scene.js";
import {
	closePanels,
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
