"use strict";

// ============================================================
// ESTADO COMPARTIDO DEL MUNDO
// Los Maps/Set se mutan en el sitio; `mobs` se reasigna (filtros en el
// bucle principal y al cargar), así que SIEMPRE acceder vía state.mobs.
// ============================================================
const chunks = new Map(); // "cx,cz" -> Uint8Array(16*64*16)
const players = new Map(); // id -> player
const furnaces = new Map(); // "x,y,z" -> { fuelItem, fuelTicks, inputItem, progress, requiredTicks, outputItem, outputCount }
// Fase 16 (C5/REN-2): quién tiene cada horno abierto — "x,y,z" -> Set<playerId>.
// Evita el bucle O(H×J) por tick: para notificar un horno solo se recorre la
// lista de quien lo mira. Se mantiene al día en furnace_open / furnace_action
// (close) / desconexión / horno roto (la notificación lo detecta y limpia).
const openFurnaceWatchers = new Map();
const chests = new Map(); // "x,y,z" -> array(27) de slots null | { id, count, durability } (Fase 6)
// Fase 9 (Bloque C): cultivos — "x,y,z" -> { stage: 0-7, plantedAt: Date.now() }
// (los bloques solo guardan el ID; el estado de crecimiento vive aquí y se
// persiste en world.json junto a hornos/cofres).
const crops = new Map();
const mobs = [];
// Fase 9 (Bloque D): proyectiles del esqueleto — { x,y,z, vx,vy,vz, life, from }
// (entidad ligera con física simple de gravedad; se envía en arrows_update).
const arrows = [];
// Fase 21.5 (A1): bobbers de pesca — { x,y,z, vx,vy,vz, playerId, inWater,
// biting, life }. El anzuelo es una entidad ligera (misma física que los
// proyectiles): vuela con la línea y, al impactar en agua, espera un tiempo
// aleatorio y "pica". Se replican en arrows_update con kind "bobber".
const bobbers = [];
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
// Fase 21 (B2): cooldowns de la trampa TNT de las pirámides — clave "cx,cz"
// del centro de la pirámide → timestamp de la última ignición (mismo patrón
// que templeTrapCooldowns; la explosión es lenta y no debe re-ignitarse).
const pyramidTrapCooldowns = new Map();
// Fase 13 (L2): estado de las PUERTAS (y portones) — clave "x,y,z" →
// { open: bool }. La puerta cerrada es sólida; la abierta no (como MC).
// No se persiste: al recargar, las puertas vuelven a estar cerradas
// (simplificación documentada: el estado visual es efímero).
const doors = new Map();

module.exports = {
	chunks,
	players,
	furnaces,
	openFurnaceWatchers,
	chests,
	crops,
	mobs,
	arrows,
	bobbers,
	doors,
	dirtyChunks,
	timeOffset,
	damageLog,
	templeTrapCooldowns,
	pyramidTrapCooldowns
};
