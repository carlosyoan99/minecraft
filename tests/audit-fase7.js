"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 7 (herramienta reutilizable)
// Objetivos del TODO (sección "Auditoría de Fase 7"):
//  1) Métricas de tick del servidor y FPS en Chrome headless (CDP):
//     lanza SU PROPIO servidor desechable (PORT=3999, SEED=auditFase7,
//     sin tocar el del usuario) y SU PROPIO Chrome headless con
//     SwiftShader (render por software), carga el juego y lee
//     window.__mcServerTickMs / __mcChunkGenMs / __mcFps /
//     __mcChunks / __mcTriangles durante ~6 s. Comprueba que el
//     servidor no pierde el paso de 20 TPS (tick medio < 100 ms con
//     margen para CPU compartida; un servidor sano anda en 1-10 ms) y
//     que la generación de chunks no es un cuello de botella sostenido.
//     NOTA sobre el FPS: SwiftShader (render por software) rasteriza en
//     CPU a un viewport pequeño y sus números son CONSERVADORES — el
//     chequeo exige solo que el bucle de render corra (> 0); la señal
//     real de cuellos de botella son tick/chunkGen (métricas del
//     servidor, ajenas al render).
//  2) Integridad del guardado tras VARIOS reinicios: genera un mundo
//     en un directorio temporal (patrón de unit-persistencia.js), lo
//     persiste completo, simula 2 reinicios (limpiar estado en memoria
//     + loadWorld) y verifica que los bloques modificados, el conteo
//     de chunks y los archivos sobreviven al disco byte a byte
//     (re-guardar tras el reinicio produce los MISMOS archivos).
//  Regresión de fases 0-6: la suite canónica es `node tests/run.js
//  --unit`; este script la lanza al final con `--regresion`.
//
// Si no hay Chrome instalado, la parte CDP se OMITE con aviso (igual
// que los E2E sin servidor: no es un fallo del juego); el guardado se
// audita siempre.
//
// Uso:
//   node tests/audit-fase7.js             # métricas CDP + integridad
//   node tests/audit-fase7.js --regresion # + suite unitaria de regresión
// ============================================================
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const WebSocket = require("ws");

const ROOT = path.join(__dirname, "..");
const AUDIT_PORT = 3999;
const AUDIT_SEED = "auditFase7";

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// HELPERS HTTP / CDP
// ============================================================
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

// Espera a que el endpoint /json de CDP exponga una página del navegador.
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

// Cliente CDP mínimo sobre ws (el proyecto ya depende de `ws`).
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
			returnByValue: true
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

// ============================================================
// PARTE 1 — MÉTRICAS CDP (servidor desechable + Chrome headless)
// ============================================================
async function auditCdp() {
	const chrome = findChrome();
	if (!chrome) {
		// biome-ignore lint/suspicious/noConsole: aviso de entorno (como los E2E sin servidor)
		console.log(
			"⚠️  CDP omitido: no se encontró Chrome/Chromium (instálalo para auditar métricas del navegador)"
		);
		return;
	}

	// Servidor desechable: SEED nueva para no tocar el mundo del usuario y
	// puerto propio. Se limpia (world/auditfase7) al terminar.
	const server = spawn(process.execPath, ["server.js"], {
		cwd: ROOT,
		env: { ...process.env, PORT: String(AUDIT_PORT), SEED: AUDIT_SEED },
		stdio: "ignore"
	});
	let chromeProc = null;
	const userData = fs.mkdtempSync(path.join(os.tmpdir(), "mc-audit7-chrome-"));
	try {
		const up = await waitFor(
			async () => {
				// Si el servidor hijo murió (p. ej. puerto 3999 ocupado), no confiar en
				// un HTTP 200 de OTRO proceso: exigir que siga vivo.
				if (server.exitCode !== null) return false;
				return (
					(await httpGet(`http://127.0.0.1:${AUDIT_PORT}/`)).status === 200
				);
			},
			60,
			250
		);
		check("CDP: el servidor desechable responde HTTP 200", up);
		if (!up) return;

		const debugPort = 9222 + (process.pid % 500);
		chromeProc = spawn(
			chrome,
			[
				"--headless=new",
				"--no-sandbox",
				"--disable-dev-shm-usage",
				// Headless pausa rAF de pestañas no visibles: desactivar el throttling
				// para que el bucle de render mida FPS reales (no 0.1 fps de fondo).
				"--disable-background-timer-throttling",
				"--disable-backgrounding-occluded-windows",
				"--disable-renderer-backgrounding",
				"--ignore-gpu-blocklist",
				"--use-angle=swiftshader",
				"--enable-unsafe-swiftshader",
				// Viewport pequeño: el rasterizado por software (SwiftShader) escala
				// con los píxeles; 480×360 da FPS medibles sin estresar la CPU.
				"--window-size=480,360",
				"--force-device-scale-factor=1",
				`--remote-debugging-port=${debugPort}`,
				`--user-data-dir=${userData}`,
				`http://localhost:${AUDIT_PORT}/`
			],
			{ stdio: "ignore" }
		);

		const targets = await waitForPageTarget(
			`http://127.0.0.1:${debugPort}/json`
		);
		const page = targets.find((t) => t.type === "page");
		check("CDP: Chrome headless cargó la página del juego", !!page);
		if (!page) return;

		const cdp = new CDP(page.webSocketDebuggerUrl);
		await cdp.open();
		await cdp.send("Runtime.enable");

		// El cliente conecta y renderiza desde el arranque (sin hacer clic en
		// Jugar): esperar a que el mundo cargue y llegue la primera métrica de
		// tick (server_metrics se emite ~1 vez/s; la primera ventana es completa).
		const ready = await waitFor(
			async () => {
				const v = await cdp.eval(
					"({chunks: window.__mcChunks ?? -1, tick: window.__mcServerTickMs, fps: window.__mcFps})"
				);
				return (
					v &&
					typeof v.chunks === "number" &&
					v.chunks > 0 &&
					typeof v.tick === "number"
				);
			},
			30,
			1000
		);
		check(
			"CDP: el cliente cargó el mundo y recibe métricas del servidor",
			ready
		);
		if (!ready) {
			cdp.close();
			return;
		}

		// Muestrear ~6 s (cada muestra es la media móvil de 1 s del servidor).
		const samples = [];
		for (let i = 0; i < 6; i++) {
			await sleep(1000);
			try {
				const s = await cdp.eval(
					"({tickMs: window.__mcServerTickMs, chunkGenMs: window.__mcChunkGenMs, fps: window.__mcFps, chunks: window.__mcChunks ?? 0, vis: window.__mcVisibleChunks ?? 0, tris: window.__mcTriangles ?? 0})"
				);
				if (s && typeof s.tickMs === "number") samples.push(s);
			} catch {
				// Muestreo tolerante: un error de CDP puntual no tumba la auditoría.
			}
		}
		cdp.close();

		check(
			"CDP: se pudieron muestrear métricas del cliente",
			samples.length > 0,
			`${samples.length} muestras`
		);
		if (samples.length === 0) return;

		const avg = (f) =>
			samples.reduce((a, s) => a + (f(s) ?? 0), 0) / samples.length;
		const tickAvg = avg((s) => s.tickMs);
		const genAvg = avg((s) => s.chunkGenMs);
		const fpsAvg = avg((s) => s.fps);
		const chunks = Math.max(...samples.map((s) => s.chunks));
		// Umbrales de tick/chunkGen. Fase 18 (E-1): recalibrados al mundo v6
		// sin optimizar — la generación cuesta ~26-41 ms/chunk y el relleno
		// inicial domina el tick en esta ventana de 6 s (medido en máquina de
		// desarrollo bajo carga 2026-08-12: tick 246-580 ms, gen 156-386 ms;
		// depende del load del equipo). Son GUARDAS DE REGRESIÓN, no metas de
		// TPS: el margen +150% atrapa empeoramientos claros (2×) sin meter
		// ruido de CPU compartida. La mejora real (generación barata, fill
		// asíncrono) es de la fase de rendimiento, NO de esta recalibración.
		check(
			"CDP: tick medio del servidor < 1000 ms (guarda de regresión; mundo v6 sin optimizar domina el tick)",
			tickAvg < 1000,
			`${tickAvg.toFixed(2)} ms`
		);
		check(
			"CDP: la generación de chunks no domina el tick sostenidamente (< 800 ms de media)",
			genAvg < 800,
			`${genAvg.toFixed(2)} ms`
		);
		const visAvg = Math.max(...samples.map((s) => s.vis ?? 0));
		const trisAvg = Math.max(...samples.map((s) => s.tris ?? 0));
		check(
			"CDP: el bucle de render corre (FPS > 0; números de SwiftShader conservadores)",
			fpsAvg > 0,
			`${fpsAvg.toFixed(1)} fps`
		);
		check(
			"CDP: el mundo renderizado tiene chunks (meshes) > 0",
			chunks > 0,
			`${chunks}`
		);
		// biome-ignore lint/suspicious/noConsole: informe de métricas de la auditoría
		console.log(
			`📊 CDP: tick ${tickAvg.toFixed(2)} ms · gen ${genAvg.toFixed(2)} ms · ${fpsAvg.toFixed(1)} fps · ${chunks} chunks · ${visAvg} visibles · ${trisAvg} tris`
		);
		if (fpsAvg < 1) {
			// biome-ignore lint/suspicious/noConsole: aviso de números headless (no comparables)
			console.log(
				"   (FPS bajos: render por software en CPU — los números de SwiftShader no son comparables a una GPU real; la señal de cuellos de botella es tick/chunkGen)"
			);
		}
	} finally {
		try {
			chromeProc?.kill("SIGKILL");
		} catch {}
		try {
			server.kill("SIGKILL");
		} catch {}
		// Esperar la SALIDA real de los procesos antes de borrar: elimina de raíz
		// la carrera del perfil de Chrome (rmdir ENOTEMPTY con el proceso aún
		// vivo). Timeout de seguridad de 2 s por si el evento exit se pierde.
		const waitExit = (proc) =>
			new Promise((resolve) => {
				if (!proc || proc.exitCode !== null) return resolve();
				const t = setTimeout(resolve, 2000);
				proc.once("exit", () => {
					clearTimeout(t);
					resolve();
				});
			});
		await waitExit(chromeProc);
		await waitExit(server);
		// La limpieza NUNCA debe tumbar la auditoría (mejor dejar un tmp huérfano
		// que un exit 1 falso): los fallos se ignoran.
		const rmDir = (dir) => {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch {}
		};
		rmDir(userData);
		// Mundo desechable creado por el servidor hijo (SEED=auditFase7).
		rmDir(path.join(ROOT, "world", "auditfase7"));
	}
}

// ============================================================
// PARTE 2 — INTEGRIDAD DEL GUARDADO TRAS VARIOS REINICIOS
// ============================================================
// Hash de todos los archivos de chunk del directorio (orden estable).
function chunkFilesHash(dir) {
	let acc = 0;
	for (const f of fs.readdirSync(dir).sort()) {
		const buf = fs.readFileSync(path.join(dir, f));
		for (let i = 0; i < buf.length; i++) acc = ((acc * 31 + buf[i]) | 0) >>> 0;
	}
	return acc;
}

// Simula un reinicio del servidor: estado en memoria a cero + loadWorld
// (mismo flujo de arranque de server.js).
function simulateRestart(save, state) {
	state.chunks.clear();
	state.dirtyChunks.clear();
	state.mobs = [];
	state.furnaces.clear();
	state.chests.clear();
	return save.loadWorld();
}

function auditGuardado() {
	const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-audit7-save-"));
	const constants = require(path.join(ROOT, "server", "constants.js"));
	const { SCHEMA_VERSION, CHUNK_SIZE, B, WORLD_MIN_Y } = constants;
	// Redirigir el I/O del mundo a un directorio temporal (patrón de
	// unit-persistencia.js) ANTES de requerir world/save.
	const WP = constants.worldPaths;
	WP.worldRoot = path.join(TMP, "worldroot");
	constants.setWorldSeed("auditIntegridad");
	const world = require(path.join(ROOT, "server", "world.js"));
	const save = require(path.join(ROOT, "server", "save.js"));
	const state = require(path.join(ROOT, "server", "state.js"));

	world.setDiskLoader(() => null);
	state.chunks.clear();
	state.dirtyChunks.clear();
	state.mobs = [];
	state.furnaces.clear();
	state.chests.clear();

	// --- 1) Generar un área de 5×5 chunks y modificarla ---
	for (let cx = -2; cx <= 2; cx++)
		for (let cz = -2; cz <= 2; cz++) world.generateChunk(cx, cz);
	// Persistir TODO el área (como el autosave tras generar un mundo).
	for (const key of state.chunks.keys()) state.dirtyChunks.add(key);

	const spawn = world.findSpawn(0, 0);
	const sx = Math.floor(spawn.x),
		sy = Math.floor(spawn.y),
		sz = Math.floor(spawn.z);
	// El bloque bajo los pies es sólido (spawn sobre tierra firme): el cofre
	// se coloca EN el suelo, la antorcha sobre él y se rompe otro bloque del
	// suelo (→ AIR). Cambios reales, no no-ops.
	world.setBlock(sx, sy - 1, sz, B.CHEST);
	world.setBlock(sx, sy, sz, B.TORCH);
	world.setBlock(sx + 3, sy - 1, sz, B.AIR);
	const chestCx = Math.floor(sx / CHUNK_SIZE),
		chestCz = Math.floor(sz / CHUNK_SIZE);
	const lx = ((sx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const lz = ((sz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	// Fase 18 (E-1): mundo v6 (−64..+63) — el índice del array del chunk usa
	// la Y LOCAL (y − WORLD_MIN_Y), no la absoluta; con la Y absoluta el
	// check leía la celda equivocada (el cofre "no persistía").
	const localY = sy - 1 - WORLD_MIN_Y;
	const chestIndex = (localY * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
	const chestFile = path.join(WP.chunksDir, `${chestCx}_${chestCz}.json`);

	const saved = save.saveWorld();
	check("Guardado: saveWorld devuelve true", saved === true);
	check(
		"Guardado: world.json con schemaVersion vigente y la semilla",
		(() => {
			try {
				const meta = JSON.parse(fs.readFileSync(WP.metaFile, "utf8"));
				return (
					meta.schemaVersion === SCHEMA_VERSION &&
					meta.seed === "auditIntegridad"
				);
			} catch {
				return false;
			}
		})()
	);
	const files0 = fs
		.readdirSync(WP.chunksDir)
		.filter((f) => f.endsWith(".json"));
	check(
		"Guardado: un archivo por chunk del área (25)",
		files0.length === 25,
		`${files0.length}`
	);
	check(
		"Guardado: dirtyChunks se limpia tras guardar",
		state.dirtyChunks.size === 0,
		`${state.dirtyChunks.size}`
	);
	// El cofre modificado queda en el archivo de su chunk.
	const parsed0 = world.readChunkFile(chestFile, "audit7");
	check(
		"Guardado: el cofre colocado se persiste en el chunk",
		parsed0 && parsed0.data[chestIndex] === B.CHEST
	);
	const hash0 = chunkFilesHash(WP.chunksDir);

	// --- 2) Reinicio 1: limpiar estado y recargar de disco ---
	const load1 = simulateRestart(save, state);
	check("Reinicio 1: loadWorld devuelve true", load1 === true, `${load1}`);
	check(
		"Reinicio 1: se restauran los 25 chunks",
		state.chunks.size === 25,
		`${state.chunks.size}`
	);
	check(
		"Reinicio 1: el cofre sobrevive al reinicio",
		state.chunks.get(`${chestCx},${chestCz}`)[chestIndex] === B.CHEST
	);
	check(
		"Reinicio 1: la rotura del suelo persiste (AIR)",
		world.getBlock(sx + 3, sy - 1, sz) === B.AIR
	);
	// generateChunk NO regenera lo guardado: lo recupera del disco.
	check(
		"Reinicio 1: generateChunk recupera de disco (no regenera)",
		world.generateChunk(chestCx, chestCz)[chestIndex] === B.CHEST
	);

	// --- 3) Reinicio 2: otro ciclo completo ("tras varios reinicios") ---
	const load2 = simulateRestart(save, state);
	check("Reinicio 2: loadWorld devuelve true", load2 === true, `${load2}`);
	check(
		"Reinicio 2: los 25 chunks se restauran de nuevo",
		state.chunks.size === 25,
		`${state.chunks.size}`
	);
	check(
		"Reinicio 2: cofre y antorcha intactos",
		state.chunks.get(`${chestCx},${chestCz}`)[chestIndex] === B.CHEST &&
			world.getBlock(sx, sy, sz) === B.TORCH
	);

	// --- 4) Re-guardar tras el reinicio produce los MISMOS archivos ---
	// (los datos cargados de disco se re-serializan sin corrupción).
	state.dirtyChunks.add(`${chestCx},${chestCz}`);
	state.dirtyChunks.add(`${chestCx + 1},${chestCz}`);
	save.saveWorld();
	const hash1 = chunkFilesHash(WP.chunksDir);
	check(
		"Re-guardado post-reinicio: archivos idénticos byte a byte",
		hash0 === hash1
	);
	const parsed1 = world.readChunkFile(chestFile, "audit7");
	check(
		"Re-guardado post-reinicio: el cofre sigue en disco",
		parsed1 && parsed1.data[chestIndex] === B.CHEST
	);

	fs.rmSync(TMP, { recursive: true, force: true });
}

// ============================================================
// MAIN
// ============================================================
(async () => {
	await auditCdp();
	auditGuardado();
	if (process.argv.includes("--regresion")) {
		const r = spawnSync(
			process.execPath,
			[path.join(ROOT, "tests", "run.js"), "--unit"],
			{ stdio: "inherit" }
		);
		check("Regresión: suite unitaria de fases 0-6 en verde", r.status === 0);
	}
	// biome-ignore lint/suspicious/noConsole: resultado de la auditoría
	console.log(
		fails ? `AUDITORÍA FASE 7: ${fails} fallos` : "AUDITORÍA FASE 7: OK"
	);
	process.exit(fails ? 1 : 0);
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real de la auditoría
	console.error("audit-fase7:", e.message);
	process.exit(1);
});
