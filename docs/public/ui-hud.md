# Cliente — Mecánica: UI y HUD

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/ui.js` (orquestador), `public/hud.js`, `public/menus.js`,
> `public/panels.js`, `public/recipebook.js`, `public/dragdrop.js`,
> `public/draglogic.js`, `public/quality.js`, `public/settings.js`.

## Cómo funciona actualmente

> Fase 18 (D-6): `ui.js` es un **orquestador** que re-exporta el API de
> `hud.js` (HUD en juego), `menus.js` (pantallas y pausa), `panels.js`
> (inventario/cofre/horno/picker) y `recipebook.js` (libro).

- **HUD** (`hud.js`): hotbar con durabilidad y tooltips, salud, comida con
  saturación dorada, barra de XP (progreso dentro del nivel con la curva MC:
  `xpInto`/`xpToNext` del servidor), badge de gamemode, coordenadas
  opcionales, silencio, chat y pantalla de muerte.
- **Menús** (`menus.js`): principal (nombre, semilla), mundos (lista con
  badges de modo y borrado), ajustes (render distance, coords, controles
  invertidos, FOV, sensibilidad, volúmenes, calidad), pausa (F17 C1) y
  selector de skins (F17 C3).
- **Paneles** (`panels.js`): crafteo 3×3 + armadura equipada, horno, cofre
  — todos con el servidor como fuente de verdad (`crafting_grid_update`,
  `furnace_state`, `chest_state`).
- **Estilo MC (F19 B):** los paneles usan fondo texturizado del atlas
  (tablas de roble para inventario/cofre, piedra para el horno) aplicado
  desde `ui.js` (`applyPanelBackdrop`) con bisel interior 3D en `.panel` y
  slots biselados; el tooltip comparte el estilo de madera.
- **Drag & drop (F19 D):** `dragdrop.js` maneja el arrastre con pointer
  events (fantasma bajo el cursor, `touch-action: none` en slots); la
  **lógica de transporte** es pura (`draglogic.js`): decide el evento
  (`inventory_swap`, `grid_set`/`grid_return`, `chest_action` con
  `chestSlot` explícito, `furnace_action` con destino) o `null` si el
  movimiento no procede. El click simple no regresa (arrastre con umbral).
- **Tooltip con delay (F19 C):** `hud.js` centraliza el tooltip
  (`attachSlotTooltip`) con ~200 ms de delay; durabilidad incluida.
- **Hot-reload del atlas (F19 E):** `itemicons.js` expone `itemIconCss(id)`
  y `repaintItemIcons()`; `network.js` lo dispara al recargar el atlas sin
  reiniciar el cliente.
- **Libro de recetas** (`recipebook.js`): todas las recetas por categorías
  (bloques/herramientas/armadura/comida/materiales + fundición) sin
  desbloqueo; `recipeCategories.js` decide la pestaña (lógica pura). Se
  **cierra con B o Esc** (`toggleRecipeBook`): al abrirlo el pointer lock se
  libera sobre el panel y al cerrarlo se restaura.
- **Ajustes:** `mc_settings` en localStorage; los aplica `settings.js` en
  tiempo real. La **calidad** (F16 B6) escala la **resolución real** con
  `renderScale` de `quality.js` (baja 0.6× / media 0.85× / alta 1×):
  `pixelRatio = clamp(dpr, 0.5, 2) × renderScale`.

## Por qué así (decisión)

- **El servidor siempre pinta los paneles:** el cliente repinta lo que
  recibe (`applyCraftingGrid`, `applyFurnaceState`, `applyChestState`);
  nunca asume un estado local (evita desincronización con otros jugadores y
  con el servidor).
- **Módulos puros para lo testeable** (categorías, clamps, perfiles) y DOM
  fino para el resto: `tests/unit-recipecats.js`, `tests/unit-ajustes.js`.
- **Tooltips con durabilidad** para que el desgaste sea visible (no hay otra
  forma de saber cuánto le queda a la herramienta).

## Mejoras a futuro

1. **Desbloqueo progresivo de recetas** (MC las desbloquea al obtener el
   material) — el libro ya tiene categorías; falta la marca de "descubierta"
   (campo retrocompatible en `recetas.json`).
2. **Skins personalizadas** — Won't (entrevista F21): el selector de skins
   predefinidas ya existe (F17 C3); un editor quedaría fuera.
3. **Mini-mapa** — toggle opcional; coste medio (canvas 2D sobre el HUD).
4. **Chat con historial** — hoy el chat es efímero; subir/↓ para reenviar
   comandos es barato.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `applyPanelBackdrop(panel, bloque)` | — | Fondo texturizado MC (F19 B) |
| `attachSlotTooltip(slot)` | ~200 ms | Tooltip unificado con durabilidad |
| `draglogic.js` | → evento o null | Decisión de transporte (pura) |
| `toggleRecipeBook()` | B/Esc | Libro de recetas con pointer lock |
| `itemIconCss(id)` / `repaintItemIcons()` | — | Hot-reload del atlas de iconos |
| `quality.js` | renderScale 0.6/0.85/1 | Calidad: resolución real |
| `mc_settings` | localStorage | Ajustes persistidos |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Desbloqueo de recetas | Marca `descubierta` retrocompatible; `unit-recipecats` ampliado |
| Chat con historial | ↑/↓ reenvía comandos; sin cambios de protocolo |
| Mini-mapa | Canvas opcional; toggle en Ajustes |
