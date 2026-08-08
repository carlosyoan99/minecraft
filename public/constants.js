// ============================================================
// CONSTANTES COMPARTIDAS (IDs de bloques/items, nombres, colores)
// Nota: los IDs deben mantenerse sincronizados con server.js (B e I).
// ============================================================
export const CHUNK_SIZE = 16;
export const WORLD_HEIGHT = 64;
// Ciclo día/noche del servidor (20 min como Minecraft: ~10 de día, ~10 de
// noche, con atardecer/amanecer suaves interpolados por la curva de fase).
// Mantener en sincronía con DAY_CYCLE_MS de server-side constants.js — el
// cliente lo usa para extrapolar la fase visual del ciclo desde el dayTime
// del init.
export const DAY_CYCLE_MS = 1200000;
// Fase 8 (B8): ciclo de fases lunares — 8 días de juego por ciclo completo,
// derivado del MISMO reloj del mundo (dayTime) + offset de semilla. Mantener
// en sincronía con MOON_DAYS/MOON_CYCLE_MS de server-side constants.js — lo
// verifica tests/unit-sync.js.
export const MOON_DAYS = 8;
export const MOON_CYCLE_MS = DAY_CYCLE_MS * MOON_DAYS;
// Física del movimiento (Fase 8, mejora anti-cheat): paridad con server-side
// constants.js — el servidor valida el ascenso contra la parábola del salto
// (JUMP_SPEED·dt − GRAVITY·dt²/2) y calcula daño de caída por velocidad
// vertical inferida (h = v²/(2·GRAVITY)). Lo verifica tests/unit-sync.js.
export const JUMP_SPEED = 7; // bloques/s de velocidad vertical inicial del salto
export const GRAVITY = 18; // bloques/s² de gravedad (caída libre)

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
	25: 0xe25822, // lava (Fase 7)
	26: 0x8a5a2b, // tierra arada (Fase 9, C)
	27: 0x6fbf3a, // trigo (Fase 9, C)
	28: 0xd9c9a0, // tronco de abedul (Fase 9, F)
	29: 0x9fd44f, // hojas de abedul (Fase 9, F)
	30: 0x4a3320, // tronco de pino (Fase 9, F)
	31: 0x2f5d2a, // hojas de pino (Fase 9, F)
	32: 0x5a6f4a, // piedra de musgo (Fase 9, F)
	33: 0x4a9e2f, // hierba alta (Fase 9, F)
	34: 0xd92626, // amapola (Fase 9, F)
	35: 0xe8d21a, // diente de león (Fase 9, F)
	36: 0xc0392b, // lana roja (Fase 9, F)
	37: 0xe8c547, // lana amarilla (Fase 9, F)
	38: 0xf5f5f0, // lana blanca (Fase 9, F)
	39: 0x8a8a88, // grava (Fase 10, D1): tono apagado, distinto de la piedra
	40: 0xd43d2a, // TNT (Fase 10, D2): rojo explosivo
	// Fase 11 (Bloque B): bloques de los biomas nuevos
	41: 0x7a4a1f, // tronco de jungla (marrón oscuro tropical)
	42: 0x2f7a2a, // hojas de jungla (verde denso)
	43: 0x3f8f3a // liana (verde colgante)
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
	25: "Lava", // Fase 7
	26: "Tierra arada", // Fase 9 (C)
	27: "Trigo", // Fase 9 (C)
	28: "Tronco de abedul", // Fase 9 (F)
	29: "Hojas de abedul", // Fase 9 (F)
	30: "Tronco de pino", // Fase 9 (F)
	31: "Hojas de pino", // Fase 9 (F)
	32: "Piedra de musgo", // Fase 9 (F)
	33: "Hierba alta", // Fase 9 (F)
	34: "Amapola", // Fase 9 (F)
	35: "Diente de león", // Fase 9 (F)
	36: "Lana roja", // Fase 9 (F)
	37: "Lana amarilla", // Fase 9 (F)
	38: "Lana blanca", // Fase 9 (F)
	39: "Grava", // Fase 10 (D1): con gravedad
	40: "TNT", // Fase 10 (D2): explota al activarse
	// Fase 11 (Bloque B): biomas nuevos
	41: "Tronco de jungla", // jungla
	42: "Hojas de jungla", // jungla
	43: "Liana" // jungla/pantano (no sólida, decorativa)
};
export const WATER = 20;
export const SAND = 6; // Fase 10: paridad con server/constants.js (contexto musical por bioma)
export const SNOW = 21;
export const CHEST = 22;
export const TORCH = 23;
export const BED = 24; // Fase 7: dormir de noche fija el punto de reaparición
export const LAVA = 25; // Fase 7: pozos decorativos en superficie (no minable)
export const FARMLAND = 26; // Fase 9 (C): tierra arada
export const WHEAT = 27; // Fase 9 (C): cultivo de trigo (no sólido)
export const BIRCH_LOG = 28; // Fase 9 (F)
export const BIRCH_LEAVES = 29;
export const SPRUCE_LOG = 30;
export const SPRUCE_LEAVES = 31;
export const MOSSY_COBBLESTONE = 32; // Fase 9 (F)
export const TALL_GRASS = 33;
export const POPPY = 34;
export const DANDELION = 35;
export const RED_WOOL = 36; // Fase 9 (F): lana tintada (ítems tintables)
export const YELLOW_WOOL = 37;
export const WHITE_WOOL = 38;
export const GRAVEL = 39; // Fase 10 (D1): con gravedad (cae sin soporte)
export const TNT = 40; // Fase 10 (D2): explota al activarse (clic derecho)
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
	219: 1562,
	240: 60, // azadas (Fase 9, C): misma durabilidad que la herramienta del material
	241: 132,
	242: 251,
	243: 33,
	244: 1562
};
export const XP_PER_LEVEL = 100; // retrocompat: paridad auditada (unit-sync); la curva real usa xpToNext
// Curva de XP estilo Minecraft (Fase 9, C): coste del nivel `level` al
// siguiente (7, 10, 14, 17, 21...). PARIDAD con server-side constants.js —
// lo verifica tests/unit-sync.js.
export function xpToNext(level) {
	return 7 + Math.floor(level * 3.5);
}
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
	133: "Pan", // Fase 9 (F)
	134: "Pescado crudo", // Fase 9 (F)
	135: "Pescado cocinado", // Fase 9 (F)
	136: "Hueso", // Fase 9 (F): drop del esqueleto
	137: "Tinte rojo", // Fase 9 (F): de la amapola
	138: "Tinte amarillo", // Fase 9 (F): del diente de león
	139: "Harina de hueso", // Fase 9 (F): de hueso (tinte blanco)
	140: "Miel", // Fase 9 (F): botín de cofres
	141: "Tijeras", // Fase 11 (C): esquilan ovejas
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
	219: "Espada de diamante",
	240: "Azada de madera", // Fase 9 (C)
	241: "Azada de piedra",
	242: "Azada de hierro",
	243: "Azada de oro",
	244: "Azada de diamante"
};
export function itemLabel(id) {
	return BLOCK_NAMES[id] || ITEM_NAMES[id] || `#${id}`;
}

export const PLACEABLE_BLOCKS = new Set([
	1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 18, 21, 22, 23, 24,
	// Fase 9 (F): bloques nuevos colocables
	28, 29, 30, 31, 32, 36, 37, 38,
	// Fase 10 (D1/D2): grava y TNT
	39, 40,
	// Fase 11 (Bloque B): jungla y lianas
	41, 42, 43
]);
// Bloques NO sólidos que se rompen al instante (plantas y cultivos, Fase 9).
export const NON_SOLID_PLANTS = new Set([27, 33, 34, 35, 43]); // 43 = lianas (Fase 11, B)
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
// Fase 9 (F): pan y pescado (crudo/cocinado).
export const FOOD_ITEMS = new Set([
	107, 108, 109, 110, 111, 112, 113, 114, 118, 119, 133, 134, 135
]);
// Azadas (Fase 9, C): convierten tierra/césped en tierra arada (clic derecho).
export const HOES = new Set([240, 241, 242, 243, 244]);
// Ítems de cría de animales: clic derecho sobre un animal con estos en mano
// (trigo → vaca/oveja, zanahoria → cerdo, semillas → pollo)
export const BREED_FOOD = new Set([115, 116, 117]);
