# Cliente — Mecánica: pool de geometrías

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/geopool.js`.

## Cómo funciona actualmente

- Al descargar/reconstruir un chunk, la `BufferGeometry` **no se destruye**:
  vuelve a un pool por categoría (terrain/water/lod — cada una con su set de
  attributes). `acquire` reutiliza; el exceso se libera con `dispose()`
  (memoria acotada).
- `setOrReuseAttribute` **reutiliza el array subyacente** (y por tanto el
  buffer GPU) cuando el tamaño coincide: solo se re-alloc/refresca lo que
  cambia.

## Por qué así (decisión)

El coste dominante de reconstruir un chunk es `alloc de Float32Array +
upload al GPU`. Como la mayoría de chunks tienen tamaño similar, el pool
convierte esa alloc en un reuso casi gratis. Es la recomendación de la
skill `performance-optimization`: **no allocar en bucles calientes**.

## Mejoras a futuro

1. **Pool por tamaño exacto** (en vez de categoría): los chunks LOD con
   tamaños muy dispares desperdician el pool de su categoría; un pool por
   bucket de tamaño ajustaría la reutilización.
2. **Reuso del array cuando el buffer es más GRANDE** (no solo igual): hoy
   `setOrReuseAttribute` exige tamaño idéntico; permitir reuso con
   sub-rango ahorraría allocs cuando el chunk nuevo es más pequeño.
3. **Metrics en el F3**: exponer hit rate del pool (acquisitions vs allocs)
   para diagnosticar fugas — hoy solo lo ve `unit-geopool.js`.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `acquire(categoria)` | — | Reutiliza o crea una geometría |
| `release(geo)` | — | Devuelve al pool (o `dispose()` si sobra) |
| `setOrReuseAttribute(geo, name, array)` | — | Reusa el buffer GPU si el tamaño coincide |
| categorías | terrain / water / lod | Sets de attributes por tipo de mesh |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Pool por bucket de tamaño | Menos allocs en LOD dispares; `unit-geopool` ampliado |
| Reuso con sub-rango | Menos uploads GPU al encoger un chunk |
| Métricas en F3 | Hit rate visible; diagnóstico de fugas en CDP |
