# Fase 27.5 — Sistema de mobs por zona activa (Spec)

> Documento creado a partir de: `docs/spec/fase27.5-spec.md` (borrador
> original), entrevista con el usuario (2026-08-20) y
> `docs/audits/auditoría-2026-08-18.md`.
> Fecha: 2026-08-20 · Proyecto: clon de Minecraft.
> Estado: **EN CURSO** (cuarta fase del orden post-F25).
> Prerrequisito: Fase 27 cerrada. Independiente de F26/F26.5/F28.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Hallazgo | Verificado en | Gravedad |
|---|--------|----------|---------------|----------|
| A | Conversación de diseño | Todo mob vivo ejecuta IA completa cada tick (20 Hz), sin importar distancia | `server/timers.js: mainLoop()` | ⚠️ Rendimiento |
| B | Conversación de diseño | Tope global fijo de 30 mobs para todo el mundo, sin distinción por zona | `server/mob-spawn.js: spawnMobs()` | ⚠️ Limitación |
| C | Auditoría de borrador | `spawnMobs()` usa `players.values().next().value` — un solo jugador arbitrario | `server/mob-spawn.js` ~104-114 | 🔴 Bug |
| D | Auditoría 2026-08-18 §2.3 | Pulpo/calamar listado como viable en F21 pero no implementado | `server/`, `public/`, `tests/` sin match | ⚠️ Contenido faltante |
| E | Entrevista 2026-08-20 | Incluir pulpo en F27.5 Bloque E | — | Decisión |

## 1. Contexto

- Esta fase es **puramente de mobs** — no toca altura de mundo, tamaño
  de mundo, multijugador social ni ningún otro sistema. Es
  intencionalmente angosta para poder cerrarla rápido y sin arrastrar
  el resto de la F27.
- El hallazgo C es el más urgente: es un bug de distribución que ya
  afecta a cualquier partida con más de un jugador conectado hoy mismo.
- Reutilizar lo que ya existe:
  - `findNearestPlayer()` ya calcula distancia por mob cada tick — el
    Bloque A reordena esa llamada, no la duplica.
  - `DESPAWN_DIST` y la exención de mascotas (`ownerId`) ya existen
    y se mantienen.
  - El nuevo estado "dormido" se añade entre "activo" y "despawneado",
    no los reemplaza.

## 2. Bloque A — Tres estados: activo / dormido / despawneado

**Qué hacer exactamente:**

- **Definir `MOB_ACTIVE_RANGE`:** radio corto (sugerido: 32 bloques,
  o una fracción del `renderDistance` del jugador más cercano para que
  escale con lo que cada jugador ve).
- **En `mainLoop()`** (antes del tick de cada mob): calcular distancia
  al jugador más cercano (reusar `findNearestPlayer()`), decidir
  estado:
  - **Activo** (distancia ≤ `MOB_ACTIVE_RANGE`): ejecuta tick completo.
  - **Dormido** (distancia > `MOB_ACTIVE_RANGE` y ≤ `DESPAWN_DIST`):
    NO ejecuta tick de IA (sin movimiento, sin detección, sin ataque).
    Se mantiene en `state.mobs` pero es "congelado".
  - **Despawneado** (distancia > `DESPAWN_DIST`): se elimina de
    `state.mobs` (comportamiento actual).
- **Transición dormido → activo:** inmediata al entrar un jugador en
  rango, sin recalcular nada retroactivo — el mob continúa desde su
  posición congelada.
- **Excepción:** proyectiles en vuelo (flecha de esqueleto, tridente)
  NUNCA pasan por el estado dormido — se resuelven siempre hasta
  impactar o expirar.
- **Persistencia:** un mob dormido se guarda igual que uno activo si el
  mundo se guarda mientras está dormido (sin cambio de formato).

**Ficheros implicados:**
- `server/constants.js` — `MOB_ACTIVE_RANGE` (nueva constante)
- `server/timers.js` — en `mainLoop()`, calcular estado antes del tick
- `server/mobs.js` — en `tick()` del mob, verificar estado antes de
  ejecutar IA completa
- `server/mob-species.js` — cada `tickSpecies()` verifica estado

**Criterio de éxito:**
- Test: mob a 50 bloques de todo jugador → dormido (no ejecuta IA).
  Mob a 20 bloques → activo. Transición inmediata al acercarse.

## 3. Bloque B — Spawn distribuido entre todos los jugadores

**Qué hacer exactamente:**

- **Corregir `spawnMobs()`:** en vez de
  `players.values().next().value`, distribuir los intentos de spawn
  entre TODOS los jugadores conectados.
- **Estrategia:** round-robin por tick (cada tick intenta spawnear
  cerca de un jugador diferente) o ponderado por cuántos mobs activos
  tiene ya cerca cada uno (priorizar al que tenga menos).
- **Cada jugador** obtiene su propia oportunidad de spawn cercano.

**Ficheros implicados:**
- `server/mob-spawn.js` — reescribir `spawnMobs()` para iterar sobre
  todos los jugadores

**Criterio de éxito:**
- Test: con 2+ jugadores simulados en zonas alejadas, confirmar que
  ambos reciben spawns nuevos con el tiempo, no solo uno.

## 4. Bloque C — Cupo de mobs: de global a dos niveles

**Qué hacer exactamente:**

- **Separar conceptos:**
  - Mobs **activos** por jugador/zona (lo que cuesta CPU): sugerido
    15-20. Esto reemplaza el propósito real que cumplía el 30 actual.
  - Mobs **totales** en el mundo (activos + dormidos, lo que cuesta
    memoria/guardado): sugerido 150-200. Solo para evitar crecimiento
    sin límite.
- **Ajustar `spawnMobs()`:** verificar ambos topes antes de crear un
  mob nuevo. El tope activo se cuenta por jugador; el total por mundo.
- **Confirmar con pruebas** que el tope total elegido no infla el
  archivo de guardado de forma notable.

**Ficheros implicados:**
- `server/constants.js` — `MOB_ACTIVE_CAP`, `MOB_TOTAL_CAP`
- `server/mob-spawn.js` — verificar ambos topes

**Criterio de éxito:**
- Test: spawn distribuido respeta ambos topes; con 20+ mobs activos
  cerca de un jugador, no se crean más; con 200 totales, no se crean
  más.

## 5. Bloque D — Mascotas: decisión explícita

**Qué hacer exactamente:**

- **Decidir:** las mascotas con `ownerId` quedan exentas del estado
  dormido (como ya lo están del despawn), o se congelan igual y solo
  se despiertan cuando el dueño se acerca.
- **Si se elige fidelidad a MC:** implementar teletransporte de la
  mascota cerca del dueño cuando la distancia supera un umbral (32
  bloques), en vez de dejarla dormida indefinidamente lejos.
- **Decisión documentada** en esta spec antes de implementar.

**Criterio de éxito:**
- Test: mascota con dueño a 50 bloques → comportamiento decidido
  (exenta o teletransportada). Regresión: mascota sigue funcionando
  correctamente en combate.

## 6. Bloque E — Confirmar contenido de mob pendiente (pulpo)

**Qué hacer exactamente:**

- **Confirmar** si el pulpo/calamar (hallazgo D) se descartó a
  propósito en la F21 o sigue pendiente. La auditoría 2026-08-18 §2.3
  verificó que no hay implementación en `server/`, `public/` ni
  `tests/`.
- **Si sigue pendiente:** implementarlo aquí como mob pasivo acuático.
  - `SQUID` (nuevo type en `MOB_CLASSES`): 16 HP, XP 1-3.
  - Spawn en océanos (biomas `ocean`, `warm_ocean`, `deep_ocean`).
  - Al morir: suelta 1-3 tinta (`INK_SAC`, nuevo I).
  - IA pasiva: nada libremente en agua, huye del daño.
  - Textura: `MOB_PARTS` + `mobtextures.js`.
- **Si se descartó:** documentarlo explícitamente y cerrar el bloque.

**Ficheros implicados:**
- `server/mob-species.js` — clase `Squid` con IA pasiva acuática
- `server/mob-spawn.js` — spawn en biomas de océano
- `server/constants.js` — `I.INK_SAC`, `MOB_COLORS.SQUID`
- `server/mobs.js` — `MOB_HEALTH.SQUID`, `MOB_XP.SQUID`
- `public/mobtextures.js` — `MOB_PARTS.SQUID`, `drawSquid`
- `public/mobs.js` — renderizar squid

**Criterio de éxito:**
- Test: squid spawn en océanos, se mueve en agua, suelta tinta al
  morir. `unit-sync` en verde.

## 7. Bloque F — Verificar persecución/pathfinding

**Qué hacer exactamente:**

- **Confirmar** contra el código actual si la persecución de hostiles
  todavía se atasca contra el terreno en algunos casos (ítem de specs
  tempranas).
- **Si ya se resolvió:** cerrar este bloque sin cambios y
  documentarlo.
- **Si sigue abierto:** corregir aquí (puede ser un problema de
  `tickZombie`/`tickSkeleton` usando movimiento directo sin
  verificación de pasabilidad).

**Criterio de éxito:**
- Verificación manual o test de que un zombi persigue al jugador sin
  atascarse en escalones/bordes de bloque.

## 8. Bloque G — Telemetría de mobs (opcional, bajo costo)

**Qué hacer exactamente:**

- **Contador en F3** (modo debug): mostrar `Activos: N | Dormidos: M
  | Total: T` en el overlay de debug del cliente.
- Útil para confirmar que el sistema de tres estados funciona como se
  espera sin tener que inferirlo indirectamente.

**Ficheros implicados:**
- `server/timers.js` — calcular contadores por tick
- `public/debug.js` — mostrar contadores en F3

**Criterio de éxito:**
- Verificación en navegador: F3 muestra contadores actualizados.

## 9. Bloque H — Tests y documentación

- [ ] Test de transición de estado (activo→dormido→activo) por
      distancia.
- [ ] Test de que un mob dormido no ejecuta su `tick()` completo
      (medible con un contador de llamadas).
- [ ] Test de spawn distribuido (Bloque B) con múltiples jugadores.
- [ ] Test de los dos topes del Bloque C por separado.
- [ ] Test de pulpo (Bloque E): spawn, movimiento acuático, drop de
      tinta.
- [ ] Actualizar `docs/server/mecanicas.md`, `TODO.md`, esta spec.

## 10. Fuera de alcance de esta fase

- Altura y tamaño de mundo — siguen en Fase 27.
- Multijugador social (chat, moderación, estadísticas) — Fase 28.
- Cualquier mob nuevo que no sea el pulpo del Bloque E.
- Optimización de rendering de mobs ( InstancedMesh, LOD de mobs) —
  se evalúa en una fase de rendimiento futura.

## 11. Cierre y auditoría de la fase (obligatoria)

- [ ] Suite completa de tests en verde.
- [ ] `node --check` limpio en todos los archivos modificados.
- [ ] E2E de mobs con múltiples jugadores (verificar spawn
      distribuido y estados de dormido/activo).
- [ ] Auditoría de Fase 27.5: **foco en rendimiento real** (comparar
      coste de tick antes/después con el mismo número de mobs totales,
      para confirmar que el ahorro de CPU es medible y no solo teórico).
- [ ] Actualizar `docs/README.md`, `AGENTS.md`, `STATUS.md`,
      `TODO.md` y esta spec.

## 12. Criterios de aceptación (resumen)

1. Mobs dormidos confirmadamente no consumen CPU de IA (medido, no
   asumido).
2. Spawn distribuido probado con 2+ jugadores en zonas separadas.
3. Los dos topes del Bloque C calibrados con datos reales.
4. Pulpo implementado y verificado (o descartado explícitamente).
5. Suite unitaria + E2E en verde, `biome check` 0 errores.
6. Auditoría de Fase 27.5 obligatoria (foco: rendimiento real).

## 13. Flujo de trabajo

- **Branch:** `fase27.5-mobs` (creada desde `main` al cerrar F27).
- **Merge a `main`:** solo al cerrar la fase.
- **Tags:** `v27.5.0` al cerrar.
