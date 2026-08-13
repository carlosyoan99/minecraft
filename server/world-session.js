"use strict";
// ============================================================
// SESIÓN DE MUNDOS (Fase 18, D-1 — extraído de server/net.js)
// Gestión del mundo ACTIVO desde el menú: elegir/crear (join_world),
// cambiar de semilla (set_seed), volver al menú (leave_world) y las
// operaciones de gestión SOLO de operadores (world_delete/clone/rename/
// gamemode). Todas usan `save` como fuente de verdad del disco y la
// cuota anti-spam compartida (seedCooldownUntil).
//
// Cada handler recibe un ctx inyectado desde net.js (evita ciclos de
// require): { state, save, world, constants, broadcast, enterWorld,
// sendInit } y devuelve void (el case del switch hace break).
// ============================================================

// Rechazo con la cuota anti-spam (10 s, F16 C4/SEC-2): join_world y
// set_seed comparten el mismo cooldown (ambos re-ejecutan switchWorld,
// persistencia síncrona + chunks dirty — sin cuota llenaban el disco y
// congelaban el event loop).
function cooldownRejected(p, ws) {
	if (p.seedCooldownUntil && p.seedCooldownUntil > Date.now()) {
		ws.send(
			JSON.stringify({
				event: "seed_rejected",
				data: { reason: "cooldown" }
			})
		);
		return true;
	}
	return false;
}

// Fase 17 (A1/A5): el PRIMER jugador elige/crea el mundo activo desde el
// menú. Reutiliza switchWorld (persiste el mundo actual si lo hubiera,
// carga/genera el pedido y reenvía el init). Solo aplica a jugadores que
// aún están en el menú; los que conectan después de que el mundo esté
// activo reciben el init directo.
function handleJoinWorld(ctx, p, ws, data, playerId) {
	const { state, save, world, constants, enterWorld, sendInit, broadcast } = ctx;
	if (!p.inMenu) return;
	if (typeof data.seed !== "string" || !data.seed.trim()) return;
	if (cooldownRejected(p, ws)) return;
	// Otro jugador ya está jugando (este cliente se quedó en el menú
	// mientras el mundo se cargaba): no cambiarle el mundo bajo sus pies.
	const someonePlaying = Array.from(state.players.values()).some(
		(q) => q.id !== playerId && !q.inMenu
	);
	if (someonePlaying) {
		ws.send(
			JSON.stringify({
				event: "seed_rejected",
				data: { reason: "others" }
			})
		);
		return;
	}
	// F16-03/F16-06 (auditoría 2026-08-11): la cuota se reserva SOLO cuando
	// el cambio va a proceder — antes se reservaba antes de comprobar
	// `someonePlaying` y un rechazo legítimo por "others" pagaba la cuota
	// de 10 s igualmente.
	p.seedCooldownUntil = Date.now() + 10000; // 10 s (cuota)
	// Fase 7: `name` (opcional) da nombre al mundo nuevo (world.json); si
	// la semilla ya existe, el nombre guardado en disco gana (loadWorld).
	// Fase 9 (Bloque B): `gamemode` fija el modo del mundo NUEVO.
	// Fase 10 (B1): `size` el tamaño del mundo NUEVO.
	const mode = constants.sanitizeGamemode(data.gamemode);
	const size = constants.sanitizeWorldSize(data.size);
	const seed = data.seed.trim();
	let r = save.switchWorld(seed, data.name, mode, size);
	if (r === "same" && !constants.worldPaths.currentSeed) {
		// En modo menú currentSeed es null → seedDir(null) = "default" es el
		// directorio del menú. Si el mundo pedido colisiona con él (p. ej.
		// semilla "default"), cargarlo directamente con la semilla real
		// (switchWorld devolvió "same" por la colisión).
		constants.setWorldSeed(seed, data.name || seed, mode);
		constants.worldPaths.worldSize = size;
		world.reinitNoise(seed);
		save.loadWorld();
		r = true;
	}
	if (r === "rechazo" || r === "error") {
		ws.send(
			JSON.stringify({ event: "seed_rejected", data: { reason: r } })
		);
		return;
	}
	p.inMenu = false;
	enterWorld(p);
	sendInit(p); // confirmación: el cliente la usa para cerrar la carga
	broadcast(
		"player_join",
		{
			id: playerId,
			name: p.name,
			x: p.x,
			y: p.y,
			z: p.z,
			skin: p.skin || "steve" // Fase 17
		},
		playerId
	);
}

// Fase 6: campo de semilla del menú del cliente. El servidor es la fuente
// de verdad: cambia el mundo activo (persistiendo el actual) y reenvía el
// init con el mundo de la semilla pedida. Servidor dedicado: solo se cambia
// si este jugador es el ÚNICO en línea (los demás verían el mundo cambiar
// bajo sus pies).
function handleSetSeed(ctx, p, ws, data) {
	const { state, save, constants, enterWorld, sendInit } = ctx;
	if (typeof data.seed !== "string" || !data.seed.trim()) return;
	if (cooldownRejected(p, ws)) return;
	if (state.players.size > 1) {
		ws.send(
			JSON.stringify({
				event: "seed_rejected",
				data: { reason: "others" }
			})
		);
		return;
	}
	// F16-03/F16-06 (auditoría 2026-08-11): la cuota se reserva SOLO cuando
	// el cambio va a proceder — antes se reservaba antes de comprobar
	// `state.players.size > 1` y un rechazo legítimo por "others" pagaba la
	// cuota de 10 s igualmente.
	p.seedCooldownUntil = Date.now() + 10000; // 10 s (cuota)
	const seed = data.seed.trim();
	// Fase 7: `name` (opcional) da nombre al mundo nuevo (world.json); si la
	// semilla ya existe, el nombre guardado en disco gana (loadWorld).
	// Fase 9 (Bloque B): `gamemode` (opcional) fija el modo del mundo NUEVO
	// (survival/creative); un mundo existente conserva el suyo.
	const mode = constants.sanitizeGamemode(data.gamemode);
	// Fase 10 (B1): tamaño del mundo nuevo (pequeño/medio/grande).
	const size = constants.sanitizeWorldSize(data.size);
	const r = save.switchWorld(seed, data.name, mode, size);
	if (r === "rechazo" || r === "error") {
		ws.send(
			JSON.stringify({ event: "seed_rejected", data: { reason: r } })
		);
		return;
	}
	if (r === true) enterWorld(p); // mundo nuevo: entrar de cero
	sendInit(p); // confirmación: el cliente la usa para cerrar la carga
}

// Auditoría 2026-08-09 (§1.3): borrar un mundo borra archivos del disco, así
// que es una operación SOLO de operadores (igual que /give, /tp, /gamemode).
// Fase 9 (Bloque B): el servidor rechaza el mundo ACTIVO y valida el nombre
// del directorio (deleteWorld) antes de tocar el disco.
function handleWorldDelete(ctx, p, ws, data) {
	const { save } = ctx;
	if (!p.isOp) {
		ws.send(
			JSON.stringify({
				event: "world_delete_result",
				data: {
					ok: false,
					reason: "solo operadores",
					worlds: save.listWorlds()
				}
			})
		);
		return;
	}
	const r = save.deleteWorld(data?.seed);
	ws.send(
		JSON.stringify({
			event: "world_delete_result",
			data: {
				ok: r.ok,
				reason: r.ok ? null : r.reason,
				worlds: save.listWorlds()
			}
		})
	);
}

// Fase 17 (A3): clonar un mundo (solo operadores — toca disco). Responde al
// MISMO socket con el resultado y la lista actualizada.
function handleWorldClone(ctx, p, ws, data) {
	const { save } = ctx;
	if (!p.isOp) {
		ws.send(
			JSON.stringify({
				event: "worlds_list",
				data: { worlds: save.listWorlds() }
			})
		);
		return;
	}
	const r = save.cloneWorld(data?.seed, data?.name);
	ws.send(
		JSON.stringify({
			event: "world_clone_result",
			data: {
				ok: r.ok,
				seed: r.seed || null,
				reason: r.ok ? null : r.reason,
				worlds: save.listWorlds()
			}
		})
	);
}

// Fase 17 (A3): renombrar un mundo (solo operadores). El mundo ACTIVO se
// puede renombrar (refleja el estado en memoria) pero no clonarse/borrarse
// a sí mismo.
function handleWorldRename(ctx, p, ws, data) {
	const { save } = ctx;
	if (!p.isOp) return;
	const r = save.renameWorld(data?.seed, data?.name);
	ws.send(
		JSON.stringify({
			event: "worlds_list",
			data: { worlds: save.listWorlds() }
		})
	);
	if (!r.ok) {
		ws.send(
			JSON.stringify({
				event: "flash",
				data: { text: "🌍 No se pudo renombrar el mundo." }
			})
		);
	}
}

// Fase 17 (A3): cambiar el modo de juego de un mundo (solo operadores).
function handleWorldGamemode(ctx, p, ws, data) {
	const { save } = ctx;
	if (!p.isOp) return;
	const r = save.setWorldMode(data?.seed, data?.gamemode);
	ws.send(
		JSON.stringify({
			event: "worlds_list",
			data: { worlds: save.listWorlds() }
		})
	);
	if (!r.ok) {
		ws.send(
			JSON.stringify({
				event: "flash",
				data: { text: "🌍 No se pudo cambiar el modo del mundo." }
			})
		);
	}
}

// Fase 17 (C1): volver al menú principal desde la pausa — el jugador
// abandona el mundo (se persiste su estado) y, si es el último, el servidor
// libera el mundo activo y vuelve al modo menú (A1). El cliente sigue
// conectado: recibe menu_state y muestra el menú.
function handleLeaveWorld(ctx, p, ws, playerId) {
	const { state, save, broadcast, constants } = ctx;
	if (p.inMenu) return;
	save.savePlayer(p);
	p.inMenu = true;
	// broadcast player_leave para que los demás clientes lo quiten.
	broadcast("player_leave", { id: playerId });
	if (constants.MENU_MODE && state.players.size === 1) {
		save.releaseWorld();
	} else {
		// Otros jugadores siguen en el mundo: el estado en memoria se mantiene
		// y este jugador deja de recibir broadcast de mundo.
		p.x = 0;
		p.y = 0;
		p.z = 0;
	}
	ws.send(
		JSON.stringify({
			event: "menu_state",
			data: { worlds: save.listWorlds() }
		})
	);
}

module.exports = {
	handleJoinWorld,
	handleSetSeed,
	handleWorldDelete,
	handleWorldClone,
	handleWorldRename,
	handleWorldGamemode,
	handleLeaveWorld
};
