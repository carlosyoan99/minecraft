// ============================================================
// CATEGORÍAS DEL LIBRO DE RECETAS (Fase 9, Bloque F)
// Lógica PURA (sin DOM) para poder testearla (tests/unit-recipecats.js):
// cada resultado de receta decide su pestaña en el libro.
//
// ORDEN IMPORTANTE: la armadura (220-231) se comprueba ANTES que las
// herramientas. Si el rango de herramientas (200-219 y azadas 240-244) se
// escribiera como 200-244, capturaría la armadura y la pestaña "Armadura"
// del libro quedaría vacía (regresión cubierta por el test).
// ============================================================
import { FOOD_ITEMS } from "./constants.js";

export function recipeCategory(resultId) {
	// Fase 13 (L2/L3): los bloques llegan hasta el 71 (puertas/escaleras/
	// losas/vallas/portón); los ítems empiezan en 100 — todo id < 100 es bloque.
	if (resultId >= 1 && resultId < 100) return "bloques";
	if (resultId >= 220 && resultId <= 239) return "armadura"; // oro y malla (Fase 13, L5)
	if (resultId >= 200 && resultId <= 219) return "herramientas";
	if (resultId >= 240 && resultId <= 244) return "herramientas"; // azadas
	if (resultId === 247) return "herramientas"; // Fase 13 (L1): el arco (arma con durabilidad)
	if (resultId === 254) return "herramientas"; // Fase 13 (L5): el compás (utilidad, como en MC)
	if (FOOD_ITEMS.has(resultId)) return "comida";
	return "materiales";
}
