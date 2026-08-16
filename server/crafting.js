"use strict";

// ============================================================
// CRAFTEO (recetas por patrón 3x3) Y HORNOS
// ============================================================
const fs = require("node:fs");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const path = require("node:path");
const constants = require("./constants.js");
const { FUEL_TICKS } = constants;
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
			!r?.result ||
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
	if (r.ok) {
		log.info(
			`📜 ${r.crafting} recetas de crafteo, ${r.furnace} recetas de horno`
		);
	} else {
		log.error("⚠️  No se pudieron cargar las recetas:", r.error);
	}
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
			fs.watch(dir, (_ev, filename) => {
				if (filename && files.has(filename)) reload();
			});
		}
	} catch (e) {
		log.warn(
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
// Fase 16 (C5/REN-2): una caja vacía reproducible es la plantilla de horno
// nuevo. getOrCreateFurnace la clona; getFurnace/emptyFurnace permiten abrir
// un horno vacío SIN registrar una entrada (antes cada horno alguna vez
// abierto quedaba en memoria y en world.json para siempre).
function emptyFurnace() {
	return {
		fuelItem: null,
		fuelCount: 0, // Fase 16 (D1): unidades de combustible cargadas (se consumen de una en una)
		fuelTicksLeft: 0,
		// Fase 18 (C-6): cola FIFO de combustibles encolados (MC encola al
		// añadir otro tipo con uno cargado). NO se persiste (decisión de la
		// spec: detalle menor, se pierde al reiniciar — documentado).
		fuelQueue: [],
		inputItem: null,
		progress: 0,
		requiredTicks: 0,
		outputItem: null,
		outputCount: 0
	};
}

function getFurnace(key) {
	return furnaces.get(key);
}

function getOrCreateFurnace(key) {
	let f = furnaces.get(key);
	if (!f) {
		f = emptyFurnace();
		furnaces.set(key, f);
	}
	return f;
}

// ¿El horno está completamente vacío? (sin combustible, insumo, avance ni
// resultado). Úsalo para podar: un horno vacío no aporta nada persistido.
function isEmptyFurnace(f) {
	return (
		f.fuelItem == null &&
		(f.fuelCount || 0) === 0 &&
		!f.fuelTicksLeft &&
		(f.fuelQueue || []).length === 0 && // C-6: la cola evita la poda
		f.inputItem == null &&
		!f.progress &&
		f.outputItem == null &&
		!f.outputCount
	);
}

function furnaceSnapshot(f) {
	return {
		fuelItem: f.fuelItem,
		fuelCount: f.fuelCount || 0,
		fuelTicksLeft: f.fuelTicksLeft,
		// Fase 18 (C-6): cola FIFO de combustibles encolados (el cliente puede
		// mostrarla; no se persiste en world.json).
		fuelQueue: (f.fuelQueue || []).map((q) => ({ id: q.id, count: q.count })),
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

// Carga la siguiente unidad de combustible (tanque o cola FIFO) y devuelve
// si el fuego quedó activo. Fase 18 (C-6): el DESPACHO de la cola vive aquí
// para que el cambio de combustible encolado ocurra en el tick correcto.
function loadFuelUnit(f) {
	if (f.fuelTicksLeft > 0) return true;
	if (f.fuelItem != null) {
		// Fase 16 (D1): consumir UNA unidad REAL de combustible — se queman
		// sus FUEL_TICKS oficiales (carbón 1600, palo 100, tablas/tronco
		// 300) y la unidad se consume. Sin combustible el horno se apaga
		// (antes quemaba 400 ticks eternos sin consumir nada).
		f.fuelTicksLeft = FUEL_TICKS[f.fuelItem] || 100;
		f.fuelCount = Math.max(0, (f.fuelCount || 0) - 1);
		if (f.fuelCount <= 0) f.fuelItem = null;
		return true;
	}
	// Fase 18 (C-6): cola FIFO — el siguiente combustible encolado entra al
	// tanque cuando el actual se agota (MC encola al añadir otro tipo).
	const next = (f.fuelQueue || []).shift();
	if (next && FUEL_TICKS[next.id] != null) {
		f.fuelItem = next.id;
		f.fuelCount = next.count;
		f.fuelTicksLeft = FUEL_TICKS[next.id] || 100;
		f.fuelCount = Math.max(0, f.fuelCount - 1);
		if (f.fuelCount <= 0) f.fuelItem = null;
		return true;
	}
	return false;
}

function tickFurnaces() {
	for (const [key, f] of furnaces) {
		const recipe = f.inputItem ? furnaceRecipes[String(f.inputItem.id)] : null;
		const canCook = recipe && f.inputItem.count > 0;

		// Fase 18 (C-6): DESPERDICIO como MC — la unidad de combustible YA
		// encendida se sigue quemando aunque el insumo se agote a mitad de
		// quema (no se congela el fuego). Pero una unidad NUEVA (del tanque o
		// de la cola FIFO) solo se enciende si hay algo que cocinar: sin
		// insumo el horno se apaga al agotar la unidad actual (las restantes
		// quedan en el tanque/cola intactas, como en Minecraft).
		const burning = f.fuelTicksLeft > 0;
		if (burning) {
			f.fuelTicksLeft--;
		} else if (canCook && loadFuelUnit(f)) {
			// Se acaba de encender una unidad nueva (tanque o cola): quema este
			// mismo tick (paridad con el comportamiento anterior — 1 tablón de
			// 300 t rinde 200 de cocción y deja 100).
			f.fuelTicksLeft--;
		}

		if (burning || (canCook && f.fuelTicksLeft > 0)) {
			if (canCook && f.fuelTicksLeft >= 0) {
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
		// Fase 16 (C5/REN-2): podar hornos vacíos. getFurnace/server no crean
		// entradas al abrir, pero un horno que SÍ se usó y luego quedó vacío
		// (el jugador sacó el resultado y vació insumo/combustible) debe
		// soltarse: sin esta poda cada horno alguna vez usado era permanente
		// en memoria y en world.json (fuga media de sesiones largas).
		if (isEmptyFurnace(f)) furnaces.delete(key);
	}
}

function restoreFurnaces(entries) {
	furnaces.clear();
	for (const [k, v] of entries || []) {
		// Fase 16 (D1): los hornos guardados antes del fix no tenían fuelCount;
		// un fuelItem persistido equivale a 1 unidad real (se consume y apaga).
		if (v && v.fuelItem != null && typeof v.fuelCount !== "number")
			v.fuelCount = 1;
		// Fase 18 (C-6): la cola FIFO NO se persiste (decisión de la spec — se
		// pierde al reiniciar, detalle menor documentado).
		if (v) v.fuelQueue = [];
		furnaces.set(k, v);
	}
}

// ============================================================
// LIBRO DE RECETAS (Fase 9, Bloque F)
// ============================================================
// Devuelve las tablas de recetas para el cliente (libro de recetas). Cada
// receta se envía con su shape, ingredients (id → itemId) y result; el
// horno con input (id → itemId), result y time. El cliente las agrupa por
// categoría para mostrarlas todas sin desbloqueo progresivo.
function getRecipeTables() {
	return { crafting: recipes, furnace: furnaceRecipes };
}

module.exports = {
	loadRecipes,
	reloadRecipes,
	setRecipePaths,
	watchRecipeFiles,
	matchRecipe,
	getFurnace,
	getOrCreateFurnace,
	emptyFurnace,
	isEmptyFurnace,
	furnaceSnapshot,
	tickFurnaces,
	restoreFurnaces,
	isCookable,
	getRecipeTables
};
