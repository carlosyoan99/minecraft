// ============================================================
// LOD DE CHUNKS LEJANOS (Fase 6): decisión de nivel de detalle.
// Lógica PURA y testeable (sin THREE): los chunks lejanos se
// renderizan con geometría simplificada (heightmap por columna,
// color plano sin teselas finas) en vez del mesh completo
// texturizado — public/world.js construye la geometría, aquí solo
// se decide QUÉ tier toca según la distancia al jugador.
//
// Histéresis: se entra en LOD al superar LOD_ON_DIST y se vuelve
// al detalle completo al bajar de LOD_OFF_DIST. En la banda entre
// ambas se conserva el tier actual: un chunk cerca de la frontera
// no alterna de un frame a otro (parpadeo).
// ============================================================

// Distancias en BLOQUES desde el jugador al centro del chunk.
export const LOD_ON_DIST = 56; // al alejarse más de esto → LOD
export const LOD_OFF_DIST = 44; // al acercarse menos de esto → detalle completo

// Devuelve el tier deseado: 'full' | 'lod'. `current` es el tier actual
// (por defecto 'full': un chunk recién cargado empieza en detalle completo
// y solo baja a LOD si ya está lejos). Con histéresis entre las dos
// distancias para no alternar en la frontera.
export function lodTierFor(dist, current = "full") {
	if (current === "lod") return dist < LOD_OFF_DIST ? "full" : "lod";
	return dist > LOD_ON_DIST ? "lod" : "full";
}
