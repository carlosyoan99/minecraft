// ============================================================
// INPUT: TECLADO (movimiento, hotbar, paneles) Y RATÓN (romper/colocar/atacar)
// ============================================================
import * as THREE from "three";
import { playBreak, playEat, playFeed, playPlace } from "./audio.js";
import { send } from "./connection.js";
import {
	ARMOR_ITEMS,
	BED,
	BREED_FOOD,
	FOOD_ITEMS,
	PLACEABLE_BLOCKS,
	WATER
} from "./constants.js";
import { toggleDebug } from "./debug.js";
import { mobMeshes } from "./mobs.js";
import { move } from "./player.js";
import { camera, controls, renderer } from "./scene.js";
import {
	closePanels,
	getHeldItem,
	getSelectedSlot,
	isChatFocused,
	openCraftingFromBlock,
	selectSlot,
	toggleChestUI,
	toggleFurnaceUI,
	toggleInventory
} from "./ui.js";
import { chunkMeshes, getClientBlock, hideCrack, showCrack } from "./world.js";

// ============================================================
// TECLADO
// ============================================================
document.addEventListener("keydown", (e) => {
	if (isChatFocused()) return;
	switch (e.code) {
		case "KeyW":
			move.forward = true;
			break;
		case "KeyS":
			move.back = true;
			break;
		case "KeyA":
			move.left = true;
			break;
		case "KeyD":
			move.right = true;
			break;
		case "Space":
			move.jump = true;
			break;
		case "Digit1":
		case "Digit2":
		case "Digit3":
		case "Digit4":
		case "Digit5":
		case "Digit6":
		case "Digit7":
		case "Digit8":
		case "Digit9": {
			const n = parseInt(e.code.replace("Digit", ""), 10) - 1;
			selectSlot(n);
			break;
		}
		case "KeyE":
			toggleInventory();
			break;
		case "Escape":
			closePanels();
			break;
		case "F3":
			// Fase 6: visualizador de chunks (bordes + caras) para depurar el culling
			e.preventDefault(); // evitar el buscador del navegador
			toggleDebug();
			break;
	}
});
document.addEventListener("keyup", (e) => {
	switch (e.code) {
		case "KeyW":
			move.forward = false;
			break;
		case "KeyS":
			move.back = false;
			break;
		case "KeyA":
			move.left = false;
			break;
		case "KeyD":
			move.right = false;
			break;
		case "Space":
			move.jump = false;
			break;
	}
});

// ============================================================
// RATÓN: ROMPER / COLOCAR / ATACAR
// ============================================================
const raycaster = new THREE.Raycaster();
raycaster.far = 7;

// Fase 6 (minería fina): mantener pulsado el clic izquierdo mina el bloque
// (el servidor avanza el progreso por dureza/velocidad de herramienta y
// envía block_break_progress para las grietas). Soltar, mirar a otro bloque
// o soltar el puntero cancela la mina.
let miningTarget = null; // {x,y,z} del bloque que se está minando

function startMiningAt(x, y, z) {
	const target = getClientBlock(x, y, z);
	// Mesa de crafteo/horno/cofre se abren con clic (no se minan así); el agua
	// no se rompe sin cubo (sin feedback falso). Bloques desconocidos (-1): no minar.
	if (
		target === 15 ||
		target === 16 ||
		target === 22 ||
		target === WATER ||
		target === -1
	)
		return false;
	miningTarget = { x, y, z };
	playBreak(target);
	showCrack(x, y, z);
	send("block_action", { action: "break", x, y, z });
	return true;
}

function stopMining() {
	if (!miningTarget) return;
	miningTarget = null;
	hideCrack();
	send("block_action", { action: "break_cancel" });
}
// Solo los pasivos se pueden alimentar (trigo/zanahoria/semillas); el
// conejo también come zanahorias (Fase 5)
const PASSIVE_MOBS = new Set(["cow", "pig", "chicken", "sheep", "rabbit"]);

function raycastTerrainAndMobs() {
	raycaster.setFromCamera({ x: 0, y: 0 }, camera);
	const terrainMeshes = [];
	for (const group of chunkMeshes.values())
		group.children.forEach((m) => {
			terrainMeshes.push(m);
		});
	const mobList = Array.from(mobMeshes.values());
	const hits = raycaster.intersectObjects(
		[...terrainMeshes, ...mobList],
		false
	);
	return hits[0] || null;
}

// Fase 8 (B10): mob más cercano a lo LARGO del rayo (proyección) que quede
// DELANTE del bloque apuntado (t < distTerreno) y con poca desviación lateral
// (<= 0.75 bloques). Así el clic golpea al mob solo cuando tapa al bloque —
// nunca al lado/detrás, lo que preserva la minería y evita golpear a través
// de paredes. Antes se buscaba por distancia euclidiana al punto de impacto
// (1.5 bloques): un mob junto al bloque que minabas te robaba el clic.
function nearestMobOnRay(ray, distTerreno) {
	const origin = ray.origin;
	const dir = ray.direction;
	let best = null,
		bestT = Infinity;
	for (const mesh of mobMeshes.values()) {
		const m = mesh.position;
		const t =
			(m.x - origin.x) * dir.x +
			(m.y - origin.y) * dir.y +
			(m.z - origin.z) * dir.z;
		if (t < 0 || t > distTerreno || t > raycaster.far) continue;
		const px = origin.x + dir.x * t;
		const py = origin.y + dir.y * t;
		const pz = origin.z + dir.z * t;
		const lateral = Math.hypot(m.x - px, m.y - py, m.z - pz);
		if (lateral <= 0.75 && t < bestT) {
			bestT = t;
			best = mesh.userData;
		}
	}
	return best && best.mobId ? { id: best.mobId, type: best.mobType } : null;
}

renderer.domElement.addEventListener("mousedown", (e) => {
	if (!controls.isLocked) return;

	const held = getHeldItem();
	const hit = raycastTerrainAndMobs();

	// Fase 8 (B10): tolerancia de apuntado — si el rayo golpea el terreno (o el
	// vacío) pero hay un mob DELANTE (proyección sobre el rayo, desviación
	// lateral <= 0.75) en vez de caer exactamente dentro de su caja, el clic
	// golpea al mob (antes solo acertaba si el rayo tocaba la caja; con el mob
	// de pie junto a un bloque o moviéndose, el terreno ganaba).
	const hitMob =
		hit?.object.userData.mobId ||
		nearestMobOnRay(raycaster.ray, hit ? hit.distance : raycaster.far);

	// Alimentar animales: clic derecho sobre un animal pasivo con su comida de
	// cría (trigo → vaca/oveja, zanahoria → cerdo, semillas → pollo); izquierdo ataca.
	if (hitMob) {
		stopMining(); // clicar un mob cancela cualquier mina en curso
		if (e.button === 0) {
			send("attack_mob", { mobId: hitMob.id });
		} else if (
			e.button === 2 &&
			held &&
			BREED_FOOD.has(held.id) &&
			PASSIVE_MOBS.has(hitMob.type)
		) {
			playFeed();
			send("feed_mob", { mobId: hitMob.id });
		}
		return;
	}

	// Comer con clic derecho: si llevas comida en la mano, se come sin
	// necesidad de apuntar a un bloque (como en Minecraft).
	if (e.button === 2 && held && FOOD_ITEMS.has(held.id)) {
		playEat();
		send("eat", {});
		return;
	}

	// Fase 7: equipar armadura con clic derecho (la pieza en mano va a su
	// slot; la que hubiera vuelve al inventario). Sin necesidad de apuntar.
	if (e.button === 2 && held && ARMOR_ITEMS.has(held.id)) {
		send("equip_armor", { inventorySlot: getSelectedSlot() });
		return;
	}

	if (!hit) return;

	const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
	const x = Math.floor(point.x),
		y = Math.floor(point.y),
		z = Math.floor(point.z);

	if (e.button === 0) {
		const target = getClientBlock(x, y, z);
		if (target === 16) {
			toggleFurnaceUI(true, { x, y, z });
			return;
		}
		if (target === 15) {
			openCraftingFromBlock();
			return;
		}
		if (target === 22) {
			toggleChestUI(true, { x, y, z });
			return;
		}
		startMiningAt(x, y, z); // mantener pulsado = minar (agua/mesa/horno/cofre → false)
	} else if (e.button === 2) {
		// Fase 7: clic derecho en una cama = dormir (de noche salta al amanecer
		// y fija el punto de reaparición; de día el servidor lo rechaza).
		if (getClientBlock(x, y, z) === BED) {
			send("sleep", { x, y, z });
			return;
		}
		const nx = x + Math.round(hit.face.normal.x);
		const ny = y + Math.round(hit.face.normal.y);
		const nz = z + Math.round(hit.face.normal.z);
		const held = getHeldItem();
		if (held && PLACEABLE_BLOCKS.has(held.id)) {
			playPlace(held.id);
			send("block_action", {
				action: "place",
				x: nx,
				y: ny,
				z: nz,
				itemId: held.id
			});
		}
	}
});
// Soltar el clic izquierdo cancela la mina (como Minecraft).
renderer.domElement.addEventListener("mouseup", (e) => {
	if (e.button === 0) stopMining();
});

// Mientras se mantiene pulsado: si el jugador mira a otro bloque, la mina se
// retargetea (cancelar la anterior + empezar la nueva); si mira al vacío o a
// un mob, se cancela.
renderer.domElement.addEventListener("pointermove", () => {
	if (!miningTarget || !controls.isLocked) return;
	const hit = raycastTerrainAndMobs();
	if (!hit || hit.object.userData.mobId) {
		stopMining();
		return;
	}
	const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
	const x = Math.floor(point.x),
		y = Math.floor(point.y),
		z = Math.floor(point.z);
	if (x === miningTarget.x && y === miningTarget.y && z === miningTarget.z)
		return;
	stopMining();
	startMiningAt(x, y, z);
});

// Si se pierde el pointer lock (Escape/menú), cancelar la mina también.
document.addEventListener("pointerlockchange", () => {
	if (!document.pointerLockElement) stopMining();
});

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
