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
	WORLD_HEIGHT
} = require("./constants.js");

// Salud por tipo (por defecto: hostiles 20, pasivos 10); la araña es frágil
// pero rápida, el lobo es un hostil más resistente.
const MOB_HEALTH = {
	spider: 12,
	wolf: 20,
	zombie: 20,
	creeper: 20,
	skeleton: 20,
	enderman: 20
};
const state = require("./state.js");
const world = require("./world.js");
const { damagePlayer } = require("./players.js");

const { players } = state;

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
	}

	distTo(p) {
		const dx = p.x - this.x,
			dz = p.z - this.z;
		return Math.sqrt(dx * dx + dz * dz);
	}

	findNearestPlayer() {
		let nearest = null,
			best = Infinity;
		for (const p of players.values()) {
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
		switch (this.type) {
			case "zombie":
				if (nearest && (isNight || dist < 6)) {
					this.state = "chase";
					this.moveToward(nearest, 0.035);
					if (dist < 1.6) this.attack(nearest, 2, 1000);
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
			case "spider": // Fase 5: hostil rápido y frágil
				if (nearest && (isNight || dist < 8)) {
					this.state = "chase";
					this.moveToward(nearest, 0.055);
					if (dist < 1.7) this.attack(nearest, 2, 900);
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
			case "wolf": // Fase 5: hostil resistente de la noche
				if (nearest && (isNight || dist < 8)) {
					this.state = "chase";
					this.moveToward(nearest, 0.04);
					if (dist < 1.8) this.attack(nearest, 3, 1200);
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
			case "creeper":
				if (nearest && dist < 10) {
					this.state = "chase";
					this.moveToward(nearest, 0.045);
					if (dist < 2.5) this.explode();
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
			case "skeleton":
				if (nearest && (isNight || dist < 8)) {
					this.state = "chase";
					if (dist < 4)
						this.moveToward(
							{ x: 2 * this.x - nearest.x, z: 2 * this.z - nearest.z },
							0.03
						);
					else if (dist > 8) this.moveToward(nearest, 0.03);
					if (dist < 15) this.attack(nearest, 2, 1500);
				} else {
					this.state = "idle";
					this.wander();
				}
				break;
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
			default: // pasivos
				if (nearest && dist < 4) {
					this.state = "flee";
					this.moveToward(
						{ x: 2 * this.x - nearest.x, z: 2 * this.z - nearest.z },
						0.03
					);
				} else {
					this.state = "idle";
					this.wander();
				}
		}
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
	day: ["cow", "pig", "chicken", "sheep", "rabbit"],
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
		"rabbit"
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
			}
			const wy = world.getHeight(Math.floor(wx), Math.floor(wz)) + 1;
			const mob = new Mob(type, wx, wy, wz);
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
		burning: m.burning
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
const OTHER_DROPS = {
	spider: { id: I.STRING, min: 0, max: 2 },
	cow: { id: I.LEATHER, min: 0, max: 2 },
	rabbit: { id: I.LEATHER, min: 0, max: 1 }
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

module.exports = {
	Mob,
	spawnMobs,
	mobSnapshot,
	restoreMobs,
	mobDrops,
	canFeed,
	applyFeed
};
