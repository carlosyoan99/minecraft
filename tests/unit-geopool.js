"use strict";
// ============================================================
// TESTS UNITARIOS DEL POOL DE GEOMETRÍAS (Fase 6)
// public/geopool.js es un módulo ESM sin THREE: makeGeometry y el
// ctor de attributes se inyectan, así que se testea en Node con
// objetos falsos (mismo truco de import que unit-lod.js: copia a
// un .mjs temporal e import dinámico).
// Cubre: reutilización real (misma geometría y mismo array al
// re-adquirir), tope del pool (exceso → dispose), categorías
// separadas, categoría desconocida → dispose, y setOrReuseAttribute
// (reutiliza el array cuando el tamaño coincide).
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (failedChecks?.length)
		console.log(
			`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`
		);
});
const check = (_name, ok, _extra = "") => {
	if (!ok) {
		failed++;
		failedChecks.push(_name);
	}
};

// Geometría falsa: registra attributes y dispose.
function makeFakeGeometry() {
	return {
		attrs: new Map(),
		disposed: false,
		getAttribute(n) {
			return this.attrs.get(n) || null;
		},
		setAttribute(n, a) {
			this.attrs.set(n, a);
			return this;
		},
		dispose() {
			this.disposed = true;
		}
	};
}
// Ctor de attribute falso (como THREE.Float32BufferAttribute).
function FakeAttr(data, itemSize) {
	return { array: new Float32Array(data), itemSize, needsUpdate: false };
}

(async () => {
	const src = path.join(__dirname, "..", "public", "geopool.js");
	const tmp = path.join(os.tmpdir(), `unit-geopool-${process.pid}.mjs`);
	fs.copyFileSync(src, tmp);
	const { createGeometryPool, setOrReuseAttribute } = await import(
		`file://${tmp}`
	);
	fs.unlinkSync(tmp);

	// --- 1) acquire crea cuando el pool está vacío; release+re-acquire reutiliza ---
	{
		let made = 0;
		const pool = createGeometryPool({
			makeGeometry: () => {
				made++;
				return makeFakeGeometry();
			},
			maxPooled: 4
		});
		const a = pool.acquire("terrain");
		check("acquire con pool vacío crea una geometría nueva", made === 1);
		check(
			"release al pool → reutilizable (true)",
			pool.release("terrain", a) === true
		);
		check("el pool guarda 1 geometría", pool.size("terrain") === 1);
		const b = pool.acquire("terrain");
		check(
			"re-acquire devuelve LA MISMA geometría (sin crear)",
			b === a && made === 1
		);
		const s = pool.stats();
		check(
			"estadísticas: 1 creada y 1 reutilizada",
			s.created === 1 && s.reused === 1,
			JSON.stringify(s)
		);
	}

	// --- 2) Tope del pool: el exceso se libera con dispose ---
	{
		let _made = 0;
		const pool = createGeometryPool({
			makeGeometry: () => {
				_made++;
				return makeFakeGeometry();
			},
			maxPooled: 2
		});
		const g1 = pool.acquire("lod"),
			g2 = pool.acquire("lod"),
			g3 = pool.acquire("lod");
		check(
			"release g1 y g2 → caben (tope 2)",
			pool.release("lod", g1) === true && pool.release("lod", g2) === true
		);
		check(
			"release g3 (pool lleno) → dispose (false)",
			pool.release("lod", g3) === false && g3.disposed === true
		);
		check("el pool conserva el tope (2)", pool.size("lod") === 2);
	}

	// --- 3) Categorías separadas: terrain/water/lod no se mezclan ---
	{
		let made = 0;
		const pool = createGeometryPool({
			makeGeometry: () => {
				made++;
				return makeFakeGeometry();
			},
			maxPooled: 4
		});
		const t = pool.acquire("terrain");
		pool.release("terrain", t);
		// Water tiene su propio pool vacío → crea una nueva (no toma la de terrain).
		const w = pool.acquire("water");
		check(
			"la categoría water no devuelve la geometría de terrain",
			w !== t && made === 2
		);
		// Terrain conserva la suya: re-adquirirla la recupera del pool (reused=1).
		const t2 = pool.acquire("terrain");
		check(
			"la categoría terrain conserva su geometría para reutilizar",
			t2 === t && made === 2
		);
		const s = pool.stats();
		check(
			"estadísticas: 2 creadas, 1 reutilizada (solo terrain)",
			s.created === 2 && s.reused === 1,
			JSON.stringify(s)
		);
	}

	// --- 4) Categoría desconocida → dispose y false ---
	{
		const pool = createGeometryPool({
			makeGeometry: makeFakeGeometry,
			maxPooled: 4
		});
		const g = pool.acquire("terrain");
		const ok = pool.release("no-existe", g);
		check(
			"release en categoría desconocida → dispose (false)",
			ok === false && g.disposed === true
		);
		const s = pool.stats();
		check(
			"la liberación por categoría desconocida cuenta como disposed",
			s.disposed === 1,
			JSON.stringify(s)
		);
	}

	// --- 5) setOrReuseAttribute: reutiliza el array si el tamaño coincide ---
	{
		const g = makeFakeGeometry();
		const data1 = new Float32Array([1, 2, 3, 4, 5, 6]); // 6 floats (2 triángulos)
		setOrReuseAttribute(g, "position", data1, 3, FakeAttr);
		const attr1 = g.getAttribute("position");
		check(
			"setea el attribute la primera vez",
			!!attr1 && attr1.array.length === 6
		);

		// Mismo tamaño: reutiliza el MISMO array (copia in-place + needsUpdate).
		const data2 = new Float32Array([9, 9, 9, 9, 9, 9]);
		const attr2 = setOrReuseAttribute(g, "position", data2, 3, FakeAttr);
		check(
			"mismo tamaño → reutiliza el mismo array (sin alloc nuevo)",
			attr2 === attr1
		);
		check(
			"los datos se copian en el array existente",
			attr2.array[0] === 9 && attr2.array[5] === 9
		);
		check(
			"marca needsUpdate para que three re-subir el contenido",
			attr2.needsUpdate === true
		);

		// Tamaño distinto: crea un attribute nuevo.
		const data3 = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const attr3 = setOrReuseAttribute(g, "position", data3, 3, FakeAttr);
		check(
			"tamaño distinto → crea un attribute nuevo",
			attr3 !== attr1 && attr3.array.length === 9
		);
	}

	// --- 6) setOrReuseAttribute con ctor por defecto (defensivo) ---
	{
		const g = makeFakeGeometry();
		const r = setOrReuseAttribute(
			g,
			"normal",
			new Float32Array([0, 1, 0]),
			3,
			FakeAttr
		);
		check(
			"funciona también con un attribute que no existía",
			r && g.getAttribute("normal").array.length === 3
		);
	}
	process.exit(failed ? 1 : 0);
})();
