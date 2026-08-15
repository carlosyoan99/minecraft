# Cliente — Arquitectura y módulos

> Documentación técnica del lado cliente (navegador) del clon de
> Minecraft. Complementa a [`../README.md`](../README.md) y a las
> especificaciones por fase. Aquí se explica **cómo funciona** y **por qué**
> está hecho así; las mecánicas de render/gameplay están en
> [`mecanicas.md`](./mecanicas.md).

## Qué es el cliente

Three.js **0.160** (vía importmap desde unpkg) + JavaScript ES modules,
**sin build step** y **sin assets binarios**: texturas, iconos, sonidos y
cielo se generan proceduralmente en el navegador. El cliente **no es
autoritativo**: predice y dibuja; el servidor valida y decide (ver
[`../server/README.md`](../server/README.md)).

**Por qué sin build step:**

- Cero configuración: `node server.js` y el cliente se sirve tal cual.
- Cada archivo es un módulo ES con una responsabilidad; se puede abrir en
  el navegador y depurar con las DevTools sin mapas ni bundles.
- Toda la generación procedural (atlas, iconos, audio, cielo) elimina la
  necesidad de una carpeta `assets/` que habría que mantener.

El coste: no se puede usar npm en el cliente salvo vía importmap (three y
sus addons desde CDN) y la lógica "pura" (testeable en Node) debe vivir en
módulos sin DOM ni THREE.

## Cómo arranca (public/client.js e index.html)

`client.js` es deliberadamente pequeño: **solo importa módulos**. Cada
módulo se auto-inicializa al importarse (escena, socket, listeners de
input, bucle de render, handler de red). El orden de los imports importa:

```js
import "./loading.js";     // pantalla de carga primero
import "./debug.js";       // F3
import "./scene.js";       // escena/cámara/renderer/controles
import "./connection.js";  // socket WS (?name=)
import "./world.js";       // almacén de chunks + geometría
import "./mobs.js";        // meshes de mobs/jugadores remotos
import "./settings.js";    // ajustes (localStorage)
import "./ui.js";          // HUD + menús + paneles
import "./player.js";      // física/movimiento local
import "./input.js";       // teclado/ratón
import "./network.js";     // handler de mensajes del servidor
```

`index.html` define el importmap (three desde unpkg), el HUD (hotbar,
salud, comida, XP), los menús (principal/mundos/ajustes), los paneles
(crafteo, horno, cofre), el libro de recetas, el chat y la pantalla de
carga.

> Fase 18 (D-6/D-7/D-8): los módulos grandes se dividieron por
> responsabilidad **sin cambiar el DOM ni el protocolo**. `ui.js` pasó a ser
> orquestador (HUD en `hud.js`, menús en `menus.js`, paneles en `panels.js`,
> libro en `recipebook.js`); `input.js` pasó a ser despachador (juego en
> `game-input.js`, rayo en `raycast.js`, menú en `menu-input.js`, táctil en
> `touch.js`); `world.js` conservó el ciclo de vida de mallas (datos en
> `chunkstore.js`, luz en `lightclient.js`, construcción en `meshbuild.js`/
> `lodmesh.js`). La fachada pública de los tres no cambia: los consumidores
> (`network.js`, `player.js`, `settings.js`, `debug.js`) importan lo mismo.

## Mapa de módulos

| Módulo | Responsabilidad | Pureza* |
|---|---|---|
| `scene.js` | Escena, cámara, renderer, luces, `PointerLockControls`, calidad gráfica | DOM/THREE |
| `connection.js` | Socket WS, `send()`, nombre de jugador (localStorage) | DOM |
| `world.js` | Ciclo de vida de mallas de chunks: mapas `chunkMeshes`/`lodMeshes`, tier LOD, frustum culling, carga/descarga, grietas y resaltado (Fase 18 D-7) | THREE |
| `chunkstore.js` | Datos de chunks en cliente: `Uint8Array`→bloques, swap en `chunks_add`/`chunks_unload`, `torchSet` (Fase 18 D-7) | **puro** |
| `lightclient.js` | Luz de antorcha horneada en el cliente: `bakeChunkLight`/`hasTorchNear` (Fase 18 D-7) | **puro** |
| `meshbuild.js` | Construcción de mallas: materiales compartidos, pool de geometrías, `groupFromBuffers`, `buildChunkGeometry` y transporte del worker (Fase 18 D-7) | THREE |
| `lodmesh.js` | Geometría LOD (caparazón por columna: tapa + muros) (Fase 18 D-7) | THREE |
| `chunkGeometry.js` | Geometría pura del chunk (greedy meshing 2D por capas, luz de antorcha y AO horneados en la clave de fusión) | **puro** |
| `chunkWorker.js` | Worker ESM que construye la geometría fuera del hilo principal (Fase 13) | Worker |
| `texturemap.js` | Selección de tesela del atlas por bloque/cara (`tileForFace`/`tileRect`) | **puro** |
| `geopool.js` | Pool de `BufferGeometry` (reutilización de buffers GPU) | **puro** |
| `lod.js` | Decisión de tier LOD/full con histéresis | **puro** |
| `lighting.js` | Luz de antorcha por celda (horneada en vértices) | **puro** |
| `textures.js` | Atlas procedural de bloques (16×16 por cara) | DOM (canvas) |
| `itemicons.js` | Iconos procedurales de ítems (atlas de una fila) — **atlas de datos**: excepción justificada a la regla de 500 líneas (F18 D-9) | **puro** (grid) |
| `mobtextures.js` | Atlas procedural de mobs (una tesela por parte) | DOM (canvas) |
| `mobs.js` | Meshes de mobs y jugadores remotos (grupos de partes) | THREE |
| `particles.js` | Partículas de romper/colocar (pool de cubitos) | THREE |
| `player.js` | Física/movimiento del jugador local (predicción), vuelo creativo, sprint, agacharse | THREE |
| `input.js` | **Despachador de input (Fase 18 D-8):** importa `game-input.js`/`menu-input.js`/`touch.js` y re-exporta `onBlockMined` (network.js) | DOM/THREE |
| `game-input.js` | Input del juego: teclado (movimiento, hotbar, paneles, F3/F11), ratón (minar/atacar/colocar/pick-block), sesión de minería y re-minado (F17 B7) (Fase 18 D-8) | DOM/THREE |
| `raycast.js` | Rayo cámara→mundo (bloques + mobs), resaltado del objetivo y telemetría `__mcMiningTrace`/`__mcDebugMining` (Fase 18 D-8) | DOM/THREE |
| `menu-input.js` | Navegación del menú/pausa (F17 A/C) | DOM |
| `touch.js` | Controles táctiles y mousedown sintético (F17 D1, Fase 18 D-8) | DOM |
| `daynight.js` | Ciclo día/noche visual (extrapola el reloj del servidor) | THREE |
| `waterfog.js` | Decisión de niebla submarina (Fase 16 B1): solo con inmersión real de los ojos (≥2 bloques) | **puro** |
| `sky.js` / `skycolors.js` | Dome procedural (sol, luna, estrellas) + paleta | THREE / **puro** |
| `clouds.js` | Nubes procedurales que se desplazan y siguen al jugador (Fase 10) | THREE |
| `audio.js` | Sonido procedural (Web Audio): pasos, roturas, ambiente, comer, música por contexto, sonidos de paridad C-9 | DOM |
| `ui.js` | **Orquestador del HUD (Fase 18 D-6):** re-exporta el API de `hud.js`/`menus.js`/`panels.js`/`recipebook.js` y orquesta lo que cruza módulos | DOM |
| `hud.js` | HUD en juego: hotbar, salud/comida/XP, tooltip, silencio, badge de gamemode, chat y pantalla de muerte (Fase 18 D-6) | DOM |
| `menus.js` | Pantallas principal/mundos/crear/ajustes/pausa y selector de skins (Fase 18 D-6) | DOM |
| `panels.js` | Inventario/crafteo, armadura, horno, cofre y picker creativo (Fase 18 D-6) | DOM |
| `recipebook.js` | Libro de recetas por categorías (Fase 18 D-6) | DOM |
| `recipeCategories.js` | Categorías del libro de recetas | **puro** |
| `quality.js` | Perfiles de calidad y clamps de ajustes | **puro** |
| `settings.js` | Ajustes persistidos en `localStorage` (mc_settings) | DOM |
| `loading.js` | Pantalla de carga con consejos y error/retry | DOM |
| `debug.js` | F3: grid de chunks + métricas de render | THREE |
| `network.js` | Handler de eventos del servidor (dispatcher) | DOM |

\* **Puro** = sin DOM ni THREE → testeable en Node como ESM (los tests los
importan con `file://`, patrón `tests/unit-itemicons.js`).

**Por qué la separación puro/impuro:** el proyecto no tiene build step,
pero sí tests de servidor en Node. La solución es que **toda la lógica de
decisión** (LOD, luz, pool, iconos, calidad, categorías, geometría del
chunk, niebla submarina) viva en módulos sin dependencias de navegador;
los módulos con THREE/DOM se quedan como pegamento fino. Así
`tests/unit-lod.js`, `tests/unit-geopool.js`, `tests/unit-itemicons.js`,
`tests/unit-recipecats.js`, `tests/unit-antorchas.js` (bloque B: luz de
`lighting.js`), `tests/unit-greedy.js` (greedy meshing de
`chunkGeometry.js`), `tests/unit-workers.js` y `tests/unit-fase16.js`
(sección de niebla: `waterfog.js`) importan y prueban lógica real, no
mocks.

## El bucle de render

`player.js`/`world.js` arrancan un `requestAnimationFrame` que cada frame:

1. Actualiza la física/movimiento del jugador local (predicción) y envía
   `move` al servidor.
2. Extrapola el día/noche (`updateDayNight`) y actualiza cielo + luces.
3. Actualiza LOD (cada 250 ms) y frustum culling de chunks.
4. Aplica animación de agua/lava (`updateLiquidAnimation`) y nubes
   (`updateClouds`).
5. Renderiza.

**Por qué el cliente extrapola:** el servidor manda `dayTime` y la
posición de los mobs a 20 Hz; el cliente interpola/extrappola entre
actualizaciones para que el render sea suave a 60 FPS sin esperar al
próximo tick.

## Persistencia del cliente (settings.js)

`mc_settings` en `localStorage`: renderDistance, showCoords, controles
invertidos (B1), FOV, sensibilidad, volúmenes (master/effects/ambient),
calidad gráfica, y `mc_name` (nombre del jugador) / `mc_audio_muted`
(silencio). `mc_settings` no es autoritativo: el servidor sane y valida
todo lo que recibe vía `settings`.

## Verificación

- Lógica pura: `node tests/run.js --unit` (importa los módulos ESM del
  cliente desde Node).
- Render real: `tests/audit-fase7.js` usa **Chrome headless (CDP)** para
  cargar la página, contar chunks/meshes, medir el tick y capturar
  excepciones de consola — es la única forma de detectar bugs de render
  (patrón: el `ReferenceError` del atlas de Fase 9 que dejaba
  `mcChunks: 0`). También `tests/diag-clic.js` diagnostica el flujo
  clic→mina en vivo.
