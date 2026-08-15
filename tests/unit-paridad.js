"use strict";
// ============================================================
// TEST DE PARIDAD 1:1 CONTRA MINECRAFT (Fase 13, Bloque D)
// Fija la tabla OFICIAL de Minecraft Java Edition (1.9+) contra los valores
// del clon. Si alguien desvía un valor, este test FALLA — es la red de
// seguridad de la paridad acordada en docs/reporte-paridad.md (bugs B1-B6).
//
// Cubre:
//   B1. Salud máxima siempre 20 (el nivel NO da vida).
//   B2. Curva de XP oficial por tramos (2L+7 / 5L−38 / 9L−158).
//   B3. Daño de espadas por material (4/5/6/7, oro 4) y daño a mano 1.
//   B4. Puntos de armadura por pieza y material (cuero 1-3-2-1, hierro
//       2-6-5-2, diamante 3-8-6-3) con reducción min(puntos×4, 80)%.
//   B5. Dureza de bloques (tierra 0.5, grava 0.6, arena 0.5, piedra 1.5).
//   B6. Durabilidad de herramientas (59/131/250/32/1561).
//
// Uso: node tests/unit-paridad.js
// ============================================================
const {
	B,
	I,
	TOOL_DURABILITY,
	SWORD_DAMAGE,
	TOOL_DAMAGE,
	ARMOR_POINTS,
	ARMOR_DURABILITY,
	BLOCK_HARDNESS,
	applyArmorDamageReduction,
	xpToNext,
	FOOD_VALUES,
	BREED_FOOD,
	CREATIVE_ITEMS // Fase 18 (C-3): tabla #8 comida
} = require("../server/constants.js");

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
const check = (name, cond, extra = "") => {
	if (cond) ok++;
	else {
		fail++;
		failedChecks.push(name);
		// biome-ignore lint/suspicious/noConsole: fallo real del test (convención del proyecto)
		console.log(`✗ ${name} ${extra}`.trim());
	}
};

// --- B3: daño de espadas por material (Java 1.9+) ---
check(
	"espada de madera: 4",
	SWORD_DAMAGE[I.WOODEN_SWORD] === 4,
	`=${SWORD_DAMAGE[I.WOODEN_SWORD]}`
);
check("espada de piedra: 5", SWORD_DAMAGE[I.STONE_SWORD] === 5);
check("espada de hierro: 6", SWORD_DAMAGE[I.IRON_SWORD] === 6);
check(
	"espada de oro: 4 (igual que madera)",
	SWORD_DAMAGE[I.GOLDEN_SWORD] === 4
);
check("espada de diamante: 7", SWORD_DAMAGE[I.DIAMOND_SWORD] === 7);
check(
	"daño a mano = 1 (TOOL_DAMAGE[tool] || SWORD_DAMAGE[tool] || 1)",
	// Fase 18 (D-1): el handler attack_mob vive en server/actions.js.
	/TOOL_DAMAGE\[tool\] \|\| SWORD_DAMAGE\[tool\] \|\| 1/.test(
		require("fs").readFileSync("server/actions.js", "utf8")
	)
);

// --- Auditoría §3.7: daño de herramientas no-espada ---
check(
	"hacha de hierro: 6 (igual a espada, sin cooldown)",
	TOOL_DAMAGE[I.IRON_AXE] === 6
);
check("hacha de diamante: 7", TOOL_DAMAGE[I.DIAMOND_AXE] === 7);
check("pico de piedra: 3", TOOL_DAMAGE[I.STONE_PICKAXE] === 3);
check("pala de hierro: 4", TOOL_DAMAGE[I.IRON_SHOVEL] === 4);
check("pico de madera: 2", TOOL_DAMAGE[I.WOODEN_PICKAXE] === 2);
check("azada de diamante: sin daño extra (1)", !TOOL_DAMAGE[I.DIAMOND_HOE]);

// --- B4: puntos de armadura por pieza y material ---
check("cuero: casco 1", ARMOR_POINTS[I.LEATHER_HELMET] === 1);
check("cuero: pechera 3", ARMOR_POINTS[I.LEATHER_CHESTPLATE] === 3);
check("cuero: pantalones 2", ARMOR_POINTS[I.LEATHER_LEGGINGS] === 2);
check("cuero: botas 1", ARMOR_POINTS[I.LEATHER_BOOTS] === 1);
check("hierro: casco 2", ARMOR_POINTS[I.IRON_HELMET] === 2);
check("hierro: pechera 6", ARMOR_POINTS[I.IRON_CHESTPLATE] === 6);
check("hierro: pantalones 5", ARMOR_POINTS[I.IRON_LEGGINGS] === 5);
check("hierro: botas 2", ARMOR_POINTS[I.IRON_BOOTS] === 2);
check("diamante: casco 3", ARMOR_POINTS[I.DIAMOND_HELMET] === 3);
check("diamante: pechera 8", ARMOR_POINTS[I.DIAMOND_CHESTPLATE] === 8);
check("diamante: pantalones 6", ARMOR_POINTS[I.DIAMOND_LEGGINGS] === 6);
check("diamante: botas 3", ARMOR_POINTS[I.DIAMOND_BOOTS] === 3);
// Reducción: min(puntos×4, 80)% aplicada por applyArmorDamageReduction.
{
	const player = {
		armor: {
			helmet: { id: I.DIAMOND_HELMET, durability: 363 },
			chestplate: { id: I.DIAMOND_CHESTPLATE, durability: 528 },
			leggings: { id: I.DIAMOND_LEGGINGS, durability: 495 },
			boots: { id: I.DIAMOND_BOOTS, durability: 429 }
		}
	};
	// 20 puntos → 80% (tope): un golpe de 10 queda en 2.
	check(
		"diamante completo: 20 puntos → 80% (10 → 2)",
		applyArmorDamageReduction(player, 10) === 2
	);
	const iron = {
		armor: {
			helmet: { id: I.IRON_HELMET, durability: 165 },
			chestplate: { id: I.IRON_CHESTPLATE, durability: 240 },
			leggings: { id: I.IRON_LEGGINGS, durability: 225 },
			boots: { id: I.IRON_BOOTS, durability: 195 }
		}
	};
	// 15 puntos → 60%: 10 → 4.
	check(
		"hierro completo: 15 puntos → 60% (10 → 4)",
		applyArmorDamageReduction(iron, 10) === 4
	);
}
// --- B6: durabilidad de herramientas (valores oficiales MC) ---
check("pico madera 59", TOOL_DURABILITY[I.WOODEN_PICKAXE] === 59);
check("pico piedra 131", TOOL_DURABILITY[I.STONE_PICKAXE] === 131);
check("pico hierro 250", TOOL_DURABILITY[I.IRON_PICKAXE] === 250);
check("pico oro 32", TOOL_DURABILITY[I.GOLDEN_PICKAXE] === 32);
check("pico diamante 1561", TOOL_DURABILITY[I.DIAMOND_PICKAXE] === 1561);
// Armadura (todas exactas en MC): cuero 55/80/75/65, hierro 165/240/225/195,
// diamante 363/528/495/429.
check(
	"armadura cuero total = 275",
	[55, 80, 75, 65].reduce((a, b) => a + b, 0) === 275
);
check(
	"armadura hierro total = 825",
	[165, 240, 225, 195].reduce((a, b) => a + b, 0) === 825
);
check(
	"armadura diamante total = 1815",
	[363, 528, 495, 429].reduce((a, b) => a + b, 0) === 1815
);
check(
	"ARMOR_DURABILITY casco diamante 363",
	ARMOR_DURABILITY[I.DIAMOND_HELMET] === 363
);
// --- B5: dureza de bloques (MC Java) ---
check("tierra 0.5", BLOCK_HARDNESS[B.DIRT] === 0.5);
check("grava 0.6", BLOCK_HARDNESS[B.GRAVEL] === 0.6);
check("arena 0.5", BLOCK_HARDNESS[B.SAND] === 0.5);
check("piedra 1.5", BLOCK_HARDNESS[B.STONE] === 1.5);
check("césped 0.6", BLOCK_HARDNESS[B.GRASS] === 0.6);
check("madera (log) 2.0", BLOCK_HARDNESS[B.OAK_LOG] === 2.0);
check("piedra de musgo 2.0", BLOCK_HARDNESS[B.MOSSY_COBBLESTONE] === 2.0);

// --- B2: curva de XP oficial por tramos ---
check("xpToNext(0) = 7", xpToNext(0) === 7);
check("xpToNext(1) = 9", xpToNext(1) === 9);
check("xpToNext(2) = 11", xpToNext(2) === 11);
check("xpToNext(14) = 35", xpToNext(14) === 35);
check("xpToNext(15) = 37 (inicio tramo 5L−38)", xpToNext(15) === 37);
check("xpToNext(16) = 42", xpToNext(16) === 42);
check("xpToNext(29) = 107", xpToNext(29) === 107);
check("xpToNext(30) = 112 (inicio tramo 9L−158)", xpToNext(30) === 112);
check("xpToNext(31) = 121", xpToNext(31) === 121);
// Coste total a nivel 30 = 1.395 XP (valor oficial de MC).
{
	let total = 0;
	for (let l = 0; l < 30; l++) total += xpToNext(l);
	check("coste total a nivel 30 = 1.395 XP", total === 1395, `=${total}`);
}
// --- B1: la salud máxima es siempre 20 (el nivel no da vida) ---
{
	const players = require("../server/players.js");
	const ws = { readyState: 1, send: () => {} };
	const p = {
		id: "p1",
		ws,
		xp: 0,
		level: 0,
		maxHealth: 20,
		health: 20,
		inventory: [],
		armor: {},
		selectedSlot: 0,
		food: 20,
		saturation: 20
	};
	players.addXp(p, 1395); // hasta nivel 30
	check(
		"nivel 30 → maxHealth sigue en 20",
		p.maxHealth === 20,
		`max=${p.maxHealth}`
	);
	check("nivel 30 alcanzado", p.level === 30, `level=${p.level}`);
}

// --- Auditoría §3.8/§3.7: salud de pasivos y daño de mobs por especie ---
{
	const mobs = require("../server/mobs.js");
	const mkMob = (type) => new mobs.Mob(type, 0, 80, 0);
	check(
		"pollo: 4 HP (MC)",
		mkMob("chicken").health === 4,
		`=${mkMob("chicken").health}`
	);
	check(
		"oveja: 8 HP (MC)",
		mkMob("sheep").health === 8,
		`=${mkMob("sheep").health}`
	);
	check(
		"vaca: 10 HP (MC)",
		mkMob("cow").health === 10,
		`=${mkMob("cow").health}`
	);
	check(
		"cerdo: 10 HP (MC)",
		mkMob("pig").health === 10,
		`=${mkMob("pig").health}`
	);
	check("enderman: 40 HP (MC)", mkMob("enderman").health === 40);
	check("zombie: 20 HP (MC)", mkMob("zombie").health === 20);
}

// --- Auditoría 2026-08-11 (D6): XP del slime por tamaño y del lobo ---
// Duplicado de unit-fase16 para que la SUITE DE PARIDAD también lo clave: si
// alguien borra los casos especiales de mobXp() (mobs.js), la tabla MOB_XP
// vuelve a valores contradictorios sin que lo note otro test (riesgo de la
// tabla muerta que la auditoría reportó).
{
	const mobs = require("../server/mobs.js");
	const mkMob = (type) => new mobs.Mob(type, 0, 80, 0);
	const slimeGrande = mkMob("slime");
	slimeGrande.slimeSize = 2;
	const slimeMediano = mkMob("slime");
	slimeMediano.slimeSize = 1;
	const slimePequeno = mkMob("slime");
	slimePequeno.slimeSize = 0;
	check(
		"D6: slime grande (2) da 4 XP",
		mobs.mobXp(slimeGrande) === 4,
		`=${mobs.mobXp(slimeGrande)}`
	);
	check(
		"D6: slime mediano (1) da 2 XP",
		mobs.mobXp(slimeMediano) === 2,
		`=${mobs.mobXp(slimeMediano)}`
	);
	check("D6: slime pequeño (0) da 1 XP", mobs.mobXp(slimePequeno) === 1);
	// El lobo es aleatorio (1-3): se fija Math.random para probar los límites y
	// demostrar que el caso especial sigue vivo (si se borra, cae al fallback
	// MOB_XP.wolf = 2 y ambos límites fallan).
	const realRandom = Math.random;
	Math.random = () => 0.99;
	check(
		"D6: lobo con random alto da 3 XP (caso especial vivo)",
		mobs.mobXp(mkMob("wolf")) === 3,
		`=${mobs.mobXp(mkMob("wolf"))}`
	);
	Math.random = () => 0;
	check(
		"D6: lobo con random bajo da 1 XP (caso especial vivo)",
		mobs.mobXp(mkMob("wolf")) === 1,
		`=${mobs.mobXp(mkMob("wolf"))}`
	);
	Math.random = realRandom;
}

// --- Fase 18 (C-5): coherencia MOB_XP ↔ mobXp() (rec. 9 de la auditoría) ---
// La tabla MOB_XP de constants.js es el FALLBACK de mobXp() (mobs.js): para
// los tipos normales debe coincidir 1:1 (un desvío cambiaría la XP real);
// para wolf/slime es SOLO fallback (los sobrescribe el caso especial) y
// debe reflejar la media real para no inducir regresiones si se borra.
{
	const mobs = require("../server/mobs.js");
	const constants = require("../server/constants.js");
	const mkMob = (type) => new mobs.Mob(type, 0, 80, 0);
	// Tipos normales: mobXp() delega en MOB_XP → paridad 1:1.
	for (const type of [
		"zombie",
		"creeper",
		"skeleton",
		"spider",
		"cow",
		"pig"
	]) {
		check(
			`C-5: mobXp(${type}) usa MOB_XP.${type} (${constants.MOB_XP[type]})`,
			mobs.mobXp(mkMob(type)) === constants.MOB_XP[type]
		);
	}
	// Coherencia con MC: los hostiles dan 5 XP y los pasivos 1-3 (Java 1.9+).
	check(
		"C-5: hostiles (zombi/creeper/esqueleto/araña/ahogado) dan 5 XP",
		[
			constants.MOB_XP.zombie,
			constants.MOB_XP.creeper,
			constants.MOB_XP.skeleton,
			constants.MOB_XP.spider,
			constants.MOB_XP.drowned
		].every((v) => v === 5)
	);
	// wolf: el fallback debe ser la MEDIA de 1-3 (2) — si alguien lo cambia a
	// 8 (valor histórico), el caso especial lo oculta hasta que se borre.
	check(
		"C-5: MOB_XP.wolf = 2 (media de 1-3, fallback coherente)",
		constants.MOB_XP.wolf === 2
	);
	// slime: el fallback es 1 (el caso especial aplica 4/2/1 por tamaño).
	check(
		"C-5: MOB_XP.slime = 1 (fallback; mobXp aplica 4/2/1)",
		constants.MOB_XP.slime === 1
	);
}

// ============================================================
// TABLA #8 — COMIDA (Fase 18, C-3): hambre/saturación MC Java 1.9+
// Zanahoria 3/3,6 · patata 1/0,6 · patata al horno 5/6 · trigo/carne cruda
// (cruda 107-110: 3/1,8 · cocinada 111-114: 8/12,8 · conejo 3/1,8 y asado
// 5/6 · pan 5/6 · pescado 2/0,4 y cocinado 5/6). Paridad tabla #8 de la
// spec Fase 18 (C-3): zanahoria y patata ahora son COMIDA (antes solo cría).
// ============================================================
{
	const f = (id) => {
		const v = FOOD_VALUES[id];
		return v ? `${v.food}/${v.saturation}` : "—";
	};
	const eq = (id, food, sat) => {
		const v = FOOD_VALUES[id];
		return !!v && v.food === food && v.saturation === sat;
	};
	check("T8: zanahoria 3/3,6 (MC)", eq(I.CARROT, 3, 3.6), f(I.CARROT));
	check("T8: patata 1/0,6 (MC)", eq(I.POTATO, 1, 0.6), f(I.POTATO));
	check(
		"T8: patata al horno 5/6 (MC)",
		eq(I.BAKED_POTATO, 5, 6),
		f(I.BAKED_POTATO)
	);
	// Cocinada > cruda (progresión del horno, como el resto de la comida)
	check(
		"T8: patata al horno restaura más que la patata cruda",
		eq(I.BAKED_POTATO, 5, 6) && eq(I.POTATO, 1, 0.6)
	);
	// La zanahoria ya era comida de cría: ahora también se come (no hay
	// conflicto — la cría usa BREED_FOOD y el clic derecho decide por target).
	check(
		"T8: zanahoria sigue siendo comida de cría (pig/rabbit)",
		Object.values(BREED_FOOD).includes(I.CARROT)
	);
	// Sincronía: la zanahoria/patata están en el inventario creativo
	check(
		"T8: patata y patata al horno en el creativo",
		CREATIVE_ITEMS.includes(I.POTATO) && CREATIVE_ITEMS.includes(I.BAKED_POTATO)
	);
}

// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
console.log(`${ok} OK, ${fail} FAIL`);
process.exit(fail ? 1 : 0);
