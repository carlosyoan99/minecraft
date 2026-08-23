// @ts-check
"use strict";
// ============================================================
// RATE-LIMIT POR CONEXIÓN (auditoría 2026-08-09 §3.1 + F19.6 B2 + F20 v20.2)
// Ventana de 1 s por contador; devuelve «cerrar» SOLO cuando el límite se
// supera en DOS ventanas consecutivas (la 2ª en curso).
//
// Por qué consecutivas: el rate se mide por el tiempo de PROCESAMIENTO del
// servidor, no por el de llegada. Cuando el event loop se bloquea de forma
// síncrona (p. ej. la carga de un mundo en join_world: switchWorld →
// loadWorld/saveWorld), los mensajes legítimos del cliente (moves a 20 Hz)
// se acumulan en el buffer TCP y, al terminar el bloqueo, se procesan en
// una RÁFAGA dentro de la misma ventana de 1 s — un cliente normal parecía
// un flood y el servidor cerraba 1008 «demasiados mensajes» justo al
// terminar de cargar el mundo (bug de `Notas del usuario.md`, F19.6 B2
// reportado como no resuelto). Un flood REAL es SOSTENIDO (supera el límite
// ventana tras ventana); una ráfaga legítima es UNA sola ventana. Exigir la
// 2ª ventana consecutiva distingue ambos casos sin debilitar la protección:
// un bot que inunde a 100 msg/s se corta a ~1 s con ~130 mensajes, trivial
// para el servidor.
// ============================================================
const WINDOW_MS = 1000;

// Crea un contador de rate-limit independiente (uno por conexión y por
// clase: mensajes globales y acciones). `hit()` registra un mensaje y
// devuelve true solo si hay que CERRAR la conexión (flood sostenido: la
// ventana ANTERIOR superó el límite y la actual también lo está superando).
function createRateLimit(limit) {
	let windowStart = 0;
	let count = 0;
	let prevWindowViolated = false;
	return {
		hit(now = Date.now()) {
			// ¿Terminó la ventana anterior? (primera llamada o ≥1 s después)
			if (!windowStart || now - windowStart >= WINDOW_MS) {
				// La ventana que acaba de terminar se convierte en «anterior».
				prevWindowViolated = count > limit;
				windowStart = now;
				count = 0;
			}
			count++;
			// Flood sostenido: la ventana anterior ya superó el límite y la
			// actual vuelve a superarlo. Una ráfaga única (la anterior NO
			// violó) nunca llega aquí.
			if (count > limit && prevWindowViolated) return true;
			return false;
		}
	};
}

module.exports = { createRateLimit, WINDOW_MS };
