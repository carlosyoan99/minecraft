# Auditoría 2026-08-16 — GitHub Copilot (reconciliación con el árbol actual)

> **Fuente:** auditoría de calidad de GitHub Copilot sobre el árbol
> `161721c` (cierre de la Fase 19.6, 2026-08-15), entregada como
> `Auditoría de calidad.md` (2026-08-16). Este documento **no reaudita el
> código**: verifica cada hallazgo de Copilot contra el árbol actual
> (`161721c` + iteración v20.1 `d88a9a9`) y deja el estado y la hoja de
> ruta. Método: lectura de código verificada a mano (no automática) y
> ejecución de la línea base (§0).

## 0. Línea base (2026-08-16, mismo día del informe de Copilot)

- **Unitarios:** **59/59 VERDE** (`node tests/run.js --unit`) — verificado
  de nuevo en esta reconciliación.
- **E2E 7/7**, **`--audit` 6/6** (con fase3/fase7 dependientes de carga de
  CPU, causa ambiental), **biome 0 errores**, `node --check` limpio.
- **`npm audit`:** 0 vulnerabilidades (informe de Copilot; confirmado en la
  auditoría 2026-08-15 y mantenido).

## 1. Veredicto general

El informe de Copilot (fechado 2026-08-16 sobre el árbol `161721c`) es en
su práctica totalidad **una reedición de los hallazgos de la auditoría
2026-08-15** (los mismos IDs: H1, B1, F16-01, M1-M5, B2, B3, SV-5,
REN-1/2/3/5). La diferencia clave: **todas las correcciones que Copilot
recomienda como "inmediatas" (H1, F16-01, B1) y la mayoría de las altas
(M1-M5, B2, B3) ya están aplicadas en el árbol que él mismo audita**
(`161721c` es precisamente el commit que las integra junto al cierre de la
F19.6). Quedan **dos pendientes reales recorridos que la auditoría ya
anotó como residuales** (SV-5 stack y REN-1 `savePlayer` síncrono), más
las sugerencias de proceso (CI/auditorías ambientales).

## 2. Reconciliación hallazgo por hallazgo

| # | Hallazgo (Copilot) | Severidad | Estado real en el árbol | Veredicto |
|---|---|---|---|---|
| 1 | **H1** truncamiento de cofres (`chestSlot:"length"`) | Crítico | **CORREGIDO**: `server/actions.js` valida `Number.isInteger` + rango en `chest_action take`/`put` y `grid_set` (comentario "Auditoría 2026-08-15"). Test: `tests/unit-cofre.js` | ✅ Ya resuelto en `161721c` |
| 2 | **F16-01** crash del `mainLoop` por chunk OOB (`Array.from(undefined)`) | Alto | **CORREGIDO**: `server/chunk-fill.js:37` filtra `world.outOfBounds(cx,cz)` antes de generar y `:54` tiene guard `if (state.chunks.has(key))` antes del `Array.from` (comentario "F16-07"/"Fase 16 (C2)") | ✅ Ya resuelto |
| 3 | **B1** inyección en `grid_set` (`fromInventorySlot` basura) | Alto | **CORREGIDO**: `server/actions.js:96-101` exige `Number.isInteger` 0-35. Test `unit-cofre.js` | ✅ Ya resuelto |
| 4 | **M1** CSWSH (sin `verifyClient`) | Medio | **CORREGIDO**: `server/timers.js:334-349` `originAllowed` (allowlist localhost/LAN) + `:366-368` `verifyClient` | ✅ Ya resuelto |
| 5 | **M2** cría de animales sin tope | Medio | **CORREGIDO**: `server/mob-species.js:545` tope a la cuota global (`state.mobs.length >= 30`) | ✅ Ya resuelto |
| 6 | **M4** carrera por el OP (primer jugador) | Medio | **CORREGIDO**: OP solo por lista `OPS`; el fallback host aplica únicamente sin lista (`server/constants.js:1193-1200`, `server/net.js:411`) | ✅ Ya resuelto (ver §4) |
| 7 | **M3** suplantación por nombre | Medio | **CORREGIDO**: `server/net.js:398-407` rechaza el nombre duplicado en línea (insensible a mayúsculas) | ✅ Ya resuelto |
| 8 | **M5** HTTP/WS sin TLS | Medio | **DECISIÓN documentada** (no bug): alcance localhost/LAN por diseño; proxy TLS recomendado para exposición (`README.md:177-184`) | ✅ Documentado |
| 9 | **B1** (2.º incidente) validación laxa de slots en cofre/horno | Bajo | **CORREGIDO**: mismo `Number.isInteger` + rango que H1 (cofres y hornos) | ✅ Ya resuelto |
| 10 | **B2** rate-limit único global | Bajo | **CORREGIDO**: `MAX_ACTION_RATE` (20/s) por acción además del global `MAX_MSG_RATE` (`server/net.js:604-633`) | ✅ Ya resuelto |
| 11 | **B3** sin log de comandos OP | Bajo | **CORREGIDO**: `server/commands.js:199-201` registra cada comando OP ejecutado | ✅ Ya resuelto |
| 12 | **SV-5** tope de stack (64) en `addToInventory` | Bajo | **PARCIAL/ABIERTA**: el `/give` clampea a 64 (`commands.js:355`) pero `addToInventory` sigue apilando sin tope (`server/inventory.js:44-49`); el cliente pinta `item.count` crudo | ⏳ **Pendiente → F20 (v20.x)** |
| 13 | **REN-1** guardado síncrono | Medio | **PARCIAL/CORREGIDO**: autosave de chunks ya es asíncrono por lotes (cola `setImmediate`, F16 C1); **queda `savePlayer` síncrono** en el `setInterval` (`server.js:115`), ya mitigado (intervalo 10-15 s, F1, guardado en eventos) | ⏳ **Pendiente menor → F20 (v20.x)** |
| 14 | **REN-2** hornos permanentes en memoria | Medio | **CORREGIDO**: poda en `server/crafting.js:309` (horno vacío) + `furnaces.delete` al romper/TNT (`players.js:137`, `tnt.js:85`, `mobs.js:449`) | ✅ Ya resuelto (F19.6/16) |
| 15 | **REN-5** escaneo O(r²) sin convergencia | Bajo | **CORREGIDO**: `chunk-fill.js:37` filtra OOB antes de meter en `missing`; ya no se re-escanea el borde por tick | ✅ Ya resuelto (F16-07) |
| 16 | **REN-3** envío masivo del radio en un mensaje | Bajo | **CORREGIDO**: `sendChunksFragmented` (`net.js:85-101`) fragmenta ≤6/lote; corona nueva al ampliar (P3, F20 v20.1) | ✅ Ya resuelto |
| 17 | Modularización `net.js`/`world.js` (>2000/-1000 líneas) | Estilo | **CORREGIDO por el refactor D-1..D-8 de la F18**: `server/net.js` 1179 líneas (handlers en actions/timers), `world.js` 661 (noise/biomes/generation/structures), `ui.js` 111 (orquestador) | ✅ Ya resuelto (el baremo de Copilot describe el árbol pre-18) |
| 18 | Funciones muy largas sin comentarios (`buildChunkGeometry`, `tickMobs`) | Calidad | **PARCIAL**: greedy meshing tiene comentarios por bloque (F13); `tickMobs` ya está particionado por especie (D-2 F18). Mejora continua | ⚪ Mejora continua |
| 19 | Auditorías ambientales inestables (`audit-fase3`, `audit-fase7`) | Bajo/CI | **CONOCIDO y documentado**: fallan por CPU a carga 15-19 + SwiftShader (no regresión; verificado idéntico en HEAD). Sugerencia de Copilot: subir timeouts en CI | ⚪ Sugerencia de proceso → F20 (v20.x) |
| 20 | `npm audit` 0 vulns + monitoreo de dependencias | Bajo | **CONFIRMADO**: 0 vulnerabilidades. Sin CI en el repo; sugerencia: `npm audit fix --audit-level=moderate` como paso de verificación | ⚪ Sugerencia de proceso → F20 (v20.x) |

## 3. Falsos positivos / redacciones que ya no aplican

- La cita "**`server/world.js:968-970`**" del hallazgo 2 (F16-01) hace
  referencia a la ubicación antigua antes del refactor D-3 de la F18; el
  guard vive hoy en `server/chunk-fill.js`.
- El hallazgo 17 (longitud de `net.js`/`world.js`) describe el árbol
  pre-refactor (F18 D-1..D-8). Los módulos ya están particionados por
  responsabilidad (ver los mapas de `docs/server/README.md` y
  `docs/public/README.md`).
- La afirmación de que H1/B1 "explotables por un cliente sin modificar"
  deja de ser cierta en el árbol auditado por el propio Copilot: ambas
  rutas validan índices desde el cierre de la F19.6 (`161721c`).

## 4. Decisión de diseño confirmada (no hallazgo)

- **Operador por lista `OPS`/token, nunca "primer conectado" con lista
  definida**: el fallback de host solo existe para LAN/sin lista
  (`server/constants.js:1193-1200`, M4). La ausencia de autenticación
  (identidad = nombre) es la decisión de diseño del proyecto (alcance LAN,
  sin cuentas), documentada en `TODO.md` § Won't y en `README.md`.
- **TLS (M5)**: no aplica en localhost/LAN (use case del juego); si se
  expone el puerto, proxy TLS (documentado en `README.md:177-184`).

## 5. Planificación (pendientes reales, dentro de la Fase 20, iteración v20.x)

Los dos "residuales" y las dos sugerencias de proceso se planifican en la
**Fase 20 (ciclo rolling)**, según su naturaleza:

| ítem | Qué hacer | Dónde planificado | Prioridad |
|---|---|---|---|
| **SV-5** | Tope de stack 64 en `addToInventory` (servidor); el cliente ya dibuja el contador crudo — se decide si el recuento encaja en 64 o crea slot nuevo (paridad MC). Test en `unit-*`; sin cambios de protocolo | `docs/spec/fase20-spec.md` B4 | Baja |
| **REN-1 (residual)** | `savePlayer` a la cola asíncrona (mismo patrón que chunks, F16 C1) o guardado por eventos de inventario (ya existe el mitigador F1 de intervalo 10-15 s) | `docs/spec/fase20-spec.md` B4 | Baja-media |
| **CI (hallazgo 19)** | Subir los timeouts de `audit-fase3`/`audit-fase7` (o documentar la causa ambiental como tolerada en el flujo de verificación) | `docs/spec/fase20-spec.md` B4/C | Baja |
| **CI (hallazgo 20)** | Añadir `npm audit --audit-level=moderate` al flujo de verificación (script en `package.json` o paso documentado) | `docs/spec/fase20-spec.md` B4/C | Baja |

## 6. Conclusión

El informe de Copilot acierta en **cuánto** — el código sigue
estructuralmente sano, 0 vulnerabilidades, suite en verde — y es
**coincidente con la auditoría interna 2026-08-15 ya integrada** en el
árbol que él audita. La práctica totalidad de sus correcciones
recomendadas ya existe; las cuatro mejoras restantes (SV-5, `savePlayer`
async, timeouts de auditorías ambientales y `npm audit` en el flujo de
verificación) son menores y quedan planificadas en la Fase 20.