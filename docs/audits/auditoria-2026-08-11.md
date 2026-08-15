# Auditoría completa 2026-08-11 — Mi Minecraft

> **Fecha:** 2026-08-11 · **Commit auditado:** `810e381` (HEAD en el momento de consolidar) — el árbol fue un **blanco móvil** durante toda la auditoría: la Fase 16 y la Fase 17 se implementaban y commiteaban en vivo (secuencia vista: `d8a8f8d` → `88a3d62` → `ed5ccb2` → `70008b6` → `7e95943` → `810e381`). Los informes de los subagentes reflejan versiones intermedias del working tree; donde se pudo, se re-verificó contra el HEAD. · **Alcance:** completo (línea base + cliente + servidor + seguridad + rendimiento + paridad), con foco en el estado de la **Fase 16** y errores introducidos.
> **Método:** línea base (sintaxis, linter, unitarios, E2E, auditorías por fase, arranque) + cinco pases especializados en secuencia + un reintento enfocado de servidor (bloques B3/SV-2/unit-red). Los hallazgos previos de `docs/audits/auditoria-2026-08-10.md` se etiquetan como persiste/corregido/parcial.

## Línea base

- **Sintaxis** (`node --check` sobre server/, public/, tests/ y raíz): **TODO VERDE** (0 rotos). Nota: se ejecutó antes de un cambio del agente de F17 en `world.js`/`constants.js`; re-verificado parcialmente después.
- **Linter** (Biome): **ROJO por formato/estilo** — 87 errores (76 de formato + 11 reales: 1 `noDuplicateObjectKeys` en `server/constants.js:1160`, 2 `noUnusedVariables` en `commands.js:19`/`mobs.js:18`, `organizeImports` en 4 archivos, `noAssignInExpressions` en tests), 220 warnings, 22 infos. Ninguno bloquea el arranque.
- **Unitarios** (`node tests/run.js --unit`): **50/51 en la primera pasada** — rojo `unit-red.js` (9 checks). **RE-VERIFICADO en el reintento de servidor (árbol posterior): `node tests/unit-red.js` aislado → exit 0, 0 fallidos.** Los 9 checks fallaban por código intermedio ya corregido en commits posteriores (ver §2, "unit-red").
- **E2E** (servidor vivo en :3998): **5/6** — `e2e-durabilidad` TIMEOUT 180 s en fase "breaking" (no crash: el servidor siguió vivo); `e2e-mascotas`, `e2e-comer`, `e2e-reload`, `e2e-cofre`, `e2e-templo` PASS. **Hallazgo del reintento de servidor:** el modo menú de la Fase 17 (A1) hace que `node server.js` **sin `SEED`** nunca envíe `init` → los E2E que se arrancan según `AGENTS.md` (`PORT=3998 node server.js`, sin SEED) quedarían colgados esperando `init`. Causa raíz más parsimoniosa de la triada E2E roja de la auditoría previa.
- **Auditorías por fase** (`node tests/run.js --audit`): **YA NO lanza el `ReferenceError: AUDIT`** (G0.2 corregido). Resultado 2/6 verdes en la pasada de línea base: `fase5` ✅ y `audit-altura` ✅ (72/72, 52.9 s); `fase3` ❌ (2: perf lineal/nocturna), `fase4` ❌ (2: generación con cuevas <12 ms/chunk, ratio caras/bloques), `fase6` ❌ (1: LOD <30 MB), `fase7` ❌ (8: CDP render por software). Nota: auditorías con presupuestos descalibrados por el mundo v6 (conocido desde la 2026-08-10) o por render SwiftShader.
- **Arranque:** HTTP 200 en `/` (verificado en :3998 y :3999; tarda ~8-10 s). El agente de F17 provocó un crash transitorio de arranque (`seededNoise` con `SEED=null`) que corrigió él mismo 1-2 min después.
- **Reproducción del crash de `set_seed`:** no completada por límite de pasos, pero confirmado por análisis de código (ver §2, F16-01).

## Resumen ejecutivo

La Fase 16 está **implementada en gran parte pero NO cerrada**: los bloques C2, C3 (parcial), C6-SV2, D1-D6, B1, B4, B6, E1, G0.2 y G1-G3 (parcial) están hechos y verificados en el código, y los 9 fallos de `unit-red.js` de la primera pasada ya pasan en el HEAD. Sin embargo queda **un crash crítico sin corregir que coincide exactamente con el reporte del usuario** ("al crear una semilla nueva el servidor se detiene"): el fill del `mainLoop` hace `Array.from(state.chunks.get(key))` sin guard y `generateChunk` no cachea los chunks fuera de bordes → `TypeError: undefined is not iterable` → el proceso muere (F16-01, confirmado por servidor + seguridad + rendimiento, y **re-verificado presente en el HEAD `810e381`**). Es además un vector de **DoS sin autenticación** (caminar al borde del mundo o ampliar el radio en un mundo pequeño basta). La **causa raíz transversal**: el mismo patrón `Array.from` sin guard se arregló en `ensureChunksAround` pero **no en el camino del mainLoop ni en el de `settings` (REN-3)**, que es justo el que recorre todo jugador al conectar/crear mundo. Segundo hallazgo transversal: el **modo menú de la Fase 17 (A1)** rompe el flujo E2E documentado en `AGENTS.md` (servidor sin `SEED` nunca envía `init`). Tercero: **C4 no está cerrado** (la generación sigue marcando dirty) y **C6-REN3 (settings fragmentado) no se tocó**.

---

## 1. Errores de implementación — Cliente

> Informe del subagente `auditoria-cliente` (parcial por límite de pasos; cubrió áreas de alto/medio riesgo; quedaron pendientes de pasada fina `chunkGeometry.js`/`chunkWorker.js`/`clouds.js`/`sky.js`/`audio.js`).

### Resumen

El cliente de `public/` está en buen estado general: el commit `88a3d62` ("Fase 16: WIP") ya contiene la práctica totalidad del trabajo cliente de Fase 16 (B1 waterfog, B4 tooltip/durabilidad, B5 libro, B6 renderScale, E1 fullscreen, CL-1, CL-3 parcial) y `public/` está **limpio en el working tree** (los cambios sin commitear son solo de `server/`). No hay trozos de Fase 17 en `public/` todavía ([F17-EN-CURSO] en otro agente). De los hallazgos previos: **CL-1 corregido**, **CL-3 corregido solo en parte**, **CL-2 persiste íntegro**. No se encontraron fugas de memoria ni bugs de render nuevos en world/particles/loading/debug; las constantes compartidas están sincronizadas.

### Tabla de hallazgos

| ID | Severidad | Archivo:línea | Descripción | Etiqueta | Bloque F16 |
|---|---|---|---|---|---|
| H1 | 🟠 | `public/mobs.js:270-356` | Desync de mascotas: el cliente sigue sin leer `sitting`/`state` del snapshot; la mascota sentada se renderiza de pie y, con micro-jitter del servidor, hasta camina (`setMobWalk`). `tame_ok` tampoco tiene `case`. | [PERSISTE] | — (Fase 12) |
| H2 | 🟡 | `public/network.js:85-93` | CL-3 corregido **solo en parte**: el try/catch cubre únicamente `JSON.parse`. El destructuring `const { event, data } = parsed` y todo el `switch` quedan fuera; un mensaje JSON válido pero no-objeto (`null`, `42`, `"texto"`) lanza `TypeError` no capturado en el listener, y un evento con `data` ausente (`mobs_update`, etc.) revienta su `case`. | [CORREGIDO/PARCIAL] | CL-3 |
| H3 | 🟢 | `server/net.js:1572` → `public/network.js:327-332` | El servidor sigue emitiendo `tame_ok` y el cliente no lo maneja: ahora cae en el `default` con `console.warn` (ya no es silencioso), pero no hay feedback visual/sonoro de doma exitosa salvo el collar que llega por `ownerId`. | [NUEVO] | — |
| H4 | 🟢 | `public/input.js:681-684,188` | Cofres con Shift (B2): el flujo cliente es correcto (agachado → `startMiningAt` permite romper; sin agachado → `chest_open`), pero el estado de agachado **no viaja en ningún mensaje WS**: depende de que el servidor trate `block_action break` sobre un cofre como romper sin saber que el jugador está agachado. Funciona con el servidor actual, pero es un acoplamiento implícito cliente↔servidor. | [NUEVO] (bajo, aclaración) | B2 |

### Detalle

**H1 — [PERSISTE] CL-2: desync de mascotas sentadas** — `public/mobs.js:270-356` (`updateMobs`) lee `m.id`, `m.type`, `m.color`, `m.x/y/z`, `m.slimeSize`, `m.isBaby`, `m.ownerId`, `m.burning`, `m.fuse`… y **ni una referencia a `sitting` ni `state`** (grep verificado en todo `public/`). El servidor sí los manda en cada snapshot: `server/mobs.js:1579` (`state: m.state`) y `:1589` (`sitting: !!m.sitting`). Tras `sit_pet` (enviado por `input.js:570`), el lobo/gato sigue de pie; si el servidor manda jitter de posición, `setMobWalk` (`mobs.js:289-293`) activa la animación de caminar de una mascota "sentada". Es exactamente el hallazgo CL-2 de la 2026-08-10 — **persiste sin cambios**.

**H2 — [CORREGIDO/PARCIAL] CL-3** — `public/network.js:82-92`: el parse ya está en try/catch con `return` y `console.warn` — bien. Pero `:93` `const { event, data } = parsed;` y `:94` el `switch` están **fuera** del try. `JSON.parse("null")` → `null` → destructuring de `null` lanza `TypeError` dentro del listener sin capturar. El `default` (`:327-332`) sí existe y loguea eventos desconocidos — esa mitad está correcta.

**H3 — [NUEVO] `tame_ok` sin case** — `server/net.js:1572` hace `broadcast("tame_ok", { id, type })` tras una doma exitosa. El switch de `network.js` no tiene `case "tame_ok"`: cae en el `default` (`:332`) y se descarta. El usuario no recibe feedback de la doma (solo el collar rojo que aparece cuando llega el `ownerId` posterior).

**H4 — [NUEVO, aclaración] B2 cofres con Shift** — El flujo cliente es correcto y coincide con la intención de B2: `input.js:681` (agachado → no abrir) y `:188` (`chestRefused = target === 22 && !move.sneak`). El estado de agachado es solo local (`player.js:64`); nunca se envía al servidor. No es un bug activo; acoplamiento implícito a vigilar con el anti-cheat C3.

### Verificación de hallazgos previos

| Hallazgo previo | Estado actual | Evidencia |
|---|---|---|
| **CL-1** (barra de durabilidad fantasma) | ✅ **CORREGIDO** | `ui.js:113-122`: nueva `maxDurability(item)` — `DURABILITY[id] || ARMOR_DURABILITY[id] || (id === BOW ? BOW_DURABILITY : 0)`. Ítems sin durabilidad → `maxD = 0` → sin barra ni `cur/maxD` en el tooltip. El fallback global desapareció. |
| **CL-2** (ignora `sitting`/`state`) | ❌ **PERSISTE** | `public/mobs.js:270-356` — sin lectura de `sitting`/`state` (grep exhaustivo). El servidor sigue enviándolos. |
| **CL-3** (JSON.parse sin try/catch) | 🟡 **PARCIAL** | El parse está en try/catch y hay `default`, pero el destructuring y el dispatch del switch quedan fuera del try. |

### Áreas revisadas sin problemas

- **B1 niebla submarina**: `public/waterfog.js` existe y es lógica pura testeable; `shouldUnderwaterFog` exige `inWater` **y** `waterSurfaceDepth >= 2`; `waterSurfaceDepth` sube desde el techo del bloque de los ojos hasta el primer aire. Se aplica en `player.js:255-261` pasando `camera.position.y` (ojos). Cumple B1.
- **B6 calidad gráfica**: `quality.js:19-37` con `renderScale` 0.6/0.85/1; `scene.js:27-37` `applyQuality` hace `renderer.setPixelRatio(qualityPixelRatio(name, dpr))` + sombras/shadowSize; se aplica en caliente vía `settings.js:108-110` y al arranque. El bug antiguo (dpr=1 anulaba el efecto) está corregido.
- **B4/B5**: `itemicons.js` se usa en `itemVisual` (`ui.js:81-86`); el libro de recetas abre con B/cierra con B y Esc (`input.js:100-106`, `ui.js:723-738`, `closePanels:1145-1158`) con captura previa de `opening` y puntero liberado.
- **E1 fullscreen**: `settings.js:123-157` + `input.js:112-117` (F11); preferencia sincronizada con `fullscreenchange`.
- **Constantes sincronizadas**: `EYE_HEIGHT` 1.6, `DAY_CYCLE_MS` 1200000, `JUMP_SPEED`/`GRAVITY`, `WORLD_HEIGHT` 128/`WORLD_MIN_Y` −64/`WORLD_MAX_Y` 63, `MOON_DAYS` 8, durabilidades, `ARMOR_DURABILITY`, `BOW_DURABILITY` 384, e ítems `ROTTEN_FLESH` 255 / `GUNPOWDER` 256 en ambos lados. **Sin desajustes.**
- **Fugas de memoria**: `removeChunkMesh` libera al pool/dispose; `unloadChunks` limpia `torchSet` y grietas; `onWorkerMessage` swap limpio; `disposeMesh` de mobs/jugadores remotos; partículas y loading limpian intervalos/RAF; debug gateado. Sin fugas detectadas.

---

## 2. Errores de implementación — Servidor

> Informe del subagente `auditoria-servidor` (parcial por límite de pasos en su primer pase: cubrió crash/C1/C2/C3/C4) + **reintento enfocado** (B3/SV-2/unit-red) que sí completó sus 3 áreas.

### Resumen (primer pase)

El servidor tiene un **crash determinista y crítico en el mainLoop** (net.js:1903 en esa versión; **net.js:2025 en el HEAD**) que mata el proceso con `TypeError: undefined is not iterable` al rellenar chunks del radio de render con claves fuera de los bordes del mundo — mecanismo confirmado en código y compatible con el crash reportado por el usuario al crear una semilla nueva. El guardado asíncrono (C1) está implementado en el autosave (`saveWorldAsync`), pero `switchWorld`/`releaseWorld` siguen usando el `saveWorld()` síncrono. La validación de coordenadas (C2) está correctamente aplicada en los 9 handlers, y el anti-cheat v2 (C3: hover + ventana de velocidad horizontal) está implementado. El cooldown de `set_seed` (C4, 10 s) está implementado pero con un defecto (la cuota se consume incluso cuando el rechazo es por "otros jugadores").

### Tabla de hallazgos (servidor)

| ID | Sev | Archivo:línea | Descripción | Etiqueta | Bloque F16 |
|---|---|---|---|---|---|
| F16-01 | 🔴 | net.js:2025 + world.js:968-970 | **Crash del mainLoop**: el fill hace `Array.from(state.chunks.get(key))` sin guard; `generateChunk` no cachea chunks OOB → `Array.from(undefined)` → TypeError en `setInterval` sin try/catch → **el proceso muere** | [NUEVO] (es el crash reportado por el usuario) | C4/C2 (regresión) |
| F16-02 | 🟠 | world.js:1421 (HEAD: ~1443) | `generateChunk` sigue marcando dirty todo chunk generado ("la generación usa Math.random") → cada relleno de radio ensucia 441 chunks y el autosave los persiste; la mitad de C4 (no-dirty en generación) no está hecha | [PERSISTE] (SEC-2/C4 sin completar) | C4 |
| F16-03 | 🟠 | net.js:1139-1148 (HEAD: ~1152) | Cooldown C4: la cuota se reserva ANTES de comprobar `state.players.size > 1` → un `set_seed` rechazado por "others" consume igualmente la cuota de 10 s | [NUEVO] | C4 |
| F16-04 | 🟠 | net.js:803-805 + world.js:1611 | `place` consume el ítem aunque `world.setBlock` falle (coords finitas pero fuera de rango): `getBlock`=AIR → pasa el chequeo → `removeFromInventory` resta sin colocarse nada. La spec C2 lo advierte explícitamente y sigue sin corregir | [PERSISTE/PARCIAL] (validación `Number.isFinite` sí; consumo en fallo no) | C2 |
| F16-05 | 🟠 | net.js:1963/2085 | `mainLoop` entero sin try/catch: cualquier excepción interna (como F16-01) escapa del bucle de `setInterval` y tumba el proceso; contrasta con el handler de mensajes que sí está blindado | [NUEVO] | — |
| F16-06 | 🟡 | save.js:518 y save.js:303 | `switchWorld` y `releaseWorld` (F17) llaman `saveWorld()` **síncrono** (deliberado: abortar el cambio si falla); con cientos de chunks sucios el event loop se congela | [NUEVO] (releaseWorld F17-EN-CURSO) / [PERSISTE] (switchWorld) | C1 (residual) |
| F16-07 | 🟡 | net.js:2010-2019 | El escaneo `missing` incluye claves OOB que **nunca** se cachean → nunca salen de `missing` → reintento de la misma key cada tick + `sort` O(r²) inútil; además de provocar el crash, deja el relleno del radio atascado en el borde | [NUEVO] | C4 |

### Detalle

**F16-01 (🔴) — Crash del fill del mainLoop.** `net.js:2022-2025`:
```js
for (const { key } of batch) {
    const [cx, cz] = key.split(",").map(Number);
    world.generateChunk(cx, cz); // idempotente (cachea en state.chunks)
    DATA[key] = Array.from(state.chunks.get(key));   // ← sin guard
}
```
`world.js:968-970`: `if (outOfBounds(cx, cz)) { return new Uint8Array(...); }` — devuelve un chunk vacío **sin cachearlo** en `chunks`. Si la key del batch es OOB → `state.chunks.get(key)` es `undefined` → `TypeError: undefined is not iterable` → `setInterval(mainLoop, TICK_MS)` (`net.js:2085`) sin try/catch → **el proceso muere**. El stack coincide exactamente con el reporte del usuario (`Timeout.mainLoop [as _onTimeout]`). El fix ya existe en el sitio hermano `ensureChunksAround` (`world.js:1646-1650`, comentario: "no devolver la key o el llamador haría Array.from(...) → undefined is not iterable (el crash que tiraba el servidor al crear una semilla)") — **pero el camino del mainLoop no lo usa**. Las claves OOB entran en `missing` desde cualquier jugador en el borde del mundo (mundo 256×256 = ±8 chunks con radio ≥9) o al ampliar `renderDistance`. **Re-verificado presente en HEAD `810e381`.**

**F16-02 (🟠) — C4 sin completar: la generación sigue marcando dirty.** `world.js` `markChunkDirty(cx, cz); // la generación usa Math.random (árboles), así que se persiste`. Cada mundo nuevo ensucia el radio completo y el autosave los escribe (menos bloqueante gracias a C1, pero el disco sigue creciendo). El no-dirty real exigiría generación determinista (PRNG con semilla).

**F16-03 (🟠) — Cuota C4 consumida en rechazos que no son spam.** El orden es: comprobar cooldown → reservar `p.seedCooldownUntil = nowCooldown + 10000` → comprobar `state.players.size > 1` → rechazar con `reason: "others"`. El rechazo legítimo paga la cuota.

**F16-04 (🟠) — `place` consume el ítem aunque la colocación falle.** `world.getBlock` devuelve AIR para `wy` fuera de −64..63 → pasa el chequeo de aire → `setBlock` devuelve `false` fuera de rango → pero `removeFromInventory` se ejecuta igual. Un cliente en el límite del mundo pierde el ítem sin colocarlo.

**F16-05 (🟠) — mainLoop sin try/catch.** El handler de mensajes sí está blindado (net.js:1687-1692); el bucle del tick no. Cualquier excepción futura derriba el servidor.

**F16-06 (🟡) — Guardado síncrono residual.** `save.js:518` (`switchWorld` → `if (!saveWorld()) return "error"`) y `save.js:303` (`releaseWorld` → `saveWorld()`). Con 100+ chunks sucios congelan el loop varios cientos de ms (candidato a timeouts E2E y al bloqueo del menú F17).

**F16-07 (🟡) — `missing` atascado con claves OOB.** Derivado de F16-01; aunque se parchee el `Array.from`, el relleno quedará infinito en el borde — el fix correcto es filtrar las claves OOB del `missing`.

### Reintento enfocado — B3 IA de mobs (eslabón faltante)

**Recibir daño (cuerpo a cuerpo):** `net.js:1736` `case "attack_mob"` → `net.js:1752` daño → `net.js:1776` `mobs.Mob.prototype.mobHit.call(mob, p)` → `mobs.js:991-1006` `mobHit(attacker)`: hostiles → `aggroUntil = Date.now() + MOB_AGGRO_MS (10000)` + `aggroTarget = attacker.id` (con excepción F17 B6: atacante en creative → sin aggro, `mobs.js:995`); pasivos → `fleeUntil = now + 4000` + `fleeFrom`.

**Recibir daño (proyectil del jugador):** `mobs.js:320-351` `tickArrows` → `mobs.js:330` `m.health -= a.damage || ARROW_DAMAGE` → **❌ NO llama a `mobHit`** (verificado: `aggroTarget` solo se asigna en `mobs.js:997`, y `mobHit` solo se invoca desde `net.js:1776`). Un zombi flechado no se vuelve agresivo ni un pasivo huye. **Eslabón faltante (parcial):** el flujo aggro→perseguir→atacar está completo y correcto para cuerpo a cuerpo; falta proyectil→reacción. Esto explica la mitad del reporte del usuario ("no reaccionan a ser atacados" si ataca con arco).

**Perseguir/atacar:** `net.js:1921` → `mobs.js:699-716` `tick()` → `findNearestPlayer()` (`mobs.js:461-499`: prioriza aggro target, excluye creative y zona segura de spawn de 32 bloques `:490-491`) → `tickSpecies` (`mobs.js:767-779` `tickZombie`: chase si noche/dist<16/aggroed, ataca a <1.6) → `chase()` con anti-atasco → `attack()` (`mobs.js:633-645`) → `players.js:596-614` `damagePlayer` (ignora creative `:597`, ignora daño mob durante `spawnGraceUntil` 30 s `:601-602`). Pasivos huyen: `mobs.js:955-961`. Nota: la "no agresión" percibida es en gran parte diseño (zona segura spawn, gracia 30 s, exclusión creativos, spawn mínimo 24 bloques); el zombi de día persigue a <16 bloques (más agresivo que MC, documentado como intencional).

### Reintento enfocado — SV-2 removeFromInventory: **CORREGIDO (C6)**

`server/players.js:319-335`: el bucle ya **no devuelve `false` al primer stack insuficiente**; resta de TODOS los stacks del ítem hasta cubrir `count` (comentario `:320-322` documenta el fix C6). `addToInventory` (`players.js:39-70`) **sí fusiona** stacks del mismo id (`:60-65`) pero **sin tope de 64** (`:59` "sin límite de stack, simplificado") → SV-5 persiste como simplificación documentada. Arista nueva (baja): si la cantidad no se cubre, el método **resta igual los stacks parciales y devuelve `false`** (mutación sobre fallo); latente porque todos los callers usan `count = 1`.

### Reintento enfocado — unit-red.js: los 9 fallos de línea base YA PASAN

`SEED=miSemilla2026 node tests/unit-red.js` aislado → **exit 0, 0 "checks fallidos"** (la suite completa de línea base falló por una versión intermedia del árbol; los commits posteriores corrigieron el código). Ninguno era "test desactualizado". Causas por check: (1-2) `break_cancel` — el guard `validCoords` bloqueaba la cancelación; corregido en `net.js:742-748` (guard restringido a break/place/ignite) + `mining.js:28-34`; (3) agua NOT_MINEABLE con `constants.js:427`; (4) distancia >7 con `validCoords` (fix C2); (5) creative instantáneo `net.js:765-768`; (6-7) horno D1 (combustible real, `crafting.js:171,211-219` consume `FUEL_TICKS`); (8-9) cooldown C4 (`net.js:1152`). **Nota metodológica:** ejecutar `node tests/unit-red.js` directamente sin `SEED` crashea (`init` es `undefined`) porque `MENU_MODE = !process.env.SEED` (`constants.js:65`) → `handleConnection` envía `menu_state` y no `init` (`net.js:389, 441-449`); `tests/run.js:117` inyecta `SEED` — el test quedó acoplado al env de `run.js`.

### Hallazgo nuevo del reintento — modo menú de F17 rompe el arranque E2E documentado

**[NUEVO] F17 A1 (modo menú): el servidor sin `SEED` nunca envía `init`** (alta). `server/net.js:300, 389, 441-449` + `server/constants.js:65,121`. Si el servidor de E2E se arranca como indica `AGENTS.md` (`PORT=3998 node server.js`, sin `SEED`), entra en modo menú: el cliente recibe `menu_state` y jamás `init`, por lo que los E2E que esperan `init` se cuelgan para siempre. Es la explicación más parsimoniosa de la triada E2E roja (más que el bloqueo síncrono del guardado REN-1); mitigación: arrancar E2E con `SEED=miSemilla2026` o que el modo menú no aplique sin SEED explícito en el entorno de test.

### Verificación de hallazgos previos (servidor)

| Hallazgo previo | Estado actual | Evidencia |
|---|---|---|
| **SV-1** horno combustible infinito | ✅ **CORREGIDO** | `constants.js:475-483` (`FUEL_TICKS` carbón 1600/palo 100/tablas-tronco 300); `crafting.js:211-219` consume unidad por recarga y se apaga; `net.js:999-1014` `add_fuel` valida y consume (ver §5, D1) |
| **SV-2** removeFromInventory stacks parciales | ✅ **CORREGIDO** | `players.js:319-335` (ver §2 reintento) |
| **SV-3** handlers sin validar coords | ✅ **CORREGIDO** | `validCoords` (`net.js:57-63`) en block_action/till/plant/bonemeal/bucket_use/door_use/furnace_open/chest_open/move; residual: `sleep` (seguridad F16-04) y consumo en fallo de `place` (F16-04) |
| **SV-4** guardado 100% síncrono | 🟡 **PARCIAL** | autosave asíncrono (`saveWorldAsync`, server.js:112-115); persisten `switchWorld`/`releaseWorld` síncronos (F16-06) y lote de 6 chunks síncrono (rendimiento P3) |
| **SV-5** /give 999 sin tope 64 | ✅ **CORREGIDO** | `/give` tope 64 (commands.js:338, verificado por seguridad); `addToInventory` sin tope de stack sigue como simplificación documentada |
| **SV-6** /tp sin clamp | ✅ **CORREGIDO** | `/tp` con clamp contra `worldHalfExtent` + guard `if (arr)` en reenvío de chunks (commands.js:236-237, 286-289, verificado por seguridad) |

---

## 3. Seguridad

> Informe del subagente `seguridad` (completo, 14 lecturas + `npm audit`).

### Resumen

El servidor está mucho más endurecido que en la 2026-08-10: C1 (guardado asíncrono), C2 (validCoords en casi todos los handlers), C3 (hover cerrado + ventana horizontal), C4 (cooldown de `set_seed`), `/give` 64, `/tp` clamp, CL-3 en cliente, XSS (textContent/escapeHtml) y `npm audit` 0 — todo verificado en el código. Sin embargo, quedan **dos huecos de seguridad reales**: el **crash DoS F16-01 persiste** (el relleno de chunks de `mainLoop` sigue sin guard contra chunks fuera de bordes, ahora en `net.js:2002`) y **SEC-2 sobrevive por el nuevo `join_world` de F17**, que no tiene cooldown mientras `generateChunk` sigue marcando todo como dirty. El anti-cheat v2 quedó parcial: la ventana horizontal sub-mide a 30 msg/s (~10,5 bloques/s reales evaden el tope de 7).

### Tabla de hallazgos

| ID | Sev | Archivo:línea | Descripción | Etiqueta | Bloque F16 |
|---|---|---|---|---|---|
| F16-01 | 🔴 crítico | `server/net.js:2002` (HEAD 2025) | 🔴 Crash DoS: `mainLoop` hace `Array.from(state.chunks.get(key))` sin guard tras `generateChunk`; los chunks OOB no se cachean → `TypeError: undefined is not iterable` en `setInterval` sin try/catch → el proceso muere. Basta caminar al borde del mundo o crear mundo 256×256 con render distance 10. | [NUEVO] | C2 (parcial) |
| F16-02 | 🟠 alto | `server/net.js:1062-1118` + `world.js:1421` | 🔴 SEC-2 persiste por el vector F17: `join_world` (sin cooldown) + `leave_world` en bucle re-ejecutan `switchWorld`, que persiste síncronamente ~441 chunks dirty (generación sigue marcando dirty) → llenado de disco + congelación del event loop, sin la cuota de 10 s que sí tiene `set_seed`. | [PERSISTE/PARCIAL] | C4 |
| F16-03 | 🟠 medio | `server/net.js:622-643` y `595-613` | 🔴 C3 parcial: la ventana horizontal clava cada intervalo a ≥50 ms, pero a 30 msg/s el tiempo real es 33 ms → la velocidad medida es ~2/3 de la real → ráfagas de 0,35 bloques/move (10,5 bloques/s, ~1,9× sprint) evaden el tope de 7. El hover por hundimiento lento (dy entre −0,001 y −0,02) tampoco se caza. | [PARCIAL/NUEVO] | C3 |
| F16-04 | 🟡 bajo | `server/net.js:1507-1510` | `sleep` sin `validCoords` (único handler con coords que quedó fuera de C2). No explota hoy (`getBlock(NaN)`→AIR→return), pero rompe el patrón de rechazo. | [PARCIAL] | C2 |
| F16-05 | 🟡 bajo | `public/index.html:12-13`; `server/net.js:246` | SEC-4 persiste: Three.js desde unpkg **sin SRI**, sin CSP ni `X-Content-Type-Options` en el único `app.use` estático. | [PERSISTE] | — |
| F16-06 | 🟡 bajo | `server/net.js:1140-1141` | `set_seed`: la cuota de 10 s se fija **antes** del chequeo `state.players.size > 1` → un rechazo por "others" consume la cuota indebidamente. | [NUEVO] | C4 |
| F16-07 | 🟢 info | `public/network.js:93` | CL-3 parcial en el cliente: `JSON.parse` ya va en try/catch y hay `default`, pero el destructuring `const { event, data } = parsed` queda fuera → `JSON.parse("null")` lanzaría dentro del listener. Solo robustez del cliente. | [PARCIAL] | C6 |

### Detalle

**🔴 F16-01 — Crash DoS (disponibilidad).** `world.js:965-971` `generateChunk` no cachea los chunks OOB; el fix de F16 se aplicó en `ensureChunksAround` (`world.js:1646-1650`) pero el relleno del mainLoop llama a `generateChunk` directo + `Array.from` incondicional (`net.js:1997-2002`). `mainLoop` no tiene try/catch (1895-2045), el `setInterval` (2062) no envuelve, y `server.js` solo maneja `SIGINT` → la excepción derriba el proceso entero. **Disparo sin modificar el juego:** con mundo 256×256 (`maxC = 7`), cualquier jugador en `pcx ≥ 2` o con `renderDistance = 10` desde el spawn incluye claves OOB → crash en <1 s. **Explotable por un cliente sin modificar: SÍ. Severidad: crítico (DoS total, sin autenticación).**

**🟠 F16-02 — SEC-2 persiste por el vector F17 `join_world`.** `net.js:1062-1118` replica el cuerpo de `set_seed`/`switchWorld` **sin la cuota anti-spam** (no hay `p.seedCooldownUntil`). Un cliente WS a mano puede encadenar `join_world` → `leave_world` → `join_world`… sin tope temporal. Agravantes: (1) `generateChunk` sigue marcando dirty (`world.js:1420-1421`) → cada mundo deja ~441 chunks sucios; (2) `switchWorld` persiste síncronamente (`save.js:518`). Mismo impacto de SEC-2 (directorios persistentes ~3-8 MB por mundo, event loop congelado) pero **sin cooldown**. **Explotable con WS a mano: SÍ. Severidad: alto.**

**🟠 F16-03 — C3 anti-cheat v2: hover de altitud constante cerrado ✓, dos bypasses parciales.** Cerrado: `net.js:595-613` — `hovering = dy >= -0.001`; si `inAir` y `(dy > 0 && (...)) || (hovering && airTimeMs > 1000)` → teleport; `enterWorld` resetea `speedSamples`. Bypass A: la ventana horizontal (`net.js:622-643`, `WINDOW_MS=1200`, `MAX_SPEED=7`) clava cada intervalo a ≥50 ms con `Math.max(0.05, s.t - prevT)`, pero a 30 msg/s los intervalos reales son ~33 ms → `sumDur ≈ 1,5 × tiempo real` → la velocidad medida es ~2/3 → ráfagas de 0,35 bloques/move (10,5 bloques/s = 1,9× sprint) pasan como ≤7 medidos. Bypass B: hundimiento lento (dy entre −0,002 y −0,02) nunca entra en `hovering` → flota indefinidamente. **Explotable con cliente a mano: SÍ. Severidad: medio.**

**F16-04/05/06/07** — `sleep` sin `validCoords` (no explota); SEC-4 (CSP/SRI/CDN) persiste; cuota C4 antes de validar; CL-3 parcial del cliente.

### Verificación de SEC-1 a SEC-4

- **SEC-1 (bypass anti-cheat vuelo + speedhack 36 bloques/s):** 🟡 **PARCIAL/CORREGIDO con residual** — hover de altitud constante y 36 bloques/s cerrados; quedan los bypasses de F16-03 (10,5 bloques/s a 30 msg/s y hundimiento lento). Bloque C3: **no cerrado del todo**.
- **SEC-2 (set_seed en bucle → disco + event loop):** 🟡 **PARCIAL** — cooldown 10 s en `set_seed`; pero `join_world` (F17) sin cooldown (F16-02), `generateChunk` sigue marcando dirty, y el rechazo "others" consume la cuota (F16-06). Bloque C4: **a medias**.
- **SEC-3 (validación laxa en block_action):** ✅ **CORREGIDO** — `validCoords` en los handlers; excepción menor `sleep`. C2: **cerrado salvo `sleep`**.
- **SEC-4 (headers/CSP/SRI):** ❌ **PERSISTE** (F16-05).

### npm audit

- `npm audit --omit=dev` → **0 vulnerabilidades** (exit 0).
- `npm audit` (con dev) → **0 vulnerabilidades**.
- Producción: `express@^4.19.2`, `simplex-noise@^4.0.1`, `uuid@^14.0.1`, `ws@^8.17.0`. Sin CVEs conocidos.

### Áreas revisadas sin problemas

- Forma y límites WS (guardia de forma, switch en try/catch, `maxPayload` 1 MiB, `MAX_CONNECTIONS=10`, rate-limit 30 msg/s con cierre 1008).
- Comandos: `OP_ONLY` intacto; `/give` 64; `/tp` clamp; `/kill`/`/time`/`/gamemode`/`/op`/`/reload` con gate; `world_delete`/`world_clone`/`world_rename`/`world_gamemode` con gate y ruta resuelta bajo `world/`.
- Persistencia F17: `savePlayer`/`playerFilePath` sanean el nombre a `[a-zA-Z0-9_-]` máx 40 → **sin path traversal**; `restorePlayer` con `Number.isFinite`; `seedDir` a `[a-z0-9_-]`; escritura atómica tmp+rename; `.bak`; rechazo de `schemaVersion` futura.
- Anti-cheat base (1,2 bloques/move, rechazo de sólidos, clamp de bordes, daño de caída).
- Economía (crafteo server-side, slots inválidos → return sin mutación, distancias re-validadas).
- Exposición de datos (`mobSnapshot`/`otherPlayers` son proyecciones; el `init` no filtra `isOp`).
- XSS (chat/`textContent`, nametags canvas, lista de mundos con `escapeHtml`, tooltips con IDs validados).

---

## 4. Rendimiento

> Informe del subagente `rendimiento` (completo).

### Resumen

El servidor sigue teniendo un **crash por rendimiento no convergente** en el relleno del mainLoop (el `Array.from` sin guard en `net.js:2002` con claves fuera de bordes — el fix en `ensureChunksAround` de `world.js:1646-1650` no cubre este camino) y el **REN-3 persiste intacto** (el `settings` de radio sigue mandando el radio completo en un único `chunks_add` de decenas de MB, C6 ausente). El **C1 es una mejora real pero parcial**: el autosave ya va por cola con lotes de 6 chunks, pero cada chunk del lote sigue siendo 100% síncrono (`JSON.stringify` + `gzipSync` + `writeFileSync` + `renameSync`) y quedan call-sites síncronos (`switchWorld:518` y el nuevo `releaseWorld:303` de la Fase 17) que congelan el loop. REN-2/C5 está a medias: `furnaces.delete` al romper ya existe, pero abrir un horno vacío crea una entrada permanente y el bucle O(H×J) del tick no se acotó. C4 también a medias: cooldown de `set_seed` sí, no-dirty en generación no. El cliente sigue sólido (pool, LOD con histéresis, worker, throttle de move a 20 Hz, `renderScale` real en quality, `waterfog.js` puro y barato).

### Tabla de hallazgos

| ID | Importancia | Archivo:línea | Descripción | Etiqueta | Bloque F16 |
|---|---|---|---|---|---|
| P1 | 🔴 | `server/net.js:2002` (+ escaneo 1987-1995) | Crash del fill: `Array.from(state.chunks.get(key))` sin guard; claves OOB nunca se cachean → TypeError → proceso muere. El escaneo missing O(r²)+sort no converge cerca de bordes | [PERSISTE] | (crash conocido) |
| P2 | 🔴 | `server/net.js:695-730` | REN-3: `settings` reenvía el radio completo en un solo `chunks_add` (doble bucle + `Array.from` × 441 + `JSON.stringify` de decenas de MB síncrono); el cliente hace `Uint8Array.from` + escaneo de antorchas × 16384 celdas por chunk en el hilo principal | [PERSISTE] | C6-REN3 (ausente) |
| P3 | 🟠 | `server/save.js:848-915` + `server/world.js:805-818,793-797` | C1 parcial: cola `setImmediate` con lotes de 6, idempotente, sin bucle de error, `.bak` y atomicidad intactos — pero cada chunk del lote sigue bloqueando 15-40 ms (stringify+gzip+write síncrono) | [PARCIAL] | C1 |
| P4 | 🟠 | `server/save.js:303` (releaseWorld) y `:518` (switchWorld) | Call-sites síncronos de `saveWorld()`: con 100+ chunks sucios congelan el event loop en desconexión del último jugador (F17) y en cambio de semilla | [NUEVO] (releaseWorld, F17-EN-CURSO) / [PERSISTE] (switchWorld) | C1 (residual) |
| P5 | 🟠 | `server/net.js:899` + `:2013-2025` | REN-2/C5 parcial: `furnaces.delete` al romper existe (players.js:157, tnt.js:85, mobs.js:686-689), pero `furnace_open` crea entrada permanente por horno abierto (solo se borra al romper el bloque) y el bucle O(H×J) de notificación no se acotó (solo el `send` es condicional) | [PARCIAL] | C5 |
| P6 | 🟠 | `server/world.js:1421` | C4 parcial: `generateChunk` sigue marcando dirty todo chunk generado (441 escrituras gzip por mundo nuevo de radio 10); el cooldown de `set_seed` sí está | [PARCIAL] | C4 (no-dirty ausente) |
| P7 | 🟠 | `public/world.js:886-919` y `:947-967` | REN-7 parcial: `bakeChunkLight`/`hasTorchNear` siguen O(torchSet) por bake/consulta (`hasTorchNear` en CADA `block_update`); la fuga SÍ se corrigió (limpieza en unloadChunks) | [PARCIAL] | — |
| P8 | 🟡 | `server/net.js:1987-1995` | REN-5: escaneo O(r²)+sort por tick y jugador persiste (correcto por diseño cuando converge); agravado por P1 (no-convergencia en bordes) | [PERSISTE] | — |
| P9 | 🟡 | `server/net.js:1870` + `server/state.js:32` | `templeTrapCooldowns` nunca se borra: una entrada por templo visitado, fuga menor en sesiones largas | [NUEVO] | — |
| P10 | 🟡 | `server/server.js:114` + `server/save.js:136-149` | `savePlayer` síncrono por jugador cada 30 s en el autosave — archivo pequeño, despreciable (solo verificado) | [NUEVO] | — |

### Detalle

**P1 (🔴) — Crash del fill del mainLoop (persiste).** `net.js:1987-2006`: el escaneo `missing` incluye claves fuera de bordes sin filtrar; `world.js:969-971` no las cachea → `Array.from(undefined)` → TypeError → proceso muerto (sin `uncaughtException`). Además las claves OOB nunca entran en `state.chunks`, así que `missing` nunca llega a 0: cada tick se reconstruye el escaneo + sort inútil (trabajo permanente no convergente).

**P2 (🔴) — REN-3 `settings` sin fragmentar (persiste).** `net.js:706-726`: un solo `JSON.stringify` de ~7,2 M de números (r=10) en el hilo principal; el criterio de C6 ("reenvío fragmentado por lotes") no se implementó. En el cliente, `network.js:126` → `loadChunkData` hace `Uint8Array.from` + escaneo de antorchas de 16384 celdas por chunk en el hilo principal, más el parse del JSON gigante: ráfaga de cientos de ms en ambos lados (puntual pero enorme).

**P3 (🟠) — C1: cola asíncrona implementada, pero el lote sigue siendo síncrono.** `save.js:848-915` correcto en diseño (idempotencia por `asyncSaving`, borrado al escribir — un chunk ensuciado durante el guardado no se pierde —, error sin bucle, `.bak` y `world.json` final, `setImmediate` entre lotes). Pero `world.writeChunkFile` (`world.js:805-818`) hace `JSON.stringify` (copia de 16 384 números) + `zlib.gzipSync` + `atomicWrite` — todo síncrono. Un lote de `SAVE_BATCH_SIZE = 6` puede bloquear 15-40 ms; con 100+ chunks sucios ~17-30 iteraciones en 1-2 s. El criterio de C1 ("100+ chunks sin picos de tick") probablemente no se cumple del todo — a verificar con perfilado.

**P4 (🟠) — Call-sites síncronos residuales.** `save.js:518` (`switchWorld`) y `save.js:303` (`releaseWorld`, F17): persisten TODO síncrono antes de cambiar de semilla / al quedarse sin jugadores; `save.js:767` (`unloadFarChunks`) `writeChunkFile` síncrono por chunk lejano sucio cada 10 s (menor).

**P5 (🟠) — REN-2/C5 a medias.** Corregido: `players.js:157`, `tnt.js:85`, `mobs.js:686-689` hacen `furnaces.delete` al romper/explotar/destruir. Persiste: (a) `net.js:899` `furnace_open` → `getOrCreateFurnace(key)` crea la entrada **aunque el horno esté vacío** y solo se elimina al romper el bloque → cada horno alguna vez abierto queda para siempre en memoria y en `world.json`; (b) el bucle de notificación `net.js:2013-2025` sigue siendo O(H×J) por tick (solo el `send` está condicionado). La spec C5 pedía acotarlo (estructura `furnace → Set<playerId>`) — no se hizo.

**P6 (🟠) — C4: cooldown sí, no-dirty no.** `net.js:1130-1140` cooldown correcto; `world.js:1421` sigue `markChunkDirty` en generación. El no-dirty real exigiría generación determinista (PRNG con semilla).

**P7 (🟠) — REN-7: fuga corregida, algoritmo O(T) persiste.** `world.js:1074-1082` limpia `torchSet` al descargar; `bakeChunkLight` (886-902) y `hasTorchNear` (947-967) recorren `torchSet` completo por bake/consulta; `hasTorchNear` se invoca en cada `block_update`.

**P9 (🟡)** — `templeTrapCooldowns.set(key, Date.now())` sin `delete` en ningún sitio: una entrada por templo visitado (fuga menor).

### Verificación REN-1 a REN-7

| Hallazgo previo | Estado |
|---|---|
| REN-1 guardado 100% síncrono cada 30 s | **PARCIAL** — autosave por cola asíncrona por lotes (C1); persisten `switchWorld:518`, `releaseWorld:303` (F17) y `unloadFarChunks:767`; el lote de 6 sigue bloqueando 15-40 ms |
| REN-2 hornos O(H×J) + nunca se eliminan | **PARCIAL** — `furnaces.delete` al romper implementado (C5); persiste la entrada por horno abierto (aunque vacío) y el scan O(H×J) por tick sin acotar |
| REN-3 settings → chunks_add gigante | **PERSISTE** — C6 no implementado |
| REN-4 sendInit itera todos los chunks | **CORREGIDO/mitigado** (filtra por radio Chebyshev) |
| REN-5 relleno O(r²) con sort | **PERSISTE (correcto por diseño)** salvo no-convergencia en bordes por P1 |
| REN-6 diff de mobs | **CORREGIDO/correcto** (snapshot + stringify 1/tick, broadcast solo si cambia) |
| REN-7 bakeChunkLight/hasTorchNear O(torchSet) | **PARCIAL** — limpieza de `torchSet` añadida (fuga corregida); el O(T) persiste sin índice espacial |

### Estado de los bloques F16 (rendimiento)

- **C1**: implementado con limitación (cola correcta; coste por chunk síncrono + 3 call-sites síncronos). A verificar con perfilado.
- **C4**: parcial (cooldown sí; no-dirty ausente).
- **C5**: parcial (`furnaces.delete` sí; bucle O(H×J) no acotado; entrada por horno abierto persiste).
- **C6-REN3**: **ausente** (settings sigue siendo un único `chunks_add` gigante).
- C2 (validCoords) y C3 (anti-cheat) implementados (confirmados también por servidor/seguridad).

### Áreas revisadas sin problemas

- Cliente: pool de geometrías, LOD con histéresis throttled a 4/s, frustum culling, worker con token anti-stale, throttle de `move` a 20 Hz, `renderScale` real, `waterfog.js` pura y barata, nubes con tinte cuantizado, dispose correcto.
- Servidor: `sendInit` filtrado por radio, despawn 128 bloques + tope de spawn, pathfinding incremental, `tickArrows` con limpieza, `crops`/`chests`/`doors` se limpian al romper, rate-limit, `unloadFarChunks` acota memoria, relleno progresivo `CHUNK_FILL_PER_TICK = 6`.
- Persistencia: escritura atómica tmp+rename y `.bak` intactos en la cola nueva; `loadWorld` con restauración de `.bak`; migraciones retrocompatibles.

---

## 5. Paridad con Minecraft

> Informe del subagente `paridad-minecraft` (completo).

### Resumen

Los seis bloques de paridad D1-D6 de la Fase 16 están **implementados y correctos** en el código: `FUEL_TICKS` con valores oficiales (carbón 1600 / palo 100 / tablas-tronco 300), consumo real del combustible con apagado, drops de zombi/creeper con ítems nuevos sincronizados (255/256), puertas ×3, vidrio 200 t, carbón vegetal y XP de slime mediano (2) / lobo (1-3). PAR-1 a PAR-8 quedan **corregidos**. No hay regresiones en las tablas fijadas por `unit-paridad.js`. Hallazgos nuevos menores: (a) la tabla `MOB_XP` en `server/constants.js` quedó con valores viejos y contradictorios (`wolf: 8`, `slime: 1` con comentario incorrecto) aunque `mobXp()` los sobrescribe; (b) el combustible no se consume si el insumo se agota a mitad de quema (en MC se desperdicia); (c) `add_fuel` rechaza cambiar de combustible con uno cargado (en MC se encolan). Las discrepancias que no tocaba F16 (día/noche binario, profundidad de minerales, zanahoria/patata no comestible) **persisten** como aproximaciones/intencionales documentadas.

### Tabla de discrepancias

| # | Mecánica | Mi Minecraft | Minecraft (Java/Bedrock) | Severidad | Tipo | Ref. |
|---|---|---|---|---|---|---|
| 1 | XP del lobo en tabla `MOB_XP` | `wolf: 8` (constantes) pero `mobXp()` devuelve 1-3 | 1-3 XP | 🟡 | bug (dato muerto contradictorio, no afecta la lógica) | `server/constants.js:906` vs `server/mobs.js:34` |
| 2 | XP del slime en tabla `MOB_XP` + comentario | `slime: 1` y comentario "el grande 2, el pequeño 1" (la lógica da grande 4 / mediano 2 / pequeño 1) | grande 4, mediano 2, pequeño 1 | 🟡 | bug (comentario/tabla desactualizados) | `server/constants.js:914` vs `server/mobs.js:32-33` |
| 3 | Horno: combustible pausado al agotarse el insumo | el combustible cargado NO se consume si `inputItem` se agota | el combustible sigue quemándose aunque el insumo se acabe (se desperdicia) | 🟡 | bug (sin documentar) | `server/crafting.js:205-208` |
| 4 | Horno: `add_fuel` con combustible distinto | rechaza cargar otro combustible mientras hay uno cargado | los combustibles distintos se encolan y queman en orden | 🟡 | bug (simplificación sin documentar) | `server/net.js:1003-1004` |
| 5 | Criterio spec D6 | los checks de XP slime/lobo viven en `unit-fase16.js`, NO se actualizó `unit-paridad.js` como pedía la spec | — | 🟡 | desviación del criterio de spec (no bug de juego) | `docs/spec/fase16-spec.md:290` vs `tests/unit-fase16.js:260-267` |
| 6 | Ciclo día/noche | binario: `isNight = worldTime() > DAY_CYCLE_MS/2`; crepúsculo solo visual | día 10 / atardecer 1.5 / noche 7 / amanecer 1.5 | 🟡 | intencional (aproximación comentada) | `server/net.js:1920`; `server/constants.js:22` |
| 7 | Profundidad de minerales | diamante y≤−20, hierro y≤−12 (mundo −64..+63) | diamante y<16, hierro y<64 (mundo 0..320) | 🟡 | intencional (aproximación) | `server/world.js:1033-1038` |
| 8 | Zanahoria/patata como comida | no comestibles (solo cría/creativo) | zanahoria 3, patata 1, patata al horno 5 | 🟡 | intencional (agricultura solo trigo) | `server/constants.js:489-505` |
| 9 | Carbón vegetal como ítem | 1 tronco → 1 **carbón (COAL 101)** | 1 tronco → 1 carbón vegetal (ítem distinto en MC) | 🟡 | intencional (spec D5: "ítem existente") | `recetas_horno.json:6` |
| 10 | Recetas de mena en horno | claves "9"/"10"/"11" (mena→gema) pero `ORE_DROP` da el lingote directo al minar → recetas inaccesibles (dato muerto preexistente) | — | 🟡 | no es de F16 (preexistente, sin efecto) | `recetas_horno.json:2-4`; `server/constants.js:932-938` |

### Detalle por bloque D1-D6

- **D1 — Horno con `FUEL_TICKS` y consumo real: implementado correcto** (2 desviaciones menores). `FUEL_TICKS` con valores oficiales exactos (`server/constants.js:475-483`: troncos/tablas 300, carbón 1600, palo 100); `tickFurnaces` (`crafting.js:211-219`) consume la unidad real (`f.fuelCount = Math.max(0, (f.fuelCount||0)-1); if (f.fuelCount <= 0) f.fuelItem = null;`) y se apaga; `add_fuel` (`net.js:999-1014`) valida ítem y distancia. El bug de la 2026-08-10 (`fuelTicksLeft = 400` sin consumir) **ya no existe**. `public/constants.js` no expone la barra (no aplica unit-sync). `restoreFurnaces` migra hornos viejos con `fuelCount=1`. Desviaciones: combustible no se desperdicia si el insumo se agota (más generoso que MC); `add_fuel` no encola combustibles distintos.
- **D2 — Drops zombi/creeper: implementado correcto.** `ROTTEN_FLESH: 255` / `GUNPOWDER: 256` en ambos `constants.js` (mismo ID); `mobs.js:1641-1644` zombi 0-2 carne podrida / creeper 0-2 pólvora; receta de TNT oficial `recetas.json:841-855` (4 arena + 5 pólvora → 1 TNT); la pólvora no es crafteable.
- **D3 — Puertas ×3: implementado correcto.** `recetas.json:813-840`: 6 tablas/lingotes → `count: 3` (madera e hierro).
- **D4 — Vidrio 200 t: implementado correcto.** `recetas_horno.json:5`: SAND → GLASS `time: 200`.
- **D5 — Carbón vegetal: implementado correcto** (reusa COAL, decisión explícita de spec). `recetas_horno.json:6,7-9`: 4 troncos → COAL 200 t.
- **D6 — XP: correcto en la lógica, tabla muerta sin actualizar.** `mobs.js:32-34` `mobXp()`: slime mediano 2 (✓ PAR-7) y lobo 1-3 (✓ PAR-8), aplicado en proyectil y cuerpo a cuerpo. **Contradicción interna [NUEVO]:** la tabla `MOB_XP` de `server/constants.js` NO se actualizó — `wolf: 8` (`:906`) y `slime: 1` con comentario incorrecto (`:914`). Son datos muertos (nunca se leen), pero contradicen la spec D6 (que pedía tocar `constants.js:873,881`) y son una trampa de regresión: si alguien borra el caso especial de `mobXp`, el juego vuelve a 8/1 sin que el test lo note. El criterio "unit-paridad.js actualizado" no se cumplió al pie de la letra (los checks viven en `unit-fase16.js`).

### Verificación PAR-1 a PAR-8

PAR-1/SV-1 (horno 400 genérico/infinito) → **CORREGIDO** · PAR-2 (sin drops zombi/creeper) → **CORREGIDO** · PAR-3 (puertas ×1) → **CORREGIDO** · PAR-4 (vidrio 150t) → **CORREGIDO** · PAR-5 (sin carbón vegetal) → **CORREGIDO** · PAR-7 (XP slime mediano 1) → **CORREGIDO** · PAR-8 (XP lobo 8) → **CORREGIDO** · Tabla #6 (día/noche binario) → **PERSISTE** (intencional) · Tabla #9 (minerales) → **PERSISTE** (intencional) · Tabla #10 (zanahoria/patata) → **PERSISTE** (intencional).

### Áreas de paridad correcta (sin regresiones)

Durabilidades (59/131/250/32/1561 + tijeras 238), daños de espada (4/5/6/4/7), daños no-espada, armadura (puntos y durabilidades), durezas, curva de XP (2L+7/5L−38/9L−158, nivel 30 = 1395), vida de mobs, comida (bistec 8/12.8, chuleta 3→8, pollo 2→6, etc.), tiempos de horno 200 t, ciclo 20 min/20 TPS, despawn >128, tooltip B4 sin barra fantasma. Todo coincide con `unit-paridad.js`.

### Contradicciones con otros informes

1. **`MOB_XP` desincronizado con la lógica y con la spec D6** (wolf 8 / slime 1 muertos en `constants.js:906,914` vs lógica en `mobs.js:32-34`). Riesgo de regresión futura que `unit-paridad.js` no detecta.
2. Criterio de spec D6 ("unit-paridad.js actualizado") no cumplido en el detalle (valores solo en `unit-fase16.js`).
3. Menor: recetas de mena del horno inaccesibles por `ORE_DROP` directo (dato muerto preexistente).

---

## Recomendaciones finales

Ordenadas por impacto/esfuerzo. Prioridad absoluta a los 🔴 de seguridad y al crítico de servidor.

1. **🔴 Corregir el crash F16-01 (DoS del servidor, el bug reportado por el usuario).** Filtrar las claves fuera de bordes del escaneo `missing` del `mainLoop` (`server/net.js:2010-2025`) — aplicar el mismo patrón ya comentado en `ensureChunksAround` (`world.js:1646-1650`): no meter la key en `DATA` si `generateChunk` no la cacheó, o excluir `outOfBounds` del escaneo — y, de paso, envolver `mainLoop` en try/catch (F16-05) para que ninguna otra excepción tumbe el proceso. **Encaja en: Fase 16, bloque C2/C4 (cierre del crash de set_seed)** — es lo que el usuario reporta literalmente.
2. **🔴 Cerrar C4 de verdad: cooldown compartido para `join_world` (F17) + no marcar dirty en generación.** `join_world` (`net.js:1062-1118`) replica `set_seed` sin la cuota de 10 s → SEC-2 sobrevive por el camino nuevo (disco + event loop). Añadir el mismo `seedCooldownUntil` (o cuota compartida) y, para el no-dirty, generación determinista con PRNG por semilla (o documentar el coste). Encaja en F16 C4 + F17 A1/A3.
3. **🔴 C6-REN3: fragmentar el reenvío del radio en `settings`** (`net.js:695-730`). Un único `chunks_add` de ~7,2 M de números congela ambos lados. Encaja en F16 C6 (pendiente de la 2026-08-10).
4. **🟠 C3 anti-cheat: cerrar los dos bypasses residuales.** (a) La ventana horizontal sub-mide a 30 msg/s (clavar intervalos a ≥50 ms con `Math.max` cuando el real es 33 ms) → medir por timestamps reales; (b) el hover por hundimiento lento (dy en −0,001..−0,02) no se caza → ventana de deriva negativa. Encaja en F16 C3.
5. **🟠 B3: conectar proyectil→reacción de mobs.** `tickArrows` (`mobs.js:330`) aplica daño sin llamar `mobHit` → los mobs no agreden ni huyen al ser flechados. Decide si es intencional (documentarlo) o llamar a `mobHit` desde el daño por proyectil, con test de regresión. Encaja en F16 B3.
6. **🟠 E2E y modo menú F17: arrancar los E2E con `SEED` explícita** o hacer que el modo menú no aplique sin `SEED` en el entorno de test — hoy `AGENTS.md` documenta `PORT=3998 node server.js` (sin SEED) y el servidor nunca envía `init` → los E2E se cuelgan. Encaja en F17 A1 (requisito previo documentado: E2E 6/6 en verde).
7. **🟠 C1 residual: `switchWorld`/`releaseWorld` síncronos** (`save.js:518,303`) — pasar a la cola asíncrona con confirmación, y medir el lote de 6 chunks (¿bajar `SAVE_BATCH_SIZE` o mover gzip a worker?). Encaja en F16 C1.
8. **🟠 F16-04: `place` no debe consumir el ítem si `setBlock` falla** (coords finitas fuera de rango) — comprobar el retorno de `setBlock` antes de `removeFromInventory`. Encaja en F16 C2.
9. **🟡 Paridad interna: actualizar la tabla `MOB_XP` muerta** (`constants.js:906,914`: wolf 8→1-3, slime → por tamaño) y su comentario, y mover/duplicar los checks de D6 a `unit-paridad.js` para que la spec D6 se cierre tal cual y la regresión quede fijada. Encaja en F16 D6 (cierre documental).
10. **🟡 Menores de F16/F17 a cerrar antes de dar por buena la fase:** `sleep` sin `validCoords` (C2, seguridad F16-04); cuota C4 consumida en rechazo "others" (F16-03/F16-06); CL-3 completo en el cliente (destructuring y switch dentro del try, `network.js:93`); CL-2/H1 (mascotas sentadas) y `tame_ok` sin case (feedback de doma); C5: entrada por horno abierto vacío + bucle O(H×J) sin acotar; `templeTrapCooldowns` sin limpiar (P9); `MOB_XP` (ver 9); formato Biome (87 errores: 76 de formato + 11 reales, incluido `noDuplicateObjectKeys` en `constants.js:1160` a revisar).

### Causas raíz transversales

- **El patrón `Array.from(state.chunks.get(key))` sin guard aparece en 3 caminos** (`mainLoop` fill, `settings`, y antes del fix también en otros); se arregló en `ensureChunksAround` pero no en los otros dos. Es la causa raíz del crash del usuario y de la no-convergencia del relleno en bordes. Un helper único (`chunkDataOr(key, fallback)`) o excluir OOB en los 3 sitios lo cierra de una vez.
- **SEC-2/C4 se pensó para `set_seed` pero la Fase 17 añadió `join_world` con el mismo poder sin la cuota** — toda protección anti-spam de cambio de mundo debe vivir en `switchWorld` (save.js), no en el handler.
- **El modo menú de F17 (A1) cambió el contrato de arranque sin actualizar `AGENTS.md`/E2E** — cualquier fase nueva que cambie el comportamiento de arranque debe re-verificar los E2E documentados en el mismo commit.

### Estado de completitud de la Fase 16 (veredicto)

- **Bloque A (A1, commitear WIP del D5):** ✅ resuelto (el D5 se commiteó en `a73e806`/`e82a6a6`; HEAD limpio del D5).
- **Bloque B:** B1 ✅, B4 ✅, B5 ✅, B6 ✅ (verificados por cliente); B2 🟢 funciona pero con acoplamiento implícito (H4); **B3 🟠 parcial** (eslabón faltante proyectil→reacción).
- **Bloque C:** C1 🟡 parcial (autosave asíncrono; síncronos residuales), C2 🟡 casi cerrado (residual `place` y `sleep`), C3 🟡 parcial (2 bypasses), C4 🟡 parcial (cooldown sí; no-dirty no; cuota mal consumida; **crash F16-01 sin corregir**), C5 🟡 parcial (delete al romper sí; entrada por horno abierto + O(H×J) no), C6 🟡 parcial (SV-2/SV-5/SV-6 hechos; **REN-3 ausente**; CL-3 parcial).
- **Bloque D:** ✅ D1-D6 implementados y correctos (2 desviaciones menores del horno + tabla MOB_XP muerta).
- **Bloque E:** E1 ✅; E2 🟡 (unit-recetas ampliado; falta el cierre de spec D6 en unit-paridad).
- **Bloque G:** G0.2 ✅ (`--audit` corregido); G1.1-G1.4 🟡 en curso (c8, helpers, filter — hay commits G1.3/G2.6); G2-G4 parciales; G5 (docs) parcial (commits ed5ccb2/70008b6). **`unit-red.js` ya pasa 9/9 en el HEAD.**
- **Auditoría final de Fase 16:** ❌ **NO superable todavía** — el crash F16-01 (criterio de aceptación 1 y 6: "suite verde, servidor estable") lo impide, y los E2E/auditorías por fase no están todos en verde.

**Veredicto global:** la Fase 16 está implementada en su mayoría y de calidad, pero **no está completa ni cerrada**: el bug crítico reportado por el usuario (crash al crear semilla) persiste en el HEAD y es además un DoS sin autenticación; C4, C5, C6-REN3 y B3 quedan parciales; y la Fase 17, que se está implementando en paralelo con el requisito previo "Fase 16 cerrada", arrastra ese mismo crash (el `mainLoop` que tumba el proceso) y añadió un nuevo vector sin cooldown (`join_world`). **La primera acción debe ser el fix del crash F16-01, con test de regresión, antes de avanzar nada de la 17.**

## Notas de método

- **Paralelismo:** los cinco subagentes se lanzaron en **secuencia** (uno a la vez) tras la línea base, como manda el flujo; los lanzamientos en paralelo se descartaron por el historial de cancelaciones por competencia de recursos.
- **Reintentos:** `auditoria-servidor` se reintentó una vez con misión más cercana (B3/SV-2/unit-red) tras un primer informe parcial por límite de pasos; ese reintento devolvió informe completo. Los demás agentes devolvieron informe (parcial o completo) a la primera; no se necesitó sustituir a ninguno por el agente general.
- **Blanco móvil:** el repositorio avanzó de `d8a8f8d` a `810e381` durante la auditoría (6 commits: F16 G + F17 WIP). Los informes reflejan versiones intermedias; donde era crítico se re-verificó contra el HEAD (crash F16-01: presente; unit-red: ya verde).
- **Contradicción a resolver manualmente:** la línea base (primera pasada) reportó `unit-red.js` rojo (9 checks) y E2E con `e2e-durabilidad` timeout; el reintento de servidor (árbol posterior) verificó `unit-red.js` verde y el hallazgo de modo menú explica los timeouts E2E por falta de `SEED`. No es una contradicción de código sino de estado del árbol en el tiempo — los números de la línea base corresponden al árbol intermedio `88a3d62`-`ed5ccb2`, no al HEAD.
