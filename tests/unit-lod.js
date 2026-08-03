"use strict";
// ============================================================
// TESTS UNITARIOS DEL LOD DE CHUNKS LEJANOS (Fase 6)
// Cubre la lógica PURA de decisión de nivel de detalle
// (public/lod.js, módulo ESM sin THREE): distancias límite e
// histéresis — un chunk cerca de la frontera no debe alternar
// de tier de un frame a otro (parpadeo).
//
// Import del ESM: el proyecto es CommonJS, así que se copia el
// módulo a un .mjs temporal y se importa dinámicamente (mismo
// truco que la validación de sintaxis del cliente).
// ============================================================
const fs = require("fs");
const os = require("os");
const path = require("path");

let failed = 0;
const check = (name, ok, extra = "") => {
	if (!ok) failed++;
	console.log(`${ok ? "PASS" : "FAIL"}: ${name}${extra ? " — " + extra : ""}`);
};

(async () => {
	const src = path.join(__dirname, "..", "public", "lod.js");
	const tmp = path.join(os.tmpdir(), `unit-lod-${process.pid}.mjs`);
	fs.copyFileSync(src, tmp);
	const { LOD_ON_DIST, LOD_OFF_DIST, lodTierFor } = await import(
		"file://" + tmp
	);
	fs.unlinkSync(tmp);

	check(
		"distancia de entrada a LOD > distancia de salida (banda de histéresis)",
		LOD_ON_DIST > LOD_OFF_DIST,
		`${LOD_OFF_DIST}..${LOD_ON_DIST}`
	);

	// --- Básico ---
	check("cerca (0) con tier full → full", lodTierFor(0, "full") === "full");
	check("lejos (100) con tier full → lod", lodTierFor(100, "full") === "lod");
	check("chunk nuevo (sin tier previo) cerca → full", lodTierFor(0) === "full");
	check("chunk nuevo (sin tier previo) lejos → lod", lodTierFor(100) === "lod");

	// --- Frontera de entrada (full → lod) ---
	check(
		"exactamente LOD_ON_DIST desde full → full (no supera)",
		lodTierFor(LOD_ON_DIST, "full") === "full"
	);
	check(
		"LOD_ON_DIST + 0.1 desde full → lod",
		lodTierFor(LOD_ON_DIST + 0.1, "full") === "lod"
	);

	// --- Frontera de salida (lod → full) ---
	check(
		"exactamente LOD_OFF_DIST desde lod → lod (no baja)",
		lodTierFor(LOD_OFF_DIST, "lod") === "lod"
	);
	check(
		"LOD_OFF_DIST - 0.1 desde lod → full",
		lodTierFor(LOD_OFF_DIST - 0.1, "lod") === "full"
	);

	// --- Histéresis: en la banda se conserva el tier actual ---
	const mid = (LOD_ON_DIST + LOD_OFF_DIST) / 2;
	check(
		"en la banda (50% entre ambos) desde full → full",
		lodTierFor(mid, "full") === "full"
	);
	check(
		"en la banda (50% entre ambos) desde lod → lod",
		lodTierFor(mid, "lod") === "lod"
	);
	// Barrido completo DENTRO de la banda desde ambos tiers: 0 flips (nunca
	// alterna mientras el jugador se mueve sin cruzar un umbral).
	let tier = "full";
	let flips = 0;
	for (let d = LOD_ON_DIST; d >= LOD_OFF_DIST; d -= 0.5) {
		const next = lodTierFor(d, tier);
		if (next !== tier) {
			flips++;
			tier = next;
		}
	}
	check(
		"barrer la banda entera desde full: 0 flips",
		flips === 0,
		`${flips} flip(s)`
	);
	tier = "lod";
	flips = 0;
	for (let d = LOD_ON_DIST; d >= LOD_OFF_DIST; d -= 0.5) {
		const next = lodTierFor(d, tier);
		if (next !== tier) {
			flips++;
			tier = next;
		}
	}
	check(
		"barrer la banda entera desde lod: 0 flips",
		flips === 0,
		`${flips} flip(s)`
	);

	// --- Escenario realista de jugador ---
	// Acercándose a un chunk lejano (que ya es LOD): baja a detalle completo
	// UNA vez al cruzar LOD_OFF_DIST y nunca vuelve a LOD.
	tier = "lod";
	flips = 0;
	for (let d = 100; d >= 0; d -= 1) {
		const next = lodTierFor(d, tier);
		if (next !== tier) {
			flips++;
			tier = next;
		}
	}
	check(
		"acercándose a un chunk LOD: 1 flip (lod→full) y nunca vuelve",
		flips === 1 && tier === "full",
		`${flips} flip(s), tier=${tier}`
	);
	// Alejándose de un chunk cercano (que es full): sube a LOD UNA vez al
	// cruzar LOD_ON_DIST y nunca vuelve.
	tier = "full";
	flips = 0;
	for (let d = 0; d <= 100; d += 1) {
		const next = lodTierFor(d, tier);
		if (next !== tier) {
			flips++;
			tier = next;
		}
	}
	check(
		"alejándose de un chunk full: 1 flip (full→lod) y nunca vuelve",
		flips === 1 && tier === "lod",
		`${flips} flip(s), tier=${tier}`
	);

	console.log(
		failed === 0
			? "\n✅ Todos los tests pasan"
			: `\n❌ ${failed} check(s) fallaron`
	);
	process.exit(failed ? 1 : 0);
})();
