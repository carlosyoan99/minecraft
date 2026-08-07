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
| 10 — Notas del usuario y paridad avanzada | [`fase10-spec.md`](fase10-spec.md) | Prospectiva | 🔄 En curso | Bugs de las notas (agua, lava, hitbox, `/tp`, hielo, hostiles por luz), tamaño de mundo, pantalla de muerte, `/kill`, `test.log`, gravedad de bloques, TNT, sprint, visuales y audio |

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
| [`Notas del usuario.md`](Notas%20del%20usuario.md) | Auditoría manual del usuario: bugs, nuevas características, debug y "valorar implementar" — base de las fases 9 y 10 |

## Cómo usar estas specs

- **Retrospectivas (fases 1-7):** documentan una fase ya completada y
  auditada — diseño, decisiones y resultado verificado (constantes, módulos,
  tests y métricas de la auditoría). Útiles para entender el "porqué" de la
  arquitectura actual y para no romper invariantes (p. ej. paridad de
  `constants.js` auditable por `unit-sync.js`, formato de guardado con
  `SCHEMA_VERSION`, reglas de culling/LOD).
- **Prospectivas (fases 9-10):** especifican el trabajo pendiente y son la
  fuente de verdad de las decisiones de diseño; guían la implementación por
  bloques, cada bloque con su test (convención de `AGENTS.md`).
- El estado real de cada tarea (checkboxes `[ ]`/`[x]`) vive en `TODO.md`;
  al cerrar una fase se marca en el roadmap y se refleja en la columna
  "Estado" de este índice.
