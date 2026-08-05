// ============================================================
// ATLAS DE TEXTURAS (16x16 px por cara, estilo pixel-art)
// Generado proceduralmente en un canvas al cargar el cliente:
// sin assets binarios ni build step. Una única CanvasTexture
// compartida por todos los chunks; cada cara del bloque elige
// su tesela (top/bottom/lados) con UVs por cara.
// ============================================================
import * as THREE from "three";

const TILE = 16; // px por tesela
const COLS = 8; // teselas por fila en el atlas

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

// --- paleta (estilo Minecraft clásico, tonos suaves) ---
const PAL = {
	dirt: "#8a5a2b",
	dirtDark: "#6f4a22",
	dirtLight: "#9c6b3a",
	grass: "#5fb83f",
	grassDark: "#4a9a33",
	grassLight: "#7ad04f",
	stone: "#8a8a8a",
	stoneDark: "#6f6f6f",
	stoneLight: "#a0a0a0",
	bark: "#6b4a2b",
	barkDark: "#4f3520",
	barkLight: "#8a6840",
	wood: "#c9a46b",
	woodDark: "#a8824f",
	woodLight: "#d9b884",
	leaf: "#3a7a2e",
	leafDark: "#2c5f22",
	leafLight: "#4a9440",
	sand: "#e0c88a",
	sandDark: "#c9b070",
	sandLight: "#ecd9a4",
	coal: "#33393d",
	iron: "#b08968",
	gold: "#e8c547",
	diamond: "#7fffea",
	redstone: "#c03a3a",
	emerald: "#22c97a",
	glass: "#bee7f0",
	glassLight: "#e8f8fc",
	wool: "#f5f5f0",
	woolDark: "#d9d9d2",
	bed: "#c0392b",
	bedDark: "#8e2b1f",
	bedLight: "#d94a3d",
	pillow: "#f2ece4",
	bedrock: "#1a1a1a",
	bedrockDark: "#0f0f0f",
	water: "#3a6fd8",
	waterLight: "#5a8ff0",
	waterDark: "#2a54a8",
	furnace: "#5a5a5a",
	furnaceDark: "#3a3a3a",
	furnaceLight: "#7a7a7a",
	fire: "#ff8c1a",
	fireLight: "#ffd23f",
	snow: "#e8f4f8",
	snowDark: "#cddee8",
	snowLight: "#f7fbfd",
	lava: "#e25822",
	lavaDark: "#a83218",
	lavaLight: "#ff8c1a",
	lavaHot: "#ffd23f",
	metal: "#9aa0a6",
	metalDark: "#6c7176",
	metalLight: "#c3c9cf",
	flame: "#ff8c1a",
	flameDark: "#e0551a",
	flameLight: "#ffe14d"
};

// --- recetas de tesela (16x16) ---
// Cada receta recibe (ctx, rng) y pinta SOLO su tesela (el canvas ya está
// trasladado al origen de la tesela).
function drawDirt(ctx, rng) {
	fill(ctx, PAL.dirt);
	speckle(ctx, rng, PAL.dirtDark, 0.12);
	speckle(ctx, rng, PAL.dirtLight, 0.08);
}
function drawGrassTop(ctx, rng) {
	fill(ctx, PAL.grass);
	speckle(ctx, rng, PAL.grassDark, 0.15);
	speckle(ctx, rng, PAL.grassLight, 0.1);
}
function drawGrassSide(ctx, rng) {
	drawDirt(ctx, rng);
	// borde de césped irregular en las filas superiores (2-3 px)
	for (let x = 0; x < TILE; x++) {
		const h = 2 + Math.floor(rng() * 2);
		for (let y = 0; y <= h; y++)
			px(ctx, x, y, y === 0 ? PAL.grassLight : PAL.grass);
		if (rng() < 0.4) px(ctx, x, h + 1, PAL.grassDark);
	}
}
function drawStone(ctx, rng) {
	fill(ctx, PAL.stone);
	speckle(ctx, rng, PAL.stoneDark, 0.15);
	speckle(ctx, rng, PAL.stoneLight, 0.1);
}
function drawLogSide(ctx, rng) {
	fill(ctx, PAL.bark);
	for (let x = 0; x < TILE; x += 4) rect(ctx, x, 0, 1, TILE, PAL.barkDark);
	speckle(ctx, rng, PAL.barkDark, 0.05);
	rect(ctx, 6, 0, 2, TILE, PAL.barkLight); // veta clara
}
function drawLogTop(ctx, _rng) {
	fill(ctx, PAL.bark);
	rect(ctx, 2, 2, 12, 12, PAL.wood);
	rect(ctx, 4, 4, 8, 8, PAL.woodLight);
	rect(ctx, 6, 6, 4, 4, PAL.wood);
	// anillos concéntricos oscuros
	for (let i = 2; i <= 6; i += 2) {
		rect(ctx, i, i, TILE - 2 * i, 1, PAL.barkDark);
		rect(ctx, i, TILE - 1 - i, TILE - 2 * i, 1, PAL.barkDark);
		rect(ctx, i, i, 1, TILE - 2 * i, PAL.barkDark);
		rect(ctx, TILE - 1 - i, i, 1, TILE - 2 * i, PAL.barkDark);
	}
}
function drawLeaves(ctx, rng) {
	fill(ctx, PAL.leaf);
	speckle(ctx, rng, PAL.leafDark, 0.2);
	speckle(ctx, rng, PAL.leafLight, 0.12);
}
function drawSand(ctx, rng) {
	fill(ctx, PAL.sand);
	speckle(ctx, rng, PAL.sandDark, 0.12);
	speckle(ctx, rng, PAL.sandLight, 0.1);
}
function drawPlanks(ctx, rng) {
	fill(ctx, PAL.wood);
	for (let y = 0; y < TILE; y += 4) rect(ctx, 0, y, TILE, 1, PAL.woodDark);
	for (let y = 0; y < TILE; y += 4) {
		const x = Math.floor(rng() * 8);
		rect(ctx, x, y + 1, 3, 1, PAL.woodLight); // veta horizontal
	}
	speckle(ctx, rng, PAL.woodDark, 0.03);
}
function drawCobble(ctx, rng) {
	fill(ctx, PAL.stoneDark);
	// "piedras" irregulares (adoquín)
	for (let i = 0; i < 9; i++) {
		const x = Math.floor(rng() * (TILE - 5));
		const y = Math.floor(rng() * (TILE - 5));
		const w = 3 + Math.floor(rng() * 3);
		const h = 2 + Math.floor(rng() * 3);
		const c = rng() < 0.5 ? PAL.stone : PAL.stoneLight;
		rect(ctx, x, y, w, h, c);
	}
}
function makeOre(oreColor) {
	return (ctx, rng) => {
		drawStone(ctx, rng);
		// vetas del mineral
		for (let i = 0; i < 3; i++) {
			const x = 2 + Math.floor(rng() * 10);
			const y = 2 + Math.floor(rng() * 10);
			rect(
				ctx,
				x,
				y,
				1 + Math.floor(rng() * 3),
				1 + Math.floor(rng() * 3),
				oreColor
			);
		}
	};
}
function drawCraftTop(ctx, rng) {
	drawPlanks(ctx, rng);
	// rejilla 2x2 de la mesa de crafteo
	rect(ctx, 7, 0, 2, TILE, PAL.woodDark);
	rect(ctx, 0, 7, TILE, 2, PAL.woodDark);
	rect(ctx, 0, 0, TILE, 1, PAL.woodDark);
	rect(ctx, 0, TILE - 1, TILE, 1, PAL.woodDark);
	rect(ctx, 0, 0, 1, TILE, PAL.woodDark);
	rect(ctx, TILE - 1, 0, 1, TILE, PAL.woodDark);
}
function drawCraftSide(ctx, rng) {
	drawPlanks(ctx, rng);
	rect(ctx, 0, 12, TILE, 4, PAL.woodDark);
	rect(ctx, 0, 11, TILE, 1, PAL.woodLight);
}
function drawFurnaceFront(ctx, rng) {
	fill(ctx, PAL.furnace);
	speckle(ctx, rng, PAL.furnaceDark, 0.1);
	rect(ctx, 1, 1, TILE - 2, 1, PAL.furnaceLight);
	rect(ctx, 1, TILE - 2, TILE - 2, 1, PAL.furnaceLight);
	rect(ctx, 1, 1, 1, TILE - 2, PAL.furnaceLight);
	rect(ctx, TILE - 2, 1, 1, TILE - 2, PAL.furnaceLight);
	rect(ctx, 4, 4, 8, 8, PAL.furnaceDark);
	rect(ctx, 5, 5, 6, 6, "#1a1a1a"); // boca del horno
	px(ctx, 7, 8, PAL.fire); // brasas
	px(ctx, 8, 7, PAL.fireLight);
	px(ctx, 9, 9, PAL.fire);
}
function drawFurnaceSide(ctx, rng) {
	fill(ctx, PAL.furnace);
	speckle(ctx, rng, PAL.furnaceDark, 0.12);
	speckle(ctx, rng, PAL.furnaceLight, 0.06);
}
function drawFurnaceTop(ctx, rng) {
	drawFurnaceSide(ctx, rng);
	rect(ctx, 5, 5, 6, 6, "#1a1a1a"); // abertura
}
function drawGlass(ctx, rng) {
	fill(ctx, PAL.glass);
	for (let i = 0; i < 4; i++) {
		const x = Math.floor(rng() * 10);
		const y = Math.floor(rng() * 10);
		rect(ctx, x, y, 3, 1, PAL.glassLight);
	}
	speckle(ctx, rng, "#ffffff", 0.05);
}
function drawWool(ctx, rng) {
	fill(ctx, PAL.wool);
	speckle(ctx, rng, PAL.woolDark, 0.15);
}
function drawBedrock(ctx, rng) {
	fill(ctx, PAL.bedrock);
	for (let i = 0; i < 10; i++) {
		const x = Math.floor(rng() * (TILE - 4));
		const y = Math.floor(rng() * (TILE - 3));
		rect(
			ctx,
			x,
			y,
			2 + Math.floor(rng() * 3),
			1 + Math.floor(rng() * 2),
			PAL.bedrockDark
		);
	}
}
function drawWater(ctx, rng) {
	fill(ctx, PAL.water);
	// ondas diagonales más claras (estilo pixel-art)
	for (let i = 0; i < 6; i++) {
		const y = Math.floor(rng() * TILE);
		const x = Math.floor(rng() * (TILE - 4));
		rect(ctx, x, y, 3, 1, PAL.waterLight);
		if (rng() < 0.5) px(ctx, x + 3, y - 1, PAL.waterLight);
	}
	speckle(ctx, rng, PAL.waterDark, 0.08);
}
function drawSnow(ctx, rng) {
	fill(ctx, PAL.snow);
	// copos sueltos + zonas más claras para dar textura de nieve
	speckle(ctx, rng, PAL.snowLight, 0.12);
	speckle(ctx, rng, PAL.snowDark, 0.06);
}
// Lava (Fase 7): roca fundida con manchas más claras (el magma brillante) y
// costras oscuras. La tesela se ve sobre el charco de superficie decorativo.
function drawLava(ctx, rng) {
	fill(ctx, PAL.lavaDark);
	speckle(ctx, rng, PAL.lava, 0.35);
	// burbujas/zonas incandescentes
	for (let i = 0; i < 5; i++) {
		const x = Math.floor(rng() * (TILE - 3));
		const y = Math.floor(rng() * (TILE - 3));
		rect(
			ctx,
			x,
			y,
			2 + Math.floor(rng() * 2),
			1 + Math.floor(rng() * 2),
			PAL.lavaHot
		);
	}
	speckle(ctx, rng, PAL.lavaLight, 0.12);
}
// Cofre (Fase 6): madera de tablones con marco y bisagras metálicas.
function drawChestTop(ctx, rng) {
	drawPlanks(ctx, rng);
	rect(ctx, 0, 0, TILE, 1, PAL.woodDark);
	rect(ctx, 0, TILE - 1, TILE, 1, PAL.woodDark);
	rect(ctx, 0, 0, 1, TILE, PAL.woodDark);
	rect(ctx, TILE - 1, 0, 1, TILE, PAL.woodDark);
}
function drawChestSide(ctx, rng) {
	drawPlanks(ctx, rng);
	rect(ctx, 0, 0, TILE, 1, PAL.woodDark);
	rect(ctx, 0, TILE - 1, TILE, 1, PAL.woodDark);
	rect(ctx, 0, 7, TILE, 1, PAL.woodLight); // banda central
	rect(ctx, 0, 10, TILE, 1, PAL.woodDark);
}
function drawChestFront(ctx, rng) {
	drawPlanks(ctx, rng);
	rect(ctx, 0, 0, TILE, 1, PAL.woodDark);
	rect(ctx, 0, TILE - 1, TILE, 1, PAL.woodDark);
	// banda de la tapa + cerradura/bisagras metálicas
	rect(ctx, 0, 7, TILE, 1, PAL.woodLight);
	rect(ctx, 0, 10, TILE, 1, PAL.woodDark);
	rect(ctx, 2, 2, 2, 3, PAL.metalDark);
	rect(ctx, 3, 2, 1, 2, PAL.metalLight);
	rect(ctx, TILE - 4, 2, 2, 3, PAL.metalDark);
	rect(ctx, TILE - 3, 2, 1, 2, PAL.metalLight);
	rect(ctx, 7, 6, 2, 3, PAL.metal); // cerradura
	rect(ctx, 8, 6, 1, 2, PAL.metalLight);
}
// Antorcha (Fase 6): palo vertical con llama; el resto de la tesela queda
// transparente (el canvas no se rellena) para que la geometría cruzada se
// vea como una antorcha y no como una caja.
function drawTorch(ctx, _rng) {
	// palo
	rect(ctx, 7, 6, 2, 10, PAL.barkDark);
	rect(ctx, 7, 6, 1, 10, PAL.bark);
	// brasa en la punta
	px(ctx, 7, 5, PAL.flameDark);
	px(ctx, 8, 5, PAL.flameDark);
	// llama (2x3 con brillo)
	rect(ctx, 6, 2, 4, 3, PAL.flame);
	rect(ctx, 7, 1, 2, 2, PAL.flameLight);
	px(ctx, 8, 0, PAL.flameLight);
	px(ctx, 7, 3, PAL.flameDark);
	px(ctx, 8, 3, PAL.flameDark);
}

// Cama (Fase 7): marco de madera + manta con almohada (manta roja clásica).
function drawBedTop(ctx, rng) {
	fill(ctx, PAL.bedLight);
	rect(ctx, 0, 0, TILE, 2, PAL.bedDark); // borde de la manta
	rect(ctx, 0, TILE - 2, TILE, 2, PAL.bedDark);
	speckle(ctx, rng, PAL.bed, 0.12); // textura de la tela
	rect(ctx, 10, 3, 6, 5, PAL.pillow); // almohada
	rect(ctx, 10, 3, 6, 1, PAL.woolDark);
	rect(ctx, 0, 3, 2, 5, PAL.bedDark); // pliegue
}
function drawBedSide(ctx, rng) {
	fill(ctx, PAL.wood);
	rect(ctx, 0, 0, TILE, 3, PAL.woodDark); // marco superior
	rect(ctx, 0, 3, TILE, 9, PAL.bedLight); // manta (lateral)
	rect(ctx, 0, 12, TILE, 2, PAL.woodDark); // marco inferior
	speckle(ctx, rng, PAL.bed, 0.1);
	rect(ctx, 2, 13, 2, 3, PAL.woodDark); // patas
	rect(ctx, TILE - 4, 13, 2, 3, PAL.woodDark);
}
function drawBedFront(ctx, _rng) {
	fill(ctx, PAL.wood);
	rect(ctx, 0, 0, TILE, 3, PAL.woodDark); // cabecero
	rect(ctx, 0, 3, TILE, 9, PAL.bedLight);
	rect(ctx, 0, 12, TILE, 2, PAL.woodDark);
	rect(ctx, 7, 5, 2, 3, PAL.pillow); // almohada (frente)
	rect(ctx, 3, 13, 2, 3, PAL.woodDark); // patas
	rect(ctx, 11, 13, 2, 3, PAL.woodDark);
}

// Índices de tesela (el orden define su posición en el atlas)
const TILES = [
	drawDirt, // 0  tierra
	drawGrassTop, // 1  césped (arriba)
	drawGrassSide, // 2  césped (lado)
	drawStone, // 3  piedra
	drawLogSide, // 4  tronco (lado)
	drawLogTop, // 5  tronco (arriba/abajo)
	drawLeaves, // 6  hojas
	drawSand, // 7  arena
	drawPlanks, // 8  tablones
	drawCobble, // 9  adoquín
	makeOre(PAL.coal), // 10 mena de carbón
	makeOre(PAL.iron), // 11 mena de hierro
	makeOre(PAL.gold), // 12 mena de oro
	makeOre(PAL.diamond), // 13 mena de diamante
	makeOre(PAL.redstone), // 14 mena de redstone
	makeOre(PAL.emerald), // 15 mena de esmeralda
	drawCraftTop, // 16 mesa de crafteo (arriba)
	drawCraftSide, // 17 mesa de crafteo (lado)
	drawFurnaceFront, // 18 horno (frente)
	drawFurnaceSide, // 19 horno (lado)
	drawFurnaceTop, // 20 horno (arriba)
	drawGlass, // 21 vidrio
	drawWool, // 22 lana
	drawBedrock, // 23 roca madre
	drawWater, // 24 agua
	drawSnow, // 25 nieve
	drawChestTop, // 26 cofre (arriba)
	drawChestSide, // 27 cofre (lado)
	drawChestFront, // 28 cofre (frente, con cerradura)
	drawTorch, // 29 antorcha
	drawBedTop, // 30 cama (arriba)
	drawBedSide, // 31 cama (lado)
	drawBedFront, // 32 cama (frente)
	drawLava // 33 lava
];

// Tesela por bloque y cara. Orden de FACES (ver world.js):
//   0=+X, 1=-X, 2=+Y (top), 3=-Y (bottom), 4=+Z, 5=-Z
const BLOCK_TEX = {
	1: { all: 0 }, // tierra
	2: { top: 1, bottom: 0, side: 2 }, // césped
	3: { all: 3 }, // piedra
	4: { top: 5, bottom: 5, side: 4 }, // tronco
	5: { all: 6 }, // hojas
	6: { all: 7 }, // arena
	7: { all: 8 }, // tablones
	8: { all: 9 }, // adoquín
	9: { all: 10 }, // mena de carbón
	10: { all: 11 }, // mena de hierro
	11: { all: 12 }, // mena de oro
	12: { all: 13 }, // mena de diamante
	13: { all: 14 }, // mena de redstone
	14: { all: 15 }, // mena de esmeralda
	15: { top: 16, bottom: 8, side: 17 }, // mesa de crafteo
	16: { top: 20, bottom: 20, fronts: 18, side: 19 }, // horno (frente en ±Z)
	17: { all: 21 }, // vidrio
	18: { all: 22 }, // lana
	19: { all: 23 }, // roca madre
	20: { all: 24 }, // agua
	21: { all: 25 }, // nieve
	22: { top: 26, bottom: 8, side: 27, fronts: 28 }, // cofre (cerradura en ±Z)
	23: { all: 29 }, // antorcha (tesela cruzada)
	24: { top: 30, bottom: 8, side: 31, fronts: 32 }, // cama (Fase 7)
	25: { all: 33 } // lava
};

// Devuelve el índice de tesela para un bloque y una cara.
export function tileForFace(blockId, faceIndex) {
	const t = BLOCK_TEX[blockId];
	if (!t) return 3; // piedra por defecto
	if (t.all !== undefined) return t.all;
	if (faceIndex === 2) return t.top; // +Y
	if (faceIndex === 3) return t.bottom; // -Y
	if (t.fronts !== undefined && (faceIndex === 4 || faceIndex === 5))
		return t.fronts; // ±Z
	return t.side;
}

// Rectángulo UV [u0, v0, u1, v1] de una tesela en el atlas (v0 abajo, v1 arriba).
export function tileRect(index) {
	const col = index % COLS;
	const row = Math.floor(index / COLS);
	const rows = Math.ceil(TILES.length / COLS);
	const u0 = col / COLS,
		u1 = (col + 1) / COLS;
	const v1 = 1 - row / rows,
		v0 = 1 - (row + 1) / rows;
	return [u0, v0, u1, v1];
}

// Construye el atlas (una sola vez) y devuelve la CanvasTexture lista para usar.
export function buildTerrainAtlas() {
	const rows = Math.ceil(TILES.length / COLS);
	const canvas = document.createElement("canvas");
	canvas.width = COLS * TILE;
	canvas.height = rows * TILE;
	const ctx = canvas.getContext("2d");
	TILES.forEach((draw, i) => {
		const rng = mulberry32(1337 + i * 7919);
		ctx.save();
		ctx.translate((i % COLS) * TILE, Math.floor(i / COLS) * TILE);
		draw(ctx, rng);
		ctx.restore();
	});
	const texture = new THREE.CanvasTexture(canvas);
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
