# Cliente — Mecánica: render de chunks

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/world.js`, `public/chunkstore.js`, `public/chunkGeometry.js`,
> `public/meshbuild.js`, `public/chunkWorker.js`, `public/materialstyle.js`.

## Cómo funciona actualmente

- **Almacén:** `chunkstore.js` (Map `"cx,cz"` → `Uint8Array(16×128×16)`) con
  los bloques que llegan del servidor en `chunks_add` (mundo de 128 bloques,
  Y ∈ −64..+63, F15 D5).
- **Geometría con greedy meshing en un worker (F13):** `world.js` encola la
  reconstrucción en `chunkWorker.js`, que llama a `buildChunkGeometryData`
  (`chunkGeometry.js`): culling de caras + fusión greedy 2D por capas (quads
  largos de bloques iguales coplanares, con luz de antorcha y AO horneados
  en la clave de fusión). Solo se emiten las caras visibles y el culling se
  aplica **entre chunks vecinos** (los bordes de chunk no dejan huecos).
- **Texturas:** cada cara elige su tesela del atlas (`textures.js`:
  `tileForFace` top/bottom/lados) y sus UVs (`tileRect`); un solo material
  compartido por todo el terreno (atlas).
- **Mesh por chunk:** `chunkMeshes` (detalle completo) y `lodMeshes`
  (heightmap simplificado); **frustum culling** por esfera de chunk
  (`applyFrustumCulling`).
- **Actualizaciones:** `setClientBlock` + `rebuildAffectedChunks` /
  `rebuildAround` reconstruyen solo los chunks afectados al recibir
  `block_update`.
- **AO por vértice (F10):** `vertexAO` hornea oclusión ambiental estilo
  Minecraft (5 niveles de sombra según vecinos sólidos en las esquinas).
- **Agua mejorada (F10 + F19.6 C1):** cara superior del agua a 0.875
  (14/16, sin z-fighting); el agua/lava son un `ShaderMaterial` dedicado con
  la corriente animada por `uTime` en el fragment shader y el paso
  día/noche por `uDay`.
- **Plantas con viento (F19.6 C2):** hierba/flores/trigo, un único buffer
  `plant` por chunk, mece sus vértices con el atributo `wind` (fase de celda
  + altura 0..1) más `uTime`. No migra a `InstancedMesh` (decisión D del
  spec F19.6 — evaluado y rechazado).
- **Materiales del mundo (F19.6 B):** todos los meshes pasan por
  `worldMaterial` (`materialstyle.js`); el toggle `toon` los intercambia por
  `MeshToonMaterial` en caliente.
- **Mipmaps del atlas (F19.6 E):** toggle `mipmaps` (OFF por defecto para
  mantener el look 16×16 crisp): `setWorldMipmaps` reconfigura
  minFilter/generateMipmaps.

## Por qué así (decisión)

- **Culling de caras + greedy meshing = el 90% del ahorro.** La mayoría de
  caras son interiores (piedra con piedra al lado): dibujarlas sería ~6×
  más triángulos. El greedy fusiona caras coplanares y el mesh por chunk
  permite compartir un material y mantener pocos draw calls.
- **Chunks de 16×16** (como Minecraft): frontera natural entre la malla
  estática (reconstruible solo cuando cambia un bloque) y el streaming de
  distancia.
- **Frustum culling por esfera** barato: un `Sphere` por chunk contra el
  frustum, sin tocar la geometría (fix B6 de la F8: bounds obsoletos hacían
  que el frustum ocultara chunks).
- **ShaderMaterial solo para agua/plantas** (F19.6): el 90% del terreno
  sigue en un material compartido barato; el shader va solo donde hay
  animación.

## Mejoras a futuro

1. **Greedy meshing completo 3D** (en vez de 2D por capas) — fusionaría
  volúmenes; hoy la fusión es por capa horizontal (decisión F13 medida).
2. **Chunk unloading por prioridad** — hoy se descargan por distancia; una
  cola por prioridad de visibilidad suavizaría los viajes rápidos.
3. **Texturas 32×32 opcionales** — toggle de calidad alto; el atlas
  procedural se repintaría a doble resolución (coste de memoria).
4. **Viento interactivo** (caminar entre la hierba) — el atributo `wind` ya
  existe; falta la fuente localizada.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `chunkStore` | Map `"cx,cz"` → `Uint8Array` | Datos de bloques del cliente |
| `buildChunkGeometryData` | — | Greedy meshing 2D por capas + AO + luz |
| `applyFrustumCulling` | — | No dibujar lo invisible |
| `setClientBlock` / `rebuildAffectedChunks` | — | Actualización tras `block_update` |
| `vertexAO` | 5 niveles | Oclusión ambiental por vértice |
| `worldMaterial` / `setToonStyle` | — | Material compartido + toggle toon |
| `uTime` / `uDay` | uniforms | Animación de agua/plantas y día/noche |
| `setWorldMipmaps` | toggle | Mipmaps del atlas (OFF por defecto) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Greedy 3D | Menos triángulos en volúmenes; verificar identidad con `unit-greedy` |
| Texturas 32×32 | Atlas repintado a doble resolución; toggle de calidad |
| Viento interactivo | Hierba que se aparta al caminar; el atributo `wind` ya existe |
