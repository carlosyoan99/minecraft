"use strict";
// ============================================================
// TESTS DEL GREEDY MESHING (Fase 13, A1)
// chunkGeometry.js fusiona caras coplanares contiguas en quads grandes.
// Estos tests verifican las DOS promesas del cambio:
//   1) MENOS CARAS: una losa plana genera ≥5× menos vértices que la
//      construcción per-celda (la referencia naive replica el algoritmo de
//      world.js Fase 10-12).
//   2) MISMO RESULTADO VISUAL: en datos donde no hay caras fusionables
//      (bloques aislados), el greedy produce EXACTAMENTE los mismos
//      triángulos (posición+normal+UV+color) que la referencia — o sea que
//      fusionar no altera la renderización de una celda suelta.
// Se usa la cadena de módulos puros del worker (chunkGeometry.js →
// texturemap.js/constants.js) vía copia a un directorio temporal con
// package.json {"type":"module"} (patrón de unit-raycast.js).
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (typeof failedChecks !== "undefined" && failedChecks.length)
		console.log(`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`);
});
const check = (name, ok, extra = "") => {
	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(`${ok ? "OK " : "✗  "}${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) { failed++; failedChecks.push(name); }
};

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "unit-greedy-"));
for (const f of ["chunkGeometry.js", "texturemap.js", "constants.js"])
	fs.copyFileSync(path.join(__dirname, "..", "public", f), path.join(tmp, f));
fs.writeFileSync(
	path.join(tmp, "package.json"),
	JSON.stringify({ type: "module" })
);

(async () => {
	const THREE = await import("three");
	const { buildChunkGeometryData } = await import(
		`file://${path.join(tmp, "chunkGeometry.js")}`
	);
	const { tileForFace, tileRect, TILE_COUNT } = await import(
		`file://${path.join(tmp, "texturemap.js")}`
	);
	const { CHUNK_SIZE, WORLD_HEIGHT, WATER, TORCH, NON_SOLID_PLANTS } =
		await import(`file://${path.join(tmp, "constants.js")}`);

	const cIdx = (x, y, z) => (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
	const airChunk = () => new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
	const setBlock = (c, x, y, z, b) => {
		c[cIdx(x, y, z)] = b;
	};

	// Chunk 0,0 rodeado de aire (vecinos "dx,dz" presentes → caras de borde).
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
	const build = (cx, cz, chunk) =>
		buildChunkGeometryData({
			cx,
			cz,
			...neighbors(chunk),
			tileForFaceFn: tileForFace,
			tileRectFn: tileRect
		});

	// ----------------------------------------------------------
	// REFERENCIA NAIVE: replica del buildChunkGeometry de world.js
	// (Fase 10-12, antes del greedy) — celda a celda, sin fusión.
	// ----------------------------------------------------------
	const FACES = [
		{
			dir: [1, 0, 0],
			corners: [
				[1, 0, 0],
				[1, 1, 0],
				[1, 1, 1],
				[1, 0, 1]
			],
			uvs: [
				[0, 0],
				[0, 1],
				[1, 1],
				[1, 0]
			]
		},
		{
			dir: [-1, 0, 0],
			corners: [
				[0, 0, 1],
				[0, 1, 1],
				[0, 1, 0],
				[0, 0, 0]
			],
			uvs: [
				[0, 0],
				[0, 1],
				[1, 1],
				[1, 0]
			]
		},
		{
			dir: [0, 1, 0],
			corners: [
				[0, 1, 0],
				[0, 1, 1],
				[1, 1, 1],
				[1, 1, 0]
			],
			uvs: [
				[0, 0],
				[0, 1],
				[1, 1],
				[1, 0]
			]
		},
		{
			dir: [0, -1, 0],
			corners: [
				[0, 0, 1],
				[0, 0, 0],
				[1, 0, 0],
				[1, 0, 1]
			],
			uvs: [
				[0, 0],
				[0, 1],
				[1, 1],
				[1, 0]
			]
		},
		{
			dir: [0, 0, 1],
			corners: [
				[1, 0, 1],
				[1, 1, 1],
				[0, 1, 1],
				[0, 0, 1]
			],
			uvs: [
				[0, 0],
				[0, 1],
				[1, 1],
				[1, 0]
			]
		},
		{
			dir: [0, 0, -1],
			corners: [
				[0, 0, 0],
				[0, 1, 0],
				[1, 1, 0],
				[1, 0, 0]
			],
			uvs: [
				[0, 0],
				[0, 1],
				[1, 1],
				[1, 0]
			]
		}
	];
	const GAIN = 1.4;
	const naiveBuild = ({ cx, cz, chunks, light }) => {
		const chunk = chunks.get("0,0");
		const baseX = cx * CHUNK_SIZE,
			baseZ = cz * CHUNK_SIZE;
		const sampleBlock = (wx, wy, wz) => {
			if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
			const arr = chunks.get(
				`${Math.floor(wx / CHUNK_SIZE) - cx},${Math.floor(wz / CHUNK_SIZE) - cz}`
			);
			if (!arr) return -1;
			return arr[
				cIdx(
					((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
					wy,
					((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
				)
			];
		};
		const lightAt = (wx, wy, wz) => {
			if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
			const arr = light.get(
				`${Math.floor(wx / CHUNK_SIZE) - cx},${Math.floor(wz / CHUNK_SIZE) - cz}`
			);
			if (!arr) return 0;
			return arr[
				cIdx(
					((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE,
					wy,
					((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE
				)
			];
		};
		const isOccluder = (bx, by, bz) => {
			const b = sampleBlock(bx, by, bz);
			return b !== 0 && b !== WATER && b !== TORCH && !NON_SOLID_PLANTS.has(b);
		};
		const vertexAO = (wx, wy, wz, corner, dir) => {
			const axes = [];
			for (let i = 0; i < 3; i++) if (dir[i] === 0) axes.push(i);
			const a = axes[0],
				b = axes[1];
			const off = (axis) => (corner[axis] === 1 ? 1 : -1);
			const oa = [0, 0, 0];
			oa[a] = off(a);
			const ob = [0, 0, 0];
			ob[b] = off(b);
			const s1 = isOccluder(
				wx + corner[0] + oa[0],
				wy + corner[1] + oa[1],
				wz + corner[2] + oa[2]
			);
			const s2 = isOccluder(
				wx + corner[0] + ob[0],
				wy + corner[1] + ob[1],
				wz + corner[2] + ob[2]
			);
			const diag = isOccluder(
				wx + corner[0] + oa[0] + ob[0],
				wy + corner[1] + oa[1] + ob[1],
				wz + corner[2] + oa[2] + ob[2]
			);
			if (s1 && s2) return 0.5;
			if (s1 || s2) return diag ? 0.55 : 0.7;
			return diag ? 0.85 : 1.0;
		};
		const terrain = { pos: [], norm: [], uv: [], col: [] };
		const water = { pos: [], norm: [], uv: [], col: [] };
		const lava = { pos: [], norm: [], uv: [], col: [] };
		const torch = { pos: [], norm: [], uv: [], col: [] };
		const pushFace = (block, fi, target, wx, wy, wz) => {
			const [u0, v0, u1, v1] =
				block === WATER ? [0, 0, 1, 1] : tileRect(tileForFace(block, fi));
			const corners = FACES[fi].corners;
			const verts = corners.map((cor) => [
				wx + cor[0],
				wy + cor[1],
				wz + cor[2]
			]);
			if (block === WATER && fi === 2) {
				for (const vert of verts) vert[1] = wy + 0.875;
			}
			const face = FACES[fi];
			const light = lightAt(
				wx + face.dir[0],
				wy + face.dir[1],
				wz + face.dir[2]
			);
			const baseV = 1 + light * GAIN;
			const useAO = target.pos === terrain.pos;
			const ao = corners.map((cor) =>
				useAO ? vertexAO(wx, wy, wz, cor, face.dir) : 1
			);
			for (const [i, j, k] of [
				[0, 1, 2],
				[0, 2, 3]
			]) {
				for (const idx of [i, j, k]) {
					target.pos.push(...verts[idx]);
					target.norm.push(...face.dir);
					const [uu, vv] = face.uvs[idx];
					target.uv.push(u0 + uu * (u1 - u0), v0 + vv * (v1 - v0));
					const v = baseV * ao[idx];
					target.col.push(v, v, v);
				}
			}
		};
		const TORCH_W = 0.25,
			TORCH_H = 0.6,
			PLANT_W = 0.32,
			PLANT_H = 0.8;
		const torchLight = 1 + GAIN;
		const [tu0, tv0, tu1, tv1] = tileRect(tileForFace(TORCH, 0));
		const QUAD_UVS = [
			[0, 0],
			[1, 0],
			[1, 1],
			[0, 1]
		];
		const pushCrossQuad = (
			ax,
			ay,
			az,
			bx,
			by,
			bz,
			cx2,
			cy,
			cz2,
			dx,
			dy,
			dz,
			nx,
			ny,
			nz,
			uv
		) => {
			const verts = [
				[ax, ay, az],
				[bx, by, bz],
				[cx2, cy, cz2],
				[dx, dy, dz]
			];
			const [e0, f0, e1, f1] = uv;
			for (const [i, j, k] of [
				[0, 1, 2],
				[0, 2, 3]
			]) {
				for (const idx of [i, j, k]) {
					torch.pos.push(...verts[idx]);
					torch.norm.push(nx, ny, nz);
					const [uu, vv] = QUAD_UVS[idx];
					torch.uv.push(e0 + uu * (e1 - e0), f0 + vv * (f1 - f0));
					torch.col.push(torchLight, torchLight, torchLight);
				}
			}
		};
		const pushTorch = (wx, wy, wz) => {
			const uv = [tu0, tv0, tu1, tv1];
			pushCrossQuad(
				wx - TORCH_W,
				wy,
				wz - TORCH_W,
				wx + TORCH_W,
				wy,
				wz + TORCH_W,
				wx + TORCH_W,
				wy + TORCH_H,
				wz + TORCH_W,
				wx - TORCH_W,
				wy + TORCH_H,
				wz - TORCH_W,
				-Math.SQRT1_2,
				0,
				Math.SQRT1_2,
				uv
			);
			pushCrossQuad(
				wx + TORCH_W,
				wy,
				wz - TORCH_W,
				wx - TORCH_W,
				wy,
				wz + TORCH_W,
				wx - TORCH_W,
				wy + TORCH_H,
				wz + TORCH_W,
				wx + TORCH_W,
				wy + TORCH_H,
				wz - TORCH_W,
				-Math.SQRT1_2,
				0,
				-Math.SQRT1_2,
				uv
			);
		};
		const pushPlant = (wx, wy, wz, block) => {
			const uv = tileRect(tileForFace(block, 0));
			pushCrossQuad(
				wx - PLANT_W,
				wy,
				wz - PLANT_W,
				wx + PLANT_W,
				wy,
				wz + PLANT_W,
				wx + PLANT_W,
				wy + PLANT_H,
				wz + PLANT_W,
				wx - PLANT_W,
				wy + PLANT_H,
				wz - PLANT_W,
				-Math.SQRT1_2,
				0,
				Math.SQRT1_2,
				uv
			);
			pushCrossQuad(
				wx + PLANT_W,
				wy,
				wz - PLANT_W,
				wx - PLANT_W,
				wy,
				wz + PLANT_W,
				wx - PLANT_W,
				wy + PLANT_H,
				wz + PLANT_W,
				wx + PLANT_W,
				wy + PLANT_H,
				wz - PLANT_W,
				-Math.SQRT1_2,
				0,
				-Math.SQRT1_2,
				uv
			);
		};
		for (let x = 0; x < CHUNK_SIZE; x++)
			for (let y = 0; y < WORLD_HEIGHT; y++)
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const block = chunk[cIdx(x, y, z)];
					if (block === 0) continue;
					const wx = baseX + x,
						wy = y,
						wz = baseZ + z;
					if (block === TORCH) {
						pushTorch(wx, wy, wz);
						continue;
					}
					if (NON_SOLID_PLANTS.has(block)) {
						pushPlant(wx, wy, wz, block);
						continue;
					}
					const isWater = block === WATER;
					for (let fi = 0; fi < FACES.length; fi++) {
						const face = FACES[fi];
						const nb = sampleBlock(
							wx + face.dir[0],
							wy + face.dir[1],
							wz + face.dir[2]
						);
						if (isWater) {
							if (nb !== 0) continue;
						} else if (nb !== 0 && nb !== WATER && !NON_SOLID_PLANTS.has(nb))
							continue;
						const target = isWater ? water : block === 25 ? lava : terrain;
						pushFace(block, fi, target, wx, wy, wz);
					}
				}
		return { terrain, water, lava, torch };
	};

	// ----------------------------------------------------------
	// 1) REDUCCIÓN: losa de piedra 16×16×11 → ≥5× menos vértices
	// ----------------------------------------------------------
	const slab = airChunk();
	for (let y = 0; y <= 10; y++)
		for (let x = 0; x < CHUNK_SIZE; x++)
			for (let z = 0; z < CHUNK_SIZE; z++) setBlock(slab, x, y, z, 3);
	const greedy = build(0, 0, slab);
	const naive = naiveBuild({ cx: 0, cz: 0, ...neighbors(slab) });
	const gv = greedy.terrain.pos.length / 3;
	const nv = naive.terrain.pos.length / 3;
	check(
		"1. losa de piedra: el greedy genera ≥5× menos vértices",
		gv * 5 <= nv,
		`greedy=${gv} verts vs naive=${nv} verts`
	);
	// La tapa superior (16×16) debe quedar fusionada en UN quad: localizarlo
	// por sus 6 vértices a y=11 (tapa de la losa) con el rectángulo completo.
	const cornerOf = (buf, q, vi) => {
		const o = q * 18 + [0, 1, 2, 5][vi] * 3; // orden v0,v1,v2,v0,v2,v3
		return [buf[o], buf[o + 1], buf[o + 2]];
	};
	const topQuads = [];
	for (let q = 0; q < greedy.terrain.pos.length / 18; q++) {
		const cs = [0, 1, 2, 3].map((vi) => cornerOf(greedy.terrain.pos, q, vi));
		if (cs.every((c) => Math.abs(c[1] - 11) < 1e-6)) topQuads.push(cs);
	}
	check(
		"1. la tapa 16×16 queda fusionada en UN quad",
		topQuads.length === 1,
		`${topQuads.length} quads a y=11`
	);
	if (topQuads.length === 1) {
		const xs = topQuads[0].map((c) => c[0]);
		const zs = topQuads[0].map((c) => c[2]);
		check(
			"1. la tapa abarca el chunk entero (16×16)",
			Math.min(...xs) === 0 &&
				Math.max(...xs) === 16 &&
				Math.min(...zs) === 0 &&
				Math.max(...zs) === 16,
			`x=${Math.min(...xs)}..${Math.max(...xs)} z=${Math.min(...zs)}..${Math.max(...zs)}`
		);
	}

	// ----------------------------------------------------------
	// 2) AGUA: la superficie 16×16 se fusiona en UN quad a y=0.875
	// ----------------------------------------------------------
	const pond = airChunk();
	for (let x = 0; x < CHUNK_SIZE; x++)
		for (let z = 0; z < CHUNK_SIZE; z++) {
			setBlock(pond, x, 3, z, 3); // lecho de piedra
			setBlock(pond, x, 4, z, WATER); // agua
		}
	const pondG = build(0, 0, pond);
	// La superficie 16×16 se fusiona en UN quad a y=4.875 (las 4 caras
	// laterales del borde del chunk suman sus propios quads a y=4..5).
	const surf = [];
	for (let q = 0; q < pondG.water.pos.length / 18; q++) {
		const cs = [0, 1, 2, 3].map((vi) => cornerOf(pondG.water.pos, q, vi));
		if (cs.every((c) => Math.abs(c[1] - 4.875) < 1e-6)) surf.push(cs);
	}
	check(
		"2. superficie de agua = 1 quad fusionado a y=4.875",
		surf.length === 1,
		`${surf.length} quads a 4.875 de ${pondG.water.pos.length / 18} totales`
	);
	if (surf.length === 1) {
		const xs = surf[0].map((c) => c[0]);
		const zs = surf[0].map((c) => c[2]);
		check(
			"2. la superficie de agua abarca 16×16",
			Math.min(...xs) === 0 &&
				Math.max(...xs) === 16 &&
				Math.min(...zs) === 0 &&
				Math.max(...zs) === 16,
			`x=${Math.min(...xs)}..${Math.max(...xs)} z=${Math.min(...zs)}..${Math.max(...zs)}`
		);
	}

	// ----------------------------------------------------------
	// 3) IDENTIDAD: bloques aislados (sin caras fusionables) → el
	//    greedy produce EXACTAMENTE los mismos triángulos que el naive.
	// ----------------------------------------------------------
	const iso = airChunk();
	// Bloques aislados (ninguno comparte cara coplanar con otro).
	setBlock(iso, 3, 5, 3, 3); // piedra suelta
	setBlock(iso, 3, 6, 3, TORCH); // antorcha encima
	setBlock(iso, 7, 6, 4, 1); // tierra suelta
	setBlock(iso, 11, 3, 9, 8); // adoquín suelto
	setBlock(iso, 5, 8, 12, 2); // césped suelto (tesela distinta por cara)
	setBlock(iso, 13, 4, 13, WATER); // agua aislada
	setBlock(iso, 8, 6, 8, 33); // hierba alta (cross)
	// Pared vertical de 2 bloques DISTINTOS (piedra + tierra): al ser teselas
	// distintas sus caras no se fusionan (premisa de identidad) y el bloque
	// superior tiene al inferior como oclusor en sus esquinas (AO variado).
	setBlock(iso, 9, 4, 2, 3);
	setBlock(iso, 9, 5, 2, 1);
	const isoG = build(0, 0, iso);
	const isoN = naiveBuild({ cx: 0, cz: 0, ...neighbors(iso) });

	const multiset = (b) => {
		const m = new Map();
		if (!b) return m;
		for (let t = 0; t < b.pos.length / 9; t++) {
			const verts = [];
			for (let k = 0; k < 3; k++) {
				const i = t * 3 + k;
				verts.push([
					b.pos[i * 3],
					b.pos[i * 3 + 1],
					b.pos[i * 3 + 2],
					b.norm[i * 3],
					b.norm[i * 3 + 1],
					b.norm[i * 3 + 2],
					b.uv[i * 2],
					b.uv[i * 2 + 1],
					b.col[i * 3],
					b.col[i * 3 + 1],
					b.col[i * 3 + 2]
				]);
			}
			// Ordenar los 3 vértices del triángulo por posición (canónico):
			// compara multisets, no orden de emisión.
			verts.sort((a, b2) => a[0] - b2[0] || a[1] - b2[1] || a[2] - b2[2]);
			const k = verts
				.map((f) => f.map((n) => n.toFixed(6)).join(","))
				.join(";");
			m.set(k, (m.get(k) || 0) + 1);
		}
		return m;
	};
	const sameMultiset = (a, b) => {
		if (a.size !== b.size) return false;
		for (const [k, n] of a) if (b.get(k) !== n) return false;
		return true;
	};
	const gT = multiset(isoG.terrain),
		nT = multiset(isoN.terrain);
	check(
		"3. identidad terreno (triángulos idénticos pese al orden)",
		sameMultiset(gT, nT),
		`greedy=${gT.size} tris, naive=${nT.size} tris`
	);
	const gW = multiset(isoG.water),
		nW = multiset(isoN.water);
	check(
		"3. identidad agua (triángulos idénticos)",
		sameMultiset(gW, nW),
		`greedy=${gW.size}, naive=${nW.size}`
	);
	// Antorchas/plantas NO se fusionan: los cross-quads deben ser idénticos.
	// Comparación con tolerancia float32 (el greedy devuelve Float32Array; el
	// naive son float64 del motor): la diferencia es <1e-4.
	const sameArray = (a, b) => {
		if (!a || !b) return a === b;
		if (a.length !== b.length) return false;
		for (let i = 0; i < a.length; i++)
			if (Math.abs(a[i] - b[i]) > 1e-4) return false;
		return true;
	};
	check(
		"3. identidad antorchas/plantas (cross-quads idénticos)",
		sameArray(isoG.torch.pos, isoN.torch.pos) &&
			sameArray(isoG.torch.uv, isoN.torch.uv) &&
			sameArray(isoG.torch.col, isoN.torch.col),
		`verts=${isoG.torch.pos.length}`
	);

	// ----------------------------------------------------------
	// 4) TILE_COUNT: el layout del atlas cubre todas las teselas usadas
	// ----------------------------------------------------------
	let maxTile = 0;
	for (let b = 1; b <= 43; b++)
		for (let fi = 0; fi < 6; fi++)
			maxTile = Math.max(maxTile, tileForFace(b, fi));
	check(
		"4. TILE_COUNT cubre el mayor índice de tesela usado por BLOCK_TEX",
		maxTile < TILE_COUNT,
		`max=${maxTile}, TILE_COUNT=${TILE_COUNT}`
	);
	const r = tileRect(maxTile);
	check(
		"4. tileRect del último índice dentro de [0,1]",
		r[0] >= 0 &&
			r[1] >= 0 &&
			r[2] <= 1 &&
			r[3] <= 1 &&
			r[2] > r[0] &&
			r[3] > r[1],
		`rect=[${r.join(",")}]`
	);

	// ----------------------------------------------------------
	// 5) RAYCAST con three real: la geometría del greedy es raycast-eable
	// ----------------------------------------------------------
	const geo = new THREE.BufferGeometry();
	geo.setAttribute(
		"position",
		new THREE.Float32BufferAttribute(greedy.terrain.pos, 3)
	);
	geo.setAttribute(
		"color",
		new THREE.Float32BufferAttribute(greedy.terrain.col, 3)
	);
	const mesh = new THREE.Mesh(geo);
	const raycaster = new THREE.Raycaster();
	raycaster.set(new THREE.Vector3(8.5, 40, 8.5), new THREE.Vector3(0, -1, 0));
	raycaster.far = 100;
	const hits = raycaster.intersectObject(mesh, false);
	check(
		"5. raycast acierta la tapa de la losa (y=11)",
		hits.length > 0 && Math.abs(hits[0].point.y - 11) < 0.01,
		`hits=${hits.length}, y=${hits[0]?.point.y}`
	);

	fs.rmSync(tmp, { recursive: true, force: true });
	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(failed ? `\n${failed} check(s) FALLARON` : "\nTODO OK");
	process.exit(failed ? 1 : 0);
})();
