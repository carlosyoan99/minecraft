# Servidor — Mecánica: comandos y reloj del mundo

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/commands.js`.

## Cómo funciona actualmente

- Chat con `/` → `executeCommand`: `/help`, `/tp x y z`, `/give`, `/time
  set`, `/gamemode`. El servidor es la fuente de verdad: cada comando muta
  el estado y sincroniza con eventos existentes (`teleport`,
  `inventory_update`, `time_set`, `chunks_add`).
- **`/give` con tope de stack (F16 SV-5):** los ítems apilables se entregan
  con tope 64 por stack (pedir `/give tronco 999` da 15 stacks de 64),
  paridad MC.
- **`/tp` sujeto a los bordes del mundo (F16 SV-6):** las coordenadas se
  **clampan** a `±(worldHalfExtent − 0.6)` en x/z y a
  `WORLD_MIN_Y..WORLD_MAX_Y` en Y — antes un `/tp 99999` sacaba al jugador
  fuera del mundo.
- **Reloj del mundo:** `worldTime(state) = (Date.now() + timeOffset) %
  DAY_CYCLE_MS`. El `timeOffset` (de `/time set` o dormir) **se persiste en
  `world.json`** (Fase 10): la hora continúa entre sesiones y los mundos
  nuevos arrancan al amanecer (`dawnOffsetMs`).
- **Franjas día/noche MC** (F18 C-1): `DAY_PHASES` en ambos `constants.js` —
  **día 10 / atardecer 1,5 / noche 7 / amanecer 1,5** sobre `DAY_CYCLE_MS`
  (20 min). `isNightTime` es la **noche estricta** (fase ≥ atardecer) →
  spawn hostil y dormir; `isDayTime` es el **día estricto** (sin
  crepúsculos) → quema solar. Dormir solo funciona de noche estricta
  (antes el umbral era binario 10/10). El cliente usa las mismas franjas en
  `public/daymath.js`.
- **Fases lunares** (`moonTime`): ciclo de 8 días de juego
  (`MOON_CYCLE_MS = DAY_CYCLE_MS * 8`) con **offset determinista por
  semilla** (`seedMoonOffsetMs`): mismo mundo → misma fase lunar para todos
  y entre reinicios.

## Por qué así (decisión)

- **Reloj = wall-clock + offset** (no contador de ticks): el día/noche sigue
  siendo coherente aunque el servidor esté ocupado, y `timeOffset` es la
  única mutación persistida.
- **Offset lunar por semilla** da variedad visual entre mundos sin romper el
  determinismo por mundo.
- **Franjas MC en vez de binario 10/10** porque el crepúsculo y el amanecer
  son mecánicas (quema solar, dormir, spawn) además de visuales: la noche
  estricta es más corta (7 min) y el día estricto también, con transiciones
  reales.

## Mejoras a futuro

1. **Comandos nuevos** (F21.5, plan): `/weather`, `/kill`, `/locate`,
   `/effect`, `/summon`, `/ban`, `/op`, `/list` + selectores `@p @a @e @s
   @r`.
2. **`/time set day/night` con mensajes de confirmación** — hoy los valores
   `day`/`noon`/`night`/`midnight` ya están mapeados; falta feedback en el
   chat del resultado.
3. **Clima** — requiere bloques de nieve/lluvia (Won't del proyecto hasta
   desbloqueo; las notas lo listan como fuera de alcance).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `DAY_CYCLE_MS` | `1200000` (20 min) | Ciclo día/noche |
| `DAY_PHASES` | día 10 / atardecer 1,5 / noche 7 / amanecer 1,5 | Franjas MC (C-1) |
| `MOON_CYCLE_MS` | `DAY_CYCLE_MS * 8` | Ciclo lunar |
| `seedMoonOffsetMs` | por semilla | Fase lunar determinista |
| `worldTime(state)` | `(Date.now() + timeOffset) % DAY_CYCLE_MS` | Reloj del mundo |
| `isNightTime` / `isDayTime` | franjas estrictas | Spawn, dormir, quema solar |
| `executeCommand(chat, p)` | — | Despacho de comandos |
| `/give` / `/tp` | con tope 64 / clamp a bordes | Comandos (SV-5/SV-6) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Comandos nuevos + selectores (F21.5) | `/weather /kill /locate /effect /summon /ban /op /list`; tests en `unit-commands` |
| Clima (desbloqueado) | Estados de nieve/lluvia, partículas, sonido; bloque nuevo sincronizado |
