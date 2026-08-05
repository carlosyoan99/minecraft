"use strict";
// ============================================================
// TESTS DE INTEGRIDAD DE RECETAS (crafteo + horno)
// Detecta el tipo de bug que se coló en la Fase 5 (hilo_a_lana
// apuntaba al ingrediente 118 en vez de 120): referencias a IDs
// inexistentes, shapes malformadas y resultados que ningún grid
// puede alcanzar. Carga recetas.json y recetas_horno.json y
// valida cada receta contra el universo de IDs de B/I.
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const crafting = require(path.join(ROOT, "server", "crafting.js"));
const { B, I, isFood, FUEL_ITEMS, canHarvest } = require(
	path.join(ROOT, "server", "constants.js")
);

crafting.loadRecipes();

// Universo de IDs válidos: todos los bloques + todos los ítems
const KNOWN = new Set([...Object.values(B), ...Object.values(I)]);

let fails = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) fails++;
};

// ============================================================
// RECETAS DE CRAFTEO (recetas.json)
// ============================================================
const recetas = JSON.parse(
	fs.readFileSync(path.join(ROOT, "recetas.json"), "utf8")
);
check(
	"hay recetas de crafteo",
	Object.keys(recetas).length > 0,
	`${Object.keys(recetas).length} recetas`
);

let shapeOk = true,
	idOk = true,
	charsOk = true,
	alcanzables = true,
	resultOk = true;
let alcanzablesN = 0;

for (const r of Object.values(recetas)) {
	// 1) Shape: array no vacío de strings de igual longitud
	const shape = r.shape;
	if (!Array.isArray(shape) || shape.length === 0) shapeOk = false;
	const len = shape?.[0] ? shape[0].length : 0;
	if (shape?.some((row) => typeof row !== "string" || row.length !== len))
		shapeOk = false;

	// 2) Ingredientes: todos los caracteres del shape tienen mapeo y el ID existe
	const ing = r.ingredients || {};
	for (const row of shape || []) {
		for (const ch of row) {
			if (ch === " ") continue;
			if (!(ch in ing)) charsOk = false;
			const id = ing[ch];
			if (typeof id !== "number" || !KNOWN.has(id)) idOk = false;
		}
	}

	// 3) Resultado: ID válido y count positivo
	const res = r.result || {};
	if (!KNOWN.has(res.id) || !(res.count >= 1)) resultOk = false;

	// 4) Alcanzable: un grid construido desde el shape debe matchear la receta
	const grid = new Array(9).fill(null);
	for (let ri = 0; ri < shape.length; ri++) {
		for (let ci = 0; ci < shape[ri].length; ci++) {
			const ch = shape[ri][ci];
			if (ch !== " ") grid[ri * 3 + ci] = { id: ing[ch], count: 1 };
		}
	}
	const m = crafting.matchRecipe(grid);
	if (m && m.result.id === r.result.id && m.result.count === r.result.count)
		alcanzablesN++;
	else alcanzables = false;
}

check("todas las recetas tienen shape rectangular válido", shapeOk);
check("todos los caracteres del shape tienen ingrediente mapeado", charsOk);
check("todos los ingredientes referencian IDs existentes (B/I)", idOk);
check(
	"todas las recetas tienen resultado con ID válido y count >= 1",
	resultOk
);
check(
	`todas las recetas son alcanzables desde su shape (${alcanzablesN}/${Object.keys(recetas).length})`,
	alcanzables
);

// 5) Regresión conocida: hilo_a_lana usa hilo (120), no conejo (118)
{
	const r = recetas.hilo_a_lana;
	check("hilo_a_lana existe", !!r);
	check(
		"hilo_a_lana: ingrediente es hilo (120) — regresión Fase 5",
		r?.ingredients && r.ingredients["#"] === I.STRING,
		r && JSON.stringify(r.ingredients)
	);
	check(
		"hilo_a_lana: resultado es lana (18)",
		r?.result && r.result.id === B.WOOL
	);
}

// 6) Cada material de herramienta aparece en su familia de recetas
for (const [material, baseId] of [
	["madera", 200],
	["piedra", 201],
	["hierro", 202],
	["oro", 203],
	["diamante", 204]
]) {
	const fam = [baseId, baseId + 5, baseId + 10, baseId + 15]; // pico, hacha, pala, espada
	const ok = fam.every((id) =>
		Object.values(recetas).some((r) => r.result && r.result.id === id)
	);
	check(
		`hay recetas de ${material} para pico/hacha/pala/espada (${fam.join(",")})`,
		ok
	);
}

// ============================================================
// RECETAS DE HORNO (recetas_horno.json)
// ============================================================
const horno = JSON.parse(
	fs.readFileSync(path.join(ROOT, "recetas_horno.json"), "utf8")
);
check(
	"hay recetas de horno",
	Object.keys(horno).length > 0,
	`${Object.keys(horno).length} recetas`
);

let hornoOk = true,
	hornoResultOk = true,
	hornoTimeOk = true;
for (const [inp, r] of Object.entries(horno)) {
	const inId = Number(inp);
	if (!KNOWN.has(inId)) hornoOk = false;
	if (!r.result || !KNOWN.has(r.result.id) || !(r.result.count >= 1))
		hornoResultOk = false;
	if (!(r.time > 0)) hornoTimeOk = false;
	// La salida debe ser distinta de la entrada (nunca una receta identidad)
	if (Number(inp) === r.result?.id) hornoOk = false;
}
check("todas las entradas de horno son IDs existentes y no identidad", hornoOk);
check(
	"todas las salidas de horno tienen ID válido y count >= 1",
	hornoResultOk
);
check("todas las recetas de horno tienen time > 0", hornoTimeOk);

// 7) Todo lo crudo (107-110, 118) se puede cocinar y todo lo cocinado (111-114, 119) sale del horno
const crudas = [I.BEEF, I.PORKCHOP, I.CHICKEN, I.MUTTON, I.RABBIT];
const cocinadas = [111, 112, 113, 114, I.COOKED_RABBIT];
check(
	"toda la carne cruda es cocinable",
	crudas.every((id) => crafting.isCookable(id))
);
check(
	"toda la carne cocinada es resultado de alguna receta de horno",
	cocinadas.every((id) =>
		Object.values(horno).some((r) => r.result && r.result.id === id)
	)
);
check("toda la comida cruda es comida (FOOD_VALUES)", crudas.every(isFood));
check(
	"toda la comida cocinada es comida (FOOD_VALUES)",
	cocinadas.every(isFood)
);

// 8) Coherencia comida cruda → cocinada (la misma proteína)
const pairing = {
	[I.BEEF]: 111,
	[I.PORKCHOP]: 112,
	[I.CHICKEN]: 113,
	[I.MUTTON]: 114,
	[I.RABBIT]: I.COOKED_RABBIT
};
let pairingOk = true;
for (const [raw, cooked] of Object.entries(pairing)) {
	const r = horno[String(raw)];
	if (!r || r.result.id !== cooked) pairingOk = false;
}
check(
	"cada carne cruda se cocina en su correspondiente cocinada (vaca→carne, etc.)",
	pairingOk
);

// 9) Los minerales se funden en lingotes (9→101, 10→102, 11→103).
// El diamante (12) NO se funde: se obtiene directamente al minar (como Minecraft).
const smelt = { 9: I.COAL, 10: I.IRON_INGOT, 11: I.GOLD_INGOT };
let smeltOk = true;
for (const [ore, ingot] of Object.entries(smelt)) {
	const r = horno[ore];
	if (!r || r.result.id !== ingot) smeltOk = false;
}
check("los minerales se funden en sus lingotes/carbón", smeltOk);
check("el diamante NO se funde en el horno (se mina directo)", !horno["12"]);

// 10) CADENA DE OBTENCIÓN REAL de las 20 herramientas (Fase 6)
// No basta con que la receta exista: cada ingrediente debe ser alcanzable
// EN JUEGO desde lo que se mina/caza en el mundo. Cadena verificada:
//   tronco(4) →a mano→ planks(7) →receta→ palos(100)
//   piedra(3) →pico→ adoquín(8) →receta→ horno(16) y herramientas de piedra
//   mineral(10/11) →pico→ horno → lingotes(102/103)
//   diamante(12) →pico→ directo (104), sin fundir (como Minecraft)
{
	// Las 20 herramientas (200-219): pico/hacha/pala/espada × 5 materiales.
	const tools = Object.values(recetas).filter(
		(r) => r.result && r.result.id >= 200 && r.result.id <= 219
	);
	check(
		"existen recetas para las 20 herramientas (200-219)",
		tools.length === 20,
		`${tools.length} recetas`
	);

	// Cada herramienta usa palos (100) + el material de su nivel.
	const toolMats = {};
	for (let base = 200; base <= 215; base += 5) {
		toolMats[base] = 7;
		toolMats[base + 1] = 8;
		toolMats[base + 2] = 102;
		toolMats[base + 3] = 103;
		toolMats[base + 4] = 104;
	}
	let ingOk = true;
	for (const [id, mat] of Object.entries(toolMats)) {
		const r = tools.find((x) => x.result.id === Number(id));
		const ing = new Set(Object.values(r ? r.ingredients : {}));
		if (!r || !ing.has(100) || !ing.has(mat)) ingOk = false;
	}
	check("las 20 herramientas se craftean con palos (100) + su material", ingOk);

	// Madera: el tronco (4) se mina A MANO (canHarvest sin pico = true) y
	// planks (7) sale de él por receta.
	check(
		"tronco (4) se mina a mano y planks (7) se craftea de él",
		canHarvest(0, B.OAK_LOG) &&
			recetas.planks &&
			recetas.planks.ingredients["#"] === B.OAK_LOG
	);
	// Palos: receta stick ← planks.
	check(
		"palos (100) se craftean de planks",
		recetas.stick && recetas.stick.ingredients["#"] === B.PLANKS
	);
	// Piedra: adoquín (8) se dropea al romper piedra (3) con CUALQUIER pico
	// (aquí el pico de madera 200), y el horno se craftea de adoquín.
	check(
		"adoquín (8) se dropea con pico de madera (romper piedra)",
		canHarvest(200, B.STONE)
	);
	check(
		"el horno (16) se craftea de adoquín",
		recetas.furnace && recetas.furnace.ingredients["#"] === B.COBBLESTONE
	);
	// Lingotes: el mineral se dropea con pico y se funde en el horno.
	check(
		"hierro: mineral (10) con pico → horno → lingote (102)",
		canHarvest(200, B.IRON_ORE) &&
			horno[String(B.IRON_ORE)] &&
			horno[String(B.IRON_ORE)].result.id === I.IRON_INGOT
	);
	check(
		"oro: mineral (11) con pico → horno → lingote (103)",
		canHarvest(200, B.GOLD_ORE) &&
			horno[String(B.GOLD_ORE)] &&
			horno[String(B.GOLD_ORE)].result.id === I.GOLD_INGOT
	);
	// Diamante: se mina directo con pico (no se funde, como Minecraft).
	check(
		"diamante (12) se mina directo con pico (sin horno)",
		canHarvest(200, B.DIAMOND_ORE) && !horno[String(B.DIAMOND_ORE)]
	);
	// El combustible del horno (tronco/planks/palos) es obtenible desde la
	// primera madera, así que la fundición nunca queda bloqueada.
	check(
		"el combustible del horno es obtenible (tronco/planks/palos)",
		[B.OAK_LOG, B.PLANKS, I.STICK].every((id) => FUEL_ITEMS.has(id))
	);
	// Progresión de picos: cada material se dropea con el pico del nivel
	// anterior (madera→piedra, piedra→hierro/oro/diamante) — ninguna
	// herramienta queda inaccesible por falta de la anterior.
	check(
		"progresión de picos: madera→piedra→hierro/diamante (ninguna inaccesible)",
		canHarvest(200, B.STONE) &&
			canHarvest(201, B.IRON_ORE) &&
			canHarvest(201, B.DIAMOND_ORE) &&
			canHarvest(202, B.DIAMOND_ORE)
	);
}
process.exit(fails ? 1 : 0);
