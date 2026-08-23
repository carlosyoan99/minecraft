// @ts-check
// ============================================================
// TIPOS COMPARTIDOS SERVIDOR-CLIENTE (Fase 22.2, Bloque C)
// Definiciones @typedef para las formas que hoy solo existen "de
// palabra": stack de inventario, mensajes WS y constantes B/I.
//
// Estos tipos NO se importan en runtime (JSDoc es solo anotación);
// se referencia vía @type {import('./types.js').Stack} desde cualquier
// archivo con // @ts-check.
// ============================================================

/**
 * Stack de inventario — slot de inventario, cofre o drop.
 * Coincide con el formato JSON del wire (id, count) y con
 * ItemStack de server/items.js (que añade durability).
 * @typedef {{ id: number, count: number }} Stack
 */

/**
 * Mensaje WebSocket enviado desde el cliente al servidor.
 * @typedef {{ event: string, data: object }} ClientMessage
 */

/**
 * Mensaje WebSocket enviado desde el servidor al cliente.
 * @typedef {{ event: string, data: object }} ServerMessage
 */

/**
 * Bloque del mundo — ID numérica del bloque (B.* en constants.js).
 * @typedef {number} BlockId
 */

/**
 * Ítem — ID numérica del ítem (I.* en constants.js).
 * Puede ser un ítem standalone o la representación de un bloque.
 * @typedef {number} ItemId
 */
