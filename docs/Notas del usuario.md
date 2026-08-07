# Notas del usuario
Esta es una auditoría manual echa por el usuario, donde se van recogiendo **bugs**, **nuevas características** y otras sugerencias del usuario que no han sido inluidas en alguna de las fases progranadas hasta ahora. Son la base para las próximas especificaciones a no ser que se detecte un error crítico.

## Bugs conocidos
- Al caer en el agua no se puede salir.
- En los biomas de hielo no se debe generar lava.
- El jugador debe medir 1.8 bloques de altura, al igual que Steve, lo que le prmite pasar por cuevas y minas de 2 bloques de alto.
- El agua puede tener varios bloques de profundidad, que existan cuevas acuaticas, mejorar lagos e incluir pequeños rios.
- La lava no hace daño por quemadura, que se elimine con el agua o al poco tiempo.
- Al hacer /tp  un lugar lejano el mundo deja de cargar.
- Los mobs hostiles solo pueden hacer spawn por la noche o en zonas oscuras como las cuevas.

## Nuevas características
- Seleccionar tamaño del mundo:
  - debug: 64x64 --> *solo para debug interno, no opción para el jugador*
  - pequeño: 256x256
  - medio: 512x512
  - grande: 1024x1024
  - infinito 8192x8192
- Pantalla de muerte, que refleje la causa de la muerte.
- Implementa /kill <nombre> para matar un jugador, si no se especifica jugador se aplica al que lanza el comando, solo operadores.

## Debug
- Implementa un test.log, donde se registre el resultado de la ultima ejecusión de los tests, para tener persistencia de los resultados sin necesidad de ejecutarlos varias veces para saber cual falló.

## Valorar implementar
- Mundos mayores a los 1024x1024 bloques si el rendimiento así lo permite.
- Alturas: positiva maxima 64 y negativa -64, permitiendo terreno más variado, mejores montañas y cuevas.
- Más biomas:
