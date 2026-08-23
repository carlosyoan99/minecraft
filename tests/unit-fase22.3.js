"use strict";
// ============================================================
// TESTS UNITARIOS DE LA FASE 22.3 (correcciones diferidas)
// Bloque L1: linterna fiel a MC — radio de luz por fuente
// (antorcha 7 = nivel 14, linterna 8 = nivel 15), receta fiel
// (8 nuggets + antorcha) y lingote → 9 nuggets. IRON_NUGGET (282)
// sincronizado en AMBOS constants.
//
// Patrón del proyecto: CJS + Reporter/helpers; los módulos ESM del
// cliente se importan con loaderESM (lógica pura, sin DOM).
// ============================================================
const { Reporter, loaderESM } = require("./helpers.js");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..");

(async () => {
	const r = new Reporter();

	// ==========================================================
	// L1 — Constantes sincronizadas (servidor ↔ cliente)
	// ==========================================================
	const { I } = require(`${ROOT}/server/constants.js`);
	const pubSrc = fs.readFileSync(
		path.join(ROOT, "public/constants.js"),
		"utf8"
	);
	r.check("L1 IRON_NUGGET = 282 en servidor", I.IRON_NUGGET === 282);
	r.check(
		"L1 IRON_NUGGET exportado en cliente",
		pubSrc.includes("export const IRON_NUGGET = 282")
	);
	r.check(
		"L1 nombre del nugget en ITEM_NAMES",
		pubSrc.includes('282: "Nugget de hierro"')
	);

	// ==========================================================
	// L1 — Recetas: linterna fiel + nuggets desde lingote
	// ==========================================================
	const recetas = JSON.parse(
		fs.readFileSync(path.join(ROOT, "recetas.json"), "utf8")
	);
	const lan = recetas.lantern;
	const lanShape = lan ? lan.shape.join("") : "";
	r.check(
		"L1 linterna = 8 nuggets (282) + antorcha (23)",
		!!lan &&
			lanShape.split("N").length - 1 === 8 &&
			lanShape.split("T").length - 1 === 1 &&
			lan.ingredients.N === 282 &&
			lan.ingredients.T === 23 &&
			lan.result.id === 79,
		JSON.stringify(lan)
	);
	const nug = recetas.iron_nugget;
	r.check(
		"L1 lingote → 9 nuggets (paridad MC)",
		!!nug &&
			nug.shape.join("") === "I" &&
			nug.ingredients.I === 102 &&
			nug.result.id === 282 &&
			nug.result.count === 9,
		JSON.stringify(nug)
	);

	// ==========================================================
	// L1 — Radio por fuente en lighting.js (lógica pura)
	// ==========================================================
	const luz = await loaderESM("public/lighting.js");
	const { computeChunkLight, sourceRadius } = luz;
	r.check(
		"L1 sourceRadius: antorcha 7, linterna 8, sin id → 7",
		sourceRadius([0, 0, 0]) === 7 &&
			sourceRadius([0, 0, 0, 23]) === 7 &&
			sourceRadius([0, 0, 0, 79]) === 8
	);

	const CS = 16;
	const WH = 128;
	const MINY = -64;
	// Mundo todo aire: la luz se propaga sin oclusión.
	const blockAt = () => 0;
	const idx = (x, z) => (0 * CS + z) * CS + x; // ly=0 → y de mundo MINY
	const mk = (id) => [[CS / 2, 0, CS / 2, id]]; // formato torchSet F22.3

	const outTorch = computeChunkLight(0, 0, CS, WH, MINY, blockAt, [
		[CS / 2, MINY, CS / 2, 23]
	]);
	const outLantern = computeChunkLight(0, 0, CS, WH, MINY, blockAt, [
		[CS / 2, MINY, CS / 2, 79]
	]);
	r.check(
		"L1 antorcha NO alcanza distancia 8 del eje",
		outTorch[idx(CS / 2 + 8, CS / 2)] === 0,
		String(outTorch[idx(CS / 2 + 8, CS / 2)])
	);
	r.check(
		"L1 linterna SÍ alcanza distancia 8 (nivel 15)",
		outLantern[idx(CS / 2 + 8, CS / 2)] > 0,
		String(outLantern[idx(CS / 2 + 8, CS / 2)])
	);
	r.check(
		"L1 ambas alcanzan distancia 7",
		outTorch[idx(CS / 2 + 7, CS / 2)] > 0 &&
			outLantern[idx(CS / 2 + 7, CS / 2)] > 0
	);

	// Entrada legacy de 3 elementos (tests antiguos, unit-antorchas) sigue
	// tratándose como antorcha: distancia 8 sin luz.
	const outLegacy = computeChunkLight(0, 0, CS, WH, MINY, blockAt, [
		[CS / 2, MINY, CS / 2]
	]);
	r.check(
		"L1 entrada legacy (sin id) = radio antorcha",
		outLegacy[idx(CS / 2 + 8, CS / 2)] === 0
	);

	// ==========================================================
	// B1 — Cabezas con cara solo en el frente
	// ==========================================================
	// mobtextures.js: toda especie con `head:` define también `headSide:`
	// (el slime no tiene cabeza). Se audita por fuente (MOB_TEXTURES no
	// se exporta; patrón regex del proyecto).
	const mobTexSrc = fs.readFileSync(
		path.join(ROOT, "public/mobtextures.js"),
		"utf8"
	);
	const headSinSide = [];
	// Por cada bloque "tipo: {...}" del mapa MOB_TEXTURES, exigir que si
	// contiene "head: draw" contenga también "headSide:".
	const mapaSrc = mobTexSrc.slice(mobTexSrc.indexOf("const MOB_TEXTURES"));
	const entradas = mapaSrc.match(/\t[a-z]+: \{[^}]*\}/g) || [];
	for (const e of entradas) {
		if (/head: /.test(e) && !/headSide: /.test(e))
			headSinSide.push(e.slice(1, e.indexOf(":")));
	}
	r.check(
		"B1 toda especie con cabeza define headSide",
		headSinSide.length === 0,
		headSinSide.join(",")
	);
	r.check(
		"B1 buildPartGroup reparte caras (frente +Z = grupo 4)",
		fs
			.readFileSync(path.join(ROOT, "public/mobs.js"), "utf8")
			.includes("sideRect && gi !== 4")
	);

	// skins: cada skin pinta headSide SIN rasgos (ojos distintos a la cara)
	// y head CON ojos. tilePixels es puro (matrices), testeable en Node.
	const skinsMod = await loaderESM("public/skins.js");
	let sideOk = true;
	let faceOk = true;
	for (const { id } of skinsMod.SKINS) {
		const face = skinsMod.tilePixels(id, "head");
		const side = skinsMod.tilePixels(id, "headSide");
		if (!face || !side) {
			sideOk = false;
			continue;
		}
		// Ojos 2x1 en (3..4,5) y (11..12,5): presentes en la cara...
		const eyeFace = face[5 * 16 + 3] && face[5 * 16 + 11];
		if (!eyeFace) faceOk = false;
		// ...y DISTINTOS (piel sin rasgos) en el lateral.
		if (side[5 * 16 + 3] === face[5 * 16 + 3]) sideOk = false;
		if (!/^#[0-9a-f]{6}$/i.test(side[0] || "")) sideOk = false;
	}
	r.check("B1 headSide de cada skin sin ojos (lateral plano)", sideOk);
	r.check("B1 head frontal conserva los ojos", faceOk);
	r.check(
		"B1 skintextures incluye headSide en el atlas",
		fs
			.readFileSync(path.join(ROOT, "public/skintextures.js"), "utf8")
			.includes('["head", "headSide", "body", "arm", "leg"]')
	);

	// ==========================================================
	// S1 — Pase interno de servidor: regresiones de los fixes
	// ==========================================================
	const state = require(`${ROOT}/server/state.js`);
	const fishing = require(`${ROOT}/server/fishing.js`);
	const projectiles = require(`${ROOT}/server/projectiles.js`);
	const savePlayers = require(`${ROOT}/server/save-players.js`);

	// 3.1: la vida de la línea cubre el peor caso de picada (5+25 s) — antes
	// expiraba a 15 s y ~60 % de lanzamientos nunca llegaban a picar.
	r.check(
		"S1 FISHING_LIFE_MS ≥ BITE_MIN+BITE_RANGE (la línea espera el bocado)",
		fishing.FISHING_LIFE_MS >=
			fishing.BITE_MIN_MS + fishing.BITE_RANGE_MS
	);

	// 3.2: con el inventario lleno la línea SIGUE en el agua (se puede
	// recoger al liberar hueco); antes se retiraba sin entregar nada.
	{
		const player = {
			id: "s1fisher",
			x: 0,
			y: 40,
			z: 0,
			yaw: 0,
			pitch: 0,
			selectedSlot: 0,
			// 36 stacks de tierra al máximo: sin hueco para el pescado.
			inventory: new Array(36).fill(null).map(() => ({ id: 3, count: 64 }))
		};
		state.bobbers.push({
			x: 0,
			y: 40,
			z: 0,
			vx: 0,
			vy: 0,
			vz: 0,
			life: fishing.FISHING_LIFE_MS,
			playerId: player.id,
			inWater: true,
			biting: true,
			biteAt: Date.now() - 1
		});
		const res = fishing.reelBobber(player);
		r.check(
			"S1 reelBobber con inventario lleno conserva la línea",
			res.caught === null &&
				res.broke === false &&
				state.bobbers.some((b) => b.playerId === player.id)
		);
		state.bobbers = [];
	}

	// 2.2: el snapshot de flecha transmite el veneno del Bogged.
	r.check(
		"S1 arrowSnapshot incluye poison",
		projectiles.arrowSnapshot({ x: 0, y: 0, z: 0, poison: true }).poison ===
			true &&
			projectiles.arrowSnapshot({ x: 0, y: 0, z: 0 }).poison === false
	);

	// 4.1: restorePlayer sana stacks corruptos del JSON (id inválido → null,
	// count gigante → MAX_STACK, no-objeto → null, respawnPoint NaN fuera).
	{
		const fsMod = require("node:fs");
		const constantsSrv = require(`${ROOT}/server/constants.js`);
		const prevSeed = constantsSrv.worldPaths.currentSeed;
		constantsSrv.setWorldSeed("s1test");
		const f = savePlayers.playerFilePath("s1corrupt");
		fsMod.mkdirSync(path.dirname(f), { recursive: true });
		fsMod.writeFileSync(
			f,
			JSON.stringify({
				inventory: [
					{ id: 999999, count: 1e9 },
					"basura",
					null,
					{ id: 3, count: -5 }
				],
				bundle: [
					{ id: 102, count: 2 },
					...new Array(8).fill(null)
				],
				respawnPoint: { x: "NaN", y: 1, z: 2 }
			})
		);
		const p = {
			name: "s1corrupt",
			inMenu: false,
			maxHealth: 20,
			inventory: new Array(36).fill(null),
			bundle: new Array(9).fill(null),
			armor: {}
		};
		savePlayers.restorePlayer(p);
		r.check(
			"S1 restorePlayer sanea id inválido / no-objeto / count negativo",
			p.inventory[0] === null &&
				p.inventory[1] === null &&
				p.inventory[2] === null &&
				p.inventory[3] === null
		);
		r.check(
			"S1 restorePlayer conserva bundle válido con count ≤ MAX_STACK",
			p.bundle[0]?.id === 102 && p.bundle[0]?.count <= 64
		);
		r.check(
			"S1 respawnPoint sin coords finitas se descarta",
			p.respawnPoint == null
		);
		fsMod.rmSync(path.join(ROOT, "world", "s1test"), {
			recursive: true,
			force: true
		});
		constantsSrv.setWorldSeed(prevSeed);
	}

	// 6.1: releaseWorld limpia TODO el estado efímero (flechas/bobbers/
	// puertas/watchers de horno/cooldowns de trampas no viajan ni al menú).
	{
		const save = require(`${ROOT}/server/save.js`);
		const constantsSrv = require(`${ROOT}/server/constants.js`);
		state.arrows.push({ x: 0, y: 0, z: 0, life: 100 });
		state.bobbers.push({
			x: 0,
			y: 0,
			z: 0,
			playerId: "x",
			life: 100,
			inWater: true,
			biting: false,
			biteAt: 0
		});
		state.doors.set("1,2,3", { open: true });
		state.openFurnaceWatchers.set("1,2,3", new Set(["x"]));
		state.templeTrapCooldowns.set("1,2", Date.now());
		state.pyramidTrapCooldowns.set("1,2", Date.now());
		constantsSrv.setWorldSeed("s1reset"); // semilla desechable
		save.releaseWorld();
		r.check(
			"S1 releaseWorld limpia proyectiles/líneas/puertas/watchers/trampas",
			state.arrows.length === 0 &&
				state.bobbers.length === 0 &&
				state.doors.size === 0 &&
				state.openFurnaceWatchers.size === 0 &&
				state.templeTrapCooldowns.size === 0 &&
				state.pyramidTrapCooldowns.size === 0
		);
		fs.rmSync(path.join(ROOT, "world", "s1reset"), {
			recursive: true,
			force: true
		});
	}

	// 5.4: spawnMobs compara contra MOB_TOTAL exportado (sin literal 30).
	{
		delete require.cache[require.resolve(`${ROOT}/server/mob-spawn.js`)];
		const mobSpawn = require(`${ROOT}/server/mob-spawn.js`);
		r.check(
			"S1 la cuota global es MOB_TOTAL=30 compartida (spawn/cría/summon)",
			mobSpawn.MOB_TOTAL === 30
		);
	}

	console.log(`\nunit-fase22.3: ${r.ok}/${r.ok + r.fail} checks OK`);
	if (r.fail > 0) process.exit(1);
})();
