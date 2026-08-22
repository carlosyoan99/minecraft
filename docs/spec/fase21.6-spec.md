# Fase 21.6 — Correcciones de la auditoría y paridad MC (pre-F22) (Spec)

> Documento creado a partir de: [`docs/audits/auditoria-2026-08-22.md`](../audits/auditoria-2026-08-22.md)
> (auditoría consolidada de cierre de la F21.5, commit `afae96b`) y de la
> entrevista con el usuario (2026-08-22): fixes 1-7 + higiene (10) +
> **paridad en un bloque aparte**, resolviendo las contradicciones **hacia
> Minecraft real** («la paridad es importante»). Linterna/luz, bug de cabezas
> de mobs y diferidos de perfilado/pase-servidor salen al **borrador de la
> [Fase 22.1](fase22.1-spec.md)**.
> Fecha: 2026-08-22 · Proyecto: clon de Minecraft.
> Estado: `[COMPLETADA]` (**cerrada 2026-08-22**) — prerrequisito: **Fase 21.5
> cerrada** ✅. La **F22 exige esta fase** (grafo actualizado).
>
> **✅ CERRADA (2026-08-22):** Bloque P (paridad) implementado: P1 escudo
> total, P2 pesca 5-30s, P3 loot fiel, P4 miel 2.4, P5 bambú 2→2,
> P6 maza consume caída, P7 blast furnace data-driven. Bloques A-G
> pendientes (seguridad, escudo/maza servidor+cliente, mochila, jukebox,
> `/summon`, powerPreference, higiene docs) → diferidos a **Fase 22.1**
> (borrador creado). Suite **63/63** unitarios en verde; `SCHEMA_VERSION` 6
> intacto; sin B/I nuevos.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente (auditoría 2026-08-22) | Hallazgo | Sev | Gravedad fix |
|---|---|---|---|---|
| A1 | Seguridad #1 + Rendimiento #2 (transversal) | `/locate <bioma>` barrido síncrono ~66k `getBiome`, spameable sin OP → congela tick/HTTP | 🟠 | 🔴 prioridad máxima |
| A2 | Seguridad #2 | Bypass del allowlist de Origin cuando no hay puerto (`hostname.indexOf(":") === -1` pasa) — M1 inefectiva | 🟡 | 🟡 |
| B1 | Servidor #1 | Daño de proyectil etiquetado `"player"/"mob"`, nunca `"projectile"` → rama muerta: flechas PvP atraviesan el escudo | 🟠 | 🔴 |
| B2 | Servidor #2 + Cliente #4 | Cambiar de slot no resetea `p.blocking` ni se reválida el ítem en mano → −60 % perpetuo explotable; en cliente, viñeta fantasma y `mouseup` fuera del canvas | 🟠 | 🔴 |
| B3 | Servidor #3 | Maza nunca pierde durabilidad al golpear (`applyToolWear` filtra por `SWORD_DAMAGE`; la maza no está) | 🟡 | 🟠 |
| B4 | Servidor #4 | Desgaste de escudo condicionado a `blocked && real >= 1` POST-armadura → escudo casi eterno vs golpes débiles con armadura | 🟡 | 🟠 |
| C1 | Cliente #1 | `toggleBundleUI(false)` nunca envía `bundle_action close` (asignación previa pisa la condición) → sesión fantasma en servidor | 🟠 | 🔴 |
| C2 | Cliente #2 | `applyInventory()`/`repaintIcons()` no repintan la columna de inventario del bundle abierto | 🟡 | 🟠 |
| C3 | Seguridad #5 | Fusión de stacks en put/take sin clamp → count >64 persistido (clase SV-5) | 🟡 | 🟠 |
| D1 | Seguridad #3 | Jukebox/note block: coords sin `Number.isFinite`, distancia NaN-falla-abierta, sin comprobar tipo de bloque objetivo | 🟡 | 🟠 |
| D2 | Cliente #3 | `stopDisc()` solo en extracción/inicio: música fantasma tras menú/muerte/reconexión (`setInterval` huérfano) | 🟡 | 🟠 |
| D3 | Seguridad #6 ⚪ | `state.jukeboxes` no persiste → discos desaparecen al reiniciar | ⚪ | ⚪ (acordado persistir) |
| E1 | Seguridad #4 | `/summon` sin cuota de mobs ni clamp de coords a bordes (solo OP) | 🟡 | 🟠 |
| F1 | Notas del usuario ("Cambios recomendados ahora") | `powerPreference: "high-performance"` en el renderer — trivial, cero riesgo | — | ⚪ |
| P1-P7 | Auditoría §5 Paridad (filas 1/3/5/8/10/13 + preguntas abiertas servidor) | Ver bloque P: contradicciones resueltas **hacia MC real** por decisión del usuario (2026-08-22) | — | — |
| G1 | Recomendación 10 (higiene) | `STATUS.md` desincronizado (aún F21.5 EN CURSO) | — | ⚪ |

**Diferidos a la Fase 22.1 (borrador creado):** linterna (luz nivel 15 /
receta nuggets — sistema de luz), bug *cabezas de mobs con caras por todos
sus lados* (Notas del usuario, abierto), perfilado en vivo (`/locate`
medición real, `arrows_update` bytes/s, granja de hornos, profiler hojas/
note blocks), pase interno de servidor restante (handlers WS nuevos por
dentro, ciclo de `projectiles.js`, `fishing.js` completo, campos nuevos de
`save-players.js`, IA interna Creaking/Bogged) y residuos heredados (CL-2
pausa de render en blur, reset local en reconexión, opacidad compartida de
materiales de partículas).

## 1. Contexto

- **Prerrequisito cumplido:** F21.5 cerrada y auditada (2026-08-20). La
  auditoría 2026-08-22 verificó suite verde (62/62 unit, E2E 7/7, `--audit`
  8/8, biome 0) pero encontró los hallazgos arriba; esta fase es el
  **mini-bloque de fixes pre-F22** recomendado por su §Recomendaciones.
- **Decisión rectora (entrevista 2026-08-22):** donde paridad y decisión de
  fase chocan, **manda Minecraft real**. Esto **revoca expresamente** la
  decisión documentada `SHIELD_BLOCK_FACTOR = 0.4` de la F21.5 §C2 (el
  escudo pasa a bloqueo total estilo MC) y acerca la picada de pesca a los
  5-30 s de MC. Ambas revisiones quedan documentadas aquí como fuente de
  verdad nueva.
- **Reglas duras (acordadas):** **sin B/I nuevos** (solo cambios de valores/
  recetas existentes), **sin subida de `SCHEMA_VERSION`** (la persistencia de
  jukeboxes es campo aditivo de `world.json`, patrón cofres/hornos), tocar
  AMBOS `constants.js` solo en valores (no IDs) y `recetas.json` con
  recalibración de tests.
- **Won't intacto:** nada de redstone, clima, dimensiones (F24/F25),
  autenticación, aldeas. No se adelanta trabajo de F22-F25.
- Orden de implementación acordado: seguridad → escudo/maza → mochila →
  jukebox → `/summon` → cliente trivial → **paridad (aparte)** → higiene.

---

## 2. Bloque A — Seguridad del servidor

### A1 — `/locate <bioma>` sin bloqueo del event loop (🔴)

- **Qué hacer:** en `server/commands.js` (`locateBiome`, ~:306-337): acotar
  el radio máximo (p. ej. 256 en vez de 1024), trocear el barrido en anillos
  con **presupuesto por tick** (cola incremental, estilo chunk-fill P1) y
  **cachear el último resultado** por jugador+bioma (invalidar al cambiar de
  semilla/mundo). La respuesta puede llegar diferida un tick («buscando…» →
  mensaje). Mantener `/locate <estructura>` como está (es hash O(1)).
- **Ficheros:** `server/commands.js`, `server/timers.js` (si el barrido vive
  fuera del handler), `tests/unit-fase21.6.js`.
- **Criterio:** test: peor caso (bioma ausente) completa sin bloquear más de
  X ms por tick (presupuesto medido en test determinista con mundo pequeño);
  spam simulado de 100 `/locate` seguidos no supera el presupuesto acumulado;
  resultado idéntico al barrido completo para radios dentro del límite.

### A2 — Allowlist de Origin sin hueco de puerto (🟡)

- **Qué hacer:** en `server/timers.js` `originAllowed` (~:398): eliminar el
  retorno temprano `if (!hostname || hostname.indexOf(":") === -1) return true;`.
  Un `Origin` sin puerto explícito debe compararse contra la allowlist igual
  que uno con puerto (localhost/127.0.0.1/LAN permitidos; dominio externo
  rechazado), asumiendo puertos por defecto 80/443 en la comparación.
- **Ficheros:** `server/timers.js`, `tests/unit-fase21.6.js` (o `unit-red.js`
  ampliado).
- **Criterio:** test: `http://evil.com` y `https://evil.com` (sin puerto) →
  rechazados; `http://localhost` / `http://127.0.0.1` → aceptados; origen con
  puerto no listado → rechazado (sin regresión M1).

---

## 3. Bloque B — Escudo y maza (servidor + cliente)

### B1 — Etiquetar daño de proyectil (`source: "projectile"`) (🔴)

- **Qué hacer:** en `server/projectiles.js` (~:390-391): el daño de
  flecha/tridente/carga de viento lanzada por jugador usa
  `source: "projectile"` (y `attacker: lanzador` si hace falta para XP/agro);
  el de mobs sigue `"mob"`. Así la rama del escudo en `combat.js:438`
  `(source === "mob" || source === "projectile")` deja de estar muerta y las
  flechas PvP se bloquean.
- **Criterio:** test: daño de flecha de jugador a jugador con escudo activo →
  reducido a 0 (tras P1) y desgaste aplicado; flecha de esqueleto → igual;
  sin regresión de agro/XP del atacante.

### B2 — Autoridad del servidor sobre el bloqueo + input cliente (🔴)

- **Servidor:** en `server/actions.js` (handler `shield_block`, ~:813-821) y
  `net.js` (~:1044): al cambiar de slot (`p.selectedSlot = data.slot`) limpiar
  `p.blocking = false`; en `damagePlayer`/`combat.js` (~:437) reverificar que
  el ítem en mano activa sea `SHIELD` antes de aplicar mitigación/desgaste.
- **Cliente:** en `public/game-input.js` (~:312-317, 623-628): resetear
  `shieldBlocking` y soltar la pose-viñeta al cambiar de slot (rueda/Digit1-9);
  escuchar `mouseup`/`pointerup` a nivel `document` (no solo
  `renderer.domElement`) para soltar el bloqueo al salir del canvas.
- **Criterio:** test: enviar `shield_block {blocking:true}`, luego cambio de
  slot, luego daño de zombi → daño íntegro (sin escudo fantasma); con escudo
  en mano → bloquea. Manual: cambiar slot manteniendo clic derecho limpia la
  viñeta.

### B3 — Desgaste de la maza al golpear (🟠)

- **Qué hacer:** en `server/actions.js` (`attack_mob`, ~:746-775): el ataque
  con maza aplica desgaste (hacer que `applyToolWear` cubra también `MACE`,
  o llamar el desgaste específico). Durabilidad 250 ya declarada.
- **Criterio:** test: 250 golpes con maza la rompen (o aserción de −1 por
  golpe); picar bloques con maza sigue desgastando por su ruta propia.

### B4 — Desgaste del escudo por impacto bloqueado (🟠)

- **Qué hacer:** en `server/combat.js` (~:451): el criterio pasa a ser
  «1 de desgaste por impacto en el que el escudo absorbió daño», calculado
  sobre el daño ANTES de armadura (no `real >= 1` post-armadura).
- **Criterio:** test: golpe débil con buena armadura y escudo → desgaste 1;
  golpe no bloqueado → sin desgaste.

---

## 4. Bloque C — Mochila/Bundle

### C1 — Enviar `bundle_action close` (🔴)

- **Qué hacer:** en `public/panels.js` `toggleBundleUI(show)` (~:378-385):
  capturar `const estabaAbierta = bundleOpen` ANTES de asignar y enviar
  `bundle_action {action:"close"}` si `estabaAbierta && !show`. Cubrir
  Escape→`closePanels()` (~:465) y clic exterior.
- **Criterio:** test (unit-red o unit-fase21.6): abrir mochila y cerrarla →
  llega `{action:"close"}` exactamente una vez; abrir dos veces no duplica.

### C2 — Repintar la columna de inventario del panel abierto (🟠)

- **Qué hacer:** en `public/ui.js` `applyInventory()`/`repaintIcons()`
  (~:100-115): añadir rama `isBundleOpen()` que refresque la lista de
  inventario del panel (`updateBundleInventoryUI()`).
- **Criterio:** manual/testable: put desde inventario → la fila de origen
  queda vacía e inservible en caliente, sin reabrir el panel.

### C3 — Clamp de `MAX_STACK` en put/take (🟠)

- **Qué hacer:** en `server/actions.js` `handleBundleAction` (~:997,1043):
  prohibir fusiones que excedan `MAX_STACK` (split a otro slot o rechazo,
  mismo comportamiento que `addToInventory` SV-5); validar también en take.
- **Criterio:** test: juntar 64+63 → rechazado/split, nunca count 127;
  round-trip guardar/cargar mantiene ≤64.

---

## 5. Bloque D — Jukebox / note block

### D1 — Validación server-side completa (🟠)

- **Qué hacer:** en `server/actions.js` `handleJukeboxInteract`/
  `handleNoteBlockClick` (~:1087-1134): coords con `Number.isFinite` (patrón
  H1/C2), guarda de distancia NaN-safe (comprobar finito ANTES de comparar),
  y verificar que el bloque objetivo es `JUKEBOX`/`NOTE_BLOCK` según el evento.
- **Criterio:** test: coords `"abc"`, NaN o bloque no-jukebox → rechazo
  controlado, sin entrada en `state.jukeboxes` ni broadcast.

### D2 — Parar el disco en todos los caminos (🟠)

- **Qué hacer:** en `public/audio.js` + puntos de salida del juego: invocar
  `stopDisc()` en `showMenu` (menús.js), muerte del jugador local, desconexión
  /reinit (`network.js` init) y leave_world.
- **Criterio:** manual + test de lógica pura: tras cada camino el intervalo
  de notas está cancelado (exponer estado del disco para assert).

### D3 — Persistencia de discos insertados (⚪ → acordado)

- **Qué hacer:** guardar `state.jukeboxes` en `world.json` vía `save-meta.js`
  (campo nuevo aditivo, patrón cofres/hornos) y restaurarlo al cargar; romper
  el bloque ya elimina la entrada (mantener). **Sin subir `SCHEMA_VERSION`**
  (campo tolerado como cofres/hornos).
- **Criterio:** test (unit-persistencia o unit-fase21.6): insertar disco →
  saveWorld → loadWorld → disco sigue insertado; romper bloque lo suelta.

---

## 6. Bloque E — Comandos

### E1 — `/summon` con cuota y clamp (🟠)

- **Qué hacer:** en `server/commands.js` `case "summon"` (~:414-452): no
  superar la cuota global de mobs (`MOB_TOTAL` de `mob-spawn.js`; si está
  lleno → mensaje y no spawn) y clamp de coords a los bordes del mundo
  (mismo helper que `/tp`, SV-6).
- **Criterio:** test: summon repetido hasta la cuota → el excedente se
  rechaza; coords fuera de bordes → clamped; sigue siendo solo-OP.

---

## 7. Bloque F — Cliente trivial

### F1 — `powerPreference: "high-performance"`

- **Qué hacer:** en `public/scene.js` (creación del renderer): añadir
  `powerPreference: "high-performance"`. Sin más cambios.
- **Criterio:** arranque OK + CDP de `audit-fase7` sin regresión (el check
  de calidad/render existe).

---

## 8. Bloque P — Paridad con Minecraft (APARTE, decisión rectora: manda MC)

> Origen: tabla de paridad de la auditoría §5 + preguntas abiertas del pase
> de servidor. El usuario decidió (2026-08-22) resolver las contradicciones
> hacia Minecraft Java real.

### P1 — Escudo a bloqueo total estilo MC (revoca la decisión 0,4)

- **Qué hacer:** `SHIELD_BLOCK_FACTOR = 0.4` → **1.0** (absorbe el 100 % del
  daño melee/proyectil mientras esté activo, como MC Java); se mantienen las
  exclusiones actuales (daño ambiental lava/fuego/caída/inanición NO se
  bloquea). Sin off-hand ni cooldown por hacha (fuera de alcance,
  documentado). Actualizar comentarios en `constants.js` (~:1420-1425) y
  `combat.js` (~:430-432) que describen el 60 %.
- **Tests:** recalibrar las aserciones de `tests/unit-fase21.5.js` sección C2
  (factor 0,4) y cualquier otra que fije el valor.
- **Criterio:** test: golpe de zombi con escudo → 0 daño; flecha PvP → 0
  daño (con B1); ambiental → pasa íntegro; desgaste por B4.

### P2 — Picada de pesca 5-30 s (MC)

- **Qué hacer:** `server/fishing.js` (~:24-25): `BITE_MIN_MS` 1500 → **5000**
  y rango aleatorio hasta **30000 ms** (`BITE_RAND_MS` 3500 → 25000).
  Constantes sincronizadas si el cliente las refleja.
- **Tests:** recalibrar asserts de tiempo en `unit-fase21.5.js` (A1) y
  `unit-fase21.6.js`.
- **Criterio:** test determinista con RNG inyectado: primera picada ≥5 s y
  ≤30 s; recoger antes de picar devuelve caña sin gasto (intacto).

### P3 — Tabla de loot de pesca fiel (sin `COOKED_COD` crudo ni `FLINT` en tesoro)

- **Qué hacer:** en `server/fishing.js` (~:35-51): quitar `COOKED_COD` del
  pool de peces (MC suelta solo crudos) y sacar `FLINT` del tesoro; ajustar
  pesos a {pescado 85, tesoro 5, basura 10} (ya correctos) usando SOLO ítems
  existentes (basura: stick/string/bone…; tesoro: arco/caña dañada ya presentes).
  **Sin B/I nuevos.**
- **Criterio:** test: 10000 tiradas con RNG inyectado → categorías ≈85/10/5 %
  y ningún ítem de la lista prohibida.

### P4 — Saturación de la botella de miel: 2,4

- **Qué hacer:** `FOOD_VALUES.HONEY_BOTTLE` en AMBOS `constants.js`
  (~servidor :884 + cliente): saturation 1,2 → **2,4** (mod 0,4 de MC).
- **Criterio:** `unit-sync` verde; test de comida restaura 6/2,4.

### P5 — Tablones de bambú ratio 1:1 (2 bambú → 2 tablones)

- **Qué hacer:** `recetas.json` (~:462-470): sustituir la receta 2×2
  (4 bambú → 1) por la forma MC (2 bambú en columna → **2 tablones**).
- **Criterio:** `unit-recetas` recalibrado en verde; cadena bambú→andamio
  alcanzable.

### P6 — Bonus de caída de la maza se consume al impactar

- **Qué hacer:** en `server/actions.js` (~:742-750): tras aplicar el bonus
  de caída en un golpe, reiniciar la caída acumulada del jugador
  (`fallFromY` → 0), como MC (la embestida «gasta» la caída).
- **Criterio:** test: caída larga → primer golpe con bonus, segundo golpe
  inmediato sin bonus; caída normal sin cambios.

### P7 — Blast furnace y cobre (nota cruzada, sin código de IDs nuevos)

- **Qué hacer:** dejar la elegibilidad del horno de fundición **data-driven**
  (lista/constante extensible, hoy hierro/oro) y añadir nota cruzada en
  `TODO.md` F22 A5: cuando exista `RAW_COPPER`/`COPPER_INGOT` (F22), entrarán
  en la lista ×2 (MC: hierro/oro/**cobre**). No se tocan IDs ahora (regla de
  la fase).
- **Criterio:** la lista vive en constante auditable (`unit-sync` si aplica);
  comentario de coordinación F22 presente.

---

## 9. Bloque G — Higiene de docs

- **G1:** sincronizar `STATUS.md` (fase activa, tabla implementado,
  prospectivas con F21.6/F22.1 y prerrequisito de F22) — parte ya hecha en
  la creación de la fase; verificar al cierre que sigue coherente.
- **G2:** al cierre: `AGENTS.md` (estado), `docs/tests.md` (matriz con
  `unit-fase21.6.js`), `docs/server/mecanicas.md` (escudo total, pesca,
  jukebox persistente) y `docs/public/mecanicas.md` (bundle close, stopDisc,
  powerPreference).

---

## 10. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/commands.js` | A1 `/locate` incremental+caché, E1 `/summon` cuota+clamp |
| `server/timers.js` | A2 `originAllowed` sin bypass de puerto |
| `server/projectiles.js` | B1 `source: "projectile"` |
| `server/combat.js` | B2 reválida mano activa, B4 desgaste pre-armadura, P1 factor 1.0 |
| `server/actions.js` | B3 desgaste maza, C3 clamp MAX_STACK, D1 validación jukebox/note, P6 consumo bonus maza |
| `server/save-meta.js` (+carga) | D3 persistencia `jukeboxes` aditiva |
| `server/fishing.js`, `server/constants.js` + `public/constants.js` | P2 tiempos, P3 loot, P4 saturación miel (AMBOS lados en valores) |
| `recetas.json` | P5 bambú→tablones |
| `public/panels.js`, `public/ui.js`, `public/game-input.js`, `public/network.js`, `public/audio.js`, `public/menus.js` | C1, C2, B2-cliente, D2 |
| `public/scene.js` | F1 powerPreference |
| `tests/unit-fase21.6.js` (nuevo) | asserts de todos los bloques |
| `tests/unit-fase21.5.js`, `tests/unit-recetas.js` | recalibración (escudo, picada, bambú) |

> Cada tarea lleva su test (convención AGENTS.md). Sin cambios de protocolo
> WS salvo el ya existente `shield_block`/`bundle_action` (semántica, no
> formato). Sin B/I nuevos. `SCHEMA_VERSION` 6 intacto.

---

## 11. Decisiones del proyecto (resumen)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Contradicciones paridad-vs-decisión | **Manda MC real** (usuario 2026-08-22): escudo total, pesca 5-30 s |
| 2 | Alcance | Fixes 1-7 + higiene (10) + paridad en bloque aparte |
| 3 | Linterna/luz nivel 15 | Fuera → borrador Fase 22.1 |
| 4 | Bug cabezas de mobs | Fuera → Fase 22.1 |
| 5 | powerPreference | Entra ahora (trivial) |
| 6 | Jukebox | Persistencia aditiva en `world.json`, `SCHEMA_VERSION` intacto |
| 7 | Diferidos (perfilado, pase servidor interno, residuos CL-*) | → Fase 22.1 |
| 8 | Cobre en blast furnace | Supeditado a F22 A5 (lista data-driven + nota cruzada) |
| 9 | Numeración | F21.6 entre F21.5 y F22 (precedente 19.5/19.6); F22 pasa a exigirla |

---

## 12. Cierre y auditoría de la Fase 21.6 (obligatoria)

1. Suite unitaria completa en verde (incluido `unit-fase21.6.js` y las
   recalibraciones de 21.5/recetas), E2E 7/7, `--audit` 8/8, `node --check`,
   biome 0 errores, `npm run audit` 0.
2. Verificación manual mínima acordada: spam de `/locate` sin congelación;
   flecha PvP bloqueada por el escudo; cambiar slot con clic derecho no deja
   viñeta fantasma; mochila cierra sesión en servidor (Escape incluido);
   disco para al salir al menú y sobrevive a un reinicio del servidor;
   valores de paridad visibles (picada ≥5 s, miel 6/2,4).
3. Auditoría final de fase obligatoria (flujo orquestado completo) sin
   regresiones vs `auditoria-2026-08-22.md`.
4. Docs y tracker al día (G1/G2), Won't respetado, `SCHEMA_VERSION` 6
   verificado.

## 13. Criterios de aceptación (resumen)

1. Los 7 hallazgos 🟠/🔴 de la auditoría tienen fix + test propio en
   `unit-fase21.6.js`; suite completa en verde.
2. Bloque P aplicado y fijado por tests (escudo total, picada 5-30 s, loot
   fiel, miel 2,4, bambú 2→2, maza consume caída).
3. Persistencia de jukeboxes redondea reinicio sin subir `SCHEMA_VERSION`.
4. Verificación manual mínima (§12.2) completada.
5. Docs/tracker sincronizados; diferidos documentados en el borrador F22.1.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-22: creación desde la auditoría consolidada 2026-08-22 y la
  entrevista del mismo día (alcance fixes 1-7 + 10, paridad aparte hacia MC,
  linterna/cabezas/diferidos → borrador F22.1, jukebox persistente,
  powerPreference sí, orden por riesgo, criterios acordados).
