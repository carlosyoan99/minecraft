# Mi Minecraft — Clon Node.js + Three.js

![Estado de desarrollo](https://img.shields.io/badge/estado-en%20desarrollo-yellow)
![Fases completadas](https://img.shields.io/badge/fases-5%2F5%20completadas-blue)

Copia jugable de Minecraft, no idéntica pero fiel a sus mecánicas
distintivas: mundo por chunks, biomas, cuevas, día/noche, mobs con IA,
crafteo por patrón y horno. Arquitectura cliente-servidor
autoritativa, como Minecraft Bedrock: el servidor es dueño del
mundo, el cliente solo dibuja y envía inputs.

## Stack

- **Servidor:** Node.js, Express (estáticos), `ws` (WebSocket),
  `simplex-noise` (generación de terreno), `uuid`. Sin base de
  datos: el mundo se persiste en JSON en `world/`.
- **Cliente:** JavaScript vanilla + Three.js 0.160 (vía CDN/importmap).
  Sin build step, sin framework. `public/index.html` carga
  `client.js` como módulo ES6; el resto son módulos por
  responsabilidad (ver estructura).

No hay TypeScript, bundler ni ORM a propósito — el proyecto se
mantiene simple y auditable de punta a punta.

## Por qué cliente-servidor autoritativo

La primera versión tenía toda la lógica en el navegador: inseguro
(F12 y listo), sin soporte multijugador real, sin IA persistente.
El servidor ahora valida cada movimiento y acción de bloque,
corrige al cliente si detecta algo imposible (velocidad, posición
dentro de un bloque sólido), y es la única fuente de verdad del
mundo. El cliente predice y dibuja; el servidor decide y corrige.

## Estructura

```
mi-minecraft/
├── server.js              Entrada (39 líneas): requiere módulos, conecta hooks y arranca
├── constants.js           Fuente de verdad de IDs (B/I) y configuración (semilla, tiempos)
├── state.js               Estado mutable compartido (chunks, players, mobs, furnaces)
├── world.js               Generación (biomas, cuevas, lagos) y archivos de chunk
├── crafting.js            Recetas de crafteo y hornos (tick de fundición)
├── players.js             Inventario, hambre, salud, XP y daño de jugadores
├── mobs.js                IA de mobs (máquina de estados) y drops
├── save.js                Persistencia incremental por chunk + descarga de chunks
├── net.js                 HTTP/WebSocket, handlers y bucle principal
├── recetas.json           Recetas de crafteo (patrones 3x3)
├── recetas_horno.json     Recetas de fundición
├── tests/                 Unitarios + E2E + auditorías (npm test, ver Tests)
├── public/                Cliente vanilla + Three.js (módulos ES6, sin build step)
│   ├── index.html         Entrada: importmap (Three.js CDN) y botón Jugar
│   ├── client.js          Bootstrap que cablea los módulos (13 líneas)
│   ├── constants.js       Constantes del cliente (IDs, colores, texturas, durabilidad)
│   ├── connection.js      Socket WebSocket
│   ├── network.js         Dispatcher de eventos servidor→cliente
│   ├── world.js           Chunks: geometría, UVs del atlas, culling, dispose
│   ├── player.js          Física del jugador (gravedad, salto, natación)
│   ├── scene.js           Escena, cámara, renderer y luces
│   ├── mobs.js            Render de mobs (escala por tipo)
│   ├── input.js           Ratón (pointer lock), teclado, clics
│   ├── ui.js              HUD: salud, hambre, saturación, XP, hotbar y durabilidad
│   ├── audio.js           Sonidos procedurales (Web Audio, sin assets)
│   ├── textures.js        Atlas de texturas procedural (canvas 16x16 px)
│   ├── daynight.js        Ciclo día/noche visual (cielo, luz, ambiente)
│   └── estilo.css
├── CLAUDE.md              Guía para IA que trabaje en el repo (convenciones)
├── CONTRIBUTING.md        Guía para contribuir (tests, commits, flujo)
├── package.json
└── world/                 Persistencia por semilla: world/<semilla>/chunks/ + world/<semilla>/world.json
```

## Ejecutar en local

```bash
npm install
node server.js
```

Abrir `http://localhost:3000`. Clic en "Jugar" para bloquear el
ratón. Para un puerto distinto: `PORT=3998 node server.js`. Para
un mundo totalmente nuevo con otra semilla:
`SEED=miNuevaSemilla node server.js` (cada semilla tiene su propio
mundo en `world/<semilla>/`; volver a la semilla anterior recupera
su mundo).

### Controles

- `WASD` moverse, ratón mirar, `Espacio` saltar
- Clic izquierdo: romper bloque / atacar mob
- Clic derecho: colocar bloque / usar horno
- `1`-`9`: seleccionar hotbar
- `E`: abrir mesa de crafteo
- `Enter`: chat

## Estado actual

### ✅ Implementado (Fases 0 a 5 completadas)

- **Fase 0 — Base:** servidor autoritativo con validación de
  movimiento/acciones, generación por biomas (llanura, bosque,
  desierto) con `simplex-noise` y semilla fija, IA de mobs por
  estados (zombie, creeper, esqueleto, enderman y pasivos),
  crafteo 3x3, horno con combustible, persistencia cada 30s,
  física básica y culling de caras correcto entre chunks.
- **Fase 1 — Cimientos técnicos:** guardado incremental por chunk
  con `schemaVersion` y migración v1→v2, descarga de chunks
  lejanos (servidor libera memoria + cliente hace `dispose()` de
  geometría), cliente y servidor modularizados por responsabilidad.
- **Fase 2 — Identidad sensorial:** atlas de texturas procedural
  (16x16 px por cara, pixel-art, sin assets binarios), ciclo
  día/noche visual (cielo, luz y ambiente interpolados con el reloj
  del servidor) y sonidos procedurales con Web Audio (romper,
  colocar, pasos, ambiente de día/noche, con mute persistente).
- **Fase 3 — Bucle de supervivencia:** barra de hambre autoritativa
  (decae con el tiempo/acciones, regenera salud si está llena,
  penaliza si está vacía), drops de comida cruda de animales,
  recetas de horno para cocinarla, comer con clic derecho
  (hambre + saturación), aviso de "no tienes hambre", saturación en
  el HUD y alimentación/cría de animales (modo amor → pareja → bebé
  que crece).
- **Fase 4 — Profundidad de terreno:** cuevas con ruido 3D que
  restan de la piedra (túneles conexos, deterministas y continuos
  entre chunks), agua con física de flotación (no sólida, se nada;
  el fondo es arena y no se rompe a mano), biomas de nieve y
  montaña (cumbres nevadas con el bloque `SNOW`).
- **Fase 5 — Progresión y combate:** durabilidad real de
  herramientas (madera 60, piedra 132, hierro 251, oro 33, diamante
  1562 usos; barra de durabilidad en el hotbar, sonido de rotura y
  aviso `tool_broke`), daño de espada por material, mobs nuevos
  (araña hostil que suelta hilo → lana, lobo hostil, conejo pasivo
  → conejo asado) y experiencia simple/niveles (+1 de salud máxima
  por nivel, barra de XP en el HUD).

### 🚧 En desarrollo

- Nada en curso: las 5 fases están cerradas y auditadas. La
  siguiente es la **Fase 6** (tareas propuestas en `TODO.md`:
  herramientas de desarrollo, rendimiento en cliente, cama y
  armadura, minas abandonadas, multijugador visible, etc.).

### ❌ Fuera de alcance (Won't)

- Redstone, dimensiones alternas (Nether/End), aldeas generadas,
  sistema de clima, cuentas de usuario, base de datos externa. Ver
  "Fuera de alcance" en `TODO.md`.

## Protocolo de red (WebSocket)

Mensajes `{ event, data }`. Nombres en `snake_case` (ver `net.js`
en el servidor y `public/network.js` en el cliente).

**Cliente → Servidor:**

| event | data | Propósito |
|---|---|---|
| `move` | `{x, y, z, yaw, pitch}` | Posición (validada con anti-cheat) |
| `block_action` | `{action: "break"\|"place", x, y, z, itemId}` | Romper/colocar bloque |
| `craft` | `{grid}` | Craftear desde el grid 3x3 |
| `grid_set` / `grid_clear` | celda / — | Mover ítem del inventario a la mesa |
| `furnace_open` | `{x, y, z}` | Abrir un horno |
| `furnace_action` | `{action: "add_fuel"\|\"add_input", invSlot}` / `{action: "collect_output"}` / `{action: "close"}` | Gestionar el horno abierto |
| `inventory_select` | `{slot}` | Seleccionar slot del hotbar |
| `eat` | `{}` | Comer el ítem seleccionado (rechazado si está lleno) |
| `feed_mob` | `{mobId}` | Alimentar un animal (modo amor → cría) |
| `attack_mob` | `{mobId}` | Atacar un mob (daño, desgaste, drops, XP) |
| `chat` | `{message}` | Mensaje de chat (máx 200 chars) |

**Servidor → Cliente:**

| event | data | Propósito |
|---|---|---|
| `init` | posición, spawn, chunks, `food`, `saturation`, `xp/level/maxHealth`, `dayTime` | Estado inicial |
| `chunks_add` / `chunks_unload` | `{chunkData}` / `{keys}` | Chunks nuevos / a descargar |
| `block_update` | `{x, y, z, blockId}` | Cambio de bloque replicado |
| `player_join` / `player_move` / `player_leave` | posición, yaw | Otros jugadores |
| `mobs_update` / `mob_death` / `mob_breed` | mobs, `{id}`, posición | Mobs en rango |
| `time_set` | `{dayTime}` | Re-sincroniza el ciclo día/noche (comando `/time set`) |
| `teleport` | `{x, y, z}` | Corrección anti-cheat |
| `player_die` | `{id}` | Muerte y reaparición |
| `inventory_update` | `{inventory}` | Inventario completo (con `durability`) |
| `health_update` | `{health, maxHealth}` | Salud |
| `food_update` | `{food, saturation}` | Hambre y saturación |
| `xp_update` / `level_up` | `{xp, level}` | Experiencia |
| `tool_broke` | `{slot}` | Herramienta rota (sonido + aviso) |
| `eat_rejected` | `{}` | "No tienes hambre" |
| `crafting_grid_update` | `{grid, success}` | Resultado del crafteo |
| `furnace_state` | `{key, ...}` | Estado del horno (combustible, progreso) |
| `chat` | `{id, message}` | Mensaje de chat |

## Tests

- `npm test` ejecuta los tests unitarios (cada uno un script Node plano que
  termina con código de salida 0/1; `tests/run.js` los encadena):
  - **Fase 0 (base):** `unit-crafting.js` (patrones 3x3 y hornos),
    `unit-mobs-ia.js` (máquina de estados de mobs: chase/flee, explosión del
    creeper, skeleton que mantiene distancia, enderman que teletransporta,
    cooldowns, `spawnMobs` y tope de 30) y `unit-red.js` (todos los handlers
    de `net.js` con un ws fake, sin levantar servidor: init, anti-cheat de
    movimiento con `teleport`, break/place con restricciones de herramienta y
    alcance, crafteo, mesa (grid) conservando durabilidad, ciclo completo del
    horno, selección de slot, comer y rechazo por estómago lleno, alimentar
    animales, chat y ataque a mobs con daño/desgaste/drops/XP).
  - **Fase 1 (persistencia):** `unit-persistencia.js` (guardado incremental por
    chunk sobre directorio temporal: round-trip de guardar/cargar, migración
    `world.dat` v1 → archivos por chunk, rechazo de `schemaVersion` más nueva,
    descarga de chunks lejanos con persistencia previa, y rechazo de archivos
    corruptos o de longitud inesperada).
  - **Fase 3 (supervivencia):** `unit-hambre.js` (decaimiento, regeneración e
    inanición) y `unit-cria.js` (alimentar y criar animales).
  - **Fase 4 (terreno):** `unit-mundo.js` (cuevas y lagos), `unit-biomas.js`
    (nieve y montaña), `unit-mobs-agua.js` (mobs se hunden en el agua) y
    `unit-spawn.js` (spawn sobre tierra firme).
  - **Fase 5 (progresión):** `unit-durabilidad.js` (durabilidad, XP y mobs
    nuevos).
  - **Integridad transversal:** `unit-recetas.js` (todas las recetas de
    crafteo/horno referencian IDs existentes, shapes bien formadas y
    alcanzables desde su grid — habría detectado el bug `hilo_a_lana` de la
    Fase 5) y `unit-sync.js` (los IDs de bloques/ítems y constantes
    compartidas están sincronizados entre `constants.js` del servidor y
    `public/constants.js` del cliente).
  - Y, si hay un servidor vivo en `ws://localhost:3998` (o `$WS_URL`), los
    E2E de comer (`tests/e2e-comer.js`) y de durabilidad
    (`tests/e2e-durabilidad.js` — craftea un pico de madera, rompe sus 60
    usos de piedra y verifica que se rompe al llegar a 0 sin duplicar drops).
- Flags del runner: `node tests/run.js --unit` (solo unitarios), `WS_URL=...`
  `node tests/run.js --e2e` (solo E2E contra ese servidor).
- Para que los handlers de red sean testeables, `net.js` exporta
  `handleConnection` (además de `broadcast` y `start`): los tests le pasan un
  `ws` fake y ejercitan cada evento sin abrir el puerto.
- Auditorías por fase (herramientas reutilizables):
  - `node tests/audit-fase3.js` — balance del hambre por simulación +
    rendimiento del tick de mobs con cría.
  - `node tests/audit-fase4.js` — culling de caras con cuevas + benchmark de
    generación (1.91 ms/chunk, 16 KB/chunk, regeneración bit-idéntica).
  - `node tests/audit-fase5.js` — sincronización de durabilidad servidor↔cliente,
    no-duplicación al romperse una herramienta, XP/niveles.

### Resultados (agosto 2026)

Suite completa en verde: **13 tests unitarios + 2 E2E** (si hay servidor).
Última ejecución: todos los unitarios pasan (persistencia, IA de mobs,
handlers de red, integridad de recetas y sincronización servidor↔cliente
incluidos), y los E2E contra un servidor real con mundo fresco dan
durabilidad 124/124 y comer 5/5 (el bonus de caza puede omitirse si no
aparece un animal cercano, quedando 3/3 — los checks base siempre pasan).
La auditoría de la Fase 5 sigue cubriendo la sincronización de durabilidad
y la no-duplicación de items; los unitarios transversales amplían la red
de seguridad a toda la base.

## Cómo contribuir

Lee **`CONTRIBUTING.md`** (flujo de trabajo, tests, convenciones de commits)
y **`CLAUDE.md`** (convenciones de código para IA y humanos). En resumen:
cada cambio nace de una tarea de `TODO.md`, no se saltan fases, un
preocupación por commit, y los commits son en español.

## Rendimiento y límites conocidos

- El guardado es incremental por chunk: cada chunk se persiste en
  `world/<semilla>/chunks/` (un archivo por chunk) y solo se
  reescribe cuando cambia; mobs y hornos viven en
  `world/<semilla>/world.json`. **Cada semilla tiene su propio
  directorio de mundo**: la semilla se configura con la env var
  `SEED` y al cambiarla se genera un mundo totalmente nuevo sin
  pisar el anterior (el layout antiguo en la raíz de `world/` se
  migra automáticamente al directorio de su semilla al arrancar).
  El formato antiguo (`world.dat` único, v1) se migra a archivos
  por chunk y se conserva como `world.dat.legacy`. El formato está
  versionado con `schemaVersion` (actual: 2): si el mundo es de una
  versión más nueva que el servidor, este se niega a abrirlo en
  lugar de corromperlo.
- Los chunks lejanos se descargan automáticamente: el servidor
  suelta (persistiéndolos antes) los chunks sin jugadores cerca y
  avisa al cliente, que hace `dispose()` de su geometría. La
  memoria queda acotada al área activa de los jugadores.
- El culling de caras es correcto entre chunks (se resolvió el bug
  original de huecos en los bordes), pero sigue siendo por-cara,
  no greedy meshing — suficiente para el tamaño actual de mundo,
  no para mundos grandes (ver Fase 6 en `TODO.md`).
- Frustum culling por chunk (Fase 6): cada chunk tiene una esfera
  envolvente calculada de su geometría real y el cliente marca
  `visible=false` los que quedan fuera del campo de visión antes
  de renderizar — solo se envían al GPU los chunks visibles. El
  HUD muestra `visibles/totales` y la métrica `__mcCullMs` mide
  el coste del pase (~0.01 ms para cientos de chunks).
- Rendimiento medido en la auditoría de Fase 4: generación 1.91 ms/
  chunk con cuevas + lagos; ~234K triángulos para un radio de vista 4
  (la Fase 2 renderizaba 310K estables — las cuevas reducen
  geometría); 16 KB/chunk en RAM (1.3 MB para el área de radio 4).
  FPS real en Chrome headless (SwiftShader, conservador): 223 chunks
  / 216,800 triángulos → mediana 125 FPS.
- Limitaciones conocidas: ninguna pendiente de la Fase 4. Los mobs ya
  no "caminan" sobre la superficie del agua: se hunden a través de
  ella y descansan en el fondo del lago (`settleOnGround` usa
  `isSolidBlock`; cubierto por `tests/unit-mobs-agua.js`). El spawn y
  el respawn del jugador usan `world.findSpawn()`, que busca en
  espiral la columna firme más cercana si la pedida es un lago, para
  que el jugador nunca aparezca nadando (cubierto por
  `tests/unit-spawn.js`).
