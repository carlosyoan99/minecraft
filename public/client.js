import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ============================================================
// CONSTANTES COMPARTIDAS CON EL SERVIDOR
// ============================================================
const CHUNK_SIZE = 16, WORLD_HEIGHT = 64;

const BLOCK_COLORS = {
  1: 0x8B5A2B, 2: 0x5FBF3A, 3: 0x8a8a8a, 4: 0x6b4a2b, 5: 0x3a7a2e,
  6: 0xE0C88A, 7: 0xC9A46B, 8: 0x6f6f6f, 9: 0x33393d, 10: 0xB08968,
  11: 0xE8C547, 12: 0x7FFFEE, 13: 0xB22222, 14: 0x22C97A, 15: 0x8B5A2B,
  16: 0x555555, 17: 0xBEE7F0, 18: 0xF5F5F0, 19: 0x1a1a1a,
};
const BLOCK_NAMES = {
  1: 'Tierra', 2: 'Césped', 3: 'Piedra', 4: 'Tronco', 5: 'Hojas', 6: 'Arena',
  7: 'Tablones', 8: 'Adoquín', 9: 'Mena de carbón', 10: 'Mena de hierro',
  11: 'Mena de oro', 12: 'Mena de diamante', 13: 'Mena de redstone',
  14: 'Mena de esmeralda', 15: 'Mesa de crafteo', 16: 'Horno', 17: 'Vidrio',
  18: 'Lana', 19: 'Roca madre',
};
const ITEM_NAMES = {
  100: 'Palo', 101: 'Carbón', 102: 'Lingote de hierro', 103: 'Lingote de oro',
  104: 'Diamante', 105: 'Redstone', 106: 'Esmeralda',
  200: 'Pico de madera', 201: 'Pico de piedra', 202: 'Pico de hierro', 203: 'Pico de oro', 204: 'Pico de diamante',
  205: 'Hacha de madera', 206: 'Hacha de piedra', 207: 'Hacha de hierro', 208: 'Hacha de oro', 209: 'Hacha de diamante',
  210: 'Pala de madera', 211: 'Pala de piedra', 212: 'Pala de hierro', 213: 'Pala de oro', 214: 'Pala de diamante',
  215: 'Espada de madera', 216: 'Espada de piedra', 217: 'Espada de hierro', 218: 'Espada de oro', 219: 'Espada de diamante',
};
function itemLabel(id) { return BLOCK_NAMES[id] || ITEM_NAMES[id] || `#${id}`; }
function itemColor(id) { return BLOCK_COLORS[id] || 0xcccccc; }

const PLACEABLE_BLOCKS = new Set([1, 2, 3, 4, 5, 6, 7, 8, 15, 16, 17, 18]);

// ============================================================
// ESCENA
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 40, 140);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0x8899bb, 0.7));
const sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
scene.add(sun);

const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');
const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { blocker.style.display = 'flex'; });

// ============================================================
// ALMACÉN DE MUNDO EN CLIENTE (para culling correcto entre chunks)
// ============================================================
const chunkStore = new Map();   // "cx,cz" -> Uint8Array
const chunkMeshes = new Map();  // "cx,cz" -> THREE.Mesh

function cIdx(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }

function getClientBlock(wx, wy, wz) {
  if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = chunkStore.get(`${cx},${cz}`);
  if (!chunk) return -1; // -1 = desconocido (chunk no cargado): no dibujar cara para evitar huecos falsos
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk[cIdx(x, wy, z)];
}

function setClientBlock(wx, wy, wz, block) {
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const key = `${cx},${cz}`;
  let chunk = chunkStore.get(key);
  if (!chunk) { chunk = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE); chunkStore.set(key, chunk); }
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  chunk[cIdx(x, wy, z)] = block;
}

// Geometrías de una única cara (evita crear cubos completos por cara expuesta)
const FACES = [
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },   // +X
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },  // -X
  { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },   // +Y
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },  // -Y
  { dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },   // +Z
  { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },  // -Z
];

function buildChunkGeometry(cx, cz) {
  const chunk = chunkStore.get(`${cx},${cz}`);
  if (!chunk) return null;
  const baseX = cx * CHUNK_SIZE, baseZ = cz * CHUNK_SIZE;

  const geomsByColor = new Map(); // color -> arrays

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const block = chunk[cIdx(x, y, z)];
        if (block === 0) continue;
        const wx = baseX + x, wy = y, wz = baseZ + z;
        const color = itemColor(block);
        for (const face of FACES) {
          const nx = wx + face.dir[0], ny = wy + face.dir[1], nz = wz + face.dir[2];
          const neighbor = getClientBlock(nx, ny, nz);
          if (neighbor !== 0) continue; // solo dibujar si el vecino es aire confirmado
          let bucket = geomsByColor.get(color);
          if (!bucket) { bucket = { positions: [], normals: [] }; geomsByColor.set(color, bucket); }
          const [a, b, c, d] = face.corners;
          const verts = [
            [wx + a[0], wy + a[1], wz + a[2]],
            [wx + b[0], wy + b[1], wz + b[2]],
            [wx + c[0], wy + c[1], wz + c[2]],
            [wx + d[0], wy + d[1], wz + d[2]],
          ];
          // dos triángulos (a,b,c) y (a,c,d)
          for (const [i, j, k] of [[0,1,2],[0,2,3]]) {
            bucket.positions.push(...verts[i], ...verts[j], ...verts[k]);
            bucket.normals.push(...face.dir, ...face.dir, ...face.dir);
          }
        }
      }
    }
  }

  if (geomsByColor.size === 0) return null;

  const group = new THREE.Group();
  for (const [color, bucket] of geomsByColor) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.isTerrain = true;
    group.add(mesh);
  }
  return group;
}

function rebuildChunk(key) {
  const [cx, cz] = key.split(',').map(Number);
  const old = chunkMeshes.get(key);
  if (old) {
    scene.remove(old);
    old.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  const group = buildChunkGeometry(cx, cz);
  if (group) { scene.add(group); chunkMeshes.set(key, group); }
  else chunkMeshes.delete(key);
}

function rebuildAffectedChunks(wx, wz) {
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const localX = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localZ = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  rebuildChunk(`${cx},${cz}`);
  if (localX === 0) rebuildChunk(`${cx - 1},${cz}`);
  if (localX === CHUNK_SIZE - 1) rebuildChunk(`${cx + 1},${cz}`);
  if (localZ === 0) rebuildChunk(`${cx},${cz - 1}`);
  if (localZ === CHUNK_SIZE - 1) rebuildChunk(`${cx},${cz + 1}`);
}

// ============================================================
// JUGADORES Y MOBS REMOTOS
// ============================================================
const remotePlayers = new Map(); // id -> mesh
const mobMeshes = new Map();     // id -> mesh

function makeHumanoid(color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.8, 0.6),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.castShadow = true;
  return mesh;
}

function spawnRemotePlayer(id, x, y, z) {
  const mesh = makeHumanoid(0xdd4444);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  remotePlayers.set(id, mesh);
}

function updateMobs(list) {
  const seen = new Set();
  for (const m of list) {
    seen.add(m.id);
    let mesh = mobMeshes.get(m.id);
    if (!mesh) {
      mesh = makeHumanoid(m.color);
      mesh.userData.mobId = m.id;
      mesh.userData.mobType = m.type;
      scene.add(mesh);
      mobMeshes.set(m.id, mesh);
    }
    mesh.position.set(m.x, m.y, m.z);
  }
  for (const [id, mesh] of mobMeshes) {
    if (!seen.has(id)) { scene.remove(mesh); mobMeshes.delete(id); }
  }
}

function removeMob(id) {
  const mesh = mobMeshes.get(id);
  if (mesh) { scene.remove(mesh); mobMeshes.delete(id); }
}

// ============================================================
// ESTADO DEL JUGADOR LOCAL
// ============================================================
let playerId = null;
let inventory = new Array(36).fill(null);
let selectedSlot = 0;
let craftingGrid = new Array(9).fill(null);
let openFurnaceKey = null;
let velocityY = 0;
let onGround = false;
let health = 20;

const move = { forward: false, back: false, left: false, right: false, jump: false };

// ============================================================
// CONEXIÓN WEBSOCKET
// ============================================================
const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
const socket = new WebSocket(`${wsProtocol}://${location.host}`);

function send(event, data = {}) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, data }));
}

socket.addEventListener('open', () => console.log('Conectado al servidor'));
socket.addEventListener('close', () => console.log('Desconectado del servidor'));

socket.addEventListener('message', (e) => {
  const { event, data } = JSON.parse(e.data);
  switch (event) {
    case 'init': {
      playerId = data.playerId;
      camera.position.set(data.spawnX, data.spawnY, data.spawnZ);
      for (const [key, arr] of Object.entries(data.chunkData)) {
        chunkStore.set(key, Uint8Array.from(arr));
      }
      for (const key of chunkStore.keys()) rebuildChunk(key);
      inventory = data.inventory; health = data.health;
      updateHotbarUI(); updateHealthUI();
      updateMobs(data.mobs);
      for (const p of data.otherPlayers) spawnRemotePlayer(p.id, p.x, p.y, p.z);
      break;
    }
    case 'chunks_add': {
      for (const [key, arr] of Object.entries(data.chunkData)) chunkStore.set(key, Uint8Array.from(arr));
      for (const key of Object.keys(data.chunkData)) rebuildChunk(key);
      break;
    }
    case 'block_update': {
      setClientBlock(data.x, data.y, data.z, data.block);
      rebuildAffectedChunks(data.x, data.z);
      break;
    }
    case 'player_join': spawnRemotePlayer(data.id, data.x, data.y, data.z); break;
    case 'player_move': {
      const mesh = remotePlayers.get(data.id);
      if (mesh) { mesh.position.set(data.x, data.y, data.z); mesh.rotation.y = data.yaw; }
      break;
    }
    case 'player_leave': {
      const mesh = remotePlayers.get(data.id);
      if (mesh) { scene.remove(mesh); remotePlayers.delete(data.id); }
      break;
    }
    case 'mobs_update': updateMobs(data); break;
    case 'mob_death': removeMob(data.id); break;
    case 'teleport': camera.position.set(data.x, data.y, data.z); velocityY = 0; break;
    case 'player_die': if (data.id === playerId) flashMessage('💀 Has muerto — reapareciendo...'); break;
    case 'inventory_update': inventory = data.inventory; updateHotbarUI(); updateCraftInventoryUI(); updateFurnaceInventoryUI(); break;
    case 'health_update': health = data.health; updateHealthUI(); break;
    case 'crafting_grid_update': craftingGrid = data.grid; updateCraftGridUI(data.success); break;
    case 'furnace_state': updateFurnaceUI(data); break;
    case 'chat': addChatLine(data.id === playerId ? 'Tú' : data.id.slice(0, 6), data.message); break;
  }
});

// ============================================================
// HUD: HOTBAR
// ============================================================
const hotbarEl = document.getElementById('hotbar');
function updateHotbarUI() {
  hotbarEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const item = inventory[i];
    const slot = document.createElement('div');
    slot.className = 'hotbar-slot' + (i === selectedSlot ? ' selected' : '');
    if (item) {
      slot.innerHTML = `<div class="swatch" style="background:#${itemColor(item.id).toString(16).padStart(6,'0')}"></div><span class="count">${item.count}</span>`;
      slot.title = itemLabel(item.id);
    }
    slot.addEventListener('click', () => { selectedSlot = i; send('inventory_select', { slot: i }); updateHotbarUI(); });
    hotbarEl.appendChild(slot);
  }
}
function updateHealthUI() { document.getElementById('hp').textContent = health; }

function flashMessage(text) {
  addChatLine('Sistema', text);
}

// ============================================================
// CHAT
// ============================================================
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
function addChatLine(author, message) {
  const line = document.createElement('div');
  line.textContent = `${author}: ${message}`;
  chatLog.appendChild(line);
  while (chatLog.children.length > 8) chatLog.removeChild(chatLog.firstChild);
  setTimeout(() => line.remove(), 12000);
}
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (chatInput.classList.contains('active')) {
      if (chatInput.value.trim()) send('chat', { message: chatInput.value.trim() });
      chatInput.value = ''; chatInput.classList.remove('active'); chatInput.blur();
      controls.lock();
    } else {
      chatInput.classList.add('active'); chatInput.focus(); controls.unlock();
    }
  }
});

// ============================================================
// PANEL DE CRAFTEO
// ============================================================
const craftingUI = document.getElementById('crafting-ui');
const craftGridEl = document.getElementById('craft-grid');
const craftInventoryEl = document.getElementById('craft-inventory');
const craftResultEl = document.getElementById('craft-result');

function buildCraftGridSlots() {
  craftGridEl.innerHTML = '';
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'slot';
    cell.dataset.gridSlot = i;
    craftGridEl.appendChild(cell);
  }
}
buildCraftGridSlots();

function updateCraftGridUI(success) {
  const cells = craftGridEl.children;
  for (let i = 0; i < 9; i++) {
    const item = craftingGrid[i];
    cells[i].innerHTML = item ? `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>` : '';
  }
  craftResultEl.style.borderColor = success ? '#8f8' : '#555';
}

function updateCraftInventoryUI() {
  craftInventoryEl.innerHTML = '';
  inventory.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'slot';
    if (item) {
      el.innerHTML = `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>`;
      el.addEventListener('click', () => {
        const emptyGridSlot = craftingGrid.findIndex((c) => !c);
        if (emptyGridSlot !== -1) send('grid_set', { fromInventorySlot: i, toGridSlot: emptyGridSlot });
      });
    }
    craftInventoryEl.appendChild(el);
  });
}

document.getElementById('craft-clear-btn').addEventListener('click', () => send('grid_clear'));

function toggleCraftingUI(show) {
  craftingUI.classList.toggle('hidden', !show);
  if (show) { updateCraftInventoryUI(); updateCraftGridUI(false); controls.unlock(); }
}

// Enviar el grid para intentar craftear cada vez que cambie (auto-craft al llenar el patrón)
let lastGridSignature = '';
setInterval(() => {
  if (craftingUI.classList.contains('hidden')) return;
  const sig = JSON.stringify(craftingGrid);
  if (sig !== lastGridSignature) { lastGridSignature = sig; send('craft', { grid: craftingGrid }); }
}, 400);

// ============================================================
// PANEL DE HORNO
// ============================================================
const furnaceUI = document.getElementById('furnace-ui');
const furnaceInventoryEl = document.getElementById('furnace-inventory');
const furnaceFuelEl = document.getElementById('furnace-fuel');
const furnaceInputEl = document.getElementById('furnace-input');
const furnaceOutputEl = document.getElementById('furnace-output');
const furnaceProgressEl = document.getElementById('furnace-progress');

function updateFurnaceInventoryUI() {
  furnaceInventoryEl.innerHTML = '';
  inventory.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'slot';
    if (item) {
      el.innerHTML = `<span>${itemLabel(item.id)}</span><span class="count">${item.count}</span>`;
      el.addEventListener('click', () => {
        send('furnace_action', { action: 'add_fuel', invSlot: i });
        send('furnace_action', { action: 'add_input', invSlot: i });
      });
    }
    furnaceInventoryEl.appendChild(el);
  });
}

function updateFurnaceUI(data) {
  openFurnaceKey = data.key;
  furnaceFuelEl.textContent = data.fuelItem ? `${itemLabel(data.fuelItem)} (${data.fuelTicksLeft})` : 'Combustible';
  furnaceInputEl.textContent = data.inputItem ? `${itemLabel(data.inputItem)} x${data.inputCount}` : 'Material';
  furnaceOutputEl.textContent = data.outputItem ? `${itemLabel(data.outputItem)} x${data.outputCount}` : 'Salida';
  const pct = data.requiredTicks ? Math.round((data.progress / data.requiredTicks) * 100) : 0;
  furnaceProgressEl.textContent = pct > 0 ? `${pct}%` : '→';
}

furnaceOutputEl.addEventListener('click', () => send('furnace_action', { action: 'collect_output' }));

function toggleFurnaceUI(show, coords) {
  furnaceUI.classList.toggle('hidden', !show);
  if (show) {
    updateFurnaceInventoryUI();
    send('furnace_open', coords);
    controls.unlock();
  } else if (openFurnaceKey) {
    send('furnace_action', { action: 'close' });
    openFurnaceKey = null;
  }
}

// ============================================================
// INPUT DE TECLADO
// ============================================================
let inventoryOpen = false;
document.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput) return;
  switch (e.code) {
    case 'KeyW': move.forward = true; break;
    case 'KeyS': move.back = true; break;
    case 'KeyA': move.left = true; break;
    case 'KeyD': move.right = true; break;
    case 'Space': move.jump = true; break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
    case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9': {
      const n = parseInt(e.code.replace('Digit', ''), 10) - 1;
      selectedSlot = n; send('inventory_select', { slot: n }); updateHotbarUI();
      break;
    }
    case 'KeyE': {
      inventoryOpen = !inventoryOpen;
      toggleCraftingUI(inventoryOpen);
      if (!inventoryOpen) controls.lock();
      break;
    }
    case 'Escape': toggleCraftingUI(false); toggleFurnaceUI(false); inventoryOpen = false; break;
  }
});
document.addEventListener('keyup', (e) => {
  switch (e.code) {
    case 'KeyW': move.forward = false; break;
    case 'KeyS': move.back = false; break;
    case 'KeyA': move.left = false; break;
    case 'KeyD': move.right = false; break;
    case 'Space': move.jump = false; break;
  }
});

// ============================================================
// INTERACCIÓN: ROMPER / COLOCAR / ATACAR
// ============================================================
const raycaster = new THREE.Raycaster();
raycaster.far = 7;

function raycastTerrainAndMobs() {
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  const terrainMeshes = [];
  for (const group of chunkMeshes.values()) group.children.forEach((m) => terrainMeshes.push(m));
  const mobList = Array.from(mobMeshes.values());
  const hits = raycaster.intersectObjects([...terrainMeshes, ...mobList], false);
  return hits[0] || null;
}

renderer.domElement.addEventListener('mousedown', (e) => {
  if (!controls.isLocked) return;
  const hit = raycastTerrainAndMobs();
  if (!hit) return;

  if (hit.object.userData.mobId) {
    if (e.button === 0) send('attack_mob', { mobId: hit.object.userData.mobId });
    return;
  }

  const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
  const x = Math.floor(point.x), y = Math.floor(point.y), z = Math.floor(point.z);

  if (e.button === 0) {
    if (getClientBlock(x, y, z) === 16) { toggleFurnaceUI(true, { x, y, z }); return; }
    if (getClientBlock(x, y, z) === 15) { inventoryOpen = true; toggleCraftingUI(true); return; }
    send('block_action', { action: 'break', x, y, z });
  } else if (e.button === 2) {
    const nx = x + Math.round(hit.face.normal.x);
    const ny = y + Math.round(hit.face.normal.y);
    const nz = z + Math.round(hit.face.normal.z);
    const held = inventory[selectedSlot];
    if (held && PLACEABLE_BLOCKS.has(held.id)) {
      send('block_action', { action: 'place', x: nx, y: ny, z: nz, itemId: held.id });
    }
  }
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ============================================================
// FÍSICA Y MOVIMIENTO DEL JUGADOR LOCAL
// ============================================================
const PLAYER_SPEED = 4.3;   // bloques/segundo
const GRAVITY = 18;
const JUMP_SPEED = 7;
const EYE_HEIGHT = 1.6;

function solidAt(x, y, z) {
  const b = getClientBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  return b !== 0 && b !== -1;
}

function tryMove(dx, dz) {
  const feet = camera.position.y - EYE_HEIGHT;
  const r = 0.3;
  // Eje X
  let nx = camera.position.x + dx;
  if (!solidAt(nx + Math.sign(dx) * r, feet + 0.1, camera.position.z) &&
      !solidAt(nx + Math.sign(dx) * r, feet + 1.3, camera.position.z)) {
    camera.position.x = nx;
  }
  // Eje Z
  let nz = camera.position.z + dz;
  if (!solidAt(camera.position.x, feet + 0.1, nz + Math.sign(dz) * r) &&
      !solidAt(camera.position.x, feet + 1.3, nz + Math.sign(dz) * r)) {
    camera.position.z = nz;
  }
}

const clock = new THREE.Clock();
let netTimer = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (controls.isLocked) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).negate();

    let dx = 0, dz = 0;
    if (move.forward) { dx += forward.x; dz += forward.z; }
    if (move.back) { dx -= forward.x; dz -= forward.z; }
    if (move.left) { dx -= right.x; dz -= right.z; }
    if (move.right) { dx += right.x; dz += right.z; }
    const len = Math.hypot(dx, dz);
    if (len > 0) { dx = (dx / len) * PLAYER_SPEED * dt; dz = (dz / len) * PLAYER_SPEED * dt; }
    tryMove(dx, dz);

    // Gravedad y salto
    const feet = camera.position.y - EYE_HEIGHT;
    onGround = solidAt(camera.position.x, feet - 0.05, camera.position.z);
    if (onGround) {
      velocityY = 0;
      if (move.jump) velocityY = JUMP_SPEED;
    } else {
      velocityY -= GRAVITY * dt;
    }
    let newY = camera.position.y + velocityY * dt;
    const newFeet = newY - EYE_HEIGHT;
    if (velocityY < 0 && solidAt(camera.position.x, newFeet, camera.position.z)) {
      velocityY = 0;
      newY = Math.ceil(newFeet) + EYE_HEIGHT;
    } else if (velocityY > 0 && solidAt(camera.position.x, newY - EYE_HEIGHT + 1.7, camera.position.z)) {
      velocityY = 0;
    }
    camera.position.y = newY;

    netTimer += dt;
    if (netTimer > 0.05) {
      netTimer = 0;
      send('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x });
    }
  }

  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
