'use strict';

// ============================================================
// PERSISTENCIA (guardado incremental por chunk) Y DESCARGA DE CHUNKS
// ============================================================
const fs = require('fs');
const path = require('path');
const {
  WORLD_ROOT, WORLD_DIR, CHUNKS_DIR, SCHEMA_VERSION, LEGACY_FILE, META_FILE,
  LEGACY_ROOT_FILES, SEED, UNLOAD_DISTANCE_CHUNKS, CHUNK_SIZE,
} = require('./constants.js');
const state = require('./state.js');
const world = require('./world.js');
const { restoreMobs } = require('./mobs.js');
const { restoreFurnaces } = require('./crafting.js');

const { chunks, players, furnaces, dirtyChunks } = state;

// Estado global (mobs, hornos, metadatos): pequeño, cabe en un solo archivo.
function buildMeta() {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: SEED,
    lastSaved: new Date().toISOString(),
    mobs: state.mobs.filter((m) => m.alive).map((m) => ({ id: m.id, type: m.type, x: m.x, y: m.y, z: m.z, health: m.health, isBaby: m.isBaby, age: m.age })),
    furnaces: Array.from(furnaces.entries()),
  };
}

function saveWorld() {
  try {
    if (!fs.existsSync(WORLD_DIR)) fs.mkdirSync(WORLD_DIR, { recursive: true });
    if (!fs.existsSync(CHUNKS_DIR)) fs.mkdirSync(CHUNKS_DIR, { recursive: true });

    // Incremental: solo se reescriben los chunks que cambiaron desde el
    // último guardado, nunca el mundo entero.
    let written = 0;
    for (const key of dirtyChunks) {
      const arr = chunks.get(key);
      if (!arr) continue;
      world.writeChunkFile(key, arr);
      written++;
    }
    dirtyChunks.clear();

    world.atomicWrite(META_FILE, JSON.stringify(buildMeta(), null, 2));
    console.log(`💾 Mundo guardado (${written} chunks escritos, ${chunks.size} en memoria, ${state.mobs.length} mobs)`);
  } catch (e) {
    console.error('Error guardando mundo:', e.message);
  }
}

// Devuelve:
//   true       — mundo cargado correctamente
//   false      — no hay mundo guardado: se generará uno nuevo
//   'rechazo'  — hay mundo guardado pero no se puede abrir de forma segura
//                (schemaVersion más nuevo, world.json ilegible, ...): no cargar ni tocar
function loadWorld() {
  try {
    if (!fs.existsSync(CHUNKS_DIR)) return false;

    chunks.clear();
    for (const file of fs.readdirSync(CHUNKS_DIR)) {
      if (!file.endsWith('.json')) continue;
      const parsed = world.readChunkFile(path.join(CHUNKS_DIR, file), file);
      if (!parsed) continue;
      chunks.set(`${parsed.cx},${parsed.cz}`, Uint8Array.from(parsed.data));
    }

    if (fs.existsSync(META_FILE)) {
      const meta = JSON.parse(fs.readFileSync(META_FILE, 'utf8'));
      if (typeof meta.schemaVersion === 'number' && meta.schemaVersion > SCHEMA_VERSION) {
        // Mundo más nuevo de lo que este servidor sabe leer: negarse a
        // cargarlo evita que un guardado posterior lo corrompa.
        console.error(`❌ El mundo guardado usa schemaVersion ${meta.schemaVersion}, pero este servidor soporta hasta v${SCHEMA_VERSION}.`);
        console.error('   No se cargará. Actualiza el servidor o restaura un backup compatible.');
        return 'rechazo';
      }
      if (meta.seed && meta.seed !== SEED) {
        console.warn(`⚠️  La semilla del mundo guardado (${meta.seed}) difiere de la configurada (${SEED}): los chunks nuevos no encajarán con los guardados.`);
      }
      state.mobs = restoreMobs(meta.mobs);
      restoreFurnaces(meta.furnaces);
    } else {
      console.warn('⚠️  world.json no encontrado: mobs y hornos se reinician (chunks intactos)');
    }
    console.log(`✅ Mundo cargado (${chunks.size} chunks, ${state.mobs.length} mobs)`);
    return true;
  } catch (e) {
    console.error('Error cargando mundo:', e.message);
    // Si existe el directorio de chunks, hay un mundo real: negarse a
    // regenerar encima en lugar de arriesgar pérdida de datos.
    return fs.existsSync(CHUNKS_DIR) ? 'rechazo' : false;
  }
}

// Migración del layout antiguo (v2 pre-semilla: world.json + chunks + world.dat
// en la raíz de world/) → directorio de la semilla (world/<semilla>/). Así al
// cambiar la SEED (env var) se genera un mundo totalmente nuevo sin pisar el
// anterior, y cada semilla conserva su propio mundo (bug de la semilla).
function migrateWorldLayout() {
  try {
    if (fs.existsSync(WORLD_DIR)) {
      // Esta semilla ya tiene mundo propio: si además queda layout antiguo en
      // la raíz (p. ej. por haber arrancado antes con otra semilla), avisar en
      // vez de ignorarlo en silencio (integridad: convención del proyecto).
      const orphan = LEGACY_ROOT_FILES.filter((n) => fs.existsSync(path.join(WORLD_ROOT, n)));
      if (orphan.length > 0) {
        console.warn(`⚠️  Layout antiguo huérfano en world/ (${orphan.join(', ')}): esta semilla ya tiene mundo, se ignoran esos archivos.`);
      }
      return false;
    }
    const existing = LEGACY_ROOT_FILES.filter((n) => fs.existsSync(path.join(WORLD_ROOT, n)));
    if (existing.length === 0) return false;    // no hay layout antiguo que migrar
    fs.mkdirSync(WORLD_DIR, { recursive: true });
    for (const n of existing) {
      fs.renameSync(path.join(WORLD_ROOT, n), path.join(WORLD_DIR, n));
    }
    console.log(`🔁 Mundo movido al directorio de su semilla (${path.basename(WORLD_DIR)}): ${existing.join(', ')}`);
    return true;
  } catch (e) {
    console.error('⚠️  No se pudo migrar el layout del mundo:', e.message);
    return false;
  }
}

// Migración del formato antiguo (world.dat único) → archivos por chunk.
// Primero se vuelca todo a los archivos nuevos; solo si eso funciona se
// renombra el .dat original a world.dat.legacy (copia de seguridad).
function migrateLegacyWorld() {
  try {
    if (!fs.existsSync(LEGACY_FILE) || fs.existsSync(CHUNKS_DIR)) return false;
    const data = JSON.parse(fs.readFileSync(LEGACY_FILE, 'utf8'));
    if (data.seed && data.seed !== SEED) {
      console.warn(`⚠️  La semilla del world.dat (${data.seed}) difiere de la configurada (${SEED}): los chunks nuevos no encajarán con los guardados.`);
    }
    chunks.clear();
    for (const [k, arr] of data.chunks || []) chunks.set(k, Uint8Array.from(arr));
    state.mobs = restoreMobs(data.mobs);
    restoreFurnaces(data.furnaces);

    fs.mkdirSync(CHUNKS_DIR, { recursive: true });
    for (const [key, arr] of chunks) {
      world.writeChunkFile(key, arr);
    }
    world.atomicWrite(META_FILE, JSON.stringify(buildMeta(), null, 2));

    fs.renameSync(LEGACY_FILE, LEGACY_FILE + '.legacy');
    console.log(`🔁 Mundo migrado de world.dat → archivos por chunk (${chunks.size} chunks)`);
    return true;
  } catch (e) {
    console.error('⚠️  No se pudo migrar world.dat:', e.message);
    return false;
  }
}

// Hook para que la entrada (net) conecte el broadcast de chunks_unload;
// evita un ciclo de require entre save y net.
let unloadHandler = null;
function setUnloadHandler(fn) { unloadHandler = fn; }

// Descarga chunks sin jugadores cerca: los persiste primero (por si fueron
// modificados o generados con Math.random) y avisa al cliente para que libere
// la geometría. Mantiene acotada la memoria del servidor en sesiones largas.
function unloadFarChunks() {
  if (players.size === 0) return;
  const toUnload = [];
  for (const key of chunks.keys()) {
    const [cx, cz] = key.split(',').map(Number);
    let nearPlayer = false;
    for (const p of players.values()) {
      const pcx = Math.floor(p.x / CHUNK_SIZE), pcz = Math.floor(p.z / CHUNK_SIZE);
      if (Math.abs(cx - pcx) <= UNLOAD_DISTANCE_CHUNKS && Math.abs(cz - pcz) <= UNLOAD_DISTANCE_CHUNKS) {
        nearPlayer = true;
        break;
      }
    }
    if (!nearPlayer) toUnload.push(key);
  }
  if (toUnload.length === 0) return;

  for (const key of toUnload) {
    try {
      if (dirtyChunks.has(key)) {
        const arr = chunks.get(key);
        if (arr) {
          world.writeChunkFile(key, arr);
          dirtyChunks.delete(key);
        }
      }
    } catch (e) {
      // Integridad: si no se pudo persistir, no soltar el chunk de memoria
      console.error(`⚠️  No se pudo persistir ${key} al descargar; se mantiene en memoria:`, e.message);
      continue;
    }
    chunks.delete(key);
  }

  if (unloadHandler) unloadHandler(toUnload);
  console.log(`🗑️ Descargados ${toUnload.length} chunks lejanos (${chunks.size} en memoria)`);
}

module.exports = { saveWorld, loadWorld, migrateLegacyWorld, migrateWorldLayout, unloadFarChunks, setUnloadHandler };
