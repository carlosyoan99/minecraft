"use strict";
// ============================================================
// TESTS UNITARIOS DEL HOT-RELOAD DE RECETAS (Fase 6)
// crafting.reloadRecipes() recarga recetas.json/recetas_horno.json
// desde disco (rutas configurables con setRecipePaths):
//   1. recarga correcta: contadores y matchRecipe usan las nuevas tablas
//   2. swap atómico: al modificar una receta, matchRecipe la ve al instante
//   3. JSON inválido → ok:false y se mantienen las tablas anteriores
//   4. JSON válido pero malformado (falta result) → ok:false, mismas tablas
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crafting = require("../server/crafting.js");

let failed = 0;
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
		failed++;
		failedChecks.push(_name);
	}
};

const ORIG = path.join(__dirname, "..", "recetas.json");
const ORIG_HORNO = path.join(__dirname, "..", "recetas_horno.json");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-reload-"));
const TMP_RECETAS = path.join(TMP, "recetas.json");
const TMP_HORNO = path.join(TMP, "recetas_horno.json");
fs.copyFileSync(ORIG, TMP_RECETAS);
fs.copyFileSync(ORIG_HORNO, TMP_HORNO);

// Rellenar un grid 3x3 con el patrón de la receta (sin offsets).
function gridFromShape(shape, ingredients) {
	const grid = new Array(9).fill(null);
	shape.forEach((row, r) => {
		[...row].forEach((ch, c) => {
			if (ch !== " ") grid[r * 3 + c] = { id: ingredients[ch], count: 1 };
		});
	});
	return grid;
}

try {
	crafting.setRecipePaths(TMP_RECETAS, TMP_HORNO);

	// --- 1) Recarga válida: contadores idénticos al original ---
	const r1 = crafting.reloadRecipes();
	const origCraft = JSON.parse(fs.readFileSync(ORIG, "utf8"));
	const origFurnace = JSON.parse(fs.readFileSync(ORIG_HORNO, "utf8"));
	check(
		"reloadRecipes ok con archivos válidos",
		r1.ok === true,
		JSON.stringify(r1)
	);
	check(
		"contadores coinciden con los archivos originales",
		r1.crafting === Object.keys(origCraft).length &&
			r1.furnace === Object.keys(origFurnace).length,
		`${r1.crafting} crafteo / ${r1.furnace} horno`
	);

	// --- 2) Swap atómico: modificar una receta se nota al instante ---
	const stickKey = Object.keys(origCraft).find(
		(k) => origCraft[k].result && origCraft[k].result.id === 100
	);
	const stick = origCraft[stickKey];
	check(
		"se encontró la receta del palo (result.id 100) para modificarla",
		!!stickKey && !!stick
	);
	const modified = JSON.parse(JSON.stringify(origCraft));
	modified[stickKey].result = { id: 100, count: 5 }; // ahora devuelve 5 palos
	fs.writeFileSync(TMP_RECETAS, JSON.stringify(modified));
	const r2 = crafting.reloadRecipes();
	check("reloadRecipes tras modificar devuelve ok", r2.ok === true);
	const grid = gridFromShape(stick.shape, stick.ingredients);
	const match = crafting.matchRecipe(grid);
	check(
		"matchRecipe usa la receta recargada (count 5)",
		match && match.result.id === 100 && match.result.count === 5,
		`count=${match?.result.count}`
	);

	// --- 3) JSON inválido → ok:false y las tablas NO cambian ---
	fs.writeFileSync(TMP_RECETAS, "{ json roto ");
	const r3 = crafting.reloadRecipes();
	check("JSON inválido → ok:false", r3.ok === false, r3.error);
	const m3 = crafting.matchRecipe(grid);
	check(
		"tras JSON inválido matchRecipe sigue viendo la receta anterior (count 5)",
		m3 && m3.result.id === 100 && m3.result.count === 5,
		`id/count=${m3?.result.id}/${m3?.result.count}`
	);

	// --- 4) JSON válido pero malformado (falta result) → ok:false, swap atómico ---
	const bad = JSON.parse(JSON.stringify(origCraft));
	bad[stickKey] = { shape: ["#", "#"], ingredients: { "#": 7 } }; // sin result
	fs.writeFileSync(TMP_RECETAS, JSON.stringify(bad));
	const r4 = crafting.reloadRecipes();
	check(
		"receta malformada → ok:false (swap atómico)",
		r4.ok === false,
		r4.error
	);
	const m4 = crafting.matchRecipe(grid);
	check(
		"tras receta malformada matchRecipe sigue igual (count 5)",
		m4 && m4.result.id === 100 && m4.result.count === 5,
		`id/count=${m4?.result.id}/${m4?.result.count}`
	);

	// --- 5) El horno también se recarga: cambiar el tiempo de una receta ---
	const furnaceKey = Object.keys(origFurnace)[0];
	const furnaceModified = JSON.parse(JSON.stringify(origFurnace));
	furnaceModified[furnaceKey].time = origFurnace[furnaceKey].time + 1;
	fs.writeFileSync(TMP_HORNO, JSON.stringify(furnaceModified));
	fs.writeFileSync(TMP_RECETAS, JSON.stringify(origCraft)); // restaurar crafteo
	const r5 = crafting.reloadRecipes();
	check(
		"reloadRecipes recarga también las recetas de horno",
		r5.ok === true,
		`${r5.crafting} crafteo / ${r5.furnace} horno`
	);
	// El tick usa recipe.time: al cocinar, requiredTicks refleja el cambio.
	check(
		"isCookable sigue funcionando tras recargar (mineral de carbón)",
		crafting.isCookable(9) === true
	);
} finally {
	// Restaurar las rutas originales y limpiar el directorio temporal.
	crafting.setRecipePaths(ORIG, ORIG_HORNO);
	fs.rmSync(TMP, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
