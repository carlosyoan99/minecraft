"use strict";
// Test unitario de la Fase 5 (progresión y combate):
//  - Durabilidad de herramientas: addToInventory con durabilidad (no se apilan),
//    applyToolWear (-1 por uso, se rompe al llegar a 0, solo espadas con flag).
//  - XP simple / niveles: addXp, maxHealth por nivel (máx +10), conservación al morir.
//  - Nuevos mobs: spider/wolf/rabbit (salud, drops, daño de espada por material).
//  - Recetas: hilo(118) → lana y conejo crudo(118) → asado(119) en el horno.
const path = require("path");
const ROOT = path.join(__dirname, "..");
const {
	TOOL_DURABILITY,
	SWORD_DAMAGE,
	isTool,
	XP_PER_LEVEL,
	MAX_LEVEL_HEALTH_BONUS,
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
function check(name, ok, extra = "") {
	if (!ok) fails++;
	console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? " — " + extra : ""}`);
}

const OPEN = 1;
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

// ============================================================
// DURABILIDAD
// ============================================================
console.log("=== DURABILIDAD DE HERRAMIENTAS ===");

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
		"dur=" + slots[0].durability
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
		"count=" + playersMod.countInInventory(p, B.COBBLESTONE)
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
		"dur=" + (found[0] && found[0].durability)
	);
}

// ============================================================
// DAÑO DE ESPADA POR MATERIAL
// ============================================================
console.log("\n=== DAÑO DE ESPADA ===");
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

// ============================================================
// XP Y NIVELES SIMPLES
// ============================================================
console.log("\n=== EXPERIENCIA / NIVELES ===");

// 7) addXp acumula y sube de nivel cada XP_PER_LEVEL, subiendo maxHealth
{
	const p = mkPlayer();
	playersMod.addXp(p, 150);
	check("150 XP → nivel 1", p.level === 1, "level=" + p.level);
	check("maxHealth 20 + 1", p.maxHealth === 21, "max=" + p.maxHealth);
	playersMod.addXp(p, 49);
	check("199 XP → sigue nivel 1 (aún no 2)", p.level === 1, "level=" + p.level);
	playersMod.addXp(p, 1);
	check("200 XP → nivel 2", p.level === 2, "level=" + p.level);
	check("maxHealth 20 + 2", p.maxHealth === 22);
}

// 8) Tope de salud máxima: +10 como mucho (nivel 10+)
{
	const p = mkPlayer();
	playersMod.addXp(p, 100 * 25);
	check("nivel 25 (sin tope de nivel)", p.level === 25);
	check(
		"maxHealth tope en 30 (+10)",
		p.maxHealth === 20 + MAX_LEVEL_HEALTH_BONUS,
		"max=" + p.maxHealth
	);
}

// 9) La XP se conserva al morir y el respawn usa maxHealth
//    (addXp recalcula maxHealth = 20 + nivel, así que partimos de nivel 0)
{
	const p = mkPlayer({ health: 3 });
	playersMod.addXp(p, 300); // nivel 3 → maxHealth 23
	playersMod.damagePlayer(p, 999); // daño masivo → respawn interno
	check("respawn con maxHealth (23)", p.health === 23, "health=" + p.health);
	check("la XP se conserva al morir", p.xp === 300 && p.level === 3);
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

// ============================================================
// NUEVOS MOBS (spider, wolf, rabbit) Y DROPS
// ============================================================
console.log("\n=== NUEVOS MOBS Y DROPS ===");

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
		spider && spider[0] && spider[0].id === I.STRING,
		JSON.stringify(spider)
	);
	check(
		"rabbit dropea conejo crudo (118)",
		rabbit && rabbit[0] && rabbit[0].id === I.RABBIT,
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
		JSON.stringify(r && r.result)
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

console.log(
	fails === 0 ? "\n✅ Todos los tests pasan" : `\n❌ ${fails} tests fallaron`
);
process.exit(fails === 0 ? 0 : 1);
