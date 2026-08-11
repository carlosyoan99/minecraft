# AGENTS.md — Guía rápida para agentes de IA

Guía compacta de arranque. La guía canónica de convenciones es
[`CLAUDE.md`](CLAUDE.md). El **tracker de tareas por fase** (solo
estados `[ ]`/`[x]`) está en [`TODO.md`](TODO.md); la **verdad de qué se
hizo y cómo** vive en las especificaciones de [`docs/`](docs/README.md)
(`docs/faseN-spec.md`). Léelos.

## Qué es

Clon de Minecraft. Servidor Node.js **autoritativo** (Express + `ws`,
sin BD: persistencia en JSON) + cliente vanilla Three.js servido sin
build step desde `public/`. Todo el código, docs y commits en español.

## Comandos

```bash
npm install                     # primera vez (node_modules está en .gitignore)
node server.js                  # servidor en http://localhost:3000 (PORT=... para otro puerto)
node tests/run.js               # 50 unitarios + 6 E2E si hay servidor vivo
node tests/run.js --unit        # solo unitarios
node tests/run.js --audit       # solo auditorías por fase standalone (3-6 + altura)
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E (necesita servidor)
PORT=3998 node server.js        # servidor para los E2E, en otra terminal
node tests/audit-fase7.js       # render CDP con Chrome headless (por separado; ver abajo)
```

Verificación mínima antes de entregar (CLAUDE.md §"Cómo trabajar"):
`node --check` sobre los `.js` tocados, `node tests/run.js --unit`,
arrancar el servidor y confirmar que sirve `/`.

## Arquitectura

- **El servidor es la única fuente de verdad**: validación, física e
  inventario viven en el servidor; el cliente solo predice y dibuja.
  Nunca mover lógica al cliente "por comodidad".
- **Servidor CommonJS** (`require`), **cliente ES modules** (`import`).
  No mezclar estilos.
- **Entradas mínimas**: `server.js` solo cablea hooks de broadcast
  (evita ciclos de require) y arranca; `public/client.js` solo importa
  módulos. Toda la lógica vive en módulos por responsabilidad
  (`net.js`, `world.js`, `save.js`, `players.js`, `mobs.js`, `items.js`,
  ...). Módulos >~400-500 líneas → dividir.
- **POO del servidor (Fase 13, C3)**: `ItemStack` (`server/items.js`) es la
  clase de los slots de inventario/cofre/drop (`{id, count, durability}`,
  JSON idéntico al wire); `world.js` exporta una INSTANCIA de `World`
  (métodos en el prototipo; `world.getChunk` devuelve un `Chunk` con
  `save`/`load`); `players.js` exporta `Player` + la factory
  `createPlayer` (los jugadores conectados son instancias); `mobs.js`
  define subclases por especie (`Zombie`, `Creeper`, `Slime`, ...) con
  hooks `tickSpecies`/`onDeath` y la fábrica `createMob` (`MOB_CLASSES`).
  Las clases NO cambian el wire ni el guardado: el JSON de una instancia es
  igual al de los literales anteriores.
- **Cliente sin build step**: `public/index.html` usa importmap con
  Three.js 0.160 desde unpkg. Si el CDN es inalcanzable, servir
  `three.module.js` local y mapearlo en el importmap.
- **Recetas**: `recetas.json` (crafteo 3x3) y `recetas_horno.json`
  (fundición). Hot-reload con swap atómico: editarlas recarga el
  servidor automáticamente (JSON inválido conserva las anteriores).
- **Mundos por semilla**: `world/<semilla>/`. La semilla se configura
  con la env var `SEED` (defecto `miSemilla2026`) o desde el menú del
  juego. Cambiar la semilla **no pisa** mundos anteriores.

## Fuentes de verdad que hay que sincronizar a mano

Verificado por tests, pero hay que actualizarlas en el mismo cambio:

- `constants.js` (servidor) ↔ `public/constants.js` (cliente): IDs de
  bloques/ítems (`B`/`I`), constantes de mundo, comida/cría. Lo audita
  `tests/unit-sync.js`.
- `TOOL_DURABILITY` (servidor) ↔ `DURABILITY` (cliente): lo audita
  `tests/audit-fase5.js`.
- **Regla:** añadir bloque/ítem/herramienta → actualizar AMBOS lados
  y añadir la receta si aplica.
- **Formato de guardado:** `SCHEMA_VERSION` (actual 5), archivos por
  chunk en `world/<semilla>/chunks/` + `world/<semilla>/world.json`
  (+ copia de seguridad `world.json.bak` en cada guardado).
  Cualquier cambio exige subir versión + migración retrocompatible +
  test (modelo: `tests/unit-persistencia.js`).

## Convenciones

- Español: comentarios, variables, mensajes de commit. Eventos WS en
  `snake_case` (`block_action`, `furnace_state`, ...).
- Commits: una preocupación por commit, formato `Fase N: resumen` o
  `área: resumen` (ver `CONTRIBUTING.md`).
- Cliente y servidor se actualizan **en el mismo commit** cuando tocan
  el mismo tema (formato de chunk, protocolo WS, inventario).
- Mecánicas nuevas llevan su test; cada fase termina con auditoría.

## Errores frecuentes

1. `Cannot find module 'simplex-noise'` → falta `npm install`.
2. E2E omitidos con "no hay servidor" **no es un fallo**: arranca
   `PORT=3998 node server.js` en otra terminal.
3. Bugs de render (`mcChunks: 0`) solo se ven en navegador; los tests
   de servidor no los detectan. Usa F3/`window.__mc*` para diagnosticar.
4. Cambiar `SEED` en `constants.js` rompe tests deterministas
   (`unit-mundo.js`, `unit-biomas.js`, ...).
5. Una receta que no funciona → `node tests/unit-recetas.js`.
6. Chunks que no guardan/cargan → key `cx,cz` consistente entre
   `world.js` y `save.js`, y que `world/<semilla>/chunks/` existe.

## Fuera de alcance (no hacer sin preguntar)

- BD externa, autenticación/cuentas, redstone, dimensiones, aldeas
  generadas, clima.
- Optimización prematura (greedy meshing, workers...) salvo que una
  spec de `docs/` la indique.
- Adelantar trabajo de fases futuras: las fases 0-15 están cerradas y
  auditadas. La **Fase 13** (paridad 1.0 + rendimiento + POO del servidor)
  está **completada y auditada**: paridad de valores fijada por
  `unit-paridad.js`, greedy meshing + worker de chunks
  (`unit-greedy`/`unit-workers`), lagunas L1-L5 (arco, puertas,
  escaleras/losas/vallas, cubo, recetas — `unit-lagunas.js`) y POO
  completa (`ItemStack`/`World`/`Chunk`/`Player`/`createMob`,
  `unit-mobs-poo.js` + `unit-poo-entities.js`). La **Fase 14** está cerrada
  y auditada (paridad real + rendimiento). La **Fase 15** está cerrada y
  auditada (copas de árboles en bordes de chunk, nubes semitransparentes y
  tooltip del hotbar — el grueso de su spec se cerró junto a la Fase 13; la
  suite tiene 50 unitarios). No adelantar trabajo más allá de lo que
  `TODO.md` marque.

## Documentación

- Especificaciones por fase (**fuente de verdad** del qué/cómo): `docs/`,
  índice en [`docs/README.md`](docs/README.md).
- `TODO.md` es SOLO el tracker de tareas por fase (`[ ]`/`[x]`) y no
  crece con detalle: bugs, decisiones, mecánicas y auditorías se
  documentan en la spec de su fase.
- Arquitectura y mecánicas (cómo funciona + por qué):
  [`docs/server/`](docs/server/README.md) y
  [`docs/public/`](docs/public/README.md). Actualízalas cuando una
  mecánica cambie de comportamiento.
