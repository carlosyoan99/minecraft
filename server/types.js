// @ts-check
// ============================================================
// TIPOS COMPARTIDOS SERVIDOR-CLIENTE (Fase 22.2, Bloque C)
// Definiciones @typedef para las formas que hoy solo existen "de
// palabra": stack de inventario, mensajes WS y constantes B/I.
//
// Estos tipos NO se importan en runtime (JSDoc es solo anotación);
// se referencia vía @type {import('./types.js').Stack} desde cualquier
// archivo con // @ts-check.
// ============================================================

/**
 * Stack de inventario — slot de inventario, cofre o drop.
 * Coincide con el formato JSON del wire (id, count) y con
 * ItemStack de server/items.js (que añade durability).
 * @typedef {{ id: number, count: number }} Stack
 */

/**
 * Mensaje WebSocket enviado desde el cliente al servidor.
 * @typedef {{ event: string, data: object }} ClientMessage
 */

/**
 * Mensaje WebSocket enviado desde el servidor al cliente.
 * @typedef {{ event: string, data: object }} ServerMessage
 */

/**
 * Bloque del mundo — ID numérica del bloque (B.* en constants.js).
 * @typedef {number} BlockId
 */

/**
 * Ítem — ID numérica del ítem (I.* en constants.js).
 * Puede ser un ítem standalone o la representación de un bloque.
 * @typedef {number} ItemId
 */

/**
 * Armadura del jugador — 4 slots, cada uno con su Stack o null.
 * @typedef {{
 *   helmet: Stack|null,
 *   chestplate: Stack|null,
 *   leggings: Stack|null,
 *   boots: Stack|null
 * }} Armor
 */

/**
 * Punto de reaparición del jugador (cama).
 * @typedef {{ x: number, y: number, z: number }} RespawnPoint
 */

/**
 * Jugador — instancia de la clase Player (server/players.js).
 * Creada con Object.assign(this, fields) en el constructor;
 * los campos del literal de net.js handleConnection son la fuente
 * de verdad. Métodos (addItem/damage/eat/...) en el prototipo.
 * @typedef {{
 *   id: string,
 *   ws: import('ws').WebSocket,
 *   name: string,
 *   skin: string,
 *   isOp: boolean,
 *   x: number,
 *   y: number,
 *   z: number,
 *   yaw: number,
 *   pitch: number,
 *   health: number,
 *   maxHealth: number,
 *   xp: number,
 *   level: number,
 *   gamemode: string,
 *   flying: boolean,
 *   food: number,
 *   saturation: number,
 *   foodAccum: number,
 *   regenAccum: number,
 *   starveAccum: number,
 *   lastMoveTime: number,
 *   renderDistance: number,
 *   inventory: (Stack|null)[],
 *   selectedSlot: number,
 *   craftingGrid: (Stack|null)[],
 *   openFurnace: string|null,
 *   openChest: string|null,
 *   bundle: (Stack|null)[],
 *   openBundle: boolean,
 *   mining: object|null,
 *   armor: Armor,
 *   respawnPoint: RespawnPoint|null,
 *   fallFromY: number|null,
 *   lastGroundY: number|null,
 *   vyObs: number,
 *   airTimeMs: number,
 *   fallVy: number,
 *   speedSamples: object[],
 *   spawnGraceUntil: number,
 *   lastThrowAt?: number,
 *   inMenu?: boolean
 * }} Player
 */

/**
 * Mundo — instancia de la clase World (server/world.js).
 * La clase vacía recibe sus métodos en el prototipo (getBlock, setBlock,
 * ensureChunksAround, findSpawn, etc.). Se exporta como instancia
 * única (module.exports = world).
 * @typedef {{
 *   getBlock: (x: number, y: number, z: number) => number,
 *   setBlock: (x: number, y: number, z: number, id: number) => number,
 *   ensureChunksAround: (x: number, z: number, radius: number) => void,
 *   findSpawn: (wx: number, wz: number) => { x: number, y: number, z: number },
 *   getChunk: (key: string) => object|null,
 *   writeChunkFile: (key: string, arr: Uint8Array) => void,
 *   readChunkFile: (file: string, name?: string) => object|null,
 *   atomicWrite: (file: string, data: string) => void,
 *   generateChunk: Function,
 *   reinitNoise: (seed: string) => void,
 *   SEA_LEVEL: number,
 *   WORLD_SEA_LEVEL: number,
 *   WORLD_MIN_Y: number,
 *   WORLD_MAX_Y: number,
 *   isColumnDark: Function,
 *   findDarkCaveY: Function,
 *   inBounds: (x: number, y: number, z: number) => boolean,
 *   outOfBounds: (x: number, y: number, z: number) => boolean,
 *   [key: string]: any
 * }} World
 */

// Export vacío: hace que TypeScript trate el archivo como módulo para
// que @typedef se pueda importar vía import('./types.js').
module.exports = {};
