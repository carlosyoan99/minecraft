# DEPENDENCIAS.md — Grafo de fases

> Grafo de prerrequisitos entre las fases del proyecto. Cada fase se abre
> solo cuando sus prerrequisitos están **cerrados y auditados**. El estado
> real de cada fase está en [`STATUS.md`](STATUS.md) y el detalle en las
> specs de [`docs/spec/`](docs/spec/README.md).

## Grafo (Mermaid)

```mermaid
graph LR
    F0[Fase 0 · Base entregada]
    F1[Fase 1 · Cimientos técnicos] --> F0
    F2[Fase 2 · Identidad sensorial] --> F1
    F3[Fase 3 · Bucle de supervivencia] --> F2
    F4[Fase 4 · Profundidad de terreno] --> F3
    F5[Fase 5 · Progresión y combate] --> F4
    F6[Fase 6 · Mundo jugable y pulido] --> F5
    F7[Fase 7 · Pulido, UX y estética] --> F6
    F8[Fase 8 · Caza de bugs] --> F7
    F9[Fase 9 · Paridad, IA, mundo y menú] --> F8
    F9_5[Fase 9.5 · Skills + docs] --> F9
    F10[Fase 10 · Notas del usuario] --> F9_5
    F11[Fase 11 · Input/cámara, biomas] --> F10
    F12[Fase 12 · Mobs por bioma] --> F11
    F13[Fase 13 · Paridad 1.0, POO] --> F12
    F14[Fase 14 · Auditoría 12-13] --> F13
    F15[Fase 15 · Corrección + D5 128bl] --> F14
    F16[Fase 16 · Auditoría 2026-08-10] --> F15
    F17[Fase 17 · Menú MC + móvil] --> F16
    F18[Fase 18 · Refactor + paridad C-1..C-9] --> F17
    F19[Fase 19 · Texturas/UI + drag&drop] --> F18
    F19_5[Fase 19.5 · Skills + audio por bioma] --> F19
    F19_6[Fase 19.6 · Motor 3D] --> F19_5
    F20[Fase 20 · Rolling release] --> F18
    F21[Fase 21 · Biomas/estructuras/mobs] --> F20
    F21_5[Fase 21.5 · Contenido y paridad ampliados: pesca, bloques 1.8-1.15, combate, Trial Chambers] --> F21
    F21_6[Fase 21.6 · Correcciones auditoría + paridad MC (pre-F22)] --> F21_5
    F22[Fase 22 · Profundidad 1.17-1.21] --> F21_6
    F22_1[Fase 22.1 · Correcciones y paridad diferidas (borrador)] --> F22
    F23[Fase 23 · Diferidos F22] --> F22
    F24[Fase 24 · Nether Update] --> F23
    F25[Fase 25 · End Update] --> F24
    F26[Fase 26 · Encantamientos] --> F25
    F26_5[Fase 26.5 · Pociones] --> F26
    F27[Fase 27 · Mundo ampliado] --> F25
    F27_5[Fase 27.5 · Mobs zona activa] --> F27
    F28[Fase 28 · Multijugador] --> F25
    F29[Fase 29 · Modos/QoL] --> F25

    classDef done fill:#2d6a4f,stroke:#1b4332,color:#fff;
    classDef active fill:#e9c46a,stroke:#b98a00,color:#222;
    classDef planned fill:#6a6a6a,stroke:#444,color:#fff;
    class F0,F1,F2,F3,F4,F5,F6,F7,F8,F9,F9_5,F10,F11,F12,F13,F14,F15,F16,F17,F18,F19,F19_5,F19_6,F20,F21,F21_5 done;
    class F21_6 active;
    class F22,F22_1,F23,F24,F25,F26,F26_5,F27,F27_5,F28,F29 planned;
```

## Tabla de prerrequisitos

| Fase | Spec | Prerrequisito | Estado |
| --- | --- | --- | --- |
| 0 | — | — | ✅ Completada |
| 1 | [`fase1-spec.md`](docs/spec/fase1-spec.md) | F0 | ✅ Completada y auditada |
| 2 | [`fase2-spec.md`](docs/spec/fase2-spec.md) | F1 | ✅ Completada y auditada |
| 3 | [`fase3-spec.md`](docs/spec/fase3-spec.md) | F2 | ✅ Completada y auditada |
| 4 | [`fase4-spec.md`](docs/spec/fase4-spec.md) | F3 | ✅ Completada y auditada |
| 5 | [`fase5-spec.md`](docs/spec/fase5-spec.md) | F4 | ✅ Completada y auditada |
| 6 | [`fase6-spec.md`](docs/spec/fase6-spec.md) | F5 | ✅ Completada y auditada |
| 7 | [`fase7-spec.md`](docs/spec/fase7-spec.md) | F6 | ✅ Completada y auditada |
| 8 | [`fase8-spec.md`](docs/spec/fase8-spec.md) | F7 | ✅ Completada |
| 9 | [`fase9-spec.md`](docs/spec/fase9-spec.md) | F8 | ✅ Completada |
| 9.5 | [`fase9.5-spec.md`](docs/spec/fase9.5-spec.md) | F9 | ✅ Completada |
| 10 | [`fase10-spec.md`](docs/spec/fase10-spec.md) | F9.5 | ✅ Completada |
| 11 | [`fase11-spec.md`](docs/spec/fase11-spec.md) | F10 | ✅ Completada |
| 12 | [`fase12-spec.md`](docs/spec/fase12-spec.md) | F11 | ✅ Completada y auditada |
| 13 | [`fase13-spec.md`](docs/spec/fase13-spec.md) | F12 | ✅ Completada y auditada |
| 14 | [`fase14-spec.md`](docs/spec/fase14-spec.md) | F12+F13 | ✅ Completada y auditada |
| 15 | [`fase15-spec.md`](docs/spec/fase15-spec.md) | F14 | ✅ Completada y auditada |
| 16 | [`fase16-spec.md`](docs/spec/fase16-spec.md) | F15 | ✅ Completada y auditada |
| 17 | [`fase17-spec.md`](docs/spec/fase17-spec.md) | F16 | ✅ Completada y auditada |
| 18 | [`fase18-spec.md`](docs/spec/fase18-spec.md) | F17 | ✅ Completada y auditada |
| 19 | [`fase19-spec.md`](docs/spec/fase19-spec.md) | **F18 cerrada** | ✅ Completada y auditada (`acca3c9`) |
| 19.5 | [`fase19.5-spec.md`](docs/spec/fase19.5-spec.md) | F18 **y** F19 cerradas | ✅ Completada y auditada |
| 19.6 | [`fase19.6-spec.md`](docs/spec/fase19.6-spec.md) | F19.5 cerrada | ✅ Completada (2026-08-16) |
| 20 | [`fase20-spec.md`](docs/spec/fase20-spec.md) | F18 cerrada | ✅ **Cerrada (v20.2, etiqueta `v20.2`)** |
| 21 | [`fase21-spec.md`](docs/spec/fase21-spec.md) | F20 cerrada | ✅ **Cerrada y auditada (v21.2)** |
| 21.5 | [`fase21.5-spec.md`](docs/spec/fase21.5-spec.md) | F21 cerrada | ✅ **Cerrada y auditada (2026-08-20)** — la auditoría 2026-08-22 deriva sus fixes a la F21.6 |
| 21.6 | [`fase21.6-spec.md`](docs/spec/fase21.6-spec.md) | F21.5 cerrada | 🟠 **En curso (abierta 2026-08-22)** |
| 22 | [`fase22-spec.md`](docs/spec/fase22-spec.md) | **F21.6 cerrada** | 📝 Prospectiva |
| 22.1 | [`fase22.1-spec.md`](docs/spec/fase22.1-spec.md) | F21.6 cerrada (se abre tras la F22) | 📝 Borrador prospectivo |
| 23 | [`fase23-spec.md`](docs/spec/fase23-spec.md) | F22 cerrada | 📝 Prospectiva |
| 24 | [`fase24-spec.md`](docs/spec/fase24-spec.md) | F23 cerrada | 📝 Prospectiva |
| 25 | [`fase25-spec.md`](docs/spec/fase25-spec.md) | F24 cerrada | 📝 Prospectiva |
| 26 | [`fase26-spec.md`](docs/spec/fase26-spec.md) | F25 cerrada | 📝 Prospectiva (orden post-F25: F29→**F26**→F27→F28) |
| 26.5 | [`fase26.5-spec.md`](docs/spec/fase26.5-spec.md) | F26 + F24 cerradas | 📝 Prospectiva |
| 27 | [`fase27-spec.md`](docs/spec/fase27-spec.md) | F25 cerrada | 📝 Prospectiva (orden post-F25: F29→F26→**F27**→F28) |
| 27.5 | [`fase27.5-spec.md`](docs/spec/fase27.5-spec.md) | F27 cerrada | 📝 Prospectiva |
| 28 | [`fase28-spec.md`](docs/spec/fase28-spec.md) | F25 cerrada | 📝 Prospectiva (orden post-F25: F29→F26→F27→**F28**) |
| 29 | [`fase29-spec.md`](docs/spec/fase29-spec.md) | F25 cerrada | 📝 Prospectiva (orden post-F25: **F29**→F26→F27→F28) |

## Notas del grafo

- **F19.5 adelanta** a la F19.6 el motor 3D y a la F21 el audio por bioma
  (decisión de la entrevista 2026-08-15).
- **F22 aporta** los bloques de amatista que la **F21** reusa en su geoda
  (D2 de la F21).
- **F21.5 se inserta entre F21 y F22** (acordado 2026-08-15): absorbe la
  lista de mejoras del usuario (pesca, bloques 1.8-1.15, combate, Trial
  Chambers, 1.21.5 y 1.22 viables, comandos) reusando lo planificado en
  F21-23; **F22 pasa a exigir F21.5** en vez de F21. La serie en cadena
  21→21.5→22→23→24→25 no renumerar la 21-25 existente.
- **F21.6 se inserta entre F21.5 y F22** (creada 2026-08-22 desde la
  auditoría consolidada de cierre de la F21.5): fixes 1-7 + higiene +
  bloque de paridad MC aparte (escudo total, pesca 5-30 s…); **F22 pasa a
  exigir F21.6**. Sus diferidos (linterna/luz, bug cabezas de mobs,
  perfilado, pase servidor interno, residuos CL-*) viven en el borrador
  **F22.1**, que se abriría tras la F22.
- **F24/F25 desbloquean** el Won't "dimensiones" (Nether/End) al abrirse.
- **F20** (rolling release) solo exige la **F18 cerrada** (depende de 16/17,
  pero no de la 19 en curso).
- **Orden post-F25 (entrevista 2026-08-20):** F29→F26→F27→F28 (empezar
  por lo más fácil: modos/QoL, luego encantamientos, luego mundo, luego
  multijugador). F26.5 (pociones) va después de F26. F27.5 (mobs) va
  después de F27.
- **F27 incluye netherita condicionalmente:** solo si F24 está cerrada
  cuando se llega al Bloque D; si no, se posterga.
- **Branch por fase:** cada fase del post-F25 se trabaja en branch
  separada (`fase29-qol`, `fase26-enchants`, `fase27-world`,
  `fase27.5-mobs`, `fase28-multi`) y se fusiona a `main` al cerrar.
- **Cualquier cambio de prerequisito** debe actualizar este grafo, la spec,
  `STATUS.md`, `TODO.md` y `docs/README.md` en el mismo cambio.

## Cuellos de botella (gargantillas del plan)

1. **F19 → F19.5 → F19.6**: cadena lineal; 19.6 (motor 3D) no puede empezar
   hasta cerrar 19.5. Es el camino más largo antes de la 20.
2. **F20 → F21 → F21.5 → F22 → F23 → F24 → F25**: la cadena larga de
   features; cada fase desbloquea la siguiente.
3. **F20 exige F18 pero no F19**: la 20 podría avanzar en paralelo a la
   19/19.5/19.6 si se desea (decisión de planificación, no de código).
