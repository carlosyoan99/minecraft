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

// ============================================================
// ETIQUETA DE NOMBRE FLOTANTE (Fase 7)
// Sprite de texto encima de la cabeza del jugador remoto. Se redibuja en un
// canvas y se sube al GPU con needsUpdate cuando el nombre cambia.
// ============================================================
function makeNameTag(name) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const tag = new THREE.Sprite(mat);
  const draw = (text) => {
    g.clearRect(0, 0, c.width, c.height);
    g.font = 'bold 40px monospace';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.strokeText(text, c.width / 2, c.height / 2);
    g.fillStyle = '#ffffff';
    g.fillText(text, c.width / 2, c.height / 2);
    tex.needsUpdate = true;
  };
  draw(name);
  tag.scale.set(2.4, 0.6, 1);
  tag.position.set(0, 2.25, 0); // flotando sobre la cabeza
  return { tag, draw };
}

export function spawnRemotePlayer(id, x, y, z, name = '') {
  const mesh = makeHumanoid(0xdd4444);
  mesh.position.set(x, y, z);
  const nameTag = makeNameTag(name || id.slice(0, 6));
  mesh.add(nameTag.tag);
  mesh.userData.nameTag = nameTag;
  scene.add(mesh);
  remotePlayers.set(id, mesh);
}

export function renameRemotePlayer(id, name) {
  const mesh = remotePlayers.get(id);
  if (mesh && mesh.userData.nameTag && name) mesh.userData.nameTag.draw(name);
}

export function removeRemotePlayer(id) {
  const mesh = remotePlayers.get(id);
  if (mesh) { scene.remove(mesh); remotePlayers.delete(id); }
}

export function updateRemotePlayer(id, x, y, z, yaw) {
  const mesh = remotePlayers.get(id);
  if (mesh) { mesh.position.set(x, y, z); mesh.rotation.y = yaw; }
}

// Escala por tipo (Fase 5): la araña y el conejo son pequeños, el lobo
// es algo más grande que un humanoide. Los bebés se renderizan a media escala.
const MOB_SCALE = {
  spider: 0.7, rabbit: 0.55, wolf: 1.05,
};

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
    const s = (m.isBaby ? 0.5 : 1) * (MOB_SCALE[m.type] || 1);
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
