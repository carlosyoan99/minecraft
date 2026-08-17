"use strict";
// ============================================================
// DIAGNÓSTICO B2 (Fase 8): ¿por qué se pierde vida "sin causa"?
// Conecta al servidor (WS_URL, por defecto ws://localhost:3000),
// se queda QUIETO en el spawn ~75 s y lee la telemetría de daño
// por origen (evento damage_debug: source mob/fall/lava/starve,
// amount, realAmount, healthBefore/After, x/y/z, meta).
// Uso:  node diag-b2.js            (75 s)
//       DURATION=120000 node diag-b2.js
// ============================================================
const WebSocket = require("ws");

const URL = process.env.WS_URL || "ws://localhost:3000";
const NAME = `DiagB2-${Math.random().toString(36).slice(2, 6)}`;
const DURATION = parseInt(process.env.DURATION || "75000", 10);

const ws = new WebSocket(`${URL}/?name=${encodeURIComponent(NAME)}`);
const damages = [];
let healthNow = null;

const log = (...a) => console.log(...a);

ws.on("message", (raw) => {
	const { event, data } = JSON.parse(raw);
	if (event === "init") {
		healthNow = data.health;
		const phase = (data.dayTime / 1200000) * 100;
		log(
			`🟢 init: spawn=(${data.spawnX.toFixed(1)}, ${data.spawnY.toFixed(1)}, ${data.spawnZ.toFixed(1)}) health=${data.health} food=${data.food} sat=${data.saturation} fase=${phase.toFixed(1)}% (${data.dayTime >= 600000 ? "NOCHE" : "día"})`
		);
		// Anclar al spawn: un único move inicial (como el jugador al entrar).
		ws.send(
			JSON.stringify({
				event: "move",
				data: { x: data.spawnX, y: data.spawnY, z: data.spawnZ, yaw: 0 }
			})
		);
	} else if (event === "damage_debug") {
		damages.push(data);
		healthNow = data.healthAfter;
		const meta = [
			data.mobType ? `mobType=${data.mobType}` : "",
			data.mobId ? `id=${String(data.mobId).slice(0, 6)}` : "",
			data.dist !== undefined ? `dist=${data.dist.toFixed(1)}` : "",
			data.fallBlocks !== undefined ? `fall=${data.fallBlocks}` : "",
			data.food !== undefined ? `food=${data.food}` : ""
		]
			.filter(Boolean)
			.join(" ");
		log(
			`💥 ${new Date(data.time).toISOString().slice(11, 19)} ${data.source.padEnd(6)} ${data.amount}->${data.realAmount} hp ${data.healthBefore}→${data.healthAfter} @(${data.x.toFixed(1)},${data.y.toFixed(1)},${data.z.toFixed(1)}) ${meta}`
		);
	} else if (event === "health_update") {
		healthNow = data.health;
	}
});

ws.on("open", () => {
	log(
		`Conectado a ${URL} como ${NAME}. AFK en el spawn ${DURATION / 1000}s...`
	);
});
ws.on("close", () => log("⚠️ conexión cerrada por el servidor"));

const t0 = Date.now();
setInterval(() => {
	const el = Math.round((Date.now() - t0) / 1000);
	if (el % 10 === 0)
		log(`⏱ ${el}s — vida=${healthNow} · daños=${damages.length}`);
}, 1000);

setTimeout(() => {
	log("\n=== RESUMEN ===");
	if (damages.length === 0) log("Sin daño en el periodo observado.");
	const bySource = {};
	for (const d of damages) {
		if (!bySource[d.source]) bySource[d.source] = [];
		bySource[d.source].push(d);
	}
	for (const [src, list] of Object.entries(bySource)) {
		const total = list.reduce((a, d) => a + d.realAmount, 0);
		const types = {};
		for (const d of list)
			if (d.mobType) types[d.mobType] = (types[d.mobType] || 0) + 1;
		const tipos = Object.keys(types).length
			? ` · tipos: ${JSON.stringify(types)}`
			: "";
		log(
			`- ${src}: ${list.length} golpes · ${total} HP · ${(total / (DURATION / 1000)).toFixed(2)} HP/s${tipos}`
		);
	}
	log(`Vida final: ${healthNow}`);
	ws.close();
	process.exit(0);
}, DURATION);
