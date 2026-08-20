# Fase 21.5 — Contenido y paridad ampliados: pesca, bloques 1.8-1.15, combate y Trial Chambers (Spec)

> **Estado:** `[EN CURSO]` (abierta 2026-08-17 — Fase 21 cerrada; es la
> fase activa del proyecto). Hereda los **diferidos de generación D2/D3 de
> la F21** (océanos profundos/cálidos con coral y montañas altas — §4.5).

> Documento creado a partir de: la lista de mejoras del usuario "Alta
> prioridad / Bajo esfuerzo", "Prioridad media / Esfuerzo medio", "1.21
> Tricky Trials", "1.21.5 Spring to Life" y "1.22 / 26.1" (entregada
> 2026-08-15) y de la entrevista con el usuario (2026-08-15): acordado
> crear **una fase nueva Fase 21.5** que absorbe el contenido no planificado
> de la lista (pesca, piedra pulida, linternas, bambú/andamios, colmenas/
> miel, coral/algas, horno de fundición, escudo, tótem, camas de colores,
> concreto, Trial Chambers/Breeze/Bogged/Maza, 1.21.5 variantes y
> decorativos, Pale Garden/Creaking/Mochila y comandos), **reusando** lo ya
> planificado en F21 (biomas/estructuras/mobs), F22 (minerales/cobre/
> amatista) y F23 (Breeze/trims/Tuff) y respetando los Won't. Programa
> entre la **Fase 21** y la **Fase 22** sin renumerar la serie 21→22→23.
> Fecha: 2026-08-15 · Proyecto: clon de Minecraft.
> Estado: **prospectiva (sin implementar)** — prerrequisito: **Fase 21
> cerrada** (a su vez, la F20). Fase fraccionable en bloques/subfases.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1 | Lista usuario "Alta prioridad / Bajo esfuerzo" #1 | Caña de pescar y sistema de pesca (1.7/1.13): `FISHING_ROD`, línea = proyectil, "pica" con temporización, tabla de loot (pescado/tesoro/basura) | F21.5 A1 | 🔴 |
| A8 | Lista usuario #8 | Pesca en cofres: cañas de pescar rotas en tablas de loot de cofres | F21.5 A8 | 🟢 |
| B1 | Lista usuario "Bajo esfuerzo" #3 | Bloques de piedra pulida: granito, diorita, andesita (+ pulidas) en vetas subterráneas (1.8) | F21.5 B1 | 🟢 |
| B2 | Lista usuario #4 | Linternas (1.14): `LANTERN`, cuelga o en suelo, como antorcha | F21.5 B2 | 🟢 |
| B3 | Lista usuario #5 | Bambú y andamios (1.14): `BAMBOO` (planta alta), `BAMBOO_PLANKS`, `SCAFFOLDING` (no sólido, escalable; crecimiento estático) | F21.5 B3 | 🟢 |
| B4 | Lista usuario #6 | Colmenas y miel (1.15): `BEE_NEST` (en árboles), `BEE_HIVE` (crafteado), `HONEY_BOTTLE` (comida 6/1.2), `HONEY_BLOCK` (reduce caída). `HONEY` (140) ya existe como botín; abejas ya en F21 C2 | F21.5 B4 | 🟢 |
| B5 | Lista usuario #7 | Bloques de coral y algas (1.13): `CORAL_BLOCK`, `CORAL_FAN`, `KELP`, `SEAGRASS` en arrecifes de océanos cálidos (estático) | F21.5 B5 | 🟢 |
| C1 | Lista usuario "Media" #12 | Horno de fundición (Blast Furnace, 1.14): funde minerales ×2, UI propia | F21.5 C1 | 🟠 |
| C2 | Lista usuario #13 | Escudo (1.9): `SHIELD`, clic derecho reduce daño (sin off-hand completo) | F21.5 C2 | 🟠 |
| C3 | Lista usuario #14 | Tótem de inmortalidad (1.11): evita la muerte, cura y absorción; consumible; loot de la mansión | F21.5 C3 | 🟢 |
| C4 | Lista usuario #15 | Camas de colores (1.12): 16 camas con tintes | F21.5 C4 | 🟢 |
| C5 | Lista usuario #16 | Bloques de concreto (1.12): 16 concretos + polvo con gravedad (sin conversión por agua) | F21.5 C5 | 🟠 |
| D1 | Lista usuario "1.21 Tricky Trials" | Cámaras de Prueba (estructura subterránea en deepslate) + botín | F21.5 D1 | 🟠 |
| D2 | Lista usuario 1.21 | Mobs Breeze y Bogged (Breeze ya en F23 A2 → aquí solo Bogged, o coordinado) | F21.5 D2 | 🟠 |
| D3 | Lista usuario 1.21 | Maza (Mace) + Núcleo Pesado (Heavy Core): daño escala con caída | F21.5 D3 | 🟠 |
| D4 | Lista usuario 1.21 | Bloques de Cobre (variantes: bloques, escaleras, losas, puertas, sin oxidación simplificado) y Tuff (Tuff bloque ya en F23 A4 → aquí la familia) | F21.5 D4 | 🟠 |
| D5 | Lista usuario 1.21 | Ítems: Carga de Viento, Barra de Breeze, Mapa de Exploración de Prueba | F21.5 D5 | 🟠 |
| D6 | Lista usuario 1.21 | Discos de música, pinturas y partituras (visual/audio) | F21.5 D6 | 🟢 |
| E1 | Lista usuario "1.21.5" | Variantes de animales por bioma (cerdo/vaca/gallina frías y cálidas via `variant`) | F21.5 E1 | 🟢 |
| E2 | Lista usuario 1.21.5 | Color de lana de oveja según bioma | F21.5 E2 | 🟢 |
| E3 | Lista usuario 1.21.5 | Bloques decorativos: Firefly Bush, Leaf Litter, Wildflowers, Bush, hierba seca corta/alta, Cactus Flower | F21.5 E3 | 🟢 |
| E4 | Lista usuario 1.21.5 | Partículas de hojas cayendo (cliente) | F21.5 E4 | 🟢 |
| E5 | Lista usuario 1.21.5 | Sonidos ambientales de desierto/badlands (encaja con audio por bioma F19.5) | F21.5 E5 | 🟢 |
| F1 | Lista usuario "1.22/26.1" | Bioma Jardín Pálido (Pale Garden) | F21.5 F1 | 🟠 |
| F2 | Lista usuario 1.22 | Mob Crujiente (Creaking): solo se mueve cuando no lo miras | F21.5 F2 | 🔴 |
| F3 | Lista usuario 1.22 | Bloque Corazón Crujiente (Creaking Heart): destruirlo lo mata | F21.5 F3 | 🔴 |
| F4 | Lista usuario 1.22 | Mochila (Bundle): inventario portátil (cofre portátil) | F21.5 F4 | 🟠 |
| G1 | Lista usuario "Comandos" + borrador | Comandos nuevos: `/summon` invoca mobs, `/locate` encuentra estructuras (pozo/pirámide/templo/naufragio) y biomas, `/effect` gestiona la absorción (give/clear/get), `/kill` generalizado con selectores `@s/@p/@a/@e/@r` (resolución en el handler); `/weather` requiere clima visual (partículas de lluvia) inexistente → diferido al bloque G2 (cliente) | F21.5 G1 | 🟢 |
| Z1 | Lista usuario (zanahoria/patata) | **YA IMPLEMENTADO** (F18 C-3): `FOOD_VALUES` zanahoria 3/3.6, patata 1/0.6, `BAKED_POTATO` 5/6 — no se planifica | — `[x]` | — |
| Z2 | Lista usuario (miel en cofres) | **YA EXISTE** (F9 F1): `HONEY` (140) llega por cofres de loot | — `[x]` | — |

**Won't confirmado por el usuario (2026-08-15) en esta fase:** redstone y
todo lo que dependa de ella (Crafter/Pistones/comparadores), The End
(Dragón), nether/wither/piglins/bastiones (dimensión Nether → F24), huevos
de Ender (teletransporte), delfines guía, aldeanos/comercio, crema de magma
e ítems del Nether, **oxidación del cobre** (sin ticks), **crafter
automático**, **Trial Spawner/Ominous Spawner** (oleadas), **Bad Omen /
eventos ominous** (estado persistente), **Vault funcional** (seguimiento por
jugador — el Vault queda como cofre decorativo/tesoro único sin llave),
**comando de pruebas data-driven** (test/), **huevos de gallina azules y
marrones** (variantes de gallina; no prioritario), **comercio de aldeanos
data-driven**. **Diferidos (no Won't):** caballos (sistema grande → fase
posterior o descartado), stray (variante de esqueleto; depende de bioma de
nieve — valorar tras F21), endermite/pilar del End (→ F25).

---

## 1. Contexto

- **Prerrequisito:** Fase 21 cerrada (biomas/estructuras/mobs), que exige la
  F20. La F21.5 es una **fase de contenido y paridad ampliados**: reúne las
  mecánicas de la lista del usuario que no estaban planificadas (pesca,
  bloques 1.8-1.15, combate del escudo/tótem/maza, Trial Chambers y
  contenidos 1.21/1.21.5/1.22 viables), va **después de la F21** (a la que
  reusa) y **antes de la F22** (que reusa su cobre/amatista). No renombra la
  serie F21→F25.
- **Qué hay hoy (verificado):** `FOOD_VALUES` con `CARROT`/`POTATO`/
  `BAKED_POTATO` (F18 C-3); `HONEY` (140) como botín de cofres (F9);
  `SLIME_BALL` (246); `TRIDENT` (245) con física de proyectil lanzable
  (F12) — patrón para la caña; proyectiles en `server/projectiles.js`
  (F12/F13); `explode()` (F10); `BIOME_SPAWN`/`MOB_CLASSES`/`tickSpecies`
  (F12/F13) — patrón para Bogged/variantes; `MOB_PARTS` + `mobtextures.js`
  (F8/F12); mobs: lobo, slime, ocelote/gato, ahogado, oveja, pollo, conejo
  (F12); estructuras deterministas por hash 2D (F12, `server/structures.js`);
  cofres con tablas de loot (`server/chests.js`); horno con `FUEL_TICKS`
  (F16 D1); daño con armadura/protección (`server/combat.js`); `/help`
  `/tp` `/give` `/time set` `/gamemode` `/kill op` `/reload`/`set_seed`
  (`unit-commands.js`); mundo v6 128 bloques (`SCHEMA_VERSION` 6);
  `public/texturemap.js` (bloque nuevo = color + tesela), `unit-itemicons`.
- **Decisiones de la entrevista (2026-08-15):**
  - Fase nueva **21.5** (entre F21 y F22): reusa lo planificado, no duplica.
  - Los bloques/ítems que ya aportan F21-F23 se **reusan** (abeja F21 C2,
    amatista F22 B1, Breeze F23 A2, Tuff F23 A4, miel F9).
  - La caña reusa la física de proyectil (tridente); la línea es un punto 3D
    simple (bobber), sin encantamientos.
  - Escudo simplificado: se "activa" con clic derecho sin inventario de
    off-hand completo.
  - Vault de Trial Chambers: **decorativo** (cofre de tesoro único, sin
    llave/una-vez-por-jugador).
  - Cobre variantes: **sin oxidación**; simplificado (bloques/escaleras/
    losas/puertas de cobre).
  - Cada bloque nuevo: B/I sincronizados (AMBOS `constants`) + receta +
    icono + tesela (`unit-sync`/`unit-recetas`/`unit-itemicons` en verde).
- La fase cierra con suite + E2E + auditorías en verde y tests propios
     (`unit-fase21.5.js`) en verde.

### 1.4 Iteración de generación D2/D3 (heredada de la F21, 2026-08-17)

Al cerrar la Fase 21 el usuario decidió **diferir a esta fase los dos bugs
de generación que quedaron abiertos de la v21.2** (spec F21 §5.4). Tocan
`server/biomes.js`/`server/generation.js` y `tests/audit-altura.js`/
`unit-biomas.js` (misma receta que el D1 que sí cerró la F21):

| # | Bug (Notas) | Qué hacer | Criterio de aceptación |
|---|---|---|---|
| **D2** | **Océanos poco profundos** — sin variantes cálidas/profundas | **Aumentar la profundidad** del fondo oceánico (más lejos de la costa); **océano cálido** con **corales** (bloques/ítems nuevos sincronizados B/I + receta + icono — coral está en la tabla §9) y **océano profundo** (fondo más hondo); **no aumentar la probabilidad** de océano (`OCEAN_FREQ`/`OCEAN_GATE` intactos) | Test determinista: la profundidad media del fondo crece vs v21.1; existen regiones de océano cálido (con coral en su paleta) y profundo; `unit-biomas`/`unit-mundo` en verde |
| **D3** | **Montañas bajas** — sin montañas altas ni nevadas | **Elevar las montañas base** (amplitud de la rampa/crest en `biomes.js`) manteniendo el rango v6 (Y ≤ +63) y los sub-biomas; los **picos nevados** (F21 A2) quedan sobre montañas realmente altas | Test determinista: la cima media/máxima de montaña crece vs v21.1 (dentro del presupuesto de `audit-altura`), la línea de nieve cubre más cumbres y `unit-biomas` (montaña máx ≥ 7) se recalibra sin romperse |

**Orden:** D2 (océanos) → D3 (montañas), con su test y su verificación
(`--audit` sin regresiones). **Sin cambios de protocolo WS, IDs B/I (salvo
los corales que D2 añade con su sync) ni `SCHEMA_VERSION`.**

---

## 2. Bloque A — Pesca (subfase A)

### A1 — Caña de pescar y sistema de pesca (1.7/1.13)

- **Qué hacer:** ítem nuevo `FISHING_ROD` (I, con durabilidad estilo
  herramienta: `TOOL_DURABILITY` 64). Clic derecho lanza la línea: una
  **entidad proyectil** (reusar `server/projectiles.js`, patrón tridente
  F12) con un **bobber** = punto 3D simple en la punta. Al impactar en agua,
  tras un tiempo aleatorio (p. ej. 1.5-5 s), "pica"; al recoger se entrega
  un ítem de la **tabla de loot de pesca**: pescado (cod/salmon/pufferfish/
  tropical, p. ej. `COD`/`COOKED_COD` y ítems nuevos si aplica), tesoro
  (bow, enchanted book no — sin encantamientos; varas, name tag... lo que
  exista o se añada sincronizado) y basura (stick, string, bottle...).
  Si la línea aterriza fuera de agua no pica (o pica basura según MC).
  Soltar el clic antes de picar devuelve la caña sin gastar durabilidad.
- **Qué no incluir:** tipos de cañas ni encantamientos; el bobber no se
  modela (punto 3D simple).
- **Ficheros:** `server/constants.js` + `public/constants.js` (ítem y loot
  nuevos si aplica), `server/projectiles.js` (entidad línea), `server/
  mobs.js`/`server/projectiles.js` (tick del bobber), `server/chests.js` o
  `server/fishing.js` (tabla de loot), `public/**` (render del bobber +
  animación), `recetas.json` (caña = 3 palos + 2 hilo), `tests/unit-fase21.5.js`.
- **Criterio:** test: lanzar al agua → pica y entrega un ítem de la tabla;
  fuera del agua → no pica; durabilidad descontada solo al recoger un
  ítem; receta válida (`unit-recetas`); `unit-sync`/`unit-itemicons` en verde.

### A8 — Pesca en cofres (botín de pesca)

- **Qué hacer:** añadir **cañas de pescar rotas** (durabilidad baja) a las
  tablas de loot de cofres del mundo (`server/chests.js` `LOOT_TABLE`,
  `TEMPLATE_LOOT_TABLE`, `SHIPWRECK_LOOT_TABLE` y las de F21 si aplican):
  1 stack `FISHING_ROD` con durabilidad 1-20.
- **Criterio:** test: los cofres pueden contener una caña con durabilidad
  < 64; sin romper los tests de loot existentes.

---

## 3. Bloque B — Bloques decorativos y vegetación (subfase B)

### B1 — Piedra pulida: granito, diorita, andesita (1.8)

- **Qué hacer:** bloques nuevos `GRANITE`, `DIORITE`, `ANDESITE`
  (y variantes pulidas `POLISHED_*`) en vetas subterráneas (generación por
  hash 2D en `server/generation.js`, reusando el patrón de minerales);
  B/I sincronizados + tesela + receta (4 diorita + ... o crafteo del
  pulido) e iconos.
- **Criterio:** test: con la semilla fija se generan vetas; `unit-sync`/
  `unit-recetas` en verde; `unit-itemicons` con teselas válidas.

### B2 — Linternas (1.14)

- **Qué hacer:** bloque `LANTERN` que cuelga del techo o se coloca en el
  suelo (orientación por la cara mirada, como antorcha); **emisor de luz**
  (reusar el pipe de luz de la antorcha → `lighting.js`/cliente); ítem
  crafteable (4 lingotes + antorcha). Sin colgadura por cadena (simplificado).
- **Criterio:** test: colocar en suelo/techo, luz emitida como la antorcha;
  `unit-sync` en verde.

### B3 — Bambú y andamios (1.14)

- **Qué hacer:** `BAMBOO` (planta alta que crece hasta 12 bloques, se
  **genera estáticamente** — sin crecimiento con el tiempo), `BAMBOO_PLANKS`
  (tablones, crafteo), `SCAFFOLDING` (bloque **no sólido** que se puede
  colocar y atravesar hacia arriba, como en MC simplified: al colocar bajo
  los pies te sube). Bambú como ítem para craftear los andamios/tablones.
- **Qué no incluir:** crecimiento dinámico del bambú; colapsos del andamio
  (simplificado: solo bloque escalable por encima).
- **Criterio:** test: bambú generado hasta 12 bloques; colocar scaffolding
  bajo el jugador lo eleva; `unit-sync`/`unit-recetas` en verde.

### B4 — Colmenas y miel (1.15)

- **Qué hacer:** bloques `BEE_NEST` (generado en árboles tipo flor/abedul,
  estático) y `BEE_HIVE` (crafteado). Clic derecho con botella de vidrio →
  `HONEY_BOTTLE` (comida 6/1.2 en `FOOD_VALUES`) — y opción a `HONEY_BLOCK`
  (reduce el daño de caída) con crafteo de 4 botellas. Reusar las **abejas
  de la F21 (C2)** que vuelan alrededor de la colmena. `HONEY` (140) sigue
  como botín (F9); la botella de vidrio (item de cristal) hay que
  sincronizarla si no existe.
- **Qué no incluir:** polinización que crezca cultivos (solo vuelan).
- **Criterio:** test: recolectar miel con botella, comida restaura 6/1.2,
  `HONEY_BLOCK` reduce la caída; `unit-sync`/`unit-recetas` en verde.

### B5 — Coral y algas (1.13)

- **Qué hacer:** bloques `CORAL_BLOCK`, `CORAL_FAN`, `KELP` (planta que crece
  hacia arriba en el agua), `SEAGRASS`; **arrecifes de coral** generados en
  océanos cálidos (decisión: un bioma/región "océano cálido" acotado por
  hash, o decoración sobre océano existente — elegir en la entrevista).
  **Estático** (sin decoloración fuera del agua).
- **Hecho (2026-08-18):** `CORAL_BLOCK` (72) era de la D2; se añaden
  `CORAL_FAN` (86), `KELP` (87) y `SEAGRASS` (88), plantas no sólidas que se
  rompen al instante y caen a sí mismas. El arrecife lleva `CORAL_FAN` en la
  segunda celda de agua; en el resto del océano (fuera de arrecife) el lecho
  es `SEAGRASS` y columnas con `kelpTallAt` suben de 2 a 6 bloques de `KELP`
  (determinista por columna).
- **Criterio:** test determinista: arrecifes en la zona cálida con la
  semilla fija; `unit-sync` en verde.

---

## 4. Bloque C — Combate y bloques funcionales (subfase C)

### C1 — Horno de fundición (Blast Furnace, 1.14)

- **Qué hacer:** bloque `BLAST_FURNACE`: funde **minerales el doble de
  rápido** que el horno; UI propia (reusar `#furnace-ui` con variante);
  receta de crafteo (5 lingotes + horno). Estado separado de los
  `state.furnaces` (persistencia: extender a `state.blastFurnaces` o
  identificador de tipo en el horno, decisión documentada — sin cambiar
  `SCHEMA_VERSION` si es retrocompatible).
- **Criterio:** test: receta de mena en el blast furnace va a la mitad de
  ticks; `unit-sync`/`unit-recetas` en verde.

### C2 — Escudo (1.9) — ✅ IMPLEMENTADO (2026-08-19)

- **Qué hacer:** ítem `SHIELD` (sin off-hand completo): se lleva en la mano
  activa y al pulsar **clic derecho** se **bloquea y reduce el daño**
  entrante (estilo armadura: factor de reducción; parar activa una
  animación/pose en cliente, brazo extendido). Durabilidad. Crafteo (1
  lingote + 6 tablones). Mobs del mundo y proyectiles respetan la reducción.
- **Qué no incluir:** off-hand completo; encantamientos.
- **Decisión documentada:** sin off-hand, el bloqueo se hace manteniendo el
  clic derecho con el escudo en la MANO ACTIVA. No hay ángulo de bloqueo ni
  encantamientos. `SHIELD_BLOCK_FACTOR = 0.4` (absorbe el 60 % del daño de
  mobs/proyectiles) y se aplica ANTES de la armadura (orden bloque→armadura
  de Minecraft); el daño ambiental (lava, fuego, caída, inanición) NO se
  bloquea. Desgaste: 1 punto por impacto absorbido (durabilidad 336, valor
  oficial MC); al llegar a 0 el escudo se rompe (`shield_broke`) y el
  jugador deja de bloquear. La "pose" del cliente es una viñeta + retícula
  (sin modelo 3D de brazo, fuera de alcance).
- **Criterio:** test: con el escudo activo el daño se reduce (assert en
  `unit-fase21.5` sección C2); `unit-sync`/`unit-recetas` en verde.
  Resultado: suite `--unit` completa en verde en el árbol limpio del commit.

### C3 — Tótem de inmortalidad (1.11) — ✅ IMPLEMENTADO (2026-08-19)

- **Qué hacer:** ítem `TOTEM_OF_UNDYING`: al recibir daño letal, si va en
  la mano, **evita la muerte**, cura (p. ej. mitad de vida), da absorción y
  se consume. Se obtiene en cofres (mansión de la F21, Trial Chambers D1).
- **Qué no incluir:** efecto de partículas doradas (opcional visual), totem
  en ambas manos.
- **Decisión documentada:** sin "mano secundaria" (off-hand completo), el
  tótem se activa SOLO en la MANO ACTIVA. Evita la muerte ante daño letal de
  CUALQUIER fuente (mobs, proyectiles, caída, lava, fuego, inanición), salvo
  el vacío (net.js respawnea directo, como MC). Efecto: cura la mitad de la
  vida máxima (10 HP) y otorga `TOTEM_ABSORPTION_HP = 8` (4 corazones
  dorados, el valor de la Absorción II de MC) que absorben daño antes que la
  vida; se consume (count −1). El HUD pinta los corazones dorados como
  "+N" ámbar junto a la vida (sin partículas, fuera de alcance). Sin receta:
  solo loot de cofres. Interino: entra en el tesoro del templo de jungla
  (`chests.js TEMPLE_LOOT_TABLE`) hasta que existan la mansión (F21 P1) y
  las Trial Chambers (D1), sus fuentes oficiales. `isTool` solo a efectos de
  inventario (no se apila, count 1) y SIN durabilidad propia (no en
  `TOOL_DURABILITY`).
- **Criterio:** test: con totem en mano no mueres y se consume; sin totem
  mueres; assert en `unit-combat`/`unit-fase21.5`. Resultado: sección C3 de
  `unit-fase21.5` en verde (7 checks: ID/constantes, no-muerte, absorción,
  consumo, absorción absorbe daño, otra ranura no salva, daño no letal no
  consume).

### C4 — Camas de colores (1.12)

- **Qué hacer:** 16 camas de colores (`B.BED_*` con los 16 tintes) — mismo
  comportamiento que la cama roja (dormir, respawn), distintos IDs/teselas.
  Crafteo cama + tinte.
- **Criterio:** test: 16 camas funcionales (dormir) y crafteo por tinte;
  `unit-sync`/`unit-recetas` en verde.

### C5 — Bloques de concreto (1.12)

- **Qué hacer:** 16 bloques de **concreto** + 16 de **polvo de concreto**.
  El polvo cae con gravedad (reusar la física de arena/grava, F10) y al
  tocar agua se convierte en concreto sólido — **o simplificado sin
  conversión** si la física de agua lo complica (decisión documentada;
  preferible la conversión simple reusando el check de agua existente).
- **Criterio:** test: el polvo cae; si se simplifica, el bloque sólido cura
  crafteable; `unit-sync` en verde.

---

## 5. Bloque D — Trial Chambers y contenido 1.21 (subfase D)

### D1 — Cámaras de Prueba (estructura) + Vault decorativo

- **Qué hacer:** estructura subterránea generada en **deepslate** (tras la
  F22 A3, o acotada a capas profundas del v6): pasillos y salas con cofres
  de botín y el bloque `VAULT` **decorativo** (tesoro único, sin
  llave/una-vez-por-jugador). Determinista por hash 2D (patrón F12/F21).
- **Qué no incluir:** Trial Spawner/Ominous Spawner (oleadas), eventos
  ominous, Vault funcional con llaves.
- **Criterio:** test determinista de la estructura en su capa;
  botín coherente; `unit-sync` en verde.

### D2 — Bogged (esqueleto de pantano) — Breeze ya está en F23 A2

- **Qué hacer:** mob hostil **Bogged** (1.21): esqueleto de pantano que
  dispara flechas con efecto de **veneno** (reusar IA del esqueleto +
  proyectil con estado `poison`). Spawn en el bioma de pantano (y mana/o
  jungle? — decisión: pantano). Patrón F12: subclase con `tickSpecies`,
  `MOB_PARTS` + textura, drop/XP en `unit-paridad`.
- **Nota de coordinación:** el **Breeze** ya está planificado en la **F23
  (A2)**; este bloque solo se implementa aquí si al abrir la fase se
  decide unificar — en caso de duplicarse se marca el otro como
  "cubierto por F21.5" en `TODO.md`. La carga de viento (D5) es drop del
  Breeze (F23).
- **Criterio:** test: dispara flecha de veneno; aparece en el pantano; sin
  regresión de esqueletos.

### D3 — Maza (1.21) + Núcleo Pesado — ✅ IMPLEMENTADO (2026-08-19)

- **Qué hacer:** arma nueva `MACE` + `HEAVY_CORE` (se encuentra en Trial
  Chambers). Daño mejora con la **altura de caída** al golpear
  (`attack_mob` en `server/actions.js`); receta maza = heavy core + breeze
  rod (D5). Durabilidad media.
- **Decisión documentada (paridad con cooldown):** como en MC Java la maza
  tiene daño base 6 y una "embestida" que suma más cuanta más altura de
  caída (1-10 bloques → +5 de daño por cada bloque), y ESTE CLON no simula
  el cooldown de ataque, el directo es: daño base 6 (en `TOOL_DAMAGE`) +
  `MACE_FALL_DAMAGE_PER_BLOCK` (1) por cada bloque completo de caída
  acumulada (`fallFromY`, que el servidor mantiene mientras el jugador está
  en el aire) si la caída supera `MACE_FALL_MIN_BLOCKS` (1.5). Sin
  embestida (de pie) pega 6, igual que la espada de hierro, pero NO se
  desgasta con el ataque más allá de la durabilidad propia (250, sincr.
  `DURABILITY`/`TOOL_DURABILITY`).
- **Decisión documentada (obtención):** `HEAVY_CORE` y `BREEZE_ROD` no
  tienen fuente de loot todavía (Trial Chambers = D1, Breeze = F23); ambos
  entran en el catálogo creativo (con la maza) para poder probar la
  embestida. La receta `mace` (181+271 → 272) queda definida y se activa en
  cuanto esas fuentes existan.
- **Criterio:** test: daño con caída > sin caída (assert numérico);
  `unit-sync`/`unit-recetas` en verde. Resultado: `unit-sync`,
  `unit-recetas`, `unit-fase21.5` y `unit-itemicons` en verde; verificación
  numérica de la embestida (maza base 6, caída de 10 → 16).

### D4 — Familia de cobre y Tuff expandidos (1.21)

- **Qué hacer:** sobre el cobre de la F22 (A5: solo bloque) y el `TUFF` de
  la F23 (A4): **variantes de cobre** (escaleras, losas, puertas — sin
  oxidación, simplificado) y resto de la familia de **tuff** (bloque pulido/
  ladrillo) como bloques decorativos crafteables.
- **Qué no incluir:** oxidación por tiempo; cobre cortado (cut) si no entra.
- **Criterio:** test: crafteos de las variantes; `unit-sync`/`unit-recetas`
  en verde; no duplica IDs de F22/F23 (coordinación en `TODO.md`).

### D5 — Ítems de Trial Chambers y Breeze

- **Qué hacer:** `WIND_CHARGE` (proyectil lanzable que empuja — reusar
  knockback), `BREEZE_ROD` (drop del Breeze), `TRIAL_EXPLORER_MAP` (ítem
  decorativo/funcional = brújula hacia la Trial Chamber más cercana, si el
  sistema de localización lo permite). B/I sincronizados + recetas + iconos.
- **Criterio:** test: la carga de viento empuja; `unit-sync`/`unit-recetas`
  en verde.
- **✅ IMPLEMENTADO (2026-08-20, parcial):** la carga de viento está
  completa — `WIND_CHARGE` (270) se lanza con clic derecho (nuevo evento WS
  `throw_wind_charge`, handler `actions.handleThrowWindCharge`); `server/
  projectiles.js` hostea el bloque: `throwWindCharge(player)` consume 1 del
  inventario (un solo uso, no vuelve), el proyectil vuela con `kind: "wind"`
  en `tickArrows` (recto, sin gravedad, `WIND_SPEED` 16, vida 1500 ms) y al
  impactar un bloque/mob/jugador dispara `windBurst(bx,by,bz)`: ráfaga
  radial sin daño (`WIND_BURST_RADIUS` 3, alcance vertical ±3) — jugadores
  reciben el evento WS `knockback` + `p.kbUntil` (600 ms), mobs `m.kb`
  (fuerza 0.8, up 0.45, ttl 10). Física del viento. Tests en `tests/unit-fase21.5.js`
  (D5). Receta `wind_charge` = 1 `BREEZE_ROD` → 4 (recetas.json); iconos de
  270/271/273 ya estaban en `itemicons.js`. **Pendiente (depende del Breeze,
  F23):** `BREEZE_ROD` es su drop y `TRIAL_EXPLORER_MAP` su botín/brújula —
  no son crafteables, su fuente llega con el mob; la carga que suelta el
  Breeze aún no queda libre.

### D6 — Discos de música, pinturas y partituras

- **Qué hacer:** ítems visuales/auditivos: 2-4 discos de música (sustituyen
  la música ambiental según el disco, cliente `public/audio.js`), pinturas
  (cuadros decorativos colocables), partituras/librería sonora (audio).
  Van detrás del sistema de audio por bioma de la F19.5.
- **Criterio:** colocar/reproducir sin regresión de audio; `unit-sync` en
  verde.

---

## 6. Bloque E — 1.21.5 "Spring to Life" (subfase E)

### E1 — Variantes de animales por bioma

- **Qué hacer:** campo/variante `variant` (frío/cálido/templado) en la
  común/base de cerdos, vacas y gallinas (los nuevos de la F21 C1 y los
  existentes): se elige por el bioma de spawn y se refleja en la textura
  (`MOB_PARTS`/`mobtextures.js`). Retrocompatible (no cambia el wire).
- **Criterio:** test: el mob de un bioma frío nace con su variante;
  `unit-sync`/`unit-mobs-*` en verde.
- **✅ IMPLEMENTADO (2026-08-20):** `ANIMAL_VARIANT` + `animalVariantFor`
  en `server/mob-spawn.js` (asignado al spawnear; la cría lo hereda de un
  padre al azar en `mob-species.js`). El snapshot ya llevaba `variant` y el
  tinte cliente (`VARIANT_TINT`) existía; esta tarea conecta origen y
  destino. Templados → base (sin tinte); fríos → "cold"; cálidos/áridos →
  "warm".

### E2 — Color de lana de oveja según bioma

- **Qué hacer:** las ovejas spawnan con lana de color según bioma (blanco
  templados, negro fríos, etc. — paleta acotada), extendiendo `variant` de
  E1 a la oveja. Al esquilar se obtiene la lana de ese color (reusar tintes).
- **Criterio:** test determinista por bioma; sin regresión de esquileo
  (F11).

### E3 — Bloques decorativos 1.21.5

- **Qué hacer:** `FIREFLY_BUSH` (arbusto de luciérnagas, luz suave opcional),
  `LEAF_LITTER` (hojarasca), `WILDFLOWERS`, `BUSH`, `SHORT_DRY_GRASS`/
  `TALL_DRY_GRASS` (hierba seca), `CACTUS_FLOWER` — estáticos, en biomas
  templados/desierto/badlands según corresponda. B/I + tesela + icono.
- **Criterio:** test de generación determinista por bioma; `unit-sync`.

### E4 — Partículas de hojas cayendo

- **Qué hacer:** el cliente emite **partículas de hojas cayendo** bajo los
  árboles (decisión de frecuencia); opción "reducir movimiento" (F19.5 B4)
  las atenúa. Puramente visual (`public/particles.js`).
- **Criterio:** verificación manual en navegador; FPS sin penalización
  relevante.

### E5 — Sonidos ambientales desierto/badlands

- **Qué hacer:** añadir ambientes de desierto y badlands al sistema de
  audio por bioma de la **F19.5 (A1)** (paleta sonora distinta: viento/
  arena). Encaja con la música generativa existente.
- **Criterio:** verificación manual en navegador en esos biomas.

---

## 7. Bloque F — Pale Garden, Creaking y Mochila (subfase F: 1.22/26.1)

### F1 — Bioma Jardín Pálido (Pale Garden)

- **Qué hacer:** bioma nuevo con **roble pálido** (pale oak) y **musgo
  claro** (losas/tejido claro): superficie pálida, poca fauna, niebla
  ligera. Determinista (patrón A2 de la F21). Genera los árboles de roble
  pálido y el bloque de musgo pálido (B nuevos).
- **Criterio:** test determinista del bioma; `unit-biomas` en verde.

### F2 — Mob Crujiente (Creaking)

- **Qué hacer:** mob que **solo se mueve cuando el jugador no lo mira**
  (detección de línea de visión del jugador en el servidor — raycast del
  jugador al mob); al mirarlo se queda quieto y no es golpeable (o se
  paraliza, decisión documentada); de noche aparece en el Pale Garden.
  Patrón F12 + `unit-mobs-ia` ampliado.
- **Qué no incluir:** el complejo vínculo de comportamiento por bloques
  (fuera de F3 mostrable).
- **Criterio:** test de IA: con mirada → quieto; sin mirada → se mueve.

### F3 — Corazón Crujiente (Creaking Heart)

- **Qué hacer:** bloque que **vincula** al Creaking: mientras esté intacto,
  el mob revive/no muere; al destruirlo se mata al Creaking asociado
  (degeneración: el creepdrop puede morir de nuevo). Lógica de vínculo
  mob↔bloque en `server/world.js`/`mobs.js`.
- **Criterio:** test: destruir el corazón mata al mob vinculado; sin
  regresión de mobs.

### F4 — Mochila (Bundle)

- **Qué hacer:** ítem que **abre un segundo inventario** (cofre portátil)
  al usarlo (clic derecho) → nueva UI (patrón cofre/horno), slots
  adicionales persistidos con el jugador (retrocompatible o `SCHEMA_VERSION`
  7 con migración, decisión documentada — preferible campos aditivos del
  inventario sin quitar `SCHEMA_VERSION` 6 si es viable).
- **Criterio:** test: guardar/recuperar ítems en la mochila monitorizada;
  persistencia redondeada al reiniciar.

---

## 8. Bloque G — Comandos y selectores (subfase G)

- **Qué hacer:** ampliar la consola de comandos (`server/commands.js` o
  donde viva la lógica; actualmente `/help /tp /give /time set /gamemode
  /reload /kill op` en `unit-commands.js`) con:
  - **`/weather <clear|rain>`** — alterna el clima visual (F10 tenía
    partículas de lluvia? verificar; si el clima no existe, se añade el
    estado + efecto visual, minimo).
  - **`/kill [@s|@e|jugador]`** — generalizar el actual (op).
  - **`/locate <structure|biome>`** — devuelve la estructura/bioma más
    cercano (reusando la localización determinista por hash de F12/F21).
  - **`/effect <get|give|clear>`** — aplicar/quitar efectos (veneno,
    absorción, resistencia... los que el juego tenga).
  - **`/summon <mob>`** — invocar mob.
  - **`/ban <jugador>`**, **`/op <jugador>`** y **`/list`** — gestión de
    operadores y conexiones (bajo; sin BD: estado en memoria/
    `world.json` operadores; rechazos de conexión).
  - **Selectores de objetivo `@p @a @e @s @r`** en los comandos que
    apuntan a jugadores/mobs, con resolución en el handler.
  - Actualizar `/time set` si hace falta (`day`/`night`/valor).
- **Qué no incluir:** full data-pack/comando `test` (Won't), permisos por
  rango fuera de operador.
- **Ficheros:** `server/commands.js`/`server/actions.js` (parsing +
  selectores), `server/constants.js` + `public/constants.js` (mobs/items/efectos
  nuevos si aplica), `public/chat*` (autocompletado opcional),
  `tests/unit-commands.js` (ampliado) + `unit-fase21.5.js`.
- **Criterio:** cada comando nuevo con su test (incluida la resolución de
  selectores); `unit-commands.js` en verde; los selectores no rompen el
  formato `{event,data}`.

---

## 9. Bloques/ítems nuevos a sincronizar (fuentes de verdad)

Resumen de lo nuevo (regla `AGENTS.md`: añadir bloque/ítem → AMBOS
`constants.js` + receta + icono + tesela):

| Subtipo | Ítems/bloques |
| --- | --- |
| Pesca | `FISHING_ROD`, loot (pescados/tesoro/basura según exista) |
| Decorativo 1.8 | `GRANITE`, `DIORITE`, `ANDESITE`, `POLISHED_*` |
| Luz/vega | `LANTERN`, `BAMBOO`, `BAMBOO_PLANKS`, `SCAFFOLDING` |
| Miel | `BEE_NEST`, `BEE_HIVE`, `HONEY_BOTTLE`, `HONEY_BLOCK` |
| Acuático | `CORAL_BLOCK`, `CORAL_FAN`, `KELP`, `SEAGRASS` |
| Combate | `BLAST_FURNACE`, `SHIELD`, `TOTEM_OF_UNDYING`, `MACE`, `HEAVY_CORE` |
| Camas | 16× `BED` color |
| Concreto | 16× `CONCRETE` + 16× `CONCRETE_POWDER` |
| Trial | `VAULT` (decorativo), `WIND_CHARGE`, `BREEZE_ROD`, `TRIAL_EXPLORER_MAP`, discos/pinturas/notas |
| 1.21.5 | `FIREFLY_BUSH`, `LEAF_LITTER`, `WILDFLOWERS`, `BUSH`, `*_DRY_GRASS`, `CACTUS_FLOWER` |
| 1.22 | Pale oak, musgo pálido, `CREAKING_HEART`; `BUNDLE` |

> No incluir los ya planificados en F21 (amatista NO — F22 B1; tuff Tuff F23
> A4; breeze/load F23 A2). Coordinar IDs para no duplicar (nota cruzada en
> `TODO.md` F21 D2/F22 B1/F23 A4).

---

## 10. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/constants.js` + `public/constants.js` | B/I nuevos (regla AMBOS) |
| `server/generation.js` / `server/structures.js` | vetas (B1), arrecifes (B5), trial chambers (D1), pale garden (F1), variantes por bioma (E1/E2) |
| `server/projectiles.js` | línea de pesca (A1), wind charge (D5), flecha venenosa (D2) |
| `server/mobs.js`/`mob-species.js`/`mob-spawn.js` | Bogged (D2), Creaking (F2), Creaking Heart (F3), variantes (E1/E2) |
| `server/combat.js` | escudo (C2), tótem (C3), maza con caída (D3) |
| `server/fishing.js` (nuevo) | tabla de loot y lógica de pesca (A1/A8) |
| `server/chests.js` | loot de cañas (A8), Trial Chambers (D1) |
| `server/crafting.js`/`recetas.json`/`recetas_horno.json` | recetas nuevas; blast furnace (C1) |
| `server/commands.js`/`server/actions.js` | comandos + selectores (G1) |
| `server/players.js`/`inventory.js` | mochila (F4), escudo/tótem en mano (C2/C3) |
| `public/texturemap.js`/`textures.js`/`itemicons.js` | teselas e iconos |
| `public/ui.js`/`panels.js` | UI blast furnace (C1), mochila (F4), discos/pinturas (D6) |
| `public/audio.js` (tras F19.5) | discos, ambientes desierto/badlands (E5/D6) |
| `public/particles.js` | hojas cayendo (E4) |
| `docs/tests.md` | `unit-fase21.5.js` + código de la matriz |
| `tests/unit-fase21.5.js` (nuevo) | los asserts de todos los bloques |

> **Tests que cubren esta fase (previstos):** `tests/unit-fase21.5.js`,
> `tests/audit-fase21.5.js`; ampliar `unit-commands.js`, `unit-sync.js`,
> `unit-recetas.js`, `unit-itemicons.js`, `unit-mobs-ia.js`. (Cada test
> nuevo lleva `// Fase 21.5, Bloque X` al inicio.)

---

## 11. Decisiones del proyecto (resumen)

| # | Tema | Decisión |
|---|------|----------|
| 1 | Ubicación | Fase 21.5 entre F21 y F22; no renumerar F21-25 |
| 2 | Pesca | línea = proyectil (patrón tridente), bobber punto 3D, sin encantamientos |
| 3 | Escudo | simplificado (clic derecho reduce daño, sin off-hand completo) |
| 4 | Vault | decorativo/tesoro único, sin llave ni seguimiento por jugador |
| 5 | Cobre | sin oxidación (bloques/escaleras/losas/puertas) |
| 6 | Bambú | crecimiento estático; andamio = bloque no sólido escalable |
| 7 | Miel | sin polinización de cultivos; `HONEY` (140) sigue como botín |
| 8 | Coral | estático en océano cálido, sin decoloración |
| 9 | Concreto | polvo con gravedad; conversión por agua si es barata, si no documentar |
| 10 | Mochila | segundo inventario (cofre portátil); persistencia retrocompatible si es viable |
| 11 | Zanahoria/patata | **YA HECHO** (F18 C-3) — no planificar, solo marcar |

---

## 12. Cierre y auditoría de la Fase 21.5 (tarea obligatoria)

1. Suite unitaria completa en verde (incluido `unit-fase21.5.js`,
   `unit-sync`, `unit-recetas`, `unit-itemicons`, `unit-commands`,
   `unit-mobs-ia`), E2E clásicos + menú, `node --check` y `biome check` 0
   errores.
2. Auditorías por fase sin regresiones (`--audit` 6/6 y las de generación
   F4/F21 si tocan biomas, o F22 si entra la altura A1 de F22 — aquí no).
3. Verificación manual en navegador: pescar, colocar linterna, escalar
   andamios, recolectar miel, ver arrecife, escudo/maza/tótem, Trial
   Chamber, variantes y decorativos 1.21.5, Pale Garden/Creaking, usar la
   mochila y los comandos nuevos con selectores.
4. `SCHEMA_VERSION` 6 intacto a menos que la mochila (F4) o la conversión de
   concreto lo exijan, con migración + test si sube.
5. Docs al día: `docs/server/mecanicas.md` y `docs/public/mecanicas.md`
   (pesca, escudo, maza, comandos, variantes), `docs/tests.md` (matriz),
   `docs/README.md` (índice), `AGENTS.md` (estado), `TODO.md` (F21.5
   cerrada) y `DEPENDENCIAS.md` (nodo en el grafo).

---

## 13. Criterios de aceptación (resumen)

1. Cada bloque/ítem nuevo sincronizado B/I + receta + icono + tesela
   (`unit-sync`/`unit-recetas`/`unit-itemicons` en verde).
2. Pesca: lanzar→picar→item de la tabla; solo en agua; durabilidad correcta.
3. Escudo reduce daño, tótem evita la muerte, maza escala con la caída
   (asserts numéricos en `unit-fase21.5.js`).
4. Trial Chambers deterministas en su capa con Vault decorativo; Bogged con
   veneno en pantano; sin Trial Spawner/ominous (Won't).
5. Variantes 1.21.5 por bioma y decorativos estáticos con test determinista.
6. Pale Garden/Creaking/Corazón/Mochila con su mecánica testeada.
7. Comandos nuevos con selectores resueltos y cada uno con test
   (`unit-commands.js` en verde).
8. Cierre con suite/E2E/auditorías en verde, docs y tracker al día, Won't
   respetado (no redstone/aldesanos/vault funcional/test command).

> **Tests que cubren esta fase:** `tests/unit-fase21.5.js`, `tests/audit-fase21.5.js`.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-15: creación del spec (planificación de la fase 21.5) a partir de
  la lista de mejoras del usuario (alta/media prioridad + 1.21/1.21.5/1.22/
  comandos) y la entrevista 2026-08-15 (fase nueva entre F21 y F22, reusando
  lo planificado en F21-23 y lo ya implementado: zanahoria/patata F18 C-3,
  miel F9 y huecos).

**Cambios en esta spec (v2):**
- 2026-08-17: **apertura de la Fase 21.5** (prerrequisito F21 cumplido) —
  estado `[EN CURSO]`; nueva sección §1.4 con los **diferidos de generación
  D2/D3 de la F21** (océanos profundos/cálidos con coral y montañas
  altas/nevadas), su orden y criterios de aceptación; cabecera y
  `TODO.md`/`STATUS.md`/`DEPENDENCIAS.md` actualizados (fase activa).