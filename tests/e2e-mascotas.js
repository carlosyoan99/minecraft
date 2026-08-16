"use strict";
// E2E de las mascotas (Fase 12, A1/E10) — ciclo completo por WebSocket:
//   1) Localizar TAIGA de forma determinista (server/world.js + seed del init)
//   2) /tp a la taiga + /time set night → esperar un LOBO salvaje en mobs_update
//   3) /tp junto al lobo, seleccionar el hueso y tirar tame_mob hasta tame_ok
//   4) Verificar ownerId del lobo === playerId (aliado) y state "follow"
//   5) Verificar que SIGUE al dueño: el jugador se aleja y el lobo lo acerca
//   6) sit_pet → sitting: true y state "sit" (ya no sigue)
//
// Requiere un servidor vivo: WS_URL (por defecto ws://localhost:3998).
// Ejecutar contra un servidor DESECHABLE (modifica el mundo: da items, /tp y
// domestica un lobo). Localiza la taiga con la MISMA semilla del servidor
// (world.reinitNoise(seed)) → determinista, sin depender de la semilla base.
const WebSocket = require("ws");
const path = require("node:path");
const URL = process.env.WS_URL || "ws://localhost:3998";

const BONE = 136; // constants.I.BONE
// Armadura de diamante (228-231): el jugador espera al lobo DE NOCHE en
// taiga con hostiles sueltos; con la armadura completa el daño se reduce al
// 20% (tope 80% de ARMOR_POINTS) y sobrevive a la doma con comodidad.
const DIAMOND_ARMOR = [228, 229, 230, 231]; // casco, pechera, pantalones, botas
const seenEquip = new Set(); // piezas de armadura para las que ya se mandó equip_armor (B2)
const results = [];
let finished = false;
const t0 = Date.now();
let phase = "init";
let playerId = null;
let wolfId = null; // el lobo que vamos a domesticar
let wolfLast = null; // última posición conocida del lobo
let boneSlot = -1;
let armorEquipped = false;
let taigaSpot = null; // {x, y, z} destino del /tp a taiga
let tameOk = false;
let followInitial = null; // distancia inicial tras alejar al jugador
let followMin = Infinity;
let tamedTick = 0;
let sitOk = false;
const seenTameMobs = new Set(); // ids de tame_mob ya enviados
let tameAttempts = 0;
// Auditoría 2026-08-15 (B2): el rate-limit POR ACCIÓN (MAX_ACTION_RATE =
// 20/s) cortaba la conexión durante el equipado: cada equip_armor dispara
// un inventory_update y el test respondía con inventory_select + equip_armor
// en el mismo tick — la cadena síncrona sumaba ~25 acciones en el primer
// segundo. `boneSelected` envía el inventory_select UNA vez y `armorSent`
// espacia los equip_armor (250 ms) como ya hacía la ráfaga del tame_mob.
let boneSelected = false;
let armorSent = 0;
// Liberador del tope de spawn (Fase 13, cierre): el mundo llena su tope de
// 30 mobs en ~15s (sin despawn) y spawnMobs deja de crear → el lobo nunca
// aparecería. Mientras se espera al lobo, /kill mobs (comando dev nuevo)
// vacía el mundo cada 8s para que el sorteo por bioma tenga hueco.
let killMobsTimer = null;
let killMobsPending = false;
function startKillMobs() {
	killMobsPending = true;
	killMobsTimer = setInterval(() => {
		if (phase === "esperar-lobo") send("chat", { message: "/kill mobs" });
	}, 8000);
}
function stopKillMobs() {
	killMobsPending = false;
	if (killMobsTimer) {
		clearInterval(killMobsTimer);
		killMobsTimer = null;
	}
}

function check(name, ok, _info) {
	results.push({ name, ok });
}
function finish(exitCode) {
	if (finished) return;
	finished = true;
	clearTimeout(timer);
	stopKillMobs();
	// Resumen de checks SIEMPRE (el runner no imprime nada por test; sin esto
	// un fallo no-timeout muere en silencio sin decir qué check falló).
	if (results.length) {
		console.error(
			`E2E mascotas: ${results.filter((r) => r.ok === false).length}/${results.length} checks FAIL`
		);
		for (const r of results) if (!r.ok) console.error(`  FAIL ${r.name}`);
	}
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
}, 120000);

function send(event, data) {
	ws.send(JSON.stringify({ event, data }));
}

// ============================================================
// LOCALIZACIÓN DETERMINISTA DE TAIGA (misma semilla que el servidor)
// ============================================================
let world = null;
function findTaigaSpot() {
	// Busca un punto de taiga firme, lejos de la zona segura de spawn (los
	// hostiles — el lobo — no spawnean a < 32 bloques del spawn del mundo) y
	// con la MAYOR cobertura de taiga en el área de spawn (5x5 bloques
	// muestreados cada 16, que es donde spawnean los mobs tras el /tp: los
	// chunks cargados ~±2). Los biomas se intercalan por celda (la taiga
	// puede ser fragmentada), así que basta con el mejor punto.
	let best = null;
	for (let ox = -16; ox <= 16; ox++) {
		for (let oz = -16; oz <= 16; oz++) {
			const wx = ox * 32 + 16;
			const wz = oz * 32 + 16;
			if (world.getBiome(wx, wz) !== "taiga") continue;
			// Zona segura de spawn: alejado al menos 48 bloques (margen).
			const safe = world.findSpawn(0, 0);
			if (Math.hypot(wx - safe.x, wz - safe.z) < 48) continue;
			// El punto debe estar FIRME (no sobre agua).
			if (world.columnFloorY(wx, wz) !== null) continue;
			// Cobertura de taiga en el área de spawn (±32 bloques).
			let taiga = 0;
			let total = 0;
			for (let dx = -32; dx <= 32; dx += 16) {
				for (let dz = -32; dz <= 32; dz += 16) {
					total++;
					if (world.getBiome(wx + dx, wz + dz) === "taiga") taiga++;
				}
			}
			const frac = taiga / total;
			if (frac < 0.15) continue; // mínimo: algún vecino taiga además del punto
			if (!best || frac > best.frac)
				best = {
					frac,
					x: wx + 0.5,
					y: world.getHeight(wx, wz) + 2,
					z: wz + 0.5
				};
		}
	}
	return best ? { x: best.x, y: best.y, z: best.z } : null;
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

	// ============ INIT: seed + localizar taiga + dar huesos ============
	if (phase === "init" && m.event === "init") {
		playerId = m.data.playerId;
		// Cargar world.js (server) y alinear el ruido con la semilla del
		// servidor → getBiome/getHeight/findSpawn coinciden con el mundo real.
		world = require(path.join(__dirname, "..", "server", "world.js"));
		world.reinitNoise(m.data.seed);
		taigaSpot = findTaigaSpot();
		if (!taigaSpot) {
			check(
				"se encuentra un punto de taiga firme en la semilla",
				false,
				"sin taiga en ±256 bloques (¿semilla sin taiga cerca?)"
			);
			finish(1);
			return;
		}
		check(
			"se encuentra un punto de taiga firme en la semilla",
			true,
			`(${taigaSpot.x.toFixed(0)}, ${taigaSpot.z.toFixed(0)})`
		);
		// Auditoría 2026-08-15 (B2): rate-limit POR ACCIÓN (MAX_ACTION_RATE
		// = 20/s). Los 5 /give en ráfaga + los inventory_select/equip_armor
		// que dispara cada inventory_update sumaban ~25 acciones en el primer
		// segundo y el servidor cortaba 1008 a mitad del equipado (como el
		// patrón ya conocido del rate-limit WS del tame_mob, abajo). Se
		// espacian los /give 200 ms: las updates llegan escalonadas y el flujo
		// da/equipa baja a ~4 acciones/s, dentro de la cuota.
		send("chat", { message: "/give 136 30" }); // 30 huesos (33% por intento)
		// Armadura de diamante completa para aguantar los hostiles de la noche.
		DIAMOND_ARMOR.forEach((id, i) => {
			setTimeout(
				() => send("chat", { message: `/give ${id} 1` }),
				200 * (i + 1)
			);
		});
		phase = "give-huesos";
		return;
	}

	if (m.event === "chunks_add") return; // el E2E no necesita el chunkData

	// ============ GIVE HUESOS + ARMADURA → equipar + /tp a taiga ============
	if (phase === "give-huesos" && m.event === "inventory_update") {
		const bones = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === BONE ? s.count : 0),
			0
		);
		if (bones < 30) return; // esperar a que llegue el /give
		check(
			"se obtienen 30 huesos (/give 136 30)",
			bones >= 30,
			`huesos=${bones}`
		);
		if (!boneSelected) {
			boneSlot = m.data.inventory.findIndex((s) => s && s.id === BONE);
			send("inventory_select", { slot: boneSlot });
			boneSelected = true;
		}
		// Equipar la armadura de diamante (una pieza por update; el servidor
		// responde otro inventory_update tras cada equip_armor). Las piezas ya
		// equipadas están en m.data.armor (no en el inventario). Los equip se
		// ESPACIAN 250 ms (B2): la cadena síncrona equip→update→equip superaba
		// MAX_ACTION_RATE y el servidor cortaba 1008 a mitad del equipado.
		const equipped = Object.values(m.data.armor || {}).filter(Boolean);
		const toEquip = DIAMOND_ARMOR.find(
			(id) =>
				m.data.inventory.some((s) => s && s.id === id) &&
				!equipped.some((a) => a.id === id) &&
				!seenEquip.has(id)
		);
		if (toEquip !== undefined) {
			const slot = m.data.inventory.findIndex((s) => s && s.id === toEquip);
			seenEquip.add(toEquip);
			const n = ++armorSent;
			setTimeout(() => send("equip_armor", { inventorySlot: slot }), 250 * n);
			return; // esperar el inventory_update con la pieza equipada
		}
		// Si aún hay piezas sin equipar ni en el inventario, es que el /give
		// no las ha entregado todavía (4 comandos en fila llegan por separado).
		const done = DIAMOND_ARMOR.every((id) => equipped.some((a) => a.id === id));
		if (!done) return;
		armorEquipped = true;
		check(
			"se equipa la armadura de diamante completa (228-231)",
			armorEquipped
		);
		send("chat", {
			message: `/tp ${taigaSpot.x} ${taigaSpot.y} ${taigaSpot.z}`
		});
		phase = "tp-taiga";
		return;
	}

	// ============ TP A TAIGA → noche + esperar el lobo ============
	if (phase === "tp-taiga" && m.event === "teleport") {
		check(
			"/tp a la taiga (teleport recibido)",
			true,
			`(${m.data.x.toFixed(0)}, ${m.data.z.toFixed(0)})`
		);
		send("chat", { message: "/time set night" });
		// Vaciar el mundo YA (el tope pudo llenarse en el origen antes del /tp)
		// y repetir cada 8s mientras esperamos: los mobs que queden serían
		// mayoría no-lobo y taparían el sorteo por bioma.
		send("chat", { message: "/kill mobs" });
		startKillMobs();
		phase = "esperar-lobo";
		return;
	}

	// ============ ESPERAR LOBO: mobs_update con un lobo salvaje cerca ============
	if (phase === "esperar-lobo" && m.event === "mobs_update") {
		const wolves = m.data.filter(
			(mo) =>
				mo.type === "wolf" &&
				!mo.ownerId &&
				Math.hypot(mo.x - taigaSpot.x, mo.z - taigaSpot.z) < 100
		);
		if (!wolves.length) return;
		wolves.sort(
			(a, b) =>
				Math.hypot(a.x - taigaSpot.x, a.z - taigaSpot.z) -
				Math.hypot(b.x - taigaSpot.x, b.z - taigaSpot.z)
		);
		const w = wolves[0];
		check(
			"aparece un lobo salvaje cerca de la taiga (spawn por bioma)",
			true,
			`id=${w.id} a ${Math.hypot(w.x - taigaSpot.x, w.z - taigaSpot.z).toFixed(0)} bloques`
		);
		wolfId = w.id;
		wolfLast = { x: w.x, y: w.y, z: w.z };
		stopKillMobs(); // ya no hace falta liberar huecos
		// /tp junto al lobo (dentro del rango de doma).
		send("chat", { message: `/tp ${w.x + 0.5} ${w.y + 0.5} ${w.z + 0.5}` });
		phase = "tp-lobo";
		return;
	}

	// ============ TP JUNTO AL LOBO → tirar tame_mob ============
	if (phase === "tp-lobo" && m.event === "teleport") {
		// Ráfaga de intentos: ~33% por hueso, 30 huesos → éxito casi seguro.
		// Rate-limit WS (0bc40e8 + auditoría 2026-08-15 B2): DOS topes con
		// ventana deslizante de 1s — MAX_MSG_RATE=30 (mensajes totales) y
		// MAX_ACTION_RATE=20 (solo acciones: chat/tame_mob/inventario...).
		// Mandar los 30 de golpe supera ambos y el servidor corta 1008 justo
		// después de la doma (el test deja de recibir mobs_update y muere por
		// timeout). Cada grupo de 10 queda en SU PROPIA ventana (>=1s entre
		// inicios, aun con RTT ~0): 1 /tp previo + 10 = 11 acciones por
		// ventana, bajo el tope de 20. Éxito casi seguro (33% × 30).
		for (let i = 0; i < 30; i++) {
			setTimeout(
				() => {
					send("tame_mob", { mobId: wolfId });
					tameAttempts++;
				},
				i < 10 ? 0 : i < 20 ? 1100 : 2200
			);
		}
		phase = "domar";
		return;
	}

	// ============ DOMAR: tame_ok o mobs_update con ownerId ============
	if (phase === "domar" && m.event === "tame_ok") {
		if (m.data.id !== wolfId) return;
		check(
			"tame_ok: el lobo se vuelve aliado",
			true,
			`id=${wolfId} tipo=${m.data.type}`
		);
		tameOk = true;
		phase = "verificar-aliado";
		return;
	}

	// ============ VERIFICAR ALIADO + SIGUE ============
	if (phase === "verificar-aliado" && m.event === "mobs_update") {
		const w = m.data.find((mo) => mo.id === wolfId);
		if (!w) return;
		check(
			"mobs_update: el lobo tiene ownerId = playerId (aliado)",
			w.ownerId === playerId,
			`ownerId=${w.ownerId} playerId=${playerId}`
		);
		check(
			"el lobo aliado está en estado 'follow' (sigue al dueño)",
			w.state === "follow",
			`state=${w.state}`
		);
		wolfLast = { x: w.x, y: w.y, z: w.z };
		// Alejar al jugador 8 bloques para comprobar que el lobo lo sigue.
		send("chat", {
			message: `/tp ${w.x + 8} ${w.y + 0.5} ${w.z}`
		});
		phase = "seguir";
		tamedTick = Date.now();
		return;
	}

	// ============ SEGUIR: la distancia lobo→jugador debe decrecer ============
	if (phase === "seguir" && m.event === "mobs_update") {
		const w = m.data.find((mo) => mo.id === wolfId);
		if (!w) return;
		// El jugador está en el último teleport (w.x+8, w.y, w.z); el lobo se
		// acerca a 1 bloque/s (tickPet). La distancia debe bajar de ~8 a ≤4.
		const playerX = (wolfLast?.x ?? 0) + 8;
		const dist = Math.hypot(w.x - playerX, w.z - wolfLast.z);
		if (followInitial === null) followInitial = dist;
		followMin = Math.min(followMin, dist);
		if (followMin <= 4) {
			check(
				"el lobo sigue al dueño (distancia baja de ~8 a ≤4 bloques)",
				true,
				`dist ${followInitial.toFixed(1)} → ${followMin.toFixed(1)}`
			);
			// /tp de vuelta junto al lobo para sentarlo (rango ≤4).
			send("chat", { message: `/tp ${w.x + 0.5} ${w.y + 0.5} ${w.z + 0.5}` });
			phase = "tp-sentar";
		} else if (Date.now() - tamedTick > 20000) {
			check(
				"el lobo sigue al dueño (distancia baja de ~8 a ≤4 bloques)",
				false,
				`dist ${followInitial?.toFixed(1)} → ${followMin.toFixed(1)} (20s sin acercarse)`
			);
			finish(1);
		}
		return;
	}

	// ============ TP DE VUELTA → sit_pet ============
	if (phase === "tp-sentar" && m.event === "teleport") {
		send("sit_pet", { mobId: wolfId });
		phase = "sentar";
		return;
	}

	if (phase === "sentar" && m.event === "mobs_update") {
		const w = m.data.find((mo) => mo.id === wolfId);
		if (!w) return;
		if (!w.sitting && !sitOk) return; // esperar el snapshot con sitting
		check(
			"clic derecho (sit_pet): el lobo se sienta (sitting: true)",
			w.sitting === true,
			`sitting=${w.sitting} state=${w.state}`
		);
		check(
			"el lobo sentado deja de seguir (state 'sit')",
			w.state === "sit",
			`state=${w.state}`
		);
		sitOk = true;
		finish(0);
		return;
	}

	// Diagnóstico: si en "domar" no llegó tame_ok pero el inventario se
	// agotó, fallar con claridad en vez de esperar al timeout.
	if (phase === "domar" && m.event === "inventory_update") {
		const bones = m.data.inventory.reduce(
			(acc, s) => acc + (s && s.id === BONE ? s.count : 0),
			0
		);
		if (bones === 0 && !tameOk) {
			check(
				"al menos un intento de doma tiene éxito (30 huesos)",
				false,
				"se agotaron los huesos sin tame_ok (¿suerte muy mala?)"
			);
			finish(1);
		}
		return;
	}

	// El lobo puede atacar al jugador (hostil de noche): si muere durante la
	// doma, respawn — el test reintenta con otro lobo en esperar-lobo.
	if (m.event === "health_update" && m.data.health <= 0 && !tameOk) {
		check("el jugador sobrevive a la doma (sin morir por el lobo)", false);
		finish(1);
	}
});
ws.on("error", (_e) => {
	finish(1);
});
