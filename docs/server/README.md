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
| `world.js` | Generación por semilla (noise 2D/3D), acceso a bloques, minas, charcos, árboles, minerales, archivos de chunk | constants, state, chests |
| `save.js` | Persistencia incremental por chunk (gzip), `world.json` (meta, mobs, hornos, cofres, cultivos), migraciones, `switchWorld`, `deleteWorld`, descarga de chunks lejanos | constants, state, world, mobs, crafting, chests |
| `players.js` | Inventario, salud, hambre, daño (con armadura), XP/curva MC, caídas, respawn, comer, tick del jugador | world, state, constants |
| `mobs.js` | IA por especie (zombi, esqueleto, creeper, araña, pasivos, abeja), spawn por luz/hora, flechas, cría, drops, zona segura de spawn | constants |
| `crafting.js` | Recetas 3×3 + hornos, hot-reload de `recetas.json`, tick de hornos | state, constants |
| `mining.js` | Sesiones de rotura con progreso (dureza × herramienta), grietas al cliente | constants |
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

## Persistencia (save.js)

- **Incremental por chunk:** cada chunk `cx,cz` se escribe gzip en
  `world/<semilla>/chunks/<cx>_<cz>.json.gz` (solo los sucios, cada 30 s).
- **Meta global:** `world/<semilla>/world.json` guarda mobs, hornos,
  cofres, cultivos, `gamemode` y `schemaVersion`.
- **Escritura atómica:** fichero temporal + `rename`, para que un corte de
  luz no deje un chunk a medias (ver skill `save-systems`).
- **Versión de esquema (`SCHEMA_VERSION = 3`)** con migraciones
  retrocompatibles (`migrateWorldLayout`, `migrateLegacyWorld`).
- **Descarga de chunks lejanos** (>10 chunks del jugador, cada 10 s) para
  acotar la memoria del servidor.

**Por qué por chunk:** guardar el mundo entero a cada autosave sería O(n)
y lento; incremental es O(chunks sucios). Es la misma decisión que el
formato de regiones de Minecraft, simplificada.

## Mundos por semilla

`world/<semilla>/`. La semilla se cambia en runtime (`switchWorld`):
persiste el mundo actual, cambia `worldPaths` y regenera. **Cambiar de
semilla nunca pisa mundos anteriores.** Cada mundo guarda su `name` y su
`gamemode` (survival/creative) en `world.json`.

**Por qué:** permite al menú del cliente listar y abrir mundos (Fase 7) y
elegir modo de juego por mundo (Fase 9) sin máquinas de estado complejas.

## Protocolo WebSocket (resumen)

Eventos **cliente → servidor**: `move`, `block_action`, `attack_mob`,
`craft`, `grid_set/clear`, `furnace_open/action`, `chest_open/action`,
`inventory_select`, `eat`, `sleep`, `till`, `plant`, `feed_mob`,
`equip/unequip_armor`, `chat`, `set_name`, `set_seed`, `settings`,
`recipe_book`, `worlds_list`, `world_delete`, `creative_fly`, `creative_pick`.

Eventos **servidor → cliente**: `init`, `chunks_add`, `chunks_unload`,
`block_update`, `block_break_progress`, `mobs_update`, `arrows_update`,
`mob_death`, `mob_hit`, `mob_breed`, `health_update`, `food_update`,
`xp_update`, `level_up`, `inventory_update`, `crafting_grid_update`,
`furnace_state`, `chest_state`, `tool_broke`, `eat_rejected`,
`sleep_ok/sleep_rejected`, `teleport`, `time_set`, `chat`, `player_leave`,
`player_rename`, `recipe_book`, `worlds_list`, `world_delete_result`,
`seed_rejected`, `server_metrics`, `damage_debug`, `textures_reload`.

**Convenciones:** nombres en `snake_case`; el servidor **sanitiza todo**
(nombres, semillas, mensajes) antes de usarlo; `WS_MAX_PAYLOAD` limita el
tamaño de los mensajes entrantes (anti-DoS).

## Verificación

```bash
node tests/run.js --unit      # unitarios (sin servidor)
PORT=3998 node server.js      # servidor para E2E (otra terminal)
WS_URL=ws://localhost:3998 node tests/run.js --e2e
node tests/audit-fase3.js     # auditorías por fase (3..7)
```

Los tests importan los módulos del servidor directamente (CommonJS) y
usan **servidores WS falsos** (patrón `unit-red.js`) o **redirigen el I/O**
a un directorio temporal (`unit-persistencia.js`), para nunca tocar el
`world/` real del proyecto.
