# Fase 14 — Corrección de la auditoría (Spec)

> **Estado:** `[COMPLETADA]`

> Documento de especificación creado a partir de la **auditoría integral del
> 2026-08-08** (errores, rendimiento y paridad con Minecraft). Esa auditoría
> revisó el estado completo del repositorio (HEAD `2ab7bfb` «Fase 13 B1-B6» +
> trabajo sin commitear de la **Fase 12 en curso**: mobs por bioma, templo de
> jungla y naufragio, mascotas y tridente).
>
> Estado: **completada y auditada (2026-08-08)**. Los tres bloques están
> implementados y en verde: A) bugs de la Fase 12 (spawn por bioma +
> `BIOME_SPAWN`, persistencia `SCHEMA_VERSION` 5, tridente contra mobs,
> hop determinista del slime); B) paridad real (drop de menas con `ORE_DROP`,
> tier de pico por mineral, comida/combustible, salud/XP de mobs, creeper =
> `TNT_DAMAGE`); C) rendimiento (un solo raycast por `pointermove`, broadcast
> de `mobs_update` solo si cambia, rebuild de vecinos al completar bordes de
> chunk, luz de antorcha stale con `hasTorchNear` y `sendInit` liviano con
> relleno progresivo del radio). Auditoría de cierre: suite unitaria
> 3666 OK/0 fallos, E2E 4/4 contra servidor vivo, `audit-fase7` (Chrome
> headless/CDP) en verde, `biome check` 0 errores.

---

## 0. Resumen de la auditoría

| # | Categoría | Hallazgo | Gravedad | Ubicación |
|---|-----------|----------|----------|-----------|
| C1 | Bug F12 (sin commitear) | `slime`, `ocelot` y `drowned` **no están en `SPAWN_TYPES`** → el contenido del Bloque A de F12 (división, doma, tridentes) es inalcanzable en partida normal | 🔴 crítica | `server/mobs.js:930-945` `spawnMobs` |
| C2 | Bug F12 (sin commitear) | La persistencia NO guarda `slimeSize/ownerId/sitting` (`buildMeta` solo id/type/x/y/z/health/isBaby/age) → **las mascotas se vuelven salvajes al reiniciar** y atacan a su dueño; `SCHEMA_VERSION` sigue en 4 cuando el spec F12 exige 5 | 🔴 crítica | `server/save.js:54-63` `restoreMobs` |
| C3 | Bug F12 (sin commitear) | El tridente del JUGADOR no daña a los mobs (`tickArrows` solo colisiona contra jugadores) → el arma de la F12 es inútil contra la mayoría de objetivos | 🔴 crítica | `server/mobs.js:tickArrows` |
| P1 | Paridad | El drop de menas: minar `DIAMOND_ORE`/`REDSTONE_ORE`/`EMERALD_ORE` suelta el **bloque** (no fundible) en vez de la gema → diamante/esmeralda **inobtenibles** en supervivencia | 🔴 alta | `server/players.js:129-133` |
| P2 | Paridad | `canHarvest` no exige tier de pico: cualquier pico (incl. madera) mina diamante/hierrro | 🟡 media-alta | `server/constants.js:521-531` |
| P3 | Paridad | Conejo cocinado `8/12.8` en vez de `5/6` (ID119) — copiado del filete | 🟡 media-alta | `server/constants.js:388` |
| P4 | Paridad | El horno no acepta carbón (`FUEL_ITEMS` solo oak_log/planks/stick) | 🟡 media-alta | `server/constants.js:373` |
| P5 | Paridad | `MOB_XP` de esqueleto/enderman/araña `7/9/7` vs `5/5/5` MC | 🟡 media | `server/constants.js:709-711` |
| M1 | Rendimiento | Doble raycast por `pointermove` mientras se mina (highlight + retarget) → 2×`intersectObjects` recursivos hasta 125 Hz | 🟡 alta | `public/input.js:676-699` |
| M2 | Rendimiento | Broadcast `mobs_update` incondicional a 20 Hz (incluso sin cambios) | 🟡 media | `server/net.js:1367` |
| M3 | Render | Caras ausentes en bordes de chunk hasta `updateLod` (el vecino que llega después no dispara `rebuildAround`) | 🟡 media | `public/world.js:1220` |
| M4 | Render | Luz de antorcha stale al romper/colocar bloque no-antorcha junto a borde de chunk | 🟡 baja | `public/world.js:1127-1146` |
| P6 | Paridad | Spider 12 HP vs 16, bee 5 vs 10, enderman 20 vs 40, creeper boom 10 vs 24 | 🟢 baja | `server/constants.js:46-67` |
| M5 | Rendimiento | `sendInit` serializa el área completa por conexión (~2.7 MB con 165 chunks); generación de chunks síncrona en `move` | 🟡 media | `server/net.js:428` |

> Los hallazgos C1-C3 son **regresiones del trabajo Fase 12 sin commitear** (no
> las introdujo HEAD: `2ab7bfb`, que dejó todos los tests en verde). Este spec
> los corrige y cierra la Fase 12 para poder commitearla en verde.

---

## 1. Priorización

Orden de trabajo acordado con la prioridad de cada hallazgo:

| Bloque | Contenido | Hallazgos | Criterio de salida |
|--------|-----------|-----------|---------------------|
| **A — Bugs de la Fase 12 en curso** | Spawn por bioma + SPAWN_TYPES, persistencia (`SCHEMA_VERSION` 5 + migración), tridente contra mobs, determinismo del slime | C1, C2, C3, C4 | Suite `unit-fase12` completa (incl. tests de persistencia), `node tests/run.js --unit` en verde |
| **B — Paridad real** | Drop de menas, tier de pico, comida, combustible, XP de mobs | P1, P2, P3, P4, P5 | `unit-paridad.js` ampliado en verde |
| **C — Rendimiento** | Doble raycast, broadcast de mobs, rebuild de vecinos, luz de antorcha, `sendInit` | M1-M5, M6 | Métricas de F3/`audit-fase7` sin regresión; `unit-mining-click`/`unit-lod` en verde |

El **Bloque A** es prerrequisito: cierra el trabajo Fase 12 sin commitear para
poder commitearlo y da base estable de mobs para los tests de paridad (B) y de
rendimiento (C).

---

## 3. Bloque A — Bugs de la Fase 12 en curso

> Objetivo: hacer el contenido de Fase 12 **realmente jugable y persistido**.
> Fecha real: (a) spawneable por bioma (con `BIOME_SPAWN`), (b) guardable con
> `SCHEMA_VERSION` 5, (c) el tridente sirve, (d) los tests de la Fase 12
> cierran sin pendientes. `node --check` y biome al final.

### A1 — Spawn por bioma (`BIOME_SPAWN`) + `SPAWN_TYPES`

**Problema actual:** la única vía de obtención de mobs es `spawnMobs()`, que
elige el tipo aleatoriamente de `SPAWN_TYPES` (listas de día/noche fijas) y no
incluye a `slime`, `ocelot` ni `drowned`. Además, `isLake` se rechaza en el
bucle (mobs.js:1056) pero **no se factoriza el bioma**; el Witch océano no
puede albergar un drowned.

**Implementación (modelado sobre `docs/spec/fase12-spec.md` §C):**

1. Nueva tabla `BIOME_SPAWN` en `server/mobs.js` que asocia tipos a sus
   condicion bidings de bioma:
   - `slime` → `getBiome(x,z) === "swamp"` (pantano).
   - `ocelot` → `getBiome(x,z) === "jungle"`.
   - `drowned` → columna de agua: `world.columnFloorY(x,z) !== null` (océano o
     río), colocándolo bajo el agua (`wy` = a 1-2 bloques del fondo).
   - `wolf` → `getBiome(x,z) === "taiga"` (espinee nativa de F12).
2. Añadir `BIOME_SPAWN` a los `constructor` usados en `spawnMobs`: si el tipo
   está en `BIOME_SPAWN`, se elige **exclusivamente** dentro de su bioma
   (básicamente: las celdas candidatas del bucle ya se eligen al azar; se
   añade un intento extra o un muestreo previo). Decisión de simplificación
   documentada: el tipo se pre-filta por bioma ANTES de lanzar el intento.
3. Mantener el rechazo de columnas sin bioma (para `drowned` es justo lo
   inverso: solo columnas de agua).
4. (Opcional) agregar `slime` y `drowned` a la lista `night` global como
   tipos posibles cuando el bioma lo permite (`BIOME_SPAWN` amplía los tipos
   base; los de bioma no se intentan fuera de él).

Criterios: en `unit-fase12` (sección C pendiente) se amplía el muestreo para
probar que **en la taiga spawnea un lobo**, **en el pantano un slime**, **en la
jungla un ocelote** y **en una columna de agua un ahogado con `y` bajo el
agua**; y que `BIOME_SPAWN` **no** traspiene el tipo fuera de su bioma.

### A2 — Persistencia + `SCHEMA_VERSION` 5

**Problema actual:** `buildMeta` guarda solo 7 campos por mob; `restoreMobs`
restaura `slimeSize`, `ownerId`, `ownerName` y `sitting` **pero el meta nunca
los lleva**. `SCHEMA_VERSION = 4` aunque la F12 los exige (spec §D).

**Implementación:**

1. `server/save.js` `buildMeta`:
   - guardar por mob también `slimeSize` (solo slimes), `ownerId`, `ownerName`
     y `sitting` (solo si presentes / no-null) en el objeto que ya se mapea.
2. `server/constants.js`: `SCHEMA_VERSION = 5`.
3. `server/save.js` `loadWorld` / migración:
   - Retrocompatible: mundos v4 escriben `ownerId` como `undefined` → el shadow
     leigo como `null`. `restoreMobs` ya lo soporta (`typeof m.ownerId === "string"`).
   - Añadir finn migración v4→v5: si `meta.schemaVersion === 4`, no hay nada que
     hacer por datos (los mobs reaparecen salvajes, correcto porque v4 no
     pudo guardar mascotas). Solo se registrojñ el bump.
4. `server/chests.js`: no cambia (los cofres del templo/naufrragio ya viven en
   `state.chests` que se persisten con `chests` en buildMeta).

Criterios: `tests/unit-persistencia.js` gana un caso: guardar un mundo con 1
lobo `ownerId`, 1 slime `slimeSize=1` (mediano) y reiniciar `loadWorld` →
`state.mobs` restaura `ownerId`/`slimeSize`/`sitting`. (Modelado con el
patrón de `unit-persistencia` en vuelta de `switchWorld`).

### A3 — Tridente que daña a los mobs (jugador y ahogado)

**Problema actual:** `tickArrows` solo itera `players` para colisiones (casa
mob no). El jugador no puede cazar con el tridente; el ahogado tampoco hiere a
los mil super-in-time (valga como dato).

**Implementación:**

1. En el bucle de `tickArrows` (server/mobs.js), tras comprobar jugadores y
   ANTES del barrido de bloques, **comprobar colisión contra mobs vivos**
   (distancia < `ARROW_HIT_DIST` como con jugadores).
   - Fuente del daño: `a.from` puede ser un jugador (uuid) o un mob (uuid de
     mob). Determinar el uuid de origen: si `a.from` está en `players`, el
     daño es del jugador (aviso `source: "mob"`, metadata del lanzador =
     `players.get(a.from).name`); si es un mob, la metadata del mob.
   - Evitar **friendly-fire**: el propio lanzador (jugador) y sus mascotas
     no se dañan; el `from` == `mob.id` no se autolesiona.
   - Aplicar `damagePlayer` (para atacante jugador) o `mob.health -= dmg`
     (para mob target). Reutilizar el mecanismo de `mobHit` por unidad (para
     el feedback `mob_hit` broadcast + knockback).
2. `throwPlayerTrident` (jugador): la flecha `state.arrows` con `kind:"trident"`
   ya la fuerza. En el daño a mobs usar el `damage` de la flecha
   (`TRIDENT_PLAYER_DAMAGE = 8`).
3. Ajuste de la meta del daño: hoy `damagePlayer(p, dmg, {source:"mob", meta:
   {mobType: ...}})`. Si el dispara un **jugador**, el `source` correcto de la
   pantalla de muerte es del tipo de lanzador, no "drowned". Añadir
   `meta.fromName`/`meta.source="player"` cuando el lanzador es jugador.

Criterios: tests en `unit-paridad`/`unit-fase12`: lanzar un tridente contra un
  zombie → el zombie recibe daño (health baja o muere si « sill), y el
  trinchange lanzado por el jugador **no** se lo dañe a sí mismo.

### A4 — Determín knew del hop del slime

**Problema: `tickSlime` usa `Date.now() % 1200` (fase global) → todos los
slimes saltan al mismo ritmo y el movimiento depende de la hora del reloj del
host (los tests de determinismo fallan si se quiere reproducir).

**Implementación:** en `tickSlime` computar la fase del hop por-ask: guardar
`this.slimeHopPhase` al crear (aleatorio entre 0 y 1, o derivable del id) y
`swp contador` para avanzar a velocidad constante con `dtMs` en vez de
`Date.now()`. Evita el acople a `performance.now()` y hace el tick
reproducible. El ritmo sigue siendo ~1.2 s por hop.

---

## 4. Bloque B — Paridad real (valores de MC)

> Prioridad tras estabilizar F12. Cada ítem con su test (extender
> `tests/unit-paridad.js`).

| # | Ítem | Cambio |
|---|------|--------|
| P1 | D(e) drop de menas | En `players.js` `minar`: `DIAMOND_ORE→I.DIAMOND`, `REDSTONE_ORE→I.X EXP` (I.105), `EMERALD→I.EMERALD`. Hierro/oro/coal sigueny {O blend} (la mena de hierro/oro se fundious; carbón y, por tanto, hierro→lingotes requieren horno — MC pre-1.17). La coincidencia exacta: `COAL_ORE→I.COAL`, `IRON_ORE→I.IRON_INGOT`, `REDSTONE→I.REDSTONE`, `DIAMOND→I.DIAMOND`, `EMERALD→I.EMERALD`, `GOLD_ORE→I.GOLD_INGOT` (en MC en 1.17+ caigo raw, la c'n mezcla; **decisión del proyecto** documentada en el spec: se usa el drop de la 1.17 con fundición implícita, sin raw). añadir test de drop exacto por mina en `unit-paridad.js`. |
| B2 | Tier de `canHarvest` | `canHarvest(tool, block)` → para menas exigir `oorder tier` (`IRON_ORE/GOLD_ORE` pico stone+, `DIAMOND/EMERALD` pico iro+). Usar la tabla del reporte (§2.8): `PICKAXE_TIER = { wood:1, stone:2, iron:3, gold:1, diamond:4 }`; dureza máxima a minar: gold≈? Documentla. |
| B3 | Conejo cocinado | `FOOD_VALUES[I.COOKED_RABBIT] = { food: 5, salt: 6 }` (era 8/12.8). Añadir test |
| B4 | Combinbustible del horno | `FUEL_ITEMS` acepta `I.COAL`, `I.COAL_NS` si existe; y troncos de todas las variedades (oak, birch, spruce, jungle). Test. |
| B5 | `MOB_XP` | skeleton 5, enderman 5, spider 5 (`MOB_XP` en constants). Test |
| B6 | Menores de mobs | spider 16 HP, bee 10, enderman 40, creeper boom desde el reporte (elegir valor fiel sit desde `TNT_DAMAGE`). Cada uno con su assert en `unit-paria` y, si cambian sobre MOB_HEALTH/MOB_EXP son constantes simple |

---

## 5. Bloque C — Rendimiento (cliente + servidor)

### C1 — Doble raycast de `input.js` ✅

Fusionar el `updateHighlight` (offset 678) y el retarget (offset 686) en un
solo `raycastTerrainAndMobs` por `pointermove`. Un hit compartido alimenta
aspectos: highlight + `miningTarget`/retarget. Implementado en
`public/input.js`: una sola `raycastTerrainAndMobs()` por `pointermove`
(singular) que da de comer al highlight y al retarget a la vez.

### C2 — Broadcast mobs sin cambios ✅

En `mainLoop`, `broadcast("mobs_update", ...)` incondicional → emitir solo si
algo cambia. Implementado en `server/net.js`: snapshot único por tick
(`JSON.stringify`) comparado con el anterior (`lastMobsJson`); se reinicia al
entrar un jugador nuevo para que el recién conectado vea el estado real.

### C3 — Vecinos con huecos al `chunks_add` ✅

En `public/world.js`, al cargar `loadChunkData`/`chunks_add` (carga
incremental, también la del init pospuesto) los bordes quedan sellados: por
cada chunk nuevo se reconstruyen los 4 vecinos ortogonales que ya existían
(`existingNeighbors`, capturados antes del bucle) → sin caras ausentes hasta
`updateLod`.

### C4 — Luz de antorcha stale ✅

En `public/network.js`, el caso `block_update` (cualquier bloque) re-hornea la
luz si toca una antorcha: `rebuildAround` si previo/nuevo es una, o si hay una
a menos de `LIGHT_RADIUS` del punto (`hasTorchNear(wx, wy, wz)` en
`public/world.js`); si no, `rebuildAffectedChunks`. Al colocar/romper
bloques sólidos junto a un borde de chunk la luz ya no queda stale.

### C5 — `sendInit` pesado ✅

Opcional, roadmap → implementado: diferir la generación de los chunks del
`init` para que el cliente no se bloquee con ~2.7 MB. En `server/net.js`:
- `INIT_CHUNK_RADIUS = 2`: el `init` serializa solo el radio cercano al
  spawn (25 chunks, ~470 KB) en vez de los 169 de golpe.
- El `mainLoop` rellena el resto con lotes de `CHUNK_FILL_PER_TICK = 6`
  chunks por tick y jugador, ordenados por distancia Chebyshev y enviados
  como `chunks_add` (generación idempotente; el cliente se descongela a
  medida que llegan).
- `move`/`ensureChunksAround` quedan igual (idempotentes).

---

## 6. Criterios de aceptación

1. Bloque A: `node tests/run.js --unit` exit 0 (incl. `unit-fase12` completo y
   `unit-persistencia` con el caso de pets/slime); `node --check` sobre el
   servidor. Sin cambio de protocolo WS ni SCHEMA a mayores que la A2.
   ✅ Suite unitaria 3666 OK, 0 fallos.
2. Bloque B: `tests/unit-paridad.js` incluye las tablas nuevas y en verde. ✅
3. Bloque C: `unit-mining-click`/`unit-lod`/`unit-antorchas` sin regresión;
   `audit-fase7` CDP ok (0 excepciones, 169 chunks) con los valores de F3.
   ✅ **`audit-fase7`: OK (Chrome headless/CDP, ticks < 100 ms con el
   relleno progresivo del init funcionando).**

---

## 7. Riesgos y notas

- **Determinismo de la generación** (C° tests con semilla fija): `BIOME_SPAWN`
  debe basarse en `getBiome/world` (determinista por seed), no en `Math.random`
  para la validez de los tests.
- Al mover la persistencia de mobs a `SCHEMA_VERSION` 5 se toca el formato de
  guardado: **siempre** migración retrocompatible + test (`unit-persistencia`),
  convención del proyecto.
- El bloque de paridad B1 (drops) cambia el "feel" de la economía de supervivencia:
  al decidir el drop de menas, mantener "horno para hierro/oro" y "gémina directa
  para diamante/redstone/esmeralda", cuyo drops son exactos para abrir percutor.

---

## 8. Dependencias y doc

- Actualizar `docs/README.md` (tabla de fases: F12 → estado nuevo, F14 nueva
  fila) y `docs/server/mecanicas.md` si `spawnMobs`/dropos cambian de
  comportamiento documentado.
- Reflejar en `TODO.md` la Fase 12 como cerrada al terminar el Bloque A.
---

## Cierre de la fase

- **Fecha de cierre:** 2026-08-08
- **Commits clave:**
  - `2c0aa65` (2026-08-08) — Fase 14 (WIP guardada aparte): paridad de valores — drops directos de minerales (`ORE_DROP`), tiers de pico, carbón combustible, HP de mobs MC, creeper con daño de TNT, conejo asado, XP de mobs.
  - `fec5809` (2026-08-08) — Fase 14 (M1-M3): optimizaciones de rendimiento — un solo raycast por `pointermove`, broadcast de `mobs_update` solo si cambia, rebuild de vecinos.
  - `3c169d7` (2026-08-08) — Fase 14 (M4): luz de antorcha stale al cambiar bloques sólidos.
  - `6526fe1`/`fe16663` (2026-08-08) — Fase 14 (M4): formato biome en `public/network.js` y `public/world.js`.
  - `48dc162` (2026-08-08) — Fase 14 integrada: TODO refleja el merge.
  - `b48110c` (2026-08-08) — Fase 14 (M2, fix de revisión): snapshot de mobs reenviado al entrar un jugador nuevo.
  - `6571334` (2026-08-08) — Fase 14: formato biome en `server/net.js` (fix M2).
  - `cf2a9f4` (2026-08-08) — Fase 14: auditoría de cierre y documentación oficial.
  - `97b526e` (2026-08-08) — Fase 14: documentación de la fase en TODO.
- **Resultado de la auditoría:** los tres bloques implementados y en verde: A) bugs de la Fase 12 (spawn por bioma, persistencia `SCHEMA_VERSION` 5, tridente contra mobs, hop determinista del slime); B) paridad real (drop de menas, tier de pico, comida/combustible, salud/XP de mobs, boom del creeper = `TNT_DAMAGE`); C) rendimiento (un rayo por `pointermove`, broadcast solo si cambia, rebuild de vecinos, luz de antorcha stale, `sendInit` liviano con relleno progresivo). Auditoría de cierre: suite unitaria **3666 OK**, E2E **4/4**, `audit-fase7` CDP OK, `biome` 0 errores.
- **Lagunas conocidas / decisiones diferidas:** ver la spec (bloques A-C).

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-08: creación del spec (documento de planificación de la fase 14, a partir de la auditoría integral del 2026-08-08).

**Cambios en esta spec (v2):**
- 2026-08-15: reorganización de docs — spec movida a `docs/spec/`, rutas actualizadas, etiqueta de estado `[COMPLETADA]` y bloque de cierre con commits.
