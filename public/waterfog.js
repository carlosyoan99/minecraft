// ============================================================
// NIEBLA SUBMARINA (Fase 16, B1): decisión pura y testeable.
// La niebla azulada solo se activa con inmersión REAL de los ojos:
// a ≥2 bloques bajo la superficie del agua (nadando en la
// superficie, con los ojos fuera o a 1 bloque, no debe verse).
// Lógica pura (sin THREE ni DOM) para poder testearla en Node.
// ============================================================

// Profundidad efectiva de los ojos bajo la superficie: sube desde el techo
// del bloque de los ojos mientras la celda es agua y devuelve la distancia
// al primer aire (si los ojos están fuera del agua, <= 1).
export function waterSurfaceDepth(eyeY, isWaterAtY) {
	let surfaceY = Math.ceil(eyeY);
	while (isWaterAtY(surfaceY)) surfaceY++;
	return surfaceY - eyeY;
}

// ¿Activar la niebla submarina? Exige inmersión real: `inWater` (el cuerpo
// en el agua) Y profundidad de ojos >= 2 bloques.
export function shouldUnderwaterFog(eyeY, inWater, isWaterAtY) {
	return !!inWater && waterSurfaceDepth(eyeY, isWaterAtY) >= 2;
}
