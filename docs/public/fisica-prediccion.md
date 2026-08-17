# Cliente — Mecánica: física local y predicción

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/player.js`.

## Cómo funciona actualmente

- El cliente simula gravedad/salto con las **mismas constantes** que el
  servidor (`GRAVITY`, `JUMP_SPEED`, `EYE_HEIGHT`) para que la predicción
  coincida con la validación.
- **Colisión local:** el cliente comprueba bloques sólidos alrededor del
  jugador para no atravesar el mundo entre ticks (el servidor lo revalida).
- **Sprint (F10):** doble-tap W → `SPRINT_SPEED` (5.6 bloques/s, ~1.3×) y el
  FOV se abre `SPRINT_FOV` (10°) mientras se corre (solo en suelo, sin
  nadar ni volar).
- **Agacharse (F10):** Shift → `SNEAK_SPEED` (1.3 bloques/s) y el `tryMove`
  no avanza si el bloque bajo el siguiente paso no es sólido (protección de
  bordes, no caerse).
- **Vuelo creativo** (`creative_fly`, doble Espacio): sube/baja con
  Shift/Espacio; el servidor lo permite solo en gamemode creativo.
- **Knockback de TNT (F20 B3):** el servidor manda el evento `knockback`
  (`{vx, vy, vz}`, empuje radial) y el cliente lo integra en su física
  local (`applyKnockback`, decaimiento lineal ~0.5 s; vertical empuja
  `velocityY` contra la gravedad). El servidor abre la ventana `kbUntil`
  (~600 ms) en el anti-cheat para no corregir el empuje.
- Envía `move` al servidor en cada cambio; el servidor responde la posición
  validada (la autoritativa).

## Por qué así (decisión)

- **Predicción local** (y no esperar el tick del servidor) elimina el lag
  percibido en la red local: el render se mueve al instante y el servidor
  corrige si hay discrepancia. Es el patrón clásico de client-side
  prediction para juegos de red.
- **Paridad de constantes** auditable: `tests/unit-sync.js` compara
  servidor↔cliente y rompe si divergen.

## Mejoras a futuro

1. **Reconciliación suave** — hoy la corrección del servidor es un
  teleport; interpolarla en 2-3 frames evitaría el "salto" visual (el
  `teleport` del cliente ya existe, solo falta suavizar).
2. **Nado/buceo** — mismo trabajo que en el servidor (ver
  `../server/fisica-movimiento.md`): velocidad en agua y control de
  profundidad.
3. **Head-bob opcional** — al caminar/correr; toggle de accesibilidad
  (reducir movimiento ya atenúa el FOV del sprint).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `GRAVITY` / `JUMP_SPEED` / `EYE_HEIGHT` | 18 / 7 / 1.6 | Paridad con el servidor |
| `SPRINT_SPEED` | `5.6` bloques/s | Correr (doble-tap W) |
| `SPRINT_FOV` | `10` grados | FOV extra al correr |
| `SNEAK_SPEED` | `1.3` bloques/s | Agachado + protección de bordes |
| `applyKnockback(vx,vy,vz)` | ~0.5 s de decaimiento | Integra el empuje del TNT |
| `move(dx,dy,dz,onGround)` | envío por cambio | Petición de movimiento |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Corrección suavizada | Interpolación del teleport en 2-3 frames; sin "saltos" |
| Nado/buceo | Control en agua con las mismas constantes; `unit-sync` ampliado |
| Head-bob | Oscilación sutil al caminar; toggle de accesibilidad |
