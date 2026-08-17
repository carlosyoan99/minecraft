# Fase 19.6 — Motor 3D: iluminación, materiales, shaders, instancing, texturas y animación (Spec)

> **Estado:** `[COMPLETADA]`

> Documento creado a partir de: el borrador del usuario `fase19.5-spec.md`
> (Descargas, Bloques A-F: iluminación, materiales, shaders, geometría,
> texturas, animación) y de la entrevista con el usuario (2026-08-15), que
> decidió **mover el motor 3D a una fase independiente** ("es mucho trabajo
> que va a afectar al juego" — riesgo técnico que se ejecuta después de las
> skills visuales).
> Fecha: 2026-08-15 · Proyecto: clon de Minecraft.
> Estado: **completada (2026-08-16)** — prerrequisito: **Fase 19.5
> cerrada** (skills no-motor + audio + accesibilidad). Orden acordado:
> **1) texturas/UI (F19) → 2) skills visuales (F19.5) → 3) riesgo técnico
> (esta fase, F19.6) → 4) rolling release (F20)**. Cierre con auditoría
> 2026-08-15 (correcciones §10) y verificación completa en `STATUS.md`.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado previo | Gravedad |
|---|--------|-------------------|---------------|----------|
| A1 | Borrador 19.5 §2 + entrevista | **Iluminación**: `HemisphereLight` (gradiente cielo/suelo, costo casi nulo) además del `AmbientLight` plano; luz puntual limitada en antorchas cercanas (con presupuesto coordinado con F20) | Hoy solo `AmbientLight` + un `DirectionalLight` (`public/scene.js`) | 🟠 |
| B1 | Borrador 19.5 §3 + entrevista | **Materiales**: `MeshToonMaterial` como **toggle en ajustes, NO predefinido** (mantener `MeshLambertMaterial` por defecto); **no** migrar a PBR/Standard | Todo usa `MeshLambertMaterial` | 🟢 |
| C1 | Borrador 19.5 §4 | **Shaders**: agua animada (offset por tiempo, patrón ya probado en `public/sky.js`); vaivén de viento en vegetación cross-mesh (vertex shader) | Agua estática (`drawWater` en `textures.js`); vegetación estática | 🟠 |
| D1 | Borrador 19.5 §5 + entrevista | **InstancedMesh** para vegetación/partículas: **probar; si la medición lo justifica, se adopta con toggle** | No se usa `InstancedMesh` | 🟡 |
| E1 | Borrador 19.5 §6 | **Texturas**: mipmapping/anisotropía del atlas (nitidez a distancia); confirmar `dispose()` de texturas al descargar chunks (geopool) sigue intacto | Atlas existe, configuración de filtrado no auditada | 🟡 |
| F1 | Borrador 19.5 §7 | **Animación de mobs**: ciclo de caminata (balanceo por trigonometría, sin skeletal) + ataque básico | Mobs con partes de caja estáticas | 🟢 |
| G1 | Entrevista (2026-08-15) | **Regla dura**: cualquier bloque que degrade el rendimiento notablemente se deja **detrás de un toggle** (ajuste opcional), nunca se activa por defecto | — | 🔴 |

**Fuera de esta fase (explícito):**
- **Nada de mecánicas de juego**: solo motor visual 3D. Sin bloques/ítems/
  mobs nuevos, sin cambios de protocolo ni de guardado.
- **`seo`/`threejs-loaders`**: rechazadas en la F19.5 (documentado, no se
  reabren).
- **Post-procesado** (bloom, DOF, etc.): no planteado por ninguna skill y
  contradice el enfoque de rendimiento → evaluado y rechazado por defecto si
  alguien lo propone aquí (documentar, no implementar).
- Won't del proyecto íntegro (redstone, dimensiones, clima, autenticación,
  encantamientos, aldeas).

---

## 1. Contexto

- **Prerrequisito:** F19.5 cerrada (las skills visuales de bajo riesgo ya
  aplicadas; el audio/bioma y la accesibilidad dan la base UX). Esta fase toca
  el **motor de render**, el código más sensible del juego: por eso es
  independiente y de riesgo técnico, con medición de rendimiento obligatoria
  antes/después de cada bloque.
- **Estado real verificado (2026-08-15):** `public/scene.js` configura
  `AmbientLight` + `DirectionalLight`; todos los materiales del mundo (excepto
  cielo/agua/clouds, que ya usan `ShaderMaterial`) son `MeshLambertMaterial`;
  el atlas de texturas se genera en canvas (`public/textures.js`) con
  `NearestFilter` (look pixel-art); la geometría de chunks ya está optimizada
  (greedy meshing + worker + geopool, F13/F14); los mobs son `MOB_PARTS`
  estáticos; la vegetación usa cross-meshes.
- **Decisiones de la entrevista (2026-08-15):**
  - Esta fase es **independiente** de la F19 y de la F19.5 en numeración
    (19.6) y se ejecuta **después** de ambas.
  - `MeshToonMaterial`: toggle en ajustes, **no es la opción predefinida**.
  - `InstancedMesh`: **testear primero; si funciona bien (mejora medible de
    draw calls/FPS), se agrega con toggle**.
  - Accesibilidad ya quedó en F19.5; aquí no se toca.
  - Cada bloque nuevo se activa por defecto **solo si no degrada** el
    rendimiento medible (regla dura del usuario); si degrada, queda detrás de
    un ajuste opcional.
  - `SCHEMA_VERSION` intacto (6); protocolo WS intacto; IDs B/I intactos.
- Fuentes: borrador `fase19.5-spec.md` (Descargas), `docs/spec/fase19.5-spec.md`
  (Fase anterior, matriz de skills), `docs/spec/fase17-spec.md` (ajustes A4),
  `CLAUDE.md`/`AGENTS.md` (convenciones), `docs/README.md`, `TODO.md`.

---

## 2. Bloque A — Iluminación

### A1 — HemisphereLight (gradiente cielo/suelo)

- **Qué hacer:** añadir un `HemisphereLight` (color cielo arriba, color
  suelo abajo) en `public/scene.js` junto al `AmbientLight` actual,
  intensidad conservadora. Es el cambio de menor riesgo y mayor ganancia
  visual del bloque (el AmbientLight plano actual aplana el volumen).
  Medir FPS con la escena típica antes/después (target: sin impacto o <1%).
- **Ficheros:** `public/scene.js`; verificación manual + medición
  (`window.__mcRenderFps` o F3).
- **Criterio:** volumen visual al aire libre mejorado (verificación manual) y
  sin degradación medible; si degrada >2%, se reduce intensidad o se deja
  detrás de toggle.

### A2 — Luz puntual limitada en antorchas (evaluación con presupuesto)

- **Qué hacer:** evaluar luz puntual real (`PointLight`) **solo en antorchas
  dentro de un radio corto del jugador** (no todas las del mundo), con un
  presupuesto máximo de luces activas (p. ej. 4-6) y coordinado con la F20
  (que maneja presupuestos de rendimiento). La iluminación por bloque actual
  (AO + luz de antorcha horneada en el atlas por celda, F14 M4) se MANTIENE:
  este punto es un extra de render, no un reemplazo.
- **Ficheros:** `public/scene.js`, `public/lighting.js` (si aloqua luz),
  `public/world.js`/chunkstore (lista de antorchas).
- **Criterio:** si la medición muestra que el PointLight degrada más allá del
  presupuesto (FPS con 4-6 luces), el bloque se documenta **"evaluado y
  rechazado"** (no se activa); si queda dentro de presupuesto, se activa como
  opción de calidad alta (toggle), nunca por defecto en el perfil bajo.

---

## 3. Bloque B — Materiales: MeshToonMaterial como toggle (NO predefinido)

- **Qué hacer:** opción "Material toon" en ajustes (F17 A4, `mc_settings`):
  al activarla, los materiales del mundo/végetación/mobs usan
  `MeshToonMaterial` (look "por bandas", coherente con lo blocky); al
  desactivarla (defecto), se mantiene `MeshLambertMaterial`. Implementar como
  **swap de material con reutilización del geopool** (no recrear pools por
  toggle): el `chunkWorker` ya genera la geometría; el material se intercambia
  en el `geoPool`/malla. **No** migrar a `MeshStandardMaterial`/PBR (documentado:
  contradice el rendimiento sin beneficio claro en bloques con luz plana).
- **Ficheros:** `public/scene.js` (fábrica de material), `public/settings.js`
  (toggle persistido), `public/geopool.js` o donde se asignen materiales,
  `public/index.html`/CSS (opción en Ajustes → Video).
- **Criterio:** el toggle funciona en caliente (activa/desactiva sin
  reiniciar), persiste en `mc_settings`, y el perfil por defecto sigue
  siendo `MeshLambertMaterial`; unit del ajuste (`unit-ajustes.js` ampliado).

---

## 4. Bloque C — Shaders

### C1 — Agua animada (offset de textura por tiempo)

- **Qué hacer:** en el material del agua (hoy estático en `textures.js`
  `drawWater`), aplicar el patrón ya probado de `public/sky.js`
  (`ShaderMaterial` con `uniform` de tiempo): desplazar/scrollar la textura
  del agua en el fragment shader según `performance.now()`/tiempo de escena.
  Sin reflejos complejos ni refracción (fuera de presupuesto). Mantener
  transparencia y culling de agua actuales.
- **Ficheros:** `public/textures.js` o el módulo de agua (`public/water.js`
  si existe), `public/scene.js` (si el material lo compone), `public/sky.js`
  (patrón, no se toca).
- **Criterio:** el agua se ve animada (vaivén sutil) con costo medible <1-2%
  de FPS (medición); sin romper `audit-fase3`/`audit-fase7` (render CDP).

### C2 — Vaivén de viento en vegetación cross-mesh

- **Qué hacer:** vertex shader simple en las cross-meshes de hierba/flores/
  plantas (33-35): desplazamiento del vértice por una onda en `x/z` según
  tiempo y posición (fase por celda para que no bailen todas a la vez).
  Limitar el efecto a las plantas "altas" (hierba/vegetación), no a troncos
  ni bloques sólidos. Sin per-vertex costoso: 1-2 senos, sin sombras.
- **Ficheros:** `public/chunkGeometry.js` o `public/chunkWorker.js` (si las
  cross-meshes se generan ahí), `public/*.js` del material de vegetación.
- **Criterio:** vegetación con vaivén sutil en viento (manual), costo
  medible bajo, sin regresión en los tests de greedy/workers en verde.

---

## 5. Bloque D — InstancedMesh (probar; si mejora, toggle)

- **Qué hacer:** prototipar `InstancedMesh` para la vegetación repetida
  (cross-meshes de hierba/flores) y, si aplica, partículas. **Medir draw
  calls y FPS antes/después** en una escena con mucha vegetación (p. ej.
  radio de render alto en llanura/jungla). Decisión documentada: si la
  medición muestra mejora real (draw calls reducirse y FPS estable), se
  adopta **detrás de un toggle** (opción de calidad alta); si la mejora es
  marginal (<5-10% de draw calls) o el instancing complica el LOD/geopool sin
  beneficio claro, se documenta "evaluado y rechazado" (el grep del borrador
  ya anticipaba que la vegetación cross-mesh es el candidato, no los
  bloques del mundo que ya están optimizados con greedy).
- **Ficheros:** `public/world.js` (vegetación), `public/chunkWorker.js`
  (si genera instancias), `public/geopool.js` (reuso), `public/settings.js`
  (toggle si se adopta); medición en `docs/spec/fase19.6-spec.md` (resultado).
- **Criterio:** medición antes/después documentada; adopción con toggle solo
  si la mejora es medible; rechazo documentado si no; suite en verde.

### Resultado (decisión documentada 2026-08-16): **evaluado y rechazado**

**Análisis de estado antes de prototipar:**
- La vegetación (hierba/flores/trigo) ya se **fusiona por chunk**: el
  `chunkWorker` escribe un único buffer `plant` (categoría `plant` del
  geopool, F19.6 C2) y `groupFromBuffers` (F13/F14) emite **una sola malla
  con un único draw call por chunk**, no un `Mesh` por planta. Con un radio
  de render típico (5-7 chunks) hay del orden de **decenas** de draw calls de
  plantas, no cientos.
- El instancing solo reduciría el conteo si hubiera **una instancia/planta**
  (varios miles de meshes). Ese supuesto no se da: ya hay 1 mesh + 1 draw
  call por chunk, y su geometría se reusa vía geopool.
- El coste por planta no es el draw call, sino el **vertex shader de viento**
  (F19.6 C2) y la rasterización de las 2 caras cross-mesh; `InstancedMesh`
  no los reduce (misma geometría, misma cantidad de vértices dibujados).

**Veredicto:** el instancing es innecesario porque la fusión por chunk ya dio
el resultado que un InstancedMesh buscaría (pocos draw calls estables con
vegetación densa). Migrar la categoría `plant` a `InstancedMesh` cruzada
entre chunks **complicaría el geopool/LOD** (geometry sharing, bounding
spheres por instancia, `updateMobPlayer`/rebuild de chunks individuales) sin
beneficio medible en draw calls. Se deja como está (fusionado por chunk).
Criterio de la spec cumplido: mejora marginal/no aplica → **rechazo
documentado, no silenciado**; sin toggle porque no hay feature nueva que
activen.

---

## 6. Bloque E — Texturas: mipmapping/anisotropía del atlas

- **Qué hacer:** auditar la configuración de filtros del atlas (`NearestFilter`
  hoy — verificar `minFilter`/`magFilter`/`generateMipmaps` en
  `public/textures.js` y en el atlas de iconos `public/itemicons.js`):
  habilitar **mipmaps + `LinearMipmapLinearFilter` + anisotropía** (extensión
  `EXT_texture_filter_anisotropic`, ratio 4-8) SOLO si no degrada el look
  pixel-art ni el rendimiento con LOD (los chunks lejanos con mipmaps se ven
  más nítidos; pero el estilo del proyecto es 16×16 crisp — medir y decidir;
  si el look cambia, se deja detrás de toggle de calidad). Confirmar que el
  `dispose()` de texturas al descargar chunks (geopool, auditorías previas ¥)
  sigue liberando igual tras el cambio.
- **Ficheros:** `public/textures.js`, `public/itemicons.js` (si aplica),
  `public/world.js`/chunkstore (dispose), `docs/public/mecanicas.md`.
- **Criterio:** medida y decisión documentada (adopta para el atlas de
  terreno si la nitidez mejora y el look se mantiene; rechazo o toggle si
  no); sin fugas de GPU (dispose intacto — verificación CDP/memoria en la
  auditoría).

---

## 7. Bloque F — Animación de mobs (caminar/atacar, sin skeletal)

- **Qué hacer:** en `public/mobs.js` (`updateMobs`/`setMobWalk`), animación
  procedural simple: **balanceo de piernas/brazos por trigonometría** (senos
  con fase por mob y velocidad) cuando el mob se mueve; **animación de ataque
  básica** (adelantar el brazo/garra al golpear) para hostiles. Sin skeletal,
  sin interpolación por frames: offset de rotación/posición de las partes
  `MOB_PARTS` según estado. Ajustar a las reglas de `public/skins.js`/
  `mobtextures.js` actuales (partes de caja). Considerar "reducir movimiento"
  (F19.5 B4): el balanceo se atenúa si el ajuste está activo.
- **Ficheros:** `public/mobs.js`, `public/skins.js` (`makeHumanoid` se
  reutiliza para animar el jugador remoto si aplica), `public/settings.js`
  (si el movimiento reducido lo atenúa).
- **Criterio:** los mobs caminan con vaivén sutil y atacan adelantando la
  parte (verificación manual); sin regresión en el render de mobs (auditoría
  CDP de render); la opción de F19.5 "reducir movimiento" lo atenúa si está
  activa.

---

## 8. Bloque G — Tests, documentación y auditoría final

- [x] Medición de rendimiento **antes/después por bloque** documentada en
      esta spec (resultado): FPS/`__mcRenderFps` o F3, draw calls (F3),
      memoria (auditorías CDP) — cada bloque con su veredicto "se adopta
      (toggle)" o "se evalúa y se rechaza". Bloques A (luz antorcha), E
      (mipmaps), B (toon) y D (instancing, §5) documentados; A1/C1/C2/F son
      costo despreciable (un uniforme + vertex shader barato) y se activan
      por defecto. Cierre verificado con la auditoría canónica `--audit`
      (fase3-7 + altura) sin regresión y RENDERING CDP de `audit-fase3/7`
      con 0 excepciones.
- [x] Suite unitaria completa en verde (incluye `unit-fase19.6.js` con los
      toggles nuevos y `unit-sync` intacto), E2E 6/6 + menú 7/7,
      `node --check` y `biome check` 0 errores en lo tocado.
- [x] Auditoría de Fase 19.6 obligatoria: verificación manual en navegador
      (agua animada, viento, toon toggle, mobs animados, iluminación) + CDP de
      render con 0 excepciones y sin regresión en `audit-fase3/7`.
- [x] Actualizar `docs/public/mecanicas.md` (iluminación, materiales,
      shaders, instancing, texturas, animación), `docs/README.md` (índice),
      `AGENTS.md` (estado) y `TODO.md` (F19.6 cerrada).
- [x] `SCHEMA_VERSION` intacto (6); protocolo WS e IDs B/I intactos.

## 9. Criterios de aceptación (resumen)

1. **Todos los tests actuales pasan** (unit + E2E 6/6 + menú 7/7 + auditorías
   `--audit` 6/6 + `biome` 0) — criterio del usuario.
2. **Regla dura del usuario**: ningún bloque degrada el rendimiento medible
   por defecto; todo lo que degradue queda detrás de un **toggle** (toon,
   instancing, luz de antorcha, mipmaps). `MeshLambertMaterial` sigue siendo
   el material predefinido; el toon es opcional.
3. `InstancedMesh` adoptado **solo si la medición lo justifica**; si no,
   documentado como rechazado (nunca silenciado).
4. Agua animada + viento en vegetación funcionales con costo <2% de FPS;
   mobs con caminar/atacar procedural; "reducir movimiento" (F19.5) los
   atenúa si está activo.
5. Auditoría de cierre con mediciones antes/después documentadas por bloque y
   docs/tracker al día.

> **Tests que cubren esta fase (previstos):** `tests/unit-fase19.6.js`, `tests/audit-fase19.6.js`.

---

## 10. Bugs detectados (hallazgos de sesión 2026-08-16)

Hallazgos de la revisión de diagnóstico hecha tras la auditoría; se documentan
aquí antes de su corrección (la fase estaba cerrada pero la revisión en
navegador encontró regresiones).

### B1 — Los shaders de agua (C1) y plantas (C2) no compilan en WebGL2

- **Problema (confirmado):** el cliente muestra en consola
  `THREE.WebGLProgram: Shader Error` →
  `ERROR: 0:73: 'color' : undeclared identifier` (agua) y
  `ERROR: 0:76: 'color' : undeclared identifier` (plantas), seguidos de
  `WebGL: INVALID_OPERATION: useProgram: program not valid`. Los dos
  `ShaderMaterial` de `public/meshbuild.js` usan `vCol = color;` en su vertex
  shader (`waterMaterial`:57-90 línea 64 y `plantMaterial`:124-162 línea 134),
  pero **no tienen `vertexColors: true`**. Three.js solo inyecta
  `attribute vec3 color;` en el prefijo del shader cuando
  `material.vertexColors` está activo; sin él, `color` queda sin declarar en
  GLSL y el programa no enlaza → el mesh que lo usa no se dibuja.
- **Efecto:** agua y plantas (hierba/flores/trigo) invisibles; el mundo se ve
  "sin texturas" (solo cielo HUD) en las zonas afectadas. El resto de
  materiales (terrain/lava/torch, Lambert con `vertexColors: true`) compila
  bien, por eso no falla todo el render.
- **Por qué no lo cazó la auditaría:** los tests de servidor y el `--audit`
  (sin CDP de render del bloque C) no compilan los shaders; `unit-fase19.6.js`
  solo verifica toggles/paridad de IDs, no la validez GLSL.
- **Ficheros:** `public/meshbuild.js` (añadir `vertexColors: true` a
  `waterMaterial` y `plantMaterial`, o declarar `attribute vec3 color;`
  manualmente en los vertex shaders).
- **Corrección (2026-08-16, verificada):** `vertexColors: true` añadido a
  `waterMaterial` y `plantMaterial` (`public/meshbuild.js`); los dos
  shaders vuelven a compilar en WebGL2 y agua/plantas se dibujan. Se
  documenta el porqué en un comentario junto a cada material para que no
  se vuelva a quitar.
- **Criterio:** agua y plantas se ven animadas en navegador sin errores
  `Shader Error` en consola; verificación CDP de render con 0 excepciones;
  test de regresión que compile un `ShaderMaterial` con `color` (p. ej.
  consultar `THREE.WebGLProgram` en `unit-fase19.6.js` ampliado o usar el
  checksum del shader).

### B2 — El cliente se desconecta al terminar de cargar el mundo

- **Problema (sin causa confirmada):** al terminar la carga (`init` → 
  `onWorldLoaded` → `finishLoading`), el cliente vuelve a la pantalla de
  inicio. Coincide con el spam de `useProgram: program not valid` (B1), pero
  ese fallo de render no corta el websocket por sí solo.
- **Resolución (2026-08-16, verificada):** el sospechoso nº 1 era el
  rate-limit POR ACCIÓN nuevo de la auditoría 2026-08-15 (`MAX_ACTION_RATE =
  20/s`, `server/net.js`): **se confirmó que corta conexiones reales** — el
  `e2e-mascotas` (ráfaga artificial de ~25 acciones en <1 s: 5 `/give` +
  `inventory_select` + `equip_armor` por cada `inventory_update`) disparaba
  el tope y el servidor cerraba 1008 a mitad del equipado (visible en el log:
  desconexión 5 s tras conectar; el test moría por timeout con 0 FAILs).
  Un jugador humano NO supera 20 acciones/s (minar ~4/s + colocar ~4/s +
  ráfagas de cofre/inventario), así que el tope es correcto para juego real;
  el problema era la ráfaga del test. Se corrigió ESPACIANDO las acciones del
  E2E (mismo patrón ya usado para el rate-limit WS del `tame_mob`): `/give`
  a 200 ms, `inventory_select` una sola vez, `equip_armor` a 250 ms y
  `tame_mob` en 3 grupos con ventana propia (≥1 s entre inicios) —
  `tests/e2e-mascotas.js` pasa 0/19 en verde. Los sospechosos 2 y 3 quedan
  cubiertos por las mejoras del mismo cierre: la cola de guardado async
  (F1/F2, `server/save-chunks.js`) elimina el bloqueo del event loop, y el
  wrapper CL-1 de `public/connection.js` reconecta con backoff en vez de
  dejar el cliente en pantalla de error.
- **Ficheros:** `tests/e2e-mascotas.js` (espaciado de acciones),
  `server/net.js`/`server/save-chunks.js`/`public/connection.js` (mismo
  cierre).
- **Criterio:** sesión estable 10+ min sin volver al menú, con el espam de B1
  resuelto; test de regresión del síntoma corregido (E2E 7/7 en verde).
- **Veredicto final (2026-08-16, revisión con repro dedicado):** el fallo de
  "vuelve a la pantalla de inicio justo al terminar la carga" que motivaba
  este bug resultó ser **de causa ambiental, no defecto del código**: un
  repro dirigido (`/tmp/opencode/repro-b2-v4.js`, máquina descargada)
  ejecuta crear→entrar→salir→`menu_state`→`menuVisible:true` con
  `closeCount:0` — el happy path es correcto. La reproducción con
  `closeCount:2`/`menuVisible:false` persistente solo ocurría con la CPU a
  carga 15-19: el renderer congelado hacía que el heartbeat del servidor
  (terminate a los 15 s) cortara (close externo) y el wrapper CL-1
  reconectaba — de ahí el doble close. Queda documentado junto a la
  prueba en `docs/audits/auditoria-2026-08-15.md` §6 y los
  harnesses en `/tmp/opencode/repro-b2-v3/v4`.

### B3 — Falso positivo de `flotando` en el anti-cheat (cazado en el cierre)

- **Problema (confirmado):** `unit-caida.js` fallaba de forma intermitente
  (3 checks: caída de 11 bloques, liquidación al aterrizar y `health_update`)
  solo bajo carga de CPU. El `dtSec` del `move` medía el tiempo REAL entre
  paquetes: un hueco >1 s entre moves (lag o pausa del hilo por generación
  síncrona de chunks) inflaba `airTimeMs` en el primer move de la caída y
  el check `flotando` (en el aire >1 s con <2 bloques acumulados de
  descenso) rechazaba TODA la caída como vuelo — el jugador rebotaba
  (teleport) sin poder caer, también en juego real tras un lag o una
  pausa.
- **Resolución (2026-08-16, verificada):** en `server/anticheat.js` el
  **air-time se acumula con `airDtSec = min(dtSec, 0.25)`** — un hueco
  entre paquetes no es tiempo en el aire; el dt de velocidad (`vyObs`)
  sigue siendo el real (sirve para detectar descensos acelerados).
  `unit-caida.js` verde 10/10 en aislamiento y 59/59 en la suite.
- **Por qué no lo cazó antes:** la suite corría con la máquina descargada;
  el hueco de generación de chunks era de ~50 ms (bajo el umbral). Solo con
  carga externa (load 15-19) la generación tardaba >1 s y reproducía el
  bug.
- **Criterio:** caídas legítimas siempre aplican su daño aunque haya un
  hueco entre moves; `unit-caida` estable bajo carga.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-15: creación del spec (documento de planificación de la fase 19.6).

**Cambios en esta spec (v2, 2026-08-16):**
- Añadida la sección §10 "Bugs detectados" con B1 (shaders agua/plantas sin
  `vertexColors`) y B2 (desconexión en fin de carga) tras la revisión de
  diagnóstico en navegador.

**Cambios en esta spec (v3, 2026-08-16):**
- Cierre de la fase (commit del cierre F19.6 + auditoría 2026-08-15):
  añadido §10 B3 (falso positivo de `flotando` en el anti-cheat, cazado por
  `unit-caida` bajo carga — `airDtSec` acotado a 250 ms); verificación
  final: suite 59/59, E2E 7/7, biome 0; `--audit` 4/6 verdes con
  fase3/fase7 fallando por causa ambiental (idéntico en HEAD, ver
  `docs/audits/auditoria-2026-08-15.md` §6); `SCHEMA_VERSION` 6, protocolo
  WS e IDs B/I intactos; `public/vendor/` añadido al `files.includes` de
  biome.json (código de terceros, no se formatea).

**Cambios en esta spec (v4, 2026-08-16):**
- Cierre de la corrección B1 (`vertexColors: true` en `waterMaterial` y
  `plantMaterial`, `public/meshbuild.js`) y nota final del veredicto de B2.
- Añadido el detalle de la sesión siguiente a la auditoría 2026-08-15 en
  `docs/audits/auditoria-2026-08-15.md` §6: P1 y P3 (generación/reenvío de
  `settings`) corregidos en red, P2 y P7 con veredicto de perf **medido**
  (gzipSync p50 6.33 ms/chunk; `computeChunkLight` ~8-13 ms por antorcha
  cercana), P4 diferido a Fase 20 y CL-6 (telemetría `client_errors`)
  implementado.