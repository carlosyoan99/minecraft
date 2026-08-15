"use strict";
// ============================================================
// ANTI-CHEAT DE MOVIMIENTO (Fase 18, D-1 — extraído de server/net.js)
// Validación server-side de los `move` del cliente: coords finitas,
// caída al vacío, límites del mundo, sólidos, parábola del salto
// (ascenso/hover/hundimiento lento) y ventana de velocidad horizontal.
// El servidor es la única fuente de verdad: el cliente predice para el
// render, pero aquí se decide la posición final (teleport si se rechaza).
//
// `handleMove` encapsula TODO el bloque de validación del case "move":
// devuelve null si el move se rechazó (el teleport ya se envió) o un
// objeto con las coordenadas aceptadas y los datos derivados que el
// llamador necesita para aceptar el move (caída, chunks, broadcast).
// ============================================================

// Fase 16 (C2, SV-3/SEC-3): valida que x/y/z sean números finitos ANTES de
// usarlos en handlers. Sin esto, coords `NaN`/strings/null degeneraban claves
// como "NaN,NaN" (chunks fantasma) y Math.hypot(NaN, ...) > 7 era false
// (pasaban el guard de distancia y mutaban el mundo con claves basura).
function validCoords(x, y, z) {
	return (
		typeof x === "number" &&
		typeof y === "number" &&
		typeof z === "number" &&
		Number.isFinite(x) &&
		Number.isFinite(y) &&
		Number.isFinite(z)
	);
}

// Distancia máxima (bloques) por move (anti-cheat de velocidad instantánea).
const MOVE_MAX_DIST = 1.2;

// Umbrales de la ventana deslizante de velocidad horizontal (F16, C3/SEC-1):
// ráfagas de ~0.8 bloques a 20/s pasan el límite por-move pero son ~16
// bloques/s sostenidos; la ventana (1200 ms) mide bloques/s reales y corrige
// si supera 7 (el sprint legítimo es ~5.6). Con timestamps REALES (no el
// intervalo clavado a 50 ms) para no inflar el tiempo medido (F16-03 bypass A).
const SPEED_WINDOW_MS = 1200;
const MAX_H_SPEED = 7;

// Envía un teleport de corrección al último punto aceptado.
function rejectMove(ws, p) {
	ws.send(
		JSON.stringify({
			event: "teleport",
			data: { x: p.x, y: p.y, z: p.z }
		})
	);
}

// Valida un `move` completo. `ctx` inyecta las dependencias del llamador
// (net.js) para evitar ciclos de require: { world, constants, isSolidBlock,
// respawnPlayer } — `constants` lleva B, EYE_HEIGHT, JUMP_SPEED y
// worldHalfExtent. Devuelve null (rechazado; el teleport ya se envió) o
// { x, y, z, cx, cz, yaw, pitch, vyObs, nowMs } para aceptar el move.
function handleMove(p, ws, data, ctx) {
	const { x, y, z, yaw, pitch } = data;
	const { world, constants, isSolidBlock, respawnPlayer } = ctx;
	const { B, EYE_HEIGHT, JUMP_SPEED } = constants;

	// C2 (SV-3/SEC-3): `typeof number` deja pasar NaN; rechazarlo evita
	// corromper p.x/p.y/p.z y los chunks generados "NaN,NaN".
	if (!validCoords(x, y, z)) return null;
	// Fase 7: caer del mundo (void). Se comprueba ANTES del anti-cheat de
	// velocidad: una caída acelerada supera el límite por-move y sus moves se
	// rechazarían (teleport al último punto aceptado), por lo que el jugador
	// nunca alcanzaría VOID_Y por debajo del mundo.
	if (y < constants.VOID_Y) {
		respawnPlayer(p, "void"); // Fase 10 (B2): causa
		return null;
	}
	// Fase 10 (B1): límites del mundo — el jugador no puede salirse; si el
	// cliente reporta una posición fuera del borde se sujeta al límite (en vez
	// de teletransportar de vuelta, que haría "rebotar" en la frontera).
	const half = constants.worldHalfExtent();
	const cx = Math.max(-half + 0.6, Math.min(half - 0.6, x));
	const cz = Math.max(-half + 0.6, Math.min(half - 0.6, z));
	const dist = Math.hypot(cx - p.x, cz - p.z, y - p.y);
	if (dist > MOVE_MAX_DIST) {
		rejectMove(ws, p);
		return null;
	}
	// El agua no es sólida: nadar (estar dentro de un bloque de agua) es
	// legítimo. Solo se rechaza si el jugador está dentro de un sólido.
	// Fase 13 (L2/L3): la validación usa world.isSolidAt (COLISIÓN POR FORMA),
	// no isSolidBlock puro: una losa solo es sólida en su mitad inferior, una
	// escalera en su escalón, y una puerta abierta no bloquea (state.doors).
	if (world.isSolidAt(x, y, z) || world.isSolidAt(x, y + 1.5, z)) {
		rejectMove(ws, p);
		return null;
	}
	// Fase 8 (mejora documentada): anti-cheat de vuelo — validar el ASCENSO
	// contra la parábola del salto. Un salto legítimo parte de JUMP_SPEED
	// bloques/s (máx ~0.35 bloques en un move de 50 ms) y la gravedad lo frena;
	// subir más rápido (o subir durante >1 s seguido sin tocar suelo) es
	// físicamente imposible y denota un cliente alterado "volando". El dt se
	// mide con mínimo de 50 ms (el intervalo de envío del cliente) para no
	// falsear la velocidad con ráfagas de red. En el agua no aplica (nadar
	// hacia arriba es legítimo).
	const nowMs = Date.now();
	const dtSec = Math.max(0.05, (nowMs - (p.lastMoveTime || nowMs - 50)) / 1000);
	const vyObs = (y - p.y) / dtSec; // bloques/s (negativo = cae)
	p.vyObs = vyObs;
	const feetBlock = world.getBlock(
		Math.floor(x),
		Math.floor(y - EYE_HEIGHT - 0.1),
		Math.floor(z)
	);
	const inWater = feetBlock === B.WATER;
	const inAir = !isSolidBlock(feetBlock) && !inWater;
	p.airTimeMs = inAir ? (p.airTimeMs || 0) + dtSec * 1000 : 0;
	// Fase 9 (Bloque C): en CREATIVE el ascenso sostenido es VUELO legítimo
	// (doble espacio), no un cheat: se salta la validación de la parábola. El
	// límite de velocidad y los sólidos siguen aplicando.
	// Fase 16 (C3, SEC-1): el anti-cheat también caza el HOVER — antes la
	// condición `y - p.y > 0` excluía dy = 0, así que mantenerse en el aire
	// >1 s sin subir ni caer (flotar) no disparaba nada. Ahora, en el aire y
	// sin descender (dy ≥ −0.001; la caída legítima, dy < 0, sigue exenta
	// porque dura >1 s), el tiempo acumulado cuenta igual.
	const dy = y - p.y;
	const hovering = dy >= -0.001; // sube o se mantiene (no cae)
	// F16-03 (auditoría 2026-08-11, bypass B): hundimiento LENTO — dy entre
	// −0.02 y −0.001 por move nunca daba `hovering` (dy ≥ −0.001) y un cliente
	// podía "flotar" descendiendo indefinidamente. Se acumula el descenso
	// total mientras se está en el aire (p.hoverSink): tras >1 s, una caída
	// real ya ha bajado >3 bloques (GRAVITY 18, la parábola del salto), así
	// que descender en total <2 bloques sostenido es flotar sin caer.
	if (inAir) {
		if (dy < 0) p.hoverSink = (p.hoverSink || 0) - dy;
	} else {
		p.hoverSink = 0; // al tocar suelo se descarta la deriva
	}
	if (inAir && p.gamemode !== "creative") {
		// Parábola del salto: vy = JUMP_SPEED − GRAVITY·t (máx al iniciar el
		// salto). Margen 1.5× por latencia/jitter; además ningún salto legítimo
		// sube más de ~0.4 s seguido (tras >1 s en el aire, subir o flotar es
		// volar).
		const spike = dy > 0 && (vyObs > JUMP_SPEED * 1.5 || p.airTimeMs > 1000);
		const flotando =
			(hovering || (dy < 0 && (p.hoverSink || 0) < 2)) && p.airTimeMs > 1000;
		if (spike || flotando) {
			rejectMove(ws, p);
			return null;
		}
	}
	// Fase 16 (C3, SEC-1): ventana deslizante de velocidad horizontal. Ver
	// SPEED_WINDOW_MS/MAX_H_SPEED (arriba) y el comentario de F16-03 en el
	// módulo: se mide la ventana REAL con los timestamps (distancia total ÷
	// tiempo real transcurrido, piso de 0.1 s solo para no dividir por un
	// micro-instante con un puñado de muestras).
	if (p.gamemode !== "creative") {
		let sumDist = 0;
		let first = Infinity,
			last = 0,
			n = 0;
		for (const s of p.speedSamples) {
			if (nowMs - s.t > SPEED_WINDOW_MS) continue; // muestra vieja
			sumDist += s.dist;
			n++;
			if (s.t < first) first = s.t;
			if (s.t > last) last = s.t;
		}
		const realElapsed = (last - first) / 1000;
		if (
			n >= 2 &&
			realElapsed >= 0.05 &&
			sumDist / Math.max(0.1, realElapsed) > MAX_H_SPEED
		) {
			rejectMove(ws, p);
			return null;
		}
	}
	return { x, y, z, cx, cz, yaw, pitch, vyObs, nowMs };
}

module.exports = { validCoords, handleMove, MOVE_MAX_DIST };
