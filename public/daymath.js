// ============================================================
// CÁLCULOS PUROS DEL CICLO DÍA/NOCHE (Fase 16, G3)
// Lógica sin THREE ni DOM para que sea testeable en Node (patrón
// quality.js / waterfog.js / lod.js). La usan daynight.js (cielo,
// luz, niebla) y clouds.js (tinte de las nubes); aquí solo viven
// las fórmulas, no la aplicación a la escena.
// ============================================================

// Franjas del ciclo día/noche estilo MC (Fase 18, C-1): día 10 min /
// atardecer 1,5 / noche 7 / amanecer 1,5 sobre DAY_CYCLE_MS (20 min).
// Fracciones de la fase [0,1) (0 = amanecer). Mantener en sincronía con
// DAY_PHASES de server/constants.js y public/constants.js (unit-sync).
export const DAY_PHASES = {
	dawnEnd: 0.075, // fin del amanecer → empieza el día
	dayEnd: 0.575, // fin del día → empieza el atardecer
	duskEnd: 0.65 // fin del atardecer → empieza la noche
};

// Segmento del ciclo en el que está la fase [0,1): "dawn" | "day" |
// "dusk" | "night". Puro y testeable (unit-dia) — es la fuente para el
// spawn hostil (night), la quema solar (day estricto) y el render.
export function segmentOf(phase) {
	if (phase < DAY_PHASES.dawnEnd) return "dawn";
	if (phase < DAY_PHASES.dayEnd) return "day";
	if (phase < DAY_PHASES.duskEnd) return "dusk";
	return "night";
}

// ¿Es noche ESTRICTA? (spawn de hostiles, dormir): fase ≥ duskEnd.
export function isNightPhase(phase) {
	return phase >= DAY_PHASES.duskEnd;
}

// ¿Es día ESTRICTO (sin crepúsculos)? Quema solar de no-muertos.
export function isDayPhase(phase) {
	return phase >= DAY_PHASES.dawnEnd && phase < DAY_PHASES.dayEnd;
}

// Factor de día: 1 durante el día completo, 0 en la noche. Transición
// LINEAL en los crepúsculos siguiendo las franjas MC (Fase 18, C-1): rampa
// 0→1 en el amanecer [0, dawnEnd), meseta 1 en el día [dawnEnd, dayEnd),
// rampa 1→0 en el atardecer [dayEnd, duskEnd), 0 en la noche [duskEnd, 1).
// Antes era un seno que se apagaba en fase 0.5 (atardecer visual adelantado
// a la franja de juego); con las franjas, el cielo sigue al reloj del
// servidor (spawn hostil/quema solar usan los mismos límites).
export function dayFactor(phase) {
	if (phase < DAY_PHASES.dawnEnd) return phase / DAY_PHASES.dawnEnd;
	if (phase < DAY_PHASES.dayEnd) return 1;
	if (phase < DAY_PHASES.duskEnd)
		return 1 - (phase - DAY_PHASES.dayEnd) / (DAY_PHASES.duskEnd - DAY_PHASES.dayEnd);
	return 0;
}

// Factor de atardecer/amanecer: cuánto naranja tiñe el cielo. Máximo cuando
// dayFactor ≈ 0.35 (sol bajo pero aún con luz); 0 al mediodía y de noche.
export function duskFactor(dayFactor) {
	return Math.max(
		0,
		Math.min(1, dayFactor * (1 - Math.abs(dayFactor - 0.35) * 2.2))
	);
}

// Niebla por hora del día: cerca (30 de noche → 75 al mediodía) y lejos
// (70 de noche → ~240 de día, +40 extra con atardecer).
export function fogDistances(dayFactor, dusk) {
	return {
		near: 30 + dayFactor * 45,
		far: 70 + dayFactor * 130 + dusk * 40
	};
}

// Tinte de las nubes (blanco de día, gris azulado de noche) y paso de
// cuantización (Fase 15, D1): solo se re-suben los colores al GPU cuando el
// tinte cambia ≥ CLOUD_TINT_STEP (~8 cambios por ciclo en vez de 60/s).
export function cloudTint(dayFactor) {
	return 0.35 + dayFactor * 0.65;
}
export const CLOUD_TINT_STEP = 0.03;
