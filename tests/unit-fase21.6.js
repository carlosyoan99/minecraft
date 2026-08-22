"use strict";
// ============================================================
// TESTS DE LA FASE 21.6 — Correcciones de la auditoría 2026-08-22
// y paridad MC (pre-F22). Orden de implementación acordado:
//   A seguridad (/locate incremental, allowlist Origin)
//   B escudo y maza (proyectil, reválida mano, desgastes)
//   C mochila (clamp MAX_STACK sin pérdida, close, repintado)
//   D jukebox/note block (validación, stopDisc, persistencia)
//   E /summon (cuota global + clamp de coords)
//   F cliente trivial (powerPreference — tripwire de fuente)
//   P paridad MC (escudo total, pesca 5-30 s, loot fiel, miel,
//     bambú 2→2, maza consume caída, blast furnace data-driven)
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Reporter, withRandom } = require("./helpers.js");
const r = new Reporter();

const commands = require("../server/commands.js");
const timers = require("../server/timers.js");
const biomes = require("../server/biomes.js");
const combat = require("../server/combat.js");
const constants = require("../server/constants.js");
const actions = require("../server/actions.js");
const state = require("../server/state.js");
const world = require("../server/world.js");
const save = require("../server/save.js");
const mobs = require("../server/mobs.js");
const mobSpawn = require("../server/mob-spawn.js");
const fishing = require("../server/fishing.js");

const {
	I,
	B,
	MAX_STACK,
	SHIELD_DURABILITY,
	SHIELD_BLOCK_FACTOR,
	FOOD_VALUES,
	BLAST_SMELT_RESULTS,
	isBlastSmelt,
	WORLD_MIN_Y,
	WORLD_MAX_Y
} = constants;
const { damagePlayer } = combat;

// ------------------------------------------------------------
// BLOQUE A2 — allowlist de Origin (auditoría 2026-08-22 #2)
// El bypass antiguo (`hostname sin ":" → true`) dejaba pasar cualquier
// dominio externo escrito sin puerto; ahora se asume el puerto por defecto
// del esquema (80 http / 443 https) y se aplica la MISMA allowlist.
// ------------------------------------------------------------
const CASOS_ORIGIN = [
	["http://evil.com", false],
	["https://evil.com", false],
	["http://example.com", false],
	["http://example.com:8080", false],
	["http://localhost", true],
	["https://localhost", true],
	["http://localhost:3000", true], // loopback: cualquier puerto, como antes
	["http://127.0.0.1", true],
	["http://[::1]", true],
	["http://192.168.1.50", true],
	["http://192.168.1.50:8080", true],
	["http://10.0.0.7", true]
];
for (const [origin, esperado] of CASOS_ORIGIN) {
	r.check(
		`A2 originAllowed(${origin}) === ${esperado}`,
		timers.originAllowed(origin) === esperado
	);
}
r.check(
	"A2 sin Origin sigue permitido (tests/E2E)",
	timers.originAllowed(undefined) === true
);

// ------------------------------------------------------------
// BLOQUE A1 — escaneo incremental de biomas para /locate
// Stub determinista de getBiome: mundo sintético independiente de la seed.
// ------------------------------------------------------------
function conGetBiomeStub(stub, cb) {
	const orig = biomes.getBiome;
	biomes.getBiome = stub;
	try {
		return cb();
	} finally {
		biomes.getBiome = orig;
	}
}

const {
	createBiomeScan,
	invalidateBiomeScanCache,
	_biomeScanCache,
	getCachedBiome,
	LOCATE_BIOME_RADIUS,
	LOCATE_BIOME_STEP,
	LOCATE_BIOME_BUDGET,
	LOCATE_BIOME_CACHE_TTL_MS
} = commands;

// Malla completa del radio: anillos r = paso..radio; por columna i ∈ [-r..r]
// se evalúan 4 bordes (esquinas duplicadas, igual que el barrido original).
let MALLA_COMPLETA = 0;
for (
	let rr = LOCATE_BIOME_STEP;
	rr <= LOCATE_BIOME_RADIUS;
	rr += LOCATE_BIOME_STEP
)
	MALLA_COMPLETA += 4 * ((2 * rr) / LOCATE_BIOME_STEP + 1);

// 1) Peor caso (bioma ausente en todo el radio): ningún tramo supera el
//    presupuesto y se evalúa exactamente la malla completa.
conGetBiomeStub(
	() => "__nada__",
	() => {
		const scan = createBiomeScan("__objetivo_ausente__", 0, 0);
		let pasos = 0;
		while (!scan.done && pasos < 10000) {
			const res = scan.step(LOCATE_BIOME_BUDGET);
			r.check(
				"A1 presupuesto por tramo respetado",
				res.used <= LOCATE_BIOME_BUDGET,
				`used=${res.used}`
			);
			pasos++;
		}
		r.check(
			"A1 peor caso termina sin resultado",
			scan.done && scan.best === null
		);
		r.check(
			"A1 evalúa exactamente la malla completa",
			scan.evals === MALLA_COMPLETA,
			`${scan.evals} vs ${MALLA_COMPLETA}`
		);
	}
);

// 2) Equivalencia: partir en tramos da el MISMO resultado y el MISMO número
//    de evaluaciones que una sola pasada infinita (punto plantado en la
//    malla; el early-exit para ambas en el mismo anillo).
conGetBiomeStub(
	(x, z) => (x === 32 && z === 40 ? "__test_bioma__" : "__nada__"),
	() => {
		const unica = createBiomeScan("__test_bioma__", 0, 0);
		unica.step(Infinity);
		const aTramos = createBiomeScan("__test_bioma__", 0, 0);
		while (!aTramos.done) aTramos.step(LOCATE_BIOME_BUDGET);
		r.check(
			"A1 pasada única encuentra el punto plantado",
			unica.best && unica.best.x === 32 && unica.best.z === 40
		);
		r.check(
			"A1 por tramos mismo resultado",
			aTramos.best && aTramos.best.x === 32 && aTramos.best.z === 40
		);
		r.check(
			"A1 mismas evaluaciones en ambos caminos",
			unica.evals === aTramos.evals,
			`${unica.evals} vs ${aTramos.evals}`
		);
		r.check(
			"A1 early-exit activo (menos que la malla completa)",
			aTramos.evals < MALLA_COMPLETA,
			`${aTramos.evals} < ${MALLA_COMPLETA}`
		);
	}
);

// 3) Caché anti-spam: miss → hit → TTL caducado → invalidación total.
invalidateBiomeScanCache();
r.check("A1 caché vacía tras invalidar", _biomeScanCache.size === 0);
r.check("A1 caché miss → null", getCachedBiome("plains", "tester") === null);
_biomeScanCache.set("plains|tester", { x: 5, z: 6, at: Date.now() });
{
	const hit = getCachedBiome("plains", "tester");
	r.check("A1 caché hit devuelve coords", !!hit && hit.x === 5 && hit.z === 6);
}
_biomeScanCache.set("plains|viejo", {
	x: 9,
	z: 9,
	at: Date.now() - LOCATE_BIOME_CACHE_TTL_MS - 1
});
r.check(
	"A1 caché TTL caducada → null",
	getCachedBiome("plains", "viejo") === null
);
r.check(
	"A1 caché TTL elimina la entrada caducada",
	!_biomeScanCache.has("plains|viejo")
);
invalidateBiomeScanCache();

// ------------------------------------------------------------
// BLOQUE B — escudo y maza (damagePlayer/applyToolWear con mock)
// ------------------------------------------------------------
function mkCombatPlayer(overrides = {}) {
	return {
		id: "cbt",
		name: "combat-test",
		x: 0,
		y: 64,
		z: 0,
		health: 20,
		absorption: 0,
		selectedSlot: 0,
		blocking: false,
		inventory: [null],
		ws: { readyState: 1, send() {} },
		...overrides
	};
}

{
	// B1/P1: el daño de PROYECTIL entra por la rama del escudo (antes muerta)
	// y con P1 el factor es 0 → bloqueo TOTAL estilo MC Java.
	r.check(
		"P1 SHIELD_BLOCK_FACTOR fijado a bloqueo total (0)",
		SHIELD_BLOCK_FACTOR === 0
	);
	const p = mkCombatPlayer({
		blocking: true,
		inventory: [{ id: I.SHIELD, durability: SHIELD_DURABILITY }]
	});
	damagePlayer(p, 3, { source: "projectile", armor: false });
	r.check(
		"B1 proyectil bloqueado por el escudo",
		p.health === 20,
		`health=${p.health}`
	);
	r.check(
		"B1 impacto bloqueado desgasta el escudo",
		p.inventory[0].durability === SHIELD_DURABILITY - 1
	);

	// P1: golpe de MOB también bloqueo total; el AMBIENTAL (lava) pasa íntegro.
	const m = mkCombatPlayer({
		blocking: true,
		inventory: [{ id: I.SHIELD, durability: SHIELD_DURABILITY }]
	});
	damagePlayer(m, 6, { source: "mob", armor: false });
	r.check(
		"P1 golpe de zombi con escudo → 0 daño",
		m.health === 20,
		`health=${m.health}`
	);
	const lava = mkCombatPlayer({
		blocking: true,
		inventory: [{ id: I.SHIELD, durability: SHIELD_DURABILITY }]
	});
	damagePlayer(lava, 5, { source: "lava", armor: false });
	r.check(
		"P1 daño ambiental (lava) NO se bloquea",
		lava.health === 15,
		`health=${lava.health}`
	);

	// B2: flag blocking a true pero SIN escudo en mano → sin mitigación ni
	// desgaste (el servidor reválida la mano en cada impacto).
	const q = mkCombatPlayer({ blocking: true, inventory: [null] });
	damagePlayer(q, 3, { source: "projectile", armor: false });
	r.check("B2 sin escudo en mano no mitiga (3→0)", q.health === 17);
	r.check("B2 sin escudo en mano no desgasta", !q.inventory[0]);
}

{
	// B4: el desgaste es POR IMPACTO BLOQUEADO, decidido ANTES de armadura.
	// Con P1 (factor 0) el daño post-bloqueo es 0: bajo la regla vieja
	// (`real >= 1` post-mitigación) el escudo era eterno — auditoría #4.
	const p = mkCombatPlayer({
		blocking: true,
		inventory: [{ id: I.SHIELD, durability: SHIELD_DURABILITY }]
	});
	damagePlayer(p, 4, { source: "mob", armor: false });
	damagePlayer(p, 4, { source: "mob", armor: false });
	r.check(
		"B4 dos impactos bloqueados → desgaste 2 (aunque el daño pase sea 0)",
		p.inventory[0].durability === SHIELD_DURABILITY - 2,
		`dur=${p.inventory[0].durability}`
	);
	// Impacto NO bloqueado → sin desgaste adicional.
	const q = mkCombatPlayer({
		inventory: [{ id: I.SHIELD, durability: SHIELD_DURABILITY }]
	});
	damagePlayer(q, 2, { source: "mob", armor: false });
	r.check(
		"B4 golpe no bloqueado no desgasta el escudo",
		q.inventory[0].durability === SHIELD_DURABILITY
	);
}

{
	// B3: la maza se desgasta al golpear; un ítem no-herramienta sigue sin
	// desgastarse al atacar; regresión: la espada igual que siempre.
	const { applyToolWear } = combat;
	const mace = mkCombatPlayer({
		inventory: [{ id: I.MACE, durability: 250 }]
	});
	r.check(
		"B3 la maza pierde durabilidad al golpear",
		applyToolWear(mace, true) === false && mace.inventory[0].durability === 249
	);
	const mano = mkCombatPlayer({ inventory: [{ id: 9999, durability: 10 }] });
	r.check(
		"B3 no-herramienta no se desgasta atacando",
		applyToolWear(mano, true) === false && mano.inventory[0].durability === 10
	);
	const sword = mkCombatPlayer({
		inventory: [{ id: I.IRON_SWORD, durability: 250 }]
	});
	r.check(
		"B3 regresión espada: desgaste al golpear intacto",
		applyToolWear(sword, true) === false &&
			sword.inventory[0].durability === 249
	);
}

// ------------------------------------------------------------
// BLOQUE C3 — mochila/Bundle: fusión parcial hasta MAX_STACK SIN pérdida
// (la versión con clamp destruía el excedente; la spec pide split estilo
// addToInventory SV-5). C1/C2 (cliente) van como tripwires de fuente al final.
// ------------------------------------------------------------
function mkBundlePlayer(overrides = {}) {
	return {
		id: "bdl",
		name: "bundle-test",
		x: 0,
		y: 64,
		z: 0,
		health: 20,
		selectedSlot: 0,
		blocking: false,
		openBundle: true,
		bundle: new Array(9).fill(null),
		inventory: new Array(36).fill(null),
		ws: { readyState: 1, send() {} },
		send() {}, // jukebox_state va por p.send (D1 lo usa también)
		...overrides
	};
}
const slot = (id, count, durability = 0) => ({ id, count, durability });

{
	// C3-1: put explícito con fusión que cabe → suma íntegra.
	const p = mkBundlePlayer();
	p.inventory[0] = slot(I.COD, 30);
	p.bundle[0] = slot(I.COD, 20);
	actions.handleBundleAction(p, p.ws, {
		action: "put",
		invSlot: 0,
		bundleSlot: 0
	});
	r.check(
		"C3-1 put explícito fusiona 20+30=50",
		p.bundle[0].count === 50,
		`count=${p.bundle[0].count}`
	);
	r.check("C3-1 put explícito consume el origen", p.inventory[0] === null);

	// C3-2: put explícito con desborde → llena a 64 y el excedente SE QUEDA.
	const q = mkBundlePlayer();
	q.inventory[0] = slot(I.COD, 50);
	q.bundle[0] = slot(I.COD, 40); // caben 24 → sobran 26
	actions.handleBundleAction(q, q.ws, {
		action: "put",
		invSlot: 0,
		bundleSlot: 0
	});
	r.check(
		"C3-2 put desbordado llena a MAX_STACK",
		q.bundle[0].count === MAX_STACK,
		`count=${q.bundle[0].count}`
	);
	r.check(
		"C3-2 el excedente vuelve al inventario (26)",
		q.inventory[0] && q.inventory[0].count === 26,
		`inv=${q.inventory[0]?.count}`
	);
	r.check(
		"C3-2 nada se pierde (64+26=90)",
		q.bundle[0].count + q.inventory[0].count === 90
	);

	// C3-3: put automático con desborde → llena el stack y hace SPLIT del
	// excedente en el siguiente hueco del propio bundle (nunca >64, nada
	// perdido ni en el inventario).
	const a = mkBundlePlayer();
	a.inventory[0] = slot(I.COD, 50);
	a.bundle[0] = slot(I.COD, 40);
	actions.handleBundleAction(a, a.ws, { action: "put", invSlot: 0 });
	r.check(
		"C3-3 put automático clamp a MAX_STACK",
		a.bundle[0].count === MAX_STACK
	);
	r.check(
		"C3-3 split del excedente en el hueco contiguo",
		a.bundle[1] && a.bundle[1].count === 26,
		`b1=${a.bundle[1]?.count}`
	);
	r.check("C3-3 la mano queda libre tras el split", a.inventory[0] === null);

	// C3-4: take explícito con desborde → inventario a 64, resto en mochila.
	const t = mkBundlePlayer();
	t.bundle[0] = slot(I.COD, 50);
	t.inventory[0] = slot(I.COD, 40); // caben 24 → quedan 26 en la mochila
	actions.handleBundleAction(t, t.ws, {
		action: "take",
		bundleSlot: 0,
		invSlot: 0
	});
	r.check(
		"C3-4 take desbordado llena a MAX_STACK",
		t.inventory[0].count === MAX_STACK
	);
	r.check(
		"C3-4 el excedente permanece en la mochila",
		t.bundle[0] && t.bundle[0].count === 26,
		`bundle=${t.bundle[0]?.count}`
	);

	// C3-5: take automático con desborde.
	const u = mkBundlePlayer();
	u.bundle[0] = slot(I.COD, 50);
	u.inventory[0] = slot(I.COD, 40);
	actions.handleBundleAction(u, u.ws, { action: "take", bundleSlot: 0 });
	r.check(
		"C3-5 take automático clamp a MAX_STACK",
		u.inventory[0].count === MAX_STACK
	);
	r.check(
		"C3-5 take automático conserva excedente en hueco",
		u.inventory[1] && u.inventory[1].count === 26,
		`inv1=${u.inventory[1]?.count}`
	);
	r.check("C3-5 take automático bundle vacío tras split", u.bundle[0] === null);

	// C3-6: round-trip completo jamás supera MAX_STACK y conserva el total.
	const rt = mkBundlePlayer();
	rt.inventory[0] = slot(I.COD, 64);
	rt.inventory[1] = slot(I.COD, 64);
	actions.handleBundleAction(rt, rt.ws, {
		action: "put",
		invSlot: 0,
		bundleSlot: 0
	});
	actions.handleBundleAction(rt, rt.ws, {
		action: "put",
		invSlot: 1,
		bundleSlot: 0
	});
	actions.handleBundleAction(rt, rt.ws, { action: "take", bundleSlot: 0 });
	const total =
		rt.bundle.reduce((s, x) => s + (x ? x.count : 0), 0) +
		rt.inventory.reduce((s, x) => s + (x ? x.count : 0), 0);
	const maxCount = Math.max(
		...rt.bundle.map((x) => (x ? x.count : 0)),
		...rt.inventory.map((x) => (x ? x.count : 0))
	);
	r.check(
		"C3-6 round-trip conserva 128 ítems",
		total === 128,
		`total=${total}`
	);
	r.check(
		"C3-6 round-trip nunca >MAX_STACK",
		maxCount <= MAX_STACK,
		`max=${maxCount}`
	);

	// C3-7: destino con OTRO ítem → rechazo limpio (sin tocar nada).
	const d = mkBundlePlayer();
	d.inventory[0] = slot(I.BEEF, 5);
	d.bundle[0] = slot(I.COD, 10);
	actions.handleBundleAction(d, d.ws, {
		action: "put",
		invSlot: 0,
		bundleSlot: 0
	});
	r.check(
		"C3-7 put sobre otro ítem rechazado",
		d.inventory[0].count === 5 && d.bundle[0].count === 10
	);
}

// ------------------------------------------------------------
// BLOQUE D1 — validación server-side de jukebox/note block
// (coords finitas, distancia NaN-safe y tipo de bloque objetivo).
// Stub de world.getBlock: sombra own-property sobre el método del prototipo
// (convención POO F13); delete la retira y el prototipo vuelve a mandar.
// ------------------------------------------------------------
function stubGetBlock(fn, cb) {
	world.getBlock = fn;
	try {
		return cb();
	} finally {
		delete world.getBlock;
	}
}
function mkMusicaPlayer(overrides = {}) {
	return mkBundlePlayer({
		x: 10,
		y: 65,
		z: 12, // a 2 bloques del jukebox de prueba (10,64,10)
		selectedSlot: 0,
		inventory: new Array(36).fill(null),
		...overrides
	});
}

{
	const eventos = [];
	actions.setBroadcastNearFn((ev, data) => eventos.push({ ev, data }));
	try {
		// Rechazos: NaN, string, distancia y bloque objetivo equivocado.
		stubGetBlock(
			() => B.JUKEBOX,
			() => {
				const p1 = mkMusicaPlayer();
				p1.inventory[0] = slot(I.MUSIC_DISC_CAT, 1);
				actions.handleJukeboxInteract(p1, p1.ws, {
					x: Number.NaN,
					y: 64,
					z: 10
				});
				r.check("D1 coords NaN rechazadas", !state.jukeboxes.has("NaN,64,10"));
				r.check("D1 coords NaN no consumen el disco", p1.inventory[0] !== null);

				const p2 = mkMusicaPlayer();
				actions.handleJukeboxInteract(p2, p2.ws, { x: "abc", y: 64, z: 10 });
				r.check(
					"D1 coords no numéricas rechazadas",
					eventos.filter((e) => e.ev === "jukebox_state").length === 0
				);
			}
		);

		// Distancia: el jugador está lejos (>6 bloques) → rechazo.
		stubGetBlock(
			(x, y, z) => (x === 100 && y === 64 && z === 100 ? B.JUKEBOX : 0),
			() => {
				const far = mkMusicaPlayer({ x: 10, y: 65, z: 12 });
				far.inventory[0] = slot(I.MUSIC_DISC_CAT, 1);
				const antes = state.jukeboxes.size;
				actions.handleJukeboxInteract(far, far.ws, { x: 100, y: 64, z: 100 });
				r.check(
					"D1 jukebox lejano rechazado (sin entrada nueva)",
					state.jukeboxes.size === antes && far.inventory[0] !== null
				);
			}
		);

		// El bloque objetivo NO es un jukebox → rechazo aunque las coords valgan.
		stubGetBlock(
			() => 0 /* aire */,
			() => {
				const p = mkMusicaPlayer();
				p.inventory[0] = slot(I.MUSIC_DISC_CAT, 1);
				actions.handleJukeboxInteract(p, p.ws, { x: 10, y: 64, z: 10 });
				r.check(
					"D1 bloque no-jukebox rechazado",
					!state.jukeboxes.has("10,64,10")
				);
				r.check(
					"D1 bloque no-jukebox conserva el disco",
					p.inventory[0] !== null
				);

				// Note block igual: sin NOTE_BLOCK real no hay note_play.
				const n = mkMusicaPlayer();
				const antes = eventos.length;
				actions.handleNoteBlockClick(n, n.ws, { x: 10, y: 64, z: 10 });
				r.check(
					"D1 note_play sin note block real → nada",
					eventos.length === antes
				);
			}
		);

		// Camino FELIZ: insertar y extraer un disco de un jukebox real.
		stubGetBlock(
			(x, y, z) => (x === 10 && y === 64 && z === 10 ? B.JUKEBOX : 0),
			() => {
				const p = mkMusicaPlayer();
				p.inventory[0] = slot(I.MUSIC_DISC_CAT, 1);
				actions.handleJukeboxInteract(p, p.ws, { x: 10, y: 64, z: 10 });
				const entrada = state.jukeboxes.get("10,64,10");
				r.check(
					"D1 inserción registra el disco",
					!!entrada && entrada.disc === I.MUSIC_DISC_CAT
				);
				r.check(
					"D1 inserción consume el disco de la mano",
					p.inventory[0] === null
				);

				// Extraer: mano vacía + jukebox ocupado → disco devuelto.
				p.inventory[0] = null;
				actions.handleJukeboxInteract(p, p.ws, { x: 10, y: 64, z: 10 });
				r.check(
					"D1 extracción devuelve el disco",
					p.inventory[0] && p.inventory[0].id === I.MUSIC_DISC_CAT
				);
				r.check(
					"D1 extracción limpia el estado",
					!state.jukeboxes.has("10,64,10")
				);

				// Note block feliz: emite exactamente un note_play con nota 0-24.
				state.jukeboxes.delete("10,64,10"); // higiene entre stubs
				stubGetBlock(
					(x, y, z) => (x === 10 && y === 64 && z === 10 ? B.NOTE_BLOCK : 0),
					() => {
						const antes = eventos.filter((e) => e.ev === "note_play").length;
						const n = mkMusicaPlayer();
						actions.handleNoteBlockClick(n, n.ws, { x: 10, y: 64, z: 10 });
						const plays = eventos.filter((e) => e.ev === "note_play");
						r.check(
							"D1 note block real emite UN note_play",
							plays.length === antes + 1
						);
						r.check(
							"D1 nota en rango MC 0-24",
							plays.length > 0 &&
								plays[plays.length - 1].data.note >= 0 &&
								plays[plays.length - 1].data.note <= 24
						);
					}
				);
			}
		);
	} finally {
		actions.setBroadcastNearFn(() => {}); // restaurar inyección noop
		state.jukeboxes.clear(); // higiene para D3/E1
	}
}

// ------------------------------------------------------------
// BLOQUE E1 — /summon con cuota global (MOB_TOTAL) y clamp de coords
// Harness mínimo como unit-commands.js (ctx inyectado, ws capturado).
// ------------------------------------------------------------
function mkCmdHarness() {
	const sent = [];
	const ws = { readyState: 1, send: (s) => sent.push(JSON.parse(s)) };
	const player = {
		id: "op1",
		name: "op",
		ws,
		x: 0.5,
		y: 64,
		z: 0.5,
		yaw: 0,
		pitch: 0,
		health: 20,
		maxHealth: 20,
		xp: 0,
		level: 0,
		food: 20,
		saturation: 20,
		lastMoveTime: 0,
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		isOp: true // solo-OP intacto (gate probado en unit-commands)
	};
	const ctx = {
		state,
		world,
		broadcast: () => {},
		playerHelpers: require("../server/players.js"),
		viewDistance: 2
	};
	return { player, sent, ctx };
}
{
	const { player, sent, ctx } = mkCmdHarness();
	const half = constants.worldHalfExtent();

	// Clamp de coords: summon fuera de bordes → dentro del mundo (SV-6).
	state.mobs = [];
	commands.executeCommand(
		player,
		`/summon zombie ${half * 10} 500 ${-half * 10}`,
		ctx
	);
	r.check(
		"E1 summon crea exactamente un mob",
		state.mobs.length === 1,
		`len=${state.mobs.length}`
	);
	if (state.mobs.length === 1) {
		const mob = state.mobs[0];
		r.check(
			"E1 x clampeada a bordes",
			mob.x >= -(half - 0.6) - 1e-9 && mob.x <= half - 0.6 + 1e-9,
			`x=${mob.x}`
		);
		r.check(
			"E1 z clampeada a bordes",
			mob.z >= -(half - 0.6) - 1e-9 && mob.z <= half - 0.6 + 1e-9,
			`z=${mob.z}`
		);
		r.check(
			"E1 y clampeada al rango vertical del mundo",
			mob.y >= WORLD_MIN_Y + 1 && mob.y <= WORLD_MAX_Y,
			`y=${mob.y}`
		);
	}

	// Cuota global: con MOB_TOTAL mobs vivos el excedente se rechaza.
	state.mobs = Array.from({ length: mobSpawn.MOB_TOTAL }, (_, i) => ({
		id: `dummy${i}`,
		type: "cow",
		alive: true,
		x: 0,
		y: 64,
		z: 0,
		health: 10
	}));
	sent.length = 0;
	commands.executeCommand(player, "/summon zombie", ctx);
	r.check(
		"E1 cuota llena rechaza el spawn",
		state.mobs.length === mobSpawn.MOB_TOTAL
	);
	r.check(
		"E1 mensaje de cuota al operador",
		sent.some((m) => m.event === "chat" && /Cuota/i.test(m.data?.message || ""))
	);
	state.mobs = []; // higiene
}

// ------------------------------------------------------------
// BLOQUE P — paridad con Minecraft (decisión rectora 2026-08-22)
// P1 ya queda fijado arriba (factor 0 + casos mob/lava/proyectil).
// ------------------------------------------------------------

// P2: picada de pesca 5-30 s (MC real; revoca 1.5-5 s de F21.5).
r.check("P2 primera picada ≥5 s (BITE_MIN_MS)", fishing.BITE_MIN_MS === 5000);
r.check(
	"P2 ventana hasta 30 s (BITE_MIN_MS+BITE_RANGE_MS)",
	fishing.BITE_MIN_MS + fishing.BITE_RANGE_MS === 30000
);

// P3: tabla de loot fiel — categorías ≈85/5/10 y sin ítems prohibidos.
{
	r.check(
		"P3 sin COOKED_COD crudo en el pool de peces",
		!fishing.FISHING_LOOT.fish.some((e) => e.id === I.COOKED_COD)
	);
	r.check(
		"P3 sin FLINT en el tesoro",
		!fishing.FISHING_LOOT.treasure.some((e) => e.id === I.FLINT)
	);
	const conteo = { fish: 0, treasure: 0, junk: 0 };
	withRandom(216216, () => {
		for (let i = 0; i < 12000; i++) conteo[fishing.rollLootItem().category]++;
	});
	const pct = (n) => n / 120; // % sobre 12000 tiradas
	r.check(
		"P3 peces ≈85 %",
		pct(conteo.fish) >= 82 && pct(conteo.fish) <= 88,
		`${pct(conteo.fish)}%`
	);
	r.check(
		"P3 tesoro ≈5 %",
		pct(conteo.treasure) >= 3 && pct(conteo.treasure) <= 7,
		`${pct(conteo.treasure)}%`
	);
	r.check(
		"P3 basura ≈10 %",
		pct(conteo.junk) >= 7 && pct(conteo.junk) <= 13,
		`${pct(conteo.junk)}%`
	);
}

// P4: saturación de la botella de miel 2,4 (mod 0,4 de MC; revoca 1,2).
r.check("P4 miel restaura 6 de hambre", FOOD_VALUES[I.HONEY_BOTTLE].food === 6);
r.check(
	"P4 saturación miel 2.4",
	FOOD_VALUES[I.HONEY_BOTTLE].saturation === 2.4
);

// P5: tablones de bambú ratio MC 1:1 (2 bambú en columna → 2 tablones).
{
	const recetas = JSON.parse(
		fs.readFileSync(path.join(__dirname, "..", "recetas.json"), "utf8")
	);
	const bamboo = recetas.bamboo_planks;
	r.check(
		"P5 bambú: forma 2×1 (columna)",
		JSON.stringify(bamboo.shape) === JSON.stringify(["B", "B"])
	);
	r.check(
		"P5 bambú: 2 bambú → 2 tablones",
		bamboo.ingredients.B === 80 &&
			bamboo.result.id === 81 &&
			bamboo.result.count === 2,
		`in=${bamboo.ingredients.B} out=${bamboo.result.count}`
	);
}

// P6/B3: la maza consume la caída al impactar (fallFromY → null) y desgasta.
{
	actions.setBroadcastFn(() => {}); // inyección noop explícita para este test
	const cow = mobs.createMob("cow", 1.5, 64, 1.5);
	state.mobs.push(cow);
	const p = mkCombatPlayer({
		name: "mazazo",
		x: 0.5,
		y: 64,
		z: 0.5,
		inventory: [{ id: I.MACE, durability: 250 }],
		fallFromY: 66 // 2 bloques caídos (≥ MACE_FALL_MIN_BLOCKS 1.5)
	});
	actions.handleAttackMob(p, p.ws, { mobId: cow.id });
	r.check(
		"P6 el bonus de caída se consume (fallFromY → null)",
		p.fallFromY === null,
		`fallFromY=${p.fallFromY}`
	);
	r.check(
		"B3 el golpe con maza desgasta durabilidad",
		p.inventory[0].durability === 249,
		`dur=${p.inventory[0].durability}`
	);

	// Sin caída acumulada: el segundo golpe no tiene bonus y fallFromY sigue null.
	actions.handleAttackMob(p, p.ws, { mobId: cow.id });
	r.check(
		"P6 segundo golpe sin caída: sin bonus que gastar",
		p.fallFromY === null
	);
	state.mobs = state.mobs.filter((m) => m.id !== cow.id); // higiene
}

// P7: elegibilidad del blast furnace data-driven (hierro/oro/cobre hoy;
// lista extensible — coordinación con F22 A5 anotada en TODO.md).
r.check(
	"P7 BLAST_SMELT_RESULTS contiene hierro/oro/cobre",
	BLAST_SMELT_RESULTS.has(I.IRON_INGOT) &&
		BLAST_SMELT_RESULTS.has(I.GOLD_INGOT) &&
		BLAST_SMELT_RESULTS.has(I.COPPER_INGOT)
);
r.check(
	"P7 isBlastSmelt rechaza comida",
	isBlastSmelt(I.BEEF) === false && isBlastSmelt(I.BREAD) === false
);

// ------------------------------------------------------------
// BLOQUE D3 — persistencia de discos insertados (world.json, aditivo,
// SCHEMA_VERSION intacto): round-trip guardar→cargar con filtrado defensivo.
// Se ejecuta AL FINAL (redirige worldPaths a un directorio temporal).
// ------------------------------------------------------------
{
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-fase216-d3-"));
	const rootOriginal = constants.worldPaths.worldRoot;
	try {
		// Redirigir el raíz ANTES de derivar rutas (patrón unit-persistencia):
		// setWorldSeed recalcula worldDir/chunksDir/metaFile desde worldRoot.
		constants.worldPaths.worldRoot = path.join(TMP, "worldroot");
		constants.setWorldSeed("fase216d3");
		fs.mkdirSync(constants.worldPaths.chunksDir, { recursive: true });

		state.mobs = [];
		state.furnaces.clear();
		state.chests.clear();
		state.crops.clear();
		state.jukeboxes.set("1,2,3", { disc: I.MUSIC_DISC_CAT });
		state.jukeboxes.set("4,5,6", { disc: I.MUSIC_DISC_13 });
		save.saveWorld();

		const metaFile = constants.worldPaths.metaFile;
		const meta = JSON.parse(fs.readFileSync(metaFile, "utf8"));
		r.check(
			"D3 buildMeta persiste los jukeboxes",
			Array.isArray(meta.jukeboxes) && meta.jukeboxes.length === 2,
			`len=${meta.jukeboxes?.length}`
		);
		r.check("D3 SCHEMA_VERSION intacto (6)", meta.schemaVersion === 6);

		// Entradas basura en el JSON → filtradas al cargar (lectura defensiva).
		meta.jukeboxes.push(["malo", { disc: "no-soy-numero" }]);
		meta.jukeboxes.push([123, { disc: I.MUSIC_DISC_CAT }]);
		fs.writeFileSync(metaFile, JSON.stringify(meta));
		state.jukeboxes.clear();
		r.check("D3 loadWorld OK tras guardar", save.loadWorld() === true);
		r.check(
			"D3 discos restaurados tras reinicio",
			state.jukeboxes.size === 2 &&
				state.jukeboxes.get("1,2,3")?.disc === I.MUSIC_DISC_CAT &&
				state.jukeboxes.get("4,5,6")?.disc === I.MUSIC_DISC_13,
			`size=${state.jukeboxes.size}`
		);
		state.jukeboxes.clear();
	} finally {
		constants.worldPaths.worldRoot = rootOriginal;
		constants.setWorldSeed(constants.SEED);
		state.jukeboxes.clear();
	}
}

// ------------------------------------------------------------
// TRIPWIRES de cliente (módulos ESM/DOM no importables en Node): presencia
// de los cambios en fuente — detectan eliminaciones accidentales.
// ------------------------------------------------------------
const leerPub = (f) =>
	fs.readFileSync(path.join(__dirname, "..", "public", f), "utf8");

{
	// F1: powerPreference high-performance en la creación del renderer.
	r.check(
		"F1 scene.js usa powerPreference high-performance",
		leerPub("scene.js").includes('"high-performance"')
	);
	// D2: stopDisc en showMenu, init (reconexión) y muerte local.
	const menusSrc = leerPub("menus.js");
	r.check(
		"D2 showMenu para el disco",
		/export function showMenu\([\s\S]{0,400}?stopDisc\(\)/.test(menusSrc)
	);
	const netSrc = leerPub("network.js");
	r.check(
		"D2 init/reconexión para el disco",
		/case "init": \{[\s\S]{0,220}?stopDisc\(\)/.test(netSrc)
	);
	r.check(
		"D2 muerte local para el disco",
		/player_die":[\s\S]{0,420}?stopDisc\(\)/.test(netSrc)
	);
	// C1/C2: cierre de sesión del bundle y repintado de su columna.
	const panelsSrc = leerPub("panels.js");
	r.check(
		"C1 toggleBundleUI captura wasOpen antes de asignar",
		/const wasOpen = bundleOpen;/.test(panelsSrc)
	);
	r.check(
		"C1 ocultar envía bundle_action close",
		/action: "close"/.test(panelsSrc)
	);
	const uiSrc = leerPub("ui.js");
	r.check(
		"C2 applyInventory repinta la columna del bundle",
		/isBundleOpen\(\)\)\s*updateBundleInventoryUI\(\);/.test(uiSrc)
	);
}

r.done();
