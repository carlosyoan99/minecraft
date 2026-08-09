"use strict";

// ============================================================
// IA DE MOBS
// ============================================================
const { v4: uuidv4 } = require("uuid");
const {
	CHUNK_SIZE,
	MOB_COLORS,
	HOSTILE,
	BURNS_IN_SUN,
	B,
	I,
	TICK_MS,
	BREED_FOOD,
	isSolidBlock,
	NOT_MINEABLE,
	WORLD_HEIGHT,
	MOB_XP, // Fase 12 (A4): XP del mob asesinado con un proyectil
	TNT_DAMAGE, // Fase 14 (Bloque B): el creeper explota con el daño del TNT
	BOW_DAMAGE, // Fase 13 (L1): daño de la flecha del jugador (9, paridad MC)
	worldPaths
} = require("./constants.js");

// Auditoría 2026-08-09 (§4.1): XP real del mob al morir. El slime grande (2)
// da 4 XP y el mediano/pequeño 1 (MC); el resto usa MOB_XP[type]. Antes todo
// slime daba MOB_XP.slime=1.
function mobXp(m) {
	if (m.type === "slime") return m.slimeSize === 2 ? 4 : 1;
	return MOB_XP[m.type] || 0;
}

// ============================================================
// ZONA SEGURA DEL SPAWN (Fase 8, B2)
// Radio alrededor del punto de aparición del mundo en el que los hostiles
// NO spawnean ni targetean a los jugadores: el recién llegado no muere sin
// defensa (diagnóstico B2: hostiles a <40 bloques del spawn, un zombi a 3).
// Al salir del radio, el jugador vuelve a ser objetivo normal.
// 0 desactiva la zona (lo usan los tests de IA pura). El centro es
// findSpawn(0,0), determinista por semilla: se cachea y se invalida al
// cambiar de mundo (set_seed cambia worldPaths.currentSeed).
// ============================================================
let spawnSafeRadius = 32;
let safeSpawnCache = { seed: null, x: 0, z: 0 };

function getSafeSpawn() {
	if (safeSpawnCache.seed !== worldPaths.currentSeed) {
		const s = world.findSpawn(0, 0);
		safeSpawnCache = { seed: worldPaths.currentSeed, x: s.x, z: s.z };
	}
	return safeSpawnCache;
}

function setSpawnSafeRadius(r) {
	spawnSafeRadius = r;
}

// Salud por tipo (por defecto: hostiles 20, pasivos 10); la araña es frágil
// pero rápida, el lobo es un hostil más resistente. Fase 14 (Bloque B):
// paridad real de MC — araña 16, abeja 10, enderman 40.
const MOB_HEALTH = {
	spider: 16,
	wolf: 20,
	zombie: 20,
	creeper: 20,
	skeleton: 20,
	enderman: 40,
	bee: 10, // Fase 9 (Bloque F): pasivo volador (versión simplificada)
	// Fase 12 (Bloque A): mobs por bioma. El slime usa SLIME_HEALTH por tamaño
	// (16/4/1); el valor base es el del grande y splitSlime re-ajusta la salud.
	slime: 16,
	ocelot: 10,
	cat: 10,
	drowned: 20,
	// Auditoría 2026-08-09 (§3.8): salud de pasivos según MC Java — pollo 4,
	// oveja 8 (antes caían al default 10; no lo fijaban los tests).
	chicken: 4,
	sheep: 8
};
// Salud del slime por tamaño (Fase 12, A2): grande 16, mediano 4, pequeño 1.
const SLIME_HEALTH = { 2: 16, 1: 4, 0: 1 };
// Daño del slime por tamaño (MC real): grande 3, mediano 2, pequeño 0.
const SLIME_DAMAGE = { 2: 3, 1: 2, 0: 0 };
const state = require("./state.js");
const world = require("./world.js");
// Fase 12 (Bloque A): addToInventory/removeFromInventory — el tridente del
// jugador se retira al lanzarlo y vuelve al inventario al impactar/expirar
// (simplificación de "recogerlo del suelo": no hay entidades de item en el
// suelo en este clon). players.js no importa mobs.js, así que es seguro.
const {
	damagePlayer,
	addToInventory,
	removeFromInventory,
	addXp // Fase 12 (A4): el tridente que mata un mob da XP a su lanzador
} = require("./players.js");
const tnt = require("./tnt.js"); // Fase 10 (D2): el creeper encadena TNT

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
					if (m.health <= 0) {
						// El slime se divide antes de morir (como en attack_mob).
						m.onDeath(); // C2: el slime se divide (hook por especie)
						m.alive = false;
						// Si el lanzador es un jugador que está conectado, recibe los
						// drops y la XP del mob (que es quien aprieta mejor que con la
						// mano: misma regla de recompensa de attack_mob en net.js).
						const lanzador = players.get(a.from);
						if (lanzador) {
							const drops = mobDrops(m);
							if (drops)
								for (const d of drops) addToInventory(lanzador, d.id, d.count);
							// auditoría §4.1: mobXp (slime 4/1 por tamaño, MC)
							addXp(lanzador, mobXp(m));
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

class Mob {
	constructor(type, x, y, z) {
		this.id = uuidv4();
		this.type = type;
		this.x = x;
		this.y = y;
		this.z = z;
		this.health = MOB_HEALTH[type] ?? (HOSTILE.has(type) ? 20 : 10);
		this.state = "idle";
		this.attackCooldown = 0;
		this.teleportCooldown = 0;
		this.targetX = x;
		this.targetZ = z;
		this.color = MOB_COLORS[type] || 0x999999;
		this.alive = true;
		// Cría (Fase 3): estado de reproducción y crecimiento
		this.loveUntil = 0; // fin del modo amor (timestamp)
		this.cooldownUntil = 0; // fin del cooldown de cría (timestamp)
		this.isBaby = false; // los bebés crecen hasta hacerse adultos
		this.age = 0; // ms acumulados de vida como bebé
		// Quema solar (Fase 6): el mob se quema con el sol de día si está
		// expuesto al cielo. burning se replica al cliente (tintado en llamas).
		this.burning = false;
		this.burnAccum = 0; // ms acumulados ardiendo (para el daño periódico)
		// Fase 9 (Bloque D): IA por especie —
		this.fleeUntil = 0; // pasivos: huir del último atacante hasta esta hora
		this.fleeFrom = null; // { x, z } dirección opuesta al atacante
		this.wanderPauseUntil = 0; // pasivos: pausa aleatoria al deambular
		this.homeX = x; // punto de origen (rebaño): vuelven si se alejan
		this.homeZ = z;
		this.fuseStart = null; // creeper: inicio del fuse (explosión tras ~1.5s)
		this.stuckTicks = 0; // hostiles: contador de persecución bloqueada
		this.shootCooldown = 0; // esqueleto: milisegundos entre disparos
		// Fase 12 (Bloque A): mobs por bioma y mascotas —
		this.slimeSize = type === "slime" ? 2 : undefined; // 2 grande, 1 mediano, 0 pequeño
		this.ownerId = null; // mascota domesticada: id del dueño (sesión)
		this.ownerName = null; // nombre del dueño (persistencia en la Fase 12 D)
		this.sitting = false; // mascota sentada (no sigue ni ataca)
		// Fase 12 (A4/auditoría): fase del hop del slime POR-MOB y DETERMINISTA —
		// offset derivado del id (único por mob) y contador propio que avanza con
		// TICK_MS: los slimes no saltan al unísono y el movimiento no depende de
		// la hora global (Date.now()%1200, no reproducible en tests).
		this.slimeHopAccum = 0;
		this.slimeHopPhase =
			this.id.charCodeAt(0) * 31 + this.id.charCodeAt(this.id.length - 1);
	}

	distTo(p) {
		const dx = p.x - this.x,
			dz = p.z - this.z;
		return Math.sqrt(dx * dx + dz * dz);
	}

	findNearestPlayer() {
		let nearest = null,
			best = Infinity;
		const safe = spawnSafeRadius > 0 ? getSafeSpawn() : null;
		for (const p of players.values()) {
			// B2: los hostiles no targetean a jugadores dentro de la zona segura
			// del spawn (el recién llegado se orienta; al salir del radio vuelven
			// a ser objetivo).
			if (safe && Math.hypot(p.x - safe.x, p.z - safe.z) < spawnSafeRadius)
				continue;
			const d = this.distTo(p);
			if (d < best) {
				best = d;
				nearest = p;
			}
		}
		return { nearest, dist: best };
	}

	wander() {
		if (Math.random() < 0.01) {
			this.targetX = this.x + (Math.random() - 0.5) * 10;
			this.targetZ = this.z + (Math.random() - 0.5) * 10;
		}
		const dx = this.targetX - this.x,
			dz = this.targetZ - this.z;
		const len = Math.hypot(dx, dz);
		if (len > 0.5) {
			this.x += (dx / len) * 0.01;
			this.z += (dz / len) * 0.01;
		}
		this.settleOnGround();
	}

	moveToward(target, speed) {
		const dx = target.x - this.x,
			dz = target.z - this.z;
		const len = Math.hypot(dx, dz);
		if (len > 0.4) {
			this.x += (dx / len) * speed;
			this.z += (dz / len) * speed;
		}
		this.settleOnGround();
	}

	// Persecución mejorada (Fase 9, Bloque D): no quedarse atascado contra el
	// terreno. Si la celda de destino está bloqueada (sólido a la altura de los
	// pies), se intenta saltar/hopear 1 bloque; si lleva N ticks pegado al mismo
	// sitio, se prueba un desvío lateral aleatorio (evita esquinas/abismos).
	chase(player, speed) {
		const dx = player.x - this.x,
			dz = player.z - this.z;
		const len = Math.hypot(dx, dz);
		if (len > 0.4) {
			const nx = this.x + (dx / len) * speed;
			const nz = this.z + (dz / len) * speed;
			const feet = world.getBlock(
				Math.floor(nx),
				Math.floor(this.y - 0.1),
				Math.floor(nz)
			);
			const mid = world.getBlock(
				Math.floor(nx),
				Math.floor(this.y + 0.7),
				Math.floor(nz)
			);
			if (isSolidBlock(mid) && !isSolidBlock(feet)) {
				// Bloqueado por un escalón de 1 bloque: saltar por encima.
				this.y += 0.12;
			}
			this.x = nx;
			this.z = nz;
		}
		// ¿Atascado? (no avanza pese a perseguir) → desvío lateral aleatorio.
		if (
			Math.hypot(
				this.x - (this.lastX ?? this.x),
				this.z - (this.lastZ ?? this.z)
			) <
			speed * 0.3
		)
			this.stuckTicks += 50;
		else this.stuckTicks = 0;
		this.lastX = this.x;
		this.lastZ = this.z;
		if (this.stuckTicks > 400) {
			this.stuckTicks = 0;
			const angle = Math.random() * Math.PI * 2;
			this.x += Math.cos(angle) * 1.5;
			this.z += Math.sin(angle) * 1.5;
		}
		this.settleOnGround();
	}

	settleOnGround() {
		const below = world.getBlock(
			Math.floor(this.x),
			Math.floor(this.y - 0.1),
			Math.floor(this.z)
		);
		const head = world.getBlock(
			Math.floor(this.x),
			Math.floor(this.y + 0.6),
			Math.floor(this.z)
		);
		// El agua no es sólida (se nada en ella): el mob se hunde a través de la
		// superficie y descansa en el fondo del lago, en vez de "caminar" sobre ella.
		// El bloque de la cabeza solo empuja hacia arriba si es sólido: con el agua
		// en la cabeza (mob sumergido) no debe subir a la superficie.
		if (!isSolidBlock(below)) this.y -= 0.04;
		else if (isSolidBlock(head)) this.y += 0.06;
	}

	// ¿Está expuesto al sol? El bloque ENCIMA de la cabeza es no-sólido y no
	// hay ningún bloque sólido entre la cabeza y el cielo (WORLD_HEIGHT). Los
	// árboles, techos y montañas dan sombra: un mob bajo techo no arde. El
	// AGUA también bloquea el sol (un no-muerto sumergido no arde, como en
	// Minecraft: el agua apaga el fuego) — por eso el check es contra sólido
	// O agua, no solo contra sólido.
	exposedToSky() {
		const x = Math.floor(this.x),
			z = Math.floor(this.z);
		for (let y = Math.floor(this.y + 1.5); y < WORLD_HEIGHT; y++) {
			const b = world.getBlock(x, y, z);
			if (isSolidBlock(b) || b === B.WATER) return false;
		}
		return true;
	}

	// Quema solar (Fase 6): de día, los no-muertos expuestos al cielo arden
	// (1 HP cada ~1000 ms) hasta morir. Al morir por el sol no sueltan drop ni
	// dan XP (como en Minecraft: solo se dropea si el golpe final es del
	// jugador — aquí la muerte se gestiona en el bucle principal, fuera de
	// attack_mob). Si es de noche, bajo techo o el tipo no arde, se apaga.
	tickSunBurn(isNight) {
		const burns = BURNS_IN_SUN.has(this.type);
		if (!burns || isNight || !this.exposedToSky()) {
			this.burning = false;
			return;
		}
		this.burning = true;
		this.burnAccum += TICK_MS;
		if (this.burnAccum >= 1000) {
			this.burnAccum = 0;
			this.health -= 1;
			if (this.health <= 0) this.alive = false;
		}
	}

	attack(player, dmg, cooldownMs) {
		if (this.attackCooldown > Date.now()) return;
		// Fase 8 (B2): telemetría de daño por origen (mob atacante + distancia).
		damagePlayer(player, dmg, {
			source: "mob",
			meta: {
				mobId: this.id,
				mobType: this.type,
				dist: this.distTo(player)
			}
		});
		this.attackCooldown = Date.now() + cooldownMs;
	}

	explode() {
		for (const p of players.values()) {
			// Fase 8 (B2): telemetría — la explosión del creeper cuenta como daño
			// de mob (mobType creeper) con su distancia.
			// Fase 14 (Bloque B): el boom del creeper usa el daño del TNT.
			if (this.distTo(p) < 3.5)
				damagePlayer(p, TNT_DAMAGE, {
					source: "mob",
					meta: { mobType: "creeper", dist: this.distTo(p) }
				});
		}
		for (let dx = -2; dx <= 2; dx++) {
			for (let dy = -2; dy <= 2; dy++) {
				for (let dz = -2; dz <= 2; dz++) {
					if (Math.random() < 0.4) {
						const bx = Math.floor(this.x + dx),
							by = Math.floor(this.y + dy),
							bz = Math.floor(this.z + dz);
						// Fase 7 (auditoría): la explosión NO rompe bloques irrompibles
						// ni líquidos (NOT_MINEABLE: bedrock, agua, lava) ni cofres
						// CON contenido (su loot se perdería para siempre: no hay
						// entidades de item en el suelo — ver finishMining).
						const block = world.getBlock(bx, by, bz);
						if (NOT_MINEABLE.has(block)) continue;
						// Fase 10 (D2): reacción en cadena — el creeper ignita el TNT
						// que alcanza su explosión (como en Minecraft).
						if (block === B.TNT) {
							tnt.ignite(bx, by, bz);
							continue;
						}
						if (block === B.CHEST) {
							const slots = state.chests.get(`${bx},${by},${bz}`);
							if (slots?.some((s) => s)) continue;
							// Cofre vacío: se rompe igual, pero se limpia su estado
							// (igual que finishMining) para no dejar entradas huérfanas.
							state.chests.delete(`${bx},${by},${bz}`);
						}
						world.setBlock(bx, by, bz, B.AIR);
					}
				}
			}
		}
		this.alive = false;
	}

	tick(isNight) {
		// Los bebés crecen con el tiempo hasta hacerse adultos
		if (this.isBaby) {
			this.age += TICK_MS;
			if (this.age >= GROWUP_MS) this.isBaby = false;
		}
		// Quema solar: antes del comportamiento, para que un no-muerto en llamas
		// no siga persiguiendo mientras arde (y para que el flag llegue al
		// snapshot en el mismo tick).
		this.tickSunBurn(isNight);
		if (!this.alive) return; // murió por el sol: no actúa este tick
		const { nearest, dist } = this.findNearestPlayer();
		// Fase 13 (C2): POO — el comportamiento por especie es un método
		// VIRTUAL (tickSpecies). La clase base lo despacha por tipo (switch)
		// para compatibilidad con `new Mob(tipo)` de los tests; cada subclase
		// (Zombie, Creeper, ...) lo sobrescribe con su IA sin el switch.
		this.tickSpecies(isNight, nearest, dist);
	}

	// Hook por especie (Fase 13, C2): la base despacha por tipo para que
	// `new Mob("zombie")` siga comportándose igual; las subclases sobrescriben
	// este método con su IA propia (ver createMob/MOB_CLASSES al final).
	tickSpecies(isNight, nearest, dist) {
		const hostiles = HOSTILE.has(this.type);
		if (!hostiles) {
			// Fase 9 (Bloque F): la abeja tiene su propio movimiento volador 3D
			// (no usa el suelo); el resto de pasivos usan tickPassive. Fase 12:
			// el ocelote huye del jugador (radio 8) y el gato domado sigue al
			// dueño — IA propia antes del genérico.
			if (this.type === "bee") tickBee(this);
			else if (this.type === "ocelot") this.tickOcelot(nearest, dist);
			else if (this.type === "cat") this.tickCat(nearest, dist);
			else this.tickPassive(isNight, nearest, dist);
			return;
		}
		switch (this.type) {
			case "zombie":
				this.tickZombie(isNight, nearest, dist);
				break;
			case "spider":
				this.tickSpider(isNight, nearest, dist);
				break;
			case "wolf":
				this.tickWolf(isNight, nearest, dist);
				break;
			case "slime": // Fase 12 (A2): salta en vez de caminar y se divide al morir
				this.tickSlime(isNight, nearest, dist);
				break;
			case "drowned": // Fase 12 (A4): nada, ataca y lanza tridentes
				this.tickDrowned(isNight, nearest, dist);
				break;
			case "creeper":
				this.tickCreeper(isNight, nearest, dist);
				break;
			case "skeleton":
				this.tickSkeleton(isNight, nearest, dist);
				break;
			case "enderman":
				this.tickEnderman(isNight, nearest, dist);
				break;
		}
	}

	// ============================================================
	// FASE 13 (C2): IA por especie como métodos de instancia. Los cuerpos se
	// extrajeron del switch del tick central SIN cambiar el comportamiento
	// (la base los usa vía tickSpecies; las subclases los sobreescriben).
	// ============================================================
	tickZombie(isNight, nearest, dist) {
		if (nearest && (isNight || dist < 6)) {
			this.state = "chase";
			this.chase(nearest, 0.035);
			// Auditoría 2026-08-09 (§3.7): daño "normal" de MC (2.5-3) no 2.
			if (dist < 1.6) this.attack(nearest, 3, 1000);
		} else {
			this.state = "idle";
			this.wander();
		}
	}

	tickSpider(isNight, nearest, dist) {
		// Fase 5: hostil rápido y frágil; Fase 9: escala y salta
		if (nearest && (isNight || dist < 8)) {
			this.state = "chase";
			this.chase(nearest, 0.055);
			// Escalar: si el camino está bloqueado por un sólido y hay hueco
			// arriba, sube (simplificación: las arañas trepan muros de 1).
			const front = world.getBlock(
				Math.floor(this.x + (nearest.x - this.x) * 0.2),
				Math.floor(this.y + 0.7),
				Math.floor(this.z + (nearest.z - this.z) * 0.2)
			);
			if (isSolidBlock(front)) {
				const up = world.getBlock(
					Math.floor(this.x),
					Math.floor(this.y + 1.8),
					Math.floor(this.z)
				);
				if (!isSolidBlock(up)) this.y += 0.08; // trepa el muro
			}
			// Salto de ataque: cerca del objetivo, salta sobre él.
			if (dist < 3 && Math.floor(this.y) === Math.floor(nearest.y))
				this.y += 0.45;
			if (dist < 1.7) this.attack(nearest, 2, 900);
		} else {
			this.state = "idle";
			this.wander();
		}
	}

	tickWolf(isNight, nearest, dist) {
		// Fase 5: hostil resistente de la noche; Fase 12: domable
		// Lobo DOMADO (Fase 12, A1): sigue al dueño, se sienta con clic
		// derecho y no ataca al dueño (solo a su objetivo — ver net.js
		// petsJoinAttack). Si está sentado no sigue ni ataca.
		if (this.ownerId) {
			this.tickPet(nearest, dist);
			return;
		}
		if (nearest && (isNight || dist < 8)) {
			this.state = "chase";
			this.chase(nearest, 0.04);
			if (dist < 1.8) this.attack(nearest, 3, 1200);
		} else {
			this.state = "idle";
			this.wander();
		}
	}

	tickCreeper(isNight, nearest, dist) {
		// Fase 12 (A3): el GATO domado espanta a los creepers — si hay un
		// gato aliado a ≤6 bloques, el creeper huye en vez de perseguir o
		// explotar (decisión E9 del spec).
		if (catNearby(this.x, this.z, 6)) {
			this.fuseStart = null;
			this.state = "flee";
			if (nearest)
				this.moveToward(
					{ x: 2 * this.x - nearest.x, z: 2 * this.z - nearest.z },
					0.05
				);
			else this.wander();
			return;
		}
		// Fase 9 (Bloque D): fuse fiel — se detiene, "silba" (~1.5s) y
		// explota si el jugador sigue cerca; si se aleja, cancela.
		if (nearest && dist < 10) {
			if (dist < 3) {
				this.state = "fuse";
				if (!this.fuseStart) this.fuseStart = Date.now();
				if (Date.now() - this.fuseStart >= 1500) {
					this.fuseStart = null;
					this.explode();
				}
			} else {
				this.fuseStart = null;
				this.state = "chase";
				this.chase(nearest, 0.045);
			}
		} else {
			this.fuseStart = null;
			this.state = "idle";
			this.wander();
		}
	}

	tickSkeleton(isNight, nearest, dist) {
		// Fase 9 (Bloque D): el esqueleto mantiene la distancia y dispara
		// flechas (proyectil con gravedad). No arde (en Minecraft el
		// esqueleto tampoco arde — solo el zombi); por eso se excluye de
		// BURNS_IN_SUN en la Fase 9.
		if (nearest && (isNight || dist < 8)) {
			this.state = "chase";
			if (dist < 6)
				this.chase(
					{ x: 2 * this.x - nearest.x, z: 2 * this.z - nearest.z },
					0.03
				);
			else if (dist > 12) this.chase(nearest, 0.03);
			if (dist < 18 && Date.now() > this.shootCooldown) {
				shootArrow(this, nearest);
				this.shootCooldown = Date.now() + 2500;
			}
		} else {
			this.state = "idle";
			this.wander();
		}
	}

	tickEnderman(isNight, nearest, dist) {
		if (
			nearest &&
			dist < 16 &&
			Math.random() < 0.02 &&
			this.teleportCooldown < Date.now()
		) {
			const angle = Math.random() * Math.PI * 2,
				radius = 2 + Math.random() * 3;
			this.x = nearest.x + Math.cos(angle) * radius;
			this.z = nearest.z + Math.sin(angle) * radius;
			this.y = world.getHeight(Math.floor(this.x), Math.floor(this.z)) + 1;
			this.teleportCooldown = Date.now() + 3000;
			this.state = "chase";
		} else if (nearest && dist < 2.5) {
			// Auditoría 2026-08-09 (§3.7): enderman 7 (MC Java normal), antes 4.
			this.attack(nearest, 7, 1500);
		} else {
			this.state = "idle";
			this.wander();
		}
	}

	// ============================================================
	// PASAVOS (Fase 9, Bloque D): huir al ser golpeados, deambular más
	// natural (con pausas y pastar), volver al rebaño (homeX/homeZ) y dormir
	// de noche (se agrupan y se quedan quietos — estético).
	// ============================================================
	tickPassive(isNight, _nearest, _dist) {
		// Dormir de noche: se agrupan en el punto medio del rebaño y se quedan
		// quietos (estado 'sleep'); de día vuelven a su vida normal.
		if (isNight) {
			if (this.state !== "sleep") {
				// Grupo: media de las posiciones de los pasivos cercanos (rebaño).
				let gx = this.homeX,
					gz = this.homeZ,
					n = 1;
				for (const m of state.mobs) {
					if (m.alive && !HOSTILE.has(m.type) && m.id !== this.id) {
						if (Math.hypot(m.x - this.x, m.z - this.z) < 12) {
							gx += m.x;
							gz += m.z;
							n++;
						}
					}
				}
				this.sleepTarget = { x: gx / n, z: gz / n };
				this.state = "sleep";
			}
			// Acercarse lentamente al grupo y quedarse quieto al llegar.
			const t = this.sleepTarget || { x: this.homeX, z: this.homeZ };
			if (Math.hypot(t.x - this.x, t.z - this.z) > 1.2) {
				this.moveToward(t, 0.02);
			} else {
				this.settleOnGround();
			}
			return;
		}
		this.sleepTarget = null;
		// Huir al ser golpeado (mobHit lo activa): correr en dirección contraria.
		if (Date.now() < this.fleeUntil && this.fleeFrom) {
			this.state = "flee";
			this.moveToward(
				{ x: this.fleeFrom.x, z: this.fleeFrom.z },
				0.045 // más rápido que deambular (como en Minecraft)
			);
			return;
		}
		// Volver al rebaño si se alejaron demasiado del punto de origen.
		const homeDist = Math.hypot(this.x - this.homeX, this.z - this.homeZ);
		if (homeDist > 24) {
			this.state = "home";
			this.moveToward({ x: this.homeX, z: this.homeZ }, 0.03);
			return;
		}
		// Deambular natural: pausas aleatorias y pastar de vez en cuando.
		if (Date.now() < this.wanderPauseUntil) {
			this.state = "graze";
			this.settleOnGround();
			return;
		}
		if (Math.random() < 0.008) {
			// Pausa de 0.5-2s o pastar (1-2s).
			this.wanderPauseUntil = Date.now() + 500 + Math.random() * 1500;
			this.state = Math.random() < 0.5 ? "graze" : "idle";
		} else {
			this.state = "idle";
			this.wander();
		}
	}

	// Al ser golpeado por un jugador (attack_mob): los pasivos huyen durante
	// ~4s en dirección contraria al atacante (Fase 9, Bloque D).
	mobHit(attacker) {
		if (HOSTILE.has(this.type)) return;
		this.fleeUntil = Date.now() + 4000;
		this.fleeFrom = {
			x: 2 * this.x - attacker.x,
			z: 2 * this.z - attacker.z
		};
		this.wanderPauseUntil = 0; // el susto interrumpe la pausa
	}

	// ============================================================
	// FASE 12 (Bloque A): IA de los mobs por bioma y mascotas
	// ============================================================

	// Ocelote (A3): pasivo huidizo — corre en dirección contraria al jugador
	// cuando este está a ≤8 bloques (radio mayor que el susto de los pasivos
	// genéricos, prioridad alta). De noche deambula igual.
	tickOcelot(nearest, dist) {
		if (nearest && dist <= 8) {
			this.state = "flee";
			this.moveToward(
				{ x: 2 * this.x - nearest.x, z: 2 * this.z - nearest.z },
				0.06 // más rápido que deambular (huida)
			);
			return;
		}
		this.state = "idle";
		this.wander();
	}

	// Gato (ocelote domado, A3): sigue al dueño y no ataca. Si está sentado,
	// se queda quieto. Si el dueño se desconecta, deambula (al reconectar, el
	// follow se restaura en la Fase 12 D con ownerName persistido).
	tickCat(_nearest, _dist) {
		if (this.sitting) {
			this.state = "sit";
			this.settleOnGround();
			return;
		}
		const owner = this.ownerId ? players.get(this.ownerId) : null;
		if (owner) {
			const od = this.distTo(owner);
			this.state = "follow";
			// Seguir al dueño: acercarse hasta ~2 bloques y quedarse.
			if (od > 2.5) this.moveToward(owner, 0.05);
			else this.settleOnGround();
			return;
		}
		this.state = "idle";
		this.wander();
	}

	// Mascota genérica (lobo domado A1 / gato A3): sigue al dueño; si está
	// sentada, no sigue ni ataca. El ataque al objetivo del dueño lo dispara
	// net.js (petsJoinAttack) — aquí solo el seguimiento.
	tickPet(_nearest, _dist) {
		if (this.sitting) {
			this.state = "sit";
			this.settleOnGround();
			return;
		}
		const owner = this.ownerId ? players.get(this.ownerId) : null;
		if (owner) {
			const od = this.distTo(owner);
			this.state = "follow";
			if (od > 3) this.moveToward(owner, 0.05);
			else this.settleOnGround();
			return;
		}
		this.state = "idle";
		this.wander();
	}

	// Slime (A2): salta en vez de caminar. Ciclo de salto simple con
	// "gravedad" (sube y cae), avanza hacia el jugador en el aire y ataca por
	// tamaño (3/2/0). No sufre daño de caída (los mobs no tienen daño de
	// caída en este clon — verify: no hay applyFallDamage para mobs).
	tickSlime(_isNight, nearest, dist) {
		// Salto: fase periódica POR-MOB y determinista (Fase 12, A4/auditoría) —
		// un contador propio avanza con TICK_MS fijo y un offset derivado del id
		// separa las fases entre slimes. Antes se usaba Date.now()%1200 (fase
		// global): todos saltaban al unísono y el movimiento dependía del reloj.
		this.slimeHopAccum = (this.slimeHopAccum + TICK_MS) % 1200;
		const hopPhase = ((this.slimeHopAccum + this.slimeHopPhase) % 1200) / 1200; // 0..1 cada 1.2s
		if (!this.slimeHopY) this.slimeHopY = this.y;
		// Altura del salto: parábola de hop (0..0.5 bloques sobre el suelo).
		const hop = Math.sin(hopPhase * Math.PI) * 0.5;
		// Suelo real: getHeight de la columna (el slime salta sobre el terreno).
		const groundY = world.getHeight(Math.floor(this.x), Math.floor(this.z)) + 1;
		this.y = groundY + hop;
		if (nearest && dist < 10) {
			// Avanzar hacia el jugador (movimiento horizontal en el aire).
			const dx = nearest.x - this.x,
				dz = nearest.z - this.z;
			const len = Math.hypot(dx, dz);
			if (len > 0.4) {
				this.x += (dx / len) * 0.05;
				this.z += (dz / len) * 0.05;
			}
			this.state = "chase";
			// Daño por tamaño (MC real): grande 3, mediano 2, pequeño 0.
			const dmg = SLIME_DAMAGE[this.slimeSize] || 0;
			if (dist < 1.8 && dmg > 0) this.attack(nearest, dmg, 1000);
		} else {
			// Deambular saltando (sin jugador cerca o de día en superficie).
			this.wander();
			this.state = "idle";
		}
	}

	// Ahogado (A4): nada hacia el jugador en 3D (mantiene la profundidad del
	// agua, sube/baja según la posición del objetivo), ataca cuerpo a cuerpo
	// a ≤1.5 y lanza tridentes con cooldown (~3s) si el jugador está a 4-14
	// bloques (~50% por intento). No se ahoga (no hay sistema de ahogo de
	// mobs) y no arde (no está en BURNS_IN_SUN).
	tickDrowned(_isNight, nearest, dist) {
		if (nearest && dist < 16) {
			this.state = "chase";
			// Nadar: moverse en 3D hacia el jugador — horizontal igual que el
			// resto de hostiles, vertical hacia la profundidad del objetivo
			// (sin salirse del agua: techo en SEA_LEVEL - 1).
			this.chase(nearest, 0.04);
			const targetY = Math.min(
				Math.max(1, nearest.y - 1.5),
				world.SEA_LEVEL - 1
			);
			if (Math.abs(this.y - targetY) > 0.5) {
				this.y += Math.sign(targetY - this.y) * 0.04;
			}
			if (dist < 1.5) this.attack(nearest, 3, 1200);
			// Tridente arrojadizo: cooldown ~3s y ~50% de intentar si el jugador
			// está a 4-14 bloques (E4).
			if (
				dist >= 4 &&
				dist <= 14 &&
				Date.now() > this.shootCooldown &&
				Math.random() < 0.5
			) {
				shootTrident(this, nearest);
				this.shootCooldown = Date.now() + 3000;
			}
		} else {
			this.state = "idle";
			this.wander();
		}
	}

	// Hook de muerte (C2): sustituye el `if (m.type === "slime") splitSlime(m)`
	// que los llamadores (tickArrows, net.js) repetían. La base despacha por
	// tipo (compatibilidad con `new Mob(tipo)` de los tests, igual que
	// tickSpecies); la subclase Slime lo sobrescribe con su propio hook.
	onDeath() {
		if (this.type === "slime" && this.alive) splitSlime(this);
	}
}

// ============================================================
// FASE 13 (C2): HERENCIA POR ESPECIE
// Subclases de Mob que sobrescriben tickSpecies (y onDeath) con su IA
// propia, sin el switch del tick central. `createMob(type, x, y, z)` elige
// la clase por tipo (registro tipo→clase) y se usa en spawnMobs/splitSlime;
// la clase base conserva el switch en tickSpecies SOLO para compatibilidad
// con `new Mob(tipo)` de los tests (unit-mobs-ia, unit-fase12, ...).
// ============================================================

class Zombie extends Mob {
	constructor(x, y, z) {
		super("zombie", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickZombie(isNight, nearest, dist);
	}
}

class Spider extends Mob {
	constructor(x, y, z) {
		super("spider", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickSpider(isNight, nearest, dist);
	}
}

class Wolf extends Mob {
	constructor(x, y, z) {
		super("wolf", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickWolf(isNight, nearest, dist);
	}
}

class Slime extends Mob {
	constructor(x, y, z) {
		super("slime", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickSlime(isNight, nearest, dist);
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
		this.tickDrowned(isNight, nearest, dist);
	}
}

class Creeper extends Mob {
	constructor(x, y, z) {
		super("creeper", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickCreeper(isNight, nearest, dist);
	}
}

class Skeleton extends Mob {
	constructor(x, y, z) {
		super("skeleton", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickSkeleton(isNight, nearest, dist);
	}
}

class Enderman extends Mob {
	constructor(x, y, z) {
		super("enderman", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickEnderman(isNight, nearest, dist);
	}
}

// Pasivos: el genérico tickPassive (huida/rebaño/sueño) es el común; el
// ocelote y la abeja conservan su IA propia de la base. El gato domado usa
// la clase Ocelot con type "cat" (applyTame lo cambia en runtime, como MC).
class Cow extends Mob {
	constructor(x, y, z) {
		super("cow", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickPassive(isNight, nearest, dist);
	}
}

class Pig extends Mob {
	constructor(x, y, z) {
		super("pig", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickPassive(isNight, nearest, dist);
	}
}

class Chicken extends Mob {
	constructor(x, y, z) {
		super("chicken", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickPassive(isNight, nearest, dist);
	}
}

class Sheep extends Mob {
	constructor(x, y, z) {
		super("sheep", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickPassive(isNight, nearest, dist);
	}
}

class Rabbit extends Mob {
	constructor(x, y, z) {
		super("rabbit", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		this.tickPassive(isNight, nearest, dist);
	}
}

class Bee extends Mob {
	constructor(x, y, z) {
		super("bee", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		tickBee(this);
	}
}

class Ocelot extends Mob {
	constructor(x, y, z) {
		super("ocelot", x, y, z);
	}
	tickSpecies(isNight, nearest, dist) {
		// Domado → type "cat" (runtime, ver applyTame): el gato usa tickCat.
		if (this.type === "cat") this.tickCat(nearest, dist);
		else this.tickOcelot(nearest, dist);
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
function createMob(type, x, y, z) {
	const Cls = MOB_CLASSES[type];
	return Cls ? new Cls(x, y, z) : new Mob(type, x, y, z);
}

// ============================================================
// SPAWN DE MOBS (Fase 6: IA hostil más fiel)
// Los HOSTILES solo aparecen de NOCHE; de día solo generan pasivos. La
// posición se elige en CUALQUIER chunk cargado del mapa dentro del radio de
// render del jugador (antes: siempre a <25 bloques del jugador, de día y de
// noche). Reglas tipo Minecraft:
//  - hostiles: distancia mínima de 24 bloques al jugador (no spawn en la
//    cara) y nunca sobre agua.
//  - pasivos: pueden aparecer cerca, de día o de noche (la comida sigue
//    existiendo de noche, como en Minecraft).
// Devuelve los mobs creados (para tests) o [].
// ============================================================
const SPAWN_MIN_PLAYER_DIST = 24; // bloques: hostiles nunca a menos de esto
// Mobs por bioma (Fase 12, Bloque C — E7): además de la tabla base, cada
// bioma tiene su mob propio. El lobo (antes hostil genérico de la noche)
// pasa a ser EXCLUSIVO de taiga (deja de spawnear en el resto de biomas).
// Sin pesos complejos: si el bioma del punto tiene mobs propios, el 60% de
// las veces se elige uno de ellos y 40% la tabla base ("mobs propios + resto
// igual", decisión E7). getBiome devuelve: snow|taiga|desert|swamp|jungle|
// forest|plains|mountain (los ríos/océanos no son bioma: se detectan como
// columna de agua con columnFloorY y se asocian al ahogado).
const SPAWN_TYPES = {
	day: ["cow", "pig", "chicken", "sheep", "rabbit", "bee"],
	night: [
		"zombie",
		"creeper",
		"skeleton",
		"spider",
		"cow",
		"pig",
		"chicken",
		"sheep",
		"rabbit",
		"bee"
	]
};
const BIOME_SPAWN = {
	taiga: { day: [], night: ["wolf"] },
	swamp: { day: [], night: ["slime"] }, // el slime solo aparece de NOCHE (como MC)
	jungle: { day: ["ocelot"], night: [] } // el ocelote es pasivo y solo de DÍA
};
// Los ahogados viven en cualquier columna de agua (océano, río o lago): se
// eligen como mob propio del "agua" de día y de noche (E4), y se colocan
// bajo la superficie (wy = fondo + 2) en vez de sobre el terreno.
const WATER_SPAWN = ["drowned"];

// ============================================================
// FASE 12 (Bloque A): helpers de los mobs por bioma
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

// División del slime al morir (A2, E2): grande (2) → 2 medianos (1) →
// 2 pequeños (0); el pequeño no divide. Los hijos se crean desplazados ±1
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
// corazones los gestiona net.js).
function applyTame(mob, player) {
	if (Math.random() >= 1 / 3) return false;
	mob.ownerId = player.id;
	mob.ownerName = player.name;
	if (mob.type === "ocelot") mob.type = "cat";
	return true;
}

// Alterna el estado sentado de una mascota (clic derecho con la mano vacía).
// Devuelve el nuevo estado (net.js valida propiedad y distancia).
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

function spawnMobs(isNight) {
	if (state.mobs.length > 30 || players.size === 0) return [];
	const types = SPAWN_TYPES[isNight ? "night" : "day"];
	const anyPlayer = players.values().next().value;
	const created = [];
	for (let i = 0; i < 3; i++) {
		// Buscar una posición en el mapa cargado: un chunk dentro del radio de
		// render del jugador (los chunks del servidor fuera del radio activo no
		// se generan o se descargan; el mundo cargado = el área de render).
		const rd = Math.max(2, Math.min(10, anyPlayer.renderDistance || 6));
		let placed = null;
		for (let attempt = 0; attempt < 8 && !placed; attempt++) {
			const ccx = Math.floor(anyPlayer.x / CHUNK_SIZE);
			const ccz = Math.floor(anyPlayer.z / CHUNK_SIZE);
			const cx = ccx + Math.floor((Math.random() * 2 - 1) * rd);
			const cz = ccz + Math.floor((Math.random() * 2 - 1) * rd);
			const key = `${cx},${cz}`;
			// Solo chunks ya cargados en memoria: el spawn nunca fuerza generación
			// (spawnMobs se llama desde el bucle, fuera del flujo de generación).
			if (!state.chunks.has(key)) continue;
			const wx = cx * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE) + 0.5;
			const wz = cz * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE) + 0.5;
			const hx = Math.floor(wx),
				hz = Math.floor(wz);
			// Fase 12 (Bloque C): el tipo se elige SEGÚN el bioma del punto (E7).
			// Columna de agua (océano, río o lago) → mob propio "agua" (ahogado);
			// si no, el mob propio del bioma cuando lo hay. El sorteo consume UN
			// solo Math.random (unidad de disparo de los tests deterministas):
			// si el bioma tiene mobs propios, 60% mob propio y 40% tabla base;
			// si no los tiene, el mismo valor elige en la tabla base como antes.
			const floorY = world.columnFloorY(hx, hz);
			const isWater = floorY !== null;
			const r = Math.random();
			const biomePool = isWater
				? WATER_SPAWN
				: BIOME_SPAWN[world.getBiome(hx, hz)]?.[isNight ? "night" : "day"] ||
					[];
			// Un solo Math.random decide (determinismo de los tests). Cuando el
			// bioma tiene pool propio: r<0.6 → mob propio; r≥0.6 → tabla base
			// REMAPeada a [0.6,1)→[0,1) para no sesgar hacia los últimos tipos
			// (sin el remape, zombie/creeper/skeleton/spider nunca salían por
			// tabla base en taiga/pantano/jungla/agua — revisión Fase 12).
			let type;
			if (biomePool.length > 0) {
				type =
					r < 0.6
						? biomePool[Math.floor((r / 0.6) * biomePool.length)]
						: types[Math.floor(((r - 0.6) / 0.4) * types.length)];
			} else {
				type = types[Math.floor(r * types.length)];
			}
			// El ahogado solo vive en el agua (se coloca bajo la superficie);
			// el resto de terrestres nunca spawnean sobre agua (ni lagos ni
			// océanos/ríos): un pasivo hundido se ahogaría, un hostil no podría
			// perseguir — el rechazo de lagos de la Fase 0 queda cubierto aquí.
			if (type === "drowned") {
				if (!isWater) continue;
			} else if (isWater) {
				continue;
			}
			if (HOSTILE.has(type)) {
				// Hostiles: a ≥ 24 bloques del jugador más cercano.
				let minDist = Infinity;
				for (const p of players.values())
					minDist = Math.min(minDist, Math.hypot(wx - p.x, wz - p.z));
				if (minDist < SPAWN_MIN_PLAYER_DIST) continue;
				// B2: los hostiles tampoco spawnean dentro de la zona segura del
				// spawn (no aparecen en la cara del recién llegado).
				if (spawnSafeRadius > 0) {
					const s = getSafeSpawn();
					if (Math.hypot(wx - s.x, wz - s.z) < spawnSafeRadius) continue;
				}
			}
			const surfaceH = world.getHeight(hx, hz);
			// Fase 10 (A6): hostiles también de DÍA, solo en zonas oscuras
			// (cuevas con techo opaco) — las notas pedían "solo por la noche o
			// en zonas oscuras como las cuevas". De noche siguen saliendo en
			// superficie; de día se buscan celdas de cueva oscuras. El ahogado
			// es la excepción (E4): sale de día y de noche en su agua, y se
			// coloca bajo la superficie (wy = fondo + 2, dentro del agua).
			let wy;
			if (type === "drowned") {
				wy = floorY + 2;
			} else if (HOSTILE.has(type) && !isNight) {
				const caveY = world.findDarkCaveY(hx, hz, surfaceH);
				if (caveY == null) continue; // sin cueva en esta columna: no spawn de día
				wy = caveY + 0.5;
			} else {
				wy = surfaceH + 1;
			}
			const mob = createMob(type, wx, wy, wz);
			// Fase 9 (Bloque D): el punto de origen es el rebaño del pasivo (vuelven a
			// él si se alejan). Las abejas vuelan alrededor de su panal (el origen).
			mob.homeX = wx;
			mob.homeZ = wz;
			if (type === "bee") mob.homeY = wy + 2;
			state.mobs.push(mob);
			created.push(mob);
			placed = mob;
		}
	}
	return created;
}

function mobSnapshot(m) {
	return {
		id: m.id,
		x: m.x,
		y: m.y,
		z: m.z,
		type: m.type,
		color: m.color,
		state: m.state,
		isBaby: m.isBaby,
		burning: m.burning,
		// Fase 9 (Bloque D): creeper en fuse (silbando antes de explotar) — el
		// cliente escala el mob para la animación.
		fuse: m.state === "fuse" ? 1 : 0,
		// Fase 12 (Bloque A): mascotas y tamaño del slime —
		// ownerId: el cliente pinta el collar rojo del lobo y la textura de
		// gato según el dueño; slimeSize: escala del slime (2/1/0 → 2/1/0.5).
		ownerId: m.ownerId || null,
		sitting: !!m.sitting,
		slimeSize: m.slimeSize ?? 2
	};
}

// ============================================================
// DROPS DE COMIDA DE ANIMALES (Fase 3)
// Al morir, los pasivos sueltan su comida cruda (rango aleatorio,
// estilo Minecraft). Los hostiles no dropean nada por ahora.
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
	drowned: { id: I.TRIDENT, min: 0, max: 1 }
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
		const count =
			table.min + Math.floor(Math.random() * (table.max - table.min + 1));
		if (count > 0) drops.push({ id: table.id, count });
	}
	return drops.length ? drops : null;
}

// ============================================================
// CRÍA DE ANIMALES (Fase 3): dar item → modo amor → pareja → bebé
// ============================================================
const LOVE_WINDOW_MS = 30000; // el modo amor dura 30s buscando pareja
const BREED_COOLDOWN_MS = 60000; // cooldown de cría tras criar (60s)
const BREED_RANGE = 8; // distancia máxima entre la pareja (bloques)
const GROWUP_MS = 60000; // un bebé tarda 60s en hacerse adulto

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

// Esquilar: marca el momento en que volverá a crecer y devuelve cuánta
// lana (1-3) se añade al inventario del jugador (la entrega la hace net.js).
function applyShear(mob) {
	mob.shearedUntil = Date.now() + SHEAR_REGROW_MS;
	return 1 + Math.floor(Math.random() * 3);
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
	state.mobs.push(baby);
	return baby;
}

function restoreMobs(list) {
	return (list || []).map((m) => {
		const mob = createMob(m.type, m.x, m.y, m.z);
		mob.id = m.id;
		mob.health = m.health;
		mob.isBaby = !!m.isBaby;
		mob.age = m.age || 0; // retrocompatible: faltan en guardados viejos
		// Fase 12 (A): restaurar tamaño de slime y mascotas (persistencia
		// completa en el Bloque D; aquí se conserva lo que venga del meta).
		if (typeof m.slimeSize === "number") mob.slimeSize = m.slimeSize;
		if (typeof m.ownerId === "string") mob.ownerId = m.ownerId;
		if (typeof m.ownerName === "string") mob.ownerName = m.ownerName;
		mob.sitting = !!m.sitting;
		return mob;
	});
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

module.exports = {
	Mob,
	// Fase 13 (C2): herencia por especie — clases y fábrica tipo→clase.
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
	createMob,
	MOB_CLASSES,
	spawnMobs,
	mobSnapshot,
	restoreMobs,
	mobDrops,
	canFeed,
	applyFeed,
	canShear,
	applyShear,
	SHEAR_RANGE,
	getSafeSpawn,
	setSpawnSafeRadius,
	tickArrows,
	arrowSnapshot,
	shootPlayerArrow,
	returnPlayerArrow,
	mobXp, // auditoría §4.1: XP por tamaño (slime)
	canTame,
	applyTame,
	sitPet,
	catNearby,
	splitSlime,
	petsJoinAttack,
	shootTrident,
	throwPlayerTrident,
	// Fase 12 (Bloque B): trampa del templo — las flechas del dispensador
	// reusan shootArrow con un shooter sintético (from: null → dañan a todos).
	shootArrow,
	// Fase 12 (Bloque C): spawn por bioma — la tabla BIOME_SPAWN y el pool de
	// agua (la prueban los tests de muestreo determinista de unit-fase12).
	BIOME_SPAWN,
	WATER_SPAWN
};
