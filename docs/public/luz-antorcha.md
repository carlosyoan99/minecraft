# Cliente — Mecánica: luz de antorcha

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/lighting.js` (horneado), `public/lightclient.js`,
> `public/torchlogic.js` / `public/torchlights.js` (luz puntual, F19.6 A2),
> `public/chunkstore.js` (índice espacial, F20 B4/P7).

## Cómo funciona actualmente

- **Luz horneada:** `computeChunkLight` recibe las posiciones de antorchas
  conocidas y una función de lectura de bloques, y devuelve un
  `Float32Array` (0..1) con la luz por celda del chunk.
- Propagación estilo Minecraft: `LIGHT_RADIUS = 7`, `LIGHT_ATTEN = 0.8` por
  paso, mínimo `0.03`. Aire, agua y antorchas dejan pasar la luz; el resto
  la bloquea.
- `world.js` **hornea** esa luz en colores por vértice de la geometría (la
  luz de bloque importa cuando la luz de cielo es baja, de noche).
- **Luz puntual de antorchas (F19.6 A2):** extra de render opcional
  (`torchlights.js` + lógica pura `torchlogic.js`): `PointLight` real solo
  en las antorchas dentro de `TORCH_LIGHT_BUDGET` (4) y radio 14 del
  jugador. Toggle de calidad `torchLight`, **OFF por defecto** — la luz
  horneada sigue siendo la base; es un extra de volumen, no un reemplazo.
- **Índice espacial (F20 B4/P7):** `chunkstore.js` mantiene `torchesByChunk`
  (antorcha → chunk propio) y expone `getTorchesNear(wx, wy, wz)` con el
  vecindario 3×3 de chunks (cubre el radio de luz 7 < chunk 16).
  `bakeChunkLight` y `hasTorchNear` ya no escanean el `torchSet` completo
  (O(todas las antorchas) → O(torchSet del vecindario)).

## Por qué así (decisión)

- **Luz de bloque horneada en vértices** es la técnica clásica de Minecraft
  (sin shadow maps por bloque, que serían carísimos con 169 chunks). Se
  recalcula solo al reconstruir el chunk.
- **Lógica pura** → `tests/unit-antorchas.js` (bloque B: `isLightPassable`
  y `computeChunkLight`) en Node.
- **Luz puntual OFF por defecto** porque añadir 4 `PointLight` reales tiene
  coste; la horneada es suficiente de noche y el extra es para quien quiera
  más volumen (decisión F19.6: nada que degrade se activa por defecto).

## Mejoras a futuro

1. **Luz dinámica del jugador** — una antorcha en mano ilumina alrededor
  (MC lo hace); exigiría re-hornear el chunk al moverla o luz puntual
  siempre activa (coste medio).
2. **Luz de lava** — la lava debería emitir luz como las antorchas; hoy solo
  las antorchas son emisoras.
3. **Radio de luz 7 → 8 (cubos 15³ → 17³)** — coste de BFS mayor; medir
  antes (decisión F13: 7 es el equilibrio).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `LIGHT_RADIUS` | `7` | Alcance de una antorcha en bloques |
| `LIGHT_ATTEN` | `0.8` | Atenuación por paso |
| `TORCH_LIGHT_BUDGET` | `4` | Máximo de `PointLight` reales |
| `TORCH_LIGHT_RADIUS` | `14` | Radio de selección de la luz puntual |
| `computeChunkLight` | — | Luz por celda del chunk (puro) |
| `getTorchesNear(wx,wy,wz)` | — | Vecindario 3×3 (índice espacial, P7) |
| `hasTorchNear` / `bakeChunkLight` | — | Consumidores del índice |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Luz de lava | La lava emite luz horneada; ampliar `unit-antorchas` |
| Antorcha en mano | Re-horneado local o luz puntual al moverla; toggle por calidad |
