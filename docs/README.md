# docs/ — Especificaciones por fase

Índice de las especificaciones del proyecto (clon de Minecraft, servidor Node
autoritativo `server/` + cliente Three.js `public/`, todo en español). La
fuente canónica del roadmap con el estado de cada tarea es
[`TODO.md`](../TODO.md); estas specs documentan el **diseño y las decisiones**
de cada fase.

## Fases

| Fase | Spec | Tipo | Estado | Áreas clave |
| --- | --- | --- | --- | --- |
| 0 — Base entregada | — | — | ✅ Completada | Servidor autoritativo, generación por chunks con biomas, IA de mobs, crafteo, horno, persistencia cada 30 s, cliente Three.js con física |
| 1 — Cimientos técnicos | [`fase1-spec.md`](fase1-spec.md) | Retrospectiva | ✅ Completada y auditada | Guardado por chunk, `schemaVersion` + migración, descarga de chunks lejanos, modularización cliente/servidor |
| 2 — Identidad sensorial | [`fase2-spec.md`](fase2-spec.md) | Retrospectiva | ✅ Completada y auditada | Atlas de texturas procedural, UV mapping, sonidos Web Audio, ciclo día/noche visual |
| 3 — Bucle de supervivencia | [`fase3-spec.md`](fase3-spec.md) | Retrospectiva | ✅ Completada y auditada | Hambre/regeneración/inanición, drops de comida, cocina en horno, comer, alimentación y cría |
| 4 — Profundidad de terreno | [`fase4-spec.md`](fase4-spec.md) | Retrospectiva | ✅ Completada y auditada | Cuevas 3D, agua con flotación y lagos, biomas nieve/montaña, bloque `B.SNOW` |
| 5 — Progresión y combate | [`fase5-spec.md`](fase5-spec.md) | Retrospectiva | ✅ Completada y auditada | Durabilidad de herramientas, daño de espada por material, mobs nuevos (araña/lobo/conejo), XP/niveles |
| 6 — Mundo jugable y pulido | [`fase6-spec.md`](fase6-spec.md) | Retrospectiva | ✅ Completada y auditada | Minería por sesión, IA hostil (quema solar), semilla/cofre/antorchas, comandos, F3, hot-reload, culling/LOD/pool, cama, armadura, minas, pozos, gzip |
| 7 — Pulido, UX y estética | [`fase7-spec.md`](fase7-spec.md) | Retrospectiva | ✅ Completada y auditada | Menú (nombre, ajustes, mundos, coordenadas), texturas de mobs e iconos, cielo/partículas, caída/void/respawn, métricas, crack sincronizado |
| 8 — Caza de bugs | [`fase8-spec.md`](fase8-spec.md) | Prospectiva + resultados | ✅ Completada | 10 bugs del playtest (B1-B10): combate, minería a mano, pérdida de vida, controles, día/noche 20 min, tecla E, LOD, estrellas, sol/luna, mobs multibloque |
| 9 — Paridad, IA, mundo y menú | [`fase9-spec.md`](fase9-spec.md) | Prospectiva (fuente de verdad de decisiones) | ✅ Completada | Minería funcional (causa raíz del `mcChunks: 0` corregida), gamemode por mundo, borrado de mundos, paridad de mecánicas (curva XP MC, azadas/cultivos), IA por especie (flechas/fuse/quema), estética, mundo/ítems/libro de recetas |
| 9.5 — Mejoras de skills, docs y `.gitignore` | — (en `TODO.md`) | Retrospectiva | ✅ Completada | Colisión de flechas con bloques (anti-tunneling), clamp de pitch de cámara, backup `.bak` del guardado, variación de pitch en audio, documentación técnica `docs/server/` + `docs/public/`, `.gitignore` completo |
| 10 — Notas del usuario y paridad avanzada | [`fase10-spec.md`](fase10-spec.md) | Prospectiva | ✅ Completada | Bugs de las notas (agua, lava, hitbox, `/tp`, hielo, hostiles por luz), tamaño de mundo, pantalla de muerte, `/kill`, `test.log`, gravedad de bloques, TNT, sprint, visuales y audio |
| 11 — Bugs de input y cámara, biomas, paridad y cierre de tests | [`fase11-spec.md`](fase11-spec.md) | Prospectiva | ✅ Completada | Clic roto (pointer lock sobre el canvas) y cámara que da vueltas, 4 biomas nuevos (taiga, pantano, jungla, océano), esquilar, bonemeal, fuente de agua infinita, sonidos de mobs, cierre con tests (`unit-fase11`, `unit-camara`) |
| 12 — Mobs por bioma, estructuras, spawn por bioma y persistencia | [`fase12-spec.md`](fase12-spec.md) | Prospectiva (entrevista, alcance acordado) | ✅ Completada y auditada | Lobo de taiga domesticable, slime con división y hop determinista, ocelote→gato que espanta creepers, ahogado con tridente; templo de jungla con trampa, naufragio con cofres; spawn por bioma (`BIOME_SPAWN`/`WATER_SPAWN`), persistencia de mascotas (`SCHEMA_VERSION` 5) y `unit-fase12`/`unit-persistencia` (bloques A-D + migración) |
| 13 — Paridad 1.0, rendimiento, POO y tests de paridad | [`fase13-spec.md`](fase13-spec.md) | Prospectiva (reporte de paridad + entrevista) | ✅ Completada y auditada | Paridad de valores fijada por `unit-paridad.js` (vida 20, curva XP oficial, espadas 4/5/6/7, armadura por puntos, durezas/durabilidades); lagunas L1-L5 (arco, puertas, escaleras/losas/vallas, cubo, recetas — `unit-lagunas.js`); **POO completa del servidor** (`ItemStack`, `World`/`Chunk`, `Player`/`createPlayer`, subclases de mobs + `createMob` — `unit-mobs-poo.js`, `unit-poo-entities.js`); greedy meshing + worker de chunks (`unit-greedy`, `unit-workers`). Auditoría de cierre con suite completa en verde |
| 14 — Auditoría y cierre de Fases 12-13 | [`fase14-spec.md`](fase14-spec.md) | Prospectiva (auditoría) | ✅ Completada y auditada | Bloques A (spawn por bioma, persistencia `SCHEMA_VERSION` 5, tridente contra mobs, slime determinista), B (drop de menas con `ORE_DROP`, tier de pico por mineral, comida/combustible, salud/XP de mobs, boom de creeper = `TNT_DAMAGE`) y C (un solo rayo por `pointermove`, broadcast solo si cambia, rebuild de vecinos, luz de antorcha stale, `sendInit` liviano con relleno progresivo) implementados y en verde. Auditoría de cierre: unit 3666 OK, E2E 4/4, `audit-fase7` CDP OK, `biome` 0 errores |
| 15 — Corrección de auditoría y mejoras del usuario | [`fase15-spec.md`](fase15-spec.md) | Prospectiva (auditoría) | ✅ Completada y auditada | Cierre de los pendientes del reporte de paridad: copas de árboles completas en bordes de chunk (A2, `pendingLeaves` + test determinista en `unit-arboles`), nubes semitransparentes con variedad (D1) y tooltip estilizado del hotbar (D3). El resto del plan (A1 uuid, A3/A4 WIP, L1-L5 arco/puertas/escaleras-cubos-recetas y POO) se cerró junto a la Fase 13. Suite de 50 unitarios en verde + registro de `unit-ao`/`unit-muerte` |

## Reporte comparativo 1:1

| Documento | Contenido |
| --- | --- |
| [`reporte-paridad.md`](reporte-paridad.md) | Comparativa 1:1 contra Minecraft Java por área (mecánicas, audio, menú, mundo/biomas, mobs, servidor, vida/hambre/XP, minería/crafteo, combate), bugs de paridad (B1-B12), lagunas priorizadas (L1-L5), optimizaciones (P1-P5), diseño de la migración POO y plan de validación |
| [`auditoria-2026-08-09.md`](auditoria-2026-08-09.md) | Auditoría técnica integral (errores, seguridad, rendimiento y paridad): hallazgos verificados en el código priorizados por gravedad (críticos → bajos), falsos positivos descartados y estado de corrección |

## Documentación técnica

Documentación de arquitectura y mecánicas — **cómo funciona** cada pieza y
**por qué** está hecha así (complementa a las specs por fase, que son el
"qué" de cada fase):

| Documento | Contenido |
| --- | --- |
| [`server/README.md`](server/README.md) | Arquitectura del servidor: principio de autoridad, módulos, bucle 20 Hz, persistencia, mundos por semilla, protocolo WS, verificación |
| [`server/mecanicas.md`](server/mecanicas.md) | Mecánicas del servidor: generación determinista, física/anti-cheat, minería, combate/XP, IA por especie, crafteo/hornos, cofres/loot, comandos/reloj, seguridad |
| [`public/README.md`](public/README.md) | Arquitectura del cliente: sin build step, módulos puros vs impuros, bucle de render, persistencia local, verificación (CDP) |
| [`public/mecanicas.md`](public/mecanicas.md) | Mecánicas del cliente: chunks/culling, pool de geometrías, LOD, luz de antorcha, atlas procedurales, mobs multibloque, predicción, cielo, input, audio, UI, rendimiento |

## Otros documentos

| Documento | Descripción |
| --- | --- |
| [`Notas del usuario.md`](Notas%20del%20usuario.md) | Auditoría manual del usuario: bugs, nuevas características, debug y "valorar implementar" — base de las fases 9, 10 y 11 |

## Cómo usar estas specs

- **Retrospectivas (fases 1-7):** documentan una fase ya completada y
  auditada — diseño, decisiones y resultado verificado (constantes, módulos,
  tests y métricas de la auditoría). Útiles para entender el "porqué" de la
  arquitectura actual y para no romper invariantes (p. ej. paridad de
  `constants.js` auditable por `unit-sync.js`, formato de guardado con
  `SCHEMA_VERSION`, reglas de culling/LOD).
- **Prospectivas (fases 9-14):** especifican el trabajo pendiente y son la
  fuente de verdad de las decisiones de diseño; guían la implementación por
  bloques, cada bloque con su test (convención de `AGENTS.md`). Las fases 12,
  13 y 14 están **cerradas y auditadas**: la 12 con los bloques A-D
  completos, la 13 con la paridad de valores + lagunas L1-L5 + POO completa
  del servidor (`ItemStack`, `World`/`Chunk`, `Player`, `createMob`) y la 14
  con la paridad real + rendimiento del Bloque C. La **15** queda cerrada con
  la corrección de auditoría (copas de árboles, nubes y tooltip) y el
  registro de los tests pendientes, con la suite de 50 unitarios en verde.
- El estado real de cada tarea (checkboxes `[ ]`/`[x]`) vive en `TODO.md`;
  al cerrar una fase se marca en el roadmap y se refleja en la columna
  "Estado" de este índice.
