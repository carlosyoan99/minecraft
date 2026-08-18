"use strict";

// ============================================================
// PESCA (Fase 21.5, A1/A8)
// La caña lanza una entidad ligera (bobber) con la MISMA física que los
// proyectiles (server/projectiles.js): vuela hacia donde mira el jugador y
// se detiene al impactar. Si aterriza en agua espera un tiempo aleatorio
// (1.5-5 s) y "pica" (biting); al recogerla se entrega un ítem de la tabla
// de loot de pesca (pescado/tesoro/basura) y se desgasta la caña SOLO
// entonces. Si aterriza fuera de agua no pica, y recogerla antes de picar
// devuelve la caña sin gastar durabilidad (como Minecraft).
// Módulo HOJA: requiere players/state/world/constants (ninguno lo requiere),
// así que no hay ciclos de require. El broadcast de bobbers viaja en el
// mismo `arrows_update` del bucle principal (timers.js) con kind "bobber".
// ============================================================
const { I, B, EYE_HEIGHT, isSolidBlock } = require("./constants.js");
const state = require("./state.js");
const world = require("./world.js");
const { addToInventory, applyFishingWear } = require("./players.js");

const FISHING_SPEED = 12; // bloques/s (más lento que la flecha 14)
const FISHING_GRAVITY = 16; // bloques/s² (la misma que las flechas)
const FISHING_LIFE_MS = 15000; // la línea se retira sola si no se recoge
const BITE_MIN_MS = 1500; // pica entre 1.5 y 5 s tras aterrizar en agua
const BITE_RANGE_MS = 3500;

// ============================================================
// TABLA DE LOOT DE PESCA (aproximación 1.7/1.13 sin encantamientos ni ítems
// nuevos): pescado 85 %, tesoro 5 %, basura 10 % (pesos relativos MC). Solo
// ítems que ya existen (COD/COOKED_COD son comida de Fase 4; BOW/COMPASS de
// Fase 13; STICK/STRING/FEATHER/BONE/FLINT materiales) — así unit-sync y
// unit-itemicons siguen en verde sin tocar el universo B/I.
// ============================================================
const FISHING_LOOT = {
	fish: [
		{ id: I.COD, weight: 60 },
		{ id: I.COOKED_COD, weight: 25 }
	],
	treasure: [
		{ id: I.BOW, weight: 1 },
		{ id: I.COMPASS, weight: 1 },
		{ id: I.FLINT, weight: 1 }
	],
	junk: [
		{ id: I.STICK, weight: 20 },
		{ id: I.STRING, weight: 15 },
		{ id: I.FEATHER, weight: 10 },
		{ id: I.BONE, weight: 8 }
	]
};
const LOOT_CATEGORY_WEIGHTS = { fish: 85, treasure: 5, junk: 10 };

function getPlayerBobber(playerId) {
	return state.bobbers.find((b) => b.playerId === playerId);
}

// Lanza la línea hacia donde mira el jugador. Devuelve true si se lanzó.
function castFishingLine(player) {
	if (getPlayerBobber(player.id)) return false; // una línea por jugador
	const held = player.inventory?.[player.selectedSlot || 0];
	if (!held || held.id !== I.FISHING_ROD) return false;
	const yaw = player.yaw || 0;
	const pitch = player.pitch || 0;
	const cp = Math.cos(pitch);
	state.bobbers.push({
		x: player.x,
		y: player.y + EYE_HEIGHT,
		z: player.z,
		vx: -Math.sin(yaw) * cp * FISHING_SPEED,
		vy: Math.sin(pitch) * FISHING_SPEED,
		vz: -Math.cos(yaw) * cp * FISHING_SPEED,
		life: FISHING_LIFE_MS,
		playerId: player.id,
		inWater: false,
		biting: false,
		biteAt: 0
	});
	return true;
}

// Recoge la línea. Devuelve { caught, broke }: caught es el ítem capturado
// (o null si se recogió sin picar) y broke indica si la caña se rompió al
// recoger una captura. Si el inventario no tiene hueco NO se entrega ni se
// desgasta (la línea se devuelve y el jugador libera hueco).
function reelBobber(player) {
	const idx = state.bobbers.findIndex((b) => b.playerId === player.id);
	if (idx === -1) return { caught: null, broke: false };
	const b = state.bobbers[idx];
	state.bobbers.splice(idx, 1);
	if (!b.biting) return { caught: null, broke: false };
	const item = rollLootItem();
	if (!addToInventory(player, item.id, item.count)) {
		return { caught: null, broke: false };
	}
	const broke = applyFishingWear(player);
	return { caught: item, broke };
}

// Selecciona categoría (pescado/tesoro/basura) y ítem de la tabla por peso.
function rollLootItem() {
	const catTotal = LOOT_CATEGORY_WEIGHTS.fish + LOOT_CATEGORY_WEIGHTS.treasure + LOOT_CATEGORY_WEIGHTS.junk;
	let r = Math.random() * catTotal;
	let category = "fish";
	for (const [cat, w] of Object.entries(LOOT_CATEGORY_WEIGHTS)) {
		if (r < w) {
			category = cat;
			break;
		}
		r -= w;
	}
	const table = FISHING_LOOT[category];
	const tableTotal = table.reduce((s, e) => s + e.weight, 0);
	let t = Math.random() * tableTotal;
	for (const e of table) {
		if (t < e.weight) return { id: e.id, count: 1, category };
		t -= e.weight;
	}
	return { id: table[0].id, count: 1, category };
}

// Avanza los bobbers (dtMs): física de gravedad, aterrizaje en agua/suelo y
// el momento de picar. Devuelve los bobbers vivos para el broadcast.
function tickBobbers(dtMs) {
	const dt = dtMs / 1000;
	const alive = [];
	for (const b of state.bobbers) {
		b.life -= dtMs;
		if (b.life <= 0) continue; // expira: la caña sigue en la mano
		// Ya asentado en agua: comprobar si ha picado.
		if (b.inWater) {
			if (Date.now() >= b.biteAt) b.biting = true;
			alive.push(b);
			continue;
		}
		const px = b.x,
			py = b.y,
			pz = b.z;
		b.vy -= FISHING_GRAVITY * dt;
		b.x += b.vx * dt;
		b.y += b.vy * dt;
		b.z += b.vz * dt;
		// Barrido anti-tunneling del segmento recorrido (mismo patrón que
		// tickArrows, pasos de 0.25 bloques). Para x/z se usa ROUND y no FLOOR:
		// el anzuelo lanzado (p. ej. en picado vertical) arrastra un residuo de
		// punto flotante en el eje horizontal (vz ≈ -7e-16), y floor(-1e-16) = -1
		// haría que el sweep leyera la celda vecina (aire) y la línea cayera a
		// través del agua. Y sigue con floor: la celda del suelo es [floor, +1).
		let stopped = false;
		const dx = b.x - px,
			dy = b.y - py,
			dz = b.z - pz;
		const dist = Math.hypot(dx, dy, dz) || 0.0001;
		const steps = Math.max(1, Math.ceil(dist / 0.25));
		for (let s = 1; s <= steps && !stopped; s++) {
			const t = s / steps;
			const bx = Math.round(px + dx * t);
			const by = Math.floor(py + dy * t);
			const bz = Math.round(pz + dz * t);
			const block = world.getBlock(bx, by, bz);
			if (block === B.WATER) {
				// Aterriza en el agua: se queda flotando y programa el picoteo.
				stopped = true;
				b.inWater = true;
				b.x = bx + 0.5;
				b.y = by + 0.5;
				b.z = bz + 0.5;
				b.vx = b.vy = b.vz = 0;
				b.biteAt = Date.now() + BITE_MIN_MS + Math.random() * BITE_RANGE_MS;
			} else if (isSolidBlock(block)) {
				// Fuera de agua (tierra/piedra/...): no pica nunca.
				stopped = true;
				b.vx = b.vy = b.vz = 0;
				b.biteAt = 0;
			}
		}
		// El bobber PERMANECE en el estado aunque esté parado (flotando en el
		// agua o en el suelo): solo desaparece al recogerlo (reelBobber) o al
		// expirar (life ≤ 0, ya descartado arriba). Si dejara de empujarse al
		// pararse, el cliente lo vería desaparecer en el primer broadcast.
		alive.push(b);
	}
	state.bobbers = alive;
	return alive;
}

// Quita las líneas del jugador (desconexión/muerte).
function removePlayerBobbers(playerId) {
	state.bobbers = state.bobbers.filter((b) => b.playerId !== playerId);
}

// Snapshot para el broadcast (misma forma que arrowSnapshot + kind/bit).
// playerId da al cliente un id MSTABLE (el de posición tiembla con cada
// broadcast mientras el anzuelo está volando).
function bobberSnapshot(b) {
	return {
		x: b.x,
		y: b.y,
		z: b.z,
		vx: b.vx,
		vy: b.vy,
		vz: b.vz,
		kind: "bobber",
		biting: b.biting,
		playerId: b.playerId
	};
}

module.exports = {
	FISHING_SPEED,
	FISHING_LIFE_MS,
	BITE_MIN_MS,
	BITE_RANGE_MS,
	FISHING_LOOT,
	LOOT_CATEGORY_WEIGHTS,
	getPlayerBobber,
	castFishingLine,
	reelBobber,
	rollLootItem,
	tickBobbers,
	removePlayerBobbers,
	bobberSnapshot
};
