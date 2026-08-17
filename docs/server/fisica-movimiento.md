# Servidor — Mecánica: física y movimiento

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/players.js` (clase `Player`), `server/combat.js`,
> `server/anticheat.js`.

## Cómo funciona actualmente

- **Gravedad y salto** (`GRAVITY = 18`, `JUMP_SPEED = 7`): el servidor
  integra la velocidad vertical del jugador en cada tick (20 Hz).
- **Validación anti-cheat** (`server/anticheat.js`, Fase 16 C3/SEC-1):
  - **Parábola del salto:** no se puede "subir" más rápido que la física
    (`vyObs > JUMP_SPEED·1.5`) ni **flotar** más de 1 s en el aire
    (`airTimeMs > 1000`, el *hover* con `dy ≥ −0.001`). El vuelo creativo
    es legítimo y se salta esta validación.
  - **Velocidad horizontal por ventana deslizante:** ráfagas de ~0.8
    bloques por move pasan el límite por-move pero son ~16 bloques/s
    sostenidos; la ventana (`speedSamples`, 1200 ms, intervalos ≥50 ms)
    mide bloques/s reales y **corrige con `teleport` si supera 7 bloques/s**
    (el sprint legítimo es ~5.6). Las muestras se resetean al `/tp` y al
    reaparecer.
  - El **daño de caída** se calcula por velocidad vertical inferida
    (`h = v²/(2·GRAVITY)`), no por "bloques caídos" declarados.
  - **Ventana de confianza del knockback** (`kbUntil`, ~600 ms, F20 B3):
    tras una explosión el empuje radial del TNT no se corrige con
    teleports (paridad MC).
- **Colisión con el mundo:** consulta bloques sólidos vía `world.getBlock`
  y resuelve el desplazamiento por ejes.
- **Agua y lava:** flotación en agua (no se hunde del todo) y daño de lava
  (`LAVA_DAMAGE`) por tick; el fuego (`burning`/`fireUntil`) se extingue en
  agua o al poco tiempo y se replica con `fire_state` (overlay de llamas).
- **Agacharse (Shift):** velocidad reducida (`SNEAK_SPEED`) y el servidor no
  avanza si el bloque bajo el siguiente paso no es sólido (protección de
  bordes, Fase 10).
- **Límites del mundo:** el `move` se valida contra los bordes del tamaño de
  mundo de la semilla; salir devuelve teleport.
- **POO (F13 C3):** los jugadores son instancias de `Player` (`createPlayer`);
  sus métodos de entidad (`damage`, `heal`, `eat`, `addXp`, ...) delegan en
  las fachadas históricas de `players.js`.

## Por qué así (decisión)

- **El servidor integra la física** aunque el cliente la simule para el
  render: el servidor decide la posición final. El cliente predice para no
  tener lag visual; al llegar el tick, si difiere, se corrige.
- **Paridad servidor↔cliente:** `public/constants.js` mantiene los mismos
  valores (`GRAVITY`, `JUMP_SPEED`) — lo audita `tests/unit-sync.js`. Si
  divergieran, el cliente predeciría una trayectoria que el servidor
  rechaza y el jugador "rebotaría".
- **Anti-cheat medido, no paranoico:** la ventana de velocidad admite
  ráfagas de lag (0.8 bloques/move) pero corta el sostenido (>7 bloques/s)
  — un jugador con lag no se cae, un fly-hack sí.

## Mejoras a futuro

1. **Predicción de entidades (mobs) en el cliente** — hoy los mobs llegan a
   20 Hz y se interpolan; una extrapolación local como la del jugador haría
   el movimiento más suave en red con lag (coste: complejidad de reconciliación).
2. **Sprint por doble-tap con cooldown visual** — hoy el doble-tap W es
   inmediato; MC espera ~0.3 s y muestra un icono de sprint en el HUD.
3. **Nado y buceo** — hoy solo flotación; el nado (cabeza abajo, velocidad
   en agua) es una mecánica MC pendiente (F21.5 C tiene combate, no natación).
4. **Knockback de armas cuerpo a cuerpo** — el golpe de espada no empuja al
   mob (solo el TNT lo hace); el `mob.kb` ya está integrado en el tick, solo
   falta emitirlo desde `attack_mob`.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `GRAVITY` | `18` bloques/s² | Gravedad (paridad con `public/player.js`) |
| `JUMP_SPEED` | `7` bloques/s | Velocidad vertical inicial del salto |
| `SNEAK_SPEED` | ~30 % | Velocidad agachado + protección de bordes |
| `SPRINT_SPEED` | ~1.3× | Sprint (doble-tap W) |
| `LAVA_DAMAGE` | — | Daño por tick en contacto con lava |
| `EYE_HEIGHT` | — | Altura de ojos (paridad de colisión) |
| `move(dx,dy,dz,onGround)` | evento WS | El cliente pide movimiento; el servidor valida |
| `validateMove` / `rejectMove` | — | Anti-cheat: coords, void, bordes, parábola, hover, velocidad |
| `kbUntil` | ~600 ms | Ventana de confianza del knockback (F20 B3) |
| `Player.tickPlayer` | — | Integración de física, hambre, lava, caídas por tick |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Knockback cuerpo a cuerpo | `attack_mob` emite `knockback` al mob golpeado; `mob.kb` ya lo integra; test en `unit-fase21`/`unit-mobs-ia` |
| Nado/buceo | Velocidad y control en agua, burbujas de aire, sin cambios de protocolo (el `move` ya lleva los 3 ejes) |
| Extrapolación de mobs | Interpolación suave entre `mobs_update` con `performance.now()` (patrón `daynight.js`) |
