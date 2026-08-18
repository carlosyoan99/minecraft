# Cliente — Mecánica: texturas procedurales e iconos

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/textures.js`, `public/itemicons.js`, `public/mobtextures.js`,
> `public/texturemap.js`.

## Cómo funciona actualmente

- **Atlas de bloques:** un canvas (8 teselas × N filas de 16×16 px) se pinta
  al cargar con `mulberry32` (PRNG determinista) → el atlas es estable entre
  cargas. Una única `CanvasTexture` compartida por todos los chunks; cada
  cara elige su tesela con UVs (`texturemap.js`: `tileForFace`/`tileRect`).
- **Teselas por cara:** césped (top verde, lados con transición a tierra),
  tronco con anillos, horno con boca, cofre con cerradura, cama, vidrio
  translúcido, lanas tintadas, plantas como cross-quads.
- **Iconos de ítems:** mismo enfoque, atlas de una fila recortado por CSS
  (`itemIconCss`); la lógica de dibujo es un **grid de celdas puro**
  (testeable en Node). Hot-reload: `repaintItemIcons()` repinta al recargar
  el atlas sin reiniciar (F19 E).
- **Mobs:** `mobtextures.js` genera un atlas de una fila con **una tesela
  por parte del cuerpo** (MOB_PARTS); `mobs.js` remapea los UV de cada caja
  a su tesela.

## Por qué así (decisión)

- **Cero assets binarios + estabilidad:** el PRNG sembrado garantiza que el
  atlas de un jugador sea idéntico al de otro (misma textura en
  multijugador); sin assets que gestionar ni CDN que cuidar.
- **Un material compartido** (atlas) = pocos draw calls; el render por cara
  con UVs es lo que permite el look Minecraft con un solo texture atlas.
- **Lógica pura para iconos** para poder testear la estabilidad del grid
  (`tests/unit-itemicons.js`).

## Mejoras a futuro

1. **Texturas 32×32 opcionales** (calidad alta): el atlas se repintaría a
  doble resolución; coste de memoria y upload.
2. **Atlas por bioma** (tinte de césped/agua por bioma, MC): el tintado se
  podría hacer por vértice (como el AO) sin duplicar atlas.
3. **Emisivas (lava, glowstone)** — el atlas es Lambert; una textura
  emisiva requeriría un segundo canal de material.
4. **Animación de teselas** (agua/lava ya son shader; faltaría la melaza) —
   el bloque de miel (F21.5 B4, tesela 76) ya existe; la animación sigue en
   el backlog.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `mulberry32(seed)` | PRNG | Atlas determinista |
| `tileForFace(block, face)` / `tileRect` | — | Selección de tesela y UVs |
| `itemIconCss(id)` | — | Icono de ítem (grid puro) |
| `repaintItemIcons()` | — | Hot-reload del atlas de iconos |
| `MOB_PARTS` | tabla por especie | Partes del cuerpo → teselas |
| `setWorldMipmaps` | toggle | Mipmaps del atlas de terreno |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Texturas 32×32 | Toggle de calidad; atlas repintado a doble resolución; `unit-itemicons` recalibrado |
| Tinte por bioma | Césped/agua tintados por vértice; sin duplicar atlas |
| Teselas emisivas | Material con canal emisivo; nuevo toggle de calidad |
