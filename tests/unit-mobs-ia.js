"use strict";
// ============================================================
// TESTS UNITARIOS DE IA DE MOBS (Fase 0)
// Máquina de estados (idle/chase/flee), ataque con cooldown,
// creeper (explosión), skeleton (mantiene distancia), enderman
// (teletransporte), pasivos (huyen), spawnMobs y mobSnapshot.
// ============================================================
const mobs = require("../server/mobs.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const {
	HOSTILE,
	BURNS_IN_SUN,
	MOB_XP,
	TICK_MS,
	B
} = require("../server/constants.js");

// Suelo siempre sólido para no depender del mundo real (como unit-cria).
// (El mob queda "bajo techo" con este mock: no arde con el sol — los tests
// de quema re-mockean getBlock por altura.)
world.getBlock = () => 3;
world.isLake = () => false; // sin lagos en los tests de spawn (posición fija)
let setBlockCalls = 0;
world.setBlock = () => {
	setBlockCalls++;
	return true;
};

let fails = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) fails++;
};

const CLOSED = 3; // ws que no envía nada (como unit-hambre)
function mkPlayer(over = {}) {
	return {
		id: `p${Math.random()}`,
		ws: { readyState: CLOSED, send() {} },
		health: 20,
		x: 0,
		y: 10,
		z: 0,
		...over
	};
}
function resetPlayers() {
	state.players.clear();
}

// --- 1) Constructor: salud por tipo y estado inicial ---
check("zombie 20 HP", new mobs.Mob("zombie", 0, 0, 0).health === 20);
check(
	"spider 12 HP (frágil pero rápida)",
	new mobs.Mob("spider", 0, 0, 0).health === 12
);
check("wolf 20 HP", new mobs.Mob("wolf", 0, 0, 0).health === 20);
check("conejo 10 HP (pasivo)", new mobs.Mob("rabbit", 0, 0, 0).health === 10);
check(
	"vaca 10 HP (pasivo por defecto)",
	new mobs.Mob("cow", 0, 0, 0).health === 10
);
check(
	"HOSTILE incluye los hostiles (zombie, spider, wolf...)",
	["zombie", "creeper", "skeleton", "enderman", "spider", "wolf"].every((t) =>
		HOSTILE.has(t)
	)
);
const m = new mobs.Mob("cow", 0, 0, 0);
check(
	"estado inicial idle + alive + no bebé",
	m.state === "idle" && m.alive === true && m.isBaby === false
);

// --- 2) wander: se mueve hacia el target ---
{
	const a = new mobs.Mob("cow", 0, 10, 0);
	a.targetX = 4;
	a.targetZ = 0;
	const rnd = Math.random;
	Math.random = () => 0.5; // 0.5 < 0.01 es falso → no cambia el target
	a.wander();
	Math.random = rnd;
	check("wander avanza hacia el target", a.x > 0, `x=${a.x}`);
}

// --- 3) findNearestPlayer: elige al jugador más cercano ---
{
	resetPlayers();
	const lejos = mkPlayer({ id: "lejos", x: 50, z: 50 });
	const cerca = mkPlayer({ id: "cerca", x: 1, z: 0 });
	state.players.set(lejos.id, lejos);
	state.players.set(cerca.id, cerca);
	const mob = new mobs.Mob("zombie", 0, 10, 0);
	const { nearest, dist } = mob.findNearestPlayer();
	check(
		"findNearestPlayer elige al más cercano",
		nearest.id === "cerca",
		`id=${nearest?.id}`
	);
	check("findNearestPlayer devuelve la distancia", dist < 2, `dist=${dist}`);
	resetPlayers();
}

// --- 4) zombie: chase de noche, ataque con cooldown, idle de día y lejos ---
{
	resetPlayers();
	const p = mkPlayer({ x: 1, y: 10, z: 0 });
	state.players.set(p.id, p);
	const z = new mobs.Mob("zombie", 0, 10, 0);
	z.tick(true); // noche
	check("zombie chases de noche", z.state === "chase", `state=${z.state}`);
	z.x = 0.8; // acercarlo al alcance de ataque (< 1.6)
	z.tick(true);
	check(
		"zombie ataca al jugador cerca (health 18)",
		p.health === 18,
		`health=${p.health}`
	);
	const cd = z.attackCooldown;
	z.tick(true);
	check(
		"cooldown: no ataca dos ticks seguidos",
		z.attackCooldown === cd && p.health === 18
	);
	const z2 = new mobs.Mob("zombie", 100, 10, 100);
	z2.tick(false); // de día y lejos
	check("zombie idle de día y lejos", z2.state === "idle", `state=${z2.state}`);
	resetPlayers();
}

// --- 5) creeper: explota cerca del jugador ---
{
	resetPlayers();
	const p = mkPlayer({ id: "pc", x: 0.5, y: 10, z: 0.5 });
	state.players.set(p.id, p);
	const c = new mobs.Mob("creeper", 0, 10, 0);
	const rnd = Math.random;
	Math.random = () => 0; // 0 < 0.4 → siempre rompe bloques (determinista)
	setBlockCalls = 0;
	c.tick(true);
	Math.random = rnd;
	check("creeper explota cerca del jugador (alive=false)", c.alive === false);
	check(
		"explosión daña al jugador (10)",
		p.health === 10,
		`health=${p.health}`
	);
	check(
		"explosión elimina bloques (setBlock llamado)",
		setBlockCalls > 0,
		`calls=${setBlockCalls}`
	);
	resetPlayers();
}

// --- 5b) creeper: la explosión respeta bedrock/agua/lava y cofres con
// contenido (Fase 7, auditoría) — el mundo se mockea por posición ---
{
	resetPlayers();
	const p = mkPlayer({ id: "pc2", x: 0.5, y: 10, z: 0.5 });
	state.players.set(p.id, p);
	// Mapa de bloques por posición: todo piedra salvo los protegidos.
	const blocks = new Map();
	const KEY = (x, y, z) => `${x},${y},${z}`;
	blocks.set(KEY(0, 10, 0), B.BEDROCK);
	blocks.set(KEY(1, 10, 0), B.WATER);
	blocks.set(KEY(-1, 10, 0), B.LAVA);
	blocks.set(KEY(2, 10, 0), B.CHEST); // con contenido
	blocks.set(KEY(-2, 10, 0), B.CHEST); // vacío
	const realGet = world.getBlock;
	const realSet = world.setBlock;
	world.getBlock = (x, y, z) => blocks.get(KEY(x, y, z)) ?? 3;
	const broken = [];
	world.setBlock = (x, y, z) => {
		broken.push(KEY(x, y, z));
		return true;
	};
	// Estado del cofre CON contenido (2,10,0); el vacío (-2,10,0) no tiene
	// entrada (o solo nulls) y debe romperse limpiando su estado.
	state.chests.set(KEY(2, 10, 0), [{ id: 100, count: 3 }]);
	state.chests.set(KEY(-2, 10, 0), new Array(27).fill(null));
	const rnd = Math.random;
	Math.random = () => 0; // 0 < 0.4 → intenta romper todos los bloques
	const c2 = new mobs.Mob("creeper", 0, 10, 0);
	c2.tick(true);
	Math.random = rnd;
	check("explosión NO rompe bedrock", !broken.includes(KEY(0, 10, 0)));
	check("explosión NO rompe agua", !broken.includes(KEY(1, 10, 0)));
	check("explosión NO rompe lava", !broken.includes(KEY(-1, 10, 0)));
	check(
		"explosión NO rompe cofre CON contenido (estado intacto)",
		!broken.includes(KEY(2, 10, 0)) && state.chests.has(KEY(2, 10, 0))
	);
	check(
		"explosión SÍ rompe cofre vacío y limpia su estado",
		broken.includes(KEY(-2, 10, 0)) && !state.chests.has(KEY(-2, 10, 0))
	);
	check(
		"explosión sigue rompiendo bloques normales (piedra)",
		broken.includes(KEY(0, 11, 0))
	);
	world.getBlock = realGet;
	world.setBlock = realSet;
	state.chests.delete(KEY(2, 10, 0));
	state.chests.delete(KEY(-2, 10, 0));
	resetPlayers();
}

// --- 6) skeleton: mantiene distancia y ataca a distancia ---
{
	resetPlayers();
	const p = mkPlayer({ id: "ps", x: 3, y: 10, z: 0 });
	state.players.set(p.id, p);
	const sk = new mobs.Mob("skeleton", 0, 10, 0);
	sk.tick(true);
	check(
		"skeleton se aleja cuando el jugador está cerca (dist < 4)",
		sk.x < 0,
		`x=${sk.x}`
	);
	check(
		"skeleton ataca a distancia (health 18)",
		p.health === 18,
		`health=${p.health}`
	);
	resetPlayers();
}

// --- 7) enderman: teletransporta cerca del jugador ---
{
	resetPlayers();
	const p = mkPlayer({ id: "pe", x: 5, y: 10, z: 0 });
	state.players.set(p.id, p);
	const e = new mobs.Mob("enderman", 0, 10, 0);
	const rnd = Math.random;
	Math.random = () => 0; // garantiza la rama de teletransporte
	e.tick(true);
	Math.random = rnd;
	check(
		"enderman teletransporta cerca del jugador",
		Math.hypot(e.x - 5, e.z) < 6,
		`x=${e.x} z=${e.z}`
	);
	check(
		"enderman en estado chase tras teletransporte",
		e.state === "chase",
		`state=${e.state}`
	);
	resetPlayers();
}

// --- 8) spider y wolf: hostiles que chases de noche ---
{
	resetPlayers();
	const p = mkPlayer({ id: "pa", x: 2, y: 10, z: 0 });
	state.players.set(p.id, p);
	const sp = new mobs.Mob("spider", 0, 10, 0);
	sp.tick(true);
	check("spider chases de noche", sp.state === "chase", `state=${sp.state}`);
	const w = new mobs.Mob("wolf", 0, 10, 0);
	w.tick(true);
	check("wolf chases de noche", w.state === "chase", `state=${w.state}`);
	resetPlayers();
}

// --- 9) pasivos: huyen del jugador cercano e idle si está lejos ---
{
	resetPlayers();
	const p = mkPlayer({ id: "pb", x: 1, y: 10, z: 0 });
	state.players.set(p.id, p);
	const v = new mobs.Mob("cow", 0, 10, 0);
	v.tick(true);
	check(
		"vaca huye cuando el jugador está cerca",
		v.state === "flee",
		`state=${v.state}`
	);
	check("vaca se aleja del jugador", v.x < 0, `x=${v.x}`);
	const v2 = new mobs.Mob("cow", 50, 10, 50);
	v2.tick(true);
	check(
		"vaca idle con jugador lejos",
		v2.state === "idle",
		`state=${v2.state}`
	);
	resetPlayers();
}

// --- 10) attack: respeta el cooldown de la instancia ---
{
	resetPlayers();
	const p = mkPlayer({ id: "patk", x: 0, y: 10, z: 0 });
	state.players.set(p.id, p);
	const m2 = new mobs.Mob("zombie", 0.5, 10, 0);
	m2.attack(p, 2, 1000);
	const cd = m2.attackCooldown;
	check("attack aplica el daño y marca cooldown", p.health === 18 && cd > 0);
	m2.attack(p, 2, 1000);
	check("attack no vuelve a golpear dentro del cooldown", p.health === 18);
	resetPlayers();
}

// --- 11) spawnMobs: requiere jugadores y respeta el tope de 30 ---
{
	resetPlayers();
	state.mobs = [];
	mobs.spawnMobs(true);
	check("spawnMobs sin jugadores no genera nada", state.mobs.length === 0);
	state.players.set("x", mkPlayer({ id: "x", x: 0, y: 10, z: 0 }));
	// El spawn elige entre chunks YA cargados: cargar un área (como hace el
	// servidor al conectar, ensureChunksAround) para que haya mapa cargado.
	world.setDiskLoader(() => null);
	world.ensureChunksAround(0, 0, 1);
	const rnd = Math.random;
	Math.random = () => 0.5; // cae en el chunk 0,0, tipo = pasivos[2]
	mobs.spawnMobs(true);
	Math.random = rnd;
	check(
		"spawnMobs genera mobs con jugador",
		state.mobs.length >= 1,
		`n=${state.mobs.length}`
	);
	state.mobs = [];
	for (let i = 0; i < 31; i++)
		state.mobs.push(new mobs.Mob("zombie", i, 10, i));
	const n = state.mobs.length;
	mobs.spawnMobs(true);
	check(
		"spawnMobs no pasa de 30 mobs",
		state.mobs.length === n,
		`n=${state.mobs.length}`
	);
	world.setDiskLoader(null);
	resetPlayers();
	state.mobs = [];
}

// --- 12b) QUEMA SOLAR (Fase 6): solo no-muertos, solo de día y al aire libre ---
{
	// Mock por altura: suelo sólido (y <= 10), aire libre arriba → expuesto al sol.
	const origGetBlock = world.getBlock;
	world.getBlock = (_x, y, _z) => (y <= 10 ? 3 : 0);

	// Zombie de día y al aire libre: arde y pierde 1 HP por segundo.
	{
		const z = new mobs.Mob("zombie", 0, 10, 0); // y=10: suelo en 10, cabeza al aire
		check(
			"BURNS_IN_SUN incluye zombie y skeleton (no creeper/araña)",
			BURNS_IN_SUN.has("zombie") &&
				BURNS_IN_SUN.has("skeleton") &&
				!BURNS_IN_SUN.has("creeper")
		);
		z.tick(false); // día, expuesto
		check(
			"zombie de día expuesto: burning=true",
			z.burning === true,
			`burning=${z.burning}`
		);
		// Un segundo de quemadura (20 ticks) → -1 HP
		for (let i = 0; i < 1000 / TICK_MS; i++) z.tickSunBurn(false);
		check(
			"quema solar: -1 HP por segundo",
			z.health === 19,
			`health=${z.health}`
		);
	}
	// De noche no arde aunque esté al aire libre.
	{
		const z = new mobs.Mob("zombie", 0, 10, 0);
		z.tick(true);
		check("zombie de noche al aire libre: no arde", z.burning === false);
		z.tickSunBurn(true);
		check("noche: no pierde vida", z.health === 20, `health=${z.health}`);
	}
	// Bajo techo no arde (bloque sólido encima).
	{
		const z = new mobs.Mob("zombie", 0, 10, 0);
		world.getBlock = (_x, y, _zz) => (y <= 10 ? 3 : y === 11 ? 3 : 0); // techo en y=11
		z.tick(false);
		check(
			"zombie bajo techo: no arde (bloque encima da sombra)",
			z.burning === false,
			`burning=${z.burning}`
		);
	}
	// La quema puede matar: 20 HP → 20 segundos de sol.
	{
		world.getBlock = (_x, y, _zz) => (y <= 10 ? 3 : 0);
		const z = new mobs.Mob("skeleton", 0, 10, 0);
		for (let s = 0; s < 20 && z.alive; s++) {
			for (let i = 0; i < 1000 / TICK_MS; i++) z.tickSunBurn(false);
		}
		check(
			"esqueleto muere tras ~20s de sol (alive=false)",
			z.alive === false,
			`health=${z.health}`
		);
	}
	// Un pasivo (vaca) no arde de día.
	{
		world.getBlock = (_x, y, _zz) => (y <= 10 ? 3 : 0);
		const c = new mobs.Mob("cow", 0, 10, 0);
		c.tick(false);
		check("la vaca no arde con el sol", c.burning === false);
	}
	// Sumergido (agua encima) no arde: el agua apaga el fuego (como Minecraft).
	{
		world.getBlock = (_x, y, _zz) => (y <= 10 ? 3 : y <= 12 ? 20 : 0); // lago de 2 bloques
		const z = new mobs.Mob("zombie", 0, 10, 0);
		z.tick(false); // día, pero bajo el agua
		check(
			"zombie sumergido en agua: no arde (el agua apaga el fuego)",
			z.burning === false,
			`burning=${z.burning}`
		);
	}
	// snapshot expone burning (el cliente tiñe al mob en llamas)
	{
		world.getBlock = (_x, y, _zz) => (y <= 10 ? 3 : 0);
		const z = new mobs.Mob("zombie", 0, 10, 0);
		z.tickSunBurn(false);
		check("mobSnapshot expone burning", mobs.mobSnapshot(z).burning === true);
	}
	world.getBlock = origGetBlock;
}

// --- 12c) SPAWN POR FASE DEL DÍA Y EN TODO EL MAPA CARGADO (Fase 6) ---
{
	resetPlayers();
	state.mobs = [];
	world.setDiskLoader(() => null);
	const p = mkPlayer({ id: "sp", x: 8, y: 10, z: 8 });
	state.players.set(p.id, p);
	world.ensureChunksAround(0, 0, 2); // mapa cargado alrededor
	const rnd = Math.random;

	// Random 0.35: offset de chunk = floor((0.7-1)*6) = -2 → chunk (-2,-2),
	// dentro del mapa cargado (radio 2 alrededor de 0,0). La posición cae en
	// wx=wz=-26.5, a ~48 bloques del jugador (8,8) → > 24, válido para hostiles.
	// De DÍA: solo pasivos. types del día[floor(0.35*5)] = day[1] = 'pig'.
	Math.random = () => 0.35;
	const day = mobs.spawnMobs(false);
	check(
		"de día solo generan pasivos",
		day.length > 0 && day.every((m) => !HOSTILE.has(m.type)),
		day.map((m) => m.type).join(",") || "ninguno"
	);

	// De NOCHE: pueden generar hostiles. types de noche[floor(0.35*10)] =
	// night[3] = 'skeleton' (hostil).
	Math.random = () => 0.35;
	const night = mobs.spawnMobs(true);
	check(
		"de noche generan hostiles (y pasivos)",
		night.length > 0 && night.some((m) => HOSTILE.has(m.type)),
		night.map((m) => m.type).join(",") || "ninguno"
	);

	// Distancia mínima de hostiles: ningún hostil aparece a <24 bloques del
	// jugador (el spawn con random 0.35 cae a ~48 bloques).
	check(
		"hostiles nunca a <24 bloques del jugador (no spawn en la cara)",
		[...day, ...night]
			.filter((m) => HOSTILE.has(m.type))
			.every((m) => Math.hypot(m.x - p.x, m.z - p.z) >= 24),
		[...day, ...night]
			.filter((m) => HOSTILE.has(m.type))
			.map((m) => Math.hypot(m.x - p.x, m.z - p.z).toFixed(1))
			.join(",") || "sin hostiles"
	);

	Math.random = rnd;
	world.setDiskLoader(null);
	resetPlayers();
	state.mobs = [];
}

// --- 12) mobSnapshot expone type/state/isBaby (el cliente escala por tipo) ---
{
	const m3 = new mobs.Mob("rabbit", 1, 2, 3);
	m3.isBaby = true;
	const s = mobs.mobSnapshot(m3);
	check("snapshot type", s.type === "rabbit");
	check("snapshot isBaby", s.isBaby === true);
	check("snapshot state", s.state === "idle");
	check(
		"MOB_XP cubre los mobs del juego (incluye Fase 5)",
		[
			"zombie",
			"creeper",
			"skeleton",
			"enderman",
			"spider",
			"wolf",
			"cow",
			"pig",
			"chicken",
			"sheep",
			"rabbit"
		].every((t) => MOB_XP[t] > 0)
	);
}
process.exit(fails ? 1 : 0);
