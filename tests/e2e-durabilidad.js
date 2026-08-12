"use strict";
// E2E del sistema de durabilidad de herramientas (Fase 5) — v3
// 1) Craftear un pico de madera (200) vía el evento `craft` (el grid viaja
//    con el patrón 3x3; el servidor consume las celdas y añade el pico).
// 2) Romper exactamente su durabilidad (59) de bloques de piedra: cada
//    rotura desgasta -1 en el wire (inventory_update) y añade 1 adoquín.
// 3) Al llegar a 0 la herramienta se rompe: llega `tool_broke`, el slot
//    queda vacío y los drops son exactamente 1 por bloque roto (sin duplicar).
//
// Fase 6 (minería fina): cada `break` inicia una sesión de minería que el
// servidor completa según dureza/velocidad de herramienta (pico de madera
// sobre piedra ≈ 0.9 s) — el E2E espera el inventory_update de cada rotura.
//
// Robustez: si el área del spawn ya fue minada (p.ej. una ejecución previa
// contra el mismo mundo) y no quedan >= DURABILITY piedras a mano, el jugador camina
// vía eventos `move` (siguiendo el terreno del chunkData) hasta encontrar zona
// virgen. La caminata es por ráfagas de 8 con un `setTimeout` de asentamiento:
// los pasos rechazados disparan `teleport` y `cur` se corrige ANTES de computar
// los bloques a romper (si se computaran antes, los breaks apuntarían a >7
// bloques y el servidor los ignoraría silenciosamente → timeout).
//
// Detalles de la caminata (aprendidos ejecutándola contra el mundo real):
//   - Cada paso respeta el límite anti-cheat del servidor (dist <= 1.2):
//     la Y avanza como mucho 0.5 por paso, así una pendiente/acantilado no
//     rechaza el movimiento.
//   - En columnas de agua se nada a nivel de superficie (no al fondo, que
//     daría un salto vertical inválido); el agua no es sólida para el
//     servidor, igual que en el cliente real.
//   - Si una dirección queda bloqueada (sin progreso neto tras una ráfaga),
//     se gira a la siguiente (E → O → N → S).
//
// NOTA: ejecutar contra un servidor desechable — rompe 59 bloques de piedra
// cerca del jugador y el autosave (30s) los persiste en ese mundo.
//
// Requiere un servidor vivo: WS_URL (por defecto ws://localhost:3998).
const WebSocket = require("ws");
const URL = process.env.WS_URL || "ws://localhost:3998";

const WOODEN_PICKAXE = 200;
const DURABILITY = 59; // madera (TOOL_DURABILITY[200]) — Fase 13 B6: 59 es el valor real de MC
const STONE = 3,
	COBBLESTONE = 8,
	PLANKS = 7,
	STICK = 100,
	WATER = 20;
const REACH = 6.5; // el servidor rechaza break a > 7 bloques
const WALK_MAX = 64; // máximo de bloques a caminar hacia terreno virgen
// Direcciones a explorar en busca de zona virgen (E → O → N → S); se gira
// cuando una dirección queda bloqueada (lago, acantilado, terreno empinado).
const DIRS = [
	[1, 0],
	[-1, 0],
	[0, 1],
	[0, -1]
];
let dirIdx = 0;
const WORLD_H = 64; // altura del mundo (world.js)

const results = [];
let finished = false;
const t0 = Date.now();
const worldMap = new Map(); // "cx,cz" -> array de ids (init + chunks_add)
let breakCandidates = [];
let pickSlot = -1;
let breaksSent = 0; // roturas enviadas (el wire confirma 1 a 1)
let cur = { x: 0, y: 64, z: 0 }; // posición actual conocida del jugador
let walkTimer = null;
let walked = 0; // bloques caminados en total
let phase = "init";

function check(name, ok, _info) {
	results.push({ name, ok });
}
function finish(exitCode) {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	if (walkTimer) clearTimeout(walkTimer);
	const fails = results.filter((r) => r.ok === false).length;
	process.exit(exitCode !== undefined ? exitCode : fails ? 1 : 0);
}

const timer = setTimeout(() => {
	// Diagnóstico al expirar: sin esto un timeout moría sin decir qué faltó.
	console.error(
		`⏰ TIMEOUT E2E (${Math.round((Date.now() - t0) / 1000)}s): fase "${phase}", ${results.length} checks (${results.filter((r) => r.ok === false).length} FAIL)`
	);
	for (const r of results) console.error(`  ${r.ok ? "OK" : "FAIL"} ${r.name}`);
	finish(1);
}, 180000); // 60 minas × ~0.9 s + crafteo/desplazamiento: la secuencia completa
// tarda ~130 s, así que 120 s era un margen demasiado justo y el timer
// disparaba finish(1) aunque los 122 checks pasaran (flakiness de tiempo).
// (La durabilidad 60→59 de la Fase 13 B6 no cambia este margen: 59 minas a
// ~0.9 s + caminata siguen dentro de los 180 s.)

// ============================================================
// HELPERS SOBRE EL CHUNKDATA (mismo idx que world.js: (y*16+z)*16+x)
// ============================================================
function groundY(wx, wz) {
	const arr = worldMap.get(`${Math.floor(wx / 16)},${Math.floor(wz / 16)}`);
	if (!arr) return 4; // chunk desconocido: asumir superficie baja
	const x = ((wx % 16) + 16) % 16,
		z = ((wz % 16) + 16) % 16;
	for (let y = WORLD_H - 1; y >= 0; y--) {
		const id = arr[(y * 16 + z) * 16 + x];
		if (id !== 0 && id !== WATER) return y;
	}
	return 0;
}

// Altura de la superficie del agua en la columna (nivel al que nadar), o null.
function waterTopY(wx, wz) {
	const arr = worldMap.get(`${Math.floor(wx / 16)},${Math.floor(wz / 16)}`);
	if (!arr) return null;
	const x = ((wx % 16) + 16) % 16,
		z = ((wz % 16) + 16) % 16;
	for (let y = WORLD_H - 1; y >= 0; y--) {
		if (arr[(y * 16 + z) * 16 + x] === WATER) return y + 1;
	}
	return null;
}

// Bloques de piedra (3) a <= REACH del punto dado, ordenados por distancia.
function stoneNear(x, y, z) {
	const found = [];
	for (const [key, arr] of worldMap) {
		const [cx, cz] = key.split(",").map(Number);
		for (let i = 0; i < arr.length; i++) {
			if (arr[i] !== STONE) continue;
			const lx = i % 16,
				lz = Math.floor(i / 16) % 16,
				ly = Math.floor(i / 256);
			const wx = cx * 16 + lx,
				wy = ly,
				wz = cz * 16 + lz;
			if (Math.hypot(wx - x, wy - y, wz - z) <= REACH)
				found.push({ x: wx, y: wy, z: wz });
		}
	}
	found.sort(
		(a, b) =>
			Math.hypot(a.x - x, a.y - y, a.z - z) -
			Math.hypot(b.x - x, b.y - y, b.z - z)
	);
	return found;
}

// Fase 10 (A6: lagos/playas/rios en la generación): el spawn de una semilla
// nueva puede caer en zona playeras con poca piedra EXPUESTA a mano, y la
// caminata en espiral a ciegas (dirIdx fija) se quedaba atascada en un lago o
// acantilado sin avanzar. Ahora, cuando no hay DURABILITY piedras a la mano, se camina
// HACIA el chunk con más piedra conocida del mapa (stoneTarget): dirección
// determinista calculada sobre el chunkData, en vez de probar E→O→N→S.
// stoneNear cuenta TODA la piedra (también la subterránea a <= REACH vertical:
// el servidor solo valida distancia, no visibilidad), así que basta acercarse
// a una columna rica para que las DURABILITY roturas queden a <= 7 bloques.
function stoneTarget() {
	// Conteo de piedra por chunk: { cx, cz, count }
	let best = null;
	for (const [key, arr] of worldMap) {
		const [cx, cz] = key.split(",").map(Number);
		let count = 0;
		for (let i = 0; i < arr.length; i++) if (arr[i] === STONE) count++;
		if (count >= DURABILITY && (!best || count > best.count)) {
			best = { cx, cz, count };
		}
	}
	if (!best) return null;
	// Centro del chunk (bloques) hacia el que caminar.
	return { x: best.cx * 16 + 8, z: best.cz * 16 + 8, count: best.count };
}

// Envía una ráfaga de pasos `move` en la dirección actual siguiendo el terreno.
// Cada paso avanza 1 bloque en X/Z pero como mucho 0.5 en Y (límite anti-cheat
// del servidor: dist <= 1.2), y en agua nada a nivel de superficie. Si un paso
// es rechazado, el servidor manda `teleport` y `cur` se corrige en el handler
// ANTES de que se computen candidatos.
function walkBurst(steps) {
	const [dx, dz] = DIRS[dirIdx];
	for (let i = 0; i < steps; i++) {
		const nx = cur.x + dx,
			nz = cur.z + dz;
		const ground = groundY(nx, nz) + 2; // a 2 bloques sobre el suelo firme
		const waterTop = waterTopY(nx, nz);
		const target = waterTop !== null && waterTop > ground ? waterTop : ground;
		// Paso gradual: nunca saltar más de 0.5 en Y por paso
		const ny = Math.max(Math.min(target, cur.y + 0.5), cur.y - 0.5);
		ws.send(
			JSON.stringify({
				event: "move",
				data: { x: nx, y: ny, z: nz, yaw: 0, pitch: 0 }
			})
		);
		cur = { x: nx, y: ny, z: nz };
	}
}

// Busca zona con >= DURABILITY piedras a mano: en el spawn si las hay; si no,
// camina por ráfagas de 8 HACIA el chunk con más piedra del mapa (stoneTarget),
// dejando 300ms de asentamiento entre ráfaga y ráfaga (tiempo para que lleguen
// los `teleport` de pasos rechazados y `cur` quede correcto) y solo entonces
// computa los bloques a romper desde esa posición. Si el objetivo queda a la
// espalda o no hay progreso neto, se gira a la siguiente dirección cardinal
// (las ráfagas en espiral siguen funcionando como fallback).
// Si el spawn cae en un lago o zona ya minada por una corrida anterior, la
// caminata en espiral puede atascarse; un /tp directo al chunk con más piedra
// del mapa (stoneTarget) es determinista y barato: el servidor acepta /tp.
let _tpPending = false;
let _tpTries = 0;
function tryFreshArea() {
	const near = stoneNear(cur.x, cur.y, cur.z);
	if (near.length >= DURABILITY) {
		check(
			`hay >= ${DURABILITY} bloques de piedra a mano`,
			true,
			`${near.length} encontrados (caminados ${walked} bloques)`
		);
		breakCandidates = near;
		const b = breakCandidates[0];
		ws.send(
			JSON.stringify({
				event: "block_action",
				data: { action: "break", x: b.x, y: b.y, z: b.z }
			})
		);
		breaksSent = 1;
		phase = "breaking";
		return;
	}
	if (walked >= WALK_MAX && !_tpPending) {
		// Zona sin piedra a mano tras caminar: /tp al chunk más rico del mapa.
		const target = stoneTarget();
		if (!target || _tpTries >= 3) {
			check(
				`hay >= ${DURABILITY} bloques de piedra a mano`,
				false,
				`solo ${near.length} tras caminar ${walked} bloques`
			);
			finish(1);
			return;
		}
		// Altura del suelo en el objetivo: 2 bloques sobre la superficie sólida.
		const ground = groundY(target.x, target.z);
		_tpPending = true;
		_tpTries++;
		ws.send(
			JSON.stringify({
				event: "chat",
				data: { message: `/tp ${target.x} ${ground + 2} ${target.z}` }
			})
		);
		// El /tp dispara un teleport que re-dispara tryFreshArea desde la nueva
		// posición (el handler lo encola con 300ms de asentamiento).
		return;
	}
	const startKey = `${cur.x},${cur.z}`; // cur ya corregido por teleports
	// Dirección preferente: hacia el chunk con más piedra del mapa (Fase 10).
	const target = stoneTarget();
	if (target) {
		const dx = target.x - cur.x;
		const dz = target.z - cur.z;
		if (Math.abs(dx) > Math.abs(dz))
			dirIdx = dx > 0 ? 0 : 1; // E / O
		else dirIdx = dz > 0 ? 2 : 3; // N / S
	}
	walkBurst(8);
	walked += 8;
	walkTimer = setTimeout(() => {
		// Tras el asentamiento, comparar la posición REAL: girar de dirección si
		// (a) la ráfaga no movió al jugador (acantilado/terreno empinado) o
		// (b) el nuevo radio no tiene piedra a mano — señal de que el jugador se
		// adentró en un lago profundo/amplio, donde la piedra queda fuera del
		// alcance de rotura.
		if (
			`${cur.x},${cur.z}` === startKey ||
			stoneNear(cur.x, cur.y, cur.z).length === 0
		) {
			dirIdx = (dirIdx + 1) % DIRS.length;
		}
		tryFreshArea();
	}, 300);
}

const ws = new WebSocket(URL);
ws.on("message", (d) => {
	let m;
	try {
		m = JSON.parse(d);
	} catch {
		return;
	}
	const _t = Math.round((Date.now() - t0) / 1000);

	// ============ INIT: almacenar mundo y craftear el pico ============
	if (phase === "init" && m.event === "init") {
		const d = m.data;
		cur = { x: d.spawnX, y: d.spawnY, z: d.spawnZ };
		for (const [key, arr] of Object.entries(d.chunkData))
			worldMap.set(key, arr);
		// Craftear pico de madera: patrón ["###"," I "," I "] (3 planks 7 + 2 sticks 100).
		// Auditoría 2026-08-09 (§1.2): `craft` ya NO acepta data.grid — la grid
		// es siempre la del servidor (p.craftingGrid), llenada vía grid_set que
		// descuenta ítems REALES del inventario. Antes este test enviaba la grid
		// como bootstrap sin tener los materiales; ahora los pide con /give y
		// replica el flujo legítimo del cliente (grid_set + craft).
		ws.send(JSON.stringify({ event: "chat", data: { message: "/give 7 3" } }));
		ws.send(
			JSON.stringify({ event: "chat", data: { message: "/give 100 2" } })
		);
		phase = "give-materiales";
		return;
	}

	// ============ GIVE MATERIALES → GRID_SET + CRAFT DEL PICO ============
	if (phase === "give-materiales" && m.event === "inventory_update") {
		const planks = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === PLANKS ? s.count : 0),
			0
		);
		const sticks = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === STICK ? s.count : 0),
			0
		);
		if (planks < 3 || sticks < 2) return; // esperar a que lleguen ambos /give
		const planksSlot = m.data.inventory.findIndex((s) => s && s.id === PLANKS);
		const sticksSlot = m.data.inventory.findIndex((s) => s && s.id === STICK);
		// grid_set descuenta 1 unidad real por mensaje; 3+2 celdas del patrón.
		for (const i of [0, 1, 2])
			ws.send(
				JSON.stringify({
					event: "grid_set",
					data: { fromInventorySlot: planksSlot, toGridSlot: i }
				})
			);
		for (const i of [4, 7])
			ws.send(
				JSON.stringify({
					event: "grid_set",
					data: { fromInventorySlot: sticksSlot, toGridSlot: i }
				})
			);
		ws.send(JSON.stringify({ event: "craft", data: {} }));
		phase = "craft";
		return;
	}

	// ============ CHUNKS_ADD: ampliar el mapa del mundo mientras se camina ============
	if (m.event === "chunks_add") {
		for (const [key, arr] of Object.entries(m.data.chunkData))
			worldMap.set(key, arr);
		return;
	}

	// ============ TELEPORT: paso rechazado → corregir posición (en cualquier fase) ============
	if (m.event === "teleport") {
		cur = { x: m.data.x, y: m.data.y, z: m.data.z };
		// Fase 10: el /tp hacia el chunk rico llegó — reintentar desde la nueva
		// posición (con asentamiento para que el chunkData llegue antes del break).
		if (_tpPending) {
			_tpPending = false;
			walkTimer = setTimeout(() => tryFreshArea(), 400);
		}
		return;
	}

	// ============ CRAFT: confirmar durabilidad plena y seleccionarlo ============
	if (phase === "craft" && m.event === "inventory_update") {
		const pickIdx = m.data.inventory.findIndex(
			(s) => s && s.id === WOODEN_PICKAXE
		);
		// Los grid_set del bootstrap responden con inventory_update SIN el pico
		// todavía (uno por celda, con el material descontado); esperar al del
		// craft, que es el primero que ya incluye el pico crafteado.
		if (pickIdx === -1) return;
		check(
			"el pico se craftea con durabilidad plena (59)",
			m.data.inventory[pickIdx].durability === DURABILITY,
			`slot=${pickIdx} dur=${m.data.inventory[pickIdx].durability}`
		);
		pickSlot = pickIdx;
		ws.send(
			JSON.stringify({ event: "inventory_select", data: { slot: pickSlot } })
		);
		// Elegir zona con suficiente piedra (camina si el spawn ya fue minado)
		tryFreshArea();
		return;
	}

	// ============ BREAKING: -1 por rotura y 1 drop exacto por bloque ============
	if (phase === "breaking" && m.event === "inventory_update") {
		const pick = m.data.inventory[pickSlot];
		const cobble = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === COBBLESTONE ? s.count : 0),
			0
		);
		if (breaksSent < DURABILITY) {
			// Tras `breaksSent` roturas confirmadas: durabilidad = DURABILITY - breaksSent
			const expected = DURABILITY - breaksSent;
			check(
				`rotura ${breaksSent}/${DURABILITY}: durabilidad ${expected}`,
				pick && pick.id === WOODEN_PICKAXE && pick.durability === expected,
				`dur=${pick?.durability}`
			);
			check(
				`rotura ${breaksSent}/${DURABILITY}: 1 adoquín exacto (sin duplicar)`,
				cobble === breaksSent,
				`adoquín=${cobble}`
			);
			const b = breakCandidates[breaksSent];
			ws.send(
				JSON.stringify({
					event: "block_action",
					data: { action: "break", x: b.x, y: b.y, z: b.z }
				})
			);
			breaksSent++;
			return;
		}
		// Última rotura (breaksSent === DURABILITY): la herramienta ya no está
		check(
			"la herramienta se rompió al 59º uso (slot vacío)",
			!pick,
			`slot=${JSON.stringify(pick)}`
		);
		check(
			"drops exactos: 59 adoquines, sin copias fantasma del pico",
			cobble === DURABILITY &&
				m.data.inventory.filter((s) => s && s.id === WOODEN_PICKAXE).length ===
					0,
			`adoquín=${cobble}`
		);
		return;
	}

	// ============ TOOL_BROKE: evento de rotura ============
	if (phase === "breaking" && m.event === "tool_broke") {
		check("evento tool_broke recibido", true, `slot=${m.data.slot}`);
		check(
			"tool_broke avisa del slot correcto",
			m.data.slot === pickSlot,
			`slot=${m.data.slot} pick=${pickSlot}`
		);
		phase = "done";
		finish(); // sin argumento: el exit code depende de los FAILs acumulados
		return;
	}
});
ws.on("error", (_e) => {
	finish(1);
});
