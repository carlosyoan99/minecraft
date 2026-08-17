# Servidor — Mecánica: seguridad y robustez

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/net.js`, `server/actions.js`, `server/anticheat.js`,
> `server/ratelimit.js`, `server/save-meta.js`.

## Cómo funciona actualmente

- **Sanitización de entrada:** nombres, semillas, nombres de mundo y
  mensajes se sanean y acotan (regex de control, límites de longitud).
- **Coordenadas validadas en todos los handlers** (F16 C2/SV-3/SEC-3):
  `validCoords(x, y, z)` exige `Number.isFinite` antes de cualquier uso en
  `block_action`, `till`, `plant`, `bonemeal`, `bucket_use`, `door_use`,
  `furnace_open`, `chest_open` y `move`; el mensaje se **descarta sin mutar
  estado ni inventario** (antes un `NaN`/string podía crear chunks
  `"NaN,NaN"` o consumir ítems sin colocar nada).
- **Anti-cheat de movimiento** (`anticheat.js`): coords, void, bordes del
  mundo, sólidos (no atravesar paredes), parábola del salto/hover y ventana
  de velocidad — ver [`fisica-movimiento.md`](./fisica-movimiento.md).
- **Rate-limit por procesamiento** (`server/ratelimit.js`, F20 D2): la
  cuota se mide por **tiempo de llegada de dos ventanas consecutivas**, no
  por tiempo de procesamiento — la ráfaga post-bloqueo ya no cierra el
  socket con 1008 (causa real del bug B2 de la F19.6, ver `docs/v20.2.md`).
- **Cuota anti-spam en `set_seed`** (F16 C4/SEC-2): un cambio de semilla
  cada **10 s por jugador** (`seedCooldownUntil`); sin cuota un cliente
  podía martillear `switchWorld` (que persiste a disco) y saturar el disco.
  El rechazo avisa con `seed_rejected {reason:'cooldown'}`.
- **Hornos huérfanos** (F16 C5/REN-2): al **romper un horno** se borra su
  entrada de `state.furnaces` (y de `world.json`) — antes quedaba huérfana:
  fuga de memoria + el meta engordando en cada guardado.
- **Path traversal bloqueado:** `deleteWorld`/`savePlayer` validan que la
  semilla/nombre resuelva a un directorio bajo `world/` (test de
  path-traversal en `unit-fase9.js`).
- **`WS_MAX_PAYLOAD`:** límite de tamaño de mensajes WebSocket entrantes
  (anti-DoS).
- **Validación de recetas al cargar** y **escritura atómica** de chunks (ver
  [`crafteo-hornos.md`](./crafteo-hornos.md) y
  [`persistencia.md`](./persistencia.md)).
- **`SCHEMA_VERSION` + migraciones:** mundos de versiones anteriores se
  migran (incluida la v5→v6); un mundo de una versión más nueva se rechaza
  con mensaje claro (no se pisa).

## Por qué así (decisión)

- **El servidor es la única frontera de confianza:** todo lo que llega de un
  cliente es sospechoso hasta que se valida. Cada regla anterior es un caso
  concreto de esa política.
- **Medir el rate-limit por llegada** (no por procesamiento) porque la
  latencia de procesamiento varía con la carga: la cuota debe castigar al
  emisor rápido, no al servidor lento.

## Mejoras a futuro

1. **Autenticación/cuentas** — Won't del proyecto hasta desbloqueo; sin
  cuentas no hay "bans por jugador" persistentes (los `/ban` de F21.5 serán
  por nombre con archivo local).
2. **Timeouts de idle por jugador** — hoy el heartbeat desconecta a los
  muertos; un timeout de inactividad (sin input) liberaría el slot antes.
3. **`npm audit` como CI (CI 20 ya implementado en v20.2):** mantener el
  escaneo de dependencias en cada iteración.
4. **Logging de intentos fallidos** (login/cooldown) con `server/log.js`
  para diagnosticar ataques sin depurar en vivo.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `WS_MAX_PAYLOAD` | límite de bytes | Anti-DoS del WebSocket |
| `validCoords(x,y,z)` | `Number.isFinite` | Validación previa en todos los handlers |
| `seedCooldownUntil` | 10 s | Cuota anti-spam de `set_seed` |
| `ratelimit.js` | ventanas de llegada | Cuota por procesamiento (F20 D2) |
| `SCHEMA_VERSION` | `6` + migraciones | Rechazo de versiones futuras |
| `atomicWrite` | tmp+rename | Integridad de escritura |
| `deleteWorld` / `savePlayer` | rutas saneadas | Anti path-traversal |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Comandos `/ban`/`/op` (F21.5) | Lista local de bans por nombre; `unit-commands` ampliado |
| Timeout de inactividad | Desconexión de jugadores idle tras N minutos; heartbeat intacto |
| Logging de intentos fallidos | Registro con `log.js`; diagnóstico sin depurar en vivo |
