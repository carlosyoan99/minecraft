# Servidor — Mecánica: IA de mobs

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `server/mobs.js` (clase `Mob`), `server/mob-species.js`
> (subclases), `server/mob-spawn.js`, `server/projectiles.js`.

## Cómo funciona actualmente

- **Por especie** (F9 D), cada una subclase de `Mob` con hooks
  `tickSpecies`/`onDeath` (F13 C2, fábrica `createMob` + `MOB_CLASSES`):
  - **Zombi:** persigue, ataca cuerpo a cuerpo, **arde de día**
    (`BURNS_IN_SUN` con sombra de techos/árboles y agua).
  - **Esqueleto:** mantiene distancia (8-16 bloques) y **dispara flechas**
    (primer proyectil: `state.arrows`, gravedad, vida limitada, daño 3).
    No arde de día (MC real).
  - **Creeper:** se acerca hasta ≤3 bloques, "silba" ~1.5 s (`fuseStart`,
    escala creciente al cliente) y explota; cancela el fuse si el jugador
    se aleja.
  - **Araña:** escala muros de 1 bloque y salta al acercarse.
  - **Pasivos:** huyen al ser golpeados (`fleeUntil`), deambulan con pausas,
    pastan, vuelven al rebaño (`homeX/homeZ` si se alejan >24) y duermen de
    noche (estado `sleep`).
  - **Vaca (F21 C1):** ordeñable con cubo (`milk_cow` → `I.MILK` 260, ≤4
    bloques). **Gallina (F21 C1):** pone huevos (`tickChicken` → `I.EGG`
    261 al jugador survival más cercano, ≤6 bloques, cada 5-10 min). Ambos
    ítems sincronizados en ambos `constants.js` y en `CREATIVE_ITEMS`.
- **Spawn por hora y luz:** de noche (o en zonas oscuras) los hostiles
  spawnan a ≥24 bloques del jugador; **zona segura de spawn** (radio 32)
  donde no aparecen ni targetean.
- **Spawn por bioma** (F12 C): `BIOME_SPAWN` (taiga → lobos de noche,
  pantano → slimes de noche, jungla → ocelotes de día) y `WATER_SPAWN`
  (ahogados bajo la superficie).
- **Salud por especie** (F14 B, paridad MC): zombi/creeper/esqueleto/lobo/
  drowned 20, **araña 16**, **enderman 40**, **abeja 10**; el creeper
  explota con el daño del TNT (`TNT_DAMAGE`).
- **Drops por especie** (F16 D2): zombis sueltan **carne podrida** (0-2) y
  creepers **pólvora** (0-2, ingrediente del TNT) — ítems sincronizados.
- **Persecución con `stuckTicks`:** si un hostil no avanza persiguiendo, se
  desvía lateralmente; hay límite de rango con vuelta a wander.
- **Cría** (`canFeed`/`applyFeed`): con la comida de cría correcta
  (`BREED_FOOD`), dos pasivos generan un bebé (corazones al cliente).

## Por qué así (decisión)

- **IA por especie > IA genérica:** un creeper que explota al primer tick o
  un esqueleto cuerpo a cuerpo no se parecen a Minecraft. Cada especie tiene
  su amenaza y su contra-juego (esquivar el fuse, esconderse de las flechas,
  refugiarse del sol).
- **Spawn seguro del spawn:** resultado directo del diagnóstico de la Fase 8
  (B2): el jugador nuevo moría en segundos. Radio 32 = "seguro" sin matar la
  exploración.
- **`Math.random()` en runtime está bien:** la IA y el spawn de mobs **no
  necesitan ser deterministas** (no generan contenido permanente); solo la
  generación del mundo y los atlas usan PRNG sembrado.
- **POO por especie** (F13 C2) sin `if (type)` en los llamadores: la
  variación vive en métodos sobreescritos; `new Mob("zombie")` sigue
  funcionando (retrocompatibilidad).

## Mejoras a futuro

1. **C2 (F21, P1): enderman** (neutralidad: solo agrede al mirarlo;
   teletransporte ya probado en `unit-mobs-ia`), zombified piglin (efecto
   dominó) y abeja con colmena.
2. **C3 (F21, P1):** creeper que huye de gatos, esqueleto con strafe
   lateral, araña de día neutral / de noche hostil, zombi que convoca a
   otros al recibir daño.
3. **Gallina que pone huevo lanzable** (F21.5, plan): el huevo existe como
   ítem pero no se lanza (1/8 pollito) en v21.1.
4. **Oveja que come pasto** para regenerar lana (F21 C1, P1).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `MOB_CLASSES` / `createMob(type)` | — | Subclases por especie (F13 C2) |
| `BIOME_SPAWN` / `WATER_SPAWN` | tabla | Spawn por bioma (F12 C) |
| `BREED_FOOD` | tipo → ítem | Comida de cría |
| `MOB_XP` / `mobXp(type)` | tabla | XP por especie (C-5) |
| `BURNS_IN_SUN` | — | Quema solar de hostiles (zombi) |
| `state.fuses` | — | Fuse del creeper (~1.5 s) |
| `tickSpecies(mob, isNight)` | hook | IA específica por especie (gallina pone huevos) |
| `onDeath(mob)` | hook | Comportamiento al morir (slime se divide) |
| `milk_cow` / `tickChicken` | handlers | Vaca ordeñable / gallina ponedora (F21 C1) |
| `CHICKEN_EGG_INTERVAL` / `CHICKEN_EGG_RANGE` | `[5,10]` min / `6` bloques | Huevos de gallina |
| `mob.kb` | vector | Knockback integrado en el tick (F20 B3) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Enderman (F21 C2, P1) | Pacífico hasta provocarlo; teletransporte y golpe; alérgico al agua; tests de IA |
| C3 (F21, P1) | Comportamiento por especie documentado y testeado; sin cambios de protocolo ni guardado |
| Huevo lanzable (F21.5) | Lanzar huevo → 1/8 pollito; proyectil reusa `projectiles.js` |
| Oveja come pasto | Regenera lana tras comer; test en `unit-cria` |
