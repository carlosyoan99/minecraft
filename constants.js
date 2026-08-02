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
const SEED = 'miSemilla2026';

// Persistencia (paths y versión del formato de guardado)
const WORLD_DIR = path.join(__dirname, 'world');
const CHUNKS_DIR = path.join(WORLD_DIR, 'chunks');
const SCHEMA_VERSION = 2;           // versión actual del formato de guardado
const LEGACY_FILE = path.join(WORLD_DIR, 'world.dat');
const META_FILE = path.join(WORLD_DIR, 'world.json');
// Historial de formatos:
//   v1 — world/world.dat (un solo JSON: seed, chunks, mobs, furnaces)
//   v2 — world/chunks/*.json + world/world.json (incremental por chunk)
// Migraciones: v1 → v2 la ejecuta migrateLegacyWorld() al arrancar.

// ============================================================
// BLOQUES E ÍTEMS (fuente de verdad de IDs; sincronizar con public/constants.js)
// ============================================================
const B = {
  AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, OAK_LOG: 4, OAK_LEAVES: 5,
  SAND: 6, PLANKS: 7, COBBLESTONE: 8, COAL_ORE: 9, IRON_ORE: 10,
  GOLD_ORE: 11, DIAMOND_ORE: 12, REDSTONE_ORE: 13, EMERALD_ORE: 14,
  CRAFTING_TABLE: 15, FURNACE: 16, GLASS: 17, WOOL: 18, BEDROCK: 19,
};
const I = {
  STICK: 100, COAL: 101, IRON_INGOT: 102, GOLD_INGOT: 103, DIAMOND: 104,
  REDSTONE: 105, EMERALD: 106,
  BEEF: 107, PORKCHOP: 108, CHICKEN: 109, MUTTON: 110, // comida cruda (se cocina en el horno)
  COOKED_BEEF: 111, COOKED_PORKCHOP: 112, COOKED_CHICKEN: 113, COOKED_MUTTON: 114, // comida cocinada
  WHEAT: 115, CARROT: 116, SEEDS: 117, // comida de cría de animales (se obtiene de la hierba)
  WOODEN_PICKAXE: 200, STONE_PICKAXE: 201, IRON_PICKAXE: 202, GOLDEN_PICKAXE: 203, DIAMOND_PICKAXE: 204,
  WOODEN_AXE: 205, STONE_AXE: 206, IRON_AXE: 207, GOLDEN_AXE: 208, DIAMOND_AXE: 209,
  WOODEN_SHOVEL: 210, STONE_SHOVEL: 211, IRON_SHOVEL: 212, GOLDEN_SHOVEL: 213, DIAMOND_SHOVEL: 214,
  WOODEN_SWORD: 215, STONE_SWORD: 216, IRON_SWORD: 217, GOLDEN_SWORD: 218, DIAMOND_SWORD: 219,
};
const NOT_MINEABLE = new Set([B.AIR, B.BEDROCK]);
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
};
const isFood = (id) => !!FOOD_VALUES[id];
const isPickaxe = (id) => id >= 200 && id <= 204;

// ============================================================
// CRÍA DE ANIMALES (qué ítem alimenta a cada pasivo, estilo Minecraft)
// ============================================================
const BREED_FOOD = {
  cow: I.WHEAT,
  sheep: I.WHEAT,
  pig: I.CARROT,
  chicken: I.SEEDS,
};

// ============================================================
// MOBS
// ============================================================
const MOB_COLORS = {
  zombie: 0x3a8f3a, creeper: 0x0ecc0e, skeleton: 0xcfcfcf, enderman: 0x2a0a3a,
  cow: 0x6b4226, pig: 0xf0a8b8, chicken: 0xf2e08a, sheep: 0xf5f5f0,
};
const HOSTILE = new Set(['zombie', 'creeper', 'skeleton', 'enderman']);

module.exports = {
  PORT, CHUNK_SIZE, WORLD_HEIGHT, TICK_MS, SAVE_INTERVAL_MS,
  VIEW_DISTANCE_CHUNKS, UNLOAD_DISTANCE_CHUNKS, UNLOAD_INTERVAL_MS,
  DAY_CYCLE_MS, SEED,
  WORLD_DIR, CHUNKS_DIR, SCHEMA_VERSION, LEGACY_FILE, META_FILE,
  B, I, NOT_MINEABLE, FUEL_ITEMS, FOOD_VALUES, isFood, isPickaxe,
  BREED_FOOD, MOB_COLORS, HOSTILE,
};
