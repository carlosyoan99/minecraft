"use strict";
// E2E del templo de jungla (Fase 12, B1/E5) — ciclo completo por WebSocket:
//   1) Localizar un TEMPLO de la semilla (server/world.js + seed del init)
//   2) /tp al pasadizo norte (celda de presión simplificada, templeTrapAt)
//   3) El pasadizo dispara 3-5 flechas (reuso de shootArrow) + chat de aviso
//   4) /tp a la cámara central → chest_open → el cofre del tesoro tiene loot
//
// Requiere un servidor vivo: WS_URL (por defecto ws://localhost:3998).
// Ejecutar contra un servidor DESECHABLE (modifica el mundo: /tp al templo,
// activa la trampa y abre el cofre). Determinista: mismo seed → mismo templo
// (world.reinitNoise(seed) alinea el ruido con el servidor).
const WebSocket = require("ws");
const path = require("node:path");
const URL = process.env.WS_URL || "ws://localhost:3998";

const CHEST = 22;
const results = [];
let finished = false;
const t0 = Date.now();
let phase = "init";
let temple = null; // {cx, cz} centro del templo
let baseY = 0; // piso del templo (getHeight del centro)
let trapCell = null; // {x, y, z} celda del pasadizo norte (dispara la trampa)
let chestAt = null; // {x, y, z} cofre del tesoro (cámara central)
let trapFired = false; // ¿se dispararon las flechas de la trampa?
let trapCooldownUntil = 0;
let chestLootOk = false;

function check(name, ok, _info) {
	results.push({ name, ok });
}
function finish(exitCode) {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	// Resumen de checks SIEMPRE (el runner no imprime nada por test; sin esto
	// un fallo no-timeout muere en silencio sin decir qué check falló).
	if (results.length) {
		console.error(
			`E2E templo: ${results.filter((r) => r.ok === false).length}/${results.length} checks FAIL`
		);
		for (const r of results)
			if (!r.ok) console.error(`  FAIL ${r.name}`);
	}
	const fails = results.filter((r) => r.ok === false).length;
	process.exit(exitCode !== undefined ? exitCode : fails ? 1 : 0);
}
const timer = setTimeout(() => {
	console.error(
		`⏰ TIMEOUT E2E (${Math.round((Date.now() - t0) / 1000)}s): fase "${phase}", ${results.length} checks (${results.filter((r) => r.ok === false).length} FAIL)`
	);
	for (const r of results) console.error(`  ${r.ok ? "OK" : "FAIL"} ${r.name}`);
	finish(1);
}, 90000);

function send(event, data) {
	ws.send(JSON.stringify({ event, data }));
}

// ============================================================
// LOCALIZACIÓN DETERMINISTA DEL TEMPLO (misma semilla que el servidor)
// ============================================================
let world = null;
function findTemple() {
	// Barrer celdas de 32 bloques (patrón unit-fase12): el centro de cada
	// celda candidata consulta structureAt; si es templo, devolvemos su
	// centro. El pasadizo norte está a (dx=0, dz∈[-4,-1]) del centro → la
	// celda de presión es (cx, cz-2) aprox.
	for (let ccx = -32; ccx < 32; ccx++) {
		for (let ccz = -32; ccz < 32; ccz++) {
			const wx = ccx * 32 + 16;
			const wz = ccz * 32 + 16;
			const s = world.structureAt(wx, wz);
			if (s && s.type === "temple") return s;
		}
	}
	return null;
}

const ws = new WebSocket(URL);
ws.on("message", (d) => {
	let m;
	try {
		m = JSON.parse(d);
	} catch {
		return;
	}
	const _t = Math.round((Date.now() - t0) / 1000);

	// ============ INIT: seed + localizar el templo ============
	if (phase === "init" && m.event === "init") {
		world = require(path.join(__dirname, "..", "server", "world.js"));
		world.reinitNoise(m.data.seed);
		temple = findTemple();
		if (!temple) {
			check(
				"se encuentra un templo de jungla en la semilla",
				false,
				"sin templo en ±1024 bloques"
			);
			finish(1);
			return;
		}
		check(
			"se encuentra un templo de jungla en la semilla",
			true,
			`centro (${temple.cx}, ${temple.cz})`
		);
		baseY = world.getHeight(Math.floor(temple.cx), Math.floor(temple.cz));
		// Celda de presión del pasadizo norte: (dx=0, dz=-2) → (cx, cz-2).
		// El jugador debe estar SOBRE esa celda para que la trampa dispare.
		trapCell = {
			x: Math.floor(temple.cx) + 0.5,
			y: baseY + 1,
			z: Math.floor(temple.cz) - 2 + 0.5
		};
		// Cofre del tesoro: cámara central (dx=0, dz=0, dy=1) → (cx, baseY+1, cz).
		chestAt = {
			x: Math.floor(temple.cx),
			y: baseY + 1,
			z: Math.floor(temple.cz)
		};
		send("chat", { message: `/tp ${trapCell.x} ${trapCell.y} ${trapCell.z}` });
		phase = "tp-trampa";
		return;
	}

	if (m.event === "chunks_add") return;

	// ============ TP A LA TRAMPA → esperar flechas ============
	if (phase === "tp-trampa" && m.event === "teleport") {
		check(
			"/tp al pasadizo norte del templo (celda de presión)",
			true,
			`(${m.data.x.toFixed(0)}, ${m.data.z.toFixed(0)})`
		);
		// La trampa dispara al pisar la celda (tickTempleTraps, cooldown 3s).
		trapCooldownUntil = Date.now() + 4000;
		phase = "trampa";
		return;
	}

	// Trampa: flechas (arrows_update) o el chat de aviso del templo.
	if (phase === "trampa") {
		if (m.event === "arrows_update" && Array.isArray(m.data) && m.data.length) {
			// Las flechas de la trampa salen del pasadizo norte hacia el jugador.
			const near = m.data.some(
				(a) =>
					Math.hypot(a.x - trapCell.x, a.z - trapCell.z) < 12 &&
					(!a.kind || a.kind === "arrow")
			);
			if (near) {
				check(
					"la trampa dispara flechas al pisar el pasadizo (arrows_update)",
					true,
					`${m.data.length} flechas vivas`
				);
				trapFired = true;
			}
		} else if (
			m.event === "chat" &&
			m.data.id === "⚙️ Templo" &&
			typeof m.data.message === "string" &&
			m.data.message.includes("Flechas")
		) {
			check(
				"la trampa dispara flechas al pisar el pasadizo (chat del templo)",
				true,
				m.data.message
			);
			trapFired = true;
		}
		if (trapFired) {
			// Ir a por el cofre: la cámara central está a 2 bloques del pasadizo.
			send("chat", { message: `/tp ${chestAt.x + 0.5} ${chestAt.y} ${chestAt.z + 0.5}` });
			phase = "tp-cofre";
		} else if (Date.now() > trapCooldownUntil + 8000) {
			check(
				"la trampa dispara flechas al pisar el pasadizo (arrows_update)",
				false,
				"ni arrows_update ni chat del templo en ~12s"
			);
			finish(1);
		}
		return;
	}

	// ============ TP AL COFRE → chest_open ============
	if (phase === "tp-cofre" && m.event === "teleport") {
		check(
			"/tp a la cámara central (junto al cofre del tesoro)",
			true,
			`(${m.data.x.toFixed(0)}, ${m.data.z.toFixed(0)})`
		);
		send("chest_open", chestAt);
		phase = "cofre";
		return;
	}

	if (phase === "cofre" && m.event === "chest_state") {
		check(
			"el cofre del templo se abre (chest_state)",
			Array.isArray(m.data.slots) && m.data.slots.length === 27,
			`${m.data.slots?.length} slots`
		);
		const loot = m.data.slots.filter((s) => s !== null);
		check(
			"el cofre del templo tiene loot (tabla de templo: oro/esmeralda/hierro/hueso/tridente)",
			loot.length > 0,
			JSON.stringify(loot.map((s) => `${s.id}x${s.count}`))
		);
		chestLootOk = true;
		// Cerrar el cofre y terminar.
		send("chest_action", { action: "close" });
		phase = "done";
		finish(chestLootOk ? 0 : 1);
		return;
	}
});
ws.on("error", (_e) => {
	finish(1);
});
