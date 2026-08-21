// ============================================================
// PANTALLA DE CARGA (estilo Minecraft)
// Se muestra desde el arranque del cliente mientras el servidor
// genera/transmite el mundo y llega el `init` con los chunks del
// spawn. Progreso simulado suave (el servidor manda el mundo de
// golpe en `init`, no hay métrica incremental real), consejos que
// rotan como los de Minecraft, y estado de error con Reintentar
// si la conexión se pierde.
// ============================================================
const screen = document.getElementById("loading-screen");
const fill = document.getElementById("loading-fill");
const statusEl = document.getElementById("loading-status");
const tipEl = document.getElementById("loading-tip");
const errorBox = document.getElementById("loading-error");
const retryBtn = document.getElementById("loading-retry");

// Consejos rotatorios (relevantes para este juego, en español)
const TIPS = [
	"Consejo: la comida cocinada restaura mucho más hambre que la cruda.",
	"Consejo: usa la herramienta correcta: pico para piedra, hacha para madera, pala para tierra.",
	"Consejo: por la noche salen mobs hostiles — refúgiate o ilumina la zona.",
	"Consejo: rompe hierba para conseguir semillas y poder criar pollos.",
	"Consejo: pulsa E para abrir la mesa de crafteo e inventario.",
	"Consejo: con hambre, come con el clic derecho (la comida seleccionada).",
	"Consejo: escribe /help en el chat para ver los comandos del servidor.",
	"Consejo: /time set day hace amanecer al instante.",
	"Consejo: cada semilla genera un mundo distinto (SEED=algo al arrancar).",
	"Consejo: vigila la barra de durabilidad: las herramientas se rompen.",
	"Consejo: alimenta a dos animales iguales para que críen un bebé.",
	"Consejo: los lagos son agua no sólida: puedes nadar a través de ellos."
];

// Fases del "generado" que se suceden según avanza la barra (solo visual)
const STAGES = [
	{ pct: 18, text: "Generando terreno..." },
	{ pct: 38, text: "Sembrando árboles..." },
	{ pct: 58, text: "Excavando cuevas..." },
	{ pct: 78, text: "Población de criaturas..." },
	{ pct: 90, text: "Preparando el mundo..." }
];

let tipIdx = 0;
let done = false;
let progressTimer = null;
let hangTimer = null; // timeout defensivo: init nunca llega → error
let warnTimer = null; // aviso intermedio de generación lenta (Fase 17, B2)
let tipTimer = null;
let started = performance.now();

// Rotación de consejos mientras carga (se limpia en finishLoading)
tipTimer = setInterval(() => {
	if (done) return;
	tipIdx = (tipIdx + 1) % TIPS.length;
	tipEl.textContent = TIPS[tipIdx];
}, 2500);

export function setProgress(pct) {
	const clamped = Math.max(0, Math.min(100, pct));
	fill.style.width = `${clamped}%`;
	// Accesibilidad: sincronizar aria-valuenow con el progreso visual
	const bar = fill.parentElement;
	if (bar) bar.setAttribute("aria-valuenow", Math.round(clamped));
}
export function setStatus(text) {
	statusEl.textContent = text;
}

// Muestra la pantalla (o la reinicia si se vuelve a llamar) y arranca
// la barra de progreso simulada, que nunca llega al 100% por sí sola:
// el 100% lo pone finishLoading() cuando llega el `init` con el mundo.
export function showLoading(message) {
	done = false;
	screen.classList.remove("hidden", "fade-out");
	errorBox.classList.add("hidden");
	started = performance.now();
	setProgress(0);
	setStatus(message || "Conectando al servidor...");
	tipEl.textContent = TIPS[tipIdx % TIPS.length];
	if (progressTimer) clearInterval(progressTimer);
	progressTimer = setInterval(() => {
		if (done) return;
		const cur = parseFloat(fill.style.width) || 0;
		// Crecimiento asintótico lento (0→~90% en ~10s): se siente "cargando"
		// incluso cuando el mundo llega en milisegundos desde caché.
		const next = Math.min(cur + (100 - cur) * 0.02 + 0.3, 90);
		setProgress(next);
		const stage = STAGES.find((s) => next <= s.pct);
		if (stage) setStatus(stage.text);
	}, 120);
	// Defensivo: si el init nunca llega (conexión colgada, no un crash — el
	// crash lo cubre el handler de 'close'), mostrar el error en vez de dejar
	// la pantalla a ~90% para siempre. Fase 17 (B2): el primer arranque de un
	// mundo genera chunks y puede tardar >20s en máquinas lentas; el error
	// real de desconexión lo dispara el cierre del socket (connection.js), así
	// que aquí solo se avisa a los 45s con un mensaje intermedio a los 20s.
	if (hangTimer) clearTimeout(hangTimer);
	if (warnTimer) clearTimeout(warnTimer);
	warnTimer = setTimeout(() => {
		if (done) return;
		setStatus(
			"El mundo sigue generándose — el primer arranque puede tardar un poco..."
		);
	}, 20000);
	hangTimer = setTimeout(() => {
		if (!done) showConnectionError();
	}, 45000);
}

// El mundo ya está listo (init recibido): barra al 100%, "¡Listo!" y
// fundido. Tiempo mínimo visible de ~700 ms para que no parpadee en
// cargas instantáneas (mundo en caché).
export function finishLoading() {
	if (done) return;
	done = true;
	if (progressTimer) clearInterval(progressTimer);
	if (hangTimer) clearTimeout(hangTimer);
	if (warnTimer) clearTimeout(warnTimer);
	if (tipTimer) clearInterval(tipTimer);
	setProgress(100);
	setStatus("¡Listo!");
	const wait = Math.max(0, 700 - (performance.now() - started));
	setTimeout(() => {
		screen.classList.add("fade-out");
		setTimeout(() => screen.classList.add("hidden"), 500);
	}, wait);
}

// Conexión perdida: congela la carga y ofrece reintentar (recarga la
// página, que vuelve a conectar y a generar el mundo).
export function showConnectionError() {
	done = true;
	if (progressTimer) clearInterval(progressTimer);
	if (hangTimer) clearTimeout(hangTimer);
	if (warnTimer) clearTimeout(warnTimer);
	if (tipTimer) clearInterval(tipTimer);
	// Re-mostrar la pantalla si el juego ya estaba activo (tras finishLoading
	// quedó oculta): sin esto, el error al caerse el servidor sería invisible.
	screen.classList.remove("hidden", "fade-out");
	setStatus("Conexión perdida");
	errorBox.classList.remove("hidden");
}
retryBtn.addEventListener("click", () => location.reload());

// Side effect de arranque: mostrar la pantalla de carga en cuanto el
// módulo se importa (antes de que el socket abra). Si el JS no carga,
// la pantalla permanece oculta por CSS y el menú funciona igual.
showLoading();
