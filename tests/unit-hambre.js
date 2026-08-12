"use strict";
// Test unitario del sistema de hambre y saturación (tickPlayer de players.js).
// Fake ws con readyState CLOSED (3) para que send* no envíe nada.
const players = require("../server/players.js");

const CLOSED = 3;
let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
function check(_name, ok, _extra = "") {
	if (!ok) {
		fails++;
		failedChecks.push(_name);
	}
}

function makePlayer(over = {}) {
	return {
		id: "test",
		ws: { readyState: CLOSED, send() {} },
		health: 20,
		food: 20,
		saturation: 20,
		foodAccum: 0,
		regenAccum: 0,
		starveAccum: 0,
		lastMoveTime: 0,
		x: 0,
		y: 0,
		z: 0,
		...over
	};
}

// 1) Decaimiento: la saturación se consume primero (30s parado -> -1 saturación)
{
	const p = makePlayer();
	players.tickPlayer(p, 30000);
	check(
		"decaimiento 30s parado -> sat 19, food 20",
		p.saturation === 19 && p.food === 20,
		`sat=${p.saturation} food=${p.food}`
	);
}

// 2) Decaimiento acelerado en movimiento: 15s moviéndose -> -1 saturación
{
	const p = makePlayer({ lastMoveTime: Date.now() });
	players.tickPlayer(p, 15000);
	check(
		"decaimiento 15s en movimiento -> sat 19",
		p.saturation === 19 && p.food === 20,
		`sat=${p.saturation} food=${p.food}`
	);
}

// 3) Con la saturación agotada, el decaimiento consume comida
{
	const p = makePlayer({ saturation: 0 });
	players.tickPlayer(p, 30000);
	check(
		"decaimiento con sat 0 -> food 19",
		p.food === 19 && p.saturation === 0,
		`food=${p.food} sat=${p.saturation}`
	);
}

// 4) Regeneración: food>=18 y health<20 -> +1 salud y -1 comida cada 2s
{
	const p = makePlayer({ health: 15, food: 19 });
	players.tickPlayer(p, 2000);
	check("regeneracion -> health 16", p.health === 16, `health=${p.health}`);
	check("regeneracion -> food 18", p.food === 18, `food=${p.food}`);
}

// 5) Sin regeneración con comida baja (food < 18)
{
	const p = makePlayer({ health: 15, food: 10 });
	players.tickPlayer(p, 2000);
	check("sin regeneracion con food 10", p.health === 15, `health=${p.health}`);
}

// 6) Inanición: food==0 drena 1 salud cada 2s
{
	const p = makePlayer({ health: 10, food: 0 });
	players.tickPlayer(p, 2000);
	check("inanicion -> health 9", p.health === 9, `health=${p.health}`);
}

// 7) Inanición con health 1 -> muere y respawnea (salud, comida y saturación reset)
{
	const p = makePlayer({ health: 1, food: 0 });
	players.tickPlayer(p, 2000); // -1 -> 0: muerte + respawn
	check(
		"muerte por inanicion -> respawn health 20",
		p.health === 20,
		`health=${p.health}`
	);
	check("respawn -> food 20", p.food === 20, `food=${p.food}`);
	check("respawn -> saturation 20", p.saturation === 20, `sat=${p.saturation}`);
}

// 8) El decaimiento no baja de 0
{
	const p = makePlayer({ food: 0, saturation: 0 });
	players.tickPlayer(p, 30000);
	check(
		"decaimiento no baja de 0",
		p.food === 0 && p.saturation === 0,
		`food=${p.food} sat=${p.saturation}`
	);
}
process.exit(fails === 0 ? 0 : 1);
