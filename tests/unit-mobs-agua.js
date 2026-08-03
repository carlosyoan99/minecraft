"use strict";
// Test unitario: los mobs se hunden en el agua y descansan en el fondo del
// lago, en vez de "caminar" sobre la superficie (fix de la limitación
// conocida señalada en la auditoría de la Fase 4).
const mobs = require("../server/mobs.js");
const { isSolidBlock, B } = require("../server/constants.js");

let ok = 0,
	fail = 0;
const check = (n, c, x) => {
	c ? ok++ : (fail++, console.log("FAIL: " + n + " " + (x || "")));
};

// Mock de world.getBlock controlable por el test: recibe (wx, wy, wz).
let blockAt = null;
require("../server/world.js").getBlock = (wx, wy, wz) => blockAt(wy);

// Repetir settleOnGround hasta estabilizar (máx. 2000 pasos de 0.04 bloques).
function settleUntilStable(mob) {
	let prev = mob.y;
	for (let i = 0; i < 2000; i++) {
		mob.settleOnGround();
		if (mob.y === prev) break;
		prev = mob.y;
	}
	return mob.y;
}

// --- Caso 1: lago (fondo sólido en y<=2, agua en y=3..4, aire arriba) ---
// Espejo de la generación: LAKE_FLOOR=2 (arena), agua hasta SEA_LEVEL=5.
blockAt = (wy) => (wy <= 2 ? 3 : wy <= 4 ? B.WATER : B.AIR);

// 1a. Mob en la superficie del agua (y=5): DEBE hundirse hasta el fondo (~y=3).
const surf = new mobs.Mob("cow", 0, 5, 0);
const surfY = settleUntilStable(surf);
check(
	"mob sobre la superficie del agua se hunde al fondo (y≈3, no se queda en y=5)",
	surfY < 3.5,
	"y=" + surfY
);

// 1b. Mob ya en el fondo (y≈3.05, cabeza en agua): no debe subir a la superficie.
const fondo = new mobs.Mob("pig", 0, 3.05, 0);
const fondoY = settleUntilStable(fondo);
check(
	"mob en el fondo del lago reposa (no sube con agua en la cabeza)",
	fondoY < 3.5,
	"y=" + fondoY
);

// 1c. Mob cayendo desde el aire sobre un lago: aterriza en el fondo, no en la superficie.
const cayendo = new mobs.Mob("sheep", 0, 12, 0);
const cayendoY = settleUntilStable(cayendo);
check(
	"mob que cae en un lago aterriza en el fondo (no flota en la superficie)",
	cayendoY < 3.5 && cayendoY > 2.5,
	"y=" + cayendoY
);

// --- Caso 2: tierra firme (suelo sólido en y<=4, aire encima) ---
blockAt = (wy) => (wy <= 4 ? 3 : B.AIR);

// 2a. Mob de pie sobre tierra: no se hunde (el comportamiento original se mantiene).
const tierra = new mobs.Mob("zombie", 0, 5, 0);
const tierraY = settleUntilStable(tierra);
check(
	"mob sobre tierra firme se queda donde está (sin regresión)",
	tierraY === 5,
	"y=" + tierraY
);

// 2b. Mob cayendo sobre tierra: aterriza sobre el suelo (y≈5).
const caidaTierra = new mobs.Mob("skeleton", 0, 10, 0);
const caidaTierraY = settleUntilStable(caidaTierra);
check(
	"mob que cae sobre tierra aterriza en el suelo",
	caidaTierraY < 6 && caidaTierraY >= 5,
	"y=" + caidaTierraY
);

// --- Caso 3: atascado en un bloque sólido (head sólido) sube ---
blockAt = () => 3; // todo sólido
const atascado = new mobs.Mob("creeper", 0, 5, 0);
const atascadoY = settleUntilStable(atascado);
check(
	"mob atascado en bloque sólido sube hasta liberarse",
	atascadoY > 5,
	"y=" + atascadoY
);

// --- Sanidad: el agua no es sólida (base del fix) ---
check(
	"isSolidBlock(WATER) === false (el agua no es sólida)",
	isSolidBlock(B.WATER) === false
);
check("isSolidBlock(AIR) === false", isSolidBlock(B.AIR) === false);
check("isSolidBlock(3=roca) === true", isSolidBlock(3) === true);

console.log(ok + " OK, " + fail + " FAIL");
process.exit(fail ? 1 : 0);
