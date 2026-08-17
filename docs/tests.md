# docs/tests.md — Suite de tests y cobertura

Guía de los tests del proyecto (clon de Minecraft, servidor Node autoritativo
`server/` + cliente Three.js `public/`, todo en español). La suite vive en
`tests/` y la orquesta `tests/run.js`. Este documento es la **matriz
módulo → test** y la guía de cobertura; complementa la sección *Tests* del
[`README.md`](../README.md).

## Vínculo bidireccional specs ↔ tests

Cada **bloque** de una spec (p. ej. `Fase 13, Bloque B3`) se cierra con su
test en verde, y el vínculo queda explícito en ambos sentidos:

- **Spec → tests:** la sección *Tests que cubren esta fase* de cada
  `docs/spec/faseN-spec.md` enlaza los archivos de `tests/` que verifican
  la fase.
- **Test → spec:** cada test de `tests/` lleva al inicio un comentario con
  su fase y bloque (p. ej. `// Fase 16 (B2): cofre Shift`), y `tests/run.js`
  mantiene esa etiqueta en la lista `UNIT`/`E2E`/`AUDIT`.

`node scripts/check-specs.js` valida que los tests referenciados por las
specs existan y que no queden rutas del antiguo layout (`docs/fase*.md`,
`docs/auditoria-*.md`); devuelve 0 errores cuando todo está coherente.

## Cómo se ejecuta

```bash
node tests/run.js               # unitarios + E2E (los E2E se omiten sin servidor)
node tests/run.js --unit        # solo unitarios
node tests/run.js --audit       # solo auditorías por fase standalone
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E (necesita servidor)
node tests/run.js --unit --filter <regex>            # solo los tests que casan con <regex>
npm run audit        # CI 20 (v20.2): dependencias sin vulnerabilidades (--audit-level=moderate)
```

- Cada unitario es un script Node plano que termina con salida 0/1; el runner
  los encadena, muestra **tiempo por test** y propaga los `# checks fallidos`
  de cada uno.
- `--filter` recibe un regex sobre el nombre del archivo (p. ej.
  `--filter 'unit-(mundo|biomas|arboles)'`). Útil durante el desarrollo para
  iterar rápido sin esperar la suite completa.
- **E2E omitidos ("no hay servidor") no es un fallo**: levanta
  `SEED=miSemilla2026 PORT=3998 node server.js` en otra terminal y repite
  con `--e2e`. La `SEED` es obligatoria desde la Fase 17 (A1): sin ella el
  servidor arranca en modo menú y nunca envía `init`, así que los E2E
  clásicos se colgarían. El E2E del menú (`e2e-menu.js`) es la excepción:
  levanta su propio servidor sin `SEED` en el puerto 3997.
- **Verificación mínima antes de entregar** (`CLAUDE.md` §"Cómo trabajar"):
  `node --check` sobre los `.js` tocados + `node tests/run.js --unit` +
  arrancar el servidor y confirmar que sirve `/`. **CI 20 (v20.2):** sumar
  `npm run audit` — sin CI en el repo, pero el paso queda documentado y
  scripteado (`--audit-level=moderate`: solo falla con vulnerabilidades
  moderadas o peores).

## Cobertura

La suite entera puede medirse con [c8](https://github.com/bcoe/c8) (devDep,
v12):

```bash
npm run test:coverage   # c8 con --check-coverage y umbrales (ver abajo)
```

El informe en consola muestra `% Statements / Branch / Functions / Lines` por
archivo de `server/` y `public/`. `coverage/` está en `.gitignore`.

**Umbrales de c8 (G6, guardas de regresión — medidos 2026-08-12):** el script
falla si algún directorio baja de su mínimo:

| Ámbito | Líneas | Funciones | Statements | Branch |
| --- | --- | --- | --- | --- |
| Global | 50 % | — | 50 % | — |
| `server/*.js` (módulos críticos) | 80 % | 80 % | 80 % | 75 % |
| `public/*.js` (cliente DOM/Three) | 15 % | 50 % | 15 % | 50 % |

Los módulos del servidor se cubren en Node (medido ~90 %); el cliente está
acoplado a DOM/Three/Web Audio y se cubre por CDP/E2E y lógica pura extraída
(medido ~20 % de statements — los huecos por archivo están documentados en la
sección *Cobertura*).

**Lógica pura del cliente testeada en Node** (precedente a seguir para
añadir cobertura nueva): `quality.js` (`unit-ajustes.js`), `lod.js`
(`unit-lod.js`), `lighting.js` (`unit-antorchas.js`), `itemicons.js`
(`unit-itemicons.js`), `recipeCategories.js` (`unit-recipecats.js`),
`chunkGeometry.js` (`unit-greedy.js`), `chunkWorker.js` (`unit-workers.js`)
y `daymath.js` (`unit-dia.js`). Los módulos acoplados a DOM/Three.js (render,
física visual, Web Audio) se verifican en navegador vía `tests/audit-fase7.js`
(Chrome headless + CDP) o por E2E, no en Node — **no** vale la pena mockear
Three/DOM para forzarlos.

> Los tests nuevos usan `tests/helpers.js` (G1.3): `Reporter` para el
> reporte uniforme que parsea `run.js` (`N OK, M FAIL` + `# checks
> fallidos`), `mkPlayer`, `withRandom` (LCG determinista) y `loaderESM`.

## Suite unitaria (61 tests)

> Orden de `UNIT` en `tests/run.js`. El `(*)` marca tests que importan código
> del cliente (`public/`) como ESM.

| Test | Cubre |
| --- | --- |
| `unit-hambre.js` | Hambre/saturación: decaimiento, regeneración, inanición |
| `unit-cria.js` | Alimentar y criar animales (modo amor, cooldown, bebé que crece) |
| `unit-crafting.js` | Crafteo 3x3 (patrones) y ciclo del horno |
| `unit-mundo.js` | Cuevas, lagos y bocas de cueva |
| `unit-mobs-agua.js` | Mobs se hunden en el agua (no caminan encima) |
| `unit-spawn.js` | Spawn/respawn siempre en tierra firme (nunca en agua) |
| `unit-biomas.js` | Biomas nieve/montaña y transiciones suaves de altura |
| `unit-durabilidad.js` | Durabilidad de herramientas, XP/niveles, mobs nuevos |
| `unit-persistencia.js` | Persistencia (F1) + **C1 guardado asíncrono** + **C5 hornos huérfanos** + mascotas/slimes (v5) + migración v5→v6 + `.bak` + `switchWorld` + `listWorlds` |
| `unit-mobs-ia.js` | Máquina de estados de mobs, ataque con cooldown, quema solar, spawn por fase, tope 30 |
| `unit-mobs-poo.js` | POO (F13): subclases por especie + `createMob` |
| `unit-poo-entities.js` | POO (F13): `Player`/`World`/`Chunk`/`ItemStack` como clases (+ G2.5: serialización, merge/clamp, durabilidad 0, inventario lleno) |
| `unit-lagunas.js` | Lagunas L1-L5: arco, puertas, escaleras/losas/vallas, cubo, recetas |
| `unit-red.js` | Handlers de `net.js` con ws fake (sin servidor) + **C2 coords inválidas** + **C4 cooldown de `set_seed`** + CL-3 parse seguro. F18 D-1: los handlers de juego viven en `actions.js` y el arranque/tick en `timers.js` (fachadas de `net.js` intactas) |
| `unit-recetas.js` | Integridad de recetas + cadena de obtención de las 20 herramientas + **F20 B3** cadena minar→crudo→horno (RAW_IRON/RAW_GOLD, ORE_DROP como fuente en huérfanos) |
| `unit-recipecats.js` | Categorías del libro de recetas |
| `unit-sync.js` | Sincronía de IDs/constantes `server/constants.js` ↔ `public/constants.js` |
| `unit-paridad.js` | Tabla oficial de MC fijada (vida 20, curva XP, espadas, armadura, durezas, durabilidad) + **F18 C-5** `MOB_XP`↔`mobXp()` coherente (checks D6) + **C-3** comida (zanahoria/patata) + **C-1** franjas día/noche + sonidos C-9 (hooks) |
| `unit-commands.js` | `/help` `/tp` `/give` `/time set` `/gamemode` `/reload` + **SV-5 `/give` tope 64** + **SV-6 `/tp` clamp** |
| `unit-arboles.js` | Copas de árboles completas en bordes de chunk (`pendingLeaves`) + **F20 B4/P4** inyecta el PRNG vía `setChunkRng` (generación determinista) |
| `unit-reload.js` | Hot-reload de recetas (swap atómico, JSON inválido) |
| `unit-mineria.js` | Dureza/velocidad de rotura, drop condicional, sesiones de minería |
| `unit-lod.js` | LOD puro del cliente (`public/lod.js`): fronteras, histéresis |
| `unit-geopool.js` | Pool de geometrías: reutilización real, tope, categorías |
| `unit-greedy.js` | Greedy meshing: menos caras + identidad con la referencia per-celda |
| `unit-workers.js` | Worker de chunks: geometría idéntica al camino síncrono |
| `unit-raycast.js` | Raycast de minería con three real (fix del pool de bounds) |
| `unit-mobray.js` | Raycast de mobs multibloque |
| `unit-camara.js` | Clamp de pitch del PLC (sin vueltas) con three real |
| `unit-fase11.js` | 4 biomas nuevos, lianas, esquileo, bonemeal, agua infinita + pendientes F10 (TNT mecha/cráter/bedrock + **G2.6 cadena y daño + F20 B3 knockback**: evento `knockback`, ventana `kbUntil`, `mob.kb` integrado en el tick, mundo-size, `/kill`) |
| `unit-fase12.js` | Slimes, lobo/gato, tridentes del ahogado, drops, persistencia de mascotas |
| `unit-mining-click.js` | Decisión de clic mob delante/detrás |
| `unit-fase9.js` | Gamemode por mundo, `world_delete` (path-traversal), cultivos, `creative_pick`/`fly`, libro |
| `unit-cofre.js` | Estado y handlers del cofre (put/take, lleno, rotura que limpia) |
| `unit-antorchas.js` | Antorchas (soporte, receta) + motor de luz del cliente `public/lighting.js` |
| `unit-cama.js` | Dormir (salta la noche), rechazo de día, respawn y limpieza al romperla |
| `unit-armadura.js` | Reducción de daño, tope 0.8, desgaste, equipar/des-equipar |
| `unit-respawn.js` | Respawn por gamemode: survival pierde inventario, creative conserva |
| `unit-caida.js` | Daño por caída (fórmula MC), void, agua que anula |
| `unit-anticheat.js` | Anti-cheat de vuelo (v1) + **C3 anti-cheat v2** (hover + ventana deslizante de velocidad) + `WS_MAX_PAYLOAD`. F18 D-1: la validación vive en `server/anticheat.js`; `timers.js` pasa `maxPayload` al `WebSocket.Server` |
| `unit-crack.js` | Grieta de rotura sincronizada |
| `unit-terreno.js` | Minas abandonadas con loot, pozos agua/lava, gzip del guardado |
| `unit-itemicons.js` | Iconos procedurales de ítems (determinismo, distinguibilidad) |
| `unit-ajustes.js` | Lógica pura de `public/quality.js` (perfiles, clamps) |
| `unit-metricas.js` | Métricas de tick (servidor/cliente) |
| `unit-perf-server.js` | Perfilado del servidor: snapshot 1/tick, broadcast solo si cambia, `getBiome` cacheado |
| `unit-damage.js` | Daño (armadura, protección, fuentes) |
| `unit-sky.js` | Cielo procedural (`public/sky.js`/`skycolors.js`) |
| `unit-ao.js` | AO por vértice (esquinas internas) |
| `unit-muerte.js` | Causas de `player_die` (caída, mob, fuego, ...) |
| `unit-fase16.js` | Fase 16: niebla submarina (B1), cofre Shift (B2), horno `FUEL_TICKS` (D1), drops (D2), puertas ×3/vidrio 200 t/carbón vegetal (D3-D5), XP del slime y lobo (D6) |
| `unit-dia.js` | Matemática pura del ciclo día/noche (`public/daymath.js`): `dayFactor`, `duskFactor` (pico real en d≈0.402), `fogDistances` (30/70→75/200) y `cloudTint` + `CLOUD_TINT_STEP` (G3) |
| `unit-fase17.js` | Fase 17: modo menú (A1), persistencia por nombre (B1), romper el bloque bajo una flor/hierba (B4), hostiles no agreden en creativo (B6), cuevas largas (B5), heartbeat (B2), minado continuo (B7), táctil (D1) |
| `unit-skins.js` | Fase 17 (C3): skins de jugador — píxeles puros de los 9 skins (`public/skins.js`), sincronía `PLAYER_SKINS` ↔ `SKINS` y protocolo `set_skin`/`player_skin` (17 checks) |
| `unit-fase18.js` | Fase 18 (C-8): orbes de XP — suelte en survival, recogida al pisar (radio 2), creative conserva, no se persisten, expiran (5 min) |
| `unit-minerales.js` | Fase 18 (C-2): bandas de profundidad de las menas por percentil MC |
| `unit-fase19.js` | Fase 19 (D): drag & drop — lógica pura de transporte (`public/draglogic.js`) + hot-reload de iconos |
| `unit-fase19.5.js` | F19.5: paleta de audio por bioma (`musicpalette.js`) + toggle reduceMotion |
| `unit-fase19.6.js` | F19.6: shaders de agua/plantas, toon, instancing (decisión) + **F20 B4/P7** índice espacial de antorchas (`getTorchesNear`, vecindario 3×3) |
| `unit-fase20.js` | Fase 20 (v20.1): regresión del bug «#menu-bg no se oculta al iniciar partida» — `showMenuBg()` visible solo en el menú principal, oculto al entrar al mundo y en la pausa |
| `unit-fase21.js` | Fase 21 (A1+A2+B1): biomas más grandes — coherencia de rachas (`BIOME_FREQ` 0.003, media ≥ 11, mediana ≥ 5) + determinismo/presencia de los 8 biomas base; sub-biomas — bandas coherentes (0 violaciones), abedul 100 % en `birch_forest` (vs ~1/3 en `forest`), abeto 2×2 en `giant_taiga`, nieve en las cumbres emergidas de `snowy_peaks`; pozo del desierto — solo en desierto firme (nunca agua), determinista y con el layout MC (piso arena, brocal 2 capas, fuente central). Ampliado 2026-08-17 (+282 lín.): **B2 pirámide** (determinismo de `pyramidCenterAt`, footprint/`pyramidAt`, trampa posicional `pyramidTrapAt`, 4 cofres en las esquinas de la bandeja, TNT bajo la celda central, pozo de aire, loot en `state.chests`), **C1** vaca ordeñable (`handleMilkCow` consume cubo → MILK) y gallina ponedora (`tickChicken` → EGG al jugador cercano), **C2** enderman neutral (`isPlayerLookingAt` en radianes, `isEndermanWatched`, aggro de 20 s, neutral sin mirada) |

## Fase 21 (CERRADA 2026-08-17) — matriz completada

> La F21 (biomas ampliados, estructuras y más mobs) **cerró 2026-08-17**
> (spec [`fase21-spec.md`](spec/fase21-spec.md), etiqueta `v21.2`): todos
> los bloques A1/A2/B1/B2/C1/C2/C3 + el D1 de la iteración v21.2 (ríos al
> nivel del mar) implementados y testeados; **D2/D3 diferidos a la F21.5**
> (espec F21.5 §1.4). Suite **61/61**, `--audit` **8/8** (nueva
> `audit-fase21.js` con 25 checks end-to-end).

| Bloque F21 | Tests | Notas |
| --- | --- | --- |
| **A1** Biomas más grandes (extensión) | ✅ `unit-fase21.js` (coherencia de rachas / determinismo / 8 biomas base) | `unit-biomas.js` y `unit-mundo.js` recalibrados; `audit-fase4` sin regresión |
| **A2** Biomas de superficie nuevos | ✅ `unit-fase21.js` (bandas coherentes, abedul puro, abeto 2×2, nieve en picos) | `unit-biomas.js` ampliado (sub-biomas A2 + recalibración D1) |
| **B1** Estructuras pasivas (pozo) | ✅ `unit-fase21.js` (pozo determinista solo en desierto firme, layout MC) | iglú y geoda → P1 (geoda reusa bloques de la F22) |
| **B2** Estructuras activas (pirámide) | ✅ `unit-fase21.js` (asserts B2: centro/footprint/trampa/cofres/TNT/pozo) + `audit-fase21.js` (chunks reales) | cabaña/puesto/fortaleza/ruinas → P1; mansión/monumento fuera |
| **C1** Mobs pasivos (vaca, gallina) | ✅ `unit-fase21.js` (ordeñar MILK 260, huevo EGG 261) + `unit-recetas.js` (`DROPS_JUSTIFICADOS`) | pulpo y huevo lanzable → P1 |
| **C2** Mobs neutrales (enderman) | ✅ `unit-fase21.js` + `audit-fase21.js` (radianes, menú/creativo ignorados) | zombified piglin y abeja → P1 |
| **C3** Mejoras de IA | ✅ `audit-fase21.js` (zombi convoca ≤16, araña día/noche, creeper huye de gatos) | esqueleto strafe cubierto también en `unit-mobs-ia` |
| **Iteración v21.2 D1** ríos | ✅ `audit-fase21.js` (lecho ≤ SEA_LEVEL, cauce ≤ terreno) + `unit-biomas.js`/`audit-altura.js` recalibrados | D2/D3 diferidos a la F21.5 |
| **Cierre D1** | ✅ `audit-fase21.js` (25 checks) | `--audit` 8/8, E2E 7/7, biome 0 |

## Auditorías standalone

`node tests/run.js --audit` (o cada una por separado):

| Auditoría | Contenido |
| --- | --- |
| `audit-fase3.js` | Balance del hambre por simulación + rendimiento del tick de mobs con cría |
| `audit-fase4.js` | Culling de caras con cuevas + benchmark de generación (determinismo) |
| `audit-fase5.js` | Sincronización de durabilidad servidor↔cliente, no-duplicación al romperse una herramienta |
| `audit-fase6.js` | LOD (caras/triángulos con y sin LOD), memoria por chunk, pool, determinismo del caparazón |
| `audit-fase7.js` | Métricas de tick + FPS en Chrome headless vía CDP + integridad del guardado |
| `audit-altura.js` | Mundo de 128 bloques (−64..+63): layout, superficie, cuevas, biomas, minerales, agua, estructuras, costuras, migración v5→v6, geometría (72 checks) |
| `audit-fase20.js` | Fase 20 (rolling release, 17 checks): ratelimit 2-ventanas (D2), MAX_STACK 64 en `addToInventory` (SV-5), `savePlayersAsync` por cola (REN-1), generación determinista por chunk (P4), índice espacial de antorchas (P7) |
| `audit-fase21.js` | Fase 21 (25 checks): pirámide end-to-end sobre chunks reales (B2: cuerpo piedra, pozo aire, placa, TNT, 4 cofres, trampa posicional, determinismo), ríos D1 (lecho ≤ `SEA_LEVEL`, cauce ≤ terreno), enderman en radianes (C2, ignora menú/creativo), IA C3 (zombi convoca ≤16, araña día/noche, creeper huye de gatos) |

## E2E (7, necesitan servidor en `WS_URL` / `ws://localhost:3998` salvo e2e-menu)

| Test | Cubre |
| --- | --- |
| `e2e-menu.js` | Menú Fase 17 (A1/A5/C1/C4): levanta su propio servidor sin SEED en :3997 — menu_state → join_world → init → leave_world → menu_state + cooldown anti-spam |
| `e2e-comer.js` | Comer con clic derecho (hambre/saturación reales) |
| `e2e-durabilidad.js` | Pico de madera, romper sus 59 usos, rotura sin duplicar drops |
| `e2e-cofre.js` | Craftear/colocar/abrir un cofre, guardar/tomar items, romperlo → drop |
| `e2e-reload.js` | Hot-reload de `recetas.json`, `/reload`, JSON inválido sin tumbar el servidor |
| `e2e-mascotas.js` | Lobo domesticado que persiste al reconectar |
| `e2e-templo.js` | Templo de jungla con trampa y cofre |

## Umbrales y política

- **Mecánica nueva → test nuevo** (convención `AGENTS.md`): cada bloque de
  una spec prospectiva cierra con su test en verde.
- **Nada de red puede testearse sin un `ws` fake**: `net.js` exporta
  `handleConnection` para inyectar un WebSocket falso (`unit-red.js`).
- **Cambios de guardado** exigen subir `SCHEMA_VERSION` + migración
  retrocompatible + test (modelo: `unit-persistencia.js`).
- **Cobertura** se mide con `npm run test:coverage` (con umbrales c8, ver
  arriba); los huecos grandes actuales están en los módulos de cliente
  acoplados a DOM/Three (audio, player, network, settings, clouds, particles)
  — se cubren por CDP/E2E y por extracción de lógica pura (como ya se hizo
  con `quality.js`/`lod.js` y con `daymath.js` en G3).
- **Gap conocido:** el TNT no aplica knockback a jugadores (solo daño por
  distancia, `server/tnt.js`); el test de G2.6 lo verifica como tal.
- Antes de cerrar una fase: suite unitaria en verde, auditorías sin
  regresiones, `node --check`/`biome` limpios, E2E 6/6 en solitario.
- **Umbrales de las auditorías por fase (recalibrados 2026-08-12 al mundo
  v6, F18 E-1)** — son **guardas de regresión**, no metas de rendimiento
  (la mejora real de gen/relleno/LOD está diferida a la fase de rendimiento):
  - `audit-fase4`: generación **< 80 ms/chunk** (medido ~26-41 ms),
    ratio caras/bloques **< 8** (medido ~5.75; cuevas grandes de F17 B5).
  - `audit-fase6`: memoria bruta del área activa con LOD **< 800 MB**
    (medido ~619 MB; geometría pre-greedy-meshing, el cliente funde 3-5×),
    reducción LOD ≥ 20 % (medido 78 %).
  - `audit-fase3` (bench del tick de mobs): 30 mobs **< 1 ms/tick** y 300
    **< 4 ms/tick** (recalibrado CI 19, 2026-08-16: ~2× sobre los medidos
    ~0.2-1.5 ms — tolera CPU cargada 15-19 sin dejar de ser guarda de
    regresión).
  - `audit-fase7` (CDP, Chrome headless/SwiftShader + máquina de desarrollo
    bajo carga): tick **< 1000 ms** y gen **< 800 ms** (medidos 246-580 / 
    156-386 ms; la ventana de 6 s cae sobre el relleno inicial, que es el
    coste no optimizado del mundo v6). **Ventanas de tiempo (CI 19,
    2026-08-16)**: arranque del servidor 90×250 ms, carga del target CDP
    90×250 ms, `ready` 45×1000 ms y timeouts de `CDP.send`/`eval`/`uiEval`
    a 25 s — la causa de los fallos es ambiental (SwiftShader + CPU bajo
    carga), no una regresión.
