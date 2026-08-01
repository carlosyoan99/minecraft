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
  }
  for (const [id, mesh] of mobMeshes) {
    if (!seen.has(id)) { scene.remove(mesh); mobMeshes.delete(id); }
  }
}

export function removeMob(id) {
  const mesh = mobMeshes.get(id);
  if (mesh) { scene.remove(mesh); mobMeshes.delete(id); }
}
