// ============================================================
// ENTRADA DEL CLIENTE: importa los módulos por responsabilidad.
// Cada módulo se inicializa solo al importarse (escena, socket,
// listeners de input, bucle de render y handler de red).
// ============================================================
import './loading.js'; // pantalla de carga: se muestra al arrancar
import './debug.js';   // visualizador de chunks (F3): bordes + caras
import './scene.js';
import './connection.js';
import './world.js';
import './mobs.js';
import './ui.js';
import './player.js';
import './input.js';
import './network.js';
