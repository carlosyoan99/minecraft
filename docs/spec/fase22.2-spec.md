# Fase 22.2 — Chequeo de tipos con JSDoc + TypeScript, sin build step (Spec)

> **BORRADOR** — se inserta después del trabajo ya en curso de Fase 22
> (bloques A3-A5 ya hechos según el commit `f11e279`), como una subfase
> de herramientas, no de contenido — no bloquea el resto de Fase 22 ni
> depende de que esta cierre primero. Documento creado a partir de la
> conversación sobre si migrar a TypeScript: la recomendación fue **no**
> a la migración completa (rompe "sin build step"), **sí** a esta versión
> reducida. Estado: prospectiva.

## 0. Origen

| # | Fuente | Contenido | Decisión |
|---|--------|-----------|----------|
| A | Conversación sobre TypeScript | Migración completa a `.ts` con build step | **Descartada** — contradice la identidad ya establecida del proyecto (`CLAUDE.md`, comentario de `itemicons.js`, `public/package.json` sin bundler) |
| B | Conversación sobre TypeScript | JSDoc + `tsc --noEmit --checkJs` como chequeo de solo verificación | **Aceptada** — es esta spec |
| C | Verificación empírica en el repo | El bug de `tests/unit-biomas.js` (`birchLogs` sin declarar, hallazgo de la auditoría 2026-08-18) **no lo detecta `biome check` ni con su preset `recommended`** — probado directamente con el binario del proyecto | Justifica el valor real de esta fase, no es solo teoría |
| D | Auditorías previas | `EYE_HEIGHT`, IDs de bloque/ítem y otras constantes deben mantenerse manualmente sincronizadas entre `server/constants.js` y `public/constants.js`, sin nada que lo garantice hoy | Motiva el Bloque C de esta spec |

## 1. Contexto y principio rector

Esto **no es una migración**. Ningún archivo cambia de extensión, no se
introduce ningún paso de build, y `node server.js` / el cliente cargado
por `<script type="module">` siguen funcionando exactamente igual que
hoy. TypeScript entra **únicamente** como `devDependency` de
verificación — igual que ya tienen `@biomejs/biome` o `c8` — y su único
efecto es un comando (`npm run typecheck`) que se puede correr en local
o en CI, sin tocar en ningún momento lo que se ejecuta en producción.

Principio para toda la fase: si en algún punto una anotación de tipo
obliga a reescribir lógica real (no solo añadir un comentario), eso es
señal de haberse pasado de alcance — el objetivo es anotar lo que ya
existe, no rediseñarlo.

## 2. Bloque A — Instalación y configuración base

- [ ] Añadir `typescript` como `devDependency` (solo se usa para
      verificar, nunca se importa en tiempo de ejecución).
- [ ] Crear `tsconfig.json` en la raíz: `allowJs: true`, `checkJs:
      false` a nivel global (ver Bloque B — la adopción es archivo por
      archivo, no de golpe), `noEmit: true`, `strict: false` para
      empezar (subir el nivel de estrictez más adelante, no en esta
      fase — evitar una avalancha de falsos positivos de entrada).
- [ ] Script `npm run typecheck` → `tsc --noEmit`.

## 3. Bloque B — Adopción incremental, archivo por archivo

- [ ] Activar el chequeo solo donde se decida, con el comentario
      `// @ts-check` al inicio del archivo — así la cobertura crece de
      forma explícita y visible en cada diff, nunca de golpe en todo el
      repo.
- [ ] Orden sugerido, de mayor a menor valor:
  1. `server/constants.js` y `public/constants.js` (ataca directamente
     el problema de sincronización del origen D).
  2. El protocolo de red: `server/net.js` + `public/network.js` (ver
     Bloque C, tipar la forma de los mensajes `{event, data}`).
  3. Módulos de guardado (`server/save.js`, `server/save-chunks.js`,
     `server/save-meta.js`) — son los que más se benefician de que el
     compilador confirme la forma de lo que se lee/escribe a disco.
  4. El resto, a criterio de quien implemente, sin exigir cobertura
     total en esta fase.

## 4. Bloque C — Tipos compartidos servidor-cliente

- [ ] Definir con JSDoc (`@typedef`) las formas que hoy solo existen
      "de palabra": el stack de inventario (`{id, count}`), el mensaje
      WS (`{event: string, data: object}` con una forma específica por
      `event` si es viable como unión discriminada), y las constantes de
      bloque/ítem.
- [ ] Ubicarlas en un lugar neutral que ambos lados puedan referenciar
      (por ejemplo, un archivo de tipos compartido documentado en
      comentarios, ya que servidor y cliente no comparten módulos
      directamente hoy) — de forma que un cambio de forma en un lado se
      note como error de tipo en el otro si no se actualiza igual.

## 5. Bloque D — Integración en el flujo de trabajo

- [ ] `npm run typecheck` arranca como **informativo, no bloqueante**
      (no impide cerrar una fase ni hacer commit) mientras la cobertura
      del Bloque B es baja.
- [ ] Una vez que los módulos del Bloque B (constantes + red + guardado)
      estén limpios de errores de tipo, decidir explícitamente si pasa a
      ser bloqueante en el mismo lugar donde hoy se exige `biome check`
      0 errores.

## 6. Bloque E — Prueba de valor concreta

- [ ] Como criterio tangible de que esto sirve para algo real: reproducir
      un error de la misma clase que el bug de `birchLogs` (variable
      usada sin declarar) en uno de los archivos ya cubiertos por el
      Bloque B, y confirmar que `tsc --noEmit --checkJs` lo señala antes
      de ejecutar nada — documentar el resultado en esta spec al
      cerrarla.

## 7. Bloque F — Documentación

- [ ] Actualizar `CLAUDE.md` con la convención nueva: cuándo anotar con
      JSDoc, cómo correr `npm run typecheck`, y que esto no cambia en
      nada la regla de "sin build step" ya existente.
- [ ] No se agregan tests unitarios de producto en esta fase — es
      tooling, no gameplay.

## 8. Fuera de alcance de esta fase

- Renombrar cualquier archivo a `.ts`.
- Añadir un build step de cualquier tipo al cliente o al servidor.
- Exigir cobertura completa del proyecto — esta fase arranca la
  práctica, no la termina.
- Hacer bloqueante el chequeo antes de que el Bloque D lo decida
  explícitamente.
- Subir `strict` a `true` en `tsconfig.json` — queda para una fase
  posterior si se decide, una vez que haya cobertura real que lo
  soporte sin generar ruido.

## 9. Criterios de aceptación

- `tsconfig.json` y `npm run typecheck` funcionando sin afectar
  `node server.js` ni el arranque del cliente.
- Los módulos del Bloque B (constantes, protocolo de red, guardado)
  cubiertos con `// @ts-check` y sin errores de tipo.
- Tipos compartidos del Bloque C creados y referenciados desde ambos
  lados.
- La prueba de valor del Bloque E documentada con su resultado real.
- Cero cambios de comportamiento en runtime: misma suite de tests en
  verde, mismo `node --check` limpio, mismo `biome check` 0 errores.
- Auditoría de Fase 22.2 obligatoria antes de cerrar.
