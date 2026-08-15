// ============================================================
// LIBRO DE RECETAS (Fase 18, D-6): todas las recetas visibles por
// categorías (Fase 9, Bloque F; apertura/cierre F16 B5). Extraído de
// ui.js; ui.js es el orquestador que re-exporta esta fachada.
// ============================================================
import { send } from "./connection.js";
import { itemLabel } from "./constants.js";
import { itemVisual } from "./hud.js"; // Fase 18 (D-6): iconos procedurales
import { recipeCategory } from "./recipeCategories.js"; // Fase 9 (F): pestañas del libro
import { controls, showBlocker } from "./scene.js";

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

// ¿El libro está abierto? (lo usa panels.js para el cierre con Esc).
export function isRecipeBookOpen() {
	return !recipeBook.classList.contains("hidden");
}

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
	if (isRecipeBookOpen()) renderRecipeTab();
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
	const opening = !isRecipeBookOpen(); // estaba oculto → se va a abrir
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
