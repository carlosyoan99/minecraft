// ============================================================
// CICLO DÍA/NOCHE VISUAL
// El servidor envía su dayTime (ms dentro del ciclo) en el init; aquí se
// extrapola con performance.now() para saber la fase en todo momento y se
// interpolan cielo, luz solar, ambiente y niebla. Solo visual: la lógica
// (spawns nocturnos) ya la decide el servidor con el mismo reloj.
// ============================================================
import * as THREE from "three";
import { DAY_CYCLE_MS } from "./constants.js";
import { ambient, scene, sun } from "./scene.js";
import { updateSky } from "./sky.js"; // Fase 7: dome procedural (degradado + sol/luna)

// Colores clave del ciclo
const DAY_SKY = new THREE.Color(0x87ceeb);
const NIGHT_SKY = new THREE.Color(0x0b1026);
const DUSK_SKY = new THREE.Color(0xff7a3d); // amanecer/atardecer
const DAY_SUN = new THREE.Color(0xfff2d0);
const NIGHT_SUN = new THREE.Color(0x9fb4d8); // tinte lunar
const skyColor = new THREE.Color(); // scratch reutilizado cada frame (evita allocs)

let dayTimeAtInit = 0;
let initWall = 0;

// Devuelve la fase actual del ciclo en [0, 1): 0 = amanecer, 0.25 = mediodía,
// 0.5 = atardecer, 0.75 = medianoche. La extrapolación desde el reloj del
// servidor evita mensajes periódicos y mantiene a todos los clientes en fase.
export function currentPhase() {
	const elapsed = performance.now() - initWall;
	return ((dayTimeAtInit + elapsed) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
}

export function initDayNight(serverDayTime) {
	dayTimeAtInit = (serverDayTime || 0) % DAY_CYCLE_MS;
	initWall = performance.now();
}

// Se llama cada frame desde el bucle de render.
export function updateDayNight() {
	const phase = currentPhase();
	// Factor de día: 1 al mediodía, 0 en la noche; transición suave con seno.
	const dayFactor = Math.max(0, Math.sin(phase * Math.PI * 2));
	// Intensidad de luz: día brillante, noche tenue (la luna nunca apaga del todo)
	sun.intensity = 0.08 + dayFactor * 1.05;
	ambient.intensity = 0.25 + dayFactor * 0.5;

	// Tinte de la luz solar: cálido de día, azulado de noche
	sun.color.copy(DAY_SUN).lerp(NIGHT_SUN, 1 - dayFactor);

	// Cielo: azul de día → azul oscuro de noche, con naranja en amanecer/atardecer
	// (máximo cuando dayFactor ≈ 0.35, es decir, sol bajo pero aún con luz).
	skyColor.copy(DAY_SKY).lerp(NIGHT_SKY, 1 - dayFactor);
	const dusk = Math.max(
		0,
		Math.min(1, dayFactor * (1 - Math.abs(dayFactor - 0.35) * 2.2))
	);
	skyColor.lerp(DUSK_SKY, dusk);
	// El fondo plano sigue siendo el color del horizonte (fallback si el dome
	// no estuviera); el dome procedural de sky.js es lo que se ve realmente.
	scene.background.copy(skyColor);

	// Fase 7: niebla dinámica por hora del día. De noche la niebla es más
	// densa y cercana (reduce el alcance visual y esconde el horizonte); al
	// mediodía es clara y lejana. En amanecer/atardecer se espesa con el
	// tinte cálido (el color de la niebla ya sigue al cielo).
	if (scene.fog) {
		scene.fog.color.copy(skyColor);
		scene.fog.near = 30 + dayFactor * 45; // 30 de noche → 75 al mediodía
		scene.fog.far = 70 + dayFactor * 130 + dusk * 40; // 70 de noche → ~240 de día
	}

	// Fase 7: actualizar el dome del cielo (degradado, sol/luna, estrellas)
	updateSky(phase, dayFactor, dusk);
}
