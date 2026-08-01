// ============================================================
// FÍSICA Y MOVIMIENTO DEL JUGADOR LOCAL
// ============================================================
import * as THREE from 'three';
import { scene, camera, renderer, controls } from './scene.js';
import { getClientBlock, chunkMeshes } from './world.js';
import { send } from './connection.js';
import { updateDayNight } from './daynight.js';
import { playStep, updateAmbient } from './audio.js';

const PLAYER_SPEED = 4.3;   // bloques/segundo
const GRAVITY = 18;
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
let stepDist = 0;          // distancia recorrida acumulada para el sonido de pasos
const STEP_SPACING = 0.72; // bloques entre pasos

// ============================================================
// MÉTRICAS DE RENDIMIENTO (HUD + ventana para la auditoría)
// Media móvil de 1s expuesta en window.__mc*; el #fps del HUD la dibuja.
// ============================================================
const fpsEl = document.getElementById('fps');
let perfFrames = 0, perfAmbient = 0, perfFrameMs = 0;
let perfTimer = performance.now();

// Métricas por frame: ambientMs se mide AISLADO (solo updateAmbient), frameMs
// incluye todo el frame (física + render). FPS = 1000 / frameMs medio, robusto
// incluso con frames lentos (no depende de cuántos frames caen en la ventana).
function updatePerfMetrics(ambientMs, frameMs) {
  perfFrames++;
  perfAmbient += ambientMs;
  perfFrameMs += frameMs;
  const now = performance.now();
  const elapsed = now - perfTimer;
  if (elapsed >= 1000 && perfFrames > 0) {
    window.__mcFps = 1000 / (perfFrameMs / perfFrames);
    window.__mcFrameMs = perfFrameMs / perfFrames;
    window.__mcAmbientMs = perfAmbient / perfFrames;
    window.__mcChunks = chunkMeshes.size;
    window.__mcTriangles = renderer.info.render.triangles;
    if (fpsEl) fpsEl.textContent = `${window.__mcFps.toFixed(0)} FPS · ${window.__mcChunks} chunks`;
    perfFrames = 0; perfAmbient = 0; perfFrameMs = 0; perfTimer = now;
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
  renderer.render(scene, camera);
  updatePerfMetrics(ambientMs, performance.now() - frameT0);
}
animate();
