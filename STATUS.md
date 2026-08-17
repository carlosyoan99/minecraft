# STATUS.md — Estado vivo del proyecto

> **Única fuente de verdad del momento actual.** Para el detalle de cada fase
> (decisiones, mecánicas, commits, auditorías) abre la spec correspondiente en
> `docs/spec/`. Para el estado de cada tarea (`[ ]`/`[x]`) mira `TODO.md`.
> Este archivo se actualiza al **abrir**, **cerrar** o **cambiar de rumbo**
> una fase (no es un log histórico: es un panel de control).

**Última actualización:** 2026-08-16

---

## Fase activa

| | |
| --- | --- |
| **Fase** | **21 — Biomas ampliados, estructuras y más mobs (abierta 2026-08-17)** [`[EN CURSO]`](docs/spec/fase21-spec.md) |
| **Prerrequisito cumplido** | Fase 20 cerrada (v20.2 con etiqueta `v20.2`, suite 60/60, E2E 7/7, `--audit` 7/7, biome 0) ✅ |
| **Trabajo en curso** | **Fase 20 cerrada** (ciclo rolling): v20.1 (paridad TNT knockback + mena cruda, rendimiento P4/P7) y **v20.2** (bugs D1 `#menu-bg` y D2 desconexión al cargar, backlog B6: SV-5 `MAX_STACK` 64, REN-1 `savePlayersAsync`, CI 19 timeouts CDP/perf, CI 20 `npm run audit`; `audit-fase20.js` nuevo, `--audit` 7/7; cierre commit `70541ec` + etiqueta `v20.2`) — ver [`docs/v20.1.md`](docs/v20.1.md) y [`docs/v20.2.md`](docs/v20.2.md). **Fase 21 abierta** ([spec](docs/spec/fase21-spec.md), de alcance): planificación P0 pendiente (entrevista del planificador para acotar la primera tanda de biomas/estructuras/mobs) |
| **Bloqueantes** | Ninguno |
| **Próximo paso** | Planificar la **Fase 21** (P0): entrevista del planificador para acotar qué biomas/estructuras/mobs entran en la primera tanda, el orden por valor percibido y los criterios de aceptación (resultado en la spec F21 y `TODO.md`) |

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
| 19.5 — Skills del proyecto: audio por bioma, accesibilidad y refinamientos | [`fase19.5-spec.md`](docs/spec/fase19.5-spec.md) | ✅ Completada y auditada (2026-08-15, `82b288b`) |
| 19.6 — Motor 3D: iluminación, materiales, shaders, instancing y animación | [`fase19.6-spec.md`](docs/spec/fase19.6-spec.md) | ✅ Completada (2026-08-16) |
| 20 — Rolling release (ciclo de estabilización y paridad) | [`fase20-spec.md`](docs/spec/fase20-spec.md) | ✅ **Cerrada (v20.2, etiqueta `v20.2`)** — v20.1 + v20.2 (D1/D2, backlog B6, `audit-fase20`, `--audit` 7/7) |

**Línea base de la fase activa (F21):** suite **60/60 unitarios** (v20.2
añade checks de SV-5 y REN-1), **E2E 7/7**, `biome` 0 errores, `node
--check` limpio, `npm run audit` 0 vulnerabilidades. Auditorías `--audit`
verdes: fase3 (umbrales ampliados, CI 19), fase4/5/6 + altura + **fase20
(nueva)**; `audit-fase7`
(render CDP) depende de CPU baja (SwiftShader; ventanas ampliadas en CI 19
— ver `docs/tests.md`).

## En revisión

- Sin fases en revisión (Fase 20 cerrada; **Fase 21 en curso**).

## Prospectiva (planificadas, sin implementar)

| Fase | Spec | Prerrequisito |
| --- | --- | --- |
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
