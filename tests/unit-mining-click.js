"use strict";
// ============================================================
// TESTS DE LA DECISIÓN DE CLIC DE MINERÍA (Fase 9, Bloque A)
// Reproduce la lógica de input.js (raycastTerrainAndMobs + mousedown) con
// THREE real para fijar la regresión de "el clic no hace nada":
//   1. clic sobre un bloque SIN mobs → se mina (coordenadas correctas),
//   2. mob DELANTE del bloque → el clic golpea al mob (ataque, no mina),
//   3. mob DETRÁS del bloque → el clic mina el bloque,
//   4. mob con matrixWorld OBSOLETO (recién creado, nunca renderizado): sus
//      partes quedan en el ORIGEN del mundo (la position del grupo solo
//      surte efecto vía matrixWorld). SIN el fix de input.js
//      (scene.updateMatrixWorld() antes del raycast) el rayo golpea al mob
//      en el origen y roba el clic; CON el fix se golpea donde está.
// Usa three@0.160.0 (devDependency, la del importmap del cliente).
// ============================================================
let failed = 0;
const failedChecks = [];
// Fase 15 (cierre): reporte uniforme de checks fallidos (lo parsea run.js).
process.on("exit", () => {
	if (typeof failedChecks !== "undefined" && failedChecks.length)
		console.log(`# checks fallidos: ${failedChecks.length} — ${failedChecks.join("; ")}`);
});
const check = (name, ok, extra = "") => {
	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(`${ok ? "OK " : "✗  "}${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) { failed++; failedChecks.push(name); }
};

// Sube desde el mesh golpeado hasta el grupo raíz con userData.mobId
// (copia fiel de mobRootData en public/input.js).
function mobRootData(hit) {
	if (!hit) return null;
	let o = hit.object;
	while (o) {
		if (o.userData?.mobId) return o.userData;
		o = o.parent;
	}
	return null;
}

// Misma fórmula de bloque que el mousedown de input.js:
// point = hit.point + face.normal * -0.5 → floor por eje.
function blockFromHit(hit) {
	const p = hit.point.clone().addScaledVector(hit.face.normal, -0.5);
	return [Math.floor(p.x), Math.floor(p.y), Math.floor(p.z)];
}

(async () => {
	const THREE = await import("three");

	// ── Escena ────────────────────────────────────────────────────────────
	// Bloque de terreno en coords enteras [3,4) x [1,2) x [0,1) (ancho z=2
	// para que el rayo a z=0 lo atraviese limpiamente): la geometría del
	// cliente usa coordenadas MUNDIALES y grupos en identidad.
	const terrain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2));
	terrain.position.set(3.5, 1.5, 0.5);
	terrain.userData.isTerrain = true;
	terrain.updateMatrixWorld(true); // el render loop del juego la mantiene al día

	// Mob multibloque tipo zombi: partes con z LOCAL 0 (como MOB_PARTS); la
	// posición del mundo la lleva el grupo.
	const group = new THREE.Group();
	group.userData.mobId = "mob-1";
	group.userData.mobType = "zombie";
	const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
	for (const part of [
		{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
		{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
		{ name: "leg", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
		{ name: "leg", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
	]) {
		const [w, h, d] = part.size;
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
		mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
		group.add(mesh);
	}

	// Rayo de la cámara a z=0 (pasa por el origen y por el cuerpo del mob):
	// origen (-5, 1.2, 0) apuntando a +X.
	const mkRay = () => {
		const r = new THREE.Raycaster();
		r.set(new THREE.Vector3(-5, 1.2, 0), new THREE.Vector3(1, 0, 0));
		r.far = 20;
		return r;
	};

	// ── 1) Bloque sin mobs: el clic mina las coordenadas correctas ───────
	{
		const hit = mkRay().intersectObjects([terrain], true)[0] || null;
		const [bx, by, bz] = blockFromHit(hit);
		check(
			"1. el clic sobre un bloque calcula sus coordenadas",
			hit !== null && bx === 3 && by === 1 && bz === 0,
			`hit=${hit ? hit.distance.toFixed(2) : null} → (${bx},${by},${bz})`
		);
		check("1. el bloque golpeado NO es un mob", mobRootData(hit) === null);
	}

	// ── 2) Mob DELANTE del bloque (entre cámara y bloque): ataca, no mina ──
	{
		// El mob a x=1.5 queda entre la cámara (-5) y el bloque (3).
		group.position.set(1.5, 0, 0);
		group.updateMatrixWorld(true);
		const hits = mkRay().intersectObjects([terrain, group], true);
		const first = hits[0];
		check(
			"2. el mob delante roba el clic (hits[0] es parte del mob)",
			first && mobRootData(first)?.mobId === "mob-1",
			`primer hit dist=${first ? first.distance.toFixed(2) : null}`
		);
	}

	// ── 3) Mob DETRÁS del bloque: el clic mina el bloque ──────────────────
	{
		// El mob ahora a x=10, detrás del bloque (x=3): el bloque gana.
		group.position.set(10, 0, 0);
		group.updateMatrixWorld(true);
		const hits = mkRay().intersectObjects([terrain, group], true);
		const first = hits[0];
		check(
			"3. el bloque delante gana al mob (la minería no se rompe)",
			first && first.object === terrain && mobRootData(first) === null,
			`primer hit=${first?.object?.type} dist=${first ? first.distance.toFixed(2) : null}`
		);
	}

	// ── 4) Mob con matrixWorld OBSOLETO: el fix de input.js lo corrige ────
	// Escenario propio: el rayo pasa por el ORIGEN del mundo (y=0, z=0). El
	// mob recién creado (posicionado en (10,0,0) pero NUNCA renderizado) tiene
	// matrixWorld de identidad, así que THREE intersecta sus partes contra la
	// geometría en el ORIGEN — Mesh.raycast solo usa matrixWorld, IGNORA la
	// position local. Un mob "invisible" (nunca dibujado) queda tópicamente en
	// el origen: si el clic del jugador cruza esa zona, golpea al mob fantasma
	// en vez del bloque visible → "el clic no hace nada" (ataca al aire).
	{
		// Rayo que pasa por el origen del mundo (por el que el mob fantasma
		// ocuparía su caja [-0.25,0.25]³).
		const originRay = new THREE.Raycaster();
		originRay.set(new THREE.Vector3(-5, 0, 0), new THREE.Vector3(1, 0, 0));
		originRay.far = 20;
		// Bloque visible sobre el MISMO rayo: [3,4]×[-0.5,0.5]×[0,2].
		const floorBlock = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 2));
		floorBlock.position.set(3.5, 0, 0.5);
		floorBlock.userData.isTerrain = true;
		floorBlock.updateMatrixWorld(true);

		const stale = new THREE.Group();
		stale.userData.mobId = "mob-2";
		stale.userData.mobType = "creeper";
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), material);
		stale.add(body);
		stale.position.set(10, 0, 0);
		// (sin stale.updateMatrixWorld() → el cuerpo queda en el origen del mundo)

		// SIN el fix: el rayo golpea el cuerpo del mob en el ORIGEN (dist≈4.75)
		// ANTES que el bloque (dist≈8.0) → el mob fantasma roba el clic.
		const badFirst = originRay.intersectObjects([floorBlock, stale], true)[0];
		check(
			"4. sin refrescar matrices, el mob obsoleto roba el clic en el origen",
			badFirst && mobRootData(badFirst)?.mobId === "mob-2",
			`dist=${badFirst ? badFirst.distance.toFixed(2) : null} (origen, no x=10)`
		);

		// CON el fix (scene.updateMatrixWorld() antes del raycast, como hace
		// raycastTerrainAndMobs de input.js): el mob está en su posición real
		// (x=10, detrás del bloque) → el clic mina el bloque.
		stale.updateMatrixWorld(true); // ← equivalente al fix
		const goodFirst = originRay.intersectObjects([floorBlock, stale], true)[0];
		check(
			"4. refrescando matrices (fix), el clic vuelve a minar el bloque",
			goodFirst &&
				goodFirst.object === floorBlock &&
				mobRootData(goodFirst) === null,
			`primer hit=${goodFirst?.object?.type} dist=${goodFirst ? goodFirst.distance.toFixed(2) : null}`
		);
	}

	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(failed ? `\n${failed} check(s) FALLARON` : "\nTODO OK");
	process.exit(failed ? 1 : 0);
})();
