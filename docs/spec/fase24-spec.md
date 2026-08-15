# Fase 24 — Nether Update (primera dimensión) (Spec)

> **Estado:** `[PROSPECTIVA]`

> Documento creado a partir de: `docs/Notas del usuario.md` (sección
> "Dimensiones: Nether y End", 2026-08-15) y la entrevista 2026-08-15
> (numeración: F23 = diferidos de F22; **F24 = Nether Update**; F25 = End
> Update). Las dimensiones siguen **Won't hasta abrir esta fase**.
> Fecha: 2026-08-15 · Proyecto: clon de Minecraft.
> Estado: **prospectiva (sin implementar)** — prerrequisito: **Fase 23
> cerrada**.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | Notas "Dimensiones" + entrevista | **Persistencia por dimensión**: `world/<semilla>/nether/` (opción B: la raíz actual queda como overworld; carpeta nueva sin migrar la raíz) | F24 A1 | 🟠 |
| A2 | Notas "Dimensiones" + entrevista | **Posición del jugador por dimensión** (`positions: {overworld, nether}`) **sin subir `SCHEMA_VERSION`** (campo retrocompatible en el archivo del jugador; inventario/salud/XP compartidos) | F24 A2 | 🟠 |
| A3 | Notas "Dimensiones" + entrevista | **Protocolo WS**: `enter_dimension` (C→S) + `dimension_change` (S→C) reusando el `init` existente para la nueva dimensión | F24 A3 | 🟠 |
| B1 | Notas "Dimensiones" | **Generación del Nether** (128 bloques, techo/piso bedrock, cuevas masivas con lagos de lava, offset re-anclado; reusa el formato v6) | F24 B1 | 🔴 |
| B2 | Notas "Dimensiones" | **Biomas (2)**: Nether Wastes y Soul Sand Valley (simplificados) | F24 B2 | 🟠 |
| C1 | Notas "Dimensiones" | **Bloques (~15)**: netherrack, soul sand/soil, glowstone, nether bricks, magma block, basalto, blackstone, nylium, hongos/raíces, shroomlight — estáticos | F24 C1 | 🟠 |
| D1 | Notas "Dimensiones" | **Mobs (4)**: zombified piglin (neutral), ghast (bolas de fuego), blaze (dispara), magma cube (se divide) — IA por especie existente | F24 D1 | 🔴 |
| D2 | Notas "Dimensiones" | **Fortaleza del Nether**: pasillos de nether bricks, 1-2 spawners de blaze, cofres (sin trampas de redstone) | F24 D2 | 🟠 |
| E1 | Notas "Dimensiones" + entrevista | **Portal**: marco 4×5 de obsidiana que **se activa al completarse** (sin mechero ni gesto "usar"); bloque `PORTAL` no sólido; conversión 8:1 con spawn en tierra firme | F24 E1 | 🔴 |
| F1 | Notas "Dimensiones" | **Tests específicos** (`unit-fase24.js`: generación, portal/coordenadas, mobs, persistencia) | F24 F1 | 🟢 |
| G1 | Notas "Dimensiones" | Cierre y auditoría de la fase (suite + E2E + manual) | F24 G1 | 🟢 |

**Won't de la fase (documentado en notas):** trueque de piglins (sin UI;
piglins neutros solo si llevas oro, sin comercio), piglins armados,
hoglin/zoglin, techo del Nether accesible (bedrock sólido), biomas
crimson/warped/deltas (ampliación posterior), cama que explota
(dormir se rechaza), mechero (flint & steel), redstone en fortalezas,
comercio, NBT, encantamientos/pociones, clima.

---

## 1. Contexto

- **Prerrequisito:** Fase 23 cerrada (y con ella 18→22). Es la **primera
  dimensión** del proyecto: desbloquea el Won't "dimensiones" (en
  `TODO.md`/`AGENTS.md` se mantiene hasta abrir esta fase, sin tocarlo
  antes).
- **Qué hay hoy (verificado):** persistencia por semilla en
  `world/<semilla>/` (`chunks/`, `world.json`, `players/` con el jugador
  plano `x/y/z`); `worldPaths` centraliza rutas; el `init` reenvía
  spawn+seed; `world-session.js` gestiona la sesión de mundo; mobs con
  `MOB_CLASSES`/`tickSpecies`; `server/projectiles.js` para ghast/blaze;
  `LAVA` (25), `BEDROCK` (19) y `FLINT` (252) existen; **no existe**
  `OBSIDIAN` ni `PORTAL` ni `FIRE` (los añade esta fase); el mundo es de
  128 bloques (v6, −64..+63) — el **Nether reusa el formato de chunk v6
  con offset re-anclado (Y 0..127, piso/techo de bedrock)** sin cambiar
  `SCHEMA_VERSION`.
- **Decisiones de la entrevista:** opción **B** para el guardado (carpeta
  `nether/` nueva; la raíz actual queda como overworld, sin migración);
  **portal = solo el marco** que se activa al completarlo (sin mechero ni
  gesto "usar" nuevo); **Nether de 128 bloques**; posición por dimensión
  sin subir `SCHEMA_VERSION`; **todos los tests en verde + tests propios
  en verde** para dar por cerrada la fase.

---

## 2. Bloque A — Infraestructura de dimensiones

### A1 — Persistencia por dimensión (opción B)

- **Qué hacer:** `worldPaths` gana una noción de **dimensión**:
  `dimension = "overworld" | "nether"` → rutas `world/<semilla>/` (raíz,
  overworld, como hoy) y `world/<semilla>/nether/` (`chunks/` +
  `world.json` propios). **La raíz actual NO se mueve** (sin migración de
  rutas). `world-session.js` activa una dimensión a la vez; `unload`/
  guardado siguen la misma cola (`save-chunks.js`), apuntando a la carpeta
  de la dimensión activa. `world.json` del nether guarda su `seed`
  derivada (hash de la semilla + "nether" — determinista), `timeOffset` y
  `mobs` propios.
- **Ficheros:** `server/constants.js` (`worldPaths`, helper de dimensión),
  `server/save.js`/`save-meta.js`/`save-chunks.js` (ruta por dimensión),
  `server/world-session.js`, `tests/unit-fase24.js`,
  `tests/unit-persistencia.js` (extendido).
- **Criterio:** con la semilla fija, el nether guarda en
  `world/<semilla>/nether/` sin tocar `chunks/` del overworld; el
  overworld existente sigue cargando igual (migración nula); suite en
  verde.

### A2 — Posición del jugador por dimensión (sin `SCHEMA_VERSION`)

- **Qué hacer:** el archivo del jugador (`players/<id>.json`) gana campos
  opcionales: `dimension` (default `"overworld"`) y
  `positions: { overworld: {x,y,z}, nether: {x,y,z} }`. La lectura es
  retrocompatible (ausente → todo overworld, como hoy). Inventario,
  salud, comida y XP **compartidos** entre dimensiones (no se duplican).
  Al cambiar de dimensión, el servidor guarda la posición de salida en la
  dimensión actual y restaura la de entrada de la nueva (o el spawn del
  portal) — ver E2.
- **Ficheros:** `server/save-players.js` (serializar/leer campos),
  `server/players.js`, `tests/unit-fase24.js`.
- **Criterio:** test: cambiar overworld→nether y volver restaura cada
  posición; el archivo cargado sin los campos nuevos funciona igual
  (retrocompat); `SCHEMA_VERSION` se mantiene en 6.

### A3 — Protocolo WS de cambio de dimensión

- **Qué hacer:** eventos nuevos: `enter_dimension` (C→S; el jugador
  atravesó el portal en «dimensión activa») y `dimension_change` (S→C;
  confirma y **reenvía el `init`** ya existente con el seed de la nueva
  dimensión y el spawn de entrada para que el cliente renderice desde
  cero). No inventar un init paralelo: reusar el actual (patrón de
  `sendInit`).
- **Ficheros:** `server/net.js` (handlers + dispatch), `public/network.js`
  (enviar/recibir), `tests/e2e*/` o `tests/unit-fase24.js` (simulado).
- **Criterio:** el cliente (navegador manual) cambia de dimensión sin
  recargar la página y renderiza el nether; el E2E con servidor vivo cubre
  el flujo de `enter_dimension`→`init` (ver F1).

---

## 3. Bloque B — Generación del Nether

### B1 — Terreno y cuevas (128 bloques)

- **Qué hacer:** generador nuevo `generateNetherChunk` (en
  `server/generation.js` o módulo propio `nether-gen.js`): reusa el
  formato de chunk v6 (16×128×16) con **offset re-anclado — el Nether
  ocupa Y 0..127**: capa 0 = bedrock (piso), capa 127 = bedrock (techo),
  entre medias netherrack con **cuevas masivas** (ruido 3D, parecido a
  `caveStrength` pero generoso) y **lagos de lava** (`LAVA` existente) en
  las zonas bajas. El aire de superficie se rellena salvo las cavernas;
  sin cielo/luz solar (nivel de luz bajo constante). Semilla derivada
  determinista (hash semilla + "nether").
- **Qué no incluir:** acuíferos, "nether roof" accesible (bedrock sólido),
  biomas complejos (ver B2).
- **Ficheros:** `server/generation.js`/`server/nether-gen.js`,
  `server/constants.js` (+`public`), `tests/unit-fase24.js`
  (determinismo + estructura), `docs/server/mecanicas.md`.
- **Criterio:** test determinista: misma semilla = mismo nether; piso/
  techo de bedrock en Y 0/127; lagos de lava presentes; sin romper la
  generación del overworld.

### B2 — Biomas del Nether (2, simplificados)

- **Qué hacer:** `BIOME_SPAWN`-like en el nether con 2 biomas por bandas
  de ruido: **Nether Wastes** (netherrack + hongos dispersos) y
  **Soul Sand Valley** (soul sand + soul soil en superficie, basalto en
  pilares puntuales). Cada bioma con su paleta; determinista.
- **Qué no incluir:** crimson/warped forests, basalt deltas (documentados
  como ampliación posterior).
- **Ficheros:** los de B1 + `tests/unit-fase24.js` (biomas).
- **Criterio:** test: las dos regiones existen con su paleta; suite en
  verde.

---

## 4. Bloque C — Bloques del Nether (~15, estáticos)

- **Qué hacer:** bloques nuevos B (B/I sincronizados en AMBOS
  `constants.js` + tesela en `public/texturemap.js` + receta si aplica +
  icono, regla de `AGENTS.md`): `NETHERRACK` (estándar, minable), `SOUL_SAND`
  (desacelera), `SOUL_SOIL`, `GLOWSTONE` (emisor de luz), `NETHER_BRICKS`,
  `MAGMA_BLOCK` (daño al pisar, acotado), `BASALT`, `BLACKSTONE`,
  `CRIMSON_NYLIUM`, `WARPED_NYLIUM`, `CRIMSON_FUNGUS`, `WARPED_FUNGUS`,
  `CRIMSON_ROOTS`, `WARPED_ROOTS`, `SHROOMLIGHT` (emisor de luz).
  Todos **estáticos** (sin crecimiento/oxidación). Durezas/DDD según
  paridad (`unit-paridad`).
- **Criterio:** `unit-sync`/`unit-recetas`/`unit-itemicons` en verde;
  glowstone/shroomlight iluminan (pipe de luz existente); magma daña al
  pisar (test).

---

## 5. Bloque D — Mobs y estructura del Nether

### D1 — Mobs (4, IA por especie existente)

- **Qué hacer:** subclases nuevas en `server/mob-species.js` con
  `MOB_CLASSES`/`tickSpecies`, `MOB_PARTS` + textura en
  `public/mobtextures.js`, drops/XP en `unit-paridad`, spawn por bioma del
  nether: **zombified piglin** (neutral: hostil solo si se le golpea;
  efecto dominó acotado), **ghast** (flota, dispara bolas de fuego
  explosivas con `server/projectiles.js`), **blaze** (flota, dispara
  ráfagas), **magma cube** (salta, se divide como el slime). **Piglin
  (neutral con oro, sin trueque) y wither skeleton como ampliación
  posterior** (documentado; no en la primera tanda).
- **Ficheros:** `server/mob-species.js`/`server/mobs.js`,
  `server/mob-spawn.js` (nether), `server/projectiles.js`,
  `public/mobtextures.js`, `tests/unit-fase24.js` + `unit-mobs-ia.js` +
  `unit-paridad.js`.
- **Criterio:** cada mob con su mecánica (neutralidad/dominó, proyectil,
  división) testeada; sin regresión en mobs del overworld.

### D2 — Fortaleza del Nether (simplificada)

- **Qué hacer:** estructura determinista (guía el patrón de
  `server/structures.js`): pasillos rectos de `NETHER_BRICKS` en bandas
  de ruido del nether, con **1-2 spawners de blaze** (patrón de spawner
  existente si se reusa el de mobs, o spawn por zona acotado) y **cofres**
  con loot del nether (glowstone, nether bricks, oro, blackstone).
  **Sin trampas de redstone** (Won't).
- **Ficheros:** `server/structures.js`/`server/nether-gen.js`,
  `server/chests.js` (loot), `tests/unit-fase24.js`.
- **Criterio:** fortaleza determinista y en su zona; spawner de blaze
  funcional (test); loot coherente.

---

## 6. Bloque E — Portal (solo el marco; se activa al completarse)

### E1 — Bloque obsidiana y marco de portal

- **Qué hacer:** bloque nuevo `OBSIDIAN` (minable con pico de diamante,
  dureza alta, inmune a fuego/lava) + **marco de portal** 4×5 (borde de
  obsidiana con el hueco interior de 2×3) que **se activa al completarse**:
  al colocarse la última obsidiana del marco, el interior se rellena con el
  bloque no sólido `PORTAL` (B nuevo, animado/efecto visual). **Sin
  mechero, sin gesto "usar"** (decisión de la entrevista). Romper una
  obsidiana del marco apaga el portal.
- **Ficheros:** `server/constants.js` + `public/constants.js`,
  `server/mining.js` (obsidiana), `server/world.js`/`generation.js`
  (detección del marco al colocar), `public/texturemap.js` (teselas),
  `tests/unit-fase24.js`.
- **Criterio:** test: completar el marco crea el interior `PORTAL`; romper
  el marco lo apaga; obsidiana requiere pico de diamante.

### E2 — Teletransporte entre dimensiones (8:1 con spawn seguro)

- **Qué hacer:** al entrar en el bloque `PORTAL` (colisión), el servidor
  cambia la dimensión (A1-A3): overworld→nether divide X/Z entre 8
  (redondeo MC) y busca **tierra firme** cerca (evitar caer en lava:
  recorrer Y de arriba abajo hasta un bloque sólido con aire encima);
  nether→overworld multiplica por 8 desde la salida conocida (la guardada
  en A2 o la original del portal). Sin coordenadas relativas entre
  portales (un portal por ahora, documentado).
- **Ficheros:** `server/net.js` (activación), `server/world.js`
  (spawnSeguro), `tests/unit-fase24.js` (8:1 + spawn seguro determinista).
- **Criterio:** test: portal en (x,y,z) lleva a (x/8, y', z/8) sobre
  tierra firme y volver restaura la posición original (A2); E2E con
  servidor vivo (F1).

---

## 7. Bloque F — Tests específicos de la fase

- **Qué hacer:** `tests/unit-fase24.js` cubriendo: persistencia por
  dimensión (A1), retrocompat de `positions` (A2), generación
  netherrack/bedrock/lava (B1), los 2 biomas (B2), bloques (iluminación,
  magma damage) (C1), 4 mobs + fortaleza (D1/D2), marco/portal (E1),
  conversión 8:1 + spawn seguro (E2). Sumar al registro de `tests/run.js`
  (ver `docs/tests.md`) y un E2E de dimensiones con servidor propio si el
  flujo WS lo permite.
- **Criterio:** `unit-fase24.js` en verde + toda la suite (unit + E2E +
  auditorías) en verde.

---

## 8. Bloque G — Cierre y auditoría de la Fase 24 (tarea obligatoria)

1. Suite unitaria completa en verde (incluidos `unit-fase24.js`,
   `unit-sync`, `unit-recetas`, `unit-paridad`, `unit-mobs-ia`,
   `unit-persistencia`), E2E clásicos + menú + E2E de dimensiones,
   `node --check` y `biome check` 0 errores.
2. Auditorías por fase sin regresiones (`audit-fase4` de generación,
   con el nether dentro de presupuesto).
3. Verificación manual en navegador: construir el marco, entrar al nether
   (8:1, tierra firme), explorar biomas/fortaleza, combatir ghast/blaze/
   magma cube, volver al overworld y recuperar la posición.
4. `SCHEMA_VERSION` **6 intacto** (A2 no sube versión; el nether reusa el
   formato v6 con otra carpeta) — salvo decisión explícita en la
   entrevista al abrir.
5. Docs al día: `docs/server/mecanicas.md` (dimensiones),
   `docs/README.md` (índice), `AGENTS.md` (estado — **el Won't de
   "dimensiones" se desbloquea aquí**), `TODO.md` (F24 cerrada).

---

## 9. Criterios de aceptación (resumen)

1. El nether persiste en `world/<semilla>/nether/` sin migrar la raíz del
   overworld (opción B) y la posición del jugador se guarda por dimensión
   **sin subir `SCHEMA_VERSION`** (retrocompatible).
2. El Nether genera en 128 bloques (piso/techo bedrock, lagos de lava,
   cuevas masivas) con 2 biomas deterministas (tests).
3. Los ~15 bloques del nether están sincronizados B/I + receta + icono
   (glowstone/shroomlight iluminan; magma daña al pisar).
4. Los 4 mobs funcionan con su IA característica (neutralidad/dominó,
   proyectiles, división) y la fortaleza tiene su spawner de blaze y loot;
   sin regresión en el overworld.
5. El marco de portal 4×5 se activa al completarse (sin mechero) y el
   teletransporte es 8:1 con spawn en tierra firme (test + E2E).
6. **Todos los tests en verde incluidos los específicos de la fase**
   (`unit-fase24.js`), Won't de la fase respetado y documentado, docs al
   día.

> **Tests que cubren esta fase (previstos):** `tests/unit-fase24.js`, `tests/audit-fase24.js`.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-15: creación del spec (documento de planificación de la fase 24).