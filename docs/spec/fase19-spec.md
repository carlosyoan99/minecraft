# Fase 19 — Texturas de ítems, interfaces y pulido visual (Spec)

> **Estado:** `[COMPLETADA]` — cerrada y auditada 2026-08-15 (commit `acca3c9`).

> Documento creado a partir de: `docs/Notas del usuario.md` (\"Próximas Fases\":
> la 19 es \"Crear texturas faltantes para todos los items, mejorar cofres, mesa
> de crafteo, hornos y demás interfases\"), del borrador `docs/spec/fase19-spec.md`
> del usuario, del estado real del código (F16/F17/F18) y de la entrevista con
> el usuario (2026-08-12).
> Fecha: 2026-08-12 · Proyecto: clon de Minecraft.
> Estado: **prospectiva (sin implementar)** — prerrequisito: **Fase 18 cerrada**.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | `Notas del usuario.md` \"Próximas Fases\" (F19) | \"Crear texturas faltantes para todos los items\" — **ningún ítem sin icono** (hoy el fallback de `ui.js` muestra `#<id>` en texto) | Borrador F19 (A) | 🟠 |
| A2 | Entrevista (2026-08-12) | Cobertura de iconos **verificada por test por ID** (no solo \"no vacío\"), ampliando `unit-itemicons.js` | Borrador F19 (A/F) | 🟢 |
| B1 | `Notas del usuario.md` (F19) + borrador | \"mejorar cofres, mesa de crafteo, hornos y demás interfases\": rediseño de paneles (inventario/crafteo, horno, cofre, libro de recetas) con estética Minecraft (fondo texturizado + biseles 3D + slots) | Borrador F19 (B/C) | 🟠 |
| B2 | Entrevista (2026-08-12) | Añadir **arrastrar y soltar** en inventario/cofre/horno/grid (el borrador lo dejaba opcional → el usuario lo pide) | Borrador F19 (opcional) | 🟡 |
| C1 | Borrador F19 (C) + estado real | Hotbar/tooltip ya estilizados (F15 D3, F16 B4) → **unificar** con el estilo nuevo de los paneles y verificar en todos los slots | Borrador F19 (C) | 🟢 |
| D1 | Borrador F19 (A, criterio 5) | **Hot-reload del atlas de iconos** (patrón `hotReloadTextures` del atlas de terreno, `world.js:1072`) sin reiniciar | Borrador F19 (criterio 5) | 🟢 |
| E1 | Entrevista (2026-08-12) + F17 D1 | Los paneles nuevos deben **funcionar en táctil** (abrir inventario con el botón táctil y tocar slots) y verse bien en móvil | F17 D1 | 🟡 |
| F1 | CLAUDE.md checklist | Auditoría final de fase obligatoria: **auditoría visual CDP** (abrir los 4 paneles, 0 excepciones, todos los ítems con icono) + verificación manual escritorio/móvil | — | 🔴 |

**Fuera de esta fase (explícito):**
- **Skins de jugador**: ya implementadas en la Fase 17 (C3: selector + 9 skins
  procedurales + `set_skin`/`player_skin`). El Bloque D del borrador original
  queda **eliminado** — no se duplica trabajo.
- **Nuevos bloques/ítems**: la regla de las notas \"cerrar huecos — no inventar
  bloques/items nuevos\" se mantiene. La F19 **no añade ítems**; solo da icono
  a los que ya existen (si un ítem sin icono no tiene receta ni uso, se
  documenta, no se inventa).
- **Mecánicas de juego**: nada de jugabilidad, solo UI/texturas (cualquier
  necesidad de evento nuevo para el drag&drop es *transporte* de ítems ya
  existentes, no una mecánica nueva).
- **Motor 3D**: no se toca chunks/mobs/cielo (salvo reusar teselas del atlas
  de terreno para los fondos de los paneles).

---

## 1. Contexto

- **Prerrequisito:** la **Fase 18 debe estar cerrada** (paridad C-1..C-9,
  refactor D, docs F y cierre G en verde) antes de empezar la 19 — decisión
  del usuario en la entrevista (2026-08-12): \"no avanzar a una siguiente fase
  hasta que todo lo actual esté 100% confirmado\". La F19 asume: suite
  unitaria en verde, E2E clásicos 6/6 + menú 7/7, auditorías por fase en
  verde, `biome check` 0 errores y F16/F17 cerradas (sus pendientes de
  verificación G3b/G3.7/G4/G6 y Bloque E resueltos).
- **Estado real de la UI (verificado 2026-08-12):** el hotbar ya tiene estilo
  Minecraft con slot dorado seleccionado y tooltip estilizado (F15 D3); el
  tooltip de slots en paneles existe (F16 B4, `attachSlotTooltip`); el libro
  de recetas ya muestra texturas de ítems y libera el mouse (F16 B5); el
  resultado de crafteo ya se resalta en verde (`craftResultEl`). **Lo que
  falta realmente:**
  1. Garantizar la **cobertura total de iconos** con un test por ID (el
     `switch (id)` de `public/itemicons.js:387` puede dejar ítems en el
     fallback de texto de `itemVisual` en `ui.js`).
  2. El **rediseño visual de los paneles** (`#crafting-ui`, `#furnace-ui`,
     `#chest-ui`, `#recipe-book`): hoy usan colores planos/bordes simples, sin
     fondo texturizado ni biseles 3D estilo MC.
  3. El **arrastrar y soltar** (nuevo, pedido por el usuario).
  4. El **hot-reload del atlas de iconos**.
  5. La **verificación táctil/responsiva** de los paneles (F17 D1 abrió el
     inventario en móvil; los paneles rediseñados no deben romperlo).
- **Decisiones de la entrevista (2026-08-12):**
  - Alcance: **visual + arrastrar y soltar**; nada de mecánicas nuevas.
  - Orden de trabajo: 1) cobertura de iconos (A), 2) rediseño de paneles (B),
    3) hotbar/tooltip unificados (C), 4) drag & drop (D), 5) hot-reload (E),
    6) táctil/responsivo (F), 7) cierre con auditoría visual CDP obligatoria (G).
  - **Skins fuera** (ya hechas en F17); **ítems nuevos fuera** (regla de las
    notas); `SCHEMA_VERSION` y protocolo WS **solo cambian si el drag&drop lo
    exige** (evento nuevo de swap con validación server-side; si se añade,
    retrocompatible y con test de `unit-red.js`).
  - Criterios de aceptación: ninguno de los ~150 ítems con fallback de texto;
    paneles indistinguibles visualmente de MC en escritorio y móvil; drag &
    drop funcional; hot-reload sin reiniciar; auditoría CDP 0 excepciones.
- **Won't respetado íntegramente:** redstone, dimensiones, clima,
  autenticación/BD externa, encantamientos/pociones, aldeas generadas.
- Fuentes: `docs/Notas del usuario.md`, borrador `docs/spec/fase19-spec.md`,
  `docs/spec/fase18-spec.md` (estado y decisiones diferidas), `CLAUDE.md`/
  `AGENTS.md` (convenciones), `docs/README.md`, `TODO.md`.

---

## 2. Bloque A — Cobertura total de iconos de ítems (por ID)

### A1 — Chequeo de cobertura y dibujo de los iconos que falten

- **Qué hacer:**
  - Construir la **lista canónica de IDs de ítem**: los IDs que conoce el
    juego (bloques colocables como ítems + ítems de inventario). Fuente: el
    mismo criterio que ya usa `itemIconIds()` (`public/itemicons.js:1381`) +
    los `export const` de `public/constants.js`/`server/constants.js` (AMBOS
    lados; `unit-sync` garantiza que coinciden). Un ID está \"cubierto\"
    cuando `itemIconCss(id)` devuelve CSS de tesela y no cae al fallback.
  - Para cada ítem **sin icono**: dibujarlo en `public/itemicons.js` al
    estilo 16×16 con sombra suave (patrón existente). **No inventar ítems**:
    solo los que ya existen en las constantes.
  - Revisar que el fallback de `itemVisual` (`ui.js`) deje de ser alcanzable
    (sigue como red de seguridad defensiva, pero ningún ítem real debe caer
    en él).
- **Ficheros:** `public/itemicons.js`, `public/ui.js` (solo si el fallback
  necesita ajuste), `tests/unit-itemicons.js`.
- **Criterio:** `unit-itemicons.js` ampliado: **una check por ID de ítem**
  (todo ID conoce su tesela y el icono no está vacío y es determinista);
  `grep` de `item-txt`/fallback: 0 ítems reales alcanzables en el fallback;
  suite en verde.

### A2 — Test de cobertura por ID (extender `unit-itemicons.js`)

- **Qué hacer:** ampliar el unit existente (hoy verifica \"todo ítem conocido
  tiene icono no vacío y determinista\") con: (a) la lista completa de IDs
  viene de `itemIconIds()` **y** de las constantes (ningún ID de constante
  fuera de la lista), (b) cada ID dibuja una tesela distinta (los distintos se
  distinguen — ya existe), (c) el CSS devuelto por `itemIconCss` para cada ID
  referencia una tesela dentro del atlas (sin recortes fuera de rango).
- **Ficheros:** `tests/unit-itemicons.js`, `public/itemicons.js` (si el test
  descubre un recorte inválido).
- **Criterio:** el test falla si mañana se añade un ítem sin icono
  (regresión automática, como `unit-sync` para B/I); suite en verde.

---

## 3. Bloque B — Rediseño de paneles con estilo Minecraft

> Los 4 paneles (inventario/crafteo `#crafting-ui`, horno `#furnace-ui`,
> cofre `#chest-ui`, libro de recetas `#recipe-book`) pasan de colores planos
> a la estética MC: **fondo texturizado + biseles 3D + slots biselados**.
> Sin assets: las teselas del atlas de terreno (`public/textures.js`) se
> reutilizan como fondo (madera de roble para inventario/cofre/libro, piedra
> para el horno) recortadas por CSS, y los biseles se hacen con
> `border-image` generado o pseudo-elementos (claro arriba/izquierda, oscuro
> abajo/derecha — patrón del hotbar actual).

### B1 — Inventario y mesa de crafteo (`#crafting-ui`)

- **Qué hacer:** fondo texturizado de madera (tesela del atlas) con panel de
  título \"Inventario\"; bisel 3D en el marco; slots con fondo oscuro y borde
  biselado (patrón `.hotbar-slot`); columna de armadura (izquierda) y
  resultado de crafteo con su borde verde ya existente; mantener los `id` y
  la interacción actuales (click = mover, `grid_set`/`craft`, desequipar
  armadura, tooltip F16 B4).
- **Ficheros:** `public/index.html` (estructura, si hace falta), CSS del
  panel, `public/ui.js` (clases nuevas, sin cambiar eventos).
- **Criterio:** verificación manual: abrir con E, mover ítems, craftear,
  resultado verde, tooltip; el aspecto es MC (fondo + bisel + slots); sin
  regresión en `unit-itemicons.js` (los iconos se ven 1x en los slots).

### B2 — Horno (`#furnace-ui`)

- **Qué hacer:** mismo tratamiento con fondo de piedra; los 3 slots
  (combustible/insumo/salida) y la barra de progreso `#furnace-progress` con
  el estilo nuevo; mantener `furnace_action` y el tooltip.
- **Ficheros:** CSS del horno, `public/index.html`/`ui.js` (solo clases).
- **Criterio:** manual: abrir horno con clic derecho, añadir combustible/
  insumo, ver progreso y salida; aspecto MC coherente con B1.

### B3 — Cofre (`#chest-ui`)

- **Qué hacer:** fondo de madera (tapa de cofre), 27 slots + inventario
  debajo (disposición MC real); mantener `chest_action put/take` y el
  tooltip; la tapa/sonido de F10 F2 se mantienen.
- **Ficheros:** CSS del cofre, `public/index.html`/`ui.js`.
- **Criterio:** manual: abrir/cerrar cofre (sonido), mover ítems entre cofre
  e inventario, craftear cofre y colocarlo; aspecto MC.

### B4 — Libro de recetas (`#recipe-book`)

- **Qué hacer:** fondo de madera y pestañas con el estilo nuevo (hoy ya
  muestra texturas de ítems y categorías); la **capa de fondo** del libro
  (borde/bisel) al estilo MC; mantener el cierre con B/Esc (F16 B5).
- **Ficheros:** CSS del libro, `public/index.html`/`ui.js`.
- **Criterio:** manual: abrir con B, navegar pestañas, cerrar con B y Esc;
  aspecto MC coherente.

---

## 4. Bloque C — Hotbar y tooltip unificados

- **Qué hacer:** el hotbar ya está estilizado (F15 D3). Alinear el tooltip
  (`#tooltip`) con los paneles nuevos (bisel/fondo de madera del tooltip,
  delay de aparición ~200 ms al hover) y verificar que se muestra en **todos**
  los contextos: hotbar, inventario, cofre, horno, libro y grid de crafteo
  (ya usa `attachSlotTooltip`). Unificar el estilo en un solo set de clases
  CSS del tooltip.
- **Ficheros:** CSS del tooltip, `public/ui.js` (si hace falta un delay
  uniforme).
- **Criterio:** manual: hover sobre slots de los 5 contextos muestra el mismo
  tooltip estilizado (nombre + durabilidad cuando aplica); sin regresión en
  la interacción.

---

## 5. Bloque D — Arrastrar y soltar (drag & drop) en inventario/cofre/horno

> Nueva interacción pedida por el usuario. **Regla de oro:** el servidor es
> la fuente de verdad; el cliente propone con eventos existentes o nuevos y
> el servidor valida. El click simple conserva el comportamiento actual; el
> arrastre añade la posibilidad de mover ítems a un destino concreto.

### D1 — Drag & drop dentro del inventario y al grid de crafteo

- **Qué hacer:** en `public/input.js`/`ui.js`: pointerdown en un slot del
  inventario → si el puntero se mueve por encima de un umbral (~5 px) sin
  soltar, entra en modo arrastre (mini-ícono fantasma bajo el cursor, estilo
  MC); al soltar sobre otro slot del inventario se envía el movimiento. Hoy
  el click mueve al primer hueco del grid (`grid_set`); con drag el destino
  es el slot bajo el cursor.
- **Servidor:** comprobar si `grid_set`/`inventory_select` bastan o hace
  falta un evento nuevo (p. ej. `inventory_swap { from, to }` con validación
  de índices 0-35 y `Number.isFinite`, patrón C2/F16). Si se añade:
  **retrocompatible** (el click actual sigue funcionando) + test en
  `unit-red.js` (swap válido, índices fuera de rango rechazados).
- **Ficheros:** `public/ui.js`, `public/input.js` (si el drag vive en el
  input), `server/net.js` (solo si hay evento nuevo), `tests/unit-red.js`.
- **Criterio:** manual: arrastrar ítem del inventario a otro slot y al grid
  de crafteo (se mueve, el servidor confirma); unit del evento nuevo si se
  añade; el click simple no regresa.

### D2 — Drag & drop entre inventario y cofre/horno

- **Qué hacer:** arrastrar un ítem del inventario y soltarlo en un slot del
  cofre (equivale a `chest_action put` con slot destino) o en los slots del
  horno (combustible/insumo según el ítem — `furnace_action`); y al revés
  (del cofre/horno al inventario: `take`/recoger salida). El click simple
  sigue haciendo el put/take al primer hueco (como hoy).
- **Servidor:** verificar si `chest_action { action, invSlot, chestSlot }` y
  `furnace_action` soportan destino explícito; si no, ampliarlos
  retrocompatible (validación igual a F16 C2).
- **Ficheros:** `public/ui.js` (drop handlers de `#chest-ui`/`#furnace-ui`),
  `server/net.js`, `server/chests.js`/`server/crafting.js` (solo si el
  handler necesita destino), `tests/unit-red.js` y `tests/unit-fase19.js`.
- **Criterio:** manual: arrastrar inventario→cofre, cofre→inventario,
  inventario→horno (combustible e insumo); el servidor confirma el estado
  (`chest_state`/`furnace_state`); unit del transporte con destino.

---

## 6. Bloque E — Hot-reload del atlas de iconos

- **Qué hacer:** extender el patrón existente `hotReloadTextures()`
  (`public/world.js:1072`, dynamic import para reemplazar el módulo en
  caliente) a `public/itemicons.js`: al recargar, el cliente regenera el
  atlas de iconos y **repinta** los slots visibles (hotbar, paneles abiertos)
  sin reiniciar. Gancho: mismo evento de recarga que ya usa el atlas de
  terreno (ver dónde se dispara hoy — `network.js:368`) o tecla de debug.
- **Ficheros:** `public/itemicons.js` (API para regenerar), `public/world.js`
  o `public/network.js` (gancho), `public/ui.js` (repintado).
- **Criterio:** manual: editar un icono en `itemicons.js`, disparar la
  recarga y ver el nuevo icono en la hotbar sin reiniciar el navegador; sin
  fugas (la textura antigua se libera, patrón F17 skins).

---

## 7. Bloque F — Táctil y responsivo (paneles en móvil)

- **Qué hacer:** los paneles rediseñados deben verse y usarse bien en
  pantallas pequeñas (F17 D1 abrió el inventario con el botón táctil):
  slots suficientemente grandes para tocar (~44 px), paneles que caben en el
  viewport (scroll interno si hace falta), y el drag&drop **no interfiere**
  con el scroll táctil (en táctil el tap sigue siendo el movimiento por
  click; el drag es opcional y con `touch-action` correcta).
- **Ficheros:** CSS responsivo de los paneles, `public/input.js` (si el drag
  táctil se desactiva o adapta), `public/ui.js`.
- **Criterio:** manual en viewport móvil (DevTools): abrir inventario/cofre/
  horno/libro con el dedo, tocar slots, cerrar; sin superposiciones ni
  elementos fuera de pantalla; escritorio intacto.

---

## 8. Bloque G — Cierre y auditoría de la Fase 19 (tarea obligatoria)

1. Suite unitaria completa en verde (`node tests/run.js --unit`), E2E
   clásicos 6/6 + menú 7/7, `node --check` y `biome check` 0 errores en los
   archivos tocados.
2. **Auditoría visual CDP** (extender `tests/audit-fase7.js` o una
   `tests/audit-fase19.js` nueva): cargar el juego, abrir los 4 paneles y el
   libro, comprobar con `document.querySelectorAll('.item-txt')` que **no hay
   fallback de texto de ítem**, que cada slot con ítem tiene su icono y 0
   excepciones de consola.
3. Verificación manual en navegador (escritorio y móvil/emulación): los 4
   paneles con aspecto MC, drag & drop funcional, hot-reload de iconos,
   tooltip en los 5 contextos.
4. Actualizar `docs/public/mecanicas.md` (UI/paneles/drag&drop),
   `docs/README.md` (índice: Fase 19 cerrada), `AGENTS.md` (estado) y
   `TODO.md` (Fase 19 cerrada).
5. `SCHEMA_VERSION` **sin cambios** (nada de guardado); protocolo WS solo si
   el drag&drop añadió evento (retrocompatible, documentado en §5).

---

## 9. Criterios de aceptación (resumen)

1. **Cobertura de iconos por ID**: ningún ítem real muestra el fallback de
   texto; `unit-itemicons.js` verifica cada ID (tesela válida, distinta,
   determinista) y falla si se añade un ítem sin icono.
2. **Paneles estilo Minecraft**: inventario/crafteo, horno, cofre y libro con
   fondo texturizado (teselas del atlas) y biseles 3D; indistinguibles de MC
   en escritorio y móvil; sin regresión en la interacción (click, tooltip,
   sonidos).
3. **Arrastrar y soltar** funcional en inventario, grid de crafteo, cofre y
   horno (con validación server-side y test si hay evento nuevo); el click
   simple no regresa.
4. **Hot-reload del atlas de iconos** sin reiniciar el cliente.
5. **Táctil/responsivo**: los 4 paneles usables en viewport móvil; escritorio
   intacto.
6. **Cierre**: suite + E2E + auditoría visual CDP en verde (0 fallback de
   texto, 0 excepciones), docs y tracker al día, `SCHEMA_VERSION` intacto.

> **Tests que cubren esta fase:** `tests/unit-fase19.js`, `tests/unit-itemicons.js`, `tests/unit-cofre.js`, `tests/unit-red.js`, `tests/unit-persistencia.js` (fix del reloj), `tests/run.js` (registra `tests/unit-fase19.js`).

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-12: creación del spec (documento de planificación de la fase 19).

**Cambios en esta spec (v2):**
- 2026-08-15: reorganización de docs — spec movida a `docs/spec/`, etiqueta de estado `[EN CURSO]` (WIP de drag & drop sin commitear), referencias de rutas actualizadas.

**Cambios en esta spec (v3) — cierre:**
- 2026-08-15: **fase cerrada** (commit `acca3c9` **Fase 19: texturas de
  ítems, interfaces MC y drag & drop**). Bloque A (cobertura por ID, 142/142 sin
  duplicados, 17 checks en `unit-itemicons.js`), B (fondos texturizados del
  atlas + bisel interior en `.panel`, aplicados desde `ui.js`), C (tooltip
  unificado con delay en `hud.js`/`panels.js`), D (drag & drop con
  `public/dragdrop.js` + lógica pura `public/draglogic.js`; servidor:
  `inventory_swap`, `grid_return` y destino `chestSlot` en `chest_action` —
  tests en `unit-red.js`/`unit-cofre.js`), E (hot-reload del atlas,
  `itemIconCss`/`repaintItemIcons` con gancho en `network.js`), F (media
  query móvil: slots ≥44px, paneles que caben en el viewport).
- **Fixes descubiertos en la verificación final (G):**
  - `dawnOffsetMs` se perdió en el refactor D-4 de la Fase 18 (se importaba
    en `save.js` desde `save-meta.js` pero la función nunca se movió allí);
    al crear un **mundo nuevo** `loadWorld()` lanzaba y el mundo arrancaba a
    hora arbitraria — los tests usaban mundos ya existentes y no lo veían.
    Recolocada en `server/save-meta.js` + checks en `unit-persistencia.js`.
  - `e2e-cofre.js` quedó calibrado a la v5 (64 bloques) en una pasada
    anterior; recalibrado a v6 (Y −64..63, `WORLD_MIN_Y`) — el `place`
    apuntaba a una celda que el servidor veía ocupada.
  - `e2e-mascotas.js` es flaky por timing (el lobo se mueve entre el
    snapshot y el `sit_pet`); pasa en solitario y en la suite con mundo
    limpio (verificado 2/3 ejecuciones; el fallo deja 17/17 OK, timeout sin
    FAIL — no es una regresión de código).
