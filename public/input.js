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
	FARMLAND,
	FOOD_ITEMS,
	HOES,
	PLACEABLE_BLOCKS,
	TNT,
	WATER
} from "./constants.js";
import { toggleDebug } from "./debug.js";
import { mobMeshes } from "./mobs.js";
import { isFlying, move, setFlying } from "./player.js";
import { camera, controls, renderer, scene } from "./scene.js";
import {
	closePanels,
	getHeldItem,
	getSelectedSlot,
	isTyping,
	openCraftingFromBlock,
	selectSlot,
	toggleChestUI,
	toggleFurnaceUI,
	toggleInventory,
	togglePicker,
	toggleRecipeBook,
	getGamemode as uiGamemode
} from "./ui.js";
import {
	chunkMeshes,
	getClientBlock,
	hideCrack,
	lodMeshes,
	showCrack
} from "./world.js";

// ============================================================
// TECLADO
// ============================================================
// B5 (Fase 8): con un input enfocado (chat, nombre de jugador/mundo, semilla)
// las teclas de juego se ignoran — antes solo se miraba el chat, así que la E
// abría el inventario al escribir el nombre.
document.addEventListener("keydown", (e) => {
	if (isTyping()) return;
	switch (e.code) {
		case "KeyW":
			// Fase 10 (D3): sprint estilo MC — doble-tap W activa correr. Se
			// apaga al soltar W o con otro doble-tap (el keyup lo desactiva).
			move.forward = true;
			if (performance.now() - lastWPress < 300) move.sprint = true;
			lastWPress = performance.now();
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
		case "ShiftLeft":
		case "ShiftRight":
			// Fase 9 (Bloque C): en el vuelo creativo, Shift baja (como en MC).
			move.sneak = true;
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
			// Fase 10 (D4): en creative la E abre el picker de bloques (catálogo
			// completo); en survival abre el inventario/crafteo como siempre.
			if (uiGamemode() === "creative") togglePicker();
			else toggleInventory();
			break;
		case "KeyB":
			// Fase 9 (Bloque F): libro de recetas (todas visibles por categorías)
			toggleRecipeBook();
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
			move.sprint = false; // Fase 10 (D3): soltar W corta el sprint
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
		case "ShiftLeft":
		case "ShiftRight":
			move.sneak = false;
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
	) {
		const last = miningTrace[miningTrace.length - 1];
		if (last) Object.assign(last, { target, refused: true });
		return false;
	}
	miningTarget = { x, y, z };
	playBreak(target);
	showCrack(x, y, z);
	send("block_action", { action: "break", x, y, z });
	const last = miningTrace[miningTrace.length - 1];
	if (last) Object.assign(last, { target, sent: true });
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

// ============================================================
// FASE 9 (Bloque C): AZADA, PLANTAR, PICKER CREATIVO Y VUELO
// ============================================================
// Clic derecho con una azada sobre tierra/césped → arar (till). Con
// semillas sobre tierra arada → plantar (plant). El servidor valida todo.
const DIRT_BLOCK = 1;
const GRASS_BLOCK = 2;

function isCreative() {
	return uiGamemode() === "creative";
}

// Clic medio (picker creativo): en un mundo creative, coge el bloque al que
// se apunta y lo coloca en el slot seleccionado (como el pick-block de MC).
renderer.domElement.addEventListener("mousedown", (e) => {
	if (e.button !== 1 || !controls.isLocked || !isCreative()) return;
	e.preventDefault(); // evitar el autoscroll del navegador
	const hit = raycastTerrainAndMobs();
	if (!hit || hit.object.userData.mobId) return;
	const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
	const x = Math.floor(point.x),
		y = Math.floor(point.y),
		z = Math.floor(point.z);
	const target = getClientBlock(x, y, z);
	if (target > 0) send("creative_pick", { itemId: target });
});

// Fase 10 (D3): doble-tap W → sprint (misma técnica que el doble espacio).
let lastWPress = 0;

// Doble espacio: activar/desactivar el vuelo (solo en creative). El primer
// espacio salta (o sube si ya vuela); un segundo dentro de 260 ms alterna.
let lastSpaceAt = 0;
let spacePending = false;
document.addEventListener("keydown", (e) => {
	if (e.code !== "Space" || isTyping() || !isCreative()) return;
	const now = performance.now();
	if (spacePending && now - lastSpaceAt < 260) {
		spacePending = false;
		setFlying(!isFlying());
		return;
	}
	spacePending = true;
	lastSpaceAt = now;
	setTimeout(() => {
		spacePending = false;
	}, 300);
});

// Fase 8 (B9): los mobs son GRUPOS de partes (MOB_PARTS) — el rayo intersecta
// los HIJOS (las cajas) con recursión y luego se sube por el árbol hasta el
// grupo raíz que tiene userData.mobId/mobType. El terreno son meshes simples
// (hijos de chunkMeshes); intersectar con recursive=true también los cubre.
function raycastTerrainAndMobs() {
	// Fase 9 (Bloque A): refrescar matrixWorld ANTES de intersectar. El render
	// loop lo hace cada frame, pero un mob/chunk recién creado o movido puede
	// tener matrixWorld obsoleto en el instante del mousedown (entre frames):
	// el rayo intersectaría el objeto en su posición ANTERIOR o en el origen
	// si nunca se renderizó → el clic golpearía el aire o el mob equivocado
	// y "no haría nada" pese a apuntar a un bloque visible.
	scene.updateMatrixWorld();
	raycaster.setFromCamera({ x: 0, y: 0 }, camera);
	const terrainMeshes = [];
	// Detalle completo + LOD: sin los LOD, el terreno lejano (visible) no es
	// clicable — el rayo lo atraviesa y el clic "no hace nada" en esas zonas
	// (p. ej. un chunk que se quedara en tier LOD por un fallo de transición).
	for (const group of [...chunkMeshes.values(), ...lodMeshes.values()])
		group.children.forEach((m) => {
			terrainMeshes.push(m);
		});
	const mobList = Array.from(mobMeshes.values());
	const all = [...terrainMeshes, ...mobList];
	raycastStats.candidates = all.length;
	const hits = raycaster.intersectObjects(
		all,
		true // Fase 8 (B9): recursivo para llegar a las partes de los mobs
	);
	raycastStats.hits = hits.length;
	raycastStats.mobHits = hits.filter((h) => mobRootData(h)).length;
	raycastStats.terrainHits = hits.length - raycastStats.mobHits;
	if (hits.length === 0) raycastStats.emptyHits++;
	return hits[0] || null;
}

// ============================================================
// FASE 9 (Bloque A): TELEMETRÍA DE MINERÍA PARA DIAGNÓSTICO
// Expuesta en window para diagnosticar "el clic no hace nada" desde la
// consola: cada mousedown deja un registro en __mcMiningTrace y el raycast
// acumula __mcRaycastStats. __mcDebugMining() fuerza un raycast AHORA y
// muestra el detalle (sin esperar a un clic).
// ============================================================
const miningTrace = [];
const raycastStats = {
	candidates: 0,
	hits: 0,
	terrainHits: 0,
	mobHits: 0,
	emptyHits: 0
};
window.__mcMiningTrace = miningTrace;
window.__mcRaycastStats = raycastStats;
window.__mcDebugMining = () => {
	const hit = raycastTerrainAndMobs();
	const root = mobRootData(hit);
	const detail = {
		locked: controls.isLocked,
		stats: { ...raycastStats },
		firstHit: hit
			? {
					dist: +hit.distance.toFixed(2),
					isMob: !!root?.mobId,
					type: root?.mobType || null,
					blockAtPoint: getClientBlock(
						Math.floor(hit.point.x),
						Math.floor(hit.point.y),
						Math.floor(hit.point.z)
					)
				}
			: null
	};
	// biome-ignore lint/suspicious/noConsole: helper de diagnóstico (consola)
	console.log("[mine]", detail);
	return detail;
};

// Sube desde el mesh golpeado (puede ser una parte del grupo) hasta el grupo
// raíz del mob y devuelve su userData, o null si no era un mob. Sin esto, con
// el mob multibloque el clic golpearía la caja de una parte que no lleva
// mobId → regresión directa de B10.
function mobRootData(hit) {
	if (!hit) return null;
	let o = hit.object;
	while (o) {
		if (o.userData?.mobId) return o.userData;
		o = o.parent;
	}
	return null;
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
	return best?.mobId ? { id: best.mobId, type: best.mobType } : null;
}

renderer.domElement.addEventListener("mousedown", (e) => {
	if (!controls.isLocked) return;

	const held = getHeldItem();
	const hit = raycastTerrainAndMobs();

	// Fase 8 (B10): tolerancia de apuntado — si el rayo golpea el terreno (o el
	// vacío) pero hay un mob DELANTE (proyección sobre el rayo, desviación
	// lateral <= 0.75) en vez de caer exactamente dentro de su caja, el clic
	// golpea al mob (antes solo acertaba si el rayo tocaba la caja; con el mob
	// de pie junto a un bloque o moviéndose, el terreno ganaba). Fase 8 (B9):
	// el hit puede ser una PARTE del grupo multibloque → se sube al raíz con
	// mobRootData() para leer mobId/mobType.
	const rootData = mobRootData(hit);
	// Fase 9 (Bloque A): registro de telemetría (anillo de ~40) para
	// diagnosticar "el clic no hace nada" — ver window.__mcMiningTrace.
	const traceEntry = {
		time: performance.now(),
		locked: controls.isLocked,
		button: e.button,
		hit: hit
			? {
					isMob: !!rootData?.mobId,
					type: rootData?.mobType || null,
					x: Math.floor(hit.point.x),
					y: Math.floor(hit.point.y),
					z: Math.floor(hit.point.z),
					dist: +hit.distance.toFixed(2)
				}
			: null
	};
	miningTrace.push(traceEntry);
	if (miningTrace.length > 40) miningTrace.shift();
	const hitMob =
		(rootData?.mobId && { id: rootData.mobId, type: rootData.mobType }) ||
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

	// Fase 9 (Bloque C): clic derecho con azada sobre tierra/césped → arar;
	// con semillas sobre tierra arada → plantar. Antes de intentar colocar.
	if (e.button === 2 && held) {
		const targetBlock = getClientBlock(x, y, z);
		if (
			HOES.has(held.id) &&
			(targetBlock === DIRT_BLOCK || targetBlock === GRASS_BLOCK)
		) {
			playBreak(targetBlock);
			send("till", { x, y, z });
			return;
		}
		if (held.id === 117 && targetBlock === FARMLAND) {
			// semillas → plantar (el servidor valida que sea tierra arada)
			send("plant", { x, y, z });
			return;
		}
	}

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
		// Fase 10 (D2): clic derecho sobre un TNT enciende la mecha (no lo
		// coloca encima). El servidor valida la distancia y arma la explosión.
		if (getClientBlock(x, y, z) === TNT) {
			playPlace(TNT);
			send("block_action", { action: "ignite", x, y, z });
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
