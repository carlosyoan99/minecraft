"use strict";

// ============================================================
// PERSISTENCIA DE JUGADORES (Fase 17, B1 — extraído en Fase 18, D-4)
// El estado del jugador (inventario, salud/comida, XP, posición, armadura,
// punto de reaparición) se guarda por NOMBRE en un archivo ADITIVO
// world/<semilla>/players/<nombre>.json. No toca SCHEMA_VERSION ni el
// formato de chunks/meta: retrocompatible por definición (un mundo v6 sin
// carpeta players/ carga igual). Se guarda al desconectar y en el autosave;
// se restaura al conectar por nombre (patrón de las mascotas F12: el nombre
// es la identidad persistida, los ids son de sesión).
// ============================================================
const fs = require("node:fs");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const path = require("node:path");
const constants = require("./constants.js");
const state = require("./state.js");
const world = require("./world.js"); // atomicWrite (swap atómico tmp+rename)

// REN-1 (v20.2): el autosave de jugadores va por la MISMA estrategia que los
// chunks (save-chunks.js): lotes con setImmediate que ceden el turno al event
// loop. Con muchos jugadores, escribir N archivos de una vez en el setInterval
// bloquea el tick; aquí cada lote escribe pocos archivos y suelta el bucle.
const PLAYERS_SAVE_BATCH = 4; // jugadores por lote
let playersAsyncSaving = false;

// Atajos a las rutas del mundo ACTIVO (holder mutable de constants.js: la
// semilla puede cambiar en runtime con switchWorld).
const P = constants.worldPaths;

function playersDir() {
	return path.join(P.worldDir, "players");
}
function playerFilePath(name) {
	return path.join(playersDir(), `${sanitizePlayerFile(name)}.json`);
}
function sanitizePlayerFile(name) {
	return (
		String(name || "jugador")
			.replace(/[^a-zA-Z0-9_-]+/g, "_")
			.slice(0, 40) || "jugador"
	);
}

// Snapshot de los campos del jugador que se persisten (null si no aplica:
// en menú o jugador fantasma). El wire del jugador es el mismo JSON plano.
function playerSnapshot(player) {
	if (!player || player.inMenu || !P.currentSeed) return null;
	return {
		name: player.name,
		inventory: player.inventory,
		armor: player.armor,
		selectedSlot: player.selectedSlot,
		health: player.health,
		food: player.food,
		saturation: player.saturation,
		xp: player.xp,
		level: player.level,
		x: player.x,
		y: player.y,
		z: player.z,
		yaw: player.yaw,
		pitch: player.pitch,
		respawnPoint: player.respawnPoint
	};
}
// Escribe un snapshot en su archivo (copia previa .bak + swap atómico).
// La ruta se recibe ya calculada (playerFilePath al programar): la cola
// puede drenar después de que el mundo activo cambie (switchWorld), y el
// archivo debe ir a la semilla del momento del autosave, no a la actual.
function writePlayerData(f, data) {
	try {
		if (!fs.existsSync(path.dirname(f)))
			fs.mkdirSync(path.dirname(f), { recursive: true });
		// Auditoría 2026-08-15 (F4): rotación de copia — antes de sobrescribir
		// se preserva el archivo anterior en <nombre>.json.bak (misma rotación
		// que world.json). Si el guardado nuevo se corrompe a medias, el backup
		// permite recuperar el inventario/posición previos a mano.
		if (fs.existsSync(f)) {
			try {
				fs.copyFileSync(f, `${f}.bak`);
			} catch (e) {
				log.warn(`⚠️  No se pudo crear el backup de ${data.name}: ${e.message}`);
			}
		}
		world.atomicWrite(f, JSON.stringify(data, null, 2));
	} catch (e) {
		log.warn(`⚠️  No se pudo guardar el jugador ${data.name}: ${e.message}`);
	}
}
function savePlayer(player) {
	writePlayerData(playerFilePath(player.name), playerSnapshot(player));
}

// REN-1 (v20.2): autosave de jugadores por la cola asíncrona. Idempotente
// (si una cola está en curso, esa drena el resto). Los snapshots se toman al
// PROGRAMAR (momento del autosave), no al escribir: así el estado es el del
// intervalo, aunque un jugador cambie mientras se drena la cola. Igual con
// la ruta del archivo: el drenado puede llegar después de un switchWorld y
// no debe reescribir el mundo equivocado.
function savePlayersAsync() {
	if (!P.currentSeed) return;
	if (playersAsyncSaving) return;
	const list = [];
	for (const p of state.players.values()) {
		const data = playerSnapshot(p);
		if (data) list.push({ f: playerFilePath(p.name), data });
	}
	if (!list.length) return;
	playersAsyncSaving = true;
	const processBatch = () => {
		let n = 0;
		while (list.length) {
			const { f, data } = list.shift();
			writePlayerData(f, data);
			if (++n >= PLAYERS_SAVE_BATCH) break;
		}
		if (list.length) {
			setImmediate(processBatch); // ceder el turno: el tick sigue
			return;
		}
		playersAsyncSaving = false;
	};
	setImmediate(processBatch);
}

// Restaura el estado persistido del jugador (por nombre) en la instancia
// recién creada. Lectura defensiva: campos inválidos se ignoran (los
// archivos son locales, pero nunca se confía en el formato). Devuelve true
// si había datos y se aplicaron (posiblemente en parte).
function restorePlayer(player) {
	if (!player || player.inMenu || !P.currentSeed) return false;
	let data;
	try {
		const f = playerFilePath(player.name);
		if (!fs.existsSync(f)) return false;
		data = JSON.parse(fs.readFileSync(f, "utf8"));
	} catch (e) {
		log.warn(
			`⚠️  Jugador guardado ilegible (${player.name}), se empieza de cero: ${e.message}`
		);
		return false;
	}
	if (Array.isArray(data.inventory) && data.inventory.length === 36)
		player.inventory = data.inventory;
	if (data.armor && typeof data.armor === "object")
		player.armor = {
			helmet: data.armor.helmet ?? null,
			chestplate: data.armor.chestplate ?? null,
			leggings: data.armor.leggings ?? null,
			boots: data.armor.boots ?? null
		};
	if (
		typeof data.selectedSlot === "number" &&
		data.selectedSlot >= 0 &&
		data.selectedSlot < 9
	)
		player.selectedSlot = data.selectedSlot;
	if (typeof data.health === "number")
		player.health = Math.min(player.maxHealth || 20, data.health);
	if (typeof data.food === "number")
		player.food = Math.min(20, Math.max(0, data.food));
	if (typeof data.saturation === "number")
		player.saturation = Math.min(20, Math.max(0, data.saturation));
	if (typeof data.xp === "number" && data.xp >= 0) {
		player.xp = data.xp;
		player.level = typeof data.level === "number" ? data.level : 0;
	}
	if (
		typeof data.x === "number" &&
		typeof data.y === "number" &&
		typeof data.z === "number" &&
		Number.isFinite(data.x) &&
		Number.isFinite(data.y) &&
		Number.isFinite(data.z)
	) {
		player.x = data.x;
		player.y = data.y;
		player.z = data.z;
	}
	if (typeof data.yaw === "number") player.yaw = data.yaw;
	if (typeof data.pitch === "number") player.pitch = data.pitch;
	if (data.respawnPoint && typeof data.respawnPoint === "object")
		player.respawnPoint = data.respawnPoint;
	return true;
}

module.exports = {
	playersDir,
	playerFilePath,
	sanitizePlayerFile,
	playerSnapshot,
	savePlayer,
	savePlayersAsync,
	restorePlayer
};
