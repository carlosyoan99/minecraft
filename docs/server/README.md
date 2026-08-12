# Servidor — Arquitectura y módulos

> Documentación técnica del lado servidor del clon de Minecraft.
> Complementa a [`../README.md`](../README.md) (índice de docs) y a las
> especificaciones por fase (`../fase*-spec.md`). Aquí se explica **cómo
> funciona** cada pieza y **por qué** está hecha así; el protocolo de red
> se resume en la sección homónima y las mecánicas de juego están en
> [`mecanicas.md`](./mecanicas.md).

## Principio rector: el servidor es la única fuente de verdad

Toda la lógica que puede ser abusada o desincronizada vive en el servidor:
validación de movimiento, física, inventario, rotura de bloques, crafteo,
combate, economía y persistencia. El cliente solo **predice y dibuja**.

**Por qué así:**

- **Anti-trampas por diseño.** Si el cliente dijera "he roto este bloque"
  y el servidor le creyera, sería trivial modificar el JS del navegador
  (no hay binario que firmar). Al validarlo todo en el servidor, un
  cliente alterado solo puede *pedir*; nunca *decidir*.
- **Un solo estado.** No hay que reconciliar dos verdades (cliente y
  servidor). El `state.js` del servidor es el único mundo que importa;
  los clientes son vistas.
- **Multijugador barato.** El mismo estado sirve a N jugadores; los
  broadcasts de `net.js` son la única vía de sincronización.

El coste es latencia (cada acción es un round-trip) y más código en el
servidor. Para un clon educativo de Minecraft es el equilibrio correcto:
Minecraft real hace *server-side validation* por la misma razón.

## Cómo arranca (server/server.js)

`server.js` es deliberadamente pequeño: solo carga los módulos, cablea los
**hooks de broadcast** y arranca. Los hooks existen para romper los ciclos
de `require` (world/save/players → net):

```js
world.setBlockChangeHandler((x, y, z, block) => net.broadcast("block_update", ...));
save.setUnloadHandler((keys) => net.broadcast("chunks_unload", { keys }));
playerHelpers.setBroadcastHandler((event, data) => net.broadcast(event, data));
```

**Por qué así:** los módulos se requieren en cadena (players → world →
constants…); si `world.js` importara `net.js` directamente habría un ciclo.
El patrón "el que arranca inyecta las dependencias" mantiene cada módulo
independiente y testeable en Node (los tests requieren los módulos sin red).

## Mapa de módulos

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `constants.js` | Constantes (IDs de bloques/ítems `B`/`I`, física, mundo), `worldPaths` mutable, curva XP, minería | — |
| `state.js` | Estado compartido: chunks, players, furnaces, chests, crops, mobs, arrows, dirtyChunks, timeOffset, damageLog | — |
| `world.js` | Generación por semilla (noise 2D/3D), acceso a bloques, minas, charcos, árboles, minerales, biomas de Fase 11, tamaño de mundo, mundo de 128 bloques (Y ∈ −64..+63, `DESIGN_OFFSET`, Fase 15 D5), archivos de chunk. **POO (F13):** clases `World`/`Chunk` — el export es una instancia de `World` | constants, state, chests |
| `save.js` | Persistencia incremental por chunk (gzip), `world.json` (meta, mobs, hornos, cofres, cultivos, hora del mundo), migraciones, `switchWorld`, `deleteWorld`, descarga de chunks lejanos | constants, state, world, mobs, crafting, chests |
| `players.js` | Inventario, salud, hambre, daño (con armadura), XP/curva MC, caídas, respawn, comer, quemaduras, tick del jugador. **POO (F13):** clase `Player` + factory `createPlayer` | world, state, constants |
| `items.js` | **POO (F13):** clase `ItemStack` — los slots de inventario/cofre/drop | — |
| `mobs.js` | IA por especie (zombi, esqueleto, creeper, araña, pasivos, abeja), spawn por luz/hora, flechas, cría, esquilado, drops, zona segura de spawn. **POO (F13):** subclases por especie + `createMob`/`MOB_CLASSES` | constants |
| `crafting.js` | Recetas 3×3 + hornos, hot-reload de `recetas.json`, tick de hornos | state, constants |
| `mining.js` | Sesiones de rotura con progreso (dureza × herramienta), grietas al cliente | constants |
| `tnt.js` | TNT: mechas, explosión con cráter, reacciones en cadena, knockback (Fase 10) | state, constants |
| `chests.js` | Cofres (estado + snapshot), loot de minas abandonadas | state, constants |
| `commands.js` | Comandos de chat (`/help`, `/tp`, `/give`, `/time`, `/gamemode`), reloj del mundo | constants |
| `net.js` | HTTP + WebSocket, `sendInit`, handler de mensajes, `mainLoop` (tick 20 Hz), métricas | todos |

## El bucle principal (net.js `mainLoop`)

El juego no usa un game loop cliente: corre a **20 ticks/s** (`TICK_MS = 50`)
en el servidor. Cada tick:

1. Avanza el reloj del mundo (`worldTime`).
2. Ticks a los jugadores (física, hambre, lava, caídas — `tickPlayer`).
3. Ticks a los mobs (IA) y flechas (`tickArrows`).
4. Ticks a los hornos y cultivos.
5. Spawnea mobs (de noche o en zonas oscuras).
6. Broadcasts de estado (mobs, salud, comida) a los clientes.

**Por qué 20 Hz:** es el paso del mundo de Minecraft (20 TPS) y suficiente
para que la física se sienta bien sin sobrecargar la red ni el CPU. El
cliente **interpola** entre ticks para que el render vaya a más FPS.

## POO del servidor (Fase 13, C3)

Desde la Fase 13 las entidades del servidor son **clases** con fachadas
compatibles (el wire y el guardado NO cambian):

- **`ItemStack`** (`server/items.js`): la clase de los slots de
  inventario/cofre/drop. `JSON.stringify` de una instancia produce el mismo
  objeto que los literales `{ id, count }` / `{ id, count, durability }`
  anteriores (solo serializa las propiedades propias). Helpers:
  `ItemStack.from(slot)` normaliza literal→instancia (para migrar datos del
  disco/red), `ItemStack.slots(n)` crea n huecos vacíos y `toPlain()`
  devuelve el shape histórico.
- **`World`/`Chunk`** (`server/world.js`): `module.exports` es una
  INSTANCIA de `World`; los ~40 métodos históricos viven en su prototipo
  (asignados desde `api`). `world.getBlock(...)` funciona igual que antes y
  los tests que parchean `world.getBlock = ...` siguen funcionando (asignan
  una propiedad propia sobre la instancia). `world.getChunk(cx, cz)`
  devuelve un `Chunk` (16×128×16) con `getBlock`/`setBlock` locales, `dirty`
  y `save()`/`load()` (gzip, mismo formato que `writeChunkFile`).
- **`Player`** (`server/players.js`): los jugadores conectados (net.js) son
  instancias de `Player` creadas con `createPlayer({...})`; sus métodos de
  entidad (`damage`, `heal`, `eat`, `addXp`, `addItem`, `applyToolWear`,
  ...) delegan en las fachadas históricas (`damagePlayer`, `eatFood`,
  `addToInventory`, ...).
- **Mobs por subclase** (`server/mobs.js`): 15 subclases de `Mob`
  (`Zombie`, `Creeper`, `Skeleton`, `Spider`, `Enderman`, `Wolf`, `Slime`,
  `Drowned`, pasivos y `Ocelot`) creadas con la fábrica `createMob(type, x,
  y, z)` (`MOB_CLASSES` tipo→clase). La variación por especie vive en
  métodos sobreescritos (`tickSpecies`, `onDeath`); la clase base conserva
  el despacho por tipo para que `new Mob("zombie")` de los tests siga
  funcionando.

**Por qué así:** dar a las entidades un modelo de objeto (herencia por
especie, métodos de entidad) sin tocar el protocolo ni el formato de
Guardado — la promesa de compatibilidad del C3 de la Fase 13. La
serialización (JSON de una instancia = JSON de un literal) es la clave que
lo permite.

## Persistencia (save.js)

- **Incremental por chunk:** cada chunk `cx,cz` se escribe gzip en
  `world/<semilla>/chunks/<cx>_<cz>.json` (extensión `.json` sin
  cambio; la lectura detecta la cabecera gzip y descomprime — los
  mundos viejos en JSON plano siguen leyéndose sin migración).
- **Meta global:** `world/<semilla>/world.json` guarda mobs, hornos,
  cofres, cultivos, `gamemode`, hora del mundo (`timeOffset`, Fase 10)
  y `schemaVersion`.
- **Escritura atómica:** fichero temporal + `rename`, para que un corte de
  luz no deje un chunk a medias (ver skill `save-systems`).
- **Backup `.bak`:** `world.json` se copia a `world.json.bak` antes de
  sobrescribir; `loadWorld` restaura desde el backup si el principal es
  ilegible (Fase 9.5).
- **Versión de esquema (`SCHEMA_VERSION = 6`)** con migraciones
  retrocompatibles (`migrateWorldLayout`, `migrateLegacyWorld` y v5→v6 en
  `world.js`). La **v6** es el mundo de 128 bloques: los chunks pasan de
  `16×64×16` a `16×128×16` (Y ∈ −64..+63, el terreno anclado en ~0 con
  `DESIGN_OFFSET`); un chunk v5 (local y == mundo y, 0..63) se migra subiendo
  el dato a local 64..127 y rellenando el fondo nuevo con piedra. La **v5**
  persistía mascotas (`ownerId/ownerName/sitting`) y el tamaño del slime
  (`slimeSize`) en `world.json`; un mundo v4 sin esos campos carga igual
  (mob salvaje, slime grande).
- **Guardado asíncrono por lotes** (`saveWorldAsync`, Fase 16 C1): el
  autosave periódico del `setInterval` escribe los chunks sucios **por lotes
  de 6 con `setImmediate`**, cediendo el turno al event loop entre lotes —
  antes todo el guardado era síncrono y con cientos de chunks congelaba el
  servidor (causa de los timeouts E2E). El chunk se borra de `dirtyChunks`
  al escribirse (un chunk re-ensuciado durante el guardado no se pierde),
  los errores de escritura no reintentan en bucle y la llamada es
  idempotente. `saveWorld()` síncrono se conserva para los puntos que
  necesitan el resultado inmediato (`switchWorld`, SIGINT).
- **Descarga de chunks lejanos** (>10 chunks del jugador, cada 10 s) para
  acotar la memoria del servidor.

**Por qué por chunk:** guardar el mundo entero a cada autosave sería O(n)
y lento; incremental es O(chunks sucios). Es la misma decisión que el
formato de regiones de Minecraft, simplificada.

## Mundos por semilla

`world/<semilla>/`. La semilla se cambia en runtime (`switchWorld`):
persiste el mundo actual, cambia `worldPaths` y regenera. **Cambiar de
semilla nunca pisa mundos anteriores.** Cada mundo guarda su `name`, su
`gamemode` (survival/creative) y su `worldSize` (pequeño/medio/grande/
infinito, Fase 10) en `world.json`.

**Por qué:** permite al menú del cliente listar y abrir mundos (Fase 7),
elegir modo de juego por mundo (Fase 9) y tamaño de mundo al crearlo
(Fase 10) sin máquinas de estado complejas.

## Protocolo WebSocket (resumen)

Eventos **cliente → servidor**: `move`, `block_action`, `attack_mob`,
`craft`, `grid_set/clear`, `furnace_open/action`, `chest_open/action`,
`inventory_select`, `eat`, `sleep`, `till`, `plant`, `feed_mob`,
`shear_mob`, `bonemeal`, `equip/unequip_armor`, `chat`, `set_name`,
`set_seed`, `settings`, `recipe_book`, `worlds_list`, `world_delete`,
`creative_fly`, `creative_pick`, `sit_pet`, `throw_trident`.

Eventos **servidor → cliente**: `init`, `chunks_add`, `chunks_unload`,
`block_update`, `block_break_progress`, `mobs_update`, `arrows_update`,
`mob_death`, `mob_hit`, `mob_breed`, `tame_ok`, `health_update`,
`food_update`,
`xp_update`, `level_up`, `inventory_update`, `crafting_grid_update`,
`furnace_state`, `chest_state`, `tool_broke`, `eat_rejected`,
`sleep_ok/sleep_rejected`, `teleport`, `time_set`, `chat`,
`player_join/move/leave`, `player_rename`, `recipe_book`, `worlds_list`,
`world_delete_result`, `seed_rejected`, `server_metrics`, `damage_debug`,
`fire_state`, `death`, `tnt_fuse`, `tnt_explode`, `textures_reload`.

**Convenciones:** nombres en `snake_case`; el servidor **sanitiza todo**
(nombres, semillas, mensajes) antes de usarlo; `WS_MAX_PAYLOAD` limita el
tamaño de los mensajes entrantes (anti-DoS).

## Verificación

```bash
node tests/run.js --unit      # unitarios (sin servidor)
node tests/run.js --unit --filter <regex>   # solo los que casan (con tiempo por test)
PORT=3998 node server.js      # servidor para E2E (otra terminal)
WS_URL=ws://localhost:3998 node tests/run.js --e2e
node tests/run.js --audit     # auditorías por fase (3-6 + altura)
npm run test:coverage         # c8: % de cobertura de server/ y public/
node tests/audit-fase7.js     # render CDP con Chrome headless (por separado)
node tests/audit-altura.js    # auditoría del mundo de 128 bloques (72 checks)
node tests/unit-mobs-poo.js   # POO de mobs (subclases por especie + createMob)
node tests/unit-poo-entities.js  # POO de entidades (ItemStack/World/Chunk/Player)
node tests/unit-lagunas.js    # lagunas L1-L5 (arco, puertas, escaleras, cubo, recetas)
```

Los tests importan los módulos del servidor directamente (CommonJS) y
usan **servidores WS falsos** (patrón `unit-red.js`) o **redirigen el I/O**
a un directorio temporal (`unit-persistencia.js`), para nunca tocar el
`world/` real del proyecto.
