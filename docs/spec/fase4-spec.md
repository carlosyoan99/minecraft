# Fase 4 — Profundidad de terreno (Spec)

> **Estado:** `[COMPLETADA]`

> Documento de especificación de la Fase 4, **reconstruido a posteriori**: la
> fase está COMPLETADA y auditada. Se elabora a partir del `TODO.md` (sección
> Fase 4 con su auditoría) y del historial de git, en el mismo formato que
> `fase8-spec.md` / `fase9-spec.md`.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA (agosto 2026)** · Proyecto: clon de
> Minecraft (servidor Node autoritativo `server/` + cliente Three.js
> `public/`, todo en español).

---

## 1. Resumen

La Fase 4 da **profundidad al terreno**: el mundo deja de sentirse macizo y
plano. Tres bloques de trabajo:

1. **Cuevas 3D** — ruido 3D que excava la piedra con túneles conexos,
   deterministas y continuos entre chunks.
2. **Bloque de agua + lagos** — agua no sólida con física de flotación para
   el jugador y lagos generados por ruido 2D.
3. **Más biomas** — nieve (tundra) y montaña, con elevación de terreno y
   nuevo bloque `B.SNOW`.

**Resultado:** la fase se cerró con auditoría en verde (culling 4/4 checks,
generación 1.91 ms/chunk, 125 FPS de mediana en Chrome headless con 223
chunks) y destapó un **bug crítico de render** que ningún test de servidor
podía ver (ver §9).

---

## 2. Contexto del proyecto (estado al inicio, verificado)

Tras las Fases 1-3 (cimientos, sensorial, supervivencia):

- El mundo se genera con biomas (llanura, bosque, desierto), se ve con
  texturas y tiene bucle de supervivencia.
- **Pero el terreno es macizo y plano**: sin cuevas, sin agua y con pocos
  biomas; la minería solo encuentra piedra maciza.

**Problemas que motivaban la fase:** no hay variedad subterránea (ni cuevas
ni minerales en contexto), no hay agua que limite la exploración, y los
biomas planos no invitan a explorar.

---

## 3. Objetivos

1. Cuevas 3D con túneles conexos (no "queso suizo"), deterministas y sin
   costuras entre chunks, protegiendo bedrock y superficie.
2. Agua como bloque no sólido con flotación; lagos generados de forma
   calibrada.
3. Biomas nieve y montaña con elevación real del terreno y nuevo bloque de
   nieve.
4. Auditoría de culling de caras, generación en tiempo real y FPS.

---

## 4. Bloques de trabajo

### B1. Cuevas 3D

- Dos octavas 3D sembradas con la misma semilla (`noise3D_cave` /
  `noise3D_cave_fine`) en **coordenadas de mundo** (continuas entre chunks y
  deterministas bajo tierra).
- `isCaveBlock()` usa ruido **"ridged"** (1−|n|) ponderado con
  `CAVE_THRESHOLD = 0.84`, **calibrado por barrido empírico** (~9-14% del
  subsuelo excavado; túneles conexos, sin queso suizo).
- Solo se excava piedra (`y > 1 && y < height - 2`): se protegen el bedrock y
  los 2 bloques superiores (sin huecos en superficie).
- Los minerales no se generan dentro de cuevas.
- Hook `setDiskLoader` para forzar generación fresca en tests.

### B2. Agua y lagos

- Bloque `B.WATER = 20` **no sólido** (`isSolidBlock` en servidor y cliente;
  `NOT_MINEABLE` → no se rompe a mano; sin cubo no se coloca).
- Lagos con ruido 2D (`noise2D_lake`, `LAKE_THRESHOLD = 0.65` calibrado a
  ~5% de columnas; `SEA_LEVEL = 5`, `LAKE_FLOOR = 2`): la columna se hunde,
  piedra bajo el fondo, arena en el lecho y agua hasta `SEA_LEVEL` (sin aire
  bajo el agua).
- Física del cliente (`public/player.js`): flotación con gravedad reducida,
  hundimiento lento limitado, espacio para nadar hacia arriba y velocidad
  horizontal reducida.
- Render: material translúcido aparte (`DoubleSide`, `renderOrder 1`) con
  culling adaptado (sólidos visibles a través del agua; el agua solo se
  dibuja contra aire).

### B3. Biomas nieve y montaña

- `getBiome` devuelve `mountain` (ruido 2D propio `noise2D_mountain`,
  `MOUNTAIN_THRESHOLD = 0.45`, ~19% del mundo) y `snow` (temperatura <
  `SNOW_TEMP = -0.3`), además de los existentes.
- Las montañas elevan el terreno (base 12 + octava de crestas, alturas hasta
  26 frente a 14 máximas de llanuras); su superficie es roca o nieve
  (`MOUNTAIN_SNOW_LINE = 18`, calibrado a ~58% de cumbres nevadas).
- La tundra tiene superficie de nieve.
- Nuevo bloque `B.SNOW = 21` (sólido, rompible a mano, colocable, tesela
  propia en el atlas), **sincronizado** entre servidor y cliente.

### B4. Auditoría de Fase 4

Confirmar que las cuevas no generan huecos visuales en el culling de caras y
que la generación en tiempo real no degrada el FPS.

---

## 5. Fuentes de verdad sincronizadas (introducidas aquí)

- `B.WATER = 20`, `B.SNOW = 21`, `SEA_LEVEL`, `LAKE_FLOOR`, `WORLD_HEIGHT` en
  AMBOS `constants.js` — los audita `tests/unit-sync.js`.
- **Regla de isSolidBlock**: `id !== AIR && id !== WATER` (servidor y
  cliente); el agua no es sólida (los mobs se hunden, ver notas del revisor
  abajo).

---

## 6. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/world.js` | cuevas 3D, lagos, biomas nieve/montaña, `findSpawn` lake-aware, `setDiskLoader` |
| `server/constants.js` | `CAVE_THRESHOLD`, `LAKE_THRESHOLD`, `SEA_LEVEL`, `LAKE_FLOOR`, `SNOW_TEMP`, `MOUNTAIN_THRESHOLD`, `B.SNOW`, `NOT_MINEABLE` |
| `server/net.js`, `server/players.js` | spawn inicial y respawn lake-aware |
| `public/constants.js` | paridad (WATER, SNOW, constantes de mundo) |
| `public/player.js` | flotación (gravedad reducida, nadar) |
| `public/world.js` | material de agua translúcido + culling adaptado, tesela de nieve |
| `public/textures.js` | tesela de nieve |
| `tests/unit-mundo.js`, `tests/unit-biomas.js`, `tests/unit-spawn.js`, `tests/unit-mobs-agua.js`, `tests/audit-fase4.js` | cobertura y auditoría |

> **Tests que cubren esta fase:** `tests/unit-mundo.js`, `tests/unit-biomas.js`, `tests/unit-spawn.js`, `tests/unit-mobs-agua.js`, `tests/audit-fase4.js`.

---

## 7. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|
| 1 | Cuevas | Ruido 3D "ridged" con umbral calibrado; sin minerales dentro; sin huecos en superficie (salvo las bocas añadidas en Fase 7) |
| 2 | Agua | No sólida, no minable, no colocable sin cubo; flotación en cliente; render translúcido |
| 3 | Spawn | `world.findSpawn()` busca en espiral la columna firme más cercana si la pedida es un lago (spawn inicial y respawn) |
| 4 | Mobs y agua | `settleOnGround` usa `isSolidBlock`: los mobs se hunden a través de la superficie y descansan en el fondo |
| 5 | Montañas | Alturas hasta 26, roca/nieve en cumbres, tundra nevada |

---

## 8. Plan de la Fase 4 (orden de ejecución)

1. Cuevas 3D (B1).
2. Agua y lagos (B2) + fixes de mobs/spawn derivados del revisor.
3. Biomas nieve/montaña + bloque de nieve (B3).
4. Auditoría de culling, generación y FPS (B4).

---

## 9. Riesgos y notas

- **Bug crítico encontrado por la auditoría**: el refactor de buffers
  separados para el agua movió `pushFace` fuera del bucle de
  `buildChunkGeometry`, pero seguía referenciando `wx/wy/wz` (declarados con
  `const` dentro del bucle) → `ReferenceError` en cada cara → **ningún chunk
  se renderizaba** (`mcChunks: 0` en navegador, con la página funcional). Los
  tests de servidor no podían verlo (no ejercitan el render); solo la
  auditoría en navegador lo destapó. Corregido pasando las coordenadas como
  parámetros a `pushFace(block, fi, target, wx, wy, wz)`.
- **Medición de FPS** requiere servir THREE desde local (`/tmp/three-local`,
  interceptando el importmap vía CDP Fetch) — el CDN externo es
  inalcanzable/lentísimo en esta red.
- **Notas del revisor de la tarea de agua (ambas resueltas):** (1) los mobs
  "caminaban" sobre el agua → se hunden y descansan en el fondo
  (`unit-mobs-agua.js`); (2) el spawn podía aparecer nadando sobre un lago →
  `findSpawn` en espiral (`unit-spawn.js`).

---

## 10. Criterios de aceptación + resultado verificado

1. Cuevas presentes, conexas, deterministas y sin huecos en superficie.
2. Lagos con fondo de arena; el agua no es sólida y se nada en ella.
3. Tundra nevada y montañas altas con cumbres nevadas (bloque SNOW
   sincronizado).
4. Sin regresión de culling ni de FPS.

**Estado: COMPLETADA.** Auditoría (agosto 2026, `tests/audit-fase4.js`):
culling 4/4 checks replicando la regla EXACTA del cliente (0 caras contra
sólido, 0 huecos, agua solo contra aire, lecho del lago visible bajo la
superficie). Generación en tiempo real: 25 chunks frescos en 47.9 ms →
1.91 ms/chunk; ~234K triángulos para radio 4; memoria 16 KB/chunk (1.3 MB
para radio 4). FPS en Chrome headless: 223 chunks / 216,800 triángulos →
mediana 125 FPS, sin errores de consola. Bug crítico `pushFace` corregido
(ver §9) y notas del revisor del agua resueltas.

---

## Cierre de la fase

- **Fecha de cierre:** 2026-08-02
- **Commits clave:**
  - `81cd600` (2026-08-02) — mundo más profundo: cuevas 3D, agua con flotación, biomas nieve/montaña (y fixes de render/mobs/spawn).
- **Resultado de la auditoría:** culling 4/4 checks replicando la regla exacta del cliente; generación 1.91 ms/chunk (25 chunks frescos en 47.9 ms); FPS en Chrome headless con mediana 125 FPS (223 chunks, ~234K triángulos, radio 4) y sin errores de consola; bug crítico `pushFace` corregido y notas del revisor del agua resueltas.
- **Lagunas conocidas / decisiones diferidas:** ninguna documentada.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-06: creación del spec (documento retrospectivo de la Fase 4).

**Cambios en esta spec (v2):**
- 2026-08-15: reorganización de docs — spec movida a `docs/spec/`, referencias de rutas actualizadas, etiqueta de estado `[COMPLETADA]` y bloque de cierre con commits.
