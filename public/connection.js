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

// Auditoría 2026-08-15 (CL-1): reconexión con backoff. Antes la conexión era
// un único WebSocket: cualquier corte (reinicio del menú, caída breve de red,
// el servidor reiniciando) dejaba el cliente en pantalla de error hasta el
// F5. Ahora `socket` es un wrapper EventTarget que envuelve el WebSocket real
// y re-despacha sus eventos; al cerrarse, se reintenta con backoff exponencial
// (1 s → 2 s → 4 s → ... tope 30 s), de forma que network.js (que registra
// `addEventListener` sobre este objeto al cargar) sigue funcionando sin
// cambios. Cada reconexión vuelve a emitir `open`; el servidor reenvía el
// `init` que resetea el cliente.
const HOST_URL = () =>
	`${wsProtocol}://${location.host}/?name=${encodeURIComponent(defaultName())}&skin=${defaultSkin()}`;

class SocketWrapper extends EventTarget {
	constructor() {
		super();
		this.attempt = 0;
		this._connect();
	}

	_connect() {
		const ws = new WebSocket(HOST_URL());
		this.ws = ws;
		ws.addEventListener("open", () => {
			this.attempt = 0; // reconexión establecida: reiniciar backoff
			setProgress(18);
			setStatus("Conectado — generando el mundo...");
			this.dispatchEvent(new Event("open"));
		});
		// El socket real re-despacha message/close/error sobre el wrapper
		// (network.js escucha `socket` una sola vez al cargar).
		ws.addEventListener("message", (e) =>
			this.dispatchEvent(new MessageEvent("message", { data: e.data }))
		);
		ws.addEventListener("error", () => {});
		ws.addEventListener("close", (e) => {
			if (e.code === 4001) {
				// Nombre en uso (M3, auditoría): NO reconectar en bucle — el
				// problema es el nombre, no la red; el usuario debe elegir otro.
				showConnectionError();
				return;
			}
			this.dispatchEvent(new Event("close"));
			const delay = Math.min(30000, 1000 * 2 ** this.attempt++);
			setStatus("Reconectando... (el servidor se reinició)");
			this.timer = setTimeout(() => this._connect(), delay);
		});
	}

	send(data) {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(data);
	}

	get readyState() {
		return this.ws ? this.ws.readyState : WebSocket.CLOSED;
	}
}

export const socket = new SocketWrapper();

export function send(event, data = {}) {
	if (socket.readyState === WebSocket.OPEN)
		socket.send(JSON.stringify({ event, data }));
}

// CL-4: keepalive del cliente — envía un heartbeat cada 10 s para que el
// servidor sepa que la conexión sigue viva. Esto evita que el heartbeat
// del servidor (timers.js, 15 s) termine la conexión cuando el navegador
// throttlea los pong de WebSocket en pestañas de fondo (Chrome/Firefox
// reducen la frecuencia de timers a ~1 Hz tras ~5 min de inactividad).
// Además, al volver la pestaña a primer plano se envía un keepalive
// inmediato para cubrir la ventana en la que el tab estaba throttled.
const KEEPALIVE_MS = 10_000;
let keepaliveId = null;
function startKeepalive() {
	if (keepaliveId) return;
	keepaliveId = setInterval(() => {
		if (socket.readyState === WebSocket.OPEN) send("keepalive");
	}, KEEPALIVE_MS);
}
function stopKeepalive() {
	if (keepaliveId) {
		clearInterval(keepaliveId);
		keepaliveId = null;
	}
}
socket.addEventListener("open", () => startKeepalive());
socket.addEventListener("close", () => stopKeepalive());

// Al volver de background, enviar un keepalive inmediato para cubrir la
// ventana throttled (el tab estaba a ~1 Hz, los pong podían estar retrasados).
document.addEventListener("visibilitychange", () => {
	if (!document.hidden && socket.readyState === WebSocket.OPEN)
		send("keepalive");
});
