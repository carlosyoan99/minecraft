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

	// Sol: disco brillante + halo suave (umbral 0.997 ≈ disco de ~4°)
	float sunD = max(dot(dir, uSunDir), 0.0);
	float sunDisc = step(0.997, sunD);
	float sunHalo = pow(sunD, 6.0);
	col += uSunGlow * (sunDisc * vec3(1.0, 0.96, 0.85) * 1.6 + sunHalo * vec3(1.0, 0.8, 0.5) * 0.35);

	// Luna: disco pálido + halo tenue
	float moonD = max(dot(dir, uMoonDir), 0.0);
	float moonDisc = step(0.9992, moonD);
	float moonHalo = pow(moonD, 14.0);
	col += uMoonGlow * (moonDisc * vec3(0.92, 0.95, 1.0) * 1.3 + moonHalo * vec3(0.5, 0.6, 0.85) * 0.25);

	// Estrellas: solo en el hemisferio superior, por la noche
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
	uStars: { value: 0 }
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
export function updateSky(phase, dayFactor, dusk) {
	const { sun, moon } = celestialDirs(phase);
	uniforms.uSunDir.value.copy(sun);
	uniforms.uMoonDir.value.copy(moon);
	// El sol brilla de día (sol sobre el horizonte); la luna y las estrellas
	// de noche. dayFactor = max(0, sin) ya aproxima bien la altura del sol.
	uniforms.uSunGlow.value = dayFactor;
	uniforms.uMoonGlow.value = 1 - dayFactor;
	uniforms.uStars.value = (1 - dayFactor) * 0.9;
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
