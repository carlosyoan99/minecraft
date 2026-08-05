# Fase 8 — Caza de bugs y correcciones (Spec)

> Documento de especificación creado a partir de la entrevista con el usuario
> (3 rondas de preguntas) y el análisis del código. **No se ha modificado
> código**: este spec guía la implementación de la Fase 8.
>
> Fecha: 2026-08-05 · Proyecto: clon de Minecraft (servidor Node autoritativo
> `server/` + cliente Three.js `public/`, todo en español).

---

## 1. Resumen

La Fase 8 está centrada en **identificar y corregir errores** que rompen la
experiencia básica de juego. Se reportaron 10 bugs, varios de ellos
**bloqueantes** (no se puede minar, no se puede luchar, se pierde vida
constantemente): juntos impiden progresar en el bucle de supervivencia
(minar → craftear → luchar → sobrevivir).

**Hallazgo transversal (diagnóstico inicial):** los bugs de "no puedo minar",
"no puedo luchar" y "pierdo vida desde el inicio" están probablemente
**encadenados**:

- El jugador nace con `health: 20, food: 20, saturation: 20` (net.js:181-201)
  — la pérdida de vida con la comida llena **no es hambre**; apunta a **daño
  de mobs hostiles** que atacan cerca del spawn (los hostiles aparecen de
  noche a ≥24 bloques, `SPAWN_MIN_PLAYER_DIST`, y persiguen al jugador).
- Si el raycast de mobs falla (ver Bug 10), el jugador **no puede
  defenderse**: los mobs lo golpean y muere en pocos segundos → "pierdes
  vida constantemente, muriendo cada pocos segundos".
- Sin minar (Bug 3) no hay herramientas → no hay espadas → no hay forma de
  romper el bucle.

**Prioridad de implementación:** primero los 3 bloqueantes (vida, minería,
combate), después los de estética/UX, y por último el rendimiento.

---

## 2. Bugs a corregir

### B1. Controles de derecha e izquierda invertidos (+ opción "controles invertidos")

**Síntoma:** el movimiento lateral se siente invertido respecto a las teclas.

**Estado actual del código:**
- `public/input.js`: `KeyA → move.left`, `KeyD → move.right` (keydown/keyup).
- El menú de Ajustes (`public/settings.js` + `index.html`) ya tiene un
  sistema de ajustes persistidos en `localStorage` (`mc_settings`) con
  slider/toggle por ajuste — el patrón para añadir uno nuevo ya existe.

**Decisión del usuario:** **Arreglar el bug de base** (que A/D funcionen como
en Minecraft) **y además** añadir una opción **"Controles invertidos"** en el
menú de Ajustes que invierta el eje lateral (A↔D) para quien lo prefiera.

**Alcance:**
1. Diagnosticar y corregir la causa real de la inversión (probablemente en
   `public/player.js`, en cómo `move.left`/`move.right` se traducen a
   desplazamiento del `camera.position`).
2. Añadir ajuste `invertControls: boolean` en `settings.js` (default `false`)
   + control en el menú de Ajustes + aplicación en tiempo real.
3. Persistir en `localStorage` como el resto de ajustes.

**Criterio de aceptación:** con la opción desactivada, A mueve a la
izquierda y D a la derecha (relativo a la cámara); con la opción activada se
invierten. La opción persiste entre sesiones.

---

### B2. Pierdes vida constantemente sin causa aparente (mueres cada pocos segundos)

**Síntoma:** la barra de vida baja desde el inicio (o al poco de jugar, o de
noche/cerca de mobs) con la **comida llena** y mueres en pocos segundos.

**Estado actual del código:**
- El jugador nace con `health: 20, food: 20, saturation: 20` (net.js).
- Fuentes de daño posibles: **mobs hostiles** (ataque cuerpo a cuerpo,
  mobs.js `attack()` → `damagePlayer`), **lava** (`LAVA_DAMAGE 2 HP/500ms`),
  **caída** (`fallDamage`), **inanición** (solo con food=0, descartada porque
  la comida está llena).
- `damagePlayer` (players.js) ya pasa por armadura y respeta creative.

**Decisión del usuario:** **No se sabe la causa → la Fase 8 debe incluir un
paso de diagnóstico** (logs/eventos de daño o test headless) antes de
corregir. La hipótesis principal es daño de mobs hostiles cerca del spawn.

**Alcance:**
1. Implementar la telemetría de daño por origen (plan detallado abajo).
2. Ejecutar el diagnóstico (reproducir + leer la telemetría) y confirmar la
   causa real.
3. Corregir la causa (probablemente: mobs atacando al spawn sin que el
   jugador pueda defenderse — ver B10).
4. Considerar un área segura de spawn o un periodo de gracia inicial si el
   diagnóstico lo confirma (decisión de diseño a validar con el usuario).

**Criterio de aceptación:** el jugador no muere sin causa: si muere, el
origen del daño es identificable (mob visible, lava, caída, hambre).

#### Plan de diagnóstico concreto — telemetría de daño por origen

**Inventario de fuentes de daño (call sites reales de `damagePlayer`):**

| `source` | Call site | Archivo:línea | Meta específica a capturar |
|----------|-----------|---------------|-----------------------------|
| `mob` | `Mob.attack()` | `server/mobs.js:165` | `mobId`, `mobType`, `dist` |
| `mob` | `Mob.explode()` (creeper) | `server/mobs.js:171` | `mobType: "creeper"`, `dist` |
| `fall` | `applyFallDamage()` | `server/players.js:355` | `fallBlocks` (`fallFromY - y`) |
| `lava` | `tickPlayer()` (inLava) | `server/players.js:454` | bloque de lava en pies |
| `starve` | `tickPlayer()` (inanición) | `server/players.js:497` | `food`, `saturation` |

`damagePlayer` ya recibe `opts` (`{ armor: false }` en inanición); se
aprovecha para transportar `source` y `meta` sin cambiar su API pública.

**Evento de telemetría `damage_debug` (campos):**
```js
{
  event: "damage_debug",
  data: {
    source: "mob" | "fall" | "lava" | "starve",
    amount: 10,          // daño bruto (antes de armadura)
    realAmount: 7,       // daño aplicado tras armadura (o amount si armor:false)
    healthBefore: 20,
    healthAfter: 13,
    x, y, z,             // posición del jugador al recibir el daño
    time: Date.now(),
    // meta específica por source (opcional):
    mobId, mobType, dist,      // source=mob
    fallBlocks,                // source=fall
    food, saturation           // source=starve
  }
}
```

**Dónde loguearlo (3 canales, activables):**

1. **Consola del servidor** — `console.log("[damage]", ...)` con
   `// biome-ignore lint/suspicious/noConsole` (patrón del banner de
   arranque), **solo si `DAMAGE_DEBUG=1`** está en el entorno (no ensuciar
   los logs de producción ni romper la auditoría de biome).
2. **Evento WS `damage_debug`** — enviado solo al jugador afectado (o
   broadcast si `DAMAGE_DEBUG=1`), capturado por `public/network.js` y
   expuesto en `window.__mcLastDamage` (cola de las últimas ~20 entradas).
   El HUD F3 (`public/debug.js`) muestra la última entrada (fuente, daño,
   posición) siguiendo el patrón `window.__mc*` existente. El flag
   `window.__mcDamageDebug` permite activarlo desde la consola del
   navegador sin reiniciar.
3. **Acumulador servidor `state.damageLog`** — anillo de las últimas ~50
   entradas con la misma forma que el evento; inspeccionable por los tests
   headless (`node --eval` o un test de diagnóstico) y volcable con un
   comando de debug, sin depender de la consola.

**Cambios mínimos en el código (guía de implementación):**

- `server/players.js`: en `damagePlayer`, tras calcular `real` y antes de
  aplicar la salud, llamar a un helper `logDamage(player, source, amount,
  real, meta)` que: (a) si `DAMAGE_DEBUG` → `console.log`, (b) empuja a
  `state.damageLog`, (c) si el WS está abierto → `send` del evento
  `damage_debug`. `source` y `meta` viajan en `opts`.
- Call sites a actualizar (pasar `source`/`meta` en `opts`):
  - `server/mobs.js:165` `attack()`: `{ source: "mob", meta: { mobId:
    this.id, mobType: this.type, dist: this.distTo(player) } }`.
  - `server/mobs.js:171` `explode()`: `{ source: "mob", meta: { mobType:
    "creeper" } }`.
  - `server/players.js:355` `applyFallDamage`: `{ source: "fall", meta:
    { fallBlocks: player.fallFromY - player.y } }`.
  - `server/players.js:454` lava: `{ source: "lava" }`.
  - `server/players.js:497` inanición: `{ source: "starve", meta:
    { food: player.food, saturation: player.saturation }, armor: false }`.
- `public/network.js`: handler de `damage_debug` → `window.__mcLastDamage`
  (cola circular de 20).
- `public/debug.js`: si `window.__mcLastDamage`, mostrar la última entrada
  en el HUD F3 (una línea: `DMG mob 10→7 @ x,y,z`).

**Procedimiento de diagnóstico (cómo se usa):**

1. Arrancar el servidor con `DAMAGE_DEBUG=1` (y `PORT`/`SEED` de prueba si
   no se quiere tocar el mundo real).
2. Entrar al mundo y **quedarse quieto** 30-60 s: si llegan entradas
   `source=mob` → confirmado: mobs atacan cerca del spawn (se correlaciona
   con B10: sin raycast de mobs no hay defensa). Si `source=fall`
   apareciendo sin saltar → problema de física de suelo. Si `source=lava`
   → spawn sobre un charco de lava. Si `source=starve` con `food` llena →
   algo resetea la comida (sospechoso, no debería ocurrir).
3. Mover al jugador por el mapa 2-3 min y repetir la lectura: el origen
   dominante en `state.damageLog`/consola es la causa.
4. Con la causa confirmada, corregir (ver B10/B3 para el caso esperado) y
   re-ejecutar el mismo procedimiento para validar que ya no aparecen
   daños sin origen.

**Resultado esperado del diagnóstico:** los primeros eventos de daño serán
`source=mob` a los pocos segundos de spawnear (hostiles de noche dentro del
radio de detección atacando sin que el jugador pueda golpearlos), lo que
convierte B2 en una consecuencia de B10+B3: al corregir el combate y la
minería, B2 queda resuelto sin cambios adicionales de balance.

---

### B3. Imposible minar cualquier bloque con la mano

**Síntoma:** mantener el clic izquierdo sobre un bloque **no hace nada**
(no inicia la mina: sin sonido, sin grieta, sin progreso).

**Estado actual del código (la mecánica existe y debería funcionar):**
- `public/input.js`: `startMiningAt()` → `send("block_action", {action:
  "break", x, y, z})` + `showCrack()` + `playBreak()`. El clic se resuelve
  con `raycastTerrainAndMobs()` (raycaster.far = 7).
- `server/net.js` → `mining.startMining()` → `tickMining()` en `mainLoop`
  avanza el progreso → `finishMining()` rompe el bloque.
- `miningSpeed(tool, block)` devuelve **1 con la mano** (no 0): la mano sí
  puede romper, solo que lento (`breakSeconds` = dureza / 1).
- `canHarvest(tool, block)`: con la mano **no hay drop** de piedra,
  adoquín ni minerales (solo pico); el resto de bloques (tierra, césped,
  madera, hojas, arena...) sí dropean a mano.
- `startMiningAt` rechaza explícitamente mesa de crafteo (15), horno (16),
  cofre (22), agua y bloques desconocidos (-1).

**Decisión del usuario:** **Arreglar el clic** (input/raycast/servidor) **y
además dar drop a mano de bloques básicos** (tierra, madera) — la mecánica
"mano lenta sin drop en piedra/minerales" se mantiene como en Minecraft.

**Alcance:**
1. Diagnosticar por qué el clic no inicia la mina: candidatos —
   (a) `controls.isLocked` falso al hacer clic, (b) el rayo no intersecta el
   chunk (terreno), (c) el servidor descarta el `block_action`, (d) el
   `pointerlockchange` cancela la mina.
2. Verificar el flujo completo con un test headless/E2E de minería a mano.
3. Confirmar que `canHarvest` da drop a mano de bloques básicos (tierra,
   césped, madera, arena, hojas). Ajustar si el drop manual está roto.
4. Regresión: `tests/unit-mineria.js`, `tests/e2e-durabilidad.js`.

**Criterio de aceptación:** manteniendo clic izquierdo sobre un bloque
básico, se ve la grieta, el bloque se rompe y el drop entra al inventario.
En piedra/minerales sin pico se rompe lento **sin** drop (como Minecraft).

---

### B4. Ciclo día/noche a 20 minutos (como Minecraft original)

**Síntoma:** el ciclo dura 4 minutos; debe durar 20.

**Estado actual del código:**
- `DAY_CYCLE_MS = 240000` (4 min) en **ambos** `constants.js` (servidor y
  cliente). El comentario dice "4 minutos: 2 de día, 2 de noche".
- El servidor es la fuente de verdad del `dayTime`; el cliente extrapola la
  fase con `currentPhase()` (daynight.js). El spawn de hostiles usa el
  mismo reloj del servidor (solo de noche).
- Los tests que dependen del ciclo usan `dayTime` relativo (no segundos
  absolutos), pero hay que revisar `unit-red.js`, `unit-cama.js` y
  `audit-fase7.js` por constantes de tiempo.

**Decisión del usuario:** **Sí, 20 minutos completos** con la distribución
estilo Minecraft: ~10 min día, ~1.5 atardecer, ~7 min noche, ~1.5 amanecer.

**Alcance:**
1. Cambiar `DAY_CYCLE_MS` a `1200000` en **ambos** `constants.js`
   (servidor ↔ cliente, los audita `tests/unit-sync.js`).
2. Revisar que la distribución día/noche del servidor (qué fracción del
   ciclo es "noche" para el spawn de hostiles) siga siendo correcta con el
   nuevo largo.
3. Revisar/ajustar tests con tiempos relativos al ciclo.

**Criterio de aceptación:** un ciclo completo dura 20 min; la noche (spawn
de hostiles) ocupa la fracción correspondiente (~7 min).

---

### B5. La tecla E siempre abre el inventario (no se puede usar en nombre/mundo)

**Síntoma:** al escribir la letra "e" en el campo de nombre del jugador o del
mundo en el menú, se abre el inventario.

**Estado actual del código:**
- `public/input.js` keydown: `case "KeyE": toggleInventory();` — el handler
  solo retorna si `isChatFocused()` (el chat), **no** si hay un input de
  texto del menú enfocado.
- El menú de mundos tiene campos de texto (nombre del mundo, semilla).

**Decisión del usuario:** **E solo abre el inventario en juego** — ignorar la
tecla E (y las demás teclas de juego) cuando hay un campo de texto enfocado
(menú principal, menú de mundos, chat).

**Alcance:**
1. Generalizar la guarda de foco: si `document.activeElement` es un
   `INPUT`/`TEXTAREA`/campo editable, el handler de teclado de juego no debe
   reaccionar (no solo `isChatFocused()`).
2. Aplicar a las teclas de movimiento, E, números, F3, etc.
3. Verificar que el chat (que ya funciona) no se rompa.

**Criterio de aceptación:** escribir "e" (y W/A/S/D/1-9) en el nombre del
mundo o del jugador funciona; E abre el inventario solo con el pointer lock
activo en juego.

---

### B6. Chunks lejanos con texturas "disminuidas" que no se restauran al acercarse

**Síntoma:** el mundo carga con texturas completas cerca y "disminuidas" (LOD)
a lo lejos; al acercarse a esas zonas se genera la física del terreno, pero
se mantienen con texturas disminuidas o transparentes.

**Estado actual del código:**
- LOD en `public/lod.js`: `LOD_ON_DIST = 56`, `LOD_OFF_DIST = 44` (bloques),
  con histéresis (`lodTierFor(dist, current)`).
- `public/world.js` decide el tier por chunk; al cruzar el umbral
  reconstruye (`removeChunkMesh` + `buildLodGeometry` o `buildChunkGeometry`).
- El bug sugiere que la **reconstrucción a 'full' no se dispara** al
  acercarse (o la geometría LOD queda sin textura y se ve transparente).

**Decisión del usuario:** **Solo arreglar el LOD** (que al acercarse el chunk
vuelva a textura completa). **No** se baja el renderDistance por defecto.

**Alcance:**
1. Diagnosticar por qué el LOD no vuelve a 'full': candidatos —
   (a) la distancia se mide al centro del chunk y la histéresis nunca se
   cruza, (b) `updateLOD`/bucle no se llama para chunks ya cargados,
   (c) la geometría LOD no se elimina al reconstruir, (d) el material/atlas
   del chunk completo no se aplica.
2. Corregir la transición LOD→full (que reconstruya con el atlas completo y
   texturas finas).
3. Verificar con F3 (`window.__mcVisibleChunks`) y test headless si existe
   (`tests/unit-lod.js`).

**Criterio de aceptación:** un chunk lejano en LOD, al acercarte a <44
bloques, reconstruye con texturas completas; no queda transparente ni con
texturas disminuidas.

---

### B7. Estrellas visibles de día

**Síntoma:** las estrellas se ven de día, aunque el brillo del sol las
oculta parcialmente.

**Estado actual del código:**
- `public/sky.js`: las estrellas se pintan con `uStars * star` y
  `uStars = (1 - dayFactor) * 0.9`. El problema: `dayFactor` se apoya en
  `sin(phase*2π)` y en amanecer/atardecer (dusk) el sol aún está bajo pero
  `dayFactor` ya no es 0; además `dir.y > 0.05` pinta estrellas en todo el
  hemisferio superior aunque el sol esté sobre el horizonte.

**Decisión del usuario:** **Solo de noche estricta** — dibujar estrellas
únicamente cuando el sol está bajo el horizonte (sin estrellas en
amanecer/atardecer).

**Alcance:**
1. Cambiar el criterio de `uStars` en `sky.js`/`daynight.js`: estrellas
   cuando el sol está por debajo del horizonte (usar la posición vertical
   real del sol, no `dayFactor`), con fade suave corto.
2. Asegurar 0 estrellas en amanecer/atardecer (dusk alto).

**Criterio de aceptación:** de día no se ve ninguna estrella; de noche se ven
todas; en el crepúsculo la transición es suave.

---

### B8. El sol y la luna son iguales: sol más amarillo + fases lunares

**Síntoma:** el sol y la luna se ven iguales.

**Estado actual del código:**
- `public/sky.js` shader: sol `vec3(1.0, 0.96, 0.85)` + halo cálido; luna
  `vec3(0.92, 0.95, 1.0)` + halo frío. Ya hay diferenciación, pero sutil; y
  la luna es siempre un disco lleno (sin fases).
- `daynight.js`: `DAY_SUN = 0xfff2d0`, `NIGHT_SUN = 0x9fb4d8`.

**Decisión del usuario:** **Diferenciar colores (sol más amarillo/cálido,
luna más blanca/azulada) y añadir fases lunares visibles.**

**Alcance:**
1. Sol más amarillo: subir el componente R/G y bajar B en el disco y halo
   del shader (`vec3(1.0, 0.9, 0.6)`-ish) y en `DAY_SUN`.
2. Luna más blanca/azulada y con **fases**: máscara de fase en el shader
   (disco iluminado según una fase lunar 0..1), con las fases en ciclo
   **estilo Minecraft (8 días de juego)** = 8 ciclos día/noche completos.
3. El servidor (o el cliente, determinista desde la semilla) debe derivar la
   fase lunar actual del mismo reloj para que todos la vean igual.

**Criterio de aceptación:** el sol se distingue claramente de la luna (tono);
la luna muestra fases (nueva, creciente, llena, menguante) que avanzan un
ciclo completo cada 8 días de juego y son consistentes entre jugadores.

---

### B9. Los mobs son figuras rectangulares: formas tipo Minecraft

**Síntoma:** los mobs se ven como cajas rectangulares.

**Estado actual del código:**
- `public/mobs.js`: cada mob es **un** `BoxGeometry(0.6, 1.8, 0.6)` con
  texturas procedurales por cara (mobtextures.js, atlas 2x2 frente/lado/
  arriba/abajo). Solo varía la escala por tipo (`MOB_SCALE`).
- Los jugadores remotos también son un solo box (`makeHumanoid`).

**Decisión del usuario:** **Formas multibloque estilo Minecraft** — cuerpos
compuestos por partes (cabeza, torso, brazos, piernas) con texturas por
parte, como el modelo del juego original.

**Alcance:**
1. Rediseñar el mesh de mobs como **grupo de partes** (esquema `MOB_PARTS`
   abajo).
2. Adaptar `mobtextures.js` al atlas por parte (abajo).
3. Mantener: quema solar (tinte), escala por tipo, `isBaby` a media escala,
   raycast de ataque (`mobMeshes`), etiquetas de nombre y los snapshots.
4. Aplicar el mismo esquema (o al menos mejorar) a los jugadores remotos.

**Criterio de aceptación:** cada especie de mob se distingue por su silueta
(cabeza + cuerpo + extremidades), mantiene sus texturas, la quema solar y el
raycast de combate siguen funcionando.

#### Esquema multibloque: estructura de datos `MOB_PARTS`

Nuevo módulo (o export desde `mobtextures.js`) que declara las partes de cada
especie con **tamaño y posición relativos al grupo** (eje Y: 0 = pies, +Y =
arriba; X/Z centrados en 0). Es la **única fuente de verdad** del modelo:
`mobs.js` construye los meshes iterando esta tabla y `mobtextures.js` la usa
para saber qué teselas generar.

```js
// Formato: { parts: [{ name, size: [w,h,d], pos: [x,y,z] }], scale }
const MOB_PARTS = {
	zombie: {
		scale: 1,
		parts: [
			{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
			{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
			{ name: "armL", size: [0.25, 0.75, 0.25], pos: [-0.375, 1.05, 0] },
			{ name: "armR", size: [0.25, 0.75, 0.25], pos: [0.375, 1.05, 0] },
			{ name: "legL", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
			{ name: "legR", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
		]
	},
	// ... resto de especies
};
```

**Dimensiones por parte y por especie (unidades = bloques):**

| Especie | Partes (tamaño `w×h×d`, centro `[x,y,z]`) | Altura total |
|---------|-------------------------------------------|--------------|
| **zombi** | head `0.5×0.5×0.5` `[0,1.55,0]` · body `0.5×0.75×0.25` `[0,1.05,0]` · armL/R `0.25×0.75×0.25` `[±0.375,1.05,0]` · legL/R `0.25×0.75×0.25` `[±0.125,0.375,0]` | 1.8 |
| **esqueleto** | igual que zombi (silueta humanoide; cambian solo las texturas) | 1.8 |
| **enderman** | head `0.5×0.5×0.5` `[0,2.05,0]` · body `0.5×0.75×0.25` `[0,1.35,0]` · armL/R `0.25×1.0×0.25` `[±0.375,1.4,0]` · legL/R `0.25×1.0×0.25` `[±0.125,0.5,0]` | 2.55 (alto) |
| **creeper** | head `0.5×0.5×0.5` `[0,1.35,0]` · body `0.5×0.6×0.25` `[0,0.8,0]` · legFL/FR `0.25×0.5×0.25` `[±0.125,0.25,0.125]` · legBL/BR `0.25×0.5×0.25` `[±0.125,0.25,-0.125]` | 1.6 |
| **araña** | body `0.7×0.5×0.7` `[0,0.35,-0.15]` · head `0.5×0.3×0.5` `[0,0.35,0.3]` · 8 patas `0.08×0.08×0.55` a los lados (con rotación) | ~0.6 (con patas) |
| **conejo** | body `0.4×0.4×0.4` `[0,0.25,0]` · head `0.3×0.3×0.3` `[0,0.45,0.2]` · earL/R `0.08×0.3×0.05` `[±0.09,0.75,0.15]` | ~0.9 (con orejas) |
| **lobo/vaca/cerdo/oveja** | body `0.6×0.6×1.0` `[0,0.55,0]` (alargado en Z) · head `0.4×0.4×0.4` `[0,0.6,0.55]` · 4 patas `0.15×0.5×0.15` `[±0.2,0.25,±0.3]` | ~1.1 |
| **pollo** | body `0.4×0.4×0.4` `[0,0.3,0]` · head `0.25×0.25×0.25` `[0,0.5,0.15]` · 2 patas `0.06×0.3×0.06` | ~0.75 |

Notas:
- Las dimensiones **base** son las del modelo sin escala; el `scale` por
  especie y el `MOB_SCALE` existente (araña 0.7, conejo 0.55, lobo 1.05) se
  aplican al **grupo raíz** (compatibilidad con el snapshot y los tests).
- Los bebés (`isBaby`) siguen a media escala del grupo (`0.5`).
- Los brazos/piernas laterales comparten textura entre sí (misma `name`
  base, sufijo L/R solo para la posición).

#### Adaptación de `mobtextures.js`: atlas por parte

Hoy cada tipo genera un **atlas 2x2** (front/side/top/bottom) de UNA tesela
16×16 que cubre el mob entero. Con multibloque se pasa a **una tesela por
parte** en un atlas de una fila (o columnas):

- **Layout:** `canvas` de `N × 16` px, una tesela 16×16 por parte única del
  mob. Humanoides: 4 teselas `[head, body, arm, leg]` (arm/leg compartidas
  por los dos lados). Creeper: 3 `[head, body, leg]`. Araña: 2 `[body,
  head]`. Conejo: 3 `[body, head, ear]`. Cuadrúpedos: 3 `[body, head,
  leg]`. Pollo: 3 `[body, head, leg]`.
- **Nueva API (sustituye/amplía la actual):**
  - `getMobAtlas(type)` — devuelve la `CanvasTexture` de la fila (mismos
    filtros `NearestFilter`, `colorSpace = SRGBColorSpace` y cache que hoy).
  - `mobPartRects(type)` — devuelve `{ partName: [u0,v0,u1,v1] }` por parte
    (reemplaza a `mobFaceRects()`; se mantiene una versión interna para la
    compatibilidad del box simple si hiciera falta).
  - `mobTextureTypes()` — sin cambios (lo audita `unit-sync.js` contra
    `MOB_COLORS` del servidor).
- **Funciones de dibujo por parte:** las actuales (`drawZombieFront`,
  `drawCreeperFront`, ...) dibujan la tesela completa del mob; se
  refactorizan en **una función por parte** reutilizando las paletas
  existentes (`Z`, `C`, `S`, `E`, `SP`, `W`, `CO`, `P`, `CH`, `SH`, `R`):
  p. ej. `drawZombieHead` (cara con ojos/pelo), `drawZombieBody` (camisa
  azul rota), `drawZombieArm` (piel/manga), `drawZombieLeg` (pantalón);
  `drawCreeperHead` (cara de 4 ojos), `drawCreeperBody` (moteado),
  `drawCreeperLeg` (verde oscuro); `drawSpiderBody` (abdomen oscuro) y
  `drawSpiderHead` (racimo de ojos). El contenido visual se conserva
  (misma paleta y motivos), solo cambia la distribución por parte.
- La tesela de una parte puede repetirse en sus 4 caras (caja) o, si se
  quiere más detalle, pintar también `front`/`side` por parte (misma
  convención de `FACE_ORDER` de hoy). La opción mínima: **1 tesela por
  parte** para las 4 caras de su caja (bajo coste, silueta correcta).

#### Adaptación de `public/mobs.js`: construcción del grupo

- `makeMobMesh(type, fallbackColor)` pasa a construir un **`THREE.Group`**
  con un mesh hijo por parte de `MOB_PARTS[type]` (o un solo box de
  color plano si no hay atlas, como hoy). Cada parte es un
  `BoxGeometry(size)` con los UVs remapeados hacia su tesela del atlas
  (misma técnica de remapeo por grupos que usa hoy el box único: se
  recogen los vértices únicos de cada grupo de la caja y se escriben los
  UV de su rect).
- **Un solo material por mob** (el atlas completo, base `0xffffff`): la
  quema solar (`mesh.material.color.setHex(...)`) se aplica una vez al
  material compartido y tiñe todas las partes (igual que hoy).
- **Raycast de combate (crítico):** `mobMeshes` seguirá apuntando al
  **grupo raíz** (así `updateMobs`/`removeMob` no cambian), pero el rayo
  intersectará los **hijos** (las cajas). `raycastTerrainAndMobs` en
  `input.js` debe intersectar con recursión y subir por `hit.object.parent`
  hasta encontrar `userData.mobId`/`mobType` (que se copian al grupo raíz
  y a cada hijo, o se leen del padre). Sin este cambio, el clic dejaría de
  golpear a los mobs (regresión directa de B10).
- **Posición/escala:** `mesh.position.set(m.x, m.y, m.z)` y la escala
  `(isBaby ? 0.5 : 1) * MOB_SCALE[type]` se aplican al grupo raíz; las
  partes usan las posiciones relativas de `MOB_PARTS`. La `y` del mob
  (suelo + 1 en el servidor) queda en el grupo: las partes con Y desde 0
  (pies) se anclan correctamente al suelo.
- **Etiquetas de nombre** y **jugadores remotos**: el name tag se añade al
  grupo (como hoy se añade al box); los remotos pueden reutilizar
  `MOB_PARTS` con un esqueleto humanoide genérico (head/body/arms/legs con
  el color plano del jugador) para dejar de ser una sola caja.

---

### B10. Imposible luchar contra los mobs hostiles

**Síntoma:** golpear a un mob no produce ningún efecto; el usuario reporta
que **ni siquiera puede apuntar al mob** (el clic no registra sobre él).

**Estado actual del código:**
- `public/input.js`: `raycastTerrainAndMobs()` intersecta
  `[...terrainMeshes, ...mobMeshes]` con `raycaster.far = 7`; si
  `hit.object.userData.mobId` → `send("attack_mob", {mobId})`.
- `server/net.js` `attack_mob`: rango ≤4 bloques, daño `SWORD_DAMAGE[tool]
  || 2` (mano = 2), desgasta espadas (`applyToolWear(p, true)`), drops y XP.
- Candidatos al fallo: (a) el rayo intersecta el terreno antes que el mob
  (el mob está "dentro" del bloque o la geometría no es intersectable),
  (b) `userData.mobId` no está en el mesh golpeado, (c) el mob está a >4
  bloques (rango servidor) pero el rayo llega a 7 (rango cliente) → el
  servidor descarta el ataque en silencio, (d) `MOB_SCALE`/posición y el
  hitbox del raycast no coinciden.

**Decisión del usuario:** **Arreglar el raycast + daño a mano** (que la mano
haga daño base 2) **y además** verificar espadas, **knockback** (retroceso al
golpear) y animación de daño del mob.

**Alcance:**
1. Diagnosticar el raycast de mobs (probablemente el mob queda oculto tras
   el terreno o el rango cliente (7) > rango servidor (4) provoca ataques
   en silencio). Alinear rangos o ampliar el del servidor a 7.
2. Confirmar que la mano hace 2 de daño (ya lo hace en el código) y que el
   mob se daña/muere correctamente.
3. Añadir **knockback** (retroceso del mob al recibir un golpe) replicado a
   los jugadores (mobs_update con posición).
4. Añadir **feedback de daño** del mob (p. ej. flash rojo/parpadeo o
   partículas) para que el golpe se sienta.
5. Regresión: `tests/unit-mobs-ia.js`, `unit-red.js`, `unit-metricas.js`.

**Criterio de aceptación:** clic izquierdo sobre un mob: el mob se tiñe/daña,
recibe knockback y con 10 golpes de mano (20 HP / 2) muere con drops/XP; con
espada muere más rápido y se desgasta.

---

## 3. Decisiones del usuario (registro de la entrevista)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Controles invertidos (B1) | Arreglar el bug de base **y** añadir toggle "Controles invertidos" en Ajustes |
| 2 | Tecla E (B5) | E abre inventario solo en juego; ignorarla con campo de texto enfocado |
| 3 | Ciclo día/noche (B4) | Sí, 20 min completos con distribución estilo Minecraft |
| 4 | Estrellas (B7) | Solo de noche estricta (sin estrellas en crepúsculo) |
| 5 | Sol/luna (B8) | Diferenciar colores **y** añadir fases lunares (ciclo estilo Minecraft: 8 días de juego) |
| 6 | Mobs visual (B9) | Formas multibloque estilo Minecraft (partes: cabeza, torso, brazos, piernas) |
| 7 | LOD (B6) | Solo arreglar el LOD; **no** bajar el renderDistance por defecto |
| 8 | Causa de la vida (B2) | Incluir diagnóstico en la Fase 8 (la causa no está confirmada) |
| 9 | Minería a mano (B3) | Arreglar el clic **y** dar drop a mano de bloques básicos (tierra, madera) |
| 10 | Alcance combate (B10) | Raycast + daño a mano + espadas + knockback + feedback de daño |

---

## 4. Plan de la Fase 8 (orden de ejecución)

### Bloque A — Bugs bloqueantes (hacen el juego injugable)
1. **B10 → B2** (encadenados): arreglar el raycast de mobs y el combate a
   mano; el diagnóstico de B2 (telemetría de daño) debe ejecutarse en
   paralelo o justo después para confirmar que la causa de la muerte era la
   indefensión ante los mobs.
2. **B3**: minería a mano (diagnóstico del clic + drop a mano de bloques
   básicos). Desbloquea todo el crafteo (sin madera no hay mesa de crafteo,
   sin piedra no hay picos → sin espadas).

### Bloque B — Correcciones de mecánica
3. **B1**: controles A/D (fix + toggle en Ajustes).
4. **B4**: ciclo día/noche a 20 min (sync servidor↔cliente + tests).
5. **B5**: tecla E con input de texto enfocado.

### Bloque C — Estética y rendimiento
6. **B7**: estrellas solo de noche estricta.
7. **B8**: sol amarillo + fases lunares.
8. **B9**: mobs multibloque (rediseño de mallas + texturas por parte).
9. **B6**: LOD que no vuelve a textura completa (solo fix, sin bajar radio).

### Bloque D — Verificación final
10. Suite completa de tests (unitarios + E2E + auditorías) y playtest manual
    de los 10 bugs.
11. Documentar en `TODO.md` (sección Fase 8) y actualizar `README.md` si el
    protocolo o los ajustes cambian (nuevo ajuste `invertControls`).

---

## 5. Archivos implicados (por bug)

| Bug | Archivos |
|-----|----------|
| B1 | `public/input.js`, `public/player.js`, `public/settings.js`, `public/index.html`, `public/estilo.css` |
| B2 | `server/net.js`, `server/players.js`, `server/mobs.js` (+ telemetría F3/`debug.js`) |
| B3 | `public/input.js`, `public/world.js`, `server/mining.js`, `server/constants.js` (`canHarvest`), `server/net.js` |
| B4 | `server/constants.js`, `public/constants.js`, tests de ciclo (`unit-red`, `unit-cama`, `unit-sync`) |
| B5 | `public/input.js`, `public/ui.js` (chat/menú) |
| B6 | `public/lod.js`, `public/world.js`, `public/textures.js` |
| B7 | `public/sky.js`, `public/daynight.js` |
| B8 | `public/sky.js`, `public/daynight.js`, posible `server/net.js` (fase lunar del reloj) |
| B9 | `public/mobs.js`, `public/mobtextures.js`, `public/player.js` (jugadores remotos) |
| B10 | `public/input.js` (raycast), `server/net.js` (rango), `server/mobs.js` (knockback), `public/mobs.js` (feedback) |

---

## 6. Riesgos y notas

- **B2/B3/B10 encadenados:** corregir B10 (poder defenderse) y B3 (poder
  minar) puede "resolver" B2 sin un fix propio — el diagnóstico debe
  confirmarlo antes de añadir mecánicas extra (p. ej. zona segura de spawn).
- **B4 afecta a tests:** hay que revisar cualquier test que asuma un ciclo
  de 4 min (buscar `DAY_CYCLE_MS` y constantes de tiempo derivadas).
- **B9 es el cambio más invasivo:** el raycast de mobs, la quema solar, las
  etiquetas de nombre y los snapshots dependen de `mobMeshes`; el rediseño a
  partes debe mantener esos contratos (el mesh raíz conserva
  `userData.mobId`/`mobType`).
- **B6 requiere reproducción visual:** el bug de LOD solo se ve en navegador
  (los tests de servidor no lo detectan); usar F3/`window.__mc*` y un
  playtest headless para confirmar la transición LOD→full.
- **Fuera de alcance (no tocar):** redstone, dimensiones, clima, cuentas,
  BD externa, y cualquier cambio de rendimiento no pedido (no bajar
  renderDistance, no greedy meshing).

---

## 7. Criterios de aceptación globales de la Fase 8

1. Los 10 bugs reportados están corregidos o documentados como no-reproducibles
   con su diagnóstico.
2. El bucle básico de supervivencia funciona: minar a mano → obtener bloques
   básicos → craftear herramientas → luchar contra mobs → no morir sin causa.
3. La suite de tests pasa (unitarios + E2E + auditorías) y se añaden tests
   para cada fix donde aplique.
4. `biome check` con 0 errores en los archivos tocados.
5. `TODO.md` actualizado con la sección Fase 8 y los bugs en "Bugs conocidos"
   marcados como corregidos.
