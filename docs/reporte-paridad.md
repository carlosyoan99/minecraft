# Reporte de paridad 1:1 contra Minecraft (Java Edition 1.9+)

> Reporte técnico comparativo del clon contra el juego real, elaborado como
> programador senior de JavaScript y veterano de Minecraft. Base para la
> Fase 13 (paridad, POO y rendimiento) y fuente de verdad de las correcciones
> propuestas. Fecha: 2026-08-07 · Todo el código, docs y commits en español.
>
> Metodología: (1) lectura de las especificaciones por fase (`docs/spec/faseN-spec.md`)
> y del estado real del código (16.000 líneas JS, 53 tests); (2) verificación
> de valores oficiales de Minecraft con investigación web (wiki de MC Java);
> (3) entrevista al usuario para acotar alcance y prioridades.
>
> **Decisiones de la entrevista:** la Fase 12 se mantiene como estaba acordada
> (4 mobs por bioma + templo + naufragio + persistencia de mascotas, ver
> `docs/spec/fase12-spec.md`); este reporte define la **Fase 13** con el orden
> A rendimiento → B paridad → C POO → D tests, e incluye la migración a POO
> completa del servidor (decisión del usuario) y las optimizaciones de
> rendimiento (greedy meshing, workers, pool/culling/LOD, perfilado servidor).

---

## 1. Resumen ejecutivo

El clon es **muy completo**: cubre el bucle de supervivencia (minar →
craftear → luchar → sobrevivir), mundo procedural con 9 biomas, día/noche,
mobs con IA por especie, multijugador con servidor autoritativo y anti-cheat.
Comparado con Minecraft Java hay **3 categorías de diferencias**:

1. **Valores incorrectos** (lo implementado no coincide con MC real): daño de
   espadas, reducción de armadura, curva de XP, dureza de bloques, minerales.
2. **Lagunas visibles** (mecánicas que MC tiene y aquí no): arco, puertas,
   escaleras, losas, vallas, cubo de líquidos, ~250 recetas faltantes, entre
   otras (ver §6).
3. **Arquitectura y rendimiento** (mejorable sin cambiar el juego): módulos
   funcionales de >900 líneas, generación de chunks en el hilo principal del
   cliente, meshing no compactado, snapshot/broadcast del servidor con trabajo
   duplicado.

No hay bugs críticos que rompan el juego (Fases 8-11 los cerraron); los
"bugs" de este reporte son de **paridad** (comportamiento distinto al real).

---

## 2. Comparativa por área

### 2.1 Mecánicas implementadas vs MC

| Mecánica | Estado | Diferencia con MC real |
|---|---|---|
| Bucle minar→craftear→sobrevivir | ✅ Completo | Fiel en esencia |
| Día/noche (20 min) + luna con fases | ✅ | MC día real = 20 min. OK |
| Dormir en cama (salta a la mañana) | ✅ | Sin requisito de "los 3 jugadores duermen" (single-player OK) |
| Lluvia/clima | ❌ Fuera de alcance | Documentado como Won't |
| Redstone/circuitos | ❌ Fuera de alcance | Won't |
| Nether/End (dimensiones) | ❌ Fuera de alcance | Won't |
| Aldeas/villagers | ❌ Fuera de alcance | Won't |
| Inventario 36 slots + hotbar 9 | ✅ | OK |
| Armadura (4 piezas) | ✅ | Valores de reducción aproximados (ver §2.7) |
| Herramientas 5 materiales + 6 tipos | ✅ | Duracidades casi exactas (ver §2.8) |
| Mobs: 11 especies (9 jugables + bee/wolf) | ✅ | Faltan: 30+ especies (aldeano, golem, enderman ya está, blaze, ghast...) |
| Crafteo 3×3 + horno + libro de recetas | ✅ | 56 recetas vs ~300 de MC (ver §2.8) |
| XP y niveles | ✅ | Curva aproximada, XP se conserva al morir (MC la pierde) |
| Encantamientos | ❌ | No implementado (fuera de alcance implícito) |
| Pociones | ❌ | No implementado |
| Agricultura (trigo) | ✅ | Sin melones/zanahorias/patatas (solo trigo + semillas) |
| Pescador | ❌ | No hay caña de pescar |
| Montar (caballos, cerdos, barcas) | ❌ | No implementado |
| TNT + gravedad de arena/grava | ✅ (Fase 10) | OK simplificado |
| Pick-block / sprint / agacharse | ✅ (Fase 10) | OK |
| Modo creativo con vuelo y picker | ✅ (Fase 9) | OK |

### 2.2 Sistema de audio

| Aspecto | Estado | Diferencia |
|---|---|---|
| Pasos por material | ✅ `playStep(blockId)` | Sin sonido de vidrio/metal específico (genérico por material) |
| Rotura/colocación por material | ✅ `playBreak/playPlace` | OK |
| Comer/beber, splash | ✅ | Sin sonido de beber |
| Mobs: creeper hiss, oveja, golpes | ✅ | Sin sonidos de muerte, de golpe por tipo, de flecha al impactar |
| Cofres/horno/TNT | ✅ | OK |
| Música generativa por contexto | ✅ (Fase 10) | Muy simplificada vs música real de C418 |
| Ambiente día/noche | ✅ `updateAmbient` | OK |

**Observación senior:** el audio es **procedural** (Web Audio, sin assets) —
decisión correcta para el proyecto (0 dependencias de archivos binarios). La
paridad exacta de sonidos MC es imposible sin samples; la mejora viable es
**más variedad** (sonidos de muerte/impacto de mobs, beber, arco al disparar,
metal/vidrio en pasos), todo sintetizado.

### 2.3 Menú principal y configuración

| Aspecto | Estado | Diferencia |
|---|---|---|
| Nombre de jugador persistente | ✅ | OK |
| Selección de mundo por semilla + nombre | ✅ | OK (MC: selección por mundos guardados) |
| Modo de juego por mundo (survival/creative) | ✅ (Fase 9) | OK |
| Tamaño de mundo (256/512/1024/8192) | ✅ (Fase 10) | MC: mundo infinito |
| Ajustes: sensibilidad, volumen, calidad, FOV | ✅ | OK |
| Controles invertidos (A/D) | ✅ (Fase 8) | OK |
| Pantalla de muerte con causa | ✅ (Fase 10) | OK |
| Libro de recetas (tecla B) | ✅ (Fase 9) | Todas visibles sin desbloqueo (MC las desbloquea al obtener el material) |
| Menú de pausa (Esc) | ✅ | Sin "guardar y salir" explícito (el autosave cada 30s cubre) |

**Laguna menor:** el libro de recetas en MC se desbloquea por material
obtenido; aquí es "todo visible". Decisión de Fase 9 aceptada (documentada).

### 2.4 Generación del mundo, biomas y cuevas

| Aspecto | Estado | Diferencia con MC 1.18+ |
|---|---|---|
| Biomas | ✅ 9: plains, forest, desert, snow, mountain, taiga, swamp, jungle, ocean | MC: 60+ biomas; sin ríos reales de borde (hay ríos 1D de Fase 10) |
| Cuevas | ✅ 3D ruido | Sin cuevas tipo "queso" ni acuáticas generadas (hay lagos) |
| Minerales por altura | ✅ (Fase 9) | Diamante ≤16, hierro ≤64, oro ≤32, carbón ≤128 — verificar umbrales reales (§5) |
| Playas/arena costera | ✅ (Fase 9) | OK |
| Estructuras | ✅ minas (F7), templo/naufragio (F12 pendiente) | MC: + aldeas, fortalezas, monumentos, pirámides... (Won't aldeas) |
| Altura del mundo | 64 bloques (WORLD_HEIGHT) | MC 1.18+: -64..320 (384). **Gran diferencia de profundidad** |
| Océanos | ✅ (Fase 11) | Sin monumentos ni vida marina |

**Observación senior:** la altura de 64 bloques es la limitación más notable
del mundo (MC moderno tiene 384). Subirla (p. ej. a 128 con `SEA_LEVEL` en 32)
tendría impacto en generación, guardado, culling y rendimiento — cambio de
gran alcance para la Fase 13+, merece su propia evaluación de coste/beneficio.

### 2.5 Mobs, diseño e IA

| Aspecto | Estado | Diferencia |
|---|---|---|
| IA por especie | ✅ (Fase 9): esqueleto flechas, creeper fuse, zombi quema, araña escala, pasivos huyen/rebaño/sueñan | Muy buena para el alcance |
| Spawn por bioma | ❌ Pendiente (Fase 12) | Fase 12 lo implementa |
| Spawn por luz/hora | ✅ (Fase 10): hostiles de día en cuevas oscuras | MC: spawn por nivel de luz (0-7) + hora; aproximación correcta |
| Modelos 3D multibloque | ✅ (Fase 8): MOB_PARTS + atlas por parte | Sin animaciones de ataque/espina; caminar con balanceo (Fase 10) |
| Drops | ✅ comida + secundarios | Faltan drops de hostiles (pólvora, carne podrida, flechas...) y la mayoría de mobs |
| Cría y alimentación | ✅ | OK (sin gatos/lobos domesticables todavía — Fase 12) |
| Proyectiles | ✅ flechas (F9) + tridente (F12) | Sin bolas de fuego, perlas, etc. |

### 2.6 Funcionamiento del servidor

| Aspecto | Estado | Diferencia |
|---|---|---|
| Autoritativo (física/validación/inventario en servidor) | ✅ | Mejor que muchos clones; anti-cheat de movimiento |
| Tick 20 Hz + broadcast | ✅ | OK |
| Persistencia JSON por chunk + world.json | ✅ (SCHEMA_VERSION 5 en F12) | Sin BD (decisión correcta para el alcance) |
| Mundos por semilla | ✅ | OK |
| Multijugador en tiempo real | ✅ | OK |
| Protocolo WS con eventos snake_case | ✅ | OK |
| **Perfilado** | ⚠️ Métricas existen (F7) | `net.js` (1370 líneas) y `mobs.js` (907) hacen work duplicado en tick/snapshot — optimizable (§7) |

### 2.7 Sistema de vida, hambre y experiencia

| Valor | Proyecto | MC real (Java) | ¿Correcto? |
|---|---|---|---|
| Salud máxima | 20 (+10 con niveles) | 20 | ⚠️ MC no da vida por nivel (eso es de mods) — **corregir** (§5-B1) |
| Regeneración | comida ≥18 | comida ≥18 | ✅ |
| Inanición | comida 0 | comida 0 | ✅ |
| Daño de caída | `fallDamage(blocks)` | daño = bloques − 3 | ✅ (verificar fórmula exacta) |
| Daño de lava | 2/500ms | 4/s aprox. | ⚠️ MC lava = 4 de daño por segundo (2 cada 500ms = 4/s — ✅ en realidad coincide) |
| Quemadura (fuego residual) | ✅ (F10) | ✅ | OK |
| XP: curva | `xpToNext = 7 + floor(level·3.5)` | 2L+7 (L<16), 5L−38 (16-30), 9L−158 (31+) | ⚠️ **aproximación lineal**, no la curva real (§5-B2) |
| XP al morir | se conserva | se pierde en el punto de muerte | ⚠️ simplificación documentada |

### 2.8 Minería y crafteo

| Valor | Proyecto | MC real | ¿Correcto? |
|---|---|---|---|
| Duracidad herramientas | 60/132/251/33/1562 | 59/131/250/32/1561 | ⚠️ +1 (MC se rompe "en el uso N+1"; aquí dura 1 uso más) — trivial |
| Dureza piedra | 1.5 | 1.5 | ✅ |
| Dureza tierra | 0.75 | 0.5 | ⚠️ **incorrecta** (0.75 vs 0.5) |
| Dureza grava | 0.4 | 0.6 | ⚠️ **incorrecta** |
| Dureza arena | 0.5 | 0.5 | ✅ |
| Tier de minerales | piedra+ para hierro, hierro+ para diamante | idéntico | ✅ |
| Recetas | 56 crafteo + 10 horno | ~300 | ⚠️ **gran laguna** — faltan arco, flechas, puertas, escaleras, losas, vallas, cubo, armaduras oro/malla, todos los bloques decorativos, etc. (§6) |

### 2.9 Combate, herramientas y armaduras

| Valor | Proyecto | MC real (1.9+) | ¿Correcto? |
|---|---|---|---|
| Daño espada madera | 3 | 4 | ⚠️ −1 |
| Daño espada piedra | 4 | 5 | ⚠️ −1 |
| Daño espada hierro | 5 | 6 | ⚠️ −1 |
| Daño espada diamante | 6 | 7 | ⚠️ −1 |
| Daño espada oro | 4 | 4 | ✅ |
| Daño a mano | 2 | 1 | ⚠️ +1 |
| Ataque crítico/cargado | ❌ no existe | existe (1.9+) | Laguna |
| Reducción armadura cuero | 4+8+6+3 = 21% | 1-3-2-1 puntos = 7/20 = 35% → con fórmula 4%/punto ≈ 28% | ⚠️ **valores por pieza incorrectos** (p. ej. pechera cuero 8% vs 12%) |
| Reducción armadura hierro | 8+12+10+6 = 36% | 2-6-5-2 = 15 puntos | ⚠️ MC hierro 60% aprox.; aquí 36% — **muy por debajo** |
| Reducción armadura diamante | 12+16+14+8 = 50% | 3-8-6-3 = 20 puntos ≈ 80% | ⚠️ **muy por debajo** |
| Durabilidad armadura | cuero 55-80, hierro 165-240, diamante 363-528 | cuero 55-80, hierro 165-240, diamante 363-528 | ✅ exactas |
| Tiempo de ataque (espada) | clic | 0.5s cooldown (1.9+) | Laguna menor |
| Knockback | ✅ (F8) | ✅ | OK |

---

## 3. Bugs encontrados (paridad)

### B1. La salud máxima sube con los niveles
`players.js`/`constants.js`: "Cada nivel suma +1 de salud máxima (máx +10)".
**En Minecraft real la vida máxima es SIEMPRE 20** (sin contar efectos/
encantamientos). Esto es una mecánica de mods que se coló como "MC-like".
**Corregir:** eliminar el bonus de vida por nivel (los tests y el HUD
`maxhp` se actualizan a 20 fijo).

### B2. Curva de XP incorrecta (lineal por tramos mal)
`xpToNext(level) = 7 + floor(level·3.5)` da 7, 10, 14, 17, 21... La curva
oficial de MC es por tramos: `2L+7` (niveles 0-15 → 7, 9, 11, 13, 15...),
`5L−38` (16-30), `9L−158` (31+). El coste total a nivel 30 en MC = **1.395 XP**
(vs la curva actual ~mucho menos).
**Corregir:** implementar la tabla por tramos en `xpToNext` y ajustar los
tests de XP (`unit-durabilidad.js`, `audit-fase5.js` esperan la curva actual).

### B3. Daño de espadas −1 y daño a mano +1
MC 1.9+: madera 4, piedra 5, hierro 6, diamante 7 (oro 4) + **mano = 1**.
El clon: 3/4/5/6 y mano 2. Todo el combate cuerpo a cuerpo inflige 1 menos,
y golpear a mano hace el doble que en MC.
**Corregir:** `SWORD_DAMAGE` +1 en madera/piedra/hierro/diamante y daño a
mano = 1. Repercute en `damagePlayer` y en el test de daño de espada.

### B4. Armadura: reducción de daño muy por debajo de MC
El modelo usa `ARMOR_DAMAGE_REDUCTION` porcentual (cuero 4-8-6-3%, hierro
8-12-10-6%, diamante 12-16-14-8%) con tope del 80%. MC usa **puntos de
armadura**: cuero 1-3-2-1, hierro 2-6-5-2, diamante 3-8-6-3 (totales 7/15/20)
y la fórmula `reducción = puntos × 4%` con tope del 80%.
**Corregir:** tabular los puntos por pieza y aplicar `min(puntos × 4, 80)%`.
Una armadura de hierro completa pasaría de 36% → 60% y la de diamante de
50% → 80%. Actualizar tests de armadura.

### B5. Durezas de bloques incorrectas
Tierra 0.75 (MC 0.5), grava 0.4 (MC 0.6). Arena 0.5 ✅.
**Corregir:** `BLOCK_HARDNESS[DIRT] = 0.5`, `BLOCK_HARDNESS[GRAVEL] = 0.6`.

### B6. Duracidades de herramientas +1 uso
60/132/251/33/1562 vs MC 59/131/250/32/1561 (MC muestra "durabilidad N" y se
rompe al superarla). El desfase de 1 uso es cosmético; **corregir al valor de
MC** para paridad exacta (afecta `audit-fase5.js` que ya audita la tabla).

### B7. Vida por nivel (relacionado con B1)
`respawnPlayer` resetea la vida máxima según el nivel. Al eliminar B1, el
respawn siempre a 20. Sin cambio adicional.

### B8. Sin arco ni flechas del jugador (laguna prioritaria)
El esqueleto dispara flechas pero el jugador no puede craftear ni usar arco.
**Laguna** — la más visible del combate (§6-L1).

### B9. Sin puertas, escaleras, losas ni vallas (laguna de construcción)
MC tiene estos bloques básicos; el clon solo planks/logs/piedra. **Laguna**
(§6-L2/L3).

### B10. Sin cubo de líquidos (agua/lava)
No se puede recoger ni verter agua/lava. **Laguna** (§6-L4).

### B11. Sin recetas de oro/malla y ~250 recetas faltantes
El libro tiene 56 recetas; MC supera las 300. **Laguna** (§6-L5).

### B12. XP se conserva al morir
MC la pierde en el punto de muerte (se puede recuperar yendo allí).
Simplificación documentada; **opcional** en Fase 13 (bajo prioridad).

---

## 4. Cómo proceder con las correcciones (orden sugerido)

1. **Bloque B (paridad) — valores primero, lagunas después**:
   - B1/B2/B3/B4/B5/B6: cambios de constantes + tests de paridad (bajo
     riesgo, alto valor: el combate y la supervivencia se sienten "de MC").
   - Después las lagunas: L1 arco+flecha (reusa la física de flechas del
     esqueleto), L2 puertas, L3 escaleras/losas/vallas, L4 cubo, L5 recetas.
2. **Cada corrección = un commit** con su test actualizado (convención
   `Fase N: resumen`).
3. **Validación**: `node tests/run.js --unit` + E2E + auditorías + `biome
   check` + `node --check` (ver §8). Los tests de paridad nuevos
   (`unit-paridad.js`) fijan los valores oficiales para que no se
   desvíen de nuevo.

---

## 5. Notas de diseño sobre la altura del mundo (decisión diferida)

MC 1.18+ tiene 384 bloques de altura (-64..320). El clon usa 64 (0..64).
Subir la altura es el cambio de mayor impacto del mundo y NO se incluye en la
Fase 13: tocaría generación (columnas más altas), guardado (más datos por
chunk), culling/LOD, física, rendimiento y el formato de guardado
(`SCHEMA_VERSION`). Se documenta como **Fase 14 candidata** con su propio
estudio de coste/beneficio.

---

## 6. Lagunas priorizadas por el usuario (Fase 13, Bloque B)

| # | Laguna | Detalle de implementación | Test |
|---|---|---|---|
| L1 | **Arco + flechas del jugador** | ítem BOW (247) + ARROW (248); receta (3 sticks + 3 string); clic derecho carga/libera (o disparo directo simple); reusa `state.arrows` (física existente) con `from: player.id`; flechas recogibles; daño 9 (MC: flecha 9) | unit: receta, disparo, daño, recogida |
| L2 | **Puertas (madera/hierro)** | Bloques DOOR (48/49) no sólidos con hitbox de apertura al caminar/clic; recetas (6 planks / 6 iron); abrir/cerrar al jugador cercano (broadcast `door_state`) | unit: apertura, colisión |
| L3 | **Escaleras + losas + vallas** | Bloques STAIRS (50+), SLAB (60+), FENCE (70+); recetas (6 bloques → 4 escaleras, 3 → 6 losas, 4+2 → valla+portón); orientación simplificada por cara mirada; colisión según forma | unit: forma, colocación orientada |
| L4 | **Cubo de líquidos** | Ítem BUCKET (249) + cubo de agua/lava (250/251); clic derecho en agua/lava lo recoge (fuente), clic derecho vacía donde se mira; reusa la fuente infinita de F11 | unit: recoger/verter, no duplicar fuentes |
| L5 | **Recetas faltantes** | Arco, flechas, puertas, escaleras, losas, vallas, portones, cubo, armaduras oro/malla, cama ya está, compás, antorcha ya está... (~30-50 recetas de los bloques/ítems que ya existen + los nuevos) | unit-recetas: integridad + categorías |

**Nota:** las recetas de L5 solo cubren ítems que existen en el juego (no se
inventan bloques); los bloques nuevos (puertas/escaleras/losas/vallas/cubo)
son la Fase 13 B y sus recetas van con ellos.

---

## 7. Optimización de rendimiento (Fase 13, Bloque A — prioridad del usuario)

| # | Optimización | Área | Impacto | Riesgo |
|---|---|---|---|---|
| P1 | **Greedy meshing** | Cliente `world.js` buildChunkGeometry: fusionar caras coplanares del mismo bloque en quads grandes → 3-5× menos vertices/caras por chunk | Alto (render + memoria) | Medio: reescribir la generación de geometría; los tests de culling/raycast deben seguir pasando |
| P2 | **Workers de chunks** | Mover `buildChunkGeometry` (y opcionalmente la generación del servidor, aunque es server-side) a Web Workers → no bloquear el hilo principal al cargar chunks | Alto (jank al explorar) | Medio: transferencia de datos al worker (Uint16Array chunks), coordinación de LOD/culling |
| P3 | **Auditar pool/culling/LOD** | Revisar `geoPool`, `applyFrustumCulling` y `updateLod`: eliminar trabajo duplicado (p. ej. raycast del highlight + del retarget hacen 2 raycasts por pointermove), bounds obsoletos, reconstrucciones innecesarias | Medio | Bajo: optimización incremental |
| P4 | **Perfilado servidor** | `server/net.js` (1370 líneas) y `server/mobs.js` (907): en el tick 20 Hz se hacen snapshots/broadcasts que pueden duplicar trabajo; cachear snapshot de mobs por tick, evitar recomputar getSafeSpawn/getBiome por mob | Medio | Bajo: medible con las métricas existentes (F7) |
| P5 | **Coste del highlight** | `updateHighlight` + el listener de retarget hacen 2 `raycastTerrainAndMobs()` por pointermove → 1 solo raycast compartido | Bajo pero gratis | Cero: refactor de input.js |

**Regla:** ninguna optimización puede cambiar el comportamiento del juego
(los tests de mecánicas y las auditorías CDP de render/culling deben seguir
en verde). Se mide antes/después con las métricas de F3 y la auditoría CDP.

---

## 8. Migración a POO completa del servidor (Fase 13, Bloque C)

### 8.1 Decisión y alcance

El usuario eligió **POO completa del servidor**. Objetivo: mantenibilidad y
extensibilidad (cada especie de mob = una clase; cada entidad = objeto con
estado y comportamiento), manteniendo la API externa (WS, exports, tests)
compatible en lo posible.

### 8.2 Diseño propuesto (migración incremental con tests como red)

```
server/
  entities/
    Entity.js        // base: id, posición, velocidad, tick()
    Player.js        // extends Entity: inventario, armadura, hambre, XP, daño
    Mob.js           // extends Entity: MOB_HEALTH, estado, chase/flee/graze
    hostiles/
      Zombie.js      // BURNS_IN_SUN, ataque cuerpo a cuerpo
      Creeper.js     // fuseStart/explode, encadena TNT
      Skeleton.js    // shootArrow (flechas)
      Spider.js      // escala muros, salta
      Enderman.js    // teletransporte, irritación
      Wolf.js        // F12: domesticable, ataca objetivo, sitting
      Slime.js       // F12: división, salta
      Drowned.js     // F12: nada, tridente
    passives/
      Cow.js, Pig.js, Chicken.js, Sheep.js, Rabbit.js, Bee.js
      Ocelot.js      // F12: huye, se domestica → Cat
  world/
    World.js         // chunks, generación, getBlock/setBlock, biomas, altura
    Chunk.js         // datos, dirty, serialización (gzip)
  items/
    ItemStack.js     // { id, count, durability }
  crafting/
    Recipe.js        // shape/ingredientes/resultado
```

### 8.3 Cómo migrar sin romper el juego

1. **Fase 1 (refactor estructural):** mover `function Mob` a `class Mob` con
   los métodos de instancia actuales (`tickHostile`, `tickPassive`, ...),
   manteniendo los mismos nombres de propiedades (los snapshots y tests leen
   `m.x/y/z/health/type/...`). Los tests actuales (`unit-mobs-ia.js`,
   `unit-fase9.js`, `unit-fase11.js`) pasan SIN cambios → red de seguridad.
2. **Fase 2 (herencia):** crear las subclases por especie moviendo los `if
   (this.type === "creeper")` a métodos sobreescritos (`tick()` de la clase).
   Cada clase exporta su constructor; `createMob(type, ...)` lo elige.
3. **Fase 3 (Player/World/Chunk):** `Player` como clase (los `player.*` del
   estado actual son ya un objeto plano: encapsular sus métodos), `World`
   con `getBlock/setBlock/getBiome/isOcean/...` (hoy son funciones sueltas),
   `Chunk` con serialización.
4. **Fase 4 (limpieza):** eliminar el código muerto que la OOP deja al
   descubierto (branching por tipo fuera de las clases, switch gigantes).
5. **Regla dura:** los exports de `server/*.js` que los tests usan se
   mantienen como fachadas (p. ej. `mobs.createMob`, `world.getBlock`), para
   no reescribir 53 tests. La migración es por capas: 1 commit por clase con
   la suite en verde tras cada commit.

### 8.4 Beneficios concretos

- `server/mobs.js` (907 líneas, `if (type === X)` en el tick central) se
  descompone en clases de ~50-100 líneas: añadir un mob nuevo = 1 clase nueva
  + registrar su spawn; sin tocar el tick central.
- Los tests por especie se escriben contra la clase (`new Creeper(...)`),
  no contra ramas del switch.
- El snapshot/broadcast se estandariza (método `snapshot()` en Entity).
- La Fase 12 (mobs nuevos) y la 13 (POO) encajan: los mobs de F12 se crean
  ya como clases si el cronograma lo permite.

### 8.5 Riesgos y mitigación

| Riesgo | Mitigación |
|---|---|
| Romper la API de los 53 tests | Fachadas con la misma firma; suite en verde tras CADA commit |
| Regresiones de comportamiento | Los tests de IA/mecánicas existentes cubren el tick; auditorías CDP de render |
| Acoplamiento circular (world↔mobs↔players) | Inyección de dependencias: las clases reciben `world`/`state` en el constructor (patrón ya usado en `new Mob(type, x, y, z)`) |
| Tiempo | Migración por capas con commits pequeños; si se agota el tiempo, se entrega al menos Fase 1-2 (Mob/herencia) que es el 80% del beneficio |

---

## 9. Plan de validación (cómo comprobar que todo es correcto)

| Nivel | Comando | Qué valida |
|---|---|---|
| Sintaxis | `node --check` en todos los `.js` tocados | Sin errores de parseo |
| Lint | `npx biome check server public tests` | 0 errores (solo warnings/infos toleradas) |
| Unitarios | `node tests/run.js --unit` | 53 tests + los nuevos, todos exit 0 |
| E2E | `PORT=3998 node server.js` + `WS_URL=ws://localhost:3998 node tests/run.js --e2e` | Flujos de red contra servidor vivo |
| Auditorías | `node tests/audit-fase3..7.js`, `node tests/diag-clic.js --audit` | Invariantes por fase + render CDP |
| Paridad | **`node tests/unit-paridad.js`** (nuevo, Fase 13 D) | Tabla oficial de MC (daño espada, armadura por pieza, durabilidad, dureza, comida, XP, minerales) contra `constants.js` — el test falla si alguien vuelve a desviar los valores |
| Rendimiento | Métricas F3 (`window.__mc*`), auditoría CDP con conteo de vertices/caras antes/después de greedy meshing | Sin regresión de render y con reducción medible |

### Criterio de cierre de la Fase 13

1. `unit-paridad.js` en verde (todos los valores oficiales fijados).
2. Lagunas L1-L5 implementadas y con test (arco, puertas, escaleras/losas/
   vallas, cubo, recetas).
3. POO del servidor migrada por capas con la suite en verde en cada commit.
4. Rendimiento: greedy meshing + workers + auditar pool/culling/LOD +
   perfilado servidor medidos antes/después (reducción de vertices/draw
   calls y de jank al explorar) sin cambios de comportamiento.
5. Suite completa (unit + E2E + auditorías + biome + node --check) en verde.

---

## 10. Fuera de alcance (mantener)

Lo ya definido en `AGENTS.md`/`TODO.md` "Fuera de alcance": BD externa,
autenticación/cuentas, redstone, dimensiones (Nether/End), aldeas generadas,
clima. La altura del mundo (384 bloques) se difiere a una Fase 14 candidata
(§5). Los encantamientos y pociones no están en la lista del usuario y no se
incluyen en la Fase 13 (se documentan como candidatos futuros).
