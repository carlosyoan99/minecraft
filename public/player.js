// ============================================================
// FÍSICA Y MOVIMIENTO DEL JUGADOR LOCAL
// ============================================================
import * as THREE from "three";
import {
	playSplash,
	playStep,
	setMusicContext,
	updateAmbient
} from "./audio.js";
import { initClouds, updateClouds } from "./clouds.js"; // Fase 10 (E4): nubes
import { send } from "./connection.js";
import {
	EYE_HEIGHT,
	GRAVITY,
	JUMP_SPEED,
	LAVA,
	NON_SOLID_PLANTS,
	SAND,
	SNOW,
	TORCH,
	WATER
} from "./constants.js";
import { setUnderwater, updateDayNight } from "./daynight.js";
import { isDoorOpen } from "./network.js"; // Fase 13 (L2): estado local de puertas
import { camera, controls, renderer, scene, sun } from "./scene.js";
import { getSetting, updateCoords } from "./settings.js";
import { shouldUnderwaterFog } from "./waterfog.js"; // Fase 16 (B1): niebla con inmersión real
import {
	applyFrustumCulling,
	chunkMeshes,
	geoPoolStats,
	getClientBlock,
	lodMeshes,
	tickChunkWatchdog, // Fase 17 (B3): auto-cura mallas huérfanas
	updateLiquidAnimation,
	updateLod
} from "./world.js";

const PLAYER_SPEED = 4.3; // bloques/segundo (en tierra)
const SWIM_SPEED = 2.6; // bloques/segundo (en agua)
// Fase 10 (D3): sprint — doble-tap W lo activa (estilo MC), ~1.3x la velocidad
// de caminar; abre el FOV unos grados mientras se corre (ver animate()).
const SPRINT_SPEED = 5.6; // bloques/segundo corriendo
const SPRINT_FOV = 10; // grados extra de FOV al correr (MC abre ~10°)
// Fase 10 (D5): agacharse (Shift) — 30% de la velocidad de caminar, como en
// Minecraft, y con protección de bordes (no se cae del borde si el bloque de
// debajo del siguiente paso no es sólido).
const SNEAK_SPEED = 1.3; // bloques/segundo agachado
// GRAVITY y JUMP_SPEED vienen de constants.js (paridad con el servidor para
// el anti-cheat de vuelo y el daño de caída por velocidad vertical).
const WATER_GRAVITY = 6; // gravedad reducida bajo el agua (flotación)
const SINK_SPEED = 1.4; // velocidad máxima de hundimiento
const SWIM_UP_SPEED = 4; // nadar hacia arriba con espacio

let velocityY = 0;
let onGround = false;
export const move = {
	forward: false,
	back: false,
	left: false,
	right: false,
	jump: false,
	sneak: false, // Fase 9 (C): Shift — bajar en el vuelo creativo
	sprint: false // Fase 10 (D3): doble-tap W — correr (más rápido + FOV abierto)
};

// ============================================================
// VUELO CREATIVO (Fase 9, Bloque C)
// Doble espacio alterna el vuelo (solo en creative); mientras vuela, el
// jugador se mueve en 3D: espacio sube, Shift baja, sin gravedad. Es solo
// visual/local — el servidor lo sabe (creative_fly) para saltarse el
// anti-cheat de ascenso y para el F3.
// ============================================================
let flying = false;
const flySpeed = 9; // bloques/s en vuelo (más rápido que caminar)
export function isFlying() {
	return flying;
}
export function setFlying(on) {
	flying = !!on;
	if (flying) velocityY = 0;
	send("creative_fly", { enabled: flying });
}
export function toggleFly() {
	setFlying(!flying);
}

export function teleport(x, y, z) {
	camera.position.set(x, y, z);
	velocityY = 0;
}

function solidAt(x, y, z) {
	const b = getClientBlock(Math.floor(x), Math.floor(y), Math.floor(z));
	// El agua, la lava, la antorcha y las plantas (hierba/flores/trigo) no son
	// sólidas: se pueden atravesar (la lava daña — lo gestiona el servidor).
	const solid =
		b !== 0 &&
		b !== -1 &&
		b !== WATER &&
		b !== LAVA &&
		b !== TORCH &&
		!NON_SOLID_PLANTS.has(b);
	if (!solid) return false;
	// Fase 13 (L2/L3): COLISIÓN POR FORMA (paridad con server/world.isSolidAt).
	// Puerta/portón abiertos → se atraviesan.
	if (b === 48 || b === 49 || b === 71)
		return !isDoorOpen(Math.floor(x), Math.floor(y), Math.floor(z));
	// Losas y escaleras: solo la mitad inferior de la celda es sólida (media
	// caja / escalón). La Y flotante decide dentro de la celda.
	if (b === 60 || b === 61 || b === 50 || b === 51)
		return y - Math.floor(y) < 0.5;
	return true; // valla (70) y resto: celda completa
}

// ============================================================
// CONTEXTO MUSICAL (Fase 10, nota del usuario): la música generativa varía
// según el entorno — cueva (techo encima → notas graves y espaciadas),
// desierto (arena bajo los pies → brillante) y bioma frío (nieve → aguda).
// Se llama ~1 vez/segundo desde animate(); es barata (2-3 lecturas de bloque).
// ============================================================
let musicCtxTimer = 0;
function updateMusicContext() {
	const px = camera.position.x;
	const feet = camera.position.y - EYE_HEIGHT;
	const pz = camera.position.z;
	// Cueva: bloque sólido justo encima de la cabeza (techo) o el jugador
	// está por debajo del nivel del mar con terreno encima. Solo importa el
	// techo INMEDIATO: una cueva abierta al cielo no cuenta como cueva.
	const headY = camera.position.y + 0.5;
	const cave = solidAt(px, headY + 1.0, pz);
	// Bioma por el bloque bajo los pies (aproximación sin red, suficiente
	// para la música): arena → desierto, nieve (21) → frío.
	const under = getClientBlock(
		Math.floor(px),
		Math.floor(feet - 0.1),
		Math.floor(pz)
	);
	setMusicContext({
		cave,
		warm: under === SAND,
		cold: under === SNOW
	});
}

function isWaterAt(x, y, z) {
	return getClientBlock(Math.floor(x), Math.floor(y), Math.floor(z)) === WATER;
}

function tryMove(dx, dz) {
	const feet = camera.position.y - EYE_HEIGHT;
	const r = 0.3;
	// Fase 10 (D5): protección de bordes al agacharse — si el bloque bajo el
	// siguiente paso no es sólido (borde de un risco/plataforma), no se avanza
	// ese eje: el jugador se queda "pegado" al borde en vez de caerse.
	const edgeSafe = (x, z) => !move.sneak || solidAt(x, feet - 0.6, z);
	// Eje X
	const nx = camera.position.x + dx;
	if (
		edgeSafe(nx, camera.position.z) &&
		!solidAt(nx + Math.sign(dx) * r, feet + 0.1, camera.position.z) &&
		!solidAt(nx + Math.sign(dx) * r, feet + 1.3, camera.position.z)
	) {
		camera.position.x = nx;
	}
	// Eje Z
	const nz = camera.position.z + dz;
	if (
		edgeSafe(camera.position.x, nz) &&
		!solidAt(camera.position.x, feet + 0.1, nz + Math.sign(dz) * r) &&
		!solidAt(camera.position.x, feet + 1.3, nz + Math.sign(dz) * r)
	) {
		camera.position.z = nz;
	}
}

const clock = new THREE.Clock();
let netTimer = 0;
let lodTimer = 0; // throttle del cambio de tier LOD (Fase 6)
let stepDist = 0; // distancia recorrida acumulada para el sonido de pasos
let wasInWater = false; // Fase 9 (E): estado previo para el splash de entrada
const STEP_SPACING = 0.72; // bloques entre pasos

// ============================================================
// MÉTRICAS DE RENDIMIENTO (HUD + ventana para la auditoría)
// Media móvil de 1s expuesta en window.__mc*; el #fps del HUD la dibuja.
// ============================================================
const fpsEl = document.getElementById("fps");
let perfFrames = 0,
	perfAmbient = 0,
	perfCull = 0,
	perfFrameMs = 0;
let perfTimer = performance.now();

// Métricas por frame: ambientMs se mide AISLADO (solo updateAmbient), cullMs
// solo el frustum culling, frameMs incluye todo el frame (física + render).
// FPS = 1000 / frameMs medio, robusto incluso con frames lentos.
function updatePerfMetrics(ambientMs, cullMs, frameMs) {
	perfFrames++;
	perfAmbient += ambientMs;
	perfCull += cullMs;
	perfFrameMs += frameMs;
	const now = performance.now();
	const elapsed = now - perfTimer;
	if (elapsed >= 1000 && perfFrames > 0) {
		window.__mcFps = 1000 / (perfFrameMs / perfFrames);
		window.__mcFrameMs = perfFrameMs / perfFrames;
		window.__mcAmbientMs = perfAmbient / perfFrames;
		window.__mcCullMs = perfCull / perfFrames; // media móvil de 1s, como las demás
		window.__mcChunks = chunkMeshes.size + lodMeshes.size; // completo + LOD (Fase 6)
		window.__mcLodChunks = lodMeshes.size; // Fase 8 (B6): cuántos son LOD (diagnóstico)
		window.__mcTriangles = renderer.info.render.triangles;
		window.__mcGeoPool = geoPoolStats(); // reutilización de geometrías (Fase 6)
		if (fpsEl) {
			// Fase 6: muestra cuántos chunks del total están realmente visibles (culling)
			fpsEl.textContent = `${window.__mcFps.toFixed(0)} FPS · ${window.__mcVisibleChunks}/${window.__mcChunks} chunks`;
		}
		perfFrames = 0;
		perfAmbient = 0;
		perfCull = 0;
		perfFrameMs = 0;
		perfTimer = now;
	}
}

function animate() {
	requestAnimationFrame(animate);
	const dt = Math.min(clock.getDelta(), 0.1);

	if (controls.isLocked) {
		const forward = new THREE.Vector3();
		camera.getWorldDirection(forward);
		forward.y = 0;
		forward.normalize();
		// B1 (Fase 8): `right` = perpendicular a la vista en el plano XZ. En
		// Three.js crossVectors(forward, up) YA apunta a la derecha (con Y
		// arriba y mirando a -Z, +X es derecha): el .negate() previo invertía
		// el eje y hacía que A moviera a la derecha y D a la izquierda.
		const right = new THREE.Vector3().crossVectors(forward, camera.up);
		// B1: opción "controles invertidos" (Ajustes): invierte el eje lateral
		// (A↔D) para quien lo prefiera (persistida en mc_settings, settings.js).
		const lateral = getSetting("invertControls") ? -1 : 1;

		const feet = camera.position.y - EYE_HEIGHT;
		// ¿Jugador en el agua? (cuerpo a la altura del pecho/cabeza)
		const inWater =
			isWaterAt(camera.position.x, feet + 0.8, camera.position.z) ||
			isWaterAt(camera.position.x, feet + 1.4, camera.position.z);
		// Fase 9 (E): splash al ENTRAR en el agua (transición aire→agua) —
		// feedback auditivo de la inmersión, como en Minecraft.
		if (inWater && !wasInWater) playSplash();
		wasInWater = inWater;
		// Fase 10 (E3) + Notas + Fase 16 (B1): niebla azulada y densa solo con
		// inmersión REAL — ojos a ≥2 bloques bajo la superficie del agua
		// (nadando en la superficie, con los ojos a 1 bloque o fuera, no se
		// ve). La decisión vive en waterfog.js (pura, testeable).
		setUnderwater(
			shouldUnderwaterFog(camera.position.y, inWater, (y) =>
				isWaterAt(camera.position.x, y, camera.position.z)
			)
		);

		let dx = 0,
			dz = 0;
		if (move.forward) {
			dx += forward.x;
			dz += forward.z;
		}
		if (move.back) {
			dx -= forward.x;
			dz -= forward.z;
		}
		if (move.left) {
			dx -= lateral * right.x;
			dz -= lateral * right.z;
		}
		if (move.right) {
			dx += lateral * right.x;
			dz += lateral * right.z;
		}
		const len = Math.hypot(dx, dz);
		// Fase 10 (D3/D5): velocidad por estado — sprint (doble-tap W) solo en
		// tierra y moviéndose hacia delante; agacharse (Shift) reduce a 30%.
		// El agua impone su propia resistencia (SWIM_SPEED) por encima de todo.
		const sprinting = move.sprint && move.forward && !inWater && !flying;
		const sneaking = move.sneak && !inWater && !flying;
		const speed = inWater
			? SWIM_SPEED
			: sprinting
				? SPRINT_SPEED
				: sneaking
					? SNEAK_SPEED
					: PLAYER_SPEED;
		if (len > 0) {
			dx = (dx / len) * speed * dt;
			dz = (dz / len) * speed * dt;
		}
		tryMove(dx, dz);

		// Fase 10 (D3): efecto de FOV al correr — se abre ~10° con transición
		// suave (lerp por frame) y vuelve al valor del ajuste al dejar de correr.
		const targetFov = getSetting("fov") + (sprinting ? SPRINT_FOV : 0);
		if (Math.abs(camera.fov - targetFov) > 0.05) {
			camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 10);
			camera.updateProjectionMatrix();
		}

		// Vuelo creativo: movimiento 3D sin gravedad (espacio sube, Shift baja).
		if (flying) {
			const vert = (move.jump ? 1 : 0) - (move.sneak ? 1 : 0);
			camera.position.y += vert * flySpeed * dt;
			velocityY = 0;
			onGround = false;
		} else {
			// Gravedad, salto y natación
			onGround = solidAt(camera.position.x, feet - 0.05, camera.position.z);
			if (inWater) {
				// Flotación: gravedad reducida, hundimiento lento y límite de caída;
				// espacio nada hacia arriba (permite salir a la superficie). Al tocar
				// el fondo (onGround) se reposa sin jitter.
				if (onGround) velocityY = 0;
				else velocityY -= WATER_GRAVITY * dt;
				velocityY = Math.max(velocityY, -SINK_SPEED);
				if (move.jump) {
					// Fase 10 (A1): bug "no se puede salir del agua". Al alcanzar la
					// superficie (cabeza fuera del agua) el salto impulsa como en
					// tierra (JUMP_SPEED en vez del tope de natación SWIM_UP_SPEED):
					// permite saltar fuera a la orilla/ribazo. Antes el tope de 4
					// bloques/s no bastaba para encaramarse a un borde de 1 bloque.
					const atSurface = !isWaterAt(
						camera.position.x,
						feet + 1.5,
						camera.position.z
					);
					velocityY = atSurface ? JUMP_SPEED : SWIM_UP_SPEED;
				}
			} else if (onGround) {
				velocityY = 0;
				if (move.jump) velocityY = JUMP_SPEED;
			} else {
				velocityY -= GRAVITY * dt;
			}
			let newY = camera.position.y + velocityY * dt;
			const newFeet = newY - EYE_HEIGHT;
			if (
				velocityY < 0 &&
				solidAt(camera.position.x, newFeet, camera.position.z)
			) {
				velocityY = 0;
				newY = Math.ceil(newFeet) + EYE_HEIGHT;
			} else if (
				velocityY > 0 &&
				solidAt(camera.position.x, newY - EYE_HEIGHT + 1.7, camera.position.z)
			) {
				velocityY = 0;
			}
			camera.position.y = newY;

			// Pasos: suenan al caminar por el suelo, cada ~0.72 bloques
			if (onGround && len > 0) {
				stepDist += Math.hypot(dx, dz);
				if (stepDist >= STEP_SPACING) {
					stepDist = 0;
					const under = getClientBlock(
						Math.floor(camera.position.x),
						Math.floor(feet - 0.1),
						Math.floor(camera.position.z)
					);
					playStep(under);
				}
			} else {
				stepDist = 0;
			}
		}

		netTimer += dt;
		if (netTimer > 0.05) {
			netTimer = 0;
			send("move", {
				x: camera.position.x,
				y: camera.position.y,
				z: camera.position.z,
				yaw: camera.rotation.y,
				pitch: camera.rotation.x
			});
		}
	}

	const frameT0 = performance.now();
	updateDayNight();
	updateClouds(dt); // Fase 10 (E4): nubes que se desplazan
	updateLiquidAnimation(); // Fase 9 (E): pulso suave del agua/lava
	// Fase 10 (nota del usuario): contexto musical — cada ~1 s se mira el
	// entorno (techo encima → cueva; arena bajo los pies → desierto; nieve →
	// frío) y audio.js varía la paleta de la música generativa en respuesta.
	musicCtxTimer += dt;
	if (musicCtxTimer >= 1) {
		musicCtxTimer = 0;
		updateMusicContext();
	}
	const ambientT0 = performance.now();
	updateAmbient();
	const ambientMs = performance.now() - ambientT0;
	// Fase 6: frustum culling — no se renderizan los chunks fuera del campo de visión
	const cullT0 = performance.now();
	applyFrustumCulling(camera);
	const cullMs = performance.now() - cullT0;
	// Fase 6 (LOD): cambiar de tier según la distancia con throttle (~4 veces/s):
	// reconstruir cada frame sería caro; cada 250 ms es imperceptible.
	lodTimer += dt;
	if (lodTimer >= 0.25) {
		lodTimer = 0;
		updateLod();
	}
	// Fase 17 (B3): watchdog de mallas (throttle interno de 0.5s) — si un
	// chunk tiene datos pero no mesh, se reconstruye en cuanto se detecta.
	tickChunkWatchdog(dt);
	// Auditoría 2026-08-09 (§3.4): sombras que siguen al jugador. El shadow
	// map es un frustum de ±60 bloques alrededor del target del sol; si el
	// target se queda en el origen, al alejarse del spawn el volumen queda
	// vacío y no se proyecta sombra. Se arrastra target y luz con la cámara
	// conservando la dirección del sol (el offset de la luz marca la
	// dirección ALEJÁNDOSE del target).
	sun.target.position.set(
		camera.position.x,
		camera.position.y,
		camera.position.z
	);
	sun.position.set(
		camera.position.x + 60,
		camera.position.y + 90,
		camera.position.z + 40
	);
	sun.target.updateMatrixWorld();
	renderer.render(scene, camera);
	updateCoords(
		camera.position.x,
		camera.position.y,
		camera.position.z,
		camera.rotation.y
	); // Fase 7: capa de coordenadas
	updatePerfMetrics(ambientMs, cullMs, performance.now() - frameT0);
}
initClouds(); // Fase 10 (E4): nubes procedurales (antes del primer frame)
animate();
