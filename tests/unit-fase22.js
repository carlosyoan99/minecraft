"use strict";
// ============================================================
// TESTS DE LA FASE 22 — Profundidad, minerales y fauna 1.17–1.21
// Cubre lo IMPLEMENTADO hasta ahora (los bloques pendientes añadirán
// sus secciones aquí):
//   A1  veredicto de altura: el mundo sigue en 128 bloques (spec §A1)
//   A3  deepslate bajo Y=0 (y solo bajo Y=0)
//   A4  raw ores: ORE_DROP hierro/oro/cobre → crudo + horno raw→lingote
//   A5  cobre: IDs sincronizados, blast furnace ×2 data-driven, bloque
//   C1  sculk/Deep Dark: IDs+teselas+iconos, bandas deterministas bajo
//       Y=−40 en generación, propagación pura (radio 2, convertibles) y
//       gancho onMobDeath sobre sculk real (stub de world)
//   D1  rana: clase/fábrica, cría con SLIME_BALL, XP, spawn pantano,
//       come slimes pequeños (hunt/eat/prioridad huida) y salto por-mob
//   G1  rate limit POR CONEXIÓN: aislamiento entre usuarios y ráfagas
// Pendiente (bloques aún no implementados): A6 altura configurable.
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const { Reporter, withRandom } = require("./helpers.js");
const r = new Reporter();

const ROOT = path.join(__dirname, "..");
const world = require("../server/world.js");
const state = require("../server/state.js");
const generation = require("../server/generation.js");
const constants = require("../server/constants.js");
const sculkMod = require("../server/sculk.js");
const mobs = require("../server/mobs.js");
const mobSpawn = require("../server/mob-spawn.js");
const { createRateLimit } = require("../server/ratelimit.js");

const {
	B,
	I,
	CHUNK_SIZE,
	WORLD_MIN_Y,
	WORLD_HEIGHT,
	SCHEMA_VERSION,
	MOB_XP,
	BREED_FOOD,
	ORE_DROP,
	BLAST_SMELT_RESULTS,
	isBlastSmelt
} = constants;

// Fuente del cliente ESM: parse textual como unit-sync (sin import).
const pubConst = fs.readFileSync(
	path.join(ROOT, "public", "constants.js"),
	"utf8"
);
const texMapSrc = fs.readFileSync(
	path.join(ROOT, "public", "texturemap.js"),
	"utf8"
);
const iconsSrc = fs.readFileSync(
	path.join(ROOT, "public", "itemicons.js"),
	"utf8"
);
const mobsClientSrc = fs.readFileSync(
	path.join(ROOT, "public", "mobs.js"),
	"utf8"
);
const mobTexSrc = fs.readFileSync(
	path.join(ROOT, "public", "mobtextures.js"),
	"utf8"
);

world.setDiskLoader(() => null);

// ------------------------------------------------------------
// A1 — veredicto de altura: NO sube a 256 (spec §A1: +100 % memoria/chunk
// sin beneficio alcanzable dentro del rango actual).
// ------------------------------------------------------------
r.check("A1 SCHEMA_VERSION intacto (6)", SCHEMA_VERSION === 6);
r.check("A1 el mundo sigue siendo de 128 bloques", WORLD_HEIGHT === 128);

// ------------------------------------------------------------
// Zona determinista compartida (semilla inyectada por tests/run.js):
// radio 3 = 49 chunks, suficiente para deepslate/cobre/sculk.
// ------------------------------------------------------------
const RADIUS = 3;
for (let cx = -RADIUS; cx <= RADIUS; cx++)
	for (let cz = -RADIUS; cz <= RADIUS; cz++) world.generateChunk(cx, cz);
function idxLocal(x, wy, z) {
	return ((wy - WORLD_MIN_Y) * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

{
	// A3: deepslate presente bajo Y=0 y ausente en Y≥0.
	let bajo = 0;
	let encima = 0;
	for (let cx = -RADIUS; cx <= RADIUS; cx++) {
		for (let cz = -RADIUS; cz <= RADIUS; cz++) {
			const data = state.chunks.get(`${cx},${cz}`);
			for (let x = 0; x < CHUNK_SIZE; x++) {
				for (let z = 0; z < CHUNK_SIZE; z++) {
					for (let wy = WORLD_MIN_Y; wy <= 8; wy++) {
						if (data[idxLocal(x, wy, z)] === B.DEEPSLATE)
							wy < 0 ? bajo++ : encima++;
					}
				}
			}
		}
	}
	r.check("A3 hay deepslate bajo Y=0", bajo > 0, `${bajo} bloques`);
	r.check("A3 no hay deepslate en Y≥0", encima === 0, `${encima} bloques`);
}

// ------------------------------------------------------------
// A4/A5 — raw ores y cobre
// ------------------------------------------------------------
r.check(
	"A4 ORE_DROP: hierro/oro/cobre sueltan el crudo",
	ORE_DROP[B.IRON_ORE] === I.RAW_IRON &&
		ORE_DROP[B.GOLD_ORE] === I.RAW_GOLD &&
		ORE_DROP[B.COPPER_ORE] === I.RAW_COPPER
);
{
	const horno = JSON.parse(
		fs.readFileSync(path.join(ROOT, "recetas_horno.json"), "utf8")
	);
	r.check(
		"A4 horno funde los tres crudos a lingote",
		horno[String(I.RAW_IRON)]?.result?.id === I.IRON_INGOT &&
			horno[String(I.RAW_GOLD)]?.result?.id === I.GOLD_INGOT &&
			horno[String(I.RAW_COPPER)]?.result?.id === I.COPPER_INGOT
	);
}
r.check(
	"A5 cobre: IDs bloque/lingote sincronizados",
	pubConst.includes("export const COPPER_ORE = 193;") &&
		B.COPPER_ORE === 193 &&
		I.COPPER_INGOT === 279
);
r.check(
	"A5/P7 blast furnace data-driven incluye cobre (×2)",
	isBlastSmelt(I.COPPER_INGOT) &&
		BLAST_SMELT_RESULTS.has(I.COPPER_INGOT) &&
		BLAST_SMELT_RESULTS.has(I.IRON_INGOT) &&
		BLAST_SMELT_RESULTS.has(I.GOLD_INGOT)
);
r.check(
	"A5 bloque de cobre definido (decorativo)",
	typeof B.COPPER_BLOCK === "number"
);

// ------------------------------------------------------------
// C1 — Deep Dark / sculk
// ------------------------------------------------------------
r.check("C1 IDs sculk en servidor", B.SCULK === 196 && B.SCULK_VEIN === 197);
r.check(
	"C1 IDs sculk en cliente (ESM parse)",
	pubConst.includes("export const SCULK = 196;") &&
		pubConst.includes("export const SCULK_VEIN = 197;")
);
r.check(
	"C1 nombres de bloque en cliente",
	pubConst.includes('196: "Sculk"') && pubConst.includes('197: "Vena de sculk"')
);
r.check(
	"C1 teselas del atlas mapeadas (y fix deepslate/cobre del WIP)",
	texMapSrc.includes("196: { all: 191 }") &&
		texMapSrc.includes("197: { all: 192 }") &&
		texMapSrc.includes("192: { all: 189 }") &&
		texMapSrc.includes("193: { all: 190 }")
);
r.check(
	"C1 iconos de inventario para sculk",
	iconsSrc.includes("for (const id of [196, 197])")
);

{
	// Bandas deterministas: puro, rango acotado y parches presentes.
	const a = generation.sculkBand(1234, -5678);
	r.check(
		"C1 sculkBand es determinista",
		generation.sculkBand(1234, -5678) === a
	);
	let valida = true;
	let hayNucleo = false;
	for (let x = -256; x <= 256; x += 8) {
		for (let z = -256; z <= 256; z += 8) {
			const b = generation.sculkBand(x, z);
			if (b !== 0 && b !== 1 && b !== 2) valida = false;
			if (b === 2) hayNucleo = true;
		}
	}
	r.check("C1 sculkBand devuelve solo {0,1,2}", valida);
	r.check(
		"C1 existen núcleos de sculk en el mapa base",
		hayNucleo,
		"sin parches en ±256"
	);
}

{
	// Generación: algún bloque de sculk bajo Y=−40 y ninguno encima.
	let sculkProfundo = 0;
	let sculkAlto = 0;
	for (let cx = -RADIUS; cx <= RADIUS; cx++) {
		for (let cz = -RADIUS; cz <= RADIUS; cz++) {
			const data = state.chunks.get(`${cx},${cz}`);
			for (let x = 0; x < CHUNK_SIZE; x++) {
				for (let z = 0; z < CHUNK_SIZE; z++) {
					for (let wy = WORLD_MIN_Y; wy < 0; wy++) {
						const bl = data[idxLocal(x, wy, z)];
						if (bl === B.SCULK || bl === B.SCULK_VEIN)
							wy <= generation.SCULK_MAX_Y ? sculkProfundo++ : sculkAlto++;
					}
				}
			}
		}
	}
	r.check(
		"C1 generación coloca sculk bajo Y=−40",
		sculkProfundo > 0,
		`${sculkProfundo} bloques`
	);
	r.check(
		"C1 ningún sculk por encima de la banda Deep Dark",
		sculkAlto === 0,
		`${sculkAlto} bloques`
	);
}

// === CONTINUACIÓN (propagación + D1 estático) ===

{
	// Propagación PURA: cubo Chebyshev radio 2 sin centro, solo convertibles.
	const mundoLleno = () => B.DIRT;
	const conv = sculkMod.conversionesSculk(mundoLleno, 0, 0, 0);
	r.check(
		"C1 conversiones: 5³−1 celdas convertibles en mundo de tierra",
		conv.length === 124,
		`len=${conv.length}`
	);
	r.check(
		"C1 el centro nunca se convierte",
		!conv.some((c) => c.x === 0 && c.y === 0 && c.z === 0)
	);
	r.check(
		"C1 conversiones: nada que convertir en aire",
		sculkMod.conversionesSculk(() => B.AIR, 0, 0, 0).length === 0
	);
	const mixto = (x, y, z) =>
		x === 1 && y === 0 && z === 0
			? B.STONE
			: x === -1 && y === 0 && z === 0
				? B.DIAMOND_ORE
				: x === 0 && y === 1 && z === 0
					? B.OAK_LOG
					: B.AIR;
	const convMixto = sculkMod.conversionesSculk(mixto, 0, 0, 0);
	r.check(
		"C1 solo tierra/piedra/deepslate son convertibles",
		convMixto.length === 1 &&
			convMixto[0].x === 1 &&
			convMixto[0].y === 0 &&
			convMixto[0].z === 0,
		JSON.stringify(convMixto)
	);
}

{
	// Gancho onMobDeath con stub de world (sombra own-property, patrón POO).
	const setCalls = [];
	world.getBlock = (x, y, z) => {
		if (x === 10 && y === 63 && z === 10) return B.SCULK;
		return Math.abs(x - 10) <= 2 &&
			Math.abs(y - 63) <= 2 &&
			Math.abs(z - 10) <= 2
			? B.STONE
			: B.AIR;
	};
	world.setBlock = (x, y, z, id) => {
		setCalls.push({ x, y, z, id });
		return true;
	};
	try {
		const mob = { x: 10.4, y: 64, z: 10.6 }; // pies sobre floor(64−0.1)=63
		const n = sculkMod.onMobDeath(mob);
		r.check(
			"C1 muerte sobre sculk propaga (conversiones correctas)",
			n === 124,
			`n=${n}`
		);
		r.check(
			"C1 las conversiones escriben SCULK vía world.setBlock",
			setCalls.length === 124 && setCalls.every((c) => c.id === B.SCULK)
		);
		r.check(
			"C1 la celda bajo los pies no se re-convierte",
			!setCalls.some((c) => c.x === 10 && c.y === 63 && c.z === 10)
		);
		setCalls.length = 0;
		world.getBlock = () => B.STONE;
		const n2 = sculkMod.onMobDeath({ x: 0, y: 64, z: 0 });
		r.check(
			"C1 muerte fuera de sculk no convierte nada",
			n2 === 0 && setCalls.length === 0
		);
	} finally {
		delete world.getBlock; // restaura el método del prototipo (POO F13)
		delete world.setBlock;
	}
}

// ------------------------------------------------------------
// D1 — rana (estático)
// ------------------------------------------------------------
r.check("D1 frog registrada en MOB_CLASSES", "frog" in mobs.MOB_CLASSES);
r.check(
	"D1 clase Frog exportada por la fábrica",
	typeof mobs.Frog === "function"
);
r.check(
	"D1 cría con bola de slime (BREED_FOOD.frog)",
	BREED_FOOD.frog === I.SLIME_BALL
);
r.check("D1 XP de rana = 1 (pasivo pequeño)", MOB_XP.frog === 1);
r.check(
	"D1 spawn del pantano (día)",
	Array.isArray(mobSpawn.BIOME_SPAWN.swamp.day) &&
		mobSpawn.BIOME_SPAWN.swamp.day.includes("frog") &&
		!mobSpawn.BIOME_SPAWN.swamp.day.includes("cow")
);
r.check("D1 escala en el cliente", mobsClientSrc.includes("frog: 0.65"));
r.check("D1 partes en mobtextures.js", mobTexSrc.includes("\tfrog: {"));
r.check(
	"D1 pintores de textura registrados",
	mobTexSrc.includes("drawFrogBody") &&
		mobTexSrc.includes("drawFrogHead") &&
		mobTexSrc.includes("drawFrogLeg")
);

// === BLOQUE B1 — Amatista ===

r.check("B1 AMETHYST_BLOCK id = 194", B.AMETHYST_BLOCK === 194);
r.check("B1 AMETHYST_CLUSTER id = 195", B.AMETHYST_CLUSTER === 195);
r.check("B1 AMETHYST_SHARD id = 280", I.AMETHYST_SHARD === 280);
r.check(
	"B1 AMETHYST_CLUSTER en NON_SOLID_PLANTS",
	constants.NON_SOLID_PLANTS.has(B.AMETHYST_CLUSTER)
);
r.check(
	"B1 AMETHYST_BLOCK hardness 1.5",
	constants.BLOCK_HARDNESS[B.AMETHYST_BLOCK] === 1.5
);
r.check(
	"B1 ORE_DROP: AMETHYST_CLUSTER → AMETHYST_SHARD",
	ORE_DROP[B.AMETHYST_CLUSTER] === I.AMETHYST_SHARD
);
r.check(
	"B1 IDs sync cliente (ESM parse)",
	pubConst.includes("export const AMETHYST_BLOCK = 194;") &&
		pubConst.includes("export const AMETHYST_CLUSTER = 195;") &&
		pubConst.includes("export const AMETHYST_SHARD = 280;")
);
r.check(
	"B1 teselas del atlas para amatista",
	texMapSrc.includes("194: { all: 193 }") &&
		texMapSrc.includes("195: { all: 194 }")
);

// === BLOQUE B2 — Catalejo ===

r.check("B2 SPYGLASS id = 281", I.SPYGLASS === 281);
{
	const recetas = JSON.parse(
		fs.readFileSync(path.join(ROOT, "recetas.json"), "utf8")
	);
	r.check("B2 receta de catalejo existe", recetas.spyglass !== undefined);
	r.check("B2 resultado = SPYGLASS", recetas.spyglass.result.id === I.SPYGLASS);
	r.check("B2 count = 1", recetas.spyglass.result.count === 1);
	r.check(
		"B2 usa lingote de cobre (279)",
		recetas.spyglass.ingredients.C === I.COPPER_INGOT
	);
	r.check(
		"B2 usa fragmento de amatista (280)",
		recetas.spyglass.ingredients.S === I.AMETHYST_SHARD
	);
}
r.check(
	"B2 IDs sync cliente (ESM parse)",
	pubConst.includes("export const SPYGLASS = 281;")
);
r.check(
	"B2 player.js importa SPYGLASS",
	fs
		.readFileSync(path.join(ROOT, "public", "player.js"), "utf8")
		.includes("SPYGLASS")
);
r.check("B2 icono de catalejo", iconsSrc.includes("ICONS[281]"));

// === CONTINUACIÓN 2 (D1 dinámica + G1) ===

function stubHeight(cb) {
	world.getHeight = () => 63;
	try {
		return cb();
	} finally {
		delete world.getHeight; // restaura el método del prototipo
	}
}
// Comer slimes pequeños: hunt → eat, y la presa desaparece.
stubHeight(() => {
	withRandom(2222, () => {
		const frog = mobs.createMob("frog", 0.5, 64, 0.5);
		const slime = mobs.createMob("slime", 5.5, 64, 1.5);
		slime.slimeSize = 0; // pequeño: la presa de las ranas
		state.mobs = [frog, slime];
		const estados = new Set();
		for (let t = 0; t < 400 && slime.alive; t++) {
			frog.tickSpecies(false);
			estados.add(frog.state);
		}
		r.check(
			"D1 la rana caza y se come al slime pequeño",
			!slime.alive && estados.has("hunt") && frog.state === "eat",
			`estados=${[...estados].join(",")} final=${frog.state}`
		);

		// Prioridad de la huida: con pánico activo no caza aunque haya presa.
		const rana2 = mobs.createMob("frog", 0.5, 64, 0.5);
		const presa2 = mobs.createMob("slime", 0.7, 64, 0.6);
		presa2.slimeSize = 0;
		rana2.fleeUntil = Date.now() + 60000;
		rana2.fleeFrom = { x: -5, z: 0 };
		state.mobs = [rana2, presa2];
		for (let t = 0; t < 20 && presa2.alive; t++) rana2.tickSpecies(false);
		r.check(
			"D1 huyendo no come (prioridad flee)",
			presa2.alive && rana2.state === "flee"
		);

		// Ignora slimes grandes/medianos (solo slimeSize 0 es comestible).
		const rana3 = mobs.createMob("frog", 0.5, 64, 0.5);
		const grande = mobs.createMob("slime", 0.8, 64, 0.6);
		grande.slimeSize = 2;
		state.mobs = [rana3, grande];
		for (let t = 0; t < 30 && grande.alive; t++) rana3.tickSpecies(false);
		r.check(
			"D1 ignora slimes grandes (no son presa)",
			grande.alive && rana3.state !== "eat"
		);

		// Salto por-mob determinista: la Y oscila sobre el suelo stub.
		const rana4 = mobs.createMob("frog", 0.5, 64, 0.5);
		state.mobs = [rana4];
		let minY = Infinity;
		let maxY = -Infinity;
		for (let t = 0; t < 60; t++) {
			rana4.frogHopAccum = (t * 50) % 900; // fase controlada
			rana4.tickSpecies(false);
			minY = Math.min(minY, rana4.y);
			maxY = Math.max(maxY, rana4.y);
		}
		r.check(
			"D1 salto: oscila sobre el suelo (parábola del hop)",
			maxY > 63 + 0.3 && minY >= 63 && maxY > minY,
			`min=${minY.toFixed(2)} max=${maxY.toFixed(2)}`
		);
		state.mobs = []; // higiene
	});
});

// ------------------------------------------------------------
// G1 — rate limit POR CONEXIÓN (usuario individual)
// Los contadores viven en el cierre de handleConnection (net.js): uno por
// socket. Aquí se fija el AISLAMIENTO a nivel de primitiva.
// ------------------------------------------------------------
{
	const t0 = 1000000;
	const A = createRateLimit(30); // usuario hostil
	const Bq = createRateLimit(30); // usuario normal
	// Ventana 1: A inunda (31), B conversa (2). Ninguno cierra aún.
	for (let i = 0; i < 31; i++) A.hit(t0);
	Bq.hit(t0);
	Bq.hit(t0);
	r.check(
		"G1 ventana única violada NO cierra (ráfaga legítima)",
		A.hit(t0 + 500) === false
	);
	// Ventana 2: A repite el flood → cierre SOLO de A; B intacto.
	let cerroA = false;
	for (let i = 0; i < 32; i++) if (A.hit(t0 + 1500)) cerroA = true;
	r.check("G1 flood SOSTENIDO cierra al emisor", cerroA);
	r.check(
		"G1 el otro usuario no se ve afectado (aislamiento)",
		Bq.hit(t0 + 1600) === false && Bq.hit(t0 + 1700) === false
	);
}

r.done();
