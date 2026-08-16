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
const world = require("./world.js"); // atomicWrite (swap atómico tmp+rename)

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
function savePlayer(player) {
	const data = playerSnapshot(player);
	if (!data) return;
	try {
		if (!fs.existsSync(playersDir()))
			fs.mkdirSync(playersDir(), { recursive: true });
		const f = playerFilePath(player.name);
		// Auditoría 2026-08-15 (F4): rotación de copia — antes de sobrescribir
		// se preserva el archivo anterior en <nombre>.json.bak (misma rotación
		// que world.json). Si el guardado nuevo se corrompe a medias, el backup
		// permite recuperar el inventario/posición previos a mano.
		if (fs.existsSync(f)) {
			try {
				fs.copyFileSync(f, `${f}.bak`);
			} catch (e) {
				log.warn(
					`⚠️  No se pudo crear el backup de ${player.name}: ${e.message}`
				);
			}
		}
		world.atomicWrite(f, JSON.stringify(data, null, 2));
	} catch (e) {
		log.warn(`⚠️  No se pudo guardar el jugador ${player.name}: ${e.message}`);
	}
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
	restorePlayer
};
