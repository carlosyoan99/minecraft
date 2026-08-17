# Servidor — Mecánica: dimensiones / Nether (F24, planificada)

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> **Estado: PLANIFICADA** — la primera dimensión (Nether) se implementa en
> la **Fase 24** (spec [`../spec/fase24-spec.md`](../spec/fase24-spec.md),
> bloques A-E); la Fase 25 añadirá el End reusando esta infraestructura.
> Hoy **no existe** ninguna dimensión (todo el mundo es el overworld); este
> fichero documenta el diseño acordado y queda pendiente de actualizar con
> la implementación real. Código previsto: `server/world-session.js`,
> `server/save-*.js`, `server/nether-gen.js` (nuevo), `server/mob-species.js`.

## Cómo funcionará actualmente (diseño acordado)

### A — Infraestructura de dimensiones

- **Persistencia por dimensión (opción B):** `worldPaths` gana
  `dimension = "overworld" | "nether"` → rutas `world/<semilla>/` (raíz,
  overworld, como hoy) y `world/<semilla>/nether/` (`chunks/` +
  `world.json` propios). **La raíz actual NO se mueve** (sin migración de
  rutas). `world-session.js` activa una dimensión a la vez; el guardado
  usa la misma cola (`save-chunks.js`) apuntando a la carpeta activa. El
  `world.json` del nether guarda su `seed` derivada (hash semilla +
  "nether", determinista), `timeOffset` y `mobs` propios.
- **Posición del jugador por dimensión (sin `SCHEMA_VERSION`):** el archivo
  del jugador gana campos opcionales `dimension` (default `"overworld"`) y
  `positions: { overworld: {x,y,z}, nether: {x,y,z} }`. Lectura
  retrocompatible (ausente → todo overworld). Inventario, salud, comida y
  XP **compartidos** entre dimensiones. Al cambiar, se guarda la posición
  de salida y se restaura la de entrada (o el spawn del portal).
- **Protocolo WS:** `enter_dimension` (C→S) y `dimension_change` (S→C) que
  **reenvía el `init` ya existente** con el seed de la nueva dimensión y el
  spawn de entrada (el cliente renderiza desde cero, sin recargar la página
  — patrón de `sendInit`).

### B — Generación del Nether (128 bloques)

- **`generateNetherChunk`** reusa el formato de chunk v6 (16×128×16) con
  **offset re-anclado: el Nether ocupa Y 0..127** — capa 0 = bedrock (piso),
  capa 127 = bedrock (techo), entre medias netherrack con **cuevas masivas**
  (ruido 3D generoso) y **lagos de lava** (bloque `LAVA` existente) en las
  zonas bajas. Sin cielo/luz solar (nivel de luz bajo constante).
- **2 biomas simplificados** por bandas de ruido: **Nether Wastes**
  (netherrack + hongos dispersos) y **Soul Sand Valley** (soul sand + soul
  soil en superficie, basalto en pilares puntuales).

### C — Bloques del Nether (~15, estáticos)

`NETHERRACK`, `SOUL_SAND` (desacelera), `SOUL_SOIL`, `GLOWSTONE` (emisor de
luz), `NETHER_BRICKS`, `MAGMA_BLOCK` (daño al pisar), `BASALT`,
`BLACKSTONE`, `CRIMSON_NYLIUM`, `WARPED_NYLIUM`, `CRIMSON_FUNGUS`,
`WARPED_FUNGUS`, `CRIMSON_ROOTS`, `WARPED_ROOTS`, `SHROOMLIGHT` (emisor de
luz). Todos **estáticos** (sin crecimiento/oxidación); B/I sincronizados +
tesela + receta + icono (regla `AGENTS.md`).

### D — Mobs y fortaleza

- **4 mobs** con IA por especie existente: **zombified piglin** (neutral,
  efecto dominó), **ghast** (flota, bolas de fuego explosivas),
  **blaze** (flota, ráfagas) y **magma cube** (salta, se divide como el
  slime). Piglin y wither skeleton como ampliación posterior.
- **Fortaleza simplificada:** pasillos rectos de `NETHER_BRICKS` en bandas
  de ruido, 1-2 **spawners de blaze** y cofres con loot del nether. Sin
  trampas de redstone (Won't).

### E — Portal

- Bloque `OBSIDIAN` (minable con pico de diamante, inmune a fuego/lava) +
  **marco 4×5** (hueco interior 2×3) que **se activa al completarse**: al
  colocarse la última obsidiana, el interior se rellena con el bloque no
  sólido `PORTAL` (animado). **Sin mechero ni gesto "usar"** (decisión de
  la entrevista). Teletransporte **8:1** (overworld→nether divide X/Z entre
  8) con spawn en tierra firme.

## Por qué así (decisión acordada)

- **Opción B de persistencia** (carpeta `nether/` sin migrar la raíz): el
  overworld existente de los jugadores NO se toca — cero migración de
  rutas, riesgo mínimo.
- **Sin subir `SCHEMA_VERSION`**: los campos nuevos del jugador
  (`dimension`, `positions`) son opcionales y retrocompatibles; el formato
  de chunk v6 se reusa tal cual (solo cambia la semilla y el offset de
  altura).
- **Reusar `sendInit`** para el cambio de dimensión: el cliente ya sabe
  reconstruir el mundo desde un init; no se inventa un protocolo paralelo.
- **Desbloquea el Won't "dimensiones"** de las fases anteriores (intacto
  hasta abrir la F24).

## Mejoras a futuro (tras la implementación)

1. **End (F25):** tercera dimensión reusando la infraestructura (islas
   flotantes, `positions.end`, portal de regreso) — ya planificado.
2. **Nether completo:** crimson/warped forests, basalt deltas, piglin con
   trueque, wither skeleton (documentados como ampliación posterior).
3. **Portal animado con teletransporte en vivo** — hoy el cambio es
   inmediato (`dimension_change` + init); una transición de pantalla
   (fade) es el siguiente paso visual.
4. **Clima/estado del cielo por dimensión** — el cliente necesita
   `dimension` en el init para elegir paleta de cielo (nether sin estrellas,
   end con estrellas densas).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso (previsto) |
|---|---|---|
| `dimension` | `"overworld" \| "nether"` | Dimensión activa en `world-session.js` |
| `world/<semilla>/nether/` | ruta | Persistencia propia del nether (opción B) |
| `positions: {overworld, nether}` | campos opcionales | Posición por dimensión (retrocompat) |
| `enter_dimension` / `dimension_change` | eventos WS | Cambio de dimensión reusando `init` |
| `generateNetherChunk(cx,cz)` | — | Terreno del nether (Y 0..127, bedrock piso/techo) |
| `seed = hash(semilla + "nether")` | — | Semilla derivada determinista |
| `OBSIDIAN` / `PORTAL` / 15 bloques | B/I nuevos | Bloques del nether sincronizados |
| `mob-species.js` | 4 subclases | zombified piglin, ghast, blaze, magma cube |
| 8:1 | conversión | Teletransporte overworld→nether |

### Cambios a realizar y resultados esperados

| Cambio (F24 A-E) | Resultado esperado |
|---|---|
| Infraestructura A1-A3 | Nether guarda en `world/<semilla>/nether/` sin tocar el overworld; jugador con/sin campos nuevos carga igual; `SCHEMA_VERSION` 6 intacto |
| Generación B1-B2 | Test determinista: mismo nether por semilla, bedrock en Y 0/127, lagos de lava, 2 biomas con su paleta |
| Bloques C | `unit-sync`/`unit-recetas`/`unit-itemicons` en verde; glowstone/shroomlight iluminan; magma daña al pisar |
| Mobs y fortaleza D | Neutralidad/dominó, proyectiles y división testeada; fortaleza determinista con spawner de blaze funcional |
| Portal E | Marco 4×5 que se activa al completarse; teletransporte 8:1 con spawn seguro |
| Actualizar este fichero | Marcar como implementado con las constantes/eventos reales y los tests (`unit-fase24.js`, E2E) |
