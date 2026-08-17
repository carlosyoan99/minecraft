# Cliente — Mecánica: LOD de chunks lejanos

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/lod.js`, `public/lodmesh.js`, `public/world.js`.

## Cómo funciona actualmente

- `lodTierFor(dist, current)`: > `LOD_ON_DIST` (56 bloques) → tier `lod`;
  < `LOD_OFF_DIST` (44) → tier `full`.
- **Histéresis:** en la banda entre ambas distancias se conserva el tier
  actual. Un chunk cerca de la frontera **no alterna** de un frame a otro
  (parpadeo).
- El LOD es un **heightmap por columna** con color plano (sin teselas
  finas): `lodmesh.js` construye la geometría (caparazón por columna: tapa +
  muros); `lod.js` solo decide el tier. El cliente compara contra
  `lodMeshes` y reconstruye solo cuando el tier cambia (y en `world.js` se
  re-evalúa cada 250 ms).

## Por qué así (decisión)

- **El LOD recorta el triángulo count de los chunks lejanos** (que son la
  mayoría de los visibles) sin sacrificar el detalle de cerca. La histéresis
  evita el *popping* en la frontera (regla de la skill
  `performance-optimization`: medir y presupuestar; el LOD es la
  optimización algorítmica correcta antes que micro-tuning).
- **Lógica pura y testeable** sin THREE: `tests/unit-lod.js` valida la
  decisión y la histéresis.

## Mejoras a futuro

1. **LOD escalonado (2-3 tiers)** — hoy es binario full/lod; un tier
  intermedio a mitad de distancia suavizaría la transición visual (coste:
  más geometrías en memoria).
2. **LOD por chunk según distancia real al jugador** (no solo a la cámara) —
  hoy la distancia se mide al centro del chunk; para chunks grandes el
  borde cercano se degrada antes de tiempo.
3. **Re-evaluación basada en eventos** (en vez del intervalo de 250 ms) —
  ahorraría trabajo al estar quieto; hoy el intervalo es el equilibrio
  medido.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `LOD_ON_DIST` | `56` bloques | Entrar en LOD al alejarse |
| `LOD_OFF_DIST` | `44` bloques | Volver a detalle completo al acercarse |
| `lodTierFor(dist, current)` | — | Decisión con histéresis |
| `lodMeshes` | Map | Meshes LOD (heightmap) |
| `setLodInterval` / re-evaluación | 250 ms | Refresco periódico del tier |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| 3 tiers de LOD | Transición más suave; `unit-lod` ampliado con la banda intermedia |
| Distancia al borde del chunk | El LOD degrada cuando el borde más cercano lo requiere |
| Re-evaluación por eventos | Menos trabajo al estar quieto; misma fluidez al moverse |
