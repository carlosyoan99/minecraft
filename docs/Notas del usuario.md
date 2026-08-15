---
name: notas-del-usuario
description: List of bugs identified during real-world gameplay sessions and suggested improvements for the next phases
---

# Notas del usuario
Esta es una auditoría manual echa por el usuario tras probar el juego, donde se van recogiendo **bugs**, **nuevas características** y otras sugerencias del usuario que no han sido inluidas en alguna de las fases programadas hasta ahora. Son la base para las próximas especificaciones a no ser que se detecte un error crítico.

## Bugs
- Al estar sobre el agua, solo mostrar la neblina si se esta a 2 o más bloques de profundidad, si los ojos estan por encima del agua no se debe mostrar la neblina.
- Se puede abrir cofres con click del mouse, pero estos no se pueden eliminar, hacerlo similar a Minecraft, donde te agachas para poderlo destruir.
- Revisa la IA de los mobs, estos no estan reaccionando a ser atacados, ni los hostiles atacan al jugador.
- En el inventario no se muestran texturas de  los items que tenemos, ni un tooltip con su nombre y descripción.
- Cuando se abre el libro de recetas se sigue bloqueando el mouse y no se muestran texturas de los items, además, no se puede cerrar el libro de recetas con `Esc`.
- La opción de calidad gráfica hace algo? la he cambiado y no noto cambios. Corregir he implementar correctamente.
- El cliente se desconecta a los pocos segundos de conectarse al servidor.
- Destruir el bloque de tierra debajo de una flor o hierva no hace que esta también se destruya.
- Hay chuncks que nunca llegan a cargar en el cliente, estan totalmente vacios, su fisica si se generan, porque es posible caminar y minar, pero no se observa nada, este error persiste entre sesiones, al iniciar una nueva sesion puede que los chunks afectados no sean los mismos.
- Revisa la generación de las cuevas, se generan muchas en vez de pocas cuevas, pero que sean más largas y grandes, que permita que el jugador las explore.
- En creativo, los mobs siguen siendo atraidos por el jugador.
- Crear una nueva semilla desde el cliente muestra este error en la consola del servidor y lo detiene:
```log
/home/carlos/Documentos/Proyectos/minecraft/server/net.js:1713
			DATA[key] = Array.from(state.chunks.get(key));
			                  ^

TypeError: undefined is not iterable (cannot read property Symbol(Symbol.iterator))
    at Function.from (<anonymous>)
    at Timeout.mainLoop [as _onTimeout] (/home/carlos/Documentos/Proyectos/minecraft/server/net.js:1713:22)
    at listOnTimeout (node:internal/timers:585:17)
    at process.processTimers (node:internal/timers:521:7)
```
- Al minar, dejar el **click presionado** hace que se siga minando el bloque siguiente, siempre que se esté a una distancia de minado, así funciona en Minecraft.
- No hay **persistencia del inventario** entre sesiones.

## Mejoras
- Genera **música lofi** procedural diferente para cada bioma, que deuna sensación más inmersiva.
- Implementa correr y agacharse
- Al abrir el juego debe haber un **menú inicial tipo Minecraft** donde se acceda a la configuración y al menú de mundos. No se debe cargar un mundo al iniciar.
  - en el menú de mundos van a estar listados todos los mundos que tenemos, con opciones para eliminar, clonar, cambiar modo de juego y renombrar.
  - En este menú tambien va a estar un botón que permite la configuración del nuevo mundo.
  - El el menú de configuración la configuración actual dividida en pestañas, similar a Minecraft.
- El juego debería iniciar a pantalla completa o una opción en la configuración que lo permita.
- Adaptarlo mejor a pantallas de celular, aunque siga siendo necesario jugar con mouse y teclado.
- Altura del mundo `-64 a 255`. (**Minecraft -64 a 320**), esta es una limitación temporal por rendimiento. Subir la altura va a permitir la generación de mejores cuevas y montañas mas grandes.s
- Generación: Extender columnas de terreno/cuevas/minerales al nuevo rango sin romper la distribución de minerales por altura ya calibrado.
- Cliente: confirmar que culling de caras/LOD y greedy meshing siguen rindiendo bien con columnas más altas.
- Extender tests con los nuevo cambio y correcciones.
- Cerrar huecos - no inventar bloques/items nuevos, solo craftear lo que ya está.
- Extender `unit-recetas.js` para verificar cobertura, no solo integridad de lo ya existente.
- Agregar posibilidad de escoger skins: Steve, Alex, Noor, Sunny, Ari, Zuri, Makena, Kai y Efe. **(✔ implementado — selector en el menú con los 9 skins oficiales procedurales; preferencia del cliente `mc_skin` y propagación en vivo con `player_skin`)**
- Persistenci de datos del lado del cliente que sea seguro mantener de este lado: configuración, preferencias, nombre, skins. **(✔ implementado — configuración/preferencias en `mc_settings`, nombre en `mc_name` y skins en `mc_skin`)**
- **Biomas más grandes en extensión y nuevos biomas** (lista completa con 20 biomas característicos). Se deben implementar con sus bloques, vegetación, mobs y climas asociados. A continuación se detallan:

  1. **Llanura (Plains)**: Zona plana y verde con árboles de roble, ideal para empezar. Aparecen caballos.
  2. **Desierto (Desert)**: Árido, con arena, cactus y ausencia de lluvia. Genera templos y aldeas.
  3. **Bosque (Forest)**: Templado, con robles y abedules, hierba y flores.
  4. **Taiga (Taiga)**: Frío, con abetos y podzol. Hogar de lobos.
  5. **Tundra Nevada (Snowy Plains)**: Plano, cubierto de nieve y hielo. Siempre nieva.
  6. **Montañas (Windswept Hills)**: Gran altitud, terreno escarpado y rocoso.
  7. **Pantano (Swamp)**: Agua grisácea, cabañas de brujas y hongos gigantes.
  8. **Jungla (Jungle)**: Exuberante, con árboles gigantes, ocelotes y templos.
  9. **Sabana (Savanna)**: Cálida y seca, con acacias y aldeas.
  10. **Badlands (Terracota)**: Capas de terracota coloreada, rica en oro.
  11. **Océano (Ocean)**: Extenso mar, con variantes cálidas, frías y profundas.
  12. **Isla de Champiñones (Mushroom Fields)**: Micelio y hongos, hogar de mooshrooms.
  13. **Bosque Oscuro (Dark Forest)**: Robles oscuros muy densos, sombra permanente.
  14. **Bosque de Abedules (Birch Forest)**: Solo abedules, troncos blancos.
  15. **Taiga de Árboles Gigantes (Old Growth Pine/Spruce Taiga)**: Abetos de 2x2 bloques de ancho.
  16. **Picos Nevados (Frozen Peaks)**: Altas montañas con nieve y hielo.
  17. **Cuevas de Lush (Lush Caves)**: Subterráneo verde, iluminado con bayas luminosas.
  18. **Cuevas de Dripstone (Dripstone Caves)**: Estalactitas y estalagmitas de dripstone.
  19. **Nether Wastes** (para el Nether): Paisaje desolado de roca brillante, con ghasts y piglins.
  20. **El End**: Islas flotantes de piedra de End, endermen y el dragón.

- **Estructuras estáticas (no dinámicas)**: Se clasifican en **pasivas** (seguras, comerciales o de recursos) y **activas** (peligrosas, con mobs hostiles y gran botín). A continuación se listan con su ubicación y características principales:

  **Estructuras Pasivas**:
  - **Aldea (Village)**: Aparecen en llanura, desierto, sabana, taiga. Habitadas por aldeanos con los que comerciar. Tienen granjas, camas y son refugio seguro.
  - **Igloo**: En tundra o taiga nevada. Pequeño refugio; a veces esconde un sótano con mesa de pociones y materiales para curar a un aldeano zombi.
  - **Pozo del Desierto (Desert Well)**: En el desierto. Simple, sin botín, pero proporciona agua.
  - **Geoda de Amatista (Amethyst Geode)**: Subterránea. Fuente de amatista para objetos decorativos y el catalejo. No es hostil.

  **Estructuras Activas**:
  - **Puesto de Saqueadores (Pillager Outpost)**: Superficie, cerca de aldeas. Torre con saqueadores; al derrotar al capitán obtienes "Mal Presagio".
  - **Templo del Desierto (Desert Pyramid)**: En el desierto. Pirámide con trampa de TNT; cofres con botín valioso.
  - **Templo de la Jungla (Jungle Temple)**: En la jungla. Estructura de piedra con puzzle de redstone y trampas de flechas.
  - **Cabaña del Pantano (Swamp Hut)**: En el pantano. Hogar de una bruja; buena para recursos de pociones.
  - **Monumento Oceánico (Ocean Monument)**: En océanos profundos. De prismarina, custodiado por guardianes y el anciano que da fatiga minera.
  - **Fortaleza del Nether (Nether Fortress)**: En el Nether. De ladrillos del Nether, con blazes, esqueletos wither y ghasts. Esencial para polvo de blaze.
  - **Restos de Bastión (Bastion Remnant)**: En el Nether. Ruinas habitadas por piglins hostiles si no llevas oro. Botín excelente.
  - **Ciudad del End (End City)**: En las islas del End. Flotante, con shulkers. En el barco se encuentra el Élitro.
  - **Mansión del Bosque (Woodland Mansion)**: En el bosque oscuro. Enorme y laberíntica, con ilusionistas y vindicadores.
  - **Antigua Ciudad (Ancient City)**: Bajo tierra, muy profundo. Protegida por Wardens, uno de los mobs más poderosos.
  - **Minas (Mineshaft)**: Subterráneo. Túneles con vagonetas y cofres; suelen tener mobs hostiles.
  - **Fortaleza (Stronghold)**: Subterránea. Mazmorra con mobs; alberga el portal al End.
  - **Naufragio (Shipwreck)**: En el océano. Restos de barco con cofres; suelen tener ahogados.
  - **Ruinas Oceánicas (Ocean Ruins)**: En el fondo marino. Pequeñas estructuras de piedra con cofres y mobs.

- **Más mobs y mejora de su IA**: Se deben implementar todos los mobs icónicos con sus mecánicas de IA distintivas. Se clasifican en:

  **Pasivos** (no atacan, huyen o son útiles):
  - **Vaca**: Deambula, huye al ser golpeada, sigue trigo. Se puede ordeñar con cubo para obtener leche (elimina efectos).
  - **Oveja**: Deambula y come pasto para regenerar lana. Esquilando se obtiene lana sin matarla; el color se mantiene si está teñida.
  - **Gallina**: Se mueve erráticamente y flota al caer. Pone huevos cada 5-10 minutos; lanzarlos tiene 1/8 de probabilidad de generar un pollito.
  - **Pulpo**: Vive en el agua, se mueve por impulsos. Al morir suelta tinta para teñir y hacer libros.

  **Neutrales** (atacan solo si se les provoca):
  - **Lobo**: Neutral en manada; si golpeas a uno, todos se vuelven hostiles. Se domestica con huesos; una vez domado, sigue y ataca a quien hiera al jugador (excepto creepers).
  - **Enderman**: Pacífico hasta que lo miras fijamente a los ojos o le disparas. Al enfadarse, se teletransporta y golpea. Alérgico al agua; recoge bloques del suelo.
  - **Zombified Piglin**: Neutral en el Nether. Si golpeas a uno, todos los cercanos se vuelven hostiles (efecto dominó). Se calman si mueres o te alejas.
  - **Araña**: De día neutral, de noche hostil. Escala paredes y ve a través de bloques sólidos.
  - **Abeja**: Neutral. Poliniza flores y vuelve a la colmena. Si se la golpea o se rompe la colmena sin fuego, pica y muere al hacerlo.
  - **Gólem de Hierro**: Neutral, salvo si atacas a un aldeano. Lanza enemigos al aire con su puñetazo. Inmune al fuego y ahogamiento.

  **Hostiles** (atacan al jugador por defecto):
  - **Creeper**: Se acerca sigilosamente y silba 1.5 s antes de explotar. Huye de los gatos.
  - **Zombie**: Persigue, arde al sol (si no lleva casco), rompe puertas en dificultad alta y convoca a otros zombis al recibir daño.
  - **Esqueleto**: Mantiene distancia, dispara flechas y strafea lateralmente. Arde al sol; al matarlo con flecha, suelta esa flecha.
  - **Blaze**: Flota en el Nether, dispara ráfagas de 3 bolas de fuego. Solo se daña con flechas, nieve o agua.
  - **Ghast**: Flota lentamente, lanza bolas de fuego explosivas. Se puede desviar su bola para devolvérsela y matarlo.
  - **Slime**: Salta hacia el jugador. Al morir se divide en slimes más pequeños (cada división reduce tamaño y vida). Aparece en chunks específicos o pantanos de noche.

  **Jefes (Bosses)**:
  - **Dragón del End**: Vuela, destruye bloques (excepto obsidiana, piedra del End y lecho de roca). Se posa para curarse; destruir los cristales de End evita la regeneración. Vulnerable a camas.
  - **Wither**: Al ser invocado, explota. Dispara cráneos que causan Wither II y destruyen bloques. Al bajar del 50% de vida, se vuelve inmune a proyectiles y genera escudo.

  **Sociales**:
  - **Aldeano**: IA compleja con horarios (trabajo, socialización, sueño). Profesiones según bloque de trabajo; comercio con esmeraldas y precios variables según reputación.

## Próximas Fases
- **Fase 16**: se va a centrar en la corrección de bugs y completar la paridad con Minecraft.
- **Fase 17**: se centrará en la UI/UX, experiencia visual del usuario, uso en móviles, interfaz 100% Minecraft.
- **Fase 18**: Bugs, paridad y rendimiento, nada de nuevas características, solo pulir las que ya tenemos. Refactorizado de los modulos a las convenciones ya establecidas en CLAUDE.md y mejorar la documentación en general.
- **Fase 19**: Crear texturas faltantes para todos los items, mejorar cofres, mesa de crafteo, hornos y demás interfases.
- **Fase 20**: Rolling release del proyecto, fase larga donde solo se corregiran bugs, se mejorará la paridad en implementaciones que estan documentadas como limitadas, si el rendimiento lo permite, no se incluiran las características reportadas como **Restricciones (Won't)**. Fase que logra equilibrio entre rendimiento y paridad. No avanzar a una siguiente fase hasta que todo lo actual este 100% confirmado su funcionamiento y estable.
- Cada fase solo se da por concluida una vez que esta pasa todos los test y una auditoría para esa fase en específico.

## Actualizaciones Minecraft 1.17 → 1.21 (plan del usuario, 2026-08-15)

Plan para incorporar actualizaciones de Minecraft 1.17 a 1.21 **después de la
Fase 21**, priorizando valor jugable sin romper arquitectura ni
restricciones. Filosofía: **paridad + restricciones** — se mantienen las
restricciones duras (sin Redstone, autenticación, BD externa, dimensiones,
clima) y se **flexibilizan** altura del mundo (solo si los tests la
confirman), mobs pasivos/neutrales simples y mecánicas sencillas.

**Fase 22 — Actualizaciones priorizadas (alto impacto / bajo esfuerzo)**:

1. **Terreno estilo 1.18** (montañas y valles) — ajustar ruido/cuevas;
   **subir la altura a 256 (−64..191) SOLO si los tests confirman que es
   factible**; si no, mantener la altura actual (v6, −64..+63).
2. **Pizarra profunda (Deepslate) y minerales en bruto**: `DEEPSLATE`
   sustituyendo la piedra por debajo de Y=0; `RAW_IRON`, `RAW_GOLD`,
   `RAW_COPPER` — **minar menas suelta el "en bruto" (todos los minerales)**
   y el lingote se obtiene fundiéndolo en el horno.
3. **Cobre (1.17)**: nuevo mineral + `COPPER_BLOCK`. **Solo el bloque por
   ahora** (sin oxidación, sin cut/escaleras/losas) — se ampliará si es
   factible; decisión documentada.
4. **Geodas de Amatista + Catalejo (1.17)**: el catalejo (`SPYGLASS`) con su
   **funcionamiento real (zoom)**; la **estructura geoda se mantiene en la
   Fase 21** (no se duplica aquí); la F22 aporta los bloques/ítems de
   amatista que la F21 usará.
5. **Biomas**: manglar, cerezo y bambú **se mantienen como candidatos de la
   Fase 21** (fase de biomas); la F22 lleva la **rana** (aparece en pantanos
   y, cuando exista, en el manglar).
6. **Sculk simplificado (1.19)**: bioma/capa **Deep Dark en Y < −40** con
   `SCULK`/`SCULK_VEIN` y **propagación básica** (al morir un mob sobre
   sculk, convierte bloques circundantes en radio 2). Sin Warden, sin
   shriekers, sin ciudad antigua, sin crecimiento propio; limitaciones
   documentadas.
7. **Mobs pasivos fáciles**: rana (salta, come slimes pequeños, se cría con
   `SLIME_BALL`), sin renacuajos por ahora. (Ajolote y cabra se valoran
   después, como la F23.)

**Diferido (Fase 23, no en la 22)**: profundidad 256 si no entra en la 22,
cuevas frondosas (Lush Caves), Breeze 1.21 simplificado, Armor Trims,
bloques de Tuff/Caliza, ajolote y cabra.

**Restricciones confirmadas (Won't de la F22)**: Redstone y todo lo que
dependa de ella (Crafter, comparadores), Trial Chambers y spawners de
prueba, Arqueología (cepillo/barro sospechoso), Aldeanos/Comercio/Aldeas,
Warden (solo se implementa el bloque Sculk), encantamientos/pociones, clima
complejo (lluvia/nieve), oxidación del cobre, brotes de amatista que crecen,
acuíferos (lagos subterráneos interconectados), Sniffer/Camello (montura),
mobs del Nether (Hoglin/Piglin) — no hay Nether.

## Dimensiones: Nether y End (actualización 1.16, 2026-08-15)

Plan para añadir **dimensiones** al proyecto. Las dimensiones siguen como
**restricción (Won't) en TODO/AGENTS HASTA que se abran sus fases** (F24
Nether, F25 End) — no se implementa nada de esto antes. Filosofía:
dimensiones = mundo independiente por semilla (generación, chunks, mobs y
persistencia propios), inventario/salud/XP **compartidos** entre
dimensiones, posición por dimensión guardada por separado.

**Numeración acordada (2026-08-15)**:
- **Fase 23** = diferidos de la F22 (Lush Caves, Breeze, trims, Tuff/Caliza,
  ajolote/cabra, altar 256 si no entró en la 22).
- **Fase 24** = **Nether Update** (primera dimensión).
- **Fase 25** = **End Update** (segunda dimensión). **El dragón del End
  queda descartado temporalmente** (documentado: se puede retomar en una
  fase posterior si se pide).

**Nether (F24) — qué incluir**:
- **Bloques** (~15): netherrack, soul sand, soul soil, glowstone, nether
  bricks, magma block, basalto, blackstone, nylium (crimson/warped), hongos
  y raíces, shroomlight. Estáticos (sin crecimiento).
- **Mobs (4)**: zombified piglin (neutral), ghast (hostil, dispara bolas de
  fuego), blaze (hostil, dispara), magma cube (hostil, se divide). Usan la
  IA por especies existente (`tickSpecies`/`MOB_CLASSES`).
- **Estructuras**: fortaleza del Nether (pasillos de ladrillos, 1-2 spawners
  de blaze, cofres — sin trampas de redstone).
- **Generación**: Nether de **128 bloques de altura** (reusando el formato
  v6, techo y piso de bedrock, offset re-anclado); cuevas masivas con lagos
  de lava; **2 biomas**: Nether Wastes y Soul Sand Valley (simplificados).
- **Portal**: **solo el marco de portal** (4×5 de obsidiana) que **se activa
  al completarse** (sin mechero ni gesto "usar"): al entrar teletransporta
  al Nether con conversión 8:1 (X/Z) y spawn en tierra firme (sin caer en
  lava). Al volver, 8:1 inverso. Bloque `PORTAL` nuevo no sólido.
- **Persistencia**: `world/<semilla>/nether/` (carpeta nueva; el overworld
  actual sigue en la raíz — **opción B elegida, sin migración de la raíz**);
  posición del jugador por dimensión (`positions: {overworld, nether}`),
  **sin subir `SCHEMA_VERSION`** (campo retrocompatible en el archivo del
  jugador; el formato de chunks/metadatos no cambia).
- **Protocolo WS**: reusar el `init` existente tras confirmar el cambio de
  dimensión (evento ligero `dimension_change` S→C + el `init` de la nueva
  dimensión; `enter_dimension` C→S al entrar en el portal).

**Nether — qué NO incluir (F24)**: trueque de piglins (sin comercio; los
piglins neutros solo si llevas oro y no atacan, sin UI), piglins armados,
hoglin/zoglin, techo del Nether accesible (bedrock sólido), biomas crimson/
warped/deltas completos (se documentan para una ampliación posterior, F24.5
o F26), cama que explota en el Nether (dormir se rechaza como en el
overworld), mechero (flint & steel).

**End (F25) — qué incluir (sin dragón)**: islas flotantes de end stone
(ruido 2D), end stone bricks, chorus plant/flower estáticos (sin
crecimiento), endermite (hostil pequeño, al lanzar ender pearl o spawn
natural), enderman (ya existe, puede spawnear), portal de regreso al
overworld (bloque/estructura especial que te devuelve; sin cristales ni
portal de salida del dragón). **El dragón del End se descarta temporalmente**
(y con él: cristales, ciudad del End, élitro, shulker con levitación —
documentados como inspiración Futuro). El jugador aparece en la isla
principal con pilares de obsidiana decorativos (sin dragón) y puede
recolectar end stone y chorus fruit.

**Restricciones que se mantienen para las dimensiones** (no negociable):
sin redstone (tampoco en fortalezas), sin comercio complejo (trueque), sin
NBT, sin encantamientos/pociones, sin clima, sin autenticación/BD externa.
El Nether es estático por naturaleza (sin oxidación ni crecimiento) — ayuda
a la paridad.

## Importante
Migrar el código a **programación orientada a objetos**, valorar que su rentablilidad, si optimiza el rendimiento y ws más fácil la lectura del código y la implementación de nuevas características.
Usar skills siempre que sea útil para el proyecto.

## Futuro
Caracteristicas sugeridas pero fuera del alcance actual, documentar como restricciones del proyecto. No ser'an agregadas en un corto periodo de tiempo o no lo serán nunca.

- Encantamientos y pociones.
- Redstone
- Dimenciones (Nether, End).
- Clima
- Autenticación y base de datos externa.
- Mobs: Aldeanos, Wither, Dragón del End, Blaze, Ghast, Gólem de hierro, están documentados para conocer su funcionamiemto, pero no implementar aún.
- Estructuras: Villas, Ciudad Antigua, etc...
