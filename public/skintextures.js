// ============================================================
// ATLAS DE SKIN PARA EL HUMANOIDE (capa fina de THREE)
// Convierte la matriz pura de public/skins.js en un CanvasTexture
// de una fila (head/body/arm/leg, 4 teselas de 16×16) con sus
// rects normalizados para el remapeo de UV de buildPartGroup
// (public/mobs.js). Sin assets binarios ni build step.
// ============================================================
import * as THREE from "three";
import { isValidSkin, paintTile } from "./skins.js";

const TILE = 16;
// Fase 22.3 (B1): "headSide" = lateral de la cabeza sin cara (la
// frontal sigue siendo "head"); buildPartGroup reparte las 6 caras.
const PARTS = ["head", "headSide", "body", "arm", "leg"];

// Devuelve { texture, rects } para el humanoide del jugador. Si el
// skin no es válido cae a "steve" (defensivo: el servidor ya lo
// valida, pero un init viejo podría traer skin indefinido).
export function getSkinAtlas(skinId) {
	const id = isValidSkin(skinId) ? skinId : "steve";
	const canvas = document.createElement("canvas");
	canvas.width = TILE * PARTS.length;
	canvas.height = TILE;
	const ctx = canvas.getContext("2d");
	ctx.imageSmoothingEnabled = false;
	PARTS.forEach((part, i) => {
		ctx.save();
		ctx.translate(i * TILE, 0);
		paintTile(ctx, id, part, 1);
		ctx.restore();
	});
	const texture = new THREE.CanvasTexture(canvas);
	// Pixel-art: sin suavizado al escalar la textura en el GPU.
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	const rects = {};
	PARTS.forEach((part, i) => {
		rects[part] = [i / PARTS.length, 0, (i + 1) / PARTS.length, 1];
	});
	return { texture, rects };
}
