// ============================================================
// LODMESH (Fase 18, D-7): GEOMETRÍA SIMPLIFICADA DE CHUNKS LEJANOS (Fase 6).
// Un "caparazón" por columna: un quad superior en la altura de la superficie
// (color plano del bloque de superficie, sin teselas finas) + muros laterales
// donde el vecino es más bajo (para que las laderas se vean sólidas, no
// láminas flotantes). ~256 quads por chunk en vez de miles de caras.
// Extraído de world.js: buildLodGeometry usa el pool y el material de color
// plano de meshbuild.js (misma geometría, mismo render). world.js decide el
// tier (lodTierFor) y llama a esta función.
// ============================================================
import * as THREE from "three";
import { cIdx, getChunkData, getClientBlock } from "./chunkstore.js";
import {
	BLOCK_COLORS,
	CHUNK_SIZE,
	NON_SOLID_PLANTS,
	WORLD_HEIGHT,
	WORLD_MIN_Y
} from "./constants.js";
import { setOrReuseAttribute } from "./geopool.js";
import { worldMaterial } from "./materialstyle.js"; // Fase 19.6 (B): el LOD sigue el estilo global
import { computeChunkSphere, geometryPool, lodMaterial } from "./meshbuild.js";

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
	// Fase 15 (D5): el índice local ly (0..127) se convierte a Y de MUNDO
	// (ly + WORLD_MIN_Y) para el return y para muestrear vecinos.
	for (let ly = WORLD_HEIGHT - 1; ly >= 0; ly--) {
		const wy = ly + WORLD_MIN_Y;
		const b =
			x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE
				? chunk[cIdx(x, ly, z)]
				: getClientBlock(wx, wy, wz);
		// Fase 9 (F): las plantas (hierba/flores/trigo) no cuentan como
		// superficie — el LOD dibuja la lámina sobre el terreno real, no sobre
		// el bulto de la planta (evita láminas flotantes de 1 bloque).
		if (b !== 0 && b !== -1 && !NON_SOLID_PLANTS.has(b))
			return { y: wy, block: b };
	}
	return { y: -1, block: 0 };
}

export function buildLodGeometry(cx, cz) {
	const chunk = getChunkData(`${cx},${cz}`);
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
			const block = chunk[cIdx(x, h - WORLD_MIN_Y, z)]; // mundo → local
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
	const mesh = new THREE.Mesh(geo, worldMaterial(undefined, lodMaterial));
	mesh.userData.poolCat = "lod";
	const group = new THREE.Group();
	group.add(mesh);
	group.userData.boundingSphere = computeChunkSphere(group);
	return group;
}
