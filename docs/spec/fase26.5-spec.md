# Fase 26.5 — Pociones y efectos de estado (Spec)

> **BORRADOR** — prerrequisito: Fase 26 (Encantamientos) cerrada — no por
> dependencia técnica dura, sino porque comparten patrón de UI/inventario
> y conviene no tener dos sistemas grandes de progresión abiertos a la
> vez. También depende de la Fase 24 (Nether) ya cerrada, porque varios
> ingredientes son del Nether (polvo de blaze, lágrimas de ghast).
> Documento creado a partir de la misma propuesta externa que
> `fase26-spec.md`, dividida por las razones ahí explicadas.
> Actualizado 2026-08-20 (entrevista): alineado con el catálogo mínimo
> de encantamientos de F26 y el orden F29→F26→F27→F28.
> Estado: prospectiva.

## 0. Origen

| # | Fuente | Contenido | Recorte aplicado |
|---|--------|-----------|-------------------|
| A | Propuesta externa, "Fase 26" | Mesa de pociones, ingredientes del Nether, pociones de curación/fuerza/resistencia/caída lenta | Se mantiene |
| B | Propuesta externa | "Simplificar a duración fija" (sin niveles ni duración variable) | Se mantiene — es el recorte correcto para no multiplicar el catálogo |
| C | Propuesta externa | "Sistema de efectos... sincronizado con el cliente" | Se mantiene — necesario para que el HUD refleje el efecto activo |

## 1. Contexto

- **Depende de Fase 24 (Nether)** para varios ingredientes reales
  (polvo de blaze, lágrimas de ghast) — si esos ítems no existen todavía
  cuando se llegue a esta fase, hay que confirmarlo antes de empezar el
  Bloque B.
- El sistema de efectos de estado (Bloque C) es el más delicado: toca
  física del jugador (velocidad, caída lenta) y combate (fuerza,
  resistencia, veneno) — necesita tests que crucen con lo que ya existe
  de física y combate, no solo tests aislados del efecto.
- Recorte explícito ya decidido en la propuesta original: duración fija
  por poción (no hay pociones "mejoradas" ni "extendidas" con distinta
  duración/potencia) — mantenerlo, es lo correcto para el tamaño de esta
  fase.

## 2. Bloque A — Mesa de pociones (alquimia)

- [ ] Bloque `brewing_stand`, craftable (receta: vara de blaze + adoquín,
      como en Minecraft real).
- [ ] UI: 3 slots de poción + 1 de ingrediente + combustible (vara de
      blaze) — mismo patrón visual que horno/mesa de crafteo ya
      establecido en Fase 19.
- [ ] Poción base: "poción incómoda" (agua + verrugas del Nether) como
      punto de partida obligatorio antes de añadir el ingrediente que
      define el efecto — igual que en Minecraft real.

## 3. Bloque B — Catálogo de pociones (recortado, duración fija)

- [ ] Curación (instantánea, restaura salud de golpe)
- [ ] Fuerza (más daño en combate, duración fija)
- [ ] Resistencia (menos daño recibido, duración fija)
- [ ] Caída lenta (reduce daño y velocidad de caída, duración fija)
- [ ] Veneno (daño gradual, duración fija) — versión ofensiva, se puede
      lanzar como poción arrojadiza (ver Bloque D) o beber por error
- [ ] **Explícitamente fuera de esta lista inicial:** pociones de
      invisibilidad, visión nocturna, salto, lentitud del enemigo,
      cualquier variante "mejorada"/"extendida" — quedan para una fase
      futura si se decide ampliar el catálogo.

## 4. Bloque C — Sistema de efectos de estado

- [ ] Estructura de datos de "efecto activo" por jugador (tipo, tiempo
      restante), sincronizada del servidor al cliente.
- [ ] Cada efecto modifica exactamente un punto ya existente del cálculo
      (velocidad de movimiento, daño infligido, daño recibido, velocidad
      de caída) — no se crean rutas de cálculo paralelas, se insertan
      como multiplicador/modificador en las que ya existen.
- [ ] HUD: iconos de efectos activos con tiempo restante, reutilizando el
      lenguaje visual ya establecido en la Fase 19 (tooltips, iconos).

## 5. Bloque D — Pociones arrojadizas (opcional, evaluar alcance)

- [ ] Decidir explícitamente si se incluye la variante arrojadiza
      (afecta a otros jugadores/mobs en un radio) o si esta fase se
      limita a pociones bebibles — es una fase de físicas de proyectil
      adicional (parecido a la flecha del esqueleto o el tridente ya
      existentes) que puede recortarse sin perder el valor central del
      sistema de pociones.

## 6. Bloque E — Tests y documentación

- [ ] Test unitario por cada poción del catálogo: efecto aplicado,
      duración correcta, expiración correcta.
- [ ] Test de interacción efecto × combate (p. ej. Fuerza + arma
      encantada de la F26 no deben multiplicarse de forma incorrecta).
- [ ] Test de interacción efecto × física (Caída lenta reduce el daño de
      caída ya calculado, no crea una ruta de daño paralela).
- [ ] Actualizar `docs/server/mecanicas.md`, `TODO.md`, esta spec.

## 7. Fuera de alcance de esta fase

- Pociones listadas como excluidas en el Bloque B.
- Duración variable/niveles de poción (recorte ya decidido).
- Cualquier "Fuera de alcance" ya establecido del proyecto.

## 8. Criterios de aceptación

- Catálogo del Bloque B completo, cada poción con test de aplicación y
  expiración.
- Los efectos de estado se integran en los cálculos existentes de
  combate/física sin rutas paralelas — verificado explícitamente en la
  auditoría de cierre.
- Suite unitaria + E2E en verde, `biome check` 0 errores.
- Auditoría de Fase 26.5 obligatoria antes de cerrar.
