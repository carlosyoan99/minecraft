# Fase 1 — Cimientos técnicos (Spec)

> Documento de especificación de la Fase 1, **reconstruido a posteriori**: la
> fase está COMPLETADA y auditada. Se elabora a partir del `TODO.md` (sección
> Fase 1 con su auditoría) y del historial de git, en el mismo formato que
> `fase8-spec.md` / `fase9-spec.md`. Documenta el diseño, las decisiones y el
> **resultado verificado** de la fase — no es un plan de ejecución pendiente.
>
> Fecha: 2026-08-06 · Estado: **COMPLETADA (agosto 2026)** · Proyecto: clon de
> Minecraft (servidor Node autoritativo `server/` + cliente Three.js
> `public/`, todo en español).

---

## 1. Resumen

La Fase 1 sienta los **cimientos técnicos** para que la base entregada en la
Fase 0 escale antes de seguir sumando características. Cuatro preocupaciones:

1. **Guardado incremental por chunk** — sustituir el único `world.dat` por un
   archivo por chunk, para que el mundo crezca sin reescribir todo en cada
   autosave.
2. **Versionado del formato de guardado** (`schemaVersion`) con migración
   explícita de mundos ya guardados — la integridad de datos es prioridad del
   proyecto (CLAUDE.md).
3. **Descarga de chunks lejanos** — el servidor deja de mantener en memoria
   chunks sin jugadores cerca y el cliente hace `dispose()` de la geometría
   fuera de rango; sin esto el mundo crece sin límite en memoria.
4. **Modularización** de `client.js` y `server.js` en módulos por
   responsabilidad — el código crece y un solo archivo de entrada deja de
   ser mantenible.

**Resultado:** la fase se cerró con auditoría en verde: 3 ciclos
guardar/cargar sin corrupción (169 chunks válidos, `schemaVersion` 2),
memoria del servidor acotada (439 → 65 chunks en memoria tras la descarga,
524 en disco sin pérdida) y test funcional WS 9/9.

---

## 2. Contexto del proyecto (estado al inicio, verificado)

Base entregada (Fase 0, commit `0a44414`):

- **Servidor autoritativo** (Express + `ws`) con validación de movimiento y
  acciones de bloque.
- **Generación de mundo** por chunks con biomas (llanura, bosque, desierto)
  vía simplex-noise con semilla fija.
- **IA de mobs** con máquina de estados (zombie, creeper, esqueleto,
  enderman, pasivos).
- **Crafteo** por patrón 3×3 desde `recetas.json` y **horno** con combustible
  desde `recetas_horno.json`.
- **Persistencia completa** del mundo cada 30 s en un único archivo
  (`world.dat`).
- **Cliente Three.js vanilla** con física básica (colisión, gravedad, salto)
  y culling de caras correcto entre chunks.

**Problemas que motivaban la fase:** el guardado único no escala (reescribe
todo el mundo en cada autosave), la memoria del servidor crece con cada chunk
generado sin liberarse, y el cliente y el servidor son archivos únicos que
crecen sin estructura.

---

## 3. Objetivos

1. Que el guardado y la carga sean **por chunk** (incrementales), con
   **versionado** y migración de mundos antiguos.
2. Que el servidor **descargue** chunks sin jugadores cerca y el cliente
   libere su geometría fuera de rango (memoria acotada en ambos lados).
3. Que `client.js` y `server.js` pasen a ser **entradas mínimas** que solo
   cablean módulos por responsabilidad.
4. Cerrar con **auditoría**: guardar/cargar repetido sin corrupción, medición
   de memoria y revisión de imports rotos/código muerto.

---

## 4. Bloques de trabajo

### B1. Guardado incremental por chunk

Reemplazar el `world.dat` único por **un archivo por chunk** (o por región).
Cada chunk guarda sus bloques editados; la generación procedural no se
persiste (se regenera de forma determinista desde la semilla). El autosave
solo escribe los chunks con cambios.

Decisiones de diseño (persisten hoy):

- Clave de chunk `cx,cz` **consistente entre `world.js` y `save.js`** (misma
  convención de coordenadas); la regla la audita `tests/unit-persistencia.js`.
- Directorio `world/<semilla>/chunks/` (ver Fase 6 para el layout por
  semilla) + meta en `world.json`.

### B2. Versionado del formato de guardado

- Nueva constante `SCHEMA_VERSION` (actualmente **2**; la Fase 9 la subirá a
  3).
- **Ruta de migración explícita** para mundos ya guardados: al cargar, si la
  versión es anterior, se migra en lugar de fallar o perder datos.
- Constantes del layout en `server/constants.js`: `WORLD_DIR` (por semilla),
  `CHUNKS_DIR`, `META_FILE`, `LEGACY_FILE`; el layout antiguo se migra con
  `save.migrateWorldLayout()`.

### B3. Descarga de chunks lejanos

- **Servidor:** deja de mantener en memoria chunks sin jugadores cerca (los
  conserva en disco). Medido en la auditoría: 439 chunks en memoria → 65 tras
  la descarga, 524 en disco sin pérdida.
- **Cliente:** `dispose()` de la geometría de chunks fuera de rango de
  render (desde entonces evolucionó: pool de geometrías en la Fase 6).

### B4. Modularizar el cliente

`public/client.js` (13 líneas hoy) pasa a ser solo una entrada que importa
módulos ES6 por responsabilidad, con `constants.js`, `scene.js`,
`connection.js` e `input.js` existiendo también para **evitar ciclos de
import**:

- `network.js` (WS, eventos) · `world.js` (chunks/terreno) · `player.js`
  (física/cámara) · `mobs.js` (mobs) · `ui.js` (HUD/paneles) · `scene.js`
  (renderer/cámara/controls) · `connection.js` · `input.js` (entrada) ·
  `constants.js`.

### B5. Modularizar el servidor

`server.js` pasa a ser entrada mínima que conecta los hooks de broadcast
(evita ciclos de require); la lógica vive en módulos CommonJS:

- `world.js` (generación) · `mobs.js` (IA) · `crafting.js` (recetas/horno) ·
  `net.js` (handlers WS) · `constants.js` · `state.js` (estado global) ·
  `players.js` (jugador/física/inventario) · `save.js` (persistencia).
- `net.js` exporta `handleConnection` para poder ejercitar todos los handlers
  con un `ws` fake sin abrir puerto (patrón de `tests/unit-red.js`).

### B6. Auditoría de Fase 1

Probar guardar/cargar varias veces seguidas sin corrupción; medir memoria del
servidor con varios chunks generados y un jugador moviéndose; confirmar que
no hay imports rotos ni código muerto tras la modularización.

---

## 5. Fuentes de verdad sincronizadas (introducidas aquí)

- **Formato de guardado:** `SCHEMA_VERSION`, `WORLD_DIR`, `CHUNKS_DIR`,
  `META_FILE`, `LEGACY_FILE` en `server/constants.js` (verificado por
  `tests/unit-persistencia.js`).
- **Convención WS:** eventos en `snake_case` (`block_action`,
  `furnace_state`, ...), establecida desde la base y ratificada en CLAUDE.md.

---

## 6. Archivos implicados

| Archivo | Cambio |
| --- | --- |
| `server/save.js` | persistencia por chunk, `schemaVersion`, migración del layout antiguo |
| `server/constants.js` | `SCHEMA_VERSION`, rutas del layout |
| `server/world.js`, `server/mobs.js`, `server/crafting.js`, `server/net.js`, `server/state.js`, `server/players.js` | extracción desde `server.js` (modularización) |
| `server.js` | entrada mínima que cablea hooks de broadcast |
| `public/network.js`, `world.js`, `player.js`, `mobs.js`, `ui.js`, `scene.js`, `connection.js`, `input.js`, `constants.js` | extracción desde `client.js` (modularización) |
| `public/client.js` | entrada mínima (imports) |
| `tests/unit-persistencia.js`, `tests/unit-red.js` | persistencia + handlers WS con `ws` fake |
| `public/index.html` | favicon añadido de paso |

---

## 7. Decisiones del proyecto

| # | Tema | Decisión |
|---|------|----------|
| 1 | Formato de guardado | Archivos por chunk + `schemaVersion`; nunca silenciar un error de lectura/escritura sin loggearlo |
| 2 | Migración | Retrocompatible y explícita (`migrateWorldLayout`); el layout antiguo de `world/` se migra al arrancar |
| 3 | Arquitectura | Cliente ES modules (`import`), servidor CommonJS (`require`); entradas mínimas; módulos por responsabilidad |
| 4 | Servidor autoritativo | Toda validación/física/inventario vive en el servidor; el cliente solo predice y dibuja |
| 5 | Alcance | Sin BD externa: la escalabilidad del guardado se resuelve con archivos por chunk (no cambiar de paradigma) |

---

## 8. Plan de la Fase 1 (orden de ejecución)

1. Guardado incremental por chunk (B1).
2. Versionado + migración (B2).
3. Descarga de chunks lejanos en servidor y cliente (B3).
4. Modularización del cliente (B4) y del servidor (B5).
5. Auditoría (B6) + limpieza de código muerto detectada.

---

## 9. Riesgos y notas

- **Clave de chunk inconsistente** entre `world.js` y `save.js` provoca chunks
  que no guardan/cargan — verificado por tests desde esta fase.
- **Cambiar el formato de guardado** exige subir `schemaVersion` + migración
  retrocompatible + test (modelo `unit-persistencia.js`); cualquier fase
  posterior que toque el formato debe seguir esta regla.
- **Los tests de servidor no ejercitan el render**: un refactor del cliente
  podía romper el render sin que los tests lo detectaran (lección que se
  repetiría en la Fase 4).
- Limpiezas de paso documentadas: drop no-op en `attack_mob` (código muerto)
  y un key malformado en `furnace_action` close, corregidos durante la fase.

---

## 10. Criterios de aceptación + resultado verificado

1. Guardar/cargar el mundo repetidamente **sin corrupción**.
2. `schemaVersion` presente y mundos viejos migrados.
3. Memoria del servidor acotada (descarga de chunks lejanos) y cliente sin
   geometría de chunks fuera de rango.
4. Sin imports rotos ni código muerto tras la modularización.

**Estado: COMPLETADA.** Auditoría (agosto 2026): 3 ciclos guardar/cargar sin
corrupción (169 chunks válidos, `schemaVersion` 2); memoria del servidor
acotada (439 → 65 chunks en memoria tras descarga, 524 en disco sin pérdida);
test funcional WS 9/9 (todos los handlers); revisión de código aprobada. De
paso: limpieza de código muerto en `net.js` y key malformado en
`furnace_action`, y favicon en `index.html`.
