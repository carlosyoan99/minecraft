# AGENTS.md — Guía rápida para agentes de IA

Guía compacta de arranque. La guía canónica de convenciones es
[`CLAUDE.md`](CLAUDE.md). El **estado vivo** del proyecto (fase activa,
cerradas/bloqueantes) está en [`STATUS.md`](STATUS.md); el **grafo de
prerrequisitos** entre fases en [`DEPENDENCIAS.md`](DEPENDENCIAS.md); el
**tracker de tareas por fase** (solo estados `[ ]`/`[x]`) en
[`TODO.md`](TODO.md); y la **verdad de qué se hizo y cómo** vive en las
especificaciones de [`docs/spec/`](docs/spec/README.md) (`docs/spec/faseN-spec.md`,
cada una con su etiqueta `[COMPLETADA]`/`[EN CURSO]`/`[PROSPECTIVA]`). Las
auditorías técnicas están en [`docs/audits/`](docs/audits/README.md).
Léelos antes de tocar código.

## Qué es

Clon de Minecraft. Servidor Node.js **autoritativo** (Express + `ws`,
sin BD: persistencia en JSON) + cliente vanilla Three.js servido sin
build step desde `public/`. Todo el código, docs y commits en español.

## Comandos

```bash
npm install                     # primera vez (node_modules está en .gitignore)
node server.js                  # servidor en http://localhost:3000 (PORT=... para otro puerto)
node tests/run.js               # unitarios + E2E si hay servidor vivo
node tests/run.js --unit        # solo unitarios
node tests/run.js --unit --filter <regex>   # solo los que casan (con tiempo por test)
node tests/run.js --audit       # auditorías por fase standalone, lentas (la lista viva está en AUDIT de tests/run.js)
npm run test:coverage           # c8 con umbrales por directorio (falla si se incumplen)
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E (necesita servidor)
SEED=miSemilla2026 PORT=3998 node server.js  # servidor E2E (Fase 17: SIN SEED arranca en modo menú y nunca envía init; el E2E del menú levanta su propio servidor sin SEED)
npm run lint                    # biome check . (en CI va con || true: informativo)
npm run lint:fix / format       # biome con escritura (tabs, comillas dobles)
npm run typecheck               # tsc --noEmit, informativo: solo verifica archivos con // @ts-check (tipos compartidos en server/types.js)
npm run graph                   # madge: dependencias circulares (informativo)
npm run deadcode                # knip: código muerto (informativo; entry = server/net.js)
```

- **CI bloqueante** (`.github/workflows/ci.yml`, Node 18-24):
  `npm ci` → `node --check server/*.js public/*.js` → unitarios →
  `test:coverage` → `--audit`. Lint/graph/deadcode van con `|| true`.
  No fusionar a `main` sin CI verde.
- Verificación mínima antes de entregar (CLAUDE.md §"Cómo trabajar"):
  `node --check` sobre los `.js` tocados, `node tests/run.js --unit`,
  arrancar el servidor y confirmar que sirve `/`.
- Si falla un check de un test que NO tocaste, puede ser WIP de la fase
  abierta: mira "Fase activa" en `STATUS.md` y su spec antes de culpar a
  tu cambio (ej.: cambios de recetas a mitad de fase dejan roto algún
  unitario hasta que su test se recalibra).

## Arquitectura

- **El servidor es la única fuente de verdad**: validación, física e
  inventario viven en el servidor; el cliente solo predice y dibuja.
  Nunca mover lógica al cliente "por comodidad".
- **Servidor CommonJS** (`require`), **cliente ES modules** (`import`).
  No mezclar estilos.
- **Entradas mínimas**: `server.js` (raíz) solo cablea hooks de broadcast
  (evita ciclos de require) y arranca; `public/client.js` solo importa
  módulos. Toda la lógica vive en módulos por responsabilidad
  (`net.js`, `world.js`, `save.js`, `players.js`, `mobs.js`, `items.js`,
  ...). Módulos >~400-500 líneas → dividir. Los mapas de módulos están en
  `docs/server/README.md` y `docs/public/README.md`; los grandes ya fueron
  divididos por responsabilidad (F18 D-1..D-5) manteniendo las **fachadas**
  intactas (`net.js`→actions/timers, `world.js`→noise/biomes/generation,
  `players.js`→inventory/combat, etc.): no romperlas.
- **POO del servidor**: `ItemStack` (`server/items.js`) es la clase de los
  slots de inventario/cofre/drop (`{id, count, durability}`, JSON idéntico
  al wire); `world.js` exporta una INSTANCIA de `World` (`getChunk`
  devuelve un `Chunk` con `save`/`load`); `players.js` exporta `Player` +
  factory `createPlayer`; `mobs.js` define subclases por especie
  (`Zombie`, `Creeper`, ...) con fábrica `createMob`. Las clases NO cambian
  el wire ni el guardado: no reintroducir literales `{id, count}` donde ya
  hay `ItemStack`.
- **Cliente sin build step**: `public/index.html` usa importmap con
  Three.js 0.160 servido **local** en `public/vendor/` (`three.module.js`
  + `addons/`), copia de `node_modules/three` (misma versión que
  `package.json`). Sin CDN externos: funciona 100 % offline en LAN. Si se
  sube la versión de three, copiar los archivos nuevos a `public/vendor/`
  y mantener el importmap.
- **Recetas**: `recetas.json` (crafteo 3x3) y `recetas_horno.json`
  (fundición). Hot-reload con swap atómico: editarlas recarga el
  servidor automáticamente (JSON inválido conserva las anteriores).
- **Mundos por semilla**: `world/<semilla>/`. Semilla con env var `SEED`
  (defecto `miSemilla2026`) o desde el menú del juego. Cambiar la semilla
  no pisa mundos anteriores.

## Fuentes de verdad que hay que sincronizar a mano

Verificado por tests, pero hay que actualizarlas en el mismo cambio:

- `constants.js` (servidor) ↔ `public/constants.js` (cliente): IDs de
  bloques/ítems (`B`/`I`), constantes de mundo, comida/cría. Audita
  `tests/unit-sync.js`.
- `TOOL_DURABILITY` (servidor) ↔ `DURABILITY` (cliente): audita
  `tests/audit-fase5.js`.
- `PLAYER_SKINS` (servidor, `server/constants.js`) ↔ `SKINS` (cliente,
  `public/skins.js`). Audita `tests/unit-skins.js`.
- **Regla:** añadir bloque/ítem/herramienta/skin → actualizar AMBOS lados
  y añadir la receta si aplica.
- **Formato de guardado:** `SCHEMA_VERSION` (actual 6), archivos por chunk
  en `world/<semilla>/chunks/` + `world/<semilla>/world.json` (+ copia
  `.bak`). La **v6** es el mundo de 128 bloques (Y ∈ −64..+63, chunks
  16×128×16) con migración retrocompatible v5→v6. Cualquier cambio exige
  subir versión + migración retrocompatible + test (modelo:
  `tests/unit-persistencia.js`).

## Convenciones

- Español: comentarios, variables, mensajes de commit. Eventos WS en
  `snake_case` (`block_action`, `furnace_state`, ...).
- Commits: una preocupación por commit, formato `Fase N: resumen` o
  `área: resumen` (ver `CONTRIBUTING.md`).
- Cliente y servidor se actualizan **en el mismo commit** cuando tocan el
  mismo tema (protocolo WS, formato de chunk, inventario).
- Mecánicas nuevas llevan su test; cada fase termina con tarea de
  auditoría explícita (sin ella no se marca completa). La matriz
  módulo→test y umbrales están en [`docs/tests.md`](docs/tests.md).
- Desde el post-F25 cada fase se trabaja en **branch separada**
  (`fase29-qol`, `fase26-enchants`, ...) y se fusiona a `main` al cerrar;
  el orden acordado es F29→F26→F27→F28 (ver `DEPENDENCIAS.md`).

## Errores frecuentes

1. `Cannot find module 'simplex-noise'` → falta `npm install`.
2. E2E omitidos con "no hay servidor" **no es un fallo**: arranca
   `SEED=miSemilla2026 PORT=3998 node server.js` en otra terminal
   (sin SEED el servidor arranca en modo menú y los E2E clásicos no
   reciben init; `e2e-menu.js` levanta el suyo propio).
3. Bugs de render (`mcChunks: 0`) solo se ven en navegador; los tests
   de servidor no los detectan. Usa F3/`window.__mc*` para diagnosticar.
4. Cambiar `SEED` en `constants.js` rompe tests deterministas
   (`unit-mundo.js`, `unit-biomas.js`, ...).
5. Una receta que no funciona → `node tests/unit-recetas.js`.
6. Chunks que no guardan/cargan → key `cx,cz` consistente entre
   `world.js` y `save.js`, y que `world/<semilla>/chunks/` existe.
7. Desconexión periódica code=1006 `causa=heartbeat`: el navegador
   throttlea los pong de WebSocket en pestañas de fondo. Fix CL-4:
   keepalive del cliente cada 10 s (`connection.js`) + `ws.isAlive=true`
   al recibir cualquier mensaje (`net.js`). Si se modifica el heartbeat,
   el intervalo del keepalive debe seguir siendo menor que el del
   servidor.

## Fuera de alcance (no hacer sin preguntar)

- BD externa, autenticación/cuentas, redstone, clima, aldeas generadas.
- Dimensiones (Nether/End): bloqueado hasta que se abran las fases
  24/25, que son las que desbloquean ese "Won't".
- Optimización prematura (greedy meshing ya hecho, workers...) salvo que
  una spec de `docs/` lo indique.
- **Adelantar trabajo de fases futuras**: las fases 0 a 22.1 están
  cerradas (detalle y auditorías en sus specs); las 22.2/22.3 están EN
  CURSO en paralelo (decisión 2026-08-23, ver `STATUS.md`). No adelantar
  trabajo más allá de lo que `TODO.md` marque; las prospectivas 23-29 ya
  tienen specs borrador en `docs/spec/`.

## Agentes y skills del repo

- Subagentes de auditoría definidos en `.opencode/agents/`
  (`auditoria-cliente`, `auditoria-servidor`, `linea-base`,
  `paridad-minecraft`, `rendimiento`, `seguridad`, `planificador-fases`,
  `orquestador-auditoria`): solo lectura/ejecución de checks, nunca
  corrigen código. Úsalos para las auditorías de cierre de fase.
- Skills específicas del proyecto en `.agents/skills/` (threejs-*,
  accessibility, nodejs-*): cárgalas cuando la tarea encaje.
