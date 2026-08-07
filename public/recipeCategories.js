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
	if (resultId <= 38) return "bloques";
	if (resultId >= 220 && resultId <= 231) return "armadura";
	if (resultId >= 200 && resultId <= 219) return "herramientas";
	if (resultId >= 240 && resultId <= 244) return "herramientas"; // azadas
	if (FOOD_ITEMS.has(resultId)) return "comida";
	return "materiales";
}
