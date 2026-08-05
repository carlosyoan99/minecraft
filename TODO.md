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
conocidos" al final. El pulido que sobrecargaba esta fase (texturas,
rendimiento, supervivencia, multijugador visible y audio) se movió a
la **Fase 7**.*

### Minería y herramientas
- [x] Afinar la minería: dureza por bloque y velocidad de rotura
      según la herramienta correcta. Nuevas constantes en
      `constants.js`: `BLOCK_HARDNESS` (segundos a mano),
      `TOOL_TIER_SPEED` (multiplicador por material: madera 2x,
      piedra 4x, hierro 6x, oro 12x —rápida pero frágil—, diamante
      8x) y categorías de bloque con su herramienta (pico →
      piedra/minerales, hacha → tronco, pala → tierra/arena/nieve)
      → `breakSeconds(tool, block)`. Romper ya no es instantáneo:
      `block_action break` inicia una SESIÓN de minería (nuevo
      `mining.js`) que el bucle principal avanza por ticks
      (TICK_MS) y comunica las fases 0-9 al cliente con
      `block_break_progress` (grietas); se cancela con `break_cancel`,
      si el bloque cambia o si el jugador se aleja (>7 bloques).
      Drop condicional (`canHarvest`): piedra/minerales solo
      sueltan drop con pico — con la herramienta equivocada o a
      mano se rompe igual (lento) pero sin drop ni XP (el desgaste
      de la herramienta sí aplica). El cliente mantiene el clic
      para minar (mouseup o mirar a otro bloque cancela, con
      retarget automático) y pinta un overlay de grietas. Cubierto
      por `tests/unit-mineria.js` (matemáticas de rotura, drop
      condicional, sesión completa y cancelaciones) y el test de
      break de `tests/unit-red.js` (conduce la sesión como el bucle
      principal); el E2E de durabilidad mina sus 60 bloques con el
      nuevo ritmo
- [x] Verificar que las 20 herramientas (pico/hacha/pala/espada ×
      5 materiales) se pueden obtener todas en juego: ya son
      crafteables desde `recetas.json` (se completaron las 6 de
      oro/diamante en la tarea de tests). La revisión de obtención
      REAL confirmó la cadena completa y que ninguna queda
      inaccesible: tronco (se mina a mano) → planks → palos → pico
      de madera → adoquín (rompiendo piedra) → horno y pico de
      piedra → minerales con pico → fundición → lingotes de
      hierro/oro → herramientas de hierro/oro, y diamante que se
      mina directo (sin horno); el combustible del horno
      (tronco/planks/palos) sale de la primera madera, así que la
      fundición nunca queda bloqueada. Cubierto por la nueva
      sección "cadena de obtención" de `tests/unit-recetas.js`
      (las 20 recetas existen, cada una con palos + su material,
      cada material es alcanzable y la progresión de picos es
      continua)

### Mobs: IA
- [x] IA hostil más fiel: quemarse con el sol de día
      (zombie/esqueleto), aparecer **solo de noche** y poder hacer
      spawn en todo el mapa cargado. `spawnMobs(isNight)` elige los
      tipos por fase del día (de día solo pasivos, de noche también
      hostiles) y la posición en CUALQUIER chunk cargado del área de
      render del jugador (antes: siempre a <25 bloques), con reglas
      estilo Minecraft: los hostiles nunca a <24 bloques del jugador
      (no spawn en la cara) y nunca sobre lagos. Los no-muertos
      (zombie/esqueleto, `BURNS_IN_SUN` en `constants.js`) arden con
      el sol: `Mob.tickSunBurn()` daña 1 HP/s a los expuestos al
      cielo (sin bloque sólido entre la cabeza y `WORLD_HEIGHT` —
      techos/árboles dan sombra), el flag `burning` viaja en
      `mobs_update` y el cliente tiñe al mob en llamas (naranja
      fuego, `public/mobs.js`); al morir por el sol no sueltan drop
      ni dan XP (como en Minecraft, la muerte no pasa por
      `attack_mob`). Cubierto por `tests/unit-mobs-ia.js` (quema:
      día/noche/techo/tipos/20 HP→muerte/snapshot; spawn: solo
      pasivos de día, hostiles de noche, distancia mínima)

### Mundo y sesión
- [x] Semilla seleccionable al iniciar el mundo: campo "Semilla del
      mundo" en el menú principal que, al pulsar Jugar, envía
      `set_seed` al servidor. El servidor es la fuente de verdad:
      `save.switchWorld(seed)` persiste el mundo actual (nada se
      pierde), limpia el estado en memoria, re-seeda el ruido
      (`world.reinitNoise`) y carga o genera el mundo de esa semilla
      (`world/<semilla>/`); reenvía el `init` con `seed` para que el
      cliente confirme la semilla pedida y cierre la pantalla de
      carga (cambio cubierto por ella). Solo se cambia si el jugador
      es el ÚNICO en línea (servidor dedicado); con otros jugadores
      responde `seed_rejected` y se vuelve al menú. El inventario,
      salud y XP no viajan entre mundos. Cubierto por los tests de
      `switchWorld` en `tests/unit-persistencia.js` (cambio, same,
      vuelta atrás con recuperación, rechazo por mundo ilegible con
      reversión y reinitNoise que genera mundos distintos)
- [x] Pantalla de "cargando mundo" estilo Minecraft mientras se
      generan/transmiten los chunks iniciales. Nuevo `public/loading.js`:
      pantalla a pantalla completa con fondo de tierra procedural en
      CSS (sin assets), panel gris con borde clásico de Minecraft,
      barra de progreso con rayas animadas y consejos rotatorios en
      español; cubre desde el arranque del cliente hasta que llega el
      `init` con el mundo (`finishLoading()` en `public/network.js`),
      con progreso simulado suave (el mundo llega de golpe en `init`,
      no hay métrica incremental real) y mínimo visible de 700 ms para
      no parpadear en cargas desde caché. Si la conexión se pierde,
      muestra "Conexión perdida" con botón Reintentar (recarga la
      página). Oculta por defecto en CSS: si el JS no arranca, el menú
      funciona igual
- [x] Cofre: bloque de almacenamiento con inventario propio. Nuevo
      bloque `B.CHEST = 22` (dureza 1.5 como la mesa de crafteo,
      crafteable con 8 tablones alrededor del centro — receta
      `chest` en `recetas.json`). El servidor mantiene un Map de
      cofres (`state.chests`, módulo `chests.js`: `getOrCreateChest`/
      `chestSnapshot`/`restoreChests` con 27 slots — 3 filas de 9,
      como el cofre pequeño de Minecraft) que se persiste en
      `world.json` (meta, junto a hornos) y se limpia con el estado
      al cambiar de semilla. Eventos `chest_open` (valida distancia
      ≤7 y que el bloque sea un cofre) y `chest_action` con
      `put`/`take`/`close`: mover items entre el cofre y el
      inventario apilando iguales y conservando la durabilidad de
      las herramientas; cofre lleno/inventario lleno → la acción se
      rechaza sin perder el item; `close` limpia `p.openChest`.
      Al ROMper un cofre se elimina su estado (`finishMining`,
      simplificación documentada: el contenido se pierde) y cae
      como item al inventario (canHarvest). El cliente abre el
      panel con clic izquierdo (`public/input.js` — los cofres no
      se minan con clic, como mesa/horno), muestra 27 slots + el
      inventario del jugador (`public/ui.js` `applyChestState`/
      `toggleChestUI`, eventos `chest_state` en `public/network.js`)
      y libera el puntero para clicar slots (mismo fix del mouse
      del inventario). Cubierto por `tests/unit-cofre.js` (estado,
      open/put/take/close, cofre lleno, receta, rotura) y el E2E
      `tests/e2e-cofre.js` (craftear → colocar → abrir → guardar →
      tomar → romper, 12/12)
- [x] Antorchas con iluminación dinámica: luz POR BLOQUE además de
      la luz global del ciclo día/noche. Nuevo bloque `B.TORCH = 23`
      (no sólido — se atraviesa, como en Minecraft; dureza 0.1:
      se rompe al instante; crafteable 1 carbón + 1 palo → 4, receta
      `torch`). Reglas de soporte del servidor (`world.js`
      `torchSupported`/`cleanUnsupportedTorches`): necesita al menos
      un vecino sólido (suelo/pared/techo; el agua y otra antorcha
      NO dan soporte) y al romper el bloque de apoyo la antorcha
      cae (`setBlock AIR` + broadcast); el handler de place la
      rechaza flotando. Iluminación en el cliente: nuevo módulo puro
      `public/lighting.js` — BFS 6-direccional por antorcha con
      atenuación 0.8/paso y radio 7 (el agua y otra antorcha dejan
      pasar la luz; los sólidos la bloquean), `computeChunkLight`
      hornea un Float32Array por chunk que `public/world.js`
      convierte en color por vértice (`1 + luz × 1.4` multiplica el
      atlas y la luz global: de noche las antorchas iluminan
      claramente, de día apenas se notan — como Minecraft). Las
      antorchas se dibujan como dos planos cruzados translúcidos con
      la tesela 29 del atlas (palo + llama, fondo transparente) y su
      propio color les hace brillar de noche. `setClientBlock`
      mantiene el registro de antorchas (`torchSet`/`lightStore`),
      se re-hornea el vecindario 3x3 al colocar/romper una
      (`rebuildAround`) y `unloadChunks`/`loadChunkData` las
      limpian/registran. Cubierto por `tests/unit-antorchas.js`
      (soporte y caída, place rechazado/aceptado, no-sólida,
      receta y el motor de luz: atenuación, alcance, oclusión con
      pared completa, antorcha lejana ignorada)

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
      reloj); `/gamemode creative` evita el hambre (tick omitido), el
      daño (`damagePlayer` ignorado) y hace la **minería instantánea**:
      romper un bloque en creative se resuelve al momento (sin sesión
      de progreso ni grietas) y sin desgaste de herramienta ni drops
      (durabilidad infinita y sin drops, como en Minecraft — el
      inventario se gestiona con `/give`); una sesión de minería ya
      activa se completa también al instante si se cambia a creative a
      mitad de mina. Cubierto por los tests de creative en
      `tests/unit-red.js` y `tests/unit-mineria.js`. `/give` rechaza
      bloques no rompibles (bedrock/agua, anti-griefing) y `/tp`
      corrige la Y también en lagos (sube hasta salir del agua).
      Acceso abierto a todos los jugadores (herramienta de desarrollo;
      la auth está fuera de alcance). Cubierto por
      `tests/unit-commands.js`
- [x] Visualizador de chunks: toggle con **F3** (como el debug de
      Minecraft) en `public/debug.js` — dibuja un grid rojo con los
      bordes de cada chunk siguiendo la superficie del terreno (se
      reconstruye cada segundo mientras está activo, reflejando
      chunks nuevos/descargas y ediciones) y muestra un panel con
      FPS/frame, posición, chunks visibles/totales (culling), caras
      de la geometría cargada y triángulos renderizados. Se apoya en
      las métricas `window.__mc*` que ya publica el bucle de
      animación; sin hooks en player.js. Toggle en `public/input.js`
      (tecla F3)
- [x] Hot-reload de `recetas.json`/`recetas_horno.json` y del atlas
      de texturas sin reiniciar el servidor. `crafting.reloadRecipes()`
      recarga ambas tablas desde disco con **swap atómico** (valida
      estructura mínima — shape/ingredients/result en crafteo,
      result/time en horno — y si un archivo es inválido mantiene las
      anteriores; nunca un estado a medias); `crafting.watchRecipeFiles()`
      vigila el directorio con debounce (los editores reemplazan el
      archivo por rename, por eso se vigila el dir y no el inodo) y
      avisa al servidor, que hace broadcast de chat de sistema +
      `textures_reload`. El comando `/reload` hace lo mismo a petición.
      El atlas vive en el cliente: `textures_reload` hace que
      `public/world.js` re-importe `textures.js` con cache-busting (URL
      `?t=...`), regenere el atlas, actualice los materiales compartidos
      y reconstruya la geometría de los chunks cargados (los UVs dependen
      del layout del atlas). Cubierto por `tests/unit-reload.js` (swap
      atómico, JSON inválido, receta malformada), el test de `/reload`
      en `unit-red.js` y el E2E `tests/e2e-reload.js` (watcher + comando
      contra servidor real)

### Rendimiento en cliente
- [x] Frustum culling: no renderizar los chunks fuera del campo de
      visión. `public/world.js` calcula UNA esfera envolvente por
      chunk a partir de su geometría real (con margen 1.05x
      anti-parpadeo) y `applyFrustumCulling(camera)` la marca
      `visible=false` cada frame desde el bucle de animación
      (evita el draw call y el paso de geometría al renderer). El
      HUD muestra `visibles/totales` y la métrica `__mcCullMs`
      mide el coste del pase (~0.01 ms para cientos de chunks)
- [x] LOD simple para chunks lejanos (geometría simplificada, sin
      teselas finas). Decisión de tier PURA y testeable en
      `public/lod.js` (`lodTierFor` con **histéresis**: se entra en
      LOD al superar 56 bloques del centro del chunk y se vuelve al
      detalle completo al bajar de 44 — en la banda intermedia se
      conserva el tier actual, sin parpadeo en la frontera; la
      distancia es horizontal, la Y no cuenta para que el tier no
      alterne al subir/bajar colinas). `public/world.js` mantiene dos
      mapas (`chunkMeshes` = detalle completo texturizado,
      `lodMeshes` = caparazón simplificado): `buildLodGeometry`
      genera un quad superior por columna en la altura de la
      superficie (color plano del bloque vía `BLOCK_COLORS`, sin
      atlas) + muros laterales oscurecidos donde el vecino es más
      bajo (laderas sólidas, no láminas flotantes) — ~256 quads por
      chunk en vez de miles de caras, material compartido
      `vertexColors` que reacciona al día/noche. `rebuildChunk` elige
      el tier por distancia, `updateLod()` (throttle 250 ms en
      `player.js`) hace el swap al cruzar el umbral, y el frustum
      culling, `unloadChunks`, el hot-reload del atlas y el
      visualizador F3 (`debug.js` cuenta caras de ambos tiers)
      cubren los dos mapas. Cubierto por `tests/unit-lod.js`
      (fronteras exactas, histéresis y "un solo flip al acercarse /
      alejarse")
- [x] Pool/reutilización de geometrías al cargar/descargar chunks
      (antes `dispose()` + `new BufferGeometry` por cada chunk).
      Nuevo `public/geopool.js` (módulo puro, sin three):
      `createGeometryPool` mantiene un pool POR CATEGORÍA
      (terrain/water/lod — cada una con su set de attributes) con
      tope (`maxPooled`, el exceso se libera con `dispose()` para
      acotar la memoria retenida) y `setOrReuseAttribute` **reutiliza
      el array** (y por tanto el buffer GPU) cuando el tamaño
      coincide — solo se re-alloc/refresca lo que cambia, eliminando
      el coste dominante de la reconstrucción (alloc de Float32Array
      + upload al GPU) para los chunks de tamaño similar.
      `world.js` adquiere geometrías del pool en `buildChunkGeometry`
      y `buildLodGeometry` y las devuelve en `removeChunkMesh` (cada
      mesh lleva su `userData.poolCat`); los materiales compartidos
      siguen sin tocarse. Métricas en el F3 (`__mcGeoPool`:
      reutilizadas/creadas/liberadas). Cubierto por
      `tests/unit-geopool.js` (reutilización real de la misma
      geometría y del mismo array, tope del pool, categorías
      separadas, categoría desconocida → dispose, y
      `setOrReuseAttribute` con tamaño igual vs distinto)
- [x] **Auditoría de Fase 6:** medir FPS con LOD activo (comparar
      caras/triángulos con y sin LOD) y revisar la memoria del
      cliente

> **Auditoría completada (agosto 2026):** herramienta reutilizable
> `tests/audit-fase6.js` (11/11 checks) + medición real en Chrome
> headless vía CDP (SwiftShader, render por software — números
> conservadores, como en Fases 2 y 4). **Geometría (Node, regla
> EXACTA del cliente):** en el área de render completa (radio 6 =
> 169 chunks, spawn real del mundo), 136 chunks quedan en LOD y 33
> en detalle completo — los conteos del cliente en navegador
> coinciden EXACTAMENTE (33 full + 136 LOD). Triángulos: 234K CON
> LOD vs 560K sin LOD → **reducción del 58%**; un chunk LOD de
> muestra cuesta 367 quads frente a 1638 caras full (78% menos).
> **Memoria de geometría:** 22.8 MB con LOD vs 51.2 MB sin LOD
> (ahorro 55%); presupuesto holgado. **FPS reales (navegador):**
> CON LOD → media 100.5 FPS (estable 136.5, min 52), ~94K
> triángulos renderizados, 54 chunks visibles, heap 48 MB; SIN LOD
> (copia con `lod.js` parcheado, mismo mundo/semilla) → media 24.3
> FPS (estable 30, min 16), ~209K triángulos, heap 85 MB. El LOD
> multiplica por ~4.5 el rendimiento en el anillo lejano dentro de
> la niebla. **Pool:** ciclo carga/descarga real reutiliza la misma
> geometría y el mismo array (0 allocs nuevos), el tope de 24 se
> respeta (el exceso se libera con dispose) y los atributos de
> tamaño distinto crean uno nuevo; en la sesión de navegador el
> pool reutilizó 91 geometrías de 174 creadas (55%).
> **Determinismo:** la geometría LOD de un chunk regenerado es
> idéntica (sin costuras en el caparazón).

### Supervivencia (cerrar el loop)
- [x] Cama: dormir salta la noche y fija el punto de reaparición.
      Nuevo bloque `B.BED = 24` (no sólido — se atraviesa; dureza 0.2:
      se rompe casi al instante; crafteable con 3 lana + 3 tablones,
      receta `bed`). El evento `sleep` valida que sea de noche, que el
      bloque sea una cama y la distancia ≤7: salta al amanecer
      (`state.timeOffset` + broadcast `time_set`, mismo mecanismo que
      `/time set day`), fija `p.respawnPoint` en las coordenadas del
      BLOQUE (los offsets se aplican al reaparecer) y responde
      `sleep_ok`; de día responde `sleep_rejected` (como Minecraft).
      Al morir, `damagePlayer` reaparece en la cama (y+1, ya que no
      es sólida); al romperla se limpia el respawn de los jugadores
      que lo tenían. El cliente coloca la cama (tesela 30-32 del
      atlas: manta roja + almohada), la mina con clic derecho solo
      de noche y muestra el aviso "solo de noche" de día. Cubierto
      por `tests/unit-cama.js` (dormir de noche→amanecer, rechazo de
      día, respawn en la cama, limpieza al romperla, receta)
- [x] Armadura básica (cuero, hierro, diamante) que reduce daño.
      12 ítems (220-231: casco, pechera, pantalones y botas × 3
      materiales) con `ARMOR_DAMAGE_REDUCTION` por pieza (cuero
      0.03-0.08, hierro 0.06-0.12, diamante 0.08-0.16; tope total
      0.8) y `ARMOR_DURABILITY` (cuero 55-80, hierro 165-240,
      diamante 363-528). El jugador tiene 4 slots (`p.armor`, viajan
      en `init` e `inventory_update`); `equip_armor`/`unequip_armor`
      intercambian piezas conservando la durabilidad; el daño
      entrante (`damagePlayer`) se reduce y desgasta las piezas (-1
      por cada 4 de daño bruto; al llegar a 0 se retiran). Las
      piezas no se apilan. Recetas: 12 en `recetas.json` con
      patrones estilo Minecraft (casco 5 piezas, pechera 8, pantalones
      7, botas 4). El cuero (`I.LEATHER = 132`) es drop de la vaca
      y el conejo (`mobDrops` ahora devuelve también los drops no
      comestibles). El cliente pinta los 4 slots en el panel de
      inventario con barra de durabilidad, y equipa con clic derecho
      en la mano. Cubierto por `tests/unit-armadura.js` (reducción
      y desgaste por pieza, tope 0.8, armadura ignorada en inanición,
      equipar/des-equipar con swap, recetas, cuero como drop)

### Terreno
- [x] Minas abandonadas: pasillos generados + cofres de loot.
      En `world.js`: dos familias de túneles horizontales modeladas
      como bandas finas alrededor de las curvas de nivel de dos
      ruidos independientes (`noise2D_ms_a/b`, `MS_BAND = 0.055`),
      limitadas a regiones por una puerta (`noise2D_ms_region`,
      `MS_REGION_GATE = 0.25`). La profundidad es RELATIVA a la
      superficie (`mineshaftDepth(wx, wz, height)` = `height - 1 -
      below` con `below` 3-9 bloques por el ruido `noise2D_ms_depth`;
      fix del bug de diseño original: la profundidad absoluta 6-32
      dejaba los túneles en el aire sobre terrenos bajos y el guard
      `y < height - 1` impedía excavar nada). Se excavan SOLO celdas
      de piedra (preservan minerales y el techo), nunca rompen la
      superficie ni el bedrock, y son continuos entre chunks
      (coordenadas de mundo). Los cofres de loot (`msLootSpot`, hash
      2D determinista ~0.6% de celdas) se colocan en el suelo del
      pasillo y su loot se genera en `chests.js` `lootSlots()`
      (ítems aleatorios: carbón, lingotes, comida, herramientas;
      persistido en `world.json` como los demás cofres). Cubierto
      por `tests/unit-terreno.js` (túneles presentes bajo tierra,
      sin romper superficie/bedrock, determinismo, cofres con loot)
- [x] Pozos de agua/lava en superficie (generación decorativa).
      Charcos de 1 bloque que sustituyen al bloque de superficie con
      lecho de arena debajo; escasos y en regiones permitidas
      (`noise2D_pond_region`/`noise2D_lava` con umbrales CALIBRADOS
      por barrido: agua ~1.05% y lava ~0.42% de columnas — el
      calibrado original (0.94/0.965 sobre un ruido en [-1,1]) nunca
      se superaba y no generaba ni un charco); nunca sobre lagos, ni
      en bocas de cueva, ni donde no quepa el lecho. Nuevo bloque
      `B.LAVA = 25` (no sólido, no minable, sincronizado en el
      cliente con tesela 33 del atlas y material propio con emissive
      que brilla de noche; la física del jugador lo atraviesa y el
      servidor aplica **daño por contacto**: 2 HP cada 500ms en
      `tickPlayer`, la armadura sí protege). Cubierto por
      `tests/unit-terreno.js` (charco con lecho de arena, lava no
      sólida/no minable) y la nueva invariante en `tests/unit-mundo.js`
      (toda el agua por encima de `SEA_LEVEL` es un charco válido:
      superficie + arena + fuera de lago)
- [x] Compresión (gzip) del guardado por chunk: mundos grandes
      ocupan mucho espacio en disco. `writeChunkFile` serializa con
      `zlib.gzipSync` (el JSON de un chunk de 16×64×16 se comprime
      ~20x: en la práctica 281 bytes vs 42 KB en los tests); el
      nombre de archivo no cambia (`.json`) y `readChunkFile`
      detecta la cabecera gzip (0x1f 0x8b) y descomprime — los
      mundos viejos en JSON plano se siguen leyendo SIN migración
      (retrocompatible, sin bump de schema). Cubierto por
      `tests/unit-terreno.js` (cabecera gzip, round-trip idéntico,
      compresión efectiva, JSON plano legible) y el E2E real
      (169 chunks guardados en gzip y recargados sin corrupción)

> **Nota de planificación:** la minería, las 20 herramientas
> crafteables, la mesa de crafteo, el horno y los minerales ya
> están implementados (Fases 0 y 5), por eso esos puntos se
> formulan como *afinado/verificación* y no como features nuevas.
> Tampoco se proponen fases 0.5/1.5 (herramientas de desarrollo y
> optimización previa a texturas): esas fases ya están cerradas,
> así que esas ideas se han movido a este bloque.

---

## Fase 7 — Pulido, UX y estética
*Objetivo: darle al juego un menú principal completo (nombre de
jugador, ajustes, selección/creación de mundos y coordenadas en
pantalla), cerrar el pulido que sobrecargaba la Fase 6 (texturas,
rendimiento, supervivencia, multijugador visible y audio), subir la
estética hacia un look Minecraft y hacer una pasada de caza de
errores.*

### Menú principal: nombre, ajustes y mundos
- [x] **Nombre de jugador**: campo en el menú persistido en
      `localStorage` (`mc_name`, defecto "Jugador-XXXX"). El servidor
      lo recibe con `?name=` en la URL del WebSocket (lo tiene desde el
      `init`) y con el evento `set_name` para cambios posteriores; lo
      sanea (≤16 caracteres, sin caracteres de control). El `init`
      incluye `name`, `player_join`/`player_move`/`player_rename` lo
      propagan y el chat muestra el nombre en lugar del id corto.
      Cubierto por tests en `unit-red.js` (sanidad, default, rename,
      init), por `tests/unit-red.js` y verificado en el playtest de
      cierre de fase
- [x] **Nombres flotantes** sobre los jugadores (tags de texto con
      `THREE.Sprite` de canvas) en `public/mobs.js`; se actualizan con
      `player_rename`. Verificado en el playtest de cierre de fase
- [x] **Ajustes del juego** en `public/settings.js` (persistidos en
      `localStorage` `mc_settings`): distancia de render, FOV,
      sensibilidad del ratón, volumen por categoría, calidad gráfica y
      mostrar coordenadas. Los que afectan al servidor (distancia de
      render) viajan con el evento `settings {renderDistance}` (clamp
      2-10) y se aplican en `ensureChunksAround` (init, move y
      `set_seed`). Completado: el menú de ajustes tiene sliders de FOV
      (50-110), sensibilidad (20-300%), volúmenes por categoría
      (maestro/efectos/ambiente, 0-100%) y un selector de calidad
      (baja/media/alta) que controla pixelRatio y sombras. La lógica
      pura (perfiles de calidad y clamps) vive en `public/quality.js`,
      testeada en `tests/unit-ajustes.js`; audio.js gana gains por
      categoría (`setVolume`) y scene.js `applyQuality`/`setFov`
- [x] **Selección y creación de mundos**: `save.listWorlds()` lee los
      subdirectorios de `world/` (semilla, `lastSaved`, nº de chunks);
      evento `worlds_list`. Menú con lista de mundos (clic → `set_seed`)
      y "crear nuevo mundo" con semilla escrita o aleatoria (🎲). La
      semilla es la identidad del mundo (`world.json` gana un campo
      opcional `name`, lectura defensiva, **sin** subir SCHEMA_VERSION).
      Completado: el menú de mundos muestra la lista (nombre + semilla +
      chunks + fecha), el campo `name` da nombre al mundo nuevo (o
      renombra el activo con la misma semilla) y el botón 🎲 genera una
      semilla aleatoria legible (dos palabras + número) y crea el mundo
      al instante. El `set_seed` acepta `{seed, name?}`; el nombre se
      persiste en `world.json` (los mundos viejos sin `name` usan la
      semilla) y se restaura al cargar. Cubierto por la sección 11b de
      `tests/unit-persistencia.js` (nombre, persistencia, listWorlds,
      renombrado y saneo)
- [x] **Mostrar coordenadas** en pantalla: overlay opcional en el HUD
      (`x, y, z`, actualizado ~10 veces por segundo), activable desde
      los ajustes. Verificado en el playtest de cierre de fase

### Texturas y estética Minecraft
- [x] Texturas procedurales pixel-art para **mobs** (pasivos y
      hostiles) en `public/mobtextures.js` (reemplazan `MOB_COLORS`);
      los meshes se construyen texturizados por cara en `public/mobs.js`
- [x] Iconos de **ítems** en el inventario/HUD (comida, lingotes,
      minerales, herramientas) reemplazando el swatch de color y el
      texto en hotbar/mesa/horno. Completado con `public/itemicons.js`
      (atlas procedural de sprites 16x16 pixel-art en un canvas, misma
      filosofía que `mobtextures.js`): un icono por ítem — bloques con
      bisel y motas (especiales: césped, tronco, hojas, tablones,
      menas, mesa, horno, vidrio, lana, agua, lava, nieve, cofre,
      antorcha, cama, roca madre), comida cruda/cocinada, lingotes,
      gemas, trigo/zanahoria/semillas/hilo/cuero, las 20 herramientas
      y las 12 piezas de armadura (plantillas por forma + color por
      material). El CSS recorta el sprite por posición y
      `image-rendering: pixelated` mantiene el look pixel-art (hotbar
      1.5x, paneles 1x); la lógica de dibujo es PURA (grid de celdas,
      sin canvas ni DOM) y la cubre `tests/unit-itemicons.js`
      (cobertura de todos los ids, determinismo y distinguibilidad)
- [x] Estética Minecraft: cielo con degradado + sol/luna, niebla por
      hora del día, partículas al romper/colocar bloques y HUD/menús
      con estilo Minecraft (todo procedural o CSS, sin assets externos).
      Implementado: `public/skycolors.js` (paleta pura del cielo por
      hora, testeada en `unit-sky.js`) y `public/sky.js` (dome
      procedural con ShaderMaterial: degradado cenit→horizonte, banda
      cálida de amanecer/atardecer, sol/luna opuestos y estrellas de
      noche; sigue a la cámara y no lo afecta la niebla). `daynight.js`
      ahora ajusta la niebla por hora (densa y cercana de noche, clara
      y lejana al mediodía) y actualiza el dome. `public/particles.js`
      emite cubitos del color del bloque al romper (ráfaga con
      gravedad) y al colocar (suave), desde `block_update` en
      `network.js` (cubre jugador local y remoto). `estilo.css` pasa a
      look Minecraft: botones y paneles grises biselados (claro
      arriba/izq, oscuro abajo/der), hotbar con slot activo dorado,
      tipografía monoespaciada con sombras duras, crosshair con
      contorno y paneles de crafteo/horno/cofre estilo piedra

### Supervivencia pulida
- [x] **Daño por caída** (escala con la altura; el servidor infiere el
      suelo desde el mundo y aplica el daño al aterrizar). Implementado
      en `players.js` (`fallDamage`/`applyFallDamage`): en cada `move`
      validado (net.js) el servidor detecta si el jugador está en el aire
      (el bloque bajo los pies no es sólido; `EYE_HEIGHT` compartida con
      el cliente y auditada por `unit-sync.js`) y registra el pico de la
      caída desde el último suelo firme (caminar por un acantilado cuenta
      desde el borde); al aterrizar aplica `floor(bloques) − 3` (1 HP por
      bloque a partir de 3; 23 bloques = muerte), que pasa por la armadura
      y se ignora en creative. El agua anula el daño. Cubierto por
      `tests/unit-caida.js`
- [x] **Morir al caer del mundo** (void): si `y` cae por debajo del
      mundo, el jugador muere y reaparece. `VOID_Y = -8` (servidor): en
      el handler de `move`, si `y < VOID_Y` se llama `respawnPlayer`
      (mismo flujo que la muerte: según gamemode se conserva o pierde el
      inventario; en creative se conserva para no dejar al jugador cayendo
      para siempre). El respawn reenvía el teleport al punto de
      reaparición. Cubierto por `tests/unit-caida.js`
- [x] **Respawn según gamemode**: en survival el inventario se pierde
      al morir; en creative se conserva (la XP/nivel se mantienen).
      Implementado en `damagePlayer` (server/players.js): al morir en
      survival se vacían inventario, armadura y mesa de crafteo (en
      Minecraft caerían al suelo; sin entidades de item se pierden), se
      reenvía `inventory_update` vacío para que el HUD del cliente se
      vacíe y se cierran cofres/hornos abiertos. La XP/nivel se conservan
      siempre. `player_die` ahora incluye `lostInventory` para que el
      cliente matice el aviso. En creative no hay daño: no se pierde
      nada. Cubierto por `tests/unit-respawn.js`

### Rendimiento
- [x] Métrica de tiempo por tick (server + client) para detectar
      cuellos de botella: `__mcServerTickMs`/`__mcChunkGenMs` +
      auditoría
      (el LOD simple y el pool de geometrías ya están hechos en Fase 6).
      Implementado: `mainLoop` (server/net.js) mide el tiempo del tick con
      una media móvil de 1s y hace broadcast de `server_metrics
      {tickMs, chunkGenMs}`; `world.generateChunk` acumula el tiempo de
      generar chunks nuevos (`takeChunkGenMs`, sin contar disco ni
      repetidos). El cliente expone `window.__mcServerTickMs` /
      `__mcChunkGenMs` (network.js) y el HUD F3 los muestra (debug.js).
      `net.getServerMetrics()`/`mainLoop` exportados para tests.
      Cubierto por `tests/unit-metricas.js` (acumulador y reset,
      tick > 0, broadcast server_metrics)

### Multijugador visible
- [x] Animación de rotura de bloque sincronizada: broadcast de
      `block_break_progress` a todos los jugadores en rango; el crack
      del cliente pasa a overlay por-bloque (varios minadores a la vez).
      Implementado: `net.js` gana `broadcastNear` (filtra por distancia
      al bloque, 7 bloques como el alcance de interacción) y un wrapper
      `broadcastMining` que se pasa a `mining.js` en `mainLoop` y en las
      cancelaciones (`break_cancel`, creative y desconexión a mitad de
      mina — si el jugador se va sin terminar, los que veían las grietas
      reciben el stage -1). `public/world.js` pasa de una única caja de
      crack a un overlay POR-BLOQUE (Map por "x,y,z", material clonado
      por grieta): varios jugadores pueden minar a la vez y cada uno ve
      el progreso de los demás; stage -1 y `block_update` ocultan solo
      la grieta de ese bloque. Cubierto por `tests/unit-crack.js`
      (misma secuencia de fases para minero y observador cercano, el
      lejano no recibe nada, cancel y desconexión limpian en rango)

### Caza de errores y auditoría
- [x] Playtest (manual + headless): recolectar bugs en "Bugs conocidos"
      y corregirlos (rendimiento, render, guardado, multijugador).
      ✅ Hecho: el playtest de Fase 7 produjo los 10 bugs documentados en
      "Bugs conocidos" y priorizados en la sección "Fase 8 — Caza de
      bugs" (combate, minería a mano, pérdida de vida sin causa,
      controles, día/noche, tecla E, LOD, estrellas, sol/luna y mobs);
      la auditoría de la fase (`audit-fase7.js`) verifica tick de
      servidor, FPS en Chrome headless e integridad del guardado tras
      reinicios, y la pasada de limpieza de código muerto dejó biome a
      0 errores. Los bugs de la fase quedan pendientes de corregir en
      la Fase 8 (ver su sección)
- [x] **Auditoría de Fase 7:** métricas de tick del servidor y FPS en
      Chrome headless (CDP), integridad del guardado tras varios
      reinicios, limpieza de código muerto y regresión de fases 0-6.
      Implementado en `tests/audit-fase7.js` (herramienta reutilizable):
      (1) lanza su propio servidor desechable (PORT=3999, SEED=auditFase7,
      se limpia solo) y su propio Chrome headless con SwiftShader
      (render por software, flags anti-throttling, viewport pequeño) y
      lee `window.__mcServerTickMs/__mcChunkGenMs/__mcFps/__mcChunks`
      durante ~6 s: exige tick medio < 100 ms (≈20 TPS; sano 1-10 ms),
      generación < 100 ms y bucle de render vivo (los FPS de SwiftShader
      son conservadores y se imprimen en el informe); (2) integridad del
      guardado: genera un mundo en directorio temporal, lo persiste
      completo (25 chunks), simula DOS reinicios (limpiar estado +
      `loadWorld`) y verifica que los bloques modificados (cofre,
      antorcha, rotura), el conteo de chunks y los archivos sobreviven
      byte a byte (re-guardar produce archivos idénticos). Uso:
      `node tests/audit-fase7.js` (con `--regresion` lanza además la
      suite unitaria de fases 0-6). Medido el 2026-08-05: tick 1.0 ms ·
      gen 0.0 ms · 169 chunks · 68 visibles · 108k tris. La limpieza de
      código muerto se completó (pasada de caza de errores): eliminados
      `sendToClient` (net.js), `getRenderDistance` (world.js),
      `itemColor` + `FOOD_COLORS`/`BREED_COLORS`/`ARMOR_COLORS`
      (constants.js) y variables de import sin usar en los tests;
      biome del repo completo a 0 errores
- [x] Actualizar `README.md` (protocolo WS: `set_name`, `settings`,
      `worlds_list`, `player_rename`, `block_break_progress` en
      broadcast, `init` con `name`). ✅ Hecho: el README documenta el
      estado completo (Fases 0-7 implementadas, Fase 8 en curso), el
      protocolo con los eventos de Fase 7 (`set_name`, `settings`,
      `player_rename`, `init` con `name` y chunks limitados al radio de
      render) y la sección de resultados. Las guías (`CLAUDE.md`/
      `AGENTS.md`) no cambiaron de convenciones en esta fase (sin
      cambios necesarios)

---

## Fase 8 — Caza de bugs (corrección de errores)

Fase centrada en **identificar y corregir los errores reportados** por el
usuario (playtest). La especificación completa vive en
[`fase8-spec.md`](fase8-spec.md) (diagnóstico por bug, archivos implicados y
criterios de aceptación). Resumen de la priorización:

**Hallazgo transversal:** los bugs bloqueantes están encadenados — el
jugador nace con vida/comida llenas (la pérdida de vida no es hambre), los
mobs hostiles atacan cerca del spawn y, como el raycast de mobs falla y no
se puede minar, el jugador no puede defenderse ni progresar. Corregir
combate (B10) y minería (B3) puede resolver la pérdida de vida (B2) sin un
fix propio (el diagnóstico debe confirmarlo).

### Bloque A — Bugs bloqueantes (hacen el juego injugable)

- [x] **B10: imposible luchar contra los mobs hostiles (no se puede ni
      apuntar).** ✅ **Diagnóstico**: el servidor funcionaba (unit-red lo
      verificaba), el problema era cliente+protocolo: (1) **rango
      descartado en silencio** — el rayo del cliente llegaba a 7 bloques
      (`raycaster.far = 7` en `input.js`) pero `attack_mob` rechazaba a
      >4 sin respuesta; (2) **cero feedback de daño** — no existía
      `mob_hit`, ni flash, ni sonido, ni knockback (con la mano, 2 HP
      vs zombie 20 HP = 10 golpes sin reacción); (3) **apuntado
      estricto** — si el rayo rozaba el terreno, el bloque ganaba al
      mob. **Fix**: `attack_mob` acepta hasta 7 bloques y hace
      `broadcast("mob_hit", { id, dmg, health })` + knockback del mob
      (0.6 bloques en dirección contraria, replicado vía `mobs_update`)
      (`server/net.js`); `playHit()` (audio.js); `flashMob(id)` — tinte
      rojo breve que restaura el color previo (mobs.js); `case
      "mob_hit"` → flash+sonido (network.js); tolerancia de apuntado en
      `input.js`: si el rayo golpea terreno pero hay un mob a <1.5
      bloques del impacto, golpea el mob. Regresión ampliada en
      `unit-red.js` (rango 7, `mob_hit`, knockback).
- [x] **B3: imposible minar a mano (el clic no inicia la mina).** ✅
      **Diagnóstico**: el servidor funcionaba de punta a punta
      (`e2e-durabilidad.js` rompe 60 bloques vía WS y pasa); el bug era
      del **cliente**: el geometry pool (`geopool.js`) reutiliza
      `BufferGeometry` y `setOrReuseAttribute` muta los arrays de
      attributes EN SU LUGAR (`.set()` + `needsUpdate`, sin llamar a
      `setAttribute`), así que los `boundingBox`/`boundingSphere`
      cacheados de three quedaban **obsoletos** (del chunk anterior que
      usó esa geometría). `Mesh.raycast` de three r160 rechaza el rayo
      contra esa esfera vieja → `raycastTerrainAndMobs()` devolvía
      `null` → `if (!hit) return` → el clic no hacía nada (ni minar, ni
      atacar a mobs de pie en esos chunks). Reproducido con three real
      (0 hits hacia el bloque; esfera centrada en el chunk anterior).
      **Fix**: `geopool.js` `release()` nullea `boundingBox`/
      `boundingSphere` al liberar → el siguiente acquire los recalcula
      de forma perezosa con datos nuevos (sin coste por build).
      Además, `computeChunkSphere` (frustum culling) usa la caja
      cacheada vía `expandByObject`, así que el mismo fix corrige el
      culling erróneo (relacionado con B6). Regresión nueva
      `unit-raycast.js` (three real como devDependency, mismo 0.160 del
      importmap): pool real + raycast acierta tras reutilizar +
      mecanismo del bug documentado (0 hits sin fix). Drops a mano de
      bloques básicos: ya los daba `canHarvest` (tierra/césped/arena/
      madera/hojas); piedra/minerales siguen requiriendo pico.
      Regresión: `unit-raycast.js`, `unit-geopool.js`, `unit-mineria.js`,
      `e2e-durabilidad.js`.
- [x] **B2: pierdes vida constantemente sin causa (mueres en pocos
      segundos).** ✅ **Diagnóstico CONFIRMADO (reproducción en vivo con
      la telemetría `damage_debug`)**: la causa son los **mobs hostiles
      cerca del spawn** — no lava, no caída, no hambre (comida llena).
      Evidencia: (1) `tests/diag-b2.js` conectó un cliente AFK al
      servidor vivo: a los ~60s un **zombi** (id 519521) entró en rango
      y atacó **2 HP cada ~1s** (9 golpes / 18 HP en ~15s → muerte en
      ~10s más) con la comida llena; (2) escaneo del mundo: **0 lava/0
      agua a ≤10 bloques del spawn** y **5 hostiles a <40 bloques**
      (zombi a 3 bloques); de noche además spawnean hostiles a ≥24
      bloques que convergen al jugador. **Fix (validado con el usuario:
      AMBOS)**: (a) **zona segura de spawn** (`mobs.js`
      `spawnSafeRadius = 32`, configurable): los hostiles no spawnean
      dentro del radio y `findNearestPlayer` no targetea a jugadores
      dentro (al salir del radio vuelven a ser objetivo); (b) **gracia
      inicial** (`SPAWN_GRACE_MS = 30000` en constants.js): al entrar y
      al reaparecer, 30s sin daño de MOBS (lava/caída/hambre siguen
      doliendo). **Verificado en vivo**: diag-b2.js tras el fix → 45s
      AFK con 0 daños y vida 20 (antes 2 HP/s). Regresión:
      `unit-mobs-ia.js` (bloque 13: zona segura — no targeteo dentro,
      spawn hostil rechazado en el radio), `unit-damage.js` (bloque 8:
      gracia bloquea daño de mob, lava no, expira y aplica), suite
      completa. Herramienta: `tests/diag-b2.js` (WS_URL/DURATION).

### Bloque B — Correcciones de mecánica

- [x] **B1: controles izquierda/derecha invertidos + opción "Controles
      invertidos".** ✅ **Causa**: en `public/player.js` el vector lateral
      se calculaba como `crossVectors(forward, up).negate()` — pero en
      Three.js (mano derecha, Y arriba) `cross(forward, up)` ya apunta a
      la derecha, así que el `.negate()` invertía el eje y A/D quedaban
      intercambiados. **Fix**: se eliminó el `.negate()` (A → izquierda,
      D → derecha) y se añadió el ajuste `invertControls` (default
      `false`) en `public/settings.js` + toggle "Controles invertidos
      (A/D)" en el menú de Ajustes (`index.html`/`ui.js`), persistido en
      `localStorage` y aplicado en tiempo real (player.js lo lee cada
      frame con `getSetting`). Con la opción activa, A↔D se invierten
      para quien lo prefiera.
- [x] **B4: ciclo día/noche a 20 minutos (como Minecraft).** ✅
      `DAY_CYCLE_MS` cambiado de `240000` (4 min) a `1200000` (20 min)
      en AMBOS `constants.js` (servidor y cliente — lo verifica
      `unit-sync.js`). Distribución: 50/50 (~10 min día, ~10 min
      noche, como el 43% de noche de Minecraft con su 1.5+7+1.5 de
      atardecer/noche/amanecer); el atardecer/amanecer se renderizan
      suaves por la curva de fase sinusoidal del cliente (`daynight.js`
      `currentPhase`), que ahora abarca 20 min. Todos los usos del
      ciclo son relativos (`worldTime() % DAY_CYCLE_MS`, fracciones en
      `/time` y en dormir/mobs), así que escalan solos; regresión
      verde: `unit-sync`, `unit-cama`, `unit-commands`, `unit-red`.
      Nota: si se quiere la distribución exacta por ventanas de
      Minecraft (10/1.5/7/1.5 con gate de spawn en la ventana de
      noche), sería un cambio de fase por tramos — no requerido aquí.
- [x] **B5: la tecla E siempre abre el inventario.** ✅ `isChatFocused()`
      (solo miraba el chat) sustituida por `isTyping()` en `ui.js`:
      devuelve true si `document.activeElement` es `INPUT`/`TEXTAREA`/
      `SELECT`/contenteditable (cubre chat, nombre de jugador/mundo,
      semilla). El `keydown` de `input.js` retorna antes de procesar
      cualquier tecla de juego (E, WASD, 1-9, F3, Espacio) cuando hay
      un campo editable enfocado. El chat no se rompe (`#chat-input` es
      un INPUT y conserva su propio handler de Enter en `ui.js`);
      `isChatFocused` quedó sin usos y se eliminó.

### Bloque C — Estética y rendimiento

- [x] **B7: estrellas visibles de día.** En `public/sky.js` las
      estrellas se pintan con `uStars = (1 - dayFactor) * 0.9` y
      `dir.y > 0.05`: aparecen en amanecer/atardecer. **Corregir**:
      dibujar estrellas solo cuando el sol está bajo el horizonte
      (posición vertical real del sol, no `dayFactor`), con fade suave;
      0 estrellas en crepúsculo.
      **Resultado:** `updateSky` ahora calcula `uStars` con la ALTURA
      VERTICAL REAL del sol (`sun.y`, de `celestialDirs`):
      `clamp((-sun.y - 0.02) / 0.12, 0, 1) * 0.9` — 0 estrellas en cuanto
      el sol asoma sobre el horizonte (ni en amanecer ni en atardecer),
      fade corto de ~7° para que la aparición nocturna no parpadee.
- [x] **B8: el sol y la luna se ven iguales → sol más amarillo + fases
      lunares.** El shader de `sky.js` ya diferencia sutilmente (sol
      cálido `vec3(1.0,0.96,0.85)`, luna fría `vec3(0.92,0.95,1.0)`);
      la luna es siempre disco lleno. **Corregir**: sol más amarillo
      (subir R/G, bajar B; también `DAY_SUN` en `daynight.js`), luna
      más blanca/azulada y con **fases**: diseño completo en
      [`fase8-spec.md`](fase8-spec.md) §B8 — derivación determinista
      desde la semilla (`seedMoonOffsetMs` + `moonPhase(state)` sobre el
      reloj `worldTime()` de commands.js, offset de semilla persistente),
      ciclo de **8 días de juego** (`MOON_CYCLE_MS = DAY_CYCLE_MS * 8`),
      sincronización por `init`/`time_set` (campo `moonTime`, el cliente
      extrapola con `currentMoonPhase()` con el mismo `elapsed` que el
      día) y **máscara de fase en el shader** de `sky.js` (uniform
      `uMoonPhase`, terminación que barre el disco con `litEdge`/
      `moonSide`, parte oscura azulada + halo). Test: `tests/unit-luna.js`
      (determinismo por semilla, ciclo exacto de 8×, `/time set`
      coherente).
      **Resultado:** implementado según el spec — sol AMARILLO
      (`vec3(1.0, 0.86, 0.45)` + halo dorado en el shader, `DAY_SUN =
      0xffe08a` en daynight.js), luna blanca/azulada con máscara de fase
      (uniform `uMoonPhase`, terminación `litEdge = cos(phase·2π)` que
      barre el disco, parte oscura azulada visible en menguante),
      `MOON_DAYS = 8` / `MOON_CYCLE_MS = DAY_CYCLE_MS * 8` en ambos
      constants (paridad auditada por `unit-sync`), `seedMoonOffsetMs`
      + `moonTime(state)` en commands.js, campo `moonTime` en el `init`
      y en los broadcasts de `time_set` (commands.js y dormir en
      net.js), y `currentMoonPhase()` en daynight.js que extrapola con
      el mismo `elapsed` que el día. Verificado en vivo con
      `tests/diag-moon.js` (init trae moonTime en rango y `/time set`
      re-sincroniza) y determinismo/ciclo en `unit-commands.js`.
- [x] **B9: los mobs son cajas rectangulares → formas multibloque estilo
      Minecraft.** Hoy cada mob es UN `BoxGeometry(0.6, 1.8, 0.6)` con
      texturas por cara (`public/mobs.js` + `mobtextures.js`).
      **Corregir**: rediseñar como **grupo de partes** con el esquema
      `MOB_PARTS` — tabla de dimensiones por parte y especie (zombi/
      esqueleto humanoide, enderman alto, creeper con patas, araña con
      8 patas, conejo con orejas, cuadrúpedos, pollo) y atlas por parte
      (una tesela 16×16 por parte en vez del atlas 2x2 de una tesela) —
      diseño completo en [`fase8-spec.md`](fase8-spec.md) §B9. Mantener:
      quema solar (un material compartido), escala por tipo, `isBaby` a
      media escala, raycast de ataque (CRÍTICO: con grupo de partes hay
      que intersectar los hijos y subir al raíz por `userData.mobId`),
      etiquetas de nombre, snapshots. Aplicar el mismo esquema (o
      mejorar) a los jugadores remotos.
      **Resultado:** implementado según el spec — `MOB_PARTS` exportado
      desde `mobtextures.js` con las 11 especies (humanoides, enderman
      alto 2.55, creeper con 4 patas, araña con 8 patas rotadas, conejo
      con orejas, cuadrúpedos alargados, pollo), atlas de UNA FILA (una
      tesela 16×16 por parte única; `mobPartRects(type)` reemplaza a
      `mobFaceRects`) y funciones de dibujo por parte que conservan las
      paletas y motivos. `mobs.js` construye un `THREE.Group` con un
      mesh por parte (UVs remapeados a su tesela), UN material
      compartido (`userData.material`) para quema solar/flash intactos,
      y los jugadores remotos también son multibloque (silueta
      humanoide con color plano). `input.js`: el raycast intersecta con
      `recursive=true` y `mobRootData()` sube del hijo golpeado al raíz
      con `mobId` — regresión B10 cubierta por `tests/unit-mobray.js`
      (nuevo, three real: el rayo acierta las partes, sube al raíz, el
      bloque delante gana a la minería y un grupo vacío no intercepta).
      Registrado en `tests/run.js`.
- [x] **B6: chunks lejanos con texturas "disminuidas" que no se
      restauran al acercarse (o transparentes).** El LOD
      (`lod.js`: `LOD_ON_DIST 56` / `LOD_OFF_DIST 44`, histéresis)
      debería reconstruir a detalle completo al acercarse; no lo hace.
      **Corregir SOLO el LOD** (decisión del usuario: no bajar el
      renderDistance por defecto): diagnosticar la transición
      LOD→full en `public/world.js` (distancia al centro del chunk,
      bucle que no reevalúa, geometría LOD que no se elimina o material
      sin atlas) y que el chunk reconstruya con texturas completas al
      cruzar el umbral. Reproducción visual (F3/`window.__mc*`,
      playtest headless); regresión: `unit-lod.js`.
      **Resultado:** la lógica de transición LOD→full era CORRECTA
      (`updateLod` con throttle 250ms, `lodTierFor` con histéresis,
      `rebuildChunk` elimina el LOD y reconstruye full). El síntoma
      "transparente / sin texturas" lo causaba el MISMO bug de B3: el
      geometry pool reutilizaba `BufferGeometry` con
      `boundingBox`/`boundingSphere` obsoletos del chunk anterior, y
      `computeChunkSphere` (world.js) usa `Box3.expandByObject`, que en
      three r160 SOLO recalcula `geometry.boundingBox` si es `null` → la
      esfera de culling quedaba en la posición del chunk anterior → el
      frustum ocultaba el chunk (visible=false) → se veía transparente o
      con la textura LOD "congelada". El fix de B3 (`release()` nullea
      los bounds) resuelve también B6. Verificado con three real en
      `tests/unit-raycast.js` sección 4 (expandByObject recalcula la caja
      con datos nuevos tras reutilizar; sin el fix usa la obsoleta) y
      métrica nueva `window.__mcLodChunks` (player.js) para el split
      LOD/full en F3.

### Bloque D — Verificación final

- [x] Suite completa de tests (unitarios + E2E + auditorías) y playtest
      manual de los 10 bugs; `biome check` 0 errores en los archivos
      tocados; documentar en "Bugs conocidos" los bugs corregidos y
      marcar esta sección.
      **Resultado:** los 10 bugs (B1-B10) están corregidos y documentados
      en "Bugs conocidos" con su causa raíz y fix. Verificación: suite
      unitaria completa `node tests/run.js --unit` exit=0 (11 grupos,
      incluidos `unit-raycast`, `unit-mobray` nuevos), E2E contra
      servidor vivo (`e2e-comer`, `e2e-cofre`, `e2e-durabilidad`,
      `e2e-reload`) exit=0, auditorías de fase 3-6 exit=0, `biome check
      server/ public/ tests/` **0 errores** (23 warnings de resúmenes de
      tests con la convención biome-ignore del proyecto) y `node --check`
      en todo `public/`. El playtest visual en navegador quedó
      pendiente por indisponibilidad del agente de navegación (la
      verificación del render de mobs multibloque y del cielo se hizo
      con tests de three real + métricas `window.__mc*`).

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
- [x] **Transiciones de bioma bruscas y cuevas sin comunicación con
      la superficie.** Antes: `getBiome()` cortaba entre biomas por
      umbrales discretos (acantilados de 4-8 bloques al cruzar una
      frontera) y las cuevas no rompían la superficie a propósito
      (`y < height - 2`). Corregido en `world.js` con un **blend
      continuo**: las alturas se interpolan con afinidades gaussianas
      por temperatura (`FLAT_AFFINITY`) + una rampa suave de montaña
      (`MOUNTAIN_RAMP`, `heightFrom`), de modo que cruzar un bioma
      sube/baja el terreno gradualmente (salto máximo entre columnas
      adyacentes: 1 bloque, medido por barrido); la superficie
      conserva la etiqueta dominante (nieve/roca/arena/césped) con
      fronteras onduladas (jitter de ruido determinista en los
      umbrales, `surfaceBlockFor`). Las **cuevas ahora abren bocas
      hacia la superficie**: cerca del techo el umbral sube (túneles
      que se estrechan, `isCaveBlock nearSurface`) y un pico de ruido
      extremo abre el bloque de superficie (~1% de columnas, siempre
      con la capa inferior excavada — entradas reales, sin hoyos
      aislados). Aplica a chunks NUEVOS (los guardados conservan su
      mundo). Cubierto por `tests/unit-mundo.js` (bocas presentes y
      escasas, < 10% de columnas con hueco) y `tests/unit-biomas.js`
      (altura continua entre columnas adyacentes: salto máx ≤ 4)
- [x] **audit-fase5.js no se podía ejecutar: ruta rota de `net.js`.**
      La auditoría de la Fase 5 leía `path.join(ROOT, "net.js")` pero el
      servidor vive en `server/` desde el refactor de la Fase 6 →
      `ENOENT` al ejecutarla (exit 1, silencioso). **Corregido**: apunta
      a `server/net.js` y vuelve a pasar.
- [x] **E2E frágiles contra un mundo ya usado (diagnóstico añadido).**
      Los E2E (`e2e-comer`, `e2e-durabilidad`, `e2e-reload`, `e2e-cofre`)
      modifican el mundo (rompen bloques, el autosave los persiste) y
      dependen del estado del área de spawn: contra un mundo fresco
      pasan (verificado: `e2e-cofre` 12/12), pero al re-ejecutarlos
      contra el mismo mundo pueden agotar su timeout interno y fallar.
      **Corregido**: el timer de los 4 E2E ahora imprime la fase y el
      estado de los checks al expirar (antes moría sin decir nada, difícil
      de diagnosticar). Recomendación documentada en el propio código:
      ejecutarlos contra un servidor desechable (`SEED` nueva).
- [~] **Falso positivo de la auditoría: los comandos NO se retransmiten
      al chat global.** Se creyó que el broadcast de `chat` se ejecutaba
      también para los comandos, pero el handler ya tiene `break` dentro
      del `if (message.startsWith("/"))` — solo el chat normal se
      transmite. Sin corrección necesaria; queda documentado para no
      reintroducirlo al tocar `net.js`.
- [x] **Comandos de operador sin restricción: cualquiera podía usar
      `/gamemode`, `/give`, `/tp`, `/time` y `/reload`.** En MP eso era
      trampa y griefing total (darse todo en creative, teletransportar a
      otros, cambiar la hora del mundo para todos, recargar el servidor).
      **Corregido**: gate de operador (`OP_ONLY` en `server/commands.js`):
      solo los jugadores con `isOp` pueden ejecutarlos; el primer jugador
      en conectar es operador por defecto y el resto se configura con la
      env var `OPS` (nombres separados por comas) o con el nuevo comando
      `/op <nombre>` (solo operadores). `net.js` marca `isOp` en el
      jugador al conectar y el rechazo avisa por chat (`Puede usar
      /op <nombre>`). Cubierto por `tests/unit-commands.js` (gate,
      rechazo a no-op, `/op` da y quita permisos solo desde un op).
- [x] **`furnace_open`/`furnace_action` sin validación de distancia: un
      jugador podía abrir y operar cualquier horno del mundo desde
      cualquier distancia** (meter items en hornos lejanos que quedaban
      atascados y vaciarlos a distancia). `chest_open` sí validaba 7
      bloques. **Corregido**: mismo check de alcance (7 bloques) en
      `furnace_open` y `furnace_action` revalida contra el bloque
      real y el `openFurnace` del jugador. Cubierto por
      `tests/unit-red.js` (abrir un horno a 20 bloques se rechaza,
      operar el horno de otro se rechaza).
- [x] **`sendInit` reenviaba TODOS los chunks del mundo a cada conexión**
      (~13 MB de JSON con 795 chunks, creciendo con el mundo y con los
      jugadores; los joins eran lentos). **Corregido**: el `init` solo
      incluye los chunks dentro del radio de render del jugador
      (Chebyshev en chunks, como el filtro del cliente); los que faltan
      llegan con `chunks_add` al moverse (handler `move`). Cubierto por
      `tests/unit-red.js` (el init de un jugador con renderDistance 2
      solo trae los chunks del radio 2, no el mundo entero).
- [x] **El creeper destruía bedrock, agua, lava y cofres (con todo su
      contenido).** La explosión (`explode()` en `server/mobs.js`)
      convertía a aire cualquier bloque del radio 2 sin excepción:
      podía borrar la roca madre (irrompible en Minecraft), charcos de
      agua/lava y cofres — y como no hay entidades de item en el suelo
      (simplificación documentada), el loot se perdía para siempre.
      **Corregido**: la explosión respeta `NOT_MINEABLE` (bedrock,
      agua, lava) y no rompe cofres CON contenido (su estado en
      `state.chests` se conserva); un cofre vacío sí se rompe y se
      limpia su estado (mismo patrón que `finishMining`) para no dejar
      entradas huérfanas en la persistencia. Cubierto por
      `tests/unit-mobs-ia.js` (sección 5b: bedrock/agua/lava/cofre con
      contenido intactos, cofre vacío roto con estado limpio).
- [x] **Fase 8 (B1): los controles A/D estaban invertidos y no había
      opción de jugar invertido.** El `movement.x` del `mousedown`/
      `keydown` de `input.js` sumaba `+1` con A (izquierda) y `-1` con
      D (derecha), moviendo al jugador al revés (A iba a la derecha).
      Corregido el signo y añadida la opción **"Controles invertidos"**
      en Ajustes (persistida en localStorage, aplica a A/D y W/S).
- [x] **Fase 8 (B2): pérdida constante de vida (muerte cada pocos
      segundos).** Diagnosticado con la telemetría `damage_debug` en
      vivo (`tests/diag-b2.js`): un zombi atacaba 2 HP/s en el spawn
      (9 golpes / 18 HP en ~15s con comida llena; los valores impares
      eran la regeneración, no otra fuente). Escaneo del mundo: 0
      lava/agua cerca del spawn y 5 hostiles a <40 bloques (zombi a 3
      bloques). **Causa: hostiles cerca del spawn sin zona segura.**
      Corregido con **doble fix** (decisión del usuario: ambos): (1)
      **zona segura de spawn** — `SPAWN_SAFE_RADIUS = 32` configurable
      en `mobs.js`: los hostiles no spawnean dentro del radio y
      `findNearestPlayer` no los targetea (al salir vuelven a ser
      objetivo); (2) **gracia inicial** — `SPAWN_GRACE_MS = 30000` al
      entrar/reaparecer: `damagePlayer` ignora daño de mobs (lava,
      caída y hambre siguen doliendo). Verificado en vivo (45s AFK sin
      daño) y por `unit-mobs-ia` (bloque 13) y `unit-damage` (bloque
      8).
- [x] **Fase 8 (B3): imposible minar a mano (ningún bloque daba
      items).** El flujo de mina (cliente→servidor) funcionaba
      (`e2e-durabilidad` rompía 60 bloques), el bug era del CLIENTE: el
      geometry pool (`geopool.js`) reutiliza `BufferGeometry` y
      `setOrReuseAttribute` muta los arrays en su lugar (`.set()` +
      `needsUpdate`, sin `setAttribute`), dejando los
      `boundingBox`/`boundingSphere` cacheados de three con los datos
      del chunk ANTERIOR. `Mesh.raycast` (three r160) rechaza el rayo
      contra esa esfera obsoleta → `raycastTerrainAndMobs()` devolvía
      `null` → el clic no hacía nada. **Fix**: `release()` nullea los
      bounds (recompute perezoso con datos nuevos, coste O(1)).
      Reproducido con three real y cubierto por `tests/unit-raycast.js`
      (nuevo, devDependency three@0.160.0 la del importmap). Los drops
      a mano de bloques básicos ya los daba `canHarvest` (sin cambios).
- [x] **Fase 8 (B4): el ciclo día/noche duraba 4 minutos (Minecraft:
      20).** `DAY_CYCLE_MS` 240000 → 1200000 en ambos `constants.js`
      (servidor y cliente, paridad auditada por `unit-sync`). Todos
      los usos son relativos al ciclo (`worldTime % DAY_CYCLE_MS`,
      `/time`, dormir, spawn de hostiles) y escalan solos: ~10 min de
      día y ~10 de noche reales, con atardecer/amanecer suaves.
- [x] **Fase 8 (B5): la tecla E abría el inventario incluso al escribir
      en inputs (nombre de jugador/mundo).** `isChatFocused()` (solo
      miraba el chat) se sustituyó por `isTyping()` en `ui.js`: con
      un campo editable enfocado (INPUT/TEXTAREA/SELECT/contenteditable)
      las teclas de juego (E, WASD, 1-9, F3, Espacio) quedan inertes.
      El chat conserva su handler de Enter; `isChatFocused` quedó sin
      usos y se eliminó.
- [x] **Fase 8 (B6): chunks lejanos con texturas "disminuidas" que no
      se restauraban al acercarse (o transparentes).** La transición
      LOD→full era correcta (`updateLod` 250ms + histéresis +
      `rebuildChunk`); el síntoma transparente lo causaba el MISMO bug
      de B3: `computeChunkSphere` usa `Box3.expandByObject`, que solo
      recalcula `geometry.boundingBox` si es `null` → la esfera de
      culling quedaba en el chunk anterior y el frustum ocultaba el
      chunk. El fix de B3 (nullear bounds en `release()`) resuelve
      también B6. Verificado en `tests/unit-raycast.js` sección 4 y
      con la métrica `window.__mcLodChunks` (split LOD/full en F3).
- [x] **Fase 8 (B7): las estrellas se veían de día.** `uStars` se
      calculaba con `(1-dayFactor)*0.9` (dayFactor = sin de la fase),
      dejando estrellas en amanecer/atardecer y de día. Corregido:
      `updateSky` usa la ALTURA VERTICAL REAL del sol (`sun.y` de
      `celestialDirs`): `clamp((-sun.y - 0.02)/0.12, 0, 1)*0.9` — 0
      estrellas en cuanto el sol asoma, con fade corto de ~7°.
- [x] **Fase 8 (B8): sol y luna se veían iguales; la luna sin fases.**
      Sol AMARILLO (shader `vec3(1.0,0.86,0.45)` + halo dorado,
      `DAY_SUN = 0xffe08a`) y luna blanca/azulada con **fases**: ciclo
      de 8 días (`MOON_DAYS=8`, `MOON_CYCLE_MS = DAY_CYCLE_MS*8` en
      ambos constants, paridad en `unit-sync`), derivación determinista
      desde la semilla (`seedMoonOffsetMs` + `moonTime(state)` en
      `commands.js`), `moonTime` en el `init` y en los broadcasts de
      `time_set`, `currentMoonPhase()` en `daynight.js` (mismo `elapsed`
      que el día) y máscara de fase en el shader (`uMoonPhase`,
      `litEdge = cos(phase·2π)`, parte oscura azulada). Verificado en
      vivo con `tests/diag-moon.js` y determinismo en `unit-commands`.
- [x] **Fase 8 (B9): los mobs eran cajas rectangulares.** Rediseñados
      como **grupos multibloque** (`MOB_PARTS` en `mobtextures.js`,
      11 especies con dimensiones por parte: humanoides, enderman
      alto, creeper con 4 patas, araña con 8 patas rotadas, conejo con
      orejas, cuadrúpedos, pollo) con atlas de una fila (tesela 16×16
      por parte, `mobPartRects` reemplaza a `mobFaceRects`). `mobs.js`
      construye `THREE.Group` con un mesh por parte y UN material
      compartido (quema solar/flash intactos); los jugadores remotos
      también son multibloque. `input.js`: raycast con `recursive=true`
      y `mobRootData()` sube del hijo golpeado al raíz con `mobId`.
      Cubierto por `tests/unit-mobray.js` (three real).
- [x] **Fase 8 (B10): imposible luchar con los mobs hostiles (la mano
      no producía efecto).** Diagnosticado y corregido antes de la
      Fase 8: (1) el raycast de ataque fallaba por el mismo bug de
      bounds obsoletos del pool (B3) y por el rango: el cliente raycast
      a 7 bloques pero el servidor rechazaba ataques a >4 — alineado a
      7; (2) tolerancia de apuntado (`nearestMobOnRay`, desviación
      lateral ≤0.75) para golpear al mob aunque el terreno gane el
      rayo; (3) la mano hace 2 de daño (ya lo hacía), con flash de
      daño (`mob_hit`) y sonido como feedback.
- [~] **Limitación conocida del anti-cheat: se puede volar (y caer sin
      daño) con un cliente modificado.** El handler `move` de `net.js`
      valida la velocidad (≤1.2 bloques por move, con teleport de
      vuelta al último punto aceptado), la colisión con sólidos y el
      void, pero NO valida la física del movimiento: el servidor
      confía en los `move` que envía el cliente, así que un cliente
      alterado puede subir `y+1` por move (≈24 bloques/s, muy por
      encima del salto normal) y "volar", o bajar sin recibir daño de
      caída (el daño de caída se infiere de los moves recibidos, no de
      la velocidad real). Es una limitación inherente al diseño
      cliente-servidor de este juego (sin física simulada en el
      servidor). **Mitigación actual**: el límite de velocidad limita
      el daño (no se puede teletransportar, solo "volar" lentamente) y
      los sólidos bloquean. **Mejora posible** (no planificada):
      validar el ascenso contra la parábola del salto (gravedad +
      velocidad inicial) y calcular el daño de caída con la velocidad
      vertical inferida.
- [~] **Limitación conocida: el servidor WS no fija `maxPayload`.**
      `new WebSocket.Server({ server })` en `net.js` no configura el
      límite de tamaño de mensaje entrante (la librería `ws` aplica su
      default de ~100 MiB). Los mensajes reales del protocolo son
      pequeños (moves, chat con máx. 200 chars, `chunkData`), así que
      un límite explícito de ~1-4 MiB (o menos) bastaría para impedir
      que un cliente malicioso sature la memoria del servidor con
      mensajes gigantes. **Mejora posible** (no planificada):
      `new WebSocket.Server({ server, maxPayload: <n> })` — un tamaño
      por encima del `init`/`chunks_add` más grande del radio de
      render.

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
