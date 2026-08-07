# Fase 7 — Pulido, UX y estética (Spec)

> Documento de especificación de la Fase 7, **reconstruido a posteriori**: la
> fase está COMPLETADA y auditada. Se elabora a partir del `TODO.md` (sección
> Fase 7 con su auditoría y playtest) y del historial de git, en el mismo
> formato que `fase8-spec.md` / `fase9-spec.md`.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA (agosto 2026)** · Proyecto: clon de
> Minecraft (servidor Node autoritativo `server/` + cliente Three.js
> `public/`, todo en español).

---

## 1. Resumen

La Fase 7 es la fase de **pulido, UX y estética**: convertir las mecánicas en
una experiencia pulida y con aspecto Minecraft. Cuatro áreas:

1. **Menú principal completo**: nombre de jugador, nombres flotantes,
   ajustes del juego, selección/creación de mundos y coordenadas en pantalla.
2. **Texturas y estética Minecraft**: texturas procedurales para mobs,
   iconos de ítems, cielo procedural con sol/luna, niebla, partículas y
   HUD/menús con estilo Minecraft.
3. **Supervivencia pulida**: daño por caída, muerte por caer al vacío y
   respawn según gamemode.
4. **Rendimiento, multijugador y auditoría**: métrica de tiempo por tick,
   animación de rotura sincronizada y **playtest** que produjo los 10 bugs
   que se corrigen en la Fase 8.

**Resultado:** la fase se cerró con la auditoría (`audit-fase7.js`) en verde y
el playtest documentado — los bugs encontrados se priorizaron y pasaron a la
Fase 8 como B1-B10.

---

## 2. Contexto del proyecto (estado al inicio, verificado)

Tras las Fases 1-6 (cimientos, sensorial, supervivencia, terreno,
progresión, mundo jugable):

- El juego tiene minería fina, IA de mobs, cofres, antorchas, cama,
  armadura, comandos, LOD, pool de geometrías y guardado por semilla.
- **Pero el menú es básico** (sin nombre de jugador, sin ajustes, sin
  selección de mundos en la UI completa), los mobs se ven con colores planos
  (sin texturas), los ítems son swatches de color, y faltan el daño por
  caída y la muerte por vacío. El rendimiento no se mide en vivo y la rotura
  de bloques no se ve sincronizada entre jugadores.

---

## 3. Objetivos

1. Menú principal completo: nombre de jugador, ajustes, mundos y
   coordenadas.
2. Estética Minecraft: texturas de mobs, iconos de ítems, cielo, niebla,
   partículas y estilo CSS.
3. Supervivencia pulida: caída, void y respawn por gamemode.
4. Métricas de tick (servidor + cliente) y rotura sincronizada entre
   jugadores.
5. Playtest (manual + headless) que recoja bugs para la Fase 8.

---

## 4. Bloques de trabajo

### Menú principal: nombre, ajustes y mundos

- **Nombre de jugador**: campo en el menú persistido en `localStorage`
  (`mc_name`, defecto "Jugador-XXXX"); viaja con `?name=` en la URL del WS y
  con `set_name`; saneado (≤16 caracteres, sin caracteres de control). El
  `init` lo incluye; `player_join`/`player_move`/`player_rename` lo propagan
  y el chat muestra el nombre.
- **Nombres flotantes** sobre los jugadores: `THREE.Sprite` de canvas en
  `public/mobs.js`, actualizados con `player_rename`.
- **Ajustes del juego** (`public/settings.js`, persistidos en `localStorage`
  `mc_settings`): distancia de render (viaja con `settings {renderDistance}`,
  clamp 2-10, aplica en `ensureChunksAround`), FOV (50-110), sensibilidad
  (20-300%), volumen por categoría (maestro/efectos/ambiente, 0-100%) y
  calidad gráfica (baja/media/alta → pixelRatio y sombras). La lógica pura
  vive en `public/quality.js` (testeada en `unit-ajustes.js`); `audio.js`
  gana gains por categoría (`setVolume`) y `scene.js` `applyQuality`/`setFov`.
- **Selección y creación de mundos**: `save.listWorlds()` lee los
  subdirectorios de `world/`; evento `worlds_list`; menú con lista de mundos
  (clic → `set_seed`) y "crear nuevo mundo" con semilla escrita o aleatoria
  (🎲). `world.json` gana un campo opcional `name` (lectura defensiva, **sin**
  subir SCHEMA_VERSION).
- **Mostrar coordenadas**: overlay opcional en el HUD (`x, y, z`, ~10
  actualizaciones/s), activable desde los ajustes.

### Texturas y estética Minecraft

- **Texturas procedurales para mobs** (`public/mobtextures.js`, reemplazan
  `MOB_COLORS`); meshes texturizados por cara en `public/mobs.js`.
- **Iconos de ítems** (`public/itemicons.js`): atlas procedural de sprites
  16×16 pixel-art (bloques con bisel y motas, comida, lingotes, gemas,
  herramientas, armadura); CSS recorta el sprite por posición con
  `image-rendering: pixelated`; lógica de dibujo PURA (testeada en
  `unit-itemicons.js`).
- **Estética Minecraft** (`public/skycolors.js` + `public/sky.js`): cielo
  con degradado, banda cálida de amanecer/atardecer, sol/luna opuestos y
  estrellas de noche (dome procedural con ShaderMaterial); niebla por hora
  (`daynight.js`); partículas al romper/colocar bloques (`public/particles.js`
  desde `block_update`); `estilo.css` pasa a look Minecraft (botones/paneles
  grises biselados, hotbar con slot activo dorado, crosshair con contorno).

### Supervivencia pulida

- **Daño por caída** (`players.js` `fallDamage`/`applyFallDamage`): el
  servidor detecta estar en el aire (bloque bajo los pies no sólido;
  `EYE_HEIGHT` compartida con el cliente, auditada por `unit-sync.js`),
  registra el pico de la caída desde el último suelo firme y al aterrizar
  aplica `floor(bloques) − 3` (1 HP por bloque a partir de 3; 23 = muerte),
  que pasa por armadura y se ignora en creative. El agua anula el daño.
- **Morir al caer del mundo** (void): `VOID_Y = -8`; en el handler de `move`,
  si `y < VOID_Y` se llama `respawnPlayer` (en creative se conserva el
  inventario para no dejar al jugador cayendo para siempre).
- **Respawn según gamemode**: en survival el inventario se pierde al morir
  (se vacían inventario, armadura y mesa de crafteo — sin entidades de item
  se pierden); en creative se conserva. La XP/nivel se conservan siempre.
  `player_die` incluye `lostInventory` para matizar el aviso.

### Rendimiento

- **Métrica de tiempo por tick** (server + client): `mainLoop` mide el tick
  con media móvil de 1 s y hace broadcast de `server_metrics {tickMs,
  chunkGenMs}`; `world.generateChunk` acumula su tiempo (`takeChunkGenMs`);
  el cliente expone `window.__mcServerTickMs`/`__mcChunkGenMs` en el HUD F3.

### Multijugador visible

- **Animación de rotura sincronizada**: `net.js` gana `broadcastNear`
  (filtra por distancia, 7 bloques) y `broadcastMining`; el crack del cliente
  pasa a overlay POR-BLOQUE (`Map` por "x,y,z" con material clonado por
  grieta) — varios jugadores pueden minar a la vez y cada uno ve el progreso
  de los demás; stage -1 y `block_update` ocultan solo la grieta de ese
  bloque.

### Caza de errores y auditoría

- **Playtest** (manual + headless): recolectar bugs en "Bugs conocidos" y
  corregirlos. ✅ Hecho: el playtest produjo los **10 bugs** documentados y
  priorizados en la sección "Fase 8 — Caza de bugs" (combate, minería a mano,
  pérdida de vida sin causa, controles, día/noche, tecla E, LOD, estrellas,
  sol/luna y mobs). La auditoría (`audit-fase7.js`) verifica tick de
  servidor, FPS en Chrome headless e integridad del guardado tras reinicios;
  la pasada de limpieza dejó biome a 0 errores.

---

## 5. Protocolo WS y eventos (introducidos aquí)

| Evento | Dirección | Contenido |
| --- | --- | --- |
| `?name=` (URL WS) + `set_name` | C→S | nombre de jugador |
| `player_rename` | S→C | cambio de nombre en tiempo real |
| `settings` | C→S | `{renderDistance}` (clamp 2-10) |
| `worlds_list` | S→C | lista de mundos (semilla, lastSaved, nº de chunks, name) |
| `server_metrics` | S→C | `{tickMs, chunkGenMs}` (media móvil 1 s) |
| `block_break_progress` | S→C | broadcast a jugadores en rango (rotura sincronizada) |
| `player_die` | S→C | incluye `lostInventory` |

---

## 6. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `public/settings.js`, `public/quality.js` | (nuevo) ajustes + lógica pura de calidad |
| `public/mobtextures.js`, `public/itemicons.js`, `public/skycolors.js`, `public/sky.js`, `public/particles.js` | (nuevos) estética |
| `public/ui.js`, `public/index.html`, `public/estilo.css` | menú de mundos, ajustes, coords, estilo Minecraft |
| `public/mobs.js` | nombres flotantes, texturas de mobs |
| `public/world.js`, `public/network.js` | crack por-bloque, partículas, métricas |
| `public/debug.js` | `__mcServerTickMs`/`__mcChunkGenMs` en F3 |
| `public/player.js` | coords en pantalla |
| `server/players.js` | caída, void, respawn por gamemode |
| `server/net.js` | `set_name`, `settings`, `server_metrics`, `broadcastNear`/`broadcastMining` |
| `server/save.js` | `listWorlds()`, campo `name` en world.json |
| `server/constants.js`, `public/constants.js` | `EYE_HEIGHT`, `VOID_Y` (paridad en `unit-sync`) |
| `tests/unit-ajustes.js`, `unit-itemicons.js`, `unit-sky.js`, `unit-caida.js`, `unit-respawn.js`, `unit-metricas.js`, `unit-crack.js`, `audit-fase7.js` | cobertura y auditoría |

---

## 7. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|
| 1 | Nombre de jugador | En `localStorage`, saneado, propagado por eventos; sin cuentas/auth (fuera de alcance) |
| 2 | Ajustes | Persistidos en `mc_settings`; solo `renderDistance` afecta al servidor |
| 3 | Mundos | Lista por semilla + crear con nombre/semilla/🎲; `name` opcional sin bump de schema |
| 4 | Caída/void | Daño `floor(bloques) − 3` desde 3 bloques; void con respawn; el agua anula la caída |
| 5 | Respawn | Survival pierde el inventario; creative lo conserva; la XP siempre se conserva |
| 6 | Rotura sincronizada | Overlay por-bloque (varios minadores); broadcast a 7 bloques |
| 7 | Playtest | Los bugs encontrados se documentan y se priorizan para la Fase 8 (B1-B10) |

---

## 8. Plan de la Fase 7 (orden de ejecución)

1. Menú: nombre, ajustes, mundos, coordenadas.
2. Estética: texturas de mobs, iconos de ítems, cielo/niebla/partículas/CSS.
3. Supervivencia pulida: caída, void, respawn por gamemode.
4. Rendimiento: métricas de tick.
5. Multijugador: rotura sincronizada.
6. Playtest + auditoría + limpieza de código muerto.

---

## 9. Riesgos y notas

- **El playtest es la fuente de la Fase 8**: los 10 bugs (B1-B10) se
  documentan con su prioridad; la Fase 8 los corrige uno a uno con
  diagnóstico.
- **`EYE_HEIGHT` compartida**: la física de caída depende de que la altura de
  ojos sea idéntica en servidor y cliente (auditada por `unit-sync.js`).
- **Los ajustes con efecto en servidor** (renderDistance) deben viajar con el
  evento `settings` y aplicarse en `ensureChunksAround` (init, move y
  `set_seed`).
- **Código muerto**: la fase terminó con una pasada de limpieza (sendToClient,
  getRenderDistance, itemColor + mapas huérfanos) y biome a 0 errores.
- La auditoría de Fase 7 documentó además limitaciones conocidas (anti-cheat
  de vuelo y maxPayload del WS sin fijar) que se resolvieron en el cierre de
  la Fase 8.

---

## 10. Criterios de aceptación + resultado verificado

1. Menú completo: nombre, ajustes persistentes, selección/creación de
   mundos y coordenadas.
2. Mobs con texturas, ítems con iconos pixel-art, cielo/niebla/partículas y
   CSS estilo Minecraft.
3. Caída con daño escalado, muerte por void y respawn según gamemode.
4. Métricas de tick visibles en F3 y rotura de bloque sincronizada.
5. Playtest documentado con bugs priorizados para la Fase 8.

**Estado: COMPLETADA.** El playtest de la fase produjo los 10 bugs
documentados en "Bugs conocidos" y priorizados en la Fase 8 (combate,
minería a mano, pérdida de vida sin causa, controles, día/noche, tecla E,
LOD, estrellas, sol/luna y mobs); la auditoría (`audit-fase7.js`) verificó
tick de servidor, FPS en Chrome headless e integridad del guardado tras
reinicios, y la pasada de limpieza dejó biome a 0 errores. Los bugs quedaron
pendientes de corregir en la Fase 8 (ver `fase8-spec.md`).
