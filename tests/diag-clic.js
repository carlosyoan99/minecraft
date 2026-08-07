"use strict";
// ============================================================
// DIAGNÓSTICO DEL CLIC DE MINERÍA (Fase 9, Bloque A)
// Reproduce "el clic no hace nada" en Chrome headless y lee la telemetría
// que expone public/input.js:
//   - window.__mcMiningTrace  (anillo de mousedowns: hit, target, sent)
//   - window.__mcRaycastStats (candidatos/hits por tipo)
//   - window.__mcDebugMining() (raycast forzado ahora)
// Usa un servidor DESECHABLE (PORT=3999, SEED=diagClic) para no tocar el
// mundo del usuario, y Chrome headless con CDP (patrón de audit-fase7.js).
// Uso: node tests/diag-clic.js
// ============================================================
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const WebSocket = require("ws");

const ROOT = path.join(__dirname, "..");
const PORT = 3999;
const SEED = "diagClic";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function httpGet(url) {
	return new Promise((resolve, reject) => {
		const req = http.get(url, (res) => {
			let data = "";
			res.on("data", (c) => (data += c));
			res.on("end", () => resolve({ status: res.statusCode, data }));
		});
		req.on("error", reject);
		req.setTimeout(3000, () => req.destroy(new Error(`timeout ${url}`)));
	});
}

async function waitFor(pred, tries, delayMs) {
	for (let i = 0; i < tries; i++) {
		try {
			if (await pred()) return true;
		} catch {}
		await sleep(delayMs);
	}
	return false;
}

async function waitForPageTarget(url) {
	for (let i = 0; i < 60; i++) {
		try {
			const { status, data } = await httpGet(url);
			if (status === 200) {
				const arr = JSON.parse(data);
				if (Array.isArray(arr) && arr.some((t) => t.type === "page"))
					return arr;
			}
		} catch {}
		await sleep(250);
	}
	return [];
}

class CDP {
	constructor(url) {
		this.ws = new WebSocket(url);
		this.id = 0;
		this.pending = new Map();
		this.events = [];
	}
	open() {
		return new Promise((resolve, reject) => {
			this.ws.on("open", resolve);
			this.ws.on("error", reject);
			this.ws.on("message", (raw) => {
				let m;
				try {
					m = JSON.parse(raw);
				} catch {
					return;
				}
				if (m.method) this.events.push(m); // eventos (excepciones, console)
				const p = this.pending.get(m.id);
				if (p) {
					this.pending.delete(m.id);
					clearTimeout(p.timer);
					p.resolve(m);
				}
			});
		});
	}
	send(method, params = {}) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`CDP ${method} sin respuesta`));
			}, 15000);
			this.pending.set(id, { resolve, timer });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
	async eval(expression) {
		const r = await this.send("Runtime.evaluate", {
			expression,
			returnByValue: true,
			awaitPromise: true
		});
		const v = r.result?.result;
		return v && v.value !== undefined ? v.value : undefined;
	}
	close() {
		try {
			this.ws.close();
		} catch {}
	}
}

function findChrome() {
	if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH))
		return process.env.CHROME_PATH;
	for (const n of [
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chromium-browser",
		"chrome",
		"chrome-headless-shell"
	]) {
		const r = spawnSync("which", [n], { stdio: "ignore" });
		if (r.status === 0) return n;
	}
	for (const p of [
		"/usr/bin/google-chrome",
		"/usr/bin/google-chrome-stable",
		"/usr/bin/chromium",
		"/usr/bin/chromium-browser",
		"/opt/google/chrome/chrome",
		"/snap/bin/chromium"
	]) {
		if (fs.existsSync(p)) return p;
	}
	return null;
}

(async () => {
	const chrome = findChrome();
	if (!chrome) {
		console.log("⚠️  CDP omitido: no se encontró Chrome/Chromium");
		process.exit(0);
	}

	const server = spawn(process.execPath, ["server.js"], {
		cwd: ROOT,
		env: { ...process.env, PORT: String(PORT), SEED },
		stdio: "ignore"
	});
	let chromeProc = null;
	const userData = fs.mkdtempSync(path.join(os.tmpdir(), "mc-diag-clic-"));
	let cdp = null;
	try {
		const up = await waitFor(
			async () =>
				server.exitCode === null &&
				(await httpGet(`http://127.0.0.1:${PORT}/`)).status === 200,
			60,
			250
		);
		if (!up) {
			console.log("❌ servidor desechable no arrancó");
			process.exit(1);
		}

		const debugPort = 9333 + (process.pid % 300);
		chromeProc = spawn(
			chrome,
			[
				"--headless=new",
				"--no-sandbox",
				"--disable-dev-shm-usage",
				"--disable-background-timer-throttling",
				"--disable-backgrounding-occluded-windows",
				"--disable-renderer-backgrounding",
				"--ignore-gpu-blocklist",
				"--use-angle=swiftshader",
				"--enable-unsafe-swiftshader",
				"--window-size=480,360",
				"--force-device-scale-factor=1",
				`--remote-debugging-port=${debugPort}`,
				`--user-data-dir=${userData}`,
				`http://localhost:${PORT}/`
			],
			{ stdio: "ignore" }
		);

		const targets = await waitForPageTarget(
			`http://127.0.0.1:${debugPort}/json`
		);
		const page = targets.find((t) => t.type === "page");
		if (!page) {
			console.log("❌ no hay página CDP");
			process.exit(1);
		}
		cdp = new CDP(page.webSocketDebuggerUrl);
		await cdp.open();
		await cdp.send("Runtime.enable");
		await cdp.send("Page.enable");

		// 1) Esperar a que el mundo cargue (chunks renderizados)
		const ready = await waitFor(
			async () => {
				const v = await cdp.eval("window.__mcChunks ?? -1");
				return typeof v === "number" && v > 0;
			},
			80,
			250
		);
		console.log(`mundo cargado: ${ready ? "sí" : "NO (__mcChunks inválido)"}`);
		const globals = await cdp.eval(
			"({chunks: window.__mcChunks ?? 'undef', player: !!window.__mcPlayerPos, lod: window.__mcLodChunks ?? 'undef', three: typeof THREE})"
		);
		console.log("globals:", JSON.stringify(globals));

		// 2) Clic REAL (confiable) sobre el botón Jugar → set_seed + pointer lock
		const btnRect = await cdp.eval(
			`(() => { const b = document.getElementById('start-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`
		);
		console.log("botón Jugar en:", JSON.stringify(btnRect));
		if (btnRect) {
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mousePressed",
				x: btnRect.x,
				y: btnRect.y,
				button: "left",
				clickCount: 1
			});
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				x: btnRect.x,
				y: btnRect.y,
				button: "left",
				clickCount: 1
			});
		}
		await sleep(3000);

		const locked = await cdp.eval("document.pointerLockElement !== null");
		console.log(`pointer lock: ${locked ? "SÍ" : "NO"}`);

		// 3) Clic izquierdo (mantenido ~1s) en el centro de la pantalla
		for (const [cx, cy, label] of [
			[240, 180, "centro"],
			[200, 150, "izq-arriba"],
			[280, 220, "der-abajo"]
		]) {
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mousePressed",
				x: cx,
				y: cy,
				button: "left",
				clickCount: 1
			});
			await sleep(1200);
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				x: cx,
				y: cy,
				button: "left",
				clickCount: 1
			});
			await sleep(400);
		}

		// 4) Leer la telemetría
		const trace = await cdp.eval("window.__mcMiningTrace ?? []");
		const stats = await cdp.eval("window.__mcRaycastStats ?? null");
		const debug = await cdp.eval("window.__mcDebugMining()");
		const exceptions = cdp.events
			.filter((e) => e.method === "Runtime.exceptionThrown")
			.map((e) => {
				const d = e.params?.exceptionDetails || {};
				const stack = (d.stackTrace?.callFrames || [])
					.slice(0, 3)
					.map((f) => `${f.url.split("/").pop()}:${f.lineNumber + 1}`)
					.join(" ← ");
				return `${d.text} — ${d.exception?.description || ""} [${stack}]`.slice(
					0,
					400
				);
			});
		const consoleErr = cdp.events
			.filter(
				(e) =>
					e.method === "Runtime.consoleAPICalled" && e.params?.type === "error"
			)
			.map((e) =>
				(e.params?.args || [])
					.map((a) => a.value ?? a.description ?? "")
					.join(" ")
			)
			.slice(0, 8);

		// biome-ignore lint/suspicious/noConsole: salida del diagnóstico
		console.log("\n===== TELEMETRÍA =====");
		console.log("TRACE:", JSON.stringify(trace, null, 1));
		console.log("STATS:", JSON.stringify(stats));
		console.log("DEBUG:", JSON.stringify(debug, null, 1));
		console.log("EXCEPCIONES JS:", JSON.stringify(exceptions, null, 1));
		console.log("CONSOLE.ERROR:", JSON.stringify(consoleErr, null, 1));
	} finally {
		if (cdp) cdp.close();
		if (chromeProc) chromeProc.kill("SIGKILL");
		server.kill("SIGKILL");
		try {
			fs.rmSync(path.join(ROOT, "world", "diagclic"), {
				recursive: true,
				force: true
			});
		} catch {}
	}
	process.exit(0);
})();
