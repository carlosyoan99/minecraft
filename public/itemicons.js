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
	leather: { m: "#c9a06b", dark: "#8f6b3e", light: "#e0c090" },
	chain: { m: "#a7a7ad", dark: "#6b6b71", light: "#d5d5db" } // malla (Fase 13, L5)
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

// Lana tintada: base del color con vellón (como drawWool, parametrizada).
function drawWoolColor(g, rng, base, dark) {
	rect(g, 2, 2, 12, 12, base);
	for (let i = 0; i < 10; i++)
		set(g, 3 + Math.floor(rng() * 10), 3 + Math.floor(rng() * 10), dark);
	rect(g, 2, 2, 12, 1, shade(base, 0.25));
	rect(g, 2, 13, 12, 1, dark);
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
		// Fase 9 (C/F): tierra arada (surcos), plantas (cross) y lanas tintadas
		case 26: {
			const hex = "#6f4a22";
			rect(g, 2, 2, 12, 12, hex);
			hline(g, 2, 13, 5, "#5a3a18");
			hline(g, 2, 13, 9, "#5a3a18");
			hline(g, 2, 13, 13, "#5a3a18");
			rect(g, 2, 2, 12, 1, shade(hex, 0.2));
			rect(g, 2, 13, 12, 1, "#4a3014");
			break;
		}
		case 27:
			// trigo en crecimiento (tallos verdes)
			vline(g, 6, 6, 13, "#5aa32e");
			vline(g, 9, 6, 13, "#6fbf3a");
			vline(g, 8, 3, 13, "#5aa32e");
			hline(g, 5, 7, 9, "#7fd04f");
			hline(g, 8, 10, 7, "#7fd04f");
			break;
		case 33:
			vline(g, 8, 5, 13, "#4a9e2f");
			hline(g, 5, 7, 8, "#5aae3f");
			hline(g, 9, 12, 10, "#5aae3f");
			hline(g, 6, 10, 6, "#6fbf4f");
			break;
		case 34:
			vline(g, 8, 8, 13, "#3a8a2a");
			rect(g, 6, 3, 5, 4, "#d92626");
			set(g, 7, 4, "#8f1010");
			set(g, 10, 4, "#8f1010");
			set(g, 8, 5, "#f5f5f0");
			break;
		case 35:
			vline(g, 8, 8, 13, "#3a8a2a");
			rect(g, 6, 3, 5, 4, "#e8d21a");
			set(g, 7, 4, "#f5e84a");
			break;
		case 36:
			drawWoolColor(g, rng, "#c0392b", "#8f2a1e");
			break;
		case 37:
			drawWoolColor(g, rng, "#e8c547", "#b8860b");
			break;
		case 38:
			drawWoolColor(g, rng, "#f5f5f0", "#d9d9d2");
			break;
		// Fase 10 (D1): grava — piedrecitas grises moteadas (como adoquín pero
		// sin las líneas de junta: bloques sueltos).
		case 39: {
			const base = "#9a9490",
				dark = "#7d7671",
				light = "#b5afab";
			rect(g, 2, 2, 12, 12, base);
			for (let i = 0; i < 12; i++)
				set(
					g,
					2 + Math.floor(rng() * 12),
					2 + Math.floor(rng() * 12),
					rng() < 0.5 ? dark : light
				);
			rect(g, 2, 2, 12, 1, light);
			rect(g, 2, 13, 12, 1, dark);
			break;
		}
		// Fase 10 (D2): TNT — caja roja con banda blanca "TNT" y pólvora abajo.
		case 40: {
			const red = "#c0392b",
				redDark = "#8f2a1e",
				band = "#f5f5f0";
			rect(g, 2, 2, 12, 12, red);
			rect(g, 2, 2, 12, 3, band); // banda blanca superior
			rect(g, 2, 11, 12, 3, "#7d5a3a"); // pólvora (madera oscura)
			// Letras "TNT" en la banda
			set(g, 3, 3, redDark);
			set(g, 4, 3, redDark);
			set(g, 4, 4, redDark);
			set(g, 7, 3, redDark);
			set(g, 7, 4, redDark);
			set(g, 8, 3, redDark);
			set(g, 11, 3, redDark);
			set(g, 11, 4, redDark);
			set(g, 12, 3, redDark);
			set(g, 12, 4, redDark);
			set(g, 5, 2, redDark);
			set(g, 6, 2, redDark);
			set(g, 9, 2, redDark);
			set(g, 10, 2, redDark);
			// motas de pólvora
			for (let i = 0; i < 5; i++)
				set(
					g,
					3 + Math.floor(rng() * 10),
					11 + Math.floor(rng() * 3),
					"#5a4026"
				);
			rect(g, 2, 2, 12, 1, "#e06050"); // brillo superior
			rect(g, 2, 13, 12, 1, redDark);
			break;
		}
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
// Fase 20 B3: mena cruda (raw iron/gold) — trozo irregular con brillo y
// sombra, como el icono de MC (nuggets apelmazados), distinto del lingote.
function drawRaw(g, base, dark, light) {
	for (let y = 3; y <= 12; y++) {
		for (let x = 3; x <= 12; x++) {
			const dx = x - 7.5,
				dy = y - 7.5;
			// masa irregular: dos lóbulos con huecos (no un rectángulo)
			const inBlob =
				(dx * dx) / 22 + (dy * dy) / 26 <= 1 &&
				!(x === 6 && y === 4) &&
				!(x === 10 && y === 11) &&
				!(x === 5 && y === 10) &&
				!(x === 11 && y === 5);
			if (inBlob) set(g, x, y, base);
		}
	}
	set(g, 4, 5, light);
	set(g, 5, 4, light);
	set(g, 8, 3, light);
	set(g, 4, 9, dark);
	set(g, 10, 10, dark);
	set(g, 11, 9, dark);
	line(g, 7, 4, 7, 12, dark); // veta central (textura de mineral)
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

// Fase 18 (C-4): carbón vegetal — misma forma que el carbón (drawCoal) pero
// con tono azulado y brillo distinto, como el ítem de MC (el carbón es
// negro puro; el vegetal conserva un matiz azul-grisáceo de la madera).
function drawCharcoal(g) {
	const base = "#2f3640",
		dark = "#1a1e24",
		shine = "#5a6b7a";
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
	set(g, 8, 7, "#7a8a9a"); // veta de madera carbonizada
}

// Fase 18 (C-3): patata (cruda: óvalo marrón con motas y yemas) y patata al
// horno (más oscura, con corte dorado y brillo de asado).
function drawPotato(g, rng, baked) {
	const base = baked ? "#a07830" : "#c9a45b";
	const dark = baked ? "#7a5820" : "#a08040";
	const light = baked ? "#d4b060" : "#e0c080";
	// Cuerpo: óvalo vertical irregular (patata)
	for (let y = 4; y <= 13; y++) {
		const t = Math.abs(y - 8.5) / 4.5;
		const w = Math.max(2, Math.round(5.5 * (1 - t)));
		for (let x = 8 - w; x <= 8 + w; x++) set(g, x, y, base);
	}
	// Yemas y motas (2-3 huequitos como los ojos de la patata)
	set(g, 6, 7, dark);
	set(g, 10, 10, dark);
	set(g, 7, 12, dark);
	for (let i = 0; i < 4; i++)
		set(g, 5 + Math.floor(rng() * 6), 6 + Math.floor(rng() * 6), dark);
	// Al horno: corte en cruz con relleno dorado claro + brillo de asado
	if (baked) {
		set(g, 8, 5, "#f0d080");
		set(g, 8, 6, "#f0d080");
		set(g, 8, 11, "#f0d080");
		set(g, 8, 12, "#f0d080");
		set(g, 6, 8, "#f0d080");
		set(g, 7, 8, "#f0d080");
		set(g, 10, 8, "#f0d080");
		set(g, 11, 8, "#f0d080");
		set(g, 6, 5, light);
		set(g, 7, 5, light);
	} else {
		set(g, 5, 5, light);
		set(g, 6, 5, light);
	}
}

// ============================================================
// ÍTEMS DE LA FASE 9 (Bloque F): pan, pescado, hueso, tintes, miel
// ============================================================
function drawBread(g) {
	const crust = "#b07a3e",
		crumb = "#e8c98a",
		crumbDark = "#d4b06a";
	for (let y = 3; y <= 12; y++) {
		const w = y <= 7 ? 5 : y <= 11 ? 4 : 3;
		for (let x = 8 - w; x <= 8 + w; x++) {
			set(g, x, y, y === 3 || y === 12 ? crust : crumb);
		}
	}
	rect(g, 3, 4, 2, 1, crust);
	rect(g, 11, 4, 2, 1, crust);
	rect(g, 4, 8, 3, 1, crumbDark);
	set(g, 8, 9, crumbDark);
	set(g, 10, 11, crumbDark);
}
function drawFish(g, cooked) {
	const base = cooked ? "#b08a4a" : "#7a9ab0";
	const dark = cooked ? "#8a6a34" : "#5a7a90";
	const light = cooked ? "#d4b070" : "#a8c8d8";
	// cuerpo elíptico horizontal
	for (let y = 4; y <= 11; y++) {
		const t = Math.abs(y - 7.5) / 3.5;
		const w = Math.max(1, Math.round(5 * (1 - t)));
		for (let x = 8 - w; x <= 8 + w; x++) set(g, x, y, base);
	}
	// cola
	rect(g, 1, 6, 4, 2, base);
	rect(g, 1, 8, 3, 1, dark);
	rect(g, 1, 5, 2, 1, dark);
	// ojo
	set(g, 12, 6, "#1a1a1a");
	set(g, 13, 6, "#ffffff");
	// línea de la espina
	line(g, 4, 8, 13, 7, light);
}
function drawBone(g) {
	const bone = "#f0ebe0",
		dark = "#d8cfae";
	line(g, 3, 13, 13, 3, dark); // sombra
	line(g, 2, 13, 12, 3, bone); // cuerpo
	// nudos (bolas en los extremos)
	rect(g, 1, 11, 3, 3, bone);
	rect(g, 12, 2, 3, 3, bone);
	rect(g, 2, 11, 1, 1, dark);
	rect(g, 13, 2, 1, 1, dark);
}
// Tinte: bolsa/cubo de pigmento (rojo amapola, amarillo diente de león,
// blanco harina de hueso).
function drawDye(g, base, dark, light) {
	rect(g, 4, 3, 8, 10, base);
	rect(g, 4, 3, 8, 1, light);
	rect(g, 4, 12, 8, 1, dark);
	rect(g, 4, 3, 1, 10, light);
	rect(g, 11, 3, 1, 10, dark);
	rect(g, 5, 1, 6, 2, base);
	rect(g, 5, 1, 1, 2, light);
	set(g, 7, 5, dark);
	set(g, 8, 8, dark);
	set(g, 6, 10, light);
}
function drawHoney(g) {
	const jar = "#e8d9a8",
		honey = "#e8a520",
		dark = "#b87a10";
	rect(g, 5, 3, 6, 8, jar); // bote
	rect(g, 5, 3, 6, 1, "#ffffff");
	rect(g, 4, 3, 1, 8, dark);
	rect(g, 11, 3, 1, 8, dark);
	rect(g, 4, 11, 8, 2, honey); // miel en el fondo
	rect(g, 6, 1, 4, 2, "#b87a10"); // tapa
	set(g, 8, 8, honey);
	set(g, 7, 9, honey);
}
// Botella de vidrio (Fase 21.5, B4): recipiente transparente con corcho.
function drawGlassBottle(g) {
	const gl = "rgba(200,235,242,0.8)",
		glDark = "rgba(140,175,185,0.8)",
		cork = "#b8925a";
	rect(g, 6, 3, 4, 6, gl); // cuerpo
	rect(g, 7, 1, 2, 3, gl); // cuello
	rect(g, 7, 0, 2, 1, cork); // corcho
	rect(g, 6, 3, 4, 1, "rgba(255,255,255,0.85)");
	hline(g, 6, 4, 3, "rgba(255,255,255,0.85)");
	rect(g, 9, 3, 1, 6, glDark);
	rect(g, 6, 8, 4, 1, glDark);
}
// Botella de miel (Fase 21.5, B4): botella llena de miel ámbar.
function drawHoneyBottle(g) {
	const honey = "#e8a520",
		honeyLight = "#f0c060",
		dark = "#b87a10";
	rect(g, 6, 3, 4, 6, honey); // cuerpo
	rect(g, 7, 1, 2, 3, honey); // cuello
	rect(g, 7, 0, 2, 1, "#8a5a2a"); // corcho oscuro
	rect(g, 6, 3, 4, 1, honeyLight);
	rect(g, 6, 3, 1, 6, honeyLight);
	rect(g, 9, 3, 1, 6, dark);
	rect(g, 6, 8, 4, 1, dark);
	set(g, 8, 5, honeyLight);
	set(g, 8, 8, honeyLight);
}

// ============================================================
// ÍTEMS DE LA FASE 12 (Bloque A): tridente y bola de slime
// ============================================================
// Tridente: lanza vertical con astil de madera, punta de 3 púas y guarda
// metálica — el sello del ahogado (drop ~15% y arma arrojadiza del jugador).
function drawTrident(g) {
	const steel = "#6fa8dc",
		steelDark = "#4a7ab0",
		steelLight = "#a8d0f0",
		wood = "#8a5a2b",
		woodDark = "#6b4226";
	// Astil diagonal (como las flechas del icono del palo)
	line(g, 8, 2, 8, 13, woodDark);
	line(g, 7, 2, 7, 13, wood);
	// Puntas (3 púas)
	line(g, 7, 2, 6, 0, steel);
	line(g, 8, 2, 8, 0, steelLight);
	line(g, 9, 2, 10, 0, steel);
	// Guarda (barra transversal)
	hline(g, 4, 11, 4, steel);
	hline(g, 4, 11, 3, steelLight);
	set(g, 4, 3, steelDark);
	set(g, 11, 3, steelDark);
	// Contrapeso
	vline(g, 8, 14, 15, steel);
	set(g, 7, 14, steelLight);
}
// Bola de slime: gel verde translúcido con brillo y burbuja interior.
function drawSlimeBall(g, rng) {
	const gel = "#7ac74f",
		gelDark = "#5aa23c",
		gelLight = "#b0f080";
	for (let y = 5; y <= 11; y++) {
		const t = Math.abs(y - 8) / 3.5;
		const w = Math.max(1, Math.round(5 * (1 - t)));
		for (let x = 8 - w; x <= 8 + w; x++) set(g, x, y, gel);
	}
	for (let i = 0; i < 5; i++)
		set(g, 4 + Math.floor(rng() * 8), 6 + Math.floor(rng() * 5), gelDark);
	set(g, 6, 6, gelLight);
	set(g, 5, 6, gelLight);
	set(g, 6, 7, gelLight);
	set(g, 9, 10, gelDark);
}

// Fase 13 (L1): iconos del arco, la flecha, el pedernal y la pluma.
// Arco: curva de madera con cuerda tensada y flecha nockeada (pixel-art 16x16).
function drawBow(g) {
	const wood = "#8a5a2b",
		woodDark = "#6b4226",
		string = "#e8e0d0";
	// Madera curva (arco en C): trazos diagonales que dibujan el perfil.
	line(g, 2, 2, 5, 4, woodDark);
	line(g, 5, 4, 9, 7, woodDark);
	line(g, 9, 7, 12, 10, woodDark);
	line(g, 12, 10, 14, 14, woodDark);
	line(g, 2, 2, 4, 5, wood);
	line(g, 4, 5, 8, 8, wood);
	line(g, 8, 8, 11, 11, wood);
	line(g, 11, 11, 13, 14, wood);
	// Cuerda (vertical a la derecha de la madera)
	vline(g, 13, 2, 14, string);
	// Flecha nockeada sobre la cuerda
	line(g, 11, 7, 6, 5, "#cfcfcf");
	set(g, 5, 4, "#e8e8e8"); // punta
}

// Cubo (Fase 13, L4): cuerpo metálico con asa; `liquid` (hex o null) pinta
// el líquido asomando por la boca (agua azul, lava naranja, vacío = aire).
function drawBucket(g, liquid) {
	const steel = "#c9c9cf",
		steelDark = "#8a8a90";
	// Asa
	set(g, 4, 3, steelDark);
	set(g, 5, 2, steel);
	set(g, 6, 2, steel);
	set(g, 7, 2, steel);
	set(g, 8, 2, steel);
	set(g, 9, 2, steel);
	set(g, 10, 2, steel);
	set(g, 11, 2, steel);
	set(g, 12, 3, steelDark);
	// Boca del cubo
	for (let x = 4; x <= 12; x++) set(g, x, 4, steelDark);
	// Cuerpo (trapecio invertido)
	for (let y = 5; y <= 12; y++) {
		const inset = Math.floor((y - 5) / 2);
		for (let x = 4 + inset; x <= 12 - inset; x++) set(g, x, y, steel);
	}
	// Fondo
	for (let x = 6; x <= 10; x++) set(g, x, 13, steelDark);
	// Líquido asomando por la boca
	if (liquid) {
		set(g, 5, 4, liquid);
		set(g, 6, 4, liquid);
		set(g, 7, 4, liquid);
		set(g, 8, 4, liquid);
		set(g, 9, 4, liquid);
		set(g, 10, 4, liquid);
		set(g, 11, 4, liquid);
	}
}

// Caña de pescar (Fase 21.5, A1): astil diagonal de madera con bobinado, el
// hilo que cae y el anzuelo en la punta.
function drawFishingRod(g) {
	const wood = "#8a5a2b",
		woodDark = "#6b4226",
		string = "#e8e0d0",
		hook = "#9aa0aa";
	// Astil: trazos diagonales que suben de la esquina baja izquierda.
	line(g, 3, 13, 7, 11, woodDark);
	line(g, 7, 11, 11, 8, woodDark);
	line(g, 11, 8, 14, 4, wood);
	line(g, 4, 13, 8, 11, wood);
	line(g, 8, 11, 12, 8, wood);
	line(g, 12, 8, 14, 5, wood);
	// Carrete (anillo sobre el astil)
	set(g, 6, 11, woodDark);
	// Hilo: de la punta del astil baja hasta el anzuelo.
	line(g, 13, 4, 10, 10, string);
	line(g, 10, 10, 10, 14, string);
	// Anzuelo en la punta del hilo
	set(g, 9, 13, hook);
	set(g, 10, 14, hook);
	set(g, 11, 13, hook);
}

// Escudo (Fase 21.5, C2): cuerpo romo de madera con borde de hierro y
// remaches. Icono 16x16 del inventario/hotbar.
function drawShield(g) {
	const wood = "#c8a04f",
		woodDark = "#a67c33",
		iron = "#cfcfd6",
		ironDark = "#8f8f99";
	// Cuerpo principal (hexágono achatado)
	rect(g, 4, 3, 9, 11, wood);
	rect(g, 4, 3, 9, 3, woodDark);
	set(g, 3, 4, iron);
	set(g, 12, 4, iron);
	set(g, 3, 12, iron);
	set(g, 12, 12, iron);
	rect(g, 5, 2, 6, 2, woodDark);
	rect(g, 6, 1, 4, 1, woodDark);
	// Borde de hierro y remaches centrales
	set(g, 3, 5, ironDark);
	set(g, 12, 5, ironDark);
	set(g, 3, 11, ironDark);
	set(g, 12, 11, ironDark);
	set(g, 7, 6, iron);
	set(g, 8, 6, iron);
	set(g, 7, 9, iron);
	set(g, 8, 9, iron);
	set(g, 7, 8, ironDark);
	set(g, 8, 8, ironDark);
}

// Tótem de la inmortalidad (Fase 21.5, C3): estatuilla dorada con rostro,
// brazos abiertos y un anillo en la cabeza (como el ítem de Minecraft).
function drawTotem(g) {
	const gold = "#efc93d",
		goldDark = "#c49a2c",
		goldLight = "#f8e08a",
		eyeblue = "#3b7fbf";
	// Cabeza con anillo
	rect(g, 7, 1, 3, 3, gold);
	rect(g, 7, 1, 3, 1, goldLight);
	set(g, 6, 2, goldDark);
	// Ojos azules
	set(g, 7, 3, eyeblue);
	set(g, 9, 3, eyeblue);
	// Cuerpo
	rect(g, 6, 4, 5, 6, gold);
	rect(g, 6, 4, 5, 1, goldLight);
	set(g, 6, 4, goldDark);
	set(g, 10, 4, goldDark);
	set(g, 6, 9, goldDark);
	set(g, 10, 9, goldDark);
	// Brazos extendidos
	rect(g, 3, 5, 2, 2, gold);
	rect(g, 11, 5, 2, 2, gold);
	set(g, 3, 5, goldLight);
	set(g, 11, 5, goldLight);
	// Piernas
	rect(g, 6, 10, 2, 3, gold);
	rect(g, 9, 10, 2, 3, gold);
	set(g, 6, 12, goldDark);
	set(g, 9, 12, goldDark);
	// Boca
	set(g, 8, 7, goldDark);
}

// Flecha: astil diagonal con punta y plumas.
function drawArrow(g) {
	const shaft = "#cfc4a8",
		tip = "#d8d8d8",
		feather = "#f2e08a";
	line(g, 5, 14, 11, 4, shaft); // astil
	line(g, 4, 14, 10, 4, shaft); // grosor
	// Punta (triángulo en la parte superior)
	set(g, 10, 3, tip);
	set(g, 11, 2, tip);
	set(g, 12, 1, tip);
	// Plumas (cola, abajo)
	set(g, 4, 14, feather);
	set(g, 3, 14, feather);
	set(g, 5, 15, feather);
	set(g, 3, 15, feather);
}

// Pedernal: roca gris oscura con vetas y borde irregular.
function drawFlint(g) {
	const rock = "#5a5a5a",
		rockDark = "#3a3a3a",
		rockLight = "#8a8a8a";
	rect(g, 5, 5, 7, 8, rock);
	// Bordes irregulares
	set(g, 4, 6, rockDark);
	set(g, 4, 9, rockDark);
	set(g, 12, 5, rockDark);
	set(g, 12, 10, rockDark);
	set(g, 6, 4, rock);
	set(g, 9, 4, rock);
	set(g, 7, 13, rock);
	set(g, 10, 13, rock);
	// Vetas
	set(g, 6, 7, rockLight);
	set(g, 7, 8, rockLight);
	set(g, 10, 10, rockLight);
	set(g, 8, 12, rockDark);
}

// Pluma: quilla con barbas en diagonal.
function drawFeather(g) {
	const quill = "#f0e8d8",
		barb = "#e8dcc0";
	line(g, 4, 13, 12, 3, quill); // quilla
	line(g, 3, 13, 11, 3, quill);
	// Barbas (trazos diagonales desde la quilla)
	set(g, 5, 12, barb);
	set(g, 6, 11, barb);
	set(g, 7, 10, barb);
	set(g, 8, 9, barb);
	set(g, 9, 8, barb);
	set(g, 10, 7, barb);
	set(g, 6, 12, barb);
	set(g, 7, 11, barb);
	set(g, 8, 10, barb);
	set(g, 9, 9, barb);
	set(g, 10, 8, barb);
	set(g, 11, 7, barb);
	set(g, 5, 13, barb);
	set(g, 6, 13, barb);
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
const HOE = [
	".........mmm.....",
	"........mmmm.....",
	"........mmm......",
	".......mmm.......",
	".......mmm.......",
	"h.....mmm........",
	"hh...mmm.........",
	"hhh.mmm..........",
	"hhhh.m...........",
	"hhhhh............",
	".hhhh............",
	"..hhh............",
	"...hh............",
	"...hh............",
	"....h............",
	"....h............"
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
// Fase 9 (C): la azada es el 5º tipo de herramienta (ids 240-244).
const TOOL_SHAPES = [PICKAXE, AXE, SHOVEL, SWORD, HOE];
const TOOL_PALS = [C.wood, C.stone, C.iron, C.gold, C.diamond];

function makeArmorIcon(slot, mat) {
	return (g) => drawToolFromMap(g, ARMOR_SHAPES[slot], ARMOR_PALS[mat]);
}
const ARMOR_SHAPES = [HELMET, CHESTPLATE, LEGGINGS, BOOTS];
// Fase 13 (L5): oro y malla — índices 3 y 4 del array (ids 232-239).
const ARMOR_PALS = [C.leather, C.iron, C.diamond, C.gold, C.chain];

// Compás (Fase 13, L5): esfera dorada con aguja roja/blanca apuntando al
// noreste (la aguja siempre señala el punto de aparición).
function drawCompass(g) {
	const body = "#8a7a4a",
		face = "#e8d9a0",
		rim = "#b8860b",
		red = "#c0392b",
		white = "#f5f5f5";
	// cuerpo: círculo de radio 6 (borde) y 5 (carátula)
	for (let dy = -6; dy <= 6; dy++) {
		for (let dx = -6; dx <= 6; dx++) {
			const d = dx * dx + dy * dy;
			if (d > 36) continue;
			if (d > 25) set(g, 8 + dx, 8 + dy, body);
		}
	}
	for (let dy = -5; dy <= 5; dy++) {
		for (let dx = -5; dx <= 5; dx++) {
			const d = dx * dx + dy * dy;
			if (d > 25) continue;
			if (d > 9) set(g, 8 + dx, 8 + dy, face);
		}
	}
	// marcas cardinales
	set(g, 8, 2, rim);
	set(g, 8, 3, rim);
	set(g, 8, 13, rim);
	set(g, 8, 12, rim);
	set(g, 2, 8, rim);
	set(g, 3, 8, rim);
	set(g, 13, 8, rim);
	set(g, 12, 8, rim);
	// aguja apuntando al noreste (mitad roja, mitad blanca)
	line(g, 8, 8, 11, 5, red);
	line(g, 8, 8, 11, 5, red);
	line(g, 11, 5, 12, 4, red);
	line(g, 5, 11, 8, 8, white);
	set(g, 8, 8, rim);
	set(g, 7, 7, rim);
	set(g, 8, 7, rim);
	set(g, 7, 8, rim);
}

// Tijeras (Fase 11, C): dos hojas metálicas cruzadas con anillas de dedo
// (forma de tijeras abiertas, como el icono de Minecraft).
function drawShears(g) {
	const blade = "#c9c9cf",
		bladeDark = "#8a8a90",
		handle = "#6b4226";
	line(g, 2, 14, 10, 6, bladeDark); // hoja 1 (sombra)
	line(g, 1, 14, 9, 6, blade); // hoja 1
	line(g, 14, 2, 6, 10, bladeDark); // hoja 2 (sombra)
	line(g, 14, 1, 6, 9, "#e8e8ee"); // hoja 2 (brillo)
	set(g, 9, 6, handle); // pivote
	set(g, 8, 7, handle);
	set(g, 9, 7, handle);
	set(g, 10, 6, bladeDark);
	// anilla 1 (arriba-izquierda)
	set(g, 1, 13, handle);
	set(g, 2, 13, handle);
	set(g, 3, 13, handle);
	set(g, 3, 14, handle);
	set(g, 3, 15, handle);
	// anilla 2 (abajo-derecha)
	set(g, 13, 1, handle);
	set(g, 13, 2, handle);
	set(g, 13, 3, handle);
	set(g, 12, 1, handle);
	set(g, 11, 1, handle);
}

// Carne podrida (Fase 16, D2): trozo de carne grisácea con vetas y moho.
function drawFlesh(g, _rng) {
	const base = "#b06a5a",
		dark = "#7a4a40",
		light = "#d88a74";
	for (let y = 3; y <= 12; y++) {
		for (let x = 3; x <= 12; x++) {
			const dx = x - 7.5,
				dy = y - 7.5;
			if ((dx * dx) / 24 + (dy * dy) / 28 <= 1) set(g, x, y, base);
		}
	}
	line(g, 4, 4, 9, 9, light);
	line(g, 5, 5, 10, 10, light);
	line(g, 3, 9, 8, 12, dark);
	line(g, 8, 5, 12, 8, dark);
	set(g, 6, 7, "#3e6b3e");
	set(g, 7, 7, "#3e6b3e");
	set(g, 6, 8, "#3e6b3e");
	set(g, 10, 10, "#2e4a2e");
	set(g, 11, 11, "#2e4a2e");
}

// Pólvora (Fase 16, D2): montículo de granos gris oscuro.
function drawGunpowder(g, _rng) {
	const dark = "#3a3a3a",
		mid = "#555555",
		light = "#7a7a7a";
	for (let y = 7; y <= 13; y++) {
		for (let x = 3; x <= 12; x++) {
			const halfW = Math.max(0, 4.5 - Math.abs(y - 10.5));
			if (Math.abs(x - 7.5) <= halfW) set(g, x, y, dark);
		}
	}
	for (const [x, y] of [
		[4, 8],
		[10, 7],
		[11, 10],
		[6, 12],
		[8, 9],
		[5, 11]
	])
		set(g, x, y, mid);
	for (const [x, y] of [
		[3, 9],
		[7, 7],
		[12, 11],
		[9, 13]
	])
		set(g, x, y, light);
}

// Leche (Fase 21, C1): cubo metálico lleno de leche blanca (el icono de MC
// del cubo de leche); el cubo vacío (249/250/251) ya tiene drawBucket.
function drawMilk(g) {
	drawBucket(g, "#f5f5f2");
}

// Huevo (Fase 21, C1): óvalo crema con brillo y sombra (el huevo de MC).
function drawEgg(g) {
	const base = "#f0e6c8",
		dark = "#d8caa0",
		light = "#faf4e0";
	for (let y = 5; y <= 11; y++) {
		const t = Math.abs(y - 8) / 3.5;
		const w = Math.max(1, Math.round(5 * (1 - t)));
		for (let x = 8 - w; x <= 8 + w; x++) set(g, x, y, base);
	}
	rect(g, 5, 5, 1, 1, light);
	rect(g, 6, 5, 1, 1, light);
	rect(g, 5, 6, 1, 1, light);
	set(g, 9, 9, dark);
	set(g, 10, 10, dark);
	set(g, 9, 10, dark);
	set(g, 10, 9, dark);
	set(g, 7, 11, dark);
}

// ============================================================
// REGISTRO: id → función de dibujo (g, rng)
// ============================================================
const ICONS = {};
// Bloques 1..43 (Fase 9 F: tierra arada, trigo, abedul, pino, musgo, hierba,
// flores y lanas tintadas; Fase 10 D: grava y TNT; Fase 11 B: jungla y
// lianas — todos con BLOCK_COLORS).
for (let id = 1; id <= 43; id++)
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 13 (L2/L3): puertas (48/49), escaleras (50/51), losas (60/61), valla
// (70) y portón (71) — caen al default de drawBlockIcon (cubo con su color).
for (const id of [48, 49, 50, 51, 60, 61, 70, 71])
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (D2): coral (72) — icono de cubo con su color (como el resto
// de bloques).
ICONS[72] = (g, rng) => drawBlockIcon(72, g, rng);
// Fase 21.5 (B1): piedra pulida (73-78) — granito/diorita/andesita y
// pulidas, icono de cubo con su color del atlas.
for (let id = 73; id <= 78; id++)
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (B2): linterna (79) — icono de cubo con su color (como los
// demás bloques).
ICONS[79] = (g, rng) => drawBlockIcon(79, g, rng);
// Fase 21.5 (B3): bambú, tablones de bambú y andamio (80-82).
for (const id of [80, 81, 82]) ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (B4): nidos, colmenas y bloque de miel (83-85).
for (const id of [83, 84, 85]) ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (B5): abanico de coral, kelp, pasto marino (86-88).
for (const id of [86, 87, 88]) ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (E2): lana nueva — gris (66), negra (89), marrón (90).
for (const id of [66, 89, 90]) ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (C4): 16 camas de colores — icono de cubo con su color.
for (const id of [44, 45, 46, 47, 52, 53, 54, 55, 56, 57, 58, 59, 62, 63, 64, 65])
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (C1): horno de fundición (91)
ICONS[91] = (g, rng) => drawBlockIcon(91, g, rng);
// Fase 21.5 (C5): concreto y polvo de concreto (142-181) — cubo con su color.
// El namespace bloques/ítems es compartido, por eso el concreto usa 142-181 y
// no 100-131 (que colisionan con palo, carbón, lingotes...).
for (let id = 142; id <= 181; id++)
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (D4): familia de cobre y tuff (182-188) — cubo con su tesela.
for (let id = 182; id <= 188; id++)
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (D6): jukebox, pintura y note block (189-191) — cubo con su color.
for (const id of [189, 190, 191])
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (E3): bloques decorativos (92-98)
for (const id of [92, 93, 94, 95, 96, 97, 98])
	ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Ítems
ICONS[100] = drawStick;
ICONS[101] = drawCoal;
ICONS[102] = (g) => drawIngot(g, C.iron.m, C.iron.light, C.iron.dark);
ICONS[103] = (g) => drawIngot(g, C.gold.m, C.gold.light, C.gold.dark);
// Fase 20 B3: mena cruda — hierro/oro se minan así y se funden al lingote.
ICONS[258] = (g) => drawRaw(g, "#cfc8c0", "#8a8378", "#f2ede4");
ICONS[259] = (g) => drawRaw(g, "#e0c23a", "#9c7c14", "#f7e58a");
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
// Fase 18 (C-3): patata y patata al horno (comida nueva)
ICONS[121] = (g, rng) => drawPotato(g, rng, false);
ICONS[122] = (g, rng) => drawPotato(g, rng, true);
// Fase 18 (C-4): carbón vegetal (257)
ICONS[257] = drawCharcoal;
ICONS[132] = drawLeather;
// Fase 9 (F): pan, pescado (crudo/cocinado), hueso, tintes, harina de hueso, miel
ICONS[133] = drawBread;
ICONS[134] = (g) => drawFish(g, false);
ICONS[135] = (g) => drawFish(g, true);
ICONS[136] = drawBone;
ICONS[137] = (g) => drawDye(g, "#d92626", "#8f1010", "#f05a5a");
ICONS[138] = (g) => drawDye(g, "#e8c547", "#b8860b", "#f5e07a");
ICONS[139] = (g) => drawDye(g, "#f5f5f0", "#c9c9c0", "#ffffff");
// Fase 21.5 (C4): tintes nuevos para camas de colores
ICONS[266] = (g) => drawDye(g, "#2a2a2a", "#0a0a0a", "#4a4a4a"); // tinte negro
ICONS[267] = (g) => drawDye(g, "#8a5a3a", "#5a3a1a", "#b87a5a"); // tinte marrón
ICONS[268] = (g) => drawDye(g, "#8a8a88", "#5a5a58", "#b0b0ae"); // tinte gris
ICONS[140] = drawHoney;
// Fase 11 (C): tijeras
ICONS[141] = drawShears; // Fase 12 (A): tridente (245) y bola de slime (246)
ICONS[245] = drawTrident;
ICONS[246] = drawSlimeBall;
// Fase 13 (L1): arco, flecha, pedernal y pluma
ICONS[247] = drawBow;
ICONS[248] = drawArrow;
ICONS[252] = drawFlint;
ICONS[253] = drawFeather;
// Fase 13 (L4): cubos (vacío, agua, lava)
ICONS[249] = (g) => drawBucket(g, null);
ICONS[250] = (g) => drawBucket(g, "#3a6fd8");
ICONS[251] = (g) => drawBucket(g, "#e25822");
// Fase 13 (L5): compás (4 lingotes de hierro + redstone)
ICONS[254] = drawCompass;
// Fase 16 (D2): carne podrida (zombi) y pólvora (creeper).
ICONS[255] = drawFlesh;
ICONS[256] = drawGunpowder;
// Fase 21 (C1): leche (ordeñar la vaca) y huevo (pone la gallina).
ICONS[260] = drawMilk;
ICONS[261] = drawEgg;
// Fase 21.5 (A1): caña de pescar.
ICONS[262] = drawFishingRod;
// Fase 21.5 (B4): botella de vidrio y botella de miel.
ICONS[263] = drawGlassBottle;
ICONS[264] = drawHoneyBottle;
// Fase 21.5 (C2): escudo (1.9).
ICONS[265] = drawShield;
// Fase 21.5 (C3): tótem de la inmortalidad (1.11).
ICONS[269] = drawTotem;
// Fase 21.5 (B4): bloques de colmenas y bloque de miel (cubo con su color).
for (const id of [83, 84, 85]) ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (B5): coral y algas (cross-quads → icono con su color como
// planta; el atlas les da la silueta de cross en el inventario).
for (const id of [86, 87, 88]) ICONS[id] = (g, rng) => drawBlockIcon(id, g, rng);
// Fase 21.5 (D5): carga de viento (orbe azulado, glow) y barra de breeze
// (asta delgada azul-cyan).
ICONS[270] = (g) => {
	for (let y = 3; y <= 12; y++)
		for (let x = 3; x <= 12; x++) {
			const dx = x - 7.5, dy = y - 7.5;
			if (dx * dx + dy * dy <= 25) set(g, x, y, y < 8 ? "#a0d8ff" : "#60b0e0");
		}
	set(g, 7, 5, "#e0f0ff"); set(g, 8, 6, "#e0f0ff");
};
ICONS[271] = (g) => {
	for (let y = 2; y <= 14; y++) {
		set(g, 7, y, "#4a9ad0"); set(g, 8, y, "#6abae0");
	}
	set(g, 6, 3, "#80c0e8"); set(g, 9, 3, "#80c0e8");
};
// Fase 21.5 (D3): maza — mazo pesado con la cabeza de piedra.
ICONS[272] = (g) => {
	// Asta
	for (let y = 6; y <= 14; y++) { set(g, 7, y, "#8a6a4a"); set(g, 8, y, "#a0805a"); }
	// Cabeza
	for (let y = 2; y <= 7; y++)
		for (let x = 4; x <= 11; x++)
			set(g, x, y, x < 8 ? "#9a9a9a" : "#b0b0b0");
	set(g, 6, 3, "#d0d0d0"); set(g, 9, 3, "#d0d0d0");
};
// Fase 21.5 (D5): mapa de exploración de prueba — cuadrado parchment con brújula.
ICONS[273] = (g) => {
	for (let y = 2; y <= 13; y++)
		for (let x = 2; x <= 13; x++)
			set(g, x, y, (x + y) % 3 === 0 ? "#d8c898" : "#e8d8a8");
	set(g, 7, 7, "#c04040"); set(g, 8, 7, "#4040c0");
};
// Fase 21.5 (H1): mochila — cuero enrollado.
ICONS[274] = (g) => {
	for (let y = 4; y <= 13; y++)
		for (let x = 3; x <= 12; x++)
			set(g, x, y, x < 8 ? "#a07040" : "#c09060");
	set(g, 6, 4, "#604020"); set(g, 9, 4, "#604020");
	set(g, 5, 5, "#b08050"); set(g, 10, 5, "#b08050");
};
// Discos musicales — disco negro con etiqueta de color central.
function drawDisc(g, color) {
	for (let y = 2; y <= 13; y++)
		for (let x = 2; x <= 13; x++) {
			const dx = x - 7.5, dy = y - 7.5, r = dx * dx + dy * dy;
			if (r <= 36) set(g, x, y, r <= 8 ? color : "#1a1a1a");
		}
}
ICONS[275] = (g) => drawDisc(g, "#e04040"); // cat — rojo
ICONS[276] = (g) => drawDisc(g, "#40a040"); // 13 — verde
// Fase 21.5 (D6): pintura — lienzo rectangular.
ICONS[277] = (g) => {
	for (let y = 2; y <= 13; y++)
		for (let x = 3; x <= 12; x++) set(g, x, y, "#d8d0c0");
	set(g, 4, 5, "#c06030"); set(g, 8, 4, "#3080c0");
	set(g, 6, 8, "#40a040"); set(g, 10, 7, "#c0c040");
};
// Herramientas 200..219: (id-200)/5 = tipo, (id-200)%5 = material
for (let id = 200; id <= 219; id++) {
	ICONS[id] = makeToolIcon(Math.floor((id - 200) / 5), (id - 200) % 5);
}
// Fase 9 (C): azadas 240-244 — tipo 4 de TOOL_SHAPES, mismo material.
for (let id = 240; id <= 244; id++) {
	ICONS[id] = makeToolIcon(4, (id - 240) % 5);
}
// Armadura 220..239: (id-220)%4 = slot, (id-220)/4 = material (0 cuero,
// 1 hierro, 2 diamante, 3 oro, 4 malla — Fase 13, L5).
for (let id = 220; id <= 239; id++) {
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
let atlasVersion = 0;
let atlasFingerprint = "";
const tileIndex = new Map();

// Huella del contenido actual del atlas: longitud de ICONS + suma de IDs.
// Si cambia (ítems añadidos/eliminados entre cargas), se regenera el atlas.
function computeFingerprint() {
	const ids = itemIconIds();
	return `${ids.length}:${ids.reduce((a, b) => a + b, 0)}`;
}

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
// Fase 19 (E): hot-reload del atlas de iconos — descarta el atlas cacheado y
// el índice de teselas; la siguiente itemIconCss() lo reconstruye con el
// código actual (mismo patrón que hotReloadTextures del atlas de terreno).
// El repintado de los slots visibles lo hace ui.js (repaintIcons).
export function reloadItemIcons() {
	atlasUrl = null;
	atlasVersion++;
	atlasFingerprint = "";
	tileIndex.clear();
}

function getAtlasUrl() {
	// Si el atlas ya existe y la huella no cambió, reusarlo.
	const fp = computeFingerprint();
	if (atlasUrl && atlasFingerprint === fp) return atlasUrl;
	// Regenerar: atlas nuevo o huella cambió (ítems añadidos/eliminados).
	atlasUrl = null;
	atlasFingerprint = fp;
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
	// Cache-busting: el sufijo ?v=N fuerza al navegador a tratar cada
	// regeneración del atlas como una imagen distinta (data:image URLs
	// pueden ser cacheadas por el browser o por service workers). La
	// versión se incrementa en reloadItemIcons() (hot-reload del atlas).
	atlasUrl = canvas.toDataURL() + `?v=${atlasVersion}`;
	return atlasUrl;
}

// Forzar regeneración del atlas en la primera carga del cliente:
// calcula la huella y genera el atlas de forma eager (sin esperar a la
// primera llamada de itemIconCss). Esto descarta cualquier atlas
// cacheado por un service worker o por una sesión anterior.
export function initItemIcons() {
	atlasUrl = null;
	atlasVersion++;
	atlasFingerprint = "";
	tileIndex.clear();
	// Forzar la generación inmediata del atlas.
	getAtlasUrl();
}
