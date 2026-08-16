"use strict";

// ============================================================
// ENTRADA DEL SERVIDOR: carga los módulos por responsabilidad,
// conecta los hooks de broadcast (evitan ciclos de require) y arranca.
// ============================================================
const fs = require("node:fs");
const log = require("./log.js"); // Fase 19.5 (E2): niveles uniformes
const path = require("node:path");
const {
	SAVE_INTERVAL_MS,
	UNLOAD_INTERVAL_MS,
	// Fase 17 (A1): sin SEED en el entorno el servidor arranca en modo menú
	// (no carga ningún mundo; join_world lo hace al elegir/crear uno). Con
	// SEED arranca directo al mundo (indispensable para los E2E).
	MENU_MODE
} = require("./constants.js");
const state = require("./state.js");
const world = require("./world.js");
const save = require("./save.js");
const mobs = require("./mobs.js");
const crafting = require("./crafting.js");
const playerHelpers = require("./players.js");
const tnt = require("./tnt.js"); // Fase 10 (D2)
const net = require("./net.js");

// Hooks de broadcast (dependencia world/save/players -> net, rota aquí)
world.setBlockChangeHandler((x, y, z, block) =>
	net.broadcast("block_update", { x, y, z, block })
);
save.setUnloadHandler((keys) => net.broadcast("chunks_unload", { keys }));
playerHelpers.setBroadcastHandler((event, data) => net.broadcast(event, data));
// Fase 18 (C-8): orbe de XP al morir — el orbe nace en la posición de muerte
// con la XP del jugador (recogible al caminar encima).
playerHelpers.setXpDropHandler((player, xp) =>
	mobs.spawnXpOrb(player.x, player.y, player.z, xp)
);
// Fase 10 (D2): TNT (mecha/explosión) → broadcast a todos los clientes.
tnt.setBroadcastHandler((event, data) => net.broadcast(event, data));

crafting.loadRecipes();

// Hot-reload (Fase 6): recetas y atlas de texturas sin reiniciar el servidor.
// El servidor vigila los archivos: al cambiar, recarga las recetas (swap
// atómico en crafting.reloadRecipes) y avisa a los clientes para que
// regeneren el atlas (el atlas vive en el cliente, se re-importa en caliente).
crafting.watchRecipeFiles((r) => {
	const msg = r.ok
		? `♻️ Recetas recargadas (${r.crafting} crafteo, ${r.furnace} horno)`
		: `⚠️ Recetas NO recargadas: ${r.error} (se mantienen las anteriores)`;
	log.info(msg);
	net.broadcast("chat", { id: "Server", message: msg });
	if (r.ok) net.broadcast("textures_reload", {});
});

const texturesPath = path.join(__dirname, "..", "public", "textures.js");
let texturesTimer = null;
try {
	fs.watch(path.join(__dirname, "..", "public"), (_ev, filename) => {
		if (filename !== "textures.js") return;
		if (texturesTimer) return;
		texturesTimer = setTimeout(() => {
			texturesTimer = null;
			// Si el archivo está a medio reemplazar (borrado temporal del editor),
			// no avisar: los clientes importarían un módulo inexistente.
			if (!fs.existsSync(texturesPath)) return;
			log.info(
				"🎨 Atlas de texturas cambiado: avisando a los clientes (textures_reload)"
			);
			net.broadcast("textures_reload", {});
		}, 200);
	});
} catch (e) {
	log.warn(
		`⚠️  No se pudo vigilar el atlas (hot-reload desactivado): ${e.message}`
	);
}

// Layout antiguo (world.json + chunks en la raíz de world/) → directorio de la
// semilla (world/<semilla>/): cada semilla tiene su propio mundo (bug semilla).
save.migrateWorldLayout();

// Fase 17 (A1): MODO MENÚ. Sin SEED el servidor arranca sin mundo activo: no
// se carga ni se genera nada hasta que el primer jugador elige/crea un mundo
// (join_world → save.switchWorld). Con SEED (E2E/auditorías) se carga el
// mundo al arrancar, como siempre.
if (!MENU_MODE) {
	const loadResult = save.loadWorld();
	if (loadResult === "rechazo") {
		log.error(
			"❌ Arranque abortado: no se pudo abrir el mundo guardado de forma segura (formato más nuevo o datos ilegibles)."
		);
		process.exit(1);
	} else if (!loadResult) {
		// Sin guardado por chunk: probar la migración del world.dat antiguo (v1 → v2)
		if (!save.migrateLegacyWorld()) {
			world.ensureChunksAround(0, 0, 4);
		}
	}
	if (state.mobs.length === 0) for (let i = 0; i < 4; i++) mobs.spawnMobs();
} else {
	log.info(
		"🗂️ Modo menú: sin SEED, no se carga ningún mundo (se elige/crea desde el cliente)."
	);
}

// C1 (REN-1/SV-4): el autosave usa la cola ASÍNCRONA (lotes con
// setImmediate) — el guardado síncrono bloqueaba el event loop con muchos
// chunks sucios. saveWorld() síncrono sigue existiendo para switchWorld y
// SIGINT, que necesitan el resultado inmediato.
// Fase 17 (B1): el autosave también persiste el estado de los jugadores
// conectados (inventario/salud/posición) en su archivo aditivo por nombre.
setInterval(() => {
	save.saveWorldAsync();
	for (const p of state.players.values()) save.savePlayer(p);
}, SAVE_INTERVAL_MS);
setInterval(save.unloadFarChunks, UNLOAD_INTERVAL_MS);
process.on("SIGINT", () => {
	// Auditoría 2026-08-15 (F5): se comprueba el resultado del guardado —
	// si saveWorld() falló (disco lleno/permisos) el error vuelve aquí y no
	// se sale en silencio con el mundo sin persistir.
	const ok = save.saveWorld();
	for (const p of state.players.values()) save.savePlayer(p);
	if (!ok)
		log.error("SIGINT: el guardado final del mundo FALLÓ (pérdida de cambios)");
	process.exit(ok ? 0 : 1);
});
// Fase 19.5 (E1): SIGTERM (kill normal de systemd/Docker/CI) — el mismo
// guardado limpio que SIGINT: el mundo queda íntegro, sin esperar al
// autosave de 30 s. (El autosave periódico ya cubre el caso de un kill -9.)
process.on("SIGTERM", () => {
	const ok = save.saveWorld();
	for (const p of state.players.values()) save.savePlayer(p);
	if (!ok)
		log.error(
			"SIGTERM: el guardado final del mundo FALLÓ (pérdida de cambios)"
		);
	process.exit(ok ? 0 : 1);
});

net.start();
