# Servidor — Mecánica: cofres y loot

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/chests.js`, `server/items.js` (clase `ItemStack`).

## Cómo funciona actualmente

- Cada cofre del mundo tiene 27 slots (`CHEST_SLOTS`), misma semántica que
  el inventario (herramientas con durabilidad no apilan). Desde la Fase 13
  (C3) los slots son instancias de `ItemStack` (JSON idéntico al wire).
- **Loot de minas abandonadas:** los cofres generados por `world.js` traen
  1-3 stacks de `LOOT_TABLE` estilo Minecraft (carbón, lingotes, redstone,
  diamante raro al 8 %, miel/pan desde Fase 9).
- El estado vive en `state.chests` y se persiste en `world.json`
  (`restoreChests`); la lógica de mover ítems (put/take) vive en los
  handlers de red de `actions.js`.
- **Abrir vs romper (F16 B2):** clic derecho abre el cofre, pero para
  **romperlo** hay que ir **agachado** (Shift), como en Minecraft — sin
  agacharse el `block_action break` sobre un cofre no lo destruye. Al
  romperlo sueltan su contenido como drops y su propio drop, y se limpia el
  estado de `state.chests`. Los cofres con contenido **no se rompen por
  explosión** (TNT respeta `NOT_MINEABLE` en contenedores).

## Por qué así (decisión)

- Mismo patrón que los hornos (estado en un Map del `state` + snapshot para
  el wire + restauración desde save): **un solo patrón de almacenamiento**
  para todos los contenedores, fácil de testear y persistir.
- **Agacharse para romper** es la regla MC que evita destruir tu propio
  cofre al intentar abrirlo (y el griefing accidental con TNT).

## Mejoras a futuro

1. **Loot por estructura** (F21 B1/B2, P1): el pozo no tiene loot; la
   pirámide y demás estructuras nuevas tendrán sus propias tablas en
   `server/chests.js` (patrón `LOOT_TABLE` extendido por estructura).
2. **Loot de pesca en cofres** (F21.5 A8, plan): cañas rotas (durabilidad
   1-20) en las tablas de loot.
3. **Doble cofre (2×1)** — requiere fusión de estados y una nueva tesela;
   coste medio, diferido.
4. **Ender chest por jugador** — fuera de alcance hasta tener
   autenticación/BD (Won't del proyecto).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `CHEST_SLOTS` | `27` | Slots por cofre |
| `LOOT_TABLE` | tabla de stacks | Loot de minas abandonadas |
| `state.chests` | Map key → slots | Estado en memoria |
| `restoreChests` | — | Persistencia en `world.json` |
| `chest_state` / `chest_action` | eventos WS | Apertura y movimiento de ítems |
| `ItemStack` | clase | Slots de cofre/inventario (F13 C3) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Loot de estructuras P1 (pirámide, etc.) | Tabla por estructura en `chests.js`; tests de loot coherente (patrón `unit-terreno`/`unit-fase12`) |
| Cañas rotas en cofres (F21.5) | ítem `FISHING_ROD` con durabilidad 1-20 en `LOOT_TABLE` |
| Doble cofre | Fusión de dos cofres adyacentes en 54 slots; tesela nueva; migración retrocompatible |
