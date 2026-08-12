// ============================================================
// PERFILES DE CALIDAD GRÁFICA Y CLAMPS DE AJUSTES (Fase 7)
// Lógica PURA (sin THREE ni DOM) para que sea testeable en Node,
// igual que lod.js / lighting.js / itemicons.js.
//
// - qualityProfile(name) devuelve el perfil de render: pixelRatio
//   máximo (se multiplica por devicePixelRatio al aplicar), sombras
//   activadas y resolución del shadow map.
// - clamp* limitan los valores de los ajustes del menú.
// ============================================================

// Perfiles: 'baja' / 'media' / 'alta'. El `renderScale` multiplica la
// resolución nativa del dispositivo (devicePixelRatio) — Fase 16 (B6): antes
// el perfil era un pixelRatio MÁXIMO y escena hacía min(dpr, perfil), que en
// pantallas dpr=1 dejaba los tres niveles con el mismo pixelRatio (1): la
// opción no tenía efecto visible. Ahora baja/media/alta escalan la resolución
// real (0.6× / 0.85× / 1×) y cambian las sombras, visible en cualquier
// pantalla.
export const QUALITY_PROFILES = {
	baja: { renderScale: 0.6, shadows: false, shadowSize: 512 },
	media: { renderScale: 0.85, shadows: true, shadowSize: 1024 },
	alta: { renderScale: 1, shadows: true, shadowSize: 2048 }
};
export const QUALITY_DEFAULT = "media";

// Perfil por nombre; nombres desconocidos caen al perfil por defecto.
export function qualityProfile(name) {
	return QUALITY_PROFILES[name] || QUALITY_PROFILES[QUALITY_DEFAULT];
}

// pixelRatio efectivo de un perfil para una pantalla con devicePixelRatio
// `dpr` (capped a 2 para no supersamplear absurdamente): resolución nativa ×
// renderScale del perfil, con suelo 0.5. Lógica pura (testeable).
function qualityPixelRatio(name, dpr) {
	const q = qualityProfile(name);
	return Math.max(0.5, Math.min(dpr || 1, 2) * q.renderScale);
}

// ¿Valor numérico usable? (rechaza null/undefined/string/NaN). Number(null)
// sería 0, así que hay que exigir typeof 'number' para los valores del menú.
function isNumber(v) {
	return typeof v === "number" && Number.isFinite(v);
}

// FOV de la cámara en grados (rango cómodo tipo Minecraft: 50..110).
export function clampFov(v) {
	if (!isNumber(v)) return 75;
	return Math.min(110, Math.max(50, Math.round(v)));
}

// Sensibilidad del ratón: multiplicador real de PointerLockControls
// (pointerSpeed, 1.0 = por defecto). Rango 0.2..3.0.
export function clampSensitivity(v) {
	if (!isNumber(v)) return 1;
	return Math.min(3, Math.max(0.2, v));
}

// Volumen de una categoría (master/efectos/ambiente): 0..1.
export function clampVolume(v) {
	if (!isNumber(v)) return 1;
	return Math.min(1, Math.max(0, v));
}

export { qualityPixelRatio };
