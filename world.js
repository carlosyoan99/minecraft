'use strict';

// ============================================================
// MUNDO: GENERACIÓN, ACCESO A BLOQUES Y ARCHIVOS DE CHUNK
// ============================================================
const fs = require('fs');
const path = require('path');
const { createNoise2D, createNoise3D } = require('simplex-noise');
const { CHUNK_SIZE, WORLD_HEIGHT, SEED, CHUNKS_DIR, SCHEMA_VERSION, B } = require('./constants.js');
const state = require('./state.js');

const { chunks, dirtyChunks } = state;

function seededNoise(seedStr) {
  // PRNG determinista simple (mulberry32) sembrado con el string, para
  // que el mundo sea siempre el mismo entre reinicios del servidor.
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const noise2D = createNoise2D(seededNoise(SEED));
const noise2D_detail = createNoise2D(seededNoise(SEED + '_detail'));
const noise2D_ore = createNoise2D(seededNoise(SEED + '_ore'));
// Ruido 2D para montañas (Fase 4): donde es alto, el bioma es montaña (el
// terreno se eleva y las cumbres altas se cubren de nieve). Determinista y
// continuo entre chunks, como el resto de la generación.
const noise2D_mountain = createNoise2D(seededNoise(SEED + '_mountain'));
// Ruido 3D para cuevas (Fase 4): dos octavas sembradas, muestreadas en
// coordenadas de mundo para que las cuevas sean continuas entre chunks.
const noise3D_cave = createNoise3D(seededNoise(SEED + '_cave'));
const noise3D_cave_fine = createNoise3D(seededNoise(SEED + '_cave_fine'));
// Ruido 2D para lagos (Fase 4): donde es alto, el terreno se hunde y el
// agua llena la depresión hasta SEA_LEVEL. Muestreado en coordenadas de
// mundo → lagos continuos entre chunks y deterministas.
const noise2D_lake = createNoise2D(seededNoise(SEED + '_lake'));
const SEA_LEVEL = 5;              // bloques de agua: y ∈ (LAKE_FLOOR, SEA_LEVEL)
const LAKE_FREQ = 0.012;          // frecuencia baja → lagos amplios
const LAKE_THRESHOLD = 0.65;      // calibrado por barrido: ~5% de columnas con lago
                                    // (0.35 daba ~26% = mundo lleno de charcos)
const LAKE_FLOOR = 2;             // fondo del lago: arena en y=LAKE_FLOOR, piedra debajo
function isLake(wx, wz) {
  return noise2D_lake(wx * LAKE_FREQ, wz * LAKE_FREQ) > LAKE_THRESHOLD;
}

// Umbral de temperatura para tundra: por debajo hace tanto frío que nieva.
const SNOW_TEMP = -0.3;
// Umbral del ruido de montaña: por encima el terreno se eleva en cordilleras.
// Calibrado por barrido en la semilla: con 0.35 las montañas ocupaban el 25%
// del mundo y eclipsaban a las llanuras; con 0.45 quedan en ~19% (desierto
// ~9%, bosque ~31%, llanura ~20%, nieve ~20%).
const MOUNTAIN_THRESHOLD = 0.45;
// Altura mínima de cumbre para que la superficie de una montaña sea nieve
// (por debajo, la roca queda al descubierto). Calibrado: con 15, ~91% de las
// montañas quedaban nevadas y se confundían con la tundra; con 18 solo las
// cumbres altas (alturas 12-26) llevan nieve y hay contraste entre biomas.
const MOUNTAIN_SNOW_LINE = 18;

function getBiome(wx, wz) {
  // Montañas primero: el ruido de montaña manda sobre la temperatura.
  if (noise2D_mountain(wx * 0.008, wz * 0.008) > MOUNTAIN_THRESHOLD) return 'mountain';
  const temp = noise2D(wx * 0.005, wz * 0.005);
  if (temp < SNOW_TEMP) return 'snow';      // tundra: nieve en la superficie
  if (temp < -0.15) return 'desert';
  if (temp > 0.2) return 'forest';
  return 'plains';
}

function getHeight(wx, wz) {
  const biome = getBiome(wx, wz);
  let base = 4;
  if (biome === 'desert') base = 3;
  else if (biome === 'forest') base = 6;
  else if (biome === 'snow') base = 3;
  else if (biome === 'mountain') base = 12; // cordilleras: terreno mucho más alto
  const h = noise2D(wx * 0.02, wz * 0.02) * 0.5 + 0.5;
  const detail = noise2D_detail(wx * 0.08, wz * 0.08) * 1.5;
  if (biome === 'mountain') {
    // Crestas: octava adicional de mayor amplitud para picos pronunciados.
    const crest = noise2D_mountain(wx * 0.05, wz * 0.05) * 0.5 + 0.5;
    return Math.max(3, Math.floor(base + crest * 14 + detail));
  }
  return Math.max(2, Math.floor(base + h * 8 + detail));
}

// Radio de búsqueda de tierra firme para el punto de aparición (bloques).
const SPAWN_SEARCH_RADIUS = 24;

// Punto de aparición del jugador sobre terreno firme (Fase 4): si la columna
// pedida es un lago, busca en espiral la columna firme más cercana para que
// el jugador no aparezca nadando. Devuelve { x, y, z } con x/z en el centro de
// la columna elegida e y sobre el suelo firme (getHeight + 2, como el spawn
// original). Es determinista: misma entrada → mismo punto (el ruido de lagos
// depende solo de la semilla).
function findSpawn(wx, wz) {
  // Normalizar a la columna: el espiral y el centro (+0.5) asumen enteros.
  wx = Math.floor(wx); wz = Math.floor(wz);
  if (!isLake(wx, wz)) {
    return { x: wx + 0.5, z: wz + 0.5, y: getHeight(wx, wz) + 2 };
  }
  for (let r = 1; r <= SPAWN_SEARCH_RADIUS; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue; // solo el anillo del radio r
        const nx = wx + dx, nz = wz + dz;
        if (!isLake(nx, nz)) {
          return { x: nx + 0.5, z: nz + 0.5, y: getHeight(nx, nz) + 2 };
        }
      }
    }
  }
  // Caso límite (sin tierra firme en el radio): sobre la superficie del agua.
  return { x: wx + 0.5, z: wz + 0.5, y: SEA_LEVEL + 2 };
}

// Devuelve true si (wx, wy, wz) debe excavarse como cueva. Ruido 3D
// "ridged" (1 - |n|): donde el ruido cruza cerca de 0 se forman túneles
// tipo gusano (estilo Minecraft). La suma ponderada de dos octavas
// (gruesa + fina) da pasadizos con desvíos. Determinista por coordenada
// de mundo: mismo resultado en cualquier reinicio y continuo entre chunks.
const CAVE_FREQ = 0.07;      // escala horizontal de los túneles
const CAVE_FREQ_Y = 0.09;    // algo mayor en Y para túneles más horizontales
const CAVE_FINE_FREQ = 0.2;  // octava fina (desvíos)
const CAVE_THRESHOLD = 0.84; // calibrado por barrido: ~14% del subsuelo excavado,
                              // túneles conexos sin queso suizo (0.62 daba ~58%)
function isCaveBlock(wx, wy, wz) {
  const base = 1 - Math.abs(noise3D_cave(wx * CAVE_FREQ, wy * CAVE_FREQ_Y, wz * CAVE_FREQ));
  const fine = 1 - Math.abs(noise3D_cave_fine(wx * CAVE_FINE_FREQ, wy * CAVE_FINE_FREQ * 1.25, wz * CAVE_FINE_FREQ));
  return base * 0.6 + fine * 0.4 > CAVE_THRESHOLD;
}

function idx(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }

// --- Archivos de chunk (escritura atómica) ---
function chunkFilePath(cx, cz) {
  return path.join(CHUNKS_DIR, `${cx}_${cz}.json`);
}

// Escritura atómica (archivo temporal + renombrado): si el proceso muere
// a mitad de escritura, no se queda un archivo de chunk a medias.
function atomicWrite(file, data) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}

// Serializa y escribe un chunk (clave "cx,cz") en su archivo.
function writeChunkFile(key, arr) {
  const [cx, cz] = key.split(',').map(Number);
  atomicWrite(chunkFilePath(cx, cz), JSON.stringify({ schemaVersion: SCHEMA_VERSION, cx, cz, data: Array.from(arr) }));
}

// Lee y valida un archivo de chunk; devuelve el objeto {cx, cz, data} o null
// si el archivo no existe como JSON válido (con aviso, nunca silencioso).
function readChunkFile(file, origen) {
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.warn(`⚠️  Archivo de chunk ilegible, se ignora: ${origen}: ${e.message}`);
    return null;
  }
  if (!parsed || !Array.isArray(parsed.data) || typeof parsed.cx !== 'number' || typeof parsed.cz !== 'number') {
    console.warn(`⚠️  Archivo de chunk ignorado (formato inválido): ${origen}`);
    return null;
  }
  if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion > SCHEMA_VERSION) {
    console.warn(`⚠️  Chunk (${parsed.cx},${parsed.cz}) es de una versión más nueva (v${parsed.schemaVersion}); se ignora (se regenerará y se sobrescribirá al guardar)`);
    return null;
  }
  if (parsed.data.length !== CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE) {
    console.warn(`⚠️  Archivo de chunk ignorado (longitud inesperada): ${origen}`);
    return null;
  }
  return parsed;
}

function markChunkDirty(cx, cz) {
  dirtyChunks.add(`${cx},${cz}`);
}

// Recupera un chunk desde su archivo si existe; null si no está guardado o es ilegible.
function loadChunkFromDisk(cx, cz) {
  const file = chunkFilePath(cx, cz);
  if (!fs.existsSync(file)) return null;
  const parsed = readChunkFile(file, `chunk ${cx},${cz}`);
  return parsed ? Uint8Array.from(parsed.data) : null;
}

// Hook de tests: permite forzar generación fresca (sin leer disco) como el
// servidor real hace con setBlockChangeHandler. Si se instala, generateChunk
// usa esta función en vez de loadChunkFromDisk.
let diskLoader = null;
function setDiskLoader(fn) { diskLoader = fn; }

function generateChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return chunks.get(key);
  // Si el chunk ya fue guardado en disco (p.ej. tras descargarse), recuperarlo
  // tal cual en vez de regenerarlo: la generación usa Math.random y perdería cambios.
  const fromDisk = diskLoader ? diskLoader(cx, cz) : loadChunkFromDisk(cx, cz);
  if (fromDisk) {
    chunks.set(key, fromDisk);
    return fromDisk;
  }

  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const baseX = cx * CHUNK_SIZE, baseZ = cz * CHUNK_SIZE;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = baseX + x, wz = baseZ + z;
      const lake = isLake(wx, wz);
      // En un lago el terreno se hunde hasta LAKE_FLOOR y el agua llena la
      // depresión hasta SEA_LEVEL; no hay árboles ni minerales bajo el agua.
      const height = lake ? LAKE_FLOOR : getHeight(wx, wz);
      const biome = getBiome(wx, wz);

      for (let y = 0; y < WORLD_HEIGHT; y++) {
        let block = B.AIR;
        if (y === 0) block = B.BEDROCK;
        else if (lake) {
          // Columna de lago: piedra bajo el fondo, arena en LAKE_FLOOR y agua
          // encima hasta SEA_LEVEL. Sin huecos: nunca aire bajo el fondo.
          if (y < LAKE_FLOOR) block = B.STONE;
          else if (y === LAKE_FLOOR) block = B.SAND;
          else if (y < SEA_LEVEL) block = B.WATER;
        }
        else if (y < height - 1) {
          // Cuevas (Fase 4): el ruido 3D excava la piedra dejando al menos 2
          // bloques sólidos bajo la superficie (sin huecos visibles arriba)
          // y sin tocar el bedrock (y === 0). Muestreado en coordenadas de
          // mundo → continuo entre chunks vecinos y determinista.
          if (y > 1 && y < height - 2 && isCaveBlock(wx, y, wz)) {
            block = B.AIR;
          } else {
            block = B.STONE;
            if (y > 4) {
              const oreRoll = (noise2D_ore(wx * 0.3 + y * 7.1, wz * 0.3) + 1) / 2;
              if (y < 16 && oreRoll > 0.985) block = B.DIAMOND_ORE;
              else if (y < 20 && oreRoll > 0.975) block = B.REDSTONE_ORE;
              else if (y < 30 && oreRoll > 0.965) block = B.EMERALD_ORE;
              else if (y < 30 && oreRoll > 0.95) block = B.GOLD_ORE;
              else if (y < 40 && oreRoll > 0.93) block = B.IRON_ORE;
              else if (y < 50 && oreRoll > 0.9) block = B.COAL_ORE;
            }
          }
        } else if (y === height - 1) {
          // Superficie por bioma: tundra nevada, cumbres de montaña con nieve,
          // desierto con arena, resto césped.
          if (biome === 'snow') block = B.SNOW;
          else if (biome === 'mountain' && height >= MOUNTAIN_SNOW_LINE) block = B.SNOW;
          else if (biome === 'desert') block = B.SAND;
          else if (biome === 'mountain') block = B.STONE;
          else block = B.GRASS;
        }
        data[idx(x, y, z)] = block;
      }

      // Árboles (nunca dentro de un lago)
      if (!lake && (biome === 'forest' || biome === 'plains') && Math.random() < (biome === 'forest' ? 0.04 : 0.01)) {
        const treeHeight = 4 + Math.floor(Math.random() * 3);
        for (let i = 1; i <= treeHeight; i++) {
          const y = height + i;
          if (y < WORLD_HEIGHT) data[idx(x, y, z)] = B.OAK_LOG;
        }
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = treeHeight - 1; dy <= treeHeight + 1; dy++) {
              if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === treeHeight + 1) continue;
              const lx = x + dx, lz = z + dz;
              if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
              const y = height + dy;
              if (y < WORLD_HEIGHT && data[idx(lx, y, lz)] === B.AIR) data[idx(lx, y, lz)] = B.OAK_LEAVES;
            }
          }
        }
      }
    }
  }
  chunks.set(key, data);
  markChunkDirty(cx, cz); // la generación usa Math.random (árboles), así que se persiste
  return data;
}

function getBlock(wx, wy, wz) {
  if (wy < 0 || wy >= WORLD_HEIGHT) return B.AIR;
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = chunks.get(`${cx},${cz}`);
  // Si el chunk no está en memoria (no generado o descargado), se trata como
  // aire hasta que se genere: las rutas de interacción pasan por generateChunk,
  // que lo recupera de disco, así que nunca se opera sobre un hueco real.
  if (!chunk) return B.AIR;
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk[idx(x, wy, z)];
}

// Hook que conecta la red (broadcast de block_update) desde la entrada del
// servidor; evita un ciclo de require entre world y net.
let blockChangeHandler = null;
function setBlockChangeHandler(fn) { blockChangeHandler = fn; }

function setBlock(wx, wy, wz, blockId) {
  if (wy < 0 || wy >= WORLD_HEIGHT) return false;
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = generateChunk(cx, cz);
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  chunk[idx(x, wy, z)] = blockId;
  markChunkDirty(cx, cz);
  if (blockChangeHandler) blockChangeHandler(wx, wy, wz, blockId);
  return true;
}

function ensureChunksAround(wx, wz, radius) {
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const generated = [];
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      const key = `${x},${z}`;
      const isNew = !chunks.has(key);
      generateChunk(x, z);
      if (isNew) generated.push(key);
    }
  }
  return generated;
}

module.exports = {
  getBiome, getHeight, findSpawn, generateChunk, getBlock, setBlock, ensureChunksAround,
  atomicWrite, writeChunkFile, readChunkFile, loadChunkFromDisk,
  setBlockChangeHandler, setDiskLoader,
  isLake, SEA_LEVEL, LAKE_FLOOR, SNOW_TEMP, MOUNTAIN_THRESHOLD, MOUNTAIN_SNOW_LINE,
};
