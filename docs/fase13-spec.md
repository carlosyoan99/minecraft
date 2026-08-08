# Fase 13 — Paridad 1.0, rendimiento, POO y tests de paridad (Spec)

> Documento de especificación creado a partir del **reporte de paridad 1:1**
> contra Minecraft (`docs/reporte-paridad.md`) y de la entrevista con el
> usuario (alcance, prioridades y orden de bloques). **No se ha modificado
> código**: este spec guía la implementación de la Fase 13.
>
> Fecha: 2026-08-07 · Proyecto: clon de Minecraft (servidor Node autoritativo
> `server/` + cliente Three.js `public/`, todo en español).
>
> Estado: **prospectiva, pendiente de ejecución**.
>
> **Alcance (acordado con el usuario):** la Fase 13 ejecuta el reporte de
> paridad en 4 bloques con este orden: **A) rendimiento** (impacto visible
> inmediato), **B) paridad** (corrección de valores incorrectos + lagunas
> priorizadas: arco, puertas, escaleras/losas/vallas, cubo de líquidos,
> recetas), **C) POO completa del servidor** (Mob/Player/World/Chunk/
> ItemStack con herencia por especie), **D) tests de paridad** (tabla oficial
> de MC fijada en un test) + cierre de la fase.
>
> La **Fase 12** (mobs por bioma, estructuras, persistencia de mascotas) se
> ejecuta ANTES, con su spec propio (`docs/fase12-spec.md`).

---

## 0. Decisiones de la entrevista

| # | Decisión | Valor acordado |
|---|----------|----------------|
| E1 | Ubicación | El reporte de paridad/POO/rendimiento NO entra en la Fase 12: la F12 queda como está (mobs/estructuras) y esto es la Fase 13 |
| E2 | Migración POO | **POO completa del servidor** (Mob, Player, World/Chunk, ItemStack, herencia por especie) — máximo beneficio de mantenibilidad |
| E3 | Rendimiento | Todos: **greedy meshing**, **Web Workers** de chunks, **auditar pool/culling/LOD** y **perfilado del servidor** |
| E4 | Paridad | **Corregir lo incorrecto** (valores del reporte) + las **lagunas priorizadas**: arco, puertas, escaleras, bloques constructivos (losas/vallas), cubo de líquidos y recetas faltantes |
| E5 | Orden de bloques | **A rendimiento → B paridad → C POO → D tests** |
| E6 | Tests de paridad | **Ambos**: `unit-paridad.js` nuevo con la tabla oficial de MC + ampliar la suite existente (tests de las lagunas nuevas y red de seguridad de la POO) |

---

## 1. Contexto y fuentes

- El reporte completo con los bugs y sus valores está en
  [`docs/reporte-paridad.md`](reporte-paridad.md) (comparativa por área §2,
  bugs B1-B12 §3, lagunas L1-L5 §6, optimizaciones P1-P5 §7, diseño POO §8,
  plan de validación §9).
- Los valores oficiales de MC se verificaron con la wiki de Minecraft Java
  (daño de espadas, puntos de armadura, curva de XP por tramos, dureza de
  bloques, durabilidad, minerales por altura, daño de caída).
- Convención del proyecto (AGENTS.md): cada mecánica nueva lleva su test,
  cada fase termina con auditoría, cambios de `constants.js` en ambos lados
  (servidor ↔ cliente) auditados por `unit-sync.js`, cambios de formato de
  guardado exigen `SCHEMA_VERSION` + migración + test.

---

## 2. Bloque A — Rendimiento (primero, impacto visible)

> Objetivo: reducir jank y memoria SIN cambiar el comportamiento del juego.
> Criterio duro: los tests de mecánicas y las auditorías CDP de
> render/culling deben seguir en verde; se mide antes/después con las
> métricas de F3 y la auditoría CDP (conteo de chunks, tick, vertices).

### A1. Greedy meshing (cliente `public/world.js`)

- Fusionar caras coplanares contiguas del mismo bloque (con el mismo índice
  de tesela) en quads grandes en `buildChunkGeometry` → 3-5× menos
  vertices/caras por chunk.
- Mantener: el culling por caras contra aire/agua/plantas (regla exacta de
  `audit-fase4`), las variantes por tesela de cara (p. ej. césped con tope
  verde y lateral tierra), la iluminación por vértice (AO) aplicada a los
  quads fusionados (promediar o escalonar como MC), y el crack/highlight
  (overlays por bloque, no tocan la geometría).
- Test: `unit-greedy.js` con three real — un chunk de piedra maciza genera
  MENOS caras que sin fusión (invariante de conteo) y el raycast sigue
  acertando en los bloques esperados (reusa el patrón de `unit-raycast.js`).
  La auditoría CDP de render (audit-fase7) debe seguir en verde con el
  mismo número de chunks y 0 excepciones.

### A2. Web Workers para chunks (cliente)

- Mover `buildChunkGeometry` (y la creación de la geometría desde los datos
  Uint16Array) a un Web Worker: el hilo principal no se bloquea al cargar
  chunks nuevos.
- Diseño: el worker recibe `{ cx, cz, data (Uint16Array transferible) }`,
  devuelve el `BufferGeometry`/`Mesh` (o los atributos + índices) con
  transferencia. El pool de geometrías y el LOD/culling se quedan en el
  hilo principal (solo generan/desechan meshes).
- Fallback síncrono si `Worker` no está disponible (test/env headless) —
  misma función, llamada directa.
- Test: `unit-workers.js` — el worker genera la misma geometría (conteo de
  vértices/índices idéntico) que la versión síncrona para el mismo chunk;
  la auditoría CDP carga el mundo sin excepciones.

### A3. Auditar pool/culling/LOD (cliente `world.js`/`input.js`)

- Eliminar trabajo duplicado: `updateHighlight` y el listener de retarget de
  mina hacen **2 `raycastTerrainAndMobs()` por pointermove** → compartir un
  solo raycast por evento (refactor de `input.js`).
- Revisar `geoPool`: bounds obsoletos (fix B3/B6 de Fase 8), liberación
  temprana, y que `release()` nullee boundingBox/boundingSphere (ya hay
  tests: mantenerlos en verde).
- Revisar `applyFrustumCulling`/`updateLod`: evitar recomputar
  `computeChunkSphere` para chunks sin cambios (cachear por revisión del
  chunk).
- Test: `unit-pool.js` ampliado (si existe) o checks dentro de
  `unit-greedy.js`: la reutilización de geometrías no cambia el raycast.

### A4. Perfilado del servidor (server `net.js`/`mobs.js`/`players.js`)

- En el tick 20 Hz: cachear el snapshot de mobs POR TICK (hoy se puede
  recomputar en varios broadcasts: `mobs_update`, `arrows_update`, eventos
  por jugador); `getSafeSpawn()` ya está cacheado; evitar `getBiome` por
  mob por tick si no cambia la posición (cachear por celda).
- Broadcasts: no enviar `mobs_update` completo si nada cambió (dirty flag
  por mob).
- Medible con las métricas existentes (F3 y `state.metrics` de F7).
- Test: `unit-perf-server.js` — invariante de que el snapshot del tick se
  computa 1 vez (contador inyectado) y que el broadcast no envía cuando no
  hay cambios.

---

## 3. Bloque B — Paridad

> Orden interno: primero los valores incorrectos (B1-B6 del reporte, cambios
> de constantes de bajo riesgo), después las lagunas L1-L5. Cada ítem con su
> test actualizado o nuevo.

### B1. Valores incorrectos (correcciones de `server/constants.js` + cliente)

| # | Cambio | Valor actual → MC real |
|---|---|---|
| B1 | Salud máxima por nivel | ELIMINAR el +1 por nivel (MC: siempre 20); `respawnPlayer`/HUD `maxhp` a 20 fijo |
| B2 | Curva de XP | `xpToNext` por tramos oficiales: `2L+7` (0-15), `5L−38` (16-30), `9L−158` (31+); total a nivel 30 = 1.395 XP |
| B3 | Daño de espadas | madera 3→4, piedra 4→5, hierro 5→6, diamante 6→7; **mano 2→1** |
| B4 | Armadura | puntos por pieza (cuero 1-3-2-1, hierro 2-6-5-2, diamante 3-8-6-3) con `reducción = min(puntos×4, 80)%` |
| B5 | Durezas | tierra 0.75→0.5, grava 0.4→0.6 |
| B6 | Durabilidades | 60/132/251/33/1562 → 59/131/250/32/1561 (ambos lados + `audit-fase5`) |

**Tests:** `unit-paridad.js` fija todos estos valores contra la tabla
oficial; se actualizan los tests que esperaban los valores viejos
(`unit-durabilidad.js`, `audit-fase5.js`, `unit-damage.js`,
`unit-fase9.js` si referencia XP).

### B2. L1 — Arco y flechas del jugador

- Ítems `BOW: 247` (durabilidad 384, daño 9 con flecha) y `ARROW: 248`
  (apilable 64, drop del esqueleto también).
- Recetas: arco (3 sticks + 3 hilos, shape MC), 4 flechas (1 pedernal + 1
  palo + 1 pluma → 4; requiere ítem FLINT (252) y FEATHER (253) — el pedernal
  cae de la grava ~10%, la pluma de los pollos).
- Uso: clic derecho mantiene la carga y suelta al soltar el clic (o disparo
  directo si el tiempo lo exige); reusa `state.arrows` con `from: player.id`
  y `kind: "arrow"`; las flechas del jugador son recogibles; daño 9.
- Cliente: mesh de flecha (reusa el del esqueleto, Fase 9), animación de
  carga (tensar el arco: escala/rotación simple).
- Tests: receta arco/flechas, disparo con daño 9, flecha recogible, el
  esqueleto también dropea flechas.

### B3. L2 — Puertas

- Bloques `OAK_DOOR: 48` y `IRON_DOOR: 49` (no sólidos; ocupando 2 celdas de
  alto), `door_state` broadcast para abrir/cerrar al jugador cercano o con
  clic derecho.
- Recetas: 6 planks → 1 puerta de madera; 6 lingotes de hierro → 1 de hierro.
- Colisión: al abrir, la celda deja de ser sólida (como MC: la puerta abierta
  no bloquea el paso por la celda que ocupaba... simplificación: la puerta
  abierta se gira 90° visualmente y deja de ser sólida).
- Tests: receta, apertura al caminar (estado cambia), bloqueo cerrado.

### B4. L3 — Escaleras, losas y vallas

- Bloques: escaleras de madera/piedra (50+), losas (60+), vallas y portones
  (70+) — con las teselas e iconos correspondientes. Colisión por forma
  (escalera = 3 cajas escalonadas, losa = media caja, valla = caja central +
  2 laterales simplificados).
- Recetas MC: 6 bloques → 4 escaleras; 3 bloques → 6 losas; 4 tablones +
  2 palos → 3 vallas; 2 tablones + 4 palos → portón.
- Tests: colocación orientada por la cara mirada, colisión de la forma.

### B5. L4 — Cubo de líquidos

- Ítems `BUCKET: 249`, `WATER_BUCKET: 250`, `LAVA_BUCKET: 251`.
- Clic derecho sobre agua/lava (fuente) → lo recoge (deja aire y devuelve el
  cubo lleno); clic derecho vacío → vierte donde se mira (reusa la lógica de
  colocación de líquidos). El cubo de agua recogido de una fuente infinita
  (F11) no rompe el patrón 2×2.
- Recetas: 3 lingotes de hierro → cubo.
- Tests: recoger fuente, verter, cubo de agua en fuente 2×2 no se agota.

### B6. L5 — Recetas faltantes (de ítems que YA existen)

- Añadir al libro: arco, flechas, cubo, puertas, escaleras, losas, vallas,
  portones, armadura de oro (5 piezas), armadura de malla (5 piezas, con
  fuego/hilo), compás (4 hierro + 1 polvo rojo), pala/hacha ya están...
  Revisar la lista completa contra `CREATIVE_ITEMS`/`ALL_TOOLS_AND_ARMOR`
  para que TODO ítem colocable/tool tenga receta.
- Test: `unit-recetas.js` ya valida la integridad del JSON; ampliar para
  comprobar que cada ítem con receta en `recetas.json` tiene su entrada en
  el libro por categorías y que los ítems nuevos (247-253) tienen receta
  cuando corresponde.

### B7. Bloque constructivo adicional (decisión E4: "bloques constructivos")

- Losas y vallas (B4) cubren la laguna constructiva priorizada; no se
  añaden vidrieras/puertas trampa/compuertas en esta fase (se documentan
  como candidatas futuras).

---

## 4. Bloque C — POO completa del servidor

> Ver el diseño completo en `docs/reporte-paridad.md` §8. Migración por
> capas con la suite en verde tras CADA commit (los 53 tests existentes son
> la red de seguridad).

### C1. Capa 1 — `class Mob` (refactor estructural)

- Mover `function Mob` (server/mobs.js) a `class Mob` con los métodos de
  instancia actuales (`tickHostile`, `tickPassive`, `tickSunBurn`,
  `moveToward`, `attack`, ...) conservando los nombres de propiedades
  (`x/y/z/health/type/state/...`) que leen los snapshots y los tests.
- Los exports de `mobs.js` (crear mob, tickMobs, snapshots) se mantienen
  como fachadas con la misma firma.
- **Criterio:** `unit-mobs-ia.js`, `unit-fase9.js`, `unit-fase11.js` en
  verde SIN cambios.

### C2. Capa 2 — Herencia por especie

- Subclases: `Zombie`, `Creeper`, `Skeleton`, `Spider`, `Enderman`, `Wolf`,
  `Slime`, `Drowned`, `Cow`, `Pig`, `Chicken`, `Sheep`, `Rabbit`, `Bee`,
  `Ocelot` (las de Fase 12 se crean ya como clases).
- Mover los `if (this.type === "creeper")` del tick central a métodos
  sobreescritos (`tick()`/`onDamage()`/`onDeath()`).
- `createMob(type, x, y, z)` elige la clase por tipo (registro tipo→clase).
- Test nuevo por especie (unit por clase): `unit-mobs-poo.js`.

### C3. Capa 3 — Player/World/Chunk/ItemStack

- `Player` como clase (encapsula los campos planos del estado actual +
  métodos: `damage`, `heal`, `eat`, `addItem`, `applyFallDamage`,
  `respawn`, `addXp`). `players.js` exporta fachadas con la firma actual.
- `World`/`Chunk`: `world.getBlock/setBlock/getHeight/getBiome/isOcean/...`
  como métodos de instancia (fachadas sueltas iguales); `Chunk` con
  serialización/dirty.
- `ItemStack` para `{ id, count, durability }` (inventario, drops, cofres).

### C4. Capa 4 — limpieza y métricas

- Eliminar el branching muerto que la OOP deja al descubierto; medir la
  reducción de líneas de `mobs.js`/`net.js`; documentar en el spec final.

### C5. Reglas duras

- Un commit por clase con suite en verde.
- Los exports de `server/*.js` usados por tests se mantienen como fachadas.
- No cambiar el protocolo WS ni el formato de guardado en esta fase.

---

## 5. Bloque D — Tests de paridad y cierre

### D1. `tests/unit-paridad.js` (nuevo, registrado en `run.js`)

Tabla oficial de MC contra `server/constants.js` (+ paridad cliente via
`unit-sync`):

1. Daño de espadas por material y daño a mano (4/5/6/7/4, mano 1).
2. Puntos de armadura por pieza y material (cuero 1-3-2-1, hierro 2-6-5-2,
   diamante 3-8-6-3) y reducción máxima 80%.
3. Durabilidad de herramientas y armaduras (59/131/250/32/1561, cuero 55-80,
   hierro 165-240, diamante 363-528).
4. Dureza de bloques (piedra 1.5, tierra 0.5, grava 0.6, arena 0.5, madera
   2, planks 2, obsidiana 50 — si existe).
5. Comida: hambre y saturación (pan 5/6, bistec 8/12.8, pollo cocinado
   6/7.2, bacalao cocinado 5/6...).
6. Curva de XP por tramos: `xpToNext` en 0→7, 1→9, 15→37, 30→112 (valores
   oficiales) y total a nivel 30 = 1.395.
7. Minerales por altura (diamante ≤16, hierro ≤64, oro ≤32, carbón ≤128).
8. Daño de caída: `fallDamage(3)=0`, `fallDamage(4)=1`, `fallDamage(7)=4`.

**Criterio:** el test FALLA si alguien desvía un valor de la tabla oficial
(es la fijación de la paridad).

### D2. Tests de las lagunas (B2-B6)

- `unit-lagunas.js` (o por tema): receta+uso del arco, flechas recogibles,
  puertas (abrir/cerrar), escaleras/losas/vallas (colocación y colisión),
  cubo (recoger/verter), integridad de recetas nuevas.
- Los E2E de las mecánicas interactivas (arco, puertas, cubo) contra
  servidor vivo, patrón de `e2e-comer.js`/`e2e-cofre.js`.

### D3. Red de seguridad de la POO

- `unit-mobs-poo.js` (clases por especie) + suite completa en verde tras
  cada commit de la migración.
- Verificación CDP: render de los mobs con la nueva jerarquía (audit-fase7
  y `diag-clic --audit` sin regresión).

### D4. Auditoría de Fase 13

- Suite unitaria completa en verde (con unit-paridad, unit-lagunas,
  unit-mobs-poo, unit-greedy, unit-workers, unit-perf-server).
- E2E contra servidor vivo (incluidos los nuevos).
- Auditorías 3-12 sin regresiones (especialmente audit-fase4 culling con
  greedy meshing, audit-fase5 durabilidad/XP con los valores nuevos,
  audit-fase7 render CDP).
- `biome check` 0 errores y `node --check` en todo lo tocado.
- Métricas de rendimiento antes/después documentadas (vertices/chunks/jank)
  con la mejora esperada de cada optimización P1-P4.
- Verificación manual en el navegador: combate (daño MC real), arco,
  puertas, escaleras, cubo, y ausencia de jank al explorar.

---

## 6. Criterios de aceptación (resumen)

1. Rendimiento: greedy meshing + workers + pool/culling/LOD + perfilado
   servidor con mejora MEDIBLE y sin cambios de comportamiento (tests y
   auditorías CDP en verde).
2. Paridad: valores de combate/armadura/XP/comida/dureza/durabilidad
   coinciden con la tabla oficial (fijada por `unit-paridad.js`); arco,
   puertas, escaleras/losas/vallas, cubo y recetas nuevas funcionan y tienen
   test.
3. POO: servidor migrado por capas; `mobs.js` descompuesto en clases por
   especie; suite en verde en cada commit; fachadas compatibles con los 53
   tests.
4. Tests: `unit-paridad.js` en verde + tests de lagunas + red de seguridad
   de la POO + auditoría final sin regresiones.

---

## 7. Riesgos y notas

- **Greedy meshing + AO + teselas por cara**: el AO por vértice se complica
  con quads grandes (MC promedia los vértices interiores); si el coste es
  alto, aplicar AO solo a los quads de 1×1 y promediar en los fusionados
  (decisión de calidad visual aceptada si la auditoría CDP sigue en verde).
- **Workers**: la transferencia de `Uint16Array` y el ciclo de vida del
  worker (creación única, mensajes asíncronos al build del chunk) exigen
  coordinar el orden de los mensajes con el culling; el fallback síncrono
  cubre tests y entornos sin workers.
- **POO**: el riesgo principal es romper la API de los 53 tests — por eso
  las fachadas con firma idéntica y un commit por clase. Si el tiempo se
  agota, entregar al menos C1+C2 (Mob + herencia), que es el 80% del
  beneficio.
- **Curva de XP**: al cambiar a la tabla por tramos, la XP acumulada de los
  jugadores existentes se reinterpreta con la curva nueva (sin migración de
  datos: es un cambio de fórmula, no de formato).
- **Salud máxima**: al eliminar el bonus por nivel (B1), los jugadores con
  niveles pierden vida máxima al reiniciar — aceptado (es el comportamiento
  MC real); el HUD y `respawnPlayer` se ajustan a 20.
