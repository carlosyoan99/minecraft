'use strict';
// ============================================================
// E2E DEL HOT-RELOAD (Fase 6): recetas + atlas sin reiniciar.
// 1) El watcher del servidor detecta un cambio en recetas.json, recarga y
//    avisa por chat de sistema ('♻️ Recetas recargadas ...').
// 2) El comando /reload hace lo mismo a petición (y pide el atlas).
// 3) Un JSON inválido → '⚠️ Recetas NO recargadas' (swap atómico: el
//    servidor sigue vivo y conserva las recetas anteriores).
//
// Requiere un servidor vivo: WS_URL (por defecto ws://localhost:3998) y
// RECETAS_PATH (ruta del recetas.json del SERVIDOR — en el CI se pasa la
// del servidor desechable; por defecto la del proyecto).
// ============================================================
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const URL = process.env.WS_URL || 'ws://localhost:3998';
const RECETAS_PATH = process.env.RECETAS_PATH || path.join(__dirname, '..', 'recetas.json');

const results = [];
const check = (name, ok, info) => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${info ? '  (' + info + ')' : ''}`);
};
let finished = false;
let phase = 'init';
const t0 = Date.now();
const timer = setTimeout(() => {
  console.log(`[t=${Math.round((Date.now() - t0) / 1000)}s] TIMEOUT en fase=${phase}`);
  finish(1);
}, 30000);

function finish(exitCode) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  // Restaurar SIEMPRE el archivo original (aunque el test falle a mitad de
  // camino, p.ej. en la fase 'bad' con JSON inválido): nunca dejar el
  // recetas.json del servidor modificado/corrupto para ejecuciones posteriores.
  try { fs.writeFileSync(RECETAS_PATH, original); } catch {}
  const fails = results.filter((r) => r.ok === false).length;
  console.log(`\nRESULTADO: ${results.length - fails}/${results.length} OK`);
  process.exit(exitCode !== undefined ? exitCode : (fails ? 1 : 0));
}

// Escritura atómica (tmp + rename): el watcher del servidor nunca ve un
// archivo a medio escribir (el debounce de 150 ms no basta si no).
function atomicWrite(file, content) {
  const tmp = `${file}.e2e-tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

const original = fs.readFileSync(RECETAS_PATH, 'utf8');
let texturesReloads = 0;

const ws = new WebSocket(URL);
ws.on('message', (d) => {
  let m; try { m = JSON.parse(d); } catch { return; }

  // Recopilar broadcasts de textures_reload en cualquier fase.
  if (m.event === 'textures_reload') texturesReloads++;

  if (phase === 'init' && m.event === 'init') {
    phase = 'watch';
    // 1) Modificar recetas.json de forma VÁLIDA (mismo contenido semántico):
    //    el watcher debe detectarlo, recargar y avisar por chat de sistema.
    const rec = JSON.parse(original);
    const k = Object.keys(rec)[0];
    rec[k] = { ...rec[k] }; // reescritura inofensiva pero real (mtime cambia)
    atomicWrite(RECETAS_PATH, JSON.stringify(rec, null, 2));
    console.log(`[t=0s] recetas.json modificado — esperando al watcher...`);
    return;
  }

  if (m.event === 'chat' && typeof m.data.message === 'string') {
    if (phase === 'watch' && m.data.message.includes('Recetas recargadas')) {
      check('watcher: recarga al editar recetas.json (chat de sistema)', true, m.data.message.slice(0, 60));
      phase = 'cmd';
      // 2) Comando explícito /reload (además del watcher)
      ws.send(JSON.stringify({ event: 'chat', data: { message: '/reload' } }));
      return;
    }
    if (phase === 'cmd' && m.data.message.includes('y atlas solicitado')) {
      check('/reload: recarga a petición (chat de sistema)', true, m.data.message.slice(0, 60));
      // 3) JSON inválido → rechazo controlado, servidor sigue vivo
      atomicWrite(RECETAS_PATH, '{ json inválido ');
      phase = 'bad';
      return;
    }
    if (phase === 'bad' && m.data.message.includes('NO recargadas')) {
      check('JSON inválido → rechazo controlado (swap atómico)', true, m.data.message.slice(0, 60));
      // El servidor siguió vivo y respondió: restaurar el archivo original.
      atomicWrite(RECETAS_PATH, original);
      check('textures_reload llegó al cliente (watcher o /reload)', texturesReloads >= 1,
        `${texturesReloads} evento(s)`);
      phase = 'done';
      finish();
      return;
    }
  }
});
ws.on('error', (e) => { console.log('WS ERROR: ' + e.message); finish(1); });
