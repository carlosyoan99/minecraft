// ============================================================
// CONEXIÓN WEBSOCKET (socket + envío de mensajes)
// ============================================================
import { setProgress, setStatus, showConnectionError } from './loading.js';

const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
export const socket = new WebSocket(`${wsProtocol}://${location.host}`);

export function send(event, data = {}) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, data }));
}

socket.addEventListener('open', () => {
  console.log('Conectado al servidor');
  // La pantalla de carga ya está visible (import de loading.js); aquí solo
  // se actualiza el estado: el 100% lo pone network.js cuando llega el init.
  setProgress(18);
  setStatus('Conectado — generando el mundo...');
});
socket.addEventListener('close', () => {
  console.log('Desconectado del servidor');
  showConnectionError();
});
