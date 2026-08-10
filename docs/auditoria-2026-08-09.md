# Auditoría técnica 2026-08-09 — errores, seguridad, rendimiento y paridad

> Auditoría integral de solo lectura del clon de Minecraft (servidor Node
> autoritativo `server/` + cliente Three.js `public/', todo en español),
> realizada con revisión de código real (no inventada) y verificación de cada
> hallazgo contra el archivo y la línea citados.
> Fecha: 2026-08-09 · Método: tres pases paralelos (servidor/seguridad,
> cliente/rendimiento, paridad vs MC) + confirmación en el código de los
> hallazgos críticos y altos.

## Metodología

1. **Servidor y seguridad** (`net.js`, `world.js`, `players.js`, `mobs.js`,
   `items.js`, `save.js`, `commands.js`, ...) — errores lógicos, validación
   de entrada WS, persistencia, abuso.
2. **Cliente y rendimiento** (`world.js`, `chunkGeometry.js`, `chunkWorker.js`,
   `lighting.js`, `input.js`, `ui.js`, `mobs.js`, `sky.js`, `clouds.js`,
   `player.js`) — bugs de render, fugas de memoria, trabajo fuera del worker.
3. **Paridad vs Minecraft Java** (constantes, `recetas.json`,
   `unit-paridad.js`, `unit-lagunas.js`) — valores oficiales de MC contra la
   tabla real.

Línea base: suite unitaria 50/50 en verde, working tree limpio.

---

## 1. Prioridad 🔴 CRÍTICA (servidor · seguridad/estabilidad)

### 1.1 DoS — un mensaje WS mal formado tira el servidor entero
- **Ubicación:** `server/net.js:353-365`, y la mayoría de `case` del `switch`
  (p. ej. `move`, `craft`, `furnace_open`, `chest_open`, `set_seed`,
  `feed_mob`, `chat`, `attack_mob`, `equip_armor`).
- **Problema:** el `try/catch` solo envuelve `JSON.parse`. Un evento sin
  `data` (o con `data: null`) revienta el destructuring del handler
  (`const {x,y,z} = undefined` lanza `TypeError`). No hay
  `process.on('uncaughtException')` (`server.js` solo maneja `SIGINT`), así
  que la excepción propagada desde el listener de `ws` **mata el proceso**.
  ~25 eventos afectados.
- **Fix:** guardia tras el parse (`if (!msg || typeof msg.data !== "object")`)
  + `try/catch` sobre el `switch` (log + `return`).
- **Estado:** ✅ corregido (`net.js` handler + tests en `unit-red.js`:
  mensajes basura no mueven al jugador).

### 1.2 Crafteo gratis / duplicación ilimitada de ítems
- **Ubicación:** `server/net.js:615-631` (handler `craft`).
- **Problema:** `p.craftingGrid = Array.isArray(data.grid) ? data.grid : ...`
  toma la grid directamente del wire sin validarla. El handler consume
  1 unidad por celda y mete el resultado en el inventario. Un cliente puede
  reenviar la grid de cualquier receta cada frame → **ítems infinitos sin
  coste** (comida, herramientas...), rompiendo la economía survival.
- **Fix:** validar la grid (9 celdas, ítems existentes, conteos coherentes)
  o craftear solo desde celdas realmente colocadas vía `grid_set`
  (proveniencia server-side).
- **Estado:** ✅ corregido — `p.craftingGrid` es la única fuente de verdad
  para `craft` (se ignora `data.grid`); tests `grid_set→craft` y grid del
  wire inventada (no producen ítems) en `unit-red.js`.

### 1.3 `world_delete` sin comprobación de permisos
- **Ubicación:** `server/net.js:1014-1031` → `save.deleteWorld`
  (`save.js:563-595`).
- **Problema:** el handler no verifica `isOp`; un cliente cualquiera puede
  borrar de disco cualquier mundo no activo (`world/<semilla>/`).
- **Fix:** exigir `p.isOp` antes de llamar a `deleteWorld`.
- **Estado:** ✅ corregido (`world_delete` rechaza a no-operadores con razón
  "solo operadores"); test en `unit-fase9.js`.

## 2. Prioridad 🟠 ALTA (servidor y cliente)

### 2.1 Primer jugador conectado = OP automático (sin autenticación)
- **Ubicación:** `server/net.js:247-248` (+ `constants.js:1032-1037`).
- **Problema:** `state.players.size === 0 || OPS.has(...)` — quien conecte
  primero obtiene `/tp /give /gamemode /kill /op /reload` y
  `set_seed`/`world_delete`. En LAN sin auth, cualquiera que conecte antes
  que el dueño toma el control total. Decisión de diseño documentada, pero
  frágil.
- **Fix (a decidir):** exigir siempre la lista `OPS` explícita, o mantener el
  "first player" pero documentarlo.
- **Estado:** 🟡 se mantiene como decisión de diseño documentada (primer
  jugador en servidor LAN = admin). Frágil pero intencional; sin
  autenticación en el objetivo del proyecto.

### 2.2 Mesh de chunk duplicado en el camino del worker
- **Ubicación:** `public/world.js:982-1009` (`loadChunkData` legacy M3) y
  `public/world.js:469-480` (`onWorkerMessage`).
- **Problema:** al completarse el borde de un chunk ya cargado, se rehornea
  vía worker y `onWorkerMessage` hace `scene.add(group)` +
  `chunkMeshes.set(key, group)` **sin** `removeChunkMesh(key)`. El mesh viejo
  queda huérfano en la escena: dos geometrías idénticas superpuestas
  (z-fighting en el borde) y una fuga que `unloadChunks` no recupera (solo
  lee la entrada del `Map`, que ya apunta al grupo nuevo). El camino síncrono
  (`rebuildChunk`) sí hace el swap limpio.
- **Fix:** en `onWorkerMessage`, llamar `removeChunkMesh(key)` antes de
  `scene.add`/`chunkMeshes.set`.
- **Nota:** confirmado como el hallazgo más visible en exploración normal con
  worker activo.
- **Estado:** ✅ corregido (`onWorkerMessage` hace `removeChunkMesh(key)` antes
  del `scene.add`; swap limpio como el camino síncrono).

## 3. Prioridad 🟡 MEDIA

### 3.1 Sin rate-limit en ningún mensaje WS ni tope de conexiones
- **Ubicación:** `server/net.js:353` (handler), `:486-490` (broadcast de cada
  `move`), `:1349-1355` (`attack_mob` sin cooldown ni línea de visión),
  `:1648-1656` (`WebSocket.Server` sin `maxConnections`).
- **Problema:** cada `move` amplifica a un broadcast O(n) (O(n²)/s con varios
  clientes); se puede spampear `chat` y `attack_mob`; cientos de sockets sin
  tope agotan memoria/CPU (cada conexión dispara `ensureChunksAround` +
  `sendInit`).
- **Fix:** throttling (~20 moves/s por conexión), cooldown de chat y ataque,
  `server.maxConnections`.
- **Estado:** ✅ corregido — `MAX_CONNECTIONS = 10` (cierre 1013) y rate-limit
  `MAX_MSG_RATE = 30/s` por conexión (cierre 1008) en `net.js`/`constants.js`;
  aplica SOLO a sockets reales (`realSocket = !!req`). Tests en `unit-red.js`
  (flood real corta; socket fake no se ve afectado).

### 3.2 `set_seed` sin cooldown ni permiso, con escritura a disco
- **Ubicación:** `server/net.js:856-927` (`save.switchWorld`).
- **Problema:** un jugador puede encadenar semillas, persistiendo y creando
  `world/<semilla>/` cada vez → posible llenado de disco.
- **Fix:** exigir op y/o cooldown, o limitar mundos creados.
- **Estado:** 🟡 parcialmente mitigado — ya exige ser el ÚNICO jugador en
  línea (los demás verían el mundo cambiar) y `world_delete` exige op; el
  spam queda cubierto por el rate-limit §3.1. Exigir op queda fuera del
  diseño del menú del cliente.

### 3.3 Libro de recetas (tecla B) abre con el puntero bloqueado
- **Ubicación:** `public/ui.js:659-669` (`toggleRecipeBook`).
- **Problema:** `classList.toggle("hidden")` devuelve `true` cuando la clase
  queda presente (cerrando). Así `if (open)` ejecuta la rama de CERRAR al
  abrir, y `controls.lock()` se llama al ABRIR → el puntero sigue bloqueado
  y las pestañas/ítems del libro no se pueden pulsar.
- **Fix:** guardar el estado previo (`!contains("hidden")`) antes del toggle.
- **Estado:** ✅ corregido + puntero clicable (captura `opening` antes del
  toggle en `toggleRecipeBook`).

### 3.4 Sombras del sol fijas al origen de la escena
- **Ubicación:** `public/scene.js:44-54`.
- **Problema:** `sun.shadow.camera` tiene bounds fijos (±60) y `target` en el
  origen. Al explorar más allá de ~±60 bloques, el volumen del shadow map
  queda vacío y terreno/mobs dejan de proyectar sombra.
- **Fix:** arrastrar `sun.target`/la caja del frustum hacia la cámara
  periódicamente, o mover la luz con el jugador.
- **Estado:** ✅ corregido — `scene.add(sun.target)` + en `animate()`
  (`player.js`) `sun.target.position` sigue a la cámara y `sun.position` se
  desplaza (offset 60,90,40) con `updateMatrixWorld()`.

### 3.5 Mobs, flechas y jugadores remotos no liberan geometrías/materiales
- **Ubicación:** `public/mobs.js:318-332` (`removeMob`), `:165-171`
  (`removeRemotePlayer`), `:429-435` (flechas huérfanas).
- **Problema:** `scene.remove` + borrado del `Map`, pero sin `dispose()` de
  geometrías, materiales y `CanvasTexture` del nametag → VRAM crece en
  sesiones largas.
- **Fix:** `mesh.traverse(o => o.geometry?.dispose?.())` + dispose de
  materiales/nametag al borrar.
- **Estado:** ✅ corregido — `disposeMesh()` en `public/mobs.js` (traverse de
  geometrías, material compartido del mob, SpriteMaterial + CanvasTexture del
  nametag); se aplica en el ciclo de `updateMobs`, `removeMob` y
  `removeRemotePlayer`. Las flechas NO lo usan (reutilizan geometrías y
  materiales compartidos del pool).

### 3.6 Grietas de mina sin limpiar al descargar chunks
- **Ubicación:** `public/world.js:1049-1068` (`unloadChunks`).
- **Problema:** `unloadChunks` libera mesh y luz pero no recorre `cracks`;
  el overlay de grieta queda flotando si se reduce render distance o cambia
  de mundo.
- **Fix:** en `unloadChunks`, borrar grietas dentro del chunk descargado.
- **Estado:** ✅ corregido (`unloadChunks` filtra `cracks` por chunk y
  dispose del material clonado por-bloque).

### 3.7 Paridad: combate cuerpo a cuerpo con herramientas no-espada
- **Ubicación:** `server/net.js:1361` (`SWORD_DAMAGE[tool] || 1`) y
  `server/mobs.js:841` (enderman 4 vs MC 7), `:710` (zombie 2 vs MC 2.5-3).
- **Problema:** hachas/picos/palas pegan solo 1 (MC: hachas 4-7, picos 2-3);
  enderman y zombie por debajo del valor normal de MC.
- **Fix:** tabla `TOOL_DAMAGE` para herramientas; subir enderman a 7 (o
  decidir documento) y zombie a nivel "normal".
- **Estado:** ✅ corregido — `TOOL_DAMAGE` en `constants.js` (hacha = espada
  del material porque el cliente no simula el attack speed del hacha; picos/
  palas 2-3 base, 5 diamante), attack_mob usa
  `TOOL_DAMAGE[tool] || SWORD_DAMAGE[tool] || 1`; enderman 7 y zombie 3.
  Checks en `unit-paridad.js` y ajuste de health en `unit-mobs-ia.js`.

### 3.8 Paridad: salud de pasivos no sigue MC
- **Ubicación:** `server/mobs.js:384` (default de pasivo 10).
- **Problema:** pollo 10 (MC 4) y oveja 10 (MC 8). No fijado por tests.
- **Fix:** `MOB_HEALTH` explícito para `chicken: 4`, `sheep: 8`.
- **Estado:** ✅ corregido (`MOB_HEALTH.*chicken: 4`, `sheep: 8`); checks de
  pollo/oveja/vaca/cerdo en `unit-paridad.js`.

## 4. Prioridad 🟢 BAJA

### 4.1 Paridad: XP del slime grande = 1 (MC 4)
- **Ubicación:** `server/constants.js:831`.
- **Fix:** `MOB_XP.slime` por tamaño (grande 4, pequeño 1, mínimo 0).
- **Estado:** ✅ corregido — `mobXp(m)` en `server/mobs.js` (slime grande 4,
  resto 1) y es el caller de `attack_mob` y del proyectil/tridente.

### 4.2 Paridad: tijeras sin durabilidad ni no-apilado
- **Ubicación:** `server/constants.js:276`, `TOOL_DURABILITY` (no listadas).
- **Fix:** `TOOL_DURABILITY.SHEARS = 238` + no apilar (custom en stack).
- **Estado:** ✅ corregido — SHEARS en `TOOL_DURABILITY` (238) server + `141:
  238` en `DURABILITY` cliente (`audit-fase5` en verde); al ser `isTool` no
  se apilan con durabilidad propia, y esquilar las desgasta (`applyToolWear`
  tras `applyShear`).

### 4.3 Paridad: sin despawn de mobs por distancia
- **Ubicación:** `server/net.js:1517` (solo muertos se eliminan).
- **Fix:** cull a >128 bloques de todo jugador.
- **Estado:** ✅ corregido — `mainLoop` filtra mobs a `> DESPAWN_DIST (128)`
  de TODO jugador sin dueño; test de cull (cerca/lejos/mascota) en
  `unit-perf-server.js`.

### 4.4 Constante muerta `BEE_HEALTH = 5`
- **Ubicación:** `server/mobs.js:1674` — nunca se consume; la abeja usa 10.
- **Estado:** ✅ eliminada (constante y export).

### 4.5 Hombre del libro: re-render completo del DOM en hotbar
- **Ubicación:** `public/ui.js:105-134` (`updateHotbarUI` + `attachTooltip`).
- **Fix:** delegación de eventos + re-render solo del slot cambiado.
- **Estado:** ✅ corregido — los 9 slots se crean UNA vez, se re-renderiza
  solo el slot cuyo contenido/selección cambió y los eventos se delegan en el
  contenedor (click + mouseover/out).

### 4.6 Nubes: reescritura del atributo de color al GPU cada frame
- **Ubicación:** `public/clouds.js:112-118`.
- **Fix:** refrescar solo cuando el tinte cambie un umbral.
- **Estado:** ✅ corregido — tinte cuantizado a pasos de `CLOUD_TINT_STEP`
  (0.03) y solo se re-suben los colores cuando el valor cuantizado cambia.

### 4.7 `bakeChunkLight` recorre todo `torchSet` por chunk horneado
- **Ubicación:** `public/world.js:871-903`.
- **Fix (futura):** índice espacial por celda.
- **Estado:** 🟡 pendiente — optimización retrasada a conciencia (índice
  espacial de `torchSet`); `torchSet` es pequeño en la práctica y
  `bakeChunkLight` no se ejecuta por frame (solo al hornear un chunk).

## 5. Verificados correctos (falsos positivos descartados)

- Path traversal por semilla no explotable (`constants.js:74-82` sanitiza a
  `[a-z0-9_-]`, `deleteWorld` valida resolución de ruta).
- `maxPayload` WS fijado a 1 MiB (`net.js:1655`).
- Cofres/hornos `put`/`take` sin duplicación (slot origen se anula solo tras
  éxito).
- Chat limitado a 200 caracteres; `/give` sin traversal y con topes.
- IDs de bloques/ítems: esquema propio intencional (no IDs de MC), fuente de
  verdad sincronizada por `unit-sync`.
- Salto 1.36 vs 1.25 MC y ojo 1.6 vs 1.62: test-fijados e intencionales
  (necesarios para el anti-cheat).
- Creeper 12 vs ~49 MC y conejo/lobo con más HP: test-fijados e intencionales
  (equilibrio de diseño del clon).

## 6. Estado de corrección

Cada hallazgo se corrige en su propio commit (una preocupación por commit)
con su test y verificación (`node --check` + `run.js --unit` en verde al
final). El estado de cada punto se actualiza en la columna de este documento
y en `TODO.md`.

**Resumen al cierre (2026-08-09):** 🔴 3/3 corregidos · 🟠 1 corroborado como
decisión documentada (2.1, "primer jugador = op") y 1 corregido (2.2) · 🟡
corregidos 3.1, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8; 3.2 mitigado por rate-limit ·
🟢 corregidos 4.1-4.6; 4.7 pendiente (índice espacial, futura). Suite final:
50 unitarios en verde + `audit-fase5` y `unit-sync` en verde.

Los commits de corrección de la auditoría (orden cromológico):
`01ca4c5` (1.1) · `abe1bc2` (1.2) · `d576c19` (1.3) · `0bc40e8` (3.1) ·
`a5d8ddb` (2.2) · `bef5c81` (3.3 + 3.4) · `0e179de` (3.5 + 3.6) ·
`7532138` (3.7 + 3.8) · `404b81f` (E2E adaptados al protocolo) ·
`48ac6b7` (4.1-4.4) · `6ef6033` (4.5 + 4.6).