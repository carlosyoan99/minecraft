# Fase 22.1 — Herramientas de calidad y automatización (Spec)

> **BORRADOR** — se inserta antes de la Fase 22.2, después del trabajo ya
> en curso de Fase 22 (bloques A3-A5 ya hechos según el commit
> `f11e279`). Es una subfase de herramientas puntuales, no una
> reescritura de nada — surge de la conversación sobre qué tooling
> ayudaría al proyecto, y de descartar explícitamente la idea de
> reescribir el juego con dependencias nuevas de Three.js: la conclusión
> fue quedarnos con herramientas acotadas de calidad/automatización, no
> con un cambio de arquitectura. Estado: prospectiva.

## 0. Origen

| # | Fuente | Contenido | Decisión |
|---|--------|-----------|----------|
| A | Conversación sobre tooling | Reescribir el juego con dependencias nuevas de Three.js | **Descartada** — alto riesgo, sin problema real que lo justifique hoy (ver razonamiento en la conversación: 0 vulnerabilidades, suite en verde, 21+ fases auditadas) |
| B | Conversación sobre tooling | CI en GitHub Actions | Aceptada — Bloque A de esta spec |
| C | Conversación sobre tooling | Dependabot | Aceptada — Bloque B |
| D | Conversación sobre tooling | `madge` (dependencias circulares) | Aceptada — Bloque C |
| E | Conversación sobre tooling | `knip` (código muerto) | Aceptada — Bloque D |
| F | Conversación sobre tooling | `stats.js` de Three.js para HUD de rendimiento en desarrollo | Aceptada — Bloque E |
| G | Conversación sobre tooling | `rot-js` para pathfinding | **No incluida aquí** — queda ligada al bloque de persecución de `fase27.5-spec.md`, se evalúa cuando se llegue a esa fase, no como tooling general |

## 1. Contexto y principio rector

Ninguna herramienta de esta fase reemplaza un sistema propio del juego
(física, audio, render, persistencia siguen siendo 100% del proyecto).
Todo lo de aquí es **verificación y automatización alrededor de** lo que
ya existe — mismo espíritu que ya tienen con `biome`/`c8`. Nada de esto
cambia el comportamiento del juego para quien lo juega.

Verificado antes de escribir esta spec: hoy no existe ningún workflow en
`.github/`, ni configuración de Dependabot, ni `madge`/`knip` en
`devDependencies` — se parte de cero en los cinco bloques.

## 2. Bloque A — CI en GitHub Actions

- [ ] Workflow que corre en cada push y cada PR (a `main` y a cualquier
      rama, incluidas las que ya se recomendaron para Nether/End):
      `npm ci`, `node --check` sobre `server/*.js` y `public/*.js`,
      `npm run lint`, `npm run test:coverage`.
- [ ] **Bloqueante desde el día uno** — a diferencia del chequeo de tipos
      de la Fase 22.2, estos comandos ya son maduros y llevan fases
      pasando en verde; no hay razón para introducirlos como
      "informativos".
- [ ] Badge de estado del workflow en `README.md`.

## 3. Bloque B — Dependabot

- [ ] `.github/dependabot.yml`: revisión semanal de dependencias npm,
      alertas de seguridad automáticas sobre `express`, `ws`, `uuid`,
      `simplex-noise`.
- [ ] Los PRs que abra Dependabot pasan por el mismo CI del Bloque A
      antes de poder fusionarse — no se mergean a ciegas.

## 4. Bloque C — `madge` (dependencias circulares)

- [ ] Añadir `madge` como `devDependency`.
- [ ] Script `npm run graph` (o similar) que verifica ausencia de
      dependencias circulares entre módulos de `server/` y `public/`
      por separado.
- [ ] Decidir si reemplaza o solo verifica `DEPENDENCIAS.md` (mantenido
      a mano hoy) — sugerido: generar el grafo con `madge` y usarlo para
      confirmar que el documento a mano sigue siendo preciso, no
      necesariamente reemplazarlo de inmediato.
- [ ] Integrar en el CI del Bloque A como paso informativo al principio.

## 5. Bloque D — `knip` (código muerto)

- [ ] Añadir `knip` como `devDependency`.
- [ ] Script `npm run deadcode`.
- [ ] **Informativo, no bloqueante, al principio** — es normal que la
      primera pasada tenga falsos positivos que requieren configurar
      exclusiones; no forzar cero hallazgos desde el primer día.

## 6. Bloque E — `stats.js` (HUD de rendimiento en desarrollo)

- [ ] Vendorizar `addons/libs/stats.module.js` de la misma versión de
      Three.js ya vendorizada (`0.160.0`) en `public/vendor/` — no es una
      dependencia nueva, es un archivo más del mismo paquete que ya
      tienen.
- [ ] Integrarlo en el HUD de debug (F3) ya existente, **detrás de un
      toggle en ajustes**, apagado por defecto — no debe verse en una
      partida normal, solo cuando se activa explícitamente para
      desarrollo/perfilado.

## 7. Bloque F — Documentación

- [ ] Actualizar `CLAUDE.md`: CI ahora es bloqueante para fusionar a
      `main`, cómo correr `madge`/`knip` en local, qué esperar del
      badge del README.
- [ ] No se agregan tests de producto en esta fase — es tooling.

## 8. Fuera de alcance de esta fase

- Cualquier reescritura de sistemas existentes (física, audio, render,
  persistencia) — descartado explícitamente en la conversación de
  origen, ver tabla §0 fila A.
- `rot-js` o cualquier librería de pathfinding — ver tabla §0 fila G,
  queda ligado a `fase27.5-spec.md`.
- Migración a TypeScript — ver `fase22.2-spec.md`, que sigue a esta.

## 9. Criterios de aceptación

- CI corriendo y **bloqueante** en cada push/PR.
- Dependabot configurado y probado con al menos un PR real generado por
  él.
- `madge` y `knip` integrados como scripts, con su nivel
  bloqueante/informativo decidido explícitamente (no implícito).
- `stats.js` visible solo tras activar el toggle correspondiente.
- Documentación (`CLAUDE.md`, `README.md`) actualizada.
- Auditoría de Fase 22.1 obligatoria antes de cerrar.
