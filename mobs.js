'use strict';

// ============================================================
// IA DE MOBS
// ============================================================
const { v4: uuidv4 } = require('uuid');
const { MOB_COLORS, HOSTILE, B, I, TICK_MS, BREED_FOOD, isSolidBlock } = require('./constants.js');

// Salud por tipo (por defecto: hostiles 20, pasivos 10); la araña es frágil
// pero rápida, el lobo es un hostil más resistente.
const MOB_HEALTH = {
  spider: 12, wolf: 20, zombie: 20, creeper: 20, skeleton: 20, enderman: 20,
};
const state = require('./state.js');
const world = require('./world.js');
const { damagePlayer } = require('./players.js');

const { players } = state;

class Mob {
  constructor(type, x, y, z) {
    this.id = uuidv4();
    this.type = type;
    this.x = x; this.y = y; this.z = z;
    this.health = MOB_HEALTH[type] ?? (HOSTILE.has(type) ? 20 : 10);
    this.state = 'idle';
    this.attackCooldown = 0;
    this.teleportCooldown = 0;
    this.targetX = x; this.targetZ = z;
    this.color = MOB_COLORS[type] || 0x999999;
    this.alive = true;
    // Cría (Fase 3): estado de reproducción y crecimiento
    this.loveUntil = 0;        // fin del modo amor (timestamp)
    this.cooldownUntil = 0;    // fin del cooldown de cría (timestamp)
    this.isBaby = false;       // los bebés crecen hasta hacerse adultos
    this.age = 0;              // ms acumulados de vida como bebé
  }

  distTo(p) { const dx = p.x - this.x, dz = p.z - this.z; return Math.sqrt(dx * dx + dz * dz); }

  findNearestPlayer() {
    let nearest = null, best = Infinity;
    for (const p of players.values()) {
      const d = this.distTo(p);
      if (d < best) { best = d; nearest = p; }
    }
    return { nearest, dist: best };
  }

  wander() {
    if (Math.random() < 0.01) {
      this.targetX = this.x + (Math.random() - 0.5) * 10;
      this.targetZ = this.z + (Math.random() - 0.5) * 10;
    }
    const dx = this.targetX - this.x, dz = this.targetZ - this.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.5) { this.x += (dx / len) * 0.01; this.z += (dz / len) * 0.01; }
    this.settleOnGround();
  }

  moveToward(target, speed) {
    const dx = target.x - this.x, dz = target.z - this.z;
    const len = Math.hypot(dx, dz);
    if (len > 0.4) { this.x += (dx / len) * speed; this.z += (dz / len) * speed; }
    this.settleOnGround();
  }

  settleOnGround() {
    const below = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z));
    const head = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.6), Math.floor(this.z));
    // El agua no es sólida (se nada en ella): el mob se hunde a través de la
    // superficie y descansa en el fondo del lago, en vez de "caminar" sobre ella.
    // El bloque de la cabeza solo empuja hacia arriba si es sólido: con el agua
    // en la cabeza (mob sumergido) no debe subir a la superficie.
    if (!isSolidBlock(below)) this.y -= 0.04;
    else if (isSolidBlock(head)) this.y += 0.06;
  }

  attack(player, dmg, cooldownMs) {
    if (this.attackCooldown > Date.now()) return;
    damagePlayer(player, dmg);
    this.attackCooldown = Date.now() + cooldownMs;
  }

  explode() {
    for (const p of players.values()) {
      if (this.distTo(p) < 3.5) damagePlayer(p, 10);
    }
    for (let dx = -2; dx <= 2; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          if (Math.random() < 0.4) {
            world.setBlock(Math.floor(this.x + dx), Math.floor(this.y + dy), Math.floor(this.z + dz), B.AIR);
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
    const { nearest, dist } = this.findNearestPlayer();
    switch (this.type) {
      case 'zombie':
        if (nearest && (isNight || dist < 6)) {
          this.state = 'chase'; this.moveToward(nearest, 0.035);
          if (dist < 1.6) this.attack(nearest, 2, 1000);
        } else { this.state = 'idle'; this.wander(); }
        break;
      case 'spider': // Fase 5: hostil rápido y frágil
        if (nearest && (isNight || dist < 8)) {
          this.state = 'chase'; this.moveToward(nearest, 0.055);
          if (dist < 1.7) this.attack(nearest, 2, 900);
        } else { this.state = 'idle'; this.wander(); }
        break;
      case 'wolf': // Fase 5: hostil resistente de la noche
        if (nearest && (isNight || dist < 8)) {
          this.state = 'chase'; this.moveToward(nearest, 0.04);
          if (dist < 1.8) this.attack(nearest, 3, 1200);
        } else { this.state = 'idle'; this.wander(); }
        break;
      case 'creeper':
        if (nearest && dist < 10) {
          this.state = 'chase'; this.moveToward(nearest, 0.045);
          if (dist < 2.5) this.explode();
        } else { this.state = 'idle'; this.wander(); }
        break;
      case 'skeleton':
        if (nearest && (isNight || dist < 8)) {
          this.state = 'chase';
          if (dist < 4) this.moveToward({ x: 2 * this.x - nearest.x, z: 2 * this.z - nearest.z }, 0.03);
          else if (dist > 8) this.moveToward(nearest, 0.03);
          if (dist < 15) this.attack(nearest, 2, 1500);
        } else { this.state = 'idle'; this.wander(); }
        break;
      case 'enderman':
        if (nearest && dist < 16 && Math.random() < 0.02 && this.teleportCooldown < Date.now()) {
          const angle = Math.random() * Math.PI * 2, radius = 2 + Math.random() * 3;
          this.x = nearest.x + Math.cos(angle) * radius;
          this.z = nearest.z + Math.sin(angle) * radius;
          this.y = world.getHeight(Math.floor(this.x), Math.floor(this.z)) + 1;
          this.teleportCooldown = Date.now() + 3000;
          this.state = 'chase';
        } else if (nearest && dist < 2.5) {
          this.attack(nearest, 4, 1500);
        } else { this.state = 'idle'; this.wander(); }
        break;
      default: // pasivos
        if (nearest && dist < 4) { this.state = 'flee'; this.moveToward({ x: 2 * this.x - nearest.x, z: 2 * this.z - nearest.z }, 0.03); }
        else { this.state = 'idle'; this.wander(); }
    }
  }
}

function spawnMobs() {
  if (state.mobs.length > 30 || players.size === 0) return;
  const anyPlayer = players.values().next().value;
  const cx = Math.floor(anyPlayer.x), cz = Math.floor(anyPlayer.z);
  const types = ['zombie', 'creeper', 'skeleton', 'spider', 'wolf', 'cow', 'pig', 'chicken', 'sheep', 'rabbit'];
  for (let i = 0; i < 3; i++) {
    const wx = cx + (Math.random() - 0.5) * 50;
    const wz = cz + (Math.random() - 0.5) * 50;
    const wy = world.getHeight(Math.floor(wx), Math.floor(wz)) + 1;
    const type = types[Math.floor(Math.random() * types.length)];
    state.mobs.push(new Mob(type, wx, wy, wz));
  }
}

function mobSnapshot(m) {
  return { id: m.id, x: m.x, y: m.y, z: m.z, type: m.type, color: m.color, state: m.state, isBaby: m.isBaby };
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
  rabbit: { id: I.RABBIT, min: 1, max: 2 }, // Fase 5: nuevo pasivo
};
// Drops no comestibles (Fase 5): la araña suelta hilo (para lana)
const OTHER_DROPS = {
  spider: { id: I.STRING, min: 0, max: 2 },
};

// Devuelve [{ id, count }] para el tipo o null si no dropea nada.
// Los bebés no sueltan comida (como en Minecraft).
function mobDrops(mob) {
  if (mob.isBaby) return null;
  const d = FOOD_DROPS[mob.type] || OTHER_DROPS[mob.type];
  if (!d) return null;
  const count = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
  return count > 0 ? [{ id: d.id, count }] : null;
}

// ============================================================
// CRÍA DE ANIMALES (Fase 3): dar item → modo amor → pareja → bebé
// ============================================================
const LOVE_WINDOW_MS = 30000;    // el modo amor dura 30s buscando pareja
const BREED_COOLDOWN_MS = 60000; // cooldown de cría tras criar (60s)
const BREED_RANGE = 8;           // distancia máxima entre la pareja (bloques)
const GROWUP_MS = 60000;         // un bebé tarda 60s en hacerse adulto

// ¿Se puede alimentar a este mob con el ítem? 'ok' o el motivo del rechazo.
function canFeed(mob, itemId) {
  if (mob.isBaby) return 'baby';
  if (Date.now() < mob.cooldownUntil) return 'cooldown';
  if (BREED_FOOD[mob.type] !== itemId) return 'wrongfood';
  return 'ok';
}

// Alimentar al mob: entra en modo amor y busca pareja del mismo tipo ya
// alimentada cerca. Si la encuentra, cría un bebé entre ambos (los padres
// entran en cooldown) y lo devuelve; si no, espera hasta LOVE_WINDOW_MS.
function applyFeed(mob, mobs) {
  mob.loveUntil = Date.now() + LOVE_WINDOW_MS;
  const partner = mobs.find((m) =>
    m.id !== mob.id && m.alive && !m.isBaby && m.type === mob.type &&
    m.loveUntil > Date.now() &&
    Math.hypot(m.x - mob.x, m.z - mob.z) < BREED_RANGE
  );
  if (!partner) return null;
  mob.loveUntil = 0; partner.loveUntil = 0;
  mob.cooldownUntil = Date.now() + BREED_COOLDOWN_MS;
  partner.cooldownUntil = Date.now() + BREED_COOLDOWN_MS;
  const baby = new Mob(mob.type, (mob.x + partner.x) / 2, Math.min(mob.y, partner.y), (mob.z + partner.z) / 2);
  baby.isBaby = true;
  baby.age = 0;
  state.mobs.push(baby);
  return baby;
}

function restoreMobs(list) {
  return (list || []).map((m) => {
    const mob = new Mob(m.type, m.x, m.y, m.z);
    mob.id = m.id; mob.health = m.health;
    mob.isBaby = !!m.isBaby; mob.age = m.age || 0; // retrocompatible: faltan en guardados viejos
    return mob;
  });
}

module.exports = { Mob, spawnMobs, mobSnapshot, restoreMobs, mobDrops, canFeed, applyFeed };
