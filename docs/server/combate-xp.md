# Servidor — Mecánica: combate, daño, armadura y XP

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/combat.js`, `server/players.js` (respawn), `server/mobs.js`
> (drops/XP).

## Cómo funciona actualmente

- **Daño por origen** (`damagePlayer`): mob (cuerpo a cuerpo o flecha),
  creeper (explosión), caída, lava, hambre (inanición). Cada origen pasa por
  `opts.source` para telemetría (`damage_debug` + `state.damageLog`).
- **Armadura** (`applyArmorDamageReduction`): reduce el daño según la pieza
  y su material (cuero/hierro/diamante), con durabilidad propia
  (`ARMOR_DURABILITY`). El equipamiento va por slots dedicados (F7).
- **Hambre y regeneración:** la saturación se consume primero y decae más
  rápido en movimiento; con comida ≥18 el jugador regenera salud; con 0
  muere de inanición (ignora armadura).
- **XP con la curva OFICIAL de Minecraft** (F13 paridad B2): `xpToNext(level)`
  por tramos (2L+7 para L<16, 5L−38 para 16..30, 9L−158 para L≥31); coste
  total hasta nivel 30 = 1.395 XP. La **salud máxima es SIEMPRE 20** (el
  nivel NO da vida, paridad B1). El HUD recibe `xpInto`/`xpToNext`.
- **Valores de comida MC** (F18 C-3): `FOOD_VALUES` oficiales — zanahoria
  3/3.6, patata 1/0.6, patata al horno 5/6 (receta en `recetas_horno.json`).
- **`MOB_XP` coherente** (F18 C-5): hostiles 5 XP, lobo salvaje 2, slime por
  tamaño 4/2/1; `unit-paridad.js` fija la coherencia (checks D6).
- **Muerte y respawn** (`respawnPlayer`): al morir se suelta el inventario,
  se restaura salud/comida, se reaparece en el spawn (o la cama si se
  durmió) y hay gracia de spawn (30 s sin daño de mobs).
- **XP al morir recogible** (F18 C-8): en survival la XP se suelta como
  **orbe** (`xp_orb` en `state.mobs`, esferita verde) en el punto de muerte;
  al caminar encima (radio 2) se recoge con la curva MC (`addXp`). Los
  orbes **no se persisten** y **expiran a los 5 min** (paridad MC). En
  creative la XP se conserva.

## Por qué así (decisión)

- **Telemetría de daño por origen** nació del diagnóstico de la Fase 8
  ("pierdes vida sin causa"): con `damage_debug` y el anillo `damageLog` se
  confirmó que eran mobs cerca del spawn → zona segura + gracia. Medir
  antes de arreglar.
- **Curva MC no lineal** da progresión realista: los primeros niveles son
  baratos y luego se encarecen. La lineal simple hacía el nivel 3 tan caro
  como el 12. Desde F13 es la OFICIAL por tramos y **el nivel no modifica
  la vida**: la progresión defensiva solo viene de la armadura.
- **El daño real pasa por armadura** para que la armadura importe como
  progresión defensiva.
- **Orbe de XP al morir** es la paridad MC: perder la XP por completo era
  frustrante sin la oportunidad de recuperarla.

## Mejoras a futuro

1. **Encantamientos** (F21.5 C, plan): filo/protección/agilidad — campo
   retrocompatible en `ItemStack`; `damagePlayer` y `applyArmorDamageReduction`
   son los puntos de inyección.
2. **Tótem de inmortalidad** (F21.5, plan): ítem que salva de la muerte —
   requiere hook en `respawnPlayer`.
3. **Escudo** (F21.5, plan): bloqueo con clic derecho — nuevo slot y
   reducción de daño frontal.
4. **Knockback de armas** (ver `fisica-movimiento.md`): `attack_mob` debería
   emitir `knockback` al mob golpeado.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `xpToNext(level)` | tramos 2L+7 / 5L−38 / 9L−158 | Curva XP oficial (paridad B2) |
| `FOOD_VALUES` | ítem → {hambre, saturación} | Comida MC (C-3) |
| `MOB_XP` | tipo → XP | Tabla de XP por mob (C-5) |
| `ARMOR_DURABILITY` | pieza → usos | Desgaste de armadura |
| `damagePlayer(p, origen, opts)` | — | Daño con telemetría (`opts.source`) |
| `applyArmorDamageReduction` | — | Reducción por armadura |
| `addXp(p, cantidad)` | — | XP con curva MC + niveles |
| `respawnPlayer(p)` | — | Respawn + gracia + orbe si survival |
| `tickXpOrbs` | — | Expiración (5 min) y recogida (radio 2) |
| `xp_orb` | entidad | Orbe de XP al morir (C-8) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Encantamientos (F21.5) | Campo `enchants` retrocompatible, receta de mesa de encantar diferida; `unit-paridad` ampliado |
| Tótem de inmortalidad | Hook en `respawnPlayer`; ítem nuevo sincronizado + receta |
| Knockback cuerpo a cuerpo | `attack_mob` emite el empuje; `mob.kb` ya integrado |
