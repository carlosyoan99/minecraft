"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 5 (herramienta reutilizable)
// Objetivos del TODO: (a) la durabilidad se sincroniza entre el
// inventario del servidor y el HUD del cliente; (b) no hay forma de
// duplicar items al romperse una herramienta a mitad de una acción.
//
// 1) Sincronización servidor ↔ cliente:
//    - TOOL_DURABILITY (constants.js) == DURABILITY (public/constants.js)
//    - el wire del inventario (inventory_update) lleva durabilidad
//    - el HUD (public/ui.js) pinta la barra de durabilidad
// 2) No-duplicación: replicar la secuencia EXACTA del handler break
//    (romper bloque → añadir drop → desgastar herramienta → enviar
//    inventario) y comprobar que el drop se añade una única vez y la
//    herramienta rota desaparece sin dejar copias.
//    NOTA: esto valida la lógica de durabilidad y su atomicidad con los
//    helpers exportados de players.js, NO ejercita el handler real de
//    net.js (que no está exportado); el patrón replica el orden exacto.
// 3) XP/niveles: round-trip de xp/level/maxHealth y tope de +10.
//
// Uso: node tests/audit-fase5.js
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const { TOOL_DURABILITY, XP_PER_LEVEL, MAX_LEVEL_HEALTH_BONUS, B, I } = require(
	path.join(ROOT, "server", "constants.js")
);
const playersMod = require(path.join(ROOT, "server", "players.js"));
const world = require(path.join(ROOT, "server", "world.js"));
const mobsMod = require(path.join(ROOT, "server", "mobs.js"));

let fails = 0;
function check(_name, ok, _extra = "") {
	if (!ok) fails++;
}

const OPEN = 1;
function mkPlayer(over = {}) {
	return {
		id: "p",
		ws: { readyState: OPEN, send() {} },
		health: 20,
		maxHealth: 20,
		xp: 0,
		level: 0,
		food: 20,
		saturation: 20,
		foodAccum: 0,
		regenAccum: 0,
		starveAccum: 0,
		lastMoveTime: 0,
		x: 0.5,
		y: 64,
		z: 0.5,
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		...over
	};
}

// 1a) TOOL_DURABILITY (servidor) == DURABILITY (cliente): parse del ESM
{
	const src = fs.readFileSync(path.join(ROOT, "public/constants.js"), "utf8");
	const m = src.match(/export const DURABILITY = \{([\s\S]*?)\n\};/);
	check("public/constants.js define DURABILITY", !!m);
	if (m) {
		const entries = [...m[1].matchAll(/(\d+):\s*(\d+)/g)];
		const client = Object.fromEntries(
			entries.map((e) => [Number(e[1]), Number(e[2])])
		);
		let equal = Object.keys(TOOL_DURABILITY).length === entries.length;
		for (const [id, max] of Object.entries(TOOL_DURABILITY)) {
			if (client[Number(id)] !== max) equal = false;
		}
		check(
			`DURABILITY cliente == TOOL_DURABILITY servidor (${entries.length} herramientas)`,
			equal
		);
		check(
			"XP_PER_LEVEL cliente == servidor (100)",
			/export const XP_PER_LEVEL = 100;/.test(src)
		);
	}
}

// 1b) El wire del inventario lleva durabilidad por herramienta
{
	const sent = [];
	const p = mkPlayer({
		ws: { readyState: OPEN, send: (s) => sent.push(JSON.parse(s)) }
	});
	p.inventory[0] = { id: I.DIAMOND_PICKAXE, count: 1, durability: 1234 };
	playersMod.sendInventory(p);
	const msg = sent.find((m) => m.event === "inventory_update");
	const slot = msg?.data.inventory[0];
	check(
		"inventory_update incluye durability en el wire",
		slot && slot.durability === 1234,
		JSON.stringify(slot)
	);
}

// 1c) El HUD pinta la barra de durabilidad (public/ui.js usa DURABILITY)
{
	const src = fs.readFileSync(path.join(ROOT, "public/ui.js"), "utf8");
	check("ui.js importa DURABILITY", /DURABILITY/.test(src));
	check("ui.js pinta .durbar (barra de durabilidad)", /durbar/.test(src));
	check(
		"ui.js usa item.durability para el ancho",
		/item\.durability/.test(src)
	);
	check(
		"el servidor avisa tool_broke al romperse (net.js)",
		/tool_broke/.test(
			fs.readFileSync(path.join(ROOT, "server", "net.js"), "utf8")
		)
	);
}

// Replica EXACTA de la secuencia del handler break de net.js (bloque de
// piedra con un pico de durabilidad 1): setBlock(AIR) → drop → wear.
{
	const p = mkPlayer({ selectedSlot: 0 });
	p.inventory[0] = { id: I.STONE_PICKAXE, count: 1, durability: 1 };
	world.setBlock(9, 9, 9, B.STONE);

	// --- secuencia del handler ---
	world.setBlock(9, 9, 9, B.AIR);
	let drop = B.STONE;
	if (drop === B.STONE) drop = B.COBBLESTONE;
	playersMod.addToInventory(p, drop, 1);
	const broke = playersMod.applyToolWear(p);
	playersMod.sendInventory(p);
	// -----------------------------

	check("el bloque quedó roto (AIR)", world.getBlock(9, 9, 9) === B.AIR);
	check("la herramienta se rompió (broke=true)", broke === true);
	check(
		"drop añadido UNA vez (1 adoquín)",
		playersMod.countInInventory(p, B.COBBLESTONE) === 1,
		`adoquín=${playersMod.countInInventory(p, B.COBBLESTONE)}`
	);
	check(
		"herramienta rota SIN copias (0 picos)",
		playersMod.countInInventory(p, I.STONE_PICKAXE) === 0,
		`picos=${playersMod.countInInventory(p, I.STONE_PICKAXE)}`
	);
	check(
		"total de slots coherente (1 drop, 0 herramientas)",
		p.inventory.filter(Boolean).length === 1
	);
}

// Romper con la mano (sin herramienta): no desgasta nada y el drop aparece
{
	const p = mkPlayer();
	world.setBlock(9, 9, 8, B.STONE);
	world.setBlock(9, 9, 8, B.AIR);
	playersMod.addToInventory(p, B.COBBLESTONE, 1);
	check(
		"romper a mano: sin desgaste y 1 drop",
		p.inventory.filter(Boolean).length === 1 &&
			playersMod.countInInventory(p, B.COBBLESTONE) === 1
	);
}

// Varios usos seguidos con la misma herramienta: nunca aparecen copias fantasma
{
	const p = mkPlayer({ selectedSlot: 0 });
	p.inventory[0] = { id: I.IRON_PICKAXE, count: 1, durability: 5 };
	let broke = false;
	for (let i = 0; i < 6; i++) {
		world.setBlock(7, 7, 7 + i, B.STONE);
		world.setBlock(7, 7, 7 + i, B.AIR);
		playersMod.addToInventory(p, B.COBBLESTONE, 1);
		broke = playersMod.applyToolWear(p) || broke;
	}
	check("6 roturas con durabilidad 5 → se rompe en el 6º uso", broke === true);
	check(
		"6 drops exactos (sin duplicar)",
		playersMod.countInInventory(p, B.COBBLESTONE) === 6
	);
	check(
		"herramienta desapareció (0 copias)",
		playersMod.countInInventory(p, I.IRON_PICKAXE) === 0
	);
}
{
	const p = mkPlayer();
	playersMod.addXp(p, XP_PER_LEVEL * 3 + 40);
	check("340 XP → nivel 3", p.level === 3, `level=${p.level}`);
	check("maxHealth = 23 (20+3)", p.maxHealth === 20 + 3, `max=${p.maxHealth}`);
	check("xp conservada en el objeto", p.xp === XP_PER_LEVEL * 3 + 40);
}
{
	const p = mkPlayer();
	playersMod.addXp(p, XP_PER_LEVEL * 15);
	check(
		"nivel 15 pero maxHealth tope en 30 (+10)",
		p.level === 15 && p.maxHealth === 20 + MAX_LEVEL_HEALTH_BONUS,
		`level=${p.level} max=${p.maxHealth}`
	);
}
{
	// El respawn tras morir usa maxHealth (y conserva XP/nivel)
	const p = mkPlayer({ health: 3, maxHealth: 24 });
	playersMod.addXp(p, XP_PER_LEVEL * 4);
	playersMod.damagePlayer(p, 999);
	check(
		"respawn usa maxHealth (24) y conserva nivel 4",
		p.health === 24 && p.level === 4,
		`health=${p.health} level=${p.level}`
	);
}
{
	// Rendimiento: desgastar 10.000 veces < 1s (barato, sin abusar del tick)
	const p = mkPlayer({ selectedSlot: 0 });
	p.inventory[0] = { id: I.DIAMOND_PICKAXE, count: 1, durability: 1562 };
	const t0 = process.hrtime.bigint();
	for (let i = 0; i < 10000; i++) playersMod.applyToolWear(p);
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	check(
		`applyToolWear barato (10k usos en ${ms.toFixed(1)} ms)`,
		ms < 1000,
		`${ms.toFixed(1)}ms`
	);
}
{
	const realRandom = Math.random;
	Math.random = () => 0.5;
	const cow = mobsMod.mobDrops({ type: "cow", isBaby: false });
	Math.random = realRandom;
	check(
		"vaca sigue dando carne (Fase 3 intacta)",
		cow?.[0] && cow[0].id === I.BEEF,
		JSON.stringify(cow)
	);
}
check(
	"isSolidBlock(SNOW) intacto (Fase 4)",
	require(path.join(ROOT, "server", "constants.js")).isSolidBlock(21) === true
);
check(
	"world.getHeight intacto (Fase 4)",
	typeof world.getHeight === "function"
);
process.exit(fails ? 1 : 0);
