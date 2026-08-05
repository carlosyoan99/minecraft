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

export const LIGHT_RADIUS = 7; // alcance de una antorcha en bloques
export const LIGHT_ATTEN = 0.8; // atenuación por paso (como el light engine de MC)
export const LIGHT_MIN = 0.03; // por debajo de esto se deja de propagar
const AIR = 0,
	WATER = 20,
	TORCH = 23;

// ¿El bloque deja pasar la luz de antorcha? (aire, agua y antorcha sí).
export function isLightPassable(block) {
	return block === AIR || block === WATER || block === TORCH;
}

// Empuja luz desde una antorcha al array del chunk (BFS 6-direccional con
// atenuación). La BFS corre en una caja local (2R+1)³ alrededor de la
// antorcha para no tocar el mundo; solo las celdas que caen dentro de este
// chunk se escriben en `out`. `blockAt(wx, wy, wz)` lee el bloque en
// coordenadas de MUNDO (cruza los bordes del chunk sin problema).
// Reutiliza un scratch de módulo (la caja es pequeña) para no alocar por
// antorcha en cada horneado.
const S = 2 * LIGHT_RADIUS + 1; // 15
const BOX = S * S * S; // 3375 celdas
const DIRS = [
	[1, 0, 0],
	[-1, 0, 0],
	[0, 1, 0],
	[0, -1, 0],
	[0, 0, 1],
	[0, 0, -1]
];
const scratch = new Float32Array(BOX);

function floodInto(out, chunkSize, worldHeight, x0, z0, tx, ty, tz, blockAt) {
	scratch.fill(0);
	const center = LIGHT_RADIUS * S * S + LIGHT_RADIUS * S + LIGHT_RADIUS;
	scratch[center] = 1;
	const queue = [center]; // cola dinámica: una celda puede encolarse varias veces
	let head = 0;
	while (head < queue.length) {
		const i = queue[head++];
		const l = scratch[i];
		const lx = i % S,
			ly = Math.floor(i / S) % S,
			lz = Math.floor(i / (S * S));
		const wx = tx + lx - LIGHT_RADIUS,
			wy = ty + ly - LIGHT_RADIUS,
			wz = tz + lz - LIGHT_RADIUS;
		const nl = l * LIGHT_ATTEN;
		if (nl < LIGHT_MIN) continue;
		for (const [dx, dy, dz] of DIRS) {
			const nlx = lx + dx,
				nly = ly + dy,
				nlz = lz + dz;
			if (nlx < 0 || nlx >= S || nly < 0 || nly >= S || nlz < 0 || nlz >= S)
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
	const minX = Math.max(tx - LIGHT_RADIUS, x0),
		maxX = Math.min(tx + LIGHT_RADIUS, x0 + chunkSize - 1);
	const minZ = Math.max(tz - LIGHT_RADIUS, z0),
		maxZ = Math.min(tz + LIGHT_RADIUS, z0 + chunkSize - 1);
	for (let wz = minZ; wz <= maxZ; wz++) {
		const lz = wz - (tz - LIGHT_RADIUS);
		for (
			let wy = Math.max(0, ty - LIGHT_RADIUS);
			wy <= Math.min(worldHeight - 1, ty + LIGHT_RADIUS);
			wy++
		) {
			const ly = wy - (ty - LIGHT_RADIUS);
			for (let wx = minX; wx <= maxX; wx++) {
				const lx = wx - (tx - LIGHT_RADIUS);
				const v = scratch[lz * S * S + ly * S + lx];
				if (v <= 0) continue;
				const x = wx - x0,
					z = wz - z0;
				const idx = (wy * chunkSize + z) * chunkSize + x;
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
		if (tx < x0 - LIGHT_RADIUS || tx > x0 + chunkSize - 1 + LIGHT_RADIUS)
			continue;
		if (tz < z0 - LIGHT_RADIUS || tz > z0 + chunkSize - 1 + LIGHT_RADIUS)
			continue;
		floodInto(out, chunkSize, worldHeight, x0, z0, tx, ty, tz, blockAt);
	}
	return out;
}
