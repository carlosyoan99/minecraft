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

// Perfiles: 'baja' / 'media' / 'alta'. El pixelRatio es el MÁXIMO que
// usará el renderer (escena aplica min(devicePixelRatio, perfil)).
export const QUALITY_PROFILES = {
	baja: { pixelRatio: 1, shadows: false, shadowSize: 512 },
	media: { pixelRatio: 1.5, shadows: true, shadowSize: 1024 },
	alta: { pixelRatio: 2, shadows: true, shadowSize: 2048 }
};
export const QUALITY_DEFAULT = "media";

// Perfil por nombre; nombres desconocidos caen al perfil por defecto.
export function qualityProfile(name) {
	return QUALITY_PROFILES[name] || QUALITY_PROFILES[QUALITY_DEFAULT];
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
