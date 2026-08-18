"use strict";
// ============================================================
// TESTS DE LA FASE 11
//   A) Biomas nuevos (Bloque B): taiga, pantano, jungla y océano — existen
//      en la semilla, generan sus bloques (tronco de jungla, lianas), los
//      charcos pantanosos cumplen la invariante de charco válido y el
//      océano es agua profunda con lecho de arena. SCHEMA_VERSION → 4.
//   B) Mecánicas rápidas (Bloque C): esquileo de ovejas (canShear/applyShear)
//      y fuente de agua infinita (countWaterNeighbors + relleno en
//      finishMining al retirar agua con ≥2 vecinas ortogonales).
//   C) Pendientes de Fase 10 sin cubrir: gravedad de arena/grava, TNT
//      (mecha + cráter + bedrock intacto), mundo finito (bordes) y /kill.
// ============================================================
const world = require("../server/world.js");
const state = require("../server/state.js");
const constants = require("../server/constants.js");
const mobs = require("../server/mobs.js");
const tnt = require("../server/tnt.js");
const commands = require("../server/commands.js");
const players = require("../server/players.js");
const { ItemStack } = require("../server/items.js");
const { CHUNK_SIZE, WORLD_MIN_Y, WORLD_MAX_Y, B, I, SCHEMA_VERSION } =
	constants;

// Fase 15 (D5): el índice local usa Y de MUNDO (local = mundo − WORLD_MIN_Y);
// getHeight devuelve Y de mundo y columnFloorY, espacio de diseño.
function idx(x, y, z) {
	return ((y - WORLD_MIN_Y) * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		failedChecks.push(_name);
		console.log(`FAIL: ${_name} | ${_extra}`);
	}
};

// Jugador mock (patrón de unit-durabilidad): ws cerrado (los envíos son no-op).
const mkPlayer = (over = {}) => ({
	id: "p-test",
	ws: { readyState: 3, send() {} }, // WebSocket.CLOSED
	health: 20,
	maxHealth: 20,
	x: 0,
	y: 64,
	z: 0,
	isOp: true, // /kill es solo para operadores
	inventory: new Array(36).fill(null),
	selectedSlot: 0,
	armor: { helmet: null, chestplate: null, leggings: null, boots: null },
	craftingGrid: new Array(9).fill(null),
	...over
});

// ============================================================
// A) BIOMAS NUEVOS (Bloque B)
// ============================================================
// 1) Existen en la semilla por defecto (igual patrón que unit-biomas).
{
	const counts = {};
	let oceanCols = 0;
	for (let wx = -300; wx <= 300; wx += 4) {
		for (let wz = -300; wz <= 300; wz += 4) {
			const b = world.getBiome(wx, wz);
			counts[b] = (counts[b] || 0) + 1;
			if (world.isOcean(wx, wz)) oceanCols++;
		}
	}
	for (const b of ["taiga", "jungle", "swamp"]) {
		check(
			`bioma '${b}' existe en la semilla`,
			(counts[b] || 0) > 0,
			`${counts[b] || 0} muestras`
		);
	}
	check(
		"el océano existe (columnas de agua)",
		oceanCols > 0,
		`${oceanCols} columnas`
	);
}

// 2) SCHEMA_VERSION subió a 4 en la Fase 11 y a 5 en la Fase 12 (Bloque D:
//    persistencia de mascotas — ownerId/ownerName/sitting en world.json).
//    Fase 15 (D5): 6 — mundo −64..+63 (chunks 16×128×16; migración v5).
check(
	"SCHEMA_VERSION === 6 (Fase 15 D5: mundo 16×128×16)",
	SCHEMA_VERSION === 6,
	`v${SCHEMA_VERSION}`
);

// 3) Generar 25x25 chunks y verificar bloques/invariantes de los biomas.
world.setDiskLoader(() => null);
for (let cx = -12; cx <= 12; cx++) {
	for (let cz = -12; cz <= 12; cz++) {
		world.generateChunk(cx, cz);
	}
}
{
	let jungleLogs = 0,
		vines = 0;
	for (const data of state.chunks.values()) {
		for (let i = 0; i < data.length; i++) {
			if (data[i] === B.JUNGLE_LOG) jungleLogs++;
			else if (data[i] === B.VINES) vines++;
		}
	}
	check(
		"se generan troncos de jungla",
		jungleLogs > 0,
		`${jungleLogs} troncos`
	);
	check("se generan lianas (VINES)", vines > 0, `${vines} lianas`);
}

// 4) Pantano: los charcos pantanosos cumplen la invariante de charco válido
// (agua en la superficie de una columna swamp, con lecho de arena debajo y
// aire encima — si la copa de un árbol la tapara, unit-mundo fallaría).
{
	let swampPools = 0,
		badSwampPool = 0;
	for (let cx = -12; cx <= 12; cx++) {
		for (let cz = -12; cz <= 12; cz++) {
			const data = state.chunks.get(`${cx},${cz}`);
			for (let x = 0; x < CHUNK_SIZE; x++) {
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const wx = cx * CHUNK_SIZE + x,
						wz = cz * CHUNK_SIZE + z;
					if (world.getBiome(wx, wz) !== "swamp") continue;
					// Solo columnas NO de agua pueden ser charcos pantanosos (un
					// lago/río en el pantano es otra cosa; su agua de cuevas inundadas
					// bajo el lecho no debe contarse como charco).
					const floorY = world.columnFloorY(wx, wz);
					if (floorY != null) continue;
					const surface = world.getHeight(wx, wz); // Y de MUNDO
					if (data[idx(x, surface - 1, z)] !== B.WATER) continue;
					swampPools++;
					const below = data[idx(x, surface - 2, z)];
					const above = surface < WORLD_MAX_Y ? data[idx(x, surface, z)] : -1;
					if (
						surface - 1 < world.WORLD_SEA_LEVEL ||
						below !== B.SAND ||
						above !== B.AIR
					)
						badSwampPool++;
				}
			}
		}
	}
	check("hay charcos pantanosos", swampPools > 0, `${swampPools} charcos`);
	check(
		"los charcos pantanosos son válidos (arena debajo, aire encima)",
		badSwampPool === 0,
		`${badSwampPool} inválidos`
	);
}

// 5) Océano: columnas de agua profundas con lecho de arena y agua hasta
// SEA_LEVEL (misma invariante que lagos/ríos, unit-mundo).
{
	let oceanCols = 0,
		oceanDeep = 0,
		badOcean = 0;
	for (let cx = -12; cx <= 12; cx++) {
		for (let cz = -12; cz <= 12; cz++) {
			const data = state.chunks.get(`${cx},${cz}`);
			for (let x = 0; x < CHUNK_SIZE; x++) {
				for (let z = 0; z < CHUNK_SIZE; z++) {
					const wx = cx * CHUNK_SIZE + x,
						wz = cz * CHUNK_SIZE + z;
					if (!world.isOcean(wx, wz)) continue;
					// columnFloorY devuelve el lecho en ESPACIO DE DISEÑO (1..4); la
					// Y de MUNDO del lecho es floorY − DESIGN_OFFSET (Fase 15 D5).
					const floorY = world.columnFloorY(wx, wz);
					if (floorY == null) {
						badOcean++;
						continue;
					}
					oceanCols++;
					if (floorY <= 2) oceanDeep++; // profundo (≥3 de agua)
					const floorW = floorY - world.DESIGN_OFFSET;
					if (data[idx(x, floorW, z)] !== B.SAND) badOcean++;
					// Fase 21.5 (D2): el arrecife de coral del océano cálido pone
					// CORAL_BLOCK en la primera celda de agua sobre el lecho (como
					// Minecraft); el resto de la columna sigue siendo agua.
					const warm = world.oceanVariant(wx, wz) === "warm";
					for (let y = floorW + 1; y < world.WORLD_SEA_LEVEL; y++) {
						const b = data[idx(x, y, z)];
						if (
							b !== B.WATER &&
							!(warm && y === floorW + 1 && b === B.CORAL_BLOCK)
						)
							badOcean++;
					}
				}
			}
		}
	}
	check(
		"hay columnas de océano generadas",
		oceanCols > 0,
		`${oceanCols} columnas`
	);
	check(
		"el océano es profundo (fondo ≤ 2 en alguna columna)",
		oceanDeep > 0,
		`${oceanDeep} columnas profundas`
	);
	check(
		"océano válido (lecho de arena + agua llena hasta SEA_LEVEL)",
		badOcean === 0,
		`${badOcean} violaciones`
	);
}

// 6) findSpawn (fix del Bloque A1): el spawn real (origen) cae en tierra
// firme, y desde una columna de agua cercana el espiral sale a tierra. El
// único caso que no sale a tierra es una cuenca de OCÉANO de >24 bloques
// (fallback documentado: aparece en la superficie del agua).
{
	const s0 = world.findSpawn(0, 0);
	check(
		"findSpawn(0,0) cae en tierra firme (no lago/río/océano)",
		world.columnFloorY(Math.floor(s0.x), Math.floor(s0.z)) == null,
		JSON.stringify(s0)
	);
	let totalWater = 0,
		anyFound = false;
	for (let wx = -60; wx <= 60; wx += 4) {
		for (let wz = -60; wz <= 60; wz += 4) {
			if (world.columnFloorY(wx, wz) == null) continue;
			totalWater++;
			const s = world.findSpawn(wx, wz);
			if (world.columnFloorY(Math.floor(s.x), Math.floor(s.z)) == null)
				anyFound = true;
		}
	}
	check(
		"hay columnas de agua cerca del origen",
		totalWater > 0,
		`${totalWater}`
	);
	check("el espiral de findSpawn sale a tierra firme desde el agua", anyFound);
}

// ============================================================
// B) MECÁNICAS DEL BLOQUE C
// ============================================================
// 7) Esquileo de ovejas (tijeras + clic derecho → lana sin matar).
{
	const mkSheep = () => {
		const m = new mobs.Mob("sheep", 0, 10, 0);
		m.isBaby = false;
		m.alive = true;
		m.shearedUntil = 0;
		return m;
	};
	const m = mkSheep();
	check(
		"canShear: oveja + tijeras (141) → ok",
		mobs.canShear(m, I.SHEARS) === "ok"
	);
	check(
		"canShear: sin tijeras → wrongitem",
		mobs.canShear(m, B.STONE) === "wrongitem"
	);
	const cow = new mobs.Mob("cow", 0, 10, 0);
	check(
		"canShear: no oveja → notsheep",
		mobs.canShear(cow, I.SHEARS) === "notsheep"
	);
	const baby = mkSheep();
	baby.isBaby = true;
	check("canShear: bebé → baby", mobs.canShear(baby, I.SHEARS) === "baby");
	const woolCount = mobs.applyShear(m);
	check(
		"applyShear: 1-3 lana",
		woolCount >= 1 && woolCount <= 3,
		`${woolCount}`
	);
	check(
		"applyShear marca shearedUntil (pelo por crecer)",
		m.shearedUntil > Date.now()
	);
	check(
		"canShear: re-esquilar → sheared (hasta que crezca)",
		mobs.canShear(m, I.SHEARS) === "sheared"
	);
}

// 8) Fuente de agua infinita: la regla de Minecraft — al retirar un bloque
// de agua con ≥2 fuentes ortogonales adyacentes, se rellena solo (la 2×2
// con 3 fuentes y el canal de 1×3 nunca se agotan).
{
	const x0 = 100,
		y0 = 20,
		z0 = 100;
	// Limpiar la zona y montar una 2×2 con 3 fuentes (el hueco es (x0,z0)).
	for (let dx = -2; dx <= 6; dx++) {
		for (let dz = -2; dz <= 6; dz++) {
			world.setBlock(x0 + dx, y0, z0 + dz, B.AIR);
		}
	}
	world.setBlock(x0 + 1, y0, z0, B.WATER);
	world.setBlock(x0, y0, z0 + 1, B.WATER);
	world.setBlock(x0 + 1, y0, z0 + 1, B.WATER);
	check(
		"2×2: el hueco tiene 2 vecinas ortogonales (fuente infinita)",
		world.countWaterNeighbors(x0, y0, z0) === 2,
		`${world.countWaterNeighbors(x0, y0, z0)} vecinas`
	);
	// Línea 1×3: el centro tiene 2 vecinas (canal infinito).
	world.setBlock(x0 + 5, y0, z0, B.AIR);
	world.setBlock(x0 + 4, y0, z0, B.WATER);
	world.setBlock(x0 + 6, y0, z0, B.WATER);
	check(
		"canal 1×3: el centro tiene 2 vecinas",
		world.countWaterNeighbors(x0 + 5, y0, z0) === 2,
		`${world.countWaterNeighbors(x0 + 5, y0, z0)} vecinas`
	);
	// Agua aislada: 0 vecinas → NO es fuente (se puede retirar).
	world.setBlock(x0 + 8, y0, z0, B.WATER);
	check(
		"agua aislada: 0 vecinas → no se rellena",
		world.countWaterNeighbors(x0 + 8, y0, z0) === 0
	);

	// El RELLENO real ocurre en finishMining (players.js): retirar el hueco de
	// la 2×2 (creative) debe reponerlo automáticamente.
	players.finishMining(mkPlayer(), x0, y0, z0, B.WATER, { creative: true });
	check(
		"finishMining rellena la fuente infinita 2×2",
		world.getBlock(x0, y0, z0) === B.WATER,
		`bloque=${world.getBlock(x0, y0, z0)}`
	);
	// El agua aislada sí se retira (creative puede limpiar).
	players.finishMining(mkPlayer(), x0 + 8, y0, z0, B.WATER, { creative: true });
	check(
		"el agua aislada se puede retirar (no es fuente)",
		world.getBlock(x0 + 8, y0, z0) === B.AIR,
		`bloque=${world.getBlock(x0 + 8, y0, z0)}`
	);
}

// ============================================================
// C) PENDIENTES DE FASE 10 SIN CUBRIR
// ============================================================
// 9) Gravedad de arena/grava (Fase 10, D1): la arena flotante cae hasta el
//    primer soporte (settleColumn en setBlock). Se monta una columna limpia
//    con soporte de piedra explícito para que el test no dependa del terreno
//    generado bajo (140,140) — el mundo D5 tiene superficie en Y negativas.
{
	const gx = 140,
		gz = 140;
	for (let dy = 3; dy < 20; dy++) world.setBlock(gx, dy, gz, B.AIR);
	world.setBlock(gx, 4, gz, B.STONE); // soporte firme
	world.setBlock(gx, 15, gz, B.SAND);
	check(
		"la arena flotante cae (ya no está en y=15)",
		world.getBlock(gx, 15, gz) === B.AIR
	);
	let sandBelow = 0,
		sandY = -1;
	for (let dy = 5; dy < 15; dy++) {
		if (world.getBlock(gx, dy, gz) === B.SAND) {
			sandBelow++;
			sandY = dy;
		}
	}
	check(
		"la arena aterriza sobre el soporte (1 bloque en la columna)",
		sandBelow === 1 && sandY === 5,
		`${sandBelow} en y=${sandY}`
	);
	// La grava cae igual.
	for (let dy = 3; dy < 20; dy++) world.setBlock(gx + 2, dy, gz, B.AIR);
	world.setBlock(gx + 2, 4, gz, B.STONE);
	world.setBlock(gx + 2, 15, gz, B.GRAVEL);
	check(
		"la grava también cae sobre su soporte",
		world.getBlock(gx + 2, 15, gz) === B.AIR &&
			world.getBlock(gx + 2, 5, gz) === B.GRAVEL
	);
}

// 10) TNT (Fase 10, D2): mecha → explosión con cráter; el bedrock sobrevive.
{
	tnt.setBroadcastHandler(() => {});
	const tx = 90,
		ty = 14,
		tz = 90;
	for (let dx = -3; dx <= 3; dx++) {
		for (let dy = -3; dy <= 3; dy++) {
			for (let dz = -3; dz <= 3; dz++) {
				world.setBlock(tx + dx, ty + dy, tz + dz, B.STONE);
			}
		}
	}
	world.setBlock(tx + 2, ty, tz, B.BEDROCK); // debe sobrevivir a la explosión
	world.setBlock(tx, ty, tz, B.TNT);
	check("ignite arma la mecha", tnt.ignite(tx, ty, tz) === true);
	check("hay al menos una mecha activa", tnt.fuses.size >= 1);
	tnt.tick(2000); // supera TNT_FUSE_MS (1.6s)
	check("la mecha explota y se vacía", tnt.fuses.size === 0);
	check("el centro es cráter (aire)", world.getBlock(tx, ty, tz) === B.AIR);
	check(
		"el bedrock sobrevive a la explosión (NOT_MINEABLE)",
		world.getBlock(tx + 2, ty, tz) === B.BEDROCK
	);
}
// 10b) TNT (G2.6): reacción en cadena, daño a jugadores y KNOCKBACK
// (Fase 20 B3 — paridad MC: la explosión empuja a jugadores y mobs).
// Determinista: Math.random se fija a 0 para que TODAS las celdas del
// cráter se procesen (la probabilidad de romper por celda es
// `0.75 - dist*0.13`, que con el azar real volvería el test flaky).
{
	const prevRandom = Math.random;
	try {
		Math.random = () => 0;
		tnt.setBroadcastHandler(() => {});
		const cx = 100,
			cy = 30,
			cz = 100;
		for (let dx = -3; dx <= 3; dx++) {
			for (let dy = -3; dy <= 3; dy++) {
				for (let dz = -3; dz <= 3; dz++) {
					world.setBlock(cx + dx, cy + dy, cz + dz, B.STONE);
				}
			}
		}
		// Dos TNT pegados: el segundo queda DENTRO del radio de la explosión.
		world.setBlock(cx, cy, cz, B.TNT);
		world.setBlock(cx + 1, cy, cz, B.TNT);
		tnt.fuses.clear();
		tnt.ignite(cx, cy, cz);
		tnt.tick(1000); // la mecha sigue (TNT_FUSE_MS=1.6s > 1s)
		check("cadena: A sigue con mecha a 1s", tnt.fuses.size === 1);
		tnt.tick(1000); // A explota y ENCIENDE al vecino (reacción en cadena)
		check(
			"cadena: el TNT vecino se ignita con la explosión",
			tnt.fuses.size === 1,
			`fuses=${tnt.fuses.size}`
		);
		tnt.tick(2000); // el segundo explota (sin bucles)
		check("cadena: ambas mechas se agotan (sin bucles)", tnt.fuses.size === 0);
		check(
			"cadena: el segundo TNT se consume (cráter)",
			world.getBlock(cx + 1, cy, cz) === B.AIR
		);
		// Daño: un jugador a distancia 1 dentro del radio pierde vida.
		state.players.clear();
		const sent = [];
		const pl = players.createPlayer({
			id: "tntp",
			ws: {
				readyState: 1,
				send(str) {
					sent.push(JSON.parse(str));
				}
			},
			health: 20,
			maxHealth: 20,
			x: cx + 1,
			y: cy,
			z: cz,
			gamemode: "survival",
			inventory: ItemStack.slots(36),
			armor: { helmet: null, chestplate: null, leggings: null, boots: null },
			selectedSlot: 0,
			craftingGrid: ItemStack.slots(9)
		});
		state.players.set("tntp", pl);
		// Un zombi dentro del radio: el impulso lo pone el servidor (mob.kb).
		const mob = mobs.createMob("zombie", cx - 1, cy, cz);
		state.mobs.push(mob);
		world.setBlock(cx, cy, cz, B.TNT);
		tnt.ignite(cx, cy, cz);
		tnt.tick(2000);
		check(
			"la explosión daña al jugador (TNT_DAMAGE por distancia)",
			pl.health < 20,
			`health=${pl.health}`
		);
		// Fase 20 B3 (knockback): empuje radial + ventana de confianza + mob.
		const kbEvt = sent.find((m) => m.event === "knockback");
		check(
			"el jugador recibe el evento knockback con impulso finito",
			!!kbEvt &&
				Number.isFinite(kbEvt.data.vx) &&
				Number.isFinite(kbEvt.data.vy) &&
				Number.isFinite(kbEvt.data.vz) &&
				Math.sign(kbEvt.data.vx) === Math.sign(cx + 1 - cx),
			JSON.stringify(kbEvt?.data)
		);
		check(
			"el jugador entra en la ventana de confianza (kbUntil)",
			typeof pl.kbUntil === "number" && pl.kbUntil > Date.now()
		);
		check(
			"el mob recibe el impulso (mob.kb con ttl)",
			!!mob.kb && mob.kb.ttl > 0 && Number.isFinite(mob.kb.vx)
		);
		// El impulso se integra en el tick del mob: el zombi se desplaza y el
		// ttl decrece (la IA queda pausada mientras dura).
		const xBefore = mob.x;
		mob.tick(true, false);
		check(
			"el tick del mob integra el impulso (se desplaza y decrece ttl)",
			mob.x !== xBefore && mob.kb.ttl === 9
		);
		state.players.clear();
		state.mobs.length = 0;
	} finally {
		Math.random = prevRandom;
	}
}
check(
	"setBlock fuera de límites devuelve false",
	world.setBlock(50000, 30, 50000, B.STONE) === false
);
check(
	"getBlock fuera de límites es aire",
	world.getBlock(50000, 30, 50000) === B.AIR
);

// 12) /kill (Fase 10, B3): solo operadores; sin nombre mata al emisor y lo
//     respawnea (salud máxima de nuevo).
{
	const p = mkPlayer({ health: 3, name: "tester" });
	state.players.set(p.id, p);
	const ctx = { state, world, broadcast: () => {}, playerHelpers: players };
	const wasCmd = commands.executeCommand(p, "/kill", ctx);
	check("/kill se procesa como comando", wasCmd === true);
	check(
		"/kill respawnea al emisor (salud máxima)",
		p.health === 20,
		`health=${p.health}`
	);
	// No operador → rechazado sin tocar nada.
	const noOp = mkPlayer({ isOp: false, health: 5, name: "peon" });
	state.players.set(noOp.id, noOp);
	const wasRejected = commands.executeCommand(noOp, "/kill", {
		state,
		world,
		broadcast: () => {},
		playerHelpers: players
	});
	check(
		"/kill sin ser operador se rechaza",
		wasRejected === true && noOp.health === 5
	);
	state.players.delete(p.id);
	state.players.delete(noOp.id);
}

// Limpiar el hook (convención del resto de tests).
world.setDiskLoader(null);
process.exit(failed ? 1 : 0);
