// ============================================================
// CIELO PROCEDURAL (Fase 7, estética Minecraft)
// Esfera gigante (BackSide) con un ShaderMaterial que pinta:
//  - degradado vertical cenit → horizonte (colores de skycolors.js)
//  - banda cálida cerca del horizonte en amanecer/atardecer
//  - sol (disco + halo) y luna (disco pálido + halo), opuestos en el
//    cielo según la fase del ciclo
//  - estrellas de noche (hash determinista por dirección, sin assets)
// El dome sigue a la cámara cada frame (posición = cámara) y NO se ve
// afectado por la niebla (fog: false), así el horizonte del mundo se
// desvanece hacia un cielo nítido. updateSky() lo llama daynight.js
// cada frame con la fase calculada.
// ============================================================
import * as THREE from "three";
import { camera, scene } from "./scene.js";
import { skyPalette } from "./skycolors.js";

const SKY_VERT = `
varying vec3 vDir;
void main() {
	// Dirección del vértice desde el centro de la esfera (normalizada)
	vDir = normalize(position);
	gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const SKY_FRAG = `
varying vec3 vDir;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uDuskTint;
uniform float uDusk;      // 0..1 fuerza del amanecer/atardecer
uniform vec3 uSunDir;     // dirección normalizada del sol
uniform vec3 uMoonDir;    // dirección normalizada de la luna
uniform float uSunGlow;   // 0..1 brillo del sol (día)
uniform float uMoonGlow;  // 0..1 brillo de la luna (noche)
uniform float uStars;     // 0..1 intensidad de las estrellas
uniform float uMoonPhase; // 0 nueva … 0.5 llena … 1 nueva (Fase 8, B8)

// Hash determinista por dirección (estrellas sin assets, estables entre frames)
float hash3(vec3 p) {
	p = fract(p * 0.1031);
	p += dot(p, p.zyx + 31.32);
	return fract((p.x + p.y) * p.z);
}

void main() {
	vec3 dir = normalize(vDir);

	// Degradado vertical: cenit arriba, horizonte abajo
	float h = clamp(dir.y, 0.0, 1.0);
	vec3 col = mix(uHorizon, uTop, pow(h, 0.55));

	// Banda cálida del amanecer/atardecer cerca del horizonte
	float band = pow(1.0 - abs(dir.y), 2.2);
	col = mix(col, uDuskTint, uDusk * band * 0.9);

	// Sol (Fase 8, B8): disco AMARILLO cálido + halo dorado (antes blanco
	// pálido 1.0, 0.96, 0.85 — se confundía con la luna). Umbral 0.997 ≈ 4°.
	float sunD = max(dot(dir, uSunDir), 0.0);
	float sunDisc = step(0.997, sunD);
	float sunHalo = pow(sunD, 6.0);
	col += uSunGlow * (sunDisc * vec3(1.0, 0.86, 0.45) * 1.6 + sunHalo * vec3(1.0, 0.7, 0.3) * 0.35);

	// Luna (Fase 8, B8): disco BLANCO/azulado con FASES — el terminador
	// (límite iluminado) barre el disco según uMoonPhase: 0 nueva (nada
	// iluminado), 0.5 llena (todo), creciente/menguante entre medias. La
	// parte "de noche" del disco se pinta azul oscuro (no transparente).
	float moonD = max(dot(dir, uMoonDir), 0.0);
	float moonDisc = step(0.9992, moonD);
	float moonHalo = pow(moonD, 14.0);
	// Dirección lateral de la luna (perpendicular a la vertical) para saber
	// en qué mitad del disco está cada píxel del dome.
	vec3 moonSide = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
	float xRel = dot(dir, moonSide); // -1 borde izq … +1 borde der
	float litEdge = cos(uMoonPhase * 6.2831853); // +1 (nueva) … -1 (llena)
	float lit = step(litEdge, xRel); // 1 en la zona iluminada del disco
	col += uMoonGlow * (moonDisc * (lit * 0.85 + 0.15)) * vec3(0.94, 0.96, 1.0) * 1.3;
	col += uMoonGlow * moonDisc * (1.0 - lit) * vec3(0.15, 0.18, 0.3) * 0.5; // parte oscura
	col += uMoonGlow * moonHalo * vec3(0.5, 0.6, 0.85) * 0.25;

	// Estrellas (Fase 8, B7): SOLO cuando el sol está bajo el horizonte — el
	// cliente manda uStars = 0 en cuanto el sol asoma (ni amanecer/atardecer),
	// así que el hemisferio superior basta para el techo nocturno.
	float star = 0.0;
	if (uStars > 0.01 && dir.y > 0.05) {
		// Celdas de dirección: cada una con un punto brillante si su hash pasa el umbral
		float cell = hash3(floor(dir * 260.0));
		star = step(0.9955, cell) * 0.9;
	}
	col += uStars * star;

	gl_FragColor = vec4(col, 1.0);
}
`;

// Uniforms con valores por defecto (día claro); daynight.js los actualiza.
const uniforms = {
	uTop: { value: new THREE.Color(0x3d7fd4) },
	uHorizon: { value: new THREE.Color(0x87ceeb) },
	uDuskTint: { value: new THREE.Color(0xff7a3d) },
	uDusk: { value: 0 },
	uSunDir: { value: new THREE.Vector3(0, 1, 0) },
	uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
	uSunGlow: { value: 1 },
	uMoonGlow: { value: 0 },
	uStars: { value: 0 },
	uMoonPhase: { value: 0.25 } // Fase 8 (B8): cuarto creciente por defecto
};

const skyGeo = new THREE.SphereGeometry(280, 32, 20);
const skyMat = new THREE.ShaderMaterial({
	vertexShader: SKY_VERT,
	fragmentShader: SKY_FRAG,
	uniforms,
	side: THREE.BackSide,
	depthWrite: false,
	fog: false // el cielo nunca se tiñe de niebla: el mundo se desvanece hacia él
});
const skyMesh = new THREE.Mesh(skyGeo, skyMat);
skyMesh.frustumCulled = false; // la esfera rodea la cámara: siempre visible
skyMesh.renderOrder = -10; // detrás de todo
scene.add(skyMesh);

// Posiciones del sol y la luna en el cielo según la fase (0 = amanecer,
// 0.25 = mediodía, 0.5 = atardecer, 0.75 = medianoche). El sol da una
// vuelta completa; la luna va opuesta (180°), así que cuando el sol se
// pone, la luna sale por el otro lado. Scratch vectors reutilizados
// (evita allocs por frame, como skyColor en daynight.js).
const sunScratch = new THREE.Vector3();
const moonScratch = new THREE.Vector3();
function celestialDirs(phase) {
	const a = phase * Math.PI * 2;
	sunScratch.set(Math.cos(a), Math.sin(a), 0).normalize();
	moonScratch.copy(sunScratch).negate();
	return { sun: sunScratch, moon: moonScratch };
}

// Se llama cada frame desde daynight.js. dayFactor y dusk son los mismos
// que usa la iluminación, así que cielo, luz y niebla van en fase.
export function updateSky(phase, dayFactor, dusk, moonPhase = 0.25) {
	const { sun, moon } = celestialDirs(phase);
	uniforms.uSunDir.value.copy(sun);
	uniforms.uMoonDir.value.copy(moon);
	// El sol brilla de día (sol sobre el horizonte); la luna y las estrellas
	// de noche. dayFactor = max(0, sin) ya aproxima bien la altura del sol.
	uniforms.uSunGlow.value = dayFactor;
	uniforms.uMoonGlow.value = 1 - dayFactor;
	// Fase 8 (B7): estrellas SOLO cuando el sol está BAJO el horizonte. Antes
	// uStars = (1-dayFactor)*0.9 dejaba estrellas de día y en amanecer/
	// atardecer. Ahora usamos la altura vertical real del sol (sun.y = sin):
	// 0 estrellas en cuanto el sol está sobre el horizonte, con un fade corto
	// (0.12 rad ≈ 7°) para que la aparición nocturna no parpadee.
	const fade = 0.12;
	uniforms.uStars.value =
		THREE.MathUtils.clamp((-sun.y - 0.02) / fade, 0, 1) * 0.9;
	uniforms.uMoonPhase.value = moonPhase; // Fase 8 (B8): máscara del disco
	uniforms.uDusk.value = dusk;

	// Colores del degradado según la hora (paleta pura de skycolors.js)
	const pal = skyPalette(dayFactor, dusk);
	uniforms.uTop.value.setRGB(pal.top.r / 255, pal.top.g / 255, pal.top.b / 255);
	uniforms.uHorizon.value.setRGB(
		pal.horizon.r / 255,
		pal.horizon.g / 255,
		pal.horizon.b / 255
	);
	uniforms.uDuskTint.value.setRGB(
		pal.duskTint.r / 255,
		pal.duskTint.g / 255,
		pal.duskTint.b / 255
	);

	// El dome sigue a la cámara (centro siempre en el jugador)
	skyMesh.position.copy(camera.position);
}
