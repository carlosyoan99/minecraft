// ============================================================
// AUDIO PROCEDURAL (Web Audio API)
// Sin assets binarios ni build step: todos los sonidos se generan
// al vuelo con buffers de ruido y osciladores, igual que el atlas
// de texturas. El contexto se crea (o reanuda) en el primer gesto
// del usuario, como exigen los navegadores para permitir audio.
// ============================================================
import { currentPhase } from "./daynight.js";

const MASTER_VOLUME = 0.8; // volumen general por defecto (el silencio lo pone a 0)
// Volumen por categoría (Fase 7): master (todo), effects (bloques, pasos,
// comer...) y ambient (viento, pájaros, grillos). El menú los ajusta con
// setVolume(); cada categoría es un gain en serie hacia el master.
const VOLUMES = { master: MASTER_VOLUME, effects: 1, ambient: 1 };
let ctx = null;
let master = null;
let sfxGain = null;
let ambGain = null;
let noiseBuffer = null;

// Preferencia de silencio persistente (localStorage)
const MUTE_KEY = "mc_audio_muted";
let muted = false;
try {
	muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {}

// ============================================================
// INICIALIZACIÓN DIFERIDA (primer clic/tecla del usuario)
// ============================================================
// Desbloqueo automático en el primer gesto (p. ej. el botón "Jugar")
function unlock() {
	ensureCtx();
}
window.addEventListener("pointerdown", unlock, { once: true });
window.addEventListener("keydown", unlock, { once: true });

function ensureCtx() {
	if (ctx) {
		if (ctx.state === "suspended") ctx.resume().catch(() => {});
		return ctx;
	}
	const AC = window.AudioContext || window.webkitAudioContext;
	if (!AC) return null;
	ctx = new AC();
	// Cadena de ganancia por categoría: sfx/ambient → master → destination.
	master = ctx.createGain();
	master.gain.value = muted ? 0 : VOLUMES.master; // respeta la preferencia persistida
	sfxGain = ctx.createGain();
	sfxGain.gain.value = VOLUMES.effects;
	ambGain = ctx.createGain();
	ambGain.gain.value = VOLUMES.ambient;
	sfxGain.connect(master);
	ambGain.connect(master);
	master.connect(ctx.destination);
	startWind();
	startMusic(); // Fase 10 (F1): pad ambiental generativo
	return ctx;
}

// Buffer de ruido blanco reutilizable (2s)
function getNoiseBuffer() {
	if (noiseBuffer) return noiseBuffer;
	const len = ctx.sampleRate * 2;
	const buf = ctx.createBuffer(1, len, ctx.sampleRate);
	const d = buf.getChannelData(0);
	for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
	noiseBuffer = buf;
	return noiseBuffer;
}

// ============================================================
// PERFIL DE SONIDO POR MATERIAL (IDs de constants.js)
// ============================================================
const MATERIALS = {
	stone: { hit: 1200, thud: 95 }, // piedra, adoquín, menas, roca madre, horno
	dirt: { hit: 800, thud: 70 }, // tierra, césped, arena
	wood: { hit: 1600, thud: 130 }, // tronco, tablones, mesa de crafteo
	plant: { hit: 2400, thud: 110 }, // hojas
	glass: { hit: 3200, thud: 300 }, // vidrio
	wool: { hit: 700, thud: 60 } // lana
};

function materialFor(blockId) {
	if (
		blockId === 3 ||
		blockId === 8 ||
		blockId === 16 ||
		blockId === 19 ||
		(blockId >= 9 && blockId <= 14)
	)
		return MATERIALS.stone;
	if (blockId === 1 || blockId === 2 || blockId === 6) return MATERIALS.dirt;
	if (blockId === 4 || blockId === 7 || blockId === 15) return MATERIALS.wood;
	if (blockId === 5) return MATERIALS.plant;
	if (blockId === 17) return MATERIALS.glass;
	if (blockId === 18) return MATERIALS.wool;
	return MATERIALS.stone;
}

// ============================================================
// SÍNTESIS BÁSICA
// ============================================================

// Variación de tono ±6% (Fase 10, skill audio-design: SFX variation): los
// sonidos repetidos (pasos, roturas, golpes) no suenan a "ametralladora"
// robótica. Se aplica multiplicando la frecuencia base de cada evento.
function pitchVar() {
	return 0.94 + Math.random() * 0.12;
}

// Ráfaga de ruido filtrado con envolvente rápida (ataque/decaimiento)
function noiseBurst({ t, freq, q, vol, dur, type = "bandpass" }) {
	const src = ctx.createBufferSource();
	src.buffer = getNoiseBuffer();
	src.loop = true;
	const f = ctx.createBiquadFilter();
	f.type = type;
	f.frequency.value = freq;
	f.Q.value = q;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(vol, t + 0.004);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	src.connect(f);
	f.connect(g);
	g.connect(sfxGain);
	src.start(t);
	src.stop(t + dur + 0.05);
}

// Golpe grave (oscilador senoidal que cae de tono)
function thud({ t, freq, vol, dur }) {
	const osc = ctx.createOscillator();
	osc.type = "sine";
	osc.frequency.setValueAtTime(freq, t);
	osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t + dur);
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
	g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
	osc.connect(g);
	g.connect(sfxGain);
	osc.start(t);
	osc.stop(t + dur + 0.05);
}

// ============================================================
// SILENCIO (persistido en localStorage) Y VOLUMEN POR CATEGORÍA
// ============================================================
export function isMuted() {
	return muted;
}

export function setMuted(m) {
	muted = !!m;
	try {
		localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
	} catch {}
	if (master) master.gain.value = muted ? 0 : VOLUMES.master;
	return muted;
}

// Volumen de una categoría ('master' | 'effects' | 'ambient'), 0..1.
// Se aplica al gain correspondiente (o se guarda para cuando el contexto
// exista, p. ej. antes del primer gesto del usuario).
export function setVolume(category, v) {
	if (!(category in VOLUMES)) return;
	const vol = Math.min(1, Math.max(0, Number(v) || 0));
	VOLUMES[category] = vol;
	if (category === "master" && master) {
		master.gain.value = muted ? 0 : vol;
	} else if (category === "effects" && sfxGain) {
		sfxGain.gain.value = vol;
	} else if (category === "ambient" && ambGain) {
		ambGain.gain.value = vol;
	}
}

// ============================================================
// SONIDOS DE BLOQUE
// ============================================================
export function playBreak(blockId) {
	if (!ensureCtx()) return;
	const m = materialFor(blockId);
	const t = ctx.currentTime + 0.001;
	noiseBurst({ t, freq: m.hit * pitchVar(), q: 1.2, vol: 0.5, dur: 0.12 });
	thud({ t, freq: m.thud * pitchVar(), vol: 0.45, dur: 0.12 });
}

export function playPlace(blockId) {
	if (!ensureCtx()) return;
	const m = materialFor(blockId);
	const t = ctx.currentTime + 0.001;
	noiseBurst({
		t,
		freq: m.hit * 0.7 * pitchVar(),
		q: 1.6,
		vol: 0.3,
		dur: 0.07
	});
	thud({ t, freq: m.thud * pitchVar(), vol: 0.3, dur: 0.07 });
}

// ============================================================
// HERRAMIENTA ROTA (crack seco y breve, Fase 5)
// ============================================================
export function playCrack() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	noiseBurst({
		t,
		freq: 2600 * pitchVar(),
		q: 0.8,
		vol: 0.5,
		dur: 0.09,
		type: "highpass"
	});
	thud({ t: t + 0.02, freq: 60 * pitchVar(), vol: 0.35, dur: 0.1 });
}

// ============================================================
// GOLPE DE COMBATE (Fase 8, B10): ruido seco + golpe grave corto.
// Feedback auditivo al golpear un mob (mob_hit) — antes el golpe era
// silencioso y el jugador no sabía si había acertado.
// ============================================================
export function playHit() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	noiseBurst({
		t,
		freq: 1800 * pitchVar(),
		q: 1,
		vol: 0.45,
		dur: 0.06,
		type: "bandpass"
	});
	thud({ t: t + 0.01, freq: 110 * pitchVar(), vol: 0.5, dur: 0.1 });
}

// ============================================================
// COMER (mordisco corto)
// ============================================================
export function playEat() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	// Mordisco: dos blips de ruido muy cortos (masticar)
	noiseBurst({ t, freq: 700, q: 2.5, vol: 0.2, dur: 0.05, type: "bandpass" });
	noiseBurst({
		t: t + 0.09,
		freq: 550,
		q: 2.5,
		vol: 0.16,
		dur: 0.05,
		type: "bandpass"
	});
}

// ============================================================
// SPLASH DE AGUA (Fase 9, Bloque E): al entrar/salir del agua — ráfaga de
// ruido con filtro de paso alto que cae de tono (chapoteo corto).
// ============================================================
export function playSplash() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	noiseBurst({ t, freq: 900, q: 0.6, vol: 0.4, dur: 0.28, type: "bandpass" });
	thud({ t: t + 0.03, freq: 220, vol: 0.22, dur: 0.2 });
}

// ============================================================
// TNT (Fase 10, F2): mecha (chisporroteo) y explosión (boom grave + ruido).
// El servidor las dispara con los broadcasts tnt_fuse/tnt_explode; el
// cliente las dibuja donde suena la mecha y donde abre el cráter.
// ============================================================
export function playTntFuse() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	// Chisporroteo: ruido agudo con filtro que cae (la mecha "quema")
	noiseBurst({
		t,
		freq: 3800 * pitchVar(),
		q: 0.6,
		vol: 0.18,
		dur: 0.8,
		type: "highpass"
	});
	// Chasquidos de la pólvora: 3 blips cortos desfasados
	for (let i = 0; i < 3; i++) {
		noiseBurst({
			t: t + 0.15 + i * 0.25,
			freq: 1600 * pitchVar(),
			q: 2,
			vol: 0.1,
			dur: 0.03,
			type: "bandpass"
		});
	}
}

export function playTntExplode() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	// Boom: ruido grave largo + golpe grave muy bajo (subwoofer del cráter)
	noiseBurst({
		t,
		freq: 180 * pitchVar(),
		q: 0.5,
		vol: 0.65,
		dur: 0.5,
		type: "lowpass"
	});
	thud({ t, freq: 55 * pitchVar(), vol: 0.85, dur: 0.5 });
	// Cascotes: ráfaga de ruido que cae de tono
	noiseBurst({
		t: t + 0.05,
		freq: 900,
		q: 0.8,
		vol: 0.3,
		dur: 0.35,
		type: "bandpass"
	});
}

// ============================================================
// COFRES (Fase 10, F2): madera que se abre/cierra (clic seco de bisagra)
// ============================================================
export function playChestOpen() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	// Dos chasquidos: bisagra abre + tapa cae
	thud({ t, freq: 180 * pitchVar(), vol: 0.3, dur: 0.06 });
	noiseBurst({ t, freq: 1100, q: 3, vol: 0.12, dur: 0.04 });
	thud({ t: t + 0.14, freq: 140 * pitchVar(), vol: 0.26, dur: 0.05 });
}

export function playChestClose() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	// Tapa que se cierra: golpe seco más grave
	noiseBurst({ t, freq: 900, q: 3, vol: 0.1, dur: 0.03 });
	thud({ t: t + 0.08, freq: 120 * pitchVar(), vol: 0.34, dur: 0.09 });
}

// ============================================================
// ALIMENTAR ANIMALES (mordisco alegre que sube de tono)
// ============================================================
export function playFeed() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	// Mordisco de animal contento: blip corto que sube de tono
	noiseBurst({ t, freq: 500, q: 3, vol: 0.18, dur: 0.05, type: "bandpass" });
	noiseBurst({
		t: t + 0.08,
		freq: 800,
		q: 3,
		vol: 0.14,
		dur: 0.06,
		type: "bandpass"
	});
}

// ============================================================
// MOBS (Fase 11, C): siseo del creeper y balido de la oveja
// ============================================================

// Siseo de mecha del creeper: ráfaga de ruido blanco filtrada en agudo con
// frecuencia ASCENDENTE (el "fssss" que sube de tono mientras silba antes de
// explotar). Se dispara una vez al empezar el fuse (public/mobs.js).
export function playCreeperHiss() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	const src = ctx.createBufferSource();
	src.buffer = getNoiseBuffer();
	src.loop = false;
	const f = ctx.createBiquadFilter();
	f.type = "bandpass";
	f.frequency.setValueAtTime(1700, t);
	f.frequency.exponentialRampToValueAtTime(3400, t + 0.5);
	f.Q.value = 1.1;
	const g = ctx.createGain();
	g.gain.setValueAtTime(0.0001, t);
	g.gain.exponentialRampToValueAtTime(0.16, t + 0.03);
	g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
	src.connect(f);
	f.connect(g);
	g.connect(sfxGain);
	src.start(t);
	src.stop(t + 0.6);
}

// Balido de la oveja: dos osciladores "sawtooth" suaves y desafinados con
// paso grave que cae (voz gutural de oveja). Sonido ambiental raro.
export function playSheepBaa() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	for (const [f0, f1, vol] of [
		[340, 205, 0.13],
		[452, 275, 0.09]
	]) {
		const osc = ctx.createOscillator();
		osc.type = "sawtooth";
		osc.frequency.setValueAtTime(f0 * pitchVar(), t);
		osc.frequency.exponentialRampToValueAtTime(f1 * pitchVar(), t + 0.28);
		const f = ctx.createBiquadFilter();
		f.type = "lowpass";
		f.frequency.value = 900;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
		g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
		osc.connect(f);
		f.connect(g);
		g.connect(sfxGain);
		osc.start(t);
		osc.stop(t + 0.36);
	}
}

// ============================================================
// PASOS (alternan sutilmente de tono)
// ============================================================
let stepAlt = false;
export function playStep(blockId) {
	if (!ensureCtx()) return;
	const m = materialFor(blockId);
	const t = ctx.currentTime + 0.001;
	stepAlt = !stepAlt;
	noiseBurst({
		t,
		freq: m.hit * (stepAlt ? 0.9 : 1.1) * pitchVar(),
		q: 1.4,
		vol: 0.12,
		dur: 0.055,
		type: "lowpass"
	});
}

// ============================================================
// MÚSICA GENERATIVA (Fase 10, F1)
// Pad ambiental sin samples: notas senoidales de una escala pentatónica
// programadas al azar (estilo Minecraft — música relajante de fondo). De día
// la escala es más brillante (La mayor relativa), de noche más grave y
// misteriosa (La menor). Volumen muy bajo: es un "colchón", no una melodía.
// ============================================================
let musicGain = null;
let nextMusicNoteAt = 0;
// Frecuencias pentatónicas de La (A3..E5) — suenan bien juntas al azar.
const MUSIC_SCALE = [
	220, // A3
	261.63, // C4
	293.66, // D4
	329.63, // E4
	392.0, // G4
	440.0, // A4
	523.25 // C5
];

// ============================================================
// CONTEXTO MUSICAL (Fase 10, nota del usuario: "música que varíe según el
// bioma y las cuevas"). El cliente (player.js) lo actualiza cada segundo con
// el entorno del jugador — barato, sin red:
//   cave: bajo techo (cueva/mina) — notas graves y espaciadas, misterio
//   warm: desierto (bloque arena bajo los pies) — escala brillante
//   cold: bioma frío (nieve/hielo) — escala cristalina y aguda
// updateMusic elige la paleta según este contexto en vez del día/noche.
// ============================================================
const musicCtx = { cave: false, warm: false, cold: false };
export function setMusicContext(ctx) {
	musicCtx.cave = !!ctx?.cave;
	musicCtx.warm = !!ctx?.warm;
	musicCtx.cold = !!ctx?.cold;
}

function startMusic() {
	musicGain = ctx.createGain();
	musicGain.gain.value = 0.035; // muy bajo: fondo, no protagonista
	musicGain.connect(master);
}

// Nota de pad: seno suave + armónico (octava) con envolvente lenta y larga.
function padNote(freq, t, vol) {
	for (const mult of [1, 2]) {
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.value = freq * mult;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + 0.4); // attack lento
		g.gain.exponentialRampToValueAtTime(0.0001, t + 4.5); // decay largo
		osc.connect(g);
		g.connect(musicGain);
		osc.start(t);
		osc.stop(t + 4.6);
	}
}

function updateMusic(dayFactor) {
	if (!musicGain) return;
	const now = performance.now();
	if (now < nextMusicNoteAt) return;
	// Paleta por contexto (Fase 10): cueva → grave/espaciado; desierto →
	// brillante; nieve → agudo; por defecto el día/noche de siempre.
	let pool;
	let vol = 0.05 + Math.random() * 0.03;
	let gapMin = 3000;
	if (musicCtx.cave) {
		pool = MUSIC_SCALE.slice(0, 3); // A3..D4, graves
		vol *= 0.7; // más tenue: el silencio también es cueva
		gapMin = 5000; // notas espaciadas
	} else if (musicCtx.warm) {
		pool = MUSIC_SCALE.slice(4, 7); // G4..C5, brillante
		vol *= 1.15;
	} else if (musicCtx.cold) {
		pool = [MUSIC_SCALE[3], MUSIC_SCALE[4], MUSIC_SCALE[6]]; // E4, G4, C5
		vol *= 0.9;
	} else {
		// De día: escala aguda/brillante (índices 2..6); de noche: grave (0..4).
		pool = dayFactor > 0.5 ? MUSIC_SCALE.slice(2, 7) : MUSIC_SCALE.slice(0, 5);
	}
	const freq = pool[Math.floor(Math.random() * pool.length)];
	padNote(freq, ctx.currentTime + 0.2, vol);
	// Intervalo aleatorio 3..7 s (cuevas: 5..9): impredecible pero constante.
	nextMusicNoteAt = now + gapMin + Math.random() * 4000;
}

// ============================================================
// AMBIENTE: VIENTO CONTINUO + PÁJAROS (DÍA) / GRILLOS (NOCHE)
// ============================================================
let wind = null;
let nextBirdAt = 0;
let nextCricketAt = 0;

function startWind() {
	wind = {
		src: ctx.createBufferSource(),
		filter: ctx.createBiquadFilter(),
		gain: ctx.createGain()
	};
	wind.src.buffer = getNoiseBuffer();
	wind.src.loop = true;
	wind.filter.type = "lowpass";
	wind.filter.frequency.value = 400;
	wind.gain.gain.value = 0.0;
	wind.src.connect(wind.filter);
	wind.filter.connect(wind.gain);
	wind.gain.connect(ambGain);
	wind.src.start();
}

// Trino de pájaro: 3 blips senoidales que suben de tono
function birdChirp() {
	const t = ctx.currentTime;
	const base = 2200 + Math.random() * 1200;
	for (let i = 0; i < 3; i++) {
		const t0 = t + i * 0.09;
		const osc = ctx.createOscillator();
		osc.type = "sine";
		osc.frequency.setValueAtTime(base, t0);
		osc.frequency.exponentialRampToValueAtTime(base * 1.35, t0 + 0.06);
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
		osc.connect(g);
		g.connect(ambGain);
		osc.start(t0);
		osc.stop(t0 + 0.08);
	}
}

// Chirrido de grillo: 2 blips cuadrados agudos
function cricketChirp() {
	const t = ctx.currentTime;
	const freq = 4000 + Math.random() * 600;
	for (let i = 0; i < 2; i++) {
		const t0 = t + i * 0.11;
		const osc = ctx.createOscillator();
		osc.type = "square";
		osc.frequency.value = freq;
		const g = ctx.createGain();
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.exponentialRampToValueAtTime(0.028, t0 + 0.006);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.05);
		osc.connect(g);
		g.connect(ambGain);
		osc.start(t0);
		osc.stop(t0 + 0.06);
	}
}

// Se llama cada frame: ajusta el viento a la fase y programa chirridos.
// Barata: solo setTargetAtTime sobre AudioParams y comparaciones de tiempo.
export function updateAmbient() {
	if (!ctx || !wind) return; // sin gesto del usuario aún
	const dayFactor = Math.max(0, Math.sin(currentPhase() * Math.PI * 2));
	const t = ctx.currentTime;
	const now = performance.now();

	// Fase 10 (F1): música generativa de fondo
	updateMusic(dayFactor);

	// Viento: más abierto y suave de día, más grave y denso de noche
	wind.filter.frequency.setTargetAtTime(250 + dayFactor * 550, t, 1.2);
	wind.gain.gain.setTargetAtTime(0.015 + dayFactor * 0.02, t, 2.0);

	// Pájaros durante el día
	if (dayFactor > 0.55 && now >= nextBirdAt) {
		birdChirp();
		nextBirdAt = now + 3000 + Math.random() * 5000;
	}
	// Grillos durante la noche
	if (dayFactor < 0.35 && now >= nextCricketAt) {
		cricketChirp();
		nextCricketAt = now + 400 + Math.random() * 700;
	}
}
