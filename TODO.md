# TODO.md — Roadmap por fases

Cada fase se marca completa solo cuando **todas** sus tareas están
hechas, incluyendo la auditoría final. No saltar de fase sin
cerrar la anterior.

Leyenda: `[ ]` pendiente · `[x]` hecho

---

## Fase 0 — Base entregada
- [x] Servidor autoritativo (Express + ws) con validación de
      movimiento y acciones de bloque
- [x] Generación de mundo por chunks con biomas (llanura, bosque,
      desierto) vía simplex-noise con semilla fija
- [x] IA de mobs con máquina de estados (zombie, creeper,
      esqueleto, enderman, pasivos)
- [x] Crafteo por patrón 3x3 desde `recetas.json`
- [x] Horno con combustible y cocción desde `recetas_horno.json`
- [x] Persistencia completa del mundo cada 30s
- [x] Cliente Three.js vanilla con física básica (colisión,
      gravedad, salto) y culling de caras correcto entre chunks

---

## Fase 1 — Cimientos técnicos
*Objetivo: que la base escale antes de seguir sumando features.*

- [x] Guardado incremental por chunk (reemplazar `world.dat` único
      por un archivo/entrada por chunk, o por región)
- [x] Versionado del formato de guardado (`schemaVersion`) con
      ruta de migración explícita para mundos ya guardados
- [x] Descarga de chunks lejanos: servidor deja de mantener en
      memoria chunks sin jugadores cerca; cliente hace `dispose()`
      de geometría de chunks fuera de rango
- [x] Modularizar `client.js` en módulos ES6 por responsabilidad
      (`network.js`, `world.js`, `player.js`, `mobs.js`, `ui.js`,
      más `constants.js`, `scene.js`, `connection.js` e `input.js`
      para evitar ciclos de import)
- [x] Modularizar `server.js` de forma equivalente si ha crecido
      demasiado (`world.js`, `mobs.js`, `crafting.js`, `net.js`,
      más `constants.js`, `state.js`, `players.js` y `save.js`,
      con `server.js` como entrada que conecta los hooks de red)
- [x] **Auditoría de Fase 1:** probar guardar/cargar el mundo
      varias veces seguidas sin corrupción; medir uso de memoria
      del servidor con varios chunks generados y jugador
      moviéndose por un rato; confirmar que no hay imports rotos
      ni código muerto tras la modularización

> **Auditoría completada (agosto 2026):** 3 ciclos guardar/cargar
> sin corrupción (169 chunks válidos, schemaVersion 2); memoria del
> servidor acotada (439 → 65 chunks en memoria tras descarga, 524
> en disco sin pérdida); test funcional WS 9/9 (todos los
> handlers); revisión de código aprobada. De paso se limpió código
> muerto en `net.js` (drop no-op en `attack_mob`) y un key
> malformado en `furnace_action` close, y se añadió favicon a
> `index.html`.

---

## Fase 2 — Identidad sensorial
*Objetivo: que el juego se vea y suene reconociblemente Minecraft.*

- [x] Atlas de texturas simple (16x16 px por cara, estilo
      pixel-art) reemplazando los colores planos por bloque.
      Generado proceduralmente en un canvas (`public/textures.js`):
      sin assets binarios ni build step, una única `CanvasTexture`
      compartida con `NearestFilter`
- [x] Aplicar texturas en `buildChunkGeometry` (UV mapping por
      cara, agrupado por textura en vez de por color): cada cara
      elige su tesela (top/bottom/lados) con UVs del atlas
- [x] Sonidos básicos: romper bloque, colocar bloque, pasos,
      ambiente de día/noche. Todo procedural con Web Audio API
      (`public/audio.js`, sin assets binarios): contexto
      desbloqueado en el primer gesto, golpes/colocación por
      material del bloque, pasos con alternancia de tono, y
      ambiente continuo de viento + pájaros (día) / grillos
      (noche) guiado por la misma fase del ciclo
- [x] Ciclo día/noche visual real: color de cielo y
      intensidad de luz solar interpolados con el reloj interno
      del servidor (el `init` envía `dayTime`; el cliente lo
      extrapola con `performance.now()` en `public/daynight.js`
      e interpola cielo, luz solar, ambiente y niebla)
- [x] **Auditoría de Fase 2:** medir impacto en rendimiento de
      cargar el atlas y aplicar UVs (FPS con varios chunks
      visibles); confirmar que las texturas no rompen el culling
      de caras existente

> **Auditoría completada (agosto 2026):** benchmark de
> generación del servidor 2.36 ms/chunk (169 chunks, radio 6) y
> 0.52 ms en cache. Medición de FPS en Chrome headless vía CDP
> (SwiftShader, render por software — números conservadores):
> escena reducida de 25 chunks → 148-176 FPS con y sin audio
> (degradación del sonido procedural ≈ 2.8%, ruido de medición;
> `updateAmbient` cuesta 0.02-0.64 ms/frame); escena completa de
> 439 chunks (310K triángulos) renderiza estable. 0 teselas/UVs
> inválidas (19 bloques × 6 caras) y 0 errores de consola: el
> atlas no rompe el culling de caras. De paso se añadió un
> contador de FPS persistente al HUD (`#fps`, métricas en
> `window.__mc*`) útil para auditorías futuras.

---

## Fase 3 — Bucle de supervivencia
*Objetivo: cerrar el loop minar → craftear → sobrevivir.*

- [x] Barra de hambre: decae con el tiempo/acciones, regenera
      salud cuando está llena, penaliza cuando está vacía.
      Implementada en el servidor (`players.js` `tickPlayer`,
      fuente de verdad): `food` 0-20 que decae cada 30s parado
      (15s en movimiento), regenera +1 salud cada 2s cuando
      `food >= 18` (consumiendo comida) y drena -1 salud cada 2s
      por inanición con `food == 0`; el respawn resetea salud y
      comida. El `init` envía `food` y hay evento `food_update`;
      el HUD muestra la barra 🍗 (naranja baja, roja vacía)
- [x] Drops de comida de animales (vaca, cerdo, pollo, oveja) al
      morir. Nuevos ítems de comida cruda en `constants.js`
      (BEEF/PORKCHOP/CHICKEN/MUTTON, 107-110, sincronizados con
      el cliente); `mobs.js` expone `mobDrops(type)` (rangos
      aleatorios estilo Minecraft) y `net.js` entrega el drop al
      inventario del atacante en `attack_mob` (muerte directa)
- [x] Recetas de horno para cocinar esa comida: nuevos ítems
      cocinados (COOKED_BEEF/PORKCHOP/CHICKEN/MUTTON, 111-114,
      sincronizados con el cliente) y 4 recetas en
      `recetas_horno.json` (cruda → cocinada, con `isCookable`
      y el tick del horno ya existentes)
- [x] Comer con clic derecho: `FOOD_VALUES` (hambre +
      saturación, escala 0-20; la cocinada restaura más) en el
      servidor, evento `eat` validado que consume el ítem
      seleccionado, y el tick consume la saturación antes que
      el hambre (amortigua el hambre, como en Minecraft)
- [x] Alimentación y reproducción simple de animales (dar item →
      cooldown → cría): nuevos ítems de cría TRIGO/ZANAHORIA/
      SEMILLAS (115-117, la hierba los suelta al romperla) que
      alimentan a vaca/oveja, cerdo y pollo respectivamente
      (`BREED_FOOD`); `feed_mob` validado en el servidor consume
      el ítem, entra en modo amor 30s y si encuentra pareja del
      mismo tipo a <8 bloques cría un bebé (los padres entran en
      cooldown 60s); el bebé se renderiza a media escala, no
      dropea comida y crece hasta adulto en 60s; el estado
      `isBaby`/`age` se persiste de forma retrocompatible
- [x] **Auditoría de Fase 3:** revisar balance (¿el hambre baja a un
      ritmo jugable?), confirmar que el spawn/reproducción de
      animales no degrada el rendimiento del tick de mobs

> **Auditoría completada (agosto 2026):** balance del hambre
> validado por simulación reutilizable (`tests/audit-fase3.js`):
> parado, la comida aguanta ~10 min antes de bajar y se muere de
> inanición a los ~21 min; moviéndose, ~5 y ~11 min — presión
> suave, ritmo jugable. La regeneración agota ~3 HP de reserva
> (food 20→17, se detiene al llegar food < 18, fiel a Minecraft),
> una pelea sostenida agota la reserva en ~6s (no se puede
> tanquear), y comer cocinada (+8 food / +12.8 sat) cubre ~40% de
> la barra e incentiva el horno frente a la cruda (+3 / +1.8).
> Tick de mobs con cría: 30 mobs → 0.043 ms/tick, 100 → 0.135,
> 300 → 0.319 (y 0.225 de noche) — escala lineal y muy por debajo
> del presupuesto de 50 ms; el broadcast `mobs_update` pesa 5-51
> KB y se serializa en <3 ms. Persistencia de `isBaby`/`age`:
> round-trip OK y retrocompatible con guardados viejos. De paso se
> limpió código muerto preexistente (`isAxe`/`isShovel` sin uso en
> `constants.js`).

---

## Fase 4 — Profundidad de terreno
*Objetivo: que el mundo deje de sentirse macizo y plano.*

- [x] Cuevas: ruido 3D restando de la generación de piedra en
      `generateChunk`. Dos octavas 3D sembradas con la misma semilla
      (`noise3D_cave` / `noise3D_cave_fine` en `world.js`) en
      coordenadas de mundo (continuas entre chunks y deterministas
      en la zona subterránea); `isCaveBlock()` usa ruido "ridged"
      (1−|n|) ponderado con `CAVE_THRESHOLD = 0.84` calibrado por
      barrido empírico (~9-14% del subsuelo excavado, túneles
      conexos sin queso suizo); se excava solo piedra (`y > 1 &&
      y < height - 2`) protegiendo bedrock y los 2 bloques
      superiores (sin huecos en superficie); los minerales no se
      generan dentro de cuevas. Hook `setDiskLoader` para forzar
      generación fresca en tests; cubierto por `tests/unit-mundo.js`
- [x] Bloque de agua: no sólido, con física simple de flotación
      para el jugador. Lagos generados con ruido 2D en `world.js`
      (`noise2D_lake`, `LAKE_THRESHOLD = 0.65` calibrado por barrido
      a ~5% de columnas, `SEA_LEVEL = 5`, `LAKE_FLOOR = 2`): la
      columna se hunde, con piedra bajo el fondo, arena en
      `LAKE_FLOOR` y agua hasta `SEA_LEVEL` (sin aire bajo el agua);
      el agua es `B.WATER = 20` no sólida (`isSolidBlock` en
      servidor y cliente, `NOT_MINEABLE` → no se rompe a mano, sin
      cubo no se coloca). La validación de movimiento del servidor
      acepta nadar; el cliente (`public/player.js`) aplica
      flotación: gravedad reducida, hundimiento lento limitado,
      espacio nada hacia arriba y velocidad horizontal reducida; el
      render usa un material translúcido aparte (`DoubleSide`,
      renderOrder 1) con culling adaptado (sólidos visibles a
      través del agua, agua solo contra aire). Cubierto por
      `tests/unit-mundo.js` (agua presente, sin agua sobre
      `SEA_LEVEL`, fondo de arena, `isSolidBlock(WATER) === false`,
      lake-aware en superficie/determinismo/costuras)
- [x] (Opcional si el rendimiento lo permite tras Fase 1) más
      variedad de bioma: nieve, montaña. `getBiome` ahora devuelve
      `mountain` (ruido 2D propio `noise2D_mountain`, `MOUNTAIN_THRESHOLD
      = 0.45` calibrado por barrido a ~19% del mundo) y `snow`
      (temperatura < `SNOW_TEMP = -0.3`), además de desert/forest/plains;
      las montañas elevan el terreno (base 12 + octava de crestas, alturas
      hasta 26 frente a las 14 máximas de llanuras) y su superficie es
      roca o nieve (`MOUNTAIN_SNOW_LINE = 18` en cumbres, calibrado a ~58%
      de cumbres nevadas frente al 91% que daba 15 — contraste con la
      tundra); la tundra tiene superficie de nieve. Nuevo bloque `B.SNOW = 21` (sólido, rompible a
      mano, colocable, con tesela propia en el atlas) sincronizado entre
      servidor y cliente. Cubierto por `tests/unit-biomas.js`
      (5 biomas presentes, montañas elevan el terreno, nieve en
      tundra/cumbres, roca en montañas bajas, césped/arena conservados,
      determinismo bit-idéntico en chunks de montaña)
- [x] **Auditoría de Fase 4:** confirmar que las cuevas no generan
      huecos visuales raros en el culling de caras; probar
      generación de chunks con cuevas en tiempo real sin caída de
      FPS perceptible

> **Auditoría completada (agosto 2026):** herramienta reutilizable
> `tests/audit-fase4.js`. Culling validado 4/4 checks replicando la
> regla EXACTA del cliente (sólidos dibujan contra aire O agua, el
> agua solo contra aire): 0 caras dibujadas contra un sólido (sin
> caras ocultas), 0 caras visibles sin dibujar dentro y entre
> chunks (sin huecos), el agua solo contra aire, y el lecho del
> lago dibuja sus 436 caras contra el agua (se ve bajo la
> superficie) — con cuevas cruzando fronteras de chunk y lago real
> buscado en radio 4 (y = SEA_LEVEL−1, el agua vive en y∈{3,4}).
> Generación en tiempo real: 25 chunks frescos en 47.9 ms →
> 1.91 ms/chunk (bajo el presupuesto de 5 ms para streaming);
> ~234K triángulos estimados para radio 4 (la Fase 2 renderizaba
> 310K estables — las cuevas REDUCEN geometría). Memoria 16 KB/
> chunk (Uint8Array puro) → 1.3 MB para el área de radio 4 (presu-
> puesto 60 MB, holgado); regeneración bit-idéntica sin costuras.
> FPS real medido en Chrome headless vía CDP (SwiftShader, render
> por software — números conservadores, como en Fase 2): escena
> completa de 223 chunks / 216,800 triángulos → mediana 125 FPS
> (min 26.9 · max 175.4), sin errores de consola.
>
> **Bug crítico encontrado y corregido por esta auditoría:** el
> refactor de la Fase 4 (buffers separados para el agua) movió
> `pushFace` fuera del bucle de `buildChunkGeometry`, pero la
> función seguía referenciando `wx/wy/wz`, declarados con `const`
> DENTRO del bucle (block-scoped) → `ReferenceError` en cada cara →
> **ningún chunk se renderizaba** (`mcChunks: 0` en navegador, con
> la página por lo demás funcional). Los tests de servidor no
> podían verlo (no ejercitan el render); solo la auditoría en
> navegador lo destapó. Corregido pasando las coordenadas como
> parámetros a `pushFace(block, fi, target, wx, wy, wz)`. La
> medición de FPS requiere servir THREE desde local
> (`/tmp/three-local`, interceptando las peticiones del importmap a
> unpkg.com vía CDP Fetch — el CDN externo es inalcanzable/lentísimo
> en esta red; ver `tmp-audit4-fps.js`).
>
> **Notas del revisor de la tarea de agua, ambas resueltas:** (1) los
> mobs "caminaban" sobre la superficie del agua — resuelto:
> `settleOnGround` ahora usa `isSolidBlock` (el agua no es sólida), así
> que los mobs se hunden a través de la superficie y descansan en el
> fondo del lago, cubierto por `tests/unit-mobs-agua.js`; (2) el spawn
> del jugador usaba `getHeight` (no lake-aware) y podía aparecer
> nadando sobre un lago — resuelto: `world.findSpawn()` busca en
> espiral la columna firme más cercana si la pedida es un lago, usado
> en el spawn inicial (`net.js`) y en el respawn (`players.js`),
> cubierto por `tests/unit-spawn.js`.

---

## Fase 5 — Progresión y combate
*Objetivo: dar sentido a subir de nivel de herramienta.*

- [x] Durabilidad real de herramientas (que se rompan tras N usos):
      `TOOL_DURABILITY` en `constants.js` (madera 60, piedra 132,
      hierro 251, oro 33, diamante 1562 — estilo Minecraft, para
      picos 200-204, hachas 205-209, palas 210-214 y espadas 215-219).
      Cada herramienta lleva su `durability` en el slot (no se
      apilan; `addToInventory` las crea con durabilidad plena).
      `players.js` `applyToolWear()` desgasta -1 por uso: al romper
      bloques con cualquier herramienta y al atacar con espada
      (`onlySwords=true`); al llegar a 0 se elimina del inventario de
      forma atómica dentro del handler (sin duplicar items) y se
      avisa al cliente con `tool_broke` (sonido + mensaje). El HUD
      del hotbar pinta una barra de durabilidad (verde→rojo) con la
      durabilidad que viaja en `inventory_update`; las herramientas
      que pasan por la mesa de crafteo conservan su durabilidad
      (`grid_set`/`grid_clear`) para que no se "reparen gratis" ni se
      dupliquen usos. Daño de espada por material (`SWORD_DAMAGE`:
      madera 3, piedra 4, hierro 5, oro 4, diamante 6; sin espada 2)
- [x] Más variedad de mobs y drops asociados: nuevos hostiles
      `spider` (araña: 12 HP, rápida, dmg 2) y `wolf` (lobo: 20 HP,
      dmg 3) y pasivo `rabbit` (conejo: 10 HP, se cría con zanahoria).
      Drops: la araña suelta hilo (`I.STRING=120`, 0-2) que se craftea
      2x2 en lana (receta `hilo_a_lana`); el conejo suelta conejo
      crudo (`I.RABBIT=118`) que se cocina en el horno a asado
      (`I.COOKED_RABBIT=119`, receta en `recetas_horno.json`).
      Escala por tipo en el cliente (`MOB_SCALE`)
- [x] (Opcional) experiencia simple / niveles: `MOB_XP` (matar mobs)
      y `ORE_XP` (minar minerales) acumulan XP; `level = floor(xp /
      100)` con `XP_PER_LEVEL=100`. Cada nivel suma +1 de salud
      máxima (máx +10, `MAX_LEVEL_HEALTH_BONUS`); la XP y el nivel se
      conservan al morir. El `init` envía `xp/level/maxHealth`, el
      cliente muestra barra de XP + nivel en el HUD y avisa al subir
      de nivel; `maxHealth` se usa en respawn y regeneración
- [x] **Auditoría de Fase 5:** revisar que la durabilidad se
      sincroniza correctamente entre inventario del servidor y HUD
      del cliente; confirmar que no hay forma de duplicar items al
      romperse una herramienta a mitad de una acción

> **Auditoría completada (agosto 2026):** herramienta reutilizable
> `tests/audit-fase5.js`. **Sincronización servidor ↔ cliente:**
> `TOOL_DURABILITY` (servidor) == `DURABILITY` (cliente) para las 20
> herramientas (parse del ESM) y `XP_PER_LEVEL` idéntico; el wire de
> `inventory_update` lleva `durability` por herramienta; el HUD
> (`public/ui.js`) importa `DURABILITY` y pinta la barra `.durbar`;
> el servidor avisa `tool_broke`. **Sin duplicación al romperse a
> mitad de una acción:** replicando la secuencia EXACTA del handler
> break (romper → añadir drop → desgastar → enviar inventario), una
> herramienta de durabilidad 1 añade el drop UNA vez y desaparece sin
> copias (0 herramientas, 1 drop, total de slots coherente); 6 roturas
> con durabilidad 5 dan 6 drops exactos y la herramienta desaparece;
> romper a mano no desgasta. **XP/niveles:** 340 XP → nivel 3 y
> maxHealth 23; tope +10 en nivel 15; el respawn usa maxHealth y
> conserva nivel/XP; `applyToolWear` rinde 10k usos en ~5 ms.
> Regresión Fase 3/4 intacta (drops de vaca, isSolidBlock(SNOW),
> getHeight). Cobertura unitaria nueva en `tests/unit-durabilidad.js`
> (durabilidad, espadas, XP, mobs nuevos y recetas hilo/conejo).
> **Bug real encontrado y corregido por los tests:** la receta
> `hilo_a_lana` apuntaba al ingrediente 118 (conejo crudo) en vez de
> 120 (hilo) — no habría funcionado en el juego.

---

## Fase 6 — Mundo jugable y pulido
*Objetivo: convertir las mecánicas básicas en una experiencia más
fiel a Minecraft. Este bloque prioriza el **feedback del usuario**
(features nuevas); los bugs reportados están en la sección "Bugs
conocidos" al final. Ninguna tarea empezada todavía.*

### Minería y herramientas
- [ ] Afinar la minería: dureza por bloque y velocidad de rotura
      según la herramienta correcta (pico para piedra/minerales,
      hacha para madera, pala para tierra/arena/nieve; con la
      herramienta equivocada o a mano: lento o sin drop). La base
      ya existe (romper/colocar con restricciones de herramienta y
      durabilidad, Fases 0 y 5); falta la *velocidad* y el *drop
      condicional* estilo Minecraft
- [ ] Verificar que las 20 herramientas (pico/hacha/pala/espada ×
      5 materiales) se pueden obtener todas en juego: ya son
      crafteables desde `recetas.json` (se completaron las 6 de
      oro/diamante en la tarea de tests); revisión de obtención
      real y de que ninguna queda inaccesible

### Mobs: texturas e IA
- [ ] Texturas para mobs pasivos (crías y adultos) — hoy se
      renderizan con colores planos (`MOB_COLORS` en cliente);
      darles apariencia de animal con el atlas
- [ ] Texturas para mobs hostiles — igual, colores planos
- [ ] IA hostil más fiel: quemarse con el sol de día
      (zombie/esqueleto), aparecer **solo de noche** y poder hacer
      spawn en todo el mapa cargado (hoy `spawnMobs()` los genera
      cerca del jugador, de día y de noche; los hostiles solo
      persiguen de noche o a <6-8 bloques)

### Ítems
- [ ] Texturas para los ítems del inventario/HUD (hoy usan colores
      planos por ID en el hotbar y la mesa)

### Mundo y sesión
- [ ] Semilla seleccionable al iniciar el mundo: campo en el menú
      para elegir semilla y generar un mundo totalmente distinto.
      Base lista: `SEED` por env var + un mundo por semilla
      (`world/<semilla>/`, bug de la semilla corregido); falta solo
      la UI del menú que lance el servidor con la semilla elegida
- [ ] Pantalla de "cargando mundo" estilo Minecraft mientras se
      generan/transmiten los chunks iniciales (hoy el menú salta
      directo al mundo)
- [ ] Cofre: bloque de almacenamiento con inventario propio (la
      mesa de crafteo y el horno ya existen como bloques
      funcionales; falta solo el cofre)
- [ ] Antorchas con iluminación dinámica (luz por bloque además de
      la luz global del ciclo día/noche)

### Herramientas de desarrollo (transversal, desbloquea el resto)
- [x] Consola de comandos básica: `/help`, `/tp <x> <y> <z>`,
      `/give <item> [cantidad]`, `/time set <day|noon|night|midnight|ms>`
      y `/gamemode <creative|survival>`, vía chat (mensaje que empieza
      por `/`). Implementada en `commands.js` (fuente de verdad del
      servidor) y cableada en el handler de chat de `net.js`. `/tp`
      corrige la Y si el destino es sólido/agua y envía los chunks del
      área nueva (`chunks_add` + `teleport` + `player_move`); `/give`
      acepta ID numérico o nombre (índice de B/I en minúsculas) y las
      herramientas llegan con durabilidad plena; `/time set` ajusta
      `state.timeOffset` y hace broadcast de `time_set` (el cliente
      re-sincroniza el ciclo día/noche y la IA de mobs usa el mismo
      reloj); `/gamemode creative` evita el hambre (tick omitido) y el
      daño (`damagePlayer` ignorado). `/give` rechaza bloques no
      rompibles (bedrock/agua, anti-griefing) y `/tp` corrige la Y
      también en lagos (sube hasta salir del agua). Acceso abierto a
      todos los jugadores (herramienta de desarrollo; la auth está
      fuera de alcance). Cubierto por `tests/unit-commands.js`
- [ ] Visualizador de chunks: toggle que dibuja bordes de chunk y
      cuenta de caras/triángulos (debug de culling)
- [ ] Hot-reload de `recetas.json`/`recetas_horno.json` y del atlas
      de texturas sin reiniciar el servidor

### Rendimiento en cliente
- [x] Frustum culling: no renderizar los chunks fuera del campo de
      visión. `public/world.js` calcula UNA esfera envolvente por
      chunk a partir de su geometría real (con margen 1.05x
      anti-parpadeo) y `applyFrustumCulling(camera)` la marca
      `visible=false` cada frame desde el bucle de animación
      (evita el draw call y el paso de geometría al renderer). El
      HUD muestra `visibles/totales` y la métrica `__mcCullMs`
      mide el coste del pase (~0.01 ms para cientos de chunks)
- [ ] LOD simple para chunks lejanos (geometría simplificada o sin
      teselas finas)
- [ ] Reutilización/pool de geometrías al cargar/descargar chunks
      (hoy `dispose()` + reconstrucción completa)

### Supervivencia (cerrar el loop)
- [ ] Cama: dormir salta la noche y fija el punto de reaparición
- [ ] Armadura básica (cuero, hierro, diamante) que reduce daño
- [ ] Daño por caída (escala con la altura de la caída)
- [ ] Morir al caer del mundo (void): si `y` cae bajo el bedrock
      (o por debajo del mundo), el jugador muere y reaparece
- [ ] Respawn con pérdida de items (o sin, según gamemode) — hoy
      se conservan inventario y XP, pero se resetean salud y
      comida y se reaparece en el spawn

### Terreno
- [ ] Minas abandonadas: pasillos generados + cofres de loot
- [ ] Pozos de agua/lava en superficie (generación decorativa)
- [ ] Compresión (gzip) del guardado por chunk: mundos grandes
      ocupan mucho espacio en disco

### Audio
- [ ] Control de volumen por categoría + sistema de prioridad (no
      saturar reproduciendo 10 pasos a la vez)

### Multijugador visible
- [ ] Nombres flotantes sobre otros jugadores
- [ ] Animación de rotura de bloque sincronizada entre clientes

### Auditorías
- [ ] Métrica de tiempo por tick (server + client) en cada
      auditoría de fase para detectar cuellos de botella antes de
      que sean críticos

> **Nota de planificación:** la minería, las 20 herramientas
> crafteables, la mesa de crafteo, el horno y los minerales ya
> están implementados (Fases 0 y 5), por eso esos puntos se
> formulan como *afinado/verificación* y no como features nuevas.
> Tampoco se proponen fases 0.5/1.5 (herramientas de desarrollo y
> optimización previa a texturas): esas fases ya están cerradas,
> así que esas ideas se han movido a este bloque.

---

## Bugs conocidos (pendientes de corrección)

- [x] **Inventario: el mouse sigue bloqueado y no se puede
      craftear/mover items.** Causa real: el bloqueador del menú
      (`#blocker`, z-index 300) reaparecía en CADA `controls.unlock()`
      (`public/scene.js`) y tapaba los paneles de crafteo/horno
      (z-index 200) y el chat (z-index 90), dejándolos inutilizables.
      Corregido: el handler de `unlock` solo muestra el menú si NO hay
      un panel/chat abierto; `public/ui.js` oculta el bloqueador
      explícitamente al abrir paneles o el chat (`showBlocker(false)`,
      también válido si el pointer lock falla) y `closePanels()`
      (Escape) re-bloquea el puntero para reanudar el juego
- [x] **Cambiar la semilla no genera un mundo nuevo.** Corregido con
      directorios por semilla: `SEED` se configura con la env var
      `SEED` (defecto `miSemilla2026`) y cada semilla tiene su
      propio mundo en `world/<semilla>/` (`constants.js` `seedDir`),
      así al cambiar la SEED se genera un mundo totalmente nuevo sin
      pisar el anterior (y volver a una semilla recupera su mundo).
      El layout antiguo (`world.json` + `chunks` en la raíz de
      `world/`) se migra al arrancar con `save.migrateWorldLayout()`
      y el formato pasa a v3. Cubierto por
      `tests/unit-persistencia.js` (seedDir + migrateWorldLayout).
      Queda pendiente solo la UI del menú (ver Fase 6: "Semilla
      seleccionable al iniciar el mundo")
- [x] **Los árboles flotan un bloque por encima del terreno.** En
      `world.js` el tronco empezaba en `y = height + 1` (bucle `i`
      desde 1) en vez de en `height`, dejando la base sin tronco.
      Corregido: el tronco empieza en el primer aire sobre la
      superficie (`y = height`) y descansa sobre el césped
      (`y = height - 1`); las hojas bajan una unidad para rodear la
      copa igual que antes. Aplica a chunks NUEVOS (los guardados
      conservan su mundo). Regresión cubierta por
      `tests/unit-arboles.js` (invariante: base de tronco nunca
      sobre aire/agua)
- [ ] **Transiciones de bioma bruscas y cuevas sin comunicación con
      la superficie.** `getBiome()` corta entre biomas por umbrales
      discretos (sin blend); las cuevas no rompen la superficie a
      propósito (`y < height - 2`). Plan: suavizar el blend entre
      biomas y permitir bocas de cueva hacia la superficie

---

## Fuera de alcance (Won't)

Explícitamente descartado por ahora — no implementar sin discutir
primero y actualizar este archivo:

- Redstone
- Dimensiones alternas (Nether / End)
- Aldeas generadas proceduralmente
- Sistema de clima
- Cuentas de usuario / autenticación
- Persistencia en base de datos externa (se resuelve con archivos
  por chunk en la Fase 1)
