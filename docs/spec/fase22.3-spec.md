# Fase 22.3 — Correcciones, paridad de luz y verificación diferida (Borrador) (Spec)

> **Estado:** `[EN CURSO]` (abierta 2026-08-23 **en paralelo con las
> subfases de tooling 22.1/22.2** — decisión del usuario; su prerrequisito
> duro, F21.6 cerrada, ya se cumplía y la F22 cerró el 2026-08-22).
> Agrupa TODO lo diferido expresamente de la
> [Fase 21.6](fase21.6-spec.md) más los residuos heredados (PERSISTE) y un
> bug abierto de `Notas del usuario.md`.
>
> **Posición en el grafo (actualizada 2026-08-23):** se abre **en paralelo**
> con 22.1/22.2 por decisión del usuario; prerrequisito duro: F21.6
> cerrada ✅ (F22 cerrada era la recomendación, ya cumplida).
> No renumera la serie 22→23→24→25.

## 0. Origen

| # | Fuente | Ítem | Notas |
|---|---|---|---|
| L1 | Auditoría §5 paridad fila 11 + entrevista 2026-08-22 | **Linterna fiel a MC**: luz nivel 15 (hoy hereda el pipe de antorcha, nivel 14) y receta con 8 nuggets de hierro (hoy 4 lingotes). Requiere tocar el sistema de luz (`lighting.js`/`lightclient`) → fase propia | Decisión: «el sistema de luz muévelo a otra fase» |
| B1 | `Notas del usuario.md` §Bugs abiertos | **Cabezas de mobs y jugadores muestran caras por todos sus lados** (bug visual de UVs/modelo multibloque) | Pendiente de diagnóstico propio (render, solo visible en navegador) |
| V1 | Auditoría §4 Rendimiento «Recomendado perfilar en vivo» | Medición real: `/locate` (ms bloqueados), `arrows_update` bytes/s con varios pescando, granja de hornos con `--prof`, profiler navegador hojas/note blocks | La F21.6 arregla `/locate`; aquí se mide que quedó dentro de presupuesto |
| S1 | Auditoría §2 servidor «No revisado por límite de pasos» | **Completar el pase interno de servidor**: handlers WS nuevos por dentro (wind charge/bundle/blast furnace), ciclo interno de `projectiles.js`, `fishing.js` completo, campos nuevos de `save-players.js`, IA interna Creaking/Bogged | La F21.6 auditó `combat.js` línea a línea; esto cubre el resto |
| R1 | Auditoría §3 cliente #5/#6/#7 (PERSISTE) | Residuos heredados: **CL-2** pausa de render/audio en blur (flag `paused = document.hidden || !hasFocus()` en `player.js`), reset local en reconexión (limpiar `doorStates`, paneles/bundle abiertos — CL-1 parcial), opacidad compartida de materiales de partículas (materiales por color mutados por partícula) | Backlog desde 2026-08-15 |

## 1. Alcance previsto (a afinar al abrir la fase)

1. **L1 Linterna:** nivel de luz propio 15 + receta nuggets; recalibrar
   `unit-sync`/tests de luz.
2. **B1 Cabezas:** diagnóstico CDP del modelo (`MOB_PARTS`/jugadores
   remotos), fix de caras duplicadas + test de geometría determinista.
3. **V1 Perfilado:** informe con métricas antes/después de la F21.6.
4. **S1 Pase servidor completo:** auditoría orquestada de las áreas listadas,
   sin huecos.
5. **R1 Residuos:** los tres fixes con su test/regresión.

## 2. Prerrequisitos y orden

- Duro: **F21.6 cerrada y auditada**.
- Recomendado: abrirse tras cerrar la **F22** (su superficie minera toca los
  mismos ficheros de generación/proyectiles); si no, decisión del usuario.

## 3. Criterios de aceptación (borrador)

1. Sin regresiones en suite/E2E/`--audit`; cada bloque con su test.
2. Informe de perfilado V1 archivado en esta spec.
3. ✅ Pase S1 sin áreas «no revisadas» — completado (§4).
4. Bug B1 verificado en navegador (CDP) y cerrado en `Notas del usuario.md`.

---

## 4. S1 — Pase interno del servidor (completado 2026-08-23)

Áreas auditadas línea a línea (la F21.6 cubrió `combat.js`; esto cubre
el resto):

### 4.1 projectiles.js — ciclo de proyectiles

| # | Hallazgo | Acción |
|---|---------|--------|
| S1.1 | Muerte de mob por proyectil no replicaba `mob_death` al cliente — el mob se "evaporaba" sin flash/sonido (diferencia con el camino melee en actions.js) | Añadido `broadcastFn` inyectable + `setBroadcastHandler`; tickArrows emite `mob_death` al morir un mob por flecha/tridente |
| S1.2 | `arrowSnapshot` no incluía el flag `poison` del Bogged — el cliente no podía pintar la flecha verde | Añadido `poison: !!a.poison` al snapshot |
| S1.3 | Carga de viento: sin cooldown por jugador, un cliente automatizado spameaba `throw_wind_charge` con knockback reiterado (griefing) | Añadido `THROW_COOLDOWN_MS` 500 ms + `throwCooldownActivo` en actions.js |

Veredicto: **OK** — física correcta (gravedad, anti-tunneling 0.25 pasos,
wind charge recto sin gravedad, paridad MC). Las ramas player/mob/
wind están bien separadas.

### 4.2 fishing.js — pesca

| # | Hallazgo | Acción |
|---|---------|--------|
| S1.4 | `FISHING_LIFE_MS` era 15 s pero `BITE_MIN_MS+BITE_RANGE_MS` = 30 s — ~60% de las líneas expiraban antes de programar el bocado | `FISHING_LIFE_MS` subido a 32 s (margen de 2 s sobre el peor caso) |
| S1.5 | `reelBobber` con inventario lleno retiraba la línea ANTES de intentar entregar — contradecía el contrato del comentario | Línea permanece en el agua si `addToInventory` falla; el jugador libera hueco y vuelve a recoger |
| S1.6 | Loot table incluía `COOKED_COD` y `FLINT` que MC real no suelta al pescar | Eliminados (F21.6 P3): solo `COD` crudo, `BOW`/`COMPASS` tesoro, `STICK`/`STRING`/`FEATHER`/`BONE` basura |

Veredicto: **OK** — sweep anti-tunneling correcto (ROUND para x/z,
FLOOR para y), `BITE_MIN_MS` 5 s (MC real), `biteAt` = `Date.now()` +
aleatorio dentro de rango.

### 4.3 save-players.js — persistencia de jugadores

| # | Hallazgo | Acción |
|---|---------|--------|
| S1.7 | Un archivo `players/<nombre>.json` manipulado podía inyectar counts gigantes (1e9) que rompen la aritmética de stacks | `stackSana` sanea: count clamped a `MAX_STACK`, id debe ser entero ≥1, durabilidad solo si numérica |
| S1.8 | `restorePlayer` no validaba el `respawnPoint` campo a campo — un JSON corrupto (NaN, null) causaba respawn en (NaN,NaN,NaN) | Validación campo a campo: `Number.isFinite` en x, y, z antes de asignar |
| S1.9 | La mochila (bundle) no se restauraba al reconectar | `restorePlayer` ahora restaura `player.bundle = data.bundle.map(stackSana)` |

Veredicto: **OK** — defensivo: lectura con try/catch, campos inválidos
se ignoran (el jugador empieza de cero si el archivo está corrupto).

### 4.4 Handlers WS nuevos

| # | Handler | Veredicto |
|---|---------|-----------|
| S1.10 | `throw_wind_charge` → `handleThrowWindCharge` | OK — cooldown 500 ms, valida mano, consume, inventario actualizado |
| S1.11 | `bundle_open` / `bundle_action` | OK — exclusión mutua con cofre/horno, MAX_STACK en fusiones, split sin pérdida |
| S1.12 | `honey_bottle` → `handleHoneyBottle` | OK — guardas H1 (coords finitas, FLOOR, distancia ≤5, bloque correcto) |
| S1.13 | Blast furnace (`isBlastFurnaceBlock` + `isBlastCookable`) | OK — solo minerales ×2, tiempo 2× más rápido, alimentos ignorados |

### 4.5 IA interna: Creaking y Bogged

| # | Hallazgo | Acción |
|---|---------|--------|
| S1.14 | Creaking: `p.alive` en el bucle de observadores — los JUGADORES no tienen `alive`; el creaking NUNCA se congelaba | Corregido a `!p \|\| p.inMenu \|\| p.ws.readyState !== WebSocket.OPEN` |
| S1.15 | Creaking: detección de línea de visión con solo 2 muestras (t=0.3, 0.65) — una pared pegada al jugador/mob no bloqueaba la "visión" | Muestreo denso cada 0.25 (S1 en la spec de F21.5 corregido aquí) |
| S1.16 | Bogged: reutiliza 100% la IA del esqueleto + `shootPoisonArrow` — drops y XP idénticos | OK — sin cambios necesarios |

**Resumen S1:** 16 áreas revisadas, 9 hallazgos documentados con fix,
7 veredictos OK sin cambios. Sin áreas «no revisadas».

---

## Cambios en esta spec

- 2026-08-23: S1 completado (§4): 16 áreas auditadas, 9 hallazgos con
  fix, 7 OK sin cambios. Documentado en esta spec.
- 2026-08-22: creación del borrador (diferidos de la entrevista del
  planificador 2026-08-22: linterna/luz, bug de cabezas, perfilado, pase
  servidor restante, residuos CL-*).
