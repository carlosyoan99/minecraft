# Fase 5 — Progresión y combate (Spec)

> **Estado:** `[COMPLETADA]`

> Documento de especificación de la Fase 5, **reconstruido a posteriori**: la
> fase está COMPLETADA y auditada. Se elabora a partir del `TODO.md` (sección
> Fase 5 con su auditoría) y del historial de git, en el mismo formato que
> `fase8-spec.md` / `fase9-spec.md`.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA (agosto 2026)** · Proyecto: clon de
> Minecraft (servidor Node autoritativo `server/` + cliente Three.js
> `public/`, todo en español).

---

## 1. Resumen

La Fase 5 da **sentido a la progresión** — subir de nivel de herramienta
tiene recompensa real:

1. **Durabilidad real de herramientas** — se rompen tras N usos, con daño de
   espada por material y desgaste al atacar y minar.
2. **Más variedad de mobs y drops** — araña, lobo y conejo, con sus drops
   (hilo → lana, conejo → asado) y recetas asociadas.
3. **Experiencia y niveles** (opcional del plan, implementado) — XP por matar
   mobs y minar minerales, niveles que dan salud máxima.

**Resultado:** la fase se cerró con auditoría en verde: sincronización
servidor↔cliente de durabilidades y XP, **sin duplicación de ítems** al
romperse una herramienta a mitad de acción, y un **bug real encontrado y
corregido por los tests**: la receta `hilo_a_lana` apuntaba al ingrediente
118 (conejo crudo) en vez de 120 (hilo).

---

## 2. Contexto del proyecto (estado al inicio, verificado)

Tras las Fases 1-4 (cimientos, sensorial, supervivencia, terreno):

- Hay hambre, comida, cría, cuevas, agua y más biomas.
- **Pero las herramientas no se gastan**: una vez crafteadas, un pico de
  madera dura para siempre; no hay incentivo para subir a hierro/diamante.
- La variedad de mobs es limitada y no hay sistema de progresión.

**Problemas que motivaban la fase:** sin durabilidad no hay progresión de
herramientas; sin XP no hay meta-progresión; la variedad de mobs es escasa.

---

## 3. Objetivos

1. Durabilidad real de las 20 herramientas (que se rompan y se notifique).
2. Daño de espada por material y desgaste correcto (solo espadas al atacar).
3. Mobs nuevos (araña, lobo, conejo) con drops y recetas (hilo, conejo).
4. XP/niveles con beneficio de salud máxima.
5. Auditoría de sincronización inventario↔HUD y ausencia de duplicación de
   ítems al romperse una herramienta.

---

## 4. Bloques de trabajo

### B1. Durabilidad real de herramientas

- `TOOL_DURABILITY` en `constants.js` (madera 60, piedra 132, hierro 251,
  oro 33, diamante 1562 — estilo Minecraft) para picos 200-204, hachas
  205-209, palas 210-214 y espadas 215-219.
- Cada herramienta lleva su `durability` en el slot (no se apilan;
  `addToInventory` las crea con durabilidad plena).
- `players.js` `applyToolWear()` desgasta -1 por uso: al romper bloques con
  cualquier herramienta y al atacar con espada (`onlySwords=true`).
- Al llegar a 0 se elimina del inventario **de forma atómica** dentro del
  handler (sin duplicar ítems) y se avisa con `tool_broke` (sonido +
  mensaje).
- El HUD pinta la barra de durabilidad (verde→rojo); las herramientas que
  pasan por la mesa de crafteo **conservan su durabilidad**
  (`grid_set`/`grid_clear`) — no se "reparan gratis" ni se duplican usos.
- Daño de espada por material (`SWORD_DAMAGE`: madera 3, piedra 4, hierro 5,
  oro 4, diamante 6; sin espada 2).

### B2. Más mobs y drops

- Nuevos hostiles: `spider` (12 HP, rápida, dmg 2) y `wolf` (20 HP, dmg 3);
  pasivo `rabbit` (10 HP, se cría con zanahoria).
- Drops: la araña suelta hilo (`I.STRING=120`, 0-2) que se craftea 2×2 en
  lana (receta `hilo_a_lana`); el conejo suelta conejo crudo (`I.RABBIT=118`)
  que se cocina a asado (`I.COOKED_RABBIT=119`).
- Escala por tipo en el cliente (`MOB_SCALE`).

### B3. XP y niveles (opcional del plan, implementado)

- `MOB_XP` (matar mobs) y `ORE_XP` (minar minerales) acumulan XP;
  `level = floor(xp / 100)` con `XP_PER_LEVEL=100`.
- Cada nivel suma +1 de salud máxima (máx +10, `MAX_LEVEL_HEALTH_BONUS`); la
  XP y el nivel se conservan al morir.
- El `init` envía `xp/level/maxHealth`; el cliente muestra barra de XP +
  nivel en el HUD y avisa al subir de nivel; `maxHealth` se usa en respawn y
  regeneración.

### B4. Auditoría de Fase 5

Revisar la sincronización de la durabilidad entre inventario del servidor y
HUD del cliente; confirmar que no hay forma de duplicar ítems al romperse
una herramienta a mitad de una acción.

---

## 5. Fuentes de verdad sincronizadas (introducidas aquí)

- `TOOL_DURABILITY` (servidor) ↔ `DURABILITY` (cliente) — los audita
  `tests/audit-fase5.js`.
- `XP_PER_LEVEL` idéntico en ambos lados.
- El wire de `inventory_update` lleva `durability` por herramienta.

---

## 6. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/constants.js` | `TOOL_DURABILITY`, `SWORD_DAMAGE`, `MOB_XP`, `ORE_XP`, `XP_PER_LEVEL`, `MAX_LEVEL_HEALTH_BONUS`, ítems 118-120 |
| `server/players.js` | `applyToolWear`, niveles/maxHealth, respawn |
| `server/mobs.js` | spider/wolf/rabbit, drops hilo/conejo |
| `server/net.js` | `tool_broke`, XP al matar/minar |
| `recetas.json` | `hilo_a_lana` |
| `recetas_horno.json` | conejo crudo → asado |
| `public/constants.js` | paridad (`DURABILITY`, `XP_PER_LEVEL`, ítems) |
| `public/ui.js` | barra de durabilidad en hotbar, barra de XP + nivel |
| `tests/unit-durabilidad.js`, `tests/unit-recetas.js`, `tests/audit-fase5.js` | cobertura y auditoría |

> **Tests que cubren esta fase:** `tests/unit-durabilidad.js`, `tests/unit-recetas.js`, `tests/audit-fase5.js`.

---

## 7. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|
| 1 | Durabilidades | Estilo Minecraft (oro frágil y rápido: 33 usos) |
| 2 | Desgaste | -1 por uso: al minar con cualquier herramienta y al atacar solo con espada |
| 3 | Rotura atómica | Eliminar del inventario dentro del handler, sin duplicar; `tool_broke` al cliente |
| 4 | Crafteo | Las herramientas conservan su durabilidad al pasar por la mesa (no reparación gratis) |
| 5 | XP simple | `level = floor(xp / 100)` (lineal; la curva no lineal queda para la Fase 9) |

---

## 8. Plan de la Fase 5 (orden de ejecución)

1. Durabilidad y daño de espada (B1).
2. Mobs nuevos y drops (B2).
3. XP/niveles (B3).
4. Auditoría (B4) + cobertura unitaria nueva (`unit-durabilidad.js`).

---

## 9. Riesgos y notas

- **La receta `hilo_a_lana` estaba rota** (ingrediente 118 en vez de 120):
  los tests de recetas la detectaron — lección: toda receta nueva debe validar
  IDs y shapes (`unit-recetas.js`).
- **Sin duplicación al romper a mitad de acción**: el orden exacto del
  handler (romper → añadir drop → desgastar → enviar inventario) se replicó
  en el test de la auditoría (durabilidad 1 → 1 drop, 0 herramientas;
  durabilidad 5 → 6 roturas exactas).
- Romper a mano no desgasta herramientas (no se usan).
- La regresión de Fases 3/4 se mantuvo (drops de vaca, `isSolidBlock(SNOW)`,
  `getHeight`).

---

## 10. Criterios de aceptación + resultado verificado

1. Las 20 herramientas se rompen tras N usos y avisan con `tool_broke`.
2. La espada hace daño por material y solo las espadas desgastan al atacar.
3. La araña, el lobo y el conejo existen con sus drops; el hilo craftea lana
   y el conejo se cocina.
4. Matar mobs y minar minerales da XP; los niveles suben la salud máxima.
5. Sin duplicación de ítems al romperse una herramienta.

**Estado: COMPLETADA.** Auditoría (agosto 2026, `tests/audit-fase5.js`):
`TOOL_DURABILITY` == `DURABILITY` para las 20 herramientas y `XP_PER_LEVEL`
idéntico; el wire de `inventory_update` lleva durabilidad; el HUD pinta la
barra. Sin duplicación: durabilidad 1 → drop UNA vez y herramienta
desaparece; 6 roturas con durabilidad 5 → 6 drops exactos. XP/niveles:
340 XP → nivel 3 y maxHealth 23; tope +10 en nivel 15; el respawn usa
maxHealth y conserva nivel/XP. `applyToolWear` rinde 10k usos en ~5 ms.
Regresión Fase 3/4 intacta. **Bug real corregido por los tests:** receta
`hilo_a_lana` apuntaba al 118 (conejo crudo) en vez del 120 (hilo).

---

## Cierre de la fase

- **Fecha de cierre:** 2026-08-02
- **Commits clave:**
  - `634a55a` (2026-08-02) — progresión y combate: durabilidad de herramientas, mobs nuevos y XP/niveles.
- **Resultado de la auditoría:** `TOOL_DURABILITY` == `DURABILITY` (20 herramientas) y `XP_PER_LEVEL` idénticos; sin duplicación de ítems al romperse una herramienta (durabilidad 1 → 1 drop, 0 herramientas; 6 roturas con durabilidad 5 → 6 drops exactos); XP/niveles: 340 XP → nivel 3 y maxHealth 23 (tope +10 en nivel 15); `applyToolWear` rinde 10k usos en ~5 ms; regresión Fases 3/4 intacta; bug real corregido por los tests (receta `hilo_a_lana` apuntaba al 118 en vez del 120).
- **Lagunas conocidas / decisiones diferidas:** curva de XP lineal (`level = floor(xp / 100)`); la curva no lineal queda para la Fase 9.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-06: creación del spec (documento retrospectivo de la Fase 5).

**Cambios en esta spec (v2):**
- 2026-08-15: reorganización de docs — spec movida a `docs/spec/`, referencias de rutas actualizadas, etiqueta de estado `[COMPLETADA]` y bloque de cierre con commits.
