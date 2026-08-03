"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 3 (herramienta reutilizable)
// 1) Balance del hambre: simulación por ticks (50ms) de los escenarios
//    clave y veredicto de "ritmo jugable".
// 2) Rendimiento del tick de mobs: benchmark con 30/100/300 mobs
//    (mezclando bebés de la cría) + coste del broadcast mobs_update.
// 3) Persistencia: round-trip de isBaby/age en restoreMobs.
// Uso: node tests/audit-fase3.js
//
// Notas de la simulación:
// - La muerte se detecta por el respawn (damagePlayer resetea la salud
//   DENTRO de la misma llamada, así que nunca se observa health 0).
// - Tiempos en ms (misma unidad que los acumuladores de tickPlayer).
// ============================================================
const path = require("path");
const ROOT = path.join(__dirname, "..");
const playersMod = require(path.join(ROOT, "server", "players.js"));
const mobsMod = require(path.join(ROOT, "server", "mobs.js"));
const state = require(path.join(ROOT, "server", "state.js"));
const world = require(path.join(ROOT, "server", "world.js"));

// Patch del mundo para simular sin chunks reales
world.getBlock = () => 3;
world.getHeight = () => 64;
world.setBlock = () => {}; // defensivo: solo se usa si un creeper explota

const CLOSED = 3;
const TICK = 50;
const mk = (o = {}) => ({
	id: "p",
	ws: { readyState: CLOSED, send() {} },
	health: 20,
	food: 20,
	saturation: 20,
	foodAccum: 0,
	regenAccum: 0,
	starveAccum: 0,
	lastMoveTime: 0,
	x: 0,
	y: 64,
	z: 0,
	...o
});

let fails = 0;
const check = (n, ok, extra) => {
	if (!ok) fails++;
	console.log(`${ok ? "PASS" : "FAIL"}: ${n}${extra ? " — " + extra : ""}`);
};
const fmt = (x) =>
	x === null
		? "nunca"
		: `${(x / 1000).toFixed(0)}s (~${Math.round(x / 60000)} min)`;

console.log("========== PARTE 1: BALANCE DEL HAMBRE ==========\n");

// A) Parado, sin daño ni comida: ¿cuándo baja el hambre y cuándo muere?
{
	const p = mk();
	let t = 0,
		sat0 = null,
		foodBaja = null,
		muere = null;
	while (t < 60 * 60 * 1000) {
		playersMod.tickPlayer(p, TICK);
		t += TICK;
		if (p.saturation === 0 && sat0 === null) sat0 = t;
		if (p.food < 20 && foodBaja === null) foodBaja = t;
		if (p.x === 0.5 && muere === null) {
			muere = t;
			break;
		} // respawn = muerte
	}
	console.log(
		`A) Parado: saturación agotada ${fmt(sat0)}, comida baja ${fmt(foodBaja)}, muerte por inanición ${fmt(muere)}`
	);
	check(
		"A: la comida aguanta >=8 min parado antes de bajar (amortiguador generoso)",
		foodBaja >= 480000,
		fmt(foodBaja)
	);
	check(
		"A: muere por inanición en 15-25 min (presión suave, sin espiral)",
		muere >= 900000 && muere <= 1500000,
		fmt(muere)
	);
}

// B) Moviéndose siempre (minar/explorar)
{
	const p = mk();
	let t = 0,
		foodBaja = null,
		muere = null;
	while (t < 60 * 60 * 1000) {
		p.lastMoveTime = Date.now();
		playersMod.tickPlayer(p, TICK);
		t += TICK;
		if (p.food < 20 && foodBaja === null) foodBaja = t;
		if (p.x === 0.5 && muere === null) {
			muere = t;
			break;
		}
	}
	console.log(
		`B) Moviéndose: comida baja ${fmt(foodBaja)}, muerte por inanición ${fmt(muere)}`
	);
	check(
		"B: en movimiento la comida aguanta >=4 min (exige comer, no castiga)",
		foodBaja >= 240000,
		fmt(foodBaja)
	);
	check(
		"B: muerte en 7.5-12.5 min moviéndose sin comer",
		muere >= 450000 && muere <= 750000,
		fmt(muere)
	);
}

// C) Regeneración tras una pelea breve (health 16): sana hasta food<18
{
	const p = mk({ health: 16 });
	let t = 0;
	while (p.food >= 18 && p.health < 20 && t < 60000) {
		playersMod.tickPlayer(p, TICK);
		t += TICK;
	}
	console.log(
		`C) Regenerar tras pelea breve (health 16): sana a ${p.health} en ${(t / 1000).toFixed(0)}s, food ${20}→${p.food}`
	);
	check(
		"C: la regen agota ~3 HP de reserva (16→19) y se detiene al llegar food<18 — fiel a Minecraft",
		p.health === 19 && p.food === 17 && t >= 4000 && t <= 10000,
		`health=${p.health} food=${p.food} t=${t / 1000}s`
	);
	console.log(
		"   (para curarse del todo hay que comer: la reserva de regen no llega a sanar el último punto)"
	);
}

// D) Pelea sostenida (2 de daño cada 2s): la reserva de regen dura unos segundos
{
	const p = mk();
	let t = 0,
		lastHit = -2000,
		regenStop = null,
		muere = null;
	while (t < 180 * 1000) {
		if (t - lastHit >= 2000 && p.health > 0) {
			p.health = Math.max(0, p.health - 2);
			lastHit = t;
		}
		playersMod.tickPlayer(p, TICK);
		t += TICK;
		if (p.food < 18 && regenStop === null && t > 2000) regenStop = t;
		if (p.health <= 0) {
			muere = t;
			break;
		} // aquí el golpe directo sí deja health 0
	}
	console.log(
		`D) Pelea sostenida (2 de daño/2s): reserva de regen agotada ${fmt(regenStop)}, muerte ${fmt(muere)}`
	);
	check(
		"D: la reserva de regen aguanta solo ~6s de pelea (no se puede tanquear)",
		regenStop >= 4000 && regenStop <= 8000,
		fmt(regenStop)
	);
	check(
		"D: morir a ~22s bajo 2 de daño/2s constantes es lo esperado",
		muere >= 15000 && muere <= 30000,
		fmt(muere)
	);
}

// E) Recuperación comiendo: cocinada vs cruda
{
	const p = mk({ food: 5, saturation: 3 });
	playersMod.eatFood(p, 111); // carne de vaca cocinada: +8 food, +12.8 sat
	check("E: comer cocinada (111) +8 food", p.food === 13, "food=" + p.food);
	check(
		"E: comer cocinada +12.8 sat",
		p.saturation === 15.8,
		"sat=" + p.saturation
	);
	const q = mk({ food: 5, saturation: 3 });
	playersMod.eatFood(q, 107); // cruda: +3 food, +1.8 sat
	check(
		"E: la cruda restaura menos (+3/+1.8) — incentiva el horno",
		q.food === 8 && q.saturation === 4.8,
		`food=${q.food} sat=${q.saturation}`
	);
	console.log(
		"   (una cocinada (+8) cubre ~40% de la barra: ~8 min parado / ~4 min moviéndose)"
	);
}

// F) Inanición: food 0 → muerte y respawn (reseteo completo)
{
	const p = mk({ food: 0, saturation: 0 });
	let t = 0,
		muere = null;
	while (t < 120 * 1000) {
		playersMod.tickPlayer(p, TICK);
		t += TICK;
		if (p.x === 0.5 && muere === null) {
			muere = t;
			break;
		}
	}
	check(
		"F: muerte por inanición en ~40s (health 20→0 a -1/2s)",
		muere >= 30000 && muere <= 50000,
		fmt(muere)
	);
	check(
		"F: el respawn resetea salud, food y saturación a 20",
		p.health === 20 && p.food === 20 && p.saturation === 20,
		`health=${p.health} food=${p.food} sat=${p.saturation}`
	);
}

console.log("\n========== PARTE 2: RENDIMIENTO DEL TICK DE MOBS ==========\n");
state.players.clear();
state.players.set("fp1", {
	id: "fp1",
	x: 1000,
	y: 64,
	z: 1000,
	ws: { readyState: CLOSED, send() {} }
});
state.players.set("fp2", {
	id: "fp2",
	x: -1000,
	y: 64,
	z: -1000,
	ws: { readyState: CLOSED, send() {} }
});

const TYPES = [
	"zombie",
	"creeper",
	"skeleton",
	"cow",
	"pig",
	"chicken",
	"sheep"
];
function bench(n, isNight) {
	state.mobs.length = 0;
	for (let i = 0; i < n; i++) {
		const m = new mobsMod.Mob(
			TYPES[i % TYPES.length],
			(i % 20) * 2,
			64,
			Math.floor(i / 20) * 2
		);
		if (i % 5 === 0) {
			m.isBaby = true;
			m.age = 0;
		} // mezcla de bebés (escenario de cría)
		state.mobs.push(m);
	}
	for (let i = 0; i < 200; i++) for (const m of state.mobs) m.tick(isNight); // calentamiento
	const T = 5000;
	const t0 = process.hrtime.bigint();
	for (let i = 0; i < T; i++) for (const m of state.mobs) m.tick(isNight);
	const ms = Number(process.hrtime.bigint() - t0) / 1e6;
	const perTick = ms / T;
	const perMob = (ms / T / n) * 1000;
	const snap = state.mobs.map(mobsMod.mobSnapshot);
	const t1 = process.hrtime.bigint();
	const json = JSON.stringify({ event: "mobs_update", data: snap });
	const jsonMs = Number(process.hrtime.bigint() - t1) / 1e6;
	console.log(
		`${n} mobs (${isNight ? "noche" : "día"}): ${perTick.toFixed(3)} ms/tick (${perMob.toFixed(2)} µs/mob), mobs_update ${(json.length / 1024).toFixed(1)} KB en ${jsonMs.toFixed(2)} ms`
	);
	return perTick;
}
const t30 = bench(30, false);
const t100 = bench(100, false);
const t300 = bench(300, false);
const t300n = bench(300, true);
check(
	"Perf: 30 mobs (típico) < 0.5 ms/tick (presupuesto de 50ms)",
	t30 < 0.5,
	t30.toFixed(3) + "ms"
);
check(
	"Perf: 300 mobs (cría intensiva) < 2 ms/tick",
	t300 < 2,
	t300.toFixed(3) + "ms"
);
check(
	"Perf: escala lineal (300 <= ~12x de 30)",
	t300 <= t30 * 12,
	`${t30.toFixed(3)} → ${t300.toFixed(3)}`
);
check(
	"Perf: de noche (hostiles persiguiendo) no degrada",
	t300n < 2,
	t300n.toFixed(3) + "ms"
);

console.log("\n========== PARTE 3: PERSISTENCIA DE LA CRÍA ==========\n");
{
	const restored = mobsMod.restoreMobs([
		{
			id: "m1",
			type: "cow",
			x: 1,
			y: 64,
			z: 1,
			health: 10,
			isBaby: true,
			age: 12345
		}
	])[0];
	check("Persistencia: isBaby se restaura", restored.isBaby === true);
	check("Persistencia: age se restaura", restored.age === 12345);
	const old = mobsMod.restoreMobs([
		{ id: "m2", type: "pig", x: 0, y: 64, z: 0, health: 10 }
	])[0];
	check(
		"Persistencia: retrocompatible (guardado viejo → isBaby false, age 0)",
		old.isBaby === false && old.age === 0
	);
	check(
		"mobSnapshot incluye isBaby (el cliente escala a los bebés)",
		mobsMod.mobSnapshot(restored).isBaby === true
	);
}

console.log(
	`\n${fails === 0 ? "✅ AUDITORÍA: todos los checks pasan" : `❌ ${fails} checks fallaron`}`
);
process.exit(fails ? 1 : 0);
