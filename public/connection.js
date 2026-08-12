// ============================================================
// CONEXIÓN WEBSOCKET (socket + envío de mensajes)
// ============================================================
import { setProgress, setStatus, showConnectionError } from "./loading.js";
import { isValidSkin } from "./skins.js";

const wsProtocol = location.protocol === "https:" ? "wss" : "ws";

// Fase 7: el nombre del jugador viaja en la URL del WebSocket (?name=). El
// servidor es la fuente de verdad (lo sanea) y responde con el nombre en init.
// Se persiste en localStorage para reutilizarlo entre sesiones y en el menú.
export function defaultName() {
	let name = localStorage.getItem("mc_name");
	if (!name) {
		name = `Jugador-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
		localStorage.setItem("mc_name", name);
	}
	return name;
}

export function setStoredName(name) {
	localStorage.setItem("mc_name", name);
}

// Skin del jugador (Fase 17): preferencia del CLIENTE persistida en
// localStorage (mc_skin), como el nombre. Viaja en la URL del WebSocket
// (?skin=) y el servidor la valida contra su lista oficial; el selector del
// menú (ui.js) también la envía con set_skin al cambiar.
const SKIN_KEY = "mc_skin";
export function defaultSkin() {
	let s = localStorage.getItem(SKIN_KEY);
	if (!isValidSkin(s)) {
		s = "steve";
		localStorage.setItem(SKIN_KEY, s);
	}
	return s;
}

export function setStoredSkin(skin) {
	if (isValidSkin(skin)) localStorage.setItem(SKIN_KEY, skin);
}

export const socket = new WebSocket(
	`${wsProtocol}://${location.host}/?name=${encodeURIComponent(defaultName())}&skin=${defaultSkin()}`
);

export function send(event, data = {}) {
	if (socket.readyState === WebSocket.OPEN)
		socket.send(JSON.stringify({ event, data }));
}

socket.addEventListener("open", () => {
	// La pantalla de carga ya está visible (import de loading.js); aquí solo
	// se actualiza el estado: el 100% lo pone network.js cuando llega el init.
	setProgress(18);
	setStatus("Conectado — generando el mundo...");
});
socket.addEventListener("close", () => {
	showConnectionError();
});
