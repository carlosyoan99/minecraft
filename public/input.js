// ============================================================
// INPUT: TECLADO (movimiento, hotbar, paneles) Y RATÓN (romper/colocar/atacar)
// ============================================================
import * as THREE from 'three';
import { camera, renderer, controls } from './scene.js';
import { getClientBlock, chunkMeshes } from './world.js';
import { mobMeshes } from './mobs.js';
import { move } from './player.js';
import {
  selectSlot, toggleInventory, openCraftingFromBlock, closePanels,
  toggleFurnaceUI, getHeldItem, isChatFocused,
} from './ui.js';
import { send } from './connection.js';
import { playBreak, playPlace, playEat, playFeed } from './audio.js';
import { PLACEABLE_BLOCKS, FOOD_ITEMS, BREED_FOOD, WATER } from './constants.js';

// ============================================================
// TECLADO
// ============================================================
document.addEventListener('keydown', (e) => {
  if (isChatFocused()) return;
  switch (e.code) {
    case 'KeyW': move.forward = true; break;
    case 'KeyS': move.back = true; break;
    case 'KeyA': move.left = true; break;
    case 'KeyD': move.right = true; break;
    case 'Space': move.jump = true; break;
    case 'Digit1': case 'Digit2': case 'Digit3': case 'Digit4': case 'Digit5':
    case 'Digit6': case 'Digit7': case 'Digit8': case 'Digit9': {
      const n = parseInt(e.code.replace('Digit', ''), 10) - 1;
      selectSlot(n);
      break;
    }
    case 'KeyE': toggleInventory(); break;
    case 'Escape': closePanels(); break;
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
// RATÓN: ROMPER / COLOCAR / ATACAR
// ============================================================
const raycaster = new THREE.Raycaster();
raycaster.far = 7;
// Solo los pasivos se pueden alimentar (trigo/zanahoria/semillas); el
// conejo también come zanahorias (Fase 5)
const PASSIVE_MOBS = new Set(['cow', 'pig', 'chicken', 'sheep', 'rabbit']);

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

  const held = getHeldItem();
  const hit = raycastTerrainAndMobs();

  // Alimentar animales: clic derecho sobre un animal pasivo con su comida de
  // cría (trigo → vaca/oveja, zanahoria → cerdo, semillas → pollo); izquierdo ataca.
  if (hit && hit.object.userData.mobId) {
    if (e.button === 0) {
      send('attack_mob', { mobId: hit.object.userData.mobId });
    } else if (e.button === 2 && held && BREED_FOOD.has(held.id) &&
               PASSIVE_MOBS.has(hit.object.userData.mobType)) {
      playFeed();
      send('feed_mob', { mobId: hit.object.userData.mobId });
    }
    return;
  }

  // Comer con clic derecho: si llevas comida en la mano, se come sin
  // necesidad de apuntar a un bloque (como en Minecraft).
  if (e.button === 2 && held && FOOD_ITEMS.has(held.id)) {
    playEat();
    send('eat', {});
    return;
  }

  if (!hit) return;

  const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
  const x = Math.floor(point.x), y = Math.floor(point.y), z = Math.floor(point.z);

  if (e.button === 0) {
    const target = getClientBlock(x, y, z);
    if (target === 16) { toggleFurnaceUI(true, { x, y, z }); return; }
    if (target === 15) { openCraftingFromBlock(); return; }
    if (target === WATER) return; // el agua no se puede romper (sin cubo): sin feedback falso
    playBreak(target);
    send('block_action', { action: 'break', x, y, z });
  } else if (e.button === 2) {
    const nx = x + Math.round(hit.face.normal.x);
    const ny = y + Math.round(hit.face.normal.y);
    const nz = z + Math.round(hit.face.normal.z);
    const held = getHeldItem();
    if (held && PLACEABLE_BLOCKS.has(held.id)) {
      playPlace(held.id);
      send('block_action', { action: 'place', x: nx, y: ny, z: nz, itemId: held.id });
    }
  }
});
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
