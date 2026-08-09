// ============================================================
// CONSTRUCCIÓN DE GEOMETRÍA DE CHUNK (módulo PURAMENTE lógico, sin three)
// Fase 13 (A1): greedy meshing 2D por capas con culling y AO por vértice
// idénticos al renderizador anterior (world.js Fase 10-12), pero fusionando
// caras coplanares contiguas en quads grandes → 3-5× menos vértices.
//
// Este módulo no importa three ni toca el DOM: recibe los datos del chunk y
// sus vecinos (Uint8Array por chunk relativo) y la luz de antorcha horneada
// (Float32Array por chunk relativo), y devuelve los arrays de atributos
// (posiciones, normales, UVs, colores) listos para cargar en una
// BufferGeometry. Lo usan DOS caminos con el MISMO resultado:
//   - síncrono: buildChunkGeometryData() llamada directa desde world.js;
//   - worker:    chunkWorker.js importa esta misma función (los module
//     workers no resuelven el importmap, por eso la cadena es pura).
//
// CLAVE DE FUSIÓN — dos celdas de cara se fusionan solo si son VISUALMENTE
// idénticas, de modo que el quad fusionado se ve EXACTO a la renderización
// celda a celda:
//   - target (terreno/agua/lava: buffers distintos) e índice de tesela (UVs);
//   - luz de antorcha de la celda de aire que mira la cara, cuantizada a
//     1/255 (la luz varía suavemente: un gradiente no se fusiona y el brillo
//     de una antorcha se conserva; en zona sin antorchas todo queda a bucket
//     0 y las llanuras se fusionan en quads enormes);
//   - los 4 valores de AO de la celda (la esquina que se oscurece debe ser
//     idéntica para que el color por vértice coincida).
// Como la clave incluye luz y AO, la fusión NO degrada la iluminación: el
// quad emite sus 4 colores de esquina desde las celdas de esquina, igual que
// la renderización por celda.
// ============================================================
import {
	CHUNK_SIZE,
	LAVA,
	NON_SOLID_PLANTS,
	TORCH,
	WATER,
	WORLD_HEIGHT
} from "./constants.js";
import { tileForFace, tileRect } from "./texturemap.js";

const TORCH_LIGHT_GAIN = 1.4; // misma ganancia que world.js (luz de antorcha)

// Valores posibles del AO por vértice (misma curva que world.js).
const AO_VALUES = [0.5, 0.55, 0.7, 0.85, 1.0];
const AO_IDX = new Map(AO_VALUES.map((v, i) => [v, i]));

// Tamaño de un eje local (x/z = CHUNK_SIZE, y = WORLD_HEIGHT).
const AXIS_SIZE = [CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE];

// Geometrías de una única cara (misma tabla que world.js Fase 4-12; el orden
// de esquinas define el winding correcto con las normales salientes).
// `nAxis` es el eje de la normal de la cara (0=x, 1=y, 2=z).
const FACES = [
	{
		dir: [1, 0, 0],
		nAxis: 0,
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
	}, // +X
	{
		dir: [-1, 0, 0],
		nAxis: 0,
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
	}, // -X
	{
		dir: [0, 1, 0],
		nAxis: 1,
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
	}, // +Y
	{
		dir: [0, -1, 0],
		nAxis: 1,
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
	}, // -Y
	{
		dir: [0, 0, 1],
		nAxis: 2,
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
	}, // +Z
	{
		dir: [0, 0, -1],
		nAxis: 2,
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
	} // -Z
];

function cIdx(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

// ============================================================
// ENTRADA: `chunks` (Map "dx,dz" → Uint8Array del chunk relativo a cx,cz;
// debe incluir "0,0"; los vecinos faltantes se tratan como no cargados) y
// `light` (Map "dx,dz" → Float32Array de luz de antorcha horneada o null).
// SALIDA: { terrain, water, lava, torch } — cada uno null o
// { pos, norm, uv, col } con Float32Array (4 floats de color por vértice).
// ============================================================
export function buildChunkGeometryData({
	cx,
	cz,
	chunks,
	light,
	tileForFaceFn = tileForFace,
	tileRectFn = tileRect
}) {
	const chunk = chunks.get("0,0");
	if (!chunk) return null;
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;

	// Lectura de bloques en coordenadas de MUNDO cruzando bordes de chunk.
	// Devuelve 0 fuera del mundo (arriba/abajo), -1 en chunks no cargados
	// (no dibujar la cara: evitar huecos falsos) — igual que getClientBlock.
	const sampleBlock = (wx, wy, wz) => {
		if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
		const relX = Math.floor(wx / CHUNK_SIZE) - cx;
		const relZ = Math.floor(wz / CHUNK_SIZE) - cz;
		const arr = chunks.get(`${relX},${relZ}`);
		if (!arr) return -1;
		const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		return arr[cIdx(x, wy, z)];
	};
	// Luz de antorcha (0..1) de una celda de mundo; 0 si el chunk no tiene
	// luz horneada (igual que chunkLightAt de world.js).
	const lightAt = (wx, wy, wz) => {
		if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
		const relX = Math.floor(wx / CHUNK_SIZE) - cx;
		const relZ = Math.floor(wz / CHUNK_SIZE) - cz;
		const arr = light.get(`${relX},${relZ}`);
		if (!arr) return 0;
		const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		return arr[cIdx(x, wy, z)];
	};

	// AO por vértice (Fase 10, E1) — copia exacta de world.js: la esquina
	// "encerrada" por bloques vecinos se oscurece (0.5), un lado ocupado se
	// atenúa (0.7/0.55 con diagonal), y al aire queda 1.0.
	const isOccluder = (bx, by, bz) => {
		const b = sampleBlock(bx, by, bz);
		return (
			b !== 0 &&
			b !== WATER &&
			b !== LAVA &&
			b !== TORCH &&
			!NON_SOLID_PLANTS.has(b)
		);
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

	// Buffers de salida (arrays planos; se convierten a Float32Array al final).
	const terrain = { pos: [], norm: [], uv: [], col: [] };
	const water = { pos: [], norm: [], uv: [], col: [] };
	const lava = { pos: [], norm: [], uv: [], col: [] };
	const torch = { pos: [], norm: [], uv: [], col: [] };

	// ----------------------------------------------------------
	// CROSS-QUADS (antorcha Fase 6 / plantas Fase 9): dos planos cruzados
	// translúcidos por tesela transparente. Sin fusión (son pequeños); el
	// código es idéntico al de world.js.
	// ----------------------------------------------------------
	const TORCH_W = 0.25,
		TORCH_H = 0.6;
	const PLANT_W = 0.32,
		PLANT_H = 0.8;
	const torchLight = 1 + TORCH_LIGHT_GAIN;
	const [tu0, tv0, tu1, tv1] = tileRectFn(tileForFaceFn(TORCH, 0));
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
		const uv = tileRectFn(tileForFaceFn(block, 0));
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

	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let y = 0; y < WORLD_HEIGHT; y++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const block = chunk[cIdx(x, y, z)];
				if (block === 0) continue;
				if (block === TORCH) {
					pushTorch(baseX + x, y, baseZ + z);
					continue;
				}
				if (NON_SOLID_PLANTS.has(block)) {
					pushPlant(baseX + x, y, baseZ + z, block);
				}
			}
		}
	}

	// ----------------------------------------------------------
	// GREEDY MESHING 2D POR CAPAS
	// Para cada cara (6 direcciones) y cada capa perpendicular a su normal,
	// se construye una rejilla de celdas de cara visible (con su clave de
	// fusión) y se ejecuta el greedy clásico: expandir anchura, luego altura,
	// emitiendo UN quad por región rectangular de clave idéntica.
	// ----------------------------------------------------------
	const SIZE = (axis) => AXIS_SIZE[axis];

	// Empuja UN quad fusionado (4 esquinas → 2 triángulos) con su normal,
	// UVs de la tesela y color por vértice (luz × AO).
	const emitQuad = (fi, s, u0, v0, w, h, key) => {
		const face = FACES[fi];
		const nAxis = face.nAxis;
		const uAxis = (nAxis + 1) % 3;
		const vAxis = (nAxis + 2) % 3;
		const target = key & 3; // 0 terreno, 1 lava, 2 agua
		const tileIdx = (key >> 2) & 0x3f;
		const buf = target === 2 ? water : target === 1 ? lava : terrain;
		// El agua usa su textura DEDICADA (tesela completa 0..1); el resto el
		// rectángulo de su tesela en el atlas.
		const [u0t, v0t, u1t, v1t] =
			target === 2 ? [0, 0, 1, 1] : tileRectFn(tileIdx);
		const cornerAt = (axis) => (axis === nAxis ? s : axis === uAxis ? u0 : v0);
		const extentAt = (axis) => (axis === nAxis ? 1 : axis === uAxis ? w : h);
		// Los 4 vértices de las esquinas (igual que world.js: el quad se
		// emite como 2 triángulos (0,1,2),(0,2,3) con 6 vértices sin índice).
		const verts = [];
		for (let c = 0; c < 4; c++) {
			const cor = face.corners[c];
			let wy = cornerAt(1) + (cor[1] ? extentAt(1) : 0);
			if (target === 2 && fi === 2) wy = s + 0.875; // superficie del agua más baja
			const wx = baseX + cornerAt(0) + (cor[0] ? extentAt(0) : 0);
			const wz = baseZ + cornerAt(2) + (cor[2] ? extentAt(2) : 0);
			// Celda de esquina del quad: la que aporta color a este vértice
			// (la de dentro del quad en el extremo de la esquina).
			const cu = cor[uAxis] ? u0 + w - 1 : u0;
			const cv = cor[vAxis] ? v0 + h - 1 : v0;
			const cellWx = baseX + (nAxis === 0 ? s : uAxis === 0 ? cu : cv);
			const cellWy = nAxis === 1 ? s : uAxis === 1 ? cu : cv;
			const cellWz = baseZ + (nAxis === 2 ? s : uAxis === 2 ? cu : cv);
			const light = lightAt(
				cellWx + face.dir[0],
				cellWy + face.dir[1],
				cellWz + face.dir[2]
			);
			const baseV = 1 + light * TORCH_LIGHT_GAIN;
			// AO solo en el terreno opaco (agua/lava no se sombrean, como MC).
			const ao =
				target === 0 ? vertexAO(cellWx, cellWy, cellWz, cor, face.dir) : 1;
			const v = baseV * ao;
			const [uu, vv] = face.uvs[c];
			verts.push({
				x: wx,
				y: wy,
				z: wz,
				u: u0t + uu * (u1t - u0t),
				v: v0t + vv * (v1t - v0t),
				c: v
			});
		}
		for (const [i, j, k] of [
			[0, 1, 2],
			[0, 2, 3]
		]) {
			for (const idx of [i, j, k]) {
				const p = verts[idx];
				buf.pos.push(p.x, p.y, p.z);
				buf.norm.push(...face.dir);
				buf.uv.push(p.u, p.v);
				buf.col.push(p.c, p.c, p.c);
			}
		}
	};

	for (let fi = 0; fi < FACES.length; fi++) {
		const face = FACES[fi];
		const nAxis = face.nAxis;
		const uAxis = (nAxis + 1) % 3;
		const vAxis = (nAxis + 2) % 3;
		const W = SIZE(uAxis);
		const H = SIZE(vAxis);
		const N = SIZE(nAxis);
		const grid = new Uint32Array(W * H); // 0 = sin cara; si no, clave+1

		for (let s = 0; s < N; s++) {
			grid.fill(0);
			for (let u = 0; u < W; u++) {
				for (let v = 0; v < H; v++) {
					// Celda local de la rejilla → coordenadas del bloque.
					const lx = nAxis === 0 ? s : uAxis === 0 ? u : v;
					const ly = nAxis === 1 ? s : uAxis === 1 ? u : v;
					const lz = nAxis === 2 ? s : uAxis === 2 ? u : v;
					const block = chunk[cIdx(lx, ly, lz)];
					if (block === 0 || block === TORCH || NON_SOLID_PLANTS.has(block))
						continue;
					const isWater = block === WATER;
					const isLava = block === LAVA;
					const wx = baseX + lx,
						wz = baseZ + lz;
					// Culling exacto de world.js/audit-fase4: líquidos solo
					// contra aire; sólidos contra aire, agua o plantas.
					const nb = sampleBlock(
						wx + face.dir[0],
						ly + face.dir[1],
						wz + face.dir[2]
					);
					if (isWater || isLava) {
						if (nb !== 0) continue;
					} else if (nb !== 0 && nb !== WATER && !NON_SOLID_PLANTS.has(nb))
						continue;
					const target = isWater ? 2 : isLava ? 1 : 0;
					const tileIdx = isWater ? 0 : tileForFaceFn(block, fi);
					const lb = lightAt(
						wx + face.dir[0],
						ly + face.dir[1],
						wz + face.dir[2]
					);
					const lightBucket = Math.round(lb * 255);
					let aoBits = 0;
					if (target === 0) {
						for (let c = 0; c < 4; c++) {
							const ao = vertexAO(wx, ly, wz, face.corners[c], face.dir);
							aoBits |= AO_IDX.get(ao) << (c * 3);
						}
					}
					const key =
						target | (tileIdx << 2) | (lightBucket << 8) | (aoBits << 16);
					grid[v * W + u] = key + 1;
				}
			}
			// Greedy 2D sobre la capa: expandir anchura y luego altura.
			for (let v = 0; v < H; v++) {
				for (let u = 0; u < W; u++) {
					const raw = grid[v * W + u];
					if (raw === 0) continue;
					let w = 1;
					while (u + w < W && grid[v * W + (u + w)] === raw) w++;
					let h = 1;
					rowCheck: for (let vv = v + 1; vv < H; vv++) {
						for (let uu = u; uu < u + w; uu++) {
							if (grid[vv * W + uu] !== raw) break rowCheck;
						}
						h++;
					}
					emitQuad(fi, s, u, v, w, h, raw - 1);
					for (let vv = v; vv < v + h; vv++)
						grid.fill(0, vv * W + u, vv * W + u + w);
				}
			}
		}
	}

	const finalize = (b) =>
		b.pos.length
			? {
					pos: Float32Array.from(b.pos),
					norm: Float32Array.from(b.norm),
					uv: Float32Array.from(b.uv),
					col: Float32Array.from(b.col)
				}
			: null;
	return {
		terrain: finalize(terrain),
		water: finalize(water),
		lava: finalize(lava),
		torch: finalize(torch)
	};
}
