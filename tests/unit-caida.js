"use strict";
// ============================================================
// TESTS UNITARIOS DE DAÑO POR CAÍDA Y CAÍDA DEL MUNDO (Fase 7)
// Cubre el servidor: `fallDamage` (fórmula estilo Minecraft: los primeros
// 3 bloques no dañan, 1 HP por bloque a partir de ahí), `applyFallDamage`
// (infiere el suelo desde el mundo en cada move: registra el pico de la
// caída desde el último suelo firme y aplica el daño al aterrizar; el agua
// lo anula) y el void (por debajo de VOID_Y el jugador muere y reaparece
// según gamemode).
// ============================================================
const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const {
	B,
	I,
	EYE_HEIGHT,
	FALL_DAMAGE_FREE_BLOCKS,
	VOID_Y,
	ARMOR_DURABILITY,
	GRAVITY
} = require("../server/constants.js");

world.setDiskLoader(() => null); // sin I/O de disco en los tests

let fails = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) fails++;
};

class FakeWS {
	constructor() {
		this.sent = [];
		this.handlers = {};
		this.readyState = 1;
	}
	send(str) {
		this.sent.push(JSON.parse(str));
	}
	on(ev, fn) {
		this.handlers[ev] = fn;
	}
	emit(ev, data) {
		if (this.handlers[ev]) this.handlers[ev](data);
	}
	events(name) {
		return this.sent.filter((m) => m.event === name);
	}
}

const broadcasts = [];
playerHelpers.setBroadcastHandler((event, data) =>
	broadcasts.push({ event, data })
);

function connect() {
	const ws = new FakeWS();
	state.players.clear();
	net.handleConnection(ws);
	const init = ws.events("init")[0];
	return { ws, init, player: state.players.get(init.data.playerId) };
}

// ============================================================
// FÓRMULA DE DAÑO (fallDamage)
// ============================================================
check(
	`caída de ${FALL_DAMAGE_FREE_BLOCKS} bloques o menos → sin daño`,
	playerHelpers.fallDamage(0) === 0 &&
		playerHelpers.fallDamage(2) === 0 &&
		playerHelpers.fallDamage(3) === 0 &&
		playerHelpers.fallDamage(3.9) === 0
);
check(
	"1 HP por bloque a partir del umbral",
	playerHelpers.fallDamage(4) === 1 && playerHelpers.fallDamage(10) === 7
);
check(
	"23 bloques → 20 de daño (muerte segura)",
	playerHelpers.fallDamage(23) === 20
);
check("nunca negativo", playerHelpers.fallDamage(1) === 0);

// ============================================================
// CAÍDA REAL VÍA MOVES: el servidor infiere el suelo y aplica el daño
// (Fase 8, anti-cheat: los moves de ascenso/descenso se miden con la física
// real — un move de 1 bloque en 50ms sería "volar", ya no es legítimo, así
// que la caída se simula en pasos de 0.5 bloques con el pico configurado
// como hacen los tests de armadura/agua).
// ============================================================
{
	const { ws, player: p } = connect();
	// Columna controlada: piso de piedra en y=5 y aire de 6..25 (sin árboles).
	const PX = 5,
		PZ = 5;
	for (let y = 5; y <= 25; y++)
		world.setBlock(PX, y, PZ, y === 5 ? B.STONE : B.AIR);
	p.x = PX + 0.5;
	p.z = PZ + 0.5;
	const landing = 5 + EYE_HEIGHT + 1; // ojo estando de pie sobre el piso (y=5)
	const move = (y) =>
		ws.emit(
			"message",
			JSON.stringify({
				event: "move",
				data: { x: p.x, y, z: p.z, yaw: 0, pitch: 0 }
			})
		);
	// De pie sobre el piso (registra el suelo firme)…
	p.y = landing;
	move(landing);
	// …el pico de la caída (subir una colina de 11 bloques saltando; el pico
	// queda en fallFromY como en el test de armadura)…
	p.fallFromY = landing + 11;
	p.lastGroundY = landing;
	p.y = landing + 11;
	// …y caer de vuelta al piso en pasos de 0.5 bloques (física plausible: el
	// ascenso de 1 bloque por move ya no es legítimo con el anti-cheat): 11
	// bloques → 8 de daño (health 20 → 12).
	ws.sent.length = 0;
	for (let i = 1; i <= 22; i++) move(landing + 11 - i * 0.5);
	check(
		"caída de 11 bloques → 8 de daño",
		p.health === 12,
		`health=${p.health}`
	);
	check("caída liquidada al aterrizar", p.fallFromY === null);
	check(
		"el cliente recibe health_update con la salud resultante",
		(() => {
			const hs = ws.events("health_update");
			return hs.length > 0 && hs[hs.length - 1].data.health === 12;
		})()
	);
	// Saltos cortos no dañan: caer 2 bloques en pasos de 0.5 → sin pérdida.
	p.health = 20;
	p.fallFromY = landing + 2;
	p.lastGroundY = landing;
	p.y = landing + 2;
	for (let i = 1; i <= 4; i++) move(landing + 2 - i * 0.5);
	check(
		"caída de 2 bloques (salto) → sin daño",
		p.health === 20,
		`health=${p.health}`
	);
}

// ============================================================
// DAÑO POR VELOCIDAD VERTICAL INFERIDA (Fase 8, mejora anti-cheat)
// El daño por caída usa también la velocidad de descenso observada
// (h = v²/(2·GRAVITY)): si el jugador aterriza con una velocidad que
// corresponde a una caída mayor que la altura posicional, se aplica la
// mayor. Un descenso a 20 bloques/s equivale a una caída de ~11 bloques.
// ============================================================
{
	const { player: p } = connect();
	// Piso de piedra en (6,5) y columna limpia arriba.
	world.setBlock(6, 5, 6, B.STONE);
	for (let y = 6; y <= 20; y++) world.setBlock(6, y, 6, B.AIR);
	p.x = 6.5;
	p.z = 6.5;
	const landing = 5 + EYE_HEIGHT + 1;
	// El jugador "cae" con la posición casi quieta (altura posicional 0) pero
	// con una velocidad de descenso alta: la velocidad revela la caída real.
	p.fallFromY = landing;
	p.lastGroundY = landing;
	p.y = landing;
	p.fallVy = -20; // v = 20 bloques/s de descenso → h = v²/(2·g) ≈ 11.1 bloques
	p.health = 20;
	playerHelpers.applyFallDamage(p);
	check(
		"velocidad de descenso alta → daño por velocidad inferida",
		p.health <= 20 - (11 - FALL_DAMAGE_FREE_BLOCKS),
		`health=${p.health}`
	);
	check("fallVy se liquida al aterrizar", p.fallVy === 0);
}

// ============================================================
// CAÍDA LENTA: la velocidad de descenso legítima NO añade daño extra
// (en caídas reales la velocidad coincide con la altura posicional).
// ============================================================
{
	const { player: p } = connect();
	world.setBlock(7, 5, 7, B.STONE);
	for (let y = 6; y <= 20; y++) world.setBlock(7, y, 7, B.AIR);
	p.x = 7.5;
	p.z = 7.5;
	const landing = 5 + EYE_HEIGHT + 1;
	p.fallFromY = landing + 10;
	p.lastGroundY = landing;
	p.y = landing;
	// Velocidad de descenso consistente con 10 bloques: v = sqrt(2·g·10) ≈ 19.
	// h = v²/(2·g) = 10 → no supera la altura posicional (mismo daño: 7).
	p.fallVy = -Math.sqrt(2 * GRAVITY * 10);
	p.health = 20;
	playerHelpers.applyFallDamage(p);
	check(
		"velocidad legítima → el daño es el posicional (10 bloques → 7)",
		p.health === 20 - (10 - FALL_DAMAGE_FREE_BLOCKS),
		`health=${p.health}`
	);
}

// ============================================================
// EL AGUA ANULA EL DAÑO POR CAÍDA
// ============================================================
{
	const { player: p } = connect();
	// Charcón: piso de piedra en y=8 y agua en y=9..10.
	world.setBlock(9, 8, 9, B.STONE);
	world.setBlock(9, 9, 9, B.WATER);
	world.setBlock(9, 10, 9, B.WATER);
	p.x = 9.5;
	p.z = 9.5;
	// Cayó 15 bloques y aterriza con los pies en el agua (y=9).
	p.fallFromY = 15;
	p.y = 9 + EYE_HEIGHT; // ojo: los pies quedan en el bloque de agua
	playerHelpers.applyFallDamage(p);
	check("caer al agua → sin daño", p.health === 20, `health=${p.health}`);
	check("caer al agua → caída liquidada", p.fallFromY === null);
}

// ============================================================
// LA ARMADURA REDUCE EL DAÑO POR CAÍDA (pasa por damagePlayer)
// ============================================================
{
	const { player: p } = connect();
	p.armor.chestplate = {
		id: I.IRON_CHESTPLATE,
		count: 1,
		durability: ARMOR_DURABILITY[I.IRON_CHESTPLATE]
	};
	// Piso en (12,5) y columna limpia arriba: caída de 10 bloques → 7 de daño
	// bruto → pechera de hierro (6 puntos = 24%, Fase 13 paridad B4) →
	// round(7 × 0.76) = 5 (health 20 → 15).
	world.setBlock(12, 5, 12, B.STONE);
	for (let y = 6; y <= 20; y++) world.setBlock(12, y, 12, B.AIR);
	p.x = 12.5;
	p.z = 12.5;
	const landing = 5 + EYE_HEIGHT + 1;
	p.fallFromY = landing + 10;
	p.y = landing;
	playerHelpers.applyFallDamage(p);
	check(
		"la armadura reduce el daño por caída (10 bloques → 5 con pechera de hierro)",
		p.health === 15,
		`health=${p.health}`
	);
	check(
		"la pechera se desgasta al recibir el golpe",
		p.armor.chestplate.durability === ARMOR_DURABILITY[I.IRON_CHESTPLATE] - 1,
		`dur=${p.armor.chestplate.durability}`
	);
}

// ============================================================
// CAER DEL MUNDO (VOID): MUERTE Y REAPARICIÓN SEGÚN GAMEMODE
// ============================================================
{
	const { ws, player: p } = connect();
	playerHelpers.addToInventory(p, I.STICK); // survival: se perderá
	p.x = 0.5;
	p.y = VOID_Y - 1; // por debajo del mundo
	p.z = 0.5;
	ws.sent.length = 0;
	broadcasts.length = 0;
	ws.emit(
		"message",
		JSON.stringify({
			event: "move",
			data: { x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0 }
		})
	);
	check("void → respawn (teleport)", ws.events("teleport").length === 1);
	check("void → reaparece por encima del mundo", p.y > VOID_Y, `y=${p.y}`);
	check("void → salud restaurada", p.health === 20);
	check(
		"void → player_die con lostInventory (survival)",
		broadcasts.some(
			(b) =>
				b.event === "player_die" &&
				b.data.id === p.id &&
				b.data.lostInventory === true
		)
	);
	check(
		"void en survival → el inventario se pierde",
		p.inventory.every((s) => s === null)
	);
}

{
	const { ws, player: p } = connect();
	p.gamemode = "creative"; // el void no deja a creative cayendo para siempre
	playerHelpers.addToInventory(p, I.DIAMOND);
	p.x = 0.5;
	p.y = VOID_Y - 1;
	p.z = 0.5;
	ws.sent.length = 0;
	ws.emit(
		"message",
		JSON.stringify({
			event: "move",
			data: { x: p.x, y: p.y, z: p.z, yaw: 0, pitch: 0 }
		})
	);
	check(
		"void en creative → reaparece",
		p.y > VOID_Y && ws.events("teleport").length === 1,
		`y=${p.y}`
	);
	check(
		"void en creative → conserva el inventario",
		p.inventory.some((s) => s && s.id === I.DIAMOND)
	);
	check(
		"void en creative → player_die sin lostInventory",
		broadcasts.some(
			(b) =>
				b.event === "player_die" &&
				b.data.id === p.id &&
				b.data.lostInventory === false
		)
	);
}

process.exit(fails === 0 ? 0 : 1);
