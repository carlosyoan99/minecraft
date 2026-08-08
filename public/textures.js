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
// Línea vertical de 1 píxel de ancho (de y0 a y1 inclusive): tallos de las
// plantas y trigo (Fase 9, F). x e y en píxeles de la tesela 16×16.
function vline(ctx, x, y0, y1, color) {
	ctx.fillStyle = color;
	ctx.fillRect(x, y0, 1, y1 - y0 + 1);
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

// ============================================================
// FASE 9 (Bloque F): BLOQUES NUEVOS — abedul, pino, musgo, hierba/flores,
// lanas tintadas, tierra arada y cultivo de trigo.
// ============================================================
function drawBirchLogSide(ctx, rng) {
	fill(ctx, "#d9cfbe");
	for (let x = 0; x < TILE; x += 4) rect(ctx, x, 0, 1, TILE, "#b8ac96");
	speckle(ctx, rng, "#8a7f68", 0.04);
	rect(ctx, 5, 0, 3, TILE, "#e8e0d0"); // veta clara
}
function drawBirchLogTop(ctx, _rng) {
	fill(ctx, "#d9cfbe");
	rect(ctx, 2, 2, 12, 12, "#eee8dc");
	rect(ctx, 4, 4, 8, 8, "#f5f0e6");
	rect(ctx, 6, 6, 4, 4, "#e0d8c8");
	rect(ctx, 1, 1, 14, 1, "#b8ac96");
	rect(ctx, 1, 14, 14, 1, "#b8ac96");
}
function drawBirchLeaves(ctx, rng) {
	fill(ctx, "#7fd04f");
	speckle(ctx, rng, "#5a9a3a", 0.2);
	speckle(ctx, rng, "#a8e87f", 0.12);
}
function drawSpruceLogSide(ctx, rng) {
	fill(ctx, "#4a3320");
	for (let x = 0; x < TILE; x += 3) rect(ctx, x, 0, 1, TILE, "#35240f");
	speckle(ctx, rng, "#5a4028", 0.05);
}
function drawSpruceLogTop(ctx, _rng) {
	fill(ctx, "#4a3320");
	rect(ctx, 2, 2, 12, 12, "#8a6a44");
	rect(ctx, 4, 4, 8, 8, "#6f5230");
	rect(ctx, 6, 6, 4, 4, "#5a4028");
	rect(ctx, 2, 2, 12, 1, "#35240f");
	rect(ctx, 2, 13, 12, 1, "#35240f");
}
function drawSpruceLeaves(ctx, rng) {
	fill(ctx, "#2f5d2a");
	speckle(ctx, rng, "#1f4a1c", 0.2);
	speckle(ctx, rng, "#4a8a40", 0.1);
}
function drawMossyCobble(ctx, rng) {
	drawCobble(ctx, rng);
	// musgo en las grietas (píxeles verdes sobre las piedras)
	for (let i = 0; i < 14; i++) {
		const x = Math.floor(rng() * TILE);
		const y = Math.floor(rng() * TILE);
		const c = rng() < 0.5 ? "#4a7a2e" : "#5a8a3a";
		rect(ctx, x, y, 1 + Math.floor(rng() * 2), 1, c);
	}
}
// Planta/arbusto (hierba alta, flores, trigo): silueta de tallo + copa con
// fondo transparente (el canvas no se rellena) — la geometría cruzada de
// world.js la muestra como planta, no como caja.
function drawTallGrass(ctx, rng) {
	vline(ctx, 8, 8, 15, "#4a9e2f");
	for (let i = 0; i < 7; i++) {
		const y = 4 + Math.floor(rng() * 8);
		rect(ctx, 3 + Math.floor(rng() * 10), y, 2, 1, "#5aae3f");
	}
	rect(ctx, 7, 2, 3, 6, "#6fbf4f");
	rect(ctx, 6, 4, 1, 3, "#3a8a2a");
	rect(ctx, 9, 5, 1, 2, "#3a8a2a");
}
function drawPoppy(ctx, _rng) {
	vline(ctx, 8, 8, 15, "#3a8a2a");
	rect(ctx, 7, 3, 3, 1, "#b01a1a");
	rect(ctx, 6, 2, 5, 3, "#d92626");
	rect(ctx, 5, 3, 2, 1, "#e84a4a");
	rect(ctx, 10, 3, 2, 1, "#8f1010");
	px(ctx, 7, 2, "#8f1010");
	px(ctx, 10, 2, "#8f1010");
	px(ctx, 8, 4, "#f5f5f0");
	px(ctx, 8, 5, "#f5f5f0");
}
function drawDandelion(ctx, _rng) {
	vline(ctx, 8, 8, 15, "#3a8a2a");
	rect(ctx, 6, 2, 5, 5, "#e8d21a");
	rect(ctx, 6, 2, 5, 1, "#f5e84a");
	rect(ctx, 5, 3, 2, 2, "#f0dc30");
	rect(ctx, 10, 3, 2, 2, "#d4b810");
	px(ctx, 8, 2, "#f5e84a");
	px(ctx, 8, 6, "#c9a40f");
}
// Trigo joven (tallos verdes) — el bloque 27 es el cultivo en crecimiento.
function drawWheatPlant(ctx, rng) {
	for (let i = 0; i < 5; i++) {
		const x = 4 + Math.floor(rng() * 9);
		vline(ctx, x, 6, 15, i % 2 ? "#6fbf3a" : "#5aa32e");
		rect(ctx, x - 1, 7 + Math.floor(rng() * 4), 3, 1, "#7fd04f");
	}
}
// Tierra arada (surcos): tierra con franjas oscuras horizontales.
function drawFarmland(ctx, rng) {
	fill(ctx, "#6f4a22");
	for (let y = 0; y < TILE; y += 4) rect(ctx, 0, y, TILE, 1, "#5a3a18");
	speckle(ctx, rng, "#8a5a2b", 0.1);
	speckle(ctx, rng, "#4a3014", 0.06);
}
// Lanas tintadas: base del color con vellón (motas claras/oscuras).
function makeWool(color, light, dark) {
	return (ctx, rng) => {
		fill(ctx, color);
		speckle(ctx, rng, dark, 0.15);
		speckle(ctx, rng, light, 0.08);
	};
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

// Fase 10 (D1): grava — guijarros grises redondeados sobre fondo oscuro
// (distinta de la piedra lisa y del adoquín, como en Minecraft).
function drawGravel(ctx, rng) {
	rect(ctx, 0, 0, TILE, TILE, "#6e6e6c");
	for (let i = 0; i < 9; i++) {
		const gx = 1 + rng() * 13;
		const gy = 1 + rng() * 13;
		const s = 3 + rng() * 3;
		rect(ctx, Math.floor(gx), Math.floor(gy), s, s, "#585855");
		rect(ctx, Math.floor(gx) + 1, Math.floor(gy), s - 1, 1, "#7d7d7a");
	}
}

// Fase 10 (D2): TNT — rojo con banda blanca inferior y cinta central con la
// "palabra" pixelada (estilo MC).
function drawTnt(ctx, _rng) {
	rect(ctx, 0, 0, TILE, TILE, "#d43d2a");
	rect(ctx, 0, 1, TILE, 2, "#e85a45"); // brillo superior
	rect(ctx, 0, 12, TILE, 3, "#f2ede4"); // banda base blanca
	rect(ctx, 2, 5, TILE - 4, 4, "#f7f3ea"); // cinta central con el texto
	rect(ctx, 4, 6, 2, 2, "#222"); // letras "TNT" pixeladas
	rect(ctx, 8, 6, 2, 2, "#222");
	rect(ctx, 12, 6, 2, 2, "#222");
}

// ============================================================
// FASE 11 (Bloque B): TESELAS DE JUNGLA Y LIANAS
// Tronco de jungla: corteza marrón oscuro tropical con vetas verticales
// (más contrastado que el roble) y médula clara en la tapa. Hojas de
// jungla: verde denso y húmedo (selva). Liana: tira verde colgante con
// fondo transparente (se dibuja como cross-quad, como las plantas Fase 9).
// ============================================================
function drawJungleLogSide(ctx, rng) {
	fill(ctx, "#7a4a1f");
	for (let x = 0; x < TILE; x += 3) rect(ctx, x, 0, 1, TILE, "#5a3512");
	speckle(ctx, rng, "#8a5a2a", 0.05);
	rect(ctx, 7, 0, 2, TILE, "#6a3f18"); // veta oscura
}
function drawJungleLogTop(ctx, _rng) {
	fill(ctx, "#7a4a1f");
	rect(ctx, 2, 2, 12, 12, "#c9a46b");
	rect(ctx, 4, 4, 8, 8, "#d9b884");
	rect(ctx, 6, 6, 4, 4, "#b8905a");
	rect(ctx, 1, 1, 14, 1, "#5a3512");
	rect(ctx, 1, 14, 14, 1, "#5a3512");
}
function drawJungleLeaves(ctx, rng) {
	fill(ctx, "#2f7a2a");
	speckle(ctx, rng, "#1f5f1c", 0.22);
	speckle(ctx, rng, "#4a9a40", 0.12);
}
function drawVines(ctx, rng) {
	// Liana colgante: dos tiras verticales con hojitas (fondo transparente:
	// el canvas no se rellena, como en las plantas de la Fase 9).
	vline(ctx, 7, 0, 15, "#2f7a2a");
	vline(ctx, 9, 0, 15, "#3a8a32");
	for (let i = 0; i < 5; i++) {
		const y = 2 + Math.floor(rng() * 12);
		px(ctx, 5 + Math.floor(rng() * 6), y, "#4a9a40");
	}
	px(ctx, 6, 3, "#4a9a40");
	px(ctx, 10, 7, "#4a9a40");
	px(ctx, 6, 11, "#4a9a40");
	px(ctx, 10, 13, "#4a9a40");
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
	drawLava, // 33 lava
	drawBirchLogSide, // 34 abedul (lado)
	drawBirchLogTop, // 35 abedul (arriba/abajo)
	drawBirchLeaves, // 36 hojas de abedul
	drawSpruceLogSide, // 37 pino (lado)
	drawSpruceLogTop, // 38 pino (arriba/abajo)
	drawSpruceLeaves, // 39 hojas de pino
	drawMossyCobble, // 40 piedra de musgo
	drawTallGrass, // 41 hierba alta (cross)
	drawPoppy, // 42 amapola (cross)
	drawDandelion, // 43 diente de león (cross)
	drawWheatPlant, // 44 trigo en crecimiento (cross)
	drawFarmland, // 45 tierra arada
	makeWool("#c0392b", "#e06050", "#8f2a1e"), // 46 lana roja
	makeWool("#e8c547", "#f5e07a", "#b8860b"), // 47 lana amarilla
	makeWool("#f5f5f0", "#ffffff", "#d9d9d2"), // 48 lana blanca
	drawGravel, // 49 grava (Fase 10, D1)
	drawTnt, // 50 TNT (Fase 10, D2)
	drawJungleLogSide, // 51 tronco de jungla (lado) (Fase 11, B)
	drawJungleLogTop, // 52 tronco de jungla (arriba/abajo)
	drawJungleLeaves, // 53 hojas de jungla
	drawVines // 54 liana (cross)
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
	25: { all: 33 }, // lava
	26: { all: 45 }, // tierra arada (Fase 9, C)
	27: { all: 44 }, // trigo en crecimiento (Fase 9, C)
	28: { top: 35, bottom: 35, side: 34 }, // tronco de abedul (Fase 9, F)
	29: { all: 36 }, // hojas de abedul
	30: { top: 38, bottom: 38, side: 37 }, // tronco de pino
	31: { all: 39 }, // hojas de pino
	32: { all: 40 }, // piedra de musgo
	33: { all: 41 }, // hierba alta (cross)
	34: { all: 42 }, // amapola (cross)
	35: { all: 43 }, // diente de león (cross)
	36: { all: 46 }, // lana roja
	37: { all: 47 }, // lana amarilla
	38: { all: 48 }, // lana blanca
	39: { all: 49 }, // grava (Fase 10, D1)
	40: { all: 50 }, // TNT (Fase 10, D2)
	41: { top: 52, bottom: 52, side: 51 }, // tronco de jungla (Fase 11, B)
	42: { all: 53 }, // hojas de jungla
	43: { all: 54 } // liana (cross)
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

// Fase 10 (E2): textura DEDICADA del agua (una tesela sola, en vez de la
// porción del atlas). Con RepeatWrapping el material puede desplazarla con
// `texture.offset` cada frame (corriente visible) sin afectar al resto del
// mundo — el atlas compartido no se puede desplazar (rompería los demás
// bloques). Se dibuja con el mismo drawWater del atlas para look idéntico.
export function buildWaterTexture() {
	const canvas = document.createElement("canvas");
	canvas.width = TILE;
	canvas.height = TILE;
	const ctx = canvas.getContext("2d");
	drawWater(ctx, mulberry32(31337));
	const texture = new THREE.CanvasTexture(canvas);
	texture.wrapS = THREE.RepeatWrapping;
	texture.wrapT = THREE.RepeatWrapping;
	texture.magFilter = THREE.NearestFilter;
	texture.minFilter = THREE.NearestFilter;
	texture.generateMipmaps = false;
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
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
