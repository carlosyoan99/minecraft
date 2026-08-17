# Servidor — Mecánica: crafteo y hornos

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/crafting.js`, `recetas.json`, `recetas_horno.json`.

## Cómo funciona actualmente

- **Recetas en JSON con hot-reload:** `recetas.json` (55 recetas 3×3) y
  `recetas_horno.json` (12 fundiciones). `watchRecipeFiles` las recarga en
  caliente con **swap atómico**: un JSON inválido conserva las anteriores.
- **Match por patrón:** `matchRecipe(grid)` compara el grid 3×3 del jugador
  contra cada receta (forma e ingredientes); auto-craft al llenar el patrón.
- **Hornos** (`state.furnaces`): combustible, input, progreso por tick,
  output; `furnaceSnapshot` para el wire. Se persisten en `world.json` y se
  restauran al cargar.
- **Combustibles y consumo real** (F16 D1/PAR-1): `FUEL_ITEMS` (troncos de
  las cuatro variedades, tablones, palo y carbón) y tabla `FUEL_TICKS` por
  ítem con los ticks oficiales MC — carbón **1600**, tronco/tablas **300**,
  palo **100**. Al recargar el horno se **consume la unidad de combustible
  real** (`fuelCount`) y se asigna el `fuelTicksLeft` de su ítem. Antes el
  combustible era un genérico 400 t que ardía para siempre (paridad PAR-1).
- **Desperdicio de combustible y encolado** (F18 C-6): la unidad de
  combustible **encendida arde completa** aunque se agote el insumo
  (paridad MC — antes se apagaba a mitad). El combustible extra que el
  jugador mete con el horno encendido se **encola FIFO** (`fuelQueue`, no se
  persiste) y se despacha solo cuando se apaga el fuego y hay insumo (un
  horno vacío no quema combustible de la cola).
- **Carbón vegetal como ítem** (F18 C-4): la receta `tronco → carbón
  vegetal` (200 t) produce `I.CHARCOAL` (257), un ítem NUEVO sincronizado
  en ambos `constants.js` con su icono; `COAL` (101) sigue saliendo solo de
  la mena de carbón. Justificado por paridad (MC usa ítems distintos).
- **Fundido explícito de mena** (F20 B3): `recetas_horno.json` tiene
  `258→102` (hierro crudo → lingote) y `259→103` (oro crudo → lingote) — la
  F18 C-7 había eliminado las recetas de mena porque el drop daba el lingote
  directo; la v20.1 restaura la cadena MC 1.17 (minar → crudo → horno →
  lingote).
- **Validación estructural** (`isValidRecipes`): una receta malformada se
  rechaza al cargar, nunca deja el juego a medias.

## Por qué así (decisión)

- **Datos fuera del código:** añadir un ítem/receta no toca JS (aunque
  requiere actualizar los `constants` sincronizados — regla de `AGENTS.md`:
  bloque/ítem nuevo → ambos lados + receta).
- **Hot-reload** para iterar rápido (el servidor no se reinicia) y para que
  los tests apunten a recetas temporales (`setRecipePaths`).
- **Swap atómico** para que un error de edición no rompa el servidor en
  producción: se sigue sirviendo con las últimas recetas válidas.
- **Desperdicio/encolado FIFO** es la paridad MC del horno: quemar la
  unidad completa y no perder combustible al re-encender.

## Mejoras a futuro

1. **Horno de fundición (blast furnace)** (F21.5, plan): funde minerales al
  doble de velocidad — reusa `state.furnaces` con un flag de tipo.
2. **Mesa de encantamientos** (F21.5, plan, tras los encantamientos): nueva
  interfaz con obsidiana/libros.
3. **Recetas por categoría visual** — el libro de recetas ya agrupa por
  categorías (`unit-recipecats`); faltaría desbloqueo progresivo (MC los
  desbloquea al obtener el material).
4. **Piedra pulida, linternas, bambú/andamios, colmenas** (F21.5 B, plan):
  bloques nuevos con sus recetas.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `FUEL_ITEMS` | Set de ítems | Qué es combustible |
| `FUEL_TICKS` | ítem → ticks (carbón 1600, tronco 300, palo 100) | Duración oficial MC |
| `matchRecipe(grid)` | — | Match 3×3 contra recetas |
| `watchRecipeFiles` / `setRecipePaths` | — | Hot-reload con swap atómico |
| `isValidRecipes` | — | Validación estructural al cargar |
| `tickFurnaces` | — | Progreso, desperdicio y cola FIFO por tick |
| `furnaceSnapshot` | — | Estado para el wire (`furnace_state`) |
| `emptyFurnace` | — | Limpieza al romper el horno (C5/REN-2) |
| `recetas_horno.json` | 12 fundiciones | Incluye `258→102`, `259→103` (B3) y tronco → carbón vegetal (C-4) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Horno de fundición (F21.5) | Flag de tipo en `state.furnaces`, velocidad ×2 en minerales, receta nueva |
| Desbloqueo progresivo de recetas | El libro muestra solo recetas "descubiertas" (matriz de obtención en `unit-recetas`) |
| Bloques nuevos con receta (F21.5 B) | B/I sincronizados + receta + icono; `unit-sync`/`unit-recetas` en verde |
