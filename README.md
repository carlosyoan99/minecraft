# Mi Minecraft — Clon Node.js + Three.js

[![CI](https://github.com/carlosyoan99/minecraft/actions/workflows/ci.yml/badge.svg)](https://github.com/carlosyoan99/minecraft/actions/workflows/ci.yml)
![Estado de desarrollo](https://img.shields.io/badge/estado-en%20desarrollo-yellow)
![Fases completadas](https://img.shields.io/badge/fases-22%20completadas-blue)

Copia jugable de Minecraft, no idéntica pero fiel a sus mecánicas
distintivas: mundo por chunks, biomas, cuevas, día/noche, mobs con IA,
crafteo por patrón y horno. Arquitectura cliente-servidor
autoritativa, como Minecraft Bedrock: el servidor es dueño del
mundo, el cliente solo dibuja y envía inputs.

## Stack

- **Servidor:** Node.js, Express (estáticos), `ws` (WebSocket),
  `simplex-noise` (generación de terreno), `uuid`. Sin base de
  datos: el mundo se persiste en JSON en `world/`.
- **Cliente:** JavaScript vanilla + Three.js 0.160 (servido local en
  `public/vendor/`, sin CDN — juego 100 % offline en LAN).
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
├── server.js              Entrada (raíz): solo requiere server/server.js
├── server/                Código del servidor Node.js
│   ├── server.js          Arranque (carga módulos, hooks, hot-reload, guardado)
│   ├── constants.js       Fuente de verdad de IDs (B/I) y configuración (semilla, tiempos, altura −64..+63)
│   ├── state.js           Estado mutable compartido (chunks, players, mobs, furnaces, chests)
│   ├── world.js           Núcleo del mundo (clases World/Chunk, acceso a bloques); la generación vive en generation/biomes/structures/noise (F18 D-3)
│   ├── generation.js      Ruido + generateChunk (columnas, cuevas, minerales, árboles, pozos, lagos)
│   ├── items.js           POO (F13): clase ItemStack — slots de inventario/cofre/drop
│   ├── crafting.js        Recetas de crafteo y hornos (tick de fundición, desperdicio/cola C-6)
│   ├── chests.js          Cofres: inventario propio por bloque (27 slots, persistidos)
│   ├── players.js         Clase Player (POO F13); inventario en inventory.js, combate/XP en combat.js (F18 D-5)
│   ├── mobs.js            Clase base Mob + fábricas; especies en mob-species.js, spawn en mob-spawn.js, proyectiles en projectiles.js (F18 D-2)
│   ├── save.js            Orquestador de persistencia; escritura en save-chunks/save-meta/save-players (F18 D-4)
│   ├── net.js             HTTP/WebSocket, switch de mensajes y broadcast; handlers en actions.js, bucle en timers.js (F18 D-1)
│   ├── actions.js         Handlers de juego del switch (crafteo, horno, cofre, mobs, chat, ...)
│   ├── timers.js          Bucle principal (tick 20 Hz), métricas y arranque HTTP/WS
│   ├── anticheat.js       Validación del move (coords, void, sólidos, velocidad)
│   ├── mining.js          Sesiones de minería con progreso (Fase 6)
│   ├── tnt.js             TNT: mechas, explosión con cráter y reacciones en cadena (Fase 10)
│   └── commands.js        Consola de comandos (/help, /tp, /give, /time set, /gamemode)
├── recetas.json           Recetas de crafteo (patrones 3x3)
├── recetas_horno.json     Recetas de fundición
├── tests/                 Unitarios + E2E + auditorías (npm test, ver Tests)
├── public/                Cliente vanilla + Three.js (módulos ES6, sin build step)
│   ├── index.html         Entrada: importmap (Three.js local en vendor/), botón Jugar y pantalla de carga
│   ├── vendor/            Three.js 0.160 local (three.module.js + addons) — juego 100 % offline sin CDN
│   ├── client.js          Bootstrap que cablea los módulos (16 líneas)
│   ├── constants.js       Constantes del cliente (IDs, colores, texturas, durabilidad)
│   ├── loading.js         Pantalla de carga estilo Minecraft (progreso + consejos)
│   ├── lod.js             Decisión pura de LOD para chunks lejanos (histéresis)
│   ├── geopool.js         Pool de geometrías reutilizables (buffer pooling)
│   ├── debug.js           Visualizador de chunks (F3): bordes + caras para depurar culling
│   ├── connection.js      Socket WebSocket
│   ├── network.js         Dispatcher de eventos servidor→cliente
│   ├── world.js           Ciclo de vida de mallas (mapas, LOD, frustum, grietas); datos en chunkstore.js, luz en lightclient.js, geometría en meshbuild.js/lodmesh.js (F18 D-7)
│   ├── chunkstore.js      Datos de chunks en cliente (Uint8Array→bloques, antorchas)
│   ├── meshbuild.js       Construcción de mallas (materiales, pool, worker) — F18 D-7
│   ├── chunkGeometry.js   Geometría pura de chunk (greedy meshing 2D por capas + luz/AO horneados)
│   ├── chunkWorker.js     Worker ESM: construye la geometría fuera del hilo principal (F13)
│   ├── texturemap.js      Selección de tesela del atlas por bloque/cara y UVs (antes dentro de world.js)
│   ├── player.js          Física del jugador (gravedad, salto, natación)
│   ├── scene.js           Escena, cámara, renderer y luces (hemi F19.6 A1; re-exporta setToonStyle/setTorchLight)
│   ├── materialstyle.js   Material del mundo (worldMaterial) y toggle toon lambert↔MeshToonMaterial (F19.6 B)
│   ├── torchlogic.js      Lógica pura de antorchas a encender (TORCH_LIGHT_BUDGET, F19.6 A2)
│   ├── torchlights.js     Luz puntual real de antorchas cercanas (pool PointLight, toggle, F19.6 A2)
│   ├── mobs.js            Render de mobs (texturas por cara + escala por tipo + animación caminar/atacar F19.6 F)
│   ├── input.js           Despachador de input; juego en game-input.js, rayo en raycast.js, menú en menu-input.js, táctil en touch.js (F18 D-8)
│   ├── ui.js              Orquestador del HUD; HUD en hud.js, menús en menus.js, paneles en panels.js, libro en recipebook.js (F18 D-6)
│   ├── audio.js           Sonidos procedurales (Web Audio, sin assets)
│   ├── particles.js       Partículas de bloques al romper/colocar (pool con física)
│   ├── textures.js        Atlas de texturas procedural de bloques (canvas 16x16 px)
│   ├── mobtextures.js     Atlas procedural de texturas de mobs (canvas 16x16 px, reemplaza MOB_COLORS)
│   ├── itemicons.js       Iconos procedurales de ítems para inventario/hotbar/recetas
│   ├── lighting.js        Luz de antorcha por bloque (BFS pura, testeable en Node)
│   ├── daynight.js        Ciclo día/noche visual (cielo, luz, ambiente)
│   ├── sky.js             Cielo procedural: degradado, sol/luna con fases, estrellas
│   ├── skycolors.js       Paletas de color del cielo por hora del día
│   ├── clouds.js          Nubes procedurales que se desplazan con el viento (Fase 10)
│   ├── settings.js        Ajustes del menú persistidos en localStorage
│   ├── quality.js         Calidad gráfica (renderDistance, LOD, luces)
│   ├── recipeCategories.js Categorías del libro de recetas (módulo puro, testeable)
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
volver a una semilla anterior recupera su mundo). Desde la Fase 17 (A1),
**sin `SEED` el servidor arranca en modo menú**: no carga ningún mundo
hasta que el primer jugador elige/crea uno desde el menú (los E2E clásicos
necesitan `SEED=...` para recibir el `init`; el E2E del menú levanta su
propio servidor sin `SEED`).

### Controles

- `WASD` moverse, ratón mirar, `Espacio` saltar
- Clic izquierdo: romper bloque / atacar mob
- Clic derecho: colocar bloque / usar horno
- `1`-`9`: seleccionar hotbar
- `E`: abrir mesa de crafteo
- `Enter`: chat
- `F3`: visualizador de chunks (bordes + métricas de render, para
  depurar el culling)

## Requisitos del sistema

### Cliente (navegador)

| Necesario | mínimo | recomendado |
|---|---|---|
| Navegador | Chromium/Firefox/Safari recientes con WebGL2 + soporte de `importmap` | Chrome/Edge o Firefox actualizado |
| JavaScript ES modules | habilitado (defecto en todos) | — |
| Red al servidor | puerto `3000` (o `PORT`) http + `ws://` | misma LAN o servidor dedicado |
| GPU | WebGL2 sin aceleración (software) | gráfica discreta o integrada reciente |
| Hardware | CPU/media a secas, ~2 GB de RAM | 4 GB+ para mundo Medio/Grande (512/1024) y calidad alta |

Three.js 0.160 se sirve **local** (`public/vendor/three.module.js` + addons,
mapeado en el importmap): el juego no depende de CDN externos y funciona
100 % offline en LAN. En `localhost`/HTTPS un **service worker**
(`public/sw.js`) cachea los estáticos (en `http://IP` LAN el navegador no lo
registra por política). Ver [`docs/public/help.md`](docs/public/help.md).

### Servidor (Node.js)

| Necesario | requerido |
|---|---|
| Node.js | 18+ (CommonJS, sin transpilación) |
| Dependencias | `express`, `ws`, `simplex-noise`, `uuid` (`npm install`) |
| Disco | espacio para `world/<semilla>/` (chunks gzip por archivo + `world.json` + `.bak`); ~1-2 MB por área de radio 4 |
| Puerto | `3000` por defecto; configurable con `PORT` |
| Opcional | `OPS` (lista de operadores), `WS_URL`, `RECETAS_PATH`, `SEED` para arrancar modo directo |

> **Despliegue no-local (auditoría 2026-08-15, M5):** el servidor sirve
> HTTP + `ws://` (sin TLS) por diseño — el alcance del proyecto es
> `localhost` y/o la LAN local. Para exposición **fuera** de la LAN
> (una VPS, un túnel, acceso desde Internet) NO se debe abrir el puerto
> 3000 crudo: texto y claves viajarían sin cifrar y el WebSocket quedaría
> accesible a cualquiera. Se recomienda un proxy TLS (Caddy/Nginx) que
> entregue HTTPS/WSS al cliente y reenvíe al puerto local, y fijar `OPS`
> en servidores compartidos (el "primer jugador conectado" solo es
> operador cuando `OPS` está vacía). En la LAN/localhost el protocolo
> estándar `ws://` es correcto.

## Estado actual

> **Estado vivo** (fase activa, implementado frente a prospectiva y
> bloqueantes): [`STATUS.md`](STATUS.md). Grafo de prerrequisitos entre
> fases: [`DEPENDENCIAS.md`](DEPENDENCIAS.md). Especificaciones por fase
> (diseño, decisiones y estado): [`docs/README.md`](docs/README.md).

### ✅ Implementado (Fases 0 a 19.5 completadas)

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
  herramientas (valores oficiales MC desde Fase 13: 59/131/250/32/1561;
  barra de durabilidad en el hotbar, sonido de rotura y
  aviso `tool_broke`), daño de espada por material (4/5/6/7, oro 4),
  mobs nuevos (araña hostil que suelta hilo → lana, lobo hostil, conejo
  pasivo → conejo asado) y experiencia/niveles (la **salud máxima es
  siempre 20**, la barra de XP con curva MC viaja en el HUD).
- **Fase 6 — Mundo jugable y pulido:** consola de comandos
  (`/help`, `/tp`, `/give`, `/time set`, `/gamemode`, `/reload`;
  los de operador validan `isOp`), frustum culling, pantalla de
  carga, semilla seleccionable desde el menú, terreno pulido
  (transiciones de bioma suaves, cuevas con bocas), hot-reload de
  recetas/atlas, minería fina con grietas de progreso, LOD de
  chunks lejanos con histéresis, pool de geometrías, IA hostil fiel
  (spawn nocturno, quema solar), cofre de 27 slots, antorchas con
  iluminación dinámica por bloque, cama (dormir + respawn),
  armadura (12 piezas), minas abandonadas con loot, lava que quema,
  guardado comprimido con gzip, respawn según gamemode, daño por
  caída, void, texturas procedurales de mobs y iconos de ítems.
- **Fase 7 — Pulido, UX y estética:** menú principal completo
  (nombre de jugador persistido, ajustes con FOV/sensibilidad/
  volumen por categoría/calidad gráfica/renderDistance/coordenadas,
  selección y creación de mundos con nombre y semilla aleatoria 🎲),
  cielo procedural con degradado, sol/luna y estrellas (`sky.js` +
  `skycolors.js`), niebla por hora del día, partículas de bloques al
  romper/colocar (`particles.js`), HUD/menús con estilo Minecraft
  (bisel clásico, hotbar con slot dorado), métricas de tick
  servidor/cliente, animación de rotura sincronizada en
  multijugador (`block_break_progress`), resolución de fallos de
  seguridad (gate de operador, distancias, `init` limitado al radio
  de render) y limpieza de código muerto — todo procedural o CSS,
  sin assets externos.
- **Fase 8 — Caza de bugs:** corrección de los 10 bugs del playtest
  (B1-B10): combate y raycast de mobs (rango 7, feedback `mob_hit`,
  knockback), minería a mano, pérdida de vida con telemetría
  `damage_debug` + zona segura de spawn, controles A/D con opción
  invertida, ciclo día/noche a 20 min, tecla E, LOD, estrellas solo
  de noche, sol amarillo + fases lunares de 8 días, mobs multibloque
  con atlas por partes.
- **Fase 9 — Mejoras de paridad, IA, mundo y menú:** minería
  funcional (causa raíz del `mcChunks: 0` corregida), modo de juego
  por mundo persistido + borrado de mundos, curva de XP estilo
  Minecraft, azadas/cultivos, dormir salta la noche, IA por especie
  (esqueleto con flechas, fuse de creeper, quema solar, araña que
  escala, huida de pasivos, rebaño), minerales por altura y playas,
  libro de recetas por categorías (tecla B).
- **Fase 9.5 — Mejoras de skills, documentación y `.gitignore`:**
  colisión de flechas con bloques (anti-tunneling), clamp de pitch
  de cámara, backup `.bak` del guardado, variación de pitch en audio,
  documentación técnica en `docs/server/` y `docs/public/`, y
  `.gitignore` completo.
- **Fase 10 — Notas del usuario y paridad avanzada** (ver
  `docs/spec/fase10-spec.md`): bugs de las notas resueltos (salir del agua,
  quemadura de lava, `/tp` lejano, biomas de hielo sin lava, lagos
  profundos/ríos/cuevas acuáticas, hostiles en cuevas de día, amanecer
  persistente, mobs con patas animadas), tamaño de mundo por semilla
  (256/512/1024/8192), pantalla de muerte con causa, `/kill`, `test.log`
  persistente, caída de grava, TNT con reacciones en cadena, sprint con
  FOV, picker creativo (tecla E), agacharse con protección de bordes,
  AO por vértice, agua mejorada, niebla submarina, nubes que se
  desplazan, música generativa por bioma/cueva y más sonidos (TNT,
  cofres, vidrio).
- **Fase 11 — Bugs de input y cámara, biomas, paridad y tests** (ver
  `docs/spec/fase11-spec.md`): **causa raíz del clic roto**
  (pointer lock sobre `document.body` en vez del canvas — los eventos
  de ratón nunca llegaban a `input.js`; auditado con CDP 6/6), cámara
  sin vueltas (clamp `PITCH_LIMIT` redundante eliminado + test de
  regresión), resaltado del  bloque apuntado, spawn nunca en agua
  (ríos/océanos), 4 biomas nuevos (Taiga con abetos, Pantano con
  charcos y lianas, Jungla con árboles 2×2, Océano con islas — bloques
  propios 41-43, `SCHEMA_VERSION` 4), esquilar ovejas (tijeras 141),
  bonemeal, fuente de agua infinita, siseo de creeper y balido de
  oveja, y cierre de tests (`unit-fase11.js` cubre gravedad, TNT,
  mundo-size y `/kill` de Fase 10 + las mecánicas nuevas).
- **Fase 12 — Mobs por bioma, estructuras, spawn por bioma y
  persistencia de mascotas** (ver `docs/spec/fase12-spec.md`): lobo de taiga
  domesticable (hueso, sigue/sienta, collar rojo) y slime con división
  (16→2×4→2×1 HP, hop determinista por-mob), ocelote→gato que espanta
  creepers, ahogado con tridente (lanza tridentes y el jugador puede
  usarlos contra mobs); templo de jungla con trampa de flechas y cofre,
  naufragio oceánico con cofres (deterministas por semilla); **spawn por
  bioma** (`BIOME_SPAWN`: taiga→lobos de noche, pantano→slimes, jungla→
  ocelotes, océano/ríos→ahogados bajo el agua); persistencia de
  mascotas y `slimeSize` en `world.json` (`SCHEMA_VERSION` 5 con
  migración retrocompatible).
- **Fase 13 — Paridad 1.0, rendimiento, POO y tests de paridad** (ver
  `docs/spec/fase13-spec.md`): paridad de valores fijada por
  `tests/unit-paridad.js` (vida 20, curva XP oficial, espadas 4/5/6/7,
  armadura por puntos, durezas/durabilidades exactas), lagunas L1-L5
  (arco, puertas, escaleras/losas/vallas, cubo, recetas —
  `unit-lagunas.js`), **POO completa del servidor** (`ItemStack`,
  `World`/`Chunk`, `Player`/`createPlayer`, subclases de mobs +
  `createMob` — `unit-mobs-poo.js`, `unit-poo-entities.js`) y greedy
  meshing + worker de chunks (`unit-greedy`, `unit-workers`).
- **Fase 14 — Auditoría y cierre de las fases 12-13** (ver
  `docs/spec/fase14-spec.md`): bloques A (spawn por bioma, persistencia
  `SCHEMA_VERSION` 5, tridente, slime determinista), B (drop de menas con
  `ORE_DROP`, tier de pico, comida/combustible, salud/XP de mobs) y C
  (raycast único, `mobs_update` condicional, rebuild de vecinos, luz de
  antorcha stale, `sendInit` liviano) en verde.
- **Fase 15 — Corrección de auditoría y mejoras del usuario** (ver
  `docs/spec/fase15-spec.md`): copas de árboles completas en bordes de chunk
  (`pendingLeaves` + test determinista), nubes semitransparentes con
  variedad, tooltip estilizado del hotbar y **D5: mundo de 128 bloques
  (Y ∈ −64..+63, `SCHEMA_VERSION` 6 con migración retrocompatible v5→v6)**
  auditado por `tests/audit-altura.js`.

### 🏁 Roadmap completado (fases 0-19.5)

*(Todas las fases del roadmap están completadas y auditadas. El detalle
de cada una vive en su spec `docs/spec/faseN-spec.md`; el estado de cada
tarea, en `TODO.md`.)*

### ✅ Fase 16 — cerrada y auditada

La **Fase 16** (`docs/spec/fase16-spec.md`) corrigió la auditoría 2026-08-10
(`docs/audits/auditoria-2026-08-10.md`), los bugs de `docs/Notas del usuario.md`
y la paridad restante: niebla submarina ≥2 bloques, cofres eliminables
con Shift, IA de mobs con aggro, inventario con texturas/tooltip, libro
de recetas corregido, calidad con `renderScale`, guardado asíncrono,
validación de coordenadas, anti-cheat v2, horno con `FUEL_TICKS` reales,
drops de zombi/creeper, puertas ×3, vidrio 200 t, carbón vegetal, XP de
slime/lobo, pantalla completa y el bloque G de cobertura de tests y docs
(`audit-fase7` CDP ampliado, `e2e-cofre` +16 checks, c8 con umbrales,
`e2e-durabilidad` recalibrado al mundo v6).

### ✅ Fase 17 — cerrada y auditada

La **Fase 17** (`docs/spec/fase17-spec.md`) trajo el menú inicial tipo
Minecraft: servidor en modo menú sin cargar mundo (A1), pantalla
principal, gestión completa de mundos (reproducir/clonar/renombrar/
cambiar modo/eliminar), ajustes en pestañas, flujo `join_world`, 7 bugs
del usuario (persistencia de inventario por nombre, heartbeat, watchdog
de chunks, flor/hierba, cuevas largas, mobs en creativo, minado
continuo), pausa estilo Minecraft, **skins de jugador** (9 oficiales con
selector y vista previa 3D) y controles táctiles. Auditoría final
completa: 54/54 unitarios, E2E 7/7 en solitario y verificación en
navegador del flujo completo.

### ✅ Fase 18 — cerrada y auditada

La **Fase 18** (`docs/spec/fase18-spec.md`) completó la paridad con MC
(franjas día/noche, minerales v6, zanahoria/patata, carbón vegetal,
`MOB_XP`, horno, recetas de mena fuera, orbes de XP, sonidos) y refactorizó
los módulos grandes a convenciones por responsabilidad (`net.js`→
actions/timers, `mobs.js`→mob-species/spawn/projectiles, `world.js`→
noise/biomes/generation/structures, `save.js`, `players.js`, cliente, ...)
sin tocar el wire ni `SCHEMA_VERSION`. Cierre: 57 unitarios en verde, E2E,
auditorías recalibradas y biome 0 errores.

### ✅ Fase 19 — cerrada

La **Fase 19** (`docs/spec/fase19-spec.md`) añadió UI visual (texturas)
y drag & drop del inventario/hotbar: cobertura total de iconos por ID
(142/142), rediseño MC de los paneles (fondos del atlas + biseles),
tooltip unificado con delay, drag & drop (`dragdrop.js` + lógica pura
`draglogic.js`, eventos `inventory_swap`/`grid_return`/`chestSlot`),
hot-reload del atlas de iconos y táctil/responsivo. Cierre: 57 unitarios,
auditorías 6/6, E2E 7/7 y biome 0 errores. Estado vivo en `STATUS.md`.

### ✅ Fase 19.5 — cerrada y auditada

La **Fase 19.5** (`docs/spec/fase19.5-spec.md`) trajo audio por bioma
(evento `biome_update` del servidor + paleta pura `musicpalette.js`, con
prioridad cueva > bioma > día/noche), accesibilidad (teclado en paneles
`a11y-nav.js`, contraste del HUD, no-solo-color, toggle `reduceMotion`),
auditoría del raycast y **tokens CSS en `:root`** + higiene del servidor
(SIGTERM, `server/log.js` con niveles uniformes). Cierre: **58 unitarios**,
auditorías 6/6, E2E 7/7 y biome 0 errores.

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
| `set_name` | `{name}` | Cambiar el nombre visible del jugador (menú/ajustes, Fase 7): se sanea (≤16 chars) y se propaga con `player_rename` |
| `settings` | `{renderDistance}` | Ajustes que afectan al servidor (Fase 7): distancia de render (clamp 2-10) → regenera/reenvía los chunks del nuevo radio |
| `chat` | `{message}` | Mensaje de chat (máx 200 chars; con `/` es un comando) |
| `till` | `{x, y, z}` | Arar tierra con azada (`FARMLAND`, Fase 9) |
| `plant` | `{x, y, z}` | Plantar semillas en tierra arada (cultivo, Fase 9) |
| `sleep` | `{}` | Dormir en la cama apuntada (solo de noche; salta al amanecer, Fase 6) |
| `shear_mob` | `{mobId}` | Esquilar una oveja con tijeras (1-3 lana sin dañarla, Fase 11) |
| `bonemeal` | `{x, y, z}` | Harina de hueso: madura cultivos o genera plantas (Fase 11) |
| `creative_pick` | `{itemId}` | Poner un ítem del catálogo creativo en el slot activo (Fase 9/10) |
| `creative_fly` | `{flying}` | Alternar vuelo en modo creativo (Fase 9) |
| `world_delete` | `{seed}` | Borrar un mundo guardado (solo operador; no el activo, Fase 9) |
| `equip_armor` / `unequip_armor` | `{slot}` / `{}` | Equipar/des-equipar armadura (Fase 7) |
| `recipe_book` | `{}` | Pedir las recetas para el libro (Fase 9) |

**Servidor → Cliente:**

| event | data | Propósito |
|---|---|---|
| `init` | posición, spawn, chunks, `food`, `saturation`, `xp/level/maxHealth`, `dayTime`, `seed`, `name` | Estado inicial, solo con los chunks del radio de render (Fase 7; se reenvía tras `set_seed`) |
| `seed_rejected` | `{reason}` | El servidor no pudo cambiar de semilla (otros jugadores o mundo ilegible) |
| `worlds_list` | `{worlds}` | Lista de mundos guardados: `{seed, name, chunkCount, lastSaved}` (Fase 7) |
| `chunks_add` / `chunks_unload` | `{chunkData}` / `{keys}` | Chunks nuevos / a descargar |
| `block_update` | `{x, y, z, blockId}` | Cambio de bloque replicado |
| `block_break_progress` | `{x, y, z, stage}` | Grieta de rotura (0-9, -1 al cancelar) durante la minería — broadcast a todos los jugadores en rango del bloque (Fase 6/7) |
| `player_join` / `player_move` / `player_leave` | posición, yaw | Otros jugadores (con `name` en `player_join`) |
| `player_rename` | `{id, name}` | Un jugador cambió su nombre → se actualizan los tags flotantes (Fase 7) |
| `mobs_update` / `mob_death` / `mob_breed` / `mob_hit` | mobs, `{id}`, posición | Mobs en rango (movimiento, muerte, cría y feedback de daño con `dmg`/`health`, Fase 8) |
| `arrows_update` | `[arrowSnapshot]` | Flechas y tridentes en vuelo (gravedad/colisión, Fase 9) |
| `server_metrics` | `{tickMs, chunkGenMs}` | Media móvil de 1s del tiempo por tick y de generación de chunks (Fase 7): el cliente lo expone como `window.__mcServerTickMs` / `__mcChunkGenMs` |
| `time_set` | `{dayTime}` | Re-sincroniza el ciclo día/noche (comando `/time set`, dormir, Fase 6/8) |
| `textures_reload` | `{}` | Hot-reload del atlas: el cliente re-importa `textures.js` y reconstruye los chunks (Fase 6) |
| `teleport` | `{x, y, z}` | Corrección anti-cheat |
| `player_die` / `death` | `{id, lostInventory}` / `{cause}` | Muerte de otro jugador y pantalla de muerte del local con causa (mob/fall/lava/starve/void/kill, Fase 10) |
| `fire_state` | `{on}` | El jugador está en llamas (overlay de fuego, Fase 10) |
| `tnt_fuse` / `tnt_explode` | `{x, y, z}` / `{x, y, z, ...}` | Mecha encendida y explosión de TNT replicadas (Fase 10) |
| `inventory_update` | `{inventory}` | Inventario completo (con `durability`) |
| `health_update` | `{health, maxHealth}` | Salud |
| `food_update` | `{food, saturation}` | Hambre y saturación |
| `xp_update` / `level_up` | `{xp, level, xpInto, xpToNext}` | Experiencia (curva no lineal estilo MC) |
| `tool_broke` | `{slot}` | Herramienta rota (sonido + aviso) |
| `eat_rejected` | `{}` | "No tienes hambre" |
| `sleep_ok` / `sleep_rejected` | `{}` | Dormir aceptado (salta al amanecer) o rechazado (de día) |
| `crafting_grid_update` | `{grid, success}` | Resultado del crafteo |
| `furnace_state` | `{key, ...}` | Estado del horno (combustible, progreso) |
| `chest_state` | `{key, slots}` | Slots del cofre abierto (27) |
| `recipe_book` | `{recipes}` | Recetas para el libro por categorías (Fase 9) |
| `world_delete_result` | `{seed, ok}` | Resultado del borrado de un mundo (Fase 9) |
| `damage_debug` | `{...}` | Telemetría de daño por origen (diagnóstico, Fase 8) |
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
  - **Fase 8 (bugs B3/B6 y B9):** `unit-raycast.js` (bounds obsoletos del
    geometry pool → el rayo de minería no intersectaba; fix `release()`
    nullea los bounds y verificación del culling `expandByObject` con three
    real) y `unit-mobray.js` (raycast de mobs multibloque: el rayo acierta
    las partes, sube al raíz con `mobId`, el bloque delante gana a la
    minería).
  - **Fase 8 (mejoras documentadas):** `unit-anticheat.js` (anti-cheat de
    vuelo: ascenso validado contra la parábola del salto; `WS_MAX_PAYLOAD`
    del WebSocket) y `unit-caida.js` (daño por caída y void, con la
    velocidad vertical observada).
  - **Fase 9 (paridad):** `unit-fase9.js` (gamemode por mundo, `world_delete`
    con path-traversal rechazado, cultivos, `creative_pick`/`creative_fly`,
    libro de recetas) y `unit-mining-click.js` (decisión de clic mob
    delante/detrás con three real).
  - **Fase 10 (jugabilidad):** `unit-fase11.js` también cubre mecánicas de
    Fase 10 pendientes — gravedad de arena/grava (`settleColumn`), TNT
    (`ignite` → mecha → explosión con cráter y bedrock intacto), tamaño de
    mundo (bloques fuera de límites → aire), `/kill` (solo operadores).
  - **Fase 11 (biomas y paridad):** `unit-fase11.js` (los 4 biomas nuevos
    presentes, lianas/árboles por bioma, spawn nunca en agua,
    `canShear`/`applyShear`, bonemeal y fuente de agua infinita) y
    `unit-camara.js` (fix del clamp de pitch: PLC r160 limita ±90° sin
    vueltas, con three real).
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
    (`tests/e2e-durabilidad.js` — craftea un pico de madera, rompe sus 59
    usos de piedra y verifica que se rompe al llegar a 0 sin duplicar drops),
    del cofre (`tests/e2e-cofre.js` — craftea un cofre con 8 tablones,
    lo coloca, lo abre, guarda/toma items y lo rompe verificando que cae
    como item) y de hot-reload (`tests/e2e-reload.js` — edita `recetas.json` del
    servidor y verifica que el watcher recarga y avisa por chat, que
    `/reload` responde y que un JSON inválido se rechaza sin tumbar el
    servidor; pasa `RECETAS_PATH` si el servidor no es el del proyecto).
- Flags del runner: `node tests/run.js --unit` (solo unitarios),
  `node tests/run.js --audit` (solo auditorías standalone), `WS_URL=...`
  `node tests/run.js --e2e` (solo E2E contra ese servidor) y
  `node tests/run.js --unit --filter <regex>` (solo los unitarios que casan con
  el regex, con tiempo por test).
- Cobertura: `npm run test:coverage` (c8 — `--all` sobre `server/` y `public/`).
  La matriz completa módulo→test y los umbrales están en
  [`docs/tests.md`](docs/tests.md).
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
  - `node tests/audit-fase7.js` — métricas de tick del servidor y FPS en
    Chrome headless vía CDP (con `--regresion` lanza además la suite
    unitaria de fases 0-6) + integridad del guardado tras varios reinicios.
  - `node tests/audit-altura.js` — auditoría del mundo de 128 bloques
    (−64..+63, Fase 15 D5): layout, superficie, cuevas, biomas, minerales,
    agua, estructuras, costuras, migración v5→v6 y geometría del cliente
    (72 checks; se ejecuta también con `node tests/run.js --audit`).

### Resultados (agosto 2026)

Suite completa: **58 tests unitarios + 7 E2E** (si hay servidor; el E2E
del menú levanta el suyo) — ver la matriz en
[`docs/tests.md`](docs/tests.md). La suite cubre persistencia, IA de
mobs, handlers de red, integridad de recetas, sincronización
servidor↔cliente, hot-reload, minería fina, LOD, pool de geometrías, greedy
meshing + worker, cofre, antorchas, cama, armadura, terreno, caída/void,
anti-cheat (vuelo + v2 velocidad/hover), crack, métricas, raycast/pool con
three real, cámara, biomas de Fase 11, mecánicas de Fase 11/12/16,
matemática del ciclo día/noche (F16 G3), Fase 17 (modo menú, persistencia
por nombre, plantas, creativo, cuevas) y skins (F17 C3), POO del
servidor (F13), paridad de valores (F13), lagunas L1-L5 y el mundo de 128
bloques (`audit-altura.js`, 72 checks). Los E2E contra un servidor real con
mundo fresco cubren comer, durabilidad, cofre, reload, mascotas, templo y
el flujo de menú (con `SEED` para los clásicos, sin `SEED` el del menú).
La verificación final antes de cerrar fase se detalla en `docs/tests.md`.

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
  versionado con `schemaVersion` (actual: 6): si el mundo es de una
  versión más nueva que el servidor, este se niega a abrirlo en
  lugar de corromperlo.
- Los chunks lejanos se descargan automáticamente: el servidor
  suelta (persistiéndolos antes) los chunks sin jugadores cerca y
  avisa al cliente, que hace `dispose()` de su geometría. La
  memoria queda acotada al área activa de los jugadores.
- El culling de caras es correcto entre chunks (se resolvió el bug
  original de huecos en los bordes). Desde la Fase 13 la geometría
  además se construye con **greedy meshing** (fusiona caras coplanares
  del mismo bloque por capa) en un **Web Worker** (`public/chunkWorker.js`
  → `chunkGeometry.js`), fuera del hilo principal, con luz de antorcha y
  AO horneados en la clave de fusión (ver `docs/spec/fase13-spec.md`).
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

## Acerca de

**Proyecto:** Mi Minecraft — copia jugable del clon de Minecraft, fiel a
sus mecánicas distintivas pero hecha desde cero como herramienta
educativa de arquitectura cliente-servidor autoritativa (chunks, biomas,
cuevas, día/noche, mobs con IA, crafteo por patrón y horno).

**Estado actual:** fases 0-19.5 completadas y auditadas; Fase 19.6
(prospectiva) y siguientes en la hoja de ruta. Ver [`STATUS.md`](STATUS.md)
para el estado vivo.

**Stack:** Node.js + Express + `ws` + `simplex-noise` en el servidor
(CommonJS, sin base de datos — persistencia JSON en `world/`); JavaScript
vanilla + Three.js 0.160 en el cliente (ES modules, sin build step, sin
assets binarios: texturas, iconos, sonidos y cielo procedurales).

**Guías de ayuda:** [`docs/server/help.md`](docs/server/help.md) (servidor
y administración) y [`docs/public/help.md`](docs/public/help.md) (cliente
y jugabilidad). En el juego, el menú principal tiene los botones **❓
Ayuda** y **📖 Acerca de**; en el chat, `/help` lista los comandos.

**Repositorio:** <https://github.com/carlosyoan99/minecraft>

**Licencia:** MIT (© 2026 Carlos) — ver [`LICENSE`](LICENSE).
