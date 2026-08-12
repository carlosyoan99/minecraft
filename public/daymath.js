// ============================================================
// CÁLCULOS PUROS DEL CICLO DÍA/NOCHE (Fase 16, G3)
// Lógica sin THREE ni DOM para que sea testeable en Node (patrón
// quality.js / waterfog.js / lod.js). La usan daynight.js (cielo,
// luz, niebla) y clouds.js (tinte de las nubes); aquí solo viven
// las fórmulas, no la aplicación a la escena.
// ============================================================

// Factor de día: 1 al mediodía, 0 en la noche. Transición suave con seno
// sobre la fase [0,1) (0 = amanecer, 0.25 = mediodía, 0.5 = atardecer,
// 0.75 = medianoche). Nunca negativo: en el hemisferio nocturno (seno
// negativo) el factor es 0.
export function dayFactor(phase) {
	return Math.max(0, Math.sin(phase * Math.PI * 2));
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
