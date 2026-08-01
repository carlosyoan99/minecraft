// ============================================================
// ALMACÉN DE MUNDO EN CLIENTE (chunks + geometría, culling entre chunks)
// ============================================================
import * as THREE from 'three';
import { scene } from './scene.js';
import { CHUNK_SIZE, WORLD_HEIGHT, itemColor } from './constants.js';

const chunkStore = new Map();     // "cx,cz" -> Uint8Array
export const chunkMeshes = new Map();  // "cx,cz" -> THREE.Group

function cIdx(x, y, z) { return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x; }

export function getClientBlock(wx, wy, wz) {
  if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const chunk = chunkStore.get(`${cx},${cz}`);
  if (!chunk) return -1; // -1 = desconocido (chunk no cargado): no dibujar cara para evitar huecos falsos
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  return chunk[cIdx(x, wy, z)];
}

export function setClientBlock(wx, wy, wz, block) {
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const key = `${cx},${cz}`;
  let chunk = chunkStore.get(key);
  if (!chunk) { chunk = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE); chunkStore.set(key, chunk); }
  const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  chunk[cIdx(x, wy, z)] = block;
}

// Geometrías de una única cara (evita crear cubos completos por cara expuesta)
const FACES = [
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },   // +X
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },  // -X
  { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },   // +Y
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },  // -Y
  { dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },   // +Z
  { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] },  // -Z
];

function buildChunkGeometry(cx, cz) {
  const chunk = chunkStore.get(`${cx},${cz}`);
  if (!chunk) return null;
  const baseX = cx * CHUNK_SIZE, baseZ = cz * CHUNK_SIZE;

  const geomsByColor = new Map(); // color -> arrays

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const block = chunk[cIdx(x, y, z)];
        if (block === 0) continue;
        const wx = baseX + x, wy = y, wz = baseZ + z;
        const color = itemColor(block);
        for (const face of FACES) {
          const nx = wx + face.dir[0], ny = wy + face.dir[1], nz = wz + face.dir[2];
          const neighbor = getClientBlock(nx, ny, nz);
          if (neighbor !== 0) continue; // solo dibujar si el vecino es aire confirmado
          let bucket = geomsByColor.get(color);
          if (!bucket) { bucket = { positions: [], normals: [] }; geomsByColor.set(color, bucket); }
          const [a, b, c, d] = face.corners;
          const verts = [
            [wx + a[0], wy + a[1], wz + a[2]],
            [wx + b[0], wy + b[1], wz + b[2]],
            [wx + c[0], wy + c[1], wz + c[2]],
            [wx + d[0], wy + d[1], wz + d[2]],
          ];
          // dos triángulos (a,b,c) y (a,c,d)
          for (const [i, j, k] of [[0,1,2],[0,2,3]]) {
            bucket.positions.push(...verts[i], ...verts[j], ...verts[k]);
            bucket.normals.push(...face.dir, ...face.dir, ...face.dir);
          }
        }
      }
    }
  }

  if (geomsByColor.size === 0) return null;

  const group = new THREE.Group();
  for (const [color, bucket] of geomsByColor) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(bucket.normals, 3));
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.userData.isTerrain = true;
    group.add(mesh);
  }
  return group;
}

export function rebuildChunk(key) {
  const [cx, cz] = key.split(',').map(Number);
  const old = chunkMeshes.get(key);
  if (old) {
    scene.remove(old);
    old.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }
  const group = buildChunkGeometry(cx, cz);
  if (group) { scene.add(group); chunkMeshes.set(key, group); }
  else chunkMeshes.delete(key);
}

export function rebuildAffectedChunks(wx, wz) {
  const cx = Math.floor(wx / CHUNK_SIZE), cz = Math.floor(wz / CHUNK_SIZE);
  const localX = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  const localZ = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
  rebuildChunk(`${cx},${cz}`);
  if (localX === 0) rebuildChunk(`${cx - 1},${cz}`);
  if (localX === CHUNK_SIZE - 1) rebuildChunk(`${cx + 1},${cz}`);
  if (localZ === 0) rebuildChunk(`${cx},${cz - 1}`);
  if (localZ === CHUNK_SIZE - 1) rebuildChunk(`${cx},${cz + 1}`);
}

export function loadChunkData(chunkData) {
  for (const [key, arr] of Object.entries(chunkData)) chunkStore.set(key, Uint8Array.from(arr));
  for (const key of Object.keys(chunkData)) rebuildChunk(key);
}

export function unloadChunks(keys) {
  for (const key of keys || []) {
    const old = chunkMeshes.get(key);
    if (old) {
      scene.remove(old);
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      chunkMeshes.delete(key);
    }
    chunkStore.delete(key);
  }
}
