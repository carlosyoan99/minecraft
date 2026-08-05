"use strict";
// ============================================================
// TESTS UNITARIOS DE LAS ANTORCHAS (Fase 6)
// Cubre dos capas:
//   A) Reglas del SERVIDOR (world.js + net.js):
//      1) torchSupported: necesita un vecino sólido (agua y otra
//         antorcha NO dan soporte; el suelo sí)
//      2) cleanUnsupportedTorches: al romper el bloque de apoyo la
//         antorcha se rompe (cae)
//      3) place de antorcha: el handler rechaza colocarla flotando
//         y la acepta con soporte (consume el slot)
//      4) La antorcha no es sólida (isSolidBlock) y es rompible
//      5) Receta de la antorcha (carbón + palo)
//   B) Módulo de LUZ del cliente (public/lighting.js, ESM puro):
//      6) isLightPassable: aire/agua/antorcha pasan; sólidos no
//      7) computeChunkLight: BFS con atenuación, alcance 7, sin
//         luz al otro lado de una pared sólida
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const crafting = require("../server/crafting.js");
const { B, I, isSolidBlock } = require("../server/constants.js");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Forzar generación fresca (sin leer el world/ real del proyecto).
world.setDiskLoader(() => null);
crafting.loadRecipes(); // las tablas de recetas se leen del disco (como unit-red.js)

let fails = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) fails++;
};

// ============================================================
// A) REGLAS DEL SERVIDOR
// ============================================================
const px = 50,
	py = 30,
	pz = 50; // zona de pruebas lejos del spawn de (0,0)
world.setBlock(px, py, pz, B.AIR);
world.setBlock(px + 1, py, pz, B.AIR);
world.setBlock(px, py + 1, pz, B.AIR);
world.setBlock(px, py, pz + 1, B.AIR);
// Sin ningún vecino sólido → sin soporte
world.setBlock(px, py, pz, B.AIR);
check(
	"torchSupported: antorcha aislada en el aire → false",
	world.torchSupported(px, py, pz) === false
);
// Suelo sólido debajo → soporte
world.setBlock(px, py - 1, pz, B.STONE);
check(
	"torchSupported: suelo sólido debajo → true",
	world.torchSupported(px, py, pz) === true
);
world.setBlock(px, py - 1, pz, B.AIR);
// Agua NO da soporte
world.setBlock(px + 1, py, pz, B.WATER);
check(
	"torchSupported: el agua NO da soporte",
	world.torchSupported(px, py, pz) === false
);
world.setBlock(px + 1, py, pz, B.AIR);
// Otra antorcha NO da soporte
world.setBlock(px + 1, py, pz, B.TORCH);
check(
	"torchSupported: otra antorcha NO da soporte",
	world.torchSupported(px, py, pz) === false
);
world.setBlock(px + 1, py, pz, B.AIR);
// Pared lateral sólida → soporte
world.setBlock(px + 1, py, pz, B.PLANKS);
check(
	"torchSupported: pared lateral sólida → true",
	world.torchSupported(px, py, pz) === true
);
world.setBlock(px + 1, py, pz, B.AIR);
// Antorcha sobre un bloque; al romper el bloque cae la antorcha
world.setBlock(px, py, pz, B.TORCH);
world.setBlock(px, py - 1, pz, B.STONE);
check(
	"setup: antorcha con soporte (suelo)",
	world.torchSupported(px, py, pz) === true
);
world.setBlock(px, py - 1, pz, B.AIR); // romper el soporte
world.cleanUnsupportedTorches(px, py - 1, pz);
check(
	"cleanUnsupportedTorches: la antorcha sin soporte cae (→ aire)",
	world.getBlock(px, py, pz) === B.AIR
);

// Antorcha apoyada en pared: romper la pared también la tumba
world.setBlock(px, py, pz, B.TORCH);
world.setBlock(px + 1, py, pz, B.STONE);
check(
	"setup: antorcha con soporte (pared)",
	world.torchSupported(px, py, pz) === true
);
world.setBlock(px + 1, py, pz, B.AIR);
world.cleanUnsupportedTorches(px + 1, py, pz);
check(
	"cleanUnsupportedTorches: romper la pared tumba la antorcha",
	world.getBlock(px, py, pz) === B.AIR
);

// Antorcha con soporte independiente: NO debe caer al romper un vecino
world.setBlock(px, py, pz, B.TORCH);
world.setBlock(px, py - 1, pz, B.STONE); // soporte: el suelo
world.setBlock(px + 1, py, pz, B.STONE); // vecino que se va a romper
world.setBlock(px + 1, py, pz, B.AIR);
world.cleanUnsupportedTorches(px + 1, py, pz);
check(
	"cleanUnsupportedTorches: con otro soporte la antorcha aguanta",
	world.getBlock(px, py, pz) === B.TORCH
);
world.setBlock(px, py, pz, B.AIR);
world.setBlock(px, py - 1, pz, B.AIR);

// 3) Place de antorcha vía el handler (net.js)
{
	const ws = new (class {
		constructor() {
			this.sent = [];
			this.handlers = {};
			this.readyState = 1;
		}
		send(s) {
			this.sent.push(JSON.parse(s));
		}
		on(ev, fn) {
			this.handlers[ev] = fn;
		}
		emit(ev, d) {
			if (this.handlers[ev]) this.handlers[ev](d);
		}
		events(n) {
			return this.sent.filter((m) => m.event === n);
		}
	})();
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	const p = state.players.get(init.data.playerId);

	const bx = Math.floor(p.x + 1),
		by = Math.floor(p.y) + 3,
		bz = Math.floor(p.z);
	// Limpiar el entorno (radio 2) para garantizar un bloque AISLADO en el aire
	// (la altura del jugador tendría el suelo debajo → soporte real).
	for (let dx = -2; dx <= 2; dx++) {
		for (let dy = -2; dy <= 2; dy++) {
			for (let dz = -2; dz <= 2; dz++) {
				world.setBlock(bx + dx, by + dy, bz + dz, B.AIR);
			}
		}
	}
	p.inventory[0] = { id: B.TORCH, count: 4 };
	p.selectedSlot = 0;

	// Flotando en el aire (sin vecino sólido) → rechazado
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({
			event: "block_action",
			data: { action: "place", x: bx, y: by, z: bz, itemId: B.TORCH }
		})
	);
	check(
		"place de antorcha flotando → rechazado",
		world.getBlock(bx, by, bz) === B.AIR && p.inventory[0].count === 4
	);

	// Con suelo sólido debajo → colocada y consume 1
	world.setBlock(bx, by - 1, bz, B.STONE);
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({
			event: "block_action",
			data: { action: "place", x: bx, y: by, z: bz, itemId: B.TORCH }
		})
	);
	check(
		"place de antorcha con soporte → colocada",
		world.getBlock(bx, by, bz) === B.TORCH
	);
	check(
		"place consume 1 del slot (4 → 3)",
		p.inventory[0].count === 3,
		`count=${p.inventory[0].count}`
	);
	world.setBlock(bx, by, bz, B.AIR);
	world.setBlock(bx, by - 1, bz, B.AIR);
	p.inventory.fill(null);
}
check(
	"isSolidBlock(antorcha) === false (se atraviesa)",
	isSolidBlock(B.TORCH) === false
);
check(
	"isSolidBlock(agua) === false (consistente)",
	isSolidBlock(B.WATER) === false
);
check(
	"isSolidBlock(piedra) === true (control)",
	isSolidBlock(B.STONE) === true
);

// 5) Receta de la antorcha (carbón + palo)
{
	const grid = new Array(9).fill(null);
	grid[4] = { id: I.COAL, count: 1 };
	grid[7] = { id: I.STICK, count: 1 }; // patrón ["#","I"]
	const recipe = crafting.matchRecipe(grid);
	check(
		"receta de la antorcha: carbón + palo → 4 antorchas",
		recipe && recipe.result.id === B.TORCH && recipe.result.count === 4,
		recipe ? `id=${recipe.result.id} x${recipe.result.count}` : "sin receta"
	);
}

// ============================================================
// B) LUZ DEL CLIENTE (public/lighting.js)
// ============================================================
(async () => {
	const src = path.join(__dirname, "..", "public", "lighting.js");
	const tmp = path.join(os.tmpdir(), `unit-luz-${process.pid}.mjs`);
	fs.copyFileSync(src, tmp);
	const luz = await import(`file://${tmp}`);
	fs.unlinkSync(tmp);
	const { isLightPassable, computeChunkLight, LIGHT_RADIUS, LIGHT_ATTEN } = luz;

	// 6) isLightPassable
	check("luz: aire pasa la luz", isLightPassable(0) === true);
	check("luz: agua pasa la luz", isLightPassable(B.WATER) === true);
	check("luz: otra antorcha pasa la luz", isLightPassable(B.TORCH) === true);
	check("luz: piedra bloquea la luz", isLightPassable(B.STONE) === false);
	check("luz: tierra bloquea la luz", isLightPassable(B.DIRT) === false);

	// 7) computeChunkLight: BFS con atenuación y oclusión
	const CS = 16,
		WH = 64;
	const chunk = new Uint8Array(CS * WH * CS); // todo aire
	const blockAt = (wx, wy, wz) => {
		if (wy < 0 || wy >= WH) return B.STONE; // fuera de altura: sólido (cierra el mundo)
		const cx = Math.floor(wx / CS),
			cz = Math.floor(wz / CS);
		if (cx !== 0 || cz !== 0) return B.STONE; // fuera del chunk: sólido (borde cerrado)
		const x = ((wx % CS) + CS) % CS,
			z = ((wz % CS) + CS) % CS;
		return chunk[(wy * CS + z) * CS + x];
	};
	const torches = [[8, 30, 8]]; // antorcha en el centro del chunk 0,0

	const out = computeChunkLight(0, 0, CS, WH, blockAt, torches);
	check("luz: el array cubre todo el chunk", out.length === CS * WH * CS);

	// Celda de la antorcha: luz máxima (1)
	const lightAt = (wx, wy, wz) => out[(wy * CS + (wz % CS)) * CS + (wx % CS)];
	check(
		"luz: la celda de la antorcha está a 1.0",
		Math.abs(out[(30 * CS + 8) * CS + 8] - 1) < 1e-6,
		`v=${out[(30 * CS + 8) * CS + 8].toFixed(4)}`
	);

	// A 1 bloque de distancia: atenuada pero presente
	check(
		"luz: 1 bloque adyacente atenuada (≈0.8)",
		Math.abs(lightAt(9, 30, 8) - LIGHT_ATTEN) < 0.02,
		`v=${lightAt(9, 30, 8).toFixed(4)}`
	);

	// A LIGHT_RADIUS bloques: llega un resto mínimo (el alcance)
	check(
		"luz: a LIGHT_RADIUS bloques llega un resto > 0",
		lightAt(8 + LIGHT_RADIUS, 30, 8) > 0,
		`v=${lightAt(8 + LIGHT_RADIUS, 30, 8).toFixed(4)}`
	);

	// Más allá del radio: cero
	check(
		"luz: más allá del radio no hay luz",
		lightAt(8 + LIGHT_RADIUS + 1, 30, 8) === 0
	);

	// Oclusión: una PARED COMPLETA (todo el plano x=10, todas las alturas y z)
	// entre la antorcha y la celda → sin luz al otro lado. La BFS es 6-direccional
	// y se difracta alrededor de obstáculos pequeños (una pared de 1 celda se
	// rodearía por arriba), así que la pared debe cortar el chunk de arriba abajo.
	const out2 = computeChunkLight(
		0,
		0,
		CS,
		WH,
		(wx, wy, wz) => {
			if (wy < 0 || wy >= WH) return B.STONE;
			const cx = Math.floor(wx / CS),
				cz = Math.floor(wz / CS);
			if (cx !== 0 || cz !== 0) return B.STONE;
			if (wx === 10) return B.STONE; // muro completo en x=10 (toda y, toda z)
			const x = ((wx % CS) + CS) % CS,
				z = ((wz % CS) + CS) % CS;
			return chunk[(wy * CS + z) * CS + x];
		},
		torches
	);
	const idx2 = (30 * CS + 8) * CS + 12; // celda x=12 (al otro lado del muro en x=10)
	check(
		"luz: una pared sólida bloquea la luz",
		out2[idx2] === 0,
		`v=${out2[idx2].toFixed(4)}`
	);

	// Una antorcha FUERA del chunk no hace trabajo en él (pero sí la caja de radio)
	const out3 = computeChunkLight(0, 0, CS, WH, blockAt, [
		[8, 30, 8],
		[300, 30, 300]
	]);
	check(
		"luz: antorcha lejana se ignora (mismo resultado)",
		out3[(30 * CS + 8) * CS + 8] === 1
	);
	process.exit(fails ? 1 : 0);
})();
