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

## Mapa de módulos

| Módulo | Responsabilidad | Pureza* |
|---|---|---|
| `scene.js` | Escena, cámara, renderer, luces, `PointerLockControls`, calidad gráfica | DOM/THREE |
| `connection.js` | Socket WS, `send()`, nombre de jugador (localStorage) | DOM |
| `world.js` | Chunks en cliente, meshes + LOD, partículas de grieta, frustum culling | THREE |
| `chunkGeometry.js` | Geometría pura del chunk (greedy meshing 2D por capas, luz de antorcha y AO horneados en la clave de fusión) | **puro** |
| `chunkWorker.js` | Worker ESM que construye la geometría fuera del hilo principal (Fase 13) | Worker |
| `texturemap.js` | Selección de tesela del atlas por bloque/cara (`tileForFace`/`tileRect`) | **puro** |
| `geopool.js` | Pool de `BufferGeometry` (reutilización de buffers GPU) | **puro** |
| `lod.js` | Decisión de tier LOD/full con histéresis | **puro** |
| `lighting.js` | Luz de antorcha por celda (horneada en vértices) | **puro** |
| `textures.js` | Atlas procedural de bloques (16×16 por cara) | DOM (canvas) |
| `itemicons.js` | Iconos procedurales de ítems (atlas de una fila) | **puro** (grid) |
| `mobtextures.js` | Atlas procedural de mobs (una tesela por parte) | DOM (canvas) |
| `mobs.js` | Meshes de mobs y jugadores remotos (grupos de partes) | THREE |
| `particles.js` | Partículas de romper/colocar (pool de cubitos) | THREE |
| `player.js` | Física/movimiento del jugador local (predicción), vuelo creativo, sprint, agacharse | THREE |
| `input.js` | Teclado (movimiento, hotbar, paneles, libro, picker creativo) y ratón (minar/atacar/colocar/pick-block) | DOM/THREE |
| `daynight.js` | Ciclo día/noche visual (extrapola el reloj del servidor), niebla submarina | THREE |
| `sky.js` / `skycolors.js` | Dome procedural (sol, luna, estrellas) + paleta | THREE / **puro** |
| `clouds.js` | Nubes procedurales que se desplazan y siguen al jugador (Fase 10) | THREE |
| `audio.js` | Sonido procedural (Web Audio): pasos, roturas, ambiente, comer, música por contexto | DOM |
| `ui.js` | HUD, menús, paneles, libro de recetas, listas de mundos | DOM |
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
chunk) viva en módulos sin dependencias de navegador; los módulos con
THREE/DOM se quedan como pegamento fino. Así `tests/unit-lod.js`,
`tests/unit-geopool.js`, `tests/unit-itemicons.js`,
`tests/unit-recipecats.js`, `tests/unit-antorchas.js` (bloque B: luz de
`lighting.js`), `tests/unit-greedy.js` (greedy meshing de
`chunkGeometry.js`) y `tests/unit-workers.js` importan y prueban lógica
real, no mocks.

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
