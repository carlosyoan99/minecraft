// ============================================================
// POOL DE GEOMETRÍAS (Fase 6): reutilización de BufferGeometry.
// Al cargar/descargar/reconstruir chunks, en vez de
// `dispose()` + `new THREE.BufferGeometry()` por cada chunk, las
// geometrías liberadas vuelven a un pool por categoría y se
// re-adquieren. `setOrReuseAttribute` además REUTILIZA el array
// subyacente (y por tanto el buffer GPU) cuando el tamaño coincide:
// solo se re-alloc/refresca lo que cambia. Esto elimina el coste
// dominante de la reconstrucción — alloc de Float32Array + upload al
// GPU — para los chunks de tamaño similar (la mayoría del terreno).
//
// Módulo PURAMENTE lógico (sin importar three): `makeGeometry` y el
// constructor de attributes se inyectan desde world.js, así que es
// testeable en Node con objetos falsos.
// ============================================================

// Crea un pool de geometrías por categoría.
//   makeGeometry: () => geometría nueva (inyectada; en el juego, una
//                 THREE.BufferGeometry). Obligatoria.
//   maxPooled:    tope de geometrías retenidas POR categoría. El exceso
//                 se libera con dispose() (memoria acotada: las geometrías
//                 del pool retienen sus arrays).
//   categories:   nombres de categorías con pool propio (terrain/water/lod
//                 en el juego: cada una tiene un set de attributes distinto,
//                 por eso no se mezclan).
// Devuelve { acquire, release, size, stats }.
export function createGeometryPool({ makeGeometry, maxPooled = 24, categories = ['terrain', 'water', 'lod'] }) {
  const pools = new Map(categories.map((c) => [c, []]));
  let created = 0;   // geometrías nuevas fabricadas
  let reused = 0;    // geometrías re-adquiridas del pool
  let disposed = 0;  // geometrías liberadas de verdad (pool lleno o categoría no gestionada)

  return {
    // Devuelve una geometría lista para rellenar: del pool si hay, si no crea
    // una nueva (makeGeometry). Si la categoría no existe, crea igualmente
    // (defensivo: world.js siempre usa categorías válidas).
    acquire(category) {
      const pool = pools.get(category);
      if (pool && pool.length > 0) {
        reused++;
        return pool.pop();
      }
      created++;
      return makeGeometry();
    },

    // Devuelve la geometría al pool de su categoría. Si el pool está lleno o
    // la categoría no existe, la libera con dispose() (devuelve false).
    release(category, geometry) {
      const pool = pools.get(category);
      if (!pool || pool.length >= maxPooled) {
        disposed++;
        geometry.dispose();
        return false;
      }
      pool.push(geometry);
      return true;
    },

    size(category) { return (pools.get(category) || []).length; },
    stats() { return { created, reused, disposed }; },
  };
}

// Rellena un attribute de la geometría reutilizando su array cuando el
// tamaño coincide (evita alloc nuevo y el upload completo al GPU):
//   - si geo.getAttribute(name) existe y su .array tiene la MISMA longitud,
//     se copian los datos en el array existente y se marca needsUpdate
//     (three re-subirá el contenido pero conservará el buffer GPU);
//   - en cualquier otro caso se crea un Float32BufferAttribute nuevo con
//     Float32BufferAttributeCtor (inyectado: THREE.Float32BufferAttribute
//     en el juego; un fake en los tests).
export function setOrReuseAttribute(geo, name, data, itemSize, Float32BufferAttributeCtor) {
  const existing = geo.getAttribute(name);
  if (existing && existing.array && existing.array.length === data.length) {
    existing.array.set(data);
    existing.needsUpdate = true;
    return existing;
  }
  geo.setAttribute(name, new Float32BufferAttributeCtor(data, itemSize));
  return geo.getAttribute(name);
}
