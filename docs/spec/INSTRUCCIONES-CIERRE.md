# Formato para los bloques de cierre y versiones en las specs

## Contexto

Las specs viven en `docs/spec/faseN-spec.md`. Se está añadiendo a cada spec:
1. Un bloque de **cierre** al final del documento (para fases completadas).
2. Un bloque **"Cambios en esta spec"** con la versión.

Reglas:
- **NO borres ni modifiques contenido existente.** Solo AÑADES.
- Español, formato consistente con el resto del repo.
- No toques código (solo archivos .md).

## 1. Bloque "Cambios en esta spec"

Añade al final del documento (o tras la última sección), este bloque exacto:

```markdown
---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- AAAA-MM-DD: creación del spec (documento [retrospectivo/prospectivo/de
  planificación] de la fase N).
```

Si el spec menciona fechas de actualización en su cabecera (p. ej. la
fase18 dice "última actualización 2026-08-15"), añade una línea v2:
```markdown
**Cambios en esta spec (v2):**
- AAAA-MM-DD: reorganización de docs — spec movida a `docs/spec/`,
  referencias de rutas actualizadas, añadido bloque de cierre con commits.
```

## 2. Bloque de cierre (solo fases COMPLETADAS)

Añade ANTES del bloque "Cambios en esta spec" (es decir, como última
sección temática del spec), para las fases `[COMPLETADA]`:

```markdown
## Cierre de la fase

- **Fecha de cierre:** AAAA-MM-DD
- **Commits clave:**
  - `abc1234` (AAAA-MM-DD) — resumen del commit (tarea X)
  - ...
- **Resultado de la auditoría:** (números reales que ya documenta la spec:
  suite unit, E2E, auditorías, biome, node --check)
- **Lagunas conocidas / decisiones diferidas:** (si la spec las menciona)
```

Usa SOLO los commits y fechas que te proporcione el subagente/la instrucción
para cada fase. No inventes commits.

## 3. Referencias a commits por tarea

Si el spec tiene una sección de tareas/bloques y NO menciona ya los commits,
añade al final de CADA bloque de tarea la línea:

```markdown
> **Commits:** `abc1234` (AAAA-MM-DD) — resumen.
```

Solo si tienes el commit exacto para esa tarea. Si el bloque ya menciona
commits, no lo dupliques.

## 4. Vínculo con tests

En la sección "Archivos implicados" (o donde corresponda), asegura que exista
una línea:

```markdown
> **Tests que cubren esta fase:** `tests/unit-faseN.js`, `tests/audit-faseN.js`, ...
```

Usando los tests reales de la fase (los encontrarás en `tests/`). No inventes
nombres de tests; si el spec ya los menciona, úsalos.
