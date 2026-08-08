# Fase 12 — Mobs por bioma, estructuras, spawn por bioma y persistencia (Spec)

> Documento de especificación creado a partir de la entrevista con el usuario
> (4 rondas de preguntas sobre alcance) y el análisis del código. **No se ha
> modificado código**: este spec guía la implementación de la Fase 12.
>
> Fecha: 2026-08-07 · Proyecto: clon de Minecraft (servidor Node autoritativo
> `server/` + cliente Three.js `public/`, todo en español).
>
> Estado: **prospectiva, pendiente de ejecución**.
>
> **Nota:** el reporte comparativo 1:1 contra Minecraft (valores, bugs y
> lagunas) vive en [`docs/reporte-paridad.md`](reporte-paridad.md) y define
> la Fase 13 (rendimiento → paridad → POO → tests). La Fase 12 se limita a
> lo acordado aquí (mobs por bioma, estructuras, spawn y persistencia); las
> correcciones de paridad de valores (daño de espada, armadura, XP, durezas)
> que este spec no menciona NO se hacen en la F12 — van a la F13.
>
> **Alcance (acordado con el usuario en 4 rondas de entrevista):** la Fase 12
> retoma lo que la Fase 11 dejó pendiente de la auditoría de terceros (ver
> `docs/Notas del usuario.md` §"Mobs por bioma" y §"Estructuras"): los 4 mobs
> por bioma (lobo en taiga, slime en pantano, ocelote en jungla, ahogado en
> océano/ríos) con sus mecánicas, las 2 estructuras (templo de jungla con
> trampa, naufragio con cofres), el spawn por bioma en `server/mobs.js`, la
> persistencia de mascotas en `world.json` y el cierre con tests. Se mantiene
> el runner propio de tests (sin vitest).

---

## 0. Decisiones de la entrevista (rondas 1-4)

| # | Decisión | Valor acordado |
|---|----------|----------------|
| E1 | Lobo | Ya existe como hostil genérico (Fase 5, 20 HP, texturas/modelo completos). **Taiga + domesticación**: spawn exclusivo en taiga + domesticable con hueso → aliado que te sigue y ataca a tu objetivo; clic derecho con mano vacía lo hace sentarse/levantarse (no te sigue mientras está sentado) |
| E2 | Slime | **División completa**: grande (16 HP) → 2 medianos (4 HP) → 2 pequeños (1 HP); el pequeño no divide. Salta en vez de caminar. Drop de slimeball |
| E3 | Ocelote | **Huye + se domestica**: huye al acercarte (como MC clásico), se domestica con pescado crudo → se vuelve **gato** que te sigue y **espanta creepers** (los creepers huyen del gato) |
| E4 | Ahogado | **Cuerpo a cuerpo + tridente**: hostil que aparece en océanos/ríos, nada hacia ti y ataca; a veces arroja tridentes (reusa la física de flechas del esqueleto). No se ahoga |
| E5 | Templo de jungla | **Con trampa simple**: templo de piedra de musgo con pasadizos, cofre de loot y trampa de **dispensador de flechas** (reusa la física de proyectiles) |
| E6 | Naufragio | **Fondo del océano + cofres**: casco de madera en el fondo (parcialmente enterrado en arena), con 1-3 cofres de loot marino |
| E7 | Spawn por bioma | **Mobs propios + resto igual**: taiga→lobos, pantano→slimes, jungla→ocelotes, océano/ríos→ahogados; el resto de la tabla actual (vaca, zombi...) sigue apareciendo en todos los biomas como hoy. Sin pesos |
| E8 | Tridente | **Drop + usable**: cae como drop del ahogado (~15%), es usable por el jugador (clic derecho lanza, daño 8, se puede recoger del suelo como la flecha). NO crafteable en esta fase |
| E9 | Gato (ocelote domado) | Te sigue + **espanta creepers** (los creepers huyen del gato). Sin teletransporte (el lobo/gato siguen por tierra; si se pierden, reaparecen junto al dueño al reiniciar o al recargar el chunk) |
| E10 | Lobo aliado | Ataca tu objetivo cuando atacas + se sienta/levanta con clic derecho (mano vacía). Sin inmunidad a muerte permanente en esta fase (muere como un mob normal; ver E14) |
| E11 | Bloques de estructuras | **Solo reuso**: templo = piedra de musgo (32) + piedra (3) + cofre (22); naufragio = madera de abeto (30/31) + tronco de jungla (41). **Sin bloques nuevos** → `SCHEMA_VERSION` NO sube por bloques |
| E12 | Tridente | Solo drop del ahogado (sin receta ni encantamientos). Al lanzarlo el jugador lo pierde y puede recogerlo del suelo |
| E13 | Estructura de la fase | 4 bloques A-D: (A) mobs con IA, (B) estructuras, (C) spawn por bioma + ítems/drops, (D) persistencia + tests + auditoría |
| E14 | Persistencia de mascotas | **Persiste en `world.json`**: el estado domesticado (lobo/gato, dueño, sentado) se guarda y sobrevive reinicios → toca el formato de guardado de mobs (campo opcional `ownerId`/`tamed`/`sitting` en el snapshot) → **`SCHEMA_VERSION` → 5** con migración retrocompatible (mundos viejos sin el campo abren igual) |
| E15 | Volumen | **Todo en la Fase 12**: 4 mobs + 2 estructuras + spawn por bioma + persistencia + tests en una sola fase |

---

## 1. Contexto técnico actual (verificado en código)

### 1.1 Mobs (servidor `server/mobs.js`)

- `SPAWN_TYPES = { day: [cow, pig, chicken, sheep, rabbit, bee], night: [zombie, creeper, skeleton, spider, wolf, cow, ...] }` — sin distinción de bioma.
- `spawnMobs(isNight)`: 3 intentos, posición aleatoria en chunks cargados, rechaza lagos (`world.isLake`), hostiles a ≥24 bloques del jugador y fuera de la zona segura de spawn (radio 32). **No rechaza océanos ni ríos** → el ahogado puede usar `isOcean`/`isRiver`.
- `MOB_HEALTH` incluye `wolf: 20` (ya hostil). Falta `slime`, `ocelot`, `drowned`.
- `MOB_PARTS` (cliente, `public/mobtextures.js`) es la ÚNICA fuente de verdad del modelo 3D; `mobPartRects` dibuja teselas por parte. El lobo ya tiene `body/head/leg` (Fase 5). Falta slime, ocelote, ahogado (el ahogado puede reusar las partes humanoides del zombi con textura propia).
- `mobDrops(mob)` usa `FOOD_DROPS` + `OTHER_DROPS` (tablas min/max por tipo). Los hostiles no dropean nada por ahora → añadir `slime→SLIME_BALL`, `drowned→TRIDENT (~15%)`.
- Proyectiles: `state.arrows` + `shootArrow` + `tickArrows` (gravedad 16 bloques/s², vida 2.5s, daño 3, anti-tunneling) → base del tridente del ahogado y de la trampa del templo (Fase 12 B).
- IA por especie (Fase 9, Bloque D): `tickHostile` con `chase`/`stuckTicks`, creeper con `fuseStart`, esqueleto con flechas, araña que escala, pasivos con huida/rebaño/sueño. El lobo ya ataca cuerpo a cuerpo como hostil.

### 1.2 Estructuras (servidor `server/world.js`)

- Las minas abandonadas (Fase 7) son el único generador de estructuras: pasillos subterráneos por bandas de ruido + cofres de loot (`msLootSpot`, `chests.js`).
- `getBiome(wx, wz)` devuelve `snow|taiga|desert|swamp|jungle|forest|plains|mountain`; `isOcean/isRiver/isLake` exportados. Patrón determinista por coordenada (hash 2D, sin `Math.random`).

### 1.3 Persistencia (`server/save.js`)

- `buildMeta()` guarda en `world.json`: `mobs` (id, type, x, y, z, health, isBaby, age), `furnaces`, `chests`, `crops`, `timeOffset`, etc. `SCHEMA_VERSION` actual = 4.
- Añadir campo opcional `pet` (`{ ownerId, sitting }`) al snapshot de mobs domesticados + restauración en `loadWorld`/`restoreMobs` → migración retrocompatible (snapshots sin el campo → mob salvaje) → **`SCHEMA_VERSION` 5**.

### 1.4 ítems (servidor `server/constants.js`)

- ítems hasta 244 (azadas). IDs libres a partir de 245: `TRIDENT: 245`, `SLIME_BALL: 246`. Sincronizar ambos lados + `itemicons.js` + `unit-sync`.
- `I.RAW_FISH` (134) existe (pescado crudo, se cocina en el horno) → sirve para domesticar ocelotes.

---

## 2. Bloque A — 4 mobs con IA completa

### A1. Lobo de taiga + domesticación (E1, E10)

- **Spawn**: solo en taiga (Bloque C). Ya es hostil: ataca cuerpo a cuerpo (daño 3), 20 HP.
- **Domesticación**: clic derecho con `BONE` (136) sobre un lobo salvaje → probabilidad ~33% por hueso (MC real): se vuelve aliado del jugador, aparecen corazones (partículas existentes de cría) y se consume el hueso. Si falla, el lobo se queda quieto un instante (sin daño).
- **Lobo aliado**: `ownerId` en el mob. Sigue al dueño (estado `follow`), no ataca al dueño ni a sus mascotas, ataca al objetivo del dueño cuando el dueño ataca (misma decisión que el clic de ataque: `attack_mob` del dueño → el lobo más cercano con `ownerId` y a ≤12 bloques se une). Clic derecho con la mano vacía → alterna `sitting` (sentado no sigue ni ataca). Visual: collar rojo en la textura del lobo aliado (nueva variante de tesela).
- **Comida/cría**: los lobos domesticados se pueden curar con carne cruda (opcional, decisión menor — se implementa si el coste es bajo; ver criterios de aceptación).

### A2. Slime de pantano + división (E2)

- **Spawn**: solo en pantano (Bloque C), de noche (como MC).
- **Movimiento**: salta (ciclo de salto con gravedad en `tickSlime`), no camina; no sufre daño de caída (MC real) — verificar que el sistema de caída de mobs no lo mate (los mobs no usan caída, salvo que esté implementado).
- **División al morir**: grande (16 HP, escala 2.0) → 2 medianos (4 HP, escala 1.0) → 2 pequeños (1 HP, escala 0.5). El pequeño NO divide. Campo `slimeSize: 2|1|0`. Al morir el grande/mediano se spawnean 2 del tamaño inferior desplazados ±1 bloque (si el suelo lo permite).
- **Drop**: los pequeños sueltan `SLIME_BALL` (0-1) con `OTHER_DROPS`.
- **Daño**: grande 3, mediano 2, pequeño 0 (MC real).

### A3. Ocelote de jungla + gato (E3, E9)

- **Spawn**: solo en jungla (Bloque C), de día (pasivo). 10 HP.
- **Huida**: pasivo huidizo — corre en dirección contraria al jugador cuando este está a ≤8 bloques (reusa el patrón `fleeUntil`/`fleeFrom` de los pasivos de Fase 9, pero con radio mayor y prioridad alta).
- **Domesticación**: clic derecho con `RAW_FISH` (134) → probabilidad ~33%: se vuelve **gato** (`ownerId`, `tamed: "cat"`).
- **Gato**: sigue al dueño (`follow`), no ataca; **espanta creepers**: los creepers a ≤6 bloques de un gato aliado entran en estado de huida (no explotan ni persiguen al jugador mientras esté el gato cerca — decisión E9, feedback claro). Visual: textura de gato (atlas propio) en vez de ocelote.
- **Persistencia**: `ownerId`/`sitting` en el snapshot (Bloque D).

### A4. Ahogado + tridente (E4, E8, E12)

- **Spawn**: en océanos y ríos (Bloque C), de noche y también de día bajo el agua (los hostiles de día en cuevas ya existen; el ahogado añade hostiles de día en agua). 20 HP, no se ahoga.
- **Movimiento**: nada hacia el jugador en 3D (mantiene la profundidad del agua, sube/baja según la posición del objetivo), ataca cuerpo a cuerpo (daño 3) al acercarse a ≤1.5 bloques.
- **Tridente arrojadizo**: con cooldown (~3s) y probabilidad (~50%) si el jugador está a 4-14 bloques: reusa `shootArrow` con velocidad/gravedad de tridente (misma física, distinto daño 6) y se replica por `arrows_update` con `kind: "trident"` (el cliente dibuja un tridente en vez de una flecha — reutilizar la geometría del proyectil con textura distinta).
- **Drop**: `OTHER_DROPS` → `TRIDENT` (245) con probabilidad ~15% (`min: 0, max: 1` + roll explícito de 15% en `mobDrops` o tabla con prob).
- **Tridente del jugador (E8, E12)**: ítem 245 usable — clic derecho lo lanza (misma física `state.arrows`, `from: player.id`, `kind: "trident"`, daño 8); al impactar en un bloque o al terminar su vida queda **recogible** (ítem en el suelo como los drops, se puede recoger caminando encima). Sin receta.

### A5. Modelos 3D y texturas (cliente)

- `MOB_PARTS` nuevos en `public/mobtextures.js`: `slime` (caja 0.8³, un cuerpo, sin patas), `ocelot`/`cat` (cuerpo + cabeza + cola + 4 patas, reusar anatomía del lobo con proporciones de felino), `drowned` (reusar partes humanoides del zombi + textura azul-verdosa). Teselas nuevas por parte + `MOB_SCALE` (slime por tamaño 2.0/1.0/0.5, ocelote 0.6, ahogado 1.0).
- Collar rojo del lobo aliado y textura de gato: variantes de tesela condicionadas a `ownerId` en el snapshot (el cliente lo pinta según `m.ownerId`).

---

## 3. Bloque B — Estructuras: templo de jungla y naufragio

### B1. Templo de jungla (E5)

- **Ubicación**: bioma jungla, `TEMPLE_GATE` (ruido 2D determinista, ~una cada N chunks de jungla), nunca sobre agua ni océano. Se genera en `generateChunk` (los chunks de jungla).
- **Forma**: torre/pirámide escalonada de piedra de musgo (32) con piedra (3) como relleno, entrada visible, pasadizos interiores (1×2), cofre de loot en la cámara central y una **trampa de dispensador de flechas** en un pasillo: al pisar la celda de presión simplificada (o al entrar en el pasillo) se disparan 3-5 flechas (reusa `shootArrow` apuntando al jugador dentro del templo, con `from: null`). El cofre usa `chests.js` con tabla de loot de templo (oro 14, esmeralda 14, hierro 10, hueso 136, tridente 245 raro).
- **Determinismo**: todo derivado de hash 2D por coordenada (patrón de las minas abandonadas), sin `Math.random`.

### B2. Naufragio (E6)

- **Ubicación**: océano (isOcean), `SHIPWRECK_GATE`, en el fondo (y = `oceanFloorY` + 1). Se genera al generar el chunk oceánico.
- **Forma**: casco invertido de madera de abeto (30/31) + viga central de tronco de jungla (41), parcialmente enterrado en arena (la arena de fondo ya existe). Tamaño ~7×3×4.
- **Loot**: 1-3 cofres (`chests.js`) con tabla marina: hierro 10, oro 14, pescado crudo 134, tridente 245 (raro), pan 133.

### B3. Sin bloques nuevos (E11)

- Reuso de bloques existentes → NO se toca el formato de chunks → `SCHEMA_VERSION` no sube por estructuras.

---

## 4. Bloque C — Spawn por bioma + ítems/drops nuevos

### C1. Spawn por bioma en `server/mobs.js` (E7)

- `BIOME_SPAWN`:
  - `taiga` → `["wolf"]` (añadir a la tabla de noche; el lobo deja de spawnear en el resto de biomas)
  - `swamp` → `["slime"]` (noche)
  - `jungle` → `["ocelot"]` (día)
  - `ocean`/`river` → `["drowned"]` (día y noche; posición y = columna de agua, no `surfaceH + 1`)
- Implementación: en `spawnMobs`, al elegir `type` de la tabla base, si el bioma del punto tiene mobs propios, el 60% de las veces se elige un mob propio del bioma y 40% la tabla base (decisión E7: "mobs propios + resto igual"; sin pesos complejos). Los ahogados ignoran el rechazo de lagos (solo se rechaza el spawn de hostiles terrestres sobre agua) y se colocan bajo el agua (`wy = columnFloorY + 2`).
- `isOcean`/`isRiver` ya exportados; `getBiome` ya exportado.

### C2. ítems y drops nuevos

- `TRIDENT: 245` (arma arrojadiza, no crafteable, no coloca bloque) y `SLIME_BALL: 246` (material, sin recetas en esta fase) — sincronizar ambos lados (`constants.js` servidor/cliente), `ITEM_NAMES`, `itemicons.js` (iconos: tridente azul con puntas, slimeball verde translúcido), `unit-sync`.
- Drops: `OTHER_DROPS.slime = { id: I.SLIME_BALL, min: 0, max: 1 }`, `OTHER_DROPS.drowned = { id: I.TRIDENT, min: 0, max: 1 }` + roll del 15% en `mobDrops` para el tridente (los drops con `< 100%` usan probabilidad explícita).
- `TRIDENT` en `PLACEABLE_BLOCKS`? No — es un arma (como las espadas). Verificar que el clic derecho con tridente lanza (handler nuevo `throw_trident` en `net.js` o reuso de `attack_mob`… mejor handler propio) y no coloca.

---

## 5. Bloque D — Persistencia de mascotas + tests + auditoría

### D1. Persistencia en `world.json` (E14)

- `buildMeta()`: en el snapshot de cada mob, si `m.ownerId` existe añadir `pet: { ownerId, sitting }`.
- `loadWorld`/`restoreMobs`: restaurar `ownerId`/`sitting` si el campo existe (mundos v4 sin él → mob salvaje, migración retrocompatible).
- `SCHEMA_VERSION` → 5 (bump por cambio de formato de guardado, regla del proyecto) + test de migración (modelo `tests/unit-persistencia.js`: guardar con pet → cargar → mob con dueño; mundo viejo sin pet → mob salvaje).
- Al cargar, las mascotas sin jugador conectado se mantienen en el mundo (los mobs ya persisten); al conectar el dueño, el lobo/gato vuelve a seguirlo (campo `ownerId` compara con `player.id` — los IDs de jugador son por sesión; decisión: persistir el NOMBRE del dueño `ownerName` para que la mascota reconozca al jugador al reconectar; `ownerId` solo en sesión).

### D2. Tests unitarios nuevos (runner propio, patrón `unit-fase11.js`)

- `unit-fase12.js`:
  - Lobo: `canTameWolf` (hueso → ~33%, consume), `tameWolf` (ownerId/sitting), lobo aliado ataca al objetivo del dueño y no al dueño, `sitWolf`.
  - Slime: `tickSlime` salta, `splitSlime` grande→2 medianos→2 pequeños→nada, drop de slimeball, daño por tamaño.
  - Ocelote: huye del jugador, `tameOcelot` con pescado → gato, el gato espanta creepers (`creeperFleesCat`).
  - Ahogado: spawn en agua (columna oceánica), nada/ataca, `shootTrident` usa la física de flechas, drop del 15%.
  - Spawn por bioma: `BIOME_SPAWN` — en taiga salen lobos, en pantano slimes, en jungla ocelotes, en océano ahogados (muestreo determinista).
  - Tridente del jugador: lanzar → proyectil, recoger del suelo.
  - Estructuras: `temploEn(x,z)`/`naufragioEn(x,z)` deterministas (mismo chunk → misma estructura), el templo tiene cofre y el pasillo de trampa dispara flechas al pisar.
  - Persistencia: `buildMeta` incluye `pet`, `loadWorld` restaura, migración v4→v5.
- `unit-sync.js`: actualizado con TRIDENT 245 / SLIME_BALL 246 (paridad servidor↔cliente).
- `audit-fase5`: si TRIDENT tiene durabilidad o no (arma sin durabilidad → fuera de la tabla).

### D3. E2E nuevos (contra servidor vivo, patrón `e2e-comer.js`)

- `e2e-mascotas.js`: dar hueso a un lobo → se vuelve aliado; el lobo sigue al dueño; clic derecho lo sienta. (Requiere controlar un lobo de taiga — usar semilla conocida o `/tp` + spawn forzado).
- `e2e-templo.js`: `/tp` a un templo de la semilla → el pasillo de trampa dispara flechas al entrar; el cofre tiene loot.

### D4. Auditoría de Fase 12

- Suite unitaria completa en verde (con `unit-fase12`), E2E contra servidor vivo, auditorías 3-11 sin regresiones (`audit-fase7` render con los 4 mobs nuevos dibujando, `audit-fase4` culling), `biome check` 0 errores, `node --check` en todo lo tocado, y verificación manual en navegador (lobo/slime/ocelote/ahogado se ven y comportan; templo y naufragio aparecen en su bioma; mascotas persisten tras reinicio).

---

## 6. Criterios de aceptación (resumen)

1. Los 4 mobs aparecen SOLO en su bioma (lobos en taiga, slimes en pantano, ocelotes en jungla, ahogados en océanos/ríos) y el resto de mobs sigue apareciendo como antes.
2. El lobo se domestica con huesos, sigue al dueño, ataca su objetivo y se sienta con clic derecho; el gato espanta creepers.
3. El slime grande se divide en 2 medianos y estos en 2 pequeños; el pequeño no divide; suelta slimeball.
4. El ahogado nada, ataca y arroja tridentes; el tridente cae como drop y es usable por el jugador (se lanza y se recoge del suelo).
5. El templo de jungla (piedra de musgo, pasadizos, cofre, trampa de flechas) y el naufragio (casco de madera en el fondo oceánico, 1-3 cofres) son deterministas por semilla.
6. Las mascotas persisten en `world.json` (SCHEMA_VERSION 5) y reconocen a su dueño al reconectar; los mundos viejos abren sin cambios.
7. Todo verificado: suite unitaria exit 0, E2E exit 0, auditorías sin regresiones, biome 0 errores.

---

## 7. Riesgos y notas de implementación

- **Ahogado de día**: los hostiles de día solo spawnan en cuevas oscuras (`findDarkCaveY`); el ahogado es la excepción (agua). No romper la regla de cuevas para el resto.
- **Slime y caída**: verificar que la lógica de daño de caída de mobs no aplique al slime (salta constantemente).
- **Gato espanta creeper**: el creeper en huida no debe explotar ni perseguir mientras el gato esté a ≤6 bloques; al alejarse el gato, vuelve a perseguir.
- **Tridente recogible**: los drops de mobs ya son recogibles al caminar; reusar ese sistema para el tridente lanzado (un `drop` temporal en el punto de impacto).
- **ownerId vs ownerName**: los `player.id` son por sesión; persistir `ownerName` para reconectar (D1).
- **Trampa del templo**: el disparo se arma al entrar en el pasillo (detección por posición del jugador dentro del área del templo, con cooldown); no requiere redstone (fuera de alcance).
