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
	worldPaths
} = require("./constants.js");

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
// pero rápida, el lobo es un hostil más resistente.
const MOB_HEALTH = {
	spider: 12,
	wolf: 20,
	zombie: 20,
	creeper: 20,
	skeleton: 20,
	enderman: 20,
	bee: 5 // Fase 9 (Bloque F): pasivo volador frágil (versión simplificada)
};
const state = require("./state.js");
const world = require("./world.js");
const { damagePlayer } = require("./players.js");
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

// Avanza las flechas (dtMs) y aplica daño al primer jugador que intersecten.
// Devuelve las flechas vivas para el broadcast (arrows_update).
function tickArrows(dtMs) {
	const dt = dtMs / 1000;
	const alive = [];
	for (const a of state.arrows) {
		a.life -= dtMs;
		if (a.life <= 0) continue;
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
		let hit = false;
		for (const p of players.values()) {
			if (Math.hypot(p.x - a.x, p.y - a.y, p.z - a.z) < ARROW_HIT_DIST) {
				damagePlayer(p, ARROW_DAMAGE, {
					source: "mob",
					meta: { mobType: "skeleton", projectile: true }
				});
				hit = true;
				break;
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
		if (!hit) alive.push(a);
	}
	state.arrows = alive;
	return alive;
}

function arrowSnapshot(a) {
	return { x: a.x, y: a.y, z: a.z, vx: a.vx, vy: a.vy, vz: a.vz };
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
			if (this.distTo(p) < 3.5)
				damagePlayer(p, 10, {
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
		const hostiles = HOSTILE.has(this.type);
		if (!hostiles) {
			// Fase 9 (Bloque F): la abeja tiene su propio movimiento volador 3D
			// (no usa el suelo); el resto de pasivos usan tickPassive.
			if (this.type === "bee") tickBee(this);
			else this.tickPassive(isNight, nearest, dist);
			return;
		}
		switch (this.type) {
			case "zombie":
				if (nearest && (isNight || dist < 6)) {
					this.state = "chase";
					this.chase(nearest, 0.035);
					if (dist < 1.6) this.attack(nearest, 2, 1000);
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
			case "spider": // Fase 5: hostil rápido y frágil; Fase 9: escala y salta
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
				break;
			case "wolf": // Fase 5: hostil resistente de la noche
				if (nearest && (isNight || dist < 8)) {
					this.state = "chase";
					this.chase(nearest, 0.04);
					if (dist < 1.8) this.attack(nearest, 3, 1200);
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
			case "creeper": {
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
				break;
			}
			case "skeleton": {
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
				break;
			}
			case "enderman":
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
					this.attack(nearest, 4, 1500);
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
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
const SPAWN_TYPES = {
	day: ["cow", "pig", "chicken", "sheep", "rabbit", "bee"],
	night: [
		"zombie",
		"creeper",
		"skeleton",
		"spider",
		"wolf",
		"cow",
		"pig",
		"chicken",
		"sheep",
		"rabbit",
		"bee"
	]
};

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
			if (world.isLake?.(Math.floor(wx), Math.floor(wz))) continue; // sin mobs en lagos
			const type = types[Math.floor(Math.random() * types.length)];
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
			const hx = Math.floor(wx),
				hz = Math.floor(wz);
			const surfaceH = world.getHeight(hx, hz);
			// Fase 10 (A6): hostiles también de DÍA, solo en zonas oscuras
			// (cuevas con techo opaco) — las notas pedían "solo por la noche o
			// en zonas oscuras como las cuevas". De noche siguen saliendo en
			// superficie; de día se buscan celdas de cueva oscuras.
			let wy;
			if (HOSTILE.has(type) && !isNight) {
				const caveY = world.findDarkCaveY(hx, hz, surfaceH);
				if (caveY == null) continue; // sin cueva en esta columna: no spawn de día
				wy = caveY + 0.5;
			} else {
				wy = surfaceH + 1;
			}
			const mob = new Mob(type, wx, wy, wz);
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
		fuse: m.state === "fuse" ? 1 : 0
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
	skeleton: { id: I.BONE, min: 0, max: 2 }
};

// Devuelve [{ id, count }] para el tipo o null si no dropea nada. Un mob
// puede soltar comida Y su drop secundario (vaca: carne + cuero, como en
// Minecraft). Los bebés no sueltan nada.
function mobDrops(mob) {
	if (mob.isBaby) return null;
	const drops = [];
	for (const table of [FOOD_DROPS[mob.type], OTHER_DROPS[mob.type]]) {
		if (!table) continue;
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
	const baby = new Mob(
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
		const mob = new Mob(m.type, m.x, m.y, m.z);
		mob.id = m.id;
		mob.health = m.health;
		mob.isBaby = !!m.isBaby;
		mob.age = m.age || 0; // retrocompatible: faltan en guardados viejos
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
const BEE_HEALTH = 5;
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
	spawnMobs,
	mobSnapshot,
	restoreMobs,
	mobDrops,
	canFeed,
	applyFeed,
	getSafeSpawn,
	setSpawnSafeRadius,
	tickArrows,
	arrowSnapshot,
	BEE_HEALTH
};
