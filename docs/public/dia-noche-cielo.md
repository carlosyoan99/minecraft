# Cliente — Mecánica: día/noche y cielo

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/daynight.js`, `public/daymath.js`, `public/sky.js`,
> `public/skycolors.js`, `public/clouds.js`, `public/waterfog.js`.

## Cómo funciona actualmente

- El servidor manda `dayTime` (ms dentro del ciclo de 20 min) y `moonTime`
  (ciclo lunar de 8 días) en el init; `daynight.js` los **extrapola con
  `performance.now()`** para saber la fase en todo momento sin depender del
  tick del servidor.
- **Franjas MC (F18 C-1):** `daymath.js` define `DAY_PHASES` (día 10 /
  atardecer 1,5 / noche 7 / amanecer 1,5 sobre 20 min) y el `dayFactor` por
  fase — el cielo, la luz, la niebla y las estrellas interpolan con esos
  límites (antes el día/noche era binario). Cliente y servidor comparten
  las mismas franjas (`unit-dia` las fija).
- `updateDayNight` interpola colores de cielo (cenit/horizonte), luz
  ambiental, luz del sol y niebla por la fase.
- **Volumen al aire libre (F19.6 A1):** además del `AmbientLight` plano,
  `scene.js` añade un `HemisphereLight` (cielo arriba / suelo abajo) de
  intensidad conservadora, cuyo color sigue la fase vía `uDay`.
- **Niebla submarina (F10, refinada F16 B1):** `setUnderwater` (lo detecta
  `player.js` con la cámara sumergida) sobreescribe la niebla con azul denso
  y muy cercano. La activación es `shouldUnderwaterFog` (`waterfog.js`,
  lógica pura): solo con inmersión real de los ojos — cuerpo en el agua Y
  profundidad de ojos **≥ 2 bloques**. Con los ojos fuera o a 1 bloque no se
  muestra la niebla.
- **Nubes (F10):** `clouds.js` dibuja un campo de sprites procedurales
  (tinte por vértice día/noche) que se desplazan con el viento y siguen al
  jugador con offsets cíclicos.
- `sky.js` pinta un **dome procedural** (BackSide) con shader: degradado,
  banda cálida en atardecer, sol (disco + halo), luna con **fases** (máscara
  según `moonPhase`) y estrellas de noche (hash determinista por dirección).
  Sigue a la cámara y no le afecta la niebla.
- Solo visual: la lógica de juego (spawns nocturnos) la decide el servidor
  con el mismo reloj.

## Por qué así (decisión)

- **Extrapolación local** del reloj evita saltos visuales entre ticks y hace
  el ciclo fluido a cualquier FPS.
- **Dome + shader** en vez de textura de cielo: sin assets, con estrellas
  procedurales y fases lunares baratas (regla `shader-programming`: hacer en
  el shader lo que el CPU no necesita saber).
- **Determinismo del cielo:** las estrellas se derivan por hash de dirección
  (no `Math.random`), así todos los jugadores ven el mismo cielo.
- **Niebla solo con inmersión real** (≥2 bloques) porque la versión previa
  se activaba con el cuerpo en agua aunque los ojos quedaran fuera: el
  jugador nadando en superficie perdía la visión.

## Mejoras a futuro

1. **Clima** (Won't hasta desbloqueo): lluvia/nieve con partículas y sonido;
   el cielo ya tiene los hooks de fase.
2. **Estrellas con constelaciones por semilla** — el hash por dirección ya
   da estrellas deterministas; agruparlas en patrones es un refinamiento
   visual barato.
3. **Auroras en tundra** — variante del dome con banda de color; decorativo,
   coste bajo.
4. **Nubes volumétricas** — hoy son sprites planos; ray-marched clouds es
   caro para el perfil del clon (diferido).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `DAY_PHASES` | día 10 / atardecer 1,5 / noche 7 / amanecer 1,5 | Franjas MC (C-1) |
| `dayFactor` | fase → 0..1 | Interpolación de cielo/luz/niebla |
| `shouldUnderwaterFog` | ojos ≥ 2 bloques | Niebla submarina (pura) |
| `moonPhase` | 0..7 | Fases lunares (máscara del shader) |
| `uDay` | uniform | Fase en los shaders (hemi, agua) |
| `updateDayNight` / `updateClouds` | por frame | Ciclo visual |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Clima (desbloqueado) | Partículas de lluvia/nieve + sonido; estado en el servidor y broadcast |
| Auroras | Banda de color en el dome sobre tundra; solo visual |
| Nubes volumétricas | Calidad alta opcional; medir FPS antes de activar |
