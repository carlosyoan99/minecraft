# Fase 16 — Corrección de la auditoría 2026-08-10, bugs del usuario y paridad restante (Spec)

> Documento creado a partir de: `docs/Notas del usuario.md`, `docs/auditoria-2026-08-10.md`
> (la más reciente), `docs/reporte-paridad.md`, `TODO.md` y la entrevista con el usuario.
> Fecha: 2026-08-11 · Proyecto: clon de Minecraft.
> Estado: **prospectiva** (sin implementar).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | Trabajo pendiente | WIP de la Fase 15 (D5 alturas −64..+63) sin commitear (~35 archivos) | F15 D5 `[ ]` en TODO pero implementado y auditado en spec | 🔴 |
| B1 | `Notas del usuario.md` Bugs | Niebla bajo agua a ≤1 bloque de profundidad (ojos sobre agua) | F10 "Niebla bajo el agua" `[x]` — refinamiento pendiente | 🟠 |
| B2 | `Notas del usuario.md` Bugs | Cofres no eliminables (agacharse como en MC) | F10 "Agacharse" `[x]` — falta la interacción | 🟠 |
| B3 | `Notas del usuario.md` Bugs | IA de mobs no reacciona al ser atacados ni atacan al jugador | No asignado | 🔴 |
| B4 | `Notas del usuario.md` Bugs + CL-1 | Inventario sin texturas de ítems ni tooltip; barra de durabilidad fantasma | F15 D3 `[x]` parcial (solo hotbar) | 🟠 |
| B5 | `Notas del usuario.md` Bugs | Libro de recetas bloquea el mouse, sin texturas, no se puede cerrar | F9 "Libro de recetas" `[x]` — regresión | 🟠 |
| B6 | `Notas del usuario.md` Bugs | Opción de calidad gráfica sin efecto | F7 "Ajustes del juego" `[x]` | 🟠 |
| C1 | Auditoría REN-1/SV-4 | Guardado 100% síncrono cada 30 s (causa de timeouts E2E) | F1 "Guardado incremental" `[x]` — mejora | 🔴 |
| C2 | Auditoría SV-3/SEC-3 | Handlers con coords sin validar (`NaN`/strings) → chunks `"NaN,NaN"` | F0 "Validación de entrada" `[x]` — hueco | 🟠 |
| C3 | Auditoría SEC-1 | Bypass del anti-cheat de vuelo y speedhack horizontal | F8 "Anti-cheat" `[x]` — hueco | 🟠 |
| C4 | Auditoría SEC-2 | `set_seed` en bucle → disco + bloqueo del event loop | F6/F9 `[x]` — hueco | 🟠 |
| C5 | Auditoría REN-2 | Hornos huérfanos: fuga de memoria + `world.json` engordando | F0 "Horno" `[x]` | 🟠 |
| C6 | Auditoría menores | SV-2 stacks parciales, SV-5 `/give` 999→64, SV-6 `/tp` sin clamp, CL-3 parse WS sin try/catch, REN-3 `settings` gigante | Varios | 🟡 |
| D1 | Auditoría PAR-1 + SV-1 | Horno con combustible genérico 400 t sin consumir (infinito) | F14 P4 `[x]` — paridad pendiente | 🟠 |
| D2 | Auditoría PAR-2 | Zombis/creepers sin drops; faltan ítems carne podrida y pólvora | F13 L1 `[x]` — laguna conocida | 🟠 |
| D3 | Auditoría PAR-3 | Puertas craftean ×1 en vez de ×3 | F13 L2 `[x]` | 🟡 |
| D4 | Auditoría PAR-4 | Vidrio fundido a 150 t en vez de 200 | F2/F13 `[x]` | 🟡 |
| D5 | Auditoría PAR-5 | Sin receta de carbón vegetal (tronco → carbón) | F13 L5 `[x]` | 🟡 |
| D6 | Auditoría PAR-7/8 | XP del slime mediano (1→2) y del lobo (8→1-3) | F14 P5 `[x]` | 🟡 |
| E1 | `Notas del usuario.md` Mejoras | Opción/arranque a pantalla completa | No asignado | 🟡 |
| E2 | `Notas del usuario.md` Mejoras + `AGENTS.md` | Extender `unit-recetas.js` (cobertura) y tests de los nuevos cambios | No asignado | 🟡 |

## 1. Contexto

- **Últimas fases:** Fase 15 completada y auditada (nubes D1, tooltip D3, D5
  alturas −64..+63 implementado y auditado por `tests/audit-altura.js`, 72/72).
  Suite de 50 unitarios en verde.
- **WIP sin commitear:** el working tree tiene ~35 archivos modificados
  (implementación del D5: mundo de 128 bloques, `SCHEMA_VERSION` 6, rebase
  `DESIGN_OFFSET`, optimizaciones de generación; y ajustes de tests/auditorías
  recalibradas) que **NO están en HEAD** (`da0b4c0`). **Prerrequisito
  obligatorio (A1):** commitear ese WIP por preocupación y dejar la suite en
  verde antes de tocar nada de la Fase 16.
- **Auditoría vigente:** `docs/auditoria-2026-08-10.md` (commit `da0b4c0`).
  Línea base: sintaxis 110/110, unit 50/50, **E2E rojos** (`e2e-mascotas` 0/19,
  `e2e-durabilidad` TIMEOUT 180 s, `e2e-templo` 0/6+30 s), `audit-fase4/6/7`
  rojas (fase4/6 por presupuestos descalibrados por el mundo de 128 bloques —
  ya recalibrados en el WIP). Causa raíz más probable de los E2E: **REN-1/SV-4
  (guardado síncrono)**.
- **Won't respetado:** encantamientos/pociones, redstone, dimensiones, clima,
  autenticación/BD externa, adaptación móvil (diferida) y menú inicial tipo
  Minecraft (decisión del usuario: Fase 17). No se inventan bloques/ítems
  salvo los ítems de paridad explícitos (D2).
- **Decisiones de la entrevista (2026-08-11):** orden por **valor percibido**
  (bugs del usuario primero); **E2E en verde** como criterio; **test de
  regresión por bug**; **verificación manual en navegador**; **auditoría
  final obligatoria**; **SCHEMA_VERSION solo si hace falta** (mínimo toque).
- Fuentes: `docs/Notas del usuario.md`, `docs/auditoria-2026-08-10.md`,
  `docs/reporte-paridad.md`, `docs/fase15-spec.md` (plantilla y cierre del
  D5), `CLAUDE.md`/`AGENTS.md` (convenciones).

---

## 2. Bloque A — Prerrequisito: cerrar el WIP del D5 y dejar HEAD limpio

### A1 — Commitear el WIP de la Fase 15 (alturas −64..+63)

- Revisar `git status`: ~35 archivos modificados (server, public, tests,
  docs) + untracked (`audit-altura.js`, `auditoria-2026-08-10.md`,
  `fase9.5-spec.md`).
- Commitear por preocupación, en español: 1) mundo de 128 bloques
  (server/public/tests), 2) optimizaciones de generación (early-exits +
  `lakeCache`), 3) tests/auditorías recalibradas, 4) docs (spec F15 §9 +
  índice + TODO).
- No tocar formato de disco ni protocolo (el WIP ya los define).
- **Criterio:** `git status` limpio; `node tests/run.js --unit` en verde;
  `node tests/audit-altura.js` 72/72; servidor arranca y sirve `/`.

---

## 3. Bloque B — Bugs del usuario (prioridad por valor percibido)

> Cada bug lleva su **test de regresión** (unit o E2E) y se verifica en
> navegador al cierre (F3 / inspección manual).

### B1 — Niebla bajo agua solo a ≥2 bloques de profundidad

- **Problema:** con los ojos sobre la superficie del agua se muestra la
  niebla submarina (nota del usuario).
- Buscar el lugar que aplica la niebla (detección "bajo el agua" del
  jugador, `public/` — probablemente `player.js`/`effects.js`) y exigir
  inmersión real: `eyeY < waterTop − 2` (o equivalente) para activarla.
- **Ficheros:** `public/*` (detección de niebla) y `public/constants.js` si
  se añade constante.
- **Criterio:** test de regresión (unit con cámara simulada a 1 y 2 bloques
  de profundidad) + verificación manual en navegador.

### B2 — Cofres eliminables con Shift (agachado)

- **Problema:** los cofres se abren con clic pero no se pueden romper;
  en MC hay que agacharse para destruirlos.
- Implementar: con el jugador agachado (`shift`/`sneaking`), `block_action
  break` sobre un cofre lo rompe y suelta drops (reusar `OTHER_DROPS`/
  inventario de cofre: soltar el contenido antes de destruir).
- **Ficheros:** `server/net.js` (break/chest), `server/players.js` o
  `server/world.js` (drops del cofre), `server/constants.js` si aplica;
  `public/input.js` (estado de shift en el mensaje).
- **Criterio:** E2E o unit: agachado + clic rompe el cofre y suelta los
  ítems; sin agachar no se rompe (solo abre).

### B3 — IA de mobs: reaccionar a ser atacados y atacar al jugador

- **Problema:** el usuario reporta que los mobs no reaccionan al ser
  atacados ni los hostiles atacan al jugador.
- La auditoría verificó que el tick por especie existe (F9) y que la causa
  de los E2E rojos no está en este código; **diagnosticar primero** en vivo:
  sonda WS + `__mc*` para confirmar si es percepción/regresión o un fallo
  real (p. ej. spawn por luz, distancia de agresión, `fleeUntil`).
- Reproducir el bug en navegador; si hay fallo real, corregirlo y fijarlo
  con test de regresión (extender `unit-mobs-ia.js`).
- **Ficheros:** `server/mobs.js`, `server/net.js` (agro), `public/mobs.js`
  (render de animación de ataque).
- **Criterio:** al atacar un pasivo este huye (flee); los hostiles dentro
  del radio de agresión persiguen y atacan; test de regresión en verde.

### B4 — Inventario: texturas de ítems + tooltip (y arreglar la barra fantasma)

- **Problema:** en el inventario no se ven las texturas de los ítems ni hay
  tooltip con nombre/descripción; y **CL-1**: `public/ui.js:111` usa
  `BOW_DURABILITY` (384) como fallback global → barra de durabilidad
  fantasma "384/384" en ítems sin durabilidad (adoquín, comida, ...).
- Corregir CL-1: el fallback `BOW_DURABILITY` solo debe aplicarse al arco
  (247); si el ítem no tiene durabilidad no se dibuja barra.
- Añadir texturas de ítems en el inventario (reusar `itemVisual`/
  `itemicons.js` de F9/F15) y tooltip con nombre + durabilidad + descripción
  donde aplique (extender el patrón D3 del hotbar al inventario completo).
- **Ficheros:** `public/ui.js` (`slotHtml`, `slotTooltipHtml`),
  `public/itemicons.js`, `public/constants.js`.
- **Criterio:** ítems apilables sin barra de durabilidad; todos los slots
  del inventario muestran su textura; tooltip con nombre y durabilidad al
  hover. Unit de regresión (`unit-ui.js` nuevo o ampliado) + manual.

### B5 — Libro de recetas: mouse desbloqueado, texturas y cierre

- **Problema:** al abrir el libro (tecla B) se bloquea el mouse, no se ven
  texturas de los ítems y **no se puede cerrar**.
- Revisar el flujo de apertura/cierre (pointer lock sobre el canvas vs el
  libro — patrón de F11), el render de iconos (reusar `itemVisual`) y el
  toggle de cierre con B/Esc.
- **Ficheros:** `public/ui.js` (libro de recetas), `public/input.js`
  (toggle B + pointer lock), `public/itemicons.js`.
- **Criterio:** se abre con B, se cierra con B o Esc, el mouse queda
  liberado, las recetas muestran sus ítems. Test E2E de apertura/cierre +
  manual en navegador.

### B6 — Opción de calidad gráfica con efecto real

- **Problema:** cambiar "calidad gráfica" no produce cambios visibles.
- Inventariar qué ajustes existen (F7) y qué hace el cliente con ellos;
  implementar al menos una diferencia observable por nivel (p. ej.
  resolución del renderer / `pixelRatio`, LOD más agresivo, distancia de
  render/nubes) de forma que el ajuste se aplique en caliente.
- **Ficheros:** `public/settings.js`, `public/renderer.js`/`scene.js`,
  `public/index.html` (menú de ajustes), `public/lod.js`.
- **Criterio:** cambiar el nivel de calidad modifica un parámetro medible
  (F3: `pixelRatio`, LOD) y se nota en la práctica; verificación manual.

---

## 4. Bloque C — Estabilidad y E2E en verde (causa raíz de la auditoría)

### C1 — Guardado asíncrono (REN-1/SV-4)

- Mover el guardado periódico fuera del event loop: cola con
  `setImmediate`/worker por lotes de chunks sucios, sin cambiar el formato
  del disco ni `SCHEMA_VERSION`.
- `server/save.js` (`saveWorld`), `server/world.js` (`atomicWrite`),
  `server/server.js` (`setInterval`). Mantener atomicidad (tmp+rename) y el
  `.bak`.
- **Criterio:** con 100+ chunks sucios el tick no se congela
  (`__mcServerTickMs` medido sin picos); los E2E pasan en solitario
  (`PORT=3998 node server.js` + `WS_URL=... run.js --e2e`).

### C2 — Validación de coordenadas en todos los handlers (SV-3/SEC-3)

- Guardia `Number.isFinite(x/y/z)` (y `typeof === "number"`) al inicio de
  `block_action`, `till`, `plant`, `bonemeal`, `bucket_use`, `door_use`,
  `furnace_open`, `chest_open` (`server/net.js`).
- Rechazar mensajes con coords inválidas sin consumir recursos del
  inventario (cuidado: hoy `place` consume el ítem aunque la colocación
  falle).
- **Criterio:** unit de red con coords `NaN`/`"foo"`/`null` → handler
  rechaza sin mutar estado ni disco (no aparecen chunks `"NaN,NaN"`).

### C3 — Cerrar el bypass del anti-cheat de vuelo/speedhack (SEC-1)

- Evaluar el anti-cheat de ascenso también con `dy <= 0` mientras `inAir`
  (ventana temporal `airTimeMs`), y añadir límite de velocidad horizontal
  por ventana deslizante (~5 bloques/s walking, no 36/s sostenidos).
- **Ficheros:** `server/net.js` (move/anti-cheat), `server/players.js` si
  procede.
- **Criterio:** unit de anti-cheat: altitud constante en el aire y burst de
  moves a 30/s se corrigen (teleport) como en MC; el jugador legítimo
  (sprint + salto) NO se ve afectado.

### C4 — `set_seed`: cooldown + no marcar chunks recién generados (SEC-2)

- Añadir cooldown/cuota por jugador (p. ej. 1 cambio / 10 s) en
  `set_seed` (`server/net.js`), y que `generateChunk` no marque dirty los
  chunks de generación salvo modificación real (`server/world.js:1334`).
- **Criterio:** bucle de `set_seed` a ritmo máximo no llena disco ni
  congela el loop (medido); test de cooldown en unit-red.

### C5 — Limpiar hornos huérfanos (REN-2)

- `furnaces.delete(key)` al romper el horno (y al expirar), acotar el bucle
  O(H×J) de `net.js:1723-1736` (solo notificar a los jugadores que lo tengan
  abierto, sin recorrer todos por horno).
- **Ficheros:** `server/net.js`, `server/crafting.js` (`tickFurnaces`),
  `server/save.js` (persistencia).
- **Criterio:** romper un horno lo elimina de `world.json` (unit de
  persistencia) y deja de recibir `furnace_state`; test de regresión.

### C6 — Menores de la auditoría

- **SV-2** (`players.js:270-286`): `removeFromInventory` debe seguir
  buscando stacks posteriores si el primero no cubre la cantidad.
- **SV-5** (`commands.js`/`players.js`): `/give` con tope de stack 64.
- **SV-6** (`commands.js:226-237`): `/tp` clamp contra `worldHalfExtent`.
- **CL-3** (`public/network.js:82-83`): `JSON.parse` con try/catch +
  `default` en el switch (recupera eventos desconocidos con log).
- **REN-3** (`net.js:567-602`): reenvío de radio fragmentado por lotes (no
  un `chunks_add` gigante) al ampliar `renderDistance`.
- **Criterio:** cada uno con su unit de regresión (`unit-red.js`,
  `unit-inventario`, `unit-ui`) en verde; E2E completo sin timeouts.

---

## 5. Bloque D — Paridad con Minecraft

### D1 — Horno: consumir combustible y tabla `FUEL_TICKS` por ítem (PAR-1 + SV-1)

- `server/crafting.js:205-208`: al recargar `fuelTicksLeft` hay que
  consumir el ítem de combustible real (decrementar/dejar `null`) — hoy
  arde para siempre.
- `server/constants.js:442-450`: tabla `FUEL_TICKS` (carbón 1600, palo 100,
  tablas/tronco 300) en vez del genérico 400. Sincronizar con
  `public/constants.js` si expone la barra.
- **Ficheros:** `server/crafting.js`, `server/net.js` (`add_fuel`),
  `server/constants.js` + `public/constants.js` (ambos, regla `unit-sync`).
- **Criterio:** unit de horno: cada combustible quema los ticks oficiales
  y se consume; el horno se apaga sin combustible; receta de fundido
  (200 t) funde 8 ítems con carbón. Sin cambios de schema.

### D2 — Drops de zombi/creeper: carne podrida y pólvora (PAR-2)

- Ítems nuevos `I.ROTTEN_FLESH` y `I.GUNPOWDER` en ambos `constants.js`
  (B/I sincronizados, `unit-sync`).
- `server/mobs.js` `mobDrops`: zombi 0-2 carne podrida; creeper 0-2
  pólvora. Receta de TNT con pólvora (si TNT no la tiene ya) en
  `recetas.json`.
- **Criterio:** unit de drops (zombi/creeper devuelven sus ítems); receta
  de TNT válida (`unit-recetas`); `unit-sync` en verde.

### D3 — Puertas: resultado ×3 (PAR-3)

- `recetas.json:813-840`: 6 tablas → 3 puertas (madera/hierro), como MC.
- **Criterio:** `unit-lagunas.js`/`unit-recetas.js` verifica `count: 3`.

### D4 — Vidrio: fundido a 200 ticks (PAR-4)

- `recetas_horno.json:5`: arena→vidrio de 150 a 200 t (10 s).
- **Criterio:** `unit-recetas.js` verifica el tiempo de fundido.

### D5 — Carbón vegetal (PAR-5)

- Receta de horno tronco → carbón (1 tronco → 1 carbón vegetal, ítem
  existente) en `recetas_horno.json`.
- **Criterio:** `unit-recetas.js` cubre la receta nueva (cobertura, no solo
  integridad — E2).

### D6 — XP de slime mediano y lobo (PAR-7/8)

- `server/constants.js:881`: slime mediano 1→2. `:873`: lobo 8→1-3
  (aleatorio como MC).
- **Ficheros:** `server/constants.js` (y `server/mobs.js` si el XP lo
  calcula ahí).
- **Criterio:** `unit-paridad.js` actualizado con los nuevos valores.

---

## 6. Bloque E — Mejoras menores del usuario

### E1 — Pantalla completa

- Opción en ajustes y/o tecla F11 que alterna pantalla completa
  (Fullscreen API), con fallback si el navegador lo rechaza.
- **Ficheros:** `public/settings.js`, `public/input.js`, `public/index.html`.
- **Criterio:** toggle de pantalla completa funciona y persiste la
  preferencia; verificación manual.

### E2 — Extender `unit-recetas.js` a cobertura total + tests de F16

- `unit-recetas.js` pasa de validar integridad a verificar **cobertura**:
  todo ítem obtenible de `I` (servidor) tiene receta de crafteo o de horno
  (salvo drops/compra justificados); añadir los tests de los bloques B/C/D.
- **Ficheros:** `tests/unit-recetas.js`, `tests/run.js` (registro),
  `recetas.json`/`recetas_horno.json` si el test destapa huecos.
- **Criterio:** cobertura documentada en el test; suite 50+ en verde.

---

## 7. Cierre y auditoría de la Fase 16 (tarea obligatoria)

1. Suite unitaria completa en verde (`node tests/run.js --unit`) tras cada
   commit; **E2E 6/6 en solitario** (`PORT=3998 node server.js` +
   `WS_URL=ws://localhost:3998 node tests/run.js --e2e`) — criterio
   explícito del usuario.
2. `node --check` sobre los `.js` tocados y `biome check` 0 errores.
3. Auditorías por fase sin regresiones (`node tests/run.js --audit`,
   incluido `audit-altura` 72/72) y `audit-fase7` CDP si hay cambios de
   render.
4. Verificación manual en navegador (F3/inspección): B1-B6 (niebla, cofres,
   IA, texturas/tooltip, libro de recetas, calidad) y E1 (pantalla
   completa); confirmar cada bug de `Notas del usuario.md` tocado.
5. Actualizar `TODO.md` (F15 D5 `[x]`, Fase 16 cerrada), `docs/README.md`
   (índice) y `AGENTS.md` (estado de fases).
6. `SCHEMA_VERSION` sin cambios salvo que A/B/D lo exijan (mínimo toque).

---

## 8. Criterios de aceptación (resumen)

1. **Bloque A:** WIP del D5 commiteado, HEAD limpio, suite verde.
2. **Bloque B:** los 6 bugs del usuario corregidos, cada uno con test de
   regresión y verificación manual en navegador.
3. **Bloque C:** E2E completos en verde en solitario (sin timeouts);
   guardado asíncrono sin picos de tick; coords/anti-cheat/`set_seed`/
   hornos cerrados con sus unit.
4. **Bloque D:** horno consume combustible real con `FUEL_TICKS` oficiales;
   drops zombi/creeper con ítems nuevos; puertas ×3, vidrio 200 t, carbón
   vegetal y XP slime/lobo con tests de paridad actualizados.
5. **Bloque E:** pantalla completa funcional; `unit-recetas.js` con
   cobertura.
6. Auditoría final completa en verde y documentación actualizada.
