// ============================================================
// SKINS DE JUGADOR (procedurales, pixel-art 16x16 por parte)
// Los 9 skins oficiales por defecto de Minecraft: Steve, Alex,
// Noor, Sunny, Ari, Zuri, Makena, Kai y Efe. Misma filosofía que
// mobtextures.js: sin assets binarios ni build step — cada skin
// es un conjunto de paletas + pinceladas por parte (head/body/
// arm/leg) que se pintan en una matriz de 256 píxeles.
//
// Este módulo es PURO (sin THREE ni DOM): la lógica dibujable se
// reduce a matrices de colores (`tilePixels`) que se pueden
// verificar en Node (tests/unit-skins.js) y que `paintTile`
// convierte en píxeles de un canvas 2D real. El atlas THREE del
// humanoide vive en skintextures.js (capa fina de THREE).
//
// FUENTE DE VERDAD DEL CLIENTE: la lista oficial de ids vive aquí
// (SKINS); el servidor tiene la lista paralela en
// server/constants.js (PLAYER_SKINS) y tests/unit-skins.js audita
// que ambas coinciden (patrón de sync de B/I y DURABILITY).
// ============================================================

// Identidad de los skins (id + nombre mostrado en el selector).
export const SKINS = [
	{ id: "steve", label: "Steve" },
	{ id: "alex", label: "Alex" },
	{ id: "noor", label: "Noor" },
	{ id: "sunny", label: "Sunny" },
	{ id: "ari", label: "Ari" },
	{ id: "zuri", label: "Zuri" },
	{ id: "makena", label: "Makena" },
	{ id: "kai", label: "Kai" },
	{ id: "efe", label: "Efe" }
];
export const SKIN_IDS = SKINS.map((s) => s.id);

export function isValidSkin(id) {
	return typeof id === "string" && SKIN_IDS.includes(id);
}

// --- helpers de pincel sobre la matriz de píxeles ---
function fill(put, c) {
	for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) put(x, y, c);
}
function rect(put, x, y, w, h, c) {
	for (let yy = y; yy < y + h; yy++)
		for (let xx = x; xx < x + w; xx++) put(xx, yy, c);
}

// ============================================================
// PINTORES COMPARTIDOS POR PARTE
// head: cara genérica (orejas, ojos, nariz, boca) + peinado por
// estilo; body: camiseta con botones/hombros/cinturón; arm: mano
// + manga (corta o larga); leg: pantalón + zapatos.
// ============================================================
// Fase 22.3 (B1): base común de la cabeza (piel + sombreado lateral +
// peinado). La CARA (ojos/nariz/boca/pómulos) va aparte para que el
// lateral de la cabeza (`headSide`) pueda reutilizar la base sin cara:
// antes la única tesela de cabeza pintaba los ojos en las 6 caras del
// cubo (bug visual de cabezas en mobs/jugadores).
function drawHeadBase(put, P, style) {
	fill(put, P.skin);
	// orejas/sombra lateral (da volumen a la cabeza)
	for (let y = 2; y < 12; y++) {
		put(0, y, P.shade);
		put(15, y, P.shade);
	}
	if (style === "short") {
		// Steve/Noor/Makena: pelo corto con patillas
		rect(put, 0, 0, 16, 2, P.hair);
		rect(put, 0, 3, 1, 2, P.hair);
		rect(put, 15, 3, 1, 2, P.hair);
		put(3, 2, P.hair);
		put(11, 2, P.hair);
	} else if (style === "fringe") {
		// Alex: pelo rojizo con flequillo
		rect(put, 0, 0, 16, 1, P.hair);
		rect(put, 0, 2, 1, 3, P.hair);
		rect(put, 15, 2, 1, 3, P.hair);
		rect(put, 2, 1, 3, 1, P.hair);
		rect(put, 11, 1, 3, 1, P.hair);
		rect(put, 5, 2, 2, 1, P.hair);
		rect(put, 9, 2, 2, 1, P.hair);
	} else if (style === "bun") {
		// Sunny: moño alto
		rect(put, 0, 0, 16, 2, P.hair);
		rect(put, 0, 3, 1, 2, P.hair);
		rect(put, 15, 3, 1, 2, P.hair);
		rect(put, 6, 0, 4, 1, P.hair);
	} else if (style === "cap") {
		// Ari: gorra con visera
		rect(put, 0, 0, 16, 2, P.hair);
		rect(put, 0, 3, 1, 2, P.hair);
		rect(put, 15, 3, 1, 2, P.hair);
		rect(put, 1, 2, 14, 1, P.trim);
	} else if (style === "curls") {
		// Zuri: rizos
		rect(put, 0, 0, 16, 2, P.hair);
		rect(put, 0, 3, 2, 2, P.hair);
		rect(put, 14, 3, 2, 2, P.hair);
		put(2, 4, P.hair);
		put(13, 4, P.hair);
		put(4, 2, P.hairDark);
		put(12, 2, P.hairDark);
	} else if (style === "topknot") {
		// Kai: nudo alto
		rect(put, 0, 0, 16, 2, P.hair);
		rect(put, 0, 3, 1, 2, P.hair);
		rect(put, 15, 3, 1, 2, P.hair);
		rect(put, 7, 0, 2, 1, P.hairDark);
	} else {
		// streak (Efe): pelo con raya de color
		rect(put, 0, 0, 16, 2, P.hair);
		rect(put, 0, 3, 1, 2, P.hair);
		rect(put, 15, 3, 1, 2, P.hair);
		rect(put, 7, 1, 2, 1, P.trim);
	}
}

// Cara completa (frontal): base + ojos/nariz/boca/pómulos.
function drawHead(put, P, style) {
	drawHeadBase(put, P, style);
	// ojos 2x1
	rect(put, 3, 5, 2, 1, P.eye);
	rect(put, 11, 5, 2, 1, P.eye);
	// nariz
	put(7, 6, P.skinDark);
	put(8, 6, P.skinDark);
	// boca
	rect(put, 5, 9, 6, 1, P.mouth);
	// pómulos
	put(2, 7, P.skinDark);
	put(13, 7, P.skinDark);
}

// Lateral de la cabeza (Fase 22.3 B1): SOLO la base (piel + pelo), sin
// rasgos. La usan las 5 caras no frontales del cubo de cabeza.
function drawHeadSide(put, P, style) {
	drawHeadBase(put, P, style);
}

// o.sleeveless → hombros de piel (camiseta sin mangas); o.collar →
// cuello blanco; o.stripe → franja horizontal a la altura indicada.
function drawBody(put, P, o = {}) {
	fill(put, P.shirt);
	for (let y = 0; y < 16; y++) {
		put(0, y, P.shirtDark);
		put(15, y, P.shirtDark);
	}
	if (o.sleeveless) {
		rect(put, 0, 0, 3, 2, P.skin);
		rect(put, 13, 0, 3, 2, P.skin);
		put(1, 1, P.skinDark);
		put(14, 1, P.skinDark);
	} else {
		// botones
		put(6, 4, P.skin);
		put(9, 4, P.skin);
		put(6, 8, P.skin);
		put(9, 8, P.skin);
	}
	if (o.collar) rect(put, 5, 0, 6, 1, P.trim);
	if (typeof o.stripe === "number")
		rect(put, 1, o.stripe, 14, 1, o.stripeColor || P.trim);
}

// o.short → manga corta (3 filas); por defecto larga (5 filas).
function drawArm(put, P, o = {}) {
	fill(put, P.skin);
	for (let y = 0; y < 16; y++) {
		put(0, y, P.skinDark);
		put(15, y, P.skinDark);
	}
	// mano
	rect(put, 0, 13, 16, 3, P.skinDark);
	const sleeveH = o.short ? 3 : 5;
	rect(put, 0, 0, 16, sleeveH, P.shirt);
	rect(put, 0, sleeveH - 1, 16, 1, P.shirtDark);
}

function drawLeg(put, P) {
	fill(put, P.pants);
	for (let y = 0; y < 16; y++) {
		put(0, y, P.pantsDark);
		put(15, y, P.pantsDark);
	}
	// zapatos
	rect(put, 0, 12, 16, 1, P.pantsDark);
	rect(put, 0, 13, 16, 3, P.shoe);
}

// ============================================================
// DEFINICIONES POR SKIN (paletas + pinceladas por parte)
// Colores aproximados de los skins oficiales; el objetivo es que
// cada uno sea DISTINTO y reconocible a simple vista en el menú y
// en el juego (los tests verifican que las cabezas/cuerpos nunca
// colisionan entre skins).
// ============================================================
const SKIN_DEFS = {
	steve: {
		label: "Steve",
		palette: {
			skin: "#d8a07a",
			skinDark: "#b8866a",
			shade: "#c08c66",
			eye: "#2a2a35",
			mouth: "#8a5a44",
			hair: "#5a3a22",
			hairDark: "#4a2e1a",
			shirt: "#337bb5",
			shirtDark: "#2a6494",
			trim: "#ffffff",
			pants: "#4a5a8a",
			pantsDark: "#3d4a72",
			shoe: "#2a2a33"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "short"),
			headSide: (put, P) => drawHeadSide(put, P, "short"),
			body: (put, P) => drawBody(put, P),
			arm: (put, P) => drawArm(put, P),
			leg: drawLeg
		}
	},
	alex: {
		label: "Alex",
		palette: {
			skin: "#f0c8a0",
			skinDark: "#dcb088",
			shade: "#e2b690",
			eye: "#2a2a35",
			mouth: "#a88060",
			hair: "#d8663a",
			hairDark: "#c05a30",
			shirt: "#3fa05a",
			shirtDark: "#33864a",
			trim: "#ffffff",
			pants: "#8a8a8a",
			pantsDark: "#757575",
			shoe: "#4a4a4a"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "fringe"),
			headSide: (put, P) => drawHeadSide(put, P, "fringe"),
			body: (put, P) => drawBody(put, P, { sleeveless: true }),
			arm: (put, P) => drawArm(put, P, { short: true }),
			leg: drawLeg
		}
	},
	noor: {
		label: "Noor",
		palette: {
			skin: "#6b4a2e",
			skinDark: "#5a3d24",
			shade: "#5e4228",
			eye: "#1a1a22",
			mouth: "#4a2f1a",
			hair: "#1a1a1a",
			hairDark: "#111111",
			shirt: "#2a2a33",
			shirtDark: "#22222a",
			trim: "#8a8a9a",
			pants: "#22222a",
			pantsDark: "#1a1a22",
			shoe: "#14141a"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "short"),
			headSide: (put, P) => drawHeadSide(put, P, "short"),
			body: (put, P) => drawBody(put, P, { stripe: 12 }),
			arm: (put, P) => drawArm(put, P),
			leg: drawLeg
		}
	},
	sunny: {
		label: "Sunny",
		palette: {
			skin: "#b07848",
			skinDark: "#9a6838",
			shade: "#a47040",
			eye: "#2a1a10",
			mouth: "#7a5230",
			hair: "#2a2a2a",
			hairDark: "#1f1f1f",
			shirt: "#e8c84a",
			shirtDark: "#d0b23a",
			trim: "#ffffff",
			pants: "#4a4a5a",
			pantsDark: "#3d3d4a",
			shoe: "#2a2a33"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "bun"),
			headSide: (put, P) => drawHeadSide(put, P, "bun"),
			body: (put, P) => drawBody(put, P, { collar: true }),
			arm: (put, P) => drawArm(put, P),
			leg: drawLeg
		}
	},
	ari: {
		label: "Ari",
		palette: {
			skin: "#a89068",
			skinDark: "#94805a",
			shade: "#9c8860",
			eye: "#2a2a20",
			mouth: "#6a5a3a",
			hair: "#3a2a1a",
			hairDark: "#2f2215",
			shirt: "#4a8a4a",
			shirtDark: "#3c703c",
			trim: "#e0a030",
			pants: "#3a3a3a",
			pantsDark: "#2f2f2f",
			shoe: "#22222a"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "cap"),
			headSide: (put, P) => drawHeadSide(put, P, "cap"),
			body: (put, P) => drawBody(put, P, { stripe: 7 }),
			arm: (put, P) => drawArm(put, P),
			leg: drawLeg
		}
	},
	zuri: {
		label: "Zuri",
		palette: {
			skin: "#54321c",
			skinDark: "#472b17",
			shade: "#4b2e1a",
			eye: "#1a1a22",
			mouth: "#3a2412",
			hair: "#151515",
			hairDark: "#0f0f0f",
			shirt: "#c85030",
			shirtDark: "#a84428",
			trim: "#e8e8e8",
			pants: "#33333a",
			pantsDark: "#2a2a30",
			shoe: "#1f1f26"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "curls"),
			headSide: (put, P) => drawHeadSide(put, P, "curls"),
			body: (put, P) => drawBody(put, P, { stripe: 12 }),
			arm: (put, P) => drawArm(put, P),
			leg: drawLeg
		}
	},
	makena: {
		label: "Makena",
		palette: {
			skin: "#59381f",
			skinDark: "#4b2f1a",
			shade: "#50331c",
			eye: "#1a1a22",
			mouth: "#3a2412",
			hair: "#181818",
			hairDark: "#121212",
			shirt: "#7a5ac8",
			shirtDark: "#6849b0",
			trim: "#4a3a80",
			pants: "#2a2a35",
			pantsDark: "#23232c",
			shoe: "#1a1a22"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "short"),
			headSide: (put, P) => drawHeadSide(put, P, "short"),
			body: (put, P) => drawBody(put, P, { stripe: 7 }),
			arm: (put, P) => drawArm(put, P),
			leg: drawLeg
		}
	},
	kai: {
		label: "Kai",
		palette: {
			skin: "#c8905f",
			skinDark: "#b07c50",
			shade: "#b88652",
			eye: "#2a2a35",
			mouth: "#8a6240",
			hair: "#202020",
			hairDark: "#181818",
			shirt: "#3a7a8a",
			shirtDark: "#316877",
			trim: "#9ab8c0",
			pants: "#5a5a5a",
			pantsDark: "#4d4d4d",
			shoe: "#33333a"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "topknot"),
			headSide: (put, P) => drawHeadSide(put, P, "topknot"),
			body: (put, P) => drawBody(put, P, { stripe: 6 }),
			arm: (put, P) => drawArm(put, P),
			leg: drawLeg
		}
	},
	efe: {
		label: "Efe",
		palette: {
			skin: "#4a2f1a",
			skinDark: "#3f2815",
			shade: "#442b18",
			eye: "#1a1a22",
			mouth: "#33200f",
			hair: "#151515",
			hairDark: "#0f0f0f",
			shirt: "#e8e8e8",
			shirtDark: "#c8c8c8",
			trim: "#c83030",
			pants: "#2a2a2a",
			pantsDark: "#222222",
			shoe: "#1a1a1a"
		},
		draw: {
			head: (put, P) => drawHead(put, P, "streak"),
			headSide: (put, P) => drawHeadSide(put, P, "streak"),
			body: (put, P) => drawBody(put, P, { sleeveless: true, stripe: 12 }),
			arm: (put, P) => drawArm(put, P, { short: true }),
			leg: drawLeg
		}
	}
};

// ============================================================
// MATRIZ DE PÍXELES (núcleo puro y testeable)
// Devuelve un array de 256 entradas (fila-mayor): null = píxel
// transparente, "#rrggbb" = color opaco. Determinista: misma
// skin + parte → misma matriz (sin azar).
// ============================================================
export function tilePixels(skinId, part) {
	const s = SKIN_DEFS[skinId];
	if (!s?.draw[part]) return null;
	const px = new Array(256).fill(null);
	const put = (x, y, c) => {
		if (x >= 0 && x < 16 && y >= 0 && y < 16) px[y * 16 + x] = c;
	};
	s.draw[part](put, s.palette);
	return px;
}

// ============================================================
// PINTADO SOBRE UN CANVAS 2D REAL
// `ctx` debe estar posicionado en el origen de la tesela y con su
// espacio de 16×16 píxeles ya escalado (`scale` multiplica cada
// píxel de la matriz; p. ej. scale 4 → tesela de 64×64). Se usa
// tanto para el atlas del humanoide (scale 1, con translate por
// tesela) como para las miniaturas del selector del menú.
// ============================================================
export function paintTile(ctx, skinId, part, scale = 1) {
	const px = tilePixels(skinId, part);
	if (!px) return;
	for (let i = 0; i < 256; i++) {
		const c = px[i];
		if (!c) continue;
		ctx.fillStyle = c;
		ctx.fillRect((i % 16) * scale, Math.floor(i / 16) * scale, scale, scale);
	}
}

// Miniatura de la cabeza para el selector del menú: escala entera
// mínima para cubrir `size` píxeles (64 → 4, 80 → 5).
export function paintHeadPreview(ctx, skinId, size) {
	paintTile(ctx, skinId, "head", Math.max(1, Math.floor(size / 16)));
}
