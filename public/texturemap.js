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
export let TILE_COUNT = 139; // 139 teselas: 80 base + 3 lana + 48 camas + 8 blast/decorativos

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
	85: { all: 76 },
	// Fase 21.5 (B5): abanico de coral, kelp y pasto marino (cross-quads).
	86: { all: 77 },
	87: { all: 78 },
	88: { all: 79 },
	// Fase 21.5 (E2): lana nueva
	66: { all: 80 }, // lana gris
	89: { all: 81 }, // lana negra
	90: { all: 82 }, // lana marrón
	// Fase 21.5 (C4): 16 camas de colores — 3 teselas cada una (top/side/front)
	44: { top: 83, bottom: 8, side: 84, fronts: 85 }, // cama blanca
	45: { top: 86, bottom: 8, side: 87, fronts: 88 }, // cama naranja
	46: { top: 89, bottom: 8, side: 90, fronts: 91 }, // cama magenta
	47: { top: 92, bottom: 8, side: 93, fronts: 94 }, // cama azul claro
	52: { top: 95, bottom: 8, side: 96, fronts: 97 }, // cama amarilla
	53: { top: 98, bottom: 8, side: 99, fronts: 100 }, // cama verde lima
	54: { top: 101, bottom: 8, side: 102, fronts: 103 }, // cama rosa
	55: { top: 104, bottom: 8, side: 105, fronts: 106 }, // cama gris
	56: { top: 107, bottom: 8, side: 108, fronts: 109 }, // cama gris claro
	57: { top: 110, bottom: 8, side: 111, fronts: 112 }, // cama cian
	58: { top: 113, bottom: 8, side: 114, fronts: 115 }, // cama púrpura
	59: { top: 116, bottom: 8, side: 117, fronts: 118 }, // cama azul
	62: { top: 119, bottom: 8, side: 120, fronts: 121 }, // cama marrón
	63: { top: 122, bottom: 8, side: 123, fronts: 124 }, // cama verde
	64: { top: 125, bottom: 8, side: 126, fronts: 127 }, // cama roja
	65: { top: 128, bottom: 8, side: 129, fronts: 130 }, // cama negra
	// Fase 21.5 (C1): horno de fundición — misma lógica que el horno (frente ±Z)
	91: { top: 131, bottom: 8, side: 131, fronts: 131 }, // blast furnace
	// Fase 21.5 (E3): bloques decorativos (cross-quad, all = misma tesela)
	92: { all: 132 }, // arbusto de luciérnagas
	93: { all: 133 }, // hojarasca
	94: { all: 134 }, // flores silvestres
	95: { all: 135 }, // arbusto
	96: { all: 136 }, // hierba seca corta
	97: { all: 137 }, // hierba seca alta
	98: { all: 138 }, // flor de cactus
	// Fase 21.5 (C5): concreto — 16 sólidos (142-157) y 16 polvos (158-173).
	// Teselas consecutivas 139-170 (color índice = bloque − 142 o bloque − 158).
	142: { all: 139 },
	143: { all: 140 },
	144: { all: 141 },
	145: { all: 142 },
	146: { all: 143 },
	147: { all: 144 },
	148: { all: 145 },
	149: { all: 146 },
	150: { all: 147 },
	151: { all: 148 },
	152: { all: 149 },
	153: { all: 150 },
	154: { all: 151 },
	155: { all: 152 },
	156: { all: 153 },
	157: { all: 154 },
	158: { all: 155 },
	159: { all: 156 },
	160: { all: 157 },
	161: { all: 158 },
	162: { all: 159 },
	163: { all: 160 },
	164: { all: 161 },
	165: { all: 162 },
	166: { all: 163 },
	167: { all: 164 },
	168: { all: 165 },
	169: { all: 166 },
	170: { all: 167 },
	171: { all: 168 },
	172: { all: 169 },
	173: { all: 170 },
	// Fase 21.5 (D1/D3/F1/F3): bóveda, corazón crujiente, pale oak y núcleo.
	174: { all: 171 },
	175: { all: 172 },
	176: { top: 173, bottom: 173, side: 174 }, // tronco de roble pálido
	177: { all: 175 }, // hojas de roble pálido
	178: { all: 176 }, // tablones de roble pálido
	179: { all: 177 }, // bloque de musgo pálido
	180: { all: 178 }, // alfombra de musgo pálido (cross)
	181: { all: 179 } // núcleo pesado
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
