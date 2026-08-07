# Fase 9 — Mejoras de paridad, IA, mundo y menú (Spec)

Especificación de la Fase 9, elaborada a partir de la entrevista con el
usuario (5 rondas de preguntas). No es un plan de ejecución definitivo: es
la fuente de verdad de DECISIONES de diseño y alcance. Los bloques se
ejecutan por orden (A → G) hasta donde llegue la fase, y cada bloque con
mecánica nueva lleva su test (convención del proyecto, AGENTS.md).

Estado del repositorio al escribir este spec: Fase 8 cerrada (commit
`ec99a78`), árbol limpio, servidor en `server/` (CommonJS) + cliente ES
modules en `public/`, tests en `tests/` (`node tests/run.js --unit`).

---

## 1. Resumen

La Fase 9 es una fase de **profundización**: ya no se cazan bugs ni se
añaden features sueltos, se busca (1) que la experiencia se acerque a
Minecraft en mecánicas e IA, (2) cerrar los dos huecos de menú que quedaron
pendientes (modo de juego por mundo y borrado de mundos), (3) pulir la
estética (texturas, agua, partículas, sonido) y (4) **arreglar de verdad la
minería**, que el usuario confirma que sigue sin funcionar en el navegador
(el clic "no hace nada").

Prioridad global elegida por el usuario: **todo en orden por bloques**
(A: bugs, B: mecánicas, C: IA, D: estética, E: mundo, F: ítems/libro,
G: verificación), ejecutando por bloques hasta donde llegue la fase.

Decisiones clave (resumen de la entrevista, detalle en §7):

- **Minería**: el clic no hace nada → plan de diagnóstico **en paralelo**
  con la revisión del flujo completo (mousedown → raycast → send → server →
  tick → drop). Regla de drop **MC estricta** (la mano NO dropea piedra ni
  minerales; madera/tierra/arena sí). Los drops **siguen yendo directos al
  inventario** (no se implementan entidades de item en el suelo en esta fase).
- **Gamemode por mundo**: fijo y persistido en `world.json` (todos los
  jugadores juegan en el modo del mundo). Migración: los mundos existentes
  sin campo se abren como **survival**. En un mundo **creativo el inventario
  NO se persiste**: al entrar se resetea y se entrega el inventario creativo
  completo (estilo Minecraft). Selección de modo al crear con
  **selector + botón Crear**.
- **Eliminar mundos**: botón 🗑️ en cada mundo de la lista + confirmación
  simple. **No se puede borrar el mundo activo**.
- **IA hostil** (todas): esqueleto dispara flechas, creeper explota cerca,
  zombi arde de día, araña escala/salta, persecución mejorada (no atascarse).
- **IA pacífica** (todas): huir al ser golpeados, deambular más natural,
  volver al rebaño, dormir de noche (estético).
- **Paridad de mecánicas** (todas): hambre/regeneración completa,
  herramientas correctas + durezas MC (la espada NO mina), recetas más
  fieles, XP/niveles estilo MC, bloques faltantes básicos.
- **Estética** (todas): texturas de bloques más fieles, agua animada,
  más partículas y efectos, sonido ambiental más rico.
- **Libro de recetas**: todas las recetas visibles, organizadas por
  categorías (sin desbloqueo progresivo).
- **Supervivencia**: plantar y cultivar, cocinar más alimentos, dormir
  salta la noche. (Armadura/durabilidad ya cubiertas, no duplicar.)
- **Creativo**: inventario creativo completo, vuelo. (Rotura instantánea ya
  existe.)
- **Mundo/generación**: más estructuras (piedras de musgo, pilares,
  hierba alta), minerales por altura, playas y arena costera, más variedad
  de árboles, hierba/flores/**abejas**.
- **Ítems**: iconos pixel-art más detallados, tooltip con info, nuevos
  ítems, **cristal y tintes** (con los ítems tintables).

---

## 2. Contexto del proyecto (estado actual, verificado)

- **Arquitectura**: servidor Node.js **autoritativo** (Express + `ws`, sin
  BD; persistencia en JSON por chunk) + cliente vanilla Three.js servido sin
  build step desde `public/`. Servidor CommonJS, cliente ES modules.
- **Minería (server)**: `server/mining.js` — `startMining` / `cancelMining`
  / `tickMining`. El progreso avanza en `mainLoop` (`server/net.js` ~línea
  945) con `TICK_MS=50`. Al completar → `playerHelpers.finishMining`
  (`server/players.js` línea ~73): rompe el bloque, limpia cofres/camas/
  antorchas, calcula drop según `canHarvest`, desgaste de herramienta y XP.
  Creative rompe al instante (`net.js` ~línea 381) sin drops.
- **Minería (cliente)**: `public/input.js` — `mousedown` botón 0 →
  `startMiningAt(x,y,z)` (envía `block_action {action:'break'}` y pinta
  grieta local). `mouseup`/`pointermove` → `stopMining` (`break_cancel`).
  El raycast usa `raycaster.far = 7` con `intersectObjects(..., true)`
  (recursivo, Fase 8 B9). El fix de B3 (bounds del geometry pool) está
  aplicado en `public/geopool.js` (`release()` nullea
  `boundingBox`/`boundingSphere`).
- **Drops**: `canHarvest(tool, block)` en `server/constants.js` línea ~334:
  piedra/adoquín/minerales solo con pico; el resto siempre. **La mano (tool
  0) NO dropea piedra ni minerales** (regla MC). `miningSpeed`/`breakSeconds`
  por categoría de herramienta (pala/hacha/pico, madera 2×, piedra 4×,
  hierro 6×, oro 12×, diamante 8×).
- **Gamemode**: solo por jugador en runtime (`player.gamemode`,
  `/gamemode` en `server/commands.js` línea ~317, gate de operador).
  **No se persiste en `world.json`** (solo `schemaVersion`, `seed`, `name`,
  `lastSaved`, `mobs`, `furnaces`, `chests` — `server/save.js buildMeta`).
- **Menú de mundos**: `public/ui.js` `renderWorldsList` (línea ~349) pinta
  nombre/semilla/chunks/último guardado, clic → `startWithSeed(seed)`.
  Creación con nombre + semilla + 🎲 (`seed-create-btn` → `set_seed`).
  **No hay botón de eliminar.**
- **Recetas**: `recetas.json` (41 recetas 3×3, objeto `{shape, ingredients,
  result}`) + `recetas_horno.json` (9). Hot-reload con swap atómico.
  El crafteo es por ensayo-error en la UI; **no hay libro de recetas**.
- **IA de mobs**: `server/mobs.js` — `wander()` (targets aleatorios),
  `findNearestPlayer()`, ataque cuerpo a cuerpo genérico; cada especie
  comparte el mismo comportamiento base. Hostiles no spawnean en la zona
  segura del spawn (radio 32, B2). Sin especialización por especie.
- **Mobs en cliente**: `public/mobtextures.js` (MOB_PARTS, atlas de una
  fila) + `public/mobs.js` (grupos de partes con material compartido).
- **Ajustes**: completos (renderDistance, showCoords, invertControls, FOV,
  sensibilidad, volumen por categoría, calidad gráfica) en
  `public/settings.js` + `public/quality.js`.
- **Generación**: `server/world.js` — biomas (snow/desert/forest/plains/
  mountain) con blend continuo, lagos, cuevas 3D con bocas, minas
  abandonadas con cofres, pozos decorativos de agua/lava, árboles en
  forest/plains. `WORLD_HEIGHT=64`, `CHUNK_SIZE=16`.
- **Ítems/HUD**: `public/ui.js` `itemVisual(id, scale)` con atlas procedural
  por CSS (`itemIconCss`) + fallback a texto. Nombres en español
  (`ITEM_NAMES`/`BLOCK_NAMES`), durabilidad visible en hotbar, armadura
  equipable.

---

## 3. Objetivos de la Fase 9

1. **Arreglar la minería de verdad** (diagnóstico en vivo + fix + regresión
   E2E en navegador). Bloque A.
2. **Modo de juego por mundo**: persistencia en `world.json`, selección al
   crear, mostrar en el menú y en el HUD, migración de mundos existentes,
   comportamiento creativo (inventario completo + vuelo). Bloque B.
3. **Eliminar mundos desde el menú** (con confirmación, sin borrar el
   activo). Bloque B.
4. **Mecánicas de paridad**: hambre/regeneración, herramientas+durezas MC,
   recetas fieles, XP/niveles, bloques básicos. Bloque C.
5. **IA de mobs** hostiles y pacíficos por especie. Bloque D.
6. **Estética**: texturas de bloques, agua, partículas, sonido. Bloque E.
7. **Mundo y generación**: estructuras, minerales por altura, playas,
   árboles variados, hierba/flores/abejas. Bloque F.
8. **Ítems y libro de recetas**: iconos detallados, tooltips, ítems nuevos
   (cristal + tintes), libro por categorías. Bloque F.
9. **Verificación final** (suite + E2E + biome + documentación). Bloque G.

---

## 4. Bloques de trabajo

### Bloque A — Minería funcional (el bug más crítico)

**Síntoma reportado**: "el clic no hace nada" en el navegador; no se puede
minar ni obtener ítems. El flujo del servidor está verificado por tests
(e2e-durabilidad rompe 60 bloques), así que el fallo está en el CLIENTE o en
la interfaz clic→mina.

**Diagnóstico (en paralelo, decisión del usuario: ambos)**:

1. **Telemetría en vivo** (patrón B2):
   - `window.__mcMiningTrace` en `public/input.js`: cada `mousedown` deja un
     registro `{time, locked, hit: {has, type, x,y,z, dist}, target,
     sentBreak}`.
   - `window.__mcRaycastStats` en `input.js`/`world.js`: nº de meshes
     candidatos, nº de hits, primer hit (terreno/mob), y si `hits[0]` es
     null con candidates>0 (raycast que falla pese a haber geometría).
   - Exponer un helper `window.__mcDebugMining()` que fuerza un raycast y
     pinta el resultado en consola.
2. **Revisión del flujo completo** (código):
   - ¿`mousedown` se dispara? (`pointerlockchange`, `#blocker`, menú
     abierto, `isTyping()` de B5).
   - ¿`getClientBlock` / raycast devuelven el bloque esperado?
   - ¿`send("block_action", ...)` llega al servidor? (guard de distancia 7,
     `NOT_MINEABLE`).
   - ¿`tickMining` avanza? (`mainLoop` lo llama solo si `p.mining`).
   - ¿`finishMining` da el drop esperado (`canHarvest`)?
   - Posible causa raíz a investigar (hipótesis): tras B9, el raycast con
     `recursive=true` intersecta los grupos de mobs; si un mob o una parte
     queda delante del bloque, `hits[0]` es el mob (no terreno) → el
     `mousedown` no mina. También: `raycaster.far` vs distancia, y el
     `updateMatrixWorld` de los grupos de mobs que no se actualizan antes
     del raycast (three recalcula `matrixWorld` en el render, pero el
     raycast del `mousedown` puede ocurrir antes del primer render).
   - La regresión debe quedar cubierta con three real (patrón
     `tests/unit-raycast.js`): clic sobre bloque con mob delante → mina el
     bloque (o decide por distancia); clic sin mob → mina.
3. **Verificación E2E en navegador**: si `browser-use`/CDP está disponible,
   reproducir el clic y comprobar grietas + rotura + drop. Si no, el
   diagnóstico queda documentado con la telemetría y el test de three real.

**Fix esperado**: según la causa raíz (raycast cliente o flujo), con su
test de regresión y actualización de `TODO.md`.

**No se cambia en este bloque**: la regla de drop MC estricta (punto 4.1
de decisiones) ni el drop directo al inventario.

### Bloque B — Modo de juego por mundo + eliminar mundos

**B1. Persistencia del gamemode por mundo** (decisión: fijo por mundo):

- `server/save.js buildMeta()`: añadir `gamemode: P.worldGamemode` a
  `world.json`.
- `server/constants.js worldPaths`: añadir `worldGamemode` (default
  `"survival"`) junto a `worldName`/`currentSeed`, con setter
  `setWorldSeed(seed, name, gamemode)`.
- `loadWorld()`: leer `meta.gamemode` (saneado a `survival`/`creative`;
  **mundos existentes sin el campo → survival**, decisión del usuario).
- `switchWorld(newSeed, newName, newGamemode)`: persistir el modo nuevo en
  el world.json del mundo de destino (incluido el caso "same" de renombrar).
- `listWorlds()`: devolver `gamemode` por mundo (para el menú).
- **Aplicación**: al conectar (`net.js handleConnection`) y en el `init`,
  el `player.gamemode` se inicializa con el del mundo activo. `/gamemode`
  en un mundo fijo: decisión del usuario = **fijo por mundo**, por lo que
  `/gamemode` queda **solo para operadores y NO se persiste** en un mundo
  no-creativo... — decisión concreta: `/gamemode` mantiene el gate de op
  existente pero **no debe permitir desviarse del modo del mundo de forma
  persistente**. Ver decisión 7.2 (a) y (c). **Pregunta abierta menor**:
  si /gamemode de un op en un mundo survival pasa a creative en runtime, el
  mundo sigue siendo survival al reconectar (el cambio no se persiste).
- **HUD**: mostrar el modo de juego (p.ej. "⚔️ Supervivencia" / "🏗️
  Creativo") en el HUD (fase actual o junto a coords), y en el F3.
- `SCHEMA_VERSION`: **subir a 3** (el formato de world.json cambia) con
  migración retrocompatible (los v2 se leen sin gamemode → survival) y test
  (patrón `tests/unit-persistencia.js`).

**B2. Inventario en creative: reset al entrar** (decisión del usuario):

- En un mundo creative, al entrar NO se restaura el inventario guardado:
  se resetea y se entrega el **inventario creativo completo** (todos los
  bloques/ítems seleccionables, ver Bloque C creativo). El inventario
  survival sí se persiste como hoy.
- Detalle: en un mundo survival, si un jugador trae items de una sesión
  anterior, se restauran (comportamiento actual, sin cambios).

**B3. Selección de modo al crear mundo** (decisión: selector + botón):

- `public/index.html` `#menu-worlds`: dos botones grandes o un selector
  radio + botón "Crear": **"Crear en Supervivencia"** / **"Crear en
  Creativo"**.
- `public/ui.js`: el botón envía `set_seed {seed, name, gamemode}`.
- `server/net.js` handler `set_seed`: pasar el gamemode a `switchWorld`.
- Test: `unit-commands`/`unit-red` — `set_seed` con gamemode persiste el
  modo en world.json y el jugador conectado entra con ese modo.

**B4. Mostrar el modo en el menú de mundos**:

- `renderWorldsList`: badge "🏗️ Creativo" / "⚔️ Supervivencia" junto al
  nombre (y en el tooltip).

**B5. Eliminar mundos** (decisión: botón + confirmación, no el activo):

- Servidor: nuevo evento `world_delete {seed}` en `net.js` (gate: no se
  puede borrar el mundo activo; borra `world/<semilla>/` completo con
  `fs.rmSync(recursive)`; responde `worlds_list` actualizado o error).
  - Defensa: solo borra directorios bajo `world/` cuyo nombre coincide con
    `constants.seedDir(seed)` (nunca rutas arbitrarias).
- Cliente: botón 🗑️ en cada `world-item` (stopPropagation para no abrir el
  mundo), confirmación `confirm()` en español, y si es el mundo activo el
  botón se deshabilita con tooltip "No se puede borrar el mundo activo".
- Test: `unit-red`/nuevo `unit-mundos.js` — borrado con confirmación, el
  activo rechazado, la lista se refresca.

### Bloque C — Paridad de mecánicas (supervivencia y creativo)

**C1. Hambre y regeneración estilo MC** (`server/players.js tickPlayer`):

- Revisar la relación comida ↔ regeneración: en MC, con comida ≥ 18 se
  regenera; correr gasta más hambre. Verificar que el modelo actual
  (food/saturation/foodAccum/starveAccum/regenAccum) es coherente y añadir
  el coste extra de correr (evento `run` o velocidad del move).
- Test: `unit-hambre.js` ampliado (correr gasta más; regeneración solo con
  comida alta).

**C2. Herramientas correctas + durezas MC** (`server/constants.js`):

- **La espada NO mina**: `miningSpeed` con espada = 1 (hoy ya no tiene tier
  en `TOOL_TIER_SPEED`, verificar que no da ventaja). En MC la espada rompe
  telarañas rápido; sin telarañas, es neutra.
- Revisar `BLOCK_HARDNESS` contra valores MC (piedra 1.5s a mano, tronco
  3s, tierra 0.75s...) y ajustar `breakSeconds` (hoy `dureza / velocidad`).
- La pala acelera tierra/arena/nieve, el hacha madera (ya existe en
  `CATEGORY_TOOL`; verificar con test `unit-mineria` que cada categoría usa
  su herramienta).
- Test: `unit-mineria.js` ampliado.

**C3. Recetas más fieles a MC** (`recetas.json`):

- Revisar las 41 recetas contra MC (antorchas 4, escaleras 4 si se añaden,
  vallas 3, botones, puertas...). Nuevos bloques (Bloque F2) traen sus
  recetas. Cada cambio con test `unit-recetas.js`.

**C4. XP/niveles estilo MC** (`server/players.js`, `public/ui.js`):

- Hoy: `XP_PER_LEVEL=100`, nivel = floor(xp/100) lineal. MC: coste por
  nivel creciente. Implementar curva MC (`nextLevel = 7 + floor(n*3.5)` o
  similar) manteniendo compatibilidad con `unit-*` existentes (ajustar
  tests). Barra de XP verde en HUD (hoy ¿existe? verificar `updateXPUI`).
- Test: `unit-commands` (xp de mobs) y nuevo bloque de curva.

**C5. Creativo: inventario completo + vuelo**:

- **Inventario creativo completo**: pestaña/pantalla con todos los bloques
  e ítems (de `BLOCK_NAMES`+`ITEM_NAMES`) para coger con clic (evento
  `creative_pick {itemId}`; en creative el servidor lo mete al slot
  seleccionado). Sin usar `/give`.
- **Vuelo**: doble espacio alterna volar/aterrizar (cliente `player.js`:
  modo vuelo con gravedad 0, W sube/S baja o espacio/shift; el servidor
  acepta moves con `y` libre en creative — el anti-cheat de velocidad sigue
  aplicando). Evento `creative_fly {enabled}` o derivado del gamemode.
- Test: `unit-red`/`unit-creative` nuevo — pick en creative, vuelo no
  penalizado por anti-cheat, aterrizaje.

**C6. Supervivencia: plantar y cultivar, cocinar más, dormir salta la
noche**:

- **Cultivos**: azada (nuevo ítem, receta MC) + tierra arada (bloque nuevo
  `farmland`) + semillas plantadas (bloque `wheat` con 0-7 estados de
  crecimiento por tick aleatorio) + cosecha (trigo + semillas). ítems:
  azada de madera/piedra/hierro/oro/diamante (IDs 240-244, sync con
  `DURABILITY`/`TOOL_DURABILITY` y `unit-sync`).
- **Cocinar más**: pescado (nuevo, de pescar o drop), pan (trigo), más
  comidas con saturación MC (`FOOD_VALUES` ampliado, sync `unit-sync`).
- **Dormir salta la noche**: hoy la cama solo fija respawn y rechaza de
  día. Añadir: de noche, dormir avanza el reloj al amanecer (broadcast
  `time_set` con el nuevo `worldTime`, ya soportado por commands.js);
  de día rechaza con mensaje ("Solo puedes dormir de noche").
- Tests: `unit-crafting`, `unit-hambre`, `unit-cama` ampliados.

### Bloque D — IA de mobs (hostiles y pacíficos)

**D1. Hostiles por especie** (`server/mobs.js`; el bucle principal
`updateMob` y `mainLoop` de `net.js` ya recorren `state.mobs`):

- **Esqueleto**: mantiene distancia (8-16 bloques), dispara **flechas**
  (proyectil nuevo: entidad simple con posición/velocidad, daño 2-3, vida
  corta; broadcast `arrow_spawn`/`arrow_move` o integrado en `mobs_update`;
  colisión con jugadores por distancia). De día busca sombra (no arde, MC
  real no quema esqueletos... — en MC el esqueleto NO arde; el zombi sí).
- **Creeper**: si el jugador está a ≤3 bloques, se detiene, "silba"
  (fuse ~1.5s, estado `fuse` con escala creciente visible al cliente) y
  explota (daño por distancia, radio 3, respeta `NOT_MINEABLE` y cofres con
  contenido — ya documentado en Bugs conocidos). Si el jugador se aleja,
  cancela el fuse.
- **Zombi**: **arde de día** (daño 1 cada 2s en exterior de día, humo/
  partículas al cliente), más lento que el jugador al correr.
- **Araña**: **escala** (sin colisión con los bloques que trepa: en el
  movimiento, si el bloque frontal está sólido y hay hueco arriba, sube;
  simplificación: se mueve en diagonal hacia arriba por muros) y ataca en
  saltos (velocidad de salto al acercarse).
- **Persecución mejorada**: si el pathing directo queda bloqueado (mismo
  `y` durante N ticks o colisión), probar desvío lateral aleatorio y
  re-valuar; no quedarse pegado en esquinas. Límite de rango de persecución
  (p.ej. 32 bloques) y vuelta a wander si se pierde el objetivo.
- Test: `unit-mobs-ia.js` ampliado (comportamiento por especie con reloj
  simulado).

**D2. Pacíficos**:

- **Huir al ser golpeados**: al recibir daño de jugador (`damagePlayer` de
  mobs o handler `mob_hit`), estado `flee` ~3-5s con velocidad mayor y
  dirección opuesta al atacante.
- **Deambular más natural**: pausas aleatorias (0.5-2s), giros suaves en
  vez de teleport de target, pastar ocasional (estado `graze` 1-2s).
- **Volver al rebaño**: guardar `homeX/homeZ` (punto de spawn) y si se
  alejan >24 bloques, wander hacia el hogar.
- **Dormir de noche**: de noche se agrupan (target = centro del grupo) y se
  quedan quietos (estado `sleep`, estético; no spawnean de día hostiles).
- Test: `unit-mobs-ia.js` / `unit-cria.js` ampliados.

### Bloque E — Estética

**E1. Texturas de bloques más fieles** (`public/textures.js`):

- Rediseñar el atlas procedural: césped con banda de hierba superior, tronco
  con anillos (cara superior distinta), tablones con vetas, arena con
  motas, piedra con grietas, menas con el mineral incrustado, horno con
  boca, cofre con tapa y candado, cama, cristal translúcido (nuevo).
- El render (world.js/lod.js) debe usar las caras correspondientes (top/
  side/bottom) — hoy probablemente una sola textura por bloque; ampliar el
  sistema a "texturas por cara".

**E2. Agua animada/mejorada** (`public/world.js`, `lighting.js`):

- Agua con transparencia mejorada, ondas sutiles (desplazar UVs o vértices
  con ruido temporal por chunk) y leve reflejo del cielo. Mantener el coste
  bajo (solo chunks cerca del jugador).

**E3. Partículas y efectos** (`public/particles` o `mobs.js`/`input.js`):

- Al romper/colocar (ya hay básicas): añadir color por bloque y dispersión.
- Nuevas: pasos en césped/arena, gotas de agua al nadar, chispas al minar
  piedra con herramienta, humo del horno, humo/llamas del zombi quemándose,
  partículas de la explosión del creeper.

**E4. Sonido ambiental más rico** (`public/audio.js`):

- Más variedad de pasos por material (ya por material), sonidos de mobs por
  especie (gruñido zombi, siseo creeper, balido oveja, cluck pollo) con
  cooldown, ambiente por bioma (desierto seco vs bosque), sonido de
  flecha/explosión.

### Bloque F — Mundo, generación, ítems y libro de recetas

**F1. Generación de mundo** (`server/world.js`):

- **Minerales por altura** (distribución MC): carbón abundante en
  profundidad media-alta, hierro medio-bajo, oro bajo, diamante solo
  y<16, redstone/esmeralda profundos. Recalibrar `noise2D_ore` + umbrales
  por `y` (hoy probablemente uniforme). Test `unit-mineria`/`unit-mundo`.
- **Playas y arena costera**: transición suave de agua→arena→tierra en los
  bordes de lagos/océano (profundidad gradual, no cortes).
- **Más variedad de árboles**: roble (hoy), abedul (bosque claro),
  pino cónico (montaña/nieve); alturas y copas variadas por ruido. Los
  nuevos bloques de madera (abedul/pino) → recetas y texturas (Bloque E1).
- **Estructuras**: piedras de musgo (bloque `mossy_cobblestone`), pilares
  de piedra, hierba alta decorativa (bloque no sólido), flores
  (amapola/diente de león, bloque no sólido, drop de tinte).
- **Abejas** (decisión del usuario): mob pacífico pequeño que vuela (nueva
  mecánica de movimiento aéreo simple), se posa en flores, suelta miel
  (ítem) — o versión simplificada (ítem de miel del botín de cofres + abeja
  decorativa). Alcance a confirmar en ejecución.
- Tests: `unit-mundo`, `unit-biomas`, `unit-arboles` ampliados.

**F2. Bloques faltantes básicos + ítems** (paridad, `constants.js` AMBOS
lados + `recetas.json`):

- Bloques: escaleras (madera/piedra), losas, vallas y puertas, cristal
  (translúcido) y **cristal tintado**, bloques de mineral (hierro/oro/
  diamante), bloques de lingote.
- **Tintes**: tintes rojo/verde/azul/amarillo/negro/blanco (de flores,
  hueso, lapislázuli...) y **ítems tintables** (lana → lana tintada,
  cristal → cristal tintado, armadura de cuero tintable si el tiempo lo
  permite).
- **Ítems nuevos**: pan, pescado (crudo/cocinado), hueso, flechas, azada
  (240-244), semillas de trigo ya existen, miel.
- Regla AGENTS.md: cada bloque/ítem → AMBOS constants + receta + sync
  (`unit-sync`) + durabilidad (`audit-fase5`) si aplica.

**F3. Diseño de ítems** (`public/ui.js`, `itemIconCss` / atlas):

- **Iconos pixel-art más detallados**: herramientas con mango+cabeza
  metálica, comida con textura (bife con líneas), lingotes con brillo,
  cristal translúcido.
- **Tooltip con info** al pasar el ratón (hotbar/paneles): nombre, tipo,
  durabilidad restante, valor de comida (hambre/saturación), y "se usa
  para: ..." (recetas donde participa, consultando `recetas.json`).

**F4. Libro de recetas** (decisión: todas visibles por categorías):

- Botón "📖 Recetas" en el inventario (o pestaña). Panel con las 41 + 9
  recetas agrupadas por categoría: **Herramientas y armas · Bloques ·
  Decoración · Comida · Miscelánea** (o similar).
- Cada receta muestra: forma 3×3 (o 2×2 del inventario), ingredientes con
  iconos y cantidades, resultado con icono. Para el horno: pestaña
  "Fundición" con entrada→salida.
- Datos: el cliente ya carga `recetas.json`? — verificar; si no, el
  servidor lo envía en el `init` o el cliente lo fetchea (mismo archivo
  estático). Preferencia: **servirlo como estático** (`/recetas.json`) y
  cargarlo en `ui.js` (sin cambios de protocolo).
- Test: `unit-recetas.js` (integridad del JSON para el libro: toda receta
  tiene shape+ingredients+result válidos y su categoría).

---

## 5. Protocolo WS y eventos (resumen de cambios)

| Evento | Dirección | Contenido |
| --- | --- | --- |
| `set_seed` | C→S | `{seed, name, gamemode?}` |
| `world_delete` | C→S | `{seed}` (rechaza si es el activo) |
| `worlds_list` | S→C | añade `gamemode` por mundo |
| `creative_pick` | C→S | `{itemId}` (solo creative) |
| `creative_fly` | C→S | `{enabled}` (solo creative) |
| `arrow_spawn`/`arrow_move`/`arrow_hit` | S→C | proyectiles del esqueleto |
| `mob_fuse` (creeper) | S→C | `{mobId, stage}` para la animación de siseo |
| `init` | S→C | añade `gamemode` del mundo |

Todos los eventos en `snake_case` (convención).

---

## 6. Archivos implicados (por bloque)

| Archivo | Bloque | Cambio |
| --- | --- | --- |
| `server/save.js` | B | gamemode en buildMeta/loadWorld/listWorlds; `world_delete` helper (borrado seguro) |
| `server/constants.js` | B,C,F | `worldGamemode`, SCHEMA_VERSION 3, durezas MC, espada no mina, nuevos bloques/ítems, azadas |
| `server/net.js` | A,B,C,D,F | set_seed con gamemode, world_delete, creative_pick/fly, arrows, fuse, init+gamemode |
| `server/players.js` | C | hambre/regeneración, XP curva, farming, dormir salta noche |
| `server/mobs.js` | D | IA por especie + pasivos |
| `server/world.js` | F | minerales por altura, playas, árboles, estructuras, flores/abejas |
| `server/crafting.js` | C,F | nuevas recetas (3×3 y horno) |
| `public/constants.js` | B,C,F | paridad (bloques/ítems/durabilidad) |
| `public/input.js` | A,D | telemetría de minería, clic sobre mob vs bloque, vuelo creativo |
| `public/player.js` | A,C | vuelo, correr (hambre) |
| `public/world.js` | A,E,F | texturas por cara, agua animada, partículas, nuevos bloques |
| `public/textures.js` | E,F | texturas por cara, nuevos bloques, cristal |
| `public/ui.js` | B,C,F | selector de modo, botón 🗑️, badge de modo, libro de recetas, tooltips, inventario creativo |
| `public/index.html` | B,F | UI del menú de mundos, panel de libro, tooltip |
| `public/audio.js` | E | sonidos por especie/bioma |
| `public/mobs.js` | D,E | estados nuevos (fuse, flee, sleep), flechas, abejas |
| `public/settings.js` | — | sin cambios previstos |
| `tests/unit-*.js` | todos | tests por bloque + `unit-sync` + `audit-fase5` actualizados |
| `TODO.md` | G | plan y documentación final |

---

## 7. Decisiones del usuario (registro de la entrevista)

### Ronda 1 — Minería (crítica)

1. **Síntoma**: "el clic no hace nada" en el navegador (ni grietas ni
   rotura) → **diagnóstico necesario**; no es un problema de drops.
2. **Drop a mano**: **regla MC estricta** — la mano NO dropea piedra ni
   minerales; madera/tierra/arena sí (mantener `canHarvest`).
3. **Items en el suelo**: **NO** — los drops siguen yendo directos al
   inventario (no se implementan entidades de item en esta fase).

### Ronda 2 — Gamemode y mundos

1. **Gamemode**: **fijo por mundo** — el modo del mundo aplica a TODOS los
   que entran; se persiste en `world.json`.
2. **Migración**: los mundos existentes sin el campo → **survival** por
   defecto (se muestra en el menú).
3. **Eliminar mundos**: botón 🗑️ + **confirmación simple**; **no se puede
   borrar el mundo activo**.
4. **Modo al crear**: **selector + botón Crear** ("Crear en Supervivencia" /
   "Crear en Creativo").

### Ronda 3 — IA y paridad (todo marcado)

1. **IA hostil**: esqueleto dispara flechas · creeper explota cerca ·
   zombi arde de día · araña escala y salta · persecución mejorada.
2. **IA pacífica**: huir al ser golpeados · deambular más natural ·
   volver al rebaño · dormir de noche.
3. **Paridad**: hambre/regeneración completa · herramientas correctas +
   durezas MC · recetas más fieles · XP/niveles estilo MC · bloques
   faltantes básicos.
4. **Estética**: texturas de bloques más fieles · agua animada · más
   partículas y efectos · sonido ambiental más rico.

### Ronda 4 — Libro, supervivencia, creativo, prioridad

1. **Libro de recetas**: **todas visibles por categorías** (sin desbloqueo
   progresivo).
2. **Supervivencia**: plantar y cultivar · cocinar más alimentos · dormir
   salta la noche. (Armadura/durabilidad ya cubiertas.)
3. **Creativo**: inventario creativo completo · vuelo. (Rotura instantánea
   ya existe.)
4. **Prioridad global**: **todo en orden por bloques** (A: bugs, B:
   mecánicas, C: IA, D: estética, E: mundo, F: ítems/libro) ejecutando por
   bloques hasta donde llegue la fase.

### Ronda 5 — Mundo, diagnóstico, ítems

1. **Diagnóstico de minería**: **ambos** — telemetría en vivo + revisión
   del flujo completo, con verificación E2E en navegador si está disponible.
2. **Inventario creativo**: **reset al entrar** — en un mundo creativo el
   inventario no se persiste; al entrar se entrega el inventario creativo
   completo.
3. **Mundo/generación**: más estructuras (piedras de musgo, pilares,
   hierba alta) · minerales por altura · playas y arena costera · más
   variedad de árboles · **hierba, flores y abejas**.
4. **Ítems**: iconos pixel-art más detallados · tooltip con info · nuevos
   ítems · **cristal y tintes** (con los ítems tintables).

---

## 8. Plan de la Fase 9 (orden de ejecución)

### Bloque A — Minería funcional (crítico)
1. Telemetría `window.__mcMiningTrace` / `__mcRaycastStats` + helper debug.
2. Revisión del flujo completo (hipótesis: raycast con mobs delante / orden
   de actualización de matrices / pointer lock).
3. Fix + test de regresión con three real + verificación E2E en navegador.
4. Actualizar `TODO.md` (Bugs conocidos).

### Bloque B — Modo de juego por mundo + eliminar mundos
1. `worldGamemode` en constants + buildMeta/loadWorld/switchWorld/listWorlds
   + SCHEMA_VERSION 3 + migración (survival default) + test persistencia.
2. init con gamemode + HUD/F3.
3. Inventario creativo: reset al entrar + entrega del inventario completo.
4. Selector de modo en el menú + `set_seed` con gamemode.
5. `world_delete` (servidor seguro + UI con confirmación) + test.
6. Badge de modo en la lista de mundos.

### Bloque C — Paridad de mecánicas
1. Hambre/regeneración (correr) + test.
2. Herramientas correctas/durezas MC (espada no mina) + test.
3. Recetas fieles + test.
4. XP/niveles curva MC + HUD + test.
5. Creativo: inventario completo + vuelo + test.
6. Supervivencia: cultivos + azada, cocinar más, dormir salta la noche +
   tests.

### Bloque D — IA de mobs
1. Esqueleto (flechas) + creeper (fuse/explosión) + tests.
2. Zombi (arde) + araña (escala/salta) + tests.
3. Persecución mejorada + tests.
4. Pacíficos: huida, deambular, rebaño, dormir + tests.

### Bloque E — Estética
1. Texturas por cara + bloques nuevos.
2. Agua animada.
3. Partículas y efectos.
4. Sonido ambiental más rico.

### Bloque F — Mundo, ítems y libro
1. Minerales por altura + playas + árboles variados + estructuras +
   hierba/flores/abejas + tests.
2. Bloques/ítems nuevos (cristal, tintes, azadas, pan, pescado, hueso...) +
   sync.
3. Iconos detallados + tooltips.
4. Libro de recetas por categorías + test.

### Bloque G — Verificación final
1. Suite unitaria completa + E2E contra servidor vivo + auditorías.
2. biome check 0 errores (server+public+tests).
3. Documentar en `TODO.md` (Fase 9 cerrada + Bugs conocidos).
4. Commit final por bloques (formato `Fase 9 (X): resumen`).

---

## 9. Riesgos y notas

- **Raycast con mobs multibloque (A)**: el fix de B9 (`recursive=true` +
  `mobRootData`) puede hacer que el mob "robe" el clic al bloque que tiene
  detrás. La decisión de diseño: si el clic da en un mob, ataca al mob (como
  MC: el mob está delante); si el usuario apunta al bloque, debe apuntar
  donde no haya mob. Confirmar con el test de three real y documentar.
- **SCHEMA_VERSION 3 (B)**: subir versión exige migración retrocompatible y
  test (modelo `unit-persistencia.js`); mundos v2 abren como survival.
- **Vuelo creativo vs anti-cheat**: el servidor debe aceptar `y` libre en
  creative sin activar el límite de velocidad; revisar que el vuelo no
  permita salir del mundo (void) sin el respawn.
- **Flechas como entidad**: nueva entidad con física simple (gravedad,
  colisión por distancia); mantenerla ligera y con límite de vida. Es el
  primer proyectil del juego: decidir entre broadcast por tick o integrado
  en `mobs_update`.
- **Alcance**: la Fase 9 es grande; los bloques son independientes y
  ejecutables por separado. Si la fase se queda corta, el orden de
  prioridad es A → B → C → D → E → F → G (el usuario pidió "todo en orden
  por bloques").
- **Cristal/tintes**: requieren transparencia en el render (el cristal ya
  tiene color 17 en el cliente, verificar que el bloque de cristal
  traslúcido funciona con el render actual) y sync de constantes.
- **Abejas**: alcance a confirmar en ejecución (mob volador simple +
  miel); si el vuelo de mobs es demasiado, versión decorativa (miel en
  cofres de loot).

---

## 10. Criterios de aceptación globales de la Fase 9

1. **Minería**: se puede minar con el clic en el navegador (grietas,
   rotura, drop según `canHarvest`), con test de regresión de three real y
   telemetría de diagnóstico disponible en `window.__mc*`.
2. **Gamemode por mundo**: el modo se elige al crear, se persiste en
   `world.json`, se muestra en el menú y en el HUD, y aplica a todos los
   jugadores; mundos antiguos abren como survival; en creative el
   inventario se resetea al entrar y se entrega el inventario completo.
3. **Eliminar mundos**: botón 🗑️ con confirmación; el mundo activo no se
   puede borrar; el servidor solo borra directorios de `world/` con nombre
   de semilla validado.
4. **Paridad**: la espada no mina, cada categoría usa su herramienta, las
   durezas se acercan a MC, la curva de XP no es lineal, comer/regenerar
   siguen la lógica MC, dormir de noche salta al amanecer.
5. **IA**: cada hostil tiene su comportamiento (flechas, explosión, quema,
   escalada) y cada pasivo el suyo (huida, deambular, rebaño, dormir),
   cubiertos por tests.
6. **Estética**: texturas por cara, agua animada, partículas y sonidos
   ambientales nuevos, sin degradar el rendimiento de los tests de LOD.
7. **Mundo**: minerales por altura, playas suaves, árboles variados,
   estructuras y hierba/flores/abejas, con tests de generación.
8. **Ítems/libro**: iconos detallados, tooltips informativos, cristal +
   tintes + ítems tintables, libro de recetas por categorías con todas las
   recetas visibles.
9. **Verificación**: `node tests/run.js --unit` exit=0, E2E contra servidor
   vivo exit=0, biome 0 errores, `node --check` en todo, y Fase 9
   documentada en `TODO.md`.
