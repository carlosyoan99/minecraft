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
- Extender tests con los nuevos cambio y correcciones.
- Cerrar huecos - no inventar bloques/items nuevos, solo craftear lo que ya está.
- Extender `unit-recetas.js` para verificar cobertura, no solo integridad de lo ya existente.
- Agregar posibilidad de escoger skins: Steve, Alex, Noor, Sunny, Ari, Zuri, Makena, Kai y Efe.
- Persistenci de datos del lado del cliente que sea seguro mantener de este lado: configuración, preferencias, nombre, skins.
- Biomas más grandes en extensión y nuevos biomas:
  1. **Llanura (Plains)**: El bioma más clásico y común. Es una zona plana y verde con algunos árboles, ideal para empezar y donde aparecen caballos de forma natural.
  2. **Desierto (Desert)**: Un bioma árido y extenso, compuesto casi enteramente de arena y cactus. Destaca por la ausencia de lluvia y la presencia de templos y aldeas.
  3. **Bosque (Forest)**: Un bioma templado muy común, lleno de árboles de roble y abedul, con una gran cantidad de hierba y flores.
  4. **Taiga (Taiga)**: Un bioma frío de coníferas, dominado por enormes árboles de abeto y con el suelo a menudo cubierto de podzol. Es el hogar de lobos.
  5. **Tundra Nevada (Snowy Plains)**: Un bioma plano y frío, cubierto de nieve y hielo. En lugar de llover, siempre nieva.
  6. **Montañas (Windswept Hills)**: Un bioma de gran altitud con terrenos escarpados y picos rocosos. Anteriormente conocido como "Colinas Extremas".
  7. **Pantano (Swamp)**: Un bioma húmedo y pantanoso con agua de color grisáceo, donde se generan cabañas de brujas y crecen enormes hongos.
  8. **Jungla (Jungle)**: Un bioma muy exuberante con árboles gigantes de selva y un follaje denso. Es el único lugar donde se encuentran ocelotes y templos de jungla.
  9. **Sabana (Savanna)**: Una llanura cálida y seca, con árboles de acacia de forma característica y donde se generan aldeas.
  10. **Badlands (Terracota)**: Un bioma único de tierras áridas, formado por capas de terracota de colores. Es el lugar ideal para encontrar oro y minerales.
  11. **Océano (Ocean)**: Un vasto bioma acuático que cubre gran parte del mundo. Existen variantes como el océano cálido, frío o profundo.
  12. **Isla de Champiñones (Mushroom Fields)**: Un bioma raro y peculiar, compuesto por micelio y enormes hongos. Es el único lugar donde los mooshrooms (vacas champiñón) aparecen de forma natural.
  13. **Bosque Oscuro (Dark Forest)**: Un bioma característico por sus árboles de roble oscuro, tan densos que casi bloquean toda la luz, lo que provoca que los mobs hostiles aparezcan incluso de día.
  14. **Bosque de Abedules (Birch Forest)**: Un bosque compuesto casi exclusivamente por árboles de abedul, destacando por el contraste de sus troncos blancos.
  15. **Taiga de Árboles Gigantes (Old Growth Pine/Spruce Taiga)**: Una variante de la taiga con abetos gigantes, cuyo tronco puede llegar a tener 2x2 bloques de ancho.
  16. **Picos Nevados (Frozen Peaks)**: Una de las variantes de las montañas, con picos completamente cubiertos de nieve y hielo, alcanzando grandes altitudes.
  17. **Cuevas de Lush (Lush Caves)**: Un bioma subterráneo verde y vibrante, iluminado por bayas luminosas y con una exuberante vegetación.
  18. **Cuevas de Dripstone (Dripstone Caves)**: Otro bioma subterráneo, compuesto por bloques de dripstone que forman estalactitas y estalagmitas.
- Estructuras que sean estáticas no dinámicas (como las aldeas o mansión): Pozo del desierto, Pirámide, Iglú (solo edificio)

## Próximas Fases
- **Fase 16**: se va a centrar en la corrección de bugs y completar la paridad con Minecraft.
- **Fase 17**: se centrará en la UI/UX, experiencia visual del usuario, uso en móviles, interfaz 100% Minecraft.
- **Fase 18**: Bugs, paridad y rendimiento, nada de nuevas características, solo pulir las que ya tenemos. Refactorizado de los modulos a las convenciones ya establecidas en CLAUDE.md y mejorar la documentación en general.
- **Fase 19**: Crear texturas faltantes para todos los items, mejorar cofres, mesa de crafteo, hornos y demás interfases.
- **Fase 20**: Rolling release del proyecto, fase larga donde solo se corregiran bugs, se mejorará la paridad en implementaciones que estan documentadas como limitadas, si el rendimiento lo permite, no se incluiran las características reportadas como **Restricciones (Won't)**. Fase que logra equilibrio entre rendimiento y paridad. No avanzar a una siguiente fase hasta que todo lo actual este 100% confirmado su funcionamiento y estable.
- Cada fase solo se da por concluida una vez que esta pasa todos los test y una auditoría para esa fase en específico.

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
