"use strict";
// ============================================================
// AUDITORÍA DE LA FASE 21 (biomas ampliados, estructuras y más
// mobs — verifica el cierre de la fase de forma end-to-end, sin
// servidor ni navegador). Complementa unit-fase21.js (que llama a
// los helpers): aquí se generan CHUNKS REALES y se verifican los
// invariantes sobre el dato generado.
// 1) Pirámide del desierto (B2): dado el centro de una pirámide
//    del mundo real (pyramidCenterAt determinista), el chunk que la
//    contiene tiene el cuerpo escalonado de piedra, el pozo central
//    de bajada abierto (AIR) hasta la bandeja, la caja de la bandeja
//    (5×5×2), los 4 cofres en las esquinas interiores (±1,±1) y el
//    TNT de la trampa 1 bloque bajo la celda central (pyramidTrapAt
//    == posicional, decisión del templo E5). La bandeja nunca queda
//    sobre agua (desierto firme).
// 2) Río D1 (v21.2): el cauce se clava bajo el nivel del mar
//    (riverFloorY ≤ SEA_LEVEL, RIVER_FLOOR_CAP 2) y el agua SIEMPRE
//    lo cubre (carved ≤ SEA_LEVEL) — antes el río en terreno alto no
//    generaba agua (el bug de generación de las Notas). Se verifica
//    con las funciones puras en un barrido amplio (barato, sin I/O).
// 3) Enderman (C2): el aggro por mirada respeta la convención de
//    radianes del cliente (camera.rotation.y/x, orden YXZ) y
//    isEndermanWatched ignora a los jugadores en menú/creativo.
// 4) IA (C3): zombi convoca a vecinos ≤16 al ser golpeado (mismo
//    atacante), araña NEUTRAL de día (hostil solo de noche o tras
//    aggro) y creeper huye de los gatos.
// Uso: node tests/audit-fase21.js
// ============================================================
const path = require("node:path");
const ROOT = path.join(__dirname, "..");
const { Reporter } = require("./helpers.js");
const r = new Reporter();

(async () => {
	// ============================================================
	// Setup: mundo sin disco + semilla determinista (la misma que usa
	// unit-fase21.js: SEED=miSemilla2026). Generar chunks es costoso;
	// por eso la pirámide se busca de forma barata (pyramidCenterAt no
	// genera el mundo) y solo se materializan los chunks necesarios.
	// ============================================================
	const constants = require(path.join(ROOT, "server", "constants.js"));
	const world = require(path.join(ROOT, "server", "world.js"));
	const biomes = require(path.join(ROOT, "server", "biomes.js"));
	const structures = require(path.join(ROOT, "server", "structures.js"));
	const noise = require(path.join(ROOT, "server", "noise.js"));
	const state = require(path.join(ROOT, "server", "state.js"));
	world.setDiskLoader(() => null); // sin I/O de disco (no tocar world/ real)
	state.chunks.clear();
	const seed =
		constants.worldPaths?.currentSeed || process.env.SEED || "miSemilla2026";
	r.check(
		"F21: existe semilla estable para el RNG determinista",
		typeof seed === "string" && seed.length > 0,
		`"${seed}"`
	);

	// ============================================================
	// 1) PIRÁMIDE DEL DESIERTO (B2) — invariantes sobre chunk REAL
	// ============================================================
	{
		// Barrido de celdas PYRAMID_CELL hasta encontrar el centro de una
		// pirámide en desierto firme (la semilla determinista la garantiza; la
		// validación por bioma requiere probar varias filas/columnas de celdas).
		let p = null;
		for (let ci = -8; ci <= 8 && !p; ci++)
			for (let cj = -8; cj <= 8 && !p; cj++) {
				const c = structures.pyramidCenterAt(ci, cj);
				if (c && biomes.getBiome(c.cx, c.cz) === "desert") p = c;
			}
		r.check(
			"B2: existe una pirámide visible en celdas deterministas (semilla estable)",
			!!p,
			p ? `centro ${p.cx},${p.cz}` : "no se encontró"
		);

		if (p) {
			// Materializar los chunks que cubren el footprint 15×15 (centro ±8:
			// el jitter deja el centro a ≥8 del borde de celda, así que solo
			// tocan 4 chunks). getBlock por coordenada de mundo (no por índice
			// local) para evitar cruces de borde de chunk.
			const baseY = biomes.getHeight(p.cx, p.cz);
			const chunkCx = Math.floor(p.cx / 16),
				chunkCz = Math.floor(p.cz / 16);
			for (const dx of [-1, 0, 1])
				for (const dz of [-1, 0, 1])
					world.generateChunk(chunkCx + dx, chunkCz + dz);
			const blockAt = (wx, wy, wz) => world.getBlock(wx, wy, wz);

			const stone = blockAt(p.cx + 4, baseY, p.cz);
			const shaft = blockAt(p.cx, baseY + 1, p.cz);
			const trapCell = blockAt(p.cx, baseY - 2, p.cz);
			// TNT bajo la celda central (baseY−3).
			const tnt = blockAt(p.cx, baseY - 3, p.cz);
			r.check(
				"B2: el cuerpo escalonado es de piedra (nivel base, footprint 15×15)",
				stone === constants.B.STONE,
				`bloque ${stone}`
			);
			r.check(
				"B2: el pozo central de bajada está abierto (AIR) en el primer escalón",
				shaft === constants.B.AIR,
				`bloque ${shaft}`
			);
			r.check(
				"B2: la celda central del piso de la bandeja (baseY−2) es piedra (placa)",
				trapCell === constants.B.STONE,
				`bloque ${trapCell}`
			);
			r.check(
				"B2: TNT de la trampa enterrado 1 bloque bajo la celda central (baseY−3)",
				tnt === constants.B.TNT,
				`bloque ${tnt}`
			);
			// Cofres de loot: las 4 esquinas interiores de la bandeja (±1,±1).
			let chests = 0;
			for (const dx of [-1, 1])
				for (const dz of [-1, 1])
					if (blockAt(p.cx + dx, baseY - 2, p.cz + dz) === constants.B.CHEST)
						chests++;
			r.check(
				"B2: los 4 cofres de loot están en las esquinas interiores de la bandeja",
				chests === 4,
				`${chests}/4`
			);
			// La bandeja deja aire sobre los cofres (caja de 2 de alto).
			const airBox = blockAt(p.cx, baseY - 1, p.cz);
			r.check(
				"B2: la bandeja es una caja de aire de 2 de alto (AIR en baseY−1)",
				airBox === constants.B.AIR,
				`bloque ${airBox}`
			);
			// La trampa es posicional (pyramidTrapAt) y coincide con el TNT.
			r.check(
				"B2: pyramidTrapAt es true en el centro y false 1 bloque fuera",
				structures.pyramidTrapAt(p.cx, p.cz) === true &&
					structures.pyramidTrapAt(p.cx + 1, p.cz) === false
			);
			// Determinismo: misma celda → mismo centro. (PYRAMID_CELL = 48, no
			// exportado; el valor vive en structures.js.)
			const again = structures.pyramidCenterAt(
				Math.floor(p.cx / 48),
				Math.floor(p.cz / 48)
			);
			r.check(
				"B2: pyramidCenterAt es determinista (misma celda → mismo centro)",
				!!again && again.cx === p.cx && again.cz === p.cz
			);
		}
		state.chunks.clear();
	}

	// ============================================================
	// 2) RÍO D1 (v21.2) — el cauce siempre tiene agua (lecho ≤ SEA_LEVEL)
	// ============================================================
	{
		// Invariante de diseño (server/biomes.js): el lecho del río se clava
		// con RIVER_FLOOR_CAP 2, de modo que floor = min(h − riverDepth, 2) →
		// lecho ≤ 2 < SEA_LEVEL 5 (espacio de diseño) → SIEMPRE ≥ 2 bloques de
		// agua en el cauce. riverCarvedHeight garantiza orillas inclinadas
		// (sin acantilados) y que el cauce nunca supera el terreno natural ni
		// pasa por encima del nivel del mar. Mismo muestreo que generation.js
		// (heightFrom + smoothstep sobre temp/mnt) en un barrido amplio.
		const SEA_LEVEL = 5; // espacio de diseño
		let verified = 0,
			allBelow = true,
			carvedOk = true;
		for (let wx = -800; wx <= 800; wx += 4) {
			for (let wz = -800; wz <= 800; wz += 4) {
				if (!biomes.isRiver(wx, wz)) continue;
				const temp = noise.noise2D(
					wx * biomes.BIOME_FREQ,
					wz * biomes.BIOME_FREQ
				);
				const mnt = noise.noise2D_mountain(wx * 0.008, wz * 0.008);
				const h = biomes.heightFrom(
					temp,
					biomes.smoothstep(
						biomes.MOUNTAIN_RAMP[0],
						biomes.MOUNTAIN_RAMP[1],
						mnt
					),
					wx,
					wz
				);
				const floor = biomes.riverFloorY(wx, wz, h);
				const carved = biomes.riverCarvedHeight(wx, wz, h);
				// Lecho del cauce bajo el nivel del mar.
				if (floor >= SEA_LEVEL) allBelow = false;
				// El cauce tallado nunca pasa por encima del terreno natural ni
				// sube por encima del mar (el agua lo cubre).
				if (carved > h || carved > SEA_LEVEL) carvedOk = false;
				verified++;
			}
		}
		r.check(
			"D1: lecho del río SIEMPRE bajo el nivel del mar (verificado en barrido)",
			allBelow && verified > 50,
			`${verified} columnas de río; todas bajo: ${allBelow}`
		);
		r.check(
			"D1: el cauce tallado nunca supera el terreno natural ni el nivel del mar",
			carvedOk,
			`carvedOk ${carvedOk}`
		);
	}

	// ============================================================
	// 3) ENDERMAN (C2) — mirada en radianes + aggro por watcher
	// ============================================================
	{
		const mobs = require(path.join(ROOT, "server", "mobs.js"));
		// Convención del cliente: yaw en radianes, yaw=0 → −Z, +90° → −X,
		// pitch>0 → arriba (camera.rotation.y/x de three, orden YXZ).
		const viewer = {
			id: "v",
			x: 0,
			y: 1.6,
			z: 0,
			yaw: 0,
			pitch: 0,
			gamemode: "survival",
			inMenu: false,
			ws: { readyState: 1, send() {} }
		};
		// Enderman delante (yaw 0 → −Z): a 4 bloques en −Z, centro y+1.0.
		const e = mobs.createMob("enderman", 0, 0, -4);
		r.check(
			"C2: isPlayerLookingAt usa radianes (yaw=0 → el enderman en −Z SÍ se ve)",
			mobs.isPlayerLookingAt(viewer, e) === true
		);
		viewer.yaw = Math.PI; // 180° → ahora mira a +Z (detrás del mob)
		r.check(
			"C2: girar 180° (yaw=π) deja de verlo (convención radianes)",
			mobs.isPlayerLookingAt(viewer, e) === false
		);
		// Mirada a 90° sobre el eje X: el mob en −Z queda fuera del cono.
		viewer.yaw = -Math.PI / 2;
		r.check(
			"C2: yaw=±90° saca al mob del centro de la vista",
			mobs.isPlayerLookingAt(viewer, e) === false
		);
		viewer.yaw = 0;
		state.players.set(viewer.id, viewer);
		r.check(
			"C2: isEndermanWatched devuelve el jugador que mira (provoca al enderman)",
			mobs.isEndermanWatched(e, state) === viewer
		);
		viewer.inMenu = true;
		r.check(
			"C2: isEndermanWatched ignora a los jugadores en menú (no provocan)",
			mobs.isEndermanWatched(e, state) === null
		);
		viewer.inMenu = false;
		viewer.gamemode = "creative";
		r.check(
			"C2: isEndermanWatched ignora a los jugadores en creativo (sin aggro)",
			mobs.isEndermanWatched(e, state) === null
		);
		state.players.clear();
	}

	// ============================================================
	// 4) IA C3 — zombi convoca, araña día/noche, creeper huye de gatos
	// ============================================================
	{
		const mobs = require(path.join(ROOT, "server", "mobs.js"));
		// ZOMBI CONVOCA (mobHit): al ser golpeado, los zombis a ≤16 bloques se
		// vuelven hostiles contra el MISMO atacante; los lejanos no.
		const attacker = { id: "atk", gamemode: "survival" };
		const z1 = mobs.createMob("zombie", 0, 0, 0);
		z1.id = "z1";
		const zCerca = mobs.createMob("zombie", 10, 0, 0);
		zCerca.id = "zCerca";
		const zLejos = mobs.createMob("zombie", 40, 0, 0);
		zLejos.id = "zLejos";
		state.mobs.push(z1, zCerca, zLejos);
		z1.mobHit(attacker);
		r.check(
			"C3: al golpear, el zombi convoca a sus vecinos ≤16 bloques (mismo atacante)",
			zCerca.isAggroed() && zCerca.aggroTarget === attacker.id,
			`aggro=${zCerca.isAggroed()} target=${zCerca.aggroTarget}`
		);
		r.check(
			"C3: el zombi a 40 bloques NO se convoca (radio 16)",
			!zLejos.isAggroed()
		);
		// Atacante en creativo: nada de aggro (Fase 17 B6).
		const atkCreative = { id: "atk2", gamemode: "creative" };
		state.mobs.length = 0;
		const z2 = mobs.createMob("zombie", 0, 0, 0);
		z2.id = "z2";
		const z2Cerca = mobs.createMob("zombie", 8, 0, 0);
		z2Cerca.id = "z2Cerca";
		state.mobs.push(z2, z2Cerca);
		z2.mobHit(atkCreative);
		r.check(
			"C3: golpear en creativo no genera aggro (ni en el golpeado ni en los convocados)",
			!z2.isAggroed() && !z2Cerca.isAggroed()
		);
		state.mobs.length = 0;

		// ARAÑA NEUTRAL DE DÍA (tickSpider): hostil solo de noche o con aggro;
		// de día y sin aggro queda idle (antes perseguía de día si estaba cerca).
		const sp = mobs.createMob("spider", 0, 0, 0);
		sp.id = "sp";
		state.mobs.push(sp);
		const victim = { x: 0, y: 0, z: 4 }; // cerca (dist 4)
		sp.tickSpecies(false, victim, 4); // día, sin aggro
		r.check(
			"C3: araña NEUTRAL de día (idle aunque el jugador esté cerca, dist 4)",
			sp.state === "idle",
			`state=${sp.state}`
		);
		sp.tickSpecies(true, victim, 4); // noche
		r.check(
			"C3: araña hostil de noche (chase)",
			sp.state === "chase",
			`state=${sp.state}`
		);
		sp.isAggroed = () => true;
		sp.tickSpecies(false, victim, 4); // día + aggro
		r.check(
			"C3: araña hostil de día si está agroadolo (aggro por golpe)",
			sp.state === "chase",
			`state=${sp.state}`
		);
		state.mobs.length = 0;

		// CREEPER HUYE DE GATOS (catNearby): a 6 bloques de un gato domado, el
		// creeper entra en huida (no persigue, no explota).
		const cr = mobs.createMob("creeper", 0, 0, 0);
		cr.id = "cr";
		const gato = mobs.createMob("cat", 3, 0, 0);
		gato.ownerId = "dueno"; // gato DOMADO (el espanto solo aplica a domados)
		state.mobs.push(cr, gato);
		cr.tickSpecies(false, { x: 20, y: 0, z: 20 }, 28);
		r.check(
			"C3: creeper con un gato domado a ≤6 bloques huye (no chase)",
			cr.state !== "chase",
			`state=${cr.state}`
		);
		state.mobs.length = 0;
	}

	r.done();
})().catch((e) => {
	console.error("error en la auditoría:", e);
	process.exit(1);
});
