'use strict';
// ============================================================
// TESTS UNITARIOS DE BIOMAS (Fase 4: nieve + montaña)
// Verifica que la generación de world.js:
//   1. genera los 5 biomas (plains, forest, desert, snow, mountain)
//   2. las montañas elevan el terreno (alturas >> llanuras)
//   3. la superficie es nieve en tundra y en cumbres de montaña
//   4. la nieve es un bloque sólido y rompible (no en NOT_MINEABLE)
//   5. todo sigue siendo determinista (sin costuras)
// ============================================================
const world = require('../world.js');
const state = require('../state.js');
const { CHUNK_SIZE, WORLD_HEIGHT, B, isSolidBlock, NOT_MINEABLE } = require('../constants.js');

function idx(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }

let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
};

// --- 1) Los 5 biomas existen en la semilla ---
const counts = {};
for (let wx = -100; wx <= 100; wx += 4) {
  for (let wz = -100; wz <= 100; wz += 4) {
    const b = world.getBiome(wx, wz);
    counts[b] = (counts[b] || 0) + 1;
  }
}
for (const b of ['plains', 'forest', 'desert', 'snow', 'mountain']) {
  check(`bioma '${b}' existe en la semilla`, (counts[b] || 0) > 0, `${counts[b] || 0} muestras`);
}

// --- 2) Las montañas elevan el terreno ---
let maxPlain = 0, maxMountain = 0, minMountain = Infinity, samples = 0;
for (let wx = -100; wx <= 100; wx += 2) {
  for (let wz = -100; wz <= 100; wz += 2) {
    const biome = world.getBiome(wx, wz);
    const h = world.getHeight(wx, wz);
    if (biome === 'mountain') {
      maxMountain = Math.max(maxMountain, h);
      minMountain = Math.min(minMountain, h);
      samples++;
    } else if (biome === 'plains' || biome === 'forest') {
      maxPlain = Math.max(maxPlain, h);
    }
  }
}
check('las montañas existen (muestras > 0)', samples > 0, `${samples} muestras`);
check('la cima de montaña supera el techo de llanuras/bosques',
  maxMountain > maxPlain + 4, `montaña máx ${maxMountain} vs llanura máx ${maxPlain}`);
check('las montañas tienen terreno alto (máx >= 15)', maxMountain >= 15, `máx ${maxMountain}`);
check('el valle de montaña no es más bajo que el suelo normal (mín >= 3)', minMountain >= 3, `mín ${minMountain}`);

// --- 3) Superficie: nieve en tundra y cumbres; roca en montañas bajas ---
world.setDiskLoader(() => null);
let snowSurface = 0, snowSurfaceMountain = 0, stoneSurfaceMountain = 0;
let grassSurface = 0, sandSurface = 0, waterSurface = 0;
for (let cx = -4; cx <= 4; cx++) {
  for (let cz = -4; cz <= 4; cz++) {
    world.generateChunk(cx, cz);
  }
}
for (let cx = -4; cx <= 4; cx++) {
  for (let cz = -4; cz <= 4; cz++) {
    const data = state.chunks.get(`${cx},${cz}`);
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const wx = cx * CHUNK_SIZE + x, wz = cz * CHUNK_SIZE + z;
        const biome = world.getBiome(wx, wz);
        const height = world.getHeight(wx, wz);
        const surf = data[idx(x, height - 1, z)];
        if (biome === 'snow' && surf === B.SNOW) snowSurface++;
        if (biome === 'mountain' && height >= world.MOUNTAIN_SNOW_LINE && surf === B.SNOW) snowSurfaceMountain++;
        if (biome === 'mountain' && height < world.MOUNTAIN_SNOW_LINE && surf === B.STONE) stoneSurfaceMountain++;
        if (biome === 'plains' && surf === B.GRASS) grassSurface++;
        if (biome === 'desert' && surf === B.SAND) sandSurface++;
        // Lago: el fondo de arena está en y = LAKE_FLOOR (getHeight no contempla lagos).
        if (world.isLake(wx, wz) && data[idx(x, world.LAKE_FLOOR, z)] === B.SAND) waterSurface++;
      }
    }
  }
}
check('la tundra tiene superficie de nieve', snowSurface > 0, `${snowSurface} columnas`);
check('las cumbres de montaña (>= SNOW_LINE) tienen nieve', snowSurfaceMountain > 0, `${snowSurfaceMountain} columnas`);
check('las montañas bajas (< SNOW_LINE) muestran roca', stoneSurfaceMountain > 0, `${stoneSurfaceMountain} columnas`);
check('las llanuras conservan césped', grassSurface > 0, `${grassSurface} columnas`);
check('el desierto conserva arena', sandSurface > 0, `${sandSurface} columnas`);
check('los lagos siguen teniendo fondo de arena', waterSurface > 0, `${waterSurface} columnas`);

// --- 4) La nieve es sólida y rompible ---
check('isSolidBlock(SNOW) === true', isSolidBlock(B.SNOW) === true);
check('SNOW no está en NOT_MINEABLE (se rompe a mano)', !NOT_MINEABLE.has(B.SNOW));

// --- 5) Determinismo: regenerar un chunk de montaña es bit-idéntico ---
// Buscar un chunk con montaña para asegurarse de probar el caso difícil.
let mountainChunk = null;
outer:
for (let cx = -4; cx <= 4; cx++) {
  for (let cz = -4; cz <= 4; cz++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        if (world.getBiome(cx * CHUNK_SIZE + x, cz * CHUNK_SIZE + z) === 'mountain') {
          mountainChunk = { cx, cz }; break outer;
        }
      }
    }
  }
}
check('se encontró un chunk con montaña para el test de determinismo', mountainChunk !== null);
if (mountainChunk) {
  const key = `${mountainChunk.cx},${mountainChunk.cz}`;
  state.chunks.delete(key);
  const a = world.generateChunk(mountainChunk.cx, mountainChunk.cz);
  state.chunks.delete(key);
  const b = world.generateChunk(mountainChunk.cx, mountainChunk.cz);
  let diffs = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diffs++;
  check('regeneración de chunk con montaña bit-idéntica', diffs === 0, `${diffs} diffs`);
}

world.setDiskLoader(null);

console.log(failed === 0 ? '\n✅ Todos los tests pasan' : `\n❌ ${failed} check(s) fallaron`);
process.exit(failed ? 1 : 0);
