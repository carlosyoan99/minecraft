"use strict";

// ============================================================
// CRAFTEO (recetas por patrón 3x3) Y HORNOS
// ============================================================
const fs = require("fs");
const path = require("path");
const state = require("./state.js");

const { furnaces } = state;
let recipes = {};
let furnaceRecipes = {};

// Rutas de recetas configurables (hot-reload y tests): se leen del disco en
// reloadRecipes(); watchRecipeFiles() las vigila para recargarlas en caliente.
let recipeFile = path.join(__dirname, "..", "recetas.json");
let furnaceRecipeFile = path.join(__dirname, "..", "recetas_horno.json");
function setRecipePaths(craftingFile, furnaceFile) {
	if (craftingFile) recipeFile = craftingFile;
	if (furnaceFile) furnaceRecipeFile = furnaceFile;
}

// Validación estructural mínima: un archivo malformado NO debe dejar el juego
// a medio camino. Cada receta de crafteo necesita shape + ingredients + result;
// cada receta de horno, result y time. Devuelve null si es válido o un mensaje.
function isValidRecipes(c) {
	if (!c || typeof c !== "object" || Array.isArray(c))
		return "recetas.json no es un objeto";
	for (const [k, r] of Object.entries(c)) {
		if (!r || !Array.isArray(r.shape) || r.shape.length === 0)
			return `receta '${k}': falta shape`;
		if (!r.ingredients || typeof r.ingredients !== "object")
			return `receta '${k}': faltan ingredients`;
		if (!r.result || typeof r.result.id !== "number")
			return `receta '${k}': falta result.id`;
	}
	return null;
}
function isValidFurnaceRecipes(f) {
	if (!f || typeof f !== "object" || Array.isArray(f))
		return "recetas_horno.json no es un objeto";
	for (const [k, r] of Object.entries(f)) {
		if (
			!r ||
			!r.result ||
			typeof r.result.id !== "number" ||
			typeof r.time !== "number"
		) {
			return `receta de horno '${k}': falta result.id o time`;
		}
	}
	return null;
}

// Recarga las recetas desde disco (hot-reload, Fase 6). Devuelve
// { ok, crafting, furnace, error }: en caso de error las tablas anteriores se
// mantienen intactas (swap atómico — nunca un estado a medias).
function reloadRecipes() {
	try {
		const c = JSON.parse(fs.readFileSync(recipeFile, "utf8"));
		const f = JSON.parse(fs.readFileSync(furnaceRecipeFile, "utf8"));
		const errC = isValidRecipes(c),
			errF = isValidFurnaceRecipes(f);
		if (errC) return { ok: false, error: errC };
		if (errF) return { ok: false, error: errF };
		recipes = c;
		furnaceRecipes = f;
		return {
			ok: true,
			crafting: Object.keys(recipes).length,
			furnace: Object.keys(furnaceRecipes).length
		};
	} catch (e) {
		return { ok: false, error: e.message };
	}
}

function loadRecipes() {
	const r = reloadRecipes();
	if (r.ok)
		console.log(
			`📜 ${r.crafting} recetas de crafteo, ${r.furnace} recetas de horno`
		);
	else console.error("⚠️  No se pudieron cargar las recetas:", r.error);
}

// Vigila los archivos de recetas y recarga en caliente con un debounce (los
// editores suelen escribir varios eventos por guardado). onChange(result)
// recibe el resultado de reloadRecipes() para que server.js avise a los
// clientes (chat de sistema + textures_reload). El hot-reload es un extra:
// si el watcher no puede crearse, solo se avisa y el juego sigue normal.
function watchRecipeFiles(onChange) {
	const files = new Set([
		path.basename(recipeFile),
		path.basename(furnaceRecipeFile)
	]);
	let timer = null;
	const reload = () => {
		if (timer) return;
		timer = setTimeout(() => {
			timer = null;
			onChange(reloadRecipes());
		}, 150);
	};
	try {
		// Vigilar los DIRECTORIOS (no los inodos): los editores reemplazan el
		// archivo por rename y el watcher del inodo moriría en ese caso. Los
		// directorios se deduplican (los dos JSON viven en la misma carpeta).
		for (const dir of new Set([
			path.dirname(recipeFile),
			path.dirname(furnaceRecipeFile)
		])) {
			fs.watch(dir, (ev, filename) => {
				if (filename && files.has(filename)) reload();
			});
		}
	} catch (e) {
		console.warn(
			`⚠️  No se pudo vigilar las recetas (hot-reload desactivado): ${e.message}`
		);
	}
}

// grid: array de 9 celdas, cada una null o { id, count }
function matchRecipe(grid) {
	for (const recipe of Object.values(recipes)) {
		const shape = recipe.shape;
		const rows = shape.length,
			cols = Math.max(...shape.map((r) => r.length));
		// Probar todas las posiciones de desplazamiento posibles dentro del grid 3x3
		for (let offR = 0; offR <= 3 - rows; offR++) {
			for (let offC = 0; offC <= 3 - cols; offC++) {
				let match = true;
				for (let r = 0; r < 3 && match; r++) {
					for (let c = 0; c < 3 && match; c++) {
						const cell = grid[r * 3 + c];
						const inShape =
							r >= offR && r < offR + rows && c >= offC && c < offC + cols;
						const patternChar = inShape
							? shape[r - offR][c - offC] || " "
							: " ";
						if (patternChar === " ") {
							if (cell) match = false;
						} else {
							const expectedId = recipe.ingredients[patternChar];
							if (!cell || cell.id !== expectedId) match = false;
						}
					}
				}
				if (match) return recipe;
			}
		}
	}
	return null;
}

// ============================================================
// HORNOS
// ============================================================
function getOrCreateFurnace(key) {
	let f = furnaces.get(key);
	if (!f) {
		f = {
			fuelItem: null,
			fuelTicksLeft: 0,
			inputItem: null,
			progress: 0,
			requiredTicks: 0,
			outputItem: null,
			outputCount: 0
		};
		furnaces.set(key, f);
	}
	return f;
}

function furnaceSnapshot(f) {
	return {
		fuelItem: f.fuelItem,
		fuelTicksLeft: f.fuelTicksLeft,
		inputItem: f.inputItem ? f.inputItem.id : null,
		inputCount: f.inputItem ? f.inputItem.count : 0,
		progress: f.progress,
		requiredTicks: f.requiredTicks,
		outputItem: f.outputItem,
		outputCount: f.outputCount
	};
}

function isCookable(itemId) {
	return !!furnaceRecipes[String(itemId)];
}

function tickFurnaces() {
	for (const [key, f] of furnaces) {
		const recipe = f.inputItem ? furnaceRecipes[String(f.inputItem.id)] : null;
		const canCook =
			recipe && f.inputItem.count > 0 && (f.fuelTicksLeft > 0 || f.fuelItem);

		if (canCook) {
			if (f.fuelTicksLeft <= 0 && f.fuelItem) {
				// Consumir una unidad de combustible
				f.fuelTicksLeft = 400; // ticks de combustible por unidad
			}
			if (f.fuelTicksLeft > 0) {
				f.fuelTicksLeft--;
				f.requiredTicks = recipe.time;
				f.progress++;
				if (f.progress >= f.requiredTicks) {
					f.progress = 0;
					f.inputItem.count--;
					if (f.inputItem.count <= 0) f.inputItem = null;
					if (f.outputItem === recipe.result.id)
						f.outputCount += recipe.result.count;
					else if (!f.outputItem) {
						f.outputItem = recipe.result.id;
						f.outputCount = recipe.result.count;
					}
					// Si el hueco de salida tiene otro item, el resultado se pierde (horno lleno) -- simplificado
				}
			}
		} else {
			f.progress = Math.max(0, f.progress - 2); // se enfría si no hay combustible/insumo
		}
	}
}

function restoreFurnaces(entries) {
	furnaces.clear();
	for (const [k, v] of entries || []) furnaces.set(k, v);
}

module.exports = {
	loadRecipes,
	reloadRecipes,
	setRecipePaths,
	watchRecipeFiles,
	matchRecipe,
	getOrCreateFurnace,
	furnaceSnapshot,
	tickFurnaces,
	restoreFurnaces,
	isCookable
};
