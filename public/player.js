// ============================================================
// FÍSICA Y MOVIMIENTO DEL JUGADOR LOCAL
// ============================================================
import * as THREE from 'three';
import { scene, camera, renderer, controls } from './scene.js';
import { getClientBlock, chunkMeshes, lodMeshes, applyFrustumCulling, updateLod, geoPoolStats } from './world.js';
import { send } from './connection.js';
import { updateDayNight } from './daynight.js';
import { playStep, updateAmbient } from './audio.js';
import { updateCoords } from './settings.js';
import { WATER } from './constants.js';

const PLAYER_SPEED = 4.3;   // bloques/segundo (en tierra)
const SWIM_SPEED = 2.6;     // bloques/segundo (en agua)
const GRAVITY = 18;
const WATER_GRAVITY = 6;    // gravedad reducida bajo el agua (flotación)
const SINK_SPEED = 1.4;     // velocidad máxima de hundimiento
const SWIM_UP_SPEED = 4;    // nadar hacia arriba con espacio
const JUMP_SPEED = 7;
const EYE_HEIGHT = 1.6;

let velocityY = 0;
let onGround = false;
export const move = { forward: false, back: false, left: false, right: false, jump: false };

export function teleport(x, y, z) {
  camera.position.set(x, y, z);
  velocityY = 0;
}

function solidAt(x, y, z) {
  const b = getClientBlock(Math.floor(x), Math.floor(y), Math.floor(z));
  // El agua no es sólida: se puede nadar a través de ella.
  return b !== 0 && b !== -1 && b !== WATER;
}

function isWaterAt(x, y, z) {
  return getClientBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === WATER;
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
let lodTimer = 0;          // throttle del cambio de tier LOD (Fase 6)
let stepDist = 0;          // distancia recorrida acumulada para el sonido de pasos
const STEP_SPACING = 0.72; // bloques entre pasos

// ============================================================
// MÉTRICAS DE RENDIMIENTO (HUD + ventana para la auditoría)
// Media móvil de 1s expuesta en window.__mc*; el #fps del HUD la dibuja.
// ============================================================
const fpsEl = document.getElementById('fps');
let perfFrames = 0, perfAmbient = 0, perfCull = 0, perfFrameMs = 0;
let perfTimer = performance.now();

// Métricas por frame: ambientMs se mide AISLADO (solo updateAmbient), cullMs
// solo el frustum culling, frameMs incluye todo el frame (física + render).
// FPS = 1000 / frameMs medio, robusto incluso con frames lentos.
function updatePerfMetrics(ambientMs, cullMs, frameMs) {
  perfFrames++;
  perfAmbient += ambientMs;
  perfCull += cullMs;
  perfFrameMs += frameMs;
  const now = performance.now();
  const elapsed = now - perfTimer;
  if (elapsed >= 1000 && perfFrames > 0) {
    window.__mcFps = 1000 / (perfFrameMs / perfFrames);
    window.__mcFrameMs = perfFrameMs / perfFrames;
    window.__mcAmbientMs = perfAmbient / perfFrames;
    window.__mcCullMs = perfCull / perfFrames; // media móvil de 1s, como las demás
    window.__mcChunks = chunkMeshes.size + lodMeshes.size; // completo + LOD (Fase 6)
    window.__mcTriangles = renderer.info.render.triangles;
    window.__mcGeoPool = geoPoolStats(); // reutilización de geometrías (Fase 6)
    if (fpsEl) {
      // Fase 6: muestra cuántos chunks del total están realmente visibles (culling)
      fpsEl.textContent = `${window.__mcFps.toFixed(0)} FPS · ${window.__mcVisibleChunks}/${window.__mcChunks} chunks`;
    }
    perfFrames = 0; perfAmbient = 0; perfCull = 0; perfFrameMs = 0; perfTimer = now;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  if (controls.isLocked) {
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    forward.y = 0; forward.normalize();
    const right = new THREE.Vector3().crossVectors(forward, camera.up).negate();

    const feet = camera.position.y - EYE_HEIGHT;
    // ¿Jugador en el agua? (cuerpo a la altura del pecho/cabeza)
    const inWater =
      isWaterAt(camera.position.x, feet + 0.8, camera.position.z) ||
      isWaterAt(camera.position.x, feet + 1.4, camera.position.z);

    let dx = 0, dz = 0;
    if (move.forward) { dx += forward.x; dz += forward.z; }
    if (move.back) { dx -= forward.x; dz -= forward.z; }
    if (move.left) { dx -= right.x; dz -= right.z; }
    if (move.right) { dx += right.x; dz += right.z; }
    const len = Math.hypot(dx, dz);
    // En el agua se nada más lento (resistencia del medio)
    const speed = inWater ? SWIM_SPEED : PLAYER_SPEED;
    if (len > 0) { dx = (dx / len) * speed * dt; dz = (dz / len) * speed * dt; }
    tryMove(dx, dz);

    // Gravedad, salto y natación
    onGround = solidAt(camera.position.x, feet - 0.05, camera.position.z);
    if (inWater) {
      // Flotación: gravedad reducida, hundimiento lento y límite de caída;
      // espacio nada hacia arriba (permite salir a la superficie). Al tocar
      // el fondo (onGround) se reposa sin jitter.
      if (onGround) velocityY = 0;
      else velocityY -= WATER_GRAVITY * dt;
      velocityY = Math.max(velocityY, -SINK_SPEED);
      if (move.jump) velocityY = SWIM_UP_SPEED;
    } else if (onGround) {
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

    // Pasos: suenan al caminar por el suelo, cada ~0.72 bloques
    if (onGround && len > 0) {
      stepDist += Math.hypot(dx, dz);
      if (stepDist >= STEP_SPACING) {
        stepDist = 0;
        const under = getClientBlock(Math.floor(camera.position.x), Math.floor(feet - 0.1), Math.floor(camera.position.z));
        playStep(under);
      }
    } else {
      stepDist = 0;
    }

    netTimer += dt;
    if (netTimer > 0.05) {
      netTimer = 0;
      send('move', { x: camera.position.x, y: camera.position.y, z: camera.position.z, yaw: camera.rotation.y, pitch: camera.rotation.x });
    }
  }

  const frameT0 = performance.now();
  updateDayNight();
  const ambientT0 = performance.now();
  updateAmbient();
  const ambientMs = performance.now() - ambientT0;
  // Fase 6: frustum culling — no se renderizan los chunks fuera del campo de visión
  const cullT0 = performance.now();
  applyFrustumCulling(camera);
  const cullMs = performance.now() - cullT0;
  // Fase 6 (LOD): cambiar de tier según la distancia con throttle (~4 veces/s):
  // reconstruir cada frame sería caro; cada 250 ms es imperceptible.
  lodTimer += dt;
  if (lodTimer >= 0.25) {
    lodTimer = 0;
    updateLod();
  }
  renderer.render(scene, camera);
  updateCoords(camera.position.x, camera.position.y, camera.position.z, camera.rotation.y); // Fase 7: capa de coordenadas
  updatePerfMetrics(ambientMs, cullMs, performance.now() - frameT0);
}
animate();
