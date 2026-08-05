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
const mobs = [];
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
	mobs,
	dirtyChunks,
	timeOffset,
	damageLog
};
