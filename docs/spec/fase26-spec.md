# Fase 26 — Encantamientos (Spec)

> Documento creado a partir de: `docs/spec/fase26-spec.md` (borrador
> original), entrevista con el usuario (2026-08-20) y revisión del
> código actual.
> Fecha: 2026-08-20 · Proyecto: clon de Minecraft.
> Estado: **EN CURSO** (segunda fase del orden post-F25).
> Prerrequisito: Fase 25 (End) cerrada.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A | Borrador F26 | Mesa de encantamientos + UI | `[ ]` | — |
| B | Borrador F26 | Catálogo de encantamientos (recortado) | `[ ]` | — |
| C | Borrador F26 | Libros encantados y yunque | `[ ]` | — |
| D | Borrador F26 | Persistencia de encantamientos en ItemStack | `[ ]` | — |
| E | Entrevista 2026-08-20 | Catálogo mínimo: Filo I-III, Protección I-IV, Eficiencia I-V, Fortuna I-III, Durabilidad I-III | — | Decisión |
| F | Entrevista 2026-08-20 | Branch por fase (`fase26-enchants`) | — | Flujo |

## 1. Contexto

- Es el sistema de progresión de endgame más importante: justifica
  seguir jugando después de tener equipo completo.
- **Toca tres sistemas existentes:** inventario (campo `enchantments`
  en ItemStack), combate (encantamientos modifican daño/reducción), e
  UI (mesa de encantamientos + yunque).
- La mesa de encantamientos **consume XP** del mismo contador que ya
  existe desde Fase 13 (curva oficial de MC) — no se crea un sistema
  de experiencia paralelo.
- El catálogo es **mínimo por decisión del usuario**: 5 encantamientos
  que cubren las 4 categorías principales (arma, armadura, herramienta,
  utilidad).
- Reutilizar `ItemStack` (POO Fase 13): el campo `enchantments` es un
  array de `{ id, level }` en el objeto de la clase, retrocompatible
  (sin campo = sin encantar).

## 2. Bloque A — Mesa de encantamientos

**Qué hacer exactamente:**

- **Bloque `ENCHANTING_TABLE`** (nuevo B): crafteable con obsidiana × 2
  + libro × 1 + diamante × 2 (como MC real, simplificado).
- **UI:** al interactuar (clic derecho), muestra 3 opciones de
  encantamiento. Cada opción muestra: nombre del encantamiento, nivel,
  costo en XP y costo en lapislázuli.
- **Selección de encantamientos:** el servidor genera 3 opciones
  aleatorias del catálogo filtrando por el XP disponible del jugador.
  El jugador elige una (o ninguna) y paga XP + lapislázuli.
- **Sin estanterías** (recorte deliberado): el nivel máximo ofrecido es
  fijo (nivel 30), no depende de bloques adyacentes. Esto simplifica
  la generación del entorno y la UI.
- **Lapislázuli:** nuevo ítem `LAPIS_LAZULI` (nuevo B/I). Se obtiene
  minando el bloque `LAPIS_ORE` (nuevo B, generación subterránea en
  bandas similar a otros minerales).

**Ficheros implicados:**
- `server/constants.js` — `B.ENCHANTING_TABLE`, `I.LAPIS_LAZULI`,
  `B.LAPIS_ORE` + `BLOCK_HARDNESS`, `BLOCK_CATEGORY`, `ORE_TIER`
- `server/net.js` — handler `enchanting_open` + `enchanting_action`
- `server/actions.js` — lógica de encantamiento (generar opciones,
  validar XP/lapis, aplicar encantamiento)
- `server/crafting.js` — receta de la mesa
- `public/constants.js` — sync B/I
- `public/textures.js` — textura de la mesa + mena de lapis
- `public/texturemap.js` — BLOCK_TEX para nuevos bloques
- `public/panels.js` — UI de la mesa de encantamientos
- `public/network.js` — handler `enchanting_state`
- `public/game-input.js` — clic derecho con mesa abre UI
- `recetas.json` — receta de la mesa

**Criterio de éxito:**
- Test: craftear mesa, abrirla, ver 3 opciones, encantar un ítem
  pagando XP y lapislázuli, ítem tiene encantamiento.

## 3. Bloque B — Catálogo de encantamientos (mínimo, 5)

**Qué hacer exactamente:**

Definir 5 encantamientos con su efecto medible:

| Encantamiento | Objetos | Niveles | Efecto |
|---------------|---------|---------|--------|
| **Filo** (Sharpness) | Espadas, hachas | I-III | +1/+2/+3 daño base |
| **Protección** (Protection) | Armadura (4 piezas) | I-IV | Reduce daño 4%/8%/12%/16% por pieza (apilable) |
| **Eficiencia** (Efficiency) | Herramientas | I-V | +30%/60%/90%/120%/150% velocidad de minado |
| **Fortuna** (Fortune) | Herramientas | I-III | ×1.3/1.6/2.0 probabilidad de drop extra |
| **Durabilidad** (Unbreaking) | Todo equipamiento | I-III | 50%/67%/75% probabilidad de NO desgastar |

**Cada encantamiento:**
- Tiene un `id` numérico (0-4) y un nombre localizado.
- Se aplica al confirmar en la mesa (consumiendo XP + lapis).
- Se almacena en el `ItemStack` como `{ enchantments: [{ id, level }] }`.
- Se verifica en los puntos de cálculo correspondientes:
  - **Filo:** `combat.js` → `damagePlayer` (añadir al daño del ataque)
  - **Protección:** `combat.js` → `damagePlayer` (multiplicador sobre
    la reducción de armadura)
  - **Eficiencia:** `players.js` → `finishMining` (multiplicador de
    velocidad de rotura)
  - **Fortuna:** `players.js` → `finishMining` (multiplicar drops)
  - **Durabilidad:** `combat.js` → `applyToolWear` (probabilidad de
    no desgastar)

**Ficheros implicados:**
- `server/constants.js` — `ENCHANTMENTS` array con definiciones
- `server/combat.js` — aplicar Filo y Protección en cálculo de daño
- `server/players.js` — aplicar Eficiencia, Fortuna y Durabilidad
- `public/constants.js` — sync de IDs de encantamientos
- `public/hud.js` — tooltip con encantamientos en el inventario

**Criterio de éxito:**
- Test por cada encantamiento: Filo → +daño medido; Protección →
  -daño recibido medido; Eficiencia → minado más rápido; Fortuna →
  más drops; Durabilidad → menos desgaste.

## 4. Bloque C — Libros encantados y yunque

**Qué hacer exactamente:**

- **Ítem `ENCHANTED_BOOK`** (nuevo B/I): resultado alternativo de la
  mesa de encantamientos (en vez de encantar un ítem, se obtiene un
  libro con ese encantamiento).
- **Bloque `ANVIL`** (nuevo B): crafteable con lingote de hierro × 31
  (como MC real). Interacción:
  - Libro encantado + herramienta → herramienta con ese encantamiento
  - Dos herramientas del mismo tipo → combina encantamientos
  - Herramienta + material base → repara (restaura durabilidad)
- **Costo en XP:** simplificado (no la fórmula exacta de MC): cada
  operación cuesta entre 5 y 30 niveles de XP según la complejidad.
- **Sin "Too Expensive"** (recorte: el costo siempre es posible si
  tienes suficiente XP).

**Ficheros implicados:**
- `server/constants.js` — `B.ANVIL`, `I.ENCHANTED_BOOK`
- `server/actions.js` — handlers `anvil_open` + `anvil_action`
- `server/crafting.js` — receta de yunque
- `public/panels.js` — UI del yunque
- `public/network.js` — handler `anvil_state`
- `public/game-input.js` — clic derecho con yunque abre UI
- `recetas.json` — receta de yunque

**Criterio de éxito:**
- Test: combinar libro encantado con herramienta, combinar dos
  herramientas, reparar con material base; costo de XP verificado.

## 5. Bloque D — Persistencia e inventario

**Qué hacer exactamente:**

- **Campo `enchantments`** en `ItemStack`: array de `{ id, level }`
  retrocompatible (sin campo = sin encantar).
- **SCHEMA_VERSION:** NO subir (los encantamientos son campos
  aditivos en el `ItemStack`, no cambian la estructura del archivo).
- **Tooltip:** en el inventario, los ítems encantados muestran su
  nombre en *cursiva* con el nombre del encantamiento y nivel debajo
  (como MC).
- **Wire:** el snapshot de inventario ya serializa todo el objeto
  `ItemStack` — los encantamientos se envían automáticamente.

**Ficheros implicados:**
- `server/items.js` — campo `enchantments` en clase `ItemStack`
- `server/save-players.js` — persistir `enchantments` (retrocompatible)
- `public/inventory.js` — tooltip con encantamientos
- `public/itemicons.js` — indicador visual de encantado (brillo)

**Criterio de éxito:**
- Test: guardar ítem encantado, recargar servidor, el encantamiento
  persiste. Tooltip muestra encantamiento correctamente.

## 6. Bloque E — Tests y documentación

- [ ] Test por cada encantamiento del catálogo (5 tests mínimo).
- [ ] Test de combinación en yunque (2 herramientas, libro + herramienta).
- [ ] Test de persistencia (guardar/cargar ítem encantado).
- [ ] Test de que la mesa de encantamientos consume XP y lapis.
- [ ] Actualizar `docs/server/mecanicas.md`, `TODO.md`, esta spec.

## 7. Fuera de alcance de esta fase

- Pociones y efectos de estado — van en Fase 26.5.
- Encantamientos de tridente, Barrido, Canalización, Lealtad, Mundo
  Acuático, Reparación — son exclusivos de ítems/mecánicas que no
  existen o son de versiones más recientes.
- Estanterías que modifiquen el nivel máximo de la mesa.
- Encantamientos "malditos" o de encantamiento porDataManager.
- Cualquier "Fuera de alcance" ya establecido del proyecto.

## 8. Cierre y auditoría de la fase (obligatoria)

- [ ] Suite completa de tests en verde.
- [ ] `node --check` limpio en todos los archivos modificados.
- [ ] E2E de encantamientos (mesa → encantar → yunque → guardar →
      cargar) con servidor propio.
- [ ] Auditoría de Fase 26: verificar que Filo/Protección se aplican
      en TODOS los caminos de cálculo de daño (no solo el principal).
      Verificar que Fortuna no duplica drops infinitamente. Verificar
      que Durabilidad respeta la probabilidad correcta.
- [ ] Actualizar `docs/README.md`, `AGENTS.md`, `STATUS.md`,
      `TODO.md` y esta spec.

## 9. Criterios de aceptación (resumen)

1. Catálogo de 5 encantamientos, cada uno con test de efecto medible.
2. Mesa de encantamientos y yunque funcionales de punta a punta.
3. Persistencia de encantamientos sin pérdida al recargar.
4. Suite unitaria + E2E en verde, `biome check` 0 errores.
5. Auditoría de Fase 26 obligatoria (foco: combate + durabilidad).

## 10. Flujo de trabajo

- **Branch:** `fase26-enchants` (creada desde `main` al cerrar F25).
- **Merge a `main`:** solo al cerrar la fase.
- **Tags:** `v26.0` al cerrar.
