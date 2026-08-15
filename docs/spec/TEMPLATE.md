# Plantilla de Spec (Fase N — Título de la fase)

> **Usa esta plantilla** para crear cualquier spec de una fase nueva.
> Las specs viven en `docs/spec/` (`faseN-spec.md`). Una spec es la
> **fuente de verdad** de su fase: qué se hizo, cómo, por qué y el
> resultado verificado (commits + tests + auditoría). No borres el
> estado histórico de una fase ya cerrada: añade contexto (ver §Cambios).
> El tracker de tareas (`[ ]`/`[x]`) vive solo en `TODO.md`.

---

## Cabecera (obligatoria)

```markdown
# Fase N — Título de la fase (Spec)

> **Estado:** `[COMPLETADA]` (o `[EN CURSO]` / `[PROSPECTIVA]` / `[ARCHIVADA]`)
> · **Fecha de inicio:** AAAA-MM-DD · **Fecha de cierre:** AAAA-MM-DD (si aplica)
> · **Prerrequisito:** Fase M cerrada (si aplica) · **Proyecto:** clon de Minecraft
> · **Spec creada a partir de:** `docs/Notas del usuario.md`, auditorías, entrevistas...
```

Los estados posibles son exactamente uno de:

- `[PROSPECTIVA]` — planificada, sin implementar (tareas en `TODO.md` en `[ ]`).
- `[EN CURSO]` — con tareas en `[x]` pero sin auditoría final (no marcar completa).
- `[COMPLETADA]` — todas las tareas `[x]` **y** auditoría final hecha y documentada.
- `[ARCHIVADA]` — cerrada hace tiempo, movida al historial (no se reabre).

> Al terminar una fase, actualiza aquí el estado y refleja el cierre en
> `STATUS.md`, `TODO.md` y `docs/README.md`.

---

## 1. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|

## 2. Contexto

Estado del proyecto al inicio de la fase, decisiones de la entrevista,
Won't respetados y fuentes consultadas.

## 3. Bloques de trabajo

### 3.N Tarea — descripción breve

- Qué se implementa y por qué (justificación de la decisión).
- Criterio de aceptación **verificable**.
- **Commits:** `corta1234` (AAAA-MM-DD) — resumen del commit.
  > Cada tarea referencia el/los commits donde se incluyó y la fecha.

## 4. Fuentes de verdad sincronizadas

Todo lo que exige actualizar AMBOS lados (`constants.js` ↔ `public/constants.js`,
`TOOL_DURABILITY` ↔ `DURABILITY`, skins, recetas, `SCHEMA_VERSION`...).

## 5. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/...` | ... |

> **Tests que cubren esta fase:** `tests/unit-faseN.js`, `tests/audit-faseN.js`, ...
> (vínculo bidireccional: cada test nuevo lleva `// Fase N, Bloque 3.N` al inicio)

## 6. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|

## 7. Criterios de aceptación + resultado verificado

Resultado real medido (números, presupuestos) — no solo el plan.

## 8. Cambios en esta spec

**Cambios en esta spec (v1):**
- AAAA-MM-DD: creación.

> Registro de versiones de la spec. Cada modificación posterior añade una
> línea con fecha y motivo (trazabilidad de *por qué* cambió).

---

## Cierre de fase (bloque opcional pero recomendado)

```markdown
## Cierre (AAA-MM-DD)

- **Commits clave:** `corta1234` (tarea), `corta5678` (auditoría) ...
- **Resultado de la auditoría:** suite unit X/X, E2E Y/Y, auditorías Z/Z,
  `biome` 0 errores, `node --check` limpio, verificación manual en navegador.
- **Lagunas conocidas / decisiones diferidas:** ...
```
