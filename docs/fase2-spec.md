# Fase 2 — Identidad sensorial (Spec)

> Documento de especificación de la Fase 2, **reconstruido a posteriori**: la
> fase está COMPLETADA y auditada. Se elabora a partir del `TODO.md` (sección
> Fase 2 con su auditoría) y del historial de git, en el mismo formato que
> `fase8-spec.md` / `fase9-spec.md`.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA (agosto 2026)** · Proyecto: clon de
> Minecraft (servidor Node autoritativo `server/` + cliente Three.js
> `public/`, todo en español).

---

## 1. Resumen

La Fase 2 da al juego su **identidad sensorial**: que se vea y suene
reconociblemente Minecraft. Tres pilares, todos **procedurales, sin assets
binarios ni build step** (filosofía del proyecto):

1. **Atlas de texturas** 16×16 px por cara, estilo pixel-art, generado en un
   canvas (`public/textures.js`), que sustituye los colores planos por bloque.
2. **Sonidos básicos** con Web Audio API (`public/audio.js`): romper/colocar
   bloque, pasos y ambiente de día/noche, todo generado en runtime.
3. **Ciclo día/noche visual real**: color de cielo e intensidad de luz solar
   interpolados con el reloj del servidor.

**Resultado:** la fase se cerró con auditoría en verde: generación del
servidor a 2.36 ms/chunk (radio 6, 169 chunks) y 0.52 ms en cache; render en
Chrome headless (SwiftShader) estable a 148-176 FPS en escena reducida y
estable en la escena completa de 439 chunks (310K triángulos); 0 teselas/UVs
inválidas y 0 errores de consola.

---

## 2. Contexto del proyecto (estado al inicio, verificado)

Tras la Fase 1 (cimientos técnicos), el juego ya tenía:

- Persistencia por chunk con versionado, descarga de chunks lejanos y
  arquitectura modular (cliente ES6, servidor CJS).
- **Pero el aspecto era plano**: bloques de colores sólidos (sin texturas),
  sin sonidos y con un día/noche visual básico o inexistente.

**Problemas que motivaban la fase:** sin texturas el mundo no parece
Minecraft; sin sonidos no hay feedback de romper/colocar/caminar; sin ciclo
visual no hay inmersión ni guía de la fase del día (que el servidor ya
conocía).

---

## 3. Objetivos

1. Atlas de texturas procedural simple (16×16 por cara) que reemplace los
   colores planos, con `NearestFilter` para el look pixel-art.
2. UV mapping por cara en `buildChunkGeometry`, agrupando por textura en vez
   de por color, **sin romper el culling de caras** existente.
3. Sonidos procedurales de bloques, pasos y ambiente guiados por la fase del
   ciclo.
4. Ciclo día/noche visual sincronizado con el reloj del servidor.
5. Auditoría de rendimiento del atlas/UVs y de los sonidos.

---

## 4. Bloques de trabajo

### B1. Atlas de texturas procedural

- **`public/textures.js`**: atlas único de teselas 16×16 px generadas
  proceduralmente en un `canvas` (motas, veteado, bisel), **sin assets
  binarios ni build step**.
- Una única `CanvasTexture` **compartida** con `NearestFilter` (look
  pixel-art nítido).
- Cada bloque tiene tesela por cara (top/bottom/lados) — 19 bloques × 6 caras
  verificados en la auditoría (0 teselas/UVs inválidas).

### B2. UV mapping en `buildChunkGeometry`

- Cada cara elige su tesela (top/bottom/lados) con UVs del atlas.
- El agrupamiento pasa de **por color** a **por textura** (draw calls por
  textura, no por color).
- El culling de caras entre chunks debe seguir funcionando (la auditoría lo
  verificó con 0 caras ocultas dibujadas).

### B3. Sonidos procedurales (Web Audio API)

- **`public/audio.js`**, sin assets: contexto desbloqueado en el primer
  gesto del usuario.
- Romper/colocar bloque con tono según material; **pasos** con alternancia de
  tono; **ambiente continuo** de viento + pájaros (día) / grillos (noche),
  guiado por la misma fase del ciclo que la luz.
- Volúmenes por categoría (la Fase 7 añadirá los sliders).

### B4. Ciclo día/noche visual

- El servidor es la fuente de verdad del `dayTime`; el `init` lo envía y el
  cliente lo extrapola con `performance.now()` (`public/daynight.js`).
- Interpolación de cielo, luz solar, ambiente y niebla según la fase.

### B5. Auditoría de Fase 2

Medir el impacto en rendimiento de cargar el atlas y aplicar UVs (FPS con
varios chunks visibles); confirmar que las texturas no rompen el culling de
caras.

---

## 5. Fuentes de verdad sincronizadas (introducidas aquí)

- **Ciclo día/noche**: `DAY_CYCLE_MS` en AMBOS `constants.js` (servidor y
  cliente) — lo audita `tests/unit-sync.js` (paridad). El servidor envía
  `dayTime` en el `init`; el cliente extrapola.
- **Teselas del atlas**: layout en `public/textures.js`; el hot-reload del
  atlas (Fase 6) reimporta este módulo con cache-busting.

---

## 6. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `public/textures.js` | (nuevo) atlas procedural + teselas por bloque/cara |
| `public/world.js` | UV mapping por cara en `buildChunkGeometry`, agrupado por textura |
| `public/audio.js` | (nuevo) sonidos procedurales: bloques, pasos, ambiente día/noche |
| `public/daynight.js` | (nuevo) extrapolación del ciclo + interpolación de cielo/luz/niebla |
| `public/scene.js`, `public/player.js` | uso de la luz/ambiente del ciclo |
| `public/index.html` | carga de los nuevos módulos (importmap) |
| `public/debug.js` | contador de FPS persistente en el HUD (`#fps`, métricas `window.__mc*`) — añadido de paso, útil para auditorías futuras |

---

## 7. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|
| 1 | Texturas | Procedurales en canvas, sin assets binarios ni build step; `NearestFilter` para pixel-art |
| 2 | Sonido | Web Audio API procedural; contexto desbloqueado en el primer gesto |
| 3 | Reloj visual | El servidor manda el `dayTime`; el cliente extrapola con `performance.now()` |
| 4 | Rendimiento | Atlas único compartido + agrupado por textura; auditoría de FPS obligatoria al cerrar |

---

## 8. Plan de la Fase 2 (orden de ejecución)

1. Atlas procedural (B1) + UV mapping (B2).
2. Sonidos (B3).
3. Ciclo día/noche visual (B4).
4. Auditoría de rendimiento (B5).

---

## 9. Riesgos y notas

- **El atlas no debe romper el culling de caras**: el agrupado por textura
  cambia los buffers; la auditoría debe verificar 0 caras ocultas dibujadas y
  0 huecos.
- **Three.js desde CDN**: si unpkg es inalcanzable (red del entorno), hay que
  servir `three.module.js` local y mapearlo en el importmap (lección
  aprendida en la auditoría de Fase 2 y reutilizada en las de Fase 4 y 6).
- **La medición de FPS es conservadora** (SwiftShader, render por software);
  los números sirven como cota inferior, no como cifra absoluta.
- La degradación del sonido procedural medida fue ≈2.8% (ruido de medición);
  `updateAmbient` cuesta 0.02-0.64 ms/frame.

---

## 10. Criterios de aceptación + resultado verificado

1. Los bloques muestran texturas 16×16 pixel-art en lugar de colores planos,
   con la tesela correcta por cara.
2. Romper/colocar/caminar producen sonido; el ambiente cambia entre día y
   noche.
3. El cielo y la luz siguen la fase del día sincronizada con el servidor.
4. Sin regresión de rendimiento (auditoría de FPS) ni de culling de caras.

**Estado: COMPLETADA.** Auditoría (agosto 2026): benchmark de generación del
servidor 2.36 ms/chunk (169 chunks, radio 6) y 0.52 ms en cache. FPS en
Chrome headless vía CDP (SwiftShader): escena reducida de 25 chunks →
148-176 FPS con y sin audio (degradación del sonido ≈2.8%, ruido de
medición); escena completa de 439 chunks (310K triángulos) estable. 0
teselas/UVs inválidas (19 bloques × 6 caras) y 0 errores de consola. De paso
se añadió el contador de FPS persistente al HUD.
