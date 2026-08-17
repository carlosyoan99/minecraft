"use strict";
// ============================================================
// TESTS UNITARIOS DE LA FASE 19 (UI: drag & drop + hot-reload)
// Cubre la lógica PURA de public/draglogic.js (qué evento envía cada
// par origen→destino) y la API de hot-reload de public/itemicons.js.
// Sin DOM ni canvas: módulos ESM puros importados por file://.
// ============================================================
const path = require("node:path");

let ok = 0;
let fail = 0;
const failedChecks = [];
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
	const { dropAction } = await import(
		`file://${path.join(__dirname, "..", "public", "draglogic.js")}`
	);
	const inv = (i) => ({ kind: "inv", index: i });
	const grid = (i) => ({ kind: "grid", index: i });
	const chest = (i) => ({ kind: "chest", index: i });

	// --- inventario → inventario: inventory_swap ---
	check(
		"inv→inv envía inventory_swap con from/to",
		JSON.stringify(dropAction(inv(3), inv(12))) ===
			JSON.stringify({ event: "inventory_swap", data: { from: 3, to: 12 } })
	);

	// --- inventario → grid / chest / horno ---
	check(
		"inv→grid envía grid_set al slot destino",
		JSON.stringify(dropAction(inv(5), grid(2))) ===
			JSON.stringify({
				event: "grid_set",
				data: { fromInventorySlot: 5, toGridSlot: 2 }
			})
	);
	check(
		"inv→chest envía chest_action put con chestSlot destino",
		JSON.stringify(dropAction(inv(5), chest(9))) ===
			JSON.stringify({
				event: "chest_action",
				data: { action: "put", invSlot: 5, chestSlot: 9 }
			})
	);
	check(
		"inv→fuel envía furnace_action add_fuel",
		JSON.stringify(dropAction(inv(5), { kind: "fuel", index: 0 })) ===
			JSON.stringify({
				event: "furnace_action",
				data: { action: "add_fuel", invSlot: 5 }
			})
	);
	check(
		"inv→input envía furnace_action add_input",
		JSON.stringify(dropAction(inv(5), { kind: "input", index: 0 })) ===
			JSON.stringify({
				event: "furnace_action",
				data: { action: "add_input", invSlot: 5 }
			})
	);

	// --- grid / chest → inventario ---
	check(
		"grid→inv envía grid_return de la celda",
		JSON.stringify(dropAction(grid(4), inv(0))) ===
			JSON.stringify({ event: "grid_return", data: { toGridSlot: 4 } })
	);
	check(
		"chest→inv envía chest_action take con invSlot destino",
		JSON.stringify(dropAction(chest(9), inv(7))) ===
			JSON.stringify({
				event: "chest_action",
				data: { action: "take", chestSlot: 9, invSlot: 7 }
			})
	);

	// --- pares no transportables → null ---
	check("mismo slot → null", dropAction(inv(2), inv(2)) === null);
	check("grid→grid → null", dropAction(grid(1), grid(5)) === null);
	check("chest→chest → null", dropAction(chest(0), chest(1)) === null);
	check(
		"fuel→inv → null",
		dropAction({ kind: "fuel", index: 0 }, inv(0)) === null
	);
	check(
		"output→inv → null",
		dropAction({ kind: "output", index: 0 }, inv(0)) === null
	);
	check("destino vacío → null", dropAction(inv(1), null) === null);
	check("origen vacío → null", dropAction(null, inv(1)) === null);

	// --- hot-reload del atlas de iconos (Fase 19, E) ---
	const itemicons = await import(
		`file://${path.join(__dirname, "..", "public", "itemicons.js")}`
	);
	check(
		"reloadItemIcons existe y es función",
		typeof itemicons.reloadItemIcons === "function"
	);
	// El icono se sigue dibujando tras el reload (la API no rompe el grid).
	const before = itemicons.itemIconGrid(7);
	itemicons.reloadItemIcons();
	const after = itemicons.itemIconGrid(7);
	check(
		"el icono es determinista tras reloadItemIcons",
		JSON.stringify(before) === JSON.stringify(after)
	);

	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	console.error("unit-fase19:", e.message);
	process.exit(1);
});
