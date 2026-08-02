'use strict';

// ============================================================
// ENTRADA DEL SERVIDOR: carga los módulos por responsabilidad,
// conecta los hooks de broadcast (evitan ciclos de require) y arranca.
// ============================================================
const { SAVE_INTERVAL_MS, UNLOAD_INTERVAL_MS } = require('./constants.js');
const state = require('./state.js');
const world = require('./world.js');
const save = require('./save.js');
const mobs = require('./mobs.js');
const crafting = require('./crafting.js');
const playerHelpers = require('./players.js');
const net = require('./net.js');

// Hooks de broadcast (dependencia world/save/players -> net, rota aquí)
world.setBlockChangeHandler((x, y, z, block) => net.broadcast('block_update', { x, y, z, block }));
save.setUnloadHandler((keys) => net.broadcast('chunks_unload', { keys }));
playerHelpers.setBroadcastHandler((event, data) => net.broadcast(event, data));

crafting.loadRecipes();

// Layout antiguo (world.json + chunks en la raíz de world/) → directorio de la
// semilla (world/<semilla>/): cada semilla tiene su propio mundo (bug semilla).
save.migrateWorldLayout();

const loadResult = save.loadWorld();
if (loadResult === 'rechazo') {
  console.error('❌ Arranque abortado: no se pudo abrir el mundo guardado de forma segura (formato más nuevo o datos ilegibles).');
  process.exit(1);
} else if (!loadResult) {
  // Sin guardado por chunk: probar la migración del world.dat antiguo (v1 → v2)
  if (!save.migrateLegacyWorld()) {
    world.ensureChunksAround(0, 0, 4);
  }
}
if (state.mobs.length === 0) for (let i = 0; i < 4; i++) mobs.spawnMobs();

setInterval(save.saveWorld, SAVE_INTERVAL_MS);
setInterval(save.unloadFarChunks, UNLOAD_INTERVAL_MS);
process.on('SIGINT', () => { save.saveWorld(); process.exit(0); });

net.start();
