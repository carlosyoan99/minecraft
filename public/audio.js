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
	noiseBurst({ t, freq: m.hit, q: 1.2, vol: 0.5, dur: 0.12 });
	thud({ t, freq: m.thud, vol: 0.45, dur: 0.12 });
}

export function playPlace(blockId) {
	if (!ensureCtx()) return;
	const m = materialFor(blockId);
	const t = ctx.currentTime + 0.001;
	noiseBurst({ t, freq: m.hit * 0.7, q: 1.6, vol: 0.3, dur: 0.07 });
	thud({ t, freq: m.thud, vol: 0.3, dur: 0.07 });
}

// ============================================================
// HERRAMIENTA ROTA (crack seco y breve, Fase 5)
// ============================================================
export function playCrack() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	noiseBurst({ t, freq: 2600, q: 0.8, vol: 0.5, dur: 0.09, type: "highpass" });
	thud({ t: t + 0.02, freq: 60, vol: 0.35, dur: 0.1 });
}

// ============================================================
// GOLPE DE COMBATE (Fase 8, B10): ruido seco + golpe grave corto.
// Feedback auditivo al golpear un mob (mob_hit) — antes el golpe era
// silencioso y el jugador no sabía si había acertado.
// ============================================================
export function playHit() {
	if (!ensureCtx()) return;
	const t = ctx.currentTime + 0.001;
	noiseBurst({ t, freq: 1800, q: 1, vol: 0.45, dur: 0.06, type: "bandpass" });
	thud({ t: t + 0.01, freq: 110, vol: 0.5, dur: 0.1 });
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
		freq: m.hit * (stepAlt ? 0.9 : 1.1),
		q: 1.4,
		vol: 0.12,
		dur: 0.055,
		type: "lowpass"
	});
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
