# Fase 19.5 — Skills del proyecto: audio ambiental por bioma, accesibilidad y refinamientos (Spec)

> **Estado:** `[EN CURSO]`

> Documento creado a partir de: `docs/Notas del usuario.md` (Mejoras:
> "Genera música lofi procedural diferente para cada bioma" e Importante:
> "Usar skills siempre que sea útil para el proyecto"), del borrador del
> usuario `fase19.5-spec.md` (Descargas), del estado real del código
> (F16/F17/F18) y de la entrevista con el usuario (2026-08-15).
> Fecha: 2026-08-15 · Proyecto: clon de Minecraft.
> Estado: **en curso** — iniciada tras el cierre de la Fase 19 (commit
> `acca3c9`, 2026-08-15); prerrequisito: **Fase 18 cerrada**
> y **Fase 19 cerrada** (las skills visuales pican sobre lo que la F19 deja
> listo; el audio por bioma no depende de la F19 pero se ejecuta en esta fase
> por orden acordado: texturas/UI primero, skills visuales después).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | `Notas del usuario.md` Mejoras + borrador F21 §5 (adelantado) | "Genera música lofi procedural diferente para cada bioma" — hoy la música generativa (F10) solo distingue **cave/warm/cold** por bloques bajo los pies (`public/player.js updateMusicContext`); extender a **contexto por bioma real** | F21 (Bloque E, borrador Descargas) | 🟠 |
| B1 | Borrador 19.5 §10 + entrevista (2026-08-15) | **Accesibilidad**: navegación por teclado completa, contraste del HUD, indicadores que no dependan solo del color, opción "reducir movimiento" — **mantener dentro con menor prioridad** (decisión del usuario) | Nuevo | 🟢 |
| C1 | Borrador 19.5 §8 + entrevista | **Auditoría del raycasting** (no rediseño): confirmar selección de candidatos razonable, 1 raycast por `pointermove` | Nuevo | 🟢 |
| D1 | Borrador 19.5 §9 + F19 (deja paneles unificados) | **Tokens de diseño** extraídos de lo que F19 unifique, reutilizables en paneles futuros | Nuevo | 🟢 |
| E1 | Borrador 19.5 §11 | **Higiene de servidor Node**: `SIGTERM` además de `SIGINT`, convención de niveles de log sobre `console.*`, repaso de validación/errores vs F16 C2/C3 | Nuevo | 🟢 |
| F1 | Entrevista (2026-08-15) | El **motor 3D** (iluminación, materiales, shaders, instancing, mipmapping, animación de mobs) **sale de esta fase** → fase independiente de riesgo técnico (F19.6). Aquí quedan solo las skills de bajo riesgo + audio + accesibilidad | Borrador F19.5 §2-7 → F19.6 | 🟠 |

**Fuera de esta fase (explícito, decisión del usuario 2026-08-15):**
- **Motor 3D** (HemisphereLight, MeshToonMaterial, shaders de agua/viento,
  InstancedMesh, mipmapping/anisotropía, animación de mobs): va a la
  **Fase 19.6** — "mucho trabajo que va a afectar al juego", riesgo técnico
  que se ejecuta después de las skills visuales.
- **Audio por bioma sí entra aquí** (adelantado de la F21, "gran mejora al
  proyecto").
- **Selector de skins NO entra** (ya implementado en F17 C3) y **"Editor de
  skins" pasa al Won't** (decisión del usuario: no hace falta por ahora).
- `seo` y `threejs-loaders`: evaluadas y rechazadas (ver Bloque E) — no
  aplican a un juego localhost/LAN sin assets ni build step.
- Won't del proyecto íntegro: redstone, dimensiones, clima,
  autenticación/BD externa, encantamientos/pociones, aldeas generadas.

---

## 1. Contexto

- **Prerrequisito:** Fase 18 cerrada (refactor cliente D-6/D-7/D-8 + docs F +
  cierre G en verde) y **Fase 19 cerrada** (cobertura de iconos + paneles +
  drag & drop + hot-reload + táctil; el Bloque D de tokens pica sobre los
  paneles que F19 deja unificados). Orden acordado con el usuario:
  **1) texturas/UI (F19) → 2) skills visuales (F19.5) → 3) riesgo técnico
  (F19.6 motor 3D)**.
- **Estado real verificado (2026-08-15, HEAD `204b7b7` + WIP del refactor
  cliente sin commitear):** la música generativa (F10, `public/audio.js:520-578`)
  ya produce un pad pentatónico ambiental (día brillante / noche grave) y el
  contexto cave/warm/cold se actualiza 1 vez/s desde `public/player.js
  updateMusicContext` (detecta: techo inmediato → cave; arena bajo los pies →
  warm; nieve/hielo → cold). El sistema de audio es **todo procedural**
  (Web Audio, sin samples). Para "música por bioma" real hace falta que el
  cliente conozca el bioma actual del jugador: hoy no hay `getBiome` en el
  cliente (solo heurística por bloque). Opciones: (a) derivar el bioma en el
  cliente con el mismo ruido compartido que el servidor (el refactor F18 D-3
  movió el ruido a `server/noise.js` — valorar exportarlo a un módulo cliente
  puro compartido), o (b) que el servidor mande el bioma del jugador en un
  evento ligero (`biome_update`) al cruzar chunks. **Se decide en la
  implementación con la opción más barata; criterio: la música cambia al
  cruzar a otro bioma, sin red en el peor caso** (patrón actual de
  `updateMusicContext`).
- **Decisiones de la entrevista (2026-08-15):**
  - Alcance: **skills no-motor + audio por bioma + accesibilidad**; nada de
    motor 3D (F19.6), nada de skins (F17), nada de contenido nuevo de
    biomas/mobs/estructuras (F21).
  - Accesibilidad: **dentro, con menor prioridad** (se hace tras lo
    principal).
  - Cada bloque implementado se evalúa explícitamente contra el principio
    rector del proyecto (JS vanilla, 0 dependencias, 0 assets, rendimiento
    primero): se adopta o se documenta "evaluado y rechazado" — no silencio.
  - Criterio de aceptación de la fase: **pasar todos los tests actuales** +
    las recomendaciones de verificación que la spec indique por bloque.
  - `SCHEMA_VERSION` intacto (6); protocolo WS solo si el bioma llega por red
    (evento nuevo retrocompatible, nunca cambio de formato).
- Fuentes: `docs/Notas del usuario.md`, borradores `fase19.5-spec.md` y
  `fase21-spec.md` (Descargas), `docs/spec/fase19-spec.md` (repo, prerrequisito),
  `docs/spec/fase18-spec.md` (§8 decisiones diferidas), `CLAUDE.md`/`AGENTS.md`
  (convenciones), `docs/README.md`, `TODO.md`.

---

## 2. Bloque A — Audio ambiental por bioma (adelantado de F21)

### A1 — Contexto musical por bioma real

- **Qué hacer:**
  - Ampliar el **contexto musical** de `public/player.js updateMusicContext`
    para distinguir **por bioma** (no solo cave/warm/cold por bloque): al
    menos llanura, bosque, taiga, desierto, nieve/tundra, montaña, pantano,
    jungla, océano, sabana (+ los biomas que existan al llegar). Mecanismo
    propuesto: (a) derivar el bioma en el cliente con un módulo de ruido puro
    compartido (reusar el patrón/ruido de `server/noise.js` extraído por la
    F18 D-3 — exportable a un `public/noise.js` puro testable), o (b) evento
    ligero del servidor (`biome_update { biome }` al cruzar de chunk);
    elegir el más barato y documentarlo.
  - En `public/audio.js updateMusic`: **paleta por bioma** — cada bioma con
    su escala/color: jungla (escala exótica, más notas), pantano (grave,
    disonante sutil), océano (ondulada, grave), montaña (vacía, espaciada),
    taiga/tundra (cristalina aguda — la actual `cold`), desierto (brillante
    — la actual `warm`), llanura/bosque (la pentatónica base). Mantener las
    variantes cave (sigue siendo la primera prioridad si hay techo).
  - Mantener el volumen colchón actual (~0.035, muy bajo) y la síntesis pura
    (sin samples): solo cambia la **selección de escala/tempo/registro**.
- **Ficheros:** `public/audio.js` (paletas), `public/player.js`
  (contexto), `public/noise.js` o `public/network.js` (origen del bioma),
  `server/net.js` o `server/world-session.js` (solo si se opta por
  `biome_update`), tests.
- **Criterio de éxito:** al cruzar de un bioma a otro, el carácter musical
  cambia de forma reconocible (verificación manual en navegador en 3+ biomas);
  la música en cueva sigue mandando sobre el bioma; unit de la lógica pura de
  paleta (escala por bioma determinista, sin `Math.random` no reproducible) si
  se extrae función pura; sin regresión de rendimiento (el contexto se
  actualiza 1 vez/s como hoy).

---

## 3. Bloque B — Accesibilidad (menor prioridad, se hace al final)

> Decisión del usuario: **mantenerla dentro de la fase, con menor prioridad**
> (tras A/C/D/E). No es bloqueo de cierre: si un criterio queda fuera por
> complejidad, se documenta "evaluado y diferido a F19.6/F20" en lugar de
> silenciarlo.

- [ ] B1 **Navegación por teclado completa en menús/paneles**: auditar cuáles
      la tienen hoy (inventario/libro desde F16) y cuáles no (cofre, horno,
      ajustes, menú de mundos, pausa); añadir Tab/Enter/Esc coherentes con
      foco visible.
- [ ] B2 **Contraste del HUD** sobre fondos claros (nieve, desierto) y
      oscuros (cuevas, lava): revisar barra de comida/salud/XP, coordenadas y
      tooltips; ajustar sombra/contorno sin romper la estética.
- [ ] B3 **Indicadores de estado no dependientes solo del color**: salud,
      hambre, oxígeno (o lo que aplique) con forma/ícono además de color (p.
      ej. icono de burbuja para oxígeno ya existe — verificar que el color no
      sea la única señal).
- [ ] B4 **Opción "reducir movimiento"** en ajustes (F17 A4): atenúa el bob
      de cámara y el efecto de FOV del sprint (F10/F15 D2); toggle en
      `mc_settings`; persistida como el resto (`public/settings.js`).
- **Ficheros:** `public/index.html`/CSS de los paneles, `public/ui.js`/hud/
  panels/recipebook (según el refactor D-6 de F18), `public/settings.js`
  (ajustes), `public/input.js`/game-input/menu-input (foco), docs de UI.
- **Criterio:** navegación por teclado en los 4+ paneles verificada en
  navegador; contraste visible en nieve/desierto/lava; ningún estado depende
  solo del color; el toggle "reducir movimiento" funciona y persiste.

---

## 4. Bloque C — Auditoría del raycasting (sin rediseño)

- **Qué hacer:** auditar `public/raycast.js` (o el módulo que el refactor F18
  deje): confirmar que la selección de candidatos es razonable (no recorre
  toda la escena por frame), que sigue habiendo **1 raycast por
  `pointermove`** (F13 M1) y que el highlight/retarget comparten resultado.
  Corregir solo lo que la auditoría detecte como real (sin rediseñar).
- **Ficheros:** `public/raycast.js`, `public/input.js` (si el pointermove
  dispara), `tests/unit-raycast.js` si existe o se crea con la mecánica a
  probar.
- **Criterio:** documentar en la spec de resultado el veredicto (OK o
  corrección aplicada); sin regresión en minar/apuntar/atacar (verificación
  manual + tests existentes en verde).

---

## 5. Bloque D — Tokens de diseño extraídos de la F19

- **Qué hacer:** tras la F19 (paneles unificados), extraer un **set mínimo de
  tokens** (espaciado, tipografía, paleta, biseles/bordes) a un módulo puro
  (`public/design-tokens.js` o CSS variables) y usarlo en el CSS de los
  paneles para que el código nuevo no repita valores sueltos. **Sin
  rediseñar** lo que F19 dejó: solo factorizar los valores ya existentes.
- **Ficheros:** CSS de los paneles, posible `public/design-tokens.js`
  (módulo puro, testable), docs de UI.
- **Criterio:** los valores repetidos de F19 quedan centralizados (grep de
  los 3-4 valores más usados apunta a la fuente); los paneles se ven
  idénticos (verificación manual); unit del módulo puro si aplica.

---

## 6. Bloque E — Higiene de servidor Node.js

- [ ] E1 **`SIGTERM`** además de `SIGINT` en `server/server.js`: mismo guardado
      limpio (autosave + salida ordenada). Test: matar con señal al servidor
      de E2E y confirmar que el mundo queda íntegro (o documentar que el
      autosave de 30 s ya cubre — verificar).
- [ ] E2 **Convención de niveles de log**: `console.log` → `info`, `console.warn`
      → `warn`, `console.error` → `error` con un prefijo uniforme
      (`[info]`/`[warn]`/`[error]`) — sin añadir dependencia de logging
      (regla del proyecto). El token lo parsea `tests/run.js`? Verificar que
      los resúmenes que el runner parsea no cambian.
- [ ] E3 **Repaso de validación/errores** vs F16 C2/C3 y las skills de Node:
      anotar brechas reales (no repetir lo ya cubierto). Entregable: una nota
      en la spec de resultado con las brechas encontradas y su corrección si
      procede.
- **Ficheros:** `server/server.js`, los módulos servidor con `console.*`
  (grep ~55 usos), `docs/server/README.md`.
- **Criterio:** señales SIGINT/SIGTERM salen con guardado íntegro; logs con
  nivel uniforme; `tests/run.js` sigue parseando sus resúmenes (suite verde).

---

## 7. Bloque F — Evaluaciones de skills documentadas (se adopta / se rechaza)

> Principio rector (borrador 19.5 §1): las skills dan prácticas genéricas que
> se evalúan contra los valores del proyecto. Cada una sin excepción deja una
> nota "se adopta" o "se evalúa y se rechaza" en esta spec (resultado).

| Skill del borrador | Veredicto (decisión 2026-08-15) | Dónde se ejecuta |
|---|---|---|
| `threejs-lighting` (HemisphereLight, luz de antorcha) | Se evalúa — **motor 3D** | F19.6 (Bloque A) |
| `threejs-materials` (MeshToonMaterial toggle) | Se adopta como **toggle en ajustes, NO predefinido** | F19.6 (Bloque B) |
| `threejs-shaders` (agua/viento) | Se evalúa | F19.6 (Bloque C) |
| `threejs-geometry` (InstancedMesh) | Se adopta **solo si la prueba de rendimiento lo justifica**, con toggle | F19.6 (Bloque D) |
| `threejs-textures` (mipmapping/anisotropía) | Se evalúa | F19.6 (Bloque E) |
| `threejs-animation` (caminar/atacar) | Se evalúa | F19.6 (Bloque F) |
| `threejs-interaction` (raycasting) | Se audita, no se rediseña | **Esta fase (Bloque C)** |
| `frontend-design` (tokens) | Se adopta | **Esta fase (Bloque D)** |
| `accessibility` | Se adopta, menor prioridad | **Esta fase (Bloque B)** |
| `nodejs-*` (SIGTERM/logging/validación) | Se adopta | **Esta fase (Bloque E)** |
| `seo` | **Rechazada** — juego localhost/LAN sin contenido indexable (documentado) | — |
| `threejs-loaders` (assets externos) | **Rechazada** — 0 assets/binarios (filosofía procedural) | — |

---

## 8. Bloque G — Tests, documentación y auditoría final

- [ ] Tests de la lógica pura que salga (paleta musical por bioma, tokens, y
      cualquier función extraída) — mismo patrón que `unit-dia.js`/
      `unit-ajustes.js` (módulos puros testables).
- [ ] Suite unitaria completa en verde, E2E clásicos 6/6 + menú 7/7,
      `node --check` y `biome check` 0 errores en lo tocado.
- [ ] Auditoría de Fase 19.5 obligatoria (verificación manual en navegador:
      música distinta en 3+ biomas, teclado en paneles, contraste, reducción
      de movimiento; señales del servidor; raycast sin regresión).
- [ ] Actualizar `docs/public/mecanicas.md` (audio por bioma, accesibilidad,
      tokens), `docs/server/mecanicas.md` (si toca SIGTERM/logging),
      `docs/server/README.md` (log), `docs/README.md` (índice), `AGENTS.md`
      (estado) y `TODO.md` (F19.5 cerrada).
- [ ] `SCHEMA_VERSION` sin cambios (6); protocolo WS solo si el bioma viaja
      por red (evento nuevo retrocompatible + test si aplica).

## 9. Criterios de aceptación (resumen)

1. **Todos los tests actuales pasan** (unit + E2E 6/6 + menú 7/7 + auditorías
   `--audit` 6/6 + `biome` 0) — criterio del usuario.
2. Música generativa **distinta por bioma** (verificado manual en 3+ biomas;
   la cueva sigue mandando) con síntesis pura sin samples.
3. **Accesibilidad** dentro con menor prioridad: teclado en paneles,
   contraste, indicadores no solo-color, toggle "reducir movimiento".
4. Raycasting auditado (veredicto documentado, sin rediseño innecesario);
   tokens de diseño extraídos; higiene de servidor (SIGTERM + niveles de log).
5. Cada skill del borrador con su nota **"se adopta" o "se evalúa y se
   rechaza"** (ninguna se silencia); el motor 3D queda correctamente
   referenciado a la F19.6.

> **Tests que cubren esta fase:** `tests/unit-fase19.5.js` (A1 ya implementado
> y registrado en `tests/run.js`), `tests/audit-fase19.5.js` (previsto).

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-15: creación del spec (documento de planificación de la fase 19.5).