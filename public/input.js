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
	EYE_HEIGHT,
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
import { toggleFullscreen } from "./settings.js"; // Fase 16 (E1): tecla F11
import {
	closePanels,
	getHeldItem,
	getSelectedSlot,
	isPauseOpen,
	isTyping,
	openCraftingFromBlock,
	resumeGame,
	selectSlot,
	showPause,
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
	hideHighlight,
	lodMeshes,
	setHighlightedBlock,
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
			// Fase 17 (C1): Esc abre la pausa en el juego; con la pausa abierta
			// la reanuda; con un panel abierto lo cierra (comportamiento previo).
			if (isPauseOpen()) {
				resumeGame();
			} else if (controls.isLocked) {
				showPause();
			} else {
				closePanels();
			}
			break;
		case "F3":
			// Fase 6: visualizador de chunks (bordes + caras) para depurar el culling
			e.preventDefault(); // evitar el buscador del navegador
			toggleDebug();
			break;
		case "F11":
			// Fase 16 (E1): pantalla completa (el navegador la alterna por
			// defecto, pero este listener es un gesto válido para la API).
			e.preventDefault();
			toggleFullscreen();
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
// Fase 17 (B7): ¿el botón izquierdo sigue presionado? (re-minado automático)
let miningMouseDown = false;

// ============================================================
// RESALTADO DEL BLOQUE APUNTADO (Fase 11, Bloque A1)
// Contorno negro sobre el bloque objetivo, actualizado con cada movimiento
// del ratón (la mira solo cambia con el ratón; al caminar sin moverlo el
// objetivo no cambia y el siguiente movimiento lo refresca). Los mobs NO se
// resaltan (como en Minecraft). Misma derivación x/y/z que el clic: el
// bloque detrás de la cara golpeada → el resaltado coincide SIEMPRE con lo
// que el clic va a minar/colocar.
// ============================================================
function updateHighlight(hit) {
	if (!controls.isLocked || !hit || mobRootData(hit)) {
		hideHighlight();
		return;
	}
	const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
	setHighlightedBlock(
		Math.floor(point.x),
		Math.floor(point.y),
		Math.floor(point.z)
	);
}

function startMiningAt(x, y, z) {
	const target = getClientBlock(x, y, z);
	// Mesa de crafteo/horno se abren con clic (no se minan así); el cofre
	// también, pero agachado (como en Minecraft) SÍ se puede minar/destruir
	// (Notas del usuario: "los cofres no se pueden eliminar"). El agua no se
	// rompe en survival sin cubo (sin feedback falso), pero EN CREATIVE sí
	// (Fase 11, C3: fuente de agua infinita — el servidor rellena las fuentes
	// con 2+ vecinas, así que el agua colocada en 2x2 nunca se agota).
	// Bloques desconocidos (-1): no minar.
	const chestRefused = target === 22 && !move.sneak;
	if (
		target === 15 ||
		target === 16 ||
		chestRefused ||
		(target === WATER && !isCreative()) ||
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
// conejo también come zanahorias (Fase 5). Fase 12 (A): el ocelote es un
// pasivo más (se doma con pescado crudo, no se alimenta para criar).
const PASSIVE_MOBS = new Set([
	"cow",
	"pig",
	"chicken",
	"sheep",
	"rabbit",
	"ocelot"
]);
// Fase 12 (A1/A3): ítems de doma — hueso (136) → lobo, pescado crudo
// (134) → ocelote. La doma consume el ítem con ~33% por intento.
const BONE_ITEM = 136;
const RAW_FISH_ITEM = 134;

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
// Fase 11 (Bloque A): contexto ampliado del raycast para confirmar la causa
// del clic roto. Además del raycast forzado, reporta: posición y dirección de
// la cámara, meshes REALES en la escena (vs los mapas), estado del pointer
// lock, qué elemento DOM recibe el clic en el centro (H2: overlay invisible)
// y el estado del menú #blocker.
function countMeshesInScene(obj) {
	let n = 0;
	if (!obj) return 0;
	obj.traverse((o) => {
		if (o.isMesh) n++;
	});
	return n;
}
// El bloque bajo el punto de mira: si el raycast falla (0 hits), se lee la
// columna central de la cámara hasta `far` para saber si hay terreno delante
// (distinguir «raycast roto» de «no hay bloques a ≤7»).
function blockAlongView() {
	const dir = camera.getWorldDirection(new THREE.Vector3());
	const origin = camera.position;
	for (let d = 1; d <= raycaster.far; d += 0.25) {
		const x = Math.floor(origin.x + dir.x * d);
		const y = Math.floor(origin.y + dir.y * d);
		const z = Math.floor(origin.z + dir.z * d);
		const b = getClientBlock(x, y, z);
		if (b !== 0 && b !== -1) return { d: +d.toFixed(2), x, y, z, block: b };
	}
	return null;
}
// Sondeo del terreno alrededor del jugador (Fase 11, Bloque A): bloque bajo
// los pies y barrido horizontal de 8 direcciones a la altura de los pies +0.5
// hasta `far`. Distingue «raycast roto» de «spawn en lago sin bloques a ≤7».
function terrainAround() {
	const feet = camera.position.y - EYE_HEIGHT;
	const under = getClientBlock(
		Math.floor(camera.position.x),
		Math.floor(feet - 0.1),
		Math.floor(camera.position.z)
	);
	const dirs = {};
	for (const [name, dx, dz] of [
		["-Z", 0, -1],
		["+Z", 0, 1],
		["-X", -1, 0],
		["+X", 1, 0],
		["-X-Z", -0.7, -0.7],
		["+X-Z", 0.7, -0.7],
		["-X+Z", -0.7, 0.7],
		["+X+Z", 0.7, 0.7]
	]) {
		dirs[name] = null;
		for (let d = 1; d <= raycaster.far; d += 0.25) {
			const b = getClientBlock(
				Math.floor(camera.position.x + dx * d),
				Math.floor(feet + 0.5),
				Math.floor(camera.position.z + dz * d)
			);
			if (b !== 0 && b !== -1) {
				dirs[name] = { d: +d.toFixed(2), block: b };
				break;
			}
		}
	}
	return { feet: +feet.toFixed(2), underFeet: under, dirs };
}
window.__mcDebugMining = () => {
	const hit = raycastTerrainAndMobs();
	const root = mobRootData(hit);
	const dir = camera.getWorldDirection(new THREE.Vector3());
	const cx = Math.floor(window.innerWidth / 2);
	const cy = Math.floor(window.innerHeight / 2);
	const atCenter = document.elementFromPoint(cx, cy);
	const detail = {
		locked: controls.isLocked,
		pointerLocked: document.pointerLockElement !== null,
		stats: { ...raycastStats },
		camera: {
			x: +camera.position.x.toFixed(2),
			y: +camera.position.y.toFixed(2),
			z: +camera.position.z.toFixed(2),
			dir: [+dir.x.toFixed(2), +dir.y.toFixed(2), +dir.z.toFixed(2)]
		},
		sceneMeshes: countMeshesInScene(scene),
		mapMeshes: chunkMeshes.size + lodMeshes.size + mobMeshes.size,
		elementAtCenter: atCenter
			? `${atCenter.tagName.toLowerCase()}#${atCenter.id}`
			: null,
		blockerDisplay: (() => {
			const b = document.getElementById("blocker");
			return b ? getComputedStyle(b).display : "sin blocker";
		})(),
		blockAlongView: blockAlongView(),
		terrainAround: terrainAround(),
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

// Fase 17 (D1): en pantallas táctiles no hay pointer lock — el mousedown
// sintético de los botones táctiles debe funcionar igual (touchActive).
let touchActive = false;

renderer.domElement.addEventListener("mousedown", (e) => {
	if (!controls.isLocked && !touchActive) return;
	// Fase 17 (B7): recordar si el botón izquierdo sigue presionado para
	// re-minar el bloque siguiente al romperse el actual.
	miningMouseDown = e.button === 0;

	const held = getHeldItem();
	const hit = raycastTerrainAndMobs();
	updateHighlight(hit); // el objetivo queda resaltado al clicar (o se oculta)

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
	// Fase 12 (A): domar lobos con hueso y ocelotes con pescado; mano vacía
	// sobre la mascota propia → sentarse/levantarse.
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
		} else if (
			e.button === 2 &&
			held &&
			held.id === 141 &&
			hitMob.type === "sheep"
		) {
			// Fase 11 (C): tijeras (141) sobre una oveja → esquilar (lana sin matar)
			send("shear_mob", { mobId: hitMob.id });
		} else if (
			e.button === 2 &&
			held &&
			held.id === BONE_ITEM &&
			hitMob.type === "wolf"
		) {
			// Fase 12 (A1): hueso sobre un lobo salvaje → intentar domar
			send("tame_mob", { mobId: hitMob.id });
		} else if (
			e.button === 2 &&
			held &&
			held.id === RAW_FISH_ITEM &&
			hitMob.type === "ocelot"
		) {
			// Fase 12 (A3): pescado crudo sobre un ocelote → intentar domar
			send("tame_mob", { mobId: hitMob.id });
		} else if (
			e.button === 2 &&
			!held &&
			(hitMob.type === "wolf" || hitMob.type === "cat")
		) {
			// Fase 12 (A1/E10): mano vacía sobre la mascota → sentarse/levantarse
			send("sit_pet", { mobId: hitMob.id });
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
	// slot; la que hubiera vuelto al inventario). Sin necesidad de apuntar.
	if (e.button === 2 && held && ARMOR_ITEMS.has(held.id)) {
		send("equip_armor", { inventorySlot: getSelectedSlot() });
		return;
	}

	// Fase 12 (A4/E8): lanzar el tridente con clic derecho (sin necesidad de
	// apuntar a un bloque — vuela hacia donde mira la cámara). El servidor lo
	// retira del inventario y lo devuelve al impactar o agotar su vida.
	if (e.button === 2 && held && held.id === 245) {
		send("throw_trident", {});
		return;
	}

	// Fase 13 (L1): disparar el arco con clic derecho (flecha hacia donde
	// mira la cámara). El servidor valida que hay flechas en el inventario,
	// consume 1, desgasta el arco y la flecha vuelve al impactar/expirar.
	if (e.button === 2 && held && held.id === 247) {
		send("shoot_bow", {});
		return;
	}

	// Fase 13 (L4): cubo de líquidos con clic derecho. Cubo vacío (249):
	// recoger la fuente de agua/lava a la que apunta el rayo; cubo lleno
	// (250/251): verter donde se mira (la celda tras la cara apuntada). Si no
	// hay bloque apuntado, no se hace nada (el servidor valida el resto).
	if (
		e.button === 2 &&
		held &&
		(held.id === 249 || held.id === 250 || held.id === 251)
	) {
		if (!hit) return;
		const bx = Math.floor(hit.point.x);
		const by = Math.floor(hit.point.y);
		const bz = Math.floor(hit.point.z);
		// Cubo lleno: verter en la celda ADYACENTE a la cara mirada (como
		// colocar); cubo vacío: recoger la celda apuntada (la fuente).
		const tx = held.id === 249 ? bx : bx + Math.round(hit.face.normal.x);
		const ty = held.id === 249 ? by : by + Math.round(hit.face.normal.y);
		const tz = held.id === 249 ? bz : bz + Math.round(hit.face.normal.z);
		send("bucket_use", { x: tx, y: ty, z: tz });
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
		// Fase 11 (C2): harina de hueso (139) sobre trigo (27, madura en salto)
		// o sobre tierra/césped (1/2, crea vegetación encima) — como Minecraft.
		if (
			held.id === 139 &&
			(targetBlock === 27 || targetBlock === 1 || targetBlock === 2)
		) {
			send("bonemeal", { x, y, z });
			return;
		}
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
		// Notas del usuario: el cofre se abre con clic, pero agachado se
		// destruye (como en Minecraft) — el `startMiningAt` lo permite solo
		// si `move.sneak` está activo.
		if (target === 22 && !move.sneak) {
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
		// Fase 13 (L2): clic derecho sobre una puerta/portón → abrir/cerrar
		// (el servidor alterna el estado y hace broadcast door_state).
		{
			const doorBlock = getClientBlock(x, y, z);
			if (doorBlock === 48 || doorBlock === 49 || doorBlock === 71) {
				send("door_use", { x, y, z });
				return;
			}
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
	if (e.button === 0) {
		miningMouseDown = false;
		stopMining();
	}
});

// Resaltado del bloque apuntado + retargeteo de la mina (Fase 14, M1): ANTES
// había dos listeners de pointermove con UN raycast cada uno (highlight y
// retarget) → 2 intersectObjects recursivos por evento de ratón. Ahora un solo
// listener hace UN raycast compartido que alimenta ambos: el resaltado se
// actualiza en CADA pointermove mientras el puntero está bloqueado
// (independiente de la mina), y si hay una mina en curso, se retargetea
// (cancelar la anterior + empezar la nueva) o se cancela al mirar al vacío o
// a un mob.
renderer.domElement.addEventListener("pointermove", () => {
	if (!controls.isLocked) return;
	const hit = raycastTerrainAndMobs();
	updateHighlight(hit);
	if (!miningTarget) return;
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
	if (!document.pointerLockElement) {
		miningMouseDown = false;
		stopMining();
		hideHighlight();
	}
});

// Fase 17 (B7): al romperse el bloque en mina (block_update → AIR lo llama
// desde network.js), si el clic sigue presionado se empieza a minar el
// bloque siguiente al que se apunta (como en Minecraft).
export function onBlockMined(x, y, z) {
	if (
		!miningTarget ||
		miningTarget.x !== x ||
		miningTarget.y !== y ||
		miningTarget.z !== z
	)
		return;
	miningTarget = null;
	hideCrack();
	if (!miningMouseDown) return;
	const hit = raycastTerrainAndMobs();
	if (!hit || mobRootData(hit)) return;
	const point = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
	startMiningAt(Math.floor(point.x), Math.floor(point.y), Math.floor(point.z));
}

renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());

// ============================================================
// CONTROLES TÁCTILES (Fase 17, D1): HUD adaptativo para móviles — joystick
// virtual (movimiento + sprint al fondo), arrastre a la derecha para mirar,
// y botones (agacharse, saltar, romper, usar, inventario, pausa). Mouse y
// teclado siguen siendo el camino principal; el servidor no se entera (todo
// se traduce a los mismos mensajes que mouse/teclado).
// ============================================================
const touchControlsEl = document.getElementById("touch-controls");
const touchJoystick = document.getElementById("touch-joystick");
const touchStick = document.getElementById("touch-stick");
const touchLookEl = document.getElementById("touch-look");
const JOY_RADIUS = 46;
let joyId = null;
let joyBase = { x: 0, y: 0 };
let lookId = null;
let lastLook = { x: 0, y: 0 };
const lookEuler = new THREE.Euler(0, 0, 0, "YXZ");

// ui.js lo avisa (evento mc-touch-visibility): al entrar al mundo se
// muestran en pantallas táctiles; en el menú se ocultan.
window.addEventListener("mc-touch-visibility", (e) =>
	setTouchControlsVisible(e.detail)
);

function setTouchControlsVisible(show) {
	if (!touchControlsEl) return;
	touchActive = !!show;
	touchControlsEl.classList.toggle("hidden", !show);
}

// Rotación de cámara equivalente a la del pointer lock (mismo euler YXZ y
// mismo clamp de ±90° que PointerLockControls), sin depender del lock.
function rotateCameraTouch(dx, dy) {
	lookEuler.setFromQuaternion(camera.quaternion);
	lookEuler.y -= dx * 0.0035;
	lookEuler.x -= dy * 0.0035;
	const lim = Math.PI / 2 - 0.01;
	lookEuler.x = Math.max(-lim, Math.min(lim, lookEuler.x));
	camera.quaternion.setFromEuler(lookEuler);
}

// Mueve el joystick (y mapea las direcciones al estado `move` de player.js).
function setJoystick(dx, dy) {
	const len = Math.hypot(dx, dy);
	const clamped = Math.min(len, JOY_RADIUS);
	const nx = clamped ? dx / len : 0;
	const ny = clamped ? dy / len : 0;
	if (touchStick)
		touchStick.style.transform = `translate(${nx * clamped}px, ${ny * clamped}px)`;
	move.forward = ny < -0.3;
	move.back = ny > 0.3;
	move.left = nx < -0.3;
	move.right = nx > 0.3;
	move.sprint = ny < -0.85; // al fondo del joystick, correr
}

if (touchJoystick) {
	touchJoystick.addEventListener(
		"touchstart",
		(e) => {
			const t = e.changedTouches[0];
			joyId = t.identifier;
			joyBase = { x: t.clientX, y: t.clientY };
			setJoystick(0, 0);
			e.preventDefault();
		},
		{ passive: false }
	);
	touchJoystick.addEventListener(
		"touchmove",
		(e) => {
			for (const t of e.changedTouches) {
				if (t.identifier === joyId) {
					setJoystick(t.clientX - joyBase.x, t.clientY - joyBase.y);
					e.preventDefault();
				}
			}
		},
		{ passive: false }
	);
	const joyEnd = (e) => {
		for (const t of e.changedTouches) {
			if (t.identifier === joyId) {
				joyId = null;
				setJoystick(0, 0);
				e.preventDefault();
			}
		}
	};
	touchJoystick.addEventListener("touchend", joyEnd);
	touchJoystick.addEventListener("touchcancel", joyEnd);
}

if (touchLookEl) {
	touchLookEl.addEventListener(
		"touchstart",
		(e) => {
			const t = e.changedTouches[0];
			lookId = t.identifier;
			lastLook = { x: t.clientX, y: t.clientY };
			e.preventDefault();
		},
		{ passive: false }
	);
	touchLookEl.addEventListener(
		"touchmove",
		(e) => {
			for (const t of e.changedTouches) {
				if (t.identifier === lookId) {
					rotateCameraTouch(t.clientX - lastLook.x, t.clientY - lastLook.y);
					lastLook = { x: t.clientX, y: t.clientY };
					e.preventDefault();
				}
			}
		},
		{ passive: false }
	);
}

// Botón pulsado (mantener) para saltar/agacharse.
function bindTouchHold(el, on, off) {
	if (!el) return;
	el.addEventListener(
		"touchstart",
		(e) => {
			on();
			e.preventDefault();
		},
		{ passive: false }
	);
	el.addEventListener(
		"touchend",
		(e) => {
			off();
			e.preventDefault();
		},
		{ passive: false }
	);
	el.addEventListener(
		"touchcancel",
		(e) => {
			off();
			e.preventDefault();
		},
		{ passive: false }
	);
}
// Botón de golpe (tap): reutiliza el handler de mousedown del canvas
// despachando un MouseEvent sintético (misma lógica que el ratón real).
function syntheticMouse(button) {
	if (!touchActive) return;
	renderer.domElement.dispatchEvent(
		new MouseEvent("mousedown", {
			button,
			bubbles: true,
			cancelable: true,
			view: window
		})
	);
}
bindTouchHold(
	document.getElementById("touch-jump"),
	() => (move.jump = true),
	() => (move.jump = false)
);
bindTouchHold(
	document.getElementById("touch-sneak"),
	() => (move.sneak = true),
	() => (move.sneak = false)
);
bindTouchHold(
	document.getElementById("touch-break"),
	() => syntheticMouse(0),
	() => {}
);
bindTouchHold(
	document.getElementById("touch-use"),
	() => syntheticMouse(2),
	() => {}
);
bindTouchHold(
	document.getElementById("touch-inv"),
	() => {
		if (uiGamemode() === "creative") togglePicker();
		else toggleInventory();
	},
	() => {}
);
bindTouchHold(
	document.getElementById("touch-pause"),
	() => {
		if (touchActive && !isPauseOpen()) showPause();
	},
	() => {}
);
