// ============================================================
// ESCENA, CÁMARA, RENDERER, LUCES Y CONTROLES
// ============================================================
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
// Fase 19.6 (B): estilo de material global (lambert ↔ toon).
import { applyMaterialStyle, setToon } from "./materialstyle.js";
import {
	QUALITY_DEFAULT,
	qualityPixelRatio,
	qualityProfile
} from "./quality.js";
// Fase 19.6 (A2): luz puntual de antorchas (presupuestada, OFF por defecto).
import { setTorchLight as torchLightSwitch } from "./torchlights.js";

// Re-export de los toggles de la F19.6 para settings.js (que importa de aquí
// como del resto de ajustes de render): el swap de estilo toon y la luz de
// antorcha se aplican sobre la ESCENA completa.
export function setToonStyle(on) {
	setToon(on);
	applyMaterialStyle(scene);
}
export function setTorchLight(on) {
	torchLightSwitch(on);
}
export { applyMaterialStyle };

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb);
scene.fog = new THREE.Fog(0x87ceeb, 40, 140);

export const camera = new THREE.PerspectiveCamera(
	75,
	window.innerWidth / window.innerHeight,
	0.1,
	300
);
// Fase 21.6 (F1): powerPreference "high-performance" — sugiere al navegador
// la GPU discreta (trivial, cero riesgo; recomendación de la auditoría
// 2026-08-22, notas del usuario).
export const renderer = new THREE.WebGLRenderer({
	antialias: true,
	powerPreference: "high-performance"
});
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// ============================================================
// CALIDAD GRÁFICA (Fase 7): el perfil controla el pixelRatio máximo
// (se multiplica por devicePixelRatio al aplicar), las sombras y la
// resolución del shadow map. Lo ajusta settings.js desde el menú.
// ============================================================
export function applyQuality(name) {
	const q = qualityProfile(name);
	// Fase 16 (B6): el perfil ESCALA la resolución nativa (dpr × renderScale) —
	// antes min(dpr, perfil) anulaba el efecto en pantallas dpr=1. setPixelRatio
	// ya redimensiona el canvas; no hace falta setSize aquí.
	renderer.setPixelRatio(qualityPixelRatio(name, window.devicePixelRatio));
	renderer.shadowMap.enabled = q.shadows;
	sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
	// Recalcular el frustum del shadow map al cambiar su tamaño
	sun.shadow.camera.updateProjectionMatrix();
}

// Campo de visión (Fase 7): lo aplica settings.js desde el menú.
export function setFov(fov) {
	camera.fov = fov;
	camera.updateProjectionMatrix();
}

// Luces exportadas: daynight.js las ajusta cada frame según la fase del ciclo.
export const ambient = new THREE.AmbientLight(0x8899bb, 0.7);
// Fase 19.6 (A1): HemisphereLight — gradiente cielo/suelo con costo casi
// nulo. Las caras que miran arriba reciben más luz del color de cielo y las
// que miran abajo más del suelo: da volumen al terreno al aire libre (el
// AmbientLight plano aplaneaba el relieve). Intensidad conservadora; si en
// la medición degradara >2%, se reduce (ver spec, Bloque A).
export const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x8a7a5a, 0.4);
export const sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60;
sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60;
sun.shadow.camera.bottom = -60;
scene.add(ambient);
scene.add(hemi); // F19.6 (A1)
scene.add(sun);
// Auditoría 2026-08-09 (§3.4): las sombras siguen al jugador. El target del
// sol estaba en el origen y el frustum del shadow map fijo en ±60: al
// explorar más allá de ~±60 bloques del spawn el volumen quedaba vacío y
// terreno/mobs dejaban de proyectar sombra. sun.target debe estar en la
// escena para poder arrastrarlo con la cámara (updateSunFollow, player.js).
scene.add(sun.target);

// Perfil por defecto al arrancar (después de declarar las luces: applyQuality
// accede a sun.shadow; antes de esta línea estaría en la zona muerta temporal).
applyQuality(QUALITY_DEFAULT);

// Fase 11 (D2): el elemento bloqueado es el CANVAS, no document.body.
// CAUSA RAÍZ del "clic que no hace nada" (minar/colocar/atacar/cofres): con
// PointerLockControls sobre body, al activarse el pointer lock el navegador
// dirige TODOS los eventos de ratón (mousedown/mouseup/pointermove) al
// elemento que tiene el lock (body) — pero input.js escucha en
// renderer.domElement (el canvas), que nunca los recibía durante el juego.
// Bloquear el canvas es el patrón canónico de three.js (los eventos van a él
// mientras el lock está activo) y hace que los listeners de input.js se
// disparen. Confirmado con auditoría CDP: clic → target BODY antes, target
// CANVAS después.
export const controls = new PointerLockControls(camera, renderer.domElement);
// Fase 11 (A2): NO añadir clamp de pitch manual. PointerLockControls r160 ya
// limita la rotación vertical a ±90° internamente (euler YXZ) en onMouseMove;
// un clamp externo que escriba camera.rotation.x (Euler XYZ del Object3D)
// DESINCRONIZA la orientación cuando el yaw no es 0 → la cámara "da vueltas"
// al mirar (bug reportado en Fase 10). El control nativo es suficiente.

const blocker = document.getElementById("blocker");
// Fondo del menú (cielo con nubes, z-index 1 sobre el canvas). Es un hermano
// del bloqueador: ocultarlo SOLO con el bloqueador no basta, porque en la
// pausa el bloqueador es translúcido y el juego debe seguir viéndose detrás.
// Por eso se controla aparte: visible SOLO en el menú principal (menus.js
// llama a showMenuBg desde showMenu/onWorldLoaded/onSeedRejected). Bug del
// usuario: "#menu-bg no se oculta al iniciar una partida" (Notas del usuario).
const menuBg = document.getElementById("menu-bg");
const craftingUI = document.getElementById("crafting-ui");
const furnaceUI = document.getElementById("furnace-ui");
const chestUI = document.getElementById("chest-ui");
const chatInputEl = document.getElementById("chat-input");
// El botón Jugar lo maneja ui.js (flujo de semilla Fase 6: set_seed + lock)
controls.addEventListener("lock", () => {
	blocker.style.display = "none";
});
controls.addEventListener("unlock", () => {
	// El menú (bloqueador) solo reaparece si NO hay un panel abierto
	// (inventario/crafteo, horno o chat): esos paneles liberan el puntero para
	// poder clicar sus slots, y el menú (z-index 300) los tapa (z-index 200/90)
	// — ese era el bug del "mouse bloqueado" en el inventario.
	const uiOpen =
		!craftingUI.classList.contains("hidden") ||
		!furnaceUI.classList.contains("hidden") ||
		!chestUI.classList.contains("hidden") ||
		chatInputEl.classList.contains("active");
	blocker.style.display = uiOpen ? "none" : "flex";
});
// Ocultar/mostrar el menú explícitamente: los paneles lo llaman al abrirse
// (sin depender de que el evento 'unlock' llegue, p. ej. si el lock falla).
export function showBlocker(show) {
	blocker.style.display = show ? "flex" : "none";
}
// Fondo del menú: SOLO en el menú principal (main menu). No se liga a
// showBlocker porque la pausa usa el bloqueador translúcido y ahí el fondo
// no debe tapar el juego congelado detrás.
export function showMenuBg(show) {
	if (menuBg) menuBg.style.display = show ? "block" : "none";
}

window.addEventListener("resize", () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});
