# Fase 27 — Mundo y exploración ampliados (Spec)

> Documento creado a partir de: `docs/spec/fase27-spec.md` (borrador
> original), entrevista con el usuario (2026-08-20), `Notas del
> usuario.md` y `docs/audits/auditoría-2026-08-18.md`.
> Fecha: 2026-08-20 · Proyecto: clon de Minecraft.
> Estado: **EN CURSO** (tercera fase del orden post-F25).
> Prerrequisito: Fase 25 (End) cerrada. Independiente de F26/F26.5.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A | Borrador F27 + entrevista | Altura del mundo a 256 (experimental) | `[ ]` | — |
| B | Borrador F27 + entrevista | Mundo más allá de 8192 (experimental) | `[ ]` | — |
| C | Borrador F27 + auditoría 2026-08-18 | Contenido de mundo faltante (pulpo/calamar) | `[ ]` (F27.5) | — |
| D | Borrador F27 + entrevista | Netherita (condicional a F24 cerrada) | `[ ]` | — |
| E | Borrador F27 | Bloques decorativos restantes (losas/escaleras/vallas) | `[ ]` | — |
| F | Notas del usuario | Bugs abiertos: ríos altos, océanos poco profundos, montañas bajas | `[ ]` (F21.5 D1/D2/D3 ya los cubrió) | — |
| G | Entrevista 2026-08-20 | 256 + más tamaño horizontal — ambos experimentales | — | Decisión |
| H | Entrevista 2026-08-20 | Netherita solo si F24 está cerrada | — | Decisión |
| I | Entrevista 2026-08-20 | Branch por fase (`fase27-world`) | — | Flujo |

## 1. Contexto

- **La altura del mundo es el ítem de mayor riesgo real de esta fase.**
  El mundo sigue en 128 bloques (Y −64..+63) desde la Fase 15 D5.
  Subir a 256 (Y −64..+191) toca generación, guardado, LOD, greedy
  meshing y potencialmente el rendimiento del cliente — por eso es
  **experimental obligatorio** (toggle, no activado por defecto).
- **No duplicar generación ya cerrada.** La Fase 21.5 ya implementó
  D1 (Trial Chambers pendientes), D2/D3 (océanos cálidos/profundos
  y montañas altas). Antes de escribir contenido nuevo, auditar contra
  `STATUS.md` qué queda genuinamente pendiente.
- **Netherita depende de F24 cerrada.** Si F24 no está lista cuando se
  llega al Bloque D, se posterga sin bloquear el resto de la fase.
- El borrador original mencionaba biomas/cuevas "ya en F21/F23, se
  pueden ampliar" — esta fase NO reabre lo cerrado, solo completa lo
  que la auditoría confirme como genuinamente pendiente.

## 2. Bloque A — Altura del mundo a 256 (experimental)

**Qué hacer exactamente:**

- **Auditar constantes:** buscar en `server/` y `public/` todas las
  referencias hardcodeadas a `WORLD_MAX_Y` (actualmente 63) y
  `WORLD_MIN_Y` (actualmente −64). Crear constantes centralizadas si
  no existen, y reemplazar todos los magic numbers.
- **Extender generación:** en `server/generation.js`, permitir que
  `generateChunk` genere terreno hasta Y=191 (nuevo techo). Cuevas,
  minerales y árboles deben respetar el nuevo rango.
- **Detrás de un ajuste experimental:** añadir `experimentalHeight`
  en `world.json` (boolean, default `false`). Solo genera hasta 256
  si está activado. El cliente ajusta su LOD y render distance acorde.
- **SCHEMA_VERSION:** subir a 7 solo si coexisten mundos de ambas
  alturas (128 y 256). Migración retrocompatible: mundos v6 sin
  `experimentalHeight` se tratan como 128 bloques.
- **Medir rendimiento:** FPS mínimo, memoria máxima, tiempo de
  generación de chunk — con LOD y greedy meshing ya existentes. Si
  degrada de forma notable, queda como opción experimental permanente.

**Ficheros implicados:**
- `server/constants.js` — `WORLD_MAX_Y`, `WORLD_MIN_Y` centralizados
- `server/generation.js` — extender generación al nuevo rango
- `server/world.js` — validar límites nuevos
- `server/save-chunks.js` — guardado con chunks más altos
- `public/chunkstore.js` — ajustar LOD para chunks más altos
- `public/meshbuild.js` — greedy meshing con chunks más altos
- `tests/audit-altura.js` — recalibrar para ambos rangos

**Criterio de éxito:**
- Test: generar chunk con altura 256, verificar que terreno/cuevas/
  minerales llegan hasta Y=191. Medir rendimiento y documentar.

## 3. Bloque B — Mundo más allá de 8192 (experimental)

**Qué hacer exactamente:**

- **Auditar límites:** el límite actual de tamaño de mundo está en
  `server/constants.js` (`WORLD_SIZE` o similar). Verificar que el
  guardado por chunk (Fase 1) escala sin cambios estructurales.
- **Extender detrás de toggle:** añadir `experimentalSize` en
  `world.json` (boolean, default `false`). Si activado, permitir
  coordenadas más allá de ±8192.
- **Confirmar guardado:** que `save-chunks.js` maneje claves de chunk
  con coordenadas grandes sin corromper archivos.
- **Medir rendimiento:** mismo enfoque que el Bloque A — documentar
  impacto antes de considerar activarlo por defecto.

**Ficheros implicados:**
- `server/constants.js` — límites de tamaño de mundo
- `server/world.js` — validar coordenadas extendidas
- `server/save-chunks.js` — manejar claves de chunk grandes
- `public/chunkstore.js` — LOD con distancias mayores

**Criterio de éxito:**
- Test: generar chunks más allá de ±8192, guardar y cargar sin
  corrupción. Medir rendimiento y documentar.

## 4. Bloque C — Netherita (condicional a F24)

**Qué hacer exactamente:**

- **Solo si F24 (Nether) está cerrada** cuando se llega a este bloque.
  Si no, postergar sin bloquear el resto de la fase.
- **Mineral `ANCIENT_DEBRIS`** (nuevo B): genera en el Nether en
  bandas raras (Y 10-20, como MC real). Solo se obtiene con pico de
  diamante o netherite.
- **Ítem `NETHERITE_SCRAP`** (nuevo B/I): drop de Ancient Debris al
  fundirlo en horno.
- **Ítem `NETHERITE_INGOT`** (nuevo B/I): crafteo = Netherite Scrap ×
  4 + Lingote de oro × 4.
- **Mejora de equipo:** Netherite Ingot + herramienta/armadura de
  diamante → versión netherite (misma mecánica queupgrade de MC:
  conserva encantamientos si F26 ya existe).
- **Bloques decorativos:** Bloque de Netherite (B/I), ladrillos de
  Netherite (B/I) — estáticos, decorativos.

**Ficheros implicados:**
- `server/constants.js` — `B.ANCIENT_DEBRIS`, `I.NETHERITE_SCRAP`,
  `I.NETHERITE_INGOT`, `B.NETHERITE_BLOCK`, `B.NETHERITE_BRICKS`
- `server/generation.js` — generación de Ancient Debris en el Nether
- `server/players.js` — lógica de upgrade (si F26 existe, conservar
  encantamientos)
- `server/crafting.js` — recetas de Netherite Scrap/Ingot/upgrade
- `public/constants.js` — sync B/I
- `public/textures.js` — texturas de Ancient Debris y Netherite
- `recetas.json` — recetas

**Criterio de éxito:**
- Test: Ancient Debris genera en el Nether, funde a Scrap, Scrap +
  oro = Ingot, Ingot + diamante = netherite (conserva encantamientos).

## 5. Bloque D — Contenido de mundo faltante

**Qué hacer exactamente:**

- **Auditar qué falta:** revisar `STATUS.md`, `TODO.md` y las specs
  de F21-F23 para confirmar qué biomas/estructuras/mobs quedaron
  sin implementar. No asumir que "falta ampliar" sin verificar.
- **Completar solo lo confirmado** como pendiente. Ejemplos posibles:
  - Bloques de decoración que faltan (losas/escaleras/vallas por
    tipo de madera).
  - Biomas simples que faltan (sabana con acacia, bosque oscuro).
  - Cualquier mob pasivo pendiente que no esté en otra fase.
- **NO reabrir** lo ya cerrado en F21-F23 (biomas, estructuras,
  mobs que ya están implementados y auditados).

**Criterio de éxito:**
- Lista explícita de qué se implementa (auditada contra código), con
  test por cada elemento nuevo.

## 6. Bloque E — Tests, documentación y auditoría

- [ ] Tests deterministas de generación para el nuevo rango de altura
      (mismo patrón que biomas/estructuras existentes).
- [ ] Tests de rendimiento con umbrales explícitos (FPS mínimo,
      memoria máxima) antes de considerar la altura/mundo ampliado
      listos para salir de "experimental".
- [ ] Test de Netherite (si F24 está cerrada): generación, fundición,
      upgrade, conservación de encantamientos.
- [ ] Actualizar `docs/server/mecanicas.md`, `docs/public/mecanicas.md`,
      `TODO.md`, esta spec.

## 7. Fuera de alcance de esta fase

- Generación del Nether/End en sí (ya cerrada en F24/F25).
- Acuíferos u otros sistemas de generación complejos no pedidos.
- Altura a 384 (MC moderno) — se queda en 256 como máximo.
- Cualquier "Fuera de alcance" ya establecido del proyecto.

## 8. Cierre y auditoría de la fase (obligatoria)

- [ ] Suite completa de tests en verde.
- [ ] `node --check` limpio en todos los archivos modificados.
- [ ] E2E de mundo ampliado (generar chunk alto, guardar/cargar,
      transitar a chunks altos/bajos).
- [ ] Auditoría de Fase 27: **foco en rendimiento** (comparar coste
      de tick, FPS y memoria antes/después de activar la altura 256).
      Verificar que Netherite no rompe la progresión existente.
- [ ] Actualizar `docs/README.md`, `AGENTS.md`, `STATUS.md`,
      `TODO.md` y esta spec.

## 9. Criterios de aceptación (resumen)

1. Altura y tamaño de mundo ampliados, funcionando como opción
   experimental con medición de rendimiento documentada.
2. Netherite funcional (si F24 está cerrada) sin romper la
   progresión existente.
3. Contenido de mundo faltante verificado contra huecos reales.
4. Suite unitaria + E2E en verde, `biome check` 0 errores.
5. Auditoría de Fase 27 obligatoria (foco: rendimiento real).

## 10. Flujo de trabajo

- **Branch:** `fase27-world` (creada desde `main` al cerrar F25).
- **Merge a `main`:** solo al cerrar la fase.
- **Tags:** `v27.0` al cerrar.
