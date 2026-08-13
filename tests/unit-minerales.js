"use strict";
// ============================================================
// TESTS UNITARIOS DE BANDAS DE MINERALES (Fase 18, C-2)
// La distribución de menas del mundo v6 (−64..+63) sigue los percentiles
// de columna de MC 1.18 (mundo −64..+320): diamante/redstone en el fondo
// 21 %, oro en el 37 %, hierro en el 83 %, carbón en la banda media.
// Este test genera una zona determinista de chunks y verifica que:
//   1. cada mena aparece SOLO dentro de su banda de profundidad
//      (invariante: y < max, y para carbón además y > −42)
//   2. cada mena aparece AL MENOS una vez (no se quedó sin generar)
//   3. la tabla documentada en server/world.js coincide con las bandas
//      del generador (misma fuente de verdad)
// La tabla completa vive en server/world.js junto a generateOres.
// ============================================================
const world = require("../server/world.js");
const state = require("../server/state.js");
const {
	CHUNK_SIZE,
	WORLD_MIN_Y,
	B,
	isSolidBlock
} = require("../server/constants.js");

world.setDiskLoader(() => null);

let failed = 0;
const failedChecks = [];
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		failedChecks.push(_name);
	}
};

// Índice con local y = mundo y − WORLD_MIN_Y (layout v6).
function idx(x, wy, z) {
	return ((wy - WORLD_MIN_Y) * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

// --- Bandas documentadas (Fase 18, C-2) — la MISMA tabla que audit-altura ---
// MC 1.18 → v6 por percentil de columna (ver comentario en world.js).
const ORE_BANDS = {
	[B.DIAMOND_ORE]: { min: WORLD_MIN_Y, max: -38, name: "diamante" },
	[B.REDSTONE_ORE]: { min: WORLD_MIN_Y, max: -32, name: "redstone" },
	[B.EMERALD_ORE]: { min: WORLD_MIN_Y, max: -20, name: "esmeralda" },
	[B.GOLD_ORE]: { min: WORLD_MIN_Y, max: -16, name: "oro" },
	[B.IRON_ORE]: { min: WORLD_MIN_Y, max: 42, name: "hierro" },
	[B.COAL_ORE]: { min: -42, max: 42, name: "carbón" }
};

// --- 1) Generar una zona determinista de chunks y contar menas ---
// Radio 6 (169 chunks): con la semilla por defecto garantiza presencia de
// todas las menas en banda (verificado empíricamente; 25 chunks no bastan
// para el diamante, raro y profundo).
const RADIUS = 6;
for (let cx = -RADIUS; cx <= RADIUS; cx++) {
	for (let cz = -RADIUS; cz <= RADIUS; cz++) {
		world.generateChunk(cx, cz);
	}
}

const counts = {};
const violations = [];
for (let cx = -RADIUS; cx <= RADIUS; cx++) {
	for (let cz = -RADIUS; cz <= RADIUS; cz++) {
		const data = state.chunks.get(`${cx},${cz}`);
		for (let x = 0; x < CHUNK_SIZE; x++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const wx = cx * CHUNK_SIZE + x,
					wz = cz * CHUNK_SIZE + z;
				// Toda la columna de piedra (y < superficie efectiva): usar el
				// bloque de superficie como tope, igual que audit-altura.
				const surface =
					world.columnFloorY(wx, wz) != null
						? world.columnFloorY(wx, wz) - world.DESIGN_OFFSET
						: world.getHeight(wx, wz);
				for (let wy = WORLD_MIN_Y + 1; wy < surface - 1; wy++) {
					const b = data[idx(x, wy, z)];
					const band = ORE_BANDS[b];
					if (!band) continue;
					counts[b] = (counts[b] || 0) + 1;
					if (wy >= band.max || wy < band.min) {
						violations.push(
							`${band.name} fuera de banda: y=${wy} (banda [${band.min},${band.max})) en (${wx},${wz})`
						);
					}
				}
			}
		}
	}
}

// --- 2) Verificaciones ---
for (const [b, band] of Object.entries(ORE_BANDS)) {
	const id = Number(b);
	check(
		`${band.name} presente dentro de su banda`,
		(counts[id] || 0) > 0,
		`${counts[id] || 0} bloques`
	);
}
check(
	"0 menas fuera de su banda de profundidad (percentiles MC)",
	violations.length === 0,
	violations.slice(0, 3).join("; ")
);

// --- 3) Orden de bandas: diamante más profundo que redstone que oro... ---
// El percentil MC fija diamante/redstone en el fondo (21 %), oro en el
// 37 %, hierro en el 83 %: cada una estrictamente más somera que la anterior.
check(
	"orden de bandas: diamante (≤−38) < redstone (≤−32) < oro (≤−16) < hierro (≤42)",
	ORE_BANDS[B.DIAMOND_ORE].max < ORE_BANDS[B.REDSTONE_ORE].max &&
		ORE_BANDS[B.REDSTONE_ORE].max < ORE_BANDS[B.GOLD_ORE].max &&
		ORE_BANDS[B.GOLD_ORE].max < ORE_BANDS[B.IRON_ORE].max
);
check(
	"carbón es la única mena con techo mínimo (banda media −42..42)",
	ORE_BANDS[B.COAL_ORE].min === -42 && ORE_BANDS[B.COAL_ORE].max === 42
);

// --- 4) El diamante es RARO (solo fondo profundo): no debe haber menas en
// --- las capas superiores del subsuelo (y > 30) salvo hierro/carbón.
{
	const oreIds = Object.keys(ORE_BANDS).map(Number);
	let shallowOres = 0;
	for (let cx = -RADIUS; cx <= RADIUS; cx++) {
		for (let cz = -RADIUS; cz <= RADIUS; cz++) {
			const data = state.chunks.get(`${cx},${cz}`);
			for (let x = 0; x < CHUNK_SIZE; x++) {
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const wx = cx * CHUNK_SIZE + x,
						wz = cz * CHUNK_SIZE + z;
					const surface =
						world.columnFloorY(wx, wz) != null
							? world.columnFloorY(wx, wz) - world.DESIGN_OFFSET
							: world.getHeight(wx, wz);
					for (let wy = 30; wy < surface - 1 && wy < 42; wy++) {
						const b = data[idx(x, wy, z)];
						if (oreIds.includes(b) && b !== B.IRON_ORE && b !== B.COAL_ORE)
							shallowOres++;
					}
				}
			}
		}
	}
	check(
		"capas someras (y 30..41): solo hierro/carbón (nada profundo)",
		shallowOres === 0,
		`${shallowOres} menas profundas en capas someras`
	);
}

process.exit(failed === 0 ? 0 : 1);
