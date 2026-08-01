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

Funcional: generación de mundo por biomas, chunks bajo demanda,
mobs hostiles y pasivos con máquina de estados simple, crafteo por
patrón, horno con combustible y cocción, persistencia cada 30s,
multijugador básico por WebSocket.

Pendiente / simplificado a propósito: sin texturas (bloques a
color plano), sin hambre, sin cuevas (terreno macizo), sin agua,
sin durabilidad de herramientas. Ver `TODO.md` para el plan de
desarrollo por fases y `CLAUDE.md` para las convenciones que sigue
el proyecto.

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
