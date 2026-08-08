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
const { CHUNK_SIZE, WORLD_HEIGHT, B, I, SCHEMA_VERSION } = constants;

function idx(x, y, z) {
	return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

let failed = 0;
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		// biome-ignore lint/suspicious/noConsole: resumen del test (convención del repo)
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

// 2) SCHEMA_VERSION subió a 4 (bloques nuevos sin cambio de estructura).
check(
	"SCHEMA_VERSION === 4 (Fase 11, Bloque B)",
	SCHEMA_VERSION === 4,
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
					const surface = world.getHeight(wx, wz);
					if (data[idx(x, surface - 1, z)] !== B.WATER) continue;
					swampPools++;
					const below = data[idx(x, surface - 2, z)];
					const above = surface < WORLD_HEIGHT ? data[idx(x, surface, z)] : -1;
					if (
						surface - 1 < world.SEA_LEVEL ||
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
					const floorY = world.columnFloorY(wx, wz);
					if (floorY == null) {
						badOcean++;
						continue;
					}
					oceanCols++;
					if (floorY <= 2) oceanDeep++; // profundo (≥3 de agua)
					if (data[idx(x, floorY, z)] !== B.SAND) badOcean++;
					for (let y = floorY + 1; y < world.SEA_LEVEL; y++) {
						if (data[idx(x, y, z)] !== B.WATER) badOcean++;
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
//    primer soporte (settleColumn en setBlock).
{
	const gx = 140,
		gz = 140;
	for (let dy = 0; dy < 8; dy++) world.setBlock(gx, 12 + dy, gz, B.AIR);
	world.setBlock(gx, 15, gz, B.SAND);
	check(
		"la arena flotante cae (ya no está en y=15)",
		world.getBlock(gx, 15, gz) === B.AIR
	);
	let sandBelow = 0;
	for (let dy = 2; dy < 15; dy++) {
		if (world.getBlock(gx, dy, gz) === B.SAND) sandBelow++;
	}
	check(
		"la arena aterriza abajo (1 bloque en la columna)",
		sandBelow === 1,
		`${sandBelow}`
	);
	// La grava cae igual.
	for (let dy = 0; dy < 8; dy++) world.setBlock(gx + 2, 12 + dy, gz, B.AIR);
	world.setBlock(gx + 2, 15, gz, B.GRAVEL);
	check("la grava también cae", world.getBlock(gx + 2, 15, gz) === B.AIR);
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
