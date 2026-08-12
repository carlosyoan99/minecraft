# TODO.md — Tracker de tareas por fase

> **Rol de este documento:** solo el **estado de las tareas** de cada fase
> (hechas `[x]` / pendientes `[ ]`). La **verdad de qué se hizo y cómo**
> (decisiones, mecánicas, auditorías, bugs con causa raíz) vive en las
> **especificaciones** `docs/faseN-spec.md` — este tracker NO crece con
> detalle, solo con tareas nuevas.
>
> Para entender una fase: abre su spec. Para saber qué falta: mira aquí.
>
> Leyenda: `[ ]` pendiente · `[x]` hecho · una fase se marca completa solo
> cuando todas sus tareas están hechas, incluida su auditoría final.

---

## Fase 0 — Base entregada

> (Sin spec propia — ver `docs/README.md`)

- [x] Servidor autoritativo (Express + ws) con validación de
- [x] Generación de mundo por chunks con biomas (llanura, bosque,
- [x] IA de mobs con máquina de estados (zombie, creeper,
- [x] Crafteo por patrón 3x3 desde `recetas.json`
- [x] Horno con combustible y cocción desde `recetas_horno.json`
- [x] Persistencia completa del mundo cada 30s
- [x] Cliente Three.js vanilla con física básica (colisión,

---

## Fase 1 — Cimientos técnicos

> Especificación (la verdad de la fase): [`docs/fase1-spec.md`](docs/fase1-spec.md)

- [x] Guardado incremental por chunk (reemplazar `world.dat` único
- [x] Versionado del formato de guardado (`schemaVersion`) con
- [x] Descarga de chunks lejanos
- [x] Modularizar `client.js` en módulos ES6 por responsabilidad
- [x] Modularizar `server.js` de forma equivalente si ha crecido
- [x] Auditoría de Fase 1:

---

## Fase 2 — Identidad sensorial

> Especificación (la verdad de la fase): [`docs/fase2-spec.md`](docs/fase2-spec.md)

- [x] Atlas de texturas simple (16x16 px por cara, estilo
- [x] Aplicar texturas en `buildChunkGeometry` (UV mapping por
- [x] Sonidos básicos
- [x] Ciclo día/noche visual real
- [x] Auditoría de Fase 2:

---

## Fase 3 — Bucle de supervivencia

> Especificación (la verdad de la fase): [`docs/fase3-spec.md`](docs/fase3-spec.md)

- [x] Barra de hambre
- [x] Drops de comida de animales (vaca, cerdo, pollo, oveja) al
- [x] Recetas de horno para cocinar esa comida
- [x] Comer con clic derecho
- [x] Alimentación y reproducción simple de animales (dar item →
- [x] Auditoría de Fase 3:

---

## Fase 4 — Profundidad de terreno

> Especificación (la verdad de la fase): [`docs/fase4-spec.md`](docs/fase4-spec.md)

- [x] Cuevas: ruido 3D restando de la generación de piedra en
- [x] Bloque de agua
- [x] (Opcional si el rendimiento lo permite tras Fase 1) más
- [x] Auditoría de Fase 4:

---

## Fase 5 — Progresión y combate

> Especificación (la verdad de la fase): [`docs/fase5-spec.md`](docs/fase5-spec.md)

- [x] Durabilidad real de herramientas (que se rompan tras N usos)
- [x] Más variedad de mobs y drops asociados
- [x] (Opcional) experiencia simple / niveles
- [x] Auditoría de Fase 5:

---

## Fase 6 — Mundo jugable y pulido

> Especificación (la verdad de la fase): [`docs/fase6-spec.md`](docs/fase6-spec.md)

- [x] Afinar la minería
- [x] Verificar que las 20 herramientas (pico/hacha/pala/espada ×
- [x] IA hostil más fiel
- [x] Semilla seleccionable al iniciar el mundo
- [x] Pantalla de "cargando mundo" estilo Minecraft mientras se
- [x] Cofre: bloque de almacenamiento con inventario propio. Nuevo
- [x] Antorchas con iluminación dinámica
- [x] Consola de comandos básica
- [x] Visualizador de chunks
- [x] Hot-reload de `recetas.json`/`recetas_horno.json` y del atlas
- [x] Frustum culling
- [x] LOD simple para chunks lejanos (geometría simplificada, sin
- [x] Pool/reutilización de geometrías al cargar/descargar chunks
- [x] Auditoría de Fase 6:
- [x] Cama: dormir salta la noche y fija el punto de reaparición.
- [x] Armadura básica (cuero, hierro, diamante) que reduce daño.
- [x] Minas abandonadas
- [x] Pozos de agua/lava en superficie (generación decorativa).
- [x] Compresión (gzip) del guardado por chunk

---

## Fase 7 — Pulido, UX y estética

> Especificación (la verdad de la fase): [`docs/fase7-spec.md`](docs/fase7-spec.md)

- [x] Nombre de jugador
- [x] Nombres flotantes
- [x] Ajustes del juego
- [x] Selección y creación de mundos
- [x] Mostrar coordenadas
- [x] Texturas procedurales pixel-art para **mobs** (pasivos y
- [x] Iconos de **ítems** en el inventario/HUD (comida, lingotes,
- [x] Estética Minecraft
- [x] Daño por caída
- [x] Morir al caer del mundo
- [x] Respawn según gamemode
- [x] Métrica de tiempo por tick (server + client) para detectar
- [x] Animación de rotura de bloque sincronizada
- [x] Playtest (manual + headless)
- [x] Auditoría de Fase 7:
- [x] Actualizar `README.md` (protocolo WS

---

## Fase 8 — Caza de bugs (corrección de errores)

> Especificación (la verdad de la fase): [`docs/fase8-spec.md`](docs/fase8-spec.md)

- [x] **B10: imposible luchar contra los mobs hostiles (no se puede ni
- [x] B3: imposible minar a mano (el clic no inicia la mina).
- [x] **B2: pierdes vida constantemente sin causa (mueres en pocos
- [x] **B1: controles izquierda/derecha invertidos + opción "Controles
- [x] B4: ciclo día/noche a 20 minutos (como Minecraft).
- [x] B5: la tecla E siempre abre el inventario.
- [x] B7: estrellas visibles de día.
- [x] **B8: el sol y la luna se ven iguales → sol más amarillo + fases
- [x] **B9: los mobs son cajas rectangulares → formas multibloque estilo
- [x] **B6: chunks lejanos con texturas "disminuidas" que no se
- [x] Suite completa de tests (unitarios + E2E + auditorías) y playtest

---

## Fase 9 — Mejoras de paridad, IA, mundo y menú

> Especificación (la verdad de la fase): [`docs/fase9-spec.md`](docs/fase9-spec.md)

- [x] Telemetría en vivo (`window.__mcMiningTrace` / `__mcRaycastStats` /
- [x] Diagnóstico del flujo completo (mousedown → raycast → send →
- [x] Fix + test de regresión con three real (`tests/unit-mining-click.js`
- [x] Documentar la causa raíz en este archivo (sección "Bugs conocidos")
- [x] `worldGamemode` persistido en `world.json` (`server/constants.js`
- [x] `init` incluye `gamemode` del mundo (`net.js`); HUD con badge
- [x] Inventario creativo
- [x] Selector de modo (`#gamemode-select` en el menú de mundos) +
- [x] `world_delete`
- [x] Badge de modo (⛏ Supervivencia / ✦ Creativo) en la lista de mundos
- [x] Hambre/regeneración
- [x] Herramientas correctas + durezas estilo MC
- [x] Recetas más fieles a Minecraft
- [x] XP/niveles con curva no lineal estilo MC
- [x] Creativo: inventario completo (`CREATIVE_ITEMS` vía `creative_pick`)
- [x] Supervivencia
- [x] Esqueleto dispara flechas
- [x] Creeper: fuse fiel — se detiene a ≤3 bloques, "silba" ~1.5s
- [x] Araña: escala muros de 1 bloque y salta al acercarse
- [x] Persecución mejorada para todos los hostiles
- [x] Pacíficos: huyen al ser golpeados (`fleeUntil`/`fleeFrom`),
- [x] Texturas de bloques por cara más fieles + bloques nuevos
- [x] Agua animada
- [x] Más partículas y efectos
- [x] Sonido ambiental más rico
- [x] Minerales por altura estilo MC (`noise2D_ore` con el `y` en la
- [x] Bloques/ítems nuevos
- [x] Iconos de ítems más detallados (`public/itemicons.js`) + tooltip
- [x] Libro de recetas por categorías (tecla B)
- [x] Suite unitaria completa (9 grupos, exit 0) + E2E contra servidor
- [x] `biome check` 0 errores (server + public + tests) y `node --check`
- [x] Documentar Fase 9 cerrada en este archivo (+ "Bugs conocidos")
- [x] Auditoría de Fase 9:

---

## Fase 9.5 — Mejoras de skills, documentación técnica y .gitignore

> Especificación (la verdad de la fase): [`docs/fase9.5-spec.md`](docs/fase9.5-spec.md)

- [x] A — Colisión de flechas con bloques
- [x] B — Clamp de pitch de cámara
- [x] C — Backup `.bak` del guardado
- [x] D — Variación de pitch en audio
- [x] `docs/server/README.md` — arquitectura del servidor (autoridad,
- [x] `docs/server/mecanicas.md` — 9 mecánicas con "cómo funciona + por qué"
- [x] `docs/public/README.md` — arquitectura del cliente (sin build step,
- [x] `docs/public/mecanicas.md` — 12 mecánicas del cliente con "cómo + por
- [x] `docs/README.md` actualizado (índice con la documentación técnica
- [x] `.gitignore` configurado
- [x] Suite unitaria EXIT=0 (con los 2 tests de regresión nuevos) + E2E
- [x] `biome check` 0 errores en lo tocado y `node --check` en todo
- [x] Revisión del code-reviewer aplicada (fix de `let meta;` fusionada en

---

## Fase 10 — Notas del usuario, correcciones pendientes y paridad avanzada

> Especificación (la verdad de la fase): [`docs/fase10-spec.md`](docs/fase10-spec.md)

- [x] Salir del agua
- [x] Lava: daño por quemadura — `server/players.js` (quemado `burning`
- [x] Verificar la altura real del jugador (1.8 bloques, cámara a 1.6)
- [x] `/tp` a un lugar lejano
- [x] Biomas de hielo
- [x] Agua de varios bloques de profundidad + cuevas acuáticas + mejores
- [x] Mobs hostiles también en zonas oscuras (cuevas) de día
- [x] Selector de tamaño de mundo al crear
- [x] Mundo de 128 bloques de altura, terreno a 0 bloques, +64 para
      (resuelto por la Fase 15 D5: −64..+63, `DESIGN_OFFSET` ancla el
      terreno en ~0 — ver `fase15-spec.md` §9)
- [x] Pantalla de muerte que refleje la causa
- [x] Comando `/kill [nombre]` (solo operadores; sin nombre, se aplica a
- [x] `test.log`: `tests/run.js` escribe `tests/test.log` al terminar
- [x] Caída de arena/grava (bloques con gravedad)
- [x] TNT: explosión con cráter, knockback y reacciones en cadena —
- [x] Sprint (correr) con efecto de FOV
- [x] Selector de bloques creativo
- [x] Pick-block (clic medio selecciona el bloque al que se apunta — en
- [x] Agacharse (Shift) con protección de bordes (no caerse)
- [x] Oclusión ambiental por vértice
- [x] Agua mejorada
- [x] Niebla bajo el agua
- [x] Nubes que se desplazan
- [x] Plantas como cross-meshes (hierba/flores con 2 planos cruzados)
- [x] Música ambiental generativa
- [x] Más sonidos por material
- [x] Mobs en caja (vacas, etc.)
- [x] Amanecer persistente
- [x] Demasiados lagos de lava
- [x] Música por bioma/cueva
- [x] Suite unitaria completa en verde (38 grupos, exit 0) + E2E contra
- [x] Auditoría CDP fase 7 en verde (render en navegador
- [x] Confirmar en vivo cada bug de `Notas del usuario.md` marcado como
- [x] Auditoría de Fase 10:

---

## Fase 11 — Bugs de input y cámara, biomas, paridad y cierre de tests

> Especificación (la verdad de la fase): [`docs/fase11-spec.md`](docs/fase11-spec.md)

- [x] Ampliar la telemetría del raycast (`__mcDebugMining`)
- [x] Confirmar la causa raíz entre H1 (raycast no intersecta
- [x] Resaltado del bloque apuntado
- [x] Auditoría CDP del clic con clic REAL
- [x] Diagnosticar el clamp de pitch de `public/scene.js` (`PITCH_LIMIT`,
- [x] Fix: eliminado el clamp redundante de `public/scene.js` (PLC r160 ya
- [x] Test de regresión de cámara
- [x] Taiga
- [x] Pantano
- [x] Jungla
- [x] Océano
- [x] Bloques nuevos sincronizados servidor↔cliente (`constants.js` ambos
- [x] `SCHEMA_VERSION` → 4 con migración retrocompatible (mundos viejos sin
- [x] Generación por bioma en `server/world.js` (`getBiome` ampliado con
- [x] Esquilar ovejas
- [x] Bonemeal (hueso)
- [x] Fuente de agua infinita
- [x] Más sonidos de mobs
- [x] Tests unitarios de mecánicas de Fase 10 sin cubrir, consolidados en
- [x] Auditoría CDP del clic como modo `--audit` de `tests/diag-clic.js`
- [x] Test de cámara del Bloque A2 (`unit-camara.js`) + auditoría CDP del
- [x] Registrar todos los tests nuevos en `tests/run.js` (convención actual)
- [x] Auditoría de Fase 11:

---

## Fase 12 — Mobs por bioma, estructuras, spawn por bioma y persistencia

> Especificación (la verdad de la fase): [`docs/fase12-spec.md`](docs/fase12-spec.md)

- [x] Lobo de taiga + domesticación
- [x] Slime + división
- [x] Ocelote → gato
- [x] Ahogado + tridente
- [x] Modelos 3D y texturas
- [x] Templo de jungla
- [x] Naufragio
- [x] Sin bloques nuevos (solo reuso) → `SCHEMA_VERSION` no sube por
- [x] `BIOME_SPAWN`
- [x] Ítems nuevos sincronizados
- [x] `world.json`
- [x] `unit-fase12.js`
- [x] E2E nuevos de la spec (pospuestos)
- [x] Auditoría de Fase 12:

---

## Fase 13 — Paridad 1.0, rendimiento, POO y tests de paridad

> Especificación (la verdad de la fase): [`docs/fase13-spec.md`](docs/fase13-spec.md)

- [x] Greedy meshing
- [x] Web Workers de chunks
- [x] Auditar pool/culling/LOD
- [x] Perfilado servidor
- [x] Valores incorrectos
- [x] L1 Arco + flechas del jugador
- [x] L2 Puertas
- [x] L3 Escaleras, losas y vallas
- [x] L4 Cubo de líquidos
- [x] L5 Recetas faltantes
- [x] Capa 1
- [x] Capa 2
- [x] Capa 3
- [x] Capa 4
- [x] `tests/unit-paridad.js` (nuevo, en `run.js`)
- [x] Tests de las lagunas
- [x] E2E de mecánicas interactivas
- [x] Auditoría de Fase 13:

---

## Fase 14 — Auditoría y cierre de Fases 12-13

> Especificación (la verdad de la fase): [`docs/fase14-spec.md`](docs/fase14-spec.md)

- [x] C1 spawn por bioma + `SPAWN_TYPES`
- [x] C2 persistencia `SCHEMA_VERSION` 5
- [x] C3 tridente que daña mobs
- [x] C4 hop determinista del slime
- [x] P1 drop de menas
- [x] P2 tier de pico
- [x] P3 conejo asado
- [x] P4 combustible del horno
- [x] P5 `MOB_XP`
- [x] P6 menores
- [x] M1 un solo raycast por `pointermove`
- [x] M2 broadcast de mobs solo si cambia
- [x] M3 rebuild de vecinos al completar bordes
- [x] M4 luz de antorcha stale
- [x] M5/C5 init liviano
- [x] Suite unitaria completa
- [x] E2E 4/4 contra servidor vivo (comer, durabilidad, reload, cofre)
- [x] `audit-fase7` (Chrome headless/CDP) en verde
- [x] `biome check` 0 errores + `node --check` sobre los archivos tocados
- [x] Actualizado

---

## Fase 15 — Corrección de auditoría y mejoras del usuario

> Especificación (la verdad de la fase): [`docs/fase15-spec.md`](docs/fase15-spec.md)

- [x] A1 uuid crítico
- [x] A2 copas de árboles en bordes de chunk
- [x] A3/A4 WIP commitado
- [x] B1 arco
- [x] B2 puertas
- [x] B3 escaleras/losas/vallas
- [x] B4 cubo de líquidos
- [x] B5 recetas
- [x] `ItemStack`, `World`/`Chunk`, `Player`/`createPlayer`, subclases de
- [x] D1 nubes semitransparentes y con variedad
- [x] D2 sprint
- [x] D3 tooltip del hotbar
- [x] D4 esquilar/bonemeal
- [x] D5 alturas −64..+63 (mundo de 128 bloques, `SCHEMA_VERSION` 6,
      auditado por `tests/audit-altura.js` 72/72 — ver `fase15-spec.md` §9)
- [x] Suite unitaria completa en verde
- [x] `node --check` sobre los archivos tocados (`world.js`, `run.js`,
- [x] Verificación manual pendiente de D1/D3 en navegador (F3/inventario)
- [x] Actualizado

---

## Auditoría transversal (2026-08-09): auditorías 3/4/6 y E2E en verde

> Detalle completo (bisect de atribución, fixes `e23e810`/`404b81f` y
> validación) en [`docs/fase13-spec.md`](docs/fase13-spec.md) §9.

- [x] `audit-fase3`, `audit-fase4`, `audit-fase6` → exit=0
- [x] `audit-fase5` y `audit-fase7` (CDP Chrome headless) sin regresión → exit=0
- [x] Suite unitaria completa en verde (incluye `unit-paridad`, `unit-sync`,
      `unit-greedy`, `unit-workers`, `unit-lagunas`)
- [x] Suite E2E contra servidor real (mundo fresco) → 6/6 en 148s

---

## Auditoría integral de seguridad/rendimiento/paridad (2026-08-09)

> Informe completo con ubicaciones y estado de corrección por hallazgo:
> [`docs/auditoria-2026-08-09.md`](docs/auditoria-2026-08-09.md).

- [x] CRÍTICO 1.1 — guard de forma del mensaje WS + try/catch (`net.js`)
- [x] CRÍTICO 1.2 — crafteo solo con la grid server-side (`grid_set`)
- [x] CRÍTICO 1.3 — `world_delete` solo para operadores
- [x] 2.x, 3.x y 4.x — resto de hallazgos (ver el informe)

---

## Fase 16 — Corrección de la auditoría 2026-08-10, bugs del usuario y paridad restante

> Especificación (la verdad de la fase): [`docs/fase16-spec.md`](docs/fase16-spec.md)
> Prospectiva, sin implementar.

- [ ] A1 commitear el WIP del D5 (alturas −64..+63) y dejar HEAD limpio
- [ ] B1 niebla bajo agua solo a ≥2 bloques de profundidad
- [ ] B2 cofres eliminables con Shift (agachado)
- [ ] B3 IA de mobs: reaccionar al ser atacados y atacar al jugador
- [ ] B4 inventario con texturas de ítems + tooltip; fix de la barra de
      durabilidad fantasma (CL-1)
- [ ] B5 libro de recetas: mouse desbloqueado, texturas y cierre
- [ ] B6 opción de calidad gráfica con efecto real
- [ ] C1 guardado asíncrono (REN-1/SV-4) — causa de los timeouts E2E
- [ ] C2 validación de coordenadas en todos los handlers (SV-3/SEC-3)
- [ ] C3 cerrar el bypass del anti-cheat de vuelo/speedhack (SEC-1)
- [ ] C4 `set_seed` con cooldown + sin dirty en generación (SEC-2)
- [ ] C5 limpiar hornos huérfanos (REN-2)
- [ ] C6 menores: SV-2 stacks, SV-5 /give 64, SV-6 /tp clamp, CL-3 parse
      WS, REN-3 settings fragmentado
- [ ] D1 horno consume combustible real + `FUEL_TICKS` por ítem (PAR-1/SV-1)
- [ ] D2 drops de zombi/creeper: carne podrida y pólvora (PAR-2)
- [ ] D3 puertas craftean ×3 (PAR-3)
- [ ] D4 vidrio fundido a 200 ticks (PAR-4)
- [ ] D5 carbón vegetal (PAR-5)
- [ ] D6 XP del slime mediano y del lobo (PAR-7/8)
- [ ] E1 pantalla completa (opción/tecla)
- [ ] E2 `unit-recetas.js` con cobertura total + tests de F16
- [x] G0.1 commitear el WIP de Fase 16 y dejar la suite en verde
- [x] G0.2 definir `AUDIT` en `tests/run.js` (audit-fase3..7 + audit-altura) —
      `--audit` ya no lanza ReferenceError
- [x] G1.1 c8 (devDep) + `npm run test:coverage`
- [x] G1.2 `coverage/` en `.gitignore`
- [x] G1.3 `tests/helpers.js` (check/reporte, mkPlayer, withRandom, loader ESM)
- [x] G1.4 runner `--filter <regex>` + tiempos por test
- [x] G2.1 unit de guardado asíncrono (C1) + migración v5→v6
- [x] G2.2 unit-red: coords inválidas (C2), parse WS try/catch (CL-3),
      anti-cheat v2 (C3)
- [x] G2.3 unit-commands: `/give` 64 (SV-5), `/tp` clamp (SV-6),
      `set_seed` cooldown (C4)
- [x] G2.4 hornos huérfanos (C5) + `FUEL_TICKS` completo (D1)
- [x] G2.5 `ItemStack` coverage (items.js)
- [x] G2.6 TNT: cadenas, cráter con bedrock, knockback (knockback no
      implementado: la explosión solo daña — ver `docs/tests.md`)
- [x] G3 units de cliente puro: daynight + clouds (vía `public/daymath.js`,
      cubierto por `unit-dia.js`)
- [ ] G3b units de cliente puro restantes: network (parse), settings
      (validate/apply), particles, audio (pitch/scheduling) — módulos
      DOM/WebAudio, se revisan con G3.7 (CDP) en vez de refactor
- [ ] G3.7 ampliar `audit-fase7` (CDP): B6, B1, B4, B5
- [ ] G4 E2E: cofre Shift (B2), libro de recetas (B5); E2E 6/6 en solitario
- [x] G5.1 `docs/tests.md` (matriz módulo→test + guía + umbrales)
- [x] G5.2 `README.md` §Tests actualizado
- [x] G5.3 `docs/server/mecanicas.md`: C1, D1, D2, B2, C3, C4, C5, C6
- [x] G5.4 `docs/public/mecanicas.md`: B1, B6, B5
- [x] G5.5 `docs/server/README.md` (persistencia asíncrona) +
      `docs/public/README.md` (mapa `waterfog.js`/`chunkWorker.js`)
- [x] G5.6 `AGENTS.md`/`CLAUDE.md`/`docs/README.md` al día
- [ ] Auditoría de Fase 16 (G6): suite unitaria **en verde (52, verificado
      2026-08-11)**; faltan E2E (bloqueado por la recalibración del modo
      menú F17), auditorías sin regresiones y c8 con umbrales

---

## Fase 17 — Menú inicial tipo Minecraft, UI/UX y móvil

> Especificación (la verdad de la fase): [`docs/fase17-spec.md`](docs/fase17-spec.md)
> Prospectiva, sin implementar. **Prerrequisito:** Fase 16 cerrada (WIP
> commiteado, E2E 6/6, audits fase3-7 + altura en verde, `--audit`
> operativo) — los pendientes transversales son bugs de la Fase 16, no de
> esta.

- [ ] A1 servidor en modo menú (no cargar mundo al arrancar; con `SEED`
      arranca directo al mundo para los E2E)
- [ ] A2 pantalla principal tipo Minecraft (logo + Un jugador / Ajustes /
      Salir)
- [ ] A3 pantalla de mundos con gestión completa: reproducir, eliminar,
      clonar, renombrar y cambiar modo de juego + "nuevo mundo" con config
- [ ] A4 ajustes en pestañas estilo Minecraft (Video / Audio / Controles)
- [ ] A5 no cargar mundo al iniciar — flujo del cliente: menú → `join_world`
      → init (refactor del flujo `set_seed` actual)
- [ ] B1 persistencia del inventario entre sesiones (archivo aditivo por
      jugador; `SCHEMA_VERSION` sin cambios)
- [ ] B2 el cliente se desconecta a los pocos segundos (diagnóstico + fix +
      test de regresión)
- [ ] B3 chunks vacíos en el cliente (física sí, render no) — diagnóstico +
      fix + auditoría CDP
- [ ] B4 romper el bloque bajo una flor/hierba la destruye (con su drop)
- [ ] B5 cuevas: pocas pero largas y grandes (explorables), sin romper la
      distribución de minerales ni los tests deterministas
- [ ] B6 los mobs hostiles no agreden a jugadores en creativo (en survival
      se mantiene)
- [ ] B7 minar con clic presionado re-mina el bloque siguiente (como MC)
- [ ] C1 pantalla de pausa estilo Minecraft (Esc: Continuar / Ajustes /
      Volver al menú principal)
- [ ] C2 estética del menú (interfaz 100% Minecraft; sin adelantar la F19)
- [ ] D1 controles táctiles básicos (joystick + mirar + botones) — HUD
      adaptativo móvil, mouse+teclado intactos
- [ ] Auditoría de Fase 17: suite unit completa + E2E (6/6 + menú) en
      verde, `node --check`/`biome` 0 errores, auditorías sin regresiones,
      verificación manual en navegador (menú, B1-B7, pausa, móvil),
      actualizar `docs/README.md`/`AGENTS.md`

---

## Fuera de alcance (Won't)

- BD externa, autenticación/cuentas, redstone, dimensiones, aldeas
  generadas, clima
- Optimización prematura (greedy meshing, workers...) salvo que una spec lo
  indique
- Encantamientos/pociones, texturas de ítems faltantes y rediseño de
  cofres/mesa de crafteo/horno (Fase 19); pulido general de bugs/paridad y
  refactor a convenciones (Fase 18); rolling release (Fase 20) — el Won't
  se mantiene hasta después de la Fase 20
