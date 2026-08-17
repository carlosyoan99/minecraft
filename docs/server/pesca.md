# Servidor — Mecánica: pesca (F21.5, planificada)

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> **Estado: PLANIFICADA** — la mecánica se implementa en la **Fase 21.5
> (A1)** (spec [`../spec/fase21.5-spec.md`](../spec/fase21.5-spec.md) §A1 y
> A8). Hoy **no existe** el ítem `FISHING_ROD` ni el sistema de pesca; este
> fichero documenta el diseño acordado y queda pendiente de actualizar con
> la implementación real. Código previsto: `server/fishing.js` (nuevo),
> `server/projectiles.js`, `server/chests.js`, `recetas.json`,
> `server/constants.js` + `public/constants.js`.

## Cómo funcionará actualmente (diseño acordado)

- **Ítem nuevo `FISHING_ROD`** con durabilidad estilo herramienta
  (`TOOL_DURABILITY` 64) — sincronizado B/I en ambos `constants.js` con su
  icono y la receta (3 palos + 2 hilo) en `recetas.json`.
- **Clic derecho lanza la línea:** una **entidad proyectil** (reusa
  `server/projectiles.js`, patrón del tridente F12) con un **bobber** =
  punto 3D simple en la punta (sin modelar el flotador).
- **Al impactar en agua** (bloque `WATER`), tras un tiempo aleatorio
  (~1.5-5 s) "pica"; al recoger se entrega un ítem de la **tabla de loot
  de pesca**: pescado (cod/salmon/pufferfish/tropical — reusa `COD`/
  `COOKED_COD` y añade ítems nuevos sincronizados si aplica), tesoro (lo que
  exista o se añada sincronizado; sin libro encantado — no hay
  encantamientos) y basura (stick, string, botella...).
- **Fuera del agua no pica** (o pica basura según MC).
- **Soltar el clic antes de picar** devuelve la caña **sin gastar
  durabilidad**; la durabilidad solo se descuenta al recoger un ítem.
- **A8 (pesca en cofres):** cañas rotas (durabilidad 1-20) en las tablas de
  loot de cofres (`LOOT_TABLE`, `TEMPLATE_LOOT_TABLE`,
  `SHIPWRECK_LOOT_TABLE` y las de la F21 si aplican).
- **Qué no incluye:** tipos de cañas, encantamientos ni bobber modelado.

## Por qué así (decisión acordada)

- **Reuso de `projectiles.js`** (patrón tridente F12): la línea es un
  proyectil más con tick e impacto — sin entidad nueva de alto nivel.
- **Tabla de loot en un módulo propio** (`server/fishing.js` o `chests.js`):
  mismo patrón de datos-fuera-del-código que las recetas y el loot de
  minas; los ítems nuevos se sincronizan B/I + receta + icono (regla
  `AGENTS.md`).
- **Durabilidad solo al recoger** es la paridad MC: lanzar y recoger al
  aire no desgasta la caña.

## Mejoras a futuro (tras la implementación)

1. **Tipos de cañas y encantamientos** (eficiencia/atracción) — requiere el
   sistema de encantamientos de F21.5 C; la tabla de loot ganaría entradas
   condicionales.
2. **Bobber modelado + animación** — hoy es un punto 3D; una esfera pequeña
   con parpadeo al picar es el siguiente paso visual.
3. **Pesca en biomas** (MC 1.13: jungla/océano cambian la tabla) — el
   `biome_update` de la F19.5 ya llega al cliente; el servidor puede usar
   `getBiome` para variar la tabla.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso (previsto) |
|---|---|---|
| `I.FISHING_ROD` | id nuevo sincronizado | Ítem de la caña |
| `TOOL_DURABILITY[FISHING_ROD]` | `64` | Durabilidad de la caña |
| `FISHING_LOOT_TABLE` | pescado/tesoro/basura | Tabla de loot de pesca (módulo nuevo) |
| `state.lines` | entidades de línea | Tick del bobber (patrón `state.arrows`) |
| `throw_fishing` / `reel_fishing` | eventos WS (o `fishing_use`) | Lanzar/recoger (protocolo a definir) |
| receta | 3 palos + 2 hilo | `recetas.json` |
| cañas rotas | durabilidad 1-20 | `LOOT_TABLE` (A8) |

### Cambios a realizar y resultados esperados

| Cambio (F21.5 A1/A8) | Resultado esperado |
|---|---|
| Implementar la caña | Test: lanzar al agua → pica y entrega un ítem de la tabla; fuera del agua → no pica; durabilidad solo al recoger; receta válida (`unit-recetas`); `unit-sync`/`unit-itemicons` en verde |
| Cañas rotas en cofres | 1 stack `FISHING_ROD` con durabilidad 1-20 en las tablas de cofres |
| Actualizar este fichero | Marcar como implementado con las constantes/eventos reales y los tests (`unit-fase21.5.js`) |
