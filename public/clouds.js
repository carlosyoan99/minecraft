// ============================================================
// NUBES (Fase 10, Bloque E4 + Fase 15, D1)
// Nubes procedurales que se desplazan con el viento y siguen al
// jugador: un anillo de grupos de cajas blancas aplanadas a
// ALTURA fija. Se reposicionan alrededor de la cámara cuando esta
// se aleja (el mundo es grande: sin esto las nubes se quedarían
// atrás). Barato: ~16 grupos x 4-7 cajas, un material compartido,
// sin sombras ni texturas; el color se atenúa de noche vía
// material.color con el factor de día (leído del ciclo).
// ============================================================
// Fase 15 (D1): material básico sin iluminación + semitransparencia.
// Las nubes se veían negras porque el Lambert multiplicaba el color
// por la luz (la ambiente era débil) y el tinte nocturno caía a 0.35.
// Con MeshBasicMaterial el color es exactamente el tinte por vértice
// (blanco de día, gris azulado de noche) y la opacidad da el aspecto
// de nube real. depthWrite:false evita que se auto-oculten entre
// el día/noche y reduce artefactos con bloques transparentes.
// ============================================================
import * as THREE from "three";
import { currentPhase } from "./daynight.js";
import { camera, scene } from "./scene.js";

const CLOUD_ALT = 96; // por encima del mundo (64) pero bajo el dome
const WIND_SPEED = 1.4; // bloques/segundo de deriva
const FIELD_RADIUS = 160; // las nubes viven en un cuadrado ±R alrededor del jugador
const CLOUD_COUNT = 16;
const CLOUD_OPACITY = 0.72;

const cloudMaterial = new THREE.MeshBasicMaterial({
	color: 0xffffff,
	// Un solo material para todas las nubes (menos draw calls); el color se
	// multiplica por el ciclo del día/noche vía vertexColors. Semitransparente
	// (Fase 15, D1) y sin depthWrite para que las cajas de una misma nube no
	// se reordenen ni oculten entre sí.
	vertexColors: true,
	transparent: true,
	opacity: CLOUD_OPACITY,
	depthWrite: false,
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

// Crea una nube: 4-7 cajas aplanadas agrupadas (núcleo + sobre de variedad),
// con semilla propia. La semilla también fija un ligero matiz y la altura.
function spawnCloud(seed) {
	const group = new THREE.Group();
	const n = 4 + (seed % 4); // 4..7 cajas: más cuerpo que antes (3-5)
	for (let i = 0; i < n; i++) {
		const box = makeCloudBox();
		const w = 4 + ((seed + i * 7) % 7); // 4..10 bloques de ancho
		const d = 3 + ((seed + i * 13) % 5); // 3..7 de fondo
		const h = 0.6 + ((seed + i * 3) % 3) * 0.4; // 0.6..1.4
		box.scale.set(w, h, d);
		// Solapadas para formar un bulto irregular de nube, con un poco más de
		// dispersión vertical que antes (tipo cúmulo sobre base aplanada).
		box.position.set(
			(i - 1) * w * 0.42,
			((seed + i) % 3) * 0.5 + (i === 0 ? 0 : 0.3),
			((seed + i * 5) % 3) * 0.6
		);
		// Algunas cajas ligeramente más oscuras para dar textura.
		box.userData.shade = ((seed + i) % 3 === 0) ? 0.9 : 1;
		group.add(box);
	}
	// Posición base dentro del campo (se re-posiciona al seguir al jugador)
	group.userData.offsetX = ((seed * 97) % 1000) / 1000; // 0..1 del campo
	group.userData.offsetZ = ((seed * 179) % 1000) / 1000;
	// Variedad de alturas (ligera ondulación del "techo" de nubes).
	group.userData.altBump = ((seed * 31) % 5) - 2; // -2..+2 bloques
	group.userData.windMul = 0.85 + ((seed % 5) / 10); // 0.85..1.25 (unas más rápidas)
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
	// Auditoría 2026-08-09 (§4.6): cuantizar el tinte a pasos de 1/32 e ignorar
	// el re-upload si el valor cuantizado no cambió desde el último frame. Antes
	// cada frame reescribía los 24 colores de cada caja y forzaba needsUpdate
	// (24 × 16 grupos = un BufferAttribute re-subido al GPU a 60 fps aunque el
	// sol apenas se moviera). Ahora el día/noche se ve igual (el salto es de
	// ~0.03) pero el upload solo ocurre cuando CLOUD_TINT_STEP lo amerita.
	const lastTint = updateClouds._lastTint;
	const tint = 0.35 + dayFactor * 0.65;
	if (lastTint === undefined || Math.abs(tint - lastTint) >= CLOUD_TINT_STEP) {
		updateClouds._lastTint = tint;
		for (const group of clouds) {
			for (const mesh of group.children) {
				const c = mesh.geometry.getAttribute("color");
				const shade = mesh.userData.shade ?? 1;
				for (let i = 0; i < c.count; i++)
					c.setXYZ(i, tint * shade, tint * shade, tint * shade);
				c.needsUpdate = true;
			}
		}
	}
	for (const group of clouds) {
		group.position.x =
			px -
			FIELD_RADIUS +
			((group.userData.offsetX * FIELD_RADIUS * 2 +
				performance.now() * 0.001 * WIND_SPEED * group.userData.windMul) %
				(FIELD_RADIUS * 2));
		group.position.z =
			pz -
			FIELD_RADIUS +
			((group.userData.offsetZ * FIELD_RADIUS * 2) % (FIELD_RADIUS * 2));
		group.position.y = CLOUD_ALT + group.userData.altBump;
	}
}

// Paso mínimo de tinte que provoca un re-upload de los colores de las nubes
// (~1/34 del rango 0.35-1.0 → ~8 cambios por ciclo día/noche en lugar de 60/s).
const CLOUD_TINT_STEP = 0.03;