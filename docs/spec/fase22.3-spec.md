# Fase 22.3 — Correcciones, paridad de luz y verificación diferida (Borrador) (Spec)

> **Estado:** `[PROSPECTIVA]` — **BORRADOR** creado 2026-08-22 desde la
> [auditoría 2026-08-22](../audits/auditoria-2026-08-22.md) y la entrevista
> del planificador del mismo día. Agrupa TODO lo diferido expresamente de la
> [Fase 21.6](fase21.6-spec.md) más los residuos heredados (PERSISTE) y un
> bug abierto de `Notas del usuario.md`.
>
> **Posición en el grafo:** su numeración (22.3) la sitúa tras las subfases de tooling 22.1/22.2; se
> abrirá cuando el usuario lo decida (prerrequisito duro: F21.6 cerrada).
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
3. Pase S1 sin áreas «no revisadas».
4. Bug B1 verificado en navegador (CDP) y cerrado en `Notas del usuario.md`.

---

## Cambios en esta spec

- 2026-08-22: creación del borrador (diferidos de la entrevista del
  planificador 2026-08-22: linterna/luz, bug de cabezas, perfilado, pase
  servidor restante, residuos CL-*).
