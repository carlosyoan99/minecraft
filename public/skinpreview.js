// ============================================================
// VISTA PREVIA 3D DEL PERSONAJE EN EL MENÚ (Fase 17)
// Muestra el humanoide del jugador (makeHumanoid de mobs.js) con la
// skin elegida, girando lentamente sobre sí mismo. Renderer propio
// (canvas independiente del juego, fondo transparente para dejar ver
// el cielo del menú): no toca la escena ni el renderer del juego.
//
// La vista previa es un extra visual del selector: si WebGL no está
// disponible se omite (try/catch) y el selector 2D sigue funcionando.
// El bucle solo renderiza cuando la pantalla principal del menú está
// visible y la pestaña no está oculta (batería).
// ============================================================
import * as THREE from "three";
import { defaultSkin } from "./connection.js";
import { makeHumanoid } from "./mobs.js";
import { isValidSkin } from "./skins.js";

const WIDTH = 132; // tamaño del viewport (CSS lo escala en móvil)
const HEIGHT = 164;

let renderer = null;
let scene = null;
let camera = null;
let figure = null; // humanoide actual (con la skin seleccionada)
let clock = null;
const menuMain = document.getElementById("menu-main");

// Sombra suave bajo los pies: textura de gradiente radial (sin assets).
function makeShadow() {
	const c = document.createElement("canvas");
	c.width = c.height = 128;
	const g = c.getContext("2d");
	const grad = g.createRadialGradient(64, 64, 6, 64, 64, 60);
	grad.addColorStop(0, "rgba(0,0,0,0.45)");
	grad.addColorStop(0.6, "rgba(0,0,0,0.22)");
	grad.addColorStop(1, "rgba(0,0,0,0)");
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	const tex = new THREE.CanvasTexture(c);
	const shadow = new THREE.Mesh(
		new THREE.PlaneGeometry(1.7, 1.7),
		new THREE.MeshBasicMaterial({
			map: tex,
			transparent: true,
			depthWrite: false
		})
	);
	shadow.rotation.x = -Math.PI / 2;
	shadow.position.y = 0.02;
	return shadow;
}

// Libera el humanoide anterior: geometrías por parte, el Lambert compartido
// y su mapa (el atlas de skin se crea NUEVO por figura en makeHumanoid).
function disposeFigure(old) {
	if (!old) return;
	old.traverse((o) => {
		if (o.geometry) o.geometry.dispose();
	});
	const mat = old.userData?.material;
	if (mat) {
		if (mat.map?.dispose) mat.map.dispose();
		mat.dispose();
	}
}

function buildFigure(skinId) {
	const group = makeHumanoid(skinId);
	// Mirando al frente (rotación en Y arranca en 0): la cara se ve al inicio.
	group.position.y = 0;
	return group;
}

function loop() {
	requestAnimationFrame(loop);
	// No gastar GPU cuando el menú principal no está visible ni en pestaña
	// oculta (la vista previa solo vive en esa pantalla).
	if (document.hidden) return;
	if (!menuMain || menuMain.classList.contains("hidden")) return;
	const dt = Math.min(clock.getDelta(), 0.1);
	// Giro continuo + respiración sutil (bob).
	figure.rotation.y += dt * 0.65;
	figure.position.y = Math.sin(performance.now() / 750) * 0.022;
	renderer.render(scene, camera);
}

// Inicializa el viewport (una vez, al cargar el cliente) con la skin
// guardada del jugador. Devuelve false si WebGL no está disponible.
export function initSkinPreview() {
	const host = document.getElementById("skin-preview");
	if (!host) return false;
	try {
		renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
	} catch {
		return false; // sin WebGL: el selector 2D sigue funcionando
	}
	renderer.setSize(WIDTH, HEIGHT);
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.setClearColor(0x000000, 0); // transparente: se ve el menú
	host.appendChild(renderer.domElement);

	scene = new THREE.Scene();
	camera = new THREE.PerspectiveCamera(38, WIDTH / HEIGHT, 0.1, 20);
	camera.position.set(0, 1.35, 3.05);
	camera.lookAt(0, 1.0, 0);
	// Luces suaves para que el Lambert del humanoide sombree (estética MC).
	scene.add(new THREE.AmbientLight(0xffffff, 0.65));
	const key = new THREE.DirectionalLight(0xffffff, 1.1);
	key.position.set(1.6, 2.6, 2.2);
	scene.add(key);
	scene.add(makeShadow());

	figure = buildFigure(defaultSkin());
	scene.add(figure);
	clock = new THREE.Clock();
	loop();
	return true;
}

// Cambia la skin de la figura en vivo (la llama ui.js al seleccionar).
export function setPreviewSkin(skinId) {
	if (!renderer || !isValidSkin(skinId) || skinId === figure.userData.skin)
		return;
	scene.remove(figure);
	disposeFigure(figure);
	figure = buildFigure(skinId);
	scene.add(figure);
}
