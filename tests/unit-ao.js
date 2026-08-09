"use strict";
// ============================================================
// TESTS DEL AO POR VÉRTICE (Fase 10, E1)
// Pendiente que cita docs/fase11-spec.md §12.1 y que nunca se
// consolidó en un test propio. Verifica la curva de sombreado de
// `vertexAO` (public/chunkGeometry.js) end-to-end: montando
// configuraciones concretas de bloques vecinos sobre la cara
// superior (+Y) de un bloque y leyendo el color del vértice de la
// esquina sombreada de la geometría generada. Con la luz vacía
// baseV=1, así que el color por vértice ES el valor AO.
//   esquina "encerrada" (s1&&s2)     → 0.5
//   un lado + diagonal               → 0.55
//   un lado, sin diagonal            → 0.7
//   solo diagonal                    → 0.85
//   al aire                          → 1.0
// Además: agua/lava/antorcha/plantas NO son oclusores, y el agua
// no se sombrea (ao siempre 1).
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let failed = 0;
const check = (name, ok, extra = "") => {
	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(`${ok ? "OK " : "✗  "}${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) failed++;
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unit-ao-"));
for (const f of ["chunkGeometry.js", "texturemap.js", "constants.js"])
	fs.copyFileSync(path.join(__dirname, "..", "public", f), path.join(tmp, f));
fs.writeFileSync(
	path.join(tmp, "package.json"),
	JSON.stringify({ type: "module" })
);

(async () => {
	const { buildChunkGeometryData } = await import(
		`file://${path.join(tmp, "chunkGeometry.js")}`
	);
	const { tileForFace, tileRect } = await import(
		`file://${path.join(tmp, "texturemap.js")}`
	);
	const {
		CHUNK_SIZE,
		WORLD_HEIGHT,
		WATER,
		LAVA,
		TORCH,
		TALL_GRASS
	} = await import(`file://${path.join(tmp, "constants.js")}`);

	const DIRT = 1; // bloque sólido opaco de prueba (paridad servidor/cliente)

	const cIdx = (x, y, z) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
	const airChunk = () => new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	const setBlock = (c, x, y, z, b) => {
		c[cIdx(x, y, z)] = b;
	};

	// Chunk 0,0 rodeado de aire (vecinos "dx,dz" presentes → sin -1 al
	// cruzar bordes; un -1 contaría como oclusor y falsearía el test).
	const neighbors = (center) => {
		const chunks = new Map([["0,0", center]]);
		const light = new Map([["0,0", null]]);
		for (let dx = -1; dx <= 1; dx++)
			for (let dz = -1; dz <= 1; dz++) {
				if (dx === 0 && dz === 0) continue;
				chunks.set(`${dx},${dz}`, airChunk());
				light.set(`${dx},${dz}`, null);
			}
		return { chunks, light };
	};
	const build = (chunk) =>
		buildChunkGeometryData({
			cx: 0,
			cz: 0,
			...neighbors(chunk),
			tileForFaceFn: tileForFace,
			tileRectFn: tileRect
		});

	// Bloque central en (1,5,1); la esquina que sombreamos es la [0,1,0]
	// de su cara +Y, el vértice del mundo (1,6,1). Sus oclusores:
	//   s1  = (0,6,1)   s2 = (1,6,0)   diag = (0,6,0)
	const X = 1,
		Y = 5,
		Z = 1,
		VX = 1,
		VY = 6,
		VZ = 1;
	const centerChunk = () => {
		const c = airChunk();
		setBlock(c, X, Y, Z, DIRT);
		return c;
	};

	// Lee el color del vértice del terreno en (vx,vy,vz) con normal +Y.
	// Devuelve la lista de colores (el vértice se repite en 2 triángulos).
	const colorAt = (geo, vx, vy, vz) => {
		if (!geo || !geo.pos) return [];
		const pos = geo.pos,
			norm = geo.norm,
			col = geo.col;
		const out = [];
		for (let i = 0; i < pos.length / 3; i++) {
			const j = i * 3;
			if (
				Math.abs(pos[j] - vx) < 1e-4 &&
				Math.abs(pos[j + 1] - vy) < 1e-4 &&
				Math.abs(pos[j + 2] - vz) < 1e-4 &&
				Math.abs(norm[j] - 0) < 1e-4 &&
				Math.abs(norm[j + 1] - 1) < 1e-4 &&
				Math.abs(norm[j + 2] - 0) < 1e-4
			)
				out.push(col[j]);
		}
		return out;
	};
	const near = (a, b) => Math.abs(a - b) < 0.01;

	// ----------------------------------------------------------
	// LA CURVA AO: 5 valores según la configuración de vecinos
	// ----------------------------------------------------------
	{
		// 1.0 — al aire: sin vecinos.
		const geo = build(centerChunk());
		const cs = colorAt(geo.terrain, VX, VY, VZ);
		check("AO al aire = 1.0", cs.length > 0 && cs.every((c) => near(c, 1.0)),
			JSON.stringify(cs));
	}
	{
		// 0.5 — esquina encerrada: s1 Y s2.
		const c = centerChunk();
		setBlock(c, 0, 6, 1, DIRT); // s1
		setBlock(c, 1, 6, 0, DIRT); // s2
		const cs = colorAt(build(c).terrain, VX, VY, VZ);
		check("AO esquina encerrada = 0.5", cs.length > 0 && cs.every((x) => near(x, 0.5)),
			JSON.stringify(cs));
	}
	{
		// 0.55 — un lado + diagonal.
		const c = centerChunk();
		setBlock(c, 0, 6, 1, DIRT); // s1
		setBlock(c, 0, 6, 0, DIRT); // diag
		const cs = colorAt(build(c).terrain, VX, VY, VZ);
		check("AO un lado + diagonal = 0.55", cs.length > 0 && cs.every((x) => near(x, 0.55)),
			JSON.stringify(cs));
	}
	{
		// 0.7 — un lado, sin diagonal.
		const c = centerChunk();
		setBlock(c, 0, 6, 1, DIRT); // s1
		const cs = colorAt(build(c).terrain, VX, VY, VZ);
		check("AO un lado, sin diagonal = 0.7", cs.length > 0 && cs.every((x) => near(x, 0.7)),
			JSON.stringify(cs));
	}
	{
		// 0.85 — solo diagonal.
		const c = centerChunk();
		setBlock(c, 0, 6, 0, DIRT); // diag
		const cs = colorAt(build(c).terrain, VX, VY, VZ);
		check("AO solo diagonal = 0.85", cs.length > 0 && cs.every((x) => near(x, 0.85)),
			JSON.stringify(cs));
	}

	// ----------------------------------------------------------
	// NO-OCLUSORES: agua, lava, antorcha y plantas no oscurecen
	// ----------------------------------------------------------
	for (const [name, id] of [
		["agua", WATER],
		["lava", LAVA],
		["antorcha", TORCH],
		["planta (tall_grass)", TALL_GRASS]
	]) {
		const c = centerChunk();
		setBlock(c, 0, 6, 1, id); // s1 (no oclusor)
		setBlock(c, 1, 6, 0, id); // s2 (no oclusor)
		const cs = colorAt(build(c).terrain, VX, VY, VZ);
		check(`AO: ${name} no es oclusor (sigue 1.0)`,
			cs.length > 0 && cs.every((x) => near(x, 1.0)), JSON.stringify(cs));
	}

	// ----------------------------------------------------------
	// EL AGUA NO SE SOMBREA (ao=1 aunque esté encerrada)
	// ----------------------------------------------------------
	{
		const c = airChunk();
		setBlock(c, X, Y, Z, WATER);
		setBlock(c, 0, 6, 1, DIRT); // oclusores alrededor de la celda de agua
		setBlock(c, 1, 6, 0, DIRT);
		setBlock(c, 0, 6, 0, DIRT);
		const geo = build(c);
		const water = geo.water;
		check("agua: geometría generada", !!water && water.pos.length > 0);
		if (water) {
			// Todos los vértices del agua con luz vacía deben ser exactamente
			// baseV (1.0): el AO no se aplica a los líquidos.
			const cols = water.col;
			const bad = [];
			for (let i = 0; i < cols.length; i++)
				if (!near(cols[i], 1.0)) bad.push(cols[i]);
			check("agua: ningún vértice sombreado (todos 1.0)",
				bad.length === 0, JSON.stringify(bad.slice(0, 6)));
		}
	}

	process.exit(failed === 0 ? 0 : 1);
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
