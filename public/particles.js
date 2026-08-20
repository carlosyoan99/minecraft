// ============================================================
// PARTÍCULAS DE BLOQUES (Fase 7, estética Minecraft)
// Al romper un bloque salen cubitos de su color (con gravedad, que
// caen y se desvanecen); al colocarlo, una ráfaga corta y suave.
// Todo procedural: geometría y material compartidos (pool), sin
// assets. spawnBlockBreak/spawnBlockPlace se llaman desde network.js
// al recibir block_update (cubre al jugador local y a los demás).
// ============================================================
import * as THREE from "three";
import { BLOCK_COLORS } from "./constants.js";
import { scene } from "./scene.js";
import { getClientBlock } from "./chunkstore.js";
import { findLeafPoint, leafParticleConfig } from "./leafparticles.js"; // Fase 21.5 (E4): hojas cayendo

// Pool de partículas vivas: cada una un cubito con estado de física.
const cubeGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
// Fase 21.5 (E4): hoja aplanada (finísima, ~la mitad de un cubo) que cae
// con balanceo. Geometría aparte del pool de cubos: las mallas se reutilizan
// por tipo (una malla de cubo nunca se recicla como hoja ni al revés).
const leafGeo = new THREE.BoxGeometry(0.34, 0.02, 0.34);
const materials = new Map(); // colorHex -> material compartido
const alive = []; // { mesh, kind, vx, vy, vz, life, ttl, ... }
const freeLeaves = []; // hoja muerta reutilizable (par de freeMeshes)
// Auditoría 2026-08-15 (CL-8): pool de meshes MUERTOS reutilizables (P6 en
// la auditoría: spawnCube creaba un Mesh nuevo por partícula). Al morir, la
// instancia no se descarta: se recicla reasignando material y posición. Tope
// duro MAX_ALIVE: si la ráfaga satura (roturas/colocaciones sostenidas), las
// nuevas se descartan antes de reservar — el límite de VRAM queda acotado ya.
const freeMeshes = [];
const MAX_ALIVE = 200;
let loopActive = false;

function materialFor(colorHex) {
	let m = materials.get(colorHex);
	if (!m) {
		m = new THREE.MeshLambertMaterial({ color: colorHex });
		materials.set(colorHex, m);
	}
	return m;
}

// Bucle de física: se detiene solo cuando no quedan partículas (evita un
// no-op permanente por frame) y se reinicia en la siguiente ráfaga.
function tickParticles() {
	const dt = 1 / 60;
	// Física hacia atrás para que las partículas muertas se reutilicen
	// (evita allocs en cada frame; raramente hay > 100 vivas).
	for (let i = alive.length - 1; i >= 0; i--) {
		const p = alive[i];
		p.life += dt;
		if (p.kind === "leaf") {
			// Fase 21.5 (E4): física de hoja — cae a velocidad constante con
			// balanceo lateral sinusoidal (viento suave) y giro leve. La copa
			// está siempre al menos a TTL*speed del suelo, así la hoja nunca
			// "atraviesa" el suelo antes de desvanecerse.
			p.mesh.position.y += -p.vy * dt;
			const wob = Math.sin(p.life * p.wobSpeed + p.phase) * p.wobAmp;
			p.mesh.position.x = p.baseX + wob;
			p.mesh.position.z = p.baseZ + Math.cos(p.life * p.wobSpeed * 0.8 + p.phase) * p.wobAmp * 0.7;
			p.mesh.rotation.z += 1.5 * dt;
			p.mesh.rotation.x += 0.8 * dt;
			const k = 1 - p.life / p.ttl;
			p.mesh.material.opacity = Math.max(0, Math.min(1, k));
			if (p.life >= p.ttl) {
				scene.remove(p.mesh);
				freeLeaves.push(p.mesh);
				alive.splice(i, 1);
			}
			continue;
		}
		p.vy -= 9.8 * dt; // gravedad
		p.mesh.position.x += p.vx * dt;
		p.mesh.position.y += p.vy * dt;
		p.mesh.position.z += p.vz * dt;
		// Girar para que se vean "cubos" al caer
		p.mesh.rotation.x += 6 * dt;
		p.mesh.rotation.y += 4 * dt;
		const k = 1 - p.life / p.ttl;
		p.mesh.material.opacity = Math.max(0, Math.min(1, k));
		if (p.life >= p.ttl) {
			// Reciclar la malla en vez de destruirla (CL-8/P6).
			scene.remove(p.mesh);
			freeMeshes.push(p.mesh);
			alive.splice(i, 1); // barato: las ráfagas son cortas
		}
	}
	if (alive.length) {
		requestAnimationFrame(tickParticles);
	} else {
		loopActive = false;
	}
}

function ensureLoop() {
	if (loopActive) return;
	loopActive = true;
	requestAnimationFrame(tickParticles);
}

// Cubito nuevo: reutiliza una malla del pool si la hay (reciclar el objeto
// evita allocs y GC por ráfaga); el material se reasigna por color.
function spawnCube(x, y, z, colorHex) {
	const mesh =
		freeMeshes.pop() || new THREE.Mesh(cubeGeo, materialFor(colorHex));
	mesh.material = materialFor(colorHex);
	mesh.material.transparent = true;
	mesh.position.set(x, y, z);
	mesh.rotation.set(0, 0, 0);
	mesh.castShadow = false;
	scene.add(mesh);
	return mesh;
}

// Ráfaga de N cubitos con dispersión aleatoria y gravedad.
function burst(x, y, z, blockId, count, speed) {
	const colorHex = BLOCK_COLORS[blockId] ?? 0x888888;
	const center = Math.floor(x) + 0.5; // centro del bloque (x, y, z son enteros)
	ensureLoop();
	if (alive.length >= MAX_ALIVE) return; // tope duro (CL-8): no reservar más
	for (let i = 0; i < count; i++) {
		const a = Math.random() * Math.PI * 2;
		const r = (0.3 + Math.random() * 0.9) * speed;
		alive.push({
			mesh: spawnCube(
				center,
				Math.floor(y) + 0.5,
				Math.floor(z) + 0.5,
				colorHex
			),
			vx: Math.cos(a) * r,
			vy: Math.abs(Math.sin(a)) * r * 0.8 + 1.4, // hacia arriba al principio
			vz: Math.sin(a) * r,
			life: 0,
			ttl: 0.55 + Math.random() * 0.35
		});
	}
}

// Rotura: muchos cubitos que saltan. Colocación: pocos y lentos.
export function spawnBlockBreak(x, y, z, blockId) {
	burst(x, y, z, blockId, 10, 1);
}
export function spawnBlockPlace(x, y, z, blockId) {
	burst(x, y, z, blockId, 4, 0.55);
}

// ------------------------------------------------------------
// Fase 21.5 (E4): partículas de hojas cayendo bajo los árboles.
// Puramente visual (el servidor no las conoce): el bucle muestrea
// columnas de copa alrededor del jugador y, al encontrar una hoja,
// emite un aplanado que cae con vaivén hasta desvanecerse.
// "Reducir movimiento" (F19.5 B4) alarga el intervalo y suaviza el
// vaivén (la política vive en leafparticles.js, lógica pura).
// ------------------------------------------------------------
const leafAcc0 = { v: 0 };

// Malla de hoja nueva (reutiliza una del pool si la hay). El material de
// hoja es translúcido y NO emisivo: la vegetación no emite su propia luz.
function spawnLeafMesh(colorHex) {
	const mesh = freeLeaves.pop() || new THREE.Mesh(leafGeo, materialFor(colorHex));
	mesh.geometry = leafGeo;
	mesh.material = materialFor(colorHex);
	mesh.material.transparent = true;
	mesh.castShadow = false;
	scene.add(mesh);
	return mesh;
}

// Emite una hoja desde el bloque {x,y,z} (borde superior de la copa).
function emitLeaf(x, y, z, colorHex, cfg) {
	ensureLoop();
	if (alive.length >= MAX_ALIVE) return; // tope duro compartido (CL-8)
	const phase = Math.random() * Math.PI * 2;
	const mesh = spawnLeafMesh(colorHex);
	// Jitter para que no salgan todas del mismo punto del bloque.
	mesh.position.set(
		x + 0.5 + (Math.random() - 0.5) * 0.6,
		y + 0.9,
		z + 0.5 + (Math.random() - 0.5) * 0.6
	);
	mesh.material.opacity = 1;
	alive.push({
		kind: "leaf",
		mesh,
		baseX: mesh.position.x,
		baseZ: mesh.position.z,
		vy: cfg.fallSpeed,
		wobAmp: cfg.swayAmp,
		wobSpeed: cfg.swaySpeed,
		phase,
		life: 0,
		ttl: cfg.ttlBase * (0.75 + Math.random() * 0.5)
	});
}

// Muestrea copas alrededor del jugador y emite hojas. Llamado por frame con
// el dt real (acumulador) para que el ritmo no dependa del framerate.
// `reduceMotion` (F19.5 B4) la atenúa: el jugador (player.js) lo pasa ya
// evaluado para no acoplar particles.js al sistema de ajustes.
export function tickFallingLeaves(dt, px, py, pz, reduceMotion) {
	const full = leafParticleConfig(reduceMotion);
	leafAcc0.v += dt;
	if (leafAcc0.v < full.sampleInterval) return;
	leafAcc0.v = 0;
	// Al menos 1 candidato por tick; la política "reducir movimiento" usa uno.
	const tries = reduceMotion ? 1 : 2;
	for (let t = 0; t < tries; t++) {
		const hit = findLeafPoint(px, pz, py, 12, getClientBlock, Math.random);
		if (hit) {
			const id = getClientBlock(hit.x, hit.y, hit.z);
			if (Math.random() < full.chance) emitLeaf(hit.x, hit.y, hit.z, BLOCK_COLORS[id] ?? 0x3a7a2e, full);
		}
	}
}
