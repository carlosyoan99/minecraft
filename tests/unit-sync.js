"use strict";
// ============================================================
// TESTS DE SINCRONIZACIÓN SERVIDOR ↔ CLIENTE
// Los IDs de bloques/ítems viven duplicados en constants.js
// (servidor) y public/constants.js (cliente ESM). Si divergen, el
// wire del inventario/colocación se rompe silenciosamente. Este
// test parsea el ESM del cliente y compara contra el servidor.
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const server = require(path.join(ROOT, "server", "constants.js"));

const src = fs.readFileSync(path.join(ROOT, "public/constants.js"), "utf8");
const mobSrc = fs.readFileSync(
	path.join(ROOT, "public/mobtextures.js"),
	"utf8"
);

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

// Parse de un objeto exportado tipo `export const X = { 1: v, 2: v, ... };`
// Los valores pueden ser hex (colores), números o strings (nombres de items).
function parseObj(name) {
	const m = src.match(
		new RegExp(`export const ${name} = \\{([\\s\\S]*?)\\n\\};`)
	);
	if (!m) return null;
	const out = {};
	for (const [, k, v] of m[1].matchAll(
		/(\d+):\s*(0x[0-9a-fA-F]+|\d+|'[^']*'|"[^"]*")/g
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
// Parse de un escalar `export const NAME = N;` (entero o decimal, ej. EYE_HEIGHT)
function parseNum(name) {
	const m = src.match(new RegExp(`export const ${name} = ([\\d.]+);`));
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
		`faltan: ${missing.join(",")}`
	);
	// Y no hay bloques extra (cliente = servidor, mismo universo)
	const extra = Object.keys(clientBlocks || {})
		.map(Number)
		.filter((id) => !Object.values(server.B).includes(id));
	check(
		"BLOCK_COLORS no tiene bloques que el servidor no conozca",
		extra.length === 0,
		`extra: ${extra.join(",")}`
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
		`faltan: ${missing.join(",")}`
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
	`cliente=${parseNum("WATER")}`
);
check(
	"SNOW cliente (21) == servidor",
	parseNum("SNOW") === server.B.SNOW,
	`cliente=${parseNum("SNOW")}`
);
check(
	"LAVA cliente (25) == servidor",
	parseNum("LAVA") === server.B.LAVA,
	`cliente=${parseNum("LAVA")}`
);
check(
	"XP_PER_LEVEL cliente == servidor",
	parseNum("XP_PER_LEVEL") === server.XP_PER_LEVEL,
	`cliente=${parseNum("XP_PER_LEVEL")}`
);
check(
	"DAY_CYCLE_MS cliente == servidor",
	parseNum("DAY_CYCLE_MS") === server.DAY_CYCLE_MS,
	`cliente=${parseNum("DAY_CYCLE_MS")}`
);
// Fase 18 (C-1): las franjas día/noche MC deben ser idénticas en ambos lados
// (el servidor decide spawn/quema con isNightTime/isDayTime; el cliente pinta
// el ciclo con los mismos límites via daymath). Si divergen, la noche visual
// no coincide con la noche de juego.
{
	const m = src.match(/export const DAY_PHASES = \{([\s\S]*?)\n\};/);
	let equal = !!m;
	if (m) {
		for (const [k, v] of Object.entries(server.DAY_PHASES)) {
			const cv = m[1].match(new RegExp(`${k}: (\\d+(?:\\.\\d+)?)`));
			if (!cv || Number(cv[1]) !== v) equal = false;
		}
	}
	check(
		"DAY_PHASES cliente (dawnEnd/dayEnd/duskEnd) == servidor",
		equal,
		equal ? "" : "las franjas divergen"
	);
}
// Fase 8 (B8): el ciclo lunar (8 días) debe ser idéntico en ambos lados — el
// cliente extrapola la fase con MOON_CYCLE_MS y el servidor la deriva con el
// mismo valor (si divergen, la máscara del disco lunar se desfasa del reloj).
// MOON_CYCLE_MS en el cliente es una EXPRESIÓN derivada (DAY_CYCLE_MS *
// MOON_DAYS), no un literal: se verifica la derivación con los literales
// parseables y que coincida con el servidor.
check(
	"MOON_DAYS cliente (8) == servidor",
	parseNum("MOON_DAYS") === server.MOON_DAYS,
	`cliente=${parseNum("MOON_DAYS")} servidor=${server.MOON_DAYS}`
);
const moonDaysCliente = parseNum("MOON_DAYS");
check(
	"MOON_CYCLE_MS cliente (DAY_CYCLE_MS*MOON_DAYS) == servidor",
	moonDaysCliente !== null &&
		server.DAY_CYCLE_MS * moonDaysCliente === server.MOON_CYCLE_MS,
	`cliente=DAY_CYCLE_MS*${moonDaysCliente} servidor=${server.MOON_CYCLE_MS}`
);
check(
	"EYE_HEIGHT cliente (1.6) == servidor",
	parseNum("EYE_HEIGHT") === server.EYE_HEIGHT,
	`cliente=${parseNum("EYE_HEIGHT")}`
);
// Fase 8 (mejora anti-cheat): la física del salto/gravedad debe ser idéntica
// en ambos lados — el servidor valida el ascenso contra la parábola del salto
// (JUMP_SPEED − GRAVITY·t) y calcula el daño de caída por velocidad vertical
// (h = v²/(2·GRAVITY)) con estos valores; si el cliente saltara con otra
// física, los movimientos legítimos se rechazarían como vuelo.
check(
	"JUMP_SPEED cliente (7) == servidor",
	parseNum("JUMP_SPEED") === server.JUMP_SPEED,
	`cliente=${parseNum("JUMP_SPEED")} servidor=${server.JUMP_SPEED}`
);
check(
	"GRAVITY cliente (18) == servidor",
	parseNum("GRAVITY") === server.GRAVITY,
	`cliente=${parseNum("GRAVITY")} servidor=${server.GRAVITY}`
);
check(
	"MAX_STACK cliente == servidor (SV-5: tope de stack MC)",
	parseNum("MAX_STACK") === server.MAX_STACK,
	`cliente=${parseNum("MAX_STACK")} servidor=${server.MAX_STACK}`
);

// --- 7b) Curva de XP (Fase 13, paridad B2): xpToNext cliente (función por
// tramos MC) == servidor en TODO el rango de niveles. El cliente la usa para
// la barra de progreso del HUD; si divergiera, el progreso visual no
// coincidiría con el nivel real (desajuste silencioso, solo se ve en
// navegador). Se extrae el cuerpo de la función ESM y se evalúa contra el
// servidor en niveles 0-39 (cubre los tres tramos: 2L+7, 5L−38, 9L−158). ---
{
	const m = src.match(/export function xpToNext\(level\) \{([\s\S]*?)\n\}/);
	let equal = !!m;
	if (m) {
		let clientXpToNext;
		try {
			// eslint-disable-next-line no-new-func
			clientXpToNext = new Function("level", `"use strict";\n${m[1]}`);
			for (let level = 0; level < 40; level++) {
				if (clientXpToNext(level) !== server.xpToNext(level)) {
					equal = false;
					break;
				}
			}
		} catch {
			equal = false;
		}
	}
	check(
		"xpToNext cliente (curva MC por tramos) == servidor en niveles 0-39",
		equal,
		equal ? "" : "las curvas divergen"
	);
}

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

// --- 9) Texturas de mobs: MOB_TEXTURES (cliente) cubre TODOS los tipos de ---
// MOB_COLORS (servidor). Si un mob nuevo se añade en el servidor sin su
// textura, el render cae a color plano (fallback) y esto falla.
{
	const m = mobSrc.match(/const MOB_TEXTURES = \{([\s\S]*?)\n\};/);
	const clientTypes = m
		? new Set([...m[1].matchAll(/([a-z]+): \{/g)].map((x) => x[1]))
		: new Set();
	const serverTypes = new Set(Object.keys(server.MOB_COLORS));
	let equal = !!m && clientTypes.size === serverTypes.size;
	for (const t of serverTypes) if (!clientTypes.has(t)) equal = false;
	for (const t of clientTypes) if (!serverTypes.has(t)) equal = false;
	check(
		"MOB_TEXTURES cliente cubre todos los tipos de MOB_COLORS servidor",
		equal,
		equal
			? ""
			: `cliente=[${[...clientTypes].join(",")}] servidor=[${[...serverTypes].join(",")}]`
	);
}
// --- 10) Fase 12 (A): ítems nuevos (tridente/slimeball) sincronizados ---
// El wire del inventario depende de los IDs; si divergen, el tridente no se
// dibuja y la bola de slime no se puede craftear.
{
	const clientItems = parseObj("ITEM_NAMES");
	check(
		"Fase 12: tridente (245) y slimeball (246) tienen nombre en el cliente",
		!!clientItems &&
			clientItems[server.I.TRIDENT] &&
			clientItems[server.I.SLIME_BALL],
		`cliente tiene ${Object.keys(clientItems || {}).length} ítems`
	);
}
// --- 11) Fase 13 (L1): arco y flechas sincronizados ---
// El wire del inventario y el HUD dependen de los IDs y de BOW_DURABILITY;
// si divergen, el arco no dispara o la barra de durabilidad se rompe.
{
	const clientItems = parseObj("ITEM_NAMES");
	check(
		"Fase 13: arco (247), flecha (248), pedernal (252) y pluma (253) con nombre",
		!!clientItems &&
			clientItems[server.I.BOW] &&
			clientItems[server.I.ARROW] &&
			clientItems[server.I.FLINT] &&
			clientItems[server.I.FEATHER]
	);
	const m = src.match(/export const BOW_DURABILITY = (\d+);/);
	check(
		"BOW_DURABILITY cliente == servidor (384)",
		!!m && Number(m[1]) === server.BOW_DURABILITY,
		m ? `cliente=${m[1]} servidor=${server.BOW_DURABILITY}` : "no exportado"
	);
	check(
		"BOW en ITEM_NAMES del servidor como ítem no apilable (isTool)",
		server.isTool(server.I.BOW),
		"isTool(BOW) debe ser true (durabilidad propia, no apila)"
	);
}
// --- 12) Fase 21.5 (C2): escudo sincronizado ---
// El HUD usa SHIELD_DURABILITY para la barra del escudo (igual que arco/caña);
// si el cliente diverge, la barra de durabilidad se rompe.
{
	const clientItems = parseObj("ITEM_NAMES");
	check(
		"Fase 21.5: escudo (265) con nombre y en ITEM_NAMES",
		!!clientItems && clientItems[server.I.SHIELD]
	);
	const m = src.match(/export const SHIELD_DURABILITY = (\d+);/);
	check(
		"SHIELD_DURABILITY cliente == servidor (336)",
		!!m && Number(m[1]) === server.SHIELD_DURABILITY,
		m ? `cliente=${m[1]} servidor=${server.SHIELD_DURABILITY}` : "no exportado"
	);
	check(
		"SHIELD como ítem no apilable (isTool) y con durabilidad propia",
		server.isTool(server.I.SHIELD),
		"isTool(SHIELD) debe ser true (no apila, durabilidad propia)"
	);
}

// --- 13) Fase 21.5 (C3): tótem de la inmortalidad sincronizado ---
{
	const clientItems = parseObj("ITEM_NAMES");
	const mTotem = src.match(/export const TOTEM_OF_UNDYING = (\d+);/);
	check(
		"Fase 21.5 (C3): tótem (269) con nombre y en ITEM_NAMES del cliente",
		!!clientItems && clientItems[server.I.TOTEM_OF_UNDYING]
	);
	check(
		"TOTEM_OF_UNDYING id = 269 en ambos lados",
		server.I.TOTEM_OF_UNDYING === 269 &&
			!!mTotem &&
			Number(mTotem[1]) === server.I.TOTEM_OF_UNDYING,
		`server=${server.I.TOTEM_OF_UNDYING} cliente=${mTotem ? mTotem[1] : "no exportado"}`
	);
	check(
		"TOTEM como ítem no apilable (isTool, sin durabilidad propia)",
		server.isTool(server.I.TOTEM_OF_UNDYING) &&
			!(server.I.TOTEM_OF_UNDYING in server.TOOL_DURABILITY),
		"isTool(TOTEM) debe ser true y no estar en TOOL_DURABILITY"
	);
	check(
		"TOTEM_ABSORPTION_HP == 8 (4 corazones dorados, valor MC)",
		server.TOTEM_ABSORPTION_HP === 8,
		`${server.TOTEM_ABSORPTION_HP}`
	);
}

process.exit(fails ? 1 : 0);
