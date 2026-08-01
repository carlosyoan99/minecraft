'use strict';

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const { createNoise2D } = require('simplex-noise');
const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURACIÓN
// ============================================================
const PORT = process.env.PORT || 3000;
const CHUNK_SIZE = 16;
const WORLD_HEIGHT = 64;
const TICK_MS = 50;                 // 20 ticks por segundo
const SAVE_INTERVAL_MS = 30000;     // Guardar cada 30s
const VIEW_DISTANCE_CHUNKS = 6;     // Chunks generados alrededor de cada jugador al conectar
const DAY_CYCLE_MS = 240000;        // 4 minutos: 2 de día, 2 de noche
const SEED = 'miSemilla2026';

function seededNoise(seedStr) {
  // PRNG determinista simple (mulberry32) sembrado con el string, para
  // que el mundo sea siempre el mismo entre reinicios del servidor.
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function () {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}
const noise2D = createNoise2D(seededNoise(SEED));
const noise2D_detail = createNoise2D(seededNoise(SEED + '_detail'));
const noise2D_ore = createNoise2D(seededNoise(SEED + '_ore'));

// ============================================================
// BLOQUES E ÍTEMS
// ============================================================
const B = {
  AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, OAK_LOG: 4, OAK_LEAVES: 5,
  SAND: 6, PLANKS: 7, COBBLESTONE: 8, COAL_ORE: 9, IRON_ORE: 10,
  GOLD_ORE: 11, DIAMOND_ORE: 12, REDSTONE_ORE: 13, EMERALD_ORE: 14,
  CRAFTING_TABLE: 15, FURNACE: 16, GLASS: 17, WOOL: 18, BEDROCK: 19,
};
const I = {
  STICK: 100, COAL: 101, IRON_INGOT: 102, GOLD_INGOT: 103, DIAMOND: 104,
  REDSTONE: 105, EMERALD: 106,
  WOODEN_PICKAXE: 200, STONE_PICKAXE: 201, IRON_PICKAXE: 202, GOLDEN_PICKAXE: 203, DIAMOND_PICKAXE: 204,
  WOODEN_AXE: 205, STONE_AXE: 206, IRON_AXE: 207, GOLDEN_AXE: 208, DIAMOND_AXE: 209,
  WOODEN_SHOVEL: 210, STONE_SHOVEL: 211, IRON_SHOVEL: 212, GOLDEN_SHOVEL: 213, DIAMOND_SHOVEL: 214,
  WOODEN_SWORD: 215, STONE_SWORD: 216, IRON_SWORD: 217, GOLDEN_SWORD: 218, DIAMOND_SWORD: 219,
};
const NOT_MINEABLE = new Set([B.AIR, B.BEDROCK]);
const FUEL_ITEMS = new Set([B.OAK_LOG, B.PLANKS, I.STICK]);
const isPickaxe = (id) => id >= 200 && id <= 204;
const isAxe = (id) => id >= 205 && id <= 209;
const isShovel = (id) => id >= 210 && id <= 214;

// ============================================================
// ESTADO DEL MUNDO
// ============================================================
const chunks = new Map();      // "cx,cz" -> Uint8Array(16*64*16)
const players = new Map();     // id -> player
const furnaces = new Map();    // "x,y,z" -> { fuelItem, fuelTicks, inputItem, progress, requiredTicks, outputItem, outputCount }
let mobs = [];

// ============================================================
// GENERACIÓN DE MUNDO
// ============================================================
function getBiome(wx, wz) {
  const temp = noise2D(wx * 0.005, wz * 0.005);
  if (temp < -0.15) return 'desert';
  if (temp > 0.2) return 'forest';
  return 'plains';
}

function getHeight(wx, wz) {
  const biome = getBiome(wx, wz);
  let base = 4;
  if (biome === 'desert') base = 3;
  else if (biome === 'forest') base = 6;
  const h = noise2D(wx * 0.02, wz * 0.02) * 0.5 + 0.5;
  const detail = noise2D_detail(wx * 0.08, wz * 0.08) * 1.5;
  return Math.max(2, Math.floor(base + h * 8 + detail));
}

function idx(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }

function generateChunk(cx, cz) {
  const key = `${cx},${cz}`;
  if (chunks.has(key)) return chunks.get(key);

  const data = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
  const baseX = cx * CHUNK_SIZE, baseZ = cz * CHUNK_SIZE;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const wx = baseX + x, wz = baseZ + z;
      const height = getHeight(wx, wz);
      const biome = getBiome(wx, wz);

      for (let y = 0; y < WORLD_HEIGHT; y++) {
        let block = B.AIR;
        if (y === 0) block = B.BEDROCK;
        else if (y < height - 1) {
          block = B.STONE;
          if (y > 4) {
            const oreRoll = (noise2D_ore(wx * 0.3 + y * 7.1, wz * 0.3) + 1) / 2;
            if (y < 16 && oreRoll > 0.985) block = B.DIAMOND_ORE;
            else if (y < 20 && oreRoll > 0.975) block = B.REDSTONE_ORE;
            else if (y < 30 && oreRoll > 0.965) block = B.EMERALD_ORE;
            else if (y < 30 && oreRoll > 0.95) block = B.GOLD_ORE;
            else if (y < 40 && oreRoll > 0.93) block = B.IRON_ORE;
            else if (y < 50 && oreRoll > 0.9) block = B.COAL_ORE;
          }
        } else if (y === height - 1) {
          block = biome === 'desert' ? B.SAND : B.GRASS;
        }
        data[idx(x, y, z)] = block;
      }

      // Árboles
      if ((biome === 'forest' || biome === 'plains') && Math.random() < (biome === 'forest' ? 0.04 : 0.01)) {
        const treeHeight = 4 + Math.floor(Math.random() * 3);
        for (let i = 1; i <= treeHeight; i++) {
          const y = height + i;
          if (y < WORLD_HEIGHT) data[idx(x, y, z)] = B.OAK_LOG;
        }
        for (let dx = -2; dx <= 2; dx++) {
          for (let dz = -2; dz <= 2; dz++) {
            for (let dy = treeHeight - 1; dy <= treeHeight + 1; dy++) {
              if (Math.abs(dx) === 2 && Math.abs(dz) === 2 && dy === treeHeight + 1) continue;
              const lx = x + dx, lz = z + dz;
              if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) continue;
              const y = height + dy;
              if (y < WORLD_HEIGHT && data[idx(lx, y, lz)] === B.AIR) data[idx(lx, y, lz)] = B.OAK_LEAVES;
            }
          }
        }
      }
    }
  }
  chunks.set(key, data);
  return data;
}

function getBlock(wx, wy, wz) {
  if (wy < 0 || wy >= WORLD_HEIGHT) return B.AIR;
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = chunks.get(`${cx},${cz}`);
  if (!chunk) return B.AIR; // no generado -> tratado como aire hasta que se genere
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk[idx(x, wy, z)];
}

function setBlock(wx, wy, wz, blockId) {
  if (wy < 0 || wy >= WORLD_HEIGHT) return false;
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = generateChunk(cx, cz);
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  chunk[idx(x, wy, z)] = blockId;
  broadcast('block_update', { x: wx, y: wy, z: wz, block: blockId });
  return true;
}

function ensureChunksAround(wx, wz, radius) {
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const generated = [];
  for (let x = cx - radius; x <= cx + radius; x++) {
    for (let z = cz - radius; z <= cz + radius; z++) {
      const key = `${x},${z}`;
      const isNew = !chunks.has(key);
      generateChunk(x, z);
      if (isNew) generated.push(key);
    }
  }
  return generated;
}

// ============================================================
// INVENTARIO (helpers)
// ============================================================
function addToInventory(player, itemId, count = 1) {
  // Apilar en un slot existente del mismo tipo (sin límite de stack, simplificado)
  for (let i = 0; i < player.inventory.length; i++) {
    if (player.inventory[i] && player.inventory[i].id === itemId) {
      player.inventory[i].count += count;
      return true;
    }
  }
  const empty = player.inventory.findIndex((s) => !s);
  if (empty === -1) return false;
  player.inventory[empty] = { id: itemId, count };
  return true;
}

function removeFromInventory(player, itemId, count = 1) {
  for (let i = 0; i < player.inventory.length; i++) {
    const s = player.inventory[i];
    if (s && s.id === itemId) {
      if (s.count > count) { s.count -= count; return true; }
      if (s.count === count) { player.inventory[i] = null; return true; }
      return false;
    }
  }
  return false;
}

function countInInventory(player, itemId) {
  let total = 0;
  for (const s of player.inventory) if (s && s.id === itemId) total += s.count;
  return total;
}

function sendInventory(player) {
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({ event: 'inventory_update', data: { inventory: player.inventory } }));
  }
}

function sendHealth(player) {
  if (player.ws.readyState === WebSocket.OPEN) {
    player.ws.send(JSON.stringify({ event: 'health_update', data: { health: player.health } }));
  }
}

function damagePlayer(player, amount) {
  player.health = Math.max(0, player.health - amount);
  sendHealth(player);
  if (player.health <= 0) {
    broadcast('player_die', { id: player.id });
    // Respawn simple
    player.health = 20;
    player.x = 0.5; player.z = 0.5;
    player.y = getHeight(0, 0) + 2;
    sendHealth(player);
    if (player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(JSON.stringify({ event: 'teleport', data: { x: player.x, y: player.y, z: player.z } }));
    }
  }
}

// ============================================================
// RECETAS (crafteo y horno)
// ============================================================
let recipes = {};
let furnaceRecipes = {};
function loadRecipes() {
  try {
    recipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'recetas.json'), 'utf8'));
    furnaceRecipes = JSON.parse(fs.readFileSync(path.join(__dirname, 'recetas_horno.json'), 'utf8'));
    console.log(`📜 ${Object.keys(recipes).length} recetas de crafteo, ${Object.keys(furnaceRecipes).length} recetas de horno`);
  } catch (e) {
    console.error('⚠️  No se pudieron cargar las recetas:', e.message);
    recipes = {}; furnaceRecipes = {};
  }
}

// grid: array de 9 celdas, cada una null o { id, count }
function matchRecipe(grid) {
  for (const recipe of Object.values(recipes)) {
    const shape = recipe.shape;
    const rows = shape.length, cols = Math.max(...shape.map((r) => r.length));
    // Probar todas las posiciones de desplazamiento posibles dentro del grid 3x3
    for (let offR = 0; offR <= 3 - rows; offR++) {
      for (let offC = 0; offC <= 3 - cols; offC++) {
        let match = true;
        for (let r = 0; r < 3 && match; r++) {
          for (let c = 0; c < 3 && match; c++) {
            const cell = grid[r * 3 + c];
            const inShape = r >= offR && r < offR + rows && c >= offC && c < offC + cols;
            const patternChar = inShape ? (shape[r - offR][c - offC] || ' ') : ' ';
            if (patternChar === ' ') {
              if (cell) match = false;
            } else {
              const expectedId = recipe.ingredients[patternChar];
              if (!cell || cell.id !== expectedId) match = false;
            }
          }
        }
        if (match) return recipe;
      }
    }
  }
  return null;
}

// ============================================================
// IA DE MOBS
// ============================================================
const MOB_COLORS = {
  zombie: 0x3a8f3a, creeper: 0x0ecc0e, skeleton: 0xcfcfcf, enderman: 0x2a0a3a,
  cow: 0x6b4226, pig: 0xf0a8b8, chicken: 0xf2e08a, sheep: 0xf5f5f0,
};
const HOSTILE = new Set(['zombie', 'creeper', 'skeleton', 'enderman']);

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
    const below = getBlock(Math.floor(this.x), Math.floor(this.y - 0.1), Math.floor(this.z));
    const head = getBlock(Math.floor(this.x), Math.floor(this.y + 0.6), Math.floor(this.z));
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
            setBlock(Math.floor(this.x + dx), Math.floor(this.y + dy), Math.floor(this.z + dz), B.AIR);
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
          this.y = getHeight(Math.floor(this.x), Math.floor(this.z)) + 1;
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
  if (mobs.length > 30 || players.size === 0) return;
  const anyPlayer = players.values().next().value;
  const cx = Math.floor(anyPlayer.x), cz = Math.floor(anyPlayer.z);
  const types = ['zombie', 'creeper', 'skeleton', 'cow', 'pig', 'chicken', 'sheep'];
  for (let i = 0; i < 3; i++) {
    const wx = cx + (Math.random() - 0.5) * 50;
    const wz = cz + (Math.random() - 0.5) * 50;
    const wy = getHeight(Math.floor(wx), Math.floor(wz)) + 1;
    const type = types[Math.floor(Math.random() * types.length)];
    mobs.push(new Mob(type, wx, wy, wz));
  }
}

function mobSnapshot(m) {
  return { id: m.id, x: m.x, y: m.y, z: m.z, type: m.type, color: m.color, state: m.state };
}

// ============================================================
// HORNOS
// ============================================================
function getOrCreateFurnace(key) {
  let f = furnaces.get(key);
  if (!f) {
    f = { fuelItem: null, fuelTicksLeft: 0, inputItem: null, progress: 0, requiredTicks: 0, outputItem: null, outputCount: 0 };
    furnaces.set(key, f);
  }
  return f;
}

function furnaceSnapshot(f) {
  return {
    fuelItem: f.fuelItem, fuelTicksLeft: f.fuelTicksLeft,
    inputItem: f.inputItem ? f.inputItem.id : null, inputCount: f.inputItem ? f.inputItem.count : 0,
    progress: f.progress, requiredTicks: f.requiredTicks,
    outputItem: f.outputItem, outputCount: f.outputCount,
  };
}

function tickFurnaces() {
  for (const [key, f] of furnaces) {
    const recipe = f.inputItem ? furnaceRecipes[String(f.inputItem.id)] : null;
    const canCook = recipe && f.inputItem.count > 0 && (f.fuelTicksLeft > 0 || f.fuelItem);

    if (canCook) {
      if (f.fuelTicksLeft <= 0 && f.fuelItem) {
        // Consumir una unidad de combustible
        f.fuelTicksLeft = 400; // ticks de combustible por unidad
      }
      if (f.fuelTicksLeft > 0) {
        f.fuelTicksLeft--;
        f.requiredTicks = recipe.time;
        f.progress++;
        if (f.progress >= f.requiredTicks) {
          f.progress = 0;
          f.inputItem.count--;
          if (f.inputItem.count <= 0) f.inputItem = null;
          if (f.outputItem === recipe.result.id) f.outputCount += recipe.result.count;
          else if (!f.outputItem) { f.outputItem = recipe.result.id; f.outputCount = recipe.result.count; }
          // Si el hueco de salida tiene otro item, el resultado se pierde (horno lleno) -- simplificado
        }
      }
    } else {
      f.progress = Math.max(0, f.progress - 2); // se enfría si no hay combustible/insumo
    }
  }
}

// ============================================================
// PERSISTENCIA
// ============================================================
const WORLD_DIR = path.join(__dirname, 'world');
function saveWorld() {
  try {
    if (!fs.existsSync(WORLD_DIR)) fs.mkdirSync(WORLD_DIR);
    const data = {
      seed: SEED,
      chunks: Array.from(chunks.entries()).map(([k, arr]) => [k, Array.from(arr)]),
      mobs: mobs.filter((m) => m.alive).map((m) => ({ id: m.id, type: m.type, x: m.x, y: m.y, z: m.z, health: m.health })),
      furnaces: Array.from(furnaces.entries()),
    };
    fs.writeFileSync(path.join(WORLD_DIR, 'world.dat'), JSON.stringify(data));
    console.log(`💾 Mundo guardado (${chunks.size} chunks, ${mobs.length} mobs)`);
  } catch (e) {
    console.error('Error guardando mundo:', e.message);
  }
}

function loadWorld() {
  try {
    const file = path.join(WORLD_DIR, 'world.dat');
    if (!fs.existsSync(file)) return false;
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    chunks.clear();
    for (const [k, arr] of data.chunks) chunks.set(k, Uint8Array.from(arr));
    mobs = (data.mobs || []).map((m) => {
      const mob = new Mob(m.type, m.x, m.y, m.z);
      mob.id = m.id; mob.health = m.health;
      return mob;
    });
    furnaces.clear();
    for (const [k, v] of data.furnaces || []) furnaces.set(k, v);
    console.log(`✅ Mundo cargado (${chunks.size} chunks, ${mobs.length} mobs)`);
    return true;
  } catch (e) {
    console.error('Error cargando mundo:', e.message);
    return false;
  }
}

// ============================================================
// RED
// ============================================================
function broadcast(event, data, exceptId = null) {
  const msg = JSON.stringify({ event, data });
  for (const p of players.values()) {
    if (p.id === exceptId) continue;
    if (p.ws.readyState === WebSocket.OPEN) p.ws.send(msg);
  }
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

loadRecipes();
if (!loadWorld()) {
  ensureChunksAround(0, 0, 4);
}
if (mobs.length === 0) for (let i = 0; i < 4; i++) spawnMobs();

wss.on('connection', (ws) => {
  const playerId = uuidv4();
  const spawnX = 0.5, spawnZ = 0.5;
  const generated = ensureChunksAround(spawnX, spawnZ, VIEW_DISTANCE_CHUNKS);
  const spawnY = getHeight(0, 0) + 2;

  const player = {
    id: playerId, ws,
    x: spawnX, y: spawnY, z: spawnZ, yaw: 0, pitch: 0,
    health: 20,
    inventory: new Array(36).fill(null),
    selectedSlot: 0,
    craftingGrid: new Array(9).fill(null),
    openFurnace: null,
  };
  players.set(playerId, player);
  console.log(`🟢 Jugador conectado: ${playerId} (${players.size} en línea)`);

  const chunkData = {};
  for (const [key, data] of chunks) chunkData[key] = Array.from(data);

  ws.send(JSON.stringify({
    event: 'init',
    data: {
      playerId, chunkData, spawnX, spawnY, spawnZ,
      mobs: mobs.filter((m) => m.alive).map(mobSnapshot),
      inventory: player.inventory, health: player.health,
      otherPlayers: Array.from(players.values()).filter((p) => p.id !== playerId)
        .map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z })),
    },
  }));

  broadcast('player_join', { id: playerId, x: spawnX, y: spawnY, z: spawnZ }, playerId);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const { event, data } = msg;
    const p = players.get(playerId);
    if (!p) return;

    switch (event) {
      case 'move': {
        const { x, y, z, yaw, pitch } = data;
        if (typeof x !== 'number' || typeof y !== 'number' || typeof z !== 'number') return;
        const dist = Math.hypot(x - p.x, y - p.y, z - p.z);
        if (dist > 1.2) { // límite anti-cheat de velocidad
          ws.send(JSON.stringify({ event: 'teleport', data: { x: p.x, y: p.y, z: p.z } }));
          return;
        }
        const feet = getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
        const head = getBlock(Math.floor(x), Math.floor(y + 1.5), Math.floor(z));
        if (feet !== B.AIR || head !== B.AIR) {
          ws.send(JSON.stringify({ event: 'teleport', data: { x: p.x, y: p.y, z: p.z } }));
          return;
        }
        p.x = x; p.y = y; p.z = z; p.yaw = yaw || 0; p.pitch = pitch || 0;
        // Generar chunks nuevos bajo demanda al moverse
        const newChunks = ensureChunksAround(x, z, 2);
        if (newChunks.length) {
          const extra = {};
          for (const key of newChunks) extra[key] = Array.from(chunks.get(key));
          ws.send(JSON.stringify({ event: 'chunks_add', data: { chunkData: extra } }));
        }
        broadcast('player_move', { id: playerId, x, y, z, yaw: p.yaw, pitch: p.pitch }, playerId);
        break;
      }

      case 'block_action': {
        const { action, x, y, z, itemId } = data;
        if (Math.hypot(x - p.x, y - p.y, z - p.z) > 7) return;
        if (action === 'break') {
          const block = getBlock(x, y, z);
          if (NOT_MINEABLE.has(block)) return;
          const tool = p.inventory[p.selectedSlot] ? p.inventory[p.selectedSlot].id : 0;
          let canBreak = true;
          if (block === B.STONE || (block >= B.COAL_ORE && block <= B.EMERALD_ORE) || block === B.COBBLESTONE) {
            canBreak = isPickaxe(tool);
          } else if (block === B.OAK_LOG) {
            canBreak = true; // el hacha solo acelera; se puede romper a mano
          } else if (block === B.DIRT || block === B.GRASS || block === B.SAND) {
            canBreak = true;
          }
          if (!canBreak) return;
          setBlock(x, y, z, B.AIR);
          let drop = block;
          if (block === B.STONE) drop = B.COBBLESTONE;
          if (block === B.GRASS) drop = B.DIRT;
          addToInventory(p, drop, 1);
          sendInventory(p);
        } else if (action === 'place') {
          if (getBlock(x, y, z) !== B.AIR) return;
          const slot = p.inventory[p.selectedSlot];
          if (!slot || slot.id !== itemId || slot.count < 1) return;
          setBlock(x, y, z, itemId);
          removeFromInventory(p, itemId, 1);
          sendInventory(p);
        }
        break;
      }

      case 'craft': {
        p.craftingGrid = Array.isArray(data.grid) ? data.grid : p.craftingGrid;
        const recipe = matchRecipe(p.craftingGrid);
        if (recipe) {
          for (let i = 0; i < 9; i++) {
            const cell = p.craftingGrid[i];
            if (cell) {
              cell.count -= 1;
              p.craftingGrid[i] = cell.count > 0 ? cell : null;
            }
          }
          addToInventory(p, recipe.result.id, recipe.result.count || 1);
          sendInventory(p);
        }
        ws.send(JSON.stringify({ event: 'crafting_grid_update', data: { grid: p.craftingGrid, success: !!recipe } }));
        break;
      }

      case 'grid_set': {
        // El cliente pide mover un item del inventario a una celda de crafteo
        const { fromInventorySlot, toGridSlot } = data;
        const item = p.inventory[fromInventorySlot];
        if (!item || toGridSlot < 0 || toGridSlot > 8) return;
        if (p.craftingGrid[toGridSlot]) return; // celda ocupada
        p.craftingGrid[toGridSlot] = { id: item.id, count: 1 };
        item.count -= 1;
        if (item.count <= 0) p.inventory[fromInventorySlot] = null;
        sendInventory(p);
        ws.send(JSON.stringify({ event: 'crafting_grid_update', data: { grid: p.craftingGrid, success: false } }));
        break;
      }

      case 'grid_clear': {
        for (let i = 0; i < 9; i++) {
          const cell = p.craftingGrid[i];
          if (cell) addToInventory(p, cell.id, cell.count);
        }
        p.craftingGrid.fill(null);
        sendInventory(p);
        ws.send(JSON.stringify({ event: 'crafting_grid_update', data: { grid: p.craftingGrid, success: false } }));
        break;
      }

      case 'furnace_open': {
        const key = `${data.x},${data.y},${data.z}`;
        if (getBlock(data.x, data.y, data.z) !== B.FURNACE) return;
        p.openFurnace = key;
        const f = getOrCreateFurnace(key);
        ws.send(JSON.stringify({ event: 'furnace_state', data: { key, ...furnaceSnapshot(f) } }));
        break;
      }

      case 'furnace_action': {
        if (!p.openFurnace) return;
        const f = getOrCreateFurnace(p.openFurnace);
        if (data.action === 'add_fuel') {
          const slot = p.inventory[data.invSlot];
          if (slot && FUEL_ITEMS.has(slot.id) && (!f.fuelItem || f.fuelItem === slot.id)) {
            f.fuelItem = slot.id;
            slot.count -= 1;
            if (slot.count <= 0) p.inventory[data.invSlot] = null;
            sendInventory(p);
          }
        } else if (data.action === 'add_input') {
          const slot = p.inventory[data.invSlot];
          if (slot && furnaceRecipes[String(slot.id)] && (!f.inputItem || f.inputItem.id === slot.id)) {
            f.inputItem = f.inputItem ? { id: slot.id, count: f.inputItem.count + slot.count } : { id: slot.id, count: slot.count };
            p.inventory[data.invSlot] = null;
            sendInventory(p);
          }
        } else if (data.action === 'collect_output') {
          if (f.outputItem && f.outputCount > 0) {
            if (addToInventory(p, f.outputItem, f.outputCount)) {
              f.outputItem = null; f.outputCount = 0;
              sendInventory(p);
            }
          }
        } else if (data.action === 'close') {
          p.openFurnace = null;
        }
        ws.send(JSON.stringify({ event: 'furnace_state', data: { key: p.openFurnace || `${data.x},${data.y},${data.z}`, ...furnaceSnapshot(f) } }));
        break;
      }

      case 'inventory_select': {
        if (typeof data.slot === 'number' && data.slot >= 0 && data.slot < 9) p.selectedSlot = data.slot;
        break;
      }

      case 'chat': {
        if (typeof data.message === 'string') broadcast('chat', { id: playerId, message: data.message.slice(0, 200) });
        break;
      }

      case 'attack_mob': {
        const mob = mobs.find((m) => m.id === data.mobId && m.alive);
        if (!mob) return;
        if (Math.hypot(mob.x - p.x, mob.y - p.y, mob.z - p.z) > 4) return;
        const tool = p.inventory[p.selectedSlot] ? p.inventory[p.selectedSlot].id : 0;
        const dmg = (tool >= 215 && tool <= 219) ? 6 : 2;
        mob.health -= dmg;
        if (mob.health <= 0) {
          mob.alive = false;
          broadcast('mob_death', { id: mob.id });
          if (!HOSTILE.has(mob.type)) addToInventory(p, B.PLANKS === 0 ? 0 : I.STICK === 0 ? 0 : 0, 0); // sin drops de comida por ahora
          sendInventory(p);
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    players.delete(playerId);
    console.log(`🔴 Jugador desconectado: ${playerId} (${players.size} en línea)`);
    broadcast('player_leave', { id: playerId });
  });

  ws.on('error', () => {});
});

// ============================================================
// BUCLE PRINCIPAL
// ============================================================
setInterval(() => {
  const isNight = (Date.now() % DAY_CYCLE_MS) > DAY_CYCLE_MS / 2;
  for (const m of mobs) if (m.alive) m.tick(isNight);
  mobs = mobs.filter((m) => m.alive);
  broadcast('mobs_update', mobs.map(mobSnapshot));

  if (Math.random() < 0.03) spawnMobs();

  tickFurnaces();
  for (const [key, f] of furnaces) {
    // Notificar a quien tenga ese horno abierto
    for (const p of players.values()) {
      if (p.openFurnace === key && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(JSON.stringify({ event: 'furnace_state', data: { key, ...furnaceSnapshot(f) } }));
      }
    }
  }
}, TICK_MS);

setInterval(saveWorld, SAVE_INTERVAL_MS);
process.on('SIGINT', () => { saveWorld(); process.exit(0); });

server.listen(PORT, () => {
  console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
  console.log(`🌍 Semilla: ${SEED}  |  📦 Chunks: ${chunks.size}  |  🧟 Mobs: ${mobs.length}`);
});
