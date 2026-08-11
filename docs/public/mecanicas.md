# Cliente — Mecánicas de render y gameplay

> Cómo funciona cada mecánica del cliente, **por qué** está implementada
> así y dónde vive el código. Para la arquitectura general ver
> [`README.md`](./README.md).

---

## 1. Render de chunks (public/world.js)

### Cómo funciona

- **Almacén:** `chunkStore` (Map `"cx,cz"` → `Uint8Array(16×128×16)`) con
  los bloques que llegan del servidor en `chunks_add` (mundo de 128
  bloques, Y ∈ −64..+63, Fase 15 D5).
- **Geometría con greedy meshing en un worker (Fase 13):**
  `world.js` encola la reconstrucción en `chunkWorker.js`, que llama a
  `buildChunkGeometryData` (`chunkGeometry.js`): culling de caras + fusión
  greedy 2D por capas (quads largos de bloques iguales coplanares, con luz
  de antorcha y AO horneados en la clave de fusión). Solo se emiten las
  caras visibles — no se dibuja una cara si el vecino es sólido — y el
  culling se aplica **entre chunks vecinos** (los bordes de chunk no dejan
  huecos). La geometría se construye fuera del hilo principal.
- **Texturas:** cada cara elige su tesela del atlas (`textures.js`:
  `tileForFace` top/bottom/lados; césped con top verde y lados con
  transición) y sus UVs (`tileRect`); `world.js` solo aplica las UVs. Un
  solo material compartido por todo el terreno (atlas).
- **Mesh por chunk:** `chunkMeshes` (detalle completo) y `lodMeshes`
  (heightmap simplificado). Los meshes se añaden/quitan de la escena según
  renderDistance, y **frustum culling** por esfera de chunk
  (`applyFrustumCulling`) evita dibujar lo que no se ve.
- **Actualizaciones:** `setClientBlock` + `rebuildAffectedChunks` /
  `rebuildAround` reconstruyen solo los chunks afectados al recibir
  `block_update`.
- **AO por vértice (Fase 10):** `vertexAO` hornea oclusión ambiental
  estilo Minecraft (5 niveles de sombra según los vecinos sólidos en las
  esquinas) en el color por vértice del terreno opaco — barato, sin
  shaders.
- **Agua mejorada (Fase 10):** la cara superior del agua baja a 0.875
  (14/16, como MC, sin z-fighting), textura de agua dedicada desplazable
  (`updateLiquidAnimation` mueve el `offset` para la corriente) y pulso de
  opacidad.

### Por qué así

- **Culling de caras + greedy meshing = el 90% del ahorro.** En un mundo de
  128 de alto, la mayoría de caras son interiores (piedra con piedra al
  lado): dibujarlas sería tirar ~6× más triángulos. El greedy fusiona las
  caras coplanares del mismo bloque y el mesh por chunk (en vez de por
  bloque) es lo que permite compartir un material y mantener pocos draw
  calls.
- **Chunks de 16×16** (como Minecraft): frontera natural entre la malla
  estática (que se puede reconstruir solo cuando cambia un bloque) y el
  streaming de distancia.
- **Frustum culling por esfera** barato: un `Sphere` por chunk, test contra
  el frustum de la cámara, sin tocar la geometría (ver el fix B6 de la
  Fase 8: los bounds obsoletos hacían que el frustum ocultara chunks).

### Verificación

`tests/unit-crack.js` (regeneración al romper), `tests/unit-greedy.js`
(greedy: fusión de caras, identidad y raycast de losas), `tests/unit-workers.js`
(swap del mesh en el camino del worker), `audit-fase4.js`
(culling de caras replicado), `audit-fase7.js` (CDP: chunks visibles,
triángulos, tick).

---

## 2. Pool de geometrías (public/geopool.js)

### Cómo funciona

- Al descargar/reconstruir un chunk, la `BufferGeometry` **no se destruye**:
  vuelve a un pool por categoría (terrain/water/lod — cada una con su set
  de attributes). `acquire` reutiliza; el exceso se libera con `dispose()`
  (memoria acotada).
- `setOrReuseAttribute` **reutiliza el array subyacente** (y por tanto el
  buffer GPU) cuando el tamaño coincide: solo se re-alloc/refresca lo que
  cambia.

### Por qué así

El coste dominante de reconstruir un chunk es `alloc de Float32Array +
upload al GPU`. Como la mayoría de chunks tienen tamaño similar, el pool
convierte esa alloc en un reuso casi gratis. Es la recomendación de la
skill `performance-optimization`: **no allocar en bucles calientes**.

### Verificación

`tests/unit-geopool.js` (con objetos falsos, sin three real).

---

## 3. LOD de chunks lejanos (public/lod.js)

### Cómo funciona

- `lodTierFor(dist, current)`: > `LOD_ON_DIST` (56 bloques) → tier `lod`;
  < `LOD_OFF_DIST` (44) → tier `full`.
- **Histéresis:** en la banda entre ambas distancias se conserva el tier
  actual. Un chunk cerca de la frontera **no alterna** de un frame a otro
  (parpadeo).
- El LOD es un **heightmap por columna** con color plano (sin teselas
  finas): `public/world.js` construye la geometría; aquí solo se decide el
  tier. El cliente compara contra `lodMeshes` y reconstruye solo cuando el
  tier cambia.

### Por qué así

- **El LOD recorta el triángulo count de los chunks lejanos** (que son la
  mayoría de los visibles) sin sacrificar el detalle de cerca. La
  histéresis evita el *popping* en la frontera (regla de la skill
  `performance-optimization`: medir y presupuestar; el LOD es la
  optimización algorítmica correcta antes que micro-tuning).
- **Lógica pura y testeable** sin THREE: `tests/unit-lod.js` valida la
  decisión y la histéresis.

---

## 4. Luz de antorcha (public/lighting.js)

### Cómo funciona

- `computeChunkLight` recibe las posiciones de antorchas conocidas y una
  función de lectura de bloques, y devuelve un `Float32Array` (0..1) con
  la luz por celda del chunk.
- Propagación estilo Minecraft: `LIGHT_RADIUS = 7`, `LIGHT_ATTEN = 0.8`
  por paso, mínimo `0.03`. Aire, agua y antorchas dejan pasar la luz; el
  resto la bloquea.
- `public/world.js` **hornea** esa luz en colores por vértice de la
  geometría (la luz de bloque importa cuando la luz de cielo es baja, de
  noche).

### Por qué así

- **Luz de bloque horneada en vértices** es la técnica clásica de
  Minecraft (sin shadow maps por bloque, que serían carísimos con 169
  chunks). Se recalcula solo al reconstruir el chunk.
- **Lógica pura** → `tests/unit-antorchas.js` (bloque B: `isLightPassable`
  y `computeChunkLight`) en Node.

---

## 5. Texturas procedurales (public/textures.js) e iconos (public/itemicons.js)

### Cómo funciona

- **Atlas de bloques:** un canvas (8 teselas × N filas de 16×16 px) se
  pinta al cargar con `mulberry32` (PRNG determinista) → el atlas es
  estable entre cargas. Una única `CanvasTexture` compartida por todos los
  chunks; cada cara elige su tesela con UVs.
- **Teselas por cara:** césped (top verde, lados con transición a tierra),
  tronco con anillos, horno con boca, cofre con cerradura, cama, vidrio
  translúcido, lanas tintadas, plantas como cross-quads.
- **Iconos de ítems:** mismo enfoque, atlas de una fila recortado por CSS
  (`itemIconCss`); la lógica de dibujo es un **grid de celdas puro**
  (testeable en Node).
- **Mobs:** `mobtextures.js` genera un atlas de una fila con **una tesela
  por parte del cuerpo** (MOB_PARTS); `mobs.js` remapea los UV de cada caja
  a su tesela.

### Por qué así

- **Cero assets binarios + estabilidad:** el PRNG sembrado garantiza que
  el atlas de un jugador sea idéntico al de otro (misma textura en
  multijugador); sin assets que gestionar ni CDN que cuidar.
- **Un material compartido** (atlas) = pocos draw calls; el render por
  cara con UVs es lo que permite el look Minecraft con un solo texture
  atlas.
- **Lógica pura para iconos** para poder testear la estabilidad del grid
  (`tests/unit-itemicons.js`).

---

## 6. Mobs y jugadores remotos (public/mobs.js)

### Cómo funciona

- Cada mob es un **THREE.Group de partes** (cabeza, cuerpo, extremidades)
  según `MOB_PARTS` — creeper con 4 patas, araña con 8 rotadas, enderman
  alto, conejo con orejas, pollo...
- **Un solo material por mob** (el atlas completo, base 0xffffff): la
  quema solar y el flash de daño (`flashMob`) tiñen el grupo entero.
- **Patas animadas** (Fase 10): cada extremidad lleva `userData.limbIndex`
  y `setMobWalk` las oscila con una fase según la distancia recorrida (y
  `resetMobWalk` al parar) — los mobs y los jugadores remotos "caminan".
- El grupo raíz conserva `userData.mobId/mobType` para el raycast de
  combate: `input.js` intersecta los **hijos** y sube al raíz.
- `updateMobs` sincroniza posiciones/interpolaciones desde `mobs_update`;
  las flechas se dibujan con `updateArrows` (`arrows_update`) como
  entidades ligeras con física de gravedad.
- Jugadores remotos: mismo sistema de partes, con nombre (`player_rename`)
  y color de material por jugador.

### Por qué así

- **Multibloque = reconocible.** Un box único no distingue un zombi de un
  creeper. Las partes por especie dan identidad visual sin modelos 3D
  externos (todo procedural).
- **Material compartido por mob** permite el tintado global (quema/flash)
  con un solo cambio de color, y limita draw calls.
- **Raycast por hijos** es la forma correcta de golpear un grupo en
  Three.js (regresión B10 de la Fase 8: intersectar el grupo raíz fallaba
  porque la geometría está en los hijos).

### Verificación

`tests/unit-mobray.js` (raycast real con three), `audit-fase7.js` (CDP:
mobs visibles en escena).

---

## 7. Física local y predicción (public/player.js)

### Cómo funciona

- El cliente simula gravedad/salto con las **mismas constantes** que el
  servidor (`GRAVITY`, `JUMP_SPEED`, `EYE_HEIGHT`) para que la predicción
  coincida con la validación.
- **Colisión local:** el cliente comprueba bloques sólidos alrededor del
  jugador para no atravesar el mundo entre ticks (el servidor lo revalida).
- **Sprint (Fase 10):** doble-tap W → `SPRINT_SPEED` (~1.3×) y el FOV se
  abre `SPRINT_FOV` grados mientras se corre (solo en suelo, sin nadar ni
  volar).
- **Agacharse (Fase 10):** Shift → `SNEAK_SPEED` (30%) y el `tryMove` no
  avanza si el bloque bajo el siguiente paso no es sólido (protección de
  bordes, no caerse).
- **Vuelo creativo** (`creative_fly`, doble Espacio): sube/baja con
  Shift/Espacio; el servidor lo permite solo en gamemode creativo.
- Envía `move` al servidor en cada cambio; el servidor responde la
  posición validada (la autoritativa).

### Por qué así

- **Predicción local** (y no esperar el tick del servidor) elimina el lag
  percibido en la red local: el render se mueve al instante y el servidor
  corrige si hay discrepancia. Es el patrón clásico de client-side
  prediction para juegos de red.
- **Paridad de constantes** auditable: `tests/unit-sync.js` compara
  servidor↔cliente y rompe si divergen.

---

## 8. Día/noche y cielo (public/daynight.js, sky.js, skycolors.js)

### Cómo funciona

- El servidor manda `dayTime` (ms dentro del ciclo de 20 min) y
  `moonTime` (ciclo lunar de 8 días) en el init; `daynight.js` los
  **extrapola con `performance.now()`** para saber la fase en todo momento
  sin depender del tick del servidor.
- `updateDayNight` interpola colores de cielo (cenit/horizonte),
  luz ambiental, luz del sol y niebla por la fase (día/noche/atardecer).
- **Niebla submarina (Fase 10):** `setUnderwater` (lo detecta `player.js`
  con la cámara sumergida) sobreescribe la niebla con azul denso y muy
  cercano mientras se nada.
- **Nubes (Fase 10):** `clouds.js` dibuja un campo de sprites
  procedurales (tinte por vértice día/noche) que se desplazan con el
  viento y siguen al jugador con offsets cíclicos.
- `sky.js` pinta un **dome procedural** (BackSide) con shader: degradado,
  banda cálida en atardecer, sol (disco + halo), luna con **fases**
  (máscara según `moonPhase`) y estrellas de noche (hash determinista por
  dirección). Sigue a la cámara y no le afecta la niebla.
- Solo visual: la lógica de juego (spawns nocturnos) la decide el servidor
  con el mismo reloj.

### Por qué así

- **Extrapolación local** del reloj evita saltos visuales entre ticks y
  hace el ciclo fluido a cualquier FPS.
- **Dome + shader** en vez de textura de cielo: sin assets, con estrellas
  procedurales y fases lunares baratas (regla `shader-programming`: hacer
  en el shader lo que el CPU no necesita saber).
- **Determinismo del cielo:** las estrellas se derivan por hash de
  dirección (no `Math.random`), así todos los jugadores ven el mismo cielo.

---

## 9. Input (public/input.js)

### Cómo funciona

- **Teclado:** WASD (movimiento), Espacio (salto/vuelo creativo), Shift
  (agacharse/bajar en vuelo), doble-tap W (sprint, Fase 10), E
  (inventario; en creativo abre el **picker de bloques**), B (libro de
  recetas), F3 (debug), 1-9 (hotbar), Enter (chat), Escape (cerrar
  paneles).
- **Ratón (pointer lock):** mirar, clic izquierdo = minar/atacar, clic
  derecho = colocar/comer/interactuar (cama, cofre, horno, semillas,
  tijeras sobre oveja, bonemeal), **clic medio = pick-block** del bloque
  apuntado en creativo (`creative_pick`, Fase 10).
- **Raycast de minado/combate:** `input.js` lanza el rayo desde la cámara,
  intersecta bloques y mobs (recursivo por partes, ver §6), y envía
  `block_action` / `attack_mob` al servidor. Incluye telemetría de
  diagnóstico (`window.__mcMiningTrace`, `__mcDebugMining`) del flujo
  clic→mina (Fase 9, Bloque A).
- **Paneles vs juego:** con un campo editable enfocado (`isTyping`) las
  teclas de juego se ignoran (fix B5: escribir el nombre no abría el
  inventario).

### Por qué así

- **El servidor decide el resultado:** el clic solo *pide*; el progreso de
  minado lo lleva `server/mining.js`. El raycast del cliente existe para
  saber QUÉ pedir, no para autorizar.
- **Telemetría de diagnóstico** en el flujo de minado: el bug crítico de la
  Fase 9 ("clic no hace nada" → `mcChunks: 0` por un ReferenceError del
  atlas) se cazó exponiendo el flujo en `window.__mc*` y verificando con
  CDP.

### Verificación

`tests/unit-mining-click.js` (decisión de clic con three real),
`tests/diag-clic.js`, `audit-fase7.js` (CDP).

---

## 10. Audio procedural (public/audio.js)

### Cómo funciona

- Todo el sonido se **genera al vuelo** con buffers de ruido y
  osciladores (Web Audio API): pasos por material, rotura/colocación,
  comer, comer crudo, cría, agua, salpicaduras, cofres, TNT, hiss del
  creeper y balido de oveja (Fase 11), ambiente (viento de día, grillos
  de noche).
- **Música ambiental generativa (Fase 10):** pad pentatónico procedural
  (`startMusic`/`padNote`) que varía con el día/noche y con el **contexto**
  (`setMusicContext`): cueva → notas graves y espaciadas, desierto →
  brillante, nieve → cristalina.
- El contexto se detecta en `player.js` (techo encima → cueva; arena/nieve
  bajo los pies → desierto/frío).
- El contexto se crea/reanuda en el **primer gesto del usuario**
  (requisito de los navegadores para permitir audio).
- **Volúmenes por categoría** (master/effects/ambient) en serie hacia el
  master — los ajusta el menú (`setVolume`); el silencio persiste en
  `localStorage`.

### Por qué así

- **Procedural = cero assets** y sonido siempre presente, coherente con la
  filosofía del proyecto.
- **Gains por categoría** en vez de volumen por clip: es la arquitectura de
  buses que recomienda la skill `audio-design` (balance global, no
  per-clip).
- **Gesto del usuario** para el AudioContext: sin él el audio no arranca
  (política de navegadores).

---

## 11. UI y HUD (public/ui.js, settings.js)

### Cómo funciona

- **HUD:** hotbar con durabilidad y tooltips, salud, comida con
  saturación dorada, barra de XP (progreso dentro del nivel con la curva
  MC: `xpInto`/`xpToNext` del servidor), badge de gamemode, coordenadas
  opcionales.
- **Menús:** principal (nombre, semilla), mundos (lista con badges de modo
  y borrado 🗑️), ajustes (render distance, coords, controles invertidos,
  FOV, sensibilidad, volúmenes, calidad).
- **Paneles:** crafteo 3×3 + armadura equipada, horno, cofre — todos con
  el servidor como fuente de verdad (`crafting_grid_update`,
  `furnace_state`, `chest_state`).
- **Libro de recetas (B):** todas las recetas por categorías (bloques/
  herramientas/armadura/comida/materiales + fundición) sin desbloqueo;
  `recipeCategories.js` decide la pestaña (lógica pura testeable).
- **Ajustes:** `mc_settings` en localStorage; los aplica `settings.js` en
  tiempo real (render distance notifica al servidor, calidad al renderer).

### Por qué así

- **El servidor siempre pinta los paneles:** el cliente repinta lo que
  recibe (`applyCraftingGrid`, `applyFurnaceState`, `applyChestState`);
  nunca asume un estado local (evita desincronización con otros jugadores
  y con el servidor).
- **Módulos puros para lo testeable** (categorías, clamps, perfiles) y DOM
  fino para el resto: `tests/unit-recipecats.js`, `tests/unit-ajustes.js`
  (perfiles de calidad y clamps de `quality.js`).
- **Tooltips con durabilidad** para que el desgaste sea visible (no hay
  otra forma de saber cuánto le queda a la herramienta).

---

## 12. Rendimiento en el cliente (resumen)

| Técnica | Dónde | Por qué |
|---|---|---|
| Culling de caras + greedy meshing | `chunkGeometry.js` | fusiona caras coplanares: la mayoría de caras son interiores |
| Geometría en Web Worker | `chunkWorker.js` | no bloquear el hilo principal con la malla |
| Mesh por chunk + 1 material | `world.js` | pocos draw calls |
| Frustum culling por esfera | `world.js` | no enviar lo invisible al GPU |
| AO por vértice | `world.js` | sombreado estilo MC barato (Fase 10) |
| LOD con histéresis | `lod.js` | recorta triángulos lejanos sin popping |
| Pool de geometrías | `geopool.js` | reutilizar buffers GPU, no allocar |
| Luz horneada en vértices | `lighting.js` | sombreado barato estilo MC |
| PRNG determinista en atlas | `textures.js`/`itemicons.js`/`mobtextures.js` | texturas estables y compartidas |
| Partículas con pool | `particles.js` | sin instantiate/free por evento |
| Nubes procedurales | `clouds.js` | cielo vivo sin assets ni draw calls caros (Fase 10) |
| Perfiles de calidad | `quality.js` + `scene.js` | pixelRatio/sombras ajustables |

**Cómo se mide:** el F3 (`debug.js`) muestra FPS, chunks visibles/totales,
caras y triángulos; `audit-fase7.js` (CDP) captura `window.__mc*` en
navegador real y falla si hay excepciones o no se renderiza (patrón de
calidad del proyecto: los tests de servidor no ven el render, el CDP sí).
