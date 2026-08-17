# Cliente — Mecánica: accesibilidad

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/a11y-nav.js`, `public/hud.js`, `public/player.js` (F19.5 B).

## Cómo funciona actualmente

- **Navegación por teclado en paneles** (`a11y-nav.js`, F19.5 B1): con un
  panel abierto y el puntero liberado, **Tab/Shift+Tab** recorren los slots
  visibles (foco dorado `.slot.a11y-focus`) y **Enter/Espacio** dispara el
  click real del slot (grid_set/chest_action/etc.). No interfiere con el
  juego (pointer lock) ni con inputs de texto.
- **Contraste del HUD** (B2): `#info` (salud/comida/XP) tiene contorno
  oscuro en las 4 direcciones — legible sobre nieve/desierto (claro) y
  cueva/lava (oscuro).
- **Indicadores no solo-color** (B3): salud/comida/XP muestran el valor
  numérico además de la barra; la saturación dorada acompaña al color.
- **"Reducir movimiento"** (B4): ajuste `reduceMotion` en Ajustes → Video —
  elimina el FOV del sprint (y atenúa la animación de mobs de la F19.6 a
  escala 0.4).
- **Tokens de diseño** (F19.5 D): variables CSS en `:root` (`--mc-bg*`,
  `--mc-border*`, `--mc-ink`, `--mc-focus`) — los paneles/slots usan los
  tokens, no valores sueltos.

## Por qué así (decisión)

- La accesibilidad se abordó como bloque propio (F19.5 B) con tests y
  criterios WCAG 2.2: teclado, contraste, no-solo-color y movimiento.
- **Tokens CSS** para que el tema sea consistente y cambiable desde un solo
  lugar (los biseles/fondos de la F19 los consumen).

## Mejoras a futuro

1. **Sub-títulos para sonidos** — los sonidos de paridad (C-9) no tienen
  equivalente visual; un indicador de subtítulo en `hud.js` (toggle) es la
  mejora más pedida.
2. **Tamaño de UI escalable** — hotbar/paneles a 100/125/150 %; hoy la UI es
  fija (la resolución del canvas sí escala por calidad).
3. **Modo daltónico** — paletas alternativas para el HUD (salud roja →
  azul); los tokens CSS lo facilitan.
4. **Contraste del cielo** — el sky dome puede ser muy brillante; un toggle
  de "cielo tenue" reduciría fatiga.

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `a11y-nav.js` | Tab/Enter sobre slots | Navegación por teclado en paneles |
| `reduceMotion` | ajuste persistido | Quita FOV del sprint + atenúa animación |
| `--mc-bg*` / `--mc-border*` / `--mc-ink` / `--mc-focus` | tokens CSS | Tema consistente |
| `#info` | contorno 4 direcciones | Contraste del HUD |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Sub-títulos | Indicador visual de sonidos; toggle en Ajustes → Accesibilidad |
| Tamaño de UI | Escala 100/125/150 %; tests de regresión en `unit-fase19.5` |
| Modo daltónico | Paleta alternativa vía tokens; sin cambios de lógica |
