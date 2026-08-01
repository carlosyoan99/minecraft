'use strict';

// ============================================================
// RED: HTTP + WebSocket, handler de conexión y bucle principal
// ============================================================
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
  PORT, TICK_MS, VIEW_DISTANCE_CHUNKS, DAY_CYCLE_MS, SEED,
  B, NOT_MINEABLE, FUEL_ITEMS, isPickaxe,
} = require('./constants.js');
const state = require('./state.js');
const world = require('./world.js');
const playerHelpers = require('./players.js');
const crafting = require('./crafting.js');
const mobs = require('./mobs.js');

function broadcast(event, data, exceptId = null) {
  const msg = JSON.stringify({ event, data });
  for (const p of state.players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

function handleConnection(ws) {
  const playerId = uuidv4();
  const spawnX = 0.5, spawnZ = 0.5;
  const generated = world.ensureChunksAround(spawnX, spawnZ, VIEW_DISTANCE_CHUNKS);
  const spawnY = world.getHeight(0, 0) + 2;

  const player = {
    id: playerId, ws,
    x: spawnX, y: spawnY, z: spawnZ, yaw: 0, pitch: 0,
    health: 20,
    inventory: new Array(36).fill(null),
    selectedSlot: 0,
    craftingGrid: new Array(9).fill(null),
    openFurnace: null,
  };
  state.players.set(playerId, player);
  console.log(`🟢 Jugador conectado: ${playerId} (${state.players.size} en línea)`);

  const chunkData = {};
  for (const [key, data] of state.chunks) chunkData[key] = Array.from(data);

  ws.send(JSON.stringify({
    event: 'init',
    data: {
      playerId, chunkData, spawnX, spawnY, spawnZ,
      mobs: state.mobs.filter((m) => m.alive).map(mobs.mobSnapshot),
      inventory: player.inventory, health: player.health,
      otherPlayers: Array.from(state.players.values()).filter((p) => p.id !== playerId)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z })),
    },
  }));

  broadcast('player_join', { id: playerId, x: spawnX, y: spawnY, z: spawnZ }, playerId);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { event, data } = msg;
    const p = state.players.get(playerId);
    if (!p) return;

    switch (event) {
      case 'move': {
        const { x, y, z, yaw, pitch } = data;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return;
        const dist = Math.hypot(x - p.x, y - p.y, z - p.z);
        if (dist > 1.2) { // límite anti-cheat de velocidad
          ws.send(JSON.stringify({ event: 'teleport', data: { x: p.x, y: p.y, z: p.z } }));
          return;
        }
        const feet = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        const head = world.getBlock(Math.floor(x), Math.floor(y + 1.5), Math.floor(z));
        if (feet !== B.AIR || head !== B.AIR) {
          ws.send(JSON.stringify({ event: 'teleport', data: { x: p.x, y: p.y, z: p.z } }));
          return;
        }
        p.x = x; p.y = y; p.z = z; p.yaw = yaw || 0; p.pitch = pitch || 0;
        // Generar chunks nuevos bajo demanda al moverse
        const newChunks = world.ensureChunksAround(x, z, 2);
        if (newChunks.length) {
          const extra = {};
          for (const key of newChunks) extra[key] = Array.from(state.chunks.get(key));
          ws.send(JSON.stringify({ event: 'chunks_add', data: { chunkData: extra } }));
        }
        broadcast('player_move', { id: playerId, x, y, z, yaw: p.yaw, pitch: p.pitch }, playerId);
        break;
      }

      case 'block_action': {
        const { action, x, y, z, itemId } = data;
        if (Math.hypot(x - p.x, y - p.y, z - p.z) > 7) return;
        if (action === 'break') {
          const block = world.getBlock(x, y, z);
          if (NOT_MINEABLE.has(block)) return;
          const tool = p.inventory[p.selectedSlot] ? p.inventory[p.selectedSlot].id : 0;
          let canBreak = true;
          if (block === B.STONE || (block >= B.COAL_ORE && block <= B.EMERALD_ORE) || block === B.COBBLESTONE) {
            canBreak = isPickaxe(tool);
          } else if (block === B.OAK_LOG) {
            canBreak = true; // el hacha solo acelera; se puede romper a mano
          } else if (block === B.DIRT || block === B.GRASS || block === B.SAND) {
            canBreak = true;
          }
          if (!canBreak) return;
          world.setBlock(x, y, z, B.AIR);
          let drop = block;
          if (block === B.STONE) drop = B.COBBLESTONE;
          if (block === B.GRASS) drop = B.DIRT;
          playerHelpers.addToInventory(p, drop, 1);
          playerHelpers.sendInventory(p);
        } else if (action === 'place') {
          if (world.getBlock(x, y, z) !== B.AIR) return;
          const slot = p.inventory[p.selectedSlot];
          if (!slot || slot.id !== itemId || slot.count < 1) return;
          world.setBlock(x, y, z, itemId);
          playerHelpers.removeFromInventory(p, itemId, 1);
          playerHelpers.sendInventory(p);
        }
        break;
      }

      case 'craft': {
        p.craftingGrid = Array.isArray(data.grid) ? data.grid : p.craftingGrid;
        const recipe = crafting.matchRecipe(p.craftingGrid);
        if (recipe) {
          for (let i = 0; i < 9; i++) {
            const cell = p.craftingGrid[i];
            if (cell) {
              cell.count -= 1;
              p.craftingGrid[i] = cell.count > 0 ? cell : null;
            }
          }
          playerHelpers.addToInventory(p, recipe.result.id, recipe.result.count || 1);
          playerHelpers.sendInventory(p);
        }
        ws.send(JSON.stringify({ event: 'crafting_grid_update', data: { grid: p.craftingGrid, success: !!recipe } }));
        break;
      }

      case 'grid_set': {
        // El cliente pide mover un item del inventario a una celda de crafteo
        const { fromInventorySlot, toGridSlot } = data;
        const item = p.inventory[fromInventorySlot];
        if (!item || toGridSlot < 0 || toGridSlot > 8) return;
        if (p.craftingGrid[toGridSlot]) return; // celda ocupada
        p.craftingGrid[toGridSlot] = { id: item.id, count: 1 };
        item.count -= 1;
        if (item.count <= 0) p.inventory[fromInventorySlot] = null;
        playerHelpers.sendInventory(p);
        ws.send(JSON.stringify({ event: 'crafting_grid_update', data: { grid: p.craftingGrid, success: false } }));
        break;
      }

      case 'grid_clear': {
        for (let i = 0; i < 9; i++) {
          const cell = p.craftingGrid[i];
          if (cell) playerHelpers.addToInventory(p, cell.id, cell.count);
        }
        p.craftingGrid.fill(null);
        playerHelpers.sendInventory(p);
        ws.send(JSON.stringify({ event: 'crafting_grid_update', data: { grid: p.craftingGrid, success: false } }));
        break;
      }

      case 'furnace_open': {
        const key = `${data.x},${data.y},${data.z}`;
        if (world.getBlock(data.x, data.y, data.z) !== B.FURNACE) return;
        p.openFurnace = key;
        const f = crafting.getOrCreateFurnace(key);
        ws.send(JSON.stringify({ event: 'furnace_state', data: { key, ...crafting.furnaceSnapshot(f) } }));
        break;
      }

      case 'furnace_action': {
        if (!p.openFurnace) return;
        const key = p.openFurnace; // capturar antes de que 'close' lo anule
        const f = crafting.getOrCreateFurnace(key);
        if (data.action === 'add_fuel') {
          const slot = p.inventory[data.invSlot];
          if (slot && FUEL_ITEMS.has(slot.id) && (!f.fuelItem || f.fuelItem === slot.id)) {
            f.fuelItem = slot.id;
            slot.count -= 1;
            if (slot.count <= 0) p.inventory[data.invSlot] = null;
            playerHelpers.sendInventory(p);
          }
        } else if (data.action === 'add_input') {
          const slot = p.inventory[data.invSlot];
          if (slot && crafting.isCookable(slot.id) && (!f.inputItem || f.inputItem.id === slot.id)) {
            f.inputItem = f.inputItem ? { id: slot.id, count: f.inputItem.count + slot.count } : { id: slot.id, count: slot.count };
            p.inventory[data.invSlot] = null;
            playerHelpers.sendInventory(p);
          }
        } else if (data.action === 'collect_output') {
          if (f.outputItem && f.outputCount > 0) {
            if (playerHelpers.addToInventory(p, f.outputItem, f.outputCount)) {
              f.outputItem = null; f.outputCount = 0;
              playerHelpers.sendInventory(p);
            }
          }
        } else if (data.action === 'close') {
          p.openFurnace = null;
        }
        ws.send(JSON.stringify({ event: 'furnace_state', data: { key, ...crafting.furnaceSnapshot(f) } }));
        break;
      }

      case 'inventory_select': {
        if (typeof data.slot === 'number' && data.slot >= 0 && data.slot < 9) p.selectedSlot = data.slot;
        break;
      }

      case 'chat': {
        if (typeof data.message === 'string') broadcast('chat', { id: playerId, message: data.message.slice(0, 200) });
        break;
      }

      case 'attack_mob': {
        const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
        if (!mob) return;
        if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
        const tool = p.inventory[p.selectedSlot] ? p.inventory[p.selectedSlot].id : 0;
        const dmg = (tool >= 215 && tool <= 219) ? 6 : 2;
        mob.health -= dmg;
        if (mob.health <= 0) {
          mob.alive = false;
          broadcast('mob_death', { id: mob.id });
          playerHelpers.sendInventory(p);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    state.players.delete(playerId);
    console.log(`🔴 Jugador desconectado: ${playerId} (${state.players.size} en línea)`);
    broadcast('player_leave', { id: playerId });
  });

  ws.on('error', () => {});
}

// ============================================================
// BUCLE PRINCIPAL
// ============================================================
function mainLoop() {
  const isNight = (Date.now() % DAY_CYCLE_MS) > DAY_CYCLE_MS / 2;
  for (const m of state.mobs) if (m.alive) m.tick(isNight);
  state.mobs = state.mobs.filter((m) => m.alive);
  broadcast('mobs_update', state.mobs.map(mobs.mobSnapshot));

  if (Math.random() < 0.03) mobs.spawnMobs();

  crafting.tickFurnaces();
  for (const [key, f] of state.furnaces) {
    // Notificar a quien tenga ese horno abierto
    for (const p of state.players.values()) {
      if (p.openFurnace === key && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify({ event: 'furnace_state', data: { key, ...crafting.furnaceSnapshot(f) } }));
      }
    }
  }
}

function start() {
  const server = http.createServer(app);
  const wss = new WebSocket.Server({ server });
  wss.on('connection', handleConnection);

  setInterval(mainLoop, TICK_MS);

  server.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
    console.log(`🌍 Semilla: ${SEED}  |  📦 Chunks: ${state.chunks.size}  |  🧟 Mobs: ${state.mobs.length}`);
  });
}

module.exports = { broadcast, start };
