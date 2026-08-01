'use strict';

// ============================================================
// JUGADORES: INVENTARIO, SALUD Y DAÑO
// ============================================================
const WebSocket = require('ws');
const { getHeight } = require('./world.js');

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
    player.x = 0.5; player.z = 0.5;
    player.y = getHeight(0, 0) + 2;
    sendHealth(player);
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify({ event: 'teleport', data: { x: player.x, y: player.y, z: player.z } }));
    }
  }
}

module.exports = {
  addToInventory, removeFromInventory, countInInventory,
  sendInventory, sendHealth, damagePlayer, setBroadcastHandler,
};
