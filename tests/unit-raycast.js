"use strict";
// ============================================================
// TESTS DEL FIX B3 (Fase 8): bounds obsoletos en geometrías del pool.
// El pool reutiliza BufferGeometry y setOrReuseAttribute muta los
// arrays de attributes EN SU LUGAR (sin setAttribute), así que si los
// boundingBox/boundingSphere cacheados de three no se nullean al
// liberar, el chunk que reutilice la geometría tendría la esfera/caja
// del chunk ANTERIOR: Mesh.raycast rechaza el rayo contra esa esfera
// obsoleta → el clic no intersecta → no se puede minar (B3) y
// expandByObject del culling usaría la caja vieja (B6).
// Usa THREE REAL (devDependency three@0.160.0, el mismo del importmap
// del cliente) + geopool.js real (import ESM vía copia .mjs).
// ============================================================
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

let failed = 0;
const check = (name, ok, extra = "") => {
	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(`${ok ? "OK " : "✗  "}${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) failed++;
};

// Caja unitaria en (cx, cy, cz): 12 triángulos (como un bloque del juego).
function boxVerts(cx, cy, cz) {
	const [x0, x1, y0, y1, z0, z1] = [cx, cx + 1, cy, cy + 1, cz, cz + 1];
	const v = [
		x0,
		y0,
		z1,
		x1,
		y0,
		z1,
		x1,
		y1,
		z1,
		x0,
		y1,
		z1,
		x1,
		y0,
		z0,
		x0,
		y0,
		z0,
		x0,
		y1,
		z0,
		x1,
		y1,
		z0,
		x1,
		y0,
		z1,
		x1,
		y0,
		z0,
		x1,
		y1,
		z0,
		x1,
		y1,
		z1,
		x0,
		y0,
		z0,
		x0,
		y0,
		z1,
		x0,
		y1,
		z1,
		x0,
		y1,
		z0,
		x0,
		y1,
		z1,
		x1,
		y1,
		z1,
		x1,
		y1,
		z0,
		x0,
		y1,
		z0,
		x0,
		y0,
		z0,
		x1,
		y0,
		z0,
		x1,
		y0,
		z1,
		x0,
		y0,
		z1
	];
	const idx = [
		0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11, 12, 13, 14, 12, 14,
		15, 16, 17, 18, 16, 18, 19, 20, 21, 22, 20, 22, 23
	];
	return { v, idx };
}

(async () => {
	const THREE = await import("three");
	const geopoolSrc = path.join(__dirname, "..", "public", "geopool.js");
	const tmp = path.join(os.tmpdir(), `unit-raycast-${process.pid}.mjs`);
	fs.copyFileSync(geopoolSrc, tmp);
	const { createGeometryPool, setOrReuseAttribute } = await import(
		`file://${tmp}`
	);
	fs.unlinkSync(tmp);

	// ── 1) El fix: release() nullea los bounds cacheados ──────────────
	const pool = createGeometryPool({
		makeGeometry: () => new THREE.BufferGeometry(),
		maxPooled: 4,
		categories: ["terrain"]
	});
	const geo = pool.acquire("terrain");
	const a = boxVerts(0, 0, 0);
	setOrReuseAttribute(geo, "position", a.v, 3, THREE.Float32BufferAttribute);
	geo.setIndex(a.idx);
	geo.computeBoundingSphere();
	geo.computeBoundingBox();
	check(
		"1. bounds cacheados tras el primer build",
		geo.boundingSphere !== null && geo.boundingBox !== null
	);
	pool.release("terrain", geo);
	check(
		"1. release() nullea boundingSphere (fix B3)",
		geo.boundingSphere === null
	);
	check("1. release() nullea boundingBox (fix B3)", geo.boundingBox === null);

	// ── 2) Reutilización con el fix: el raycast acierta el bloque real ─
	const geo2 = pool.acquire("terrain"); // la misma geometría del pool
	const b = boxVerts(100, 50, 0); // chunk nuevo muy lejos del anterior
	// Misma longitud de array → setOrReuseAttribute muta en su lugar.
	setOrReuseAttribute(geo2, "position", b.v, 3, THREE.Float32BufferAttribute);
	geo2.setIndex(b.idx);
	const mesh = new THREE.Mesh(geo2);
	const raycaster = new THREE.Raycaster();
	raycaster.set(new THREE.Vector3(-5, 50.5, 0.5), new THREE.Vector3(1, 0, 0));
	raycaster.far = 200;
	const hits = raycaster.intersectObject(mesh, false);
	check(
		"2. raycast acierta tras reutilizar la geometría (fix B3)",
		hits.length > 0,
		`hits=${hits.length}`
	);
	check(
		"2. boundingSphere se recalcula con los datos nuevos",
		geo2.boundingSphere !== null &&
			Math.abs(geo2.boundingSphere.center.x - 100.5) < 0.01,
		`centro.x=${geo2.boundingSphere?.center.x}`
	);

	// ── 3) Mecanismo del bug (documentación): SIN nullear, falla ───────
	// Sin el fix, los bounds del primer chunk se mantienen y el raycast se
	// rechaza contra la esfera vieja: 0 intersecciones aunque el bloque esté
	// delante (exactamente el síntoma "el clic no inicia la mina").
	const geoBug = new THREE.BufferGeometry();
	geoBug.setAttribute("position", new THREE.Float32BufferAttribute(a.v, 3));
	geoBug.setIndex(a.idx);
	geoBug.computeBoundingSphere();
	geoBug.attributes.position.array.set(b.v); // mutación in-place (sin setAttribute)
	geoBug.attributes.position.needsUpdate = true;
	const meshBug = new THREE.Mesh(geoBug);
	const hitsBug = raycaster.intersectObject(meshBug, false);
	check(
		"3. mecanismo del bug: bounds obsoletos → raycast 0 hits (sin fix)",
		hitsBug.length === 0,
		`hitsBug=${hitsBug.length}`
	);

	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(failed ? `\n${failed} check(s) FALLARON` : "\nTODO OK");
	process.exit(failed ? 1 : 0);
})();
