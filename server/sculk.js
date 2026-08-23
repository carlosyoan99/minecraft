// @ts-check
"use strict";

// ============================================================
// SCULK / DEEP DARK (Fase 22, C1)
// Propagación básica estilo Minecraft: cuando un mob muere SOBRE un bloque
// de sculk, los bloques de "tierra" circundantes (radio 2) se convierten
// en sculk. Sin Warden, sin shriekers, sin ciudad antigua y sin crecimiento
// autónomo en el tiempo (Won't de la fase — solo el gatillo de muerte).
//
// Diseño:
//   · `conversionesSculk(getBlockFn, sx, sy, sz)` es PURA y determinista:
//     devuelve la lista de celdas a convertir (Chebyshev radio 2, excluida
//     la central) cuyo bloque es convertible. unit-fase22 la fija.
//   · `onMobDeath(mob)` es el gancho de runtime: si el mob murió sobre
//     sculk, aplica las conversiones con world.setBlock (que marca el chunk
//     sucio y dispara blockChangeHandler → broadcast block_update a los
//     clientes). Módulo HOJA: no requiere net/actions (sin ciclos).
// ============================================================
const constants = require("./constants.js");
const { B } = constants;
/** @type {any} — World prototype methods added dynamically (not inferred by tsc) */
const world = require("./world.js");

// Bloques que el sculk puede "devorar": tierra/césped y piedra profunda
// (el hábitat natural del Deep Dark). No convierte menas, madera, cofres,
// bedrock ni bloques colocados por jugadores fuera de esta lista.
const CONVERTIBLES = new Set([
	B.DIRT,
	B.GRASS,
	B.STONE,
	B.DEEPSLATE,
	B.SAND,
	B.GRAVEL
]);

const RADIO_PROPAGACION = 2; // spec C1: radio 2 (cubo Chebyshev 5×5×5)

// Devuelve las celdas a convertir alrededor de (sx, sy, sz), EXCLUYENDO el
// centro. Orden determinista: dy → dz → dx (los tests lo fijan).
function conversionesSculk(getBlockFn, sx, sy, sz) {
	const cambios = [];
	for (let dy = -RADIO_PROPAGACION; dy <= RADIO_PROPAGACION; dy++) {
		for (let dz = -RADIO_PROPAGACION; dz <= RADIO_PROPAGACION; dz++) {
			for (let dx = -RADIO_PROPAGACION; dx <= RADIO_PROPAGACION; dx++) {
				if (dx === 0 && dy === 0 && dz === 0) continue;
				const x = sx + dx,
					y = sy + dy,
					z = sz + dz;
				if (CONVERTIBLES.has(getBlockFn(x, y, z))) cambios.push({ x, y, z });
			}
		}
	}
	return cambios;
}

// Gancho llamado desde los puntos de muerte de mobs (attack_mob y
// proyectiles hoy). Si el bloque bajo los pies del mob es sculk, propaga.
// Devuelve el número de bloques convertidos (0 si no procede) — los tests
// lo asertan; el runtime ignora el valor.
function onMobDeath(mob) {
	if (!mob || !Number.isFinite(mob.x) || !Number.isFinite(mob.y)) return 0;
	const sx = Math.floor(mob.x);
	// El bloque "sobre el que murió" es el que hay justo debajo de los pies.
	const sy = Math.floor(mob.y - 0.1);
	const sz = Math.floor(mob.z);
	let getBlock;
	try {
		getBlock = world.getBlock(sx, sy, sz);
	} catch {
		return 0; // mundo no inicializado (tests unitarios sin chunks): noop
	}
	if (getBlock !== B.SCULK && getBlock !== B.SCULK_VEIN) return 0;
	const cambios = conversionesSculk(
		(x, y, z) => world.getBlock(x, y, z),
		sx,
		sy,
		sz
	);
	for (const c of cambios) world.setBlock(c.x, c.y, c.z, B.SCULK);
	return cambios.length;
}

module.exports = {
	conversionesSculk,
	onMobDeath,
	RADIO_PROPAGACION,
	CONVERTIBLES
};
