"use strict";

// ============================================================
// BIOMAS (Fase 18, D-3)
// Extraído de world.js: elevación, temperatura y superficie por bioma
// (getBiome/getHeight/surfaceBlockFor), lagos/ríos/océanos (isLake,
// isRiver, isOcean, columnFloorY) y las cachés por celda de bioma y lago.
// Usa el ruido compartido de noise.js (getters vivos) y expone sus
// constantes (SEA_LEVEL, DESIGN_OFFSET, ...) para los módulos que las
// necesitan (structures, generation). Las cachés se limpian al re-sembrar
// (noise.onReinit — mismo ciclo de vida que en world.js).
// ============================================================
const { B } = require("./constants.js");
const noise = require("./noise.js");

const MAX_BIOME_CACHE = 65536;
const biomeCache = new Map();
let biomeComputations = 0; // contador de cómputos REALES (perfilado/tests)
// Fase 15 (cierre): caché de isLake POR CELDA entera (ver definición abajo).
// Declarada ANTES de reinitNoise (que la limpia al arrancar y al cambiar de
// semilla), igual que structCellCache/biomeCache.
const MAX_LAKE_CACHE = 65536;
const lakeCache = new Map();

// Estadísticas de la caché de bioma (Fase 13, A4): cuántos cómputos REALES
// se hicieron (las consultas cacheadas no cuentan). Para tests de perfilado.
function biomeCacheStats() {
	return { computations: biomeComputations, size: biomeCache.size };
}
const SEA_LEVEL = 5; // bloques de agua (ESPACIO DE DISEÑO): y ∈ (LAKE_FLOOR, SEA_LEVEL)
// Fase 15 (D5): re-base del mundo. La generación trabaja en un espacio de
// diseño 0..63 (superficie 3..27, mar en 5) que se desplaza a las
// coordenadas de MUNDO (−64..+63) restando DESIGN_OFFSET: el terreno queda
// anclado en y≈0 (llanuras ~0, cumbres ~11, valles −5) con el mar en −3 y
// 64 bloques de subsuelo por debajo. El bedrock se coloca aparte en
// WORLD_MIN_Y (no se deriva del diseño).
const DESIGN_OFFSET = 8;
// Nivel del mar en MUNDO (diseño 5 → −3): agua hasta esta Y en columnas de agua.
const WORLD_SEA_LEVEL = SEA_LEVEL - DESIGN_OFFSET;
const LAKE_FREQ = 0.012; // frecuencia baja → lagos amplios
const LAKE_THRESHOLD = 0.65; // calibrado por barrido: ~5% de columnas con lago
// (0.35 daba ~26% = mundo lleno de charcos)
const LAKE_FLOOR = 2; // fondo del lago: arena en y=LAKE_FLOOR, piedra debajo
// Fase 15 (cierre): caché de isLake POR CELDA entera. isLake se consulta
// mucho más que cualquier otro ruido de agua: generateChunk la llama para
// el lago de la columna Y nearLake la muestra 25× (ventana 5×5) por cada
// columna de tierra, y columnFloorY la vuelve a consultar. El valor por
// celda (Math.floor) no cambia entre consultas, así que cachearlo evita
// ~25 muestras de noise2D_lake por columna. Se invalida al cambiar de
// semilla (reinitNoise) como biomeCache/structCellCache; tope con clear
// simple como la caché de biomas. Solo cachea celdas ENTERAS (el caso
// caliente de la generación y nearLake); con coordenadas fraccionarias
// calcula directo (exactitud idéntica a antes, por si un test consulta
// con floats).
function isLake(wx, wz) {
	const cx = Math.floor(wx);
	const cz = Math.floor(wz);
	if (cx === wx && cz === wz) {
		const key = `${cx},${cz}`;
		const cached = lakeCache.get(key);
		if (cached !== undefined) return cached;
		const v =
			noise.noise2D_lake(wx * LAKE_FREQ, wz * LAKE_FREQ) > LAKE_THRESHOLD;
		if (lakeCache.size >= MAX_LAKE_CACHE) lakeCache.clear();
		lakeCache.set(key, v);
		return v;
	}
	return noise.noise2D_lake(wx * LAKE_FREQ, wz * LAKE_FREQ) > LAKE_THRESHOLD;
}

// Fase 10 (A4): profundidad VARIABLE del lago (0..LAKE_FLOOR → de 3 a ~6
// bloques de agua). Antes todos los lagos tenían el mismo fondo plano.
function lakeFloorY(wx, wz) {
	const d = (noise.noise2D_lakeDepth(wx * 0.05, wz * 0.05) + 1) / 2; // 0..1
	return Math.max(1, Math.floor(d * (LAKE_FLOOR + 1))); // 1..3 → agua de 2 a 4 bloques
}

// Fase 10 (A4): RÍOS — canal donde el terreno se hunde y el agua lo llena
// hasta SEA_LEVEL. Fase 21 (v21.2, D1): ríos reales "al nivel del mar"
// (bug de las Notas: "el agua no llega al nivel del mar, parecen un bug").
//   - el cauce se clava SIEMPRE bajo el nivel del mar (RIVER_FLOOR_CAP) →
//     todo río tiene agua (antes el lecho podía quedar en SEA_LEVEL−1 y la
//     columna NO generaba agua en terreno alto),
//   - las ORRILLAS se hunden gradualmente hacia el cauce (riverInfluence →
//     riverCarvedHeight): sin acantilados de 8-10 bloques en el borde,
//   - menos densidad (RIVER_WIDTH 0.14 → 0.08: ~17 % → ~9-10 % de
//     columnas, medido en la semilla) y ancho VARIABLE (RIVER_WIDTH_VAR:
//     tramos estrechos y amplios a lo largo del cauce),
//   - un poco más de profundidad (riverDepth 2..4 → 3..6).
// El agua sigue siempre por debajo del nivel del mar (la invariante de
// unit-mundo "agua sobre SEA_LEVEL = charco" se conserva).
const RIVER_FREQ = 0.008; // frecuencia baja → meandros amplios
const RIVER_WIDTH = 0.08; // banda base del ruido que es río (antes 0.14)
// Variación del ancho: 0.6×..1.4× la banda base según un ruido de detalle
// de baja frecuencia → tramos estrechos y amplios a lo largo del cauce.
const RIVER_WIDTH_VAR = 0.4;
// Margen de ORRILLA en unidades de ruido: columnas con |n| ∈ (W, W+BANK)
// se hunden gradualmente hacia el cauce (playa inclinada, no acantilado).
// La rampa es LINEAL (pendiente 1/bank, no smoothstep: la cuadrática
// concentraba la pendiente en el centro) y ADAPTATIVA: el ancho escala con
// el desnivel h−floor del valle (bank ≈ (h−2)·0.014) para que la pendiente
// quede ≤ ~3.5 bloques/columna SIN importar la altura del terreno — un
// río en una montaña (h≈21) necesita una orilla de ~0.27 unidades de
// ruido, uno en llanura (h≈8) de ~0.08. El máximo gradiente del ruido de
// río medido en la semilla es ~0.049/bloque; con bank mínimo 0.05 las
// pendientes pequeñas también quedan suaves.
const RIVER_BANK_MIN = 0.05;
const RIVER_BANK_K = 0.014; // (h − 2) · K → pendiente ≤ |∇n|/K ≈ 3.5
// Tope del lecho del cauce (espacio de diseño): el fondo nunca sube de
// SEA_LEVEL − 3 → SIEMPRE hay ≥ 2 bloques de agua en el cauce (antes el
// tope era SEA_LEVEL − 1 y en terreno alto no quedaba agua: el bug D1).
const RIVER_FLOOR_CAP = 2;
// Ancho local de la banda (con variación): ruido de detalle a baja
// frecuencia modula el umbral del cauce de forma suave y determinista.
function riverBandW(wx, wz) {
	const v = (noise.noise2D_detail(wx * 0.02, wz * 0.02) + 1) / 2; // 0..1
	return RIVER_WIDTH * (1 - RIVER_WIDTH_VAR + v * 2 * RIVER_WIDTH_VAR);
}
function isRiver(wx, wz) {
	return (
		Math.abs(noise.noise2D_river(wx * RIVER_FREQ, wz * RIVER_FREQ)) <
		riverBandW(wx, wz)
	);
}
// Profundidad del canal (3-6 bloques bajo el terreno, según la fuerza del
// ruido en esa columna) — los ríos son valles, no zanjas rectas.
function riverDepth(wx, wz) {
	const n = noise.noise2D_river(wx * RIVER_FREQ, wz * RIVER_FREQ);
	return 3 + Math.floor((Math.abs(n) / riverBandW(wx, wz)) * 3); // 3..6
}
// Fondo real del cauce (espacio de diseño), compartido por columnFloorY y
// la generación: nunca por encima del tope (agua garantizada) ni por
// debajo de 1.
function riverFloorY(wx, wz, h) {
	return Math.max(1, Math.min(h - riverDepth(wx, wz), RIVER_FLOOR_CAP));
}
// Influencia del río en la columna: 1 dentro del cauce (|n| < W), 0..1 en
// las orillas (W..W+bank) y 0 fuera. La rampa es LINEAL y su ancho crece
// con el desnivel h−2 (orilla adaptativa): pendiente ≈ |∇n|/K ≤ 3.5
// bloques/columna en cualquier terreno (ver RIVER_BANK_K).
function riverInfluence(wx, wz, h) {
	const n = Math.abs(noise.noise2D_river(wx * RIVER_FREQ, wz * RIVER_FREQ));
	const W = riverBandW(wx, wz);
	const bank = Math.max(RIVER_BANK_MIN, (h - RIVER_FLOOR_CAP) * RIVER_BANK_K);
	return Math.max(0, Math.min(1, 1 - (n - W) / bank));
}
// Altura del terreno (espacio de diseño) tras el río: el cauce baja al
// fondo (riverFloorY) y las orillas se hunden gradualmente hacia él, sin
// pasar nunca de la línea de agua (SEA_LEVEL) ni por encima del terreno
// natural. Fuera del río devuelve h sin cambios.
function riverCarvedHeight(wx, wz, h) {
	const infl = riverInfluence(wx, wz, h);
	if (infl <= 0) return h;
	const floor = riverFloorY(wx, wz, h);
	if (infl >= 1) return floor;
	// Fase 21 (v21.2, D1): el resultado se redondea a bloque (como heightFrom)
	// — getHeight debe devolver enteros para que los índices de los tests y
	// la superficie (y === height − 1) coincidan con la generación real.
	const carved = Math.floor(h - (h - floor) * infl);
	return Math.min(Math.max(carved, SEA_LEVEL), h);
}

// Fase 11 (Bloque B): OCÉANO — cuencas amplias de agua (bioma de terreno).
// Un campo de ruido de frecuencia MUY baja (cuencas de cientos de bloques)
// inunda la región hasta su fondo (2-5 bloques de agua, más profundo que
// los lagos). El spawn ya lo evita (columnFloorY devuelve el fondo como
// cualquier columna de agua) y el lecho es arena como en lagos/ríos.
const OCEAN_FREQ = 0.0025; // cuencas muy amplias (cientos de bloques)
const OCEAN_GATE = 0.5; // ruido en [-1,1]: > 0.5 ≈ 25% del mapa es océano
function isOcean(wx, wz) {
	return noise.noise2D_ocean(wx * OCEAN_FREQ, wz * OCEAN_FREQ) > OCEAN_GATE;
}
// Fase 21.5 (D2): variantes del océano SIN cambiar la probabilidad de
// océano (OCEAN_FREQ/OCEAN_GATE intactos) — solo se subdivide lo que ya es
// océano, como los sub-biomas de F21 (A2). Un océano es:
//   "warm"  — temperatura alta (banda cálida, junto a jungla/desierto):
//             plataforma de arrecife, lleva CORAL_BLOCK en su paleta,
//   "deep"  — cuenca honda por el ruido de profundidad a baja frecuencia:
//             fondo más profundo (el bug de las Notas: océanos poco
//             profundos, sin variantes),
//   "normal" — el resto (como v21.1).
// Calibrado por transecto en la semilla: la temperatura del océano abarca
// −0.25..0.68; el gate 0.55 deja ~33% de las columnas cálidas (minoría, la
// banda de jungla — el resto del océano queda templado, como MC). La
// profundidad a 0.008 tiene p25 ≈ 0.35: el gate 0.35 deja ~13% como cuencas
// profundas (minoría, el resto normal).
const OCEAN_WARM_TEMP = 0.55; // temp > umbral → cálido (arrecife de coral)
const OCEAN_DEEP_GATE = 0.35; // profundidad < gate → cuenca honda
function oceanVariant(wx, wz) {
	if (!isOcean(wx, wz)) return null;
	const temp = noise.noise2D(wx * BIOME_FREQ, wz * BIOME_FREQ);
	if (temp > OCEAN_WARM_TEMP) return "warm";
	const d = (noise.noise2D_lakeDepth(wx * 0.008, wz * 0.008) + 1) / 2; // 0..1
	if (d < OCEAN_DEEP_GATE) return "deep";
	return "normal";
}
// Profundidad del océano (diseño): el fondo varía con el mismo ruido de
// profundidad de los lagos, muestreado a otra frecuencia (desc correlate).
// Fase 21.5 (D2): la profundidad media del fondo CRECE (más hondo) — el
// océano profundo baja a 0..2 (agua 3..5) y el cálido queda en plataforma
// somera (1..2) para el arrecife. v21.1: 1..3 fijo para todo el océano.
function oceanFloorY(wx, wz) {
	const variant = oceanVariant(wx, wz);
	const d = (noise.noise2D_lakeDepth(wx * 0.04, wz * 0.04) + 1) / 2; // 0..1
	if (variant === "deep") return Math.max(0, Math.floor(d * 2)); // 0..2 → agua 3..5
	if (variant === "warm") return Math.max(1, Math.floor(d * 2)); // 1..2 → plataforma
	return Math.max(1, Math.floor(d * (LAKE_FLOOR + 1))); // 1..3 (como v21.1)
}

// Fondo real de una columna de agua (lago, río u océano): Y del lecho (el
// bloque SAND) o null si la columna no es de agua. Lo usan generateChunk y
// los tests (unit-mundo) — la profundidad ya no es LAKE_FLOOR fijo.
function columnFloorY(wx, wz) {
	if (isLake(wx, wz)) return lakeFloorY(wx, wz);
	if (isRiver(wx, wz)) {
		const temp = noise.noise2D(wx * BIOME_FREQ, wz * BIOME_FREQ);
		const mnt = noise.noise2D_mountain(wx * 0.008, wz * 0.008);
		const h = heightFrom(
			temp,
			smoothstep(MOUNTAIN_RAMP[0], MOUNTAIN_RAMP[1], mnt),
			wx,
			wz
		);
		// Fase 21 (v21.2, D1): lecho compartido con la generación — el cauce
		// siempre queda bajo el nivel del mar (agua garantizada).
		return riverFloorY(wx, wz, h);
	}
	if (isOcean(wx, wz)) return oceanFloorY(wx, wz);
	return null;
}

// Playas costeras (Fase 9, Bloque F): una columna es "costa" si hay un lago a
// ≤2 bloques (transición suave agua → arena → tierra, sin cortes). Las costas
// llevan arena en la superficie, como en Minecraft.
function nearLake(wx, wz) {
	for (let dx = -2; dx <= 2; dx++) {
		for (let dz = -2; dz <= 2; dz++) {
			if (isLake(wx + dx, wz + dz)) return true;
		}
	}
	return false;
}

// Fase 21 (A1): frecuencia del campo de temperatura (escala de los biomas
// planos). Baja frecuencia = regiones de bioma más grandes. Calibrado por
// transecto en la semilla: con 0.005 las llanuras/desiertos salían como
// parches pequeños (60 cambios de bioma en 2000 bloques); con 0.003 quedan
// extensiones amplias (44 cambios, ~35% más grandes) y los 8 biomas siguen
// presentes en el rango de tests. La montaña (0.008) y el pantano (gate a
// baja frecuencia) crecen con la misma escala del resto.
const BIOME_FREQ = 0.003;
// Umbral de temperatura para tundra: por debajo hace tanto frío que nieva.
const SNOW_TEMP = -0.3;
// Umbral del ruido de montaña: por encima el terreno se eleva en cordilleras.
// Calibrado por barrido en la semilla: con 0.35 las montañas ocupaban el 25%
// del mundo y eclipsaban a las llanuras; con 0.45 quedan en ~19% (desierto
// ~9%, bosque ~31%, llanura ~20%, nieve ~20%).
const MOUNTAIN_THRESHOLD = 0.45;
// Altura mínima de cumbre para que la superficie de una montaña sea nieve
// (por debajo, la roca queda al descubierto). Calibrado: con 15, ~91% de las
// montañas quedaban nevadas y se confundían con la tundra; con 18 solo las
// cumbres altas (alturas 12-26) llevan nieve y hay contraste entre biomas.
const MOUNTAIN_SNOW_LINE = 18;

// --- Blend continuo entre biomas (fix: transiciones bruscas) ---
// getBiome() sigue devolviendo la etiqueta discreta dominante (fuente de
// verdad para superficie, árboles y spawn de mobs), pero la ALTURA se
// interpola con funciones continuas del mismo ruido: sin acantilados de
// 4-8 bloques en las fronteras de bioma.
function smoothstep(e0, e1, x) {
	const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
	return t * t * (3 - 2 * t);
}

// Afinidad térmica gaussiana de cada bioma plano (centro = su región de
// temperatura, r = radio de transición): la altura base resultante es una
// media ponderada que varía de forma continua entre biomas vecinos.
const FLAT_AFFINITY = [
	{ center: -0.4, base: 3, r: 0.24 }, // nieve/tundra
	{ center: -0.22, base: 3, r: 0.24 }, // desierto
	{ center: 0.02, base: 4, r: 0.24 }, // llanura
	{ center: 0.32, base: 6, r: 0.28 } // bosque
];
// Rampa del ruido de montaña: 0 en llanuras, 1 dentro de la cordillera.
// Arranca tarde (0.40) para que las columnas con etiqueta de llanura
// (ruido ≤ 0.45) apenas se eleven: estribaciones suaves, no muros.
// Fase 21.5 (D3): el final se WIDEN a 0.70 — con la base de la montaña más
// alta (16 vs 12) el desnivel llanura→cima es mayor, y si la rampa
// terminara en 0.65 la pendiente por bloque subiría a 5 (rompe el
// presupuesto de salto ≤ 4 de audit-altura/D1). El desnivel se reparte en
// más columnas: salto máx 4 con base 16, cumbres ~5 bloques más altas.
const MOUNTAIN_RAMP = [0.35, 0.7];

function flatBaseHeight(temp) {
	let num = 0,
		den = 0;
	for (const a of FLAT_AFFINITY) {
		const d = (temp - a.center) / a.r;
		const w = Math.exp(-d * d);
		num += w * a.base;
		den += w;
	}
	return num / den;
}

// Fase 11 (Bloque B): 5 biomas → 8. Bandas de temperatura re-ajustadas y
// dos biomas por puerta de ruido independiente:
//   temp < -0.3      → snow (tundra)
//   -0.3 .. -0.2     → taiga (bosque frío de pinos; césped, no nieve)
//   -0.2 .. -0.05    → desert (arena)
//   -0.05 .. 0.2     → plains, salvo puerta de pantano → swamp
//   0.2 .. 0.32      → forest
//   >= 0.32          → jungle (selva caliente)
//   ruido de montaña > umbral → mountain (manda sobre todo lo anterior)
// Fase 21 (A2): sub-biomas por puertas deterministas (gates de ruido en
// coordenadas de mundo, mismas que la superficie/árboles) que matizan las
// bandas existentes sin cambiar sus umbrales:
//   montaña + crest alto           → snowy_peaks (picos nevados)
//   taiga + gate                   → giant_taiga (abetos gigantes 2×2)
//   forest + gate                  → birch_forest (bosque puro de abedules)
// Las etiquetas nuevas son retrocompatibles: el resto del código usa la
// base (superficie por temp/mnt, árboles por bioma con lista), los testers
// de muestras existentes siguen viendo mountain/taiga/forest.
const SWAMP_GATE = 0.42; // ruido de pantano en [-1,1]: regiones templadas donde se activa
// Gates de sub-biomas (Fase 21, A2): el MISMO ruido de detalle muestreado a
// frecuencia propia decide taiga→giant_taiga y forest→birch_forest
// (~1/3 de cada banda queda como variante), y el crest de montaña
// (noise2D_mountain a 0.05, el mismo de heightFrom) marca los picos.
const SUBBIOME_FREQ = 0.02;
const SUBBIOME_GATE = 0.25;
const PEAK_GATE = 0.1;
function biomeFrom(temp, mnt, swamp, wx, wz) {
	if (mnt > MOUNTAIN_THRESHOLD) {
		if (
			wx !== undefined &&
			noise.noise2D_mountain(wx * 0.05, wz * 0.05) > PEAK_GATE
		)
			return "snowy_peaks";
		return "mountain";
	}
	if (temp < SNOW_TEMP) return "snow";
	if (temp < -0.2) {
		if (
			wx !== undefined &&
			noise.noise2D_detail(wx * SUBBIOME_FREQ, wz * SUBBIOME_FREQ) >
				SUBBIOME_GATE
		)
			return "giant_taiga";
		return "taiga";
	}
	if (temp < -0.05) return "desert";
	if (swamp !== undefined && swamp > SWAMP_GATE && temp < 0.2) return "swamp";
	if (temp > 0.38) return "jungle";
	if (temp > 0.2) {
		if (
			wx !== undefined &&
			noise.noise2D_detail(wx * SUBBIOME_FREQ, wz * SUBBIOME_FREQ) >
				SUBBIOME_GATE
		)
			return "birch_forest";
		return "forest";
	}
	return "plains";
}

function getBiome(wx, wz) {
	const key = `${Math.floor(wx)},${Math.floor(wz)}`;
	const cached = biomeCache.get(key);
	if (cached !== undefined) return cached;
	biomeComputations++;
	if (biomeCache.size >= MAX_BIOME_CACHE) biomeCache.clear();
	const b = biomeFrom(
		noise.noise2D(wx * BIOME_FREQ, wz * BIOME_FREQ),
		noise.noise2D_mountain(wx * 0.008, wz * 0.008),
		noise.noise2D_swamp(wx * BIOME_FREQ, wz * BIOME_FREQ),
		wx,
		wz
	);
	biomeCache.set(key, b);
	return b;
}

function heightFrom(temp, wMnt, wx, wz) {
	const h = noise.noise2D(wx * 0.02, wz * 0.02) * 0.5 + 0.5;
	const detail = noise.noise2D_detail(wx * 0.08, wz * 0.08) * 1.5;
	const flat = flatBaseHeight(temp) + h * 8 + detail;
	// Crestas: octava adicional de mayor amplitud para picos pronunciados.
	const crest = noise.noise2D_mountain(wx * 0.05, wz * 0.05) * 0.5 + 0.5;
	// Fase 21.5 (D3): montañas ALTAS — la base sube de 12 a 16 (el bug de
	// las Notas: "las montañas son bajas"; v21.1 máx diseño 20, cumbres 12).
	// Se mantiene la amplitud del crest (14) para no aumentar la pendiente
	// por bloque (el salto global del terreno queda ≤ 4, presupuesto de
	// audit-altura/D1) y el techo real queda en diseño ~31 (mundo ~23, bajo
	// el presupuesto de audit-altura máx ≤ 24). Más cumbres pasan la línea
	// de nieve (MOUNTAIN_SNOW_LINE 18 diseño): ~14 % → ~55-65 % de columnas.
	const mountainH = 16 + crest * 14 + detail;
	// Interpolación lineal entre la altura plana y la de cordillera según la
	// rampa: los pies de montaña crecen gradualmente en vez de saltar.
	return Math.max(3, Math.floor(flat * (1 - wMnt) + mountainH * wMnt));
}

function getHeight(wx, wz) {
	const mnt = noise.noise2D_mountain(wx * 0.008, wz * 0.008);
	const h = heightFrom(
		noise.noise2D(wx * BIOME_FREQ, wz * BIOME_FREQ),
		smoothstep(MOUNTAIN_RAMP[0], MOUNTAIN_RAMP[1], mnt),
		wx,
		wz
	);
	// Fase 21 (v21.2, D1): la altura real del terreno incluye el valle del
	// río (orillas inclinadas hacia el cauce y el cauce bajo el nivel del
	// mar) — la misma altura que genera los chunks, para que los tests de
	// saltos/transiciones midan el terreno REAL.
	// Fase 15 (D5): Y de MUNDO — el diseño (3..27) se re-basa restando
	// DESIGN_OFFSET para que la superficie real quede anclada en ~0.
	return riverCarvedHeight(wx, wz, h) - DESIGN_OFFSET;
}

// Bloque de superficie: la etiqueta dominante manda (nieve en tundra y
// cumbres, roca en montañas bajas, arena en desierto, césped en el resto),
// pero el umbral de temperatura se desplaza con un jitter de ruido
// determinista para que las fronteras entre biomas sean onduladas y
// orgánicas en vez de una línea recta dura.
function flatSurfaceBlock(temp, j) {
	const t = temp + j * 0.03;
	if (t < SNOW_TEMP) return B.SNOW;
	if (t < -0.2) return B.GRASS; // taiga: césped (bosque frío, no nieve)
	if (t < -0.05) return B.SAND; // desierto
	return B.GRASS; // bosque, llanura, pantano y jungla comparten césped
}

function surfaceBlockFor(wx, wz, height, temp, mnt) {
	if (mnt > MOUNTAIN_THRESHOLD) {
		// `height` es Y de MUNDO (Fase 15 D5): la línea de nieve de diseño (18)
		// se convierte restando DESIGN_OFFSET (→ cumbres a partir de y=10).
		if (height >= MOUNTAIN_SNOW_LINE - DESIGN_OFFSET) return B.SNOW;
		return B.STONE;
	}
	return flatSurfaceBlock(temp, noise.noise2D_detail(wx * 0.11, wz * 0.11));
}

// Radio de búsqueda de tierra firme para el punto de aparición (bloques).

// Limpieza de cachés al re-sembrar (reinitNoise de noise.js): el bioma y los
// lagos dependen del seed. clearCaches se registra al cargar este módulo.
function clearCaches() {
	biomeCache.clear();
	lakeCache.clear();
}
noise.onReinit(clearCaches);

module.exports = {
	getBiome,
	biomeCacheStats,
	getHeight,
	surfaceBlockFor,
	heightFrom,
	flatSurfaceBlock,
	columnFloorY,
	oceanFloorY,
	oceanVariant,
	lakeFloorY,
	nearLake,
	isLake,
	isRiver,
	isOcean,
	OCEAN_FREQ,
	OCEAN_GATE,
	SEA_LEVEL,
	WORLD_SEA_LEVEL,
	DESIGN_OFFSET,
	LAKE_FLOOR,
	SNOW_TEMP,
	BIOME_FREQ,
	MOUNTAIN_THRESHOLD,
	MOUNTAIN_SNOW_LINE,
	smoothstep,
	MOUNTAIN_RAMP,
	riverDepth,
	riverFloorY,
	riverCarvedHeight,
	riverInfluence,
	riverBandW,
	RIVER_WIDTH,
	RIVER_BANK_MIN,
	RIVER_BANK_K,
	RIVER_FLOOR_CAP,
	biomeFrom
};
