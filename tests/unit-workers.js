"use strict";
// ============================================================
// TESTS DEL WEB WORKER DE CHUNKS (Fase 13, A2)
// El worker (chunkWorker.js) importa la MISMA función pura que el camino
// síncrono (buildChunkGeometryData), así que la geometría debe ser
// idéntica. Aquí se lanza un worker_threads REAL de Node (el mismo archivo
// que el navegador, con el arranque dual browser/worker_threads) y se
// compara su salida con la llamada síncrona, byte a byte.
// Los módulos se copian a un directorio temporal con package.json
// {"type":"module"} (patrón de unit-raycast.js / unit-greedy.js) para que
// Node resuelva los imports ESM relativos del worker.
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (name, ok, extra = "") => {
	console.log(`${ok ? "OK " : "✗  "}${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) {
		failed++;
		failedChecks.push(name);
	}
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unit-workers-"));
for (const f of [
	"chunkWorker.js",
	"chunkGeometry.js",
	"texturemap.js",
	"constants.js"
])
	fs.copyFileSync(path.join(__dirname, "..", "public", f), path.join(tmp, f));
fs.writeFileSync(
	path.join(tmp, "package.json"),
	JSON.stringify({ type: "module" })
);

(async () => {
	const { Worker } = await import("node:worker_threads");
	const { buildChunkGeometryData } = await import(
		`file://${path.join(tmp, "chunkGeometry.js")}`
	);
	const { tileForFace, tileRect } = await import(
		`file://${path.join(tmp, "texturemap.js")}`
	);
	const { CHUNK_SIZE, WORLD_HEIGHT, WATER, TORCH } = await import(
		`file://${path.join(tmp, "constants.js")}`
	);

	const cIdx = (x, y, z) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
	const airChunk = () => new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	const setBlock = (c, x, y, z, b) => {
		c[cIdx(x, y, z)] = b;
	};

	// Chunk de prueba: losa con relieve + agua + antorcha + hierba alta.
	const chunk = airChunk();
	for (let y = 0; y <= 6; y++)
		for (let x = 0; x < CHUNK_SIZE; x++)
			for (let z = 0; z < CHUNK_SIZE; z++)
				setBlock(chunk, x, y, z, x % 3 === 0 && y === 6 ? 3 : 1);
	// Hoyo de agua en (4..6, 7..9)
	for (let x = 4; x <= 6; x++)
		for (let z = 7; z <= 9; z++) {
			setBlock(chunk, x, 7, z, WATER);
			setBlock(chunk, x, 6, z, 0);
		}
	setBlock(chunk, 12, 8, 12, TORCH);
	setBlock(chunk, 1, 8, 1, 33); // hierba alta
	// Luz horneada simulada: una antorcha ficticia en (12, 8, 12).
	const light = new Float32Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	light[cIdx(12, 8, 12)] = 1;
	light[cIdx(12, 9, 12)] = 0.8;
	light[cIdx(12, 8, 13)] = 0.64;

	// Datos para el job (el mismo que enviaría world.js al worker).
	const chunkKeys = ["0,0"];
	const chunkData = [chunk];
	const lightKeys = ["0,0"];
	const lightData = [light];
	const job = { cx: 0, cz: 0, chunkKeys, chunkData, lightKeys, lightData };

	// ---- Síncrono (fallback) ---------------------------------
	const sync = buildChunkGeometryData({
		cx: 0,
		cz: 0,
		chunks: new Map([["0,0", chunk]]),
		light: new Map([["0,0", light]]),
		tileForFaceFn: tileForFace,
		tileRectFn: tileRect
	});
	check("1. el build síncrono produce geometría", sync !== null);
	check(
		"1. el build síncrono tiene terreno+agua+antorcha",
		!!sync.terrain && !!sync.water && !!sync.torch,
		`terrain=${!!sync.terrain}, water=${!!sync.water}, torch=${!!sync.torch}`
	);

	// ---- Worker real de Node ---------------------------------
	const worker = new Worker(path.join(tmp, "chunkWorker.js"));
	const result = await new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error("timeout worker")), 15000);
		worker.once("message", (m) => {
			clearTimeout(timer);
			resolve(m);
		});
		worker.once("error", (e) => {
			clearTimeout(timer);
			reject(e);
		});
		worker.postMessage({ type: "build", id: 42, key: "0,0", job });
	});
	worker.terminate();

	check("2. el worker responde chunk_built", result?.type === "chunk_built");
	check(
		"2. el worker devuelve el id y la clave pedidos",
		result?.id === 42 && result?.key === "0,0"
	);

	// ---- Identidad worker ↔ síncrono --------------------------
	const sameBuffer = (a, b) => {
		if (!a || !b) return a === b;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++)
			if (Math.abs(a[i] - b[i]) > 1e-5) return false;
		return true;
	};
	const samePart = (a, b) =>
		sameBuffer(a?.pos, b?.pos) &&
		sameBuffer(a?.norm, b?.norm) &&
		sameBuffer(a?.uv, b?.uv) &&
		sameBuffer(a?.col, b?.col);
	check(
		"3. identidad terreno (worker == síncrono)",
		samePart(result.buffers.terrain, sync.terrain),
		`verts=${result.buffers.terrain?.pos.length / 3}`
	);
	check(
		"3. identidad agua (worker == síncrono)",
		samePart(result.buffers.water, sync.water)
	);
	check(
		"3. identidad antorchas/plantas (worker == síncrono)",
		samePart(result.buffers.torch, sync.torch),
		`verts=${result.buffers.torch?.pos.length / 3}`
	);

	// ---- Invariante de la spec A2: mismo conteo de vértices ----
	const counts = ["terrain", "water", "lava", "torch"].map((k) => [
		k,
		result.buffers[k]?.pos.length ?? 0,
		sync[k]?.pos.length ?? 0
	]);
	check(
		"4. conteo de vértices idéntico en las 4 categorías",
		counts.every(([, a, b]) => a === b),
		counts.map(([k, a, b]) => `${k}:${a}/${b}`).join(" ")
	);

	fs.rmSync(tmp, { recursive: true, force: true });
	console.log(failed ? `\n${failed} check(s) FALLARON` : "\nTODO OK");
	process.exit(failed ? 1 : 0);
})();
