'use strict';

// ============================================================
// ESTADO COMPARTIDO DEL MUNDO
// Los Maps/Set se mutan en el sitio; `mobs` se reasigna (filtros en el
// bucle principal y al cargar), así que SIEMPRE acceder vía state.mobs.
// ============================================================
const chunks = new Map();      // "cx,cz" -> Uint8Array(16*64*16)
const players = new Map();     // id -> player
const furnaces = new Map();    // "x,y,z" -> { fuelItem, fuelTicks, inputItem, progress, requiredTicks, outputItem, outputCount }
let mobs = [];
const dirtyChunks = new Set(); // claves "cx,cz" modificadas, pendientes de escribir
let timeOffset = 0; // Fase 6: desplazamiento del reloj del mundo (ms) para /time set.
                   // Runtime-only: no se persiste; al reiniciar el servidor vuelve a 0.

module.exports = { chunks, players, furnaces, mobs, dirtyChunks, timeOffset };
