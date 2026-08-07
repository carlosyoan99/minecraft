// ============================================================
// VISUALIZADOR DE CHUNKS (F3) — Fase 6
// Toggle con F3 (como el debug de Minecraft): dibuja los bordes de cada
// chunk sobre el terreno (grid rojo estilo MC) y muestra un panel con
// métricas de render — FPS/frame, posición, chunks visibles/totales,
// caras de la geometría y triángulos renderizados. Pensado para depurar
// el frustum culling y el culling de caras.
//
// Autónomo: sin hooks en player.js. Lee las métricas que ya publica el
// bucle de animación en window.__mc* y se actualiza solo (1s) mientras
// está activo.
// ============================================================
import * as THREE from "three";
import { CHUNK_SIZE, WATER, WORLD_HEIGHT } from "./constants.js";
import { camera, scene } from "./scene.js";
import { getGamemode } from "./ui.js";
import { chunkMeshes, getClientBlock, lodMeshes } from "./world.js";

const hudEl = document.getElementById("debug-hud");
let enabled = false;

// ============================================================
// GRID DE BORDES DE CHUNK (sobre el terreno)
// ============================================================
const borderGroup = new THREE.Group();
borderGroup.visible = false;
borderGroup.frustumCulled = false; // el grid es debug: se envía siempre
scene.add(borderGroup);
// Material compartido del grid (como terrainMaterial/waterMaterial en world.js):
// se crea UNA vez y se reutiliza en cada reconstrucción — si se creara uno por
// rebuild (1/s con F3 activo), los programas GL se acumularían sin límite.
const borderMaterial = new THREE.LineBasicMaterial({ vertexColors: true });

// Altura de la superficie en (wx, wz): primer bloque sólido desde arriba +1.
// El aire y el agua no cuentan; un chunk desconocido (-1) se trata como
// vacío (el borde queda a nivel 0 solo en esquinas de zona no cargada).
function surfaceY(wx, wz) {
	for (let y = WORLD_HEIGHT - 1; y >= 0; y--) {
		const b = getClientBlock(wx, y, wz);
		if (b !== 0 && b !== -1 && b !== WATER) return y + 1;
	}
	return 0;
}

// Reconstruye el grid: un cuadrado por chunk siguiendo la superficie del
// terreno. Las esquinas se muestrean DENTRO del chunk (+0.01) para no
// depender de vecinos descargados (evita que el borde se hunda en los
// límites del mundo). Es barato (4 segmentos por chunk) y se reconstruye
// cada segundo mientras el modo está activo, para reflejar chunks nuevos,
// descargas y ediciones de bloques.
function rebuildBorders() {
	for (const child of [...borderGroup.children]) {
		borderGroup.remove(child);
		if (child.geometry) child.geometry.dispose();
	}
	const positions = [];
	const colors = [];
	const [r, g, b] = [1.0, 0.12, 0.08]; // rojo brillante estilo MC debug
	const off = 0.15; // un poco por encima del terreno: evita z-fighting
	// Los bordes cubren ambos tiers (detalle completo y LOD, Fase 6)
	for (const key of new Set([...chunkMeshes.keys(), ...lodMeshes.keys()])) {
		const [cx, cz] = key.split(",").map(Number);
		const x0 = cx * CHUNK_SIZE + 0.01,
			z0 = cz * CHUNK_SIZE + 0.01;
		const x1 = x0 + CHUNK_SIZE - 0.02,
			z1 = z0 + CHUNK_SIZE - 0.02;
		const corners = [
			[x0, surfaceY(x0, z0) + off, z0],
			[x1, surfaceY(x1, z0) + off, z0],
			[x1, surfaceY(x1, z1) + off, z1],
			[x0, surfaceY(x0, z1) + off, z1]
		];
		for (let i = 0; i < 4; i++) {
			const a = corners[i],
				c = corners[(i + 1) % 4];
			positions.push(a[0], a[1], a[2], c[0], c[1], c[2]);
			colors.push(r, g, b, r, g, b);
		}
	}
	if (positions.length === 0) return;
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
	geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
	const lines = new THREE.LineSegments(geo, borderMaterial);
	lines.renderOrder = 2; // por encima del agua translúcida
	borderGroup.add(lines);
}

// ============================================================
// PANEL DE MÉTRICAS (estilo F3)
// ============================================================
function fmt(n) {
	if (!Number.isFinite(n)) return "--";
	return n >= 10000 ? `${(n / 1000).toFixed(0)}K` : n.toFixed(0);
}

// Caras en la geometría cargada: 1 cara (cuadrilátero) = 2 triángulos =
// 6 vértices. position.count ya cuenta VÉRTICES (no floats), así que
// caras = count / 6 (el /18 original mostraba un tercio de las reales).
// Cuenta los dos tiers: completo (texturizado) + LOD (heightmap simplificado).
function totalFaces() {
	let faces = 0;
	for (const group of [...chunkMeshes.values(), ...lodMeshes.values()]) {
		for (const o of group.children) {
			const pos = o.geometry?.attributes.position;
			if (pos) faces += pos.count / 6;
		}
	}
	return faces;
}

function updateHud() {
	if (!enabled || !hudEl) return;
	const fps = window.__mcFps,
		frame = window.__mcFrameMs,
		cull = window.__mcCullMs;
	const chunks = window.__mcChunks ?? chunkMeshes.size + lodMeshes.size;
	const vis = window.__mcVisibleChunks ?? 0;
	const tris = window.__mcTriangles ?? 0;
	const pool = window.__mcGeoPool;
	// Fase 7: métricas del servidor (broadcast server_metrics, media de 1s)
	const srvTick = window.__mcServerTickMs;
	const srvGen = window.__mcChunkGenMs;
	// Fase 8 (B2): telemetría de daño — última entrada recibida (damage_debug).
	// Se muestra solo si hay registros o si el usuario pidió el detalle.
	const lastDmg = window.__mcLastDamage?.at(-1);
	const p = camera.position;
	hudEl.innerHTML = [
		"<b>⛏ Mi Minecraft — Depuración (F3)</b>",
		`FPS: ${fps ? fps.toFixed(0) : "--"} · Frame: ${frame ? frame.toFixed(1) : "--"} ms · Culling: ${cull ? cull.toFixed(2) : "--"} ms`,
		`Posición: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
		// Fase 9 (Bloque B): modo de juego del mundo activo (survival/creative)
		`Modo: ${getGamemode() === "creative" ? "✦ Creativo" : "⛏ Supervivencia"}`,
		`Chunks: ${vis}/${chunks} visibles (${chunkMeshes.size + lodMeshes.size} en memoria)`,
		`Caras: ${fmt(totalFaces())} · Triángulos render: ${fmt(tris)}`,
		`Pool geo: ${pool ? `${fmt(pool.reused)} reutilizadas · ${fmt(pool.created)} creadas · ${fmt(pool.disposed)} liberadas` : "--"}`,
		`Tick servidor: ${Number.isFinite(srvTick) ? srvTick.toFixed(2) : "--"} ms · Gen chunk: ${Number.isFinite(srvGen) ? srvGen.toFixed(2) : "--"} ms`,
		`Daño: ${lastDmg ? `${lastDmg.source} ${lastDmg.amount}→${lastDmg.realAmount} @ ${lastDmg.x.toFixed(0)},${lastDmg.y.toFixed(0)},${lastDmg.z.toFixed(0)}` : "--"}`
	].join("<br>");
}

// ============================================================
// TOGGLE + BUCLE (solo mientras está activo)
// ============================================================
export function toggleDebug() {
	enabled = !enabled;
	hudEl.classList.toggle("hidden", !enabled);
	borderGroup.visible = enabled;
	if (enabled) {
		rebuildBorders();
		updateHud();
	}
	return enabled;
}
setInterval(() => {
	if (!enabled) return;
	rebuildBorders(); // barato: chunks nuevos/descargas y ediciones de bloques
	updateHud();
}, 1000);
