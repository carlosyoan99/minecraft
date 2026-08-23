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
	LANTERN,
	LAVA,
	NON_SOLID_PLANTS,
	TORCH,
	WATER,
	WORLD_HEIGHT,
	WORLD_MAX_Y,
	WORLD_MIN_Y
} from "./constants.js";
import { tileForFace, tileRect } from "./texturemap.js";

// ============================================================
// Float32Buffer — buffer pre-asignado para escritura directa.
// Reemplaza Array.push + Float32Array.from con escritura secuencial
// en un Float32Array pre-asignado. El array crece por duplicado solo
// cuando se agota (~2× reallocs en vez de O(n²) del push).
// ============================================================
class Float32Buffer {
	constructor(initialCapacity, itemSize) {
		this.itemSize = itemSize;
		this.pos = 0;
		this.arr = new Float32Array(initialCapacity * itemSize);
	}
	write(a, b, c, d) {
		if (this.pos + (d !== undefined ? 4 : c !== undefined ? 3 : b !== undefined ? 2 : 1) > this.arr.length)
			this._grow();
		this.arr[this.pos++] = a;
		this.arr[this.pos++] = b;
		if (c !== undefined) this.arr[this.pos++] = c;
		if (d !== undefined) this.arr[this.pos++] = d;
	}
	get length() { return this.pos; }
	toTypedArray() {
		return this.pos === this.arr.length ? this.arr : this.arr.subarray(0, this.pos);
	}
	_grow() {
		const next = new Float32Array(this.arr.length * 2);
		next.set(this.arr);
		this.arr = next;
	}
}

const TORCH_LIGHT_GAIN = 1.4; // misma ganancia que world.js (luz de antorcha)

// Fase 19.6 (C2): fase del vaivén de viento por celda — hash determinista
// (misma celda → misma fase, así las plantas no bailan todas a la vez) y
// estable entre builds de geometría. Exportado para los tests (unit-fase19.6)
// y para el worker (chunkWorker.js importa este módulo puro).
export function hashCell(wx, wz) {
	const h = Math.sin(wx * 127.1 + wz * 311.7) * 43758.5453;
	return h - Math.floor(h);
}

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

	// Fase 15 (cierre): vecinos pre-resueltos. El meshing solo consulta
	// celdas del chunk y su ANILLO inmediato (culling ±1 bloque, AO ±1),
	// así que los 9 vecinos (dx,dz ∈ -1..1) se resuelven UNA vez en vez de
	// construir el string "dx,dz" y hacer Map.get en cada una de las ~276K
	// muestras de sampleBlock/lightAt por chunk (era el coste dominante del
	// meshing). El lookup es un acceso a array plano; los vecinos ausentes
	// quedan como null y sampleBlock devuelve -1 como antes.
	const neighbors = [];
	for (let dx = -1; dx <= 1; dx++)
		for (let dz = -1; dz <= 1; dz++) neighbors.push(chunks.get(`${dx},${dz}`));
	const neighborAt = (relX, relZ) => {
		// Defensivo: fuera del anillo -1..1 (no debería pasar) se consulta el
		// Map original; en el camino caliente es un acceso directo al array.
		if (relX >= -1 && relX <= 1 && relZ >= -1 && relZ <= 1)
			return neighbors[(relX + 1) * 3 + (relZ + 1)];
		return chunks.get(`${relX},${relZ}`);
	};
	// Luz pre-resuelta igual que los bloques (Map "dx,dz" → Float32Array).
	const lightNbs = [];
	for (let dx = -1; dx <= 1; dx++)
		for (let dz = -1; dz <= 1; dz++) lightNbs.push(light.get(`${dx},${dz}`));
	const lightAt = (wx, wy, wz) => {
		if (wy < WORLD_MIN_Y || wy > WORLD_MAX_Y) return 0;
		const relX = Math.floor(wx / CHUNK_SIZE) - cx;
		const relZ = Math.floor(wz / CHUNK_SIZE) - cz;
		const arr =
			relX >= -1 && relX <= 1 && relZ >= -1 && relZ <= 1
				? lightNbs[(relX + 1) * 3 + (relZ + 1)]
				: light.get(`${relX},${relZ}`);
		if (!arr) return 0;
		const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		return arr[cIdx(x, wy - WORLD_MIN_Y, z)];
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
			// Fase 21.5 (B2): la linterna no ocluye la AO (no es sólida).
			b !== LANTERN &&
			!NON_SOLID_PLANTS.has(b)
		);
	};
	// sampleBlock con los vecinos pre-resueltos (ver arriba).
	const sampleBlock = (wx, wy, wz) => {
		// Fase 15 (D5): el mundo va de WORLD_MIN_Y a WORLD_MAX_Y; el índice usa
		// local y = mundo y − WORLD_MIN_Y.
		if (wy < WORLD_MIN_Y || wy > WORLD_MAX_Y) return 0;
		const relX = Math.floor(wx / CHUNK_SIZE) - cx;
		const relZ = Math.floor(wz / CHUNK_SIZE) - cz;
		const arr = neighborAt(relX, relZ);
		if (!arr) return -1;
		const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
		return arr[cIdx(x, wy - WORLD_MIN_Y, z)];
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

	// Buffers de salida — Fase 22.1+BufferGeometryUtils: pre-asignados con
	// Float32Buffer (escritura directa sin push a Array + Float32Array.from).
	// Capacidad inicial estimada: terreno ~60K vértices (16³×6 caras × greedy),
	// el resto mucho menor. El greedy meshing fusiona 3-5×, así que 60K es un
	// tope conservador para un chunk de 16×128×16.
	const terrain = {
		pos: new Float32Buffer(60000, 3),
		norm: new Float32Buffer(60000, 3),
		uv: new Float32Buffer(60000, 2),
		col: new Float32Buffer(60000, 3)
	};
	const water = {
		pos: new Float32Buffer(4000, 3),
		norm: new Float32Buffer(4000, 3),
		uv: new Float32Buffer(4000, 2),
		col: new Float32Buffer(4000, 3)
	};
	const lava = {
		pos: new Float32Buffer(2000, 3),
		norm: new Float32Buffer(2000, 3),
		uv: new Float32Buffer(2000, 2),
		col: new Float32Buffer(2000, 3)
	};
	const torch = {
		pos: new Float32Buffer(2000, 3),
		norm: new Float32Buffer(2000, 3),
		uv: new Float32Buffer(2000, 2),
		col: new Float32Buffer(2000, 3)
	};
	// Fase 19.6 (C2): buffer DEDICADO de plantas — los cross-quads de hierba/
	// flores/trigo se separan de las antorchas para poder aplicarles el vertex
	// shader de viento (displacement sutil en x/z) sin que las antorchas (que
	// comparten la categoría cross) se bamboleen. `wind` guarda por vértice un
	// vec2: [fase (hash de la celda, para que no bailen todas a la vez),
	// altura normalizada 0..1 (0 abajo, 1 arriba → el vaivén crece con la
	// altura)]. Es un atributo SOLO de plantas: antorchas no lo llevan.
	const plant = {
		pos: new Float32Buffer(2000, 3),
		norm: new Float32Buffer(2000, 3),
		uv: new Float32Buffer(2000, 2),
		col: new Float32Buffer(2000, 3),
		wind: new Float32Buffer(2000, 2)
	};

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
	// Fase 19.6 (C2): `buf` es el array destino del quad (antorchas → torch;
	// plantas → plant) y `wind` (opcional) el vec2 [fase, altura] por vértice
	// que solo las plantas emiten (el shader de viento lo necesita).
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
		uv,
		buf = torch,
		wind = null
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
				const v = verts[idx];
				buf.pos.write(v[0], v[1], v[2]);
				buf.norm.write(nx, ny, nz);
				const [uu, vv] = QUAD_UVS[idx];
				buf.uv.write(e0 + uu * (e1 - e0), f0 + vv * (f1 - f0));
				buf.col.write(torchLight, torchLight, torchLight);
				if (wind) buf.wind.write(wind[idx * 2], wind[idx * 2 + 1]);
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
	// Fase 21.5 (B2): linterna — caja compacta (bobina) con la tesela de la
	// linterna en las 6 caras y un vástago hacia el techo (si cuelga) o hacia
	// el suelo (si se apoya). La orientación se deduce del contexto: si hay
	// un bloque sólido ENCIMA cuelga (como en MC); si no, se apoya en el
	// suelo. Emite las 6 caras con pushCrossQuad (normales por eje) en el
	// buffer de antorchas (fullbright: la linterna emite luz).
	const pushLantern = (wx, wy, wz) => {
		const uv = tileRectFn(tileForFaceFn(LANTERN, 0));
		const W = 0.225; // medio ancho de la bobina
		const hang = isOccluder(wx, wy + 1, wz);
		const y0 = hang ? 0.28 : 0.62; // caja baja (cuelga) o alta (apoya)
		const y1 = y0 + 0.45;
		const x0 = wx + 0.5 - W,
			x1 = wx + 0.5 + W,
			z0 = wz + 0.5 - W,
			z1 = wz + 0.5 + W;
		const faces = [
			// [+X] [-X] [+Y] [-Y] [+Z] [-Z] con sus 4 esquinas y normal
			[x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0, 1, 0, 0],
			[x0, y0, z1, x0, y0, z0, x0, y1, z0, x0, y1, z1, -1, 0, 0],
			[x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1, 0, 1, 0],
			[x1, y0, z0, x0, y0, z0, x0, y0, z1, x1, y0, z1, 0, -1, 0],
			[x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1, 0, 0, 1],
			[x1, y0, z0, x0, y0, z0, x0, y1, z0, x1, y1, z0, 0, 0, -1]
		];
		for (const f of faces) {
			pushCrossQuad(
				f[0],
				f[1],
				f[2],
				f[3],
				f[4],
				f[5],
				f[6],
				f[7],
				f[8],
				f[9],
				f[10],
				f[11],
				f[12],
				f[13],
				f[14],
				uv
			);
		}
		// Vástago: quad cruzado delgado desde la bobina hasta el techo/suelo.
		const SW = 0.06;
		const sy0 = hang ? y1 : 0;
		const sy1 = hang ? 1 : y0;
		pushCrossQuad(
			wx + 0.5 - SW,
			wy + sy0,
			wz + 0.5 - SW,
			wx + 0.5 + SW,
			wy + sy0,
			wz + 0.5 + SW,
			wx + 0.5 + SW,
			wy + sy1,
			wz + 0.5 + SW,
			wx + 0.5 - SW,
			wy + sy1,
			wz + 0.5 - SW,
			-Math.SQRT1_2,
			0,
			Math.SQRT1_2,
			uv
		);
		pushCrossQuad(
			wx + 0.5 + SW,
			wy + sy0,
			wz + 0.5 - SW,
			wx + 0.5 - SW,
			wy + sy0,
			wz + 0.5 + SW,
			wx + 0.5 - SW,
			wy + sy1,
			wz + 0.5 + SW,
			wx + 0.5 + SW,
			wy + sy1,
			wz + 0.5 - SW,
			-Math.SQRT1_2,
			0,
			-Math.SQRT1_2,
			uv
		);
	};
	// Fase 19.6 (C2): hash determinista por celda para la fase del vaivén
	// (definido a nivel de módulo — exportado — para compartirlo con el worker
	// y los tests).
	const pushPlant = (wx, wy, wz, block) => {
		const uv = tileRectFn(tileForFaceFn(block, 0));
		// La fase (hash de la celda) es la misma para los 4 vértices; solo
		// cambia la altura 0 (base) / 1 (topo): en el quad cruzado los vértices
		// 0 y 1 son la base (y = wy) y los 2 y 3 el topo (y = wy + PLANT_H).
		const makeWind = (yx, yy, yc, yd) => {
			const ys = [yx, yy, yc, yd];
			const w = [];
			for (const y of ys) {
				w.push(hashCell(wx, wz), y > wy + 0.01 ? 1 : 0);
			}
			return w;
		};
		const push = (ax, ay, az, bx, by, bz, cx2, cy, cz2, dx, dy, dz, nx, nz) => {
			pushCrossQuad(
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
				0,
				nz,
				uv,
				plant,
				makeWind(ay, by, cy, dy)
			);
		};
		push(
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
			Math.SQRT1_2
		);
		push(
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
			-Math.SQRT1_2
		);
	};

	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let y = 0; y < WORLD_HEIGHT; y++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const block = chunk[cIdx(x, y, z)];
				if (block === 0) continue;
				if (block === TORCH) {
					// Fase 15 (D5): posiciones de MUNDO (local + WORLD_MIN_Y).
					pushTorch(baseX + x, y + WORLD_MIN_Y, baseZ + z);
					continue;
				}
				if (block === LANTERN) {
					pushLantern(baseX + x, y + WORLD_MIN_Y, baseZ + z);
					continue;
				}
				if (NON_SOLID_PLANTS.has(block)) {
					pushPlant(baseX + x, y + WORLD_MIN_Y, baseZ + z, block);
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
	// UVs de la tesela y color por vértice (luz × AO). `gridAO` (cache de la
	// Fase 15) trae el AO de las 4 esquinas de cada celda del grid, ya
	// calculado durante el llenado; reutilizarlo es bit-idéntico a llamar
	// vertexAO (el AO de una celda no depende del quad que la usa).
	const emitQuad = (fi, s, u0, v0, w, h, key, gridAO, W, _H) => {
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
			// Fase 15 (D5): la capa s es índice LOCAL; la posición es Y de MUNDO.
			let wy = cornerAt(1) + (cor[1] ? extentAt(1) : 0) + WORLD_MIN_Y;
			if (target === 2 && fi === 2) wy = s + 0.875 + WORLD_MIN_Y; // agua
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
				cellWy + WORLD_MIN_Y + face.dir[1],
				cellWz + face.dir[2]
			);
			const baseV = 1 + light * TORCH_LIGHT_GAIN;
			// AO solo en el terreno opaco (agua/lava no se sombrean, como MC).
			// Desde la caché del grid (3 bits por esquina → índice AO_VALUES).
			const ao =
				target === 0 ? AO_VALUES[(gridAO[cv * W + cu] >> (c * 3)) & 0x7] : 1;
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
			buf.pos.write(p.x, p.y, p.z);
			buf.norm.write(face.dir[0], face.dir[1], face.dir[2]);
			buf.uv.write(p.u, p.v);
			buf.col.write(p.c, p.c, p.c);
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
		// Fase 15 (cierre): AO por celda cacheado durante el llenado del grid
		// (4 índices de 3 bits, mismo formato que aoBits). emitQuad lee estos
		// valores para los colores de esquina en vez de re-calcular vertexAO
		// (~90K llamadas menos por chunk) SIN cambiar la geometría: el AO de
		// una celda no depende del quad que la usa, así que el valor por
		// esquina es idéntico al recalcularlo.
		//
		// NO se resetea por capa (a diferencia de `grid`): una celda con cara
		// en la capa s pero sin cara en la s+1 conserva un valor stale. Es
		// seguro porque emitQuad solo lee la celda de esquina de un rectángulo
		// que EMITE, y toda celda emitida pasó el culling en ESTA capa → su
		// gridAO se escribió en este mismo llenado (antes de emitir).
		const gridAO = new Uint32Array(W * H);

		for (let s = 0; s < N; s++) {
			grid.fill(0);
			for (let u = 0; u < W; u++) {
				for (let v = 0; v < H; v++) {
					// Celda local de la rejilla → coordenadas del bloque.
					const lx = nAxis === 0 ? s : uAxis === 0 ? u : v;
					const ly = nAxis === 1 ? s : uAxis === 1 ? u : v;
					const lz = nAxis === 2 ? s : uAxis === 2 ? u : v;
					const block = chunk[cIdx(lx, ly, lz)];
					if (
						block === 0 ||
						block === TORCH ||
						block === LANTERN ||
						NON_SOLID_PLANTS.has(block)
					)
						continue;
					const isWater = block === WATER;
					const isLava = block === LAVA;
					const wx = baseX + lx,
						wz = baseZ + lz;
					// Culling exacto de world.js/audit-fase4: líquidos solo
					// contra aire; sólidos contra aire, agua o plantas.
					const nb = sampleBlock(
						wx + face.dir[0],
						ly + WORLD_MIN_Y + face.dir[1],
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
						ly + WORLD_MIN_Y + face.dir[1],
						wz + face.dir[2]
					);
					const lightBucket = Math.round(lb * 255);
					let aoBits = 0;
					if (target === 0) {
						for (let c = 0; c < 4; c++) {
							const ao = vertexAO(
								wx,
								ly + WORLD_MIN_Y,
								wz,
								face.corners[c],
								face.dir
							);
							aoBits |= AO_IDX.get(ao) << (c * 3);
						}
						gridAO[v * W + u] = aoBits; // cache para emitQuad
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
					emitQuad(fi, s, u, v, w, h, raw - 1, gridAO, W, H);
					for (let vv = v; vv < v + h; vv++)
						grid.fill(0, vv * W + u, vv * W + u + w);
				}
			}
		}
	}

	const finalize = (b) =>
		b.pos.length
			? {
					pos: b.pos.toTypedArray(),
					norm: b.norm.toTypedArray(),
					uv: b.uv.toTypedArray(),
					col: b.col.toTypedArray()
				}
			: null;
	// Fase 19.6 (C2): las plantas llevan además el atributo `wind` (vec2:
	// fase + altura normalizada) que el shader de viento consume.
	const finalizePlant = (b) =>
		b.pos.length
			? {
					pos: b.pos.toTypedArray(),
					norm: b.norm.toTypedArray(),
					uv: b.uv.toTypedArray(),
					col: b.col.toTypedArray(),
					wind: b.wind.toTypedArray()
				}
			: null;
	return {
		terrain: finalize(terrain),
		water: finalize(water),
		lava: finalize(lava),
		torch: finalize(torch),
		plant: finalizePlant(plant)
	};
}
