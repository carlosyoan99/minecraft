// ============================================================
// CICLO DÍA/NOCHE VISUAL
// El servidor envía su dayTime (ms dentro del ciclo) en el init; aquí se
// extrapola con performance.now() para saber la fase en todo momento y se
// interpolan cielo, luz solar, ambiente y niebla. Solo visual: la lógica
// (spawns nocturnos) ya la decide el servidor con el mismo reloj.
// ============================================================
import * as THREE from "three";
import { DAY_CYCLE_MS, MOON_CYCLE_MS } from "./constants.js";
import { ambient, scene, sun } from "./scene.js";
import { updateSky } from "./sky.js"; // Fase 7: dome procedural (degradado + sol/luna)

// Colores clave del ciclo
const DAY_SKY = new THREE.Color(0x87ceeb);
const NIGHT_SKY = new THREE.Color(0x0b1026);
const DUSK_SKY = new THREE.Color(0xff7a3d); // amanecer/atardecer
// Fase 8 (B8): el sol es AMARILLO/cálido (antes blanco pálido 0xfff2d0) para
// distinguirlo de la luna, que es blanca/azulada (NIGHT_SUN).
const DAY_SUN = new THREE.Color(0xffe08a);
const NIGHT_SUN = new THREE.Color(0x9fb4d8); // tinte lunar
const skyColor = new THREE.Color(); // scratch reutilizado cada frame (evita allocs)

let dayTimeAtInit = 0;
let moonTimeAtInit = 0; // Fase 8 (B8): reloj de la luna (ciclo de 8 días)
let initWall = 0;
// Fase 10 (E3): el jugador está bajo el agua (lo avisa player.js cada frame).
// Con la cámara sumergida la niebla se vuelve azulada y muy cercana, como en
// Minecraft — oculta el lejano y da sensación de profundidad acuática.
let underwater = false;
export function setUnderwater(v) {
	underwater = !!v;
}

// Devuelve la fase actual del ciclo en [0, 1): 0 = amanecer, 0.25 = mediodía,
// 0.5 = atardecer, 0.75 = medianoche. La extrapolación desde el reloj del
// servidor evita mensajes periódicos y mantiene a todos los clientes en fase.
export function currentPhase() {
	const elapsed = performance.now() - initWall;
	return ((dayTimeAtInit + elapsed) % DAY_CYCLE_MS) / DAY_CYCLE_MS;
}

export function initDayNight(serverDayTime, serverMoonTime) {
	dayTimeAtInit = (serverDayTime || 0) % DAY_CYCLE_MS;
	// Fase 8 (B8): el servidor envía moonTime (0..MOON_CYCLE_MS-1, ya con el
	// offset de semilla aplicado) y se extrapola con el MISMO elapsed que el
	// día, así día y luna avanzan en fase aunque /time set los re-sincronice.
	moonTimeAtInit = (serverMoonTime || 0) % MOON_CYCLE_MS;
	initWall = performance.now();
}

// Fase lunar 0..1 extrapolada igual que currentPhase(): 0 = luna nueva,
// 0.25 = cuarto creciente, 0.5 = luna llena, 0.75 = menguante. Determinista
// por semilla (el offset ya viaja en moonTime) y en fase con el día.
export function currentMoonPhase() {
	const elapsed = performance.now() - initWall;
	return ((moonTimeAtInit + elapsed) % MOON_CYCLE_MS) / MOON_CYCLE_MS;
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
	// Fase 10 (E3): bajo el agua la niebla se sobreescribe con azul denso y
	// cercano (near 1/far 12) — el color acuático no depende del ciclo.
	if (scene.fog) {
		if (underwater) {
			scene.fog.color.set(0x1a4a7a);
			scene.fog.near = 0.5;
			scene.fog.far = 12;
		} else {
			scene.fog.color.copy(skyColor);
			scene.fog.near = 30 + dayFactor * 45; // 30 de noche → 75 al mediodía
			scene.fog.far = 70 + dayFactor * 130 + dusk * 40; // 70 de noche → ~240 de día
		}
	}

	// Fase 7: actualizar el dome del cielo (degradado, sol/luna, estrellas).
	// Fase 8 (B8): además se pasa la fase lunar para la máscara del disco.
	updateSky(phase, dayFactor, dusk, currentMoonPhase());
}
