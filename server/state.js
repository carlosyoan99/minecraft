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
// Fase 10 (nota del usuario): AHORA SÍ se persiste en world.json (save.js
// buildMeta/loadWorld) para que la hora del mundo continúe entre sesiones, y
// los mundos nuevos arrancan al amanecer. /time set y dormir lo siguen usando.
// Fase 8 (B2): anillo de telemetría de daño (últimas ~50 entradas, una por
// daño aplicado). Lo alimenta players.logDamage y lo inspeccionan los tests
// headless para diagnosticar la pérdida de vida "sin causa".
const damageLog = [];
// Fase 12 (Bloque B): cooldowns de las trampas de los templos — clave
// "cx,cz" del centro del templo → timestamp del último disparo (evita que
// un jugador parado en el pasillo reciba un aluvión de flechas por tick).
const templeTrapCooldowns = new Map();

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
	damageLog,
	templeTrapCooldowns
};
