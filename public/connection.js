// ============================================================
// CONEXIÓN WEBSOCKET (socket + envío de mensajes)
// ============================================================
const wsProtocol = location.protocol === 'https:' ? 'wss' : 'ws';
export const socket = new WebSocket(`${wsProtocol}://${location.host}`);

export function send(event, data = {}) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ event, data }));
}

socket.addEventListener('open', () => console.log('Conectado al servidor'));
socket.addEventListener('close', () => console.log('Desconectado del servidor'));
