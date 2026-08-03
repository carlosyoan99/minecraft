# AGENTS.md — Guía rápida para agentes de IA

Guía compacta de arranque. La guía canónica de convenciones es
[`CLAUDE.md`](CLAUDE.md); el roadmap por fases y la fase en curso
están en [`TODO.md`](TODO.md). Léelos.

## Qué es

Clon de Minecraft. Servidor Node.js **autoritativo** (Express + `ws`,
sin BD: persistencia en JSON) + cliente vanilla Three.js servido sin
build step desde `public/`. Todo el código, docs y commits en español.

## Comandos

```bash
npm install                     # primera vez (node_modules está en .gitignore)
node server.js                  # servidor en http://localhost:3000 (PORT=... para otro puerto)
node tests/run.js               # 16 unitarios + 3 E2E si hay servidor vivo
node tests/run.js --unit        # solo unitarios
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E (necesita servidor)
PORT=3998 node server.js        # servidor para los E2E, en otra terminal
node tests/audit-fase3.js       # auditorías por fase (también 4 y 5)
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
  (`net.js`, `world.js`, `save.js`, `players.js`, `mobs.js`, ...).
  Módulos >~400-500 líneas → dividir.
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
- **Formato de guardado:** `SCHEMA_VERSION` (actual 2), archivos por
  chunk en `world/<semilla>/chunks/` + `world/<semilla>/world.json`.
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
- Optimización prematura (greedy meshing, workers...) salvo que el
  `TODO.md` lo indique.
- Adelantar trabajo de fases futuras: la **Fase 6** está en curso en
  `TODO.md`.
