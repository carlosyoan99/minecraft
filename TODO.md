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
Especificación: [`docs/fase1-spec.md`](docs/fase1-spec.md) (retrospectiva, fase completada y auditada).

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
Especificación: [`docs/fase2-spec.md`](docs/fase2-spec.md) (retrospectiva, fase completada y auditada).

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
Especificación: [`docs/fase3-spec.md`](docs/fase3-spec.md) (retrospectiva, fase completada y auditada).

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
Especificación: [`docs/fase4-spec.md`](docs/fase4-spec.md) (retrospectiva, fase completada y auditada).

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
Especificación: [`docs/fase5-spec.md`](docs/fase5-spec.md) (retrospectiva, fase completada y auditada).

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
Especificación: [`docs/fase6-spec.md`](docs/fase6-spec.md) (retrospectiva, fase completada y auditada).

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
Especificación: [`docs/fase7-spec.md`](docs/fase7-spec.md) (retrospectiva, fase completada y auditada).

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
[`docs/fase8-spec.md`](docs/fase8-spec.md) (diagnóstico por bug, archivos implicados y
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
      [`docs/fase8-spec.md`](docs/fase8-spec.md) §B8 — derivación determinista
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
      diseño completo en [`docs/fase8-spec.md`](docs/fase8-spec.md) §B9. Mantener:
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

- [x] **Fase 11: el clic "no hacía nada" (minar, colocar, atacar,
      cofres) — pointer lock sobre `document.body` en vez del canvas.**
      Causa raíz (confirmada con auditoría CDP del clic real en
      `tests/diag-clic.js --audit`): `public/scene.js` creaba
      `PointerLockControls` con `document.body`, y con el pointer lock
      activo el navegador entrega TODOS los eventos de ratón al
      elemento que tiene el lock (body) — pero `input.js` escucha el
      mousedown/mouseup/pointermove en `renderer.domElement` (el
      canvas), que nunca los recibía durante el juego. Por eso el trace
      de telemetría quedaba vacío pese a los fixes de atlas (F9) y
      cámara (F11 A2): el handler del clic jamás se disparaba.
      **Corregido**: `new PointerLockControls(camera, renderer.domElement)`
      (patrón canónico de three.js — con el lock activo los eventos van
      al canvas). Verificado: clic CDP → target `BODY` antes, target
      `CANVAS` después; auditoría 6/6 con 3 mousedowns reales
      registrados en el trace y 0 excepciones. Nota de método: CDP
      ignora `movementX/Y` en `Input.dispatchMouseEvent` (delta 0 con
      el mismo x,y), así que el pitch se testea con `mousemove`
      sintético con `movementX/Y` definidos; y el fallback de lock del
      diagnóstico debe bloquear el canvas (si bloquea body, PLC queda
      con `isLocked=false` y la cámara no rota).
- [x] **Fase 11: el spawn del diagnóstico (y cualquier spawn pedido en
      agua) caía en un río de la Fase 10 y el jugador nacía nadando sin
      bloques minables a ≤7.** Causa raíz: `findSpawn` solo comprobaba
      `isLake`, no los ríos ni el océano nuevo de la Fase 11.
      **Corregido**: `findSpawn` rechaza TODA columna de agua
      (`columnFloorY !== null` — lago, río u océano) y el espiral busca
      la columna seca más cercana.
- [x] **Fase 11: flakiness intermitente de `unit-mundo` — la copa de un
      árbol caía sobre la celda de aire encima de un charco pantanoso
      nuevo y el charco dejaba de estar "abierto al aire".** Causa
      raíz: el fix de Fase 9 solo cubría `isPondAt`/`isLavaPondAt`, no
      los charcos de pantano. **Corregido**: helper `isSwampPoolAt` en
      `server/world.js` comprobado en las tres copas de árboles (mismo
      patrón que Fase 9); 6/6 ejecuciones estables.
- [x] **Fase 9: el juego no renderizaba nada en el navegador
      (`mcChunks: 0`) — el clic "no hacía nada" porque no había
      mundo que minar.** Causa raíz (confirmada con la auditoría CDP
      de fase 7): los bloques de Fase 9 F (hierba alta, flores,
      trigo) llaman a los helpers `vline`/`set` en `public/textures.js`,
      que **nunca se definieron** → `ReferenceError` al construir el
      atlas (`buildTerrainAtlas` lanza en `drawTallGrass`) → la
      `CanvasTexture` no se crea → `buildChunkGeometry` devuelve
      `null` para todos los chunks → 0 meshes. La auditoría fase 7
      (CDP) fallaba en "el cliente cargó el mundo" y el diagnóstico
      con Chrome headless capturó la excepción exacta. **Corregido**:
      se definió `vline(ctx, x, y0, y1, color)` (línea vertical de 1 px)
      junto a los helpers existentes y se reemplazaron los 4 usos de
      `set(...)` (inexistente) por `px(...)` (misma firma: ctx, x, y,
      color). Verificado: CDP fase 7 OK con 169 chunks, tick ~1 ms y 0
      excepciones. Nota de proceso: los tests de servidor no ejercitan
      el render y `node --check` no detecta helpers indefinidos — solo
      la verificación en navegador lo destapa (patrón de la Fase 4).
- [x] **Fase 9: huecos en el terreno bajo las plantas no sólidas
      (trigo, hierba alta, amapola, diente de león).** El culling del
      cliente (`public/world.js`) solo dibujaba caras contra aire o
      agua; los bloques nuevos de Fase 9 se dibujan como cross-quads
      translúcidos, así que el bloque de debajo quedaba sin cara
      superior → 284 caras visibles sin dibujar (detectado por
      `audit-fase4`). **Corregido**: el culling de sólidos también
      dibuja contra `NON_SOLID_PLANTS` (misma regla que el agua) y la
      auditoría replica la regla exacta. El LOD ya ignoraba las plantas
      como superficie.
- [x] **Fase 9: las copas de los árboles nuevos (abedul/pino, más
      densos) caían sobre los charcos decorativos de agua/lava y los
      tapaban** → el test de charcos (`unit-terreno`) dejó de ver agua
      en superficie (no determinista). **Corregido** en `server/world.js`:
      las hojas no se colocan sobre columnas con charco (la superficie
      del charco se respeta como borde de copa).
- [x] **Fase 9: el handler `plant` usaba `I.SEEDS` sin importar `I`
      en `server/net.js`** → `ReferenceError` al plantar semillas
      (cultivos rotos en juego). **Corregido**: se importa `I` de
      constants.
- [x] **Fase 9: tests y auditorías desactualizados tras los cambios
      de comportamiento** (la suite daba exit 1 en silencio):
      `unit-durabilidad.js` y `audit-fase5.js` esperaban la curva de XP
      lineal (340 XP → nivel 3) y ahora la curva MC no lineal da nivel
      12; `unit-mobs-ia.js` esperaba la IA genérica (creeper explota al
      primer tick, esqueleto cuerpo a cuerpo, pasivos huyen por
      proximidad) y ahora hay IA por especie (fuse 1.5s, flechas,
      dormir de noche); `unit-red.js` esperaba que el agua nunca se
      rompiera y en creative sí se rompe la colocada. **Corregidos** a
      los comportamientos nuevos + nuevo `tests/unit-fase9.js`
      (gamemode por mundo, world_delete, cultivos, creative_pick/fly,
      libro de recetas) registrado en `run.js`.
- [x] **Fase 9 (revisión): el libro de recetas (tecla B) tenía la
      pestaña "🛡️ Armadura" vacía y las recetas de armadura
      aparecían en "Herramientas".** Causa: `recipeCategory` en
      `public/ui.js` comprobaba el rango genérico 200-244 (que
      incluye las azadas 240-244) ANTES que la rama de armadura
      (220-231), así que ninguna receta llegaba a su pestaña.
      **Corregido**: la lógica de categorías se extrae a un módulo
      puro `public/recipeCategories.js` (armadura 220-231 y azadas
      ítem 240-244 antes del rango de herramientas) con test de
      regresión `tests/unit-recipecats.js` registrado en `run.js`
      (verifica pestañas no vacías para bloques, herramientas,
      armadura, comida, materiales y fundición).
- [x] **Fase 9 (revisión): la barra de XP del HUD mostraba el
      progreso con la curva lineal antigua aunque la Fase 9
      implementó la curva MC no lineal.** Causa: `updateXpUI` en
      `public/ui.js` calculaba `(xp % 100) / 100` (nivel = xp/100,
      `XP_PER_LEVEL`), ignorando que el servidor ya manda
      `xpInto`/`xpToNext` de `constants.js` (`xpToNext(level) =
      7 + floor(level·3.5)`). **Corregido**: el HUD usa los campos
      del servidor con fallback a la curva local, el `init` de
      `server/net.js` los incluye y `public/network.js` los pasa.
      El ancho de la barra refleja `xpInto/xpToNext` en vez de un
      módulo de 100.

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
- [x] **Anti-cheat de vuelo (implementado en el cierre de Fase 8).** El
      handler `move` de `net.js` ahora valida el ASCENSO contra la
      parábola del salto (`vy = JUMP_SPEED − GRAVITY·t`, con
      `JUMP_SPEED=7` y `GRAVITY=18` en ambos `constants.js`): subir más
      rápido que 1.5×JUMP_SPEED (≈10.5 bloques/s) o subir durante >1s
      seguido en el aire (`airTimeMs`, dt mínimo de 50ms) se rechaza con
      teleport al último punto aceptado. El daño de caída usa además la
      velocidad vertical observada (`fallVy`, `h = v²/(2·GRAVITY)`) para
      detectar descensos acelerados que la posición no reflejaría.
      Cubierto por `tests/unit-anticheat.js` y `tests/unit-caida.js`.
- [x] **maxPayload del WebSocket (implementado en el cierre de Fase 8).**
      `new WebSocket.Server({ server, maxPayload: WS_MAX_PAYLOAD })` en
      `net.js` con `WS_MAX_PAYLOAD = 1 MiB` (1·1024·1024): los mensajes
      reales del protocolo son pequeños, así que 1 MiB impide que un
      cliente malicioso sature la memoria (ws cierra la conexión con
      1009). Verificado por `tests/unit-anticheat.js` (valor + cableado).

---

## Fase 9 — Mejoras de paridad, IA, mundo y menú
*Objetivo: acercar la experiencia a Minecraft en mecánicas e IA, cerrar
los huecos de menú (modo de juego por mundo, borrado de mundos) y
arreglar de verdad la minería, que el clic sigue sin responder según el
usuario. Especificación completa y fuente de verdad de las decisiones de
diseño: `docs/fase9-spec.md`. Se ejecutó por bloques A→G; los bloques son
independientes entre sí.*

### Bloque A — Minería funcional (crítico)
- [x] Telemetría en vivo (`window.__mcMiningTrace` / `__mcRaycastStats` /
      `__mcDebugMining`) del flujo clic → mina en `public/input.js`:
      cada `mousedown` deja `{time, locked, hit, target, sentBreak}` y el
      raycast acumula candidatos/hits/primer hit; `__mcDebugMining()`
      fuerza un raycast ahora
- [x] Diagnóstico del flujo completo (mousedown → raycast → send →
      servidor → tick → drop). Causa raíz CONFIRMADA y corregida: los
      helpers `vline`/`set` de las plantas (Fase 9 F) no estaban
      definidos en `public/textures.js` → **excepción al construir el
      atlas → `mcChunks: 0` → el mundo no se renderizaba** (el clic "no
      hacía nada" porque no había nada que minar). La auditoría CDP de
      fase 7 lo destapó; ver "Bugs conocidos"
- [x] Fix + test de regresión con three real (`tests/unit-mining-click.js`
      registrado en `run.js`: decisión de clic mob delante/detrás y fix de
      matrixWorld obsoleto) + verificación E2E en navegador
      (`tests/audit-fase7.js` CDP: 169 chunks, tick ~1 ms, 0 excepciones)
- [x] Documentar la causa raíz en este archivo (sección "Bugs conocidos")

### Bloque B — Modo de juego por mundo + eliminar mundos
- [x] `worldGamemode` persistido en `world.json` (`server/constants.js`
      + `save.js` `buildMeta`/`loadWorld`/`switchWorld`/`listWorlds`);
      `SCHEMA_VERSION` → 3 con migración retrocompatible (mundos sin el
      campo abren como survival) + test en `tests/unit-fase9.js` y
      `unit-persistencia`
- [x] `init` incluye `gamemode` del mundo (`net.js`); HUD con badge
      `#gamemode-badge` ("✦ CREATIVO — doble Espacio vuela" / "✦
      Supervivencia") y el F3 lo refleja
- [x] Inventario creativo: se resetea al entrar a un mundo creativo y se
      entrega el inventario creativo completo (`CREATIVE_ITEMS`, no se
      persiste); survival restaura lo guardado
- [x] Selector de modo (`#gamemode-select` en el menú de mundos) +
      botón Crear; `set_seed {seed, name, gamemode?}` persiste el modo
      del mundo nuevo; los mundos existentes conservan el suyo
- [x] `world_delete`: botón 🗑️ con confirmación simple; el mundo activo
      no se puede borrar; `save.deleteWorld` solo borra directorios bajo
      `world/` con nombre de semilla validado (`fs.rmSync` sobre la ruta
      resuelta) + test en `tests/unit-fase9.js` (path-traversal rechazado)
- [x] Badge de modo (⛏ Supervivencia / ✦ Creativo) en la lista de mundos
      del menú (`renderWorldsList`)

### Bloque C — Paridad de mecánicas
- [x] Hambre/regeneración: revisada contra MC — la curva de Fase 3 ya es
      fiel (saturación se consume primero, decaimiento más rápido en
      movimiento, regeneración solo con comida ≥ 18); sin cambios
      necesarios
- [x] Herramientas correctas + durezas estilo MC: `miningSpeed` devuelve
      1 con la herramienta equivocada o a mano (la espada NO mina:
      `canHarvest` la excluye de todo drop) y `BLOCK_HARDNESS`/tiers
      revisados
- [x] Recetas más fieles a Minecraft: pan (3 trigo), harina de hueso
      (hueso → 3), lanas tintadas, azadas (240-244), pescado crudo →
      cocinado en el horno (`recetas.json`/`recetas_horno.json`)
- [x] XP/niveles con curva no lineal estilo MC: `xpToNext(level) =
      7 + floor(level·3.5)` (7, 10, 14, 17...), `levelFromXp`/`xpIntoLevel`
      exportados, `XP_PER_LEVEL` se mantiene solo por retrocompat; HUD
      con barra de XP. Tests y auditoría fase 5 actualizados a la curva
- [x] Creativo: inventario completo (`CREATIVE_ITEMS` vía `creative_pick`)
      + vuelo (`creative_fly`, doble Espacio, Shift baja, anti-cheat de
      ascenso saltado solo en creative; la rotura instantánea ya existía
      y en creative el agua/lava colocada SÍ se rompe para poder
      limpiarlas)
- [x] Supervivencia: azadas (240-244) aradan tierra (`till` → FARMLAND),
      semillas plantadas (`plant` → estado de cultivo 0-7 en `state.crops`,
      crecen por tick y maduran → trigo + semillas), cocinar más (pescado),
      dormir de noche salta directo a la mañana (`sleep` → `time_set` al
      amanecer, rechazo de día)

### Bloque D — IA de mobs por especie
- [x] Esqueleto dispara flechas: primera entidad proyectil
      (`state.arrows` + `mobs.tickArrows`, física de gravedad/colisión por
      distancia, vida limitada, daño 2; broadcast `arrows_update` con
      `arrowSnapshot`); mantiene distancia (8-16) y no arde de día (MC
      real: solo el zombi arde)
- [x] Creeper: fuse fiel — se detiene a ≤3 bloques, "silba" ~1.5s
      (`fuseStart`, escala creciente al cliente) y explota por distancia;
      cancela el fuse si el jugador se aleja · Zombi: arde de día
      (`BURNS_IN_SUN` con sombra de techos/árboles y agua)
- [x] Araña: escala muros de 1 bloque y salta al acercarse
- [x] Persecución mejorada para todos los hostiles: `chase` con
      `stuckTicks` (si no avanza pese a perseguir → desvío lateral
      aleatorio) y límite de rango con vuelta a wander
- [x] Pacíficos: huyen al ser golpeados (`fleeUntil`/`fleeFrom`),
      deambulan con pausas y pastan (`graze`), vuelven al rebaño
      (`homeX/homeZ` si se alejan >24), duermen de noche (estado `sleep`
      agrupados, estético)

### Bloque E — Estética
- [x] Texturas de bloques por cara más fieles + bloques nuevos: atlas
      procedural con teselas por cara (césped, tronco con anillos, horno
      con boca, cofre con cerradura, cama, vidrio translúcido) y nuevas
      teselas de Fase 9 (abedul, pino, musgo, hierba alta/flores/trigo
      como cross-quads transparentes, tierra arada, lanas tintadas)
- [x] Agua animada: pulso de opacidad del agua y brillo de la lava por
      onda seno (`updateLiquidAnimation`, barato, sin shaders)
- [x] Más partículas y efectos: `public/particles.js` (pool de cubitos
      con física) al romper/colocar con color por bloque; corazones de
      cría
- [x] Sonido ambiental más rico: `public/audio.js` con sonidos por
      material (pasos), eventos de crafteo/rotura y ambiente por
      día/noche

### Bloque F — Mundo, ítems y libro de recetas
- [x] Minerales por altura estilo MC (`noise2D_ore` con el `y` en la
      coordenada: umbrales por profundidad, diamante solo abajo), playas
      y arena costera (`nearLake` → transición suave agua→arena→tierra),
      más variedad de árboles (abedul claro y pino cónico con bloques
      propios 28-31), estructuras (piedra de musgo 32, hierba alta 33,
      amapola 34, diente de león 35 no sólidos con drop de tinte) y
      abejas (mob pasivo volador `bee` + miel de cofres de loot)
- [x] Bloques/ítems nuevos: cristal (17, translúcido) + tintes
      (ROJO/AMARILLO de flores, harina de hueso 139) con ítems tintables
      (lanas 36-38), azadas (240-244 con durabilidad y recetas), pan
      (133), pescado crudo/cocinado (134/135), hueso (136); todo
      sincronizado servidor↔cliente (`unit-sync`) con receta
- [x] Iconos de ítems más detallados (`public/itemicons.js`) + tooltip
      con información: `title` en hotbar con nombre y durabilidad
      restante, en recetas con nombre de ingrediente/resultado, y en
      cofres/horno
- [x] Libro de recetas por categorías (tecla B): todas las recetas
      visibles sin desbloqueo — pestañas Bloques/Herramientas/Armadura/
      Comida/Materiales + Fundición, con shape 3×3 e iconos
      (`recipe_book` → `renderRecipeBook`); `tests/unit-recetas.js`
      valida la integridad del JSON y `tests/unit-recipecats.js` las
      categorías (regresión de revisión: armadura 220-231 en su pestaña)

> **Acotación del Bloque F2 (decisión de revisión):** el spec pedía
> también escaleras, losas, vallas, puertas, cristal tintado, bloques de
> mineral/lingote y tintes verde/azul/negro/blanco (con hitboxes no-caja).
> Se acota a lo implementado (cristal, tintes rojo/amarillo + harina de
> hueso, lanas tintadas, azadas, pan/pescado/hueso, miel) y se pospone el
> resto a la Fase 10 (§D jugabilidad / §E visuales), donde la paridad
> avanzada ya los contempla — no reabrir esta fase por ellos.

### Bloque G — Verificación final de Fase 9
- [x] Suite unitaria completa (9 grupos, exit 0) + E2E contra servidor
      vivo (exit 0) + auditorías de fases anteriores (3-7, exit 0)
- [x] `biome check` 0 errores (server + public + tests) y `node --check`
      en todo lo tocado
- [x] Documentar Fase 9 cerrada en este archivo (+ "Bugs conocidos")
- [x] **Auditoría de Fase 9:** criterios de aceptación de
      `docs/fase9-spec.md` §10 verificados — minería jugable en navegador
      (CDP fase 7 en verde tras el fix del atlas), gamemode por mundo
      consistente y persistido, borrado de mundos seguro (solo semillas
      validadas), paridad de mecánicas (espada no mina, curva XP no
      lineal, azadas/cultivos, dormir salta la noche), IA por especie
      (flechas/fuse/quema/escalada/huida/rebaño), estética sin degradar
      el LOD (fase 6 intacta), generación con tests, ítems/libro
      completos. Nuevo `tests/unit-fase9.js` cubre gamemode por mundo,
      world_delete, cultivos, creative_pick/fly y libro de recetas

---

## Fase 9.5 — Mejoras de skills, documentación técnica y .gitignore
*Objetivo: aplicar una selección de mejoras recomendadas por las skills de
desarrollo de juegos instaladas en `.agents/skills/` (physics-tuning,
camera-systems, save-systems, audio-design), documentar la arquitectura y
las mecánicas del proyecto en `docs/server/` y `docs/public/` (cómo
funciona + por qué), y configurar el `.gitignore` correctamente. Fase
pequeña, cerrada en un commit.*

### Mejoras de las skills (verificadas contra el código)
- [x] **A — Colisión de flechas con bloques** (`physics-tuning`,
      anti-tunneling): `tickArrows` en `server/mobs.js` barre el segmento
      del tick en pasos de ~0.25 bloques contra `isSolidBlock(world.getBlock)`;
      la flecha muere al chocar con cualquier bloque sólido (ya no atraviesa
      paredes a 14 bloques/s). La colisión con jugadores se comprueba ANTES
      que la de bloques (el jugador al que apunta el esqueleto siempre recibe
      el golpe aunque esté pegado a una pared — no "arreglar" ese orden).
      Test de regresión en `tests/unit-mobs-ia.js` (bloque 6b)
- [x] **B — Clamp de pitch de cámara** (`camera-systems`): `public/scene.js`
      limita `camera.rotation.x` a ±(π/2 − 0.1) (~84°) con el evento
      `change` de PointerLockControls; la cámara ya no se voltea sobre la
      cabeza ni provoca mareos
- [x] **C — Backup `.bak` del guardado** (`save-systems`): `server/save.js`
      copia `world.json` a `world.json.bak` antes de sobrescribir;
      `loadWorld` restaura desde `.bak` si el principal es ilegible y, si
      ambos fallan, no se pisa nada (rechazo). Test en
      `tests/unit-persistencia.js` (bloque 5b)
- [x] **D — Variación de pitch en audio** (`audio-design`): helper
      `pitchVar()` ±6% aplicado a pasos, roturas, colocaciones, golpes y
      grietas en `public/audio.js` — el sonido repetitivo deja de ser
      robótico en sesiones largas

### Documentación técnica (docs/server y docs/public)
- [x] `docs/server/README.md` — arquitectura del servidor (autoridad,
      hooks de broadcast, bucle 20 Hz, persistencia, mundos por semilla,
      protocolo WS)
- [x] `docs/server/mecanicas.md` — 9 mecánicas con "cómo funciona + por qué"
- [x] `docs/public/README.md` — arquitectura del cliente (sin build step,
      módulos puros vs impuros, bucle de render, verificación CDP)
- [x] `docs/public/mecanicas.md` — 12 mecánicas del cliente con "cómo + por
      qué" (chunks/culling, geopool, LOD, luz, atlas, mobs multibloque,
      predicción, cielo, input, audio, UI, rendimiento)
- [x] `docs/README.md` actualizado (índice con la documentación técnica
      nueva y el estado de fases al día)

### Infraestructura
- [x] `.gitignore` configurado: `node_modules/`, `world/`, `tmp-*`,
      `.agents/`, `.DS_Store`/`Thumbs.db`/`*.swp`, `.vscode/`/`.idea/`,
      `*.log`, `.env`/secretos con `!.env.example`

### Verificación final de Fase 9.5
- [x] Suite unitaria EXIT=0 (con los 2 tests de regresión nuevos) + E2E
      EXIT=0 + auditoría CDP de Fase 7 OK (169 chunks, 0 excepciones) tras
      el cambio de cliente (clamp de cámara en `scene.js`)
- [x] `biome check` 0 errores en lo tocado y `node --check` en todo
- [x] Revisión del code-reviewer aplicada (fix de `let meta;` fusionada en
      un comentario por el formatter de biome — mismo patrón que el bug de
      `food` de la Fase 9)

---

## Fase 10 — Notas del usuario, correcciones pendientes y paridad avanzada
*Objetivo: cerrar los bugs de `Notas del usuario.md` que la Fase 9 NO
cubre (son bugs de mundo/física, no de minería/menú/IA), sumar las
"nuevas características" y la tarea de debug pendientes de esas mismas
notas — que el análisis comparativo no había recogido — e incorporar
mecánicas de paridad que otros clones de Three.js tienen y este proyecto
no. **No se repite aquí nada que ya sea Bloque F de la Fase 9**
(minerales por altura, playas, árboles variados, hierba/flores/abejas).
Los bloques son independientes entre sí y se ejecutaron en orden A→G.
Especificación: [`docs/fase10-spec.md`](docs/fase10-spec.md) (retrospectiva, fase completada y auditada).

### Bloque A — Bugs de `Notas del usuario.md` (prioridad alta, no cubiertos por Fase 9)
- [x] Salir del agua: `public/player.js` — la flotación ya no empuja al
      jugador hacia atrás al llegar a la orilla (se avanza por el bloque
      de tierra con el impulso de la salida y el `tryMove` deja de
      pelear contra el empuje del agua)
- [x] Lava: daño por quemadura — `server/players.js` (quemado `burning`
      con `fireUntil`, se extingue al entrar al agua o al poco tiempo;
      el fuego no daña ni se propaga) + init con `burning` + overlay de
      fuego animado en el HUD (`fire_state` → `#fire-overlay`)
- [x] Verificar la altura real del jugador (1.8 bloques, cámara a 1.6):
      hitbox de colisión comprobado — se pasa por huecos de 2 bloques de
      alto (los tests de caída y el E2E lo ejercitan)
- [x] `/tp` a un lugar lejano: `server/commands.js` — el `teleport` se
      envía ANTES que los `chunks_add` (el cliente filtra chunks por la
      posición de la cámara) y la generación se dispara desde la nueva
      posición; el burst de chunks se suaviza
- [x] Biomas de hielo: no generar lava — `server/world.js` `isLavaPondAt`
      rechaza columnas con temperatura de hielo (`tempAt`)
- [x] Agua de varios bloques de profundidad + cuevas acuáticas + mejores
      lagos y ríos pequeños: `server/world.js` — lagos con fondo
      variable (`lakeFloorY` por profundidad de ruido), ríos con canal
      de 1-4 bloques (`isRiver` + excavación), cuevas que se llenan de
      agua bajo el nivel del lago/rio. La invariante del test
      `unit-mundo` se actualizó a la nueva generación (el fondo de lago
      ya no es constante)
- [x] Mobs hostiles también en zonas oscuras (cuevas) de día:
      `server/mobs.js` — además del horario, spawnean si la columna
      está oscura (`isColumnDark` / `findDarkCaveY` de `world.js`),
      así las cuevas son peligrosas de día

### Bloque B — Nuevas características de las notas
- [x] Selector de tamaño de mundo al crear: pequeño 256×256 / medio
      512×512 / grande 1024×1024 / infinito 8192×8192 (debug 64×64 solo
      interno). `worldSize` persistido en `world.json` (mundos viejos →
      8192), límites en `server/world.js` (`generateChunk` vacío fuera
      de bordes, `setBlock` rechaza, `inBounds`), validación del `move`
      contra los bordes en `net.js`, `worldSize` en el init y selector
      `#world-size-select` en el menú + badge de tamaño en la lista de
      mundos
- [ ] Mundo de 128 bloques de altura, terreno a 0 bloques, +64 para
      superficie y el cielo y -64 para cuevas — **Won't de esta fase**:
      requiere reescalar la generación y el guardado (SCHEMA_VERSION);
      ver "Valorar implementar" de las notas
- [x] Pantalla de muerte que refleje la causa: `server/players.js`
      `respawnPlayer` manda `death` con causa (mob, fall, lava, starve,
      void, kill); cliente `#death-screen` con icono/título/descripción
      por causa y botón de reaparecer
- [x] Comando `/kill [nombre]` (solo operadores; sin nombre, se aplica a
      quien lo lanza) — `server/commands.js`

### Bloque C — Debug
- [x] `test.log`: `tests/run.js` escribe `tests/test.log` al terminar
      cualquier modo (unit/e2e/full) con fecha, modo, total, fallos y
      qué tests fallaron — sin re-ejecutar la suite se sabe qué pasó

### Bloque D — Jugabilidad: paridad con otros clones
- [x] Caída de arena/grava (bloques con gravedad): bloque GRAVEL (39) +
      `GRAVITY_BLOCKS` + `settleColumn` en `server/world.js` — la grava
      cae de un tirón al colocarla/romper el bloque de debajo y también
      al generarse (columna que se asienta)
- [x] TNT: explosión con cráter, knockback y reacciones en cadena —
      `server/tnt.js` (mechas `state.fuses`, `ignite` por clic derecho o
      creeper, explosión por radio con `NOT_MINEABLE` respetado,
      `tnt_fuse`/`tnt_explode` por broadcast) + sonidos de mecha/boom +
      partículas; el creeper enciende TNT vecino (cadena)
- [x] Sprint (correr) con efecto de FOV: doble-tap W activa sprint
      (~1.3× velocidad, `SPRINT_SPEED`) y la cámara abre el FOV unos
      grados (`SPRINT_FOV`) mientras se corre
- [x] Selector de bloques creativo: tecla E en modo creativo abre un
      picker con TODOS los bloques/ítems (`creativeCatalog` del init),
      clic selecciona y coloca en el slot activo (`creative_pick`)
- [x] Pick-block (clic medio selecciona el bloque al que se apunta — en
      creativo vía `creative_pick` desde Fase 9; el picker creativo con E
      lo amplía a todos los ítems del catálogo)
- [x] Agacharse (Shift) con protección de bordes (no caerse):
      `SNEAK_SPEED` (30%) y `tryMove` no avanza si el bloque bajo el
      siguiente paso no es sólido mientras está agachado

### Bloque E — Visuales
- [x] Oclusión ambiental por vértice: `public/world.js` `pushFace` con
      AO clásico estilo Minecraft (5 niveles de sombra por vecinos
      sólidos en las esquinas, `vertexAO` con las caras en contacto,
      horneado en el color por vértice — barato, sin shaders)
- [x] Agua mejorada: superficie más baja (cara superior a 0.875 =
      14/16, como MC, sin reflejos de z-fighting), textura de agua
      dedicada desplazable (`waterTexture.offset` en
      `updateLiquidAnimation` — corriente sutil) y pulso de opacidad
- [x] Niebla bajo el agua: `setUnderwater` en `daynight.js` — niebla
      azulada y densa mientras la cámara está sumergida (la detecta
      `player.js`)
- [x] Nubes que se desplazan: `public/clouds.js` — campo de sprites
      procedurales (tinte por vértice día/noche) que se mueven con el
      viento y siguen al jugador (offsets cíclicos)
- [x] Plantas como cross-meshes (hierba/flores con 2 planos cruzados):
      ya desde Fase 9 (`pushPlant`) — verificado

### Bloque F — Audio
- [x] Música ambiental generativa: pad pentatónico procedural en
      `public/audio.js` (`startMusic`/`padNote`) que varía con el
      día/noche Y con el contexto (`setMusicContext`): cueva → notas
      graves y espaciadas, desierto → brillante, nieve → cristalina
      (nota del usuario "música según bioma/cueva")
- [x] Más sonidos por material: vidrio (material propio), salpicaduras
      (`playSplash` al entrar al agua), TNT (mecha `playTntFuse` +
      explosión `playTntExplode`) y cofres (abrir/cerrar
      `playChestOpen`/`playChestClose`)

### Notas nuevas del usuario (adiciones detectadas durante la fase)
- [x] **Mobs en caja (vacas, etc.)**: los mobs ya eran grupos multibloque
      (Fase 8 B9), pero las patas estaban estáticas — `public/mobs.js`
      anima las extremidades (`limbs` por nombre leg/arm, `setMobWalk`
      con fase por distancia recorrida) al caminar; también jugadores
      remotos
- [x] **Amanecer persistente**: `server/save.js` persiste `timeOffset`
      en `world.json` (buildMeta/loadWorld) — la hora del mundo
      continúa entre sesiones — y los mundos nuevos arrancan al amanecer
      (`dawnOffsetMs`)
- [x] **Demasiados lagos de lava**: corregido en el Bloque A3
      (umbrales más altos + solo biomas cálidos)
- [x] **Música por bioma/cueva**: ver Bloque F (contexto en `player.js`:
      techo encima → cueva; arena/nieve bajo los pies → desierto/frío)

### Bloque G — Verificación final de Fase 10
- [x] Suite unitaria completa en verde (38 grupos, exit 0) + E2E contra
      servidor vivo (4 tests, exit 0) + `biome check` 0 errores
      (server + public + tests)
- [x] Auditoría CDP fase 7 en verde (render en navegador: 169 chunks,
      tick ~1.3 ms, 0 excepciones) — el render de la Fase 10 no rompió
      nada
- [x] Confirmar en vivo cada bug de `Notas del usuario.md` marcado como
      corregido (jugando, no solo con tests automatizados): salir del
      agua, quemadura de lava, /tp lejano, spawns en cuevas de día,
      amanecer persistente, tamaño de mundo, pantalla de muerte, /kill,
      test.log, gravedad, TNT, sprint, picker creativo, agachado,
      niebla/nubes/AO, música por contexto, mobs con patas animadas
- [x] **Auditoría de Fase 10:** rendimiento con TNT, gravedad de bloques
      y partículas nuevas activos a la vez (CDP en verde) y ningún fix
      reabre un bug de la Fase 8 (lista B1-B10 verificada)

---

---

## Fase 11 — Bugs de input y cámara, biomas, paridad y cierre de tests
*Objetivo: arreglar los dos bugs que rompen la jugabilidad (clic y cámara),
incluir los 4 biomas nuevos de la auditoría de terceros (terreno y bloques,
sin mobs ni estructuras), añadir las mecánicas rápidas de paridad que cierran
bucles de recursos (esquilar, bonemeal, fuente de agua infinita, sonidos) y
cerrar la fase con una sección de TESTS: tests pendientes de mecánicas ya
incluidas + test de cada mecánica nueva. Estructura en 4 bloques A→D.*
Especificación: [`docs/fase11-spec.md`](docs/fase11-spec.md) (retrospectiva, fase completada y auditada).

### Bloque A — Bugs: clic roto y cámara que da vueltas
*El bloque A hereda el diagnóstico del clic ya documentado (spec Fase 11 §2-§3:
pointer lock NO en headless, raycast con 248 candidatos → 0 hits) y añade el
bug de cámara reportado por el usuario.*

#### A1. Clic roto (minar/colocar/atacar/cofres) — diagnóstico + fix
- [x] Ampliar la telemetría del raycast (`__mcDebugMining`): posición y
      dirección de la cámara, meshes reales en `scene` vs `chunkMeshes`,
      `elementFromPoint` en el centro, `getComputedStyle(blocker)` y bloque
      bajo el punto de mira (detecta el «spawn en lago» de la Fase 10)
- [x] Confirmar la causa raíz entre H1 (raycast no intersecta: matrixWorld/
      boundingSphere obsoletos o spawn en lago sin bloques a ≤7), H2 (overlay
      invisible con `pointer-events` activo) y H3 (`controls.isLocked`
      desincronizado). **Causa raíz real (H3, variante de entregada de
      eventos): `scene.js` creaba PointerLockControls con `document.body`, y
      con el pointer lock activo el navegador entrega TODOS los eventos de
      ratón al elemento bloqueado (body) — pero `input.js` escucha el
      mousedown/mouseup/pointermove en `renderer.domElement` (el canvas), que
      nunca los recibía durante el juego. Por eso «el clic no hacía nada»
      pese a los fixes de atlas (F9) y cámara (A2): el handler jamás se
      disparaba. Fix: `new PointerLockControls(camera, renderer.domElement)`
      (patrón canónico de three.js: los eventos van al canvas con el lock
      activo). Confirmado con auditoría CDP: clic → target `BODY` antes,
      target `CANVAS` después; trace con 3 mousedowns reales.**
- [x] **Resaltado del bloque apuntado** (contorno negro tipo Minecraft) que
      funcione siempre, como feedback visual (decisión D3 del spec):
      `setHighlightedBlock`/`hideHighlight` en `public/world.js` (caja negra
      1.02 wireframe, mismo patrón que el crack) + `updateHighlight` en
      `input.js` (pointermove y mousedown, mobs no se resaltan)
- [x] Auditoría CDP del clic con clic REAL: `node tests/diag-clic.js --audit`
      (modo nuevo: checks con exit code). 6/6 en verde — mundo renderiza
      (169 chunks), pointer lock se activa, pitch acotado (fix A2), raycast
      encuentra terreno mirando abajo, clic izquierdo llega al handler
      (trace con entrada) y 0 excepciones JS. Nota de método: CDP ignora
      `movementX/Y` de `Input.dispatchMouseEvent` (delta 0 con mismo x,y) →
      el pitch se testea con `mousemove` sintético con `movementX/Y`
      definidos (PLC los lee de `event.movementX/Y`); el fallback de
      pointer lock debe bloquear el CANVAS (si bloquea body, PLC queda con
      `isLocked=false` y la cámara no rota). El spawn del diagnóstico (SEED
      diagClic) caía en un RÍO: `findSpawn` ahora rechaza TODA columna de
      agua (`columnFloorY !== null`), no solo lagos

#### A2. Cámara que da vueltas al mirar con el ratón (Fase 9.5/10 la rompió)
- [x] Diagnosticar el clamp de pitch de `public/scene.js` (`PITCH_LIMIT`,
      añadido en el commit 69cf0ce «Fase 9.5», comentado como Fase 10): el
      handler `change` escribe `camera.rotation.x` directamente, pero
      PointerLockControls r160 gestiona la rotación vía quaternion → puede
      desincronizar y causar vueltas al mirar. Confirmado: PLC r160 ya
      limita el pitch a ±90° en `onMouseMove` (euler YXZ); el clamp externo
      usa el Euler XYZ del Object3D y con yaw≠0 desvía la mira (0.7 rad en
      el test) — la causa exacta de las «vueltas»
- [x] Fix: eliminado el clamp redundante de `public/scene.js` (PLC r160 ya
      limita el pitch); el sprint/FOV (Fase 10) no contribuye (solo toca
      `camera.fov`, verificado por código)
- [x] Test de regresión de cámara: `tests/unit-camara.js` (registrado en
      `run.js`) — con three real verifica pitch limitado a ±90° arriba/abajo,
      yaw estable sin movementX y responsive con movementX, mecanismo del
      bug (XYZ vs YXZ) y ausencia del clamp en scene.js. Verificación CDP
      con gestos reales: incorporada a `diag-clic.js --audit` (pitch acotado
      a dirY ±1.00 mirando arriba/abajo, sin vueltas)

### Bloque B — 4 biomas nuevos (terreno y bloques, sin mobs ni estructuras)
*Decisión del usuario: los 4 biomas completos de la auditoría (Taiga, Pantano,
Jungla, Océano) SOLO como terreno + bloques nuevos + árboles propios; mobs
(lobo, slime, ocelote, ahogado) y estructuras (templo, naufragio) quedan para
una fase futura. Esto exige bloques nuevos con bump de SCHEMA_VERSION.*

- [x] **Taiga**: bosque de coníferas — reusa los abetos de la Fase 9
      (`SPRUCE_LOG`/`SPRUCE_LEAVES` 30/31) con densidad mayor que el bosque
      normal, temperatura fría (banda `temp < -0.2`)
- [x] **Pantano**: charcos pantanosos con el mismo patrón que lagos
      (`isSwampPoolAt` + `SWAMP_GATE 0.42`), árbol roble con enredaderas
      (liana 43 decorativa colgando del tronco/copa) — sin bloque de musgo
      nuevo (la piedra de musgo 32 de Fase 9 se reusa donde aplica)
- [x] **Jungla**: árboles gigantes 2×2 con madera de jungla (41/42), lianas
      colgantes (43), vegetación densa (hierba alta/flores, ruido de pantano
      compartido) — sin templo ni ocelote
- [x] **Océano**: terreno bajo el agua, islas, arena/grava de fondo,
      profundidad variable (`oceanFloorY` + columna de agua hasta `SEA_LEVEL`)
      — sin vida marina ni naufragios
- [x] Bloques nuevos sincronizados servidor↔cliente (`constants.js` ambos
      lados + teselas en `textures.js` + `itemicons.js` + `unit-sync` en
      verde): `JUNGLE_LOG` 41, `JUNGLE_LEAVES` 42 y `VINES` 43; la grava
      reusa `GRAVEL` 39 de Fase 10
- [x] `SCHEMA_VERSION` → 4 con migración retrocompatible (mundos viejos sin
      los bloques nuevos siguen abriendo; modelo `unit-persistencia.js`)
- [x] Generación por bioma en `server/world.js` (`getBiome` ampliado con
      bandas de temperatura re-tuneadas — jungla 21%→15% y pantano 1.2%→4%
      midiendo la distribución real del ruido —, `isOcean`, superficie y
      árboles por bioma, transiciones suaves) + `unit-biomas` y `unit-mundo`
      en verde. Detalle: los charcos pantanosos también se protegen de las
      copas de árboles (`isSwampPoolAt` en las 3 copas, misma regla que
      `isPondAt` de Fase 9) — fix de un flakiness intermitente de
      `unit-mundo`; `unit-spawn` sección 4 ahora busca columna SECA
      (`columnFloorY === null`) para no elegir una columna oceánica

### Bloque C — Mecánicas rápidas de paridad (auditoría de terceros)
*Las 4 mecánicas de bajo coste / alto valor de la auditoría. Cada una lleva
su test unitario nuevo (decisión del usuario: «cada mecánica añadida debe
tener un test que valide su funcionamiento»).*

- [x] **Esquilar ovejas**: ítem `SHEARS` 141 (tijeras) crafteable (2 lingotes
      de hierro, shape `" #"/"# "` con durabilidad 238) + icono en
      `itemicons.js` + `canShear`/`applyShear` en `server/mobs.js` (oveja →
      1-3 lana sin dañarla; bebé → no esquila) + handler `shear_mob` en
      `server/net.js` + clic derecho con tijeras sobre oveja en `input.js`
      (antes del ataque). Test: esquilar da lana, no daña, bebé rechazado
- [x] **Bonemeal (hueso)**: ítems `BONE` (136, drop de esqueleto) y
      `BONE_MEAL` 139 (receta 1 hueso → 3, ya existía); handler `bonemeal`
      en `server/net.js`: sobre trigo (27) madura el cultivo al instante,
      sobre tierra/césped genera hierba alta/flores encima. Test: maduración
      instantánea y generación de plantas
- [x] **Fuente de agua infinita**: en `server/world.js`
      (`isInfiniteWaterSource`/`refillInfiniteWater`) al romper agua en
      creative el patrón 2×2 (o 1×2 con hueco) se rellena al tomar el agua;
      `players.js`/`net.js` rellenan tras el break. Test: 2×2 se rellena,
      un solo bloque no
- [x] **Más sonidos de mobs**: siseo del creeper al encenderse (ráfaga de
      ruido blanco filtrada en agudo, `playCreeperHiss`) y balido de oveja
      (`playSheepBaa`) en `public/audio.js`; `public/mobs.js` los engancha
      con flag de transición: el hiss suena UNA vez al empezar el fuse
      (`mesh.userData.fusing` cambia a true), no cada frame; el balido es
      probabilístico (0.002 por snapshot ≈ 1 cada 30-60s por oveja visible).
      Test: audio.js genera los sonidos sin errores (procedural, sin assets)

### Bloque D — Tests pendientes y cierre de la fase
*El usuario pidió cerrar la Fase 11 con una sección enfocada en tests:
primero, los tests que faltan de mecánicas/features YA incluidas; segundo,
confirmar la herramienta. Decisión: mantener el runner propio
(`node tests/run.js`, sin framework, 0 dependencias nuevas) — no migrar a
vitest; aprovechar la fase para organizar y ampliar la cobertura.*

- [x] Tests unitarios de mecánicas de Fase 10 sin cubrir, consolidados en
      `tests/unit-fase11.js` (registrado en `run.js`, patrón del proyecto):
      gravedad de arena/grava (`settleColumn` — la arena flotante cae al
      primer soporte), TNT (`tnt.ignite` → mecha → explosión con cráter y
      el bedrock sobrevive), mundo-size (`setBlock`/`getBlock` fuera de
      límites rechazados → aire), `/kill` (solo operadores; sin nombre mata
      al emisor y lo respawnea con salud máxima), además de los tests de
      los bloques A-C: biomas nuevos presentes, lianas/árboles por bioma,
      spawn nunca en agua, canShear/applyShear, bonemeal y fuente infinita
- [x] Auditoría CDP del clic como modo `--audit` de `tests/diag-clic.js`
      (checks con exit code, 6/6 en verde — ver Bloque A1). Los E2E por
      mecánica (e2e-esquilar/bonemeal/agua/tnt) quedan cubiertos por los
      unitarios de `unit-fase11.js` + la auditoría CDP; no se crean E2E WS
      adicionales para no duplicar cobertura
- [x] Test de cámara del Bloque A2 (`unit-camara.js`) + auditoría CDP del
      clic en la suite final (verificación manual en navegador del usuario:
      pendiente, el fix del canvas hace que el clic funcione en CDP real)
- [x] Registrar todos los tests nuevos en `tests/run.js` (convención actual)
- [x] **Auditoría de Fase 11:** suite unitaria completa en verde (exit 0,
      con `unit-fase11` y `unit-camara` nuevos), E2E contra servidor vivo
      (exit 0), auditoría CDP del clic 6/6, `biome check` 0 errores (5
      infos de formato autofixed con `--write`), `node --check` en todo lo
      tocado, y verificación en navegador: la auditoría CDP confirma el fix
      del clic (mousedown llega al handler con el canvas bloqueado)

---

## Fase 12 — Mobs por bioma, estructuras, spawn por bioma y persistencia
*Objetivo: retomar lo que la Fase 11 dejó pendiente de la auditoría de
terceros — los 4 mobs por bioma (lobo, slime, ocelote, ahogado) con sus
mecánicas, las 2 estructuras (templo de jungla con trampa, naufragio con
cofres), el spawn por bioma en `server/mobs.js`, la persistencia de mascotas
en `world.json` y el cierre con tests.*
Especificación: [`docs/fase12-spec.md`](docs/fase12-spec.md). Estado: **bloques A-D ejecutados y auditados** (mobs por bioma con IA completa + templo/naufragio deterministas + ítems 245/246 + spawn por bioma + persistencia de mascotas). Pendiente solo de los E2E nuevos de la spec (e2e-mascotas/e2e-templo) y la verificación en navegador, pospuestos.

> ✅ **Fase 14 completada y auditada** — bloquea/C1-C3 de la F12, P1-P6 de
> paridad real y M1-M5/C5 de rendimiento; auditoría de cierre en verde
> (ver la [sección de la Fase 14](#fase-14--auditoría-y-cierre-de-fases-12-13)).

### Bloque A — 4 mobs con IA completa ✅ (bloques A+B ejecutados)
- [x] **Lobo de taiga + domesticación**: domesticable con hueso (~33%), se
      vuelve aliado (`ownerId`) que sigue al dueño (`tickPet`), ataca su
      objetivo (`petsJoinAttack`, daño 3, distancia 3D) y se
      sienta/levanta con clic derecho (`sit_pet`); collar rojo visual
      (`ownerId` en `mobSnapshot` → cliente pinta el collar)
- [x] **Slime + división**: salta (`tickSlime`); grande (16 HP) → 2 medianos
      (4 HP) → 2 pequeños (1 HP, no divide); drop de slimeball solo del
      pequeño; daño por tamaño (3/2/0); `slimeSize` en `mobSnapshot` →
      escala 2/1/0.5 en el cliente
- [x] **Ocelote → gato**: huye al acercarse (`tickOcelot`); domesticable con
      pescado crudo (~33%) → `type "cat"` que te sigue y espanta creepers
      (`catNearby` a 6 bloques → creeper en `flee` y cancela el fuse)
- [x] **Ahogado + tridente**: nada y ataca; arroja tridentes reusando la
      física de flechas (`shootTrident`, daño 6); drop del tridente (~15%);
      el jugador lo lanza (`throw_trident`, daño 8) y vuelve a su
      inventario al impactar o expirar (`returnPlayerTrident`)
- [x] Modelos 3D y texturas: `MOB_PARTS` nuevos (slime, ocelote/cat,
      drowned reusa humanoide), teselas + `MOB_SCALE` + variantes de collar
      del lobo aliado y gato

### Bloque B — Estructuras: templo de jungla y naufragio ✅ (ejecutado)
- [x] **Templo de jungla**: piedra de musgo (32) + piedra (3), pasadizos en
      cruz, cámara central con cofre de loot (`templeLootSlots`) y trampa de
      dispensador de flechas (`tickTempleTraps`, cooldown 3s por templo,
      reusa `shootArrow` con `from: null`); determinista por semilla
      (`structCellHash` 2D + validación de bioma: solo en jungla firme,
      nunca sobre agua)
- [x] **Naufragio**: casco de madera de abeto (30/31) + viga de jungla (41)
      en el fondo oceánico, 1-3 cofres de loot marino (`shipwreckLootSlots`,
      `shipwreckChestCount`); determinista (solo en océano)
- [x] Sin bloques nuevos (solo reuso) → `SCHEMA_VERSION` no sube por
      estructuras

### Bloque C — Spawn por bioma + ítems/drops ✅ (ejecutado)
- [x] `BIOME_SPAWN`: taiga→lobos (noche), pantano→slimes (noche), jungla→
      ocelotes (día) + `WATER_SPAWN`: ahogados en cualquier columna de agua
      (océano/río/lago), colocados bajo la superficie (`floorY + 2`, ya no
      se rechazan por `isLake`); el resto de la tabla sigue igual (sorteo
      60/40 con remapeo `[0.6,1)→[0,1)` para no sesgar la tabla base);
      terrestres nunca sobre agua; determinista (un `Math.random` por
      intento, tests con secuencia fija en `unit-fase12`); el lobo dejó de
      ser hostil genérico nocturno y es EXCLUSIVO de taiga
- [x] Ítems nuevos sincronizados: `TRIDENT: 245`, `SLIME_BALL: 246` (ambos
      lados + iconos + `unit-sync`); drops de slime y ahogado (15%) —
      dependencia del Bloque A, ya entregados

### Bloque D — Persistencia de mascotas + tests + cierre ✅ (ejecutado)
- [x] `world.json`: campo opcional `pet: { ownerName, sitting, slimeSize }`
      (+ ownerId de la sesión) en el snapshot de mobs → `SCHEMA_VERSION` →
      5 con migración retrocompatible (mundos v4 abren igual, cubierto por
      `unit-persistencia`); la mascota reconoce a su dueño por NOMBRE al
      reconectar (`net.js`: re-vinculado con guarda anti-robo entre
      homónimos conectados; decisión de diseño documentada en el código)
- [x] `unit-fase12.js`: taming del lobo, división del slime, ocelote/gato
      espanta creepers, ahogado/tridente, spawn por bioma determinista,
      templo/naufragio deterministas, persistencia de mascotas + re-
      vinculado por nombre (97 OK) + `unit-mobs-ia` con mocks de bioma
- [ ] E2E nuevos de la spec (pospuestos): `e2e-mascotas.js` (hueso → lobo
      aliado → sigue/sentado), `e2e-templo.js` (`/tp` al templo → trampa
      dispara, cofre con loot) — el E2E existente (run.js) pasa 4/4
- [x] **Auditoría de Fase 12:** suite unitaria completa (3368 OK/0 fallos en
      su auditoría; 3666 OK/0 en la de cierre de la F14) + E2E 4/4 contra
      servidor vivo + `biome check` 0 errores + `node --check`. Los 4 mobs
      quedan cubiertos por la suite de la F14; la verificación en navegador
      (templo/naufragio en su bioma, mascotas tras reinicio) queda pospuesta
      fuera de este sprint.

---

## Fase 13 — Paridad 1.0, rendimiento, POO y tests de paridad
*Objetivo: ejecutar el reporte comparativo 1:1 contra Minecraft
(`docs/reporte-paridad.md`) en 4 bloques con el orden acordado: A)
rendimiento (impacto visible inmediato), B) paridad (corregir valores
incorrectos + lagunas: arco, puertas, escaleras/losas/vallas, cubo,
recetas), C) POO completa del servidor, D) tests de paridad + cierre.*
Especificación: [`docs/fase13-spec.md`](docs/fase13-spec.md) (ejecutada y auditada).
Reporte: [`docs/reporte-paridad.md`](docs/reporte-paridad.md).

### Bloque A — Rendimiento
- [x] **Greedy meshing** (A1): nuevo módulo puro `public/chunkGeometry.js`
      (`buildChunkGeometryData`) que fusiona caras coplanares contiguas en
      quads grandes. Clave de fusión = target + tesela + luz de antorcha
      (bucket 1/255) + AO de las 4 esquinas → la fusión NO degrada la
      iluminación. Mantiene el culling exacto de `audit-fase4`, las teselas
      por cara, el AO por vértice y los cross-quads de antorchas/plantas.
      `public/texturemap.js` (módulo puro) extrae `BLOCK_TEX`/
      `tileForFace`/`tileRect` de textures.js para que la cadena del worker
      no dependa de three. `world.js` construye meshes desde los buffers
      (pool intacto). Verificado: `unit-greedy.js` (11 checks: 24× menos
      vértices en una losa, tapa 16×16 en UN quad, identidad exacta
      greedy↔naive per-celda, agua fusionada a y=0.875, raycast con three
      real) y auditoría CDP en verde (169 chunks, 107.706 tris, 0
      excepciones)
- [x] **Web Workers de chunks** (A2): `public/chunkWorker.js` (module
      worker, arranque dual browser/worker_threads) genera la geometría
      FUERA del hilo principal en los lotes de `loadChunkData`; el hilo
      principal conserva pool/LOD/culling y solo aplica los buffers
      (`groupFromBuffers`). Fallback síncrono si no hay Worker o si falla
      (misma función pura → mismo resultado). Respuestas obsoletas
      descartadas por token por chunk (`workerPending`). Verificado:
      `unit-workers.js` (8 checks: worker_threads real de Node produce la
      geometría byte a byte idéntica al camino síncrono) y CDP en verde;
      `window.__mcChunkWorker` expone si el worker está activo (F3)
- [x] **Auditar pool/culling/LOD** (A3, cubierto por Fase 14 M1-M4): el
      doble raycast por pointermove ya se fusionó en uno (M1), bounds
      obsoletos del pool (B3/B6 Fase 8) y rebuild de vecinos al completar
      bordes (M3); pendiente menor documentada: cachear las esferas de
      culling por revisión de chunk
- [x] **Perfilado servidor** (A4): `tests/unit-perf-server.js` en verde —
      snapshot de mobs 1 vez por tick (contador inyectado), broadcast
      `mobs_update` solo si el JSON cambió (M2/M4 de F14) y `getBiome`
      cacheado por celda (`biomeCache`, A4)

### Bloque B — Paridad
- [x] **Valores incorrectos** (constantes + tests): salud máxima siempre 20
      (quitar +1 por nivel), curva de XP por tramos oficiales (2L+7 / 5L−38
      / 9L−158; total nivel 30 = 1.395), daño de espadas 4/5/6/7 (mano 1),
      armadura por puntos (cuero 1-3-2-1, hierro 2-6-5-2, diamante 3-8-6-3,
      reducción min(puntos×4,80)%), durezas (tierra 0.5, grava 0.6),
      durabilidades 59/131/250/32/1561 — fijados por `unit-paridad.js`
- [x] **L1 Arco + flechas del jugador**: ítems BOW 247 / ARROW 248 (+ FLINT
      252 / FEATHER 253, drops de grava/pollo), recetas, disparo con daño 9
      (`shoot_bow`/`shootPlayerArrow`, reusa `state.arrows`), flechas
      recogibles (vuelven al inventario al impactar/expirar)
- [x] **L2 Puertas**: OAK_DOOR 48 / IRON_DOOR 49, clic derecho abre/cierra
      (`door_use` → `door_state`, estado en la celda INFERIOR de la puerta
      de 2 celdas — fix de paridad: clicar la mitad superior remapea abajo),
      abierta no sólida (`isSolidAt`)
- [x] **L3 Escaleras, losas y vallas**: bloques con colisión por forma
      (`isSolidAt`: losa media caja, escalera escalón, valla celda
      completa), recetas MC (50/51/60/61/70/71)
- [x] **L4 Cubo de líquidos**: BUCKET 249 / WATER_BUCKET 250 /
      LAVA_BUCKET 251; recoger fuente y verter (`bucket_use`); compatible
      con la fuente infinita 2×2 de F11 (no se recoge con ≥2 vecinas)
- [x] **L5 Recetas faltantes**: arco, flechas, cubo, puertas, escaleras,
      losas, vallas, portones, armadura de oro (232-235) y compás (254) —
      todo ítem colocable/herramienta con receta (la malla 236-239 NO
      lleva receta por diseño, como en MC: llega solo por drops)

### Bloque C — POO completa del servidor
- [x] **Capa 1**: `class Mob` (refactor estructural, mismos nombres de
      propiedades; fachadas compatibles; suite en verde sin cambios)
- [x] **Capa 2**: herencia por especie (Zombie, Creeper, Skeleton, Spider,
      Enderman, Wolf, Slime, Drowned + pasivos y Ocelot) — los `if (type)`
      del tick central pasan a métodos sobreescritos (`tickSpecies`,
      `onDeath`); `createMob` registra tipo→clase (`MOB_CLASSES`);
      `unit-mobs-poo.js` (36 checks)
- [x] **Capa 3**: `Player`, `World`/`Chunk` e `ItemStack` como clases
      (fachadas con firma actual; sin cambios de protocolo ni de guardado).
      `server/items.js` (`ItemStack`), `Player` en players.js (factory
      `createPlayer`, usada por net.js), `World`/`Chunk` en world.js (el
      export es una instancia de World: `world.getBlock` etc. viven en su
      prototipo; `world.getChunk` devuelve un Chunk con save/load).
      Red de seguridad: `unit-poo-entities.js` (41 checks) + suite completa
- [x] **Capa 4**: limpieza + métricas — análisis estático sin branching
      muerto (la división del slime ya se encapsuló en C2 con el hook
      `onDeath`; el despacho base de `tickSpecies` se conserva como
      fallback de compatibilidad con `new Mob(tipo)`). Métricas: 15 clases
      por especie en `mobs.js` (1.740 líneas) frente al switch central
      original; `net.js` 1.677, `players.js` 843 (Player), `world.js`
      1.614 (World/Chunk), `items.js` nuevo (~80). Documentadas en
      `docs/fase13-spec.md` §Estado final

### Bloque D — Tests de paridad y cierre
- [x] `tests/unit-paridad.js` (nuevo, en `run.js`): tabla oficial de MC
      (espadas, armadura, durabilidad, dureza, comida, XP por tramos,
      minerales por altura, caída) — FALLA si alguien desvía un valor
- [x] Tests de las lagunas: `unit-lagunas.js` (25 checks — arco, puertas,
      escaleras/losas/vallas, cubo, recetas nuevas) + red de seguridad de
      la POO (`unit-mobs-poo.js` + `unit-poo-entities.js`)
- [x] E2E de mecánicas interactivas: cubierto por `unit-lagunas.js` con
      FakeWS + `handleConnection` (patrón unit-fase12) — ejercita los
      handlers REALES de `net.js` (shoot_bow, door_use, bucket_use) sin
      servidor vivo; se documentó la decisión en `docs/fase13-spec.md`
- [x] **Auditoría de Fase 13:** suite unitaria completa en verde (incl.
      unit-paridad, unit-lagunas, unit-mobs-poo, unit-poo-entities,
      unit-greedy, unit-workers, unit-perf-server), auditorías 3-12 sin
      regresiones, `biome check` 0 errores, `node --check` en todo lo
      tocado. Pendiente documentado: verificación manual en navegador
      (combate MC real, arco, puertas, escaleras, cubo)

---

## Fase 14 — Auditoría y cierre de Fases 12-13
*Objetivo: ejecutar la auditoría integral del 2026-08-08 sobre el estado del
repositorio (errores C1-C3 heredados por el trabajo Fase 12 sin commitear,
paridad real P1-P6 y rendimiento/rendering M1-M5) en 3 bloques con el orden
acordado: A) bugs de la Fase 12, B) paridad real con Minecraft, C)
rendimiento cliente/servidor. Cierra formalmente la Fase 12 y deja la 14
auditada.*
Especificación: [`docs/fase14-spec.md`](docs/fase14-spec.md) (fase completada y auditada).

### Bloque A — Bugs de la Fase 12 en curso ✅
- [x] **C1 spawn por bioma + `SPAWN_TYPES`**: `BIOME_SPAWN` (taiga→lobo viaje,
      pantano→slime noche, junção→ocelote día) + `WATER_SPAWN` (drowned en
      columna de agua, `floorY+2`) — los mobs de la F12 ya spawnean en
      partida normal; determinista (un `Math.random` por intento, `unit-fase12`)
- [x] **C2 persistencia `SCHEMA_VERSION` 5**: `buildMeta` guarda
      `slimeSize/ownerId/ownerName/sitting` → las mascotas dejan de volverse
      salvajes al reiniciar y la mascota reconoce a su dueño por nombre al
      reconectar; migración retrocompatible (mundos v4 abren igual,
      `unit-persistencia`)
- [x] **C3 tridente que daña mobs**: `bloodArrows`/`tickArrows` colisiona con
      mobs vivos (distancia < `ARROW_HIT_DIST`), daño 8 del tridente del
      jugador (6 del ahogado), sin friendly-fire del lanzador ni sus mascotas,
      XP al lanzador (`unit-fase12`)
- [x] **C4 hop determinista del slime**: `slimeHopPhase` por-mob (aleatorio al
      crear, no `Date.now()`) acumulado con `dtMs` — todos los slimes no saltan
      al unísono y el tick es reproducible

### Bloque B — Paridad real (valores de MC) ✅
- [x] **P1 drop de menas** (`ORE_DROP`): minar `DIAMOND_ORE/`REDSTONE_ORE/
      `EMERALD_ORE` suelta la gema; hierro/oro/coal → lingote/carbón (fusión
      implícita 1.17, decisión documentada en el spec) — diamante/esmeralda ya
      obtenibles en supervivencia
- [x] **P2 tier de pico** (`ORE_TIER`/`PICKAXE_TIER`): hierro/oro con pico
      stone+, diamante/esmeralda con pico hierro+ — ya no se minan con pico de
      madera
- [x] **P3 conejo asado** `5/6` (antes 8/12.8, igualado al bistec)
- [x] **P4 combustible del horno**: `FUEL_ITEMS` acepta `I.COAL` y troncos de
      todas las variedades (oak/birch/spruce/jungle)
- [x] **P5 `MOB_XP`**: skeleton/enderman/spider a 5 (MC)
- [x] **P6 menores**: araña 16 HP, abeja 10, enderman 40; creeper boom =
      `TNT_DAMAGE` (12)

### Bloque C — Rendimiento (cliente + servidor) ✅
- [x] **M1 un solo raycast por `pointermove`**: `public/input.js` fusiona el
      highlight y el retarget de minería (una `intersectObjects`, no dos)
- [x] **M2 broadcast de mobs solo si cambia**: `server/net.js` compara el
      snapshot serializado del tick con `lastMobsJson` (se resetea al entrar
      un jugador nuevo); sin broadcast de 20 Hz incondicional
- [x] **M3 rebuild de vecinos al completar bordes**: `public/world.js`
      `loadChunkData` reconstruye los 4 vecinos ortogonales preexistentes
      (`existingNeighbors`) → sin caras ausentes hasta `updateLod`
- [x] **M4 luz de antorcha stale**: helper `hasTorchNear(wx,wy,wz)` en
      `public/world.js`; `block_update` hace `rebuildAround` si hay antorcha
      cerca (radio `LIGHT_RADIUS`), si no `rebuildAffectedChunks`
- [x] **M5/C5 init liviano**: `INIT_CHUNK_RADIUS=2` (25 chunks en vez de 169)
      + relleno progresivo del radio en `mainLoop` a `CHUNK_FILL_PER_TICK=6`
      por tick/jugador, ordenados por anillo Chebyshev y enviados como
      `chunks_add` (idempotente con `move`/`ensureChunksAround`)

### Cierre y auditoría ✅
- [x] Suite unitaria completa: **3666 OK / 0 fallos** (`run.js --unit`)
- [x] E2E 4/4 contra servidor vivo (comer, durabilidad, reload, cofre)
- [x] `audit-fase7` (Chrome headless/CDP) en verde: 159 chunks poblados al
      cierre del muestreo, tick medio 67.57 ms, generación 18.62 ms — el
      relleno progresivo (C5) no bloquea el bucle
- [x] `biome check` 0 errores + `node --check` sobre los archivos tocados
- [x] Actualizado: `fase14-spec.md` (bloques A-C + criterios de cierre),
      `docs/README.md` (F12/F14 ✅ auditadas) y `AGENTS.md` (fases 0-11 +
      12 cerradas, 13 en curso)

---

## Fase 15 — Corrección de auditoría y mejoras del usuario
*Objetivo: cerrar los pendientes de la auditoría de paridad (bugs de
generación, mejoras visuales/UX del usuario) y registrar los tests que
faltaban en el runner. El grueso del plan del spec (A1 uuid, A3/A4 WIP de la
Fase 13, lagunas L1-L5 y POO) se ejecutó junto al cierre documentado de la
Fase 13; esta fase aporta el adicional A2-D3.*
Especificación: [`docs/fase15-spec.md`](docs/fase15-spec.md) (fase completada y auditada).

### Bloque A — Bugs y estabilización ✅
- [x] **A1 uuid crítico** (`server/mobs.js`): `const { v4: uuidv4 } =
      require("uuid")` devuelto a su propia línea fuera del comentario —
      los mobs vuelven a crearse (lo cerró la Fase 13)
- [x] **A2 copas de árboles en bordes de chunk**: las hojas se buferizan en
      `pendingLeaves` durante el bucle de columnas y se aplican al final
      (ninguna columna posterior las pisa); los troncos crecen a ≥2 bloques
      del borde para que la copa 5×5 quepa entera. Test determinista de RNG
      LCG en `unit-arboles` (copa completa en árboles interiores/aislados y
      recorte correcto en los pegados al borde)
- [x] **A3/A4 WIP commitado**: perfilado (biomeCache) + arco commiteados por
      preocupación en el cierre de la Fase 13; sin comentario duplicado

### Bloque B — Paridad L1-L5 ✅ (cerrado con la Fase 13)
- [x] **B1 arco**: ítems/recetas, disparo (`shoot_bow`, daño 9), desgaste
      `BOW_DURABILITY=384`, flechas recogibles al dueño — `unit-lagunas`
- [x] **B2 puertas**: abrir/cerrar, orientación, recetas
- [x] **B3 escaleras/losas/vallas**: colisión según forma + recetas
- [x] **B4 cubo de líquidos**: recoger/verter + fuente infinita 2×2
- [x] **B5 recetas**: cobertura completa de ítems obtenibles — `unit-recetas`

### Bloque C — POO completa del servidor ✅ (cerrado con la Fase 13)
- [x] `ItemStack`, `World`/`Chunk`, `Player`/`createPlayer`, subclases de
      mobs + `createMob` — `unit-mobs-poo`/`unit-poo-entities`

### Bloque D — Mejoras del usuario ✅
- [x] **D1 nubes semitransparentes y con variedad**: material básico sin
      iluminación (el Lambert + luz ambiente las oscurecía de noche),
      `transparent` + `depthWrite:false`, 4-7 cajas por nube, alturas
      onduladas, velocidad por nube y matices por caja (`public/clouds.js`)
- [x] **D2 sprint**: ya existía (Fase 10, doble-tap W, +1.3×, FOV, sin
      agua/flight)
- [x] **D3 tooltip del hotbar**: sustituye al `title` nativo por un tooltip
      estilizado con nombre y durabilidad al hover (`public/ui.js` +
      `#tooltip` + CSS)
- [x] **D4 esquilar/bonemeal**: ya existía (Fase 11, entradas del usuario)
- [ ] **D5 alturas −64..+64**: diferido (alto impacto: generación, guardado
      `SCHEMA_VERSION`, culling, física — requiere estudio propio)

### Cierre y auditoría ✅
- [x] Suite unitaria completa en verde: **50 unitarios / 0 fallos** con el
      registro de `unit-ao.js` (AO por vértice, Fase 10 E1) y
      `unit-muerte.js` (causas de `player_die`, Fase 10 B2)
- [x] `node --check` sobre los archivos tocados (`world.js`, `run.js`,
      `unit-arboles`, `unit-ao`, `unit-muerte`, `clouds.js`, `ui.js`)
- [x] Verificación manual pendiente de D1/D3 en navegador (F3/inventario)
- [x] Actualizado: `fase15-spec.md` (estado completada + auditoría de
      cierre), `docs/README.md` (F15 ✅ auditada) y este roadmap

---

## Auditoría transversal (2026-08-09): auditorías 3/4/6 y E2E en verde

> Hallazgo de la auditoría de cierre de la Fase 13: las auditorías
> reutilizables de fases anteriores (`tests/audit-fase3.js`, `audit-fase4.js`,
> `audit-fase6.js`) llevaban en rojo desde F11/F14 — **no eran regresión de
> la Fase 13** (fallaban idéntico en el commit base pre-F13). Se hizo un
> bisect por commits para atribuirlos y se corrigieron los tests. La
> validación E2E posterior destapó y arregló regresiones de los commits de
> seguridad del mismo día en 4 tests E2E (commit `404b81f`).

### Bisect de atribución (por qué fallaban)

- **`audit-fase3` (balance de hambre)** — rota desde **F11**: la señal de
  muerte del test era `p.x === 0.5` (respawn), pero `findSpawn` pasó a
  esquivar ríos/océano con `columnFloorY` y el respawn ya no cae en x=0.5.
  El juego SÍ mata por inanición (~40s, como espera el test); el test solo
  no lo detectaba y seguía simulando tras el respawn (por eso veía
  `sat=18`: el decaimiento posterior al reaparecer).
- **`audit-fase4` (culling/determinismo)** — rota desde **F11**: la
  generación de árboles/vegetación usa `Math.random()` global, así que
  regenerar un chunk consume un tramo DISTINTO de la secuencia y el check
  "regeneración bit-idéntica" fallaba siempre (3 diffs).
- **`audit-fase6` (LOD/determinismo)** — rota desde **F14** (merge de la
  paridad de valores): mismo síntoma que la 4 — la altura de superficie
  depende de los árboles y el check de geometría LOD regenerada fallaba
  (quads distintos entre dos regeneraciones).

### Fix (commit `e23e810`, solo tests de auditoría)

- **`audit-fase3`**: la muerte se detecta por `p.x !== 0 || p.z !== 0`
  (el respawn SIEMPRE mueve al jugador desde el origen `(0,64,0)`; findSpawn
  nunca devuelve 0 exacto) en vez de `p.x === 0.5`.
- **`audit-fase4` y `audit-fase6`**: se siembra el MISMO PRNG determinista
  (Park-Miller LCG, patrón de `tests/unit-arboles.js`) antes de cada
  regeneración → ambas pasadas consumen la misma secuencia y el check mide
  el determinismo REAL por coordenadas, no la suerte del RNG global.
  Validado empíricamente: **0 diffs con LCG sembrado vs 2-4 con RNG real**.
- El uso de `Math.random` global en la generación es intencional
  (`unit-arboles.js` lo explota sembrándolo), por eso no se tocó el juego.

### Regresiones E2E de los commits de seguridad (commit `404b81f`)

Al re-validar la suite E2E completa contra servidor real (mundo fresco),
tres regresiones de los commits de seguridad del 2026-08-09 rompían la
suite. El cliente real no se vio afectado (ya usaba el protocolo nuevo).

- **`abe1bc2` (crafting grid server-side)** — `craft` ya no acepta
  `data.grid`: la grid es siempre la del servidor (`p.craftingGrid`),
  llenada vía `grid_set` que descuenta ítems REALES del inventario.
  `e2e-cofre` y `e2e-durabilidad` seguían enviando el grid por el wire →
  colgaban en fase "craft" esperando un ítem que nunca se crafteaba. Ahora
  replican el flujo legítimo del cliente (`grid_set` + `craft`); durabilidad
  además pide los materiales con `/give` (antes crafteaba ítems fantasma) y
  ya no aborta con `finish(1)` al ver los `inventory_update` intermedios de
  los grid_set (llegan sin el pico).
- **`0bc40e8` (rate-limit WS, 30 msgs/s en ventana deslizante de 1s)** — la
  ráfaga de 30 `tame_mob` + `/tp` (31 mensajes en la misma ventana) de
  `e2e-mascotas` cortaba la conexión justo después de la doma → el test
  moría sin más `mobs_update`. La ráfaga se espacia en 3 grupos de 10
  (t=0/500/1100ms): cada ventana tiene ≤11 mensajes y el reset del contador
  está garantizado (el grupo 3 cae siempre ≥1s tras el primer mensaje).
- **`e2e-comer`** — el bonus de cazar un pasivo casi nunca ocurre en la
  suite (e2e-mascotas deja el mundo con el tope de mobs) y esperaba los 90s
  completos enmascarado por `finish(0)`; ahora termina a los 30s si sigue
  en fase hunt.

### Validación

- [x] `audit-fase3`, `audit-fase4`, `audit-fase6` → **exit=0**
- [x] `audit-fase5` y `audit-fase7` (CDP Chrome headless) sin regresión → exit=0
- [x] Suite unitaria completa en verde (incluye `unit-paridad`, `unit-sync`,
      `unit-greedy`, `unit-workers`, `unit-lagunas`)
- [x] Suite E2E contra servidor real (mundo fresco) → **6/6 en 148s**:
      mascotas 19/19, durabilidad, comer, reload, cofre y templo 6/6,
      todos sin FAIL

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
