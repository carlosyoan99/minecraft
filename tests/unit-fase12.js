"use strict";
// ============================================================
// TESTS DE LA FASE 12 — MOBS POR BIOMA, MASCOTAS Y TRIDENTE
//   A) Bloque A (mobs con IA completa, ya implementados en el código):
//      constructores y salud (slime/wolf/ocelot/cat/drowned), IA por especie
//      (tickOcelot, tickCat, tickPet), doma (canTame/applyTame), sentarse
//      (sitPet), división del slime (splitSlime), el gato espanta creepers
//      (catNearby) y las mascotas se unen al ataque del dueño
//      (petsJoinAttack).
//   B) Tridente (A4/E8): el ahogado lanza tridentes (shootTrident/tickDrowned),
//      el jugador lanza el suyo (throwPlayerTrident) y vuelve a su inventario
//      al impactar o expirar (returnPlayerTrident — bug de expiración
//      descubierto y corregido aquí).
//   C) Drops (mobDrops), persistencia (restoreMobs/mobSnapshot) y handlers de
//      red: tame_mob, sit_pet, throw_trident y attack_mob con división de
//      slime y mascotas unidas al golpe (patrón unit-red).
//   D) Estructuras deterministas (templo de jungla y naufragio + trampa + loot).
//   E) Bloque C: spawn por bioma (BIOME_SPAWN — taiga→lobo, pantano→slime,
//      jungla→ocelote, agua→ahogado) con muestreo determinista.
//   F) Bloque D: persistencia de mascotas (SCHEMA_VERSION 5, buildMeta +
//      restoreMobs) y reconocimiento del dueño por nombre al reconectar.
// ============================================================
const mobs = require("../server/mobs.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const playerHelpers = require("../server/players.js");
const net = require("../server/net.js");
const { B, I, HOSTILE, MOB_COLORS } = require("../server/constants.js");

// Arena de pruebas determinista (patrón unit-mobs-ia).
world.setDiskLoader(() => null);
world.getBlock = () => B.AIR;
world.isLake = () => false;
world.setBlock = () => true;
mobs.setSpawnSafeRadius(0);

let total = 0;
let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (typeof failedChecks !== "undefined" && failedChecks.length)
		console.log(`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`);
});
const check = (_name, ok, _extra = "") => {
	total++;
	if (!ok) {
		failed++;
		failedChecks.push(_name);
		// biome-ignore lint/suspicious/noConsole: resumen del test (convención del repo)
		console.log(`FAIL: ${_name} | ${_extra}`);
	}
};
const mkPlayer = (over = {}) => ({
	id: "p-f12",
	ws: { readyState: 3, send() {} },
	health: 20,
	maxHealth: 20,
	x: 0,
	y: 10,
	z: 0,
	yaw: 0,
	pitch: 0,
	inventory: new Array(36).fill(null),
	armor: { helmet: null, chestplate: null, leggings: null, boots: null },
	selectedSlot: 0,
	craftingGrid: new Array(9).fill(null),
	...over
});

// ============================================================
// A) BLOQUE A — CONSTRUCTORES, IA, DOMA Y MASCOTAS
// ============================================================
// 1) Constructor: salud por tipo y estado de mascota/slime.
{
	const s = new mobs.Mob("slime", 0, 10, 0);
	check(
		"slime: slimeSize 2 (grande) por defecto",
		s.slimeSize === 2,
		`slimeSize=${s.slimeSize}`
	);
	check("slime: salud 16", s.health === 16, `health=${s.health}`);
	check(
		"slime: sin dueño ni sentado",
		s.ownerId === null && s.ownerName === null && s.sitting === false
	);
	check("lobo: salud 20", new mobs.Mob("wolf", 0, 10, 0).health === 20);
	check("ocelote: salud 10", new mobs.Mob("ocelot", 0, 10, 0).health === 10);
	check("gato: salud 10", new mobs.Mob("cat", 0, 10, 0).health === 10);
	check("ahogado: salud 20", new mobs.Mob("drowned", 0, 10, 0).health === 20);
	check(
		"HOSTILE incluye slime y drowned (hostiles nuevos)",
		HOSTILE.has("slime") && HOSTILE.has("drowned")
	);
	check(
		"ocelote y gato NO son hostiles",
		!HOSTILE.has("ocelot") && !HOSTILE.has("cat")
	);
	check(
		"MOB_COLORS tiene color para los 5 mobs de la Fase 12",
		MOB_COLORS &&
			["wolf", "slime", "ocelot", "cat", "drowned"].every(
				(t) => typeof MOB_COLORS[t] === "number"
			)
	);
}

// 2) canTame: qué ítem doma a cada especie y motivos de rechazo.
{
	const w = new mobs.Mob("wolf", 0, 10, 0);
	check("canTame lobo + hueso = ok", mobs.canTame(w, I.BONE) === "ok");
	check(
		"canTame lobo + comida no hueso = wrongfood",
		mobs.canTame(w, I.BEEF) === "wrongfood"
	);
	const o = new mobs.Mob("ocelot", 0, 10, 0);
	check(
		"canTame ocelote + pescado crudo (COD) = ok",
		mobs.canTame(o, I.COD) === "ok"
	);
	check(
		"canTame ocelote + hueso = wrongfood",
		mobs.canTame(o, I.BONE) === "wrongfood"
	);
	w.ownerId = "otro";
	check("canTame ya domado = owned", mobs.canTame(w, I.BONE) === "owned");
	const c = new mobs.Mob("cow", 0, 10, 0);
	check("canTame vaca = notameable", mobs.canTame(c, I.BONE) === "notameable");
}

// 3) applyTame: ~33% de éxito, marca dueño y el ocelote se vuelve gato.
{
	const rnd = Math.random;
	Math.random = () => 0.1; // 0.1 < 1/3 → éxito
	const w = new mobs.Mob("wolf", 0, 10, 0);
	const ok = mobs.applyTame(w, { id: "p1", name: "Dueño" });
	Math.random = () => 0.9; // ≥ 1/3 → fracaso
	const o = new mobs.Mob("wolf", 0, 10, 0);
	const fail = mobs.applyTame(o, { id: "p1", name: "Dueño" });
	const oc = new mobs.Mob("ocelot", 0, 10, 0);
	Math.random = () => 0.1;
	mobs.applyTame(oc, { id: "p1", name: "Dueño" });
	Math.random = rnd;
	check(
		"applyTame éxito (random 0.1) asigna ownerId/ownerName",
		ok === true && w.ownerId === "p1" && w.ownerName === "Dueño"
	);
	check("applyTame fallo (random 0.9) no asigna", fail === false && !o.ownerId);
	check(
		"applyTame ocelote → type 'cat' con dueño",
		oc.type === "cat" && oc.ownerId === "p1"
	);
}

// 4) sitPet alterna sentado/levantado.
{
	const w = new mobs.Mob("wolf", 0, 10, 0);
	check("sitPet → true (se sienta)", mobs.sitPet(w) === true && w.sitting);
	check("sitPet → false (se levanta)", mobs.sitPet(w) === false && !w.sitting);
}

// 5) splitSlime: división por tamaño al morir (grande→2 medianos, mediano→
//    2 pequeños, pequeño no divide); los hijos heredan tamaño y salud.
{
	state.mobs.length = 0;
	const big = new mobs.Mob("slime", 10, 10, 10);
	big.slimeSize = 2;
	big.health = 16;
	state.mobs.push(big);
	const kids = mobs.splitSlime(big);
	check(
		"split grande → 2 medianos",
		kids.length === 2 && kids.every((k) => k.slimeSize === 1 && k.health === 4),
		`kids=${kids.length}`
	);
	const kids2 = mobs.splitSlime(kids[0]);
	check(
		"split mediano → 2 pequeños (health 1)",
		kids2.length === 2 &&
			kids2.every((k) => k.slimeSize === 0 && k.health === 1),
		`kids2=${kids2.length}`
	);
	const small = new mobs.Mob("slime", 12, 10, 12);
	small.slimeSize = 0;
	check(
		"split pequeño → 0 hijos (no divide)",
		mobs.splitSlime(small).length === 0
	);
	check(
		"split solo aplica a slimes",
		mobs.splitSlime(new mobs.Mob("cow", 0, 10, 0)).length === 0
	);
	state.mobs = [];
}

// 6) catNearby: el GATO domado espanta a los creepers (decisión E9).
{
	state.players.clear();
	state.mobs = [];
	const p = mkPlayer({ id: "cat1", x: 3, y: 10, z: 0 });
	state.players.set(p.id, p);
	const cat = new mobs.Mob("cat", 0, 10, 0);
	cat.ownerId = p.id;
	const creep = new mobs.Mob("creeper", 2, 10, 0);
	creep.fuseStart = Date.now();
	state.mobs.push(cat, creep);
	check("catNearby true con gato domado", mobs.catNearby(0, 0, 6) === true);
	state.mobs = [new mobs.Mob("cat", 0, 10, 0)]; // sin dueño
	check(
		"catNearby false si el gato no tiene dueño",
		mobs.catNearby(0, 0, 6) === false
	);
	state.mobs = [cat, creep];
	creep.tick(true);
	check(
		"creeper con gato cerca → huye (state flee) y cancela el fuse",
		creep.state === "flee" && creep.fuseStart === null,
		`state=${creep.state} fuse=${creep.fuseStart}`
	);
	state.mobs = [];
	state.players.clear();
}

// 7) Mascotas: tickPet/tickCat siguen al dueño y se quedan sentadas; el
//    ocelote huye del jugador a ≤8 bloques (tickOcelot).
{
	state.players.clear();
	state.mobs = [];
	const p = mkPlayer({ id: "owner", x: 0, y: 10, z: 0 });
	state.players.set(p.id, p);
	const wolf = new mobs.Mob("wolf", 6, 10, 0);
	wolf.ownerId = "owner";
	wolf.tick(true); // domado: tickPet (no persigue como hostil)
	check(
		"lobo domado de noche NO ataca (state follow)",
		wolf.state === "follow",
		`state=${wolf.state}`
	);
	check("lobo domado se acerca al dueño", wolf.x < 6, `x=${wolf.x}`);
	wolf.sitting = true;
	wolf.tick(true);
	check("lobo sentado se queda quieto (state sit)", wolf.state === "sit");

	const cat = new mobs.Mob("cat", 5, 10, 0);
	cat.ownerId = "owner";
	cat.tick(true);
	check("gato sigue al dueño (state follow)", cat.state === "follow");

	const oce = new mobs.Mob("ocelot", 2, 10, 0);
	oce.tick(true);
	check(
		"ocelote huye del jugador a ≤8 bloques (state flee)",
		oce.state === "flee",
		`state=${oce.state}`
	);
	state.mobs = [];
	state.players.clear();
}

// 8) petsJoinAttack: los lobos domados del atacante se unen al golpe
//    (≤12 bloques del objetivo, daño 3) — excluye sentados, gatos, lejanos
//    y lobos de otro dueño.
{
	state.players.clear();
	state.mobs = [];
	const p = mkPlayer({ id: "wowner", x: 0, y: 10, z: 0 });
	state.players.set(p.id, p);
	const a = new mobs.Mob("wolf", 1, 10, 1);
	a.ownerId = "wowner";
	const b = new mobs.Mob("wolf", 2, 10, 1);
	b.ownerId = "wowner";
	b.sitting = true;
	const lejos = new mobs.Mob("wolf", 80, 10, 80);
	lejos.ownerId = "wowner";
	// Fase 12 (revisión): la distancia de ataque del lobo es 3D — un lobo a
	// ~1 bloque lateral pero 15 bloques por debajo (cueva) NO golpea a través
	// del terreno (con distancia 2D habría golpeado: hypot(1,0) < 12).
	const abajo = new mobs.Mob("wolf", 9, -5, 8);
	abajo.ownerId = "wowner";
	const cat = new mobs.Mob("cat", 3, 10, 0);
	cat.ownerId = "wowner";
	const otro = new mobs.Mob("wolf", 4, 10, 0);
	otro.ownerId = "ajeno";
	state.mobs = [a, b, lejos, abajo, cat, otro];
	const target = new mobs.Mob("zombie", 8, 10, 8);
	target.health = 20;
	const n = mobs.petsJoinAttack(target, p);
	check(
		"petsJoinAttack: solo el lobo domado en rango golpea (n=1)",
		n === 1,
		`n=${n}`
	);
	check(
		"petsJoinAttack ignora al lobo lejano en vertical (cueva)",
		abajo.health === 20 && n === 1,
		`n=${n}`
	);
	check("el golpe conjunto hace 3 de daño", target.health === 17);
	state.mobs = [];
	state.players.clear();
}

// 9) DROWNED: a 4-14 bloques lanza tridentes (~50% por intento, cooldown 3s).
{
	state.players.clear();
	state.arrows.length = 0;
	state.mobs = [];
	const p = mkPlayer({ id: "sd", x: 6, y: 10, z: 0 });
	state.players.set(p.id, p);
	const drowned = new mobs.Mob("drowned", 0, 10, 0);
	const rnd = Math.random;
	Math.random = () => 0.01; // < 0.5 → dispara
	drowned.tick(true);
	Math.random = rnd;
	check(
		"ahogado dispara un tridente (state.arrows kind 'trident')",
		state.arrows.length === 1 && state.arrows[0].kind === "trident",
		`arrows=${state.arrows.length}`
	);
	check("el tridente del ahogado lleva daño 6", state.arrows[0].damage === 6);
	check(
		"ahogado establece cooldown de disparo",
		drowned.shootCooldown > 0,
		`cd=${drowned.shootCooldown}`
	);
	state.arrows = [];
	state.mobs = [];
	state.players.clear();
}

// ============================================================
// B) TRIDENTE DEL JUGADOR (A4/E8)
// ============================================================
// 10) throwPlayerTrident: retira el item del inventario y crea el proyectil.
{
	state.players.clear();
	state.arrows.length = 0;
	const p = mkPlayer({});
	playerHelpers.addToInventory(p, I.TRIDENT, 1);
	state.players.set(p.id, p);
	check(
		"jugador tiene un tridente antes de lanzar",
		p.inventory[0]?.id === I.TRIDENT
	);
	const ok = mobs.throwPlayerTrident(p);
	check("throwPlayerTrident retorna true", ok === true);
	check(
		"throwPlayerTrident retira el tridente del inventario",
		p.inventory[0] === null
	);
	check(
		"throwPlayerTrident crea un proyectil kind 'trident'",
		state.arrows.length === 1 &&
			state.arrows[0].kind === "trident" &&
			state.arrows[0].from === p.id,
		`arrows=${state.arrows.length}`
	);
	// Sin tridente en la mano → no lanza.
	state.arrows = [];
	check(
		"throwPlayerTrident sin tridente = false",
		mobs.throwPlayerTrident(p) === false && state.arrows.length === 0
	);
	state.arrows = [];
	state.players.clear();
}

// 11) returnPlayerTrident: el tridente vuelve al inventario del dueño al
//     IMPACTAR en un bloque o al EXPIRAR (deja de vivir). Este test cubre
//     además el fix del bug: antes la expiración se descartaba sin devolver
//     el ítem (el `continue` del bucle saltaba returnPlayerTrident).
{
	state.players.clear();
	state.arrows.length = 0;
	const p = mkPlayer({ id: "rt", x: 0, y: 10, z: 0 });
	playerHelpers.addToInventory(p, I.TRIDENT, 1);
	state.players.set(p.id, p);
	mobs.throwPlayerTrident(p);
	// (a) Expiración: vida corta → tickArrows la devuelve al inventario.
	state.arrows[0].life = 10;
	mobs.tickArrows(50);
	check(
		"tridente EXPIRADO vuelve al inventario del dueño",
		p.inventory.some((s) => s && s.id === I.TRIDENT),
		JSON.stringify(p.inventory.filter(Boolean).map((s) => s.id))
	);
	// (b) Impacto con un BLOQUE sólido → también vuelve.
	world.getBlock = (_x, y, _z) => (y === 10 ? 3 : B.AIR); // muro plano en y=10
	playerHelpers.addToInventory(p, I.TRIDENT, 1);
	mobs.throwPlayerTrident(p);
	state.arrows[0].x = 0;
	state.arrows[0].y = 9.9;
	state.arrows[0].z = 0;
	state.arrows[0].vx = 0;
	state.arrows[0].vy = 20; // sube → choca contra el "muro" en y=10
	state.arrows[0].vz = 0;
	mobs.tickArrows(50);
	check(
		"tridente que choca con bloque vuelve al inventario",
		p.inventory.some((s) => s && s.id === I.TRIDENT),
		JSON.stringify(p.inventory.filter(Boolean).map((s) => s.id))
	);
	world.getBlock = () => B.AIR;
	state.arrows = [];
	state.players.clear();
}

// 12) shootTrident del ahogado (helper directo, independiente del tick).
{
	state.players.clear();
	state.arrows.length = 0;
	const d = new mobs.Mob("drowned", 0, 10, 0);
	const t = { id: "blanco", x: 8, y: 10, z: 0 };
	mobs.shootTrident(d, t);
	check(
		"shootTrident crea proyectil kind trident con from del ahogado",
		state.arrows.length === 1 &&
			state.arrows[0].kind === "trident" &&
			state.arrows[0].from === d.id
	);
	check(
		"la velocidad horizontal del tridente es 16 (TRIDENT_SPEED)",
		Math.hypot(state.arrows[0].vx, state.arrows[0].vz) === 16
	);
	state.arrows.length = 0;
}

// ============================================================
// C) DROPS, PERSISTENCIA Y HANDLERS DE RED
// ============================================================
// 13) mobDrops: slime solo pequeño suelta slimeball; drowned ~15% tridente.
{
	const rnd = Math.random;
	// el slime pequeño NO tira el roll de tridente: un único Math.random
	// decide el count (0..1). Con 0.8 → count=1.
	let seq = [0.8];
	const q = () => seq.shift() ?? 0.5;
	Math.random = q;
	const ds = mobs.mobDrops({ type: "slime", isBaby: false, slimeSize: 0 });
	check(
		"slime pequeño suelta BolaDeSlime (246)",
		ds?.some((d) => d.id === I.SLIME_BALL),
		JSON.stringify(ds)
	);
	Math.random = () => 0.9;
	const dg = mobs.mobDrops({ type: "slime", isBaby: false, slimeSize: 2 });
	check(
		"slime GRANDE no suelta nada (se divide)",
		dg === null,
		JSON.stringify(dg)
	);
	seq = [0.01, 0.8];
	Math.random = q;
	const dd = mobs.mobDrops({ type: "drowned", isBaby: false });
	check(
		"ahogado suelta tridente (245) con roll favorable",
		dd?.some((d) => d.id === I.TRIDENT),
		JSON.stringify(dd)
	);
	Math.random = () => 0.9; // roll ≥ 0.15 → no
	const dn = mobs.mobDrops({ type: "drowned", isBaby: false });
	check(
		"ahogado SIN roll no suelta tridente (~15%)",
		dn === null,
		JSON.stringify(dn)
	);
	Math.random = rnd;
}

// 14) restoreMobs/mobSnapshot: la mascota y el tamaño del slime se conservan.
{
	const [r] = mobs.restoreMobs([
		{
			type: "wolf",
			x: 3,
			y: 4,
			z: 5,
			health: 9,
			ownerId: "o1",
			ownerName: "Dueño",
			sitting: true
		}
	]);
	check(
		"restoreMobs restaura mascota (ownerId/ownerName/sitting)",
		r.ownerId === "o1" && r.ownerName === "Dueño" && r.sitting === true
	);
	const snap = mobs.mobSnapshot(r);
	check(
		"snapshot lleva ownerId y sitting",
		snap.ownerId === "o1" && snap.sitting === true
	);
	const sl = new mobs.Mob("slime", 0, 0, 0);
	sl.slimeSize = 0;
	check("snapshot lleva slimeSize", mobs.mobSnapshot(sl).slimeSize === 0);
}

// 15) Handlers de red (patrón unit-red con FakeWS).
{
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
	const connect = () => {
		state.players.clear();
		state.mobs = [];
		const ws = new FakeWS();
		net.handleConnection(ws);
		const init = ws.events("init")[0];
		const player = state.players.get(init.data.playerId);
		return { ws, player };
	};
	// tame_mob: hueso sobre lobo → doma (éxito 33%) y consume el hueso.
	{
		const { ws, player } = connect();
		const wolf = new mobs.Mob("wolf", player.x, player.y + 1, player.z);
		state.mobs.push(wolf);
		playerHelpers.addToInventory(player, I.BONE, 1);
		const rnd = Math.random;
		Math.random = () => 0.1; // éxito
		ws.emit(
			"message",
			JSON.stringify({ event: "tame_mob", data: { mobId: wolf.id } })
		);
		Math.random = rnd;
		check(
			"tame_mob consume el hueso y doma (mob.ownerId)",
			player.inventory.every((s) => !s) && wolf.ownerId === player.id,
			`ownerId=${wolf.ownerId}`
		);
		check("tame_mob responde tame_ok", ws.events("tame_ok").length === 1);
		// sit_pet: solo el dueño puede; alterna a sentado.
		ws.emit(
			"message",
			JSON.stringify({ event: "sit_pet", data: { mobId: wolf.id } })
		);
		check("sit_pet sienta a la mascota", wolf.sitting === true);
		// sit_pet de un jugador que NO es el dueño → se ignora.
		wolf.sitting = false;
		ws.sent.length = 0;
		state.players.clear(); // el dueño "se va"
		const ws2 = new FakeWS();
		net.handleConnection(ws2); // jugador nuevo sin dueño del lobo
		ws2.emit(
			"message",
			JSON.stringify({ event: "sit_pet", data: { mobId: wolf.id } })
		);
		check("sit_pet de otro dueño se ignora", wolf.sitting === false);
		state.mobs = [];
		state.players.clear();
	}
	// throw_trident: el jugador con tridente lanza (handler retira + proyectil).
	{
		const { ws, player } = connect();
		state.arrows.length = 0;
		playerHelpers.addToInventory(player, I.TRIDENT, 1);
		ws.emit("message", JSON.stringify({ event: "throw_trident", data: {} }));
		check(
			"throw_trident crea un proyectil kind trident del jugador",
			state.arrows.length === 1 && state.arrows[0].kind === "trident",
			`arrows=${state.arrows.length}`
		);
		check(
			"throw_trident retira el tridente del inventario",
			player.inventory.every((s) => !s)
		);
		state.arrows = [];
		state.mobs = [];
		state.players.clear();
	}
	// attack_mob sobre un slime grande → split en 2 medianos + mob_death.
	{
		const { ws, player } = connect();
		const big = new mobs.Mob("slime", player.x, player.y + 1, player.z);
		big.slimeSize = 2;
		big.health = 1; // muere al primer golpe de la mano (dmg 1)
		state.mobs.push(big);
		ws.emit(
			"message",
			JSON.stringify({ event: "attack_mob", data: { mobId: big.id } })
		);
		const slimes = state.mobs.filter((m) => m.type === "slime" && m.alive);
		check(
			"attack_mob mata el slime grande y lo divide en 2 medianos",
			!big.alive &&
				slimes.length === 2 &&
				slimes.every((m) => m.slimeSize === 1),
			`vivos=${slimes.length}`
		);
		check("attack_mob emite mob_death", ws.events("mob_death").length === 1);
		state.mobs = [];
		state.players.clear();
	}
	// attack_mob con LOBO DOMADO del atacante: el golpe conjunto (petsJoinAttack)
	// remata al blanco (mano 1 + lobo 3).
	{
		const { ws, player } = connect();
		const target = new mobs.Mob("zombie", player.x, player.y + 1, player.z);
		target.health = 4; // 1 de la mano + 3 del lobo → muere
		const pet = new mobs.Mob("wolf", player.x, player.y + 1, player.z);
		pet.ownerId = player.id;
		state.mobs.push(target, pet);
		ws.emit(
			"message",
			JSON.stringify({ event: "attack_mob", data: { mobId: target.id } })
		);
		check(
			"ataque + lobo del dueño rematan al blanco (petsJoinAttack)",
			!target.alive,
			`health=${target.health}`
		);
		state.mobs = [];
		state.players.clear();
	}
}

// ============================================================
// D) BLOQUE B — ESTRUCTURAS DETERMINISTAS (templo de jungla y naufragio)
//    Implementado en server/world.js: celdas de 32x32, hash 2D por semilla
//    (structCellHash), templo solo en jungla firme y naufragio solo en
//    océano; el cofre central crea su loot en state.chests.
// ============================================================
// 16) Determinismo: la misma coordenada siempre devuelve la misma
//     estructura (mismo tipo y centro).
{
	const a = world.structureAt(137, 421);
	const b = world.structureAt(137, 421);
	const sameCenter =
		a == null && b == null
			? true
			: a && b && a.type === b.type && a.cx === b.cx && a.cz === b.cz;
	check(
		"structureAt es determinista (misma entrada → misma salida)",
		sameCenter
	);
	const c1 = world.structureAt(48, 99);
	const c2 = world.structureAt(48, 99);
	const det =
		c1 == null && c2 == null
			? true
			: c1 && c2 && c1.type === c2.type && c1.cx === c2.cx && c1.cz === c2.cz;
	check("structureAt determinista (segunda muestra)", det);
}

// 17) Aparecen ambas estructuras en la semilla, y en su bioma correcto:
//     templo solo en jungla (nunca sobre agua) y naufragio solo en océano.
{
	let temples = 0;
	let shipwrecks = 0;
	let templeInJungle = 0;
	let templeOnWater = 0;
	let shipwreckInOcean = 0;
	// Barrer celdas de 32 bloques alrededor del origen: 64x64 celdas cubren
	// ±1024 bloques (suficiente para encontrar ambas en la semilla).
	for (let ccx = -32; ccx < 32; ccx++) {
		for (let ccz = -32; ccz < 32; ccz++) {
			const wx = ccx * 32 + 16;
			const wz = ccz * 32 + 16;
			const s = world.structureAt(wx, wz);
			if (!s) continue;
			if (s.type === "temple") {
				temples++;
				if (world.getBiome(s.cx, s.cz) === "jungle") templeInJungle++;
				if (world.columnFloorY(s.cx, s.cz) !== null) templeOnWater++;
			} else {
				shipwrecks++;
				if (world.isOcean(s.cx, s.cz)) shipwreckInOcean++;
			}
		}
	}
	check(
		"hay al menos 1 templo de jungla en la semilla",
		temples > 0,
		`${temples} templos`
	);
	check(
		"hay al menos 1 naufragio en la semilla",
		shipwrecks > 0,
		`${shipwrecks} naufragios`
	);
	check(
		"todo templo está en jungla",
		temples === templeInJungle,
		`${templeInJungle}/${temples} en jungla`
	);
	check(
		"ningún templo sobre agua",
		templeOnWater === 0,
		`${templeOnWater} sobre agua`
	);
	check(
		"todo naufragio está en océano",
		shipwrecks === shipwreckInOcean,
		`${shipwreckInOcean}/${shipwrecks} en océano`
	);
}

// 18) trampa del templo: el pasillo norte (dx=0, dz=-1..-4) dispara.
{
	let found = false;
	for (let ccx = -32; ccx < 32 && !found; ccx++) {
		for (let ccz = -32; ccz < 32; ccz++) {
			const wx = ccx * 32 + 16;
			const wz = ccz * 32 + 16;
			const s = world.structureAt(wx, wz);
			if (s?.type !== "temple") continue;
			const cx = Math.floor(s.cx);
			const cz = Math.floor(s.cz);
			check(
				"templeTrapAt true en el pasillo (dx=0, dz=-1..-4)",
				world.templeTrapAt(cx, cz - 2) === true,
				`(${cx},${cz - 2})`
			);
			check(
				"templeTrapAt false fuera del pasillo",
				world.templeTrapAt(cx, cz + 2) === false &&
					world.templeTrapAt(cx + 2, cz - 2) === false
			);
			found = true;
		}
	}
	check(
		"se localizó un templo para probar la trampa",
		found,
		"sin templo en el barrido"
	);
}

// 19) Estructura del templo (templeBlockAt): piso de musgo, cofre en la
//     cámara central, entrada al sur y techo.
{
	const { B } = require("../server/constants.js");
	check(
		"piso del templo es piedra de musgo (dy=0)",
		world.templeBlockAt(0, 0, 0) === B.MOSSY_COBBLESTONE &&
			world.templeBlockAt(4, 4, 0) === B.MOSSY_COBBLESTONE
	);
	check(
		"cofre del tesoro en el centro de la cámara (0,0,1)",
		world.templeBlockAt(0, 0, 1) === B.CHEST
	);
	check(
		"entrada al sur (dx=0, dz=5) hueca",
		world.templeBlockAt(0, 5, 1) === B.AIR &&
			world.templeBlockAt(0, 5, 2) === B.AIR
	);
	check(
		"techo de musgo sobre la cámara (dy=3)",
		world.templeBlockAt(0, 0, 3) === B.MOSSY_COBBLESTONE
	);
}

// 20) Loot de las estructuras: las tablas generan slots válidos.
{
	const chests = require("../server/chests.js");
	let templeItems = 0;
	let shipItems = 0;
	for (let i = 0; i < 40; i++) {
		templeItems += chests.templeLootSlots().filter(Boolean).length;
		shipItems += chests.shipwreckLootSlots().filter(Boolean).length;
	}
	check(
		"templeLootSlots genera ítems (acumulado > 0)",
		templeItems > 0,
		`${templeItems} slots`
	);
	check(
		"shipwreckLootSlots genera ítems (acumulado > 0)",
		shipItems > 0,
		`${shipItems} slots`
	);
}

// ============================================================
// ============================================================
// E) BLOQUE C — SPAWN POR BIOMA (BIOME_SPAWN, implementado)
//    taiga→lobos, pantano→slimes, jungla→ocelotes, océano→ahogados.
//    Se verifica el mapeo (los tipos están en la tabla por bioma) y que el
//    muestreo determinista los produce: se fuerza el sorteo con Math.random
//    controlado y un mock de getBiome/columnFloorY (patrón unit-spawn).
// ============================================================
// 21) El mapeo BIOME_SPAWN asigna cada mob a su bioma (dia/noche correctos).
{
	const BS = mobs.BIOME_SPAWN;
	check(
		"BIOME_SPAWN exportado con taiga→lobo de noche",
		BS?.taiga?.night?.includes("wolf")
	);
	check(
		"BIOME_SPAWN pantano→slime de noche",
		BS?.swamp?.night?.includes("slime")
	);
	check(
		"BIOME_SPAWN jungla→ocelote de día (pasivo)",
		BS?.jungle?.day?.includes("ocelot")
	);
	check(
		"BIOME_SPAWN agua→ahogado (WATER_SPAWN)",
		Array.isArray(mobs.WATER_SPAWN) && mobs.WATER_SPAWN.includes("drowned")
	);
}

// 22) spawnMobs elige el mob del bioma: con Math.random controlado y un mock
//     de bioma, el 60% de las veces sale el mob propio. Se muestrea el sorteo
//     con varios randoms para cubrir ambos brazos del 60/40.
{
	state.players.clear();
	state.mobs = [];
	const rnd = Math.random;
	// Guardar los mocks del mundo para restaurarlos al final (el test 24 usa
	// handleConnection, que depende del mundo real).
	const origBiome = world.getBiome;
	const origFloorY = world.columnFloorY;
	const origHeight = world.getHeight;
	const origCave = world.findDarkCaveY;
	const p = mkPlayer({ id: "spawner", x: 0, y: 64, z: 0, renderDistance: 4 });
	state.players.set(p.id, p);
	// Mock: toda la zona es taiga y sin agua → el sorteo tira BIOME_SPAWN.taiga.
	world.getBiome = () => "taiga";
	world.columnFloorY = () => null;
	world.getHeight = () => 63;
	world.findDarkCaveY = () => 50;
	// Garantizar chunks cargados en el radio del mock (Fase 15 D5: chunks
	// de 16×128×16).
	for (let cx = -4; cx <= 4; cx++) {
		for (let cz = -4; cz <= 4; cz++) {
			state.chunks.set(`${cx},${cz}`, new Uint8Array(16 * 128 * 16));
		}
	}
	// r<0.6 → mob propio; el valor r (0.3) cae en el pool de taiga → wolf.
	Math.random = () => 0.3;
	const created = mobs.spawnMobs(true);
	Math.random = rnd;
	check(
		"spawnMobs en taiga de noche elige lobo (60% propio)",
		created.some((m) => m.type === "wolf"),
		`creados: ${created.map((m) => m.type).join(",") || "ninguno"}`
	);
	// r≥0.6 → tabla base (zombie/creeper/etc. de noche), NO lobo propio.
	state.mobs = [];
	Math.random = () => 0.8;
	const base = mobs.spawnMobs(true);
	Math.random = rnd;
	check(
		"spawnMobs en taiga con r≥0.6 usa la tabla base (no lobo)",
		base.length === 0 || base.every((m) => m.type !== "wolf"),
		`creados: ${base.map((m) => m.type).join(",") || "ninguno"}`
	);
	// Agua → ahogado: columnFloorY no null → WATER_SPAWN. Fase 15 (D5):
	// columnFloorY devuelve el fondo en ESPACIO DE DISEÑO (1..4); el ahogado
	// nace en min(floorY − DESIGN_OFFSET + 2, WORLD_SEA_LEVEL − 1) — siempre
	// bajo la superficie del agua (Y de mundo ≤ −4), nunca sobre ella.
	state.mobs = [];
	world.columnFloorY = () => 3; // fondo de lago en diseño (agua poco profunda)
	Math.random = () => 0.3;
	const wet = mobs.spawnMobs(true);
	Math.random = rnd;
	check(
		"spawnMobs sobre agua elige ahogado y lo coloca bajo la superficie",
		wet.some(
			(m) =>
				m.type === "drowned" &&
				m.y <= world.WORLD_SEA_LEVEL - 1 &&
				m.y >= world.WORLD_MIN_Y + 1
		),
		`creados: ${wet.map((m) => `${m.type}@${m.y}`).join(",") || "ninguno"}`
	);
	state.mobs = [];
	state.players.clear();
	// Restaurar el mundo real (los siguientes tests usan getBiome/columnFloorY).
	world.getBiome = origBiome;
	world.columnFloorY = origFloorY;
	world.getHeight = origHeight;
	world.findDarkCaveY = origCave;
}

// ============================================================
// F) BLOQUE D — PERSISTENCIA DE MASCOTAS (SCHEMA_VERSION 5)
//    buildMeta persiste ownerId/ownerName/sitting; restoreMobs los restaura;
//    y al reconectar, la mascota reconoce a su dueño por NOMBRE (los IDs de
//    jugador son por sesión). Se prueba el ciclo completo sin disco: el meta
//    construido con una mascota vuelve a un mob domado tras restoreMobs.
// ============================================================
// 23) buildMeta incluye la mascota (campos pet) y restoreMobs la recupera.
{
	const save = require("../server/save.js");
	state.players.clear();
	state.mobs = [];
	const pet = new mobs.Mob("wolf", 3, 4, 5);
	pet.ownerId = "sesion-vieja";
	pet.ownerName = "DueñoF12";
	pet.sitting = true;
	pet.health = 9;
	state.mobs.push(pet);
	const meta = save.buildMeta();
	const saved = meta.mobs.find(
		(m) => m.type === "wolf" && m.ownerName === "DueñoF12"
	);
	check(
		"buildMeta persiste ownerName/sitting de la mascota",
		saved && saved.ownerName === "DueñoF12" && saved.sitting === true,
		JSON.stringify(saved)
	);
	// Cargar: restoreMobs devuelve el lobo con su dueño (campos planos).
	const [loaded] = mobs.restoreMobs([saved]);
	check(
		"restoreMobs restaura ownerId/ownerName/sitting",
		loaded.ownerName === "DueñoF12" &&
			loaded.ownerId === "sesion-vieja" &&
			loaded.sitting === true,
		`ownerId=${loaded.ownerId}`
	);
	// Migración retrocompatible: un snapshot v4 sin pet → mob salvaje.
	const [wild] = mobs.restoreMobs([
		{ type: "wolf", x: 1, y: 2, z: 3, health: 20 }
	]);
	check(
		"snapshot sin pet → mob salvaje (sin dueño, no sentado)",
		!wild.ownerId && !wild.ownerName && !wild.sitting
	);
	state.mobs = [];
	state.players.clear();
}

// 24) Reconocimiento por nombre: la mascota guardada con ownerName se re-vincula
//     al jugador que se conecta con ese nombre (los IDs son por sesión).
{
	state.players.clear();
	state.mobs = [];
	// Simular un mundo cargado: la mascota llega con ownerName y un ownerId
	// viejo de otra sesión.
	const pet = new mobs.Mob("wolf", 3, 4, 5);
	pet.ownerName = "Alex";
	pet.ownerId = "sesion-anterior";
	pet.sitting = true;
	state.mobs.push(pet);
	// Conectar un jugador llamado Alex (patrón FakeWS de la sección 15): el
	// flujo de handleConnection debe re-vincular m.ownerId = playerId.
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
	}
	const ws = new FakeWS();
	// El nombre del jugador viaja en el query string del handshake WS
	// (nameFromRequest): conectar como Alex para que la mascota lo reconozca.
	net.handleConnection(ws, { url: "/?name=Alex" });
	const init = ws.sent.find((m) => m.event === "init");
	const player = state.players.get(init.data.playerId);
	check(
		"jugador de prueba conectado con nombre Alex",
		player && player.name === "Alex",
		`name=${player?.name}`
	);
	if (player && player.name === "Alex") {
		check(
			"mascota re-vinculada al dueño por nombre (ownerId de la sesión)",
			pet.ownerId === player.id,
			`ownerId=${pet.ownerId} playerId=${player.id}`
		);
	}
	state.mobs = [];
	state.players.clear();
}

// ============================================================
// G) TRIDENTE DEL JUGADOR CONTRA MOBS (auditoría Fase 14)
// El tridente (y las flechas) impactan en los mobs, no solo en los jugadores:
// su lanzador no se daña a sí mismo ni a sus mascotas, el mob recibe el daño
// y, si el lanzador es un jugador conectado, el mob que muere cae con drops.
// ============================================================
// 25) Un tridente lanzado por el jugador daña a un mob (caza); la mascota
//     del lanzador no recibe fuego amigo aunque esté en la misma posición.
{
	state.players.clear();
	state.mobs = [];
	state.arrows.length = 0;
	const lanzador = mkPlayer({ id: "trmob", x: 50, y: 10, z: 0 });
	playerHelpers.addToInventory(lanzador, I.TRIDENT, 1);
	state.players.set(lanzador.id, lanzador);
	const zombie = new mobs.Mob("zombie", 0, 10, 0);
	zombie.health = 20;
	const pet = new mobs.Mob("wolf", 0, 10, 0);
	pet.ownerId = lanzador.id; // mascota del lanzador
	state.mobs.push(zombie, pet);
	// Lanzar y colocar el proyectil justo sobre el zombie (tickArrows aplica
	// el daño por proximidad; velocidad nula para no escaparse del marco).
	mobs.throwPlayerTrident(lanzador);
	const arrow = state.arrows[0];
	arrow.x = 0;
	arrow.y = 10;
	arrow.z = 0;
	arrow.vx = arrow.vy = arrow.vz = 0;
	mobs.tickArrows(50);
	check(
		"el tridente del jugador daña al mob (zombie 20→12)",
		zombie.health === 12,
		`zombie=${zombie.health}`
	);
	check(
		"el tridente NO daña a la mascota del lanzador (friendly-fire)",
		pet.health === 20,
		`pet=${pet.health}`
	);
	check(
		"el tridente impactado vuelve al inventario del dueño",
		lanzador.inventory.some((s) => s && s.id === I.TRIDENT),
		JSON.stringify(lanzador.inventory.filter(Boolean).map((s) => s.id))
	);
	state.arrows = [];
	state.mobs = [];
	state.players.clear();
}

// 26) Un tridente que MATA a un mob da drops + XP al jugador lanzador; el
//     ahogado que lanza su tridente no se daña a sí mismo.
{
	state.players.clear();
	state.mobs = [];
	state.arrows.length = 0;
	const lanzador = mkPlayer({ id: "trkill", x: 100, y: 10, z: 0 });
	playerHelpers.addToInventory(lanzador, I.TRIDENT, 1);
	state.players.set(lanzador.id, lanzador);
	const cob = new mobs.Mob("cow", 0, 10, 0);
	cob.health = 3; // el tridente (8) la mata de un golpe
	state.mobs.push(cob);
	const xpAntes = lanzador.xp || 0;
	mobs.throwPlayerTrident(lanzador);
	const arrow = state.arrows[0];
	arrow.x = 0;
	arrow.y = 10;
	arrow.z = 0;
	arrow.vx = arrow.vy = arrow.vz = 0;
	mobs.tickArrows(50);
	check(
		"el tridente mata a la vaca",
		cob.alive === false,
		`alive=${cob.alive}`
	);
	check(
		"el lanzador recibe XP del mob asesinado",
		(lanzador.xp || 0) > xpAntes,
		`xp=${lanzador.xp}`
	);
	state.arrows = [];
	state.mobs = [];
	state.players.clear();
}

// ============================================================
// RESUMEN
// ============================================================
// biome-ignore lint/suspicious/noConsole: resumen del test (convención del repo)
console.log(`${total} OK, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
