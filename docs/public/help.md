# Ayuda del cliente (jugador)

Guía práctica de juego. La arquitectura del cliente está en
[`README.md`](./README.md) y las mecánicas en [`mecanicas.md`](./mecanicas.md).

## Requisitos del navegador

- Navegador reciente (Chromium/Firefox/Safari) con **WebGL2** y soporte
  de **importmap** (ES modules), JavaScript habilitado.
- **Todo se sirve local** (Three.js 0.160 incluido, en `public/vendor/`):
  el juego funciona sin internet y solo necesita acceso al servidor (LAN).
- En `localhost` o HTTPS un **service worker** (`public/sw.js`) cachea los
  estáticos para cargar sin red; en IP LAN (`http://192.168.x.x`) el
  navegador no lo registra por política (el juego funciona igual).
- El juego se abre en `http://<servidor>:3000`.

## Pantalla inicial

1. Escribe tu **nombre de jugador** (máx. 16 caracteres) y elige una
   **skin** (Steve, Alex, Noor, Sunny, Ari, Zuri, Makena, Kai y Efe) con
   vista previa 3D.
2. **▶ Un jugador** entra al mundo por defecto; **🌍 Mundos** lista los
   guardados y permite crear uno nuevo (nombre opcional + semilla, o 🎲
   aleatoria) y elegir tamaño (256/512/1024) y modo de juego
   (Supervivencia/Creativo).
3. **⚙️ Ajustes** y **❓ Ayuda** y **📖 Acerca de** están disponibles desde
   el menú principal (y **❓ Ayuda** también en la pausa).

## Controles

- `WASD` moverse · ratón mirar · `Espacio` saltar
- `Shift` agacharse — protege de los bordes (en vuelo creativo, baja)
- Clic izquierdo: romper bloque / atacar mob (mantener = minar continuo)
- Clic derecho: colocar bloque / usar horno / comer comida
- `1`-`9`: seleccionar hotbar · `E`: inventario/crafteo (en creativo,
  catálogo de bloques) · `B`: libro de recetas
- Doble-tap `W`: correr (sprint, ~1.3× la velocidad) · `Enter`: chat
- Doble `Espacio`: activar/desactivar el vuelo (solo creativo)
- `F11`: pantalla completa · `F3`: visualizador de chunks y métricas
- Táctil: botones en pantalla (Fase 17, D1)

Los ajustes de **Ajustes → Controles** incluyen FOV (50-110), sensibilidad
del ratón (20-300%), invertir ejes laterales y `reduceMotion` (atenúa el
vaivén de la cámara/mobs para evitar mareos, Fase 19.5).

## Cómo jugar (supervivencia)

1. Rompe troncos a mano → **tablones** + **palos** → pico de madera →
   piedra → horno y herramientas de piedra.
2. La progresión de herramientas requiere: madera → piedra → hierro
   (fundiendo mena con carbón) → diamante. Cada herramienta tiene una
   **durabilidad** real (la barra del hotbar lo muestra).
3. **Hambre y comida**: la barra de hambre decae con el tiempo; come con
   clic derecho (carne cruda necesita fundirse en el horno para no
   arriesgar). Con hambre llena y salud baja, regeneras salud.
4. **Crafteo**: la mesa de crafteo (tecla `E`) combina 3x3 por patrón; el
   libro de recetas (tecla `B`) muestra lo que sabes por categorías.
   Comida cruda / menas se procesan en el **horno** con combustible.
5. **Minerales** aparecen por altura (carbón, hierro, oro, diamante,
   redstone, esmeralda); mina con el pico de nivel adecuado.
6. **Dormir**: usa la cama para saltar la noche (tres veces seguidas rompe
   la cama, como en MC). El día/noche sigue las franjas oficiales de MC.
7. **Mobs**: los hostiles aparecen de noche y en cuevas; los pasivos
   (vaca, cerdo, oveja, gallina, conejo) dan comida y se pueden criar
   con su comida favorita (modo amor → bebé).
8. **XP y niveles**: los orbes caen de mobs y de minar; la barra de XP
   sube con la curva oficial de MC.
9. **Chat**: escribe `Enter` para abrirlo; `/help` lista los comandos
   (los que requieren **operador** solo los usa el host). Ver la ayuda
   del servidor en [`../server/help.md`](../server/help.md).

## Solución de problemas

- **`mcChunks: 0`, pantalla negra / render vacío** → aprieta `F3` y
  consulta `window.__mc*` (diagnóstico). Suele ser WebGL2 deshabilitado o
  un error de consola. Recarga con `Ctrl+Shift+R`.
- **Sin audio** → comprueba el volumen por categoría en Ajustes (maestro,
  efectos, ambiente) y que el autoplay del navegador esté permitido para
  el sitio.
- **Lento / pocos FPS** → baja la **calidad gráfica** (baja/media/alta) o
  la **distancia de render** en Ajustes.
- **En `localhost` con service worker, cambios no aparecen** → el SW usa
  network-first y cachea la versión nueva al detectarla; si el servidor
  no está accesible usa la caché. Hard-reload (`Ctrl+Shift+R`) fuerza la
  red.
- **Se queda guardada la partida** → los mundos se guardan por semilla en
  el servidor y se recuperan desde **🌍 Mundos**; la semilla elegida
  persiste entre sesiones.
- **El CDN no carga Three.js** → ya no aplica: desde ahora Three.js se
  sirve local (`public/vendor/`). Si la consola muestra errores de red, el
  problema es la conexión con el servidor, no un CDN externo.

## Consejos

- El **pico de madera** es tu primera herramienta: sin él no minas piedra
  conducente a la progresión.
- El **carbón vegetal** (Fase 18) pasa por el horno como el carbón minado:
  horno primero.
- Las **sillas/antorchas** iluminan y marcan tu base; las antorchas tienen
  alcance de luz limitado (7 bloques).
- El **cofre** (27 slots) amplía tu inventario; usa mezclar para no perder
  objetos al romperlo (los drops caen al suelo).
- Juega en **creativo** para explorar la generación de mundo sin
  preocuparte por el hambre o los mobs.