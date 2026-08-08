"use strict";
// Test unitario de la Fase 5 (progresión y combate):
//  - Durabilidad de herramientas: addToInventory con durabilidad (no se apilan),
//    applyToolWear (-1 por uso, se rompe al llegar a 0, solo espadas con flag).
//  - XP simple / niveles: addXp, maxHealth por nivel (máx +10), conservación al morir.
//  - Nuevos mobs: spider/wolf/rabbit (salud, drops, daño de espada por material).
//  - Recetas: hilo(118) → lana y conejo crudo(118) → asado(119) en el horno.
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const {
	TOOL_DURABILITY,
	SWORD_DAMAGE,
	isTool,
	XP_PER_LEVEL,
	MOB_XP,
	ORE_XP,
	B,
	I
} = require(path.join(ROOT, "server", "constants.js"));
const playersMod = require(path.join(ROOT, "server", "players.js"));
const mobsMod = require(path.join(ROOT, "server", "mobs.js"));
const crafting = require(path.join(ROOT, "server", "crafting.js"));
const world = require(path.join(ROOT, "server", "world.js"));

let fails = 0;
function check(_name, ok, _extra = "") {
	if (!ok) fails++;
}

const _OPEN = 1;
const CLOSED = 3;
function mkPlayer(over = {}) {
	return {
		id: "p",
		ws: { readyState: CLOSED, send() {} },
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
		x: 0,
		y: 64,
		z: 0,
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		...over
	};
}

crafting.loadRecipes();

// 1) TOOL_DURABILITY cubre todas las herramientas (200-219)
{
	let all = true;
	for (let id = 200; id <= 219; id++) if (!TOOL_DURABILITY[id]) all = false;
	check("TOOL_DURABILITY cubre 200-219", all);
	check("isTool(200) pico de madera", isTool(200) === true);
	check("isTool(100) palo NO es herramienta", isTool(100) === false);
	check(
		"diamante dura más que madera (progresión)",
		TOOL_DURABILITY[204] > TOOL_DURABILITY[200]
	);
}

// 2) addToInventory: las herramientas llevan durabilidad plena y NO se apilan
{
	const p = mkPlayer();
	playersMod.addToInventory(p, I.WOODEN_PICKAXE, 1);
	playersMod.addToInventory(p, I.WOODEN_PICKAXE, 1);
	const slots = p.inventory.filter(Boolean);
	check(
		"herramienta nueva con durabilidad plena",
		slots[0].durability === TOOL_DURABILITY[I.WOODEN_PICKAXE],
		`dur=${slots[0].durability}`
	);
	check("las herramientas no se apilan (2 slots)", slots.length === 2);
}

// 3) applyToolWear: -1 por uso, y se rompe al llegar a 0
{
	const p = mkPlayer({ selectedSlot: 0 });
	p.inventory[0] = { id: I.IRON_PICKAXE, count: 1, durability: 2 };
	check(
		"wear 1: -1 durabilidad",
		playersMod.applyToolWear(p) === false && p.inventory[0].durability === 1
	);
	check(
		"wear 2: se rompe y elimina el slot",
		playersMod.applyToolWear(p) === true && p.inventory[0] === null
	);
	check(
		"wear 3: mano vacía no desgasta",
		playersMod.applyToolWear(p) === false
	);
}

// 4) onlySwords: al atacar solo se desgasta la espada
{
	const p = mkPlayer({ selectedSlot: 0 });
	p.inventory[0] = { id: I.WOODEN_SWORD, count: 1, durability: 3 };
	check(
		"atacar con espada desgasta",
		playersMod.applyToolWear(p, true) === false &&
			p.inventory[0].durability === 2
	);
	const q = mkPlayer({ selectedSlot: 0 });
	q.inventory[0] = { id: I.IRON_PICKAXE, count: 1, durability: 5 };
	check(
		"atacar con pico NO desgasta (solo espadas)",
		playersMod.applyToolWear(q, true) === false &&
			q.inventory[0].durability === 5
	);
}

// 5) Una herramienta con durabilidad 1 que se rompe a mitad de una acción no duplica items
//    (secuencia del handler break: se añade el drop y luego se desgasta/elimina la herramienta)
{
	const p = mkPlayer({ selectedSlot: 0, x: 0.5, y: 64, z: 0.5 });
	p.inventory[0] = { id: I.STONE_PICKAXE, count: 1, durability: 1 };
	world.setBlock(5, 5, 5, B.STONE);
	world.setBlock(5, 5, 5, B.AIR); // romper
	playersMod.addToInventory(p, B.COBBLESTONE, 1); // drop
	const broke = playersMod.applyToolWear(p);
	check("se rompe a mitad de la acción", broke === true);
	check(
		"el drop NO se duplica (1 adoquín)",
		playersMod.countInInventory(p, B.COBBLESTONE) === 1,
		`count=${playersMod.countInInventory(p, B.COBBLESTONE)}`
	);
	check(
		"la herramienta rota desaparece",
		playersMod.countInInventory(p, I.STONE_PICKAXE) === 0
	);
}

// 6) La durabilidad viaja por la mesa de crafteo: grid_set la guarda y
//    grid_clear la devuelve (addToInventory con la durabilidad guardada), de
//    modo que NO se "repara gratis" una herramienta dañada (evita duplicar usos)
{
	const p = mkPlayer();
	playersMod.addToInventory(p, I.WOODEN_AXE, 1);
	const idx = p.inventory.findIndex((s) => s && s.id === I.WOODEN_AXE);
	p.inventory[idx].durability = 30;
	const saved = p.inventory[idx].durability;
	p.inventory[idx] = null; // grid_set la saca del inventario (conservando durability)
	playersMod.addToInventory(p, I.WOODEN_AXE, 1, saved); // grid_clear la devuelve
	const found = p.inventory.filter((s) => s && s.id === I.WOODEN_AXE);
	check(
		"round-trip por la mesa conserva durabilidad (no se repara gratis)",
		found.length === 1 && found[0].durability === 30,
		`dur=${found[0]?.durability}`
	);
}
check(
	"todas las espadas tienen daño",
	[215, 216, 217, 218, 219].every((id) => SWORD_DAMAGE[id] > 0)
);
check(
	"diamante > hierro > piedra > madera",
	SWORD_DAMAGE[219] > SWORD_DAMAGE[217] &&
		SWORD_DAMAGE[217] > SWORD_DAMAGE[216] &&
		SWORD_DAMAGE[216] > SWORD_DAMAGE[215]
);
check(
	"oro más débil que hierro (como Minecraft)",
	SWORD_DAMAGE[218] < SWORD_DAMAGE[217]
);

// 7) addXp acumula y sube de nivel con la CURVA OFICIAL de Minecraft
//    (Fase 9 curva + Fase 13 paridad B2): coste por tramos 2L+7 (0-15),
//    5L−38 (16-30), 9L−158 (31+) → 7, 9, 11, 13... La salud máxima es
//    SIEMPRE 20 (paridad B1: en MC real el nivel no da vida).
{
	const p = mkPlayer();
	playersMod.addXp(p, 7); // coste del nivel 0→1 = 7
	check("7 XP → nivel 1", p.level === 1, `level=${p.level}`);
	check(
		"maxHealth siempre 20 (sin bonus por nivel)",
		p.maxHealth === 20,
		`max=${p.maxHealth}`
	);
	playersMod.addXp(p, 1); // 8 XP total: aún no llega a 7+9=16
	check("8 XP → sigue nivel 1 (aún no 2)", p.level === 1, `level=${p.level}`);
	playersMod.addXp(p, 8); // 16 XP total → nivel 2 (7+9)
	check("16 XP → nivel 2", p.level === 2, `level=${p.level}`);
	check("maxHealth sigue en 20", p.maxHealth === 20);
}

// 8) Nivel alto con la curva oficial: 2500 XP dan un nivel MUY superior a
//    25 (los niveles pequeños cuestan menos), y maxHealth se mantiene en 20.
{
	const p = mkPlayer();
	playersMod.addXp(p, 100 * 25);
	check(
		"2500 XP → nivel alto con la curva MC oficial",
		p.level >= 25,
		`level=${p.level}`
	);
	check("maxHealth siempre 20", p.maxHealth === 20, `max=${p.maxHealth}`);
}

// 9) La XP se conserva al morir y el respawn usa salud máxima 20. Con la
//    curva oficial, 300 XP son nivel 14 (suma 7+9+...+33 = 280 ≤ 300 < 315).
{
	const p = mkPlayer({ health: 3 });
	playersMod.addXp(p, 300);
	const expectedLevel = 14;
	check(
		"300 XP → nivel 14 (curva MC oficial)",
		p.level === expectedLevel,
		`level=${p.level}`
	);
	playersMod.damagePlayer(p, 999); // daño masivo → respawn interno
	check(
		"respawn con salud máxima 20 (sin bonus por nivel)",
		p.health === 20,
		`health=${p.health}`
	);
	check(
		"la XP se conserva al morir",
		p.xp === 300 && p.level === expectedLevel
	);
}

// 10) ORE_XP y MOB_XP mapean (fuente de verdad para break/attack)
check(
	"ORE_XP cubre los 6 minerales",
	[9, 10, 11, 12, 13, 14].every((id) => ORE_XP[id] > 0)
);
check(
	"MOB_XP cubre hostiles y pasivos nuevos",
	MOB_XP.spider > 0 && MOB_XP.wolf > 0 && MOB_XP.rabbit > 0 && MOB_XP.zombie > 0
);

// 11) Salud por tipo
check(
	"spider 12 HP (frágil)",
	new mobsMod.Mob("spider", 0, 64, 0).health === 12
);
check("wolf 20 HP", new mobsMod.Mob("wolf", 0, 64, 0).health === 20);
check(
	"rabbit 10 HP (pasivo)",
	new mobsMod.Mob("rabbit", 0, 64, 0).health === 10
);

// 12) Drops: la araña suelta hilo (118), el conejo carne cruda (118→hornear)
{
	const realRandom = Math.random;
	Math.random = () => 0.5; // count = min + 0.5*range → determinista
	const spider = mobsMod.mobDrops({ type: "spider", isBaby: false });
	const rabbit = mobsMod.mobDrops({ type: "rabbit", isBaby: false });
	Math.random = realRandom;
	check(
		"spider dropea hilo (118)",
		spider?.[0] && spider[0].id === I.STRING,
		JSON.stringify(spider)
	);
	check(
		"rabbit dropea conejo crudo (118)",
		rabbit?.[0] && rabbit[0].id === I.RABBIT,
		JSON.stringify(rabbit)
	);
}

// 13) El conejo se cría con zanahorias y el hilo sirve para lana (recetas)
check(
	"rabbit se alimenta con zanahoria (cría)",
	mobsMod.canFeed(
		{ type: "rabbit", isBaby: false, cooldownUntil: 0 },
		I.CARROT
	) === "ok"
);
{
	const grid = new Array(9).fill(null);
	for (const idx of [0, 1, 3, 4]) grid[idx] = { id: I.STRING, count: 1 }; // 2x2 hilo
	const r = crafting.matchRecipe(grid);
	check(
		"2x2 hilo → lana (18)",
		r && r.result.id === 18,
		JSON.stringify(r?.result)
	);
}
check("conejo crudo (118) es cocinable", crafting.isCookable(118) === true);
check("hilo (120) NO es cocinable", crafting.isCookable(120) === false);

// 14) mobSnapshot expone el tipo (el cliente escala por tipo)
check(
	"mobSnapshot incluye type (escala cliente)",
	mobsMod.mobSnapshot({
		id: "x",
		type: "spider",
		color: 1,
		state: "idle",
		isBaby: false
	}).type === "spider"
);
process.exit(fails === 0 ? 0 : 1);
