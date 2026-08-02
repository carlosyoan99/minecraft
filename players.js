'use strict';

// ============================================================
// JUGADORES: INVENTARIO, SALUD Y DAÑO
// ============================================================
const WebSocket = require('ws');
const { findSpawn } = require('./world.js');
const { FOOD_VALUES, isFood } = require('./constants.js');

function addToInventory(player, itemId, count = 1) {
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
    player.ws.send(JSON.stringify({ event: 'health_update', data: { health: player.health } }));
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
    // Respawn simple
    player.health = 20;
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

  // Regeneración: comida casi llena y salud no completa
  if (player.food >= FOOD_REGEN_THRESHOLD && player.health < FOOD_MAX) {
    player.regenAccum += dtMs;
    if (player.regenAccum >= FOOD_REGEN_INTERVAL_MS) {
      player.regenAccum = 0;
      player.health = Math.min(FOOD_MAX, player.health + 1);
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
  setBroadcastHandler,
};
