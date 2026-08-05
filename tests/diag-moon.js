"use strict";
// ============================================================
// VERIFICACIÓN EN VIVO DE LAS FASES LUNARES (Fase 8, B8)
// Conecta al servidor real, comprueba que el init trae moonTime y
// que tras /time set el broadcast re-sincroniza la fase lunar.
// Uso: node tests/diag-moon.js  (requiere servidor vivo)
// ============================================================
const WebSocket = require("ws");

const url = process.env.WS_URL || "ws://localhost:3000";
const name = "DiagLuna-" + Math.random().toString(36).slice(2, 6);
const ws = new WebSocket(`${url}/?name=${encodeURIComponent(name)}`);

let ok = 0;
let fail = 0;
const check = (label, cond, extra = "") => {
	if (cond) {
		ok++;
		// biome-ignore lint/suspicious/noConsole: diagnóstico (convención del proyecto)
		console.log(`OK  ${label}${extra ? ` — ${extra}` : ""}`);
	} else {
		fail++;
		// biome-ignore lint/suspicious/noConsole: diagnóstico (convención del proyecto)
		console.log(`✗   ${label}${extra ? ` — ${extra}` : ""}`);
	}
};

ws.on("open", () => {
	// Esperar el init
});
ws.on("message", (raw) => {
	const msg = JSON.parse(raw.toString());
	const d = msg.data || {};
	if (msg.event === "init") {
		check(
			"init trae moonTime numérico",
			Number.isFinite(d.moonTime),
			`moonTime=${d.moonTime}`
		);
		check(
			"init trae dayTime numérico",
			Number.isFinite(d.dayTime),
			`dayTime=${d.dayTime}`
		);
		check(
			"moonTime dentro del ciclo lunar (0..MOON_CYCLE_MS)",
			d.moonTime >= 0 && d.moonTime < 8 * 1200000,
			`rango=${d.moonTime}`
		);
		// Enviar /time set y comprobar el broadcast de re-sincronización
		ws.send(
			JSON.stringify({ event: "chat", data: { message: "/time set night" } })
		);
		setTimeout(() => ws.close(), 800);
	}
	if (msg.event === "time_set") {
		check(
			"time_set re-sincroniza moonTime",
			Number.isFinite(d.moonTime),
			`moonTime=${d.moonTime}`
		);
	}
	if (msg.event === "chat" && d.system) {
		// mensaje de confirmación del comando
	}
});
ws.on("close", () => {
	// biome-ignore lint/suspicious/noConsole: diagnóstico (convención del proyecto)
	console.log(fail ? `\n${fail} FALLARON` : `\nTODO OK (${ok} checks)`);
	process.exit(fail ? 1 : 0);
});
ws.on("error", (e) => {
	// biome-ignore lint/suspicious/noConsole: diagnóstico (convención del proyecto)
	console.error("WS error:", e.message);
	process.exit(1);
});
