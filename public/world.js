// ============================================================
// ALMACÉN DE MUNDO EN CLIENTE (chunks + geometría, culling entre chunks)
// ============================================================
import * as THREE from "three";
import {
	BLOCK_COLORS,
	CHUNK_SIZE,
	LAVA,
	TORCH,
	WATER,
	WORLD_HEIGHT
} from "./constants.js";
import { createGeometryPool, setOrReuseAttribute } from "./geopool.js";
import { computeChunkLight, LIGHT_RADIUS } from "./lighting.js";
import { lodTierFor } from "./lod.js";
import { camera, scene } from "./scene.js";
import { buildTerrainAtlas, tileForFace, tileRect } from "./textures.js";

const chunkStore = new Map(); // "cx,cz" -> Uint8Array
export const chunkMeshes = new Map(); // "cx,cz" -> THREE.Group (detalle completo)
export const lodMeshes = new Map(); // "cx,cz" -> THREE.Group (LOD: heightmap simplificado)

// ============================================================
// ILUMINACIÓN POR BLOQUE (Fase 6: antorchas)
// torchSet: posiciones de antorchas conocidas ("wx,wy,wz" -> [wx,wy,wz]).
// lightStore: luz horneada por chunk ("cx,cz" -> Float32Array o null si no
// hay antorchas relevantes cerca). Se hornea al construir la geometría y se
// re-hornea al colocar/romper una antorcha (rebuildAround de 3x3 chunks).
// ============================================================
const torchSet = new Map();
const lightStore = new Map();

// Ganancia de la luz de antorcha en el color por vértice: v = 1 + luz*G.
// De noche la luz global total es ~0.33, así una celda a luz 1 queda en
// 2.4 * 0.33 ≈ 0.79 (claramente iluminada); de día la luz global satura y
// las antorchas apenas se notan (como en Minecraft).
const TORCH_LIGHT_GAIN = 1.4;

// ============================================================
// DISTANCIA DE RENDER (Fase 7, ajustable desde el menú de Ajustes)
// Limita qué chunks se almacenan/construyen: los que quedan fuera del radio
// (distancia Chebyshev en chunks al chunk del jugador) no se guardan ni se
// dibujan. Al reducirla se descargan los lejanos; al ampliarla el servidor
// reenvía los chunks del nuevo radio (settings → chunks_add).
// ============================================================
let renderDistance = 6; // chunks (2..10); debe coincidir con el servidor

function withinRenderDistance(cx, cz) {
	const pcx = Math.floor(camera.position.x / CHUNK_SIZE);
	const pcz = Math.floor(camera.position.z / CHUNK_SIZE);
	return (
		Math.abs(cx - pcx) <= renderDistance && Math.abs(cz - pcz) <= renderDistance
	);
}

export function setRenderDistance(rd) {
	renderDistance = Math.min(10, Math.max(2, Math.round(rd)));
	const toRemove = [];
	for (const key of chunkStore.keys()) {
		const [cx, cz] = key.split(",").map(Number);
		if (!withinRenderDistance(cx, cz)) toRemove.push(key);
	}
	if (toRemove.length) unloadChunks(toRemove);
}

// Módulo de texturas activo: apunta al importado estáticamente, pero
// hotReloadTextures() lo reemplaza por una instancia fresca (dynamic import
// con cache-busting) para que la geometría reconstruida use las teselas/UVs
// nuevos si cambió el layout del atlas (Fase 6, hot-reload).
let tex = { tileForFace, tileRect };

// Frustum culling (Fase 6): objetos reutilizados por frame (sin allocs).
const frustum = new THREE.Frustum();
const projScreen = new THREE.Matrix4();
// Margen sobre la esfera envolvente de cada chunk: evita parpadeo cuando la
// geometría asoma por el borde de la pantalla justo antes de salir del frustum.
const FRUSTUM_MARGIN = 1.05;

// Esfera envolvente de un chunk a partir de su geometría real (no de la caja
// completa de la columna, que sería demasiado conservadora en montañas/cuevas).
// Se calcula UNA vez por chunk al construirlo y se guarda en userData.
function computeChunkSphere(group) {
	const box = new THREE.Box3();
	group.traverse((o) => {
		if (o.isMesh && o.geometry) box.expandByObject(o);
	});
	const sphere = box.getBoundingSphere(new THREE.Sphere());
	sphere.radius *= FRUSTUM_MARGIN;
	return sphere;
}

function cIdx(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

export function getClientBlock(wx, wy, wz) {
	if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const chunk = chunkStore.get(`${cx},${cz}`);
	if (!chunk) return -1; // -1 = desconocido (chunk no cargado): no dibujar cara para evitar huecos falsos
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	return chunk[cIdx(x, wy, z)];
}

export function setClientBlock(wx, wy, wz, block) {
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const key = `${cx},${cz}`;
	let chunk = chunkStore.get(key);
	if (!chunk) {
		chunk = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
		chunkStore.set(key, chunk);
	}
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const prev = chunk[cIdx(x, wy, z)];
	chunk[cIdx(x, wy, z)] = block;
	// Mantener el registro de antorchas (lo usa la iluminación). Devuelve el
	// bloque anterior para que la red decida si reconstruir el vecindario.
	const torchKey = `${wx},${wy},${wz}`;
	if (prev === TORCH) torchSet.delete(torchKey);
	if (block === TORCH) torchSet.set(torchKey, [wx, wy, wz]);
	return prev;
}

// Material compartido por todos los chunks: un único atlas de texturas.
// Se crea una sola vez; NUNCA se hace dispose de él al reconstruir/descargar
// chunks (solo se libera la geometría).
const atlasTexture = buildTerrainAtlas();
// vertexColors: true en todos los materiales texturizados: el color por
// vértice (luz de antorcha horneada) MULTIPLICA el atlas y la luz global.
const terrainMaterial = new THREE.MeshLambertMaterial({
	map: atlasTexture,
	vertexColors: true
});
// El agua es translúcida: material aparte (misma tesela del atlas), para que
// se vea el lecho del lago a través de la superficie sin volver opacas las
// caras sólidas adyacentes.
const waterMaterial = new THREE.MeshLambertMaterial({
	map: atlasTexture,
	transparent: true,
	opacity: 0.65,
	side: THREE.DoubleSide, // al nadar bajo la superficie, la cara superior se ve desde abajo
	vertexColors: true
});
// Lava (Fase 7): como el agua, pero opaca (no se ve el lecho a través) y
// DoubleSide por si el jugador cae dentro del charco. Emissive suave para
// que brille de noche (es un líquido incandescente).
const lavaMaterial = new THREE.MeshLambertMaterial({
	map: atlasTexture,
	transparent: false,
	opacity: 1,
	side: THREE.DoubleSide,
	vertexColors: true,
	emissive: 0x3a1200,
	emissiveIntensity: 0.45
});
// Antorchas (Fase 6): dos planos cruzados translúcidos (la tesela tiene
// fondo transparente), DoubleSide y sin depthWrite (que un plano no tape al
// otro); vertexColors para que brillen de noche.
const torchMaterial = new THREE.MeshLambertMaterial({
	map: atlasTexture,
	transparent: true,
	side: THREE.DoubleSide,
	depthWrite: false,
	vertexColors: true
});
// LOD de chunks lejanos (Fase 6): material de COLOR PLANO por vértice (sin
// textura ni teselas finas — geometría simplificada). Compartido por todos
// los chunks LOD; igual que el atlas, se crea una vez y nunca se hace dispose.
// vertexColors multiplica por la luz del día/noche (como el resto del mundo).
// DoubleSide: los muros del caparazón pueden verse por detrás desde un valle
// o desde muy arriba — es barato en un material sin textura.
const lodMaterial = new THREE.MeshLambertMaterial({
	vertexColors: true,
	side: THREE.DoubleSide
});

// Pool de geometrías (Fase 6): las BufferGeometry se reutilizan entre chunks
// en vez de dispose()+new. Por categoría (terrain/water/lod: cada una con su
// set de attributes), con tope para acotar la memoria retenida. Exponer el
// pool para la métrica del HUD (window.__mcGeoPool, ver player.js).
const geometryPool = createGeometryPool({
	makeGeometry: () => new THREE.BufferGeometry(),
	maxPooled: 24,
	categories: ["terrain", "water", "lod", "torch"]
});
export function geoPoolStats() {
	return geometryPool.stats();
}

// Geometrías de una única cara (evita crear cubos completos por cara expuesta).
// `uvs` mapea cada esquina a la tesela del atlas (v arriba = textura vertical correcta).
const FACES = [
	{
		dir: [1, 0, 0],
		corners: [
			[1, 0, 0],
			[1, 1, 0],
			[1, 1, 1],
			[1, 0, 1]
		],
		uvs: [
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0]
		]
	}, // +X
	{
		dir: [-1, 0, 0],
		corners: [
			[0, 0, 1],
			[0, 1, 1],
			[0, 1, 0],
			[0, 0, 0]
		],
		uvs: [
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0]
		]
	}, // -X
	{
		dir: [0, 1, 0],
		corners: [
			[0, 1, 0],
			[0, 1, 1],
			[1, 1, 1],
			[1, 1, 0]
		],
		uvs: [
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0]
		]
	}, // +Y
	{
		dir: [0, -1, 0],
		corners: [
			[0, 0, 1],
			[0, 0, 0],
			[1, 0, 0],
			[1, 0, 1]
		],
		uvs: [
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0]
		]
	}, // -Y
	{
		dir: [0, 0, 1],
		corners: [
			[1, 0, 1],
			[1, 1, 1],
			[0, 1, 1],
			[0, 0, 1]
		],
		uvs: [
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0]
		]
	}, // +Z
	{
		dir: [0, 0, -1],
		corners: [
			[0, 0, 0],
			[0, 1, 0],
			[1, 1, 0],
			[1, 0, 0]
		],
		uvs: [
			[0, 0],
			[0, 1],
			[1, 1],
			[1, 0]
		]
	} // -Z
];

function buildChunkGeometry(cx, cz) {
	const chunk = chunkStore.get(`${cx},${cz}`);
	if (!chunk) return null;
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;

	// Luz de antorcha del chunk (Fase 6): se hornea ANTES de empujar caras
	// (los colores por vértice dependen de ella).
	bakeChunkLight(cx, cz);

	// Buffers separados: terreno (opaco), agua (translúcida), lava y antorchas.
	const positions = [],
		normals = [],
		uvs = [],
		colors = [];
	const waterPositions = [],
		waterNormals = [],
		waterUvs = [],
		waterColors = [];
	const lavaPositions = [],
		lavaNormals = [],
		lavaUvs = [],
		lavaColors = [];
	const torchPositions = [],
		torchNormals = [],
		torchUvs = [],
		torchColors = [];

	// wx/wy/wz se pasan como parámetros: se declaran con const DENTRO del bucle
	// (block-scoped), así que una función definida fuera no puede capturarlos.
	// Bug de la Fase 4 (ReferenceError: wx is not defined → ningún chunk se
	// renderizaba); corregido al pasar las coordenadas explícitamente.
	const pushFace = (block, fi, target, wx, wy, wz) => {
		const [u0, v0, u1, v1] = tex.tileRect(tex.tileForFace(block, fi));
		const [a, b, c, d] = FACES[fi].corners;
		const verts = [
			[wx + a[0], wy + a[1], wz + a[2]],
			[wx + b[0], wy + b[1], wz + b[2]],
			[wx + c[0], wy + c[1], wz + c[2]],
			[wx + d[0], wy + d[1], wz + d[2]]
		];
		const face = FACES[fi];
		// Luz de antorcha en la celda de AIRE fuera de la cara (la celda que
		// "mira" la cara). Color por vértice: 1 = sin antorcha, más = más luz.
		const light = chunkLightAt(
			wx + face.dir[0],
			wy + face.dir[1],
			wz + face.dir[2]
		);
		const v = 1 + light * TORCH_LIGHT_GAIN;
		// dos triángulos (a,b,c) y (a,c,d)
		for (const [i, j, k] of [
			[0, 1, 2],
			[0, 2, 3]
		]) {
			for (const idx of [i, j, k]) {
				target.pos.push(...verts[idx]);
				target.norm.push(...face.dir);
				const [uu, vv] = face.uvs[idx];
				target.uv.push(u0 + uu * (u1 - u0), v0 + vv * (v1 - v0));
				target.col.push(v, v, v);
			}
		}
	};

	// Antorcha (Fase 6): dos planos cruzados (estilo Minecraft) de 0.5x0.6
	// bloques con la tesela 29 (palo + llama, fondo transparente). Se dibujan
	// SIEMPRE (DoubleSide): son diminutas y no ocluyen; la luz horneada en su
	// propio color las hace brillar de noche (su celda está a luz 1).
	const TORCH_W = 0.25,
		TORCH_H = 0.6;
	const torchLight = 1 + TORCH_LIGHT_GAIN;
	const [tu0, tv0, tu1, tv1] = tex.tileRect(tex.tileForFace(TORCH, 0));
	const QUAD_UVS = [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, 1]
	];
	const pushTorchQuad = (
		ax,
		ay,
		az,
		bx,
		by,
		bz,
		c2x,
		c2y,
		c2z,
		dx,
		dy,
		dz,
		nx,
		ny,
		nz
	) => {
		const verts = [
			[ax, ay, az],
			[bx, by, bz],
			[c2x, c2y, c2z],
			[dx, dy, dz]
		];
		for (const [i, j, k] of [
			[0, 1, 2],
			[0, 2, 3]
		]) {
			for (const idx of [i, j, k]) {
				torchPositions.push(...verts[idx]);
				torchNormals.push(nx, ny, nz);
				const [uu, vv] = QUAD_UVS[idx];
				torchUvs.push(tu0 + uu * (tu1 - tu0), tv0 + vv * (tv1 - tv0));
				torchColors.push(torchLight, torchLight, torchLight);
			}
		}
	};
	const pushTorch = (wx, wy, wz) => {
		// Plano 1: diagonal x=z (normal (-.707, 0, .707))
		pushTorchQuad(
			wx - TORCH_W,
			wy,
			wz - TORCH_W,
			wx + TORCH_W,
			wy,
			wz + TORCH_W,
			wx + TORCH_W,
			wy + TORCH_H,
			wz + TORCH_W,
			wx - TORCH_W,
			wy + TORCH_H,
			wz - TORCH_W,
			-Math.SQRT1_2,
			0,
			Math.SQRT1_2
		);
		// Plano 2: diagonal x=-z (normal (-.707, 0, -.707))
		pushTorchQuad(
			wx + TORCH_W,
			wy,
			wz - TORCH_W,
			wx - TORCH_W,
			wy,
			wz + TORCH_W,
			wx - TORCH_W,
			wy + TORCH_H,
			wz + TORCH_W,
			wx + TORCH_W,
			wy + TORCH_H,
			wz - TORCH_W,
			-Math.SQRT1_2,
			0,
			-Math.SQRT1_2
		);
	};

	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let y = 0; y < WORLD_HEIGHT; y++) {
			for (let z = 0; z < CHUNK_SIZE; z++) {
				const block = chunk[cIdx(x, y, z)];
				if (block === 0) continue;
				const wx = baseX + x,
					wy = y,
					wz = baseZ + z;
				const isWater = block === WATER;
				const isLava = block === LAVA;
				// Antorcha: geometría cruzada, sin caras de cubo.
				if (block === TORCH) {
					pushTorch(wx, wy, wz);
					continue;
				}
				for (let fi = 0; fi < FACES.length; fi++) {
					const face = FACES[fi];
					const nx = wx + face.dir[0],
						ny = wy + face.dir[1],
						nz = wz + face.dir[2];
					const neighbor = getClientBlock(nx, ny, nz);
					// Agua/lava: solo caras contra aire confirmado (superficie/orilla).
					// Sólido: caras contra aire O agua (el lecho del lago se ve bajo la
					// superficie; la lava es opaca, pero el culling compartido evita que
					// las caras enterradas del charco generen geometría invisible).
					if (isWater || isLava) {
						if (neighbor !== 0) continue;
					} else {
						if (neighbor !== 0 && neighbor !== WATER) continue;
					}
					const target = isWater
						? {
								pos: waterPositions,
								norm: waterNormals,
								uv: waterUvs,
								col: waterColors
							}
						: isLava
							? {
									pos: lavaPositions,
									norm: lavaNormals,
									uv: lavaUvs,
									col: lavaColors
								}
							: { pos: positions, norm: normals, uv: uvs, col: colors };
					pushFace(block, fi, target, wx, wy, wz);
				}
			}
		}
	}

	if (
		positions.length === 0 &&
		waterPositions.length === 0 &&
		lavaPositions.length === 0 &&
		torchPositions.length === 0
	)
		return null;

	const group = new THREE.Group();
	if (positions.length > 0) {
		const geo = geometryPool.acquire("terrain");
		setOrReuseAttribute(
			geo,
			"position",
			positions,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			normals,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(geo, "uv", uvs, 2, THREE.Float32BufferAttribute);
		setOrReuseAttribute(geo, "color", colors, 3, THREE.Float32BufferAttribute);
		const mesh = new THREE.Mesh(geo, terrainMaterial);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.isTerrain = true;
		mesh.userData.poolCat = "terrain"; // categoría del pool al liberar
		group.add(mesh);
	}
	if (waterPositions.length > 0) {
		const geo = geometryPool.acquire("water");
		setOrReuseAttribute(
			geo,
			"position",
			waterPositions,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			waterNormals,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(geo, "uv", waterUvs, 2, THREE.Float32BufferAttribute);
		setOrReuseAttribute(
			geo,
			"color",
			waterColors,
			3,
			THREE.Float32BufferAttribute
		);
		const mesh = new THREE.Mesh(geo, waterMaterial);
		mesh.renderOrder = 1; // translúcido: dibujar después del terreno opaco
		mesh.userData.isTerrain = true;
		mesh.userData.poolCat = "water";
		group.add(mesh);
	}
	if (lavaPositions.length > 0) {
		const geo = geometryPool.acquire("water"); // misma categoría: geometría translúcida
		setOrReuseAttribute(
			geo,
			"position",
			lavaPositions,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			lavaNormals,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(geo, "uv", lavaUvs, 2, THREE.Float32BufferAttribute);
		setOrReuseAttribute(
			geo,
			"color",
			lavaColors,
			3,
			THREE.Float32BufferAttribute
		);
		const mesh = new THREE.Mesh(geo, lavaMaterial);
		mesh.renderOrder = 1; // tras el terreno opaco
		mesh.userData.isTerrain = true;
		mesh.userData.poolCat = "water";
		group.add(mesh);
	}
	if (torchPositions.length > 0) {
		const geo = geometryPool.acquire("torch");
		setOrReuseAttribute(
			geo,
			"position",
			torchPositions,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			torchNormals,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(geo, "uv", torchUvs, 2, THREE.Float32BufferAttribute);
		setOrReuseAttribute(
			geo,
			"color",
			torchColors,
			3,
			THREE.Float32BufferAttribute
		);
		const mesh = new THREE.Mesh(geo, torchMaterial);
		mesh.renderOrder = 2; // translúcida: tras el agua, para verse en las orillas
		mesh.userData.isTorch = true;
		mesh.userData.poolCat = "torch";
		group.add(mesh);
	}
	group.userData.boundingSphere = computeChunkSphere(group);
	return group;
}

// ============================================================
// FRUSTUM CULLING (Fase 6)
// Marca visible=false los chunks cuya esfera envolvente queda fuera del campo
// de visión: se evita el draw call (y el paso de la geometría al renderer).
// Se ejecuta cada frame desde el bucle de animación (public/player.js).
// Cubre los dos tiers (detalle completo + LOD). Devuelve cuántos chunks
// quedaron visibles (para el HUD y la auditoría).
// ============================================================
export function applyFrustumCulling(camera) {
	camera.updateMatrixWorld(); // asegura matrixWorldInverse actualizado
	projScreen.multiplyMatrices(
		camera.projectionMatrix,
		camera.matrixWorldInverse
	);
	frustum.setFromProjectionMatrix(projScreen);
	let visible = 0;
	for (const [, group] of chunkMeshes) {
		const s = group.userData.boundingSphere;
		const on = !s || frustum.intersectsSphere(s); // sin esfera (defensivo) → visible
		group.visible = on;
		if (on) visible++;
	}
	for (const [, group] of lodMeshes) {
		const s = group.userData.boundingSphere;
		const on = !s || frustum.intersectsSphere(s);
		group.visible = on;
		if (on) visible++;
	}
	window.__mcVisibleChunks = visible;
	return visible;
}

// Libera el mesh de un chunk (del tier que tenga: completo o LOD). La
// geometría vuelve al pool (se reutiliza en el siguiente chunk de su
// categoría); los materiales (atlas / colores) son compartidos y no se tocan.
function removeChunkMesh(key) {
	const old = chunkMeshes.get(key) || lodMeshes.get(key);
	if (old) {
		scene.remove(old);
		old.traverse((o) => {
			if (!o.geometry) return;
			const cat = o.userData?.poolCat;
			if (cat)
				geometryPool.release(cat, o.geometry); // reutilizable
			else o.geometry.dispose(); // defensivo: categoría desconocida → liberar
		});
		chunkMeshes.delete(key);
		lodMeshes.delete(key);
	}
}

// Distancia horizontal (bloques) del jugador al centro del chunk: decide el
// tier LOD. La Y no cuenta para que el tier no parpadee al subir/bajar
// colinas dentro del mismo chunk (el terreno puede elevarse 20 bloques).
function distToChunkCenter(key, px, pz) {
	const [cx, cz] = key.split(",").map(Number);
	const cxp = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
	const czp = cz * CHUNK_SIZE + CHUNK_SIZE / 2;
	return Math.hypot(px - cxp, pz - czp);
}

// Reconstruye el mesh de un chunk eligiendo el tier según la distancia actual
// del jugador (con histéresis respecto al tier que ya tenía). Se usa tanto al
// cargar como al editar bloques (rebuildAffectedChunks) y en updateLod.
export function rebuildChunk(key) {
	const [cx, cz] = key.split(",").map(Number);
	const current = lodMeshes.has(key) ? "lod" : "full";
	removeChunkMesh(key);
	const tier = lodTierFor(
		distToChunkCenter(key, camera.position.x, camera.position.z),
		current
	);
	const group =
		tier === "lod" ? buildLodGeometry(cx, cz) : buildChunkGeometry(cx, cz);
	if (group) {
		scene.add(group);
		if (tier === "lod") lodMeshes.set(key, group);
		else chunkMeshes.set(key, group);
	}
}

// ============================================================
// LOD: GEOMETRÍA SIMPLIFICADA DE CHUNKS LEJANOS (Fase 6)
// Un "caparazón" por columna: un quad superior en la altura de la superficie
// (color plano del bloque de superficie, sin teselas finas) + muros laterales
// donde el vecino es más bajo (para que las laderas se vean sólidas, no
// láminas flotantes). ~256 quads por chunk en vez de miles de caras.
// ============================================================
// Oscurece un color (para los muros: dan profundidad frente a las tapas).
function darken(hex, f) {
	const r = Math.min(255, Math.round(((hex >> 16) & 255) * f));
	const g = Math.min(255, Math.round(((hex >> 8) & 255) * f));
	const b = Math.min(255, Math.round((hex & 255) * f));
	return (r << 16) | (g << 8) | b;
}

function pushQuadVertex(pos, norm, col, x, y, z, nx, ny, nz, color) {
	pos.push(x, y, z);
	norm.push(nx, ny, nz);
	col.push(
		((color >> 16) & 255) / 255,
		((color >> 8) & 255) / 255,
		(color & 255) / 255
	);
}

// Empuja un quad (4 vértices → 2 triángulos) con su normal y color plano.
function pushQuad(
	pos,
	norm,
	col,
	ax,
	ay,
	az,
	bx,
	by,
	bz,
	cx2,
	cy,
	cz2,
	dx,
	dy,
	dz,
	nx,
	ny,
	nz,
	color
) {
	pushQuadVertex(pos, norm, col, ax, ay, az, nx, ny, nz, color);
	pushQuadVertex(pos, norm, col, bx, by, bz, nx, ny, nz, color);
	pushQuadVertex(pos, norm, col, cx2, cy, cz2, nx, ny, nz, color);
	pushQuadVertex(pos, norm, col, ax, ay, az, nx, ny, nz, color);
	pushQuadVertex(pos, norm, col, cx2, cy, cz2, nx, ny, nz, color);
	pushQuadVertex(pos, norm, col, dx, dy, dz, nx, ny, nz, color);
}

// Altura de la superficie (primer bloque no vacío desde arriba; el agua
// cuenta — la lámina de un lago se dibuja a su nivel) y su bloque. Devuelve
// -1 si la columna está vacía (no debería pasar en el mundo).
function columnSurface(chunk, x, z, wx, wz) {
	for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
		const b =
			x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE
				? chunk[cIdx(x, y, z)]
				: getClientBlock(wx, y, wz);
		if (b !== 0 && b !== -1) return { y, block: b };
	}
	return { y: -1, block: 0 };
}

function buildLodGeometry(cx, cz) {
	const chunk = chunkStore.get(`${cx},${cz}`);
	if (!chunk) return null;
	const baseX = cx * CHUNK_SIZE,
		baseZ = cz * CHUNK_SIZE;
	const pos = [],
		norm = [],
		col = [];

	// Rejilla de alturas de superficie (local -1..16 → 18x18): el interior se
	// lee del chunk y el anillo de borde se muestrea con getClientBlock para
	// que los muros de las columnas del borde tengan vecinos reales. Se calcula
	// UNA vez por chunk: los 4 vecinos de cada columna se leen de la rejilla en
	// vez de re-escanear la columna (≈4x menos trabajo que escanear por lado).
	const H = [];
	for (let x = -1; x <= CHUNK_SIZE; x++) {
		const row = [];
		for (let z = -1; z <= CHUNK_SIZE; z++) {
			row.push(columnSurface(chunk, x, z, baseX + x, baseZ + z).y);
		}
		H.push(row);
	}
	// H[x+1][z+1] es la altura de la columna local (x, z).
	const hAt = (x, z) => H[x + 1][z + 1];

	for (let x = 0; x < CHUNK_SIZE; x++) {
		for (let z = 0; z < CHUNK_SIZE; z++) {
			const wx = baseX + x,
				wz = baseZ + z;
			const h = hAt(x, z);
			if (h < 0) continue;
			const block = chunk[cIdx(x, h, z)];
			const topColor = BLOCK_COLORS[block] ?? 0x888888;
			const wallColor = darken(topColor, 0.75);
			const yTop = h + 1;
			const x0 = wx,
				x1 = wx + 1,
				z0 = wz,
				z1 = wz + 1;

			// Tapa superior (vista desde arriba/lejos es lo que domina).
			pushQuad(
				pos,
				norm,
				col,
				x0,
				yTop,
				z0,
				x1,
				yTop,
				z0,
				x1,
				yTop,
				z1,
				x0,
				yTop,
				z1,
				0,
				1,
				0,
				topColor
			);

			// Muros: en cada lado, si el vecino es más bajo, la pared baja hasta él.
			const nX = hAt(x + 1, z);
			const pX = hAt(x - 1, z);
			const nZ = hAt(x, z + 1);
			const pZ = hAt(x, z - 1);
			if (nX >= 0 && nX < h)
				pushQuad(
					pos,
					norm,
					col,
					x1,
					nX + 1,
					z0,
					x1,
					yTop,
					z0,
					x1,
					yTop,
					z1,
					x1,
					nX + 1,
					z1,
					1,
					0,
					0,
					wallColor
				);
			if (pX >= 0 && pX < h)
				pushQuad(
					pos,
					norm,
					col,
					x0,
					pX + 1,
					z1,
					x0,
					yTop,
					z1,
					x0,
					yTop,
					z0,
					x0,
					pX + 1,
					z0,
					-1,
					0,
					0,
					wallColor
				);
			if (nZ >= 0 && nZ < h)
				pushQuad(
					pos,
					norm,
					col,
					x0,
					nZ + 1,
					z1,
					x0,
					yTop,
					z1,
					x1,
					yTop,
					z1,
					x1,
					nZ + 1,
					z1,
					0,
					0,
					1,
					wallColor
				);
			if (pZ >= 0 && pZ < h)
				pushQuad(
					pos,
					norm,
					col,
					x1,
					pZ + 1,
					z0,
					x1,
					yTop,
					z0,
					x0,
					yTop,
					z0,
					x0,
					pZ + 1,
					z0,
					0,
					0,
					-1,
					wallColor
				);
		}
	}

	if (pos.length === 0) return null;
	const geo = geometryPool.acquire("lod");
	setOrReuseAttribute(geo, "position", pos, 3, THREE.Float32BufferAttribute);
	setOrReuseAttribute(geo, "normal", norm, 3, THREE.Float32BufferAttribute);
	setOrReuseAttribute(geo, "color", col, 3, THREE.Float32BufferAttribute);
	const mesh = new THREE.Mesh(geo, lodMaterial);
	mesh.userData.poolCat = "lod";
	const group = new THREE.Group();
	group.add(mesh);
	group.userData.boundingSphere = computeChunkSphere(group);
	return group;
}

// Recorre los chunks cargados y cambia de tier si la distancia del jugador
// cruzó el umbral LOD (histéresis en lod.js). Solo reconstruye los que
// cambian; se llama desde player.js con un throttle (~2-4 veces/s).
export function updateLod() {
	const px = camera.position.x,
		pz = camera.position.z;
	for (const key of [...chunkMeshes.keys(), ...lodMeshes.keys()]) {
		const current = lodMeshes.has(key) ? "lod" : "full";
		const next = lodTierFor(distToChunkCenter(key, px, pz), current);
		if (next !== current) rebuildChunk(key);
	}
}

export function rebuildAffectedChunks(wx, wz) {
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const localX = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const localZ = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	rebuildChunk(`${cx},${cz}`);
	if (localX === 0) rebuildChunk(`${cx - 1},${cz}`);
	if (localX === CHUNK_SIZE - 1) rebuildChunk(`${cx + 1},${cz}`);
	if (localZ === 0) rebuildChunk(`${cx},${cz - 1}`);
	if (localZ === CHUNK_SIZE - 1) rebuildChunk(`${cx},${cz + 1}`);
}

// ============================================================
// LUZ DE ANTORCHA (Fase 6)
// ============================================================
// Hornea la luz de antorcha de un chunk (lo llama buildChunkGeometry). Solo
// aloja el array si hay antorchas relevantes en la caja de radio alrededor:
// sin antorchas el chunk queda con null y chunkLightAt devuelve 0 (sin coste
// de memoria para el mundo normal).
function bakeChunkLight(cx, cz) {
	const key = `${cx},${cz}`;
	const chunk = chunkStore.get(key);
	if (!chunk) return;
	const x0 = cx * CHUNK_SIZE,
		z0 = cz * CHUNK_SIZE;
	const relevant = [];
	for (const t of torchSet.values()) {
		if (
			t[0] >= x0 - LIGHT_RADIUS &&
			t[0] <= x0 + CHUNK_SIZE - 1 + LIGHT_RADIUS &&
			t[2] >= z0 - LIGHT_RADIUS &&
			t[2] <= z0 + CHUNK_SIZE - 1 + LIGHT_RADIUS
		) {
			relevant.push(t);
		}
	}
	if (relevant.length === 0) {
		lightStore.set(key, null);
		return;
	}
	lightStore.set(
		key,
		computeChunkLight(
			cx,
			cz,
			CHUNK_SIZE,
			WORLD_HEIGHT,
			getClientBlock,
			relevant
		)
	);
}

// Luz de antorcha (0..1) de una celda de mundo; 0 si el chunk no está
// horneado aún (los vecinos se hornean al construirse; si llega un update de
// luz cruzando un borde, rebuildAround re-hornea el 3x3).
function chunkLightAt(wx, wy, wz) {
	if (wy < 0 || wy >= WORLD_HEIGHT) return 0;
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	const arr = lightStore.get(`${cx},${cz}`);
	if (!arr) return 0;
	const x = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	const z = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
	return arr[(wy * CHUNK_SIZE + z) * CHUNK_SIZE + x];
}

// Reconstruye el vecindario 3x3 de chunks alrededor de un bloque: lo usa la
// red cuando cambia una antorcha (el radio de luz cruza los bordes de chunk,
// así que los vecinos también re-hornean). A diferencia de
// rebuildAffectedChunks, incluye el centro (el llamador no lo reconstruye).
export function rebuildAround(wx, wz) {
	const cx = Math.floor(wx / CHUNK_SIZE),
		cz = Math.floor(wz / CHUNK_SIZE);
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			const key = `${cx + dx},${cz + dz}`;
			if (chunkStore.has(key)) rebuildChunk(key);
		}
	}
}

export function loadChunkData(chunkData) {
	for (const [key, arr] of Object.entries(chunkData)) {
		// Fase 7: no construir chunks fuera de la distancia de render elegida
		const [cx, cz] = key.split(",").map(Number);
		if (!withinRenderDistance(cx, cz)) continue;
		const data = Uint8Array.from(arr);
		chunkStore.set(key, data);
		// Registrar las antorchas del chunk (puede venir con un mundo guardado).
		for (let i = 0; i < data.length; i++) {
			if (data[i] === TORCH) {
				const lx = i % CHUNK_SIZE;
				const lz = Math.floor(i / CHUNK_SIZE) % CHUNK_SIZE;
				const ly = Math.floor(i / (CHUNK_SIZE * CHUNK_SIZE));
				const wx = cx * CHUNK_SIZE + lx,
					wz = cz * CHUNK_SIZE + lz;
				torchSet.set(`${wx},${ly},${wz}`, [wx, ly, wz]);
			}
		}
		rebuildChunk(key);
	}
}

// Hot-reload del atlas (Fase 6): re-importa textures.js con cache-busting
// (URL con timestamp → módulo nuevo), regenera el atlas y actualiza los
// materiales compartidos. La geometría se reconstruye porque los UVs dependen
// del layout del atlas (puede haber cambiado si se añadieron teselas).
export async function hotReloadTextures() {
	let mod;
	try {
		mod = await import(`./textures.js?t=${Date.now()}`);
	} catch (_e) {
		return null;
	}
	const newAtlas = mod.buildTerrainAtlas();
	// Liberar la textura anterior (el atlas se comparte entre los materiales;
	// dispose es idempotente si apuntan a la misma).
	if (terrainMaterial.map) terrainMaterial.map.dispose();
	if (waterMaterial.map) waterMaterial.map.dispose();
	if (lavaMaterial.map) lavaMaterial.map.dispose();
	terrainMaterial.map = newAtlas;
	terrainMaterial.needsUpdate = true;
	waterMaterial.map = newAtlas;
	waterMaterial.needsUpdate = true;
	lavaMaterial.map = newAtlas;
	lavaMaterial.needsUpdate = true;
	// Cambiar también las funciones de tesela/UV: la geometría reconstruida
	// usa el layout nuevo (los chunks ya construidos se reconstruyen debajo).
	// Solo los chunks de detalle completo usan el atlas: los LOD (color plano)
	// no dependen de él, pero igual se reconstruyen para refrescar el tier.
	tex = { tileForFace: mod.tileForFace, tileRect: mod.tileRect };
	for (const key of [...chunkMeshes.keys(), ...lodMeshes.keys()])
		rebuildChunk(key);
	return newAtlas;
}

export function unloadChunks(keys) {
	for (const key of keys || []) {
		removeChunkMesh(key); // libera el tier que tenga (completo o LOD)
		const [cx, cz] = key.split(",").map(Number);
		const x0 = cx * CHUNK_SIZE,
			z0 = cz * CHUNK_SIZE;
		// Quitar las antorchas del chunk descargado y su luz horneada.
		for (const [tKey, t] of torchSet) {
			if (
				t[0] >= x0 &&
				t[0] < x0 + CHUNK_SIZE &&
				t[2] >= z0 &&
				t[2] < z0 + CHUNK_SIZE
			)
				torchSet.delete(tKey);
		}
		lightStore.delete(key);
		chunkStore.delete(key);
	}
}

// ============================================================
// GRIETAS DE ROTURA (Fase 6, minería fina; Fase 7, multijugador)
// Cajas translúcidas sobre los bloques en mina cuyo oscurecimiento sigue las
// fases 0-9 que envía el servidor (block_break_progress). Desde la Fase 7 el
// servidor hace BROADCAST del progreso a todos los jugadores en rango, así
// que el crack es un overlay POR-BLOQUE (Map por "x,y,z"): varios jugadores
// pueden minar bloques distintos a la vez y cada uno ve las grietas de los
// demás. stage -1 (cancelar) o romperse el bloque (block_update) ocultan
// solo la grieta de ESE bloque.
// ============================================================
const cracks = new Map(); // "x,y,z" -> { mesh, material }
let crackGeometry = null; // caja compartida por todas las grietas (1.02: sobresale un pelo)
const crackMaterialBase = new THREE.MeshBasicMaterial({
	color: 0x111111,
	transparent: true,
	opacity: 0,
	depthWrite: false
});

const crackKey = (x, y, z) => `${x},${y},${z}`;

// Devuelve la grieta del bloque, creándola si no existe (cada grieta tiene
// su material clonado: la opacidad es por-bloque).
function getCrack(key, x, y, z) {
	let c = cracks.get(key);
	if (c) return c;
	if (!crackGeometry) crackGeometry = new THREE.BoxGeometry(1.02, 1.02, 1.02);
	const material = crackMaterialBase.clone();
	const mesh = new THREE.Mesh(crackGeometry, material);
	mesh.renderOrder = 3; // por encima del terreno y el agua
	mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
	scene.add(mesh);
	c = { mesh, material };
	cracks.set(key, c);
	return c;
}

function removeCrack(key) {
	const c = cracks.get(key);
	if (!c) return;
	scene.remove(c.mesh);
	c.material.dispose();
	cracks.delete(key);
}

// Muestra el overlay sobre el bloque objetivo (sin progreso todavía): el
// primer stage 0 del servidor (siguiente tick) ya lo oscurece.
export function showCrack(x, y, z) {
	getCrack(crackKey(x, y, z), x, y, z).material.opacity = 0;
}

// stage 0-9: oscurecimiento progresivo (pseudogrietas) SOLO del bloque en
// cuestión. stage <0 (cancelada): oculta la grieta de ese bloque — un -1
// tardío de un retarget no borra las grietas de otros bloques.
export function setCrackStage(stage, x, y, z) {
	if (stage < 0 || stage >= 10) {
		removeCrack(crackKey(x, y, z));
		return;
	}
	getCrack(crackKey(x, y, z), x, y, z).material.opacity =
		0.08 + (stage / 9) * 0.45;
}

// Oculta todas las grietas (soltar el clic: el servidor manda el -1, pero
// el feedback local es inmediato).
export function hideCrack() {
	for (const key of [...cracks.keys()]) removeCrack(key);
}

// Oculta la grieta del bloque que cambió (el servidor acaba de romperlo y
// llega el block_update). Por-bloque: otros cracks siguen visibles.
export function hideCrackIfAt(x, y, z) {
	removeCrack(crackKey(x, y, z));
}
