"use strict";
// ============================================================
// LOG DEL SERVIDOR (Fase 19.5, E2)
// Convención de niveles uniforme sin dependencia de logging:
//   info  → console.log   (operación normal: arranque, guardados, conexiones)
//   warn  → console.warn  (situación recuperable: backup fallido, mundo raro)
//   error → console.error (fallo real: carga/guardado, mainLoop, excepción)
// Prefijo uniforme [info]/[warn]/[error] para filtrar por nivel (grep) y
// saber el origen de cada línea. Auditoría 2026-08-15 (F6): cada línea lleva
// timestamp [HH:MM:SS] para correlacionar eventos en logs largos. F8: la env
// LOG_LEVEL (error|warn|info) filtra la salida; los mensajes de nivel menor
// al umbral se descartan. El prefijo de cada nivel NO cambia (lo preserva
// tests/run.js y el e2e-menu que acumula el log del servidor como
// diagnóstico). Los resúmenes que parsea tests/run.js se imprimen desde los
// TESTS, no desde el servidor — los prefijos no rompen nada.
// ============================================================

function ts() {
	const d = new Date();
	const p = (n) => String(n).padStart(2, "0");
	return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const LEVELS = { error: 0, warn: 1, info: 2 };
const THRESHOLD = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ?? 2;

// biome-ignore lint/suspicious/noConsole: el wrapper ES la excepción
// central de la convención (los consumidores usan log.*, no console.*).
function info(...args) {
	if (THRESHOLD < LEVELS.info) return;
	console.log(`[info] [${ts()}]`, ...args);
}

// biome-ignore lint/suspicious/noConsole: idem (warn)
function warn(...args) {
	if (THRESHOLD < LEVELS.warn) return;
	console.warn(`[warn] [${ts()}]`, ...args);
}

// biome-ignore lint/suspicious/noConsole: idem (error)
function error(...args) {
	if (THRESHOLD < LEVELS.error) return;
	console.error(`[error] [${ts()}]`, ...args);
}

module.exports = { info, warn, error };
