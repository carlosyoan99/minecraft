"use strict";

// ============================================================
// SUBCLASES POR ESPECIE (Fase 18, D-2)
// Extraído de mobs.js (C2: herencia por especie — Fase 13). Cada especie es
// una subclase de Mob cuyo tickSpecies delega en la IA propia (funciones
// planas de este módulo: tickZombie, tickSpider, tickPassive, ...). La clase
// base conserva el switch genérico SOLO para compatibilidad con `new
// Mob(tipo)` de los tests antiguos (unit-mobs-ia, unit-fase12, ...): el
// switch llama a estas mismas funciones.
//
// También viven aquí los helpers de interacción jugador↔mob (doma, sentar,
// cría, esquileo, mascotas que atacan con el dueño) y la IA de la abeja.
// mobs.js los re-exporta como fachadas para no cambiar los imports de los
// handlers (actions.js) ni de los tests.
//
// CICLOS: este módulo NO requiere mobs.js — recibe la clase base Mob como
// parámetro de createSpecies(Mob) y requiere state/world/projectiles/players
// directamente (ninguno de ellos requiere mobs.js ni este módulo).
// ============================================================
const constants = require("./constants.js");
const { I, isSolidBlock, HOSTILE, TICK_MS, BREED_FOOD } = constants;
// WebSocket global: p.ws.readyState (conexión abierta del jugador).
const WebSocket = require("ws");
const state = require("./state.js");
const world = require("./world.js");
const projectiles = require("./projectiles.js");
const { players } = state;
// Fase 21 (C1): la gallina pone huevos DIRECTOS al jugador cercano (no hay
// entidades de ítem en el suelo — decisión del proyecto). inventory.js no
// requiere este módulo (ni mobs.js), así que no hay ciclo.
const { addToInventory, sendInventory } = require("./inventory.js");

// Salud del slime por tamaño (Fase 12, A2): grande 16, mediano 4, pequeño 1.
const SLIME_HEALTH = { 2: 16, 1: 4, 0: 1 };

// Fábrica tipo→clase (asignada dentro de createSpecies; los helpers que
// crean mobs — splitSlime, applyFeed — la resuelven en runtime).
let createMob = () => null;
// Daño del slime por tamaño (MC real): grande 3, mediano 2, pequeño 0.
const SLIME_DAMAGE = { 2: 3, 1: 2, 0: 0 };

// ============================================================
// IA POR ESPECIE (funciones planas; reciben el mob como primer argumento)
// Los cuerpos se movieron de la clase base de mobs.js SIN reescribirlos:
// `this` → `mob`. La base y las subclases las llaman igual.
// ============================================================

function tickZombie(mob, isNight, nearest, dist) {
	// Notas del usuario: agresión diurna ampliada a la visión (16 bloques,
	// como MC) y aggro al ser golpeado — antes solo atacaba de día a <6.
	if (nearest && (isNight || dist < 16 || mob.isAggroed())) {
		mob.state = "chase";
		mob.chase(nearest, 0.035);
		// Auditoría 2026-08-09 (§3.7): daño "normal" de MC (2.5-3) no 2.
		if (dist < 1.6) mob.attack(nearest, 3, 1000);
	} else {
		mob.state = "idle";
		mob.wander();
	}
}

function tickSpider(mob, isNight, nearest, dist) {
	// Fase 5: hostil rápido y frágil; Fase 9: escala y salta. Notas del
	// usuario: aggro al ser golpeada (antes no reaccionaba).
	// Fase 21 (C3): NEUTRAL DE DÍA — como MC, la araña solo es hostil de
	// noche (o si la golpean: aggro). De día no ataca aunque esté cerca.
	const hostile = isNight || mob.isAggroed();
	if (nearest && hostile) {
		mob.state = "chase";
		mob.chase(nearest, 0.055);
		// Escalar: si el camino está bloqueado por un sólido y hay hueco
		// arriba, sube (simplificación: las arañas trepan muros de 1).
		const front = world.getBlock(
			Math.floor(mob.x + (nearest.x - mob.x) * 0.2),
			Math.floor(mob.y + 0.7),
			Math.floor(mob.z + (nearest.z - mob.z) * 0.2)
		);
		if (isSolidBlock(front)) {
			const up = world.getBlock(
				Math.floor(mob.x),
				Math.floor(mob.y + 1.8),
				Math.floor(mob.z)
			);
			if (!isSolidBlock(up)) mob.y += 0.08; // trepa el muro
		}
		// Salto de ataque: cerca del objetivo, salta sobre él.
		if (dist < 3 && Math.floor(mob.y) === Math.floor(nearest.y)) mob.y += 0.45;
		if (dist < 1.7) mob.attack(nearest, 2, 900);
	} else {
		mob.state = "idle";
		mob.wander();
	}
}

function tickWolf(mob, isNight, nearest, dist) {
	// Fase 5: hostil resistente de la noche; Fase 12: domable.
	// Lobo DOMADO (Fase 12, A1): sigue al dueño, se sienta con clic derecho y
	// no ataca al dueño (solo a su objetivo — petsJoinAttack). Si está
	// sentado no sigue ni ataca.
	if (mob.ownerId) {
		tickPet(mob, nearest, dist);
		return;
	}
	// Notas del usuario: aggro al ser golpeado (antes no reaccionaba).
	if (nearest && (isNight || dist < 16 || mob.isAggroed())) {
		mob.state = "chase";
		mob.chase(nearest, 0.04);
		if (dist < 1.8) mob.attack(nearest, 3, 1200);
	} else {
		mob.state = "idle";
		mob.wander();
	}
}

function tickCreeper(mob, _isNight, nearest, dist) {
	// Fase 12 (A3): el GATO domado espanta a los creepers — si hay un gato
	// aliado a ≤6 bloques, el creeper huye en vez de perseguir o explotar
	// (decisión E9 del spec).
	if (catNearby(mob.x, mob.z, 6)) {
		mob.fuseStart = null;
		mob.state = "flee";
		if (nearest)
			mob.moveToward(
				{ x: 2 * mob.x - nearest.x, z: 2 * mob.z - nearest.z },
				0.05
			);
		else mob.wander();
		return;
	}
	// Fase 9 (Bloque D): fuse fiel — se detiene, "silba" (~1.5s) y explota si
	// el jugador sigue cerca; si se aleja, cancela. Notas del usuario: aggro
	// al ser golpeado (antes no reaccionaba).
	if (nearest && (dist < 10 || mob.isAggroed())) {
		if (dist < 3) {
			mob.state = "fuse";
			if (!mob.fuseStart) mob.fuseStart = Date.now();
			if (Date.now() - mob.fuseStart >= 1500) {
				mob.fuseStart = null;
				mob.explode();
			}
		} else {
			mob.fuseStart = null;
			mob.state = "chase";
			mob.chase(nearest, 0.045);
		}
	} else {
		mob.fuseStart = null;
		mob.state = "idle";
		mob.wander();
	}
}

function tickSkeleton(mob, isNight, nearest, dist) {
	// Fase 9 (Bloque D): el esqueleto mantiene la distancia y dispara flechas
	// (proyectil con gravedad). No arde (en Minecraft el esqueleto tampoco
	// arde — solo el zombi); por eso se excluye de BURNS_IN_SUN en la Fase 9.
	// Notas del usuario: aggro al ser golpeado.
	// Fase 21 (C3): strafe lateral — en rango medio (6-12) se mueve en
	// perpendicular al jugador (raro para que sus flechas no peguen siempre),
	// en vez de quedarse quieto disparando. En rango corto retrocede y en
	// largo se acerca (comportamiento previo).
	if (nearest && (isNight || dist < 16 || mob.isAggroed())) {
		mob.state = "chase";
		if (dist < 6)
			mob.chase({ x: 2 * mob.x - nearest.x, z: 2 * mob.z - nearest.z }, 0.03);
		else if (dist > 12) mob.chase(nearest, 0.03);
		else {
			// Strafe lateral: perpendicular al vector que lo une al jugador.
			const dx = nearest.x - mob.x,
				dz = nearest.z - mob.z;
			const len = Math.hypot(dx, dz) || 1;
			// Perpendicular (+90°): (−dz, dx). El sentido alterna cada pocos
			// segundos (por-mob) para no quedar pegado girando en círculos.
			mob.strafeFlip = !mob.strafeFlip;
			const dir = mob.strafeFlip ? 1 : -1;
			mob.chase(
				{
					x: mob.x + (-dz / len) * dir,
					z: mob.z + (dx / len) * dir
				},
				0.025
			);
		}
		if (dist < 18 && Date.now() > mob.shootCooldown) {
			projectiles.shootArrow(mob, nearest);
			mob.shootCooldown = Date.now() + 2500;
		}
	} else {
		mob.state = "idle";
		mob.wander();
	}
}

// ============================================================
// ENDERMAN (neutral, Fase 21 C2): no agrede por proximidad ni de noche.
// Es NEUTRO: solo se vuelve hostil si (a) un jugador LO MIRA (los ojos del
// jugador en el hitbox del enderman — la mecánica de "mirarlo para
// provocarlo" de Minecraft, simplificada sin línea de bloqueo por rendimiento)
// o (b) es golpeado (aggro, Fase 18). Fuera de eso: levelo (deambula) y si
// lo están atacando o está agroadolo, se teletransporta y persigue al
// agresor con su ataque cuerpo a cuerpo. Sin recoger bloques (acotado en la
// spec F21 §5 P0).
// ============================================================
function isPlayerLookingAt(p, mob) {
	// Vector de mirada del jugador. El cliente envía p.yaw/p.pitch YA EN
	// RADIANES (camera.rotation.y/x de three, orden YXZ — verificado frente a
	// getWorldDirection): yaw=0 → -Z, yaw=+90° → -X, pitch>0 → mirar arriba.
	//   forward = (−sin yaw·cos pitch, sin pitch, −cos yaw·cos pitch)
	const yaw = p.yaw || 0;
	const pitch = p.pitch || 0;
	const dirX = -Math.sin(yaw) * Math.cos(pitch);
	const dirY = Math.sin(pitch);
	const dirZ = -Math.cos(yaw) * Math.cos(pitch);
	// Origen de la mirada: la cámara, que está EYE_HEIGHT sobre los pies del
	// jugador (p.y es la altura del OJO, no los pies — combat.js calcula feet
	// restando EYE_HEIGHT).
	const ex = p.x,
		ey = p.y,
		ez = p.z;
	// Punto más cercano de la LÍNEA de mirada al CENTRO del mob (su mitad,
	// ~1 bloque sobre su y — el enderman es alto, 2.5). Si la línea pasa a
	// < 1.5 bloques del centro (hitbox ~0.6×0.6×2.5 con tolerancia) y el
	// jugador NO mira en la dirección opuesta (producto punteado > 0), se
	// considera que lo mira. Alcance máximo de la mirada: 64 bloques.
	const dx = mob.x - ex,
		dy = mob.y + 1.0 - ey,
		dz = mob.z - ez;
	const along = dx * dirX + dy * dirY + dz * dirZ;
	if (along <= 0) return false;
	if (along > 64) return false;
	const px = ex + dirX * along,
		py = ey + dirY * along,
		pz = ez + dirZ * along;
	return Math.hypot(mob.x - px, mob.y + 1.0 - py, mob.z - pz) < 1.5;
}

// ¿Algún jugador está mirando este enderman? (lo provoca). Devuelve el
// jugador que lo mira (primero el que lo provoca) o null.
function isEndermanWatched(mob, state) {
	for (const p of state.players.values()) {
		if (!p || p.inMenu || p.ws.readyState !== WebSocket.OPEN) continue;
		if (p.gamemode === "creative") continue; // B6: sin aggro a creativos
		if (isPlayerLookingAt(p, mob)) return p;
	}
	return null;
}

function tickEnderman(mob, _isNight, nearest, dist) {
	// Neutralidad: mirar al enderman lo provoca (MC: se gira y gruñe antes de
	// atacar). En cuanto alguien lo mira dentro del radio, se vuelve hostil
	// contra ESO jugador (aggro). El golpe directo ya lo agreaba (Fase 18).
	if (!mob.isAggroed() && !mob.aggroTarget) {
		const watcher = isEndermanWatched(mob, state);
		if (watcher) {
			mob.aggroUntil = Date.now() + 20000; // ~20 s de hostilidad (MC prolonga)
			mob.aggroTarget = watcher.id;
		}
	}
	// Teletransporte (Fase 18): al acercarse o con aggro, salta a un punto
	// random alrededor del objetivo y lo persigue en estado chase.
	if (
		nearest &&
		(dist < 16 || mob.isAggroed()) &&
		Math.random() < 0.02 &&
		mob.teleportCooldown < Date.now()
	) {
		const angle = Math.random() * Math.PI * 2,
			radius = 2 + Math.random() * 3;
		mob.x = nearest.x + Math.cos(angle) * radius;
		mob.z = nearest.z + Math.sin(angle) * radius;
		mob.y = world.getHeight(Math.floor(mob.x), Math.floor(mob.z)) + 1;
		mob.teleportCooldown = Date.now() + 3000;
		mob.state = "chase";
	} else if (nearest && dist < 2.5 && mob.isAggroed()) {
		// Auditoría 2026-08-09 (§3.7): enderman 7 (MC Java normal), antes 4.
		mob.attack(nearest, 7, 1500);
	} else if (nearest && dist < 16 && !mob.isAggroed()) {
		// Sin aggro: el enderman SE QUEDA mirando al jugador de lejos (levelo)
		// en vez de perseguir (MC: solo ataca si lo provocan). No ataca ni se
		// acerca: nivel de amenaza cero hasta la provocación.
		mob.state = "idle";
		mob.wander();
	} else {
		mob.state = "idle";
		mob.wander();
	}
}

// ============================================================
// PASAVOS (Fase 9, Bloque D): huir al ser golpeados, deambular más natural
// (con pausas y pastar), volver al rebaño (homeX/homeZ) y dormir de noche
// (se agrupan y se quedan quietos — estético).
// ============================================================
function tickPassive(mob, isNight) {
	// Dormir de noche: se agrupan en el punto medio del rebaño y se quedan
	// quietos (estado 'sleep'); de día vuelven a su vida normal.
	if (isNight) {
		if (mob.state !== "sleep") {
			// Grupo: media de las posiciones de los pasivos cercanos (rebaño).
			let gx = mob.homeX,
				gz = mob.homeZ,
				n = 1;
			for (const m of state.mobs) {
				if (m.alive && !HOSTILE.has(m.type) && m.id !== mob.id) {
					if (Math.hypot(m.x - mob.x, m.z - mob.z) < 12) {
						gx += m.x;
						gz += m.z;
						n++;
					}
				}
			}
			mob.sleepTarget = { x: gx / n, z: gz / n };
			mob.state = "sleep";
		}
		// Acercarse lentamente al grupo y quedarse quieto al llegar.
		const t = mob.sleepTarget || { x: mob.homeX, z: mob.homeZ };
		if (Math.hypot(t.x - mob.x, t.z - mob.z) > 1.2) {
			mob.moveToward(t, 0.02);
		} else {
			mob.settleOnGround();
		}
		return;
	}
	mob.sleepTarget = null;
	// Huir al ser golpeado (mobHit lo activa): correr en dirección contraria.
	if (Date.now() < mob.fleeUntil && mob.fleeFrom) {
		mob.state = "flee";
		mob.moveToward({ x: mob.fleeFrom.x, z: mob.fleeFrom.z }, 0.045);
		return;
	}
	// Volver al rebaño si se alejaron demasiado del punto de origen.
	const homeDist = Math.hypot(mob.x - mob.homeX, mob.z - mob.homeZ);
	if (homeDist > 24) {
		mob.state = "home";
		mob.moveToward({ x: mob.homeX, z: mob.homeZ }, 0.03);
		return;
	}
	// Deambular natural: pausas aleatorias y pastar de vez en cuando.
	if (Date.now() < mob.wanderPauseUntil) {
		mob.state = "graze";
		mob.settleOnGround();
		return;
	}
	if (Math.random() < 0.008) {
		// Pausa de 0.5-2s o pastar (1-2s).
		mob.wanderPauseUntil = Date.now() + 500 + Math.random() * 1500;
		mob.state = Math.random() < 0.5 ? "graze" : "idle";
	} else {
		mob.state = "idle";
		mob.wander();
	}
}

// Gallina (Fase 21, C1): además del pasivo genérico (tickPassive), pone
// huevos periódicamente. Como el juego no tiene entidades de ítem en el
// suelo (decisión de diseño documentada en tnt.js), el huevo va DIRECTA al
// inventario del jugador más cercano que esté a ≤ CHICKEN_EGG_RANGE bloques
// (cooldown aleatorio por gallina: 5-10 min de juego, paridad MC de la nota
// del usuario). Si no hay ningún jugador cerca no se entrega y el cooldown
// sigue corriendo (el próximo tick cercano lo recoge).
const CHICKEN_EGG_INTERVAL = [5, 10]; // minutos, extremos del intervalo
const CHICKEN_EGG_RANGE = 6; // bloques: jugador necesita estar cerca
function tickChicken(mob, isNight) {
	if (Date.now() >= (mob.nextEggAt || 0)) {
		// Próxima puesta: 5-10 min desde AHORA (el cooldown comienza ya; si hay
		// un jugador cerca en el próximo tick se entrega enseguida).
		mob.nextEggAt =
			Date.now() +
			(CHICKEN_EGG_INTERVAL[0] +
				Math.random() * (CHICKEN_EGG_INTERVAL[1] - CHICKEN_EGG_INTERVAL[0])) *
				60000;
		// Entregar 1 huevo al jugador (survival) más cercano dentro del radio.
		let best = null,
			bestD = CHICKEN_EGG_RANGE;
		for (const p of players.values()) {
			if (p.inMenu) continue;
			const d = Math.hypot(p.x - mob.x, p.z - mob.z);
			if (d <= bestD) {
				bestD = d;
				best = p;
			}
		}
		if (best && addToInventory(best, I.EGG, 1)) sendInventory(best);
	}
	tickPassive(mob, isNight);
}

// Ocelote (A3): pasivo huidizo — corre en dirección contraria al jugador
// cuando este está a ≤8 bloques (radio mayor que el susto de los pasivos
// genéricos, prioridad alta). De noche deambula igual.
function tickOcelot(mob, _isNight, nearest, dist) {
	if (nearest && dist <= 8) {
		mob.state = "flee";
		mob.moveToward(
			{ x: 2 * mob.x - nearest.x, z: 2 * mob.z - nearest.z },
			0.06 // más rápido que deambular (huida)
		);
		return;
	}
	mob.state = "idle";
	mob.wander();
}

// Gato (ocelote domado, A3): sigue al dueño y no ataca. Si está sentado, se
// queda quieto. Si el dueño se desconecta, deambula (al reconectar, el
// follow se restaura en la Fase 12 D con ownerName persistido).
function tickCat(mob, _nearest, _dist) {
	if (mob.sitting) {
		mob.state = "sit";
		mob.settleOnGround();
		return;
	}
	const owner = mob.ownerId ? players.get(mob.ownerId) : null;
	if (owner) {
		const od = mob.distTo(owner);
		mob.state = "follow";
		// Seguir al dueño: acercarse hasta ~2 bloques y quedarse.
		if (od > 2.5) mob.moveToward(owner, 0.05);
		else mob.settleOnGround();
		return;
	}
	mob.state = "idle";
	mob.wander();
}

// Mascota genérica (lobo domado A1 / gato A3): sigue al dueño; si está
// sentada, no sigue ni ataca. El ataque al objetivo del dueño lo dispara el
// handler attack_mob (petsJoinAttack) — aquí solo el seguimiento.
function tickPet(mob, _nearest, _dist) {
	if (mob.sitting) {
		mob.state = "sit";
		mob.settleOnGround();
		return;
	}
	const owner = mob.ownerId ? players.get(mob.ownerId) : null;
	if (owner) {
		const od = mob.distTo(owner);
		mob.state = "follow";
		if (od > 3) mob.moveToward(owner, 0.05);
		else mob.settleOnGround();
		return;
	}
	mob.state = "idle";
	mob.wander();
}

// Slime (A2): salta en vez de caminar. Ciclo de salto simple con "gravedad"
// (sube y cae), avanza hacia el jugador en el aire y ataca por tamaño
// (3/2/0). No sufre daño de caída (los mobs no tienen daño de caída en este
// clon — verify: no hay applyFallDamage para mobs).
function tickSlime(mob, _isNight, nearest, dist) {
	// Salto: fase periódica POR-MOB y determinista (Fase 12, A4/auditoría) —
	// un contador propio avanza con TICK_MS fijo y un offset derivado del id
	// separa las fases entre slimes. Antes se usaba Date.now()%1200 (fase
	// global): todos saltaban al unísono y el movimiento dependía del reloj.
	mob.slimeHopAccum = (mob.slimeHopAccum + TICK_MS) % 1200;
	const hopPhase = ((mob.slimeHopAccum + mob.slimeHopPhase) % 1200) / 1200; // 0..1 cada 1.2s
	if (!mob.slimeHopY) mob.slimeHopY = mob.y;
	// Altura del salto: parábola de hop (0..0.5 bloques sobre el suelo).
	const hop = Math.sin(hopPhase * Math.PI) * 0.5;
	// Suelo real: getHeight de la columna (el slime salta sobre el terreno).
	const groundY = world.getHeight(Math.floor(mob.x), Math.floor(mob.z)) + 1;
	mob.y = groundY + hop;
	// Notas del usuario: aggro al ser golpeado (antes no reaccionaba).
	if (nearest && (dist < 10 || mob.isAggroed())) {
		// Avanzar hacia el jugador (movimiento horizontal en el aire).
		const dx = nearest.x - mob.x,
			dz = nearest.z - mob.z;
		const len = Math.hypot(dx, dz);
		if (len > 0.4) {
			mob.x += (dx / len) * 0.05;
			mob.z += (dz / len) * 0.05;
		}
		mob.state = "chase";
		// Daño por tamaño (MC real): grande 3, mediano 2, pequeño 0.
		const dmg = SLIME_DAMAGE[mob.slimeSize] || 0;
		if (dist < 1.8 && dmg > 0) mob.attack(nearest, dmg, 1000);
	} else {
		// Deambular saltando (sin jugador cerca o de día en superficie).
		mob.wander();
		mob.state = "idle";
	}
}

// Ahogado (A4): nada hacia el jugador en 3D (mantiene la profundidad del
// agua, sube/baja según la posición del objetivo), ataca cuerpo a cuerpo a
// ≤1.5 y lanza tridentes con cooldown (~3s) si el jugador está a 4-14
// bloques (~50% por intento). No se ahoga (no hay sistema de ahogo de mobs)
// y no arde (no está en BURNS_IN_SUN).
function tickDrowned(mob, _isNight, nearest, dist) {
	// Notas del usuario: aggro al ser golpeado (antes no reaccionaba).
	if (nearest && (dist < 16 || mob.isAggroed())) {
		mob.state = "chase";
		// Nadar: moverse en 3D hacia el jugador — horizontal igual que el
		// resto de hostiles, vertical hacia la profundidad del objetivo (sin
		// salirse del agua: techo en WORLD_SEA_LEVEL − 1 = −4, y suelo en el
		// lecho de su columna — Fase 15 D5: antes usaba SEA_LEVEL de DISEÑO
		// (5) como Y de MUNDO y flotaba en el aire sobre el agua).
		mob.chase(nearest, 0.04);
		const bedWy =
			(world.columnFloorY(Math.floor(mob.x), Math.floor(mob.z)) ?? 1) -
			world.DESIGN_OFFSET;
		const targetY = Math.min(
			Math.max(bedWy + 1, nearest.y - 1.5),
			world.WORLD_SEA_LEVEL - 1
		);
		if (Math.abs(mob.y - targetY) > 0.5) {
			mob.y += Math.sign(targetY - mob.y) * 0.04;
		}
		if (dist < 1.5) mob.attack(nearest, 3, 1200);
		// Tridente arrojadizo: cooldown ~3s y ~50% de intentar si el jugador
		// está a 4-14 bloques (E4).
		if (
			dist >= 4 &&
			dist <= 14 &&
			Date.now() > mob.shootCooldown &&
			Math.random() < 0.5
		) {
			projectiles.shootTrident(mob, nearest);
			mob.shootCooldown = Date.now() + 3000;
		}
	} else {
		mob.state = "idle";
		mob.wander();
	}
}

// ============================================================
// HELPERS DE INTERACCIÓN JUGADOR↔MOB (movidos de mobs.js)
// ============================================================

// ¿Hay un gato DOMADO (ocelote domesticado con dueño) a ≤radius del punto?
// El gato espanta a los creepers (A3, E9): a 6 bloques, el creeper entra en
// huida en vez de perseguir/explosionar.
function catNearby(x, z, radius = 6) {
	for (const m of state.mobs) {
		if (!m.alive || m.type !== "cat" || !m.ownerId) continue;
		if (Math.hypot(m.x - x, m.z - z) <= radius) return true;
	}
	return false;
}

// División del slime al morir (A2, E2): grande (2) → 2 medianos (1) → 2
// pequeños (0); el pequeño no divide. Los hijos se crean desplazados ±1
// bloque en X (si el suelo lo permite) y con la salud de su tamaño.
function splitSlime(mob) {
	const kids = [];
	if (mob.type !== "slime" || mob.slimeSize <= 0 || !mob.alive) return kids;
	const childSize = mob.slimeSize - 1;
	for (const dir of [-1, 1]) {
		const nx = mob.x + dir;
		const groundY = world.getHeight(Math.floor(nx), Math.floor(mob.z));
		// Solo si la celda de destino no está bloqueada por un sólido.
		if (
			isSolidBlock(
				world.getBlock(Math.floor(nx), groundY + 1, Math.floor(mob.z))
			)
		)
			continue;
		const child = createMob("slime", nx, groundY + 1.05, mob.z);
		child.slimeSize = childSize;
		child.health = SLIME_HEALTH[childSize];
		state.mobs.push(child);
		kids.push(child);
	}
	return kids;
}

// ¿Se puede domesticar a este mob con el ítem? 'ok' o el motivo del rechazo
// (A1/E1 lobo con hueso; A3/E3 ocelote con pescado crudo).
function canTame(mob, itemId) {
	if (mob.ownerId) return "owned";
	if (mob.type === "wolf") return itemId === I.BONE ? "ok" : "wrongfood";
	if (mob.type === "ocelot") return itemId === I.COD ? "ok" : "wrongfood";
	return "notameable";
}

// Intenta domesticar: probabilidad ~33% por ítem (MC real). En éxito, el
// ocelote se vuelve gato (type "cat", textura propia) y ambos reciben
// ownerId/ownerName. Devuelve true/false (el consumo del ítem y los
// corazones los gestiona el handler).
function applyTame(mob, player) {
	if (Math.random() >= 1 / 3) return false;
	mob.ownerId = player.id;
	mob.ownerName = player.name;
	if (mob.type === "ocelot") mob.type = "cat";
	return true;
}

// Alterna el estado sentado de una mascota (clic derecho con la mano vacía).
// Devuelve el nuevo estado (el handler valida propiedad y distancia).
function sitPet(mob) {
	mob.sitting = !mob.sitting;
	return mob.sitting;
}

// Las mascotas del jugador se unen a su ataque (A1/E10): cuando el dueño
// ataca a un mob, los lobos domados con ownerId y a ≤12 bloques del objetivo
// golpean también (daño 3, como el lobo hostil). Devuelve cuántos golpearon.
function petsJoinAttack(target, player) {
	let n = 0;
	for (const m of state.mobs) {
		if (!m.alive || m.ownerId !== player.id || m.sitting) continue;
		if (m.type !== "wolf") continue; // solo los lobos atacan (el gato no)
		// Distancia 3D: un lobo a 12 bloques lateralmente pero muy por debajo
		// (cueva) no debe "golpear" a través del terreno (revisión Fase 12).
		if (Math.hypot(m.x - target.x, m.y - target.y, m.z - target.z) > 12)
			continue;
		target.health -= 3;
		n++;
	}
	return n;
}

// ============================================================
// CRÍA DE ANIMALES (Fase 3): dar item → modo amor → pareja → bebé
// ============================================================
const LOVE_WINDOW_MS = 30000; // el modo amor dura 30s buscando pareja
const BREED_COOLDOWN_MS = 60000; // cooldown de cría tras criar (60s)
const BREED_RANGE = 8; // distancia máxima entre la pareja (bloques)
const _GROWUP_MS = 60000; // un bebé tarda 60s en hacerse adulto

// ¿Se puede alimentar a este mob con el ítem? 'ok' o el motivo del rechazo.
function canFeed(mob, itemId) {
	if (mob.isBaby) return "baby";
	if (Date.now() < mob.cooldownUntil) return "cooldown";
	if (BREED_FOOD[mob.type] !== itemId) return "wrongfood";
	return "ok";
}

// ============================================================
// ESQUILEO (Fase 11, C): tijeras + clic derecho → lana sin matar
// La oveja queda esquilada (no se puede repetir hasta que le crece el
// pelo: SHEAR_REGROW_MS) y suelta 1-3 de lana blanca (la oveja base es
// blanca; el tinte de ovejas queda fuera del alcance de la Fase 11).
// ============================================================
const SHEARS_ITEM = 141; // constants.I.SHEARS (evitar require circular)
const SHEAR_REGROW_MS = 120000; // 2 min para que el pelo vuelva a crecer
const SHEAR_RANGE = 4; // distancia máxima para esquilar (bloques)

// ¿Se puede esquilar a este mob con el ítem? 'ok' o el motivo del rechazo.
function canShear(mob, itemId) {
	if (mob.type !== "sheep") return "notsheep";
	if (mob.isBaby) return "baby";
	if (!mob.alive) return "dead";
	if (itemId !== SHEARS_ITEM) return "wrongitem";
	if (mob.shearedUntil && mob.shearedUntil > Date.now()) return "sheared";
	return "ok";
}

// Esquilar: marca el momento en que volverá a crecer y devuelve cuánta lana
// (1-3) se añade al inventario del jugador (la entrega la hace el handler).
function applyShear(mob) {
	mob.shearedUntil = Date.now() + SHEAR_REGROW_MS;
	return {
		count: 1 + Math.floor(Math.random() * 3),
		woolId: mob.woolColor || constants.B.WHITE_WOOL
	};
}

// Alimentar al mob: entra en modo amor y busca pareja del mismo tipo ya
// alimentada cerca. Si la encuentra, cría un bebé entre ambos (los padres
// entran en cooldown) y lo devuelve; si no, espera hasta LOVE_WINDOW_MS.
function applyFeed(mob, mobs) {
	mob.loveUntil = Date.now() + LOVE_WINDOW_MS;
	const partner = mobs.find(
		(m) =>
			m.id !== mob.id &&
			m.alive &&
			!m.isBaby &&
			m.type === mob.type &&
			m.loveUntil > Date.now() &&
			Math.hypot(m.x - mob.x, m.z - mob.z) < BREED_RANGE
	);
	// Auditoría 2026-08-15 (M2): la cría respeta la MISMA cuota global de
	// mobs que el spawn natural (MOB_CAP = 30). Antes solo el spawn la
	// consultaba: un jugador alimentando podía multiplicar los animales sin
	// tope (memoria + persistencia del meta engordando). Si la cuota está
	// llena, los padres entran en cooldown y no se crea el bebé.
	if (state.mobs.length >= 30) {
		mob.loveUntil = 0;
		return null;
	}
	if (!partner) return null;
	mob.loveUntil = 0;
	partner.loveUntil = 0;
	mob.cooldownUntil = Date.now() + BREED_COOLDOWN_MS;
	partner.cooldownUntil = Date.now() + BREED_COOLDOWN_MS;
	const baby = createMob(
		mob.type,
		(mob.x + partner.x) / 2,
		Math.min(mob.y, partner.y),
		(mob.z + partner.z) / 2
	);
	baby.isBaby = true;
	baby.age = 0;
	// Fase 21.5 (E2): el cordero hereda la lana del color de uno de los
	// padres al azar (simplificación de la mezcla de colores de MC).
	if (mob.type === "sheep") {
		baby.woolColor =
			Math.random() < 0.5
				? mob.woolColor || constants.B.WHITE_WOOL
				: partner.woolColor || constants.B.WHITE_WOOL;
	}
	// Fase 21.5 (E1): la cría de cerdo/vaca/gallina hereda la variante
	// (frío/cálido/templado) de uno de los padres al azar, como la lana.
	if (mob.type === "cow" || mob.type === "pig" || mob.type === "chicken") {
		baby.variant =
			Math.random() < 0.5 ? mob.variant || "" : partner.variant || "";
	}
	state.mobs.push(baby);
	return baby;
}

// ============================================================
// ABEJAS (Fase 9, Bloque F — versión simplificada)
// Pasivo volador pequeño: deambula en 3D alrededor de su origen (homeY en
// el aire) con oscilación suave, como una abeja posándose. No se cría ni
// suelta miel al morir (la miel llega como botín de cofres — simplificación
// documentada en fase9-spec.md §F1).
// ============================================================
function tickBee(mob) {
	// Órbita sencilla alrededor del origen (en el aire), con rebote suave.
	const angle = (Date.now() / 1200 + mob.id.length) % (Math.PI * 2);
	const radius = 3 + Math.sin(angle * 0.7) * 2;
	const tx = mob.homeX + Math.cos(angle) * radius;
	const tz = mob.homeZ + Math.sin(angle) * radius;
	const ty = (mob.homeY ?? mob.y) + Math.sin(angle * 2) * 1.5;
	mob.x += (tx - mob.x) * 0.01;
	mob.z += (tz - mob.z) * 0.01;
	mob.y += (ty - mob.y) * 0.01;
	mob.state = "fly";
}

// ============================================================
// DROPS DE COMIDA DE ANIMALES (Fase 3)
// Al morir, los pasivos sueltan su comida cruda (rango aleatorio, estilo
// Minecraft). Los hostiles no dropean nada por ahora. Fase 18 (D-2): movido
// de mobs.js junto al resto de lo "por especie".
// ============================================================
const FOOD_DROPS = {
	cow: { id: I.BEEF, min: 1, max: 3 },
	pig: { id: I.PORKCHOP, min: 1, max: 3 },
	chicken: { id: I.CHICKEN, min: 1, max: 2 },
	sheep: { id: I.MUTTON, min: 1, max: 2 },
	rabbit: { id: I.RABBIT, min: 1, max: 2 } // Fase 5: nuevo pasivo
};
// Drops no comestibles (Fase 5): la araña suelta hilo (para lana); la vaca y
// el conejo sueltan cuero (material de la armadura de cuero, Fase 7).
// Fase 9 (Bloque D/F): el esqueleto suelta huesos (→ harina de hueso).
const OTHER_DROPS = {
	spider: { id: I.STRING, min: 0, max: 2 },
	cow: { id: I.LEATHER, min: 0, max: 2 },
	rabbit: { id: I.LEATHER, min: 0, max: 1 },
	skeleton: [
		{ id: I.BONE, min: 0, max: 2 },
		// Fase 13 (L1): el esqueleto también suelta flechas (0-2, como MC).
		{ id: I.ARROW, min: 0, max: 2 }
	],
	// Fase 13 (L1): el pollo suelta plumas (material de las flechas, como MC).
	chicken: { id: I.FEATHER, min: 0, max: 2 },
	// Fase 12 (Bloque A): slime → slimeball (0-1, solo el pequeño lo suelta)
	// y ahogado → tridente (~15%, roll explícito en mobDrops — la tabla
	// 0..1 daría 50%).
	slime: { id: I.SLIME_BALL, min: 0, max: 1 },
	drowned: { id: I.TRIDENT, min: 0, max: 1 },
	// Fase 16 (D2): paridad MC — el zombi suelta carne podrida (0-2) y el
	// creeper pólvora (0-2, material de la receta de TNT).
	// Fase 18 (C-3): el zombi suelta además patata ~2,5 % (paridad MC — en MC
	// los zombis dropean zanahorias/patatas raramente; aquí solo patata).
	zombie: [
		{ id: I.ROTTEN_FLESH, min: 0, max: 2 },
		{ id: I.POTATO, min: 1, max: 1, chance: 0.025 }
	],
	creeper: { id: I.GUNPOWDER, min: 0, max: 2 }
};

// Devuelve [{ id, count }] para el tipo o null si no dropea nada. Un mob
// puede soltar comida Y su drop secundario (vaca: carne + cuero, como en
// Minecraft). Los bebés no sueltan nada.
function mobDrops(mob) {
	if (mob.isBaby) return null;
	// Fase 12 (A2): solo el slime PEQUEÑO suelta slimeball (el grande y el
	// mediano se dividen, no dropean — como Minecraft).
	if (mob.type === "slime" && mob.slimeSize !== 0) return null;
	const drops = [];
	// Fase 13 (L1): OTHER_DROPS puede ser una tabla única o un ARRAY de
	// tablas (el esqueleto suelta huesos Y flechas) — se normaliza aquí.
	const tables = [
		FOOD_DROPS[mob.type],
		...(Array.isArray(OTHER_DROPS[mob.type])
			? OTHER_DROPS[mob.type]
			: [OTHER_DROPS[mob.type]])
	];
	for (const table of tables) {
		if (!table) continue;
		// Fase 12 (A4): el tridente del ahogado cae ~15% (roll explícito; el
		// rango 0..1 de la tabla daría 50%).
		if (table.id === I.TRIDENT && Math.random() >= 0.15) continue;
		// Fase 18 (C-3): drops con probabilidad (chance) — patata del zombi 2,5%.
		if (table.chance != null && Math.random() >= table.chance) continue;
		const count =
			table.min + Math.floor(Math.random() * (table.max - table.min + 1));
		if (count > 0) drops.push({ id: table.id, count });
	}
	return drops.length ? drops : null;
}

// ============================================================
// SUBCLASES POR ESPECIE + FÁBRICA
// ============================================================
function createSpecies(Mob) {
	class Zombie extends Mob {
		constructor(x, y, z) {
			super("zombie", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickZombie(this, isNight, nearest, dist);
		}
	}

	class Spider extends Mob {
		constructor(x, y, z) {
			super("spider", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickSpider(this, isNight, nearest, dist);
		}
	}

	class Wolf extends Mob {
		constructor(x, y, z) {
			super("wolf", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickWolf(this, isNight, nearest, dist);
		}
	}

	class Slime extends Mob {
		constructor(x, y, z) {
			super("slime", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickSlime(this, isNight, nearest, dist);
		}
		// Al morir se divide (grande → 2 medianos → 2 pequeños); el hook evita
		// que los llamadores repitan el `if (type === "slime") splitSlime(...)`.
		onDeath() {
			if (this.alive) splitSlime(this);
		}
	}

	class Drowned extends Mob {
		constructor(x, y, z) {
			super("drowned", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickDrowned(this, isNight, nearest, dist);
		}
	}

	class Creeper extends Mob {
		constructor(x, y, z) {
			super("creeper", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickCreeper(this, isNight, nearest, dist);
		}
	}

	class Skeleton extends Mob {
		constructor(x, y, z) {
			super("skeleton", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickSkeleton(this, isNight, nearest, dist);
		}
	}

	class Enderman extends Mob {
		constructor(x, y, z) {
			super("enderman", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			tickEnderman(this, isNight, nearest, dist);
		}
	}

	// Pasivos: el genérico tickPassive (huida/rebaño/sueño) es el común; el
	// ocelote y la abeja conservan su IA propia. El gato domado usa la clase
	// Ocelot con type "cat" (applyTame lo cambia en runtime, como MC).
	class Cow extends Mob {
		constructor(x, y, z) {
			super("cow", x, y, z);
		}
		tickSpecies(isNight) {
			tickPassive(this, isNight);
		}
	}

	class Pig extends Mob {
		constructor(x, y, z) {
			super("pig", x, y, z);
		}
		tickSpecies(isNight) {
			tickPassive(this, isNight);
		}
	}

	class Chicken extends Mob {
		constructor(x, y, z) {
			super("chicken", x, y, z);
			// Fase 21 (C1): próxima puesta de huevo (timestamp) — runtime, no se
			// persiste (al recargar se repone con el intervalo aleatorio).
			this.nextEggAt = 0;
		}
		tickSpecies(isNight) {
			tickChicken(this, isNight);
		}
	}

	class Sheep extends Mob {
		constructor(x, y, z) {
			super("sheep", x, y, z);
		}
		tickSpecies(isNight) {
			tickPassive(this, isNight);
		}
	}

	class Rabbit extends Mob {
		constructor(x, y, z) {
			super("rabbit", x, y, z);
		}
		tickSpecies(isNight) {
			tickPassive(this, isNight);
		}
	}

	class Bee extends Mob {
		constructor(x, y, z) {
			super("bee", x, y, z);
		}
		tickSpecies() {
			tickBee(this);
		}
	}

	class Ocelot extends Mob {
		constructor(x, y, z) {
			super("ocelot", x, y, z);
		}
		tickSpecies(isNight, nearest, dist) {
			// Domado → type "cat" (runtime, ver applyTame): el gato usa tickCat.
			if (this.type === "cat") tickCat(this, nearest, dist);
			else tickOcelot(this, isNight, nearest, dist);
		}
	}

	// Registro tipo → clase (C2): createMob elige aquí. Los tipos sin clase
	// (p. ej. "cat" solo existe como type runtime de Ocelot) caen en Mob base.
	const MOB_CLASSES = {
		zombie: Zombie,
		spider: Spider,
		wolf: Wolf,
		slime: Slime,
		drowned: Drowned,
		creeper: Creeper,
		skeleton: Skeleton,
		enderman: Enderman,
		cow: Cow,
		pig: Pig,
		chicken: Chicken,
		sheep: Sheep,
		rabbit: Rabbit,
		bee: Bee,
		ocelot: Ocelot
	};

	// Crea un mob de la clase correcta según el tipo (fábrica tipo→clase).
	// Se asigna a la variable de MÓDULO (createMob) para que splitSlime y
	// applyFeed (helpers del módulo) puedan crear hijos/bebés sin que la
	// fábrica los reciba como parámetros.
	createMob = (type, x, y, z) => {
		const Cls = MOB_CLASSES[type];
		return Cls ? new Cls(x, y, z) : new Mob(type, x, y, z);
	};

	return {
		Zombie,
		Spider,
		Wolf,
		Slime,
		Drowned,
		Creeper,
		Skeleton,
		Enderman,
		Cow,
		Pig,
		Chicken,
		Sheep,
		Rabbit,
		Bee,
		Ocelot,
		MOB_CLASSES,
		createMob,
		// Helpers de interacción (fachada: mobs.js los re-exporta).
		catNearby,
		splitSlime,
		canTame,
		applyTame,
		sitPet,
		petsJoinAttack,
		canFeed,
		applyFeed,
		canShear,
		applyShear,
		SHEAR_RANGE,
		tickBee,
		tickZombie,
		tickSpider,
		tickWolf,
		tickCreeper,
		tickSkeleton,
		tickEnderman,
		tickPassive,
		tickChicken,
		tickOcelot,
		tickCat,
		tickPet,
		tickSlime,
		tickDrowned,
		isPlayerLookingAt,
		isEndermanWatched,
		SLIME_HEALTH,
		SLIME_DAMAGE,
		mobDrops
	};
}

module.exports = { createSpecies };
