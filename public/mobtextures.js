// ============================================================
// TEXTURAS PROCEDURALES DE MOBS (16x16 px por tesela, pixel-art)
// Fase 8 (B9): los mobs ya NO son un box único — cada especie es un
// GRUPO de partes (cabeza, cuerpo, extremidades) y cada parte única
// tiene SU tesela en un atlas de una fila (N × 16 px). El mesh se
// construye en public/mobs.js iterando MOB_PARTS y remapeando los UV
// de cada caja hacia la tesela de su parte. Sin assets binarios ni
// build step. Misma filosofía que textures.js.
//
// MOB_PARTS es la ÚNICA fuente de verdad del modelo: mobs.js la usa
// para construir los meshes y este módulo para saber qué teselas
// generar. Coordenadas relativas al grupo (Y: 0 = pies, +Y = arriba).
// ============================================================
import * as THREE from "three";

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
function speckle(ctx, rng, color, density) {
	ctx.fillStyle = color;
	for (let y = 0; y < TILE; y++) {
		for (let x = 0; x < TILE; x++) {
			if (rng() < density) ctx.fillRect(x, y, 1, 1);
		}
	}
}

// ============================================================
// ESQUEMA MULTIBLOQUE (Fase 8, B9): dimensiones por parte y especie.
// Formato: { parts: [{ name, size:[w,h,d], pos:[x,y,z], tile?,
//                       rot? }] }
//  - name: identidad de la parte (armL/armR comparten "arm", etc.)
//  - tile: tesela del atlas a usar (por defecto, `name`)
//  - rot:  rotación en radianes [x,y,z] (patas de la araña)
// Las posiciones son relativas al grupo; la escala por especie
// (MOB_SCALE en mobs.js) y isBaby se aplican al grupo raíz.
// ============================================================
export const MOB_PARTS = {
	zombie: {
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
			{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [-0.375, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [0.375, 1.05, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
		]
	},
	// Esqueleto: misma silueta humanoide, cambian solo las texturas.
	skeleton: {
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
			{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [-0.375, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [0.375, 1.05, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
		]
	},
	// Fase 21.5 (D2): Bogged — esqueleto de pantano que comparte la silueta
	// del esqueleto (solo cambia la textura musgosa, como en MC).
	bogged: {
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
			{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [-0.375, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [0.375, 1.05, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
		]
	},
	// Enderman: alto (2.55 bloques), brazos y piernas largos.
	enderman: {
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 2.05, 0] },
			{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.35, 0] },
			{ name: "arm", size: [0.25, 1.0, 0.25], pos: [-0.375, 1.4, 0] },
			{ name: "arm", size: [0.25, 1.0, 0.25], pos: [0.375, 1.4, 0] },
			{ name: "leg", size: [0.25, 1.0, 0.25], pos: [-0.125, 0.5, 0] },
			{ name: "leg", size: [0.25, 1.0, 0.25], pos: [0.125, 0.5, 0] }
		]
	},
	// Creeper: cuerpo bajo y 4 patas (delanteras y traseras).
	creeper: {
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.35, 0] },
			{ name: "body", size: [0.5, 0.6, 0.25], pos: [0, 0.8, 0] },
			{ name: "leg", size: [0.25, 0.5, 0.25], pos: [-0.125, 0.25, 0.125] },
			{ name: "leg", size: [0.25, 0.5, 0.25], pos: [0.125, 0.25, 0.125] },
			{ name: "leg", size: [0.25, 0.5, 0.25], pos: [-0.125, 0.25, -0.125] },
			{ name: "leg", size: [0.25, 0.5, 0.25], pos: [0.125, 0.25, -0.125] }
		]
	},
	// Araña: abdomen + cabeza y 8 patas (4 por lado, rotadas en diagonal).
	spider: {
		parts: [
			{ name: "body", size: [0.7, 0.5, 0.7], pos: [0, 0.35, -0.15] },
			{ name: "head", size: [0.5, 0.3, 0.5], pos: [0, 0.35, 0.3] },
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [-0.5, 0.4, 0.35],
				rot: [0, 0.9, 0]
			},
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [0.5, 0.4, 0.35],
				rot: [0, -0.9, 0]
			},
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [-0.5, 0.4, 0.1],
				rot: [0, 0.45, 0]
			},
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [0.5, 0.4, 0.1],
				rot: [0, -0.45, 0]
			},
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [-0.5, 0.4, -0.15],
				rot: [0, -0.45, 0]
			},
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [0.5, 0.4, -0.15],
				rot: [0, 0.45, 0]
			},
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [-0.5, 0.4, -0.4],
				rot: [0, -0.9, 0]
			},
			{
				name: "leg",
				tile: "body",
				size: [0.08, 0.08, 0.55],
				pos: [0.5, 0.4, -0.4],
				rot: [0, 0.9, 0]
			}
		]
	},
	// Conejo: cuerpo + cabeza + orejas largas.
	rabbit: {
		parts: [
			{ name: "body", size: [0.4, 0.4, 0.4], pos: [0, 0.25, 0] },
			{ name: "head", size: [0.3, 0.3, 0.3], pos: [0, 0.45, 0.2] },
			{ name: "ear", size: [0.08, 0.3, 0.05], pos: [-0.09, 0.75, 0.15] },
			{ name: "ear", size: [0.08, 0.3, 0.05], pos: [0.09, 0.75, 0.15] }
		]
	},
	// Cuadrúpedos (lobo, vaca, cerdo, oveja): cuerpo alargado + cabeza + 4 patas.
	wolf: {
		parts: [
			{ name: "body", size: [0.6, 0.6, 1.0], pos: [0, 0.55, 0] },
			{ name: "head", size: [0.4, 0.4, 0.4], pos: [0, 0.6, 0.55] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, -0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, -0.3] }
		]
	},
	cow: {
		parts: [
			{ name: "body", size: [0.6, 0.6, 1.0], pos: [0, 0.55, 0] },
			{ name: "head", size: [0.4, 0.4, 0.4], pos: [0, 0.6, 0.55] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, -0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, -0.3] }
		]
	},
	pig: {
		parts: [
			{ name: "body", size: [0.6, 0.6, 1.0], pos: [0, 0.55, 0] },
			{ name: "head", size: [0.4, 0.4, 0.4], pos: [0, 0.6, 0.55] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, -0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, -0.3] }
		]
	},
	sheep: {
		parts: [
			{ name: "body", size: [0.6, 0.6, 1.0], pos: [0, 0.55, 0] },
			{ name: "head", size: [0.4, 0.4, 0.4], pos: [0, 0.6, 0.55] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, 0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [-0.2, 0.25, -0.3] },
			{ name: "leg", size: [0.15, 0.5, 0.15], pos: [0.2, 0.25, -0.3] }
		]
	},
	// Pollo: cuerpo bajo + cabeza + 2 patas finas.
	chicken: {
		parts: [
			{ name: "body", size: [0.4, 0.4, 0.4], pos: [0, 0.3, 0] },
			{ name: "head", size: [0.25, 0.25, 0.25], pos: [0, 0.5, 0.15] },
			{ name: "leg", size: [0.06, 0.3, 0.06], pos: [-0.1, 0.15, 0] },
			{ name: "leg", size: [0.06, 0.3, 0.06], pos: [0.1, 0.15, 0] }
		]
	},
	// Fase 12 (Bloque A): mobs por bioma —
	// Slime: un solo cuerpo cúbico gelatinoso (sin patas); la escala la
	// decide el cliente según slimeSize (2/1/0 → 2.0/1.0/0.5) en MOB_SCALE.
	slime: {
		parts: [{ name: "body", size: [0.8, 0.8, 0.8], pos: [0, 0.4, 0] }]
	},
	// Ocelote y gato: felino esbelto — cuerpo + cabeza + cola + 4 patas.
	// El gato (ocelote domado) comparte anatomía con textura propia.
	ocelot: {
		parts: [
			{ name: "body", size: [0.45, 0.4, 0.9], pos: [0, 0.45, -0.05] },
			{ name: "head", size: [0.35, 0.35, 0.35], pos: [0, 0.5, 0.5] },
			{ name: "tail", size: [0.08, 0.08, 0.55], pos: [0, 0.55, -0.65] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [-0.16, 0.2, 0.25] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [0.16, 0.2, 0.25] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [-0.16, 0.2, -0.35] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [0.16, 0.2, -0.35] }
		]
	},
	cat: {
		parts: [
			{ name: "body", size: [0.45, 0.4, 0.9], pos: [0, 0.45, -0.05] },
			{ name: "head", size: [0.35, 0.35, 0.35], pos: [0, 0.5, 0.5] },
			{ name: "tail", size: [0.08, 0.08, 0.55], pos: [0, 0.55, -0.65] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [-0.16, 0.2, 0.25] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [0.16, 0.2, 0.25] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [-0.16, 0.2, -0.35] },
			{ name: "leg", size: [0.14, 0.4, 0.14], pos: [0.16, 0.2, -0.35] }
		]
	},
	// Ahogado: misma silueta humanoide que el zombi, textura de no-muerto
	// acuático (piel verdosa-azulada, harapos oscuros).
	drowned: {
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
			{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [-0.375, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [0.375, 1.05, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
		]
	},
	// Fase 21.5 (F2): Creaking — humanoide alto de madera pálida con ojos
	// que brillan. Silueta similar al esqueleto pero con tonos de madera.
	creaking: {
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
			{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [-0.375, 1.05, 0] },
			{ name: "arm", size: [0.25, 0.75, 0.25], pos: [0.375, 1.05, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
			{ name: "leg", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
		]
	}
};

// ============================================================
// PALETAS Y DIBUJO POR PARTE
// Una función por parte única (head/body/arm/leg/ear). Las teselas
// repetidas (brazos/piernas laterales, patas) se generan una vez.
// Los motivos visuales se conservan de la versión de box único: solo
// cambia la distribución por parte.
// ============================================================

// --- ZOMBIE: piel verdosa, camisa azul rota, pantalón oscuro ---
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
function drawZombieHead(ctx, rng) {
	fill(ctx, Z.skin);
	rect(ctx, 1, 0, 14, 2, Z.hair); // pelo despeinado
	for (let i = 0; i < 5; i++) px(ctx, 1 + Math.floor(rng() * 14), 2, Z.hair);
	rect(ctx, 4, 3, 2, 1, Z.eye); // ojos 2x1
	rect(ctx, 10, 3, 2, 1, Z.eye);
	px(ctx, 7, 4, Z.skinDark);
	px(ctx, 8, 4, Z.skinDark); // nariz
	rect(ctx, 5, 6, 6, 2, Z.eye); // boca torcida
	px(ctx, 6, 6, Z.skinDark);
	px(ctx, 9, 7, Z.skinDark);
}
function drawZombieBody(ctx, rng) {
	fill(ctx, Z.shirt);
	speckle(ctx, rng, Z.shirtDark, 0.16);
	px(ctx, 2, 4, Z.skin); // rasgones que dejan ver la piel
	px(ctx, 13, 5, Z.skin);
	px(ctx, 5, 11, Z.skinDark);
	px(ctx, 10, 10, Z.skinDark);
}
function drawZombieArm(ctx, rng) {
	fill(ctx, Z.skin);
	speckle(ctx, rng, Z.skinDark, 0.15);
	rect(ctx, 0, 0, TILE, 6, Z.shirt); // manga
	speckle(ctx, rng, Z.shirtDark, 0.15);
}
function drawZombieLeg(ctx, rng) {
	fill(ctx, Z.pants);
	speckle(ctx, rng, Z.pantsDark, 0.22);
	rect(ctx, 0, 13, TILE, 3, Z.skinDark); // pie
}

// --- CREEPER: verde moteado, cara clásica de 4 ojos en la cabeza ---
const C = {
	body: "#2e7d32",
	bodyDark: "#1b5e20",
	bodyLight: "#43a047",
	face: "#0d0d0d"
};
function drawCreeperHead(ctx, rng) {
	fill(ctx, C.body);
	speckle(ctx, rng, C.bodyDark, 0.12);
	rect(ctx, 3, 2, 2, 2, C.face); // 4 ojos 2x2
	rect(ctx, 11, 2, 2, 2, C.face);
	rect(ctx, 5, 7, 2, 2, C.face);
	rect(ctx, 9, 7, 2, 2, C.face);
	rect(ctx, 6, 9, 4, 1, C.face); // boca característica
	rect(ctx, 7, 10, 2, 1, C.face);
}
function drawCreeperBody(ctx, rng) {
	fill(ctx, C.body);
	speckle(ctx, rng, C.bodyDark, 0.14);
	speckle(ctx, rng, C.bodyLight, 0.08);
}
function drawCreeperLeg(ctx, rng) {
	fill(ctx, C.bodyDark);
	speckle(ctx, rng, C.body, 0.2);
	speckle(ctx, rng, C.bodyLight, 0.1);
}

// --- SKELETON: huesos pálidos, cuencas negras y costillas ---
const S = {
	bone: "#d8d8d8",
	boneDark: "#9a9a9a",
	boneLight: "#f0f0f0",
	socket: "#141414"
};
function drawSkeletonHead(ctx, rng) {
	fill(ctx, S.bone);
	speckle(ctx, rng, S.boneDark, 0.08);
	rect(ctx, 3, 1, 3, 2, S.socket); // cuencas
	rect(ctx, 10, 1, 3, 2, S.socket);
	rect(ctx, 7, 2, 2, 1, S.socket); // nariz
	rect(ctx, 4, 5, 8, 2, S.boneDark); // mandíbula
	px(ctx, 5, 5, S.bone);
	px(ctx, 10, 6, S.bone);
}
function drawSkeletonBody(ctx, rng) {
	fill(ctx, S.boneDark);
	rect(ctx, 3, 1, 10, 1, S.bone); // costillas
	rect(ctx, 4, 4, 8, 1, S.bone);
	rect(ctx, 5, 7, 6, 1, S.bone);
	rect(ctx, 6, 10, 4, 1, S.bone);
	speckle(ctx, rng, S.bone, 0.1);
}
function drawSkeletonArm(ctx, rng) {
	fill(ctx, S.bone);
	speckle(ctx, rng, S.boneDark, 0.12);
	for (let y = 2; y < TILE; y += 4) rect(ctx, 0, y, TILE, 1, S.boneDark);
}
function drawSkeletonLeg(ctx, rng) {
	fill(ctx, S.boneDark);
	speckle(ctx, rng, S.bone, 0.18);
}

// --- Fase 21.5 (D2): BOGGED — esqueleto de pantano (1.21). En MC es un
// esqueleto cubierto de musgo: huesos gris-verdosos con manchas verde musgo
// en la cabeza y el torso (las cuencas se conservan negras como en el
// esqueleto). El resto de la forma es idéntica a la del esqueleto.
const BG = {
	bone: "#aab88a", // hueso verdoso
	boneDark: "#6f7d58", // sombra verdosa
	boneLight: "#d0d8b0", // brillo musgoso
	socket: "#141414",
	moss: "#4d6b2f", // verde musgo
	mossLight: "#5f7f3a"
};
function drawBoggedHead(ctx, rng) {
	fill(ctx, BG.bone);
	speckle(ctx, rng, BG.moss, 0.25); // musgo moteado (como MC)
	rect(ctx, 3, 1, 3, 2, BG.socket); // cuencas
	rect(ctx, 10, 1, 3, 2, BG.socket);
	rect(ctx, 7, 2, 2, 1, BG.socket); // nariz
	rect(ctx, 4, 5, 8, 2, BG.boneDark); // mandíbula
	px(ctx, 5, 5, BG.boneLight);
	px(ctx, 10, 6, BG.boneLight);
}
function drawBoggedBody(ctx, rng) {
	fill(ctx, BG.boneDark);
	// Costillas con musgo entreverado (a diferencia del esqueleto limpio).
	rect(ctx, 3, 1, 10, 1, BG.boneLight);
	rect(ctx, 4, 4, 8, 1, BG.boneLight);
	rect(ctx, 5, 7, 6, 1, BG.boneLight);
	rect(ctx, 6, 10, 4, 1, BG.boneLight);
	speckle(ctx, rng, BG.moss, 0.35);
	speckle(ctx, rng, BG.bone, 0.1);
}
function drawBoggedArm(ctx, rng) {
	fill(ctx, BG.bone);
	speckle(ctx, rng, BG.moss, 0.3);
	for (let y = 2; y < TILE; y += 4) rect(ctx, 0, y, TILE, 1, BG.boneDark);
}
function drawBoggedLeg(ctx, rng) {
	fill(ctx, BG.boneDark);
	speckle(ctx, rng, BG.bone, 0.18);
	speckle(ctx, rng, BG.moss, 0.2);
}

// --- ENDERMAN: negro profundo, ojos morados brillantes ---
const E = {
	body: "#16161f",
	bodyLight: "#242433",
	eye: "#b26bd6",
	eyeHot: "#d9a3f0"
};
function drawEndermanHead(ctx, rng) {
	fill(ctx, E.body);
	speckle(ctx, rng, E.bodyLight, 0.06);
	rect(ctx, 4, 2, 3, 2, E.eye); // ojos morados 3x2
	rect(ctx, 9, 2, 3, 2, E.eye);
	px(ctx, 5, 2, E.eyeHot);
	px(ctx, 10, 3, E.eyeHot);
}
function drawEndermanBody(ctx, rng) {
	fill(ctx, E.body);
	speckle(ctx, rng, E.bodyLight, 0.1);
}
function drawEndermanArm(ctx, rng) {
	fill(ctx, E.body);
	speckle(ctx, rng, E.bodyLight, 0.08);
}
function drawEndermanLeg(ctx, _rng) {
	fill(ctx, "#0f0f17");
}

// --- SPIDER: abdomen oscuro, cabeza con racimo de ojos rojos ---
const SP = {
	body: "#4a3f35",
	bodyDark: "#332b24",
	bodyLight: "#5d5146",
	eye: "#e03030",
	eyeHot: "#ff8080"
};
function drawSpiderBody(ctx, rng) {
	fill(ctx, SP.body);
	speckle(ctx, rng, SP.bodyDark, 0.18);
	rect(ctx, 0, 2, TILE, 2, SP.bodyDark); // marca dorsal
	rect(ctx, 0, 12, TILE, 2, SP.bodyDark);
}
function drawSpiderHead(ctx, _rng) {
	fill(ctx, SP.bodyDark);
	rect(ctx, 4, 2, 8, 2, SP.body); // banda de ojos
	px(ctx, 5, 2, SP.eye); // racimo de ojos rojos
	px(ctx, 7, 2, SP.eyeHot);
	px(ctx, 9, 2, SP.eye);
	px(ctx, 11, 2, SP.eyeHot);
	px(ctx, 6, 4, SP.eye); // quelíceros
	px(ctx, 10, 4, SP.eye);
}

// --- WOLF: gris con orejas y hocico claro ---
const W = {
	fur: "#9a9a9a",
	furDark: "#767676",
	furLight: "#c0c0c0",
	muzzle: "#e0e0e0",
	nose: "#2a2a2a",
	eye: "#2a2a2a"
};
function drawWolfBody(ctx, rng) {
	fill(ctx, W.fur);
	speckle(ctx, rng, W.furDark, 0.18);
	speckle(ctx, rng, W.furLight, 0.08);
	rect(ctx, 0, 13, TILE, 3, W.furLight); // vientre claro
}
function drawWolfHead(ctx, rng) {
	fill(ctx, W.fur);
	speckle(ctx, rng, W.furDark, 0.1);
	rect(ctx, 2, 0, 2, 2, W.furDark); // orejas
	rect(ctx, 12, 0, 2, 2, W.furDark);
	px(ctx, 4, 3, W.eye); // ojos
	px(ctx, 11, 3, W.eye);
	rect(ctx, 5, 5, 6, 6, W.muzzle); // hocico claro
	rect(ctx, 7, 5, 2, 2, W.nose);
	px(ctx, 6, 7, W.nose);
	px(ctx, 9, 7, W.nose);
	rect(ctx, 6, 9, 4, 1, W.nose); // boca
}
function drawWolfLeg(ctx, rng) {
	fill(ctx, W.furDark);
	speckle(ctx, rng, W.fur, 0.2);
}

// --- COW: marrón con manchas blancas y hocico rosa ---
const CO = {
	body: "#6b4226",
	bodyDark: "#52301c",
	patch: "#f0ebe0",
	muzzle: "#e8a0a0",
	horn: "#d8cfa8",
	eye: "#141414"
};
function drawCowBody(ctx, rng) {
	fill(ctx, CO.body);
	speckle(ctx, rng, CO.bodyDark, 0.14);
	for (let i = 0; i < 5; i++) {
		// manchas blancas irregulares
		rect(
			ctx,
			Math.floor(rng() * 10),
			Math.floor(rng() * 11),
			3 + Math.floor(rng() * 3),
			2 + Math.floor(rng() * 2),
			CO.patch
		);
	}
}
function drawCowHead(ctx, rng) {
	fill(ctx, CO.body);
	speckle(ctx, rng, CO.bodyDark, 0.12);
	px(ctx, 1, 1, CO.horn); // cuernos
	px(ctx, 2, 1, CO.horn);
	px(ctx, 13, 1, CO.horn);
	px(ctx, 14, 1, CO.horn);
	px(ctx, 4, 3, CO.eye); // ojos
	px(ctx, 11, 3, CO.eye);
	rect(ctx, 5, 6, 6, 5, CO.muzzle); // hocico rosa
	px(ctx, 6, 7, CO.bodyDark);
	px(ctx, 9, 7, CO.bodyDark);
	rect(ctx, 6, 9, 4, 1, CO.bodyDark);
}
function drawCowLeg(ctx, rng) {
	fill(ctx, CO.bodyDark);
	speckle(ctx, rng, CO.body, 0.25);
}

// --- PIG: rosa con hocico oscuro y fosas ---
const P = {
	body: "#f0a8b8",
	bodyDark: "#d98a9e",
	bodyLight: "#f8c4d0",
	snout: "#d98a9e",
	eye: "#3a1a1a"
};
function drawPigBody(ctx, rng) {
	fill(ctx, P.body);
	speckle(ctx, rng, P.bodyDark, 0.1);
	speckle(ctx, rng, P.bodyLight, 0.12);
}
function drawPigHead(ctx, rng) {
	fill(ctx, P.body);
	speckle(ctx, rng, P.bodyDark, 0.08);
	px(ctx, 2, 1, P.bodyDark); // orejas
	px(ctx, 13, 1, P.bodyDark);
	px(ctx, 4, 3, P.eye); // ojos
	px(ctx, 11, 3, P.eye);
	rect(ctx, 5, 6, 6, 4, P.snout); // hocico ovalado
	rect(ctx, 6, 7, 2, 2, P.eye); // fosas
	rect(ctx, 9, 7, 2, 2, P.eye);
}
function drawPigLeg(ctx, rng) {
	fill(ctx, P.bodyDark);
	speckle(ctx, rng, P.body, 0.2);
}

// --- CHICKEN: crema con cresta roja y pico naranja ---
const CH = {
	body: "#f2e08a",
	bodyDark: "#d9c26a",
	bodyLight: "#f8f0b8",
	comb: "#c0392b",
	beak: "#e88a2a",
	eye: "#141414"
};
function drawChickenBody(ctx, rng) {
	fill(ctx, CH.body);
	speckle(ctx, rng, CH.bodyDark, 0.12);
	rect(ctx, 2, 6, 12, 4, CH.bodyLight); // ala
	rect(ctx, 2, 6, 12, 1, CH.bodyDark);
}
function drawChickenHead(ctx, rng) {
	fill(ctx, CH.body);
	speckle(ctx, rng, CH.bodyDark, 0.1);
	rect(ctx, 5, 0, 2, 2, CH.comb); // cresta
	rect(ctx, 9, 0, 2, 2, CH.comb);
	px(ctx, 7, 0, CH.comb);
	px(ctx, 8, 0, CH.comb);
	px(ctx, 5, 3, CH.eye); // ojo
	rect(ctx, 7, 3, 3, 2, CH.beak); // pico naranja
	px(ctx, 9, 4, CH.beak);
	px(ctx, 7, 5, CH.comb); // barbilla
	px(ctx, 8, 5, CH.comb);
}
function drawChickenLeg(ctx, rng) {
	fill(ctx, CH.beak);
	rect(ctx, 0, 13, TILE, 3, CH.bodyDark); // pie
	speckle(ctx, rng, CH.bodyDark, 0.2);
}

// --- SHEEP: lana blanca rizada, cara crema ---
const SH = {
	wool: "#f5f5f0",
	woolDark: "#d9d9d2",
	woolLight: "#ffffff",
	face: "#e8d8c0",
	ear: "#c9b89a",
	eye: "#2a2a2a"
};
function drawSheepBody(ctx, rng) {
	fill(ctx, SH.wool);
	speckle(ctx, rng, SH.woolDark, 0.22);
	speckle(ctx, rng, SH.woolLight, 0.12);
}
function drawSheepHead(ctx, rng) {
	fill(ctx, SH.face);
	speckle(ctx, rng, SH.ear, 0.1);
	rect(ctx, 1, 5, 2, 3, SH.ear); // orejas laterales
	rect(ctx, 13, 5, 2, 3, SH.ear);
	px(ctx, 5, 5, SH.eye); // ojos
	px(ctx, 10, 5, SH.eye);
	rect(ctx, 7, 8, 2, 1, SH.eye); // hocico
	rect(ctx, 6, 10, 4, 1, SH.ear);
}
function drawSheepLeg(ctx, rng) {
	fill(ctx, SH.woolDark);
	speckle(ctx, rng, SH.wool, 0.25);
}

// --- SLIME (Fase 12): gel verde con cara simple y brillo ---
const SL = {
	body: "#7ac74f",
	bodyDark: "#5aa23c",
	bodyLight: "#a0e070",
	face: "#1a1a1a"
};
function drawSlimeBody(ctx, rng) {
	fill(ctx, SL.body);
	speckle(ctx, rng, SL.bodyDark, 0.12);
	speckle(ctx, rng, SL.bodyLight, 0.1);
	rect(ctx, 0, 0, TILE, 2, SL.bodyLight); // brillo superior (gel)
	px(ctx, 4, 4, SL.face); // ojos
	px(ctx, 11, 4, SL.face);
	rect(ctx, 5, 9, 6, 1, SL.face); // boca
	rect(ctx, 6, 10, 4, 1, SL.face);
}

// --- OCELOTE (Fase 12): naranja atigrado con manchas oscuras ---
const OC = {
	fur: "#e8a03c",
	furDark: "#c08028",
	spot: "#5a3a1a",
	belly: "#f0d8a0",
	eye: "#1a1a1a",
	ear: "#8a5a20"
};
function drawOcelotBody(ctx, rng) {
	fill(ctx, OC.fur);
	speckle(ctx, rng, OC.furDark, 0.14);
	for (let i = 0; i < 6; i++) {
		px(ctx, 2 + Math.floor(rng() * 12), 2 + Math.floor(rng() * 12), OC.spot);
	}
	rect(ctx, 0, 12, TILE, 4, OC.belly); // vientre claro
}
function drawOcelotHead(ctx, rng) {
	fill(ctx, OC.fur);
	speckle(ctx, rng, OC.furDark, 0.1);
	rect(ctx, 1, 0, 3, 3, OC.spot); // orejas oscuras
	rect(ctx, 12, 0, 3, 3, OC.spot);
	px(ctx, 4, 4, OC.eye); // ojos
	px(ctx, 11, 4, OC.eye);
	px(ctx, 7, 6, OC.belly); // hocico claro
	px(ctx, 8, 6, OC.belly);
	px(ctx, 6, 8, OC.belly);
	px(ctx, 9, 8, OC.belly);
	px(ctx, 7, 8, OC.spot); // nariz
	px(ctx, 8, 8, OC.spot);
}
function drawOcelotTail(ctx, rng) {
	fill(ctx, OC.fur);
	speckle(ctx, rng, OC.furDark, 0.15);
	rect(ctx, 0, 0, TILE, 4, OC.spot); // punta oscura
}
function drawOcelotLeg(ctx, rng) {
	fill(ctx, OC.furDark);
	speckle(ctx, rng, OC.fur, 0.25);
	rect(ctx, 0, 13, TILE, 3, OC.belly); // pata clara
}

// --- GATO (Fase 12): gris tuxedo (negro con pecho blanco) ---
const CT = {
	fur: "#4a4a52",
	furDark: "#2e2e34",
	belly: "#f0f0ee",
	eye: "#e8d21a",
	ear: "#2e2e34"
};
function drawCatBody(ctx, rng) {
	fill(ctx, CT.fur);
	speckle(ctx, rng, CT.furDark, 0.16);
	rect(ctx, 0, 12, TILE, 4, CT.belly); // pecho/vientre blanco
}
function drawCatHead(ctx, rng) {
	fill(ctx, CT.fur);
	speckle(ctx, rng, CT.furDark, 0.1);
	rect(ctx, 1, 0, 3, 3, CT.ear); // orejas
	rect(ctx, 12, 0, 3, 3, CT.ear);
	px(ctx, 4, 4, CT.eye); // ojos amarillos
	px(ctx, 11, 4, CT.eye);
	px(ctx, 6, 7, CT.belly); // hocico blanco
	px(ctx, 7, 7, CT.belly);
	px(ctx, 8, 7, CT.belly);
	px(ctx, 9, 7, CT.belly);
	px(ctx, 7, 8, CT.eye); // nariz
	px(ctx, 8, 8, CT.eye);
}
function drawCatTail(ctx, rng) {
	fill(ctx, CT.fur);
	speckle(ctx, rng, CT.furDark, 0.15);
	rect(ctx, 0, 12, TILE, 4, CT.belly); // punta blanca
}
function drawCatLeg(ctx, rng) {
	fill(ctx, CT.furDark);
	speckle(ctx, rng, CT.fur, 0.2);
	rect(ctx, 0, 13, TILE, 3, CT.belly); // calcetines blancos
}

// --- AHOGADO (Fase 12): zombi acuático — piel azul-verde, harapos ---
const D = {
	skin: "#4a8f6f",
	skinDark: "#3a7058",
	eye: "#1a3a2a",
	shirt: "#2e4a3a",
	shirtDark: "#1f3328",
	pants: "#3a3a4a",
	pantsDark: "#2a2a38"
};
function drawDrownedHead(ctx, rng) {
	fill(ctx, D.skin);
	speckle(ctx, rng, D.skinDark, 0.12);
	rect(ctx, 3, 1, 10, 2, D.skinDark); // pelo de alga
	for (let i = 0; i < 4; i++)
		px(ctx, 2 + Math.floor(rng() * 12), 1, D.skinDark);
	rect(ctx, 4, 3, 2, 1, D.eye); // ojos hundidos
	rect(ctx, 10, 3, 2, 1, D.eye);
	rect(ctx, 5, 5, 6, 2, D.skinDark); // boca
}
function drawDrownedBody(ctx, rng) {
	fill(ctx, D.shirt);
	speckle(ctx, rng, D.shirtDark, 0.18);
	px(ctx, 2, 4, D.skin); // rasgones
	px(ctx, 13, 6, D.skin);
	px(ctx, 6, 11, D.skinDark);
}
function drawDrownedArm(ctx, rng) {
	fill(ctx, D.skin);
	speckle(ctx, rng, D.skinDark, 0.15);
	rect(ctx, 0, 0, TILE, 5, D.shirt); // manga
	speckle(ctx, rng, D.shirtDark, 0.15);
}
function drawDrownedLeg(ctx, rng) {
	fill(ctx, D.pants);
	speckle(ctx, rng, D.pantsDark, 0.2);
	rect(ctx, 0, 13, TILE, 3, D.skinDark); // pie
}

// --- CREAKING: humanoid de madera pálida con ojos brillantes (Fase 21.5 F2) ---
const CK = {
	wood: "#8a7a5a",
	woodDark: "#6a5a3a",
	woodLight: "#a89a7a",
	eye: "#ffee44",
	bark: "#5a4a3a"
};
function drawCreakingHead(ctx, rng) {
	fill(ctx, CK.wood);
	speckle(ctx, rng, CK.woodDark, 0.15);
	rect(ctx, 3, 2, 2, 2, CK.eye); // ojos brillantes
	rect(ctx, 11, 2, 2, 2, CK.eye);
	px(ctx, 7, 5, CK.bark); // nariz de corteza
	px(ctx, 8, 5, CK.bark);
	rect(ctx, 6, 7, 4, 2, CK.woodDark); // boca tallada
}
function drawCreakingBody(ctx, rng) {
	fill(ctx, CK.wood);
	speckle(ctx, rng, CK.woodDark, 0.18);
	speckle(ctx, rng, CK.woodLight, 0.08);
	rect(ctx, 3, 8, 4, 2, CK.bark); // ranuras de corteza
	rect(ctx, 9, 4, 3, 2, CK.bark);
}
function drawCreakingArm(ctx, rng) {
	fill(ctx, CK.woodDark);
	speckle(ctx, rng, CK.wood, 0.15);
}
function drawCreakingLeg(ctx, rng) {
	fill(ctx, CK.bark);
	speckle(ctx, rng, CK.woodDark, 0.12);
}

// --- RABBIT: crema con orejas largas ---
const R = {
	body: "#d9c8a8",
	bodyDark: "#b89a6e",
	bodyLight: "#eadfc4",
	ear: "#b89a6e",
	earIn: "#e8a0a0",
	nose: "#e88a8a",
	eye: "#2a2a2a"
};
function drawRabbitBody(ctx, rng) {
	fill(ctx, R.body);
	speckle(ctx, rng, R.bodyDark, 0.14);
	speckle(ctx, rng, R.bodyLight, 0.12);
}
function drawRabbitHead(ctx, rng) {
	fill(ctx, R.body);
	speckle(ctx, rng, R.bodyDark, 0.1);
	px(ctx, 4, 3, R.eye); // ojos
	px(ctx, 11, 3, R.eye);
	px(ctx, 7, 5, R.nose); // nariz rosa y boca
	px(ctx, 8, 5, R.nose);
	px(ctx, 7, 6, R.bodyDark);
	px(ctx, 8, 6, R.bodyDark);
	px(ctx, 6, 7, R.bodyDark);
	px(ctx, 9, 7, R.bodyDark);
}
function drawRabbitEar(ctx, _rng) {
	fill(ctx, R.ear);
	rect(ctx, 0, 2, TILE, 12, R.earIn); // interior rosado
}

// ============================================================
// MAPA DE TEXELAS POR TIPO: parte única → función de dibujo.
// El ORDEN define la columna en el atlas (0 = primera tesela).
// ============================================================
const MOB_TEXTURES = {
	zombie: {
		head: drawZombieHead,
		body: drawZombieBody,
		arm: drawZombieArm,
		leg: drawZombieLeg
	},
	creeper: {
		head: drawCreeperHead,
		body: drawCreeperBody,
		leg: drawCreeperLeg
	},
	skeleton: {
		head: drawSkeletonHead,
		body: drawSkeletonBody,
		arm: drawSkeletonArm,
		leg: drawSkeletonLeg
	},
	enderman: {
		head: drawEndermanHead,
		body: drawEndermanBody,
		arm: drawEndermanArm,
		leg: drawEndermanLeg
	},
	spider: { body: drawSpiderBody, head: drawSpiderHead },
	wolf: { body: drawWolfBody, head: drawWolfHead, leg: drawWolfLeg },
	cow: { body: drawCowBody, head: drawCowHead, leg: drawCowLeg },
	pig: { body: drawPigBody, head: drawPigHead, leg: drawPigLeg },
	chicken: {
		body: drawChickenBody,
		head: drawChickenHead,
		leg: drawChickenLeg
	},
	sheep: { body: drawSheepBody, head: drawSheepHead, leg: drawSheepLeg },
	rabbit: { body: drawRabbitBody, head: drawRabbitHead, ear: drawRabbitEar },
	// Fase 12 (Bloque A): mobs por bioma — slime (un cuerpo), ocelote y gato
	// (felinos con cola), ahogado (humanoide acuático).
	slime: { body: drawSlimeBody },
	ocelot: {
		body: drawOcelotBody,
		head: drawOcelotHead,
		tail: drawOcelotTail,
		leg: drawOcelotLeg
	},
	cat: {
		body: drawCatBody,
		head: drawCatHead,
		tail: drawCatTail,
		leg: drawCatLeg
	},
	drowned: {
		head: drawDrownedHead,
		body: drawDrownedBody,
		arm: drawDrownedArm,
		leg: drawDrownedLeg
	},
	creaking: {
		head: drawCreakingHead,
		body: drawCreakingBody,
		arm: drawCreakingArm,
		leg: drawCreakingLeg
	},
	// Fase 21.5 (D2): Bogged — esqueleto de pantano musgoso.
	bogged: {
		head: drawBoggedHead,
		body: drawBoggedBody,
		arm: drawBoggedArm,
		leg: drawBoggedLeg
	}
};

const atlasCache = new Map();

// Atlas de una fila: una tesela 16×16 por parte única del mob, en el orden
// de MOB_TEXTURES[type]. Se genera una sola vez y se cachea; devuelve null si
// el tipo es desconocido (el mesh cae a material de color plano).
export function getMobAtlas(type) {
	const recetas = MOB_TEXTURES[type];
	if (!recetas) return null;
	const cached = atlasCache.get(type);
	if (cached) return cached;
	const partNames = Object.keys(recetas);
	const canvas = document.createElement("canvas");
	canvas.width = partNames.length * TILE;
	canvas.height = TILE; // una sola fila
	const ctx = canvas.getContext("2d");
	partNames.forEach((part, i) => {
		const rng = mulberry32(
			0x9e3779b9 ^ (type.length * 7919) ^ (i * 2654435761)
		);
		ctx.save();
		ctx.translate(i * TILE, 0);
		recetas[part](ctx, rng);
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

// Rectángulos UV [u0, v0, u1, v1] de cada parte en el atlas de una fila
// (v0 abajo, v1 arriba, misma convención que textures.js). El layout es
// 1 columna por parte: u0 = i/N, u1 = (i+1)/N, v0 = 0, v1 = 1.
export function mobPartRects(type) {
	const recetas = MOB_TEXTURES[type];
	if (!recetas) return {};
	const partNames = Object.keys(recetas);
	const n = partNames.length;
	const out = {};
	partNames.forEach((part, i) => {
		out[part] = [i / n, 0, (i + 1) / n, 1];
	});
	return out;
}

// Tipos cubiertos por las texturas (lo audita tests/unit-sync.js contra
// MOB_COLORS del servidor: ambos deben cubrir el mismo universo de mobs).
export function mobTextureTypes() {
	return Object.keys(MOB_TEXTURES);
}
