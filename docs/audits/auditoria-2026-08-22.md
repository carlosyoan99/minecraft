# Auditoría 2026-08-22 — Mi Minecraft

**Fecha:** 2026-08-22 · **Commit auditado:** `afae96b` (largo
`afae96ba54416f7d24ed56ab06591f179a0a6c14`, 2026-08-21, «Fase 21.5 (Z1):
fixes de auditoría…») · **Alcance:** auditoría de cierre de la **Fase 21.5**
(pesca, bloques 1.8-1.15, combate y Trial Chambers, 1.21/1.21.5/1.22,
comandos). Auditoría de referencia previa: `docs/audits/auditoría-2026-08-18.md`
(commit `b4514ab`). Orquestada con 6 pases: linea-base, seguridad,
rendimiento, cliente, paridad y servidor (este último completado en una
segunda ronda tras 5 intentos fallidos del entorno; ver §2).

---

## Línea base

> Informe íntegro del agente `linea-base` (único agente con permiso de
> ejecución), tal cual.

**Commit auditado:** `afae96b` (largo `afae96ba54416f7d24ed56ab06591f179a0a6c14`) · fecha 2026-08-21 05:53:28 -0400 · «Fase 21.5 (Z1): fixes de auditoría…» · **Node v22.23.2**

**Estado del árbol:** ⚠️ **SUCIO y con edición concurrente durante la verificación.** Al inicio (≈01:45) solo había docs modificados (`TODO.md`, `docs/spec/fase21.5-spec.md`). Durante mi ejecución, un **tercero editó código en vivo** (mtimes medidos): `server/actions.js` 01:48:29, `server/net.js` 01:59:54, `public/connection.js` 02:01:15 (WIP sin commitear: keepalive cliente/servidor etiquetado «CL-4» y un fix en `handleBundleAction`; en `connection.js` hay dos `addEventListener` pegados en una misma línea). Árbol estable desde 02:01:15; sin untracked.

| Chequeo | Resultado | Detalle |
|---|---|---|
| `node --check` (server/, public/ sin vendor/, tests/, server.js) | ✅ | **174 archivos OK, 0 fallos** |
| `npx biome check .` | ✅ | **0 errores**, 39 warnings, 6 infos (183 archivos); criterio del proyecto cumplido |
| Unitarios `--unit` | ✅ | **62/62**, exit 0 (el runner no imprime total agregado; conteo por líneas ✅=62, ❌=0) |
| Auditorías `--audit` | ✅ | **8/8**: fase3 16,7 s · fase4 14,9 s · fase5 0,65 s · fase6 24 s · **fase7 93,7 s (pasó, sin timeout CDP)** · altura 58 s · fase20 0,9 s · fase21 1,8 s |
| E2E (servidor propio `SEED=miSemilla2026` :3998, HTTP 200 previo) | ✅ | **7/7** (mascotas, comer, durabilidad, reload, cofre, templo, menú), exit 0 |
| Arranque básico (:3999, sin SEED → modo menú) | ✅ | HTTP **200** en `/` |
| Limpieza | ✅ | Servidores 3998/3999 muertos; sin procesos del proyecto ni puertos 3000/3998/3999 ocupados |

**Hallazgo previo (`birchLogs is not defined` en unit-biomas):** ✅ **CORREGIDO** — `unit-biomas.js` pasa (9,9 s) en las tres pasadas que hice de la suite.

**Lista detallada de fallos:** ninguno (0 tests caídos, 0 errores de sintaxis, 0 errores de lint).

**Interferencia medida (importante para los demás agentes):**
- Los unitarios corrieron **con el WIP de `actions.js` ya en disco** (editado 01:48:29, antes de todas las pasadas unitarias).
- Auditorías, E2E y arranque corrieron **con los 3 ficheros WIP** (`actions.js`, `net.js`, `connection.js`) presentes.
- Solo `node --check` y probablemente `biome` se ejecutaron contra el árbol casi-limpio (solo docs sucios). Es decir: **estos resultados no son un snapshot puro de `afae96b`** sino de HEAD+WIP ajeno para la mayoría de suites; todo en verde igualmente. Hubo un proceso ajeno (`freebuff`, language-server de Zed) pero ninguna suite de tests paralela.

**No ejecutado / fuera de alcance:** cobertura c8 no corrida (opcional); `npm audit` no corrido (es del agente de seguridad). Ninguna verificación quedó sin ejecutar por límites del entorno.

**Conclusión:** el código arranca y pasa íntegramente sus propias suites (62/62 unitarios, 8/8 auditorías, 7/7 E2E, biome 0 errores, HTTP 200) — nada rojo que bloquear. La única cautla para auditar: el árbol contenía WIP sin commitear de un agente concurrente durante la mayoría de las mediciones; si se necesita reproducibilidad exacta contra `afae96b`, re-ejecutar sobre un árbol limpio.

*Nota del orquestador:* el pase de seguridad verificó después vía `git status`
que el WIP de `actions.js`/`net.js`/`connection.js` ya había sido committeado al
momento de su lectura (solo quedaban `TODO.md` y la spec sucios), por lo que su
análisis aplica al árbol actual.

---

## Resumen ejecutivo

El estado técnico es **verde en todo lo medible** (62/62 unitarios, 8/8
auditorías standalone, 7/7 E2E, biome 0 errores, `npm audit` 0, arranque OK) y
el hallazgo previo de la auditoría 2026-08-18 (`birchLogs`) está corregido:
nada bloquea formalmente el cierre de la Fase 21.5. Hay, sin embargo, **un
hallazgo transversal confirmado por dos pases independientes** — el barrido
síncrono de `/locate <bioma>` puede bloquear el event loop (~66k evaluaciones
de ruido en peor caso) y es spameable por cualquier jugador sin ser OP
(seguridad #1 🟠 + rendimiento #2 🟡) — y **cuatro clusters de superficie nueva
con fallos concentrados**: la mochila/bundle (cierre de UI nunca enviado,
columna stale y fusión de stacks que persiste count >64), jukebox/note block
(validación incompleta estilo H1, disco fantasma tras salir/morir, estado no
persistido), el **escudo** (en cliente: bloqueo persistente sin escudo en mano;
en servidor: `blocking` no se reválida al cambiar de slot — explotable por un
cliente malicioso — y las flechas PvP atraviesan el escudo por una rama de
`source: "projectile"` muerta) y la **maza** (nunca pierde durabilidad al
golpear). El pase dedicado de **servidor** llegó en la segunda ronda de la
auditoría (6.º intento; los 5 primeros fallaron por límites del entorno) con
cobertura línea a línea de `combat.js`: confirma correcto el orden
bloque→armadura, el tótem y la acumulación de caída, pero añade los 2 🟠
anteriores. Además, `STATUS.md` sigue desincronizado respecto a TODO/spec
(aún lista D1/E4/Z1 pendientes).

---

## 1. Seguridad

> Informe íntegro del agente `seguridad`, tal cual.

## Seguridad (Fase 21.5)

**Alcance y método:** lectura estática (sin ejecutar tests/servidores) del árbol en `afae96b` + working tree. Nota WIP: `server/net.js` **ya no tiene cambios sin commitear** (`git status` solo muestra `TODO.md` y `docs/spec/fase21.5-spec.md`) — el aviso quedó obsoleto y lo auditado es el árbol actual. Se verificaron los handlers WS nuevos (`bundle_open`/`bundle_action`, `jukebox_interact`, `note_block_click`, `fishing`, `throw_wind_charge`), comandos nuevos (`/summon`, `/locate`, `/effect`, `/kill` con selectores) y el estado de M1-M5/B2-B3 de la auditoría 2026-08-15.

### Tabla priorizada

| # | Sev | Ubicación | Hallazgo | Impacto/explotabilidad | Estado vs auditorías previas |
|---|-----|-----------|----------|------------------------|------------------------------|
| 1 | 🟠 | `server/commands.js:302-337` (+`:252,302`; gate `:350`, OP_ONLY `:139-149`) | `/locate <bioma>` hace un barrido **síncrono** en el event loop: hasta ~(1024/8)²·4 ≈ 66k llamadas a `biomes.getBiome()` (ruido multi-octava) en el peor caso (bioma ausente en radio 1024, p.ej. `pale_garden` lejano). Estimación ~100-300 ms bloqueados por llamada | **Sí, sin modificar el cliente**: basta spamear `/locate mountain` desde el chat (el rate-limit por acción B2 acota a 20/s ≈ hasta ~2-6 s de event loop bloqueado por segundo → tick y HTTP congelados para todos). No requiere OP ni WS hecho a mano | NUEVO (superficie G1 de la 21.5) |
| 2 | 🟡 | `server/timers.js:398` (`originAllowed`) | Bypass del allowlist anti-CSWSH: `if (!hostname \|\| hostname.indexOf(":") === -1) return true;` — cualquier `Origin` **sin puerto explícito** pasa. Los navegadores omiten el puerto por defecto (80/443), así que `http://evil.com` / `https://evil.com` (el caso habitual de una web atacante) son aceptados; solo se filtran orígenes con puerto no estándar | Sí, con WebSocket hecho a mano desde página externa en puerto estándar (CSWSH). Impacto contenido: no hay sesión/auth que robar (identidad = `?name=`, diseño LAN), pero la mitigación M1 queda **inefectiva frente al vector más común** | NUEVO (debilita la corrección **M1** de `auditoria-2026-08-15.md` §cierre; el verifyClient existe pero con este hueco lógico) |
| 3 | 🟡 | `server/actions.js:1087-1134` (`handleJukeboxInteract`, `handleNoteBlockClick`) | Validación incompleta estilo H1: (a) coords solo se comprueban contra `undefined`, no con `Number.isFinite`; (b) la guarda de distancia **falla abierta con NaN** (`NaN > 6` === false, alcanzable con strings no numéricos `"abc"` → coerción NaN); (c) **no se verifica que el bloque objetivo sea JUKEBOX/NOTE_BLOCK** | Sí (devtools/WS crudo): insertar discos en coordenadas arbitrarias crea claves fantasma en `state.jukeboxes` (memoria acotada por discos propios); `note_block_click` difunde `note_play` a todos los vecinos con coords basura → spam de audio a otros jugadores (≤20/s por B2). Sin truncado de arrays ni corrupción persistida | NUEVO (el patrón H1 de validación incompleta reaparece en superficie nueva; H1 original sigue CORREGIDO en cofre/grid, ver fila 8) |
| 4 | 🟡 | `server/commands.js:414-452` (`case "summon"`) | `/summon` hace `state.mobs.push(mob)` **sin consultar la cuota global de mobs** (30, `mob-spawn.js`) ni tope propio; las coords pasan regex numérica pero **no se sujetan a los bordes del mundo** (a diferencia de `/tp`, que clampa por SV-6) | Solo OP: un operador (o el host comprometido) puede inundar el mundo a 20 mobs/s → memoria, coste de tick y `mobs_update` crecen sin techo; despawn a >128 bloques lo mitiga parcialmente. No explotable por jugador común | NUEVO (reintroduce el patrón de **M2** «cría sin tope» — corregido en `applyFeed` según cierre 2026-08-15 — pero ahora vía comando OP) |
| 5 | 🟡 | `server/actions.js:997,1043` (`handleBundleAction` put/take) | Fusión de stacks sin clamp: `dest.count += item.count` supera `MAX_STACK` (64) — juntar 64+63 legítimos produce un stack de 127 que se **persiste** en `players/<nombre>.json` vía slots de mochila (`save-players.js:188-189`) y vuelve al inventario igual | **Sí, sin modificar el cliente**: cualquier jugador junta dos stacks normales en la mochila. Sin duplicación ni crash; ítem con count irreal (el cliente ya pinta `count` crudo, CL-7) | PERSISTE — misma clase **SV-5** (`auditoria-2026-08-16-copilot.md`: `addToInventory` sin tope), ampliada a la mochila nueva de la 21.5 |
| 6 | ⚪ | `server/state.js:52-55` + ausencia en `save-meta.js`/`save.js` (grep sin matches) | El estado de jukeboxes (`Map` clave `"x,y,z"` → `{disc}`) **no se persiste**: al reiniciar el servidor, todo disco insertado desaparece (solo se recupera rompiendo el bloque ANTES del reinicio, `players.js:250-257`) | Pérdida de ítem propio (disco), no abuso contra terceros. Incoherencia de integridad: el bloque sobrevive pero su contenido no | NUEVO (F21.5 D6) |
| 7 | ⚪ | `public/index.html` (grep: sin `Content-Security-Policy` ni `integrity=`) | Sin CSP ni SRI. Mitigado: Three.js se sirve local desde 19.6 (sin CDN externo) y `nosniff` activo (`net.js:299`) | Requeriría XSS previo para explotarse; hoy sin sink alcanzable (ver fila 8/XSS) | PERSISTE (diferido documentado, `auditoria-2026-08-15.md` §1.2.6/§Estado previos) |

**Verificado sin riesgo (positivos de esta pasada):**
- **Patrón H1 NO reproduce en lo nuevo**: `bundle_action` valida `Number.isInteger` + rango en todos los índices (`invSlot` 0..35, `bundleSlot` 0..8, `targetSlot` <9; `actions.js:989,993-994,1033,1040`). H1/B1 siguen **CORREGIDOS** en cofre/grid (cierre 2026-08-15, verificado en árbol).
- **B2 aplica a toda la superficie nueva**: el contador por acción cubre todo evento salvo `move`/`tick`/`textures_reload` (`net.js:645-659`) → `bundle_*`, `jukebox_interact`, `note_block_click`, `fishing`, `throw_wind_charge` y chat-comandos quedan dentro (≤20/s).
- **B3 cubre los comandos nuevos**: log único antes del switch (`commands.js:362-364`) registra `/kill`, `/summon`, `/effect` (y `/locate` si se volviera OP-only).
- **Permisos**: `kill`/`summon`/`effect` en `OP_ONLY` (`:139-149`); `/locate` abierto por diseño (solo lectura). Selectores `@a/@e` incluyen a OPs/emisor, pero solo un OP puede ejecutar. Args inválidos (mob/bioma/efecto desconocido) → mensaje controlado, sin excepción.
- **M3/M4/maxPayload intactos**: nombre duplicado rechazado (`net.js:409-418`); fallback OP-solo-sin-OPS (`net.js:422`, corrección documentada aceptada); `maxPayload` 1 MiB (`timers.js:424`) + tope JSON 64 KiB (`net.js:581`).
- **Pesca/wind charge saneados**: 1 bobber/jugador, loot solo con picada decidida server-side, limpieza en disconnect (`net.js:1262`); wind charge valida mano y consume 1.
- **XSS**: los eventos nuevos transportan solo números (`disc` id de set cerrado `{275,276}`, `note` aleatorio 0-24); sin interpolación de strings de red en DOM.

**npm audit:** ejecutado `npm audit --audit-level=moderate` → **found 0 vulnerabilities** (confirma la línea base de 2026-08-15).

**No revisado por límite de pasos:** estado interno del blast furnace (`handleFurnaceAction`, variante nueva de la 21.5) más allá del routing; cooldown C4 de `world-session.js` (solo verificado por grep de estructura); revisión línea a línea del cliente nuevo (`dragdrop.js`, paneles bundle) en su lado servidor-dependiente; medición empírica del coste real de `getBiome` (la sev 🟠 del hallazgo 1 usa estimación estática de ~66k evaluaciones de ruido; conviene perfilar antes de priorizar el fix).

---

## 2. Errores de implementación — Servidor

> ℹ️ **Nota de orquestación:** este pase falló 5 veces por límites del entorno
> (3× `auditoria-servidor`, 2× `general`) y se completó en la segunda ronda de
> la auditoría (6.º intento) con el agente especialista `auditoria-servidor`.
> Mientras estuvo abierto el hueco, los demás pases verificaron
> positivamente: validación entera+rango de `bundle_action`, permisos OP-only
> de los comandos nuevos con log B3, rate-limit B2 sobre toda la superficie
> nueva, limpieza de bobbers en desconexión/expiración 15 s, cuota de mobs 30
> con spawn Creaking acotado a pale_garden.night, coste de `tickBogged` nulo,
> y persistencia aditiva de mochila/blast furnace/cofres trial con
> SCHEMA_VERSION 6 intacto (detalles en §1, §4). El informe íntegro del pase,
> tal cual:

## Errores de implementación — Servidor (Fase 21.5)

Alcance cubierto: lectura línea a línea de `server/combat.js` (789 líneas) contrastada con `constants.js` (escudo/tótem/maza), los puntos de llamada (`actions.js`, `projectiles.js`, `net.js`, `anticheat.js`) y `docs/audits/auditoria-2026-08-15.md` + la más reciente `auditoria-2026-08-22.md`. Verificado OK: orden bloque→armadura correcto (combat.js:441→446), daño ambiental (lava/fuego/caída/inanición/veneno) no bloqueado, `shield_broke` al llegar a 0 con `blocking=false`, tótem solo en mano activa salvo vacío (`anticheat.js:70` respawnea directo sin pasar por `damagePlayer`), cura 10 + absorción 8 que absorbe antes que la vida, consumo count−1, maza base 6 + ⌊caída⌋ si caída ≥ 1,5, y `fallFromY` limpiado al aterrizar/en agua/respawn/tp (sin doble conteo tras aterrizar).

### Tabla priorizada

| # | Sev | Archivo:línea | Hallazgo | Impacto | Estado vs auditorías previas |
|---|---|---|---|---|---|
| 1 | 🟠 | `projectiles.js:390-391` + `combat.js:438` | El daño de flecha/tridente se etiqueta `source: lanzador ? "player" : "mob"` — nunca `"projectile"`. La rama del escudo `(opts.source === "mob" \|\| opts.source === "projectile")` tiene su segunda condición en código muerto (grep global: `"projectile"` solo aparece en combat.js:438). | Las flechas lanzadas por jugadores (PvP) atraviesan el escudo sin reducción ni desgaste, contradiciendo el comentario de diseño (combat.js:430-432 y constants.js:1420-1422: «daño de mobs y proyectiles»). Los proyectiles de esqueletos sí se bloquean (van como `"mob"`). | NUEVO (la auditoría 2026-08-22 confirmó solo valores de paridad, no estructura) |
| 2 | 🟠 | `net.js:1044` + `actions.js:813-821` + `combat.js:437` | Cambiar de slot (`p.selectedSlot = data.slot`) no resetea `p.blocking`, y `damagePlayer` confía en ese flag sin reverificar que el ítem en mano sea escudo (`applyShieldWear` devuelve `false` en silencio si no lo es). Nada en el servidor limpia `blocking` salvo el toggle del cliente o la rotura. | Cliente malicioso/desincronizado: envía `shield_block {blocking:true}` con escudo, cambia a cualquier ítem y conserva −60 % de daño de mobs perpetuo y sin desgaste. Vulnera el principio servidor-autoritativo. | Complemento SERVIDOR del hallazgo #4 de la auditoría 2026-08-22 (que lo señaló solo en `public/game-input.js`): la mitad servidora PERSISTE/NUEVA |
| 3 | 🟡 | `actions.js:746-775` + `constants.js:1313` | La maza tiene `TOOL_DURABILITY[I.MACE] = 250` declarado y es `isTool`, pero el ataque usa `applyToolWear(p, true)` cuyo filtro `onlySwords` exige estar en `SWORD_DAMAGE` — la maza no está, así que nunca pierde durabilidad al golpear (su uso principal). Solo se desgastaría picando bloques. | Arma indestructible en combate; contradice la declaración de paridad («durabilidad media de MC (250)») y el patrón espada/arco/caña/escudo del propio módulo. | NUEVO |
| 4 | 🟡 | `combat.js:451` | Desgaste del escudo condicionado a `blocked && real >= 1`, donde `real` ya pasó por armadura. Con armadura que absorbe el resto (p. ej. zombi 3 → bloqueo ceil(1,2)=2 → armadura redondea a 0), el impacto absorbido por el escudo no desgasta. El criterio auditado es «desgaste 1 por impacto absorbido». | Escudo casi eterno contra golpes débiles con buena armadura; desviación del criterio de aceptación. El comentario in situ («que de verdad dolió») lo documenta como intencional — verificar contra `fase21.5-spec.md` §C2. | NUEVO (posible decisión de spec) |
| 5 | ⚪ | `combat.js:441` | `Math.ceil(real * SHIELD_BLOCK_FACTOR)`: con daño entrante 1, ceil(0,4)=1 → el golpe pasa íntegro pese a bloquear (con `Math.round`/`floor` sería 0). Solo afecta a impactos de 1 HP. | Golpes de 1 HP (bebés, debuff) insensibles al escudo; rareza de paridad menor. | NUEVO |
| 6 | ⚪ | `combat.js:240-243` + `453-455` | Al romperse el escudo no se llama `sendInventory` (sí en el camino sin rotura, :247); el cliente debe limpiar el slot vía evento `shield_broke` que viaja con payload vacío `{}` (sin `slot`). | Posible desync visual del hotbar hasta el próximo `sendInventory` si el handler cliente no elimina el ítem; estado servidor correcto. | NUEVO |
| 7 | ⚪ | `combat.js:472-478` + `constants.js:1433` | Paridad tótem ya documentada: sin Regeneración II/resistencia al fuego y absorción 8 sin expirar (solo muerte la limpia, respawn la pone a 0). Los valores auditados aquí (cura 10, absorción 8 previa a vida, count−1, solo mano activa, vacío excluido) son conformes. | Menor, jugable. | PERSISTE (auditado en 2026-08-22 §tabla #6; no reclasificar) |

**Preguntas abiertas** (parecen diseño intencional, verificar spec): (a) `actions.js:742-745` documenta que el bonus de maza NO se consume al golpear — una sola caída larga permite embestir varios mobs con bonus completo cada vez (en MC Java la caída se gasta al impactar); (b) `SHIELD_BLOCK_FACTOR` 0,4 (pasa el 40 %) frente al bloqueo ~100 % de MC Java — ya calificado como desviación de paridad notable en 2026-08-22 §#5, pero es la simplificación declarada de la spec F21.5 C2.

No revisado por límite de pasos: handlers WS nuevos de `actions.js` (wind charge, bundle, blast furnace), ciclo interno de `projectiles.js` (física del bobber, colisiones del wind charge), `fishing.js` completo (tablas de loot, picoteo), persistencia de los campos nuevos en `save-players.js` (absorption/poison/maza en inventario) e interno de blast furnace, IA de Creaking/Bogged (`mob-species.js`/`mob-spawn.js`).

---

## 3. Errores de implementación — Cliente

> Informe íntegro del agente `auditoria-cliente` (informe parcial explícito,
> tal cual).

## Errores de implementación — Cliente (Fase 21.5)

⚠️ INFORME PARCIAL — límite de pasos alcanzado.

Se alcanzó el máximo de pasos permitidos para este agente antes de completar todas las lecturas previstas (quedaron sin auditar a fondo: `itemicons.js` draw nuevos línea a línea, `mobs.js` bobbers/variantes, `menus.js` showMenu/resets, `world.js`, `texturemap.js` completo). Lo que sigue está verificado por lectura directa del código actual; el resto queda como recomendación de continuidad.

Alcance: `public/*.js` en commit `afae96b`. Método: lectura dirigida de los módulos tocados por la fase (panels/network/game-input/audio/particles/leafparticles/player/hud/ui/menu-input/connection/constants/textures/texturemap/itemicons) + verificación cruzada con `server/constants.js` y las auditorías 2026-08-15/16/16-copilot/18.

### Tabla priorizada

| # | Sev | Archivo:línea | Hallazgo | Impacto | Estado vs auditorías previas |
|---|---|---|---|---|---|
| 1 | 🟠 alto | `public/panels.js:378` vs `:385` | En `toggleBundleUI(show)`, `bundleOpen = show` se asigna ANTES del `else if (bundleOpen)`; al llamar con `show=false` la condición ya es falsa y **nunca se envía `bundle_action {action:"close"}` al servidor** (ni por Escape→`closePanels()`:465 ni por clic). Los caminos horno/cofre no sufren esto porque comprueban `openFurnaceKey`/`openChestKey`, que no se pisan antes. | El servidor queda con sesión de mochila abierta (estado fantasma); cualquier lógica server-side de "cerrar" (devolver cursor, liberar estado) no se ejecuta. | NUEVO (F21.5 F4) |
| 2 | 🟡 medio | `public/ui.js:100-115` | `applyInventory()` y `repaintIcons()` repintan craft/horno/cofre (`isChestOpen()`) pero **no la columna de inventario del bundle** (falta `updateBundleInventoryUI()` cuando `isBundleOpen()`). Tras cada put/take el servidor manda `inventory_update`+`bundle_state`; los slots de mochila se repintan pero la lista del inventario del panel queda stale (slots clicables con ítems que ya no están). | UI desincronizada dentro del panel de mochila hasta reabrirlo; clicks mandan `put` con slots vacíos (el servidor los rechaza). | NUEVO (F21.5 F4) |
| 3 | 🟡 medio | `public/audio.js:772-798` + `network.js:395-399` | `stopDisc()` solo se invoca desde `jukebox_state` (extraer disco) y al inicio de `playDisc`. **No hay stopDisc al salir al menú (`showMenu`), al morir, al desconectar/reconectar ni en `init`**; el `setInterval` de 400 ms sigue programando notas indefinidamente (música fantasma en menú/post-muerte, sin forma de pararla salvo otro `jukebox_state`). Los nodos WebAudio en sí sí se liberan (`osc.stop(t+0.5)`); la fuga es del intervalo, no de nodos. | Música continua tras leave_world/desconexión; solapa con el pad de bioma sin mezcla (diseño menor aparte). | NUEVO (F21.5 D6) |
| 4 | 🟡 medio | `public/game-input.js:312-317,623-628` | Escudo: `shieldBlocking` no se resetea si se cambia de slot (rueda/Digit1-9) mientras se mantiene clic derecho → pose-viñeta y `shield_block {blocking:true}` persisten **sin escudo en mano** hasta soltar. Además el `mouseup` cuelga de `renderer.domElement`: soltar fuera del canvas deja el bloqueo activo hasta un `pointerlockchange`. | Viñeta fantasma + estado de bloqueo enviado al servidor inconsistente con el ítem sostenido. | NUEVO (F21.5 C2) |
| 5 | ⚪ bajo | `public/player.js:248-250` | `animate()` sigue incondicional: en blur (visible sin foco) el render/física corren a FPS completo; solo `document.hidden` pausa rAF implícitamente y `audio.js` suspende contexto. No existe flag `paused = document.hidden \|\| !hasFocus()`. | Consumo GPU/CPU con ventana visible sin foco. | PERSISTE — CL-2 de `auditoria-2026-08-15.md` (§201, §218); el cierre prometido en F19.6 no llegó a `player.js` |
| 6 | ⚪ bajo | `public/network.js:121-150` | Al reconectar (fix CL-1), `init` no limpia `doorStates` (Map solo crece entre mundos) ni cierra paneles/bundle abiertos ni para el disco (ver #3). La recomendación de reset local de CL-1 quedó parcialmente implementada. | Puertas de mundo anterior cuentan como cerradas/abiertas al volver a entrar; paneles fantasma tras reconexión. | PERSISTE (parcial) — recomendación CL-1 de `auditoria-2026-08-15.md` §201 |
| 7 | ⚪ bajo | `public/particles.js:33-40,65,81,166` | Material compartido por color (`materialFor`) mutado por partícula: `opacity`/`transparent` se escriben sobre el material global del color → partículas simultáneas del mismo color (hojas bajo el mismo árbol) comparten opacidad y parpadean entre sí. Heredado del sistema de cubos, ahora amplificado por las hojas (vidas más largas y desincronizadas). | Glitch visual leve; sin fuga (pool + MAX_ALIVE correctos). | NUEVO en hojas (patrón pre-F21.5; CL-8/P6 de 08-15 no cubría opacidad) |

### WIP ajeno detectado (no evaluable)
- `public/connection.js:129`: dos `addEventListener` pegados en una misma línea (`socket.addEventListener("open",…);socket.addEventListener("close",…);`) — es el WIP concurrente anunciado en el encargo (keepalive CL-4). Lógicamente correcto (start/stop keepalive simétricos); requiere re-auditoría cuando esté committeado.

### Verificado SIN problemas (para no re-auditar)
- **Fix atlas Z1**: `px()` existe (`textures.js:36`) y no queda ningún `.set()` sospechoso; las 92 funciones del array TILES (0..188) están todas definidas; índices máximos de `texturemap.js` (186-188) dentro

*[Texto truncado por límite del agente en este punto.]*

---

## 4. Rendimiento

> Informe íntegro del agente `rendimiento` (informe parcial explícito, tal cual).

**Se ha alcanzado el máximo de pasos de este agente.** Entrego el informe PARCIAL (explícitamente marcado) con lo verificado en lectura estática. Faltaron por inspeccionar: ciclo de vida cliente de meshes de bobber en `mobs.js` (`updateArrows`, limpieza al `player_leave`), duplicación de listeners en `panels.js` (paneles bundle/jukebox, WIP conocido — `connection.js` sí quedó verificado y limpio), valor exacto de `COLS` en `textures.js`, y el gating completo de spawn del Creaking. Ningún hallazgo de abajo depende de esa lectura pendiente.

## Rendimiento (Fase 21.5)

Alcance: coste marginal de tick, generación, frame de cliente, red, memoria y guardado de lo nuevo de F21.5 (pesca, wind charge, Bogged/Creaking, blast furnace, mochila, jukebox/note block, Trial Chambers, océanos/montañas/pale garden, hojas cayendo, ~80 IDs nuevos). Método: **lectura estática** del árbol `afae96b`, contrastada con los veredictos P1-P7 de `auditoria-2026-08-15.md` (§ cierre 2026-08-16). Nada se perfiló en vivo: lo marcado "ESTIMACIÓN" exige medición.

### Tabla priorizada

| # | Sev | Área | Ubicación | Coste/riesgo estimado (complejidad, frecuencia) | Impacto | Estado vs veredictos previos |
|---|---|---|---|---|---|---|
| 1 | 🟡 | Red/Tick | `server/timers.js:249-255` + `server/fishing.js:179-186` | **Verificado en código:** `arrows_update` es broadcast GLOBAL (sin cercanía) cada tick mientras haya proyectiles; el bobber **permanece en estado aunque parado** hasta recogerlo o expirar (15 s). Con P jugadores pescando, son P snapshots × 20 Hz × N sockets ≈ 100-150 B/bobber (~200 KB/s agregados con 10 pescando) — ESTIMACIÓN el volumen | Tráfico continuo y tick de serialización donde antes las flechas eran ráfagas cortas; escala O(N×B) por tick | Nuevo (las flechas ya iban así, preexistente; lo NUEVO es la persistencia del bobber que convierte el patrón en continuo) |
| 2 | 🟡 | Tick/comandos | `server/commands.js:306-337` | **Verificado en código:** `locateBiome` barre anillos paso 8 hasta radio 1024 → peor caso ~66.000 llamadas `getBiome` (multi-octava) **síncronas** si el bioma no aparece cerca (p. ej. `/locate pale_garden` en mundo sin uno cercano); ~100-300 ms de bloqueo del event loop es ESTIMACIÓN (µs por llamada sin medir) | Hitch del tick y de HTTP puntual; solo OP y poco frecuente, con early-exit `r-step < bestDist` que mitiga el caso encontrado-rápido | Nuevo |
| 3 | ⚪ | Tick/mobs | `server/mob-species.js:807-830` | **Verificado:** `tickCreaking` itera jugadores por mob/tick con salida temprana >24 bloques; `_hasLineOfSight` = O(1) matemático + 3 `getBlock`. Sin throttle ni gate de noche/bioma, pero cuota global de mobs 30 y spawn limitado a pale_garden de noche (`mob-spawn.js:130`) → µs por tick | Despreciable en caso real | Nuevo, sin problema |
| 4 | ⚪ | Tick/mobs | `server/mob-species.js:200-228` | **Verificado:** `tickBogged` = IA del esqueleto (strafe O(1), tiro con cooldown 2,5 s); flecha venenosa reusa física existente (`projectiles.js:95,382`) | Nulo | Nuevo, sin problema |
| 5 | ⚪ | Tick/hornos | `server/crafting.js:298-300` | **Verificado:** por horno ACTIVO y por tick se hace `key.split(",").map(Number)` + `world.getBlock` para decidir `isBlast` — asignación por tick que no existía. Acotado por la poda REN-2 (hornos vacíos se eliminan, `:329`) | Micro; solo visible con granjas grandes de hornos (a verificar con `--prof` si algún día importa; cachear `isBlast` al abrir sería trivial) | Nuevo, menor |
| 6 | ⚪ | Generación | `server/generation.js:273,341-372,489,668,945,963` + `server/structures.js:513-645` | **Verificado:** montaña D2 = **una** llamada `noise2D_mountain` extra por columna (no octavas); coral/kelp/seagrass = gates hash por columna; Trial Chamber = gate hash 3,5 % por celda 64×64, footprint 9×9, excavado de solo 3 Y por columna, todo determinista y con guard `state.chests.has`. Coste marginal ≈ despreciable frente al ruido 3D de cuevas preexistente | Presupuesto de `audit-fase4` (14,9 s línea base) no debería moverse — **a verificar ejecutando** `--audit` (estático no lo confirma) | **P4 intacto**: generation.js:963 confirma "NO se marca dirty al generar" — sin regresión |
| 7 | ⚪ | Frame cliente | `public/leafparticles.js` + `public/particles.js:30,102-121,159-203` | **Verificado:** lógica pura con acumulador (muestreo 0,12 s normal / 0,8 s reduceMotion), `findLeafPoint` ≤32 `getBlock` por intento (~270 lookups/s peor caso, triviales); **reduceMotion real** (intervalo ×~7, chance 0,35→0,2, física atenuada); `MAX_ALIVE=200` compartido cubos+hojas con pools de muertas separados | Ninguno esperable; bien diseñado | CL-8/P6 (pool+tope) se respeta y extiende a hojas |
| 8 | ⚪ | Frame cliente/audio | `public/audio.js:772-810` | **Verificado:** oscilador nuevo por nota (`playDisc` vía `setInterval` con clearInterval al extraer; `playNote` one-shot) — patrón estándar de Web Audio, nodos efímeros recolectados por GC | Spam de note blocks crea osciladores breves; sin fuga. ⚪ | Nuevo, sin problema |
| 9 | ⚪ | Frame cliente/atlas | `public/textures.js:1451-1484`, `public/itemicons.js:1803-1804`, `public/meshbuild.js:464-506` | **Verificado (parcial, `COLS` exacto sin leer):** atlas único procedural COLS×TILE / rows×TILE; ~190 IDs ≈ cuadrícula ~14×14 (224 px), irrelevante para GPU; iconos siguen en canvas-fila de datos subido una vez; kelp/seagrass/coral cruzado va por categoría `plant` del geopool con worker intacto | Ninguno | Consistente con decisiones F19.6 (instancing rechazado; geopool por categorías) |
| 10 | ⚪ | Red | `server/actions.js:1105,1119,1133` + `server/net.js:117` | **Verificado:** `note_play` y `jukebox_state` usan `_broadcastNear` (radio `CRACK_VIEW_DISTANCE`) ✅ cercanía como crack; `bundle_state` (9 slots) va solo al jugador abierto (`handleBundleOpen(p, ws)`, actions.js:1078); `mobs_update` sigue condicional a cambio (stringify completo por tick preexistente, F14 M2 — `variant` añade bytes por mob pero no frecuencia); `biome_update` intacto (solo al cruzar, timers.js:294-298) | Ninguno | Correcto según criterio de cercanía del proyecto |
| 11 | ⚪ | Memoria | `server/net.js:1260-1262`, `server/state.js:52-55`, `server/players.js:253-256`, `public/connection.js:43-100` | **Verificado:** bobbers limpiados en desconexión y expiración 15 s ✅; `jukeboxes` Map borrado al extraer/romper bloque, no se persiste (acotado, entradas mínimas); `connection.js` usa wrapper EventTarget estable — network.js registra listeners **una sola vez**, las reconexiones NO duplican (el WIP conocido aparece resuelto en este árbol; queda confirmar `panels.js`, no leído) | Ninguno identificado | Coherente con limpieza F16 C5/REN-2 y CL-1 |
| 12 | ⚪ | Guardado | `server/save-players.js:66,188-189`, `server/chests.js:148` | **Verificado:** bundle = 9 slots por jugador en su JSON (+cientos de bytes); blast furnace comparte Map de hornos con poda (sin crecimiento estructural); cofres trial (2-4 por cámara) persisten en `state.chests`→world.json siguiendo el patrón preexistente de cofres de estructura — crecimiento pequeño y proporcional a cámaras visitadas | Marginal | gzip por chunk sin cambio: veredicto P2 (RECHAZADO con métrica) se mantiene, sin regresión |

**Sin hallazgos 🔴/🟠 nuevos:** ningún coste de F21.5 degrada tick o FPS de forma perceptible en caso real plausible. Los dos 🟡 son acotados y de baja frecuencia (uno requiere operador).

### Recomendado perfilar en vivo

1. **`/locate pale_garden` en mundo sin ese bioma en ~1 km**: cronometrar el bloqueo del event loop (`server_metrics.tickMs` antes/durante, o `node --prof`) para confirmar/descartar la estimación de 100-300 ms del hallazgo #2.
2. **Sesión con varios jugadores pescando**: agregar bytes/s de `arrows_update` y delta de `tickMs` (hallazgo #1); decidir si vale pasar bobbers a `broadcastNear`.
3. **Re-ejecutar `node tests/run.js --audit`** (fase4/altura/fase21) en `afae96b` y comparar con los 14,9 s de fase4: confirmación empírica de que Trial/arrecifes/kelp/montañas no rompen presupuesto de generación (hallazgo #6).
4. **Granja de hornos (20-50 activos)** con `--prof`: coste del `split`+`getBlock` por tick de `tickFurnaces` (hallazgo #5).
5. **Profiler del navegador** bajo bosque denso con hojas activas y spam de note blocks: validar amortización del muestreo (#7) y nº de osciladores concurrentes (#8).

### Resumen de la sesión (por límite de pasos)

- **Hecho:** leídas la línea base P1-P7 (auditoría 2026-08-15 §cierre), mapas server/public, y en código: bucle (`timers.js`), pesca (`fishing.js`), C

*[Texto truncado por límite del agente en este punto.]*

> **Contradicción menor a resolver manualmente:** rendimiento #2 describe
> `/locate` como "solo OP y poco frecuente", mientras seguridad #1 verifica
> que el comando es accesible **sin OP** desde el chat (gate `:350`). No se
> elige un veredicto: la severidad explotable de seguridad prevalece como
> hipótesis de trabajo y la discrepancia de gating debe confirmarse leyendo
> `commands.js`.

---

## 5. Paridad con Minecraft

> Informe íntegro del agente `paridad-minecraft` (reintento, tal cual).

Método: lectura dirigida de `server/constants.js`, `server/combat.js`, `server/fishing.js` y `recetas.json` (+ greps puntuales en `actions.js`/`projectiles.js`/`crafting.js` para wind charge, bundle y blast furnace), contrastado contra valores oficiales de MC Java. Solo lectura; sin tests ni cambios.

### Tabla de discrepancias priorizada

| # | Mecánica | MC real (Java) | Clon (código) | Veredicto | Gravedad |
|---|---|---|---|---|---|
| 1 | Caña de pescar — tiempo de picada | Espera aleatoria ~100–600 ticks (**5–30 s**) | `BITE_MIN_MS 1500 + rand·3500` → pica a los **1,5–5 s** (`fishing.js:24-25`) | ❌ notable (pesca ~6× más rápida; primera hora muy visible) | alto |
| 2 | Caña — tabla de loot por categoría | Base sin encantamientos: pescado **85 %**, basura **10 %**, tesoro **5 %** | `LOOT_CATEGORY_WEIGHTS {fish 85, treasure 5, junk 10}` (`fishing.js:51`) — ratios correctos | ✅ OK | — |
| 3 | Caña — ítems del loot | Pescado solo crudo (cod/salmon/…); tesoro: arco, caña encantada, libro, línea, silla, pluma?? (no: pluma es basura); flint **no** sale de pesca | Incluye `COOKED_COD` (25 % del pescado) y `FLINT` como tesoro (`fishing.js:35-49`) | ⚠️ menor | bajo |
| 4 | Caña — durabilidad | **64** | `FISHING_ROD_DURABILITY = 64`, desgaste solo al recoger captura (`constants.js:1413`, `combat.js:209-223`) | ✅ OK | — |
| 5 | Escudo — mitigación | Bloquea **~100 %** del daño melee/proyectil (tras cooldown 0,25 s); desgaste 336 | `SHIELD_BLOCK_FACTOR = 0.4` → pasa el 40 % (absorbe 60 %) siempre activo; durabilidad 336 ✅ (`constants.js:1424-1425`, `combat.js:436-457`) | ❌ notable (mitigación muy inferior cambia el combate; orden bloque→armadura sí es correcto) | alto |
| 6 | Tótem de la inmortalidad | Salud → mitad ✅, Absorción II (**8 HP durante 5 s**), **Regeneración II 40 s**, **Resistencia al fuego 40 s** | Cura a mitad ✅ + absorción 8 **sin expirar** (solo muerte la limpia); sin regeneración ni resistencia al fuego (`combat.js:472-478`, `constants.js:1433`) | ⚠️ menor (valor numérico correcto, efectos ausentes/permanentes) | medio |
| 7 | Maza — daño | Base ~5–6; smash: bonus escalonado fuerte por altura (≈ +4/+2/+1… por tramos) | Base 6 + **1 HP/bloque** desde ≥1,5 bloques (`constants.js:1509-1512`, `actions.js:747-750`); el comentario remite a criterio de spec | 📋 decisión documentada (fórmula lineal simplificada declarada en código) | bajo |
| 8 | Botella de miel | **6 hunger**, saturación mod 0,4 → **2,4** | `{food: 6, saturation: 1.2}` (`constants.js:884`) — hambre ✅, saturación a la mitad | ⚠️ menor | bajo |
| 9 | Miel — daño de caída | Reduce el daño de caída a ~20 % (no a 0) | Anula el daño por completo; simplificación declarada en comentario (`combat.js:537-538`) | 📋 decisión documentada | bajo |
| 10 | Blast furnace | ×2 velocidad para **menas/metales: hierro, oro y cobre** (nunca comida) | ×2 confirmado (`crafting.js:295-300`) pero solo `IRON_INGOT`/`GOLD_INGOT`; **falta cobre** (`constants.js:1332`) | ⚠️ menor | bajo |
| 11 | Linterna | Nivel de luz **15**; receta: antorcha + **8 nuggets** de hierro | Emite vía conducto de antorcha → nivel **14**; receta antorcha + **4 lingotes** (mucho más cara que 8 nuggets) (`constants.js:340-343`) | ⚠️ menor | bajo |
| 12 | Wind charge | Ráfaga que empuja, radio ~3, sin daño; receta 1 breeze rod → **4** | `WIND_BURST_RADIUS 3` sin daño (`projectiles.js:55-56`); 1 rod(271) → 4 (`recetas.json:1021-1029`) | ✅ OK | — |
| 13 | Tablones de bambú | **2 bambú → 2 tablones** (ratio 1:1) | **4 bambú → 1 tablón** (2×2, count 1) (`recetas.json:462-470`) — 8× más caro | ❌ notable | medio |
| 14 | Andamios | 6 bambú + 1 **cuerda** → 6 | 6 bambú → 6 ✅ ratio, pero sin cuerda (`recetas.json:472-480`) | ⚠️ menor | bajo |
| 15 | Cobre: escaleras/losa/puerta | 6→4 escaleras · 6→6 losas · 6→3 puertas | 182→4 · 182→6 · 182→3 (`recetas.json:770-798`) | ✅ OK | — |
| 16 | Camas teñidas y concreto en polvo | Camas: 3 lana + 3 tablones → 1; concreto: 4 arena + 4 grava + tinte → **8** | Ambas correctas en forma y cantidades (`recetas.json:933-997`, `1031-1101`) | ✅ OK | — |
| 17 | Bundle | Agrupa **stacks del mismo tipo** (hasta 64 ítems mezclados en un slot); se craftea con hilo+cuero | Cofre portátil de **9 slots libres** (`actions.js:971-1075`); sin receta en `recetas.json` (obtención no verificada) | 📋 discrepancia de diseño conocida (función distinta, no aproximación) | medio si se quiere paridad estricta |

**Sin verificar** (fuera de presupuesto): devolución de botellas vacías al craftear honey_block, obtención/coste real del bundle, si la absorción del tótem debería expirar según lo dicho en la spec §11 (no marcado doble por no haber leído la spec), comportamiento del bobber con lluvia/bonus de suerte (no existen encantamientos).

### Simplificaciones/Won't documentados (no-discrepancias)

Según lo indicado para la spec fase21.5 §11 — no se reportan como bugs:

- Coral estático (sin crecimiento/vida de colonia).
- Bambú estático (crece a altura fija, sin física de tallo).
- Vault decorativo (sin apertura con key ni loot funcional).
- Escudo sin off-hand (solo mano principal; el factor 0,4 de la fila 5 es aparte, no cubierto por esta excepción).
- Cobre sin oxidación (sin ciclo cobre↔cubre oxidado).
- Miel anula (en vez de reducir) el daño de caída — declarado en comentario de código (`combat.js:537`).

> **Contradicciones a resolver manualmente (el orquestador no elige):**
> 1. *Escudo 0,4*: paridad lo marca ❌ notable frente a MC, pero la spec
>    F21.5 §C2 documenta `SHIELD_BLOCK_FACTOR = 0.4` como **decisión
>    acordada** ("absorbe el 60 %"). Tensión entre decisión de fase y meta de
>    paridad: resolver el propietario del producto.
> 2. *Picada de pesca 1,5-5 s*: coincide con el ejemplo de la spec A1
>    ("p. ej. 1.5-5 s") pero difiere ~6× del MC real (5-30 s). Igual tensión
>    decisión-vs-paridad.

---

## Recomendaciones finales

Ordenadas por impacto/esfuerzo. Referencias: TODO.md (tracker), DEPENDENCIAS.md
(F22 exige F21.5 cerrada). Los fixes 1-7 caben como **mini-bloque de fixes
pre-F22** (estilo Z1 de la propia F21.5) o primera iteración rolling de la F22;
los 8+ son backlog o verificación.

1. 🔴 **Corregir `/locate <bioma>` síncrono** (seguridad #1 🟠 + rendimiento
   #2, hallazgo transversal): acotar radio (p. ej. 256), trocear el barrido
   entre ticks o cachear el último resultado; evaluar exigir OP para la
   variante bioma. Es el único hallazgo con impacto en TODOS los jugadores y
   spameable sin modificar el cliente. *Encaja: mini-bloque fixes pre-F22.*
2. 🟠 **Clamp de `MAX_STACK` en la fusión de bundles** (seguridad #5, clase
   SV-5 persistente): `dest.count += item.count` → clamp a 64 o split de
   slots como ya hace `addToInventory`. Trivial. *Mini-bloque pre-F22.*
3. 🟠 **Escudo: autoridad de servidor + input** (cluster completo, hallazgos
   servidor #1/#2 + cliente #4): etiquetar daño de proyectil con
   `source: "projectile"` para que la rama del escudo no quede muerta
   (flechas PvP lo atraviesan); resetear/reválidar `p.blocking` al cambiar de
   slot y comprobar el ítem en mano en `damagePlayer`; en cliente, resetear
   `shieldBlocking` al cambiar slot y escuchar `mouseup` a nivel documento.
   Incluye desgaste de la maza al golpear (servidor #3: no está en
   `SWORD_DAMAGE`, arma indestructible). *Mini-bloque pre-F22 (C2/D3).*
4. 🟡 **Cerrar sesión de mochila en el cliente** (cliente #1): reordenar
   `toggleBundleUI` para enviar `bundle_action close` (y repintar la columna
   de inventario del panel, cliente #2, con `updateBundleInventoryUI` en
   `applyInventory`/`repaintIcons`). *Mini-bloque pre-F22 (F4).*
5. 🟡 **Cluster jukebox/note block**: validar coords con `Number.isFinite`,
   comprobar tipo de bloque objetivo y guarda de distancia NaN-safe
   (seguridad #3); `stopDisc()` en showMenu/muerte/reconnect/init (cliente
   #3); opcional: persistir `state.jukeboxes` en world.json o documentar la
   pérdida del disco (seguridad #6 ⚪). *Mini-bloque pre-F22 (D6).*
6. 🟡 **Allowlist de Origin** (seguridad #2): tratar hostname sin puerto como
   sospechoso (comparar contra allowlist también en ese caso). Restaura la
   eficacia real de M1. *Backlog seguridad, barato.*
7. 🟡 **`/summon` con cuota global** (seguridad #4): consultar la cuota de
   mobs y clamp de coords a bordes del mundo (patrón SV-6 de `/tp`).
   Solo-OP, esfuerzo mínimo. *Backlog comandos.*
8. ⚪ **Paridad rápida decidible** (paridad filas 1/8/10/11/13): ratio
   bambú→tablón (2:2 vs actual 4→1), saturación de miel 2,4, cobre en blast
   furnace, luz/receta de linterna, picada de pesca hacia 5-30 s. Cada una es
   un cambio de constante/receta + recalibración de test. Decidir primero si
   mandan la decisión de fase (ver contradicciones) o la paridad MC.
   *Fase de paridad posterior o ajuste puntual.*
9. ⚪ **Completar el pase de servidor** (§2): `combat.js` quedó auditado línea
   a línea, pero siguen sin revisión directa los handlers WS nuevos por dentro
   (wind charge/bundle/blast furnace), el ciclo interno de `projectiles.js`,
   `fishing.js` completo y la persistencia de campos nuevos — las áreas que el
   informe marca «No revisado». Agendarlo al abrir F22 (su superficie minera
   tocará los mismos ficheros), junto con resolver sus dos preguntas abiertas
   (bonus de maza no consumido al golpear; desgaste de escudo tras armadura,
   posible decisión de spec §C2). *Apertura F22.*
10. ⚪ **Higiene de docs y backlog heredado**: sincronizar `STATUS.md`
    (aún marca F21.5 EN CURSO con D1/E4/Z1 pendientes, contradictorio con
    TODO/spec ya cerrados); cerrar los residuos PERSISTES: pausa de render en
    blur (CL-2, cliente #5), reset local en reconnect (CL-1 parcial,
    cliente #6), opacidad compartida de materiales de partículas (cliente #7);
    perfilar `/locate` y `arrows_update` según §4-Recomendado. *Mejora
    continua.*

**Causas raíz transversales detectadas:** (a) la superficie WS/comandos nueva
tiende a reintroducir patrones ya corregidos (validación H1 incompleta en
jukebox, tope de mobs M2 en /summon, tope SV-5 en bundle) — conviene un
checklist anti-regresión al añadir handlers; (b) los paneles/UI nuevos no
heredan automáticamente los caminos de cierre/reset que cofre/horno sí tienen;
(c) `/locate` es el único punto donde generación (ruido multi-octava) se invoca
desde un camino interactivo sin presupuesto de tiempo.

---

*Auditoría orquestada 2026-08-22 (servidor completado en segunda ronda el
mismo día). Pases: linea-base ✅, seguridad ✅, rendimiento ✅ (parcial),
cliente ✅ (parcial), paridad ✅, servidor ✅ (combat.js línea a línea; 6.º
intento tras 5 fallos del entorno, nota en §2). Informes ensamblados tal
cual, sin reinterpretación; contradicciones marcadas inline.*
