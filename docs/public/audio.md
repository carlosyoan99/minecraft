# Cliente — Mecánica: audio procedural

> Fichero por mecánica del proyecto. Índice: [`mecanicas.md`](./mecanicas.md).
> Código: `public/audio.js`, `public/musicpalette.js`.

## Cómo funciona actualmente

- Todo el sonido se **genera al vuelo** con buffers de ruido y osciladores
  (Web Audio API): pasos por material, rotura/colocación, comer, comer
  crudo, cría, agua, salpicaduras, cofres, TNT, hiss del creeper y balido
  de oveja (F11), ambiente (viento de día, grillos de noche).
- **Sonidos de paridad (F18 C-9):** muerte de mob (tono descendente por
  tipo — hostil grave, abeja aguda, `mob_death`), golpe por arma (espada
  metálica vs golpe sordo, `mob_hit` lleva el `tool` del atacante), flecha
  al impactar (thock al desaparecer del broadcast de flechas) y beber
  (sorbo que acompaña al comer — el clon no tiene ítems bebibles).
- **Música ambiental generativa (F10):** pad pentatónico procedural
  (`startMusic`/`padNote`) que varía con el día/noche y con el **contexto**
  (`setMusicContext`): cueva → notas graves y espaciadas, desierto →
  brillante, nieve → cristalina.
- **Por bioma (F19.5 A1):** el servidor envía el **bioma real** del jugador
  al cruzar de bioma (`biome_update`, 1 check/s); `musicpalette.js` (lógica
  pura) define la **paleta por bioma** (jungla exótica amplia, pantano
  grave, océano ondulada, montaña vacía/espaciada, nieve/taiga cristalina,
  desierto brillante, bosque/llanura base); `audio.js` aplica **cueva >
  bioma > día/noche** (`setMusicBiome`). Sin bioma (servidor viejo) cae a
  la heurística por bloque.
- El contexto (techo encima → cueva; arena/nieve bajo los pies → desierto/
  frío) se detecta en `player.js`; el bioma real llega por red.
- El contexto se crea/reanuda en el **primer gesto del usuario** (requisito
  de los navegadores para permitir audio).
- **Volúmenes por categoría** (master/effects/ambient) en serie hacia el
  master — los ajusta el menú (`setVolume`); el silencio persiste en
  `localStorage`.

## Por qué así (decisión)

- **Procedural = cero assets** y sonido siempre presente, coherente con la
  filosofía del proyecto.
- **Gains por categoría** en vez de volumen por clip: es la arquitectura de
  buses que recomienda la skill `audio-design` (balance global, no
  per-clip).
- **Gesto del usuario** para el AudioContext: sin él el audio no arranca
  (política de navegadores).
- **Bioma real por red** (F19.5) en vez de heurística: el servidor ya sabe
  el bioma; la heurística queda como fallback para servidores viejos.

## Mejoras a futuro

1. **Reverb por bioma/contexto** — una convolución sencilla (cueva eco, túnel)
   daría mucho realismo; coste medio (ConvolverNode).
2. **Sonidos de estructuras/mobs nuevos** (F21): vaca (muu), gallina (cloc),
   enderman (teleport) — mismos patrones sintetizados.
3. **Música por hora del día** además del bioma — el pad ya varía con el
   día/noche; refinar la transición entre fases.
4. **Volumen 3D posicional** — los sonidos de mobs/explosiones son planos;
   `PannerNode` los espacializaría (coste bajo, decisión de calidad).

## Constantes, funciones, cambios y resultados

| Constante / función | Valor / firma | Uso |
|---|---|---|
| `setMusicContext(contexto)` | cueva/bioma/día-noche | Música ambiental |
| `setMusicBiome(bioma)` | paleta | Paleta por bioma (F19.5) |
| `biome_update` | evento WS | Bioma real del jugador (1 check/s) |
| `musicpalette.js` | tabla bioma → paleta | Lógica pura testeable |
| `setVolume(categoria, valor)` | — | Buses master/effects/ambient |
| `playBreak` / `playEat` / `playFeed` / ... | — | Efectos sintetizados |
| `mob_death` / `mob_hit` / thock / sorbo | — | Sonidos de paridad (C-9) |

### Cambios a realizar y resultados esperados

| Cambio | Resultado esperado |
|---|---|
| Sonidos de mobs F21 | Muu/cloc/teleport sintetizados; hooks en `mob_death`/interacción |
| Reverb por contexto | `ConvolverNode` en cueva; toggle de calidad |
| PannerNode posicional | Sonidos espacializados; sin cambios de protocolo |
