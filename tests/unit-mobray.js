"use strict";
// ============================================================
// TESTS DEL RAYCAST DE MOBS MULTIBLOQUE (Fase 8, B9)
// Los mobs ya no son un BoxGeometry único: son GRUPOS de partes
// (MOB_PARTS en mobtextures.js). El raycast de input.js intersecta
// con recursive=true y SUBE por el árbol hasta el grupo raíz que
// tiene userData.mobId (mobRootData). Este test reproduce ese
// mecanismo con THREE real: construye un grupo tipo zombi (cabeza +
// cuerpo + piernas), lanza un rayo contra él y comprueba que:
//   1. el rayo intersecta las PARTES (cajas hijas), no solo el grupo,
//   2. subiendo por parent se llega al raíz con mobId,
//   3. el rayo también golpea el terreno (un bloque lejano) cuando el
//      mob no está delante — no se rompe la minería.
// Usa three@0.160.0 (devDependency, la del importmap del cliente).
// ============================================================
const fs = require("node:fs");
const _os = require("node:os");
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
const check = (name, ok, extra = "") => {
	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(`${ok ? "OK " : "✗  "}${name}${extra ? ` — ${extra}` : ""}`);
	if (!ok) {
		failed++;
		failedChecks.push(name);
	}
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

(async () => {
	const THREE = await import("three");
	// mobtextures.js es ESM con dependencias de navegador (document), así que
	// el esquema MOB_PARTS se verifica en disco y el grupo se construye aquí
	// con las dimensiones del spec §B9 (equivalente al del juego).
	const mobtexSrc = fs.readFileSync(
		path.join(__dirname, "..", "public", "mobtextures.js"),
		"utf8"
	);
	// El esquema MOB_PARTS debe exportarse (lo consume mobs.js).
	check(
		"mobtextures.js exporta MOB_PARTS (esquema multibloque)",
		/export const MOB_PARTS = \{/.test(mobtexSrc)
	);
	check(
		"mobtextures.js exporta mobPartRects (rects por parte)",
		/export function mobPartRects/.test(mobtexSrc)
	);

	// Esquema manual mínimo equivalente (dimensiones del spec §B9 zombi):
	const parts = [
		{ name: "head", size: [0.5, 0.5, 0.5], pos: [0, 1.55, 0] },
		{ name: "body", size: [0.5, 0.75, 0.25], pos: [0, 1.05, 0] },
		{ name: "leg", size: [0.25, 0.75, 0.25], pos: [-0.125, 0.375, 0] },
		{ name: "leg", size: [0.25, 0.75, 0.25], pos: [0.125, 0.375, 0] }
	];

	const group = new THREE.Group();
	group.userData.mobId = "mob-1";
	group.userData.mobType = "zombie";
	const material = new THREE.MeshLambertMaterial({ color: 0xffffff });
	for (const part of parts) {
		const [w, h, d] = part.size;
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
		mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
		group.add(mesh);
	}
	group.position.set(10, 0, 0); // el mob está a 10 bloques en X
	// three aplica las matrices de world en el render/updateMatrixWorld: el
	// raycast las necesita (igual que el bucle del juego actualiza la escena).
	group.updateMatrixWorld(true);

	// Un bloque de terreno a 3 bloques del origen (más cerca que el mob): el
	// rayo va a y=1.2, así que el bloque se centra a esa altura (cubre 0.7..1.7)
	// para estar en la trayectoria — la minería apunta a lo que TAPA el rayo.
	const terrain = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
	terrain.position.set(3, 1.2, 0);
	terrain.updateMatrixWorld(true); // el render del juego la actualiza cada frame

	// ── 1) El rayo (sin obstáculos) golpea el mob multibloque ────────────
	const raycaster = new THREE.Raycaster();
	raycaster.set(new THREE.Vector3(-5, 1.2, 0), new THREE.Vector3(1, 0, 0));
	raycaster.far = 20;
	// Recursivo como input.js (intersectObjects(..., true)): solo el grupo.
	const hits = raycaster.intersectObjects([group], true);
	check(
		"1. el rayo intersecta las PARTES del mob multibloque",
		hits.length > 0 && hits[0].object.parent === group,
		`hits=${hits.length}, object=${hits[0]?.object?.type}`
	);
	const rootData = mobRootData(hits[0]);
	check(
		"1. subiendo por parent se llega al raíz con mobId",
		rootData?.mobId === "mob-1" && rootData?.mobType === "zombie",
		`mobId=${rootData?.mobId}`
	);

	// ── 2) Con el terreno delante, el clic mina (no golpea al mob) ────────
	const raycaster2 = new THREE.Raycaster();
	raycaster2.set(new THREE.Vector3(-5, 1.2, 0), new THREE.Vector3(1, 0, 0));
	raycaster2.far = 20;
	// El terreno (x=3) está entre la cámara y el mob (x=10):
	raycaster2.near = 0;
	const hits2 = raycaster2.intersectObjects([group, terrain], true);
	// El primer hit es el terreno (más cercano), no el mob:
	check(
		"2. el bloque delante gana al mob (la minería no se rompe)",
		hits2.length > 0 &&
			hits2[0].object === terrain &&
			mobRootData(hits2[0]) === null,
		`primer hit=${hits2[0]?.object?.type}`
	);

	// ── 3) El grupo raíz SIN partes (grupo vacío) no intercepta el rayo ──
	// (asegura que recursive=true no introduce falsos positivos en grupos
	// vacíos/etiquetas: solo intersectan las cajas de las partes).
	const emptyGroup = new THREE.Group();
	emptyGroup.position.set(10, 0, 0);
	const hits3 = raycaster.intersectObjects([emptyGroup], true);
	check("3. un grupo sin partes no intercepta el rayo", hits3.length === 0);

	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(failed ? `\n${failed} check(s) FALLARON` : "\nTODO OK");
	process.exit(failed ? 1 : 0);
})();
