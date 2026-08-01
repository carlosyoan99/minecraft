// ============================================================
// ALMACÉN DE MUNDO EN CLIENTE (chunks + geometría, culling entre chunks)
// ============================================================
import * as THREE from 'three';
import { scene } from './scene.js';
import { CHUNK_SIZE, WORLD_HEIGHT } from './constants.js';
import { buildTerrainAtlas, tileForFace, tileRect } from './textures.js';

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

// Material compartido por todos los chunks: un único atlas de texturas.
// Se crea una sola vez; NUNCA se hace dispose de él al reconstruir/descargar
// chunks (solo se libera la geometría).
const terrainMaterial = new THREE.MeshLambertMaterial({ map: buildTerrainAtlas() });

// Geometrías de una única cara (evita crear cubos completos por cara expuesta).
// `uvs` mapea cada esquina a la tesela del atlas (v arriba = textura vertical correcta).
const FACES = [
  { dir: [1, 0, 0], corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]], uvs: [[0,0],[0,1],[1,1],[1,0]] },   // +X
  { dir: [-1, 0, 0], corners: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]], uvs: [[0,0],[0,1],[1,1],[1,0]] },  // -X
  { dir: [0, 1, 0], corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]], uvs: [[0,0],[0,1],[1,1],[1,0]] },   // +Y
  { dir: [0, -1, 0], corners: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]], uvs: [[0,0],[0,1],[1,1],[1,0]] },  // -Y
  { dir: [0, 0, 1], corners: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]], uvs: [[0,0],[0,1],[1,1],[1,0]] },   // +Z
  { dir: [0, 0, -1], corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]], uvs: [[0,0],[0,1],[1,1],[1,0]] },  // -Z
];

function buildChunkGeometry(cx, cz) {
  const chunk = chunkStore.get(`${cx},${cz}`);
  if (!chunk) return null;
  const baseX = cx * CHUNK_SIZE, baseZ = cz * CHUNK_SIZE;

  // Un único buffer por chunk con UVs del atlas (material compartido):
  // en vez de agrupar por color, cada cara apunta a su tesela vía UV.
  const positions = [], normals = [], uvs = [];

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let y = 0; y < WORLD_HEIGHT; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        const block = chunk[cIdx(x, y, z)];
        if (block === 0) continue;
        const wx = baseX + x, wy = y, wz = baseZ + z;
        for (let fi = 0; fi < FACES.length; fi++) {
          const face = FACES[fi];
          const nx = wx + face.dir[0], ny = wy + face.dir[1], nz = wz + face.dir[2];
          const neighbor = getClientBlock(nx, ny, nz);
          if (neighbor !== 0) continue; // solo dibujar si el vecino es aire confirmado
          const [u0, v0, u1, v1] = tileRect(tileForFace(block, fi));
          const [a, b, c, d] = face.corners;
          const verts = [
            [wx + a[0], wy + a[1], wz + a[2]],
            [wx + b[0], wy + b[1], wz + b[2]],
            [wx + c[0], wy + c[1], wz + c[2]],
            [wx + d[0], wy + d[1], wz + d[2]],
          ];
          // dos triángulos (a,b,c) y (a,c,d)
          for (const [i, j, k] of [[0,1,2],[0,2,3]]) {
            for (const idx of [i, j, k]) {
              positions.push(...verts[idx]);
              normals.push(...face.dir);
              const [uu, vv] = face.uvs[idx];
              uvs.push(u0 + uu * (u1 - u0), v0 + vv * (v1 - v0));
            }
          }
        }
      }
    }
  }

  if (positions.length === 0) return null;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const mesh = new THREE.Mesh(geo, terrainMaterial);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.isTerrain = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
}

export function rebuildChunk(key) {
  const [cx, cz] = key.split(',').map(Number);
  const old = chunkMeshes.get(key);
  if (old) {
    scene.remove(old);
    // Solo se libera la geometría: el material (atlas) es compartido por todos los chunks.
    old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
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
      // Solo geometría: el material del atlas es compartido y no debe liberarse.
      old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      chunkMeshes.delete(key);
    }
    chunkStore.delete(key);
  }
}
