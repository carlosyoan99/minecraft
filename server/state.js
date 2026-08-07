"use strict";

// ============================================================
// ESTADO COMPARTIDO DEL MUNDO
// Los Maps/Set se mutan en el sitio; `mobs` se reasigna (filtros en el
// bucle principal y al cargar), así que SIEMPRE acceder vía state.mobs.
// ============================================================
const chunks = new Map(); // "cx,cz" -> Uint8Array(16*64*16)
const players = new Map(); // id -> player
const furnaces = new Map(); // "x,y,z" -> { fuelItem, fuelTicks, inputItem, progress, requiredTicks, outputItem, outputCount }
const chests = new Map(); // "x,y,z" -> array(27) de slots null | { id, count, durability } (Fase 6)
// Fase 9 (Bloque C): cultivos — "x,y,z" -> { stage: 0-7, plantedAt: Date.now() }
// (los bloques solo guardan el ID; el estado de crecimiento vive aquí y se
// persiste en world.json junto a hornos/cofres).
const crops = new Map();
const mobs = [];
// Fase 9 (Bloque D): proyectiles del esqueleto — { x,y,z, vx,vy,vz, life, from }
// (entidad ligera con física simple de gravedad; se envía en arrows_update).
const arrows = [];
const dirtyChunks = new Set(); // claves "cx,cz" modificadas, pendientes de escribir
const timeOffset = 0; // Fase 6: desplazamiento del reloj del mundo (ms) para /time set.
// Runtime-only: no se persiste; al reiniciar el servidor vuelve a 0.
// Fase 8 (B2): anillo de telemetría de daño (últimas ~50 entradas, una por
// daño aplicado). Lo alimenta players.logDamage y lo inspeccionan los tests
// headless para diagnosticar la pérdida de vida "sin causa".
const damageLog = [];

module.exports = {
	chunks,
	players,
	furnaces,
	chests,
	crops,
	mobs,
	arrows,
	dirtyChunks,
	timeOffset,
	damageLog
};
