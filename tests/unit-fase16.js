"use strict";
// ============================================================
// TESTS DE LA FASE 16 (corrección auditoría + bugs + paridad)
//   B1: niebla submarina solo con inmersión real (≥2 bloques de ojos)
//   B2: cofres eliminables con Shift — el contenido pasa al inventario
//   D1: horno consume combustible real (FUEL_TICKS) y se apaga sin él
//   D2: drops zombi (carne podrida) y creeper (pólvora) + ítems nuevos
//   D3: puertas craftean ×3
//   D4: vidrio fundido a 200 ticks
//   D5: carbón vegetal (tronco → 257, C-4)
//   D6: XP del slime mediano (2) y del lobo (1-3)
// ============================================================
const path = require("node:path");
const crafting = require("../server/crafting.js");
const mobs = require("../server/mobs.js");
const state = require("../server/state.js");
const players = require("../server/players.js");
const { B, I, FUEL_TICKS } = require("../server/constants.js");

let ok = 0;
let fail = 0;
const failedChecks = [];
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (name, cond, extra = "") => {
	if (cond) ok++;
	else {
		fail++;
		failedChecks.push(name);
		// biome-ignore lint/suspicious/noConsole: fallo real del test (convención del proyecto)
		console.log(`✗ ${name} ${extra}`.trim());
	}
};

const realRandom = Math.random;
const withRandom = (fn, v) => {
	Math.random = () => v;
	try {
		fn();
	} finally {
		Math.random = realRandom;
	}
};

// Jugador mock (patrón del repo): ws cerrado (envíos no-op).
const mkPlayer = (over = {}) => ({
	id: "p-f16",
	ws: { readyState: 3, send() {} },
	health: 20,
	maxHealth: 20,
	gamemode: "survival",
	inventory: new Array(36).fill(null),
	selectedSlot: 0,
	...over
});

(async () => {
	// ============================================================
	// B1) NIEBLA SUBMARINA (waterfog.js, lógica pura)
	// ============================================================
	const wf = await import(
		`file://${path.join(__dirname, "..", "public", "waterfog.js")}`
	);
	// Columna de agua de y∈{-6..-3}: la celda superior es -3 y el primer aire
	// está en -2. Los ojos dentro de la celda superior (nadando en la
	// superficie, y=-3.5) quedan a <2 de la superficie: sin niebla.
	const water = (y) => y >= -6 && y <= -3;
	check(
		"B1: ojos en la celda de superficie (y=-3.5) → sin niebla",
		wf.shouldUnderwaterFog(-3.5, true, water) === false,
		`depth=${wf.waterSurfaceDepth(-3.5, water)}`
	);
	// Ojos a 1 bloque completo bajo la celda de superficie (y=-4.5):
	// profundidad 2.5 → niebla activa (inmersión real).
	check(
		"B1: ojos a 2 bloques de la superficie (y=-4.5) → niebla activa",
		wf.shouldUnderwaterFog(-4.5, true, water) === true,
		`depth=${wf.waterSurfaceDepth(-4.5, water)}`
	);
	check(
		"B1: fuera del agua (aire) nunca hay niebla",
		wf.shouldUnderwaterFog(0, false, water) === false
	);
	// Agua poco profunda (3 celdas): ojos en la celda intermedia (y=4, a 2 de
	// la superficie) → niebla; en la celda superior (y=5) → sin niebla.
	const shallow = (y) => y >= 3 && y <= 5;
	check(
		"B1: agua poco profunda — celda intermedia → niebla",
		wf.shouldUnderwaterFog(4, true, shallow) === true,
		`depth=${wf.waterSurfaceDepth(4, shallow)}`
	);
	check(
		"B1: agua poco profunda — celda superior → sin niebla",
		wf.shouldUnderwaterFog(5, true, shallow) === false
	);

	// ============================================================
	// B2) COFRE ELIMINABLE CON SHIFT: el contenido pasa al inventario
	// ============================================================
	{
		const x = 200,
			y = 10,
			z = 200;
		// Montar un cofre con contenido y estado real.
		const { getOrCreateChest } = require("../server/chests.js");
		const c = getOrCreateChest(`${x},${y},${z}`);
		c[0] = { id: I.IRON_INGOT, count: 5 };
		c[1] = { id: I.WOODEN_PICKAXE, count: 1, durability: 30 };
		const p = mkPlayer();
		// Sin agachar no se rompe (el cliente lo gestiona, pero el servidor
		// también debe poder romperlo: finishMining con bloque CHEST).
		players.finishMining(p, x, y, z, B.CHEST, {});
		check(
			"B2: el cofre se elimina del estado al romperlo",
			state.chests.has(`${x},${y},${z}`) === false
		);
		check(
			"B2: el contenido apilable pasa al inventario (lingotes)",
			players.countInInventory(p, I.IRON_INGOT) === 5,
			`${players.countInInventory(p, I.IRON_INGOT)}`
		);
		check(
			"B2: las herramientas pasan con su durabilidad (pico)",
			players.countInInventory(p, I.WOODEN_PICKAXE) === 1 &&
				p.inventory.some(
					(s) => s && s.id === I.WOODEN_PICKAXE && s.durability === 30
				)
		);
		// En creative NO se recoge el contenido (como el resto de drops).
		const c2 = getOrCreateChest(`${x + 2},${y},${z}`);
		c2[0] = { id: I.DIAMOND, count: 64 };
		const pc = mkPlayer({ gamemode: "creative" });
		players.finishMining(pc, x + 2, y, z, B.CHEST, { creative: true });
		check(
			"B2: creative rompe el cofre sin recoger el contenido",
			state.chests.has(`${x + 2},${y},${z}`) === false &&
				players.countInInventory(pc, I.DIAMOND) === 0
		);
	}

	// ============================================================
	// D1) HORNO: consume combustible real + FUEL_TICKS por ítem
	// ============================================================
	crafting.loadRecipes();
	check(
		"D1: FUEL_TICKS — carbón 1600, palo 100, tablones/tronco 300",
		FUEL_TICKS[I.COAL] === 1600 &&
			FUEL_TICKS[I.STICK] === 100 &&
			FUEL_TICKS[B.PLANKS] === 300 &&
			FUEL_TICKS[B.OAK_LOG] === 300
	);
	{
		state.furnaces.clear();
		const f = crafting.getOrCreateFurnace("1,10,1");
		f.fuelItem = I.COAL;
		f.fuelCount = 1;
		f.fuelTicksLeft = 0;
		f.inputItem = { id: I.BEEF, count: 8 }; // 8 carnes (200 t cada una)
		for (let t = 0; t < 200 * 8 + 10; t++) crafting.tickFurnaces();
		check(
			"D1: un carbón (1600 t) funde 8 ítems de 200",
			f.outputItem === I.COOKED_BEEF && f.outputCount === 8,
			`${f.outputItem} x${f.outputCount}`
		);
		check(
			"D1: el combustible se consume (fuelItem null al agotarse)",
			f.fuelItem === null,
			`fuelItem=${f.fuelItem} ticks=${f.fuelTicksLeft}`
		);
		// Sin combustible el horno se apaga (no cocina).
		const f2 = crafting.getOrCreateFurnace("1,10,2");
		f2.fuelItem = null;
		f2.fuelCount = 0;
		f2.fuelTicksLeft = 0;
		f2.inputItem = { id: I.BEEF, count: 2 };
		for (let t = 0; t < 50; t++) crafting.tickFurnaces();
		check(
			"D1: sin combustible el horno se apaga",
			f2.outputCount === 0 && f2.inputItem && f2.inputItem.count === 2
		);
		// 3 palos (300 t) contra 2 ítems (400 t): funden 1 ítem y se agotan
		// (el segundo ítem no se funde sin combustible — como MC).
		const f3 = crafting.getOrCreateFurnace("1,10,3");
		f3.fuelItem = I.STICK; // 100 ticks por palo
		f3.fuelCount = 3;
		f3.fuelTicksLeft = 0;
		f3.inputItem = { id: I.BEEF, count: 2 };
		for (let t = 0; t < 400 + 10; t++) crafting.tickFurnaces();
		check(
			"D1: 3 palos (300 t) funden 1 ítem y se consumen todos",
			f3.outputCount === 1 && f3.fuelItem === null && f3.fuelCount === 0,
			`out=${f3.outputCount} fuel=${f3.fuelItem} count=${f3.fuelCount}`
		);
		check(
			"D1: el segundo ítem NO se funde sin combustible",
			f3.inputItem && f3.inputItem.count === 1,
			JSON.stringify(f3.inputItem)
		);
	}

	// ============================================================
	// D2) DROPS DE ZOMBI/CREEPER (paridad MC)
	// ============================================================
	check(
		"D2: ítems nuevos sincronizados (255/256)",
		I.ROTTEN_FLESH === 255 && I.GUNPOWDER === 256
	);
	withRandom(() => {
		const z = new mobs.Mob("zombie", 0, 10, 0);
		const drops = mobs.mobDrops(z) || [];
		check(
			"D2: el zombi suelta carne podrida (0-2)",
			drops.some((d) => d.id === I.ROTTEN_FLESH && d.count === 2),
			JSON.stringify(drops)
		);
		const cr = new mobs.Mob("creeper", 0, 10, 0);
		const cDrops = mobs.mobDrops(cr) || [];
		check(
			"D2: el creeper suelta pólvora (0-2)",
			cDrops.some((d) => d.id === I.GUNPOWDER && d.count === 2),
			JSON.stringify(cDrops)
		);
	}, 0.99); // max del rango (0-2) → 2

	// ============================================================
	// D3) PUERTAS ×3 + D4) VIDRIO 200 t + D5) CARBÓN VEGETAL
	// ============================================================
	{
		// D3: 6 tablones → 3 puertas de madera (id 48).
		const grid = new Array(9).fill(null);
		for (const i of [0, 1, 3, 4, 6, 7]) grid[i] = { id: B.PLANKS, count: 1 };
		const door = crafting.matchRecipe(grid);
		check(
			"D3: las puertas craftean ×3",
			door && door.result.id === B.OAK_DOOR && door.result.count === 3,
			door ? `${door.result.count}` : "sin receta"
		);
		// D4: arena → vidrio a 200 ticks.
		const furnace = crafting.getRecipeTables().furnace;
		check(
			"D4: vidrio fundido a 200 ticks",
			furnace["6"] && furnace["6"].time === 200,
			`${furnace["6"]?.time}`
		);
		// D5/C-4 (Fase 18): carbón vegetal — tronco → CHARCOAL (257) a 200
		// ticks, ítem DISTINTO del carbón (101, solo de la mena).
		check(
			"D5: carbón vegetal (tronco → 257, no 101)",
			furnace["4"] &&
				furnace["4"].result.id === I.CHARCOAL &&
				furnace["4"].time === 200,
			JSON.stringify(furnace["4"])
		);
	}

	// ============================================================
	// D6) XP DEL SLIME MEDIANO (2) Y DEL LOBO (1-3)
	// ============================================================
	withRandom(() => {
		const sm = new mobs.Mob("slime", 0, 10, 0);
		sm.slimeSize = 1; // mediano
		check(
			"D6: slime mediano da 2 XP",
			mobs.mobXp(sm) === 2,
			`${mobs.mobXp(sm)}`
		);
		const w = new mobs.Mob("wolf", 0, 10, 0);
		const xp = mobs.mobXp(w);
		check("D6: el lobo da 1-3 XP aleatorio", xp >= 1 && xp <= 3, `${xp}`);
	}, 0.99); // 1 + floor(0.99*3) = 3 (tope del rango)

	state.furnaces.clear();
	console.log(`${ok} OK, ${fail} FAIL`);
	process.exit(fail ? 1 : 0);
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real del test (no silenciar)
	console.error("unit-fase16:", e.message);
	process.exit(1);
});
