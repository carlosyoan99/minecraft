# Fase 11 — Bugs de input y cámara, biomas, paridad y cierre de tests (Spec)

> Documento de especificación creado a partir de la entrevista con el usuario
> (rondas de preguntas sobre alcance) y el análisis del código. Este spec guió
> la implementación de la Fase 11; ver `TODO.md` para el estado final de cada
> tarea.
>
> Fecha: 2026-08-07 · Proyecto: clon de Minecraft (servidor Node autoritativo
> `server/` + cliente Three.js `public/`, todo en español).
>
> Estado: **retrospectiva, fase completada y auditada** (suite unitaria exit
> 0, E2E exit 0, auditoría CDP del clic 6/6, biome check 0 errores). La causa
> raíz del clic resultó ser de entregada de eventos (H3): el pointer lock
> estaba sobre `document.body` y `input.js` escucha en el canvas — ver
> «Bugs conocidos» de `TODO.md` y el fix en `public/scene.js`.
>
> **Retrospectiva del diagnóstico (H1/H2/H3):** la hipótesis H3 (estado del
> lock) era la correcta, pero no por `controls.isLocked` desincronizado sino
> por el ELEMENTO bloqueado: con PLC sobre `document.body`, el navegador
> entrega todos los eventos de ratón a body y el canvas (donde escucha
> `input.js`) no recibe nada. H1 (raycast) y H2 (overlay) se descartaron con
> telemetría: `blockerDisplay: none`, `elementAtCenter` sin overlay con
> `pointer-events`, y el raycast forzado sí encontraba terreno (la cámara
> miraba correctamente). El fix (`renderer.domElement` como elemento del
> control) se validó con la auditoría CDP: clic → target `BODY` antes,
> target `CANVAS` después.
>
> **Alcance (acordado con el usuario en 3 rondas de entrevista):** la Fase 11
> se estructura en 4 bloques A→D — (A) bugs de clic y cámara, (B) 4 biomas
> nuevos como terreno y bloques sin mobs ni estructuras, (C) mecánicas rápidas
> de paridad (esquilar, bonemeal, fuente de agua infinita, sonidos), y (D)
> cierre enfocado en tests (pendientes de mecánicas ya incluidas + test de
> cada mecánica nueva). Se mantiene el runner propio de tests (sin vitest).

---

## 0. Decisiones de la entrevista (rondas 1-3)

| # | Decisión | Valor acordado |
|---|----------|----------------|
| E1 | Navegador/entorno del bug | Chrome/Edge en Linux; el pointer lock SÍ funciona en el navegador real (el diag headless da falsos negativos) |
| E2 | Síntoma del clic | Nada en absoluto: ni grietas, ni rotura, ni colocar, ni atacar (probablemente tampoco cofres) |
| E3 | Síntoma de la cámara | Falla AL MIRAR con el ratón (pitch descontrolado); la Fase 10 (commit 69cf0ce Fase 9.5) lo rompió |
| E4 | Estructura de la fase | 4 bloques A-D (bugs · biomas · mecánicas · tests) |
| E5 | Biomas | Los 4 (Taiga, Pantano, Jungla, Océano) SOLO terreno+bloques, sin mobs ni estructuras |
| E6 | Mecánicas rápidas | Las 4: esquilar ovejas, bonemeal, fuente de agua infinita, más sonidos de mobs |
| E7 | Herramienta de tests | Mantener el runner propio (`node tests/run.js`); NO migrar a vitest |
| E8 | Bloques de biomas | Bloques nuevos con `SCHEMA_VERSION` → 4 y migración retrocompatible |
| E9 | Bloque A | Integra el spec del clic (este documento §2-§8) + el bug de cámara como subtarea A2 |
| E10 | Sección de tests | Bloque D: tests pendientes de Fase 10 sin cubrir + test de cada mecánica nueva + auditoría de biomas + E2E nuevos |
| E11 | Resaltado del bloque apuntado | Sí, contorno negro tipo Minecraft (feedback visual, D3) |
| E12 | Auditoría CDP del clic | Verifica las 4 acciones (minar, colocar, atacar, abrir cofre) |

---

## 1. Resumen

El usuario reporta que **el clic del ratón no funciona en absoluto** dentro del
juego: no se puede **minar** (ni siquiera aparecen grietas), **colocar**
bloques, **atacar** a los mobs ni **abrir cofres/mesas/horno**. El síntoma es
transversal a todas las acciones que dependen del clic, lo que apunta a que la
avería está en un punto común del flujo: **el pointer lock y/o el raycast**
cliente que traduce el clic en un objetivo (`public/input.js`).

Este spec documenta:

1. El diagnóstico ya realizado (`tests/diag-clic.js`, evidencia CDP).
2. Las hipótesis de causa raíz y cómo confirmarlas (plan híbrido:
   automatizado primero, manual con la consola F12 si hace falta).
3. El fix previsto (a decidir según la causa confirmada) y el **resaltado del
   bloque apuntado** (contorno negro tipo Minecraft) que el usuario pidió
   explícitamente.
4. La **auditoría de regresión CDP** que verificará las 4 acciones del clic
   (minar, colocar, atacar, abrir cofre) en navegador real.

---

## 2. Contexto técnico (lo que ya se sabe del código)

### 2.1 Flujo del clic (cliente)

`public/input.js` registra `mousedown` sobre `renderer.domElement`:

```js
renderer.domElement.addEventListener("mousedown", (e) => {
    if (!controls.isLocked) return;            // ← puerta de entrada
    const held = getHeldItem();
    const hit = raycastTerrainAndMobs();        // ← traduce clic → objetivo
    ...
});
```

- **Sin pointer lock → `return` inmediato**: ningún clic se procesa. Todos los
  handlers (minar, colocar, atacar, alimentar, comer, equipar armadura, abrir
  cofres/mesas/horno, dormir, TNT) están detrás de esta guarda.
- `raycastTerrainAndMobs()` (input.js) intersecta los meshes de
  `chunkMeshes` + `lodMeshes` (hijos de cada grupo) + `mobMeshes`, con
  `scene.updateMatrixWorld()` previo y `recursive=true`.
- `startMiningAt(x,y,z)` envía `block_action {action:"break"}` y muestra la
  grieta (`showCrack`).

### 2.2 Arranque y pointer lock

- `public/connection.js` abre el WebSocket **automáticamente** al cargar la
  página (sin esperar a «Jugar»): el cliente recibe `init` y renderiza el
  mundo aunque el menú siga visible. Por eso `audit-fase7` ve 169 chunks sin
  hacer ningún clic.
- El botón «Jugar» (`#start-btn` en `public/ui.js`) llama `startWithSeed("")`
  → `controls.lock()` (PointerLockControls de three, en `public/scene.js`).
- El `#blocker` (menú) se oculta en el evento `lock` del control
  (`public/scene.js`) y se vuelve a mostrar en `unlock` salvo que haya un
  panel abierto.

### 2.3 Evidencia del diagnóstico CDP (`tests/diag-clic.js`, 2026-08-07)

Ejecución sobre Chrome headless con servidor desechable (PORT=3999,
SEED=diagClic):

```
mundo cargado: sí
globals: {"chunks":169,"player":false,"lod":136,"three":"undefined"}
botón Jugar en: {"x":249.99,"y":221.70}
pointer lock: NO

===== TELEMETRÍA =====
TRACE: []                                    // ningún mousedown registrado
STATS: {"candidates":0,"hits":0,...}         // acumulado del diag
DEBUG: {
 "locked": false,
 "stats": {"candidates":248,"hits":0,"terrainHits":0,"mobHits":0,"emptyHits":1},
 "firstHit": null
}
EXCEPCIONES JS: []
CONSOLE.ERROR: []
```

Lectura de la evidencia:

| Dato | Lectura |
|---|---|
| `pointer lock: NO` | En **headless** el lock no se activa (limitación del entorno CDP: el `click` sintético no siempre concede user activation). **No es evidencia de que falle en el navegador real.** |
| `TRACE: []` | Consecuencia directa: `!controls.isLocked` → el handler no registra nada. |
| `DEBUG: locked:false`, 0 hits | `__mcDebugMining()` fuerza un raycast **aunque no haya lock**: 248 candidatos, 0 hits. Este dato sí es significativo: **hay meshes pero el rayo no intersecta ninguno**. |
| `player:false` | `window.__mcPlayerPos` no existe en el código actual (falso negativo del diag, el global se renombró o nunca existió). No es un fallo del juego. |
| `three:"undefined"` | `THREE` no es global (se importa como ES module); falso negativo del diag. |
| 0 excepciones JS | El atlas, la generación de geometría y el raycast **no lanzan excepciones**. |

### 2.4 Hallazgo transversal (entrevista, Ronda 1-2)

En el **navegador real del usuario** (Chrome/Edge en Linux):

- ✅ El menú desaparece y **ve el mundo**.
- ✅ **El ratón gira la cámara** (el pointer lock SÍ está activo en la práctica).
- ❌ Clic izquierdo sostenido: **nada** (ni grietas ni rotura).
- ❌ Clic derecho: **no coloca nada**.
- ❌ Atacar mobs: **no funciona**.
- ❓ Abrir cofres: presumiblemente tampoco (no probado explícitamente).

Con el lock activo y la cámara girando, la guarda `!controls.isLocked` debería
dejar pasar los clics. La evidencia de que **el raycast da 0 hits pese a 248
candidatos** encaja con un clic que se procesa pero no encuentra objetivo →
`if (!hit) return;` → ninguna acción.

---

## 3. Hipótesis de causa raíz (ordenadas por probabilidad)

### H1. El raycast no intersecta los meshes del mundo (probabilidad alta)

`raycastTerrainAndMobs()` devuelve `null` siempre (o casi siempre) porque los
248 meshes candidatos no son intersectados por el rayo. Causas posibles:

1. **Los meshes de los chunks no están en la escena raíz** o su
   `matrixWorld`/`boundingSphere` está obsoleto (el `scene.updateMatrixWorld()`
   anterior debería cubrirlo, pero puede fallar si los meshes cuelgan de un
   grupo intermedio que no se actualiza, o si la geometría se construye con
   `boundingSphere` nulo).
2. **La cámara no está donde el jugador cree**: si el spawn cae en un lago
   profundo (Fase 10 A6 añadió lagos de fondo variable y ríos), la cámara
   puede quedar en agua sin bloques sólidos a ≤ `raycaster.far` (7) en la
   línea de visión → 0 hits legítimos pero aparentemente inexplicables.
3. Los meshes LOD (136 de 169 chunks) no se clican (pero los full sí) — se
   descarta parcialmente porque el diag intersecta ambos.

**Cómo confirmarla:** con la telemetría ampliada (ver §5.2): reportar
`camera.position`, `camera.getWorldDirection()`, nº de meshes en `scene` vs
`chunkMeshes`, y el `firstHit`/bloque bajo el punto de mira. Además, la
auditoría CDP real con gestos de ratón (ver §7).

### H2. Los eventos de ratón no llegan al canvas (probabilidad media)

Un overlay invisible con `pointer-events` activo cubriendo el canvas (p. ej.
un panel `.hidden` mal ocultado, el `#death-screen`, el `#fire-overlay` o el
`#blocker` re-mostrado por un `unlock` espurio) interceptaría los `mousedown`
antes de `renderer.domElement`. La cámara seguiría girando si el lock está en
`document.body`.

**Cómo confirmarla:** en la auditoría real, comprobar `document.elementFromPoint`
en el centro de la pantalla con lock activo: debe ser `renderer.domElement` (o
`#crosshair`, que tiene `pointer-events:none`). También `getComputedStyle`
del `#blocker` (debe ser `display:none`) y de los overlays de Fase 10
(`#death-screen`, `#fire-overlay`).

### H3. `controls.isLocked` es false aunque el juego parezca activo (probabilidad baja-media)

El pointer lock visual funciona (cámara gira) pero la propiedad `isLocked` del
control podría estar desincronizada si algo llama a `controls.unlock()` sin
pasar por el flujo normal y el `lock` posterior no restablece la bandera.

**Cómo confirmarla:** en la auditoría real, evaluar `controls.isLocked` y
`document.pointerLockElement !== null` con el juego activo.

---

## 4. Decisiones de diseño (acordadas con el usuario)

| # | Decisión | Valor |
|---|----------|-------|
| D1 | **Estructura del trabajo** | Fase 11 formal: spec en `docs/fase11-spec.md` + sección en `TODO.md`. |
| D2 | **Estrategia de diagnóstico** | Híbrida: primero automatizado (CDP ampliado); si no da señal clara, pasos manuales con la consola F12 que ejecuta el usuario y nos pasa la salida. |
| D3 | **Feedback visual** | Añadir **resaltado del bloque apuntado con contorno negro tipo Minecraft** (debe seguirse aunque el raycast falle, para que el usuario vea a qué apunta). |
| D4 | **Test de regresión** | **Auditoría CDP de clic real** que verifica las **4 acciones**: minar, colocar, atacar y abrir cofre. |
| D5 | **Enfoque del fix** | **Depende del diagnóstico**: confirmar la causa (H1/H2/H3) antes de tocar código; no aplicar un fix a ciegas. |
| D6 | **Entorno objetivo** | Chrome/Edge en Linux (el del usuario), sin romper el resto (la auditoría CDP cubre el arranque sin clic de `audit-fase7`). |

---

## 5. Plan de trabajo

### Bloque A — Telemetría y diagnóstico ampliado (cliente)

- Ampliar la telemetría existente (`window.__mcMiningTrace`,
  `__mcRaycastStats`, `__mcDebugMining()`) para capturar el contexto del
  fallo, sin cambiar el flujo del juego:
  - `camera.position` y `camera.getWorldDirection()` en el momento del
    raycast.
  - Nº de meshes reales en `scene` (recorrido) vs `chunkMeshes.size` +
    `lodMeshes.size` + `mobMeshes.size`.
  - `controls.isLocked`, `document.pointerLockElement !== null`,
    `document.elementFromPoint(centro)` y `getComputedStyle(blocker).display`.
  - Bloque bajo el punto de mira (`getClientBlock` en el `firstHit` o en la
    columna central) — para detectar el «spawn en lago» de la Fase 10.
- Actualizar `tests/diag-clic.js` para leer y mostrar estos campos.

### Bloque B — Confirmación de la causa raíz (híbrido)

1. **Automatizado**: extender el diag CDP para:
   - Forzar el pointer lock por la vía fiable (p. ej. disparar el click sobre
     `#start-btn` con `Input.dispatchMouseEvent` y esperar; si el lock no se
     activa, usar `Page.bringToFront` + re-click, o `Emulation`/`Input` con
     `trusted=true`).
   - Con lock activo: mover el ratón ligeramente (para actualizar la cámara),
     evaluar `__mcDebugMining()` y los campos del Bloque A.
   - Comprobar `document.elementFromPoint` en el centro.
2. **Manual (si el automatizado no es concluyente)**: pasos exactos para F12
   que el usuario ejecuta y pega la salida (ver §8).

### Bloque C — Fix según causa confirmada

- **Si H1 (raycast no intersecta)**:
  - Auditar `public/world.js` y `public/player.js`: cómo se añaden los
    `chunkMeshes`/`lodMeshes` a la escena, y por qué el rayo no los golpea.
  - Correcciones candidatas (a validar con el diagnóstico):
    - Asegurar que la geometría de los chunks tiene `boundingSphere`
      calculado y que los meshes cuelgan de un objeto con `matrixWorld`
      actualizado en `scene.updateMatrixWorld()`.
    - Si el problema es el «spawn en lago»: reubicar el spawn del jugador en
      el suelo firme más cercano (servidor, `server/world.js`/`players.js`) o
      subir la cámara.
  - Un fix posible adicional: **fallback de raycast contra el terreno del
    servidor** (usar `getClientBlock` a lo largo del rayo) si los meshes
    siguen fallando — se decide al confirmar la causa.
- **Si H2 (overlay intercepta)**: corregir el overlay culpable
  (`pointer-events:none` o `display:none` correcto) y añadir el chequeo
  `elementFromPoint` a la auditoría.
- **Si H3 (isLocked desincronizado)**: normalizar el estado del control
  (p. ej. suscribirse a `pointerlockchange` y refrescar `isLocked`, o usar
  `document.pointerLockElement` como fuente de verdad en la guarda de
  `mousedown`).

### Bloque D — Resaltado del bloque apuntado (contorno negro tipo MC)

Independiente de la causa (D3): el jugador siempre debe ver a qué bloque
apunta.

- Implementar un contorno delgado (líneas negras) sobre la arista del bloque
  bajo el punto de mira, actualizado por frame o al mover el ratón.
  - Three.js: `THREE.LineSegments`/`EdgesGeometry` con `LineBasicMaterial`
    negro, o un mesh de caja `wireframe` del tamaño del bloque; se añade a la
    escena y se posiciona en la celda objetivo.
  - Solo debe aparecer con el juego activo (lock + sin panel abierto).
  - Debe ignorar mobs (en bloques) o resaltar también el mob si se prefiere —
    decisión D3: contorno negro sobre el **bloque** apuntado.
  - Integrar con el raycast existente y con el LOD (también se resalta en
    chunks LOD si el bloque es clicable).
- Si el raycast sigue fallando (H1 sin arreglar), el resaltado servirá además
  como diagnóstico visual inmediato.

### Bloque E — Auditoría CDP de clic (regresión, D4)

Nuevo `tests/audit-fase11.js` (patrón de `audit-fase7.js` + `diag-clic.js`):

1. Arrancar servidor desechable y Chrome headless con CDP.
2. Esperar el mundo cargado (`__mcChunks > 0`).
3. Activar el juego (clic real sobre `#start-btn` → pointer lock).
4. Verificar **minar**: clic izquierdo sostenido en el centro sobre un bloque
   → comprobar que se envía `block_action break` al servidor (log del
   servidor o estado del bloque) y que el bloque desaparece.
5. Verificar **colocar**: seleccionar un bloque de la hotbar y clic derecho →
   el bloque aparece.
6. Verificar **atacar**: clic sobre un mob → el mob recibe daño (`mob_hit`
   o health del mob).
7. Verificar **abrir cofre**: clic sobre un cofre → `chest_open` y el panel
   se muestra.
8. Reportar `__mcMiningTrace`, `__mcRaycastStats`, excepciones JS y
   `console.error`.
9. Criterio de aceptación: las 4 acciones funcionan con 0 excepciones.

Registrar la auditoría en `tests/run.js` (como `audit-fase11`) y en el
`TODO.md`.

### Bloque F — Verificación final

- Suite unitaria completa (`node tests/run.js --unit`).
- E2E contra servidor vivo (`WS_URL=... node tests/run.js --e2e`).
- Auditorías de fases anteriores (3-10) en verde, en especial `audit-fase7`
  (render) y `audit-fase5` (durabilidad).
- `biome check` y `node --check` en los archivos tocados.
- Verificación manual en el navegador del usuario (pasos del §8) como prueba
  final de que el clic funciona.
- Documentar la Fase 11 en `TODO.md` con causa raíz confirmada y fix.

---

## 6. Archivos implicados (previsión)

| Archivo | Papel |
|---|---|
| `public/input.js` | Guarda del lock, raycast, telemetría (Bloque A), posible fix H1/H3, integración del resaltado |
| `public/world.js` | Meshes de chunks/LOD, culling, resaltado (Bloque D) |
| `public/player.js` | Cámara, spawn, métricas `__mc*` |
| `public/scene.js` | Pointer lock, `#blocker`, `elementFromPoint` |
| `public/ui.js` | Menú, overlays (H2), hotbar (colocar) |
| `public/estilo.css` | Overlays `pointer-events` (H2), estilos del resaltado |
| `public/index.html` | Overlays de Fase 10 (`#death-screen`, `#fire-overlay`) si interceptan |
| `server/world.js`, `server/players.js` | Spawn en suelo firme (si H1-lago) |
| `tests/diag-clic.js` | Telemetría ampliada (Bloque A/B) |
| `tests/audit-fase11.js` | Auditoría CDP de las 4 acciones (Bloque E, nuevo) |
| `tests/run.js` | Registrar la nueva auditoría |
| `TODO.md` | Sección Fase 11 (nueva) |
| `docs/fase11-spec.md` | Este spec |

---

## 7. Criterios de aceptación

1. **Causa raíz confirmada** (H1, H2 o H3 con evidencia), no un fix a ciegas.
2. En el navegador real (Chrome/Edge en Linux) con el juego activo:
   - Clic izquierdo sostenido sobre un bloque → **grietas** visibles y el
     bloque se rompe (mina).
   - Clic derecho con bloque seleccionado → **se coloca**.
   - Clic sobre un mob → **le hace daño**.
   - Clic sobre un cofre → **se abre**.
3. **Resaltado del bloque apuntado** (contorno negro tipo MC) visible con el
   juego activo, actualizado al girar la cámara.
4. `tests/audit-fase11.js` en verde: las 4 acciones verificadas por CDP con
   0 excepciones JS.
5. Ninguna regresión: suite unitaria, E2E y auditorías 3-10 en verde;
   `biome check` 0 errores.
6. Fase 11 documentada en `TODO.md` (causa raíz, fix y auditoría).

---

## 8. Pasos manuales para el usuario (diagnóstico con F12)

Se usarán **solo si** el diagnóstico automatizado no es concluyente (D2):

1. Arranca el servidor (`node server.js`) y abre `http://localhost:3000` en
   Chrome/Edge (Linux).
2. Pulsa F12 → pestaña **Consola**.
3. Pulsa «Jugar» y entra en el mundo.
4. Escribe en la consola y pega la salida de:
   ```js
   JSON.stringify({ locked: controls.isLocked, pl: document.pointerLockElement !== null,
     blocker: getComputedStyle(document.getElementById('blocker')).display,
     fzp: document.elementFromPoint(innerWidth/2, innerHeight/2)?.id || document.elementFromPoint(innerWidth/2, innerHeight/2)?.tagName });
   ```
5. Apunta a un bloque, mantén clic izquierdo 2s y ejecuta:
   ```js
   window.__mcDebugMining ? JSON.stringify(window.__mcDebugMining()) : 'sin telemetría'
   JSON.stringify(window.__mcMiningTrace ?? [])
   ```
6. Pega ambas salidas en el chat de la tarea.

---

## 8.5 Resultados del diagnóstico CDP ampliado (Bloque A, ejecutado 2026-08-07)

### Telemetría ampliada (input.js `__mcDebugMining`)

Nuevos campos: `camera` (posición + dirección), `sceneMeshes` (meshes reales
en la escena vía `traverse`) vs `mapMeshes` (chunkMeshes+lodMeshes+mobMeshes),
`elementAtCenter` (qué elemento DOM recibe el clic en el centro → H2),
`blockerDisplay` (estado del menú → H2), `blockAlongView` (bloque en la línea
visual hasta `far`) y `terrainAround` (bloque bajo los pies + barrido de 8
direcciones a la altura de los pies → distingue «raycast roto» de «sin bloques
cerca»). `diag-clic.js` acepta `DIAG_SEED` para probar la semilla real y fuerza
el pointer lock de forma fiable (3 intentos + fallback `requestPointerLock`).

### Resultados (semilla diagClic y semilla real miSemilla2026)

```
pointer lock: SÍ (fallback requestPointerLock; el clic CDP no concede
              user activation en headless — el navegador real SÍ)
elementAtCenter: "canvas#"        → H2 DESCARTADA (el canvas recibe el clic)
blockerDisplay: "none"            → H2 DESCARTADA (el menú está oculto)
locked: true, pointerLocked: true → H3 DESCARTADA (el lock está activo)
candidates: 248, hits: 0, 0 excepciones JS → el raycast corre sin error
blockAlongView: null              → NO hay bloques a ≤7 en la línea visual
```

| Semilla | underFeet | feet | Lectura |
|---------|-----------|------|---------|
| diagClic | 6 (arena) | 5 | **Spawn en el fondo de un lago** (Fase 10 A6): 5 de 8 direcciones sin bloques a ≤7; la arena bajo los pies no está en la línea visual → clic «no hace nada» legítimamente |
| miSemilla2026 | 2 (césped) | 8 | Spawn en tierra, pero `dir.y: +0.08` (rayo ligeramente ARRIBA): en terreno plano el rayo pasa por encima del suelo (~1.6 bloques bajo la cámara) → 0 hits aunque haya bloques a 4.75 en horizontal |

**Conclusión: H1 confirmada — el raycast funciona, pero la línea de visión
no cruza bloques.** En el spawn real la cámara mira casi horizontal con
`dir.y` positivo (ligeramente arriba) y el suelo queda justo debajo de la
línea visual dentro de los 7 bloques de alcance. El usuario «no puede minar»
porque el rayo no golpea el suelo al mirar al horizonte (el clamp de cámara
roto le impide apuntar correctamente hacia abajo — ver §9).

### Cámara: confirmación por código (A2)

- PointerLockControls **r160 ya clampea el pitch** en `onMouseMove`:
  `_euler.x = max(-π/2, min(π/2, _euler.x))` — el clamp externo de
  `scene.js` es **redundante**.
- Y es **dañino**: PLC usa `_euler = new Euler(0,0,0,'YXZ')`, mientras
  `camera.rotation` de three es un Euler **XYZ** por defecto. Escribir
  `camera.rotation.x = PITCH_LIMIT` directamente con yaw ≠ 0 **desincroniza
  la orientación** (el clamp horizontal se aplica en el orden equivocado) →
  las «vueltas descontroladas» al mirar con el ratón.
- El clamp se añadió en el commit `69cf0ce` (Fase 9.5) — coincide con el
  reporte del usuario («la Fase 10 la rompió»).
- **Fix aplicado (A2, 2026-08-07):** eliminado el clamp externo de
  `public/scene.js` (PLC r160 ya limita el pitch a ±90° en `onMouseMove` con
  euler YXZ). Nuevo `tests/unit-camara.js` (registrado en `run.js`) que
  verifica con three real: (1) el pitch queda limitado a ±90° mirando
  arriba/abajo, (2) el yaw no rota solo al mirar (movementX=0) y sí rota en
  horizontal (control sano), (3) el mecanismo del bug — escribir
  `rotation.x` con yaw≠0 en orden XYZ desvía la mira 0.7 rad frente al YXZ
  correcto — y (4) `scene.js` ya no contiene el clamp (regresión de código).

> Nota del revisor (no bloqueante): al eliminar el clamp, el pitch puede
> llegar a exactamente ±90°, donde el euler YXZ tiene singularidad (yaw/roll
> se confunden mirando verticalmente). El viejo clamp usaba ~84°.
> Si molestara, en lugar de escribir `rotation.x` (que reintroduciría el
> bug), usar `controls.minPolarAngle`/`maxPolarAngle` de PLC. De momento
> ±90° es el comportamiento estándar de FPS y queda así.

---

## 9. Bloque A2 — Bug de cámara (pitch descontrolado al mirar)

### 9.1 Síntoma y sospechoso principal

El usuario reporta que la cámara **funcionaba bien hasta la Fase 9** y la Fase
10 la rompió: **al mirar con el ratón la cámara da vueltas de forma
descontrolada** (pitch). El sospechoso principal es el **clamp de pitch** de
`public/scene.js`:

```js
// Clamp de pitch (Fase 10, skill camera-systems)
const PITCH_LIMIT = Math.PI / 2 - 0.1; // ~84°
controls.addEventListener("change", () => {
    if (camera.rotation.x > PITCH_LIMIT) camera.rotation.x = PITCH_LIMIT;
    else if (camera.rotation.x < -PITCH_LIMIT) camera.rotation.x = -PITCH_LIMIT;
});
```

- Se añadió en el commit `69cf0ce` («Fase 9.5: mejoras de skills — cámara»),
  que el usuario percibe como parte de la Fase 10.
- **Problema potencial:** PointerLockControls de three r160 gestiona la
  rotación vía `camera.quaternion`; escribir `camera.rotation.x`
  directamente en cada `change` puede **desincronizar** la representación
  Euler/quaternion (o interactuar mal con el euler interno del control en
  orden YXZ), produciendo vueltas/brincos del pitch al mirar.

### 9.2 Plan de diagnóstico

1. Revisar el código de `PointerLockControls` de three 0.160 (verificar si
   r160 YA clampea el pitch internamente a ±π/2; si es así, el clamp
   externo es redundante y probablemente dañino).
2. Reproducir en navegador real (Chrome/Edge Linux): mirar arriba/abajo y
   observar el comportamiento del pitch (¿se voltea? ¿brinca?).
3. Comprobar que el sprint/FOV (Fase 10) no contribuye: el lerp de FOV solo
   toca `camera.fov`, no la rotación — se verifica descartándolo.
4. Test puro: simular la secuencia de eventos del control (mousemove con
   movementY grande) y comprobar que el pitch queda acotado sin vueltas.

### 9.3 Fix previsto (según confirmación)

- Si r160 ya clampea: **eliminar el clamp externo** (o sustituirlo por un
  clamp correcto sobre el euler/quaternion del control, p. ej. ajustando
  `camera.quaternion` con `setFromEuler` en orden `YXZ`).
- Añadir un **test de regresión de cámara** (puro, sin three real si es
  viable, o con three real como `unit-raycast.js`): el pitch queda limitado
  a ±~84° y el yaw no cambia al caminar.

### 9.4 Archivos implicados

`public/scene.js` (clamp), `public/player.js` (movimiento/forward,
verificación), `public/input.js` (origen de eventos), tests nuevos de
cámara.

---

## 10. Bloque B — 4 biomas nuevos (terreno y bloques, sin mobs ni estructuras)

> Decisión E5: solo terreno, superficie y árboles propios; los mobs (lobo,
> slime, ocelote, ahogado) y estructuras (templo de jungla, naufragio) quedan
> para una fase futura. E8: bloques nuevos con `SCHEMA_VERSION` → 4.

### 10.1 Biomas y su terreno/bloques

| Bioma | Superficie | Árboles | Bloques nuevos | Notas |
|-------|-----------|---------|----------------|-------|
| **Taiga** | Podzol | Abeto (alto y delgado) | Podzol, tronco de abeto, hojas de abeto | Temperatura fría (lógica de nieve existente) |
| **Pantano** | Agua turbia en zonas bajas, musgo | Roble con enredaderas | Agua turbia (variante), liana, musgo | Zonas húmedas y planas |
| **Jungla** | Vegetación densa | Gigante 2×2 con madera de jungla | Madera/hojas de jungla, lianas | Sin templo ni ocelote |
| **Océano** | Bajo el agua: arena/grava | — | Islas generadas | Profundidad variable, sin vida marina |

### 10.2 Trabajo

1. **Bloques nuevos** en `server/constants.js` + `public/constants.js`
   (IDs nuevos, `unit-sync` los audita) + teselas en `public/textures.js`.
2. **Generación** en `server/world.js`: ampliar `getBiome` (9 biomas),
   `surfaceBlock` y generador de árboles por bioma; transiciones suaves
   (blend de ruido, ya documentado en las notas).
3. **SCHEMA_VERSION → 4** con migración retrocompatible en `server/save.js`
   (mundos viejos abren igual; modelo `tests/unit-persistencia.js`).
4. **Tests**: ampliar `tests/unit-biomas.js` (9 biomas presentes, bloques de
   superficie correctos, determinismo, costuras) + nueva **auditoría de
   biomas** (presencia/ausencia por muestreo del mundo generado).
5. Los bloques nuevos entran en el culling/`NON_SOLID_PLANTS`/recetas solo
   si aplica (liana/agua turbia no sólidas).

---

## 11. Bloque C — Mecánicas rápidas de paridad

> Decisión E6: las 4 mecánicas. Cada una lleva **su test unitario** (decisión
> del usuario: «cada mecánica añadida debe tener un test que valide su
> funcionamiento»).

### 11.1 Esquilar ovejas (shearing)

- Ítem `SHEARS` (tijeras) crafteable con 2 lingotes de hierro, con
  durabilidad (`TOOL_DURABILITY`/`DURABILITY` sincronizados).
- Clic derecho sobre una oveja con tijeras → 1-3 lana al inventario sin
  matar, la oveja pasa a `sheared` (se renderiza sin lana: ocultar la capa
  de lana del `MOB_PARTS`); opcional: la lana crece con el tiempo.
- Test: esquilar da lana y no daña, las tijeras se desgastan, oveja
  esquilada no da lana hasta regenerar.

### 11.2 Bonemeal (hueso → polvo de hueso)

- Ítems `BONE` (drop de esqueleto) y `BONE_MEAL` (receta 1 hueso → 3
  polvos).
- Usar polvo de hueso (clic derecho con `BONE_MEAL` en mano) sobre un
  cultivo → lo madura al instante (estado 7); sobre tierra → genera hierba
  alta/flores; sobre un árbol joven → lo crece (opcional).
- Test: maduración instantánea del cultivo, consumo del ítem, generación de
  plantas, rechazo en bloque no plantable.

### 11.3 Fuente de agua infinita

- Al colocar/recoger agua, el servidor detecta el patrón de fuente (2×2 o
  1×2 con hueco central) y, al tomar el agua del centro, la rellena
  automáticamente (regla de vecindad, evento `block_update`).
- Test: 2×2 se rellena, 1×2 también, un solo bloque NO se rellena.

### 11.4 Más sonidos de mobs y materiales

- Siseo del creeper al encenderse la mecha, balido de oveja, sonidos de
  pasos por material (vidrio, metal), salpicaduras — todo procedural en
  `public/audio.js` (sin assets binarios).
- Test: `audio.js` genera los sonidos sin errores y los hooks se cablean
  (mínimo: funciones exportadas y llamadas sin excepción).

---

## 12. Bloque D — Tests pendientes y cierre

> Decisión E7: se mantiene el runner propio (`node tests/run.js`), sin
> framework ni dependencias nuevas. La Fase 11 cierra con una sección
> enfocada en tests.

### 12.1 Tests pendientes de mecánicas YA incluidas (verificado por barrido)

| Mecánica (Fase 10) | Estado | Test propuesto |
|--------------------|--------|----------------|
| TNT (mecha, explosión, cadena) | **sin test** | `tests/unit-tnt.js` |
| Gravedad de arena/grava | **sin test** | `tests/unit-gravedad.js` |
| Sprint + FOV | **sin test** | `tests/unit-sprint.js` |
| Tamaño de mundo (`worldSize`) | **sin test** | `tests/unit-mundo-size.js` |
| Pantalla de muerte (`player_die` + causas) | **sin test** | `tests/unit-muerte.js` |
| `/kill` | **sin test** | ampliar `tests/unit-commands.js` |
| Nubes (`public/clouds.js`) | **sin test** | `tests/unit-clouds.js` |
| AO por vértice | **sin test** | `tests/unit-ao.js` |
| Música por contexto | **sin test** | `tests/unit-musica.js` |
| Cámara (clamp pitch) | **sin test** | bloque A2 |

### 12.2 E2E nuevos (mecánicas interactivas de la fase)

- `tests/e2e-esquilar.js` (craftear tijeras → esquilar → lana en inventario).
- `tests/e2e-bonemeal.js` (hueso → polvo → cultivo maduro).
- `tests/e2e-agua.js` (fuente 2×2 se rellena).
- `tests/e2e-tnt.js` (colocar, encender, explota).

### 12.3 Registro y verificación

- Registrar los tests nuevos en `tests/run.js` (convención actual).
- **Auditoría de Fase 11**: suite unitaria completa en verde, E2E contra
  servidor vivo (incluidos los nuevos), auditorías 3-10 sin regresiones
  (especialmente `audit-fase7` render y `audit-fase4` culling con los
  bloques nuevos), `biome check` 0 errores, `node --check` en todo lo
  tocado, y verificación manual en el navegador del usuario (clic y cámara).

---

## Bugs resueltos (histórico del roadmap)

> Bugs que el roadmap fue registrando con su causa raíz ya corregida.

- [x] **Fase 11: el spawn del diagnóstico (y cualquier spawn pedido en
      agua) caía en un río de la Fase 10 y el jugador nacía nadando sin
      bloques minables a ≤7.** Causa raíz: `findSpawn` solo comprobaba
      `isLake`, no los ríos ni el océano nuevo de la Fase 11.
      **Corregido**: `findSpawn` rechaza TODA columna de agua
      (`columnFloorY !== null` — lago, río u océano) y el espiral busca
      la columna seca más cercana.
- [x] **Fase 11: flakiness intermitente de `unit-mundo` — la copa de un
      árbol caía sobre la celda de aire encima de un charco pantanoso
      nuevo y el charco dejaba de estar "abierto al aire".** Causa
      raíz: el fix de Fase 9 solo cubría `isPondAt`/`isLavaPondAt`, no
      los charcos de pantano. **Corregido**: helper `isSwampPoolAt` en
      `server/world.js` comprobado en las tres copas de árboles (mismo
      patrón que Fase 9); 6/6 ejecuciones estables.
