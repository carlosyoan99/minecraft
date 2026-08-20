---
name: notas-del-usuario
description: List of bugs identified during real-world gameplay sessions and suggested improvements for the next phases
---

# Notas del usuario

Auditoría manual del usuario tras probar el juego. **Este documento es la
fuente de los pendientes abiertos**: los bugs resueltos y las mejoras ya
implementadas (o incluidas en una spec de fase) se eliminan de aquí y viven
en la spec de su fase. El estado de cada ítem se verifica contra el código
antes de marcarlo resuelto; lo que queda pendiente se planifica en las
secciones de abajo.

---

## Bugs abiertos (sin fase asignada)

> Bugs detectados en sesiones reales que **aún no están en ninguna spec**.
> Son candidatos a la siguiente iteración v21.x (mecánica de generación del
> mundo) — se planifican en la entrevista del planificador.

- **Ríos demasiado altos:** por lo general están mucho más arriba del nivel
  del mar, por lo que no generan agua (o casi no lo hacen) y parecen un bug
  de generación. El agua debe mantenerse al nivel del mar, adaptando el
  terreno alrededor de los ríos. Disminuir el número de ríos sin que se
  note mucho el cambio, variar entre anchos y estrechos y aumentar un poco
  su profundidad.
- **Océanos poco profundos:** aumentar la profundidad de los océanos y
  permitir **océanos cálidos con corales** y **océanos profundos**. No
  aumentar la probabilidad de que aparezca un océano.
- **Montañas bajas:** montañas más altas y **montañas nevadas** (los picos
  nevados de la F21 A2 existen como sub-bioma, pero las montañas base
  siguen bajas para el gusto del usuario).
- Las cabezas de los mobs y jugadores muestran caras por todos sus lados.

---

## Mejoras pendientes (sin fase asignada)

> De la lista original, **solo lo no implementado** (verificado contra el
> código y las specs). Lo implementado se eliminó: la lista completa con el
> estado histórico vive en las specs de cada fase.

### Biomas (F21 A2 — el resto de superficie queda para P1)

De los 20 biomas de las notas, **ya existen**: llanura, desierto, bosque,
taiga, tundra nevada (`snow`), montañas, pantano, jungla, océano (9 de la
F11) + **bosque de abedules, taiga de árboles gigantes y picos nevados**
(sub-biomas de la F21 v21.1, `426efbf`). Pendientes:

| Bioma | Estado |
|---|---|
| Sabana (acacias) | P1 (F21 §5.2) — si reusa bloques existentes |
| Badlands (terracota) | P1 — requiere bloque terracota o reuso documentado |
| Isla de champiñones (micelio) | P1 — requiere micelio |
| Bosque oscuro (roble oscuro denso) | P1 |
| Cuevas de Lush | P1 — requiere bayas luminosas (bloques nuevos B/I) |
| Cuevas de Dripstone | P1 — requiere dripstone (bloques nuevos B/I) |
| Nether Wastes / El End | F24 / F25 (dimensiones) |

### Estructuras (F21 B1/B2 — P1; el resto en su fase)

**Ya existen:** minas abandonadas (F7), pozos de agua/lava (F7), templo de
la jungla y naufragio (F12), **pozo del desierto** (F21 v21.1). Pendientes:

| Estructura | Estado |
|---|---|
| Pirámide del desierto (trampa TNT + cofres) | P1 (F21 B2, diferida) |
| Cabaña del pantano, puesto de saqueadores, fortaleza, ruinas/monumento oceánico | P1 (F21 B2) |
| Mansión del bosque | P1 — fuera de la fase si el presupuesto no da |
| Iglú (solo edificio) | P1 (F21 B1) |
| Geoda de amatista | P1 — reusa bloques de la F22 (B1) |
| Fortaleza del Nether / Restos de Bastión | F24 (Nether) |
| Ciudad del End / barco con élitro | F25 (End, sin dragón → ciudad diferida) |
| Aldeas, Ciudad Antigua | **Won't** (sin aldeanos) |

### Mobs (F21 C1/C2 — P1; el resto Won't o en su fase)

**Ya existen:** zombi, esqueleto, creeper, araña, lobo (domable), conejo,
slime, ocelote→gato, ahogado, oveja (esquileo), pollo, **vaca (ordeñable)**
y **gallina (ponedora)** (F21 v21.1). Pendientes:

| Mob | Estado |
|---|---|
| Pulpo (tinta) | P1 (F21 C1) |
| Enderman (neutralidad + teletransporte) | P1 (F21 C2, diferido) |
| Zombified piglin (efecto dominó) | P1 (F21 C2) / F24 (Nether) |
| Abeja (poliniza, pica y muere; colmena) | P1 (F21 C2) — colmena en F21.5 B4 |
| Araña de día neutral / de noche hostil | P1 (F21 C3) |
| Creeper huye de gatos / esqueleto strafe / zombi convoca | P1 (F21 C3) |
| Oveja come pasto (regenera lana) | P1 (F21 C1) |
| Rana, ajolote, cabra | F22/F23 |
| Ghast, blaze, magma cube | F24 (Nether) |
| Endermite | F25 (End) |
| Aldeano, gólem de hierro, gólem de nieve, gólem de cobre, Wither, Dragón del End | **Won't** |

### Mundo

- **Altura −64..255** (MC −64..320): limitación temporal por rendimiento.
  Subir la altura permite mejores cuevas y montañas más grandes. →
  **Fase 22 (A1)**: subir a 256 solo si los tests lo confirman
  (`SCHEMA_VERSION` 7 + migración); si no, se mantiene 128.

---

## Pendientes de seguridad y robustez (gaps reales)

> La lista completa de preguntas de la auditoría quedó respondida en
> `docs/server/seguridad.md` y la auditoría SEC de la Fase 16 (spec §4).
> **Cierre 2026-08-17:** 5 de los 6 gaps quedaron verificados como ya
> cubiertos o cerrados (ver `docs/server/seguridad.md`); el único abierto
> es la simulación de condiciones extremas:

| Gap | Estado | Dónde se cubre |
|---|---|---|
| Validación del header `Origin` (CSWSH) | ✅ cerrado | `verifyClient` + allowlist en `server/timers.js` (M1 de la auditoría 2026-08-15) |
| Tope de tamaño del JSON por mensaje | ✅ cerrado (2026-08-17) | `MAX_MSG_BYTES` (64 KiB) en `server/constants.js` + guard en `net.js` (descarta sin mutar estado; test en `unit-red.js`) |
| Anti-spam de construcción | ✅ cubierto | `MAX_ACTION_RATE` (20/s) por acción: `block_action` place/break, chest, horno, chat — ventanas consecutivas (F20 D2) |
| Resiliencia a ráfagas de `move` | ✅ cubierto | `MAX_MSG_RATE` (30/s) global + rate-limit por ventanas consecutivas; el coste acumulado se mide en `unit-perf-server.js` |
| Timeout de generación de chunk | ✅ acotado | Generación ~1-5 ms/chunk con topes de llenado y cola asíncrona; el perfilado en vivo (auditoría 2026-08-15 §perfilado) decide si hace falta un timeout real |
| Modo debug de condiciones extremas (N jugadores, chunks corruptos) | ⚪ **abierto** | No existe; `LOG_LEVEL=debug` + `OPS` + CDP (`audit-fase7`) cubren diagnósticos puntuales, no la simulación de carga — pendiente de planificar (F20 v20.3 o backlog) |

---

## Fuente histórica

Los ítems resueltos que se eliminaron de este documento (con su fase y
verificación) están documentados en las specs: **bugs** → Fase 16 (niebla
submarina, cofres Shift, IA, calidad gráfica, desconexión, flor/hierba,
chunks vacíos, cuevas largas, mobs en creativo, semilla nueva, minado
continuo), **F17** (persistencia de inventario, menú, móvil, skins),
**F20** (`#menu-bg` D1, desconexión al cargar D2) y **F21 v21.1**
(sub-biomas, pozo del desierto, vaca/gallina); **mejoras** → F13 (POO),
F17 (menú, skins, persistencia cliente, pantalla completa, móvil), F19
(texturas/iconos, interfaces, drag & drop), F19.5 (música por bioma) y
F19.6 (motor 3D); **plan del usuario 1.17→1.21** → F22-F23; **dimensiones**
→ F24-F25; **seguridad** → F16 (SEC-1..SEC-4) y F20 (rate-limit, CI 20).
