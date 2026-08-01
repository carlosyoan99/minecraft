'use strict';

// ============================================================
// MUNDO: GENERACIÓN, ACCESO A BLOQUES Y ARCHIVOS DE CHUNK
// ============================================================
const fs = require('fs');
const path = require('path');
const { createNoise2D } = require('simplex-noise');
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

function getBiome(wx, wz) {
  const temp = noise2D(wx * 0.005, wz * 0.005);
  if (temp < -0.15) return 'desert';
  if (temp > 0.2) return 'forest';
  return 'plains';
}

function getHeight(wx, wz) {
  const biome = getBiome(wx, wz);
  let base = 4;
  if (biome === 'desert') base = 3;
  else if (biome === 'forest') base = 6;
  const h = noise2D(wx * 0.02, wz * 0.02) * 0.5 + 0.5;
  const detail = noise2D_detail(wx * 0.08, wz * 0.08) * 1.5;
  return Math.max(2, Math.floor(base + h * 8 + detail));
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

function generateChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return chunks.get(key);
  // Si el chunk ya fue guardado en disco (p.ej. tras descargarse), recuperarlo
  // tal cual en vez de regenerarlo: la generación usa Math.random y perdería cambios.
  const fromDisk = loadChunkFromDisk(cx, cz);
  if (fromDisk) {
    chunks.set(key, fromDisk);
    return fromDisk;
  }

  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const baseX = cx * CHUNK_SIZE, baseZ = cz * CHUNK_SIZE;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = baseX + x, wz = baseZ + z;
      const height = getHeight(wx, wz);
      const biome = getBiome(wx, wz);

      for (let y = 0; y < WORLD_HEIGHT; y++) {
        let block = B.AIR;
        if (y === 0) block = B.BEDROCK;
        else if (y < height - 1) {
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
        } else if (y === height - 1) {
          block = biome === 'desert' ? B.SAND : B.GRASS;
        }
        data[idx(x, y, z)] = block;
      }

      // Árboles
      if ((biome === 'forest' || biome === 'plains') && Math.random() < (biome === 'forest' ? 0.04 : 0.01)) {
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
  getHeight, generateChunk, getBlock, setBlock, ensureChunksAround,
  atomicWrite, writeChunkFile, readChunkFile, loadChunkFromDisk,
  setBlockChangeHandler,
};
