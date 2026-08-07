# Servidor — Mecánicas de juego

> Cómo funciona cada mecánica del servidor, **por qué** está implementada
> así y dónde vive el código. Para la arquitectura general ver
> [`README.md`](./README.md). Los IDs de bloques/ítems están en
> `server/constants.js` (y sincronizados en `public/constants.js`).

---

## 1. Generación del mundo (server/world.js)

### Cómo funciona

- **Ruido determinista por semilla.** `seededNoise(seed)` construye un
  PRNG *mulberry32* sembrado con el string de la semilla; con él se crean
  los generadores `simplex-noise` 2D/3D (`reinitNoise`). Misma semilla →
  mismo mundo, siempre, entre reinicios.
- **Biomas por temperatura + montañosidad** (`biomeFrom`): llanura,
  bosque, desierto, nieve. La altura se compone con varias octavas de
  ruido (fBm) y un `smoothstep` que aplana valles (`flatBaseHeight`).
- **Cuevas 3D** (`caveStrength` + `isCaveBlock`): ruido 3D que resta
  piedra; cerca de la superficie se estrechan para no agujerear el suelo.
- **Minerales por altura estilo Minecraft** (`noise2D_ore` con el `y` en
  la coordenada): umbrales por profundidad — el diamante solo aparece
  abajo, el carbón en todas partes, etc.
- **Charcos** (`isPondAt`, `isLavaPondAt`): agua/lava decorativas en
  superficie, con `nearLake` que hace la transición agua→arena→tierra
  (playas).
- **Estructuras:** minas abandonadas con pasillos y cofres de loot,
  árboles por bioma (roble, abedul, pino cónico), hierba alta, flores y
  trigo (bloques no sólidos con drop de tinte).
- **Spawn determinista** (`findSpawn`): punto de aparición derivado de la
  semilla y cacheado (se invalida al cambiar de mundo).

### Por qué así

- **Determinismo = depuración + mundos compartibles.** Con una semilla el
  mundo se reproduce byte a byte: los bugs de generación se pueden
  reproducir y los jugadores pueden compartir semillas (el menú lo
  permite). Es la recomendación de la skill `procedural-gen`: un PRNG
  propio sembrado, nunca `Math.random()` global.
- **Ruido compuesto, no una función.** fBm con varias octavas da el
  relieve natural; un solo octava produce colinas demasiado lisas o
  ruidosas. La redistribución con potencia (`pow`) aplana valles y afila
  cumbres.
- **Cuevas con estrechamiento cerca de la superficie** para que no se
  vean "huecos" al caminar; el mundo se siente sólido.

### Verificación

`tests/unit-terreno.js`, `tests/unit-biomas.js`, `tests/unit-arboles.js`,
`tests/unit-mundo.js` (generación determinista), `audit-fase4.js`
(integridad: sin bloques flotantes, charcos correctos).

---

## 2. Física y movimiento (server/players.js, server/net.js)

### Cómo funciona

- **Gravedad y salto** (`GRAVITY = 18`, `JUMP_SPEED = 7`): el servidor
  integra la velocidad vertical del jugador en cada tick.
- **Validación anti-cheat:** el ascenso se valida contra la parábola del
  salto (`JUMP_SPEED·dt − GRAVITY·dt²/2`); un cliente no puede "subir"
  más rápido de lo que la física permite. El daño de caída se calcula por
  velocidad vertical inferida (`h = v²/(2·GRAVITY)`), no por "bloques
  caídos" que el cliente declare.
- **Colisión con el mundo:** el servidor consulta bloques sólidos vía
  `world.getBlock` y resuelve el desplazamiento por ejes.
- **Agua y lava:** flotación en agua (el jugador no se hunde del todo) y
  daño de lava (`LAVA_DAMAGE`) por tick mientras esté en contacto.

### Por qué así

- **El servidor integra la física** aunque el cliente también la simule
  para el render: el servidor es el que decide la posición final. El
  cliente predice para que no haya lag visual; al llegar el tick del
  servidor, si difiere, se corrige.
- **Paridad servidor↔cliente:** `public/constants.js` mantiene los mismos
  valores (`GRAVITY`, `JUMP_SPEED`) — lo audita `tests/unit-sync.js`. Si
  divergieran, el cliente predeciría una trayectoria que el servidor
  rechaza y el jugador "rebotaría".

---

## 3. Minería y herramientas (server/mining.js, server/constants.js)

### Cómo funciona

- **Sesión de rotura con progreso:** `block_action {action:'break'}` abre
  una sesión (`startMining`); `tickMining` avanza `progress` según
  `breakSeconds(bloque, herramienta)`. Se cancela si el bloque cambia, el
  jugador se aleja (>7 bloques) o envía `break_cancel`.
- **Dureza y tier:** `BLOCK_HARDNESS` por bloque; `miningSpeed` devuelve 1
  con herramienta equivocada o a mano. La **espada no mina**
  (`canHarvest` la excluye de todo drop) — fiel a Minecraft.
- **Herramienta releída en cada tick:** cambiar de herramienta a mitad de
  mina recalcula la velocidad sin perder progreso acumulado.
- **Durabilidad** (`TOOL_DURABILITY`): cada uso (o bloque roto) desgasta;
  al llegar a 0, `tool_broke` y la herramienta desaparece.
- **Grietas al cliente:** `block_break_progress` con stage 0-9 (y -1 para
  ocultar) para pintar el crack como en Minecraft.

### Por qué así

- **Progreso continuo, no "clic = roto":** permite que la rotura se sienta
  gradual y que la dureza del bloque importe; también hace trivial el
  feedback visual (grietas).
- **Validación server-side:** el cliente no dice "roto", solo "estoy
  minando"; el servidor decide cuándo se completa. Así la velocidad de
  rotura no se puede hackear.
- **Tier de herramienta = progresión:** picar piedra a mano es lentísimo;
  con pico de hierro es rápido. Da sentido a subir de nivel de
  herramienta (objetivo de la Fase 5).

### Verificación

`tests/unit-mineria.js`, `tests/unit-crack.js`, `tests/unit-durabilidad.js`,
`audit-fase5.js` (paridad de durabilidad servidor↔cliente).

---

## 4. Combate, daño, armadura y XP (server/players.js, server/mobs.js)

### Cómo funciona

- **Daño por origen** (`damagePlayer`): mob (cuerpo a cuerpo o flecha),
  creeper (explosión), caída, lava, hambre (inanición). Cada origen pasa
  por `opts.source` para telemetría (`damage_debug` + `state.damageLog`).
- **Armadura** (`applyArmorDamageReduction`): reduce el daño según la
  pieza y su material (cuero/hierro/diamante), con durabilidad propia
  (`ARMOR_DURABILITY`).
- **Hambre y regeneración:** la saturación se consume primero, decae más
  rápido en movimiento; con comida ≥18 el jugador regenera salud; con 0
  muere de inanición (ignora armadura).
- **XP con curva no lineal estilo MC:** `xpToNext(level) = 7 + floor(level·3.5)`
  → 7, 10, 14, 17… El nivel suma salud máxima (máx +10). La XP se
  conserva al morir. El HUD recibe `xpInto`/`xpToNext` para pintar el
  progreso dentro del nivel.
- **Muerte y respawn** (`respawnPlayer`): al morir se suelta el inventario,
  se restaura salud/comida, se reaparece en el spawn del mundo (o en la
  cama si se durmió) y se aplica la gracia de spawn (30 s sin daño de mobs).

### Por qué así

- **Telemetría de daño por origen** nació del diagnóstico de la Fase 8
  ("pierdes vida sin causa"): con `damage_debug` y el anillo
  `damageLog` se confirmó que eran mobs cerca del spawn → zona segura +
  gracia. Medir antes de arreglar.
- **Curva MC no lineal** da progresión realista: los primeros niveles son
  baratos, luego se encarecen. La lineal simple (100 por nivel) hacía que
  el nivel 3 fuera tan caro como el 12.
- **El daño real pasa por armadura** para que la armadura importe como
  progresión defensiva.

### Verificación

`tests/unit-damage.js`, `tests/unit-armadura.js`, `tests/unit-respawn.js`,
`tests/unit-mobs-ia.js` (ataques, fuse, flechas), `audit-fase5.js`.

---

## 5. IA de mobs (server/mobs.js)

### Cómo funciona

- **Por especie** (Fase 9, Bloque D):
  - **Zombi:** persigue, ataca cuerpo a cuerpo, **arde de día**
    (`BURNS_IN_SUN` con sombra de techos/árboles y agua).
  - **Esqueleto:** mantiene distancia (8-16 bloques) y **dispara flechas**
    (primer proyectil del juego: `state.arrows`, gravedad, vida limitada,
    daño 3, broadcast `arrows_update`). No arde de día (MC real).
  - **Creeper:** se acerca hasta ≤3 bloques, "silba" ~1.5 s (`fuseStart`,
    escala creciente al cliente) y explota por distancia; cancela el fuse
    si el jugador se aleja.
  - **Araña:** escala muros de 1 bloque y salta al acercarse.
  - **Pasivos:** huyen al ser golpeados (`fleeUntil`), deambulan con
    pausas, pastan, vuelven al rebaño (`homeX/homeZ` si se alejan >24) y
    duermen de noche (estado `sleep`).
  - **Abeja:** volador pasivo decorativo (Fase 9).
- **Spawn por hora y luz:** de noche (o en zonas oscuras, según fase) se
  spawnan hostiles a ≥24 bloques del jugador; **zona segura de spawn**
  (radio 32) donde no aparecen ni targetean.
- **Persecución con `stuckTicks`:** si un hostil no avanza pese a
  perseguir, se desvía lateralmente; hay límite de rango con vuelta a
  wander.
- **Cría** (`canFeed`/`applyFeed`): con la comida de cría correcta
  (`BREED_FOOD`), dos pasivos generan un bebé (corazones al cliente).

### Por qué así

- **IA por especie > IA genérica:** un creeper que explota al primer tick
  o un esqueleto cuerpo a cuerpo no se parecen a Minecraft. Cada especie
  tiene su amenaza y su contra-juego (esquiva el fuse, escóndete de las
  flechas, refúgiate del sol).
- **Spawn seguro del spawn:** resultado directo del diagnóstico de la
  Fase 8 (B2): el jugador nuevo moría en segundos sin poder defenderse.
  Radio de 32 bloques = "seguro" sin matar la exploración.
- **`Math.random()` en runtime está bien:** la IA y el spawn de mobs **no
  necesitan ser deterministas** (no generan contenido permanente); solo la
  generación del mundo y los atlas usan PRNG sembrado (ver §1).

### Verificación

`tests/unit-mobs-ia.js`, `tests/unit-mobs-agua.js`, `tests/unit-cria.js`,
`tests/unit-mobray.js` (raycast de mobs multibloque con three real).

---

## 6. Crafteo y hornos (server/crafting.js)

### Cómo funciona

- **Recetas en JSON con hot-reload:** `recetas.json` (55 recetas 3×3) y
  `recetas_horno.json` (10 fundiciones). `watchRecipeFiles` las recarga en
  caliente con **swap atómico**: un JSON inválido conserva las anteriores.
- **Match por patrón:** `matchRecipe(grid)` compara el grid 3×3 del
  jugador contra cada receta (forma e ingredientes); auto-craft al llenar
  el patrón.
- **Hornos** (`furnaces` en `state`): combustible, input, progreso por
  tick, output; `furnaceSnapshot` para el wire. Se persisten en
  `world.json` y se restauran al cargar.
- **Validación estructural** (`isValidRecipes`): receta malformada se
  rechaza al cargar, nunca deja el juego a medias.

### Por qué así

- **Datos fuera del código:** añadir un ítem/receta no toca JS (aunque
  requiere actualizar los `constants` sincronizados). Es la regla de
  `AGENTS.md`: bloque/ítem nuevo → ambos lados + receta.
- **Hot-reload** para iterar rápido (el servidor no se reinicia) y para
  que los tests puedan apuntar a archivos de recetas temporales
  (`setRecipePaths`).
- **Swap atómico** para que un error de edición no rompa el servidor en
  producción: se sigue sirviendo con las últimas recetas válidas.

### Verificación

`tests/unit-recetas.js` (integridad del JSON: shapes 3×3, result válido,
categorías), `tests/unit-crafting.js`, `tests/unit-fase9.js` (libro de
recetas vía `recipe_book`), `tests/e2e-comer.js`.

---

## 7. Cofres y loot (server/chests.js)

### Cómo funciona

- Cada cofre del mundo tiene 27 slots (`CHEST_SLOTS`), misma semántica que
  el inventario (herramientas con durabilidad no apilan).
- **Loot de minas abandonadas:** los cofres generados por `world.js`
  traen 1-3 stacks de `LOOT_TABLE` estilo Minecraft (carbón, lingotes,
  redstone, diamante raro al 8%, miel/pan desde Fase 9).
- El estado vive en `state.chests` y se persiste en `world.json`
  (`restoreChests`); la lógica de mover ítems (put/take) vive en el
  handler de red de `net.js`.

### Por qué así

- Mismo patrón que los hornos (estado en un Map del `state` + snapshot
  para el wire + restauración desde save): **un solo patrón de
  almacenamiento** para todos los contenedores, fácil de testear y
  persistir.

---

## 8. Comandos y reloj del mundo (server/commands.js)

### Cómo funciona

- Chat con `/` → `executeCommand`: `/help`, `/tp x y z`, `/give`, `/time
  set`, `/gamemode`. El servidor es la fuente de verdad: cada comando
  muta el estado y sincroniza con eventos existentes (`teleport`,
  `inventory_update`, `time_set`, `chunks_add`).
- **Reloj del mundo:** `worldTime(state) = (Date.now() + timeOffset) %
  DAY_CYCLE_MS`. El `timeOffset` (de `/time set`) no se persiste: al
  reiniciar el servidor el ciclo vuelve a la hora real.
- **Fases lunares** (`moonTime`): ciclo de 8 días de juego
  (`MOON_CYCLE_MS = DAY_CYCLE_MS * 8`) con **offset determinista por
  semilla** (`seedMoonOffsetMs`): mismo mundo → misma fase lunar para
  todos y entre reinicios.

### Por qué así

- **Reloj = wall-clock + offset** (no contador de ticks): el día/noche
  sigue siendo coherente aunque el servidor esté ocupado, y `timeOffset`
  es la única mutación. El offset lunar por semilla da variedad visual
  entre mundos sin romper el determinismo por mundo.

### Verificación

`tests/unit-commands.js`, `tests/diag-moon.js`.

---

## 9. Seguridad y robustez

- **Sanitización de entrada:** nombres, semillas, nombres de mundo y
  mensajes se sanean y acotan (regex de control, límites de longitud).
- **Path traversal bloqueado:** `deleteWorld` valida que la semilla
  resuelva a un directorio bajo `world/` (test de path-traversal en
  `unit-fase9.js`).
- **`WS_MAX_PAYLOAD`:** límite de tamaño de mensajes WebSocket entrantes
  (anti-DoS).
- **Validación de recetas al cargar** y **escritura atómica** de chunks
  (ver §6 y §Persistencia del README).
- **`SCHEMA_VERSION` + migraciones:** los mundos guardados con versiones
  anteriores se migran; un mundo de una versión más nueva se rechaza con
  mensaje claro (no se pisa).

### Por qué así

El servidor es la única frontera de confianza: todo lo que llega de un
cliente es sospechoso hasta que se valida. Cada regla anterior es un caso
concreto de esa política.
