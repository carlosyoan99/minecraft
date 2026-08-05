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

// Pool de partículas vivas: cada una un cubito con estado de física.
const cubeGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
const materials = new Map(); // colorHex -> material compartido
const alive = []; // { mesh, vx, vy, vz, life, ttl }
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
			scene.remove(p.mesh);
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

// Cubito nuevo (reutiliza material; la geometría es compartida).
function spawnCube(x, y, z, colorHex) {
	const mesh = new THREE.Mesh(cubeGeo, materialFor(colorHex));
	mesh.material.transparent = true;
	mesh.position.set(x, y, z);
	mesh.castShadow = false;
	scene.add(mesh);
	return mesh;
}

// Ráfaga de N cubitos con dispersión aleatoria y gravedad.
function burst(x, y, z, blockId, count, speed) {
	const colorHex = BLOCK_COLORS[blockId] ?? 0x888888;
	const center = Math.floor(x) + 0.5; // centro del bloque (x, y, z son enteros)
	ensureLoop();
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
