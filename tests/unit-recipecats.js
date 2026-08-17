"use strict";
// ============================================================
// TESTS DE LAS CATEGORÍAS DEL LIBRO DE RECETAS (Fase 9, F)
// Cubre la lógica PURA de public/recipeCategories.js (sin DOM):
// cada resultado de receta cae en la pestaña correcta del libro.
//
// Regresión corregida en la revisión de la Fase 9: el rango de herramientas
// (200-244) capturaba también la ARMADURA (220-231) y las AZADAS (240-244),
// así que la pestaña "🛡️ Armadura" quedaba VACÍA y las recetas de armadura
// aparecían bajo "Herramientas". El orden ahora es: bloques → armadura →
// herramientas (200-219) → azadas (240-244) → comida → materiales.
//
// Import del ESM: public/ es "type": "module" (public/package.json), y
// recipeCategories.js solo importa ./constants.js (ESM puro, sin THREE) —
// mismo patrón que tests/unit-itemicons.js.
// ============================================================
const path = require("node:path");

let ok = 0;
let fail = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, okVal, _extra = "") => {
	if (okVal) ok++;
	else {
		fail++;
		failedChecks.push(_name);
	}
};

(async () => {
	const { recipeCategory } = await import(
		`file://${path.join(__dirname, "..", "public", "recipeCategories.js")}`
	);

	// Bloques: 1-38 (tierra, piedra, cristal, lanas tintadas...).
	for (const id of [1, 17, 27, 36, 38])
		check(`bloque ${id} → 'bloques'`, recipeCategory(id) === "bloques");

	// Armadura: 220-239 (casco/pechera/pantalones/botas ×
	// cuero/hierro/diamante/oro/malla).
	// REGRESIÓN: la armadura debe caer en su pestaña, NO en herramientas.
	for (const id of [220, 221, 222, 223, 224, 228, 231, 232, 235, 236, 239])
		check(
			`armadura ${id} → 'armadura' (no 'herramientas')`,
			recipeCategory(id) === "armadura"
		);

	// Herramientas: 200-219 (pico/hacha/pala/espada) y azadas 240-244.
	for (const id of [200, 202, 209, 215, 219])
		check(
			`herramienta ${id} → 'herramientas'`,
			recipeCategory(id) === "herramientas"
		);
	for (const id of [240, 241, 242, 243, 244])
		check(
			`azada ${id} → 'herramientas'`,
			recipeCategory(id) === "herramientas"
		);

	// Comida: FOOD_ITEMS del cliente (107-114, 118-119, 133-135).
	for (const id of [107, 111, 133, 134, 135])
		check(`comida ${id} → 'comida'`, recipeCategory(id) === "comida");

	// Materiales: lingotes, palos, tintes, hueso, miel...
	for (const id of [100, 102, 104, 136, 137, 139, 140])
		check(`material ${id} → 'materiales'`, recipeCategory(id) === "materiales");

	// Límites de rango: no hay solapamiento entre armadura y herramientas.
	check(
		"armadura 219 vs 220: 219 es herramienta, 220 es armadura",
		recipeCategory(219) === "herramientas" && recipeCategory(220) === "armadura"
	);
	check(
		"armadura 239 vs 240: 239 es armadura (malla), 240 es herramienta",
		recipeCategory(239) === "armadura" && recipeCategory(240) === "herramientas"
	);

	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("unit-recipecats:", e.message);
	process.exit(1);
});
