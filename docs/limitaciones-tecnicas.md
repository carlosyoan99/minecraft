# Limitaciones técnicas del proyecto

> Qué NO puede hacer hoy el clon, **por qué** es así y qué haría falta para
> superarlo (fase que lo aborda si está planificada). Algunas limitaciones
> son **decisiones de diseño** (Won't del proyecto); otras son **deudas
> técnicas** con plan. Las mecánicas detalladas viven en
> [`server/mecanicas.md`](./server/mecanicas.md) y
> [`public/mecanicas.md`](./public/mecanicas.md).

---

## Mundo y generación

| Limitación | Estado actual | Por qué | Cómo se superaría |
|---|---|---|---|
| **Altura del mundo: 128 bloques** (Y −64..+63) | `SCHEMA_VERSION` 6, F15 D5 | Limitación **temporal por rendimiento** (nota del usuario): el mundo v6 es la primera iteración de altura; MC usa −64..+320 | Subir a 256 (Y −64..+191) cuando los tests lo confirmen — **Fase 22 (A1)**: `SCHEMA_VERSION` 7 + migración retrocompatible + minerales y auditorías recalibrados por percentil |
| **Tamaño de mundo acotado** (256/512/1024/8192) | `WORLD_SIZES`; el "infinito" (8192) no se ofrece en el menú | F10 B1: sin tamaño acotado el disco crece sin límite (persistencia por chunk); 8192 es retrocompatible | Mundos realmente infinitos con generación procedural continua y `save` por chunks ya existe — solo falta la opción de menú y el presupuesto de disco |
| **Sin dimensiones** (Nether/End) | Won't del proyecto hasta F24 | Decisión de alcance de las fases 0-23 | **Fase 24** (Nether: persistencia por dimensión, posición por dimensión, portal 8:1) y **Fase 25** (End) |
| **Biomas subterráneos** (lush/dripstone) | No existen | Requieren bloques nuevos (bayas luminosas, dripstone) sincronizados B/I | **F21 A2 (P1)** con sincronización completa |
| **Estructuras activas grandes** (mansión, monumento) | No existen | Coste alto sin presupuesto en F21 | **F21 B2 (P1)** si el presupuesto da; si no, quedan fuera de la fase |

## Jugabilidad (Won't respetado)

| Limitación | Estado actual | Por qué | Cómo se superaría |
|---|---|---|---|
| **Sin redstone** | Won't | Fuera de alcance declarado (AGENTS.md) | Desbloqueo explícito del usuario; coste altísimo (lógica de circuitos en el servidor) |
| **Sin aldeanos ni villas** | Won't | Fuera de alcance declarado | Desbloqueo explícito; IA social + generación de villas |
| **Sin clima** (lluvia/nieve) | Won't | Fuera de alcance declarado | Desbloqueo explícito; estados de clima en el servidor + partículas/sonido en el cliente |
| **Sin encantamientos ni pociones** | No existen | Plan de F21.5 (encantamientos) / no planificado (pociones) | **F21.5 C** para encantamientos (campo retrocompatible en `ItemStack`) |
| **Sin jefes** (dragón, wither) | Won't | Fuera de alcance declarado | Desbloqueo explícito; el dragón está descartado temporalmente (F25 sin él) |
| **Sin autenticación ni cuentas** | Won't | Sin BD externa (AGENTS.md) | Desbloqueo explícito; implicaría BD + sesiones + ban persistente |
| **Sin red multijugador pública** | Solo LAN/local | Sin cuentas ni matchmaking | Requiere lo anterior + servidor público |

## Servidor

| Limitación | Estado actual | Por qué | Cómo se superaría |
|---|---|---|---|
| **Simulación en un solo hilo** a 20 ticks/s (`TICK_MS = 50`) | `mainLoop` en `timers.js` | Sencillez y determinismo; la física/IA/mobs son CPU-ligeros | Particionar el mundo (region threading) solo si el perfil lo exige — deuda consciente, no planificada |
| **Persistencia en JSON** (sin BD) | `world/<semilla>/` + `world.json` | Cero dependencias, mundos copiables con el explorador | Migrar a SQLite solo si el volumen de jugadores lo exige (Won't hoy) |
| **`WS_MAX_PAYLOAD` 1 MiB** | `1 * 1024 * 1024` | Anti-DoS: un mensaje mayor se descarta | Subir el límite con validación por tipo de mensaje si algún día hace falta (hoy nada llega cerca) |
| **Mobs limitados** (tope 30 cercanos) | `mob-spawn.js` | Presupuesto de ticks; la IA por especie es CPU | Afinar por perfil; no planificado |
| **Mundo v6 sin migración de altura** | `SCHEMA_VERSION` 6 | La migración v5→v6 existe; una futura v7 exige otra | Ver "Altura del mundo" (F22) |

## Cliente

| Limitación | Estado actual | Por qué | Cómo se superaría |
|---|---|---|---|
| **Sin build step** (ES modules servidos tal cual) | importmap + `public/vendor/` | Cero configuración; cada archivo se depura en DevTools | Un bundler (Vite) daría tree-shaking y minificación — rechazado por simplicidad (F19.6 D) |
| **Cero assets binarios** (todo procedural) | atlas, iconos, audio, cielo | Sin carpeta `assets/` que mantener; determinismo por PRNG | Texturas 32×32 opcionales (F19.6 E ya tiene el toggle de mipmaps; la resolución es el siguiente paso) |
| **Three.js 0.160 fijado** (importmap) | `public/vendor/three.module.js` | Versión probada; evita sorpresas de CDN | Actualizar versiones en la vendor con sus tests de regresión |
| **Chunks en un solo hilo de render** | geometría en worker, pero el mesh se aplica en el principal | Three.js no es thread-safe para objetos de escena | Greedy 3D y menos reconstrucciones (optimización, no bloqueante) |
| **Luz puntual acotada** (`TORCH_LIGHT_BUDGET` 4, OFF por defecto) | `torchlights.js` | El costo de `PointLight` reales escala mal con muchas antorchas | Luz horneada dinámica por re-horneado local (deuda planificada en `luz-antorcha.md`) |
| **LOD binario** (full/lod) | `lod.js` | Simplicidad y determinismo | 3 tiers de LOD (mejora planificada en `lod-chunks.md`) |

## Rendimiento medido

- **Servidor:** el tick de 20 Hz se mide con `unit-perf-server.js` (snapshot
  1/tick, broadcast solo si cambia, `getBiome` cacheado con tope). El
  guardado es asíncrono por lotes (no congela el bucle).
- **Cliente:** el F3 (`debug.js`) muestra FPS, chunks visibles/totales,
  caras y triángulos; `audit-fase7.js` (CDP) mide el tick en navegador real.
- **Presupuestos conocidos:** greedy meshing + culling de caras (el 90 % del
  ahorro), geometría en worker, mesh por chunk con 1 material, AO por
  vértice, pool de geometrías y LOD con histéresis. Ver la tabla de
  rendimiento en [`public/mecanicas.md`](./public/mecanicas.md).

### Decisiones del backlog 2026-08-15 (P1-P7), medidas en la v20.1

| Ítem | Veredicto | Métrica / decisión |
|---|---|---|
| **P4 — generación determinista** | ✅ implementado | La generación usa un PRNG mulberry32 sembrado por (semilla, cx, cz) y **ya no marca dirty**: explorar no escribe cientos de archivos sin cambios (antes cada chunk generado se re-persistía). `setChunkRng` lo inyecta en tests (`unit-arboles.js`) |
| **P7 — índice espacial de antorchas** | ✅ implementado | `bakeChunkLight`/`hasTorchNear` pasaron de O(torchSet completo) a O(torchSet del vecindario 3×3 de chunks) vía `getTorchesNear` (`chunkstore.js`) — el radio de luz 7 < chunk 16, así que el vecindario cubre todo. Test en `unit-fase19.6.js` §P7 |
| **P2 — gzip del guardado en worker** | ⚪ **evaluado y rechazado con métrica** | `gzipSync` medido: **1.36 ms/chunk** → ~8 ms por lote de 6 (ya repartido con `setImmediate` en la cola asíncrona). Un worker no justifica su complejidad: el coste ya no bloquea el bucle. Veredicto en la auditoría 2026-08-15 §6 y `docs/v20.1.md` |

> Deuda consciente documentada en el mismo backlog: el reenvío de `settings`
> (r=10) genera 441 chunks síncronos (P1) y `saveWorld` síncrono persiste en
> `switchWorld`/SIGINT (P3) — acotados y sin plan de cambio salvo que el
> perfilado en vivo (acciones de la auditoría 2026-08-15 §perfilado) lo pida.

---

## Qué NO es una limitación (aclaraciones)

- **El modo menú sin SEED** no es una limitación: es el arranque por defecto
  (F17 A1); con `SEED=...` arranca directo para E2E.
- **El knockback del TNT** está completo hasta la integración (F20 B3); la
  medición visual en Chrome headless/SwiftShader no es fiable (el hilo se
  congela por el meshing), pero la cadena está probada (ver `docs/v20.2.md`).
- **La música y los sonidos** son procedurales por diseño; la ausencia de
  assets no es una deuda, es la arquitectura elegida.
