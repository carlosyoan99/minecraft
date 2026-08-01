// ============================================================
// ESCENA, CÁMARA, RENDERER, LUCES Y CONTROLES
// ============================================================
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 40, 140);

export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
export const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

// Luces exportadas: daynight.js las ajusta cada frame según la fase del ciclo.
export const ambient = new THREE.AmbientLight(0x8899bb, 0.7);
export const sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
scene.add(ambient);
scene.add(sun);

export const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('blocker');
const startBtn = document.getElementById('start-btn');
startBtn.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => { blocker.style.display = 'none'; });
controls.addEventListener('unlock', () => { blocker.style.display = 'flex'; });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
