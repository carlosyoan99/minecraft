# AGENTS.md — Guía rápida para agentes de IA

Guía compacta de arranque. La guía canónica de convenciones es
[`CLAUDE.md`](CLAUDE.md). El **estado vivo** del proyecto (fase activa,
implementado/en revisión/bloqueantes) está en [`STATUS.md`](STATUS.md); el
**grafo de prerrequisitos** entre fases en [`DEPENDENCIAS.md`](DEPENDENCIAS.md);
el **tracker de tareas por fase** (solo estados `[ ]`/`[x]`) en
[`TODO.md`](TODO.md); y la **verdad de qué se hizo y cómo** vive en las
especificaciones de [`docs/spec/`](docs/spec/README.md)
(`docs/spec/faseN-spec.md`, cada una con su etiqueta de estado
`[COMPLETADA]`/`[EN CURSO]`/`[PROSPECTIVA]`/`[ARCHIVADA]`). Las auditorías
técnicas están en [`docs/audits/`](docs/audits/README.md). Léelos.

## Qué es

Clon de Minecraft. Servidor Node.js **autoritativo** (Express + `ws`,
sin BD: persistencia en JSON) + cliente vanilla Three.js servido sin
build step desde `public/`. Todo el código, docs y commits en español.

## Comandos

```bash
npm install                     # primera vez (node_modules está en .gitignore)
node server.js                  # servidor en http://localhost:3000 (PORT=... para otro puerto)
node tests/run.js               # 60 unitarios + 7 E2E si hay servidor vivo
node tests/run.js --unit        # solo unitarios
node tests/run.js --unit --filter <regex>   # solo los que casan (con tiempo por test)
node tests/run.js --audit       # solo auditorías por fase standalone (7: fase3-7 + altura + fase20)
npm run test:coverage           # c8: % de cobertura de server/ y public/
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E (necesita servidor)
SEED=miSemilla2026 PORT=3998 node server.js  # servidor E2E (Fase 17: SIN SEED arranca en modo menú y nunca envía init; el E2E del menú levanta su propio servidor)
node tests/audit-fase7.js       # render CDP con Chrome headless (por separado; ver abajo)
```

La matriz módulo→test y los umbrales están en
[`docs/tests.md`](docs/tests.md); léela antes de añadir un test nuevo.

Verificación mínima antes de entregar (CLAUDE.md §"Cómo trabajar"):
`node --check` sobre los `.js` tocados, `node tests/run.js --unit`,
arrancar el servidor y confirmar que sirve `/`.

## Arquitectura

- **El servidor es la única fuente de verdad**: validación, física e
  inventario viven en el servidor; el cliente solo predice y dibuja.
  Nunca mover lógica al cliente "por comodidad".
- **Servidor CommonJS** (`require`), **cliente ES modules** (`import`).
  No mezclar estilos.
- **Entradas mínimas**: `server.js` solo cablea hooks de broadcast
  (evita ciclos de require) y arranca; `public/client.js` solo importa
  módulos. Toda la lógica vive en módulos por responsabilidad
  (`net.js`, `world.js`, `save.js`, `players.js`, `mobs.js`, `items.js`,
  ...). Módulos >~400-500 líneas → dividir.
- **POO del servidor (Fase 13, C3)**: `ItemStack` (`server/items.js`) es la
  clase de los slots de inventario/cofre/drop (`{id, count, durability}`,
  JSON idéntico al wire); `world.js` exporta una INSTANCIA de `World`
  (métodos en el prototipo; `world.getChunk` devuelve un `Chunk` con
  `save`/`load`); `players.js` exporta `Player` + la factory
  `createPlayer` (los jugadores conectados son instancias); `mobs.js`
  define subclases por especie (`Zombie`, `Creeper`, `Slime`, ...) con
  hooks `tickSpecies`/`onDeath` y la fábrica `createMob` (`MOB_CLASSES`).
  Las clases NO cambian el wire ni el guardado: el JSON de una instancia es
  igual al de los literales anteriores.
- **Cliente sin build step**: `public/index.html` usa importmap con
  Three.js 0.160 servido **local** en `public/vendor/` (`three.module.js`
  + `addons/`), copia de `node_modules/three` (misma versión que
  `package.json`). Sin CDN externos: el juego funciona 100 % offline en
  LAN. Si se sube la versión de three, copiar los archivos nuevos a
  `public/vendor/` y mantener el importmap. Opcionalmente un service
  worker (`public/sw.js`, PWA) cachea los estáticos en localhost/HTTPS.
- **Recetas**: `recetas.json` (crafteo 3x3) y `recetas_horno.json`
  (fundición). Hot-reload con swap atómico: editarlas recarga el
  servidor automáticamente (JSON inválido conserva las anteriores).
- **Mundos por semilla**: `world/<semilla>/`. La semilla se configura
  con la env var `SEED` (defecto `miSemilla2026`) o desde el menú del
  juego. Cambiar la semilla **no pisa** mundos anteriores.

## Fuentes de verdad que hay que sincronizar a mano

Verificado por tests, pero hay que actualizarlas en el mismo cambio:

- `constants.js` (servidor) ↔ `public/constants.js` (cliente): IDs de
  bloques/ítems (`B`/`I`), constantes de mundo, comida/cría. Lo audita
  `tests/unit-sync.js`.
- `TOOL_DURABILITY` (servidor) ↔ `DURABILITY` (cliente): lo audita
  `tests/audit-fase5.js`.
- `PLAYER_SKINS` (servidor, `server/constants.js`) ↔ `SKINS` (cliente,
  `public/skins.js`): la lista oficial de skins de jugador. Lo audita
  `tests/unit-skins.js`.
- **Regla:** añadir bloque/ítem/herramienta/skin → actualizar AMBOS lados
  y añadir la receta si aplica.
- **Formato de guardado:** `SCHEMA_VERSION` (actual 6), archivos por
  chunk en `world/<semilla>/chunks/` + `world/<semilla>/world.json`
  (+ copia de seguridad `world.json.bak` en cada guardado). La **v6**
  es el mundo de 128 bloques (Y ∈ −64..+63, `DESIGN_OFFSET` ancla el
  terreno en ~0, chunks 16×128×16) con migración retrocompatible
  v5→v6 (el dato viejo sube a local 64..127 y el fondo se rellena con
  piedra). Cualquier cambio exige subir versión + migración
  retrocompatible + test (modelo: `tests/unit-persistencia.js`).

## Convenciones

- Español: comentarios, variables, mensajes de commit. Eventos WS en
  `snake_case` (`block_action`, `furnace_state`, ...).
- Commits: una preocupación por commit, formato `Fase N: resumen` o
  `área: resumen` (ver `CONTRIBUTING.md`).
- Cliente y servidor se actualizan **en el mismo commit** cuando tocan
  el mismo tema (formato de chunk, protocolo WS, inventario).
- Mecánicas nuevas llevan su test; cada fase termina con auditoría.

## Errores frecuentes

1. `Cannot find module 'simplex-noise'` → falta `npm install`.
2. E2E omitidos con "no hay servidor" **no es un fallo**: arranca
   `SEED=miSemilla2026 PORT=3998 node server.js` en otra terminal (Fase 17: sin SEED el servidor arranca en modo menú — el flujo de init que esperan los E2E clásicos no llega; el E2E del menú, `e2e-menu.js`, levanta su propio servidor sin SEED).
3. Bugs de render (`mcChunks: 0`) solo se ven en navegador; los tests
   de servidor no los detectan. Usa F3/`window.__mc*` para diagnosticar.
4. Cambiar `SEED` en `constants.js` rompe tests deterministas
   (`unit-mundo.js`, `unit-biomas.js`, ...).
5. Una receta que no funciona → `node tests/unit-recetas.js`.
6. Chunks que no guardan/cargan → key `cx,cz` consistente entre
   `world.js` y `save.js`, y que `world/<semilla>/chunks/` existe.
7. Desconexión periódica code=1006 `causa=heartbeat`: el navegador
   throttlea los pong de WebSocket en pestañas de fondo (Chrome/Firefox
   ~1 Hz tras 5 min). Fix CL-4: keepalive del cliente cada 10 s
   (`connection.js`) + `ws.isAlive = true` al recibir cualquier mensaje
   (`net.js`). Si se modifica el heartbeat, verificar que el intervalo
   del keepalive sea menor que el del servidor.

## Fuera de alcance (no hacer sin preguntar)

- BD externa, autenticación/cuentas, redstone, dimensiones, aldeas
  generadas, clima.
- Optimización prematura (greedy meshing, workers...) salvo que una
  spec de `docs/` la indique.
- Adelantar trabajo de fases futuras: las fases 0-15 están cerradas y
  auditadas. La **Fase 13** (paridad 1.0 + rendimiento + POO del servidor)
  está **completada y auditada**: paridad de valores fijada por
  `unit-paridad.js`, greedy meshing + worker de chunks
  (`unit-greedy`/`unit-workers`), lagunas L1-L5 (arco, puertas,
  escaleras/losas/vallas, cubo, recetas — `unit-lagunas.js`) y POO
  completa (`ItemStack`/`World`/`Chunk`/`Player`/`createMob`,
  `unit-mobs-poo.js` + `unit-poo-entities.js`). La **Fase 14** está cerrada
  y auditada (paridad real + rendimiento). La **Fase 15** está cerrada y
  auditada (copas de árboles en bordes de chunk, nubes semitransparentes,
  tooltip del hotbar y **D5: mundo de 128 bloques −64..+63, `SCHEMA_VERSION`
  6** auditado por `tests/audit-altura.js`).  La **Fase 16** está
  **cerrada y auditada** (auditoría 2026-08-10 + bugs + paridad + bloque G
  de cobertura: unit 53/53, E2E 7/7 en solitario, auditorías 6/6, c8 con
  umbrales). La **Fase 17** está **cerrada y auditada** (modo menú A1,
  gestión de mundos A3, persistencia B1, bugs B1-B7, pausa y skins C3,
  táctil D1; verificación en navegador del Bloque E completa). La **Fase 18 está cerrada y auditada** (spec `docs/spec/fase18-spec.md`):
  **paridad completa
  C-1..C-9** (franjas día/noche MC, minerales v6, zanahoria/patata,
  carbón vegetal 257, `MOB_XP`, horno desperdicio/cola, recetas de mena
  fuera, orbes de XP, sonidos) y **refactor a convenciones D-1..D-8** (los
  módulos >500 líneas se dividieron por responsabilidad — ver los mapas de
  `docs/server/README.md` y `docs/public/README.md` — con fachadas
  intactas: `net.js`→actions/timers, `mobs.js`→mob-species/mob-spawn/
  projectiles, `world.js`→noise/biomes/generation/structures, `save.js`→
  save-chunks/save-meta/save-players, `players.js`→inventory/combat,
  `ui.js`→hud/menus/panels/recipebook, `world.js` cliente→chunkstore/
  lightclient/meshbuild/lodmesh, `input.js`→game-input/raycast/menu-input/
  touch; `SCHEMA_VERSION` 6, protocolo WS e IDs B/I intactos). Auditorías
  recalibradas (E-1, `--audit` 6/6) y biome 0 errores (E-2); docs al día
  (F); cierre: suite **56 unitarios** en verde + E2E + auditorías. La
  **Fase 19 está cerrada y auditada** (spec `docs/spec/fase19-spec.md`):
  cobertura total de iconos por ID (A, 142/142 + 17 checks), rediseño MC
  de los paneles con fondos del atlas y biseles (B), tooltip unificado con
  delay (C), drag & drop con `dragdrop.js` + lógica pura `draglogic.js` y
  eventos `inventory_swap`/`grid_return`/`chestSlot` retrocompatibles (D),
  hot-reload del atlas de iconos (E), táctil/responsivo (F); cierre (G):
  suite **57 unitarios** + auditorías 6/6 + E2E 7/7 + biome 0 errores;
  fix de regresión `dawnOffsetMs` (D-4) y `e2e-cofre` recalibrado a v6. La
  **Fase 19.5 está cerrada y auditada** (spec `docs/spec/fase19.5-spec.md`):
  audio por bioma (A1, evento `biome_update` del servidor + paleta pura
  `musicpalette.js`, cueva > bioma > día/noche), accesibilidad (B1 teclado
  en paneles `a11y-nav.js`, B2 contraste HUD, B3 no-solo-color, B4 toggle
  `reduceMotion`), raycast auditado (C, veredicto OK), tokens CSS en `:root`
  (D) e higiene servidor (E1 SIGTERM + E2 `server/log.js` niveles
  uniformes); cierre: suite **58 unitarios** + auditorías 6/6 + E2E 7/7 +
  biome 0 errores. La **Fase 19.6 está cerrada** (spec
  `docs/spec/fase19.6-spec.md`, 2026-08-16): motor 3D — iluminación A1
  (`HemisphereLight` + `uDay`) y A2 (luz puntual de antorchas con
  `TORCH_LIGHT_BUDGET` 4 y toggle `torchLight`, OFF por defecto;
  `torchlights.js`/`torchlogic.js`), materiales B (los shaders del mundo van
  por `worldMaterial` de `materialstyle.js`; `MeshToonMaterial` como toggle
  `toon` en ajustes, `MeshLambertMaterial` sigue por defecto), shaders C1/C2
  (agua/lava `ShaderMaterial` con `uTime`/`uDay`; plantas con attribute
  `wind` y categoría `plant` del geopool), instancing **D evaluado y
  rechazado** (la vegetación ya se fusiona por chunk — decisión documentada
  en la spec §5), mipmaps E toggle `mipmaps` (`setWorldMipmaps`, OFF por
  defecto) y animación de mobs F (caminar/atacar procedural,
  `triggerMobAttack`, "reducir movimiento" lo atenúa). Cierre:
  `tests/unit-fase19.6.js` (21 checks) + suite **59 unitarios** + E2E 7/7 +
  auditorías 6/6 + biome 0 errores; sin cambios de red, guardado (`v6`) ni
  IDs B/I. Las
  **Fases 20 (rolling release), 21
  (biomas/estructuras/mobs), 22
  (profundidad, minerales y fauna 1.17–1.21), 23 (diferidos de la 22:
  Lush Caves/Breeze/trims/Tuff-Caliza), 24 (Nether Update) y 25 (End
  Update, sin dragón) y  **21.5 (contenido y paridad ampliados: pesca,
  bloques 1.8-1.15, combate y Trial Chambers, insertada entre 21 y 22)
  está cerrada y auditada** (`fase21-spec.md`,
  `fase21.5-spec.md`, `fase22-spec.md`, `fase23-spec.md`, `fase24-spec.md`,
  `fase25-spec.md`): la 19.6 exige la 19.5; la **Fase 20 está cerrada
  (v20.2 con etiqueta `v20.2`, ver `docs/v20.2.md`) y exigía la 18**; la
  **Fase 21 está cerrada y auditada (2026-08-17, etiqueta `v21.2`, spec
  `fase21-spec.md`)**: A1 biomas más grandes, A2 sub-biomas (abedul, taiga
  gigante 2×2, picos nevados), B1 pozo del desierto, B2 pirámide del
  desierto (trampa TNT + cofres), C1 vaca/gallina (MILK/EGG), C2 enderman
  neutral, C3 IA (zombi convoca, esqueleto strafe, araña día/noche, creeper
  huye de gatos) y D1 ríos al nivel del mar (v21.2); suite 61/61,
  `--audit` 8/8; **D2/D3 (océanos/montañas) diferidos a la 21.5**; la
  **Fase 21.5 está cerrada y auditada (2026-08-20, spec
  `fase21.5-spec.md`)**: suite 62/62, E2E 7/7, --audit 8/8, biome 0;
  la 22 exige la 21.5; la 23 exige la 22; la 24 exige la 23;
  la 25 exige la 24. La
  19.5 adelantó a la 19.6 el motor 3D y a la F21 el audio por bioma; la F22
  aporta los bloques de amatista que la geoda de la F21 reusa y confirma
  Won't propios (oxidación del cobre, renacuajos, Warden, redstone/Crafter);
  la **F21.5** absorbe la lista de mejoras del usuario (pesca, bloques
  1.8-1.15, combate/Trial Chambers, 1.21.5, Pale Garden 1.22, comandos)
  reusando F21-23 y lo ya hecho (zanahoria/patata F18, miel F9) — no
  planificar duplicados;
  las **F24/F25 desbloquean el Won't "dimensiones" (Nether/End)** al
  abrirse (Nether: opción B de guardado, portal 4×5 que se activa al
  completarse, 128 bloques, 2 biomas, 4 mobs + fortaleza; End: sin dragón —
  descartado temporalmente — islas flotantes, endermite, portal de
  regreso). No adelantar trabajo más allá de lo que `TODO.md` marque.

## Documentación

- Especificaciones por fase (**fuente de verdad** del qué/cómo): `docs/`,
  índice en [`docs/README.md`](docs/README.md).
- `TODO.md` es SOLO el tracker de tareas por fase (`[ ]`/`[x]`) y no
  crece con detalle: bugs, decisiones, mecánicas y auditorías se
  documentan en la spec de su fase.
- Arquitectura y mecánicas (cómo funciona + por qué):
  [`docs/server/`](docs/server/README.md) y
  [`docs/public/`](docs/public/README.md). Actualízalas cuando una
  mecánica cambie de comportamiento.
