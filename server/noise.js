"use strict";

// ============================================================
// RUIDO DEL MUNDO (Fase 18, D-3)
// Generadores mutables de simplex-noise (2D/3D) sembrados con la semilla
// del mundo. Extraído de world.js: aquí viven seededNoise (PRNG mulberry32),
// todas las instancias y reinitNoise(seed) que las recrea al cambiar de
// semilla (Fase 6, el menú del cliente puede cambiar la semilla en runtime
// con save.switchWorld). Los módulos que usan ruido (biomes, structures,
// generation) acceden a las instancias vía getters VIVOS (`noise.noise2D(x,
// y)`), así que reinitNoise las reemplaza sin que nadie guarde referencias
// viejas. Los módulos con cachés dependientes del seed (biomas, estructuras,
// lagos) registran su limpieza con onReinit(cb): reinitNoise la invoca tras
// recrear los generadores (mismo ciclo de vida que en world.js).
// ============================================================
const { createNoise2D, createNoise3D } = require("simplex-noise");
const constants = require("./constants.js");

function seededNoise(seedStr) {
	// PRNG determinista simple (mulberry32) sembrado con el string, para
	// que el mundo sea siempre el mismo entre reinicios del servidor.
	let h = 1779033703 ^ seedStr.length;
	for (let i = 0; i < seedStr.length; i++) {
		h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
		h = (h << 13) | (h >>> 19);
	}
	return () => {
		h = Math.imul(h ^ (h >>> 16), 2246822507);
		h = Math.imul(h ^ (h >>> 13), 3266489909);
		h ^= h >>> 16;
		return (h >>> 0) / 4294967296;
	};
}
// Generadores MUTABLES: reinitNoise(seed) los recrea todos.
let noise2D, noise2D_detail, noise2D_ore, noise2D_mountain;
let noise3D_cave,
	noise3D_cave_fine,
	noise2D_lake,
	noise2D_lakeDepth,
	noise2D_river,
	// Fase 11 (Bloque B): cuencas de océano y puerta de pantano
	noise2D_ocean,
	noise2D_swamp;
// Ruidos de las minas abandonadas (Fase 7): dos campos de "corredores"
// (bandas finas alrededor de las curvas de nivel del ruido), una puerta de
// región (solo ~1/3 del mapa tiene minas) y la profundidad del túnel.
let noise2D_ms_a, noise2D_ms_b, noise2D_ms_region, noise2D_ms_depth;
// Ruidos de pozos decorativos (Fase 7): agua y lava en superficie.
let noise2D_pond, noise2D_pond_region, noise2D_lava;

// Módulos con cachés dependientes del seed: se limpian al re-sembrar.
const cacheClearers = new Set();
function onReinit(fn) {
	cacheClearers.add(fn);
}

function reinitNoise(seed) {
	noise2D = createNoise2D(seededNoise(seed));
	noise2D_detail = createNoise2D(seededNoise(`${seed}_detail`));
	noise2D_ore = createNoise2D(seededNoise(`${seed}_ore`));
	// Ruido 2D para montañas (Fase 4): donde es alto, el bioma es montaña (el
	// terreno se eleva y las cumbres altas se cubren de nieve). Determinista y
	// continuo entre chunks, como el resto de la generación.
	noise2D_mountain = createNoise2D(seededNoise(`${seed}_mountain`));
	// Ruido 3D para cuevas (Fase 4): dos octavas sembradas, muestreadas en
	// coordenadas de mundo para que las cuevas sean continuas entre chunks.
	noise3D_cave = createNoise3D(seededNoise(`${seed}_cave`));
	noise3D_cave_fine = createNoise3D(seededNoise(`${seed}_cave_fine`));
	// Ruido 2D para lagos (Fase 4): donde es alto, el terreno se hunde y el
	// agua llena la depresión hasta SEA_LEVEL. Muestreado en coordenadas de
	// mundo → lagos continuos entre chunks y deterministas.
	noise2D_lake = createNoise2D(seededNoise(`${seed}_lake`));
	// Fase 10 (A4): profundidad variable del lago y ríos pequeños (canales
	// que cortan el terreno y se llenan de agua).
	noise2D_lakeDepth = createNoise2D(seededNoise(`${seed}_lake_depth`));
	noise2D_river = createNoise2D(seededNoise(`${seed}_river`));
	// Fase 11 (Bloque B): cuencas de océano (campo de frecuencia muy baja que
	// inunda regiones amplias) y puerta de pantano (regiones templadas que se
	// vuelven pantanosas). El mismo ruido de pantano, muestreado a OTRA
	// frecuencia (más alta), decide los charcos de agua del pantano.
	noise2D_ocean = createNoise2D(seededNoise(`${seed}_ocean`));
	noise2D_swamp = createNoise2D(seededNoise(`${seed}_swamp`));
	// Minas abandonadas (Fase 7).
	noise2D_ms_a = createNoise2D(seededNoise(`${seed}_ms_a`));
	noise2D_ms_b = createNoise2D(seededNoise(`${seed}_ms_b`));
	noise2D_ms_region = createNoise2D(seededNoise(`${seed}_ms_region`));
	noise2D_ms_depth = createNoise2D(seededNoise(`${seed}_ms_depth`));
	// Pozos decorativos (Fase 7).
	noise2D_pond = createNoise2D(seededNoise(`${seed}_pond`));
	noise2D_pond_region = createNoise2D(seededNoise(`${seed}_pond_region`));
	noise2D_lava = createNoise2D(seededNoise(`${seed}_lava`));
	// Cachés dependientes del seed (estructuras, biomas, lagos): se invalidan
	// al cambiar de semilla — mismo ciclo de vida que en world.js.
	for (const fn of cacheClearers) fn();
}
reinitNoise(constants.SEED); // al arrancar, la SEED de la env var

module.exports = {
	reinitNoise,
	onReinit,
	// Getters vivos: los consumidores leen `noise.noise2D(x, y)` y siempre ven
	// la instancia ACTUAL (reinitNoise las reemplaza al cambiar de semilla).
	get noise2D() {
		return noise2D;
	},
	get noise2D_detail() {
		return noise2D_detail;
	},
	get noise2D_ore() {
		return noise2D_ore;
	},
	get noise2D_mountain() {
		return noise2D_mountain;
	},
	get noise3D_cave() {
		return noise3D_cave;
	},
	get noise3D_cave_fine() {
		return noise3D_cave_fine;
	},
	get noise2D_lake() {
		return noise2D_lake;
	},
	get noise2D_lakeDepth() {
		return noise2D_lakeDepth;
	},
	get noise2D_river() {
		return noise2D_river;
	},
	get noise2D_ocean() {
		return noise2D_ocean;
	},
	get noise2D_swamp() {
		return noise2D_swamp;
	},
	get noise2D_ms_a() {
		return noise2D_ms_a;
	},
	get noise2D_ms_b() {
		return noise2D_ms_b;
	},
	get noise2D_ms_region() {
		return noise2D_ms_region;
	},
	get noise2D_ms_depth() {
		return noise2D_ms_depth;
	},
	get noise2D_pond() {
		return noise2D_pond;
	},
	get noise2D_pond_region() {
		return noise2D_pond_region;
	},
	get noise2D_lava() {
		return noise2D_lava;
	}
};
