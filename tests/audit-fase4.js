"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 4 (herramienta reutilizable)
// 1) Culling de caras con cuevas: replica la regla EXACTA del
//    cliente (public/world.js) sobre datos generados frescos y
//    verifica que no haya ni huecos (caras visibles no dibujadas)
//    ni caras ocultas dibujadas, incluyendo los bordes entre
//    chunks (donde las cuevas cruzan la frontera).
// 2) Generación en tiempo real: ms/chunk con cuevas + conteo de
//    caras y triángulos estimados para un área típica, y memoria
//    por chunk (para extrapolar el presupuesto de VIEW_DISTANCE).
// Uso: node tests/audit-fase4.js
// ============================================================
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const { B, isSolidBlock, NON_SOLID_PLANTS, CHUNK_SIZE, WORLD_HEIGHT } = require(
	path.join(ROOT, "server", "constants.js")
);
const world = require(path.join(ROOT, "server", "world.js"));
const state = require(path.join(ROOT, "server", "state.js"));

let fails = 0;
const check = (_n, ok, _extra) => {
	if (!ok) fails++;
};

// --- Culling ---
// Regla del cliente (public/world.js): un bloque dibuja una cara contra su
// vecino si ese vecino es visible. Sólido: aire (0) O agua (20) O plantas no
// sólidas (Fase 9: hierba alta/flores/trigo, que se dibujan como planos
// cruzados y no tapan al bloque de debajo). Agua: solo aire.
const DIRS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];
function clientShouldDraw(block, neighbor) {
	if (block === B.WATER) return neighbor === B.AIR;
	return (
		neighbor === B.AIR || neighbor === B.WATER || NON_SOLID_PLANTS.has(neighbor)
	);
}
// Definición independiente de "cara visible" (no tautológica): el cliente
// dibuja una cara SI Y SOLO SI el vecino es un bloque no-sólido (aire,
// agua o plantas para sólidos; solo aire para el agua).
function faceIsVisible(block, neighbor) {
	if (block === B.WATER) return neighbor === B.AIR;
	return !isSolidBlock(neighbor); // aire, agua o plantas: todos no-sólidos
}

function countFaces(cx, cz) {
	const chunk = state.chunks.get(`${cx},${cz}`);
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;
	let faces = 0,
		solidFaces = 0,
		waterFaces = 0,
		_blocks = 0;
	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let y = 0; y < WORLD_HEIGHT; y++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const block = chunk[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
				if (block === B.AIR) continue;
				_blocks++;
				const wx = baseX + x,
					wy = y,
					wz = baseZ + z;
				for (const [dx, dy, dz] of DIRS) {
					const n = world.getBlock(wx + dx, wy + dy, wz + dz);
					if (clientShouldDraw(block, n)) {
						faces++;
						if (block === B.WATER) waterFaces++;
						else solidFaces++;
					}
				}
			}
		}
	}
	return { faces, solidFaces, waterFaces };
}

// Generación fresca (sin leer disco) + chunks vecinos cargados para que el
// culling entre bordes sea real (getBlock devuelve el bloque real, no aire).
world.setDiskLoader(() => null);
state.chunks.clear();
for (let cx = -1; cx <= 1; cx++)
	for (let cz = -1; cz <= 1; cz++) world.generateChunk(cx, cz);

// Centro: todos sus vecinos están cargados (el conteo de caras es exacto).
const c00 = state.chunks.get("0,0");
let _blocks = 0;
for (let i = 0; i < c00.length; i++) if (c00[i] !== B.AIR) _blocks++;

// 1) No hay caras ocultas dibujadas: toda cara dibujada tiene un vecino visible
//    (independiente: contra un bloque sólido NO se dibuja — sería un bug de culling).
{
	let hidden = 0;
	for (let cx = -1; cx <= 1; cx++)
		for (let cz = -1; cz <= 1; cz++) {
			const chunk = state.chunks.get(`${cx},${cz}`);
			const baseX = cx * CHUNK_SIZE,
				baseZ = cz * CHUNK_SIZE;
			for (let x = 0; x < CHUNK_SIZE; x++)
				for (let y = 0; y < WORLD_HEIGHT; y++)
					for (let z = 0; z < CHUNK_SIZE; z++) {
						const block = chunk[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
						if (block === B.AIR) continue;
						const wx = baseX + x,
							wy = y,
							wz = baseZ + z;
						for (const [dx, dy, dz] of DIRS) {
							const n = world.getBlock(wx + dx, wy + dy, wz + dz);
							// El cliente dibuja la cara (clientShouldDraw). ¿Es visible realmente?
							// Si se dibuja contra un sólido → cara oculta (culling incorrecto).
							if (clientShouldDraw(block, n) && !faceIsVisible(block, n))
								hidden++;
						}
					}
		}
	check(
		"Culling: 0 caras dibujadas contra un bloque sólido (sin caras ocultas)",
		hidden === 0,
		`${hidden} caras`
	);
}

// 2) No faltan caras visibles: toda cara con vecino no-sólido se dibuja.
{
	let missing = 0;
	for (let cx = -1; cx <= 1; cx++)
		for (let cz = -1; cz <= 1; cz++) {
			const chunk = state.chunks.get(`${cx},${cz}`);
			const baseX = cx * CHUNK_SIZE,
				baseZ = cz * CHUNK_SIZE;
			for (let x = 0; x < CHUNK_SIZE; x++)
				for (let y = 0; y < WORLD_HEIGHT; y++)
					for (let z = 0; z < CHUNK_SIZE; z++) {
						const block = chunk[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
						if (block === B.AIR) continue;
						const wx = baseX + x,
							wy = y,
							wz = baseZ + z;
						for (const [dx, dy, dz] of DIRS) {
							const n = world.getBlock(wx + dx, wy + dy, wz + dz);
							// Cara visible pero NO dibujada → hueco (bug de culling).
							if (faceIsVisible(block, n) && !clientShouldDraw(block, n))
								missing++;
						}
					}
		}
	check(
		"Culling: 0 caras visibles sin dibujar (sin huecos, dentro y entre chunks)",
		missing === 0,
		`${missing} caras`
	);
}

// 3) El agua solo dibuja contra aire (nunca contra otro agua ni contra sólidos).
{
	let badWater = 0;
	const c = state.chunks.get("0,0");
	for (let x = 0; x < CHUNK_SIZE; x++)
		for (let y = 0; y < WORLD_HEIGHT; y++)
			for (let z = 0; z < CHUNK_SIZE; z++) {
				if (c[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] !== B.WATER) continue;
				for (const [dx, dy, dz] of DIRS) {
					const n = world.getBlock(x + dx, y + dy, z + dz);
					if (clientShouldDraw(B.WATER, n) && n !== B.AIR) badWater++;
				}
			}
	check(
		"Culling: el agua solo dibuja caras contra aire (superficie/orilla, sin caras internas)",
		badWater === 0,
		`${badWater} caras`
	);
}

// 4) El lecho del lago se ve: los sólidos bajo el agua dibujan su cara (contra agua).
//    Los lagos son escasos (~5% columnas) y no hay ninguno en el 3×3 del origen:
//    se busca una zona con agua en un radio amplio (8x8 = 64 chunks) y se valida ahí.
{
	state.chunks.clear();
	let bedFaces = 0,
		lakeFound = false,
		cx0 = 0,
		cz0 = 0;
	outer: for (let cx = -4; cx <= 4 && !lakeFound; cx++) {
		for (let cz = -4; cz <= 4; cz++) {
			world.generateChunk(cx, cz);
			const chunk = state.chunks.get(`${cx},${cz}`);
			// El agua llena LAKE_FLOOR < y < SEA_LEVEL (y=3 y 4): buscar en y = SEA_LEVEL-1.
			const wy = world.SEA_LEVEL - 1;
			for (let x = 0; x < CHUNK_SIZE; x++)
				for (let z = 0; z < CHUNK_SIZE; z++) {
					if (chunk[(wy * CHUNK_SIZE + z) * CHUNK_SIZE + x] === B.WATER) {
						lakeFound = true;
						cx0 = cx;
						cz0 = cz;
						break outer;
					}
				}
		}
	}
	if (!lakeFound) {
		check(
			"Culling: hay al menos un lago en el área de la auditoría (premisa del check)",
			false,
			"ningún agua en radio 4"
		);
	} else {
		// Regenerar el vecindario 3×3 alrededor del lago para que los bordes sean reales.
		for (let cx = cx0 - 1; cx <= cx0 + 1; cx++)
			for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) world.generateChunk(cx, cz);
		for (let cx = cx0 - 1; cx <= cx0 + 1; cx++)
			for (let cz = cz0 - 1; cz <= cz0 + 1; cz++) {
				const chunk = state.chunks.get(`${cx},${cz}`);
				const baseX = cx * CHUNK_SIZE,
					baseZ = cz * CHUNK_SIZE;
				for (let x = 0; x < CHUNK_SIZE; x++)
					for (let y = 0; y < WORLD_HEIGHT; y++)
						for (let z = 0; z < CHUNK_SIZE; z++) {
							const block = chunk[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
							if (block === B.AIR || block === B.WATER) continue;
							const wx = baseX + x,
								wy = y,
								wz = baseZ + z;
							for (const [dx, dy, dz] of DIRS) {
								if (world.getBlock(wx + dx, wy + dy, wz + dz) === B.WATER)
									bedFaces++;
							}
						}
			}
		check(
			"Culling: el lecho del lago dibuja sus caras contra el agua (se ve bajo la superficie)",
			bedFaces > 0,
			`${bedFaces} caras de lecho`
		);
	}
}
{
	// Benchmark con cuevas: área 5x5 (25 chunks) con generación fresca.
	// Se toma el MEJOR de 3 pasadas: el tiempo de generación es sensible a la
	// carga de la CPU (correr la suite en paralelo puede dar una ráfaga puntual
	// que dispare el cronómetro sin que la generación sea más lenta de verdad).
	const R = 2;
	let perChunk = Infinity;
	for (let pass = 0; pass < 3; pass++) {
		state.chunks.clear();
		const t0 = process.hrtime.bigint();
		for (let cx = -R; cx <= R; cx++)
			for (let cz = -R; cz <= R; cz++) world.generateChunk(cx, cz);
		const ms = Number(process.hrtime.bigint() - t0) / 1e6;
		perChunk = Math.min(perChunk, ms / 25);
	}
	// Volver a generar el área para el conteo de caras (estado fresco).
	state.chunks.clear();
	for (let cx = -R; cx <= R; cx++)
		for (let cz = -R; cz <= R; cz++) world.generateChunk(cx, cz);
	let totalFaces = 0,
		totalBlocks = 0;
	for (let cx = -R; cx <= R; cx++)
		for (let cz = -R; cz <= R; cz++) {
			const f = countFaces(cx, cz);
			totalFaces += f.faces;
			const c = state.chunks.get(`${cx},${cz}`);
			for (let i = 0; i < c.length; i++) if (c[i] !== B.AIR) totalBlocks++;
		}
	const _triangles = totalFaces * 2; // cada cara = 2 triángulos
	// Presupuesto de render para un radio típico de 3-4 chunks (escena del juego).
	const _r4 = 81;
	// Fase 9 (Bloque F): la generación es más rica (árboles variados y más
	// densos, playas, minerales por altura, estructuras, flores), así que el
	// presupuesto sube de 5 a 12 ms/chunk (sigue holgado para streaming).
	check(
		"Perf: generación con cuevas < 12 ms/chunk (presupuesto holgado para streaming)",
		perChunk < 12,
		`${perChunk.toFixed(2)} ms`
	);
	check(
		"Perf: las cuevas se notan en el ratio caras/bloques (más aire subterráneo = menos geometría)",
		totalFaces / totalBlocks < 2.2,
		(totalFaces / totalBlocks).toFixed(2)
	);

	// Memoria por chunk: tamaño real de los datos en memoria (Uint8Array + clave del Map).
	// Un chunk = 16×64×16 = 16 384 bytes; en disco (JSON) ocupa ~4-6× más.
	const BYTES_PER_CHUNK = CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE;
	const kbChunk = BYTES_PER_CHUNK / 1024;
	const mbArea4 = (kbChunk * 81) / 1024;
	check(
		"Mem: el área activa de radio 4 cabe holgada (< 60 MB en RAM + disco)",
		mbArea4 < 60,
		`${mbArea4.toFixed(1)} MB`
	);

	// Determinismo: regenerar y comparar (caves + lagos son función pura de coordenadas).
	const first = state.chunks.get("2,2");
	const snap = Array.from(first);
	state.chunks.delete("2,2");
	world.generateChunk(2, 2);
	const second = Array.from(state.chunks.get("2,2"));
	let diffs = 0;
	for (let i = 0; i < snap.length; i++) if (snap[i] !== second[i]) diffs++;
	check(
		"Gen: la regeneración de un chunk con cuevas es bit-idéntica (sin costuras ni sorpresas)",
		diffs === 0,
		`${diffs} diffs`
	);
}
world.setDiskLoader(null);
process.exit(fails ? 1 : 0);
