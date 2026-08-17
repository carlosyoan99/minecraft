# Fase 21 — Biomas ampliados, estructuras y más mobs (Spec prospectiva)

> **Estado:** `[EN CURSO]` (abierta 2026-08-17 — Fase 20 cerrada con la
> v20.2: suite 60/60, E2E 7/7, `--audit` 7/7, biome 0, etiqueta `v20.2`)

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

## 5. Cierre y auditoría de la Fase 21 (tarea obligatoria)

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

## 6. Criterios de aceptación (resumen)

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
> 2026-08-17 con los asserts de A1 — coherencia de rachas, determinismo y
> presencia de los 8 biomas base) y `tests/audit-fase21.js` (pendiente, al
> cierre); el primero se ampliará con los asserts de biomas/estructuras/mobs
> de los bloques A2-C; **ampliar**
> `unit-biomas.js` (A1 escala + A2 biomas nuevos), `unit-mundo.js` (A1),
> `unit-mobs-ia.js` (C2 neutralidad + C3 IA), `unit-paridad.js` (C1
> drops/XP), `unit-sync.js`/`unit-recetas.js`/`unit-itemicons.js` (bloques
> nuevos B/I); **recalibrar** `audit-fase4.js` (A1 sin romper el
> determinismo). (Cada test nuevo lleva `// Fase 21, Bloque X` al inicio;
> la matriz bloque → test completa está en `docs/tests.md` §Fase 21.)

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
