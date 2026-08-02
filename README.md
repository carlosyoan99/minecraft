# Mi Minecraft — Clon Node.js + Three.js

Copia jugable de Minecraft, no idéntica pero fiel a sus mecánicas
distintivas: mundo por chunks, biomas, día/noche, mobs con IA,
crafteo por patrón y horno. Arquitectura cliente-servidor
autoritativa, como Minecraft Bedrock: el servidor es dueño del
mundo, el cliente solo dibuja y envía inputs.

## Stack

- **Servidor:** Node.js, Express (estáticos), `ws` (WebSocket),
  `simplex-noise` (generación de terreno), `uuid`. Sin base de
  datos: el mundo se persiste en JSON en `world/`.
- **Cliente:** JavaScript vanilla + Three.js (vía CDN/importmap).
  Sin build step, sin framework. Un único HTML que carga
  `client.js` como módulo ES6.

No hay TypeScript, bundler ni ORM a propósito — el proyecto se
mantiene simple y auditable de punta a punta.

## Por qué cliente-servidor autoritativo

La primera versión tenía toda la lógica en el navegador: inseguro
(F12 y listo), sin soporte multijugador real, sin IA persistente.
El servidor ahora valida cada movimiento y acción de bloque,
corrige al cliente si detecta algo imposible (velocidad, posición
dentro de un bloque sólido), y es la única fuente de verdad del
mundo.

## Estructura

```
mi-minecraft/
├── server.js              Entrada: requiere módulos, conecta hooks y arranca
├── constants.js           Configuración y constantes del servidor (B/I, mobs)
├── state.js               Estado mutable compartido (chunks, players, mobs...)
├── world.js               Generación, bloques y archivos de chunk
├── crafting.js            Recetas de crafteo y hornos
├── players.js             Inventario, salud y daño de jugadores
├── mobs.js                IA de mobs
├── save.js                Persistencia por chunk + descarga de chunks
├── net.js                 HTTP/WebSocket, handlers y bucle principal
├── recetas.json           Recetas de crafteo (patrones 3x3)
├── recetas_horno.json     Recetas de fundición
├── package.json
├── world/                 Persistencia: chunks/ (un archivo por chunk) + world.json
├── tests/                 Tests unitarios + E2E (npm test, runner tests/run.js)
└── public/                Cliente modular (módulos ES6, ver arriba en README)
```

## Ejecutar en local

```bash
npm install
node server.js
```

Abrir `http://localhost:3000`. Clic en "Jugar" para bloquear el
ratón.

### Controles

- `WASD` moverse, ratón mirar, `Espacio` saltar
- Clic izquierdo: romper bloque / atacar mob
- Clic derecho: colocar bloque
- `1`-`9`: seleccionar hotbar
- `E`: abrir mesa de crafteo
- `Enter`: chat

## Estado actual

Funcional: generación de mundo por biomas (llanura, bosque,
desierto, tundra nevada y montañas con cumbres de nieve: el bioma de
montaña eleva el terreno hasta alturas de 26 bloques y su superficie
es roca o nieve según la altitud; la tundra y las cumbres usan el
nuevo bloque de nieve, sólido y rompible a mano), cuevas generadas
con ruido 3D bajo la superficie (túneles conexos, deterministas y
continuos entre chunks, sin romper superficie ni bedrock), lagos
generados con ruido 2D (agua translúcida, no sólida, con
flotación/natación: gravedad reducida, hundimiento lento y nadar
hacia arriba con espacio; el fondo es arena y no se puede romper el
agua), chunks
bajo demanda, texturas pixel-art generadas proceduralmente (atlas
16x16 por cara en un canvas, sin assets binarios), sonidos
procedurales con Web Audio API (romper/colocar bloques, pasos,
ambiente día/noche con pájaros y grillos — sin archivos de audio en
el repo), ciclo día/noche visual real (cielo, luz solar y ambiente
interpolados con el reloj del servidor), barra de hambre con
decaimiento,
regeneración de salud y penalización por inanición (autoritativa en
el servidor), drops de comida cruda de animales (vaca, cerdo,
pollo, oveja) al morir, recetas de horno para cocinarla
(cruda → cocinada) y comer con clic derecho (hambre +
saturación, la cocinada restaura más), alimentación y cría de
animales (la hierba suelta trigo/zanahoria/semillas que alimentan
a vaca/oveja, cerdo y pollo: modo amor → pareja → bebé que crece
hasta adulto), mobs hostiles y pasivos con máquina de estados
simple,
crafteo por patrón, horno con combustible y cocción, persistencia
cada 30s, multijugador básico por WebSocket.

Fase 5 (progresión y combate): durabilidad real de herramientas
(madera 60, piedra 132, hierro 251, oro 33, diamante 1562 usos; se
desgastan al romper bloques o atacar con espada y se rompen al llegar
a 0, con barra de durabilidad en el hotbar, sonido de rotura y
aviso), daño de espada por material (madera 3 → diamante 6), nuevos
mobs (araña hostil rápida que suelta hilo, lobo hostil resistente y
conejo pasivo que se cría con zanahoria; 4 hilos se craftean en lana
y el conejo crudo se cocina en el horno) y experiencia simple/niveles
(matar mobs y minar minerales dan XP; cada nivel suma +1 de salud
máxima, máx +10, con barra de XP y nivel en el HUD).

Pendiente / simplificado a propósito: sin durabilidad de armaduras ni
encantamientos, sin comerciantes ni aldeas (ver `Won't` del TODO). Ver
`TODO.md` para el plan de desarrollo por fases y `CLAUDE.md` para
las convenciones que sigue el proyecto.

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
- Sin framework: cada test es un script Node.js plano que termina con
  código de salida 0/1; `tests/run.js` los encadena. Flags: `--unit`
  (solo unitarios) y `--e2e` (solo E2E, con `WS_URL`).
- Para que los handlers de red sean testeables, `net.js` exporta
  `handleConnection` (además de `broadcast` y `start`): los tests le pasan un
  `ws` fake y ejercitan cada evento sin abrir el puerto.

### Resultados (agosto 2026)

Suite completa en verde: **13 tests unitarios + 2 E2E** (si hay servidor).
Última ejecución: todos los unitarios pasan (incluidos los 5 nuevos:
persistencia, IA de mobs, handlers de red, integridad de recetas y
sincronización servidor↔cliente), y los E2E contra un servidor real con
mundo fresco dan comer 5/5 y durabilidad 124/124. La auditoría de la Fase 5
sigue cubriendo la sincronización de durabilidad y la no-duplicación de
items; los nuevos unitarios amplían la red de seguridad a toda la base.
- `node tests/audit-fase3.js` ejecuta la herramienta de auditoría de la
  Fase 3 (balance del hambre por simulación + rendimiento del tick de
  mobs con cría + persistencia).
- `node tests/audit-fase4.js` ejecuta la auditoría de la Fase 4: valida
  el culling de caras con cuevas (replicando la regla del cliente:
  sólidos contra aire o agua, agua solo contra aire, lecho de lagos
  incluido) y hace benchmark de generación en tiempo real
  (1.91 ms/chunk, memoria 16 KB/chunk, regeneración bit-idéntica).
- `node tests/audit-fase5.js` ejecuta la auditoría de la Fase 5: verifica
  que la durabilidad se sincroniza servidor ↔ cliente (mapas
  `TOOL_DURABILITY`/`DURABILITY` idénticos, `durability` en el wire, barra
  en el HUD), que no hay duplicación de items al romperse una herramienta
  a mitad de una acción (secuencia del handler replicada: 1 drop, 0
  copias), y el comportamiento de XP/niveles (tope +10 de salud máxima).

## Rendimiento y límites conocidos

- El guardado es incremental por chunk: cada chunk se persiste en
  `world/chunks/` (un archivo por chunk) y solo se reescribe cuando
  cambia; mobs y hornos viven en `world/world.json`. El formato
  antiguo (`world.dat` único, v1) se migra automáticamente al
  arrancar a v2 y se conserva como `world.dat.legacy`. El formato
  está versionado con `schemaVersion`: si el mundo es de una
  versión más nueva que el servidor, este se niega a abrirlo en
  lugar de corromperlo.
- Los chunks lejanos se descargan automáticamente: el servidor
  suelta (persistiéndolos antes) los chunks sin jugadores cerca y
  avisa al cliente, que hace `dispose()` de su geometría. La
  memoria queda acotada al área activa de los jugadores.
- El culling de caras es correcto entre chunks (se resolvió el bug
  original de huecos en los bordes), pero sigue siendo por-cara,
  no greedy meshing — suficiente para el tamaño actual de mundo,
  no para mundos grandes.
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
