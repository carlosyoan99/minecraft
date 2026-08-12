# Fase 18 — Refactor a convenciones, cierre de fases y pulido (Spec)

> Documento creado a partir de: `docs/Notas del usuario.md` ("Próximas Fases":
> la 18 es "Bugs, paridad y rendimiento, nada de nuevas características, solo
> pulir las que ya tenemos. Refactorizado de los módulos a las convenciones ya
> establecidas en CLAUDE.md y mejorar la documentación en general"),
> `docs/auditoria-2026-08-11.md` (la más reciente), `docs/reporte-paridad.md`,
> `TODO.md` y la entrevista con el usuario (2026-08-12, Tandas 1-3).
> Fecha: 2026-08-12 · Proyecto: clon de Minecraft.
> Estado: **prospectiva (sin implementar)** — progreso 2026-08-12: **A1
> cerrado** (WIP de la auditoría 2026-08-11 commiteado: `db1c366`, `17deb8c`,
> `5303e73`), **E-2 bioma 0 errores cerrado** (commit `bd49412`) y **E-1
> auditorías recalibradas cerrado** (commit `6fa7851`, `--audit` 6/6).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | WIP del cierre de la auditoría 2026-08-11 | WIP sin commitear: CL-3 completo (`public/network.js`), CL-2/H1 mascotas sentadas (`public/mobs.js`), C5 hornos (`server/crafting.js`/`server/state.js`), test F16-04 (`tests/unit-cama.js`) | F16/F17 `[ ]` finales | 🔴 |
| A2 | Entrevista (T1) | Las tareas pendientes de F16 (G3b/G3.7/G4/G6) y F17 (Bloque E) **quedan en su fase** — deben completarse para dar esas fases por terminadas **antes** de iniciar la F18; no se mueven aquí | F16/F17 `[ ]` | — |
| B1 | `Notas del usuario.md` Bugs | "Al estar sobre el agua, solo mostrar la neblina..." (B1 F16, ya cerrado — verificación en cierre) | F16 `[x]` | 🟢 |
| C1 | Entrevista (T1) + Notas F18 | **La paridad completa es el punto principal de esta fase**: cerrar las discrepancias "intencionales" documentadas (día/noche binario, minerales, comida, carbón vegetal, horno, XP al morir, sonidos) | Varios `[x]` parciales | 🟠 |
| C2 | Auditoría 2026-08-11 §5 | Tabla `MOB_XP` muerta contradictoria (wolf 2, slime 1) + checks D6 en `unit-fase16.js` y no en `unit-paridad.js`; recetas de mena inaccesibles | Intencional/desviación | 🟡 |
| D1 | Notas F18 + CLAUDE.md | Refactor de módulos >500 líneas a las convenciones de CLAUDE.md, **empezando por los más grandes** (`server/net.js` 2282 → ...) | — | 🟠 |
| D2 | Entrevista (T2) | Auditorías `fase3/4/6/7` rojas por presupuestos descalibrados al mundo v6 → **recalibrar y documentar** (sin optimizar rendimiento: se enfocará en una fase futura) | Rojo (auditoría 2026-08-11) | 🟠 |
| D3 | Entrevista (T2) | **Biome 0 errores — criterio obligatorio previo a la siguiente fase** (81 errores: 76 de formato + 5 reales) | Rojo (auditoría 2026-08-11) | 🟠 |
| E1 | Notas F18 | Mejorar la documentación en general (docs de módulos refactorizados, mecánicas, README) | — | 🟢 |
| F1 | Entrevista (T3) | Criterio de aceptación: **todo en verde**; **auditoría final de fase obligatoria**; formato de guardado **no se toca** (se analizará en otra fase de rendimiento) | — | — |

## 1. Contexto

- **Estado actual (verificado 2026-08-12, HEAD `bd49412`):** la Fase 16 está
  implementada (A-E y G0-G5) con pendientes de verificación G3b/G3.7/G4/G6 —
  **ya desbloqueados** porque el modo menú de la F17 que los bloqueaba está
  implementado. La Fase 17 está implementada (A-D) y solo le falta la
  **auditoría final (Bloque E)**: verificación manual en navegador. El
  prerrequisito **A1** (WIP de la auditoría 2026-08-11) y el criterio **E-2**
  (biome 0 errores) están **cerrados**: A1 en `db1c366`/`17deb8c`/`5303e73` y
  E-2 en `bd49412` (ver su sección).
- **WIP sin commitear (prerrequisito A1):** `public/mobs.js` (CL-2/H1), 
  `public/network.js` (CL-3 completo, 542 líneas tocadas),
  `server/crafting.js` + `server/state.js` (C5: `emptyFurnace`/`getFurnace`/
  `openFurnaceWatchers`), `tests/unit-cama.js` (F16-04 `sleep` coords). Es el
  **cierre de la auditoría 2026-08-11 en cliente + C5 hornos**. El commit
  `5303e73` ya cerró en `server/net.js` F16-03/04/05/07 y C6-REN-3; verificado
  en HEAD: `sleep` con `validCoords` (`net.js:1647`), `place` solo consume si
  `setBlock` devuelve true (`:878`), B3 proyectil→`mobHit` (`mobs.js:337`),
  P9 `templeTrapCooldowns` limpio (`net.js:2029-2038`), anti-cheat v2 completo
  (`net.js:631-715`: hundimiento lento + ventana horizontal por timestamps).
- **Decisiones de la entrevista (2026-08-12):**
  - Alcance: **refactor + cierre + pulido**; **la paridad completa es el
    punto principal de la fase**; nada de características nuevas.
  - Orden de trabajo: 1) **commit del WIP** (A1); 2) **refactor primero,
    empezando por los módulos más grandes** (D1); 3) **paridad** (C); 4)
    recalibrar auditorías y documentarlo (D2) — **el rendimiento NO se
    optimiza en esta fase** (se enfocará en otra fase relacionada con el
    formato de guardado); 5) **Biome 0 errores obligatorio** (D3); 6) docs
    (E); 7) cierre con todo en verde + auditoría final (F).
  - **Formato de guardado**: el refactor NO lo toca (`SCHEMA_VERSION` 6 se
    mantiene; el análisis del formato de guardado se hará en otra fase de
    rendimiento). **Protocolo WS e IDs B/I intactos** (las clases NO cambian
    el wire ni el guardado — convención POO de CLAUDE.md).
  - **Las tareas pendientes de F16/F17 permanecen en sus fases**: la F18
    arranca con F16 y F17 **cerradas** (suite/E2E/auditorías en verde). No se
    mueven tareas entre fases.
  - **Criterios de aceptación**: suite unitaria verde, E2E clásicos 6/6 +
    menú 7/7, auditorías por fase en verde, `biome check` 0 errores,
    `node --check`, verificación manual en navegador, auditoría final
    obligatoria.
  - Nombre de la fase acordado: **"Refactor a convenciones, cierre de fases
    y pulido"** (Fase 18).
  - Decisiones diferidas documentadas (ver §8): análisis/rediseño del formato
    de guardado + optimización de rendimiento (fase futura de rendimiento);
    libro de recetas con desbloqueo por material (se mantiene la decisión F9
    "todo visible"); F19 (texturas/UI) y F20 (rolling release) intactas.
- **Won't respetado íntegramente**: redstone, dimensiones, clima,
  autenticación/BD externa, encantamientos/pociones, aldeas generadas;
  la **Fase 19 no se adelanta** (no rediseñar cofres/mesa de crafteo/horno,
  no crear texturas de ítems — salvo el caso explícito C-9 del carbón
  vegetal, que es paridad y añade un ítem sincronizado).
- Fuentes: `docs/Notas del usuario.md`, `docs/auditoria-2026-08-11.md`,
  `docs/reporte-paridad.md`, `docs/fase17-spec.md` (plantilla y estado),
  `CLAUDE.md`/`AGENTS.md` (convenciones), `docs/README.md`, `TODO.md`.

---

## 2. Bloque A — Prerrequisitos: commit del WIP y fases 16/17 cerradas

### A1 — Commitear el WIP (cierre de la auditoría 2026-08-11) y dejar la suite en verde

- **Qué hacer:**
  - Revisar `git status`: 5 archivos modificados (`public/mobs.js`,
    `public/network.js`, `server/crafting.js`, `server/state.js`,
    `tests/unit-cama.js`) — cierre de auditoría en cliente (CL-3, CL-2/H1) +
    C5 hornos (`emptyFurnace`/`getFurnace`/`openFurnaceWatchers`) + test
    F16-04 de `sleep`.
  - Commitear por preocupación, en español: 1) cliente (CL-3 + CL-2/H1),
    2) servidor C5 hornos, 3) test F16-04. `git status` limpio.
  - **No mover** los pendientes G3b/G3.7/G4/G6 de F16 ni el Bloque E de F17:
    se cierran **en sus fases** (el coder de la F18 debe verificar que ya lo
    están antes de empezar; si no, es prerrequisito de bloqueo y se avisa).
- **Ficheros:** los 5 modificados (commit) + verificación `tests/*`.
- **Criterio de éxito:** `git status` limpio; `node tests/run.js --unit` en
  verde (52+); servidor arranca y sirve `/`; F16 y F17 marcadas como cerradas
  en `TODO.md` (G3b/G3.7/G4/G6 y Bloque E `[x]`) antes de tocar el bloque D.
- **Estado (2026-08-12): ✅ CERRADO** — el WIP de la auditoría 2026-08-11 se
  commiteó por preocupación: cliente CL-2/H1/CL-3 (`db1c366`), servidor C5
  hornos + P9 cooldowns de templo (`17deb8c`) y cierre en `server/net.js`
  F16-03/04/05/07 + C6-REN-3 (`5303e73`). `node tests/run.js --unit` → **53
  ✅ exit 0** (verificado 2026-08-12).

---

## 3. Bloque C — Paridad completa con Minecraft (punto principal de la fase)

> Cada tarea cierra una discrepancia documentada de `docs/auditoria-2026-08-11.md`
> §5 o de `docs/reporte-paridad.md`. Regla: **sin características nuevas**,
> solo acercar el comportamiento/valores a MC de lo ya implementado; cada
> cambio lleva su assert en `unit-paridad.js` o en el unit que corresponda;
> si se toca `constants.js` → AMBOS lados (`unit-sync` en verde).

### C-1 — Día/noche con franjas reales (PAR tabla #6)

- **Problema:** ciclo binario `isNight = worldTime() > DAY_CYCLE_MS/2`;
  MC tiene día 10 / atardecer 1,5 / noche 7 / amanecer 1,5 (20 min).
- **Qué hacer:** definir franjas del ciclo en función de `DAY_CYCLE_MS`
  (compartidas en ambos `constants.js`, p. ej. `DAY_PHASES = { day, dusk,
  night, dawn }` con sus duraciones) y usarlas en: `public/daymath.js`/
  `daynight.js` (cielo, luz, niebla, estrellas ya interpolan por `dayFactor`
  — ajustar los límites a las franjas) y en el servidor para spawn de
  hostiles (noche estricta + cuevas por luz) y quema solar (solo de día).
- **Ficheros:** `server/constants.js` + `public/constants.js`,
  `server/net.js` (o donde viva `isNight`), `public/daymath.js`,
  `public/daynight.js`, `tests/unit-dia.js`.
- **Criterio:** unit de franjas (`unit-dia.js` ampliado: duraciones 10/1,5/7/
  1,5 min sobre `DAY_CYCLE_MS`); spawn hostil y quema solar con tests
  deterministas en verde (`unit-mobs-ia.js`); verificación manual de
  atardecer/amanecer en navegador. Sin cambios de protocolo.

### C-2 — Profundidad de minerales mapeada al mundo v6 (PAR tabla #7)

- **Problema:** diamante ≤−20, hierro ≤−12 (mundo −64..+63); MC 1.18:
  diamante <16, hierro <64, oro <32, carbón <128, redstone <16 (mundo
  0..320).
- **Qué hacer:** mapear la distribución MC al mundo de 128 bloques por
  percentil del rango inferior (p. ej. diamante en el 5% más profundo,
  hierro en la mitad inferior-média, etc.), **sin romper los tests
  deterministas** (`unit-mundo.js`, `unit-biomas.js`, `audit-fase4`): si un
  test depende de la posición absoluta de una mena, recalibrarlo con el
  nuevo umbral y documentar la tabla MC-mapeada en `server/world.js` junto a
  `generateOres`.
- **Ficheros:** `server/world.js` (generación de menas), `tests/unit-mundo.js`
  / `unit-biomas.js` (recalibración), `docs/server/mecanicas.md` (tabla).
- **Criterio:** tabla de profundidades MC-mapeada documentada y fijada por
  un unit de rango (cada mena aparece solo dentro de su banda); suite verde.

### C-3 — Zanahoria y patata comestibles (PAR tabla #8)

- **Problema:** no son comida (solo cría/creativo); MC: zanahoria 3,
  patata 1, patata al horno 5.
- **Qué hacer:** añadir `FOOD_VALUES` para zanahoria (3/3,6) y patata
  (1/0,6) en AMBOS `constants.js`, patata al horno (5/6) si el ítem existe
  (si no, añadirlo como ítem cocinado de horno con su receta `patata →
  patata al horno`, sincronizado B/I + icono + `unit-sync`; comprobar
  primero si el rango de comida ya lo tiene — si ya existe la patata al
  horno, solo falta la receta). Verificar qué ítems de patata existen hoy.
- **Ficheros:** `server/constants.js` + `public/constants.js`,
  `recetas_horno.json` (si falta la receta), `public/itemicons.js` (icono),
  `tests/unit-paridad.js` (valores) + `unit-recetas.js` (receta) +
  `unit-sync.js`.
- **Criterio:** comer zanahoria/patata restaura hambre/saturación MC
  (unit comida); patata al horno crafteable y con su valor (unit-recetas);
  `unit-sync` en verde.

### C-4 — Carbón vegetal como ítem (PAR tabla #9)

- **Problema:** 1 tronco → 1 carbón (COAL 101); MC usa carbón vegetal como
  ítem distinto.
- **Qué hacer:** nuevo ítem `I.CHARCOAL` (ID libre a partir de 257, verificar
  el siguiente libre en `server/constants.js`) en AMBOS lados + icono en
  `public/itemicons.js`; la receta de horno `tronco → CHARCOAL` (200 t) usa
  el ítem nuevo; **no tocar** COAL (sigue saliendo de la mena). Sincronizar
  B/I (`unit-sync`) y receta (`unit-recetas`, cobertura: todo ítem de `I`
  obtenible). Documentar la decisión (ítem nuevo justificado por paridad).
- **Ficheros:** `server/constants.js` + `public/constants.js`,
  `recetas_horno.json`, `public/itemicons.js`, `tests/unit-sync.js`,
  `tests/unit-recetas.js`.
- **Criterio:** `unit-sync` en verde con CHARCOAL; hornear un tronco produce
  CHARCOAL y no COAL (unit horno/recetas); icono visible en el inventario.

### C-5 — Tabla `MOB_XP` coherente + checks D6 en `unit-paridad.js` (rec. 9)

- **Problema:** `server/constants.js:909` `wolf: 2` y `:917` `slime: 1` con
  comentarios que contradicen la lógica real `mobXp()` (`mobs.js:32-34`:
  lobo 1-3, slime grande 4 / mediano 2 / pequeño 1); los checks D6 viven en
  `unit-fase16.js` y no en `unit-paridad.js` (desviación de la spec D6).
- **Qué hacer:** alinear la tabla muerta con la lógica (o eliminarla si es
  un fallback) + comentarios correctos; **mover/duplicar** los asserts de XP
  (slime por tamaño, lobo 1-3) a `tests/unit-paridad.js` para fijar la
  regresión, dejando los de `unit-fase16.js` como están.
- **Ficheros:** `server/constants.js`, `tests/unit-paridad.js`,
  `tests/unit-fase16.js` (sin borrar sus checks si siguen validando).
- **Criterio:** `unit-paridad.js` verifica lobo 1-3 y slime 4/2/1 contra
  `mobXp()`; la tabla `MOB_XP` del servidor no contradice la lógica.

### C-6 — Horno: desperdicio de combustible y encolado (PAR tabla #3/#4)

- **Problema:** el combustible NO se consume si el insumo se agota a mitad
  de quema (MC lo desperdicia) y `add_fuel` rechaza cambiar de combustible
  con uno cargado (MC encola).
- **Qué hacer:** en `server/crafting.js` `tickFurnaces`: si `inputItem` se
  agota (o el resultado está completo) y queda `fuelTicksLeft`, el horno
  sigue quemando hasta agotarlo (desperdicio como MC); en `add_fuel`
  (`net.js`): permitir añadir otro combustible mientras hay uno cargado,
  encolándolo (cola FIFO en la entrada del horno, p. ej. `fuelQueue`),
  respetando `FUEL_TICKS`.
- **Ficheros:** `server/crafting.js`, `server/net.js`, `server/state.js` y
  `server/save.js` (si la cola se persiste en el horno, ver §8: preferible
  **no persistir** la cola — se pierde al reiniciar, como detalle menor,
  documentarlo), `tests/unit-fase16.js` o unit de horno nuevo.
- **Criterio:** unit de horno: con insumo agotado el combustible se
  desperdicia hasta 0; `add_fuel` con combustible distinto encola y quema en
  orden; el horno se apaga al agotar cola+tanque.

### C-7 — Recetas de mena muertas en el horno (PAR tabla #10)

- **Problema:** `recetas_horno.json` claves "9"/"10"/"11" (mena→gema) son
  inaccesibles porque `ORE_DROP` ya da el lingote directo al minar (dato
  muerto preexistente).
- **Qué hacer:** decidir el modelo: (a) eliminar las recetas muertas y
  documentar que el fundido de mena está implícito en `ORE_DROP`
  (simplificación aceptada: la cadena minar→lingote sigue igual), o (b)
  mantenerlas documentadas como inaccesibles. **Opción recomendada (a)** +
  nota en `docs/server/mecanicas.md` (el fundido explícito de mena se puede
  proponer en la fase de rendimiento/paridad futura; no cambia la cadena).
- **Ficheros:** `recetas_horno.json`, `docs/server/mecanicas.md`,
  `tests/unit-recetas.js` (cobertura: ninguna receta inaccesible).
- **Criterio:** `unit-recetas.js` en verde: toda receta del horno es
  alcanzable con ítems obtenibles; la cadena minar→lingote no cambia.

### C-8 — XP al morir: se pierde y se puede recuperar en el punto de muerte (B12)

- **Problema:** la XP se conserva al morir; MC la pierde en el punto de
  muerte (orbes recogibles).
- **Qué hacer:** implementación acotada y sin cambio de schema: al morir en
  survival, el servidor suelta **orbes de XP** en la posición de muerte
  (entidad tipo `xp_orb` en `state.mobs` — reusar el patrón de proyección de
  mobs; con su campo `xp`); al caminar encima (radio ~2 bloques) se
  recogen y re-añaden al jugador; **no se persisten** (se pierden al
  reiniciar el servidor — como en sesiones cortas del clon; documentarlo).
  En creative la XP se conserva (como hoy). Render del orbe en el cliente
  (esfera pequeña verde/amarilla, reusar `MOB_PARTS` simple).
- **Ficheros:** `server/mobs.js` (tipo `xp_orb`, recogida), `server/net.js`
  (broadcast a `mobs_update`), `server/players.js` (muerte con suelte),
  `public/mobs.js` (render), `tests/unit-muerte.js` o `unit-fase18.js`.
- **Criterio:** unit: morir en survival suelta un orbe con la XP del
  jugador; la XP del jugador pasa a 0; recoger el orbe la restaura; en
  creative no se pierde. Sin cambios de `SCHEMA_VERSION` ni de protocolo
  (los orbes viajan en el snapshot de mobs).

### C-9 — Sonidos de paridad que faltan (reporte §2.2)

- **Problema:** reporte de paridad §2.2: sin sonidos de muerte de mobs, de
  golpe por tipo, de flecha al impactar, de beber.
- **Qué hacer:** síntesis Web Audio de: muerte de mob (tono descendente por
  tipo), impacto de espada (golpe seco), flecha al impactar (thock), beber
  (sorbo) — reusar el patrón `pitchVar()` y el sistema existente de
  `public/audio.js`; disparar desde los sitios actuales (muerte en el
  snapshot de mobs, ataque del jugador, `arrows_expire`, comer/beber). Sin
  assets (todo sintetizado, como el resto del audio).
- **Ficheros:** `public/audio.js`, `public/mobs.js` (death), `public/input.js`
  (golpe), `public/network.js` (flecha), `public/ui.js` (beber) — lo que
  toque cada gancho; verificación manual.
- **Criterio:** en navegador (atacar/matar un mob, impactar una flecha,
  comer) se oyen los 4 sonidos nuevos; el resto del audio no regresa
  (regresión por oído + sin excepciones en consola).

---

## 4. Bloque D — Refactor a convenciones CLAUDE.md (orden: módulos más grandes primero)

> Convención (CLAUDE.md): módulos >~400-500 líneas → dividir. Objetivo:
> módulos por responsabilidad ≤ ~600 líneas salvo tablas de datos que lo
> justifiquen (`constants.js`). **Reglas duras del refactor (no negociables):**
> - **Fachadas intactas**: los exports usados por tests y otros módulos
>   (`world.getBlock`, `mobs.createMob`, `mobs.tickArrows`, `net.handleConnection`,
>   `players.createPlayer`, helpers, etc.) se mantienen con la misma firma.
> - **Sin cambios de comportamiento, de protocolo WS ni de formato de
>   guardado** (`SCHEMA_VERSION` 6 intacto, IDs B/I intactos — `unit-sync` y
>   `unit-persistencia` en verde tras cada módulo).
> - **1 commit por módulo** con la suite completa en verde tras cada commit
>   (`node tests/run.js --unit` + `--audit` sin regresiones).
> - Las clases POO no cambian el wire ni el guardado (convención F13): se
>   **mueven**, no se reescriben.
> - Orden de ejecución: **por tamaño de línea descendente** (D1 net.js 2282
>   → D8 players.js 895), que es el orden acordado en la entrevista.

### D-1 — `server/net.js` (2282 líneas) → red + anti-cheat + reloj de chunks + menú

- **Qué hacer:** dividir por responsabilidad manteniendo `handleConnection` y
  todos los `case` del switch (que NO se mueven de `net.js` salvo que el
  handler entero se exporte como función desde su módulo):
  - `server/anticheat.js`: `validCoords`, hover/hundimiento, ventana
    horizontal, resets de `speedSamples` (hoy `net.js:57-63, 264, 418,
    631-715`) + `server/players.js` si algún reset vive ahí.
  - `server/chunk-fill.js`: escaneo `missing`, relleno por lotes del
    `mainLoop`, guard fuera de bordes y try/catch del `mainLoop` (hoy
    `net.js:1987-2085`) → el `setInterval` se registra desde `server.js` o
    desde un módulo `server/timers.js`.
  - `server/world-session.js`: `set_seed`, `join_world`, `leave_world`,
    `world_*` (clonar/renombrar/modo/eliminar) y la cuota anti-spam
    compartida (hoy `net.js:1062-1200`).
  - `net.js` queda con: conexión, `menu_state`, `init`, `block_action` y los
    handlers de juego (minería, horno, cofre, cama, pet), broadcast y el
    switch — objetivo <~1100 líneas.
- **Ficheros:** `server/net.js`, `server/anticheat.js`, `server/chunk-fill.js`,
  `server/world-session.js` (nuevos), `server/state.js`, `server/server.js`
  (registro del tick), `tests/unit-red.js` (refactor de imports si los usa),
  `docs/server/README.md` (mapa de módulos).
- **Criterio:** `net.js` por debajo de ~1100 líneas; los 3 módulos nuevos
  <500; suite + `unit-red.js` + `unit-anticheat.js` en verde (mismo
  comportamiento); `node --check` OK.

### D-2 — `server/mobs.js` (1845 líneas) → base + especies + spawn + drops

- **Qué hacer:** extraer (manteniendo `createMob`, `Mob`, subclases,
  `tickArrows`, `mobDrops`, `mobXp`, `MOB_CLASSES` como fachadas):
  - `server/mob-species.js`: subclases por especie (`Zombie`, `Creeper`,
    `Skeleton`, `Spider`, `Enderman`, `Wolf`, `Slime`, `Drowned`,
    `Ocelot/Cat`, pasivos) con sus `tickSpecies`/`onDeath` (hoy las clases
    están en `mobs.js` — mover la definición, no reescribir).
  - `server/mob-spawn.js`: `BIOME_SPAWN`/`WATER_SPAWN`, `attemptSpawn`,
    zona segura de spawn y cuota de mobs (hoy dentro de `mobs.js`).
  - `server/projectiles.js`: `tickArrows`, `tickTridents`, impacto y
    recogida (los helpers de flecha/tridente).
  - `mobs.js` queda con: clase base `Mob` (tick/chase/flee/attack),
    fábricas, snapshot/broadcast y órbita de orbes (C-8) — <~800 líneas.
- **Ficheros:** `server/mobs.js`, `server/mob-species.js`,
  `server/mob-spawn.js`, `server/projectiles.js` (nuevos),
  `docs/server/mecanicas.md` (mapa de IA).
- **Criterio:** fachadas intactas (`tests/unit-mobs-ia.js`, `unit-fase12.js`,
  `unit-mobs-poo.js`, `unit-paridad.js` en verde); módulos nuevos <500.

### D-3 — `server/world.js` (1782 líneas) → núcleo + generación + biomas + estructuras

- **Qué hacer:** extraer manteniendo la instancia `World` y sus métodos
  (`getBlock`/`setBlock`/`getChunk`/`getBiome`/`generateChunk`) como
  fachadas:
  - `server/generation.js`: ruido, `generateChunk` (columnas, cuevas,
    minerales C-2, árboles, pozos, lago) — el bloque más pesado.
  - `server/biomes.js`: `getBiome`, transiciones, elevación, vegetación por
    bioma (hoy dentro de `world.js`).
  - `server/structures.js`: templo de jungla, naufragio, minas, pozos,
    hash 2D de estructuras (hoy en `world.js` + `chests.js` loot).
  - `world.js` queda con la clase `World`/`Chunk`, límites (`DESIGN_OFFSET`),
    `setBlock`/`getBlock`, serialización de chunks y `ensureChunksAround`.
- **Ficheros:** `server/world.js`, `server/generation.js`, `server/biomes.js`,
  `server/structures.js` (nuevos), `server/net.js` (imports ya usan fachadas),
  `docs/server/README.md`.
- **Criterio:** `unit-mundo.js`, `unit-biomas.js`, `unit-arboles.js`,
  `unit-persistencia.js`, `audit-altura.js` y `audit-fase4.js` en verde;
  módulos nuevos <~600 líneas.

### D-4 — `server/save.js` (940 líneas) → cola de chunks + meta/migraciones + jugadores

- **Qué hacer:** extraer manteniendo `saveWorld`/`loadWorld`/`switchWorld`/
  `listWorlds`/`migrateWorldLayout` y la cola asíncrona de C1/F16:
  - `server/save-chunks.js`: cola `setImmediate` por lotes, `writeChunkFile`
    (gzip), atomicidad tmp+rename (hoy `save.js:800-915`).
  - `server/save-meta.js`: `world.json` (meta, `worldGamemode`, tamaño),
    compañeros `switchWorld`/`releaseWorld`, migraciones v1→v6 y `.bak`.
  - `server/save-players.js`: `savePlayer`/`restorePlayer` (F17 B1) y la
    ruta por nombre saneada.
  - `save.js` queda como orquestador (fachada de todo lo anterior) — la
    responsabilidad "qué se guarda y cuándo" queda clara.
- **Ficheros:** `server/save.js`, `server/save-chunks.js`,
  `server/save-meta.js`, `server/save-players.js` (nuevos),
  `tests/unit-persistencia.js` (sin cambios de firmas), `docs/server/README.md`.
- **Criterio:** `unit-persistencia.js` (incl. migración v5→v6 y jugadores
  F17) en verde; módulos nuevos <500; **inalterado** el formato de disco.

### D-5 — `server/players.js` (895 líneas) → jugador + inventario + combate/XP

- **Qué hacer:** extraer manteniendo `createPlayer`/`Player`:
  - `server/inventory.js`: `addToInventory`, `removeFromInventory` (SV-2 ya
    corregido), fusión de stacks y `ItemStack` (reusar `server/items.js`);
    lo usan también `commands.js`, `chests.js`, `mobs.js` (import de
    `playerHelpers`).
  - `server/combat.js`: `damagePlayer`, armadura (puntos MC), `applyToolWear`,
    XP/niveles y muerte (con el orbe de C-8).
  - `players.js` queda con la clase `Player` (move/física/hambre/saturación,
    respawn, teleport) y los helpers que usan los handlers.
- **Ficheros:** `server/players.js`, `server/inventory.js`,
  `server/combat.js` (nuevos), `server/net.js`/`mobs.js`/`commands.js`
  (imports via fachadas), `docs/server/mecanicas.md`.
- **Criterio:** `unit-inventario.js`, `unit-durabilidad.js`,
  `unit-muerte.js`, `unit-comida.js` y `unit-paridad.js` en verde; los
  exports actuales (`players.createPlayer`, `players.damagePlayer`, etc.)
  intactos.

### D-6 — `public/ui.js` (1313 líneas) → HUD + menús + libro + inventario

- **Qué hacer:** dividir sin cambiar el DOM actual (los `id` e interacción se
  conservan):
  - `public/hud.js`: hotbar, comida/salud/XP, coordenadas, tooltip del
    hotbar (F15 D3) y `itemVisual`.
  - `public/menus.js`: pantalla principal, mundo, ajustes en pestañas y
    pausa (F17 A/C) — mover de `ui.js` los render de menú.
  - `public/panels.js`: inventario, cofre (27 slots) y horno (slots y
    `furnace_state`).
  - `public/recipebook.js`: libro de recetas (F16 B5) por categorías.
  - `ui.js` queda como orquestador del HUD en juego + imports.
- **Ficheros:** `public/ui.js`, `public/hud.js`, `public/menus.js`,
  `public/panels.js`, `public/recipebook.js` (nuevos), `public/input.js`
  (imports), `docs/public/mecanicas.md`.
- **Criterio:** playtest rápido en navegador (HUD, menú, inventario, libro
  siguen igual) + `unit-ui.js`/`unit-itemicons.js` en verde; módulos nuevos
  <~500 (salvo `itemicons.js` que es tabla: ver nota).

### D-7 — `public/world.js` (1263 líneas) → estado/carga + luz client

- **Qué hacer:** extraer manteniendo `loadChunkData`/`unloadChunks`/
  `buildChunkGeometry` (fachadas ya usadas por `network.js`):
  - `public/chunkstore.js`: mapa de chunks cliente, `Uint8Array`→bloques,
    swap en `chunks_add`/`chunks_unload`, `torchSet` y su limpieza.
  - `public/lightclient.js`: `bakeChunkLight`/`hasTorchNear` (hoy
    `world.js:886-967`) — la parte "luz de antorcha" que vive en el cliente.
  - `world.js` queda con el ciclo de vida de mallas (worker, `geopool`,
    LOD, frustum) y `unloadFarChunks`.
- **Ficheros:** `public/world.js`, `public/chunkstore.js`,
  `public/lightclient.js` (nuevos), `public/chunkWorker.js` (sin cambios),
  `tests/unit-greedy.js`/`unit-workers.js` (imports), `docs/public/README.md`.
- **Criterio:** `unit-greedy.js`, `unit-workers.js` y la auditoría CDP de
  render (`audit-fase7`) en verde; módulos nuevos <~600.

### D-8 — `public/input.js` (1000 líneas) → juego + menú + táctil

- **Qué hacer:** extraer manteniendo el flujo de puntero/pointer lock:
  - `public/game-input.js`: ratón/teclado en juego (minar/atacar/colocar/
    saltar/agacharse/sprint/clic mantenido B7-F17), `move` a 20 Hz.
  - `public/menu-input.js`: navegación del menú (F17 A/C) y pausa.
  - `public/touch.js`: controles táctiles (F17 D1) — mover el overlay móvil
    aquí.
  - `input.js` queda como despachador entre modos (juego/menú/táctil).
- **Ficheros:** `public/input.js`, `public/game-input.js`,
  `public/menu-input.js`, `public/touch.js` (nuevos),
  `docs/public/mecanicas.md`.
- **Criterio:** `unit-input.js` si existe (o ampliarlo) + verificación
  manual de clic/pointer lock/táctil en navegador; módulos nuevos <500.

### D-9 — Nota: `public/itemicons.js` (1423 líneas) NO se divide en esta fase

- Es un **atlas de datos** (dibujos procedurales por ítem). Cada entrada es
  ~10-20 líneas de canvas; dividirlo por categorías (herramientas/comida/
  bloques) es válido pero no aporta mantenibilidad real hoy. **Decisión:
  se documenta como excepción justificada a la regla de 500 líneas** (como
  `constants.js`). Re-evaluar en la fase de rendimiento futura si el atlas
  crece con los ítems de F19.
- **Criterio:** sin cambios en esta fase; nota en `docs/public/README.md`.

---

## 5. Bloque E — Recalibración de auditorías y Biome (criterios obligatorios)

### E-1 — Recalibrar `audit-fase3/4/6/7` al mundo v6 y documentarlo

- **Qué hacer:** las auditorías `fase3` (perf lineal/nocturna), `fase4`
  (generación cuevas <12 ms/chunk, ratio caras/bloques), `fase6` (LOD
  <30 MB) y `fase7` (8 checks CDP render SwiftShader) están rojas por
  **presupuestos descalibrados** al mundo de 128 bloques (conocido desde la
  2026-08-10). Revisar cada `audit-faseN.js`, ajustar los umbrales al mundo
  v6 **medidos con el juego actual** y documentar en cada audit el nuevo
  presupuesto y por qué (referencia: valores de la auditoría 2026-08-11
  línea base). **NO optimizar el código** (el rendimiento se mejora en otra
  fase): solo medir, recalibrar y documentar.
- **Nota:** `audit-fase7` (CDP con Chrome headless) depende del render por
  software (SwiftShader): si el chequeo es de render, dejar un umbral
  tolerante documentado (no es una regresión de código).
- **Ficheros:** `tests/audit-fase3.js`, `audit-fase4.js`, `audit-fase6.js`,
  `audit-fase7.js`, `docs/tests.md` (umbrales por fase).
- **Criterio:** `node tests/run.js --audit` → **6/6 en verde** (fase3, fase4,
  fase5, fase6, fase7, altura 72/72), con los nuevos presupuestos
  documentados en cada archivo.
- **Estado (2026-08-12): ✅ CERRADO** — commit `6fa7851`, `node
  tests/run.js --audit` → **6/6, exit 0**. Detalle:
  - `audit-fase3`, `audit-fase5`, `audit-altura` ya estaban en verde.
  - `audit-fase4`: presupuesto de generación < 12 → **< 80 ms/chunk**
    (medido mejor-de-3 ~26-41 ms) y ratio caras/bloques < 2.2 → **< 8**
    (medido ~5.747 estable). Documentado en el propio archivo: el mundo v6
    (128 de alto) + cuevas grandes (F17 B5) + vegetación densa exponen cada
    piedra a aire en ~5.7 caras; el ratio ya no mide "menos geometría".
  - `audit-fase6`: memoria bruta < 30 → **< 800 MB** (medido ~619 MB con
    LOD, 2.79 GB sin LOD, ratio 0.22 / −78 %; geometría bruta pre-greedy).
  - `audit-fase7`: **bug real corregido** — el índice local del chunk
    usaba la Y absoluta (v5); con mundo v6 el cofre "no persistía". Ahora
    `localY = sy − 1 − WORLD_MIN_Y`. Umbrales CDP < 100 → **< 1000 ms tick /
    < 800 ms gen** (medidos 246-580 / 156-386 ms en máquina de desarrollo
    bajo carga; la ventana de 6 s mide el relleno inicial, coste no
    optimizado, diferido a la fase de rendimiento).
  - Umbrales documentados también en `docs/tests.md` §"Umbrales y política".

### E-2 — Biome: 0 errores (obligatorio)

- **Qué hacer:** `npx biome check server public tests` reporta 81 errores
  (76 de formato + 5 reales: `noDuplicateObjectKeys` en
  `server/constants.js:1160`, `noUnusedVariables` en `commands.js`/`mobs.js`,
  `organizeImports` en 4 archivos y `noAssignInExpressions` en tests).
  Aplicar `biome format --write` (o arreglos manuales equivalentes) **en un
  commit separado de solo formato** y corregir los errores reales a mano
  (revisar que `constants.js:1160` no sea una clave duplicada funcional).
- **Ficheros:** todos los de `server/`, `public/` y `tests/` que biome señale
  (formato) + los 5 reales.
- **Criterio:** `npx biome check server public tests` → **0 errores**
  (warnings/infos toleradas, documentadas si procede). **Obligatorio antes de
  dar la fase por cerrada** (decisión del usuario, previo a la F19).
- **Estado (2026-08-12): ✅ CERRADO** — commit `bd49412` «Fase 18 (D3): biome
  0 errores». `npx biome check .` → **0 errores / 169 warnings / 16 infos,
  exit 0** (verificado en HEAD). 74 archivos tocados (73 formateados + fixes
  manuales). Detalle:
  - Formato (`biome check --write .`): 73 archivos re-escritos (tabs, comas,
    quotes dobles, `organizeImports`) — solo cambio de estilo, sin lógica.
  - Fixes manuales: `public/chunkGeometry.js` (parámetro `H`→`_H`),
    `public/debug.js` (import `WORLD_HEIGHT` sin usar),
    `server/commands.js`/`server/mobs.js` (`WORLD_HEIGHT` sin usar en el
    destructure), y los **6 lint reales de tests** que rompían exit:
    `unit-arboles.js` (noAssignInExpressions), `unit-dia.js` (noSelfCompare,
    x2), `unit-poo-entities.js` (noAssignInExpressions, x3) — todos
    reescritos preservando semántica (el `noSelfCompare` usaba la misma
    expresión en ambos lados a propósito: se extrajo en variables d1/d2/u1/u2).
  - El boilerplate `if (typeof failedChecks !== "undefined" &&
    failedChecks.length)` de 57 tests de F15 se normalizó a
    `if (failedChecks?.length)` (useOptionalChain, mismo comportamiento).
  - Los 169 warnings restantes son `noConsole` (configurada como warn en
    `biome.json`) y `useOptionalChain`/`useTemplate`/`noUnused*` marcados
    info/warn por severidad: **no bloquean**. Se dejaron intactos porque
    `--write --unsafe` borra `console.log` de resumen que `tests/run.js`
    parsea (regresión conocida con `tests/unit-spawn.js`).
  - Verificación tras el cambio: `node tests/run.js --unit` **exit 0 (53
    ✅, 0 ❌)**, `node --check` en los archivos tocados. No toca protocolo
    WS, IDs B/I ni formato de guardado.

---

## 6. Bloque F — Documentación (mejorar la documentación en general)

### F-1 — Docs de arquitectura al día tras el refactor y la paridad

- **Qué hacer:** actualizar `docs/server/README.md` y `docs/public/README.md`
  (mapa de módulos: 6 módulos nuevos de servidor + 7 de cliente), 
  `docs/server/mecanicas.md` y `docs/public/mecanicas.md` con: franjas
  día/noche (C-1), minerales MC-mapeados (C-2), comida nueva (C-3),
  CHARCOAL (C-4), horno desperdicio/cola (C-6), mena implícita (C-7), orbes
  de XP (C-8), sonidos (C-9) y las decisiones diferidas (§8).
- **Ficheros:** `docs/server/*.md`, `docs/public/*.md`.
- **Criterio:** cada mecánica nueva/cambiada tiene su sección; los mapas de
  módulos reflejan los archivos reales (verificar con `git status`/ls).

### F-2 — README, TODO y guías transversales

- **Qué hacer:** `README.md` §Tests/arquitectura al día; `docs/tests.md`
  (matriz módulo→test con los módulos nuevos, umbrales de c8 si se miden los
  módulos nuevos); `AGENTS.md`/`CLAUDE.md` si el refactor cambia el mapa de
  módulos que citan; `docs/README.md` (índice: Fase 18); `TODO.md`
  (Fase 18 cerrada al final).
- **Criterio:** contradicciones 0 entre docs y código (grep de nombres de
  módulos citados vs existentes).

### F-3 — Decisiones diferidas documentadas

- **Qué hacer:** escribir el §8 de esta spec + una nota en `docs/README.md`
  y en `TODO.md` "Fuera de alcance": el formato de guardado (y su relación
  con el rendimiento: guardado síncrono residual de `switchWorld`/
  `releaseWorld`, gzip en worker, `SAVE_BATCH_SIZE`, perfilado c8) se
  analizará en una **fase futura de rendimiento**; el libro de recetas con
  desbloqueo por material mantiene la decisión F9 ("todo visible"); F19
  (texturas/interfaces) y F20 (rolling release) intactas.
- **Criterio:** el §8 de esta spec y las notas de `TODO.md`/`docs/README.md`
  describen lo no hecho y su fase destino.

---

## 7. Bloque G — Cierre y auditoría de la Fase 18 (tarea obligatoria)

1. **Prerrequisitos confirmados:** F16 y F17 cerradas (G3b/G3.7/G4/G6 y
   Bloque E `[x]` en TODO); WIP de A1 commiteado; HEAD limpio.
2. Suite unitaria completa en verde (`node tests/run.js --unit`) tras cada
   commit; **E2E clásicos 6/6** (`SEED=miSemilla2026 PORT=3998 node server.js`
   + `WS_URL=... run.js --e2e`) y **E2E de menú 7/7** (servidor propio sin
   SEED en :3997, como establece la F17).
3. `node tests/run.js --audit` → **6/6 en verde** (recalibrado en E-1,
   incluido `audit-altura` 72/72).
4. **`biome check` 0 errores** (E-2) y `node --check` sobre los `.js`
   tocados.
5. Verificación manual en navegador: C-1 (crepúsculos), C-8 (orbe al morir),
   C-9 (sonidos), D-6/D-7/D-8 (HUD/menú/táctil tras refactor sin
   regresiones), y confirmar que el juego arranca del menú (F17 A) y la
   pausa (F17 C) siguen igual tras D-6.
6. Actualizar `TODO.md` (Fase 18 cerrada), `docs/README.md` (índice),
   `AGENTS.md` (estado de fases) y esta spec (secciones de resultado).
7. `SCHEMA_VERSION` **sin cambios** (6); protocolo WS e IDs B/I intactos;
   sin archivos de jugador alterados (solo los ya existentes de F17 B1).

---

## 8. Decisiones diferidas (se realizan en fases futuras — documentadas, no hechas aquí)

| Decisión | Por qué se difiere | Fase destino |
|---|---|---|
| Análisis/rediseño del **formato de guardado** (y su impacto en rendimiento) | El refactor de esta fase no debe mezclarse con un cambio de schema; requiere estudio de coste/beneficio propio | Fase de rendimiento futura (relacionada con el guardado; candidata a la F20 o fase intermedia) |
| Optimización de rendimiento: `switchWorld`/`releaseWorld` asíncronos, gzip en worker, `SAVE_BATCH_SIZE`, perfilado c8 con umbrales, mejora de LOD/presupuestos | El usuario decidió en la entrevista: "nos enfocaremos en mejorar rendimiento más adelante"; esta fase solo recalibra y documenta | Idem (fase de rendimiento) |
| Libro de recetas con **desbloqueo por material** (paridad §2.3) | Decisión F9 aceptada ("todo visible"); cambiarlo es UX y la F19 se reserva para las interfaces | Fase 19 (texturas/UI) o posterior |
| `public/itemicons.js` (1423 líneas) no dividido | Atlas de datos; excepción justificada a la regla de 500 líneas; re-evaluar si crece | Fase 19 (cuando se añadan las texturas faltantes) |
| **CSP + SRI del CDN de Three.js** (SEC-4, auditoría 2026-08-11) | El importmap de `index.html` es un `<script type="importmap">` inline: cargar Three desde `https://unpkg.com` con CSP exige `script-src 'unsafe-inline'` (y el SRI por entrada de importmap tiene soporte de navegador irregular), lo que deja casi sin valor la política; el juego es localhost/LAN sin autenticación. Aplicado ya: `X-Content-Type-Options: nosniff` en el estático (`server/net.js`). Candidato a revisar si se sirve Three localmente | Fase de rendimiento o seguridad futura |
| Recetas de mena del horno eliminadas (C-7, opción a) | Simplificación aceptada: `ORE_DROP` da el lingote directo; el fundido explícito de mena se puede proponer con la cadena de crafteo | Fase de rendimiento/paridad futura |
| Encantamientos/pociones, redstone, dimensiones, clima, aldeas, autenticación | Won't del proyecto | Hasta después de la F20 |
| Fase 19 (texturas faltantes, cofres/mesa de crafteo/horno) y Fase 20 (rolling release) | Roadmap del usuario | F19 y F20 |

---

## 9. Criterios de aceptación (resumen)

1. **Paridad completa** (bloque C): día/noche con franjas MC, minerales
   mapeados al mundo v6, zanahoria/patata/patata al horno comestibles,
   carbón vegetal como ítem, `MOB_XP` coherente y fijada en `unit-paridad`,
   horno con desperdicio y encolado MC, recetas muertas eliminadas, XP
   recuperable en el punto de muerte (orbes) y 4 sonidos nuevos — todo con
   test y en verde.
2. **Refactor a convenciones** (bloque D): 8 módulos divididos (net, mobs,
   world, save, players, ui, world-cliente, input) por responsabilidad,
   fachadas intactas, suite verde tras cada commit, `SCHEMA_VERSION` 6 y
   protocolo/IDs sin cambios.
3. **Auditorías recalibradas** (E-1): `node tests/run.js --audit` 6/6 con
   presupuestos documentados; **Biome 0 errores** (E-2) obligatorio.
4. **Documentación** (F): mapas de módulos y mecánicas al día; decisiones
   diferidas documentadas.
5. **Cierre** (G): suite unitaria verde, E2E 6/6 + menú 7/7, auditorías 6/6,
   biome 0, `node --check`, verificación manual y **auditoría final de fase
   obligatoria** — F16/F17 cerradas antes del inicio.