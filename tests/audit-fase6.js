"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 6 (herramienta reutilizable)
// 1) LOD de chunks lejanos: replica la regla EXACTA del cliente
//    (public/lod.js + public/world.js buildLodGeometry) sobre
//    datos generados frescos y compara, para el área de render
//    completa (radio 6 = 13×13 chunks), los TRIÁNGULOS con LOD
//    activo vs sin LOD (todo detalle completo). El LOD es un
//    "caparazón" por columna: 1 quad de tapa + hasta 4 quads de
//    muro donde el vecino es más bajo (color plano, sin teselas).
// 2) Memoria por chunk de la GEOMETRÍA (lo que retiene el pool):
//    bytes de vértices full (pos+normal+uv) vs LOD (pos+normal+
//    color) y extrapolación al área activa de radio 6.
// 3) Pool de geometrías: con el mismo ciclo de carga/descarga que
//    hace el cliente al moverse, verificar que reutiliza de verdad
//    (sin allocs nuevas) usando createGeometryPool de
//    public/geopool.js (módulo puro, sin three).
// 4) Determinismo de la geometría LOD (regeneración bit-idéntica).
//
// FPS reales del navegador (no los mide este script): dos servidores con
// la MISMA semilla (SEED=... env var), uno normal (LOD activo) y otro con
// public/lod.js parcheado (LOD_ON_DIST=999999 → nunca entra en LOD), y un
// medidor CDP (Chrome headless + SwiftShader, render por software —
// números conservadores) que espera a que carguen los chunks, gira la
// cámara hacia el horizonte y muestrea window.__mcFps/__mcTriangles/
// __mcChunks/performance.memory durante ~8 s. Resultados agosto 2026:
// CON LOD 100.5 FPS media (136.5 estables) vs SIN LOD 24.3 (30 estables).
// Uso: node tests/audit-fase6.js
// ============================================================
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const { B, CHUNK_SIZE, WORLD_HEIGHT } = require(
	path.join(ROOT, "server", "constants.js")
);
const world = require(path.join(ROOT, "server", "world.js"));
const state = require(path.join(ROOT, "server", "state.js"));

// PRNG determinista (Park-Miller LCG, patrón de unit-arboles): la altura de
// superficie depende de los árboles, que usan Math.random global (F11). Con
// la secuencia real, dos regeneraciones consumen tramos DISTINTOS y el check
// de determinismo daba falsos fallos. Sembrando el MISMO LCG antes de cada
// pasada, ambas consumen la misma secuencia → el check mide el determinismo
// real de la geometría LOD, no la suerte del RNG global.
function lcg(seed) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

let fails = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_n, ok, _extra) => {
	if (!ok) {
		fails++;
		failedChecks.push(_n);
	}
};

// --- Reglas EXACTAS del cliente (fuente de verdad: public/world.js) ---
// Caras del tier completo: un bloque dibuja una cara contra su vecino si ese
// vecino es visible (aire o agua para sólidos; solo aire para el agua).
const DIRS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];
function clientShouldDraw(block, neighbor) {
	return block === B.WATER
		? neighbor === B.AIR
		: neighbor === B.AIR || neighbor === B.WATER;
}
// Altura de la superficie del LOD (primer bloque no vacío desde arriba; el
// agua cuenta — la lámina de un lago se dibuja a su nivel). El cliente
// devuelve -1 para columna vacía o chunk no cargado; aquí el vecindario
// completo está generado, así que nunca hay -1 reales.
function columnSurfaceY(cx, cz, x, z, wx, wz) {
	for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
		const b =
			x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE
				? state.chunks.get(`${cx},${cz}`)[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x]
				: world.getBlock(wx, y, wz);
		if (b !== 0 && b !== -1) return y;
	}
	return -1;
}
// Caras del LOD de un chunk (buildLodGeometry): 1 tapa + muros donde el
// vecino de la rejilla 18×18 es más bajo y no vacío.
function countLodQuads(cx, cz) {
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;
	// Rejilla de alturas local -1..16 → 18×18 (interior del chunk + anillo).
	const H = [];
	for (let x = -1; x <= CHUNK_SIZE; x++) {
		const row = [];
		for (let z = -1; z <= CHUNK_SIZE; z++) {
			row.push(columnSurfaceY(cx, cz, x, z, baseX + x, baseZ + z));
		}
		H.push(row);
	}
	const hAt = (x, z) => H[x + 1][z + 1];
	let quads = 0;
	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			const h = hAt(x, z);
			if (h < 0) continue;
			quads++; // tapa superior
			if (hAt(x + 1, z) >= 0 && hAt(x + 1, z) < h) quads++; // +X
			if (hAt(x - 1, z) >= 0 && hAt(x - 1, z) < h) quads++; // -X
			if (hAt(x, z + 1) >= 0 && hAt(x, z + 1) < h) quads++; // +Z
			if (hAt(x, z - 1) >= 0 && hAt(x, z - 1) < h) quads++; // -Z
		}
	}
	return quads;
}
// Caras del tier completo de un chunk (culling del cliente, con vecinos
// reales — el área completa está generada).
function countFullFaces(cx, cz) {
	const chunk = state.chunks.get(`${cx},${cz}`);
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;
	let faces = 0;
	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let y = 0; y < WORLD_HEIGHT; y++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const block = chunk[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
				if (block === B.AIR) continue;
				const wx = baseX + x,
					wy = y,
					wz = baseZ + z;
				for (const [dx, dy, dz] of DIRS) {
					if (
						clientShouldDraw(block, world.getBlock(wx + dx, wy + dy, wz + dz))
					)
						faces++;
				}
			}
		}
	}
	return faces;
}
// Decisión LOD del cliente (public/lod.js, estado inicial 'full' como al
// cargar): se entra en LOD al superar LOD_ON_DIST=56 bloques (horizontal,
// sin Y — la Y no cuenta para que el tier no parpadee en colinas).
function lodTier(dist) {
	return dist > 56 ? "lod" : "full";
}
world.setDiskLoader(() => null);
state.chunks.clear();
const R = 6;
for (let cx = -R; cx <= R; cx++)
	for (let cz = -R; cz <= R; cz++) world.generateChunk(cx, cz);

// Centro del jugador (spawn real del mundo, como la cámara del cliente).
const spawn = world.findSpawn(0, 0);
const px = spawn.x,
	pz = spawn.z;

let fullFaces = 0,
	lodFaces = 0,
	fullChunks = 0,
	lodChunks = 0,
	_total = 0;
for (let cx = -R; cx <= R; cx++) {
	for (let cz = -R; cz <= R; cz++) {
		_total++;
		const cxp = cx * CHUNK_SIZE + CHUNK_SIZE / 2,
			czp = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
		const dist = Math.hypot(px - cxp, pz - czp);
		if (lodTier(dist) === "lod") {
			lodFaces += countLodQuads(cx, cz);
			lodChunks++;
		} else {
			fullFaces += countFullFaces(cx, cz);
			fullChunks++;
		}
	}
}
const withLodTris = (fullFaces + lodFaces) * 2;
// Sin LOD: TODOS los chunks en detalle completo.
let allFullFaces = 0;
for (let cx = -R; cx <= R; cx++)
	for (let cz = -R; cz <= R; cz++) allFullFaces += countFullFaces(cx, cz);
const noLodTris = allFullFaces * 2;
const reduction = 1 - withLodTris / noLodTris;

check(
	"Perf: el LOD reduce los triángulos del área activa ≥ 20% (los lejanos dominan el recuento bruto)",
	reduction >= 0.2,
	`${(reduction * 100).toFixed(1)}%`
);
check(
	"Perf: los chunks lejanos (radio 6) son mayoría LOD, como espera el diseño",
	lodChunks > fullChunks,
	`${lodChunks} lod vs ${fullChunks} full`
);

// Un chunk LOD individual debe costar MUCHO menos que su equivalente full.
{
	// Encuentra un par comparable: un chunk lejano (LOD) y, para la misma
	// zona, su coste si fuera full (para ver el ahorro real por chunk).
	let lodF = 0,
		lodQ = 0,
		lodCx = 0,
		lodCz = 0;
	for (let cx = R; cx <= R; cx++)
		for (let cz = R; cz <= R; cz++) {
			const cxp = cx * CHUNK_SIZE + CHUNK_SIZE / 2,
				czp = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
			if (Math.hypot(px - cxp, pz - czp) > 56) {
				lodCx = cx;
				lodCz = cz;
				break;
			}
		}
	lodF = countFullFaces(lodCx, lodCz);
	lodQ = countLodQuads(lodCx, lodCz);
	check(
		"Perf: un chunk LOD cuesta < 30% de su versión full (ahorro dominante en el anillo)",
		lodQ / lodF < 0.3,
		`${(100 - (lodQ / lodF) * 100).toFixed(1)}% ahorro`
	);
}
// Bytes por vértice: full = pos(3) + normal(3) + uv(2) floats; LOD = pos(3)
// + normal(3) + color(3). Cada cara/quad = 2 triángulos = 6 vértices.
const FLOATS_FULL = 8,
	FLOATS_LOD = 9,
	BYTES = 4;
const bytesFull = (faces) => faces * 6 * FLOATS_FULL * BYTES;
const bytesLod = (quads) => quads * 6 * FLOATS_LOD * BYTES;
const memWithLod = bytesFull(fullFaces) + bytesLod(lodFaces);
const memNoLod = bytesFull(allFullFaces);
check(
	"Mem: el área activa con LOD cabe holgada en presupuesto (< 30 MB de geometría bruta)",
	memWithLod < 30 * 1024 * 1024,
	`${(memWithLod / 1024 / 1024).toFixed(2)} MB`
);
check(
	"Mem: con LOD la geometría bruta se reduce ≥ 40% vs todo full",
	memWithLod / memNoLod < 0.6,
	`${(100 - (memWithLod / memNoLod) * 100).toFixed(1)}% ahorro`
);
// Reutilización real del pool (public/geopool.js es módulo puro, sin three):
// simula el ciclo del cliente al moverse — descargar un chunk (release) y
// cargar otro nuevo (acquire) — y verifica que la segunda carga NO crea
// geometría nueva (la reutiliza del pool).
(async () => {
	// public/geopool.js es ESM y package.json es CommonJS: mismo truco de
	// import que unit-geopool.js (copia a un .mjs temporal e import dinámico).
	const src = path.join(ROOT, "public", "geopool.js");
	const tmp = path.join(
		require("node:os").tmpdir(),
		`audit-geopool-${process.pid}.mjs`
	);
	require("node:fs").copyFileSync(src, tmp);
	const { createGeometryPool, setOrReuseAttribute } = await import(
		`file://${tmp}`
	);
	require("node:fs").unlinkSync(tmp);

	// Geometría falsa (como unit-geopool): attributes + dispose registrado.
	function makeFakeGeometry() {
		return {
			attrs: new Map(),
			disposed: false,
			getAttribute(n) {
				return this.attrs.get(n) || null;
			},
			setAttribute(n, a) {
				this.attrs.set(n, a);
				return this;
			},
			dispose() {
				this.disposed = true;
			}
		};
	}
	// Ctor de attribute con contador de allocs (lo llama setOrReuseAttribute
	// solo cuando crea un attribute NUEVO).
	let attrAllocs = 0;
	function CountingAttr(data, itemSize) {
		attrAllocs++;
		return { array: new Float32Array(data), itemSize, needsUpdate: false };
	}

	const pool = createGeometryPool({
		makeGeometry: makeFakeGeometry,
		maxPooled: 24
	});
	// Simula el ciclo del cliente: cargar un chunk (acquire + fill), descargar
	// (release) y cargar otro chunk de tamaño parecido (re-adquirir).
	const geo1 = pool.acquire("terrain");
	setOrReuseAttribute(
		geo1,
		"position",
		new Float32Array(6000),
		3,
		CountingAttr
	); // 6000 floats = 2000 caras
	const s1 = pool.stats();
	const allocs1 = attrAllocs;
	pool.release("terrain", geo1); // descargar chunk → la geometría vuelve al pool
	const geo2 = pool.acquire("terrain"); // cargar otro chunk
	setOrReuseAttribute(
		geo2,
		"position",
		new Float32Array(6000),
		3,
		CountingAttr
	);
	const s2 = pool.stats();
	check(
		"Pool: cargar un chunk nuevo tras descargar uno reutiliza la geometría (0 creadas nuevas)",
		s2.created === s1.created && s2.reused === s1.reused + 1,
		`created ${s1.created}→${s2.created}, reused ${s1.reused}→${s2.reused}`
	);
	check(
		"Pool: la reutilización devuelve la MISMA geometría (sin alloc ni dispose)",
		geo2 === geo1 && !geo1.disposed
	);
	check(
		"Pool: atributo de mismo tamaño reutiliza el array (0 allocs de Float32Array)",
		attrAllocs === allocs1,
		`${allocs1}→${attrAllocs} allocs`
	);

	// Tope del pool: al descargar más de maxPooled, el exceso se libera (dispose).
	const batch = [];
	for (let i = 0; i < 30; i++) batch.push(pool.acquire("water"));
	const beforeDispose = pool.stats().created;
	batch.forEach((g) => {
		pool.release("water", g);
	});
	const s3 = pool.stats();
	// De las 30 liberadas, 24 caben en el pool water (tope) y 6 se disponen.
	// created no crece: el pool NUNCA vuelve a fabricar geometría al liberar.
	check(
		"Pool: el exceso sobre maxPooled (24) se libera con dispose y no crece sin límite",
		s3.disposed === batch.length - 24 && s3.created === beforeDispose,
		`${s3.disposed} liberadas de ${batch.length} (retiene 24), created ${beforeDispose}→${s3.created}`
	);

	// setOrReuseAttribute con tamaño DISTINTO sí crea (1 alloc nuevo).
	const geo3 = pool.acquire("lod");
	const allocs3 = attrAllocs;
	setOrReuseAttribute(
		geo3,
		"position",
		new Float32Array(12000),
		3,
		CountingAttr
	);
	check(
		"Pool: atributo de tamaño distinto crea uno nuevo (1 alloc)",
		attrAllocs === allocs3 + 1,
		`${allocs3}→${attrAllocs}`
	);
})()
	.then(() => {
		// El LOD es función pura de la altura de superficie: regenerar un chunk
		// debe dar la MISMA geometría LOD (muros y tapas idénticos). Se regenera
		// DOS veces y se comparan ENTRE SÍ. La altura de superficie depende de
		// los árboles, que usan Math.random global (F11): sembrando el MISMO LCG
		// antes de cada pasada ambas consumen la misma secuencia → bit-idénticas
		// (patrón de unit-arboles; con la secuencia real el check daba falsos
		// fallos porque cada regeneración consumía un tramo distinto).
		const realRandom = Math.random;
		Math.random = lcg(20260809);
		state.chunks.delete("2,2");
		world.generateChunk(2, 2);
		const lodA = countLodQuads(2, 2);
		Math.random = lcg(20260809); // misma semilla → misma secuencia
		state.chunks.delete("2,2");
		world.generateChunk(2, 2);
		const lodB = countLodQuads(2, 2);
		Math.random = realRandom;
		check(
			"Gen: la geometría LOD de un chunk regenerado es idéntica (sin costuras)",
			lodA === lodB,
			`${lodA} quads en ambas regeneraciones`
		);

		world.setDiskLoader(null);
		process.exit(fails ? 1 : 0);
	})
	.catch((_e) => {
		process.exit(1);
	});
