// ============================================================
// TEXTURAS PROCEDURALES DE MOBS (16x16 px por tesela, pixel-art)
// Reemplazan los MOB_COLORS planos del servidor: cada tipo de mob
// tiene un atlas 2x2 (frente / lado / arriba / abajo) generado en un
// canvas al cargar el cliente. Sin assets binarios ni build step.
// El mesh se construye texturizado por cara en public/mobs.js (UVs
// por cara hacia el atlas). Misma filosofía que textures.js.
// ============================================================
import * as THREE from "three";

const TILE = 16; // px por tesela
const COLS = 2; // teselas por fila (atlas 2x2)

// --- PRNG determinista (mulberry32): el atlas es estable entre cargas ---
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

// --- helpers de pintado pixel-art ---
function fill(ctx, color) {
	ctx.fillStyle = color;
	ctx.fillRect(0, 0, TILE, TILE);
}
function px(ctx, x, y, color) {
	ctx.fillStyle = color;
	ctx.fillRect(x, y, 1, 1);
}
function rect(ctx, x, y, w, h, color) {
	ctx.fillStyle = color;
	ctx.fillRect(x, y, w, h);
}
function speckle(ctx, rng, color, density) {
	ctx.fillStyle = color;
	for (let y = 0; y < TILE; y++) {
		for (let x = 0; x < TILE; x++) {
			if (rng() < density) ctx.fillRect(x, y, 1, 1);
		}
	}
}

// ============================================================
// ZOMBIE — piel verdosa, camisa azul rota, pantalón oscuro
// ============================================================
const Z = {
	skin: "#5d8f4a",
	skinDark: "#4a7a3a",
	hair: "#3a3a2a",
	eye: "#141414",
	shirt: "#3a5f8f",
	shirtDark: "#2c4770",
	pants: "#4a4a5a",
	pantsDark: "#393948"
};
function drawZombieFront(ctx, rng) {
	fill(ctx, Z.skin);
	// pelo despeinado
	rect(ctx, 1, 0, 14, 2, Z.hair);
	for (let i = 0; i < 5; i++) px(ctx, 1 + Math.floor(rng() * 14), 2, Z.hair);
	// ojos (2x1)
	rect(ctx, 4, 3, 2, 1, Z.eye);
	rect(ctx, 10, 3, 2, 1, Z.eye);
	px(ctx, 7, 4, Z.skinDark);
	px(ctx, 8, 4, Z.skinDark); // nariz
	// boca torcida
	rect(ctx, 5, 6, 6, 2, Z.eye);
	px(ctx, 6, 6, Z.skinDark);
	px(ctx, 9, 7, Z.skinDark);
	// cuello
	rect(ctx, 6, 8, 4, 1, Z.skinDark);
	// camisa rota
	rect(ctx, 1, 9, 14, 7, Z.shirt);
	speckle(ctx, rng, Z.shirtDark, 0.14);
	px(ctx, 2, 11, Z.skin);
	px(ctx, 13, 12, Z.skin);
}
function drawZombieSide(ctx, rng) {
	fill(ctx, Z.skin);
	speckle(ctx, rng, Z.skinDark, 0.14);
	rect(ctx, 0, 9, TILE, 7, Z.shirt);
	speckle(ctx, rng, Z.shirtDark, 0.12);
}
function drawZombieTop(ctx, rng) {
	fill(ctx, Z.hair);
	speckle(ctx, rng, Z.skinDark, 0.15);
}
function drawZombieBottom(ctx, rng) {
	fill(ctx, Z.pants);
	speckle(ctx, rng, Z.pantsDark, 0.2);
}

// ============================================================
// CREEPER — verde moteado con la cara clásica de 4 ojos
// ============================================================
const C = {
	body: "#2e7d32",
	bodyDark: "#1b5e20",
	bodyLight: "#43a047",
	face: "#0d0d0d"
};
function drawCreeperFront(ctx, rng) {
	fill(ctx, C.body);
	speckle(ctx, rng, C.bodyDark, 0.1);
	speckle(ctx, rng, C.bodyLight, 0.06);
	// ojos 2x2 y boca característica del creeper
	rect(ctx, 3, 2, 2, 2, C.face);
	rect(ctx, 11, 2, 2, 2, C.face);
	rect(ctx, 5, 7, 2, 2, C.face);
	rect(ctx, 9, 7, 2, 2, C.face);
	rect(ctx, 6, 9, 4, 1, C.face);
	rect(ctx, 7, 10, 2, 1, C.face);
}
function drawCreeperSide(ctx, rng) {
	fill(ctx, C.body);
	speckle(ctx, rng, C.bodyDark, 0.12);
	speckle(ctx, rng, C.bodyLight, 0.08);
}
function drawCreeperTop(ctx, rng) {
	fill(ctx, C.bodyDark);
	speckle(ctx, rng, C.body, 0.3);
}
function drawCreeperBottom(ctx, rng) {
	fill(ctx, C.bodyDark);
	speckle(ctx, rng, C.bodyLight, 0.1);
}

// ============================================================
// SKELETON — huesos pálidos, cuencas negras y costillas
// ============================================================
const S = {
	bone: "#d8d8d8",
	boneDark: "#9a9a9a",
	boneLight: "#f0f0f0",
	socket: "#141414"
};
function drawSkeletonFront(ctx, rng) {
	fill(ctx, S.bone);
	speckle(ctx, rng, S.boneDark, 0.08);
	// cráneo: cuencas
	rect(ctx, 3, 1, 3, 2, S.socket);
	rect(ctx, 10, 1, 3, 2, S.socket);
	rect(ctx, 7, 2, 2, 1, S.socket); // nariz
	// mandíbula
	rect(ctx, 4, 5, 8, 2, S.boneDark);
	px(ctx, 5, 5, S.bone);
	px(ctx, 10, 6, S.bone);
	// costillas en el torso
	rect(ctx, 1, 9, 14, 7, S.boneDark);
	rect(ctx, 3, 10, 10, 1, S.bone);
	rect(ctx, 4, 12, 8, 1, S.bone);
	rect(ctx, 5, 14, 6, 1, S.bone);
}
function drawSkeletonSide(ctx, rng) {
	fill(ctx, S.bone);
	speckle(ctx, rng, S.boneDark, 0.1);
	// costillas verticales
	for (let y = 9; y < TILE; y += 2) rect(ctx, 0, y, TILE, 1, S.boneDark);
}
function drawSkeletonTop(ctx, rng) {
	fill(ctx, S.boneLight);
	speckle(ctx, rng, S.boneDark, 0.12);
}
function drawSkeletonBottom(ctx, rng) {
	fill(ctx, S.boneDark);
	speckle(ctx, rng, S.bone, 0.15);
}

// ============================================================
// ENDERMAN — negro profundo con ojos morados brillantes
// ============================================================
const E = {
	body: "#16161f",
	bodyLight: "#242433",
	eye: "#b26bd6",
	eyeHot: "#d9a3f0"
};
function drawEndermanFront(ctx, rng) {
	fill(ctx, E.body);
	speckle(ctx, rng, E.bodyLight, 0.06);
	// ojos morados 3x2 con núcleo brillante
	rect(ctx, 4, 2, 3, 2, E.eye);
	rect(ctx, 9, 2, 3, 2, E.eye);
	px(ctx, 5, 2, E.eyeHot);
	px(ctx, 10, 3, E.eyeHot);
}
function drawEndermanSide(ctx, rng) {
	fill(ctx, E.body);
	speckle(ctx, rng, E.bodyLight, 0.08);
}
function drawEndermanTop(ctx, rng) {
	fill(ctx, E.body);
	speckle(ctx, rng, E.bodyLight, 0.05);
}
function drawEndermanBottom(ctx, rng) {
	fill(ctx, "#0f0f17");
}

// ============================================================
// SPIDER — cuerpo oscuro con racimo de ojos rojos
// ============================================================
const SP = {
	body: "#4a3f35",
	bodyDark: "#332b24",
	bodyLight: "#5d5146",
	eye: "#e03030",
	eyeHot: "#ff8080"
};
function drawSpiderFront(ctx, rng) {
	fill(ctx, SP.body);
	speckle(ctx, rng, SP.bodyDark, 0.12);
	// racimo de ojos rojos (4 en fila)
	rect(ctx, 4, 2, 8, 2, SP.bodyDark);
	px(ctx, 5, 2, SP.eye);
	px(ctx, 7, 2, SP.eyeHot);
	px(ctx, 9, 2, SP.eye);
	px(ctx, 11, 2, SP.eyeHot);
	// quelíceros
	px(ctx, 6, 4, SP.eye);
	px(ctx, 10, 4, SP.eye);
}
function drawSpiderSide(ctx, rng) {
	fill(ctx, SP.body);
	speckle(ctx, rng, SP.bodyDark, 0.1);
	// patas diagonales
	for (let i = 0; i < 4; i++) {
		const y = 3 + i * 3;
		rect(ctx, 0, y, 5, 1, SP.bodyDark);
		rect(ctx, 11, y, 5, 1, SP.bodyDark);
	}
}
function drawSpiderTop(ctx, rng) {
	fill(ctx, SP.bodyDark);
	speckle(ctx, rng, SP.bodyLight, 0.12);
}
function drawSpiderBottom(ctx, rng) {
	fill(ctx, SP.bodyDark);
	speckle(ctx, rng, SP.body, 0.2);
}

// ============================================================
// WOLF — gris con orejas y hocico claro
// ============================================================
const W = {
	fur: "#9a9a9a",
	furDark: "#767676",
	furLight: "#c0c0c0",
	muzzle: "#e0e0e0",
	nose: "#2a2a2a",
	eye: "#2a2a2a"
};
function drawWolfFront(ctx, rng) {
	fill(ctx, W.fur);
	speckle(ctx, rng, W.furDark, 0.1);
	// orejas
	rect(ctx, 2, 0, 2, 2, W.furDark);
	rect(ctx, 12, 0, 2, 2, W.furDark);
	// ojos
	px(ctx, 4, 3, W.eye);
	px(ctx, 11, 3, W.eye);
	// hocico claro con nariz
	rect(ctx, 5, 5, 6, 6, W.muzzle);
	rect(ctx, 7, 5, 2, 2, W.nose);
	px(ctx, 6, 7, W.nose);
	px(ctx, 9, 7, W.nose);
	rect(ctx, 6, 9, 4, 1, W.nose); // boca
}
function drawWolfSide(ctx, rng) {
	fill(ctx, W.fur);
	speckle(ctx, rng, W.furDark, 0.16);
	speckle(ctx, rng, W.furLight, 0.08);
}
function drawWolfTop(ctx, rng) {
	fill(ctx, W.fur);
	rect(ctx, 2, 0, 2, 2, W.furDark);
	rect(ctx, 12, 0, 2, 2, W.furDark);
	speckle(ctx, rng, W.furDark, 0.1);
}
function drawWolfBottom(ctx, rng) {
	fill(ctx, W.muzzle);
	speckle(ctx, rng, W.fur, 0.12);
}

// ============================================================
// COW — marrón con manchas blancas y hocico rosa
// ============================================================
const CO = {
	body: "#6b4226",
	bodyDark: "#52301c",
	patch: "#f0ebe0",
	muzzle: "#e8a0a0",
	horn: "#d8cfa8",
	eye: "#141414"
};
function drawCowFront(ctx, rng) {
	fill(ctx, CO.body);
	speckle(ctx, rng, CO.bodyDark, 0.12);
	// cuernos
	px(ctx, 1, 1, CO.horn);
	px(ctx, 2, 1, CO.horn);
	px(ctx, 13, 1, CO.horn);
	px(ctx, 14, 1, CO.horn);
	// ojos
	px(ctx, 4, 3, CO.eye);
	px(ctx, 11, 3, CO.eye);
	// hocico rosa claro con fosas
	rect(ctx, 5, 6, 6, 5, CO.muzzle);
	px(ctx, 6, 7, CO.bodyDark);
	px(ctx, 9, 7, CO.bodyDark);
	rect(ctx, 6, 9, 4, 1, CO.bodyDark);
}
function drawCowSide(ctx, rng) {
	fill(ctx, CO.body);
	speckle(ctx, rng, CO.bodyDark, 0.14);
	// manchas blancas irregulares
	for (let i = 0; i < 4; i++) {
		const x = Math.floor(rng() * 10);
		const y = Math.floor(rng() * 10);
		rect(
			ctx,
			x,
			y,
			3 + Math.floor(rng() * 3),
			2 + Math.floor(rng() * 2),
			CO.patch
		);
	}
}
function drawCowTop(ctx, rng) {
	fill(ctx, CO.body);
	rect(ctx, 0, 0, 7, 6, CO.patch);
	rect(ctx, 9, 8, 7, 5, CO.patch);
	speckle(ctx, rng, CO.bodyDark, 0.1);
}
function drawCowBottom(ctx, rng) {
	fill(ctx, CO.bodyDark);
	speckle(ctx, rng, CO.body, 0.2);
}

// ============================================================
// PIG — rosa con hocico oscuro y fosas
// ============================================================
const P = {
	body: "#f0a8b8",
	bodyDark: "#d98a9e",
	bodyLight: "#f8c4d0",
	snout: "#d98a9e",
	eye: "#3a1a1a"
};
function drawPigFront(ctx, rng) {
	fill(ctx, P.body);
	speckle(ctx, rng, P.bodyDark, 0.08);
	// orejas
	px(ctx, 2, 1, P.bodyDark);
	px(ctx, 13, 1, P.bodyDark);
	// ojos
	px(ctx, 4, 3, P.eye);
	px(ctx, 11, 3, P.eye);
	// hocico ovalado con fosas
	rect(ctx, 5, 6, 6, 4, P.snout);
	rect(ctx, 6, 7, 2, 2, P.eye);
	rect(ctx, 9, 7, 2, 2, P.eye);
}
function drawPigSide(ctx, rng) {
	fill(ctx, P.body);
	speckle(ctx, rng, P.bodyDark, 0.14);
	speckle(ctx, rng, P.bodyLight, 0.1);
}
function drawPigTop(ctx, rng) {
	fill(ctx, P.bodyLight);
	speckle(ctx, rng, P.body, 0.15);
}
function drawPigBottom(ctx, rng) {
	fill(ctx, P.bodyDark);
	speckle(ctx, rng, P.body, 0.18);
}

// ============================================================
// CHICKEN — crema con cresta roja y pico naranja
// ============================================================
const CH = {
	body: "#f2e08a",
	bodyDark: "#d9c26a",
	bodyLight: "#f8f0b8",
	comb: "#c0392b",
	beak: "#e88a2a",
	eye: "#141414"
};
function drawChickenFront(ctx, rng) {
	fill(ctx, CH.body);
	speckle(ctx, rng, CH.bodyDark, 0.1);
	// cresta roja
	rect(ctx, 5, 0, 2, 2, CH.comb);
	rect(ctx, 9, 0, 2, 2, CH.comb);
	px(ctx, 7, 0, CH.comb);
	px(ctx, 8, 0, CH.comb);
	// ojo
	px(ctx, 5, 3, CH.eye);
	// pico naranja
	rect(ctx, 7, 3, 3, 2, CH.beak);
	px(ctx, 9, 4, CH.beak);
	// barbilla
	px(ctx, 7, 5, CH.comb);
	px(ctx, 8, 5, CH.comb);
}
function drawChickenSide(ctx, rng) {
	fill(ctx, CH.body);
	speckle(ctx, rng, CH.bodyDark, 0.12);
	// ala
	rect(ctx, 2, 6, 12, 4, CH.bodyLight);
	rect(ctx, 2, 6, 12, 1, CH.bodyDark);
}
function drawChickenTop(ctx, rng) {
	fill(ctx, CH.bodyLight);
	rect(ctx, 6, 0, 4, 2, CH.comb);
	speckle(ctx, rng, CH.body, 0.15);
}
function drawChickenBottom(ctx, rng) {
	fill(ctx, CH.bodyDark);
	speckle(ctx, rng, CH.body, 0.2);
}

// ============================================================
// SHEEP — lana blanca rizada con cara crema
// ============================================================
const SH = {
	wool: "#f5f5f0",
	woolDark: "#d9d9d2",
	woolLight: "#ffffff",
	face: "#e8d8c0",
	ear: "#c9b89a",
	eye: "#2a2a2a"
};
function drawSheepFront(ctx, rng) {
	fill(ctx, SH.wool);
	speckle(ctx, rng, SH.woolDark, 0.12);
	// cara crema con orejas
	rect(ctx, 3, 3, 10, 9, SH.face);
	rect(ctx, 1, 5, 2, 3, SH.ear);
	rect(ctx, 13, 5, 2, 3, SH.ear);
	// ojos y hocico
	px(ctx, 5, 5, SH.eye);
	px(ctx, 10, 5, SH.eye);
	rect(ctx, 7, 8, 2, 1, SH.eye);
	rect(ctx, 6, 10, 4, 1, SH.ear);
}
function drawSheepSide(ctx, rng) {
	fill(ctx, SH.wool);
	speckle(ctx, rng, SH.woolDark, 0.2);
	speckle(ctx, rng, SH.woolLight, 0.1);
}
function drawSheepTop(ctx, rng) {
	fill(ctx, SH.woolLight);
	speckle(ctx, rng, SH.wool, 0.25);
}
function drawSheepBottom(ctx, rng) {
	fill(ctx, SH.woolDark);
	speckle(ctx, rng, SH.wool, 0.25);
}

// ============================================================
// RABBIT — crema con orejas largas en el lomo
// ============================================================
const R = {
	body: "#d9c8a8",
	bodyDark: "#b89a6e",
	bodyLight: "#eadfc4",
	ear: "#b89a6e",
	earIn: "#e8a0a0",
	nose: "#e88a8a",
	eye: "#2a2a2a"
};
function drawRabbitFront(ctx, rng) {
	fill(ctx, R.body);
	speckle(ctx, rng, R.bodyDark, 0.1);
	// ojos
	px(ctx, 4, 3, R.eye);
	px(ctx, 11, 3, R.eye);
	// nariz rosa y boca
	px(ctx, 7, 5, R.nose);
	px(ctx, 8, 5, R.nose);
	px(ctx, 7, 6, R.bodyDark);
	px(ctx, 8, 6, R.bodyDark);
	px(ctx, 6, 7, R.bodyDark);
	px(ctx, 9, 7, R.bodyDark);
}
function drawRabbitSide(ctx, rng) {
	fill(ctx, R.body);
	speckle(ctx, rng, R.bodyDark, 0.14);
	speckle(ctx, rng, R.bodyLight, 0.1);
}
function drawRabbitTop(ctx, rng) {
	fill(ctx, R.body);
	// orejas largas con interior rosado
	rect(ctx, 3, 1, 3, 11, R.ear);
	rect(ctx, 10, 1, 3, 11, R.ear);
	rect(ctx, 4, 2, 1, 9, R.earIn);
	rect(ctx, 11, 2, 1, 9, R.earIn);
}
function drawRabbitBottom(ctx, rng) {
	fill(ctx, R.bodyLight);
	speckle(ctx, rng, R.body, 0.15);
}

// ============================================================
// MAPA DE RECETAS POR TIPO (una tesela por cara: front/side/top/bottom)
// ============================================================
const MOB_TEXTURES = {
	zombie: {
		front: drawZombieFront,
		side: drawZombieSide,
		top: drawZombieTop,
		bottom: drawZombieBottom
	},
	creeper: {
		front: drawCreeperFront,
		side: drawCreeperSide,
		top: drawCreeperTop,
		bottom: drawCreeperBottom
	},
	skeleton: {
		front: drawSkeletonFront,
		side: drawSkeletonSide,
		top: drawSkeletonTop,
		bottom: drawSkeletonBottom
	},
	enderman: {
		front: drawEndermanFront,
		side: drawEndermanSide,
		top: drawEndermanTop,
		bottom: drawEndermanBottom
	},
	spider: {
		front: drawSpiderFront,
		side: drawSpiderSide,
		top: drawSpiderTop,
		bottom: drawSpiderBottom
	},
	wolf: {
		front: drawWolfFront,
		side: drawWolfSide,
		top: drawWolfTop,
		bottom: drawWolfBottom
	},
	cow: {
		front: drawCowFront,
		side: drawCowSide,
		top: drawCowTop,
		bottom: drawCowBottom
	},
	pig: {
		front: drawPigFront,
		side: drawPigSide,
		top: drawPigTop,
		bottom: drawPigBottom
	},
	chicken: {
		front: drawChickenFront,
		side: drawChickenSide,
		top: drawChickenTop,
		bottom: drawChickenBottom
	},
	sheep: {
		front: drawSheepFront,
		side: drawSheepSide,
		top: drawSheepTop,
		bottom: drawSheepBottom
	},
	rabbit: {
		front: drawRabbitFront,
		side: drawRabbitSide,
		top: drawRabbitTop,
		bottom: drawRabbitBottom
	}
};

const FACE_ORDER = ["front", "side", "top", "bottom"];
const atlasCache = new Map();

// Atlas 2x2 de un tipo de mob (frente=0, lado=1, arriba=2, abajo=3).
// Se genera una sola vez y se cachea; devuelve null si el tipo es desconocido
// (el mesh cae a material de color plano, como MOB_COLORS).
export function getMobAtlas(type) {
	const recetas = MOB_TEXTURES[type];
	if (!recetas) return null;
	const cached = atlasCache.get(type);
	if (cached) return cached;
	const canvas = document.createElement("canvas");
	canvas.width = COLS * TILE;
	canvas.height = 2 * TILE; // 2 filas
	const ctx = canvas.getContext("2d");
	FACE_ORDER.forEach((cara, i) => {
		const rng = mulberry32(
			0x9e3779b9 ^ (type.length * 7919) ^ (i * 2654435761)
		);
		ctx.save();
		ctx.translate((i % COLS) * TILE, Math.floor(i / COLS) * TILE);
		recetas[cara](ctx, rng);
		ctx.restore();
	});
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.colorSpace = THREE.SRGBColorSpace;
	atlasCache.set(type, texture);
	return texture;
}

// Rectángulos UV [u0, v0, u1, v1] de cada cara en el atlas 2x2 (v0 abajo, v1
// arriba, misma convención que textures.js). Índice de tesela i: fila i/2,
// columna i%2 — front=0, side=1, top=2, bottom=3.
export function mobFaceRects() {
	const rows = 2;
	const r = (i) => {
		const col = i % COLS;
		const row = Math.floor(i / COLS);
		const u0 = col / COLS,
			u1 = (col + 1) / COLS;
		const v1 = 1 - row / rows,
			v0 = 1 - (row + 1) / rows;
		return [u0, v0, u1, v1];
	};
	return { front: r(0), side: r(1), top: r(2), bottom: r(3) };
}

// Tipos cubiertos por las texturas (lo audita tests/unit-sync.js contra
// MOB_COLORS del servidor: ambos deben cubrir el mismo universo de mobs).
export function mobTextureTypes() {
	return Object.keys(MOB_TEXTURES);
}
