// ============================================================
// GAME-INPUT (Fase 18, D-8): input del JUEGO — teclado (movimiento,
// hotbar, paneles, F3/F11), ratón (romper/colocar/atacar, mina por sesión),
// re-minado con clic mantenido (F17 B7) y la sesión de minería. El rayo y
// su telemetría viven en raycast.js (Fase 18, D-8); la pausa/menú (Esc) en
// menu-input.js; los controles táctiles en touch.js; input.js es el
// despachador que los importa y re-exporta onBlockMined (network.js).
// ============================================================
import { playBreak, playDrink, playEat, playFeed, playPlace } from "./audio.js";
import { send } from "./connection.js";
import {
	ARMOR_ITEMS,
	BED_SET,
	BEE_HIVE,
	BEE_NEST,
	BREED_FOOD,
	BUCKET,
	FARMLAND,
	FISHING_ROD,
	FOOD_ITEMS,
	GLASS_BOTTLE,
	HOES,
	PLACEABLE_BLOCKS,
	SHIELD,
	TNT,
	WATER
} from "./constants.js";
import { toggleDebug } from "./debug.js";
import { isFlying, move, setFlying } from "./player.js";
import {
	miningTrace,
	mobRootData,
	nearestMobOnRay,
	raycaster,
	raycastTerrainAndMobs,
	updateHighlight
} from "./raycast.js"; // Fase 18 (D-8): rayo + telemetría extraídos
import { controls, renderer } from "./scene.js";
import { toggleFullscreen } from "./settings.js"; // Fase 16 (E1): tecla F11
import { isTouchActive } from "./touch.js"; // Fase 18 (D-8): mousedown sintético táctil
import {
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
	getClientBlock,
	hideCrack,
	hideHighlight,
	showCrack
} from "./world.js";

// ============================================================
// TECLADO (JUEGO)
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
// El rayo (raycaster, raycastTerrainAndMobs, resaltado, telemetría y
// tolerancia de apuntado a mobs) vive en raycast.js (Fase 18, D-8).
// ============================================================
// Fase 6 (minería fina): mantener pulsado el clic izquierdo mina el bloque
// (el servidor avanza el progreso por dureza/velocidad de herramienta y
// envía block_break_progress para las grietas). Soltar, mirar a otro bloque
// o soltar el puntero cancela la mina.
let miningTarget = null; // {x,y,z} del bloque que se está minando
// Fase 17 (B7): ¿el botón izquierdo sigue presionado? (re-minado automático)
let miningMouseDown = false;

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
		target === 91 || // Fase 21.5 (C1): horno de fundición — interactivo, no minable
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

// Fase 21.5 (C2): escudo — estado de bloqueo (clic derecho mantenido con el
// escudo en la mano). Al soltar se envía blocking:false.
let shieldBlocking = false;
// Pose visual del escudo: viñeta + retícula "protegida". Como no hay modelo
// de brazo en primera persona (fuera de alcance), la señal es el overlay.
let shieldOverlay = null;
function getShieldOverlay() {
	if (!shieldOverlay) shieldOverlay = document.getElementById("shield-block");
	return shieldOverlay;
}
export function setShieldPose(blocking) {
	const el = getShieldOverlay();
	if (!el) return;
	el.classList.toggle("hidden", !blocking);
}

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

// El rayo (raycastTerrainAndMobs), la telemetría (__mcMiningTrace/
// __mcDebugMining), el resaltado (updateHighlight), mobRootData y
// nearestMobOnRay viven en raycast.js (Fase 18, D-8); aquí solo se consumen.

// Fase 17 (D1): en pantallas táctiles no hay pointer lock — el mousedown
// sintético de los botones táctiles debe funcionar igual (touch.js expone
// isTouchActive()).
renderer.domElement.addEventListener("mousedown", (e) => {
	if (!controls.isLocked && !isTouchActive()) return;
	// Fase 17 (B7): recordar si el botón izquierdo sigue presionado para
	// re-minar el bloque siguiente al romperse el actual.
	miningMouseDown = e.button === 0;

	const held = getHeldItem();

	// Fase 21.5 (C2): escudo — manteniendo el clic derecho con un escudo en
	// la mano se bloquea (el servidor reduce el daño de mobs/proyectiles
	// mientras player.blocking). No requiere apuntar a un bloque: el escudo
	// se alza hacia donde mira la cámara. Al soltar (mouseup) se envía el
	// estado desbloqueado.
	const shieldHeld = held && held.id === SHIELD;
	if (e.button === 2 && shieldHeld) {
		shieldBlocking = true;
		setShieldPose(true);
		send("shield_block", { blocking: true });
		return;
	}

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
			held.id === BUCKET &&
			hitMob.type === "cow"
		) {
			// Fase 21 (C1): cubo vacío sobre una vaca → ordeñar (leche)
			send("milk_cow", { mobId: hitMob.id });
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
	// necesidad de apuntar a un bloque (como en Minecraft). Fase 18 (C-9):
	// el sorbo de beber acompaña al comer (paridad §2.2 — el clon no tiene
	// ítems bebibles, leche/pociones están fuera de alcance).
	if (e.button === 2 && held && FOOD_ITEMS.has(held.id)) {
		playEat();
		playDrink();
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

	// Fase 21.5 (A1): pescar con clic derecho (la caña en mano). El servidor
	// decide si lanzar la línea o recogerla: al picar entrega un ítem y
	// desgasta la caña; al recoger antes de picar la devuelve sin gastarla.
	if (e.button === 2 && held && held.id === FISHING_ROD) {
		send("fishing", {});
		return;
	}

	// Fase 21.5 (D5): lanzar la carga de viento (270) con clic derecho — el
	// proyectil vuela hacia donde mira y empuja a bloques/entidades. El
	// servidor la retira del inventario (un solo uso) y la reemplaza por la
	// ráfaga al impactar.
	if (e.button === 2 && held && held.id === 270) {
		send("throw_wind_charge", {});
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
		// Fase 21.5 (C1): el horno de fundición (91) abre la misma UI del horno.
		if (target === 16 || target === 91) {
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
		if (BED_SET.has(getClientBlock(x, y, z))) {
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
		// Fase 21.5 (B4): clic derecho con una botella de vidrio sobre una
		// colmena/nido la llena de miel (el servidor consume la botella y
		// entrega la HONEY_BOTTLE).
		{
			const hiveBlock = getClientBlock(x, y, z);
			if ((hiveBlock === BEE_HIVE || hiveBlock === BEE_NEST) && getHeldItem()?.id === GLASS_BOTTLE) {
				playDrink();
				send("honey_bottle", { x, y, z });
				return;
			}
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
	// Fase 21.5 (C2): soltar el clic derecho deja de bloquear con el escudo.
	if (e.button === 2 && shieldBlocking) {
		shieldBlocking = false;
		setShieldPose(false);
		send("shield_block", { blocking: false });
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
		// Fase 21.5 (C2): al salir del juego (menú) también se suelta el escudo.
		if (shieldBlocking) {
			shieldBlocking = false;
			setShieldPose(false);
			send("shield_block", { blocking: false });
		}
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
