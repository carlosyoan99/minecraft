# docs/tests.md — Suite de tests y cobertura

Guía de los tests del proyecto (clon de Minecraft, servidor Node autoritativo
`server/` + cliente Three.js `public/`, todo en español). La suite vive en
`tests/` y la orquesta `tests/run.js`. Este documento es la **matriz
módulo → test** y la guía de cobertura; complementa la sección *Tests* del
[`README.md`](../README.md).

## Cómo se ejecuta

```bash
node tests/run.js               # unitarios + E2E (los E2E se omiten sin servidor)
node tests/run.js --unit        # solo unitarios
node tests/run.js --audit       # solo auditorías por fase standalone
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E (necesita servidor)
node tests/run.js --unit --filter <regex>            # solo los tests que casan con <regex>
```

- Cada unitario es un script Node plano que termina con salida 0/1; el runner
  los encadena, muestra **tiempo por test** y propaga los `# checks fallidos`
  de cada uno.
- `--filter` recibe un regex sobre el nombre del archivo (p. ej.
  `--filter 'unit-(mundo|biomas|arboles)'`). Útil durante el desarrollo para
  iterar rápido sin esperar la suite completa.
- **E2E omitidos ("no hay servidor") no es un fallo**: levanta
  `PORT=3998 node server.js` en otra terminal y repite con `--e2e`.
- **Verificación mínima antes de entregar** (`CLAUDE.md` §"Cómo trabajar"):
  `node --check` sobre los `.js` tocados + `node tests/run.js --unit` +
  arrancar el servidor y confirmar que sirve `/`.

## Cobertura

La suite entera puede medirse con [c8](https://github.com/bcoe/c8) (devDep,
v12):

```bash
npm run test:coverage   # c8 --all --src=server --src=public node tests/run.js --unit
```

El informe en consola muestra `% Statements / Branch / Functions / Lines` por
archivo de `server/` y `public/`. `coverage/` está en `.gitignore`.

**Lógica pura del cliente testeada en Node** (precedente a seguir para
añadir cobertura nueva): `quality.js` (`unit-ajustes.js`), `lod.js`
(`unit-lod.js`), `lighting.js` (`unit-antorchas.js`), `itemicons.js`
(`unit-itemicons.js`), `recipeCategories.js` (`unit-recipecats.js`),
`chunkGeometry.js` (`unit-greedy.js`) y `chunkWorker.js` (`unit-workers.js`).
Los módulos acoplados a DOM/Three.js (render, física visual, Web Audio)
se verifican en navegador vía `tests/audit-fase7.js` (Chrome headless + CDP)
o por E2E, no en Node — **no** vale la pena mockear Three/DOM para forzarlos.

## Suite unitaria (51 tests)

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
| `unit-poo-entities.js` | POO (F13): `Player`/`World`/`Chunk`/`ItemStack` como clases |
| `unit-lagunas.js` | Lagunas L1-L5: arco, puertas, escaleras/losas/vallas, cubo, recetas |
| `unit-red.js` | Handlers de `net.js` con ws fake (sin servidor) + **C2 coords inválidas** + **C4 cooldown de `set_seed`** + CL-3 parse seguro |
| `unit-recetas.js` | Integridad de recetas + cadena de obtención de las 20 herramientas |
| `unit-recipecats.js` | Categorías del libro de recetas |
| `unit-sync.js` | Sincronía de IDs/constantes `server/constants.js` ↔ `public/constants.js` |
| `unit-paridad.js` | Tabla oficial de MC fijada (vida 20, curva XP, espadas, armadura, durezas, durabilidad) |
| `unit-commands.js` | `/help` `/tp` `/give` `/time set` `/gamemode` `/reload` + **SV-5 `/give` tope 64** + **SV-6 `/tp` clamp** |
| `unit-arboles.js` | Copas de árboles completas en bordes de chunk (`pendingLeaves`) |
| `unit-reload.js` | Hot-reload de recetas (swap atómico, JSON inválido) |
| `unit-mineria.js` | Dureza/velocidad de rotura, drop condicional, sesiones de minería |
| `unit-lod.js` | LOD puro del cliente (`public/lod.js`): fronteras, histéresis |
| `unit-geopool.js` | Pool de geometrías: reutilización real, tope, categorías |
| `unit-greedy.js` | Greedy meshing: menos caras + identidad con la referencia per-celda |
| `unit-workers.js` | Worker de chunks: geometría idéntica al camino síncrono |
| `unit-raycast.js` | Raycast de minería con three real (fix del pool de bounds) |
| `unit-mobray.js` | Raycast de mobs multibloque |
| `unit-camara.js` | Clamp de pitch del PLC (sin vueltas) con three real |
| `unit-fase11.js` | 4 biomas nuevos, lianas, esquileo, bonemeal, agua infinita + pendientes F10 (TNT, mundo-size, `/kill`) |
| `unit-fase12.js` | Slimes, lobo/gato, tridentes del ahogado, drops, persistencia de mascotas |
| `unit-mining-click.js` | Decisión de clic mob delante/detrás |
| `unit-fase9.js` | Gamemode por mundo, `world_delete` (path-traversal), cultivos, `creative_pick`/`fly`, libro |
| `unit-cofre.js` | Estado y handlers del cofre (put/take, lleno, rotura que limpia) |
| `unit-antorchas.js` | Antorchas (soporte, receta) + motor de luz del cliente `public/lighting.js` |
| `unit-cama.js` | Dormir (salta la noche), rechazo de día, respawn y limpieza al romperla |
| `unit-armadura.js` | Reducción de daño, tope 0.8, desgaste, equipar/des-equipar |
| `unit-respawn.js` | Respawn por gamemode: survival pierde inventario, creative conserva |
| `unit-caida.js` | Daño por caída (fórmula MC), void, agua que anula |
| `unit-anticheat.js` | Anti-cheat de vuelo (v1) + **C3 anti-cheat v2** (hover + ventana deslizante de velocidad) + `WS_MAX_PAYLOAD` |
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

## E2E (6, necesitan servidor en `WS_URL` / `ws://localhost:3998`)

| Test | Cubre |
| --- | --- |
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
- **Cobertura** se mide con `npm run test:coverage`; los huecos grandes
  actuales están en los módulos de cliente acoplados a DOM/Three (audio,
  player, network, settings, clouds, particles) — se cubren por CDP/E2E y por
  extracción de lógica pura (como ya se hizo con `quality.js`/`lod.js`).
- Antes de cerrar una fase: suite unitaria en verde, auditorías sin
  regresiones, `node --check`/`biome` limpios, E2E 6/6 en solitario.
