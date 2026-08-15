# Fase 23 — Diferidos de la F22: Lush Caves, Breeze, trims, Tuff/Caliza (Spec)

> **Estado:** `[PROSPECTIVA]`

> Documento creado a partir de: `docs/Notas del usuario.md` (sección
> "Actualizaciones Minecraft 1.17 → 1.21", diferidos) y la entrevista
> 2026-08-15 (numeración acordada: **F23 = diferidos de la F22**; F24 =
> Nether Update; F25 = End Update).
> Fecha: 2026-08-15 · Proyecto: clon de Minecraft.
> Estado: **prospectiva (sin implementar)** — prerrequisito: **Fase 22
> cerrada**.

## 0. Origen (de dónde sale cada tarea)

| # | Fuente | Petición/hallazgo | Estado en TODO | Gravedad |
|---|--------|-------------------|----------------|----------|
| A1-A2 | Plan 1.17→1.21 (notas): "Fase 2 (medio plazo)" | **Cuevas frondosas (Lush Caves)**: musgo, bayas luminosas (fuente de luz), azaleas — variante de cueva que reemplaza el aire por musgo en ciertas capas | F23 A1 | 🟠 |
| A3 | Plan 1.17→1.21 §Fase 2 | **Breeze 1.21 simplificado**: dispara bolas de viento que empujan al jugador (como un esqueleto con otro proyectil) | F23 A2 | 🟠 |
| A4 | Plan 1.17→1.21 §Fase 2 | **Armor Trims**: paleta de colores en armaduras (10 tintes) por crafteo sencillo, sin NBT (solo cambiar el material/color del ítem) | F23 A3 | 🟠 |
| A5 | Plan 1.17→1.21 §Fase 2 | **Tuff y Caliza (1.21)**: bloques decorativos subterráneos | F23 A4 | 🟢 |
| A6 | Notas "Actualizaciones" §mobs | **Ajolote y cabra** (pasivos fáciles valorados "después, como la F23") | F23 A5 | 🟢 |
| B1 | F22 A1 (veredicto) + notas | **Subida de altura a 256** solo si la F22 no la hizo y los tests lo confirman | F23 B1 | 🟠 |

**Won't respetado:** los de la F22 (redstone y dependientes, Trial Chambers,
arqueología, Warden, aldeanos, clima, oxidación, renacuajos, Sniffer/
Camello) y los confirmados en las notas ("Restricciones confirmadas
(Won't de la F22)").

---

## 1. Contexto

- **Prerrequisito:** Fase 22 cerrada. Esta fase recoge **los diferidos
  declarados en la F22** (numeración acordada en la entrevista 2026-08-15:
  los contenidos 1.17-1.21 que no entraron en la F22 pasan aquí; las
  dimensiones van a F24/F25).
- **Qué hay hoy (después de F22):** mundo v6 (128 bloques, o 256 si la F22
  subió la altura), deepslate/raw ores/cobre/catalejo/skulk/rana
  implementados; `tickSpecies`/`MOB_CLASSES` de mobs; horno/crafteo
  existentes; sistema de proyectiles para el Breeze (patrón
  `server/projectiles.js`).
- **Decisiones de la entrevista:** Breeze se simplifica (solo empuje, sin
  mecánicas de viento); trims sin NBT; Lush Caves como variante de cueva;
  ajolote/cabra entran aquí (mobs pasivos); la altura 256 solo si la F22
  no la decidió y los tests confirman (si la F22 ya subió, este bloque
  queda vacío → marcado `[x]` por decisión, no por implementación).

---

## 2. Bloque A — Diferidos de contenido (F23)

### A1 — Cuevas frondosas (Lush Caves, 1.17)

- **Qué hacer:** variante de cueva subterránea (pareja a la existente):
  en ciertas capas/celdas, el aire de las cuevas profundas se decora con
  **musgo** (bloque nuevo `MOSS_BLOCK`), **bayas luminosas** (bloque
  `GLOW_BERRIES`, emisor de luz como la antorcha pero en pared/techo) y
  **azaleas** (vegetación decorativa). Reusar la detección de cuevas de
  `server/generation.js` y elegir la variante por hash 2D determinista.
- **Ficheros:** `server/constants.js` + `public/constants.js` (bloques
  nuevos B/I), `server/generation.js`, `public/texturemap.js` (teselas),
  `recetas.json` (si aplica), `tests/unit-fase23.js`, `docs/server/
  mecanicas.md`.
- **Criterio:** test determinista: con la semilla fija, ciertas cuevas
  profundas contienen musgo/bayas/azaleas; la luz de las bayas funciona
  (mismo pipe de luz que la antorcha); `unit-sync`/`unit-recetas` en verde.

### A2 — Breeze simplificado (1.21)

- **Qué hacer:** mob hostil nuevo (patrón F12/21: clase con `tickSpecies`)
  que **mantiene distancia y dispara bolas de viento** (proyectil en
  `server/projectiles.js`) que **empujan** al jugador al impactar (knockback
  por física existente); no hace daño directo o poco. Aparece en
  superficie o en estructuras acotadas (definir en la entrevista al abrir).
- **Qué no incluir:** Trial Chambers (Won't), mecánicas de viento complejas,
  que rompa bloques.
- **Ficheros:** `server/mobs.js`/`server/mob-species.js` (subclase),
  `server/projectiles.js` (proyectil), `public/mobtextures.js` (textura),
  `tests/unit-fase23.js` + `unit-paridad.js` (drops/XP).
- **Criterio:** el proyectil empuja al jugador (test de knockback) y hace
  el daño acordado; sin regresión en proyectiles existentes.

### A3 — Armor Trims (1.20, sin NBT)

- **Qué hacer:** paleta de ~10 colores/tintes para armaduras mediante
  **crafteo sencillo** (armadura + tinte/ítem = armadura del color, mismo
  slot; sin NBT: se materializa cambiando el ítem o un campo `color`
  ligero del `ItemStack` **retrocompatible** — ver nota). La textura del
  cliente pinta el tinte (reusar tintes existentes).
- **Nota de diseño:** si `ItemStack` gana un campo opcional (p. ej.
  `trim`), NO cambia el wire (JSON idéntico si es null) ni el guardado
  (v6) — verificar con `unit-persistencia`; si no es viable sin tocar el
  formato, se simplifica a ítems por color (decisión documentada en
  la entrevista al abrir).
- **Ficheros:** `server/items.js` (si aplica campo), `recetas.json`,
  `server/constants.js` + `public/constants.js` (variantes si aplica),
  `public/textures.js`/`itemicons.js`, `tests/unit-fase23.js`.
- **Criterio:** crafteo tinte→armadura funciona y el color se ve en el
  cliente; suite en verde; si toca el formato de ítem, test de
  persistencia retrocompatible.

### A4 — Tuff y Caliza (1.21)

- **Qué hacer:** dos bloques decorativos subterráneos nuevos (`TUFF`,
  `CALCITE`) generados en bolsas dentro de la piedra/deepslate (hash 2D
  determinista), B/I sincronizados + tesela + receta si aplica.
- **Ficheros:** `server/constants.js` + `public/constants.js`,
  `server/generation.js`, `public/texturemap.js`, `tests/unit-fase23.js`.
- **Criterio:** test determinista de generación; `unit-sync` en verde.

### A5 — Ajolote y cabra (mobs pasivos fáciles)

- **Qué hacer:** **ajolote** (pasivo acuático, decorativo, aparece en
  cuevas de agua/lush caves) y **cabra** (pasivo de montaña, embiste al
  jugador como mecánica distintiva — daño o empuje acotado). Patrón F12/21:
  subclase con `tickSpecies`, `MOB_PARTS` + textura, drops/XP en
  `unit-paridad`, spawn por bioma (`BIOME_SPAWN`).
- **Ficheros:** `server/mobs.js`/`server/mob-species.js`,
  `server/mob-spawn.js`, `public/mobtextures.js`, `server/constants.js`
  + `public/constants.js` (tipos si aplica), `tests/unit-fase23.js`.
- **Criterio:** cada mob con su mecánica (ajolote en agua, cabra embiste)
  con test; sin regresión en mobs existentes.

---

## 3. Bloque B — Altura del mundo (solo si la F22 no la subió)

- **Qué hacer:** si la F22 A1 decidió **mantener 128**, este bloque evalúa
  de nuevo la subida a **256 (Y −64..191)** con el mundo ya enriquecido
  (profundidad de F22): medición de generación/greedy/worker/LOD y
  recalibración de minerales (`unit-paridad`), niebla y `audit-altura`.
  **Solo se sube si los tests lo confirman**; si no, se documenta el
  veredicto y el límite se mantiene.
- **Si sube:** `SCHEMA_VERSION` 7 + migración v6→v7 retrocompatible + test
  (modelo `tests/unit-persistencia.js`) + recalibración de las auditorías
  de generación (las F22/F23 ya asumen el rango vigente).
- **Criterio:** veredicto con datos en la spec; suite en verde; si la F22
  ya subió, el bloque se cierra por decisión (anotado en TODO).

---

## 4. Cierre y auditoría de la Fase 23 (tarea obligatoria)

1. Suite unitaria completa en verde (incluidos `unit-fase23.js`, `unit-sync`,
   `unit-recetas`, `unit-paridad`, `unit-mundo`), E2E clásicos + menú,
   `node --check` y `biome check` 0 errores.
2. Auditorías por fase sin regresiones (`audit-fase4` de generación;
   `audit-altura` recalibrada si cambió la altura).
3. Verificación manual en navegador: explorar una lush cave (musgo/bayas
   con luz), enfrentar un breeze (empuje), craftear una armadura con tinte,
   encontrar tuff/caliza, ver ajolote en agua y cabra en montaña.
4. `SCHEMA_VERSION` 7 con migración + test SOLO si B1 subió; si no, 6
   intacto.
5. Docs al día: `docs/server/mecanicas.md`, `docs/README.md` (índice),
   `AGENTS.md` (estado), `TODO.md` (F23 cerrada).

---

## 5. Criterios de aceptación (resumen)

1. Lush Caves generan con musgo, bayas luminosas (luz real) y azaleas de
   forma determinista (test).
2. Breeze dispara bolas de viento que empujan al jugador (test de
   knockback) sin regresión en proyectiles.
3. Armor Trims crafteables con tintes (sin NBT; retrocompatible si toca
   el formato de ítem — `unit-persistencia` en verde).
4. Tuff/Caliza y ajolote/cabra generan/aparecen con su test y
   sincronización B/I + receta/icono completos.
5. Altura: veredicto documentado; 256 solo si tests lo confirman, con
   `SCHEMA_VERSION` 7 + migración + test; si no, 6 intacto.
6. Cierre con suite/E2E/auditorías en verde, tests específicos de la fase
   (`unit-fase23.js`) verdes, docs al día y Won't de la F22 respetado.

> **Tests que cubren esta fase (previstos):** `tests/unit-fase23.js`, `tests/audit-fase23.js`.

---

## Cambios en esta spec

**Cambios en esta spec (v1):**
- 2026-08-15: creación del spec (documento de planificación de la fase 23).