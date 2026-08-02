# CLAUDE.md — Guía para la IA que trabaje en este proyecto

Este archivo son instrucciones para cualquier asistente de IA
(Claude Code u otro) que edite este repositorio. Léelo antes de
tocar código.

## Filosofía del proyecto

- **JavaScript vanilla, dependencias mínimas.** No añadir un
  framework (React, Vue, etc.) ni una librería nueva sin que sea
  claramente necesaria y esté justificada. Antes de instalar algo,
  preguntar: ¿esto se puede resolver en 20 líneas de JS plano?
- **Sin build step en el cliente.** El cliente se sirve tal cual
  desde `public/`, cargado vía `<script type="module">` e
  importmap. No introducir Webpack/Vite/bundlers salvo que se
  discuta explícitamente antes.
- **Arquitectura modular.** El servidor y el cliente están
  divididos en módulos por responsabilidad (red, mundo/chunks,
  jugador/física, mobs, UI/HUD). `server.js` (39 líneas) y
  `public/client.js` (13 líneas) son solo entradas que cablean
  módulos. Si un módulo supera ~400-500 líneas, es señal de
  dividirlo.
- **El servidor es la única fuente de verdad.** Nunca mover lógica
  de validación, física o inventario al cliente "por comodidad".
  El cliente predice y dibuja; el servidor decide y corrige.
- **Integridad de datos por encima de todo.** Cualquier cambio al
  formato de guardado (`world/`) debe ser retrocompatible o incluir
  migración explícita con `schemaVersion`. Nunca silenciar un error
  de lectura/escritura de mundo sin loggearlo.
- **Tests antes de entregar.** Las mecánicas nuevas van con tests
  (unitarios en `tests/`, o E2E contra servidor real). Las fases
  nuevas terminan con auditoría. Ver abajo "Cómo ejecutar pruebas".

## Cómo trabajar en este repo

1. **Antes de escribir código**, ubica la fase actual en
   `TODO.md` y confirma qué tarea se está atacando. No adelantes
   trabajo de fases futuras sin que se pida explícitamente.
2. **Cambios pequeños y verificables.** Preferir PRs/commits que
   toquen una sola preocupación (ej. "guardado incremental por
   chunk") sobre cambios masivos que mezclen varias fases.
3. **Prueba antes de entregar.** Como mínimo: `node --check` sobre
   archivos `.js` tocados, `node tests/run.js --unit`, arrancar el
   servidor y confirmar que sirve `/` sin errores, y si el cambio
   toca mundo o inventario, un ciclo manual de guardar/cargar.
4. **Nunca rompas lo que ya funciona.** Antes de refactorizar algo
   central (formato de chunk, protocolo WebSocket, formato de
   inventario), revisa qué otras partes del código dependen de
   ello — cliente y servidor deben mantenerse sincronizados en el
   mismo cambio, nunca en commits separados.
5. **Auditoría al cerrar cada fase.** Cada fase de `TODO.md`
   termina con una tarea de auditoría. No se marca la fase como
   completa sin haberla hecho: revisar rendimiento (chunks
   cargados, memory leaks en cliente), integridad del guardado
   tras varios reinicios, y limpieza de código muerto o duplicado
   introducido durante la fase.

## Cómo ejecutar pruebas

### Automáticas

```bash
npm install                        # primera vez (incluye simplex-noise)
node tests/run.js                  # unitarios + E2E si hay servidor vivo
node tests/run.js --unit           # solo unitarios
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E contra ese servidor
node tests/audit-fase3.js          # auditorías por fase (3, 4, 5)
node tests/audit-fase4.js
node tests/audit-fase5.js
```

- Los E2E requieren un servidor vivo: `PORT=3998 node server.js`
  en otra terminal. Si no hay servidor, `run.js` los omite con un
  aviso (no es un fallo).
- `net.js` exporta `handleConnection` para que `tests/unit-red.js`
  ejercite todos los handlers con un `ws` fake, sin abrir puerto.
- Cada test unitario es un script Node plano que termina con código
  de salida 0/1; `tests/run.js` los encadena. Sin framework.

### Manuales (lo que una IA no puede ver solo con tests)

- **Guardado/carga:** romper/colocar bloques, reiniciar el servidor
  → la posición, inventario, mobs, hornos y XP se restauran desde
  `world/chunks/` + `world/world.json` (autosave cada 30s).
- **Crafteo:** abrir mesa con `E`, colocar 4 tablones en 2x2 → se
  craftea; las herramientas que pasan por el grid conservan su
  durabilidad.
- **Horno:** colocar un horno, clic derecho para abrirlo, añadir
  combustible (tronco/tablones/palo) + mineral o comida cruda →
  lingote o comida cocinada.
- **Mobs:** de noche aparecen hostiles (zombie, creeper, esqueleto,
  enderman; araña y lobo también de día); en superficie hay
  pasivos. Atacar → daño, desgaste de espada, drops y XP.
- **Red:** abrir dos pestañas → los jugadores se ven entre sí
  (`player_join`/`player_move`), romper un bloque se replica;
  cerrar una pestaña → el servidor sigue corriendo.
- **Render/FPS:** los tests de servidor no ejercitan el render. La
  medición se hace en Chrome headless vía CDP (ver nota de la
  auditoría de Fase 4 en `TODO.md`; Three.js debe servirse local
  si el CDN es inalcanzable).

## IDs de bloque e ítem

Los IDs son números enteros (ver `constants.js` en el servidor y
`public/constants.js` en el cliente — deben mantenerse idénticos):

| Rango | Contenido | Ejemplos |
|---|---|---|
| `0` | Aire (no es bloque ni ítem) | — |
| `1`-`19` | Bloques sólidos colocables | tierra=1, piedra=3, tablones=7, horno=16 |
| `20` | Agua (bloque NO sólido: se nada, no se rompe a mano) | `B.WATER` |
| `21` | Nieve (sólida, rompible a mano) | `B.SNOW` (Fase 4) |
| `100`-`120` | Ítems puros (no se colocan como bloque) | palo=100, lingote=102, comida 107-119, hilo=120 |
| `200`-`219` | Herramientas con durabilidad (pico 200-204, hacha 205-209, pala 210-214, espada 215-219) | pico de madera=200, espada de diamante=219 |

**Regla:** si un ID está fuera de `1`-`21`, NO se coloca como
bloque (es ítem o herramienta). `isSolidBlock(id)` en el servidor
es la fuente para física/validación: `id !== AIR && id !== WATER`.

## Fuentes de verdad (single source of truth)

Si un valor existe en más de un archivo, se documenta aquí y se
mantiene sincronizado manualmente (o lo verifica un test):

- **IDs de bloques/ítems:** `constants.js` (`B`, `I`) en el
  servidor ↔ `public/constants.js` (`BLOCK_COLORS`, `BLOCK_NAMES`,
  `ITEM_NAMES`) en el cliente. Lo verifica `tests/unit-sync.js`.
- **Durabilidad de herramientas:** `TOOL_DURABILITY` (servidor) ↔
  `DURABILITY` (cliente). Lo verifica `tests/audit-fase5.js`.
- **Comida y cría:** `FOOD_VALUES`/`BREED_FOOD` (servidor) ↔
  `FOOD_ITEMS`/`BREED_FOOD` (cliente). Lo verifica
  `tests/unit-sync.js`.
- **Constantes de mundo:** `SEED`, `WORLD_HEIGHT`, `DAY_CYCLE_MS`,
  `XP_PER_LEVEL`, `WATER`, `SNOW`... sincronizadas entre ambos
  `constants.js` (lo verifica `tests/unit-sync.js`).
- **Recetas:** `recetas.json` (crafteo) y `recetas_horno.json`
  (fundición). Son del servidor; el cliente solo envía el grid.
  Lo valida `tests/unit-recetas.js` (IDs existentes, shapes bien
  formadas y alcanzables — habría detectado el bug `hilo_a_lana`).
- **Formato de guardado:** `SCHEMA_VERSION` (actual 2), `WORLD_DIR`
  (por semilla: `world/<semilla>/`), `CHUNKS_DIR`, `META_FILE`,
  `LEGACY_FILE` en `constants.js`. La semilla se configura con la
  env var `SEED` (defecto `miSemilla2026`); cada semilla tiene su
  propio mundo y el layout antiguo de `world/` se migra con
  `save.migrateWorldLayout()`. Lo cubre `tests/unit-persistencia.js`.

**Regla:** si añades un bloque/ítem/herramienta, actualiza AMBOS
lados y añade la receta si aplica; el CI de tests lo audita.

## Checklist al abrir una nueva fase en TODO.md

- [ ] ¿Cada tarea tiene criterio de éxito claro y granularidad de
      ~1-2 días de trabajo?
- [ ] ¿La fase termina con una tarea de **auditoría** explícita
      (rendimiento, integridad de guardado, limpieza de código)?
- [ ] ¿Las mecánicas nuevas llevan tests unitarios/E2E?
- [ ] ¿Hay bloques/ítems nuevos? → sincronizar B/I con el cliente
      y añadir receta si aplica (ver "Fuentes de verdad").
- [ ] ¿Cambia el formato de guardado? → `schemaVersion` +
      migración retrocompatible + test de migración.
- [ ] ¿Esto rompe algo de fases anteriores? → si sí, incluir una
      tarea de regresión explícita.
- [ ] ¿Se actualizaron `README.md` (estado/protocolo) y este
      `CLAUDE.md` si cambian las convenciones?

## Convenciones de código

- CommonJS en el servidor (`require`), ES modules en el cliente
  (`import`) — así está hoy, no mezclar estilos dentro del mismo
  entorno.
- Nombres de eventos WebSocket en `snake_case` (`block_action`,
  `furnace_state`, etc.), consistente con lo ya existente.
- Comentarios y nombres de variables en español, igual que el
  resto del proyecto — mantener el idioma consistente.
- Commits en español, una preocupación por commit, formato
  "Fase N: resumen descriptivo" o "área: resumen" (ver
  `CONTRIBUTING.md`).

## Errores frecuentes

1. **`Cannot find module 'simplex-noise'`** al arrancar el
   servidor → falta `npm install` (node_modules está en
   `.gitignore`).
2. **E2E omitidos con "no hay servidor en ws://localhost:3998"** →
   el runner los salta si no hay servidor vivo (no es un fallo).
   Arranca uno: `PORT=3998 node server.js`.
3. **El mundo no se renderiza pero la página funciona**
   (`mcChunks: 0` en consola) → error en `buildChunkGeometry`
   (client-side, los tests de servidor no lo ven). En la Fase 4
   fue un `ReferenceError` de `wx/wy/wz` fuera del scope del
   bucle; solo la auditoría en navegador lo destapó.
4. **Una receta no funciona en el juego** (ej. `hilo_a_lana`
   apuntaba al ítem 118 en vez de 120) → ejecuta
   `node tests/unit-recetas.js`; valida IDs y shapes.
5. **Three.js tarda una eternidad / no carga desde el CDN**
   (unpkg.com inalcanzable en la red) → servir `three.module.js`
   local y mapearlo en el importmap de `public/index.html`
   (la auditoría de Fase 4 usa `/tmp/three-local` vía CDP Fetch).
6. **Tests deterministas que dejan de pasar** → comprobar que no
   se tocó `SEED` en `constants.js` (cambiar la semilla altera
   toda la generación y rompe tests como `unit-mundo.js`).
7. **Chunks que no se guardan/cargan** → verificar que el key
   `cx,cz` es consistente entre `world.js` y `save.js`, y que
   `world/chunks/` existe (lo cubre `unit-persistencia.js`).

## Qué NO hacer sin preguntar

- No añadir persistencia en base de datos (SQLite, Mongo, etc.) —
  el plan es resolver la escalabilidad del guardado con archivos
  por chunk, no cambiar de paradigma de storage.
- No añadir autenticación de usuarios ni cuentas — fuera de
  alcance del proyecto.
- No implementar redstone, dimensiones alternas, aldeas generadas
  ni clima — están explícitamente fuera de alcance (ver "Won't" en
  `TODO.md`).
- No optimizar prematuramente (greedy meshing, workers, frustum
  culling, etc.) antes de que el `TODO.md` lo indique — la Fase 6
  tiene su momento para eso, cada fase tiene su momento.
