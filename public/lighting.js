// ============================================================
// ILUMINACIÓN POR BLOQUE (Fase 6: antorchas)
// Luz de antorcha por celda, además de la luz global del ciclo
// día/noche. El cliente la hornea en colores por vértice de la
// geometría del terreno (método tipo Minecraft: la luz de bloque
// importa cuando la luz de cielo es baja, es decir de noche).
//
// Módulo PURAMENTE lógico (sin three ni imports): el render
// (world.js) le pasa las posiciones de antorchas conocidas y una
// función de lectura de bloques, y recibe un Float32Array (0..1)
// con la luz por celda del chunk. Así es testeable en Node igual
// que lod.js / geopool.js.
//
// IDs de bloques locales (sincronizar con constants.js): el aire
// (0), el agua (20) y otra antorcha (23) dejan pasar la luz; el
// resto (piedra, tierra, madera...) la bloquean.
// ============================================================

export const LIGHT_RADIUS = 7; // alcance de una antorcha en bloques (nivel 14 MC)
// Fase 22.3 (L1): la linterna es nivel 15 en MC (un paso más que la
// antorcha) → un bloque más de alcance en este motor simplificado.
export const LANTERN_LIGHT_RADIUS = 8;
export const MAX_LIGHT_RADIUS = LANTERN_LIGHT_RADIUS; // margen de rebake/consultas
export const LIGHT_ATTEN = 0.8; // atenuación por paso (como el light engine de MC)
export const LIGHT_MIN = 0.03; // por debajo de esto se deja de propagar
const AIR = 0,
	WATER = 20,
	TORCH = 23,
	// Fase 21.5 (B2): la linterna emite luz como la antorcha y también la
	// deja pasar (no bloquea la propagación de su propia luz ni la ajena).
	LANTERN = 79;

// Fase 22.3 (L1): radio efectivo de una fuente. Las entradas del torchSet
// son [wx, wy, wz, blockId] (el id llegó con la F22.3); las listas antiguas
// de 3 elementos (tests) se tratan como antorchas.
export function sourceRadius(t) {
	return t[3] === LANTERN ? LANTERN_LIGHT_RADIUS : LIGHT_RADIUS;
}

// ¿El bloque deja pasar la luz de antorcha? (aire, agua, antorcha y
// linterna sí).
export function isLightPassable(block) {
	return (
		block === AIR || block === WATER || block === TORCH || block === LANTERN
	);
}

// Empuja luz desde una antorcha al array del chunk (BFS 6-direccional con
// atenuación). La BFS corre en una caja local (2R+1)³ alrededor de la
// antorcha para no tocar el mundo; solo las celdas que caen dentro de este
// chunk se escriben en `out`. `blockAt(wx, wy, wz)` lee el bloque en
// coordenadas de MUNDO (cruza los bordes del chunk sin problema).
// Reutiliza un scratch de módulo (la caja es pequeña) para no alocar por
// antorcha en cada horneado.
// Fase 22.3 (L1): la caja se dimensiona para el radio máximo (linterna 8);
// cada fuente usa su sub-caja efectiva de radio R.
const S = 2 * MAX_LIGHT_RADIUS + 1; // 17
const BOX = S * S * S; // 4913 celdas
const DIRS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];
const scratch = new Float32Array(BOX);

function floodInto(
	out,
	chunkSize,
	worldHeight,
	worldMinY,
	x0,
	z0,
	tx,
	ty,
	tz,
	blockAt,
	R
) {
	scratch.fill(0);
	const center = R * S * S + R * S + R;
	scratch[center] = 1;
	const queue = [center]; // cola dinámica: una celda puede encolarse varias veces
	let head = 0;
	while (head < queue.length) {
		const i = queue[head++];
		const l = scratch[i];
		const lx = i % S,
			ly = Math.floor(i / S) % S,
			lz = Math.floor(i / (S * S));
		const wx = tx + lx - R,
			wy = ty + ly - R,
			wz = tz + lz - R;
		const nl = l * LIGHT_ATTEN;
		if (nl < LIGHT_MIN) continue;
		for (const [dx, dy, dz] of DIRS) {
			const nlx = lx + dx,
				nly = ly + dy,
				nlz = lz + dz;
			// Fase 22.3 (L1): la BFS se acota al sub-cubo del radio efectivo R
			// ([0..2R] con paso S); antes el límite era la caja global (que era
			// exactamente 2·LIGHT_RADIUS+1 y bastaba).
			if (
				nlx < 0 ||
				nlx > 2 * R ||
				nly < 0 ||
				nly > 2 * R ||
				nlz < 0 ||
				nlz > 2 * R
			)
				continue;
			// El bloque que OCUPA la celda vecina bloquea la luz (sólidos).
			if (!isLightPassable(blockAt(wx + dx, wy + dy, wz + dz))) continue;
			const ni = nlz * S * S + nly * S + nlx;
			if (scratch[ni] >= nl) continue;
			scratch[ni] = nl;
			queue.push(ni);
		}
	}
	// Escribir a `out` solo las celdas de la caja que caen dentro de este chunk.
	const minX = Math.max(tx - R, x0),
		maxX = Math.min(tx + R, x0 + chunkSize - 1);
	const minZ = Math.max(tz - R, z0),
		maxZ = Math.min(tz + R, z0 + chunkSize - 1);
	for (let wz = minZ; wz <= maxZ; wz++) {
		const lz = wz - (tz - R);
		// Fase 15 (D5): las Y de mundo van de worldMinY (−64) arriba; el índice
		// del chunk usa local y = mundo y − worldMinY (0..127).
		for (
			let wy = Math.max(worldMinY, ty - R);
			wy <= Math.min(worldMinY + worldHeight - 1, ty + R);
			wy++
		) {
			const ly = wy - (ty - R);
			for (let wx = minX; wx <= maxX; wx++) {
				const lx = wx - (tx - LIGHT_RADIUS);
				const v = scratch[lz * S * S + ly * S + lx];
				if (v <= 0) continue;
				const x = wx - x0,
					z = wz - z0;
				const idx = ((wy - worldMinY) * chunkSize + z) * chunkSize + x;
				if (v > out[idx]) out[idx] = v;
			}
		}
	}
}

// Calcula la luz de antorcha (0..1 por celda) de un chunk. `torches` es un
// iterable de [wx, wy, wz] (posiciones de antorchas conocidas; solo las que
// caen en la caja de radio alrededor del chunk hacen trabajo). Devuelve el
// Float32Array del chunk (16*64*16 = 16384 celdas).
export function computeChunkLight(
	cx,
	cz,
	chunkSize,
	worldHeight,
	worldMinY,
	blockAt,
	torches
) {
	const x0 = cx * chunkSize,
		z0 = cz * chunkSize;
	const out = new Float32Array(chunkSize * worldHeight * chunkSize);
	for (const t of torches) {
		const tx = t[0],
			ty = t[1],
			tz = t[2];
		// Fase 22.3 (L1): radio por tipo de fuente (antorcha 7, linterna 8).
		const R = sourceRadius(t);
		if (tx < x0 - R || tx > x0 + chunkSize - 1 + R) continue;
		if (tz < z0 - R || tz > z0 + chunkSize - 1 + R) continue;
		floodInto(
			out,
			chunkSize,
			worldHeight,
			worldMinY,
			x0,
			z0,
			tx,
			ty,
			tz,
			blockAt,
			R
		);
	}
	return out;
}
