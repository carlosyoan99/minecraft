# TODO.md — Tracker de tareas por fase

> **Rol de este documento:** solo el **estado de las tareas** de cada fase
> (hechas `[x]` / pendientes `[ ]`). La **verdad de qué se hizo y cómo**
> (decisiones, mecánicas, auditorías, bugs con causa raíz) vive en las
> **especificaciones** `docs/spec/faseN-spec.md` — este tracker NO crece con
> detalle, solo con tareas nuevas.
>
> Para entender una fase: abre su spec. Para saber qué falta: mira aquí.
>
> Leyenda: `[ ]` pendiente · `[x]` hecho · una fase se marca completa solo
> cuando todas sus tareas están hechas, incluida su auditoría final.

---

## Fase 0 — Base entregada

> (Sin spec propia — ver `docs/README.md`)

- [x] Servidor autoritativo (Express + ws) con validación de entrada
- [x] Generación de mundo por chunks con biomas (llanura, bosque, montaña, ...)
- [x] IA de mobs con máquina de estados (zombie, creeper, esqueleto, ...)
- [x] Crafteo por patrón 3x3 desde `recetas.json`
- [x] Horno con combustible y cocción desde `recetas_horno.json`
- [x] Persistencia completa del mundo cada 30 s
- [x] Cliente Three.js vanilla con física básica (colisión, gravedad, cámara)

---

## Fase 1 — Cimientos técnicos

> Especificación (la verdad de la fase): [`docs/spec/fase1-spec.md`](docs/spec/fase1-spec.md)

- [x] Guardado incremental por chunk: reemplazar el `world.dat` único por
      `world/<semilla>/chunks/` (clave `cx,cz` consistente entre `world.js` y
      `save.js`), escribiendo solo los chunks con cambios
- [x] Versionado del formato de guardado: `SCHEMA_VERSION` con migración
      retrocompatible de mundos antiguos (`save.migrateWorldLayout()`)
- [x] Descarga de chunks lejanos: el servidor deja de mantener en memoria
      chunks sin jugadores cerca y el cliente hace `dispose()` fuera de rango
- [x] Modularizar `client.js` en módulos ES6 por responsabilidad (entrada
      mínima que solo importa)
- [x] Modularizar `server.js` en módulos CommonJS por responsabilidad
      (`net.js` exporta `handleConnection` para ejercitar handlers)
- [x] Auditoría de Fase 1: guardar/cargar repetido sin corrupción, memoria del
      servidor con chunks generados y confirmar que no hay imports rotos tras
      la modularización

---

## Fase 2 — Identidad sensorial

> Especificación (la verdad de la fase): [`docs/spec/fase2-spec.md`](docs/spec/fase2-spec.md)

- [x] Atlas de texturas procedural: teselas 16×16 px por cara generadas en un
      canvas (`public/textures.js`), sin assets ni build step, con
      `NearestFilter` (look pixel-art)
- [x] Aplicar texturas en `buildChunkGeometry`: UV mapping por cara eligiendo
      tesela del atlas, sin romper el culling entre chunks
- [x] Sonidos básicos procedurales (Web Audio API): romper/colocar bloque con
      tono por material, pasos con alternancia y ambiente día/noche
- [x] Ciclo día/noche visual real: `dayTime` en el init extrapolado con
      `performance.now()`, interpolando cielo, luz, ambiente y niebla
- [x] Auditoría de Fase 2: rendimiento del atlas y los UVs (FPS con varios
      chunks) y culling intacto (0 caras ocultas, 0 huecos)

---

## Fase 3 — Bucle de supervivencia

> Especificación (la verdad de la fase): [`docs/spec/fase3-spec.md`](docs/spec/fase3-spec.md)

- [x] Barra de hambre: `food` 0-20 con decaimiento por tiempo/movimiento,
      regeneración con `food >= 18`, inanición con `food == 0` y HUD con barra
- [x] Drops de comida de animales: ítems crudos `BEEF/PORKCHOP/CHICKEN/MUTTON`
      (107-110) sincronizados, `mobDrops(type)` y entrega al inventario
- [x] Recetas de horno para cocinar esa comida: ítems cocinados (111-114) y
      4 recetas cruda → cocinada en `recetas_horno.json`
- [x] Comer con clic derecho: `FOOD_VALUES` (hambre + saturación) y evento
      `eat` validado que consume el ítem
- [x] Alimentación y reproducción simple de animales: ítems de cría (115-117),
      modo amor 30 s, bebé que crece en 60 s, con `isBaby`/`age` persistidos
- [x] Auditoría de Fase 3: balance del hambre (ritmo jugable) y rendimiento
      del tick de mobs con reproducción (escala lineal dentro de presupuesto)

---

## Fase 4 — Profundidad de terreno

> Especificación (la verdad de la fase): [`docs/spec/fase4-spec.md`](docs/spec/fase4-spec.md)

- [x] Cuevas 3D: ruido "ridged" (1−|n|) con `CAVE_THRESHOLD`, dos octavas
      deterministas y continuas entre chunks, excavando solo piedra y
      protegiendo bedrock/superficie
- [x] Bloque de agua + lagos: `B.WATER` no sólido, lagos con fondo de arena,
      física de flotación y render translúcido con culling adaptado
- [x] Biomas nieve y montaña: `getBiome` ampliado, montañas con elevación
      real y nuevo bloque `B.SNOW` sincronizado
- [x] Auditoría de Fase 4: cuevas sin huecos en el culling de caras y
      generación en tiempo real sin degradar FPS/rendimiento de chunks

---

## Fase 5 — Progresión y combate

> Especificación (la verdad de la fase): [`docs/spec/fase5-spec.md`](docs/spec/fase5-spec.md)

- [x] Durabilidad real de herramientas: `TOOL_DURABILITY` estilo MC para las
      20 herramientas (200-219) con `applyToolWear()` (−1 por uso)
- [x] Rotura atómica de la herramienta al llegar a 0 (sin duplicar ítems) y
      aviso con `tool_broke`; sin reparación gratis en la mesa de crafteo
- [x] Daño de espada por material (`SWORD_DAMAGE`) y barra de durabilidad en
      el HUD (verde→rojo)
- [x] Más variedad de mobs y drops: araña, lobo y conejo pasivo con escala
      por tipo (`MOB_SCALE`); hilo→lana (receta 2×2) y conejo crudo→asado
- [x] (Opcional, implementado) Experiencia y niveles: `MOB_XP`/`ORE_XP`,
      `level = floor(xp/100)`, +1 salud máxima por nivel y barra de XP + nivel
- [x] Auditoría de Fase 5: sincronización de durabilidad servidor↔cliente
      (`TOOL_DURABILITY` == `DURABILITY`) y **sin duplicar ítems** al romperse
      una herramienta a mitad de acción

---

## Fase 6 — Mundo jugable y pulido

> Especificación (la verdad de la fase): [`docs/spec/fase6-spec.md`](docs/spec/fase6-spec.md)

- [x] Afinar la minería: durezas (`BLOCK_HARDNESS`), velocidad por
      herramienta (`TOOL_TIER_SPEED`), sesión por ticks con grietas y
      cancelación si cambia el bloque o se aleja el jugador
- [x] Drop condicional (`canHarvest`): piedra/minerales solo con pico
      correcta (a mano se rompe lento sin drop ni XP)
- [x] Cadena de obtención completa alcanzable: tronco→planks→palos→pico de
      madera→adoquín→...→hierro/oro/diamante (cubierta en `unit-recetas.js`)
- [x] IA hostil más fiel: quema solar de no-muertos y spawn solo de noche,
      nunca a <24 bloques ni sobre lagos
- [x] Semilla seleccionable al iniciar: `set_seed` → `save.switchWorld(seed)`
      con mundo por directorio `world/<semilla>/`
- [x] Pantalla de "cargando mundo" estilo Minecraft (`public/loading.js`) con
      "Conexión perdida" y Reintentar
- [x] Cofre: `B.CHEST` con 27 slots, crafteable, estado en `chests.js`
      persistido en `world.json` y loot de minas
- [x] Antorchas con iluminación dinámica: `B.TORCH`, reglas de soporte e
      iluminación por bloque (`lighting.js`: BFS 6-direccional con radio 7)
- [x] Consola de comandos básica: `/help`, `/tp`, `/give`, `/time set`,
      `/gamemode`
- [x] Visualizador de chunks (F3): grid, FPS, posición, chunks visibles/
      totales (culling) y caras/triángulos
- [x] Hot-reload de `recetas.json`/`recetas_horno.json` y del atlas con swap
      atómico + `/reload`
- [x] Frustum culling por esfera envolvente y LOD simple para chunks lejanos
      (geometría simplificada con histéresis y swap con throttle)
- [x] Pool/reutilización de geometrías al cargar/descargar chunks
      (`geopool.js` con pool por categoría y `setOrReuseAttribute`)
- [x] Cama: `B.BED` — dormir salta al amanecer y fija el respawn
- [x] Armadura básica (cuero, hierro, diamante; 12 ítems 220-231): reducción
      de daño, 4 slots, desgaste y 12 recetas estilo MC
- [x] Minas abandonadas: túneles deterministas con cofres de loot
- [x] Pozos de agua/lava en superficie con lecho de arena y `B.LAVA` emissive
      con daño
- [x] Compresión (gzip) del guardado por chunk (~20×) con mundos viejos
      compatibles
- [x] Auditoría de Fase 6: FPS/memoria con y sin LOD (reducción de geometría
      y memoria), pool reutilizando geometrías y determinismo del LOD

---

## Fase 7 — Pulido, UX y estética

> Especificación (la verdad de la fase): [`docs/spec/fase7-spec.md`](docs/spec/fase7-spec.md)

- [x] Nombre de jugador: campo persistido en `localStorage`, saneado y
      propagado con `player_join`/`player_rename`
- [x] Nombres flotantes (`THREE.Sprite` de canvas sobre los jugadores)
- [x] Ajustes del juego: distancia de render, FOV, sensibilidad, volúmenes y
      calidad gráfica (persistidos en `mc_settings`; lógica pura en
      `quality.js`)
- [x] Selección y creación de mundos: `save.listWorlds()` + `worlds_list`,
      lista de mundos y "crear nuevo mundo" con semilla escrita o aleatoria
- [x] Mostrar coordenadas (overlay opcional del HUD)
- [x] Texturas procedurales pixel-art para mobs (`mobtextures.js`)
- [x] Iconos de ítems en inventario/HUD (`itemicons.js`: atlas procedural
      16×16 recortado por CSS, testeado en `unit-itemicons.js`)
- [x] Estética Minecraft: cielo con degradado y banda cálida, sol/luna
      opuestos, estrellas nocturnas, niebla por hora, partículas y CSS con
      look Minecraft
- [x] Daño por caída: `floor(bloques) − 3` desde 3 bloques, pasa por armadura,
      el agua lo anula y se ignora en creative
- [x] Morir al caer del mundo (void): `VOID_Y = -8` → respawn
- [x] Respawn según gamemode: en survival se pierde el inventario; en creative
      se conserva; la XP se conserva siempre
- [x] Métrica de tiempo por tick (server + client): `server_metrics` y
      `window.__mcServerTickMs`/`__mcChunkGenMs` en F3
- [x] Animación de rotura de bloque sincronizada: crack por-bloque con
      broadcast por cercanía para jugadores simultáneos
- [x] Playtest (manual + headless) que recolectó los 10 bugs de la Fase 8
- [x] Actualizar `README.md` (protocolo WS y ajustes nuevos)
- [x] Auditoría de Fase 7: métrica de tick, FPS en Chrome headless (CDP) y
      integridad del guardado tras reinicios (`audit-fase7.js`)

---

## Fase 8 — Caza de bugs (corrección de errores)

> Especificación (la verdad de la fase): [`docs/spec/fase8-spec.md`](docs/spec/fase8-spec.md)

- [x] B1: controles izquierda/derecha invertidos → fix + opción "Controles
      invertidos" (`invertControls`)
- [x] B2: pérdida de vida sin causa → telemetría de daño por origen
      (`damage_debug`) que confirmó `source=mob` (hostiles cerca del spawn)
- [x] B3: imposible minar con la mano → fix del clic + drop a mano de
      bloques básicos (regresión en `unit-mineria`/`e2e-durabilidad`)
- [x] B4: ciclo día/noche a 20 minutos (`DAY_CYCLE_MS = 1200000`)
- [x] B5: la tecla E siempre abría el inventario → guarda de foco en campos
      editables (E/WASD/números/F3 no reaccionan fuera del juego)
- [x] B6: chunks lejanos con texturas "disminuidas" sin restaurar → fix de
      bounds obsoletos en el pool (release() nullea bounds)
- [x] B7: estrellas visibles de día → solo de noche estricta con fade
- [x] B8: sol y luna iguales → sol cálido + luna con **fases lunares** (ciclo
      de 8 días, `seedMoonOffsetMs`, `moonTime`)
- [x] B9: mobs como cajas → formas multibloque estilo Minecraft (`MOB_PARTS`)
      y jugadores remotos humanoides
- [x] B10: imposible luchar → raycast de mobs alineado, knockback replicado y
      feedback de daño (flash/partículas)
- [x] Auditoría de Fase 8: suite completa en verde, playtest de los 10 bugs,
      `biome check` 0 errores y documentación al día

---

## Fase 9 — Mejoras de paridad, IA, mundo y menú

> Especificación (la verdad de la fase): [`docs/spec/fase9-spec.md`](docs/spec/fase9-spec.md)

- [x] Telemetría de minería en el cliente (`window.__mcMiningTrace`,
      `__mcRaycastStats`, `__mcDebugMining()`) con test de regresión de three
      real (clic con mob delante)
- [x] Persistencia del gamemode por mundo en `world.json` (`worldGamemode`)
      con `SCHEMA_VERSION` 3 y migración retrocompatible
- [x] `init` con el gamemode del mundo + badge en HUD y F3; inventario
      creativo completo al entrar en un mundo creative
- [x] Selector de modo al crear mundo y `set_seed` con gamemode
- [x] Eliminar mundos desde el menú (`world_delete`, solo operadores, el
      activo se rechaza) con confirmación
- [x] Hambre y regeneración estilo MC (coste extra al correr, regeneración
      solo con comida alta)
- [x] Herramientas correctas + durezas MC (la espada NO mina), recetas más
      fieles y curva de XP no lineal (`xpToNext = 7 + floor(level·3.5)`)
- [x] Creativo: inventario completo (`creative_pick`) y vuelo (`creative_fly`)
- [x] Supervivencia: cultivos (azadas 240-244, farmland, trigo 0-7, cosecha),
      más alimentos con saturación MC y dormir de noche
- [x] IA hostil por especie: esqueleto (flechas), creeper (fuse/siseo), zombi
      (quema solar), araña (escala/salta) — con tests
- [x] Persecución mejorada (desvíos laterales, rango ~32, vuelta a wander) y
      IA pacífica (flee, wander, rebaño, dormir agrupados) — con tests
- [x] Texturas por cara más fieles, agua animada, partículas/efectos y sonido
      ambiental más rico
- [x] Minerales por altura con distribución MC, playas/arena costera, árboles
      variados (abedul, pino) y estructuras (piedras, pilares, hierba alta,
      flores, abejas) — con tests de generación
- [x] Bloques/ítems nuevos de paridad en AMBOS `constants` + recetas
      (escaleras, losas, vallas, puertas, cristal, tintes, pan, pescado,
      hueso, flechas, azadas, miel) — `unit-sync`/`audit-fase5` al día
- [x] Iconos más detallados + tooltip con info (nombre, tipo, durabilidad,
      comida, recetas) y libro de recetas por categorías (tecla B)
- [x] Verificación final: suite unitaria + E2E + auditorías en verde, `biome
      check` 0 errores, `node --check` y "Bugs conocidos" en TODO
- [x] Auditoría de Fase 9: minería con telemetría, gamemode persistido,
      paridad, IA por especie, estética, mundo y libro por categorías en verde

---

## Fase 9.5 — Mejoras de skills, documentación técnica y .gitignore

> Especificación (la verdad de la fase): [`docs/spec/fase9.5-spec.md`](docs/spec/fase9.5-spec.md)

- [x] Colisión de flechas con bloques (anti-tunneling por segmento del tick)
- [x] Clamp de pitch de cámara a ±~84° (evento `change` de PLC)
- [x] Backup `.bak` del guardado (restaura si el principal es ilegible)
- [x] Variación de pitch en audio (`pitchVar()` ±6%)
- [x] Documentación técnica: `docs/server/README.md` + `mecanicas.md` y
      `docs/public/README.md` + `mecanicas.md`
- [x] `docs/README.md` con el índice de la documentación técnica
- [x] `.gitignore` configurado (node_modules, world/, logs, secretos, ...)
- [x] Auditoría de Fase 9.5: suite + E2E + auditoría CDP F7 OK + `biome check`
      0 errores tras el cambio de cámara

---

## Fase 10 — Notas del usuario, correcciones pendientes y paridad avanzada

> Especificación (la verdad de la fase): [`docs/spec/fase10-spec.md`](docs/spec/fase10-spec.md)

- [x] Salir del agua (flotación y salto desde el agua)
- [x] Lava: daño por quemadura con estado `burning` que se extingue
- [x] Altura del jugador de 1.8 bloques (hitbox y cámara a 1.6)
- [x] `/tp` a un lugar lejano (genera/carga chunks y sigue cargando)
- [x] No generar lava en biomas de hielo (con test de generación)
- [x] Agua de varios bloques de profundidad, cuevas acuáticas, lagos/ríos
      (invariante de "charco válido" actualizada)
- [x] Spawn hostil por nivel de luz (cuevas de día) respetando la zona segura
- [x] Selector de tamaño de mundo al crear (debug/infinito internos; pequeño/
      medio/grande) con límites en el servidor
- [x] Pantalla de muerte con causa legible (reusa `damage_debug`)
- [x] `/kill [nombre]` solo para operadores
- [x] `test.log`: `tests/run.js` registra el resultado de la última ejecución
- [x] Bloques con gravedad: arena/grava caen sin soporte (broadcast
      `block_update`)
- [x] TNT: explosión con cráter, knockback y reacciones en cadena (reusa
      `explode()` del creeper)
- [x] Sprint (correr) con doble toque W y efecto de FOV, con hambre acoplada
- [x] Selector de bloques creativo (tecla E) y pick-block (clic medio)
- [x] Agacharse (Shift) con protección de bordes
- [x] Oclusión ambiental por vértice (sombreado de esquinas)
- [x] Agua mejorada, niebla bajo el agua, nubes que se desplazan y plantas
      como cross-meshes
- [x] Música ambiental generativa y más sonidos por material (vidrio, agua,
      TNT)
- [x] Suite unitaria completa (38 grupos) + E2E + auditoría CDP F7 en verde y
      confirmación en vivo de cada bug de `Notas del usuario.md`
- [x] Auditoría de Fase 10: rendimiento con TNT/gravedad/partículas y que
      ningún fix reabre un bug cerrado (B1-B10)

---

## Fase 11 — Bugs de input y cámara, biomas, paridad y cierre de tests

> Especificación (la verdad de la fase): [`docs/spec/fase11-spec.md`](docs/spec/fase11-spec.md)

- [x] Telemetría ampliada de minería con contexto del fallo y diagnóstico
      híbrido (CDP + manual) → causa raíz H1 confirmada (rayo sin cruzar
      bloques por spawn en lago y `dir.y` positivo)
- [x] Fix del clic: `renderer.domElement` como elemento del PLC (los eventos
      de ratón llegan al canvas)
- [x] Fix del clamp de pitch redundante de `public/scene.js` (PLC r160 ya lo
      hace) + `tests/unit-camara.js`
- [x] Resaltado del bloque apuntado con contorno negro (`LineSegments`/
      `EdgesGeometry`)
- [x] Bloques nuevos de 4 biomas en AMBOS `constants` + generación con 9
      biomas y transiciones suaves (taiga, pantano, jungla, océano) +
      `SCHEMA_VERSION` 4 con migración
- [x] Esquilar ovejas (tijeras crafteable con durabilidad, `sheared`) y
      bonemeal (hueso → 3 polvos, madura cultivos/crece árboles)
- [x] Fuente de agua infinita (patrón 2×2 o 1×2 con hueco central)
- [x] Más sonidos de mobs y materiales; tests de mecánicas de F10 sin cubrir
      (TNT, gravedad, sprint, mundo-size, muerte, clouds, AO, música...)
- [x] E2E nuevos: esquilar, bonemeal, agua y TNT
- [x] Auditoría CDP del clic (`audit-fase11.js`: minar/colocar/atacar/abrir
      cofre con 0 excepciones)
- [x] Verificación final: suite + E2E + auditorías 3-10 + `biome check` 0
      errores + verificación manual del clic/cámara en navegador
- [x] Auditoría de Fase 11: causa raíz con evidencia, las 4 acciones del clic
      en navegador real, resaltado visible y sin regresiones

---

## Fase 12 — Mobs por bioma, estructuras, spawn por bioma y persistencia

> Especificación (la verdad de la fase): [`docs/spec/fase12-spec.md`](docs/spec/fase12-spec.md)

- [x] Lobo de taiga: domesticación con `BONE`, aliado que sigue, ataca el
      objetivo del dueño y se sienta/levanta
- [x] Slime de pantano: movimiento a saltos, división completa al morir
      (grande→2 medianos→2 pequeños) y drop de `SLIME_BALL`
- [x] Ocelote de jungla → gato (domesticación con `RAW_FISH`) que espanta
      creepers
- [x] Ahogado de océano/ríos: nada en 3D, ataca cuerpo a cuerpo y arroja
      tridentes
- [x] Tridente del jugador: ítem (245) como drop del ahogado, lanzable y
      recogible
- [x] Modelos y texturas de los 4 mobs (`MOB_PARTS`, variantes por `ownerId`)
- [x] Templo de jungla (torre con cofre de loot y trampa de flechas) y
      naufragio (casco con 1-3 cofres) — deterministas por hash 2D
- [x] Spawn por bioma en `server/mobs.js` (taiga/pantano/jungla/océano) con
      la tabla base intacta
- [x] Ítems nuevos (TRIDENT 245, SLIME_BALL 246) sincronizados con iconos y
      `unit-sync`; `OTHER_DROPS` de slime y ahogado
- [x] Persistencia de mascotas en `world.json` (`pet: {ownerId, sitting}`)
      con `SCHEMA_VERSION` 5 y migración retrocompatible
- [x] `tests/unit-fase12.js` (domesticación, división, espanto, tridente,
      spawn por bioma, estructuras, persistencia v4→v5)
- [x] E2E nuevos: `e2e-mascotas` y `e2e-templo`
- [x] Auditoría de Fase 12: los 4 mobs SOLO en su bioma, comportamientos,
      templo/naufragio deterministas, mascotas persistentes y suite + E2E +
      auditorías 3-11 sin regresiones

---

## Fase 13 — Paridad 1.0, rendimiento, POO y tests de paridad

> Especificación (la verdad de la fase): [`docs/spec/fase13-spec.md`](docs/spec/fase13-spec.md)

- [x] Greedy meshing: fusión de caras coplanares (3-5× menos geometría) sin
      romper culling/AO/crack (`unit-greedy.js` + CDP)
- [x] Web Workers de chunks: `buildChunkGeometry` en worker con datos
      transferibles y fallback síncrono (`unit-workers.js`)
- [x] Auditar pool/culling/LOD: un solo `raycastTerrainAndMobs` por
      `pointermove`, bounds liberados y `computeChunkSphere` cacheado
- [x] Perfilado del servidor: snapshot de mobs cacheado por tick, `getBiome`
      cacheado y `mobs_update` solo si cambia (`unit-perf-server.js`)
- [x] B1 Valores incorrectos: salud 20 fija, curva de XP oficial, daño de
      espadas 4/5/6/7 y mano 1, armadura MC, durezas y durabilidades reales —
      fijados en `unit-paridad.js`
- [x] L1 Arco + flechas del jugador: ítems 247-253, recetas, carga/disparo
      (daño 9), flechas recogibles y desgaste del arco
- [x] L2 Puertas (madera/hierro): 2 celdas, `door_state`, apertura al
      caminar y recetas (6 planks / 6 lingotes)
- [x] L3 Escaleras, losas y vallas: colisión por forma, orientación por cara
      mirada y recetas MC
- [x] L4 Cubo de líquidos: recoger fuente / verter, respetando la fuente
      infinita 2×2
- [x] L5 Recetas faltantes: todo ítem colocable/tool con receta
      (`unit-recetas.js` ampliado)
- [x] B7 Bloque constructivo adicional: losas/vallas; vidrieras y puertas
      trampa documentadas como futuras
- [x] C1-C4 Capas POO 1-4: `class Mob` + subclases por especie
      (`Zombie`/`Creeper`/`Slime`...), `Player`/`World`/`Chunk`/`ItemStack`
      como clases con fachadas compatibles y limpieza de branching muerto
- [x] C5 Reglas duras: un commit por clase, exports como fachadas, sin
      cambios de protocolo ni formato de guardado
- [x] `tests/unit-paridad.js` (fija la tabla oficial de MC; falla si alguien
      desvía un valor) + `unit-lagunas.js` (arco/puertas/escaleras/losas/
      vallas/cubo) + `unit-mobs-poo.js` (red de seguridad POO)
- [x] Auditoría de Fase 13: suite unitaria completa, E2E, auditorías 3-12 sin
      regresiones, `biome check` 0, métricas de rendimiento POO documentadas

---

## Fase 14 — Auditoría y cierre de Fases 12-13

> Especificación (la verdad de la fase): [`docs/spec/fase14-spec.md`](docs/spec/fase14-spec.md)

- [x] A1 Spawn por bioma (`BIOME_SPAWN`/`SPAWN_TYPES` prefiltran el tipo antes
      del intento, con `unit-fase12` ampliado)
- [x] A2 Persistencia + `SCHEMA_VERSION` 5 (`slimeSize`/`ownerId`/`sitting` en
      el meta, con migración v4→v5 y caso nuevo en `unit-persistencia.js`)
- [x] A3 Tridente que daña a los mobs (jugador y ahogado, sin friendly-fire)
- [x] A4 Determinismo del hop del slime (`slimeHopPhase` por mob, tick
      reproducible)
- [x] P1 Drop de menas (gema en vez de bloque; carbón/hierro/oro con drop
      1.17 de fundición implícita)
- [x] B2 Tier de `canHarvest` (`PICKAXE_TIER`: stone+ para hierro/oro, iron+
      para diamante/esmeralda)
- [x] B3 Conejo cocinado (5/6), B4 combustible del horno (`FUEL_ITEMS`),
      B5 `MOB_XP` (skeleton/enderman/spider a 5), B6 menores de mobs — cada
      uno con assert en `unit-paridad.js`
- [x] M1 un solo raycast por `pointermove`; M2 broadcast de mobs solo si
      cambia; M3 vecinos reconstruidos al `chunks_add`; M4 luz de antorcha
      stale re-horneada; M5 `sendInit` liviano (25 chunks + relleno
      progresivo por lotes)
- [x] Suite unitaria completa (3666 OK) + E2E 4/4 + `audit-fase7` CDP en
      verde + `biome check` 0 errores + `node --check`
- [x] Actualizar `docs/README.md`/`docs/server/mecanicas.md` y reflejar Fase
      12 como cerrada en `TODO.md`
- [x] Auditoría de Fase 14: suite completa en verde, E2E 4/4, `audit-fase7`
      CDP (0 excepciones, relleno progresivo) y sin regresiones en A/B/C

---

## Fase 15 — Corrección de auditoría, paridad restante y POO

> Especificación (la verdad de la fase): [`docs/spec/fase15-spec.md`](docs/spec/fase15-spec.md)

- [x] A1 Reparar la regresión `uuid` (línea propia fuera del comentario en
      `server/mobs.js`)
- [x] A2 Copas de árboles completas en bordes de chunk (`pendingLeaves` +
      troncos a ≥2 bloques del borde, con test determinista LCG)
- [x] A3/A4 Commitear el WIP de F13 (perfilado `biomeCache`, arco L1) y dejar
      HEAD limpio
- [x] B1-B5 Lagunas L1-L5 (arco completo con desgaste/recogida, puertas,
      escaleras/losas/vallas, cubo de líquidos, recetas faltantes a cobertura
      total) — con `unit-lagunas.js`/`unit-recetas.js`
- [x] C1-C4 Capas POO (confirmación con `unit-mobs-poo.js`, subclases por
      especie, `Player`/`World`/`Chunk`/`ItemStack`, limpieza y métricas de
      reducción de líneas)
- [x] D1 Nubes semitransparentes y con variedad (material sin iluminación,
      `depthWrite: false`, alturas/velocidades variadas)
- [x] D2 Sprint (+30% con FOV), D3 tooltip del hotbar, D4 esquilar/bonemeal
      (ya existían)
- [x] D5 Alturas −64..+63: mundo de 128 bloques (`SCHEMA_VERSION` 6, chunks
      16×128×16, `DESIGN_OFFSET`, mar en −3) con migración v5→v6 y auditado
      por `tests/audit-altura.js` (72/72)
- [x] Suite unitaria completa en verde (50 unitarios, exit 0) + E2E 4/4 +
      nuevos (arco, puertas, cubo)
- [x] `node --check` y `biome check` 0 errores; auditorías 3-12 sin
      regresiones (`run.js --audit` 5/5) + verificación manual en navegador
- [x] Actualizar `TODO.md`/`docs/README.md`/`AGENTS.md`
- [x] Auditoría de Fase 15: suite en verde, E2E, auditorías (incluido
      `audit-altura` 72/72), verificación manual y métricas POO/rendimiento
      documentadas

---

## Auditoría transversal (2026-08-09): auditorías 3/4/6 y E2E en verde

> Detalle completo (bisect de atribución, fixes `e23e810`/`404b81f` y
> validación) en [`docs/spec/fase13-spec.md`](docs/spec/fase13-spec.md) §9.

- [x] `audit-fase3`, `audit-fase4`, `audit-fase6` → exit=0
- [x] `audit-fase5` y `audit-fase7` (CDP Chrome headless) sin regresión → exit=0
- [x] Suite unitaria completa en verde (incluye `unit-paridad`, `unit-sync`,
      `unit-greedy`, `unit-workers`, `unit-lagunas`)
- [x] Suite E2E contra servidor real (mundo fresco) → 6/6 en 148s

---

## Auditoría integral de seguridad/rendimiento/paridad (2026-08-09)

> Informe completo con ubicaciones y estado de corrección por hallazgo:
> [`docs/audits/auditoria-2026-08-09.md`](docs/audits/auditoria-2026-08-09.md).

- [x] CRÍTICO 1.1 — guard de forma del mensaje WS + try/catch (`net.js`)
- [x] CRÍTICO 1.2 — crafteo solo con la grid server-side (`grid_set`)
- [x] CRÍTICO 1.3 — `world_delete` solo para operadores
- [x] 2.x, 3.x y 4.x — resto de hallazgos (ver el informe)

---

## Fase 16 — Corrección de la auditoría 2026-08-10, bugs del usuario y paridad restante

> Especificación (la verdad de la fase): [`docs/spec/fase16-spec.md`](docs/spec/fase16-spec.md)
> **Cerrada y auditada (2026-08-12)** — unit 54/54, E2E 7/7 en solitario
> (6 clásicos con SEED + menú), auditorías 6/6, c8 con umbrales, `biome` 0
> y verificación en navegador. Ver Bloque G en la spec.

- [x] A1 Commitear el WIP del D5 (alturas −64..+63) y dejar la suite en verde
- [x] B1 niebla bajo agua solo a ≥2 bloques de profundidad (`waterfog.js`)
- [x] B2 cofres eliminables con Shift (agachado): break + drops del contenido
- [x] B3 IA de mobs: aggro al ser golpeados (`aggroUntil`/`MOB_AGGRO_MS`) y
      hostiles que persiguen y atacan al jugador
- [x] B4 inventario con texturas de ítems + tooltip (nombre/durabilidad/
      descripción) y fix CL-1 de la barra de durabilidad fantasma
      (`maxDurability` solo para el arco)
- [x] B5 libro de recetas: mouse desbloqueado al abrir, texturas de ítems y
      cierre con B/Esc
- [x] B6 opción de calidad gráfica con efecto real (`renderScale` por perfil,
      aplicado en caliente)
- [x] C1 guardado asíncrono (cola por lotes con `setImmediate`, autosave
      fuera del event loop)
- [x] C2 validación de coordenadas (`Number.isFinite`) en todos los handlers
- [x] C3 anti-cheat v2: ascenso sin `dy>0` en el aire y límite de velocidad
      horizontal
- [x] C4 `set_seed` con cooldown y sin marcar dirty chunks de generación
- [x] C5 limpiar hornos huérfanos (`furnaces.delete` al romper, notificación
      solo a quien lo tiene abierto)
- [x] C6 menores: SV-2 stacks parciales, SV-5 `/give` tope 64, SV-6 `/tp`
      clamp, CL-3 parse WS try/catch, REN-3 reenvío por lotes
- [x] D1 horno consume combustible real + tabla `FUEL_TICKS` por ítem
      (carbón 1600, palo 100, tablas/tronco 300)
- [x] D2 drops de zombi/creeper: carne podrida y pólvora (ítems nuevos
      sincronizados + receta de TNT)
- [x] D3 puertas craftean ×3 (6 tablas → 3 puertas)
- [x] D4 vidrio fundido a 200 ticks
- [x] D5 carbón vegetal (tronco → carbón)
- [x] D6 XP del slime mediano (1→2) y del lobo (8→1-3)
- [x] E1 pantalla completa (opción en ajustes + Fullscreen API con fallback)
- [x] E2 `unit-recetas.js` con cobertura total (todo ítem de `I` obtenible) +
      tests de F16 (`unit-fase16.js`)
- [x] G0.1 commitear el WIP de Fase 16 y dejar la suite en verde
- [x] G0.2 definir `AUDIT` en `tests/run.js` (`--audit` ya no lanza
      ReferenceError)
- [x] G1.1 c8 (devDep) + `npm run test:coverage`; G1.2 `coverage/` en
      `.gitignore`
- [x] G1.3 `tests/helpers.js` (check/reporte, mkPlayer, withRandom, loader
      ESM); G1.4 runner `--filter <regex>` + tiempos por test
- [x] G2.1 unit de guardado asíncrono (C1) + migración v5→v6
- [x] G2.2 unit-red: coords inválidas (C2), parse WS try/catch (CL-3),
      anti-cheat v2 (C3)
- [x] G2.3 unit-commands: `/give` 64 (SV-5), `/tp` clamp (SV-6), `set_seed`
      cooldown (C4)
- [x] G2.4 hornos huérfanos (C5) + `FUEL_TICKS` completo (D1)
- [x] G2.5 `ItemStack` coverage (items.js) en `unit-poo-entities`
- [x] G2.6 TNT: cadenas, cráter con bedrock (knockback no implementado: la
      explosión solo daña — ver `docs/tests.md`)
- [x] G3 units de cliente puro: `public/daymath.js` extraído y usado por
      daynight/clouds, cubierto por `unit-dia.js`
- [x] G3b units de cliente puro restantes: network (parse), settings,
      particles, audio — módulos DOM/WebAudio, se revisan con G3.7 (CDP);
      `unit-ajustes` cubre settings/quality y los evals CDP cubren network
- [x] G3.7 ampliar `audit-fase7` (CDP): calidad B6, niebla B1, inventario B4,
      libro B5 — 4 checks CDP en verde (evals síncronos + sondeo DOM)
- [x] G4 E2E: cofre Shift (B2), libro de recetas (B5); E2E 6/6 en solitario —
      `e2e-cofre` +16 checks; `e2e-durabilidad` recalibrado al mundo v6
- [x] G5.1 `docs/tests.md` (matriz módulo→test + guía + umbrales)
- [x] G5.2 `README.md` §Tests actualizado
- [x] G5.3 `docs/server/mecanicas.md`: C1, D1, D2, B2, C3, C4, C5, C6
- [x] G5.4 `docs/public/mecanicas.md`: B1, B6, B5
- [x] G5.5 `docs/server/README.md` (persistencia asíncrona) +
      `docs/public/README.md` (mapa `waterfog.js`/`chunkWorker.js`)
- [x] G5.6 `AGENTS.md`/`CLAUDE.md`/`docs/README.md` al día
- [x] Auditoría de Fase 16 (G6): unit 54/54, E2E 7/7 en solitario,
      auditorías 6/6 sin regresión, c8 con umbrales (`server` 90%, `public`
      15%, global 50), `biome` 0 y `node --check` en todo lo tocado

---

## Fase 17 — Menú inicial tipo Minecraft, UI/UX y móvil

> Especificación (la verdad de la fase): [`docs/spec/fase17-spec.md`](docs/spec/fase17-spec.md)
> **Cerrada y auditada (2026-08-12)** — suite unit 54/54, E2E de menú 7/7,
> E2E clásicos 6/6 en solitario, auditorías 6/6 y verificación en navegador
> del flujo completo (menú → mundo → pausa → volver al menú).

- [x] A1 servidor en modo menú (no cargar mundo al arrancar; con `SEED`
      arranca directo al mundo para los E2E)
- [x] A2 pantalla principal tipo Minecraft (logo + Un jugador / Ajustes /
      Salir)
- [x] A3 pantalla de mundos con gestión completa: reproducir, eliminar,
      clonar, renombrar y cambiar modo de juego + "nuevo mundo" con config
- [x] A4 ajustes en pestañas estilo Minecraft (Video / Audio / Controles)
- [x] A5 no cargar mundo al iniciar — flujo del cliente: menú → `join_world`
      → init (refactor del flujo `set_seed` actual)
- [x] B1 persistencia del inventario entre sesiones (archivo aditivo por
      jugador; `SCHEMA_VERSION` sin cambios)
- [x] B2 el cliente se desconecta a los pocos segundos (heartbeat + timeout
      de carga realista; test de regresión en unit-fase17)
- [x] B3 chunks vacíos en el cliente (física sí, render no) — watchdog
      auto-curativo en el bucle de render + try/catch en el worker
- [x] B4 romper el bloque bajo una flor/hierba la destruye (con su drop)
- [x] B5 cuevas: pocas pero largas y grandes (explorables), sin romper la
      distribución de minerales ni los tests deterministas
- [x] B6 los mobs hostiles no agreden a jugadores en creativo (en survival
      se mantiene)
- [x] B7 minar con clic presionado re-mina el bloque siguiente (como MC)
- [x] C1 pantalla de pausa estilo Minecraft (Esc: Continuar / Ajustes /
      Volver al menú principal)
- [x] C2 estética del menú (interfaz 100% Minecraft; sin adelantar la F19)
- [x] C3 skins de jugador: selector en el menú con los 9 skins oficiales
      (Steve/Alex/Noor/Sunny/Ari/Zuri/Makena/Kai/Efe), skins procedurales
      (`public/skins.js` puro + `skintextures.js` atlas), preferencia del
      cliente (`mc_skin`, como el nombre) y protocolo `set_skin`/
      `player_skin` con lista oficial sincronizada (`unit-skins` 17/17)
- [x] D1 controles táctiles básicos (joystick + mirar + botones) — HUD
      adaptativo móvil, mouse+teclado intactos
- [x] Auditoría de Fase 17 (implementación): suite unit 54/54 en verde
      (`unit-fase17` + `unit-skins` + `unit-commands` tolerante), E2E de
      menú 7/7 (servidor propio sin SEED en :3997), `node --check`/`biome`
      0 errores, auditorías sin regresiones (mismo estado que la 2026-08-11),
      `docs/README.md`/`AGENTS.md`/`docs/tests.md`/spec al día.
- [x] Auditoría final de Fase 17: verificación en navegador del flujo
      completo (menú → mundo → pausa → volver al menú) en verde con 0
      errores de consola (Blocker E de la spec cerrado); B1-B7 cubiertos por
      sus tests (unit-fase17, CDP y E2E); táctil D1 verificado por
      `unit-fase17` (HUD se muestra solo en táctil)

---

## Fase 18 — Refactor a convenciones, cierre de fases y pulido

> Especificación (la verdad de la fase): [`docs/spec/fase18-spec.md`](docs/spec/fase18-spec.md)
> **✅ CERRADA Y AUDITADA (2026-08-15)** — paridad C-1..C-9 completa,
> refactor D-1..D-8 (servidor + cliente) con fachadas intactas, E-1/E-2
> cerrados, docs F al día y cierre G: suite **56/56 unitarios**, E2E
> 6/6 + menú 7/7, auditorías 6/6, biome 0 errores, `node --check` limpio.

- [x] A1 Commitear el WIP de la auditoría 2026-08-11 (`db1c366`, `17deb8c`,
      `5303e73`) y dejar la suite en verde (53 ✅, verificado 2026-08-12)
- [x] Bloque C — Paridad completa con MC (commiteada, commits `2726033`..`0e05809`):
      C-1 día/noche por franjas MC (`DAY_PHASES`, `2726033`), C-2 minerales al
      mundo v6 por percentil MC 1.18 (`a9d3295`), C-3 zanahoria/patata
      comestibles (`1c5ea78`), C-4 carbón vegetal como ítem 257 (`6049a77`),
      C-5 `MOB_XP` coherente en `unit-paridad.js` (`4cf8456`), C-6 horno
      (desperdicio/encolado FIFO, `7c6771b`), C-7 recetas de mena muertas
      eliminadas (`dda8814`), C-8 XP al morir recuperable (orbes `0655aca`),
      C-9 sonidos de paridad (`0e05809`)
- [x] Bloque D — Refactor a convenciones CLAUDE.md, **completo (D-1..D-8)**,
      sin cambiar protocolo WS, IDs B/I ni formato de guardado:
      - D-1 servidor: net→anticheat/chunk-fill/world-session (`0d13980`) +
        actions/timers (handlers de juego y bucle/arranque; `net.js` 1088)
      - D-2 servidor: mobs→projectiles/mob-species/mob-spawn (`4c374df`) +
        IA plana por especie en mob-species (mobs.js 795)
      - D-3 servidor: world→noise/biomes/generation/structures (`d0b8db3`,
        world.js 643)
      - D-4 servidor: save→save-chunks/save-meta/save-players (`78c76f9`)
      - D-5 servidor: players→inventory/combat (`204b7b7`)
      - D-6 cliente: ui→hud/menus/panels/recipebook (ui.js 82 orquestador)
      - D-7 cliente: world→chunkstore/lightclient/meshbuild/lodmesh
        (world.js 520, ciclo de vida de mallas)
      - D-8 cliente: input→game-input/raycast/menu-input/touch (input.js 14
        despachador); suites 56/56 tras cada commit
- [x] E-1 Recalibrar `audit-fase3/4/6/7` al mundo v6 y documentarlo
      (`6fa7851`: `--audit` 6/6 con presupuestos medidos y comentados)
- [x] E-2 Biome 0 errores (`bd49412`): `npx biome check .` → 0 errores
      (169 warnings/16 infos tolerados), suite en verde
- [x] Bloque F — Documentación al día (F-1..F-3): mapas de módulos en
      `docs/server/README.md` y `docs/public/README.md`, mecánicas C-1..C-9
      en ambos `mecanicas.md`, matriz de `docs/tests.md`, `README.md`,
      `AGENTS.md`/`CLAUDE.md`, índice `docs/README.md` y decisiones
      diferidas (§8 de la spec)
- [x] Bloque G — Cierre (2026-08-15): suite unitaria **56/56**, E2E
      clásicos 6/6 + menú 7/7 en solitario, auditorías 6/6, biome 0
      errores (188 warnings tolerados), `node --check` limpio, verificación
      manual en navegador (crepúsculos C-1, orbe C-8, sonidos C-9, HUD/
      menú/pausa/táctil sin regresiones, flujo menú → mundo → pausa);
      lagunas del cierre: `e2e-cofre` recalibrado al mundo v6 (estaba en
      v5 y el place no completaba) y `/time set night` al inicio de la
      noche estricta C-1 (`DAY_PHASES.duskEnd`, regresión de spawn hostil
      detectada por `e2e-mascotas`) con guarda en `unit-commands.js`

---

## Fase 19 — Texturas de ítems, interfaces y pulido visual

> Especificación (la verdad de la fase): [`docs/spec/fase19-spec.md`](docs/spec/fase19-spec.md)
> **Cerrada** — verificada 2026-08-15: suite 57/57, auditorías 6/6, E2E 7/7,
> biome 0 errores. Alcance (entrevista 2026-08-12): visual + arrastrar y
> soltar; skins fuera (ya en F17 C3); sin ítems nuevos.

- [x] A1 Cobertura total de iconos: lista canónica de IDs (constantes AMBOS
      lados + `itemIconIds`) vs `switch` de `itemicons.js`; dibujar los que
      falten al estilo 16×16 (sin inventar ítems); el fallback de texto de
      `itemVisual` deja de ser alcanzable
- [x] A2 Test de cobertura por ID en `unit-itemicons.js`: todo ID con tesela
      válida, distinta y determinista; falla si se añade un ítem sin icono
- [x] B1 Rediseño MC del inventario/crafteo (`#crafting-ui`): fondo
      texturizado (tesela del atlas), biseles 3D, slots biselados, sin
      cambiar eventos
- [x] B2 Rediseño MC del horno (`#furnace-ui`): fondo de piedra, slots y
      barra de progreso al estilo nuevo
- [x] B3 Rediseño MC del cofre (`#chest-ui`): fondo de madera, 27 slots +
      inventario, sonidos intactos
- [x] B4 Rediseño MC del libro de recetas (`#recipe-book`): fondo/bisel,
      pestañas, cierre con B/Esc intacto
- [x] C1 Hotbar/tooltip unificados con el estilo nuevo (bisel + delay ~200ms)
      y verificado en los 5 contextos (hotbar, inventario, cofre, horno,
      libro, grid)
- [x] D1 Arrastrar y soltar dentro del inventario y al grid de crafteo
      (fantasma bajo el cursor; evento nuevo `inventory_swap`, retrocompatible
      + test en `unit-red.js`; el click simple no regresa)
- [x] D2 Arrastrar y soltar inventario↔cofre y inventario↔horno (destino
      explícito `chestSlot` en `chest_action`, ampliación retrocompatible;
      validación F16 C2; `grid_return` para devolver al grid)
- [x] E1 Hot-reload del atlas de iconos (patrón `hotReloadTextures`) y
      repintado de slots visibles sin reiniciar
- [x] F1 Paneles táctiles/responsivos: slots ≥~44px, paneles que caben en el
      viewport, drag&drop sin romper el scroll táctil; escritorio intacto
- [x] G1 Cierre y auditoría de Fase 19: suite + E2E 6/6 + menú 7/7, `biome` 0,
      verificación final con fixes (reloj `dawnOffsetMs` recolocado,
      `e2e-cofre` recalibrado a v6), docs y tracker al día; `SCHEMA_VERSION`
      intacto

---

## Fase 19.5 — Skills del proyecto: audio ambiental por bioma, accesibilidad y refinamientos

> Especificación (la verdad de la fase): [`docs/spec/fase19.5-spec.md`](docs/spec/fase19.5-spec.md)
> **Cerrada** — verificada 2026-08-15: suite 58/58, auditorías 6/6, E2E 7/7,
> biome 0 errores. Skills no-motor + **audio por bioma adelantado de la F21**
> + accesibilidad; el **motor 3D sale a la F19.6**.

- [x] A1 Audio ambiental por bioma: `biome_update` ligero del servidor al
      cruzar (opción b, la más barata y precisa — el ruido de biomas no se
      duplica en cliente) + `public/musicpalette.js` (paleta pura por bioma,
      9 biomas); cueva > bioma > día/noche; volumen colchón intacto
- [x] B1 Accesibilidad: navegación por teclado en paneles (`a11y-nav.js`,
      Tab/Shift+Tab + Enter con foco visible en slots)
- [x] B2 Accesibilidad: contraste del HUD — `#info` con contorno oscuro en
      4 direcciones (nieve/desierto y cueva/lava)
- [x] B3 Accesibilidad: indicadores con valor numérico además de la barra
      (verificado: salud/comida/XP; oxígeno no existe en el clon)
- [x] B4 Accesibilidad: opción "reducir movimiento" (`reduceMotion` en
      ajustes → Video; elimina el FOV del sprint; persiste en `mc_settings`)
- [x] C1 Auditoría del raycasting: veredicto **OK sin correcciones** (1
      raycast por `pointermove`, candidatos limitados a meshes visibles)
- [x] D1 Tokens de diseño en `:root` (CSS variables `--mc-*`): biseles,
      fondos de slot, tinta y foco centralizados
- [x] E1 Servidor: `SIGTERM` además de `SIGINT` con guardado limpio
- [x] E2 Servidor: `server/log.js` — niveles `info`/`warn`/`error` con
      prefijo uniforme, sin dependencia; runner intacto
- [x] E3 Servidor: repaso de validación — sin brechas nuevas (F16 C2/C3
      cubierto); documentado en la spec §8.1
- [x] F Matriz de skills con veredicto: `accessibility`/`frontend-design`/
      `nodejs-*` adoptadas, `threejs-interaction` auditada (OK), `seo` y
      `threejs-loaders` rechazadas (documentado), motor 3D → F19.6
- [x] G1 Cierre y auditoría de Fase 19.5: suite 58/58 + E2E 6/6 + menú 7/7 +
      `--audit` 6/6, `biome` 0, `SCHEMA_VERSION` 6 intacto, docs y tracker
      al día

---

## Fase 19.6 — Motor 3D: iluminación, materiales, shaders, instancing, texturas y animación

> Especificación (la verdad de la fase): [`docs/spec/fase19.6-spec.md`](docs/spec/fase19.6-spec.md)
> **[COMPLETADA]** — 2026-08-16.
> Fase independiente de **riesgo técnico** decidida en la entrevista
> 2026-08-15 (el motor 3D afecta al juego; va después de las skills
> visuales). Regla dura: nada que degrade el rendimiento se activa por
> defecto — se queda detrás de un toggle.

- [x] A1 Iluminación: `HemisphereLight` (cielo/suelo) junto al `AmbientLight`
      actual; wired `uDay` a los shaders; costo despreciable
- [x] A2 Luz puntual limitada en antorchas cercanas (presupuesto
      `TORCH_LIGHT_BUDGET` 4, radio 14): toggle de calidad `torchLight`
      (OFF por defecto, `torchlogic.js`/`torchlights.js`)
- [x] B1 `MeshToonMaterial` como **toggle en ajustes, NO predefinido** (por
      defecto sigue `MeshLambertMaterial`); swap en caliente reutilizando
      material/geometría del pool (`materialstyle.js`); sin PBR (documentado)
- [x] C1 Agua animada: `ShaderMaterial` con `uTime`/`uDay` (patrón `sky.js`),
      sin reflejos; costo <1-2% de FPS (uniform output limita)
- [x] C2 Vaivén de viento en vegetación cross-mesh (vertex shader con
      attribute `wind`, una malla por chunk)
- [x] D1 `InstancedMesh`: **evaluado y rechazado** — la vegetación ya se
      fusiona por chunk (1 draw call); decisión documentada en la spec §5
- [x] E1 Mipmapping/anisotropía del atlas como toggle `mipmaps` (OFF por
      defecto; mantiene el look pixel-art 16×16): `setWorldMipmaps` +
      `dispose()` intacto
- [x] F1 Animación de mobs: caminar y ataque básico (balanceo por
      trigonometría + ataque adelantando el brazo); "reducir movimiento"
      (F19.5 B4) lo atenúa (escala 0.4)
- [x] G1 Cierre de Fase 19.6: suite unit 59/59 + E2E 7/7 + `biome` 0
      errores (incluye `public/vendor/` excluido del `files.includes` de
      biome.json — código de terceros); `--audit` 4/6 verdes con fase3/fase7
      por causa ambiental (idéntico en HEAD, ver `auditoria-2026-08-15.md` §6);
      medición/decisión por bloque documentada, CDP de render 0 excepciones,
      `SCHEMA_VERSION` 6 intacto, docs y tracker al día

---

## Auditoría 2026-08-15 — correcciones programadas

> Informe completo con ubicaciones y estado por hallazgo:
> [`docs/audits/auditoria-2026-08-15.md`](docs/audits/auditoria-2026-08-15.md).
> Prioridad según la §5 de la auditoría. **H1/B1 son la acción inmediata**
> (explotable por un cliente sin modificar); el resto se planifica en la
> fase que la auditoría indique (seguridad/resiliencia → ventana actual
> 19.6/20; rendimiento → Fase 20; cliente → mejora continua).

- [x] **H1** `chest_action take`/`put` y `grid_set` (`server/actions.js:342,359,366,313-314,91-92`): validar `Number.isInteger` + rango en `chestSlot`/`invSlot`/`fromInventorySlot` y añadir un test con claves no enteras (truncan arrays y se persisten vacíos)
- [x] **B1** `grid_set` (`server/actions.js:91-93`): `Number.isInteger` + rango en `fromInventorySlot` (inyecta slot basura; con su test)
- [x] **Sec** M1 verificar Origin en WS (`verifyClient`, allowlist localhost/LAN) — `server/timers.js:340`
- [x] **Sec** M2 tope de cría de animales a la cuota global en `applyFeed` — `server/mob-species.js:553`
- [x] **Sec** M3 rechazar nombre duplicado en línea (suplantación de inventario) — `server/net.js:385`
- [x] **Sec** M4 operador por `OPS`/token explícito, no "primer conectado" — `server/net.js:398-399`
- [x] **Sec** M5 documentar TLS en despliegues no-locales (LAN/Localhost OK)
- [x] **Sec** B2 rate-limit por acción (la cuota global 30 msg/s no aísla anti-spam)
- [x] **Sec** B3 log de comandos OP (`/give`, `/tp`, ...) en `executeCommand` — `server/commands.js`
- [x] **Res** F1 reducir `SAVE_INTERVAL_MS` a 10-15 s y/o `savePlayer` en eventos de inventario — `server.js:113-116`
- [x] **Res** F2 reintento (2) en la escritura de la cola async — `server/save-chunks.js:51-54`
- [x] **Res** F3 checksum/validación de chunk en `readChunkFile` — `server/world.js:129-182`
- [x] **Res** F4 rotar `.bak` por jugador — `server/save-players.js:59-72`
- [x] **Res** F5 comprobar el retorno de `saveWorld()` en SIGINT/SIGTERM — `server.js:118-130`
- [x] **Res** F7 `log.warn` del error del socket — `server/net.js:1068`
- [x] **Res** F8 env vars `SAVE_INTERVAL_MS`/`LOG_LEVEL` (+ hook de fallo para tests) + F6 logs con nivel/timestamp
- [x] **Res** REN-2 poda de hornos huérfanos (ver F1+`world.json`) — ya implementada en `crafting.js` (tick)
- [x] **Perf** P1 lotear la generación del `settings` r=10 (441 síncronos) y `move` — `server/net.js` (el handler `settings` y `move` ya no generan; el relleno lo hace `fillForPlayers` en `mainLoop`; test en `unit-red.js`)
- [ ] **Perf** P2 gzip en worker si el perfilado lo pide — `server/save-chunks.js` (medido 2026-08-16: gzipSync p50 6.33 ms/chunk, p95 24.1; lote-6 ≈38 ms → veredicto documentado en auditoría 2026-08-15 §6/§Diferido; mejora priorizada en Fase 20 B4)
- [x] **Perf** P3 reenviar solo la corona nueva de chunks al ampliar radio — `server/net.js:84-100` (corona de anillos nuevos, Chebyshev, fragmentado ≤6/lote; al reducir sigue el reenvío completo; test en `unit-red.js`)
- [ ] **Perf** P4 no marcar dirty los chunks generados sin cambios — `server/generation.js:606` (diferido: rompe `unit-arboles.js` que inyecta `Math.random`; requiere generación determinista, Fase 20)
- [ ] **Perf** P7 evaluar `bakeChunkLight`/`hasTorchNear` O(`torchSet`) con profiler — `public/lighting.js`, `public/chunkstore.js:103-115` (medido 2026-08-16: ~8-13 ms por antorcha cercana con blockAt realista; peor caso todo-aire 24-267 ms → veredicto documentado; no es cuello de botella real, índice espacial en Fase 20 B4)
- [x] **Cli** CL-1 reconexión con backoff + reinit (reset local) — `public/connection.js`
- [x] **Cli** CL-2 pausa de render/audio en background (blur/oculta) — `audio.js` listo; la pausa de RENDER vive en `player.js` (WIP F19.6, no tocar)
- [x] **Cli** CL-4 `Number.isFinite` en `setClientBlock` — `public/chunkstore.js:52-71`
- [x] **Cli** CL-5 validar longitud 16384 en `storeChunkData` — `public/chunkstore.js:76-94`
- [x] **Cli** CL-8 pool + tope duro de partículas — `public/particles.js:66`
- [x] **Anti-cheat (hallazgo del cierre)** falso positivo de `flotando`: el
      dt entre moves inflaba `airTimeMs` tras un hueco >1 s (lag/generación
      de chunks) y rechazaba caídas legítimas — `airDtSec` acotado a 250 ms
      en `server/anticheat.js` (spec F19.6 §10 B3; `unit-caida` estable bajo
      carga, 10/10)
- [ ] **Monitorización** (diferida a F20): logs JSON + `LOG_LEVEL` (F6 — log
      con nivel/timestamp ya) — la **telemetría cliente `__mcClientErrors`
      (CL-6) ya está implementada** (`public/telemetry.js` + handler
      `client_errors` en `net.js` + línea F3; test en `unit-red.js`)

---

## Fase 20 — Rolling release (ciclo de estabilización y paridad)

> Especificación (la verdad de la fase): [`docs/spec/fase20-spec.md`](docs/spec/fase20-spec.md)
> **En curso — v20.1 cerrada, v20.2 iniciada (ciclo rolling activo)** —
> prerrequisito: Fase 18 cerrada (y con ella F16/F17). Ciclo largo con
> iteraciones v20.x; cada iteración con auditoría obligatoria; no se avanza
> hasta que todo esté en verde. Integrado el backlog del borrador
> `fase20-spec.md` (Descargas) en B3/B4. Documento de la iteración:
> [`docs/v20.1.md`](docs/v20.1.md).

- [x] A1 Metodología del ciclo (planificar → implementar → probar → revisar
      → release v20.x → auditoría de la iteración); Won't íntegro; cambios
      de protocolo/guardado retrocompatibles con migración y test
- [x] B1 v20.1: verificado que no quedan restos de F16 ni de F17 — cerrados
      en sus fases (auditoría 2026-08-16 §1: 0 tareas `[ ]` hasta F19.5)
- [x] B2 v20.1: bugs de estabilidad — los candidatos de las notas quedaron
      cerrados en fases previas (flor bajo bloque, aggro en creative, crash
      de semilla, chunks vacíos: todos con su fix ya verificado); único
      pendiente documentado (comentario de TNT + Won't de dimensiones de la
      auditoría del día 16) corregido con la paridad B3 y el wording
- [x] B3 v20.1: paridad restante — **TNT knockback** (empuje radial a
      jugadores con evento `knockback` + ventana de confianza `kbUntil` en
      el anti-cheat, e impulso `mob.kb` integrado en el tick de los mobs;
      test en `unit-fase11.js` 10b), **fundido explícito de mena** (minar
      hierro/oro → `RAW_IRON`/`RAW_GOLD` 258/259 y el horno los funde a
      lingote — paridad MC 1.17; `unit-recetas`/`unit-crafting`/iconos
      actualizados), CSP/SRI **ya cerrado** (Three.js local desde F19.6)
- [x] B4 v20.1: rendimiento — P1 (generación por lotes en chunk-fill, sin
      picos síncronos) y P3 (solo corona nueva al ampliar radio) **ya
      implementados** y verificados; P4 **RNG determinista por chunk**
      (`generation.js`: mulberry32 sembrado por semilla+cx,cz → la
      generación ya no marca dirty; explorar no escribe cientos de archivos;
      `unit-arboles` inyecta el PRNG vía `setChunkRng`); P7 **índice
      espacial de antorchas por chunk** (`getTorchesNear`, vecindario 3×3 —
      `hasTorchNear`/`bakeChunkLight` ya no escanean el torchSet completo);
      P2 **evaluado y rechazado con métrica** (gzipSync 1,36 ms/chunk ≈ 8 ms
      por lote, ya repartido con setImmediate — worker sin beneficio);
      CL-6 telemetría `__mcClientErrors` + `client_errors` ya en el árbol
- [x] B5 v20.1: release `v20.1` — documento de la iteración
      [`docs/v20.1.md`](docs/v20.1.md) (bugs/paridad/métricas/verificación),
      etiqueta `v20.1` y `TODO.md` al día
- [x] C1 Auditoría por iteración obligatoria (suite + E2E + `--audit` 6/6 +
      CDP si toca render + manual + docs); sin regresiones en la matriz
      `docs/tests.md` — **unit 59/59, E2E 7/7, `--audit` 6/6, biome 0,
      `node --check` limpio; verificación manual en navegador pendiente de
      la sesión real del usuario (queda como primer punto de la v20.2)**

### Iteración v20.2 — en curso (definida 2026-08-16, ver spec F20 B7)

> Alcance: los dos bugs de `Notas del usuario.md` que seguían abiertos tras
> la F19.6 (D1 y D2) + el backlog B6 de la auditoría Copilot (SV-5, REN-1
> residual, CI 19 y CI 20) — **todos implementados 2026-08-16** (ver
> abajo) y **cerrada 2026-08-17**: auditoría C1 (unit 60/60, E2E 7/7,
> `--audit` 7/7 con `audit-fase20.js` nuevo, biome 0, `node --check`, npm
> audit 0) + verificación manual en navegador (mena cruda → horno ✅;
> knockback del TNT ✅ hasta la integración — el desplazamiento visual no
> es medible de forma fiable bajo SwiftShader, queda como comprobación
> manual en sesión real; D2 estable), ver [`docs/v20.2.md`](docs/v20.2.md).
> Etiqueta `v20.2` aplicada; Fase 21 abierta (`051e426`).

- [x] D1 Bug «#menu-bg no se oculta al iniciar partida» (Notas del
      usuario): el fondo del menú (cielo con nubes, z-index 1 sobre el
      canvas) nunca se ocultaba — solo `#blocker`; fix `showMenuBg()` en
      `scene.js` (visible SOLO en el menú principal) cableado en `menus.js`
      (showMenu → true, onWorldLoaded → false, onSeedRejected → true; la
      pausa NO lo muestra). Regresión `tests/unit-fase20.js` (patrón
      unit-camara); verificación navegador CDP 3/3 (visible en el menú →
      oculto tras join_world → visible tras leave_world); unit 60/60,
      biome 0, `node --check` limpio. Commit `875f8e1`
- [x] D2 Bug «al terminar de cargar el mundo este desconecta al jugador»
      (Notas del usuario; el B2 de la F19.6 que se había dado por
      ambiental): el rate-limit por conexión medía el tiempo de
      PROCESAMIENTO, no el de llegada. La carga síncrona del mundo en
      `join_world` (switchWorld → loadWorld/saveWorld) bloquea el event
      loop; el cliente (pointer lock activo) acumula moves a 20 Hz en el
      buffer TCP y, al terminar el bloqueo, se procesan en ráfaga en la
      misma ventana de 1 s → `MAX_MSG_RATE` parecía superado y el servidor
      cerraba 1008 «demasiados mensajes»: desconexión → releaseWorld →
      menú → re-logueo. Fix `server/ratelimit.js` (módulo puro): cierre
      solo con 2 ventanas consecutivas sobre el límite (flood sostenido);
      una ráfaga de una ventana tras un bloqueo es legítima. Reproducido
      end-to-end (bloqueo de 3 s simulado: 128 moves cerraban, 188 ya no)
      y recalibrado en `unit-red.js` (ráfaga 1 ventana → no corta; 2
      ventanas → 1008); unit 60/60, E2E menú 7/7, biome 0. Commit
      `18bbc2e`; veredicto corregido en `fase19.6-spec.md` B2

### Auditoría 2026-08-16 (GitHub Copilot) — integración

> Reconciliación completa (hallazgo → estado → plan):
> [`docs/audits/auditoria-2026-08-16-copilot.md`](docs/audits/auditoria-2026-08-16-copilot.md).
> El informe de Copilot (árbol `161721c`) reedita la auditoría 2026-08-15
> ya integrada: los críticos (H1, F16-01, B1) y casi todos los medios
> (M1-M5, B2, B3, REN-2/3/5) **ya estarán corregidos en `161721c`**; quedan
> 2 pendientes reales y 2 sugerencias de proceso (plan en la spec F20 B6,
> candidata a iteración v20.2).

- [x] Verificación (2026-08-16): hallazgos críticos/altos del informe —
      **H1** (cofres, `unit-cofre.js`), **F16-01** (`chunk-fill.js:37,54`),
      **B1** (`grid_set`) — ya corregidos en el árbol auditado, con test
- [x] Verificación: medios **M1** (`timers.js` verifyClient), **M2** (tope
      cría `mob-species.js:545`), **M3** (nombre duplicado `net.js:398`),
      **M4** (OP por lista OPS), **M5** (TLS documentado), **B2**
      (rate-limit por acción), **B3** (log de comandos OP `commands.js:199`)
      — ya corregidos; **REN-2/3/5** y la modularización F18 igual
- [x] **SV-5** tope de stack 64 en `addToInventory` (`server/inventory.js:
      44-49`; `/give` ya clampea 64): respetar `MAX_STACK` al apilar/crear
      (server-side, fuente de verdad) con test en `unit-*`; el cliente
      pinta el contador crudo — economía/paridad MC, prioridad baja.
      Implementado 2026-08-16: `MAX_STACK = 64` compartida (unit-sync),
      apilado por split de slots + rechazo atómico, `/give` con
      `MAX_STACK`; checks en `unit-poo-entities.js`
- [x] **REN-1 residual** `savePlayer` síncrono en el autosave
      (`server.js:115`): mover a la cola asíncrona o confiar en el guardado
      por eventos (mitigación F1 ya en 10-15 s); prioridad baja-media.
      Implementado 2026-08-16: `savePlayersAsync()` (lotes setImmediate,
      idempotente; snapshot+ruta al programar) en `save-players.js`;
      autosave de `server.js` lo usa; `savePlayer` síncrono sigue para
      desconexión/switchWorld/SIGINT/SIGTERM; checks `unit-fase17.js`
- [x] Sugerencia de proceso: subir timeouts de `audit-fase3`/`audit-fase7`
      (causa ambiental SwiftShader/CPU) y documentar el umbral en
      `docs/tests.md`. Implementado 2026-08-16: ventanas CDP ampliadas
      (arranque/ready/timeouts eval) y umbrales de perf ~2×; documentado
- [x] Sugerencia de proceso: `npm audit --audit-level=moderate` como paso
      del flujo de verificación (sin CI en el repo; script o instrucción en
      la metodología del ciclo). Implementado 2026-08-16: script
      `npm run audit` en `package.json` + paso documentado en
      `docs/tests.md` (0 vulnerabilidades)
- [x] C1 Auditoría de la iteración v20.2 (2026-08-17): suite **unit 60/60**
      + **E2E 7/7** + **`--audit` 7/7** (creado `tests/audit-fase20.js`:
      ratelimit 2-ventanas D2, `MAX_STACK` 64 SV-5, `savePlayersAsync`
      REN-1, generación determinista P4, índice de antorchas P7 — 17
      checks; registrado en `tests/run.js` y en la tabla de
      `docs/tests.md`) + **biome 0** + `node --check` + **npm audit 0**
      (CI 20); sin cambios de protocolo/IDs/`SCHEMA_VERSION`; commits
      `6df80ad` (backlog B6), `caab252` (auditoría), `9cce8ca` (biome),
      `70541ec` (cierre docs) + etiqueta `v20.2`; **verificación manual
      en navegador completada** (mena cruda → horno ✅ end-to-end;
      knockback del TNT ✅ hasta la integración — evento con vector
      correcto + `applyKnockback` fija el impulso, sondeado; el
      desplazamiento visual no es medible de forma fiable en CDP/SwiftShader
      (hilo congelado por meshing) y queda como comprobación manual en
      sesión real — ver `docs/v20.2.md`; D2 sin desconexiones por
      rate-limit en sesiones estables; SV-5 cubierto por unit/audit)

---

## Fase 21 — Biomas ampliados, estructuras y más mobs (CERRADA)

> Especificación (la verdad de la fase): [`docs/spec/fase21-spec.md`](docs/spec/fase21-spec.md)
> **Cerrada 2026-08-17 (etiqueta `v21.2`)** — ver bloque de cierre §8 en la
> spec. Suite **61/61**, E2E 7/7, `--audit` **8/8** (`audit-fase21.js`
> nueva con 25 checks), biome 0. Iteraciones: **v21.1** (A1+A2+B1+C1,
> `426efbf` + `5ffe226`), **v21.2** (D1 ríos al nivel del mar, `f9eca90`);
> **D2/D3 de la v21.2 diferidos a la Fase 21.5** (decisión del usuario al
> cierre).
> **Exclusiones de la entrevista 2026-08-15: el selector de skins NO entra
> (ya en F17 C3) y el audio por bioma se adelantó a la F19.5 (A1) — no se
> duplican aquí.**

- [x] P0 Planificación: entrevista del planificador para acotar la primera
      tanda (biomas/estructuras/mobs por valor percibido), criterios de
      aceptación y orden de implementación — resultado en la spec F21 §5
      (P1: §5.2)
- [x] A1 Biomas más grandes en extensión (escala del ruido de `getBiome`)
      con recalibración de `unit-biomas`/`unit-mundo`/`audit-fase4`
      (`BIOME_FREQ` 0.003; `unit-fase21.js` en verde, suite 61/61)
- [x] A2 Biomas de superficie nuevos — **P0: sub-biomas baratos** (bosque
      de abedules, taiga de árboles gigantes 2×2, picos nevados)
      implementados en el árbol (`server/biomes.js` gates
      `SUBBIOME_FREQ`/`PEAK_GATE`, abeto 2×2 en `server/generation.js`);
      resto de superficie (sabana/badlands/oscuro/champiñones) y cuevas de
      lush/dripstone → P1 (bloques nuevos)
- [x] B1 Estructuras pasivas — **P0: pozo del desierto** implementado en
      el árbol (`server/structures.js` `WELL_CELL` 40×40, gate 7 %, solo
      desierto firme); iglú y geoda de amatista → P1 (geoda reusa bloques
      de la F22)
- [x] B2 Estructuras activas — **pirámide del desierto** implementada en el
      árbol (`server/structures.js` `PYRAMID_CELL`/`pyramidAt`/
      `pyramidBlockAt`, trampa TNT posicional `pyramidTrapAt` + 4 cofres de
      loot, `placePyramidColumn` en `generation.js`); cabaña, puesto,
      fortaleza, ruinas/monumento → P1; mansión y monumento fuera de la
      fase si el presupuesto no da (decisión de cierre)
- [x] C1 Mobs pasivos nuevos — **P0: vaca (ordeñable) y gallina (pone
      huevos)** implementadas en el árbol (`I.MILK` 260 y `I.EGG` 261
      sincronizados en ambos `constants.js` y `CREATIVE_ITEMS`, `tickChicken`
      en `server/mob-species.js`, `handleMilkCow` en `server/actions.js` +
      `net.js`, click derecho con cubo en `game-input.js`, iconos en
      `itemicons.js`); pulpo, refinamiento de oveja y huevo lanzable 1/8
      pollito → P1
- [x] C2 Mobs neutrales nuevos — **enderman neutral** implementado
      (`server/mob-species.js` `isPlayerLookingAt` en radianes +
      `isEndermanWatched` + `tickEnderman` con aggro de 20 s al ser mirado y
      teletransporte); zombified piglin y abeja → P1
- [x] C3 Mejoras de IA de mobs existentes — creeper huye de gatos,
      esqueleto strafe lateral (6-12, alterna sentido), araña neutral de
      día (hostil de noche/aggro) y zombi convoca a vecinos ≤16 al ser
      golpeado (todo en `server/mob-species.js`/`mobs.js`, cubierto por
      `audit-fase21.js`)
- [x] D1 Cierre y auditoría de Fase 21: suite + E2E + auditorías en verde,
      `tests/audit-fase21.js` (25 checks end-to-end), `SCHEMA_VERSION` 6
      intacto (no cambió el formato), docs y tracker al día; Won't íntegro
- [ ] D2 (preparación) los bloques/ítems de amatista (`AMETHYST_BLOCK`,
      `AMETHYST_CLUSTER`, `AMETHYST_SHARD`) los aporta la **Fase 22**
      (B1); la geoda de la F21 los reusa y suelta shards — no añadir IDs
      duplicados cuando se implemente

#### Iteración v21.2 — bugs de generación (spec F21 §5.4)

- [x] D1 Ríos al nivel del mar — completado (`f9eca90`): riverBandW
      (ancho variable 2..4), riverDepth 3..6, riverFloorY (lecho ≤
      RIVER_FLOOR_CAP 2 < SEA_LEVEL → siempre ≥2 bloques de agua) y
      riverCarvedHeight (orillas inclinadas sin acantilados); createChunk
      usa riverCarvedHeight/FloorY sobre baseDesign; `audit-altura` y
      `unit-biomas` recalibrados (las columnas de agua no cuentan como
      terreno de montaña); auditado en `audit-fase21.js`
- [x] Cierre v21.2 (D1): suite 61/61 + `--audit` 8/8 en verde, biome 0,
      docs/tracker al día — **D2/D3 diferidos a la Fase 21.5** (ver su
      sección, iteración de generación)

---

## Fase 21.5 — Contenido y paridad ampliados: pesca, bloques 1.8-1.15, combate y Trial Chambers (EN CURSO)

> Especificación (la verdad de la fase): [`docs/spec/fase21.5-spec.md`](docs/spec/fase21.5-spec.md)
> **En curso — abierta 2026-08-17** (Fase 21 cerrada). NUEVA desde la lista
> de mejoras del usuario (2026-08-15): alta/media prioridad + 1.21 Tricky
> Trials + 1.21.5 Spring to Life + 1.22/26.1 + comandos. Se inserta **entre
> F21 y F22** (no renumerar F21-25). **Hereda los diferidos de generación
> D2/D3 de la F21** (océanos profundos/cálidos con coral y montañas altas —
> spec F21.5 §1.4). No planificar lo ya hecho (zanahoria/patata F18 C-3,
> miel F9) ni lo ya planificado (abeja F21 C2, amatista F22 B1, Breeze F23
> A2, Tuff F23 A4).

- [ ] D2 Océanos profundos/cálidos (heredado de F21, spec F21.5 §1.4): más
      profundidad del fondo, océano cálido con corales (B/I + receta +
      icono) y océano profundo; sin subir la probabilidad de océano —
      test determinista
- [ ] D3 Montañas altas y nevadas (heredado de F21, spec F21.5 §1.4):
      elevar la rampa/crest dentro del rango v6 (Y ≤ +63), picos nevados
      sobre cumbres reales, `audit-altura` dentro de presupuesto — test
      determinista recalibrado

- [ ] A1 Pesca (1.7/1.13): ítem `FISHING_ROD` (durabilidad 64) + entidad
      línea = proyectil con bobber (punto 3D); al impactar en agua pica
      tras tiempo aleatorio y entrega ítem de la tabla de loot (pescado/
      tesoro/basura); fuera del agua no pica; durabilidad solo al recoger;
      receta (3 palos + 2 hilo)
- [ ] A8 Pesca en cofres: cañas rotas (durabilidad 1-20) en las tablas de
      loot de cofres (`server/chests.js`)
- [ ] B1 Piedra pulida (1.8): `GRANITE`/`DIORITE`/`ANDESITE` + pulidas en
      vetas subterráneas (hash 2D) — B/I + tesela + receta + icono
- [ ] B2 Linternas (1.14): `LANTERN` en suelo/techo, emisor de luz (pipe de
      la antorcha); receta (4 lingotes + antorcha)
- [ ] B3 Bambú y andamios (1.14): `BAMBOO` (planta alta estática, hasta 12
      bloques), `BAMBOO_PLANKS`, `SCAFFOLDING` (no sólido, escalable hacia
      arriba; sin crecimiento ni colapso)
- [ ] B4 Colmenas y miel (1.15): `BEE_NEST` (árboles) + `BEE_HIVE`
      (crafteado); botella de vidrio + clic derecho → `HONEY_BOTTLE`
      (comida 6/1.2); `HONEY_BLOCK` (reduce caída); abejas del F21 C2
      vuelan alrededor; sin polinización de cultivos
- [ ] B5 Coral y algas (1.13): `CORAL_BLOCK`/`CORAL_FAN`/`KELP`/`SEAGRASS`
      en arrecifes de océano cálido (estático, sin decoloración)
- [ ] C1 Horno de fundición (1.14): `BLAST_FURNACE` funde minerales ×2, UI
      propia, crafteo (5 lingotes + horno)
- [ ] C2 Escudo (1.9): `SHIELD` — clic derecho bloquea y reduce el daño
      (sin off-hand completo), durabilidad, animación en cliente
- [ ] C3 Tótem de inmortalidad (1.11): evita la muerte, cura + absorción, se
      consume; loot de mansión (F21) y Trial Chambers (D1)
- [ ] C4 Camas de colores (1.12): 16 camas con los 16 tintes (dormir/respawn
      igual que la roja), crafteo cama + tinte
- [ ] C5 Concreto (1.12): 16 `CONCRETE` + 16 `CONCRETE_POWDER`; el polvo cae
      con gravedad (física arena/grava) y al tocar agua se convierte en
      concreto sólido (o simplificado sin conversión si es costoso)
- [ ] D1 Trial Chambers (estructura, 1.21): subterránea en deepslate,
      pasillos/salas con cofres de botín + `VAULT` decorativo (sin
      llave/una-vez); determinista por hash 2D; sin Trial Spawner/ominous
- [ ] D2 Bogged (esqueleto de pantano, 1.21): dispara flecha con veneno,
      spawn en pantano; Breeze ya en F23 A2 (coordinación: no duplicar)
- [ ] D3 Maza (1.21): `MACE` + `HEAVY_CORE` (de Trial Chambers); daño
      escala con altura de caída en `attack_mob`; receta maza = core + rod
- [ ] D4 Familia de cobre y tuff (1.21): variantes de cobre (escaleras/
      losas/puertas, sin oxidación) + familia de tuff (pulido/ladrillo)
      sobre el bloque de F22 A5 / Tuff de F23 A4 — sin duplicar IDs
- [ ] D5 Ítems de Trial/Breeze: `WIND_CHARGE` (proyectil que empuja),
      `BREEZE_ROD` (drop), `TRIAL_EXPLORER_MAP` (mapa/brújula hacia la
      estructra); B/I + receta + icono
- [ ] D6 Discos de música, pinturas y partituras (visual/audio, tras F19.5)
- [ ] E1 Variantes de animales por bioma (1.21.5): cerdos/vacas/gallinas con
      `variant` frío/cálido según bioma de spawn, textura distinta
- [ ] E2 Color de lana de oveja según bioma (1.21.5): paleta por bioma,
      esquileo suelta esa lana
- [ ] E3 Bloques decorativos 1.21.5: `FIREFLY_BUSH`, `LEAF_LITTER`,
      `WILDFLOWERS`, `BUSH`, hierba seca corta/alta, `CACTUS_FLOWER`
- [ ] E4 Partículas de hojas cayendo (cliente; "reducir movimiento" las
      atenúa)
- [ ] E5 Sonidos ambientales de desierto/badlands (con el audio por bioma
      de F19.5 A1)
- [ ] F1 Pale Garden (1.22/26.1): bioma con roble pálido y musgo claro
- [ ] F2 Creaking (1.22): mob que solo se mueve cuando el jugador no lo mira
      (detección de visión en servidor), de noche en Pale Garden
- [ ] F3 Creaking Heart (1.22): bloque vinculado al mob — destruirlo lo
      mata; lógica de vínculo mob↔bloque
- [ ] F4 Mochila/Bundle (1.22): ítem que abre un segundo inventario (cofre
      portátil), persistido con el jugador (retrocompatible si es viable)
- [ ] G1 Comandos nuevos + selectores: `/weather`, `/kill` (general),
      `/locate`, `/effect`, `/summon`, `/ban`, `/op`, `/list` y selectores
      `@p @a @e @s @r` (resolución en el handler); `unit-commands.js` al día
- [ ] Z1 Cierre y auditoría de Fase 21.5: suite + E2E + `--audit` +
      `unit-fase21.5.js` en verde + manual (pesca, linterna, andamio, miel,
      arrecife, escudo/maza/tótem, Trial, variantes, Pale Garden, mochila,
      comandos); `SCHEMA_VERSION` 6 intacto salvo mochila/concreto (7 +
      migración + test si sube); docs y tracker al día; Won't documentado

---

## Fase 22 — Profundidad, minerales y fauna 1.17–1.21 (Spec)

> Especificación (la verdad de la fase): [`docs/spec/fase22-spec.md`](docs/spec/fase22-spec.md)
> **Prospectiva (sin implementar)** — prerrequisito: Fase 21.5 cerrada.
> Creada desde el plan del usuario "Actualizaciones Minecraft 1.17 → 1.21"
> (2026-08-15, nueva sección en `Notas del usuario.md`): **minerales en
> bruto (se funden todos), deepslate bajo Y=0, cobre (solo el bloque),
> catalejo con zoom real, Deep Dark (Sculk) en Y < −40 con propagación,
> rana, terreno 1.18 y subida a 256 SOLO si los tests lo confirman**.
> La geoda de amatista se mantiene en la F21 (D2); los biomas
> manglar/cerezo/bambú quedan como candidatos de la F21.

- [ ] A1 Evaluación de factibilidad de altura 256 (Y −64..191): test de
      rendimiento/carga con el mundo actual (greedy+worker+LOD); veredicto
      documentado en la spec — **solo se sube si los tests lo confirman**;
      si sube: `SCHEMA_VERSION` 7 + migración v6→v7 + recalibración de
      minerales/auditorías; si no, se mantiene 128 y se documenta
- [ ] A2 Terreno estilo 1.18 dentro del rango vigente: montañas más altas
      (hasta ~Y=60) y valles profundos, cuevas más grandes y conectadas
      (recalibrar `caveStrength` multioctava), sin romper determinismo
      (`unit-mundo`/`unit-biomas`/`audit-fase4` en verde)
- [ ] A3 `DEEPSLATE` (bloque B nuevo): piedra por debajo de Y=0 sustituida;
      menas siguen con su distribución por profundidad ya calibrada (se
      generan también en el deepslate); B/I sincronizados + icono
- [ ] A4 Minerales en bruto: `RAW_IRON`, `RAW_GOLD`, `RAW_COPPER` (ítems I
      nuevos); minar hierro/oro/cobre suelta el **raw en todos los casos**
      (se quita el lingote directo de `ORE_DROP`); horno funde raw → lingote
      (recetas_horno); reajustar `unit-paridad` (drops) y E2E de minería
- [ ] A5 Cobre (1.17): `COPPER_ORE` (bloque con distribución por altura ~Y
      0..16) + `COPPER_INGOT` (horno) + `COPPER_BLOCK` (crafteo 9 lingotes);
      **solo el bloque por ahora** — sin oxidación, sin cut/escaleras/losas
      (decisión documentada: ampliación futura si es factible)
- [ ] B1 Bloques/ítems de amatista: `AMETHYST_BLOCK`, `AMETHYST_CLUSTER`,
      `AMETHYST_SHARD` (B/I nuevos) — la **estructura geoda se mantiene en
      F21 (D2)**; aquí solo se definen los IDs que la F21 reusará; shard =
      drop del cluster
- [ ] B2 Catalejo (`SPYGLASS`): ítem nuevo + receta (shard + lingote de
      cobre); **funcionamiento real de zoom** (reducir FOV al sostenerlo
      con el botón de usar, `pointer lock` intacto — patrón `SPRINT_FOV` de
      `player.js`); sin HUD extra
- [ ] C1 Deep Dark (1.19) en Y < −40: `SCULK` y `SCULK_VEIN` (bloques B
      nuevos) colocados en las capas profundas; propagación básica: al morir
      un mob sobre sculk, convierte bloques circundantes (tierra/piedra) en
      radio 2 — test determinista; **sin** Warden/shriekers/ciudad
      antigua/crecimiento propio (limitaciones documentadas)
- [ ] D1 Rana (1.19): mob pasivo nuevo (MOB_PARTS + textura + clase con
      `tickSpecies`/`onDeath` + cría con `SLIME_BALL` + spawn por bioma:
      pantano, y manglar cuando la F21 lo añada); salta y come slimes
      pequeños; sin renacuajos por ahora (documentado)
- [ ] E1 Tests específicos de la fase: `unit-fase22.js` cubriendo deepslate
      bajo Y=0, raw ores (drop + horno), cobre (generación/receta/bloque),
      amatista (IDs + shard), catalejo (receta + zoom), sculk (generación +
      propagación), rana (salto/come slime/cría/spawn) y veredicto de altura
      A1
- [ ] F1 Cierre y auditoría de Fase 22: suite completa en verde + E2E + `--audit`
      + unit-fase22 en verde + `node --check` + biome 0 + verificación
      manual (minar deepslate, fundir raw, catalejo zoom, sculk, rana);
      `SCHEMA_VERSION` 6 o 7 según veredicto A1; docs y tracker al día;
      Won't de la fase documentado en la spec

---

## Fase 23 — Diferidos de la F22: Lush Caves, Breeze, trims, Tuff/Caliza (Spec)

> Especificación (la verdad de la fase): [`docs/spec/fase23-spec.md`](docs/spec/fase23-spec.md)
> **Prospectiva (sin implementar)** — prerrequisito: Fase 22 cerrada.
> Creada desde el plan 1.17→1.21 (diferidos) + entrevista 2026-08-15
> (numeración: **F23 = diferidos de la F22**; F24 = Nether; F25 = End).

- [ ] A1 Cuevas frondosas (Lush Caves): `MOSS_BLOCK`, `GLOW_BERRIES`
      (luz), azaleas — variante de cueva profunda por hash 2D
- [ ] A2 Breeze 1.21 simplificado: proyectil de viento que empuja
      (knockback) usando `server/projectiles.js`; sin Trial Chambers
- [ ] A3 Armor Trims: ~10 tintes por crafteo armadura+tinte; sin NBT
      (campo `trim` retrocompatible del `ItemStack` o ítems por color;
      decisión documentada; `unit-persistencia` en verde)
- [ ] A4 Tuff y Caliza: bloques decorativos subterráneos (B/I + tesela)
- [ ] A5 Ajolote (acuático) y cabra (embiste): mobs pasivos con patrón
      F12/21, spawn por bioma
- [ ] B1 Altura 256 (Y −64..191) SOLO si la F22 no subió y los tests lo
      confirman; si sube: `SCHEMA_VERSION` 7 + migración + recalibración;
      si no: veredicto documentado
- [ ] C1 Cierre y auditoría de Fase 23: suite + E2E + `--audit` +
      `unit-fase23` en verde + manual (lush cave, breeze, trim, tuff/caliza,
      ajolote/cabra); `SCHEMA_VERSION` 6 o 7 según B1; docs y tracker al día

---

## Fase 24 — Nether Update (primera dimensión) (Spec)

> Especificación (la verdad de la fase): [`docs/spec/fase24-spec.md`](docs/spec/fase24-spec.md)
> **Prospectiva (sin implementar)** — prerrequisito: Fase 23 cerrada.
> **Desbloquea el Won't "dimensiones"** (se mantiene intacto en TODO/AGENTS
> hasta abrir esta fase). Decisiones 2026-08-15: guardado **opción B**
> (`world/<semilla>/nether/` sin migrar la raíz), **marco de portal que se
> activa al completarse** (sin mechero), Nether de **128 bloques** (reusa
> el formato v6), posición por dimensión **sin subir `SCHEMA_VERSION`**,
> dragón del End **no** (va a F25, descartado).

- [ ] A1 Persistencia por dimensión (opción B): `worldPaths` con
      dimensión, `world/<semilla>/nether/` (`chunks/` + `world.json`
      propios); raíz actual queda como overworld (sin migración)
- [ ] A2 Posición del jugador por dimensión: `dimension` +
      `positions: {overworld, nether}` retrocompatibles en `players/` —
      inventario/salud/XP compartidos; `SCHEMA_VERSION` 6 intacto
- [ ] A3 Protocolo WS: `enter_dimension` (C→S) + `dimension_change`
      (S→C) reusando el `init` existente
- [ ] B1 Generación del Nether (128 bloques, offset re-anclado Y 0..127):
      piso/techo bedrock, netherrack, cuevas masivas, lagos de lava
- [ ] B2 Biomas (2): Nether Wastes y Soul Sand Valley (paleta propia,
      determinista)
- [ ] C1 Bloques (~15): netherrack, soul sand/soil, glowstone (luz),
      nether bricks, magma block (daña), basalto, blackstone, nylium
      (crimson/warped), hongos/raíces, shroomlight (luz) — estáticos;
      B/I + tesela + receta/icono
- [ ] D1 Mobs (4): zombified piglin (neutral/dominó), ghast (bolas de
      fuego), blaze (ráfagas), magma cube (división) — IA por especie;
      spawn por bioma del nether
- [ ] D2 Fortaleza del Nether: pasillos de nether bricks, 1-2 spawners de
      blaze, cofres de loot; sin trampas de redstone
- [ ] E1 Portal: `OBSIDIAN` (pico de diamante) + marco 4×5 que se activa
      al completarse → interior `PORTAL` no sólido; romper marco lo apaga
- [ ] E2 Teletransporte 8:1 (X/Z) con spawn en tierra firme (sin caer en
      lava); volver restaura la posición original (A2)
- [ ] F1 Tests específicos: `unit-fase24.js` (generación, biomas,
      bloques, mobs, fortaleza, portal/marco, 8:1 + spawn seguro) + E2E
      de dimensiones con servidor propio
- [ ] G1 Cierre y auditoría de Fase 24: suite + E2E + `--audit` +
      `unit-fase24` en verde + manual (marco→nether→volver); `SCHEMA_VERSION`
      6 intacto; docs y tracker al día; Won't de la fase documentado

---

## Fase 25 — End Update (segunda dimensión, sin dragón) (Spec)

> Especificación (la verdad de la fase): [`docs/spec/fase25-spec.md`](docs/spec/fase25-spec.md)
> **Prospectiva (sin implementar)** — prerrequisito: Fase 24 cerrada
> (reusa la infraestructura de dimensiones). **El dragón del End queda
> descartado temporalmente** (cristales/ciudad/élitro/levitación →
> inspiración Futuro, documentado).

- [ ] A1 Generación del End: islas flotantes de end stone sobre vacío
      (ruido 2D) + isla principal con pilares de obsidiana decorativos
      (sin dragón ni cristales); determinista
- [ ] A2 Bloques (~6): end stone, end stone bricks, purpur (bloque/pilar),
      end rod (luz), chorus plant/flower **estáticos** (sin crecimiento);
      B/I + tesela + receta/icono
- [ ] A3 Mobs: enderman (ya existe, spawn en End) + endermite (hostil
      pequeño, spawn por ender pearl o natural, desaparece tras 2 min)
- [ ] A4 Portal de regreso al overworld (posición restaurada en
      `positions.overworld`) + persistencia `world/<semilla>/end/` +
      `positions.end`; `SCHEMA_VERSION` 6 intacto
- [ ] B1 Cierre y auditoría de Fase 25: suite + E2E + `--audit` +
      `unit-fase25` en verde + manual (explorar end, end stone/chorus,
      endermite, volver por el portal); `SCHEMA_VERSION` 6 intacto; docs
      y tracker al día; Won't (dragón descartado) documentado

---

## Fuera de alcance (Won't)

- BD externa, autenticación/cuentas, redstone, aldeas generadas, clima;
  dimensiones (Nether/End) — Won't hasta después de la Fase 20/21 (Fase 24
  Nether y Fase 25 End las desbloquean con su propia cadena de
  prerrequisitos, ver STATUS.md)
- Optimización prematura (greedy meshing, workers...) salvo que una spec lo
  indique
- Encantamientos/pociones, texturas de ítems faltantes y rediseño de
  cofres/mesa de crafteo/horno (Fase 19); pulido general de bugs/paridad y
  refactor a convenciones (Fase 18); rolling release (Fase 20) — el Won't
  se mantiene hasta después de la Fase 20
- Del "Futuro" de `Notas del usuario.md` (sin desbloqueo explícito):
  aldeanos y villas, Wither, Dragón del End, Blaze, Ghast, Gólem de hierro,
  Ciudad Antigua, biomas del Nether/End (documentados como inspiración en
  la Fase 21)
- **Editor de skins personalizado** (añadido 2026-08-15: el selector de
  skins predefinidas ya existe en F17 C3; un editor queda fuera de alcance
  por ahora)
- **Restricciones de la Fase 22** (plan 1.17→1.21, 2026-08-15): Redstone y
  todo lo que dependa de ella (Crafter, comparadores, repetidores),
  Trial Chambers y spawners de prueba, Arqueología (cepillo/barro
  sospechoso), Aldeanos/Comercio/Aldeas y Warden (solo el bloque Sculk se
  implementa en la F22), encantamientos/pociones, clima complejo, **oxidación
  del cobre**, **brotes de amatista que crecen** y **renacuajos**
  (limitaciones documentadas en la F22), acuíferos subterráneos, Sniffer y
  Camello (montura), mobs del Nether (Hoglin/Piglin). Diferidos (no Won't):
  Lush Caves, Breeze, Armor Trims, Tuff/Caliza → Fase 23.
