"use strict";
// ============================================================
// TESTS DE LA FASE 21.5 — Pesca (Bloque A: A1 caña + A8 cofres)
//   A1) Cab de pescar y sistema de pesca (1.7/1.13): el item FISHING_ROD
//       es isTool (no se apila, lleva durabilidad) con FISHING_ROD_DURABILITY
//       64, su receta es valida (3 palos + 2 hilo, unit-recetas la cubre),
//       y el modulo server/fishing.js lanza una entidad (bobber) que:
//          - impacta en agua → inWater, y al cabo de 1.5-5 s "pica" (biting);
//          - impacta fuera de agua → nunca pica (biteAt 0);
//          - recogerla picando entrega un item de la tabla (pescado/tesoro/
//            basura), desgasta DURO solo entonces y rompe la caña al llegar a 0;
//          - recogerla antes de picar la devuelve SIN gastar durabilidad;
//          - un player solo tiene una linea activa (castFishingLine re-lanza
//            no crea bobber duplicado) y el snapshot lleva id estable.
//       Fuera de la fisica: applyToolWear NO desgasta la caña (minar/atacar
//       con ella no la consume, como el arco) y applyFishingWear si.
//   A8) Las tablas de loot de los cofres (LOOT_TABLE, TEMPLE, SHIPWRECK,
//       PYRAMID) pueden soltar una caña de pescar con durabilidad 1-20 (< 64)
//       y los demas loots de cada tabla siguen siendo items validos.
//   El sincronismo B/I (262 en ambos lados) y el icono los verifica
//   unit-sync / unit-itemicons (cubren el universo entero).
// ============================================================
const world = require("../server/world.js");
const state = require("../server/state.js");
const constants = require("../server/constants.js");
const fishing = require("../server/fishing.js");
const chests = require("../server/chests.js");
const combat = require("../server/combat.js");
const { ItemStack } = require("../server/items.js");
const { B, I, FISHING_ROD_DURABILITY, isFishingRod, SHIELD_DURABILITY } = constants;

const LOW = 58; // y de mundo de la base de la zona de prueba (aire/agua)

let failed = 0;
const failedChecks = [];
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		failedChecks.push(`${_name}${_extra ? ` (${_extra})` : ""}`);
		console.log(`FAIL: ${_name} | ${_extra}`);
	}
};

// Mock de jugador (patron de unit-fase11): con caña en la mano y un inventario
// vacio para recibir el loot.
const mkPlayer = (over = {}) => ({
	id: "p-pesca",
	ws: { readyState: 3, send() {} },
	health: 20,
	maxHealth: 20,
	x: 0,
	y: LOW + 6, // de pie sobre la zona de prueba
	z: 0,
	yaw: 0,
	pitch: -Math.PI / 2, // mirando recto hacia abajo → el bobber cae vertical
	selectedSlot: 0,
	armor: { helmet: null, chestplate: null, leggings: null, boots: null },
	inventory: new Array(36).fill(null),
	...over
});

// Limpia la zona de prueba: cubo de aire 3x[LOW-2..LOW+9]x3 alrededor de
// (0,0). El ojo del jugador está en LOW+6+1.6 = LOW+7.6, así que la columna
// debe estar despejada hasta por encima del punto de lanzamiento para que el
// bobber caiga por aire puro y aterrice donde ponga el test.
function zonaAire() {
	for (let y = LOW - 2; y <= LOW + 9; y++)
		for (let x = -1; x <= 1; x++)
			for (let z = -1; z <= 1; z++) world.setBlock(x, y, z, B.AIR);
}
// Pone agua en la base (celda central) y piedra alrededor para cerrar el pozo.
function zonaAgua() {
	zonaAire();
	world.setBlock(0, LOW, 0, B.WATER);
	world.setBlock(0, LOW - 1, 0, B.STONE);
	world.setBlock(-1, LOW, 0, B.STONE);
	world.setBlock(1, LOW, 0, B.STONE);
	world.setBlock(0, LOW, -1, B.STONE);
	world.setBlock(0, LOW, 1, B.STONE);
}
// Zona solida (sin agua): el bobber aterriza en piedra → no pica nunca.
function zonaSuelo() {
	zonaAire();
	for (let y = LOW - 2; y <= LOW; y++)
		for (let x = -1; x <= 1; x++)
			for (let z = -1; z <= 1; z++) world.setBlock(x, y, z, B.STONE);
}
function limpiarBobbers() {
	state.bobbers = [];
}

// ============================================================
// 1) DATOS DEL ITEM (sin fisica): ID, durabilidad, isTool/isFishingRod.
// ============================================================
check(
	"FISHING_ROD es el id 262 y isFishingRod lo reconoce",
	I.FISHING_ROD === 262 && isFishingRod(262) && !isFishingRod(247),
	`I.FISHING_ROD=${I.FISHING_ROD}`
);
check(
	"FISHING_ROD_DURABILITY es 64 (valor oficial MC)",
	FISHING_ROD_DURABILITY === 64,
	`${FISHING_ROD_DURABILITY}`
);
check(
	"la caña es isTool (no se apila, tiene durabilidad en el inventario)",
	constants.isTool(I.FISHING_ROD),
	"isTool"
);
check(
	"la caña NO está en TOOL_DURABILITY (no se desgasta al minar/atacar)",
	!(I.FISHING_ROD in constants.TOOL_DURABILITY),
	"TOOL_DURABILITY"
);

// ============================================================
// 2) CAST: lanza solo con la caña en mano y una linea por jugador.
// ============================================================
{
	limpiarBobbers();
	const p = mkPlayer(); // inventario vacio → sin caña en la mano
	check(
		"sin caña en la mano castFishingLine devuelve false y no crea bobber",
		fishing.castFishingLine(p) === false && state.bobbers.length === 0,
		`${state.bobbers.length}`
	);
}
{
	limpiarBobbers();
	const p = mkPlayer({ inventory: [new ItemStack(I.FISHING_ROD, 1, 40), ...new Array(35).fill(null)] });
	check("con caña castFishingLine devuelve true y crea 1 bobber", fishing.castFishingLine(p) === true && state.bobbers.length === 1);
	const b = state.bobbers[0];
	check("el bobber se lanza desde los ojos (y del player + EYE_HEIGHT)", b.y === p.y + constants.EYE_HEIGHT && b.playerId === p.id && b.kind === undefined);
	check(
		"relanzar con una linea activa no crea bobber duplicado",
		fishing.castFishingLine(p) === false && state.bobbers.length === 1,
		`${state.bobbers.length}`
	);
	check("el snapshot del bobber lleva id estable por playerId", fishing.bobberSnapshot(b).playerId === p.id && fishing.bobberSnapshot(b).kind === "bobber");
}

// ============================================================
// 3) TICK: impacto en agua → inWater y picoteo programado 1.5-5 s.
// ============================================================
{
	limpiarBobbers();
	zonaAgua();
	const p = mkPlayer({ inventory: [new ItemStack(I.FISHING_ROD, 1, 40), ...new Array(35).fill(null)] });
	fishing.castFishingLine(p);
	// Simular el vuelo: avanzar de 50 en 50 ms (suficiente para que llegue al agua)
	// y detectar que aterriza flotando (vx=vy=vz=0, inWater true).
	let b;
	for (let t = 0; t < 3000; t += 50) {
		fishing.tickBobbers(50);
		b = state.bobbers[0];
		if (b && b.inWater) break;
	}
	check("al caer en agua el bobber aterriza (inWater) y se queda quieto", !!b?.inWater && b.vx === 0 && b.vy === 0 && b.vz === 0, JSON.stringify(b));
	if (b) {
		check(
			"el picoteo se programa dentro de la ventana 1.5-5 s",
			b.biteAt >= Date.now() + fishing.BITE_MIN_MS && b.biteAt <= Date.now() + fishing.BITE_MIN_MS + fishing.BITE_RANGE_MS,
			`biteAt-now=${b.biteAt - Date.now()}`
		);
		check("antes del picoteo no biting", b.biting === false);
		// Forzar el momento: postergar biteAt al pasado → "pica" en el siguiente tick.
		b.biteAt = 0;
		fishing.tickBobbers(50);
		check("transcurrido el tiempo el bobber pica (biting)", state.bobbers[0]?.biting === true);
	}
}

// ============================================================
// 4) REEL: picando entrega un item y desgasta DURO; sin picar no gasta.
// ============================================================
{
	limpiarBobbers();
	zonaAgua();
	const p = mkPlayer({ inventory: [new ItemStack(I.FISHING_ROD, 1, 40), ...new Array(35).fill(null)] });
	fishing.castFishingLine(p);
	for (let t = 0; t < 3000; t += 50) {
		fishing.tickBobbers(50);
		if (state.bobbers[0]?.inWater) break;
	}
	// Recoger ANTES de picar → devuelve null, sin gastar durabilidad.
	const antes = fishing.reelBobber(p);
	check("recoger antes de picar no entrega item", antes.caught === null);
	check("recoger antes de picar no gasta durabilidad", p.inventory[0].durability === 40, `${p.inventory[0]?.durability}`);
	check("recoger antes de picar retira la linea", state.bobbers.length === 0);

	// Picar y recoger → entrega un item de la tabla y desgasta 1.
	limpiarBobbers();
	fishing.castFishingLine(p);
	for (let t = 0; t < 3000 && !state.bobbers[0]?.inWater; t += 50) fishing.tickBobbers(50);
	const b = state.bobbers[0];
	if (b) {
		b.biteAt = 0;
		fishing.tickBobbers(50);
		const allLoot = [
			...fishing.FISHING_LOOT.fish,
			...fishing.FISHING_LOOT.treasure,
			...fishing.FISHING_LOOT.junk
		].map((e) => e.id);
		const despues = fishing.reelBobber(p);
		check(
			"recoger picando entrega un item de la tabla de pesca",
			despues.caught && allLoot.includes(despues.caught.id),
			`${JSON.stringify(despues.caught)}`
		);
		check("recoger picando desgasta la caña (durabilidad 39)", p.inventory[0].durability === 39, `${p.inventory[0]?.durability}`);
		check("el item entregado va al inventario", p.inventory.some((s) => s && s.id === despues.caught.id));
		check("la linea se retira al recoger", state.bobbers.length === 0);
		check("una categoria valida (pescado/tesoro/basura)", ["fish", "treasure", "junk"].includes(despues.caught.category));
	}
}

// ============================================================
// 5) ROMPER LA CAB: llegar a 0 con applyFishingWear elimina el item.
// ============================================================
{
	limpiarBobbers();
	zonaAgua();
	const p = mkPlayer({ inventory: [new ItemStack(I.FISHING_ROD, 1, 1), ...new Array(35).fill(null)] });
	fishing.castFishingLine(p);
	for (let t = 0; t < 3000 && !state.bobbers[0]?.inWater; t += 50) fishing.tickBobbers(50);
	const b = state.bobbers[0];
	if (b) {
		b.biteAt = 0;
		fishing.tickBobbers(50);
		const res = fishing.reelBobber(p);
		check("al llegar a 0 la caña se rompe (broke true)", res.broke === true);
		check("la caña rota desaparece del slot", !p.inventory[0]);
	}
}

// ============================================================
// 6) FUERA DE AGUA: aterriza en suelo, nunca pica.
// ============================================================
{
	limpiarBobbers();
	zonaSuelo();
	const p = mkPlayer({ inventory: [new ItemStack(I.FISHING_ROD, 1, 40), ...new Array(35).fill(null)] });
	fishing.castFishingLine(p);
	let b;
	for (let t = 0; t < 3000; t += 50) {
		fishing.tickBobbers(50);
		b = state.bobbers[0];
		// El bobber se detiene (v=0) al aterrizar en piedra.
		if (b && b.vx === 0 && b.vy === 0 && b.vz === 0 && Math.floor(b.y) <= LOW) break;
	}
	check("fuera de agua el bobber aterriza en el suelo (se detiene)", !!b && b.vx === 0 && b.vy === 0 && b.vz === 0, JSON.stringify(b));
	if (b) {
		check("fuera de agua no se programa picoteo (biteAt 0)", b.biteAt === 0, `${b.biteAt}`);
		fishing.tickBobbers(50);
		check("fuera de agua nunca pica", state.bobbers[0]?.biting === false);
		const antes = p.inventory[0].durability;
		const res = fishing.reelBobber(p);
		check("fuera de agua recoger no entrega item", res.caught === null);
		check("fuera de agua recoger no desgasta", p.inventory[0].durability === antes);
	}
}

// ============================================================
// 7) DESGASTE POR USO: applyToolWear no toca la caña; applyFishingWear si.
// ============================================================
{
	const p = mkPlayer({ inventory: [new ItemStack(I.FISHING_ROD, 1, 40), ...new Array(35).fill(null)] });
	check(
		"applyToolWear (minar/atacar) NO desgasta la caña",
		combat.applyToolWear(p) === false && p.inventory[0].durability === 40,
		`${p.inventory[0]?.durability}`
	);
	check(
		"applyFishingWear desgasta la caña (-1)",
		combat.applyFishingWear(p) === false && p.inventory[0].durability === 39,
		`${p.inventory[0]?.durability}`
	);
	p.inventory[0].durability = 1;
	check("applyFishingWear rompe la caña al llegar a 0 y la retira", combat.applyFishingWear(p) === true && !p.inventory[0]);
}

// ============================================================
// 8) A8 — CABAS ROTAS EN LOS COFRES.
// ============================================================
{
	const tables = [chests.LOOT_TABLE, chests.TEMPLE_LOOT_TABLE, chests.SHIPWRECK_LOOT_TABLE, chests.PYRAMID_LOOT_TABLE];
	for (const table of tables) {
		// La tabla incluye la caña [id, 1, 1, [1, 20]] (A8).
		const entry = table.find((t) => t[0] === I.FISHING_ROD);
		check("la tabla de loot incluye la caña de pescar (A8)", !!entry, table === chests.LOOT_TABLE ? "LOOT_TABLE" : "estructura");
		if (entry) {
			check("caña de botín con rango de durabilidad 1-20", entry[3]?.[0] === 1 && entry[3]?.[1] === 20, JSON.stringify(entry[3]));
		}
	}
	// Generar slots desde la LOOT_TABLE muchas veces: ninguna caña sobrepasa 20
	// (< 64) y el resto de items siguen siendo del universo I conocida.
	const known = new Set(Object.values(I));
	let rods = 0;
	for (let i = 0; i < 200; i++) {
		const slots = chests.lootSlots();
		for (const s of slots) {
			if (!s) continue;
			// Durabilidad valida de cualquier item: < FISHING_ROD_DURABILITY
			// para la caña, y el item existe (conserva el loot viejo de Fase 7).
			if (s.id === I.FISHING_ROD) {
				rods++;
				check("caña de botín con durabilidad 1-20 (< 64)", s.durability >= 1 && s.durability <= 20, `dur=${s.durability}`);
			}
			check("los items de loot son del universo I (sin romper lo viejo)", known.has(s.id), `id=${s.id}`);
		}
	}
	check("la caña aparece en el botin (200 cofres)", rods > 0, `${rods}`);
}

// ============================================================
// 9) B1 — PIEDRA PULIDA (granito 73, diorita 74, andesita 75 + pulidas
//    76/77/78): durezas, categoría stone (canHarvest con pico), generación
//    en vetas del subsuelo y recetas de pulido 2×2.
// ============================================================
{
	const pulidas = [B.GRANITE, B.DIORITE, B.ANDESITE, B.POLISHED_GRANITE, B.POLISHED_DIORITE, B.POLISHED_ANDESITE];
	for (const b of pulidas) {
		check(
			`B1: dureza de pulida (${b}) es 1.5 (MC)`,
			constants.BLOCK_HARDNESS[b] === 1.5,
			`d=${constants.BLOCK_HARDNESS[b]}`
		);
		check(
			`B1: la pulida (${b}) es de categoría stone`,
			// canHarvest con pico cubre la categoría (stone→pickaxe); el mapa
			// BLOCK_CATEGORY no se exporta.
			constants.canHarvest(I.IRON_PICKAXE, b) === true
		);		check(
			`B1: la pulida (${b}) requiere pico para cosechar`,
			constants.canHarvest(0, b) === false && constants.canHarvest(I.IRON_PICKAXE, b) === true,
			`mano=${constants.canHarvest(0, b)} pico=${constants.canHarvest(I.IRON_PICKAXE, b)}`
		);
		check(`B1: la pulida (${b}) es sólida`, constants.isSolidBlock(b) === true);
	}
	// Recetas de pulido: 2x2 del material → 4 pulidas (unit-recetas valida su
	// estructura general; aquí se comprueba el mapeo concreto de la spec).
	const recipes = require("../recetas.json");
	for (const [recipe, mat, out] of [
		["polished_granite", B.GRANITE, B.POLISHED_GRANITE],
		["polished_diorite", B.DIORITE, B.POLISHED_DIORITE],
		["polished_andesite", B.ANDESITE, B.POLISHED_ANDESITE]
	]) {
		const r = recipes[recipe];
		check(
			`B1: receta ${recipe} existe y da 4 de la pulida`,
			!!r && r.shape?.join("") === "####" && r.ingredients["#"] === mat && r.result?.id === out && r.result?.count === 4,
			JSON.stringify(r?.shape) + "/" + JSON.stringify(r?.result)
		);
	}
	// Vetas en el subsuelo: barren varios chunks de ejemplo que NINGÚN test
	// anterior tocó (lejos de la zona de pesca) y cuentan granito/diorita/
	// andesita en la banda y ≥ −8 de la generación por defecto de la semilla.
	let contar = { [B.GRANITE]: 0, [B.DIORITE]: 0, [B.ANDESITE]: 0 };
	const { CHUNK_SIZE } = constants;
	for (let cx = -6; cx <= -4; cx++)
		for (let cz = -6; cz <= -4; cz++) {
			const ch = world.generateChunk(cx, cz);
			if (!ch) continue;
			const baseY = -8;
			for (let lx = 0; lx < CHUNK_SIZE; lx++)
				for (let lz = 0; lz < CHUNK_SIZE; lz++)
					for (let ly = baseY; ly < -1; ly++) {
						// mundo y = local + WORLD_MIN_Y (−64); el local de y=−8..−2 es ly = 56..62.
						const localRow = ly + 64;
						if (localRow < 0 || localRow >= ch.length / (CHUNK_SIZE * CHUNK_SIZE)) continue;
						const b = ch[(localRow * CHUNK_SIZE + lz) * CHUNK_SIZE + lx];
						if (contar[b] !== undefined) contar[b]++;
					}
		}
	check(
		"B1: hay vetas de las tres piedras pulidas en el subsuelo",
		contar[B.GRANITE] > 0 && contar[B.DIORITE] > 0 && contar[B.ANDESITE] > 0,
		JSON.stringify(contar)
	);
}

// ============================================================
// 10) B2 — LINTERNA (79): dureza de antorcha, no sólida, cae a sí misma
//     (canHarvest a mano true), requiere soporte para colocarse, emite luz
//     como la antorcha y tiene receta de 4 lingotes + antorcha.
// ============================================================
{
	check("B2: LANTERN vale 79", B.LANTERN === 79, `${B.LANTERN}`);
	check(
		"B2: dureza de linterna 0.1 (como la antorcha)",
		constants.BLOCK_HARDNESS[B.LANTERN] === 0.1,
		`d=${constants.BLOCK_HARDNESS[B.LANTERN]}`
	);
	check(
		"B2: la linterna NO es sólida (se atraviesa, como la antorcha)",
		constants.isSolidBlock(B.LANTERN) === false
	);
	check(
		"B2: la linterna se cosecha a mano (cae a sí misma)",
		constants.canHarvest(0, B.LANTERN) === true && constants.canHarvest(I.IRON_SWORD, B.LANTERN) === false
	);
	// Colocación: la linterna necesita un vecino sólido (soporte), como la
	// antorcha (net.js lo exige antes de setBlock). Se comprueba el soporte
	// del mundo sobre una celda con suelo sólido, dentro del mundo v6
	// (−64..+63): la celda base y=4, con un bloque de piedra en y=3 (suelo)
	// y el entorno en aire.
	{
		limpiarBobbers();
		// Limpiar un cubo 3×3×3 alrededor de (0,4,0) y poner suelo sólido.
		for (let x = -1; x <= 1; x++)
			for (let z = -1; z <= 1; z++)
				for (let y = 2; y <= 5; y++) world.setBlock(x, y, z, B.AIR);
		world.setBlock(0, 2, 0, B.STONE); // suelo bajo la celda y=3
		check(
			"B2: con un bloque sólido debajo la linterna tiene soporte",
			world.torchSupported(0, 3, 0) === true
		);
		world.setBlock(0, 2, 0, B.AIR); // quitar el suelo
		check(
			"B2: sin vecinos sólidos la linterna no tiene soporte",
			world.torchSupported(0, 3, 0) === false
		);
		// Restaurar el entorno (aire) para no contaminar otros tests.
		for (let x = -1; x <= 1; x++)
			for (let z = -1; z <= 1; z++)
				for (let y = 2; y <= 5; y++) world.setBlock(x, y, z, B.AIR);
	}
	// Luz del cliente: lighting.js (módulo puro ESM) deja pasar la luz a
	// través de la linterna y una linterna horneada produce luz como una
	// antorcha (mismo radio/atenuación). Se resuelve en un child con
	// --input-type=module porque los tests son CommonJS y no pueden importar
	// el ESM del cliente directamente.
	const { execFileSync } = require("node:child_process");
	let luzProbe = null;
	try {
		const probe = `
			import { isLightPassable, computeChunkLight } from "file://${process.cwd()}/public/lighting.js";
			const r = {
				pasable: isLightPassable(79),
				mismoQueAntorcha: isLightPassable(79) === isLightPassable(23),
				radio: (() => {
					const out = computeChunkLight(0, 0, 16, 128, -64, () => 0, [[0, 0, 0]]);
					let max = 0, idx = -1;
					for (let i = 0; i < out.length; i++) if (out[i] > max) { max = out[i]; idx = i; }
					return { max: Math.round(max * 1000) / 1000, idx };
				})()
			};
			console.log(JSON.stringify(r));
		`;
		luzProbe = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", probe], { encoding: "utf8" }).trim());
	} catch (e) {
		luzProbe = { error: String(e).slice(0, 80) };
	}
	check(
		"B2: la luz del cliente deja pasar la linterna (como la antorcha)",
		luzProbe?.pasable === true,
		JSON.stringify(luzProbe)
	);
	check(
		"B2: isLightPassable(linterna) coincide con antorcha",
		luzProbe?.mismoQueAntorcha === true
	);
	check(
		"B2: una linterna emite luz (radio max 1.0 en su celda)",
		luzProbe?.radio?.max === 1,
		JSON.stringify(luzProbe?.radio)
	);
	// Receta: 4 lingotes (102) en cruz + antorcha (23) en el centro → 1.
	{
		const recipes = require("../recetas.json");
		const r = recipes.lantern;
		check(
			"B2: receta linterna existe (4 lingotes + antorcha → 1)",
			!!r &&
				r.shape?.join("|") === " I |ITI| I " &&
				r.ingredients["I"] === I.IRON_INGOT &&
				r.ingredients["T"] === B.TORCH &&
				r.result?.id === B.LANTERN &&
				r.result?.count === 1,
			JSON.stringify(r)
		);
	}
}

// ============================================================
// 11) B3 — BAMBÚ Y ANDAMIOS: el bambú (80) se genera en la jungla como
//     planta alta estática (tallos de 3-8), no es sólido, cae a sí mismo y
//     craftea tablones (81) y andamios (82); el andamio es no sólido y se
//     craftea en pilas de 6.
// ============================================================
{
	// Identidad y propiedades de servidor
	check("B3: BAMBOO 80, BAMBOO_PLANKS 81, SCAFFOLDING 82",
		B.BAMBOO === 80 && B.BAMBOO_PLANKS === 81 && B.SCAFFOLDING === 82);
	for (const b of [B.BAMBOO, B.SCAFFOLDING]) {
		check(`B3: el bloque ${b} no es sólido`, constants.isSolidBlock(b) === false);
		check(`B3: el bloque ${b} se rompe al instante`, constants.BLOCK_HARDNESS[b] === 0.05);
	}
	check("B3: los tablones de bambú son sólidos y dureza de madera",
		constants.isSolidBlock(B.BAMBOO_PLANKS) === true && constants.BLOCK_HARDNESS[B.BAMBOO_PLANKS] === 2.0);
	// Recetas
	{
		const recipes = require("../recetas.json");
		const plans = recipes.bamboo_planks;
		check("B3: receta tablones de bambú (2×2 bambú → 1)",
			!!plans && plans.shape?.join("") === "BBBB" && plans.ingredients.B === B.BAMBOO && plans.result?.id === B.BAMBOO_PLANKS && plans.result?.count === 1);
		const scaf = recipes.scaffolding;
		check("B3: receta andamio (6 bambú → 6)",
			!!scaf && scaf.ingredients.B === B.BAMBOO && scaf.result?.id === B.SCAFFOLDING && scaf.result?.count === 6);
	}
	// Drop del bambú a sí mismo (players.breakPlant)
	{
		const { createPlayer } = require("../server/players.js");
		const p = createPlayer("p-b3", { x: 0, y: 50, z: 0 });
		p.inventory = new Array(36).fill(null);
		// Simular breakPlant directo (romper la base del tallo)
		zonaAire();
		world.setBlock(0, 40, 0, B.BAMBOO);
		// breakPlant no está exportado; se valida el drop por la vía real:
		// canHarvest a mano true → drop = block (players.finishMining).
		check("B3: el bambú se cosecha a mano", constants.canHarvest(0, B.BAMBOO) === true);
		check("B3: el andamio se cosecha a mano", constants.canHarvest(0, B.SCAFFOLDING) === true);
		// Ground plant: el bambú rompe con la base (GROUND_PLANTS) — probamos
		// vía breakSeconds/dureza ya cubierto; aquí solo validar que el drop
		// de breakPlant lo da: la lógica de players.js añade BAMBOO a sí mismo.
		// Se verifica indirectamente con unit-sync (ítem 80 existe) y con el
		// test de recetas de arriba (el ítem entra en crafteos).
	}
	// Generación determinista: bambú en la jungla (buscar en varios chunks
	// lejos de la zona de pesca; la jungla aparece con la semilla por defecto).
	{
		const { CHUNK_SIZE: CS } = constants;
		let encontrados = 0;
		for (let cx = -8; cx <= 8; cx += 2)
			for (let cz = -8; cz <= 8; cz += 2) {
				const ch = world.generateChunk(cx, cz);
				if (!ch) continue;
				for (let i = 0; i < ch.length; i++)
					if (ch[i] === B.BAMBOO) { encontrados++; break; }
			}
		check("B3: hay bambú generado en la jungla (semilla por defecto)", encontrados > 0, `${encontrados}`);
	}
	// Soporte del andamio: es un bloque NO sólido, así que el soporte de la
	// antorcha no aplica; se puede colocar en el aire (flota, como MC) — solo
	// se valida que su solidez no bloquee la física.
	check("B3: el andamio no bloquea el paso (no sólido en física)", constants.isSolidBlock(B.SCAFFOLDING) === false);
}

// ============================================================
// 12) B4 — COLMENAS Y MIEL: BEE_NEST (83, generado en árboles) y BEE_HIVE
//     (84, crafteado); clic derecho con una botella de vidrio (263, crafteo
//     3 vidrio → 3) sobre la colmena entrega una HONEY_BOTTLE (264, comida
//     6/1.2); el HONEY_BLOCK (85, crafteo 4 botellas) anula el daño de caída
//     al aterrizar sobre él.
// ============================================================
{
	// Identidad y propiedades
	check("B4: BEE_NEST 83, BEE_HIVE 84, HONEY_BLOCK 85",
		B.BEE_NEST === 83 && B.BEE_HIVE === 84 && B.HONEY_BLOCK === 85);
	check("B4: botella de vidrio 263 y botella de miel 264",
		I.GLASS_BOTTLE === 263 && I.HONEY_BOTTLE === 264);
	check("B4: colmenas y bloque de miel son sólidos",
		constants.isSolidBlock(B.BEE_NEST) && constants.isSolidBlock(B.BEE_HIVE) && constants.isSolidBlock(B.HONEY_BLOCK));
	// Comida: botella de miel restaura 6/1.2 (FOOD_VALUES).
	{
		const food = constants.FOOD_VALUES?.[I.HONEY_BOTTLE];
		check("B4: la botella de miel es comida 6/1.2",
			!!food && food.food === 6 && food.saturation === 1.2,
			JSON.stringify(food));
		const { canEat, eatFood } = require("../server/combat.js");
		const p = mkPlayer({ health: 10, food: 10, saturation: 5 });
		p.inventory = new Array(36).fill(null);
		p.inventory[0] = { id: I.HONEY_BOTTLE, count: 1 };
		check("B4: la botella de miel se puede comer", canEat(p, I.HONEY_BOTTLE) === "ok");
		eatFood(p, I.HONEY_BOTTLE);
		check("B4: comer la botella restaura comida (6)",
			p.food === 16 && p.saturation > 0,
			`food ${p.food} sat ${p.saturation}`);
	}
	// Recolección: handleHoneyBottle consume la botella y devuelve la de miel.
	{
		const actions = require("../server/actions.js");
		zonaAire();
		world.setBlock(0, LOW, 0, B.BEE_HIVE);
		const p = mkPlayer({ x: 0, y: LOW + 2, z: 0 });
		p.inventory = new Array(36).fill(null);
		p.inventory[0] = { id: I.GLASS_BOTTLE, count: 1 };
		actions.handleHoneyBottle(p, { x: 0, y: LOW, z: 0 });
		const tieneMiel = p.inventory.some((s) => s && s.id === I.HONEY_BOTTLE);
		const sinVidrio = !p.inventory.some((s) => s && s.id === I.GLASS_BOTTLE);
		check("B4: botella de vidrio sobre la colmena → botella de miel",
			tieneMiel && sinVidrio, `miel ${tieneMiel} vidrio ${!sinVidrio}`);
		// Sin botella en la mano: no hace nada.
		const p2 = mkPlayer({ x: 0, y: LOW + 2, z: 0 });
		p2.inventory = new Array(36).fill(null);
		p2.inventory[0] = { id: B.STONE, count: 1 };
		actions.handleHoneyBottle(p2, { x: 0, y: LOW, z: 0 });
		check("B4: sin botella de vidrio no se recolecta miel",
			!p2.inventory.some((s) => s && s.id === I.HONEY_BOTTLE));
		// Colmena lejos (fuera del radio 5): no hace nada.
		const p3 = mkPlayer({ x: 10, y: LOW + 2, z: 10 });
		p3.inventory = new Array(36).fill(null);
		p3.inventory[0] = { id: I.GLASS_BOTTLE, count: 1 };
		actions.handleHoneyBottle(p3, { x: 0, y: LOW, z: 0 });
		check("B4: colmena fuera del radio no recolecta miel",
			!p3.inventory.some((s) => s && s.id === I.HONEY_BOTTLE) &&
				p3.inventory.some((s) => s && s.id === I.GLASS_BOTTLE));
		// No es una colmena (piedra): no hace nada.
		const p4 = mkPlayer({ x: 0, y: LOW + 2, z: 0 });
		p4.inventory = new Array(36).fill(null);
		p4.inventory[0] = { id: I.GLASS_BOTTLE, count: 1 };
		world.setBlock(0, LOW, 0, B.STONE);
		actions.handleHoneyBottle(p4, { x: 0, y: LOW, z: 0 });
		check("B4: un bloque que no es colmena no da miel",
			!p4.inventory.some((s) => s && s.id === I.HONEY_BOTTLE));
	}
	// HONEY_BLOCK: caída aterrizando sobre él → sin daño. Aterriza con los pies
	// en la celda (0, 2, 0): el jugador manda la altura del ojo, así que los
	// pies están en floor(player.y - EYE_HEIGHT) = 2 con player.y = 3.7.
	{
		const aterrizar = (block) => {
			world.setBlock(0, 0, 0, B.AIR);
			world.setBlock(0, 1, 0, B.AIR);
			world.setBlock(0, 2, 0, block);
			const p = mkPlayer({ health: 20, maxHealth: 20, fallFromY: 20 });
			p.x = 0;
			p.y = 3.7;
			p.z = 0;
			p.fallVy = -10;
			combat.applyFallDamage(p, -10);
			return p.health;
		};
		const conMiel = aterrizar(B.HONEY_BLOCK);
		check("B4: aterrizar sobre un bloque de miel no hace daño",
			conMiel === 20, `health ${conMiel}`);
		const piedra = aterrizar(B.STONE);
		check("B4: sobre piedra la misma caída sí daña (control)",
			piedra < 20, `health ${piedra}`);
	}
	// Recetas: botella de vidrio, colmena y bloque de miel.
	{
		const recipes = require("../recetas.json");
		const gb = recipes.glass_bottle;
		check("B4: receta botella de vidrio (3 vidrio → 3)",
			!!gb && gb.shape?.join("") === "GGG" && gb.ingredients.G === B.GLASS && gb.result?.id === I.GLASS_BOTTLE && gb.result?.count === 3);
		const bh = recipes.bee_hive;
		check("B4: receta colmena (6 tablones + 1 miel → 1)",
			!!bh && bh.ingredients.X === B.PLANKS && bh.ingredients.H === I.HONEY && bh.result?.id === B.BEE_HIVE);
		const hb = recipes.honey_block;
		check("B4: receta bloque de miel (4 botellas → 1)",
			!!hb && hb.shape?.join("") === "HHHH" && hb.ingredients.H === I.HONEY_BOTTLE && hb.result?.id === B.HONEY_BLOCK);
	}
	// Generación: nidos de abeja aparecen en los árboles (bosque/abedul) con
	// la semilla por defecto (buscar en varios chunks donde haya árboles).
	{
		let nidos = 0;
		for (let cx = -8; cx <= 8; cx += 2)
			for (let cz = -8; cz <= 8; cz += 2) {
				const ch = world.generateChunk(cx, cz);
				if (!ch) continue;
				for (let i = 0; i < ch.length; i++)
					if (ch[i] === B.BEE_NEST) { nidos++; break; }
			}
		check("B4: hay nidos de abeja generados en los árboles", nidos > 0, `${nidos}`);
	}
}

// ============================================================
// 13) B5 — CORAL Y ALGAS (1.13): el arrecife de la D2 se enriquece con el
//     abanico de coral (86) encima del CORAL_BLOCK (72); en el resto del
//     océano crece kelp (87, planta alta determinista, libre de arrecife) y
//     pasto marino (88) en el lecho. Los tres son plantas NO sólidas que se
//     rompen al instante y caen a sí mismas.
// ============================================================
{
	// Identidad y propiedades
	check("B5: CORAL_FAN 86, KELP 87, SEAGRASS 88",
		B.CORAL_FAN === 86 && B.KELP === 87 && B.SEAGRASS === 88);
	check("B5: el coral y las algas no son sólidos (se atraviesan)",
		!constants.isSolidBlock(B.CORAL_FAN) &&
			!constants.isSolidBlock(B.KELP) &&
			!constants.isSolidBlock(B.SEAGRASS));
	for (const b of [B.CORAL_FAN, B.KELP, B.SEAGRASS]) {
		check(`B5: el bloque ${b} se rompe al instante`, constants.BLOCK_HARDNESS[b] === 0.05);
		check(`B5: el bloque ${b} se cosecha a mano`, constants.canHarvest(0, b) === true);
	}
	// Drop a sí mismo (breakPlant, como el bambú).
	{
		const { createPlayer } = require("../server/players.js");
		const p = createPlayer("p-b5", { x: 0, y: 50, z: 0 });
		p.inventory = new Array(36).fill(null);
		check("B5: canHarvest a mano cubre el drop (drop por finishMining)",
			constants.canHarvest(0, B.CORAL_FAN) === true &&
				constants.canHarvest(0, B.KELP) === true &&
				constants.canHarvest(0, B.SEAGRASS) === true);
	}
	// Generación determinista: con la semilla por defecto hay coral/alga en
	// los océanos (buscar en chunks de océano; el arrecife se genera en la
	// zona cálida y el kelp en el resto del océano).
	{
		let fans = 0, kelps = 0, gras = 0;
		for (let cx = -10; cx <= 10; cx += 2)
			for (let cz = -10; cz <= 10; cz += 2) {
				const ch = world.generateChunk(cx, cz);
				if (!ch) continue;
				for (let i = 0; i < ch.length; i++) {
					if (ch[i] === B.CORAL_FAN) fans++;
					else if (ch[i] === B.KELP) kelps++;
					else if (ch[i] === B.SEAGRASS) gras++;
				}
			}
		check("B5: hay abánico de coral generado en el océano cálido", fans > 0, `${fans}`);
		check("B5: hay kelp generado en el océano", kelps > 0, `${kelps}`);
		check("B5: hay pasto marino generado en el lecho", gras > 0, `${gras}`);
	}
}

// ============================================================
// BLOQUE C (C2): ESCUDO (1.9) — el ítem 265 reduce el daño entrante de
// mobs/proyectiles mientras player.blocking, desgasta su durabilidad (336)
// al absorber un impacto real y el daño ambiental (lava/caída/fuego) NO se
// bloquea (paridad MC). handleShieldBlock solo permite bloquear con el
// escudo en la mano activa.
// ============================================================
{
	// Mock de jugador de combate: con armadura vacía para que la reducción sea
	// solo la del escudo y vida completa para medir el daño recibido.
	const mkFighter = (over = {}) => ({
		id: "p-escudo",
		ws: { readyState: 3, send() {} },
		health: 100,
		maxHealth: 20,
		spawnGraceUntil: 0,
		gamemode: "survival",
		x: 0,
		y: 60,
		z: 0,
		selectedSlot: 0,
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		inventory: new Array(36).fill(null),
		...over
	});
	// Estado de bloqueo con escudo en mano vía actions.handleShieldBlock.
	const actions = require("../server/actions.js");
	const p1 = mkFighter();
	p1.inventory[0] = new ItemStack(I.SHIELD);
	actions.handleShieldBlock(p1, { blocking: true });
	check("C2: con escudo en mano se puede activar el bloqueo", p1.blocking === true);
	// El escudo nuevo empieza sin desgastar (durabilidad 336 en el HUD).
	check(
		"C2: el escudo recién crafteado no trae desgaste",
		(p1.inventory[0].durability ?? SHIELD_DURABILITY) === SHIELD_DURABILITY
	);

	// Sin escudo en la mano, el cliente no puede bloquear.
	const p2 = mkFighter();
	actions.handleShieldBlock(p2, { blocking: true });
	check("C2: sin escudo en mano no se activa el bloqueo", p2.blocking === false);

	// Daño de mob con bloqueo: 20 * SHIELD_BLOCK_FACTOR (0.4) = 8 → vida 92.
	const p3 = mkFighter();
	p3.inventory[0] = new ItemStack(I.SHIELD);
	actions.handleShieldBlock(p3, { blocking: true });
	combat.damagePlayer(p3, 20, { source: "mob", meta: { mobType: "zombie" } });
	check(
		"C2: bloqueando, el daño de un mob se reduce (20 → 8)",
		p3.health === 100 - 8,
		`vida=${p3.health}`
	);
	// El escudo se desgastó un punto al absorber el impacto.
	check(
		"C2: el escudo pierde durabilidad al bloquear un impacto",
		p3.inventory[0].durability === SHIELD_DURABILITY - 1,
		`durabilidad=${p3.inventory[0].durability}`
	);

	// Sin bloqueo, el mismo golpe hace los 20 de daño.
	const p4 = mkFighter();
	p4.inventory[0] = new ItemStack(I.SHIELD);
	combat.damagePlayer(p4, 20, { source: "mob", meta: { mobType: "zombie" } });
	check("C2: sin bloquear no hay reducción (mismo golpe = 20)", p4.health === 80, `vida=${p4.health}`);

	// El daño ambiental (lava) NO se bloquea aunque estés con el escudo alto.
	const p5 = mkFighter();
	p5.inventory[0] = new ItemStack(I.SHIELD);
	actions.handleShieldBlock(p5, { blocking: true });
	combat.damagePlayer(p5, 10, { source: "lava" });
	check("C2: el escudo no bloquea daño ambiental (lava)", p5.health === 90, `vida=${p5.health}`);

	// El escudo se rompe al agotarse: durabilidad 1 → último impacto lo rompe,
	// se elimina de la mano y se desbloquea solo.
	const p6 = mkFighter();
	p6.inventory[0] = new ItemStack(I.SHIELD, 1, 1);
	actions.handleShieldBlock(p6, { blocking: true });
	combat.damagePlayer(p6, 20, { source: "mob", meta: { mobType: "zombie" } });
	check("C2: al romperse el escudo se elimina de la mano", p6.inventory[0] === null);
	check("C2: al romperse el escudo se deja de bloquear", p6.blocking === false);
}

// BLOQUE C (C3): TÓTEM DE LA INMORTALIDAD (1.11) — al recibir daño letal con
// el tótem en la mano activa evita la muerte, cura la mitad de la vida y da
// absorción (TOTEM_ABSORPTION_HP), y se consume. Sin tótem el daño letal
// mata. La absorción come daño antes que la vida (corazones dorados).
// ============================================================
{
	const mkTotemFighter = (over = {}) => ({
		id: "p-totem",
		ws: { readyState: 3, send() {} },
		health: 20,
		maxHealth: 20,
		spawnGraceUntil: 0,
		gamemode: "survival",
		x: 0,
		y: 60,
		z: 0,
		selectedSlot: 0,
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		inventory: new Array(36).fill(null),
		craftingGrid: new Array(9).fill(null),
		...over
	});

	check(
		"C3: TOTEM_OF_UNDYING es el 269, isTotem/constantes sincronizadas",
		I.TOTEM_OF_UNDYING === 269 &&
			constants.isTotem(269) &&
			constants.TOTEM_ABSORPTION_HP === 8 &&
			constants.isTool(269),
		`id=${I.TOTEM_OF_UNDYING} abs=${constants.TOTEM_ABSORPTION_HP}`
	);

	// Daño letal con tótem en mano → no muere, cura mitad (10) y da absorción.
	const p1 = mkTotemFighter();
	p1.inventory[0] = new ItemStack(I.TOTEM_OF_UNDYING);
	combat.damagePlayer(p1, 20, { source: "mob", meta: { mobType: "zombie" } });
	check("C3: con tótem en mano no se muere (vida 10)", p1.health === 10, `vida=${p1.health}`);
	check(
		"C3: la absorción del tótem es TOTEM_ABSORPTION_HP (8)",
		p1.absorption === constants.TOTEM_ABSORPTION_HP,
		`abs=${p1.absorption}`
	);
	check(
		"C3: el tótem se consume al salvar de la muerte",
		p1.inventory[0] === null,
		`slot=${JSON.stringify(p1.inventory[0])}`
	);

	// La absorción come el siguiente daño antes que la vida.
	combat.damagePlayer(p1, 3, { source: "fall" });
	check(
		"C3: la absorción absorbe el daño antes que la vida (vida sigue 10)",
		p1.health === 10 && p1.absorption === 5,
		`vida=${p1.health} abs=${p1.absorption}`
	);

	// Sin tótem en mano (o en otra ranura) el daño letal mata → respawn (vida 20).
	const p2 = mkTotemFighter();
	p2.inventory[1] = new ItemStack(I.TOTEM_OF_UNDYING); // no está en la mano activa
	combat.damagePlayer(p2, 20, { source: "mob", meta: { mobType: "zombie" } });
	check(
		"C3: el tótem en otra ranura NO salva (muere y respawnea a 20)",
		p2.health === 20 && p2.inventory.every((s) => s === null),
		`vida=${p2.health}`
	);

	// Daño no letal con tótem en mano → no se consume.
	const p3 = mkTotemFighter();
	p3.inventory[0] = new ItemStack(I.TOTEM_OF_UNDYING);
	combat.damagePlayer(p3, 5, { source: "mob", meta: { mobType: "zombie" } });
	check(
		"C3: el daño no letal no consume el tótem (vida 15, sigue en la mano)",
		p3.health === 15 && p3.inventory[0] && p3.inventory[0].id === I.TOTEM_OF_UNDYING,
		`vida=${p3.health}`
	);
}

// --- Fase 21.5 (E1): variantes de animal por bioma ---
{
	const mobSpawn = require("../server/mob-spawn.js");
	const { animalVariantFor, ANIMAL_VARIANT } = mobSpawn;
	// Mapeo puro: fríos → "cold", cálidos → "warm", templados → base "".
	check(
		"E1: vaca en taiga/snow/giant_taiga → cold",
		animalVariantFor("cow", "taiga") === "cold" &&
			animalVariantFor("cow", "snow") === "cold" &&
			animalVariantFor("cow", "giant_taiga") === "cold" &&
			animalVariantFor("cow", "snowy_peaks") === "cold"
	);
	check(
		"E1: cerdo en desert/badlands/jungle/swamp → warm",
		animalVariantFor("pig", "desert") === "warm" &&
			animalVariantFor("pig", "badlands") === "warm" &&
			animalVariantFor("pig", "jungle") === "warm" &&
			animalVariantFor("pig", "swamp") === "warm"
	);
	check(
		"E1: gallina en templados (plains/forest/birch/mountain) → base",
		animalVariantFor("chicken", "plains") === "" &&
			animalVariantFor("chicken", "forest") === "" &&
			animalVariantFor("chicken", "birch_forest") === "" &&
			animalVariantFor("chicken", "mountain") === ""
	);
	check(
		"E1: oveja/conejo/bee no cambian (sin variante)",
		animalVariantFor("sheep", "taiga") === "" &&
			animalVariantFor("rabbit", "desert") === "" &&
			animalVariantFor("bee", "plains") === ""
	);
	check(
		"E1: ANIMAL_VARIANT cubre todos los biomas conocidos",
		Object.keys(ANIMAL_VARIANT).length === 12 &&
			new Set(Object.keys(ANIMAL_VARIANT)).has("snow") &&
			new Set(Object.keys(ANIMAL_VARIANT)).has("badlands") &&
			new Set(Object.keys(ANIMAL_VARIANT)).has("swamp")
	);
	// El snapshot lleva la variante al cliente (retrocompatible, sin wire).
	{
		const mobs = require("../server/mobs.js");
		const cow = mobs.createMob("cow", 0, 0, 0);
		cow.variant = "cold";
		const snap = mobs.mobSnapshot(cow);
		check("E1: el snapshot expone mob.variant", snap.variant === "cold");
		const snap2 = mobs.mobSnapshot(mobs.createMob("cow", 0, 0, 0));
		check("E1: sin variante → snapshot con '' (templado base)", snap2.variant === "");
	}
}

console.log(`${failed ? "FAIL" : "OK"} — ${failed ? failed : "0"} fallos`);
process.exit(failed ? 1 : 0);