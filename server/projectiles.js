"use strict";

// ============================================================
// PROYECTILES (Fase 18, D-2)
// Flechas del esqueleto, tridentes del ahogado y proyectiles del JUGADOR
// (arco y tridente): física de gravedad simple, vida limitada, daño al
// primer jugador/mob que intersecten y devolución al inventario del
// lanzador al impactar/expirar (no hay entidades de item en el suelo).
// Se replican por `arrows_update` (broadcast del bucle principal).
// Extraído de mobs.js para mantener los módulos por debajo del umbral de
// tamaño; las fachadas (mobs.tickArrows, mobs.shootArrow, ...) se
// re-exportan desde mobs.js para no cambiar el wire ni los imports.
// ============================================================
const { I, BOW_DAMAGE, isSolidBlock } = require("./constants.js");
const state = require("./state.js");
const world = require("./world.js");
// players.js no importa mobs.js/projectiles.js, así que es seguro requerirlo
// aquí (mismos imports que tenía el bloque en mobs.js).
const {
	damagePlayer,
	applyPoison,
	POISON_DURATION_MS,
	addToInventory,
	removeFromInventory,
	addXp
} = require("./players.js");

const { players } = state;

// ============================================================
// FLECHAS DEL ESQUELETO (Fase 9, Bloque D)
// Primera entidad proyectil del juego: física simple de gravedad y vida
// limitada (~2.5s). El esqueleto dispara si el jugador está a 6-16 bloques
// (con cooldown); la flecha viaja hacia donde estaba el jugador con una
// parábola de tiro y hace daño al acercarse a un jugador. Se replica por
// `arrows_update` (broadcast del bucle principal).
// ============================================================
const ARROW_LIFE_MS = 2500;
const ARROW_SPEED = 14; // bloques/s
const ARROW_GRAVITY = 16; // bloques/s² (como la gravedad del jugador)
const ARROW_DAMAGE = 3;
const ARROW_HIT_DIST = 0.7;
// Fase 12 (Bloque A): tridente — misma física que la flecha (state.arrows),
// distinto daño y `kind: "trident"` para que el cliente lo dibuje como tal.
const TRIDENT_DAMAGE = 6; // ahogado
const TRIDENT_PLAYER_DAMAGE = 8; // lanzado por el jugador
const TRIDENT_SPEED = 16; // algo más veloz que la flecha
// Fase 21.5 (D5): carga de viento (WIND_CHARGE) — proyectil del Breeze que
// el jugador puede lanzar con clic derecho. No hace daño: al impactar con
// un bloque o una entidad hace una RÁFAGA que empuja a jugadores y mobs
// cercanos (reusa el knockback de la TNT: evento `knockback` para jugadores
// y `mob.kb` para mobs), y se consume (no vuelve al inventario, paridad MC).
const WIND_SPEED = 16; // bloques/s (como el tridente)
const WIND_LIFE_MS = 1500;
const WIND_HIT_DIST = 0.8; // radio de "impacto" con una entidad
const WIND_BURST_RADIUS = 3; // radio de la ráfaga que empuja
const WIND_KB_STRENGTH = 0.8; // impulso horizontal (un poco más que TNT)
const WIND_KB_UP = 0.45; // impulso vertical (parábola MC)
const WIND_KB_UNTIL_MS = 600; // ventana de confianza del anti-cheat
const WIND_KB_TTL_TICKS = 10; // duración del impulso de los mobs

// Hooks inyectables: mobDrops/mobXp viven en mobs.js (que requiere este
// módulo). Para no crear un ciclo de require, mobs.js los inyecta al
// cargar (projectiles.setMobDrops/setMobXp).
let mobDropsFn = () => null;
let mobXpFn = () => 0;
function setMobDrops(fn) {
	mobDropsFn = fn;
}
function setMobXp(fn) {
	mobXpFn = fn;
}

function shootArrow(shooter, target) {
	const dx = target.x - shooter.x,
		dz = target.z - shooter.z;
	const dist = Math.max(1, Math.hypot(dx, dz));
	const vx = (dx / dist) * ARROW_SPEED;
	const vz = (dz / dist) * ARROW_SPEED;
	// Parábola de tiro: apuntar un poco alto según la distancia para que el
	// arco caiga sobre el objetivo (física simple, sin solución exacta).
	const vy = 3.5 + (dist / ARROW_SPEED) * (ARROW_GRAVITY / 2);
	state.arrows.push({
		x: shooter.x,
		y: shooter.y + 1.4,
		z: shooter.z,
		vx,
		vy,
		vz,
		life: ARROW_LIFE_MS,
		from: shooter.id
	});
}

// Fase 21.5 (D2): flecha del Bogged (esqueleto de pantano) — la física es
// la misma que la flecha del esqueleto pero el proyectil lleva `poison: true`
// para que (a) el servidor envenene al jugador al impactar y (b) el cliente
// la pinte verdosa. El veneno se replica al HUD con `poison_state`.
function shootPoisonArrow(shooter, target) {
	shootArrow(shooter, target);
	const a = state.arrows[state.arrows.length - 1];
	if (a) a.poison = true;
}

// Fase 12 (Bloque A4): el ahogado arroja tridentes reusando la física de las
// flechas (misma gravedad, distinta velocidad y daño, kind "trident").
function shootTrident(shooter, target) {
	const dx = target.x - shooter.x,
		dz = target.z - shooter.z;
	const dist = Math.max(1, Math.hypot(dx, dz));
	const vx = (dx / dist) * TRIDENT_SPEED;
	const vz = (dz / dist) * TRIDENT_SPEED;
	const vy = 3.5 + (dist / TRIDENT_SPEED) * (ARROW_GRAVITY / 2);
	state.arrows.push({
		x: shooter.x,
		y: shooter.y + 1.4,
		z: shooter.z,
		vx,
		vy,
		vz,
		life: ARROW_LIFE_MS,
		from: shooter.id,
		kind: "trident",
		damage: TRIDENT_DAMAGE
	});
}

// Fase 12 (Bloque A4/E8): el JUGADOR lanza su tridente (clic derecho) hacia
// donde mira. Se le retira del inventario al lanzarlo; al impactar en un
// bloque o agotar su vida vuelve a su inventario (no hay items en el suelo,
// simplificación documentada — ver fase12-spec §E12). Devuelve true si se
// lanzó.
function throwPlayerTrident(player) {
	const held = player.inventory?.[player.selectedSlot || 0];
	if (!held || held.id !== I.TRIDENT) return false;
	if (!addToInventory) return false;
	// Dirección de la mirada (yaw/pitch en radianes, convención three.js: el
	// cliente los envía como camera.rotation.y / camera.rotation.x).
	const yaw = player.yaw || 0;
	const pitch = player.pitch || 0;
	const cp = Math.cos(pitch);
	const dx = -Math.sin(yaw) * cp;
	const dy = Math.sin(pitch);
	const dz = -Math.cos(yaw) * cp;
	removeFromInventory(player, I.TRIDENT, 1);
	state.arrows.push({
		x: player.x,
		y: player.y + 1.4,
		z: player.z,
		vx: dx * TRIDENT_SPEED,
		vy: dy * TRIDENT_SPEED,
		vz: dz * TRIDENT_SPEED,
		life: ARROW_LIFE_MS,
		from: player.id,
		kind: "trident",
		damage: TRIDENT_PLAYER_DAMAGE
	});
	return true;
}

// Devuelve el tridente al jugador que lo lanzó (simplificación de la recogida
// del suelo: al impactar/expirar, el tridente vuelve a su inventario).
function returnPlayerTrident(a) {
	if (a.kind !== "trident" || !a.from) return;
	const owner = players.get(a.from);
	if (owner?.inventory) addToInventory(owner, I.TRIDENT, 1);
}

// Fase 13 (L1): el JUGADOR dispara una flecha con su arco (clic derecho)
// hacia donde mira. Consume 1 ARROW del inventario y lanza el proyectil con
// la MISMA física de las flechas del esqueleto (state.arrows) pero con daño
// 9 (BOW_DAMAGE) y la marca `playerArrow: true` para que, al impactar o
// agotar su vida, la flecha vuelva a su inventario (recogible, como el
// tridente). Devuelve true si se disparó (el llamador desgasta el arco).
function shootPlayerArrow(player) {
	const held = player.inventory?.[player.selectedSlot || 0];
	if (!held || held.id !== I.BOW) return false;
	const yaw = player.yaw || 0;
	const pitch = player.pitch || 0;
	const cp = Math.cos(pitch);
	const dx = -Math.sin(yaw) * cp;
	const dy = Math.sin(pitch);
	const dz = -Math.cos(yaw) * cp;
	removeFromInventory(player, I.ARROW, 1);
	state.arrows.push({
		x: player.x,
		y: player.y + 1.4,
		z: player.z,
		vx: dx * ARROW_SPEED,
		vy: dy * ARROW_SPEED,
		vz: dz * ARROW_SPEED,
		life: ARROW_LIFE_MS,
		from: player.id,
		kind: "arrow",
		damage: BOW_DAMAGE,
		playerArrow: true
	});
	return true;
}

// Devuelve la flecha del JUGADOR a su inventario al impactar/expirar (la
// recogida del suelo se simplifica igual que con el tridente: no hay
// entidades de item en el suelo en este clon). Las flechas del esqueleto
// (sin playerArrow) no vuelven a nadie.
function returnPlayerArrow(a) {
	if (a.kind !== "arrow" || !a.playerArrow || !a.from) return;
	const owner = players.get(a.from);
	if (owner?.inventory) addToInventory(owner, I.ARROW, 1);
}

// ============================================================
// CARGA DE VIENTO (Fase 21.5, D5)
// El jugador lanza su carga de viento con clic derecho hacia donde mira
// (misma dirección que tridente/arco). Se retira del inventario al lanzarla
// y NO vuelve: es de un solo uso (paridad MC). Al impactar hace la ráfaga.
// ============================================================
function throwWindCharge(player) {
	const held = player.inventory?.[player.selectedSlot || 0];
	if (!held || held.id !== I.WIND_CHARGE) return false;
	const yaw = player.yaw || 0;
	const pitch = player.pitch || 0;
	const cp = Math.cos(pitch);
	const dx = -Math.sin(yaw) * cp;
	const dy = Math.sin(pitch);
	const dz = -Math.cos(yaw) * cp;
	removeFromInventory(player, I.WIND_CHARGE, 1);
	state.arrows.push({
		x: player.x,
		y: player.y + 1.4,
		z: player.z,
		vx: dx * WIND_SPEED,
		vy: dy * WIND_SPEED,
		vz: dz * WIND_SPEED,
		life: WIND_LIFE_MS,
		from: player.id,
		kind: "wind"
	});
	return true;
}

// Ráfaga de viento en (bx, by, bz): empuja a jugadores y mobs cercanos en
// dirección radial, sin daño. Mismo patrón que el knockback de la TNT (Fase
// 20 B3): los jugadores reciben el evento `knockback` (el cliente lo integra
// en su física y el anti-cheat lo tolera durante kbUntil) y los mobs el
// impulso `m.kb` que integra su tick.
function windBurst(bx, by, bz) {
	for (const p of players.values()) {
		const distXZ = Math.hypot(p.x - bx, p.z - bz);
		if (distXZ < 0.01 || distXZ >= WIND_BURST_RADIUS) continue;
		if (Math.abs(p.y - by) > 3) continue; // alcance vertical acotado (±3)
		const nx = (p.x - bx) / distXZ;
		const nz = (p.z - bz) / distXZ;
		p.kbUntil = Date.now() + WIND_KB_UNTIL_MS;
		try {
			p.ws.send(
				JSON.stringify({
					event: "knockback",
					data: {
						vx: nx * WIND_KB_STRENGTH,
						vy: WIND_KB_UP,
						vz: nz * WIND_KB_STRENGTH
					}
				})
			);
		} catch {
			/* socket cerrado: la ventana de confianza caduca sola */
		}
	}
	for (const m of state.mobs) {
		if (!m.alive) continue;
		const distXZ = Math.hypot(m.x - bx, m.z - bz);
		if (distXZ < 0.01 || distXZ >= WIND_BURST_RADIUS) continue;
		if (Math.abs(m.y - by) > 3) continue;
		m.kb = {
			vx: ((m.x - bx) / distXZ) * WIND_KB_STRENGTH,
			vy: WIND_KB_UP,
			vz: ((m.z - bz) / distXZ) * WIND_KB_STRENGTH,
			ttl: WIND_KB_TTL_TICKS
		};
	}
}

// Avanza las flechas (dtMs) y aplica daño al primer jugador que intersecten.
// Devuelve las flechas vivas para el broadcast (arrows_update).
function tickArrows(dtMs) {
	const dt = dtMs / 1000;
	const alive = [];
	for (const a of state.arrows) {
		a.life -= dtMs;
		// Fase 12 (A4/E8): el tridente del jugador que expira (supera su vida)
		// vuelve a su inventario ANTES de descartarse — no hay entidades de
		// item en el suelo en este clon, así que la "recogida" es automática.
		if (a.life <= 0) {
			returnPlayerTrident(a);
			returnPlayerArrow(a);
			continue;
		}
		// Posición previa: necesaria para el barrido anti-tunneling (la flecha a
		// 14 bloques/s avanza 0.7 bloques por tick — podría saltarse una pared de
		// 1 bloque si solo se comprobara el punto final).
		const px = a.x,
			py = a.y,
			pz = a.z;
		// Fase 21.5 (D5): carga de viento — trayectoria recta SIN gravedad
		// (paridad MC: la brisa no cae). Al impactar con una entidad o un
		// bloque hace la ráfaga que empuja (sin daño) y se consume: no vuelve
		// al inventario (a diferencia de flechas/tridente, es de un solo uso).
		if (a.kind === "wind") {
			a.x += a.vx * dt;
			a.y += a.vy * dt;
			a.z += a.vz * dt;
			const lanzadorJugador = typeof a.from === "string" && players.has(a.from);
			let burst = null;
			for (const p of players.values()) {
				if (a.from === p.id) continue; // el lanzador no se golpea a sí mismo
				if (Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z) < WIND_HIT_DIST) {
					burst = { x: a.x, y: a.y, z: a.z };
					break;
				}
			}
			if (!burst) {
				for (const m of state.mobs) {
					if (!m.alive || a.from === m.id) continue;
					// No friendly-fire con las mascotas del lanzador (empuje no dañino,
					// pero se salta igual para no desplazar al propio aliado).
					if (lanzadorJugador && m.ownerId === a.from) continue;
					if (Math.hypot(m.x - a.x, m.y - a.y, m.z - a.z) < WIND_HIT_DIST) {
						burst = { x: a.x, y: a.y, z: a.z };
						break;
					}
				}
			}
			if (!burst) {
				const wdx = a.x - px,
					wdy = a.y - py,
					wdz = a.z - pz;
				const wdist = Math.hypot(wdx, wdy, wdz) || 0.0001;
				const wsteps = Math.max(1, Math.ceil(wdist / 0.25));
				for (let s = 1; s <= wsteps; s++) {
					const t = s / wsteps;
					const wbx = Math.floor(px + wdx * t),
						wby = Math.floor(py + wdy * t),
						wbz = Math.floor(pz + wdz * t);
					if (isSolidBlock(world.getBlock(wbx, wby, wbz))) {
						burst = { x: px + wdx * t, y: py + wdy * t, z: pz + wdz * t };
						break;
					}
				}
			}
			if (burst) {
				windBurst(burst.x, burst.y, burst.z);
				continue; // se consume en el impacto
			}
			alive.push(a);
			continue;
		}
		// Gravedad: la flecha cae (la Y de los ojos es la de los pies + 1.4).
		a.vy -= ARROW_GRAVITY * dt;
		a.x += a.vx * dt;
		a.y += a.vy * dt;
		a.z += a.vz * dt;
		// Colisión con un jugador (distancia simple, sin raycast exacto). Se
		// comprueba ANTES que los bloques A PROPÓSITO: un impacto válido a 0.7
		// bloques gana a la pared en la que el jugador está de pie, y el test 6
		// de unit-mobs-ia depende de este orden (flecha estática sobre el
		// jugador con mock de bloques sólidos). Caso borde aceptado: un jugador
		// pegado a una pared y a <0.7 de la flecha podría recibir daño a través
		// de ella.
		// Fase 12: el daño puede ser por flecha (3) o tridente (6/8) y el
		// tridente del JUGADOR no daña a su propio lanzador (from = id de
		// jugador): el salto se hace para no auto-dañarse al lanzarlo. La
		// atribución del daño (source) distingue quién disparó: un tridente de
		// jugador cuenta como ataque de jugador, el del ahogado/esqueleto como
		// ataque de mob (la pantalla de muerte no culpa al "drowned" cuando el
		// atacante fue otro jugador).
		let hit = false;
		const lanzadorJugador = typeof a.from === "string" && players.has(a.from);
		for (const p of players.values()) {
			if (a.from === p.id) continue; // el lanzador no se golpea a sí mismo
			if (Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z) < ARROW_HIT_DIST) {
				const lanzador = players.get(a.from);
				// Fase 21.5 (D2): la flecha del Bogged envenena al impacto. El
				// estado `poisonUntil` lo integra tickPlayer (combat.js) con el
				// patrón del fuego: daño periódico y replicación al HUD con
				// `poison_state` (la viñeta verde). Funciona con cualquier flecha
				// que el servidor marque con poison (por ahora solo el Bogged).
				if (a.poison) {
					applyPoison(p, POISON_DURATION_MS);
				}
				damagePlayer(p, a.damage || ARROW_DAMAGE, {
					source: lanzador ? "player" : "mob",
					meta: lanzador
						? { playerName: lanzador.name, projectile: true }
						: {
								mobType: a.kind === "trident" ? "drowned" : "skeleton",
								projectile: true
							}
				});
				hit = true;
				break;
			}
		}
		// Fase 12 (A4/E8): los proyectiles también impactan en MOBS (no solo en
		// jugadores) — el tridente del jugador caza mientras que antes solo
		// calaba contra los jugadores. Reglas fieles al ataque a mano:
		//  - el PROYECTIL NO daña a su propio lanzador (si es un mob, a.from
		//    es su id; si es el jugador, ya se excluyó arriba);
		//  - las MASCOTAS del lanzador no reciben fuego amigo;
		//  - un slime que muere se divide (splitSlime) antes de desactivarse.
		if (!hit) {
			for (const m of state.mobs) {
				if (!m.alive) continue;
				// El lanzador no se daña a sí mismo (por ejemplo el ahogado que
				// arroja no se clava su propio tridente).
				if (a.from === m.id) continue;
				// Las mascotas del lanzador (si el lanzador es jugador) no sufren
				// el proyectil: no friendly-fire al lobo/gato aliado.
				if (lanzadorJugador && m.ownerId === a.from) continue;
				if (Math.hypot(m.x - a.x, m.y - a.y, m.z - a.z) < ARROW_HIT_DIST) {
					m.health -= a.damage || ARROW_DAMAGE;
					// B3 (auditoría 2026-08-11): el mob REACCIONA a ser flechado
					// por un jugador — hostil aggro al lanzador, pasivo huye. Igual
					// que al ser golpeado a mano; mobHit ya ignora a los creativos
					// (Fase 17, B6). Los proyectiles de mob (flecha de esqueleto,
					// tridente de ahogado) NO provocan reacción: los mobs no se
					// agreden entre sí (paridad MC).
					if (lanzadorJugador) m.mobHit(players.get(a.from));
					if (m.health <= 0) {
						// El slime se divide antes de morir (como en attack_mob).
						m.onDeath(); // C2: el slime se divide (hook por especie)
						m.alive = false;
						// Si el lanzador es un jugador que está conectado, recibe los
						// drops y la XP del mob (que es quien aprieta mejor que con la
						// mano: misma regla de recompensa de attack_mob en net.js).
						const lanzador = players.get(a.from);
						if (lanzador) {
							const drops = mobDropsFn(m);
							if (drops)
								for (const d of drops) addToInventory(lanzador, d.id, d.count);
							// auditoría §4.1: mobXp (slime 4/1 por tamaño, MC)
							addXp(lanzador, mobXpFn(m));
						}
					}
					hit = true;
					break;
				}
			}
		}
		// Colisión con bloques sólidos: barrido del segmento recorrido este tick
		// en pasos de ~0.25 bloques. Una pared de 1 bloque detiene la flecha
		// (antes la atravesaba y golpeaba a quien estuviera detrás).
		if (!hit) {
			const dx = a.x - px,
				dy = a.y - py,
				dz = a.z - pz;
			const dist = Math.hypot(dx, dy, dz) || 0.0001;
			const steps = Math.max(1, Math.ceil(dist / 0.25));
			for (let s = 1; s <= steps; s++) {
				const t = s / steps;
				const bx = Math.floor(px + dx * t);
				const by = Math.floor(py + dy * t);
				const bz = Math.floor(pz + dz * t);
				if (isSolidBlock(world.getBlock(bx, by, bz))) {
					hit = true;
					break;
				}
			}
		}
		// Fase 12: el tridente del jugador que impacta (o expira) vuelve a su
		// inventario (no hay entidades de item en el suelo en este clon).
		// Fase 13 (L1): las flechas del jugador también vuelven (recogibles).
		if (hit || a.life <= 0) {
			returnPlayerTrident(a);
			returnPlayerArrow(a);
		}
		if (!hit) alive.push(a);
	}
	state.arrows = alive;
	return alive;
}

function arrowSnapshot(a) {
	return {
		x: a.x,
		y: a.y,
		z: a.z,
		vx: a.vx,
		vy: a.vy,
		vz: a.vz,
		// Fase 12: kind distingue flecha de tridente para el dibujo del cliente.
		kind: a.kind || "arrow"
	};
}

module.exports = {
	ARROW_LIFE_MS,
	ARROW_SPEED,
	ARROW_GRAVITY,
	ARROW_DAMAGE,
	ARROW_HIT_DIST,
	TRIDENT_DAMAGE,
	TRIDENT_PLAYER_DAMAGE,
	TRIDENT_SPEED,
	WIND_SPEED, // Fase 21.5 (D5): carga de viento — constantes para tests
	WIND_LIFE_MS,
	WIND_HIT_DIST,
	WIND_BURST_RADIUS,
	shootArrow,
	shootPoisonArrow, // Fase 21.5 (D2): flecha que envenena (Bogged)
	shootTrident,
	throwPlayerTrident,
	returnPlayerTrident,
	shootPlayerArrow,
	returnPlayerArrow,
	throwWindCharge, // Fase 21.5 (D5)
	windBurst, // Fase 21.5 (D5): ráfaga que empuja (tests)
	tickArrows,
	arrowSnapshot,
	setMobDrops,
	setMobXp
};
