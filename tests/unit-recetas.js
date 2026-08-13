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
const { B, I, isFood, FUEL_ITEMS, canHarvest, ORE_DROP } = require(
	path.join(ROOT, "server", "constants.js")
);

crafting.loadRecipes();

// Universo de IDs válidos: todos los bloques + todos los ítems
const KNOWN = new Set([...Object.values(B), ...Object.values(I)]);

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		fails++;
		failedChecks.push(_name);
	}
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

// 9) Los minerales dropean su ítem DIRECTAMENTE al minar (ORE_DROP) — la
// cadena minar→gema/lingote/carbón está implícita, sin recetas de horno de
// mena (Fase 18, C-7; el diamante ya era directo, como Minecraft).
let smeltOk = true;
for (const [ore, ingot] of Object.entries(ORE_DROP)) {
	// El resultado debe ser un ítem obtenible distinto de la mena misma.
	if (Number(ore) === ingot || !KNOWN.has(ingot)) smeltOk = false;
}
check(
	"todas las menas dropean su ítem directo (ORE_DROP, sin receta de horno)",
	smeltOk
);
check(
	"ninguna mena tiene receta de horno (el fundido está en ORE_DROP)",
	[9, 10, 11, 12, 13, 14].every((o) => !horno[String(o)])
);

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
	// Lingotes: el mineral se dropea con pico y ORE_DROP da el lingote directo
	// (Fase 18, C-7: ya no hay receta de horno de mena).
	check(
		"hierro: pico de piedra cosecha hierro (madera no) → lingote directo",
		canHarvest(201, B.IRON_ORE) &&
			!canHarvest(200, B.IRON_ORE) &&
			ORE_DROP[B.IRON_ORE] === I.IRON_INGOT
	);
	check(
		"oro: pico de piedra cosecha oro (madera no) → lingote directo",
		canHarvest(201, B.GOLD_ORE) &&
			!canHarvest(200, B.GOLD_ORE) &&
			ORE_DROP[B.GOLD_ORE] === I.GOLD_INGOT
	);
	// Diamante: se mina directo con pico (no se funde, como Minecraft).
	check(
		"diamante: solo pico de hierro (drop directo, sin horno)",
		canHarvest(202, B.DIAMOND_ORE) &&
			!canHarvest(201, B.DIAMOND_ORE) &&
			!horno[String(B.DIAMOND_ORE)]
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
		"progresión de picos: madera→piedra→hierro→diamante (ninguna inaccesible)",
		canHarvest(200, B.STONE) &&
			canHarvest(201, B.IRON_ORE) &&
			!canHarvest(200, B.IRON_ORE) &&
			canHarvest(202, B.DIAMOND_ORE) &&
			!canHarvest(201, B.DIAMOND_ORE)
	);
}

// ============================================================
// 11) COBERTURA TOTAL (Fase 16, E2): todo ítem de I es obtenible en juego
// ============================================================
// Cada ID numérico de I debe salir del crafteo, del horno o de un drop/uso
// justificado (documentado abajo). Si un ítem nuevo entra en constants.js y
// no es alcanzable, este test falla y obliga a añadir su receta o su entrada
// en DROPS_JUSTIFICADOS con un comentario de DÓNDE se obtiene.
{
	const resultadoCrafteo = new Set(
		Object.values(recetas).map((r) => r.result.id)
	);
	const resultadoHorno = new Set(Object.values(horno).map((r) => r.result.id));
	// Drop/uso justificado (sin receta, como en Minecraft):
	//   101-103     — carbón/lingotes: ORE_DROP al minar la mena directo
	//                  (Fase 18, C-7: sin receta de horno — la cadena
	//                  minar→lingote está implícita en ORE_DROP)
	//   104/105/106 — minerales que se minan directo (diamante sin horno)
	//   107-110/118  — carnes crudas (drops de mobs; se cocinan en el horno)
	//   115-117     — cosecha de cultivos (trigo/zanahoria/semillas)
	//   120/132/134/136/140 — drops de mobs (araña/vaca/pesca/esqueleto/abeja)
	//   236-239     — armadura de cadena (drop raro de esqueletos/zombis)
	//   245/246     — tridente (ahogado) / slime ball (slime)
	//   250/251     — cubo lleno: se obtiene usando el CUBO (249, con receta)
	//   252/253     — pedernal (grava) / pluma (pollo)
	//   255/256     — carne podrida (zombi) / pólvora (creeper) — Fase 16 (D2)
	//   121          — patata: drop raro del zombi (2,5%, Fase 18 C-3); su
	//                  cocinado (122) sale del horno (patata → patata al horno)
	const DROPS_JUSTIFICADOS = new Set([
		I.COAL, // ORE_DROP (mena de carbón)
		I.IRON_INGOT, // ORE_DROP (mena de hierro)
		I.GOLD_INGOT, // ORE_DROP (mena de oro)
		I.DIAMOND,
		I.REDSTONE,
		I.EMERALD,
		I.BEEF,
		I.PORKCHOP,
		I.CHICKEN,
		I.MUTTON,
		I.RABBIT,
		I.POTATO, // Fase 18 (C-3): drop raro del zombi
		I.WHEAT,
		I.CARROT,
		I.SEEDS,
		I.STRING,
		I.LEATHER,
		I.COD,
		I.BONE,
		I.HONEY,
		I.CHAIN_HELMET,
		I.CHAIN_CHESTPLATE,
		I.CHAIN_LEGGINGS,
		I.CHAIN_BOOTS,
		I.TRIDENT,
		I.SLIME_BALL,
		I.WATER_BUCKET,
		I.LAVA_BUCKET,
		I.FLINT,
		I.FEATHER,
		I.ROTTEN_FLESH,
		I.GUNPOWDER
	]);
	const huérfanos = Object.values(I)
		.filter((id) => typeof id === "number")
		.filter(
			(id) =>
				!resultadoCrafteo.has(id) &&
				!resultadoHorno.has(id) &&
				!DROPS_JUSTIFICADOS.has(id)
		);
	check(
		`todo ítem de I es obtenible (crafteo, horno o drop justificado) — sin huérfanos (${huérfanos.join(",") || "ninguno"})`,
		huérfanos.length === 0
	);
}

// ============================================================
// 12) FASE 16 (Bloque D) — regresiones de los cambios de paridad
// ============================================================
{
	const resultadoCrafteoF16 = new Set(
		Object.values(recetas).map((r) => r.result.id)
	);
	const resultadoHornoF16 = new Set(
		Object.values(horno).map((r) => r.result.id)
	);
	// D3: puertas de madera (46/47/48/49?) — la puerta de hierro (71) y la de
	// roble (48) tienen receta de crafteo (el bloque se obtiene crafteando).
	const puertasCrafteables = [B.OAK_DOOR, B.IRON_DOOR].filter((b) => b != null);
	check(
		"las puertas (48/71) se craftean (no son solo drops)",
		puertasCrafteables.every((b) => resultadoCrafteoF16.has(b))
	);
	// D3: cada puerta de madera se craftea con 6 tablones del mismo tronco.
	{
		const puertaMadera = recetas.oak_door || recetas.puerta_madera;
		check("existe receta de puerta de madera", !!puertaMadera);
		const ings = Object.values(puertaMadera?.ingredients || {});
		check(
			"la puerta de madera usa 6 tablones (como en Minecraft)",
			ings.length === 1 && ings[0] === B.PLANKS
		);
		const shape = puertaMadera?.shape || [];
		check(
			"la puerta de madera tiene forma 2x3 (6 celdas)",
			shape.length === 3 &&
				shape.every((f) => f.length === 2) &&
				shape.join("").replace(/ /g, "").length === 6
		);
	}
	// D3: la puerta de hierro se craftea con 6 lingotes.
	{
		const puertaHierro = recetas.iron_door;
		check("existe receta de puerta de hierro", !!puertaHierro);
		const ings = Object.values(puertaHierro?.ingredients || {});
		check(
			"la puerta de hierro usa 6 lingotes de hierro",
			ings.length === 1 && ings[0] === I.IRON_INGOT
		);
	}
	// D3: el TNT se craftea con 4 pólvora + 5 arena.
	{
		const r = recetas.tnt;
		check("existe receta de TNT", !!r);
		const chars = (r?.shape || []).join("");
		const ing = r?.ingredients || {};
		const nPolvora = chars
			.split("")
			.filter((c) => ing[c] === I.GUNPOWDER).length;
		const nArena = chars.split("").filter((c) => ing[c] === B.SAND).length;
		check(
			"el TNT usa 4 pólvora (256) + 5 arena",
			nPolvora === 4 && nArena === 5 && chars.length === 9
		);
		check("el TNT sale como bloque TNT", r?.result && r.result.id === B.TNT);
	}
	// D5/C-4 (Fase 18): el carbón vegetal (257) se obtiene fundiendo troncos
	// (cualquier tipo → 257), ítem DISTINTO del carbón (101) que solo sale de
	// la mena (9). El comentario histórico decía "tronco → carbón 101": ahora
	// la receta usa CHARCOAL (paridad MC, tabla #9).
	const troncosHorno = ["4", "28", "30", "41"]; // roble, abedul, abeto, jungla
	check(
		"todos los troncos funden a carbón vegetal (257, no 101)",
		troncosHorno.every((t) => {
			const r = horno[t];
			return r && r.result.id === I.CHARCOAL && r.result.count === 1;
		})
	);
	// C-7: no hay recetas de mena en el horno — ORE_DROP da el drop directo al
	// minar (mena→gema es un dato muerto preexistente, eliminado). COAL (101) se
	// obtiene minando mena de carbón o de los troncos como carbón vegetal (257).
	const menasHorno = [B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.REDSTONE_ORE, B.EMERALD_ORE];
	check(
		"ninguna receta de horno usa menas (ORE_DROP da el drop directo) — C-7",
		menasHorno.every((m) => !horno[String(m)])
	);
	check(
		"COAL (101) ya no sale de los troncos (solo la mena) — C-4",
		troncosHorno.every((t) => horno[t] && horno[t].result.id !== I.COAL)
	);
	// D4: la arena se funde a vidrio en 200 ticks (paridad con Minecraft; antes 150).
	check(
		"el vidrio se funde en 200 ticks (D4)",
		horno["6"] && horno["6"].time === 200 && horno["6"].result.id === B.GLASS
	);
	// D2: carne podrida y pólvora NO tienen receta (se dropean de zombi/creeper).
	check(
		"la carne podrida (255) y la pólvora (256) no se craftean ni funden",
		!resultadoCrafteoF16.has(I.ROTTEN_FLESH) &&
			!resultadoHornoF16.has(I.ROTTEN_FLESH) &&
			!resultadoCrafteoF16.has(I.GUNPOWDER) &&
			!resultadoHornoF16.has(I.GUNPOWDER)
	);
}
process.exit(fails ? 1 : 0);
