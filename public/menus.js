// ============================================================
// MENÚS (Fase 18, D-6): pantalla principal / mundos / nuevo mundo /
// ajustes en pestañas / pausa, nombre de jugador, skins y semilla.
// Extraído de ui.js; ui.js es el orquestador que re-exporta esta fachada.
// ============================================================
import {
	defaultName,
	defaultSkin,
	send,
	setStoredName,
	setStoredSkin
} from "./connection.js";
import { flashMessage } from "./hud.js"; // Fase 18 (D-6): mensajes del menú
import { finishLoading, showLoading } from "./loading.js";
import { controls, showBlocker, showMenuBg } from "./scene.js";
import {
	getSettings,
	setSetting,
	settingUiValue,
	toggleFullscreen // Fase 16 (E1): pantalla completa
} from "./settings.js";
import { initSkinPreview, setPreviewSkin } from "./skinpreview.js"; // Fase 17: vista previa 3D del personaje
import { isValidSkin, paintHeadPreview, SKINS } from "./skins.js"; // Fase 17: skins de jugador

// ============================================================
// MENÚ (Fase 7 + Fase 17): pantallas principal / mundos / nuevo mundo /
// ajustes / pausa, nombre de jugador y semilla del mundo. Fase 17 (A5): el
// servidor puede arrancar en MODO MENÚ (sin mundo activo — sin SEED): el
// cliente recibe `menu_state` con la lista de mundos y NO entra al juego
// hasta que el jugador elige/crea uno (join_world). Con SEED en el entorno
// el servidor arranca directo al mundo (init) y el flujo es el clásico.
// ============================================================
const menuMain = document.getElementById("menu-main");
const menuWorlds = document.getElementById("menu-worlds");
const menuCreate = document.getElementById("menu-create");
const menuSettings = document.getElementById("menu-settings");
const menuHelp = document.getElementById("menu-help");
const menuAbout = document.getElementById("menu-about");
const menuPause = document.getElementById("menu-pause");
const startBtn = document.getElementById("start-btn");
const settingsBtn = document.getElementById("settings-btn");
const helpBtn = document.getElementById("help-btn");
const aboutBtn = document.getElementById("about-btn");
const quitBtn = document.getElementById("quit-btn");
const worldsBackBtn = document.getElementById("worlds-back-btn");
const createBackBtn = document.getElementById("create-back-btn");
const newWorldBtn = document.getElementById("new-world-btn");
const settingsBackBtn = document.getElementById("settings-back-btn");
const helpBackBtn = document.getElementById("help-back-btn");
const aboutBackBtn = document.getElementById("about-back-btn");
const worldsListEl = document.getElementById("worlds-list");
const worldNameInput = document.getElementById("world-name-input");
const seedInput = document.getElementById("seed-input");
const seedCreateBtn = document.getElementById("seed-create-btn");
const randomSeedBtn = document.getElementById("random-seed-btn");
// Fase 17 (C1): pantalla de pausa (Esc dentro del juego).
const pauseResumeBtn = document.getElementById("pause-resume-btn");
const pauseSettingsBtn = document.getElementById("pause-settings-btn");
const pauseHelpBtn = document.getElementById("pause-help-btn");
const pauseQuitBtn = document.getElementById("pause-quit-btn");
// Fase 9 (Bloque B): selector de modo al crear un mundo NUEVO.
const gamemodeSelect = document.getElementById("gamemode-select");
// Fase 10 (B1): tamaño del mundo nuevo (small/medium/large; debug/infinito
// quedan internos y no se ofrecen aquí).
const sizeSelect = document.getElementById("world-size-select");
const nameInput = document.getElementById("name-input");
const rdSlider = document.getElementById("rd-slider");
const rdValue = document.getElementById("rd-value");
const coordsToggle = document.getElementById("coords-toggle");
// B1 (Fase 8): invertir el eje lateral A/D (persistido en mc_settings)
const invertToggle = document.getElementById("invert-toggle");
// Fase 7: FOV, sensibilidad, volumen por categoría y calidad gráfica
const fovSlider = document.getElementById("fov-slider");
const fovValue = document.getElementById("fov-value");
const sensSlider = document.getElementById("sens-slider");
const sensValue = document.getElementById("sens-value");
const volMaster = document.getElementById("vol-master");
const volMasterValue = document.getElementById("vol-master-value");
const volEffects = document.getElementById("vol-effects");
const volEffectsValue = document.getElementById("vol-effects-value");
const volAmbient = document.getElementById("vol-ambient");
const volAmbientValue = document.getElementById("vol-ambient-value");
const qualitySelect = document.getElementById("quality-select");
// Fase 16 (E1): pantalla completa (F11 / checkbox de ajustes)
const fullscreenToggle = document.getElementById("fullscreen-toggle");
// Fase 19.5 (B4): accesibilidad — reducir movimiento (atenúa FOV del sprint)
const reduceMotionToggle = document.getElementById("reduce-motion-toggle");
const toonToggle = document.getElementById("toon-toggle");
const torchLightToggle = document.getElementById("torch-light-toggle");
const mipmapsToggle = document.getElementById("mipmaps-toggle");
let _currentSeed = null; // semilla activa (la trae el init del servidor)
let seedPending = null; // semilla pedida en el menú, pendiente de confirmar
// Fase 17 (A5): el cliente empieza EN EL MENÚ hasta recibir el init de un
// mundo (join_world). Con SEED (modo clásico) el init llega al conectar y
// pasa a false de inmediato; tras leave_world vuelve a true.
export let inMenu = true;

function showMenuScreen(which) {
	for (const el of [
		menuMain,
		menuWorlds,
		menuCreate,
		menuSettings,
		menuHelp,
		menuAbout,
		menuPause
	])
		el.classList.toggle("hidden", el !== which);
}

// Fase 17 (A5/D1): ¿pantalla táctil? (joystick virtual + botones). El ratón
// y el teclado siguen siendo el camino principal; el HUD táctil es un extra.
export function isTouchDevice() {
	return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

// Fase 17 (A1/A5/C1): muestra el MENÚ (estado `menu_state` del servidor o
// al volver al menú principal): cierra la carga, pinta la lista de mundos y
// deja el bloqueador visible. `worlds` opcional refresca la lista.
export function showMenu(worlds) {
	inMenu = true;
	setTouchVisible(false);
	if (worlds) renderWorldsList(worlds);
	showMenuScreen(menuMain);
	showBlocker(true);
	showMenuBg(true); // fondo del menú: visible solo en el menú principal
	finishLoading();
}

// Fase 17 (C1): pantalla de pausa — Esc en el juego (sin paneles abiertos).
// Libera el puntero para clicar los botones; Continuar lo vuelve a bloquear.
export function showPause() {
	showMenuScreen(menuPause);
	showBlocker(true);
	controls.unlock();
}
export function resumeGame() {
	menuPause.classList.add("hidden");
	controls.lock();
}
export function isPauseOpen() {
	return !menuPause.classList.contains("hidden");
}

// Nombre de jugador: se persiste en localStorage (mc_name) y se envía con
// set_name (el servidor es la fuente de verdad y lo sanea).
nameInput.value = defaultName();
nameInput.addEventListener("change", () => {
	const n = nameInput.value.trim();
	if (n) {
		nameInput.value = n;
		setStoredName(n);
		send("set_name", { name: n });
	} else nameInput.value = defaultName();
});
nameInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") startBtn.click();
});

// ============================================================
// SELECTOR DE SKINS (Fase 17)
// Grid de los 9 skins oficiales (Steve, Alex, Noor, Sunny, Ari,
// Zuri, Makena, Kai, Efe) con miniatura procedural de la cabeza.
// La elección se persiste en localStorage (mc_skin, connection.js)
// y se envía al servidor con set_skin (lo propaga a los demás en
// vivo con player_skin). Es preferencia del CLIENTE, como el
// nombre: no viaja en el guardado de mundos.
// ============================================================
let selectedSkin = defaultSkin();
const skinGrid = document.getElementById("skin-grid");
function selectSkin(id) {
	if (!isValidSkin(id) || id === selectedSkin) return;
	selectedSkin = id;
	setStoredSkin(id);
	send("set_skin", { skin: id });
	refreshSkinSelector();
	setPreviewSkin(id); // la figura 3D del menú cambia en vivo
}
function refreshSkinSelector() {
	for (const card of skinGrid.children)
		card.classList.toggle("selected", card.dataset.skin === selectedSkin);
}
// Se construye una vez: miniatura 56px (escala 3) + nombre bajo la cabeza.
for (const s of SKINS) {
	const card = document.createElement("button");
	card.type = "button";
	card.className = "skin-card";
	card.dataset.skin = s.id;
	card.title = `Skin de ${s.label}`;
	const c = document.createElement("canvas");
	c.width = c.height = 48;
	const g = c.getContext("2d");
	g.imageSmoothingEnabled = false;
	paintHeadPreview(g, s.id, 48);
	const label = document.createElement("span");
	label.textContent = s.label;
	card.append(c, label);
	card.addEventListener("click", () => selectSkin(s.id));
	skinGrid.appendChild(card);
}
refreshSkinSelector();
// Vista previa 3D giratoria del personaje (arranca con la skin guardada).
initSkinPreview();

// Fase 17 (A2): «Un jugador» muestra la lista de mundos (el flujo de
// set_seed directo queda solo para el modo clásico con SEED).
startBtn.addEventListener("click", () => {
	const n = nameInput.value.trim();
	if (n) {
		setStoredName(n);
		send("set_name", { name: n });
	} else nameInput.value = defaultName();
	showMenuScreen(menuWorlds);
	send("worlds_list"); // el servidor responde y renderWorldsList pinta la lista
});
newWorldBtn.addEventListener("click", () => showMenuScreen(menuCreate));
worldsBackBtn.addEventListener("click", () => showMenuScreen(menuMain));
createBackBtn.addEventListener("click", () => showMenuScreen(menuWorlds));
// Fase 17 (A2): «Salir» no hace nada destructivo (el navegador bloquea
// window.close() salvo pestañas abiertas por el propio script).
quitBtn.addEventListener("click", () => {
	flashMessage(
		"👋 Salir no está disponible en el navegador (cierra la pestaña)."
	);
	try {
		window.close();
	} catch {
		/* sin acción */
	}
});

// Rellena los controles de ajustes con los valores guardados (lo usa tanto
// el menú principal como la pausa — Fase 17, C1).
let settingsReturnTo = menuMain; // pantalla a la que vuelve «Volver» de ajustes
function refreshSettingsUI() {
	const s = getSettings();
	rdSlider.value = s.renderDistance;
	rdValue.textContent = s.renderDistance;
	coordsToggle.checked = s.showCoords;
	invertToggle.checked = s.invertControls;
	reduceMotionToggle.checked = !!s.reduceMotion; // F19.5 (B4)
	toonToggle.checked = !!s.toon; // F19.6 (B)
	torchLightToggle.checked = !!s.torchLight; // F19.6 (A2)
	mipmapsToggle.checked = !!s.mipmaps; // F19.6 (E)
	// Fase 7: rellenar los nuevos controles con los valores guardados
	fovSlider.value = s.fov;
	fovValue.textContent = `${s.fov}°`;
	sensSlider.value = settingUiValue("sensitivity");
	sensValue.textContent = `${settingUiValue("sensitivity")}%`;
	volMaster.value = settingUiValue("volumeMaster");
	volMasterValue.textContent = `${settingUiValue("volumeMaster")}%`;
	volEffects.value = settingUiValue("volumeEffects");
	volEffectsValue.textContent = `${settingUiValue("volumeEffects")}%`;
	volAmbient.value = settingUiValue("volumeAmbient");
	volAmbientValue.textContent = `${settingUiValue("volumeAmbient")}%`;
	qualitySelect.value = s.quality;
	// Fase 16 (E1): el checkbox refleja la preferencia guardada (el estado real
	// del navegador puede divergir si se salió con Esc — lo sincroniza
	// fullscreenchange en settings.js).
	fullscreenToggle.checked = !!s.fullscreen;
}
settingsBtn.addEventListener("click", () => {
	settingsReturnTo = menuMain;
	showMenuScreen(menuSettings);
	refreshSettingsUI();
});
pauseSettingsBtn.addEventListener("click", () => {
	settingsReturnTo = menuPause;
	showMenuScreen(menuSettings);
	refreshSettingsUI();
});
settingsBackBtn.addEventListener("click", () =>
	showMenuScreen(settingsReturnTo)
);

// Fase 17 (A4): pestañas de ajustes (Video / Audio / Controles) — solo
// alternan paneles; la lógica de cada ajuste sigue intacta en settings.js.
// Scope `#menu-settings` para no chocar con las pestañas de Ayuda (que
// comparten la clase .st-tab pero alternan .help-pane).
for (const tab of document.querySelectorAll("#menu-settings .st-tab")) {
	tab.addEventListener("click", () => {
		for (const t of document.querySelectorAll("#menu-settings .st-tab"))
			t.classList.toggle("active", t === tab);
		const pane = document.getElementById(`pane-${tab.dataset.tab}`);
		for (const p of document.querySelectorAll("#menu-settings .settings-pane"))
			p.classList.toggle("hidden", p !== pane);
	});
}

// Sección Ayuda: pestañas Controles / Mecánicas / Comandos / Problemas sobre
// .help-pane (mismo patrón que ajustes, contenido estático).
for (const tab of document.querySelectorAll("#menu-help .st-tab")) {
	tab.addEventListener("click", () => {
		for (const t of document.querySelectorAll("#menu-help .st-tab"))
			t.classList.toggle("active", t === tab);
		const pane = document.getElementById(`pane-${tab.dataset.tab}`);
		for (const p of document.querySelectorAll("#menu-help .help-pane"))
			p.classList.toggle("hidden", p !== pane);
	});
}

// Fase 17 (C1): pausa — Continuar reanuda; Volver al menú principal envía
// leave_world (el servidor persiste al jugador y responde menu_state).
pauseResumeBtn.addEventListener("click", resumeGame);
pauseQuitBtn.addEventListener("click", () => {
	if (inMenu) return;
	showLoading("Volviendo al menú...");
	send("leave_world");
});

// Sección Ayuda/Acerca de: pantallas del menú principal (y Ayuda en pausa).
// El botón Volver regresa a la pantalla de origen (patrón de ajustes).
let helpReturnTo = menuMain; // pantalla a la que vuelve «← Volver» de Ayuda
const aboutReturnTo = menuMain;
function openHelp(from) {
	helpReturnTo = from;
	showMenuScreen(menuHelp);
}
helpBtn.addEventListener("click", () => openHelp(menuMain));
pauseHelpBtn.addEventListener("click", () => openHelp(menuPause));
aboutBtn.addEventListener("click", () => showMenuScreen(menuAbout));
helpBackBtn.addEventListener("click", () => showMenuScreen(helpReturnTo));
aboutBackBtn.addEventListener("click", () => showMenuScreen(aboutReturnTo));

rdSlider.addEventListener("input", () => {
	rdValue.textContent = rdSlider.value;
	setSetting("renderDistance", parseInt(rdSlider.value, 10));
});
// Fase 7: FOV, sensibilidad, volúmenes y calidad (persisten en mc_settings)
fovSlider.addEventListener("input", () => {
	fovValue.textContent = `${fovSlider.value}°`;
	setSetting("fov", parseInt(fovSlider.value, 10));
});
sensSlider.addEventListener("input", () => {
	sensValue.textContent = `${sensSlider.value}%`;
	setSetting("sensitivity", parseInt(sensSlider.value, 10) / 100);
});
volMaster.addEventListener("input", () => {
	volMasterValue.textContent = `${volMaster.value}%`;
	setSetting("volumeMaster", parseInt(volMaster.value, 10) / 100);
});
volEffects.addEventListener("input", () => {
	volEffectsValue.textContent = `${volEffects.value}%`;
	setSetting("volumeEffects", parseInt(volEffects.value, 10) / 100);
});
volAmbient.addEventListener("input", () => {
	volAmbientValue.textContent = `${volAmbient.value}%`;
	setSetting("volumeAmbient", parseInt(volAmbient.value, 10) / 100);
});
qualitySelect.addEventListener("change", () =>
	setSetting("quality", qualitySelect.value)
);
coordsToggle.addEventListener("change", () =>
	setSetting("showCoords", coordsToggle.checked)
);
invertToggle.addEventListener("change", () =>
	setSetting("invertControls", invertToggle.checked)
);
// Fase 16 (E1): el cambio del checkbox es un gesto de usuario válido para el
// Fullscreen API — toggleFullscreen() hace la petición real al navegador.
fullscreenToggle.addEventListener("change", () => toggleFullscreen());
// F19.5 (B4): reducir movimiento — se persiste y player.js lo consulta en
// el bucle de animación (FOV del sprint a 0).
reduceMotionToggle.addEventListener("change", () =>
	setSetting("reduceMotion", reduceMotionToggle.checked)
);
// F19.6 (B): material toon — swap en caliente sobre todas las mallas vivas.
toonToggle.addEventListener("change", () =>
	setSetting("toon", toonToggle.checked)
);
// F19.6 (A2): luz puntual real de antorchas (presupuestada).
torchLightToggle.addEventListener("change", () =>
	setSetting("torchLight", torchLightToggle.checked)
);
// F19.6 (E): mipmaps/anisotropía del atlas.
mipmapsToggle.addEventListener("change", () =>
	setSetting("mipmaps", mipmapsToggle.checked)
);

// Fase 17 (A5): entrar a un mundo (existente o nuevo) desde el menú — envía
// join_world { seed, name, gamemode, size }; el servidor carga/crea el mundo
// y responde con el init (onWorldLoaded lo espera para cerrar la carga). Con
// semilla vacía se genera una aleatoria (el servidor exige semilla no vacía).
// El puntero se bloquea en el gesto (patrón de siempre); en táctil no hay
// pointer lock: se oculta el bloqueador directamente.
function joinWorld(worldSeed, worldName, mode, size) {
	const seed = (worldSeed || "").trim() || randomSeed();
	const name = (worldName || "").trim();
	seedPending = seed;
	showLoading(`Generando el mundo «${seed}»...`);
	send("join_world", {
		seed,
		name: name || undefined,
		gamemode: mode || undefined,
		size: size || undefined
	});
	if (isTouchDevice()) {
		showBlocker(false);
	} else {
		controls.lock(); // el lock en el gesto es fiable; la carga cubre el cambio
	}
}

seedCreateBtn.addEventListener("click", () =>
	joinWorld(
		seedInput.value,
		worldNameInput.value,
		gamemodeSelect.value,
		sizeSelect ? sizeSelect.value : undefined
	)
);
seedInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") seedCreateBtn.click();
});
worldNameInput.addEventListener("keydown", (e) => {
	if (e.key === "Enter") seedCreateBtn.click();
});

// Semilla aleatoria (🎲): dos palabras + número — legible y con formato de
// semilla de Minecraft. Solo rellena el campo de semilla; el jugador crea
// el mundo con el botón "Crear mundo" (UX del usuario: el botón 🎲 no
// debe iniciar la partida, solo generar la semilla).
const RANDOM_WORDS = [
	"bosque",
	"montaña",
	"llanura",
	"desierto",
	"lago",
	"valle",
	"cumbre",
	"pradera",
	"río",
	"colina",
	"isla",
	"sabana"
];
function randomSeed() {
	const a = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
	const b = RANDOM_WORDS[Math.floor(Math.random() * RANDOM_WORDS.length)];
	const n = Math.floor(Math.random() * 9000) + 1000;
	return `${a}-${b}-${n}`;
}
randomSeedBtn.addEventListener("click", () => {
	seedInput.value = randomSeed();
});

// Botón pequeño de acción por mundo (Fase 17, A3): clonar, renombrar,
// cambiar modo y borrar. `onClick` no abre el mundo (stopPropagation).
function makeWorldActionBtn(icon, title, onClick) {
	const b = document.createElement("button");
	b.type = "button";
	b.className = "world-action";
	b.textContent = icon;
	b.title = title;
	b.addEventListener("click", (e) => {
		e.stopPropagation();
		onClick();
	});
	return b;
}

// Lista de mundos guardados (evento worlds_list del servidor, Fase 7).
// Fase 9 (Bloque B): badge de modo por mundo. Fase 17 (A3): gestión completa
// — reproducir (clic en el ítem), clonar (world_clone), renombrar
// (world_rename), cambiar modo (world_gamemode) y borrar (world_delete; el
// activo no se puede borrar — el servidor lo rechaza). Clonar/renombrar/camb
// mode son SOLO de operadores (el primer jugador conectado es op).
export function renderWorldsList(worlds) {
	worldsListEl.innerHTML = "";
	if (!worlds.length) {
		const empty = document.createElement("div");
		empty.className = "world-item empty";
		empty.innerHTML =
			"Todavía no hay mundos guardados.<br><small>Pulsa «✨ Crear nuevo mundo» para empezar.</small>";
		worldsListEl.appendChild(empty);
		return;
	}
	for (const w of worlds) {
		const item = document.createElement("div");
		item.className = "world-item";
		const mode = w.gamemode === "creative" ? "creative" : "survival";
		const meta =
			`${w.chunkCount} chunks` +
			(w.lastSaved ? ` · ${w.lastSaved.slice(0, 19).replace("T", " ")}` : "");
		const badge = `<span class="mode-badge ${mode}">${mode === "creative" ? "✦" : "⛏"} ${mode === "creative" ? "Creativo" : "Supervivencia"}</span>`;
		// Fase 10 (B1): badge de tamaño (256/512/1024 bloques por lado; los
		// mundos viejos sin el campo se ven como 8192 = "Infinito").
		const sizeName = {
			256: "Pequeño",
			512: "Medio",
			1024: "Grande",
			8192: "Infinito"
		};
		const sizeBadge = `<span class="mode-badge size">🗺 ${sizeName[w.worldSize] || `${w.worldSize}×${w.worldSize}`}</span>`;
		const left = document.createElement("span");
		left.className = "wi-left";
		left.innerHTML = `<span class="wi-name">${escapeHtml(w.name)}</span>${badge}${sizeBadge}<span class="wi-seed">semilla: ${escapeHtml(w.seed)}</span>`;
		const metaEl = document.createElement("span");
		metaEl.className = "wi-meta";
		metaEl.textContent = meta;
		const actions = document.createElement("span");
		actions.className = "world-actions";
		actions.append(
			makeWorldActionBtn(
				"📋",
				`Clonar «${w.name}» (copia a una semilla nueva)`,
				() => {
					const name = prompt(
						`Nombre del clon de «${w.name}»:`,
						`${w.name} (copia)`
					);
					if (name === null) return;
					send("world_clone", { seed: w.seed, name: name.trim() });
				}
			),
			makeWorldActionBtn("✏️", `Renombrar «${w.name}»`, () => {
				const name = prompt(`Nuevo nombre del mundo «${w.name}»:`, w.name);
				if (name === null || !name.trim()) return;
				send("world_rename", { seed: w.seed, name: name.trim() });
			}),
			makeWorldActionBtn(
				mode === "creative" ? "⛏" : "✦",
				mode === "creative"
					? `«${w.name}» es Creativo → cambiar a Supervivencia`
					: `«${w.name}» es Supervivencia → cambiar a Creativo`,
				() =>
					send("world_gamemode", {
						seed: w.seed,
						gamemode: mode === "creative" ? "survival" : "creative"
					})
			),
			makeWorldActionBtn(
				"🗑️",
				`Borrar «${w.name}» (no se puede deshacer)`,
				() => {
					if (w.active) {
						flashMessage(
							"🌍 No se puede borrar el mundo activo: entra a otro y vuelve."
						);
						return;
					}
					if (
						confirm(
							`¿Borrar el mundo «${w.name}» (semilla ${w.seed})? No se puede deshacer.`
						)
					) {
						send("world_delete", { seed: w.seed });
					}
				}
			)
		);
		item.append(left, metaEl, actions);
		item.title = `Abrir el mundo «${w.name}» (semilla: ${w.seed})`;
		item.addEventListener("click", () => joinWorld(w.seed, "", w.gamemode));
		worldsListEl.appendChild(item);
	}
}

// Resultado de un borrado de mundo (world_delete_result del servidor). El
// servidor ya reenvía la lista nueva (data.worlds) en el mismo evento.
export function onWorldDeleted(ok, reason) {
	if (ok) {
		flashMessage("🗑️ Mundo borrado.");
	} else if (reason === "active") {
		flashMessage(
			"🌍 No se puede borrar el mundo activo: entra a otro y vuelve."
		);
	} else if (reason === "invalid") {
		flashMessage("🌍 Semilla no válida: no se borró nada.");
	} else {
		flashMessage("🌍 No se pudo borrar el mundo (¿está en uso?).");
	}
}

function escapeHtml(s) {
	return String(s).replace(
		/[&<>"']/g,
		(c) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				c
			]
	);
}

// Fase 17 (D1): mostrar/ocultar el HUD táctil — evento a window que escucha
// input.js (así no hay ciclo de imports; ui.js e input.js se importan entre
// sí). En táctil se muestran al entrar al mundo y se ocultan en el menú.
function setTouchVisible(show) {
	window.dispatchEvent(
		new CustomEvent("mc-touch-visibility", { detail: !!show })
	);
}

// Llamado desde network.js en cada init: actualiza la semilla activa y cierra
// la pantalla de carga. Si se pidió una semilla, espera el init que la
// confirma antes de cerrar (evita destapar el mundo anterior durante el
// cambio).
export function onWorldLoaded(seed) {
	_currentSeed = seed;
	inMenu = false;
	setTouchVisible(true);
	showMenuBg(false); // bug del usuario: el fondo del menú tapa el mundo
	if (seedPending) {
		if (seed === seedPending) {
			seedPending = null;
			finishLoading();
		}
		return;
	}
	finishLoading();
}

// El servidor rechazó el cambio (otros jugadores en línea, mundo ilegible o
// fallo de guardado): volver al menú y avisar.
export function onSeedRejected(reason) {
	seedPending = null;
	inMenu = true;
	finishLoading(); // ocultar la carga (fade) antes de mostrar el menú
	showBlocker(true);
	showMenuBg(true);
	controls.unlock(); // el handler de unlock vuelve a mostrar el menú
	const msgs = {
		rechazo: "🌱 No se pudo abrir el mundo de esa semilla (formato más nuevo).",
		others:
			"🌱 Hay otros jugadores en línea: no se puede cambiar la semilla ahora.",
		error: "🌱 No se pudo guardar el mundo actual: cambio de semilla cancelado."
	};
	flashMessage(msgs[reason] || msgs.error);
}
