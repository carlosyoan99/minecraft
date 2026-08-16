# Auditoría 2026-08-15 — Seguridad, resiliencia, rendimiento y cliente

> **Fecha:** 2026-08-15 · **Árbol auditado:** working tree con la Fase 19.5 en curso (cambios sin commitear en `server/` y `public/`) · **Alcance:** seguridad (WebSocket/HTTP, validación de entrada, datos, operadores), resiliencia y recuperación ante fallos del servidor, rendimiento y escalabilidad, resiliencia/UX del cliente, monitorización. Sin corrección de código: documento de estado y acciones recomendadas.
> **Método:** línea base (sintaxis, unitarios, E2E, linter, auditorías por fase, `npm audit`) + cuatro pases especializados en paralelo (`seguridad`, `rendimiento`, `auditoria-servidor`, `auditoria-cliente`). Los hallazgos previos de `auditoria-2026-08-10.md` y `auditoria-2026-08-11.md` se etiquetan como persiste/corregido/parcial.

## Línea base

- **Sintaxis** (`node --check` sobre `server/`, `public/`, `tests/` y raíz): **TODO VERDE**.
- **Unitarios** (`node tests/run.js --unit`): **58/58 VERDE**.
- **E2E** (servidor vivo en :3998): **7/7 VERDE** (`e2e-menu` levanta servidor propio).
- **Linter** (Biome): **0 errores**, 207 warnings + 17 infos (estilo/correctitud fixable, no bloqueantes). Sin errores que listar.
- **Auditorías por fase** (`node tests/run.js --audit`): **5/6 verdes**; `audit-fase7` **ROJO** por **causa ambiental** (render CDP en CPU/SwiftShader a ~0.9 fps → timeouts de `Runtime.evaluate` y ventanas de sondeo DOM), no una regresión de código. Conviene re-ejecutarla con GPU real o más holgura de timeout.
- **`npm audit`** (ejecutado durante esta auditoría): **0 vulnerabilidades** (prod y dev).
- **Arranque:** HTTP 200 en `/` (puertos 3000/3998/3999 verificados; arranque ~10-15 s con mundo `miSemilla2026`, 1065 chunks).
- **Nota de entorno:** el working tree contiene cambios sin commitear de la Fase 19.5 (`public/audio.js`, `network.js`, `menus.js`, `settings.js`, `player.js`, `panels.js`; `server/{net,combat,save*,world,timers,server}.js`; nuevos `musicpalette.js`, `a11y-nav.js`, `server/log.js`, `unit-fase19.5.js`). La línea base ya incluye ese trabajo en curso.

## Resumen ejecutivo

El sistema está en buen estado general: suite completa, arranque limpio y sin dependencias vulnerables. Hay **un único hallazgo crítico explotable** sin modificar el juego (H1, índice-string en acciones de inventario/cofre que trunca arrays y se persiste), **14 hallazgos de riesgo medio** repartidos entre seguridad (5), resiliencia del servidor (2+log) y rendimiento (4) y cliente (2), y una colección de mejoras bajas. Los grandes problemas de auditorías previas (guardado síncrono REN-1, fugas de hornos REN-2, `JSON.parse` sin guard CL-3, desync de mascotas CL-2, cooldown de `set_seed` SEC-2) están **corregidos**. Las acciones se priorizan en 4 frentes: **seguridad crítica (hoy)**, **resiliencia (Fase 19.5/19.6)**, **rendimiento (Fase 20)** y **cliente (mejora continua)**, más **monitorización** (a valorar).

---

## 1. Seguridad — hallazgos

> Informe del subagente `seguridad` (verificado en árbol actual; se cita `npm audit` ejecutado).

### Tabla de hallazgos

| ID | Severidad | Archivo:línea | Descripción | Explotable por un cliente sin modificar (sí/no) |
|---|---|---|---|---|
| H1 | 🔴 Alto | `server/actions.js:342,359,366` (y `:313-314,328`, `:91-92`) | `chest_action take` con `chestSlot:"length"` trunca el array del cofre a 0 y **se persiste vacío**; mismo patrón en `put` (`invSlot:"length"`) que trunca el inventario del atacante, y `grid_set` sin `Number.isInteger` | **Sí** |
| M1 | 🟠 Medio | `server/timers.js:340` | CSWSH: `WebSocketServer({...})` sin `verifyClient` ni validación de `Origin` | Sí |
| M2 | 🟠 Medio | `server/mob-species.js:529-555` (`:553` `push(baby)`) | Cría de animales sin tope: la cuota de 30 mobs solo aplica al spawn natural, no a `applyFeed` | Sí |
| M3 | 🟠 Medio | `server/net.js:385`, `server/save-players.js:78-133` | Suplantación por nombre: un segundo socket con el mismo nombre restaura el inventario guardado del nombre | Sí |
| M4 | 🟠 Medio | `server/net.js:398-399` | Carrera de OP: el primer jugador en conectar tras un reinicio es operador (`state.players.size === 0`) | Sí |
| M5 | 🟠 Medio | `server/timers.js:334-340`, `server/net.js:276-291` | HTTP/WS sin TLS ni autenticación; riesgo solo si el puerto se expone más allá de localhost/LAN | Sí (si desplegado) |
| B1 | 🟡 Bajo | `server/actions.js:91-93` | `grid_set` lee `p.inventory[fromInventorySlot]` sin `Number.isInteger` ni rango → inyecta slot basura en el grid (no trunca) | Sí |
| B2 | 🟡 Bajo | `server/net.js:566-585` | Rate-limit único global (30 msg/s, `constants.js:77`); sin cuota específica por acción (el anti-cheat de distancia/sólidos acota el ritmo físico) | Sí |
| B3 | 🟡 Bajo | `server/commands.js:170-459` | Sin registro de comandos OP (`/give`, `/tp`, ...): mutan el mundo sin dejar rastro | — |

### Detalle por pregunta del encargo

**1.1 — Origin en WebSocket.** No validado. `server/timers.js:340` crea el server sin `verifyClient`; el HTTP es un express plano sin middleware de origen (`net.js:285-291` solo sirve `static` con `nosniff`). Riesgo **medio** (CSWSH: un sitio ajeno en la misma LAN podría abrir sockets contra el servidor). Solución: `verifyClient` con allowlist (`localhost`, IP LAN) o token de sesión en `?token=`; opcionalmente `helmet`/CORS estricto.

**1.2 — Timeout de inactividad (verificado por `auditoria-servidor`).** Implementado: heartbeat ping/pong cada 15 s con `terminate()` en la ronda siguiente (`server/timers.js:345-358`; flags en `net.js:356-359`); el `close` resultante limpia mining/hornos, guarda al jugador (`net.js:1046`), y libera el slot de `MAX_CONNECTIONS=10`. Riego **sin riesgo**. Nota: `ws.on("error", () => {})` en `net.js:1068` traga errores de socket en silencio (Bajo, F7).

**1.3 — Tamaño de mensajes.** Configurado: `WS_MAX_PAYLOAD = 1 MiB` (`server/constants.js:134`, aplicado en `timers.js:340`, ws cierra 1009). Los campos largos se recortan: chat `slice(0,200)` (`actions.js:836`), nombre 16 (`net.js:306`), semilla/nombre de mundo 40 (`constants.js:145`). Riesgo **sin riesgo** (tope de 1 MiB + 30 msg/s + 10 conexiones acotan).

**1.4 / 5.4 — Reconexión del cliente.** **Ver §6 (CL-1)** — no hay backoff; solo recarga manual.

**1.5 — Atribución de mensajes a jugador.** Correcto: `playerId = uuidv4()` al conectar (`net.js:353`); el handler resuelve `p = state.players.get(playerId)` por closure del socket (`net.js:557`), nunca desde el payload. Riesgo **sin riesgo**.

**1.6 — Pruebas con clientes WS crudos.** Existen e2e con WS a medida (`tests/e2e-menu.js`, `tests/e2e-cofre.js`, `tests/helpers.js`), que son exactamente el patrón de un atacante. Ninguno envía claves no enteras (por eso H1 pasó). La prueba práctica de H1 **no se ejecutó** (requiere autorización explícita; es un exploit real incluso contra el servidor de pruebas).

**2.1 — Validación de IDs y tipos por evento.** Mezcla: lo crítico está validado — coords con `validCoords`+`Number.isFinite` (`anticheat.js:20-29`, usadas en `net.js:708`, `actions.js:175,286`); slots con `Number.isInteger` en `inventory_swap` (`actions.js:151`), `grid_return` (`:131`), cofre `put` (`:321`) y `take`/`invSlot` (`:347`). **Faltan** en: `chestSlot` del `take` (`actions.js:342`), `invSlot` del `put` (`actions.js:313-314`) y `fromInventorySlot` del `grid_set` (`actions.js:91`) → H1/B1. Riesgo **alto por H1**.

**2.2 — Rate-limit anti-spam de construcción.** No hay cuota específica; solo global 30 msg/s (`net.js:566-585`). El servidor valida distancia ≤7 y bloque sólido en cada `block_action` (`net.js:707-709,748`). Riesgo **bajo**.

**2.3 — Inventario autoritativo del servidor.** Correcto: el grid de crafteo es `p.craftingGrid` del servidor; `handleCraft` consume de ahí (`actions.js:68-87`); `place` lee `p.inventory[p.selectedSlot]` server-side (`net.js:749-750`). Riesgo **sin riesgo** (salvo H1/B1).

**2.4 — Límite de mobs.** Spawn natural: cuota global 30 vivos (`mob-spawn.js:101-102`) + despawn >128 bloques (`timers.js:168-185`). **Cría sin tope** → M2 (`mob-species.js:529-555`, `push(baby)` en `:553` sin consultar la cuota). Riesgo **medio**.

**2.5 — Coordenadas dentro del mundo.** Correcto y exhaustivo: `Number.isFinite` previo (`anticheat.js:20-29`), Y acotado y `setBlock` con límites (`world.js:257-258,450-455`), `inBounds`/`worldHalfExtent` (`world.js:245-248`), clamps en move y `/tp`. Riesgo **sin riesgo** (vector NaN ya cerrado).

**2.6 / 8.5 — XSS en chat y UI.** Sin sink alcanzable hoy. Chat con `textContent` (`public/hud.js:305`); lista de mundos con `escapeHtml` (`public/menus.js:435,513-521`); los `innerHTML` restantes interpolan IDs numéricos validados y strings internos. Riesgo **sin riesgo**. Riesgo latente ya documentado: Three.js desde unpkg sin SRI ni CSP (`public/index.html:9-16`, deferido por `net.js:280-284`). **Nota 2026-08-15:** resuelto — Three.js se sirve local (`public/vendor/`, Fase 19.6), sin CDN externo.

**3.1 — Autenticación/contraseñas.** **No implementado** (decisión de diseño, LAN): identidad = nombre arbitrario en `?name=` (`net.js:385`); se restaura el inventario del nombre. Consecuencia: suplantación = robo de inventario guardado (M3). Documentado como riesgo de diseño.

**3.2 — Cifrado (WSS).** **No implementado**: `http.createServer` + ws plano (`timers.js:334-340`); cliente `ws://` (`public/connection.js`). Bajo en localhost/LAN; **alto si el puerto se publica** (M5). Solución: TLS tras proxy o wss directo en cualquier despliegue no-local.

**3.3 / 3.6 — Operadores.** El gate es server-side real (`commands.js:123-131,179-185`; `isOp` asignado en `net.js:398-399`). El cliente no decide nada. Riesgos: **carrera del primer jugador** (M4) y **ausencia de logs de comandos OP** (B3, no hay `log.*` en `executeCommand`).

**3.4 — ¿`express.static` expone `world/`?** No. Solo sirve `public/` (`net.js:285-291`); `world/` vive fuera (`WORLD_ROOT = ../world`, `constants.js:137`). Riesgo **sin riesgo**.

**3.5 — Path traversal en nombres/semillas.** Correcto: `seedDir` solo a-z0-9_-… (tope 40, `constants.js:139-147`), `sanitizePlayerFile` (`save-players.js:29-35`), `sanitizeWorldName` (`save-meta.js:43-51`), `deleteWorld` con `path.resolve`+`startsWith(root+sep)` (`save-meta.js:192-222`). Riesgo **sin riesgo**. Nota: colisión `a/b` vs `a_b` mapean al mismo archivo (confusión, no traversal).

**7.5 — `npm audit`.** 0 vulnerabilidades (ver Línea base).

**8.1 — ¿Inventario modificable localmente?** No, salvo H1/B1: toda operación revalida contra el `Player` del servidor; el wire nunca escribe slots salvo `grid_set` (B1) y los índices del cofre (H1). Riesgo **alto por H1** (destrucción de ítems ajenos).

**8.2 — Inyección de comandos (chat→shell).** Negativo verificado por grep: sin `child_process`/`exec`/`spawn`/`eval`/`new Function` en `server/` ni `public/`. Riesgo **sin riesgo**.

**8.3 — Path traversal jugadores/chunks.** No posible (nombres saneados, claves de chunk numéricas, `seedDir` sin `..`). Riesgo **sin riesgo** (ver 3.5).

**8.10 — Doble conexión con el mismo nombre.** Permitido por diseño (`net.js:385`): cada socket crea un `Player`; `restorePlayer` lee el guardado del nombre → dos jugadores sobre el mismo archivo. Riesgo **medio** (M3). Solución: rechazar nombre duplicado en línea (o k:ick al anterior).

**4.2/4.3 (referencia).** Caché de chunks en `Map` (`state.js:8`), `unloadFarChunks` cada 10 s (`save.js:304-349`) persistiendo antes de descartar; `renderDistance` clampeado 2-10 (`net.js:676-677`); llenado por lotes `CHUNK_FILL_PER_TICK=6`. Riesgo **sin riesgo**. REN-1 corregido (autosave async).

### Estado de hallazgos previos (seguridad)

- SEC-1/SEC-2 (crash y cooldown de `set_seed`), SV-1/SV-5/SV-6, REN-3 (radio fragmentado), CL-3 (try/catch completo), CSP/SRI (diferido, documentado): **corregidos o en estado documentado**.
- **SV-5 residual persiste** (ver §3 y §7): `addToInventory` sigue sin tope de stack (64) salvo el clamp de `/give`; el cliente muestra `item.count` crudo.

---

## 2. Resiliencia del servidor — hallazgos

> Informe del subagente `auditoria-servidor`.

| ID | Severidad | Archivo:línea | Descripción | Recomendación |
|---|---|---|---|---|
| F1 | 🟠 Medio | `server.js:113-116`; ausencia de `saveWorld` en actions/mining/inventory | Ventana de pérdida **≤30 s** ante `kill -9`: chunks (edits), meta (mobs/hornos/cofres/hora) y jugadores (inventario/XP/posición). Los chunks recién generados se **regeneran con `Math.random`** → el terreno difiere del visto. Mitigaciones parciales: `unloadFarChunks` persiste sucios cada 10 s y `.bak` del meta. SIGINT/SIGTERM → pérdida cero | Reducir `SAVE_INTERVAL_MS` a 10-15 s (la cola async hace el coste marginal pequeño) y/o `savePlayer` en eventos de inventario; documentar la ventana |
| F2 | 🟠 Medio | `save-chunks.js:51-54` | Error de escritura en la cola async → `dirtyChunks.delete(key)` **sin reintento**: el chunk con error se pierde silenciosamente (solo `log.error`) | Reintento con tope (2 intentos) o cola separada que se reintente en el próximo autosave (patrón a replicar: `save.js:334-341` conserva el chunk) |
| F3 | 🟡 Bajo | `world.js:129-182,139` | Sin checksum en archivos de chunk: corrupción parcial con JSON válido → `Uint8Array.from` coacciona a 0/AIR y el chunk se **persiste corrupto como aire** | CRC corto en el JSON de chunk + validación en `readChunkFile`; validar `0 ≤ v ≤ 255` |
| F4 | 🟡 Bajo | `save-players.js:59-72,85-88` | Jugadores sin `.bak`: `players/<nombre>.json` corrupto/borrado = jugador reinicia de cero (solo tmp+rename mitiga el torn-write) | Rotar `.bak` por jugador (o backup del dir `players/` junto al meta) |
| F5 | 🟡 Bajo | `server.js:118-130` | SIGINT/SIGTERM ignoran el retorno de `saveWorld()`: si falla, `exit(0)` reporta éxito | Comprobar retorno, `log.error` + `exit(1)` |
| F6 | 🟠 Medio | `log.js:16-28` | Logs planos (`console.*` con prefijo) sin timestamp/nivel configurable/correlación; sin rotación | JSON por línea `{ts, level, msg, ...meta}` + `LOG_LEVEL`; rotación externa (systemd/PM2/logrotate) |
| F7 | 🟡 Bajo | `net.js:1068` | `ws.on("error", () => {})` traga errores de socket en silencio | `log.warn` del error |
| F8 | 🟡 Bajo | grep `process.env` en `server/` (solo PORT/SEED/OPS/DAMAGE_DEBUG) | Sin env vars para simular fallos extremos ni ajustar intervalos de guardado/nivel de log | `SAVE_INTERVAL_MS`, `LOG_LEVEL`, hook `FAKE_IO_FAILURE` para tests de resiliencia |

### Detalle de los 5 puntos del encargo

**5.1 — Autosave + SIGINT/SIGTERM.** Implementado correctamente: autosave `setInterval(save.saveWorldAsync, 30000)` + `savePlayer` por jugador conectado (`server.js:113-116`); cola **asíncrona** por lotes de 6 con `setImmediate` (`save-chunks.js:31-91`); SIGINT (`server.js:118-122`) y SIGTERM (Fase 19.5 E1, `:126-130`) con guardado síncrono completo antes de `exit(0)`; escritura atómica tmp+rename (`world.js:99-103`). REN-1/SV-4 **corregido**.

**5.2 — Backup `.bak`.** `world.json` sí: `fs.copyFileSync(meta, meta+".bak")` previo en síncrono (`save.js:100-106`) y en la cola async (`save-chunks.js:63-69`); restauración automática si `world.json` ilegible (`save.js:148-157`). **Jugadores no** (F4). Riesgo **bajo-medio**.

**5.3 — Chunks corruptos.** `readChunkFile` (`world.js:129-182`) envuelve en try/catch → `null` con `log.warn`, valida `schemaVersion`, longitud exacta 16×128×16 (con migración v5→v6) y tipos; `loadChunkFromDisk` devuelve `null` → **regenera** y el siguiente guardado sobrescribe. Riesgo **bajo**, con la excepción de F3 (corrupción "válida" silenciosa).

**5.4 — Recuperación del cliente sin recargar.** **Ver §6 (CL-1)** — no existe; solo recarga manual.

**5.5 — Timeout de generación.** Ver §3 (P1/P2). No hay timeout por llamada; limitado por el coste unitario (~1-5 ms) y los topes de llenado, pero `settings` r=10 genera 441 chunks síncronos.

**5.6 — Persistencia de jugadores.** Guardado del último estado en 4 puntos: desconexión (`net.js:1046`), `leave_world` (`world-session.js:252`), autosave (`server.js:115`), SIGINT/SIGTERM (`server.js:120,128`); restauración en survival (`net.js:269`, reset en `:504`) con saneo de rangos (`save-players.js:78-133`). Creative no persiste (decisión documentada, `net.js:493-495`). Riesgo **bajo** (≤30 s de atraso, ver F1).

**7.1 / 7.4 — Logs y debug.** Logs planos con prefijo `[info]/[warn]/[error]` (F6). Env vars existentes: `PORT`, `SEED` (+`MENU_MODE`), `OPS`, `DAMAGE_DEBUG=1` (telemetría de daño en `combat.js:67`). Sin simuladores de fallo (F8).

**8.7 — Cierre inesperado (`kill -9`).** Guardado solo periódico + salidas limpias; **no hay guardado por operación crítica** (grep de `saveWorld(` confirma: autosave, switchWorld/releaseWorld, señales). Ventana nominal **≤30 s** (F1): se pierde lo ocurrido desde el último ciclo completado; los chunks regenerados difieren por `Math.random`; los jugadores pueden perder hasta el doble si coincide con un cambio de cofre reciente. Riesgo **medio**.

### Estado de hallazgos previos (resiliencia)

- SV-4/REN-1 (guardado síncrono cada 30 s) → **CORREGIDO** (cola async C1, `save-chunks.js`).
- REN-2 (hornos que nunca se eliminan y engordan `world.json`) → **PERSISTE** (agrava F1: ralentiza `buildMeta`/stringify del meta).
- SV-3/SEC-3 (coords sin `Number.isFinite`) → **PERSISTE** pero en el impacto "chunk NaN persistido" ya está cerrado por `validCoords` (§1, 2.5); solo el matiz F3/F1 queda acotado.
- REN-3 (stringify gigante de `chunks_add` al ampliar radio) → **CORREGIDO en congelación** (fragmentado), no en volumen (ver P3).

---

## 3. Rendimiento y escalabilidad — hallazgos

> Informe del subagente `rendimiento` (análisis estático; perfilado en vivo como acción sugerida).

| # | Archivo:línea | Descripción | Cuándo se nota | A verificar con perfilado | Severidad |
|---|---|---|---|---|---|
| P1 | `server/generation.js:127-144,606` + `net.js:686` | `settings` r=10 genera **441 chunks síncronos** en el event loop; `move` genera hasta 25 (`net.js:626`). Sin timeout por chunk | Al ampliar el radio (congela el tick cientos de ms a segundos; también afecta a HTTP) | sí (métrica `chunkGenMs` ya broadcast) | 🟠 medio |
| P2 | `world.js:99-123` + `save-chunks.js:26-58` | Autosave async por lotes de 6 (REN-1 corregido), pero cada lote bloquea ~12-50 ms del loop (gzip+write+rename) | Con cientos de chunks sucios (exploración, TNT) coincidiendo con el tick | sí | 🟠 medio |
| P3 | `net.js:84-100,686-696` + `public/world.js:59-67` | Reenvía **todo** el radio al ampliar/encoger `settings`: ~30-40 MB (441 chunks), fragmentado (REN-3 mitigado en congelación, no en volumen); el servidor no recuerda qué entregó a cada cliente | Ampliar/encoger radio repetidamente con r=10 | sí (banda + tiempo de parse cliente) | 🟠 medio |
| P4 | `generation.js:606` | Todo chunk generado se marca dirty → se re-escribe a disco sin cambios (I/O+gzip desperdiciado en cada exploración) | Sesiones de exploración largas; agrava P2 | sí (contar `dirtyChunks` tras exploración pura) | 🟠 medio |
| P5 | `net.js:589-643,102-108` | Broadcast `player_move` O(N) con 1 stringify por mensaje: OK a N=10 (tope 30 msg/s + `MAX_CONNECTIONS=10`), escala O(N²)/s si se quitan topes | >30 jugadores a 20 Hz (hoy inalcanzable) | sí (solo si se levanta el tope) | 🟡 bajo |
| P6 | `public/particles.js:65-95` | Mesh nuevo por partícula (no se reutiliza el objeto pese al comentario); geo/material compartidos → sin fuga real | Rotura/colocación sostenida | no | 🟡 bajo |
| P7 | `public/lighting.js` + `public/chunkstore.js:103-115` | `bakeChunkLight`/`hasTorchNear` O(`torchSet`) por bake — **REN-7 persiste**; la fuga de `torchSet` al descargar sí está corregida | Miles de antorchas + exploración | sí (profiler del navegador, 2000+ antorchas) | 🟠 medio (pendiente conocido) |

### Respuestas por pregunta del encargo

**4.1 — BD / persistencia en archivos.** No hay BD (decisión de diseño): JSON por chunk gzip (`world/<semilla>/chunks/<cx>_<cz>.json`) + `world.json` (`.bak`). Impacto: coste por chunk = stringify de 32768 números + `gzipSync` + `writeFileSync` + `renameSync`, síncronos. El autosave ya es asíncrono por lotes; `saveWorld` síncrono queda solo en switchWorld, señales, releaseWorld y nchunks sucios a descargar. Riesgo **medio** (ver P1/P2).

**4.2 — Caché de chunks.** `state.chunks` = `Map<"cx,cz", Uint8Array>` (`state.js:8`). Escritura en 3 momentos: autosave 30 s (solo dirty), `unloadFarChunks` 10 s (persiste sucios al soltar), `saveWorld` síncrono. `markChunkDirty` se dispara en todo `setBlock` y **en toda generación** (P4).

**4.3 — `renderDistance` y descarga.** Acotado 2..10 ambos lados (`net.js:677`; cliente `world.js:59-60`); `unloadFarChunks` cada 10 s descarga a >10 chunks de todo jugador (`UNLOAD_INTERVAL_MS`/`UNLOAD_DISTANCE_CHUNKS`, `save.js:307-322`); el cliente descarga al reducir radio. Memoria servidor ≈ 441 chunks/jugador. Riesgo **bajo**.

**4.4 — Orden de mensajes / concurrencia.** Servidor síncrono: mensajes WS en orden de llegada en `switch` (`net.js:536-558`), tick `setInterval(mainLoop, 50)` con try/catch (`timers.js:365-371`). Sin desorden ni desync posible. Riesgo **bajo**; el punto débil es que todo trabajo pesado (generación, guardado) vive en el mismo hilo y bloquea globalmente (P1/P2).

**4.5 — Priorización de mensajes.** No hay (todo al mismo switch/bucle); irrelevante a la escala actual (300 msg/s teóricos máx. con topes). Si se quitan los topes, priorizar `move` sobre `chat`. Riesgo **sin riesgo**.

**4.6 — WebGL2 y partículas.** Three.js 0.160 (WebGL2 cuando el navegador lo ofrece; sin `powerPreference` explícito). Partículas: geometría y materiales compartidos (pool por color), bucle RAF que se auto-detiene al vaciarse, ráfagas 10/4 con TTL 0.55-0.9 s — pero `spawnCube` crea un `Mesh` nuevo por partícula y solo `scene.remove`+`splice` al morir (P6). Sin fuga relevante de VRAM. Riesgo **bajo**.

**4.7 — Map/Set vs objetos dinámicos.** Correcto en los puntos calientes del servidor (`state.js:8-42`: chunks, players, furnaces, watchers, crops, doors como Map; `dirtyChunks` Set) y cliente (`chunkstore.js:16`, meshbuild `workerPending`). El único O(n²) es `creativeCatalog` con `indexOf` dedupe, una vez por init (despreciable). Riesgo **sin riesgo**.

**5.5 — Timeout de generación / DoS.** No hay timeout ni tope por invocación. Coste por chunk: ~256 columnas con ruido 2D multi-octava + ruido 3D de cuevas por celda + minerales + árboles; instrumentado con `performance.now` → `__mcChunkGenMs` (broadcast ~1 s, `timers.js:297-308`). Límites de abuso: llenado 6 chunks/tick (`timers.js:327`), `move` ≤25 chunks solo al cruzar borde (`net.js:626-637`), `settings` r=10 = **441 síncronos**, `/tp` 9 (solo OP); `set_seed`/`join_world` con cooldown 10 s y único jugador (`world-session.js:19-30,110-124`) → SEC-2 mitigado. Riesgo **medio** (P1).

**7.2 — Métricas monitorizables.** Sí: `server_metrics` con `tickMs` y `chunkGenMs` (media móvil 1 s, `timers.js:141-148,293-308`); cliente → `window.__mcServerTickMs/__mcChunkGenMs` (`network.js:241-245`); F3 muestra FPS, frame, culling, chunks visibles/total, caras, pool, tick servidor, gen chunk (`debug.js:113-141`); `getServerMetrics()` expuesto a tests. Riesgo **sin riesgo**.

**7.6 — File descriptors.** No hay `ulimit`/manejo de `EMFILE`/`EAGAIN`. Sockets acotados (10) y archivos abriéndose/cerrándose por escritura → riesgo bajo hoy; **medio en producción** (mundo grande + disco lento). Propuesta: documentar `ulimit -n` y capturar `EMFILE` en `writeChunkFile` con reintento/backoff.

**8.4 — Coste de `move` y límite práctico.** Validación anti-cheat O(1) (`anticheat.js:32-80`), ventana de `speedSamples` cap 100, broadcast O(N-1) con **un solo** stringify reutilizado (`net.js:102-108`). Con N=10 a 20 Hz (throttle cliente `player.js:380-390`): ~1 800 sends/s, trivial para Node. Tope real: `MAX_CONNECTIONS=10`. A 50 jugadores el broadcast O(N²) y el stringify único empiezan a notarse (P5). Riesgo **sin riesgo** con topes actuales.

**8.6 — Fugas de memoria del servidor.** Revisado punto a punto: chunks (unloadFarChunks), hornos (poda `crafting.js:309` + watchers limpiados en desconexión `net.js:1047-1056`), jugadores (delete en `close`), mobs (despawn 128 + tope 30), flechas (`tickArrows` limpia), cooldowns de templo, `damageLog` anillo fijo, intervals todos globales (heartbeat `unref`ado), listener de ws vive/muere con el socket. Riesgo **bajo**; único residuo: `dirtyChunks` puede crecer hasta el siguiente autosave (acotado).

**8.9 — Bloqueo del event loop vs Express.** Express sirve estáticos en el mismo proceso (`net.js:191-192`), sin workers/cluster. Todo lo que bloquea el loop (P1 generación de 441 chunks, P2 lotes de guardado, `saveWorld` síncrono) retrasa también HTTP y el tick de todos. Riesgo **medio**/residual.

### Coste de red (4.4b/8.4b)

- Chunk individual (`chunks_add`): `Array.from` de 32768 números ≈ **60-90 KB**.
- `init` (radio 2): ≤25 chunks ≈ 1,5-2 MB + mobs/inventario.
- Relleno de radio: 6 chunks/mensaje ≈ 400-500 KB por `chunks_add` (~300-500 KB/s en ráfagas).
- `settings` r=10: **30-40 MB** en ~74 mensajes fragmentados (REN-3 mitigado en congelación, no en volumen → P3).
- `mobs_update`: snapshot completo solo si cambia ≈ 3-4 KB a 1-20 Hz (correcto).
- `furnace_state`: solo a watchers, 20 Hz por horno abierto.

### Cliente (greedy/worker/meshes)

Correcto: malla en worker (`chunkWorker.js:36` → `buildChunkGeometryData` greedy de `chunkGeometry.js:164`), hilo principal solo aplica buffers con swap limpio y watchdog auto-curador (`world.js:110-165`), rebuilds solo vecindario ±1 (`rebuildAffectedChunks`), LOD con histéresis y throttle ~4/s, pool de geometrías real (`geopool.js`), frustum culling con esferas reutilizadas (terreno), meshes de mobs 1 grupo por mob reutilizado por id. Riesgo **bajo**. Pendiente conocido: P7 (`bakeChunkLight` O(torchSet)).

---

## 4. Resiliencia y UX del cliente — hallazgos

> Informe del subagente `auditoria-cliente`.

| # | Issue | Archivo:línea | Riesgo | Recomendación |
|---|---|---|---|---|
| CL-1 | Sin reconexión automática ni backoff: `close` → pantalla de error → `location.reload()` manual | `connection.js:43-45,58-60`; `loading.js:138` | **Medio** | Fábrica `connect()` + backoff exponencial (1 s·2ⁿ, techo ~30 s) mientras la pestaña esté visible; reload como fallback tras N intentos; al reconectar, reset local (unload chunks, `doorStates.clear()`, limpiar meshes) antes del `init` idempotente |
| CL-2 | Render/audio siguen activos en segundo plano (blur y pestaña oculta): `animate()` incondicional | `player.js:227-228,439`; `audio.js` (sin `suspend`); `panels.js:145` (`setInterval` 400 ms), `debug.js:156` | **Medio** | Flag `paused = document.hidden || !document.hasFocus()`: saltar `renderer.render` y trabajo pesado, cap de FPS (dt ≥ 1/20) en blur, `ctx.suspend()`/`resume()` en audio, intervals bajo demanda. `reduceMotion` NO cubre esto (solo FOV sprint, `player.js:305`) |
| CL-3 | `init` descartado entero si falta un campo (p. ej. `data.otherPlayers` → TypeError → catch) → carga colgada ~45 s | `network.js:108-137` (`:128`); `loading.js:100-102` | **Bajo-Medio** | Defaults por campo (`data.otherPlayers || []`, etc.) para no abortar el init |
| CL-4 | `setClientBlock` crea chunks fantasma con coords null/NaN (los guards de rango fallan con NaN) | `chunkstore.js:52-71` | **Bajo** (requiere servidor corrupto) | `Number.isFinite` en x/y/z antes de escribir |
| CL-5 | `storeChunkData` sin validar longitud (debe ser 16384): chunk corto → bloques `undefined` (paredes invisibles / UV NaN) | `chunkstore.js:76-94` | **Bajo** | Validar `arr.length === 16384` y rechazar |
| CL-6 | Sin telemetría de errores del cliente (`window.onerror`/`unhandledrejection` ausentes); una excepción en `animate()` congela la pantalla sin aviso | grep sin resultados | **Bajo** | Cola local `window.__mcClientErrors` visible en F3; envío opcional `client_report` con rate-limit y sin datos sensibles |
| CL-7 | Contador de stack sin clamp: la UI pinta `item.count` crudo (hasta >64 que pueda mandar el servidor) | `hud.js:106`; `panels.js:112,170,239,255` | **Bajo** (origen servidor: SV-5) | El servidor debe clamar a 64; cliente correcto al no sobrescribir |
| CL-8 | Partículas: `new THREE.Mesh` por cubito sin pool de meshes ni tope global de vivas | `particles.js:66` | **Bajo** | Pool LRU de meshes + tope duro (~200) |

### Respuestas por pregunta del encargo

**1.4 / 5.4 — Reconexión.** Confirmado: el socket se crea **una vez** como const de módulo (`connection.js:43-45`); el único camino ante `close` es la pantalla de error con botón manual `location.reload()` (`loading.js:126-138`); `hangTimer` de 45 s dispara lo mismo si el init no llega. No hay handler `error` (el `close` lo cubre). El servidor ya reenvía el estado completo en `init` (idempotente y completo, `network.js:108-137`); solo falta un `connect()` reutilizable + reset local antes del re-init. Riesgo **medio** (en LAN bajo; en WiFi/WAN cada caída = recarga completa + re-descarga del mundo). El cierre del chat con Escape se ignora mientras se teclea (`menu-input.js:17`).

**6.1 — Límite de líneas de chat.** Implementado: máx. 8 líneas + auto-eliminación a los 12 s por línea (`hud.js:303-309`); `flashMessage` reutiliza el mismo log (`hud.js:310-312`). Riesgo **sin riesgo**; detalle menor: un chat activo expulsa rápido los mensajes de sistema (canal dedicado opcional).

**6.2 — Desbloqueo del puntero.** Correcto en todos los flujos: abrir panel → `showBlocker(false)`+`controls.unlock()` (`panels.js:138-139,216-217,298-299,342-343`); cerrar → `controls.lock()` (`panels.js:369-383`, `hud.js:321-326`, menú pausa `menus.js:113-121`); el re-lock ocurre dentro de un gesto de usuario (requisito del navegador); orquestación en `scene.js:95-114`. Sin camino que deje el puntero bloqueado con UI encima. Riesgo **sin riesgo**.

**6.3 — Pérdida de foco / pestaña en segundo plano.** No se pausa nada explícitamente (CL-2): `requestAnimationFrame` incondicional (`player.js:227-228`). En pestaña oculta el navegador auto-pausa el rAF, pero en blur (visible sin foco) el bucle corre a FPS completo consumiendo GPU/CPU, y el **audio nunca se pausa** (`audio.js` solo `resume()` en gesto de usuario). `reduceMotion` (B4, F19.5) no cubre esto. Riesgo **medio**.

**6.4 — Notificaciones.** Existe: muerte (`player_die` → `flashMessage` + `showDeathScreen` con causa traducible, `hud.js:348-354`), nivel (`level_up` → `flashMessage`), y sistema (tool_broke, tame_ok, eat_rejected, sleep_ok/rejected, world_clone_result, textures_reload). Riesgo **sin riesgo**; nota de UX: comparten el tope del chat (ver 6.1).

**6.5 — Contador de stack.** El cliente **no recalcula**: muestra `item.count` crudo tal cual (`hud.js:106`, `panels.js:112,170,239,255`); drag & drop mueve slots enteros sin split/merge (partición 100% servidor). Depende por completo del servidor (SV-5). Riesgo **bajo**. Menor: MC oculta el contador con count=1, aquí siempre se muestra.

**7.3 — Telemetría cliente.** No hay (CL-6). Las métricas de rendimiento se publican en `window.__mc*` (sentido servidor→cliente); no hay `window.onerror` ni envío a red. Riesgo **bajo**.

**8.8 — Robustez ante chunks/payloads corruptos.** Todo el dispatch está dentro de un `try/catch` completo (CL-3 corregido, `network.js:97-106,407-409`); eventos desconocidos → `default` con `console.warn`; chunk de longitud inválida o datos no iterables → degrade a artefactos visuales (nunca crash; worker + watchdog auto-curan); `Uint8Array.from` clampa a [0..255]. Quedan: CL-4 (chunk fantasma con coords NaN) y CL-5 (sin validación de longitud). Riesgo **bajo** (ambos requieren servidor corrupto).

**4.6b/P6 — Partículas (confirmación).** Pool de geometría y materiales por color compartidos, sin `dispose()` (correcto); mesh nuevo por cubito; límites de ráfaga (10/4) y TTL 0.55-0.9 s; sin tope global (un flood de `block_update` puede superarlo temporalmente); el bucle se auto-detiene al vaciarse. Riesgo **bajo**.

### Estado de hallazgos previos (cliente)

- CL-3 (`JSON.parse` sin try/catch) → **CORREGIDO completamente**: `network.js:97-106` envuelve parse + validación + todo el switch; eventos desconocidos → `default` con warn.
- CL-2 (mascotas `sitting`/`state`) → **CORREGIDO**: `mobs.js:380-412` lee `sitting`, `resetMobWalk`, pose agazapada `sitY=0.72` (Fase 19.5).
- H3 (`tame_ok` sin case en el cliente) → **CORREGIDO** (`network.js:263-274`).
- Sin sinks XSS alcanzables (§1, 2.6/8.5).

**Preguntas abiertas:** (1) en una reconexión sin recargar, el `init` sitúa la cámara en `spawnX/Y/Z` (`network.js:112`) — hay que confirmar que el servidor reenvía la posición vía `teleport` o el jugador reaparece en el spawn; (2) el cierre del chat exige Enter (Escape se ignora) — decisión de diseño que difiere de MC.

---

## 5. Tabla-resumen priorizada y hoja de ruta

| Frente | Prioridad | Acciones | Items |
|---|---|---|---|
| **Seguridad crítica** | Acción inmediata | Validar `Number.isInteger` + rango en `chest_action` (`take`/`put`) y `grid_set` con test de claves no enteras; verificar en el navegador la troncal del cofre | H1, B1 |
| **Seguridad** | Alta | `verifyClient` con allowlist de orígenes (CSWSH); tope de cría en `applyFeed`; rechazar nombre duplicado en línea; OP por `OPS`/token explícito (nunca "primero conectado"); logs de comandos OP; documentar TLS en despliegues no-locales | M1-M5, B3 |
| **Resiliencia** | Fase 19.5/19.6 | `SAVE_INTERVAL_MS` 10-15 s + save de jugador en eventos críticos; reintento de escritura en la cola async; checksum de chunks; `.bak` de jugadores; retorno de `saveWorld` en señales; env vars de control | F1-F5, F8, REN-2 |
| **Rendimiento** | Fase 20 (rolling release) | Lotear la generación del `settings` (r=10) y mover gzip a worker si el perfilado lo pide; reenviar solo la corona nueva de chunks; no marcar dirty los generados; evaluar `bakeChunkLight` con profiler | P1-P4, P7 |
| **Cliente** | Mejora continua | Reconexión con backoff + reinit; pausa de render/audio en background; defensas de chunkstore (longitud, `Number.isFinite`); tope de partículas | CL-1..CL-5, CL-8 |
| **Monitorización** | A valorar | Logs JSON + `LOG_LEVEL`; telemetría cliente (cola `__mcClientErrors` + envío opcional) | F6, CL-6, F7 |
| **Documentado como No implementado (sin riesgo actual)** | — | Autenticación/TLS (no aplica en LAN; documentado); BD (persistencia en archivos acotada); priorización de mensajes (innecesario con topes); file descriptors (riesgo solo en producción) | §1 3.1/3.2, §3 4.1/4.5/7.6 |

### Falsos positivos / verificados sin riesgo

1.3 (maxPayload), 1.5 (atribución por socket), 2.3 (inventario autoritativo), 2.5 (coords finitas), 2.6/8.5 (XSS), 3.4 (static no expone `world/`), 3.5 (path traversal), 4.2/4.3 (caché acotada), 4.4 (orden síncrono), 4.7 (Map/Set), 5.3 (chunk corrupto regenerado), 8.2 (sin shell/eval), 8.3 (traversal), 6.1/6.2/6.4 (chat/pointer/notificaciones).

### Acciones de perfilado en vivo (preparadas para decidir severidad real de P1/P2/P3/P4/P7)

1. `node --prof` + `server_metrics`: sesión que ensucie 300+ chunks y correlacionar `tickMs` con los picos del autosave por lotes.
2. `__mcChunkGenMs`: coste unitario de `generateChunk`; extrapolar el peor caso `settings` r=10 (441 chunks).
3. Cliente real: cronometrar parse+horneado del reenvío de radio fragmentado y el coste de `sendChunksFragmented`.
4. Contar `dirtyChunks` tras una exploración pura para cuantificar P4.
5. Profiler de navegador con 2000+ antorchas para confirmar la severidad de P7.

---

## 6. Cierre de la auditoría (2026-08-16)

> Correcciones implementadas junto al cierre de la Fase 19.6 (mismo commit
> que la spec `fase19.6-spec.md` §10). El tracker operativo con estado por
> hallazgo vive en `TODO.md` § "Auditoría 2026-08-15 — correcciones
> programadas".

### Corregido y verificado en el cierre

| ID | Corrección | Verificación |
|---|---|---|
| **H1** | `chest_action take/put` + `grid_set` con `Number.isInteger` + rango (`server/actions.js`) | `tests/unit-cofre.js` (claves no enteras) |
| **B1** | `grid_set` con `Number.isInteger` + rango en `fromInventorySlot` | ídem (`unit-cofre.js`) |
| **M1** | `verifyClient` con allowlist de orígenes en el `WebSocketServer` (`server/timers.js`) | lectura + arranque limpio |
| **M2** | tope de cría a la cuota global en `applyFeed` (`server/mob-species.js`) | `tests/unit-cria.js` ampliado |
| **M3** | rechazar nombre duplicado en línea (conexión y `set_name`) (`server/net.js`) | `tests/unit-red.js` ampliado |
| **M4** | OP por `OPS` explícito; fallback "primero conectado" solo sin lista (`server/net.js`) | `unit-fase17.js` ampliado |
| **B2** | rate-limit POR ACCIÓN `MAX_ACTION_RATE` (20/s) separado del global (`server/net.js`) | el E2E de mascotas se espació para respetarlo; sesión real no lo alcanza |
| **B3** | log de comandos OP (`server/commands.js`) | lectura + logs `[info]` en arranque |
| **F1** | `SAVE_INTERVAL_MS` 10-15 s por env + guardado en eventos (`server/server.js`) | lectura |
| **F2** | reintento (2) en la cola async (`server/save-chunks.js`) | `tests/unit-persistencia.js` |
| **F3** | checksum/validación de chunk en `readChunkFile` (`server/world.js`) | `unit-persistencia.js` ampliado |
| **F4** | rotación `.bak` por jugador (`server/save-players.js`) | lectura |
| **F5** | retorno de `saveWorld()` en SIGINT/SIGTERM (`server/server.js`) | SIGTERM añadido en F19.5 E1 |
| **F7** | `log.warn` del error de socket (`server/net.js`) | logs uniformes (`server/log.js`) |
| **F8** | env vars `SAVE_INTERVAL_MS`/`LOG_LEVEL` | `server/log.js` |
| **CL-1** | reconexión con backoff + reinit (`public/connection.js`) | lectura + sesión estable en E2E |
| **CL-2** | pausa de render/audio en background | `audio.js` (F19.5); render en `player.js` (cierre F19.6) |
| **CL-4/CL-5** | `Number.isFinite` en `setClientBlock` + validación de longitud en `storeChunkData` (`public/chunkstore.js`) | `unit-fase19.6.js`/lectura |
| **CL-8** | pool + tope duro `MAX_ALIVE` (200) de partículas (`public/particles.js`) | lectura + suite |

### Diferido a la Fase 20 (backlog de rendimiento, sin tocar)

- **P1** (lotear generación del `settings` r=10), **P2** (gzip en worker),
  **P3** (reenviar solo la corona nueva), **P4** (no marcar dirty los
  generados; depende de generación determinista), **P7** (perfilar
  `bakeChunkLight` con 2000+ antorchas) y **Monitorización CL-6**
  (telemetría cliente `__mcClientErrors`): priorizados en
  `docs/spec/fase20-spec.md`, no implementados en este cierre.

### Hallazgo nuevo del cierre (anticheat)

- **Flotando falso positivo en el anti-cheat** (cazado por `unit-caida` bajo
  carga): el dt entre `move` medía el tiempo real transcurrido, así que un
  hueco >1 s entre paquetes (lag o pausa del hilo por generación de chunks)
  inflaba `airTimeMs` y el check `flotando` (aire >1 s con <2 bloques de
  descenso) rechazaba caídas legítimas — el jugador rebotaba sin poder
  caer. Corregido en `server/anticheat.js`: el **air-time** se acota a
  250 ms por paquete (`airDtSec`), el dt de velocidad sigue real. Ver spec
  F19.6 §10 B3.

### Estado de la verificación (2026-08-16)

- Suite **59/59 unitarios**, **E2E 7/7** (mundo desechable limpio; `e2e-menu`
  con su puerto 3997 libre), **biome 0 errores**, `node --check` limpio.
- Auditorías `--audit`: **4/6 verdes** (fase4/5/6 + altura). **`audit-fase3`
  y `audit-fase7` fallan por causa ambiental** (CPU a carga 15-19 externa +
  render CDP en SwiftShader): fallan IDÉNTICAMENTE en `HEAD` sin los
  cambios de la F19.6 (comparado con worktree, `f7d596d`), por lo que no
  son regresión de este cierre; el `audit-fase7` ya estaba documentado
  como ROJO ambiental en esta misma auditoría (§ Línea base).