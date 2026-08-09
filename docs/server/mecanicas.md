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
  bosque, desierto, nieve, montaña, tundra y, desde la Fase 11, **taiga**
  (abetos densos), **pantano** (charcos con `isSwampPoolAt`, robles con
  lianas), **jungla** (árboles 2×2 de madera de jungla, lianas) y
  **océano** (terreno bajo el agua, islas, fondo de arena/grava, `isOcean`).
  La altura se compone con varias octavas de ruido (fBm) y un `smoothstep`
  que aplana valles (`flatBaseHeight`).
- **Cuevas 3D** (`caveStrength` + `isCaveBlock`): ruido 3D que resta
  piedra; cerca de la superficie se estrechan para no agujerear el suelo.
- **Minerales por altura estilo Minecraft** (`noise2D_ore` con el `y` en
  la coordenada): umbrales por profundidad — el diamante solo aparece
  abajo, el carbón en todas partes, etc.
- **Charcos** (`isPondAt`, `isLavaPondAt`): agua/lava decorativas en
  superficie (la lava solo en biomas cálidos, no en hielo), con `nearLake`
  que hace la transición agua→arena→tierra (playas). Los charcos de
  pantano usan `isSwampPoolAt`.
- **Estructuras:** minas abandonadas con pasillos y cofres de loot,
  árboles por bioma (roble, abedul, pino, jungla 2×2), hierba alta, flores
  y trigo (bloques no sólidos con drop de tinte).
- **Tamaño de mundo** (`WORLD_SIZES`, Fase 10): pequeño 256 / medio 512 /
  grande 1024 / infinito 8192 por semilla; `generateChunk` devuelve vacío
  fuera de bordes, `setBlock` rechaza y `inBounds` valida.
- **Spawn determinista** (`findSpawn`): punto de aparición derivado de la
  semilla y cacheado (se invalida al cambiar de mundo); rechaza TODA
  columna de agua (lago, río u océano) y busca en espiral la seca más
  cercana.

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
  daño de lava (`LAVA_DAMAGE`) por tick mientras esté en contacto; el
  fuego (`burning`/`fireUntil`) se extingue al entrar al agua o al poco
  tiempo y se replica con `fire_state` (overlay de llamas en el HUD).
- **Agacharse (Shift):** velocidad reducida (`SNEAK_SPEED`) y el servidor
  **no avanza** si el bloque bajo el siguiente paso no es sólido mientras
  está agachado (protección de bordes, Fase 10).
- **Límites del mundo:** el `move` se valida contra los bordes del
  tamaño de mundo de la semilla (Fase 10); salir devuelve teleport.
- **POO (Fase 13, C3):** los jugadores son instancias de `Player`
  (creados con `createPlayer`); sus métodos de entidad (`damage`, `heal`,
  `eat`, `addXp`, `addItem`, ...) delegan en las fachadas históricas de
  `players.js`.

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
- **Drop de las menas** (Fase 14, Bloque B): cada mineral suelta
  DIRECTAMENTE su ítem usable — carbón → `I.COAL`, hierro/oro → lingote,
  diamante/redstone/esmeralda → gema (`ORE_DROP`); ya no cae el bloque de
  mena (que no es útilizable).
- **Tier mínimo por mineral** (Fase 14, Bloque B): `PICKAXE_TIER`
  (madera 1, piedra 2, hierro 3, oro 1, diamante 4) frente a `ORE_TIER`
  (carbón 1, hierro/oro 2, redstone/diamante/esmeralda 3). Con pico de
  tier insuficiente el bloque se rompe pero **no suelta nada** (sin drop
  ni XP), como en Minecraft.

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
`audit-fase5.js` (paridad de durabilidad servidor↔cliente);
`tests/unit-paridad.js` y `tests/unit-recetas.js` fijan `ORE_DROP`,
`PICKAXE_TIER`/`ORE_TIER` y el combustible (Fase 14).

---

## 3.5 Bloques con gravedad y TNT (server/world.js, server/tnt.js)

### Cómo funciona

- **Arena y grava caen** (`GRAVITY_BLOCKS`, Fase 10): `settleColumn` las
  mueve al `setBlock` si el bloque de debajo no es sólido, y también al
  generarse (la columna se asienta); el broadcast es `block_update`.
- **TNT** (Fase 10): `tnt.ignite` arma una mecha (`state.fuses`, ~1.6 s)
  con `tnt_fuse`; al explotar (`tnt_explode`) hace un cráter por radio con
  `NOT_MINEABLE` respetado (bedrock/agua/lava intactos), knockback y daño,
  y puede encender TNT vecino (reacciones en cadena). El creeper también
  lo enciende. Los cofres con contenido no se rompen.

### Por qué así

- **El servidor decide la física de bloques**: la caída y la explosión
  mutan el mundo real (el persistido), no una predicción del cliente. La
  regla de `NOT_MINEABLE` evita que la gravedad o la pólvora destruyan
  bedrock y contenedores con loot (griefing accidental).

### Verificación

`tests/unit-fase11.js` (sección de mecánicas de Fase 10: grava cae al
primer soporte, TNT explota con cráter y el bedrock sobrevive).

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
- **XP con la curva OFICIAL de Minecraft** (Fase 13, paridad B2):
  `xpToNext(level)` por tramos (2L+7 para L<16, 5L−38 para 16..30,
  9L−158 para L≥31); coste total hasta nivel 30 = **1.395 XP**. La
  **salud máxima es SIEMPRE 20** (el nivel NO da vida, paridad B1). La XP
  se conserva al morir. El HUD recibe `xpInto`/`xpToNext` para pintar el
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
  el nivel 3 fuera tan caro como el 12. Desde la Fase 13 la curva es la
  OFICIAL por tramos (paridad con `xpToNext`) y **el nivel no modifica la
  vida**: la progresión defensiva solo viene de la armadura.
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
- **Spawn por bioma** (Fase 12, Bloque C): en `spawnMobs` una parte de la
  reserva sale del POOL del bioma (`BIOME_SPAWN`: taiga → lobos de
  noche, pantano → slimes de noche, jungla → ocelotes de día) y los
  ahogados entran solo en columnas de agua (`WATER_SPAWN`, bajo la
  superficie en lugar de sobre como el resto).
- **Salud por especie** (Fase 14, Bloque B, paridad MC): zombi/creeper/
  esqueleto/lobo/drowned 20, **araña 16**, **enderman 40**, **abeja 10**;
  el creeper explota con el **daño del TNT** (`TNT_DAMAGE`).
- **Persecución con `stuckTicks`:** si un hostil no avanza pese a
  perseguir, se desvía lateralmente; hay límite de rango con vuelta a
  wander.
- **Cría** (`canFeed`/`applyFeed`): con la comida de cría correcta
  (`BREED_FOOD`), dos pasivos generan un bebé (corazones al cliente).
- **POO por especie (Fase 13, C2):** cada especie es una subclase de `Mob`
  (`Zombie`, `Spider`, `Wolf`, `Slime`, `Drowned`, `Creeper`, `Skeleton`,
  `Enderman`, `Cow`, `Pig`, `Chicken`, `Sheep`, `Rabbit`, `Bee`,
  `Ocelot`), creadas con la fábrica `createMob` (`MOB_CLASSES`). La
  variación por especie vive en métodos sobreescritos (`tickSpecies`,
  `onDeath` — el slime se divide al morir en `Slime.onDeath`, sin `if
  (type)` en los llamadores); la clase base conserva el despacho por tipo
  para que `new Mob("zombie")` siga funcionando.

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
- **Combustibles** (`FUEL_ITEMS`, Fase 14, Bloque B): troncos de las
  cuatro variedades (roble, abedul, abeto, jungla), tablones, palo y
  **carbón**.
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
  el inventario (herramientas con durabilidad no apilan). Desde la Fase 13
  (C3) los slots son instancias de `ItemStack` (JSON idéntico al wire,
  como en el inventario).
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
  DAY_CYCLE_MS`. El `timeOffset` (de `/time set` o dormir) **se persiste en
  `world.json`** (Fase 10): la hora del mundo continúa entre sesiones y los
  mundos nuevos arrancan al amanecer (`dawnOffsetMs`).
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

## 8.5 Interacción con el mundo: esquilar, bonemeal y agua infinita (Fase 11)

### Cómo funciona

- **Esquilar ovejas** (`shear_mob` + `applyShear` en `server/mobs.js`):
  con tijeras (`SHEARS` 141, con durabilidad 238) clic derecho sobre una
  oveja → 1-3 lana sin dañarla; un bebé no se esquila. El crafteo es
  2 lingotes de hierro en diagonal.
- **Bonemeal** (`bonemeal`, harina de hueso 139): sobre trigo madura el
  cultivo al instante; sobre tierra/césped genera hierba alta o flores.
- **Fuente de agua infinita** (`countWaterNeighbors` en `world.js`,
  relleno en `players.js` al romper agua en creative): un hueco de agua
  con ≥2 fuentes de agua ortogonales adyacentes se rellena solo — la 2×2
  con 3 fuentes y el canal 1×3 nunca se agotan, como en Minecraft.

### Por qué así

Cierran bucles de recursos baratos (lana sin matar, cultivos instantáneos
con hueso, agua reutilizable) con **validación server-side** y cada una
con su test unitario (decisión de la Fase 11: toda mecánica nueva lleva
test). No requieren bloques nuevos ni tocar el formato de guardado.

### Verificación

`tests/unit-fase11.js` (secciones de esquilado, bonemeal y fuente de agua
infinita).

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
