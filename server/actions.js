"use strict";

// ============================================================
// ACCIONES DE JUEGO (Fase 18, D-1): handlers del switch de net.js
// ============================================================
// Cada handler del switch de `handleConnection` que NO sea conexión/menú/
// init vive aquí, con la misma firma: (p, ws, data, playerId). net.js queda
// con el switch delgado (cada case llama a actions.handleX) y las funciones
// de red (broadcast, validCoords, worldTime) se inyectan aquí al cargar
// (patrón timers.js: setBroadcastFn/setValidCoordsFn/setWorldTimeFn), lo que
// evita el ciclo net→actions→net sin cambiar el comportamiento del wire.
//
// Módulo HOJA: requiere state/world/crafting/chests/mobs/players/... (ninguno
// de ellos requiere net.js), así que no hay ciclos de require.
// ============================================================
const constants = require("./constants.js");
const {
	B,
	I,
	FUEL_ITEMS,
	isTool,
	isArmor,
	isBed,
	ARMOR_SLOTS,
	ARMOR_DURABILITY,
	SWORD_DAMAGE,
	TOOL_DAMAGE,
	DAY_CYCLE_MS,
	isNightTime // C-1: noche estricta (fase ≥ duskEnd) — dormir
} = constants;
const state = require("./state.js");
const world = require("./world.js");
const playerHelpers = require("./players.js");
const { ItemStack } = require("./items.js"); // Fase 13 (C3): slots como clase
const crafting = require("./crafting.js");
const chests = require("./chests.js");
const mobs = require("./mobs.js");
const commands = require("./commands.js");
const fishing = require("./fishing.js"); // Fase 21.5 (A1): pesca
const { validCoords } = require("./anticheat.js");

// Reloj del mundo ajustable (/time set): mismo que net.js (commands.worldTime
// sobre el estado); se inyecta para no duplicar la definición.
let worldTime = () => 0;
function setWorldTimeFn(fn) {
	worldTime = fn;
}

// Broadcasts definidos en net.js (a todos / a los que ven el bloque).
let broadcast = () => {};
let _broadcastNear = () => {};
function setBroadcastFn(fn) {
	broadcast = fn;
}
function setBroadcastNearFn(fn) {
	_broadcastNear = fn;
}

// ============================================================
// CRAFTEO (3x3)
// ============================================================

// Auditoría 2026-08-09 (§1.2): la grid SIEMPRE es la del servidor
// (p.craftingGrid), que solo se llena vía grid_set/grid_clear — acciones que
// descuentan/repongan ítems del inventario real. Antes se aceptaba data.grid
// del wire directamente: un cliente podía reenviar la grid de cualquier
// receta cada frame y craftear ítems infinitos sin coste (duplicación de
// recursos en survival).
function handleCraft(p, ws, _data) {
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
	ws.send(
		JSON.stringify({
			event: "crafting_grid_update",
			data: { grid: p.craftingGrid, success: !!recipe }
		})
	);
}

// El cliente pide mover un item del inventario a una celda de crafteo.
// Auditoría 2026-08-15 (B1): `fromInventorySlot` se validaba con falsy (un
// índice no entero — p. ej. `"length"` — pasaba el guard y resolvía a
// `p.inventory["length"]` === 36, truthy → slot basura en la grid). Se exige
// entero en rango 0-35.
function handleGridSet(p, ws, data) {
	const { fromInventorySlot, toGridSlot } = data;
	if (
		!Number.isInteger(fromInventorySlot) ||
		fromInventorySlot < 0 ||
		fromInventorySlot > 35
	)
		return;
	const item = p.inventory[fromInventorySlot];
	if (!item || toGridSlot < 0 || toGridSlot > 8) return;
	if (p.craftingGrid[toGridSlot]) return; // celda ocupada
	// Conservar la durabilidad al pasar una herramienta por la mesa (evita
	// "repararla" gratis y, por tanto, duplicar usos). Fase 13 (C3): el slot
	// es un ItemStack (JSON idéntico al wire).
	p.craftingGrid[toGridSlot] = new ItemStack(item.id, 1, item.durability);
	item.count -= 1;
	if (item.count <= 0) p.inventory[fromInventorySlot] = null;
	playerHelpers.sendInventory(p);
	ws.send(
		JSON.stringify({
			event: "crafting_grid_update",
			data: { grid: p.craftingGrid, success: false }
		})
	);
}

function handleGridClear(p, ws) {
	for (let i = 0; i < 9; i++) {
		const cell = p.craftingGrid[i];
		if (cell)
			playerHelpers.addToInventory(p, cell.id, cell.count, cell.durability);
	}
	p.craftingGrid.fill(null);
	playerHelpers.sendInventory(p);
	ws.send(
		JSON.stringify({
			event: "crafting_grid_update",
			data: { grid: p.craftingGrid, success: false }
		})
	);
}

// Fase 19 (D1): devolver UNA celda del grid de crafteo al inventario (clic o
// drag & drop de la celda hacia el inventario). Complementa grid_clear (todas).
// Validación: índice entero 0-8; la celda vacía se ignora (idempotente).
function handleGridReturn(p, ws, data) {
	const { toGridSlot } = data;
	if (!Number.isInteger(toGridSlot) || toGridSlot < 0 || toGridSlot > 8) return;
	const cell = p.craftingGrid[toGridSlot];
	if (!cell) return;
	p.craftingGrid[toGridSlot] = null;
	playerHelpers.addToInventory(p, cell.id, cell.count, cell.durability);
	playerHelpers.sendInventory(p);
	ws.send(
		JSON.stringify({
			event: "crafting_grid_update",
			data: { grid: p.craftingGrid, success: false }
		})
	);
}

// Fase 19 (D1): intercambiar dos slots del inventario (drag & drop
// inventario→inventario). Validación de índices enteros 0-35 y from !== to
// (patrón F16 C2); sin validación extra: el servidor es la fuente de verdad
// y el swap no crea ni destruye ítems.
function handleInventorySwap(p, _ws, data) {
	const { from, to } = data;
	if (!Number.isInteger(from) || !Number.isInteger(to)) return;
	if (from < 0 || from > 35 || to < 0 || to > 35 || from === to) return;
	const tmp = p.inventory[from];
	p.inventory[from] = p.inventory[to];
	p.inventory[to] = tmp;
	playerHelpers.sendInventory(p);
}

// Libro de recetas: TODAS las recetas (crafteo + horno), sin desbloqueo
// progresivo (decisión F9). Se responde al MISMO socket (info de UI).
function handleRecipeBook(ws) {
	ws.send(
		JSON.stringify({
			event: "recipe_book",
			data: crafting.getRecipeTables()
		})
	);
}

// ============================================================
// HORNO
// ============================================================

// Fase 21.5 (C1): ¿la clave de horno "x,y,z" apunta a un horno de fundición?
function isBlastFurnaceBlock(key) {
	const [bx, by, bz] = key.split(",").map(Number);
	return world.getBlock(bx, by, bz) === B.BLAST_FURNACE;
}

function handleFurnaceOpen(p, ws, data, playerId) {
	if (!validCoords(data.x, data.y, data.z)) return; // C2 (SV-3/SEC-3)
	const key = `${data.x},${data.y},${data.z}`;
	// Fase 7 (auditoría): validar distancia como chest_open — antes un
	// jugador podía abrir/operar cualquier horno del mundo desde lejos.
	if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) return;
	// Fase 21.5 (C1): horno de fundición comparte la misma UI.
	const blk = world.getBlock(data.x, data.y, data.z);
	if (blk !== B.FURNACE && blk !== B.BLAST_FURNACE) return;
	// Fase 16 (C5/REN-2): registrar en el índice de watchers (en vez de
	// escanear O(H×J) por tick) y NO crear una entrada de horno para un horno
	// vacío — antes cada horno alguna vez abierto quedaba en memoria y en
	// world.json para siempre.
	const prevKey = p.openFurnace;
	p.openFurnace = key;
	if (prevKey && prevKey !== key) {
		const prevWatchers = state.openFurnaceWatchers.get(prevKey);
		if (prevWatchers) {
			prevWatchers.delete(playerId);
			if (prevWatchers.size === 0) state.openFurnaceWatchers.delete(prevKey);
		}
	}
	let watchers = state.openFurnaceWatchers.get(key);
	if (!watchers) {
		watchers = new Set();
		state.openFurnaceWatchers.set(key, watchers);
	}
	watchers.add(playerId);
	const f = crafting.getFurnace(key);
	ws.send(
		JSON.stringify({
			event: "furnace_state",
			data: { key, ...crafting.furnaceSnapshot(f || crafting.emptyFurnace()) }
		})
	);
}

function handleFurnaceAction(p, ws, data, playerId) {
	if (!p.openFurnace) return;
	const key = p.openFurnace; // capturar antes de que 'close' lo anule
	// Fase 7 (auditoría): revalidar distancia como chest_action — hay que
	// seguir cerca del horno para operarlo (como en Minecraft).
	const [bx, by, bz] = key.split(",").map(Number);
	if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
	const f = crafting.getOrCreateFurnace(key);
	if (data.action === "add_fuel") {
		const slot = p.inventory[data.invSlot];
		if (slot && FUEL_ITEMS.has(slot.id)) {
			if (!f.fuelItem || f.fuelItem === slot.id) {
				// Mismo combustible (o tanque vacío): se carga directo.
				f.fuelItem = slot.id;
				// Fase 16 (D1): registrar la unidad REAL cargada (fuelCount) —
				// sin esto el horno nunca arrancaba (canCook exige fuelCount > 0)
				// y el combustible añadido no se consumía nunca.
				f.fuelCount = (f.fuelCount || 0) + 1;
			} else {
				// Fase 18 (C-6): combustible DISTINTO con el tanque cargado → se
				// ENCOLA (FIFO) como en Minecraft; se quema en orden al agotarse
				// el actual. Antes se rechazaba el clic en silencio.
				f.fuelQueue = f.fuelQueue || [];
				const last = f.fuelQueue[f.fuelQueue.length - 1];
				if (last && last.id === slot.id) last.count++;
				else f.fuelQueue.push({ id: slot.id, count: 1 });
			}
			slot.count -= 1;
			if (slot.count <= 0) p.inventory[data.invSlot] = null;
			playerHelpers.sendInventory(p);
		}
	} else if (data.action === "add_input") {
		const slot = p.inventory[data.invSlot];
		if (
			slot &&
			crafting.isCookable(slot.id) &&
			// Fase 21.5 (C1): el horno de fundición solo acepta minerales
			// (isBlastCookable comprueba que el resultado es un lingote).
			(!isBlastFurnaceBlock(key) || crafting.isBlastCookable(slot.id)) &&
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
		// Fase 16 (C5/REN-2): dejar de mirar el horno — quita al jugador del
		// índice de watchers (el escaneo por tick ya no lo notificará).
		const watchers = state.openFurnaceWatchers.get(key);
		if (watchers) {
			watchers.delete(playerId);
			if (watchers.size === 0) state.openFurnaceWatchers.delete(key);
		}
		p.openFurnace = null;
	}
	ws.send(
		JSON.stringify({
			event: "furnace_state",
			data: { key, ...crafting.furnaceSnapshot(f) }
		})
	);
}

// ============================================================
// COFRE
// ============================================================

function handleChestOpen(p, ws, data) {
	// Fase 6: abrir un cofre — valida distancia y que el bloque sea
	// realmente un cofre (fuente de verdad del servidor).
	if (!validCoords(data.x, data.y, data.z)) return; // C2 (SV-3/SEC-3)
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
}

// Mover items entre el cofre abierto y el inventario del jugador:
//   put   — del slot del inventario (invSlot) al cofre (apila o 1er hueco)
//   take  — del slot del cofre (chestSlot) al inventario (apila)
//   close — cerrar
function handleChestAction(p, ws, data) {
	if (!p.openChest) return;
	const key = p.openChest; // capturar antes de que 'close' lo anule
	// Revalidar distancia (como chest_open): en Minecraft hay que seguir
	// cerca del cofre para usarlo (defensivo contra alejarse y operar).
	const [bx, by, bz] = key.split(",").map(Number);
	if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
	const c = chests.getOrCreateChest(key);
	if (data.action === "put") {
		// Auditoría 2026-08-15 (H1): `invSlot`/`chestSlot` se validaban con
		// falsy — `"length"` pasaba (`p.inventory["length"] === 36` es truthy)
		// y el `p.inventory[invSlot] = null` posterior truncaba el array a 0
		// (se persistía vacío). Exigir enteros en rango en AMBOS índices.
		const invSlot = data.invSlot;
		if (!Number.isInteger(invSlot) || invSlot < 0 || invSlot > 35) return;
		const item = p.inventory[invSlot];
		if (!item) return;
		// Herramientas NUNCA se apilan (cada una con su durabilidad propia):
		// apilarlas por id fusionaría dos picos con durabilidades distintas en
		// un slot y el take (addToInventory fuerza count 1) perdería uno.
		// Fase 19 (D2): destino EXPLÍCITO (drag & drop) — chestSlot opcional
		// (0-26); sin él se conserva el comportamiento de apilar/1er hueco.
		const chestSlot = Number.isInteger(data.chestSlot) ? data.chestSlot : null;
		if (chestSlot !== null) {
			if (chestSlot < 0 || chestSlot > 26) return;
			const dest = c[chestSlot];
			if (dest && (dest.id !== item.id || isTool(item.id))) return; // ocupado con otro ítem (o herramienta)
			if (dest) dest.count += item.count;
			else c[chestSlot] = new ItemStack(item.id, item.count, item.durability);
			p.inventory[invSlot] = null;
			playerHelpers.sendInventory(p);
		} else {
			let target = isTool(item.id)
				? -1
				: c.findIndex((s) => s && s.id === item.id);
			if (target === -1) target = c.findIndex((s) => !s);
			if (target === -1) return; // cofre lleno
			if (c[target]) c[target].count += item.count;
			else c[target] = new ItemStack(item.id, item.count, item.durability);
			p.inventory[invSlot] = null;
			playerHelpers.sendInventory(p);
		}
	} else if (data.action === "take") {
		// Auditoría 2026-08-15 (H1): mismo bug que `put` — `chestSlot`
		// "length" resolvía a `c.length` (27, truthy) y el `c[chestSlot] =
		// null` posterior truncaba el cofre a 0. Entero en rango 0-26.
		const chestSlot = data.chestSlot;
		if (!Number.isInteger(chestSlot) || chestSlot < 0 || chestSlot > 26) return;
		const item = c[chestSlot];
		if (!item) return;
		// Fase 19 (D2): destino EXPLÍCITO del inventario (drag & drop) —
		// invSlot opcional (0-35); sin él, addToInventory (apila/1er hueco).
		const invSlot = Number.isInteger(data.invSlot) ? data.invSlot : null;
		if (invSlot !== null) {
			if (invSlot < 0 || invSlot > 35) return;
			const dest = p.inventory[invSlot];
			if (dest && (dest.id !== item.id || isTool(item.id))) return;
			if (dest) dest.count += item.count;
			else
				p.inventory[invSlot] = new ItemStack(
					item.id,
					item.count,
					item.durability
				);
			c[chestSlot] = null;
			playerHelpers.sendInventory(p);
		} else {
			if (
				!playerHelpers.addToInventory(p, item.id, item.count, item.durability)
			)
				return; // inventario lleno
			c[chestSlot] = null;
			playerHelpers.sendInventory(p);
		}
	} else if (data.action === "close") {
		p.openChest = null;
	}
	ws.send(
		JSON.stringify({
			event: "chest_state",
			data: { key, slots: chests.chestSnapshot(c) }
		})
	);
}

// ============================================================
// ARMADURA
// ============================================================

// Fase 7: equipar una pieza de armadura desde el inventario (clic derecho con
// la pieza en mano). Se intercambia con la pieza ya equipada (vuelve al
// inventario, conservando su durabilidad).
function handleEquipArmor(p, data) {
	const slotIdx = data.inventorySlot;
	const item = p.inventory[slotIdx];
	if (!item || !isArmor(item.id)) return;
	const slotName = ARMOR_SLOTS[(item.id - 220) % 4];
	const prev = p.armor[slotName];
	// Devolver la pieza actual al MISMO slot si el hueco se queda libre; si no
	// había pieza, el slot del inventario queda vacío.
	p.inventory[slotIdx] = prev
		? new ItemStack(prev.id, 1, prev.durability)
		: null;
	p.armor[slotName] = new ItemStack(
		item.id,
		1,
		item.durability ?? ARMOR_DURABILITY[item.id]
	);
	playerHelpers.sendInventory(p);
}

// Fase 7: quitar una pieza del slot de armadura (clic en el panel de
// inventario): vuelve al inventario conservando su durabilidad.
function handleUnequipArmor(p, data) {
	const slotName = data.slot;
	if (!ARMOR_SLOTS.includes(slotName)) return;
	const piece = p.armor[slotName];
	if (!piece) return;
	if (!playerHelpers.addToInventory(p, piece.id, 1, piece.durability)) return; // inventario lleno: no se pierde la pieza
	p.armor[slotName] = null;
	playerHelpers.sendInventory(p);
}

// ============================================================
// CUBO Y PUERTA (Fase 13, L2/L4)
// ============================================================

// Cubo de líquidos. Clic derecho: con el cubo VACÍO sobre una fuente de
// agua/lava (B.WATER/B.LAVA) la recoge (deja aire y devuelve
// WATER_BUCKET/LAVA_BUCKET); con el cubo LLENO vierte el líquido donde se
// mira (deja BUCKET vacío). Compatible con la fuente infinita 2×2 de la Fase
// 11: al recoger, si quedan ≥2 fuentes ortogonales adyacentes, la celda se
// rellena sola.
function handleBucketUse(p, data) {
	const { x, y, z } = data;
	if (!validCoords(x, y, z)) return; // C2 (SV-3/SEC-3)
	if (Math.hypot(x - p.x, y - p.y, z - p.z) > 7) return;
	const held = p.inventory[p.selectedSlot];
	if (!held) return;
	const block = world.getBlock(x, y, z);
	// RECOGER: cubo vacío sobre una fuente.
	if (held.id === I.BUCKET) {
		if (block === B.WATER || block === B.LAVA) {
			// Fuente infinita 2×2 (Fase 11): con ≥2 fuentes adyacentes la celda
			// se rellena sola (el patrón nunca se agota).
			if (block === B.WATER && world.countWaterNeighbors(x, y, z) >= 2) return; // no recoger: la 2×2 queda intacta (se puede sacar de ella)
			world.setBlock(x, y, z, B.AIR);
			playerHelpers.removeFromInventory(p, I.BUCKET, 1);
			playerHelpers.addToInventory(
				p,
				block === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET,
				1
			);
			playerHelpers.sendInventory(p);
		}
		return;
	}
	// VERTER: cubo lleno → el líquido se coloca donde se mira si es aire (y la
	// celda está dentro del mundo). Devuelve el cubo vacío.
	if (held.id === I.WATER_BUCKET || held.id === I.LAVA_BUCKET) {
		if (block !== B.AIR) return;
		world.setBlock(x, y, z, held.id === I.WATER_BUCKET ? B.WATER : B.LAVA);
		playerHelpers.removeFromInventory(p, held.id, 1);
		playerHelpers.addToInventory(p, I.BUCKET, 1);
		playerHelpers.sendInventory(p);
	}
}

// Abrir/cerrar una puerta o portón con clic derecho. El servidor alterna el
// estado (state.doors) y hace broadcast door_state para que todos los
// jugadores vean el cambio. La puerta cerrada es sólida; la abierta se
// atraviesa (la valida world.isSolidAt en el move).
function handleDoorUse(p, data) {
	let bx = data.x,
		by = data.y,
		bz = data.z;
	if (!validCoords(bx, by, bz)) return; // C2 (SV-3/SEC-3)
	if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
	let block = world.getBlock(bx, by, bz);
	// La puerta ocupa 2 celdas (ambas son bloque de puerta): el estado de
	// apertura vive SIEMPRE en la celda INFERIOR. Si el clic cae en la mitad
	// superior (también bloque de puerta) o justo encima de la puerta, se
	// remapea a la celda inferior — fix de paridad: antes el remapeo exigía
	// que la celda clicada NO fuera puerta, así que clicar la mitad superior
	// abría un estado distinto en la celda alta (y la puerta seguía sólida).
	if (constants.isDoor(world.getBlock(bx, by - 1, bz))) {
		by = by - 1;
		block = world.getBlock(bx, by, bz);
	}
	if (!constants.isDoor(block)) return;
	const key = `${bx},${by},${bz}`;
	const cur = state.doors.get(key) || { open: false };
	const open = !cur.open;
	state.doors.set(key, { open });
	broadcast("door_state", { x: bx, y: by, z: bz, open });
}

// ============================================================
// CAMA Y COMIDA
// ============================================================

// Dormir en una cama de noche — salta al amanecer y fija el punto de
// reaparición en la cama (respawnPoint, usado por players.damagePlayer al
// morir). De día se rechaza (como Minecraft).
function handleSleep(p, ws, data) {
	if (!validCoords(data.x, data.y, data.z)) return; // F16-04 (C2, residual)
	const bx = data.x,
		by = data.y,
		bz = data.z;
	if (Math.hypot(bx - p.x, by - p.y, bz - p.z) > 7) return;
	if (!isBed(world.getBlock(bx, by, bz))) return;
	// Fase 18 (C-1): dormir solo en la NOCHE ESTRICTA (fase ≥ duskEnd). Antes
	// el umbral era DAY_CYCLE_MS/2 (binario 10/10); con las franjas MC la
	// noche son 7 min de 20 y el atardecer/amanecer no cuentan para dormir.
	if (!isNightTime(worldTime())) {
		ws.send(
			JSON.stringify({ event: "sleep_rejected", data: { reason: "day" } })
		);
		return;
	}
	// Saltar al amanecer: mismo mecanismo que /time set day (el reloj del
	// mundo sigue a state.timeOffset; todos los clientes re-sincronizan).
	state.timeOffset =
		(0 - (Date.now() % DAY_CYCLE_MS) + DAY_CYCLE_MS) % DAY_CYCLE_MS;
	broadcast("time_set", {
		dayTime: worldTime(),
		moonTime: commands.moonTime(state) // Fase 8 (B8): fase lunar en sync
	});
	// Punto de reaparición: las coordenadas del BLOQUE de la cama (los
	// offsets se aplican al reaparecer en players.damagePlayer; guardarlos ya
	// desplazados rompería la limpieza al romper la cama).
	p.respawnPoint = { x: bx, y: by, z: bz };
	ws.send(JSON.stringify({ event: "sleep_ok", data: { x: bx, y: by, z: bz } }));
}

// Comer el ítem seleccionado: valida que sea comida y aplica hambre+saturación.
function handleEat(p, ws) {
	const held = p.inventory[p.selectedSlot];
	if (!held) return;
	const verdict = playerHelpers.canEat(p, held.id);
	if (verdict === "full") {
		// Estilo Minecraft: avisar cuando no hay hambre ni saturación por recuperar
		ws.send(JSON.stringify({ event: "eat_rejected", data: {} }));
		return;
	}
	if (verdict !== "ok") return; // no es comida (no debería pasar vía UI)
	playerHelpers.eatFood(p, held.id);
	held.count -= 1;
	if (held.count <= 0) p.inventory[p.selectedSlot] = null;
	playerHelpers.sendInventory(p);
}

// ============================================================
// MOBS: alimentar, esquilar, domesticar, sentar, atacar
// ============================================================

// Alimentar a un animal con su comida de cría: modo amor → pareja → bebé.
function handleFeedMob(p, data) {
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
}

// Fase 11 (C): esquilar una oveja con tijeras — clic derecho da lana sin
// matar al animal (la oveja queda esquilada hasta que le crece el pelo). El
// servidor valida distancia, ítem y estado.
function handleShearMob(p, data) {
	const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
	if (!mob) return;
	if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > mobs.SHEAR_RANGE)
		return;
	const held = p.inventory[p.selectedSlot];
	if (!held || held.id !== I.SHEARS) return;
	if (mobs.canShear(mob, held.id) !== "ok") return;
	const { count: woolCount, woolId } = mobs.applyShear(mob);
	playerHelpers.addToInventory(p, woolId, woolCount);
	// Auditoría 2026-08-09 (§4.2): esquilar desgasta las tijeras (como MC: -1
	// por corte). El break/sync lo gestiona applyToolWear.
	playerHelpers.applyToolWear(p);
	playerHelpers.sendInventory(p);
}

// Fase 21 (C1): ordeñar la vaca — clic derecho con el CUBO VACÍO sobre una
// vaca la consume y devuelve el cubo LLENO DE LECHE (I.MILK). Como en MC, la
// leche no es comida ni se craftea; aquí solo se obtiene ordeñando.
function handleMilkCow(p, data) {
	const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
	if (mob?.type !== "cow") return;
	if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
	const held = p.inventory[p.selectedSlot];
	if (!held || held.id !== I.BUCKET) return;
	if (!playerHelpers.removeFromInventory(p, I.BUCKET, 1)) return;
	playerHelpers.addToInventory(p, I.MILK, 1);
	playerHelpers.sendInventory(p);
}

// Fase 12 (A1/A3): domesticar — hueso sobre lobo salvaje, pescado crudo sobre
// ocelote. ~33% por intento (MC real); el ítem se consume solo en el intento,
// se denomine o no. En éxito: corazones (mob_breed) y el ocelote se vuelve
// gato.
function handleTameMob(p, data) {
	const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
	if (!mob) return;
	if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
	const held = p.inventory[p.selectedSlot];
	if (!held) return;
	if (mobs.canTame(mob, held.id) !== "ok") return;
	// Consumir el ítem del intento (hueso/pescado) y tirar la doma.
	if (!playerHelpers.removeFromInventory(p, held.id, 1)) return;
	if (mobs.applyTame(mob, p)) {
		broadcast("mob_breed", { x: mob.x, y: mob.y, z: mob.z });
		broadcast("tame_ok", { id: mob.id, type: mob.type });
	}
	playerHelpers.sendInventory(p);
}

// Fase 12 (A1/E10): clic derecho con la mano vacía sobre la mascota propia
// alterna sentado/levantado (sentada no sigue ni ataca). Solo el dueño puede;
// se valida distancia y propiedad.
function handleSitPet(p, data) {
	const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
	if (!mob || mob.ownerId !== p.id) return;
	if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
	mobs.sitPet(mob);
}

// Fase 12 (A4/E8): el jugador lanza su tridente (clic derecho) — se retira
// del inventario, vuela con la física de proyectiles y vuelve al inventario
// al impactar o expirar (mobs.tickArrows).
function handleThrowTrident(p) {
	if (mobs.throwPlayerTrident(p)) playerHelpers.sendInventory(p);
}

// Fase 13 (L1): el jugador dispara su arco (clic derecho). El servidor valida
// que la mano es un arco y que HAY flechas en el inventario; consume 1
// flecha, lanza el proyectil (daño 9) y desgasta el arco (BOW_DURABILITY,
// solo al disparar).
function handleShootBow(p, ws) {
	const held = p.inventory[p.selectedSlot];
	if (!held || held.id !== constants.I.BOW) return;
	if (playerHelpers.countInInventory(p, constants.I.ARROW) < 1) return;
	if (mobs.shootPlayerArrow(p)) {
		const broke = playerHelpers.applyBowWear(p);
		playerHelpers.sendInventory(p);
		if (broke) ws.send(JSON.stringify({ event: "tool_broke", data: {} }));
	}
}

// Fase 21.5 (D5): el jugador lanza su carga de viento (clic derecho). El
// servidor valida que la mano es una carga de viento, consume 1 del
// inventario y lanza el proyectil que empuja (kind "wind"). No vuelve al
// inventario (un solo uso, paridad MC).
function handleThrowWindCharge(p) {
	if (mobs.throwWindCharge(p)) playerHelpers.sendInventory(p);
}

// Fase 21.5 (B4): recoger miel — clic derecho con una botella de vidrio sobre
// una colmena/nido (a 4 bloques) la consume y devuelve una botella de miel
// (comida 6/1.2, como en Minecraft). Simplificación: la colmena no se agota.
function handleHoneyBottle(p, data) {
	const block = world.getBlock(data.x, data.y, data.z);
	if (block !== B.BEE_NEST && block !== B.BEE_HIVE) return;
	if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 5) return;
	const held = p.inventory[p.selectedSlot];
	if (!held || held.id !== I.GLASS_BOTTLE) return;
	if (!playerHelpers.removeFromInventory(p, I.GLASS_BOTTLE, 1)) return;
	playerHelpers.addToInventory(p, I.HONEY_BOTTLE, 1);
	playerHelpers.sendInventory(p);
}

// Fase 21.5 (A1): pesca (clic derecho con la caña en mano). Si NO hay línea
// lanzada, la lanza; si ya hay una, la recoge — con picoteo entrega un ítem
// de la tabla de loot de pesca (y desgasta la caña SOLO entonces), sin
// picoteo la devuelve sin gastar durabilidad. El bobber se replica por
// arrows_update (kind "bobber", ver timers.js).
function handleFishing(p, ws) {
	const held = p.inventory[p.selectedSlot];
	if (!held || held.id !== constants.I.FISHING_ROD) return;
	if (fishing.getPlayerBobber(p.id)) {
		const { caught, broke } = fishing.reelBobber(p);
		if (caught) {
			// El cliente suena/notifica la captura (sonido de pop).
			ws.send(
				JSON.stringify({
					event: "fishing_catch",
					data: { id: caught.id, category: caught.category }
				})
			);
			if (broke) ws.send(JSON.stringify({ event: "tool_broke", data: {} }));
		}
		playerHelpers.sendInventory(p);
	} else {
		fishing.castFishingLine(p);
	}
}

function handleAttackMob(p, ws, data) {
	const mob = state.mobs.find((m) => m.id === data.mobId && m.alive);
	if (!mob) return;
	// Fase 8 (B10): rango de ataque 7 bloques, alineado con el rayo del
	// cliente (raycaster.far = 7 en input.js). Antes era 4: los clics a 5-7
	// bloques se descartaban en silencio (el mob no reaccionaba).
	if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 7) return;
	const tool = p.inventory[p.selectedSlot] ? p.inventory[p.selectedSlot].id : 0;
	// Fase 5: daño de espada por material. Fase 13 (paridad B3): sin espada el
	// daño es 1 (mano desnuda, como Minecraft Java 1.9+). Auditoría 2026-08-09
	// (§3.7): hachas/picos/palas también pegan (TOOL_DAMAGE); lo que no está
	// en ninguna tabla (azada, mano) sigue en 1.
	// Fase 21.5 (D3): la MAZA suma daño por la altura de caída acumulada
	// (fallFromY se mantiene mientras el jugador está en el aire; al aterrizar
	// se limpia). En MC la maza golpea con bonus por cada bloque caído; aquí,
	// al no haber cooldown de ataque, el bonus es por blow caído acumulado.
	let dmg = TOOL_DAMAGE[tool] || SWORD_DAMAGE[tool] || 1;
	if (tool === constants.I.MACE && p.fallFromY != null) {
		const fallBlocks = Math.max(0, p.fallFromY - p.y);
		if (fallBlocks >= constants.MACE_FALL_MIN_BLOCKS) {
			dmg += Math.floor(fallBlocks) * constants.MACE_FALL_DAMAGE_PER_BLOCK;
		}
	}
	mob.health -= dmg;
	// Fase 12 (A1/E10): los lobos domados del atacante se unen al golpe (≤12
	// bloques del objetivo, daño 3 cada uno). Se aplica ANTES de evaluar la
	// muerte para que el golpe conjunto pueda rematar al mob.
	const petsHit = mobs.petsJoinAttack(mob, p);
	// Fase 8 (B10): feedback del golpe para TODOS los que ven el mob — flash
	// de daño y sonido en el cliente (mob_hit). Antes el golpe no producía
	// ninguna reacción visible: el jugador creía que no servía. Fase 18 (C-9):
	// `tool` viaja en mob_hit para que el cliente varíe el sonido del golpe
	// por tipo de arma (espada metálica vs sorda).
	broadcast("mob_hit", {
		id: mob.id,
		dmg: dmg + petsHit * 3,
		health: mob.health,
		tool
	});
	// Fase 8 (B10): knockback — el mob retrocede un poco en la dirección
	// contraria al atacante (se replica con el próximo mobs_update).
	const dist = Math.max(0.1, Math.hypot(mob.x - p.x, mob.z - p.z));
	mob.x += ((mob.x - p.x) / dist) * 0.6;
	mob.z += ((mob.z - p.z) / dist) * 0.6;
	// Fase 5: las espadas se desgastan al golpear (se rompen al llegar a 0)
	const broke = playerHelpers.applyToolWear(p, true);
	const isSword = !!SWORD_DAMAGE[tool];
	// Fase 9 (Bloque D): al golpear, los PASAVOS huyen del atacante (~4s,
	// dirección contraria) — ver mobs.js mobHit().
	mobs.Mob.prototype.mobHit.call(mob, p);
	if (mob.health <= 0) {
		// Fase 13 (C2): hook de muerte por especie — el slime se divide
		// (grande/mediano → 2 hijos del tamaño inferior; el pequeño no). Debe
		// ejecutarse ANTES de marcar alive=false: splitSlime rechaza mobs
		// muertos.
		mob.onDeath();
		mob.alive = false;
		broadcast("mob_death", { id: mob.id });
		// Drops de comida de animales al morir (directo al atacante)
		const drops = mobs.mobDrops(mob);
		if (drops)
			for (const d of drops) playerHelpers.addToInventory(p, d.id, d.count);
		// Fase 5: XP por matar mobs (auditoría §4.1: mobXp, slime por tamaño)
		playerHelpers.addXp(p, mobs.mobXp(mob));
		playerHelpers.sendInventory(p);
	} else if (isSword) {
		// Cada golpe de espada desgasta aunque el mob sobreviva: sincronizar la
		// durabilidad del HUD
		playerHelpers.sendInventory(p);
	}
	if (broke) {
		ws.send(
			JSON.stringify({
				event: "tool_broke",
				data: { slot: p.selectedSlot }
			})
		);
	}
}

// Fase 21.5 (C2): escudo — activar/desactivar el bloqueo. El jugador debe
// llevar el escudo en la mano activa; el servidor guarda p.blocking, que
// damagePlayer (combat.js) consulta al reducir el daño de mobs/proyectiles.
function handleShieldBlock(p, data = {}) {
	const held = p.inventory[p.selectedSlot];
	const hasShield = held && held.id === constants.I.SHIELD;
	if (!hasShield) {
		p.blocking = false; // sin escudo en mano no se puede bloquear
		return;
	}
	p.blocking = !!data.blocking;
}

// ============================================================
// AGRICULTURA (Fase 9, Bloque C) Y PICKER CREATIVO
// ============================================================

// Arar la tierra con una azada — clic derecho con azada en la mano sobre
// tierra/césped la convierte en tierra arada (soporte para plantar semillas).
// La azada se desgasta (1 uso).
function handleTill(p, ws, data) {
	if (!validCoords(data.x, data.y, data.z)) return; // C2 (SV-3/SEC-3)
	const block = world.getBlock(data.x, data.y, data.z);
	if (block !== B.DIRT && block !== B.GRASS) return;
	if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) return;
	const held = p.inventory[p.selectedSlot];
	if (!held || !constants.isHoe(held.id)) return;
	world.setBlock(data.x, data.y, data.z, B.FARMLAND);
	const broke = playerHelpers.applyToolWear(p);
	playerHelpers.sendInventory(p);
	if (broke)
		ws.send(
			JSON.stringify({ event: "tool_broke", data: { slot: p.selectedSlot } })
		);
}

// Plantar semillas en tierra arada — clic derecho con semillas sobre farmland
// coloca un cultivo de trigo (crece por etapas en el bucle principal y se
// cosecha al madurar).
function handlePlant(p, data) {
	if (!validCoords(data.x, data.y, data.z)) return; // C2 (SV-3/SEC-3)
	if (world.getBlock(data.x, data.y, data.z) !== B.FARMLAND) return;
	if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) return;
	const held = p.inventory[p.selectedSlot];
	if (!held || held.id !== I.SEEDS) return;
	if (!playerHelpers.removeFromInventory(p, I.SEEDS, 1)) return;
	world.setBlock(data.x, data.y, data.z, B.WHEAT);
	state.crops.set(`${data.x},${data.y},${data.z}`, {
		stage: 0,
		plantedAt: Date.now()
	});
	playerHelpers.sendInventory(p);
}

// Fase 11 (C): harina de hueso — sobre trigo lo madura en salto (avanza
// etapas hasta 7); sobre césped/tierra crea vegetación encima (hierba alta o
// una flor). Consume 1 harina; el servidor valida el ítem y la distancia.
function handleBonemeal(p, data) {
	if (!validCoords(data.x, data.y, data.z)) return; // C2 (SV-3/SEC-3)
	if (Math.hypot(data.x - p.x, data.y - p.y, data.z - p.z) > 7) return;
	const held = p.inventory[p.selectedSlot];
	if (!held || held.id !== I.BONE_MEAL) return;
	const block = world.getBlock(data.x, data.y, data.z);
	if (block === B.WHEAT) {
		const key = `${data.x},${data.y},${data.z}`;
		const crop = state.crops.get(key) || { stage: 0, plantedAt: Date.now() };
		crop.stage = Math.min(7, crop.stage + 2 + Math.floor(Math.random() * 3));
		state.crops.set(key, crop);
	} else if (block === B.GRASS || block === B.DIRT) {
		const above = world.getBlock(data.x, data.y + 1, data.z);
		if (above !== B.AIR) return;
		const r = Math.random();
		world.setBlock(
			data.x,
			data.y + 1,
			data.z,
			r < 0.5 ? B.TALL_GRASS : r < 0.75 ? B.POPPY : B.DANDELION
		);
	} else {
		return;
	}
	if (!playerHelpers.removeFromInventory(p, I.BONE_MEAL, 1)) return;
	playerHelpers.sendInventory(p);
}

// Picker creativo — el jugador coge un ítem del catálogo completo (bloques,
// ítems, herramientas, armadura) y se coloca en el slot seleccionado. Solo en
// un mundo creative; los ítems deben estar en el catálogo (nunca IDs
// arbitrarios del wire).
function handleCreativePick(p, data) {
	if (p.gamemode !== "creative") return;
	const id = data.itemId;
	if (typeof id !== "number") return;
	const isToolOrArmor =
		constants.isTool(id) || constants.isArmor(id) || constants.isHoe(id);
	if (
		!(
			constants.CREATIVE_ITEMS.includes(id) ||
			constants.ALL_TOOLS_AND_ARMOR.includes(id)
		)
	)
		return;
	p.inventory[p.selectedSlot] = new ItemStack(
		id,
		isToolOrArmor ? 1 : 64,
		isToolOrArmor
			? (constants.TOOL_DURABILITY[id] ??
					constants.ARMOR_DURABILITY[id] ??
					constants.HOE_DURABILITY[id] ??
					(constants.isFishingRod(id)
						? constants.FISHING_ROD_DURABILITY
						: undefined))
			: undefined
	);
	playerHelpers.sendInventory(p);
}

// El cliente avisa del estado de vuelo (doble espacio). Solo en creative; es
// informativo para el servidor (el anti-cheat de ascenso ya se salta en
// creative) y para el F3.
function handleCreativeFly(p, data) {
	if (p.gamemode !== "creative") return;
	p.flying = !!data.enabled;
}

// ============================================================
// CHAT (Fase 6)
// ============================================================
function handleChat(p, data) {
	if (typeof data.message !== "string") return;
	// Los mensajes que empiezan por '/' son comandos de la consola (fuente de
	// verdad del servidor); el resto es chat normal.
	if (data.message.startsWith("/")) {
		commands.executeCommand(p, data.message, {
			state,
			world,
			broadcast,
			playerHelpers,
			crafting,
			viewDistance: p.renderDistance
		});
		return;
	}
	broadcast("chat", {
		id: p.name,
		message: data.message.slice(0, 200)
	});
}

// ============================================================
// Fase 21.5 (F4): Mochila (Bundle) — inventario portátil (9 slots).
// Patrón simplificado del cofre: clic derecho con la mochila en la mano
// abre la UI, put/take mueven items entre el inventario y la mochila.
// No hay distancia de bloque (es un ítem, no un bloque del mundo).
// ============================================================
function handleBundleOpen(p, ws) {
	// Solo se puede tener una UI abierta a la vez.
	if (p.openChest || p.openFurnace) return;
	p.openBundle = true;
	ws.send(
		JSON.stringify({
			event: "bundle_state",
			data: {
				slots: p.bundle.map((s) =>
					s ? { id: s.id, count: s.count, durability: s.durability } : null
				)
			}
		})
	);
}

function handleBundleAction(p, ws, data) {
	if (!p.openBundle) return;
	if (data.action === "close") {
		p.openBundle = false;
		return;
	}
	if (data.action === "put") {
		const invSlot = data.invSlot;
		if (!Number.isInteger(invSlot) || invSlot < 0 || invSlot > 35) return;
		const item = p.inventory[invSlot];
		if (!item) return;
		// Slot destino explícito o primer hueco.
		const targetSlot = Number.isInteger(data.bundleSlot) ? data.bundleSlot : -1;
		if (targetSlot >= 0 && targetSlot < 9) {
			const dest = p.bundle[targetSlot];
			if (dest && (dest.id !== item.id || constants.isTool(item.id))) return;
			if (dest) dest.count += item.count;
			else
				p.bundle[targetSlot] = {
					id: item.id,
					count: item.count,
					durability: item.durability
				};
			p.inventory[invSlot] = null;
		} else {
			// Buscar slot existente apilable o primer hueco.
			let placed = false;
			for (let i = 0; i < 9; i++) {
				const dest = p.bundle[i];
				if (dest && dest.id === item.id && !constants.isTool(item.id)) {
					dest.count += item.count;
					placed = true;
					break;
				}
			}
			if (!placed) {
				for (let i = 0; i < 9; i++) {
					if (!p.bundle[i]) {
						p.bundle[i] = {
							id: item.id,
							count: item.count,
							durability: item.durability
						};
						placed = true;
						break;
					}
				}
			}
			if (placed) p.inventory[invSlot] = null;
		}
	} else if (data.action === "take") {
		const bundleSlot = data.bundleSlot;
		if (!Number.isInteger(bundleSlot) || bundleSlot < 0 || bundleSlot > 8)
			return;
		const item = p.bundle[bundleSlot];
		if (!item) return;
		let placed = false;
		if (data.invSlot !== undefined) {
			const invSlot = data.invSlot;
			if (!Number.isInteger(invSlot) || invSlot < 0 || invSlot > 35) return;
			const dest = p.inventory[invSlot];
			if (dest && (dest.id !== item.id || constants.isTool(item.id))) return;
			if (dest) dest.count += item.count;
			else
				p.inventory[invSlot] = {
					id: item.id,
					count: item.count,
					durability: item.durability
				};
			placed = true;
		} else {
			// Primer hueco del inventario.
			for (let i = 0; i < 36; i++) {
				const dest = p.inventory[i];
				if (dest && dest.id === item.id && !constants.isTool(item.id)) {
					dest.count += item.count;
					placed = true;
					break;
				}
			}
			if (!placed) {
				for (let i = 0; i < 36; i++) {
					if (!p.inventory[i]) {
						p.inventory[i] = {
							id: item.id,
							count: item.count,
							durability: item.durability
						};
						placed = true;
						break;
					}
				}
			}
		}
		if (placed !== false) p.bundle[bundleSlot] = null;
	}
	// Responder con el estado actualizado.
	handleBundleOpen(p, ws);
}

// ============================================================
// Fase 21.5 (D6): JUKEBOX — clic derecho con disco para reproducir,
// clic derecho vacío para extraer. El servidor gestiona el estado
// (qué disco hay) y lo difunde a los clientes cercanos.
// ============================================================
const MUSIC_DISC_IDS = new Set([275, 276]); // cat y 13
function handleJukeboxInteract(p, ws, data) {
	const { x, y, z } = data;
	if (x === undefined || y === undefined || z === undefined) return;
	if (Math.hypot(x - p.x, y - p.y, z - p.z) > 6) return;
	const key = `${x},${y},${z}`;
	const slot = p.inventory[p.selectedSlot];
	const jukeState = state.jukeboxes.get(key);
	// Insertar disco: el slot seleccionado es un disco y el jukebox está vacío.
	if (slot && MUSIC_DISC_IDS.has(slot.id) && !jukeState) {
		p.inventory[p.selectedSlot] = null;
		state.jukeboxes.set(key, { disc: slot.id });
		p.send(
			JSON.stringify({
				event: "jukebox_state",
				data: { x, y, z, disc: slot.id }
			})
		);
		// Notificar a clientes cercanos.
		_broadcastNear("jukebox_state", { x, y, z, disc: slot.id }, p.x, p.z);
		return;
	}
	// Extraer disco: jukebox tiene disco y el jugador tiene hueco.
	if (jukeState && !slot) {
		p.inventory[p.selectedSlot] = {
			id: jukeState.disc,
			count: 1,
			durability: 0
		};
		state.jukeboxes.delete(key);
		p.send(
			JSON.stringify({ event: "jukebox_state", data: { x, y, z, disc: 0 } })
		);
		_broadcastNear("jukebox_state", { x, y, z, disc: 0 }, p.x, p.z);
		return;
	}
}
// ============================================================
// Fase 21.5 (D6): NOTE BLOCK — clic derecho emite un sonido.
// El servidor envía note_play a los clientes cercanos con un pitch
// aleatorio (0-24, como MC). No requiere estado persistente.
// ============================================================
function handleNoteBlockClick(p, ws, data) {
	const { x, y, z } = data;
	if (x === undefined || y === undefined || z === undefined) return;
	if (Math.hypot(x - p.x, y - p.y, z - p.z) > 6) return;
	const note = Math.floor(Math.random() * 25); // 0-24
	_broadcastNear("note_play", { x, y, z, note }, p.x, p.z);
}

module.exports = {
	handleCraft,
	handleGridSet,
	handleGridClear,
	handleGridReturn, // Fase 19 (D1): devolver una celda del grid
	handleInventorySwap, // Fase 19 (D1): swap de slots del inventario
	handleRecipeBook,
	handleFurnaceOpen,
	handleFurnaceAction,
	handleChestOpen,
	handleChestAction,
	handleEquipArmor,
	handleUnequipArmor,
	handleBucketUse,
	handleDoorUse,
	handleSleep,
	handleThrowWindCharge, // Fase 21.5 (D5): carga de viento
	handleEat,
	handleFeedMob,
	handleShearMob,
	handleMilkCow, // Fase 21 (C1): ordeñar la vaca con un cubo → leche
	handleTameMob,
	handleSitPet,
	handleThrowTrident,
	handleShootBow,
	handleFishing, // Fase 21.5 (A1): pesca
	handleHoneyBottle, // Fase 21.5 (B4): botella de vidrio → botella de miel
	handleAttackMob,
	handleTill,
	handlePlant,
	handleBonemeal,
	handleCreativePick,
	handleCreativeFly,
	handleChat,
	handleShieldBlock,
	handleBundleOpen, // Fase 21.5 (F4): mochila
	handleBundleAction, // Fase 21.5 (F4): mochila
	handleJukeboxInteract, // Fase 21.5 (D6): jukebox
	handleNoteBlockClick, // Fase 21.5 (D6): note block
	setWorldTimeFn,
	setBroadcastFn,
	setBroadcastNearFn
};
