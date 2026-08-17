# Fase 21 — Biomas ampliados, estructuras y más mobs (Spec)

> **Estado:** `[COMPLETADA]` (cerrada 2026-08-17 — ver bloque de cierre al
> final; la iteración v21.2 dejó **D2/D3 diferidos a la F21.5** por decisión
> del usuario en el cierre)

> Documento creado a partir de: `docs/Notas del usuario.md` ("Mejoras":
> "Biomas más grandes en extensión y nuevos biomas", "Estructuras estáticas
> (no dinámicas)" y "Más mobs y mejora de su IA"), del borrador del usuario
> `fase21-spec.md` (Descargas) y de la entrevista con el usuario (2026-08-12
> y 2026-08-15): estas mejoras grandes **no entran en las fases 19/19.5/19.6
> y 20**; se planifican aquí, como fase futura.
> Fecha: 2026-08-15 (actualizada 2026-08-17 — apertura) · Proyecto: clon de
> Minecraft. Estado: **en curso** — prerrequisito: **Fase 20 cerrada**
> (cumplido). Esta spec es de **alcance** (no de implementación): al abrir
> la fase se hace la entrevista del planificador para acotar qué
> biomas/estructuras/mobs entran en la primera tanda (P0 en `TODO.md`), el
> orden por valor percibido y los criterios de aceptación concretos.
> **P0: completada (2026-08-17)** — la primera tanda y el orden están en
> §5; los ítems no incluidos quedan diferidos a P1 (§5.2).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1-A5 | `Notas del usuario.md` Mejoras: \"Biomas más grandes en extensión y nuevos biomas\" | 20 biomas descritos (llanura, desierto, bosque, taiga, tundra nevada, montañas, pantano, jungla, sabana, badlands, océano, isla de champiñones, bosque oscuro, bosque de abedules, taiga de árboles gigantes, picos nevados, cuevas de lush, cuevas de dripstone, Nether Wastes, El End) — **solo los de la superficie/Overworld son viables sin dimensiones** (Nether/End son Won't, se documentan como inspiración) | Sin asignar | 🟠 |
| B1-B4 | `Notas del usuario.md` Mejoras: \"Estructuras estáticas (no dinámicas)\" | Estructuras pasivas (pozo del desierto, iglú, geoda de amatista) y activas (puesto de saqueadores, pirámide del desierto, templo de la jungla ya existe, cabaña del pantano, monumento oceánico, mansión del bosque, minas ya existen, fortaleza, naufragio ya existe, ruinas oceánicas) — **excluidas las villas** (Won't) | Sin asignar | 🟠 |
| C1-C5 | `Notas del usuario.md` Mejoras: "Más mobs y mejora de su IA" | Pasivos (vaca, oveja, gallina, pulpo), neutrales (lobo ya existe, enderman, zombified piglin, araña ya existe, abeja, gólem de hierro — **Won't**), hostiles (creeper/zombie/esqueleto ya existen, blaze/ghast **Won't**), jefes (dragón/wither **Won't**), sociales (aldeano **Won't**) — los viables sin desbloquear Won't: **vaca, gallina, pulpo, enderman, zombified piglin, abeja** | Sin asignar | 🟠 |
| D1 | Borrador F21 (Descargas) §4 (eliminado) | Selector de skins — **ya implementado en F17 C3** (9 skins procedurales + selector + `set_skin`); el borrador lo repetía → se elimina de esta fase | F17 C3 `[x]` | — |
| E1 | Borrador F21 (Descargas) §5 (adelantado) | Audio ambiental por bioma — **adelantado a la Fase 19.5** (decisión 2026-08-15, "gran mejora al proyecto"): la música generativa ya pasa a distinguir por bioma ahí; aquí no se duplica | F19.5 A1 | — |

**Won't respetado (de `Notas del usuario.md` "Futuro" y `TODO.md`):** no
entran en esta fase sin desbloqueo explícito del usuario: aldeanos y villas,
Wither, Dragón del End, Blaze, Ghast, Gólem de hierro, Ciudad Antigua, y las
dimensiones Nether/End (los biomas "Nether Wastes" y "El End" de las notas
se documentan como inspiración futura, no se implementan). Tampoco redstone,
clima, encantamientos/pociones, autenticación/BD externa. **Añadido en la
entrevista de 2026-08-15: Editor de skins → Won't** (el selector de skins
predefinidas ya existe desde F17 C3; un editor de skins personalizado queda
fuera de alcance por ahora).

---

## 1. Contexto

- **Prerrequisito:** Fase 20 cerrada (el proyecto estable, en rolling
  release). Esta fase es la **primera de contenido nuevo significativo** tras
  el ciclo de estabilización: añade variedad de mundo (biomas y estructuras)
  y fauna nueva, todo con las convenciones del proyecto (servidor
  autoritativo, `SCHEMA_VERSION` con migración si cambia el guardado,
  sincronización B/I en ambos `constants.js`, tests por mecánica).
- **Qué hay hoy (verificado):** 9 biomas (llanura, bosque, montaña, nieve,
  taiga, pantano, jungla, océano, sabana) con transiciones suaves (F11);
  estructuras: templo de jungla, naufragio, minas abandonadas, pozos de
  agua/lava (F6/F12); mobs: zombi, esqueleto, creeper, araña, lobo, conejo,
  slime, ocelote/gato, ahogado, oveja, pollo (`unit-mobs-*`, `unit-fase12`).
  El mundo es de 128 bloques (v6, −64..+63) — **las alturas de los biomas de
  montaña/picos se acotarán a este rango** (la subida de altura −64..255
  está documentada en las notas como limitación por rendimiento; si se
  decide abordarla, es prerrequisito técnico de esta fase y exige
  `SCHEMA_VERSION` 7 + migración + recalibración de minerales/auditorías).
- **Esta spec es de alcance, no de implementación:** al abrir la Fase 21 se
  hará la entrevista del planificador para acotar qué biomas/estructuras/mobs
  entran en la primera tanda, el orden por valor percibido y los criterios de
  aceptación concretos.

---

## 2. Bloque A — Biomas más grandes en extensión y nuevos biomas

### A1 — Biomas más grandes (extensión horizontal)

- **Qué hacer:** aumentar el tamaño de las regiones de bioma en
  `server/world.js` (escala del ruido de `getBiome` / interpolación) para que
  las llanuras/desiertos/etc. sean extensiones amplias y no parches pequeños;
  recalibrar `unit-biomas.js`, `unit-mundo.js` y `audit-fase4` (determinismo
  intacto: misma semilla = mismo mundo, solo cambia la escala).
- **Criterio:** test determinista: con la semilla fija, el radio de
  coherencia de cada bioma (mayoría del área) crece vs el actual; suite en
  verde.

### A2 — Biomas de superficie nuevos (viables en el Overworld)

- **Qué hacer:** implementar los biomas de superficie de las notas que faltan
  (cada uno con su paleta de bloques, vegetación y mobs — reusando bloques/
  ítems existentes; si un bloque nuevo es imprescindible, sincronizar B/I +
  receta + icono, regla de AMBOS `constants`): **tundra nevada** (nieve/
  hielo), **badlands** (terracota por capas — requiere el bloque terracota o
  se reusa arena/arcilla documentado), **isla de champiñones** (micelio +
  hongos), **bosque oscuro** (roble oscuro denso), **bosque de abedules**,
  **taiga de árboles gigantes** (troncos 2×2), **picos nevados** (variante de
  montaña alta con nieve), **desierto** (arena + cactus), **sabana**
  (acacias) si faltan. Los biomas subterráneos (cuevas de lush/dripstone) se
  valoran en una segunda tanda (requieren bloques nuevos: bayas luminosas,
  dripstone).
- **Ficheros:** `server/world.js` (generación), `server/constants.js` +
  `public/constants.js` (bloques nuevos si aplica), `public/textures.js` +
  `texturemap.js` (teselas), `recetas.json` (recetas de bloques nuevos),
  `tests/unit-biomas.js` (ampliado), `docs/server/mecanicas.md`.
- **Criterio:** cada bioma nuevo genera con su paleta/vegetación (test
  determinista por bioma); bloque nuevo → B/I sincronizados + receta + icono
  + `unit-sync`/`unit-recetas` en verde; sin romper los tests de generación
  existentes.

---

## 3. Bloque B — Estructuras estáticas (no dinámicas)

### B1 — Estructuras pasivas

- **Qué hacer:** **pozo del desierto** (fuente de agua con soporte),
  **iglú** (solo el edificio — el sótano con mesa de pociones se documenta
  como opcional), **geoda de amatista** (subterránea, decorativa) — todas
  deterministas por hash 2D (patrón F12: `temploTrapCooldowns`,
  `hash` de estructura), con `STRUCTURES`/generación en `server/world.js`.
  **Nota (2026-08-15):** los bloques/ítems de amatista (`AMETHYST_BLOCK`,
  `AMETHYST_CLUSTER`, `AMETHYST_SHARD`) **los aporta la Fase 22 (B1)**;
  esta geoda los **reusa** y suelta shards desde los clusters (para el
  catalejo de la F22 B2). No añadir IDs de amatista duplicados aquí.
- **Ficheros:** `server/world.js`, `server/chests.js` (loot si aplica),
  `tests/unit-fase21.js` (determinismo), `docs/server/mecanicas.md`.
- **Criterio:** cada estructura aparece solo en su bioma y es determinista
  (misma semilla = misma posición); sin bloques nuevos si no hace falta
  (los de amatista vienen de la F22).

### B2 — Estructuras activas (peligrosas, con botín)

- **Qué hacer:** **pirámide del desierto** (trampa de TNT + cofres),
  **cabaña del pantano**, **puesto de saqueadores** (torre), **mansión del
  bosque** (en bosque oscuro), **fortaleza** (subterránea), **ruinas
  oceánicas** y **monumento oceánico** (en océano profundo) — acotar el
  alcance en la entrevista (las más costosas — mansión, monumento — pueden
  quedar para tandas siguientes). Reusar `explode()`/trampas existentes;
  mobs asociados solo si ya existen (saqueadores no existen → el puesto puede
  quedar vacío o con mobs existentes, decisión de la entrevista).
- **Ficheros:** `server/world.js`, `server/mobs.js` (spawn asociado si
  aplica), `server/chests.js` (loot), `tests/unit-fase21.js`.
- **Criterio:** estructura determinista y en su bioma; la trampa funciona
  (test de TNT existente reusado); loot coherente; suite en verde.

---

## 4. Bloque C — Más mobs y mejora de su IA

### C1 — Mobs pasivos nuevos (viables)

- **Qué hacer:** **vaca** (ordeñable con cubo → leche; deambula/huye/sigue
  trigo), **gallina** (pone huevos; lanzarlos 1/8 pollito; flota al caer),
  **pulpo** (en agua, tinta al morir → tinte negro si el ítem existe o se
  añade sincronizado). Oveja ya existe (comer pasto para regenerar lana se
  puede refinar). Mismo patrón F12: subclase con `tickSpecies`/`onDeath`,
  `MOB_PARTS` + atlas en `mobtextures.js`, drops y cría en `MOB_XP`/
  `unit-paridad`.
- **Ficheros:** `server/mobs.js` (subclases), `server/constants.js` +
  `public/constants.js` (ítems nuevos si aplica), `public/mobtextures.js`,
  `recetas.json` (leche no es crafteable — decisión), `tests/unit-fase21.js`
  + `unit-paridad.js` (drops/XP), `docs/server/mecanicas.md`.
- **Criterio:** cada mob con su mecánica (deambular/ordeñar/poner huevos/
  tinta), test por mecánica, drop/XP en `unit-paridad`, textura nueva.

### C2 — Mobs neutrales nuevos (viables)

- **Qué hacer:** **enderman** (pacífico hasta mirarlo/dispararle;
  teletransporte y golpe; alérgico al agua; recoge bloques), **zombified
  piglin** (neutral; efecto dominó al golpear a uno; se calma al alejarse),
  **abeja** (poliniza flores, pica y muere; colmena si se añade el bloque
  sincronizado). Son los neutrales de las notas que no son Won't (gólem de
  hierro queda fuera).
- **Ficheros:** los de C1 + `public/mobs.js` (IA de teletransporte), tests.
- **Criterio:** mecánica de neutralidad por mob (solo agrede si se le
  provoca) con tests de IA (`unit-mobs-ia.js` ampliado); sin regresión en
  los mobs existentes.

### C3 — Mejoras de IA de mobs existentes (refinamiento)

- **Qué hacer:** creeper que huye de gatos (ya existen ocelotes/gatos),
  zombi que convoca a otros al recibir daño (acotado), esqueleto con strafe
  lateral y distancia, araña de día neutral / de noche hostil y que escala
  paredes (acotado a lo que la física actual permita). Cada mejora con test.
- **Ficheros:** `server/mobs.js` (tickSpecies), `tests/unit-mobs-ia.js`.
- **Criterio:** comportamiento documentado y testeado por especie; sin
  cambios de protocolo ni de guardado.

---

## 5. Entrevista del planificador (P0) — primera tanda por valor percibido

> Entrevista P0 completada el **2026-08-17** (sesión del planificador con el
> usuario, tras la apertura de la fase): se acota la primera tanda
> (biomas/estructuras/mobs), el orden de implementación y los criterios de
> aceptación por bloque. Lo que no entra en P0 queda **diferido a P1** (se
> documenta aquí, no se elimina del TODO). El criterio transversal es el
> **valor percibido por coste**: el jugador nota la variedad de mundo y la
> fauna al explorar, así que se prioriza lo visible y barato (reuso de
> bloques/ítems/patrones existentes) sobre lo caro o dependiente de la F22.

### 5.1 Primera tanda (P0) — por valor percibido

| Orden | Bloque | Ítems de P0 | Por qué entra (valor/coste) | Estado (2026-08-17) |
| --- | --- | --- | --- | --- |
| 1 | **A1** | Escala de biomas (extensión horizontal) | Cambio de una constante (`BIOME_FREQ`) que hace TODO el mundo más variado; coste mínimo, efecto máximo | ✅ **Implementado + testeado** (`65563d7`: `unit-fase21.js`; `BIOME_FREQ` 0.003) |
| 2 | **A2** | Sub-biomas baratos: **bosque de abedules**, **taiga de árboles gigantes** (2×2), **picos nevados** | Reusan bloques/árboles existentes (abedul, abeto, nieve); ~1/3 de cada banda base queda como variante visible sin bloques nuevos | 🔨 Implementado en el árbol (sin commitear): `server/biomes.js` (gates `SUBBIOME_FREQ`/`PEAK_GATE`) + `server/generation.js` (abeto 2×2) |
| 3 | **A2** | Biomas de superficie restantes **solo si reusan bloques existentes** (sabana con acacias, badlands con terracota/arena, bosque oscuro, isla de champiñones) | El resto de biomas nuevos de la spec que no exigen bloques sincronizados nuevos; se valoran en orden de coste tras los sub-biomas | ⏳ Pendiente de P0 (decisión por bioma al implementar) |
| 4 | **B1** | **Pozo del desierto** | Estructura pequeña y muy reconocible; patrón hash-2D ya existente (templo/naufragio); sin bloques nuevos | 🔨 Implementado en el árbol (sin commitear): `server/structures.js` (`WELL_CELL` 40×40, gate 7 %, solo desierto firme) |
| 5 | **B2** | ~~Pirámide del desierto~~ (trampa TNT + cofres) | Reusa la trampa/explosión existentes (F10/F11) y el loot de cofres; complementa al pozo en el mismo bioma | ⏳ **Diferido a P1** (decisión de la entrevista: la v21.1 se acota a A1+A2+B1+C1) |
| 6 | **C1** | **Vaca** (ordeñable con cubo → leche) y **gallina** (pone huevos; 1/8 pollito) | Los dos animales de granja que faltan; patrón F12 (subclase + `tickSpecies`/`onDeath` + drops/XP) ya consolidado; alto valor de juego (alimento/cría) por coste medio | ✅ Implementado en el árbol (sin commitear): `server/constants.js`/`public/constants.js` (`I.MILK` 260, `I.EGG` 261), `tickChicken` en `server/mob-species.js`, `handleMilkCow` en `server/actions.js` + `net.js`, click derecho con cubo en `game-input.js`, iconos en `itemicons.js` (huevo lanzable 1/8 pollito diferido a P1) |
| 7 | **C2** | ~~Enderman~~ (neutralidad: solo agrede al mirarlo; teletransporte ya probado en `unit-mobs-ia`) | El neutral más icónico de las notas; la IA de teletransporte ya existe y se testea; mecánica acotada (agua, teletransporte, sin recoger bloques en P0) | ⏳ **Diferido a P1** (decisión de la entrevista: la v21.1 se acota a A1+A2+B1+C1) |

### 5.2 Diferido a P1 (segunda tanda)

- **A2**: cuevas de lush/dripstone (requieren bloques nuevos: bayas
  luminosas, dripstone) → P1, con sincronización B/I + receta + icono.
- **B1**: iglú (solo edificio) y **geoda de amatista** → P1: la geoda
  depende de los bloques de amatista de la **Fase 22 (B1)** (la F21 los
  reusa, no los crea — `TODO.md` D2).
- **B2**: **pirámide del desierto** (trampa TNT + cofres; diferida de la
  P0 en la entrevista), cabaña del pantano, puesto de saqueadores (sin
  saqueadores: se decide dejarlo vacío o con mobs existentes), fortaleza y
  ruinas/monumento oceánico → P1 (las más caras — mansión del bosque,
  monumento oceánico — quedan fuera de esta fase si el presupuesto no da;
  decisión de cierre).
- **C1**: pulpo (tinta → tinte negro, requiere ítem nuevo sincronizado o
  reuso documentado), refinamiento de la oveja (comer pasto) y **huevo
  lanzable 1/8 pollito** → P1.
- **C2**: **enderman** (diferido de la P0 en la entrevista), zombified
  piglin (efecto dominó) y abeja (requiere colmena/
  miel como bloques nuevos) → P1.
- **C3**: mejoras de IA de mobs existentes (creeper huye de gatos,
  esqueleto strafe, araña día/noche, zombi convoca) → P1, con tests por
  especie.

### 5.3 Criterios de aceptación de P0 (por bloque)

1. **A1/A2 (sub-biomas)**: misma semilla = mismo mundo (determinismo);
   cada sub-bioma muestrea en el rango de tests (`unit-fase21.js` /
   `unit-biomas.js`) y su vegetación es la esperada (abedul en
   `birch_forest`, abeto 2×2 en `giant_taiga`, nieve en `snowy_peaks`);
   los 8 biomas base siguen presentes.
2. **B1 (pozo)**: solo en desierto firme (nunca sobre agua), determinista
   por hash-2D, fuente de agua central con lecho de arena; los tests de
   mundo ("charco válido") no se rompen.
3. **B2 (pirámide, diferida a P1)**: determinista en desierto (hash 2D,
   patrón `wellAt`), trampa de TNT funcional (cadena `explode()` reusada,
   test F11 como patrón), loot de cofres coherente — asserts previstos en
   `unit-fase21.js` (bloque aún no implementado en la v21.1; ver la fila
   B2 de `docs/tests.md`).
4. **C1/C2 (vaca, gallina, enderman)**: mecánica característica con test
   por mecánica (ordeñar, poner huevos, neutralidad/teletransporte);
   drops/XP en `unit-paridad`; texturas nuevas; sin regresión en los mobs
   existentes.
5. **Transversal**: sin bloques/ítems nuevos salvo los ya previstos (los
   de amatista vienen de la F22); `SCHEMA_VERSION` 6 intacto; sin cambios
   de protocolo WS ni de IDs B/I.

### 5.4 Iteración v21.2 — bugs de generación de las Notas (definida 2026-08-17)

> Alcance: los **3 bugs de generación abiertos** de `Notas del usuario.md`
> (sección "Bugs abiertos", añadidos por el usuario 2026-08-17). Iteración
> de corrección de generación: **sin cambios de protocolo WS, de IDs B/I ni
> de `SCHEMA_VERSION`** (criterio del ciclo); el determinismo por semilla
> se mantiene (mismo mundo, solo cambia la forma del terreno). Los ítems de
> contenido P1 (pirámide, enderman, biomas restantes...) NO entran aquí.
>
> **Estado al cierre de la F21 (2026-08-17):** **D1 completado** (commit
> `f9eca90`, auditado en `tests/audit-fase21.js`); **D2 y D3 diferidos a la
> Fase 21.5** (decisión del usuario en el cierre — siguen en las tablas
> `TODO.md` de la F21.5 como ítems de su iteración de generación).

| # | Bug (Notas) | Qué hacer | Criterio de aceptación | Estado |
|---|---|---|---|---|
| **D1** | **Ríos demasiado altos** — el agua no llega al nivel del mar, parecen un bug de generación | Bajar el lecho de los ríos hasta el nivel del mar **adaptando el terreno circundante** (las orillas se hunden gradualmente hacia el cauce); **disminuir la densidad** de ríos sin que el cambio se note; **variar anchos** (estrechos y amplios) y **aumentar un poco la profundidad** | Test determinista: todo río tiene agua en su cauce al nivel del mar (lecho ≤ `SEA_LEVEL`), las orillas son contiguas sin acantilados (salto ≤ 4, patrón `unit-biomas` §5), la densidad baja sin quebrar `unit-mundo` | ✅ **Completado** (`f9eca90`) |
| **D2** | **Océanos poco profundos** — sin variantes cálidas/profundas | **Aumentar la profundidad** del fondo oceánico (más lejos de la costa); **océano cálido** con **corales** (bloques/ítems nuevos sincronizados B/I + receta + icono si se añaden) y **océano profundo** (fondo más hondo); **no aumentar la probabilidad** de océano (`OCEAN_FREQ`/`OCEAN_GATE` intactos) | Test determinista: la profundidad media del fondo crece vs v21.1; existen regiones de océano cálido (con coral en su paleta) y profundo; `unit-biomas`/`unit-mundo` en verde | ⏭️ **Diferido a F21.5** |
| **D3** | **Montañas bajas** — sin montañas altas ni nevadas | **Elevar las montañas base** (amplitud de la rampa/crest en `biomes.js`) manteniendo el rango v6 (Y ≤ +63) y los sub-biomas; los **picos nevados** (F21 A2) quedan sobre montañas realmente altas | Test determinista: la cima media/máxima de montaña crece vs v21.1 (dentro del presupuesto de `audit-altura`), la línea de nieve cubre más cumbres y `unit-biomas` (montaña máx ≥ 7) se recalibra sin romperse | ⏭️ **Diferido a F21.5** |

**Orden:** D1 (ríos) → D2 (océanos) → D3 (montañas) — los tres tocan
`server/biomes.js`/`server/generation.js`; cada uno con su test y su
verificación (`--audit` sin regresiones). **Cierre de la v21.2**: suite
unitaria + E2E + `--audit` en verde, `node --check`, biome 0, verificación
manual en navegador (explorar ríos/océanos/montañas con semilla conocida) y
`docs/v21.2.md` con la iteración (formato `docs/v20.2.md`). **Al cerrar la
F21, D1 quedó hecho y D2/D3 se difirieron a la F21.5**, que continuará el
ciclo de iteración de generación sobre ellos.

---

## 6. Cierre y auditoría de la Fase 21 (tarea obligatoria)

Al implementarse (tras la entrevista del planificador), esta fase cierra con:

1. Suite unitaria completa en verde (incluidos `unit-fase21.js`,
   `unit-biomas.js`, `unit-mobs-ia.js`, `unit-paridad.js`, `unit-sync`),
   E2E clásicos 6/6 + menú 7/7, `node --check` y `biome check` 0 errores.
2. Auditorías por fase sin regresiones (incluida `audit-fase4` de
   generación: biomas/estructuras nuevas dentro de presupuesto; si se sube
   la altura del mundo, `audit-altura` recalibrada).
3. Verificación manual en navegador: explorar biomas nuevos, encontrar las
   estructuras (semilla conocida), interactuar con los mobs nuevos.
4. `SCHEMA_VERSION` 7 **solo si** cambia el formato (p. ej. subida de
   altura o persistencia nueva) con migración retrocompatible + test;
   si no, `SCHEMA_VERSION` 6 intacto.
5. Docs al día: `docs/server/mecanicas.md` (biomas/estructuras/IA),
   `docs/README.md` (índice), `AGENTS.md` (estado), `TODO.md` (F21 cerrada).

---

## 7. Criterios de aceptación (resumen)

1. Los biomas nuevos y ampliados generan de forma determinista con su
   paleta/vegetación (test por bioma) sin romper la generación existente.
2. Las estructuras nuevas aparecen solo en su bioma, son deterministas y
   sus trampas/loot funcionan (tests + manual).
3. Los mobs nuevos tienen su mecánica característica y su IA neutral/hostil
   correcta, con tests; los mobs existentes no regresan.
4. Todo bloque/ítem nuevo está sincronizado B/I con receta e icono
   (`unit-sync`/`unit-recetas`/`unit-itemicons` en verde).
5. Won't respetado íntegramente (aldeanos/villas, jefes, blaze/ghast,
   gólem, Nether/End, clima, redstone, encantamientos).
6. Cierre con suite/E2E/auditorías en verde, docs al día y auditoría final
   de la fase.

> **Tests que cubren esta fase (previstos):** `tests/unit-fase21.js` (creado
> 2026-08-17 con los asserts de **A1** — coherencia de rachas, determinismo
> y presencia de los 8 biomas base —, **A2** — bandas coherentes de los
> sub-biomas, abedul 100 % en `birch_forest`, abeto 2×2 en `giant_taiga`,
> nieve en las cumbres de `snowy_peaks` —, **B1** — pozo del desierto
> determinista, solo en desierto firme y con su layout MC —, **B2** —
> pirámide (determinismo/footprint/trampa/cofres/TNT/pozo + loot), **C1** —
> vaca ordeñable y gallina ponedora (MILK/EGG) — y **C2** — enderman
> neutral en radianes) y `tests/audit-fase21.js` (25 checks end-to-end:
> pirámide en chunks reales, ríos D1, radianes del enderman y IA C3);
> **ampliado** `unit-biomas.js` (A1 escala + A2 biomas nuevos + recalibración
> v21.2 D1), `unit-mundo.js` (A1), `unit-recetas.js` (`DROPS_JUSTIFICADOS`
> con MILK/EGG); **recalibrado** `audit-altura.js` (v21.2 D1: las columnas
> de agua no cuentan como terreno de montaña). (La matriz bloque → test
> completa está en `docs/tests.md` §Fase 21.)

---

## 8. Cierre de la Fase 21 (2026-08-17)

**Estado: `[COMPLETADA]`.** Cierre de la fase con el **ciclo rolling de la
v21.2**: los bugs de generación de las Notas se abordan como iteración y al
cerrar la fase el usuario decidió **diferir D2/D3 a la Fase 21.5** (océanos
profundos/cálidos con coral y montañas altas siguen en las filas D2/D3 de su
`TODO.md`). Resumen del cierre:

1. **Código:** A1 biomas más grandes, A2 sub-biomas (abedul, taiga gigante
   2×2, picos nevados), B1 pozo del desierto, B2 pirámide del desierto (con
   trampa TNT posicional + 4 cofres), C1 vaca/gallina (MILK/EGG
   sincronizados B/I), C2 enderman neutral (mirada en radianes), C3 IA
   (zombi convoca ≤16, esqueleto strafe lateral 6-12 alternando, araña
   neutral de día, creeper huye de gatos) y D1 ríos al nivel del mar
   (v21.2).
2. **Tests:** `unit-fase21.js` (bloques A1/A2/B1/B2/C1/C2), `unit-biomas.js`
   y `audit-altura.js` recalibrados (D1), `unit-recetas.js` en verde
   (MILK/EGG justificados) y `tests/audit-fase21.js` nueva (25 checks).
   Suite **61 unitarios en verde**, `--audit` **8/8**, `node --check`
   limpio.
3. **Protocolo/persistencia:** sin cambios de IDs B/I, protocolo WS ni
   `SCHEMA_VERSION` (sigue 6).
4. **Docs:** spec marcada `[COMPLETADA]`, `STATUS.md`, `TODO.md`,
   `docs/tests.md` y `AGENTS.md` al día; `docs/server/mecanicas.md`
   actualizado con biomas/estructuras/IA.

**Commits del cierre:** `5ffe226` (C2/C3 + pirámide), `f9eca90` (D1 ríos),
`de4c9d0` (tests B2/C1/C2), `00bd990` (auditoría de la fase), más la
documentación y el cierre en commits de docs. **Etiqueta:** `v21.2` (cierre
de la iteración de generación con D1).

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-12: creación del spec (documento de planificación de la fase 21).

**Cambios en esta spec (v2):**
- 2026-08-15: actualización de la entrevista (exclusiones y alcance definitivo de biomas/estructuras/mobs).

**Cambios en esta spec (v3):**
- 2026-08-17: apertura de la Fase 21 (prerrequisito F20 cumplido con la
  v20.2) — estado `[EN CURSO]`, spec pasa de alcance a fase activa con
  planificación P0 (entrevista del planificador) en `TODO.md`.

**Cambios en esta spec (v4):**
- 2026-08-17: **P0 completada** — nueva sección §5 con la primera tanda por
  valor percibido (A1 + sub-biomas A2 + pozo B1 + pirámide B2 + vaca/gallina
  C1 + enderman C2), los diferidos a P1 (§5.2) y los criterios de aceptación
  por bloque (§5.3); cabecera y §1 actualizadas; cierre y criterios
  renumerados a §6/§7.

**Cambios en esta spec (v5):**
- 2026-08-17: **v21.1 acotada en la entrevista a A1+A2+B1+C1** — pirámide
  B2 y enderman C2 pasan a §5.2 (diferidos a P1); estado de la tabla §5.1
  actualizado: A2 y B1 implementados en el árbol, **C1 implementado**
  (`I.MILK` 260/`I.EGG` 261 sincronizados, `tickChicken`, `handleMilkCow`),
  huevo lanzable 1/8 pollito diferido a P1; los tests de la tanda quedan
  para el final (decisión del usuario).

**Cambios en esta spec (v6):**
- 2026-08-17: **v21.2 definida** — nueva sección §5.4 con los 3 bugs de
  generación abiertos de las Notas (D1 ríos al nivel del mar, D2 océanos
  profundos/cálidos con coral, D3 montañas altas y nevadas), su orden,
  criterios de aceptación por bug (test determinista) y el cierre de la
  iteración; sin cambios de protocolo/IDs/SCHEMA_VERSION.

**Cambios en esta spec (v7):**
- 2026-08-17: **cierre de la Fase 21** — spec marcada `[COMPLETADA]`,
  bloque de cierre §8 añadido (commits, suite 61/61, `--audit` 8/8, etiqueta
  `v21.2`); **D2/D3 de la v21.2 diferidos a la Fase 21.5** por decisión del
  usuario (tablas §5.4 y `TODO.md` de la F21.5 actualizadas); cabecera y
  "Tests que cubren esta fase" puestos al día.
