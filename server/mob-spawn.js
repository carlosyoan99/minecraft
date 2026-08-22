"use strict";

// ============================================================
// SPAWN DE MOBS (Fase 18, D-2)
// Extraído de mobs.js: zona segura del spawn (B2), tablas de spawn por
// bioma (Fase 12, Bloque C — E7) y el intento de aparición (spawnMobs,
// cuota de 30 mobs y distancia mínima al jugador). Consume `createMob`
// (que vive en mob-species.js y se re-exporta desde mobs.js) vía el hook
// inyectable setCreateMob: así este módulo no requiere mobs.js y no hay
// ciclos (mobs.js lo requiere a él para re-exportar las fachadas).
// ============================================================
const { CHUNK_SIZE, HOSTILE, worldPaths, B } = require("./constants.js");
const constants = require("./constants.js");
const state = require("./state.js");
const world = require("./world.js");

const { players } = state;

// ============================================================
// ZONA SEGURA DEL SPAWN (Fase 8, B2)
// Radio alrededor del punto de aparición del mundo en el que los hostiles
// NO spawnean ni targetean a los jugadores: el recién llegado no muere sin
// defensa (diagnóstico B2: hostiles a <40 bloques del spawn, un zombi a 3).
// Al salir del radio, el jugador vuelve a ser objetivo normal.
// 0 desactiva la zona (lo usan los tests de IA pura). El centro es
// findSpawn(0,0), determinista por semilla: se cachea y se invalida al
// cambiar de mundo (set_seed cambia worldPaths.currentSeed).
// ============================================================
let spawnSafeRadius = 32;
let safeSpawnCache = { seed: null, x: 0, z: 0 };

function getSafeSpawn() {
	if (safeSpawnCache.seed !== worldPaths.currentSeed) {
		const s = world.findSpawn(0, 0);
		safeSpawnCache = { seed: worldPaths.currentSeed, x: s.x, z: s.z };
	}
	return safeSpawnCache;
}

function setSpawnSafeRadius(r) {
	spawnSafeRadius = r;
}

// ============================================================
// SPAWN DE MOBS (Fase 6: IA hostil más fiel)
// Los HOSTILES solo aparecen de NOCHE; de día solo generan pasivos. La
// posición se elige en CUALQUIER chunk cargado del mapa dentro del radio de
// render del jugador (antes: siempre a <25 bloques del jugador, de día y de
// noche). Reglas tipo Minecraft:
//  - hostiles: distancia mínima de 24 bloques al jugador (no spawn en la
//    cara) y nunca sobre agua.
//  - pasivos: pueden aparecer cerca, de día o de noche (la comida sigue
//    existiendo de noche, como en Minecraft).
// Devuelve los mobs creados (para tests) o [].
// ============================================================
const SPAWN_MIN_PLAYER_DIST = 24; // bloques: hostiles nunca a menos de esto
// Fase 21.6 (E1): cuota GLOBAL de mobs viva (spawn natural, cría M2 y ahora
// también /summon comparten el mismo tope). Antes era un 30 literal repetido
// en mob-spawn.js/mob-species.js; la constante auditable evita desincronizar.
const MOB_TOTAL = 30;
// Mobs por bioma (Fase 12, Bloque C — E7): además de la tabla base, cada
// bioma tiene su mob propio. El lobo (antes hostil genérico de la noche)
// pasa a ser EXCLUSIVO de taiga (deja de spawnear en el resto de biomas).
// Sin pesos complejos: si el bioma del punto tiene mobs propios, el 60% de
// las veces se elige uno de ellos y 40% la tabla base ("mobs propios + resto
// igual", decisión E7). getBiome devuelve: snow|taiga|desert|swamp|jungle|
// forest|plains|mountain (los ríos/océanos no son bioma: se detectan como
// columna de agua con columnFloorY y se asocian al ahogado).
const SPAWN_TYPES = {
	day: ["cow", "pig", "chicken", "sheep", "rabbit", "bee"],
	night: [
		"zombie",
		"creeper",
		"skeleton",
		"spider",
		"cow",
		"pig",
		"chicken",
		"sheep",
		"rabbit",
		"bee"
	]
};
// Fase 21.5 (E2): paleta de lana por bioma para ovejas.
// Templados (llanura/bosque/jungla/birch): blanco.
// Fríos (snow/taiga/giant_taiga): negro.
// Cálidos/áridos (desert/badlands/swamp): marrón.
// Montañas: gris.
const SHEEP_WOOL = {
	plains: B.WHITE_WOOL,
	forest: B.WHITE_WOOL,
	birch_forest: B.WHITE_WOOL,
	jungle: B.WHITE_WOOL,
	mountain: B.GRAY_WOOL,
	snow: B.BLACK_WOOL,
	snowy_peaks: B.BLACK_WOOL,
	taiga: B.BLACK_WOOL,
	giant_taiga: B.BLACK_WOOL,
	desert: B.BROWN_WOOL,
	badlands: B.BROWN_WOOL,
	swamp: B.BROWN_WOOL
};
// Fase 21.5 (E1): variante de animal por bioma para cerdo/vaca/gallina
// (1.21.5 "Spring to Life"). Fríos → "cold" (tinte oscuro), cálidos/áridos
// → "warm" (tinte cálido), templados → base ("", sin tinte). Se replica al
// cliente en el snapshot (mob.variant) y el tinte lo aplica VARIANT_TINT de
// mobtextures; retrocompatible (sin cambios de wire ni guardado).
const ANIMAL_VARIANT = {
	plains: "",
	forest: "",
	birch_forest: "",
	mountain: "",
	snow: "cold",
	snowy_peaks: "cold",
	taiga: "cold",
	giant_taiga: "cold",
	desert: "warm",
	badlands: "warm",
	jungle: "warm",
	swamp: "warm"
};
const VARIANT_ANIMALS = new Set(["cow", "pig", "chicken"]);

// Variante frío/cálido/templado para un animal (E1): "" si la especie no
// tiene variante o el bioma es templado/desconocido. Función pura (tests).
function animalVariantFor(type, biome) {
	if (!VARIANT_ANIMALS.has(type)) return "";
	return ANIMAL_VARIANT[biome] || "";
}
const BIOME_SPAWN = {
	taiga: { day: [], night: ["wolf"] },
	swamp: { day: [], night: ["slime", "bogged"] }, // F21.5 D2: bogged hostil de noche (como MC)
	jungle: { day: ["ocelot"], night: [] }, // el ocelote es pasivo y solo de DÍA
	pale_garden: { day: [], night: ["creaking"] } // Fase 21.5 (F2): creaking solo de noche
};
// Los ahogados viven en cualquier columna de agua (océano, río o lago): se
// eligen como mob propio del "agua" de día y de noche (E4), y se colocan
// bajo la superficie (wy = fondo + 2) en vez de sobre el terreno.
const WATER_SPAWN = ["drowned"];

// Hook inyectable: createMob vive en mob-species.js (fábrica cableada en
// mobs.js). Este módulo NO requiere mobs.js para no crear ciclos; mobs.js
// llama a setCreateMob(createMob) en su cargue.
let createMobFn = () => {
	throw new Error("mob-spawn: createMob sin inyectar (setCreateMob)");
};
function setCreateMob(fn) {
	createMobFn = fn;
}

// Intento de spawn de hasta 3 mobs por llamada (cuota global: >30 vivos no
// se spawnea). Ver cabecera del módulo para las reglas de posición.
function spawnMobs(isNight) {
	if (state.mobs.length > 30 || players.size === 0) return [];
	const types = SPAWN_TYPES[isNight ? "night" : "day"];
	const anyPlayer = players.values().next().value;
	const created = [];
	for (let i = 0; i < 3; i++) {
		// Buscar una posición en el mapa cargado: un chunk dentro del radio de
		// render del jugador (los chunks del servidor fuera del radio activo no
		// se generan o se descargan; el mundo cargado = el área de render).
		const rd = Math.max(2, Math.min(10, anyPlayer.renderDistance || 6));
		let placed = null;
		for (let attempt = 0; attempt < 8 && !placed; attempt++) {
			const ccx = Math.floor(anyPlayer.x / CHUNK_SIZE);
			const ccz = Math.floor(anyPlayer.z / CHUNK_SIZE);
			const cx = ccx + Math.floor((Math.random() * 2 - 1) * rd);
			const cz = ccz + Math.floor((Math.random() * 2 - 1) * rd);
			const key = `${cx},${cz}`;
			// Solo chunks ya cargados en memoria: el spawn nunca fuerza generación
			// (spawnMobs se llama desde el bucle, fuera del flujo de generación).
			if (!state.chunks.has(key)) continue;
			const wx = cx * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE) + 0.5;
			const wz = cz * CHUNK_SIZE + Math.floor(Math.random() * CHUNK_SIZE) + 0.5;
			const hx = Math.floor(wx),
				hz = Math.floor(wz);
			// Fase 12 (Bloque C): el tipo se elige SEGÚN el bioma del punto (E7).
			// Columna de agua (océano, río o lago) → mob propio "agua" (ahogado);
			// si no, el mob propio del bioma cuando lo hay. El sorteo consume UN
			// solo Math.random (unidad de disparo de los tests deterministas):
			// si el bioma tiene mobs propios, 60% mob propio y 40% tabla base;
			// si no los tiene, el mismo valor elige en la tabla base como antes.
			const floorY = world.columnFloorY(hx, hz);
			const isWater = floorY !== null;
			const r = Math.random();
			const biomePool = isWater
				? WATER_SPAWN
				: BIOME_SPAWN[world.getBiome(hx, hz)]?.[isNight ? "night" : "day"] ||
					[];
			// Un solo Math.random decide (determinismo de los tests). Cuando el
			// bioma tiene pool propio: r<0.6 → mob propio; r≥0.6 → tabla base
			// REMAPeada a [0.6,1)→[0,1) para no sesgar hacia los últimos tipos
			// (sin el remape, zombie/creeper/skeleton/spider nunca salían por
			// tabla base en taiga/pantano/jungla/agua — revisión Fase 12).
			let type;
			if (biomePool.length > 0) {
				type =
					r < 0.6
						? biomePool[Math.floor((r / 0.6) * biomePool.length)]
						: types[Math.floor(((r - 0.6) / 0.4) * types.length)];
			} else {
				type = types[Math.floor(r * types.length)];
			}
			// El ahogado solo vive en el agua (se coloca bajo la superficie);
			// el resto de terrestres nunca spawnean sobre agua (ni lagos ni
			// océanos/ríos): un pasivo hundido se ahogaría, un hostil no podría
			// perseguir — el rechazo de lagos de la Fase 0 queda cubierto aquí.
			if (type === "drowned") {
				if (!isWater) continue;
			} else if (isWater) {
				continue;
			}
			if (HOSTILE.has(type)) {
				// Hostiles: a ≥ 24 bloques del jugador más cercano.
				let minDist = Infinity;
				for (const p of players.values())
					minDist = Math.min(minDist, Math.hypot(wx - p.x, wz - p.z));
				if (minDist < SPAWN_MIN_PLAYER_DIST) continue;
				// B2: los hostiles tampoco spawnean dentro de la zona segura del
				// spawn (no aparecen en la cara del recién llegado).
				if (spawnSafeRadius > 0) {
					const s = getSafeSpawn();
					if (Math.hypot(wx - s.x, wz - s.z) < spawnSafeRadius) continue;
				}
			}
			const surfaceH = world.getHeight(hx, hz);
			// Fase 10 (A6): hostiles también de DÍA, solo en zonas oscuras
			// (cuevas con techo opaco) — las notas pedían "solo por la noche o
			// en zonas oscuras como las cuevas". De noche siguen saliendo en
			// superficie; de día se buscan celdas de cueva oscuras. El ahogado
			// es la excepción (E4): sale de día y de noche en su agua, y se
			// coloca bajo la superficie (wy = fondo + 2, dentro del agua).
			let wy;
			if (type === "drowned") {
				// Fase 15 (D5): columnFloorY devuelve el fondo en ESPACIO DE DISEÑO
				// (1..4). La Y de MUNDO del lecho es floorY − DESIGN_OFFSET (−7..−4)
				// y el ahogado nace 2 bloques sobre él; el clamp al techo del agua
				// (WORLD_SEA_LEVEL − 1 = −4) garantiza que NUNCA nazca sobre la
				// superficie aunque el agua sea poco profunda (antes nacía a y 3..6,
				// en el aire sobre el agua).
				wy = Math.min(
					floorY - world.DESIGN_OFFSET + 2,
					world.WORLD_SEA_LEVEL - 1
				);
			} else if (HOSTILE.has(type) && !isNight) {
				const caveY = world.findDarkCaveY(hx, hz, surfaceH);
				if (caveY == null) continue; // sin cueva en esta columna: no spawn de día
				wy = caveY + 0.5;
			} else {
				wy = surfaceH + 1;
			}
			const mob = createMobFn(type, wx, wy, wz);
			// Fase 9 (Bloque D): el punto de origen es el rebaño del pasivo (vuelven a
			// él si se alejan). Las abejas vuelan alrededor de su panal (el origen).
			mob.homeX = wx;
			mob.homeZ = wz;
			if (type === "bee") mob.homeY = wy + 2;
			// Fase 21.5 (E2): ovejas con lana del color del bioma donde spawnean.
			if (type === "sheep") {
				const biome = isWater ? null : world.getBiome(hx, hz);
				mob.woolColor = SHEEP_WOOL[biome] || constants.B.WHITE_WOOL;
			}
			// Fase 21.5 (E1): cerdo/vaca/gallina con la variante frío/cálido/
			// templado del bioma de spawn (1.21.5 Spring to Life). El cliente
			// tiñe el material según mob.variant (VARIANT_TINT en mobs.js).
			if (VARIANT_ANIMALS.has(type)) {
				const biome = isWater ? null : world.getBiome(hx, hz);
				mob.variant = animalVariantFor(type, biome);
			}
			// Fase 21.5 (E1): variantes de animales por bioma (cerdo/vaca/gallina).
			// "cold" = frío (snow/taiga/giant_taiga/snowy_peaks/birch_forest),
			// "warm" = cálido (desert/badlands/swamp/jungle), "" = templado.
			if (type === "pig" || type === "cow" || type === "chicken") {
				const biome = isWater ? null : world.getBiome(hx, hz);
				mob.variant = ANIMAL_VARIANT[biome] || "";
			}
			state.mobs.push(mob);
			created.push(mob);
			placed = mob;
		}
	}
	return created;
}

module.exports = {
	// Getter vivo: el radio cambia con setSpawnSafeRadius (los tests lo ponen
	// a 0 para IA pura) — un export de valor se quedaría con la copia inicial.
	get spawnSafeRadius() {
		return spawnSafeRadius;
	},
	getSafeSpawn,
	setSpawnSafeRadius,
	SPAWN_MIN_PLAYER_DIST,
	MOB_TOTAL, // Fase 21.6 (E1): cuota global compartida (spawn, cría y summon)
	SPAWN_TYPES,
	BIOME_SPAWN,
	WATER_SPAWN,
	ANIMAL_VARIANT, // Fase 21.5 (E1): variante de animal por bioma (tests)
	animalVariantFor, // Fase 21.5 (E1): helper puro type+bioma→variant
	spawnMobs,
	setCreateMob
};
