# Auditoría completa 2026-08-10

> Auditoría integral de solo lectura del clon de Minecraft (servidor Node
> autoritativo `server/` + cliente Three.js `public/`, todo en español),
> realizada con revisión de código real y verificación de cada hallazgo
> contra el archivo y la línea citados.
> **Fecha:** 2026-08-10 · **Commit auditado:** `da0b4c0` ·
> **Método:** línea base (sintaxis, linter, unitarios, E2E, auditorías por
> fase, arranque) + cinco pases especializados en paralelo (cliente,
> servidor, seguridad, rendimiento, paridad vs MC).

## Línea base

- **Sintaxis** (`node --check` sobre los 110 `.js` de `server/`, `public/`,
  `tests/` y raíz): **110/110 VERDE**.
- **Linter** (Biome 2.5.6): **ROJO** solo por formato/estilo — 43 errores
  (33 de formato, 4 `organizeImports`, 6 `noAssignInExpressions`), 82
  warnings, 21 infos. Ninguno bloquea el arranque; no hay CI configurado.
- **Unitarios** (`node tests/run.js --unit`): **50/50 VERDE**, 0 fallados.
- **E2E** (con servidor vivo en :3998): **ROJO** —
  - `e2e-mascotas`: **0/19 checks FAIL**
  - `e2e-durabilidad`: **TIMEOUT 180 s** en fase "give-materiales"
  - `e2e-templo`: **0/6 checks FAIL** + **TIMEOUT 30 s** en fase "watch"
  - suite completa: `e2e-comer`/`e2e-reload`/`e2e-cofre` con resultados no
    concluyentes por interferencia de ejecuciones en paralelo; `give-materiales`
    y `watch` de nuevo con timeout en el re-run.
- **Auditorías por fase:** `audit-fase3` VERDE (20 checks) · `audit-fase4`
  ROJO (9) · `audit-fase5` VERDE (26) · `audit-fase6` ROJO (11) ·
  `audit-fase7` ROJO (7 fallos; render por software en CPU, números de
  SwiftShader no comparables a GPU real).
- **Arranque:** el servidor responde HTTP 200 en `/` (verificado en :3000 y
  :3998). Entorno: Node v22.23.2, npm 12.0.2.

**Notas de método:** el subagente especializado `paridad-minecraft` no llegó a
devolver informe en cuatro intentos (se cancelaba sin salida), por lo que el
pase de paridad se completó con el agente general bajo la misma misión de solo
lectura. Los dos primeros lanzamientos en paralelo de los cinco subagentes se
cancelaron por competir por recursos/puertos con las suites en ejecución; se
relanzaron de forma secuencial y acotada.

---

# 1. Errores de implementación — Cliente

## Resumen

Auditado el cliente (23 lecturas de código, sin ejecutar nada). Los 3 E2E
rotos se ejecutan con un **cliente WS crudo** (`tests/e2e-*.js`), no con el
navegador, así que su causa raíz es de protocolo/servidor (fuera del alcance
de este pase); pero en las 3 mecánicas sí se encontraron bugs reales del lado
cliente que afectan a esos flujos: barra de durabilidad fantasma en todo el
hotbar, desync de mascotas sentadas (el cliente ignora `sitting`/`state` que
el servidor sí manda) y un `JSON.parse` sin try/catch en el router WS. No se
encontraron fugas de memoria ni bugs de render obvios en el resto.

## Hallazgos

### [CL-1] Barra de durabilidad completa (verde, "384/384") en TODOS los ítems del hotbar, incluso los que no tienen durabilidad (🟡 baja)
- Archivo: `public/ui.js:111` (`slotHtml`) y `public/ui.js:148` (`slotTooltipHtml`)
- Descripción: `const maxD = DURABILITY[item.id] || ARMOR_DURABILITY[item.id] || BOW_DURABILITY;` usa `BOW_DURABILITY` (384, siempre truthy) como *fallback global* en vez de solo para el arco (247). Como el wire solo incluye `durability` cuando existe (`server/items.js:61`: `if (this.durability !== undefined) o.durability = this.durability`), cualquier ítem apilable (adoquín, tablones, comida) entra con `cur = maxD = 384` → `pct = 100` → barrita verde bajo el slot + tooltip "384/384".
- Impacto: el HUD y el tooltip (Fase 15, D3) muestran una barra de durabilidad fantasma en cada slot ocupado por un ítem sin durabilidad. No rompe la mecánica de desgaste (esa la pinta el servidor en `inventory_update`), pero es el bug visible más claro de la triada durabilidad y contradice el propio comentario de línea 87-88 ("si tiene durabilidad"). Coincide con que la "Verificación manual pendiente de D1/D3 en navegador" sigue `[ ]` en TODO.md (nunca se miró en navegador).
- Evidencia: `public/ui.js:111` — `const maxD = DURABILITY[item.id] || ARMOR_DURABILITY[item.id] || BOW_DURABILITY;` con `public/constants.js:358` — `export const BOW_DURABILITY = 384;` y slots de adoquín `{id:8,count:N}` sin campo `durability` (visto en `tests/e2e-durabilidad.js:396`).
- Fase/bloque de TODO.md: Fase 15 — D3 (tooltip del hotbar), verificación manual pendiente.

### [CL-2] Desync de mascotas: el cliente ignora `sitting` y `state` del snapshot → el lobo/gato domado se renderiza de pie y animado aunque el servidor diga sentado (🟠 media)
- Archivo: `public/mobs.js:270-356` (`updateMobs`)
- Descripción: el servidor manda `ownerId`, `sitting` y `state` en cada snapshot de mob (`server/mobs.js:1577-1578`: `ownerId: m.ownerId || null, sitting: !!m.sitting`), y el E2E-mascotas lo verifica (`w.sitting === true`, `state === "sit"`). El cliente solo usa `ownerId` (para el collar rojo, línea 304) y nunca lee `sitting`/`state`: la mascota sentada sigue de pie, sin pose de sentado ni indicación de que dejó de seguir. Además `tame_ok` no tiene `case` en `public/network.js` (switch sin `default` → evento tragado en silencio), así que no hay feedback del éxito de la doma salvo el collar que aparece por `ownerId`.
- Impacto: la mecánica de mascotas de la Fase 12 (doma/sentarse) queda desincronizada visualmente con el estado autoritativo: tras `sit_pet` el usuario ve a su lobo de pie y "listo para seguir" mientras el servidor lo tiene sentado (y con `setMobWalk`, si el servidor manda micro-jitter de posición, hasta haría la animación de caminar). El E2E 0/19 usa WS crudo contra el servidor, así que este desync de render NO es la causa del fallo E2E — pero es el bug cliente de la misma mecánica.
- Evidencia: `public/mobs.js` — ni una referencia a `sitting`/`state` en todo el archivo vs `server/mobs.js:1577-1578` que los envía, y `tests/e2e-mascotas.js:356-372` que comprueba `sitting: true` y `state: "sit"` en `mobs_update`.
- Fase/bloque de TODO.md: Fase 12 — Lobo de taiga + domesticación / Ocelote → gato.

### [CL-3] `JSON.parse(e.data)` sin try/catch en el router de mensajes WS (robustez) (🟡 baja)
- Archivo: `public/network.js:82-83`
- Descripción: `socket.addEventListener("message", (e) => { const { event, data } = JSON.parse(e.data); ... })` no envuelve el parse (ni hay `default` en el switch). Un frame malformado (payload vacío, binario, truncado por proxy) lanza una excepción dentro del listener: el mensaje se pierde y el error queda sin rastro. La auditoría 2026-08-09 blindó el parse del lado servidor (TODO §"CRÍTICO 1.1 — guard de forma del mensaje WS + try/catch (net.js)") pero no el client-side.
- Impacto: un solo mensaje corrupto se descarta silenciosamente (no rompe la app, cada evento es independiente), pero cualquier desincronización futura entre ambos lados (p.ej. un evento nuevo que el cliente aún no maneja, como `tame_ok`) se traga sin aviso, dejando el HUD a medias sin pista para depurar.
- Evidencia: `public/network.js:83` — `const { event, data } = JSON.parse(e.data);` sin guard.
- Fase/bloque de TODO.md: Auditoría integral 2026-08-09 (§1.1, solo lado servidor).

### [CL-4] El fallo de `e2e-durabilidad` en "give-materiales" NO tiene origen en el cliente (aclaración verificada)
- Archivo: `tests/e2e-durabilidad.js:312-348` (el flujo que falla) — por eso no es un hallazgo de cliente.
- Descripción: la fase "give-materiales" solo toca protocolo crudo: envía `/give 7 3`, `/give 100 2`, espera `inventory_update` con `planks≥3 && sticks≥2`, y luego `grid_set` + `craft`. El cliente navegador (`public/ui.js`/`player.js`) no participa en ese diálogo en absoluto: `/give` es un comando de chat y `grid_set`/`craft` van directos por WS. La causa del timeout está en el servidor (ver sección 2 y 4: SV-1, SV-4 / REN-1).

---

# 2. Errores de implementación — Servidor

## Resumen

El código del servidor (commit da0b4c0) está en general sólido (guardia de forma WS, rate-limit, despawn, migraciones), pero se encontraron **3 bugs reales verificados** (combustible de horno infinito, `removeFromInventory` con stacks parciales, falta de validación de coords en la mayoría de handlers) y **3 debilidades** (guardado 100% síncrono en el hilo principal — candidato a los timeouts E2E, stacks >64 vía `/give`, `/tp` sin clamp de rango). Los E2E rojos de mascotas/templo **no** se explican por el código de mobs: el snapshot sí envía `ownerId`/`sitting`/`state:"sit"` (verificado) — la causa más probable de los timeouts es el bloqueo síncrono del event loop (SV-4).

## Hallazgos

### [SV-1] Horno con combustible infinito (SEVERIDAD: 🟠 media)
- **Archivo:** `server/crafting.js:205-208` + `server/net.js:854-865`
- **Descripción:** `add_fuel` guarda en `f.fuelItem` **solo el ID** (un número) tras consumir 1 unidad del inventario. En `tickFurnaces`, cuando `fuelTicksLeft` llega a 0, la recarga a 400 **no consume nada ni anula `fuelItem`**: no hay ningún contador ni stack que decrementar. Resultado: 1 unidad de carbón = el horno arde para siempre (recarga infinita), y además nunca se puede cambiar de tipo de combustible (`!f.fuelItem || f.fuelItem === slot.id`).
- **Impacto:** Economía/supervivencia rota: el horno nunca se apaga; la barra de combustible del cliente se vacía y se recarga cíclicamente (desincronización visual). Contradice la tarea Fase 14 P4 ("combustible del horno").
- **Evidencia:** `if (f.fuelTicksLeft <= 0 && f.fuelItem) { f.fuelTicksLeft = 400; }` — no hay `f.fuelItem--` ni `f.fuelItem = null` en todo el módulo (grep de `fuelTicksLeft` solo aparece aquí).
- **Fase/bloque:** Fase 0 (horno), Fase 14 P4.

### [SV-2] removeFromInventory falla si el primer stack del ítem no cubre la cantidad pedida (SEVERIDAD: 🟡 baja)
- **Archivo:** `server/players.js:270-286`
- **Descripción:** El bucle devuelve `false` en cuanto encuentra un stack del ítem con `count < pedido`, **sin seguir mirando stacks posteriores** (aunque uno posterior cubra la cantidad).
- **Impacto:** Latente porque `addToInventory` fusiona stacks del mismo id (SV-5), pero si algún flujo deja dos stacks fragmentados del mismo ítem (p. ej. transferencias cofre↔inventario o durabilidad), una retirada de count>1 fallaría a pesar de haber existencias suficientes — pérdida silenciosa de funcionalidad.
- **Evidencia:** `if (s.count > count) { s.count -= count; return true; } if (s.count === count) { player.inventory[i] = null; return true; } return false;` (líneas 274-282).
- **Fase/bloque:** Fase 0 (inventario).

### [SV-3] Handlers de acciones sin validar tipo/finitud de coordenadas — NaN pasa el guard de distancia (SEVERIDAD: 🟠 media)
- **Archivo:** `server/net.js:606` (y el mismo patrón en 1009 `till`, 1030 `plant`, 1163 `bucket_use`, 1328 `bonemeal`)
- **Descripción:** No existe guardia global de `Number.isFinite` y `block_action`/`till`/`plant`/`bonemeal`/`bucket_use` usan `data.x/y/z` directamente: `Math.hypot(x - p.x, …) > 7` con `x`/`y`/`z` = `undefined`, `NaN` o un objeto da `NaN > 7 === false`, con lo que el chequeo de distancia **se pasa siempre**. El handler `move` sí valida (`typeof x !== "number" …`, líneas 431-435); los de acciones, no.
- **Impacto:** Con `y = NaN`, `setBlock` (world.js:1532-1541) supera el rango de Y (NaN comparado es false) y escribe en `chunk[idx(x, NaN, z)]` (índice NaN → propiedad basura) marcando el chunk sucio; con `x/z` NaN, `generateChunk(NaN, NaN)` crea una entrada de chunk fantasma con clave `"NaN,NaN"` que se persiste como archivo `NaN,NaN.json`. No requiere autenticación (cliente modificado). No corrompe el proceso, pero contamina el estado y el disco.
- **Evidencia:** `case "block_action": { const { action, x, y, z, itemId } = data; if (Math.hypot(x - p.x, y - p.y, z - p.z) > 7) return; … }` — sin `typeof`/`Number.isFinite` previo.
- **Fase/bloque:** Fase 0 (validación de entrada), Auditoría 2026-08-09 §1.1 (parcialmente cubierta).

### [SV-4] Guardado 100% síncrono en el hilo principal cada 30 s (SEVERIDAD: 🟠 media)
- **Archivo:** `server/world.js:745-767` (`atomicWrite` + `zlib.gzipSync`), `server/save.js:103-126` (`saveWorld`), `server/server.js:88` (`setInterval(save.saveWorld, …)`)
- **Descripción:** `saveWorld` recorre `dirtyChunks` y por cada uno hace `gzipSync(json)` + `writeFileSync(tmp)` + `renameSync` (además de `copyFileSync` del `.bak` y `JSON.stringify(buildMeta())` con todos los mobs/hornos/cofres). Todo síncrono, en el bucle principal, cada 30 s.
- **Impacto:** Con muchos chunks sucios (generación de radio de render, TNT, talas, `set_seed`), un solo guardado puede bloquear el event loop cientos de ms o segundos; durante ese bloqueo no se procesan mensajes WS ni ticks. Es el candidato más verosímil para los timeouts E2E (180 s en `give-materiales`, 30 s en `watch`): el servidor "no responde" aunque está vivo. Nota: la escritura **sí** es atómica por chunk (tmp+rename) y hay `.bak` — el problema es solo la sincronía, no la integridad.
- **Evidencia:** `fs.writeFileSync(tmp, data); fs.renameSync(tmp, file);` (world.js:745-746) y `world.writeChunkFile(key, arr)` en bucle (save.js:106) llamada desde un `setInterval` (server.js:88).
- **Fase/bloque:** Fase 0 (persistencia cada 30s), Fase 1 (guardado incremental).

### [SV-5] /give permite crear stacks de hasta 999 (sin tope de 64) (SEVERIDAD: 🟡 baja)
- **Archivo:** `server/commands.js:319` + `server/players.js:59-68`
- **Descripción:** `/give` limita la cantidad a 999 (`Math.min(999, …)`) y valida el ID (`parseId` contra `ALL_IDS`), pero `addToInventory` apila sin límite: `player.inventory[i].count += count` con el comentario explícito "sin límite de stack, simplificado". `/give diamante 999` → un único slot con count 999.
- **Impacto:** Inconsistencia con la convención MC (64) y con lo que el cliente renderiza/cuenta; combinado con SV-2, un stack de 999 solo se puede retirar entero de una vez (o en pedidos parciales que fallan). Es una simplificación **documentada** en el código, pero agrava SV-2 y la paridad.
- **Evidencia:** `const count = Math.max(1, Math.min(999, parseInt(args[1], 10) || 1));` → `addToInventory(player, id, count)` → `player.inventory[i].count += count;` (sin comprobar 64).
- **Fase/bloque:** Fase 6 (consola de comandos), Fase 13 (paridad).

### [SV-6] /tp valida formato pero no rango frente a los límites del mundo (SEVERIDAD: 🟡 baja)
- **Archivo:** `server/commands.js:226-237`
- **Descripción:** La regex `^-?\d+(\.\d+)?$` descarta `Infinity`/`NaN`/notación `e`, pero admite números arbitrariamente grandes. A diferencia del handler `move` (net.js:448-450), que sujeta a `worldHalfExtent`, `/tp` no clampa `tx/tz` y llama `world.ensureChunksAround(fx, fz, 1)` (generación de chunks) con esas coordenadas.
- **Impacto:** `/tp 999999 64 0` fuerza generación de chunks fuera del mundo (coste síncrono — ver SV-4) y, al moverse, el anti-cheat sujeta al borde dejando al jugador "clavado" en la frontera. No corrompe datos (los sólidos/movimiento sujetan), pero es un agujero de validación de rango.
- **Evidencia:** `if (args.length < 3 || args.some((a) => !/^-?\d+(\.\d+)?$/.test(a)))` … sin `Math.min/Math.max` contra `worldHalfExtent` antes de `world.ensureChunksAround(fx, fz, 1)`.
- **Fase/bloque:** Fase 6 (comandos), Fase 10 (`/tp` lejano).

## Inconsistencias servidor-cliente

- **Combustible del horno (SV-1):** el servidor recarga `fuelTicksLeft` a 400 sin consumir; el cliente (barra de combustible del horno) presumiblemente anima el agotamiento y verá la barra "volver" infinitamente — desincronización directa de un valor de estado que viaja en `furnace_state`.
- **Stacks >64 (SV-5):** un slot con `count: 999` viaja en `inventory_update`; no se verificó en `public/` si la UI lo recorta o lo muestra entero — riesgo de desajuste visual/contable.
- **Verificado consistente:** los IDs de bloques/ítems, `EYE_HEIGHT` y constantes compartidas están sincronizados (`tests/unit-sync.js` en verde en la línea base); no hay desajustes de constantes que reportar.

## Áreas revisadas sin problemas

- **Mobs/mascotas (punto 4):** verificado — `mobSnapshot` envía `ownerId` y `sitting` (`server/mobs.js:1577-1578`); el estado `"sit"` se asigna en `tickPet`/`tickCat` cuando `this.sitting` (mobs.js:1006, 1028); `sit_pet` (net.js:1401-1407) valida propiedad (`mob.ownerId !== p.id → return`) y alterna `mob.sitting` (mobs.js:1425-1426); la persistencia guarda `ownerId/ownerName/sitting` (save.js:72-74) y restaura (mobs.js:1729-1731) con re-vinculación por `ownerName` al conectar (net.js:328-349). El fallo del E2E-mascotas 0/19 no está en este código.
- **Bucle de tick:** paso lineal acotado (`for (const m of state.mobs) if (m.alive) m.tick(isNight)`, net.js:1613), despawn por distancia con tope de spawn (30 mobs), pathfinding incremental por tick (`moveToward` 0.05/tick), relleno de chunks limitado a `CHUNK_FILL_PER_TICK` — **sin bucles infinitos ni pathfinding bloqueante**.
- **Persistencia:** escritura atómica por chunk (tmp+rename), `.bak` de `world.json` antes de sobrescribir, `schemaVersion` 5 con rechazo de versiones más nuevas y migraciones retrocompatibles (v1→chunks, layout por semilla) — todo en orden (salvo la sincronía de SV-4).
- **Validación defensiva:** guardia de forma del mensaje WS (net.js:386-394), rate-limit por conexión (405-423), `maxPayload`, gate `OP_ONLY` para comandos de operador (commands.js:178), `move` con `typeof` + clamp de bordes, y `world.json` ilegible que restaura el `.bak` (save.js:172-184).
- **/kill y /time set:** validados y con gate de operador según `OP_ONLY`.

---

# 3. Seguridad

## Resumen
El servidor está razonablemente endurecido: la auditoría previa (2026-08-09) ya corrigió los DoS de forma de mensaje, rate-limit, tope de conexiones, permisos de operador y path traversal en borrado de mundos, y `npm audit` da 0 vulnerabilidades. Quedan 4 hallazgos verificados: un bypass del anti-cheat de vuelo (speedhack horizontal + hover), un vector de llenado de disco/bloqueo del event loop vía `set_seed` en bucle, validación de tipos laxa en `block_action` (impacto limitado a auto-daño) y ausencia de headers de seguridad/CSP. Ninguno compromete la integridad de datos, el inventario ni permite RCE.

## Hallazgos

### [SEC-1] Bypass del anti-cheat de vuelo y speedhack horizontal (MEDIO 🟠)
- **Archivo:** `server/net.js:509-523` (y tope por-move en 451-461)
- **Descripción del vector:** Explotable con un cliente WebSocket hecho a mano sin tocar el juego: el anti-cheat de ascenso solo se evalúa si `y - p.y > 0` (línea 509). Un cliente que mantiene **altitud constante en el aire** (`y - p.y ≈ 0` mientras `inAir` es true) nunca dispara el teleport de corrección, ni por `vyObs > JUMP_SPEED * 1.5` ni por `airTimeMs > 1000` (que quedan inerte sin ascenso). Además, el límite horizontal es por-move (1.2 bloques) pero la tasa de mensajes permite 30 moves/s → ~36 bloques/s sostenidos (~6× el sprint legítimo).
- **Impacto:** Vuelo/hover y sobre-velocidad en supervivencia: alcanzar/escapar de mobs, minar "en volado" (los checks de distancia de `block_action`/`mining.tickMining` usan la posición reportada) y ventaja PvP. No compromete datos ni inventario (la física de mundo, drops y persistencia siguen siendo server-side): es una evasión del control anti-cheat documentado (Fase 8), no una corrupción de estado.
- **Evidencia:** `net.js:509` `if (inAir && y - p.y > 0 && p.gamemode !== "creative")`; la condición de teleport (514) está dentro de ese bloque. El `dist > 1.2` (452) se comprueba contra el move individual, no contra una velocidad esperada.
- **Fase/bloque de TODO.md:** Fase 8 — mejora anti-cheat (validar también el ascenso sostenido con `airTimeMs` independiente del signo de `dy`, y un límite de velocidad horizontal por tiempo, p. ej. bloques/s sobre ventana deslizante).

### [SEC-2] Llenado de disco y bloqueo síncrono del event loop vía `set_seed` en bucle (MEDIO 🟠)
- **Archivo:** `server/net.js:924-995` (handler `set_seed`, en especial 930-931 y 991), `server/world.js:1334`, `server/save.js:103-109, 287`
- **Descripción del vector:** Un cliente no-operador (requiere ser el ÚNICO jugador en línea: `state.players.size > 1` → rechazo en 931) puede alternar semillas nuevas en bucle. Cada `set_seed` con semilla nueva genera **síncronamente** hasta (2·10+1)² = 441 chunks vía `ensureChunksAround(p.x, p.z, p.renderDistance)` (línea 991, con `renderDistance` subible a 10 por `settings`). Como `generateChunk` marca **todos** los chunks generados como dirty (`world.js:1334`: "la generación usa Math.random, así que se persiste"), el autosave escribe ~441 archivos gzip (~3-8 MB) por semilla, y `switchWorld` fuerza `saveWorld()` síncrono en cada cambio (`save.js:287`).
- **Impacto:** (a) Crecimiento de disco **persistente** (los directorios `world/<semilla>/` sobreviven a la sesión del atacante): cientos de semillas en ~10-30 minutos llenan el disco y ponen en riesgo el guardado de mundos legítimos (fallo de `saveWorld` = pérdida de progreso). (b) Bloqueo del event loop de segundos por ciclo (generación de 441 chunks + serialización del init de hasta ~14 MB en `sendInit`), congelando el servidor para todos. No hay tope de switches por unidad de tiempo (el rate-limit de 30 msgs/s no aplica porque cada ciclo ya tarda segundos).
- **Evidencia:** `world.js:1334` (dirty en generación), `net.js:991` (radio de generación tras `r === true`), `save.js:103-109` (escritura de dirtyChunks en `saveWorld`).
- **Fase/bloque de TODO.md:** Fase 9 — Bloque B (menú de mundos) o Fase 6 (cambio de semilla): añadir cooldown/cuota de `set_seed` por jugador (p. ej. 1 cambio/10 s) y no marcar dirty los chunks recién generados salvo modificación real.

### [SEC-3] Validación de tipos laxa en `block_action` (y handlers afines) (BAJO 🟡)
- **Archivo:** `server/net.js:604-675` (`block_action`); afecta a `till` (1003), `plant` (1025), `bonemeal` (1323), `bucket_use` (1155), `door_use` (1197)
- **Descripción del vector:** A diferencia del handler `move` (que exige `typeof x/y/z === "number"`, líneas 430-435), `block_action` usa `x/y/z` sin validar tipo/finitud. `JSON` no serializa `NaN` (se convierte en `null` y lo descarta la guardia de forma 386-394), pero **strings** como `"NaN"` o `"foo"` sí llegan: `Math.hypot("NaN" - p.x, ...)` = NaN y `NaN > 7` es `false` → pasa el chequeo de distancia. Impacto verificado ruta a ruta:
  - `place` con coords inválidas: `world.getBlock` devuelve AIR (chunk `"NaN,NaN"` inexistente) → pasa el chequeo de aire → `world.setBlock` **falla** en `inBounds(NaN, NaN)` (`world.js:895-898`) → no se coloca nada, pero `removeFromInventory` **sí consume el ítem** → un atacante solo se quema sus propios recursos (auto-daño).
  - `till`/`plant`/`bonemeal`/`bucket_use`/`door_use`/`furnace_open`/`chest_open`: exigen un bloque concreto en la posición; con coords NaN `getBlock` devuelve AIR → `break`/`return` **antes** de mutar nada. `plant` NO llega a escribir la clave `"NaN,…"` en `state.crops`.
  - `break`: `NOT_MINEABLE` incluye AIR → bloqueado en survival; en creative es no-op (setBlock falla).
  - Sin crash: el try/catch global (1510) + `inBounds`/`getBlock` defensivos absorben cualquier resto.
- **Impacto:** Higiene defensiva deficiente; el peor caso verificable es la auto-quema de ítems y basura inerte de estado. Sin corrupción de `world.json`, sin duplicación, sin crash. Los strings numéricos (`"5"`) coercionan al mismo comportamiento que el número.
- **Evidencia:** `net.js:606` `const { action, x, y, z, itemId } = data;` sin validación, frente a `move` (431-434); `world.js:895-898` (`inBounds` con comparaciones que fallan ante NaN → `false`).
- **Fase/bloque de TODO.md:** Fase 6 — Bloque A (interacción de bloques): normalizar coords con `Number.isFinite` en todos los handlers que reciban `x/y/z`.

### [SEC-4] Sin headers de seguridad/CSP y dependencia del CDN unpkg (BAJO 🟡)
- **Archivo:** `server/net.js:191-192`, `public/index.html:9-16`
- **Descripción del vector:** `express.static` sirve **solo** `public/` (verificado: `world/` es hermana de `public/` y no está expuesta vía HTTP; no hay rutas estáticas adicionales). Pero no hay ninguna cabecera de seguridad (`Content-Security-Policy`, `X-Content-Type-Options`, etc.) y Three.js se importa desde `unpkg.com` sin SRI (importmap en `index.html:12-14`). Un compromiso del CDN (o DNS/MITM si se degradara a HTTP) inyectaría JS en **todos** los clientes que carguen la página.
- **Impacto:** No explotable hoy de forma directa: verificado que no existen sinks de `innerHTML` que reciban datos controlables por el jugador (chat → `textContent` en `ui.js:780-788`; nametags → canvas en `mobs.js:143-172`; `renderWorldsList` aplica `escapeHtml` a `name`/`seed`/`meta` en `ui.js:489-493`; hotbar/tooltip/cofres/horno/recetas/picker solo interpolar `itemVisual`/`itemLabel` con IDs validados del servidor, y `itemLabel` para IDs desconocidos devuelve `#<número>`, inofensivo). Es un hueco de hardening: la carga del CDN sin SRI/CSP es el riesgo principal de XSS futuro si alguien añade un sink.
- **Evidencia:** `net.js:192` única llamada a `app.use`; ausencia de cabeceras CSP en `index.html` y de middleware tipo `helmet` en el arranque.
- **Fase/bloque de TODO.md:** Sin fase asignada (mantenimiento/endurecimiento); sugerir servir `three.module.js` local (ya previsto en `AGENTS.md`) y añadir CSP.

## Resultado de npm audit
`npm audit --omit=dev` → **0 vulnerabilidades** (exit 0). Dependencias de producción: `express@4.22.2`, `simplex-noise@4.0.3`, `uuid@14.0.1`, `ws@8.21.3` (dev: `@biomejs/biome@2.5.6`, `three@0.160.1`). Ninguna dependencia con aviso conocido; `ws@8.21.3` cubre los CVEs de `ws` reportados en versiones anteriores.

## Áreas revisadas sin problemas
- **Forma y límites de mensajes WS:** `JSON.parse` en try/catch + guardia que exige `event` string y `data` objeto no-null/no-array (`net.js:374-394`); todo el switch dentro de try/catch (1510); `maxPayload` 1 MiB explícito (`net.js:1770`, `constants.js:89`); `MAX_CONNECTIONS = 10` (`net.js:231`); rate-limit 30 msgs/s con ventana deslizante y cierre 1008 (`net.js:405-424`).
- **Path traversal y persistencia:** `seedDir()` sanea a `[a-z0-9_-]` máx 40 chars (`constants.js:94-102`); `deleteWorld` exige op (`net.js:1087`), valida `path.resolve` + `startsWith(root + sep)` y rechaza el mundo activo (`save.js:563-595`); rutas de chunks numéricas; escritura atómica temp+rename (`world.js:743-747`), `.bak` de `world.json` por guardado y rechazo de `schemaVersion` futuro; `set_seed`/`switchWorld` sanean nombre (`sanitizeWorldName`), modo (`sanitizeGamemode`) y tamaño (`sanitizeWorldSize`); `switchWorld` aborta si falla el guardado previo (integridad).
- **Autorización:** `OP_ONLY` (`commands.js:122-130,178`) protege `/tp /give /time /gamemode /reload /op /kill`; `world_delete` exige `isOp`; modelo de operador documentado (primer jugador conectado o env `OPS`, `net.js:256-269` — sin autenticación, fuera de alcance según `AGENTS.md`). El gate se aplica en el servidor, no en el cliente.
- **Anti-cheat de movimiento (parcial):** tope 1.2 bloques/move, rechazo de sólidos por forma (`isSolidAt`), clamp a bordes del mundo (`worldHalfExtent`), `VOID_Y`, daño de caída por trayectoria + `vyObs`/`fallVy` (`players.js:445-500`), anti-vuelo por parábola (con el bypass de SEC-1).
- **Economía/inventario:** crafteo usa SIEMPRE la grid del servidor (sin duplicación; `net.js:677-707`); `grid_set`/`chest_action`/`furnace_action` con slots fuera de rango/no numéricos → `undefined` → return (sin lectura fuera de bounds); `creative_pick` validado contra catálogo; `/give` contra `NAME_TO_ID` + rechazo de `NOT_MINEABLE`; distancias re-validadas en cofres/hornos (7) y mobs (4-7); la minería re-checa distancia y bloque en cada tick (`mining.js:47-53`).
- **Exposición de datos:** `otherPlayers` serializa solo `{id, name, x, y, z}` (`net.js:183-185`); `mobSnapshot`/`arrowSnapshot` son proyecciones, no objetos internos; el `init` no filtra `isOp`, sockets ni flags internos.
- **XSS:** chat y mensajes de sistema por `textContent`; nametags por canvas; lista de mundos con `escapeHtml` en todos los campos interpolados (`ui.js:489-493`); resto de `innerHTML` con datos internos/validados.
- **Acotación del mundo (DoS de disco, fuera de `set_seed`):** movimiento y generación bajo demanda limitados a `worldHalfExtent()`; `setBlock` rechaza fuera de bounds; `unloadFarChunks` libera memoria; `/tp` fuera de bordes queda restringido a operadores.

---

# 4. Rendimiento

## Resumen

El servidor tiene dos puntos críticos reales: un **guardado 100 % síncrono cada 30 s** que congela el bucle de 20 Hz (candidato principal a los timeouts E2E de 180 s/30 s observados) y una **fuga permanente de hornos** que degrada el tick O(H×J). El `settings` de radio de render manda decenas de MB en un solo mensaje al ampliar la distancia, pero es un evento puntual. El cliente ya está bien optimizado: worker + greedy meshing, LOD con histéresis, pool de geometrías y throttle de `move` a 20 Hz.

## Hallazgos

### [REN-1] Guardado del mundo 100 % síncrono cada 30 s en el event loop (IMPORTANCIA: 🔴 alta)

- **Ubicación:** `server/server.js:88` (`setInterval(save.saveWorld, SAVE_INTERVAL_MS)`); `server/constants.js:18` (`SAVE_INTERVAL_MS = 30000`); `server/save.js:93-109` (bucle sobre `dirtyChunks`); `server/world.js:743-746` (`atomicWrite`: `fs.writeFileSync(tmp)` + `fs.renameSync`) y `:767` (`zlib.gzipSync(json)` por chunk sucio); `server/save.js:118` (`fs.copyFileSync(P.metaFile, .bak)`) y `:126` (`world.atomicWrite(P.metaFile, JSON.stringify(buildMeta(), null, 2))`).
- **Descripción:** el guardado periódico no es asíncrono ni va a un worker: por cada chunk sucio hace `gzipSync` (CPU) + `writeFileSync` + `renameSync` (I/O bloqueante) en el hilo principal, y además copia el `.bak` y serializa el meta con `JSON.stringify`. Tras una sesión que ensucia muchos chunks (minar, sembrar, romper bloques → `dirtyChunks.add` en `world.js:855` y `net.js:1658`), el ciclo de los 30 s puede congelar el bucle del tick durante cientos de ms o segundos: durante esa ventana no avanzan mobs, ni movimiento, ni respuestas WS de ningún jugador.
- **Impacto medible estimado:** con ~50-100 chunks sucios, 50-150 ms de congelación (gzip de ~16 KB × destino + escritura síncrona); con un radio de 10 llenándose de golpe, hasta varios segundos. Es la explicación más plausible de los **timeouts E2E** (30 s en `e2e-reload.js:35`/`e2e-comer.js:103`, 180 s en `e2e-durabilidad.js:95`): el cliente de test deja de recibir `chunks_add`/respuestas durante la escritura y expira.
- **Evidencia citada:** `server/world.js:743-746,767`, `server/save.js:93-126`, `server/server.js:88-89`.
- **Fase/bloque de TODO.md:** Fase 1 «Guardado incremental por chunk» (base sin revisión posterior de rendimiento; tocaría `save.js` + `world.js atomicWrite`).

### [REN-2] Hornos: bucle O(furnaces × jugadores) por tick + nunca se eliminan de memoria ni del world.json (IMPORTANCIA: 🟠 media)

- **Ubicación:** `server/net.js:1723-1736` (`crafting.tickFurnaces()` + bucle anidado horno→jugadores); `server/crafting.js:198-230` (cuerpo de `tickFurnaces`).
- **Descripción:** cada tick se itera `state.furnaces` y, por cada horno, se recorre TODOS los jugadores comprobando `p.openFurnace === key` (`net.js:1726`); si alguno lo tiene abierto, recibe `furnace_state` a 20 Hz. Además `furnaces.delete` no existe en todo el repo: solo `furnaces.clear()` (`crafting.js:233` en `restoreFurnaces`, `save.js:297` al cambiar de mundo). Un horno roto queda para siempre en memoria **y se persiste en `world.json`**, engordando cada guardado (REN-1) y el coste O(H×J) del tick.
- **Impacto medible estimado:** con H hornos abandonados, H×J comprobaciones + hasta J mensajes por tick (20 Hz); la fuga es permanente y crece con las sesiones (un horno más por cada base abandonada). El coste unitario es pequeño, pero nunca decrece.
- **Evidencia citada:** `server/net.js:1724-1736`; ausencia de `furnaces.delete` (grep: solo `clear()` en `crafting.js:233` y `save.js:297`).
- **Fase/bloque de TODO.md:** Fase 3/4 (hornos de fundición) — sin bloque de limpieza/rendimiento posterior.

### [REN-3] `settings`: al ampliar el radio se reenvía el radio completo como `Array.from` de cada chunk en un solo mensaje (IMPORTANCIA: 🟠 media)

- **Ubicación:** `server/net.js:567-602` (handler `settings`), especialmente `:578-589` (`fresh` + doble bucle del radio completo con `Array.from(state.chunks.get(key))`) y `:592-596` (`JSON.stringify` + `ws.send` de `chunks_add`).
- **Descripción:** **sí hay throttling de disparo** — solo actúa cuando cambia `renderDistance` (`net.js:576`: `clamped !== p.renderDistance`), no por frame, y el comentario de `:568-572` confirma que el reenvío es intencional (el cliente descartó los chunks lejanos). Pero el **mensaje** no está fragmentado ni limitado: cada chunk se convierte a `Array.from` (16 384 números) y todo el radio se manda en un único `chunks_add`. Con r=10 son 441 chunks → ~7,2 M de números → decenas de MB de JSON.
- **Impacto medible estimado:** `JSON.stringify` de decenas de MB bloquea el event loop cientos de ms (agravando REN-1 si coinciden); el cliente parsea y hornea 441 chunks de golpe (ráfaga de trabajo, no progresiva como el relleno de la Fase 14). Es puntual (solo al cambiar el ajuste), no recurrente.
- **Evidencia citada:** `server/net.js:576-598`.
- **Fase/bloque de TODO.md:** Fase 7 (ajustes de render) — el relleno progresivo (Fase 14 M5/C5) no cubre este camino.

### [REN-4] `sendInit` itera todos los chunks en memoria al conectar (IMPORTANCIA: 🟡 baja — ya mitigado en payload)

- **Ubicación:** `server/net.js:128-135`.
- **Descripción:** la iteración recorre `state.chunks` completo, pero el payload ya se filtra por radio Chebyshev (`:130-133`) — el propio comentario de `:121-125` documenta que antes se enviaba todo el mundo (~13 MB con 795 chunks) y que eso se corrigió en la Fase 7. El `Array.from` + envío solo aplica a los del radio; como `unloadFarChunks` (`server.js:89`, `save.js:505-532`) acota los chunks en memoria, el iterado es pequeño (≈ radio² por jugador).
- **Impacto medible estimado:** despreciable en la práctica (una pasada de Map sobre chunks cargados por conexión). Se descarta como problema: `Array.from` de ~169 chunks al conectar es la única carga real.
- **Evidencia citada:** `server/net.js:121-135`.
- **Fase/bloque de TODO.md:** Fase 7 (auditoría de init) — ya corregido en su momento; sin acción pendiente.

### [REN-5] Relleno del radio: escaneo O(r²) + sort por jugador y tick (IMPORTANCIA: 🟡 baja)

- **Ubicación:** `server/net.js:1698-1718`.
- **Descripción:** cada tick y jugador se reconstruye la lista `missing` recorriendo el radio Chebyshev completo (`:1699-1705`) y se ordena por anillo (`:1706`). El coste es acotado: 441 claves a r=10, el `sort` solo corre mientras queden chunks sin generar, y cada tick solo se generan `CHUNK_FILL_PER_TICK` (`:1708`). Una vez lleno el radio, queda un coste fijo de ~441 `Map.has` por jugador y tick. Es el diseño progresivo de la Fase 14 (M5/C5), ya pensado para no bloquear.
- **Impacto medible estimado:** ~441 búsquedas en Map por tick y jugador (< 20 µs) una vez estable; el sort es n ≤ 441 durante el relleno. No es un problema; se reporta para que conste que el coste es O(r²) constante, no O(chunks en memoria).
- **Evidencia citada:** `server/net.js:1698-1718`.
- **Fase/bloque de TODO.md:** Fase 14 (M5/C5) — correcto tal cual.

### [REN-6] Diff de mobs: serialización completa de `mobSnapshot` por tick, broadcast solo si cambia (IMPORTANCIA: 🟡 baja)

- **Ubicación:** `server/net.js:1632-1638`.
- **Descripción:** cada tick se hace `state.mobs.map(mobs.mobSnapshot)` + `JSON.stringify` (`:1633-1634`) y solo se hace broadcast si el JSON cambió (`:1635-1637`). Es estado completo (no diffs por mob), pero el cambio-detección amortiza el envío y el tamaño está acotado por el tope de spawn y por el despawn a 128 bloques (`:1621-1631`). Es la optimización «snapshot 1/tick, broadcast solo si cambia» de la Fase 13 (A4, `unit-perf-server.js`).
- **Impacto medible estimado:** costo de snapshot + stringify de 30-60 mobs por tick (decenas de KB), constante con el número de jugadores (broadcast global), no por-jugador. Escalaría solo si se sube el tope de mobs o se quita el despawn.
- **Evidencia citada:** `server/net.js:1619-1638`.
- **Fase/bloque de TODO.md:** Fase 13 (A4) — ya optimizado; sin acción pendiente salvo un diff granular por mob si el tope crece.

### [REN-7] Cliente: `bakeChunkLight`/`hasTorchNear` recorren todo `torchSet` por chunk horneado (IMPORTANCIA: 🟠 media)

- **Ubicación:** `public/world.js:871-903` (`bakeChunkLight`, citado en `docs/auditoria-2026-08-09.md` §4.7) y `~:955` (`hasTorchNear`); luz por celda en `public/lighting.js:124-157` (`computeChunkLight`, que ya reutiliza un scratch de módulo para no alocar por antorcha).
- **Descripción:** al hornear un chunk se recorre `torchSet` completo para filtrar antorchas en la caja de radio (O(antorchas totales) por bake), y `hasTorchNear` hace lo mismo por consulta. El coste no es por frame (solo al hornear/rebuild/LOD), pero `torchSet` crece con cada antorcha colocada en el mundo y su limpieza no está garantizada al descargar chunks (a diferencia de `cracks`, corregido en la auditoría §3.6).
- **Impacto medible estimado:** con miles de antorchas (sesiones largas con bases iluminadas), cada bake de chunk al explorar/LOD cuesta O(torchSet) → ralentización visible del relleno de radio en zonas con mucha luz artificial. Ya está documentado como pendiente a conciencia («índice espacial de `torchSet`») en la auditoría §4.7.
- **Evidencia citada:** `docs/auditoria-2026-08-09.md` §4.7 (`public/world.js:871-903`), `public/lighting.js:124-157`.
- **Fase/bloque de TODO.md:** Fase 6 (antorchas/luz) / Fase 14 (M4 `hasTorchNear`) — pendiente conocido, sin bloque asignado.

## Puntos fuertes / patrones ya optimizados

- **Throttle de `move` a 20 Hz** en el cliente (`public/player.js:370-381`): no se envía posición por frame.
- **Worker + greedy meshing**: la geometría de chunks se construye en un worker ESM (`public/chunkWorker.js` → `buildChunkGeometryData`, `public/chunkGeometry.js:164`) con greedy 2D por capas y clave de fusión que incluye luz cuantizada y AO; el hilo principal no genera mallas.
- **Pool de geometrías GPU real**: `public/geopool.js` reutiliza `BufferGeometry` y sus atributos (`setOrReuseAttribute`) en vez de crear/destruir en cada rebuild; `unit-geopool.js` lo verifica.
- **Culling + LOD con histéresis**: `public/lod.js` (LOD_ON_DIST 56 / LOD_OFF_DIST 44) y culling de chunks por radio en `public/world.js`.
- **Nubes sin re-upload por frame**: tinte cuantizado a pasos de 0.03, solo se re-suben colores al cambiar (`public/clouds.js`, auditoría §4.6).
- **`dispose()` correcto** de geometrías/materiales/nametags de mobs, partículas y jugadores remotos (`public/mobs.js` `disposeMesh`) y de grietas al descargar chunks (auditoría §3.5/3.6 corregidas).
- **Topes anti-flood en red**: `MAX_CONNECTIONS = 10`, rate-limit `MAX_MSG_RATE = 30/s`, `maxPayload` 1 MiB (auditoría §3.1 corregida), radio de render 2-10.
- **Servidor**: tope de mobs + despawn a 128 bloques (`net.js:1621-1631`), `unloadFarChunks` cada 10 s con guardado previo de los chunks sucios (`save.js:528-532`) → memoria de chunks y `dirtyChunks` acotados, relleno de radio progresivo por lotes (Fase 14), broadcast de mobs con cambio-detección.

## Áreas revisadas sin problemas

- **`sendInit`**: el payload ya está filtrado por radio (no se envía el mundo completo; `net.js:121-135`).
- **Memoria de chunks en server**: acotada por `unloadFarChunks` (`save.js:505-532`), que guarda antes de descargar y limpia `dirtyChunks`.
- **Proyectiles/flechas**: `tickArrows` con limpieza; cofres y cultivos se eliminan al romper (`players.js:97,133`, `tnt.js:77`, `mobs.js:665`).
- **Cliente — partículas**: pool simple, sin alocar por frame.
- **Luz de antorcha por celda**: BFS con caja local (2R+1)³ y `scratch` reutilizado por módulo (`lighting.js:48`) — no aloca por antorcha.
- **Crafteo de la grid**: server-side (`craftingGrid` como única fuente de verdad), sin validación costosa por mensaje.

## Recomendado perfilar en vivo (node --prof / CDP)

1. **Guardado (REN-1)**: instrumentar `save.saveWorld` con `perf_hooks` midiendo duración media/máxima del ciclo de 30 s y el jitter del tick (`__mcServerTickMs`) justo después; reproducir un mundo con 100+ chunks sucios. Hipótesis a confirmar: relación directa pico-de-guardado ↔ timeouts E2E (180 s `e2e-durabilidad.js:95`, 30 s `e2e-reload.js:35`/`e2e-comer.js:103`).
2. **`settings` r=10 (REN-3)**: medir tiempo de `JSON.stringify` del `chunks_add` gigante y el tamaño del mensaje; en el cliente, `performance.mark` alrededor del parse+horneado de los 441 chunks.
3. **Hornos (REN-2)**: forzar H=50-100 hornos abandonados (y uno abierto) y medir el coste del bucle `net.js:1724-1736` y los `furnace_state` a 20 Hz con `node --prof`.
4. **`bakeChunkLight`/`hasTorchNear` (REN-7)**: colocar 2000+ antorchas y medir el tiempo de bake al explorar con el profiler del navegador (categoría «Function»); valorar si `torchSet` crece tras descargar chunks (posible fuga adicional).
5. **Mobs (REN-6)**: con 30-60 mobs, medir en `node --prof` la suma de `mobSnapshot` + `JSON.stringify` dentro de `mainLoop` (verificar que es < 1 ms/tick).
6. **E2E**: reproducir los timeouts con el servidor bajo `node --prof` y cronología de latencia WS (timestamp de cada respuesta) para confirmar que la congelación coincide con el `setInterval` de 30 s.

---

# 5. Paridad con Minecraft

## Resumen
Auditoría de solo lectura (commit `da0b4c0`) comparando `server/constants.js`, `public/constants.js`, `server/mobs.js`, `server/crafting.js`, `recetas.json`, `recetas_horno.json` y los tests de paridad (`unit-paridad.js`, `unit-lagunas.js`) contra la tabla de referencia de Minecraft Java. La mayoría de los **valores numéricos** (durabilidad, daño de espada, armadura, dureza, XP, comida, salud de mobs) coinciden exactamente y están fijados por tests. Los desvíos relevantes son **mecánicas faltantes o filtradas**: combustible del horno indiferenciado y barato, ausencia de drops de zombi/creeper, y varios detalles menores (puertas ×1 en vez de ×3, tiempo de fundido del vidrio, carbón vegetal, XP del slime mediano/lobo). Los desvíos de diseño (salto 1.36, hacha=espada, explosiones, mundo de −64..+63) están documentados como intencionales en `docs/auditoria-2026-08-09.md` y `docs/reporte-paridad.md`.

## Tabla de discrepancias priorizada

| # | Mecánica | Mi Minecraft | Minecraft (Java/Bedrock) | Severidad (🔴/🟠/🟡) | Tipo (intencional/bug) | Ref. en docs/ o tests |
|---|---|---|---|---|---|---|
| 1 | Combustible del horno | 400 ticks (20 s = 2 ítems) **igual para todos** (carbón, palo, tablas, troncos) | carbón 1600 t (8 ítems), palo 100 t (0.5), tablas/troncos 300 t (1.5) | 🟠 | bug (sin documentar) | `server/crafting.js:207`; `server/constants.js:442-450` |
| 2 | Drops de zombi y creeper | Ninguno (no existen ítems `ROTTEN_FLESH` ni `GUNPOWDER`) | zombi 0-2 carne podrida; creeper 0-2 pólvora | 🟠 | bug (laguna conocida) | `server/mobs.js:1588-1614` (solo comida + secundarios); `docs/reporte-paridad.md:132` |
| 3 | Puerta de madera/hierro (crafteo) | 6 tablas/lingotes → **1 puerta** | 6 → **3 puertas** (resultado triplicado) | 🟡 | bug | `recetas.json:813-826,827-840` (`count: 1`) |
| 4 | Fundido arena→vidrio | 150 ticks (7,5 s) | 200 ticks (10 s) | 🟡 | bug | `recetas_horno.json:5` |
| 5 | Carbón vegetal | No hay receta tronco→carbón (los troncos solo arden) | 1 tronco → 1 carbón vegetal | 🟡 | bug/laguna | `recetas_horno.json` (ausencia de clave tronco→101) |
| 6 | Fases del ciclo día/noche | binario: 10 min día / 10 min noche (`isNight = time > 600000`); crepúsculo solo visual | día 10, atardecer 1.5, noche 7, amanecer 1.5 (noche oscura ~7 min) | 🟡 | aproximación (comentada) | `server/net.js:1612`; `server/constants.js:22` |
| 7 | XP del slime mediano | 1 XP | 2 XP (grande 4, mediano 2, pequeño 1) | 🟡 | bug | `server/mobs.js:29-32` (`mobXp`); `server/constants.js:881` |
| 8 | XP del lobo | 8 XP | 1-3 XP | 🟡 | bug | `server/constants.js:873` |
| 9 | Profundidad de minerales | diamante y ←20, hierro y ←12 (mundo −64..+63) | diamante y<16, hierro y<64 (mundo 0..320, superficie ≈63) | 🟡 | aproximación | `server/world.js:1033-1038` |
| 10 | Zanahoria/patata como comida | no comestibles (solo cría/creativo) | zanahoria 3, patata 1, patata al horno 5 | 🟡 | intencional (agricultura solo trigo) | `docs/reporte-paridad.md:65`; `server/constants.js:456-472` |

## Discrepancias detalladas

### [PAR-1] El horno quema todo con el mismo combustible genérico de 400 ticks
- **Qué hace Mi Minecraft:** `server/crafting.js:207` asigna `f.fuelTicksLeft = 400` por unidad de combustible, **sin discriminar el ítem**. Con recetas de 200 ticks, cada combustión funde exactamente 2 ítems. El set `FUEL_ITEMS` (`server/constants.js:442-450`) acepta troncos, tablas, carbón y palos por igual.
- **Qué hace Minecraft:** el valor calorífico depende del combustible: carbón 1600 ticks (8 ítems), palo 100 ticks (0.5 ítems, ~5 s), tablas y troncos 300 ticks (1.5 ítems).
- **Intencional o bug:** bug (no hay spec ni comentario que declare esta simplificación; el único comentario, Fase 14, solo dice "el carbón también arde").
- **Evidencia:** `server/crafting.js:207`; `server/constants.js:442-450`; tiempos de receta de 200 ticks en `recetas_horno.json:2-11`. Ningún test de `tests/unit-*.js` fija tiempos de combustión.
- **Fase/bloque de TODO.md:** sugerir "Fase 16 (Paridad): tabla `FUEL_TICKS` por ítem (carbón 1600, palo 100, tablas/tronco 300) + test".

### [PAR-2] Zombis y creepers no sueltan nada al morir
- **Qué hace Mi Minecraft:** `server/mobs.js:1588-1614` define `FOOD_DROPS` (pasivos) y `OTHER_DROPS` (araña→hilo, vaca/conejo→cuero, esqueleto→hueso+flecha, pollo→pluma, slime→slimeball, ahogado→tridente). **No hay entradas para `zombie` ni `creeper`**; `mobDrops` (líneas 1619-1643) devuelve `null`, y no existen los ítems carne podrida ni pólvora en `I` (`server/constants.js:264-376`).
- **Qué hace Minecraft:** zombi suelta 0-2 carne podrida; creeper 0-2 pólvora (usada para la receta de TNT).
- **Intencional o bug:** bug; es una laguna conocida y sin corregir de la Fase 13. `docs/reporte-paridad.md:132` lo lista como pendiente: "Faltan drops de hostiles (pólvora, carne podrida, flechas...) y la mayoría de mobs" — solo las flechas del esqueleto y plumas se añadieron (Fase 13 L1).
- **Evidencia:** `server/mobs.js:1588-1614` y `:1619-1643`; ausencia de los ítems en `server/constants.js:264-376`; `docs/reporte-paridad.md:132`.
- **Fase/bloque de TODO.md:** sugerir "Fase 16 (Paridad): ítems carne podrida y pólvora + drops zombi/creeper (0-2) + receta TNT con pólvora".

## Áreas revisadas con paridad correcta

Verificado contra las tablas `unit-paridad.js` y los valores leídos en el repo; todos coinciden con Java:

- **Durabilidad de herramientas:** 59/131/250/32/1561 exactas (madera/piedra/hierro/oro/diamante) y tijeras 238 — `server/constants.js:652-683`, `public/constants.js:170-197`, fijado en `tests/unit-paridad.js:117-122`.
- **Daño de espadas:** madera 4, piedra 5, hierro 6, oro 4, diamante 7; daño a mano 1 — `server/constants.js:796-802` + `net.js` (`TOOL_DAMAGE || SWORD_DAMAGE || 1`), `unit-paridad.js:43-73`.
- **Daño de picos/palas:** madera 2, piedra 3, hierro 4, oro 2, diamante 5 (igual que MC) — `server/constants.js:819-828`, `unit-paridad.js:70-72`.
- **Armadura:** puntos por pieza 1-3-2-1 / 2-6-5-2 / 3-8-6-3, reducción `min(puntos×4, 80)%`, durabilidades exactas (275/825/1815) — `server/constants.js:706-751` y `:789-791`, `unit-paridad.js:75-140`.
- **Dureza de bloques:** tierra 0.5, grava 0.6, arena 0.5, piedra 1.5, césped 0.6, tronco 2.0, piedra de musgo 2.0 — `server/constants.js:491-542`, `unit-paridad.js:141-148`.
- **Curva de XP oficial:** 2L+7 / 5L−38 / 9L−158, total nivel 30 = 1.395 XP; salud máxima siempre 20 — `server/constants.js:845-849`, `unit-paridad.js:150-189`.
- **Vida de mobs:** zombie 20, creeper 20, esqueleto 20, spider 16, enderman 40, slimes 16/4/1, pollo 4, oveja 8, vaca 10, cerdo 10, lobo 20 — `server/mobs.js:62-84`, `unit-paridad.js:193-202`.
- **XP de mobs:** zombie 5, creeper 5, esqueleto 5, enderman 5, spider 5, ahogado 5, slime grande 4 / pequeño 1 — `server/constants.js:867-885` y `mobXp` en `server/mobs.js:29-32`.
- **Drops comestibles y secundarios:** vaca 1-3 cruda, cerdo 1-3 chuletas, pollo 1-2, oveja 1-2 cordero; cuero, hilo, huesos, flechas de esqueleto (0-2), plumas (0-2), tridente del ahogado ~15% — `server/mobs.js:1588-1643`.
- **Comida:** pan 5 / sat 6, carne cruda 3, bistec 8, chuleta cruda 3 / cocinada 8, pollo 2 / 6, cordero 2 / 6, conejo crudo 3 / asado 5, bacalao crudo 2 / 5 — todas coinciden — `server/constants.js:456-472`.
- **Minado y tier de herramientas:** piedra/adoquín solo con pico, tier por mineral (hierro/oro→pico de piedra; redstone/diamante/esmeralda→hierro), vitral sin drop — `server/constants.js:629-643, 910-927`.
- **Crafteo clave:** pico de madera "Y" (3 tablas + 2 palos), palo (2 tablas → 4), tablones (1 tronco → 4), antorcha (4), arco (3 palos + 3 hilo), flechas (4), cubo (3 hierro), compás (4 hierro + redstone), malla sin receta — `recetas.json` + `tests/unit-lagunas.js` L1-L5.
- **Horno:** tiempos de fundido de 200 ticks (10 s) correctos para comida y minerales — `recetas_horno.json:2-4,6-11`.
- **Ciclo día/noche y tick:** 20 minutos (1.200.000 ms), 20 TPS (`TICK_MS = 50`) — `server/constants.js:17,22`; velocidad de caminar 4.3 vs 4.317, sprint 5.6 vs 5.612, agachado 1.3 vs 1.295 — `public/player.js:38-47`.
- **Despawn:** a >128 bloques, igual que MC — `server/constants.js:43`.

## Áreas no comparables (divergencia deliberada documentada)

Estas diferencias están declaradas como intencionales en `docs/auditoria-2026-08-09.md` §5 y `docs/reporte-paridad.md`, y en muchos casos fijadas por tests (no son bugs de paridad):

- **Salto 1.36 bloques vs 1.25 y altura de ojo 1.6 vs 1.62**: "test-fijados e intencionales (necesarios para el anti-cheat)" — `auditoria-2026-08-09.md:247`; `server/constants.js:80-81`.
- **Hacha con daño igual a la espada del material (4/5/6/7) vs MC 7/9/9/9-10**: el cliente no simula el attack speed del hacha, así que se iguala para no romper la progresión — `server/constants.js:805-812`, `auditoria:170-181`.
- **Explosión creeper/TNT: daño 12 vs ~49 de MC**: "test-fijado e intencional (equilibrio de diseño del clon)" — `auditoria-2026-08-09.md:249`; `server/constants.js:261-263`.
- **Vida del conejo (10 vs 3) y otras vidas de equilibrio**: ídem — `auditoria-2026-08-09.md:249`.
- **XP se conserva al morir** (MC la pierde en el punto de muerte): simplificación — `reporte-paridad.md:159`.
- **Agricultura solo trigo** (sin zanahorias/patatas/melones): la zanahoria existe como ítem de cría/creativo pero no es comida — `reporte-paridad.md:65`; `server/constants.js:456-472`.
- **Minerales dropean gema/lingote directo** (fundición implícita 1.17, sin ítem "raw") — `server/constants.js:894-906`.
- **Mundo de 128 bloques (−64..+63) vs 384 de MC 1.18+**: decisión diferida documentada — `reporte-paridad.md:116,275-282` (Fase 15 D5).
- **Esquema de IDs propio** (no los de MC), sincronizado por `unit-sync` — `auditoria-2026-08-09.md:245`.
- **Libro de recetas sin desbloqueo progresivo** — `reporte-paridad.md:101`.
- **Vidrio sin Silk Touch nunca suelta item** (simplificado) — `server/constants.js:641`.

---

# 6. Recomendaciones finales

## Causa raíz transversal (la más probable de los E2E rojos)

Los timeouts de los E2E (`e2e-mascotas` 0/19, `e2e-durabilidad` TIMEOUT 180 s en
"give-materiales", `e2e-templo` 0/6 + TIMEOUT 30 s en "watch") apuntan a un
mismo denominador común del servidor, verificado por dos pases independientes:

- **SV-4** (servidor) y **REN-1** (rendimiento) coinciden: el guardado de mundo
  cada 30 s es **100 % síncrono** en el event loop (`gzipSync` + `writeFileSync`
  + `renameSync` por chunk sucio en `world.js:745-767`, desde `setInterval` en
  `server.js:88`). Con muchos chunks sucios congela el bucle de 20 Hz durante
  cientos de ms o segundos, y durante esa ventana no se atienden los sockets de
  los clientes de test → timeout.

Antes de tocar ninguna otra cosa, **perfilar en vivo (`node --prof` +
`__mcServerTickMs`)** para confirmar que el pico de guardado coincide con los
timeouts, y después priorizar la corrección en este orden.

## Orden de corrección sugerido

1. **🔴 REN-1 / SV-4 — guardado síncrono → asíncrono o por lotes.**
   Cadena de commits: hacer el guardado no bloqueante (cola/`setImmediate` por
   lote o worker), sin cambiar el formato del disco (no toca schema). Bloque:
   Fase 1. **Si esto no se corrige, los timeouts E2E seguirán fallando.**
2. **🟠 SEC-1 — anti-cheat de vuelo/speedhack.** Mover el anti-cheat de
   ascenso fuera de la condición `y - p.y > 0` y añadir límite de velocidad
   horizontal por ventana temporal. Bloque: Fase 8.
3. **🟠 SEC-2 — `set_seed` en bucle.** Cooldown/cuota por jugador + no marcar
   dirty chunks recién generados. Bloque: Fase 9-B / Fase 6.
4. **🟠 SV-1 + PAR-1 — horno.** (a) Consumir el combustible de verdad (el ítem
   se agota; añadir `furnace_state` correcto), (b) tabla `FUEL_TICKS` por ítem
   (carbón 1600, palo 100, tablas/troncos 300). Bloque: Fase 14 P4 + "Fase 16
   (Paridad)". (Puede ir junto con RE-2 al tocar `crafting.js`.)
5. **🟠 REN-2 — hornos huérfanos.** Añadir `furnaces.delete` al romper el horno
   (limpieza de memoria + `world.json`) y acotar el bucle O(H×J).
6. **🟠 SV-3 / SEC-3 — validación de coords.** Guardia `Number.isFinite` en
   todos los handlers que reciban `x/y/z` (evita chunks `"NaN,NaN"` en disco).
7. **🟡 CL-1 — barra de durabilidad fantasma** en el hotbar (fallback
   `BOW_DURABILITY` mal aplicado).
8. **🟡 CL-2 — desync de mascotas** (render de `sitting`/`state` en
   `public/mobs.js`).
9. **🟡 REN-3 — `settings` gigante.** Fragmentar/enviar por lotes el reenvío
   de radio al ampliarlo.
10. **🟡 Resto menor:** SV-2 (stacks parciales), SV-5 (/give 999 → tope 64),
    SV-6 (/tp clamp), CL-3 (parse sin try/catch), REN-7 (índice de `torchSet`),
    PAR-2 (drops zombi/creeper + ítems carne podrida/pólvora), PAR-3 a PAR-10
    (puertas ×3, vidrio 200 t, carbón vegetal, XP slime mediano/lobo, fases
    día/noche), SEC-4 (CSP + SRI / Three.js local).

## Verificación tras cada corrección

`node --check` sobre los `.js` tocados, `node tests/run.js --unit`, arrancar el
servidor y confirmar `/`, y volver a correr los E2E completos (`PORT=3998 node
server.js` + `WS_URL=ws://localhost:3998 node tests/run.js --e2e`) **en
solitario** (sin otras suites/auditorías en paralelo) hasta dejarlos en verde.