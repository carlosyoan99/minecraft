// ============================================================
// INPUT (Fase 18, D-8): DESPACHADOR entre modos.
// El input del juego (teclado WASD/hotbar/paneles, ratón minar/atacar/
// colocar, raycast y telemetría) vive en game-input.js; la pausa/menú
// (Escape) en menu-input.js; los controles táctiles en touch.js. Este
// archivo los importa (los listeners se registran al importar) y re-exporta
// la fachada que usan network.js (onBlockMined) — mismo API que el input.js
// monolítico.
// ============================================================
import "./game-input.js";
import "./menu-input.js";
import "./touch.js";

export { onBlockMined } from "./game-input.js";
