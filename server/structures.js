"use strict";

// ============================================================
// ESTRUCTURAS (Fase 18, D-3)
// Extraído de world.js: minas abandonadas (Fase 7), templo de jungla y
// naufragio (Fase 12, Bloque B) — deterministas por celda/hash 2D con sal.
// Usa el ruido compartido (noise.js), los biomas (biomes.js, para validar
// el emplazamiento) y los helpers del núcleo (idx/toLocal) vía core
// inyectado por world.js (setCore — evita el ciclo world→structures→world).
// El loot de los cofres lo provee chests.js y el estado vía state.chests.
// ============================================================
const { B, WORLD_MIN_Y, WORLD_MAX_Y } = require("./constants.js");
const state = require("./state.js");
const chests = require("./chests.js");
const noise = require("./noise.js");
const biomes = require("./biomes.js");

// Helpers del núcleo (world.js los inyecta al cargar; la caché de celdas
// también depende del seed → se limpia al re-sembrar).
let core = null;
function setCore(c) {
	core = c;
}
function clearCaches() {
	structCellCache.clear();
}
noise.onReinit(clearCaches);

// Fase 12 (Bloque B): cache por celda de las estructuras (templo/naufragio)
// — se declara ANTES de reinitNoise porque esta lo invalida al cambiar de
// semilla (los ruidos de bioma/agua de structCenterAt son del seed).
const structCellCache = new Map();
// ============================================================
// MINAS ABANDONADAS (Fase 7): pasillos subterráneos + cofres de loot.
// Se modelan como bandas finas alrededor de las curvas de nivel de dos
// ruidos independientes (dos familias de túneles que se cruzan), limitadas
// a regiones donde una puerta de ruido lo permite. Los túneles son
// horizontales (MS_TUNNEL_H de alto) a profundidad variable, se excavan
// SOLO en piedra (preservan minerales) y nunca rompen la superficie
// (y < height - 1). Deterministas por coordenada de mundo → continuos
// entre chunks, como las cuevas.
// ============================================================
const MS_REGION_GATE = 0.25; // ruido en [-1,1]: < 0.25 ≈ 60% del mapa puede tener minas
const MS_BAND = 0.055; // banda de cada familia de túneles (~2.7% por familia)
const MS_TUNNEL_H = 3; // alto del túnel (bloques excavados sobre su suelo)
// Profundidad del túnel RELATIVA a la superficie (fix): 4-16 bloques por
// debajo de ella, con variación de ruido suave y continua entre chunks
// (el túnel serpentea en profundidad, nunca queda en el aire sobre el
// terreno ni rompe la superficie: el guard y < height - 1 lo garantiza).
const MS_BELOW_MIN = 3;
const MS_BELOW_RANGE = 6;

function mineshaftAt(wx, wz) {
	if (noise.noise2D_ms_region(wx * 0.005, wz * 0.005) < MS_REGION_GATE) return false;
	const a = noise.noise2D_ms_a(wx * 0.035, wz * 0.035);
	const b = noise.noise2D_ms_b(wz * 0.035, -wx * 0.035);
	return Math.abs(a) < MS_BAND || Math.abs(b) < MS_BAND;
}
// Suelo del túnel: `height` es la altura de MUNDO de la superficie. El túnel
// queda siempre bajo tierra, a MS_BELOW_MIN..+RANGE bloques de profundidad.
// Fase 15 (D5): con el terreno anclado en ~0, el antiguo suelo de 2 bloques
// (diseño) dejaba las minas SIN espacio bajo la superficie (alturas 0-5): el
// suelo ahora es el fondo del mundo (nunca toca el bedrock de −64).
function mineshaftDepth(wx, wz, height) {
	const below =
		MS_BELOW_MIN +
		Math.floor(
			((noise.noise2D_ms_depth(wx * 0.06, wz * 0.06) + 1) / 2) * MS_BELOW_RANGE
		);
	return Math.max(WORLD_MIN_Y + 1, height - 1 - below);
}
// Cofre de loot: ~0.6% de las celdas de pasillo llevan cofre (hash 2D
// determinista, sin Math.random: estable entre reinicios y por columna).
function msLootSpot(wx, wz) {
	let h = (Math.imul(wx, 374761393) + Math.imul(wz, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296 < 0.006;
}

// ============================================================
// ESTRUCTURAS DE FASE 12 (Bloque B): templo de jungla y naufragio
// Deterministas por celda de STRUCT_CELL bloques (hash 2D con sal, sin
// Math.random — mismo patrón que las minas abandonadas). Cada celda puede
// albergar UNA estructura cuyo centro se deriva del hash (jitter dentro de
// la celda, siempre a ≥STRUCT_CENTER_MIN del borde → el footprint, máx 11
// bloques, nunca se sale de su celda ni solapa otra estructura).
// ============================================================
const STRUCT_CELL = 32; // celdas de 32x32 bloques
const STRUCT_CENTER_MIN = 8; // el centro queda a ≥8 del borde de la celda
const STRUCT_CENTER_RANGE = STRUCT_CELL - STRUCT_CENTER_MIN * 2; // 8..24
const STRUCT_GATE = 0.06; // ~6% de las celdas tienen estructura (3% templo, 3% naufragio)
const TEMPLE_HALF = 5; // footprint del templo: 11x11 (dx,dz ∈ [-5,5])
const SHIPWRECK_W = 3; // naufragio: 7 de ancho (dx ∈ [-3,3])
const SHIPWRECK_L = 2; // y 5 de largo (dz ∈ [-2,2])

// Hash 2D determinista de una celda (con sal para derivar varios valores).
function structCellHash(cellX, cellZ, salt) {
	let h = (Math.imul(cellX, 374761393) + Math.imul(cellZ, 668265263)) | 0;
	h = Math.imul(h ^ (h >>> 13), 1274126177);
	h = Math.imul(h ^ salt, 2246822519);
	h = Math.imul(h ^ (h >>> 16), 3266489917);
	return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Devuelve { type: "temple"|"shipwreck", cx, cz } para la celda, o null si
// no tiene estructura. El tipo se valida contra el bioma del centro: el
// templo solo en jungla firme (nunca sobre agua) y el naufragio solo en
// océano. El centro es el piso de la estructura.
function structCenterAt(cellX, cellZ) {
	const ckey = `${cellX},${cellZ}`;
	if (structCellCache.has(ckey)) return structCellCache.get(ckey);
	const gate = structCellHash(cellX, cellZ, 1);
	let result = null;
	if (gate < STRUCT_GATE) {
		const type = structCellHash(cellX, cellZ, 2) < 0.5 ? "temple" : "shipwreck";
		const jx = Math.floor(
			structCellHash(cellX, cellZ, 3) * STRUCT_CENTER_RANGE
		);
		const jz = Math.floor(
			structCellHash(cellX, cellZ, 4) * STRUCT_CENTER_RANGE
		);
		const cx = cellX * STRUCT_CELL + STRUCT_CENTER_MIN + jx;
		const cz = cellZ * STRUCT_CELL + STRUCT_CENTER_MIN + jz;
		if (type === "temple") {
			// Templo: solo en jungla y nunca sobre agua (lago/río/océano).
			if (biomes.getBiome(cx, cz) === "jungle" && biomes.columnFloorY(cx, cz) === null)
				result = { type, cx, cz };
		} else if (biomes.isOcean(cx, cz)) {
			// Naufragio: solo en el fondo del océano.
			result = { type, cx, cz };
		}
	}
	structCellCache.set(ckey, result);
	return result;
}

// ¿Qué estructura cubre la columna (wx, wz)? Devuelve { type, cx, cz } o null.
// El footprint nunca sale de su celda (centro ≥8 del borde, radio máx 5), así
// que basta con la celda propia.
function structureAt(wx, wz) {
	const s = structCenterAt(
		Math.floor(wx / STRUCT_CELL),
		Math.floor(wz / STRUCT_CELL)
	);
	if (!s) return null;
	const halfW = s.type === "temple" ? TEMPLE_HALF : SHIPWRECK_W;
	const halfL = s.type === "temple" ? TEMPLE_HALF : SHIPWRECK_L;
	if (Math.abs(wx - s.cx) > halfW || Math.abs(wz - s.cz) > halfL) return null;
	return s;
}

// Bloque del templo en (dx, dz, dy relativos al centro y su piso baseY):
// piso de musgo, paredes 2 altas con entrada al sur, pasadizos en cruz de
// 1x2 y cámara central 3x3 con el cofre del tesoro, techo, y una torre
// 3x3x2 como segunda planta (sello del templo de jungla de Minecraft).
function templeBlockAt(dx, dz, dy) {
	if (dy === 0) {
		// Piso: musgo en todo el footprint (el jugador entra caminando).
		return B.MOSSY_COBBLESTONE;
	}
	if (dy === 1 || dy === 2) {
		// Hueco de entrada al sur (1 de ancho, 2 de alto).
		if (dx === 0 && dz === TEMPLE_HALF) return B.AIR;
		// Cámara central 3x3: el cofre del tesoro en el centro del suelo.
		if (dx === 0 && dz === 0 && dy === 1) return B.CHEST;
		if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) return B.AIR;
		// Paredes del perímetro.
		if (Math.abs(dx) === TEMPLE_HALF || Math.abs(dz) === TEMPLE_HALF)
			return B.MOSSY_COBBLESTONE;
		// Pasadizos en cruz (1 de ancho, 2 de alto) hacia la cámara.
		if (dx === 0 || dz === 0) return B.AIR;
		// Relleno interior de piedra (E11: reuso de bloques).
		return B.STONE;
	}
	if (dy === 3) {
		// Techo: cubre todo salvo el hueco de entrada.
		if (dx === 0 && dz === TEMPLE_HALF) return B.AIR;
		return B.MOSSY_COBBLESTONE;
	}
	// Torre central 3x3x2 sobre el techo (segunda planta).
	if (dy === 4 || dy === 5) {
		if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) return B.MOSSY_COBBLESTONE;
		return B.AIR;
	}
	return B.AIR;
}

// Coloca la columna del templo en el chunk local (x, z) → coords de mundo
// (wx, wz). El piso del templo es la altura del terreno en su CENTRO
// (determinista); el terreno natural de la columna se recorta al templo
// (relleno de piedra si queda más bajo, aire por encima). El cofre central
// crea su estado de loot en state.chests (una vez, con guard).
function placeTempleColumn(data, x, z, wx, wz, struct, height) {
	const cx = Math.floor(struct.cx);
	const cz = Math.floor(struct.cz);
	const baseY = biomes.getHeight(cx, cz);
	const dx = wx - cx;
	const dz = wz - cz;
	if (Math.abs(dx) > TEMPLE_HALF || Math.abs(dz) > TEMPLE_HALF) return;
	// Relleno de soporte si el terreno natural queda bajo el piso del templo.
	for (let y = Math.max(WORLD_MIN_Y + 1, height); y < baseY; y++) {
		if (y <= WORLD_MAX_Y) data[core.idx(x, core.toLocal(y), z)] = B.STONE;
	}
	for (let y = baseY; y <= WORLD_MAX_Y; y++) {
		const block = templeBlockAt(dx, dz, y - baseY);
		data[core.idx(x, core.toLocal(y), z)] = block;
		// Cofre del tesoro: registrar su estado de loot una sola vez.
		if (block === B.CHEST) {
			const key = `${wx},${y},${wz}`;
			if (!state.chests.has(key))
				state.chests.set(key, chests.templeLootSlots());
		}
	}
}

// Nº de cofres del naufragio (1-3, determinista por celda) y posición
// candidata interior (dx, dz) → cofre si está entre las primeras `n`.
function shipwreckChestCount(cx, cz) {
	return 1 + Math.floor(structCellHash(cx, cz, 9) * 3); // 1..3
}
function isShipwreckChest(cx, cz, dx, dz) {
	const n = shipwreckChestCount(cx, cz);
	const candidates = [
		[-1, -1],
		[1, -1],
		[-1, 1],
		[1, 1]
	];
	for (let i = 0; i < n; i++) {
		if (candidates[i][0] === dx && candidates[i][1] === dz) return true;
	}
	return false;
}

// Coloca la columna del naufragio: casco volcado de madera de abeto (piso en
// el lecho oceánico, costados 2 altos y puntas) con viga central de tronco
// de jungla; 1-3 cofres de loot marino en el interior (sobre el piso). El
// interior sin cofre conserva el agua del océano (el casco se genera en la
// columna de agua; la invariante de unit-mundo de "sin bolsas de aire bajo
// el agua" se respeta: nunca se escribe aire aquí).
function placeShipwreckColumn(data, x, z, wx, wz, struct) {
	const cx = Math.floor(struct.cx);
	const cz = Math.floor(struct.cz);
	// Fase 15 (D5): el lecho del océano es Y de MUNDO (diseño − biomes.DESIGN_OFFSET).
	const baseY = biomes.oceanFloorY(cx, cz) - biomes.DESIGN_OFFSET + 1; // sobre la arena del lecho
	const dx = wx - cx;
	const dz = wz - cz;
	if (Math.abs(dx) > SHIPWRECK_W || Math.abs(dz) > SHIPWRECK_L) return;
	// Piso del casco: madera de abeto; la fila central es la viga de jungla.
	if (baseY >= WORLD_MIN_Y && baseY <= WORLD_MAX_Y) {
		data[core.idx(x, core.toLocal(baseY), z)] = dz === 0 ? B.JUNGLE_LOG : B.SPRUCE_LOG;
	}
	// Costados (1 y 2 sobre el piso): perímetro de madera.
	for (const dy of [1, 2]) {
		const y = baseY + dy;
		if (y > WORLD_MAX_Y) break;
		if (Math.abs(dx) === SHIPWRECK_W || Math.abs(dz) === SHIPWRECK_L) {
			data[core.idx(x, core.toLocal(y), z)] = B.SPRUCE_LOG;
		} else if (dy === 1) {
			// Cofre de loot marino en el interior (sobre el piso del casco).
			if (isShipwreckChest(cx, cz, dx, dz)) {
				data[core.idx(x, core.toLocal(y), z)] = B.CHEST;
				const key = `${wx},${y},${wz}`;
				if (!state.chests.has(key))
					state.chests.set(key, chests.shipwreckLootSlots());
			}
		}
	}
	// Puntas del casco (tercera capa): solo los extremos en X.
	const y3 = baseY + 3;
	if (y3 <= WORLD_MAX_Y && Math.abs(dx) === SHIPWRECK_W && Math.abs(dz) <= 1) {
		data[core.idx(x, core.toLocal(y3), z)] = B.SPRUCE_LOG;
	}
}

// Trampa del templo (E5): el pasadizo NORTE (dx=0, dz ∈ [-4,-1], 1 de ancho)
// es la celda de presión simplificada — al pisarla, net.js dispara 3-5
// flechas hacia el jugador (reuso de shootArrow, from: null). Función
// determinista y consistente con templeBlockAt (ahí ese tramo es pasadizo).
function templeTrapAt(wx, wz) {
	const s = structureAt(wx, wz);
	if (s?.type !== "temple") return false;
	const dx = wx - Math.floor(s.cx);
	const dz = wz - Math.floor(s.cz);
	return dx === 0 && dz <= -1 && dz >= -4;
}


module.exports = {
	mineshaftAt,
	mineshaftDepth,
	msLootSpot,
	structureAt,
	templeBlockAt,
	placeTempleColumn,
	placeShipwreckColumn,
	shipwreckChestCount,
	isShipwreckChest,
	templeTrapAt,
	MS_TUNNEL_H,
	setCore
};
