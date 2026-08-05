// ============================================================
// AJUSTES DEL CLIENTE (Fase 7): persistidos en localStorage (mc_settings).
// renderDistance limita qué chunks se construyen (ver world.js) y se notifica
// al servidor (genera/reenvía los del radio). showCoords muestra las
// coordenadas en pantalla. FOV y sensibilidad se aplican a cámara/controles;
// volume* a las categorías de audio (audio.js) y quality al renderer
// (scene.js). updateCoords() se llama cada frame desde el bucle de animación.
// ============================================================
import { setVolume } from "./audio.js";
import { send } from "./connection.js";
import {
	clampFov,
	clampSensitivity,
	clampVolume,
	QUALITY_DEFAULT,
	QUALITY_PROFILES
} from "./quality.js";
import { applyQuality, controls, setFov } from "./scene.js";
import { setRenderDistance } from "./world.js";

const STORAGE_KEY = "mc_settings";
const DEFAULTS = {
	renderDistance: 6,
	showCoords: false,
	fov: 75,
	sensitivity: 1, // multiplicador de pointerSpeed (1 = por defecto)
	// Volumen maestro por defecto 0.8: coincide con la base histórica de
	// audio.js (MASTER_VOLUME) para no cambiar el volumen de los jugadores.
	volumeMaster: 0.8,
	volumeEffects: 1,
	volumeAmbient: 1,
	quality: QUALITY_DEFAULT
};

let settings = { ...DEFAULTS };
try {
	const raw = localStorage.getItem(STORAGE_KEY);
	if (raw) {
		const stored = JSON.parse(raw);
		// Saneo: quality desconocida cae al perfil por defecto (el select del
		// menú mostraría una opción incoherente si se dejara el valor inválido).
		if (stored.quality && !QUALITY_PROFILES[stored.quality])
			stored.quality = QUALITY_DEFAULT;
		settings = { ...DEFAULTS, ...stored };
	}
} catch {
	/* valores por defecto */
}

function save() {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		/* sin almacenamiento */
	}
}

export function getSettings() {
	return { ...settings };
}
export function getSetting(key) {
	return settings[key];
}

const coordsHud = document.getElementById("coords-hud");

function updateCoordsHudVisibility() {
	if (coordsHud) coordsHud.classList.toggle("hidden", !settings.showCoords);
}
updateCoordsHudVisibility();

// Cambia un ajuste, lo aplica y lo persiste. renderDistance además avisa al
// servidor para que genere/reenvíe los chunks del nuevo radio.
export function setSetting(key, value) {
	if (key === "renderDistance") {
		const rd = Math.min(10, Math.max(2, Math.round(value)));
		settings.renderDistance = rd;
		setRenderDistance(rd);
		send("settings", { renderDistance: rd });
	} else if (key === "showCoords") {
		settings.showCoords = !!value;
		updateCoordsHudVisibility();
	} else if (key === "fov") {
		settings.fov = clampFov(value);
		setFov(settings.fov);
	} else if (key === "sensitivity") {
		settings.sensitivity = clampSensitivity(value);
		controls.pointerSpeed = settings.sensitivity;
	} else if (key === "volumeMaster") {
		settings.volumeMaster = clampVolume(value);
		setVolume("master", settings.volumeMaster);
	} else if (key === "volumeEffects") {
		settings.volumeEffects = clampVolume(value);
		setVolume("effects", settings.volumeEffects);
	} else if (key === "volumeAmbient") {
		settings.volumeAmbient = clampVolume(value);
		setVolume("ambient", settings.volumeAmbient);
	} else if (key === "quality") {
		settings.quality = QUALITY_PROFILES[value] ? value : QUALITY_DEFAULT;
		applyQuality(settings.quality);
	}
	save();
}

// Se llama desde network.js al recibir el init (tras cargar el mundo): aplica
// los ajustes guardados — la distancia de render (descarta chunks sobrantes y
// sincroniza con el servidor) y el resto (FOV, sensibilidad, volumen,
// calidad), que se aplican en cuanto hay cámara/renderer/contexto de audio.
export function applyStoredSettings() {
	setRenderDistance(settings.renderDistance);
	updateCoordsHudVisibility();
	setFov(settings.fov);
	controls.pointerSpeed = settings.sensitivity;
	setVolume("master", settings.volumeMaster);
	setVolume("effects", settings.volumeEffects);
	setVolume("ambient", settings.volumeAmbient);
	applyQuality(settings.quality);
	send("settings", { renderDistance: settings.renderDistance });
}

// Devuelve el valor 'limpio' de un ajuste para la UI (p. ej. la sensibilidad
// en %: 1 → 100) sin mutar el estado guardado.
export function settingUiValue(key) {
	if (key === "sensitivity") return Math.round(settings.sensitivity * 100);
	if (
		key === "volumeMaster" ||
		key === "volumeEffects" ||
		key === "volumeAmbient"
	)
		return Math.round(settings[key] * 100);
	return settings[key];
}

// Dirección cardinal a partir del yaw (rotation.y de la cámara): yaw 0 = -Z
// (norte); girando +90° la cámara mira a -X (oeste), como en el mundo.
function compass(yaw) {
	const dirs = ["N", "NO", "O", "SO", "S", "SE", "E", "NE"];
	let a = yaw % (Math.PI * 2);
	if (a < 0) a += Math.PI * 2;
	return dirs[Math.round(a / (Math.PI / 4)) % 8];
}

// Se llama cada frame desde el bucle de animación; solo toca el DOM cuando la
// capa de coordenadas está visible (no hace nada en el caso normal).
export function updateCoords(x, y, z, yaw) {
	if (!settings.showCoords || !coordsHud) return;
	coordsHud.textContent = `XYZ ${x.toFixed(1)} / ${y.toFixed(1)} / ${z.toFixed(1)} · ${compass(yaw)}`;
}
