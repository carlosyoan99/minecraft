// ============================================================
// CONSTANTES COMPARTIDAS (IDs de bloques/items, nombres, colores)
// Nota: los IDs deben mantenerse sincronizados con server.js (B e I).
// ============================================================
export const CHUNK_SIZE = 16;
// Fase 15 (D5): mundo de 128 bloques, Y ∈ [−64, +63] (terreno anclado en 0).
// Mantener en sincronía con server-side constants.js (lo audita unit-sync.js).
export const WORLD_HEIGHT = 128;
export const WORLD_MIN_Y = -64;
export const WORLD_MAX_Y = WORLD_MIN_Y + WORLD_HEIGHT - 1; // 63
// Ciclo día/noche del servidor (20 min como Minecraft: ~10 de día, ~10 de
// noche, con atardecer/amanecer suaves interpolados por la curva de fase).
// Mantener en sincronía con DAY_CYCLE_MS de server-side constants.js — el
// cliente lo usa para extrapolar la fase visual del ciclo desde el dayTime
// del init.
export const DAY_CYCLE_MS = 1200000;
// Fase 18 (C-1): franjas del ciclo día/noche estilo MC (20 min = día 10 /
// atardecer 1,5 / noche 7 / amanecer 1,5), expresadas como fracción del
// ciclo (fase 0 = amanecer). Mantener en sincronía con DAY_PHASES de
// server-side constants.js — lo audita tests/unit-sync.js y lo usan los
// helpers puros de public/daymath.js (segmentOf/isNightPhase).
export const DAY_PHASES = {
	dawnEnd: 0.075, // fin del amanecer (1,5 min) → empieza el día
	dayEnd: 0.575, // fin del día (10 min) → empieza el atardecer
	duskEnd: 0.65 // fin del atardecer (1,5 min) → empieza la noche (7 min)
};
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
export const MAX_STACK = 64; // tope de apilamiento de ítems (paridad MC; SV-5)

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
	43: 0x3f8f3a, // liana (verde colgante)
	// Fase 13 (L2/L3): puertas (48/49), escaleras (50/51), losas (60/61),
	// valla (70) y portón (71) — colores para el LOD/fallback
	48: 0x8a6a3a,
	49: 0x9a9a9a,
	50: 0x8a6a3a,
	51: 0x7a7a7a,
	60: 0x8a6a3a,
	61: 0x7a7a7a,
	70: 0x8a6a3a,
	71: 0x8a6a3a,
	72: 0xe86a5e, // coral (Fase 21.5, D2): rosa coral del arrecife cálido
	// Fase 21.5 (C4): 16 camas de colores — tonos de la lana de MC
	44: 0xf5f5f0, // cama blanca
	45: 0xe88a2a, // cama naranja
	46: 0xc93ac9, // cama magenta
	47: 0x5a8ad9, // cama azul claro
	52: 0xe8d21a, // cama amarilla
	53: 0x6fd93a, // cama verde lima
	54: 0xe88ab0, // cama rosa
	55: 0x8a8a8a, // cama gris
	56: 0xc0c0c0, // cama gris claro
	57: 0x2ab8c9, // cama cian
	58: 0x7a3ac9, // cama púrpura
	59: 0x3a5ac9, // cama azul
	62: 0x8a5a3a, // cama marrón
	63: 0x3a9a3a, // cama verde
	64: 0xc0392b, // cama roja
	65: 0x2a2a2a, // cama negra
	// Fase 21.5 (E2/E4): lana nueva — gris (66), negra (89), marrón (90)
	66: 0x8a8a88, // lana gris
	89: 0x2a2a2a, // lana negra
	90: 0x8a5a3a, // lana marrón
	// Fase 21.5 (B1): piedra pulida — granito rosa, diorita gris/blanca,
	// andesita gris apagado y sus pulidas (tonos más regulares).
	73: 0xc9917f,
	74: 0xc9c9c9,
	75: 0x8f8f8f,
	76: 0xc9917f,
	77: 0xc9c9c9,
	78: 0x8f8f8f,
	// Fase 21.5 (B2): linterna — marco de hierro con vidrio y llama cálida.
	79: 0xa87a2f,
	// Fase 21.5 (B3): bambú (verde caña), tablones (amarillo pálido) y
	// andamio (estructura naranja).
	80: 0x4a9c2f,
	81: 0xc9b33a,
	82: 0xc97a2f,
	// Fase 21.5 (B4): nido de abeja (marrón), colmena (amarillo oscuro) y
	// bloque de miel (ámbar).
	83: 0x8a5a2a,
	84: 0xc97a20,
	85: 0xefa83a,
	// Fase 21.5 (B5): abanico de coral (naranja), kelp (verde oscuro) y pasto
	// marino (verde).
	86: 0xf08040,
	87: 0x2f7a30,
	88: 0x3a8f3a,
	// Fase 21.5 (C1): horno de fundición — piedra oscura con reja naranja
	91: 0x5a4a3a,
	// Fase 21.5 (E3): bloques decorativos — tonos de naturaleza
	92: 0x4a6a2a, // arbusto de luciérnagas (verde oscuro)
	93: 0x6a8a3a, // hojarasca (verde otoñal)
	94: 0xc9a040, // flores silvestres (amarillo/dorado)
	95: 0x3a7a2a, // arbusto genérico (verde)
	96: 0xb8a868, // hierba seca corta (paja)
	97: 0xa89858, // hierba seca alta (paja oscura)
	98: 0xe85a6a, // flor de cactus (rosa)
	// Fase 21.5 (C5): concreto (142-157) — colores MC oficiales.
	// Los IDs evitan el rango 100-277 (ítems: el namespace es compartido).
	142: 0xf0f0f0,
	143: 0xe87a2a,
	144: 0xc93ac9,
	145: 0x5a8ad9,
	146: 0xe8d21a,
	147: 0x6fd93a,
	148: 0xe88ab0,
	149: 0x8a8a8a,
	150: 0xc0c0c0,
	151: 0x2ab8c9,
	152: 0x7a3ac9,
	153: 0x3a5ac9,
	154: 0x8a5a3a,
	155: 0x3a9a3a,
	156: 0xc0392b,
	157: 0x2a2a2a,
	// Fase 21.5 (C5): polvo de concreto (158-173) — tonos más claros
	158: 0xf8f8f8,
	159: 0xf0a050,
	160: 0xd86ad8,
	161: 0x88b8e8,
	162: 0xf0e060,
	163: 0x98e870,
	164: 0xf0b8c8,
	165: 0xb0b0b0,
	166: 0xd0d0d0,
	167: 0x60d0d8,
	168: 0x9868d8,
	169: 0x6888d8,
	170: 0xa87850,
	171: 0x68b860,
	172: 0xd86050,
	173: 0x4a4a4a,
	// Fase 21.5 (D1/F1/F3/D3): bloques prospectivos
	174: 0x6a6a7a, // vault
	175: 0x8a6a40, // creaking heart
	176: 0x9a8a7a, // pale oak log
	177: 0x8aaa7a, // pale oak leaves
	178: 0xb8a88a, // pale oak planks
	179: 0x7a9a6a, // pale moss block
	180: 0x6a8a5a, // pale moss
	181: 0x5a5a6a, // heavy core
	// Fase 21.5 (D4): familia de cobre (naranja cobrizo) y tuff (gris)
	182: 0xea7a5a, // bloque de cobre
	183: 0xea7a5a, // escaleras de cobre
	184: 0xea7a5a, // losa de cobre
	185: 0xc95a3a, // puerta de cobre (tono más oscuro, metálico)
	186: 0x8f8f8f, // tuff
	187: 0xa8a8a8, // tuff pulido
	188: 0xb8b0a8, // ladrillos de tuff
	// Fase 21.5 (D6): jukebox (marrón oscuro, como cofre), pintura (marco
	// colorido), note block (marrón con parche).
	189: 0x7c5a3c, // jukebox
	190: 0xd8d0c0, // pintura (lienzo base)
	191: 0x8b6b4a // note block
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
	43: "Liana", // jungla/pantano (no sólida, decorativa)
	// Fase 13 (L2/L3): puertas, escaleras, losas y vallas
	48: "Puerta de roble",
	49: "Puerta de hierro",
	50: "Escaleras de roble",
	51: "Escaleras de piedra",
	60: "Losa de roble",
	61: "Losa de piedra",
	70: "Valla de roble",
	71: "Portón de roble",
	72: "Coral", // Fase 21.5 (D2): arrecife de océano cálido
	// Fase 21.5 (B1): piedra pulida
	73: "Granito",
	74: "Diorita",
	75: "Andesita",
	76: "Granito pulido",
	77: "Diorita pulida",
	78: "Andesita pulida",
	// Fase 21.5 (B2): linterna
	79: "Linterna",
	// Fase 21.5 (B3): bambú y andamios
	80: "Bambú",
	81: "Tablones de bambú",
	82: "Andamio",
	// Fase 21.5 (B4): colmenas y miel
	83: "Nido de abeja",
	84: "Colmena",
	85: "Bloque de miel",
	// Fase 21.5 (B5): coral y algas
	86: "Abanico de coral",
	87: "Kelp",
	88: "Pasto marino",
	// Fase 21.5 (C4): 16 camas de colores
	44: "Cama blanca",
	45: "Cama naranja",
	46: "Cama magenta",
	47: "Cama azul claro",
	52: "Cama amarilla",
	53: "Cama verde lima",
	54: "Cama rosa",
	55: "Cama gris",
	56: "Cama gris claro",
	57: "Cama cian",
	58: "Cama púrpura",
	59: "Cama azul",
	62: "Cama marrón",
	63: "Cama verde",
	64: "Cama roja",
	65: "Cama negra",
	// Fase 21.5 (E2): lana nueva
	66: "Lana gris",
	89: "Lana negra",
	90: "Lana marrón",
	// Fase 21.5 (C1): horno de fundición
	91: "Horno de fundición",
	// Fase 21.5 (E3): bloques decorativos
	92: "Arbusto de luciérnagas",
	93: "Hojarasca",
	94: "Flores silvestres",
	95: "Arbusto",
	96: "Hierba seca",
	97: "Hierba seca alta",
	98: "Flor de cactus",
	// Fase 21.5 (C5): concreto (142-157)
	142: "Concreto blanco",
	143: "Concreto naranja",
	144: "Concreto magenta",
	145: "Concreto azul claro",
	146: "Concreto amarillo",
	147: "Concreto verde lima",
	148: "Concreto rosa",
	149: "Concreto gris",
	150: "Concreto gris claro",
	151: "Concreto cian",
	152: "Concreto púrpura",
	153: "Concreto azul",
	154: "Concreto marrón",
	155: "Concreto verde",
	156: "Concreto rojo",
	157: "Concreto negro",
	// Fase 21.5 (C5): polvo de concreto (158-173)
	158: "Polvo de concreto blanco",
	159: "Polvo de concreto naranja",
	160: "Polvo de concreto magenta",
	161: "Polvo de concreto azul claro",
	162: "Polvo de concreto amarillo",
	163: "Polvo de concreto verde lima",
	164: "Polvo de concreto rosa",
	165: "Polvo de concreto gris",
	166: "Polvo de concreto gris claro",
	167: "Polvo de concreto cian",
	168: "Polvo de concreto púrpura",
	169: "Polvo de concreto azul",
	170: "Polvo de concreto marrón",
	171: "Polvo de concreto verde",
	172: "Polvo de concreto rojo",
	173: "Polvo de concreto negro",
	// Fase 21.5 (D1/F1/F3/D3): bloques prospectivos
	174: "Bóveda",
	175: "Corazón crujiente",
	176: "Tronco de roble pálido",
	177: "Hojas de roble pálido",
	178: "Tablones de roble pálido",
	179: "Bloque de musgo pálido",
	180: "Musgo pálido",
	181: "Núcleo pesado",
	// Fase 21.5 (D4): familia de cobre y tuff (1.21)
	182: "Bloque de cobre",
	183: "Escaleras de cobre",
	184: "Losa de cobre",
	185: "Puerta de cobre",
	186: "Tuff",
	187: "Tuff pulido",
	188: "Ladrillos de tuff",
	// Fase 21.5 (D6): jukebox, pintura, note block.
	189: "Jukebox",
	190: "Pintura",
	191: "Note Block"
};
export const WATER = 20;
export const SAND = 6; // Fase 10: paridad con server/constants.js (contexto musical por bioma)
export const SNOW = 21;
export const CHEST = 22;
export const TORCH = 23;
// Fase 21.5 (B2): linterna — emisora de luz como la antorcha (cuelga del
// techo o se apoya en el suelo; no sólida).
export const LANTERN = 79;
// Fase 21.5 (B3): bambú (planta alta), tablones y andamio (no sólido).
export const BAMBOO = 80;
export const BAMBOO_PLANKS = 81;
export const SCAFFOLDING = 82;
// Fase 21.5 (B4): colmenas y miel.
export const BEE_NEST = 83;
export const BEE_HIVE = 84;
export const HONEY_BLOCK = 85;
// Fase 21.5 (B5): coral y algas.
export const CORAL_FAN = 86;
export const KELP = 87;
export const SEAGRASS = 88;
// Fase 21.5 (E2): lana nueva
export const GRAY_WOOL = 66;
export const BLACK_WOOL = 89;
export const BROWN_WOOL = 90;
// Fase 21.5 (C4): 16 camas de colores
export const BED_WHITE = 44;
export const BED_ORANGE = 45;
export const BED_MAGENTA = 46;
export const BED_LIGHT_BLUE = 47;
export const BED_YELLOW = 52;
export const BED_LIME = 53;
export const BED_PINK = 54;
export const BED_GRAY = 55;
export const BED_LIGHT_GRAY = 56;
export const BED_CYAN = 57;
export const BED_PURPLE = 58;
export const BED_BLUE = 59;
export const BED_BROWN = 62;
export const BED_GREEN = 63;
export const BED_RED = 64;
export const BED_BLACK = 65;
// Fase 21.5 (C1): horno de fundición
export const BLAST_FURNACE = 91;
// Fase 21.5 (E3): bloques decorativos
export const FIREFLY_BUSH = 92;
export const LEAF_LITTER = 93;
export const WILDFLOWERS = 94;
export const BUSH = 95;
export const SHORT_DRY_GRASS = 96;
export const TALL_DRY_GRASS = 97;
export const CACTUS_FLOWER = 98;
export const BED = 24; // Fase 7: dormir de noche fija el punto de reaparición
// Fase 21.5 (C4): set de todas las camas (24 + 16 colores 44-65).
export const BED_SET = new Set([
	24, 44, 45, 46, 47, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63, 64, 65
]);
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
	200: 59,
	201: 131,
	202: 250,
	203: 32,
	204: 1561,
	205: 59,
	206: 131,
	207: 250,
	208: 32,
	209: 1561,
	210: 59,
	211: 131,
	212: 250,
	213: 32,
	214: 1561,
	215: 59,
	216: 131,
	217: 250,
	218: 32,
	219: 1561,
	240: 59, // azadas (Fase 9, C): misma durabilidad que la herramienta del material
	241: 131,
	242: 250,
	243: 32,
	244: 1561,
	141: 238, // tijeras (auditoría 4.2): durabilidad MC 238, no se apilan
	272: 250 // Fase 21.5 (D3): maza (1.21) — durabilidad media de MC
};
export const XP_PER_LEVEL = 100; // retrocompat: paridad auditada (unit-sync); la curva real usa xpToNext
// Curva de XP OFICIAL de Minecraft (Fase 13, paridad B2): coste del nivel
// `level` al siguiente por tramos — 2L+7 (0-15), 5L−38 (16-30), 9L−158
// (31+): 7, 9, 11, 13... 37, 42, 47... 112, 121... PARIDAD con server-side
// constants.js — lo verifica tests/unit-sync.js.
export function xpToNext(level) {
	if (level < 16) return 2 * level + 7;
	if (level < 31) return 5 * level - 38;
	return 9 * level - 158;
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
	// Fase 18 (C-3): patata y patata al horno (comida nueva)
	121: "Patata", // cruda — se cocina al horno
	122: "Patata al horno", // horno: patata → patata al horno
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
	232: "Casco de oro",
	233: "Pechera de oro",
	234: "Pantalones de oro",
	235: "Botas de oro",
	236: "Casco de malla",
	237: "Pechera de malla",
	238: "Pantalones de malla",
	239: "Botas de malla",
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
	244: "Azada de diamante",
	// Fase 12 (Bloque A): ítems de los mobs por bioma
	245: "Tridente", // drop del ahogado; arma arrojadiza (clic derecho lanza)
	246: "Bola de slime", // drop del slime pequeño
	// Fase 13 (L1): arco y flechas del jugador + materiales
	247: "Arco", // dispara flechas (clic derecho), durabilidad 384
	248: "Flecha", // consumible del arco; drop del esqueleto y recogible
	// Fase 13 (L4): cubo de líquidos
	249: "Cubo", // vacío: recoge agua/lava de una fuente (clic derecho)
	250: "Cubo de agua", // lleno: vierte agua (clic derecho)
	251: "Cubo de lava", // lleno: vierte lava (clic derecho)
	252: "Pedernal", // ~10% de la grava; material de las flechas
	253: "Pluma", // drop del pollo; material de las flechas
	254: "Compás", // Fase 13 (L5): 4 lingotes de hierro + redstone
	255: "Carne podrida", // Fase 16 (D2): drop del zombi
	256: "Pólvora", // Fase 16 (D2): drop del creeper; material del TNT
	257: "Carbón vegetal", // Fase 18 (C-4): tronco al horno (ítem distinto del carbón)
	// Fase 20 B3: mena cruda de hierro/oro — se mina así y se funde al lingote
	// (paridad MC 1.17 restaurada). Sincronizados con server/constants.js.
	258: "Hierro crudo",
	259: "Oro crudo",
	// Fase 21 (C1): leche (ordeñar la vaca) y huevo (pone la gallina)
	260: "Leche",
	261: "Huevo",
	// Fase 21.5 (A1): caña de pescar (clic derecho lanza/recoge, durabilidad 64)
	262: "Caña de pescar",
	// Fase 21.5 (B4): botella de vidrio y botella de miel
	263: "Botella de vidrio",
	264: "Botella de miel",
	// Fase 21.5 (C2): escudo (clic derecho mantenido bloquea y reduce el daño)
	265: "Escudo",
	// Fase 21.5 (C3): tótem de la inmortalidad (evita la muerte con él en mano)
	269: "Tótem de la inmortalidad",
	// Fase 21.5 (C4): tintes nuevos para camas
	266: "Tinte negro",
	267: "Tinte marrón",
	268: "Tinte gris",
	// Fase 21.5 (D5): ítems de Trial/Breeze
	270: "Carga de viento",
	271: "Barra de breeze",
	272: "Maza",
	273: "Mapa de exploración de prueba",
	// Fase 21.5 (F4): mochila
	274: "Mochila",
	// Fase 21.5 (D6): discos y pintura
	275: "Disco musical (cat)",
	276: "Disco musical (13)",
	277: "Pintura"
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
	41, 42, 43,
	// Fase 13 (L2/L3): puertas, escaleras, losas, vallas y portones
	48, 49, 50, 51, 60, 61, 70, 71,
	// Fase 21.5 (D2): coral del arrecife cálido
	72,
	// Fase 21.5 (B1/B2): piedra pulida (73-78), linterna (79)
	73, 74, 75, 76, 77, 78, 79,
	// Fase 21.5 (B3): bambú (80, planta alta cross-quad), tablones (81) y
	// andamio (82).
	80, 81, 82,
	// Fase 21.5 (B4): nidos, colmenas y bloque de miel.
	83, 84, 85,
	// Fase 21.5 (B5): coral y algas.
	86, 87, 88,
	// Fase 21.5 (C4): camas de colores
	44, 45, 46, 47, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63, 64, 65,
	// Fase 21.5 (E2): lana nueva
	66, 89, 90,
	// Fase 21.5 (C1): horno de fundición
	91,
	// Fase 21.5 (E3): bloques decorativos (cross-quad, no sólidos)
	92, 93, 94, 95, 96, 97, 98,
	// Fase 21.5 (C5): concreto sólido (142-157) y polvo (158-173).
	142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156,
	157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171,
	172, 173,
	// Fase 21.5 (D1/D3/F1/F3): bóveda, núcleo pesado y Pale Garden.
	174, 175, 176, 177, 178, 179, 180, 181,
	// Fase 21.5 (D4): familia de cobre y tuff (1.21)
	182, 183, 184, 185, 186, 187, 188
]);
// Bloques NO sólidos que se rompen al instante (plantas y cultivos, Fase 9).
// Fase 21.5 (B3): bambú (planta alta) y andamio (no sólido, escalable).
// Fase 21.5 (B5): coral y algas bajo el agua (cross-quad).
export const NON_SOLID_PLANTS = new Set([
	27, 33, 34, 35, 43, 80, 82, 86, 87, 88, 92, 93, 94, 95, 96, 97, 98, 180
]); // 27/33/34/35/43 = flores/hierba/lianas (Fase 9/11); 180 = musgo pálido (F1)
// Armadura equipable (Fase 7): clic derecho con la pieza en mano la equipa.
// No se apilan (cada pieza con su durabilidad, como las herramientas).
export const ARMOR_ITEMS = new Set([
	220,
	221,
	222,
	223,
	224,
	225,
	226,
	227,
	228,
	229,
	230,
	231,
	232,
	233,
	234,
	235,
	236,
	237,
	238,
	239 // oro y malla (Fase 13, L5)
]);
// Arco (Fase 13, L1): herramienta con durabilidad propia que no se apila.
export const BOW = 247;
export const ARROW = 248;
// Fase 13 (L4): cubo de líquidos.
export const BUCKET = 249;
export const WATER_BUCKET = 250;
export const LAVA_BUCKET = 251;
export const FLINT = 252;
export const FEATHER = 253;
export const COMPASS = 254;
export const ROTTEN_FLESH = 255; // Fase 16 (D2): drop del zombi
export const GUNPOWDER = 256; // Fase 16 (D2): drop del creeper + receta TNT
export const CHARCOAL = 257; // Fase 18 (C-4): tronco al horno (ítem distinto del carbón)
export const RAW_IRON = 258; // Fase 20 B3: mena cruda — se funde al lingote
export const RAW_GOLD = 259; // Fase 20 B3
// Fase 21 (C1): leche (ordeñar la vaca) y huevo (pone la gallina)
export const MILK = 260;
export const EGG = 261;
// Fase 21.5 (A1): caña de pescar (herramienta con durabilidad propia, no se
// apila). Mantener en sincronía con FISHING_ROD_DURABILITY del servidor
// (unit-sync lo verifica).
export const FISHING_ROD = 262;
// Fase 21.5 (B4): botella de vidrio y botella de miel.
export const GLASS_BOTTLE = 263;
export const HONEY_BOTTLE = 264;
// Fase 21.5 (C2): escudo (1.9) — sin off-hand: en la mano activa, clic derecho
// mantiene el bloqueo. No se apila, lleva durabilidad propia. Mantener en
// sincronía con SHIELD_DURABILITY del servidor (unit-sync lo verifica).
export const SHIELD = 265;
// Fase 21.5 (C3): tótem de la inmortalidad (1.11) — no se apila, sin receta
// (solo loot de cofres). Al recibir daño letal con él en la mano activa evita
// la muerte, cura mitad de la vida y da absorción; se consume.
export const TOTEM_OF_UNDYING = 269;
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
	231: 429,
	232: 77,
	233: 112,
	234: 105,
	235: 91,
	236: 165,
	237: 240,
	238: 225,
	239: 195
};
// Durabilidad del arco (Fase 13, L1): paridad con server/constants.js
// (BOW_DURABILITY, 384). El arco no está en DURABILITY (no se desgasta al
// minar — solo al disparar); el HUD usa BOW_DURABILITY para su barra.
export const BOW_DURABILITY = 384;
// Fase 21.5 (A1): durabilidad de la caña de pescar (paridad MC, 64). Al
// igual que el arco, NO está en DURABILITY: no se desgasta al minar/atacar
// (solo al recoger un pez); el HUD usa FISHING_ROD_DURABILITY para su barra.
export const FISHING_ROD_DURABILITY = 64;
// Fase 21.5 (C2): durabilidad del escudo (paridad MC Java, 336). Al igual
// que arco/caña, NO está en DURABILITY: no se desgasta al minar/atacar
// (solo al absorber un impacto bloqueado); el HUD usa SHIELD_DURABILITY.
export const SHIELD_DURABILITY = 336;
// Fase 21.5 (F4): mochila (Bundle, 1.22) — ítem que abre un inventario portátil.
export const BUNDLE = 274;
// Fase 21.5 (D6): bloques de audio/visual.
export const JUKEBOX = 189;
export const PAINTING_BLOCK = 190;
export const NOTE_BLOCK = 191;
export const MUSIC_DISC_CAT = 275;
export const MUSIC_DISC_13 = 276;
// Orden de los slots de armadura (indice del slot = (id - 220) % 4)
export const ARMOR_SLOT_NAMES = ["helmet", "chestplate", "leggings", "boots"];
// Ítems que se pueden comer con clic derecho (cruda 107-110 y cocinada 111-114)
// Fase 9 (F): pan y pescado (crudo/cocinado).
// Fase 18 (C-3): zanahoria (116) y patata (121/122) ahora son comida.
// Fase 21.5 (B4): botella de miel (264).
// OJO: este Set se parsea con regex en unit-sync — sin comentarios dentro.
export const FOOD_ITEMS = new Set([
	107, 108, 109, 110, 111, 112, 113, 114, 118, 119, 133, 134, 135, 116, 121,
	122, 264
]);
// Azadas (Fase 9, C): convierten tierra/césped en tierra arada (clic derecho).
export const HOES = new Set([240, 241, 242, 243, 244]);
// Ítems de cría de animales: clic derecho sobre un animal con estos en mano
// (trigo → vaca/oveja, zanahoria → cerdo, semillas → pollo)
export const BREED_FOOD = new Set([115, 116, 117]);
