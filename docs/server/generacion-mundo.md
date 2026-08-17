# Servidor — Mecánica: generación del mundo

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/world.js`, `server/generation.js`, `server/biomes.js`,
> `server/noise.js`, `server/structures.js`.

## Cómo funciona actualmente

- **Ruido determinista por semilla.** `seededNoise(seed)` construye un PRNG
  *mulberry32* sembrado con el string de la semilla; con él se crean los
  generadores `simplex-noise` 2D/3D (`reinitNoise`). Misma semilla → mismo
  mundo, siempre, entre reinicios. Desde la Fase 20 (B4/P4) el RNG por chunk
  es también determinista (sembrado por semilla + `cx,cz`), así que la
  generación **no marca dirty**: explorar no persiste chunks sin cambios.
- **Biomas por temperatura + montañosidad** (`biomeFrom`): llanura, bosque,
  desierto, nieve, montaña, taiga, pantano, jungla y océano. La **Fase 21
  (A1)** bajó la frecuencia del campo de temperatura (`BIOME_FREQ` 0.003)
  para que las regiones sean extensiones amplias, no parches; y la **A2**
  añadió sub-biomas por puertas deterministas (`birch_forest` en la banda de
  bosque, `giant_taiga` en la de taiga con abetos 2×2, `snowy_peaks` en
  montaña con crestas altas). La altura se compone con varias octavas de
  ruido (fBm) y un `smoothstep` que aplana valles (`flatBaseHeight`).
- **Cuevas 3D** (`caveStrength` + `isCaveBlock`): ruido 3D que resta piedra;
  cerca de la superficie se estrechan para no agujerear el suelo.
- **Minerales por profundidad** (`noise2D_ore` con el `y` en la coordenada):
  bandas mapeadas a los percentiles de columna de MC 1.18 (Fase 18 C-2) —
  diamante `y < −38`, redstone `y < −32`, esmeralda `y < −20` (rara, decisión
  heredada de F15), oro `y < −16`, hierro `y < 42`, carbón `−42 < y < 42`.
- **Charcos** (`isPondAt`, `isLavaPondAt`): agua/lava decorativas en
  superficie (la lava solo en biomas cálidos, no en hielo — Fase 10 A3), con
  `nearLake` para la playa agua→arena→tierra.
- **Estructuras** deterministas por **hash 2D con sal** (`structCellHash`):
  minas abandonadas con cofres de loot, templo de jungla con trampa,
  naufragio oceánico, **pozo del desierto** (Fase 21 B1, celdas de 40×40,
  solo en desierto firme — nunca sobre agua) y pozos de agua/lava.
- **Altura del mundo (F15 D5):** `WORLD_HEIGHT = 128` (Y ∈ −64..+63, chunks
  `16×128×16`). La generación trabaja en diseño 0..63 y se re-basa restando
  `DESIGN_OFFSET = 8`: terreno en y≈0, mar en `WORLD_SEA_LEVEL = −3`,
  subsuelo minable de 64 bloques y 64 de cielo. `SCHEMA_VERSION = 6`.
- **Tamaño de mundo** (`WORLD_SIZES`): pequeño 256 / medio 512 / grande 1024
  / infinito 8192; fuera de bordes `generateChunk` devuelve vacío.
- **Spawn determinista** (`findSpawn`): derivado de la semilla y cacheado;
  rechaza toda columna de agua y busca en espiral la seca más cercana.

## Por qué así (decisión)

- **Determinismo = depuración + mundos compartibles.** El mundo se reproduce
  byte a byte: bugs reproducibles y semillas compartibles (el menú lo
  permite). Un PRNG sembrado propio, nunca `Math.random()` global (skill
  `procedural-gen`).
- **Ruido compuesto, no una función.** fBm con varias octavas da relieve
  natural; una sola octava da colinas lisas o ruidosas. La redistribución
  con `pow` aplana valles y afila cumbres.
- **Cuevas estrechas cerca de la superficie** para que no se vean "huecos"
  al caminar.
- **Sub-biomas como puertas sobre las bandas existentes** (F21 A2) en vez de
  umbrales nuevos: no cambian la superficie/árboles de los biomas base y los
  tests de muestras existentes siguen viendo `mountain`/`taiga`/`forest`.

## Mejoras a futuro

1. **Subir el mundo a 256 bloques** (Y −64..+191, como MC 1.18): más espacio
   de construcción y montañas más altas. Es prerrequisito técnico de la Fase
   22 (plan) — exige `SCHEMA_VERSION` 7 + migración retrocompatible +
   recalibración de minerales por percentil y de `audit-altura`.
2. **Más biomas de superficie** (F21 A2, P1): sabana con acacias, badlands,
   bosque oscuro, isla de champiñones — solo si reusan bloques existentes;
   lush/dripstone requieren bloques nuevos sincronizados B/I. (Los
   sub-biomas baratos — abedul, taiga 2×2, picos nevados — ya están
   implementados.)
3. **Estructuras activas** (F21 B2, P1): cabaña del pantano, fortaleza,
   ruinas/monumento oceánico. (La pirámide del desierto con su trampa TNT
   ya está implementada; mansión fuera hasta decisión de presupuesto.)
4. **Geoda de amatista** (F21 B1, P1): reusa los bloques de amatista que
   aporta la Fase 22 (B1) — no duplicar IDs.
5. **Iteración de generación de la F21.5** (diferidos D2/D3 de la F21):
   océanos más profundos/cálidos con corales y montañas altas dentro del
   rango v6 — spec F21.5 §1.4.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `BIOME_FREQ` | `0.003` | Frecuencia del campo de temperatura (escala de biomas, F21 A1) |
| `SUBBIOME_FREQ` / `SUBBIOME_GATE` / `PEAK_GATE` | `0.02` / `0.25` / `0.1` | Puertas de sub-biomas (F21 A2) |
| `MOUNTAIN_THRESHOLD` / `SNOW_TEMP` | — | Banda de montaña / umbral de nieve |
| `WORLD_HEIGHT` / `WORLD_MIN_Y` / `WORLD_MAX_Y` | `128` / `−64` / `+63` | Mundo v6 (F15 D5) |
| `DESIGN_OFFSET` / `SEA_LEVEL` / `WORLD_SEA_LEVEL` | `8` / — / `−3` | Re-base diseño → mundo |
| `WORLD_SIZES` | 256/512/1024/8192 | Tamaños de mundo por semilla |
| `SCHEMA_VERSION` | `6` | Formato de guardado (subir a 7 solo si cambia) |
| `getBiome(wx,wz)` / `getHeight(wx,wz)` | — | Etiqueta y altura (Y de mundo) |
| `generateChunk(cx,cz)` | — | Genera un chunk completo (RNG por chunk determinista) |
| `biomeFrom(temp,mnt,swamp,wx,wz)` | — | Etiqueta base + sub-biomas por gates |
| `isCaveBlock(wx,y,wz,nearSurface)` | — | Excavación de cuevas 3D |
| `isPondAt` / `isLavaPondAt` / `isSwampPoolAt` | — | Charcos decorativos |
| `findSpawn()` | — | Spawn determinista en tierra firme |
| `wellAt` / `wellCenterAt` / `placeWellColumn` | — | Pozo del desierto (F21 B1) |
| `structCellHash(cx,cz,salt)` | — | Hash 2D de estructuras |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Subir el mundo a 256 (F22) | `SCHEMA_VERSION` 7, migración v6→v7 retrocompatible, minerales y auditorías recalibrados por percentil, `audit-altura` en verde |
| Biomas de superficie P1 | Cada bioma nuevo genera con su paleta/vegetación (test determinista por bioma), B/I sincronizados si hay bloque nuevo |
| Pirámide B2 | Estructura determinista solo en desierto, trampa TNT funcional (test F11 reusado), loot coherente |
| Geoda de amatista | Reusa bloques de la F22, suelta shards, sin IDs duplicados |
