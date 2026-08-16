# Ayuda del servidor (administración)

Guía práctica para quien **monta o administra** el servidor. La
arquitectura detallada está en [`README.md`](./README.md) y las mecánicas
en [`mecanicas.md`](./mecanicas.md); aquí está el *cómo se usa*.

## Requisitos

- **Node.js 18+** (CommonJS, sin transpilación).
- `npm install` una vez (dependencias: `express`, `ws`,
  `simplex-noise`, `uuid`).
- Puerto libre (3000 por defecto; `PORT` para cambiarlo).
- Espacio en disco para `world/<semilla>/` y puerto http/ws abierto a
  los clientes (misma LAN o internet con proxy TLS si vas a exponerlo).

## Arranque

```bash
npm install
npm start                 # http://localhost:3000
SEED=miSemilla PORT=3998 node server.js   # mundo concreto + puerto E2E
```

Sin `SEED` el servidor arranca en **modo menú**: no carga ningún mundo
hasta que el primer jugador elige o crea uno desde el menú del juego. Con
`SEED` arranca directamente a ese mundo.

## Variables de entorno

| Variable | Efecto |
|---|---|
| `PORT` | Puerto del servidor (defecto `3000`). |
| `SEED` | Semilla del mundo por defecto; **sin** ella → modo menú. |
| `OPS` | Lista de operadores separados por comas (p. ej. `OPS=carlos,ana`). El primer jugador conectado también es operador. |
| `DAMAGE_DEBUG=1` | Log de telemetría de daño (diagnóstico). |
| `RECETAS_PATH` | Ruta de `recetas.json` cuando el servidor no es el del proyecto (usado por los E2E de hot-reload). |
| `WS_URL` | Para los tests E2E: a qué servidor conectar (`ws://host:puerto`). |

## Comandos en el chat

El primer jugador conectado (o la lista `OPS`) es **operador** y puede
usar los comandos marcados. `/help` en el juego lista todos.

| Comando | Qué hace | Solo operador |
|---|---|---|
| `/help` | Lista los comandos y los controles | no |
| `/tp <x> <y> <z>` | Teletransportar a unas coordenadas | sí |
| `/give <item> [cantidad]` | Añadir items (ID numérico o nombre, ej. `4`, `diamante`, `wooden_pickaxe`) | sí |
| `/time set <day\|noon\|night\|midnight\|ms>` | Fijar la hora del mundo (0-239999 ms) | sí |
| `/gamemode <creative\|survival>` | Cambiar el modo de juego (creative: sin hambre ni daño) | sí |
| `/op <nombre>` | Dar permisos de operador a un jugador conectado | sí |
| `/kill [nombre\|mobs]` | Matar a un jugador (sin nombre, a ti) o a todas las criaturas con `mobs` | sí |
| `/reload` | Recargar recetas y el atlas del cliente | sí |

## Recetas con hot-reload

`recetas.json` (crafteo 3x3) y `recetas_horno.json` (fundición) se
recargan automáticamente al guardarlas (**swap atómico**: un JSON inválido
conserva las anteriores). El comando `/reload` fuerza la recarga e
invalida el atlas del cliente.

## Persistencia y backups

- El mundo vive en `world/<semilla>/`: un archivo por chunk
  (`chunks/`, comprimido con gzip) y `world.json` (mobs, jugadores,
  hornos, cofres, nombre, modo de juego).
- Cada guardado escribe antes una copia `world.json.bak`.
- El formato está versionado (`SCHEMA_VERSION`, actual 6, mundo de 128
  bloques Y ∈ −64..+63). Si el mundo es de una versión más nueva que el
  servidor, este se **niega a abrirlo** en lugar de corromperlo.
- Los chunks sin jugadores cerca se descargan (y persisten) solos: la
  memoria queda acotada al área activa.

## Mantenimiento y solución de problemas

- **El servidor no llega a arrancar** → `npm install` (falta
  `simplex-noise`); `node --check` sobre los `.js` tocados para erratas de
  sintaxis.
- **Los E2E se omiten** con "no hay servidor" → arranca uno en :3998 con
  `SEED` para los clásicos; el E2E del menú levanta el suyo sin `SEED`.
- **Chunks que no guardan/cargan** → comprobar que la key `cx,cz` es
  consistente entre `world.js` y `save.js` y que
  `world/<semilla>/chunks/` existe.
- **Una receta no funciona** → `node tests/unit-recetas.js`.
- **Paradas** → el servidor responde a SIGTERM guardando el estado
  (Fase 19.5, E1).