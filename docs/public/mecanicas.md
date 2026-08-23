# Cliente — Mecánicas de render y gameplay (índice)

> Cada mecánica tiene su **fichero independiente** con la misma estructura:
> cómo funciona actualmente, por qué se tomó la decisión, mejoras a futuro
> y una tabla de **constantes/funciones, cambios a realizar y resultados
> esperados**. Para la arquitectura general ver
> [`README.md`](./README.md).
> Qué no puede hacer hoy el proyecto y por qué:
> [`limitaciones-tecnicas.md`](../limitaciones-tecnicas.md).

## Índice de mecánicas

| Mecánica | Fichero | Código |
|---|---|---|
| Render de chunks (greedy meshing, AO, agua/plantas, materiales) | [`render-chunks.md`](./render-chunks.md) | `world.js`, `chunkstore.js`, `chunkGeometry.js`, `meshbuild.js`, `chunkWorker.js`, `materialstyle.js` |
| Pool de geometrías (reuso de buffers GPU) | [`pool-geometrias.md`](./pool-geometrias.md) | `geopool.js` |
| LOD de chunks lejanos (histéresis) | [`lod-chunks.md`](./lod-chunks.md) | `lod.js`, `lodmesh.js`, `world.js` |
| Luz de antorcha (horneada + luz puntual + índice espacial) | [`luz-antorcha.md`](./luz-antorcha.md) | `lighting.js`, `lightclient.js`, `torchlogic.js`, `torchlights.js`, `chunkstore.js` |
| Texturas procedurales e iconos (atlas determinista) | [`texturas-iconos.md`](./texturas-iconos.md) | `textures.js`, `itemicons.js`, `mobtextures.js`, `texturemap.js` |
| Mobs y jugadores remotos (grupos de partes, animación) | [`mobs-remotos.md`](./mobs-remotos.md) | `mobs.js`, `mobtextures.js` |
| Física local y predicción (sprint, agacharse, knockback) | [`fisica-prediccion.md`](./fisica-prediccion.md) | `player.js` |
| Día/noche y cielo (franjas MC, niebla, nubes, dome) | [`dia-noche-cielo.md`](./dia-noche-cielo.md) | `daynight.js`, `daymath.js`, `sky.js`, `skycolors.js`, `clouds.js`, `waterfog.js` |
| Input y raycast (teclado/ratón/táctil, telemetría) | [`input-raycast.md`](./input-raycast.md) | `input.js`, `game-input.js`, `raycast.js`, `menu-input.js`, `touch.js` |
| Audio procedural (sonidos, música por bioma) | [`audio.md`](./audio.md) | `audio.js`, `musicpalette.js` |
| Accesibilidad (teclado en paneles, contraste, reduceMotion) | [`accesibilidad.md`](./accesibilidad.md) | `a11y-nav.js`, `hud.js`, `player.js` |
| UI y HUD (paneles, drag & drop, libro, calidad) | [`ui-hud.md`](./ui-hud.md) | `ui.js`, `hud.js`, `menus.js`, `panels.js`, `recipebook.js`, `dragdrop.js`, `draglogic.js`, `quality.js`, `settings.js` |

## Cambios de la Fase 21.6 (2026-08-22)

- **Mochila** (`panels.js`): `toggleBundleUI` captura el estado ANTES de
  asignar y envía `bundle_action close` exactamente una vez al cerrarse —
  Escape (`closePanels`) y clic exterior incluidos (C1); 
  `applyInventory`/`repaintIcons` refrescan la columna de inventario del
  bundle abierto vía `updateBundleInventoryUI()` (C2).
- **Escudo** (`game-input.js`/`hud.js`): soltar el clic derecho fuera del
  canvas (listener de `mouseup` a nivel `document`) y cambiar de slot
  sueltan la pose-viñeta y avisan al servidor (evento local
  `mc-slot-change`; el servidor además limpia `blocking`); nueva causa
  «proyectil» en la pantalla de muerte (B2/B1).
- **Discos** (`menus.js`/`network.js`): `stopDisc()` al volver al menú,
  en el init/reconexión y en la muerte local — se elimina la música
  fantasma del `setInterval` huérfano (D2).
- **Renderer** (`scene.js`): creación con
  `powerPreference: "high-performance"` (F1).

## El bucle de render

`player.js`/`world.js` arrancan un `requestAnimationFrame` que cada frame:

1. Actualiza la física/movimiento del jugador local (predicción) y envía
   `move` al servidor.
2. Extrapola el día/noche (`updateDayNight`) y actualiza cielo + luces.
3. Actualiza LOD (cada 250 ms) y frustum culling de chunks.
4. Aplica animación de agua/lava/plantas (`updateLiquidAnimation`,
   ShaderMaterial con `uTime`/`uDay`, F19.6 C1/C2) y nubes (`updateClouds`).
5. Actualiza la luz real de antorchas cercanas (`updateTorchLights`, solo si
   el toggle `torchLight` está activo).
6. Renderiza.

**Por qué el cliente extrapola:** el servidor manda `dayTime` y la posición
de los mobs a 20 Hz; el cliente interpola/extrappola entre actualizaciones
para que el render sea suave a 60 FPS sin esperar al próximo tick.

## Rendimiento en el cliente (resumen)

| Técnica | Dónde | Por qué |
|---|---|---|
| Culling de caras + greedy meshing | `chunkGeometry.js` | fusiona caras coplanares: la mayoría de caras son interiores |
| Geometría en Web Worker | `chunkWorker.js` | no bloquear el hilo principal con la malla |
| Mesh por chunk + 1 material | `world.js` | pocos draw calls |
| Frustum culling por esfera | `world.js` | no enviar lo invisible al GPU |
| AO por vértice | `world.js` | sombreado estilo MC barato (F10) |
| LOD con histéresis | `lod.js` | recorta triángulos lejanos sin popping |
| Pool de geometrías | `geopool.js` | reutilizar buffers GPU, no allocar |
| Luz horneada en vértices | `lighting.js` | sombreado barato estilo MC |
| PRNG determinista en atlas | `textures.js`/`itemicons.js`/`mobtextures.js` | texturas estables y compartidas |
| Partículas con pool | `particles.js` | sin instantiate/free por evento |
| Nubes procedurales | `clouds.js` | cielo vivo sin assets ni draw calls caros (F10) |
| Perfiles de calidad | `quality.js` + `scene.js` | `renderScale` × resolución nativa + sombras (F16 B6) |

**Cómo se mide:** el F3 (`debug.js`) muestra FPS, chunks visibles/totales,
caras y triángulos; `audit-fase7.js` (CDP) captura `window.__mc*` en
navegador real y falla si hay excepciones o no se renderiza.

## Verificación

- Lógica pura: `node tests/run.js --unit` (importa los módulos ESM del
  cliente desde Node).
- Render real: `tests/audit-fase7.js` usa **Chrome headless (CDP)** para
  cargar la página, contar chunks/meshes, medir el tick y capturar
  excepciones de consola — la única forma de detectar bugs de render.
- Cada mecánica enumera sus tests en la sección "Cambios a realizar y
  resultados esperados" de su fichero.
