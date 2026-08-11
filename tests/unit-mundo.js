"use strict";
// ============================================================
// TESTS UNITARIOS DE GENERACIÓN DE MUNDO (Fase 4: cuevas + lagos)
// Verifica que la generación en world.js:
//   1. no excava el bedrock (y=0) y solo abre la superficie como bocas de
//      cueva escasas (fix: cuevas comunicadas con el exterior)
//   2. es determinista en la zona subterránea (sin Math.random ahí)
//   3. es continua entre chunks (sin costuras en los bordes)
//   4. excava cuevas con fracción razonable y túneles conexos
//   5. genera lagos: agua solo hasta SEA_LEVEL, arena bajo el agua,
//      sin aire bajo el fondo, y el agua no es sólida (isSolidBlock)
//   6. (Fase 7) los charcos decorativos de superficie son válidos: agua
//      por encima de SEA_LEVEL solo como bloque de superficie con lecho
//      de arena, fuera de lagos y abierta al aire
// ============================================================
const world = require("../server/world.js");
const state = require("../server/state.js");
const {
	CHUNK_SIZE,
	WORLD_HEIGHT,
	B,
	isSolidBlock
} = require("../server/constants.js");

function idx(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

// Generación fresca: no leer los chunks viejos del disco (sin cuevas ni lagos).
world.setDiskLoader(() => null);

let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (typeof failedChecks !== "undefined" && failedChecks.length)
		console.log(`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) { failed++; failedChecks.push(_name); }
};

// Superficie efectiva de una columna: en un lago/río el terreno se hunde
// hasta su fondo real (profundidad variable, Fase 10 A4); getHeight no
// contempla lagos ni ríos, por eso se ajusta aquí con columnFloorY.
function columnSurface(wx, wz) {
	const floorY = world.columnFloorY(wx, wz);
	return floorY != null ? floorY : world.getHeight(wx, wz);
}

// --- 1) Generar una zona de 7x7 chunks y medir invariantes básicas ---
const RADIUS = 3; // 49 chunks
for (let cx = -RADIUS; cx <= RADIUS; cx++) {
	for (let cz = -RADIUS; cz <= RADIUS; cz++) {
		world.generateChunk(cx, cz);
	}
}

let stoneTotal = 0,
	carved = 0,
	bedrockBroken = 0,
	columns = 0,
	surfaceHoles = 0,
	mouthCount = 0;
let waterCells = 0,
	waterAboveSea = 0,
	badWaterFloor = 0,
	airUnderWater = 0,
	badPond = 0;
// Fase 10 (A4): ríos y profundidad variable de lagos (se rellenan en el
// barrido principal, que ya calcula river/floorY por columna).
let riverWaterCells = 0;
const lakeFloors = new Set();
for (let cx = -RADIUS; cx <= RADIUS; cx++) {
	for (let cz = -RADIUS; cz <= RADIUS; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				const lake = world.isLake(wx, wz);
				const river = world.isRiver(wx, wz);
				const floorY = world.columnFloorY(wx, wz);
				const surface = floorY != null ? floorY : world.getHeight(wx, wz);
				columns++;
				// Fase 10 (A4): métricas de ríos y de profundidad variable de lagos.
				if (floorY != null) {
					if (river) riverWaterCells++;
					if (lake) lakeFloors.add(floorY);
				}
				for (let y = 1; y < surface - 1; y++) {
					stoneTotal++;
					if (data[idx(x, y, z)] === B.AIR) carved++;
				}
				if (data[idx(x, 0, z)] !== B.BEDROCK) bedrockBroken++;
				// Boca de cueva: el bloque de superficie (surface-1) abierto al aire
				// es una entrada visible hacia el exterior (fix de la tarea).
				if (data[idx(x, surface - 1, z)] === B.AIR) mouthCount++;
				// Los 2 bloques superiores pueden tener huecos SOLO como bocas de
				// cueva escasas: túneles que rompen la superficie ocasionalmente.
				let topHoles = 0;
				for (let y = Math.max(0, surface - 2); y < surface; y++) {
					if (data[idx(x, y, z)] === B.AIR) topHoles++;
				}
				if (topHoles > 0) surfaceHoles++;
				// agua: invariantes de lago/río + charcos decorativos (Fase 7)
				for (let y = 1; y < WORLD_HEIGHT; y++) {
					if (data[idx(x, y, z)] === B.WATER) {
						waterCells++;
						if (y >= world.SEA_LEVEL) {
							// Agua sobre el nivel del mar = charco decorativo de superficie
							// (Fase 7): debe ser el bloque de superficie de una columna
							// NO lago, con lecho de arena justo debajo.
							waterAboveSea++;
							const below = data[idx(x, y - 1, z)];
							const above = y + 1 < WORLD_HEIGHT ? data[idx(x, y + 1, z)] : 0;
							if (
								lake ||
								y !== surface - 1 || // no es la superficie
								below !== B.SAND || // sin lecho de arena
								above !== B.AIR // no está abierto al aire
							)
								badPond++;
						}
						// Fase 10 (A4): el agua de lago/río está SIEMPRE por debajo del
						// nivel del mar y no hay AIRE justo debajo de una celda de agua
						// (el lecho es arena; las cuevas bajo el agua se inundan).
						const below = data[idx(x, y - 1, z)];
						if (below === B.AIR) airUnderWater++;
						// Lecho del lago/río: el bloque del fondo real (columnFloorY) es
						// arena. El agua en y = floorY + 1 descansa sobre él.
						if (floorY != null && y === floorY + 1 && below !== B.SAND)
							badWaterFloor++;
					}
				}
			}
		}
	}
}

const frac = stoneTotal ? (carved / stoneTotal) * 100 : 0;
const holePct = columns ? (surfaceHoles / columns) * 100 : 0;
// Nota: los límites de bocas/huecos están calibrados para la semilla por
// defecto (miSemilla2026); con otra SEED podrían variar (los tests de la
// suite ya son seed-específicos por diseño: los 5 biomas, la montaña, etc.).
check(
	"bedrock intacto (y=0 siempre BEDROCK)",
	bedrockBroken === 0,
	`${bedrockBroken} violaciones`
);
check(
	"las cuevas abren bocas hacia la superficie (alguna columna)",
	mouthCount > 0,
	`${mouthCount} bocas`
);
check(
	"los huecos de superficie son escasos (< 10% de columnas)",
	holePct < 10,
	`${holePct.toFixed(1)}% de columnas con hueco`
);
check(
	"fracción excavada en rango sano (5-25%)",
	frac >= 5 && frac <= 25,
	`${frac.toFixed(1)}%`
);
check(
	"hay agua en el mundo (lagos generados)",
	waterCells > 0,
	`${waterCells} celdas de agua`
);
check(
	"el agua por encima de SEA_LEVEL es charco válido (superficie + arena)",
	badPond === 0,
	`${badPond} charcos inválidos (${waterAboveSea} celdas de agua alta)`
);
check(
	"el fondo de los lagos es arena",
	badWaterFloor === 0,
	`${badWaterFloor} violaciones`
);
check(
	"sin aire bajo el agua dentro de la columna",
	airUnderWater === 0,
	`${airUnderWater} celdas de aire bajo agua`
);
check(
	"hay ríos pequeños (canales de agua fuera de lagos)",
	riverWaterCells > 0,
	`${riverWaterCells} celdas de agua de río`
);
check(
	"los lagos tienen profundidad variable (fondo no uniforme)",
	lakeFloors.size > 1,
	`profundidades: ${[...lakeFloors].sort().join(",")}`
);
check(
	"el agua no es sólida (isSolidBlock(WATER) === false)",
	isSolidBlock(B.WATER) === false
);
check(
	"la piedra sí es sólida (isSolidBlock(STONE) === true)",
	isSolidBlock(B.STONE) === true
);

// --- 2) Determinismo subterráneo: regenerar debe dar idéntico resultado ---
state.chunks.delete("0,0");
const a = world.generateChunk(0, 0);
state.chunks.delete("0,0");
const b = world.generateChunk(0, 0);
let diffs = 0,
	underground = 0;
for (let x = 0; x < CHUNK_SIZE; x++) {
	for (let z = 0; z < CHUNK_SIZE; z++) {
		const surface = columnSurface(x, z);
		for (let y = 2; y < surface - 2; y++) {
			underground++;
			if (a[idx(x, y, z)] !== b[idx(x, y, z)]) diffs++;
		}
	}
}
check(
	"determinismo subterráneo (0 diffs)",
	diffs === 0,
	`${diffs}/${underground} diffs`
);
check(
	"hay zona subterránea que comprobar",
	underground > 0,
	`${underground} bloques`
);

// --- 3) Sin costuras entre chunks (determinismo en los bordes) ---
// La generación es función pura de coordenadas de mundo: al regenerar los
// chunks vecinos debe dar exactamente el mismo resultado. Así ningún borde
// puede quedar incoherente (cuevas y lagos cruzan fronteras sin paredes falsas).
let seamDiffs = 0,
	seamTotal = 0;
for (const key of ["1,0", "0,1", "1,1"]) {
	const [cx, cz] = key.split(",").map(Number);
	const first = state.chunks.get(key);
	state.chunks.delete(key);
	const second = world.generateChunk(cx, cz);
	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			const surface = columnSurface(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z);
			for (let y = 2; y < surface - 2; y++) {
				seamTotal++;
				if (first[idx(x, y, z)] !== second[idx(x, y, z)]) seamDiffs++;
			}
		}
	}
}
check(
	"sin costuras entre chunks (regeneración idéntica en 1,0/0,1/1,1)",
	seamDiffs === 0,
	`${seamDiffs}/${seamTotal} diffs`
);

// --- 4) Las cuevas forman componentes conexas navegables ---
const chunk = state.chunks.get("0,0");
const visited = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
let largest = 0,
	count3 = 0;
for (let x = 0; x < CHUNK_SIZE; x++) {
	for (let y = 1; y < WORLD_HEIGHT - 1; y++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			const i = idx(x, y, z);
			if (visited[i] || chunk[i] !== B.AIR) continue;
			const surface = columnSurface(x, z);
			if (y >= surface - 1) continue; // aire de superficie, no cueva
			let size = 0;
			const stack = [[x, y, z]];
			visited[i] = 1;
			while (stack.length) {
				const [px, py, pz] = stack.pop();
				size++;
				for (const [dx, dy, dz] of [
					[1, 0, 0],
					[-1, 0, 0],
					[0, 1, 0],
					[0, -1, 0],
					[0, 0, 1],
					[0, 0, -1]
				]) {
					const nx = px + dx,
						ny = py + dy,
						nz = pz + dz;
					if (
						nx < 0 ||
						nx >= CHUNK_SIZE ||
						ny < 1 ||
						ny >= WORLD_HEIGHT - 1 ||
						nz < 0 ||
						nz >= CHUNK_SIZE
					)
						continue;
					const ni = idx(nx, ny, nz);
					if (visited[ni] || chunk[ni] !== B.AIR) continue;
					const ns = columnSurface(nx, nz);
					if (ny >= ns - 1) continue;
					visited[ni] = 1;
					stack.push([nx, ny, nz]);
				}
			}
			if (size >= 3) {
				count3++;
				if (size > largest) largest = size;
			}
		}
	}
}
check(
	"existen cuevas (componentes >= 3 bloques)",
	count3 > 0,
	`${count3} cuevas, mayor ${largest} bloques`
);

// Limpiar el hook para no afectar a otros tests del proceso.
world.setDiskLoader(null);
process.exit(failed ? 1 : 0);
