'use strict';
// ============================================================
// TESTS UNITARIOS DE PERSISTENCIA (Fase 1)
// Cubre save.js (saveWorld, loadWorld, migrateLegacyWorld,
// unloadFarChunks) y el I/O de chunk de world.js (atomicWrite,
// writeChunkFile, readChunkFile, loadChunkFromDisk) sobre un
// directorio temporal — NUNCA toca el world/ real del proyecto.
// ============================================================
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-persist-'));
const constants = require('../constants.js');
// Redirigir a un directorio temporal ANTES de requerir world/save
// (capturan estos valores al cargarse: mutamos el objeto exportado).
constants.WORLD_DIR = path.join(TMP, 'world');
constants.CHUNKS_DIR = path.join(TMP, 'world', 'chunks');
constants.LEGACY_FILE = path.join(TMP, 'world', 'world.dat');
constants.META_FILE = path.join(TMP, 'world', 'world.json');

const world = require('../world.js');
const save = require('../save.js');
const state = require('../state.js');
const { SCHEMA_VERSION, CHUNK_SIZE, WORLD_HEIGHT, B, SEED } = constants;

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
};

function resetWorld() {
  fs.rmSync(path.join(TMP, 'world'), { recursive: true, force: true });
  fs.mkdirSync(constants.CHUNKS_DIR, { recursive: true });
}

// --- 1) atomicWrite: crea el archivo y no deja .tmp ---
{
  const f = path.join(TMP, 'atomic.txt');
  world.atomicWrite(f, 'hola');
  check('atomicWrite escribe el archivo', fs.readFileSync(f, 'utf8') === 'hola');
  check('atomicWrite no deja .tmp', !fs.existsSync(f + '.tmp'));
}

// --- 2) writeChunkFile / readChunkFile / loadChunkFromDisk round-trip ---
{
  resetWorld();
  const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  arr[0] = B.STONE;
  arr[1234] = B.WATER;
  world.writeChunkFile('3,-2', arr);
  const file = path.join(constants.CHUNKS_DIR, '3_-2.json');
  const parsed = world.readChunkFile(file, 'test');
  check('writeChunkFile guarda schemaVersion', parsed && parsed.schemaVersion === SCHEMA_VERSION,
    'v=' + (parsed && parsed.schemaVersion));
  check('writeChunkFile guarda cx/cz', parsed && parsed.cx === 3 && parsed.cz === -2);
  check('readChunkFile devuelve datos idénticos',
    parsed && parsed.data[0] === B.STONE && parsed.data[1234] === B.WATER && parsed.data.length === arr.length);
  const back = world.loadChunkFromDisk(3, -2);
  check('loadChunkFromDisk recupera Uint8Array', back && back[1234] === B.WATER);
}

// --- 3) readChunkFile rechaza datos corruptos / versiones nuevas ---
{
  resetWorld();
  const bad1 = path.join(constants.CHUNKS_DIR, 'bad1.json');
  fs.writeFileSync(bad1, 'no-json');
  check('JSON ilegible → null (con aviso)', world.readChunkFile(bad1, 'test') === null);

  const bad2 = path.join(constants.CHUNKS_DIR, 'bad2.json');
  fs.writeFileSync(bad2, JSON.stringify({ cx: 0, cz: 0, data: [1, 2, 3] })); // longitud errónea
  check('longitud inesperada → null', world.readChunkFile(bad2, 'test') === null);

  const bad3 = path.join(constants.CHUNKS_DIR, 'bad3.json');
  fs.writeFileSync(bad3, JSON.stringify({
    schemaVersion: SCHEMA_VERSION + 1, cx: 0, cz: 0,
    data: new Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE).fill(0),
  }));
  check('schemaVersion más nueva → null (se regenerará)', world.readChunkFile(bad3, 'test') === null);

  const bad4 = path.join(constants.CHUNKS_DIR, 'bad4.json');
  fs.writeFileSync(bad4, JSON.stringify({ schemaVersion: SCHEMA_VERSION, data: [] })); // sin cx/cz
  check('sin cx/cz → null', world.readChunkFile(bad4, 'test') === null);
}

// --- 4) saveWorld incremental: escribe los chunks sucios y limpia dirtyChunks ---
{
  resetWorld();
  state.chunks.clear();
  state.dirtyChunks.clear();
  const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  arr[0] = B.GRASS;
  state.chunks.set('0,0', arr);
  state.dirtyChunks.add('0,0');
  save.saveWorld();
  check('saveWorld escribe los chunks sucios', fs.existsSync(path.join(constants.CHUNKS_DIR, '0_0.json')));
  check('saveWorld limpia dirtyChunks', state.dirtyChunks.size === 0, 'size=' + state.dirtyChunks.size);
  // Un chunk limpio no se reescribe: al guardar de nuevo el archivo no cambia de mtime
  const antes = fs.statSync(path.join(constants.CHUNKS_DIR, '0_0.json')).mtimeMs;
  save.saveWorld();
  const despues = fs.statSync(path.join(constants.CHUNKS_DIR, '0_0.json')).mtimeMs;
  check('saveWorld no reescribe chunks limpios (incremental)', despues === antes);
}

// --- 5) loadWorld round-trip completo (chunks + mobs + hornos) ---
{
  resetWorld();
  state.chunks.clear();
  const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  arr[5] = B.GRASS;
  arr[999] = B.FURNACE;
  state.chunks.set('0,0', arr);
  state.dirtyChunks.add('0,0');
  state.mobs = [{ id: 'm1', type: 'cow', x: 1, y: 2, z: 3, health: 10, isBaby: true, age: 5, alive: true }];
  state.furnaces.set('k1', {
    fuelItem: 4, fuelTicksLeft: 100, inputItem: { id: 9, count: 1 },
    progress: 5, requiredTicks: 200, outputItem: null, outputCount: 0,
  });
  save.saveWorld();

  state.chunks.clear();
  state.mobs = [];
  state.furnaces.clear();
  const r = save.loadWorld();
  check('loadWorld devuelve true', r === true);
  check('loadWorld restaura chunks', state.chunks.has('0,0') && state.chunks.get('0,0')[999] === B.FURNACE);
  check('loadWorld restaura mobs (retrocompatible isBaby/age)', state.mobs.length === 1 && state.mobs[0].type === 'cow' && state.mobs[0].isBaby === true,
    JSON.stringify(state.mobs[0] && { type: state.mobs[0].type, isBaby: state.mobs[0].isBaby }));
  check('loadWorld restaura hornos', state.furnaces.has('k1'));
}

// --- 6) loadWorld se niega a abrir un mundo más nuevo (integridad) ---
{
  resetWorld();
  world.writeChunkFile('9,9', new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE));
  fs.writeFileSync(constants.META_FILE, JSON.stringify({ schemaVersion: SCHEMA_VERSION + 5, seed: SEED }));
  const r = save.loadWorld();
  check('schemaVersion más nueva → rechazo (no carga ni corrompe)', r === 'rechazo', 'r=' + r);

  fs.rmSync(path.join(TMP, 'world'), { recursive: true, force: true });
  check('sin mundo guardado → false (se generará uno nuevo)', save.loadWorld() === false);
}

// --- 7) migrateLegacyWorld: world.dat v1 → archivos por chunk ---
{
  resetWorld();
  // La migración exige que CHUNKS_DIR NO exista todavía (v1 → v2).
  fs.rmSync(constants.CHUNKS_DIR, { recursive: true, force: true });
  const legacy = {
    seed: SEED,
    chunks: [['0,0', Array.from(new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE))]],
    mobs: [], furnaces: [],
  };
  fs.writeFileSync(constants.LEGACY_FILE, JSON.stringify(legacy));
  const ok = save.migrateLegacyWorld();
  check('migrateLegacyWorld migra (true)', ok === true);
  check('chunks escritos en archivos', fs.existsSync(path.join(constants.CHUNKS_DIR, '0_0.json')));
  check('world.dat renombrado a .legacy', fs.existsSync(constants.LEGACY_FILE + '.legacy'));
  check('meta escrito', fs.existsSync(constants.META_FILE));
  check('chunks en memoria tras migrar', state.chunks.has('0,0'));
  check('no re-migra si ya hay chunks dir', save.migrateLegacyWorld() === false);
}

// --- 8) unloadFarChunks: descarga lejanos, conserva cercanos y persiste sucios ---
{
  resetWorld();
  state.chunks.clear();
  state.dirtyChunks.clear();
  state.players.clear();
  state.players.set('fake', { x: 0.5, y: 10, z: 0.5 }); // jugador en el chunk (0,0)
  const a = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const b = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  a[1] = B.DIRT;
  b[1] = B.STONE;
  state.chunks.set('0,0', a);    // cerca del jugador → se conserva
  state.chunks.set('30,0', b);   // lejano (|30-0|=30 > 10) → se descarga
  state.dirtyChunks.add('30,0');
  save.unloadFarChunks();
  check('chunk lejano descargado', !state.chunks.has('30,0'));
  check('chunk cercano conservado', state.chunks.has('0,0'));
  check('chunk sucio lejano persistido antes de descargar', fs.existsSync(path.join(constants.CHUNKS_DIR, '30_0.json')));
  check('dirtyChunks sin la clave descargada', !state.dirtyChunks.has('30,0'));
  state.players.clear();
}

// --- 9) generateChunk recupera de disco lo ya guardado (no regenera) ---
{
  resetWorld();
  state.chunks.clear();
  state.dirtyChunks.clear();
  const arr = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  arr[7] = B.DIAMOND_ORE;
  world.writeChunkFile('2,2', arr);
  const gen = world.generateChunk(2, 2);
  check('generateChunk recupera chunk guardado (no lo regenera)', gen[7] === B.DIAMOND_ORE);
}

fs.rmSync(TMP, { recursive: true, force: true });
console.log(fails === 0 ? '\n✅ Todos los tests pasan' : `\n❌ ${fails} tests fallaron`);
process.exit(fails ? 1 : 0);
