// ============================================================
// AJUSTES DEL CLIENTE (Fase 7): persistidos en localStorage (mc_settings).
// renderDistance limita qué chunks se construyen (ver world.js) y se notifica
// al servidor (genera/reenvía los del radio). showCoords muestra las
// coordenadas en pantalla. updateCoords() se llama cada frame desde el bucle
// de animación (public/player.js).
// ============================================================
import { send } from './connection.js';
import { setRenderDistance } from './world.js';

const STORAGE_KEY = 'mc_settings';
const DEFAULTS = { renderDistance: 6, showCoords: false };

let settings = { ...DEFAULTS };
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) settings = { ...DEFAULTS, ...JSON.parse(raw) };
} catch { /* valores por defecto */ }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch { /* sin almacenamiento */ }
}

export function getSettings() { return { ...settings }; }
export function getSetting(key) { return settings[key]; }

const coordsHud = document.getElementById('coords-hud');

function updateCoordsHudVisibility() {
  if (coordsHud) coordsHud.classList.toggle('hidden', !settings.showCoords);
}
updateCoordsHudVisibility();

// Cambia un ajuste, lo aplica y lo persiste. renderDistance además avisa al
// servidor para que genere/reenvíe los chunks del nuevo radio.
export function setSetting(key, value) {
  if (key === 'renderDistance') {
    const rd = Math.min(10, Math.max(2, Math.round(value)));
    settings.renderDistance = rd;
    setRenderDistance(rd);
    send('settings', { renderDistance: rd });
  } else if (key === 'showCoords') {
    settings.showCoords = !!value;
    updateCoordsHudVisibility();
  }
  save();
}

// Se llama desde network.js al recibir el init (tras cargar el mundo): aplica
// la distancia de render guardada (descarta chunks sobrantes) y sincroniza el
// valor con el servidor para que genere/reenvíe los chunks del radio pedido.
export function applyStoredSettings() {
  setRenderDistance(settings.renderDistance);
  updateCoordsHudVisibility();
  send('settings', { renderDistance: settings.renderDistance });
}

// Dirección cardinal a partir del yaw (rotation.y de la cámara): yaw 0 = -Z
// (norte); girando +90° la cámara mira a -X (oeste), como en el mundo.
function compass(yaw) {
  const dirs = ['N', 'NO', 'O', 'SO', 'S', 'SE', 'E', 'NE'];
  let a = yaw % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return dirs[Math.round(a / (Math.PI / 4)) % 8];
}

// Se llama cada frame desde el bucle de animación; solo toca el DOM cuando la
// capa de coordenadas está visible (no hace nada en el caso normal).
export function updateCoords(x, y, z, yaw) {
  if (!settings.showCoords || !coordsHud) return;
  coordsHud.textContent = `XYZ ${x.toFixed(1)} / ${y.toFixed(1)} / ${z.toFixed(1)} · ${compass(yaw)}`;
}
