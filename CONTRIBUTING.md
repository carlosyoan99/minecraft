# Contributing — Cómo contribuir a Mi Minecraft

Gracias por querer mejorar el proyecto. Este archivo resume el
flujo de trabajo; los detalles de convenciones están en
[`CLAUDE.md`](CLAUDE.md) (guía para IA y contribuidores), el
tracker de tareas por fase en [`TODO.md`](TODO.md) y la verdad de
cada fase (qué se hizo y cómo) en las specs de
[`docs/`](docs/README.md). **Léelos antes de tocar código.**

## Primeros pasos

1. Lee `README.md` (qué es el proyecto), `CLAUDE.md` (cómo se
   trabaja aquí), `TODO.md` (qué fase está en curso) y la spec de esa
   fase en `docs/` (el detalle del trabajo).
2. Confirma qué tarea del `TODO.md` estás atacando. **No se
   adelanta trabajo de fases futuras** sin discutirlo antes.
3. Instala dependencias y arranca:

   ```bash
   npm install
   node server.js
   ```

   Abre `http://localhost:3000`. El cliente se sirve sin build
   step (módulos ES6 + importmap), así que no hay nada que
   compilar.

## Requisitos

- Node.js 18+ (el servidor usa CommonJS; el cliente ES modules).
- Sin frameworks, sin bundlers, sin TypeScript a propósito. Si
  crees que hace falta una dependencia nueva, justifícala: el
  proyecto prefiere "20 líneas de JS plano" a una librería más.

## Cómo ejecutar los tests

```bash
node tests/run.js                         # unitarios + E2E si hay servidor
node tests/run.js --unit                  # solo unitarios
WS_URL=ws://localhost:3998 node tests/run.js --e2e   # solo E2E (necesita servidor)
PORT=3998 node server.js                  # servidor para los E2E (otra terminal)
node tests/audit-fase3.js                 # auditorías por fase
node tests/audit-fase4.js
node tests/audit-fase5.js
```

- Los E2E se omiten con un aviso si no hay servidor vivo (no es
  un fallo).
- **Regla:** cualquier mecánica nueva va acompañada de su test
  (unitario en `tests/`, o E2E contra servidor real). Las fases
  nuevas terminan con su auditoría.
- Los tests deben quedar en verde antes de abrir una PR/commit.

## Convenciones de código

- **Servidor:** CommonJS (`require`). **Cliente:** ES modules
  (`import`). No mezclar estilos dentro del mismo entorno.
- **Español:** comentarios, nombres de variables y mensajes de
  commit en español, como el resto del proyecto.
- **Eventos WebSocket** en `snake_case` (`block_action`,
  `furnace_state`, ...), ver el protocolo en el `README.md`.
- **IDs de bloques/ítems:** si añades uno, sincroniza
  `constants.js` (servidor) y `public/constants.js` (cliente) y
  añade la receta si aplica. Lo auditan `unit-sync.js` y
  `unit-recetas.js`.
- **Formato de guardado:** cualquier cambio exige subir
  `SCHEMA_VERSION` con migración retrocompatible y test de
  migración (`unit-persistencia.js` es el modelo).
- **El servidor es la única fuente de verdad:** no mover
  validación, física o inventario al cliente "por comodidad".

## Flujo de trabajo por fases

1. Cada cambio nace de una tarea de `TODO.md`; el detalle del
   cambio se documenta en la spec de su fase, no en el tracker.
2. Cambios pequeños y verificables: **una preocupación por
   commit** (ej. "guardado incremental por chunk"), nunca mezclar
   varias fases.
3. Cliente y servidor se actualizan **en el mismo cambio** cuando
   tocan el mismo tema (formato de chunk, protocolo WS, inventario)
   — nunca en commits separados.
4. Antes de marcar una fase como completa: auditoría de
   rendimiento, integridad de guardado y limpieza de código muerto.
5. Usa el checklist de nueva fase de `CLAUDE.md` al planificar.

## Commits

- Mensajes en español, con formato descriptivo:
  - `Fase N: resumen descriptivo` (ej. `Fase 4: mundo más
    profundo (cuevas 3D, agua con flotación, biomas nieve/montaña)`)
  - `área: resumen` para cambios puntuales (ej. `tests: unitarios
    de crafteo y horno`, `fix: receta hilo_a_lana`)
- Detalles en párrafos `-m` adicionales (qué, por qué, tests).
- No commitear nunca: `node_modules/`, `world/` (están en
  `.gitignore`) ni archivos temporales de auditoría (`tmp-*`).

## Cómo reportar un bug

Abre un issue/PR con:

- Pasos para reproducirlo (idealmente con un test que falle).
- Dónde ocurre: ¿cliente (navegador, consola) o servidor (logs)?
- Logs relevantes y, si es de render, `mcChunks`/errores de
  consola.
- Confirmación de si un test existente debería haberlo pillado
  (`unit-recetas.js` destapó el bug `hilo_a_lana`, por ejemplo).

## Cómo proponer una feature

1. Añádela como tarea `[ ]` en `TODO.md` (o discútela primero si
   está en "Fuera de alcance": redstone, dimensiones, aldeas,
   clima, cuentas, BD externa).
2. Con criterio de éxito claro y, si cambia el guardado o los IDs,
   el plan de migración/sincronización.

## Código de conducta (breve)

- Respeto y español: el idioma del repo es el español.
- No "adueñarse" de secciones del roadmap sin discutirlo; los
  cambios grandes se coordinan en el `TODO.md`.
- El objetivo es código simple, auditable y con tests, no el que
  más features tenga.
