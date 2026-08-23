"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 22.3 (CDP, Chrome headless)
// Verifica en navegador real los fixes del cliente:
//   R1a CL-2 — el render se PAUSA cuando la ventana pierde el foco
//              (Emulation.setFocusEmulationEnabled): __mcFps queda
//              congelado sin foco y se reanuda al volver.
//   R1c Partículas — materiales INDEPENDIENTES por partícula (antes
//              compartían uno por color y se peleaban la opacidad).
//   B1  Cabezas — la geometría de la cabeza lleva UVs de DOS teselas
//              (frente "head" + lateral "headSide"), no una sola.
//
// L1 (linterna radio por fuente) y las recetas viven en
// tests/unit-fase22.3.js (puras, sin navegador). S1/V1 son pases de
// revisión/medición documentados en docs/spec/fase22.3-spec.md.
//
// Uso: node tests/audit-fase22.3.js   (requiere Chrome; si no hay,
// omite la parte CDP con aviso, como audit-fase7).
// ============================================================
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const WebSocket = require("ws");

const ROOT = path.join(__dirname, "..");
const AUDIT_PORT = 3996;
const AUDIT_SEED = "auditFase223";

let fails = 0;
const failedChecks = [];
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		fails++;
		failedChecks.push(_name);
	}
};

// --- helpers HTTP / espera (mismo patrón que audit-fase7) -----------------
function httpGet(url) {
	return new Promise((resolve) => {
		const req = http.get(url, { timeout: 2000 }, (res) => {
			res.resume();
			resolve({ status: res.statusCode });
		});
		req.on("error", () => resolve(null));
		req.on("timeout", () => {
			req.destroy();
			resolve(null);
		});
	});
}
async function waitFor(pred, tries, delayMs) {
	for (let i = 0; i < tries; i++) {
		const v = await pred();
		if (v) return v;
		await new Promise((r) => setTimeout(r, delayMs));
	}
	return null;
}

function findChrome() {
	const candidates = [
		process.env.CHROME_PATH,
		"google-chrome",
		"google-chrome-stable",
		"chromium",
		"chrome"
	];
	for (const c of candidates) {
		if (!c) continue;
		const r = spawnSync(c, ["--version"], { timeout: 5000 });
		if (r.status === 0) return c;
	}
	return null;
}

async function waitForPageTarget(url) {
	return waitFor(
		async () => {
			try {
				const res = await httpGet(url);
				if (!res || res.status !== 200) return null;
				const raw = await new Promise((resolve, reject) => {
					http
						.get(url, (r) => {
							let d = "";
							r.on("data", (c) => (d += c));
							r.on("end", () => resolve(d));
						})
						.on("error", reject);
				});
				const list = JSON.parse(raw);
				return list.find((t) => t.type === "page") || null;
			} catch {
				return null;
			}
		},
		60,
		500
	);
}

// Cliente CDP mínimo sobre ws (idéntico al de audit-fase7).
class CDP {
	constructor(url) {
		this.ws = new WebSocket(url);
		this.id = 0;
		this.pending = new Map();
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
				const p = this.pending.get(m.id);
				if (p) {
					this.pending.delete(m.id);
					clearTimeout(p.timer);
					p.resolve(m);
				}
			});
		});
	}
	send(method, params = {}, timeoutMs = 25000) {
		const id = ++this.id;
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`CDP ${method} sin respuesta`));
			}, timeoutMs);
			this.pending.set(id, { resolve, timer });
			this.ws.send(JSON.stringify({ id, method, params }));
		});
	}
	async eval(expression, timeoutMs = 25000) {
		const r = await this.send(
			"Runtime.evaluate",
			{
				expression,
				awaitPromise: true,
				returnByValue: true
			},
			timeoutMs
		);
		if (r.result?.exceptionDetails)
			throw new Error(r.result.exceptionDetails.text);
		return r.result?.result?.value;
	}
}

// ============================================================
// AUDITORÍA
// ============================================================
async function main() {
	const chrome = findChrome();
	if (!chrome) {
		console.log(
			"⚠️  CDP omitido: no se encontró Chrome/Chromium (L1/recetas quedan cubiertas por unit-fase22.3)"
		);
		process.exit(0);
	}

	const server = spawn(process.execPath, ["server.js"], {
		cwd: ROOT,
		env: { ...process.env, PORT: String(AUDIT_PORT), SEED: AUDIT_SEED },
		stdio: "ignore"
	});
	let chromeProc = null;
	const userData = fs.mkdtempSync(path.join(os.tmpdir(), "mc-audit223-"));
	try {
		const up = await waitFor(
			async () => {
				if (server.exitCode !== null) return false;
				const r = await httpGet(`http://127.0.0.1:${AUDIT_PORT}/`);
				return r?.status === 200;
			},
			90,
			250
		);
		check("CDP: el servidor desechable responde HTTP 200", up);
		if (!up) process.exit(1);

		const debugPort = 9722 + (process.pid % 500);
		chromeProc = spawn(
			chrome,
			[
				"--headless=new",
				"--no-sandbox",
				"--disable-dev-shm-usage",
				"--disable-background-timer-throttling",
				"--disable-renderer-backgrounding",
				"--ignore-gpu-blocklist",
				"--use-angle=swiftshader",
				"--enable-unsafe-swiftshader",
				"--window-size=480,360",
				`--remote-debugging-port=${debugPort}`,
				`--user-data-dir=${userData}`,
				`http://localhost:${AUDIT_PORT}/`
			],
			{ stdio: "ignore" }
		);

		const page = await waitForPageTarget(`http://127.0.0.1:${debugPort}/json`);
		check("CDP: Chrome headless cargó la página del juego", !!page);
		if (!page) process.exit(1);

		const cdp = new CDP(page.webSocketDebuggerUrl);
		await cdp.open();
		await cdp.send("Runtime.enable");

		// Esperar a que el mundo cargue (mismo criterio que audit-fase7).
		const ready = await waitFor(
			async () => {
				const v = await cdp.eval("({chunks: window.__mcChunks ?? -1})");
				return v && typeof v.chunks === "number" && v.chunks > 0;
			},
			45,
			1000
		);
		check("CDP: el mundo cargó (__mcChunks > 0)", !!ready);

		// --------------------------------------------------------
		// R1a — CL-2: pausa de render sin foco
		// --------------------------------------------------------
		{
			const before = await cdp.eval("window.__mcFps ?? -1");
			await cdp.send("Emulation.setFocusEmulationEnabled", {
				enabled: true
			}); // fuerza document.hasFocus() === false
			await new Promise((r) => setTimeout(r, 1700));
			const frozen = await cdp.eval("window.__mcFps ?? -1");
			check(
				"R1 CL-2: sin foco el HUD de FPS se congela (render en pausa)",
				before > 0 && frozen === before,
				`before=${before} frozen=${frozen}`
			);
			await cdp.send("Emulation.setFocusEmulationEnabled", {
				enabled: false
			});
			await new Promise((r) => setTimeout(r, 1700));
			const resumed = await cdp.eval("window.__mcFps ?? -1");
			check(
				"R1 CL-2: al recuperar el foco el render se reanuda",
				resumed !== frozen,
				`frozen=${frozen} resumed=${resumed}`
			);
		}

		// --------------------------------------------------------
		// R1c — partículas: material propio por partícula
		// --------------------------------------------------------
		{
			const dbg = await cdp.eval(`
				(async () => {
					const m = await import("/public/particles.js");
					m.spawnBlockBreak(8, 40, 8, 1);
					m.spawnBlockBreak(12, 42, 10, 1); // mismo bloque → mismo color
					return m.__particlesDebug();
				})()
			`);
			check(
				"R1 partículas: ráfaga viva registrada",
				dbg && dbg.vivas >= 14,
				JSON.stringify(dbg)
			);
			check(
				"R1 partículas: un material POR partícula (opacidades independientes)",
				dbg && dbg.independientes === true,
				JSON.stringify(dbg)
			);
		}

		// --------------------------------------------------------
		// B1 — cabezas: UVs repartidas entre "head" (frente) y "headSide"
		// --------------------------------------------------------
		{
			const uv = await cdp.eval(`
				(async () => {
					const m = await import("/public/mobs.js");
					const g = m.makeHumanoid("steve");
					let head = null;
					g.traverse((o) => {
						if (!head && o.isMesh && o.geometry?.groups?.length === 6) {
							// la cabeza es la primera caja del grupo humanoide
							head = head || o;
						}
					});
					if (!head) return null;
					const uvs = head.geometry.attributes.uv;
					const index = head.geometry.index;
					// UVs del grupo frontal (+Z, índice 4) vs resto
					const gFront = head.geometry.groups[4];
					let frontMinU = 1, frontMaxU = 0, sideMinU = 1, sideMaxU = 0;
					for (let k = 0; k < gFront.count; k++) {
						const v = index.getX(gFront.start + k);
						const u = uvs.getX(v);
						frontMinU = Math.min(frontMinU, u);
						frontMaxU = Math.max(frontMaxU, u);
					}
					const gSide = head.geometry.groups[1]; // cara -X
					for (let k = 0; k < gSide.count; k++) {
						const v = index.getX(gSide.start + k);
						const u = uvs.getX(v);
						sideMinU = Math.min(sideMinU, u);
						sideMaxU = Math.max(sideMaxU, u);
					}
					return { frontMinU, frontMaxU, sideMinU, sideMaxU };
				})()
			`);
			// Atlas de skin: 5 columnas de 0.2 (head, headSide, body, arm, leg).
			check(
				"B1 la cara frontal usa la columna 'head' (u < 0.2)",
				uv && uv.frontMinU < 0.2 && uv.frontMaxU <= 0.2001,
				JSON.stringify(uv)
			);
			check(
				"B1 los laterales usan la columna 'headSide' (0.2 ≤ u < 0.4)",
				uv &&
					uv.sideMinU >= 0.1999 &&
					uv.sideMinU < 0.4 &&
					uv.sideMaxU <= 0.4001,
				JSON.stringify(uv)
			);
			check(
				"B1 frente y lateral NO comparten tesela",
				uv && Math.abs(uv.frontMinU - uv.sideMinU) > 0.05
			);
		}

		console.log(
			fails === 0
				? "AUDITORÍA FASE 22.3: OK"
				: `AUDITORÍA FASE 22.3: ${fails} fallos`
		);
		process.exit(fails === 0 ? 0 : 1);
	} catch (e) {
		console.error("AUDITORÍA FASE 22.3: excepción", e.message);
		process.exit(1);
	} finally {
		if (chromeProc) chromeProc.kill();
		server.kill();
		try {
			fs.rmSync(path.join(ROOT, "world", AUDIT_SEED), {
				recursive: true,
				force: true
			});
		} catch {}
	}
}

main();
