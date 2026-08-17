# Servidor — Mecánica: persistencia (guardado asíncrono)

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/save.js` (orquestador), `server/save-chunks.js`,
> `server/save-meta.js`, `server/save-players.js`.

## Cómo funciona actualmente

- **Guardado incremental por chunk:** solo se reescriben los chunks sucios
  (`dirtyChunks`) y `world.json` (mobs, hornos, cofres, cultivos, hora) al
  final; `atomicWrite` (tmp+rename) y el `.bak` del `world.json` anterior
  mantienen la integridad.
- **Generación determinista (F20 B4/P4):** la generación ya no marca dirty —
  el RNG por chunk (`generation.js`, sembrado por semilla+cx,cz) regenera
  los chunks intactos IDÉNTICOS, así que explorar no escribe cientos de
  archivos sin cambios (solo los chunks con modificaciones del jugador se
  persisten).
- **Cola asíncrona fuera del event loop** (`saveWorldAsync`, F16 C1/REN-1/
  SV-4): el autosave del `setInterval` ya no escribe síncronamente (que
  congelaba el servidor con cientos de chunks y era la causa de los
  timeouts E2E). La cola procesa los chunks por **lotes de 6** con
  `setImmediate`, cediendo el turno al bucle principal entre lotes. El
  chunk se borra de `dirtyChunks` **al escribirse**, así un chunk
  re-ensuciado durante el guardado no se pierde; un error de escritura
  elimina la clave para no reintentar en bucle infinito; y la llamada es
  **idempotente** (si ya hay cola en curso, no abre otra).
- **`saveWorld()` síncrono se conserva** para los puntos que necesitan el
  resultado inmediato (`switchWorld` y SIGINT); solo el autosave periódico
  usa la cola.
- **Jugadores por nombre** (F17 B1, `save-players.js`): inventario/salud/XP
  se persisten por nombre de jugador con ruta saneada (sin path traversal);
  se restauran al entrar al mundo.
- **Meta y migraciones** (`save-meta.js`): `world.json` con `worldGamemode`,
  tamaño y hora; migraciones retrocompatibles v1→v6 (la v5→v6 sube el dato
  viejo a local 64..127 y rellena el fondo con piedra); un mundo de una
  versión más nueva se rechaza con mensaje claro (no se pisa).

## Por qué así (decisión)

- **Incremental + determinista** para no escribir el mundo entero en cada
  autosave: explorar no genera escrituras (los chunks regenerados son
  idénticos), solo las modificaciones reales se persisten.
- **Cola asíncrona con `setImmediate`** mantiene el servidor respondiendo a
  20 Hz mientras guarda; el lote de 6 es el equilibrio medido entre
  progreso de escritura y latencia de tick.
- **tmp+rename + .bak** garantizan que un corte a mitad de escritura nunca
  deje un chunk/meta corrupto como "válido".
- **`SCHEMA_VERSION` + migraciones** permiten evolucionar el formato sin
  invalidar mundos de jugadores; el rechazo de versiones futuras evita
  corromper datos que el servidor viejo no entiende.

## Mejoras a futuro

1. **Subida del mundo a 256** (F22, plan): `SCHEMA_VERSION` 7 + migración
   v6→v7 (el dato de 128 bloques se re-ubica o se regenera el fondo).
2. **Guardado de jugadores asíncrono** (REN-1 ya implementado en la v20.2);
   a futuro, **debounce por jugador** para no escribir en cada cambio.
3. **Backup rotatorio de `world.json`** (más de un `.bak`): hoy solo el
   anterior; un `.bak.1`/`.bak.2` daría más margen ante corrupción.
4. **Persistencia de dimensiones** (F24, plan): `world/<semilla>/nether/`
   como carpeta propia (opción B), sin migrar la raíz.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `SCHEMA_VERSION` | `6` | Formato de guardado |
| `dirtyChunks` | Set de keys `cx,cz` | Chunks pendientes de escritura |
| `saveWorldAsync` | cola `setImmediate`, lotes de 6 | Autosave sin congelar el bucle |
| `saveWorld()` | síncrono | `switchWorld` y SIGINT |
| `atomicWrite` | tmp+rename | Escritura atómica |
| `savePlayer`/`restorePlayer` | ruta por nombre saneada | Jugadores (F17 B1) |
| `switchWorld` / `listWorlds` | — | Gestión de mundos |
| migración v5→v6 | — | Sube dato viejo a local 64..127 |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Mundo a 256 (F22) | `SCHEMA_VERSION` 7, migración retrocompatible + test, `audit-altura` recalibrada |
| Backups rotatorios | `.bak.1`/`.bak.2` de `world.json`; test en `unit-persistencia` |
| Dimensiones (F24) | Carpeta `world/<semilla>/nether/`, posición por dimensión sin subir `SCHEMA_VERSION` |
