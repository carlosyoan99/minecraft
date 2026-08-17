"use strict";
// ============================================================
// TESTS UNITARIOS DE LA FASE 19.6 (MOTOR 3D)
// Lógica pura del motor (sin DOM ni WebGL):
//   - materialstyle.js (Bloque B): el toggle toon intercambia el material
//     (MeshToonMaterial) con reutilización del gemelo (WeakMap), el default
//     es MeshLambert y el swap en caliente (applyMaterialStyle) es reversible.
//   - geopool (Bloque C2): la categoría "plant" no mezcla geometría con
//     "torch" (cada una con su set de attributes → el pool por categoría).
//   - torchlights.js (Bloque A2): presupuesto fijo y default OFF.
//   - chunkGeometry (Bloque C2): wind determinista por celda (hash).
//   - daymath (Bloque C1): el factor de día que alimenta uDay ∈ [0,1].
// No se testea rendering (Three WebGL): eso es auditoría CDP (navegador).
// ============================================================
const { Reporter, loaderESM } = require("./helpers.js");

(async () => {
	const r = new Reporter();
	const THREE = await import("three");

	// ============================================================
	// BLOQUE B — materialstyle.js (toggle toon, no PBR)
	// ============================================================
	const ms = await loaderESM("public/materialstyle.js");

	// Default: lambert (regla dura del spec: el toon NUNCA es predeterminado).
	r.check(
		"isToon() false por defecto (MeshLambertMaterial es el perfil)",
		ms.isToon() === false
	);

	// worldMaterial con estilo off devuelve un Lambert.
	{
		const base = ms.worldMaterial({ vertexColors: true });
		r.check(
			"worldMaterial() sin toon crea MeshLambertMaterial",
			base instanceof THREE.MeshLambertMaterial && !base.isMeshToonMaterial
		);
	}

	// Activar toon: worldMaterial devuelve MeshToonMaterial con las mismas
	// propiedades (map/vertexColors heredados del lambert original).
	ms.setToon(true);
	const sharedBase = new THREE.MeshLambertMaterial({
		map: "fict",
		vertexColors: true
	});
	const matA = ms.worldMaterial(
		{ map: "fict", vertexColors: true },
		sharedBase
	);
	const matB = ms.worldMaterial(
		{ map: "fict", vertexColors: true },
		sharedBase
	);
	r.check(
		"worldMaterial() con toon devuelve MeshToonMaterial",
		matA instanceof THREE.MeshToonMaterial
	);
	r.check(
		"el gemelo hereda map y vertexColors del estilo base",
		matA.map === "fict" && matA.vertexColors === true
	);
	r.check(
		"el gemelo se reutiliza para el mismo original (WeakMap)",
		matA === matB
	);

	// applyMaterialStyle: swap reversible de mallas vivas (ShaderMaterial
	// de agua/plantas se ignora: no tiene gemelo).
	const meshLambert = new THREE.Mesh(
		new THREE.BoxGeometry(1, 1, 1),
		new THREE.MeshLambertMaterial({ vertexColors: true })
	);
	const meshShader = new THREE.Mesh(
		new THREE.BoxGeometry(1, 1, 1),
		new THREE.ShaderMaterial()
	);
	const root = {
		traverse(fn) {
			fn(meshLambert);
			fn(meshShader);
		}
	};
	ms.applyMaterialStyle(root);
	r.check(
		"toon ON: malla lambert conmutada a su gemelo toon",
		meshLambert.material.isMeshToonMaterial
	);
	r.check(
		"toon ON: ShaderMaterial se ignora (agua/plantas intactas)",
		meshShader.material.isShaderMaterial
	);
	ms.setToon(false);
	ms.applyMaterialStyle(root);
	r.check(
		"toon OFF: la malla vuelve a su lambert original (reversible)",
		meshLambert.material.isMeshLambertMaterial &&
			!meshLambert.material.isMeshToonMaterial
	);

	// Resetizar el estilo para el resto de la fase.
	ms.setToon(false);

	// ============================================================
	// BLOQUE C2 — geopool: categoría "plant" propia
	// La geometría de plantas lleva attribute `wind`; el pool por categoría
	// garantiza que una geometría re-adquirida para "plant" nunca se mezcle
	// con "torch". Se testea el pool puro (geopool.js, sin three).
	// ============================================================
	const { createGeometryPool, setOrReuseAttribute } =
		await loaderESM("public/geopool.js");
	{
		// Geometría falsa mínima con el protocolo que usa geopool.js
		// (getAttribute/setAttribute): hace el pool testeable sin three.
		const makeGeo = () => {
			const attributes = new Map();
			return {
				getAttribute: (name) => attributes.get(name),
				setAttribute(name, attr) {
					attributes.set(name, attr);
					return this;
				}
			};
		};
		const pool = createGeometryPool({
			makeGeometry: makeGeo,
			categories: ["terrain", "water", "lod", "torch", "plant"]
		});
		// Constructor (no arrow) para que `new Float32BufferAttributeCtor(...)`
		// funcione como fake de THREE.Float32BufferAttribute.
		const FBuf = function FBuf(arr, n) {
			this.array = arr;
			this.itemSize = n;
		};
		const gPlant = pool.acquire("plant");
		setOrReuseAttribute(gPlant, "pos", new Float32Array(6), 3, FBuf);
		setOrReuseAttribute(gPlant, "wind", new Float32Array(4), 2, FBuf);
		pool.release("plant", gPlant);
		const gTorch = pool.acquire("torch");
		r.check(
			"categorías plant/torch independientes en el geopool",
			gTorch !== gPlant
		);
		const gPlant2 = pool.acquire("plant");
		r.check(
			"re-adquirir 'plant' reutiliza la geometría liberada",
			gPlant2 === gPlant
		);
		r.check(
			"la geometría re-adquirida conserva el attribute wind",
			gPlant2.getAttribute("wind")?.array.length === 4
		);
	}

	// ============================================================
	// BLOQUE A2 — torchlogic.js: presupuesto y selección de antorchas
	// Lógica pura (sin THREE ni DOM): las `budget` antorchas más cercanas
	// dentro del radio, y nada fuera de él. La gestión de PointLight real
	// (crear/ocultar) es navegador.
	// ============================================================
	{
		const tl = await loaderESM("public/torchlogic.js");
		// Presupuesto en la spec: 4-6 luces máx. (regla dura §G1: OFF por
		// defecto). Selección con 2 antorchas dentro del radio 7 y 1 fuera.
		const torches = [
			[4, 64, 4], // a ~6.4 bloques del jugador (0,64,0) — dentro
			[3, 64, 3], // a ~5.0 — dentro
			[-6, 64, -6], // a ~9.2 (fuera de radio 7)
			[100, 64, 100] // lejísimos
		];
		const sel = tl.selectTorchLights(torches, 0, 64, 0, 7, 4);
		r.check(
			"A2: selecciona SOLO las antorchas dentro del radio",
			sel.length === 2,
			`${sel.length} seleccionadas`
		);
		r.check(
			"A2: las más cercanas primero (orden por distancia)",
			sel[0][0] === 3 && sel[0][2] === 3 && sel[1][0] === 4 && sel[1][2] === 4,
			JSON.stringify(sel)
		);
		const capped = tl.selectTorchLights(torches, 3, 64, 3, 20, 2);
		r.check("A2: el presupuesto limita a `budget` luces", capped.length === 2);
		r.check(
			"A2: sin antorchas cerca devuelve lista vacía",
			tl.selectTorchLights([], 0, 64, 0, 5, 4).length === 0
		);
		r.check(
			"A2: presupuesto por defecto = 4 (dentro del rango 4-6 de la spec)",
			tl.TORCH_LIGHT_BUDGET === 4
		);
	}

	// ============================================================
	// BLOQUE C2 — chunkGeometry: wind determinista por celda
	// El hash de fase (hierba) debe ser determinista (misma celda → misma
	// fase) y repartirse entre celdas distintas (no todas en 0).
	// ============================================================
	{
		const cg = await loaderESM("public/chunkGeometry.js");
		const h = cg.hashCell;
		r.check("C2: hashCell existe y es función", typeof h === "function");
		if (typeof h === "function") {
			const once = h(3, 7);
			r.check(
				"C2: hashCell determinista (misma celda → misma fase)",
				once === h(3, 7)
			);
			const phases = new Set();
			for (let x = 0; x < 20; x++)
				for (let z = 0; z < 20; z++) phases.add(h(x, z));
			r.check(
				"C2: fases variadas entre celdas (no todas iguales)",
				phases.size > 50,
				`${phases.size} fases distintas`
			);
			r.check(
				"C2: la fase está en [0,1)",
				Array.from(phases).every((p) => p >= 0 && p < 1)
			);
		}
	}

	// ============================================================
	// BLOQUE C1 — daymath: el factor de día que alimenta uDay ∈ [0,1]
	// Los shaders de agua y plantas se encienden con uDay; si el factor
	// saliera del rango, brillarían mal de noche o se apagarían de día.
	// ============================================================
	{
		const dm = await loaderESM("public/daymath.js");
		const DAY = 24000 * 50; // un ciclo completo (ms de escena)
		const f = dm.dayFactor;
		const samples = [0, 0.25, 0.5, 0.75, 1];
		r.check(
			"C1: dayFactorOf ∈ [0,1] en la fracción del ciclo (uDay)",
			samples.every((frac) => {
				const v = f(frac * DAY);
				return v >= 0 && v <= 1;
			})
		);
	}

	// ============================================================
	// P7 (Fase 20 B4) — índice espacial de antorchas en chunkstore
	// bakeChunkLight/hasTorchNear consultan el vecindario 3×3 de chunks
	// (getTorchesNear), no el torchSet completo. Se verifica que el índice
	// se alimenta en paralelo (storeChunkData y setClientBlock) y que
	// getTorchesNear SOLO devuelve antorchas del vecindario pedido.
	// ============================================================
	{
		const cs = await loaderESM("public/chunkstore.js");
		const { CHUNK_SIZE, TORCH } = await loaderESM("public/constants.js");
		const full = CHUNK_SIZE * 128 * CHUNK_SIZE;
		// Antorcha en el chunk (0,0) y otra en el (2,0): la segunda NO está en
		// el vecindario 3×3 de un bloque del (0,0).
		const arr = new Uint8Array(full);
		arr[0] = TORCH; // (0,0) local x0 y0 z0 → mundo (0,-64,0)
		cs.storeChunkData("0,0", arr);
		const far = new Uint8Array(full);
		far[0] = TORCH; // mundo (32,-64,0) → chunk (2,0)
		cs.storeChunkData("2,0", far);
		const near = cs.getTorchesNear(1, -60, 1); // bloque del chunk (0,0)
		r.check(
			"P7: getTorchesNear devuelve la antorcha del vecindario (chunk 0,0)",
			near.some((t) => t[0] === 0 && t[2] === 0)
		);
		r.check(
			"P7: no devuelve antorchas fuera del vecindario 3×3 (chunk 2,0)",
			near.every((t) => t[0] < CHUNK_SIZE)
		);
		// setClientBlock mantiene el índice: colocar una antorcha en el chunk
		// (0,0) la hace visible al vecindario; romperla la retira.
		cs.setClientBlock(5, -60, 5, TORCH);
		const after = cs.getTorchesNear(5, -60, 5);
		r.check(
			"P7: setClientBlock con TORCH alimenta el índice espacial",
			after.some((t) => t[0] === 5 && t[1] === -60 && t[2] === 5)
		);
		cs.setClientBlock(5, -60, 5, 0);
		const removed = cs.getTorchesNear(5, -60, 5);
		r.check(
			"P7: romper la antorcha la retira del índice espacial",
			removed.every((t) => !(t[0] === 5 && t[1] === -60 && t[2] === 5))
		);
		// chunks_unload limpia el índice del chunk.
		cs.removeChunkData("0,0");
		r.check(
			"P7: removeChunkData limpia el índice del chunk",
			cs.getTorchesNear(1, -60, 1).every((t) => t[0] !== 0 || t[2] !== 0)
		);
	}

	r.done();
})().catch((e) => {
	// biome-ignore lint/suspicious/noConsole: error real del test (no silenciar, convención del proyecto)
	console.error("error en el test:", e);
	process.exit(1);
});
