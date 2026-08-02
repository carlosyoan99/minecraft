# TODO.md — Roadmap por fases

Cada fase se marca completa solo cuando **todas** sus tareas están
hechas, incluyendo la auditoría final. No saltar de fase sin
cerrar la anterior.

Leyenda: `[ ]` pendiente · `[x]` hecho

---

## Fase 0 — Base entregada
- [x] Servidor autoritativo (Express + ws) con validación de
      movimiento y acciones de bloque
- [x] Generación de mundo por chunks con biomas (llanura, bosque,
      desierto) vía simplex-noise con semilla fija
- [x] IA de mobs con máquina de estados (zombie, creeper,
      esqueleto, enderman, pasivos)
- [x] Crafteo por patrón 3x3 desde `recetas.json`
- [x] Horno con combustible y cocción desde `recetas_horno.json`
- [x] Persistencia completa del mundo cada 30s
- [x] Cliente Three.js vanilla con física básica (colisión,
      gravedad, salto) y culling de caras correcto entre chunks

---

## Fase 1 — Cimientos técnicos
*Objetivo: que la base escale antes de seguir sumando features.*

- [x] Guardado incremental por chunk (reemplazar `world.dat` único
      por un archivo/entrada por chunk, o por región)
- [x] Versionado del formato de guardado (`schemaVersion`) con
      ruta de migración explícita para mundos ya guardados
- [x] Descarga de chunks lejanos: servidor deja de mantener en
      memoria chunks sin jugadores cerca; cliente hace `dispose()`
      de geometría de chunks fuera de rango
- [x] Modularizar `client.js` en módulos ES6 por responsabilidad
      (`network.js`, `world.js`, `player.js`, `mobs.js`, `ui.js`,
      más `constants.js`, `scene.js`, `connection.js` e `input.js`
      para evitar ciclos de import)
- [x] Modularizar `server.js` de forma equivalente si ha crecido
      demasiado (`world.js`, `mobs.js`, `crafting.js`, `net.js`,
      más `constants.js`, `state.js`, `players.js` y `save.js`,
      con `server.js` como entrada que conecta los hooks de red)
- [x] **Auditoría de Fase 1:** probar guardar/cargar el mundo
      varias veces seguidas sin corrupción; medir uso de memoria
      del servidor con varios chunks generados y jugador
      moviéndose por un rato; confirmar que no hay imports rotos
      ni código muerto tras la modularización

> **Auditoría completada (agosto 2026):** 3 ciclos guardar/cargar
> sin corrupción (169 chunks válidos, schemaVersion 2); memoria del
> servidor acotada (439 → 65 chunks en memoria tras descarga, 524
> en disco sin pérdida); test funcional WS 9/9 (todos los
> handlers); revisión de código aprobada. De paso se limpió código
> muerto en `net.js` (drop no-op en `attack_mob`) y un key
> malformado en `furnace_action` close, y se añadió favicon a
> `index.html`.

---

## Fase 2 — Identidad sensorial
*Objetivo: que el juego se vea y suene reconociblemente Minecraft.*

- [x] Atlas de texturas simple (16x16 px por cara, estilo
      pixel-art) reemplazando los colores planos por bloque.
      Generado proceduralmente en un canvas (`public/textures.js`):
      sin assets binarios ni build step, una única `CanvasTexture`
      compartida con `NearestFilter`
- [x] Aplicar texturas en `buildChunkGeometry` (UV mapping por
      cara, agrupado por textura en vez de por color): cada cara
      elige su tesela (top/bottom/lados) con UVs del atlas
- [x] Sonidos básicos: romper bloque, colocar bloque, pasos,
      ambiente de día/noche. Todo procedural con Web Audio API
      (`public/audio.js`, sin assets binarios): contexto
      desbloqueado en el primer gesto, golpes/colocación por
      material del bloque, pasos con alternancia de tono, y
      ambiente continuo de viento + pájaros (día) / grillos
      (noche) guiado por la misma fase del ciclo
- [x] Ciclo día/noche visual real: color de cielo y
      intensidad de luz solar interpolados con el reloj interno
      del servidor (el `init` envía `dayTime`; el cliente lo
      extrapola con `performance.now()` en `public/daynight.js`
      e interpola cielo, luz solar, ambiente y niebla)
- [x] **Auditoría de Fase 2:** medir impacto en rendimiento de
      cargar el atlas y aplicar UVs (FPS con varios chunks
      visibles); confirmar que las texturas no rompen el culling
      de caras existente

> **Auditoría completada (agosto 2026):** benchmark de
> generación del servidor 2.36 ms/chunk (169 chunks, radio 6) y
> 0.52 ms en cache. Medición de FPS en Chrome headless vía CDP
> (SwiftShader, render por software — números conservadores):
> escena reducida de 25 chunks → 148-176 FPS con y sin audio
> (degradación del sonido procedural ≈ 2.8%, ruido de medición;
> `updateAmbient` cuesta 0.02-0.64 ms/frame); escena completa de
> 439 chunks (310K triángulos) renderiza estable. 0 teselas/UVs
> inválidas (19 bloques × 6 caras) y 0 errores de consola: el
> atlas no rompe el culling de caras. De paso se añadió un
> contador de FPS persistente al HUD (`#fps`, métricas en
> `window.__mc*`) útil para auditorías futuras.

---

## Fase 3 — Bucle de supervivencia
*Objetivo: cerrar el loop minar → craftear → sobrevivir.*

- [x] Barra de hambre: decae con el tiempo/acciones, regenera
      salud cuando está llena, penaliza cuando está vacía.
      Implementada en el servidor (`players.js` `tickPlayer`,
      fuente de verdad): `food` 0-20 que decae cada 30s parado
      (15s en movimiento), regenera +1 salud cada 2s cuando
      `food >= 18` (consumiendo comida) y drena -1 salud cada 2s
      por inanición con `food == 0`; el respawn resetea salud y
      comida. El `init` envía `food` y hay evento `food_update`;
      el HUD muestra la barra 🍗 (naranja baja, roja vacía)
- [x] Drops de comida de animales (vaca, cerdo, pollo, oveja) al
      morir. Nuevos ítems de comida cruda en `constants.js`
      (BEEF/PORKCHOP/CHICKEN/MUTTON, 107-110, sincronizados con
      el cliente); `mobs.js` expone `mobDrops(type)` (rangos
      aleatorios estilo Minecraft) y `net.js` entrega el drop al
      inventario del atacante en `attack_mob` (muerte directa)
- [x] Recetas de horno para cocinar esa comida: nuevos ítems
      cocinados (COOKED_BEEF/PORKCHOP/CHICKEN/MUTTON, 111-114,
      sincronizados con el cliente) y 4 recetas en
      `recetas_horno.json` (cruda → cocinada, con `isCookable`
      y el tick del horno ya existentes)
- [x] Comer con clic derecho: `FOOD_VALUES` (hambre +
      saturación, escala 0-20; la cocinada restaura más) en el
      servidor, evento `eat` validado que consume el ítem
      seleccionado, y el tick consume la saturación antes que
      el hambre (amortigua el hambre, como en Minecraft)
- [x] Alimentación y reproducción simple de animales (dar item →
      cooldown → cría): nuevos ítems de cría TRIGO/ZANAHORIA/
      SEMILLAS (115-117, la hierba los suelta al romperla) que
      alimentan a vaca/oveja, cerdo y pollo respectivamente
      (`BREED_FOOD`); `feed_mob` validado en el servidor consume
      el ítem, entra en modo amor 30s y si encuentra pareja del
      mismo tipo a <8 bloques cría un bebé (los padres entran en
      cooldown 60s); el bebé se renderiza a media escala, no
      dropea comida y crece hasta adulto en 60s; el estado
      `isBaby`/`age` se persiste de forma retrocompatible
- [x] **Auditoría de Fase 3:** revisar balance (¿el hambre baja a un
      ritmo jugable?), confirmar que el spawn/reproducción de
      animales no degrada el rendimiento del tick de mobs

> **Auditoría completada (agosto 2026):** balance del hambre
> validado por simulación reutilizable (`tests/audit-fase3.js`):
> parado, la comida aguanta ~10 min antes de bajar y se muere de
> inanición a los ~21 min; moviéndose, ~5 y ~11 min — presión
> suave, ritmo jugable. La regeneración agota ~3 HP de reserva
> (food 20→17, se detiene al llegar food < 18, fiel a Minecraft),
> una pelea sostenida agota la reserva en ~6s (no se puede
> tanquear), y comer cocinada (+8 food / +12.8 sat) cubre ~40% de
> la barra e incentiva el horno frente a la cruda (+3 / +1.8).
> Tick de mobs con cría: 30 mobs → 0.043 ms/tick, 100 → 0.135,
> 300 → 0.319 (y 0.225 de noche) — escala lineal y muy por debajo
> del presupuesto de 50 ms; el broadcast `mobs_update` pesa 5-51
> KB y se serializa en <3 ms. Persistencia de `isBaby`/`age`:
> round-trip OK y retrocompatible con guardados viejos. De paso se
> limpió código muerto preexistente (`isAxe`/`isShovel` sin uso en
> `constants.js`).

---

## Fase 4 — Profundidad de terreno
*Objetivo: que el mundo deje de sentirse macizo y plano.*

- [ ] Cuevas: ruido 3D restando de la generación de piedra en
      `generateChunk`
- [ ] Bloque de agua: no sólido, con física simple de flotación
      para el jugador
- [ ] (Opcional si el rendimiento lo permite tras Fase 1) más
      variedad de bioma: nieve, montaña
- [ ] **Auditoría de Fase 4:** confirmar que las cuevas no generan
      huecos visuales raros en el culling de caras; probar
      generación de chunks con cuevas en tiempo real sin caída de
      FPS perceptible

---

## Fase 5 — Progresión y combate
*Objetivo: dar sentido a subir de nivel de herramienta.*

- [ ] Durabilidad real de herramientas (que se rompan tras N usos)
- [ ] Más variedad de mobs y drops asociados
- [ ] (Opcional) experiencia simple / niveles
- [ ] **Auditoría de Fase 5:** revisar que la durabilidad se
      sincroniza correctamente entre inventario del servidor y HUD
      del cliente; confirmar que no hay forma de duplicar items al
      romperse una herramienta a mitad de una acción

---

## Fuera de alcance (Won't)

Explícitamente descartado por ahora — no implementar sin discutir
primero y actualizar este archivo:

- Redstone
- Dimensiones alternas (Nether / End)
- Aldeas generadas proceduralmente
- Sistema de clima
- Cuentas de usuario / autenticación
- Persistencia en base de datos externa (se resuelve con archivos
  por chunk en la Fase 1)
