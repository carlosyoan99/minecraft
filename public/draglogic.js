// ============================================================
// DRAG & DROP — LÓGICA PURA DE TRANSPORTE (Fase 19, D1/D2)
// Decide, para un par (origen → destino) de slots, qué evento de
// red enviar. Sin DOM ni imports: tests/unit-fase19.js la importa
// en Node como ESM puro.
//
// kinds: "inv" (inventario del jugador), "grid" (celda de crafteo),
//        "chest" (slot del cofre), "fuel"/"input"/"output" (horno).
// Devuelve { event, data } o null si el par no es transportable.
// ============================================================

export function dropAction(src, dst) {
	if (!src || !dst) return null;
	const { kind: sk, index: si } = src;
	const { kind: dk, index: di } = dst;
	// Mismo slot → no-op.
	if (sk === dk && si === di) return null;

	if (sk === "inv" && dk === "inv")
		return { event: "inventory_swap", data: { from: si, to: di } };
	if (sk === "inv" && dk === "grid")
		return {
			event: "grid_set",
			data: { fromInventorySlot: si, toGridSlot: di }
		};
	if (sk === "inv" && dk === "chest")
		return {
			event: "chest_action",
			data: { action: "put", invSlot: si, chestSlot: di }
		};
	if (sk === "inv" && dk === "fuel")
		return {
			event: "furnace_action",
			data: { action: "add_fuel", invSlot: si }
		};
	if (sk === "inv" && dk === "input")
		return {
			event: "furnace_action",
			data: { action: "add_input", invSlot: si }
		};
	if (sk === "grid" && dk === "inv")
		return { event: "grid_return", data: { toGridSlot: si } };
	if (sk === "chest" && dk === "inv")
		return {
			event: "chest_action",
			data: { action: "take", chestSlot: si, invSlot: di }
		};
	// grid→grid, chest→chest, fuel/input/output como origen → no transportable.
	return null;
}
