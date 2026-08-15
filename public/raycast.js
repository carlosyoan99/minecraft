// ============================================================
// RAYCAST (Fase 18, D-8): RAYCAST DEL JUEGO + TELEMETRÍA DE MINERÍA.
// El rayo cámara→mundo (bloques y mobs), el resaltado del bloque apuntado,
// la tolerancia de apuntado a mobs y el diagnóstico "el clic no hace nada"
// (window.__mcMiningTrace/__mcRaycastStats/__mcDebugMining). Extraído de
// game-input.js: aquí vive QUÉ ve el puntero; game-input.js decide QUÉ hace
// el clic con ese resultado (minar/atacar/colocar/abrir).
// ============================================================
import * as THREE from "three";
import { EYE_HEIGHT } from "./constants.js";
import { mobMeshes } from "./mobs.js";
import { camera, controls, scene } from "./scene.js";
import {
	chunkMeshes,
	getClientBlock,
	hideHighlight,
	lodMeshes,
	setHighlightedBlock
} from "./world.js";

export const raycaster = new THREE.Raycaster();
raycaster.far = 7;

// ============================================================
// RESALTADO DEL BLOQUE APUNTADO (Fase 11, Bloque A1)
// Contorno negro sobre el bloque objetivo, actualizado con cada movimiento
// del ratón (la mira solo cambia con el ratón; al caminar sin moverlo el
// objetivo no cambia y el siguiente movimiento lo refresca). Los mobs NO se
// resaltan (como en Minecraft). Misma derivación x/y/z que el clic: el
// bloque detrás de la cara golpeada → el resaltado coincide SIEMPRE con lo
// que el clic va a minar/colocar.
// ============================================================
export function updateHighlight(hit) {
	if (!controls.isLocked || !hit || mobRootData(hit)) {
		hideHighlight();
		return;
	}
	const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
	setHighlightedBlock(
		Math.floor(point.x),
		Math.floor(point.y),
		Math.floor(point.z)
	);
}

// Fase 8 (B9): los mobs son GRUPOS de partes (MOB_PARTS) — el rayo intersecta
// los HIJOS (las cajas) con recursión y luego se sube por el árbol hasta el
// grupo raíz que tiene userData.mobId/mobType. El terreno son meshes simples
// (hijos de chunkMeshes); intersectar con recursive=true también los cubre.
export function raycastTerrainAndMobs() {
	// Fase 9 (Bloque A): refrescar matrixWorld ANTES de intersectar. El render
	// loop lo hace cada frame, pero un mob/chunk recién creado o movido puede
	// tener matrixWorld obsoleto en el instante del mousedown (entre frames):
	// el rayo intersectaría el objeto en su posición ANTERIOR o en el origen
	// si nunca se renderizó → el clic golpearía el aire o el mob equivocado
	// y "no haría nada" pese a apuntar a un bloque visible.
	scene.updateMatrixWorld();
	raycaster.setFromCamera({ x: 0, y: 0 }, camera);
	const terrainMeshes = [];
	// Detalle completo + LOD: sin los LOD, el terreno lejano (visible) no es
	// clicable — el rayo lo atraviesa y el clic "no hace nada" en esas zonas
	// (p. ej. un chunk que se quedara en tier LOD por un fallo de transición).
	for (const group of [...chunkMeshes.values(), ...lodMeshes.values()])
		group.children.forEach((m) => {
			terrainMeshes.push(m);
		});
	const mobList = Array.from(mobMeshes.values());
	const all = [...terrainMeshes, ...mobList];
	raycastStats.candidates = all.length;
	const hits = raycaster.intersectObjects(
		all,
		true // Fase 8 (B9): recursivo para llegar a las partes de los mobs
	);
	raycastStats.hits = hits.length;
	raycastStats.mobHits = hits.filter((h) => mobRootData(h)).length;
	raycastStats.terrainHits = hits.length - raycastStats.mobHits;
	if (hits.length === 0) raycastStats.emptyHits++;
	return hits[0] || null;
}

// ============================================================
// FASE 9 (Bloque A): TELEMETRÍA DE MINERÍA PARA DIAGNÓSTICO
// Expuesta en window para diagnosticar "el clic no hace nada" desde la
// consola: cada mousedown deja un registro en __mcMiningTrace y el raycast
// acumula __mcRaycastStats. __mcDebugMining() fuerza un raycast AHORA y
// muestra el detalle (sin esperar a un clic).
// ============================================================
export const miningTrace = [];
const raycastStats = {
	candidates: 0,
	hits: 0,
	terrainHits: 0,
	mobHits: 0,
	emptyHits: 0
};
window.__mcMiningTrace = miningTrace;
window.__mcRaycastStats = raycastStats;
// Fase 11 (Bloque A): contexto ampliado del raycast para confirmar la causa
// del clic roto. Además del raycast forzado, reporta: posición y dirección de
// la cámara, meshes REALES en la escena (vs los mapas), estado del pointer
// lock, qué elemento DOM recibe el clic en el centro (H2: overlay invisible)
// y el estado del menú #blocker.
function countMeshesInScene(obj) {
	let n = 0;
	if (!obj) return 0;
	obj.traverse((o) => {
		if (o.isMesh) n++;
	});
	return n;
}
// El bloque bajo el punto de mira: si el raycast falla (0 hits), se lee la
// columna central de la cámara hasta `far` para saber si hay terreno delante
// (distinguir «raycast roto» de «no hay bloques a ≤7»).
function blockAlongView() {
	const dir = camera.getWorldDirection(new THREE.Vector3());
	const origin = camera.position;
	for (let d = 1; d <= raycaster.far; d += 0.25) {
		const x = Math.floor(origin.x + dir.x * d);
		const y = Math.floor(origin.y + dir.y * d);
		const z = Math.floor(origin.z + dir.z * d);
		const b = getClientBlock(x, y, z);
		if (b !== 0 && b !== -1) return { d: +d.toFixed(2), x, y, z, block: b };
	}
	return null;
}
// Sondeo del terreno alrededor del jugador (Fase 11, Bloque A): bloque bajo
// los pies y barrido horizontal de 8 direcciones a la altura de los pies +0.5
// hasta `far`. Distingue «raycast roto» de «spawn en lago sin bloques a ≤7».
function terrainAround() {
	const feet = camera.position.y - EYE_HEIGHT;
	const under = getClientBlock(
		Math.floor(camera.position.x),
		Math.floor(feet - 0.1),
		Math.floor(camera.position.z)
	);
	const dirs = {};
	for (const [name, dx, dz] of [
		["-Z", 0, -1],
		["+Z", 0, 1],
		["-X", -1, 0],
		["+X", 1, 0],
		["-X-Z", -0.7, -0.7],
		["+X-Z", 0.7, -0.7],
		["-X+Z", -0.7, 0.7],
		["+X+Z", 0.7, 0.7]
	]) {
		dirs[name] = null;
		for (let d = 1; d <= raycaster.far; d += 0.25) {
			const b = getClientBlock(
				Math.floor(camera.position.x + dx * d),
				Math.floor(feet + 0.5),
				Math.floor(camera.position.z + dz * d)
			);
			if (b !== 0 && b !== -1) {
				dirs[name] = { d: +d.toFixed(2), block: b };
				break;
			}
		}
	}
	return { feet: +feet.toFixed(2), underFeet: under, dirs };
}
window.__mcDebugMining = () => {
	const hit = raycastTerrainAndMobs();
	const root = mobRootData(hit);
	const dir = camera.getWorldDirection(new THREE.Vector3());
	const cx = Math.floor(window.innerWidth / 2);
	const cy = Math.floor(window.innerHeight / 2);
	const atCenter = document.elementFromPoint(cx, cy);
	const detail = {
		locked: controls.isLocked,
		pointerLocked: document.pointerLockElement !== null,
		stats: { ...raycastStats },
		camera: {
			x: +camera.position.x.toFixed(2),
			y: +camera.position.y.toFixed(2),
			z: +camera.position.z.toFixed(2),
			dir: [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)]
		},
		sceneMeshes: countMeshesInScene(scene),
		mapMeshes: chunkMeshes.size + lodMeshes.size + mobMeshes.size,
		elementAtCenter: atCenter
			? `${atCenter.tagName.toLowerCase()}#${atCenter.id}`
			: null,
		blockerDisplay: (() => {
			const b = document.getElementById("blocker");
			return b ? getComputedStyle(b).display : "sin blocker";
		})(),
		blockAlongView: blockAlongView(),
		terrainAround: terrainAround(),
		firstHit: hit
			? {
					dist: +hit.distance.toFixed(2),
					isMob: !!root?.mobId,
					type: root?.mobType || null,
					blockAtPoint: getClientBlock(
						Math.floor(hit.point.x),
						Math.floor(hit.point.y),
						Math.floor(hit.point.z)
					)
				}
			: null
	};
	// biome-ignore lint/suspicious/noConsole: helper de diagnóstico (consola)
	console.log("[mine]", detail);
	return detail;
};

// Sube desde el mesh golpeado (puede ser una parte del grupo) hasta el grupo
// raíz del mob y devuelve su userData, o null si no era un mob. Sin esto, con
// el mob multibloque el clic golpearía la caja de una parte que no lleva
// mobId → regresión directa de B10.
export function mobRootData(hit) {
	if (!hit) return null;
	let o = hit.object;
	while (o) {
		if (o.userData?.mobId) return o.userData;
		o = o.parent;
	}
	return null;
}

// Fase 8 (B10): mob más cercano a lo LARGO del rayo (proyección) que quede
// DELANTE del bloque apuntado (t < distTerreno) y con poca desviación lateral
// (<= 0.75 bloques). Así el clic golpea al mob solo cuando tapa al bloque —
// nunca al lado/detrás, lo que preserva la minería y evita golpear a través
// de paredes. Antes se buscaba por distancia euclidiana al punto de impacto
// (1.5 bloques): un mob junto al bloque que minabas te robaba el clic.
export function nearestMobOnRay(ray, distTerreno) {
	const origin = ray.origin;
	const dir = ray.direction;
	let best = null,
		bestT = Infinity;
	for (const mesh of mobMeshes.values()) {
		const m = mesh.position;
		const t =
			(m.x - origin.x) * dir.x +
			(m.y - origin.y) * dir.y +
			(m.z - origin.z) * dir.z;
		if (t < 0 || t > distTerreno || t > raycaster.far) continue;
		const px = origin.x + dir.x * t;
		const py = origin.y + dir.y * t;
		const pz = origin.z + dir.z * t;
		const lateral = Math.hypot(m.x - px, m.y - py, m.z - pz);
		if (lateral <= 0.75 && t < bestT) {
			bestT = t;
			best = mesh.userData;
		}
	}
	return best?.mobId ? { id: best.mobId, type: best.mobType } : null;
}
