// ============================================================
// ICONOS PROCEDURALES DE ÍTEMS (16x16 px, pixel-art)
// Reemplazan el swatch de color y el texto del inventario/HUD: cada
// ítem (bloques, comida, lingotes, minerales, herramientas y armadura)
// tiene un icono dibujado en un canvas al cargar el cliente, montado
// en un atlas de una sola fila que el CSS recorta por posición. Sin
// assets binarios ni build step. Misma filosofía que mobtextures.js.
// La lógica de dibujo es PURA (grid de celdas, sin canvas ni DOM):
// tests/unit-itemicons.js la importa en Node como ESM.
// ============================================================
import { BLOCK_COLORS } from "./constants.js";

const TILE = 16; // px por tesela

// --- PRNG determinista (mulberry32): los iconos son estables entre cargas ---
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
function rngFor(id) {
	return mulberry32(0x9e3779b9 ^ (id * 2654435761));
}

// ============================================================
// GRID DE PÍXELES (lógica pura, sin canvas)
// Una tesela es un array de 256 celdas; null = transparente.
// ============================================================
function emptyGrid() {
	return new Array(TILE * TILE).fill(null);
}
function set(g, x, y, c) {
	if (x >= 0 && x < TILE && y >= 0 && y < TILE) g[y * TILE + x] = c;
}
function rect(g, x, y, w, h, c) {
	for (let yy = y; yy < y + h; yy++) {
		for (let xx = x; xx < x + w; xx++) set(g, xx, yy, c);
	}
}
function hline(g, x0, x1, y, c) {
	for (let xx = x0; xx <= x1; xx++) set(g, xx, y, c);
}
function vline(g, x, y0, y1, c) {
	for (let yy = y0; yy <= y1; yy++) set(g, x, yy, c);
}
// Bresenham: líneas diagonales (palos, hebras, tallos)
function line(g, x0, y0, x1, y1, c) {
	const dx = Math.abs(x1 - x0);
	const dy = -Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let err = dx + dy;
	for (;;) {
		set(g, x0, y0, c);
		if (x0 === x1 && y0 === y1) break;
		const e2 = 2 * err;
		if (e2 >= dy) {
			err += dy;
			x0 += sx;
		}
		if (e2 <= dx) {
			err += dx;
			y0 += sy;
		}
	}
}
// Aclarar/oscurecer un color hex por factor (0.25 = +25% luz, -0.3 = -30%)
function shade(hex, f) {
	const n = parseInt(hex.slice(1), 16);
	const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * (1 + f))));
	const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * (1 + f))));
	const b = Math.max(0, Math.min(255, Math.round((n & 255) * (1 + f))));
	return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
// Sombra suave de 1px abajo-derecha (solo rellena celdas vacías): el icono
// "flota" sobre el fondo del slot, como en Minecraft.
function softShadow(g, color = "rgba(0,0,0,0.35)") {
	const src = g.slice();
	for (let y = 0; y < TILE; y++) {
		for (let x = 0; x < TILE; x++) {
			if (src[y * TILE + x] && !g[(y + 1) * TILE + x + 1]) {
				set(g, x + 1, y + 1, color);
			}
		}
	}
}

// ============================================================
// PALETAS (materiales de herramientas/armadura)
// ============================================================
const C = {
	handle: "#8a5a2b", // mango de madera de las herramientas
	wood: { m: "#8a5a2b", dark: "#6b4226", light: "#b07a40" },
	stone: { m: "#9a9a9a", dark: "#767676", light: "#c0c0c0" },
	iron: { m: "#d8d8d8", dark: "#9a9a9a", light: "#f4f4f4" },
	gold: { m: "#e8c547", dark: "#b8860b", light: "#fdf0a0" },
	diamond: { m: "#5ee0d0", dark: "#2e9a8a", light: "#b0fff2" },
	leather: { m: "#c9a06b", dark: "#8f6b3e", light: "#e0c090" }
};

// ============================================================
// BLOQUES (cuadro con bisel + motas; especiales para los reconocibles)
// ============================================================
function blockHex(id) {
	return `#${BLOCK_COLORS[id].toString(16).padStart(6, "0")}`;
}
function drawBlock(g, rng, hex) {
	const light = shade(hex, 0.25);
	const dark = shade(hex, -0.3);
	rect(g, 2, 2, 12, 12, hex);
	rect(g, 2, 2, 12, 1, light);
	rect(g, 2, 2, 1, 12, light);
	rect(g, 2, 13, 12, 1, dark);
	rect(g, 13, 2, 1, 12, dark);
	for (let i = 0; i < 6; i++) {
		set(
			g,
			3 + Math.floor(rng() * 10),
			3 + Math.floor(rng() * 10),
			rng() < 0.5 ? light : dark
		);
	}
}
function drawGrass(g, rng) {
	const dirt = "#8a5a2b",
		dirtDark = "#6b4226",
		green = "#5fbf3a",
		greenDark = "#4a9a2e";
	rect(g, 2, 2, 12, 12, dirt);
	rect(g, 2, 2, 12, 3, green);
	rect(g, 2, 2, 1, 4, "#7fd05a");
	for (let i = 0; i < 5; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 2), greenDark);
	rect(g, 2, 13, 12, 1, dirtDark);
	rect(g, 13, 2, 1, 12, dirtDark);
}
function drawLog(g) {
	const bark = "#6b4a2b",
		dark = "#52381f",
		ring = "#c9a46b";
	rect(g, 2, 2, 12, 12, bark);
	vline(g, 5, 3, 13, dark);
	vline(g, 9, 3, 13, dark);
	vline(g, 12, 3, 13, dark);
	// extremo superior: anillos de corte
	rect(g, 2, 2, 12, 2, ring);
	hline(g, 5, 10, 2, bark);
	rect(g, 2, 13, 12, 1, dark);
	rect(g, 13, 2, 1, 12, dark);
}
function drawLeaves(g, rng) {
	const green = "#3a7a2e",
		dark = "#2a5a22",
		light = "#5a9a4a";
	rect(g, 2, 2, 12, 12, green);
	for (let i = 0; i < 14; i++) {
		const x = 3 + Math.floor(rng() * 10),
			y = 3 + Math.floor(rng() * 10);
		set(g, x, y, rng() < 0.5 ? dark : light);
	}
	for (let i = 0; i < 4; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), null);
	rect(g, 2, 2, 12, 1, light);
	rect(g, 2, 13, 12, 1, dark);
}
function drawPlanks(g, rng) {
	const wood = "#c9a46b",
		dark = "#8f6b3e";
	rect(g, 2, 2, 12, 12, wood);
	hline(g, 2, 13, 5, dark);
	hline(g, 2, 13, 9, dark);
	hline(g, 2, 13, 13, dark);
	rect(g, 2, 2, 12, 1, shade(wood, 0.2));
	for (let i = 0; i < 4; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), dark);
}
function drawCobble(g, rng) {
	const base = "#8a8a8a",
		dark = "#6f6f6f",
		light = "#a0a0a0";
	rect(g, 2, 2, 12, 12, base);
	vline(g, 6, 2, 8, dark);
	hline(g, 3, 10, 8, dark);
	vline(g, 10, 8, 13, dark);
	hline(g, 5, 13, 12, dark);
	for (let i = 0; i < 8; i++)
		set(
			g,
			3 + Math.floor(rng() * 10),
			3 + Math.floor(rng() * 10),
			rng() < 0.5 ? dark : light
		);
	rect(g, 2, 2, 12, 1, light);
	rect(g, 2, 13, 12, 1, dark);
}
const ORE_COLORS = {
	9: "#2a2a2a", // carbón
	10: "#d8b08a", // hierro
	11: "#e8c547", // oro
	12: "#5ee0d0", // diamante
	13: "#e03030", // redstone
	14: "#2ed06a" // esmeralda
};
function drawOre(g, rng, color) {
	const base = "#8a8a8a",
		dark = "#6f6f6f";
	rect(g, 2, 2, 12, 12, base);
	for (let i = 0; i < 4; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), dark);
	for (let i = 0; i < 5; i++) {
		const x = 3 + Math.floor(rng() * 9),
			y = 3 + Math.floor(rng() * 9);
		set(g, x, y, color);
		set(g, x + 1, y + 1, color);
	}
	rect(g, 2, 2, 12, 1, shade(base, 0.2));
	rect(g, 2, 13, 12, 1, dark);
}
function drawCraftTable(g) {
	const wood = "#c9a46b",
		dark = "#8f6b3e";
	rect(g, 2, 2, 12, 12, wood);
	rect(g, 2, 2, 12, 1, shade(wood, 0.25));
	// encimera con cuadrícula 2x2
	hline(g, 2, 13, 6, dark);
	vline(g, 7, 2, 5, dark);
	vline(g, 10, 2, 5, dark);
	// patas
	vline(g, 3, 7, 13, dark);
	vline(g, 12, 7, 13, dark);
	hline(g, 2, 13, 13, dark);
	rect(g, 13, 2, 1, 12, dark);
}
function drawFurnace(g) {
	const base = "#8a8a8a",
		dark = "#6f6f6f",
		mouth = "#1a1a1a";
	rect(g, 2, 2, 12, 12, base);
	rect(g, 2, 2, 12, 1, "#a0a0a0");
	rect(g, 2, 13, 12, 1, dark);
	rect(g, 13, 2, 1, 12, dark);
	// boca del horno
	rect(g, 5, 6, 6, 6, mouth);
	rect(g, 4, 5, 8, 1, "#c0c0c0");
	rect(g, 4, 12, 8, 1, dark);
	set(g, 6, 8, "#e8c547");
	set(g, 9, 10, "#e88040");
}
function drawGlass(g) {
	rect(g, 2, 2, 12, 12, "rgba(190,231,240,0.85)");
	hline(g, 3, 8, 3, "rgba(255,255,255,0.9)");
	hline(g, 4, 7, 4, "rgba(255,255,255,0.9)");
	rect(g, 2, 2, 12, 1, "rgba(255,255,255,0.5)");
	rect(g, 2, 13, 12, 1, "rgba(110,150,165,0.5)");
	rect(g, 13, 2, 1, 12, "rgba(110,150,165,0.5)");
}
function drawWool(g, rng) {
	const base = "#f5f5f0",
		dark = "#d9d9d2";
	rect(g, 2, 2, 12, 12, base);
	for (let i = 0; i < 10; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), dark);
	rect(g, 2, 2, 12, 1, "#ffffff");
	rect(g, 2, 13, 12, 1, dark);
}
function drawSnow(g, rng) {
	const base = "#e8f4f8",
		dark = "#c9dce4",
		light = "#ffffff";
	rect(g, 2, 2, 12, 12, base);
	for (let i = 0; i < 8; i++)
		set(
			g,
			3 + Math.floor(rng() * 10),
			3 + Math.floor(rng() * 10),
			rng() < 0.5 ? light : dark
		);
	rect(g, 2, 2, 12, 1, light);
	rect(g, 2, 13, 12, 1, dark);
}
function drawChest(g) {
	const wood = "#8a5a2b",
		dark = "#6b4226",
		light = "#a87a44",
		latch = "#e8c547";
	rect(g, 2, 2, 12, 12, wood);
	rect(g, 2, 2, 12, 1, light);
	rect(g, 13, 2, 1, 12, dark);
	rect(g, 2, 13, 12, 1, dark);
	// tapa
	hline(g, 2, 13, 7, dark);
	rect(g, 2, 2, 12, 5, light);
	// cerradura dorada
	rect(g, 6, 8, 4, 4, latch);
	set(g, 7, 9, "#8f6b00");
	set(g, 8, 9, "#8f6b00");
	set(g, 2, 3, dark);
	set(g, 13, 3, dark);
}
function drawTorch(g) {
	const stick = "#8a5a2b",
		outline = "#6b4226",
		flame = "#ffb347",
		flameHot = "#fff0a0",
		flameDark = "#e88040";
	vline(g, 7, 8, 13, stick);
	vline(g, 8, 8, 13, stick);
	set(g, 7, 13, outline);
	set(g, 8, 13, outline);
	rect(g, 6, 5, 4, 4, flame);
	set(g, 7, 4, flameHot);
	set(g, 8, 4, flameHot);
	set(g, 7, 5, flameHot);
	set(g, 8, 5, flameHot);
	set(g, 6, 6, flameDark);
	set(g, 9, 6, flameDark);
}
function drawBed(g) {
	const blanket = "#c0392b",
		blanketDark = "#8f2a20",
		pillow = "#f5f5f0",
		frame = "#8a5a2b";
	rect(g, 2, 2, 12, 12, frame);
	rect(g, 2, 4, 12, 8, blanket);
	hline(g, 2, 13, 6, blanketDark);
	hline(g, 2, 13, 10, blanketDark);
	rect(g, 2, 2, 5, 4, pillow);
	rect(g, 2, 2, 5, 1, "#ffffff");
	set(g, 2, 12, frame);
	set(g, 13, 12, frame);
	set(g, 2, 13, frame);
	set(g, 13, 13, frame);
}
function drawWater(g) {
	const base = "#3a8fd8",
		deep = "#2a6ab0",
		foam = "#9ad0f5";
	rect(g, 2, 2, 12, 12, base);
	hline(g, 3, 6, 5, foam);
	hline(g, 8, 11, 5, deep);
	hline(g, 4, 9, 8, foam);
	hline(g, 6, 12, 11, deep);
	hline(g, 3, 7, 11, foam);
	rect(g, 2, 2, 12, 1, foam);
	rect(g, 2, 13, 12, 1, deep);
}
function drawLava(g, rng) {
	const base = "#e25822",
		hot = "#ffb347",
		core = "#fff0a0",
		dark = "#b03a14";
	rect(g, 2, 2, 12, 12, base);
	for (let i = 0; i < 5; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), hot);
	set(g, 7, 6, core);
	set(g, 8, 6, core);
	set(g, 10, 9, core);
	rect(g, 2, 2, 12, 1, hot);
	rect(g, 2, 13, 12, 1, dark);
}
function drawBedrock(g, rng) {
	const base = "#1a1a1a",
		light = "#3a3a3a";
	rect(g, 2, 2, 12, 12, base);
	for (let i = 0; i < 10; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), light);
	rect(g, 2, 2, 12, 1, "#2a2a2a");
	rect(g, 2, 13, 12, 1, "#0d0d0d");
}

function drawBlockIcon(id, g, rng) {
	switch (id) {
		case 2:
			drawGrass(g, rng);
			break;
		case 4:
			drawLog(g);
			break;
		case 5:
			drawLeaves(g, rng);
			break;
		case 7:
			drawPlanks(g, rng);
			break;
		case 8:
			drawCobble(g, rng);
			break;
		case 15:
			drawCraftTable(g);
			break;
		case 16:
			drawFurnace(g);
			break;
		case 17:
			drawGlass(g);
			break;
		case 18:
			drawWool(g, rng);
			break;
		case 19:
			drawBedrock(g, rng);
			break;
		case 20:
			drawWater(g);
			break;
		case 21:
			drawSnow(g, rng);
			break;
		case 22:
			drawChest(g);
			break;
		case 23:
			drawTorch(g);
			break;
		case 24:
			drawBed(g);
			break;
		case 25:
			drawLava(g, rng);
			break;
		default:
			if (id >= 9 && id <= 14) drawOre(g, rng, ORE_COLORS[id]);
			else drawBlock(g, rng, blockHex(id));
	}
}

// ============================================================
// ÍTEMS (comida, minerales, materiales)
// ============================================================
function drawStick(g) {
	line(g, 2, 14, 14, 2, "#6b4226"); // sombra
	line(g, 1, 14, 13, 2, "#8a5a2b"); // cuerpo
	line(g, 1, 13, 13, 1, "#b07a40"); // brillo
	set(g, 12, 2, "#6b4226");
	set(g, 2, 14, "#6b4226");
}
function drawCoal(g) {
	const base = "#2a2a2a",
		dark = "#141414",
		shine = "#555555";
	for (let y = 4; y <= 11; y++) {
		for (let x = 3; x <= 12; x++) {
			const dx = x - 7.5,
				dy = y - 7.5;
			if ((dx * dx) / 26 + (dy * dy) / 30 <= 1) set(g, x, y, base);
		}
	}
	set(g, 5, 5, shine);
	set(g, 6, 5, shine);
	set(g, 5, 6, shine);
	set(g, 10, 9, dark);
	set(g, 11, 10, dark);
}
function drawIngot(g, base, light, dark) {
	rect(g, 3, 3, 10, 10, base);
	rect(g, 3, 3, 1, 10, light);
	rect(g, 12, 3, 1, 10, dark);
	rect(g, 3, 3, 10, 1, light);
	rect(g, 3, 12, 10, 1, dark);
	// pestañas superiores del lingote
	rect(g, 5, 1, 6, 2, base);
	rect(g, 5, 1, 1, 2, light);
	rect(g, 10, 1, 1, 2, dark);
}
function drawGem(g, base, light, dark) {
	for (let y = 1; y <= 14; y++) {
		const t = Math.abs(y - 7.5) / 6.5;
		const halfW = Math.max(0, Math.round(6 * (1 - t)));
		for (let x = 8 - halfW; x <= 8 + halfW; x++) set(g, x, y, base);
	}
	line(g, 8, 1, 8, 14, dark);
	line(g, 2, 7, 8, 14, dark);
	line(g, 14, 7, 8, 14, dark);
	line(g, 8, 1, 2, 7, light);
	line(g, 8, 1, 14, 7, light);
	set(g, 8, 2, light);
	set(g, 9, 3, light);
}
function drawRedstone(g, rng) {
	const base = "#e03030",
		dark = "#a02020",
		light = "#ff8080";
	for (let y = 8; y <= 12; y++) {
		for (let x = 4; x <= 11; x++) {
			if (Math.abs(x - 7.5) / 4 + Math.abs(y - 10.5) / 3 <= 1)
				set(g, x, y, base);
		}
	}
	for (let i = 0; i < 8; i++)
		set(
			g,
			4 + Math.floor(rng() * 8),
			8 + Math.floor(rng() * 5),
			rng() < 0.5 ? dark : light
		);
	set(g, 5, 9, light);
	set(g, 6, 8, light);
}
function drawWheat(g) {
	const stem = "#8f8f2a",
		grain = "#e8c56a",
		grainDark = "#b89a2e";
	vline(g, 8, 8, 13, stem);
	rect(g, 5, 2, 7, 7, grain);
	rect(g, 5, 2, 7, 1, "#f0d88a");
	set(g, 6, 4, grainDark);
	set(g, 9, 5, grainDark);
	set(g, 7, 6, grainDark);
	line(g, 8, 9, 5, 12, stem);
	line(g, 8, 10, 11, 13, stem);
}
function drawCarrot(g) {
	const body = "#e67e22",
		dark = "#b05e14",
		top = "#3a8f2a";
	for (let y = 6; y <= 13; y++) {
		const t = (y - 6) / 7;
		const w = Math.max(1, Math.round(3 * (1 - t)));
		for (let x = 8 - w; x <= 8 + w; x++) set(g, x, y, body);
	}
	set(g, 7, 6, dark);
	set(g, 9, 7, dark);
	vline(g, 7, 3, 6, top);
	vline(g, 8, 2, 6, top);
	vline(g, 9, 3, 6, top);
	set(g, 7, 2, top);
	set(g, 9, 2, top);
}
function drawSeeds(g, rng) {
	const seed = "#c9a45b",
		dark = "#8f7a3e";
	for (let i = 0; i < 10; i++)
		set(
			g,
			3 + Math.floor(rng() * 10),
			6 + Math.floor(rng() * 7),
			rng() < 0.5 ? seed : dark
		);
	set(g, 7, 7, seed);
	set(g, 8, 8, seed);
}
function drawString(g) {
	const white = "#f5f5f0",
		dark = "#c8c8c0";
	line(g, 2, 13, 12, 3, dark); // sombra
	line(g, 2, 12, 6, 8, white);
	line(g, 5, 9, 9, 5, white);
	line(g, 8, 6, 13, 3, white);
	line(g, 3, 11, 7, 7, dark);
	line(g, 6, 10, 10, 4, dark);
	set(g, 8, 8, white);
	set(g, 7, 7, white);
}
function drawLeather(g, rng) {
	const base = "#b8860b",
		dark = "#8f6b00",
		light = "#d8b04a";
	rect(g, 3, 4, 10, 9, base);
	rect(g, 3, 4, 1, 9, dark);
	rect(g, 12, 4, 1, 9, dark);
	hline(g, 4, 11, 4, light);
	hline(g, 4, 11, 12, dark);
	for (let i = 0; i < 5; i++)
		set(g, 4 + Math.floor(rng() * 7), 5 + Math.floor(rng() * 6), dark);
}
// Carne: cruda (rojo/rosa) vs cocinada (marrón). Cada una con su silueta.
function drawBeef(g, rng, cooked) {
	const base = cooked ? "#8b5a2b" : "#c0392b";
	const dark = cooked ? "#6b4226" : "#8f2a1e";
	const light = cooked ? "#a87a44" : "#e07060";
	rect(g, 3, 4, 10, 8, base);
	rect(g, 3, 4, 10, 1, light);
	rect(g, 3, 11, 10, 1, dark);
	rect(g, 3, 4, 1, 8, light);
	rect(g, 12, 4, 1, 8, dark);
	for (let i = 0; i < 4; i++)
		set(
			g,
			4 + Math.floor(rng() * 8),
			5 + Math.floor(rng() * 5),
			rng() < 0.5 ? dark : light
		);
	rect(g, 5, 12, 2, 2, "#f0ebe0");
	rect(g, 9, 12, 2, 2, "#f0ebe0");
}
function drawPorkchop(g, rng, cooked) {
	const base = cooked ? "#8f5a2b" : "#e67e80";
	const dark = cooked ? "#6b4226" : "#b85a60";
	const light = cooked ? "#b07a44" : "#f0a0a4";
	rect(g, 4, 5, 8, 7, base);
	rect(g, 4, 5, 8, 1, light);
	rect(g, 4, 11, 8, 1, dark);
	rect(g, 3, 6, 2, 5, "#f0ebe0");
	rect(g, 3, 6, 2, 1, "#ffffff");
	set(g, 3, 10, "#d8cfae");
	for (let i = 0; i < 3; i++)
		set(g, 5 + Math.floor(rng() * 6), 6 + Math.floor(rng() * 4), dark);
}
function drawChicken(g, cooked) {
	const base = cooked ? "#a0703a" : "#f2cfa8";
	const dark = cooked ? "#7a5228" : "#c9a06b";
	const light = cooked ? "#c09050" : "#f8e0c0";
	for (let y = 6; y <= 11; y++) {
		const w = y <= 9 ? 3 : 4;
		for (let x = 6 - w; x <= 6 + w; x++) set(g, x, y, base);
	}
	rect(g, 9, 9, 5, 2, "#f0ebe0");
	set(g, 10, 8, "#ffffff");
	set(g, 12, 9, "#ffffff");
	set(g, 4, 6, light);
	set(g, 5, 6, light);
	set(g, 4, 7, light);
	set(g, 7, 7, dark);
}
function drawMutton(g, rng, cooked) {
	const base = cooked ? "#9c5b33" : "#d98a7a";
	const dark = cooked ? "#7a4226" : "#b06a5a";
	rect(g, 4, 5, 8, 7, base);
	rect(g, 4, 5, 8, 1, shade(base, 0.25));
	rect(g, 4, 11, 8, 1, dark);
	rect(g, 3, 8, 2, 2, "#f0ebe0");
	for (let i = 0; i < 3; i++)
		set(g, 5 + Math.floor(rng() * 6), 6 + Math.floor(rng() * 4), dark);
}
function drawRabbit(g, cooked) {
	const base = cooked ? "#8f5a2b" : "#e8b8a0";
	const dark = cooked ? "#6b4226" : "#c08a70";
	rect(g, 5, 7, 6, 6, base);
	rect(g, 5, 7, 6, 1, shade(base, 0.25));
	rect(g, 5, 12, 6, 1, dark);
	rect(g, 3, 3, 2, 5, base);
	rect(g, 11, 3, 2, 5, base);
	rect(g, 3, 3, 2, 1, dark);
	rect(g, 11, 3, 2, 1, dark);
}

// ============================================================
// HERRAMIENTAS Y ARMADURA (plantillas por forma + color por material)
// Cada forma es un mapa 16x16: 'm' material, 'h' mango, 'd' sombra.
// ============================================================
const PICKAXE = [
	".......mmm.......",
	"......mmmm.......",
	".....mmm.........",
	"h...mmmm.........",
	"hh..mmm..........",
	"hhh.mm...........",
	"hhhh.m...........",
	".hhhh............",
	"..hhh............",
	"...hh............",
	"....hh...........",
	"....hh...........",
	".....h...........",
	".....h...........",
	"......h..........",
	"......h.........."
];
const AXE = [
	".......mmm.......",
	"......mmmmm......",
	"......mmmmm......",
	"h...mmmm.........",
	"hh..mmm..........",
	"hhh.mm...........",
	"hhhh.m...........",
	".hhhh............",
	"..hhh............",
	"...hh............",
	"....hh...........",
	"....hh...........",
	".....h...........",
	".....h...........",
	"......h..........",
	"......h.........."
];
const SHOVEL = [
	"......mmm........",
	".....mmmmm.......",
	"....mmmmm........",
	"h...mmm..........",
	"hh..mmm..........",
	"hhh.m............",
	"hhhh.............",
	".hhh.............",
	"..hh.............",
	"...hh............",
	"....h............",
	"....hh...........",
	".....h...........",
	".....h...........",
	"......h..........",
	"......h.........."
];
const SWORD = [
	"mm...............",
	".mm..............",
	"..mm.............",
	"...mm............",
	"....mm...........",
	"....dhh..........",
	"....ddhh.........",
	".....dhh.........",
	"......dh.........",
	"......hh.........",
	"......hh.........",
	"......hh.........",
	".......h.........",
	".......h.........",
	".......h.........",
	"........h........"
];
const HELMET = [
	"....mmmmmm......",
	"...mmmmmmmm.....",
	"..mmmmmmmmmm....",
	"..mmdmmmmdmm....",
	"..mmddddddmm....",
	"...mdmmmmdm.....",
	"....mmmmmm......",
	".....mmmm.......",
	".....mmmm......."
];
const CHESTPLATE = [
	"...mmm..mmm.....",
	"..mmmmmmmmmm....",
	"..mmmmmmmmmm....",
	"..mmmmmmmmmm....",
	"..mmmdmmdmmm....",
	"...mddddddm.....",
	"...mmmmmmmm.....",
	"...mmmmmmmm.....",
	"....mmmmmm......",
	"....mm..mm......",
	"....mm..mm......"
];
const LEGGINGS = [
	"....mmmmmm......",
	"...mmmmmmmm.....",
	"...mmmmmmmm.....",
	"...mmmmmmmm.....",
	"...mm....mm.....",
	"...mm....mm.....",
	"...mm....mm.....",
	"...mm....mm.....",
	"....m....m......"
];
const BOOTS = [
	"....mm..mm......",
	"....mm..mm......",
	"....mm..mm......",
	"...mmmmmmmm.....",
	"...mdmmmmdm.....",
	"...mmmmmmmm....."
];

function drawToolFromMap(g, shape, pal) {
	for (let y = 0; y < shape.length && y < TILE; y++) {
		const row = shape[y];
		for (let x = 0; x < row.length && x < TILE; x++) {
			const ch = row[x];
			if (ch === "m") set(g, x, y, pal.m);
			else if (ch === "h") set(g, x, y, C.handle);
			else if (ch === "d") set(g, x, y, pal.dark);
		}
	}
	// brillo en el borde superior del material (profundidad)
	for (let y = 0; y < shape.length && y < TILE; y++) {
		const row = shape[y];
		for (let x = 0; x < row.length && x < TILE; x++) {
			if (row[x] === "m" && !(y > 0 && shape[y - 1][x] === "m"))
				set(g, x, y, pal.light);
		}
	}
}
function makeToolIcon(kind, mat) {
	return (g) => drawToolFromMap(g, TOOL_SHAPES[kind], TOOL_PALS[mat]);
}
const TOOL_SHAPES = [PICKAXE, AXE, SHOVEL, SWORD];
const TOOL_PALS = [C.wood, C.stone, C.iron, C.gold, C.diamond];

function makeArmorIcon(slot, mat) {
	return (g) => drawToolFromMap(g, ARMOR_SHAPES[slot], ARMOR_PALS[mat]);
}
const ARMOR_SHAPES = [HELMET, CHESTPLATE, LEGGINGS, BOOTS];
const ARMOR_PALS = [C.leather, C.iron, C.diamond];

// ============================================================
// REGISTRO: id → función de dibujo (g, rng)
// ============================================================
const ICONS = {};
// Bloques 1..25
for (let id = 1; id <= 25; id++)
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Ítems
ICONS[100] = drawStick;
ICONS[101] = drawCoal;
ICONS[102] = (g) => drawIngot(g, C.iron.m, C.iron.light, C.iron.dark);
ICONS[103] = (g) => drawIngot(g, C.gold.m, C.gold.light, C.gold.dark);
ICONS[104] = (g) => drawGem(g, C.diamond.m, C.diamond.light, C.diamond.dark);
ICONS[105] = drawRedstone;
ICONS[106] = (g) => drawGem(g, "#2ed06a", "#8ff0b0", "#1a9a4a");
ICONS[107] = (g, rng) => drawBeef(g, rng, false);
ICONS[108] = (g, rng) => drawPorkchop(g, rng, false);
ICONS[109] = (g) => drawChicken(g, false);
ICONS[110] = (g, rng) => drawMutton(g, rng, false);
ICONS[111] = (g, rng) => drawBeef(g, rng, true);
ICONS[112] = (g, rng) => drawPorkchop(g, rng, true);
ICONS[113] = (g) => drawChicken(g, true);
ICONS[114] = (g, rng) => drawMutton(g, rng, true);
ICONS[115] = drawWheat;
ICONS[116] = drawCarrot;
ICONS[117] = drawSeeds;
ICONS[118] = (g) => drawRabbit(g, false);
ICONS[119] = (g) => drawRabbit(g, true);
ICONS[120] = drawString;
ICONS[132] = drawLeather;
// Herramientas 200..219: (id-200)/5 = tipo, (id-200)%5 = material
for (let id = 200; id <= 219; id++) {
	ICONS[id] = makeToolIcon(Math.floor((id - 200) / 5), (id - 200) % 5);
}
// Armadura 220..231: (id-220)%4 = slot, (id-220)/4 = material
for (let id = 220; id <= 231; id++) {
	ICONS[id] = makeArmorIcon((id - 220) % 4, Math.floor((id - 220) / 4));
}

// ============================================================
// API
// ============================================================
// Grid 16x16 del icono de un ítem (pura, testeable en Node). null si el ítem
// no tiene icono (la UI cae a su color/texto actual).
export function itemIconGrid(id) {
	const draw = ICONS[id];
	if (!draw) return null;
	const g = emptyGrid();
	draw(g, rngFor(id));
	softShadow(g);
	return g;
}

// Ids cubiertos por el atlas (en orden de tesela).
export function itemIconIds() {
	return Object.keys(ICONS).map(Number);
}

// CSS `background` del icono recortado del atlas. `scale` agranda la tesela
// (hotbar 1.5x, paneles 1x). null si el ítem no tiene icono.
let atlasUrl = null;
const tileIndex = new Map();
export function itemIconCss(id, scale = 1) {
	if (!ICONS[id]) return null;
	if (!tileIndex.size) {
		itemIconIds().forEach((x, i) => {
			tileIndex.set(x, i);
		});
	}
	const col = tileIndex.get(id);
	const url = getAtlasUrl();
	const w = itemIconIds().length * TILE * scale;
	const s = TILE * scale;
	return `url("${url}") -${col * s}px 0 / ${w}px ${s}px no-repeat`;
}
function getAtlasUrl() {
	if (atlasUrl) return atlasUrl;
	const ids = itemIconIds();
	const canvas = document.createElement("canvas");
	canvas.width = ids.length * TILE;
	canvas.height = TILE;
	const ctx = canvas.getContext("2d");
	ids.forEach((id, i) => {
		const g = itemIconGrid(id);
		for (let y = 0; y < TILE; y++) {
			for (let x = 0; x < TILE; x++) {
				const c = g[y * TILE + x];
				if (c) {
					ctx.fillStyle = c;
					ctx.fillRect(i * TILE + x, y, 1, 1);
				}
			}
		}
	});
	atlasUrl = canvas.toDataURL();
	return atlasUrl;
}
