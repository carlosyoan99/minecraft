"use strict";
// ============================================================
// TESTS UNITARIOS DE LOS SKINS DE JUGADOR (Fase 17)
// Cubre:
//  - Núcleo PURO de public/skins.js: la lista oficial (Steve,
//    Alex, Noor, Sunny, Ari, Zuri, Makena, Kai, Efe), la matriz
//    de píxeles por parte (determinista, colores válidos, partes
//    pobladas y skins distinguibles entre sí).
//  - Sincronía cliente ↔ servidor: SKINS (cliente) ===
//    PLAYER_SKINS (server/constants.js), el patrón de sync del
//    proyecto (B/I, DURABILITY).
//  - Protocolo WS: skin en la URL (?skin=), en el init
//    (otherPlayers) y en player_join; set_skin validado (los
//    valores no oficiales se ignoran) y broadcast player_skin.
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Reporter, loaderESM } = require("./helpers.js");

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "mc-skins-"));
const constants = require("../server/constants.js");
// I/O aislado en un directorio temporal (NUNCA toca el world/ real).
constants.worldPaths.worldRoot = path.join(TMP, "worldroot");
constants.setWorldSeed(null, null); // empieza en modo menú (sin mundo activo)

const net = require("../server/net.js");
const state = require("../server/state.js");
const world = require("../server/world.js");

// Generación sin I/O de disco (los chunks se quedan en memoria).
world.setDiskLoader(() => null);
const r = new Reporter();

// --- ws fake: captura mensajes salientes y permite inyectar entrantes ---
class FakeWS {
	constructor() {
		this.sent = [];
		this.handlers = {};
		this.readyState = 1; // WebSocket.OPEN
	}
	send(str) {
		this.sent.push(JSON.parse(str));
	}
	on(ev, fn) {
		this.handlers[ev] = fn;
	}
	emit(ev, data) {
		if (this.handlers[ev]) this.handlers[ev](data);
	}
	events(name) {
		return this.sent.filter((m) => m.event === name);
	}
}

// handleConnection(ws, req): sin req → socket fake de test (sin rate-limit);
// con req { url } → socket real (el skin viaja en ?skin= de la URL).
function connect(url) {
	const ws = new FakeWS();
	net.handleConnection(ws, url ? { url } : undefined);
	return ws;
}

// ============================================================
// 1 — NÚCLEO PURO (public/skins.js, sin THREE ni DOM)
// ============================================================
(async () => {
	const skins = await loaderESM("public/skins.js");
	const EXPECTED = [
		["steve", "Steve"],
		["alex", "Alex"],
		["noor", "Noor"],
		["sunny", "Sunny"],
		["ari", "Ari"],
		["zuri", "Zuri"],
		["makena", "Makena"],
		["kai", "Kai"],
		["efe", "Efe"]
	];
	r.check(
		"skins: los 9 skins oficiales con sus nombres",
		skins.SKINS.length === 9 &&
			EXPECTED.every(
				([id, label], i) =>
					skins.SKINS[i].id === id && skins.SKINS[i].label === label
			)
	);
	r.check(
		"skins: SKIN_IDS coincide con SKINS",
		skins.SKIN_IDS.join() === EXPECTED.map(([id]) => id).join()
	);
	r.check(
		"skins: isValidSkin acepta oficiales y rechaza el resto",
		skins.isValidSkin("steve") &&
			skins.isValidSkin("efe") &&
			!skins.isValidSkin("hacker") &&
			!skins.isValidSkin("")
	);

	// Matriz de píxeles: 256 entradas, colores #rrggbb válidos o null.
	const PARTS = ["head", "body", "arm", "leg"];
	let pixelsValid = true;
	let partsPopulated = true;
	for (const { id } of skins.SKINS) {
		for (const part of PARTS) {
			const px = skins.tilePixels(id, part);
			if (!Array.isArray(px) || px.length !== 256) {
				pixelsValid = false;
				continue;
			}
			let colored = 0;
			for (const c of px) {
				if (c === null) continue;
				colored++;
				if (!/^#[0-9a-f]{6}$/i.test(c)) pixelsValid = false;
			}
			if (colored < 80) partsPopulated = false;
		}
	}
	r.check(
		"skins: tilePixels devuelve 256 colores válidos (#rrggbb) por skin y parte",
		pixelsValid
	);
	r.check(
		"skins: cada parte de cada skin está poblada (≥80 píxeles opacos)",
		partsPopulated
	);

	// Determinismo: misma skin + parte → misma matriz.
	const a1 = skins.tilePixels("steve", "head");
	const a2 = skins.tilePixels("steve", "head");
	r.check(
		"skins: tilePixels es determinista (misma entrada → misma salida)",
		a1.join() === a2.join()
	);

	// Distinción entre skins: cabezas y cuerpos únicos (si dos skins
	// colisionaran, serían indistinguibles en el selector y en el juego).
	const heads = new Set(
		skins.SKINS.map((s) => skins.tilePixels(s.id, "head").join())
	);
	const bodies = new Set(
		skins.SKINS.map((s) => skins.tilePixels(s.id, "body").join())
	);
	r.check("skins: las 9 cabezas son distintas entre sí", heads.size === 9);
	r.check("skins: los 9 cuerpos son distintos entre sí", bodies.size === 9);

	// Sincronía cliente ↔ servidor (fuente de verdad doble, como B/I).
	r.check(
		"sync: PLAYER_SKINS (servidor) === SKIN_IDS (cliente)",
		skins.SKIN_IDS.join() === constants.PLAYER_SKINS.join()
	);

	// ============================================================
	// 2 — PROTOCOLO WS (skin en URL/init/player_join y set_skin)
	// ============================================================
	{
		fs.mkdirSync(constants.worldPaths.worldRoot, { recursive: true });
		constants.setWorldSeed("skins-test", "Skins", "survival");
		world.reinitNoise("skins-test");
		state.players.clear();

		// A conecta con ?skin=alex → el servidor lo valida y lo guarda.
		const wsA = connect("/?name=Alfa&skin=alex");
		const initA = wsA.events("init")[0];
		const pA = state.players.get(initA.data.playerId);
		r.check(
			"protocolo: ?skin=alex se valida y queda en el jugador",
			!!pA && pA.skin === "alex"
		);
		r.check(
			"protocolo: init del primero sin otros jugadores",
			!!initA && Array.isArray(initA.data.otherPlayers)
		);

		// B conecta con ?skin=kai → el init de B trae el skin de A y A
		// recibe player_join con el skin de B.
		const wsB = connect("/?name=Beta&skin=kai");
		const initB = wsB.events("init")[0];
		const other = initB.data.otherPlayers.find((q) => q.id === pA.id);
		r.check(
			"protocolo: el init de B incluye el skin de A (otherPlayers)",
			!!other && other.skin === "alex"
		);
		const joinA = wsA.events("player_join")[0];
		r.check(
			"protocolo: A recibe player_join con el skin de B",
			!!joinA && joinA.data.skin === "kai"
		);

		// Skin no oficial en la URL → default "steve".
		const wsC = connect("/?name=Gamma&skin=rootkit");
		const initC = wsC.events("init")[0];
		const pC = state.players.get(initC.data.playerId);
		r.check(
			"protocolo: ?skin= no oficial cae a steve",
			!!pC && pC.skin === "steve"
		);

		// set_skin válido → actualiza y hace broadcast player_skin a los demás.
		const skinBefore = wsB.events("player_skin").length;
		wsA.emit(
			"message",
			JSON.stringify({ event: "set_skin", data: { skin: "zuri" } })
		);
		r.check(
			"protocolo: set_skin válido actualiza el jugador",
			state.players.get(pA.id).skin === "zuri"
		);
		const skinsB = wsB.events("player_skin");
		r.check(
			"protocolo: B recibe player_skin {id, skin} en vivo",
			skinsB.length === skinBefore + 1 &&
				skinsB[skinsB.length - 1].data.id === pA.id &&
				skinsB[skinsB.length - 1].data.skin === "zuri"
		);

		// set_skin inválido o ausente → ignorado (ni cambia ni propaga).
		wsA.emit(
			"message",
			JSON.stringify({ event: "set_skin", data: { skin: "hacker" } })
		);
		wsA.emit("message", JSON.stringify({ event: "set_skin", data: {} }));
		r.check(
			"protocolo: set_skin no oficial se ignora (sin cambio ni broadcast)",
			state.players.get(pA.id).skin === "zuri" &&
				wsB.events("player_skin").length === skinsB.length
		);
		state.players.clear();
	}

	r.done();
})().catch((e) => {
	console.error("unit-skins:", e.message);
	process.exit(1);
});
