# Fase 15 — Corrección de la auditoría, paridad restante y POO (Spec)

> Documento de especificación creado a partir de la **auditoría general del
> proyecto** (errores, mejoras y paridad pendiente contra Minecraft) y de la
> petición del usuario de centrar la Fase 15 en **corrección de bugs +
> paridad con Minecraft + migración a POO**.
>
> Fecha: 2026-08-09 · Proyecto: clon de Minecraft (servidor Node autoritativo
> `server/` + cliente Three.js `public/`, todo en español).
>
> Estado: **completada y auditada**. El grueso del plan (A1, A3, A4, Bloque B
> L1-L5 y Bloque C POO) se ejecutó junto al cierre de la Fase 13; esta fase
> añadió **A2 (copas de árboles completas en bordes de chunk)**, **D1 (nubes
> semitransparentes con variedad)** y **D3 (tooltip del hotbar)**, y cerró el
> registro de los tests `unit-ao.js`/`unit-muerte.js` (suite de 50 unitarios).
>
> **Punto de partida (importante):** el árbol de trabajo tenía **13 archivos
> modificados sin commitear** (Fase 13 A4 de perfilado servidor + Fase 13 L1
> del arco: ítems BOW/ARROW/FLINT/FEATHER, recetas, `shootPlayerArrow`,
> `biomeCache`, `unit-perf-server.js`) que **NO estaban en HEAD**. Ese WIP
> incluía una **regresión crítica**: `server/mobs.js:5` tenía el
> `require("uuid")` fusionado dentro de un comentario → **ningún mob nuevo
> podía crearse** (`uuidv4 is not defined`). La suite unitaria estaba roja por
> esto. **Primer paso obligatorio:** commitear (o reparar y commitear) ese
> WIP y volver a la suite en verde antes de tocar nada de la Fase 15.
> Resuelto en el cierre documentado de la Fase 13 (commits `c208271`,
> `92352ef`, `a4d2fb2`, `3eac7b3`, `a90a2db`); esta spec quedó como
> retrospectiva del adicional de la Fase 15.

---

## 0. Resumen de la auditoría

| # | Categoría | Hallazgo | Gravedad | Ubicación |
|---|-----------|----------|----------|-----------|
| A1 | Bug crítico (WIP) | `const { v4: uuidv4 } = require("uuid");` quedó **dentro de la línea de comentario** `// ===...===` en `server/mobs.js:5` → `ReferenceError: uuidv4 is not defined` en el constructor `Mob` → **no se puede crear ningún mob** (ni spawn, ni cría, ni tests) | 🔴 crítica | `server/mobs.js:5` |
| A2 | Bug de generación | Las **copas de los árboles se recortan en los bordes de chunk**: `world.js:1107-1108` hace `continue` si `lx/lz` sale del chunk, y el chunk vecino no coloca esas hojas (no sabe del árbol). Confirmado: 28/32 robles/abedules pegados al borde este tienen copa asimétrica | 🟡 media-alta | `server/world.js:1107` |
| A3 | WIP sin commitear | Fase 13 A4 (biomeCache por celda, `biomeCacheStats`) + Fase 13 L1 (arco del jugador) en 13 archivos: `server/{world,mobs,net,players,constants}.js`, `public/{constants,input,itemicons,recipeCategories,ui}.js`, `recetas.json`, `tests/{run,unit-sync}.js` + `tests/unit-perf-server.js` (nuevo) | 🔴 crítica (no commitear rompe la trazabilidad) | working tree |
| A4 | Mejora | `biomeCache` (Fase 13 A4): correcto conceptualmente (3 ruidos 2D deterministas por celda, invalida con `reinitNoise`, tope 65536 con clear), pero tiene **comentario duplicado** (bloque repetido en `world.js:60-65`) y el `unit-perf-server.js` está registrado en `run.js` pero falla por A1 | 🟢 baja | `server/world.js:60-76` |
| A5 | Paridad | L1 (arco) **a medio hacer** en el WIP: ítems/recetas/`shootPlayerArrow`/clic derecho del cliente listos; falta `returnToOwner`/recogida robusta, `BOW_DURABILITY` (384) del arco del jugador, y tests | 🟡 media | `server/mobs.js:197-228`, `public/input.js:588-592` |
| A6 | Paridad | Lagunas L2-L5 sin tocar: **puertas** (48/49), **escaleras/losas/vallas**, **cubo de líquidos** (249-251), **~30-50 recetas faltantes** | 🟡 media | §3 de este spec |

---

## 1. Contexto

- Fases 0-12 cerradas y auditadas; Fase 13 en curso (A1 greedy meshing y A2
  worker de chunks YA en HEAD `7c9f07c` con sus unit en verde; el resto A4/B/C
  pendiente o en el WIP sin commitear); Fase 14 completada y auditada (paridad
  de valores + rendimiento M1-M5, suite 3666 OK en su cierre).
- El usuario quiere que la **Fase 15** aborde: (a) los bugs encontrados, (b) la
  **paridad con Minecraft pendiente** (lagunas L1-L5 del reporte) y (c) la
  **migración a POO completa del servidor** (Bloque C de la Fase 13 que no se
  ejecutó: solo existe `class Mob` como refactor estructural, sin herencia por
  especie ni `Player`/`World`/`Chunk`/`ItemStack` como clases).
- Fuentes: `docs/reporte-paridad.md` (bugs B1-B12, lagunas L1-L5 §6, diseño POO
  §8), `docs/fase13-spec.md` (Bloque C completo sin ejecutar), `docs/Notas del
  usuario.md` (bugs/mejoras del usuario), `docs/fase14-spec.md` (modelo de
  formato de este spec).

---

## 2. Bloque A — Bugs y estabilización (prerrequisito)

### A1 — Reparar la regresión `uuid` en `server/mobs.js`

- Mover `const { v4: uuidv4 } = require("uuid");` a su propia línea fuera del
  comentario (devolver el archivo al estado de HEAD en esa línea).
- Alternativa más robusta: reemplazar `uuidv4()` por un id incremental +
  sesión (sin dependencia `uuid`) — solo si es trivial y se mantienen las
  garantías de unicidad por conexión/mob. **Preferible mantener `uuid`** por
  no tocar el formato de guardado ni el protocolo.

**Criterio:** `new mobs.Mob("cow", 10, 10, 10)` funciona; suite unitaria en
verde; server arranca y **spawnea mobs nuevos** (no solo los del guardado).

### A2 — Copas de árboles recortadas en bordes de chunk

**Problema:** al generar un árbol cuyo tronco está a <3 bloques del borde, las
hojas que caerían en el chunk vecino se descartan (`continue`). El vecino no
sabe del árbol → copa asimétrica. Es visible y rompe la paridad visual.

**Opciones de implementación (elegir la de menor riesgo):**

1. **Tronco lejos del borde**: al colocar un árbol, si `x`/`z` está a menos de
   3 bloques del borde del chunk, desplazar/descartar el árbol (más simple;
   reduce ligeramente la densidad en bordes, invisible a ojo).
2. **Escribir hojas en el vecino**: al generar el chunk, si la hoja cae fuera,
   diferirla a una cola `pendingCanopy` que `ensureChunksAround` aplica cuando
   el vecino existe (más fiel; requiere coordinar generación entre chunks).
3. **Radio de seguridad en `canGrowTree`**: exigir también que el área 5×5
   (radio copa) quede dentro del chunk (variante de 1).

**Criterio:** `unit-arboles.js` ampliado verifica que **todo** árbol con copa
dentro del área generada tenga su copa completa (sin recortes asimétricos); la
densidad total de árboles no baja perceptiblemente (métrica en el test).

### A3 — Commitear/estabilizar el WIP de Fase 13 (A4 + L1)

- Reparar (si procede) y **commitear por preocupación**: 1) A4 perfilado
  servidor (biomeCache + `unit-perf-server.js` + `run.js`), 2) L1 arco
  (constantes/recetas + servidor + cliente + `unit-sync` ampliado).
- Quitar el comentario duplicado de `world.js:60-65`.
- **Criterio:** suite unitaria completa en verde tras cada commit; HEAD limpio
  (`git status` sin modificados) antes de empezar el Bloque B.

---

## 3. Bloque B — Paridad con Minecraft (lagunas L1-L5)

Orden y especificación tomados de `docs/reporte-paridad.md` §6 y
`docs/fase13-spec.md` Bloque B.

### B1 — L1 Arco + flechas del jugador (continuar el WIP)

- Ya hecho (en el WIP): ítems `BOW 247` / `ARROW 248` / `FLINT 252` /
  `FEATHER 253`, recetas (`bow`, `arrow` en `recetas.json`), `BOW_DAMAGE=9`,
  `BOW_DURABILITY=384`, `shootPlayerArrow` (reusa `state.arrows`,
  `playerArrow:true`, daño 9, consume 1 flecha), clic derecho en cliente
  (`input.js:588-592` envía `shoot_bow`).
- **Pendiente:** desgaste del arco (durabilidad 384 por disparo) y rotura;
  flecha recogible de vuelta al dueño al impactar/expirar
  (`returnToOwner`/`pickupArrow`); HUD con `BOW_DURABILITY` (ya hay helpers en
  `ui.js`); **tests**: receta, disparo, daño 9, consumo de flecha, recogida,
  desgaste.
- **Criterio:** `unit-lagunas.js` (o `unit-arco.js`) en verde + E2E de disparo
  contra servidor vivo (patrón `e2e-cofre.js`).

### B2 — L2 Puertas (madera/hierro)

- Bloques `OAK_DOOR 48` / `IRON_DOOR 49` (no sólidos abiertas, hitbox de
  apertura). Abrir/cerrar por clic derecho o jugador cercano → broadcast
  `door_state`. Recetas: 6 planks / 6 lingotes de hierro.
- Colocación orientada por la cara mirada; dos mitades (superior/inferior).
- **Criterio:** `unit-lagunas.js`: apertura/cierre, colisión según estado,
  receta, persistencia del estado en `world.json`.

### B3 — L3 Escaleras, losas y vallas

- Bloques `STAIRS` (50+), `SLAB` (60+), `FENCE` (70+) por material.
- Colisión según forma (escalera = escalones, losa = medio bloque, valla =
  columna baja). Orientación por cara mirada. Recetas MC (6 bloques → 4
  escaleras; 3 → 6 losas; valla + portón).
- **Criterio:** `unit-lagunas.js`: forma de colisión, colocación orientada,
  recetas. Verificación CDP (`audit-fase4` culling) sin regresión.

### B4 — L4 Cubo de líquidos

- Ítems `BUCKET 249` / `WATER_BUCKET 250` / `LAVA_BUCKET 251`. Clic derecho
  en agua/lava fuente lo recoge; clic derecho vacía donde se mira. Respetar la
  **fuente infinita 2×2** de la F11 (no duplicar la fuente).
- **Criterio:** `unit-lagunas.js`: recoger/verter, la fuente 2×2 se rellena,
  recetas del cubo y de los cubos llenos.

### B5 — L5 Recetas faltantes

- Completar el **~30-50 de recetas** de ítems que ya existen y no son
  crafteables (arco, flechas, cubos, puertas, escaleras, losas, vallas,
  portones, armadura de oro/malla, compás...). Auditoría: todo ítem colocable/
  herramienta de `constants.js` sin receta sale en el test.
- **Criterio:** `unit-recetas.js` ampliado verifica **cobertura total**:
  cada ítem obtenible del `I` del servidor tiene receta de crafteo o de horno
  (salvo los de drop/compra justificados); categorías del libro al día.

---

## 4. Bloque C — Migración a POO completa del servidor

> Diseño completo en `docs/reporte-paridad.md` §8. Retomar el **Bloque C de la
> Fase 13** (nunca ejecutado: solo existe `class Mob` como refactor
> estructural, sin herencia ni `Player`/`World`/`Chunk`/`ItemStack`). Regla
> dura: la suite va en verde **después de cada commit**; los exports de
> `server/*.js` que usan los tests se mantienen como **fachadas con la misma
> firma**; NO cambia el protocolo WS ni el formato de guardado.

### C1 — Hecho (verificar y fijar con tests)

- `class Mob` ya existe en `server/mobs.js:376` con los métodos de instancia.
- Confirmar con `unit-mobs-poo.js` que el refactor no rompió `unit-mobs-ia.js`,
  `unit-fase9.js`, `unit-fase11.js`, `unit-fase12.js`.

### C2 — Herencia por especie

- Subclases: `Zombie`, `Creeper`, `Skeleton`, `Spider`, `Enderman`, `Wolf`,
  `Slime`, `Drowned`, `Cow`, `Pig`, `Chicken`, `Sheep`, `Rabbit`, `Bee`,
  `Ocelot`.
- Mover los `if (this.type === "...")` del tick central a métodos
  sobreescritos (`tick()`, `onDamage()`, `onDeath()`).
- `createMob(type, x, y, z)` elige la clase por tipo (registro tipo→clase).
- **Criterio:** `unit-mobs-poo.js` (una unidad por clase) en verde; suite sin
  cambios.

### C3 — Player / World / Chunk / ItemStack

- `Player` como clase: encapsula los campos planos del estado + métodos
  (`damage`, `heal`, `eat`, `addItem`, `applyFallDamage`, `respawn`,
  `addXp`). `players.js` exporta fachadas con la firma actual.
- `World`/`Chunk`: `world.getBlock/setBlock/getHeight/getBiome/isOcean/...`
  como métodos de instancia; `Chunk` con serialización/dirty.
- `ItemStack` para `{ id, count, durability }` (inventario, drops, cofres).
- **Criterio:** suite completa en verde; `unit-itemstack.js`/`unit-chunk.js`
  nuevos.

### C4 — Limpieza y métricas

- Eliminar branching muerto que la POO deje al descubierto; medir la
  reducción de líneas de `mobs.js`/`net.js`; documentarlo en el spec final.

---

## 5. Bloque D — Mejoras del usuario (de `Notas del usuario.md`)

Prioridad baja (tras A/B/C); solo las marcadas como pendientes:

| # | Mejora | Nota |
|---|--------|------|
| D1 | Nubes negras → semitransparentes y más variedad | bug visual pendiente (única pendiente del apartado Bugs) |
| D2 | Sprint (correr): +30% velocidad + FOV + gasto de hambre | ⭐ bajo esfuerzo |
| D3 | Tooltip con nombre/durabilidad en el hotbar | ⭐ bajo esfuerzo |
| D4 | Esquilar ovejas (tijeras), hueso/bonemeal | interacciones icónicas |
| D5 | Alturas -64..+64 (decisión diferida) | alto impacto: generación, guardado (`SCHEMA_VERSION`), culling, física — requiere estudio propio |

---

## 6. Cierre y auditoría de la Fase 15

1. Suite unitaria completa en verde (`node tests/run.js --unit`) **tras cada
   commit**; E2E 4/4 + los nuevos (arco, puertas, cubo) contra servidor vivo.
2. `node --check` en todo lo tocado y `biome check` 0 errores.
3. Auditorías 3-12 sin regresiones (especialmente `audit-fase4` culling con los
   bloques nuevos, `audit-fase5` durabilidad con `BOW_DURABILITY`,
   `audit-fase7` render CDP con puertas/escaleras/losas/vallas).
4. Verificación manual en navegador: arco (disparar + recoger flecha), puertas,
   escaleras/losas/vallas (colocación y colisión), cubo (recoger/verter + fuente
   2×2), árboles con copa completa en bordes.
5. Actualizar `TODO.md` (Fase 13 cerrada, Fase 15 completada), `docs/README.md`
   y `AGENTS.md` (fases y estado).
6. Métricas POO (reducción de líneas, §C4) y de rendimiento (sin regresión en
   F3/`audit-fase7`) documentadas en el spec final.

---

## 7. Criterios de aceptación (resumen)

1. **Bloque A:** suite verde con el WIP commitado; `server.js` spawnea mobs
   nuevos; árboles con copa completa en bordes (`unit-arboles` ampliado).
2. **Bloque B:** L1 arco completo y testeado; L2-L5 implementados con sus tests
   y recetas; `unit-recetas` cubre el 100% de ítems obtenibles.
3. **Bloque C:** POO completa (herencia por especie + `Player`/`World`/
   `Chunk`/`ItemStack`) con fachadas compatibles y suite en verde; métricas de
   reducción documentadas.
4. **Bloque D:** al menos D1 (nubes) resuelto; D2-D4 si el tiempo lo permite.
5. Auditorías y E2E en verde; documentación actualizada.

---

## 8. Auditoría de cierre (2026-08-09)

La Fase 15 **completa y auditada**:

- **A1 (uuid crítico)** — resuelto en el cierre de la Fase 13
  (`utils: server/mobs.js` con `const { v4: uuidv4 }` fuera del comentario).
- **A2 (copas de árboles)** — fix y test en esta fase: las hojas se
  buferizan en `pendingLeaves` durante el bucle de columnas y se aplican al
  final del chunk (`server/world.js`), y los troncos crecen a ≥2 bloques del
  borde para que la copa 5×5 quepa entera. Test determinista (RNG LCG) en
  `tests/unit-arboles.js`.
- **A3/A4 (WIP Fase 13)** — commiteado por preocupación en el cierre de la
  Fase 13; sin comentario duplicado en `world.js`.
- **Bloque B (L1-L5)** — arco con desgaste/rotura y flechas recogibles,
  puertas, escaleras/losas/vallas, cubo de líquidos con fuente infinita y
  cobertura de recetas: `tests/unit-lagunas.js` (25 checks) + `unit-recetas`.
- **Bloque C (POO)** — `ItemStack`, `World`/`Chunk`, `Player`/`createPlayer`,
  subclases de mobs + `createMob`; `unit-mobs-poo.js`/`unit-poo-entities.js`.
- **Bloque D** — **D1** nubes semitransparentes (material básico sin
  iluminación que las oscurecía, `depthWrite:false`, más cajas por nube,
  alturas y velocidades variadas) y **D3** tooltip estilizado del hotbar con
  nombre y durabilidad al hover (`public/ui.js`, `#tooltip`). D2 (sprint) y
  D4 (esquilar/bonemeal) ya existían. D5 (alturas −64..+64) queda fuera del
  alcance (alto impacto, requiere estudio propio).
- **Suite**: 50 unitarios en verde (`run.js --unit`, exit 0) incluyendo el
  registro de `unit-ao.js` (AO por vértice, Fase 10 E1) y `unit-muerte.js`
  (causas de `player_die`, Fase 10 B2).

Commits de esta fase: `57ed016` (A2 árboles), `37773fd` (registro de tests),
`aa24c12` (spec prospectiva), `4ca3aff` (D1 nubes + D3 tooltip).
