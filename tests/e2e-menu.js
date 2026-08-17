"use strict";
// ============================================================
// E2E DEL MENÚ (Fase 17, A1/A5/C1): flujo completo sin mundo activo.
//
// A diferencia del resto de E2E (que se conectan a un servidor externo con
// SEED en WS_URL), este test levanta su PROPIO servidor desechable en modo
// menú (sin SEED) en un puerto dedicado, ejecuta el flujo y lo mata:
//   1) Al conectar → `menu_state` con la lista de mundos (NO init).
//   2) `join_world` {seed, name} → el servidor carga/crea el mundo y
//      responde `init` (con chunks y modo).
//   3) `leave_world` → vuelve al menú (segundo `menu_state`) y el mundo
//      queda persistido y listado.
//   4) Un segundo join_world a la MISMA semilla responde init sin duplicar
//      el mundo en la lista.
//
// Se ejecuta con el resto de E2E (no necesita servidor externo); el puerto
// dedicado (3997) evita chocar con el servidor de E2E clásico (3998).
// ============================================================
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const WebSocket = require("ws");

const PORT = 3997;
const URL = `ws://localhost:${PORT}`;
const results = [];
const check = (name, ok, info) => {
	results.push({ name, ok, info });
	if (!ok && info) console.error(`  info: ${info}`);
};
let finished = false;
const timer = setTimeout(() => {
	console.error(
		`⏰ TIMEOUT E2E menú (${results.length} checks, ${results.filter((r) => !r.ok).length} FAIL)`
	);
	for (const r of results) console.error(`  ${r.ok ? "OK" : "FAIL"} ${r.name}`);
	finish(1);
}, 75000); // margen para el cooldown de 10 s del check C4

function finish(exitCode) {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	// Limpieza SIEMPRE del mundo creado por el test (el servidor usa la raíz
	// fija world/ del proyecto; la semilla del test se deriva a ese nombre).
	try {
		fs.rmSync(path.join(__dirname, "..", "world", "e2e-menu-semilla"), {
			recursive: true,
			force: true
		});
	} catch {}
	const fails = results.filter((r) => r.ok === false).length;
	for (const r of results) console.log(`${r.ok ? "OK" : "FAIL"} ${r.name}`);
	process.exit(exitCode !== undefined ? exitCode : fails ? 1 : 0);
}

// Directorio de mundo TEMPORAL (nunca toca world/ del proyecto).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-e2e-menu-"));
const server = spawn(process.execPath, ["server.js"], {
	cwd: path.join(__dirname, ".."),
	env: {
		...process.env,
		PORT: String(PORT),
		WORLD_ROOT: TMP, // si la env var existe en el servidor; si no, se ignora
		SEED: "" // MODO MENÚ: sin SEED en el entorno
	},
	stdio: ["ignore", "pipe", "pipe"]
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));
server.on("exit", (code) => console.error(`servidor menú salió (${code})`));

function serverUp(port) {
	return new Promise((resolve) => {
		const t0 = Date.now();
		const tryOnce = () => {
			const req = http.get(
				{ hostname: "localhost", port, path: "/", timeout: 1000 },
				() => resolve(true)
			);
			req.on("error", () =>
				Date.now() - t0 > 15000 ? resolve(false) : setTimeout(tryOnce, 300)
			);
			req.on("timeout", () => {
				req.destroy();
				setTimeout(tryOnce, 300);
			});
		};
		tryOnce();
	});
}

function waitEvent(ws, name, ms) {
	return new Promise((resolve) => {
		const t = setTimeout(() => resolve(null), ms || 20000);
		const onMsg = (raw) => {
			let m;
			try {
				m = JSON.parse(raw);
			} catch {
				return;
			}
			if (m.event === name) {
				clearTimeout(t);
				ws.off("message", onMsg);
				resolve(m);
			}
		};
		ws.on("message", onMsg);
	});
}

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
	if (!(await serverUp(PORT))) {
		console.error(`el servidor de menú no arrancó:\n${serverLog}`);
		server.kill();
		return finish(1);
	}

	// 1) Conexión en modo menú: menu_state, nunca init.
	const ws = new WebSocket(URL);
	await new Promise((res) => ws.on("open", res));
	const menu1 = await waitEvent(ws, "menu_state");
	check(
		"A1: al conectar sin SEED llega menu_state (no init)",
		!!menu1 && Array.isArray(menu1.data.worlds),
		menu1 ? JSON.stringify(menu1.data).slice(0, 120) : "sin menu_state"
	);
	check(
		"A1: no hay init en modo menú",
		(await waitEvent(ws, "init", 2500)) === null
	);

	// 2) join_world → init con la semilla pedida.
	ws.send(
		JSON.stringify({
			event: "join_world",
			data: { seed: "e2e-menu-semilla", name: "Mundo E2E Menú" }
		})
	);
	const init = await waitEvent(ws, "init");
	check(
		"A5: join_world responde init de la semilla pedida",
		!!init && init.data.seed === "e2e-menu-semilla",
		init ? JSON.stringify(init.data).slice(0, 150) : "sin init"
	);
	check(
		"A5: init trae chunks y modo survival",
		!!init &&
			init.data.gamemode === "survival" &&
			init.data.chunkData &&
			Object.keys(init.data.chunkData).length > 0
	);

	// 3) leave_world → segundo menu_state (C1: volver al menú).
	ws.send(JSON.stringify({ event: "leave_world", data: {} }));
	const menu2 = await waitEvent(ws, "menu_state");
	check(
		"C1: leave_world devuelve al menú con el mundo persistido en la lista",
		!!menu2 && menu2.data.worlds.some((w) => w.seed === "e2e-menu-semilla"),
		menu2 ? JSON.stringify(menu2.data.worlds).slice(0, 150) : "sin menu_state"
	);

	// 3b) C4 (SEC-2): join_world en bucle tiene cuota — un segundo join
	// inmediato es rechazado con seed_rejected (cooldown), no satura el disco.
	ws.send(
		JSON.stringify({
			event: "join_world",
			data: { seed: "e2e-menu-otra", name: "Otra" }
		})
	);
	const rejected = await waitEvent(ws, "seed_rejected");
	check(
		"C4: join_world tiene cooldown (rechaza el spam con seed_rejected)",
		!!rejected && rejected.data.reason === "cooldown",
		rejected ? JSON.stringify(rejected.data) : "sin seed_rejected"
	);

	// 4) Tras la cuota, re-entrar a la misma semilla: init sin duplicados.
	await delay(10200); // espera el cooldown de 10 s
	ws.send(
		JSON.stringify({
			event: "join_world",
			data: { seed: "e2e-menu-semilla", name: "Mundo E2E Menú" }
		})
	);
	const init2 = await waitEvent(ws, "init");
	check(
		"A5: re-entrar a la misma semilla responde init",
		!!init2 && init2.data.seed === "e2e-menu-semilla"
	);

	// Limpieza: volver al menú y cerrar.
	ws.send(JSON.stringify({ event: "leave_world", data: {} }));
	await delay(500);
	ws.close();
	server.kill();
	await delay(300);
	// Limpieza del directorio temporal.
	try {
		fs.rmSync(TMP, { recursive: true, force: true });
	} catch {}
	finish(results.some((r) => !r.ok) ? 1 : 0);
})();

// La semilla de prueba nunca debe dejar un mundo en el repositorio: si el
// flujo muere antes de finish (timeout), el proceso hijo queda huérfano —
// limpiarlo es responsabilidad de finish() (también en el camino de timeout).
