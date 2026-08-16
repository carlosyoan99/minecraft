// ============================================================
// SELECCIÓN DE ANTORCHAS PARA LUZ PUNTUAL (Fase 19.6, Bloque A2)
// Lógica PURA (sin THREE ni DOM) de la luz real de antorchas: qué
// antorchas del set conocidas se encienden alrededor del jugador,
// respetando el presupuesto máximo. La gestion de PointLight (crear/
// ocultar/posicionar) vive en torchlights.js (main-thread); aquí solo
// la decisión, testeable en Node como todo el módulo draglogic.
// ============================================================

// Presupuesto máximo de PointLight activas (spec: 4-6; 4 es suficiente para
// que las antorchas de una cueva/pueblo se enciendan sin petar el perfil
// alto). Es la fuente única: torchlights.js la importa de aquí.
export const TORCH_LIGHT_BUDGET = 4;

// Dada la lista de antorchas [[wx,wy,wz], ...], la posición del jugador y
// el presupuesto, devuelve las posiciones de las `budget` antorchas MÁS
// cercanas dentro del radio (bloques). Vacío si no hay ninguna dentro.
// Devuelve arrays reutilizables no ordenados: [tx,ty,tz] del set vuelve
// tal cual (sin copias por frame).
export function selectTorchLights(torches, px, py, pz, radius, budget) {
	const r2 = radius * radius;
	const near = [];
	for (const t of torches) {
		const dx = t[0] + 0.5 - px,
			dy = t[1] + 0.5 - py,
			dz = t[2] + 0.5 - pz;
		const d2 = dx * dx + dy * dy + dz * dz;
		if (d2 <= r2) near.push([d2, t]);
	}
	near.sort((a, b) => a[0] - b[0]);
	return near.slice(0, budget).map((e) => e[1]);
}
