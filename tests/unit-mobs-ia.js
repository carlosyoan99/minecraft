'use strict';
// ============================================================
// TESTS UNITARIOS DE IA DE MOBS (Fase 0)
// Máquina de estados (idle/chase/flee), ataque con cooldown,
// creeper (explosión), skeleton (mantiene distancia), enderman
// (teletransporte), pasivos (huyen), spawnMobs y mobSnapshot.
// ============================================================
const mobs = require('../mobs.js');
const state = require('../state.js');
const world = require('../world.js');
const { HOSTILE, MOB_XP } = require('../constants.js');

// Suelo siempre sólido para no depender del mundo real (como unit-cria).
world.getBlock = () => 3;
let setBlockCalls = 0;
world.setBlock = () => { setBlockCalls++; return true; };

let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
};

const CLOSED = 3; // ws que no envía nada (como unit-hambre)
function mkPlayer(over = {}) {
  return { id: 'p' + Math.random(), ws: { readyState: CLOSED, send() {} }, health: 20, x: 0, y: 10, z: 0, ...over };
}
function resetPlayers() { state.players.clear(); }

// --- 1) Constructor: salud por tipo y estado inicial ---
check('zombie 20 HP', new mobs.Mob('zombie', 0, 0, 0).health === 20);
check('spider 12 HP (frágil pero rápida)', new mobs.Mob('spider', 0, 0, 0).health === 12);
check('wolf 20 HP', new mobs.Mob('wolf', 0, 0, 0).health === 20);
check('conejo 10 HP (pasivo)', new mobs.Mob('rabbit', 0, 0, 0).health === 10);
check('vaca 10 HP (pasivo por defecto)', new mobs.Mob('cow', 0, 0, 0).health === 10);
check('HOSTILE incluye los hostiles (zombie, spider, wolf...)',
  ['zombie', 'creeper', 'skeleton', 'enderman', 'spider', 'wolf'].every((t) => HOSTILE.has(t)));
const m = new mobs.Mob('cow', 0, 0, 0);
check('estado inicial idle + alive + no bebé', m.state === 'idle' && m.alive === true && m.isBaby === false);

// --- 2) wander: se mueve hacia el target ---
{
  const a = new mobs.Mob('cow', 0, 10, 0);
  a.targetX = 4;
  a.targetZ = 0;
  const rnd = Math.random;
  Math.random = () => 0.5; // 0.5 < 0.01 es falso → no cambia el target
  a.wander();
  Math.random = rnd;
  check('wander avanza hacia el target', a.x > 0, 'x=' + a.x);
}

// --- 3) findNearestPlayer: elige al jugador más cercano ---
{
  resetPlayers();
  const lejos = mkPlayer({ id: 'lejos', x: 50, z: 50 });
  const cerca = mkPlayer({ id: 'cerca', x: 1, z: 0 });
  state.players.set(lejos.id, lejos);
  state.players.set(cerca.id, cerca);
  const mob = new mobs.Mob('zombie', 0, 10, 0);
  const { nearest, dist } = mob.findNearestPlayer();
  check('findNearestPlayer elige al más cercano', nearest.id === 'cerca', 'id=' + (nearest && nearest.id));
  check('findNearestPlayer devuelve la distancia', dist < 2, 'dist=' + dist);
  resetPlayers();
}

// --- 4) zombie: chase de noche, ataque con cooldown, idle de día y lejos ---
{
  resetPlayers();
  const p = mkPlayer({ x: 1, y: 10, z: 0 });
  state.players.set(p.id, p);
  const z = new mobs.Mob('zombie', 0, 10, 0);
  z.tick(true); // noche
  check('zombie chases de noche', z.state === 'chase', 'state=' + z.state);
  z.x = 0.8; // acercarlo al alcance de ataque (< 1.6)
  z.tick(true);
  check('zombie ataca al jugador cerca (health 18)', p.health === 18, 'health=' + p.health);
  const cd = z.attackCooldown;
  z.tick(true);
  check('cooldown: no ataca dos ticks seguidos', z.attackCooldown === cd && p.health === 18);
  const z2 = new mobs.Mob('zombie', 100, 10, 100);
  z2.tick(false); // de día y lejos
  check('zombie idle de día y lejos', z2.state === 'idle', 'state=' + z2.state);
  resetPlayers();
}

// --- 5) creeper: explota cerca del jugador ---
{
  resetPlayers();
  const p = mkPlayer({ id: 'pc', x: 0.5, y: 10, z: 0.5 });
  state.players.set(p.id, p);
  const c = new mobs.Mob('creeper', 0, 10, 0);
  const rnd = Math.random;
  Math.random = () => 0; // 0 < 0.4 → siempre rompe bloques (determinista)
  setBlockCalls = 0;
  c.tick(true);
  Math.random = rnd;
  check('creeper explota cerca del jugador (alive=false)', c.alive === false);
  check('explosión daña al jugador (10)', p.health === 10, 'health=' + p.health);
  check('explosión elimina bloques (setBlock llamado)', setBlockCalls > 0, 'calls=' + setBlockCalls);
  resetPlayers();
}

// --- 6) skeleton: mantiene distancia y ataca a distancia ---
{
  resetPlayers();
  const p = mkPlayer({ id: 'ps', x: 3, y: 10, z: 0 });
  state.players.set(p.id, p);
  const sk = new mobs.Mob('skeleton', 0, 10, 0);
  sk.tick(true);
  check('skeleton se aleja cuando el jugador está cerca (dist < 4)', sk.x < 0, 'x=' + sk.x);
  check('skeleton ataca a distancia (health 18)', p.health === 18, 'health=' + p.health);
  resetPlayers();
}

// --- 7) enderman: teletransporta cerca del jugador ---
{
  resetPlayers();
  const p = mkPlayer({ id: 'pe', x: 5, y: 10, z: 0 });
  state.players.set(p.id, p);
  const e = new mobs.Mob('enderman', 0, 10, 0);
  const rnd = Math.random;
  Math.random = () => 0; // garantiza la rama de teletransporte
  e.tick(true);
  Math.random = rnd;
  check('enderman teletransporta cerca del jugador', Math.hypot(e.x - 5, e.z) < 6, `x=${e.x} z=${e.z}`);
  check('enderman en estado chase tras teletransporte', e.state === 'chase', 'state=' + e.state);
  resetPlayers();
}

// --- 8) spider y wolf: hostiles que chases de noche ---
{
  resetPlayers();
  const p = mkPlayer({ id: 'pa', x: 2, y: 10, z: 0 });
  state.players.set(p.id, p);
  const sp = new mobs.Mob('spider', 0, 10, 0);
  sp.tick(true);
  check('spider chases de noche', sp.state === 'chase', 'state=' + sp.state);
  const w = new mobs.Mob('wolf', 0, 10, 0);
  w.tick(true);
  check('wolf chases de noche', w.state === 'chase', 'state=' + w.state);
  resetPlayers();
}

// --- 9) pasivos: huyen del jugador cercano e idle si está lejos ---
{
  resetPlayers();
  const p = mkPlayer({ id: 'pb', x: 1, y: 10, z: 0 });
  state.players.set(p.id, p);
  const v = new mobs.Mob('cow', 0, 10, 0);
  v.tick(true);
  check('vaca huye cuando el jugador está cerca', v.state === 'flee', 'state=' + v.state);
  check('vaca se aleja del jugador', v.x < 0, 'x=' + v.x);
  const v2 = new mobs.Mob('cow', 50, 10, 50);
  v2.tick(true);
  check('vaca idle con jugador lejos', v2.state === 'idle', 'state=' + v2.state);
  resetPlayers();
}

// --- 10) attack: respeta el cooldown de la instancia ---
{
  resetPlayers();
  const p = mkPlayer({ id: 'patk', x: 0, y: 10, z: 0 });
  state.players.set(p.id, p);
  const m2 = new mobs.Mob('zombie', 0.5, 10, 0);
  m2.attack(p, 2, 1000);
  const cd = m2.attackCooldown;
  check('attack aplica el daño y marca cooldown', p.health === 18 && cd > 0);
  m2.attack(p, 2, 1000);
  check('attack no vuelve a golpear dentro del cooldown', p.health === 18);
  resetPlayers();
}

// --- 11) spawnMobs: requiere jugadores y respeta el tope de 30 ---
{
  resetPlayers();
  state.mobs = [];
  mobs.spawnMobs();
  check('spawnMobs sin jugadores no genera nada', state.mobs.length === 0);
  state.players.set('x', mkPlayer({ id: 'x', x: 0, y: 10, z: 0 }));
  const rnd = Math.random;
  Math.random = () => 0.5;
  mobs.spawnMobs();
  Math.random = rnd;
  check('spawnMobs genera mobs con jugador', state.mobs.length >= 1, 'n=' + state.mobs.length);
  state.mobs = [];
  for (let i = 0; i < 31; i++) state.mobs.push(new mobs.Mob('zombie', i, 10, i));
  const n = state.mobs.length;
  mobs.spawnMobs();
  check('spawnMobs no pasa de 30 mobs', state.mobs.length === n, 'n=' + state.mobs.length);
  resetPlayers();
  state.mobs = [];
}

// --- 12) mobSnapshot expone type/state/isBaby (el cliente escala por tipo) ---
{
  const m3 = new mobs.Mob('rabbit', 1, 2, 3);
  m3.isBaby = true;
  const s = mobs.mobSnapshot(m3);
  check('snapshot type', s.type === 'rabbit');
  check('snapshot isBaby', s.isBaby === true);
  check('snapshot state', s.state === 'idle');
  check('MOB_XP cubre los mobs del juego (incluye Fase 5)',
    ['zombie', 'creeper', 'skeleton', 'enderman', 'spider', 'wolf', 'cow', 'pig', 'chicken', 'sheep', 'rabbit']
      .every((t) => MOB_XP[t] > 0));
}

console.log(fails === 0 ? '\n✅ Todos los tests pasan' : `\n❌ ${fails} tests fallaron`);
process.exit(fails ? 1 : 0);
