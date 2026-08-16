// ============================================================
// MATERIAL STYLE (Fase 19.6, Bloques B y C)
// Estilo de material global del mundo: 'lambert' (por defecto) o 'toon'
// (MeshToonMaterial, toggle en Ajustes). La decisión es un booleano del
// módulo; no toca la geometría (el geopool se reutiliza) — solo se
// intercambia el material sobre las mallas vivas y en la creación de las
// nuevas (los chunks/mobs crean sus materiales con worldMaterial()).
//
// Agua y plantas no pasan por esta fábrica de estilo: usan sus propios
// ShaderMaterial (animados, C1/C2). El mundo "crisp" de cajas queda con
// MeshLambertMaterial por defecto; el toon es opcional y extra.
// ============================================================
import * as THREE from "three";

let toon = false;

export function isToon() {
	return toon;
}

export function setToon(v) {
	toon = !!v;
}

// PARAMS_OPACOS que se comparten entre el Lambert original y su gemelo
// toon (las propiedades que importan para conservar el mismo aspecto:
// textura, color por vértice, transparencia bombillas del atlas, lados).
const STYLE_PARAMS = [
	"map",
	"color",
	"vertexColors",
	"transparent",
	"opacity",
	"side",
	"depthWrite",
	"depthTest",
	"alphaTest"
];

// Guarda la pareja (original → gemelo) y (gemelo → original) para poder
// deshacer el swap al desactivar el toon sin reconstruir las mallas.
const toonTwins = new WeakMap();
const originalOfToon = new WeakMap();

function toonTwinOf(lambert) {
	let twin = toonTwins.get(lambert);
	if (!twin) {
		const params = {};
		for (const k of STYLE_PARAMS) params[k] = lambert[k];
		twin = new THREE.MeshToonMaterial(params);
		// Herencia del emissive del material opaco (lava brilla).
		if (lambert.emissive) twin.emissive.copy(lambert.emissive);
		if (lambert.emissiveIntensity !== undefined)
			twin.emissiveIntensity = lambert.emissiveIntensity;
		toonTwins.set(lambert, twin);
		originalOfToon.set(twin, lambert);
	}
	return twin;
}

// Crea un material del estilo activo. Los chunks comparten UNA instancia
// por categoría (se guardan en meshbuild); los mobs crean una por mob.
export function worldMaterial(params, original) {
	if (toon)
		return toonTwinOf(original || new THREE.MeshLambertMaterial(params));
	return original || new THREE.MeshLambertMaterial(params);
}

// Intercambia los materiales de TODAS las mallas del grupo raíz (la
// escena completa al activar/desactivar el toggle desde Ajustes) entre el
// estilo original y su gemelo toon. Los ShaderMaterial (agua, plantas,
// cielo, domo, nubes) se ignoran: no tienen gemelo.
export function applyMaterialStyle(root) {
	if (!root) return;
	root.traverse((o) => {
		if (!o.isMesh || !o.material) return;
		const m = o.material;
		if (m.isShaderMaterial) return;
		if (toon) {
			if (
				!m.isMeshToonMaterial &&
				(m.isMeshLambertMaterial || m.isMeshPhongMaterial)
			)
				o.material = toonTwinOf(m);
		} else {
			const orig = originalOfToon.get(m);
			if (orig) o.material = orig;
		}
	});
}
