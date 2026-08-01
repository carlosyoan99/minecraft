// ============================================================
// RED: MANEJO DE MENSAJES DEL SERVIDOR
// ============================================================
import { camera } from './scene.js';
import { socket } from './connection.js';
import { loadChunkData, setClientBlock, rebuildAffectedChunks, unloadChunks } from './world.js';
import {
  spawnRemotePlayer, removeRemotePlayer, updateRemotePlayer, updateMobs, removeMob,
} from './mobs.js';
import { teleport } from './player.js';
import {
  applyInventory, applyHealth, applyCraftingGrid, applyFurnaceState, addChatLine, flashMessage,
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
      applyHealth(data.health);
      updateMobs(data.mobs);
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
    case 'teleport': teleport(data.x, data.y, data.z); break;
    case 'player_die': if (data.id === playerId) flashMessage('💀 Has muerto — reapareciendo...'); break;
    case 'inventory_update': applyInventory(data.inventory); break;
    case 'health_update': applyHealth(data.health); break;
    case 'crafting_grid_update': applyCraftingGrid(data.grid, data.success); break;
    case 'furnace_state': applyFurnaceState(data); break;
    case 'chat': addChatLine(data.id === playerId ? 'Tú' : data.id.slice(0, 6), data.message); break;
  }
});
