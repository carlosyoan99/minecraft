// ============================================================
// NUBES (Fase 10, Bloque E4)
// Nubes procedurales que se desplazan con el viento y siguen al
// jugador: un anillo de grupos de cajas blancas aplanadas a
// ALTURA fija. Se reposicionan alrededor de la cámara cuando esta
// se aleja (el mundo es grande: sin esto las nubes se quedarían
// atrás). Barato: ~14 grupos x 3-5 cajas, un material compartido,
// sin sombras ni texturas; el color se atenúa de noche vía
// material.color con el factor de día (leído del ciclo).
// ============================================================
import * as THREE from "three";
import { currentPhase } from "./daynight.js";
import { camera, scene } from "./scene.js";

const CLOUD_ALT = 96; // por encima del mundo (64) pero bajo el dome
const WIND_SPEED = 1.4; // bloques/segundo de deriva
const FIELD_RADIUS = 160; // las nubes viven en un cuadrado ±R alrededor del jugador
const CLOUD_COUNT = 14;

const cloudMaterial = new THREE.MeshLambertMaterial({
	color: 0xffffff,
	// Un solo material para todas las nubes (menos draw calls); el color se
	// multiplica por la luz global del día/noche vía vertexColors.
	vertexColors: true,
	fog: false // las nubes no se ven afectadas por la niebla del horizonte
});

// Caja unitaria blanca por vértice: permite teñir cada caja con el factor
// de día (blanco de día, gris azulado de noche) sin cambiar el material.
function makeCloudBox() {
	const geo = new THREE.BoxGeometry(1, 1, 1);
	const colors = new Float32Array(24).fill(1); // 8 vértices x 3
	geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
	return new THREE.Mesh(geo, cloudMaterial);
}

const clouds = [];

// Crea una nube: 3-5 cajas aplanadas agrupadas, con semilla propia.
function spawnCloud(seed) {
	const group = new THREE.Group();
	const n = 3 + (seed % 3);
	for (let i = 0; i < n; i++) {
		const box = makeCloudBox();
		const w = 4 + ((seed + i * 7) % 5); // 4..8 bloques de ancho
		const d = 3 + ((seed + i * 13) % 4);
		const h = 0.8 + ((seed + i * 3) % 3) * 0.5;
		box.scale.set(w, h, d);
		// Solapadas para formar un bulto irregular de nube
		box.position.set(
			(i - 1) * w * 0.45,
			((seed + i) % 3) * 0.4,
			((seed + i * 5) % 3) * 0.6
		);
		group.add(box);
	}
	// Posición base dentro del campo (se re-posiciona al seguir al jugador)
	group.userData.offsetX = ((seed * 97) % 1000) / 1000; // 0..1 del campo
	group.userData.offsetZ = ((seed * 179) % 1000) / 1000;
	scene.add(group);
	clouds.push(group);
}

// Llama una vez al arrancar el juego (desde player.js).
export function initClouds() {
	for (let i = 0; i < CLOUD_COUNT; i++) spawnCloud(i * 7 + 3);
}

// Se llama cada frame: mueve las nubes con el viento y las mantiene dentro
// del campo alrededor del jugador.
export function updateClouds(_dt) {
	const px = camera.position.x;
	const pz = camera.position.z;
	const phase = currentPhase();
	const dayFactor = Math.max(0, Math.sin(phase * Math.PI * 2));
	for (const group of clouds) {
		group.position.x =
			px -
			FIELD_RADIUS +
			((group.userData.offsetX * FIELD_RADIUS * 2 +
				performance.now() * 0.001 * WIND_SPEED) %
				(FIELD_RADIUS * 2));
		group.position.z =
			pz -
			FIELD_RADIUS +
			((group.userData.offsetZ * FIELD_RADIUS * 2) % (FIELD_RADIUS * 2));
		group.position.y = CLOUD_ALT;
		// Tinte por vértice: blanco de día → gris azulado de noche (las nubes
		// se oscurecen como el resto del mundo).
		const tint = 0.35 + dayFactor * 0.65;
		for (const mesh of group.children) {
			const c = mesh.geometry.getAttribute("color");
			for (let i = 0; i < c.count; i++) c.setXYZ(i, tint, tint, tint);
			c.needsUpdate = true;
		}
	}
}
