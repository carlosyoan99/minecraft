# Cliente — Mecánica: input y raycast

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/input.js` (despachador), `public/game-input.js`,
> `public/raycast.js`, `public/menu-input.js`, `public/touch.js`.

## Cómo funciona actualmente

> Fase 18 (D-8): `input.js` es un **despachador** que importa los módulos y
> re-exporta `onBlockMined` (network.js). El input del juego vive en
> `game-input.js`, el rayo + telemetría en `raycast.js`, el menú/pausa en
> `menu-input.js` y los controles táctiles en `touch.js`.

- **Teclado:** WASD (movimiento), Espacio (salto/vuelo creativo), Shift
  (agacharse/bajar en vuelo), doble-tap W (sprint, F10), E (inventario; en
  creativo abre el **picker de bloques**), B (libro de recetas), F3
  (debug), 1-9 (hotbar), Enter (chat), Escape (cerrar paneles).
- **Ratón (pointer lock):** mirar, clic izquierdo = minar/atacar, clic
  derecho = colocar/comer/interactuar (cama, cofre, horno, semillas,
  tijeras sobre oveja, bonemeal), **clic medio = pick-block** del bloque
  apuntado en creativo (`creative_pick`, F10). La **sesión de minería**
  (mantener pulsado, re-minado al romper con el clic presionado F17 B7)
  vive en `game-input.js`.
- **Raycast de minado/combate:** `raycast.js` lanza el rayo desde la
  cámara, intersecta bloques y mobs (recursivo por partes), con tolerancia
  de apuntado a mobs (`nearestMobOnRay`) y el resaltado del bloque objetivo;
  envía `block_action` / `attack_mob` al servidor. Incluye telemetría de
  diagnóstico (`window.__mcMiningTrace`, `__mcDebugMining`) del flujo
  clic→mina (F9, Bloque A).
- **Paneles vs juego:** con un campo editable enfocado (`isTyping`) las
  teclas de juego se ignoran (fix B5: escribir el nombre no abría el
  inventario).
- **Táctil (F17 D1):** botones en pantalla que emiten mousedown sintético
  (movimiento, salto, minar/colocar); `touchActive` permite el flujo sin
  pointer lock.

## Por qué así (decisión)

- **El servidor decide el resultado:** el clic solo *pide*; el progreso de
  minado lo lleva `server/mining.js`. El raycast del cliente existe para
  saber QUÉ pedir, no para autorizar.
- **Telemetría de diagnóstico** en el flujo de minado: el bug crítico de la
  F9 ("clic no hace nada" → `mcChunks: 0` por un ReferenceError del atlas)
  se cazó exponiendo el flujo en `window.__mc*` y verificando con CDP.
- **Un solo raycast por pointermove** (F14 M1): antes había dos listeners
  con un raycast cada uno; ahora uno compartido alimenta resaltado y
  retargeteo de la mina.

## Mejoras a futuro

1. **Rebind de teclas** — hoy los atajos están fijos en `game-input.js`; un
  mapa de teclas en `mc_settings` (persistido) es la mejora más pedida.
2. **Sensibilidad por eje** — hoy una sola sensibilidad; MC permite X/Y
  separados.
3. **Táctil avanzado** — joystick analógico y doble-tap para sprint/salto
  (hoy botones discretos).
4. **Mantener el clic derecho** (colocación continua) — hoy colocar es un
  clic; MC coloca al mantener con delay inicial.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `move` (objeto) | forward/back/left/right/jump/sneak/sprint | Estado de teclas |
| `miningTarget` | {x,y,z} | Sesión de minado en curso |
| `nearestMobOnRay(ray, dist)` | — | Tolerancia de apuntado a mobs |
| `__mcMiningTrace` / `__mcDebugMining` | window | Telemetría de diagnóstico |
| `isTyping()` | — | Bloqueo de teclas de juego en inputs |
| `touchActive` | — | Flujo táctil sin pointer lock |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Rebind de teclas | Mapa de teclas en `mc_settings`; defaults intactos |
| Sensibilidad por eje | Dos sliders en Ajustes; aplica a `controls.mouseSensitivity` |
| Colocación continua | Delay inicial + repetición al mantener el clic derecho |
