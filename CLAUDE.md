# CLAUDE.md — Guía para la IA que trabaje en este proyecto

Este archivo son instrucciones para cualquier asistente de IA
(Claude Code u otro) que edite este repositorio. Léelo antes de
tocar código.

## Filosofía del proyecto

- **JavaScript vanilla, dependencias mínimas.** No añadir un
  framework (React, Vue, etc.) ni una librería nueva sin que sea
  claramente necesaria y esté justificada. Antes de instalar algo,
  preguntar: ¿esto se puede resolver en 20 líneas de JS plano?
- **Sin build step en el cliente.** El cliente se sirve tal cual
  desde `public/`, cargado vía `<script type="module">` e
  importmap. No introducir Webpack/Vite/bundlers salvo que se
  discuta explícitamente antes.
- **Arquitectura modular.** El cliente debe dividirse en módulos
  ES6 por responsabilidad (red, mundo/chunks, jugador/física,
  mobs, UI/HUD) en vez de crecer como un único archivo. Si
  `client.js` supera ~400-500 líneas, es señal de dividirlo.
- **El servidor es la única fuente de verdad.** Nunca mover lógica
  de validación, física o inventario al cliente "por comodidad".
  El cliente predice y dibuja; el servidor decide y corrige.
- **Integridad de datos por encima de todo.** Cualquier cambio al
  formato de guardado (`world/world.dat` o lo que lo reemplace)
  debe ser retrocompatible o incluir migración explícita. Nunca
  silenciar un error de lectura/escritura de mundo sin loggearlo.

## Cómo trabajar en este repo

1. **Antes de escribir código**, ubica la fase actual en
   `TODO.md` y confirma qué tarea se está atacando. No adelantes
   trabajo de fases futuras sin que se pida explícitamente.
2. **Cambios pequeños y verificables.** Preferir PRs/commits que
   toquen una sola preocupación (ej. "guardado incremental por
   chunk") sobre cambios masivos que mezclen varias fases.
3. **Prueba antes de entregar.** Como mínimo: `node --check` sobre
   archivos `.js` tocados, arrancar el servidor y confirmar que
   sirve `/` y `/client.js` sin errores, y si el cambio toca mundo
   o inventario, un ciclo manual de guardar/cargar.
4. **Nunca rompas lo que ya funciona.** Antes de refactorizar algo
   central (formato de chunk, protocolo WebSocket, formato de
   inventario), revisa qué otras partes del código dependen de
   ello — cliente y servidor deben mantenerse sincronizados en el
   mismo cambio, nunca en commits separados.
5. **Auditoría al cerrar cada fase.** Cada fase de `TODO.md`
   termina con una tarea de auditoría. No se marca la fase como
   completa sin haberla hecho: revisar rendimiento (chunks
   cargados, memory leaks en cliente), integridad del guardado
   tras varios reinicios, y limpieza de código muerto o duplicado
   introducido durante la fase.

## Convenciones de código

- CommonJS en el servidor (`require`), ES modules en el cliente
  (`import`) — así está hoy, no mezclar estilos dentro del mismo
  entorno.
- Constantes de bloques/ítems (`B`, `I` en `server.js`;
  `BLOCK_COLORS`, `BLOCK_NAMES`, `ITEM_NAMES` en `client.js`) son
  la fuente de verdad de IDs. Si se añade un bloque o ítem nuevo,
  actualizar ambos lados y mantener los IDs sincronizados
  manualmente (no hay un archivo compartido todavía — considerar
  extraer uno si la lista crece mucho).
- Nombres de eventos WebSocket en `snake_case` (`block_action`,
  `furnace_state`, etc.), consistente con lo ya existente.
- Comentarios y nombres de variables en español, igual que el
  resto del proyecto — mantener el idioma consistente.

## Qué NO hacer sin preguntar

- No añadir persistencia en base de datos (SQLite, Mongo, etc.) —
  el plan es resolver la escalabilidad del guardado con archivos
  por chunk, no cambiar de paradigma de storage.
- No añadir autenticación de usuarios ni cuentas — fuera de
  alcance del proyecto.
- No implementar redstone, dimensiones alternas, aldeas generadas
  ni clima — están explícitamente fuera de alcance (ver "Won't" en
  la conversación de planificación / `TODO.md`).
- No optimizar prematuramente (greedy meshing, workers, etc.)
  antes de que el `TODO.md` lo indique — cada fase tiene su
  momento para eso.
