"use strict";
// ============================================================
// LOG DEL SERVIDOR (Fase 19.5, E2)
// Convención de niveles uniforme sin dependencia de logging:
//   info  → console.log   (operación normal: arranque, guardados, conexiones)
//   warn  → console.warn  (situación recuperable: backup fallido, mundo raro)
//   error → console.error (fallo real: carga/guardado, mainLoop, excepción)
// Prefijo uniforme [info]/[warn]/[error] para filtrar por nivel (grep) y
// saber el origen de cada línea. Los resúmenes que parsea tests/run.js se
// imprimen desde los TESTS, no desde el servidor — los prefijos no rompen
// nada (el e2e-menu acumula el log del servidor solo como diagnóstico).
// ============================================================

// biome-ignore lint/suspicious/noConsole: el wrapper ES la excepción
// central de la convención (los consumidores usan log.*, no console.*).
function info(...args) {
	console.log("[info]", ...args);
}

// biome-ignore lint/suspicious/noConsole: idem (warn)
function warn(...args) {
	console.warn("[warn]", ...args);
}

// biome-ignore lint/suspicious/noConsole: idem (error)
function error(...args) {
	console.error("[error]", ...args);
}

module.exports = { info, warn, error };
