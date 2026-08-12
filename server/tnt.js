"use strict";

// ============================================================
// TNT (Fase 10, D2): explosivo con cráter, knockback y reacciones en cadena.
// El servidor es la fuente de verdad: `ignite` programa una mecha, `tick`
// (bucle principal) avanza las mechas y `explode` hace el cráter con las
// MISMAS reglas que la explosión del creeper (NOT_MINEABLE, cofres con
// contenido intactos), daño a jugadores y encadena TNT vecinos.
// El broadcast de `tnt_explode`/`tnt_fuse` lo cablea server.js (hook, igual
// que el resto: evita ciclos de require con net).
// ============================================================
const state = require("./state.js");
const world = require("./world.js");
const { damagePlayer } = require("./players.js");
const {
	B,
	NOT_MINEABLE,
	TNT_FUSE_MS,
	TNT_RADIUS,
	TNT_DAMAGE
} = require("./constants.js");

// Mechas activas: "x,y,z" → ms restantes.
const fuses = new Map();

let broadcastHandler = null;
function setBroadcastHandler(fn) {
	broadcastHandler = fn;
}

// Enciende la mecha de un TNT (si el bloque es TNT). Devuelve true si se
// ignitó. La mecha es la entidad: el bloque sigue en el mundo hasta explotar.
function ignite(x, y, z) {
	if (world.getBlock(x, y, z) !== B.TNT) return false;
	fuses.set(`${x},${y},${z}`, TNT_FUSE_MS);
	if (broadcastHandler) broadcastHandler("tnt_fuse", { x, y, z });
	return true;
}

// Avanza las mechas (dtMs) desde el bucle principal; al agotarse explotan.
function tick(dtMs) {
	for (const [key, left] of fuses) {
		const next = left - dtMs;
		if (next <= 0) {
			fuses.delete(key);
			const [x, y, z] = key.split(",").map(Number);
			explode(x, y, z);
		} else {
			fuses.set(key, next);
		}
	}
}

function explode(x, y, z) {
	const bx = Math.floor(x),
		by = Math.floor(y),
		bz = Math.floor(z);
	world.setBlock(bx, by, bz, B.AIR); // el propio TNT desaparece
	// Cráter esférico: probabilidad de romper por distancia (menos lejos del
	// centro). Respeta NOT_MINEABLE (bedrock/agua/lava) y los cofres CON
	// contenido (su loot se perdería — no hay entidades de item en el suelo).
	for (let dx = -TNT_RADIUS; dx <= TNT_RADIUS; dx++) {
		for (let dy = -TNT_RADIUS; dy <= TNT_RADIUS; dy++) {
			for (let dz = -TNT_RADIUS; dz <= TNT_RADIUS; dz++) {
				const dist = Math.hypot(dx, dy, dz);
				if (dist > TNT_RADIUS) continue;
				const chance = 0.75 - dist * 0.13; // centro casi seguro, borde raro
				if (Math.random() > chance) continue;
				const wx = bx + dx,
					wy = by + dy,
					wz = bz + dz;
				const block = world.getBlock(wx, wy, wz);
				if (NOT_MINEABLE.has(block)) continue;
				if (block === B.CHEST) {
					const slots = state.chests.get(`${wx},${wy},${wz}`);
					if (slots?.some((s) => s)) continue;
					state.chests.delete(`${wx},${wy},${wz}`);
				}
				// C5 (REN-2): horno CON contenido se protege (su inventario se
				// perdería — no hay entidades de item); vacío se rompe y se
				// limpia su estado (sin entradas huérfanas en world.json).
				if (block === B.FURNACE) {
					const f = state.furnaces.get(`${wx},${wy},${wz}`);
					if (f && (f.inputItem || f.fuelItem || f.outputItem)) continue;
					state.furnaces.delete(`${wx},${wy},${wz}`);
				}
				// Reacción en cadena: otro TNT dentro del cráter se ignita.
				if (block === B.TNT) {
					ignite(wx, wy, wz);
					continue;
				}
				world.setBlock(wx, wy, wz, B.AIR);
			}
		}
	}
	// Daño a jugadores (decrece con la distancia; la armadura protege).
	for (const p of state.players.values()) {
		const dist = Math.hypot(p.x - bx, p.y - by, p.z - bz);
		if (dist < TNT_RADIUS + 2.5) {
			const dmg = Math.max(
				1,
				Math.round(TNT_DAMAGE * (1 - dist / (TNT_RADIUS + 2.5)))
			);
			damagePlayer(p, dmg, {
				source: "mob",
				meta: { mobType: "tnt", dist }
			});
		}
	}
	if (broadcastHandler)
		broadcastHandler("tnt_explode", {
			x: bx,
			y: by,
			z: bz,
			radius: TNT_RADIUS
		});
}

module.exports = { ignite, tick, explode, fuses, setBroadcastHandler };
