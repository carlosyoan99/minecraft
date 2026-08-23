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
export function createGeometryPool({
	makeGeometry,
	maxPooled = 24,
	categories = ["terrain", "water", "lod"]
}) {
	const pools = new Map(categories.map((c) => [c, []]));
	let created = 0; // geometrías nuevas fabricadas
	let reused = 0; // geometrías re-adquiridas del pool
	let disposed = 0; // geometrías liberadas de verdad (pool lleno o categoría no gestionada)

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
			// Fase 8 (B3): al liberar se nullean los bounds cacheados de three
			// (boundingBox/boundingSphere). El pool reutiliza la geometría y
			// setOrReuseAttribute muta los arrays de attributes EN SU LUGAR (sin
			// llamar a setAttribute), así que sin esto los bounds quedarían los
			// del chunk ANTERIOR: Mesh.raycast rechaza el rayo contra esa esfera
			// obsoleta (clic que no intersecta → no se puede minar) y
			// expandByObject del culling usaría la caja vieja. Al nullearlos, el
			// siguiente acquire los recalcula de forma perezosa con datos nuevos.
			geometry.boundingBox = null;
			geometry.boundingSphere = null;
			pool.push(geometry);
			return true;
		},

		size(category) {
			return (pools.get(category) || []).length;
		},
		stats() {
			return { created, reused, disposed };
		}
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
export function setOrReuseAttribute(
	geo,
	name,
	data,
	itemSize,
	Float32BufferAttributeCtor
) {
	const existing = geo.getAttribute(name);
	if (existing?.array && existing.array.length === data.length) {
		existing.array.set(data);
		existing.needsUpdate = true;
		return existing;
	}
	geo.setAttribute(name, new Float32BufferAttributeCtor(data, itemSize));
	return geo.getAttribute(name);
}

// ============================================================
// Fase 22.1+BufferGeometryUtils: buffer pre-asignado para escritura
// directa (sin push a Array regular + Float32Array.from).
//
// El greedy meshing produce cantidades variables de vértices, pero la
// mayoría de los chunks cae en un rango predecible. Float32Buffer
// reserva capacidad inicial y Expande el array por duplicado solo cuando
// se agota — el coste amortizado es O(n) con ~2× reallocs en vez de
// O(n²) del push a Array regular.
//
// Uso:
//   const buf = new Float32Buffer(expectedVerts, 3); // 3 floats/vértice
//   buf.push(x, y, z);  // o buf.write(x, y, z) con posición explícita
//   buf.toTypedArray();  // Float32Array final (tamaño exacto)
// ============================================================
export class Float32Buffer {
	constructor(initialCapacity, itemSize) {
		this.itemSize = itemSize;
		this.pos = 0; // posición de escritura (en floats)
		this.arr = new Float32Array(initialCapacity * itemSize);
	}

	// Escribe itemSize floats en la posición actual y avanza.
	write(...values) {
		if (this.pos + values.length > this.arr.length) this._grow();
		for (let i = 0; i < values.length; i++) this.arr[this.pos++] = values[i];
	}

	// Push de conveniencia: acepta un array o argumentos sueltos.
	// Sigue la interfaz de Array.prototype.push para migración gradual.
	push(...values) {
		for (let i = 0; i < values.length; i++) {
			if (this.pos >= this.arr.length) this._grow();
			this.arr[this.pos++] = values[i];
		}
	}

	// Número de floats escritos.
	get length() {
		return this.pos;
	}

	// Devuelve un Float32Array del tamaño exacto (sin waste).
	toTypedArray() {
		return this.pos === this.arr.length
			? this.arr
			: this.arr.subarray(0, this.pos);
	}

	// Crea un Float32Array NUEVO del tamaño exacto (copia).
	// Útil cuando el buffer va a ser reusado (el subarray comparte
	// el mismo underlying ArrayBuffer).
	toNewTypedArray() {
		return new Float32Array(this.arr.buffer, 0, this.pos);
	}

	_grow() {
		const next = new Float32Array(this.arr.length * 2);
		next.set(this.arr);
		this.arr = next;
	}
}

// ============================================================
// setFromBuffer: carga datos de un Float32Buffer en un atributo de
// BufferGeometry, reutilizando el buffer GPU cuando la longitud coincide.
//
// Diferencia con setOrReuseAttribute:
//   - setOrReuseAttribute(data: Float32Array) — copia los datos
//   - setFromBuffer(buf: Float32Buffer) — subarray SIN copia cuando
//     el tamaño coincide (el buffer GPU se reutiliza); solo copia
//     cuando el tamaño difiere (resize).
// ============================================================
export function setFromBuffer(geo, name, buf, itemSize, Float32BufferAttributeCtor) {
	const data = buf.toTypedArray();
	const existing = geo.getAttribute(name);
	if (existing?.array && existing.array.length === data.length) {
		existing.array.set(data);
		existing.needsUpdate = true;
		return existing;
	}
	geo.setAttribute(name, new Float32BufferAttributeCtor(data, itemSize));
	return geo.getAttribute(name);
}
