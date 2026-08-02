'use strict';

// ============================================================
// CONFIGURACIÓN Y CONSTANTES COMPARTIDAS DEL SERVIDOR
// ============================================================
const path = require('path');

const PORT = process.env.PORT || 3000;
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 64;
const TICK_MS = 50;                 // 20 ticks por segundo
const SAVE_INTERVAL_MS = 30000;     // Guardar cada 30s
const VIEW_DISTANCE_CHUNKS = 6;     // Chunks generados alrededor de cada jugador al conectar
const UNLOAD_DISTANCE_CHUNKS = 10;  // Chunks sin jugadores a menos de esta distancia (en chunks) se descargan
const UNLOAD_INTERVAL_MS = 10000;   // Cada 10s se buscan chunks lejanos que descargar
const DAY_CYCLE_MS = 240000;        // 4 minutos: 2 de día, 2 de noche
// La semilla se configura con la env var SEED (defecto miSemilla2026).
// Cambiar la SEED genera un mundo TOTALMENTE nuevo: cada semilla tiene su
// propio directorio de mundo (world/<semilla>/), así nunca se pisan ni se
// mezclan los chunks (bug: antes reutilizaba los guardados con un warn).
const SEED = process.env.SEED || 'miSemilla2026';

// Persistencia (paths y versión del formato de guardado)
const WORLD_ROOT = path.join(__dirname, 'world');
// Nombre de directorio seguro a partir de una semilla (función pura, testeable)
function seedDir(seed) {
  return (seed || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'default';
}
const WORLD_DIR = path.join(WORLD_ROOT, seedDir(SEED));
const CHUNKS_DIR = path.join(WORLD_DIR, 'chunks');
const SCHEMA_VERSION = 2;           // versión actual del formato de guardado
const LEGACY_FILE = path.join(WORLD_DIR, 'world.dat');
const META_FILE = path.join(WORLD_DIR, 'world.json');
// Layout antiguo (v2 pre-semilla, todo en la raíz de world/) que se migra al
// directorio de la semilla al arrancar (save.migrateWorldLayout()).
const LEGACY_ROOT_FILES = ['world.json', 'chunks', 'world.dat', 'world.dat.legacy'];
// Historial de formatos:
//   v1 — world/world.dat (un solo JSON: seed, chunks, mobs, furnaces)
//   v2 — world/chunks/*.json + world/world.json (incremental por chunk)
//   v3 — world/<semilla>/chunks + world/<semilla>/world.json (un mundo por semilla)
// Migraciones: v1 → v2 migrateLegacyWorld() · layout raíz → por semilla migrateWorldLayout()

// ============================================================
// BLOQUES E ÍTEMS (fuente de verdad de IDs; sincronizar con public/constants.js)
// ============================================================
const B = {
  AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, OAK_LOG: 4, OAK_LEAVES: 5,
  SAND: 6, PLANKS: 7, COBBLESTONE: 8, COAL_ORE: 9, IRON_ORE: 10,
  GOLD_ORE: 11, DIAMOND_ORE: 12, REDSTONE_ORE: 13, EMERALD_ORE: 14,
  CRAFTING_TABLE: 15, FURNACE: 16, GLASS: 17, WOOL: 18, BEDROCK: 19,
  WATER: 20, // no sólido: se puede nadar (Fase 4)
  SNOW: 21,  // superficie de tundra y cumbres de montaña (Fase 4)
};
const I = {
  STICK: 100, COAL: 101, IRON_INGOT: 102, GOLD_INGOT: 103, DIAMOND: 104,
  REDSTONE: 105, EMERALD: 106,
  BEEF: 107, PORKCHOP: 108, CHICKEN: 109, MUTTON: 110, // comida cruda (se cocina en el horno)
  COOKED_BEEF: 111, COOKED_PORKCHOP: 112, COOKED_CHICKEN: 113, COOKED_MUTTON: 114, // comida cocinada
  WHEAT: 115, CARROT: 116, SEEDS: 117, // comida de cría de animales (se obtiene de la hierba)
  RABBIT: 118, COOKED_RABBIT: 119, // conejo crudo (Fase 5: nuevo pasivo) y asado
  STRING: 120, // hilo: drop de la araña (Fase 5)
  WOODEN_PICKAXE: 200, STONE_PICKAXE: 201, IRON_PICKAXE: 202, GOLDEN_PICKAXE: 203, DIAMOND_PICKAXE: 204,
  WOODEN_AXE: 205, STONE_AXE: 206, IRON_AXE: 207, GOLDEN_AXE: 208, DIAMOND_AXE: 209,
  WOODEN_SHOVEL: 210, STONE_SHOVEL: 211, IRON_SHOVEL: 212, GOLDEN_SHOVEL: 213, DIAMOND_SHOVEL: 214,
  WOODEN_SWORD: 215, STONE_SWORD: 216, IRON_SWORD: 217, GOLDEN_SWORD: 218, DIAMOND_SWORD: 219,
};
const NOT_MINEABLE = new Set([B.AIR, B.BEDROCK, B.WATER]); // el agua no se puede romper a mano (sin cubo)
// Sólido para física/validación: el agua no es sólida (se nada en ella).
const isSolidBlock = (id) => id !== B.AIR && id !== B.WATER;
const FUEL_ITEMS = new Set([B.OAK_LOG, B.PLANKS, I.STICK]);

// ============================================================
// COMIDA (valores de hambre y saturación por ítem, escala 0-20)
// La cocinada restaura más que la cruda, como en Minecraft.
// ============================================================
const FOOD_VALUES = {
  [I.BEEF]: { food: 3, saturation: 1.8 },
  [I.PORKCHOP]: { food: 3, saturation: 1.8 },
  [I.CHICKEN]: { food: 2, saturation: 1.2 },
  [I.MUTTON]: { food: 2, saturation: 1.2 },
  [I.COOKED_BEEF]: { food: 8, saturation: 12.8 },
  [I.COOKED_PORKCHOP]: { food: 8, saturation: 12.8 },
  [I.COOKED_CHICKEN]: { food: 6, saturation: 7.2 },
  [I.COOKED_MUTTON]: { food: 6, saturation: 9.6 },
  [I.RABBIT]: { food: 3, saturation: 1.8 },
  [I.COOKED_RABBIT]: { food: 8, saturation: 12.8 },
};
const isFood = (id) => !!FOOD_VALUES[id];
const isPickaxe = (id) => id >= 200 && id <= 204;

// ============================================================
// DURABILIDAD DE HERRAMIENTAS Y DAÑO DE ESPADA (Fase 5)
// Valores estilo Minecraft: madera 60, piedra 132, hierro 251,
// oro 33, diamante 1562. Mantener en sincronía con DURABILITY
// de public/constants.js (lo verifica tests/audit-fase5.js).
// ============================================================
const TOOL_DURABILITY = {
  [I.WOODEN_PICKAXE]: 60, [I.STONE_PICKAXE]: 132, [I.IRON_PICKAXE]: 251, [I.GOLDEN_PICKAXE]: 33, [I.DIAMOND_PICKAXE]: 1562,
  [I.WOODEN_AXE]: 60, [I.STONE_AXE]: 132, [I.IRON_AXE]: 251, [I.GOLDEN_AXE]: 33, [I.DIAMOND_AXE]: 1562,
  [I.WOODEN_SHOVEL]: 60, [I.STONE_SHOVEL]: 132, [I.IRON_SHOVEL]: 251, [I.GOLDEN_SHOVEL]: 33, [I.DIAMOND_SHOVEL]: 1562,
  [I.WOODEN_SWORD]: 60, [I.STONE_SWORD]: 132, [I.IRON_SWORD]: 251, [I.GOLDEN_SWORD]: 33, [I.DIAMOND_SWORD]: 1562,
};
const isTool = (id) => !!TOOL_DURABILITY[id];
// Daño por golpe de espada (Fase 5: progresión de combate; sin espada = 2)
const SWORD_DAMAGE = {
  [I.WOODEN_SWORD]: 3, [I.STONE_SWORD]: 4, [I.IRON_SWORD]: 5, [I.GOLDEN_SWORD]: 4, [I.DIAMOND_SWORD]: 6,
};

// ============================================================
// EXPERIENCIA Y NIVELES SIMPLES (Fase 5, opcional)
// XP por matar mobs y por minar minerales. Cada nivel suma +1 de
// salud máxima (máx +10). La XP se conserva al morir (simplificado).
// ============================================================
const XP_PER_LEVEL = 100;
const MAX_LEVEL_HEALTH_BONUS = 10;
const MOB_XP = {
  zombie: 5, creeper: 5, skeleton: 7, enderman: 9, spider: 7, wolf: 8,
  cow: 3, pig: 3, chicken: 2, sheep: 3, rabbit: 2,
};
const ORE_XP = {
  [B.COAL_ORE]: 1, [B.IRON_ORE]: 2, [B.GOLD_ORE]: 3, [B.DIAMOND_ORE]: 5, [B.REDSTONE_ORE]: 1, [B.EMERALD_ORE]: 5,
};

// ============================================================
// CRÍA DE ANIMALES (qué ítem alimenta a cada pasivo, estilo Minecraft)
// ============================================================
const BREED_FOOD = {
  cow: I.WHEAT,
  sheep: I.WHEAT,
  pig: I.CARROT,
  chicken: I.SEEDS,
  rabbit: I.CARROT,
};

// ============================================================
// MOBS
// ============================================================
const MOB_COLORS = {
  zombie: 0x3a8f3a, creeper: 0x0ecc0e, skeleton: 0xcfcfcf, enderman: 0x2a0a3a,
  spider: 0x3b3b3b, wolf: 0x8a8a8a, // Fase 5: nuevos hostiles
  cow: 0x6b4226, pig: 0xf0a8b8, chicken: 0xf2e08a, sheep: 0xf5f5f0,
  rabbit: 0xd9c8a8, // Fase 5: nuevo pasivo
};
const HOSTILE = new Set(['zombie', 'creeper', 'skeleton', 'enderman', 'spider', 'wolf']);

module.exports = {
  PORT, CHUNK_SIZE, WORLD_HEIGHT, TICK_MS, SAVE_INTERVAL_MS,
  VIEW_DISTANCE_CHUNKS, UNLOAD_DISTANCE_CHUNKS, UNLOAD_INTERVAL_MS,
  DAY_CYCLE_MS, SEED,
  WORLD_ROOT, seedDir, WORLD_DIR, CHUNKS_DIR, SCHEMA_VERSION, LEGACY_FILE, META_FILE, LEGACY_ROOT_FILES,
  B, I, NOT_MINEABLE, FUEL_ITEMS, FOOD_VALUES, isFood, isPickaxe,
  isSolidBlock, BREED_FOOD, MOB_COLORS, HOSTILE,
  TOOL_DURABILITY, isTool, SWORD_DAMAGE,
  XP_PER_LEVEL, MAX_LEVEL_HEALTH_BONUS, MOB_XP, ORE_XP,
};
