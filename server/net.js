"use strict";

// ============================================================
// RED: HTTP + WebSocket, handler de conexión y bucle principal
// ============================================================
const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const constants = require("./constants.js");
const {
	PORT,
	TICK_MS,
	VIEW_DISTANCE_CHUNKS,
	DAY_CYCLE_MS,
	SEED,
	B,
	NOT_MINEABLE,
	FUEL_ITEMS,
	isSolidBlock,
	isTool,
	isArmor,
	ARMOR_SLOTS,
	ARMOR_DURABILITY,
	SWORD_DAMAGE,
	MOB_XP
} = constants;
const state = require("./state.js");
const world = require("./world.js");
const save = require("./save.js");
const playerHelpers = require("./players.js");
const crafting = require("./crafting.js");
const chests = require("./chests.js");
const mobs = require("./mobs.js");
const commands = require("./commands.js");
const mining = require("./mining.js");

// Reloj del mundo ajustable (/time set): el día/noche, el ambiente y la IA
// de mobs siguen al mismo reloj (worldTime), así que el comando afecta a todo.
const worldTime = () => commands.worldTime(state);

function broadcast(event, data, exceptId = null) {
	const msg = JSON.stringify({ event, data });
	for (const p of state.players.values()) {
		if (p.id === exceptId) continue;
		if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
	}
}

// Estado inicial completo para un jugador (init). Se reenvía tras un cambio
// de semilla (set_seed) para que el cliente reciba el mundo del seed elegido.
// data.seed permite al cliente confirmar que ya tiene el mundo pedido.
function sendInit(p) {
	const chunkData = {};
	for (const [key, data] of state.chunks) chunkData[key] = Array.from(data);
	p.ws.send(
		JSON.stringify({
			event: "init",
			data: {
				playerId: p.id,
				name: p.name,
				chunkData,
				spawnX: p.x,
				spawnY: p.y,
				spawnZ: p.z,
				dayTime: worldTime(), // reloj del servidor: el cliente extrapola el ciclo visual
				mobs: state.mobs.filter((m) => m.alive).map(mobs.mobSnapshot),
				inventory: p.inventory,
				armor: p.armor, // Fase 7: 4 slots (casco, pechera, pantalones, botas)
				health: p.health,
				maxHealth: p.maxHealth,
				xp: p.xp,
				level: p.level, // Fase 5
				food: p.food,
				saturation: p.saturation,
				seed: constants.worldPaths.currentSeed, // Fase 6: semilla activa del mundo
				otherPlayers: Array.from(state.players.values())
					.filter((q) => q.id !== p.id)
					.map((q) => ({ id: q.id, name: q.name, x: q.x, y: q.y, z: q.z }))
			}
		})
	);
}

const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));

// Envía un evento a un jugador concreto (usado por la minería y los tests).
function sendToClient(player, event, data) {
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(JSON.stringify({ event, data }));
	}
}

// ============================================================
// NOMBRE DE JUGADOR (Fase 7)
// El servidor es la fuente de verdad del nombre: se recibe con `?name=` en
// la URL del WebSocket (el cliente lo lee de localStorage antes de conectar)
// o con el evento `set_name`. Se sanea: sin caracteres de control, recortado
// y con máximo de 16 caracteres. Nombre por defecto: "Jugador-XXXX".
// ============================================================
function sanitizeName(raw) {
	if (typeof raw !== "string") return null;
	const name = raw
		.replace(/[\u0000-\u001f\u007f]/g, "")
		.trim()
		.slice(0, 16);
	return name || null;
}

function nameFromRequest(req) {
	try {
		const u = new URL(req.url, "http://localhost");
		return sanitizeName(u.searchParams.get("name"));
	} catch {
		return null;
	}
}

function handleConnection(ws, req) {
	const playerId = uuidv4();
	// Spawn sobre tierra firme: si (0,0) es un lago, findSpawn busca la columna
	// firme más cercana para que el jugador no aparezca nadando (Fase 4).
	const spawn = world.findSpawn(0, 0);
	const spawnX = spawn.x,
		spawnY = spawn.y,
		spawnZ = spawn.z;
	const generated = world.ensureChunksAround(
		spawnX,
		spawnZ,
		VIEW_DISTANCE_CHUNKS
	);
	const player = {
		id: playerId,
		ws,
		name: nameFromRequest(req) || `Jugador-${playerId.slice(0, 4)}`, // Fase 7: nombre visible
		x: spawnX,
		y: spawnY,
		z: spawnZ,
		yaw: 0,
		pitch: 0,
		health: 20,
		maxHealth: 20,
		xp: 0,
		level: 0, // Fase 5: experiencia simple / niveles
		food: 20,
		saturation: 20,
		foodAccum: 0,
		regenAccum: 0,
		starveAccum: 0,
		lastMoveTime: 0,
		renderDistance: VIEW_DISTANCE_CHUNKS, // Fase 7: ajustable por el cliente (settings)
		inventory: new Array(36).fill(null),
		selectedSlot: 0,
		craftingGrid: new Array(9).fill(null),
		openFurnace: null,
		openChest: null, // Fase 6: cofre abierto ("x,y,z"), para mover items entre él y el inventario
		mining: null, // Fase 6: sesión de minería activa (progreso en el bucle principal)
		// Fase 7: armadura equipada (4 slots; cada pieza con su durabilidad) y
		// punto de reaparición fijado al dormir en una cama (no se persisten: el
		// estado del jugador se reinicia al reconectar, como el inventario).
		armor: { helmet: null, chestplate: null, leggings: null, boots: null },
		respawnPoint: null
	};
	state.players.set(playerId, player);
	console.log(
		`🟢 Jugador conectado: ${player.name} (${state.players.size} en línea)`
	);

	sendInit(player);

	broadcast(
		"player_join",
		{ id: playerId, name: player.name, x: spawnX, y: spawnY, z: spawnZ },
		playerId
	);

	ws.on("message", (raw) => {
		let msg;
		try {
			msg = JSON.parse(raw);
		} catch {
			return;
		}
		const { event, data } = msg;
		const p = state.players.get(playerId);
		if (!p) return;

		switch (event) {
			case "move": {
				const { x, y, z, yaw, pitch } = data;
				if (
					typeof x !== "number" ||
					typeof y !== "number" ||
					typeof z !== "number"
				)
					return;
				const dist = Math.hypot(x - p.x, y - p.y, z - p.z);
				if (dist > 1.2) {
					// límite anti-cheat de velocidad
					ws.send(
						JSON.stringify({
							event: "teleport",
							data: { x: p.x, y: p.y, z: p.z }
						})
					);
					return;
				}
				// El agua no es sólida: nadar (estar dentro de un bloque de agua) es
				// legítimo. Solo se rechaza si el jugador está dentro de un sólido.
				const feet = world.getBlock(
					Math.floor(x),
					Math.floor(y),
					Math.floor(z)
				);
				const head = world.getBlock(
					Math.floor(x),
					Math.floor(y + 1.5),
					Math.floor(z)
				);
				if (isSolidBlock(feet) || isSolidBlock(head)) {
					ws.send(
						JSON.stringify({
							event: "teleport",
							data: { x: p.x, y: p.y, z: p.z }
						})
					);
					return;
				}
				p.x = x;
				p.y = y;
				p.z = z;
				p.yaw = yaw || 0;
				p.pitch = pitch || 0;
				p.lastMoveTime = Date.now();
				// Generar chunks nuevos bajo demanda al moverse
				const newChunks = world.ensureChunksAround(x, z, 2);
				if (newChunks.length) {
					const extra = {};
					for (const key of newChunks)
						extra[key] = Array.from(state.chunks.get(key));
					ws.send(
						JSON.stringify({ event: "chunks_add", data: { chunkData: extra } })
					);
				}
				broadcast(
					"player_move",
					{ id: playerId, name: p.name, x, y, z, yaw: p.yaw, pitch: p.pitch },
					playerId
				);
				break;
			}

			case "set_name": {
				// Fase 7: cambiar el nombre visible (desde el menú/ajustes). Se sanea y
				// se propaga a todos los clientes con player_rename (tags flotantes).
				const name = sanitizeName(data && data.name);
				if (!name) break;
				p.name = name;
				broadcast("player_rename", { id: playerId, name });
				break;
			}

			case "settings": {
				// Fase 7: ajustes que afectan al servidor. Por ahora solo la distancia
				// de render (2..10 chunks): al ampliarla se generan los chunks nuevos
				// y se reenvían TAMBIÉN los ya generados del radio (si antes se bajó,
				// el cliente descartó los lejanos y los necesita de nuevo). El cliente
				// decide qué construir/ocultar.
				const rd = data && data.renderDistance;
				if (typeof rd === "number" && Number.isFinite(rd)) {
					const clamped = Math.min(10, Math.max(2, Math.round(rd)));
					if (clamped !== p.renderDistance) {
						p.renderDistance = clamped;
						const fresh = world.ensureChunksAround(p.x, p.z, p.renderDistance);
						const extra = {};
						for (const key of fresh)
							extra[key] = Array.from(state.chunks.get(key));
						const pcx = Math.floor(p.x / constants.CHUNK_SIZE),
							pcz = Math.floor(p.z / constants.CHUNK_SIZE);
						for (let x = pcx - clamped; x <= pcx + clamped; x++) {
							for (let z = pcz - clamped; z <= pcz + clamped; z++) {
								const key = `${x},${z}`;
								if (state.chunks.has(key) && !extra[key])
									extra[key] = Array.from(state.chunks.get(key));
							}
						}
						if (Object.keys(extra).length) {
							ws.send(
								JSON.stringify({
									event: "chunks_add",
									data: { chunkData: extra }
								})
							);
						}
					}
				}
				break;
			}

			case "block_action": {
				const { action, x, y, z, itemId } = data;
				if (Math.hypot(x - p.x, y - p.y, z - p.z) > 7) return;
				if (action === "break") {
					const block = world.getBlock(x, y, z);
					if (NOT_MINEABLE.has(block)) return;
					// Creative (/gamemode creative): minería INSTANTÁNEA como en
					// Minecraft — el bloque se rompe al momento, sin sesión de
					// progreso ni grietas, y sin desgaste de herramienta ni drops
					// (finishMining con opts.creative). Se cancela cualquier sesión
					// previa para que el cliente oculte sus grietas.
					if (p.gamemode === "creative") {
						mining.cancelMining(p, sendToClient);
						playerHelpers.finishMining(p, x, y, z, block, { creative: true });
						return;
					}
					// Fase 6 (minería fina): iniciar/continuar la sesión de rotura. El
					// bloque NO se rompe al instante: el progreso avanza en el bucle
					// principal (dureza del bloque / velocidad de la herramienta) y al
					// completarse se rompe con drop condicional. Repetir break sobre el
					// mismo bloque continúa la mina (no reinicia el progreso).
					if (
						p.mining &&
						p.mining.x === x &&
						p.mining.y === y &&
						p.mining.z === z
					)
						return;
					mining.startMining(p, x, y, z, block);
				} else if (action === "break_cancel") {
					mining.cancelMining(p, sendToClient);
				} else if (action === "place") {
					if (world.getBlock(x, y, z) !== B.AIR) return;
					const slot = p.inventory[p.selectedSlot];
					if (!slot || slot.id !== itemId || slot.count < 1) return;
					// Antorchas: necesitan un bloque sólido adyacente (soporte), como en
					// Minecraft — no se pueden colocar flotando en el aire. El agua y
					// otra antorcha no dan soporte (isSolidBlock las excluye).
					if (itemId === B.TORCH && !world.torchSupported(x, y, z)) return;
					world.setBlock(x, y, z, itemId);
					playerHelpers.removeFromInventory(p, itemId, 1);
					playerHelpers.sendInventory(p);
				}
				break;
			}

			case "craft": {
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
					playerHelpers.addToInventory(
						p,
						recipe.result.id,
						recipe.result.count || 1
					);
					playerHelpers.sendInventory(p);
				}
				ws.send(
					JSON.stringify({
						event: "crafting_grid_update",
						data: { grid: p.craftingGrid, success: !!recipe }
					})
				);
				break;
			}

			case "grid_set": {
				// El cliente pide mover un item del inventario a una celda de crafteo
				const { fromInventorySlot, toGridSlot } = data;
				const item = p.inventory[fromInventorySlot];
				if (!item || toGridSlot < 0 || toGridSlot > 8) return;
				if (p.craftingGrid[toGridSlot]) return; // celda ocupada
				// Conservar la durabilidad al pasar una herramienta por la mesa
				// (evita "repararla" gratis y, por tanto, duplicar usos)
				p.craftingGrid[toGridSlot] = {
					id: item.id,
					count: 1,
					durability: item.durability
				};
				item.count -= 1;
				if (item.count <= 0) p.inventory[fromInventorySlot] = null;
				playerHelpers.sendInventory(p);
				ws.send(
					JSON.stringify({
						event: "crafting_grid_update",
						data: { grid: p.craftingGrid, success: false }
					})
				);
				break;
			}

			case "grid_clear": {
				for (let i = 0; i < 9; i++) {
					const cell = p.craftingGrid[i];
					if (cell)
						playerHelpers.addToInventory(
							p,
							cell.id,
							cell.count,
							cell.durability
						);
				}
				p.craftingGrid.fill(null);
				playerHelpers.sendInventory(p);
				ws.send(
					JSON.stringify({
						event: "crafting_grid_update",
						data: { grid: p.craftingGrid, success: false }
					})
				);
				break;
			}

			case "furnace_open": {
				const key = `${data.x},${data.y},${data.z}`;
				if (world.getBlock(data.x, data.y, data.z) !== B.FURNACE) return;
				p.openFurnace = key;
				const f = crafting.getOrCreateFurnace(key);
				ws.send(
					JSON.stringify({
						event: "furnace_state",
						data: { key, ...crafting.furnaceSnapshot(f) }
					})
				);
				break;
			}

			case "chest_open": {
				// Fase 6: abrir un cofre — valida distancia y que el bloque sea
				// realmente un cofre (fuente de verdad del servidor).
				const key = `${data.x},${data.y},${data.z}`;
				if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) return;
				if (world.getBlock(data.x, data.y, data.z) !== B.CHEST) return;
				p.openChest = key;
				const c = chests.getOrCreateChest(key);
				ws.send(
					JSON.stringify({
						event: "chest_state",
						data: { key, slots: chests.chestSnapshot(c) }
					})
				);
				break;
			}

			case "chest_action": {
				// Mover items entre el cofre abierto y el inventario del jugador:
				//   put   — del slot del inventario (invSlot) al cofre (apila o 1er hueco)
				//   take  — del slot del cofre (chestSlot) al inventario (apila)
				//   close — cerrar
				if (!p.openChest) return;
				const key = p.openChest; // capturar antes de que 'close' lo anule
				// Revalidar distancia (como chest_open): en Minecraft hay que seguir
				// cerca del cofre para usarlo (defensivo contra alejarse y operar).
				const [bx, by, bz] = key.split(",").map(Number);
				if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
				const c = chests.getOrCreateChest(key);
				if (data.action === "put") {
					const invSlot = data.invSlot;
					const item = p.inventory[invSlot];
					if (!item) return;
					// Herramientas NUNCA se apilan (cada una con su durabilidad propia):
					// apilarlas por id fusionaría dos picos con durabilidades distintas
					// en un slot y el take (addToInventory fuerza count 1) perdería uno.
					let target = isTool(item.id)
						? -1
						: c.findIndex((s) => s && s.id === item.id);
					if (target === -1) target = c.findIndex((s) => !s);
					if (target === -1) return; // cofre lleno
					if (c[target]) c[target].count += item.count;
					else
						c[target] = {
							id: item.id,
							count: item.count,
							durability: item.durability
						};
					p.inventory[invSlot] = null;
					playerHelpers.sendInventory(p);
				} else if (data.action === "take") {
					const chestSlot = data.chestSlot;
					const item = c[chestSlot];
					if (!item) return;
					if (
						!playerHelpers.addToInventory(
							p,
							item.id,
							item.count,
							item.durability
						)
					)
						return; // inventario lleno
					c[chestSlot] = null;
					playerHelpers.sendInventory(p);
				} else if (data.action === "close") {
					p.openChest = null;
				}
				ws.send(
					JSON.stringify({
						event: "chest_state",
						data: { key, slots: chests.chestSnapshot(c) }
					})
				);
				break;
			}

			case "furnace_action": {
				if (!p.openFurnace) return;
				const key = p.openFurnace; // capturar antes de que 'close' lo anule
				const f = crafting.getOrCreateFurnace(key);
				if (data.action === "add_fuel") {
					const slot = p.inventory[data.invSlot];
					if (
						slot &&
						FUEL_ITEMS.has(slot.id) &&
						(!f.fuelItem || f.fuelItem === slot.id)
					) {
						f.fuelItem = slot.id;
						slot.count -= 1;
						if (slot.count <= 0) p.inventory[data.invSlot] = null;
						playerHelpers.sendInventory(p);
					}
				} else if (data.action === "add_input") {
					const slot = p.inventory[data.invSlot];
					if (
						slot &&
						crafting.isCookable(slot.id) &&
						(!f.inputItem || f.inputItem.id === slot.id)
					) {
						f.inputItem = f.inputItem
							? { id: slot.id, count: f.inputItem.count + slot.count }
							: { id: slot.id, count: slot.count };
						p.inventory[data.invSlot] = null;
						playerHelpers.sendInventory(p);
					}
				} else if (data.action === "collect_output") {
					if (f.outputItem && f.outputCount > 0) {
						if (playerHelpers.addToInventory(p, f.outputItem, f.outputCount)) {
							f.outputItem = null;
							f.outputCount = 0;
							playerHelpers.sendInventory(p);
						}
					}
				} else if (data.action === "close") {
					p.openFurnace = null;
				}
				ws.send(
					JSON.stringify({
						event: "furnace_state",
						data: { key, ...crafting.furnaceSnapshot(f) }
					})
				);
				break;
			}

			case "worlds_list": {
				// Fase 7: el menú de mundos pide la lista de mundos guardados. El
				// servidor responde al MISMO socket (no broadcast): es info de menú.
				ws.send(
					JSON.stringify({
						event: "worlds_list",
						data: { worlds: save.listWorlds() }
					})
				);
				break;
			}

			case "set_seed": {
				// Fase 6: campo de semilla del menú del cliente. El servidor es la
				// fuente de verdad: cambia el mundo activo (persistiendo el actual) y
				// reenvía el init con el mundo de la semilla pedida. Servidor dedicado:
				// solo se cambia si este jugador es el ÚNICO en línea (los demás verían
				// el mundo cambiar bajo sus pies).
				if (typeof data.seed !== "string" || !data.seed.trim()) break;
				if (state.players.size > 1) {
					p.ws.send(
						JSON.stringify({
							event: "seed_rejected",
							data: { reason: "others" }
						})
					);
					break;
				}
				const seed = data.seed.trim();
				const r = save.switchWorld(seed);
				if (r === "rechazo" || r === "error") {
					p.ws.send(
						JSON.stringify({ event: "seed_rejected", data: { reason: r } })
					);
					break;
				}
				if (r === true) {
					// Mundo (realmente) nuevo: el jugador empieza de cero — spawn, salud,
					// comida, XP e inventario. El inventario no viaja entre mundos.
					const spawn = world.findSpawn(0, 0);
					p.x = spawn.x;
					p.y = spawn.y;
					p.z = spawn.z;
					p.health = 20;
					p.maxHealth = 20;
					p.xp = 0;
					p.level = 0;
					p.food = 20;
					p.saturation = 20;
					p.inventory = new Array(36).fill(null);
					p.craftingGrid = new Array(9).fill(null);
					p.openFurnace = null;
					p.openChest = null;
					world.ensureChunksAround(p.x, p.z, p.renderDistance);
				}
				sendInit(p); // confirmación: el cliente la usa para cerrar la carga
				break;
			}

			case "inventory_select": {
				if (typeof data.slot === "number" && data.slot >= 0 && data.slot < 9)
					p.selectedSlot = data.slot;
				break;
			}

			case "equip_armor": {
				// Fase 7: equipar una pieza de armadura desde el inventario (clic
				// derecho con la pieza en mano). Se intercambia con la pieza ya
				// equipada (vuelve al inventario, conservando su durabilidad).
				const slotIdx = data.inventorySlot;
				const item = p.inventory[slotIdx];
				if (!item || !isArmor(item.id)) return;
				const slotName = ARMOR_SLOTS[(item.id - 220) % 4];
				const prev = p.armor[slotName];
				// Devolver la pieza actual al MISMO slot si el hueco se queda libre;
				// si no había pieza, el slot del inventario queda vacío.
				p.inventory[slotIdx] = prev
					? { id: prev.id, count: 1, durability: prev.durability }
					: null;
				p.armor[slotName] = {
					id: item.id,
					count: 1,
					durability: item.durability ?? ARMOR_DURABILITY[item.id]
				};
				playerHelpers.sendInventory(p);
				break;
			}

			case "unequip_armor": {
				// Fase 7: quitar una pieza del slot de armadura (clic en el panel
				// de inventario): vuelve al inventario conservando su durabilidad.
				const slotName = data.slot;
				if (!ARMOR_SLOTS.includes(slotName)) return;
				const piece = p.armor[slotName];
				if (!piece) return;
				if (!playerHelpers.addToInventory(p, piece.id, 1, piece.durability))
					return; // inventario lleno: no se pierde la pieza
				p.armor[slotName] = null;
				playerHelpers.sendInventory(p);
				break;
			}

			case "sleep": {
				// Fase 7: dormir en una cama de noche — salta al amanecer y fija el
				// punto de reaparición en la cama (respawnPoint, usado por
				// players.damagePlayer al morir). De día se rechaza (como Minecraft).
				const bx = data.x,
					by = data.y,
					bz = data.z;
				if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
				if (world.getBlock(bx, by, bz) !== B.BED) return;
				if (worldTime() < DAY_CYCLE_MS / 2) {
					p.ws.send(
						JSON.stringify({
							event: "sleep_rejected",
							data: { reason: "day" }
						})
					);
					break;
				}
				// Saltar al amanecer: mismo mecanismo que /time set day (el reloj
				// del mundo sigue a state.timeOffset; todos los clientes re-sincronizan).
				state.timeOffset =
					(0 - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
				broadcast("time_set", { dayTime: worldTime() });
				// Punto de reaparición: las coordenadas del BLOQUE de la cama (los
				// offsets se aplican al reaparecer en players.damagePlayer; guardarlos
				// ya desplazados rompería la limpieza al romper la cama).
				p.respawnPoint = { x: bx, y: by, z: bz };
				p.ws.send(
					JSON.stringify({
						event: "sleep_ok",
						data: { x: bx, y: by, z: bz }
					})
				);
				break;
			}

			case "eat": {
				// Comer el ítem seleccionado: valida que sea comida y aplica hambre+saturación
				const held = p.inventory[p.selectedSlot];
				if (!held) return;
				const verdict = playerHelpers.canEat(p, held.id);
				if (verdict === "full") {
					// Estilo Minecraft: avisar cuando no hay hambre ni saturación por recuperar
					p.ws.send(JSON.stringify({ event: "eat_rejected", data: {} }));
					return;
				}
				if (verdict !== "ok") return; // no es comida (no debería pasar vía UI)
				playerHelpers.eatFood(p, held.id);
				held.count -= 1;
				if (held.count <= 0) p.inventory[p.selectedSlot] = null;
				playerHelpers.sendInventory(p);
				break;
			}

			case "feed_mob": {
				// Alimentar a un animal con su comida de cría: modo amor → pareja → bebé
				const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
				if (!mob) return;
				if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
				const held = p.inventory[p.selectedSlot];
				if (!held) return;
				if (mobs.canFeed(mob, held.id) !== "ok") return;
				held.count -= 1;
				if (held.count <= 0) p.inventory[p.selectedSlot] = null;
				playerHelpers.sendInventory(p);
				const baby = mobs.applyFeed(mob, state.mobs);
				if (baby) broadcast("mob_breed", { x: baby.x, y: baby.y, z: baby.z });
				break;
			}

			case "chat": {
				if (typeof data.message !== "string") break;
				// Fase 6: los mensajes que empiezan por '/' son comandos de la consola
				// (fuente de verdad del servidor); el resto es chat normal.
				if (data.message.startsWith("/")) {
					commands.executeCommand(p, data.message, {
						state,
						world,
						broadcast,
						playerHelpers,
						crafting,
						viewDistance: p.renderDistance
					});
					break;
				}
				broadcast("chat", { id: p.name, message: data.message.slice(0, 200) });
				break;
			}

			case "attack_mob": {
				const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
				if (!mob) return;
				if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
				const tool = p.inventory[p.selectedSlot]
					? p.inventory[p.selectedSlot].id
					: 0;
				// Fase 5: daño de espada por material (sin espada, 2)
				const dmg = SWORD_DAMAGE[tool] || 2;
				mob.health -= dmg;
				// Fase 5: las espadas se desgastan al golpear (se rompen al llegar a 0)
				const broke = playerHelpers.applyToolWear(p, true);
				const isSword = !!SWORD_DAMAGE[tool];
				if (mob.health <= 0) {
					mob.alive = false;
					broadcast("mob_death", { id: mob.id });
					// Drops de comida de animales al morir (directo al atacante)
					const drops = mobs.mobDrops(mob);
					if (drops)
						for (const d of drops)
							playerHelpers.addToInventory(p, d.id, d.count);
					// Fase 5: XP por matar mobs
					playerHelpers.addXp(p, MOB_XP[mob.type] || 0);
					playerHelpers.sendInventory(p);
				} else if (isSword) {
					// Cada golpe de espada desgasta aunque el mob sobreviva:
					// sincronizar la durabilidad del HUD
					playerHelpers.sendInventory(p);
				}
				if (broke) {
					p.ws.send(
						JSON.stringify({
							event: "tool_broke",
							data: { slot: p.selectedSlot }
						})
					);
				}
				break;
			}
		}
	});

	ws.on("close", () => {
		const leaver = state.players.get(playerId);
		state.players.delete(playerId);
		console.log(
			`🔴 Jugador desconectado: ${leaver ? leaver.name : playerId} (${state.players.size} en línea)`
		);
		broadcast("player_leave", { id: playerId });
	});

	ws.on("error", () => {});
}

// ============================================================
// BUCLE PRINCIPAL
// ============================================================
function mainLoop() {
	const isNight = worldTime() > DAY_CYCLE_MS / 2;
	for (const m of state.mobs) if (m.alive) m.tick(isNight);
	state.mobs = state.mobs.filter((m) => m.alive);
	broadcast("mobs_update", state.mobs.map(mobs.mobSnapshot));

	// Hambre: decae con el tiempo/actividad, regenera o inanición
	// (en modo creative no se aplica: /gamemode creative)
	for (const p of state.players.values()) {
		if (p.gamemode !== "creative") playerHelpers.tickPlayer(p, TICK_MS);
	}

	// Minería (Fase 6): avanza las sesiones de rotura (dureza/velocidad); al
	// completarse se rompe el bloque (drop condicional, XP, desgaste).
	for (const p of state.players.values()) {
		if (p.mining)
			mining.tickMining(p, TICK_MS, world, playerHelpers, sendToClient);
	}

	// Spawn de mobs por fase del día (Fase 6): de día solo pasivos, de noche
	// también hostiles, en cualquier chunk cargado del área de render.
	if (Math.random() < 0.03) mobs.spawnMobs(isNight);

	crafting.tickFurnaces();
	for (const [key, f] of state.furnaces) {
		// Notificar a quien tenga ese horno abierto
		for (const p of state.players.values()) {
			if (p.openFurnace === key && p.ws.readyState === WebSocket.OPEN) {
				p.ws.send(
					JSON.stringify({
						event: "furnace_state",
						data: { key, ...crafting.furnaceSnapshot(f) }
					})
				);
			}
		}
	}
}

function start() {
	const server = http.createServer(app);
	const wss = new WebSocket.Server({ server });
	wss.on("connection", handleConnection);

	setInterval(mainLoop, TICK_MS);

	server.listen(PORT, () => {
		console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
		console.log(
			`🌍 Semilla: ${SEED}  |  📦 Chunks: ${state.chunks.size}  |  🧟 Mobs: ${state.mobs.length}`
		);
	});
}

// handleConnection se exporta para tests unitarios (tests/unit-red.js usa un
// ws fake para ejercitar todos los handlers sin levantar el servidor real).
module.exports = { broadcast, handleConnection, start };
