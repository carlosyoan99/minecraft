"use strict";

// ============================================================
// CONFIGURACIÓN Y CONSTANTES COMPARTIDAS DEL SERVIDOR
// ============================================================
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 64;
const TICK_MS = 50; // 20 ticks por segundo
const SAVE_INTERVAL_MS = 30000; // Guardar cada 30s
const VIEW_DISTANCE_CHUNKS = 6; // Chunks generados alrededor de cada jugador al conectar
const UNLOAD_DISTANCE_CHUNKS = 10; // Chunks sin jugadores a menos de esta distancia (en chunks) se descargan
const UNLOAD_INTERVAL_MS = 10000; // Cada 10s se buscan chunks lejanos que descargar
const DAY_CYCLE_MS = 1200000; // 20 minutos como Minecraft: ~10 de día, ~10 de noche (atardecer/amanecer suaves en el cliente)
// Fase 8 (B8): fases lunares — ciclo completo cada 8 días de juego, derivado
// del MISMO reloj del mundo (worldTime) + offset determinista por semilla.
const MOON_DAYS = 8;
const MOON_CYCLE_MS = DAY_CYCLE_MS * MOON_DAYS;

// Offset por semilla (determinista y estable, sin cripto): mismo mundo → la
// luna está en la misma fase en el mismo instante, para todos los jugadores
// y entre reinicios (el reloj base es Date.now(), no un contador de ticks).
function seedMoonOffsetMs(seed) {
	let h = 0;
	for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return h % MOON_CYCLE_MS;
}
// Gracia inicial de spawn (Fase 8, B2): tras entrar o reaparecer, N ms sin
// daño de MOBS (lava/caída/hambre siguen doliendo). Da tiempo a orientarse
// sin morir en el spawn; la zona segura de spawn es la otra mitad del fix.
const SPAWN_GRACE_MS = 30000;
// La semilla se configura con la env var SEED (defecto miSemilla2026).
// Cambiar la SEED genera un mundo TOTALMENTE nuevo: cada semilla tiene su
// propio directorio de mundo (world/<semilla>/), así nunca se pisan ni se
// mezclan los chunks (bug: antes reutilizaba los guardados con un warn).
const SEED = process.env.SEED || "miSemilla2026";

// Física del jugador (Fase 7): el cliente envía la posición del OJO en `move`
// (altura del ojo EYE_HEIGHT sobre los pies) y el servidor la usa para inferir
// el suelo al calcular el daño por caída. Mantener en sincronía con EYE_HEIGHT
// de public/constants.js (lo verifica tests/unit-sync.js).
const EYE_HEIGHT = 1.6;
// Daño por caída (Fase 7): los primeros bloques de caída no dañan (estilo
// Minecraft); a partir de ahí, 1 HP por bloque (23 bloques = muerte segura).
const FALL_DAMAGE_FREE_BLOCKS = 3;
// Caer del mundo (void, Fase 7): por debajo de este y el jugador muere y
// reaparece (solo lo necesita el servidor: el respawn envía el teleport).
const VOID_Y = -8;

// Física del movimiento (Fase 8, mejora anti-cheat): paridad con el cliente
// (public/player.js, JUMP_SPEED=7/GRAVITY=18). El servidor usa estos valores
// para validar el ascenso contra la parábola del salto (vy = JUMP_SPEED -
// GRAVITY·t, distancia subida = JUMP_SPEED·dt - GRAVITY·dt²/2) y para
// inferir la altura de una caída desde la velocidad vertical observada
// (h = v²/(2·GRAVITY)) cuando el jugador aterriza más rápido de lo que su
// trayectoria posicional sugiere. Mantener en sincronía con public/player.js
// (lo verifica tests/unit-sync.js).
const JUMP_SPEED = 7; // bloques/s de velocidad vertical inicial del salto
const GRAVITY = 18; // bloques/s² de gravedad (caída libre)

// Límite de tamaño de mensaje WS entrante (Fase 8, mejora documentada): la
// librería `ws` aplica su default de ~100 MiB por mensaje; los mensajes
// reales del protocolo son pequeños (moves, chat ≤200 chars, block_action),
// así que 1 MiB basta para impedir que un cliente malicioso sature la
// memoria del servidor con payloads gigantes. Por encima de esto `ws`
// cierra la conexión (1009).
const WS_MAX_PAYLOAD = 1 * 1024 * 1024;

// Persistencia (paths y versión del formato de guardado)
const WORLD_ROOT = path.join(__dirname, "..", "world");
// Nombre de directorio seguro a partir de una semilla (función pura, testeable)
function seedDir(seed) {
	return (
		(seed || "")
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, "_")
			.replace(/^_+|_+$/g, "")
			.slice(0, 40) || "default"
	);
}
// Rutas de mundo MUTABLES (holder): la semilla se puede cambiar en runtime con
// setWorldSeed() desde el menú del cliente (Fase 6, evento set_seed). save.js
// y world.js leen SIEMPRE de aquí en tiempo de llamada (nunca de constantes
// capturadas al cargar el módulo), y los tests mutan worldRoot/worldDir para
// aislar el I/O en un directorio temporal.
const worldPaths = {
	worldRoot: WORLD_ROOT,
	currentSeed: SEED, // semilla activa (el directorio se deriva de ella)
	// Fase 7: nombre MOSTRADO del mundo (world.json, campo `name` del menú).
	// La semilla es la identidad; el nombre es solo cosmético y viaja con
	// set_seed. Por defecto, la semilla (buildMeta/loadWorld lo mantienen).
	worldName: SEED,
	// Fase 9 (Bloque B): modo de juego FIJO por mundo (survival/creative). Se
	// persiste en world.json (buildMeta/loadWorld) y aplica a TODOS los
	// jugadores que entran: el modo es propiedad del mundo, no del jugador.
	worldGamemode: "survival",
	// Fase 10 (B1): TAMAÑO del mundo en bloques por lado (256/512/1024/8192).
	// Se persiste en world.json; los mundos viejos (sin el campo) abren con
	// 8192 (el tamaño "infinito" que había antes, retrocompatible).
	worldSize: 8192,
	worldDir: null,
	chunksDir: null,
	legacyFile: null,
	metaFile: null
};
worldPaths.worldDir = path.join(
	worldPaths.worldRoot,
	seedDir(worldPaths.currentSeed)
);
worldPaths.chunksDir = path.join(worldPaths.worldDir, "chunks");
worldPaths.legacyFile = path.join(worldPaths.worldDir, "world.dat");
worldPaths.metaFile = path.join(worldPaths.worldDir, "world.json");

// Cambia la semilla activa (y sus rutas) en runtime. No toca ruido ni estado:
// eso lo hace save.switchWorld() (persistir → limpiar → re-seedar).
// `name` (opcional) fija el nombre mostrado del mundo nuevo; si no llega, se
// conserva el actual (loadWorld restaura el del disco al cargar).
// `gamemode` (opcional, Fase 9) fija el modo de juego del mundo nuevo
// (survival/creative); si no llega se conserva el actual. El mundo EXISTENTE
// gana: loadWorld restaura el modo persistido en su world.json.
function setWorldSeed(seed, name, gamemode) {
	worldPaths.currentSeed = seed;
	worldPaths.worldDir = path.join(worldPaths.worldRoot, seedDir(seed));
	worldPaths.chunksDir = path.join(worldPaths.worldDir, "chunks");
	worldPaths.legacyFile = path.join(worldPaths.worldDir, "world.dat");
	worldPaths.metaFile = path.join(worldPaths.worldDir, "world.json");
	if (name !== undefined) worldPaths.worldName = name;
	if (gamemode !== undefined && GAMEMODES.has(gamemode))
		worldPaths.worldGamemode = gamemode;
}

// Modos de juego válidos (Fase 9, Bloque B): fijo por mundo.
const GAMEMODES = new Set(["survival", "creative"]);
// Sanea un modo de juego desde el wire o desde world.json (lectura defensiva):
// cualquier otro valor cae a survival (decisión del usuario: los mundos
// existentes sin el campo abren como survival).
function sanitizeGamemode(raw) {
	return GAMEMODES.has(raw) ? raw : "survival";
}

const SCHEMA_VERSION = 4; // versión actual del formato de guardado
// Fase 11 (Bloque B): 3 → 4 — se añadieron bloques nuevos (jungla/pantano),
// sin cambio de estructura del guardado (los chunks viejos v3 cargan igual:
// simplemente no contienen los bloques nuevos; se regeneran al explorar).
// Layout antiguo (v2 pre-semilla, todo en la raíz de world/) que se migra al
// directorio de la semilla al arrancar (save.migrateWorldLayout()).
const LEGACY_ROOT_FILES = [
	"world.json",
	"chunks",
	"world.dat",
	"world.dat.legacy"
];
// Historial de formatos:
//   v1 — world/world.dat (un solo JSON: seed, chunks, mobs, furnaces)
//   v2 — world/chunks/*.json + world/world.json (incremental por chunk)
//   v3 — world/<semilla>/chunks + world/<semilla>/world.json (un mundo por semilla)
//   v4 — v3 + world.json con `gamemode` (Fase 9, Bloque B): los mundos v3 sin
//        el campo abren como survival (migración retrocompatible, sin pasos
//        extra: loadWorld lo lee de forma defensiva).
// Migraciones: v1 → v2 migrateLegacyWorld() · layout raíz → por semilla migrateWorldLayout()

// ============================================================
// BLOQUES E ÍTEMS (fuente de verdad de IDs; sincronizar con public/constants.js)
// ============================================================
const B = {
	AIR: 0,
	DIRT: 1,
	GRASS: 2,
	STONE: 3,
	OAK_LOG: 4,
	OAK_LEAVES: 5,
	SAND: 6,
	PLANKS: 7,
	COBBLESTONE: 8,
	COAL_ORE: 9,
	IRON_ORE: 10,
	GOLD_ORE: 11,
	DIAMOND_ORE: 12,
	REDSTONE_ORE: 13,
	EMERALD_ORE: 14,
	CRAFTING_TABLE: 15,
	FURNACE: 16,
	GLASS: 17,
	WOOL: 18,
	BEDROCK: 19,
	WATER: 20, // no sólido: se puede nadar (Fase 4)
	SNOW: 21, // superficie de tundra y cumbres de montaña (Fase 4)
	CHEST: 22, // bloque de almacenamiento con inventario propio (27 slots, Fase 6)
	TORCH: 23, // no sólido: se atraviesa; iluminación dinámica por bloque (Fase 6)
	BED: 24, // no sólido: se atraviesa; clic derecho de noche para dormir (Fase 7)
	LAVA: 25, // no sólido como el agua: pozos de lava decorativos en superficie (Fase 7)
	// Fase 9 (Bloque C/F): cultivos y materiales nuevos
	FARMLAND: 26, // tierra arada con azada (no se coloca a mano)
	WHEAT: 27, // cultivo de trigo (no sólido; crece por estado en state.crops)
	// Fase 9 (Bloque F): variedad de árboles (abedul y pino)
	BIRCH_LOG: 28,
	BIRCH_LEAVES: 29,
	SPRUCE_LOG: 30,
	SPRUCE_LEAVES: 31,
	// Fase 9 (Bloque F): estructuras y decoración
	MOSSY_COBBLESTONE: 32, // piedra de musgo (estructuras decorativas)
	TALL_GRASS: 33, // hierba alta (no sólida, decorativa)
	POPPY: 34, // amapola (no sólida; drop de tinte rojo)
	DANDELION: 35, // diente de león (no sólido; drop de tinte amarillo)
	// Fase 9 (Bloque F): lana tintada (ítems tintables con los tintes
	// disponibles: rojo de la amapola, amarillo del diente de león, blanco de
	// la harina de hueso — verde/azul quedan fuera por no tener fuente de tinte).
	RED_WOOL: 36,
	YELLOW_WOOL: 37,
	WHITE_WOOL: 38,
	// Fase 10 (D1/D2): bloques con gravedad y explosivo
	GRAVEL: 39, // cae si no tiene soporte (como la arena)
	TNT: 40, // explota al activarse (clic derecho o reacción en cadena)
	// Fase 11 (Bloque B): bloques de los biomas nuevos — jungla y pantano
	JUNGLE_LOG: 41, // tronco de jungla (árboles de jungla)
	JUNGLE_LEAVES: 42, // hojas de jungla
	VINES: 43 // liana (no sólida, decorativa; cuelga de las copas)
};

// Bloques con gravedad (Fase 10, D1): caen si el bloque de debajo no es
// sólido (arena y grava). El servidor es la fuente de verdad: world.settleColumn
// los mueve al setBlock y broadcast con block_update.
const GRAVITY_BLOCKS = new Set([B.SAND, B.GRAVEL]);

// Fase 10 (D2): TNT — mecha, radio del cráter y daño por explosión.
const TNT_FUSE_MS = 1600; // ~1.6s de mecha (chisporroteo) antes de explotar
const TNT_RADIUS = 3; // radio del cráter en bloques
const TNT_DAMAGE = 12; // daño máximo (centro de la explosión)
const I = {
	STICK: 100,
	COAL: 101,
	IRON_INGOT: 102,
	GOLD_INGOT: 103,
	DIAMOND: 104,
	REDSTONE: 105,
	EMERALD: 106,
	BEEF: 107,
	PORKCHOP: 108,
	CHICKEN: 109,
	MUTTON: 110, // comida cruda (se cocina en el horno)
	COOKED_BEEF: 111,
	COOKED_PORKCHOP: 112,
	COOKED_CHICKEN: 113,
	COOKED_MUTTON: 114, // comida cocinada
	WHEAT: 115,
	CARROT: 116,
	SEEDS: 117, // comida de cría de animales (se obtiene de la hierba)
	RABBIT: 118,
	COOKED_RABBIT: 119, // conejo crudo (Fase 5: nuevo pasivo) y asado
	STRING: 120, // hilo: drop de la araña (Fase 5)
	LEATHER: 132, // cuero: drop de la vaca y el conejo, material de la armadura de cuero (Fase 7)
	// Fase 9 (Bloque F): comida y materiales nuevos
	BREAD: 133, // pan: 3 trigo → 1 pan
	COD: 134, // pescado crudo (drop del pescado/cofre de loot)
	COOKED_COD: 135, // pescado cocinado (horno)
	BONE: 136, // hueso: drop del esqueleto (→ harina de hueso)
	RED_DYE: 137, // tinte rojo (de la amapola)
	YELLOW_DYE: 138, // tinte amarillo (del diente de león)
	BONE_MEAL: 139, // harina de hueso (de hueso) — tinte blanco
	HONEY: 140, // miel: botín de cofres de loot (versión simplificada de las abejas)
	SHEARS: 141, // tijeras (Fase 11, C): esquilan ovejas (lana sin matar)
	// Armadura (Fase 7): casco, pechera, pantalones y botas × 3 materiales
	LEATHER_HELMET: 220,
	LEATHER_CHESTPLATE: 221,
	LEATHER_LEGGINGS: 222,
	LEATHER_BOOTS: 223,
	IRON_HELMET: 224,
	IRON_CHESTPLATE: 225,
	IRON_LEGGINGS: 226,
	IRON_BOOTS: 227,
	DIAMOND_HELMET: 228,
	DIAMOND_CHESTPLATE: 229,
	DIAMOND_LEGGINGS: 230,
	DIAMOND_BOOTS: 231,
	WOODEN_PICKAXE: 200,
	STONE_PICKAXE: 201,
	IRON_PICKAXE: 202,
	GOLDEN_PICKAXE: 203,
	DIAMOND_PICKAXE: 204,
	WOODEN_AXE: 205,
	STONE_AXE: 206,
	IRON_AXE: 207,
	GOLDEN_AXE: 208,
	DIAMOND_AXE: 209,
	WOODEN_SHOVEL: 210,
	STONE_SHOVEL: 211,
	IRON_SHOVEL: 212,
	GOLDEN_SHOVEL: 213,
	DIAMOND_SHOVEL: 214,
	WOODEN_SWORD: 215,
	STONE_SWORD: 216,
	IRON_SWORD: 217,
	GOLDEN_SWORD: 218,
	DIAMOND_SWORD: 219,
	// Fase 9 (Bloque C): azadas (240-244) — convierten tierra/césped en tierra
	// arada para plantar cultivos. Misma durabilidad que el resto por material.
	WOODEN_HOE: 240,
	STONE_HOE: 241,
	IRON_HOE: 242,
	GOLDEN_HOE: 243,
	DIAMOND_HOE: 244
};
// ============================================================
// TAMAÑO DE MUNDO (Fase 10, B1)
// Lados en bloques por dimensión (el mundo es cuadrado: [-half, +half)).
// `debug` e `infinito` NO se ofrecen en el menú (solo interno). El límite se
// aplica en world.js (generación/bordes) y net.js (validación de move).
// ============================================================
const WORLD_SIZES = {
	debug: 64,
	small: 256,
	medium: 512,
	large: 1024,
	infinite: 8192
};

// Límite por lado (mitad del tamaño): coordenadas fuera de [-half, half) se
// rechazan (movimiento, colocación, generación). Los tests lo consultan.
function worldHalfExtent() {
	const size = worldPaths.worldSize || WORLD_SIZES.medium;
	return Math.floor(size / 2);
}

// Normaliza un tamaño pedido (número de bloques por lado o clave de
// WORLD_SIZES): devuelve el lado válido o el tamaño por defecto (medio).
function sanitizeWorldSize(raw) {
	if (typeof raw === "number" && Number.isFinite(raw) && raw >= 64) {
		const side = Math.round(raw);
		return side >= 8192 ? WORLD_SIZES.infinite : side;
	}
	if (typeof raw === "string" && WORLD_SIZES[raw]) return WORLD_SIZES[raw];
	return WORLD_SIZES.medium;
}
function worldSizeBlocks() {
	return worldPaths.worldSize || WORLD_SIZES.medium; // lado del mundo en bloques
}
const NOT_MINEABLE = new Set([B.AIR, B.BEDROCK, B.WATER, B.LAVA]); // agua/lava no se pueden romper a mano (sin cubo)
// Bloques NO sólidos (Fase 9): cultivos, hierba alta y flores se atraviesan
// y se rompen al instante (como plantas).
const NON_SOLID_PLANTS = new Set([
	B.WHEAT,
	B.TALL_GRASS,
	B.POPPY,
	B.DANDELION,
	B.VINES // Fase 11 (Bloque B): las lianas cuelgan y se atraviesan (como las plantas)
]);
// Sólido para física/validación: el agua no es sólida (se nada en ella), la
// antorcha/cama tampoco (se atraviesan) y las plantas (Fase 9) tampoco.
const isSolidBlock = (id) =>
	id !== B.AIR &&
	id !== B.WATER &&
	id !== B.LAVA &&
	id !== B.TORCH &&
	id !== B.BED &&
	!NON_SOLID_PLANTS.has(id);
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
	// Fase 9 (Bloque F): pan y pescado (crudo/cocinado), valores estilo MC
	[I.BREAD]: { food: 5, saturation: 6 },
	[I.COD]: { food: 2, saturation: 0.4 },
	[I.COOKED_COD]: { food: 5, saturation: 6 }
};
const isFood = (id) => !!FOOD_VALUES[id];
const isPickaxe = (id) => id >= 200 && id <= 204;
const isAxe = (id) => id >= 205 && id <= 209;
const isShovel = (id) => id >= 210 && id <= 214;
const isSword = (id) => id >= 215 && id <= 219;
const isHoe = (id) => id >= 240 && id <= 244;

// ============================================================
// MINERÍA FINA (Fase 6): dureza por bloque y velocidad según
// herramienta. Tiempo de rotura = BLOCK_HARDNESS / miningSpeed
// (a mano o con herramienta equivocada: x1 → lento). Drop
// condicional estilo Minecraft: piedra/minerales solo sueltan
// drop con pico; el resto siempre. Fuente de verdad del servidor;
// el cliente solo pinta las grietas (block_break_progress).
// ============================================================
// Dureza en SEGUNDOS rompiendo a mano.
// Durezas estilo Minecraft (segundos a mano; Fase 9, Bloque C: ajustadas a MC
// — la espada NO mina y cada categoría usa su herramienta).
const BLOCK_HARDNESS = {
	[B.WHEAT]: 0.05, // los cultivos se rompen al instante
	[B.TALL_GRASS]: 0.05,
	[B.POPPY]: 0.05,
	[B.DANDELION]: 0.05,
	[B.TORCH]: 0.1,
	[B.BED]: 0.2,
	[B.OAK_LEAVES]: 0.2,
	[B.BIRCH_LEAVES]: 0.2,
	[B.SPRUCE_LEAVES]: 0.2,
	[B.JUNGLE_LEAVES]: 0.2, // Fase 11 (Bloque B)
	[B.VINES]: 0.05, // Fase 11 (Bloque B): las lianas se rompen al instante
	[B.GLASS]: 0.3,
	[B.SNOW]: 0.2,
	[B.SAND]: 0.5,
	[B.GRAVEL]: 0.4, // Fase 10 (D1)
	[B.TNT]: 0.05, // Fase 10 (D2): se rompe al instante (como en MC)
	[B.GRASS]: 0.6,
	[B.DIRT]: 0.75,
	[B.FARMLAND]: 0.6,
	[B.WOOL]: 0.8,
	[B.RED_WOOL]: 0.8,
	[B.YELLOW_WOOL]: 0.8,
	[B.WHITE_WOOL]: 0.8,
	[B.PLANKS]: 2.0,
	[B.OAK_LOG]: 2.0,
	[B.BIRCH_LOG]: 2.0,
	[B.SPRUCE_LOG]: 2.0,
	[B.JUNGLE_LOG]: 2.0, // Fase 11 (Bloque B)
	[B.CRAFTING_TABLE]: 2.5,
	[B.CHEST]: 2.5,
	[B.FURNACE]: 3.5,
	[B.STONE]: 1.5,
	[B.COBBLESTONE]: 2.0,
	[B.MOSSY_COBBLESTONE]: 2.0,
	[B.COAL_ORE]: 3.0,
	[B.IRON_ORE]: 3.0,
	[B.GOLD_ORE]: 3.0,
	[B.REDSTONE_ORE]: 3.0,
	[B.EMERALD_ORE]: 3.0,
	[B.DIAMOND_ORE]: 3.0
};
// Velocidad por material (multiplicador sobre la dureza): madera 2x,
// piedra 4x, hierro 6x, oro 12x (rápida pero frágil), diamante 8x.
const TOOL_TIER_SPEED = {
	[I.WOODEN_PICKAXE]: 2,
	[I.STONE_PICKAXE]: 4,
	[I.IRON_PICKAXE]: 6,
	[I.GOLDEN_PICKAXE]: 12,
	[I.DIAMOND_PICKAXE]: 8,
	[I.WOODEN_AXE]: 2,
	[I.STONE_AXE]: 4,
	[I.IRON_AXE]: 6,
	[I.GOLDEN_AXE]: 12,
	[I.DIAMOND_AXE]: 8,
	[I.WOODEN_SHOVEL]: 2,
	[I.STONE_SHOVEL]: 4,
	[I.IRON_SHOVEL]: 6,
	[I.GOLDEN_SHOVEL]: 12,
	[I.DIAMOND_SHOVEL]: 8
};
// La espada NO mina (Fase 9, Bloque C): no tiene tier en TOOL_TIER_SPEED y
// miningSpeed le devuelve 1; además no cosecha nada (canHarvest false).
// Herramienta correcta por categoría de bloque.
const CATEGORY_TOOL = {
	stone: "pickaxe",
	ore: "pickaxe",
	wood: "axe",
	dirt: "shovel",
	sand: "shovel",
	snow: "shovel"
};
const BLOCK_CATEGORY = {
	[B.STONE]: "stone",
	[B.COBBLESTONE]: "stone",
	[B.MOSSY_COBBLESTONE]: "stone",
	[B.COAL_ORE]: "ore",
	[B.IRON_ORE]: "ore",
	[B.GOLD_ORE]: "ore",
	[B.DIAMOND_ORE]: "ore",
	[B.REDSTONE_ORE]: "ore",
	[B.EMERALD_ORE]: "ore",
	[B.OAK_LOG]: "wood",
	[B.BIRCH_LOG]: "wood",
	[B.SPRUCE_LOG]: "wood",
	[B.JUNGLE_LOG]: "wood", // Fase 11 (Bloque B)
	[B.GRASS]: "dirt",
	[B.DIRT]: "dirt",
	[B.FARMLAND]: "dirt",
	[B.SAND]: "sand",
	[B.SNOW]: "snow"
};
const toolCategoryOf = (id) =>
	isPickaxe(id)
		? "pickaxe"
		: isAxe(id)
			? "axe"
			: isShovel(id)
				? "shovel"
				: null;
// Velocidad efectiva (x1 con la mano o la herramienta equivocada: lento).
function miningSpeed(tool, block) {
	const tier = TOOL_TIER_SPEED[tool];
	if (!tier) return 1;
	const cat = BLOCK_CATEGORY[block];
	if (!cat || CATEGORY_TOOL[cat] !== toolCategoryOf(tool)) return 1;
	return tier;
}
// Segundos que tarda en romperse el bloque con esa herramienta.
function breakSeconds(tool, block) {
	return (BLOCK_HARDNESS[block] ?? 0.6) / miningSpeed(tool, block);
}
// ¿Suelta drop con la herramienta/mano actual? (piedra/minerales: solo pico)
// Fase 9 (Bloque C): la ESPADA no cosecha NADA (en Minecraft rompe bloques
// pero no sueltan item) — el resto de herramientas cosechan lo suyo.
function canHarvest(tool, block) {
	if (isSword(tool)) return false;
	if (
		block === B.STONE ||
		block === B.COBBLESTONE ||
		block === B.MOSSY_COBBLESTONE
	)
		return isPickaxe(tool);
	if (block >= B.COAL_ORE && block <= B.EMERALD_ORE) return isPickaxe(tool);
	if (block === B.GLASS) return false; // el vidrio no suelta item sin Silk Touch (simplificado)
	return true;
}

// ============================================================
// DURABILIDAD DE HERRAMIENTAS Y DAÑO DE ESPADA (Fase 5)
// Valores estilo Minecraft: madera 60, piedra 132, hierro 251,
// oro 33, diamante 1562. Mantener en sincronía con DURABILITY
// de public/constants.js (lo verifica tests/audit-fase5.js).
// ============================================================
const TOOL_DURABILITY = {
	[I.WOODEN_PICKAXE]: 60,
	[I.STONE_PICKAXE]: 132,
	[I.IRON_PICKAXE]: 251,
	[I.GOLDEN_PICKAXE]: 33,
	[I.DIAMOND_PICKAXE]: 1562,
	[I.WOODEN_AXE]: 60,
	[I.STONE_AXE]: 132,
	[I.IRON_AXE]: 251,
	[I.GOLDEN_AXE]: 33,
	[I.DIAMOND_AXE]: 1562,
	[I.WOODEN_SHOVEL]: 60,
	[I.STONE_SHOVEL]: 132,
	[I.IRON_SHOVEL]: 251,
	[I.GOLDEN_SHOVEL]: 33,
	[I.DIAMOND_SHOVEL]: 1562,
	[I.WOODEN_SWORD]: 60,
	[I.STONE_SWORD]: 132,
	[I.IRON_SWORD]: 251,
	[I.GOLDEN_SWORD]: 33,
	[I.DIAMOND_SWORD]: 1562,
	// Fase 9 (Bloque C): azadas (misma durabilidad que la herramienta de su material)
	[I.WOODEN_HOE]: 60,
	[I.STONE_HOE]: 132,
	[I.IRON_HOE]: 251,
	[I.GOLDEN_HOE]: 33,
	[I.DIAMOND_HOE]: 1562
};
// Alias de durabilidad de azadas (para addToInventory/applyToolWear).
const HOE_DURABILITY = TOOL_DURABILITY;
const isTool = (id) => !!TOOL_DURABILITY[id] || isHoe(id);

// ============================================================
// ARMADURA (Fase 7): reducción de daño por pieza y material.
// Cada pieza reduce un porcentaje del daño bruto y tiene una durabilidad
// que se desgasta al recibir daño. El daño real = bruto × (1 − reducción
// total, tope 0.8). La fuente de verdad del servidor; el cliente solo pinta
// los 4 slots del inventario con su barra de durabilidad.
// ============================================================
const ARMOR_SLOTS = ["helmet", "chestplate", "leggings", "boots"];
const ARMOR_DAMAGE_REDUCTION = {
	[I.LEATHER_HELMET]: 0.04,
	[I.LEATHER_CHESTPLATE]: 0.08,
	[I.LEATHER_LEGGINGS]: 0.06,
	[I.LEATHER_BOOTS]: 0.03,
	[I.IRON_HELMET]: 0.08,
	[I.IRON_CHESTPLATE]: 0.12,
	[I.IRON_LEGGINGS]: 0.1,
	[I.IRON_BOOTS]: 0.06,
	[I.DIAMOND_HELMET]: 0.12,
	[I.DIAMOND_CHESTPLATE]: 0.16,
	[I.DIAMOND_LEGGINGS]: 0.14,
	[I.DIAMOND_BOOTS]: 0.08
};
const ARMOR_DURABILITY = {
	[I.LEATHER_HELMET]: 55,
	[I.LEATHER_CHESTPLATE]: 80,
	[I.LEATHER_LEGGINGS]: 75,
	[I.LEATHER_BOOTS]: 65,
	[I.IRON_HELMET]: 165,
	[I.IRON_CHESTPLATE]: 240,
	[I.IRON_LEGGINGS]: 225,
	[I.IRON_BOOTS]: 195,
	[I.DIAMOND_HELMET]: 363,
	[I.DIAMOND_CHESTPLATE]: 528,
	[I.DIAMOND_LEGGINGS]: 495,
	[I.DIAMOND_BOOTS]: 429
};
const isArmor = (id) => !!ARMOR_DAMAGE_REDUCTION[id];

// Reduce el daño según la armadura del jugador: desgasta las piezas (-1 por
// cada 4 de daño bruto, mínimo 1) y devuelve el daño real. Las piezas que
// llegan a 0 se retiran. Si el jugador no tiene armadura, devuelve el daño.
function applyArmorDamageReduction(player, rawDamage) {
	if (!player.armor) return rawDamage;
	let reduction = 0;
	for (const slot of ARMOR_SLOTS) {
		const piece = player.armor[slot];
		if (piece && isArmor(piece.id)) {
			reduction += ARMOR_DAMAGE_REDUCTION[piece.id] || 0;
			const wear = Math.max(1, Math.floor(rawDamage / 4));
			piece.durability = Math.max(
				0,
				(piece.durability ?? ARMOR_DURABILITY[piece.id]) - wear
			);
			if (piece.durability <= 0) player.armor[slot] = null;
		}
	}
	return Math.max(0, Math.round(rawDamage * (1 - Math.min(reduction, 0.8))));
}
// Daño por golpe de espada (Fase 5: progresión de combate; sin espada = 2)
const SWORD_DAMAGE = {
	[I.WOODEN_SWORD]: 3,
	[I.STONE_SWORD]: 4,
	[I.IRON_SWORD]: 5,
	[I.GOLDEN_SWORD]: 4,
	[I.DIAMOND_SWORD]: 6
};
// Las azadas no hacen daño extra (en Minecraft tampoco; sirven para arar).

// ============================================================
// EXPERIENCIA Y NIVELES (Fase 5 simple + Fase 9 curva MC)
// XP por matar mobs y por minar minerales. Cada nivel suma +1 de
// salud máxima (máx +10). La XP se conserva al morir (simplificado).
// Fase 9 (Bloque C): curva de coste por nivel NO lineal estilo Minecraft
// (xpToNext(0)=7, y +3.5 por nivel redondeado — aproximación de la curva
// real de MC: 7, 10, 14, 17, 21...). XP_PER_LEVEL se mantiene exportado
// por compatibilidad con tests/audit-fase5 (paridad con el cliente) aunque
// la lógica de niveles ya no lo use.
// ============================================================
const XP_PER_LEVEL = 100; // retrocompat: paridad auditada, sin uso en la lógica actual
// XP necesaria para pasar del nivel `level` al siguiente (curva MC).
function xpToNext(level) {
	return 7 + Math.floor(level * 3.5);
}
// Nivel alcanzado con `xp` total acumulada (recorre la curva; barato: niveles
// pequeños en la práctica).
function levelFromXp(xp) {
	let level = 0;
	let rest = Math.max(0, xp | 0);
	while (rest >= xpToNext(level)) {
		rest -= xpToNext(level);
		level++;
	}
	return level;
}
// XP acumulada dentro del nivel actual (para la barra de progreso del HUD).
function xpIntoLevel(xp, level) {
	let rest = Math.max(0, xp | 0);
	for (let l = 0; l < level; l++) rest -= xpToNext(l);
	return Math.max(0, rest);
}
const MAX_LEVEL_HEALTH_BONUS = 10;
const MOB_XP = {
	zombie: 5,
	creeper: 5,
	skeleton: 7,
	enderman: 9,
	spider: 7,
	wolf: 8,
	cow: 3,
	pig: 3,
	chicken: 2,
	sheep: 3,
	rabbit: 2,
	bee: 1 // Fase 9 (Bloque F): pasivo volador (versión simplificada)
};
const ORE_XP = {
	[B.COAL_ORE]: 1,
	[B.IRON_ORE]: 2,
	[B.GOLD_ORE]: 3,
	[B.DIAMOND_ORE]: 5,
	[B.REDSTONE_ORE]: 1,
	[B.EMERALD_ORE]: 5
};

// ============================================================
// CRÍA DE ANIMALES (qué ítem alimenta a cada pasivo, estilo Minecraft)
// ============================================================
const BREED_FOOD = {
	cow: I.WHEAT,
	sheep: I.WHEAT,
	pig: I.CARROT,
	chicken: I.SEEDS,
	rabbit: I.CARROT
};

// ============================================================
// INVENTARIO CREATIVO (Fase 9, Bloque C): lista completa de bloques e
// ítems seleccionables en un mundo creativo. No se persiste: al entrar a un
// mundo creativo el inventario se resetea y se entrega esta lista (36 slots:
// bloques y materiales básicos); el resto se coge con el picker
// (creative_pick → slot seleccionado). Fuente de verdad para validar
// creative_pick en net.js.
// ============================================================
const CREATIVE_ITEMS = [
	// Bloques colocables
	B.GRASS,
	B.DIRT,
	B.STONE,
	B.COBBLESTONE,
	B.SAND,
	B.PLANKS,
	B.OAK_LOG,
	B.OAK_LEAVES,
	B.SNOW,
	B.WOOL,
	B.GLASS,
	B.CRAFTING_TABLE,
	B.FURNACE,
	B.CHEST,
	B.TORCH,
	B.BED,
	B.WATER,
	B.LAVA,
	// Fase 10 (D1/D2): grava (con gravedad) y TNT
	B.GRAVEL,
	B.TNT,
	// Fase 11 (Bloque B): bloques de los biomas nuevos
	B.JUNGLE_LOG,
	B.JUNGLE_LEAVES,
	B.VINES,
	// Minerales y materiales
	B.COAL_ORE,
	B.IRON_ORE,
	B.GOLD_ORE,
	B.DIAMOND_ORE,
	B.REDSTONE_ORE,
	B.EMERALD_ORE,
	I.COAL,
	I.IRON_INGOT,
	I.GOLD_INGOT,
	I.DIAMOND,
	I.REDSTONE,
	I.EMERALD,
	// Materiales de crafteo
	I.STICK,
	I.STRING,
	I.LEATHER,
	I.WHEAT,
	I.CARROT,
	I.SEEDS,
	// Fase 11 (C): tijeras (esquilar ovejas)
	I.SHEARS
];
// Todos los ítems/armas/herramientas del juego (para el picker creativo).
const ALL_TOOLS_AND_ARMOR = [
	...Object.values(I).filter((v) => v >= 200 && v <= 231),
	...Object.values(I).filter((v) => v >= 240 && v <= 244) // azadas (Fase 9, Bloque C)
];

// ============================================================
// MOBS
// ============================================================
const MOB_COLORS = {
	zombie: 0x3a8f3a,
	creeper: 0x0ecc0e,
	skeleton: 0xcfcfcf,
	enderman: 0x2a0a3a,
	spider: 0x3b3b3b,
	wolf: 0x8a8a8a, // Fase 5: nuevos hostiles
	cow: 0x6b4226,
	pig: 0xf0a8b8,
	chicken: 0xf2e08a,
	sheep: 0xf5f5f0,
	rabbit: 0xd9c8a8 // Fase 5: nuevo pasivo
};
const HOSTILE = new Set([
	"zombie",
	"creeper",
	"skeleton",
	"enderman",
	"spider",
	"wolf"
]);
// Mobs que se queman con el sol de día (Fase 6: IA hostil más fiel): solo
// los no-muertos clásicos arden al exponerse a la luz del día sin techo
// encima. Fase 9 (Bloque D): como en Minecraft, SOLO el zombi arde — el
// esqueleto no (mantiene distancia y dispara flechas). El creeper tampoco
// arde, ni la araña, el enderman (se teletransporta al exponerse, out of
// scope) ni el lobo.
const BURNS_IN_SUN = new Set(["zombie"]);

// Operadores (Fase 7, auditoría): nombres con permiso para los comandos que
// mutan el mundo o al jugador (/tp, /give, /time, /gamemode, /reload, /op).
// Se configuran con la env var OPS (nombres separados por comas, sin
// distinción de mayúsculas); además, el PRIMER jugador conectado (el host)
// es operador automáticamente (ver net.js). Fuera de alcance: autenticación
// real — esto es un control básico para servidores pequeños.
const OPS = new Set(
	(process.env.OPS || "")
		.split(",")
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean)
);

module.exports = {
	PORT,
	CHUNK_SIZE,
	WORLD_HEIGHT,
	TICK_MS,
	SAVE_INTERVAL_MS,
	VIEW_DISTANCE_CHUNKS,
	UNLOAD_DISTANCE_CHUNKS,
	UNLOAD_INTERVAL_MS,
	DAY_CYCLE_MS,
	MOON_DAYS,
	MOON_CYCLE_MS,
	seedMoonOffsetMs,
	SPAWN_GRACE_MS,
	SEED,
	OPS,
	EYE_HEIGHT,
	FALL_DAMAGE_FREE_BLOCKS,
	VOID_Y,
	JUMP_SPEED,
	GRAVITY,
	WS_MAX_PAYLOAD,
	WORLD_ROOT,
	seedDir,
	setWorldSeed,
	worldPaths,
	GAMEMODES,
	sanitizeGamemode,
	CREATIVE_ITEMS,
	ALL_TOOLS_AND_ARMOR,
	xpToNext,
	levelFromXp,
	xpIntoLevel,
	NON_SOLID_PLANTS,
	isSword,
	isHoe,
	HOE_DURABILITY,
	// Aliases de compatibilidad (snapshot inicial; la fuente de verdad es worldPaths)
	WORLD_DIR: worldPaths.worldDir,
	CHUNKS_DIR: worldPaths.chunksDir,
	LEGACY_FILE: worldPaths.legacyFile,
	META_FILE: worldPaths.metaFile,
	SCHEMA_VERSION,
	LEGACY_ROOT_FILES,
	B,
	I,
	NOT_MINEABLE,
	GRAVITY_BLOCKS,
	TNT_FUSE_MS,
	TNT_RADIUS,
	TNT_DAMAGE,
	FUEL_ITEMS,
	FOOD_VALUES,
	isFood,
	isPickaxe,
	isAxe,
	isShovel,
	isSolidBlock,
	BREED_FOOD,
	MOB_COLORS,
	HOSTILE,
	BURNS_IN_SUN,
	TOOL_DURABILITY,
	isTool,
	SWORD_DAMAGE,
	ARMOR_SLOTS,
	ARMOR_DAMAGE_REDUCTION,
	ARMOR_DURABILITY,
	WORLD_SIZES,
	worldHalfExtent,
	worldSizeBlocks,
	sanitizeWorldSize,
	isArmor,
	applyArmorDamageReduction,
	XP_PER_LEVEL,
	MAX_LEVEL_HEALTH_BONUS,
	MOB_XP,
	ORE_XP,
	BLOCK_HARDNESS,
	TOOL_TIER_SPEED,
	miningSpeed,
	breakSeconds,
	canHarvest
};
