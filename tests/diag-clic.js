"use strict";
// ============================================================
// DIAGNÓSTICO DEL CLIC DE MINERÍA (Fase 9, Bloque A + Fase 11, Bloque A)
// Reproduce "el clic no hace nada" en Chrome headless y lee la telemetría
// que expone public/input.js:
//   - window.__mcMiningTrace  (anillo de mousedowns: hit, target, sent)
//   - window.__mcRaycastStats (candidatos/hits por tipo)
//   - window.__mcDebugMining() (raycast forzado + contexto ampliado: cámara,
//     meshes en escena, elementFromPoint, blocker, bloque bajo el punto de
//     mira — Fase 11 Bloque A para confirmar H1/H2/H3)
// Además intenta activar el pointer lock de forma FIABLE (clic en Jugar con
// reintentos + fallback requestPointerLock) y, si se consigue, prueba el
// clamp de pitch de la cámara moviendo el ratón en vertical (Fase 11 A2).
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
const SEED = process.env.DIAG_SEED || "diagClic";
// --audit: en vez de solo imprimir la telemetría, evalúa checks del flujo del
// clic (auditoría CDP de la Fase 11) y sale con exit code 1 si algo falla.
const AUDIT = process.argv.includes("--audit");
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
		// biome-ignore lint/suspicious/noConsole: salida del diagnóstico
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
	let auditFailed = 0;
	const auditCheck = (name, ok, extra = "") => {
		// biome-ignore lint/suspicious/noConsole: resumen de la auditoría
		console.log(`${ok ? "✔" : "✘"} ${name}${extra ? ` | ${extra}` : ""}`);
		if (!ok) auditFailed++;
	};
	try {
		const up = await waitFor(
			async () =>
				server.exitCode === null &&
				(await httpGet(`http://127.0.0.1:${PORT}/`)).status === 200,
			60,
			250
		);
		if (!up) {
			// biome-ignore lint/suspicious/noConsole: salida del diagnóstico
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

		// 2) Clic REAL sobre el botón Jugar → set_seed + pointer lock, con
		// reintentos: en headless el lock puede fallar en el primer intento
		// (user activation); se reintenta hasta 3 veces y, si sigue sin
		// activarse, se prueba requestPointerLock directo sobre el canvas.
		const clickAt = async (x, y) => {
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mousePressed",
				x,
				y,
				button: "left",
				clickCount: 1
			});
			await cdp.send("Input.dispatchMouseEvent", {
				type: "mouseReleased",
				x,
				y,
				button: "left",
				clickCount: 1
			});
		};
		const btnRect = await cdp.eval(
			`(() => { const b = document.getElementById('start-btn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`
		);
		console.log("botón Jugar en:", JSON.stringify(btnRect));
		let locked = false;
		if (btnRect) {
			for (let attempt = 1; attempt <= 3 && !locked; attempt++) {
				await clickAt(btnRect.x, btnRect.y);
				await sleep(1500);
				locked = await cdp.eval(
					"document.pointerLockElement !== null || (window.__mcDebugMining ? window.__mcDebugMining().locked : false)"
				);
				console.log(
					`  intento ${attempt}: pointer lock ${locked ? "SÍ" : "NO"}`
				);
			}
			// Fallback: si el clic no activó el lock, intentar requestPointerLock
			// directo (user activation del último clic CDP suele bastar).
			// Fase 11 (D2): debe ser el CANVAS (el elemento que bloquea
			// PointerLockControls), no document.body — si el lock recae en body,
			// PLC queda con isLocked=false (su domElement es el canvas), la
			// cámara no rota y los clics se entregan a body (nunca al canvas).
			if (!locked) {
				await cdp.eval(
					"document.querySelector('canvas').requestPointerLock ? document.querySelector('canvas').requestPointerLock() : null"
				);
				await sleep(800);
				locked = await cdp.eval("document.pointerLockElement !== null");
				console.log(`  fallback requestPointerLock: ${locked ? "SÍ" : "NO"}`);
			}
		}
		console.log(`pointer lock: ${locked ? "SÍ" : "NO"}`);

		// 3) Si hay lock, mover el ratón en vertical para diagnosticar el clamp
		// de pitch (Fase 11 A2): una racha grande de movementY debe dejar el
		// pitch acotado (~±90°) y NO dar vueltas. La cámara NO es global, así
		// que se lee su dirección con __mcDebugMining().camera.dir (por closure).
		// IMPORTANTE (Fase 11 D2): Input.dispatchMouseEvent de CDP NO entrega
		// movementX/movementY (los calcula el navegador como delta de posición;
		// con el mismo x,y el delta es 0 y la cámara no rota). Se despachan
		// eventos mousemove SINTÉTICOS con movementX/movementY definidos —
		// PointerLockControls r160 los lee de event.movementX/Y en onMouseMove
		// (escucha en document), así que ejercitan el handler real.
		const syntheticMove = async (mx, my) => {
			await cdp.eval(`(() => {
				const ev = new MouseEvent('mousemove', { bubbles: true });
				Object.defineProperty(ev, 'movementX', { value: ${mx} });
				Object.defineProperty(ev, 'movementY', { value: ${my} });
				document.dispatchEvent(ev);
			})()`);
		};
		let camUp = null,
			camDown = null;
		if (locked) {
			const camBefore = await cdp.eval("window.__mcDebugMining().camera");
			for (let i = 0; i < 5; i++) {
				await syntheticMove(0, -800); // mirar arriba de golpe
				await sleep(40);
			}
			camUp = await cdp.eval("window.__mcDebugMining().camera");
			for (let i = 0; i < 10; i++) {
				await syntheticMove(0, 800); // mirar abajo de golpe
				await sleep(40);
			}
			camDown = await cdp.eval("window.__mcDebugMining().camera");
			console.log(
				"CÁMARA: antes=",
				JSON.stringify(camBefore),
				"arriba(dirY)=",
				camUp?.dir?.[1],
				"abajo(dirY)=",
				camDown?.dir?.[1]
			);
			await sleep(300);
		}

		// 4) Clic izquierdo (mantenido ~1.2s) en el centro de la pantalla
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

		// 4.5) Sondeo del terreno: lo incluye `__mcDebugMining` (terrainAround).
		// 5) Leer la telemetría (contexto ampliado del Bloque A de Fase 11)
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

		// ============================================================
		// MODO --audit (Fase 11, Bloque D): auditoría CDP del flujo del clic
		// 1) el mundo renderiza; 2) el pointer lock se activa; 3) la cámara
		// queda con el pitch acotado (fix A2: sin vueltas); 4) el raycast
		// encuentra terreno/agua mirando abajo (no "0 hits legítimos");
		// 5) un clic real llega al handler (trace con entrada); 6) 0 excepciones.
		// ============================================================
		if (AUDIT) {
			console.log("\n===== AUDITORÍA CDP DEL CLIC =====");
			auditCheck(
				"el mundo renderiza (__mcChunks > 0)",
				globals?.chunks > 0,
				`${globals?.chunks} chunks`
			);
			auditCheck("el pointer lock se activa", locked === true);
			auditCheck(
				"la cámara queda con el pitch acotado (fix A2: sin vueltas)",
				locked && Array.isArray(camDown?.dir) && camDown.dir[1] < -0.3,
				camDown?.dir
					? `dirY=${camDown.dir[1].toFixed(2)} (mirando abajo)`
					: "sin lock"
			);
			auditCheck(
				"el raycast encuentra terreno/agua mirando abajo",
				!!debug?.blockAlongView || (debug?.stats?.hits ?? 0) > 0,
				JSON.stringify(debug?.blockAlongView || debug?.stats)
			);
			auditCheck(
				"el clic izquierdo llega al handler (trace con entrada)",
				Array.isArray(trace) && trace.length >= 1,
				`${trace?.length ?? 0} mousedowns registrados`
			);
			auditCheck(
				"0 excepciones JS en el flujo del clic",
				exceptions.length === 0,
				`${exceptions.length} excepciones`
			);
		}
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
	process.exit(AUDIT && auditFailed ? 1 : 0);
})();
