# Notas del usuario
Esta es una auditoría manual echa por el usuario, donde se van recogiendo **bugs**, **nuevas características** y otras sugerencias del usuario que no han sido inluidas en alguna de las fases progranadas hasta ahora. Son la base para las próximas especificaciones a no ser que se detecte un error crítico.

## Bugs conocidos
> Estado: corregidos en la **Fase 10** (y Fases 8-9) salvo donde se indica.
> Los `[x]` marcan lo resuelto; lo pendiente queda en el texto.

- [x] Al caer en el agua no se puede salir. *(Fase 10 A1: la flotación ya
  no empuja hacia atrás al llegar a la orilla)*
- [x] En los biomas de hielo no se debe generar lava. *(Fase 10 A3:
  `isLavaPondAt` rechaza columnas con temperatura de hielo)*
- [x] El jugador debe medir 1.8 bloques de altura, al igual que Steve, lo
  que le permite pasar por cuevas y minas de 2 bloques de alto.
  *(Verificado: el hitbox de colisión coincide con la cámara a 1.6 y se
  pasa por huecos de 2 bloques)*
- [x] El agua puede tener varios bloques de profundidad, que existan
  cuevas acuáticas, mejorar lagos e incluir pequeños ríos. *(Fase 10 A6:
  lagos con fondo variable, ríos con canal y cuevas acuáticas)*
- [x] La lava no hace daño por quemadura, que se elimine con el agua o al
  poco tiempo. *(Fase 10 A2: quemadura `burning` que se extingue con agua
  o con el tiempo + overlay de fuego en el HUD)*
- [x] Al hacer /tp a un lugar lejano el mundo deja de cargar. *(Fase 10
  A5: teleport antes que chunks_add + generación desde la nueva posición)*
- [x] Los mobs hostiles solo pueden hacer spawn por la noche o en zonas
  oscuras como las cuevas. *(Fase 10 A7: ahora también spawnean en
  columnas oscuras de día — cuevas peligrosas)*
- [x] Los mobs siguen viéndose como cajas rectangulares, por ejemplo las
  vacas. *(Fase 8 B9 los hizo multibloque; Fase 10 añade la animación de
  patas al caminar — ya no parecen cajas estáticas)*
- [x] El juego inicia a cualquier hora del día, cuando debería hacerlo al
  amanecer al iniciar y persistir la hora para la próxima vez que se
  inicie sesión. *(Fase 10: `timeOffset` persistido en `world.json` y
  mundos nuevos al amanecer)*
- [x] Hay demasiados lagos de lava en el mundo, disminuirlos y limitar su
  aparición solo a biomas cálidos. *(Fase 10 A3: umbrales más altos —
  ~0.3% global — y solo en biomas cálidos)*
- [x] Seleccionar una semilla aleatoria inicia el mundo, sin dejar
  configurar otros parámetros. *(Fase 10 B1: selector de tamaño de mundo
  y modo de juego al crear)*
- [x] Los cofres no se pueden abrir. *(Fase 6/E2E: cofres funcionales;
  verificado de nuevo en la Fase 10)*

## Nuevas características
> Estado: implementadas en la **Fase 10** salvo donde se indica.

- [x] Seleccionar tamaño del mundo:
  - debug: 64x64 --> *solo para debug interno, no opción para el jugador*
  - pequeño: 256x256
  - medio: 512x512
  - grande: 1024x1024
  - infinito 8192x8192
  *(Selector en el menú de mundos, persistido por mundo en `world.json`;
  los mundos viejos abren como 8192)*
- [x] Pantalla de muerte, que refleje la causa de la muerte. *(mob,
  caída, lava, ahogamiento, inanición, vacío, /kill)*
- [x] Implementa /kill <nombre> para matar un jugador, si no se especifica
  jugador se aplica al que lanza el comando, solo operadores.
- [x] Música de fondo que varíe según el bioma, si te encuentras en una
  cueva, incluir pasos, sonido de mobs, abrir y cerrar cofres. *(Fase 10
  F: música generativa por contexto — cueva/desierto/nieve — + pasos,
  mobs, cofres y TNT ya sonoros)*

## Debug
- [x] Implementa un test.log, donde se registre el resultado de la última
  ejecución de los tests, para tener persistencia de los resultados sin
  necesidad de ejecutarlos varias veces para saber cuál falló.
  *(`tests/test.log` lo escribe `tests/run.js` al terminar en cualquier
  modo: fecha, modo, total, fallos y tests con fallo)*

## Valorar implementar
- Mundos mayores a los 1024x1024 bloques si el rendimiento así lo permite.
- Alturas: positiva maxima 64 y negativa -64, permitiendo terreno más variado, mejores montañas y cuevas.

## Más biomas:

| Bioma | Por qué añadirlo | Complejidad |
|-------|------------------|-------------|
| **Taiga** | Un bosque de coníferas es muy distintivo. Aporta variedad de madera (abeto) y lobos. | Media (árboles altos y delgados, podzol). |
| **Pantano** | Introduce los **slimes** (mobs importantes para la mecánica de pegamento) y un estilo de construcción único. | Media (agua turbia, árboles con enredaderas). |
| **Jungla** | Uno de los biomas más queridos por su exuberancia. Añade lianas, ocelotes y templos. | Alta (árboles gigantes, vegetación densa, mobs exóticos). |
| **Océano** | Esencial para la sensación de "mundo abierto". Añade profundidad, islas y vida marina. | Media (terreno bajo el agua, generación de islas). |
| **Badlands** | Es visualmente impactante (colores de terracota) y da acceso a oro abundante. | Media (terreno de cañones, colores por capas). |
| **Isla** (variante de océano) | Muy solicitada para supervivencia en modo "isla desierta". | Baja (variante del océano con una columna elevada). |
| **Picos de montaña** (variante sin nieve) | Para zonas más altas sin nieve, como las montañas rocosas. | Baja (parámetros de altura y bloques). |

### 🛠️ Consideraciones Técnicas para Implementarlos

| Bioma | Bloques nuevos | Árboles | Mobs específicos | Estructuras |
|-------|----------------|---------|------------------|-------------|
| **Taiga** | Podzol, tierra de abeto | Abeto (alto y delgado) | Lobo | — |
| **Pantano** | Agua turbia, lianas, musgo | Roble con enredaderas | Slime, rana | — |
| **Jungla** | Liana, madera de jungla, arbustos | Gigante (2×2 tronco) | Ocelote, cacatúa, loro | Templo de jungla |
| **Océano** | Agua profunda, arena, grava | — | Ahogado, delfín, peces | Naufragio, ruinas |
| **Badlands** | Terracota (naranja, roja, amarilla), arena roja | — | — | Mina abandonada (expuesta) |

### 📝 Consejos de implementación

1. **Transiciones suaves**: Minecraft interpola biomas gradualmente. Usa `blend` de ruido para evitar bordes abruptos (ya lo haces en `world.js`).
2. **Bloques de superficie por bioma**: Define `surfaceBlock` y `subsurfaceBlock` según el bioma (césped, tierra, arena, podzol, terracota…).
3. **Árboles específicos**: Cada bioma debería tener su propio generador de árboles (roble, abeto, jungla, etc.) con alturas y formas distintas.
4. **Mobs por bioma**: Los mobs pasivos y hostiles deberían spawnear según el bioma (ej. lobos en taiga, ocelotes en jungla).
5. **Estructuras**: Si añades templos o naufragios, serán un gran plus de inmersión (pero son más trabajo).

Con los 5 biomas que ya tienes, tu juego es perfectamente jugable y reconocible. Añadir **Taiga** y **Pantano** te daría un **+50% de variedad** con un esfuerzo moderado. La **Jungla** y el **Océano** elevarían el juego a otro nivel de exploración y recursos, pero requieren más trabajo (especialmente la jungla por sus árboles gigantes).

## Sugerencias, crear cuando halla tiempo libre

### 1. 🚀 Sprint (Correr) — *El cambio más grande por 0 esfuerzo*

| Detalle | Descripción |
| :--- | :--- |
| **Qué hace** | Mantener `Ctrl` o doble toque `W` para correr (velocidad +30%). |
| **Por qué es clave** | Minecraft sin sprint se siente como caminar en melaza. Es la primera queja de cualquier jugador. |
| **Implementación** | Cliente: aumenta `movementSpeed` de 4.3 a 5.6 bloques/s, y **efecto FOV** (cámara que se aleja ligeramente). Servidor: valida la velocidad extra y **gasta +30% de hambre** mientras corres (ya tienes el sistema de hambre en `players.js`). |
| **Complejidad** | ⭐ (1/5) — 1 hora de código. |

---

### 2. 🐑 Esquilar Ovejas (Shearing) — *Interacción con el mundo*

| Detalle | Descripción |
| :--- | :--- |
| **Qué hace** | Craftear **Tijeras** (2 lingotes de hierro) y hacer clic derecho en una oveja para obtener lana sin matarla. |
| **Por qué es clave** | Es la interacción *pacífica* más icónica. Matar ovejas para lana es violento y poco eficiente; esquilarlas es el verdadero juego. |
| **Implementación** | Añadir ítem `SHEARS` (ID 232). En `net.js`/`mobs.js`: al hacer clic derecho en una oveja con tijeras, `dropItem` (1-3 lana) y la oveja pasa a estado `sheared` (sin lana). El cliente renderiza la oveja sin lana (basta con ocultar la capa de lana del `MOB_PARTS` o cambiar su textura a gris oscuro). La lana crece de nuevo con el tiempo (opcional, pero añade realismo). |
| **Complejidad** | ⭐⭐ (2/5) — 2 horas (nuevo ítem + interacción + estado visual). |

---

### 3. 🌱 Hueso (Bonemeal) — *El acelerador de progresión*

| Detalle | Descripción |
| :--- | :--- |
| **Qué hace** | Matar esqueletos da **huesos** (`BONE`). 1 hueso → 3 **polvos de hueso** (`BONE_MEAL`). Usar polvo de hueso en una planta/árbol la hace crecer al instante (o genera hierba alta/flores). |
| **Por qué es clave** | Es el *loop* de satisfacción inmediata de Minecraft. Matas un esqueleto → obtienes hueso → abonas tu trigo → cosechas al instante. Cierra el círculo de recursos. |
| **Implementación** | Añadir ítems `BONE` (121) y `BONE_MEAL` (122) + receta 1 hueso → 3 polvos. En `block_action` (place), si se usa `BONE_MEAL` en un bloque plantable (tierra arada con trigo o un árbol pequeño), el servidor ejecuta `growTree()` o incrementa la etapa del cultivo a la máxima. |
| **Complejidad** | ⭐⭐ (2/5) — 2-3 horas (nuevos ítems, lógica de crecimiento de cultivos/árboles). **Bonus**: el cultivo ya está planificado en Fase 9, así que esto encaja perfectamente. |

---

### 4. 🪣 Fuente de Agua Infinita — *Física que la comunidad espera*

| Detalle | Descripción |
| :--- | :--- |
| **Qué hace** | Si pones agua en una **zanja de 2×2** o **1×2**, el agua se vuelve infinita (si sacas un cubo, se rellena solo). |
| **Por qué es clave** | En Minecraft, tener que ir al río cada vez que necesitas agua es un fastidio. Los jugadores *exigen* poder hacer una fuente infinita en su base. Es una regla no escrita de la física del juego. |
| **Implementación** | En `world.js`/`net.js`, al colocar/recoger agua, comprueba el vecindario. Si hay un patrón de fuente (ej. 4 bloques de agua formando un cuadrado con un hueco en el centro), al tomar el agua del centro, se rellena automáticamente con el evento `block_update`. |
| **Complejidad** | ⭐ (1/5) — 1 hora (lógica de vecindad simple). |

---

### 5. 🛡️ Efecto FOV por Acción (Inmersión visual)

| Detalle | Descripción |
| :--- | :--- |
| **Qué hace** | El campo de visión (FOV) se expande al **correr** (ya mencionado) y al **tensar un arco** (si añades arco). |
| **Por qué es clave** | El "zoom out" al correr y el "zoom in" al apuntar con arco son *feedback* físico que el cerebro del jugador asocia a Minecraft. Hace que el juego *se sienta* rápido y táctil. |
| **Implementación** | En `public/player.js` o `scene.js`, aplica un `lerp` suave al FOV base (70) según el estado: `FOV_corriendo = base * 1.1` y `FOV_apuntando = base * 0.8`. Ya tienes el sistema de FOV en `settings.js`, solo hay que modificar el target dinámicamente. |
| **Complejidad** | ⭐ (1/5) — 30 minutos (interpolar valores). |

---

### 6. 🏷️ Tooltip flotante en el Hotbar (Feedback táctil)

| Detalle | Descripción |
| :--- | :--- |
| **Qué hace** | Al pasar el ratón sobre un ítem en el hotbar (en la interfaz), aparece una **etiqueta con el nombre** del ítem y, si es herramienta, la durabilidad restante en texto (ej. "Pico de diamante (256/1562)"). |
| **Por qué es clave** | Los jugadores de Minecraft reconocen los ítems por su icono, pero los nuevos jugadores necesitan el texto. Además, la durabilidad numérica es clave para no llevarse sorpresas al minar. |
| **Implementación** | En `public/ui.js`, añade `mouseover`/`mouseout` a los slots del hotbar. Crea un `div` flotante con `position: fixed` y `pointer-events: none`. Usa `ITEM_NAMES` y `DURABILITY` para rellenar el texto. |
| **Complejidad** | ⭐ (1/5) — 1 hora (maquetación CSS + eventos del DOM). |

-----
## Importante
Migrar el código a **programación orientada a objetos**, valorar que tan rentable es y si esta optimiza el rendimiento
y hace más fácil la lectura del código y la implementación de nuevas características.
