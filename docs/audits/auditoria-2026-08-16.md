# Informe de auditoría — Mi Minecraft

**Fecha:** 2026-08-16 · **Commit auditado:** `7b5b83f` (2026-08-15) ·
**Alcance:** errores de implementación, seguridad, rendimiento y estado
real por fase. Auditoría manual (lectura de código + ejecución de la
suite propia), no automatizada con los subagentes de `.opencode/`.
**No se modificó código** — todo lo de abajo es hallazgo, no parche.

> **Nota posterior (mismo día):** esta auditoría auditó `7b5b83f`; en el
> cierre posterior de la **Fase 19.6** (commit `161721c` + session de
> correcciones) se resolvieron los dos hallazgos de aquí — el comentario de
> `server/tnt.js` (§2.1) porque el **TNT ahora tiene knockback real**
> (ver `server/tnt.js`, Fase 20 B3) y el §2.2 se alinea con la redacción
> condicional de `TODO.md` § Won't (Fase 24/25). La fila "19.6 Prospectiva"
> de la tabla §1 queda obsoleta: la fase está **implementada y auditada**
> (spec `docs/spec/fase19.6-spec.md` marcada `[COMPLETADA]`).

## Resumen ejecutivo

El proyecto está en buen estado: 58/58 tests unitarios en verde,
`biome check` 0 errores, 0 vulnerabilidades de dependencias (`npm audit`),
el servidor arranca limpio. Verifiqué de forma independiente (no solo
leyendo `STATUS.md`) que todas las fases 0-19.5 están realmente cerradas
— 0 tareas sin marcar en `TODO.md` hasta ahí. El endurecimiento de
seguridad documentado en auditorías previas (validación de mensajes,
rate-limit, path traversal, autorización de operador) lo confirmé leyendo
el código, no dando por buena la documentación. Encontré **dos hallazgos
reales**, ambos menores y de bajo riesgo — ninguno bloquea nada.

## 1. Estado real por fase (lo que sí y lo que no)

| Fases | Estado verificado | Nota |
|---|---|---|
| 0 – 19.5 | ✅ Cerradas — 0 tareas `[ ]` pendientes en `TODO.md` | Coincide con `STATUS.md` |
| 19.6 (Motor 3D) | ✅ Implementada y auditada (cierre 2026-08-16, commit `161721c`) | Spec `docs/spec/fase19.6-spec.md` marcada `[COMPLETADA]`; unidad, E2E y auditorías en verde |
| 20 (Rolling release) | 🔲 Prospectiva | Backlog de rendimiento/paridad ya bien definido (ver §4) |
| 21 – 21.5 – 22 – 23 | 🔲 Prospectivas | Specs completas, con exclusiones ("Won't de fase") bien documentadas |
| 24 (Nether) – 25 (End) | 🔲 Prospectivas | Ver inconsistencia de documentación en §2 |

No encontré ninguna fase marcada "completada" en `STATUS.md` que en
realidad tenga trabajo pendiente en `TODO.md` — la documentación de
estado es fiel a la implementación real hasta la Fase 19.5.

## 2. Errores encontrados

**2.1 — Comentario desalineado con el código en `server/tnt.js`**
La cabecera del archivo dice: *"TNT (Fase 10, D2): explosivo con cráter,
**knockback** y reacciones en cadena"*. Grep de `knockback` en el
archivo (y en `server/combat.js`) no encuentra ninguna implementación
real — el TNT hace daño y cráter, pero no empuja. Esto ya estaba
correctamente catalogado como pendiente en `docs/spec/fase18-spec.md` y
en el backlog de la Fase 20 (Bloque C), así que no es una funcionalidad
faltante nueva — el hallazgo real es que **el comentario afirma algo que
el código no hace**, lo cual puede confundir a cualquiera (persona o
agente) que lea el archivo sin cruzarlo con la spec. Sugerencia: ajustar
el comentario a "pendiente de knockback, ver Fase 20 Bloque C" mientras
no esté implementado.

**2.2 — Inconsistencia ya señalada, sigue sin corregir**
`TODO.md` § "Fuera de alcance (Won't)" sigue listando `dimensiones
(Nether/End)` sin el matiz condicional que sí tienen las demás
excepciones reconsideradas (Fase 19/20/22 dicen explícitamente "Won't
hasta después de X"). `STATUS.md` ya lista Fase 24 (Nether) y Fase 25
(End) como prospectivas con su propia cadena de prerrequisitos. Sigo sin
ver el ajuste de una línea que ya recomendé en la revisión anterior — lo
repito aquí porque el usuario pidió específicamente actualizar el estado
de documentación por fase.

**Sin otros errores de implementación encontrados** en los módulos
revisados (manejo de mensajes WS, guardado/carga de mundos, comandos,
limpieza de cofres/hornos, chat).

## 3. Seguridad

| Área | Resultado | Verificado cómo |
|---|---|---|
| Dependencias | ✅ 0 vulnerabilidades | `npm audit` |
| Forma de mensajes WS | ✅ guardia de tipo/forma antes de desestructurar | `server/net.js` (guardia post-auditoría 2026-08-09 §1.1, sigue en pie) |
| Rate-limit por conexión | ✅ presente | `server/net.js` §3.1 |
| `maxPayload` del WS | ✅ configurado | `server/timers.js` |
| Path traversal (borrar mundo) | ✅ prevenido — `path.resolve` + `startsWith(root + sep)`, no se puede borrar el mundo activo | `server/save-meta.js: deleteWorld()` |
| XSS en chat | ✅ usa `textContent`, no `innerHTML` | `public/hud.js: addChatLine()` |
| XSS en nombres de mundo (lista de menú) | ✅ usa `escapeHtml()` antes de interpolar en `innerHTML` | `public/menus.js` |
| Longitud de mensaje de chat | ✅ acotada a 200 caracteres server-side | `server/actions.js: handleChat()` |
| Autorización de comandos de operador | ✅ verificada server-side (`p.isOp`), no solo ocultada en el cliente | `server/commands.js`, `server/world-session.js` |

**Hallazgo de diseño aceptado, no bug:** el sistema de operador (variable
de entorno `OPS` + "primer jugador conectado") no autentica identidad —
cualquiera que conecte y escriba un nombre presente en `OPS` obtiene
privilegios de operador, porque no hay cuentas. Esto es coherente con el
alcance ya decidido del proyecto ("sin autenticación", explícito en
`TODO.md` § Fuera de alcance) para un juego LAN/local — lo dejo
documentado explícitamente como limitación conocida y aceptada, no como
hallazgo nuevo a corregir.

## 4. Rendimiento

| Área | Resultado |
|---|---|
| Guardado de chunks | Confirmado: sigue usando `zlib.gzipSync` + `fs.writeFileSync` (síncronos) en `server/world.js`, mitigado por lotes de `SAVE_BATCH_SIZE = 6` chunks por iteración — no resuelto de fondo, pero ya correctamente priorizado en la Fase 20 (Bloque B: gzip en worker, guardado asíncrono) |
| Límite de mobs simultáneos | ✅ acotado a 30 (`server/mob-spawn.js`) — sin riesgo de crecimiento descontrolado |
| Limpieza de cofres/hornos | ✅ se eliminan del `Map` correspondiente al romper el bloque o por TNT (`server/players.js`, `server/tnt.js`, `server/mobs.js`); los hornos además se auto-eliminan si quedan vacíos (`server/crafting.js`) — sin fugas de memoria encontradas ahí |
| `Map`/`Set` que solo crecen | No encontré ninguno en los módulos revisados |

No tengo nada nuevo que añadir al backlog de rendimiento ya definido en
`docs/spec/fase20-spec.md` — lo revisé contra el código actual y sigue
siendo la priorización correcta.

## 5. Recomendaciones finales

1. **Corregir el comentario de `server/tnt.js`** (§2.1) para que no
   afirme una funcionalidad inexistente — coste mínimo, evita confusión.
2. **Ajustar la redacción de "Fuera de alcance" en `TODO.md`** (§2.2)
   para dimensiones, con el mismo matiz condicional que ya tienen otras
   excepciones — coste mínimo.
3. Documentar explícitamente en algún lugar visible (`README.md` o
   `docs/spec/fase20-spec.md`) el hallazgo de diseño aceptado del §3
   (operador sin autenticación de identidad) para que quede como
   decisión consciente y no como algo que una futura auditoría vuelva a
   "descubrir".
4. El resto — backlog de rendimiento (guardado async, worker de gzip),
   backlog de paridad (TNT knockback) — ya está correctamente priorizado
   en la Fase 20. No hace falta reordenar nada.

## 6. Conclusión

No encontré hallazgos críticos ni de seguridad explotables. El proyecto
mantiene lo que las auditorías anteriores ya habían asentado, y lo
verifiqué de forma independiente en vez de darlo por hecho. Los dos
puntos reales de esta pasada son de documentación, no de código
funcional, y ambos ya estaban parcialmente identificados en revisiones
previas — lo único nuevo es la confirmación puntual de dónde exactamente
persisten.
