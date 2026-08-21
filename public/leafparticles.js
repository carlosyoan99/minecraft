// ============================================================
// PARTÍCULAS DE HOJAS CAYENDO — LÓGICA PURA (Fase 21.5, E4)
// Decide dónde/cuándo el cliente emite una hoja que cae bajo un
// árbol y con qué ritmo/física, respetando la opción "reducir
// movimiento" (F19.5 B4). Sin THREE, sin DOM ni chrono: recibe un
// `getBlock(wx, wy, wz)` y un `rand()` — testeable en Node como ESM.
// El render vive en particles.js (spawnLeaf/tickFallingLeaves).
// ============================================================

// Bloques de copa por los que caen hojas (IDs B compartidos cliente/servidor).
export const LEAF_BLOCKS = new Set([5, 29, 31, 42, 177]);

// Configuración de emisión según la opción de accesibilidad: con "reducir
// movimiento" el intervalo de muestreo se alarga ~7×, la probabilidad de
// emitir cae a menos de la mitad y la caída es más lenta y con menos vaivén.
export function leafParticleConfig(reduceMotion) {
	return reduceMotion
		? {
				sampleInterval: 0.8, // s entre muestreos de columna
				chance: 0.2, // prob. de emitir al encontrar copa
				fallSpeed: 0.45, // m/s de descenso
				swayAmp: 1.2, // balanceo lateral (bloques)
				swaySpeed: 1.8, // rad/s del vaivén
				ttlBase: 6 // s de vida máxima
			}
		: {
				sampleInterval: 0.12,
				chance: 0.35,
				fallSpeed: 0.55,
				swayAmp: 1.6,
				swaySpeed: 2.4,
				ttlBase: 4.5
			};
}

// Busca una columna con copa (hojas) dentro de un disco de radio `radius`
// alrededor de (x, z), escaneando de arriba abajo desde `py + scanUp` para
// hallar la hoja MÁS ALTA (la partícula debe salir del borde superior de la
// copa, como en Minecraft). Devuelve {x, y, z} (bloque de hoja) o null.
export function findLeafPoint(x, z, py, radius, getBlock, rand, scanUp = 32) {
	const a = rand() * Math.PI * 2;
	const r = Math.sqrt(rand()) * radius; // densidad uniforme en el disco
	const wx = floorN(x + Math.cos(a) * r);
	const wz = floorN(z + Math.sin(a) * r);
	for (let y = py + scanUp; y > py; y--) {
		if (LEAF_BLOCKS.has(getBlock(wx, y, wz))) return { x: wx, y, z: wz };
	}
	return null;
}

function floorN(v) {
	return Math.floor(v);
}
