// ============================================================
// MAPA DE TESELAS POR BLOQUE/CARA (módulo PURAMENTE lógico)
// Fase 13 (A1/A2): extraído de textures.js para que el greedy meshing
// (chunkGeometry.js) y el Web Worker (chunkWorker.js) puedan calcular los
// rectángulos UV del atlas SIN importar three ni tocar el DOM — los module
// workers no resuelven el importmap de la página, así que la cadena de
// imports del worker no puede pasar por textures.js.
//
// La única fuente de verdad del atlas es textures.js (TILES, que pinta las
// teselas en el canvas). Este módulo solo conoce el LAYOUT: COLS teselas por
// fila y el número total (TILE_COUNT). textures.js llama a setTileCount()
// con TILES.length al cargar, de modo que tileRect() coincide siempre con el
// atlas real aunque se añadan teselas (en el hilo principal). En el worker
// se usa el valor por defecto; tests/unit-greedy.js verifica que el default
// sigue al día con el mayor índice usado por BLOCK_TEX.
// ============================================================

export const COLS = 8; // teselas por fila en el atlas
export let TILE_COUNT = 63; // nº total de teselas (63 en la Fase 13: +8 de L2/L3)

// textures.js fija el recuento real de teselas (TILES.length) al cargar.
export function setTileCount(n) {
	TILE_COUNT = n;
}

// Tesela por bloque y cara. Orden de FACES (ver world.js/chunkGeometry.js):
//   0=+X, 1=-X, 2=+Y (top), 3=-Y (bottom), 4=+Z, 5=-Z
const BLOCK_TEX = {
	1: { all: 0 }, // tierra
	2: { top: 1, bottom: 0, side: 2 }, // césped
	3: { all: 3 }, // piedra
	4: { top: 5, bottom: 5, side: 4 }, // tronco
	5: { all: 6 }, // hojas
	6: { all: 7 }, // arena
	7: { all: 8 }, // tablones
	8: { all: 9 }, // adoquín
	9: { all: 10 }, // mena de carbón
	10: { all: 11 }, // mena de hierro
	11: { all: 12 }, // mena de oro
	12: { all: 13 }, // mena de diamante
	13: { all: 14 }, // mena de redstone
	14: { all: 15 }, // mena de esmeralda
	15: { top: 16, bottom: 8, side: 17 }, // mesa de crafteo
	16: { top: 20, bottom: 20, fronts: 18, side: 19 }, // horno (frente en ±Z)
	17: { all: 21 }, // vidrio
	18: { all: 22 }, // lana
	19: { all: 23 }, // roca madre
	20: { all: 24 }, // agua
	21: { all: 25 }, // nieve
	22: { top: 26, bottom: 8, side: 27, fronts: 28 }, // cofre (cerradura en ±Z)
	23: { all: 29 }, // antorcha (tesela cruzada)
	24: { top: 30, bottom: 8, side: 31, fronts: 32 }, // cama (Fase 7)
	25: { all: 33 }, // lava
	26: { all: 45 }, // tierra arada (Fase 9, C)
	27: { all: 44 }, // trigo en crecimiento (Fase 9, C)
	28: { top: 35, bottom: 35, side: 34 }, // tronco de abedul (Fase 9, F)
	29: { all: 36 }, // hojas de abedul
	30: { top: 38, bottom: 38, side: 37 }, // tronco de pino
	31: { all: 39 }, // hojas de pino
	32: { all: 40 }, // piedra de musgo
	33: { all: 41 }, // hierba alta (cross)
	34: { all: 42 }, // amapola (cross)
	35: { all: 43 }, // diente de león (cross)
	36: { all: 46 }, // lana roja
	37: { all: 47 }, // lana amarilla
	38: { all: 48 }, // lana blanca
	39: { all: 49 }, // grava (Fase 10, D1)
	40: { all: 50 }, // TNT (Fase 10, D2)
	41: { top: 52, bottom: 52, side: 51 }, // tronco de jungla (Fase 11, B)
	42: { all: 53 }, // hojas de jungla
	43: { all: 54 }, // liana (cross)
	// Fase 13 (L2/L3): puertas (48/49), escaleras (50/51), losas (60/61),
	// valla (70) y portón (71) — teselas 55-62 del atlas.
	48: { all: 55 }, // puerta de roble
	49: { all: 56 }, // puerta de hierro
	50: { all: 57 }, // escaleras de roble
	51: { all: 58 }, // escaleras de piedra
	60: { all: 59 }, // losa de roble
	61: { all: 60 }, // losa de piedra
	70: { all: 61 }, // valla de roble
	71: { all: 62 }, // portón de roble
	72: { all: 63 }, // coral (Fase 21.5, D2): arrecife de océano cálido
	// Fase 21.5 (B1): piedra pulida — granito, diorita, andesita y pulidas
	// (teselas 64-69: las pulidas comparten mota pero con borde regular).
	73: { all: 64 },
	74: { all: 65 },
	75: { all: 66 },
	76: { all: 67 },
	77: { all: 68 },
	78: { all: 69 },
	79: { all: 70 }, // linterna (Fase 21.5, B2)
	// Fase 21.5 (B3): bambú (planta alta, cross), tablones y andamio.
	80: { all: 71 },
	81: { all: 72 },
	82: { all: 73 },
	// Fase 21.5 (B4): nido de abeja, colmena y bloque de miel.
	83: { all: 74 },
	84: { all: 75 },
	85: { all: 76 }
};

// Devuelve el índice de tesela para un bloque y una cara.
export function tileForFace(blockId, faceIndex) {
	const t = BLOCK_TEX[blockId];
	if (!t) return 3; // piedra por defecto
	if (t.all !== undefined) return t.all;
	if (faceIndex === 2) return t.top; // +Y
	if (faceIndex === 3) return t.bottom; // -Y
	if (t.fronts !== undefined && (faceIndex === 4 || faceIndex === 5))
		return t.fronts; // ±Z
	return t.side;
}

// Rectángulo UV [u0, v0, u1, v1] de una tesela en el atlas (v0 abajo, v1 arriba).
export function tileRect(index) {
	const col = index % COLS;
	const row = Math.floor(index / COLS);
	const rows = Math.ceil(TILE_COUNT / COLS);
	const u0 = col / COLS,
		u1 = (col + 1) / COLS;
	const v1 = 1 - row / rows,
		v0 = 1 - (row + 1) / rows;
	return [u0, v0, u1, v1];
}
