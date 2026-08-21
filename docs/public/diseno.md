# Sistema de diseño frontend

> Documentación del sistema visual del cliente: fuentes, tokens CSS,
> animaciones, breakpoints responsivos y componentes UI. Todo el estilo
> vive en `public/estilo.css` (~1900 líneas); este documento explica
> **qué hay** y **por qué**.

---

## 1. Fuentes

El proyecto usa **tres fuentes** cargadas vía Google Fonts (con
`preconnect` para carga rápida):

| Variable CSS | Fuente | Uso |
|---|---|---|
| `--font-pixel` | **Press Start 2P** | Logo, títulos de pantalla (`.mc-title`), botones principales (`#start-btn`, `#pause-resume-btn`, `#seed-create-btn`), títulos de panel (`.panel h3`), pantalla de carga (`.loading-title`, `#loading-message`), pantalla de muerte (`.death-card h2`) |
| `--font-ui` | **JetBrains Mono** | Cuerpo de texto, labels (`.menu-field`), inputs, selects, tabs (`.st-tab`), botones secundarios (`.menu-secondary`), HUD (`#info`, `#chat-log`, `#coords-hud`, `#fps`, `#debug-hud`), tooltips, hotbar, slots, mundo de items, hints |
| (heredado) | JetBrains Mono → Courier New → monospace | Fallback del body |

**Por qué esta combinación:**
- `Press Start 2P` es una fuente pixel bitmap que evoca la estética
  Minecraft sin necesitar assets externos. Se usa en tamaños grandes
  (10-22px) donde la legibilidad pixel es parte del diseño.
- `JetBrains Mono` es un monospace moderno con buen hinting que
  mantiene el look "blocky" del juego pero es legible a tamaños
  pequeños (8-13px). Reemplaza a `Courier New` que era genérica.
- `Press Start 2P` NO se usa en texto corrido (menú-sub, hints,
  chat) porque a tamaños pequeños es ilegible.

**Jerarquía de tamaños:**

| Nivel | Tamaño | Elementos |
|---|---|---|
| Display | 22px pixel | Logo (`.logo-big`) |
| H1 | 14-16px pixel | Títulos de pantalla (`.mc-title`), headings de menú |
| H2 | 11-12px pixel | Títulos de panel, botones principales |
| Body | 12-13px ui | Labels, inputs, tabs, texto de menú |
| Small | 10-11px ui | Hints, créditos, seeds, badges |
| Micro | 8-9px ui | Counts de slots, item fallback, armor-empty |

---

## 2. Tokens CSS (`:root`)

Todos los colores y fuentes reutilizables están centralizados en
`public/estilo.css` `:root`. **Nunca usar colores hardcodeados** en
nuevo código; usar los tokens.

### Fuentes
```css
--font-pixel: "Press Start 2P", "Courier New", monospace;
--font-ui: "JetBrains Mono", "Courier New", monospace;
```

### Paneles y biseles
```css
--mc-bg: #c6c6c6;          /* fondo base de paneles */
--mc-bg-dark: #8f8f8f;     /* fondo de slot */
--mc-border-light: #fff;   /* bisel claro (arriba-izquierda) */
--mc-border-mid: #4a4a4a;  /* bisel medio del panel */
--mc-border-dark: #3a3a3a; /* bisel oscuro (abajo-derecha) */
--mc-ink: #2b2b2b;         /* texto sobre paneles */
--mc-focus: #ffd454;       /* foco de navegación por teclado */
```

### Semánticos
```css
--mc-accent: #4caf50;       /* verde principal: tabs activos, checkbox, focus */
--mc-accent-light: #dfffdf; /* borde claro del accent */
--mc-accent-dark: #2a5a2a;  /* borde oscuro del accent */
--mc-danger: #c0392b;       /* rojo: borrar mundo, errores */
--mc-danger-light: #ff6b6b; /* rojo claro: título muerte */
--mc-gold: #ffd75f;         /* dorado: slot seleccionado, nombres */
--mc-gold-dark: #8a5a00;    /* dorado oscuro: borde slot */
--mc-success: #4a8a2e;      /* verde oscuro: survival, skin selected */
--mc-creative: #8a5ac0;     /* púrpura: badge creativo */
```

### Superficies
```css
--mc-surface: #1b1b22;      /* fondo de inputs, selects, valores */
--mc-surface-deep: #14141f; /* fondo más oscuro */
--mc-screen-bg: #1a1a2e;    /* fondo de body */
```

### Barras de HUD
```css
--mc-health-fill: #e8544f;  /* vida baja */
--mc-health-mid: #e8b93f;   /* vida media */
--mc-health-high: #5fd34f;  /* vida alta */
--mc-food-fill: #c08040;    /* comida */
--mc-sat-fill: #ffb300;     /* saturación dorada */
--mc-xp-fill: #3fae2a;      /* barra de XP */
```

---

## 3. Animaciones

### Pantalla de carga
| Animación | Elemento | Duración | Efecto |
|---|---|---|---|
| `dirtPan` | `#loading-screen` | 6s loop | Fondo de tierra se desplaza |
| `panelEntrance` | `.loading-panel` | 0.4s once | Fade + scale(0.94→1) + slide-up 8px |
| `fillSlide` | `#loading-fill::after` | 0.8s loop | Rayas diagonales sobre la barra |
| `barSweep` | `#loading-fill::before` | 2s loop | Reflejo brillante que recorre la barra |
| `msgPulse` | `#loading-message` | 2.5s alternate | Pulso sutil de opacidad (0.85→1) |

### Menú
| Animación | Elemento | Duración | Efecto |
|---|---|---|---|
| `menuSlideIn` | `.menu-screen:not(.hidden)` | 0.3s once | Fade + slide-up 12px al cambiar de pantalla |
| `cloudDrift` | `.menu-cloud` | 70-130s loop | Nubes que pasan por el fondo del menú |

### Botones (transiciones CSS, no keyframes)
| Propiedad | Valor | Efecto |
|---|---|---|
| `filter` | `brightness(1.18)` en hover | Brillo al pasar el cursor |
| `transform` | `translateY(-1px)` en hover | Lift sutil |
| `transform` | `translateY(1px)` en active | Press-down al pulsar |
| `transition` | `0.12s ease` | Suavizado de ambas |

### Overlays de estado
| Animación | Elemento | Duración | Efecto |
|---|---|---|---|
| `fire-flicker` | `#fire-overlay` | 0.28s alternate | Viñeta naranja parpadeante (lava) |
| `poison-pulse` | `#poison-overlay` | 1s alternate | Viñeta verde pulsante (Bogged) |

### Pantalla de muerte
| Animación | Elemento | Duración | Efecto |
|---|---|---|---|
| `deathShake` | `.death-card` | 0.5s once | Shake con rotación (±0.5°, 6px max) |

### Fondo del menú
| Animación | Elemento | Duración | Efecto |
|---|---|---|---|
| `cloudDrift` | `.menu-cloud` | 70-130s loop | Nubes CSS que cruzan el cielo |

---

## 4. Breakpoints responsivos

| Breakpoint | Nivel | Ajustes principales |
|---|---|---|
| `> 768px` | Desktop | Layout completo, logo 22px, skins 9 columnas |
| `≤ 768px` | **Tablet** (nuevo) | Logo 18px, mc-title 13px, paneles 80vw, skins 5 columnas, pause buttons 220px, worlds-list 160px |
| `≤ 640px` | Móvil | Logo 16px, mc-title 12px, menu padding 20px/16px, skins 3 columnas + vertical, skin-preview 116×148, pause 200px |
| `≤ 520px` | Panel scale | Paneles con `transform: scale(0.82)` via `--panel-scale` |

---

## 5. Componentes UI

### Crosshair (SVG)
Sustituye el antiguo `+` de texto por un SVG inline de 24×24 con
path de cruz (fill blanco + stroke negro 1px) y `drop-shadow`.
Ventaja: nítido a cualquier resolución, sin depender de fuentes.

### Backdrop de paneles (`#panel-backdrop`)
Overlay fijo con `backdrop-filter: blur(4px)` + `background: rgba(0,0,0,0.35)`.
Se muestra con transición de opacidad (0.25s) cuando cualquier panel
está abierto (inventario, horno, cofre, mochila, picker, recetas).
`z-index: 190` (sobre HUD 90, bajo paneles 200). `pointer-events: none`.

### Inputs unificados
Todos los inputs de menú (nombre, semilla, texto) comparten:
- `background: var(--mc-surface)`
- `border: 2px solid` con biseles MC (`#3a3a3a #8d8d8d #8d8d8d #3a3a3a`)
- `box-shadow: inset 0 2px 4px rgba(0,0,0,0.4)`
- Focus: `border-color: var(--mc-accent)` + glow `0 0 0 1px`
- Font: `var(--font-ui)` 13px

### Paneles (inventory, furnace, chest, bundle, recipe-book, picker)
- Fondo texturizado (`var(--panel-bg)` fijado por JS desde el atlas)
- Biseles 3D MC: `border-color: var(--mc-border-light) var(--mc-border-mid) ...`
- Box-shadow con bisel interior + sombra externa
- `z-index: 200`
- Responsive: `scale(0.82)` en `≤520px`

### Hotbar
- 9 slots de 52×52px con biseles MC
- Slot seleccionado: borde dorado `var(--mc-gold)` + fondo más claro
- Barra de durabilidad por debajo (verde→amarillo→rojo)

### Tooltips
- Fondo texturizado (`var(--panel-bg)`)
- Biseles MC + sombra externa
- `z-index: 50`, centrado arriba
- Nombre en bold + durabilidad en small

---

## 6. Convenciones para nuevo CSS

1. **Siempre usar tokens** `var(--mc-*)` para colores. Nunca
   hardcodear `#hex` fuera de `:root`.
2. **Fuentes**: `var(--font-pixel)` para títulos/botones grandes,
   `var(--font-ui)` para todo lo demás. Nunca `font-family: inherit`.
3. **Transiciones**: usar `transition: property 0.12s ease` para
   hover/active de botones, `0.25s ease` para paneles/overlays.
4. **Biseles MC**: `border: Npx solid; border-color: light mid mid light`
   (arriba-izquierda claro, abajo-derecha oscuro).
5. **Z-index**: body 0, HUD 90, overlays 149-150, backdrop 190,
   paneles 200, death 250, touch 280, blocker 300, mute 310,
   loading 320, drag-ghost 400.
6. **Animaciones**: preferir `transition` sobre `@keyframes` para
   interacciones (hover, toggle). Usar `@keyframes` solo para
   loops continuos (carga, nubes, fire) o entradas únicas (shake,
   panelEntrance).
7. **Responsive**: breakpoints en `768px` (tablet) y `640px`
   (móvil). Los paneles usan `--panel-scale` para escalado
   proporcional.

---

## 7. Accesibilidad (WCAG 2.2)

### Foco visible (2.4.7)
```css
:focus-visible {
  outline: 2px solid var(--mc-focus);
  outline-offset: 2px;
}
:focus:not(:focus-visible) { outline: none; }
```
Los paneles de inventario usan `.a11y-focus` (outline dorado + glow)
para la navegación por teclado (Tab/Shift+Tab entre slots).

### Movimiento reducido (2.3.3)
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```
Además, el toggle "Reducir movimiento" en ajustes atenúa el FOV del
sprint (F19.5 B4).

### ARIA en HTML
- **Loading bar**: `role="progressbar"` + `aria-valuenow` sincronizado
  con JS (`loading.js` `setProgress`)
- **Tabs**: `role="tablist"` en el contenedor, `role="tab"` +
  `aria-selected` en cada botón
- **Overlays decorativos**: `aria-hidden="true"` en crosshair, fire,
  poison, shield, panel-backdrop
- **Touch buttons**: `aria-label` explícito (title no es suficiente)
- **Chat input**: `aria-label="Chat del juego"`
- **HUD info**: `role="status" aria-live="polite"` para anunciar
  cambios de vida/comida/XP
- **`lang="es"`** en `<html>` (ya existía)

### IDs únicos
Los paneles de ajustes y ayuda compartían `id="pane-controls"`
(inválido). Renombrados a `pane-controls-settings` y
`pane-controls-help` con `data-tab` correspondiente.
