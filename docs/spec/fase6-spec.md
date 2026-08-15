# Fase 6 — Mundo jugable y pulido (Spec)

> **Estado:** `[COMPLETADA]`

> Documento de especificación de la Fase 6, **reconstruido a posteriori**: la
> fase está COMPLETADA y auditada. Se elabora a partir del `TODO.md` (sección
> Fase 6 con su auditoría) y del historial de git, en el mismo formato que
> `fase8-spec.md` / `fase9-spec.md`.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA (agosto 2026)** · Proyecto: clon de
> Minecraft (servidor Node autoritativo `server/` + cliente Three.js
> `public/`, todo en español).

---

## 1. Resumen

La Fase 6 es la más grande hasta la fecha: convierte las mecánicas básicas en
una experiencia **más fiel a Minecraft**, priorizando el feedback del usuario
(features nuevas). El pulido que la sobrecargaba (texturas, rendimiento,
supervivencia, multijugador visible y audio) se movió a la **Fase 7**. Seis
áreas:

1. **Minería y herramientas**: dureza por bloque, velocidad según la
   herramienta correcta y sesión de minería con grietas; verificación de que
   las 20 herramientas se obtienen en juego.
2. **IA de mobs**: quema solar de no-muertos, spawn solo de noche y en todo
   el mapa cargado.
3. **Mundo y sesión**: semilla seleccionable, pantalla de carga, cofre,
   antorchas con iluminación dinámica.
4. **Herramientas de desarrollo**: consola de comandos, visualizador F3,
   hot-reload de recetas/texturas.
5. **Rendimiento en cliente**: frustum culling, LOD simple y pool de
   geometrías.
6. **Supervivencia y terreno**: cama + respawn, armadura básica, minas
   abandonadas con loot, pozos de agua/lava y guardado comprimido (gzip).

**Resultado:** auditoría en verde: el LOD reduce la geometría un 58% y la
memoria un 55%, multiplica por ~4.5 el rendimiento en el anillo lejano (100.5
vs 24.3 FPS de mediana) y el pool reutilizó 91 de 174 geometrías en sesión
real.

---

## 2. Contexto del proyecto (estado al inicio, verificado)

Tras las Fases 1-5 (cimientos, sensorial, supervivencia, terreno,
progresión/combate):

- Hay texturas, sonido, hambre, comida, cría, cuevas, agua, biomas, mobs con
  durabilidad y XP.
- **Pero la minería es instantánea** (clic = rotura al momento), la IA de
  mobs no distingue día/noche ni se quema con el sol, no hay forma de
  seleccionar semilla ni pantalla de carga, no hay almacenamiento (cofres),
  no hay luz por bloque (antorchas), no hay comandos de desarrollo, y el
  cliente renderiza todos los chunks con geometría completa (sin culling,
  LOD ni pool).

---

## 3. Objetivos

1. Minería con durezas, herramientas correctas y sesión de progreso con
   grietas; las 20 herramientas obtenibles en juego.
2. IA hostil más fiel: quema solar (zombi/esqueleto), spawn solo de noche y
   en todo el área cargada.
3. Semilla seleccionable, pantalla de carga, cofres y antorchas con
   iluminación dinámica por bloque.
4. Consola de comandos, visualizador F3 y hot-reload de recetas/texturas.
5. Frustum culling, LOD y pool de geometrías (rendimiento).
6. Cama, armadura, minas abandonadas, pozos de agua/lava y gzip.

---

## 4. Bloques de trabajo

### Minería y herramientas

- **Minería afinada** (`server/mining.js`): `BLOCK_HARDNESS` (segundos a
  mano), `TOOL_TIER_SPEED` (madera 2×, piedra 4×, hierro 6×, oro 12× —rápida
  pero frágil—, diamante 8×) y categorías de bloque con su herramienta (pico
  → piedra/minerales, hacha → tronco, pala → tierra/arena/nieve) →
  `breakSeconds(tool, block)`.
- **Sesión de minería**: `block_action break` inicia una sesión que el bucle
  principal avanza por ticks (TICK_MS) y comunica las fases 0-9 con
  `block_break_progress` (grietas). Se cancela con `break_cancel`, si el
  bloque cambia o si el jugador se aleja (>7 bloques).
- **Drop condicional** (`canHarvest`): piedra/minerales solo sueltan drop con
  pico; con la herramienta equivocada o a mano se rompe igual (lento) pero
  sin drop ni XP.
- Cliente: mantiene el clic para minar (mouseup o mirar a otro bloque
  cancela, con retarget automático) y pinta el overlay de grietas.
- **Verificación de obtención** de las 20 herramientas: la cadena completa es
  alcanzable (tronco → planks → palos → pico de madera → adoquín → horno/pico
  de piedra → minerales → lingotes → herramientas de hierro/oro; diamante se
  mina directo). Cubierto por la sección "cadena de obtención" de
  `tests/unit-recetas.js`.

### IA de mobs

- **Quema solar**: los no-muertos (`BURNS_IN_SUN`) arden de día — 1 HP/s si
  están expuestos al cielo (sin bloque sólido entre la cabeza y
  `WORLD_HEIGHT`; techos/árboles dan sombra). El flag `burning` viaja en
  `mobs_update` y el cliente tiñe al mob en llamas. Morir por el sol no
  suelta drop ni XP (no pasa por `attack_mob`).
- **Spawn**: solo pasivos de día; de noche también hostiles, en CUALQUIER
  chunk cargado del área de render, nunca a <24 bloques del jugador y nunca
  sobre lagos.

### Mundo y sesión

- **Semilla seleccionable**: campo en el menú → `set_seed` →
  `save.switchWorld(seed)` (persiste el mundo actual, limpia estado,
  re-seeda el ruido, carga/genera `world/<semilla>/`); solo si el jugador es
  el único en línea; el inventario/salud/XP no viajan entre mundos.
- **Pantalla de carga** (`public/loading.js`): fondo de tierra procedural en
  CSS, panel estilo Minecraft, barra con rayas animadas y consejos
  rotatorios; mínimo visible de 700 ms; "Conexión perdida" con Reintentar.
- **Cofre** (`B.CHEST = 22`): 27 slots (3×9), crafteable con 8 tablones;
  `chests.js` mantiene el estado (persistido en `world.json`); eventos
  `chest_open` (distancia ≤7) y `chest_action` (put/take/close); al romperlo
  se pierde el contenido (simplificación documentada).
- **Antorchas** (`B.TORCH = 23`): no sólidas, dureza 0.1, receta 1 carbón + 1
  palo → 4; reglas de soporte (`torchSupported`/`cleanUnsupportedTorches`);
  iluminación por bloque (`public/lighting.js`): BFS 6-direccional con
  atenuación 0.8/paso y radio 7, color por vértice horneado por chunk.

### Herramientas de desarrollo

- **Consola de comandos** (`server/commands.js`): `/help`, `/tp <x> <y> <z>`
  (corrige la Y, envía chunks del área nueva), `/give <item> [cantidad]`,
  `/time set <day|noon|night|midnight|ms>` (ajusta `state.timeOffset` +
  broadcast `time_set`) y `/gamemode <creative|survival>` (sin hambre, sin
  daño, minería instantánea sin desgaste ni drops). Acceso abierto a todos
  (la auth está fuera de alcance; la Fase 8 añadirá el gate de operador).
- **Visualizador F3** (`public/debug.js`): grid rojo de chunks + panel con
  FPS, posición, chunks visibles/totales (culling), caras y triángulos.
- **Hot-reload** (`crafting.reloadRecipes`/`watchRecipeFiles`): swap atómico
  de `recetas.json`/`recetas_horno.json` con debounce y broadcast
  `textures_reload`; el atlas del cliente se reimporta con cache-busting.
  `/reload` a petición.

### Rendimiento en cliente

- **Frustum culling**: una esfera envolvente por chunk (margen 1.05×) y
  `applyFrustumCulling(camera)` por frame; HUD con visibles/totales.
- **LOD** (`public/lod.js`): `lodTierFor` con histéresis (LOD a >56 bloques,
  full a <44; banda intermedia conserva el tier); `buildLodGeometry` genera
  un quad superior por columna + muros laterales donde el vecino es más bajo
  (~256 quads/chunk). `rebuildChunk` elige tier, `updateLod()` (throttle 250
  ms) hace el swap.
- **Pool de geometrías** (`public/geopool.js`): pool POR CATEGORÍA
  (terrain/water/lod) con tope; `setOrReuseAttribute` reutiliza el array (y
  el buffer GPU) cuando el tamaño coincide. (Nota: el fix de bounds de la
  Fase 8 B3 vive en este módulo.)

### Supervivencia (cerrar el loop)

- **Cama** (`B.BED = 24`): dormir de noche salta al amanecer
  (`state.timeOffset` + `time_set`), fija `respawnPoint` en el bloque y
  responde `sleep_ok`; de día `sleep_rejected`. Al romperla se limpia el
  respawn.
- **Armadura básica** (cuero, hierro, diamante; 12 ítems 220-231):
  `ARMOR_DAMAGE_REDUCTION` por pieza (tope total 0.8), `ARMOR_DURABILITY`,
  4 slots (`p.armor`), `equip_armor`/`unequip_armor`, desgaste (-1 por cada 4
  de daño bruto), 12 recetas estilo Minecraft, cuero como drop de vaca/conejo.

### Terreno

- **Minas abandonadas**: dos familias de túneles horizontales modeladas como
  bandas finas alrededor de las curvas de nivel (`MS_BAND = 0.055`), con
  puerta de región (`MS_REGION_GATE = 0.25`) y profundidad RELATIVA a la
  superficie (`below` 3-9 bloques). Se excavan solo celdas de piedra, nunca
  rompen superficie ni bedrock. Cofres de loot deterministas (`msLootSpot`,
  ~0.6% de celdas) con loot en `chests.js` `lootSlots()`.
- **Pozos de agua/lava** decorativos (1 bloque, lecho de arena debajo):
  umbrales CALIBRADOS por barrido (agua ~1.05%, lava ~0.42% de columnas); el
  calibrado original nunca generaba nada. Nuevo bloque `B.LAVA = 25` (no
  sólido, no minable, material con emissive; daño por contacto 2 HP/500 ms).
- **Compresión gzip** del guardado por chunk (`zlib.gzipSync`, ~20×; cabecera
  gzip detectable al leer; mundos viejos en JSON plano siguen leyéndose sin
  migración).

### Auditoría de Fase 6

Medir FPS con LOD activo (comparar caras/triángulos con y sin LOD) y revisar
la memoria del cliente.

---

## 5. Protocolo WS y eventos (introducidos aquí)

| Evento | Dirección | Contenido |
| --- | --- | --- |
| `block_action {break}` | C→S | inicia sesión de minería (`server/mining.js`) |
| `block_break_progress` | S→C | fases 0-9 de la grieta (+ `break_cancel`) |
| `set_seed` | C→S | `{seed}` (cambiar de mundo) |
| `worlds_list` | S→C | lista de mundos por semilla |
| `chest_open` / `chest_action` / `chest_state` | C↔S | cofres (put/take/close) |
| `sleep` / `sleep_ok` / `sleep_rejected` | C↔S | dormir en la cama |
| `time_set` | S→C | re-sincroniza el ciclo (comandos y dormir) |
| `textures_reload` | S→C | hot-reload del atlas |
| `chat` | C→S | comandos (empiezan por `/`) |

Todos en `snake_case` (convención del proyecto).

---

## 6. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/mining.js` | (nuevo) sesión de minería por ticks |
| `server/commands.js` | (nuevo) `/help /tp /give /time /gamemode` |
| `server/chests.js` | (nuevo) cofres + loot |
| `server/world.js` | semilla por directorio, minas abandonadas, pozos, lava, antorchas (soporte) |
| `server/save.js` | `switchWorld`, persistencia de cofres, gzip |
| `server/mobs.js` | quema solar, spawn por fase del día y por distancia |
| `server/constants.js` | `BLOCK_HARDNESS`, `TOOL_TIER_SPEED`, `B.CHEST/TORCH/BED/LAVA`, minas/pozos |
| `server/crafting.js` | hot-reload de recetas |
| `server/net.js` | broadcast de progreso, `set_seed`, comandos, `time_set` |
| `public/loading.js` | (nuevo) pantalla de carga |
| `public/lod.js`, `public/geopool.js`, `public/lighting.js`, `public/debug.js` | (nuevos) LOD, pool, luz por antorcha, visualizador F3 |
| `public/world.js` | culling, LOD/pool, luz por vértice, cofres/antorchas/cama/lava en cliente |
| `public/input.js` | clic sostenido para minar, retarget, F3 |
| `public/ui.js`, `public/index.html` | semilla en el menú, paneles de cofre/horno/armadura |
| `public/constants.js` | paridad de bloques/constantes |
| `tests/unit-mineria.js`, `unit-recetas.js`, `unit-mobs-ia.js`, `unit-persistencia.js`, `unit-cofre.js`, `unit-antorchas.js`, `unit-commands.js`, `unit-reload.js`, `unit-lod.js`, `unit-geopool.js`, `unit-cama.js`, `unit-armadura.js`, `unit-terreno.js`, `audit-fase6.js` | cobertura y auditoría |

> **Tests que cubren esta fase:** `tests/unit-mineria.js`, `tests/unit-recetas.js`, `tests/unit-mobs-ia.js`, `tests/unit-persistencia.js`, `tests/unit-cofre.js`, `tests/unit-antorchas.js`, `tests/unit-commands.js`, `tests/unit-reload.js`, `tests/unit-lod.js`, `tests/unit-geopool.js`, `tests/unit-cama.js`, `tests/unit-armadura.js`, `tests/unit-terreno.js`, `tests/audit-fase6.js`.

---

## 7. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|
| 1 | Minería | Sesión por ticks con grietas; drop condicional `canHarvest` (pico para piedra/minerales); creative rompe al instante |
| 2 | IA hostil | Spawn solo de noche y a ≥24 bloques; quema solar con sombra |
| 3 | Semillas | Directorio por semilla (`world/<semilla>/`); cambiar de semilla no pisa mundos; solo con un jugador en línea |
| 4 | Rendimiento | Culling + LOD con histéresis + pool por categorías; el LOD no reduce la calidad del render cercano |
| 5 | Cofres | Al romper un cofre se pierde el contenido (simplificación documentada) |
| 6 | Comandos | Acceso abierto a todos (herramienta de desarrollo); la Fase 8 añade gate de operador |

---

## 8. Plan de la Fase 6 (orden de ejecución)

1. Minería fina + verificación de las 20 herramientas.
2. IA hostil (quema solar + spawn).
3. Mundo y sesión: semilla, carga, cofre, antorchas.
4. Herramientas de desarrollo: comandos, F3, hot-reload.
5. Rendimiento: culling, LOD, pool.
6. Supervivencia: cama, armadura.
7. Terreno: minas, pozos, gzip.
8. Auditoría (FPS/LOD/memoria).

---

## 9. Riesgos y notas

- **La minería por sesión rompe lo instantáneo**: todo flujo que asuma rotura
  al momento (E2E de durabilidad, tests) se actualizó al nuevo ritmo.
- **LOD y culling interactúan**: el frustum culling, `unloadChunks`, el
  hot-reload y el F3 deben cubrir los dos mapas (full + LOD).
- **Antorchas e iluminación**: el horneado de luz por chunk se re-dispara en
  el vecindario 3×3 al colocar/romper una antorcha (`rebuildAround`).
- **Determinismo**: cualquier nueva generación (minas, pozos) debe ser
  continua entre chunks y determinista con la semilla (tests de costuras).
- El bug de la Fase 8 (B6) demostró que LOD y pool comparten una dependencia
  oculta (bounds cacheados); el pool debe nullear bounds al liberar.

---

## 10. Criterios de aceptación + resultado verificado

1. Minería con durezas, herramienta correcta y grietas; sin drops sin
   herramienta adecuada.
2. Zombis/esqueletos arden de día; hostiles solo de noche a ≥24 bloques.
3. Semilla por mundo, carga, cofres, antorchas con luz por bloque.
4. Comandos, F3 y hot-reload funcionando.
5. Culling + LOD + pool sin regresión visual y con mejora medible.
6. Cama, armadura, minas con loot, pozos y guardado gzip.

**Estado: COMPLETADA.** Auditoría (agosto 2026, `tests/audit-fase6.js`
11/11 + medición real en Chrome headless): con LOD, 136 chunks en LOD + 33
full en el área de render (los conteos del cliente coinciden exactamente);
triángulos 234K CON LOD vs 560K sin (reducción del 58%); memoria de geometría
22.8 MB vs 51.2 MB (ahorro 55%). FPS: CON LOD → media 100.5 (estable 136.5,
min 52), ~94K triángulos, heap 48 MB; SIN LOD → media 24.3 (estable 30, min
16), ~209K triángulos, heap 85 MB. Pool: reutilizó 91 de 174 geometrías
(55%) en sesión real. Determinismo LOD bit-idéntico entre regeneraciones.

---

## Cierre de la fase

- **Fecha de cierre:** 2026-08-04
- **Commits clave:**
  - `4b5dc69` (2026-08-02) — consola de comandos y frustum culling.
  - `fcc82c0` (2026-08-02) — mundo jugable y pulido: carga, semilla, F3 y terreno.
  - `aad6e18` (2026-08-02) — cierre: hot-reload, minería fina, LOD, pool y auditoría.
  - `fb9c12b` (2026-08-03) — cofre y antorchas con iluminación dinámica + servidor en `server/`.
  - `07423c0` (2026-08-04) — cama y armadura.
  - `35a4c8a` (2026-08-04) — minas abandonadas, pozos de agua/lava y guardado gzip.
- **Resultado de la auditoría:** `tests/audit-fase6.js` 11/11 + medición real en Chrome headless: LOD reduce la geometría un 58% (234K vs 560K triángulos) y la memoria un 55% (22.8 vs 51.2 MB); FPS de mediana 100.5 con LOD vs 24.3 sin LOD (~4.5×); pool reutilizó 91 de 174 geometrías (55%) en sesión real; determinismo LOD bit-idéntico entre regeneraciones.
- **Lagunas conocidas / decisiones diferidas:** al romper un cofre se pierde el contenido (simplificación documentada); comandos con acceso abierto a todos — el gate de operador llega en la Fase 8; bounds cacheados en el pool (dependencia oculta LOD/pool, corregido en la Fase 8 B6).

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-06: creación del spec (documento retrospectivo de la Fase 6).

**Cambios en esta spec (v2):**
- 2026-08-15: reorganización de docs — spec movida a `docs/spec/`, referencias de rutas actualizadas, etiqueta de estado `[COMPLETADA]` y bloque de cierre con commits.
