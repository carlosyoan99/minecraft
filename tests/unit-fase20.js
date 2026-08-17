"use strict";
// ============================================================
// TESTS DE LA FASE 20 (v20.1) — regresión del bug «#menu-bg no se
// oculta al iniciar una partida» (Notas del usuario).
// El fondo del menú (cielo con nubes, `#menu-bg`, z-index 1 sobre el
// canvas) se mostraba SIEMPRE: solo se ocultaba `#blocker` (z-index
// 300) al entrar al juego, así que al terminar la carga el degradado
// tapaba el mundo. El fix añade `showMenuBg()` en scene.js y lo cablea
// en menus.js: visible SOLO en el menú principal (showMenu), oculto al
// entrar al mundo (onWorldLoaded) y visible de nuevo al volver al menú
// (onSeedRejected). La pausa NO lo muestra (el bloqueador translúcido
// debe dejar ver el juego congelado detrás).
// Es un test de regresión a nivel de fuente (los flujos del menú son
// DOM/navegador; el patrón del proyecto para eso es unit-camara.js):
//  1. scene.js exporta showMenuBg y lo define junto a showBlocker,
//  2. menus.js lo importa y lo usa en showMenu / onWorldLoaded /
//     onSeedRejected,
//  3. la pausa (showPause) NO lo llama (el fondo no debe tapar el
//     juego durante la pausa).
// ============================================================
const fs = require("node:fs");
const path = require("node:path");

let failed = 0;
const failedChecks = [];
function check(name, ok, detail) {
	if (ok) return;
	failed++;
	failedChecks.push(`${name}${detail ? ` — ${detail}` : ""}`);
	console.error(`✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

const sceneSrc = fs.readFileSync(
	path.join(__dirname, "..", "public", "scene.js"),
	"utf8"
);
const menusSrc = fs.readFileSync(
	path.join(__dirname, "..", "public", "menus.js"),
	"utf8"
);

// ── 1) scene.js: showMenuBg exportado y ligado al elemento #menu-bg ──
check(
	"1. scene.js define showMenuBg (export)",
	/export\s+function\s+showMenuBg/.test(sceneSrc)
);
check(
	"1. showMenuBg referencia el elemento #menu-bg",
	/menuBg\s*=\s*document\.getElementById\(["']menu-bg["']\)/.test(sceneSrc)
);

// ── 2) menus.js: import + uso en los tres puntos del flujo ──
check(
	"2. menus.js importa showMenuBg",
	/import\s*\{[^}]*showMenuBg[^}]*\}\s*from\s*["']\.\/scene\.js["']/.test(
		menusSrc
	)
);
// showMenu → mostrar fondo (menú principal).
check(
	"2. showMenu llama showMenuBg(true)",
	/showMenu\([\s\S]{0,400}?showMenuBg\(true\)/.test(menusSrc)
);
// onWorldLoaded → ocultar fondo (el mundo ya está visible).
check(
	"2. onWorldLoaded llama showMenuBg(false)",
	/onWorldLoaded\([\s\S]{0,400}?showMenuBg\(false\)/.test(menusSrc)
);
// onSeedRejected → volver al menú muestra el fondo.
check(
	"2. onSeedRejected llama showMenuBg(true)",
	/onSeedRejected\([\s\S]{0,400}?showMenuBg\(true\)/.test(menusSrc)
);

// ── 3) pausa: NO debe mostrar el fondo (juego visible tras el overlay) ──
const pauseBlock = menusSrc.slice(
	menusSrc.indexOf("export function showPause"),
	menusSrc.indexOf("export function resumeGame")
);
check(
	"3. showPause NO llama showMenuBg (la pausa deja ver el juego)",
	!/showMenuBg/.test(pauseBlock),
	pauseBlock.includes("showMenuBg") ? "showPause contiene showMenuBg" : ""
);

console.log(failed ? `\n${failed} check(s) FALLARON` : "\nTODO OK");
process.exit(failed ? 1 : 0);
