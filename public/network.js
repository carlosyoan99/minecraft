// ============================================================
// RED: MANEJO DE MENSAJES DEL SERVIDOR
// ============================================================
import { camera } from './scene.js';
import { socket } from './connection.js';
import { loadChunkData, setClientBlock, rebuildAffectedChunks, unloadChunks } from './world.js';
import {
  spawnRemotePlayer, removeRemotePlayer, updateRemotePlayer, updateMobs, removeMob, spawnHearts,
} from './mobs.js';
import { teleport } from './player.js';
import { initDayNight } from './daynight.js';
import { playCrack } from './audio.js';
import {
  applyInventory, applyHealth, applyFood, applyXp, applyCraftingGrid, applyFurnaceState, addChatLine, flashMessage,
} from './ui.js';

let playerId = null;

socket.addEventListener('message', (e) => {
  const { event, data } = JSON.parse(e.data);
  switch (event) {
    case 'init': {
      playerId = data.playerId;
      camera.position.set(data.spawnX, data.spawnY, data.spawnZ);
      loadChunkData(data.chunkData);
      applyInventory(data.inventory);
      applyHealth(data.health, data.maxHealth);
      applyXp(data.xp || 0, data.level || 0);
      applyFood(data.food, data.saturation);
      updateMobs(data.mobs);
      initDayNight(data.dayTime);
      for (const p of data.otherPlayers) spawnRemotePlayer(p.id, p.x, p.y, p.z);
      break;
    }
    case 'chunks_add': loadChunkData(data.chunkData); break;
    case 'chunks_unload': unloadChunks(data.keys); break;
    case 'block_update': {
      setClientBlock(data.x, data.y, data.z, data.block);
      rebuildAffectedChunks(data.x, data.z);
      break;
    }
    case 'player_join': spawnRemotePlayer(data.id, data.x, data.y, data.z); break;
    case 'player_move': updateRemotePlayer(data.id, data.x, data.y, data.z, data.yaw); break;
    case 'player_leave': removeRemotePlayer(data.id); break;
    case 'mobs_update': updateMobs(data); break;
    case 'mob_death': removeMob(data.id); break;
    case 'mob_breed': spawnHearts(data.x, data.y, data.z); break;
    case 'teleport': teleport(data.x, data.y, data.z); break;
    case 'player_die': if (data.id === playerId) flashMessage('💀 Has muerto — reapareciendo...'); break;
    case 'inventory_update': applyInventory(data.inventory); break;
    case 'health_update': applyHealth(data.health, data.maxHealth); break;
    case 'xp_update': applyXp(data.xp, data.level); break;
    case 'level_up': flashMessage(`⬆️ ¡Subiste al nivel ${data.level}!`); applyXp(data.xp, data.level); break;
    case 'tool_broke': {
      playCrack();
      flashMessage('💥 ¡Tu herramienta se rompió!');
      break;
    }
    case 'food_update': {
      if (data.food === 0) flashMessage('🍗 ¡Estás hambriento! Busca comida.');
      applyFood(data.food, data.saturation);
      break;
    }
    case 'eat_rejected': flashMessage('😋 ¡No tienes hambre!'); break;
    case 'crafting_grid_update': applyCraftingGrid(data.grid, data.success); break;
    case 'furnace_state': applyFurnaceState(data); break;
    case 'time_set': initDayNight(data.dayTime); break; // Fase 6: /time set re-sincroniza el ciclo visual
    case 'chat': addChatLine(data.id === playerId ? 'Tú' : data.id.slice(0, 6), data.message); break;
  }
});
