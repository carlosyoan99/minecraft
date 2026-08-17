// ============================================================
// TELEMETRÍA DE ERRORES DEL CLIENTE (Auditoría 2026-08-15, CL-6)
// Captura errores no controlados del lado del cliente (window.onerror +
// unhandledrejection) en una cola circular `window.__mcClientErrors`
// (para el F3 / la auditoría desde la consola) y los envía AL SERVIDOR de
// forma acotada (máx 5 por lote, y como mucho una vez cada 5 s) como
// `client_errors`. El servidor solo los loguea en JSON — la telemetría
// sirve para diagnosticar fallos que no se ven en el navegador del
// usuario (como el B2 de la F19.6: desconexión sin causa aparente).
// El envío es BEST-EFFORT: si la cola no está abierta o `send` falla, no
// se rompe nada; los errores siguen en __mcClientErrors para inspección
// local.
// ============================================================
import { socket } from "./connection.js";

const MAX_QUEUE = 50; // errores en memoria (cola circular)
const MAX_TEXT = 300; // por entrada (recorte antes de enviar)
const MAX_BATCH = 5; // errores por envío
const FLUSH_MS = 5000; // como mucho un envío cada 5 s (anti-spam)

const queue = [];
// Nº de entradas ya enviadas al servidor (la cola circular se conserva para
// el F3/auditoría; el envío solo avanza este puntero).
let sentIndex = 0;
let lastSentAt = 0;

function pushError(text) {
	const entry = { t: Date.now(), text: String(text || "").slice(0, MAX_TEXT) };
	queue.push(entry);
	if (queue.length > MAX_QUEUE) queue.shift();
	window.__mcClientErrors = queue;
}

// Normaliza el mensaje de error (Exception → stack/message, string crudo,
// objeto sin toString útil) a texto plano legible en el log del servidor.
function normalize(err) {
	if (err == null) return "error desconocido";
	if (typeof err === "string") return err;
	if (err instanceof Error)
		return `${err.message}${err.stack ? `\n${err.stack}` : ""}`;
	if (typeof err.message === "string") return err.message;
	try {
		return JSON.stringify(err);
	} catch {
		return Object.prototype.toString.call(err);
	}
}

window.addEventListener("error", (e) => {
	// e.error (Exception) es más rico que e.message; si no hay error real
	// (p. ej. un error de recurso), usamos message.
	pushError(e.error ? normalize(e.error) : normalize(e.message));
});

window.addEventListener("unhandledrejection", (e) => {
	// Una promesa rechazada sin handler: la causa suele estar en e.reason.
	pushError(`unhandledrejection: ${normalize(e.reason)}`);
});

// Envío acotado: se llama cada segundo (barato) pero solo envía si hay
// errores SIN enviar y pasaron FLUSH_MS desde el último envío.
setInterval(() => {
	if (!queue.length || socket.readyState !== WebSocket.OPEN) return;
	const now = Date.now();
	if (now - lastSentAt < FLUSH_MS) return;
	if (sentIndex > queue.length) sentIndex = queue.length; // rotó la cola
	const pending = queue.slice(sentIndex); // solo lo nuevo desde el último envío
	if (!pending.length) return;
	const batch = pending.slice(-MAX_BATCH); // los MAX_BATCH más recientes
	lastSentAt = now;
	sentIndex = queue.length;
	try {
		const data = batch.map((b) => ({ t: b.t, text: b.text }));
		socket.send(
			JSON.stringify({ event: "client_errors", data: { errors: data } })
		);
	} catch {
		/* best-effort: el envío no debe romper nada */
	}
}, 1000);
