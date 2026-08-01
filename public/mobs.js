// ============================================================
// JUGADORES REMOTOS Y MOBS (meshes en la escena)
// ============================================================
import * as THREE from 'three';
import { scene } from './scene.js';

const remotePlayers = new Map(); // id -> mesh
export const mobMeshes = new Map(); // id -> mesh

function makeHumanoid(color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 1.8, 0.6),
    new THREE.MeshLambertMaterial({ color })
  );
  mesh.castShadow = true;
  return mesh;
}

export function spawnRemotePlayer(id, x, y, z) {
  const mesh = makeHumanoid(0xdd4444);
  mesh.position.set(x, y, z);
  scene.add(mesh);
  remotePlayers.set(id, mesh);
}

export function removeRemotePlayer(id) {
  const mesh = remotePlayers.get(id);
  if (mesh) { scene.remove(mesh); remotePlayers.delete(id); }
}

export function updateRemotePlayer(id, x, y, z, yaw) {
  const mesh = remotePlayers.get(id);
  if (mesh) { mesh.position.set(x, y, z); mesh.rotation.y = yaw; }
}

export function updateMobs(list) {
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
    // Los bebés se renderizan a media escala hasta hacerse adultos
    const s = m.isBaby ? 0.5 : 1;
    mesh.scale.set(s, s, s);
  }
  for (const [id, mesh] of mobMeshes) {
    if (!seen.has(id)) { scene.remove(mesh); mobMeshes.delete(id); }
  }
}

export function removeMob(id) {
  const mesh = mobMeshes.get(id);
  if (mesh) { scene.remove(mesh); mobMeshes.delete(id); }
}

// ============================================================
// CORAZONES DE CRÍA (partículas simples que suben flotando)
// ============================================================
let heartTexture = null;
function getHeartTexture() {
  if (heartTexture) return heartTexture;
  const c = document.createElement('canvas');
  c.width = c.height = 16;
  const g = c.getContext('2d');
  g.fillStyle = '#ff4d6d';
  g.beginPath();
  g.arc(5, 6, 3.5, 0, Math.PI * 2);
  g.arc(11, 6, 3.5, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(2.5, 7.5); g.lineTo(8, 14.5); g.lineTo(13.5, 7.5); g.closePath(); g.fill();
  heartTexture = new THREE.CanvasTexture(c);
  return heartTexture;
}

// Ráfaga de corazones que suben flotando y se desvanecen (~1s)
export function spawnHearts(x, y, z) {
  const mat = new THREE.SpriteMaterial({ map: getHeartTexture(), transparent: true, depthWrite: false });
  const sprites = [];
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Sprite(mat);
    s.position.set(x + (Math.random() - 0.5) * 0.8, y + 0.6 + i * 0.15, z + (Math.random() - 0.5) * 0.8);
    s.scale.set(0.35, 0.35, 0.35);
    scene.add(s);
    sprites.push(s);
  }
  const start = performance.now();
  const DURATION = 1000;
  function animate() {
    const k = Math.min(1, (performance.now() - start) / DURATION);
    for (const s of sprites) {
      s.position.y += 0.004;
      s.material.opacity = 1 - k;
    }
    if (k < 1) {
      requestAnimationFrame(animate);
    } else {
      for (const s of sprites) { scene.remove(s); }
      mat.dispose();
      sprites.length = 0;
    }
  }
  requestAnimationFrame(animate);
}
