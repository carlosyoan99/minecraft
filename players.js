'use strict';

// ============================================================
// JUGADORES: INVENTARIO, SALUD Y DAÑO
// ============================================================
const WebSocket = require('ws');
const { findSpawn } = require('./world.js');
const {
  FOOD_VALUES, isFood, TOOL_DURABILITY, isTool, SWORD_DAMAGE,
  XP_PER_LEVEL, MAX_LEVEL_HEALTH_BONUS,
} = require('./constants.js');

function addToInventory(player, itemId, count = 1, durability) {
  // Las herramientas no se apilan (cada una con su durabilidad propia) y
  // su count es siempre 1: ignoramos count a propósito (ningún call site
  // añade más de 1 herramienta a la vez — el crafteo da 1 y el grid 1).
  if (isTool(itemId)) {
    const empty = player.inventory.findIndex((s) => !s);
    if (empty === -1) return false;
    player.inventory[empty] = { id: itemId, count: 1, durability: durability ?? TOOL_DURABILITY[itemId] };
    return true;
  }
  // Apilar en un slot existente del mismo tipo (sin límite de stack, simplificado)
  for (let i = 0; i < player.inventory.length; i++) {
    if (player.inventory[i] && player.inventory[i].id === itemId) {
      player.inventory[i].count += count;
      return true;
    }
  }
  const empty = player.inventory.findIndex((s) => !s);
  if (empty === -1) return false;
  player.inventory[empty] = { id: itemId, count };
  return true;
}

// ============================================================
// DURABILIDAD DE HERRAMIENTAS (Fase 5)
// Desgasta la herramienta en la mano del jugador: -1 por uso. Si llega a 0,
// se rompe (se elimina del inventario) y devuelve true. Con onlySwords=true
// solo desgasta si lo que se empuña es una espada (usado al atacar mobs);
// sin él, cualquier herramienta se desgasta (usado al romper bloques).
// El servidor es la fuente de verdad: el cliente solo pinta el HUD.
// ============================================================
function applyToolWear(player, onlySwords = false) {
  const slot = player.inventory[player.selectedSlot];
  if (!slot || !isTool(slot.id)) return false;
  if (onlySwords && !SWORD_DAMAGE[slot.id]) return false;
  const cur = typeof slot.durability === 'number' ? slot.durability : TOOL_DURABILITY[slot.id];
  const next = Math.max(0, cur - 1);
  if (next <= 0) {
    // Se rompe a mitad de la acción: se elimina aquí, de forma atómica con el
    // resto de la acción (romper/atacar), sin duplicar items (ver auditoría).
    player.inventory[player.selectedSlot] = null;
    return true;
  }
  slot.durability = next;
  return false;
}

// ============================================================
// EXPERIENCIA Y NIVELES SIMPLES (Fase 5, opcional)
// XP acumulada -> nivel = floor(xp / XP_PER_LEVEL). Cada nivel suma +1 de
// salud máxima (máx +10); la salud actual no crece sola. Se conserva al morir.
// ============================================================
function addXp(player, amount) {
  player.xp = (player.xp || 0) + amount;
  const newLevel = Math.floor(player.xp / XP_PER_LEVEL);
  if (newLevel > (player.level || 0)) {
    player.level = newLevel;
    player.maxHealth = 20 + Math.min(newLevel, MAX_LEVEL_HEALTH_BONUS);
    sendHealth(player);
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify({ event: 'level_up', data: { level: player.level, xp: player.xp } }));
    }
  }
  sendXp(player);
}

function sendXp(player) {
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({ event: 'xp_update', data: { xp: player.xp, level: player.level || 0 } }));
  }
}

function removeFromInventory(player, itemId, count = 1) {
  for (let i = 0; i < player.inventory.length; i++) {
    const s = player.inventory[i];
    if (s && s.id === itemId) {
      if (s.count > count) { s.count -= count; return true; }
      if (s.count === count) { player.inventory[i] = null; return true; }
      return false;
    }
  }
  return false;
}

function countInInventory(player, itemId) {
  let total = 0;
  for (const s of player.inventory) if (s && s.id === itemId) total += s.count;
  return total;
}

function sendInventory(player) {
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({ event: 'inventory_update', data: { inventory: player.inventory } }));
  }
}

function sendHealth(player) {
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({ event: 'health_update', data: { health: player.health, maxHealth: player.maxHealth || 20 } }));
  }
}

function sendFood(player) {
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({ event: 'food_update', data: { food: player.food, saturation: player.saturation } }));
  }
}

// Hook para que la entrada (net) conecte el broadcast de player_die;
// evita un ciclo de require entre players y net.
let broadcastHandler = null;
function setBroadcastHandler(fn) { broadcastHandler = fn; }

function damagePlayer(player, amount) {
  player.health = Math.max(0, player.health - amount);
  sendHealth(player);
  if (player.health <= 0) {
    if (broadcastHandler) broadcastHandler('player_die', { id: player.id });
    // Respawn simple (la XP y el nivel se conservan; la salud máxima sí aplica)
    player.health = player.maxHealth || 20;
    player.food = 20;
    player.saturation = 20;
    player.foodAccum = 0; player.regenAccum = 0; player.starveAccum = 0;
    // Respawn sobre tierra firme (igual que el spawn inicial): si (0,0) es un
    // lago, findSpawn busca la columna firme más cercana (Fase 4).
    const spawn = findSpawn(0, 0);
    player.x = spawn.x; player.y = spawn.y; player.z = spawn.z;
    sendHealth(player);
    sendFood(player);
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify({ event: 'teleport', data: { x: player.x, y: player.y, z: player.z } }));
    }
  }
}

// ============================================================
// HAMBRE (Fase 3)
// food va de 0 a 20. El servidor es la fuente de verdad: el tick
// decae la comida con el tiempo (más rápido si el jugador se mueve),
// regenera salud cuando la comida está alta (consumiendo comida) y
// drena salud por inanición cuando llega a 0.
// ============================================================
const FOOD_MAX = 20;
const FOOD_DECAY_MS = 30000;        // 1 punto de comida cada 30s parado
const FOOD_DECAY_MOVING_MS = 15000; // y cada 15s si se está moviendo
const FOOD_REGEN_THRESHOLD = 18;    // regenera salud solo con la comida casi llena
const FOOD_REGEN_INTERVAL_MS = 2000; // +1 salud cada 2s (y -1 comida)
const FOOD_STARVE_INTERVAL_MS = 2000; // -1 salud cada 2s con comida a 0
const MOVING_WINDOW_MS = 2000;      // se considera en movimiento si hubo move reciente

// ============================================================
// COMER (Fase 3): aplica hambre + saturación si el ítem es comida
// y no está todo lleno. Devuelve true si se comió.
// ============================================================
// Verifica si el jugador puede comer un ítem: 'ok' si puede,
// 'full' si tiene hambre y saturación llenas, o null si no es comida.
// Lo usa net.js para avisar al cliente cuando el eat se rechaza.
function canEat(player, itemId) {
  if (!isFood(itemId)) return null;
  if (player.food >= FOOD_MAX && player.saturation >= FOOD_MAX) return 'full';
  return 'ok';
}

function eatFood(player, itemId) {
  if (canEat(player, itemId) !== 'ok') return false;
  const v = FOOD_VALUES[itemId];
  player.food = Math.min(FOOD_MAX, player.food + v.food);
  player.saturation = Math.min(FOOD_MAX, player.saturation + v.saturation);
  sendFood(player);
  return true;
}

// Se llama una vez por tick (TICK_MS) para cada jugador conectado.
function tickPlayer(player, dtMs) {
  // Decaimiento: más rápido en movimiento. La saturación se consume primero
  // (amortigua el hambre), como en Minecraft; luego baja la comida.
  const moving = player.lastMoveTime && (Date.now() - player.lastMoveTime) < MOVING_WINDOW_MS;
  player.foodAccum += dtMs;
  const decayMs = moving ? FOOD_DECAY_MOVING_MS : FOOD_DECAY_MS;
  if (player.foodAccum >= decayMs) {
    player.foodAccum = 0;
    if (player.saturation > 0) {
      player.saturation = Math.max(0, player.saturation - 1); // saturación fraccionaria (p.ej. 0.8) → nunca negativa
      sendFood(player);
    } else if (player.food > 0) {
      player.food--;
      sendFood(player);
    }
  }

  // Regeneración: comida casi llena y salud no completa (máx = salud máxima del nivel)
  const maxHealth = player.maxHealth || FOOD_MAX;
  if (player.food >= FOOD_REGEN_THRESHOLD && player.health < maxHealth) {
    player.regenAccum += dtMs;
    if (player.regenAccum >= FOOD_REGEN_INTERVAL_MS) {
      player.regenAccum = 0;
      player.health = Math.min(maxHealth, player.health + 1);
      player.food = Math.max(0, player.food - 1);
      sendHealth(player);
      sendFood(player);
    }
  } else {
    player.regenAccum = 0;
  }

  // Inanición: comida a 0 drena la salud
  if (player.food <= 0 && player.health > 0) {
    player.starveAccum += dtMs;
    if (player.starveAccum >= FOOD_STARVE_INTERVAL_MS) {
      player.starveAccum = 0;
      damagePlayer(player, 1);
    }
  } else {
    player.starveAccum = 0;
  }
}

module.exports = {
  addToInventory, removeFromInventory, countInInventory,
  sendInventory, sendHealth, sendFood, damagePlayer, tickPlayer, eatFood, canEat,
  applyToolWear, addXp, sendXp,
  setBroadcastHandler,
};
