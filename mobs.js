'use strict';

// ============================================================
// IA DE MOBS
// ============================================================
const { v4: uuidv4 } = require('uuid');
const { MOB_COLORS, HOSTILE, B } = require('./constants.js');
const state = require('./state.js');
const world = require('./world.js');
const { damagePlayer } = require('./players.js');

const { players } = state;

class Mob {
  constructor(type, x, y, z) {
    this.id = uuidv4();
    this.type = type;
    this.x = x; this.y = y; this.z = z;
    this.health = type === 'creeper' ? 20 : (HOSTILE.has(type) ? 20 : 10);
    this.state = 'idle';
    this.attackCooldown = 0;
    this.teleportCooldown = 0;
    this.targetX = x; this.targetZ = z;
    this.color = MOB_COLORS[type] || 0x999999;
    this.alive = true;
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
    if (below === B.AIR) this.y -= 0.04;
    else if (head !== B.AIR) this.y += 0.06;
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
    const { nearest, dist } = this.findNearestPlayer();
    switch (this.type) {
      case 'zombie':
        if (nearest && (isNight || dist < 6)) {
          this.state = 'chase'; this.moveToward(nearest, 0.035);
          if (dist < 1.6) this.attack(nearest, 2, 1000);
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
  const types = ['zombie', 'creeper', 'skeleton', 'cow', 'pig', 'chicken', 'sheep'];
  for (let i = 0; i < 3; i++) {
    const wx = cx + (Math.random() - 0.5) * 50;
    const wz = cz + (Math.random() - 0.5) * 50;
    const wy = world.getHeight(Math.floor(wx), Math.floor(wz)) + 1;
    const type = types[Math.floor(Math.random() * types.length)];
    state.mobs.push(new Mob(type, wx, wy, wz));
  }
}

function mobSnapshot(m) {
  return { id: m.id, x: m.x, y: m.y, z: m.z, type: m.type, color: m.color, state: m.state };
}

function restoreMobs(list) {
  return (list || []).map((m) => {
    const mob = new Mob(m.type, m.x, m.y, m.z);
    mob.id = m.id; mob.health = m.health;
    return mob;
  });
}

module.exports = { Mob, spawnMobs, mobSnapshot, restoreMobs };
