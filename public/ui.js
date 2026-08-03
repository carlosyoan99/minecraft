// ============================================================
// UI: HUD (hotbar, salud), chat, panel de crafteo y panel de horno
// ============================================================
import { controls, showBlocker } from './scene.js';
import { send } from './connection.js';
import { itemLabel, itemColor, DURABILITY, XP_PER_LEVEL } from './constants.js';
import { isMuted, setMuted } from './audio.js';
import { showLoading, finishLoading } from './loading.js';

// Estado que dibuja el HUD (lo actualiza la red; lo lee el input)
let inventory = new Array(36).fill(null);
let selectedSlot = 0;
let craftingGrid = new Array(9).fill(null);
let openFurnaceKey = null;
let health = 20;
let maxHealth = 20; // Fase 5: sube con el nivel (máx +10)
let food = 20;
let saturation = 20; // barra dorada sobre la comida (como en Minecraft)
let xp = 0;
let level = 0; // Fase 5: niveles simples
let inventoryOpen = false;

export function getHeldItem() { return inventory[selectedSlot]; }
export function isChatFocused() { return document.activeElement === chatInput; }

// ============================================================
// HOTBAR Y SALUD
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
      // Fase 5: barra de durabilidad bajo la herramienta (verde→rojo)
      const maxD = DURABILITY[item.id];
      if (maxD) {
        const cur = typeof item.durability === 'number' ? item.durability : maxD;
        const pct = Math.max(0, Math.min(100, (cur / maxD) * 100));
        const color = pct > 50 ? '#5fd34f' : pct > 20 ? '#e8b93f' : '#e8544f';
        slot.innerHTML += `<div class="durbar"><i style="width:${pct.toFixed(0)}%;background:${color}"></i></div>`;
        slot.title = `${itemLabel(item.id)} (${cur}/${maxD})`;
      } else {
        slot.title = itemLabel(item.id);
      }
    }
    slot.addEventListener('click', () => { selectedSlot = i; send('inventory_select', { slot: i }); updateHotbarUI(); });
    hotbarEl.appendChild(slot);
  }
}
function updateHealthUI() {
  document.getElementById('hp').textContent = health;
  document.getElementById('maxhp').textContent = maxHealth;
}
function updateXpUI() {
  const fill = document.getElementById('xp-fill');
  fill.style.width = Math.max(0, Math.min(100, ((xp % XP_PER_LEVEL) / XP_PER_LEVEL) * 100)) + '%';
  document.getElementById('level').textContent = level;
}

// Barra de hambre con saturación dorada encima (como en Minecraft): el track
// se llena de naranja con la comida y la capa dorada lo cubre desde la
// izquierda según la saturación; naranja oscuro al bajar y rojo al llegar a 0.
function updateFoodUI() {
  document.getElementById('food').textContent = food;
  const foodFill = document.getElementById('food-fill');
  foodFill.style.width = Math.max(0, Math.min(100, (food / 20) * 100)) + '%';
  foodFill.style.background = food <= 0 ? '#ff5555' : food <= 6 ? '#e8862e' : 'linear-gradient(#ffd27a, #ff9a2e)';
  const satFill = document.getElementById('sat-fill');
  satFill.style.width = Math.max(0, Math.min(100, (saturation / 20) * 100)) + '%';
}

// ============================================================
// BOTÓN DE SILENCIO (persistido en localStorage)
// ============================================================
updateFoodUI(); // estado inicial coherente (barra llena/dorada) antes del primer init

const muteBtn = document.getElementById('mute-btn');
function updateMuteBtn() {
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
  muteBtn.title = isMuted() ? 'Activar sonido' : 'Silenciar sonido';
}
muteBtn.addEventListener('click', () => { setMuted(!isMuted()); updateMuteBtn(); });
updateMuteBtn();

// ============================================================
// MENÚ PRINCIPAL: SEMILLA DEL MUNDO (Fase 6)
// Al pulsar "Jugar" con una semilla escrita se pide al servidor cambiar el
// mundo activo (set_seed): persiste el actual, carga/genera el de la semilla
// y reenvía el init. La pantalla de carga cubre el cambio y el puntero se
// bloquea ya (gesto del usuario); onWorldLoaded() la cierra cuando llega el
// init que confirma la semilla pedida (data.seed === la enviada).
// ============================================================
const startBtn = document.getElementById('start-btn');
const seedInput = document.getElementById('seed-input');
let currentSeed = null; // semilla activa (la trae el init del servidor)
let seedPending = null; // semilla pedida en el menú, pendiente de confirmar

startBtn.addEventListener('click', () => {
  const seed = seedInput.value.trim();
  // Si la semilla escrita es la activa (la trae el init), no hace falta
  // pedir nada: el mundo ya está cargado. Si difiere, el servidor cambia el
  // mundo (set_seed) y el init de confirmación cierra la carga.
  if (seed && seed !== currentSeed) {
    seedPending = seed;
    showLoading(`Generando el mundo «${seed}»...`);
    send('set_seed', { seed });
  }
  controls.lock(); // el lock en el gesto es fiable; la carga cubre el cambio
});

// Llamado desde network.js en cada init: actualiza la semilla activa y cierra
// la pantalla de carga. Si se pidió una semilla, espera el init que la
// confirma antes de cerrar (evita destapar el mundo anterior durante el
// cambio).
export function onWorldLoaded(seed) {
  currentSeed = seed;
  if (seedPending) {
    if (seed === seedPending) { seedPending = null; finishLoading(); }
    return;
  }
  finishLoading();
}

// El servidor rechazó el cambio (otros jugadores en línea, mundo ilegible o
// fallo de guardado): volver al menú y avisar.
export function onSeedRejected(reason) {
  seedPending = null;
  finishLoading(); // ocultar la carga (fade) antes de mostrar el menú
  controls.unlock(); // el handler de unlock vuelve a mostrar el menú
  const msgs = {
    rechazo: '🌱 No se pudo abrir el mundo de esa semilla (formato más nuevo).',
    others: '🌱 Hay otros jugadores en línea: no se puede cambiar la semilla ahora.',
    error: '🌱 No se pudo guardar el mundo actual: cambio de semilla cancelado.',
  };
  flashMessage(msgs[reason] || msgs.error);
}

export function applyInventory(inv) {
  inventory = inv;
  updateHotbarUI();
  updateCraftInventoryUI();
  updateFurnaceInventoryUI();
}
export function applyHealth(hp, maxHp) {
  health = hp;
  if (typeof maxHp === 'number') maxHealth = maxHp;
  updateHealthUI();
}
export function applyXp(x, lvl) {
  xp = x;
  if (typeof lvl === 'number') level = lvl;
  updateXpUI();
}
export function applyFood(f, s) {
  food = f;
  saturation = typeof s === 'number' ? s : f; // defensivo: servidores viejos sin saturación
  updateFoodUI();
}
export function selectSlot(i) { selectedSlot = i; send('inventory_select', { slot: i }); updateHotbarUI(); }

export function flashMessage(text) {
  addChatLine('Sistema', text);
}

// ============================================================
// CHAT
// ============================================================
const chatLog = document.getElementById('chat-log');
const chatInput = document.getElementById('chat-input');
export function addChatLine(author, message) {
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
      chatInput.classList.add('active'); chatInput.focus();
      showBlocker(false); // el chat también libera el puntero sin el menú encima
      controls.unlock();
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

export function applyCraftingGrid(grid, success) {
  craftingGrid = grid;
  updateCraftGridUI(success);
}

function toggleCraftingUI(show) {
  craftingUI.classList.toggle('hidden', !show);
  if (show) {
    updateCraftInventoryUI(); updateCraftGridUI(false);
    showBlocker(false); // quitar el menú para poder clicar los slots (bug inventario)
    controls.unlock();
  }
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

export function applyFurnaceState(data) {
  openFurnaceKey = data.key;
  furnaceFuelEl.textContent = data.fuelItem ? `${itemLabel(data.fuelItem)} (${data.fuelTicksLeft})` : 'Combustible';
  furnaceInputEl.textContent = data.inputItem ? `${itemLabel(data.inputItem)} x${data.inputCount}` : 'Material';
  furnaceOutputEl.textContent = data.outputItem ? `${itemLabel(data.outputItem)} x${data.outputCount}` : 'Salida';
  const pct = data.requiredTicks ? Math.round((data.progress / data.requiredTicks) * 100) : 0;
  furnaceProgressEl.textContent = pct > 0 ? `${pct}%` : '→';
}

furnaceOutputEl.addEventListener('click', () => send('furnace_action', { action: 'collect_output' }));

export function toggleFurnaceUI(show, coords) {
  furnaceUI.classList.toggle('hidden', !show);
  if (show) {
    updateFurnaceInventoryUI();
    send('furnace_open', coords);
    showBlocker(false); // quitar el menú para poder clicar los slots (bug inventario)
    controls.unlock();
  } else if (openFurnaceKey) {
    send('furnace_action', { action: 'close' });
    openFurnaceKey = null;
  }
}

// ============================================================
// PANELES: abrir/cerrar desde el input
// ============================================================
export function openCraftingFromBlock() {
  inventoryOpen = true;
  toggleCraftingUI(true);
}
export function toggleInventory() {
  inventoryOpen = !inventoryOpen;
  toggleCraftingUI(inventoryOpen);
  if (!inventoryOpen) controls.lock();
}
export function closePanels() {
  const hadPanel = inventoryOpen || openFurnaceKey !== null;
  toggleCraftingUI(false);
  toggleFurnaceUI(false);
  inventoryOpen = false;
  if (hadPanel) controls.lock(); // Escape cierra el panel y reanuda el juego
}
