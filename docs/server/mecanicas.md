# Servidor — Mecánicas de juego (índice)

> Cada mecánica tiene su **fichero independiente** con la misma estructura:
> cómo funciona actualmente, por qué se tomó la decisión, mejoras a futuro
> y una tabla de **constantes/funciones, cambios a realizar y resultados
> esperados**. Para la arquitectura general ver
> [`README.md`](./README.md). Los IDs de bloques/ítems están en
> `server/constants.js` (y sincronizados en `public/constants.js`).
> Qué no puede hacer hoy el proyecto y por qué:
> [`limitaciones-tecnicas.md`](../limitaciones-tecnicas.md).

## Índice de mecánicas

| Mecánica | Fichero | Código |
|---|---|---|
| Generación del mundo (biomas, cuevas, minerales, estructuras, altura) | [`generacion-mundo.md`](./generacion-mundo.md) | `world.js`, `generation.js`, `biomes.js`, `noise.js`, `structures.js` |
| Física y movimiento (anti-cheat, agua/lava, agacharse) | [`fisica-movimiento.md`](./fisica-movimiento.md) | `players.js`, `combat.js`, `anticheat.js` |
| Minería y herramientas (progreso, dureza, durabilidad, drops) | [`mineria-herramientas.md`](./mineria-herramientas.md) | `mining.js`, `constants.js`, `players.js` |
| Bloques con gravedad y TNT (mechas, explosión, knockback) | [`tnt-gravedad.md`](./tnt-gravedad.md) | `tnt.js`, `world.js`, `anticheat.js` |
| Combate, daño, armadura y XP (curva MC, orbes) | [`combate-xp.md`](./combate-xp.md) | `combat.js`, `players.js`, `mobs.js` |
| IA de mobs (especies, spawn por bioma, cría, vaca/gallina) | [`mobs-ia.md`](./mobs-ia.md) | `mobs.js`, `mob-species.js`, `mob-spawn.js`, `projectiles.js` |
| Crafteo y hornos (recetas JSON, combustible, cola FIFO) | [`crafteo-hornos.md`](./crafteo-hornos.md) | `crafting.js`, `recetas.json`, `recetas_horno.json` |
| Cofres y loot (slots, loot de minas, abrir vs romper) | [`cofres-loot.md`](./cofres-loot.md) | `chests.js`, `items.js` |
| Comandos y reloj del mundo (día/noche MC, luna) | [`comandos-reloj.md`](./comandos-reloj.md) | `commands.js` |
| Persistencia (guardado asíncrono, migraciones) | [`persistencia.md`](./persistencia.md) | `save.js`, `save-chunks.js`, `save-meta.js`, `save-players.js` |
| Seguridad y robustez (validación, rate-limit, anti-DoS) | [`seguridad.md`](./seguridad.md) | `net.js`, `actions.js`, `anticheat.js`, `ratelimit.js` |
| Pesca (F21.5 A1/A8; revisada F21.6 P2/P3) | [`pesca.md`](./pesca.md) | `fishing.js`, `projectiles.js`, `chests.js`, `recetas.json` |
| Dimensiones / Nether (**planificada** — F24 A-E, End en F25) | [`dimensiones.md`](./dimensiones.md) | `world-session.js`, `save-*.js`, `nether-gen.js` (nuevo), `mob-species.js` |

## Cambios de la Fase 21.6 (2026-08-22)

Correcciones de la auditoría consolidada + paridad MC pre-F22 (spec
[`../spec/fase21.6-spec.md`](../spec/fase21.6-spec.md); tests en
`unit-fase21.6.js`, 115 checks):

- **Escudo total estilo MC** (`combat.js`): `SHIELD_BLOCK_FACTOR = 0`
  (revoca el 0,4 de la F21.5 C2 — decisión rectora: manda Minecraft real);
  el desgaste es de 1 por impacto bloqueado calculado ANTES de armadura;
  el servidor reválida la mano activa en cada golpe y limpia `p.blocking`
  al cambiar de slot (`net.js`). El daño de proyectil viaja como
  `source: "projectile"` (`projectiles.js`): las flechas PvP ya se
  bloquean (rama muerta corregida).
- **Maza** (`actions.js`/`combat.js`): desgaste al golpear (250 usos, B3)
  y el bonus de caída se consume al impactar (`fallFromY → null`, P6).
- **Pesca paridad** (`fishing.js`): picada entre 5 y 30 s (P2) y tabla de
  loot fiel ≈85/5/10 sin `COOKED_COD` crudo ni `FLINT` en tesoro (P3).
- **Mochila/Bundle** (`actions.js`): put/take con fusión parcial hasta
  `MAX_STACK` — split sin pérdida de ítems, jamás counts >64 (C3).
- **Jukebox/note block**: validación completa de coords finitas,
  distancia NaN-safe y tipo de bloque objetivo (D1); los discos insertados
  se persisten en `world.json` (campo aditivo patrón cofres/hornos,
  `SCHEMA_VERSION` intacto — D3).
- **Comandos**: `/locate <bioma>` incremental con presupuesto por tramo y
  caché TTL 30 s invalidada al cambiar de mundo (A1 — antes congelaba el
  event loop hasta ~66k llamadas); `/summon` respeta la cuota global
  `MOB_TOTAL` (30, compartida con spawn natural y cría) y clampea coords a
  los bordes del mundo (E1).
- **Paridad menor**: miel restaura 6 hambre / 2,4 saturación (P4), tablones
  de bambú 2→2 (P5), blast furnace data-driven hierro/oro/cobre (P7).

## Cambios de la Fase 22 (2026-08-22)

Profundidad, minerales y fauna 1.17–1.21 (spec
[`../spec/fase22-spec.md`](../spec/fase22-spec.md); tests en
`unit-fase22.js`, 115 checks; suite 64/64, `SCHEMA_VERSION` 6 intacto):

- **Veredicto A1:** el mundo se mantiene en **128 bloques** (Y −64..+63);
  benchmark: +100 % memoria/chunk a 256 sin beneficio jugable. A6 (altura
  configurable) no aplica.
- **Terreno 1.18 (A2):** montañas más altas (hasta ~Y=60) y valles
  profundos con ruido 3D multioctava; cuevas más grandes y conectadas
  (`caveStrength` recalibrado) sin romper determinismo.
- **Deepslate (A3):** `B.DEEPSLATE` (192) sustituye la piedra bajo Y=0;
  menas siguen su distribución por profundidad, también en el deepslate.
- **Raw ores (A4):** `I.RAW_IRON` (277), `I.RAW_GOLD` (259),
  `I.RAW_COPPER` (278) — minar hierro/oro/cobre suelta el raw; horno
  funde raw→lingote; blast furnace ×2 data-driven incluye cobre.
- **Cobre (A5):** `B.COPPER_ORE` (193) + `I.COPPER_INGOT` (279) +
  `B.COPPER_BLOCK` — solo el bloque (sin oxidación, decisión documentada).
- **Amatista (B1):** `B.AMETHYST_BLOCK` (194), `B.AMETHYST_CLUSTER`
  (195), `I.AMETHYST_SHARD` (280); cluster en `NON_SOLID_PLANTS`, drop
  de shards al romper con pico; la geoda se mantiene en F21.
- **Catalejo (B2):** `I.SPYGLASS` (281) + receta (1 cobre + 1 ametista);
  zoom FOV real del cliente (toggle ajustes, patrón `SPRINT_FOV`).
- **Deep Dark / Sculk (C1):** `B.SCULK` (196), `B.SCULK_VEIN` (197);
  bandas deterministas (`sculkBand`), generación bajo Y=−40;
  propagación radio 2 al morir mob (`onMobDeath`); sin Warden/shriekers.
- **Rana (D1):** subclase `Frog` (`mob-species.js`), spawn pantano,
  `BREED_FOOD.frog = SLIME_BALL`, `MOB_XP.frog = 1`; IA hunt/eat slimes
  pequeños, prioridad flee, salto por-mob determinista.
- **Rate limit por conexión (G1):** aislamiento verificado — cada `ws`
  tiene sus propios contadores `msgRate`/`actionRate`; test de
  aislamiento en `unit-fase22.js`; documentado en `Notas del usuario.md`.

## El bucle principal (20 ticks/s)

El juego no usa un game loop cliente: corre a **20 ticks/s**
(`TICK_MS = 50`) en el servidor (`server/timers.js`). Cada tick:

1. Avanza el reloj del mundo (`worldTime`).
2. Ticks a los jugadores (física, hambre, lava, caídas — `tickPlayer`).
3. Ticks a los mobs (IA) y flechas (`tickArrows`).
4. Ticks a los hornos y cultivos.
5. Persistencia asíncrona por lotes (solo si hay cola; ver
   [`persistencia.md`](./persistencia.md)).

## Verificación

- Suite unitaria: `node tests/run.js --unit` (64 tests).
- Auditorías por fase: `node tests/run.js --audit` (8).
- E2E con servidor vivo: `SEED=miSemilla2026 PORT=3998 node server.js` +
  `WS_URL=ws://localhost:3998 node tests/run.js --e2e`.
- Cada mecánica enumera sus tests en la sección "Cambios a realizar y
  resultados esperados" de su fichero.
