# Fase 20 — Rolling release (ciclo de estabilización y paridad) (Spec)

> **Estado:** `[EN CURSO]` (iteración v20.1 cerrada; **v20.2 iniciada** — ciclo rolling activo)

> Documento creado a partir de: `docs/Notas del usuario.md` (\"Próximas Fases\":
> la 20 es el \"rolling release del proyecto, fase larga donde solo se
> corregirán bugs, se mejorará la paridad en implementaciones documentadas
> como limitadas, si el rendimiento lo permite; no se incluirán las
> características reportadas como **Restricciones (Won't)**. Fase que logra
> equilibrio entre rendimiento y paridad. No avanzar a una siguiente fase
> hasta que todo lo actual esté 100% confirmado su funcionamiento y estable\"),
> del borrador `docs/spec/fase20-spec.md`, del estado real del proyecto y de la
> entrevista con el usuario (2026-08-12).
> Fecha: 2026-08-12 · Proyecto: clon de Minecraft.
> Estado: **en curso** — prerrequisito: **Fase 18 cerrada**
> (y con ella F16/F17). La primera iteración (v20.1) está **cerrada** (ver
> [`docs/v20.1.md`](../v20.1.md)); las siguientes se definen al inicio de
> cada ciclo.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | `Notas del usuario.md` \"Próximas Fases\" (F20) | Rolling release: solo bugs, paridad de lo documentado como limitado y rendimiento si el presupuesto lo permite; **Won't excluido**; \"no avanzar hasta que todo esté 100% estable\" | Borrador F20 | 🔴 |
| A2 | Entrevista (2026-08-12) | La F20 = **metodología del ciclo + primera iteración concreta (v20.1)** con su auditoría; auditoría por iteración obligatoria | Borrador F20 | 🟠 |
| A3 | Entrevista (2026-08-12) + F18 §8 | El **formato de guardado y las optimizaciones de rendimiento** diferidos en la F18 (decisión documentada) son candidatos de paridad/rendimiento del ciclo (\"si el rendimiento lo permite\") | F18 diferido | 🟠 |
| B1 | Estado real (2026-08-12) | El ejemplo de iteración del borrador citaba bugs **ya corregidos** (CL-2 mascotas sentadas, H3 doma, B5 libro, C-1 día/noche, C-8 XP) → se reescribe la v20.1 con el estado real | Borrador F20 §7 | — |
| C1 | `Notas del usuario.md` + F18 | Las mejoras grandes (20 biomas, estructuras, más mobs) **no entran en F20** — van a la Fase 21 prospectiva (decisión del usuario 2026-08-12) | F21 (nueva) | — |

---

## 1. Contexto

- **Prerrequisito:** la **Fase 18 cerrada** (paridad C-1..C-9, refactor D,
  docs F y cierre G), lo que a su vez exige F16 y F17 cerradas (pendientes de
  verificación resueltos: G3b/G3.7/G4/G6 de F16 y Bloque E de F17). La F20
  asume: suite unitaria en verde, E2E clásicos 6/6 + menú 7/7, auditorías por
  fase en verde y `biome check` 0 errores.
- **Naturaleza:** la F20 es un **ciclo de mantenimiento y paridad** con
  iteraciones cortas (v20.1, v20.2, ...). No tiene fecha de fin fija: se
  cierra cuando el proyecto alcanza el nivel de estabilidad/paridad que el
  usuario considere suficiente (candidato a versión 1.0), o se transita a la
  Fase 21 (contenido nuevo: biomas/estructuras/mobs).
- **Decisiones de la entrevista (2026-08-12):**
  - Alcance: **ciclo + primera iteración concreta** (v20.1) en esta spec; las
    iteraciones siguientes se planifican al inicio de cada ciclo (mismo
    proceso del planificador: leer → cruzar → preguntar → escribir).
  - **No avanzar a una siguiente fase** hasta que lo actual esté 100%
    confirmado (regla del usuario, se aplica a cada iteración: nada nuevo
    entra hasta que la iteración anterior está en verde).
  - **Won't respetado íntegramente** en todas las iteraciones: redstone,
    dimensiones (Nether/End), clima, autenticación/BD externa,
    encantamientos/pociones, aldeas generadas, y los \"Futuro\" de las notas
    (aldeanos, Wither, Dragón, Blaze, Ghast, Gólem de hierro, villas, Ciudad
    Antigua...).
  - Mejoras grandes (biomas/estructuras/mobs) → **Fase 21 prospectiva**, no
    a F20.
  - Criterios de cada iteración: suite + E2E + auditorías en verde, sin
    regresiones, verificación manual, release etiquetado `v20.x`,
    **auditoría por iteración obligatoria**.
- Fuentes: `docs/Notas del usuario.md`, borrador `docs/spec/fase20-spec.md`,
  `docs/spec/fase18-spec.md` (decisiones diferidas), `docs/audits/auditoria-2026-08-11.md`,
  `docs/reporte-paridad.md`, `CLAUDE.md`/`AGENTS.md`, `docs/README.md`,
  `TODO.md`.

---

## 2. Bloque A — Metodología del ciclo (cada iteración)

Cada iteración (v20.x) sigue el flujo del borrador, ahora con reglas fijas:

1. **Planificación:** revisar `docs/Notas del usuario.md`, las auditorías y
   los bugs reportados desde la iteración anterior; seleccionar **3-5 bugs de
   alta prioridad + 2-3 mejoras de paridad/rendimiento**; criterio de éxito
   por tarea.
2. **Implementación:** cada bug con su **test de regresión**; la paridad solo
   sobre mecánicas ya implementadas y documentadas como limitadas; el
   rendimiento solo si una métrica existente (F3, `server_metrics`,
   auditorías) muestra un cuello de botella real. **Reglas duras:** si se
   toca el protocolo WS o el formato de guardado → retrocompatible con
   migración y test (modelo `unit-persistencia.js`); si se toca
   `constants.js` → AMBOS lados (`unit-sync`); sin características nuevas
   salvo las diferidas explícitamente.
3. **Pruebas:** suite unitaria completa, E2E clásicos 6/6 + menú 7/7,
   `node tests/run.js --audit` 6/6, `node --check` y `biome check` 0 errores;
   auditoría CDP cuando la iteración toque render/UI.
4. **Revisión y documentación:** actualizar la spec de la iteración (o esta
   spec), `docs/server|public/mecanicas.md` si cambia una mecánica,
   `docs/tests.md` si cambia la matriz, `TODO.md` (checkboxes) y el
   `README.md` si procede.
5. **Release:** etiqueta `v20.x` (convención de commits del proyecto:
   `Fase 20 (v20.x): <resumen>`).
6. **Auditoría de la iteración (obligatoria):** suite/E2E/auditorías en
   verde + verificación manual de cada bug corregido + documentación al día.
   **No se abre la siguiente iteración hasta que esta esté en verde.**

---

## 3. Bloque B — Primera iteración (v20.1): estabilidad y cierre de restos

> Definida con el estado real del proyecto (2026-08-12). Objetivo: **dejar
> todo lo implementado 100% confirmado y estable** antes de cualquier mejora
> de paridad adicional. Si al arrancar la v20.1 los restos ya están cerrados
> (porque la F18 los absorbió), se sustituyen por el pulido equivalente.

### B1 — Cierre de restos de verificación (si quedan abiertos al arrancar)

- **Qué hacer:** verificar y cerrar los pendientes de F16 (G3b network/
  settings/particles/audio, G3.7 auditoría CDP de calidad/niebla/inventario/
  libro, G4 E2E de cofre Shift y libro de recetas, G6 auditoría de Fase 16) y
  de F17 (Bloque E: verificación manual en navegador del flujo completo
  menú → mundo → pausa → volver al menú, B1-B7 y táctil). Si la F18 no los
  cerró, se cierran aquí **en sus fases** (sin reabrir fases: se marcan y se
  documenta su cierre en la spec de la iteración).
- **Ficheros:** los que señale cada pendiente; `docs/tests.md` al día.
- **Criterio:** TODO sin `[ ]` de F16/F17/F18; suite + E2E + auditorías en
  verde tras cada cierre.

### B2 — Bugs de estabilidad reportados (desde la F18 y el uso real)

- **Qué hacer:** revisar `Notas del usuario.md` Bugs, las auditorías
  `2026-08-11` (hallazgos sin \"✅ corregido\") y los reportes que surjan
  durante la F18; seleccionar 3-5 de alta prioridad (crash, pérdida de
  datos, desconexiones, física/colisión, IA). Cada uno: causa raíz +
  test de regresión + verificación manual.
- **Ficheros:** los del área afectada (`server/net.js`, `mobs.js`,
  `world.js`, `public/*`...).
- **Criterio:** cada bug corregido con su test en verde y confirmado en
  navegador; sin regresiones en la suite.

### B3 — Paridad restante de la F18 (si quedó algo sin cerrar)

- **Qué hacer:** verificar que la F18 cerró C-1..C-9 (día/noche por franjas,
  minerales mapeados al v6, comida, carbón vegetal, `MOB_XP`, horno
  desperdicio/cola, recetas de mena muertas, orbes de XP, sonidos). Si alguno
  quedó pendiente, se completa aquí con su assert en `unit-paridad.js`/
  `unit-recetas.js` y su doc en `docs/server|public/mecanicas.md`.
  **Backlog de paridad del borrador F20 (Descargas), integrado aquí:**
  - **TNT**: falta el knockback (la explosión hoy solo daña — hallazgo F16
    G2.6 documentado en `docs/tests.md`): añadir empuje a los jugadores/mobs
    en `explode()` con su test.
  - **Recetas de mena eliminadas del horno** (F18 C-7, opción a: `ORE_DROP`
    da el lingote directo): evaluar si se repone el fundido explícito de mena
    con su propia cadena de crafteo (decisión a documentar; la cadena actual
    minar→lingote no cambia si se mantiene la simplificación).
  - **CSP + SRI del CDN de Three.js** (SEC-4): **cerrado** — desde la Fase
    19.6 Three.js se sirve **local** (`public/vendor/`); ya no hay CDN
    externo que asegurar. Queda fuera de alcance el CSP estricto del
    importmap inline (exige `script-src 'unsafe-inline'`).
- **Ficheros:** los que indique la F18 (Bloque C) o el área del hallazgo
  (`server/tnt.js`/`explode`, `recetas_horno.json`, `public/index.html`).
- **Criterio:** `unit-paridad.js` y `unit-recetas.js` en verde con la paridad
  completa; reporte de paridad actualizado; TNT con knockback testeado.

### B4 — Rendimiento dentro de presupuesto ("si el rendimiento lo permite")

- **Qué hacer:** medir con las métricas existentes (F3, `server_metrics`,
  `audit-fase3/4/6/7`, c8) y corregir **solo cuellos de botella reales**
  observados en el uso (p. ej. tick > presupuesto, memoria creciente,
  `mcChunks` lentos). Candidatos documentados (backlog del borrador F20,
  integrado aquí; ver también `fase18-spec.md` §8):
  - **Formato de guardado**: análisis/rediseño diferido en la F18 §8, sin
    romper retrocompatibilidad (estudio de coste/beneficio: ¿vale la pena
    rediseñarlo o el actual gzip por chunk es suficiente?).
  - **`switchWorld`/`releaseWorld` asíncronos** (hoy hay guardado síncrono
    residual al cambiar de mundo) y **gzip del guardado en un worker** fuera
    del hilo principal (solo si la medición lo justifica).
  - **`SAVE_BATCH_SIZE` ajustable y calibrado** (la cola de autosave de la
    F16 C1) si la cola crece en sesiones largas.
  - **Perfilado con c8 y umbrales formales** de cobertura/rendimiento en
    `docs/tests.md` (los umbrales actuales se re-miden al cerrar F18/19.x).
  - **Presupuestos de LOD** (histéresis actual F13/F14) y **luz de antorcha**
    (`torchSet` O(n) en bake — REN-7) solo si el uso los señala.
  - Optimizaciones de generación/broadcast si las métricas las justifican.
  - **Sin optimización prematura** (regla del proyecto): cada ítem requiere
    una métrica que lo respalde en la spec de la iteración.
- **Ficheros:** según el cuello de botella; tests/auditorías recalibradas y
  documentadas si cambian presupuestos.
- **Criterio:** métricas estables dentro de los presupuestos documentados
  (`docs/tests.md`), sin regresiones; cada optimización con su medición
  antes/después en la spec de la iteración.

### B5 — Release v20.1

- **Qué hacer:** iteración en verde (B1-B4), auditoría de la iteración
  documentada (sección de esta spec o fichero `docs/v20.1.md`), etiqueta
  `v20.1` y `TODO.md` al día.
- **Criterio:** `git tag v20.1` (o convención equivalente del proyecto);
  documento de la iteración con bugs cerrados, paridad y métricas.

### B6 — Integración de la auditoría Copilot 2026-08-16 (backlog v20.x)

> La auditoría de GitHub Copilot (`docs/audits/auditoria-2026-08-16-copilot.md`)
> fue verificada contra el árbol actual: sus hallazgos críticos/altos
> (H1, F16-01, B1) y casi todos los medios (M1-M5, B2, B3, REN-2/3/5) ya
> estaban corregidos en el commit que el propio Copilot audita (`161721c`,
> cierre de la F19.6). Quedan **2 pendientes reales** y **2 sugerencias de
> proceso** que se planifican aquí para una iteración `v20.x` (candidata:
> v20.2):

- **SV-5 — tope de stack en `addToInventory` (paridad MC, economía).**
  `/give` ya clampea a 64 (`server/commands.js:355`) pero
  `server/inventory.js` apila sin tope (`:44-49`) y el cliente pinta el
  contador crudo. Corrección server-side (fuente de verdad): respetar
  `MAX_STACK` (candidato a constante compartida por `unit-sync`) al
  apilar/crear slot; test en `unit-*`; sin cambios de protocolo WS ni de
  `SCHEMA_VERSION`. Prioridad **baja**. **[IMPLEMENTADO 2026-08-16, v20.2]**
  — `MAX_STACK = 64` nueva constante compartida (servidor + cliente,
  sincronizada por `unit-sync`); `addToInventory` rellena slots existentes
  hasta el tope y crea slot nuevo solo para el excedente (rechazo atómico
  `false` si no cabe todo); `commands.js:/give` usa `MAX_STACK` como fuente
  única; checks en `unit-poo-entities.js` (split 64+36, tope por slot,
  excedente a slot vacío, limpieza).
- **REN-1 (residual) — `savePlayer` síncrono en el autosave.**
  Los chunks ya van por la cola asíncrona (F16 C1); `server.js:115`
  persiste jugadores de forma síncrona en el `setInterval`. Alternativa:
  mover ese guardado a la cola (o confiar en el guardado por eventos ya
  mitigado, F1). Prioridad **baja-media**; solo si la medición muestra
  bloqueos reales del tick con el intervalo reducido a 10-15 s.
  **[IMPLEMENTADO 2026-08-16, v20.2]** — nuevo `savePlayersAsync()` en
  `server/save-players.js` (misma estrategia que la cola de chunks: lotes
  de `PLAYERS_SAVE_BATCH` con `setImmediate`, idempotente); snapshots y
  rutas de archivo capturados al PROGRAMAR (un switchWorld durante el
  drenado no reescribe el mundo equivocado); el autosave de `server.js`
  usa `savePlayersAsync()`; `savePlayer` síncrono se conserva para
  desconexión/switchWorld/SIGINT-SIGTERM (necesitan el resultado
  inmediato); checks en `unit-fase17.js` (REN-1: escribe y persiste el
  estado).
- **CI 19 — timeouts de `audit-fase3`/`audit-fase7`.** Subir la tolerancia
  (Causa ambiental: SwiftShader + CPU bajo carga; no regresión). Acción:
  aumentar ventanas/timeouts y documentar el umbral en `docs/tests.md`.
  **[IMPLEMENTADO 2026-08-16, v20.2]** — audit-fase7: arranque del
  servidor y carga del target CDP a 90×250 ms, `ready` a 45×1000 ms,
  timeouts de `send`/`eval`/`uiEval` a 25 s; audit-fase3: umbrales de perf
  ~2× (30 mobs < 1 ms, 300 < 4 ms — sigue siendo guarda de regresión);
  documentado en `docs/tests.md`.
- **CI 20 — `npm audit` en el flujo de verificación.** Añadir
  `npm audit --audit-level=moderate` como paso documentado (sin CI en el
  repo actualmente; script en `package.json` o instrucción en la
  metodología del ciclo). **[IMPLEMENTADO 2026-08-16, v20.2]** — script
  `npm run audit` en `package.json` y documentado como paso de la
  verificación mínima en `docs/tests.md` (resultado actual: 0
  vulnerabilidades).

---

### B7 — Iteración v20.2 (definida 2026-08-16)

> Alcance de la segunda iteración del ciclo: los **dos bugs de
> `Notas del usuario.md`** reportados como sin resolver tras la F19.6 (D1 y
> D2) + el **backlog B6 de la auditoría Copilot** (SV-5, REN-1 residual,
> CI 19 y CI 20). Sin cambios de protocolo WS, IDs B/I ni `SCHEMA_VERSION`
> (criterio del ciclo). Detalle y verificación en `TODO.md` §Fase 20 y el
> changelog v5.

- **D1 — `#menu-bg` no se oculta al iniciar partida** ✅ (`875f8e1`): el
  fondo del menú (z-index 1 sobre el canvas) nunca se ocultaba en JS — solo
  `#blocker`; fix `showMenuBg()` en `public/scene.js` (visible SOLO en el
  menú principal), cableado en `menus.js` (showMenu → visible,
  onWorldLoaded → oculto, onSeedRejected → visible; la pausa no lo muestra).
  Regresión `tests/unit-fase20.js` + verificación navegador CDP 3/3.
- **D2 — Desconexión al terminar de cargar el mundo** ✅ (`18bbc2e`): el
  rate-limit por conexión medía el tiempo de PROCESAMIENTO, no el de
  llegada. La carga síncrona del mundo en `join_world` (switchWorld →
  loadWorld/saveWorld) bloquea el event loop; el cliente con pointer lock
  acumula moves a 20 Hz y, al terminar el bloqueo, se procesan en ráfaga en
  la misma ventana de 1 s → `MAX_MSG_RATE` parecía superado y el servidor
  cerraba 1008 «demasiados mensajes» (desconexión → releaseWorld → menú →
  re-logueo). Fix `server/ratelimit.js` (módulo puro): el cierre exige
  superar el límite en DOS ventanas consecutivas (flood sostenido); una
  ráfaga tras un bloqueo es legítima. Reproducido end-to-end (bloqueo de
  3 s simulado: antes cerraba con 128 moves, ahora 188 sin cierre) y
  recalibrado en `unit-red.js` (ráfaga 1 ventana → no corta; 2 ventanas →
  1008). Es el B2 de la F19.6, cuyo veredicto «ambiental» quedó corregido
  en `fase19.6-spec.md`.
- **SV-5 — tope de stack 64** ✅ (código en el árbol): `MAX_STACK = 64`
  compartida (unit-sync), `addToInventory` apila con split de slots y
  rechazo atómico si no cabe todo, `/give` con `MAX_STACK`; checks en
  `unit-poo-entities.js`.
- **REN-1 residual — `savePlayer` async** ✅ (código en el árbol):
  `savePlayersAsync()` (lotes setImmediate, idempotente) en
  `save-players.js`; el autosave de `server.js` lo usa; `savePlayer`
  síncrono se conserva para desconexión/switchWorld/SIGINT/SIGTERM.
- **CI 19 — timeouts de los CDP** ✅: ventanas ampliadas en
  `audit-fase3/7` (arranque/ready/eval) y umbrales de perf ~2×,
  documentado en `docs/tests.md`.
- **CI 20 — `npm audit` en el flujo** ✅: script `npm run audit` en
  `package.json` + paso documentado en `docs/tests.md` (0 vulnerabilidades).
- **Cierre de la v20.2 (2026-08-17, etiqueta `v20.2`):** backlog B6
  commiteado (`6df80ad`: SV-5/REN-1/CI 19/CI 20), auditoría de la
  iteración C1 (`caab252`: `tests/audit-fase20.js` con 17 checks —
  ratelimit 2-ventanas, MAX_STACK, savePlayersAsync, P4 determinismo, P7
  índice de antorchas — `--audit` 7/7; unit 60/60; E2E 7/7; biome 0;
  `node --check`; `npm audit` 0), biome `9cce8ca` y cierre de docs/tracker
  `70541ec`. **Verificación manual en navegador** (CDP + Chrome headless,
  mundo desechable): mena cruda → horno ✅ end-to-end; knockback del TNT
  ✅ hasta la integración (evento con vector correcto + `applyKnockback`
  fija el impulso, sondeado; el desplazamiento visual de la cámara no es
  medible de forma fiable bajo SwiftShader — el hilo se congela por el
  meshing en los momentos de medir — queda como comprobación manual en
  sesión real); D2 sin desconexiones en sesiones estables. Documento
  `docs/v20.2.md` con la verificación completa.

---

## 4. Bloque C — Criterios de aceptación de cada iteración

1. Suite unitaria completa en verde (100%) + E2E clásicos 6/6 + menú 7/7 +
   `run.js --audit` 6/6, tras cada commit.
2. **Sin regresiones**: las mecánicas implementadas siguen cubiertas por sus
   tests (matriz `docs/tests.md`).
3. Auditorías por fase sin regresiones; CDP cuando la iteración toca render.
4. Verificación manual de cada bug corregido y de cada mejora de paridad en
   navegador.
5. Rendimiento estable (sin picos de tick, sin fugas de memoria visibles,
   FPS aceptables en el hardware de desarrollo).
6. Documentación al día (spec de la iteración, mecánicas, `docs/tests.md`,
   `TODO.md`, índice `docs/README.md`) y `AGENTS.md` reflejando el estado.
7. `node --check` y `biome check` 0 errores en los archivos tocados.
8. **Auditoría de la iteración obligatoria** antes de abrir la siguiente.

---

## 5. Fin de la Fase 20 (criterios de salida)

La F20 se considera cerrada cuando, en una auditoría de iteración:

- Todo el contenido actual está **100% confirmado y estable** (regla del
  usuario): suite/E2E/auditorías en verde, sin bugs abiertos de prioridad
  alta, y al menos una iteración completa en verde.
- Se decide transitar a la **Fase 21** (biomas/estructuras/mobs, prospectiva)
  o a una **versión 1.0** en modo mantenimiento a largo plazo.
- La decisión se documenta en esta spec (estado final) y en `TODO.md`.

> **Tests que cubren esta fase (previstos):** `tests/unit-fase20.js`, `tests/audit-fase20.js`.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-12: creación del spec (documento de planificación de la fase 20), incorporando el backlog del borrador `fase20-spec.md`.

**Cambios en esta spec (v2, 2026-08-16 — arranque de la v20.1):**
- Alcance de la v20.1 confirmado por el usuario: rendimiento **completo**
  (P1, P3, P4, P2/P7 con perfilado, CL-6) y **sí** al fundido explícito de
  mena. Estado de implementación (detalle en `TODO.md` § Fase 20):
  - **B1** verificado (restos de F16/F17 cerrados, auditoría 2026-08-16).
  - **B2** los bugs de las notas quedaron cerrados en fases previas (con su
    fix verificado); únicos pendientes documentados de la auditoría del día
    16 (comentario de TNT y wording de dimensiones) resueltos.
  - **B3** TNT knockback implementado (evento `knockback` + ventana de
    confianza `kbUntil` en el anti-cheat para jugadores; `mob.kb` integrado
    en el tick de los mobs; test `unit-fase11.js` 10b). Fundido explícito
    de mena restaurado (RAW_IRON 258 / RAW_GOLD 259 → lingote en el horno;
    carbón/diamante/redstone/esmeralda siguen directos, paridad MC 1.17).
    CSP/SRI cerrado (Three.js local desde F19.6).
  - **B4** P1 (generación por lotes) y P3 (corona nueva) ya estaban
    implementados en el árbol y se verificaron; **P4** generación
    determinista por chunk (PRNG sembrado por semilla+cx,cz — la generación
    ya no marca dirty: explorar no persiste cientos de archivos); **P7**
    índice espacial de antorchas por chunk (`getTorchesNear`, vecindario
    3×3 — `hasTorchNear`/`bakeChunkLight` dejan de escanear el torchSet
    completo); **P2 evaluado y rechazado con métrica** (gzipSync 1,36
    ms/chunk → ~8 ms por lote de 6, ya espaciado con setImmediate: un
    worker no justifica su complejidad); **CL-6** telemetría del cliente
    (`__mcClientErrors` → `client_errors`, ya en el árbol).
- **B5** iteración cerrada: documento [`docs/v20.1.md`](../v20.1.md),
  etiqueta `v20.1` y `TODO.md` al día (B5/C1 marcados).
- **C1** auditoría de la iteración: suite **unit 59/59**, **E2E 7/7**
  (mundo desechable limpio), **`--audit` 6/6**, **biome 0 errores**,
  `node --check` limpio, sin regresiones en la matriz `docs/tests.md`,
  protocolo WS/IDs B-I/`SCHEMA_VERSION` 6 intactos. Los CDP de render
  (fase3/fase7) requieren carga de CPU baja (SwiftShader); bajo carga
  externa fallan igual en HEAD (ambiental, documentado).
- Verificación manual en navegador de las mecánicas nuevas (knockback,
  mena cruda → horno): pendiente de la sesión real del usuario (próximo
  paso de la v20.2 si confirma algo).

**Cambios en esta spec (v3, 2026-08-16 — integración de la auditoría Copilot):**
- Añadido **B6** con el backlog de la auditoría de GitHub Copilot
  (reconciliada en `docs/audits/auditoria-2026-08-16-copilot.md`): SV-5
  (stack 64), REN-1 residual (`savePlayer` async), timeouts de
  `audit-fase3/7` y `npm audit` en el flujo de verificación — para una
  iteración `v20.x` (candidata: v20.2). Sin cambios de alcance ni
  prerrequisitos: la F20 sigue cerrada solo con cada iteración en verde.
- **SV-5 implementado (v20.2, 2026-08-16)**: `MAX_STACK` compartida +
  `addToInventory` con tope (split en slots) + `/give` con `MAX_STACK`;
  checks en `unit-poo-entities.js` y sincronía en `unit-sync.js`. Restan
  REN-1, CI 19 y CI 20.
- **v20.2 (2026-08-16): backlog B6 completo** — SV-5 (stack), REN-1
  (`savePlayersAsync`, cola de jugadores), CI 19 (umbrales CDP/perf
  ampliados) y CI 20 (`npm run audit`) implementados y documentados. Sin
  cambios de protocolo WS ni `SCHEMA_VERSION` (sigue v6).

**Cambios en esta spec (v4, 2026-08-16 — inicio de la v20.2):**
- **D1** primer ítem de la v20.2 cerrado: bug de `Notas del usuario.md`
  «#menu-bg no se oculta al iniciar partida». Causa raíz: el fondo del
  menú (cielo con nubes, `#menu-bg`, z-index 1 sobre el canvas) nunca se
  ocultaba en JS — solo se ocultaba `#blocker` (z-index 300), así que al
  terminar la carga el degradado tapaba el mundo. Fix: `showMenuBg()` en
  `public/scene.js` que controla el fondo aparte del bloqueador (la pausa
  usa un bloqueador translúcido y debe dejar ver el juego congelado
  detrás), cableado en `public/menus.js` en los tres puntos del flujo:
  `showMenu` → visible, `onWorldLoaded` → oculto, `onSeedRejected` →
  visible. Regresión a nivel de fuente en `tests/unit-fase20.js` (patrón
  `unit-camara`), registrado en `run.js`; verificación en navegador
  (CDP + Chrome headless, 2/2 ejecuciones): `#menu-bg` visible en el menú,
  oculto (`inline= none`) tras `join_world` → `init` → `onWorldLoaded`, y
  visible de nuevo tras `leave_world` → `menu_state`. Suite: **unit 60/60**
  (era 59 + el nuevo), biome 0, `node --check` limpio. Commit `875f8e1`.
  El resto de la v20.2 = backlog B6 (SV-5, REN-1 residual, timeouts CDP,
  `npm audit`) + el segundo bug de las notas (desconexión al cargar el
  mundo).

**Cambios en esta spec (v5, 2026-08-16 — definición de la v20.2):**
- Añadida la sección **B7** con la definición formal de la iteración v20.2:
  los dos bugs de las notas (**D1** `#menu-bg` y **D2** desconexión al
  cargar el mundo) + el backlog **B6** completo (SV-5, REN-1 residual,
  CI 19 y CI 20), este último implementado 2026-08-16 (código en el árbol
  de trabajo, pendiente de commit).
- **D2** cerrado (`18bbc2e`): causa raíz real del «desconexión al terminar
  de cargar el mundo» (F19.6 B2, que se había dado por ambiental) — el
  rate-limit por conexión medía el tiempo de PROCESAMIENTO, no el de
  llegada; el bloqueo síncrono de la carga del mundo (switchWorld →
  loadWorld/saveWorld) acumulaba los moves del cliente (pointer lock) en
  el buffer TCP y, al procesarlos en ráfaga en la misma ventana de 1 s, el
  servidor cerraba 1008 «demasiados mensajes» justo al terminar la carga.
  Fix `server/ratelimit.js` (cierre solo con 2 ventanas consecutivas
  sobre el límite = flood sostenido; una ráfaga tras un bloqueo es
  legítima) + recalibración de `unit-red.js`; reproducción end-to-end con
  bloqueo de 3 s simulado (128 moves cerraban; 188 ya no) y E2E menú 7/7;
  unit 60/60, biome 0. Verdicto corregido también en `fase19.6-spec.md`
  B2.
