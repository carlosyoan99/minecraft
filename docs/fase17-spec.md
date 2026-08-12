# Fase 17 — Menú inicial tipo Minecraft, UI/UX y móvil (Spec)

> Documento creado a partir de: `docs/Notas del usuario.md` (con sus
> modificaciones recientes), `docs/fase16-spec.md`, `docs/auditoria-2026-08-10.md`
> y la entrevista con el usuario (2026-08-11, Tandas 1-3).
> Fecha: 2026-08-11 · Proyecto: clon de Minecraft.
> Estado: **implementada** (commit `a2d0437` + mejoras de la auditoría
> 2026-08-11 en `server/net.js`: F16-03 anti-cheat de hundimiento, F16-05
> blindaje del mainLoop, F16-07 fuera de bordes en el relleno de chunks y
> C6-REN-3 envío de chunks fragmentado). Pendiente solo la auditoría final
> documentada en el Bloque E (los tests unitarios 53/53 y el E2E de menú
> 7/7 están en verde; los E2E clásicos requieren `SEED` desde A1).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1-A5 | `Notas del usuario.md` Mejoras + "Próximas Fases" (F17 = "UI/UX, experiencia visual, uso en móviles, interfaz 100% Minecraft") | Menú inicial tipo Minecraft: no cargar mundo al iniciar; lista de mundos con eliminar/clonar/cambiar modo/renombrar; config de mundo nuevo; ajustes en pestañas | TODO "Won't": "Menú inicial tipo Minecraft (diferido a la Fase 17)" | 🔴 |
| B1 | `Notas del usuario.md` Bugs (**nuevo**) | "No hay persistencia del inventario entre sesiones" | Sin asignar | 🟠 |
| B2 | `Notas del usuario.md` Bugs | "El cliente se desconecta a los pocos segundos de conectarse al servidor" | Sin asignar | 🔴 |
| B3 | `Notas del usuario.md` Bugs | Chunks vacíos que nunca cargan (física sí, render no; persiste entre sesiones) | Sin asignar | 🟠 |
| B4 | `Notas del usuario.md` Bugs | Romper la tierra bajo una flor/hierba no la destruye | Sin asignar | 🟡 |
| B5 | `Notas del usuario.md` Bugs | Cuevas: demasiadas y cortas; deberían ser pocas pero largas/grandes (explorables) | Sin asignar | 🟠 |
| B6 | `Notas del usuario.md` Bugs | En creativo los mobs siguen siendo atraídos por el jugador | Sin asignar | 🟡 |
| B7 | `Notas del usuario.md` Bugs | Minar dejando el clic presionado debe seguir minando el bloque siguiente (como MC) | Sin asignar | 🟡 |
| C1 | `Notas del usuario.md` Mejoras | Interfaz 100% Minecraft (pantalla de pausa estilo MC con Esc) | Sin asignar | 🟡 |
| C2 | `Notas del usuario.md` Mejoras | Experiencia visual del menú (estética MC) | Sin asignar | 🟡 |
| D1 | `Notas del usuario.md` Mejoras | "Adaptarlo mejor a pantallas de celular, aunque siga siendo necesario jugar con mouse y teclado" | Sin asignar | 🟠 |

## 1. Contexto

- **Prerrequisito (NO es tarea de esta fase):** la **Fase 16 debe estar cerrada**
  antes de tocar nada de la 17. Decisión del usuario en la entrevista: los
  pendientes transversales detectados en la auditoría de fases (E2E 1/6,
  audits `fase4`/`fase6`/`fase7` rojas por el mundo v6, `tests/run.js --audit`
  con `ReferenceError: AUDIT` desde el commit `a73e806`, recalibración v6 de
  los E2E) son **bugs de la Fase 16 que se solucionan en esa fase** — no
  entran en la spec 17. La Fase 17 asume: suite unitaria en verde (51),
  E2E 6/6 en solitario, audits `fase3`-`fase7` + `audit-altura` (72/72) en
  verde, `--audit` operativo y WIP de la Fase 16 commiteado.
- **Estado actual del arranque:** el servidor **carga un mundo al boot**
  (`server/server.js:73` `save.loadWorld()`; semilla de `SEED` o
  `miSemilla2026`). El cliente (Fase 7) muestra un menú simple
  (principal/mundos/ajustes, `public/index.html` + `public/ui.js:237-283`) y
  al pulsar Jugar con otra semilla envía `set_seed` → `switchWorld`.
  La Fase 17 lo convierte en **modo menú**: el servidor arranca sin mundo
  activo y el cliente no entra al juego hasta elegir/crear un mundo.
- **Decisiones de la entrevista (2026-08-11):**
  - Alcance completo acordado: menú tipo Minecraft + UI/UX + móvil + los
    **7 bugs abiertos sin asignar** (B1-B7).
  - Orden por **valor percibido**: menú primero (A), luego bugs (B), luego
    UI/UX (C) y móvil (D).
  - **Arranque sin mundo**: cambio arquitectónico aceptado; con `SEED` en el
    entorno el servidor arranca directo al mundo (indispensable para los E2E
    existentes, que no se tocan).
  - **Multijugador**: el primer jugador elige/crea el mundo activo
    (reutiliza `switchWorld`); los demás entran al mismo. Sin autenticación
    (Won't).
  - Cada bug lleva **test de regresión**; el menú lleva **E2E**; cierre con
    verificación manual en navegador y auditoría final obligatoria.
  - Nombre de la fase: **"Menú inicial tipo Minecraft, UI/UX y móvil"**.
  - **Won't respetado íntegramente hasta después de la Fase 20**: redstone,
    dimensiones, clima, autenticación/BD externa, encantamientos/pociones,
    aldeas generadas. La **Fase 19 no se adelanta**: NO rediseñar las
    interfaces de cofre/mesa de crafteo/horno ni crear texturas faltantes de
    ítems — eso es alcance de la 19.
- Fuentes: `docs/Notas del usuario.md`, `docs/fase16-spec.md` (plantilla y
  cierre), `CLAUDE.md`/`AGENTS.md` (convenciones), `docs/README.md`.

---

## 2. Bloque A — Menú inicial tipo Minecraft

### A1 — Servidor en modo menú (no cargar mundo al arrancar)

- **Qué hacer:**
  - `server/server.js`: sustituir el `save.loadWorld()` del boot por un
    **modo menú**: si hay `SEED` en el entorno (o un `world/` que lo exija
    para los E2E) se carga como hoy; sin `SEED`, el servidor arranca **sin
    mundo activo** (estado "menu mode").
  - `server/net.js`: al conectar en modo menú no se envía `init` de mundo;
    se envía el estado del menú (`menu_state` con la lista de mundos
    obtenida con `fs` de `world/<semilla>/`). Nuevo evento
    `join_world { seed, name }` que llama a `save.switchWorld` (infraestructura
    existente de F6/F9) y envía el `init` al elegir/crear el mundo.
  - `server/save.js`: reutilizar la `listWorlds()` **ya existente**
    (`save.js:414`, expuesta en `:688`) que devuelve
    `[{ seed, name, chunkCount, lastSaved, gamemode, worldSize }]` y
    reutilizar `switchWorld`/`deleteWorld`/validaciones ya existentes
    (gate de operador intacto).
  - `server/constants.js`: nueva constante si hace falta (p. ej.
    `MENU_MODE` implícito por ausencia de `SEED`).
- **Ficheros:** `server/server.js`, `server/save.js`, `server/net.js`,
  `server/constants.js` (+ `public/network.js` para el `menu_state`).
- **Criterio de éxito:** unit de red (`unit-red.js` o `unit-fase17.js`
  nuevo): conectar sin mundo activo NO produce `init` de mundo ni chunks;
  `join_world` carga el mundo pedido (init con `data.seed` correcta y
  gamemode/size del meta). E2E de menú: servidor sin `SEED` → el cliente
  recibe `menu_state` → `join_world` → `init`. Los E2E existentes siguen en
  verde (arrancan con `SEED` explícita).

### A2 — Pantalla principal tipo Minecraft

- **Qué hacer:** rework de `#menu-main` (`public/index.html`): título/logo
  del juego y botones grandes estilo MC (**Un jugador**, **Ajustes**,
  **Salir**). El nombre de jugador pasa a los ajustes (o a su propio campo
  en la pantalla principal) — no bloquea el arranque. No se entra al juego
  sin elegir mundo.
- **Ficheros:** `public/index.html`, `public/ui.js`, CSS del menú.
- **Criterio:** verificación manual en navegador + E2E de navegación del
  menú (abrir → Un jugador → volver → Ajustes → volver → Salir no hace
  nada destructivo).

### A3 — Pantalla de mundos con gestión completa

- **Qué hacer:** ampliar `renderWorldsList` (hoy solo lista + reproducir +
  eliminar op) con acciones por mundo: **reproducir**, **eliminar** (con
  confirmación; ya existe `world_delete` con gate), **clonar** (copia del
  mundo a una semilla nueva), **renombrar** (edita el nombre del mundo sin
  tocar la semilla), **cambiar modo de juego** (survival/creative, persiste
  en el meta). Botón **Nuevo mundo** → pantalla de configuración ya
  existente (nombre, semilla, modo, tamaño).
  - Servidor: `save.js` con `cloneWorld` (copia `world/<semilla>/` a otra
    semilla saneada con `seedDir()`), `renameWorld`, `setWorldMode`
    (actualiza `worldGamemode` del meta); handlers en `net.js` con la
    misma validación defensiva de F16 (C2: coords/strings, gates).
- **Ficheros:** `server/save.js`, `server/net.js`, `public/ui.js`,
  `public/index.html`.
- **Criterio:** unit de `save` (clonar crea una semilla nueva idéntica;
  renombrar/cambiar modo persisten en `world.json`; eliminar rechaza el
  mundo activo) + E2E de menú (crear → clonar → renombrar → cambiar modo →
  reproducir → eliminar).

### A4 — Ajustes en pestañas estilo Minecraft

- **Qué hacer:** reorganizar `#menu-settings` en pestañas:
  **Video** (distancia de render, FOV, calidad gráfica, coordenadas,
  pantalla completa), **Audio** (volumen maestro/efectos/ambiente) y
  **Controles** (sensibilidad, controles invertidos, teclado). Se conserva
  la persistencia actual en `mc_settings` y los `toggle*`/sliders actuales
  (no tocar lógica de `settings.js` salvo mover agrupaciones).
- **Ficheros:** `public/index.html`, `public/ui.js`, `public/settings.js`
  (solo si una pestaña necesita init adicional), CSS.
- **Criterio:** verificación manual (cada pestaña muestra sus ajustes y
  persisten) + `unit-ajustes.js` ampliado si se extrae lógica pura nueva.

### A5 — No cargar mundo al iniciar (flujo del cliente)

- **Qué hacer:** refactor del flujo actual (F7: menú → `set_seed` tras
  Jugar) al nuevo: al cargar la página el cliente conecta y muestra el
  **menú** (estado `menu_state`); al elegir un mundo existente o crear uno
  envía `join_world` y muestra la pantalla de carga (`onWorldLoaded` cierra
  la carga al llegar el `init`). El puntero se bloquea con el gesto del
  usuario (patrón actual).
- **Ficheros:** `public/network.js`, `public/ui.js`, `public/connection.js`.
- **Criterio:** E2E de menú: la primera pantalla visible es el menú y no
  llegan chunks hasta `join_world`; al confirmar llega `init` y la pantalla
  de carga se cierra.

---

## 3. Bloque B — Bugs del usuario sin asignar (cada uno con test de regresión)

### B1 — Persistencia del inventario entre sesiones

- **Problema:** `server/save.js:21-24` persiste solo chunks/furnaces/chests/
  mobs; los `Player` son de sesión (`net.js:285`), así que inventario,
  salud/comida, XP y posición se pierden al desconectar.
- **Qué hacer:** persistir por jugador (nombre) en un archivo **aditivo**
  `world/<semilla>/players/<nombre>.json` (no toca `SCHEMA_VERSION` ni el
  formato de chunks/meta: retrocompatible por definición, con test que
  verifica que un mundo v6 existente sigue cargando). Guardado al
  desconectar/autosave (reusar la cola asíncrona de C1/F16); restauración al
  conectar (re-vincular por nombre, patrón de las mascotas F12).
- **Ficheros:** `server/save.js`, `server/players.js` (`createPlayer` con
  inventario restaurado), `server/net.js` (cargar al conectar, guardar al
  cerrar), `server/server.js` (guardado periódico), `server/constants.js`
  (ruta) si aplica.
- **Criterio:** unit de persistencia (`unit-persistencia.js` o
  `unit-fase17.js`): conectar → modificar inventario/posición → guardar →
  desconectar → reconectar → inventario/posición/salud restaurados; mundo v6
  sin archivos de jugador sigue cargando (retrocompatibilidad).

### B2 — El cliente se desconecta a los pocos segundos

- **Problema:** reportado por el usuario; sin causa confirmada.
- **Qué hacer:** **diagnosticar primero** (sonda WS + logs del servidor;
  sospechosos: rate-limit de 30 msgs/s (`net.js:438` cierra 1008), cierre
  1013 "server lleno" (`net.js:253`), `maxPayload`, evento no manejado que
  ahora loguea CL-3, ausencia de keepalive). Reproducir en navegador y con
  un cliente WS crudo; corregir la causa raíz y fijarla con test de
  regresión (extender `unit-red.js` si es servidor).
- **Ficheros:** `server/net.js`, `public/network.js` (si el cliente es el
  que corta).
- **Criterio:** sesión estable de 10+ minutos sin desconexiones
  (verificación manual) + test de regresión del síntoma corregido en verde.

### B3 — Chunks vacíos en el cliente (física sí, render no)

- **Problema:** algunos chunks se renderizan vacíos aunque su física existe;
  persiste entre sesiones y cambia de chunk entre sesiones.
- **Qué hacer:** diagnosticar (F3/`window.__mc*`, `audit-fase7` CDP);
  hipótesis: error en `buildChunkGeometry` para ciertos chunks (patrón del
  bug de la Fase 4) o desync del índice local→Y de mundo tras el v6
  (`chunkGeometry.js`). Corregir y fijar: `unit-greedy`/`unit-workers` (si
  es geometría) o auditoría CDP (si es el flujo de carga).
- **Ficheros:** `public/world.js`, `public/chunkGeometry.js`,
  `public/chunkWorker.js`, `tests/audit-fase7.js` (si se amplía).
- **Criterio:** en un área explorada (CDP/auditoría) todos los chunks
  visibles tienen malla (`mcChunks > 0`) y no queda ningún chunk vacío
  persistente tras recargar la sesión.

### B4 — Romper el bloque bajo una flor/hierba no la destruye

- **Problema:** las plantas (33-35) quedan flotando al romper el soporte.
- **Qué hacer:** al romper un bloque, si el de encima es una planta no
  soportada (hierba/flor), romperla también (drop correspondiente) — como
  MC. Implementar en el flujo de rotura del servidor
  (`server/world.js` `setBlock` o `server/net.js` break) con broadcast del
  cambio.
- **Ficheros:** `server/world.js`, `server/net.js`, `public/world.js`
  (cliente: aplicar el cambio).
- **Criterio:** unit (`unit-mundo.js`/`unit-fase17.js`): romper tierra con
  planta encima elimina la planta y suelta su ítem; sin planta no hay
  cambio extra.

### B5 — Cuevas: pocas pero largas y grandes (explorables)

- **Problema:** demasiadas cavidades pequeñas; se piden menos pero más
  conectadas.
- **Qué hacer:** ajustar los parámetros del ruido 3D de cuevas en
  `generateChunk` (umbral más bajo + octavas/radio mayores → cavidades
  menos frecuentes pero más amplias y conectadas). **No romper** la
  distribución de minerales por altura (diamante `<20`, hierro `<12` en
  v6) ni los tests deterministas (`unit-mundo.js`, `unit-biomas.js`,
  `audit-fase4`).
- **Ficheros:** `server/world.js` (generación), `tests/unit-mundo.js` si se
  recalibra.
- **Criterio:** test determinista nuevo: en un área de muestra fija hay
  menos cavidades aisladas y mayor tamaño medio de cavidad que la línea
  base; `audit-fase4` y la suite en verde.

### B6 — Mobs hostiles atraídos en creativo

- **Problema:** en creativo los hostiles siguen persiguiendo/atacando.
- **Qué hacer:** los hostiles **no agreden a jugadores en creativo**
  (decisión de diseño del clon, alineada con el bug reportado): en la
  lógica de agresión/persecución (`server/mobs.js`), comprobar el
  `gamemode` del objetivo y no aggro/perseguir si es creative. En
  survival el comportamiento actual se mantiene intacto.
- **Ficheros:** `server/mobs.js` (aggro/chase/attack), `server/net.js` si
  el aggro se decide ahí.
- **Criterio:** `unit-mobs-ia.js` ampliado: un hostil no aggro a un jugador
  en creative (ni de día, ni golpeado); en survival sí lo persigue y ataca.

### B7 — Minar con clic presionado (re-minado automático)

- **Problema:** al mantener el clic izquierdo no se sigue minando el bloque
  siguiente.
- **Qué hacer:** en `public/input.js` mantener el estado del botón
  izquierdo; al completarse la rotura del bloque actual y seguir pulsado,
  iniciar la rotura del siguiente bloque apuntado (si está a distancia de
  minado) — como MC. Confirmar que `server/mining.js` soporta sesiones
  encadenadas (no requiere cambio de protocolo; si lo requiere, documentarlo
  y ajustar ambos lados en el mismo commit).
- **Ficheros:** `public/input.js`, `server/mining.js` (solo si hace falta).
- **Criterio:** verificación manual (mantener clic rompe una línea de
  bloques) + unit si se añade lógica nueva al servidor.

---

## 4. Bloque C — UI/UX y experiencia visual (sin adelantar la Fase 19)

### C1 — Pantalla de pausa estilo Minecraft (Esc)

- **Qué hacer:** al pulsar Esc dentro del juego, en lugar de solo
  `closePanels`, abrir una **pantalla de pausa**: **Continuar**, **Ajustes**
  (mismas pestañas de A4) y **Volver al menú principal** (desconecta al
  jugador, libera el mundo activo si no queda nadie — el servidor vuelve al
  modo menú). Mantener los paneles actuales (inventario/horno/cofre) con su
  comportamiento.
- **Ficheros:** `public/index.html`, `public/ui.js`, `public/input.js`,
  `server/net.js` (si "volver al menú" requiere evento de desconexión
  limpia).
- **Criterio:** E2E de menú (Esc abre pausa → Continuar reanuda → Volver al
  menú desconecta y muestra la pantalla principal) + manual.

### C2 — Estética del menú (interfaz 100% Minecraft)

- **Qué hacer:** estilizar las pantallas del menú con la estética MC ya
  presente (botones con textura/9-slice, títulos, sombras, transiciones
  entre pantallas). Sin rediseñar el inventario/cofre/horno (F19) ni crear
  texturas de ítems nuevas.
- **Ficheros:** `public/index.html`, CSS del menú, `public/ui.js`.
- **Criterio:** verificación manual en navegador (las tres pantallas + pausa
  con aspecto coherente; navegación fluida).

---

## 5. Bloque D — Adaptación móvil (acotada)

### D1 — Controles táctiles básicos (HUD adaptativo)

- **Qué hacer:** detectar pantalla táctil (`touchstart`/`ontouchstart`) y
  mostrar un overlay: **joystick virtual** izquierdo (movimiento + sprint),
  arrastre a la derecha para mirar (equivale al pointer lock), y botones:
  **saltar**, **agacharse**, **atacar/romper** (tap), **usar/comer** y
  **inventario**. Mouse y teclado siguen siendo el camino principal; no se
  cambia la física ni el protocolo (el servidor no se entera).
- **Ficheros:** `public/input.js`, `public/player.js` (mapear los controles
  táctiles a `move`), `public/index.html`, `public/ui.js`, CSS.
- **Criterio:** verificación manual en viewport móvil (DevTools): 2 minutos
  de juego sin mouse (mover, mirar, saltar, atacar, abrir inventario);
  sin cambios de protocolo; mouse+teclado intactos.

---

## 6. Bloque E — Cierre y auditoría de la Fase 17 (tarea obligatoria)

**Estado al cierre de la implementación (2026-08-12):**

- Suite unitaria completa: **53/53 en verde** (`unit-fase17` incluido,
   `unit-commands` tolera la deriva de 1 ms del `worldTime`).
- E2E de menú (`tests/e2e-menu.js`): **7/7 en verde** — levanta su propio
   servidor sin `SEED` en :3997 (menu_state → join_world → init →
   leave_world → menu_state + cooldown anti-spam C4) y limpia su mundo.
- E2E clásicos (con `SEED=miSemilla2026 PORT=3998 node server.js`): 6/7 —
   `e2e-durabilidad` con TIMEOUT en fase "breaking" (preexistente, ya
   documentado en la auditoría 2026-08-11; sin crash).
- Auditorías por fase: sin regresiones (mismo estado que la auditoría
   2026-08-11: `fase5` y `altura` en verde; `fase3/4/6/7` rojas por
   presupuestos descalibrados del mundo v6 y render SwiftShader).
- `node --check` y `biome` 0 errores en los archivos tocados.

1. Suite unitaria completa en verde (`node tests/run.js --unit`) tras cada
   commit; **E2E completos en solitario** (`SEED=miSemilla2026 PORT=3998
   node server.js` + `WS_URL=... run.js --e2e`) incluidos los **E2E de
   menú** nuevos (estos últimos sin `SEED`, servidor propio en :3997).
2. `node --check` sobre los `.js` tocados y `biome check` 0 errores.
3. Auditorías por fase sin regresiones (`audit-fase3`-`fase7` +
   `audit-altura` 72/72) — deben estar ya verdes por el cierre de la Fase 16.
4. Verificación manual en navegador: A1-A5 (menú completo, arranque sin
   mundo), B1-B7 (cada bug confirmado corregido), C1-C2 (pausa + estética),
   D1 (móvil).
5. Actualizar `TODO.md` (Fase 17 cerrada), `docs/README.md` (índice),
   `AGENTS.md` (estado de fases) y `docs/Notas del usuario.md` si procede.
6. `SCHEMA_VERSION` **sin cambios**: la persistencia B1 es aditiva (archivo
   por jugador). Si una implementación decidiera meter los jugadores en
   `world.json`, subir a v7 con migración v6→v7 retrocompatible + test
   (modelo: `unit-persistencia.js`).

---

## 7. Criterios de aceptación (resumen)

1. **Bloque A:** el juego arranca al menú sin cargar mundo (servidor en modo
   menú; con `SEED` arranca directo para tests); pantalla principal tipo MC;
   lista de mundos con reproducir/eliminar/clonar/cambiar modo/renombrar;
   nuevo mundo con configuración; ajustes en pestañas; todo con E2E de menú.
2. **Bloque B:** los 7 bugs del usuario corregidos, cada uno con su test de
   regresión y verificación manual en navegador.
3. **Bloque C:** pantalla de pausa estilo MC con "volver al menú principal";
   estética del menú coherente (sin adelantar F19).
4. **Bloque D:** HUD táctil básico funcional en móvil; mouse+teclado
   intactos; sin cambios de protocolo.
5. **Bloque E:** suite completa verde (unit + E2E 6/6 + menú), audits sin
   regresiones, `SCHEMA_VERSION` intacto, documentación actualizada y
   auditoría final documentada en esta spec.
