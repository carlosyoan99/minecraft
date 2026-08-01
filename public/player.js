// ============================================================
// FÍSICA Y MOVIMIENTO DEL JUGADOR LOCAL
// ============================================================
import * as THREE from 'three';
import { scene, camera, renderer, controls } from './scene.js';
import { getClientBlock } from './world.js';
import { send } from './connection.js';

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
