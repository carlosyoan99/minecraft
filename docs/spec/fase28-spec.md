# Fase 28 — Multijugador y comunidad (Spec)

> Documento creado a partir de: `docs/spec/fase28-spec.md` (borrador
> original), entrevista con el usuario (2026-08-20) y revisión del
> código actual.
> Fecha: 2026-08-20 · Proyecto: clon de Minecraft.
> Estado: **EN CURSO** (quinta fase del orden post-F25).
> Prerrequisito: Fase 25 (End) cerrada. Independiente de F26/F27.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A | Borrador F28 | Chat con canales (global/local/privado) | `[ ]` | — |
| B | Borrador F28 | Moderación (mute/kick/ban) | `[ ]` | — |
| C | Borrador F28 | Estadísticas persistentes por jugador | `[ ]` | — |
| D | Borrador F28 | Amigos/partidas (recortado a contraseña) | `[ ]` | — |
| E | Entrevista 2026-08-20 | 3 canales básico (global + local + /msg) | — | Decisión |
| F | Entrevista 2026-08-20 | Stats básicas (bloques rotos, kills, muertes) | — | Decisión |
| G | Entrevista 2026-08-20 | Branch por fase (`fase28-multi`) | — | Flujo |

## 1. Contexto

- El proyecto **no tiene cuentas ni autenticación** por decisión ya
  tomada (Won't) — todo lo de esta fase debe funcionar identificando
  jugadores por nombre, igual que el resto del proyecto.
- Reutilizar en vez de rehacer: el chat y los comandos de operador ya
  existen desde fases tempranas — esta fase los **extiende**, no los
  reemplaza.
- Las estadísticas necesitan persistencia por jugador — se guardan en
  el archivo de mundo actual (`world.json`) bajo un campo `stats` por
  jugador (retrocompatible: sin campo = sin stats).

## 2. Bloque A — Chat con canales

**Qué hacer exactamente:**

- **Canal global** (el actual, sin cambios de comportamiento): todos
  los jugadores conectados reciben el mensaje.
- **Canal local** (nuevo): solo jugadores dentro de un radio
  configurable (sugerido: 64 bloques, como MC). Comando: el chat
  normal sin prefijo sigue siendo global; para local, se usa `/local
  <mensaje>` o se cambia el canal activo con `/chat local`.
- **Mensajes privados** (nuevo): `/msg <jugador> <mensaje>` o
  `/tell <jugador> <mensaje>`. Solo el destinatario recibe el mensaje.
  Reutiliza el parser de comandos existente.
- **UI:** indicar visualmente a qué canal pertenece cada línea del
  chat (etiqueta `[Global]`, `[Local]`, `[Privado]` con colores
  distintos).

**Ficheros implicados:**
- `server/net.js` — handler de `chat` modificado para soportar canales
- `server/commands.js` — comandos `/msg`, `/tell`, `/chat`
- `public/network.js` — handler de `chat` con metadata de canal
- `public/hud.js` — chat con etiquetas de canal
- `public/game-input.js` — input de chat con selector de canal

**Criterio de éxito:**
- Test: mensaje local no llega fuera de radio, privado no llega a
  terceros, global llega a todos.

## 3. Bloque B — Moderación

**Qué hacer exactamente:**

- **Comandos de operador nuevos:**
  - `/mute <jugador>` — silencia al jugador (no puede enviar chat).
    El mute persiste durante la sesión (no al reconectar).
  - `/kick <jugador>` — desconecta al jugador con un mensaje.
  - `/ban <jugador>` — banea por nombre (el jugador baneado no puede
    reconectarse hasta que se desbanee o se reinicie el servidor).
    **Limitación aceptada:** sin cuentas, un baneado puede volver con
    otro nombre — documentado como limitación del modelo sin
    autenticación.
  - `/unban <jugador>` — remueve el ban.
- **Registro de acciones:** cada acción de moderación se registra en
  `server/log.js` con formato: `[mod] <operador> <acción> <objetivo>
  <timestamp>`.
- **Persistencia de bans:** se guardan en `world.json` como array
  `bannedPlayers` (retrocompatible: sin array = sin bans).

**Ficheros implicados:**
- `server/commands.js` — comandos `/mute`, `/kick`, `/ban`, `/unban`
- `server/net.js` — verificar mute antes de enviar chat, verificar ban
  al conectar
- `server/log.js` — logging de moderación
- `server/state.js` — campo `bannedPlayers` y `mutedPlayers`

**Criterio de éxito:**
- Test: mute impide enviar chat, kick desconecta, ban impide
  reconectar; unban remueve el ban. Acciones registradas en log.

## 4. Bloque C — Estadísticas persistentes

**Qué hacer exactamente:**

- **Contadores por jugador** (guardados en `world.json`):
  - `blocksBroken`: número total de bloques rotos.
  - `mobsKilled`: objeto `{ zombie: N, skeleton: N, ... }` con kills
    por tipo de mob.
  - `deaths`: número total de muertes.
  - `distanceWalked`: distancia total recorrida (en bloques, sumada
    cada tick).
- **Persistencia:** en `world.json` bajo `players[id].stats`. Campo
  retrocompatible: sin campo = stats en cero.
- **Actualización:** se incrementan en los puntos correspondientes
  del código:
  - `blocksBroken` → `players.js finishMining()`
  - `mobsKilled` → `mobs.js onDeath()` o `combat.js`
  - `deaths` → `players.js respawnPlayer()`
  - `distanceWalked` → `timers.js mainLoop()` (acumular distancia
    de movimiento del jugador cada tick).
- **Consulta:** comando `/stats` que muestra las stats del jugador.
 面板UI opcional (no incluido en esta fase, solo comando).

**Ficheros implicados:**
- `server/constants.js` — definición de las stats
- `server/players.js` — incrementar `blocksBroken`, `deaths`,
  `distanceWalked`
- `server/mobs.js` — incrementar `mobsKilled` al morir un mob
- `server/timers.js` — acumular `distanceWalked`
- `server/save-players.js` — persistir stats
- `server/commands.js` — comando `/stats`
- `public/network.js` — recibir stats al unirse

**Criterio de éxito:**
- Test: romper 5 bloques → `blocksBroken === 5`; matar 3 zombis →
  `mobsKilled.zombie === 3`; morir 2 veces → `deaths === 2`; stats
  persisten al reiniciar el servidor.

## 5. Bloque D — Contraseña opcional por mundo

**Qué hacer exactamente:**

- **Campo `password`** en `world.json` (retrocompatible: sin campo =
  sin contraseña).
- **Al crear un mundo:** campo opcional de contraseña en la pantalla
  de creación del menú.
- **Al unirse:** si el mundo tiene contraseña, el cliente muestra un
  prompt de contraseña antes de enviar `join_world`. El servidor
  valida antes de permitir la conexión.
- **Sin lista de amigos** (recorte deliberado): la contraseña es la
  única forma de controlar acceso. No hay sistema de invitaciones ni
  amigos persistentes (chocaría con la decisión de "sin
  autenticación").

**Ficheros implicados:**
- `server/save-meta.js` — guardar/cargar `password` en world.json
- `server/world-session.js` — validar contraseña en `join_world`
- `public/menus.js` — campo de contraseña al crear mundo y al unirse
- `public/connection.js` — enviar contraseña al unirse

**Criterio de éxito:**
- Test: crear mundo con contraseña, intentar unirse sin ella →
  rechazado; con ella → aceptado. Mundo sin contraseña → sin prompt.

## 6. Bloque E — Tests y documentación

- [ ] Test de canales de chat (local no llega fuera de radio, privado
      no llega a terceros).
- [ ] Test de comandos de moderación (mute/kick/ban/unban) con
      múltiples clientes simulados.
- [ ] Test de persistencia de estadísticas (sobreviven a reinicio del
      servidor).
- [ ] Test de contraseña (acceso denegado/permitido).
- [ ] Actualizar `docs/server/mecanicas.md`, `TODO.md`, esta spec.

## 7. Fuera de alcance de esta fase

- Autenticación real (cuentas, contraseñas de usuario) — sigue Won't.
- Servidor dedicado con múltiples mundos simultáneos — sigue Won't.
- Sistema de amigos persistente, invitaciones, rankings públicos —
  ver recortes del Bloque D.
- Chat con formato enriquecido (imágenes, enlaces) —超出 el alcance.
- Logros/medallas — se pueden agregar en una fase futura.
- Cualquier "Fuera de alcance" ya establecido del proyecto.

## 8. Cierre y auditoría de la fase (obligatoria)

- [ ] Suite completa de tests en verde.
- [ ] `node --check` limpio en todos los archivos modificados.
- [ ] E2E de multijugador (2+ jugadores, chat local, msg privado,
      moderación) con servidor propio.
- [ ] Auditoría de Fase 28: verificar que la moderación (mute/kick/ban)
      no puede saltarse desde el cliente — misma disciplina de
      "autorización verificada server-side" que ya se aplicó a los
      comandos de operador existentes. Verificar que las stats
      persisten correctamente.
- [ ] Actualizar `docs/README.md`, `AGENTS.md`, `STATUS.md`,
      `TODO.md` y esta spec.

## 9. Criterios de aceptación (resumen)

1. Chat con los 3 canales funcionando y probados con múltiples clientes.
2. Moderación funcional y registrada (logs de acciones de operador).
3. Estadísticas persistentes sobreviven a reinicio del servidor.
4. Contraseña opcional por mundo funciona de punta a punta.
5. Suite unitaria + E2E en verde, `biome check` 0 errores.
6. Auditoría de Fase 28 obligatoria (foco: seguridad de moderación).

## 10. Flujo de trabajo

- **Branch:** `fase28-multi` (creada desde `main` al cerrar F25).
- **Merge a `main`:** solo al cerrar la fase.
- **Tags:** `v28.0` al cerrar.
