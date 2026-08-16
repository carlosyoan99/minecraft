// ============================================================
// MESHBUILD (Fase 18, D-7): CONSTRUCCIÓN DE MALLAS DE CHUNK.
// Materiales compartidos, pool de geometrías, generación de buffers
// (síncrona y worker) y transporte del Web Worker de chunks
// (public/chunkWorker.js). Extraído de world.js: aquí vive el CÓMO se
// construye la geometría; world.js conserva el ciclo de vida de las mallas
// (mapas chunkMeshes/lodMeshes, LOD, frustum, carga/descarga) e importa
// estas funciones. La fachada pública (world.loadChunkData/rebuildChunk/...)
// no cambia para network.js, player.js, settings.js, debug.js e input.js.
// ============================================================
import * as THREE from "three";
import { buildChunkGeometryData } from "./chunkGeometry.js";
import { getChunkData } from "./chunkstore.js";
import { createGeometryPool, setOrReuseAttribute } from "./geopool.js";
import { bakeChunkLight, getChunkLight } from "./lightclient.js";
import { worldMaterial } from "./materialstyle.js";
import {
	buildTerrainAtlas,
	buildWaterTexture,
	tileForFace,
	tileRect
} from "./textures.js";

// ============================================================
// MATERIALES COMPARTIDOS (Fase 6)
// ============================================================
// Material compartido por todos los chunks: un único atlas de texturas.
// Se crea una sola vez; NUNCA se hace dispose de él al reconstruir/descargar
// chunks (solo se libera la geometría).
const atlasTexture = buildTerrainAtlas();
// vertexColors: true en todos los materiales texturizados: el color por
// vértice (luz de antorcha horneada) MULTIPLICA el atlas y la luz global.
// Fase 19.6 (B): los materiales del mundo se crean con worldMaterial() —
// devuelve la instancia base (MeshLambertMaterial, look por defecto) o su
// gemelo toon (MeshToonMaterial) según el toggle materialstyle.js. El pool
// de geometrías NO se toca: solo se intercambia el material (espec B).
const terrainMaterial = worldMaterial({
	map: atlasTexture,
	vertexColors: true
});
// El agua es translúcida: material aparte (misma tesela del atlas), para que
// se vea el lecho del lago a través de la superficie sin volver opacas las
// caras sólidas adyacentes.
// Fase 10 (E2): el agua tiene su propia textura desplazable (buildWaterTexture).
// Fase 19.6 (C1): AHORA es un ShaderMaterial con uniform de TIEMPO (patrón
// probado de public/sky.js) — el fragment desplaza la textura con uTime
// (corriente, vaivén sutil) y atenúa con la luz del día (uDay). Se mantiene
// la transparencia y el culling (un lado terso, DoubleSide al nadar). La
// anisotropía/espéculo del Phong se retira: "sin reflejos complejos" (espec).
const waterTexture = buildWaterTexture();
const waterUniforms = {
	uMap: { value: waterTexture },
	uTime: { value: 0 },
	uDay: { value: 1 },
	uOpacity: { value: 0.65 }
};
const waterMaterial = new THREE.ShaderMaterial({
	uniforms: waterUniforms,
	// B1 (bug sesión 2026-08-16): vertexColors: true imprescindible — el
	// vertex shader usa `vCol = color;` y three.js solo inyecta
	// `attribute vec3 color;` en el prefijo cuando esta propiedad está activa;
	// sin ella el shader no compila ("'color' : undeclared identifier") y el
	// agua no se dibuja.
	vertexColors: true,
	vertexShader: `
		varying vec2 vUv;
		varying vec3 vCol;
		void main() {
			vUv = uv;
			vCol = color;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: `
		uniform sampler2D uMap;
		uniform float uTime;
		uniform float uDay;
		uniform float uOpacity;
		varying vec2 vUv;
		varying vec3 vCol;
		void main() {
			// Corriente: desplazamiento de la UV por tiempo (dos ondas en X e Y
			// con frecuencias distintas → vaivén orgánico, sin scroll rígido).
			vec2 uv = vUv;
			uv.x += uTime * 0.02 + sin(uTime * 0.45 + vUv.y * 3.0) * 0.012;
			uv.y += uTime * 0.008 + cos(uTime * 0.35 + vUv.x * 3.0) * 0.008;
			vec4 tex = texture2D(uMap, fract(uv));
			// Iluminación aproximada: el vCol horneado (luz de antorcha) se
			// multiplica por el factor de día (0.5 de noche → 1.15 de día).
			float light = 0.5 + uDay * 0.65;
			gl_FragColor = vec4(tex.rgb * vCol * light, uOpacity);
		}
	`,
	transparent: true,
	side: THREE.DoubleSide // al nadar bajo la superficie, la cara superior se ve desde abajo
});
// Lava (Fase 7): como el agua, pero opaca (no se ve el lecho a través) y
// DoubleSide por si el jugador cae dentro del charco. Emissive suave para
// que brille de noche (es un líquido incandescente).
const lavaMaterial = worldMaterial({
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
const torchMaterial = worldMaterial({
	map: atlasTexture,
	transparent: true,
	side: THREE.DoubleSide,
	depthWrite: false,
	vertexColors: true
});
// Fase 19.6 (C2): MATERIAL DE VIENTO para las plantas (hierba/flores/trigo).
// ShaderMaterial con UNIFORM de tiempo (patrón sky.js): el vertex desplaza
// el vértice en x/z con una onda según uTime y el atributo `wind` que
// chunkGeometry.js emite por vértice ([fase de celda, altura 0..1]); las
// antorchas quedan quietas (buffer aparte). Fragment: atlas + luz de día.
const windUniforms = {
	uMap: { value: atlasTexture },
	uTime: { value: 0 },
	uDay: { value: 1 },
	uAmp: { value: 0.035 } // amplitud del vaivén en bloques
};
const plantMaterial = new THREE.ShaderMaterial({
	uniforms: windUniforms,
	// B1 (bug sesión 2026-08-16): vertexColors: true imprescindible — el
	// vertex shader usa `vCol = color;` y three.js solo inyecta
	// `attribute vec3 color;` en el prefijo cuando esta propiedad está activa;
	// sin ella el shader no compila ("'color' : undeclared identifier") y las
	// plantas (hierba/flores/trigo) no se dibujan.
	vertexColors: true,
	vertexShader: `
		attribute vec2 wind; // [fase de celda 0..1, altura 0 abajo/1 arriba]
		uniform float uTime;
		uniform float uAmp;
		varying vec2 vUv;
		varying vec3 vCol;
		void main() {
			vUv = uv;
			vCol = color;
			// Vaivén de viento: seno doble con fase por celda (no bailan todas
			// a la vez) y amplitud que crece con la altura del vértice (la
			// punta se mueve más que la base). Solo x/z (sin y): no se "alarga"
			// la planta, solo se mece.
			float ph = wind.x * 6.2831853;
			float h = wind.y;
			vec3 p = position;
			p.x += sin(uTime * 1.5 + ph) * uAmp * h + cos(uTime * 0.8 + ph) * uAmp * h * 0.5;
			p.z += cos(uTime * 1.2 + ph) * uAmp * h * 0.7;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
		}
	`,
	fragmentShader: `
		uniform sampler2D uMap;
		uniform float uDay;
		varying vec2 vUv;
		varying vec3 vCol;
		void main() {
			vec4 tex = texture2D(uMap, vUv);
			if (tex.a < 0.25) discard; // fondo transparente del atlas
			float light = 0.5 + uDay * 0.65;
			gl_FragColor = vec4(tex.rgb * vCol * light, 1.0);
		}
	`,
	transparent: true,
	side: THREE.DoubleSide,
	depthWrite: false
});
// LOD de chunks lejanos (Fase 6): material de COLOR PLANO por vértice (sin
// textura ni teselas finas — geometría simplificada). Compartido por todos
// los chunks LOD; igual que el atlas, se crea una vez y nunca se hace dispose.
// vertexColors multiplica por la luz del día/noche (como el resto del mundo).
// DoubleSide: los muros del caparazón pueden verse por detrás desde un valle
// o desde muy arriba — es barato en un material sin textura.
const lodMaterial = worldMaterial({
	vertexColors: true,
	side: THREE.DoubleSide
});

// Fase 19.6: datos compartidos de animación por tiempo para que el bucle de
// render (player.js → updateLiquidAnimation) actualice el agua y las plantas.
export const waterMaterialUniforms = waterUniforms;
export const plantMaterialUniforms = windUniforms;

// Exportados para lodmesh.js (buildLodGeometry usa el pool y el material de
// color plano), world.js (removeChunkMesh devuelve la geometría al pool y
// hotReloadTextures refresca los materiales) y player.js (animación).
export {
	geometryPool,
	lavaMaterial,
	lodMaterial,
	plantMaterial,
	terrainMaterial,
	waterMaterial
};

// ============================================================
// POOL DE GEOMETRÍAS (Fase 6)
// ============================================================
// Las BufferGeometry se reutilizan entre chunks en vez de dispose()+new. Por
// categoría (terrain/water/lod: cada una con su set de attributes), con tope
// para acotar la memoria retenida. Exponer el pool para la métrica del HUD
// (window.__mcGeoPool, ver player.js).
const geometryPool = createGeometryPool({
	makeGeometry: () => new THREE.BufferGeometry(),
	maxPooled: 24,
	// Fase 19.6 (C2): categoría "plant" propia — las plantas llevan un
	// attribute extra (`wind` vec2) que el resto de categorías no tiene; no
	// se mezclan con "torch" (que ahora solo contiene antorchas).
	categories: ["terrain", "water", "lod", "torch", "plant"]
});
export function geoPoolStats() {
	return geometryPool.stats();
}

// Margen sobre la esfera envolvente de cada chunk: evita parpadeo cuando la
// geometría asoma por el borde de la pantalla justo antes de salir del frustum.
const FRUSTUM_MARGIN = 1.05;

// Esfera envolvente de un chunk a partir de su geometría real (no de la caja
// completa de la columna, que sería demasiado conservadora en montañas/cuevas).
// Se calcula UNA vez por chunk al construirlo y se guarda en userData.
export function computeChunkSphere(group) {
	const box = new THREE.Box3();
	group.traverse((o) => {
		if (o.isMesh && o.geometry) box.expandByObject(o);
	});
	const sphere = box.getBoundingSphere(new THREE.Sphere());
	sphere.radius *= FRUSTUM_MARGIN;
	return sphere;
}

// ============================================================
// AGUA/LAVA/PLANTAS ANIMADOS (Fase 9, Bloque E + Fase 19.6, C1/C2)
// Barato: pulso suave de la opacidad del agua y del brillo de la lava con
// una onda seno del reloj global; el tiempo de escena alimenta los shaders
// de agua (C1) y de viento de las plantas (C2). Se llama cada frame desde
// el bucle de animación (player.js) y actualiza SOLO uniformes: sin
// reconstrucción de geometría.
// ============================================================
let liquidTime = 0;
export function updateLiquidAnimation() {
	liquidTime += 0.016; // ~60 fps
	const wave = Math.sin(liquidTime * 2.2) * 0.5 + 0.5; // 0..1
	// Opacidad del agua: 0.58..0.72 (la superficie "respira"); la lava brilla
	// y oscila su incandescencia (emissiveIntensity 0.35..0.6).
	waterUniforms.uOpacity.value = 0.58 + wave * 0.14;
	lavaMaterial.emissiveIntensity = 0.35 + wave * 0.25;
	// Fase 19.6 (C1/C2): el tiempo va a los ShaderMaterial — el agua desplaza
	// su textura sola (fragment shader) y las plantas mecen sus vértices; ya
	// no hace falta tocar texture.offset (que rompía el resto del mundo).
	waterUniforms.uTime.value = liquidTime;
	plantMaterialUniforms.uTime.value = liquidTime;
}

// ============================================================
// CONSTRUCCIÓN DE GEOMETRÍA (Fase 13, A1/A2: greedy meshing + worker)
// La generación de atributos (posiciones, UVs, colores, AO) vive en
// chunkGeometry.js, un módulo puro (sin three): aquí solo se hornea la luz
// de antorcha, se reúnen los datos del chunk y sus vecinos 3x3 y se crean
// los meshes con el pool. Dos caminos producen el MISMO resultado:
//   - síncrono: buildChunkGeometry() — ediciones de bloques, LOD, hot-reload;
//   - worker:   el lote de loadChunkData se envía a chunkWorker.js y la
//     respuesta se aplica con groupFromBuffers() (el pool, los materiales y
//     el culling se quedan en el hilo principal, como pide la spec A2).
// ============================================================
// Módulo de texturas activo: apunta al importado estáticamente, pero
// hotReloadTextures() (world.js) lo reemplaza por una instancia fresca
// (dynamic import con cache-busting) para que la geometría reconstruida use
// las teselas/UVs nuevos si cambió el layout del atlas (Fase 6, hot-reload).
let tex = { tileForFace, tileRect };
export function setTexFns(fns) {
	tex = fns;
}

function collectChunkData(cx, cz) {
	// Datos del chunk + vecinos 3x3 (bloques y luz horneada) en coordenadas
	// relativas "dx,dz" — el formato que consume buildChunkGeometryData.
	const chunks = new Map();
	const light = new Map();
	for (let dx = -1; dx <= 1; dx++) {
		for (let dz = -1; dz <= 1; dz++) {
			const key = `${cx + dx},${cz + dz}`;
			const arr = getChunkData(key);
			if (!arr) continue;
			chunks.set(`${dx},${dz}`, arr);
			light.set(`${dx},${dz}`, getChunkLight(key));
		}
	}
	return { chunks, light };
}

// Convierte los buffers del greedy (Float32Array por atributo) en el
// THREE.Group del chunk (un mesh por categoría con su material y el pool de
// geometrías). Lo usan el camino síncrono y el worker.
export function groupFromBuffers(buffers) {
	if (
		!buffers.terrain &&
		!buffers.water &&
		!buffers.lava &&
		!buffers.torch &&
		!buffers.plant
	)
		return null;
	const group = new THREE.Group();
	if (buffers.terrain) {
		const geo = geometryPool.acquire("terrain");
		setOrReuseAttribute(
			geo,
			"position",
			buffers.terrain.pos,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			buffers.terrain.norm,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"uv",
			buffers.terrain.uv,
			2,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"color",
			buffers.terrain.col,
			3,
			THREE.Float32BufferAttribute
		);
		// Fase 19.6 (B): worldMaterial devuelve el material activo del estilo
		// (base lambert o su gemelo toon), para que los chunks construidos
		// DESPUÉS de activar el toggle también usen toon. El swap en caliente
		// de las mallas existentes lo hace applyMaterialStyle (materialstyle.js).
		const mesh = new THREE.Mesh(geo, worldMaterial(undefined, terrainMaterial));
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.userData.isTerrain = true;
		mesh.userData.poolCat = "terrain";
		group.add(mesh);
	}
	if (buffers.water) {
		const geo = geometryPool.acquire("water");
		setOrReuseAttribute(
			geo,
			"position",
			buffers.water.pos,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			buffers.water.norm,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"uv",
			buffers.water.uv,
			2,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"color",
			buffers.water.col,
			3,
			THREE.Float32BufferAttribute
		);
		const mesh = new THREE.Mesh(geo, waterMaterial);
		mesh.renderOrder = 1; // translúcido: dibujar después del terreno opaco
		mesh.userData.isTerrain = true;
		mesh.userData.poolCat = "water";
		group.add(mesh);
	}
	if (buffers.lava) {
		const geo = geometryPool.acquire("water"); // misma categoría: geometría translúcida
		setOrReuseAttribute(
			geo,
			"position",
			buffers.lava.pos,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			buffers.lava.norm,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"uv",
			buffers.lava.uv,
			2,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"color",
			buffers.lava.col,
			3,
			THREE.Float32BufferAttribute
		);
		const mesh = new THREE.Mesh(geo, worldMaterial(undefined, lavaMaterial));
		mesh.renderOrder = 1; // tras el terreno opaco
		mesh.userData.isTerrain = true;
		mesh.userData.poolCat = "water";
		group.add(mesh);
	}
	if (buffers.torch) {
		const geo = geometryPool.acquire("torch");
		setOrReuseAttribute(
			geo,
			"position",
			buffers.torch.pos,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			buffers.torch.norm,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"uv",
			buffers.torch.uv,
			2,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"color",
			buffers.torch.col,
			3,
			THREE.Float32BufferAttribute
		);
		const mesh = new THREE.Mesh(geo, worldMaterial(undefined, torchMaterial));
		mesh.renderOrder = 2; // translúcida: tras el agua, para verse en las orillas
		mesh.userData.isTorch = true;
		mesh.userData.poolCat = "torch";
		group.add(mesh);
	}
	// Fase 19.6 (C2): plantas (hierba/flores/trigo) con su buffer y material
	// de VIENTO propios. Llevan además el attribute `wind` (vec2 por vértice:
	// fase de celda + altura 0..1) que el vertex shader consume; las categorías
	// del geopool son separadas (las plantas no comparten geometría con las
	// antorchas — el pool por categoría lo pide).
	if (buffers.plant) {
		const geo = geometryPool.acquire("plant");
		setOrReuseAttribute(
			geo,
			"position",
			buffers.plant.pos,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"normal",
			buffers.plant.norm,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"uv",
			buffers.plant.uv,
			2,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"color",
			buffers.plant.col,
			3,
			THREE.Float32BufferAttribute
		);
		setOrReuseAttribute(
			geo,
			"wind",
			buffers.plant.wind,
			2,
			THREE.Float32BufferAttribute
		);
		const mesh = new THREE.Mesh(geo, plantMaterial);
		mesh.renderOrder = 2; // translúcida: tras el agua (mismo caso que antorchas)
		mesh.userData.isPlant = true;
		mesh.userData.poolCat = "plant";
		group.add(mesh);
	}
	group.userData.boundingSphere = computeChunkSphere(group);
	return group;
}

// Camino síncrono (ediciones, LOD, hot-reload, fallback sin worker).
export function buildChunkGeometry(cx, cz) {
	workerPending.delete(`${cx},${cz}`); // un build síncrono invalida jobs en vuelo
	bakeChunkLight(cx, cz);
	const { chunks, light } = collectChunkData(cx, cz);
	const buffers = buildChunkGeometryData({
		cx,
		cz,
		chunks,
		light,
		tileForFaceFn: tex.tileForFace,
		tileRectFn: tex.tileRect
	});
	if (!buffers) return null;
	return groupFromBuffers(buffers);
}

// ============================================================
// GESTOR DEL WORKER (Fase 13, A2)
// ============================================================
// Se crea perezosamente la primera vez que hay un lote grande que construir;
// si el entorno no tiene Worker (o el worker falla), workerBroken=true y el
// juego usa para siempre el camino síncrono (misma función pura → mismo
// resultado). workerPending + token detectan respuestas obsoletas (el chunk
// se reconstruyó o descargó mientras el worker trabajaba). El handler de
// respuestas (onWorkerMessage) vive en world.js (toca los mapas de mallas) y
// se inyecta aquí con setWorkerMessageHandler para evitar el ciclo de imports.
export const workerPending = new Map(); // "cx,cz" → token del job en vuelo
let chunkWorker = null;
let workerBroken = false;
let workerToken = 0;
let workerMessageHandler = () => {};
export function setWorkerMessageHandler(fn) {
	workerMessageHandler = fn;
}
// Fallback cuando el worker falla (F17 B3): world.js decide qué pendientes
// reconstruir de forma síncrona (los que tienen datos y no mesh).
let workerFallback = () => {};
export function setWorkerFallback(fn) {
	workerFallback = fn;
}

export function tryGetWorker() {
	if (workerBroken) return null;
	if (chunkWorker) return chunkWorker;
	try {
		chunkWorker = new Worker(new URL("./chunkWorker.js", import.meta.url), {
			type: "module"
		});
		window.__mcChunkWorker = true; // diagnóstico F3/auditoría: el worker está activo
		chunkWorker.onmessage = (e) => workerMessageHandler(e.data);
		chunkWorker.onerror = () => {
			workerBroken = true;
			window.__mcChunkWorker = false; // diagnóstico: ya no se usa el worker
			if (chunkWorker) {
				try {
					chunkWorker.terminate();
				} catch {
					/* noop */
				}
			}
			chunkWorker = null;
			// Los pendientes se reconstruyen de forma síncrona (fallback
			// inyectado desde world.js: rebuild de los que tienen datos).
			workerFallback();
		};
	} catch {
		workerBroken = true;
		chunkWorker = null;
	}
	return chunkWorker;
}

function workerJobFor(cx, cz) {
	// FIX revisión F13-A2: hornear SIEMPRE la luz antes de recolectarla — el
	// camino del worker no pasa por buildChunkGeometry (que hornea en el
	// síncrono) y sin esto lightStore estaría vacío y las antorchas no
	// iluminarían en los chunks construidos por el worker. Barato: sin
	// antorchas relevantes bakeChunkLight deja el chunk a null y retorna.
	bakeChunkLight(cx, cz);
	const { chunks, light } = collectChunkData(cx, cz);
	const chunkKeysList = [...chunks.keys()];
	const chunkData = chunkKeysList.map((k) => chunks.get(k).slice()); // copia transferible
	const lightKeys = [...light.keys()];
	const lightData = lightKeys.map((k) => {
		const a = light.get(k);
		return a ? a.slice() : null;
	});
	return { cx, cz, chunkKeys: chunkKeysList, chunkData, lightKeys, lightData };
}

export function enqueueWorkerBatch(keys) {
	const w = chunkWorker;
	for (const key of keys) {
		const [cx, cz] = key.split(",").map(Number);
		const id = ++workerToken;
		workerPending.set(key, id);
		const job = workerJobFor(cx, cz);
		const transfer = [];
		for (const a of job.chunkData) transfer.push(a.buffer);
		for (const a of job.lightData) if (a) transfer.push(a.buffer);
		w.postMessage({ type: "build", id, key, job }, transfer);
	}
}
