"use strict";
// ============================================================
// TESTS DE LA CÁMARA (Fase 11, Bloque A2 — fix del pitch)
// El clamp de pitch MANUAL que vivía en public/scene.js (PITCH_LIMIT,
// añadido en Fase 9.5) era redundante y dañino:
//   - PointerLockControls de three r160 YA limita la rotación vertical
//     en onMouseMove: `_euler.x = max(-π/2, min(π/2, _euler.x))` con un
//     Euler en orden 'YXZ' (el orden correcto para un FPS).
//   - El clamp externo escribía `camera.rotation.x = PITCH_LIMIT`
//     directamente. camera.rotation es un Euler en orden 'XYZ' (el
//     del Object3D): con yaw ≠ 0, asignar el componente X en el orden
//     equivocado DESINCRONIZA la orientación → la cámara "daba vueltas
//     descontroladas" al mirar con el ratón (bug reportado: «la Fase 10
//     la rompió»).
// Este test usa THREE real (devDependency three@0.160.0, la del importmap)
// y PointerLockControls real para verificar que:
//   1. PLC r160 clampea el pitch a ±90° POR SÍ SOLO (sin clamp externo),
//   2. con movementX=0 el yaw NO rota solo al mirar arriba/abajo
//      (sin "vueltas descontroladas"),
//   3. el mecanismo del bug: escribir rotation.x con yaw ≠ 0 en el orden
//      XYZ produce una orientación distinta a la del orden YXZ correcto,
//   4. scene.js ya NO contiene el clamp externo (regresión de código).
// ============================================================
const fs = require("node:fs");
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

(async () => {
	const THREE = await import("three");
	const { PointerLockControls } = await import(
		"three/examples/jsm/controls/PointerLockControls.js"
	);

	// ── Helpers: cámara + control con document mock ─────────────────────
	// PLC se conecta a domElement.ownerDocument (mousemove, pointerlockchange,
	// pointerlockerror). En Node no hay DOM: un mock con addEventListener
	// basta para capturar el handler de mousemove y dispararlo a mano.
	function makeCamera() {
		return new THREE.PerspectiveCamera(75, 4 / 3, 0.1, 300);
	}
	function makeControls(camera) {
		const listeners = {};
		const mockDoc = {
			addEventListener: (t, fn) => {
				if (!listeners[t]) listeners[t] = [];
				listeners[t].push(fn);
			},
			removeEventListener: (t, fn) => {
				listeners[t] = (listeners[t] || []).filter((f) => f !== fn);
			},
			pointerLockElement: null,
			exitPointerLock() {
				this.pointerLockElement = null;
			}
		};
		const domElement = { ownerDocument: mockDoc, requestPointerLock() {} };
		const controls = new PointerLockControls(camera, domElement);
		// El onMouseMove de PLC retorna si !isLocked (como en el juego con el
		// puntero bloqueado): el test dispara mousemove como si hubiera lock.
		controls.isLocked = true;
		return { controls, listeners };
	}
	// Dispara un mousemove con movementX/Y (como el evento real del ratón).
	function mouseMove(listeners, movementX, movementY) {
		for (const fn of listeners.mousemove || []) fn({ movementX, movementY });
	}

	// ── 1) PLC r160 clampea el pitch a ±90° por sí solo ─────────────────
	const cam1 = makeCamera();
	const { listeners: l1 } = makeControls(cam1);
	// Mirar muy arriba (movementY muy negativo): el pitch debe quedar a ~+π/2.
	for (let i = 0; i < 10; i++) mouseMove(l1, 0, -2000);
	check(
		"1. el pitch queda limitado a +90° mirando arriba (PLC nativo)",
		cam1.rotation.x >= Math.PI / 2 - 0.01 &&
			cam1.rotation.x <= Math.PI / 2 + 0.01,
		`pitch=${cam1.rotation.x.toFixed(3)}`
	);
	// Mirar muy abajo: el pitch debe quedar a ~-π/2.
	for (let i = 0; i < 20; i++) mouseMove(l1, 0, 2000);
	check(
		"1. el pitch queda limitado a -90° mirando abajo (PLC nativo)",
		cam1.rotation.x >= -Math.PI / 2 - 0.01 &&
			cam1.rotation.x <= -Math.PI / 2 + 0.01,
		`pitch=${cam1.rotation.x.toFixed(3)}`
	);

	// ── 2) Sin clamp externo: el yaw NO rota solo al mirar arriba/abajo ─
	const cam2 = makeCamera();
	const { listeners: l2 } = makeControls(cam2);
	const yawInicial = cam2.rotation.y;
	for (let i = 0; i < 30; i++) mouseMove(l2, 0, 500); // solo pitch
	check(
		"2. el yaw no rota solo al mirar arriba/abajo (movementX=0)",
		Math.abs(cam2.rotation.y - yawInicial) < 1e-6,
		`yawInicial=${yawInicial.toFixed(4)} yawFinal=${cam2.rotation.y.toFixed(4)}`
	);
	// Y con movementX ≠ 0 el yaw sí rota (el control sigue funcionando). Se
	// usa una cámara FRESCA con pitch 0: con la cámara mirando verticalmente
	// (pitch ±90°) hay singularidad de Euler y el yaw se confunde con el roll,
	// lo que NO es el síntoma del bug (el usuario mira al horizonte).
	const cam3 = makeCamera();
	const { listeners: l3 } = makeControls(cam3);
	const yawAntes = cam3.rotation.y;
	mouseMove(l3, 400, 0);
	check(
		"2. el yaw rota al mover el ratón en horizontal (control sano)",
		Math.abs(cam3.rotation.y - yawAntes) > 0.1,
		`Δyaw=${(cam3.rotation.y - yawAntes).toFixed(3)}`
	);

	// ── 3) Mecanismo del bug: rotation.x en XYZ con yaw≠0 desincroniza ─
	// El control nativo aplica el pitch en orden YXZ (el correcto para FPS:
	// primero el yaw, luego el pitch en el eje local). Escribir
	// camera.rotation.x directamente usa el orden XYZ del Object3D: con el
	// mismo valor de yaw, la dirección resultante difiere → la cámara
	// "da vueltas" respecto a lo que se espera al mirar.
	const camNative = makeCamera();
	camNative.rotation.order = "YXZ";
	camNative.rotation.set(1.0, 1.2, 0, "YXZ"); // pitch 57° + yaw 69°
	const dirNative = camNative.getWorldDirection(new THREE.Vector3());

	const camBroken = makeCamera();
	// Sin el fix, el clamp externo hacía exactamente esto (orden XYZ):
	camBroken.rotation.set(1.0, 1.2, 0, "XYZ");
	const dirBroken = camBroken.getWorldDirection(new THREE.Vector3());

	const angle = dirNative.angleTo(dirBroken);
	check(
		"3. mecanismo del bug: rotation.x en XYZ con yaw≠0 desvía la mira",
		angle > 0.05,
		`ángulo entre direcciones=${angle.toFixed(3)} rad`
	);

	// ── 4) scene.js ya no tiene el clamp externo (regresión) ────────────
	const sceneSrc = fs.readFileSync(
		path.join(__dirname, "..", "public", "scene.js"),
		"utf8"
	);
	check(
		"4. scene.js ya no define PITCH_LIMIT (clamp eliminado)",
		!/PITCH_LIMIT/.test(sceneSrc)
	);
	check(
		"4. scene.js no escribe camera.rotation.x en un listener change",
		!/rotation\.x\s*=\s*PITCH_LIMIT/.test(sceneSrc)
	);

	// biome-ignore lint/suspicious/noConsole: resumen del test (convención del proyecto)
	console.log(failed ? `\n${failed} check(s) FALLARON` : "\nTODO OK");
	process.exit(failed ? 1 : 0);
})();
