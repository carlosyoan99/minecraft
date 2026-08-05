// ============================================================
// CONSTANTES COMPARTIDAS (IDs de bloques/items, nombres, colores)
// Nota: los IDs deben mantenerse sincronizados con server.js (B e I).
// ============================================================
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
// Ciclo día/noche del servidor (4 min: 2 de día, 2 de noche). Mantener en
// sincronía con DAY_CYCLE_MS de server-side constants.js — el cliente lo usa
// para extrapolar la fase visual del ciclo desde el dayTime del init.
export const DAY_CYCLE_MS = 240000;

export const BLOCK_COLORS = {
	1: 0x8b5a2b,
	2: 0x5fbf3a,
	3: 0x8a8a8a,
	4: 0x6b4a2b,
	5: 0x3a7a2e,
	6: 0xe0c88a,
	7: 0xc9a46b,
	8: 0x6f6f6f,
	9: 0x33393d,
	10: 0xb08968,
	11: 0xe8c547,
	12: 0x7fffee,
	13: 0xb22222,
	14: 0x22c97a,
	15: 0x8b5a2b,
	16: 0x555555,
	17: 0xbee7f0,
	18: 0xf5f5f0,
	19: 0x1a1a1a,
	20: 0x3a6fd8,
	21: 0xe8f4f8,
	22: 0xc9a46b,
	23: 0xffb347,
	24: 0xc0392b, // cama (Fase 7)
	25: 0xe25822 // lava (Fase 7)
};
export const BLOCK_NAMES = {
	1: "Tierra",
	2: "Césped",
	3: "Piedra",
	4: "Tronco",
	5: "Hojas",
	6: "Arena",
	7: "Tablones",
	8: "Adoquín",
	9: "Mena de carbón",
	10: "Mena de hierro",
	11: "Mena de oro",
	12: "Mena de diamante",
	13: "Mena de redstone",
	14: "Mena de esmeralda",
	15: "Mesa de crafteo",
	16: "Horno",
	17: "Vidrio",
	18: "Lana",
	19: "Roca madre",
	20: "Agua",
	21: "Nieve",
	22: "Cofre",
	23: "Antorcha",
	24: "Cama", // Fase 7
	25: "Lava" // Fase 7
};
export const WATER = 20;
export const SNOW = 21;
export const CHEST = 22;
export const TORCH = 23;
export const BED = 24; // Fase 7: dormir de noche fija el punto de reaparición
export const LAVA = 25; // Fase 7: pozos decorativos en superficie (no minable)
// Altura del ojo del jugador (Fase 7): la posición que el cliente envía en
// `move` es la de la cámara (el ojo); el servidor la usa para el daño por
// caída. Mantener en sincronía con EYE_HEIGHT de constants.js (servidor) —
// lo verifica tests/unit-sync.js.
export const EYE_HEIGHT = 1.6;
// Durabilidad máxima por herramienta (Fase 5). Mantener en sincronía con
// TOOL_DURABILITY de constants.js (servidor) — lo verifica tests/audit-fase5.js.
export const DURABILITY = {
	200: 60,
	201: 132,
	202: 251,
	203: 33,
	204: 1562,
	205: 60,
	206: 132,
	207: 251,
	208: 33,
	209: 1562,
	210: 60,
	211: 132,
	212: 251,
	213: 33,
	214: 1562,
	215: 60,
	216: 132,
	217: 251,
	218: 33,
	219: 1562
};
export const XP_PER_LEVEL = 100; // nivel = floor(xp / 100), igual que el servidor
export const ITEM_NAMES = {
	100: "Palo",
	101: "Carbón",
	102: "Lingote de hierro",
	103: "Lingote de oro",
	104: "Diamante",
	105: "Redstone",
	106: "Esmeralda",
	107: "Carne de vaca cruda",
	108: "Chuleta de cerdo cruda",
	109: "Pollo crudo",
	110: "Cordero crudo",
	111: "Carne de vaca cocinada",
	112: "Chuleta de cerdo cocinada",
	113: "Pollo cocinado",
	114: "Cordero cocinado",
	115: "Trigo",
	116: "Zanahoria",
	117: "Semillas", // comida de cría de animales
	118: "Conejo crudo",
	119: "Conejo asado", // Fase 5: nuevo pasivo y su cocinado
	120: "Hilo", // Fase 5: drop de la araña (4 hilos → lana)
	132: "Cuero", // Fase 7: drop de la vaca/conejo, material de la armadura de cuero
	220: "Casco de cuero",
	221: "Pechera de cuero",
	222: "Pantalones de cuero",
	223: "Botas de cuero",
	224: "Casco de hierro",
	225: "Pechera de hierro",
	226: "Pantalones de hierro",
	227: "Botas de hierro",
	228: "Casco de diamante",
	229: "Pechera de diamante",
	230: "Pantalones de diamante",
	231: "Botas de diamante",
	200: "Pico de madera",
	201: "Pico de piedra",
	202: "Pico de hierro",
	203: "Pico de oro",
	204: "Pico de diamante",
	205: "Hacha de madera",
	206: "Hacha de piedra",
	207: "Hacha de hierro",
	208: "Hacha de oro",
	209: "Hacha de diamante",
	210: "Pala de madera",
	211: "Pala de piedra",
	212: "Pala de hierro",
	213: "Pala de oro",
	214: "Pala de diamante",
	215: "Espada de madera",
	216: "Espada de piedra",
	217: "Espada de hierro",
	218: "Espada de oro",
	219: "Espada de diamante"
};
export function itemLabel(id) {
	return BLOCK_NAMES[id] || ITEM_NAMES[id] || `#${id}`;
}

// Colores de la comida cruda para el swatch del hotbar
// (itemColor cae en BLOCK_COLORS[id], luego aquí, o gris por defecto)
const FOOD_COLORS = {
	107: 0xc0392b, // carne de vaca cruda
	108: 0xe67e80, // chuleta de cerdo cruda
	109: 0xf2e3c6, // pollo crudo
	110: 0xb8715b, // cordero crudo
	111: 0x8b5a2b, // carne de vaca cocinada
	112: 0xb5651d, // chuleta de cerdo cocinada
	113: 0xd9a066, // pollo cocinado
	114: 0x9c5b33 // cordero cocinado
};
// Colores de la comida de cría para el swatch del hotbar
const BREED_COLORS = {
	115: 0xe8c56a, // trigo
	116: 0xe67e22, // zanahoria
	117: 0x8b6914, // semillas
	118: 0xd9c8a8, // conejo crudo
	119: 0x9c5b33, // conejo asado
	120: 0xe8e4d0 // hilo
};
// Colores de la armadura para el swatch del hotbar y los slots (Fase 7)
const ARMOR_COLORS = {
	132: 0xb8860b, // cuero
	220: 0xc9a06b,
	221: 0xc9a06b,
	222: 0xc9a06b,
	223: 0xc9a06b, // cuero
	224: 0xc8c8c8,
	225: 0xc8c8c8,
	226: 0xc8c8c8,
	227: 0xc8c8c8, // hierro
	228: 0x7fe8d9,
	229: 0x7fe8d9,
	230: 0x7fe8d9,
	231: 0x7fe8d9 // diamante
};
export function itemColor(id) {
	return (
		BLOCK_COLORS[id] ||
		FOOD_COLORS[id] ||
		BREED_COLORS[id] ||
		ARMOR_COLORS[id] ||
		0xcccccc
	);
}
export const PLACEABLE_BLOCKS = new Set([
	1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 18, 21, 22, 23, 24
]);
// Armadura equipable (Fase 7): clic derecho con la pieza en mano la equipa.
// No se apilan (cada pieza con su durabilidad, como las herramientas).
export const ARMOR_ITEMS = new Set([
	220, 221, 222, 223, 224, 225, 226, 227, 228, 229, 230, 231
]);
// Durabilidad máxima por pieza (Fase 7). Mantener en sincronía con
// ARMOR_DURABILITY de constants.js (servidor) — lo verifica unit-sync.js.
export const ARMOR_DURABILITY = {
	220: 55,
	221: 80,
	222: 75,
	223: 65,
	224: 165,
	225: 240,
	226: 225,
	227: 195,
	228: 363,
	229: 528,
	230: 495,
	231: 429
};
// Orden de los slots de armadura (indice del slot = (id - 220) % 4)
export const ARMOR_SLOT_NAMES = ["helmet", "chestplate", "leggings", "boots"];
// Ítems que se pueden comer con clic derecho (cruda 107-110 y cocinada 111-114)
export const FOOD_ITEMS = new Set([
	107, 108, 109, 110, 111, 112, 113, 114, 118, 119
]);
// Ítems de cría de animales: clic derecho sobre un animal con estos en mano
// (trigo → vaca/oveja, zanahoria → cerdo, semillas → pollo)
export const BREED_FOOD = new Set([115, 116, 117]);
