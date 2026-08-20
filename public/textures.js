// ============================================================
// ATLAS DE TEXTURAS (16x16 px por cara, estilo pixel-art)
// Generado proceduralmente en un canvas al cargar el cliente:
// sin assets binarios ni build step. Una única CanvasTexture
// compartida por todos los chunks; cada cara del bloque elige
// su tesela (top/bottom/lados) con UVs por cara.
// ============================================================
import * as THREE from "three";

// El mapa de teselas (BLOCK_TEX/tileForFace/tileRect) vive en texturemap.js,
// un módulo puro sin three ni DOM que comparten el greedy meshing y el Web
// Worker de chunks (Fase 13, A1/A2).
import { COLS, setTileCount, tileForFace, tileRect } from "./texturemap.js";

export { tileForFace, tileRect };

const TILE = 16; // px por tesela

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
// Fase 21.5 (C4): fábricas de teselas de cama por color — cada cama de
// color necesita 3 teselas (top, side, front) como la cama base (24).
function lighten(hex, amt) {
	const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amt);
	const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amt);
	const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amt);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function darken(hex, amt) {
	const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amt);
	const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amt);
	const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amt);
	return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}
function makeBedTop(color) {
	const light = lighten(color, 30);
	const dark = darken(color, 50);
	return (ctx, rng) => {
		fill(ctx, light);
		rect(ctx, 0, 0, TILE, 2, dark);
		rect(ctx, 0, TILE - 2, TILE, 2, dark);
		speckle(ctx, rng, color, 0.12);
		rect(ctx, 10, 3, 6, 5, PAL.pillow);
		rect(ctx, 10, 3, 6, 1, PAL.woolDark);
		rect(ctx, 0, 3, 2, 5, dark);
	};
}
function makeBedSide(color) {
	const light = lighten(color, 30);
	const dark = darken(color, 50);
	return (ctx, rng) => {
		fill(ctx, PAL.wood);
		rect(ctx, 0, 0, TILE, 3, PAL.woodDark);
		rect(ctx, 0, 3, TILE, 9, light);
		rect(ctx, 0, 12, TILE, 2, PAL.woodDark);
		speckle(ctx, rng, color, 0.1);
		rect(ctx, 2, 13, 2, 3, PAL.woodDark);
		rect(ctx, TILE - 4, 13, 2, 3, PAL.woodDark);
	};
}
function makeBedFront(color) {
	const light = lighten(color, 30);
	return (ctx, _rng) => {
		fill(ctx, PAL.wood);
		rect(ctx, 0, 0, TILE, 3, PAL.woodDark);
		rect(ctx, 0, 3, TILE, 9, light);
		rect(ctx, 0, 12, TILE, 2, PAL.woodDark);
		rect(ctx, 7, 5, 2, 3, PAL.pillow);
		rect(ctx, 3, 13, 2, 3, PAL.woodDark);
		rect(ctx, 11, 13, 2, 3, PAL.woodDark);
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

// Fase 13 (L2/L3): teselas de puertas, escaleras, losas, valla y portón.
// Simplificación visual documentada: los bloques con colisión por forma se
// dibujan con su tesela característica (puerta con bisagras, escalera con
// peldaños, losa a media altura, valla con travesaños) aunque la geometría
// del chunk los renderice como caja completa; la COLISIÓN sí respeta la
// forma (world.isSolidAt en el servidor, solidAt en el cliente).
function drawDoorOak(ctx, rng) {
	drawPlanks(ctx, rng); // base de tablones
	// Marco vertical central (listón de la puerta)
	for (let y = 1; y <= 14; y++) {
		px(ctx, 7, y, "#5a3d1e");
		px(ctx, 8, y, "#5a3d1e");
	}
	// Bisagras (arriba y abajo)
	px(ctx, 5, 2, "#3a2a12");
	px(ctx, 5, 13, "#3a2a12");
	// Tirador
	px(ctx, 10, 7, "#c9a46b");
	px(ctx, 10, 8, "#c9a46b");
}
function drawDoorIron(ctx, _rng) {
	for (let y = 0; y < 16; y++)
		for (let x = 0; x < 16; x++) px(ctx, x, y, "#8a8a90");
	// Panel central empotrado
	for (let y = 3; y <= 12; y++)
		for (let x = 4; x <= 11; x++) px(ctx, x, y, "#6a6a72");
	// Remaches
	px(ctx, 4, 3, "#b0b0b8");
	px(ctx, 11, 3, "#b0b0b8");
	px(ctx, 4, 12, "#b0b0b8");
	px(ctx, 11, 12, "#b0b0b8");
}
function drawStairsOak(ctx, rng) {
	drawPlanks(ctx, rng); // base
	// Peldaños: bandas horizontales alternas (el dibujo sugiere la forma)
	for (let y = 8; y <= 11; y++)
		for (let x = 2; x <= 13; x++) px(ctx, x, y, "#5a3d1e");
	for (let y = 12; y <= 15; y++)
		for (let x = 2; x <= 13; x++) px(ctx, x, y, "#4a3018");
	// Borde del peldaño superior
	for (let x = 2; x <= 13; x++) px(ctx, x, 8, "#c9a46b");
}
function drawStairsStone(ctx, rng) {
	drawStone(ctx, rng); // base
	for (let y = 8; y <= 11; y++)
		for (let x = 2; x <= 13; x++) px(ctx, x, y, "#666666");
	for (let y = 12; y <= 15; y++)
		for (let x = 2; x <= 13; x++) px(ctx, x, y, "#555555");
	for (let x = 2; x <= 13; x++) px(ctx, x, 8, "#9a9a9a");
}
function drawSlabOak(ctx, rng) {
	drawPlanks(ctx, rng);
	// La losa ocupa la mitad inferior: oscurecer la parte superior
	for (let y = 0; y < 8; y++)
		for (let x = 0; x < 16; x++) px(ctx, x, y, "#3a2a14");
}
function drawSlabStone(ctx, rng) {
	drawStone(ctx, rng);
	for (let y = 0; y < 8; y++)
		for (let x = 0; x < 16; x++) px(ctx, x, y, "#4a4a4a");
}
function drawFenceOak(ctx, rng) {
	drawPlanks(ctx, rng);
	// Travesaños horizontales + postes (la valla se ve a través)
	for (let x = 0; x < 16; x++) {
		px(ctx, x, 5, "#5a3d1e");
		px(ctx, x, 10, "#5a3d1e");
	}
	for (let y = 0; y < 16; y++) {
		px(ctx, 2, y, "#4a3018");
		px(ctx, 13, y, "#4a3018");
	}
}
// Fase 21.5 (D2): coral de arrecife — rosa coral con poros (puntos) y
// ramitas claras, estilo esqueleto de coral (como el bloque de MC).
function drawCoral(ctx, rng) {
	fill(ctx, "#d95a50");
	// Poros: puntos más oscuros repartidos por toda la tesela
	for (let y = 1; y < 15; y += 2) {
		for (let x = 1; x < 15; x += 2) {
			const shade = rng();
			if (shade < 0.35) px(ctx, x, y, "#a83a34");
			else if (shade < 0.7) px(ctx, x, y, "#e86a5e");
		}
	}
	// Ramitas/puntas claras (borde iluminado superior y pequeñas protuberancias)
	for (let x = 2; x < 14; x += 3) {
		px(ctx, x, 3, "#f08a7e");
		px(ctx, x + 1, 7, "#f08a7e");
	}
	// Borde inferior oscuro (volumen)
	for (let x = 0; x < 16; x++) px(ctx, x, 15, "#8f2f2a");
	for (let x = 0; x < 16; x++) px(ctx, x, 14, "#a83a34");
}
function drawFenceGate(ctx, rng) {
	drawFenceOak(ctx, rng);
	// Barra central del portón
	for (let y = 0; y < 16; y++) px(ctx, 7, y, "#c9a46b");
	for (let y = 0; y < 16; y++) px(ctx, 8, y, "#c9a46b");
}

// Fase 21.5 (B1): piedra pulida — granito (rosa con motas claras), diorita
// (sal y pimienta blanca) y andesita (gris apagado con grano fino). Las
// versiones PULIDAS comparten la mota base pero con los bordes regulares
// (rejilla 4×4 sutil), distinguiéndose del material natural.
function drawGranite(ctx, rng) {
	fill(ctx, "#c9917f");
	speckle(ctx, rng, "#a86a58", 0.18);
	speckle(ctx, rng, "#f0d8c8", 0.12);
}
function drawDiorite(ctx, rng) {
	fill(ctx, "#cfcfcf");
	speckle(ctx, rng, "#e8e8e8", 0.25);
	speckle(ctx, rng, "#8f8f8f", 0.15);
}
function drawAndesite(ctx, rng) {
	fill(ctx, "#8f8f8f");
	speckle(ctx, rng, "#6f6f6f", 0.15);
	speckle(ctx, rng, "#a8a8a8", 0.1);
}
function drawPolished(ctx, rng, draw) {
	draw(ctx, rng);
	for (let y = 4; y < 16; y += 4) rect(ctx, 0, y, 16, 1, "rgba(0,0,0,0.28)");
	for (let x = 4; x < 16; x += 4) rect(ctx, x, 0, 1, 16, "rgba(0,0,0,0.28)");
}
function drawPolishedGranite(ctx, rng) {
	drawPolished(ctx, rng, drawGranite);
}
function drawPolishedDiorite(ctx, rng) {
	drawPolished(ctx, rng, drawDiorite);
}
function drawPolishedAndesite(ctx, rng) {
	drawPolished(ctx, rng, drawAndesite);
}

// Fase 21.5 (B2): linterna — marco de hierro (rectángulo oscuro con los
// postes de las esquinas), paneles de vidrio (fondo cálido) y la llama
// (centro brillante). Estilo MC: bobina con cruz de hierro y luz dentro.
function drawLantern(ctx, rng) {
	fill(ctx, "#6b5a4a"); // fondo cálido del interior (vidrio)
	// Brillo de la llama en el centro
	rect(ctx, 5, 5, 6, 6, "#f5c14a");
	rect(ctx, 6, 6, 4, 4, "#ffe9a8");
	px(ctx, 7, 7, "#ffffff");
	// Postes de hierro de las esquinas (marco)
	for (const [x, y] of [
		[0, 0],
		[15, 0],
		[0, 15],
		[15, 15]
	]) {
		rect(ctx, x, y, 2, 2, "#3a342e");
	}
	// Marco: travesaños superior e inferior + montantes laterales
	rect(ctx, 0, 0, 16, 2, "#554a3e");
	rect(ctx, 0, 14, 16, 2, "#554a3e");
	rect(ctx, 0, 0, 2, 16, "#554a3e");
	rect(ctx, 14, 0, 2, 16, "#554a3e");
	// Asa/cruz superior (donde cuelga de la cadena)
	rect(ctx, 5, 1, 6, 2, "#6f645a");
	rect(ctx, 7, 0, 2, 2, "#6f645a");
	// Reflejos del vidrio (rayas verticales claras)
	for (const x of [4, 11]) {
		px(ctx, x, 3, "#ffe9a8");
		px(ctx, x, 12, "#ffe9a8");
	}
}

// Fase 21.5 (B3): bambú — tallo verde con nudos (líneas horizontales cada
// 4 px) y borde iluminado a la izquierda (cross-quad de planta alta).
function drawBamboo(ctx, rng) {
	fill(ctx, "#3a8c2f");
	for (let y = 0; y < 16; y += 4) rect(ctx, 0, y, 16, 1, "#2e6e24");
	for (let x = 0; x < 16; x += 3) rect(ctx, x, 0, 1, 16, "#4aa83c");
	px(ctx, 2, 1, "#6cc85a");
	px(ctx, 2, 5, "#6cc85a");
	px(ctx, 2, 9, "#6cc85a");
	px(ctx, 2, 13, "#6cc85a");
}
// Tablones de bambú: amarillo pajizo con vetas horizontales finas (estilo
// tablón pero más claro, como los tablones de bambú de MC).
function drawBambooPlanks(ctx, rng) {
	fill(ctx, "#d8c74e");
	for (let y = 0; y < 16; y += 4) rect(ctx, 0, y, 16, 1, "#b8a63a");
	for (let y = 0; y < 16; y += 4) {
		const x = Math.floor(rng() * 8);
		rect(ctx, x, y + 1, 3, 1, "#efe29a");
	}
	speckle(ctx, rng, "#a08a2a", 0.04);
}
// Andamio: marco naranja con cruz diagonal (estructura ligera de bambú).
function drawScaffolding(ctx, rng) {
	fill(ctx, "#d89a4e");
	rect(ctx, 0, 0, 16, 2, "#b8742e");
	rect(ctx, 0, 14, 16, 2, "#b8742e");
	rect(ctx, 0, 0, 2, 16, "#c07a34");
	rect(ctx, 14, 0, 2, 16, "#c07a34");
	for (let i = 0; i < 8; i++) {
		const x = 2 + i * 1.5;
		px(ctx, Math.floor(x), 2, "#b8742e");
		px(ctx, Math.floor(x), 13, "#b8742e");
	}
	rect(ctx, 4, 7, 8, 2, "#b8742e");
}

// Fase 21.5 (B5): abanico de coral — ramitas ramificadas sobre transparente
// (se dibuja como cross-quad, como las plantas).
function drawCoralFan(ctx, rng) {
	rect(ctx, 7, 8, 2, 8, "#d95a50"); // tallo central
	rect(ctx, 6, 5, 1, 5, "#e86a5e"); // rama izq
	rect(ctx, 9, 4, 1, 6, "#e86a5e"); // rama der
	rect(ctx, 3, 2, 3, 2, "#f08a7e"); // punta izq amplia
	rect(ctx, 10, 1, 3, 2, "#f08a7e"); // punta der amplia
	for (let y = 3; y < 14; y += 3) {
		for (const x of [7, 8]) px(ctx, x, y, "#a83a34");
	}
	px(ctx, 8, 11, "#a83a34");
	px(ctx, 6, 7, "#a83a34");
	px(ctx, 9, 8, "#a83a34");
}
// Kelp: tallo largo ondulado con hojas laterales (cross-quad de planta alta).
function drawKelp(ctx, rng) {
	rect(ctx, 7, 0, 2, 16, "#2f7a30"); // tallo vertical
	for (let y = 2; y < 16; y += 3) {
		if (y % 2 === 0) rect(ctx, 3, y, 4, 1, "#4a9a48");
		else rect(ctx, 9, y, 4, 1, "#4a9a48");
	}
	rect(ctx, 7, 0, 2, 1, "#5ab85a"); // punta clara
	px(ctx, 6, 6, "#245e24");
	px(ctx, 9, 9, "#245e24");
	px(ctx, 7, 12, "#245e24");
}
// Pasto marino: hojas curvas bajas (cross-quad, como la hierba alta).
function drawSeagrass(ctx, rng) {
	rect(ctx, 5, 8, 2, 6, "#2f7a30");
	rect(ctx, 9, 9, 2, 5, "#3a8f3a");
	rect(ctx, 7, 6, 2, 8, "#4a9a48");
	px(ctx, 4, 8, "#2f7a30");
	px(ctx, 10, 9, "#3a8f3a");
	px(ctx, 3, 10, "#2f7a30");
	px(ctx, 11, 11, "#4a9a48");
	px(ctx, 12, 13, "#2f7a30");
	px(ctx, 2, 13, "#3a8f3a");
}
// Fase 21.5 (C1): horno de fundición — piedra oscura con reja naranja.
function drawBlastFurnace(ctx, rng) {
	fill(ctx, "#4a3a2a");
	// Reja frontal naranja
	rect(ctx, 3, 3, 10, 8, "#d86a2a");
	rect(ctx, 4, 4, 8, 6, "#c94a1a");
	// Líneas de la reja
	for (let y = 4; y < 10; y += 2) rect(ctx, 4, y, 8, 1, "#4a3a2a");
	speckle(ctx, rng, "#5a4a3a", 0.08);
}
// Fase 21.5 (E3): bloques decorativos — arbustos, hojarasca, flores secas.
function drawFireflyBush(ctx, rng) {
	fill(ctx, "#2a4a1a");
	for (const [x, y] of [[3, 4], [6, 2], [9, 5], [5, 8], [10, 7], [2, 9]])
		rect(ctx, x, y, 3, 3, "#3a6a2a");
	// Luciérnagas: puntos amarillos brillantes
	px(ctx, 5, 5, "#f5e84a"); px(ctx, 10, 4, "#f5e84a");
	px(ctx, 7, 9, "#f5e84a"); px(ctx, 3, 7, "#f5e84a");
}
function drawLeafLitter(ctx, rng) {
	fill(ctx, "#6a8a3a");
	for (let i = 0; i < 8; i++) {
		const x = 1 + rng() * 12, y = 5 + rng() * 8;
		rect(ctx, Math.floor(x), Math.floor(y), 3, 2, "#5a7a2a");
	}
	speckle(ctx, rng, "#7a9a4a", 0.15);
}
function drawWildflowers(ctx, rng) {
	fill(ctx, "#5a8a3a");
	// Tallos
	for (const x of [3, 6, 9, 12]) rect(ctx, x, 6, 1, 6, "#4a7a2a");
	// Flores amarillas
	for (const [x, y] of [[2, 3], [5, 2], [8, 4], [11, 3]])
		rect(ctx, x, y, 2, 2, "#f5d040");
}
function drawBush(ctx, rng) {
	fill(ctx, "#3a6a2a");
	for (const [x, y, w, h] of [[2, 3, 5, 5], [7, 2, 6, 6], [4, 6, 5, 4]])
		rect(ctx, x, y, w, h, "#2a5a1a");
	speckle(ctx, rng, "#4a8a3a", 0.12);
}
function drawShortDryGrass(ctx, rng) {
	fill(ctx, "#c8b870");
	for (const x of [2, 5, 8, 11]) {
		rect(ctx, x, 8, 1, 5, "#b0a050");
		rect(ctx, x, 7, 2, 1, "#d0c080");
	}
}
function drawTallDryGrass(ctx, rng) {
	fill(ctx, "#b0a050");
	for (const x of [2, 5, 8, 11]) {
		rect(ctx, x, 3, 1, 10, "#a09040");
		rect(ctx, x, 2, 2, 1, "#c0b060");
	}
}
function drawCactusFlower(ctx, rng) {
	fill(ctx, "#3a8a2a");
	// Tallo del cactus
	rect(ctx, 6, 5, 4, 9, "#2a7a1a");
	// Flor rosa
	for (const [x, y] of [[4, 1], [6, 0], [8, 1], [5, 2], [7, 2]])
		rect(ctx, x, y, 2, 2, "#e85a6a");
	px(ctx, 6, 1, "#f5c84a"); // centro
}
// Fase 21.5 (B4): nido de abeja — madera clara con panal dorado central y
// agujero oscuro (como MC: un tronco con miel).
function drawBeeNest(ctx, rng) {
	fill(ctx, "#9a7a52"); // corteza clara
	for (let y = 0; y < 16; y += 4) rect(ctx, 0, y, 16, 1, "#7a5f3c");
	// Entrada oscura del nido
	rect(ctx, 6, 6, 4, 6, "#4a3418");
	rect(ctx, 4, 8, 8, 4, "#6b4c22");
	// Panal dorado alrededor de la entrada
	for (const [x, y] of [
		[3, 3], [12, 3], [3, 12], [12, 12], [2, 7], [13, 7]
	]) {
		rect(ctx, x, y, 2, 2, "#e8a520");
	}
	speckle(ctx, rng, "#6b5226", 0.06);
}
// Colmena crafteada: mismo panel pero más regular y con el panal más marcado
// (cubos de miel en la entradas, "goteo" abajo).
function drawBeeHive(ctx, rng) {
	fill(ctx, "#a85a22"); // madera de colmena
	for (let y = 0; y < 16; y += 4) rect(ctx, 0, y, 16, 1, "#8a4518");
	rect(ctx, 4, 4, 8, 8, "#d8b040"); // panal central
	rect(ctx, 3, 3, 10, 2, "#e8c860"); // panal superior
	rect(ctx, 3, 11, 10, 2, "#e8c860"); // panal inferior
	// Agujeros de la entrada
	rect(ctx, 6, 6, 4, 4, "#8a4518");
	// Goteo de miel por abajo
	for (const x of [4, 8, 12]) px(ctx, x, 15, "#e8a520");
	speckle(ctx, rng, "#7a3a10", 0.05);
}
// Bloque de miel: ámbar claro uniforme con ondas de miel más oscuras.
function drawHoneyBlock(ctx, rng) {
	fill(ctx, "#f5a623");
	for (let y = 4; y < 16; y += 8) rect(ctx, 0, y, 16, 2, "#e08a10");
	rect(ctx, 2, 2, 12, 2, "#ffc04a");
	rect(ctx, 2, 12, 12, 2, "#d9820a");
	speckle(ctx, rng, "#d9820a", 0.08);
}

// ============================================================
// Fase 21.5 (C5): CONCRETO — 16 colores lisos (makeConcrete) y 16 polvos
// granulados (makeConcretePowder). El polvo cae con gravedad y al tocar agua
// se convierte en el concreto del mismo color (world.js lo aplica).
// ============================================================
function makeConcrete(color) {
	return (ctx, rng) => {
		fill(ctx, color);
		// Biselado ligero de bloque (más claro arriba, más oscuro abajo).
		rect(ctx, 0, 0, TILE, 1, lighten(color, 24));
		rect(ctx, 0, TILE - 1, TILE, 1, darken(color, 24));
		speckle(ctx, rng, darken(color, 14), 0.05);
		speckle(ctx, rng, lighten(color, 18), 0.04);
	};
}
function makeConcretePowder(color) {
	return (ctx, rng) => {
		fill(ctx, color);
		// El polvo se ve más "punteado" que el bloque endurecido.
		for (let i = 0; i < 26; i++) {
			const x = Math.floor(rng() * TILE);
			const y = Math.floor(rng() * TILE);
			px(ctx, x, y, rng() < 0.5 ? darken(color, 30) : lighten(color, 26));
		}
		speckle(ctx, rng, darken(color, 18), 0.12);
	};
}
// Fase 21.5 (D1): bóveda (Vault) de Trial Chambers — piedra gris con reja
// metálica; decorativo (sin llave).
function drawVault(ctx, _rng) {
	fill(ctx, "#6a6560");
	rect(ctx, 1, 1, TILE - 2, TILE - 2, "#57524d");
	rect(ctx, 4, 3, 8, 10, "#2a2724");
	rect(ctx, 5, 4, 6, 8, "#3f3a35");
	for (let y = 4; y < 12; y += 2) rect(ctx, 5, y, 6, 1, "#1c1a18");
	rect(ctx, 6, 10, 4, 2, "#d8c06a"); // brillo dorado del tesoro
}
// Fase 21.5 (F3): Corazón Crujiente — madera pálida con el centro que late
// (naranja vivo). El mob Creaking se vincula a este bloque.
function drawCreakingHeart(ctx, _rng) {
	fill(ctx, "#ddd5c8");
	speckle(ctx, _rng, "#c8c0b2", 0.15);
	rect(ctx, 5, 1, 6, 3, "#f0ead8");
	rect(ctx, 5, 12, 6, 3, "#f0ead8");
	rect(ctx, 3, 5, 10, 6, "#f0ead8");
	rect(ctx, 5, 5, 6, 6, "#6a1a0a"); // corazón oscuro
	px(ctx, 7, 7, "#ff8a3a"); // latido
	px(ctx, 8, 8, "#ff8a3a");
}
// Fase 21.5 (F1): Pale Garden — corteza pálida (vertical), hojas claras,
// tablones blanquecinos y musgo.
function drawPaleLogSide(ctx, rng) {
	fill(ctx, "#e8e2d5");
	for (let y = 0; y < 16; y += 5) rect(ctx, 0, y, 16, 1, "#d5cfc0");
	speckle(ctx, rng, "#cfc8b8", 0.1);
}
function drawPaleLogTop(ctx, rng) {
	fill(ctx, "#f0ecdf");
	for (const [x, y, w, h] of [[3, 4, 4, 3], [9, 8, 4, 3], [6, 1, 3, 3]])
		rect(ctx, x, y, w, h, "#ddd6c4");
	speckle(ctx, rng, "#d8d0c0", 0.08);
}
function drawPaleLeaves(ctx, rng) {
	fill(ctx, "#b8c8a8");
	rect(ctx, 0, 0, TILE, 2, "#a8b898");
	rect(ctx, 0, TILE - 2, TILE, 2, "#a8b898");
	speckle(ctx, rng, "#9cac8c", 0.15);
	rect(ctx, 3, 5, 4, 3, "#c8d8b8");
	rect(ctx, 9, 9, 4, 3, "#c8d8b8");
}
function drawPalePlanks(ctx, rng) {
	fill(ctx, "#f0ead8");
	for (let y = 0; y < 16; y += 4) rect(ctx, 0, y, 16, 1, "#ddd6c2");
	rect(ctx, 7, 0, 1, 16, "#ddd6c2");
	speckle(ctx, rng, "#e5dec8", 0.06);
}
function drawPaleMossBlock(ctx, rng) {
	fill(ctx, "#8fae84");
	speckle(ctx, rng, "#7d9c72", 0.2);
	rect(ctx, 2, 2, 4, 3, "#a2c096");
	rect(ctx, 10, 8, 4, 4, "#a2c096");
	rect(ctx, 5, 11, 3, 3, "#779a6e");
}
function drawPaleMoss(ctx, rng) {
	fill(ctx, "#0a0a0a00");
	// Alfombra: guirnaldas claras apelotonadas (transparente alrededor)
	for (const [x, y, w, h] of [[2, 6, 4, 3], [7, 6, 4, 3], [11, 8, 3, 2], [4, 9, 3, 3]])
		rect(ctx, x, y, w, h, "#a5c398");
	speckle(ctx, rng, "#8fae84", 0.12);
}
// Fase 21.5 (D3): núcleo pesado — bloque denso de piedra con nervios.
function drawHeavyCore(ctx, rng) {
	fill(ctx, "#8a8682");
	speckle(ctx, rng, "#75716d", 0.15);
	rect(ctx, 3, 3, 10, 10, "#6a665f");
	rect(ctx, 5, 5, 6, 6, "#97938b");
	rect(ctx, 0, 7, 16, 2, "#5a5650");
	rect(ctx, 7, 0, 2, 16, "#5a5650");
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
	drawVines, // 54 liana (cross)
	// Fase 13 (L2/L3): puertas, escaleras, losas, valla y portón
	drawDoorOak, // 55 puerta de roble
	drawDoorIron, // 56 puerta de hierro
	drawStairsOak, // 57 escaleras de roble
	drawStairsStone, // 58 escaleras de piedra
	drawSlabOak, // 59 losa de roble
	drawSlabStone, // 60 losa de piedra
	drawFenceOak, // 61 valla de roble
	drawFenceGate, // 62 portón de roble
	drawCoral, // 63 coral (Fase 21.5, D2)
	drawGranite, // 64 granito (Fase 21.5, B1)
	drawDiorite, // 65 diorita
	drawAndesite, // 66 andesita
	drawPolishedGranite, // 67 granito pulido
	drawPolishedDiorite, // 68 diorita pulida
	drawPolishedAndesite, // 69 andesita pulida
	drawLantern // 70 linterna (Fase 21.5, B2)
	,
	// Fase 21.5 (B3): bambú, tablones de bambú y andamio
	drawBamboo, // 71
	drawBambooPlanks, // 72
	drawScaffolding, // 73
	// Fase 21.5 (B4): nido de abeja, colmena y bloque de miel
	drawBeeNest, // 74
	drawBeeHive, // 75
	drawHoneyBlock, // 76
	// Fase 21.5 (B5): abanico de coral, kelp y pasto marino (cross-quads)
	drawCoralFan, // 77
	drawKelp, // 78
	drawSeagrass, // 79
	// Fase 21.5 (E2): lana nueva (gris, negra, marrón)
	makeWool("#8a8a88", "#a8a8a6", "#6a6a68"), // 80 lana gris
	makeWool("#2a2a2a", "#4a4a4a", "#0a0a0a"), // 81 lana negra
	makeWool("#8a5a3a", "#a87a5a", "#6a3a1a"), // 82 lana marrón
	// Fase 21.5 (C4): 16 camas de colores (3 teselas cada una: top, side, front)
	// Blanco (44)
	makeBedTop("#f5f5f0"), // 83
	makeBedSide("#f5f5f0"), // 84
	makeBedFront("#f5f5f0"), // 85
	// Naranja (45)
	makeBedTop("#e88a2a"), // 86
	makeBedSide("#e88a2a"), // 87
	makeBedFront("#e88a2a"), // 88
	// Magenta (46)
	makeBedTop("#c93ac9"), // 89
	makeBedSide("#c93ac9"), // 90
	makeBedFront("#c93ac9"), // 91
	// Azul claro (47)
	makeBedTop("#5a8ad9"), // 92
	makeBedSide("#5a8ad9"), // 93
	makeBedFront("#5a8ad9"), // 94
	// Amarilla (52)
	makeBedTop("#e8d21a"), // 95
	makeBedSide("#e8d21a"), // 96
	makeBedFront("#e8d21a"), // 97
	// Verde lima (53)
	makeBedTop("#6fd93a"), // 98
	makeBedSide("#6fd93a"), // 99
	makeBedFront("#6fd93a"), // 100
	// Rosa (54)
	makeBedTop("#e88ab0"), // 101
	makeBedSide("#e88ab0"), // 102
	makeBedFront("#e88ab0"), // 103
	// Gris (55)
	makeBedTop("#8a8a8a"), // 104
	makeBedSide("#8a8a8a"), // 105
	makeBedFront("#8a8a8a"), // 106
	// Gris claro (56)
	makeBedTop("#c0c0c0"), // 107
	makeBedSide("#c0c0c0"), // 108
	makeBedFront("#c0c0c0"), // 109
	// Cian (57)
	makeBedTop("#2ab8c9"), // 110
	makeBedSide("#2ab8c9"), // 111
	makeBedFront("#2ab8c9"), // 112
	// Púrpura (58)
	makeBedTop("#7a3ac9"), // 113
	makeBedSide("#7a3ac9"), // 114
	makeBedFront("#7a3ac9"), // 115
	// Azul (59)
	makeBedTop("#3a5ac9"), // 116
	makeBedSide("#3a5ac9"), // 117
	makeBedFront("#3a5ac9"), // 118
	// Marrón (62)
	makeBedTop("#8a5a3a"), // 119
	makeBedSide("#8a5a3a"), // 120
	makeBedFront("#8a5a3a"), // 121
	// Verde (63)
	makeBedTop("#3a9a3a"), // 122
	makeBedSide("#3a9a3a"), // 123
	makeBedFront("#3a9a3a"), // 124
	// Roja (64)
	makeBedTop("#c0392b"), // 125
	makeBedSide("#c0392b"), // 126
	makeBedFront("#c0392b"), // 127
	// Negra (65)
	makeBedTop("#2a2a2a"), // 128
	makeBedSide("#2a2a2a"), // 129
	makeBedFront("#2a2a2a") // 130
	,
	// Fase 21.5 (C1): horno de fundición — piedra oscura con reja naranja (frente)
	drawBlastFurnace, // 131
	// Fase 21.5 (E3): bloques decorativos (cross-quads)
	drawFireflyBush, // 132
	drawLeafLitter, // 133
	drawWildflowers, // 134
	drawBush, // 135
	drawShortDryGrass, // 136
	drawTallDryGrass, // 137
	drawCactusFlower, // 138
	// ============================================================
	// Fase 21.5 (C5): concreto (16) y polvo de concreto (16).
	// ============================================================
	makeConcrete("#f5f5f0"), // 139 blanco
	makeConcrete("#e88a2a"), // 140 naranja
	makeConcrete("#c93ac9"), // 141 magenta
	makeConcrete("#5a8ad9"), // 142 azul claro
	makeConcrete("#e8d21a"), // 143 amarillo
	makeConcrete("#6fd93a"), // 144 lima
	makeConcrete("#e88ab0"), // 145 rosa
	makeConcrete("#8a8a8a"), // 146 gris
	makeConcrete("#c0c0c0"), // 147 gris claro
	makeConcrete("#2ab8c9"), // 148 cian
	makeConcrete("#7a3ac9"), // 149 púrpura
	makeConcrete("#3a5ac9"), // 150 azul
	makeConcrete("#8a5a3a"), // 151 marrón
	makeConcrete("#3a9a3a"), // 152 verde
	makeConcrete("#c0392b"), // 153 rojo
	makeConcrete("#2a2a2a"), // 154 negro
	makeConcretePowder("#f5f5f0"), // 155
	makeConcretePowder("#e88a2a"), // 156
	makeConcretePowder("#c93ac9"), // 157
	makeConcretePowder("#5a8ad9"), // 158
	makeConcretePowder("#e8d21a"), // 159
	makeConcretePowder("#6fd93a"), // 160
	makeConcretePowder("#e88ab0"), // 161
	makeConcretePowder("#8a8a8a"), // 162
	makeConcretePowder("#c0c0c0"), // 163
	makeConcretePowder("#2ab8c9"), // 164
	makeConcretePowder("#7a3ac9"), // 165
	makeConcretePowder("#3a5ac9"), // 166
	makeConcretePowder("#8a5a3a"), // 167
	makeConcretePowder("#3a9a3a"), // 168
	makeConcretePowder("#c0392b"), // 169
	makeConcretePowder("#2a2a2a"), // 170
	// ============================================================
	// Fase 21.5 (D1/D3/F1/F3): Bóveda, Corazón Crujiente, Pale Garden y
	// núcleo pesado.
	// ============================================================
	drawVault, // 171
	drawCreakingHeart, // 172
	drawPaleLogTop, // 173
	drawPaleLogSide, // 174
	drawPaleLeaves, // 175
	drawPalePlanks, // 176
	drawPaleMossBlock, // 177
	drawPaleMoss, // 178
	drawHeavyCore // 179
];

// El mapa de teselas por bloque/cara (BLOCK_TEX) y los rectángulos UV viven en
// texturemap.js (módulo puro, sin three ni DOM): los usa el greedy meshing
// (chunkGeometry.js) y el Web Worker de chunks (Fase 13, A1/A2) sin resolver
// el importmap. Este módulo re-exporta tileForFace/tileRect para conservar su
// API (world.js los importa de aquí) y fija el recuento de teselas para que
// tileRect() coincida con el atlas real (TILES se define más arriba).
setTileCount(TILES.length);

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

// Fase 19 (B): fondo texturizado de los paneles — tesela del atlas (madera
// de roble o piedra) repetida como data URL CSS. Sin assets: dibuja la misma
// función de tesela sobre su propio canvas y devuelve el `background` CSS
// listo para usar (el CSS lo repite con background-repeat: repeat).
export function panelTileCss(kind) {
	const draw = kind === "stone" ? drawStone : drawPlanks;
	const canvas = document.createElement("canvas");
	canvas.width = TILE;
	canvas.height = TILE;
	const ctx = canvas.getContext("2d");
	draw(ctx, mulberry32(1337 + (kind === "stone" ? 3 : 7) * 7919));
	return `url("${canvas.toDataURL()}")`;
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
