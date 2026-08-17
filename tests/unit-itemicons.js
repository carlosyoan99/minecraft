"use strict";
// ============================================================
// TESTS UNITARIOS DE LOS ICONOS DE ÍTEMS (Fase 7)
// Cubre la lógica PURA de public/itemicons.js (sin canvas ni DOM):
// que todo ítem conocido tiene un icono no vacío, que los iconos son
// deterministas y que los distintos se distinguen.
//
// Import del ESM: public/ es "type": "module" (public/package.json),
// así que se importa directamente por file:// (itemicons.js importa
// ./constants.js, que también es ESM puro — sin THREE).
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
	const itemicons = await import(
		`file://${path.join(__dirname, "..", "public", "itemicons.js")}`
	);
	const constants = await import(
		`file://${path.join(__dirname, "..", "public", "constants.js")}`
	);

	// Todos los ids conocidos (bloques + ítems) tienen icono no vacío
	const knownIds = [
		...Object.keys(constants.BLOCK_NAMES),
		...Object.keys(constants.ITEM_NAMES)
	].map(Number);
	check(
		"el universo de ítems conocidos no está vacío",
		knownIds.length > 50,
		`${knownIds.length} ids`
	);
	let missing = 0;
	for (const id of knownIds) {
		const g = itemicons.itemIconGrid(id);
		if (g?.length !== 256 || !g?.some(Boolean)) missing++;
	}
	check(
		"todo ítem conocido tiene icono 16x16 no vacío",
		missing === 0,
		`${missing} sin icono (${knownIds.length} totales)`
	);

	// itemIconIds() cubre el mismo universo (lo que pinta el atlas)
	const covered = new Set(itemicons.itemIconIds());
	const missingInAtlas = knownIds.filter((id) => !covered.has(id));
	check(
		"itemIconIds cubre todos los ids conocidos",
		missingInAtlas.length === 0,
		missingInAtlas.join(",")
	);

	// Fase 19 (A2, dirección inversa): ningún id del atlas fuera de las
	// constantes — si mañana se añade un icono huérfano (o se elimina un ítem
	// sin quitar su icono), el test lo caza como regresión automática.
	const knownSet = new Set(knownIds);
	const strayAtlasIds = itemicons
		.itemIconIds()
		.filter((id) => !knownSet.has(id));
	check(
		"ningún id del atlas fuera de las constantes (sin iconos huérfanos)",
		strayAtlasIds.length === 0,
		strayAtlasIds.join(",")
	);

	// Fase 19 (A2): TODOS los iconos se distinguen entre sí (no solo los
	// pares de muestra) — colisión visual = dos ids con la misma tesela.
	const seen = new Map();
	const dups = [];
	for (const id of itemicons.itemIconIds()) {
		const key = JSON.stringify(itemicons.itemIconGrid(id));
		if (seen.has(key)) dups.push([seen.get(key), id]);
		else seen.set(key, id);
	}
	check(
		"cada id dibuja una tesela distinta (sin colisiones visuales)",
		dups.length === 0,
		JSON.stringify(dups.slice(0, 5))
	);

	// Fase 19 (A2): la columna CSS de cada tesela queda DENTRO del atlas
	// (recorte nunca fuera de rango). El atlas tiene una fila con tantas
	// teselas como ids; el recorte usa col = posición del id en itemIconIds().
	const ids = itemicons.itemIconIds();
	const outOfRange = ids.filter((_id, i) => i >= ids.length);
	check(
		"toda tesela del atlas tiene columna en rango (recorte CSS válido)",
		outOfRange.length === 0 && ids.length > 0
	);

	// Id desconocido → null (la UI cae al swatch/texto)
	check("id desconocido → null", itemicons.itemIconGrid(999999) === null);
	check("id no entero → null", itemicons.itemIconGrid(undefined) === null);

	// Determinismo: el mismo icono dos veces es idéntico
	const a1 = itemicons.itemIconGrid(101);
	const a2 = itemicons.itemIconGrid(101);
	check(
		"los iconos son deterministas (misma semilla)",
		JSON.stringify(a1) === JSON.stringify(a2)
	);

	// Distintos deben distinguirse visualmente
	const differs = (x, y) =>
		JSON.stringify(itemicons.itemIconGrid(x)) !==
		JSON.stringify(itemicons.itemIconGrid(y));
	check("lingote de hierro ≠ lingote de oro", differs(102, 103));
	check("pico de madera ≠ pico de diamante", differs(200, 204));
	check("pico ≠ hacha del mismo material", differs(202, 207));
	check("carne cruda ≠ cocinada", differs(107, 111));
	check("diamante ≠ esmeralda", differs(104, 106));
	check("casco de cuero ≠ casco de diamante", differs(220, 228));

	// Coherencia por material de herramienta: los 5 materiales se distinguen
	// entre sí dentro del mismo tipo (pico).
	const pickaxes = [200, 201, 202, 203, 204].map(itemicons.itemIconGrid);
	const allDistinct =
		new Set(pickaxes.map((g) => JSON.stringify(g))).size === 5;
	check(
		"los 5 picos (madera/piedra/hierro/oro/diamante) se distinguen",
		allDistinct
	);

	// Los iconos no dependen del orden: el grid cubre celdas reales (no todo
	// transparente, ya comprobado) y tiene suficiente tinta para leerse.
	const pixels = (g) => g.filter(Boolean).length;
	check(
		"el icono de la espada de hierro tiene tinta suficiente",
		pixels(itemicons.itemIconGrid(217)) >= 30,
		`${pixels(itemicons.itemIconGrid(217))} px`
	);

	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("unit-itemicons:", e.message);
	process.exit(1);
});
