# Servidor — Mecánica: minería y herramientas

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/mining.js`, `server/constants.js`, `server/players.js`
> (drop y sesión), `server/combat.js` (`applyToolWear`).

## Cómo funciona actualmente

- **Sesión de rotura con progreso:** `block_action {action:'break'}` abre
  una sesión (`startMining`); `tickMining` avanza `progress` según
  `breakSeconds(bloque, herramienta)`. Se cancela si el bloque cambia, el
  jugador se aleja (>7 bloques) o envía `break_cancel`. El re-minado
  automático (F17 B7) reabre la sesión al romperse el bloque con el clic
  mantenido.
- **Dureza y tier:** `BLOCK_HARDNESS` por bloque; `miningSpeed` devuelve 1
  con herramienta equivocada o a mano. La **espada no mina** (`canHarvest`
  la excluye de todo drop) — fiel a Minecraft.
- **Herramienta releída en cada tick:** cambiar de herramienta a mitad de
  mina recalcula la velocidad sin perder progreso acumulado.
- **Durabilidad** (`TOOL_DURABILITY`, sincronizada con el cliente en
  `DURABILITY`): cada uso desgasta; al llegar a 0, `tool_broke` y la
  herramienta desaparece.
- **Grietas al cliente:** `block_break_progress` con stage 0-9 (y −1 para
  ocultar) pinta el crack como en Minecraft.
- **Drop de las menas** (F14 B + F20 B3): cada mineral suelta su cadena MC —
  carbón → `I.COAL`, diamante/redstone/esmeralda → gema, hierro/oro → **mena
  cruda** `I.RAW_IRON`/`I.RAW_GOLD` (258/259) (`ORE_DROP`); ya no cae el
  bloque de mena. La mena cruda se **funde en el horno** → lingote
  (`recetas_horno.json` 258→102, 259→103), paridad MC 1.17 restaurada en la
  v20.1 (la F18 C-7 la había dejado implícita).
- **Tier mínimo por mineral** (F14 B): `PICKAXE_TIER` (madera 1, piedra 2,
  hierro 3, oro 1, diamante 4) frente a `ORE_TIER` (carbón 1, hierro/oro 2,
  redstone/diamante/esmeralda 3). Con pico insuficiente el bloque se rompe
  pero **no suelta nada** (sin drop ni XP).

## Por qué así (decisión)

- **Progreso continuo, no "clic = roto":** la rotura se siente gradual, la
  dureza importa y el feedback visual (grietas) es trivial.
- **Validación server-side:** el cliente no dice "roto", solo "estoy
  minando"; el servidor decide cuándo se completa — la velocidad de rotura
  no se puede hackear.
- **Tier de herramienta = progresión:** picar piedra a mano es lentísimo;
  con pico de hierro es rápido. Da sentido a subir de herramienta.
- **Cadena mena cruda → horno** es la paridad MC 1.17: minar hierro/oro da
  el crudo (no el lingote directo) y el horno gana uso real.

## Mejoras a futuro

1. **Encantamientos de eficiencia/fortune** (F21.5 C, plan): modifican
   `miningSpeed` y el drop múltiple — hoy no hay NBT, habría que añadir
   campo retrocompatible en `ItemStack`.
2. **Minerales de deepslate** (F22 A, plan): `DEEPSLATE` bajo Y=0 con sus
   variantes de mena — bloques nuevos sincronizados B/I.
3. **Cobre** (F22 A): mena + lingote + bloque (sin oxidación) — ítems nuevos.
4. **TNT de minería con retardo configurable** — hoy la mecha es fija ~1.6 s.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `BLOCK_HARDNESS` | tabla bloque → segundos base | Dureza por bloque |
| `TOOL_DURABILITY` | tabla herramienta → usos | Desgaste (sync con `DURABILITY` cliente) |
| `PICKAXE_TIER` / `ORE_TIER` | madera 1 … diamante 4 / carbón 1 … diamante 3 | Tier mínimo por mineral |
| `ORE_DROP` | mena → ítem | Drop de las menas (crudo para hierro/oro) |
| `startMining(x,y,z)` | — | Abre sesión de rotura |
| `tickMining` / `break_cancel` | — | Avanza/cancela el progreso |
| `breakSeconds(bloque, herramienta)` | `BLOCK_HARDNESS / miningSpeed` | Tiempo total de rotura |
| `canHarvest(tool, block)` | — | Tier mínimo + espada excluida |
| `applyToolWear` | — | Desgaste de la herramienta al usar |
| `block_break_progress` | stage 0-9 / −1 | Grietas al cliente |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Encantamientos (F21.5) | `miningSpeed` × eficiencia, `ORE_DROP` × fortune; campo `enchants` retrocompatible en `ItemStack` |
| Deepslate y cobre (F22) | Bloques/ítems sincronizados B/I + recetas + iconos; menas en sus bandas (percentil recalculado) |
| Re-minado continuo | Ya implementado (F17 B7); mantener sin regresión en `unit-fase17` |
