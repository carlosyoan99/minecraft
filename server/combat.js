"use strict";

// ============================================================
// COMBATE, DAÑO Y XP (Fase 18, D-5 — extraído de players.js)
// Daño al jugador (con armadura MC), telemetría, desgaste de
// herramientas/arco, XP/niveles, respawn/muerte (con el orbe de C-8),
// daño por caída y el ciclo de hambre/saturación/lava/fuego.
// players.js re-exporta todo como fachada (firmas intactas: la suite y
// net.js/commands.js/tnt.js/projectiles.js/mobs.js usan players.*).
// ============================================================
const WebSocket = require("ws");
const world = require("./world.js");
const state = require("./state.js");
const { findSpawn } = world;
const {
	B,
	EYE_HEIGHT,
	FALL_DAMAGE_FREE_BLOCKS,
	SPAWN_GRACE_MS,
	GRAVITY,
	FOOD_VALUES,
	isFood,
	isSolidBlock,
	TOOL_DURABILITY,
	isTool,
	SWORD_DAMAGE,
	applyArmorDamageReduction,
	HOE_DURABILITY,
	BOW_DURABILITY,
	isBow,
	levelFromXp,
	xpToNext,
	xpIntoLevel
} = require("./constants.js");
const { sendInventory } = require("./inventory.js"); // Fase 18 (D-5)

// ============================================================
// TELEMETRÍA DE DAÑO (Fase 8, B2)
// Registra cada daño aplicado por origen para diagnosticar la pérdida de
// vida "sin causa" (plan completo en docs/spec/fase8-spec.md §B2). Canales:
//  1. state.damageLog — anillo de las últimas ~50 entradas (tests headless).
//  2. Evento WS `damage_debug` al jugador afectado → window.__mcLastDamage
//     en el cliente (mostrado por el F3, activable con window.__mcDamageDebug).
//  3. Consola del servidor, solo con DAMAGE_DEBUG=1 en el entorno.
// `source` y `meta` viajan en opts de damagePlayer (sin cambiar su API).
// ============================================================
const DAMAGE_LOG_MAX = 50;
function logDamage(player, source, amount, real, meta = {}) {
	const entry = {
		source,
		amount,
		realAmount: real,
		healthBefore: player.health,
		healthAfter: Math.max(0, player.health - real),
		x: player.x,
		y: player.y,
		z: player.z,
		time: Date.now(),
		...meta
	};
	state.damageLog.push(entry);
	if (state.damageLog.length > DAMAGE_LOG_MAX) state.damageLog.shift();
	if (player.ws && player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(JSON.stringify({ event: "damage_debug", data: entry }));
	}
	if (process.env.DAMAGE_DEBUG === "1") {
		// biome-ignore lint/suspicious/noConsole: telemetría opt-in de diagnóstico
		console.log(
			`[damage] ${source} ${amount}->${real} @ ${player.x.toFixed(1)},${player.y.toFixed(1)},${player.z.toFixed(1)}`,
			meta
		);
	}
}

function sendHealth(player) {
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(
			JSON.stringify({
				event: "health_update",
				data: { health: player.health, maxHealth: player.maxHealth || 20 }
			})
		);
	}
}

function sendFood(player) {
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(
			JSON.stringify({
				event: "food_update",
				data: { food: player.food, saturation: player.saturation }
			})
		);
	}
}

function sendXp(player) {
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(
			JSON.stringify({
				event: "xp_update",
				data: {
					xp: player.xp,
					level: player.level || 0,
					xpInto: xpIntoLevel(player.xp, player.level || 0),
					xpToNext: xpToNext(player.level || 0)
				}
			})
		);
	}
}

// Envía el estado de fuego al cliente (lo usa tickPlayer al cambiar y el
// init de net.js lo replica al conectar).
function sendFireState(player, on) {
	if (player.ws && player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(JSON.stringify({ event: "fire_state", data: { on: !!on } }));
	}
}

// ============================================================
// DURABILIDAD DE HERRAMIENTAS (Fase 5)
// Desgasta la herramienta en la mano del jugador: -1 por uso. Si llega a 0,
// se rompe (se elimina del inventario) y devuelve true. Con onlySwords=true
// solo desgasta si lo que se empuña es una espada (usado al atacar mobs);
// sin él, cualquier herramienta se desgasta (usado al romper bloques).
// El servidor es la fuente de verdad: el cliente solo pinta el HUD.
// ============================================================
function applyToolWear(player, onlySwords = false) {
	const slot = player.inventory[player.selectedSlot];
	if (!slot || !isTool(slot.id)) return false;
	if (onlySwords && !SWORD_DAMAGE[slot.id]) return false;
	const cur =
		typeof slot.durability === "number"
			? slot.durability
			: (TOOL_DURABILITY[slot.id] ?? HOE_DURABILITY[slot.id]);
	const next = Math.max(0, cur - 1);
	if (next <= 0) {
		// Se rompe a mitad de la acción: se elimina aquí, de forma atómica con el
		// resto de la acción (romper/atacar), sin duplicar items (ver auditoría).
		player.inventory[player.selectedSlot] = null;
		return true;
	}
	slot.durability = next;
	return false;
}

// ============================================================
// ARCO (Fase 13, L1): desgaste al DISPARAR. El arco no se desgasta al minar
// ni al atacar con él (solo consume flechas): su durabilidad se descuenta
// por disparo (applyBowWear), como en Minecraft. Devuelve true si el arco
// se rompió (para que el llamador envíe tool_broke).
// ============================================================
function applyBowWear(player) {
	const slot = player.inventory[player.selectedSlot];
	if (!slot || !isBow(slot.id)) return false;
	const cur =
		typeof slot.durability === "number" ? slot.durability : BOW_DURABILITY;
	const next = Math.max(0, cur - 1);
	if (next <= 0) {
		player.inventory[player.selectedSlot] = null;
		return true;
	}
	slot.durability = next;
	return false;
}

// ============================================================
// EXPERIENCIA Y NIVELES (Fase 5 simple → Fase 9 curva MC → Fase 13 paridad)
// XP acumulada -> nivel por la curva OFICIAL de Minecraft (xpToNext por
// tramos: 7, 9, 11, 13... 37, 42...). La salud máxima es SIEMPRE 20
// (paridad B1: en MC real el nivel no da vida); la salud actual no crece
// sola. Se conserva al morir. El HUD recibe la XP dentro del nivel
// (xpIntoLevel) y la necesaria para el siguiente (xpToNext) para pintar
// la barra de progreso.
// ============================================================
function addXp(player, amount) {
	player.xp = (player.xp || 0) + amount;
	const newLevel = levelFromXp(player.xp);
	if (newLevel > (player.level || 0)) {
		player.level = newLevel;
		player.maxHealth = 20;
		sendHealth(player);
		if (player.ws.readyState === WebSocket.OPEN) {
			player.ws.send(
				JSON.stringify({
					event: "level_up",
					data: { level: player.level, xp: player.xp }
				})
			);
		}
	}
	sendXp(player);
}

// ============================================================
// RESPAWN (Fase 7: según gamemode + caída del mundo)
// Reaparece al jugador tras morir (lo llama damagePlayer al llegar a 0 de
// salud y net.js al caer del mundo — void). En SURVIVAL se pierde el
// inventario, la armadura y lo que haya en la mesa de crafteo (en Minecraft
// caería al suelo; aquí no hay entidades de item, así que se pierde). En
// CREATIVE se conserva todo (defensivo: creative no recibe daño, pero el
// void lo llamaría igualmente y no perdería nada). La XP y el nivel se
// mantienen siempre. Cierra cofres/hornos abiertos y olvida la caída en
// curso (el jugador no "cae" al reaparecer).
// ============================================================

// Hook para que la entrada (net) conecte el broadcast de player_die;
// evita un ciclo de require entre players y net.
let broadcastHandler = null;
function setBroadcastHandler(fn) {
	broadcastHandler = fn;
}

// Hook de orbes de XP (Fase 18, C-8): net.js lo conecta a mobs.spawnXpOrb
// (mobs.js importa players.js — inyectarlo aquí evita el ciclo de require).
// Al morir en survival se llama con (player, xpSoltada) para que el orbe
// nazca en la posición de muerte.
let xpDropHandler = null;
function setXpDropHandler(fn) {
	xpDropHandler = fn;
}

function respawnPlayer(player, cause) {
	const keepInventory = player.gamemode === "creative";
	// Fase 10 (B2): `cause` (mob/fall/lava/starve/void/kill...) viaja en
	// player_die para que el cliente pinte la pantalla de muerte con la causa
	// (reutiliza la telemetría source de damagePlayer, Fase 8).
	if (broadcastHandler)
		broadcastHandler("player_die", {
			id: player.id,
			lostInventory: !keepInventory,
			...(cause ? { cause } : {})
		});
	player.openFurnace = null;
	player.openChest = null;
	if (!keepInventory) {
		player.inventory = new Array(36).fill(null);
		player.armor = {
			helmet: null,
			chestplate: null,
			leggings: null,
			boots: null
		};
		player.craftingGrid = new Array(9).fill(null);
		sendInventory(player); // el HUD del cliente se vacía
		// Fase 18 (C-8, B12): en survival la XP se PIERDE al morir — se suelta
		// un orbe con ella en el punto de muerte (recogible al caminar encima).
		// En creative se conserva (keepInventory). El orbe viaja en el snapshot
		// de mobs; tickXpOrbs (net.js mainLoop) lo recoge y la re-añade.
		const droppedXp = player.xp || 0;
		if (droppedXp > 0 && xpDropHandler) {
			xpDropHandler(player, droppedXp);
			player.xp = 0;
			player.level = 0;
			sendXp(player);
		}
	}
	// La caída en curso no sobrevive al respawn (el daño por caída se reinicia).
	player.fallFromY = null;
	player.lastGroundY = null;
	// Fase 8 (mejora anti-cheat): la velocidad de descenso observada y el
	// reloj del aire tampoco viajan al respawn (el jugador no "cae" al
	// reaparecer, igual que fallFromY).
	player.fallVy = 0;
	player.vyObs = 0;
	player.airTimeMs = 0;
	// Fase 10 (A2): al morir se apaga el fuego residual (no se revive ardiendo).
	player.fireUntil = 0;
	player.fireAccum = 0;
	player.lastFireOn = false;
	sendFireState(player, false);
	// B2 (Fase 8): gracia inicial al reaparecer (30s sin daño de mobs).
	player.spawnGraceUntil = Date.now() + SPAWN_GRACE_MS;
	// Respawn (la XP y el nivel se conservan; la salud máxima es siempre 20,
	// paridad B1 — en Minecraft real el nivel no da vida).
	player.health = 20;
	player.food = 20;
	player.saturation = 20;
	player.foodAccum = 0;
	player.regenAccum = 0;
	player.starveAccum = 0;
	// Si dormiste en una cama (respawnPoint), reapareces en ella; si no, sobre
	// tierra firme cerca del origen (findSpawn busca la columna firme si hay un
	// lago, Fase 4). La cama fija el punto al dormir (Fase 7).
	let spawn;
	if (player.respawnPoint)
		// La cama no es sólida: reaparecer ligeramente por encima de ella.
		spawn = {
			x: player.respawnPoint.x + 0.5,
			y: player.respawnPoint.y + 1.0,
			z: player.respawnPoint.z + 0.5
		};
	else spawn = findSpawn(0, 0);
	player.x = spawn.x;
	player.y = spawn.y;
	player.z = spawn.z;
	// Fase 16 (C3): el respawn salta la posición — reiniciar la ventana de
	// velocidad horizontal para no heredar muestras de la posición anterior.
	player.speedSamples = [];
	sendHealth(player);
	sendFood(player);
	if (player.ws.readyState === WebSocket.OPEN) {
		player.ws.send(
			JSON.stringify({
				event: "teleport",
				data: { x: player.x, y: player.y, z: player.z }
			})
		);
	}
}

// opts.armor=false → el daño ignora la armadura (inanición, como en Minecraft:
// la armadura solo protege de ataques y explosiones). Con armadura activa se
// desgasta la durabilidad de las piezas (sendInventory para el HUD del cliente).
// opts.source/opts.meta alimentan la telemetría logDamage (Fase 8, B2).
function damagePlayer(player, amount, opts = {}) {
	if (player.gamemode === "creative") return; // creative (/gamemode): sin daño (mobs, inanición...)
	// B2 (Fase 8): gracia inicial al entrar/reaparecer — 30s sin daño de MOBS
	// (la zona segura del spawn en mobs.js es la otra mitad). El jugador
	// recién llegado puede orientarse; lava/caída/hambre siguen doliendo.
	if (opts.source === "mob" && Date.now() < (player.spawnGraceUntil || 0))
		return;
	let real = amount;
	const armorApplies = opts.armor !== false;
	if (armorApplies) {
		real = applyArmorDamageReduction(player, amount);
		sendInventory(player); // la durabilidad de la armadura pudo cambiar
	}
	logDamage(player, opts.source || "unknown", amount, real, opts.meta);
	player.health = Math.max(0, player.health - real);
	sendHealth(player);
	// Fase 10 (B2): la causa de muerte viaja a la pantalla de muerte.
	if (player.health <= 0) respawnPlayer(player, opts.source || "damage");
}

// ============================================================
// DAÑO POR CAÍDA Y CAÍDA DEL MUNDO (Fase 7)
// El servidor no simula la física: el cliente manda su posición (`move`) y
// aquí se infiere el suelo desde el mundo. Mientras el jugador está en el
// aire se registra el punto más alto alcanzado desde el último suelo firme
// (caminar por un acantilado cuenta desde el borde; un salto desde el pico);
// al aterrizar se aplica el daño proporcional a la altura caída. El agua
// anula el daño, como en Minecraft. Se llama desde net.js en cada move
// validado; el daño pasa por la armadura (damagePlayer) y en creative se
// ignora (damagePlayer lo descarta).
// ============================================================

// Daño en HP para una caída de `fallBlocks` bloques (estilo Minecraft: los
// primeros FALL_DAMAGE_FREE_BLOCKS no dañan; a partir de ahí, 1 HP por bloque).
function fallDamage(fallBlocks) {
	return Math.max(0, Math.floor(fallBlocks) - FALL_DAMAGE_FREE_BLOCKS);
}

// vyObs = velocidad vertical observada en el move actual (bloques/s, negativa
// al caer; la pasa net.js). Durante la caída se acumula el descenso MÁS rápido
// observado (fallVy) y al aterrizar se usa para inferir la altura equivalente
// h = v²/(2·GRAVITY): un cliente que baja "sin daño" reportando trayectorias
// falsas (o descensos acelerados que la posición no refleja) sí recibe el daño
// de su velocidad real. En caídas legítimas la velocidad coincide con la
// altura posicional (conservación de energía), así que no cambia el daño.
function applyFallDamage(player, vyObs = 0) {
	const bx = Math.floor(player.x);
	const bz = Math.floor(player.z);
	const feet = player.y - EYE_HEIGHT; // el cliente envía la altura del ojo
	const feetBlock = world.getBlock(bx, Math.floor(feet), bz);
	const belowBlock = world.getBlock(bx, Math.floor(feet - 0.1), bz);
	const inWater = feetBlock === B.WATER || belowBlock === B.WATER;
	if (isSolidBlock(belowBlock)) {
		// De pie (o aterrizando): liquidar la caída pendiente. El agua en los
		// pies anula el daño (caer en un lago no duele, aunque el fondo sea
		// sólido). Este piso firme queda como referencia para la próxima caída
		// (solo fuera del agua: el fondo de un lago no es un buen "suelo").
		if (player.fallFromY != null) {
			if (!inWater) {
				const hPos = player.fallFromY - player.y;
				// Altura inferida por la velocidad de descenso (h = v²/(2·g)): se
				// usa el MÁXIMO de ambas (en caídas reales coinciden).
				let blocks = hPos;
				const fallVy = player.fallVy ?? 0;
				if (fallVy < 0) {
					const hVy = (fallVy * fallVy) / (2 * GRAVITY);
					if (hVy > blocks) blocks = hVy;
				}
				const dmg = fallDamage(blocks);
				if (dmg > 0)
					damagePlayer(player, dmg, {
						source: "fall",
						meta: {
							fallBlocks: hPos,
							hFromVy: fallVy < 0 ? (fallVy * fallVy) / (2 * GRAVITY) : 0
						}
					});
			}
			player.fallFromY = null;
			player.fallVy = 0;
		}
		if (!inWater) player.lastGroundY = player.y;
		return;
	}
	if (inWater) {
		// Nadando: no hay daño por caída y se olvida la caída en curso.
		player.fallFromY = null;
		player.fallVy = 0;
		return;
	}
	// En el aire: el pico de la caída es el punto más alto desde el último
	// suelo firme (el primer move en caer ya viene algo más abajo del borde).
	player.fallFromY = Math.max(
		player.fallFromY ?? player.y,
		player.lastGroundY ?? player.y,
		player.y
	);
	// Velocidad de descenso más rápida observada en esta caída (el move del
	// aterrizaje ya tiene dy≈0, así que se captura aquí, en el aire).
	if (vyObs < (player.fallVy ?? 0)) player.fallVy = vyObs;
}

// ============================================================
// HAMBRE (Fase 3)
// food va de 0 a 20. El servidor es la fuente de verdad: el tick
// decae la comida con el tiempo (más rápido si el jugador se mueve),
// regenera salud cuando la comida está alta (consumiendo comida) y
// drena salud por inanición cuando llega a 0.
// ============================================================
const FOOD_MAX = 20;
const FOOD_DECAY_MS = 30000; // 1 punto de comida cada 30s parado
const FOOD_DECAY_MOVING_MS = 15000; // y cada 15s si se está moviendo
const FOOD_REGEN_THRESHOLD = 18; // regenera salud solo con la comida casi llena
const FOOD_REGEN_INTERVAL_MS = 2000; // +1 salud cada 2s (y -1 comida)
const FOOD_STARVE_INTERVAL_MS = 2000; // -1 salud cada 2s con comida a 0
const MOVING_WINDOW_MS = 2000; // se considera en movimiento si hubo move reciente
// Lava (Fase 7): contacto con un charco de lava quema al jugador como en
// Minecraft — 2 de daño cada 500ms (la armadura sí protege, por eso se
// llama damagePlayer sin opts.armor=false, a diferencia de la inanición).
const LAVA_DAMAGE_INTERVAL_MS = 500;
const LAVA_DAMAGE = 2;
// Fase 10 (A2): QUEMADURA RESIDUAL de lava. El contacto con lava deja un
// "estado de fuego" que sigue doliendo unos segundos al salir (como en
// Minecraft); el agua lo apaga al instante. El flag se replica al cliente
// con `fire_state` para pintar la llamarada en pantalla.
const FIRE_DURATION_MS = 5000; // ardiendo tras salir de la lava (5s)
const FIRE_DAMAGE_INTERVAL_MS = 1000; // 1 HP por segundo mientras arda
const FIRE_DAMAGE = 1;

// ============================================================
// COMER (Fase 3): aplica hambre + saturación si el ítem es comida
// y no está todo lleno. Devuelve true si se comió.
// ============================================================
// Verifica si el jugador puede comer un ítem: 'ok' si puede,
// 'full' si tiene hambre y saturación llenas, o null si no es comida.
// Lo usa net.js para avisar al cliente cuando el eat se rechaza.
function canEat(player, itemId) {
	if (!isFood(itemId)) return null;
	if (player.food >= FOOD_MAX && player.saturation >= FOOD_MAX) return "full";
	return "ok";
}

function eatFood(player, itemId) {
	if (canEat(player, itemId) !== "ok") return false;
	const v = FOOD_VALUES[itemId];
	player.food = Math.min(FOOD_MAX, player.food + v.food);
	player.saturation = Math.min(FOOD_MAX, player.saturation + v.saturation);
	sendFood(player);
	return true;
}

// Se llama una vez por tick (TICK_MS) para cada jugador conectado.
// ¿El jugador está dentro de un charco de lava? Se comprueba el bloque de sus
// pies (floor(y) y floor(y)-1, por si p.y es el centro del cuerpo o los ojos)
// con world.getBlock (fuente de verdad del servidor).
function inLava(player) {
	const bx = Math.floor(player.x),
		bz = Math.floor(player.z);
	const by = Math.floor(player.y);
	return (
		world.getBlock(bx, by, bz) === B.LAVA ||
		world.getBlock(bx, by - 1, bz) === B.LAVA
	);
}

// ¿El jugador está en agua? (misma comprobación que inLava): el agua apaga
// el fuego de la lava al instante (Fase 10, A2).
function inWater(player) {
	const bx = Math.floor(player.x),
		bz = Math.floor(player.z);
	const by = Math.floor(player.y);
	return (
		world.getBlock(bx, by, bz) === B.WATER ||
		world.getBlock(bx, by - 1, bz) === B.WATER
	);
}

function tickPlayer(player, dtMs) {
	// Lava (Fase 7) + quemadura residual (Fase 10, A2): el contacto aplica
	// daño periódico Y enciende un "estado de fuego" que sigue doliendo unos
	// segundos al salir; el agua lo apaga al instante. El flag fire_state se
	// reenvía solo cuando cambia (no cada tick).
	if (inLava(player)) {
		player.fireUntil = Date.now() + FIRE_DURATION_MS;
		player.lavaAccum = (player.lavaAccum || 0) + dtMs;
		if (player.lavaAccum >= LAVA_DAMAGE_INTERVAL_MS) {
			player.lavaAccum = 0;
			damagePlayer(player, LAVA_DAMAGE, { source: "lava" });
		}
	} else if (inWater(player)) {
		player.fireUntil = 0; // el agua apaga el fuego
		player.lavaAccum = 0;
	} else {
		player.lavaAccum = 0;
	}
	const fireOn = (player.fireUntil || 0) > Date.now();
	if (fireOn) {
		player.fireAccum = (player.fireAccum || 0) + dtMs;
		if (player.fireAccum >= FIRE_DAMAGE_INTERVAL_MS) {
			player.fireAccum = 0;
			damagePlayer(player, FIRE_DAMAGE, {
				source: "lava",
				meta: { fire: true }
			});
		}
	} else {
		player.fireAccum = 0;
	}
	// Replicar el cambio de estado (arranca/apaga la llamarada del cliente).
	if (fireOn !== player.lastFireOn) {
		player.lastFireOn = fireOn;
		sendFireState(player, fireOn);
	}

	// Decaimiento: más rápido en movimiento. La saturación se consume primero
	// (amortigua el hambre), como en Minecraft; luego baja la comida.
	const moving =
		player.lastMoveTime && Date.now() - player.lastMoveTime < MOVING_WINDOW_MS;
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

	// Regeneración: comida casi llena y salud no completa (máx = salud máxima del nivel)
	const maxHealth = player.maxHealth || FOOD_MAX;
	if (player.food >= FOOD_REGEN_THRESHOLD && player.health < maxHealth) {
		player.regenAccum += dtMs;
		if (player.regenAccum >= FOOD_REGEN_INTERVAL_MS) {
			player.regenAccum = 0;
			player.health = Math.min(maxHealth, player.health + 1);
			player.food = Math.max(0, player.food - 1);
			sendHealth(player);
			sendFood(player);
		}
	} else {
		player.regenAccum = 0;
	}

	// Inanición: comida a 0 drena la salud (ignora la armadura, como Minecraft)
	if (player.food <= 0 && player.health > 0) {
		player.starveAccum += dtMs;
		if (player.starveAccum >= FOOD_STARVE_INTERVAL_MS) {
			player.starveAccum = 0;
			damagePlayer(player, 1, {
				source: "starve",
				meta: { food: player.food, saturation: player.saturation },
				armor: false
			});
		}
	} else {
		player.starveAccum = 0;
	}
}

module.exports = {
	// daño / telemetría
	damagePlayer,
	logDamage,
	sendHealth,
	sendFood,
	sendXp,
	sendFireState,
	// desgaste
	applyToolWear,
	applyBowWear,
	// XP / niveles
	addXp,
	// muerte / respawn
	respawnPlayer,
	setBroadcastHandler,
	setXpDropHandler,
	// caída
	fallDamage,
	applyFallDamage,
	// hambre / comida
	canEat,
	eatFood,
	tickPlayer
};
