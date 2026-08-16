// ============================================================
// LUCES PUNTUALES DE ANTORCHA (Fase 19.6, Bloque A2)
// PointLight REAL solo en las antorchas cercanas al jugador, con un
// presupuesto máximo (TORCH_LIGHT_BUDGET). Se activa desde Ajustes
// (torchLight, OFF por defecto): la luz horneada por celda del atlas
// (F14 M4) es la base, y este bloque es un extra de render opcional.
//
// Por qué OFF por defecto (regla dura del usuario, spec §G1): cada
// PointLight es una pasada extra del pipeline de render (el material
// lambert recalcula sus términos por luz). Con 4-6 luces en pantalla la
// medición degrada claramente en el perfil bajo, así que queda detrás de
// un ajuste de calidad alta. La luz "de verdad" de las antorchas ya la
// da el mapa horneado (que no cuesta nada por frame).
// ============================================================
import * as THREE from "three";
import { getTorches } from "./chunkstore.js";
import { scene } from "./scene.js";
import { selectTorchLights, TORCH_LIGHT_BUDGET } from "./torchlogic.js"; // F19.6 (A2): lógica pura

// Presupuesto: número máximo de PointLight activas a la vez (4: suficientes
// para un pueblo/cueva sin petar el perfil alto). Coordinado con F20
// (presupuestos de rendimiento) y decidido en torchlogic.js (pura, testeable).
export { TORCH_LIGHT_BUDGET };

// Radio (bloques) en el que se "encienden" antorchas alrededor del jugador:
// las que están más allá quedan apagadas aunque sean visibles en pantalla.
const TORCH_LIGHT_RADIUS = 14;
// Intensidad conservadora (la base ya aporta luz horneada): un punto de luz
// cálida que acentúa el bloque/entorno cercano sin quemar la escena.
const TORCH_LIGHT_INTENSITY = 0.9;
const TORCH_LIGHT_DISTANCE = 9;
const TORCH_LIGHT_COLOR = 0xffb04a;

let enabled = false;
const lights = []; // pool de PointLight (visible = activa)

export function isTorchLightEnabled() {
	return enabled;
}

export function setTorchLight(on) {
	enabled = !!on;
	if (enabled) {
		if (lights.length === 0) {
			for (let i = 0; i < TORCH_LIGHT_BUDGET; i++) {
				const light = new THREE.PointLight(
					TORCH_LIGHT_COLOR,
					TORCH_LIGHT_INTENSITY,
					TORCH_LIGHT_DISTANCE
				);
				light.visible = false;
				// Desactivar sombras (costo altísimo por punto de luz): solo la
				// iluminación, no el shadow map — el sol ya proyecta las sombras.
				lights.push(light);
				scene.add(light);
			}
		}
	} else {
		for (const light of lights) light.visible = false;
	}
}

// Cada frame (desde animate()): posiciona las luces del presupuesto en las
// antorchas más cercanas al jugador. Coste O(n) sobre el set de antorchas
// cargado — normal sin antorchas cerca; con un pueblo se itera un puñado.
// La decisión (qué antorchas, cuántas) es lógica pura de torchlogic.js.
export function updateTorchLights(px, py, pz) {
	if (!enabled) return;
	const chosen = selectTorchLights(
		getTorches().values(),
		px,
		py,
		pz,
		TORCH_LIGHT_RADIUS,
		TORCH_LIGHT_BUDGET
	);
	for (let i = 0; i < lights.length; i++) {
		const light = lights[i];
		const t = chosen[i];
		if (!t) {
			light.visible = false;
			continue;
		}
		light.position.set(t[0] + 0.5, t[1] + 0.6, t[2] + 0.5);
		light.visible = true;
	}
}
