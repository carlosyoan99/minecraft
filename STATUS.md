# STATUS.md — Estado vivo del proyecto

> **Única fuente de verdad del momento actual.** Para el detalle de cada fase
> (decisiones, mecánicas, commits, auditorías) abre la spec correspondiente en
> `docs/spec/`. Para el estado de cada tarea (`[ ]`/`[x]`) mira `TODO.md`.
> Este archivo se actualiza al **abrir**, **cerrar** o **cambiar de rumbo**
> una fase (no es un log histórico: es un panel de control).

**Última actualización:** 2026-08-15

---

## Fase activa

| | |
| --- | --- |
| **Fase** | **19.6 — Motor 3D: iluminación, materiales, shaders, instancing y animación** [`[PROSPECTIVA]`](docs/spec/fase19.6-spec.md) |
| **Prerrequisito cumplido** | Fase 19.5 cerrada y auditada (2026-08-15) ✅ |
| **Trabajo en curso** | Pendiente de implementar tras el cierre de la Fase 19.5 |
| **Bloqueantes** | Ninguno |
| **Próximo paso** | Ver `docs/spec/fase19.6-spec.md` y `TODO.md` |

## Implementado (fases cerradas y auditadas)

| Fase | Spec | Estado |
| --- | --- | --- |
| 0 — Base entregada | — | ✅ Completada |
| 1 — Cimientos técnicos | [`fase1-spec.md`](docs/spec/fase1-spec.md) | ✅ Completada y auditada |
| 2 — Identidad sensorial | [`fase2-spec.md`](docs/spec/fase2-spec.md) | ✅ Completada y auditada |
| 3 — Bucle de supervivencia | [`fase3-spec.md`](docs/spec/fase3-spec.md) | ✅ Completada y auditada |
| 4 — Profundidad de terreno | [`fase4-spec.md`](docs/spec/fase4-spec.md) | ✅ Completada y auditada |
| 5 — Progresión y combate | [`fase5-spec.md`](docs/spec/fase5-spec.md) | ✅ Completada y auditada |
| 6 — Mundo jugable y pulido | [`fase6-spec.md`](docs/spec/fase6-spec.md) | ✅ Completada y auditada |
| 7 — Pulido, UX y estética | [`fase7-spec.md`](docs/spec/fase7-spec.md) | ✅ Completada y auditada |
| 8 — Caza de bugs | [`fase8-spec.md`](docs/spec/fase8-spec.md) | ✅ Completada |
| 9 — Paridad, IA, mundo y menú | [`fase9-spec.md`](docs/spec/fase9-spec.md) | ✅ Completada |
| 9.5 — Skills, docs y `.gitignore` | [`fase9.5-spec.md`](docs/spec/fase9.5-spec.md) | ✅ Completada |
| 10 — Notas del usuario y paridad avanzada | [`fase10-spec.md`](docs/spec/fase10-spec.md) | ✅ Completada |
| 11 — Input/cámara, biomas y cierre de tests | [`fase11-spec.md`](docs/spec/fase11-spec.md) | ✅ Completada |
| 12 — Mobs por bioma, estructuras, persistencia | [`fase12-spec.md`](docs/spec/fase12-spec.md) | ✅ Completada y auditada |
| 13 — Paridad 1.0, rendimiento, POO | [`fase13-spec.md`](docs/spec/fase13-spec.md) | ✅ Completada y auditada |
| 14 — Auditoría y cierre de Fases 12-13 | [`fase14-spec.md`](docs/spec/fase14-spec.md) | ✅ Completada y auditada |
| 15 — Corrección de auditoría y mejoras | [`fase15-spec.md`](docs/spec/fase15-spec.md) | ✅ Completada y auditada |
| 16 — Corrección de la auditoría 2026-08-10 | [`fase16-spec.md`](docs/spec/fase16-spec.md) | ✅ Completada y auditada |
| 17 — Menú inicial tipo MC, UI/UX y móvil | [`fase17-spec.md`](docs/spec/fase17-spec.md) | ✅ Completada y auditada |
| 18 — Refactor a convenciones, cierre de fases | [`fase18-spec.md`](docs/spec/fase18-spec.md) | ✅ Completada y auditada |
| 19 — Texturas de ítems, interfaces y pulido visual | [`fase19-spec.md`](docs/spec/fase19-spec.md) | ✅ Completada y auditada (2026-08-15, `acca3c9`) |
| 19.5 — Skills del proyecto: audio por bioma, accesibilidad y refinamientos | [`fase19.5-spec.md`](docs/spec/fase19.5-spec.md) | ✅ Completada y auditada (2026-08-15, `c19e31e`) |

**Línea base de la fase activa:** suite **58/58 unitarios**, E2E clásicos
6/6 + menú 7/7, auditorías 6/6, `biome` 0 errores, `node --check` limpio
(cierre de la Fase 19.5, 2026-08-15).

## En revisión

- Sin fases en revisión (Fase 19.5 cerrada; F19.6 pendiente de abrir).

## Prospectiva (planificadas, sin implementar)

| Fase | Spec | Prerrequisito |
| --- | --- | --- |
| 19.6 — Motor 3D (riesgo técnico) | [`fase19.6-spec.md`](docs/spec/fase19.6-spec.md) | F19.5 cerrada ✅ |
| 20 — Rolling release | [`fase20-spec.md`](docs/spec/fase20-spec.md) | F18 cerrada ✅ |
| 21 — Biomas ampliados, estructuras, mobs | [`fase21-spec.md`](docs/spec/fase21-spec.md) | F20 cerrada |
| 21.5 — Contenido y paridad ampliados: pesca, bloques 1.8-1.15, combate, Trial Chambers | [`fase21.5-spec.md`](docs/spec/fase21.5-spec.md) | F21 cerrada |
| 22 — Profundidad, minerales y fauna 1.17-1.21 | [`fase22-spec.md`](docs/spec/fase22-spec.md) | F21.5 cerrada |
| 23 — Diferidos de la F22 | [`fase23-spec.md`](docs/spec/fase23-spec.md) | F22 cerrada |
| 24 — Nether Update | [`fase24-spec.md`](docs/spec/fase24-spec.md) | F23 cerrada |
| 25 — End Update (sin dragón) | [`fase25-spec.md`](docs/spec/fase25-spec.md) | F24 cerrada |

Grafo de dependencias completo: [`DEPENDENCIAS.md`](DEPENDENCIAS.md).

## Bloqueantes / riesgos abiertos

- Ningún bloqueante actual. Riesgos históricos documentados en cada spec y en
  las auditorías ([`docs/audits/`](docs/audits/README.md)).

## Cómo consultar

- **¿Qué fase es la activa?** Este archivo (sección "Fase activa").
- **¿Qué tarea toca ahora?** `TODO.md` (tracker `[ ]`/`[x]`).
- **¿Qué se hizo y cómo?** La spec de la fase en `docs/spec/`.
- **¿Hay problemas conocidos?** Auditorías en `docs/audits/` y `Notas del
  usuario.md`.
- **¿Qué tests cubren cada fase?** `docs/tests.md` (matriz módulo→test).

## Conventions al actualizar

- Al **abrir** una fase: añadir su fila a "En revisión" y marcar la spec
  `[EN CURSO]` en `docs/README.md`/spec.
- Al **cerrar** una fase: mover a "Implementado", actualizar "Fase activa",
  marcar la spec `[COMPLETADA]` y añadir el bloque de cierre con commits.
- Al **archivar**: mover la spec a `docs/archive/` (o marcar `[ARCHIVADA]`) y
  documentarlo aquí.
