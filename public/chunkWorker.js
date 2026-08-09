// ============================================================
// WEB WORKER DE CHUNKS (Fase 13, A2)
// Genera la geometría de los chunks FUERA del hilo principal: al cargar un
// lote grande de chunks (init o exploración) el build de cada uno corre en
// paralelo y la página no se congela. El worker usa EXACTAMENTE la misma
// función pura que el camino síncrono (buildChunkGeometryData), así que la
// geometría es idéntica garantizada (tests/unit-workers.js lo verifica).
//
// El hilo principal conserva el pool de geometrías, el LOD y el culling:
// aquí solo se calculan los arrays de atributos. El worker se crea con
// `new Worker(new URL("./chunkWorker.js", import.meta.url), { type:
// "module" })` — por eso este archivo es ESM y su cadena de imports (solo
// módulos puros: chunkGeometry.js → texturemap.js/constants.js) no puede
// pasar por three (los module workers no resuelven el importmap de la
// página).
//
// Formato del mensaje de entrada:
//   { type: "build", id, key, job: {
//       cx, cz, chunkKeys: ["0,0","1,0",...],
//       chunkData: [Uint8Array, ...],   // paralelo a chunkKeys
//       lightKeys: [...], lightData: [Float32Array|null, ...]
//   } }
// Salida: { type: "chunk_built", id, key, buffers }
// ============================================================
import { buildChunkGeometryData } from "./chunkGeometry.js";
import { tileForFace, tileRect } from "./texturemap.js";

function buildJob(msg) {
	const { id, key, job } = msg;
	const chunks = new Map();
	for (let i = 0; i < job.chunkKeys.length; i++)
		chunks.set(job.chunkKeys[i], job.chunkData[i]);
	const light = new Map();
	for (let i = 0; i < job.lightKeys.length; i++)
		light.set(job.lightKeys[i], job.lightData[i]);
	const buffers = buildChunkGeometryData({
		cx: job.cx,
		cz: job.cz,
		chunks,
		light,
		tileForFaceFn: tileForFace,
		tileRectFn: tileRect
	});
	return { type: "chunk_built", id, key, buffers };
}

// Browser (DedicatedWorkerGlobalScope) vs Node worker_threads (tests).
// En el navegador `process` no existe; en Node `self` no está definido.
const isBrowserWorker =
	typeof self !== "undefined" && typeof process === "undefined";
if (isBrowserWorker) {
	self.onmessage = (e) => {
		self.postMessage(buildJob(e.data));
	};
} else {
	const { parentPort } = await import("node:worker_threads");
	parentPort.on("message", (m) => {
		parentPort.postMessage(buildJob(m));
	});
}
