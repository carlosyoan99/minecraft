# Fase 25 — End Update (segunda dimensión, sin dragón) (Spec)

> **Estado:** `[PROSPECTIVA]`

> Documento creado a partir de: `docs/Notas del usuario.md` (sección
> "Dimensiones: Nether y End", 2026-08-15) y la entrevista 2026-08-15
> (numeración: F24 = Nether Update; **F25 = End Update**; el **dragón del
> End queda descartado temporalmente** — documentado). Las dimensiones
> siguen **Won't hasta abrir sus fases** (F24 desbloquea la infraestructura;
> esta fase extiende a la segunda dimensión).
> Fecha: 2026-08-15 · Proyecto: clon de Minecraft.
> Estado: **prospectiva (sin implementar)** — prerrequisito: **Fase 24
> cerrada** (reusa la infraestructura de dimensiones: guardado por
> carpeta, posición por dimensión, protocolo WS).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | Notas "Dimensiones" y entrevista | **End básico sin dragón**: islas flotantes de end stone, end stone bricks, chorus plant/flower estáticos, isla principal con pilares de obsidiana **decorativos** (sin dragón), portal de regreso al overworld | F25 A1 | 🔴 |
| A2 | Notas "Dimensiones" | **Endermite** (hostil pequeño, al lanzar ender pearl o spawn natural) y **enderman** (ya existe en F21 C2, puede spawnear en el End) | F25 A2 | 🟠 |
| A3 | Notas "Dimensiones" | **Persistencia**: `world/<semilla>/end/` (opción B) + `positions.end` (A2/F24 ampliado) | F25 A3 | 🟠 |
| A4 | Notas "Dimensiones" | **Tests específicos** (`unit-fase25.js`) | F25 A4 | 🟢 |
| B1 | Notas "Dimensiones" y entrevista | Cierre y auditoría de la fase | F25 B1 | 🟢 |

**Won't de la fase (documentado):** **dragón del End** (descartado
temporalmente — con él sus cristales, el portal de salida del dragón y la
ciudad del End/élitro quedan como **inspiración Futuro**), shulker con
levitación (diferido), cultivo de chorus (crecimiento — los árboles se
generan estáticos), efectos de levitación (sin estado de levitación),
redstone, comercio, NBT, encantamientos/pociones, clima, Nether/End
extras. **El jugador solo puede salir del End por el portal de regreso**
(no hay portal de salida del dragón).

---

## 1. Contexto

- **Prerrequisito:** Fase 24 cerrada (infraestructura de dimensiones
  lista: carpeta por dimensión, `positions`, `enter_dimension`/
  `dimension_change` + `init`). Esta fase añade la **segunda dimensión**:
  un espacio de exploración/recolección sin jefe, acotado a lo que el
  usuario decidió ("End sin dragón es difícil, pero necesario por ahora").
- **Qué hay hoy (para F25):** la infraestructura de la F24 (activar una
  dimensión, guardado por carpeta, posición por dimensión, protocolo);
  `enderman` ya implementado en la F21 (teletransporte, alérgico al agua;
  en el End no hay agua); sistema de mobs (`MOB_CLASSES`/`tickSpecies`);
  proyectiles (para shulker en una ampliación posterior); `server/
  structures.js` para la isla principal/pilares.
- **Decisiones de la entrevista:** **sin dragón** (se documenta su
  descarte temporal y qué queda como Futuro); el End es **exploración y
  recolección** (end stone, chorus fruit estático, endermite); se reusa
  la opción B de guardado (`world/<semilla>/end/`) y la posición por
  dimensión; **todos los tests en verde + tests propios en verde**.

---

## 2. Bloque A — End básico (sin dragón)

### A1 — Generación: islas flotantes y isla principal

- **Qué hacer:** generador `generateEndChunk` (en `server/generation.js`
  o módulo `end-gen.js`): **islas flotantes** de end stone sobre el vacío
  (ruido 2D para la distribución de islas, patrón de las islas del
  overworld pero suspendidas; debajo → vacío total); **cero árboles/
  musgo** (solo end stone y chorus en las zonas designadas por hash);
  **isla principal** en el centro (la del "dragón" en MC) con **pilares de
  obsidiana decorativos** (sin dragón ni cristales) — documentado.
  Semilla derivada (hash semilla + "end"). Sin cielo/luz solar; luz
  constante baja (como el nether).
- **Qué no incluir:** ciudad del End/élitro (Futuro), cristales, portal de
  salida del dragón.
- **Ficheros:** `server/generation.js`/`server/end-gen.js`,
  `server/constants.js` (+`public`), `server/structures.js` (isla
  principal/pilares), `tests/unit-fase25.js`, `docs/server/mecanicas.md`.
- **Criterio:** test determinista: misma semilla = mismo end; existe una
  isla principal con pilares; las islas flotantes están sobre vacío; sin
  romper la generación del overworld/nether.

### A2 — Bloques del End (~6) y chorus estático

- **Qué hacer:** bloques nuevos B (B/I sincronizados + tesela + icono +
  receta si aplica): `END_STONE`, `END_STONE_BRICKS`, `PURPUR_BLOCK`,
  `PURPUR_PILLAR`, `END_ROD` (emisor de luz, decorativo), `CHORUS_PLANT`/
  `CHORUS_FLOWER` (bloques de tallo/flor **estáticos**, generados como la
  vegetación existente, **sin crecimiento con el tiempo** — documentado).
  Obsidiana y bedrock ya existen (F24/F15).
- **Qué no incluir:** crecimiento de chorus, ender pearl nuevo (solo el
  drop del enderman si existe), dragón head (Futuro).
- **Ficheros:** `server/constants.js` + `public/constants.js`,
  `public/texturemap.js` (teselas), `server/generation.js`,
  `tests/unit-fase25.js`.
- **Criterio:** `unit-sync`/`unit-recetas`/`unit-itemicons` en verde;
  end rod ilumina; chorus se genera estático (test determinista).

### A3 — Mobs: enderman (existente) y endermite

- **Qué hacer:** **enderman** ya existe (F21 C2: teletransporte, recoge
  bloques) — se permite su spawn en el End (0-1 en islas, `mob-spawn.js`);
  **endermite** nuevo: hostil pequeño (0.3×0.3), salta/débil, aparece al
  lanzar una ender pearl (si el ítem existe) o spawn raro natural en el
  End; se hunde/desaparece solo tras 2 min (simplificado). Patrón
  `MOB_CLASSES`/`tickSpecies` + `MOB_PARTS` + textura + drops/XP
  (`unit-paridad`).
- **Qué no incluir:** shulker (diferido; su proyectil con daño se valoró
  pero el usuario lo dejó fuera del básico — documentado como ampliación
  posterior), levitación.
- **Ficheros:** `server/mob-species.js`/`server/mobs.js`,
  `server/mob-spawn.js`, `public/mobtextures.js`, `tests/unit-fase25.js`
  + `unit-mobs-ia.js`.
- **Criterio:** enderman aparece en el End sin regresión; endermite con
  su comportamiento (spawn por pearl si aplica, desaparición) testeado.

### A4 — Portal de regreso y persistencia

- **Qué hacer:** **portal de regreso** (estructura/bloque especial — se
  define en la entrevista al abrir: reusar el marco de la F24 con otra
  textura, o un bloque dedicado): al entrar, te devuelve al overworld
  (posición guardada en `positions.overworld`); sin coordenadas relativas
  (doc). **Persistencia:** `world/<semilla>/end/` (opción B, patrón F24
  A1) + `positions.end` en el jugador (F24 A2 ampliado con la tercera
  entrada). El inventario/salud/XP siguen compartidos.
- **Ficheros:** `server/constants.js`/`world-session.js` (tercera
  dimensión), `server/net.js` (teletransporte), `server/save-players.js`,
  `tests/unit-fase25.js`.
- **Criterio:** test: entrar al end guarda `positions.end`; el portal de
  regreso restaura `positions.overworld`; `SCHEMA_VERSION` 6 intacto;
  retrocompat (archivo sin `positions.end` funciona).

---

## 3. Bloque B — Tests específicos y cierre

- **Qué hacer:** `tests/unit-fase25.js` cubriendo: generación (isla
  principal + islas flotantes + vacío), bloques (end rod ilumina, chorus
  estático), mobs (endermite spawn/desaparición), persistencia
  (end/overworld) y portal de regreso. Sumar al registro de `tests/run.js`
  (`docs/tests.md`).
- **Cierre (tarea obligatoria):** suite completa en verde (incluidos
  `unit-fase25.js`, `unit-sync`, `unit-recetas`, `unit-paridad`,
  `unit-persistencia`), E2E clásicos + menú + E2E de dimensiones (reusado
  de F24), `node --check` y `biome check` 0 errores; auditorías sin
  regresiones; verificación manual (explorar el end, recolectar end stone/
  chorus, endermite, volver por el portal); `SCHEMA_VERSION` **6 intacto**;
  docs al día (`docs/server/mecanicas.md`, `docs/README.md`, `AGENTS.md`,
  `TODO.md`).
- **Criterio:** **todos los tests en verde incluidos los específicos de
  la fase**, Won't respetado (dragón descartado documentado), docs al día.

---

## 4. Criterios de aceptación (resumen)

1. El End genera determinista (islas flotantes sobre vacío + isla
   principal con pilares de obsidiana decorativos) sin romper overworld/
   nether.
2. Los bloques del End están sincronizados B/I + receta + icono (end rod
   ilumina; chorus estático, sin crecimiento).
3. Enderman aparece en el End sin regresión y el endermite tiene su
   comportamiento (spawn/desaparición) testeado.
4. El portal de regreso vuelve al overworld y la posición se guarda por
   dimensión (`positions.end`) con `SCHEMA_VERSION` 6 intacto y retrocompat.
5. **El dragón del End NO se implementa** (descartado temporalmente;
   cristales/ciudad/élitro/levitación documentados como Futuro).
6. **Todos los tests en verde incluidos los específicos de la fase**
   (`unit-fase25.js`), Won't respetado y documentado, docs al día.

> **Tests que cubren esta fase (previstos):** `tests/unit-fase25.js`, `tests/audit-fase25.js`.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-15: creación del spec (documento de planificación de la fase 25).