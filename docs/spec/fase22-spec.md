# Fase 22 — Profundidad, minerales y fauna 1.17–1.21 (Spec)

> **Estado:** `[PROSPECTIVA]`

> Documento creado a partir de: la nueva sección "Actualizaciones Minecraft
> 1.17 → 1.21" de `docs/Notas del usuario.md` (plan del usuario, 2026-08-15),
> el cruce con `docs/spec/fase21-spec.md` (geoda y biomas), `server/constants.js`
> (B/I, `ORE_DROP`, `SLIME_BALL`), `server/generation.js` (`caveStrength`,
> minerales por profundidad F18 C-2), `recetas_horno.json` y
> `public/player.js` (patrón `SPRINT_FOV` para el zoom del catalejo).
> Fecha: 2026-08-15 · Proyecto: clon de Minecraft.
> Estado: **prospectiva (sin implementar)** — prerrequisito: **Fase 21.5
> cerrada** (absorbida como prerrequisito 2026-08-15). Fase fraccionable en
> subfases (cada bloque es una subfase
> verificable por separado; ver §8).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1-A2 | Plan 1.17→1.21 (notas, 2026-08-15) §1 y §F | Terreno estilo 1.18 (montañas y valles) + **altura a 256 SOLO si los tests la confirman** (sino mantener 128) + cuevas más grandes/conectadas | F22 A1/A2 | 🟠 |
| A3-A5 | Plan §2 y §3 | **Deepslate bajo Y=0** + **minerales en bruto: minar suelta el raw (todos) y se funde** + **cobre (solo el bloque, sin oxidación ni cortado)** | F22 A3-A5 | 🟠 |
| B1-B2 | Plan §4 + notas "Estructuras" (geoda) | **Catalejo con zoom real**; los bloques/ítems de amatista los aporta la F22 y la **geoda se mantiene en la F21** (D2, reusa los IDs) | F22 B1-B2 | 🟠 |
| C1 | Plan §5 | **Sculk simplificado: Deep Dark en Y < −40 + propagación al morir un mob (radio 2)**; sin Warden/shriekers/ciudad/crecimiento | F22 C1 | 🟠 |
| D1 | Plan §6 | **Rana** (salta, come slimes pequeños, cría con `SLIME_BALL`); sin renacuajos; biomas manglar/cerezo/bambú quedan en la F21 | F22 D1 | 🟠 |
| E1-F1 | Plan + proceso | Tests específicos de la fase (`unit-fase22.js`) + cierre/auditoría; documentar restricciones | F22 E1/F1 | 🟢 |

**Won't confirmado por el usuario en esta fase (2026-08-15):** Redstone y
todo lo que dependa de ella (Crafter, comparadores), Trial Chambers y
spawners de prueba, Arqueología (cepillo/barro sospechoso),
Aldeanos/Comercio/Aldeas y Warden (solo se implementa el bloque Sculk),
encantamientos/pociones, clima complejo, **oxidación del cobre**,
**brotes de amatista que crecen**, **renacuajos**, acuíferos subterráneos,
Sniffer/Camello (montura), mobs del Nether (Hoglin/Piglin — no hay Nether).
**Diferidos (no Won't):** Lush Caves, Breeze 1.21 simplificado, Armor Trims,
Tuff/Caliza → Fase 23 prospectiva (se documentan en `Notas del usuario.md`
sin spec propia aún).

---

## 1. Contexto

- **Prerrequisito:** Fase **21.5** cerrada (que a su vez exige la 21 y la
  F20; el prerrequisito fue F21 hasta la creación de la Fase 21.5, de donde
  la F22 recibe ahora también contenido previo). La F22 es
  la primera fase de **contenido de las actualizaciones 1.17→1.21**:
  profundidad de minería (deepslate + raw ores + cobre), exploración
  subterránea (deep dark/skulk + terreno 1.18) y fauna nueva (rana).
- **Qué hay hoy (verificado):** mundo **v6 de 128 bloques (Y ∈ −64..+63)**,
  `SCHEMA_VERSION` 6, minerales por profundidad MC 1.18 calibrados a este
  rango (F18 C-2) en `server/generation.js` (carbón alto, hierro medio,
  oro/diamante/redstone/esmeralda profundos); `ORE_DROP` en
  `server/constants.js` (~990) hace que **hoy minar hierro/oro suelte el
  lingote directo**; `recetas_horno.json` funde mena → lingote; texturas
  procedurales por paleta (`public/texturemap.js` — un bloque nuevo = color
  + tesela nueva); `SLIME_BALL` existe (I:246); el FOV de sprint
  (`public/player.js`, `SPRINT_FOV`) es el patrón para el zoom del catalejo.
- **No existe nada del plan** (verificado en `server/constants.js` y
  `public/constants.js`): no hay `DEEPSLATE`, `RAW_*`, `COPPER_*`,
  `AMETHYST_*`, `SPYGLASS`, `SCULK`, `SCULK_VEIN` ni la rana. Todo es ID
  nuevo (hay hueco libre tras el 257) → **sincronizar B/I en AMBOS
  `constants.js` + receta + icono**, regla de `AGENTS.md`.
- **Decisiones de la entrevista (2026-08-15):** la fase puede fraccionarse
  en subfases (cada bloque A-F es una subfase independiente con su test);
  la **altura solo sube si los tests lo confirman**; **todos** los
  minerales se funden (raw); la geoda se queda en la F21; el catalejo lleva
  zoom real; el cobre es **solo el bloque por ahora** (ampliación futura si
  es factible — decisión a documentar); el Deep Dark va en Y < −40 con
  propagación; los biomas nuevos quedan en la F21 y la rana en la F22;
  para dar por completada la fase: **todos los tests en verde + tests
  específicos de esta fase en verde**.

---

## 2. Bloque A — Terreno y profundidad (subfase A: 1.18 + minería)

### A1 — Evaluación de factibilidad de altura 256 (decisión por tests)

- **Qué hacer:** medir la subida a **256 bloques (Y ∈ −64..191)** con el
  mundo actual: impacto en tiempo de generación de chunk, greedy meshing,
  worker y LOD del cliente (mismo método que `audit-altura.js` y los
  presupuestos de rendimiento de la F20), y en los tests deterministas
  (`unit-mundo`, `unit-biomas`, `unit-paridad` de minerales por
  profundidad). **Veredicto documentado en la spec** con los números.
- **Si sube:** `SCHEMA_VERSION` 7 + migración v6→v7 retrocompatible (el
  rango nuevo se rellena según generación; el dato v6 conservado, modelo
  `tests/unit-persistencia.js`) + recalibración de minerales/cuevas/niebla a
  las nuevas profundidades + `audit-altura` recalibrada.
- **Si no sube:** se mantiene 128 (`SCHEMA_VERSION` 6 intacto), se
  documenta el porqué (números) y el bloque A2 se ciñe al rango vigente.
- **Criterio:** veredicto con datos (antes/después) en la spec; suite en
  verde; decisión explícita y documentada.

### A2 — Terreno estilo 1.18 (montañas y valles) en el rango vigente

- **Qué hacer:** montañas más altas y escarpadas (cumbres hasta ~Y=60
  dentro del rango −64..+63 o del nuevo según A1) y valles profundos, con
  ruido 3D multioctava en `server/generation.js`; **cuevas más grandes y
  conectadas** (recalibrar `caveStrength`/umbrales — el usuario pidió
  "pocas cuevas pero largas y grandes"); mantener el determinismo (misma
  semilla = mismo mundo).
- **Qué no incluir:** acuíferos (lagos subterráneos interconectados; Won't).
- **Ficheros:** `server/generation.js`, `server/noise.js` (si aplica),
  `tests/unit-mundo.js`, `tests/unit-biomas.js`, `tests/audit-fase4.js`.
- **Criterio:** tests deterministas recalibrados en verde; presupuesto de
  generación dentro del umbral documentado en A1.

### A3 — Deepslate (pizarra profunda) bajo Y=0

- **Qué hacer:** nuevo bloque `DEEPSLATE` (B nuevo, ID libre): la piedra de
  las capas Y < 0 se genera como deepslate (`server/generation.js`); las
  menas siguen su distribución por profundidad ya calibrada (F18 C-2) y se
  generan también dentro del deepslate con los mismos IDs (no se crean
  variantes "mena de deepslate" — decisión por simplicidad, documentada).
  Sincronizar B/I (`server/constants.js` ↔ `public/constants.js`), tesela
  en `public/texturemap.js` (paleta profunda azulada), `TOOL_DURABILITY`/
  dureza (paridad: dureza 3.0, pico de piedra+).
- **Criterio:** test determinista: todo bloque piedra con Y < 0 es
  `DEEPSLATE`; `unit-sync` en verde; icono visible (`unit-itemicons`).

### A4 — Minerales en bruto: minar suelta el raw, se funde en el horno

- **Qué hacer:** ítems nuevos `RAW_IRON`, `RAW_GOLD`, `RAW_COPPER`
  (I nuevos). **Cambio de comportamiento de `ORE_DROP`
  (`server/constants.js` ~990): minar hierro/oro/cobre suelta el raw en
  TODOS los casos** (se retira el lingote directo; el lingote se obtiene
  fundiendo el raw en el horno — recetas nuevas en `recetas_horno.json`:
  raw → lingote). Las menas siguen generándose como hoy (A3). El recuento
  de `unit-paridad` (drops) y los E2E de minería se reajustan.
- **Qué no incluir:** mena fundible directamente sin horno (no); estadística
  de fortuna (no la hay, Won't implícito).
- **Ficheros:** `server/constants.js` + `public/constants.js` (ítems),
  `server/mining.js` (drop), `recetas_horno.json` (raw → lingote),
  `tests/unit-paridad.js`, E2E de minería/fundición, `public/itemicons.js`.
- **Criterio:** test: minar la mena → cae el raw (no el lingote); fundir el
  raw en el horno → lingote; suite + E2E en verde.

### A5 — Cobre (solo el bloque por ahora)

- **Qué hacer:** `COPPER_ORE` (bloque B nuevo; distribución por altura ~Y
  0..16, reusando el patrón de minerales por profundidad), `COPPER_INGOT`
  (fundir `RAW_COPPER` en el horno — A4) y `COPPER_BLOCK` (crafteo 3×3 de
  lingotes). B/I sincronizados + receta + tesela + icono.
- **Qué no incluir (decisión documentada):** solo el **bloque** por ahora —
  **sin oxidación** (no hay sistema de ticks por bloque), sin cut copper, sin
  escaleras/losas de cobre, sin herramientas/campana. Ampliación futura si
  es factible (se documenta en la spec y en las notas).
- **Criterio:** test determinista: cobre generado en su rango de altura con
  la semilla fija; crafteo `COPPER_BLOCK` y fundición `RAW_COPPER` →
  `COPPER_INGOT`; `unit-recetas`/`unit-sync` en verde.

---

## 3. Bloque B — Amatista y catalejo (subfase B: 1.17 + zoom)

### B1 — Bloques/ítems de amatista (los reusa la geoda de la F21)

- **Qué hacer:** ítem/bloques nuevos: `AMETHYST_SHARD` (I), `AMETHYST_BLOCK`
  y `AMETHYST_CLUSTER` (B) con B/I sincronizados, teselas (paleta violeta)
  e iconos. **La estructura geoda NO es de esta fase: se mantiene en la
  F21 (B1/D2)**, que reusa estos IDs y suelta shards desde los clusters.
  Drop: romper `AMETHYST_CLUSTER` con pico → 1-4 `AMETHYST_SHARD`
  (determinista con hash, sin fortuna).
- **Criterio:** `AMETHYST_CLUSTER` rompible con pico suelta shards (test);
  `unit-sync` en verde; sin IDs duplicados con la F21 (nota cruzada en
  `fase21-spec.md` D2 y `TODO.md` F21 D2).

### B2 — Catalejo (SPYGLASS) con funcionamiento real de zoom

- **Qué hacer:** ítem nuevo `SPYGLASS` (I) + receta (1 `AMETHYST_SHARD` + 1
  lingote de cobre en `recetas.json`). **Zoom real:** al sostenerlo en la
  mano y mantener el botón de usar (clic derecho), el FOV baja con
  transición suave (patrón `SPRINT_FOV` de `public/player.js`, target ~15°
  frente a los 75 base); al soltar, vuelve; `pointer lock` intacto; sin HUD
  extra. El zoom es solo visual del cliente (como el FOV de sprint), el
  servidor no interviene (solo valida que el ítem esté en la mano).
- **Ficheros:** `server/constants.js` + `public/constants.js` (ítem),
  `recetas.json`, `public/itemicons.js`, `public/player.js` (FOV),
  `public/game-input.js`/`public/menus.js` (botón de usar si hace falta
  canal), `tests/unit-fase22.js` (receta + ids), verificación manual del
  zoom.
- **Criterio:** receta válida (`unit-recetas`); al sostener `SPYGLASS` el
  FOV objetivo baja y vuelve al soltar (verificación manual documentada);
  sin cambios de protocolo ni de guardado.

---

## 4. Bloque C — Sculk / Deep Dark en Y < −40 (subfase C: 1.19)

- **Qué hacer:** bloques nuevos `SCULK` y `SCULK_VEIN` (B, B/I
  sincronizados, teselas oscuras con puntos, iconos). **Capa Deep Dark en
  Y < −40:** el generador coloca parches de `SCULK`/`SCULK_VEIN` en las
  capas profundas (reusando el patrón de estructuras/pedestal, determinista
  por hash 2D en `server/generation.js`). **Propagación básica:** al morir
  un mob sobre un bloque de `SCULK`, convierte en `SCULK` los bloques
  circundantes de tierra/piedra (y en `SCULK_VEIN` la superficie) en un
  radio de 2 bloques — evento `onDeath`/drop en `server/mobs.js` +
  `server/world.js`; test determinista.
- **Qué no incluir (limitaciones documentadas):** **sin** Warden, **sin**
  shriekers/sensores (no invocan nada), **sin** ciudad antigua, **sin**
  crecimiento/expansión propia con el tiempo (solo al morir un mob).
- **Ficheros:** `server/constants.js` + `public/constants.js`, `recetas.json`
  (si aplica), `server/generation.js` (generación Y < −40),
  `server/mobs.js`/`server/world.js` (propagación en muerte),
  `public/texturemap.js`, `tests/unit-fase22.js`.
- **Criterio:** test: con la semilla fija hay `SCULK` en Y < −40; al morir
  un mob sobre sculk se convierte un bloque circundante en radio 2; sin
  regresión de mobs existentes; manual: explorar una cámara de sculk.

---

## 5. Bloque D — Rana (subfase D: fauna 1.19)

- **Qué hacer:** mob pasivo nuevo **Rana** con el patrón de la F12/F21
  (subclase con `tickSpecies`/`onDeath`, `MOB_PARTS` + textura en
  `public/mobtextures.js`, spawn por bioma en `BIOME_SPAWN`: **pantano** y,
  cuando la F21 añada el manglar, también allí): deambula y **salta**
  (salto alto puntual, física actual); **come slimes pequeños** (al tocarlos
  los elimina y suelta `SLIME_BALL` — patrón de la rana de MC); **cría con
  `SLIME_BALL`** (misma mecánica de cría existente); XP/vida en
  `unit-paridad`.
- **Qué no incluir (documentado):** **renacuajos** (Won't de la fase), rana
  de 3 variantes por bioma (solo la de pantano, decisión por simplicidad —
  ampliable), comer slimes por arco de lengua animado (se simplifica a
  tocado).
- **Ficheros:** `server/mobs.js`/`server/mob-species.js` (subclase),
  `server/mob-spawn.js` (bioma), `public/mobtextures.js`, `server/constants.js`
  + `public/constants.js` (tipo mob nuevo si aplica), `tests/unit-fase22.js`
  + `unit-paridad.js` (drops/XP), `docs/server/mecanicas.md`.
- **Criterio:** test por mecánica: salta, elimina slime pequeño y suelta
  `SLIME_BALL`, cría con `SLIME_BALL`, aparece en pantano; sin regresión de
  mobs existentes.

---

## 6. Bloque E — Tests específicos de la fase (subfase E)

- **Qué hacer:** `tests/unit-fase22.js` nuevo cubriendo CADA mecánica del
  bloque: deepslate bajo Y=0 (A3), drop de raw (A4), fundición raw → lingote
  (A4), generación/crafteo de cobre (A5), IDs de amatista + shard del
  cluster (B1), receta del catalejo (B2), generación de sculk en Y < −40 y
  propagación al morir un mob (C1), rana: salto/come slime/cría/spawn (D1).
  Añadir al registro de `tests/run.js` (ver `docs/tests.md`).
- **Criterio:** `unit-fase22.js` en verde + toda la suite (unit + E2E +
  auditorías) en verde.

---

## 7. Bloque F — Cierre y auditoría de la Fase 22 (tarea obligatoria)

Al implementarse (tras la entrevista del planificador al abrirla), esta fase
cierra con:

1. Suite unitaria completa en verde (incluidos `unit-fase22.js`,
   `unit-sync`, `unit-recetas`, `unit-paridad`, `unit-mundo`, `unit-biomas`),
   E2E clásicos + menú, `node --check` y `biome check` 0 errores.
2. Auditorías por fase sin regresiones (`audit-fase4` de generación,
   `audit-altura` recalibrada si subió la altura en A1).
3. Verificación manual en navegador: minar deepslate, fundir raw en el
   horno, craftear/zoom del catalejo, encontrar sculk en Y < −40 y ver
   propagación al morir un mob, encontrar ranas en el pantano y criarlas.
4. `SCHEMA_VERSION`: 7 con migración v6→v7 retrocompatible + test SOLO si
   A1 decidió subir; si no, 6 intacto.
5. Docs al día: `docs/server/mecanicas.md` (deepslate/raw/cobre/skulk/rana),
   `docs/README.md` (índice), `AGENTS.md` (estado), `TODO.md` (F22 cerrada);
   restricciones de la fase documentadas (ver §9).

---

## 8. Subfases verificables (fraccionamiento de la fase)

Cada bloque A-F es una **subfase** cerrable por separado (su propio test +
verificación), en este orden recomendado por dependencias:
**A1 (veredicto de altura, desbloquea el resto) → A (terreno+minería) → B
(amatista+catalejo) → C (sculk) → D (rana) → E (tests de fase) → F
(cierre)**. Ninguna subfase se da por cerrada sin su test en verde; la fase
solo se cierra con todo en verde + la auditoría F.

---

## 9. Restricciones documentadas de la Fase 22 (Won't de esta fase)

Confirmadas por el usuario en la entrevista 2026-08-15 y reflejadas en las
notas (`Notas del usuario.md` "Actualizaciones Minecraft 1.17 → 1.21"): los
denominadores comunes de `TODO.md` "Fuera de alcance (Won't)" (redstone y
dependientes — Crafter, comparadores, repetidores; Trial Chambers y
spawners; arqueología; aldeanos/comercio/aldeas; Warden; encantamientos y
pociones; clima; dimensiones; autenticación/BD) más los específicos de esta
fase: **oxidación del cobre, brotes de amatista que crecen, renacuajos,
acuíferos, Sniffer/Camello, mobs del Nether**. **Diferidos a la Fase 23**
(no implementar en la 22): Lush Caves, Breeze, Armor Trims, Tuff/Caliza
(así como ajolote/cabra si no entran en la 22).

---

## 10. Criterios de aceptación (resumen)

1. Veredicto de A1 documentado con datos: la altura sube a 256 solo si los
   tests lo confirman; si no, se mantiene 128 y se documenta el porqué.
2. Minar hierro/oro/cobre suelta el **raw** y solo el horno produce el
   lingote (tests + E2E); deepslate bajo Y=0 verificado por test.
3. Cobre crafteable como bloque (sin oxidación/cortado — decisión
   documentada); amatista con shards que la F21 reusa en su geoda (sin IDs
   duplicados).
4. Catalejo con zoom real al sostenerlo (verificación manual) y receta
   válida; `pointer lock` intacto.
5. Sculk en Y < −40 con propagación al morir un mob (radio 2), sin
   Warden/shriekers/crecimiento; rana con salto/comer slime/cría/spawn en
   pantano; limitaciones documentadas.
6. **Todo bloque/ítem nuevo sincronizado B/I + receta + icono** (`unit-sync`,
   `unit-recetas`, `unit-itemicons` en verde); `SCHEMA_VERSION` 6 o 7 según
   A1, con migración + test si sube.
7. Cierre: **todos los tests en verde incluidos los específicos de la fase
   (`unit-fase22.js`)**, E2E/auditorías sin regresiones, verificación manual,
   Won't de la fase y diferidos documentados, docs y tracker al día.

> **Tests que cubren esta fase (previstos):** `tests/unit-fase22.js`, `tests/audit-fase22.js`.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-15: creación del spec (documento de planificación de la fase 22).