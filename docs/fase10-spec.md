# Fase 10 — Notas del usuario, correcciones pendientes y paridad avanzada (Spec)

> Documento de especificación de la Fase 10, elaborado a partir del `TODO.md`
> (sección Fase 10), de `Notas del usuario.md` (auditoría manual del usuario)
> y del estado del código. En el mismo formato que `fase8-spec.md` /
> `fase9-spec.md`.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA** (implementada y auditada —
> retrospectiva; la fuente de verdad del estado es `TODO.md` §Fase 10 y
> `Notas del usuario.md` con los `[x]`) ·
> Proyecto: clon de Minecraft (servidor Node autoritativo `server/` + cliente
> Three.js `public/`, todo en español).
>
> **Precondición:** esta fase se ejecuta DESPUÉS de la Fase 9. Si algún punto
> de la Fase 9 queda pendiente (p. ej. el Bloque F: minerales por altura,
> playas, árboles variados, hierba/flores/abejas), se retoma allí, no aquí.

---

## 1. Resumen

La Fase 10 tiene cuatro objetivos:

1. **Cerrar los bugs de `Notas del usuario.md`** que la Fase 9 NO cubre — son
   bugs de mundo/física (agua, lava, altura del jugador, `/tp`, hielo,
   profundidad del agua, luz), no de minería/menú/IA.
2. **Añadir las nuevas características y la tarea de debug** de esas mismas
   notas, omitidas por el análisis comparativo previo: tamaño de mundo,
   pantalla de muerte con causa y `/kill`.
3. **`test.log`**: persistencia del resultado de la última ejecución de
   tests.
4. **Paridad con otros clones de Three.js**: jugabilidad (gravedad de
   bloques, TNT, sprint, picker creativo, pick-block, agacharse), visuales
   (AO, agua, niebla, nubes, cross-meshes) y audio (música generativa, más
   sonidos por material).

Prioridad global sugerida: **A → B → C → D → E → F → G** (bugs primero,
después features, después debug, jugabilidad, visuales, audio y por último
verificación). Los bloques son independientes entre sí.

**No se repite aquí nada que ya sea el Bloque F de la Fase 9** (minerales por
altura, playas y arena costera, árboles variados, hierba/flores/abejas): si
al llegar a esta fase siguen pendientes, se retoman en la Fase 9.

---

## 2. Contexto del proyecto (estado verificado al escribir este spec)

- **Arquitectura**: servidor Node.js **autoritativo** (Express + `ws`, sin
  BD; persistencia en JSON por chunk, gzip) + cliente vanilla Three.js sin
  build step desde `public/`. Servidor CommonJS, cliente ES modules. Tests en
  `tests/` (`node tests/run.js --unit`, E2E contra servidor vivo, auditorías
  por fase). Convenciones en `CLAUDE.md`/`AGENTS.md`.
- **Agua/lava (server)**: `players.js` `tickPlayer` — flotación en el cliente
  (`public/player.js`), daño de lava 2 HP/500 ms (`LAVA_DAMAGE`), sin daño
  por quemadura residual. Lagos con `SEA_LEVEL = 5`, `LAKE_FLOOR = 2`
  (profundidad máxima ~2 bloques). El spawn hostil depende solo de la hora
  (`SPAWN_TYPES` en `server/mobs.js`), **sin nivel de luz**.
- **Jugador**: `constants.js` define la cámara a 1.6 bloques; el hitbox de
  colisión debe medir 1.8 (a verificar en juego).
- **`/tp`**: `server/commands.js` — corrige la Y y envía `chunks_add` +
  `teleport` + `player_move`; la carga tras un teletransporte lejano está
  reportada como rota por el usuario.
- **Biomas**: `server/world.js` — hielo/tundra (`snow`) y pozos decorativos
  de lava (`noise2D_lava`); el usuario reporta lava en biomas de hielo.
- **Mobs**: `server/mobs.js` — hostiles solo de noche; sin oscuridad por
  cueva (no hay nivel de luz en el servidor).
- **Muerte**: `damagePlayer` (players.js) reaparece según gamemode y envía
  `player_die {lostInventory}`; **no hay pantalla de muerte con causa**.
- **Menú de mundos**: `public/ui.js` `renderWorldsList` + creación con
  semilla/name; **no hay selector de tamaño de mundo**.
- **Comandos**: gate de operador (`OP_ONLY`, `isOp`, `/op`) en
  `server/commands.js` — el patrón para `/kill` ya existe.
- **Sprint/agacharse/pick-block**: no implementados. Bloque con gravedad:
  ninguno (arena/grava estáticas). TNT: no existe (el creeper ya explota con
  `explode()` en `server/mobs.js` — patrón a reutilizar).
- **Cliente**: `public/particles.js` (partículas de bloques), `public/sky.js`
  (cielo/niebla), `public/audio.js` (sonidos procedurales por categoría),
  `public/lod.js` + `public/geopool.js` (rendimiento, Fase 6).

---

## 3. Objetivos

1. **Corregir los bugs de mundo/física de `Notas del usuario.md`** (salir del
   agua, lava por quemadura, hitbox de 1.8, `/tp` lejano, hielo sin lava,
   agua profunda/acuática, hostiles en oscuridad). Bloque A.
2. **Añadir las features omitidas de las notas**: tamaño de mundo, pantalla
   de muerte con causa, `/kill`. Bloque B.
3. **`test.log`** con persistencia del resultado de tests. Bloque C.
4. **Paridad de jugabilidad** con otros clones: bloques con gravedad, TNT,
   sprint, picker creativo, pick-block, agacharse. Bloque D.
5. **Visuales**: AO por vértice, agua mejorada, niebla bajo el agua, nubes,
   plantas cross-mesh. Bloque E.
6. **Audio**: música ambiental generativa y más sonidos por material.
   Bloque F.
7. **Verificación final** (suite + E2E + biome + confirmación en vivo).
   Bloque G.

---

## 4. Bloques de trabajo

### Bloque A — Bugs de `Notas del usuario.md` (prioridad alta, no cubiertos por Fase 9)

1. **Salir del agua**: corregir la flotación (`public/player.js`) para no
   quedarse atascado al salir — revisar la transición flotación → suelo
   firme (el salto desde el agua debe funcionar como en Minecraft).
2. **Lava por quemadura**: daño de fuego que **se extingue con agua o con el
   tiempo** (como Minecraft): el contacto con lava aplica un "estado de
   fuego" con duración; el agua lo apaga; el daño por tick depende del
   estado. Fuente de verdad en el servidor (`tickPlayer`); sincronizar el
   flag con el cliente para el render del fuego (reutilizar el patrón
   `burning` de la quema solar de la Fase 6).
3. **Altura del jugador**: verificar en juego la altura real (1.8 bloques,
   cámara a 1.6 ya en `constants.js`): confirmar que el **hitbox de
   colisión coincide** y que se puede pasar por huecos de 2 bloques de alto.
   Ajustar servidor (validación de movimiento) y cliente (colisión/cámara)
   si difieren.
4. **`/tp` a un lugar lejano**: asegurar que la generación/carga de chunks se
   dispara tras el teletransporte y el mundo sigue cargando (el usuario
   reporta que el mundo "deja de cargar").
5. **Biomas de hielo: no generar lava** — excluir los pozos/lagos de lava de
   los biomas `snow`/hielo en `world.js` (+ test de generación).
6. **Agua de varios bloques de profundidad**: profundidad real (varias capas),
   **cuevas acuáticas**, mejores lagos y **ríos pequeños** (ruido/curso de
   agua en `world.js`; cuidado con `SEA_LEVEL`/`LAKE_FLOOR` y la invariante
   de "agua por encima de SEA_LEVEL = charco válido" de `unit-mundo.js`).
7. **Mobs hostiles en zonas oscuras (cuevas) de día**: hoy el spawn depende
   solo de la hora (`SPAWN_TYPES`, sin nivel de luz). Introducir un **nivel
   de luz por bloque/columna** (al menos el "oscuro si techo opaco encima o
   de noche") para que los hostiles también aparezcan en cuevas de día,
   respetando la zona segura del spawn (Fase 8 B2).

### Bloque B — Nuevas características de las notas

1. **Selector de tamaño de mundo** al crear:
   - `debug` 64×64 — **solo interno, no visible al jugador**.
   - `pequeño` 256×256 · `medio` 512×512 · `grande` 1024×1024.
   - `infinito` 8192x8192 — **solo interno, no visible hasta que se testee el rendimiento real con varios jugadores a la vez y sea aceptable**
   - Implica límites de mundo en el servidor (bordes) + UI en el menú de
     creación + persistencia en `world.json` (con el gamemode de la Fase 9).
2. **Pantalla de muerte con causa**: reflejar la causa (mob, caída, lava,
   ahogamiento, inanición...) reutilizando la telemetría `source`/`meta` de
   `damage_debug` (Fase 8): el `player_die` debe llevar la causa legible y el
   cliente mostrar una pantalla de muerte estilo Minecraft.
3. **`/kill [nombre]`**: solo operadores; sin nombre se aplica a quien lo
   lanza. Patrón existente: gate `OP_ONLY` + `isOp` de `server/commands.js`.

### Bloque C — Debug (de las notas, también omitido)

1. **`test.log`**: registrar el resultado de la última ejecución de tests
   (fecha, suite, exit, fallos) para saber qué falló **sin re-ejecutar la
   suite**. `tests/run.js` lo escribe al terminar (y `run.js --unit` /
   `--e2e` por separado).
2. **Reescribe los test** de forma que todos den el mismo formato de salida
   para facilitar su interpretación

### Bloque D — Jugabilidad: paridad con otros clones

1. **Caída de arena/grava** (bloques con gravedad): los bloques de arena/
   grava caen si no tienen soporte, se detienen sobre un sólido y quedan como
   bloque (simplificación: sin entidad de item). Fuente de verdad en el
   servidor; broadcast con `block_update`.
2. **TNT**: explosión con **cráter**, knockback y **reacciones en cadena**
   (reutilizar/refinar `explode()` del creeper: respeta `NOT_MINEABLE`, no
   rompe cofres con contenido — reglas de la Fase 7/8).
3. **Sprint (correr)** con efecto de **FOV** (doble toque W o tecla) — en
   cliente; el servidor debe aceptar la velocidad y puede acoplar el hambre
   (patrón de Fase 3: decae más rápido en movimiento).
4. **Selector de bloques creativo**: la tecla E abre un **picker con todos
   los tipos de bloque** (el inventario creativo completo de la Fase 9 ya
   trae todos los bloques; comprobar si hace falta un picker aparte).
5. **Pick-block**: clic medio selecciona el bloque al que se apunta
   (`raycastTerrainAndMobs` del clic — el id ya se conoce).
6. **Agacharse (Shift)** con **protección de bordes** (no caerse al agacharse
   junto a un borde — `maxStep`/colisión).

### Bloque E — Visuales

1. **Oclusión ambiental por vértice**: sombreado suave en esquinas
   (complementa el color por vértice de las antorchas; evaluar coste con el
   LOD/pool de la Fase 6).
2. **Agua mejorada**: superficie más baja, textura animada, reflejos
   (cuidado con el culling adaptado del agua de la Fase 4 y la auditoría
   `audit-fase4.js`).
3. **Niebla bajo el agua**.
4. **Nubes que se desplazan** (capas procedurales móviles en el cielo).
5. **Plantas como cross-meshes**: hierba/flores con 2 planos cruzados (el
   patrón de las antorchas — dos planos cruzados translúcidos — ya existe).

### Bloque F — Audio

1. **Música ambiental generativa** (Web Audio, patrón de `audio.js`).
2. **Más sonidos por material**: vidrio, salpicaduras de agua, TNT.

### Bloque G — Verificación final

1. Suite unitaria + E2E contra servidor vivo + auditorías de fases
   anteriores, todo en verde.
2. `biome check` 0 errores (server + public + tests).
3. **Confirmar en vivo cada bug de `Notas del usuario.md`** marcado como
   corregido (jugando, no solo con tests automatizados).
4. **Auditoría de Fase 10**: rendimiento con TNT, gravedad de bloques y
   partículas nuevas activos a la vez; confirmar que ningún fix reabre un bug
   ya cerrado en la Fase 8 (lista B1-B10).
5. Documentar Fase 10 cerrada en `TODO.md` (+ "Bugs conocidos").

---

## 5. Protocolo WS y eventos (cambios previstos)

| Evento | Dirección | Contenido |
| --- | --- | --- |
| `player_die` | S→C | añade `cause` legible (mob/fall/lava/drown/starve...) para la pantalla de muerte |
| `block_update` | S→C | caída de arena/grava (bloques con gravedad) |
| `tnt_explode` (o `explosion`) | S→C | explosión de TNT con cráter/knockback |
| `fire_state` (o campo en `init`/tick) | S→C | estado de quemadura del jugador (lava) |
| `set_world_size` | C→S | tamaño de mundo al crear (`{size}`) |

Nota: el pick-block (clic medio) es **puramente de cliente** — el ID del bloque apuntado sale del `raycastTerrainAndMobs()` local, igual que la selección del hotbar; no requiere evento WS.
| `kill` (chat `/kill`) | C→S | comando de operador |

Todos en `snake_case` (convención); se confirmarán al implementar cada bloque.

---

## 6. Archivos implicados (por bloque)

| Archivo | Bloque | Cambio |
| --- | --- | --- |
| `server/players.js` | A,D | salir del agua, fuego de lava, hitbox 1.8, causa de muerte, sprint/hambre |
| `server/constants.js` | A,B,D | estado de fuego, límites de mundo, bloques con gravedad, TNT |
| `server/world.js` | A | hielo sin lava, agua profunda/cuevas acuáticas/ríos, nivel de luz |
| `server/mobs.js` | A | spawn hostil por nivel de luz (no solo hora) |
| `server/commands.js` | A,B | `/tp` con carga de chunks, `/kill` |
| `server/save.js` | B | `world_delete` (existente, Fase 9) + persistencia del tamaño de mundo en `world.json` |
| `server/world.js`, `server/constants.js` | A,B,D | límites de mundo por tamaño, bloques con gravedad, TNT (patrón de `explode()` de `mobs.js`) |
| `public/player.js` | A,D,E | flotación al salir, sprint/FOV, agacharse, cámara 1.6 |
| `public/input.js` | A,D | pick-block, agacharse, picker creativo |
| `public/world.js` | A,D,E | bloques con gravedad, TNT, agua mejorada, AO, cross-meshes |
| `public/sky.js`, `public/daynight.js` | E | nubes, niebla bajo el agua |
| `public/audio.js` | F | música generativa, sonidos por material |
| `public/ui.js`, `public/index.html` | B,E | selector de tamaño, pantalla de muerte, picker creativo |
| `tests/run.js`, `tests/unit-*.js` | C, todos | `test.log` y tests por bloque |
| `TODO.md`, `README.md` | G | documentación final |

---

## 7. Decisiones del usuario (registro de la entrevista/notas)

Fuente: `docs/Notas del usuario.md` (auditoría manual del usuario). Las
decisiones de diseño finas de cada punto se confirmarán con el usuario al
ejecutar la fase (patrón de las Fases 8-9).

Fuentes del alcance: las filas 1-11 proceden de `Notas del usuario.md` (auditoría manual del usuario); la fila 12, del análisis comparativo con otros clones de Three.js del `TODO.md` (Fase 10, bloques D-F); la fila 13, de la sección "Valorar implementar" de las notas.

| # | Tema | Petición/Decisión | Fuente |
|---|------|-------------------|--------|
| 1 | Salir del agua | Bug: al caer en el agua no se puede salir → corregir la flotación | Notas |
| 2 | Lava | Bug: no hace daño por quemadura; debe extinguirse con agua o al poco tiempo | Notas |
| 3 | Altura del jugador | Debe medir 1.8 bloques (como Steve) y pasar por huecos de 2 bloques | Notas |
| 4 | `/tp` lejano | Bug: el mundo deja de cargar → la carga debe continuar tras el teletransporte | Notas |
| 5 | Hielo y lava | Bug: en biomas de hielo no se debe generar lava | Notas |
| 6 | Agua | Varios bloques de profundidad, cuevas acuáticas, mejores lagos y ríos pequeños | Notas |
| 7 | Hostiles | Solo de noche **o en zonas oscuras** (cuevas): spawn por nivel de luz | Notas |
| 8 | Tamaño de mundo | Selector al crear: debug 64×64 (solo interno) / pequeño 256 / medio 512 / grande 1024 / infinito 8192 | Notas |
| 9 | Pantalla de muerte | Que refleje la causa (mob, caída, lava, ahogamiento, inanición...) | Notas |
| 10 | `/kill` | Solo operadores; sin nombre se aplica al que lo lanza | Notas |
| 11 | `test.log` | Registrar el resultado de la última ejecución de tests | Notas |
| 12 | Paridad | Bloques con gravedad, TNT, sprint+FOV, picker creativo, pick-block, agacharse, AO, agua, niebla, nubes, cross-meshes, música generativa, sonidos por material | Análisis comparativo (TODO Fase 10) |
| 13 | *Valorar* | Mundos >1024×1024, alturas ±64 (terreno más variado), más biomas — **a evaluar, no comprometido** | Notas ("Valorar implementar") |

---

## 8. Plan de la Fase 10 (orden de ejecución)

### Bloque A — Bugs de las notas
1. Salir del agua + hitbox 1.8 (física de jugador).
2. Lava por quemadura (estado de fuego).
3. Hielo sin lava + agua profunda/cuevas acuáticas/ríos (mundo).
4. `/tp` lejano (carga de chunks).
5. Hostiles por nivel de luz (spawn).

### Bloque B — Nuevas características
6. Selector de tamaño de mundo.
7. Pantalla de muerte con causa.
8. `/kill [nombre]`.

### Bloque C — Debug
9. `test.log`.

### Bloque D — Jugabilidad
10. Bloques con gravedad · 11. TNT · 12. Sprint+FOV · 13. Picker creativo ·
    14. Pick-block · 15. Agacharse.

### Bloque E — Visuales
16. AO por vértice · 17. Agua mejorada · 18. Niebla bajo el agua ·
    19. Nubes · 20. Cross-meshes.

### Bloque F — Audio
21. Música generativa · 22. Sonidos por material.

### Bloque G — Verificación final
23. Suite + E2E + biome + confirmación en vivo + auditoría + documentación.

---

## 9. Riesgos y notas

- **No duplicar la Fase 9**: minerales por altura, playas, árboles variados y
  hierba/flores/abejas pertenecen al Bloque F de la Fase 9. Si quedaron
  pendientes, se retoman allí, no en la Fase 10.
- **Agua profunda vs invariantes existentes**: `unit-mundo.js` exige que toda
  el agua por encima de `SEA_LEVEL` sea un charco válido; cambiar la
  profundidad/ríos obliga a actualizar la invariante y su test.
- **Nivel de luz en el servidor**: hoy la luz solo existe en el cliente
  (antorchas, Fase 6). Para spawn por oscuridad hace falta una métrica de
  luz servidor-side (columnas: bloque opaco encima = oscuro; noche = oscuro)
  — mantenerla barata y determinista.
- **Bloques con gravedad y TNT** son las mecánicas con más riesgo de
  rendimiento (actualizaciones de chunk en cadena) — la auditoría del
  Bloque G debe medir FPS con ambas activas.
- **Anti-cheat vs sprint/vuelo**: el handler `move` valida el ascenso
  (Fase 8); el sprint horizontal debe encajar sin disparar el límite.
- **Pantalla de muerte con causa**: reutilizar `source`/`meta` de la
  telemetría `damage_debug` (Fase 8) para no duplicar lógica.
- **`/kill`** debe respetar el gate de operador (`OP_ONLY`) y el respawn por
  gamemode (survival pierde el inventario; creative lo conserva).
- **Fuera de alcance (Won't)**: redstone, dimensiones, aldeas generadas,
  clima, cuentas/auth, BD externa (ver TODO.md). El bloque "Valorar
  implementar" de las notas (mundos >1024, alturas ±64, más biomas) NO está
  comprometido: requiere discusión y medición de rendimiento antes.

---

## 10. Criterios de aceptación globales de la Fase 10

1. **Bugs de las notas**: cada bug de `Notas del usuario.md` marcado como
   corregido se **confirma en vivo** (jugando): salir del agua, quemadura de
   lava extinguible, hitbox de 1.8 con huecos de 2 bloques, `/tp` lejano que
   sigue cargando, sin lava en hielo, agua profunda/acuática/ríos, y
   hostiles también en oscuridad de día.
2. **Features**: selector de tamaño de mundo (con debug 64×64 solo interno),
   pantalla de muerte con la causa, `/kill [nombre]` de operador.
3. **`test.log`**: tras cada ejecución de tests queda registrado el resultado
   (fecha, exit, fallos) sin re-ejecutar la suite.
4. **Jugabilidad**: arena/grava caen, TNT explota con cráter/knockback/cadena,
   sprint con FOV, picker creativo, pick-block y agacharse con protección de
   bordes.
5. **Visuales/audio**: AO, agua mejorada, niebla bajo el agua, nubes,
   cross-meshes, música generativa y sonidos por material.
6. **Verificación**: `node tests/run.js --unit` exit=0, E2E contra servidor
   vivo exit=0, `biome check` 0 errores, auditoría de rendimiento con TNT +
   gravedad + partículas activas, y **ningún fix reabre un bug de la Fase 8**
   (B1-B10).
7. **Documentación**: Fase 10 cerrada en `TODO.md` con "Bugs conocidos"
   actualizado.
