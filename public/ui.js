// ============================================================
// UI: HUD (hotbar, salud), chat, panel de crafteo y panel de horno
// ============================================================
import { controls } from './scene.js';
import { send } from './connection.js';
import { itemLabel, itemColor } from './constants.js';
import { isMuted, setMuted } from './audio.js';

// Estado que dibuja el HUD (lo actualiza la red; lo lee el input)
let inventory = new Array(36).fill(null);
let selectedSlot = 0;
let craftingGrid = new Array(9).fill(null);
let openFurnaceKey = null;
let health = 20;
let food = 20;
let saturation = 20; // barra dorada sobre la comida (como en Minecraft)
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
      slot.title = itemLabel(item.id);
    }
    slot.addEventListener('click', () => { selectedSlot = i; send('inventory_select', { slot: i }); updateHotbarUI(); });
    hotbarEl.appendChild(slot);
  }
}
function updateHealthUI() { document.getElementById('hp').textContent = health; }

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

export function applyInventory(inv) {
  inventory = inv;
  updateHotbarUI();
  updateCraftInventoryUI();
  updateFurnaceInventoryUI();
}
export function applyHealth(hp) { health = hp; updateHealthUI(); }
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

export function applyCraftingGrid(grid, success) {
  craftingGrid = grid;
  updateCraftGridUI(success);
}

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
  toggleCraftingUI(false);
  toggleFurnaceUI(false);
  inventoryOpen = false;
}
