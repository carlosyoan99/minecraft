"use strict";

// ============================================================
// MOBS: clase base Mob, snapshot/broadcast, orbes de XP y drops
// ============================================================
// Fase 18 (D-2): la IA POR ESPECIE (tickZombie, tickCreeper, tickPassive,
// ...), los helpers de interacción (doma/sentar/cría/esquileo) y la abeja
// viven en server/mob-species.js; el spawn por bioma y la zona segura en
// server/mob-spawn.js; los proyectiles (flechas/tridentes) en
// server/projectiles.js. Este módulo queda con la clase base Mob (métodos
// genéricos: tick/chase/flee/attack + el switch de compatibilidad para
// `new Mob(tipo)`), los orbes de XP (C-8), el snapshot del wire, los drops
// y la fachada que re-exporta todo para no cambiar los imports de los
// handlers (actions.js) ni de los tests.
//
// CICLOS: mob-species.js no requiere mobs.js (recibe la clase base como
// parámetro de createSpecies(Mob)); las funciones planas de IA se asignan a
// las variables `let` de abajo DESPUÉS de la llamada a createSpecies (el
// switch de la base las resuelve en tiempo de llamada, no de definición).
// ============================================================
const { v4: uuidv4 } = require("uuid");
const constants = require("./constants.js");
const {
	B,
	WORLD_MAX_Y,
	MOB_XP,
	MOB_COLORS,
	HOSTILE,
	BURNS_IN_SUN,
	NOT_MINEABLE,
	isSolidBlock,
	TNT_DAMAGE,
	TICK_MS
} = constants;
const state = require("./state.js");
const world = require("./world.js");
const mobSpawn = require("./mob-spawn.js");
// Fase 12 (Bloque A): damagePlayer (ataque del mob a mano/TNT) y addXp (XP
// recogida de los orbes). players.js no importa mobs.js, así que es seguro.
const { damagePlayer, addXp } = require("./players.js");
const tnt = require("./tnt.js"); // Fase 10 (D2): el creeper encadena TNT
// Fase 18 (D-2): proyectiles extraídos a su módulo (flechas/tridentes). Las
// fachadas se re-exportan abajo en module.exports; los hooks mobDrops/mobXp
// se inyectan al cargar para evitar el ciclo de require mobs→projectiles→mobs.
const projectiles = require("./projectiles.js");

// ============================================================
// IA POR ESPECIE (inyectadas desde mob-species.js)
// Funciones planas: (mob, isNight, nearest, dist) o (mob, isNight) en el
// caso de los pasivos. Se asignan tras createSpecies(Mob) al final del
// archivo; el switch de compatibilidad de la clase base las llama en runtime.
// ============================================================
let tickZombie = () => {};
let tickSpider = () => {};
let tickWolf = () => {};
let tickCreeper = () => {};
let tickSkeleton = () => {};
let tickEnderman = () => {};
let tickPassive = () => {};
let isPlayerLookingAt = () => false; // Fase 21 (C2): neutralidad del enderman
let isEndermanWatched = () => null; // ¿alguien mira a este enderman?
let tickOcelot = () => {};
let tickCat = () => {};
let _tickPet = () => {};
let tickSlime = () => {};
let tickDrowned = () => {};
let tickBee = () => {};
let splitSlime = () => [];

// Clases y fábricas (asignadas tras createSpecies(Mob) al final del archivo).
let Zombie,
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
	catNearby,
	canTame,
	applyTame,
	sitPet,
	petsJoinAttack,
	canFeed,
	applyFeed,
	canShear,
	applyShear,
	SHEAR_RANGE,
	SLIME_HEALTH,
	SLIME_DAMAGE,
	mobDrops;

// ============================================================
// XP Y SALUD POR TIPO
// ============================================================

// Auditoría 2026-08-09 (§4.1): XP real del mob al morir. El slime grande (2)
// da 4 XP y el mediano/pequeño 1 (MC); el resto usa MOB_XP[type]. Antes todo
// slime daba MOB_XP.slime=1.
function mobXp(m) {
	// Fase 16 (D6): paridad MC — slime grande 4, mediano 2, pequeño 1; el lobo
	// suelta 1-3 XP aleatorio (antes 8 fijo).
	if (m.type === "slime")
		return m.slimeSize === 2 ? 4 : m.slimeSize === 1 ? 2 : 1;
	if (m.type === "wolf") return 1 + Math.floor(Math.random() * 3);
	return MOB_XP[m.type] || 0;
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
// Notas del usuario: duración del aggro de los hostiles al ser golpeados
// (~10s, como el aggro de Minecraft Java).
const MOB_AGGRO_MS = 10000;

const { players } = state;

// ============================================================
// CLASE BASE Mob
// Métodos genéricos (movimiento, quema solar, ataque, explosión) y el hook
// virtual tickSpecies que la base despacha por tipo (compatibilidad con
// `new Mob(tipo)` de los tests antiguos; las subclases lo sobrescriben).
// ============================================================
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
		// Notas del usuario: aggro de los hostiles — al ser golpeados por un
		// jugador se vuelven agresivos con él (lo persiguen y atacan aunque
		// sea de día) durante MOB_AGGRO_MS.
		this.aggroUntil = 0; // fin del aggro (timestamp)
		this.aggroTarget = null; // id de sesión del jugador que lo golpeó
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

	// ¿Tiene aggro activo? (golpeado recientemente por un jugador)
	isAggroed() {
		return Date.now() < this.aggroUntil;
	}

	findNearestPlayer() {
		// Fase 17 (B6): los hostiles NO agreden a jugadores en CREATIVO — se
		// excluyen como objetivo de agresión/persecución (decisión de diseño
		// del clon, alineada con el bug reportado). En survival el
		// comportamiento actual se mantiene intacto.
		// Notas del usuario: el aggro hace objetivo al agresor AUNQUE esté
		// dentro de la zona segura del spawn (quien ataca se expone): el
		// hostil lo persigue hasta que expira el aggro.
		if (this.isAggroed() && this.aggroTarget) {
			const p = players.get(this.aggroTarget);
			if (p) {
				if (p.gamemode === "creative") {
					this.aggroUntil = 0; // el objetivo pasó a creativo: sin aggro
					this.aggroTarget = null;
				} else {
					return { nearest: p, dist: this.distTo(p) };
				}
			} else {
				this.aggroUntil = 0; // el agresor se desconectó: pierde el aggro
			}
		}
		let nearest = null,
			best = Infinity;
		const safe = mobSpawn.spawnSafeRadius > 0 ? mobSpawn.getSafeSpawn() : null;
		for (const p of players.values()) {
			if (p.gamemode === "creative") continue; // B6: sin aggro a creativos
			// B2: los hostiles no targetean a jugadores dentro de la zona segura
			// del spawn (el recién llegado se orienta; al salir del radio vuelven
			// a ser objetivo).
			if (
				safe &&
				Math.hypot(p.x - safe.x, p.z - safe.z) < mobSpawn.spawnSafeRadius
			)
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
	// hay ningún bloque sólido entre la cabeza y el cielo (WORLD_MAX_Y). Los
	// árboles, techos y montañas dan sombra: un mob bajo techo no arde. El
	// AGUA también bloquea el sol (un no-muerto sumergido no arde, como en
	// Minecraft: el agua apaga el fuego) — por eso el check es contra sólido
	// O agua, no solo contra sólido.
	exposedToSky() {
		const x = Math.floor(this.x),
			z = Math.floor(this.z);
		// Fase 15 (D5): el cielo llega hasta WORLD_MAX_Y (63), no WORLD_HEIGHT
		// (128 — ahora es el TAMAÑO del mundo en Y, no su tope).
		for (let y = Math.floor(this.y + 1.5); y <= WORLD_MAX_Y; y++) {
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
	tickSunBurn(isNight, isDay) {
		const burns = BURNS_IN_SUN.has(this.type);
		// Fase 18 (C-1): la quema solar ocurre solo en el DÍA ESTRICTO (sin
		// crepúsculos). Retrocompatible: si llaman sin isDay (tests), se infiere
		// de isNight como antes.
		const isDayPhase = isDay !== undefined ? isDay : !isNight;
		if (!burns || !isDayPhase || !this.exposedToSky()) {
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
						// C5 (REN-2): igual con el horno — contenido protegido, vacío
						// se rompe y se limpia su estado (sin huérfanos).
						if (block === B.FURNACE) {
							const f = state.furnaces.get(`${bx},${by},${bz}`);
							if (f && (f.inputItem || f.fuelItem || f.outputItem)) continue;
							state.furnaces.delete(`${bx},${by},${bz}`);
						}
						world.setBlock(bx, by, bz, B.AIR);
					}
				}
			}
		}
		this.alive = false;
	}

	tick(isNight, isDay) {
		// Los bebés crecen con el tiempo hasta hacerse adultos
		if (this.isBaby) {
			this.age += TICK_MS;
			if (this.age >= 60000) this.isBaby = false;
		}
		// Knockback de TNT (Fase 20 B3): el impulso que puso el servidor al
		// explotar se integra aquí (los mobs son simulados en el servidor).
		// Mientras dura, el mob "vuela" y su IA se pausa (breve aturdimiento
		// estilo MC); la fricción 0.8 decae el impulso y la gravedad lo hace
		// caer hasta aterrizar (settleOnGround lo apoya en el suelo).
		if (this.kb && this.kb.ttl > 0) {
			this.kb.ttl--;
			this.x += this.kb.vx;
			this.y += this.kb.vy;
			this.z += this.kb.vz;
			this.kb.vx *= 0.8;
			this.kb.vz *= 0.8;
			this.kb.vy -= 0.02; // gravedad por tick
			if (this.kb.ttl <= 0) this.kb = null;
			this.settleOnGround();
			return;
		}
		// Quema solar: antes del comportamiento, para que un no-muerto en llamas
		// no siga persiguiendo mientras arde (y para que el flag llegue al
		// snapshot en el mismo tick). Fase 18 (C-1): recibe además el día
		// estricto de las franjas MC (opcional; sin él conserva !isNight).
		this.tickSunBurn(isNight, isDay);
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
	// Fase 18 (D-2): las IA viven como funciones planas en mob-species.js —
	// el switch llama a las variables `let` inyectadas tras createSpecies.
	tickSpecies(isNight, nearest, dist) {
		const hostiles = HOSTILE.has(this.type);
		if (!hostiles) {
			// Fase 9 (Bloque F): la abeja tiene su propio movimiento volador 3D
			// (no usa el suelo); el resto de pasivos usan tickPassive. Fase 12:
			// el ocelote huye del jugador (radio 8) y el gato domado sigue al
			// dueño — IA propia antes del genérico.
			if (this.type === "bee") tickBee(this);
			else if (this.type === "ocelot") tickOcelot(this, isNight, nearest, dist);
			else if (this.type === "cat") tickCat(this, nearest, dist);
			else tickPassive(this, isNight);
			return;
		}
		switch (this.type) {
			case "zombie":
				tickZombie(this, isNight, nearest, dist);
				break;
			case "spider":
				tickSpider(this, isNight, nearest, dist);
				break;
			case "wolf":
				tickWolf(this, isNight, nearest, dist);
				break;
			case "slime": // Fase 12 (A2): salta en vez de caminar y se divide al morir
				tickSlime(this, isNight, nearest, dist);
				break;
			case "drowned": // Fase 12 (A4): nada, ataca y lanza tridentes
				tickDrowned(this, isNight, nearest, dist);
				break;
			case "creeper":
				tickCreeper(this, isNight, nearest, dist);
				break;
			case "skeleton":
				tickSkeleton(this, isNight, nearest, dist);
				break;
			case "enderman":
				tickEnderman(this, isNight, nearest, dist);
				break;
		}
	}

	// Al ser golpeado por un jugador (attack_mob): los pasivos huyen durante
	// ~4s en dirección contraria al atacante (Fase 9, Bloque D). Notas del
	// usuario: los HOSTILES reaccionan volviéndose agresivos con el atacante
	// (aggro, MOB_AGGRO_MS): lo persiguen y atacan aunque sea de día, como en
	// Minecraft — antes no hacían nada al ser golpeados.
	mobHit(attacker) {
		if (HOSTILE.has(this.type)) {
			// Fase 17 (B6): golpear a un jugador en CREATIVO no genera aggro (los
			// hostiles no agreden a creativos, ni siquiera si se les golpea).
			if (attacker?.gamemode === "creative") return;
			this.aggroUntil = Date.now() + MOB_AGGRO_MS;
			this.aggroTarget = attacker.id;
			// Fase 21 (C3): el ZOMBI convoca a otros zombis al recibir daño
			// (como MC: los zombis avisan a los vecinos). Los zombis a ≤16
			// bloques se vuelven hostiles contra el MISMO atacante.
			if (this.type === "zombie" && attacker) {
				for (const m of state.mobs) {
					if (m.alive && m.type === "zombie" && m.id !== this.id) {
						if (Math.hypot(m.x - this.x, m.z - this.z) <= 16) {
							m.aggroUntil = Date.now() + MOB_AGGRO_MS;
							m.aggroTarget = attacker.id;
						}
					}
				}
			}
			return;
		}
		this.fleeUntil = Date.now() + 4000;
		this.fleeFrom = {
			x: 2 * this.x - attacker.x,
			z: 2 * this.z - attacker.z
		};
		this.wanderPauseUntil = 0; // el susto interrumpe la pausa
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
// ESPECIES Y SPAWN (Fase 18, D-2)
// Las subclases por especie (mob-species.js) y el spawn por bioma con su
// zona segura (mob-spawn.js) se extrajeron a módulos propios; aquí solo se
// cablean: la fábrica recibe la clase base Mob y devuelve las clases +
// MOB_CLASSES + createMob + los helpers de interacción. mobs.js queda con la
// clase base Mob (tick/chase/flee/attack), fábricas, snapshot/broadcast,
// drops y orbes.
// ============================================================
// Una sola llamada a la fábrica: clases + fábrica + IA por especie + helpers.
// Las funciones planas de IA se asignan a las variables `let` de arriba (el
// switch de la clase base las resuelve en tiempo de llamada, no de definición).
({
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
	catNearby,
	canTame,
	applyTame,
	sitPet,
	petsJoinAttack,
	canFeed,
	applyFeed,
	canShear,
	applyShear,
	SHEAR_RANGE,
	SLIME_HEALTH,
	SLIME_DAMAGE,
	tickZombie,
	tickSpider,
	tickWolf,
	tickCreeper,
	tickSkeleton,
	tickEnderman,
	tickPassive,
	tickOcelot,
	tickCat,
	_tickPet,
	tickSlime,
	tickDrowned,
	tickBee,
	splitSlime,
	isPlayerLookingAt,
	isEndermanWatched,
	mobDrops
} = require("./mob-species.js").createSpecies(Mob));

// El spawn (mob-spawn.js) consume createMob: no puede requerir este módulo
// sin crear un ciclo, así que se lo inyectamos al cargar.
mobSpawn.setCreateMob(createMob);

// ============================================================
// ORBES DE XP (Fase 18, C-8 — B12: XP al morir recogible)
// Al morir en survival el servidor suelta un orbe con la XP del jugador en
// su posición de muerte (entidad tipo `xp_orb` dentro de state.mobs, reusa
// el patrón de proyección de mobs). Al caminar encima (radio ~2 bloques) se
// recoge y la XP vuelve al jugador. NO se persisten: se pierden al reiniciar
// el servidor (como en sesiones cortas del clon — documentado en
// docs/server/mecanicas.md) y el filtro de guardado de save.js los excluye.
// En creative la XP se conserva (no se suelta orbe). El cliente los pinta
// como esferitas verdes con tamaño por XP.
// ============================================================
const XP_ORB_RADIUS = 2; // radio de recogida (bloques, como MC)
const XP_ORB_TTL_MS = 5 * 60 * 1000; // expiran a los 5 min (paridad MC)

// Crea el orbe en la posición de muerte con la XP del jugador.
function spawnXpOrb(x, y, z, xp) {
	if (!(xp > 0)) return null;
	const orb = {
		id: uuidv4(),
		type: "xp_orb",
		x,
		y,
		z,
		xp,
		alive: true,
		state: "idle",
		color: 0x63e463, // verde brillante estilo MC
		bornAt: Date.now()
	};
	state.mobs.push(orb);
	return orb;
}

// Recorre los orbes vivos: expira los viejos (5 min) y recoge los que un
// jugador pise (radio XP_ORB_RADIUS en 2D — como MC, el orbe se recoge al
// caminar encima). La XP recogida se re-añade con addXp (curva MC).
function tickXpOrbs() {
	const now = Date.now();
	const playersArr = [...state.players.values()];
	for (const orb of state.mobs) {
		if (!orb.alive || orb.type !== "xp_orb") continue;
		// Expiración: los orbes se pierden si no se recogen (paridad MC 5 min).
		if (now - (orb.bornAt || 0) > XP_ORB_TTL_MS) {
			orb.alive = false;
			continue;
		}
		// Recogida: jugador a radio 2 (horizontal; el orbe está en el suelo).
		for (const p of playersArr) {
			if (p.inMenu) continue;
			if (Math.hypot(p.x - orb.x, p.z - orb.z) <= XP_ORB_RADIUS) {
				addXp(p, orb.xp);
				orb.alive = false;
				break;
			}
		}
	}
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
		// Fase 18 (C-8): los orbes de XP llevan su cantidad (el cliente escala
		// el tamaño del orbe con ella, como el tamaño del slime).
		xp: m.type === "xp_orb" ? m.xp : undefined,
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

// Restaura los mobs desde el guardado (meta): recrea cada uno con la fábrica
// (clase correcta por tipo) y conserva el estado persistido (salud, cría,
// tamaño del slime, mascotas).
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

// Fase 18 (D-2): inyectar mobDrops/mobXp al módulo de proyectiles (evita el
// ciclo mobs→projectiles→mobs; las funciones ya están definidas en este
// punto del cargue).
projectiles.setMobDrops(mobDrops);
projectiles.setMobXp(mobXp);

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
	// Fase 18 (D-2): el spawn vive en mob-spawn.js (re-exportado como fachada).
	spawnMobs: mobSpawn.spawnMobs,
	mobSnapshot,
	restoreMobs,
	mobDrops,
	canFeed,
	applyFeed,
	canShear,
	applyShear,
	SHEAR_RANGE,
	getSafeSpawn: mobSpawn.getSafeSpawn,
	setSpawnSafeRadius: mobSpawn.setSpawnSafeRadius,
	// Fase 18 (D-2): fachadas de proyectiles — el bloque vive en projectiles.js
	// y se re-exporta aquí para no cambiar ni los imports de net.js ni los de
	// los tests (unit-mobs-ia, unit-fase12, unit-lagunas, e2e-templo).
	tickArrows: projectiles.tickArrows,
	arrowSnapshot: projectiles.arrowSnapshot,
	shootPlayerArrow: projectiles.shootPlayerArrow,
	returnPlayerArrow: projectiles.returnPlayerArrow,
	mobXp, // auditoría §4.1: XP por tamaño (slime)
	canTame,
	applyTame,
	sitPet,
	catNearby,
	splitSlime,
	petsJoinAttack,
	shootTrident: projectiles.shootTrident,
	throwPlayerTrident: projectiles.throwPlayerTrident,
	// Fase 12 (Bloque B): trampa del templo — las flechas del dispensador
	// reusan shootArrow con un shooter sintético (from: null → dañan a todos).
	shootArrow: projectiles.shootArrow,
	// Fase 12 (Bloque C): spawn por bioma — la tabla BIOME_SPAWN y el pool de
	// agua (la prueban los tests de muestreo determinista de unit-fase12).
	// Fase 18 (D-2): ahora viven en mob-spawn.js (re-exportadas como fachada).
	BIOME_SPAWN: mobSpawn.BIOME_SPAWN,
	WATER_SPAWN: mobSpawn.WATER_SPAWN,
	// Fase 18 (C-8): orbes de XP al morir (recogibles en el punto de muerte)
	spawnXpOrb,
	tickXpOrbs,
	XP_ORB_RADIUS,
	// Exponer las constantes por tamaño (para tests y paridad).
	SLIME_HEALTH,
	SLIME_DAMAGE,
	// Fase 21 (C2): neutralidad del enderman — helpers de la mecánica "lo
	// provoca mirarlo" (los tests los verifican en unit-mobs-ia).
	isPlayerLookingAt,
	isEndermanWatched,
	// Fase 21 (C2): el tick del enderman se re-exporta para poder probarlo
	// directamente (los del switch viajan por las variables `let`; el módulo
	// lo expone como fachada como ya hacen tickZombie/tickSkeleton/…).
	tickEnderman
};
