# Fase 3 — Bucle de supervivencia (Spec)

> **Estado:** `[COMPLETADA]`

> Documento de especificación de la Fase 3, **reconstruido a posteriori**: la
> fase está COMPLETADA y auditada. Se elabora a partir del `TODO.md` (sección
> Fase 3 con su auditoría) y del historial de git, en el mismo formato que
> `fase8-spec.md` / `fase9-spec.md`.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA (agosto 2026)** · Proyecto: clon de
> Minecraft (servidor Node autoritativo `server/` + cliente Three.js
> `public/`, todo en español).

---

## 1. Resumen

La Fase 3 cierra el **bucle de supervivencia** del juego — minar → craftear →
sobrevivir — añadiendo la gestión de hambre y la cadena alimenticia:

1. **Barra de hambre** con decaimiento, regeneración de salud y penalización
   por inanición (fuente de verdad: el servidor).
2. **Drops de comida** de los animales al morir (nuevos ítems de comida cruda).
3. **Recetas de horno** para cocinar esa comida.
4. **Comer con clic derecho** (restaura hambre + saturación).
5. **Alimentación y reproducción** simple de animales (cría).

**Resultado:** la fase se cerró con auditoría de balance y rendimiento en
verde: el hambre aguanta ~10 min parado y ~5 min en movimiento antes de bajar
(presión suave, ritmo jugable), la regeneración agota ~3 HP de reserva, comer
cocinada cubre ~40% de la barra, el tick de mobs escala linealmente (300 mobs
→ 0.319 ms/tick) y la persistencia de la cría es retrocompatible.

---

## 2. Contexto del proyecto (estado al inicio, verificado)

Tras las Fases 1-2 (cimientos técnicos + identidad sensorial):

- El mundo se genera, se ve con texturas pixel-art, suena y tiene ciclo
  día/noche.
- **Pero no hay presión de supervivencia**: la salud no baja por hambre, los
  animales no sueltan comida al morir, no hay forma de cocinar ni de criar.

**Problemas que motivaban la fase:** sin hambre ni comida no existe el bucle
"minar → craftear → sobrevivir"; la comida no tiene cadena (cruda →
cocinada); los animales son decorativos.

---

## 3. Objetivos

1. Barra de hambre con decaimiento, regeneración e inanición, **en el
   servidor** (`players.js` `tickPlayer`, fuente de verdad).
2. Drops de comida de los animales (vaca, cerdo, pollo, oveja).
3. Cocinar en el horno (cruda → cocinada) con las recetas adecuadas.
4. Comer con clic derecho restaurando hambre y saturación.
5. Alimentar y criar animales (cooldowns, bebés que crecen).
6. Auditoría de balance (ritmo jugable) y de rendimiento del tick de mobs.

---

## 4. Bloques de trabajo

### B1. Barra de hambre

- `food` 0-20 que **decae cada 30 s parado / 15 s en movimiento**.
- **Regenera** +1 salud cada 2 s cuando `food >= 18` (consumiendo comida).
- **Drena** -1 salud cada 2 s por inanición con `food == 0`.
- El respawn resetea salud y comida.
- El `init` envía `food`; existe el evento `food_update`; el HUD muestra la
  barra 🍗 (naranja baja, roja vacía).

### B2. Drops de comida de animales

- Nuevos ítems de comida cruda en `constants.js`: `BEEF/PORKCHOP/CHICKEN/
  MUTTON` (107-110), **sincronizados con el cliente** (paridad auditable).
- `mobs.js` expone `mobDrops(type)` con rangos aleatorios estilo Minecraft;
  `net.js` entrega el drop al inventario del atacante en `attack_mob`
  (muerte directa; no hay entidades de item en el suelo).

### B3. Recetas de horno para cocinar

- Nuevos ítems cocinados `COOKED_BEEF/PORKCHOP/CHICKEN/MUTTON` (111-114),
  sincronizados con el cliente.
- 4 recetas en `recetas_horno.json` (cruda → cocinada) usando el mecanismo
  `isCookable` + tick del horno ya existentes.

### B4. Comer con clic derecho

- `FOOD_VALUES` (hambre + saturación, escala 0-20; la cocinada restaura más)
  en el servidor.
- Evento `eat` validado que consume el ítem seleccionado.
- El tick consume la **saturación antes que el hambre** (amortigua el hambre,
  como en Minecraft).

### B5. Alimentación y reproducción simple

- Nuevos ítems de cría `TRIGO/ZANAHORIA/SEMILLAS` (115-117) que suelta la
  hierba al romperla; alimentan a vaca/oveja, cerdo y pollo
  (`BREED_FOOD`).
- `feed_mob` validado en el servidor: consume el ítem, entra en modo amor
  30 s y, si encuentra pareja del mismo tipo a <8 bloques, **cría un bebé**
  (padres en cooldown 60 s).
- El bebé se renderiza a media escala, no dropea comida y crece hasta adulto
  en 60 s; el estado `isBaby`/`age` se persiste de forma **retrocompatible**.

### B6. Auditoría de Fase 3

Revisar el balance del hambre (ritmo jugable) y confirmar que el
spawn/reproducción de animales no degrada el rendimiento del tick de mobs.

---

## 5. Fuentes de verdad sincronizadas (introducidas aquí)

- **Ítems de comida y cría**: `FOOD_VALUES`/`BREED_FOOD` (servidor) ↔
  `FOOD_ITEMS`/`BREED_FOOD` (cliente) — los audita `tests/unit-sync.js`.
- **Recetas del horno**: `recetas_horno.json` (servidor; el cliente solo
  envía el grid) — los valida `tests/unit-recetas.js`.

---

## 6. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/players.js` | `tickPlayer`: hambre/regeneración/inanición; comer (`eat`) |
| `server/constants.js` | `FOOD_VALUES`, `BREED_FOOD`, ítems 107-117 |
| `server/mobs.js` | `mobDrops(type)`, `feed_mob`, modo amor, cría, `isBaby`/`age` |
| `server/net.js` | drops en `attack_mob`, evento `eat`, `food_update` |
| `recetas_horno.json` | 4 recetas cruda → cocinada |
| `public/constants.js` | paridad de ítems y valores (FOOD_ITEMS/BREED_FOOD) |
| `public/network.js` | `food_update` → HUD |
| `public/ui.js` | barra de hambre 🍗 |
| `tests/unit-crafting.js`, `tests/unit-sync.js`, `tests/audit-fase3.js` | cobertura |

> **Tests que cubren esta fase:** `tests/unit-crafting.js`, `tests/unit-sync.js`, `tests/audit-fase3.js`.

---

## 7. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|
| 1 | Hambre en el servidor | Fuente de verdad en `players.js` `tickPlayer`; el cliente solo pinta |
| 2 | Curva de hambre | Parado decae cada 30 s, en movimiento cada 15 s; regeneración con `food >= 18`; inanición con `food == 0` |
| 3 | Saturación | Se consume antes que el hambre (amortiguador, como Minecraft) |
| 4 | Cría | Modo amor 30 s + pareja a <8 bloques + cooldown 60 s + bebé que crece en 60 s |
| 5 | Drops | Directos al inventario (sin entidades de item en el suelo) |

---

## 8. Plan de la Fase 3 (orden de ejecución)

1. Barra de hambre (B1).
2. Drops de comida (B2) + recetas de horno (B3).
3. Comer con clic derecho (B4).
4. Alimentación y cría (B5).
5. Auditoría de balance y rendimiento (B6) + limpieza de código muerto.

---

## 9. Riesgos y notas

- **Paridad de ítems**: añadir ítems exige actualizar AMBOS `constants.js` y
  añadir la receta si aplica (regla que se mantiene en todas las fases).
- **Regresión determinista**: los tests que dependen de la semilla no deben
  verse afectados; cambiar `SEED` rompería tests deterministas.
- **La saturación amortigua el hambre**: al comer, la barra de comida no baja
  hasta que se agota la saturación — comportarse igual que Minecraft.
- La limpieza de la fase eliminó código muerto preexistente (`isAxe`/
  `isShovel` sin uso en `constants.js`).

---

## 10. Criterios de aceptación + resultado verificado

1. La comida baja con el tiempo/actividad, la salud se regenera con la comida
   llena y muere de inanición con la comida vacía.
2. Los animales sueltan comida al morir; el horno cocina la cruda; comer
   restaura hambre y saturación.
3. Alimentar a dos animales del mismo tipo produce un bebé que crece.
4. Balance jugable y tick de mobs dentro del presupuesto (auditoría).

**Estado: COMPLETADA.** Auditoría (agosto 2026, `tests/audit-fase3.js`):
parado, la comida aguanta ~10 min antes de bajar y se muere de inanición a
los ~21 min; moviéndose, ~5 y ~11 min (presión suave). La regeneración agota
~3 HP de reserva (food 20→17, fiel a Minecraft); una pelea sostenida agota la
reserva en ~6 s. Comer cocinada (+8 food / +12.8 sat) cubre ~40% de la barra
e incentiva el horno frente a la cruda (+3 / +1.8). Tick de mobs con cría:
30 mobs → 0.043 ms/tick, 100 → 0.135, 300 → 0.319 (y 0.225 de noche) — escala
lineal, muy por debajo del presupuesto de 50 ms; el broadcast `mobs_update`
pesa 5-51 KB y se serializa en <3 ms. Persistencia de `isBaby`/`age`:
round-trip OK y retrocompatible con guardados viejos.

---

## Cierre de la fase

- **Fecha de cierre:** 2026-08-01
- **Commits clave:**
  - `538a5f0` (2026-08-01) — bucle de supervivencia: hambre, comida, cocina, comer y cría.
  - `ee07bd8` (2026-08-01) — cierre de auditoría: balance de hambre validado, rendimiento del tick de mobs medido y limpieza de código muerto.
- **Resultado de la auditoría:** balance de hambre (presión suave: parado ~10 min antes de bajar, inanición a los ~21 min; moviéndose ~5 / ~11 min); regeneración agota ~3 HP de reserva; comer cocinada cubre ~40% de la barra; tick de mobs lineal (30 → 0.043, 100 → 0.135, 300 → 0.319 ms/tick); persistencia de `isBaby`/`age` retrocompatible.
- **Lagunas conocidas / decisiones diferidas:** ninguna documentada.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-06: creación del spec (documento retrospectivo de la Fase 3).

**Cambios en esta spec (v2):**
- 2026-08-15: reorganización de docs — spec movida a `docs/spec/`, referencias de rutas actualizadas, etiqueta de estado `[COMPLETADA]` y bloque de cierre con commits.
