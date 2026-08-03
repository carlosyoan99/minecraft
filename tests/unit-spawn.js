"use strict";
// Test unitario del punto de aparición del jugador (Fase 4): si la columna
// pedida es un lago, findSpawn busca la columna firme más cercana para que el
// jugador no aparezca nadando (getHeight no es lake-aware).
const world = require("../server/world.js");

let ok = 0,
	fail = 0;
const check = (n, c, x) => {
	c ? ok++ : (fail++, console.log("FAIL: " + n + " " + (x || "")));
};

// --- 1) findSpawn(0,0): el punto devuelto nunca está sobre un lago ---
const s = world.findSpawn(0, 0);
check(
	"findSpawn(0,0) no cae en un lago",
	!world.isLake(Math.floor(s.x), Math.floor(s.z)),
	`(${s.x},${s.z})`
);
check(
	"findSpawn(0,0) y = getHeight(columna)+2",
	s.y === world.getHeight(Math.floor(s.x), Math.floor(s.z)) + 2,
	"y=" + s.y
);
check(
	"findSpawn(0,0) x/z centrados en la columna (+0.5)",
	s.x === Math.floor(s.x) + 0.5 && s.z === Math.floor(s.z) + 0.5
);

// --- 2) Para TODAS las columnas de un área: nunca un lago ---
// El mundo es determinista (semilla fija), así que la comprobación es exacta.
let lakesHallados = 0;
for (let dx = -20; dx <= 20; dx++) {
	for (let dz = -20; dz <= 20; dz++) {
		if (world.isLake(dx, dz)) lakesHallados++;
		const p = world.findSpawn(dx, dz);
		check(
			`findSpawn(${dx},${dz}) no cae en un lago`,
			!world.isLake(Math.floor(p.x), Math.floor(p.z)),
			`→ (${p.x},${p.z})`
		);
		check(
			`findSpawn(${dx},${dz}) y correcto`,
			p.y === world.getHeight(Math.floor(p.x), Math.floor(p.z)) + 2,
			"y=" + p.y
		);
	}
}
check(
	"hay lagos en el área probada (la premisa del test es real)",
	lakesHallados > 0,
	`${lakesHallados} lagos`
);

// --- 3) Determinismo: misma entrada → misma salida ---
const a = world.findSpawn(3, -7),
	b = world.findSpawn(3, -7);
check("findSpawn es determinista", a.x === b.x && a.y === b.y && a.z === b.z);

// --- 4) Una columna firme se mantiene en su sitio (sin regresión) ---
// Buscamos una columna que NO sea lago y comprobamos que findSpawn no la mueve.
let firme = null;
for (let dx = -20; dx <= 20 && !firme; dx++) {
	for (let dz = -20; dz <= 20 && !firme; dz++) {
		if (!world.isLake(dx, dz)) firme = { x: dx, z: dz };
	}
}
const f = world.findSpawn(firme.x, firme.z);
check(
	"columna firme → se usa tal cual",
	Math.floor(f.x) === firme.x && Math.floor(f.z) === firme.z
);

console.log(ok + " OK, " + fail + " FAIL");
process.exit(fail ? 1 : 0);
