# STATUS.md — Estado vivo del proyecto

> **Única fuente de verdad del momento actual.** Para el detalle de cada fase
> (decisiones, mecánicas, commits, auditorías) abre la spec correspondiente en
> `docs/spec/`. Para el estado de cada tarea (`[ ]`/`[x]`) mira `TODO.md`.
> Este archivo se actualiza al **abrir**, **cerrar** o **cambiar de rumbo**
> una fase (no es un log histórico: es un panel de control).

**Última actualización:** 2026-08-22

---

## Fase activa

| | |
| --- | --- |
| **Fase** | **22.1 + 22.2 + 22.3 EN PARALELO** (decisión del usuario 2026-08-23): [22.1 Tooling](docs/spec/fase22.1-spec.md) · [22.2 JSDoc+tsc](docs/spec/fase22.2-spec.md) · [22.3 Correcciones diferidas](docs/spec/fase22.3-spec.md) |
| **Prerrequisito** | **F22 cerrada ✅** (suite 64/64, E2E 7/7, `--audit` 8/8, biome 0). Prerrequisitos relajados: 22.2 ya no exige 22.1 (su spec decía no depender del cierre); 22.3 exige su prerrequisito duro F21.6 ✅ (ver [`DEPENDENCIAS.md`](DEPENDENCIAS.md)) |
| **Trabajo en curso** | 22.1: CI Actions (bloque A, WIP con fix de glob pendiente), Dependabot (B), madge/knip (C/D), stats.js (E), docs+badge (F) · 22.2: tsconfig+typecheck (A), @ts-check incremental (B), tipos compartidos (C) · 22.3: linterna luz 15 (L1), bug cabezas (B1), perfilado (V1), pase servidor (S1), residuos CL-* (R1) |
| **Diferidos F21.6 → 22.3** | Linterna/luz nivel 15, bug cabezas de mobs, perfilado en vivo, pase interno de servidor y residuos CL-* → **borrador [Fase 22.3](docs/spec/fase22.3-spec.md)** (22.1 tooling / 22.2 JSDoc+tsc se abren antes si el usuario lo decide) |
| **Bloqueantes** | Ninguno |
| **Próximo paso** | Implementar los bloques de las tres subfases (commits por fase) y cerrar cada una con su auditoría |

> **Fase 22 cerrada (2026-08-22)** — profundidad, minerales y fauna
> 1.17–1.21: A1 veredicto altura (**se mantienen 128 bloques**, `SCHEMA_VERSION`
> 6 intacto), A2 terreno 1.18, A3 deepslate, A4 raw ores, A5 cobre,
> B1 amatista (block/cluster/shard), B2 catalejo, C1 Deep Dark/sculk,
> D1 rana, G1 rate limit por conexión; **A6 altura configurable no aplica**
> por veredicto de A1. Suite **64/64** (`unit-fase22.js`, 115 checks),
> E2E 7/7, `--audit` 8/8. Detalle: [`fase22-spec.md`](docs/spec/fase22-spec.md).

> **Fase 21.6 cerrada (2026-08-22)** — correcciones de la auditoría
> consolidada 2026-08-22 + bloque P de paridad MC (escudo total, pesca
> 5-30 s, loot fiel, miel 2,4, bambú 2→2, maza consume caída, blast furnace
> data-driven); suite **63/63** (`unit-fase21.6.js`, 115 checks), E2E 7/7,
> `--audit` 8/8. Detalle: [`fase21.6-spec.md`](docs/spec/fase21.6-spec.md).

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
| 21 — Biomas ampliados, estructuras y más mobs | [`fase21-spec.md`](docs/spec/fase21-spec.md) | ✅ **Cerrada y auditada (2026-08-17, etiqueta `v21.2`)** — A1/A2/B1/B2/C1/C2/C3 + D1 (ríos al nivel del mar); suite 61/61, `--audit` 8/8 (nueva `audit-fase21.js`); D2/D3 diferidos a la F21.5 |
| 21.5 — Contenido y paridad ampliados: pesca, bloques 1.8-1.15, combate y Trial Chambers | [`fase21.5-spec.md`](docs/spec/fase21.5-spec.md) | ✅ **Cerrada y auditada (2026-08-20)** — pesca, bloques 1.8-1.15, escudo/tótem/maza, Trial Chambers, cobre/tuff, 1.21.5/1.22, comandos; suite 62/62, E2E 7/7, `--audit` 8/8; la auditoría [2026-08-22](docs/audits/auditoria-2026-08-22.md) deriva sus fixes a la F21.6 |
| 21.6 — Correcciones de la auditoría y paridad MC (pre-F22) | [`fase21.6-spec.md`](docs/spec/fase21.6-spec.md) | ✅ **Cerrada (2026-08-22)** — A seguridad (`/locate` incremental+caché, allowlist Origin sin bypass), B escudo/maza (proyectil, reválida mano, desgastes), C mochila (close, repintado, split ≤MAX_STACK sin pérdida), D jukebox/note (validación, stopDisc, persistencia aditiva en `world.json`), E `/summon` cuota+clamp, F powerPreference; **bloque P — manda MC real**: escudo total, pesca 5-30 s, loot fiel, miel 2,4, bambú 2→2, maza consume caída, blast data-driven; suite **63/63** (`unit-fase21.6.js` 115 checks), E2E 7/7, `--audit` 8/8 |
| 22 — Profundidad, minerales y fauna 1.17–1.21 | [`fase22-spec.md`](docs/spec/fase22-spec.md) | ✅ **Cerrada (2026-08-22)** — A1 altura 128 (SCHEMA_VERSION 6 intacto), A2 terreno 1.18, A3 deepslate, A4 raw ores, A5 cobre, B1 amatista (block/cluster/shard), B2 catalejo, C1 Deep Dark/sculk, D1 rana, G1 rate limit por conexión; A6 no-aplicable (veredicto A1); suite **64/64** (`unit-fase22.js` 115 checks), E2E 7/7, `--audit` 8/8 |

**Línea base de la próxima fase (F23):** la del cierre de la F22:
suite **64/64 unitarios**, **E2E 7/7**, `--audit` 8/8 verdes, biome
0 errores, `node --check` limpio.

## Prospectiva (planificadas, sin implementar)

| Fase | Spec | Prerrequisito |
| --- | --- | --- |
| 22.1 — Tooling: CI, Dependabot, madge/knip, stats.js | [`fase22.1-spec.md`](docs/spec/fase22.1-spec.md) | **F22 cerrada ✅** | 🟠 **En curso** |
| 22.2 — JSDoc + `tsc --noEmit` (sin build step) | [`fase22.2-spec.md`](docs/spec/fase22.2-spec.md) | F22 cerrada ✅ (paralela con 22.1) | 🟠 **En curso** |
| 22.3 — Correcciones y paridad diferidas (borrador; era la antigua 22.1) | [`fase22.3-spec.md`](docs/spec/fase22.3-spec.md) | F21.6 cerrada ✅ (paralela con 22.1/22.2) | 🟠 **En curso** |
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
