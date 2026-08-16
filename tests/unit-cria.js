"use strict";
// Test unitario del sistema de cría de animales (Fase 3).
const mobs = require("../server/mobs.js");
const state = require("../server/state.js");
const { BREED_FOOD, I } = require("../server/constants.js");

let ok = 0,
	fail = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (n, c, x) => {
	c
		? ok++
		: (fail++,
			failedChecks.push(n),
			console.log("FAIL: " + n + " " + (x || "")));
};

// Patch seguro para el tick: suelo siempre sólido, así no dependemos del mundo real
require("../server/world.js").getBlock = () => 3;

// --- Mapa de comida de cría (estilo Minecraft) ---
check(
	"BREED_FOOD cow=trigo(115)",
	BREED_FOOD.cow === I.WHEAT && I.WHEAT === 115
);
check("BREED_FOOD sheep=trigo", BREED_FOOD.sheep === I.WHEAT);
check(
	"BREED_FOOD pig=zanahoria(116)",
	BREED_FOOD.pig === I.CARROT && I.CARROT === 116
);
check(
	"BREED_FOOD chicken=semillas(117)",
	BREED_FOOD.chicken === I.SEEDS && I.SEEDS === 117
);

// --- canFeed: veredictos ---
const cow = new mobs.Mob("cow", 10, 10, 10);
check("canFeed adulto con trigo = ok", mobs.canFeed(cow, I.WHEAT) === "ok");
check(
	"canFeed adulto con zanahoria = wrongfood",
	mobs.canFeed(cow, I.CARROT) === "wrongfood"
);
cow.cooldownUntil = Date.now() + 60000;
check(
	"canFeed en cooldown = cooldown",
	mobs.canFeed(cow, I.WHEAT) === "cooldown"
);
cow.cooldownUntil = 0;
const bebe = new mobs.Mob("cow", 10, 10, 10);
bebe.isBaby = true;
check("canFeed bebé = baby", mobs.canFeed(bebe, I.WHEAT) === "baby");

// --- applyFeed: sin pareja → modo amor; con pareja → bebé ---
const a = new mobs.Mob("cow", 0, 10, 0);
check(
	"sin pareja → null (queda en modo amor)",
	mobs.applyFeed(a, [a]) === null
);
check("modo amor activado (loveUntil futuro)", a.loveUntil > Date.now());

const b = new mobs.Mob("cow", 4, 10, 0);
b.loveUntil = Date.now() + 10000;
const nAntes = state.mobs.length;
const bebe2 = mobs.applyFeed(b, [a, b]);
check(
	"con pareja → bebé creado (isBaby)",
	bebe2 !== null && bebe2.isBaby === true
);
check(
	"bebé nace entre los padres",
	Math.abs(bebe2.x - 2) < 0.1 && Math.abs(bebe2.z) < 0.1
);
check(
	"padres entran en cooldown",
	a.cooldownUntil > Date.now() && b.cooldownUntil > Date.now()
);
check("padres salen de modo amor", a.loveUntil === 0 && b.loveUntil === 0);
check(
	"bebé añadido a state.mobs",
	state.mobs.includes(bebe2) && state.mobs.length === nAntes + 1
);

// Auditoría 2026-08-15 (M2): con la cuota GLOBAL llena (≥30 vivos), aplicar
// comida no crea más bebés (antes solo el spawn natural la respetaba y la
// cría multiplicaba los mobs sin tope).
{
	state.mobs.length = 30; // simular cuota llena
	const c1 = new mobs.Mob("cow", 0, 10, 0);
	const c2 = new mobs.Mob("cow", 4, 10, 0);
	c2.loveUntil = Date.now() + 10000;
	const ningunBebe = mobs.applyFeed(c1, [c1, c2]);
	check(
		"M2: cuota llena (30) → applyFeed no cría (null)",
		ningunBebe === null && c1.loveUntil === 0
	);
	state.mobs.length = 29; // justo por debajo → sí puede criar
	c1.loveUntil = Date.now() + 10000;
	c2.loveUntil = Date.now() + 10000;
	const bebeConHueco = mobs.applyFeed(c1, [c1, c2]);
	check(
		"M2: cuota con hueco (29) → applyFeed cría",
		bebeConHueco !== null && bebeConHueco.isBaby === true
	);
	state.mobs.length = nAntes; // restaurar el contador del test
}

// --- mobDrops: los bebés no sueltan comida ---
check("mobDrops bebé = null", mobs.mobDrops(bebe2) === null);
const adulto = new mobs.Mob("cow", 0, 10, 0);
check(
	"mobDrops adulto = carne de vaca",
	mobs.mobDrops(adulto) !== null && mobs.mobDrops(adulto)[0].id === I.BEEF
);

// --- Crecimiento: bebé adulto tras ~60s (1200 ticks de 50ms) ---
const bebe3 = new mobs.Mob("pig", 0, 10, 0);
bebe3.isBaby = true;
let ticks = 0;
for (let i = 0; i < 1300; i++) {
	bebe3.tick(false);
	ticks = i + 1;
	if (!bebe3.isBaby) break;
}
check(
	"bebé crece a adulto tras ~1200 ticks",
	!bebe3.isBaby && ticks >= 1190 && ticks <= 1200,
	"ticks=" + ticks
);

console.log(ok + " OK, " + fail + " FAIL");
process.exit(fail ? 1 : 0);
