# Servidor — Mecánica: bloques con gravedad y TNT

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/tnt.js`, `server/world.js` (`settleColumn`),
> `server/anticheat.js` (ventana del knockback).

## Cómo funciona actualmente

- **Arena y grava caen** (`GRAVITY_BLOCKS = {SAND, GRAVEL}`, Fase 10):
  `settleColumn` las mueve al `setBlock` si el bloque de debajo no es
  sólido, y también al generarse (la columna se asienta); el broadcast es
  `block_update`.
- **TNT** (Fase 10): `tnt.ignite` arma una mecha (`state.fuses`, ~1.6 s) con
  `tnt_fuse`; al explotar (`tnt_explode`) hace un cráter por radio con
  `NOT_MINEABLE` respetado (bedrock/agua/lava intactos), daño y puede
  encender TNT vecino (reacciones en cadena). El creeper también lo
  enciende. Los cofres con contenido no se rompen.
- **Knockback de TNT** (F20 B3, paridad MC): la explosión empuja
  **radialmente** desde el centro.
  - **Jugadores:** evento WS `knockback` (`{vx, vy, vz}`) que el cliente
    integra en su física local (`applyKnockback`, decaimiento ~0.5 s), con
    la **ventana de confianza** `kbUntil` (~600 ms) en `anticheat.js` que
    relaja límite por-move/parábola/velocidad para no corregir el empuje.
  - **Mobs (simulados en el servidor):** impulso `mob.kb` integrado en su
    tick (fricción 0.8, gravedad, `settleOnGround`; IA pausada mientras
    dura — aturdimiento estilo MC, 10 ticks).

## Por qué así (decisión)

- **El servidor decide la física de bloques:** la caída y la explosión mutan
  el mundo real (el persistido), no una predicción del cliente.
- **`NOT_MINEABLE` respetado** evita que la gravedad o la pólvora destruyan
  bedrock y contenedores con loot (griefing accidental).
- **El knockback con ventana de confianza** es el equilibrio entre paridad
  MC y anti-cheat: el empuje legítimo no se corrige, pero fuera de la
  ventana la velocidad sigue validada.

## Mejoras a futuro

1. **Grava con caída real (entidades de bloque)** — hoy la caída es
   instantánea al `setBlock`; MC suelta un bloque que cae con física. Coste
   alto (entidad nueva) para poco valor percibido — diferido.
2. **TNT con retardo y radio configurables** — la mecha es fija; un campo
   por entidad permitiría trampas variadas (pirámide B2 puede reusar la
   cadena tal cual).
3. **Daño de explosión por distancia con falloff** — hoy el daño es
   uniforme en el radio; MC lo atenúa con la distancia al centro.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `GRAVITY_BLOCKS` | `Set{SAND, GRAVEL}` | Bloques que caen al perder soporte |
| `NOT_MINEABLE` | `Set{bedrock, agua, lava, …}` | Bloques que la explosión no rompe |
| `state.fuses` | Map TNT → mecha | Mechas activas (~1.6 s) |
| `tnt.ignite(x,y,z)` | — | Enciende la mecha (`tnt_fuse`) |
| `tnt.explode(x,y,z,radio)` | — | Cráter + daño + reacción en cadena |
| `settleColumn(wx,wz)` | — | Asienta la columna de bloques con gravedad |
| `knockback {vx,vy,vz}` | evento WS | Empuje radial a jugadores (F20 B3) |
| `kbUntil` | ~600 ms | Ventana de confianza en el anti-cheat |
| `mob.kb` | vector | Impulso en mobs (fricción 0.8, aturdimiento 10 ticks) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Pirámide del desierto (F21 B2, P1) | Trampa que usa la cadena `explode()` existente; test F11 reusado |
| Daño por distancia | Atenuación MC del daño de explosión; recalibrar `unit-fase11` |
| Entidades de bloque cayendo | Grava/arena con física real; entidad nueva + protocolo |
