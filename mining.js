'use strict';

// ============================================================
// MINERÍA FINA (Fase 6): sesiones de rotura con progreso.
// El jugador "empuña" la mina con `block_action {action:'break'}`
// (inicia o continúa la sesión); el bucle principal (net.mainLoop)
// avanza el progreso con tickMining() según la dureza del bloque y
// la velocidad de la herramienta (constants.breakSeconds). Al
// completarse se llama a playerHelpers.finishMining (drop
// condicional, XP, desgaste, inventario). El progreso se cancela si
// el bloque cambia, el jugador se aleja (>7 bloques) o envía
// `block_action {action:'break_cancel'}`. Las fases 0-9 se envían al
// cliente con `block_break_progress` para pintar las grietas (y -1
// para ocultarlas).
// ============================================================
const { breakSeconds } = require('./constants.js');

// Inicia (o reinicia sobre otro bloque) la sesión de minería del jugador.
// La herramienta NO se captura aquí: tickMining relee la del slot actual en
// cada tick, así que cambiar de herramienta a mitad de mina recalcula la
// velocidad sin perder el progreso acumulado.
function startMining(player, x, y, z, block) {
  player.mining = { x, y, z, block, progress: 0, lastStage: -1 };
}

// Cancela la sesión y avisa al cliente (stage -1 = ocultar grietas).
// sendFn(player, event, data) es opcional (tests sin red).
function cancelMining(player, sendFn) {
  if (!player.mining) return false;
  const { x, y, z } = player.mining;
  player.mining = null;
  if (sendFn) sendFn(player, 'block_break_progress', { x, y, z, stage: -1 });
  return true;
}

// Avanza la mina dtMs (ms). Devuelve 'done' | 'cancelled' | null.
// El servidor es la fuente de verdad: todo lo que puede invalidar la mina
// (bloque cambiado, distancia) se comprueba aquí, cada tick.
// Si el jugador está en creative (p.ej. cambió de modo a mitad de mina),
// la sesión se completa al instante con finishMining creative (sin drops ni
// desgaste): la minería instantánea de creative, defensiva en el tick.
function tickMining(player, dtMs, world, playerHelpers, sendFn) {
  const m = player.mining;
  if (!m) return null;

  // Cancelar si el bloque cambió (lo rompió/colocó otro) o el jugador se alejó.
  if (world.getBlock(m.x, m.y, m.z) !== m.block ||
      Math.hypot(m.x - player.x, m.y - player.y, m.z - player.z) > 7) {
    cancelMining(player, sendFn);
    return 'cancelled';
  }

  // Creative: completar al momento (sin progreso ni grietas intermedias).
  if (player.gamemode === 'creative') {
    const { x, y, z, block } = m;
    player.mining = null;
    playerHelpers.finishMining(player, x, y, z, block, { creative: true });
    return 'done';
  }

  // La herramienta ACTUAL define la velocidad (cambiar de herramienta a mitad
  // de mina recalcula la velocidad; el progreso acumulado se conserva).
  const tool = player.inventory[player.selectedSlot] ? player.inventory[player.selectedSlot].id : 0;
  const seconds = breakSeconds(tool, m.block);
  m.progress += dtMs / 1000;
  const frac = m.progress / seconds;
  const stage = Math.min(9, Math.floor(frac * 10));
  if (stage !== m.lastStage) {
    m.lastStage = stage;
    sendFn(player, 'block_break_progress', { x: m.x, y: m.y, z: m.z, stage });
  }

  if (frac >= 1) {
    const { x, y, z, block } = m;
    player.mining = null;
    const broke = playerHelpers.finishMining(player, x, y, z, block);
    if (broke) sendFn(player, 'tool_broke', { slot: player.selectedSlot });
    return 'done';
  }
  return null;
}

module.exports = { startMining, cancelMining, tickMining };
