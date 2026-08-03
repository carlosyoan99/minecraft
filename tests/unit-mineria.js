'use strict';
// ============================================================
// TESTS UNITARIOS DE MINERÍA FINA (Fase 6)
// 1) Matemáticas de rotura: breakSeconds por herramienta/material
// 2) Drop condicional (canHarvest): piedra/minerales solo con pico
// 3) Sesión completa: progreso → stages 0-9 → bloque roto + drop +
//    XP + desgaste
// 4) Cancelaciones: break_cancel, bloque cambiado, distancia > 7
// 5) Herramienta equivocada / a mano: lento y sin drop (pero rompe)
// ============================================================
const mining = require('../mining.js');
const world = require('../world.js');
const playerHelpers = require('../players.js');
const {
  B, I, breakSeconds, canHarvest, BLOCK_HARDNESS, TOOL_TIER_SPEED,
} = require('../constants.js');

world.setDiskLoader(() => null);
let failed = 0;
const check = (name, ok, extra = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ' — ' + extra : ''}`);
};

function mkPlayer(extra = {}) {
  // Posición cercana a los bloques de prueba (y: 5): tickMining cancela la
  // sesión si la distancia 3D al bloque supera 7 (Math.hypot incluye la Y).
  // Con el jugador en y: 64 los bloques de y: 5 quedaban a ~59 bloques y
  // toda sesión se cancelaba al primer tick (bug detectado en revisión).
  return {
    id: 'test', ws: { readyState: 1, send: () => {} },
    x: 5.5, y: 5, z: 5.5,
    inventory: new Array(36).fill(null), selectedSlot: 0,
    xp: 0, level: 0, ...extra,
  };
}
const noopSend = () => [];
const sendFnCollect = (arr) => (pl, ev, data) => arr.push({ ev, data });

// --- 1) breakSeconds: dureza y velocidad por herramienta ---
check('mano sobre piedra = dureza (1.8s)', Math.abs(breakSeconds(0, B.STONE) - BLOCK_HARDNESS[B.STONE]) < 1e-9,
  breakSeconds(0, B.STONE) + 's');
check('pico de madera sobre piedra = dureza/2', Math.abs(breakSeconds(I.WOODEN_PICKAXE, B.STONE) - 1.8 / 2) < 1e-9);
check('pico de hierro más rápido que el de madera',
  breakSeconds(I.IRON_PICKAXE, B.STONE) < breakSeconds(I.WOODEN_PICKAXE, B.STONE));
check('oro es el más rápido (12x) aunque frágil',
  breakSeconds(I.GOLDEN_PICKAXE, B.STONE) === 1.8 / TOOL_TIER_SPEED[I.GOLDEN_PICKAXE]);
check('hacha en piedra: herramienta equivocada → x1 (lento)',
  Math.abs(breakSeconds(I.WOODEN_AXE, B.STONE) - BLOCK_HARDNESS[B.STONE]) < 1e-9);
check('hacha en tronco acelera (1.5/2)', Math.abs(breakSeconds(I.WOODEN_AXE, B.OAK_LOG) - 1.5 / 2) < 1e-9);
check('pala en tierra acelera', breakSeconds(I.WOODEN_SHOVEL, B.DIRT) === 0.6 / 2);
check('mineral de diamante: el más duro', BLOCK_HARDNESS[B.DIAMOND_ORE] >= 4);
check('todos los bloques rompibles tienen dureza', [B.GRASS, B.DIRT, B.SAND, B.SNOW, B.STONE, B.OAK_LOG, B.PLANKS,
  B.COBBLESTONE, B.COAL_ORE, B.DIAMOND_ORE, B.CRAFTING_TABLE, B.FURNACE].every((b) => BLOCK_HARDNESS[b] > 0));

// --- 2) canHarvest (drop condicional) ---
check('piedra con pico → drop', canHarvest(I.STONE_PICKAXE, B.STONE) === true);
check('piedra a mano → sin drop', canHarvest(0, B.STONE) === false);
check('mineral con pico → drop', canHarvest(I.WOODEN_PICKAXE, B.DIAMOND_ORE) === true);
check('mineral con hacha → sin drop', canHarvest(I.WOODEN_AXE, B.IRON_ORE) === false);
check('tierra a mano → drop', canHarvest(0, B.DIRT) === true);
check('tronco a mano → drop', canHarvest(0, B.OAK_LOG) === true);

// --- 3) Sesión completa (pico de hierro, piedra) ---
{
  const p = mkPlayer();
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(5, 5, 5, B.STONE);
  p.inventory[0] = { id: I.IRON_PICKAXE, count: 1, durability: 251 };
  p.selectedSlot = 0;
  mining.startMining(p, 5, 5, 5, B.STONE);
  // hierro 6x → 1.8/6 = 0.3s; avanzar de 20 en 20 ms
  let result = null;
  for (let i = 0; i < 200 && !result; i++) result = mining.tickMining(p, 20, world, playerHelpers, sendFn);
  check('la sesión completa (done)', result === 'done');
  check('bloque roto (AIR)', world.getBlock(5, 5, 5) === B.AIR);
  check('drop de adoquín', p.inventory.some((s) => s && s.id === B.COBBLESTONE));
  check('el pico se desgastó (-1)', p.inventory[0].durability === 250, 'dur=' + p.inventory[0].durability);
  const stages = sends.filter((s) => s.ev === 'block_break_progress').map((s) => s.data.stage);
  check('se envían varias fases de grieta', stages.length >= 10, stages.length + ' eventos');
  check('las fases van de 0 a 9 sin decrecer',
    stages[0] === 0 && stages[stages.length - 1] === 9 && stages.every((s, i) => i === 0 || s >= stages[i - 1]),
    JSON.stringify(stages));
}

// --- 3b) Mineral con pico: drop del mineral + XP ---
{
  const p = mkPlayer();
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(10, 5, 5, B.COAL_ORE);
  p.inventory[0] = { id: I.WOODEN_PICKAXE, count: 1, durability: 60 };
  p.selectedSlot = 0;
  mining.startMining(p, 10, 5, 5, B.COAL_ORE);
  let result = null;
  for (let i = 0; i < 400 && !result; i++) result = mining.tickMining(p, 20, world, playerHelpers, sendFn);
  check('mineral con pico: bloque roto + drop + XP (ORE_XP)',
    result === 'done' && world.getBlock(10, 5, 5) === B.AIR &&
    p.inventory.some((s) => s && s.id === B.COAL_ORE) && p.xp === 1, 'xp=' + p.xp);
}

// --- 4) Cancelaciones ---
{
  const p = mkPlayer();
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(6, 5, 5, B.DIRT);
  mining.startMining(p, 6, 5, 5, B.DIRT);
  check('break_cancel devuelve true y limpia la sesión', mining.cancelMining(p, sendFn) === true && p.mining === null);
  check('break_cancel avisa con stage -1', sends.some((s) => s.ev === 'block_break_progress' && s.data.stage === -1));
  check('cancelar sin sesión devuelve false', mining.cancelMining(p, sendFn) === false);
}
{
  const p = mkPlayer();
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(7, 5, 5, B.DIRT);
  mining.startMining(p, 7, 5, 5, B.DIRT);
  world.setBlock(7, 5, 5, B.AIR); // el bloque cambia (lo rompe otro)
  const r = mining.tickMining(p, 50, world, playerHelpers, sendFn);
  check('bloque cambiado → mina cancelada (cancelled)', r === 'cancelled' && p.mining === null);
}
{
  const p = mkPlayer({ x: 10.5, y: 5, z: 10.5 });
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(10, 5, 10, B.DIRT);
  mining.startMining(p, 10, 5, 10, B.DIRT);
  // La mina arranca (el jugador está a ~0.7 del bloque): primero un tick que
  // NO cancela, y luego alejarse > 7 bloques → cancelación por distancia.
  check('mina activa con el jugador cerca', mining.tickMining(p, 20, world, playerHelpers, sendFn) === null && p.mining !== null);
  p.x = 30; // se aleja > 7 bloques
  const r = mining.tickMining(p, 50, world, playerHelpers, sendFn);
  check('alejarse del bloque → mina cancelada', r === 'cancelled' && p.mining === null);
}

// --- 5b) Creative (/gamemode): finishMining con opts.creative rompe sin
// drop, sin XP y sin desgaste; tickMining completa al instante ---
{
  const p = mkPlayer();
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(4, 5, 4, B.DIAMOND_ORE);
  p.gamemode = 'creative';
  p.inventory[0] = { id: I.DIAMOND_PICKAXE, count: 1, durability: 1562 };
  p.selectedSlot = 0;
  playerHelpers.finishMining(p, 4, 5, 4, B.DIAMOND_ORE, { creative: true });
  check('creative: rompe el bloque', world.getBlock(4, 5, 4) === B.AIR);
  check('creative: sin drop del mineral', !p.inventory.some((s) => s && s.id === B.DIAMOND_ORE));
  check('creative: sin XP (ORE_XP ignorado)', p.xp === 0);
  check('creative: la herramienta NO se desgasta', p.inventory[0].durability === 1562, 'dur=' + p.inventory[0].durability);

  // tickMining con una sesión activa y el jugador en creative → done al momento
  world.setBlock(4, 5, 6, B.STONE);
  mining.startMining(p, 4, 5, 6, B.STONE);
  const r = mining.tickMining(p, 50, world, playerHelpers, sendFn);
  check('creative: la sesión activa se completa al instante (done)', r === 'done' && p.mining === null);
  check('creative: bloque roto sin drop ni desgaste',
    world.getBlock(4, 5, 6) === B.AIR && !p.inventory.some((s) => s && s.id === B.COBBLESTONE) &&
    p.inventory[0].durability === 1562);
}

// --- 5) Herramienta equivocada / a mano: lento y sin drop (pero rompe) ---
{
  const p = mkPlayer();
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(8, 5, 5, B.STONE);
  p.inventory[0] = { id: I.WOODEN_SHOVEL, count: 1, durability: 60 };
  p.selectedSlot = 0;
  mining.startMining(p, 8, 5, 5, B.STONE);
  let result = null;
  for (let i = 0; i < 400 && !result; i++) result = mining.tickMining(p, 20, world, playerHelpers, sendFn);
  check('herramienta equivocada: rompe igual (lento)', result === 'done' && world.getBlock(8, 5, 5) === B.AIR);
  check('sin drop (piedra sin pico)', !p.inventory.some((s) => s && s.id === B.COBBLESTONE));
  check('la herramienta se desgasta igualmente', p.inventory[0].durability === 59, 'dur=' + p.inventory[0].durability);
}
{
  const p = mkPlayer();
  const sends = [];
  const sendFn = sendFnCollect(sends);
  world.setBlock(9, 5, 5, B.DIRT);
  mining.startMining(p, 9, 5, 5, B.DIRT);
  let result = null;
  for (let i = 0; i < 200 && !result; i++) result = mining.tickMining(p, 20, world, playerHelpers, sendFn);
  check('a mano rompe tierra y suelta drop',
    result === 'done' && world.getBlock(9, 5, 5) === B.AIR && p.inventory.some((s) => s && s.id === B.DIRT));
  check('a mano no desgasta (sin herramienta)', p.inventory[0] === null || p.inventory[0].durability === undefined);
}

world.setDiskLoader(null);
console.log(failed === 0 ? '\n✅ Todos los tests pasan' : `\n❌ ${failed} check(s) fallaron`);
process.exit(failed ? 1 : 0);
