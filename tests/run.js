'use strict';
// ============================================================
// RUNNER SIMPLE DE TESTS (sin framework, como el resto del proyecto)
// Ejecuta los tests unitarios de tests/ y, si hay un servidor vivo,
// el E2E de comer (tests/e2e-comer.js).
//
//   node tests/run.js                   → unitarios + E2E si hay servidor
//   node tests/run.js --unit            → solo unitarios
//   WS_URL=ws://host:puerto node tests/run.js --e2e  → solo E2E contra ese servidor
// ============================================================
const { spawnSync } = require('child_process');
const http = require('http');
const path = require('path');

const UNIT = ['unit-hambre.js', 'unit-cria.js', 'unit-crafting.js', 'unit-mundo.js', 'unit-mobs-agua.js', 'unit-spawn.js', 'unit-biomas.js', 'unit-durabilidad.js', 'unit-persistencia.js', 'unit-mobs-ia.js', 'unit-red.js', 'unit-recetas.js', 'unit-sync.js', 'unit-commands.js', 'unit-arboles.js'];
const E2E = ['e2e-comer.js', 'e2e-durabilidad.js'];
const args = process.argv.slice(2);

let failed = 0;

function run(file) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
  console.log(r.status === 0 ? `✅ ${file}` : `❌ ${file}`);
  return r.status === 0;
}

// ¿Hay un servidor HTTP escuchando en el host/puerto del WS?
function serverUp(wsUrl) {
  const u = new URL(wsUrl);
  const port = Number(u.port) || 3998;
  return new Promise((resolve) => {
    const req = http.get({ hostname: u.hostname, port, path: '/', timeout: 2000 }, () => resolve(true));
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  if (!args.includes('--e2e')) {
    console.log('=== Tests unitarios ===');
    for (const f of UNIT) run(f);
  }

  if (!args.includes('--unit')) {
    console.log('\n=== E2E (requieren servidor) ===');
    const wsUrl = process.env.WS_URL || 'ws://localhost:3998';
    if (await serverUp(wsUrl)) {
      for (const f of E2E) run(f);
    } else {
      console.log(`⏭️  Omitidos: no hay servidor en ${wsUrl}. Arranca uno (node server.js o PORT=3998) y relanza, o usa WS_URL.`);
    }
  }

  console.log(failed === 0 ? '\n✅ Todos los tests pasan' : `\n❌ ${failed} test(s) fallaron`);
  process.exit(failed ? 1 : 0);
})();
