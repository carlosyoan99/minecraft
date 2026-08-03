"use strict";
// ============================================================
// TESTS DE SINCRONIZACIÓN SERVIDOR ↔ CLIENTE
// Los IDs de bloques/ítems viven duplicados en constants.js
// (servidor) y public/constants.js (cliente ESM). Si divergen, el
// wire del inventario/colocación se rompe silenciosamente. Este
// test parsea el ESM del cliente y compara contra el servidor.
// ============================================================
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const server = require(path.join(ROOT, "server", "constants.js"));

const src = fs.readFileSync(path.join(ROOT, "public/constants.js"), "utf8");

let fails = 0;
const check = (name, ok, extra = "") => {
	if (!ok) fails++;
	console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? " — " + extra : ""}`);
};

// Parse de un objeto exportado tipo `export const X = { 1: v, 2: v, ... };`
// Los valores pueden ser hex (colores), números o strings (nombres de items).
function parseObj(name) {
	const m = src.match(
		new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\};`)
	);
	if (!m) return null;
	const out = {};
	for (const [, k, v] of m[1].matchAll(
		/(\d+):\s*(0x[0-9a-fA-F]+|\d+|'[^']*')/g
	))
		out[Number(k)] = v;
	return out;
}
// Parse de un Set exportado tipo `export const NAME = new Set([a, b, ...]);`
function parseSet(name) {
	const m = src.match(
		new RegExp(`export const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`)
	);
	if (!m) return null;
	return new Set([...m[1].matchAll(/\d+/g)].map((x) => Number(x[0])));
}
// Parse de un escalar `export const NAME = N;`
function parseNum(name) {
	const m = src.match(new RegExp(`export const ${name} = (\\d+);`));
	return m ? Number(m[1]) : null;
}

// --- 1) Bloques: BLOCK_COLORS del cliente cubre TODOS los IDs de B ---
{
	const clientBlocks = parseObj("BLOCK_COLORS");
	const missing = [];
	for (const id of Object.values(server.B)) {
		if (id === server.B.AIR) continue; // el aire no tiene color (no se renderiza)
		if (!(id in (clientBlocks || {}))) missing.push(id);
	}
	check(
		"BLOCK_COLORS cliente cubre todos los bloques de B (salvo el aire)",
		!!clientBlocks && missing.length === 0,
		"faltan: " + missing.join(",")
	);
	// Y no hay bloques extra (cliente = servidor, mismo universo)
	const extra = Object.keys(clientBlocks || {})
		.map(Number)
		.filter((id) => !Object.values(server.B).includes(id));
	check(
		"BLOCK_COLORS no tiene bloques que el servidor no conozca",
		extra.length === 0,
		"extra: " + extra.join(",")
	);
}

// --- 2) Ítems: ITEM_NAMES del cliente cubre todos los IDs de I ---
{
	const clientItems = parseObj("ITEM_NAMES");
	const missing = [];
	for (const id of Object.values(server.I)) {
		if (!(id in (clientItems || {}))) missing.push(id);
	}
	check(
		"ITEM_NAMES cliente cubre todos los ítems de I",
		!!clientItems && missing.length === 0,
		"faltan: " + missing.join(",")
	);
}

// --- 3) Durabilidad: DURABILITY (cliente) == TOOL_DURABILITY (servidor) ---
{
	const clientDur = parseObj("DURABILITY");
	let equal = !!clientDur;
	for (const [id, max] of Object.entries(server.TOOL_DURABILITY)) {
		if (Number(clientDur[Number(id)]) !== max) equal = false;
	}
	check(
		"DURABILITY cliente == TOOL_DURABILITY servidor",
		equal,
		equal ? "" : JSON.stringify(clientDur)
	);
}

// --- 4) Comida: FOOD_ITEMS del cliente == claves de FOOD_VALUES del servidor ---
{
	const clientFood = parseSet("FOOD_ITEMS");
	const serverFood = new Set(Object.keys(server.FOOD_VALUES).map(Number));
	let equal = !!clientFood && clientFood.size === serverFood.size;
	for (const id of serverFood) if (!clientFood.has(id)) equal = false;
	for (const id of clientFood || []) if (!serverFood.has(id)) equal = false;
	check(
		"FOOD_ITEMS cliente == FOOD_VALUES servidor",
		equal,
		equal
			? ""
			: `cliente=[${[...(clientFood || [])].join(",")}] servidor=[${[...serverFood].join(",")}]`
	);
}

// --- 5) Cría: BREED_FOOD cliente == valores de BREED_FOOD servidor ---
{
	const clientBreed = parseSet("BREED_FOOD");
	const serverBreed = new Set(Object.values(server.BREED_FOOD));
	let equal = !!clientBreed && clientBreed.size === serverBreed.size;
	for (const id of serverBreed) if (!clientBreed.has(id)) equal = false;
	check(
		"BREED_FOOD cliente == BREED_FOOD servidor",
		equal,
		equal
			? ""
			: `cliente=[${[...(clientBreed || [])].join(",")}] servidor=[${[...serverBreed].join(",")}]`
	);
}

// --- 6) Colocables: PLACEABLE_BLOCKS del cliente ⊆ bloques del servidor ---
{
	const clientPlace = parseSet("PLACEABLE_BLOCKS");
	const valid = new Set(Object.values(server.B));
	let ok = !!clientPlace;
	for (const id of clientPlace || []) if (!valid.has(id)) ok = false;
	check("PLACEABLE_BLOCKS cliente son bloques válidos del servidor", ok);
}

// --- 7) Constantes compartidas: WATER, SNOW, XP_PER_LEVEL, DAY_CYCLE_MS ---
check(
	"WATER cliente (20) == servidor",
	parseNum("WATER") === server.B.WATER,
	"cliente=" + parseNum("WATER")
);
check(
	"SNOW cliente (21) == servidor",
	parseNum("SNOW") === server.B.SNOW,
	"cliente=" + parseNum("SNOW")
);
check(
	"XP_PER_LEVEL cliente == servidor",
	parseNum("XP_PER_LEVEL") === server.XP_PER_LEVEL,
	"cliente=" + parseNum("XP_PER_LEVEL")
);
check(
	"DAY_CYCLE_MS cliente == servidor",
	parseNum("DAY_CYCLE_MS") === server.DAY_CYCLE_MS,
	"cliente=" + parseNum("DAY_CYCLE_MS")
);

// --- 8) Los items de crafteo de la Fase 3/5 están todos en ITEM_NAMES ---
{
	const clientItems = parseObj("ITEM_NAMES");
	const foodIds = Object.keys(server.FOOD_VALUES).map(Number);
	check(
		"toda la comida tiene nombre en el cliente",
		foodIds.every((id) => id in clientItems)
	);
	check(
		"los ítems de cría (115-117) tienen nombre",
		[115, 116, 117].every((id) => id in clientItems)
	);
	check(
		"hilo (120) y conejo (118/119) tienen nombre",
		[118, 119, 120].every((id) => id in clientItems)
	);
}

console.log(
	fails === 0 ? "\n✅ Todos los tests pasan" : `\n❌ ${fails} tests fallaron`
);
process.exit(fails ? 1 : 0);
