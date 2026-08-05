"use strict";
// ============================================================
// TESTS UNITARIOS DE TERRENO (Fase 7)
// Cubre las tres features nuevas de generación:
//   1. Minas abandonadas: pasillos horizontales excavados en piedra,
//      SIEMPRE bajo tierra (profundidad relativa a la superficie, nunca
//      en el aire sobre el terreno) y sin romper la superficie.
//   2. Pozos de agua/lava en superficie: charcos decorativos con lecho
//      de arena, fuera de lagos y de bocas de cueva.
//   3. gzip del guardado por chunk: los archivos se comprimen (~10x) y
//      siguen siendo legibles (retrocompatible con JSON plano).
//   4. Cofres de loot: aparecen en las minas (state.chests), bajo tierra.
// ============================================================
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const zlib = require("node:zlib");
const constants = require("../server/constants.js");
const { B, SCHEMA_VERSION, worldPaths } = constants;
const world = require("../server/world.js");
const state = require("../server/state.js");

// Aislar el I/O en un directorio temporal (no tocar el mundo real).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-terreno-"));
worldPaths.worldRoot = TMP;
worldPaths.worldDir = path.join(TMP, "mundo");
worldPaths.chunksDir = path.join(worldPaths.worldDir, "chunks");
worldPaths.metaFile = path.join(worldPaths.worldDir, "world.json");
worldPaths.legacyFile = path.join(worldPaths.worldDir, "world.dat");
fs.mkdirSync(worldPaths.chunksDir, { recursive: true });

let failed = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) failed++;
};

const IDX = (x, y, z) => (y * 16 + z) * 16 + x;

// ============================================================
// 1) GENERACIÓN: 5x5 chunks con generación fresca (sin disco)
// ============================================================
world.setDiskLoader(() => null);
const R = 2;
for (let cx = -R; cx <= R; cx++)
	for (let cz = -R; cz <= R; cz++) world.generateChunk(cx, cz);
world.setDiskLoader(null);

// --- 1a) Minas: pasillos excavados bajo tierra ---
// Garantía estructural de la generación: el suelo del túnel se calcula como
// mineshaftDepth(wx, wz, height) = max(2, height - 1 - below) con below ≥ 3,
// y se excavan MS_TUNNEL_H celdas SOLO en y < height - 1. Por tanto el túnel
// queda SIEMPRE bajo tierra: verificamos la cota en una muestra de columnas
// con mina (y que las celdas excavadas no toquen la superficie ni el bedrock).
let minaCols = 0,
	aboveSurface = 0,
	inBedrock = 0;
for (let wx = -R * 16; wx < R * 16; wx++) {
	for (let wz = -R * 16; wz < R * 16; wz++) {
		if (!world.mineshaftAt(wx, wz) || world.isLake(wx, wz)) continue;
		const h = world.getHeight(wx, wz);
		const depth = world.mineshaftDepth(wx, wz, h);
		minaCols++;
		// El bucle de excavación va de depth+1 a depth+MS_TUNNEL_H-1 truncado por
		// `y < height - 1` (el techo excavado más alto es height-2, nunca la
		// superficie). La violación real es que el túnel NO quepa bajo tierra en
		// un terreno con espacio suficiente (h >= 5): era el bug original
		// (profundidad absoluta 6-32 con terrenos de altura 4-9 → túneles en el
		// aire, sin excavar). Con h=4 (altura mínima) la mina simplemente no
		// excava: no cabe, comportamiento correcto.
		if (h >= 5 && depth + 1 >= h - 1) aboveSurface++;
		if (depth + 1 < 2) inBedrock++;
	}
}
check(
	"hay columnas con mina en el área",
	minaCols > 50,
	`${minaCols} columnas`
);
check(
	"los túneles de mina nunca rompen la superficie",
	aboveSurface === 0,
	`${aboveSurface} violaciones`
);
check(
	"los túneles de mina no tocan el bedrock",
	inBedrock === 0,
	`${inBedrock} violaciones`
);

// --- 1b) Pozos de agua/lava ---
// Los charcos son escasos y están agrupados por regiones (agua ~1%, lava
// ~0.4% del mapa): en un área pequeña puede no caer ninguno. Para verificar
// la generación de forma robusta, barremos en busca de un punto donde el
// gate diga "sí hay charco", lo generamos y comprobamos que el bloque se
// colocó con su lecho de arena.
function surfaceAt(data, _cx, _cz, x, z) {
	for (let y = 63; y >= 0; y--) {
		if (data[IDX(x, y, z)] !== 0) return y;
	}
	return -1;
}
function pondInArea(pondFn, liquidId) {
	// Buscar una columna con gate=true en el área, generarla y comprobar.
	for (let wx = -R * 16; wx < R * 16; wx++) {
		for (let wz = -R * 16; wz < R * 16; wz++) {
			if (!pondFn(wx, wz) || world.isLake(wx, wz)) continue;
			const cx = Math.floor(wx / 16),
				cz = Math.floor(wz / 16);
			world.generateChunk(cx, cz);
			const data = state.chunks.get(`${cx},${cz}`);
			const x = ((wx % 16) + 16) % 16,
				z = ((wz % 16) + 16) % 16;
			const h = surfaceAt(data, cx, cz, x, z);
			if (h < 0) continue;
			return {
				wx,
				wz,
				h,
				surf: data[IDX(x, h, z)],
				below: data[IDX(x, h - 1, z)],
				liquidId
			};
		}
	}
	return null;
}
const pond = pondInArea(world.isPondAt, B.WATER);
// La lava es muy escasa (0.4% global, agrupada por regiones): barrido amplio
// (radio 12 chunks) para encontrar al menos una región con lava y comprobar
// que el bloque se coloca. Sin generar nada hasta localizar el punto.
function findLavaPoint() {
	for (let wx = -R * 16 - 200; wx < R * 16 + 200; wx++) {
		for (let wz = -R * 16 - 200; wz < R * 16 + 200; wz++) {
			if (!world.isLavaPondAt(wx, wz) || world.isLake(wx, wz)) continue;
			const cx = Math.floor(wx / 16),
				cz = Math.floor(wz / 16);
			world.generateChunk(cx, cz);
			const data = state.chunks.get(`${cx},${cz}`);
			const x = ((wx % 16) + 16) % 16,
				z = ((wz % 16) + 16) % 16;
			const h = surfaceAt(data, cx, cz, x, z);
			if (h >= 0 && data[IDX(x, h, z)] === B.LAVA) {
				return {
					wx,
					wz,
					h,
					surf: data[IDX(x, h, z)],
					below: data[IDX(x, h - 1, z)]
				};
			}
		}
	}
	return null;
}
const lava = findLavaPoint();
check(
	"hay charcos de agua decorativos (gate → bloque colocado)",
	!!pond && pond.surf === B.WATER && pond.below === B.SAND,
	pond ? `en (${pond.wx},${pond.wz}) y=${pond.h}` : "ninguno en el área"
);
check(
	"hay charcos de lava decorativos (gate → bloque colocado)",
	!!lava && lava.surf === B.LAVA && lava.below === B.SAND,
	lava ? `en (${lava.wx},${lava.wz}) y=${lava.h}` : "ninguno en el área"
);

// --- 1c) Cofres de loot ---
let chests = 0;
const chestY = [];
for (const [key, data] of state.chunks) {
	const [cx, cz] = key.split(",").map(Number);
	const _bx = cx * 16,
		_bz = cz * 16;
	for (let x = 0; x < 16; x++) {
		for (let z = 0; z < 16; z++) {
			for (let y = 0; y < 64; y++) {
				if (data[IDX(x, y, z)] === B.CHEST) {
					chests++;
					const h = surfaceAt(data, cx, cz, x, z);
					chestY.push([y, h]);
				}
			}
		}
	}
}
check("hay cofres de loot en las minas", chests > 0, `${chests} cofres`);
check(
	"los cofres están bajo tierra (no flotando)",
	chestY.every(([y, h]) => y < h - 1 && y >= 2),
	JSON.stringify(chestY.slice(0, 3))
);
check(
	"los cofres tienen loot en state.chests",
	state.chests.size === chests,
	`state=${state.chests.size} chunks=${chests}`
);

// --- 1d) Determinismo y gates ---
const spot = [3, 7];
const a1 = world.mineshaftAt(spot[0], spot[1]);
const a2 = world.mineshaftAt(spot[0], spot[1]);
check("mineshaftAt es determinista", a1 === a2);
const p1 = world.isPondAt(5, 5);
const p2 = world.isPondAt(5, 5);
check("isPondAt es determinista", p1 === p2);
const l1 = world.isLavaPondAt(5, 5);
const l2 = world.isLavaPondAt(5, 5);
check("isLavaPondAt es determinista", l1 === l2);

// ============================================================
// 2) GZIP: compresión del guardado por chunk
// ============================================================
{
	// Escribir un chunk con bloques reales
	const arr = new Uint8Array(16 * 64 * 16);
	for (let i = 0; i < arr.length; i++) arr[i] = i % 26;
	arr[1234] = B.CHEST;
	world.writeChunkFile("3,-2", arr);
	const file = path.join(worldPaths.chunksDir, "3_-2.json");
	const raw = fs.readFileSync(file);
	check(
		"el archivo de chunk se comprime con gzip (cabecera 1f 8b)",
		raw[0] === 0x1f && raw[1] === 0x8b
	);
	const parsed = world.readChunkFile(file, "test");
	check(
		"el chunk gzip se lee y descomprime igual",
		parsed &&
			parsed.cx === 3 &&
			parsed.cz === -2 &&
			parsed.data[1234] === B.CHEST,
		parsed ? `schema=${parsed.schemaVersion}` : "parsed=null"
	);
	check(
		"la compresión es efectiva (< 25% del tamaño del JSON plano)",
		raw.length < JSON.stringify(parsed).length / 4,
		`${raw.length} bytes vs ${JSON.stringify(parsed).length}`
	);
	// Retrocompatibilidad: un archivo JSON plano (formato antiguo) se sigue leyendo
	const plain = path.join(worldPaths.chunksDir, "9_9.json");
	fs.writeFileSync(
		plain,
		JSON.stringify({
			schemaVersion: SCHEMA_VERSION,
			cx: 9,
			cz: 9,
			data: Array.from(arr)
		})
	);
	const parsedPlain = world.readChunkFile(plain, "test");
	check(
		"los archivos JSON planos (v2, sin gzip) se siguen leyendo",
		parsedPlain && parsedPlain.data[1234] === B.CHEST
	);
	// gzip manual equivalente
	const gun = zlib.gunzipSync(raw).toString("utf8");
	const viaGun = JSON.parse(gun);
	check(
		"el gzip descomprime a JSON válido con schemaVersion",
		viaGun.schemaVersion === SCHEMA_VERSION
	);
}

// ============================================================
// 3) LAVA: no sólida y no minable
// ============================================================
check(
	"la lava no es sólida (isSolidBlock(LAVA) === false)",
	constants.isSolidBlock(B.LAVA) === false
);
check(
	"la lava no es minable (NOT_MINEABLE)",
	constants.NOT_MINEABLE.has(B.LAVA)
);

// Limpiar: restaurar el mundo por defecto del proceso (otros tests del runner
// usan worldPaths; el hook de disco se dejó en null).
constants.setWorldSeed(constants.SEED);
process.exit(failed ? 1 : 0);
