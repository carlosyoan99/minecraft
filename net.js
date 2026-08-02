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
  B, I, NOT_MINEABLE, FUEL_ITEMS, isPickaxe, isSolidBlock,
  SWORD_DAMAGE, MOB_XP, ORE_XP,
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
  // Spawn sobre tierra firme: si (0,0) es un lago, findSpawn busca la columna
  // firme más cercana para que el jugador no aparezca nadando (Fase 4).
  const spawn = world.findSpawn(0, 0);
  const spawnX = spawn.x, spawnY = spawn.y, spawnZ = spawn.z;
  const generated = world.ensureChunksAround(spawnX, spawnZ, VIEW_DISTANCE_CHUNKS);

  const player = {
    id: playerId, ws,
    x: spawnX, y: spawnY, z: spawnZ, yaw: 0, pitch: 0,
    health: 20, maxHealth: 20,
    xp: 0, level: 0, // Fase 5: experiencia simple / niveles
    food: 20, saturation: 20, foodAccum: 0, regenAccum: 0, starveAccum: 0,
    lastMoveTime: 0,
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
      dayTime: Date.now() % DAY_CYCLE_MS, // reloj del servidor: el cliente extrapola el ciclo visual
      mobs: state.mobs.filter((m) => m.alive).map(mobs.mobSnapshot),
      inventory: player.inventory, health: player.health, maxHealth: player.maxHealth,
      xp: player.xp, level: player.level, // Fase 5
      food: player.food, saturation: player.saturation,
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
        // El agua no es sólida: nadar (estar dentro de un bloque de agua) es
        // legítimo. Solo se rechaza si el jugador está dentro de un sólido.
        const feet = world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        const head = world.getBlock(Math.floor(x), Math.floor(y + 1.5), Math.floor(z));
        if (isSolidBlock(feet) || isSolidBlock(head)) {
          ws.send(JSON.stringify({ event: 'teleport', data: { x: p.x, y: p.y, z: p.z } }));
          return;
        }
        p.x = x; p.y = y; p.z = z; p.yaw = yaw || 0; p.pitch = pitch || 0;
        p.lastMoveTime = Date.now();
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
          } else if (block === B.DIRT || block === B.GRASS || block === B.SAND || block === B.SNOW) {
            canBreak = true;
          }
          if (!canBreak) return;
          world.setBlock(x, y, z, B.AIR);
          let drop = block;
          if (block === B.STONE) drop = B.COBBLESTONE;
          if (block === B.GRASS) drop = B.DIRT;
          playerHelpers.addToInventory(p, drop, 1);
          // La hierba también suelta comida de cría para los animales
          // (semillas → pollo, trigo → vaca/oveja, zanahoria → cerdo)
          if (block === B.GRASS) {
            const grassFeed = [[I.SEEDS, 0.25], [I.WHEAT, 0.10], [I.CARROT, 0.06]];
            for (const [id, prob] of grassFeed) {
              if (Math.random() < prob) playerHelpers.addToInventory(p, id, 1);
            }
          }
          // Fase 5: XP al minar minerales
          if (ORE_XP[block]) playerHelpers.addXp(p, ORE_XP[block]);
          // Fase 5: desgaste de la herramienta (se rompe al llegar a 0)
          const broke = playerHelpers.applyToolWear(p);
          playerHelpers.sendInventory(p);
          if (broke) {
            p.ws.send(JSON.stringify({ event: 'tool_broke', data: { slot: p.selectedSlot } }));
          }
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
        // Conservar la durabilidad al pasar una herramienta por la mesa
        // (evita "repararla" gratis y, por tanto, duplicar usos)
        p.craftingGrid[toGridSlot] = { id: item.id, count: 1, durability: item.durability };
        item.count -= 1;
        if (item.count <= 0) p.inventory[fromInventorySlot] = null;
        playerHelpers.sendInventory(p);
        ws.send(JSON.stringify({ event: 'crafting_grid_update', data: { grid: p.craftingGrid, success: false } }));
        break;
      }

      case 'grid_clear': {
        for (let i = 0; i < 9; i++) {
          const cell = p.craftingGrid[i];
          if (cell) playerHelpers.addToInventory(p, cell.id, cell.count, cell.durability);
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

      case 'eat': {
        // Comer el ítem seleccionado: valida que sea comida y aplica hambre+saturación
        const held = p.inventory[p.selectedSlot];
        if (!held) return;
        const verdict = playerHelpers.canEat(p, held.id);
        if (verdict === 'full') {
          // Estilo Minecraft: avisar cuando no hay hambre ni saturación por recuperar
          p.ws.send(JSON.stringify({ event: 'eat_rejected', data: {} }));
          return;
        }
        if (verdict !== 'ok') return; // no es comida (no debería pasar vía UI)
        playerHelpers.eatFood(p, held.id);
        held.count -= 1;
        if (held.count <= 0) p.inventory[p.selectedSlot] = null;
        playerHelpers.sendInventory(p);
        break;
      }

      case 'feed_mob': {
        // Alimentar a un animal con su comida de cría: modo amor → pareja → bebé
        const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
        if (!mob) return;
        if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
        const held = p.inventory[p.selectedSlot];
        if (!held) return;
        if (mobs.canFeed(mob, held.id) !== 'ok') return;
        held.count -= 1;
        if (held.count <= 0) p.inventory[p.selectedSlot] = null;
        playerHelpers.sendInventory(p);
        const baby = mobs.applyFeed(mob, state.mobs);
        if (baby) broadcast('mob_breed', { x: baby.x, y: baby.y, z: baby.z });
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
        // Fase 5: daño de espada por material (sin espada, 2)
        const dmg = SWORD_DAMAGE[tool] || 2;
        mob.health -= dmg;
        // Fase 5: las espadas se desgastan al golpear (se rompen al llegar a 0)
        const broke = playerHelpers.applyToolWear(p, true);
        const isSword = !!SWORD_DAMAGE[tool];
        if (mob.health <= 0) {
          mob.alive = false;
          broadcast('mob_death', { id: mob.id });
          // Drops de comida de animales al morir (directo al atacante)
          const drops = mobs.mobDrops(mob);
          if (drops) for (const d of drops) playerHelpers.addToInventory(p, d.id, d.count);
          // Fase 5: XP por matar mobs
          playerHelpers.addXp(p, MOB_XP[mob.type] || 0);
          playerHelpers.sendInventory(p);
        } else if (isSword) {
          // Cada golpe de espada desgasta aunque el mob sobreviva:
          // sincronizar la durabilidad del HUD
          playerHelpers.sendInventory(p);
        }
        if (broke) {
          p.ws.send(JSON.stringify({ event: 'tool_broke', data: { slot: p.selectedSlot } }));
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

  // Hambre: decae con el tiempo/actividad, regenera o inanición
  for (const p of state.players.values()) playerHelpers.tickPlayer(p, TICK_MS);

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
