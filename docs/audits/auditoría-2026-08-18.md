# Informe final — Actualización, auditoría de paridad y estrategia de ramas

**Fecha:** 2026-08-18 · **Commit auditado:** `b4514ab` (2026-08-17, tras
`git pull origin main`) · **Fase activa en el repo:** 21.5 (recién abierta,
sin trabajo implementado todavía). No se modificó código — todo lo de
abajo es hallazgo/recomendación.

---

## 1. Actualización desde GitHub

`git pull` trajo la Fase 21 completa (biomas ampliados, estructuras
nuevas, más mobs) y el arranque de la 21.5, más varios módulos nuevos:
`server/ratelimit.js`, `public/torchlights.js`/`torchlogic.js`,
`public/materialstyle.js`, `public/telemetry.js`, un service worker
(`public/sw.js` + `manifest.webmanifest`), y **Three.js ahora se sirve en
local** (`public/vendor/three.module.js` +
`vendor/addons/controls/PointerLockControls.js`) en vez de por CDN — esto
resuelve por sí solo el ítem de seguridad que quedó pendiente en el
backlog de la Fase 20 (CSP+SRI del CDN de Three.js: al no depender de un
CDN externo, ese riesgo desaparece).

**Salud verificada de forma independiente** (no solo confiando en
`STATUS.md`):

| Chequeo | Resultado |
|---|---|
| `npm install` | ✅ limpio |
| Sintaxis (`node --check`) en `server/`+`public/` | ✅ sin errores |
| `npm run lint` (biome) | ✅ 0 errores, 8 warnings |
| `npm audit` | ✅ 0 vulnerabilidades |
| Arranque del servidor | ✅ sirve `/` correctamente |
| Suite unitaria | ⚠️ **60/61** — ver hallazgo 2.1 |

## 2. Hallazgos

### 2.1 — Bug real: `tests/unit-biomas.js` crashea (no es solo un fallo de aserción)

`STATUS.md` afirma "suite 61/61". En una ejecución limpia desde este pull
obtuve **60/61**: `unit-biomas.js` no falla una comprobación, **lanza una
excepción y aborta todo el archivo**:

```
ReferenceError: birchLogs is not defined
    at tests/unit-biomas.js:218
```

Causa: en la línea 218 se hace `birchLogs++`, pero esa variable nunca se
declara — solo se declaran `giantSpruceLogs`, `spruceLogs`,
`birchLogInBirch` y `giantLogInGiant` unas líneas antes. Revisé el resto
del archivo: `birchLogs` **no se usa en ninguna aserción posterior**, solo
`birchLogInBirch`. Es casi con certeza un resto de una versión anterior
del test (antes de consolidarse en `birchLogInBirch`) que quedó sin
limpiar. Fix trivial: borrar esa línea suelta (o declararla si en algún
momento se pensaba usarla, pero no hay evidencia de eso en el resto del
archivo). Esto **no es un bug de producto** — el juego funciona igual —
pero sí bloquea que la suite pase limpia desde un clon fresco, que es
justo la garantía que `STATUS.md` afirma sostener.

### 2.2 — Confirmación: los dos hallazgos de la auditoría anterior ya están corregidos

- El comentario de `server/tnt.js` que afirmaba "knockback" sin
  implementarlo: **ahora sí está implementado** (evento `knockback` real
  emitido a los clientes, `server/tnt.js` línea ~130). Hallazgo cerrado.
- La redacción de `TODO.md` § "Fuera de alcance" para dimensiones: **ya
  tiene el matiz condicional** ("Won't hasta después de la Fase 20/21...
  Fase 24 Nether y Fase 25 End las desbloquean"). Hallazgo cerrado.

### 2.3 — Posible contenido faltante sin marcar: el pulpo/calamar

La propia tabla de origen de la Fase 21 (`docs/spec/fase21-spec.md`,
bloque C1-C5) lista **pulpo** entre los mobs "viables sin desbloquear
Won't" (junto a vaca, gallina, enderman, zombified piglin, abeja).
`STATUS.md` marca C1/C2/C3 como cerrados. Busqué `squid`/`pulpo`/`octopus`
en todo `server/`, `public/` y `tests/` y **no encontré ninguna
implementación real**. Puede ser que se haya descartado a propósito al
implementar (recorte de alcance legítimo), pero si es así no quedó
reflejado en `STATUS.md`/`TODO.md` — vale la pena confirmarlo
explícitamente en la próxima actualización de esos documentos, para que
no parezca un pendiente huérfano en una futura auditoría.

## 3. Auditoría de paridad con Minecraft (muestra sobre lo nuevo de la Fase 21)

No repetí la paridad de mecánicas ya auditadas en pasadas anteriores
(hambre, XP, armadura, durabilidad — siguen sin cambios). Me enfoqué en
lo que trajo la Fase 21:

| Mecánica | Comportamiento real de Minecraft | Comportamiento actual | Paridad |
|---|---|---|---|
| Ordeñar vaca | Clic derecho con cubo vacío → cubo de leche, sin límite de usos, sin cooldown | Igual: consume el cubo, entrega leche, sin cooldown (`handleMilkCow`) | ✅ Fiel |
| Puesta de huevos de gallina | Cada 5-10 min, el huevo **cae al suelo** en la posición de la gallina — cualquiera lo recoge caminando encima | Cada 5-10 min (intervalo correcto), pero el huevo se **entrega directo al inventario** del jugador más cercano dentro de un radio — no existe el ítem físico en el suelo | ⚠️ Diverge — es una simplificación de diseño válida, pero cambia la jugabilidad (no hay "recoger", no pueden competir varios jugadores por el huevo, ni un mob pisarlo) |
| Pozo del desierto | Estructura pequeña sin cofre, marca de agua en el desierto | Implementado como estructura pequeña sin loot, gate de generación en desierto firme | ✅ Fiel en concepto |
| Mob "viable" pulpo/calamar | Pasivo de agua, suelta tinta al morir | No implementado (ver 2.3) | ❌ Ausente |

**Conclusión de paridad:** lo que se implementó de la Fase 21 es fiel en
mecánica y timing donde lo comparé; la única divergencia real es de
diseño consciente (huevo directo a inventario en vez de ítem físico en el
suelo) — no es un bug, pero si la paridad estricta importa, es un
candidato a ajustar en una fase de pulido futura (no urgente).

## 4. ¿Conviene trabajar Nether y End en ramas separadas de `main`?

**Sí, específicamente para estas dos fases — no como regla general para
todo el proyecto.** Razonamiento:

**A favor de ramas para Nether/End:**
- Son, en términos de alcance, comparables a "actualizaciones" enteras
  del juego real (así las nombran ustedes mismos: "Nether Update", "End
  Update") — muy por encima del tamaño de cualquier fase hecha hasta
  ahora (Fase 19→19.5→19.6→20→21 se cerraron en apenas un par de días
  cada una). Es razonable esperar que Nether/End tomen bastante más
  tiempo, lo que amplía la ventana en la que `main` estaría en un estado
  a medias si se trabaja directo ahí.
- `main` es lo que efectivamente se juega/despliega (venimos hablando de
  cómo publicarlo) — mantenerlo siempre en estado jugable tiene valor
  práctico, no solo teórico.
- Si durante el desarrollo de Nether/End aparece un bug urgente en lo ya
  publicado, una rama separada permite arreglarlo y desplegarlo sin
  arrastrar código de dimensiones a medio construir.
- No cuesta casi nada extra: ya cierran cada fase con un tag (`v20.2`,
  `v21.2`) solo cuando la suite y la auditoría están en verde — un merge
  a `main` en ese mismo punto es exactamente ese mismo criterio, solo que
  con la rama como capa de aislamiento mientras tanto.

**En contra / matiz:**
- Ninguna fase anterior (0-21) se trabajó en rama separada — es un
  cambio de flujo de trabajo, no la continuación de un patrón ya
  establecido; vale la pena que sea una decisión consciente, no
  automática.
- Dado que el proyecto ya trabaja **una sola fase activa a la vez** (per
  `STATUS.md`), no hay riesgo real de conflictos de merge por desarrollo
  paralelo — el beneficio de la rama es casi puramente el de "aislar lo
  inestable", no el de coordinar trabajo simultáneo.

**Recomendación concreta de flujo:**
1. Una rama por fase: `fase24-nether`, luego `fase25-end` — no las dos a
   la vez, dado que la propia `DEPENDENCIAS.md` ya exige F24 cerrada
   antes de F25.
2. Trabajar en la rama con la misma disciplina ya usada (spec → bloques →
   tests → auditoría `--audit`).
3. Fusionar a `main` **solo** en el mismo punto en que hoy se corta el
   tag de cierre de fase (`v24.x`) — el merge y el tag pueden ser el
   mismo commit.
4. Si aparece la necesidad de un hotfix en `main` mientras la rama sigue
   abierta, se hace directo en `main` y luego se hace `merge`/`rebase`
   de `main` sobre la rama de la fase para no perder el fix.

## 5. Recomendaciones finales

1. Borrar (o declarar) `birchLogs` en `tests/unit-biomas.js:218` — bug
   trivial, pero bloquea la promesa de "suite verde desde un clon
   limpio".
2. Confirmar y documentar explícitamente si el pulpo/calamar se descartó
   a propósito de la Fase 21 o sigue pendiente sin marcar.
3. (Opcional, no urgente) Evaluar si el huevo de gallina debería caer al
   suelo en vez de ir directo al inventario, por fidelidad a Minecraft —
   bajo impacto, se puede dejar para una fase de pulido.
4. Adoptar ramas separadas para Fase 24 (Nether) y Fase 25 (End),
   fusionando a `main` solo al cerrar cada una — ver flujo concreto en
   §4.

## 6. Conclusión

El proyecto sigue en muy buen estado tras la actualización: 0
vulnerabilidades, lint limpio, servidor estable, y los dos hallazgos de
la auditoría anterior ya resueltos. El único hallazgo nuevo de peso es el
bug trivial en el propio test de biomas (no en el juego), más una
posible laguna de contenido sin documentar (pulpo). Para Nether y End,
trabajar en ramas separadas es una recomendación razonable dado el
tamaño esperado de esas fases y el hecho de que `main` es lo que realmente se juega — no hace falta aplicarlo retroactivamente a nada ya hecho.
