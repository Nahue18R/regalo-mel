# 💛 Para la po — regalo interactivo en pixel art

Un juego 2D pixel art hecho a mano (por código) para Mel.
Nahu llega en su **YBR 125 negra** a **Carlos Gardel 3546, Avellaneda**, frente a la droguería **Del Sud**,
donde Mel lo espera con su **Honda GLH 150 gris**. Le da un ramo, ella abre una carta con el Snoopy que dibujó Nahu y... confeti.

> En la pared, el graffiti de "ALVINAS FERRAN" pasa a decir **ME GUSTAS MAS QUE LEVANTARME TARDE**,
> y en la fachada de Del Sud hay un mural: un corazón gigante con Nahu colgado y la frase
> *"Cualquiera en su sano juicio se habría vuelto loco por vos."*

## 🎬 Cómo se juega

| # | Estado | Qué pasa | Cómo avanza |
|---|--------|----------|-------------|
| 1 | `WAITING` | Mel espera frente a Del Sud (sauces, reja, tanques, graffiti, mural) | Botón **Comenzar** o tocar la pantalla |
| 2 | `ARRIVING` | Nahu llega en la YBR (ruedas girando, humo, líneas de velocidad, sonido de motor, temblor al frenar) | Automático (~4 s) |
| 3 | `GIFT` | Baja de la moto, camina hacia Mel y le da el ramo. Zoom de cámara, 💛, corazones y pétalos | Botón **Ver la carta** (aparece 1 s después) |
| 4 | `CARD_SHOWN` | Aparece la carta: *"Para la mujer más hermosa de todo Villa Domínico y sus alrededores"* | Botón **Abrir carta** o tocar |
| 5 | `CARD_OPEN` | La carta se abre: el dibujo de Snoopy de Nahu y el mensaje, línea por línea | Automático: 2 s después de terminar |
| 6 | `FINAL` | Atardecer, abrazo, confeti y **"Tkm, Nahu 💛"** | Botones **Leer la carta** y **Reiniciar** |

También funciona con teclado (Enter / Espacio) y hay un botón 🔊 para silenciar.

### 🎵 Música

Arriba a la izquierda está el botón **▶**: abre un reproductor chiquito de YouTube
(`mlrozstOdSI`) que arranca solo, y mientras suena los efectos del juego bajan de volumen. Si el navegador
no lo reproduce solo, se toca play en el reproductor; y si el video no se puede ver incrustado, está el link
*"Abrir en YouTube"*. El video se carga recién al tocar el botón. Funciona desde la web publicada
(Netlify); abriendo el archivo local, YouTube puede no reproducirlo.

## 📁 Archivos

```
index.html   estructura: canvas + capa de UI (botones HTML accesibles)
style.css    layout 16:9 responsivo, botones, animaciones (bounce, pop, blink)
script.js    todo el juego: pixel art, animación, cámara, audio y máquina de estados
snoopy-nahu.png  el dibujo de Snoopy hecho a mano por Nahu (solo el trazo, fondo transparente)
README.md    este archivo
.gitignore
```

Sin librerías ni fuentes externas: **~150 KB en total**. La única imagen es el dibujo de Nahu; todo lo demás se genera por código.

## 🛠️ Cómo está hecho

- **Pixel art generado por código.** El mundo se dibuja en un canvas de **512×288** y se escala ×2 a
  **1024×576** sin suavizado. El canvas principal usa el `devicePixelRatio` para que el texto de la carta
  se vea nítido en celulares.
- **Mini rasterizador (`Grid`).** Arma sprites con elipses, polígonos y cápsulas, y les pone contorno de 1px
  automáticamente. Así están hechos el ramo, las motos, el graffiti, el mural, el logo de Del Sud y los corazones;
  se generan una sola vez y quedan en caché.
- **Personajes por partes.** Mel (pelo largo negro, campera de cuero, cinturón con hebilla, jean) y Nahu
  (pelo despeinado, lentes con vidrio azul, barba, campera Adidas negra) se dibujan pixel por pixel, con
  poses para caminar, andar en moto, dar el ramo y abrazarse. Además parpadean y a Mel le va creciendo la sonrisa.
- **Máquina de estados** (`setState` / `onEnter` / `update`): cada animación depende del tiempo que lleva el
  estado actual, así que no se desincroniza aunque baje el FPS.
- **Cámara** con plano general al inicio y zoom suave sobre la pareja, siempre con el graffiti de fondo.
- **Audio con Web Audio API** (sin archivos): motor, pasos, pata de apoyo, "pop", brillitos, papel y una
  melodía chiptune al final. Arranca recién con el primer toque, como exigen los navegadores.
- **Accesibilidad:** botones reales con foco visible, `aria-label` en el canvas, región `aria-live` que lee
  la carta y respeto por `prefers-reduced-motion`.

### Cambiar textos o tiempos

Todo está arriba de `script.js`:

- `TIMING`: duración de cada parte (por ejemplo, `readHold` es la pausa antes del final y `charsPerSecond`
  la velocidad con la que se escribe la carta).
- `CARD_FRONT` / `CARD_INSIDE`: el texto de la carta.
- `SONG_ID`: la canción de YouTube.
- `buildMural()`: el mural del corazón.
- `LAYOUT`: dónde está cada cosa en la escena.
- `buildGraffiti()`: la frase de la pared.

### Probar una escena directamente

Para revisar una escena sin pasar por todo el recorrido, agregá `?escena=` a la URL (y opcionalmente `t=` en segundos):

```
index.html?escena=gift&t=5
index.html?escena=card_open&t=3
index.html?escena=final
```

## 💻 Probar localmente

```bash
git clone https://github.com/Nahue18R/regalo-mel.git
cd regalo-mel
python3 -m http.server 8000   # o simplemente abrir index.html
# → http://localhost:8000
```

## 🚀 Publicar en Netlify y armar el QR

1. En [Netlify](https://app.netlify.com): **Add new site → Import an existing project** → elegir el repo `Nahue18R/regalo-mel`.
2. Dejar vacíos el *build command* y el *publish directory* (es un sitio estático). **Deploy**.
3. Cada `git push` a la rama principal se publica solo.
4. Generar el QR con la URL final (por ejemplo `https://regalo-mel.netlify.app`) y mandarlo por WhatsApp o Instagram.

**Tip:** en el celu se ve mejor horizontal 📱↻.

## ✅ Compatibilidad

Chrome, Firefox, Safari y Edge actuales, iOS Safari y Chrome Android. Corre a 60 FPS: el escenario
estático está pre-renderizado y en cada frame solo se redibujan las partes que se mueven.

---

Hecho con 💛 por Nahu para la po.
