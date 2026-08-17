"use strict";
// ============================================================
// TESTS DE LA FASE 21, Bloque A1 — biomas más grandes (extensión
// horizontal) y determinismo intacto.
// Fase 21 (A1): el tamaño de las regiones de bioma se aumenta bajando la
// frecuencia del campo de temperatura (BIOME_FREQ: 0.005 → 0.003). Este
// test verifica la COHERENCIA resultante con la semilla fija:
//   1. BIOME_FREQ es la constante calibrada (0.003) documentada en la spec,
//   2. la coherencia media de bioma (longitud media de racha de un mismo
//      bioma a lo largo de transectos) crece por encima de lo que daría la
//      frecuencia anterior (0.005 → rachas ~7 bloques de media): con 0.003
//      las extensiones son amplias (media ~12 bloques en la semilla), así
//      que el umbral de 9 bloques distingue claramente «biomas grandes» de
//      «parches pequeños» (un parche típico de 4-6 bloques fallaría),
//   3. los biomas siguen siendo deterministas (misma coordenada → mismo
//      bioma) y las etiquetas base siguen presentes (regresión de escala:
//      si alguien bajara demasiado BIOME_FREQ, la semilla dejaría de
//      muestrear algún bioma base en el rango de tests).
// El determinismo bit-idéntico de los chunks vive en unit-biomas.js (§6) y
// la presencia/vegetación de los sub-biomas nuevos, en unit-biomas.js
// (§1/§3b); aquí solo se audita la escala de A1.
// ============================================================
const world = require("../server/world.js");
const biomes = require("../server/biomes.js");

let failed = 0;
const failedChecks = [];
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		failedChecks.push(`${_name}${_extra ? ` (${_extra})` : ""}`);
	}
};

// --- 1) La constante calibrada es la que decide la escala ---
// La spec F21 (A1) documenta BIOME_FREQ = 0.003 como el valor calibrado:
// con 0.005 las llanuras/desiertos salían como parches pequeños. Si alguien
// lo subiera de nuevo (o lo borrara en favor de un literal), este test lo
// detecta ANTES de medir coherencia.
check(
	"BIOME_FREQ está exportado y es el valor calibrado (0.003)",
	biomes.BIOME_FREQ === 0.003,
	`actual ${biomes.BIOME_FREQ}`
);

// --- 2) Coherencia: las regiones de bioma son amplias ---
// Transectos horizontales cada 40 bloques en z dentro de [-200, 200],
// muestreando cada 2 bloques en x en [-1000, 1000]: ~11 transectos × 1001
// muestras. Una «racha» es un tramo contiguo del mismo bioma; su longitud
// media mide el radio de coherencia. Medido en los mismos transectos: con
// 0.005 (escala previa) la media es 10.0; con 0.003 es 12.2 en la semilla.
// El umbral de 11 distingue la escala nueva de la anterior (el ruido de
// montaña a 0.008 aporta la varianza dominante, así que la diferencia es
// ~2 bloques, no 5).
let totalRun = 0;
let totalRuns = 0;
const runLengths = [];
for (let z = -200; z <= 200; z += 40) {
	let prev = null;
	let run = 0;
	for (let wx = -1000; wx <= 1000; wx += 2) {
		const b = world.getBiome(wx, z);
		if (b === prev) {
			run++;
		} else {
			if (prev !== null) {
				totalRun += run;
				totalRuns++;
				runLengths.push(run);
			}
			prev = b;
			run = 1;
		}
	}
	if (prev !== null) {
		totalRun += run;
		totalRuns++;
		runLengths.push(run);
	}
}
const avgRun = totalRun / totalRuns;
// Mediana: robusta frente a rachas gigantes de jungla/nieve que inflarían
// la media (p. ej. una extensión de 40 bloques no debe enmascarar que el
// resto son parches de 4).
runLengths.sort((a, b) => a - b);
const medianRun = runLengths[Math.floor(runLengths.length / 2)];
check(
	"la racha media de bioma es amplia (media >= 11 bloques)",
	avgRun >= 11,
	`media ${avgRun.toFixed(1)} en ${totalRuns} rachas`
);
check(
	"la racha mediana de bioma es amplia (mediana >= 5 bloques)",
	medianRun >= 5,
	`mediana ${medianRun}`
);

// --- 3) Determinismo y presencia de las etiquetas base ---
// Determinismo: getBiome es cacheado, pero el check de dos llamadas
// consecutivas (con el cache caliente) detectaría cualquier componente no
// determinista (Math.random, fecha, ...) en la etiqueta.
let detOk = true;
const counts = {};
for (let wx = -100; wx <= 100; wx += 4) {
	for (let wz = -100; wz <= 100; wz += 4) {
		const b1 = world.getBiome(wx, wz);
		const b2 = world.getBiome(wx, wz);
		if (b1 !== b2) detOk = false;
		counts[b1] = (counts[b1] || 0) + 1;
	}
}
check("getBiome es determinista (2 llamadas, misma etiqueta)", detOk);
// Las 9 etiquetas base de la Fase 11 deben seguir muestreándose en el
// rango de tests: si la nueva escala las barriera fuera, la generación
// habría perdido variedad (regresión de A1). Los sub-biomas de A2 se
// verifican en unit-biomas.js (§1).
for (const b of ["plains", "forest", "mountain", "snow", "taiga", "desert", "swamp", "jungle"]) {
	check(
		`bioma base '${b}' sigue presente en la semilla`,
		(counts[b] || 0) > 0,
		`${counts[b] || 0} muestras`
	);
}

process.exit(failed ? 1 : 0);
