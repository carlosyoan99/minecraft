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
const { B, I, FISHING_ROD_DURABILITY, isFishingRod } = constants;

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

console.log(`${failed ? "FAIL" : "OK"} — ${failed ? failed : "0"} fallos`);
process.exit(failed ? 1 : 0);