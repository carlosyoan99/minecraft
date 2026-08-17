# docs/ — Índice de documentación

> **Estado vivo del proyecto:** [`STATUS.md`](../STATUS.md) (fase activa,
> implementado/en revisión/bloqueantes) · **Grafo de fases:**
> [`DEPENDENCIAS.md`](../DEPENDENCIAS.md).

Índice de la documentación del proyecto (clon de Minecraft, servidor Node
autoritativo `server/` + cliente Three.js `public/`, todo en español). Estas
specs son la **fuente de verdad** de cada fase: qué se hizo, cómo y por qué
(decisiones, mecánicas, auditorías y bugs con causa raíz).
[`TODO.md`](../TODO.md) es solo el **tracker de tareas** (estados
`[ ]`/`[x]`) y no crece con detalle — lo que pasa en una fase se documenta
en su spec de [`spec/`](spec/).

**Estructura:**

- [`spec/`](spec/) — specs por fase (`faseN-spec.md`), cada una con su
  etiqueta de estado `[COMPLETADA]`/`[EN CURSO]`/`[PROSPECTIVA]`/
  `[ARCHIVADA]`, bloque de cierre con commits y "Cambios en esta spec".
  Plantilla para fases nuevas: [`spec/TEMPLATE.md`](spec/TEMPLATE.md).
- [`audits/`](audits/) — auditorías técnicas integrales (2026-08-09/10/11).
- `server/` y `public/` — documentación técnica (arquitectura + mecánicas).
- `tests.md` — suite de tests y matriz módulo→test.

## Fases

| Fase | Spec | Tipo | Estado | Áreas clave |
| --- | --- | --- | --- | --- |
| 0 — Base entregada | — | — | ✅ Completada | Servidor autoritativo, generación por chunks con biomas, IA de mobs, crafteo, horno, persistencia cada 30 s, cliente Three.js con física |
| 1 — Cimientos técnicos | [`fase1-spec.md`](spec/fase1-spec.md) | Retrospectiva | ✅ Completada y auditada | Guardado por chunk, `schemaVersion` + migración, descarga de chunks lejanos, modularización cliente/servidor |
| 2 — Identidad sensorial | [`fase2-spec.md`](spec/fase2-spec.md) | Retrospectiva | ✅ Completada y auditada | Atlas de texturas procedural, UV mapping, sonidos Web Audio, ciclo día/noche visual |
| 3 — Bucle de supervivencia | [`fase3-spec.md`](spec/fase3-spec.md) | Retrospectiva | ✅ Completada y auditada | Hambre/regeneración/inanición, drops de comida, cocina en horno, comer, alimentación y cría |
| 4 — Profundidad de terreno | [`fase4-spec.md`](spec/fase4-spec.md) | Retrospectiva | ✅ Completada y auditada | Cuevas 3D, agua con flotación y lagos, biomas nieve/montaña, bloque `B.SNOW` |
| 5 — Progresión y combate | [`fase5-spec.md`](spec/fase5-spec.md) | Retrospectiva | ✅ Completada y auditada | Durabilidad de herramientas, daño de espada por material, mobs nuevos (araña/lobo/conejo), XP/niveles |
| 6 — Mundo jugable y pulido | [`fase6-spec.md`](spec/fase6-spec.md) | Retrospectiva | ✅ Completada y auditada | Minería por sesión, IA hostil (quema solar), semilla/cofre/antorchas, comandos, F3, hot-reload, culling/LOD/pool, cama, armadura, minas, pozos, gzip |
| 7 — Pulido, UX y estética | [`fase7-spec.md`](spec/fase7-spec.md) | Retrospectiva | ✅ Completada y auditada | Menú (nombre, ajustes, mundos, coordenadas), texturas de mobs e iconos, cielo/partículas, caída/void/respawn, métricas, crack sincronizado |
| 8 — Caza de bugs | [`fase8-spec.md`](spec/fase8-spec.md) | Prospectiva + resultados | ✅ Completada | 10 bugs del playtest (B1-B10): combate, minería a mano, pérdida de vida, controles, día/noche 20 min, tecla E, LOD, estrellas, sol/luna, mobs multibloque |
| 9 — Paridad, IA, mundo y menú | [`fase9-spec.md`](spec/fase9-spec.md) | Prospectiva (fuente de verdad de decisiones) | ✅ Completada | Minería funcional (causa raíz del `mcChunks: 0` corregida), gamemode por mundo, borrado de mundos, paridad de mecánicas (curva XP MC, azadas/cultivos), IA por especie (flechas/fuse/quema), estética, mundo/ítems/libro de recetas |
| 9.5 — Mejoras de skills, docs y `.gitignore` | [`fase9.5-spec.md`](spec/fase9.5-spec.md) | Retrospectiva | ✅ Completada | Colisión de flechas con bloques (anti-tunneling), clamp de pitch de cámara, backup `.bak` del guardado, variación de pitch en audio, documentación técnica `docs/server/` + `docs/public/`, `.gitignore` completo |
| 10 — Notas del usuario y paridad avanzada | [`fase10-spec.md`](spec/fase10-spec.md) | Prospectiva | ✅ Completada | Bugs de las notas (agua, lava, hitbox, `/tp`, hielo, hostiles por luz), tamaño de mundo, pantalla de muerte, `/kill`, `test.log`, gravedad de bloques, TNT, sprint, visuales y audio |
| 11 — Bugs de input y cámara, biomas, paridad y cierre de tests | [`fase11-spec.md`](spec/fase11-spec.md) | Prospectiva | ✅ Completada | Clic roto (pointer lock sobre el canvas) y cámara que da vueltas, 4 biomas nuevos (taiga, pantano, jungla, océano), esquilar, bonemeal, fuente de agua infinita, sonidos de mobs, cierre con tests (`unit-fase11`, `unit-camara`) |
| 12 — Mobs por bioma, estructuras, spawn por bioma y persistencia | [`fase12-spec.md`](spec/fase12-spec.md) | Prospectiva (entrevista, alcance acordado) | ✅ Completada y auditada | Lobo de taiga domesticable, slime con división y hop determinista, ocelote→gato que espanta creepers, ahogado con tridente; templo de jungla con trampa, naufragio con cofres; spawn por bioma (`BIOME_SPAWN`/`WATER_SPAWN`), persistencia de mascotas (`SCHEMA_VERSION` 5) y `unit-fase12`/`unit-persistencia` (bloques A-D + migración) |
| 13 — Paridad 1.0, rendimiento, POO y tests de paridad | [`fase13-spec.md`](spec/fase13-spec.md) | Prospectiva (reporte de paridad + entrevista) | ✅ Completada y auditada | Paridad de valores fijada por `unit-paridad.js` (vida 20, curva XP oficial, espadas 4/5/6/7, armadura por puntos, durezas/durabilidades); lagunas L1-L5 (arco, puertas, escaleras/losas/vallas, cubo, recetas — `unit-lagunas.js`); **POO completa del servidor** (`ItemStack`, `World`/`Chunk`, `Player`/`createPlayer`, subclases de mobs + `createMob` — `unit-mobs-poo.js`, `unit-poo-entities.js`); greedy meshing + worker de chunks (`unit-greedy`, `unit-workers`). Auditoría de cierre con suite completa en verde |
| 14 — Auditoría y cierre de Fases 12-13 | [`fase14-spec.md`](spec/fase14-spec.md) | Prospectiva (auditoría) | ✅ Completada y auditada | Bloques A (spawn por bioma, persistencia `SCHEMA_VERSION` 5, tridente contra mobs, slime determinista), B (drop de menas con `ORE_DROP`, tier de pico por mineral, comida/combustible, salud/XP de mobs, boom de creeper = `TNT_DAMAGE`) y C (un solo rayo por `pointermove`, broadcast solo si cambia, rebuild de vecinos, luz de antorcha stale, `sendInit` liviano con relleno progresivo) implementados y en verde. Auditoría de cierre: unit 3666 OK, E2E 4/4, `audit-fase7` CDP OK, `biome` 0 errores |
| 15 — Corrección de auditoría y mejoras del usuario | [`fase15-spec.md`](spec/fase15-spec.md) | Prospectiva (auditoría) | ✅ Completada y auditada | Cierre de los pendientes del reporte de paridad: copas de árboles completas en bordes de chunk (A2, `pendingLeaves` + test determinista en `unit-arboles`), nubes semitransparentes con variedad (D1), tooltip estilizado del hotbar (D3) y **D5: mundo de 128 bloques (Y ∈ −64..+63, `SCHEMA_VERSION` 6, migración v5→v6)** auditado por `tests/audit-altura.js` (§9). El resto del plan (A1 uuid, A3/A4 WIP, L1-L5 arco/puertas/escaleras-cubos-recetas y POO) se cerró junto a la Fase 13. Suite de 50 unitarios en verde + registro de `unit-ao`/`unit-muerte` |
| 16 — Corrección de la auditoría 2026-08-10, bugs del usuario y paridad restante | [`fase16-spec.md`](spec/fase16-spec.md) | Prospectiva (auditoría + notas del usuario + entrevista) | ✅ **Completada y auditada** | A-E (niebla, cofres Shift, IA, inventario/libro/calidad, guardado asíncrono, coords, anti-cheat, hornos, paridad) + bloque G de cobertura completo: `audit-fase7` CDP ampliado (G3.7: niebla/inventario/libro/calidad), `e2e-cofre` +16 checks y `e2e-durabilidad` recalibrado al mundo v6 (G4), c8 con umbrales y `biome` 0 (G6). Suite **53 unitarios**, E2E **7/7 en solitario** (6 clásicos con SEED + menú), auditorías **6/6** |
| 17 — Menú inicial tipo Minecraft, UI/UX y móvil | [`fase17-spec.md`](spec/fase17-spec.md) | Prospectiva (notas del usuario + entrevista) | ✅ **Completada y auditada** | Servidor en modo menú sin cargar mundo al arrancar (A1, con `SEED` arranca directo para E2E), pantalla principal (A2), lista de mundos con reproducir/eliminar/clonar/cambiar modo/renombrar (A3), ajustes en pestañas (A4), flujo cliente menú → `join_world` (A5); 7 bugs del usuario corregidos (B1-B7: persistencia de inventario por nombre, heartbeat B2, watchdog de chunks B3, flor/hierba B4, cuevas largas B5, mobs en creativo B6, minar con clic mantenido B7); UI/UX (C1 pausa estilo MC, C2 estética), skins de jugador (C3: 9 skins procedurales + selector + vista previa 3D + `set_skin`/`player_skin`) y móvil acotado (D1 controles táctiles). Bloque E cerrado: 53/53 unitarios, E2E de menú 7/7, E2E clásicos 6/6 en solitario, auditorías 6/6 y verificación en navegador del flujo completo (menú → mundo → pausa → volver al menú) con 0 errores de consola |
| 18 — Refactor a convenciones, cierre de fases y pulido | [`fase18-spec.md`](spec/fase18-spec.md) | Prospectiva (notas + auditoría 2026-08-11 + entrevista) | ✅ **Completada y auditada** | **Paridad completa C-1..C-9** (día/noche por franjas MC, minerales mapeados al mundo v6, zanahoria/patata comestibles, carbón vegetal como ítem 257, `MOB_XP` coherente, horno con desperdicio/encolado, recetas de mena eliminadas, orbes de XP al morir, 4 sonidos nuevos); **refactor a convenciones D-1..D-8** (net→anticheat/chunk-fill/world-session/actions/timers, mobs→mob-species/mob-spawn/projectiles, world→noise/biomes/generation/structures, save→save-chunks/save-meta/save-players, players→inventory/combat, ui→hud/menus/panels/recipebook, world-cliente→chunkstore/lightclient/meshbuild/lodmesh, input→game-input/raycast/menu-input/touch; fachadas intactas, `SCHEMA_VERSION` 6 y protocolo/IDs sin cambios); A1/E-1/E-2 (auditorías recalibradas 6/6, biome 0 errores); F docs al día; cierre G: suite **56 unitarios**, auditorías 6/6, biome 0, `node --check` limpio |
| 19 — Texturas de ítems, interfaces y pulido visual | [`fase19-spec.md`](spec/fase19-spec.md) | Prospectiva (notas + borrador + entrevista) | ✅ **Cerrada** (2026-08-15) | Prerrequisito: F18 cerrada ✅. Cobertura total de iconos por ID (142/142, 17 checks), rediseño MC de inventario/cofre/horno/libro (fondos texturizados + biseles), hotbar/tooltip unificados con delay, **arrastrar y soltar** (`dragdrop.js`/`draglogic.js` + eventos `inventory_swap`/`grid_return`/`chestSlot`), hot-reload del atlas de iconos, táctil/responsivo; cierre 57 unitarios + 6 auditorías + E2E 7/7 + biome 0 |
| 19.5 — Skills del proyecto: audio por bioma, accesibilidad y refinamientos | [`fase19.5-spec.md`](spec/fase19.5-spec.md) | Prospectiva (borrador 19.5 + notas + entrevista 2026-08-15) | ✅ **Cerrada** (2026-08-15) | Prerrequisito: F18 y F19 cerradas ✅. **Audio ambiental por bioma** (`biome_update` + `musicpalette.js`, cueva > bioma > día/noche), accesibilidad (teclado en paneles, contraste, no-solo-color, `reduceMotion`), raycast auditado (OK), tokens CSS `:root`, higiene servidor (SIGTERM + `log.js`); cierre 58 unitarios + 6 auditorías + E2E 7/7 + biome 0 |
| 19.6 — Motor 3D: iluminación, materiales, shaders, instancing, texturas y animación | [`fase19.6-spec.md`](spec/fase19.6-spec.md) | Prospectiva (borrador 19.5 A-F + entrevista 2026-08-15) | ✅ **Completada (2026-08-16)** | Prerrequisito: F19.5 cerrada. `HemisphereLight` + `uDay` (A1), luz puntual de antorchas `torchLight` toggle OFF (A2), `MeshToonMaterial` toggle `toon` no predefinido (B), agua/lava animada con `uTime` + viento en plantas (C1/C2), `InstancedMesh` **evaluado y rechazado** (D, vegetación ya fusionada por chunk), mipmaps toggle `mipmaps` OFF (E), animación de mobs caminar/atacar (F); **nada que degrade se activa por defecto**. Cierre: `unit-fase19.6` (21 checks), suite 59 unitarios, E2E 7/7, biome 0; bugs B1 (`vertexColors`) y B2 (rate-limit por acción) de la revisión en navegador corregidos |
| 20 — Rolling release (ciclo de estabilización y paridad) | [`fase20-spec.md`](spec/fase20-spec.md) · iteración [`v20.1.md`](v20.1.md) | Prospectiva (notas + borrador + entrevista) | 🟠 **En curso (v20.1 cerrada, ciclo activo)** | Prerrequisito: F18 cerrada (y F16/F17). Ciclo de iteraciones v20.x con auditoría por iteración obligatoria. **v20.1 cerrada (2026-08-16):** TNT **knockback** (evento `knockback` + ventana de confianza `kbUntil` + `mob.kb`), **fundido explícito de mena** (RAW_IRON 258/RAW_GOLD 259 → lingote en horno), rendimiento del backlog 2026-08-15 (P1/P3 ya implementados verificados, **P4 generación determinista por chunk**, **P7 índice espacial de antorchas**, P2 rechazado con métrica, **CL-6 telemetría** `__mcClientErrors`); verificación unit 59/59 + E2E 7/7 + `--audit` 6/6 + biome 0. Documento de la iteración: [`v20.1.md`](v20.1.md) |
| 21 — Biomas ampliados, estructuras y más mobs | [`fase21-spec.md`](spec/fase21-spec.md) | Prospectiva (notas del usuario: Mejoras + borrador 21 + entrevistas 2026-08-12/15) | 📝 **Prospectiva (sin implementar)** | Prerrequisito: F20 cerrada. Mejoras grandes de las notas (con las exclusiones de la entrevista 2026-08-15): **sin** selector de skins (ya en F17 C3 → "Editor de skins" Won't) y **sin** audio por bioma (adelantado a F19.5). Biomas más grandes y nuevos (tundra nevada, badlands, champiñones, bosque oscuro, abedules, taiga gigante, picos, desierto, sabana; lush/dripstone en 2ª tanda), estructuras estáticas pasivas/activas (pozo, iglú, geoda de amatista — reusa los bloques de amatista de la F22, pirámide, cabaña, puesto, mansión, fortaleza, oceánicas) y mobs nuevos (vaca, gallina, pulpo, enderman, zombified piglin, abeja) + mejora de IA; Won't respetado (aldeanos/villas, jefes, blaze/ghast, gólem, Nether/End) |
| 21.5 — Contenido y paridad ampliados: pesca, bloques 1.8-1.15, combate y Trial Chambers | [`fase21.5-spec.md`](spec/fase21.5-spec.md) | Prospectiva (lista de mejoras del usuario 2026-08-15: alta/media prioridad, 1.21 Tricky Trials, 1.21.5 Spring to Life, 1.22/26.1 y comandos + entrevista) | 📝 **Prospectiva (sin implementar)** | Prerrequisito: F21 cerrada. **Nueva fase entre F21 y F22** (no renombra la serie 21-25): pesca con caña (línea = proyectil, tabla de loot), pesca en cofres; piedra pulida (granito/diorita/andesita), linternas, bambú/andamios, colmenas/miel, coral/algas; horno de fundición (×2 minerales), escudo, tótem de inmortalidad, camas de colores (16), concreto + polvo; Trial Chambers con Vault decorativo, Bogged (Breeze en F23), Maza + Heavy Core, familia de cobre/tuff, carga de viento/barra de breeze/mapa de exploración, discos/pinturas; variantes por bioma 1.21.5 + decorativos + hojas cayendo + sonidos de desierto/badlands; Pale Garden/Creaking/Corazón/Mochila (1.22); comandos nuevos (`/weather /kill /locate /effect /summon /ban /op /list`) + selectores `@p @a @e @s @r`. Reusa F21-23 y lo ya hecho (zanahoria/patata F18 C-3, miel F9). Won't: redstone/Crafter, Trial Spawner, Bad Omen, Vault funcional, test command, oxidación del cobre |
| 22 — Profundidad, minerales y fauna 1.17–1.21 | [`fase22-spec.md`](spec/fase22-spec.md) | Prospectiva (plan del usuario 2026-08-15: nueva sección "Actualizaciones Minecraft 1.17 → 1.21" en `Notas del usuario.md` + entrevista) | 📝 **Prospectiva (sin implementar)** | Prerrequisito: F21.5 cerrada. **Minerales en bruto (todos se funden)**, `DEEPSLATE` bajo Y=0, **cobre** (solo el bloque, sin oxidación), **catalejo con zoom real** (bloques de amatista que reusa la F21), **Deep Dark (Sculk) en Y < −40 con propagación**, **rana**, terreno estilo 1.18 y **subida del mundo a 256 SOLO si los tests lo confirman** (si no, se mantiene 128); Won't de la fase documentado (Redstone/Crafter, Trial Chambers, Arqueología, Warden, aldeanos, clima, oxidación, renacuajos); diferidos a F23 (Lush Caves, Breeze, trims, Tuff/Caliza) |
| 23 — Diferidos de la F22: Lush Caves, Breeze, trims, Tuff/Caliza | [`fase23-spec.md`](spec/fase23-spec.md) | Prospectiva (diferidos del plan 1.17→1.21 + entrevista 2026-08-15: numeración F23 = diferidos de F22) | 📝 **Prospectiva (sin implementar)** | Prerrequisito: F22 cerrada. **Lush Caves** (musgo, bayas luminosas con luz, azaleas), **Breeze simplificado** (proyectil que empuja, sin Trial Chambers), **Armor Trims** (10 tintes, sin NBT — campo `trim` retrocompatible o ítems por color), **Tuff/Caliza** (decorativos), **ajolote y cabra** (pasivos), y **altura 256 solo si la F22 no subió** y los tests lo confirman (`SCHEMA_VERSION` 7 + migración si sube, si no 6 intacto) |
| 24 — Nether Update (primera dimensión) | [`fase24-spec.md`](spec/fase24-spec.md) | Prospectiva (sección "Dimensiones: Nether y End" de las notas + entrevista 2026-08-15) | 📝 **Prospectiva (sin implementar)** | Prerrequisito: F23 cerrada. **Desbloquea el Won't "dimensiones"** (intacto hasta abrir la fase). Guardado **opción B** (`world/<semilla>/nether/`, sin migrar la raíz), posición por dimensión **sin subir `SCHEMA_VERSION`**, protocolo `enter_dimension`/`dimension_change` reusando `init`; Nether de **128 bloques** (piso/techo bedrock, cuevas masivas, lagos de lava) con **2 biomas** (Wastes, Soul Sand Valley), **~15 bloques** estáticos, **4 mobs** (zombified piglin, ghast, blaze, magma cube) + **fortaleza** con spawner de blaze; **portal = marco 4×5 que se activa al completarse** (sin mechero), teletransporte **8:1** con spawn seguro; Won't: trueque, hoglin/zoglin, crimsom/warped completos, cama que explota, techo del Nether, mechero, redstone |
| 25 — End Update (segunda dimensión, sin dragón) | [`fase25-spec.md`](spec/fase25-spec.md) | Prospectiva (sección "Dimensiones" de las notas + entrevista 2026-08-15: **dragón descartado temporalmente**) | 📝 **Prospectiva (sin implementar)** | Prerrequisito: F24 cerrada (reusa la infraestructura de dimensiones). **End básico**: islas flotantes de end stone sobre vacío + isla principal con pilares de obsidiana decorativos (sin dragón ni cristales), **~6 bloques** (end stone, purpur, end rod con luz, chorus **estático**), **enderman** (ya existe, spawn en End) + **endermite** (nuevo), **portal de regreso** al overworld y persistencia `world/<semilla>/end/` + `positions.end`; `SCHEMA_VERSION` 6 intacto; Won't: dragón (descartado), ciudad del End/élitro, shulker con levitación, crecimiento de chorus |

## Reporte comparativo 1:1

| Documento | Contenido |
| --- | --- |
| [`reporte-paridad.md`](reporte-paridad.md) | Comparativa 1:1 contra Minecraft Java por área (mecánicas, audio, menú, mundo/biomas, mobs, servidor, vida/hambre/XP, minería/crafteo, combate), bugs de paridad (B1-B12), lagunas priorizadas (L1-L5), optimizaciones (P1-P5), diseño de la migración POO y plan de validación |
| [`auditoria-2026-08-09.md`](audits/auditoria-2026-08-09.md) | Auditoría técnica integral (errores, seguridad, rendimiento y paridad): hallazgos verificados en el código priorizados por gravedad (críticos → bajos), falsos positivos descartados y estado de corrección |
| [`auditoria-2026-08-10.md`](audits/auditoria-2026-08-10.md) | Auditoría técnica integral (la más reciente, commit `da0b4c0`): línea base (sintaxis 110/110, unit 50/50, E2E y auditorías rojas por el mundo de 128 bloques) + cinco pases en paralelo (cliente CL-1..CL-4, servidor SV-1..SV-6, seguridad SEC-1..SEC-4, rendimiento REN-1..REN-3, paridad PAR-1..PAR-8) con hallazgos priorizados por gravedad y estado de corrección — base de la Fase 16 |

## Documentación técnica

Documentación de arquitectura y mecánicas — **cómo funciona** cada pieza y
**por qué** está hecha así (complementa a las specs por fase, que son el
"qué" de cada fase):

| Documento | Contenido |
| --- | --- |
| [`server/README.md`](server/README.md) | Arquitectura del servidor: principio de autoridad, módulos, bucle 20 Hz, persistencia, mundos por semilla, protocolo WS, verificación |
| [`server/mecanicas.md`](server/mecanicas.md) | Mecánicas del servidor: generación determinista, física/anti-cheat, minería, combate/XP, IA por especie, crafteo/hornos, cofres/loot, comandos/reloj, seguridad |
| [`server/help.md`](server/help.md) | Guía de administración del servidor: requisitos, arranque, env vars (`SEED`, `PORT`, `OPS`...), comandos en el chat, recetas hot-reload, persistencia/backups y solución de problemas |
| [`public/README.md`](public/README.md) | Arquitectura del cliente: sin build step, módulos puros vs impuros, bucle de render, persistencia local, verificación (CDP) |
| [`public/mecanicas.md`](public/mecanicas.md) | Mecánicas del cliente: chunks/culling, pool de geometrías, LOD, luz de antorcha, atlas procedurales, mobs multibloque, predicción, cielo, input, audio, UI, rendimiento |
| [`public/help.md`](public/help.md) | Guía del jugador: requisitos del navegador, pantalla inicial, controles, cómo jugar, solución de problemas y consejos |

## Otros documentos

| Documento | Descripción |
| --- | --- |
| [`Notas del usuario.md`](Notas%20del%20usuario.md) | Auditoría manual del usuario: bugs, nuevas características, debug y "valorar implementar" — base de las fases 9, 10 y 11 |
| [`tests.md`](tests.md) | Suite de tests y cobertura: comandos del runner, matriz módulo→test (54 unitarios + 7 E2E + auditorías), cobertura con c8 y umbrales |

## Cómo usar estas specs

- Cada spec lleva en su cabecera una etiqueta de estado:
  `[COMPLETADA]` (cerrada + auditada), `[EN CURSO]`, `[PROSPECTIVA]` o
  `[ARCHIVADA]`. El estado vivo de todas está en
  [`STATUS.md`](../STATUS.md) y el grafo de prerrequisitos en
  [`DEPENDENCIAS.md`](../DEPENDENCIAS.md).
- **Retrospectivas (fases 1-7):** documentan una fase ya completada y
  auditada — diseño, decisiones y resultado verificado (constantes, módulos,
  tests y métricas de la auditoría). Útiles para entender el "porqué" de la
  arquitectura actual y para no romper invariantes (p. ej. paridad de
  `constants.js` auditable por `unit-sync.js`, formato de guardado con
  `SCHEMA_VERSION`, reglas de culling/LOD).
- **Prospectivas (fases 8-25):** especifican el trabajo pendiente (o lo que
  ya se ejecutó y cerró) y son la fuente de verdad de las decisiones de
  diseño; guían la implementación por bloques, cada bloque con su test
  (convención de `AGENTS.md`). Las fases 12-18 están **cerradas y auditadas**
  (ver `STATUS.md` y el bloque de cierre de cada spec con sus commits). Las
  fases 12-19 están **cerradas y auditadas**; **19.5 (en curso), 19.6, 20,
  21, 21.5, 22, 23, 24 y 25 son prospectivas** — cada una declara su
  prerrequisito (19 exige la 18
  cerrada; 19.5 exige 18 y 19; 19.6 exige 19.5; 20 exige 18; 21 exige 20;
  21.5 exige 21; 22 exige 21.5; 23 exige 22; 24 exige 23; 25 exige 24).
  La 19.5 adelanta a la 19.6 el motor 3D y a la F21 el audio por bioma;
  la F22 aporta los bloques de amatista que la F21 reusa en su geoda; la
  **F21.5** (nueva, insertada entre F21 y F22 sin renumerar la serie)
  absorbe la lista de mejoras del usuario (pesca, bloques 1.8-1.15,
  combate/Trial Chambers, 1.21.5, Pale Garden 1.22, comandos); las
  F24/F25 desbloquean el Won't "dimensiones" (Nether/End) al abrirse.
- El estado real de cada tarea (checkboxes `[ ]`/`[x]`) vive en
  `TODO.md` (tracker, sin detalle narrativo); el detalle de cada fase se
  documenta en su spec de este índice. Al cerrar una fase se marcan sus
  tareas en el tracker y se refleja la columna "Estado" de este índice.
