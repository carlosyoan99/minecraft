// ============================================================
// ALMACÉN DE MUNDO EN CLIENTE (Fase 18, D-7): CICLO DE VIDA DE MALLAS.
// Los datos de chunks (Uint8Array, acceso por bloque, antorchas) viven en
// chunkstore.js; la luz de antorcha horneada en lightclient.js; la
// construcción de geometría (materiales, pool, worker, LOD) en meshbuild.js
// y lodmesh.js. Este módulo orquesta las mallas (mapas chunkMeshes/lodMeshes,
// tier LOD, frustum, carga/descarga, grietas y resaltado) y conserva la
// fachada pública que usaban world.js (network.js, player.js, settings.js,
// debug.js e input.js no cambian).
// ============================================================
import * as THREE from "three";
// Fase 18 (D-7): datos y luz extraídos a módulos por responsabilidad.
import {
	chunkKeys,
	hasChunkData,
	removeChunkData,
	storeChunkData
} from "./chunkstore.js";
import { CHUNK_SIZE } from "./constants.js";
import { clearChunkLight } from "./lightclient.js";
import { lodTierFor } from "./lod.js";
import { buildLodGeometry } from "./lodmesh.js";
import {
	buildChunkGeometry,
	enqueueWorkerBatch,
	geometryPool,
	groupFromBuffers,
	lavaMaterial,
	setTexFns,
	setWorkerFallback,
	setWorkerMessageHandler,
	terrainMaterial,
	tryGetWorker,
	waterMaterial,
	workerPending
} from "./meshbuild.js";
import { camera, scene } from "./scene.js";

export const chunkMeshes = new Map(); // "cx,cz" -> THREE.Group (detalle completo)
export const lodMeshes = new Map(); // "cx,cz" -> THREE.Group (LOD: heightmap simplificado)

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
	for (const key of chunkKeys()) {
		const [cx, cz] = key.split(",").map(Number);
		if (!withinRenderDistance(cx, cz)) toRemove.push(key);
	}
	if (toRemove.length) unloadChunks(toRemove);
}

// ============================================================
// FRUSTUM CULLING (Fase 6)
// Marca visible=false los chunks cuya esfera envolvente queda fuera del campo
// de visión: se evita el draw call (y el paso de la geometría al renderer).
// Se ejecuta cada frame desde el bucle de animación (public/player.js).
// Cubre los dos tiers (detalle completo + LOD). Devuelve cuántos chunks
// quedaron visibles (para el HUD y la auditoría).
// ============================================================
// Objetos reutilizados por frame (sin allocs).
const frustum = new THREE.Frustum();
const projScreen = new THREE.Matrix4();
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

// ============================================================
// GESTOR DEL WORKER (Fase 13, A2) — mitad cliente: el transporte y la cola
// viven en meshbuild.js; aquí se procesan las RESPUESTAS (los buffers se
// aplican a chunkMeshes) y el watchdog de mallas (F17 B3). Se registran los
// handlers al cargar (los inyecta meshbuild para evitar el ciclo de imports).
// ============================================================
function onWorkerMessage(msg) {
	if (msg?.type !== "chunk_built") return;
	const { id, key, buffers } = msg;
	if (workerPending.get(key) !== id) return; // obsoleto (rebuild/descarga posterior)
	workerPending.delete(key);
	if (!hasChunkData(key)) return; // descargado durante el vuelo
	// Auditoría 2026-08-09 (§2.2): swap limpio. Si el chunk ya tiene un mesh
	// (borde completado, rebuild de vecino, cambio de tier), el viejo quedaba
	// huérfano en la escena: dos geometrías idénticas superpuestas (z-fighting)
	// y una fuga que unloadChunks no recuperaba (la entrada del Map ya apuntaba
	// al grupo nuevo). Igual que rebuildChunk, liberar antes de añadir el nuevo:
	// removeChunkMesh devuelve la geometría anterior al pool.
	removeChunkMesh(key);
	// Fase 17 (B3): un error puntual al aplicar los buffers (p. ej. un
	// atributo malformado del worker) no debe dejar el chunk INVISIBLE en
	// silencio: se registra y se reconstruye de forma síncrona como fallback
	// (la función pura es la misma; si el dato es válido, el rebuild funciona).
	try {
		const group = groupFromBuffers(buffers);
		if (group) {
			scene.add(group);
			chunkMeshes.set(key, group);
		}
	} catch (err) {
		// biome-ignore lint/suspicious/noConsole: error real de geometría (diagnóstico B3)
		console.warn(
			"[chunk] worker con buffers inválidos, rebuild síncrono:",
			key,
			err
		);
		try {
			rebuildChunk(key);
		} catch {
			/* sin malla: el watchdog de tickChunkWatchdog lo reintentará */
		}
	}
}

// Fase 17 (B3): WATCHDOG DE MALLAS — si un chunk tiene datos (física) pero
// no mesh (render), se reconstruye. Un job de worker perdido, un error
// puntual de geometría o una carrera de descarga dejaban el chunk invisible
// hasta recargar ("chunks que nunca cargan: física sí, render no"). Al ser
// por estado (no por causa), auto-cura cualquier chunk huérfano en ~0.5s y
// cubre el caso de que el huérfano cambie entre sesiones. Se llama desde el
// bucle de animación (player.js) con throttle.
let meshWatchdogT = 0;
export function tickChunkWatchdog(dt) {
	meshWatchdogT += dt;
	if (meshWatchdogT < 0.5) return;
	meshWatchdogT = 0;
	for (const key of chunkKeys()) {
		if (chunkMeshes.has(key) || lodMeshes.has(key)) continue;
		if (workerPending.has(key)) continue; // en vuelo: el worker lo añadirá
		rebuildChunk(key);
	}
}

// Fallback del worker (B3): los pendientes con datos y sin mesh se
// reconstruyen de forma síncrona (misma función pura → mismo resultado).
setWorkerMessageHandler(onWorkerMessage);
setWorkerFallback(() => {
	for (const key of [...workerPending.keys()]) {
		if (hasChunkData(key) && !lodMeshes.has(key) && !chunkMeshes.has(key))
			rebuildChunk(key);
	}
	workerPending.clear();
});

// ============================================================
// LIBERA EL MESH DE UN CHUNK (del tier que tenga: completo o LOD). La
// geometría vuelve al pool (se reutiliza en el siguiente chunk de su
// categoría); los materiales (atlas / colores) son compartidos y no se tocan.
// ============================================================
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
	workerPending.delete(key); // un rebuild síncrono invalida cualquier job de worker en vuelo
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
// TIER LOD (Fase 6) Y REBUILD DE VECINOS
// ============================================================
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
			if (hasChunkData(key)) rebuildChunk(key);
		}
	}
}

// ============================================================
// CARGA / DESCARGA DE CHUNKS (desde network.js)
// ============================================================
export function loadChunkData(chunkData) {
	// Fase 14 (M3): vecinos ya presentes ANTES de este lote. Al llegar un
	// chunk nuevo que completa el borde de un vecino anterior, ese vecino ya
	// horneó sus caras mirando al vacío → necesita rebuild. Las reconstrucciones
	// en cascada durante un init masivo (todos nuevos) se evitan: solo se
	// reconstruyen los que YA estaban en chunkStore al empezar el lote.
	const existingNeighbors = new Set(chunkKeys());
	const batch = []; // claves a construir (nuevas + vecinos previos afectados)
	for (const [key, arr] of Object.entries(chunkData)) {
		// Fase 7: no construir chunks fuera de la distancia de render elegida
		const [cx, cz] = key.split(",").map(Number);
		if (!withinRenderDistance(cx, cz)) continue;
		storeChunkData(key, arr); // guarda Uint8Array + registra antorchas
		batch.push(key);
		// Fase 14 (M3): reconstruir el vecino previo para que reaparezcan las
		// caras del borde que miraba al hueco (mismo orden Chebyshev con el que
		// el cliente carga/filtra; las diagonales no comparten cara).
		for (const [dx, dz] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1]
		]) {
			const nk = `${cx + dx},${cz + dz}`;
			if (existingNeighbors.has(nk)) batch.push(nk);
		}
	}
	if (batch.length === 0) return;
	// Fase 13 (A2): el lote se construye en el Web Worker (el hilo principal
	// no se bloquea al cargar el mundo); los chunks de tier LOD (lejanos) y
	// los entornos sin worker usan el camino síncrono — misma función pura,
	// mismo resultado.
	const unique = [...new Set(batch)];
	const px = camera.position.x,
		pz = camera.position.z;
	const workerKeys = [];
	for (const key of unique) {
		if (workerPending.has(key)) continue; // ya en vuelo
		const current = lodMeshes.has(key) ? "lod" : "full";
		const tier = lodTierFor(distToChunkCenter(key, px, pz), current);
		if (tier === "lod") rebuildChunk(key);
		else workerKeys.push(key);
	}
	if (workerKeys.length > 0 && tryGetWorker()) enqueueWorkerBatch(workerKeys);
	else for (const key of workerKeys) rebuildChunk(key);
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
	// Nota F13 (A1): tileForFace/tileRect se re-exportan desde texturemap.js
	// (instancia compartida, sin cache-busting), así que el hot-reload
	// refresca los PÍXELES del atlas (TILES) pero no la lógica de mapeo
	// tesela/cara — el layout del atlas casi nunca cambia, es aceptable.
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
	setTexFns({ tileForFace: mod.tileForFace, tileRect: mod.tileRect });
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
		// Auditoría 2026-08-09 (§3.6): limpiar las grietas de mina del chunk.
		// Antes quedaban flotando en la escena si se reducía la distancia
		// de render / se cambiaba de mundo (el crack es un overlay por bloque
		// en coordenadas de mundo; sin esto no se ocultaba hasta un block_update
		// o block_break_progress de ese bloque).
		for (const [k, crack] of [...cracks]) {
			const [bx, , bz] = k.split(",").map(Number);
			if (
				bx >= x0 &&
				bx < x0 + CHUNK_SIZE &&
				bz >= z0 &&
				bz < z0 + CHUNK_SIZE
			) {
				scene.remove(crack.mesh);
				crack.material.dispose(); // material clonado exclusivo del crack
				cracks.delete(k);
			}
		}
		clearChunkLight(key);
		removeChunkData(key); // antorchas del chunk + Uint8Array
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

// ============================================================
// RESALTADO DEL BLOQUE APUNTADO (Fase 11, Bloque A1)
// Contorno negro estilo Minecraft (EdgesGeometry + LineSegments) sobre el
// bloque que el jugador apunta: feedback visual del objetivo de minar/
// colocar/abrir. El diagnóstico de la Fase 11 mostró que con la cámara a la
// altura de los ojos y el rayo casi horizontal, apuntar al suelo daba 0
// golpes sin ninguna señal en pantalla — el contorno hace visible QUÉ
// bloque está bajo el punto de mira (y su ausencia revela que no hay
// objetivo, p. ej. mirando al cielo). Un único LineSegments reutilizado
// que se reposiciona/oculta según el bloque objetivo.
// ============================================================
let highlight = null; // THREE.LineSegments reutilizado
// Aristas del cubo unidad (1.01: sobresale un pelo para no z-fighting con
// la cara del bloque). Se crea UNA vez; el contorno comparte esta geometría.
const highlightEdges = new THREE.EdgesGeometry(
	new THREE.BoxGeometry(1.01, 1.01, 1.01)
);
const highlightMaterial = new THREE.LineBasicMaterial({
	color: 0x111111,
	transparent: true,
	opacity: 0.9,
	depthTest: true
});

// Muestra el contorno sobre el bloque (x, y, z); con x === null lo oculta.
// La posición se fija al CENTRO del bloque (como el crack). El contorno es
// por-JUGADOR (solo este cliente): no se sincroniza por red.
export function setHighlightedBlock(x, y, z) {
	if (!highlight) {
		highlight = new THREE.LineSegments(highlightEdges, highlightMaterial);
		highlight.renderOrder = 5; // por encima de grietas (3) y agua
		scene.add(highlight);
	}
	if (x === null || y === null || z === null) {
		highlight.visible = false;
		return;
	}
	highlight.position.set(x + 0.5, y + 0.5, z + 0.5);
	highlight.visible = true;
}

// Oculta el contorno (sin objetivo, menú abierto, puntero liberado...).
export function hideHighlight() {
	if (highlight) highlight.visible = false;
}

// ============================================================
// FACHADA (Fase 18, D-7): los consumidores (network.js, player.js,
// settings.js, debug.js, input.js) importan getClientBlock/setClientBlock/
// hasTorchNear/geoPoolStats/updateLiquidAnimation desde "./world.js" — se
// re-exportan sin cambiar la firma.
// ============================================================
export { getClientBlock, setClientBlock } from "./chunkstore.js";
export { hasTorchNear } from "./lightclient.js";
export { geoPoolStats, updateLiquidAnimation } from "./meshbuild.js";
