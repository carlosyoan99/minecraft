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
├── server.js              Entrada (1 línea): requiere server/server.js
├── server/                Código del servidor Node.js
│   ├── server.js          Arranque (carga módulos, hooks, hot-reload, guardado)
│   ├── constants.js       Fuente de verdad de IDs (B/I) y configuración (semilla, tiempos)
│   ├── state.js           Estado mutable compartido (chunks, players, mobs, furnaces, chests)
│   ├── world.js           Generación (biomas, cuevas, lagos) y archivos de chunk
│   ├── crafting.js        Recetas de crafteo y hornos (tick de fundición)
│   ├── chests.js          Cofres: inventario propio por bloque (27 slots, persistidos)
│   ├── players.js         Inventario, hambre, salud, XP y daño de jugadores
│   ├── mobs.js            IA de mobs (máquina de estados) y drops
│   ├── save.js            Persistencia incremental por chunk + descarga de chunks
│   ├── net.js             HTTP/WebSocket, handlers y bucle principal
│   ├── mining.js          Sesiones de minería con progreso (Fase 6)
│   └── commands.js        Consola de comandos (/help, /tp, /give, /time set, /gamemode)
├── recetas.json           Recetas de crafteo (patrones 3x3)
├── recetas_horno.json     Recetas de fundición
├── tests/                 Unitarios + E2E + auditorías (npm test, ver Tests)
├── public/                Cliente vanilla + Three.js (módulos ES6, sin build step)
│   ├── index.html         Entrada: importmap (Three.js CDN), botón Jugar y pantalla de carga
│   ├── client.js          Bootstrap que cablea los módulos (14 líneas)
│   ├── constants.js       Constantes del cliente (IDs, colores, texturas, durabilidad)
│   ├── loading.js         Pantalla de carga estilo Minecraft (progreso + consejos)
│   ├── lod.js             Decisión pura de LOD para chunks lejanos (histéresis)
│   ├── geopool.js         Pool de geometrías reutilizables (buffer pooling)
│   ├── debug.js           Visualizador de chunks (F3): bordes + caras para depurar culling
│   ├── connection.js      Socket WebSocket
│   ├── network.js         Dispatcher de eventos servidor→cliente
│   ├── world.js           Chunks: geometría, UVs del atlas, culling, dispose
│   ├── player.js          Física del jugador (gravedad, salto, natación)
│   ├── scene.js           Escena, cámara, renderer y luces
│   ├── mobs.js            Render de mobs (texturas por cara + escala por tipo)
│   ├── input.js           Ratón (pointer lock), teclado, clics
│   ├── ui.js              HUD (salud, hambre, XP, hotbar, durabilidad) + menú con semilla
│   ├── audio.js           Sonidos procedurales (Web Audio, sin assets)
│   ├── textures.js        Atlas de texturas procedural de bloques (canvas 16x16 px)
│   ├── mobtextures.js     Atlas procedural de texturas de mobs (canvas 16x16 px, reemplaza MOB_COLORS)
│   ├── lighting.js        Luz de antorcha por bloque (BFS pura, testeable en Node)
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
npm start
# o directamente: node server.js
```

Abrir `http://localhost:3000`. En el menú, el botón **🌍 Mundos**
(Fase 7) muestra los mundos guardados (clic para abrirlos) y
permite **crear uno nuevo**: escribe un nombre (opcional) y una
semilla, o pulsa **🎲** para generar una semilla aleatoria al
instante. Al crear, el servidor cambia el mundo activo a esa
semilla (persistiendo el anterior), guarda el nombre en
`world.json` y la pantalla de carga cubre la generación. También
puedes escribir una **semilla** en el campo del menú principal y
clic en "Jugar". Vacío usa la semilla por defecto. El botón **⚙️
Ajustes** (Fase 7) persiste en `localStorage` la distancia de
render, el **FOV** (50-110), la **sensibilidad del ratón**
(20-300%), el **volumen por categoría** (maestro/efectos/ambiente),
la **calidad gráfica** (baja/media/alta: pixelRatio y sombras) y
mostrar las coordenadas en pantalla. Para un puerto
distinto: `PORT=3998 node server.js`. La semilla por defecto también se
configura con la env var `SEED=miNuevaSemilla node server.js` (cada semilla tiene su propio mundo en `world/<semilla>/`;
volver a una semilla anterior recupera su mundo).

### Controles

- `WASD` moverse, ratón mirar, `Espacio` saltar
- Clic izquierdo: romper bloque / atacar mob
- Clic derecho: colocar bloque / usar horno
- `1`-`9`: seleccionar hotbar
- `E`: abrir mesa de crafteo
- `Enter`: chat
- `F3`: visualizador de chunks (bordes + métricas de render, para
  depurar el culling)

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
- **Fase 7 — Estética Minecraft:** cielo procedural con degradado,
  sol/luna y estrellas (`sky.js` + `skycolors.js`), niebla por hora
  del día, partículas de bloques al romper/colocar (`particles.js`)
  y HUD/menús con estilo Minecraft (bisel clásico, tipografía con
  sombra, hotbar con slot dorado) — todo procedural o CSS, sin assets.
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

- **Fase 6** en curso (ver `TODO.md`). Ya hechas: consola de comandos
  (`/help`, `/tp`, `/give`, `/time set`, `/gamemode` — creative con
  **minería instantánea**: romper es inmediato, sin desgaste de
  herramienta ni drops; **comandos de operador**: `/gamemode`,
  `/give`, `/tp`, `/time` y `/reload` solo los ejecuta un jugador con
  `isOp` — el primero en conectar, los de la env var `OPS` (nombres
  separados por comas) o los que otro operador promueva con
  `/op <nombre>`), frustum culling
  en el cliente (el HUD muestra visibles/totales), pantalla de carga
  estilo Minecraft, **semilla seleccionable desde el menú** (campo
  "Semilla del mundo" → `set_seed`; el servidor cambia el mundo
  activo y cada semilla tiene su propio directorio), **terreno
  pulido**: transiciones de bioma suaves (alturas interpoladas
  continuamente, sin acantilados en las fronteras) y cuevas que abren
  bocas hacia la superficie, **hot-reload de recetas y atlas**: al
  editar `recetas.json`/`recetas_horno.json` o `public/textures.js` (o
  con `/reload`) el servidor recarga las recetas con swap atómico y
  avisa a los clientes para que regeneren el atlas en caliente, sin
  reiniciar nada, y **minería fina**: dureza por bloque y velocidad
  según la herramienta (mantén pulsado el clic para minar, con grietas
  de progreso; piedra/minerales solo sueltan drop con pico — con la
  herramienta equivocada o a mano se rompe igual pero sin drop), y
  **LOD de chunks lejanos**: más allá de 56 bloques los chunks se
  renderizan con geometría simplificada (un quad por columna con el
  color plano del bloque de superficie, sin teselas finas, ~256 quads
  en vez de miles de caras); al acercarte a <44 bloques vuelven al
  detalle completo (histéresis: sin parpadeo en la frontera), y
  **pool de geometrías**: las `BufferGeometry` de los chunks se
  reutilizan al cargar/descargar/reconstruir (antes `dispose()` +
  reconstrucción completa), reutilizando también los arrays cuando el
  tamaño coincide (menos allocs y uploads al GPU), e **IA hostil más
  fiel**: los hostiles solo aparecen de noche (de día generan pasivos),
  hacen spawn en cualquier chunk cargado del área de render (nunca a
  <24 bloques del jugador ni en lagos) y los no-muertos
  (zombie/esqueleto) **arden con el sol** — pierden 1 HP/s mientras
  están expuestos al cielo (techos/árboles dan sombra), se tiñen de
  fuego en el cliente y mueren sin drop ni XP. **Cofre**: bloque de
  almacenamiento con inventario propio de 27 slots (abre con clic izquierdo,
  guarda/toma items apilando y conservando la durabilidad de las
  herramientas, se persiste en `world.json` y al romperse cae como item — su
  contenido se pierde, simplificación documentada). **Antorchas con
  iluminación dinámica**: luz POR BLOQUE además de la luz global — BFS de
  luz en `public/lighting.js` horneada en colores por vértice (de noche las
  antorchas iluminan claramente, de día apenas se notan); necesitan un
  bloque sólido adyacente para colocarse y caen si se rompe su soporte.
  **Cama**: dormir de noche salta al amanecer y fija el punto de
  reaparición (crafteable con 3 lana + 3 tablones; de día rechaza con
  aviso "solo de noche"; al romperla se limpia el respawn).
  **Armadura**: casco, pechera, pantalones y botas en cuero, hierro y
  diamante (12 piezas crafteables, equipables con clic derecho, con su
  propia barra de durabilidad en el inventario) que reducen el daño
  entrante y se desgastan con los golpes. **Terreno**: minas
  abandonadas con pasillos subterráneos y cofres de loot, pozos
  decorativos de agua/lava en superficie (la lava es un bloque nuevo
  que quema al contacto: 2 HP cada 500 ms) y **guardado comprimido con
  gzip** (los chunks se escriben en disco ~20x más pequeños,
  retrocompatible con los mundos JSON viejos). **Respawn según
  gamemode**: al morir en survival se pierde el inventario, la armadura
  y la mesa de crafteo (el HUD se vacía con `inventory_update`); en
  creative no se pierde nada (la XP y el nivel se mantienen siempre).
  **Daño por caída**: al aterrizar tras una caída de más de 3 bloques
  pierdes 1 HP por bloque extra (el servidor infiere el suelo desde el
  mundo; el agua lo anula y la armadura lo reduce). **Caer del mundo
  (void)**: por debajo de y=-8 mueres y reapareces (en creative conservas
  el inventario). **Texturas procedurales de mobs**: cada tipo (11 en
  total) tiene su atlas pixel-art 2x2 (frente/lado/arriba/abajo) generado
  en `public/mobtextures.js`, que reemplaza los `MOB_COLORS` planos; los
  meshes se construyen texturizados por cara (UVs remapeadas al atlas) en
  `public/mobs.js` y la quema solar sigue tiñendo al mob en llamas.
  **Iconos procedurales de ítems** (`public/itemicons.js`): atlas de
  sprites 16x16 pixel-art en canvas — bloques con bisel y motas,
  comida cruda/cocinada, lingotes, gemas, materiales, las 20
  herramientas y las 12 piezas de armadura (plantilla por forma +
  color por material) — que reemplazan el swatch de color y el texto
  en hotbar, mesa de crafteo, horno, cofre y slots de armadura.
  Pendientes: estética del cielo/HUD, etc.

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
| `block_action` | `{action: "break"\|"place"\|"break_cancel", x, y, z, itemId}` | Minar (sesión con progreso, Fase 6), colocar bloque o cancelar la mina |
| `craft` | `{grid}` | Craftear desde el grid 3x3 |
| `grid_set` / `grid_clear` | celda / — | Mover ítem del inventario a la mesa |
| `furnace_open` | `{x, y, z}` | Abrir un horno |
| `furnace_action` | `{action: "add_fuel"\|\"add_input", invSlot}` / `{action: "collect_output"}` / `{action: "close"}` | Gestionar el horno abierto |
| `chest_open` | `{x, y, z}` | Abrir un cofre (valida distancia y bloque) |
| `chest_action` | `{action: "put", invSlot}` / `{action: "take", chestSlot}` / `{action: "close"}` | Mover items entre el cofre y el inventario |
| `inventory_select` | `{slot}` | Seleccionar slot del hotbar |
| `eat` | `{}` | Comer el ítem seleccionado (rechazado si está lleno) |
| `feed_mob` | `{mobId}` | Alimentar un animal (modo amor → cría) |
| `attack_mob` | `{mobId}` | Atacar un mob (daño, desgaste, drops, XP) |
| `set_seed` | `{seed, name?}` | Elegir/crear la semilla del mundo desde el menú (Fase 6/7): cambia el mundo activo, lo renombra con `name` si llega, y reenvía el `init` |
| `worlds_list` | `{}` | Pedir la lista de mundos guardados (menú de mundos, Fase 7) |
| `chat` | `{message}` | Mensaje de chat (máx 200 chars; con `/` es un comando) |

**Servidor → Cliente:**

| event | data | Propósito |
|---|---|---|
| `init` | posición, spawn, chunks, `food`, `saturation`, `xp/level/maxHealth`, `dayTime`, `seed` | Estado inicial (se reenvía tras `set_seed`) |
| `seed_rejected` | `{reason}` | El servidor no pudo cambiar de semilla (otros jugadores o mundo ilegible) |
| `worlds_list` | `{worlds}` | Lista de mundos guardados: `{seed, name, chunkCount, lastSaved}` (Fase 7) |
| `chunks_add` / `chunks_unload` | `{chunkData}` / `{keys}` | Chunks nuevos / a descargar |
| `block_update` | `{x, y, z, blockId}` | Cambio de bloque replicado |
| `block_break_progress` | `{x, y, z, stage}` | Grieta de rotura (0-9, -1 al cancelar) durante la minería — broadcast a todos los jugadores en rango del bloque (Fase 6/7) |
| `player_join` / `player_move` / `player_leave` | posición, yaw | Otros jugadores |
| `mobs_update` / `mob_death` / `mob_breed` | mobs, `{id}`, posición | Mobs en rango |
| `server_metrics` | `{tickMs, chunkGenMs}` | Media móvil de 1s del tiempo por tick y de generación de chunks (Fase 7): el cliente lo expone como `window.__mcServerTickMs` / `__mcChunkGenMs` |
| `time_set` | `{dayTime}` | Re-sincroniza el ciclo día/noche (comando `/time set`) |
| `textures_reload` | `{}` | Hot-reload del atlas: el cliente re-importa `textures.js` y reconstruye los chunks (Fase 6) |
| `teleport` | `{x, y, z}` | Corrección anti-cheat |
| `player_die` | `{id, lostInventory}` | Muerte y reaparición (`lostInventory`: se perdió el inventario según gamemode) |
| `inventory_update` | `{inventory}` | Inventario completo (con `durability`) |
| `health_update` | `{health, maxHealth}` | Salud |
| `food_update` | `{food, saturation}` | Hambre y saturación |
| `xp_update` / `level_up` | `{xp, level}` | Experiencia |
| `tool_broke` | `{slot}` | Herramienta rota (sonido + aviso) |
| `eat_rejected` | `{}` | "No tienes hambre" |
| `crafting_grid_update` | `{grid, success}` | Resultado del crafteo |
| `furnace_state` | `{key, ...}` | Estado del horno (combustible, progreso) |
| `chest_state` | `{key, slots}` | Slots del cofre abierto (27) |
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
  - **Fase 4 (terreno):** `unit-mundo.js` (cuevas, lagos y bocas de cueva
    hacia la superficie), `unit-biomas.js` (nieve, montaña y transiciones
    suaves: altura continua entre columnas adyacentes), `unit-mobs-agua.js`
    (mobs se hunden en el agua) y `unit-spawn.js` (spawn sobre tierra firme).
  - **Fase 5 (progresión):** `unit-durabilidad.js` (durabilidad, XP y mobs
    nuevos).
  - **Fase 6 (IA hostil):** dentro de `unit-mobs-ia.js` — quema solar
    (zombie/esqueleto arden de día al aire libre, 1 HP/s, no de noche ni
    bajo techo, mueren sin drop), spawn por fase del día (solo pasivos de
    día, hostiles de noche) y distancia mínima de 24 bloques al jugador.
  - **Fase 6 (supervivencia):** `unit-cama.js` (dormir de noche salta al
    amanecer, rechazo de día, respawn en la cama y limpieza al romperla)
    y `unit-armadura.js` (reducción de daño por pieza y material, tope
    0.8, desgaste al recibir golpes, armadura ignorada en inanición,
    equipar/des-equipar con swap conservando durabilidad, recetas y
    cuero como drop de vaca/conejo) y `unit-respawn.js` (respawn según
    gamemode: en survival al morir se pierden inventario, armadura y
    mesa de crafteo — `inventory_update` vacío y `player_die` con
    `lostInventory` —; en creative no hay daño y se conserva todo) y
    `unit-caida.js` (daño por caída: fórmula estilo Minecraft, caída real
    vía moves con inferencia del suelo, el agua que lo anula, y void:
    muerte/reaparición según gamemode).
  - **Fase 6 (terreno):** `unit-terreno.js` (minas abandonadas: túneles
    bajo tierra sin romper la superficie ni el bedrock y cofres de loot
    con su estado; pozos de agua/lava con lecho de arena; gzip del
    guardado: cabecera, round-trip idéntico, compresión efectiva y
    JSON plano retrocompatible; lava no sólida y no minable).
  - **Fase 6 (dev):** `unit-reload.js` (hot-reload de recetas: swap atómico,
    JSON inválido y receta malformada mantienen las tablas anteriores), el
    test del comando `/reload` dentro de `unit-red.js`, `unit-mineria.js`
    (dureza/velocidad de rotura, drop condicional y sesiones de minería:
    completar, cancelar por bloque cambiado/distancia, herramienta
    equivocada que rompe sin drop), `unit-lod.js` (LOD de chunks
    lejanos: distancias límite exactas, histéresis — conservar el tier
    en la banda intermedia — y un único cambio de tier al acercarse o
    alejarse; importa `public/lod.js` como ESM vía copia `.mjs`) y
    `unit-geopool.js` (pool de geometrías: reutilización real de la
    misma geometría y del mismo array al re-adquirir, tope del pool
    con dispose del exceso, categorías separadas, categoría
    desconocida → dispose, y `setOrReuseAttribute` con tamaño igual
    vs distinto), `unit-cofre.js` (estado del cofre y handlers
    `chest_open`/`chest_action`: put apilando y conservando
    durabilidad, cofre/inventario llenos, receta y rotura que
    elimina el estado) y `unit-antorchas.js` (soporte y caída,
    place rechazado/aceptado, bloque no sólido, receta y el motor
    de luz del cliente `public/lighting.js`: atenuación 0.8/paso,
    alcance 7, oclusión con pared completa y antorcha lejana
    ignorada).
  - **Fase 7 (estética):** `unit-itemicons.js` (iconos procedurales de
    ítems: todo id conocido tiene icono 16x16 no vacío, el atlas cubre
    el mismo universo, determinismo y distinguibilidad — lingote
    hierro vs oro, pico por material, cruda vs cocinada, etc.) y
    `unit-ajustes.js` (lógica pura de `public/quality.js`: perfiles de
    calidad baja/media/alta, clamps de FOV 50-110, sensibilidad
    0.2-3 y volumen 0-1).
  - **Integridad transversal:** `unit-recetas.js` (todas las recetas de
    crafteo/horno referencian IDs existentes, shapes bien formadas y
    alcanzables desde su grid — habría detectado el bug `hilo_a_lana` de la
    Fase 5 —, y la **cadena de obtención de las 20 herramientas**: cada
    una tiene receta con palos + su material, y cada material es alcanzable
    en juego — tronco a mano → planks → palos → pico de madera → adoquín →
    horno → lingotes por fundición → hierro/oro, diamante minado directo —
    con la progresión de picos continua y combustible del horno obtenible
    desde la primera madera; ninguna herramienta queda inaccesible) y
    `unit-sync.js` (los IDs de bloques/ítems y constantes compartidas están
    sincronizados entre `constants.js` del servidor y `public/constants.js`
    del cliente).
  - Y, si hay un servidor vivo en `ws://localhost:3998` (o `$WS_URL`), los
    E2E de comer (`tests/e2e-comer.js`), de durabilidad
    (`tests/e2e-durabilidad.js` — craftea un pico de madera, rompe sus 60
    usos de piedra y verifica que se rompe al llegar a 0 sin duplicar drops),
    del cofre (`tests/e2e-cofre.js` — craftea un cofre con 8 tablones,
    lo coloca, lo abre, guarda/toma items y lo rompe verificando que cae
    como item) y de hot-reload (`tests/e2e-reload.js` — edita `recetas.json` del
    servidor y verifica que el watcher recarga y avisa por chat, que
    `/reload` responde y que un JSON inválido se rechaza sin tumbar el
    servidor; pasa `RECETAS_PATH` si el servidor no es el del proyecto).
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
  - `node tests/audit-fase6.js` — LOD de chunks lejanos: comparación de
    caras/triángulos con y sin LOD (radio 6 completo, regla EXACTA del
    cliente), memoria de geometría por chunk, pool de geometrías en ciclo
    real de carga/descarga y determinismo del caparazón LOD.

### Resultados (agosto 2026)

Suite completa en verde: **24 tests unitarios + 4 E2E** (si hay servidor).
Última ejecución: todos los unitarios pasan (persistencia, IA de mobs,
handlers de red, integridad de recetas, sincronización servidor↔cliente,
hot-reload, minería fina, LOD, cofre, antorchas, cama, armadura y
terreno incluidos), y los E2E contra un servidor real con mundo fresco
dan durabilidad 124/124, reload 4/4, comer 5/5 (el bonus de caza puede
omitirse si no aparece un animal cercano, quedando 3/3 — los checks
base siempre pasan) y cofre 12/12.
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
  reescribe cuando cambia; mobs, hornos y cofres viven en
  `world/<semilla>/world.json`. **Los archivos de chunk se comprimen
  con gzip** (mismo nombre `.json`; la lectura detecta la cabecera y
  descomprime, así los mundos viejos en JSON plano se siguen
  leyendo sin migración). **Cada semilla tiene su propio
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
  el coste del pase (~0.01 ms para cientos de chunks). Pulsa **F3**
  para el visualizador de chunks: grid rojo con los bordes de cada
  chunk sobre el terreno y panel con FPS, posición, chunks
  visibles/totales, caras de geometría (cuenta también las del LOD)
  y triángulos renderizados (`public/debug.js`).
- **LOD simple de chunks lejanos (Fase 6):** la decisión de nivel de
  detalle es pura y testeable (`public/lod.js`, `lodTierFor` con
  histéresis: se entra en LOD a >56 bloques del centro del chunk y
  se vuelve al detalle completo a <44, conservando el tier en la
  banda intermedia — sin parpadeo; la distancia es horizontal para
  que el tier no alterne al subir/bajar colinas). Los chunks LOD
  usan un caparazón de quads por columna (color plano del bloque de
  superficie vía `BLOCK_COLORS`, sin atlas) con muros laterales
  donde el vecino es más bajo, material compartido `vertexColors`
  que reacciona al día/noche; `updateLod()` hace el swap al cruzar
  el umbral (throttle 250 ms) y el frustum culling, la descarga y el
  hot-reload del atlas cubren ambos tiers. Cubierto por
  `tests/unit-lod.js` (fronteras exactas, histéresis y un único flip
  al acercarse/alejarse).
- **Pool de geometrías (Fase 6):** al cargar/descargar/reconstruir un
  chunk, su geometría vuelve a un pool por categoría
  (`public/geopool.js`, `createGeometryPool` con tope por categoría)
  en vez de `dispose()`; `setOrReuseAttribute` reutiliza el array
  subyacente cuando el tamaño coincide (evita alloc de Float32Array y
  re-upload completo al GPU — el coste dominante de la
  reconstrucción). Los materiales compartidos siguen sin tocarse.
  Cubierto por `tests/unit-geopool.js` (reutilización real, tope,
  categorías separadas y `setOrReuseAttribute`). El F3 muestra
  reutilizadas/creadas/liberadas (`__mcGeoPool`).
- Rendimiento medido en la auditoría de Fase 6: **LOD de chunks lejanos**
  (herramienta `tests/audit-fase6.js` + medición real en Chrome headless
  vía CDP, SwiftShader — números conservadores): en el área de render
  completa (radio 6, 169 chunks), 136 quedan en LOD y 33 en detalle
  completo (el navegador confirma los mismos conteos). Triángulos 234K con
  LOD vs 560K sin LOD (reducción del 58%); un chunk LOD cuesta ~78% menos
  que su versión full. Geometría bruta 22.8 MB con LOD vs 51.2 MB sin LOD.
  FPS reales: **100.5 de media (136.5 estables) con LOD frente a 24.3 (30
  estables) sin LOD** con el mismo mundo y la misma cámara (~94K vs ~209K
  triángulos renderizados; heap 48 MB vs 85 MB) — el LOD multiplica por
  ~4.5 el rendimiento del anillo lejano dentro de la niebla (fog 40-140).
  El pool de geometrías reutilizó 91 geometrías de 174 creadas en la
  sesión real de navegador (55%), y el ciclo de carga/descarga en Node
  reutiliza la misma geometría y el mismo array sin allocs nuevos.
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
