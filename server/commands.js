"use strict";

// ============================================================
// COMANDOS (Fase 6): consola básica vía chat (/help, /tp, /give,
// /time set, /gamemode). El servidor es la fuente de verdad: cada
// comando muta el estado del servidor y sincroniza al cliente con
// los eventos existentes (teleport, inventory_update, time_set,
// chunks_add, chat de sistema). Los mensajes de sistema van solo
// al emisor; el chat normal (sin /) sigue igual.
// ============================================================
const WebSocket = require("ws");
const {
	B,
	I,
	DAY_CYCLE_MS,
	WORLD_HEIGHT,
	isTool,
	NOT_MINEABLE
} = require("./constants.js");

// Índice nombre -> ID: claves de B/I en minúsculas (wooden_pickaxe, diamond,
// stone...) + alias en español (pico_de_madera, diamante, piedra...).
const NAME_TO_ID = {};
for (const [k, v] of Object.entries(B))
	if (typeof v === "number" && v !== B.AIR) NAME_TO_ID[k.toLowerCase()] = v;
for (const [k, v] of Object.entries(I))
	if (typeof v === "number") NAME_TO_ID[k.toLowerCase()] = v;
Object.assign(NAME_TO_ID, {
	// Bloques
	tierra: B.DIRT,
	cesped: B.GRASS,
	piedra: B.STONE,
	tronco: B.OAK_LOG,
	madera: B.OAK_LOG,
	hojas: B.OAK_LEAVES,
	arena: B.SAND,
	tablones: B.PLANKS,
	adoquin: B.COBBLESTONE,
	mineral_de_carbon: B.COAL_ORE,
	mineral_de_hierro: B.IRON_ORE,
	mineral_de_oro: B.GOLD_ORE,
	mineral_de_diamante: B.DIAMOND_ORE,
	mineral_de_redstone: B.REDSTONE_ORE,
	mineral_de_esmeralda: B.EMERALD_ORE,
	mesa_de_crafteo: B.CRAFTING_TABLE,
	crafteo: B.CRAFTING_TABLE,
	horno: B.FURNACE,
	vidrio: B.GLASS,
	lana: B.WOOL,
	bedrock: B.BEDROCK,
	agua: B.WATER,
	nieve: B.SNOW,
	// Ítems
	palo: I.STICK,
	carbon: I.COAL,
	lingote_de_hierro: I.IRON_INGOT,
	hierro: I.IRON_INGOT,
	lingote_de_oro: I.GOLD_INGOT,
	oro: I.GOLD_INGOT,
	diamante: I.DIAMOND,
	redstone: I.REDSTONE,
	esmeralda: I.EMERALD,
	carne_de_vaca: I.BEEF,
	carne_de_cerdo: I.PORKCHOP,
	pollo_crudo: I.CHICKEN,
	cordero_crudo: I.MUTTON,
	filete: I.COOKED_BEEF,
	cerdo_cocinado: I.COOKED_PORKCHOP,
	pollo_asado: I.COOKED_CHICKEN,
	cordero_asado: I.COOKED_MUTTON,
	trigo: I.WHEAT,
	zanahoria: I.CARROT,
	semillas: I.SEEDS,
	conejo: I.RABBIT,
	conejo_asado: I.COOKED_RABBIT,
	hilo: I.STRING,
	// Herramientas
	pico_de_madera: I.WOODEN_PICKAXE,
	pico_de_piedra: I.STONE_PICKAXE,
	pico_de_hierro: I.IRON_PICKAXE,
	pico_de_oro: I.GOLDEN_PICKAXE,
	pico_de_diamante: I.DIAMOND_PICKAXE,
	hacha_de_madera: I.WOODEN_AXE,
	hacha_de_piedra: I.STONE_AXE,
	hacha_de_hierro: I.IRON_AXE,
	hacha_de_oro: I.GOLDEN_AXE,
	hacha_de_diamante: I.DIAMOND_AXE,
	pala_de_madera: I.WOODEN_SHOVEL,
	pala_de_piedra: I.STONE_SHOVEL,
	pala_de_hierro: I.IRON_SHOVEL,
	pala_de_oro: I.GOLDEN_SHOVEL,
	pala_de_diamante: I.DIAMOND_SHOVEL,
	espada_de_madera: I.WOODEN_SWORD,
	espada_de_piedra: I.STONE_SWORD,
	espada_de_hierro: I.IRON_SWORD,
	espada_de_oro: I.GOLDEN_SWORD,
	espada_de_diamante: I.DIAMOND_SWORD
});
const ALL_IDS = new Set(Object.values(NAME_TO_ID));

const HELP = [
	"/help — lista de comandos",
	"/tp <x> <y> <z> — teletransportarte a unas coordenadas",
	"/give <item> [cantidad] — añade items al inventario (ID numérico o nombre, ej. 4, diamante, wooden_pickaxe)",
	"/time set <day|noon|night|midnight|ms> — fija la hora del mundo (0-239999 ms)",
	"/gamemode <creative|survival> — cambia el modo de juego (creative: sin hambre ni daño)",
	"/reload — recarga recetas (recetas.json, recetas_horno.json) y el atlas del cliente"
].join("\n");

function systemMessage(player, text) {
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(
			JSON.stringify({ event: "chat", data: { id: "Server", message: text } })
		);
	}
}

// Reloj del mundo: (tiempo real + offset) % ciclo. El offset lo ajusta
// /time set; el resto del servidor usa esta misma función (net.js) para
// que día/noche, ambiente y IA de mobs sigan al reloj ajustado.
function worldTime(state) {
	return (Date.now() + (state.timeOffset || 0)) % DAY_CYCLE_MS;
}

function parseId(tok) {
	if (/^\d+$/.test(tok)) return ALL_IDS.has(Number(tok)) ? Number(tok) : null;
	return NAME_TO_ID[tok.toLowerCase().replace(/[\s-]+/g, "_")] ?? null;
}

// Devuelve true si `raw` era un comando (se procesó) y false si es chat
// normal. ctx = { state, world, broadcast, playerHelpers, viewDistance }.
function executeCommand(player, raw, ctx) {
	if (typeof raw !== "string" || !raw.startsWith("/")) return false;
	const { state, world, broadcast, playerHelpers } = ctx;
	const viewDistance = ctx.viewDistance || 6;
	const parts = raw.slice(1).trim().split(/\s+/);
	const cmd = parts[0].toLowerCase();
	const args = parts.slice(1);

	switch (cmd) {
		case "help":
			systemMessage(player, HELP);
			break;

		case "tp": {
			if (args.length < 3 || args.some((a) => !/^-?\d+(\.\d+)?$/.test(a))) {
				systemMessage(player, "Uso: /tp <x> <y> <z>");
				break;
			}
			const tx = parseFloat(args[0]),
				ty = parseFloat(args[1]),
				tz = parseFloat(args[2]);
			const fx = Math.floor(tx),
				fz = Math.floor(tz);
			// Cargar el chunk destino ANTES de validar, para no teletransportar a
			// un punto dentro de un sólido (getBlock devuelve aire en chunk no generado).
			world.ensureChunksAround(fx, fz, 1);
			const ground = world.getHeight(fx, fz) + 1; // superficie (top del bloque sólido)
			let y = ty;
			const feet = world.getBlock(fx, Math.floor(y), fz);
			const head = world.getBlock(fx, Math.floor(y + 1.5), fz);
			if (feet !== B.AIR || head !== B.AIR || y < 1) y = ground; // sólido/agua/void → superficie
			// En un lago, getHeight no conoce el nivel del agua: subir hasta salir
			// de ella para que el jugador nunca aparezca nadando (como findSpawn).
			while (
				world.getBlock(fx, Math.floor(y), fz) === B.WATER &&
				y < WORLD_HEIGHT - 1
			)
				y++;
			player.x = tx;
			player.y = y;
			player.z = tz;
			player.lastMoveTime = Date.now();
			// Enviar los chunks del nuevo área al teletransportado (como el init) y
			// avisar al resto de jugadores del salto.
			const fresh = world.ensureChunksAround(tx, tz, viewDistance);
			if (fresh.length) {
				const extra = {};
				for (const key of fresh) extra[key] = Array.from(state.chunks.get(key));
				player.ws.send(
					JSON.stringify({ event: "chunks_add", data: { chunkData: extra } })
				);
			}
			player.ws.send(
				JSON.stringify({
					event: "teleport",
					data: { x: player.x, y: player.y, z: player.z }
				})
			);
			broadcast(
				"player_move",
				{
					id: player.id,
					x: player.x,
					y: player.y,
					z: player.z,
					yaw: player.yaw,
					pitch: player.pitch
				},
				player.id
			);
			systemMessage(
				player,
				`Teletransportado a ${tx.toFixed(1)}, ${y.toFixed(1)}, ${tz.toFixed(1)}`
			);
			break;
		}

		case "give": {
			if (args.length < 1) {
				systemMessage(player, "Uso: /give <item> [cantidad]");
				break;
			}
			const id = parseId(args[0]);
			if (id == null) {
				systemMessage(
					player,
					`Item desconocido: ${args[0]} (usa un ID numérico o un nombre, ej. 4, diamante, wooden_pickaxe)`
				);
				break;
			}
			// No se pueden obtener bloques no removibles (bedrock, agua): colocarlos
			// dejaría estado permanente/ingriefable en el mundo de todos.
			if (NOT_MINEABLE.has(id)) {
				systemMessage(
					player,
					`No puedes obtener ${args[0]}: es un bloque no rompible (bedrock o agua)`
				);
				break;
			}
			const count = Math.max(1, Math.min(999, parseInt(args[1], 10) || 1));
			if (!playerHelpers.addToInventory(player, id, count)) {
				systemMessage(player, "Inventario lleno");
				break;
			}
			playerHelpers.sendInventory(player);
			systemMessage(
				player,
				`+${isTool(id) ? 1 : count} × ${args[0]} (ID ${id})`
			);
			break;
		}

		case "time": {
			const sub = (args[0] || "").toLowerCase();
			const targets = {
				day: 0,
				noon: DAY_CYCLE_MS / 4,
				night: DAY_CYCLE_MS / 2,
				midnight: (DAY_CYCLE_MS * 3) / 4
			};
			let target;
			if (sub === "set") {
				const val = (args[1] || "").toLowerCase();
				if (val in targets) target = targets[val];
				else if (/^\d+$/.test(val))
					target = Math.min(DAY_CYCLE_MS - 1, Number(val));
			}
			if (target === undefined) {
				systemMessage(
					player,
					"Uso: /time set <day|noon|night|midnight|ms 0-239999>"
				);
				break;
			}
			state.timeOffset =
				(target - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
			const t = worldTime(state);
			broadcast("time_set", { dayTime: t }); // todos los clientes re-sincronizan el ciclo visual
			systemMessage(
				player,
				`Hora fijada a ${Math.round(t)} ms del ciclo (${t >= DAY_CYCLE_MS / 2 ? "noche" : "día"})`
			);
			break;
		}

		case "gamemode": {
			const mode = (args[0] || "").toLowerCase();
			if (mode === "creative" || mode === "1") player.gamemode = "creative";
			else if (mode === "survival" || mode === "0")
				player.gamemode = "survival";
			else {
				systemMessage(player, "Uso: /gamemode <creative|survival>");
				break;
			}
			systemMessage(
				player,
				`Modo de juego: ${player.gamemode} (${player.gamemode === "creative" ? "sin hambre ni daño" : "supervivencia"})`
			);
			break;
		}

		case "reload": {
			// Fase 6: hot-reload sin reiniciar el servidor. Recarga recetas desde
			// disco (swap atómico: si el archivo es inválido se mantienen las
			// anteriores) y pide a todos los clientes regenerar el atlas.
			if (!ctx.crafting) {
				systemMessage(player, "Reload no disponible en este contexto");
				break;
			}
			const r = ctx.crafting.reloadRecipes();
			if (r.ok) {
				broadcast("textures_reload", {});
				systemMessage(
					player,
					`♻️ Recetas recargadas (${r.crafting} crafteo, ${r.furnace} horno) y atlas solicitado`
				);
			} else {
				systemMessage(
					player,
					`⚠️ Recetas NO recargadas: ${r.error} (se mantienen las anteriores)`
				);
			}
			break;
		}

		default:
			systemMessage(
				player,
				`Comando desconocido: /${cmd}. Escribe /help para ver los disponibles.`
			);
	}
	return true;
}

module.exports = { executeCommand, worldTime };
