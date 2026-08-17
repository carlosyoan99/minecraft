# Cliente — Mecánica: mobs y jugadores remotos

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/mobs.js`, `public/mobtextures.js`.

## Cómo funciona actualmente

- Cada mob es un **THREE.Group de partes** (cabeza, cuerpo, extremidades)
  según `MOB_PARTS` — creeper con 4 patas, araña con 8 rotadas, enderman
  alto, conejo con orejas, pollo...
- **Un solo material por mob** (el atlas completo, base 0xffffff): la quema
  solar y el flash de daño (`flashMob`) tiñen el grupo entero.
- **Patas animadas** (F10 + F19.6 F1): cada extremidad lleva
  `userData.limbIndex` y `setMobWalk` las oscila con una fase según la
  distancia recorrida (y `resetMobWalk` al parar). Desde F19.6 la caminata
  es balanceo por trigonometría (senos con fase por mob) y los hostiles
  adelantan el brazo/garra al atacar (`triggerMobAttack`); el toggle de
  accesibilidad "reducir movimiento" (F19.5 B4) atenúa el balanceo a 0.4.
- El grupo raíz conserva `userData.mobId/mobType` para el raycast de
  combate: `raycast.js` intersecta los **hijos** y sube al raíz.
- `updateMobs` sincroniza posiciones/interpolaciones desde `mobs_update`;
  las flechas se dibujan con `updateArrows` (`arrows_update`) como entidades
  ligeras con física de gravedad.
- Jugadores remotos: mismo sistema de partes, con nombre (`player_rename`)
  y color de material por jugador.

## Por qué así (decisión)

- **Multibloque = reconocible.** Un box único no distingue un zombi de un
  creeper. Las partes por especie dan identidad visual sin modelos 3D
  externos (todo procedural).
- **Material compartido por mob** permite el tintado global (quema/flash)
  con un solo cambio de color, y limita draw calls.
- **Raycast por hijos** es la forma correcta de golpear un grupo en Three.js
  (regresión B10 de la F8: intersectar el grupo raíz fallaba porque la
  geometría está en los hijos).

## Mejoras a futuro

1. **Interpolación suave de mobs** — hoy `updateMobs` a 20 Hz; una
  extrapolación local (patrón `daynight.js`) haría el movimiento fluido a
  60 FPS con lag de red.
2. **Nuevos mobs (F21 C1/C2, P1):** vaca, gallina, enderman — partes y
  teselas nuevas en `MOB_PARTS`/`mobtextures.js` (la vaca/gallina ya están
  en el servidor desde la v21.1; falta su mesh).
3. **Animación de ataque con parpadeo** — el flash de daño existe; un
  parpadeo del material (blanco→normal) al recibir golpe es el siguiente
  paso barato.
4. **Sombreado por mob** (sombras proyectadas) — hoy solo el terreno; coste
  medio (shadow map ya configurado en escena).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `MOB_PARTS` | tabla por especie | Partes del cuerpo |
| `setMobWalk(mob, dist)` / `resetMobWalk` | — | Balanceo de patas por distancia |
| `triggerMobAttack(mob)` | — | Brazo/garra adelantado al atacar |
| `flashMob(mob)` | — | Tinte de daño |
| `updateMobs` / `updateArrows` | — | Sincronización desde `mobs_update`/`arrows_update` |
| `userData.mobId/mobType` | raíz del grupo | Raycast de combate |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Mobs F21 (vaca, gallina, enderman) | Partes + teselas nuevas; raycast y quema funcionan igual |
| Extrapolación local | Movimiento suave a 60 FPS; sin cambios de protocolo |
| Parpadeo al recibir golpe | Flash blanco→normal; barato (color del material) |
