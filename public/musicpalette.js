// ============================================================
// PALETA MUSICAL POR BIOMA (Fase 19.5, A1)
// Lógica pura y determinista: dado un bioma (etiqueta del servidor,
// `world.getBiome`) devuelve la escala/volumen/espaciado de la música
// generativa. Sin Math.random, sin DOM ni Web Audio — testeable en Node.
// audio.js la usa para elegir la paleta; player.js mantiene el contexto
// de cueva como prioridad (un techo manda sobre el bioma).
// ============================================================

// Escala pentatónica de La (A3..C5) — base del clon (Fase 10).
export const BASE_SCALE = [
	220, // A3
	261.63, // C4
	293.66, // D4
	329.63, // E4
	392.0, // G4
	440.0, // A4
	523.25 // C5
];

// Frecuencias puras por bioma (índices sobre BASE_SCALE). Cada bioma del
// servidor (server/biomes.js) tiene su carácter: jungle más notas (escala
// exótica ampliada), swamp grave, ocean ondulada/grave, mountain vacía y
// espaciada, snow/taiga cristalina aguda, desert brillante, forest/plains
// la base. La cueva no está aquí: manda por encima (cave > biome).
const BIOME_PALETTES = {
	jungle: { pool: [0, 1, 2, 3, 4, 5, 6], vol: 1.1, gapMin: 2800 },
	swamp: { pool: [0, 1, 2], vol: 0.65, gapMin: 4200 },
	ocean: { pool: [0, 2, 4], vol: 0.8, gapMin: 3800 },
	mountain: { pool: [1, 3, 5], vol: 0.75, gapMin: 4600 },
	snow: { pool: [3, 4, 6], vol: 0.9, gapMin: 3200 },
	taiga: { pool: [3, 4, 6], vol: 0.9, gapMin: 3200 },
	desert: { pool: [4, 5, 6], vol: 1.15, gapMin: 2600 },
	// Fase 21.5 (E5): badlands — paleta más grave y espaciada que el
	// desierto (viento árido sobre mesetas); notas 0-2-4 (grave) con
	// volumen medio y gaps amplios (4000ms) para transmitir soledad.
	badlands: { pool: [0, 2, 4], vol: 0.85, gapMin: 4000 },
	forest: { pool: [1, 2, 3, 4, 5], vol: 1.0, gapMin: 3000 },
	plains: { pool: [1, 2, 3, 4, 5], vol: 1.0, gapMin: 3000 },
	// Fase 21.5 (F1): Pale Garden — paleta sutil y espaciada (bosque pálido,
	// niebla ligera). Notas graves con gaps amplios para transmitir
	// misterio/quietud, similar a taiga pero más suave.
	pale_garden: { pool: [0, 2, 3], vol: 0.7, gapMin: 4200 }
};

// Cueva: escala grave y espaciada (manda sobre el bioma).
const CAVE_PALETTE = { pool: [0, 1, 2], vol: 0.7, gapMin: 5000 };

// Paleta de día/noche por defecto (bioma desconocido o sin coincidencia):
// de día brillante (2..6), de noche grave (0..4). dayFactor 0..1.
export function defaultDayNightPool(dayFactor) {
	return dayFactor > 0.5 ? [2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
}

// Devuelve { pool, vol, gapMin } para un bioma. Bioma desconocido → null
// (el llamador usa el día/noche por defecto).
export function paletteForBiome(biome) {
	if (!biome) return null;
	return BIOME_PALETTES[biome] || null;
}

export function cavePalette() {
	return CAVE_PALETTE;
}

// Frecuencia concreta para un índice de escala (contenedor de constantes
// para los tests: el módulo exporta las frecuencias tal cual).
export function freqAt(index) {
	return BASE_SCALE[index];
}

// Cobertura: biomas conocidos del servidor (para el test de paridad).
export const KNOWN_BIOMES = Object.keys(BIOME_PALETTES);
