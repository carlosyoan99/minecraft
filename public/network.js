// ============================================================
// RED: MANEJO DE MENSAJES DEL SERVIDOR
// ============================================================

import { playCrack, playHit } from "./audio.js";
import { setStoredName, socket } from "./connection.js";
import { TORCH } from "./constants.js";
import { initDayNight } from "./daynight.js";
import {
	flashMob,
	removeMob,
	removeRemotePlayer,
	renameRemotePlayer,
	spawnHearts,
	spawnRemotePlayer,
	updateMobs,
	updateRemotePlayer
} from "./mobs.js";
import { spawnBlockBreak, spawnBlockPlace } from "./particles.js"; // Fase 7: partículas
import { teleport } from "./player.js";
import { camera } from "./scene.js";
import { applyStoredSettings } from "./settings.js";
import {
	addChatLine,
	applyArmor,
	applyChestState,
	applyCraftingGrid,
	applyFood,
	applyFurnaceState,
	applyHealth,
	applyInventory,
	applyXp,
	flashMessage,
	onSeedRejected,
	onWorldLoaded,
	renderWorldsList
} from "./ui.js";
import {
	hideCrackIfAt,
	hotReloadTextures,
	loadChunkData,
	rebuildAffectedChunks,
	rebuildAround,
	setClientBlock,
	setCrackStage,
	unloadChunks
} from "./world.js";

let playerId = null;
let playerName = "";
// Fase 7: nombre visible del jugador local (fuente de verdad: el servidor).
export function getPlayerName() {
	return playerName;
}

socket.addEventListener("message", (e) => {
	const { event, data } = JSON.parse(e.data);
	switch (event) {
		case "init": {
			playerId = data.playerId;
			playerName = data.name || playerName;
			setStoredName(playerName);
			camera.position.set(data.spawnX, data.spawnY, data.spawnZ);
			loadChunkData(data.chunkData);
			applyInventory(data.inventory);
			applyArmor(data.armor); // Fase 7: armadura equipada
			applyHealth(data.health, data.maxHealth);
			applyXp(data.xp || 0, data.level || 0);
			applyFood(data.food, data.saturation);
			updateMobs(data.mobs);
			initDayNight(data.dayTime);
			for (const p of data.otherPlayers)
				spawnRemotePlayer(p.id, p.x, p.y, p.z, p.name);
			// Fase 6: cerrar la pantalla de carga (esperando el init de la semilla
			// pedida si se cambió de mundo desde el menú)
			onWorldLoaded(data.seed);
			// Fase 7: aplicar los ajustes guardados (distancia de render) ahora que
			// el mundo está cargado; el servidor reenvía los chunks del radio pedido
			applyStoredSettings();
			break;
		}
		case "chunks_add":
			loadChunkData(data.chunkData);
			break;
		case "chunks_unload":
			unloadChunks(data.keys);
			break;
		case "worlds_list":
			renderWorldsList(data.worlds || []);
			break; // Fase 7: menú de mundos
		case "block_update": {
			// Una antorcha colocada/rota cambia la luz de un radio 7: el radio cruza
			// las fronteras de chunk, así que hay que re-hornear el vecindario 3x3
			// (rebuildAround) y no solo el chunk + los vecinos pegados al borde
			// (rebuildAffectedChunks). Sin esto la luz se cortaría en los bordes.
			const prev = setClientBlock(data.x, data.y, data.z, data.block);
			if (prev === TORCH || data.block === TORCH) rebuildAround(data.x, data.z);
			else rebuildAffectedChunks(data.x, data.z);
			hideCrackIfAt(data.x, data.y, data.z); // el bloque en mina se rompió
			// Fase 7: partículas — romper (sólido → aire) o colocar (aire → bloque).
			if (prev !== 0 && data.block === 0)
				spawnBlockBreak(data.x, data.y, data.z, prev);
			else if (prev === 0 && data.block !== 0)
				spawnBlockPlace(data.x, data.y, data.z, data.block);
			break;
		}
		case "block_break_progress":
			setCrackStage(data.stage, data.x, data.y, data.z);
			break; // Fase 6: grietas de rotura
		case "player_join":
			spawnRemotePlayer(data.id, data.x, data.y, data.z, data.name);
			break;
		case "player_move":
			updateRemotePlayer(data.id, data.x, data.y, data.z, data.yaw);
			break;
		case "player_rename":
			renameRemotePlayer(data.id, data.name);
			break; // Fase 7: cambio de nombre en vivo
		case "player_leave":
			removeRemotePlayer(data.id);
			break;
		case "mobs_update":
			updateMobs(data);
			break;
		case "server_metrics":
			// Fase 7: métricas del tick del servidor (media de 1s) para la
			// auditoría y el HUD F3: window.__mcServerTickMs / __mcChunkGenMs.
			window.__mcServerTickMs = data.tickMs;
			window.__mcChunkGenMs = data.chunkGenMs;
			break;
		case "mob_death":
			removeMob(data.id);
			break;
		case "mob_hit":
			// Fase 8 (B10): feedback del golpe — flash de daño + sonido.
			flashMob(data.id);
			playHit();
			break;
		case "mob_breed":
			spawnHearts(data.x, data.y, data.z);
			break;
		case "teleport":
			teleport(data.x, data.y, data.z);
			break;
		case "player_die":
			// Fase 7: lostInventory distingue la pérdida según gamemode (survival
			// pierde el inventario al morir; creative lo conserva).
			if (data.id === playerId)
				flashMessage(
					data.lostInventory
						? "💀 Has muerto — inventario perdido, reapareciendo..."
						: "💀 Has muerto — reapareciendo..."
				);
			break;
		case "inventory_update":
			applyInventory(data.inventory);
			applyArmor(data.armor);
			break;
		case "sleep_ok":
			flashMessage("🌙 Dormiste: amaneció y fijaste tu punto de reaparición.");
			break; // Fase 7
		case "sleep_rejected":
			flashMessage("🌙 Solo puedes dormir de noche.");
			break; // Fase 7
		case "health_update":
			applyHealth(data.health, data.maxHealth);
			break;
		case "xp_update":
			applyXp(data.xp, data.level);
			break;
		case "level_up":
			flashMessage(`⬆️ ¡Subiste al nivel ${data.level}!`);
			applyXp(data.xp, data.level);
			break;
		case "tool_broke": {
			playCrack();
			flashMessage("💥 ¡Tu herramienta se rompió!");
			break;
		}
		case "food_update": {
			if (data.food === 0) flashMessage("🍗 ¡Estás hambriento! Busca comida.");
			applyFood(data.food, data.saturation);
			break;
		}
		case "eat_rejected":
			flashMessage("😋 ¡No tienes hambre!");
			break;
		case "crafting_grid_update":
			applyCraftingGrid(data.grid, data.success);
			break;
		case "furnace_state":
			applyFurnaceState(data);
			break;
		case "chest_state":
			applyChestState(data);
			break; // Fase 6: slots del cofre abierto
		case "time_set":
			initDayNight(data.dayTime);
			break; // Fase 6: /time set re-sincroniza el ciclo visual
		case "seed_rejected":
			onSeedRejected(data.reason);
			break; // Fase 6: el servidor no pudo cambiar de semilla
		case "textures_reload": {
			// Fase 6: hot-reload del atlas (sin recargar la página)
			hotReloadTextures();
			flashMessage("🔄 Atlas de texturas recargado");
			break;
		}
		case "chat":
			addChatLine(data.id === playerName ? "Tú" : data.id, data.message);
			break;
	}
});
