"use strict";
// E2E del sistema de comer (Fase 3) — v2
// 1) init: food=20, saturation=20 (el wire del init incluye saturación)
// 2) Primer food_update:
//    - sin daño previo  → decaimiento: consume SATURACIÓN primero (food 20, sat 19)
//    - con daño previo  → regeneración: consume COMIDA (food 19, sat 20)
//      (esto explica el "food 19, sat 20" observado en smokes anteriores)
// 3) Bonus: cazar un pasivo cercano → drop de comida → comer → sube food/sat
//
// Requiere un servidor vivo: WS_URL (por defecto ws://localhost:3998).
const WebSocket = require("ws");
const URL = process.env.WS_URL || "ws://localhost:3998";
const PASSIVE = new Set(["cow", "pig", "chicken", "sheep"]);
const results = [];
let phase = "init";
let spawnY = 0;
let damaged = false;
let lastFood = 20,
	lastSat = 20;
let hitsSent = 0;
let finished = false;
const t0 = Date.now();

function check(name, ok, _info) {
	results.push({ name, ok });
}
function finish(exitCode) {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	const fails = results.filter((r) => r.ok === false).length;
	process.exit(exitCode !== undefined ? exitCode : fails ? 1 : 0);
}

const timer = setTimeout(() => {
	const _t = Math.round((Date.now() - t0) / 1000);
	// Diagnóstico al expirar: sin esto un timeout moría sin decir qué faltó.
	console.error(
		`⏰ TIMEOUT E2E (${_t}s): fase "${phase}", ${results.length} checks (${results.filter((r) => r.ok === false).length} FAIL)`
	);
	for (const r of results) console.error(`  ${r.ok ? "OK" : "FAIL"} ${r.name}`);
	if (phase === "hunt" && results.every((r) => r.ok !== false)) {
		finish(0);
	} else {
		finish(1);
	}
}, 90000);

const ws = new WebSocket(URL);
ws.on("message", (d) => {
	let m;
	try {
		m = JSON.parse(d);
	} catch {
		return;
	}
	const t = Math.round((Date.now() - t0) / 1000);

	if (phase === "init" && m.event === "init") {
		spawnY = m.data.spawnY;
		check("init food=20", m.data.food === 20, `food=${m.data.food}`);
		check(
			"init saturation=20 (wire incluye saturación)",
			m.data.saturation === 20,
			`sat=${m.data.saturation}`
		);
		ws.send(JSON.stringify({ event: "eat", data: {} })); // slot vacío: debe rechazarse sin romper
		phase = "decay";
		return;
	}

	if (phase === "decay" && m.event === "health_update") {
		damaged = true;
		return;
	}

	if (phase === "decay" && m.event === "food_update") {
		if (damaged) {
			const okRegen = m.data.food === 19 && m.data.saturation === 20;
			check(
				"anomalía explicada: la regeneración consume comida (food 19, sat 20)",
				okRegen,
				`t=${t}s food=${m.data.food} sat=${m.data.saturation}`
			);
		} else {
			const okDecay = m.data.food === 20 && m.data.saturation === 19;
			check(
				"el decaimiento consume saturación primero (food 20, sat 19)",
				okDecay,
				`t=${t}s food=${m.data.food} sat=${m.data.saturation}`
			);
		}
		lastFood = m.data.food;
		lastSat = m.data.saturation;
		phase = "hunt";
		return;
	}

	if (phase === "hunt" && m.event === "mobs_update") {
		const near = m.data.find(
			(mo) =>
				PASSIVE.has(mo.type) &&
				Math.hypot(mo.x - 0.5, mo.y - spawnY, mo.z - 0.5) < 4
		);
		if (near && hitsSent < 16) {
			// Fase 13 (paridad B3): el daño a mano es 1 (MC Java 1.9+), antes 2 —
			// con 8 golpes no morían la vaca/cerdo (10 HP); 16 × 1 = 16 > 10.
			ws.send(
				JSON.stringify({ event: "attack_mob", data: { mobId: near.id } })
			);
			hitsSent++;
		}
		return;
	}

	if (phase === "hunt" && m.event === "inventory_update") {
		const foodItem = m.data.inventory.find(
			(s) => s && s.id >= 107 && s.id <= 110
		);
		if (!foodItem) return;
		check(
			"drop de comida cruda al matar pasivo (bonus)",
			true,
			`item=${foodItem.id} x${foodItem.count}`
		);
		const slotIdx = m.data.inventory.findIndex(
			(s) => s && s.id === foodItem.id
		);
		if (slotIdx !== 0)
			ws.send(
				JSON.stringify({ event: "inventory_select", data: { slot: slotIdx } })
			);
		ws.send(JSON.stringify({ event: "eat", data: {} }));
		phase = "eat";
		return;
	}

	if (phase === "eat" && m.event === "food_update") {
		const improved = m.data.saturation > lastSat || m.data.food > lastFood;
		check(
			"comer restaura hambre/saturación (bonus)",
			improved,
			`food ${lastFood}->${m.data.food}, sat ${lastSat}->${m.data.saturation}`
		);
		finish(0);
		return;
	}
});
ws.on("error", (_e) => {
	finish(1);
});
