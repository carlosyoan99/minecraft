"use strict";

// ============================================================
// CONFIGURACIÓN Y CONSTANTES COMPARTIDAS DEL SERVIDOR
// ============================================================
const path = require("node:path");

const PORT = process.env.PORT || 3000;
const CHUNK_SIZE = 16;
// Fase 15 (D5): mundo de 128 bloques de altura, Y ∈ [WORLD_MIN_Y, WORLD_MAX_Y]
// (−64..+63). El terreno queda anclado en y≈0: 64 bloques de subsuelo para
// minar/cuevas y 64 por encima para construir. Mantener en sincronía con
// public/constants.js (lo audita tests/unit-sync.js).
const WORLD_HEIGHT = 128;
const WORLD_MIN_Y = -64; // fondo del mundo (capa de bedrock)
const WORLD_MAX_Y = WORLD_MIN_Y + WORLD_HEIGHT - 1; // 63
const TICK_MS = 50; // 20 ticks por segundo
const SAVE_INTERVAL_MS = 30000; // Guardar cada 30s
const VIEW_DISTANCE_CHUNKS = 6; // Chunks generados alrededor de cada jugador al conectar
const UNLOAD_DISTANCE_CHUNKS = 10; // Chunks sin jugadores a menos de esta distancia (en chunks) se descargan
const UNLOAD_INTERVAL_MS = 10000; // Cada 10s se buscan chunks lejanos que descargar
const DAY_CYCLE_MS = 1200000; // 20 minutos como Minecraft: ~10 de día, ~10 de noche (atardecer/amanecer suaves en el cliente)
// Fase 18 (C-1): franjas del ciclo día/noche estilo MC sobre DAY_CYCLE_MS
// (20 min = día 10 / atardecer 1,5 / noche 7 / amanecer 1,5), expresadas
// como fracción del ciclo. Fase 0 = amanecer, 0.25 = mediodía, 0.5 =
// atardecer, 0.75 = medianoche. La NOCHE ESTRICTA (spawn hostil, dormir)
// empieza al terminar el atardecer; la QUEMA SOLAR aplica fuera de ella.
// Mantener en sincronía con public/constants.js (lo audita unit-sync) y con
// public/daymath.js (helpers puros segmentOf/isNightPhase).
const DAY_PHASES = {
	dawnEnd: 0.075, // fin del amanecer (1,5 min) → empieza el día
	dayEnd: 0.575, // fin del día (10 min) → empieza el atardecer
	duskEnd: 0.65 // fin del atardecer (1,5 min) → empieza la noche (7 min)
};
// ¿Es noche ESTRICTA en el instante t (ms dentro del ciclo)? Antes el umbral
// era DAY_CYCLE_MS/2 (binario 10/10); con las franjas MC la noche son 7 min
// (fase ≥ duskEnd). Lo usan spawnMobs (hostiles), dormir y el mainLoop.
const isNightTime = (t) => (t % DAY_CYCLE_MS) / DAY_CYCLE_MS >= DAY_PHASES.duskEnd;
// ¿Es día ESTRICTO? (sin amanecer ni atardecer): quema solar y pasivos.
const isDayTime = (t) => {
	const f = (t % DAY_CYCLE_MS) / DAY_CYCLE_MS;
	return f >= DAY_PHASES.dawnEnd && f < DAY_PHASES.dayEnd;
};
// Fase 8 (B8): fases lunares — ciclo completo cada 8 días de juego, derivado
// del MISMO reloj del mundo (worldTime) + offset determinista por semilla.
const MOON_DAYS = 8;
const MOON_CYCLE_MS = DAY_CYCLE_MS * MOON_DAYS;

// Offset por semilla (determinista y estable, sin cripto): mismo mundo → la
// luna está en la misma fase en el mismo instante, para todos los jugadores
// y entre reinicios (el reloj base es Date.now(), no un contador de ticks).
function seedMoonOffsetMs(seed) {
	// Defensivo (Fase 17 A1): en modo menú la semilla activa puede ser null.
	let h = 0;
	for (let i = 0; i < (seed || "").length; i++)
		h = (h * 31 + seed.charCodeAt(i)) >>> 0;
	return h % MOON_CYCLE_MS;
}
// Gracia inicial de spawn (Fase 8, B2): tras entrar o reaparecer, N ms sin
// daño de MOBS (lava/caída/hambre siguen doliendo). Da tiempo a orientarse
// sin morir en el spawn; la zona segura de spawn es la otra mitad del fix.
const SPAWN_GRACE_MS = 30000;
// Auditoría 2026-08-09 (§4.3): distancia de despawn de mobs (MC Java: los
// mobs se eliminan a >128 bloques del jugador). Las mascotas con dueño se
// excluyen (siguen al jugador esté donde esté).
const DESPAWN_DIST = 128;
// Auditoría 2026-08-09 (§3.1): límite de conexiones simultáneas (jugadores +
// conexiones a medias). Cada conexión genera un radio de chunks al conectar y
// entra en todos los broadcasts; un tope evita el agotamiento de memoria/CPU
// por inundación de sockets.
const MAX_CONNECTIONS = 10;
// Auditoría 2026-08-09 (§3.1): rate-limit de mensajes por conexión. El
// protocolo emite ~20 moves/s en juego normal; el máximo admisible (30/s)
// deja margen a bloqueos del cliente (jitter/tabloss) sin permitir flood.
// superarlo corta la conexión (el cliente la reintenta).
const MAX_MSG_RATE = 30;
// Fase 17 (A1): la semilla se configura con la env var SEED. Sin SEED el
// servidor arranca en MODO MENÚ: no carga ningún mundo hasta que el primer
// jugador elige/crea uno (join_world). Con SEED (p. ej. los E2E) arranca
// directo al mundo como siempre. `SEED` conserva el default histórico
// (miSemilla2026) para que los tests deterministas y los ruidos por defecto
// no cambien; `currentSeed` (la semilla ACTIVA) es null en modo menú.
const SEED = process.env.SEED || "miSemilla2026";
// Modo menú = ausencia de SEED en el entorno (boot). El mundo se carga al
// recibir `join_world`; al quedarse vacío el servidor vuelve al menú.
const MENU_MODE = !process.env.SEED;

// Skins oficiales de jugador (Fase 17): el servidor es la fuente de verdad
// del wire (los valida en ?skin= y set_skin); el cliente tiene la lista
// paralela en public/skins.js (SKINS). Lo audita tests/unit-skins.js
// (sincronía entre ambos lados, patrón de B/I y DURABILITY).
const PLAYER_SKINS = [
	"steve",
	"alex",
	"noor",
	"sunny",
	"ari",
	"zuri",
	"makena",
	"kai",
	"efe"
];

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
const VOID_Y = -72; // por debajo del fondo del mundo (−64) → caída al vacío

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
	// Fase 17 (A1): semilla ACTIVA — null en modo menú (sin mundo cargado);
	// join_world la fija al elegir/crear el mundo. En el arranque clásico
	// (SEED en el entorno) es la SEED. El directorio se deriva de ella
	// (seedDir).
	currentSeed: process.env.SEED || null, // semilla activa (el directorio se deriva de ella)
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

const SCHEMA_VERSION = 6;
// v6: mundo −64..+63 (chunks 16×128×16; migración de v5)
// Fase 11 (Bloque B): 3 → 4 — se añadieron bloques nuevos (jungla/pantano),
// sin cambio de estructura del guardado (los chunks viejos v3 cargan igual:
// simplemente no contienen los bloques nuevos; se regeneran al explorar).
// Fase 12 (Bloque D): 4 → 5 — buildMeta persiste ahora mascotas (ownerId/
// ownerName/sitting) y el tamaño del slime (slimeSize); un mundo v4 sin esos
// campos carga igual (restoreMobs los deja por defecto: mob salvaje, slime
// grande), migración retrocompatible cubierta por unit-persistencia.
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
	VINES: 43, // liana (no sólida, decorativa; cuelga de las copas)
	// Fase 13 (L2/L3): puertas, escaleras, losas y vallas (paridad MC)
	OAK_DOOR: 48, // puerta de madera (se abre con clic derecho; 2 celdas de alto)
	IRON_DOOR: 49, // puerta de hierro (solo clic derecho)
	OAK_STAIRS: 50, // escaleras de madera (colisión por forma: 2 escalones)
	STONE_STAIRS: 51, // escaleras de piedra
	OAK_SLAB: 60, // losa de madera (media caja: se puede estar encima y pasar por debajo no)
	STONE_SLAB: 61, // losa de piedra
	OAK_FENCE: 70, // valla de madera (colisión central + laterales, se ve a través)
	OAK_FENCE_GATE: 71 // portón de valla (se abre/cierra como una puerta)
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
	// Fase 18 (C-3): zanahoria ya existía (116); patata y patata al horno son
	// ítems NUEVOS (121/122) sincronizados en ambos constants + receta de horno.
	POTATO: 121, // patata cruda — comestible (1 hambre), se cocina al horno
	BAKED_POTATO: 122, // patata al horno — 5 hambre (MC)
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
	// Fase 13 (L5): armadura de oro (232-235) y de malla (236-239) — mismas
	// formas que el resto de materiales. Oro: puntos/durabilidad de MC Java
	// (2-5-3-1 / 77-112-105-91). Malla: puntos de MC (2-5-4-1) y durabilidad
	// de hierro. Como en Minecraft, la malla NO tiene receta de crafteo (se
	// obtiene de drops/cofres); los ítems quedan para creative/commands.
	GOLD_HELMET: 232,
	GOLD_CHESTPLATE: 233,
	GOLD_LEGGINGS: 234,
	GOLD_BOOTS: 235,
	CHAIN_HELMET: 236,
	CHAIN_CHESTPLATE: 237,
	CHAIN_LEGGINGS: 238,
	CHAIN_BOOTS: 239,
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
	DIAMOND_HOE: 244,
	// Fase 12 (Bloque A): ítems nuevos de los mobs por bioma.
	// TRIDENT: arma arrojadiza (no crafteable) — drop del ahogado (~15%) y
	// usable por el jugador (clic derecho lanza; al impactar o agotar su vida
	// se puede recoger del suelo). No coloca bloque ni se craftea.
	TRIDENT: 245,
	// SLIME_BALL: material del slime — drop de los slimes pequeños (0-1). Sin
	// recetas en esta fase (material de colección, como el hilo de la araña).
	SLIME_BALL: 246,
	// Fase 13 (L1): arco y flechas del jugador (paridad MC). El arco es una
	// herramienta con durabilidad propia (384, no se apila) que dispara
	// flechas (daño 9) consumiendo ARROW; las flechas impactadas/expiradas
	// vuelven al inventario (recogibles, como el tridente). FLINT cae de la
	// grava (~10%) y FEATHER del pollo — materiales de la receta de flechas.
	BOW: 247,
	ARROW: 248,
	// Fase 13 (L4): cubo de líquidos — recoger agua/lava de una fuente y
	// verterla donde se mira (clic derecho). El cubo vacío es reutilizable:
	// recoger devuelve WATER_BUCKET/LAVA_BUCKET y verter devuelve BUCKET.
	BUCKET: 249,
	WATER_BUCKET: 250,
	LAVA_BUCKET: 251,
	FLINT: 252,
	FEATHER: 253,
	// Fase 13 (L5): compás — crafteable (4 lingotes de hierro + redstone) como
	// en MC. Ítem de colección sin mecánica propia (sin brújula funcional).
	COMPASS: 254,
	// Fase 16 (D2): carne podrida (drop del zombi) y pólvora (drop del creeper
	// y material del TNT) — paridad con Minecraft.
	ROTTEN_FLESH: 255,
	GUNPOWDER: 256,
	// Fase 18 (C-4): carbón vegetal — 1 tronco → 1 CHARCOAL (horno), como en
	// MC. El COAL (101) sigue saliendo SOLO de la mena; el CHARCOAL es ítem
	// distinto (paridad tabla #9).
	CHARCOAL: 257
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
// Fase 13 (L2/L3): bloques con COLISIÓN POR FORMA (la física consulta la
// forma real, no la celda completa):
//  - losa: sólida solo en la mitad inferior de la celda (media caja);
//  - escalera: sólida solo en el escalón inferior (el superior se sube);
//  - valla: sólida en la celda (no se atraviesa) aunque visualmente se vea
//    a través (como en MC).
//  - puerta/portón: la SOLIDEZ depende del estado (cerrada sólida, abierta
//    no) — lo resuelve world.isSolidAt/state.doors, no esta función pura.
const SHAPED_SOLIDS = new Set([
	B.OAK_SLAB,
	B.STONE_SLAB,
	B.OAK_STAIRS,
	B.STONE_STAIRS
]);
const isSolidBlock = (id) =>
	id !== B.AIR &&
	id !== B.WATER &&
	id !== B.LAVA &&
	id !== B.TORCH &&
	id !== B.BED &&
	!NON_SOLID_PLANTS.has(id);
// Fase 13 (L2/L3): puertas y portones (el estado de apertura decide la
// solidez; ver state.doors y world.isSolidAt).
const isDoor = (id) =>
	id === B.OAK_DOOR || id === B.IRON_DOOR || id === B.OAK_FENCE_GATE;
const FUEL_ITEMS = new Set([
	B.OAK_LOG,
	B.BIRCH_LOG,
	B.SPRUCE_LOG,
	B.JUNGLE_LOG,
	B.PLANKS,
	I.COAL, // Fase 14 (Bloque B): el carbón también arde
	// Fase 18 (C-4): el carbón vegetal arde igual que el carbón (1600 t, MC)
	I.CHARCOAL,
	I.STICK
]);
// Fase 16 (D1): ticks de fundido por unidad de combustible (paridad MC). El
// horno consume la unidad real (fuelCount) y se apaga al agotar sus ticks.
const FUEL_TICKS = {
	[B.OAK_LOG]: 300,
	[B.BIRCH_LOG]: 300,
	[B.SPRUCE_LOG]: 300,
	[B.JUNGLE_LOG]: 300,
	[B.PLANKS]: 300,
	[I.COAL]: 1600, // un carbón funde 8 ítems de 200 ticks
	[I.CHARCOAL]: 1600, // Fase 18 (C-4): carbón vegetal, mismo poder que el carbón
	[I.STICK]: 100
};

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
	// Fase 14 (Bloque B): conejo asado 5/6 (antes 8/12.8, igualaba al bistec).
	[I.COOKED_RABBIT]: { food: 5, saturation: 6 },
	// Fase 9 (Bloque F): pan y pescado (crudo/cocinado), valores estilo MC
	[I.BREAD]: { food: 5, saturation: 6 },
	[I.COD]: { food: 2, saturation: 0.4 },
	[I.COOKED_COD]: { food: 5, saturation: 6 },
	// Fase 18 (C-3): zanahoria y patata ahora son COMIDA (antes solo cría/
	// creativo). Valores MC Java: zanahoria 3/3,6, patata 1/0,6, patata al
	// horno 5/6 (paridad tabla #8).
	[I.CARROT]: { food: 3, saturation: 3.6 },
	[I.POTATO]: { food: 1, saturation: 0.6 },
	[I.BAKED_POTATO]: { food: 5, saturation: 6 }
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
	[B.GRAVEL]: 0.6, // Fase 10 (D1) + Fase 13 (paridad B5): MC dureza 0.6 (antes 0.4)
	[B.TNT]: 0.05, // Fase 10 (D2): se rompe al instante (como en MC)
	[B.GRASS]: 0.6,
	[B.DIRT]: 0.5, // Fase 13 (paridad B5): MC dureza 0.5 (antes 0.75)
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
	[B.DIAMOND_ORE]: 3.0,
	// Fase 13 (L2/L3): durezas estilo MC — puertas 3 (madera) / 5 (hierro),
	// escaleras 2 (madera) / 2 (piedra), losas 2, vallas 2, portón 2.
	[B.OAK_DOOR]: 3.0,
	[B.IRON_DOOR]: 5.0,
	[B.OAK_STAIRS]: 2.0,
	[B.STONE_STAIRS]: 2.0,
	[B.OAK_SLAB]: 2.0,
	[B.STONE_SLAB]: 2.0,
	[B.OAK_FENCE]: 2.0,
	[B.OAK_FENCE_GATE]: 2.0
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
	[B.SNOW]: "snow",
	// Fase 13 (L2/L3): las puertas se rompen mejor con hacha (madera) o pico
	// (hierro); simplificado: hacha para las de madera, pico para hierro.
	[B.OAK_DOOR]: "wood",
	[B.IRON_DOOR]: "stone",
	[B.OAK_STAIRS]: "wood",
	[B.STONE_STAIRS]: "stone",
	[B.OAK_SLAB]: "wood",
	[B.STONE_SLAB]: "stone",
	[B.OAK_FENCE]: "wood",
	[B.OAK_FENCE_GATE]: "wood"
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
// Fase 14 (Bloque B): los minerales además exigen un TIER mínimo de pico
// (PICKAXE_TIER vs ORE_TIER): minerales de hierro/oro → pico de piedra,
// redstone/diamante/esmeralda → pico de hierro.
function canHarvest(tool, block) {
	if (isSword(tool)) return false;
	if (
		block === B.STONE ||
		block === B.COBBLESTONE ||
		block === B.MOSSY_COBBLESTONE
	)
		return isPickaxe(tool);
	if (ORE_TIER[block] !== undefined) {
		if (!isPickaxe(tool)) return false;
		return (PICKAXE_TIER[tool] ?? 0) >= ORE_TIER[block];
	}
	if (block === B.GLASS) return false; // el vidrio no suelta item sin Silk Touch (simplificado)
	return true;
}

// ============================================================
// DURABILIDAD DE HERRAMIENTAS Y DAÑO DE ESPADA (Fase 5)
// Fase 13 (paridad B6): valores OFICIALES de Minecraft Java — madera 59,
// piedra 131, hierro 250, oro 32, diamante 1561 (antes 60/132/251/33/1562).
// Mantener en sincronía con DURABILITY
// de public/constants.js (lo verifica tests/audit-fase5.js).
// ============================================================
const TOOL_DURABILITY = {
	[I.WOODEN_PICKAXE]: 59,
	[I.STONE_PICKAXE]: 131,
	[I.IRON_PICKAXE]: 250,
	[I.GOLDEN_PICKAXE]: 32,
	[I.DIAMOND_PICKAXE]: 1561,
	[I.WOODEN_AXE]: 59,
	[I.STONE_AXE]: 131,
	[I.IRON_AXE]: 250,
	[I.GOLDEN_AXE]: 32,
	[I.DIAMOND_AXE]: 1561,
	[I.WOODEN_SHOVEL]: 59,
	[I.STONE_SHOVEL]: 131,
	[I.IRON_SHOVEL]: 250,
	[I.GOLDEN_SHOVEL]: 32,
	[I.DIAMOND_SHOVEL]: 1561,
	[I.WOODEN_SWORD]: 59,
	[I.STONE_SWORD]: 131,
	[I.IRON_SWORD]: 250,
	[I.GOLDEN_SWORD]: 32,
	[I.DIAMOND_SWORD]: 1561,
	// Fase 9 (Bloque C): azadas (misma durabilidad que la herramienta de su material)
	[I.WOODEN_HOE]: 59,
	[I.STONE_HOE]: 131,
	[I.IRON_HOE]: 250,
	[I.GOLDEN_HOE]: 32,
	[I.DIAMOND_HOE]: 1561,
	// Auditoría 2026-08-09 (§4.2): tijeras 238 (MC Java). Al estar aquí las
	// considera isTool → NO se apilan, llevan durabilidad propia y esquilar
	// las desgasta (net.js llama applyToolWear tras aplicar el corte).
	[I.SHEARS]: 238
};
// Alias de durabilidad de azadas (para addToInventory/applyToolWear).
const HOE_DURABILITY = TOOL_DURABILITY;
// Fase 13 (L1): el arco es una "herramienta" a efectos de inventario (no se
// apila y lleva su durabilidad BOW_DURABILITY), pero su desgaste NO va por
// applyToolWear al minar/atacar: lo gestiona applyBowWear al disparar
// (players.js). Por eso no está en TOOL_DURABILITY.
const isTool = (id) => !!TOOL_DURABILITY[id] || isHoe(id) || id === I.BOW;

// ============================================================
// ARMADURA (Fase 7): reducción de daño por pieza y material.
// Cada pieza reduce un porcentaje del daño bruto y tiene una durabilidad
// que se desgasta al recibir daño. El daño real = bruto × (1 − reducción
// total, tope 0.8). La fuente de verdad del servidor; el cliente solo pinta
// los 4 slots del inventario con su barra de durabilidad.
// ============================================================
const ARMOR_SLOTS = ["helmet", "chestplate", "leggings", "boots"];
// Fase 13 (paridad B4): puntos de armadura por pieza como Minecraft Java
// (casco-pechera-pantalones-botas: cuero 1-3-2-1, hierro 2-6-5-2, diamante
// 3-8-6-3). La reducción real se calcula en applyArmorDamageReduction como
// min(puntos × 4%, 80%) — la fórmula oficial de MC. Antes eran porcentajes
// fijos por pieza (pechera hierro 12% ≈ 3 puntos → el total quedaba muy por
// debajo de MC: hierro 36% vs 60% real).
const ARMOR_POINTS = {
	[I.LEATHER_HELMET]: 1,
	[I.LEATHER_CHESTPLATE]: 3,
	[I.LEATHER_LEGGINGS]: 2,
	[I.LEATHER_BOOTS]: 1,
	[I.IRON_HELMET]: 2,
	[I.IRON_CHESTPLATE]: 6,
	[I.IRON_LEGGINGS]: 5,
	[I.IRON_BOOTS]: 2,
	[I.DIAMOND_HELMET]: 3,
	[I.DIAMOND_CHESTPLATE]: 8,
	[I.DIAMOND_LEGGINGS]: 6,
	[I.DIAMOND_BOOTS]: 3,
	// Fase 13 (L5): oro y malla (valores oficiales de MC Java)
	[I.GOLD_HELMET]: 2,
	[I.GOLD_CHESTPLATE]: 5,
	[I.GOLD_LEGGINGS]: 3,
	[I.GOLD_BOOTS]: 1,
	[I.CHAIN_HELMET]: 2,
	[I.CHAIN_CHESTPLATE]: 5,
	[I.CHAIN_LEGGINGS]: 4,
	[I.CHAIN_BOOTS]: 1
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
	[I.DIAMOND_BOOTS]: 429,
	// Fase 13 (L5): oro (77-112-105-91) y malla (igual que el hierro, como MC)
	[I.GOLD_HELMET]: 77,
	[I.GOLD_CHESTPLATE]: 112,
	[I.GOLD_LEGGINGS]: 105,
	[I.GOLD_BOOTS]: 91,
	[I.CHAIN_HELMET]: 165,
	[I.CHAIN_CHESTPLATE]: 240,
	[I.CHAIN_LEGGINGS]: 225,
	[I.CHAIN_BOOTS]: 195
};
const isArmor = (id) => !!ARMOR_POINTS[id];

// ============================================================
// ARCO Y FLECHAS (Fase 13, L1): valores oficiales de Minecraft Java.
// BOW_DURABILITY 384 (el arco no está en TOOL_DURABILITY: no se desgasta al
// minar — solo al disparar). BOW_DAMAGE 9 es el daño de la flecha del
// jugador (la flecha del esqueleto hace 3, ARROW_DAMAGE en mobs.js).
// Mantener en sincronía con public/constants.js (lo verifica unit-sync).
// ============================================================
const BOW_DURABILITY = 384;
const BOW_DAMAGE = 9;
const isBow = (id) => id === I.BOW;
const isArrow = (id) => id === I.ARROW;

// Reduce el daño según la armadura del jugador: desgasta las piezas (-1 por
// cada 4 de daño bruto, mínimo 1) y devuelve el daño real. Las piezas que
// llegan a 0 se retiran. Si el jugador no tiene armadura, devuelve el daño.
// Simplificación documentada vs MC (Fase 13, paridad B4): el daño real se
// redondea con Math.round (MC descarta la fracción y reparte el desgaste
// entre las piezas con un patrón pseudoaleatorio) — el desvío es de ≤1 HP en
// golpes bajos y no afecta al equilibrio; se mantiene round por ser
// determinista y fácil de auditar.
function applyArmorDamageReduction(player, rawDamage) {
	if (!player.armor) return rawDamage;
	let points = 0;
	for (const slot of ARMOR_SLOTS) {
		const piece = player.armor[slot];
		if (piece && isArmor(piece.id)) {
			points += ARMOR_POINTS[piece.id] || 0;
			const wear = Math.max(1, Math.floor(rawDamage / 4));
			piece.durability = Math.max(
				0,
				(piece.durability ?? ARMOR_DURABILITY[piece.id]) - wear
			);
			if (piece.durability <= 0) player.armor[slot] = null;
		}
	}
	// Fórmula oficial de Minecraft: cada punto de armadura reduce 4% (tope 80%).
	const reduction = Math.min(points * 4, 80) / 100;
	return Math.max(0, Math.round(rawDamage * (1 - reduction)));
}
// Daño por golpe de espada (Fase 5 progresión + Fase 13 paridad B3): valores
// oficiales de Minecraft Java 1.9+ (madera 4, piedra 5, hierro 6, oro 4,
// diamante 7). Sin espada el daño es 1 (mano desnuda, ver net.js).
const SWORD_DAMAGE = {
	[I.WOODEN_SWORD]: 4,
	[I.STONE_SWORD]: 5,
	[I.IRON_SWORD]: 6,
	[I.GOLDEN_SWORD]: 4,
	[I.DIAMOND_SWORD]: 7
};
// Las azadas no hacen daño extra (en Minecraft tampoco; sirven para arar).

// Auditoría 2026-08-09 (§3.7): daño cuerpo a cuerpo de herramientas no-espada.
// En MC Java 1.9+ la HACHA golpea más fuerte (madera 7, piedra 9, hierro 9,
// diamante 9/10) pero con attack speed lento (~0.8-1.0). ESTE CLON no simula
// el cooldown de ataque del cliente, así que un hacha a 9 haría cada golpe
// tan rápido como la espada y rompería la progresión: se iguala el daño del
// hacha a la espada del mismo material (progresión constante) y picos/palas
// quedan con su daño MC (2-3 base, hierro 4, diamante 5). La azada sigue en 1
// (SWORD_DAMAGE[tool] || 1).
const TOOL_DAMAGE = {
	[I.WOODEN_AXE]: 4,
	[I.STONE_AXE]: 5,
	[I.IRON_AXE]: 6,
	[I.GOLDEN_AXE]: 4,
	[I.DIAMOND_AXE]: 7,
	[I.WOODEN_PICKAXE]: 2,
	[I.STONE_PICKAXE]: 3,
	[I.IRON_PICKAXE]: 4,
	[I.GOLDEN_PICKAXE]: 2,
	[I.DIAMOND_PICKAXE]: 5,
	[I.WOODEN_SHOVEL]: 2,
	[I.STONE_SHOVEL]: 3,
	[I.IRON_SHOVEL]: 4,
	[I.GOLDEN_SHOVEL]: 2,
	[I.DIAMOND_SHOVEL]: 5
};

// ============================================================
// EXPERIENCIA Y NIVELES (Fase 5 simple + Fase 9 curva MC + Fase 13 paridad)
// XP por matar mobs y por minar minerales. La salud máxima es SIEMPRE 20
// (paridad B1: en Minecraft real el nivel NO da vida; eso era de mods). La
// XP se conserva al morir (simplificado documentado).
// Fase 13 (paridad B2): curva de coste por nivel OFICIAL de Minecraft Java
// por tramos — 2L+7 (niveles 0-15), 5L−38 (16-30), 9L−158 (31+):
// 7, 9, 11, 13, 15... 37, 42, 47... 112, 121... El coste total a nivel 30
// es 1.395 XP (la aproximación lineal anterior 7+3.5L daba mucho menos).
// XP_PER_LEVEL se mantiene exportado por compatibilidad con
// tests/audit-fase5 (paridad con el cliente) aunque la lógica ya no lo use.
// ============================================================
const XP_PER_LEVEL = 100; // retrocompat: paridad auditada, sin uso en la lógica actual
// XP necesaria para pasar del nivel `level` al siguiente (curva MC).
function xpToNext(level) {
	if (level < 16) return 2 * level + 7;
	if (level < 31) return 5 * level - 38;
	return 9 * level - 158;
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
const MOB_XP = {
	zombie: 5,
	creeper: 5,
	skeleton: 5, // Fase 14 (Bloque B): 5 (era 7)
	enderman: 5, // Fase 14 (Bloque B): 5 (era 9)
	spider: 5, // Fase 14 (Bloque B): 5 (era 7)
	// Fase 16 (D6): wolf y slime los sobrescribe mobXp() (mobs.js) — la tabla
	// de aquí es solo el fallback si se elimina ese caso especial, y debe
	// reflejar la media real para no inducir regresiones:
	wolf: 2, // D6: suelta 1-3 aleatorio (2 = media del fallback)
	cow: 3,
	pig: 3,
	chicken: 2,
	sheep: 3,
	rabbit: 2,
	bee: 1, // Fase 9 (Bloque F): pasivo volador (versión simplificada)
	// Fase 12 (Bloque A): XP de los mobs por bioma
	slime: 1, // por tamaño (grande 4, mediano 2, pequeño 1) — lo aplica mobXp()
	ocelot: 2,
	cat: 2,
	drowned: 5
};
const ORE_XP = {
	[B.COAL_ORE]: 1,
	[B.IRON_ORE]: 2,
	[B.GOLD_ORE]: 3,
	[B.DIAMOND_ORE]: 5,
	[B.REDSTONE_ORE]: 1,
	[B.EMERALD_ORE]: 5
};
// Fase 14 (Bloque B): QUÉ suelta cada mineral al minarlo (paridad 1.17 con
// fundición implícita, sin ítem "raw"). El bloque de mena EN SÍ no es un
// ítem utilizable: el clon solo dropea la gema/lingote/carbón directamente.
// El crafteo aquí NO mete artefactos: no existen "bloques de mena" en el
// inventario ni recetas para ellos.
const ORE_DROP = {
	[B.COAL_ORE]: I.COAL,
	[B.IRON_ORE]: I.IRON_INGOT,
	[B.GOLD_ORE]: I.GOLD_INGOT,
	[B.DIAMOND_ORE]: I.DIAMOND,
	[B.REDSTONE_ORE]: I.REDSTONE,
	[B.EMERALD_ORE]: I.EMERALD
};
// Fase 14 (Bloque B): nivel de pico mínimo necesario por mineral (paridad MC
// simplificada): hierro/oro → pico de piedra, redstone/diamante/esmeralda →
// pico de hierro. El carbón vale con cualquier pico.
const ORE_TIER = {
	[B.COAL_ORE]: 1,
	[B.IRON_ORE]: 2,
	[B.GOLD_ORE]: 2,
	[B.REDSTONE_ORE]: 3,
	[B.DIAMOND_ORE]: 3,
	[B.EMERALD_ORE]: 3
};
// Fase 14 (Bloque B): tier de cosecha por pico (estilo Minecraft — madera 1,
// piedra 2, hierro 3, oro 1, diamante 4). El pico de oro cosecha como el de
// madera (curiosidad oficial: es "rápido pero ligero").
const PICKAXE_TIER = {
	[I.WOODEN_PICKAXE]: 1,
	[I.STONE_PICKAXE]: 2,
	[I.IRON_PICKAXE]: 3,
	[I.GOLDEN_PICKAXE]: 1,
	[I.DIAMOND_PICKAXE]: 4
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
	// Fase 13 (L2/L3): puertas, escaleras, losas, vallas y portón
	B.OAK_DOOR,
	B.IRON_DOOR,
	B.OAK_STAIRS,
	B.STONE_STAIRS,
	B.OAK_SLAB,
	B.STONE_SLAB,
	B.OAK_FENCE,
	B.OAK_FENCE_GATE,
	// Minerales y materiales
	B.COAL_ORE,
	B.IRON_ORE,
	B.GOLD_ORE,
	B.DIAMOND_ORE,
	B.REDSTONE_ORE,
	B.EMERALD_ORE,
	I.COAL,
	I.CHARCOAL, // Fase 18 (C-4): carbón vegetal en el creativo
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
	// Fase 18 (C-3): patata y patata al horno en el creativo
	I.POTATO,
	I.BAKED_POTATO,
	I.SEEDS,
	// Fase 11 (C): tijeras (esquilar ovejas)
	I.SHEARS,
	// Fase 12 (Bloque A): ítems nuevos en el inventario creativo
	I.TRIDENT,
	// Fase 13 (L5): armadura de oro y malla + compás
	I.GOLD_HELMET,
	I.GOLD_CHESTPLATE,
	I.GOLD_LEGGINGS,
	I.GOLD_BOOTS,
	I.CHAIN_HELMET,
	I.CHAIN_CHESTPLATE,
	I.CHAIN_LEGGINGS,
	I.CHAIN_BOOTS,
	I.COMPASS,
	I.SLIME_BALL,
	// Fase 13 (L1/L4): arco, flechas, materiales y cubos en el creativo
	I.BOW,
	I.ARROW,
	I.FLINT,
	I.FEATHER,
	I.BUCKET,
	I.WATER_BUCKET,
	I.LAVA_BUCKET
];
// Todos los ítems/armas/herramientas del juego (para el picker creativo).
const ALL_TOOLS_AND_ARMOR = [
	...Object.values(I).filter((v) => v >= 200 && v <= 239), // herramientas + armadura (incl. oro/malla, Fase 13 L5)
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
	rabbit: 0xd9c8a8, // Fase 5: nuevo pasivo
	// Fase 12 (Bloque A): mobs por bioma — slime (verde gel), ocelote (naranja
	// atigrado), gato (gris tuxedo) y ahogado (verde-azulado de no-muerto).
	slime: 0x7ac74f,
	ocelot: 0xe8a03c,
	cat: 0x9a9a9a,
	drowned: 0x4a8f6f
};
const HOSTILE = new Set([
	"zombie",
	"creeper",
	"skeleton",
	"enderman",
	"spider",
	"wolf",
	// Fase 12 (Bloque A): slime (pantano) y ahogado (océanos/ríos) atacan al
	// jugador; el ocelote y el gato son pasivos (no van en HOSTILE).
	"slime",
	"drowned"
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
	WORLD_MIN_Y,
	WORLD_MAX_Y,
	TICK_MS,
	SAVE_INTERVAL_MS,
	VIEW_DISTANCE_CHUNKS,
	UNLOAD_DISTANCE_CHUNKS,
	UNLOAD_INTERVAL_MS,
	DAY_CYCLE_MS,
	DAY_PHASES, // Fase 18 (C-1): franjas día/noche estilo MC (fracciones del ciclo)
	isNightTime, // C-1: noche estricta (fase ≥ duskEnd) — spawn hostil/dormir
	isDayTime, // C-1: día estricto (sin crepúsculos) — quema solar
	MOON_DAYS,
	MOON_CYCLE_MS,
	seedMoonOffsetMs,
	SPAWN_GRACE_MS,
	DESPAWN_DIST,
	SEED,
	MENU_MODE, // Fase 17 (A1): sin SEED el servidor arranca sin mundo activo
	PLAYER_SKINS, // Fase 17: lista oficial de skins (cliente: public/skins.js)
	OPS,
	EYE_HEIGHT,
	FALL_DAMAGE_FREE_BLOCKS,
	VOID_Y,
	JUMP_SPEED,
	GRAVITY,
	WS_MAX_PAYLOAD,
	MAX_CONNECTIONS,
	MAX_MSG_RATE,
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
	isDoor,
	SHAPED_SOLIDS,
	GRAVITY_BLOCKS,
	FUEL_ITEMS,
	FUEL_TICKS,
	TNT_FUSE_MS,
	TNT_RADIUS,
	TNT_DAMAGE,
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
	TOOL_DAMAGE,
	ARMOR_SLOTS,
	ARMOR_POINTS,
	ARMOR_DURABILITY,
	BOW_DURABILITY,
	BOW_DAMAGE,
	isBow,
	isArrow,
	isBucket: (id) =>
		id === I.BUCKET || id === I.WATER_BUCKET || id === I.LAVA_BUCKET,
	WORLD_SIZES,
	worldHalfExtent,
	worldSizeBlocks,
	sanitizeWorldSize,
	isArmor,
	applyArmorDamageReduction,
	XP_PER_LEVEL,
	MOB_XP,
	ORE_XP,
	ORE_DROP,
	ORE_TIER,
	PICKAXE_TIER,
	BLOCK_HARDNESS,
	TOOL_TIER_SPEED,
	miningSpeed,
	breakSeconds,
	canHarvest
};
