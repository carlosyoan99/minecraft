// ============================================================
// PALETA DEL CIELO POR HORA (Fase 7, estética)
// Lógica PURA (sin THREE ni DOM) para que sea testeable en Node,
// igual que quality.js / itemicons.js. Define los colores del
// degradado del cielo (cenit/horizonte) y del tinte cálido de
// amanecer/atardecer, interpolados por el factor de día y la fuerza
// del atardecer que calcula daynight.js.
// ============================================================

// Colores en {r,g,b} (0..255). El horizonte coincide con los colores
// históricos de daynight.js (DAY_SKY/NIGHT_SKY/DUSK_SKY) para que el
// cielo del dome sea coherente con el color de la niebla del mundo.
export const SKY_COLORS = {
	day: {
		horizon: { r: 0x87, g: 0xce, b: 0xeb },
		top: { r: 0x3d, g: 0x7f, b: 0xd4 }
	},
	dusk: {
		horizon: { r: 0xff, g: 0x7a, b: 0x3d },
		top: { r: 0x5a, g: 0x4a, b: 0x7a }
	},
	night: {
		horizon: { r: 0x0b, g: 0x10, b: 0x26 },
		top: { r: 0x05, g: 0x07, b: 0x0f }
	}
};

// Interpola dos colores {r,g,b} por t ∈ [0,1].
export function lerpRGB(a, b, t) {
	const k = Math.min(1, Math.max(0, t));
	return {
		r: a.r + (b.r - a.r) * k,
		g: a.g + (b.g - a.g) * k,
		b: a.b + (b.b - a.b) * k
	};
}

// Mezcla lineal de una lista de {color, peso}.
function mixColors(entries) {
	let r = 0,
		g = 0,
		b = 0,
		w = 0;
	for (const { color, weight } of entries) {
		r += color.r * weight;
		g += color.g * weight;
		b += color.b * weight;
		w += weight;
	}
	if (w <= 0) return { r, g, b };
	return { r: r / w, g: g / w, b: b / w };
}

// Paleta del cielo para una fase del ciclo.
//   dayFactor ∈ [0,1]  — 1 al mediodía, 0 de noche (sin(phase·2π)).
//   dusk     ∈ [0,1]  — fuerza del amanecer/atardecer (máx ~0.35).
// Devuelve { top, horizon, duskTint }: cenit, color del horizonte y el
// tinte cálido con el que el shader pinta la banda cercana al horizonte.
export function skyPalette(dayFactor, dusk) {
	const night = 1 - dayFactor;
	// Base: día → noche por el factor de día.
	const top = lerpRGB(SKY_COLORS.day.top, SKY_COLORS.night.top, night);
	const horizon = lerpRGB(
		SKY_COLORS.day.horizon,
		SKY_COLORS.night.horizon,
		night
	);
	// Tinte cálido: mezcla el horizonte hacia el naranja según dusk.
	const warmHorizon = mixColors([
		{ color: horizon, weight: 1 - dusk },
		{ color: SKY_COLORS.dusk.horizon, weight: dusk }
	]);
	const warmTop = mixColors([
		{ color: top, weight: 1 - dusk },
		{ color: SKY_COLORS.dusk.top, weight: dusk }
	]);
	return {
		top: warmTop,
		horizon: warmHorizon,
		duskTint: SKY_COLORS.dusk.horizon
	};
}
