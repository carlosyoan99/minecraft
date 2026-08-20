# Fase 29 — Modos de juego y calidad de vida (Spec)

> Documento creado a partir de: `docs/spec/fase29-spec.md` (borrador
> original), entrevista con el usuario (2026-08-20) y revisión del
> código actual.
> Fecha: 2026-08-20 · Proyecto: clon de Minecraft.
> Estado: **EN CURSO** (fase activa, primera del orden post-F25).

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A | Borrador F29 | Modo espectador (cámara libre, invisible para mobs) | `[ ]` | — |
| B | Borrador F29 | Modo aventura (restricción de rotura) | `[ ]` | — |
| C | Borrador F29 | Modo hardcore (muerte permanente → espectador) | `[ ]` | — |
| D | Borrador F29 | Mapa con exploración simplificada | `[ ]` | — |
| E | Borrador F29 | Brújula, reloj | `[ ]` | — |
| F | Borrador F29 | Libro y pluma (persistencia de texto) | `[ ]` | — |
| G | Borrador F29 | Sistema de marcadores | `[ ]` | — |
| H | Entrevista 2026-08-20 | Spectador = básico (sin vuelo libre, sin noclip) | — | Decisión |
| I | Entrevista 2026-08-20 | Hardcore = espectador al morir (no eliminar mundo) | — | Decisión |
| J | Entrevista 2026-08-20 | Mapa con exploración simplificada (no pixel-perfect) | — | Decisión |
| K | Entrevista 2026-08-20 | Branch por fase (`fase29-qol`) | — | Flujo |

## 1. Contexto

- Es la primera fase del post-F25 en el nuevo orden (F29→F26→F27→F28),
  elegida por su relación esfuerzo/beneficio: la mayoría son extensiones
  del sistema de `gamemode` que ya existe (creativo/supervivencia) o
  ítems con lógica simple.
- **No toca sistemas grandes** como combate, generación o inventario —
  es la fase de menor riesgo del grupo seleccionada.
- El modo espectador es el único ítem con riesgo técnico real (cámara
  sin colisión, invisibilidad ante IA de mobs); el resto son ajustes
  sobre gamemode o ítems nuevos de baja complejidad.
- Reutilizar donde se pueda: el sistema de `gamemode` ya tiene
  `creative` y `survival`; spectador y aventura son variantes nuevas
  del mismo mecanismo. La persistencia de texto del libro y pluma
  reutiliza el formato de `ItemStack` si F26 ya definió campos
  adicionales por ítem (encantamientos), o define un formato simple
  propio si F26 aún no existe.

## 2. Bloque A — Modo espectador

**Qué hacer exactamente:**

- Añadir `gamemode "spectator"` al sistema existente de `worldGamemode`
  y `player.gamemode` (en `server/constants.js` y `server/net.js`).
- **Cámara libre sin física:** el jugador en spectator ignora gravedad,
  colisión con bloques y colisión con mobs. No puede romper ni colocar
  bloques. No puede interactuar con cofres/hornos/mesas.
- **Invisible para IA de mobs:** en `server/mob-species.js`, cada mob
  que busca objetivo (`findNearestPlayer`, `isPlayerLookingAt`, etc.)
  excluye jugadores con `gamemode === "spectator"`.
- **Transición limpia:** al activar spectator, se guarda el `gamemode`
  previo. Al salir, se restaura. `/gamemode spectator` y
  `/gamemode survival` (o el previo) funcionan como toggle.
- **Cliente:** el spectator puede volar libremente (como creative pero
  sin poder colocar/romper). La hotbar se oculta. No recibe daño.

**Ficheros implicados:**
- `server/constants.js` — añadir `SPECTATOR` al Set de gamemodes
- `server/net.js` — manejar movimiento sin validación de sólidos para
  spectator (desactivar `anticheat` y `world.isSolidAt` para este modo)
- `server/mob-species.js` — excluir spectators de targeting
- `server/combat.js` — no aplicar daño a spectators
- `public/player.js` — permitir vuelo sin gravedad en spectator
- `public/game-input.js` — desactivar interacción con bloques/inventario
- `public/hud.js` — ocultar hotbar/barras en spectator

**Criterio de éxito:**
- Test: un jugador en spectator no puede romper bloques, no recibe daño,
  los mobs lo ignoran, puede volar libremente.

## 3. Bloque B — Modo aventura

**Qué hacer exactamente:**

- Añadir `gamemode "adventure"` al sistema existente.
- **Restricción central:** no se pueden romper bloques sin la
  herramienta adecuada (ya verificado en `canHarvest`). Además, en
  aventura **ninguna herramienta puede romper bloques** a menos que el
  bloque esté en una lista explícita de "rompible en aventura" (vacía
  por defecto, configurable por el servidor).
- **Colocación:** no se pueden colocar bloques en modo aventura.
- **Interacción:** sí se puede interactuar con cofres/hornos/puertas
  (clic derecho), pero no romper.
- **Cliente:** misma restricción que el servidor (predicción no rompe
  bloques que el servidor rechazaría).

**Ficheros implicados:**
- `server/constants.js` — añadir `ADVENTURE` al Set de gamemodes
- `server/net.js` — en `block_action` break, verificar gamemode !==
  "adventure" (o verificar lista de bloques permitidos)
- `public/game-input.js` — no iniciar mina si gamemode === "adventure"

**Criterio de éxito:**
- Test: un jugador en adventure no puede romper ningún bloque (con o
  sin herramienta), pero sí puede abrir cofres y puertas.

## 4. Bloque C — Modo hardcore

**Qué hacer exactamente:**

- Añadir flag `hardcore: true/false` en la creación del mundo (en
  `world.json` y en la pantalla de creación del menú).
- **Al morir en hardcore:** el servidor cambia automáticamente el
  `gamemode` del jugador a `"spectator"` y le envía un mensaje de
  "Game Over — modo hardcore". El mundo NO se elimina.
- **No revertible sin recrear:** `/gamemode survival` no funciona si el
  mundo es hardcore y el jugador ya murió. Solo se puede "reiniciar"
  recreando el mundo.
- **Confirmación al crear:** la pantalla de creación de mundos tiene
  un checkbox "Hardcore" con advertencia: "La muerte es permanente.
  No se puede desactivar."

**Ficheros implicados:**
- `server/constants.js` — añadir `HARDCORE` al Set de gamemodes (o
  como flag separado en world.json)
- `server/net.js` — al procesar `player_die`, verificar si el mundo
  es hardcore y forzar spectator
- `server/players.js` — en `respawnPlayer`, si mundo es hardcore →
  spectator en vez de respawn
- `public/menus.js` — checkbox de hardcore en creación de mundos
- `public/network.js` — recibir notificación de "game over hardcore"

**Criterio de éxito:**
- Test: al morir en mundo hardcore → spectator automático, no se puede
  volver a survival sin recrear el mundo.

## 5. Bloque D — Mapa con exploración simplificada

**Qué hacer exactamente:**

- **Ítem `MAP`** (nuevo B/I): al usarlo (clic derecho), muestra la
  posición del jugador y el punto de spawn en un panel simple.
- **Exploración simplificada:** el mapa "revela" terreno en un radio
  alrededor del jugador (no pixel-perfect como MC, sino una
  representación por celdas de 16×16 bloques con el color del bioma).
- **Persistencia:** el estado del mapa (qué celdas están reveladas)
  se guarda en el `ItemStack` como campo adicional (campo `mapData`
  retrocompatible, como los encantamientos de F26).
- **Crafting:** papel × 8 + brújula = mapa (como MC).

**Ficheros implicados:**
- `server/constants.js` — añadir `MAP` al objeto `I`
- `server/biomes.js` — reutilizar `getBiome` para el color de celda
- `public/map.js` — módulo nuevo para renderizar el panel del mapa
- `public/panels.js` — toggle del panel de mapa
- `public/game-input.js` — clic derecho con MAP abre el panel
- `recetas.json` — receta de mapa

**Criterio de éxito:**
- Test: al abrir un mapa, se muestra la posición del jugador y spawn;
  al caminar, se revelan nuevas celdas del mapa; el mapa persiste al
  guardarlo en el inventario.

## 6. Bloque E — Brújula y reloj

**Qué hacer exactamente:**

- **Ítem `COMPASS`** (nuevo B/I): al tenerlo en la mano, muestra una
  indicación visual en el HUD (flecha o texto) apuntando al spawn.
  Cliente calcula la dirección, servidor no necesita cambios.
- **Ítem `CLOCK`** (nuevo B/I): al tenerlo en la mano, muestra la
  hora actual del ciclo día/noche en el HUD. Reutiliza `worldTime`
  del servidor.
- **Crafting:** brújula = lingote de hierro × 4 + redstone;
  reloj = lingote de oro × 4 + redstone.
- **Ambos son orientativos** (no tienen utilidad mecánica, solo
  información visual).

**Ficheros implicados:**
- `server/constants.js` — añadir `COMPASS` y `CLOCK` al objeto `I`
- `public/hud.js` — mostrar indicación de brújula/reloj cuando el
  jugador tiene el ítem en la mano activa
- `recetas.json` — recetas de brújula y reloj

**Criterio de éxito:**
- Test: brújula apunta al spawn, reloj muestra la hora correcta;
  ambas recetas funcionan.

## 7. Bloque F — Libro y pluma

**Qué hacer exactamente:**

- **Ítem `BOOK_AND_QUILL`** (nuevo B/I): clic derecho abre un panel
  de texto editable (textarea HTML simple).
- **Persistencia de texto:** el contenido del libro se guarda como
  campo `pages` (array de strings) en el `ItemStack`. Formato
  retrocompatible: si no hay campo `pages`, se trata como libro vacío.
- **Sin signatura** (recorte: no hay "libro firmado" como en MC).
- **Crafting:** libro × 1 + pluma × 1 = libro y pluma (pluma nueva
  = stink + feather, o reutilizar un ítem existente).
- **Límite:** 50 páginas máximo, 256 caracteres por página.

**Ficheros implicados:**
- `server/constants.js` — añadir `BOOK_AND_QUILL` y `FEATHER` al
  objeto `I`
- `server/save-players.js` — persistir campo `pages` en ItemStack
  (retrocompatible)
- `public/panels.js` — panel de edición de texto
- `public/game-input.js` — clic derecho con BOOK_AND_QUILL abre panel
- `recetas.json` — receta de libro y pluma

**Criterio de éxito:**
- Test: escribir texto en un libro, guardarlo, recargar el servidor,
  el texto persiste. Límite de 50 páginas verificado.

## 8. Bloque G — Sistema de marcadores

**Qué hacer exactamente:**

- **Comando `/mark <nombre>`:** guarda la posición actual del jugador
  con un nombre (máximo 32 caracteres). Los marcadores se guardan por
  jugador en `world.json` (campo `markers` retrocompatible).
- **Comando `/marks`:** lista los marcadores del jugador con nombre
  y coordenadas.
- **Comando `/tpmark <nombre>`:** teletransporta al marcador (solo
  operadores o si el mundo lo permite).
- **En el mapa:** los marcadores aparecen como puntos en el panel del
  mapa (si el Bloque D está implementado).

**Ficheros implicados:**
- `server/commands.js` — comandos `/mark`, `/marks`, `/tpmark`
- `server/state.js` — campo `markers` por jugador
- `public/map.js` — renderizar marcadores en el panel del mapa

**Criterio de éxito:**
- Test: crear marcador, listar marcadores, teletransportar; marcadores
  persisten al reiniciar.

## 9. Bloque H — Tests y documentación

- [ ] Test de colisión/render del modo espectador (no recibe daño,
      los mobs lo ignoran, puede volar).
- [ ] Test de restricciones del modo aventura (no rompe bloques).
- [ ] Test de hardcore (transición a espectador al morir, no se puede
      revertir).
- [ ] Test de crafteo y funcionalidad de cada ítem nuevo (MAP, COMPASS,
      CLOCK, BOOK_AND_QUILL, FEATHER).
- [ ] Test de persistencia de texto en libro y pluma.
- [ ] Test de marcadores (crear, listar, teletransportar, persistir).
- [ ] Actualizar `docs/server/mecanicas.md`, `docs/public/mecanicas.md`,
      `TODO.md`, esta spec.

## 10. Fuera de alcance de esta fase

- Monturas (caballos u otros) — excluido explícitamente.
- Sistemas de puntuación/competición — va en Fase 28.
- Exploración progresiva de mapa pixel-perfect estilo MC real — se
  usa la versión simplificada (celdas de bioma).
- Libro firmado / librillo — recorte deliberado.
- Modo creativo mejorado (ya funciona desde Fase 9).
- Cualquier "Fuera de alcance" ya establecido del proyecto.

## 11. Cierre y auditoría de la fase (obligatoria)

- [ ] Suite completa de tests en verde (`node tests/run.js --unit`).
- [ ] `node --check` limpio en todos los archivos modificados.
- [ ] E2E de modos de juego (spectator, aventura, hardcore) con
      servidor propio.
- [ ] Auditoría de Fase 29: verificar que spectador no puede recibir
      daño, aventura no puede romper, hardcore fuerza spectator al
      morir. Verificar persistencia de libros y marcadores.
- [ ] Actualizar `docs/README.md`, `AGENTS.md`, `STATUS.md`,
      `TODO.md` y esta spec.

## 12. Criterios de aceptación (resumen)

1. Los 3 modos (espectador, aventura, hardcore) funcionan de punta a
   punta y no rompen supervivencia/creativo existente.
2. Los 5 ítems nuevos (MAP, COMPASS, CLOCK, BOOK_AND_QUILL, FEATHER)
   son craftables y funcionales.
3. Mapa con exploración simplificada, marcadores persistentes, libro
   con persistencia de texto.
4. Suite unitaria + E2E en verde, `biome check` 0 errores.
5. Auditoría de Fase 29 obligatoria antes de cerrar.

## 13. Flujo de trabajo

- **Branch:** `fase29-qol` (creada desde `main` al cerrar F25).
- **Merge a `main`:** solo al cerrar la fase (suite verde + auditoría).
- **Tags:** `v29.0` al cerrar.
