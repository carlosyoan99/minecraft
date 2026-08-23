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
import { GPUStatsPanel } from "three/addons/GPUStatsPanel.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import Stats from "three/addons/stats.module.js";
import { CHUNK_SIZE, WATER, WORLD_MAX_Y, WORLD_MIN_Y } from "./constants.js";
import { camera, renderer, scene } from "./scene.js";
import { getSetting } from "./settings.js";
import { getGamemode } from "./ui.js";
import { chunkMeshes, getClientBlock, lodMeshes } from "./world.js";

const hudEl = document.getElementById("debug-hud");
let enabled = false;

// Fase 22.1 (E): stats.js de Three.js — panel de rendimiento en desarrollo.
// Se muestra solo cuando el ajuste "stats" está activado Y el F3 está
// encendido. OFF por defecto (settings.stats = false).
const stats = new Stats();
stats.dom.style.position = "absolute";
stats.dom.style.top = "0px";
stats.dom.style.left = "0px";
stats.dom.style.zIndex = "100";
// Fase 22.1+GPUStats: panel de GPU (ms reales de render) usando
// EXT_disjoint_timer_query. Solo se crea cuando el toggle stats está
// activo (requiere el contexto GL, que ya existe al abrir F3).
let gpuPanel = null;
let gpuVisible = false;

// Instrumentar renderer.render para medir GPU time.
// Se hace UNA vez; el hook solo mide cuando gpuPanel está activo.
const _origRender = renderer.render.bind(renderer);
renderer.render = (scene, camera) => {
	if (gpuPanel) gpuPanel.startQuery();
	_origRender(scene, camera);
	if (gpuPanel) gpuPanel.endQuery();
};

// ============================================================
// GRID DE BORDES DE CHUNK (sobre el terreno)
// ============================================================
const borderGroup = new THREE.Group();
borderGroup.visible = false;
borderGroup.frustumCulled = false; // el grid es debug: se envía siempre
scene.add(borderGroup);
// Fase 22.1+Line2: material con grosor real (gl.lineWidth es ignorado
// en muchos drivers; LineMaterial usa un shader que funciona siempre).
// Se crea UNA vez y se reutiliza en cada reconstrucción.
const borderMaterial = new LineMaterial({
	color: 0xff1e14,
	linewidth: 1.5, // grosor en píxeles (resolution-aware)
	vertexColors: true,
	resolution: new THREE.Vector2(window.innerWidth, window.innerHeight)
});
// Actualizar resolution al redimensionar la ventana.
window.addEventListener("resize", () => {
	borderMaterial.resolution.set(window.innerWidth, window.innerHeight);
});

// Altura de la superficie en (wx, wz): primer bloque sólido desde arriba +1.
// El aire y el agua no cuentan; un chunk desconocido (-1) se trata como
// vacío (el borde queda a nivel 0 solo en esquinas de zona no cargada).
function surfaceY(wx, wz) {
	// Fase 15 (D5): el mundo va de WORLD_MIN_Y (−64) a WORLD_MAX_Y (+63).
	for (let y = WORLD_MAX_Y; y >= WORLD_MIN_Y; y--) {
		const b = getClientBlock(wx, y, wz);
		if (b !== 0 && b !== -1 && b !== WATER) return y + 1;
	}
	return WORLD_MIN_Y;
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
	// Fase 22.1+Line2: LineSegmentsGeometry acepta arrays planos de
	// position y color directamente (setPositions/setColors). El material
	// LineMaterial calcula el grosor real vía shader.
	const geo = new LineSegmentsGeometry();
	geo.setPositions(new Float32Array(positions));
	geo.setColors(new Float32Array(colors));
	const lines = new LineSegments2(geo, borderMaterial);
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
	// Auditoría 2026-08-15 (CL-6): último error capturado del lado del cliente
	// (telemetry.js → window.__mcClientErrors, también enviado al servidor).
	const lastErr = window.__mcClientErrors?.at(-1);
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
		// Fase 22.1+GPUStats: GPU render time (panel overlay + línea en HUD)
		gpuPanel
			? `GPU: ${gpuVisible ? "activo (overlay)" : "inactivo"} · Draw calls: ${renderer.info.render.calls}`
			: `GPU: no disponible`,
		`Daño: ${lastDmg ? `${lastDmg.source} ${lastDmg.amount}→${lastDmg.realAmount} @ ${lastDmg.x.toFixed(0)},${lastDmg.y.toFixed(0)},${lastDmg.z.toFixed(0)}` : "--"}`,
		`Fallos cliente: ${lastErr ? `${window.__mcClientErrors.length} (${new Date(lastErr.t).toLocaleTimeString()} ${lastErr.text.slice(0, 60)})` : "ninguno"}`
	].join("<br>");
}

// ============================================================
// TOGGLE + BUCLE (solo mientras está activo)
// ============================================================
export function toggleDebug() {
	enabled = !enabled;
	hudEl.classList.toggle("hidden", !enabled);
	borderGroup.visible = enabled;
	// Fase 22.1 (E): mostrar/ocultar stats.js + GPUStatsPanel según el ajuste.
	if (enabled && getSetting("stats")) {
		if (!statsVisible) {
			document.body.appendChild(stats.dom);
			statsVisible = true;
		}
		if (!gpuPanel) {
			gpuPanel = new GPUStatsPanel(renderer.getContext());
			stats.addPanel(gpuPanel);
		}
		if (!gpuVisible) {
			gpuPanel.dom.style.display = "";
			gpuVisible = true;
		}
	} else {
		if (statsVisible) {
			stats.dom.remove();
			statsVisible = false;
		}
		if (gpuVisible && gpuPanel) {
			gpuPanel.dom.style.display = "none";
			gpuVisible = false;
		}
	}
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
	// Fase 22.1 (E): actualizar stats.js + GPUStatsPanel si están visibles.
	if (statsVisible) stats.update();
	// GPUStatsPanel se actualiza automáticamente vía startQuery/endQuery;
	// no necesita update() manual.
}, 1000);
