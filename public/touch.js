// ============================================================
// CONTROLES TÁCTILES (Fase 17, D1): HUD adaptativo para móviles — joystick
// virtual (movimiento + sprint al fondo), arrastre a la derecha para mirar,
// y botones (agacharse, saltar, romper, usar, inventario, pausa). Mouse y
// teclado siguen siendo el camino principal; el servidor no se entera (todo
// se traduce a los mismos mensajes que mouse/teclado).
// Fase 18 (D-8): extraído de input.js; input.js es el despachador.
// ============================================================
import * as THREE from "three";
import { move } from "./player.js";
import { camera, renderer } from "./scene.js";
import {
	isPauseOpen,
	showPause,
	toggleInventory,
	togglePicker,
	getGamemode as uiGamemode
} from "./ui.js";

const touchControlsEl = document.getElementById("touch-controls");
const touchJoystick = document.getElementById("touch-joystick");
const touchStick = document.getElementById("touch-stick");
const touchLookEl = document.getElementById("touch-look");
const JOY_RADIUS = 46;
let joyId = null;
let joyBase = { x: 0, y: 0 };
let lookId = null;
let lastLook = { x: 0, y: 0 };
const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");

// Fase 17 (D1): en pantallas táctiles no hay pointer lock — el mousedown
// sintético de los botones táctiles debe funcionar igual (touchActive).
// Lo lee game-input.js (mousedown del canvas) con isTouchActive().
let touchActive = false;
export function isTouchActive() {
	return touchActive;
}

// ui.js lo avisa (evento mc-touch-visibility): al entrar al mundo se
// muestran en pantallas táctiles; en el menú se ocultan.
window.addEventListener("mc-touch-visibility", (e) =>
	setTouchControlsVisible(e.detail)
);

function setTouchControlsVisible(show) {
	if (!touchControlsEl) return;
	touchActive = !!show;
	touchControlsEl.classList.toggle("hidden", !show);
}

// Rotación de cámara equivalente a la del pointer lock (mismo euler YXZ y
// mismo clamp de ±90° que PointerLockControls), sin depender del lock.
function rotateCameraTouch(dx, dy) {
	lookEuler.setFromQuaternion(camera.quaternion);
	lookEuler.y -= dx * 0.0035;
	lookEuler.x -= dy * 0.0035;
	const lim = Math.PI / 2 - 0.01;
	lookEuler.x = Math.max(-lim, Math.min(lim, lookEuler.x));
	camera.quaternion.setFromEuler(lookEuler);
}

// Mueve el joystick (y mapea las direcciones al estado `move` de player.js).
function setJoystick(dx, dy) {
	const len = Math.hypot(dx, dy);
	const clamped = Math.min(len, JOY_RADIUS);
	const nx = clamped ? dx / len : 0;
	const ny = clamped ? dy / len : 0;
	if (touchStick)
		touchStick.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
	move.forward = ny < -0.3;
	move.back = ny > 0.3;
	move.left = nx < -0.3;
	move.right = nx > 0.3;
	move.sprint = ny < -0.85; // al fondo del joystick, correr
}

if (touchJoystick) {
	touchJoystick.addEventListener(
		"touchstart",
		(e) => {
			const t = e.changedTouches[0];
			joyId = t.identifier;
			joyBase = { x: t.clientX, y: t.clientY };
			setJoystick(0, 0);
			e.preventDefault();
		},
		{ passive: false }
	);
	touchJoystick.addEventListener(
		"touchmove",
		(e) => {
			for (const t of e.changedTouches) {
				if (t.identifier === joyId) {
					setJoystick(t.clientX - joyBase.x, t.clientY - joyBase.y);
					e.preventDefault();
				}
			}
		},
		{ passive: false }
	);
	const joyEnd = (e) => {
		for (const t of e.changedTouches) {
			if (t.identifier === joyId) {
				joyId = null;
				setJoystick(0, 0);
				e.preventDefault();
			}
		}
	};
	touchJoystick.addEventListener("touchend", joyEnd);
	touchJoystick.addEventListener("touchcancel", joyEnd);
}

if (touchLookEl) {
	touchLookEl.addEventListener(
		"touchstart",
		(e) => {
			const t = e.changedTouches[0];
			lookId = t.identifier;
			lastLook = { x: t.clientX, y: t.clientY };
			e.preventDefault();
		},
		{ passive: false }
	);
	touchLookEl.addEventListener(
		"touchmove",
		(e) => {
			for (const t of e.changedTouches) {
				if (t.identifier === lookId) {
					rotateCameraTouch(t.clientX - lastLook.x, t.clientY - lastLook.y);
					lastLook = { x: t.clientX, y: t.clientY };
					e.preventDefault();
				}
			}
		},
		{ passive: false }
	);
}

// Botón pulsado (mantener) para saltar/agacharse.
function bindTouchHold(el, on, off) {
	if (!el) return;
	el.addEventListener(
		"touchstart",
		(e) => {
			on();
			e.preventDefault();
		},
		{ passive: false }
	);
	el.addEventListener(
		"touchend",
		(e) => {
			off();
			e.preventDefault();
		},
		{ passive: false }
	);
	el.addEventListener(
		"touchcancel",
		(e) => {
			off();
			e.preventDefault();
		},
		{ passive: false }
	);
}
// Botón de golpe (tap): reutiliza el handler de mousedown del canvas
// despachando un MouseEvent sintético (misma lógica que el ratón real).
function syntheticMouse(button) {
	if (!touchActive) return;
	renderer.domElement.dispatchEvent(
		new MouseEvent("mousedown", {
			button,
			bubbles: true,
			cancelable: true,
			view: window
		})
	);
}
bindTouchHold(
	document.getElementById("touch-jump"),
	() => (move.jump = true),
	() => (move.jump = false)
);
bindTouchHold(
	document.getElementById("touch-sneak"),
	() => (move.sneak = true),
	() => (move.sneak = false)
);
bindTouchHold(
	document.getElementById("touch-break"),
	() => syntheticMouse(0),
	() => {}
);
bindTouchHold(
	document.getElementById("touch-use"),
	() => syntheticMouse(2),
	() => {}
);
bindTouchHold(
	document.getElementById("touch-inv"),
	() => {
		if (uiGamemode() === "creative") togglePicker();
		else toggleInventory();
	},
	() => {}
);
bindTouchHold(
	document.getElementById("touch-pause"),
	() => {
		if (touchActive && !isPauseOpen()) showPause();
	},
	() => {}
);
