/* =========================================================================
 * Regalo para Mel — juego 2D pixel art
 * -------------------------------------------------------------------------
 * Todo se dibuja por código (sin imágenes externas):
 *   - El "mundo" se pinta en un canvas de baja resolución (512x288) y se
 *     escala x2 sin suavizado → pixel art nítido.
 *   - Los sprites complejos (ramo, motos, graffiti, mural...) se generan
 *     una sola vez con un mini rasterizador (clase Grid) y quedan cacheados.
 *   - La carta, el confeti y el título final se dibujan en alta resolución
 *     sobre el canvas principal para que el texto se lea perfecto.
 *
 * Flujo (máquina de estados):
 *   WAITING → ARRIVING → GIFT → CARD_SHOWN → CARD_OPEN → FINAL
 * ========================================================================= */
(() => {
  'use strict';

  /* =======================================================================
   * 1. CONFIGURACIÓN
   * ===================================================================== */

  const VIEW_W = 1024;            // resolución lógica del canvas principal
  const VIEW_H = 576;
  const PX = 2;                   // tamaño de cada "pixel" del pixel art
  const W = VIEW_W / PX;          // 512: ancho del mundo en baja resolución
  const H = VIEW_H / PX;          // 288

  // Posiciones clave del mundo (coordenadas de baja resolución)
  const LAYOUT = {
    wallTop: 116,
    wallBottom: 198,
    sidewalkBottom: 226,
    streetTop: 231,
    melX: 300,                    // Mel: centro-derecha
    melY: 226,
    glhX: 408,                    // la Honda GLH de Mel, estacionada
    glhY: 250,
    rideY: 256,                   // carril por donde llega Nahuel
    motoStartX: -40,              // entra desde fuera del canvas (-80px reales)
    motoEndX: 150,                // estaciona frente a Mel
  };

  // Tiempos (segundos)
  const TIMING = {
    arrive: 3.8,                  // duración de la llegada en moto
    arrivePause: 0.5,             // pausa antes de bajarse
    dismount: 1.0,
    walk: 2.2,
    showBouquet: 0.6,
    handOver: 1.0,
    cardButtonDelay: 1.0,         // "Ver la carta" aparece 1s después de la entrega
    cardIn: 0.5,
    cardFlip: 0.8,
    charsPerSecond: 30,           // velocidad con la que se "escribe" la carta
    readHold: 2.0,                // pausa al terminar la carta antes del final
  };

  // Paleta general
  const PAL = {
    sky: ['#4c9fe0', '#6cb8ec', '#87CEEB', '#a6dcf2', '#c9ecf7'],
    skySunset: ['#3a2c6e', '#6b4a93', '#b0679f', '#e98f8c', '#f8b27c', '#ffd9a0'],
    street: '#9BA89A',
    wall: '#A9A9A9',
    willow: ['#1f3b0e', '#2D5016', '#3c6a1e', '#528a2a', '#6aa638'],
    fence: '#4A4A4A',
    ink: '#1a1a1a',
    white: '#FFFFFF',
    red: '#DC143C',
    pink: '#FF69B4',
    yellow: '#FFD700',
    purple: '#800080',
    stem: '#228B22',
    paper: '#FFF8DC',
  };

  const MEL = {
    hair: '#171012', hairHi: '#3b2a2e',
    skin: '#F4A460', skinSh: '#d8894c', blush: '#f77d7d', lip: '#b8384a', eye: '#1c1010',
    jacket: '#1c1c20', jacketHi: '#4b4b55', sweater: '#0b0b0d',
    belt: '#090909', buckle: '#e2e2e2',
    jeans: '#76a6da', jeansSh: '#5585c0', jeansHi: '#9cc2ea',
    shoe: '#0c0c0c',
  };

  const NAHU = {
    hair: '#1e1611', hairHi: '#3d2c22',
    skin: '#F4A460', skinSh: '#d8894c', beard: '#8a5a3c', lip: '#a4503e', eye: '#1c1010',
    frame: '#26262b', lens: '#6cc4ff',
    jacket: '#141416', jacketHi: '#34343c', stripe: '#f0f0f0',
    pants: '#707178', pantsSh: '#56575d',
    shoe: '#101010', sole: '#dedede',
  };

  /* =======================================================================
   * 2. UTILIDADES
   * ===================================================================== */

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (t, start, dur) => clamp((t - start) / dur, 0, 1);
  const Ease = {
    inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outSine: (t) => Math.sin((t * Math.PI) / 2),
    outCubic: (t) => 1 - Math.pow(1 - t, 3),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  // PRNG con semilla: el escenario sale siempre igual
  function makeRng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = Math.random;
  const pick = (arr, r = rand) => arr[Math.floor(r() * arr.length)];

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return [c, g];
  }

  function hexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /* ---------- Primitivas de pixel art (sobre un contexto de baja resolución) ---------- */

  function rect(g, x, y, w, h, c) {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), w, h);
  }

  // Círculo relleno pixel perfect (una fila por scanline)
  function disc(g, cx, cy, r, c) {
    g.fillStyle = c;
    cx = Math.round(cx);
    cy = Math.round(cy);
    for (let dy = -r; dy <= r; dy++) {
      const dx = Math.floor(Math.sqrt(r * r - dy * dy) + 0.35);
      g.fillRect(cx - dx, cy + dy, dx * 2 + 1, 1);
    }
  }

  // Línea de Bresenham, grosor 1px
  function line(g, x0, y0, x1, y1, c) {
    g.fillStyle = c;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  /* ---------- Grid: mini rasterizador para sprites cacheados ----------
   * Se construyen máscaras (elipses, polígonos, cápsulas...) y se "pintan"
   * con relleno + contorno de 1px. Pintar una forma encima de otra con
   * contorno genera automáticamente las líneas internas del dibujo.        */
  class Grid {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.px = new Array(w * h).fill(null);
    }

    _mask(test) {
      const m = new Uint8Array(this.w * this.h);
      for (let y = 0; y < this.h; y++) {
        for (let x = 0; x < this.w; x++) {
          if (test(x + 0.5, y + 0.5)) m[y * this.w + x] = 1;
        }
      }
      return m;
    }

    ellipse(cx, cy, rx, ry) {
      return this._mask((x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);
    }

    circle(cx, cy, r) {
      return this.ellipse(cx, cy, r, r);
    }

    rect(x, y, w, h) {
      return this._mask((px, py) => px >= x && px < x + w && py >= y && py < y + h);
    }

    poly(pts) {
      return this._mask((x, y) => {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i], [xj, yj] = pts[j];
          if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      });
    }

    // Segmento con grosor (radio r)
    capsule(x1, y1, x2, y2, r) {
      const vx = x2 - x1, vy = y2 - y1, len2 = vx * vx + vy * vy || 1;
      return this._mask((x, y) => {
        const t = clamp(((x - x1) * vx + (y - y1) * vy) / len2, 0, 1);
        const dx = x - (x1 + vx * t), dy = y - (y1 + vy * t);
        return dx * dx + dy * dy <= r * r;
      });
    }

    union(...masks) {
      const m = new Uint8Array(this.w * this.h);
      for (const k of masks) for (let i = 0; i < m.length; i++) m[i] |= k[i];
      return m;
    }

    // Recorta una máscara con un predicado (x, y) → bool
    filter(mask, fn) {
      const m = new Uint8Array(mask);
      for (let i = 0; i < m.length; i++) if (m[i] && !fn(i % this.w, (i / this.w) | 0)) m[i] = 0;
      return m;
    }

    paint(mask, fill, outline = null) {
      const { w, h } = this;
      if (outline) {
        for (let i = 0; i < mask.length; i++) {
          if (!mask[i]) continue;
          const x = i % w, y = (i / w) | 0;
          if (x > 0 && !mask[i - 1]) this.px[i - 1] = outline;
          if (x < w - 1 && !mask[i + 1]) this.px[i + 1] = outline;
          if (y > 0 && !mask[i - w]) this.px[i - w] = outline;
          if (y < h - 1 && !mask[i + w]) this.px[i + w] = outline;
        }
      }
      for (let i = 0; i < mask.length; i++) if (mask[i]) this.px[i] = fill;
      return this;
    }

    dot(x, y, c) {
      if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c;
      return this;
    }

    dots(list, c) {
      for (const [x, y] of list) this.dot(x, y, c);
      return this;
    }

    line(x0, y0, x1, y1, c) {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
      for (let i = 0; i <= n; i++) this.dot(Math.round(lerp(x0, x1, i / n)), Math.round(lerp(y0, y1, i / n)), c);
      return this;
    }

    toCanvas() {
      const [c, g] = makeCanvas(this.w, this.h);
      const img = g.createImageData(this.w, this.h);
      const cache = {};
      for (let i = 0; i < this.px.length; i++) {
        const col = this.px[i];
        if (!col) continue;
        const rgb = cache[col] || (cache[col] = hexToRgb(col));
        img.data[i * 4] = rgb[0];
        img.data[i * 4 + 1] = rgb[1];
        img.data[i * 4 + 2] = rgb[2];
        img.data[i * 4 + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c;
    }
  }

  /* ---------- Fuente pixel 5x7 (graffiti, carteles) ---------- */
  const FONT = {
    A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
    H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    I: ['.###.', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
    O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
    T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
    '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
    '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
    '4': ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
    '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
    '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
    '.': ['.....', '.....', '.....', '.....', '.....', '.....', '..#..'],
    '♥': ['.....', '.#.#.', '#####', '#####', '.###.', '..#..', '.....'],
    // minúsculas (cartel de la droguería y la firma)
    a: ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
    d: ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
    e: ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
    g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
    í: ['...#.', '..#..', '.##..', '..#..', '..#..', '..#..', '.###.'],
    l: ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
    o: ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
    r: ['.....', '.....', '#.##.', '##..#', '#....', '#....', '#....'],
    u: ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
    ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  };

  // Recorre los pixeles "encendidos" de un texto: cb(x, y) en unidades de fuente
  function eachGlyphPixel(text, cb, spacing = 1) {
    let cx = 0;
    for (const ch of text) {
      const glyph = FONT[ch] || FONT[' '];
      for (let y = 0; y < 7; y++) for (let x = 0; x < 5; x++) if (glyph[y][x] === '#') cb(cx + x, y, ch);
      cx += 5 + spacing;
    }
    return cx - spacing;
  }

  // Fuente mini 3x5 (texto del mural)
  const TINY = {
    A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'],
    C: ['.##', '#..', '#..', '#..', '.##'], E: ['###', '#..', '##.', '#..', '###'],
    H: ['#.#', '#.#', '###', '#.#', '#.#'], I: ['###', '.#.', '.#.', '.#.', '###'],
    J: ['..#', '..#', '..#', '#.#', '.#.'], L: ['#..', '#..', '#..', '#..', '###'],
    N: ['##.', '#.#', '#.#', '#.#', '#.#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
    P: ['##.', '#.#', '##.', '#..', '#..'], Q: ['.#.', '#.#', '#.#', '##.', '.##'],
    R: ['##.', '#.#', '##.', '#.#', '#.#'], S: ['.##', '#..', '.#.', '..#', '##.'],
    T: ['###', '.#.', '.#.', '.#.', '.#.'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
    V: ['#.#', '#.#', '#.#', '#.#', '.#.'], '.': ['...', '...', '...', '...', '.#.'],
    ' ': ['...', '...', '...', '...', '...'],
  };

  function tinyText(g, text, x, y, color) {
    g.fillStyle = color;
    let cx = x;
    for (const ch of text) {
      const gl = TINY[ch] || TINY[' '];
      for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (gl[r][k] === '#') g.fillRect(cx + k, y + r, 1, 1);
      cx += 4;
    }
  }

  function pixelText(g, text, x, y, color, size = 1) {
    g.fillStyle = color;
    eachGlyphPixel(text, (px, py) => g.fillRect(x + px * size, y + py * size, size, size));
  }

  /* =======================================================================
   * 3. SPRITES CACHEADOS
   * ===================================================================== */

  /* ---------- Corazones pixel ---------- */
  function buildHeart(size, fill, outline, shine) {
    const s = size;
    const G = new Grid(s + 2, s + 2);
    const r = s / 4;
    const m = G.union(
      G.circle(1 + r, 1 + r + 0.3, r + 0.2),
      G.circle(1 + s - r, 1 + r + 0.3, r + 0.2),
      G.poly([[1 + 0.2, 1 + r + 0.6], [1 + s - 0.2, 1 + r + 0.6], [1 + s / 2, 1 + s - 0.2]])
    );
    G.paint(m, fill, outline);
    if (shine) G.dots([[1 + Math.round(r) - 1, 1 + Math.round(r) - 1]], shine);
    return G.toCanvas();
  }

  /* ---------- Ramo mixto grande (mundo, 16x20) ---------- */
  function buildBouquet() {
    const G = new Grid(16, 21);
    // tallos que asoman abajo (6 tallos)
    for (let i = 0; i < 6; i++) G.line(5 + i, 15, 6 + (i >> 1), 20, i % 2 ? '#1c6e1c' : PAL.stem);
    // hojas de relleno
    G.paint(G.ellipse(2.2, 9, 2.2, 1.2), '#3a9a3a', '#1b5e1b');
    G.paint(G.ellipse(13.8, 8.5, 2.2, 1.2), '#3a9a3a', '#1b5e1b');
    // 2 flores rosas
    for (const [x, y] of [[3.2, 5.8], [12.8, 5.4]]) {
      G.paint(G.circle(x, y, 2), PAL.pink, '#b83a7c');
      G.dot(Math.floor(x) - 1, Math.floor(y) - 1, '#ffc0df');
    }
    // 2 girasoles chiquitos
    for (const [x, y] of [[5, 2.6], [11.2, 2.4]]) {
      G.paint(G.circle(x, y, 2.1), PAL.yellow, '#b88a00');
      G.dot(Math.floor(x), Math.floor(y), '#6b3d12');
    }
    // flor blanca (interior)
    G.paint(G.circle(8, 6.6, 1.8), '#ffffff', '#b9b9c8');
    G.dot(8, 6, PAL.yellow);
    // 3 rosas rojas grandes
    for (const [x, y] of [[5.4, 8.6], [10.6, 8.6], [8, 3.4]]) {
      G.paint(G.circle(x, y, 2.35), PAL.red, '#7c0b22');
      G.dot(Math.floor(x) - 1, Math.floor(y) - 1, '#ff5c78');
      G.dot(Math.floor(x), Math.floor(y), '#a30f2e');
    }
    // papel envoltorio blanco/rosa
    const paper = G.poly([[0.6, 10.2], [15.4, 10.2], [10.4, 18.6], [5.6, 18.6]]);
    G.paint(paper, '#f9c9d8', '#d98aa6');
    G.paint(G.filter(paper, (x) => x === 7 || x === 8), '#fff0f5');
    G.paint(G.filter(paper, (x, y) => y === 10 && x % 3 === 0), '#ffffff');
    // moño
    G.dots([[5, 14], [6, 14], [5, 15], [6, 15], [9, 14], [10, 14], [9, 15], [10, 15]], '#e63946');
    G.dots([[7, 14], [8, 14], [7, 15], [8, 15]], '#ff6b78');
    return G.toCanvas();
  }

  /* ---------- Motos (vista lateral, mirando a la derecha) ----------
   * Se cachea el cuerpo; las ruedas se dibujan en cada frame para girar.
   * Suelo en y=35, ejes de ruedas en y=28.                              */
  const MOTO_W = 58, MOTO_H = 36;
  const WHEELS = { rearX: 11, frontX: 46, y: 28, r: 7 };

  function buildYBR(kickstand) {
    const G = new Grid(MOTO_W, MOTO_H);
    const K = '#050505', body = '#161616', hi = '#4d4d52', chrome = '#c4c9cf', chromeHi = '#f2f4f7', gray = '#7c7f86';
    // pata de apoyo
    if (kickstand) G.line(25, 30, 21, 35, '#2a2a2a');
    // escape cromado largo (tipo YBR)
    G.paint(G.capsule(24, 29, 5, 25, 1.7), chrome, '#55585e');
    G.line(7, 24, 22, 27, chromeHi);
    G.paint(G.capsule(5, 25, 3, 24.6, 1.4), '#3a3a3a');
    // basculante y amortiguador
    G.paint(G.capsule(11, 28, 23, 26, 1.1), '#222', K);
    G.line(15, 18, 13, 26, chrome);
    G.line(16, 18, 14, 26, '#8d9299');
    // motor
    G.paint(G.poly([[21, 20], [33, 20], [34, 27], [30, 30], [22, 30], [20, 26]]), '#6b6d72', K);
    G.paint(G.poly([[23, 22], [31, 22], [31, 27], [23, 27]]), '#9fa3a9');
    for (let x = 24; x <= 30; x += 2) G.line(x, 22, x, 26, '#7b7f85');
    G.paint(G.circle(25, 28, 1.6), '#b8bcc2', K);
    // chasis
    G.line(34, 12, 31, 24, '#262626');
    G.line(35, 12, 32, 24, '#262626');
    // tapa lateral
    G.paint(G.poly([[14, 17], [25, 16], [23, 21], [16, 21]]), body, K);
    G.line(16, 18, 22, 18, hi);
    // guardabarro trasero + portaplaca + luz
    G.paint(G.poly([[2, 15], [10, 14.5], [11, 18], [4, 19]]), body, K);
    G.paint(G.rect(1, 15, 2, 2), '#e02424');
    G.dot(1, 15, '#ff8a8a');
    // asiento
    G.paint(G.poly([[6, 13.5], [24, 12.2], [27, 15], [25, 16.5], [8, 16.5]]), '#0e0e0e', K);
    G.line(9, 14, 23, 13, '#3b3b3b');
    // tanque negro brillante
    const tank = G.poly([[24, 12], [30, 8.2], [38.5, 8.6], [41, 13.5], [36, 17], [26, 17]]);
    G.paint(tank, body, K);
    G.line(29, 10, 37, 9.8, hi);
    G.line(28, 11, 32, 10.6, '#8a8a92');
    G.dots([[30, 13], [31, 13], [32, 13], [33, 13]], '#c8102e'); // logo YBR
    G.dots([[34, 13], [35, 13]], '#e8e8e8');
    // horquilla
    G.paint(G.capsule(39, 9, 46, 28, 1.2), chrome, '#55585e');
    G.line(39, 9, 45, 27, chromeHi);
    // guardabarro delantero
    G.paint(G.poly([[40, 19.5], [48, 18.5], [53, 21], [50, 22], [42, 21.5]]), body, K);
    // faro redondo
    G.paint(G.circle(45, 11, 2.9), chrome, '#55585e');
    G.paint(G.circle(45.6, 11, 1.8), '#fff6c4');
    G.dot(46, 10, '#ffffff');
    // manubrio + espejo
    G.line(36, 6, 41, 5, chrome);
    G.line(36, 5, 38, 5, K);
    G.line(38, 5, 37, 1, gray);
    G.paint(G.rect(36, 0, 3, 2), K);
    // posapié
    G.line(27, 26, 30, 26, '#2a2a2a');
    return G.toCanvas();
  }

  function buildGLH() {
    const G = new Grid(MOTO_W, MOTO_H);
    const K = '#050505', gray = '#8d9096', grayHi = '#c3c6cc', graySh = '#63666c', blk = '#18181a', chrome = '#b9bec5';
    // pata de apoyo
    G.line(25, 30, 21, 35, '#2a2a2a');
    // escape negro con protector plateado
    G.paint(G.capsule(24, 29, 6, 23, 1.8), '#232326', K);
    G.paint(G.capsule(16, 25.5, 8, 23.2, 1.2), chrome);
    // basculante, amortiguador
    G.paint(G.capsule(11, 28, 23, 26, 1.1), '#222', K);
    G.line(15, 17, 13, 26, '#d4a017');
    G.line(16, 17, 14, 26, '#8c6a0e');
    // motor
    G.paint(G.poly([[21, 20], [33, 20], [34, 27], [30, 30], [22, 30], [20, 26]]), '#5e6066', K);
    G.paint(G.poly([[23, 22], [31, 22], [31, 27], [23, 27]]), '#8c9096');
    for (let x = 24; x <= 30; x += 2) G.line(x, 22, x, 26, '#6d7177');
    // parrilla trasera
    G.paint(G.rect(1, 11, 11, 1.5), '#222', K);
    G.line(2, 12, 4, 15, '#222');
    // guardabarro trasero + luz
    G.paint(G.poly([[2, 14], [11, 14], [12, 18], [4, 19]]), blk, K);
    G.paint(G.rect(1, 14.5, 2, 2), '#e02424');
    // tapa lateral gris con calco negra
    G.paint(G.poly([[13, 16], [25, 15.5], [23, 21], [15, 21]]), gray, K);
    G.line(15, 19, 22, 18, blk);
    // asiento
    G.paint(G.poly([[5, 12.5], [24, 11.5], [27, 14.5], [25, 16], [7, 16]]), '#111', K);
    G.line(8, 13, 23, 12.4, '#3b3b3b');
    // tanque gris con paneles negros
    const tank = G.poly([[24, 11.5], [29, 7], [39, 7.2], [42, 12.5], [37, 17.5], [26, 17]]);
    G.paint(tank, gray, K);
    G.paint(G.filter(tank, (x, y) => y > 13 && x > 28), graySh);
    G.paint(G.poly([[30, 13], [38, 12], [36, 16], [30, 16]]), blk);
    G.line(29, 9, 38, 8.5, grayHi);
    G.dots([[31, 14], [32, 14], [33, 14]], '#c8102e');
    // horquilla (barras negras)
    G.paint(G.capsule(40, 8, 46, 28, 1.3), '#2a2a2e', K);
    G.line(40, 9, 45, 26, '#6c6c74');
    // guardabarro delantero
    G.paint(G.poly([[40, 19.5], [48, 18.5], [53, 21], [50, 22], [42, 21.5]]), gray, K);
    // faro angular con carenado
    G.paint(G.poly([[41, 7], [48, 8], [49, 13], [44, 15], [42, 12]]), blk, K);
    G.paint(G.poly([[44, 9], [48, 9.5], [48.5, 12], [45, 13]]), '#e9f4ff');
    G.dot(47, 10, '#ffffff');
    // manubrio + espejo
    G.line(36, 5, 41, 4, chrome);
    G.line(38, 4, 37, 0, '#555');
    G.paint(G.rect(35, 0, 3, 1.5), K);
    return G.toCanvas();
  }

  // Rueda con rayos que giran (angle en radianes)
  function drawWheel(g, cx, cy, angle, style) {
    const r = WHEELS.r;
    disc(g, cx, cy, r, '#080808');
    disc(g, cx, cy, r - 1, '#1d1d1f');
    disc(g, cx, cy, r - 2, style === 'ybr' ? '#7d8087' : '#2c2c30');
    disc(g, cx, cy, r - 3, style === 'ybr' ? '#2a2a2e' : '#151517');
    const spokeCol = style === 'ybr' ? '#a8adb4' : '#4a4a52';
    for (let i = 0; i < 5; i++) {
      const a = angle + (i / 5) * Math.PI * 2;
      line(g, cx, cy, cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), spokeCol);
    }
    disc(g, cx, cy, 1, style === 'ybr' ? '#d8dce2' : '#8a8a92');
    // highlight del neumático
    rect(g, cx - 3, cy - r + 1, 3, 1, '#3b3b40');
  }

  /* ---------- Nubes ---------- */
  function buildCloud(seed) {
    const r = makeRng(seed);
    const w = 34 + Math.floor(r() * 22), h = 16;
    const G = new Grid(w + 2, h + 2);
    const parts = [];
    const n = 4 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const cx = 5 + (i / (n - 1)) * (w - 10);
      const rad = 3.5 + r() * 3 + (i > 0 && i < n - 1 ? 2 : 0);
      parts.push(G.circle(cx, h - rad + 0.5, rad));
    }
    parts.push(G.rect(3, h - 4, w - 5, 4));
    const m = G.union(...parts);
    G.paint(m, '#ffffff');
    G.paint(G.filter(m, (x, y) => y >= h - 2), '#dcebf5');
    return G.toCanvas();
  }

  /* ---------- Graffiti: "ME GUSTAS MAS QUE LEVANTARME TARDE" ---------- */
  function buildGraffiti() {
    const lines = ['ME GUSTAS MAS QUE', 'LEVANTARME TARDE'];
    const G = new Grid(216, 42);
    const fill = new Uint8Array(G.w * G.h);
    const shade = new Uint8Array(G.w * G.h);
    const rng = makeRng(77);
    const jitter = [];
    lines.forEach((ln, li) => {
      const ox = li === 0 ? 2 : 10;
      const oy = 2 + li * 19;
      eachGlyphPixel(ln, (px, py) => {
        // inclinación leve + saltito por letra (estilo tag)
        const letter = Math.floor(px / 6);
        if (jitter[li * 40 + letter] === undefined) jitter[li * 40 + letter] = Math.round(rng() * 2 - 1);
        const jy = jitter[li * 40 + letter];
        const bx = ox + px * 2 + Math.floor((6 - py) / 3);
        const by = oy + py * 2 + jy;
        for (let dy = 0; dy < 3; dy++) {
          for (let dx = 0; dx < 3; dx++) {
            const i = (by + dy) * G.w + bx + dx;
            if (i >= 0 && i < fill.length) fill[i] = 1;
          }
        }
      });
    });
    // sombra desplazada (3D), contorno blanco grueso, relleno negro
    const shadow = new Uint8Array(fill.length);
    for (let i = 0; i < fill.length; i++) if (fill[i] && i + G.w + 1 < fill.length) shadow[i + G.w * 2 + 2] = 1;
    G.paint(shadow, '#7c7c80');
    // contorno doble (blanco), dilatando la máscara
    const grow = new Uint8Array(fill);
    for (let i = 0; i < fill.length; i++) {
      if (!fill[i]) continue;
      const x = i % G.w;
      if (x > 0) grow[i - 1] = 1;
      if (x < G.w - 1) grow[i + 1] = 1;
      if (i - G.w >= 0) grow[i - G.w] = 1;
      if (i + G.w < fill.length) grow[i + G.w] = 1;
    }
    G.paint(grow, '#ffffff', '#2a2a2a');
    G.paint(fill, PAL.ink);
    // brillos en la parte alta de cada trazo
    for (let i = G.w; i < fill.length; i++) if (fill[i] && !fill[i - G.w] && rng() > 0.35) shade[i] = 1;
    G.paint(shade, '#4a4a52');
    // chorreaduras
    for (let k = 0; k < 9; k++) {
      const x = 8 + Math.floor(rng() * 196);
      for (let y = G.h - 1; y > 0; y--) {
        if (fill[y * G.w + x]) {
          const len = 2 + Math.floor(rng() * 4);
          for (let d = 1; d <= len && y + d < G.h; d++) G.dot(x, y + d, PAL.ink);
          break;
        }
      }
    }
    return G.toCanvas();
  }

  /* =======================================================================
   * 4. ESCENARIO ESTÁTICO (se dibuja una vez)
   * ===================================================================== */

  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  // Cielo con degradado "dithered" (estilo retro)
  function buildSky(stops) {
    const [c, g] = makeCanvas(W, H);
    const img = g.createImageData(W, H);
    const cols = stops.map(hexToRgb);
    const horizon = 150;
    for (let y = 0; y < H; y++) {
      const f = clamp(y / horizon, 0, 1) * (cols.length - 1);
      const base = Math.min(Math.floor(f), cols.length - 2);
      const frac = f - base;
      for (let x = 0; x < W; x++) {
        const col = frac * 16 > BAYER[(x & 3) + (y & 3) * 4] ? cols[base + 1] : cols[base];
        const i = (y * W + x) * 4;
        img.data[i] = col[0];
        img.data[i + 1] = col[1];
        img.data[i + 2] = col[2];
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  // Tanque cilíndrico blanco con techo en cúpula
  function drawTank(g, tx, tw, tTop, rng, band) {
    const { wallTop } = LAYOUT;
    const ramp = ['#f4f6f7', '#e8ebed', '#d9dde0', '#c7cdd1', '#b3bac0', '#a0a8ae'];
    for (let x = 0; x < tw; x++) {
      const k = Math.min(ramp.length - 1, Math.floor(Math.abs(x / tw - 0.3) * 1.7 * ramp.length));
      rect(g, tx + x, tTop, 1, wallTop - tTop, ramp[k]);
    }
    for (let y = 0; y < 8; y++) {
      const half = Math.round((tw / 2) * Math.sqrt(1 - Math.pow((8 - y) / 8.5, 2)));
      rect(g, tx + tw / 2 - half, tTop - 8 + y, half * 2, 1, y < 3 ? '#e4e7e9' : '#d3d8db');
    }
    rect(g, tx, tTop - 1, tw, 1, '#a9b0b6');
    if (band) rect(g, tx, tTop + 40, tw, 2, '#8e969c');
    for (let i = 0; i < 5; i++) {
      const x = tx + 5 + Math.floor(rng() * (tw - 10)), y = tTop + 4 + Math.floor(rng() * 40);
      rect(g, x, y, 1, 3 + Math.floor(rng() * 8), '#c2b8a8');
    }
  }

  // Escalera con jaula de seguridad
  function drawCageLadder(g, x, top, bottom) {
    const c = '#f2f4f5', d = '#9aa2a8';
    rect(g, x, top, 1, bottom - top, c);
    rect(g, x + 7, top, 1, bottom - top, c);
    rect(g, x + 1, top, 1, bottom - top, d);
    for (let y = top + 2; y < bottom; y += 5) rect(g, x, y, 8, 1, y % 2 ? c : '#dfe3e6');
    for (let y = top + 4; y < bottom; y += 4) rect(g, x + 3, y, 2, 1, d);
  }

  // Logo de Del Sud: cubos hexagonales blancos
  function buildDelSudLogo() {
    const G = new Grid(20, 20);
    const hex = (cx, cy, r) => {
      const pts = [];
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i * Math.PI) / 3;
        pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return pts;
    };
    const cube = (cx, cy, r) => {
      G.paint(G.poly(hex(cx, cy, r)), '#ffffff', '#1b4596');
      // aristas internas del cubo
      G.line(Math.round(cx), Math.round(cy), Math.round(cx), Math.round(cy + r), '#9fb4dc');
      G.line(Math.round(cx), Math.round(cy), Math.round(cx - r * 0.86), Math.round(cy - r / 2), '#9fb4dc');
      G.line(Math.round(cx), Math.round(cy), Math.round(cx + r * 0.86), Math.round(cy - r / 2), '#9fb4dc');
    };
    cube(10, 5, 4.6);
    cube(5.2, 10, 4.6);
    cube(14.8, 10, 4.6);
    cube(10, 14.6, 4.6);
    return G.toCanvas();
  }

  // Mural: la carita y el corazón que están pintados de verdad en la pared (fondo turquesa)
  function buildMural() {
    const G = new Grid(104, 88);
    const rng = makeRng(314);
    // fondo turquesa con ladrillos
    G.paint(G.rect(0, 0, 104, 88), '#7ee6d6');
    for (let y = 0; y < 88; y += 6) {
      G.line(0, y, 103, y, '#68d2c2');
      for (let x = (y / 6) % 2 ? 6 : 0; x < 104; x += 12) G.line(x, y, x, y + 5, '#68d2c2');
    }
    for (let i = 0; i < 40; i++) G.dot(Math.floor(rng() * 104), Math.floor(rng() * 88), '#9ff0e4');
    const INK = '#3b393f', LINE = '#3a2a9c';
    // ojos: dos barras verticales
    G.paint(G.capsule(28, 12, 28, 40, 4.2), INK, LINE);
    G.paint(G.capsule(47, 17, 47, 40, 3.6), INK, LINE);
    // sonrisa en U
    const mouth = G.union(
      G.capsule(11, 44, 13, 63, 3.8), G.capsule(13, 63, 20, 69, 3.8),
      G.capsule(20, 69, 50, 67, 3.8), G.capsule(50, 67, 58, 59, 3.8), G.capsule(58, 59, 60, 45, 3.8)
    );
    G.paint(mouth, INK, LINE);
    // corazón de contorno
    const heartMask = (cx, cy, s) => G.union(
      G.circle(cx - 7.5 * s, cy, 8.5 * s), G.circle(cx + 7.5 * s, cy, 8.5 * s),
      G.poly([[cx - 15.6 * s, cy + 2 * s], [cx + 15.6 * s, cy + 2 * s], [cx, cy + 26 * s]])
    );
    const outer = heartMask(81, 34, 1.3), inner = heartMask(81, 35, 0.95);
    G.paint(G.filter(outer, (x, y) => !inner[y * G.w + x]), INK, LINE);
    // chorreaduras de aerosol
    for (const [x, y, l] of [[16, 70, 5], [26, 72, 4], [40, 71, 6], [24, 43, 3], [45, 43, 4], [72, 52, 5], [79, 44, 7], [86, 60, 4], [9, 58, 4]]) {
      G.line(x, y, x, y + l, INK);
    }
    return G.toCanvas();
  }

  function buildBackground() {
    const [c, g] = makeCanvas(W, H);
    const rng = makeRng(2026);
    const { wallTop, wallBottom, sidewalkBottom, streetTop } = LAYOUT;

    /* --- edificios lejanos (Avellaneda industrial) --- */
    const far = '#9fb4c8', farDk = '#8ea4ba';
    rect(g, 0, 84, 70, 40, far);
    rect(g, 64, 96, 50, 30, farDk);
    rect(g, 118, 74, 28, 50, far);
    rect(g, 250, 90, 70, 30, farDk);
    rect(g, 300, 70, 30, 50, far);
    rect(g, 338, 88, 50, 30, farDk);
    for (let x = 4; x < 66; x += 8) rect(g, x, 92, 4, 3, '#b3c5d6');
    for (let x = 122; x < 144; x += 7) for (let y = 80; y < 110; y += 8) rect(g, x, y, 3, 3, '#b3c5d6');
    for (let x = 304; x < 328; x += 7) for (let y = 76; y < 110; y += 8) rect(g, x, y, 3, 3, '#b3c5d6');
    // chimenea
    rect(g, 40, 58, 6, 30, '#94a9bd');
    rect(g, 39, 56, 8, 3, '#8499ad');
    // postes y cables
    rect(g, 358, 62, 2, 60, '#6e7f8f');
    rect(g, 352, 66, 14, 1, '#6e7f8f');
    for (let x = 0; x < W; x++) {
      const y1 = 68 + Math.round(Math.pow((x - 180) / 180, 2) * 4);
      if (x < 358) g.fillStyle = '#4e5a66', g.fillRect(x, Math.min(y1, 80), 1, 1);
    }

    /* --- nave blanca larga detrás (izquierda) --- */
    rect(g, 0, 86, 146, wallTop - 86, '#e2e5e7');
    rect(g, 0, 86, 146, 2, '#c9cdd0');
    rect(g, 0, 88, 146, 1, '#f4f6f7');

    /* --- dos tanques de agua (detrás de la pared) --- */
    drawTank(g, 146, 78, 38, rng);
    drawTank(g, 246, 68, 50, rng, true);
    // escaleras con jaula
    drawCageLadder(g, 216, 22, wallTop);
    drawCageLadder(g, 236, 30, wallTop);
    // caño rojizo y postes verdes
    rect(g, 224, 30, 1, wallTop - 30, '#9a4a3a');
    rect(g, 212, 30, 13, 1, '#9a4a3a');
    rect(g, 244, 36, 1, wallTop - 36, '#3f7a4a');
    rect(g, 244, 36, 6, 1, '#3f7a4a');
    rect(g, 292, 52, 1, wallTop - 52, '#3f7a4a');
    rect(g, 291, 51, 3, 2, '#2f5e38');

    /* --- alambrado sobre la pared --- */
    const WALL_END = 372;
    for (let x = 6; x < WALL_END; x += 44) {
      rect(g, x, 94, 2, wallTop - 94, PAL.fence);
      rect(g, x, 94, 1, wallTop - 94, '#6e6e6e');
      line(g, x + 1, 94, x + 5, 89, PAL.fence);
      line(g, x, 94, x - 4, 89, PAL.fence);
    }
    // alambre de concertina (espirales)
    g.fillStyle = '#7d7f82';
    for (let x = 0; x < WALL_END; x += 5) {
      for (let a = 0; a < 12; a++) {
        const ang = (a / 12) * Math.PI * 2;
        g.fillRect(Math.round(x + Math.cos(ang) * 3.5), Math.round(101 + Math.sin(ang) * 3.5), 1, 1);
      }
    }
    for (const wy of [107, 112]) {
      for (let x = 0; x < WALL_END; x++) {
        const sag = Math.round(Math.sin(((x - 6) % 44) / 44 * Math.PI) * 1.5);
        g.fillStyle = '#5c5c5c';
        g.fillRect(x, wy + sag, 1, 1);
        if (wy < 110 && x % 6 === 0) g.fillRect(x, wy + sag - 1, 1, 3);
      }
    }

    /* --- pared industrial de bloques --- */
    rect(g, 0, wallTop - 3, WALL_END + 2, 3, '#8a8a8a');
    rect(g, 0, wallTop - 3, WALL_END + 2, 1, '#c2c2c2');
    const blocks = ['#a9a9a9', '#a4a4a4', '#afafaf', '#a0a0a0', '#acacac'];
    const paintLine = 150;
    for (let row = 0, y = wallTop; y < wallBottom; row++, y += 8) {
      const off = row % 2 ? 8 : 0;
      for (let x = -off; x < WALL_END + 2; x += 16) {
        const below = y >= paintLine;
        const col = below
          ? pick(['#dcdfdb', '#d8dbd6', '#e0e2dd', '#d4d7d2'], rng)
          : pick(blocks, rng);
        rect(g, x, y, 16, 8, col);
        rect(g, x, y, 16, 1, below ? '#cbcfca' : '#8f8f8f');
        rect(g, x, y, 1, 8, below ? '#cbcfca' : '#8f8f8f');
        if (!below && rng() > 0.6) rect(g, x + 3 + Math.floor(rng() * 10), y + 2 + Math.floor(rng() * 4), 1, 1, '#999');
      }
    }
    // borde irregular de la pintura blanca
    for (let x = 0; x < WALL_END + 2; x++) {
      const h = Math.round(Math.sin(x * 0.31) * 1.2 + Math.sin(x * 0.07) * 1.5);
      rect(g, x, paintLine + h - 1, 1, 2, '#d7dad5');
      if (rng() > 0.93) rect(g, x, paintLine + h, 1, 2 + Math.floor(rng() * 4), '#d1d4cf');
    }
    // mugre abajo
    for (let x = 0; x < WALL_END + 2; x++) {
      const h = 3 + Math.floor(rng() * 4);
      rect(g, x, wallBottom - h, 1, h, rng() > 0.5 ? '#b9b8ad' : '#c4c3b9');
    }
    rect(g, 0, wallBottom - 1, WALL_END + 2, 1, '#8f8e85');

    /* --- graffiti personalizado (reemplaza "ALVINAS FERRAN") --- */
    g.drawImage(SPR.graffiti, 118, 152);
    // firma chiquita
    pixelText(g, 'Po♥', 300, 141, '#2b2b33');

    /* --- reja metálica (tercio izquierdo) --- */
    const rejaX = 0, rejaW = 112, rejaTop = 128;
    for (let x = rejaX + 3; x < rejaX + rejaW; x += 7) {
      // sombra en la pared
      g.fillStyle = 'rgba(40,40,50,0.25)';
      g.fillRect(x + 2, rejaTop + 4, 2, wallBottom - rejaTop - 4);
      rect(g, x, rejaTop + 3, 2, wallBottom - rejaTop + 2, PAL.fence);
      rect(g, x, rejaTop + 3, 1, wallBottom - rejaTop + 2, '#707070');
      // punta de lanza
      rect(g, x, rejaTop + 1, 2, 2, PAL.fence);
      rect(g, x - 1, rejaTop + 2, 4, 1, PAL.fence);
      rect(g, x, rejaTop, 1, 1, '#707070');
    }
    for (const ry of [rejaTop + 8, wallBottom - 8]) {
      rect(g, rejaX, ry, rejaW, 3, PAL.fence);
      rect(g, rejaX, ry, rejaW, 1, '#6e6e6e');
    }

    /* --- Droguería "Del Sud" (fachada azul, como en la foto) --- */
    const dx = WALL_END, dTop = 50;
    rect(g, dx, dTop, W - dx, wallBottom - dTop + 2, '#2355b0');
    for (let y = dTop + 22; y < wallBottom; y += 5) rect(g, dx, y, W - dx, 1, '#2150a6');
    rect(g, dx, dTop + 22, 2, wallBottom - dTop - 22, '#1a438c');
    // alero oscuro acanalado
    rect(g, dx - 2, dTop, W - dx + 2, 16, '#23262c');
    for (let x = dx - 2; x < W; x += 3) rect(g, x, dTop, 1, 16, '#31353d');
    rect(g, dx - 2, dTop + 16, W - dx + 2, 2, '#15171b');
    rect(g, dx - 2, dTop - 3, W - dx + 2, 3, '#2d5fc0');
    // logo: cubos hexagonales blancos + "Droguería Del Sud"
    g.drawImage(SPR.delSudLogo, dx + 5, 73);
    pixelText(g, 'Droguería', dx + 27, 72, '#ffffff');
    pixelText(g, 'Del Sud', dx + 26, 82, '#ffffff', 2);
    pixelText(g, 'Del Sud', dx + 27, 82, '#ffffff', 2);
    // franja blanca
    rect(g, dx, 104, W - dx, 3, '#eef1f5');
    rect(g, dx, 107, W - dx, 1, '#b9c3d3');
    // mural del corazón
    g.drawImage(SPR.mural, dx + 4, 110);

    /* --- vereda --- */
    rect(g, 0, wallBottom, W, sidewalkBottom - wallBottom, '#bfc1bb');
    for (let y = wallBottom + 6; y < sidewalkBottom; y += 7) rect(g, 0, y, W, 1, '#afb1ab');
    for (let y = wallBottom, row = 0; y < sidewalkBottom; y += 7, row++) {
      for (let x = row % 2 ? 6 : 0; x < W; x += 12) rect(g, x, y, 1, 7, '#b2b4ae');
    }
    rect(g, 0, wallBottom, W, 2, '#9fa19b');
    for (let i = 0; i < 60; i++) rect(g, Math.floor(rng() * W), wallBottom + 2 + Math.floor(rng() * 24), 1, 1, '#a7a9a3');
    // cazuelas de los árboles
    rect(g, 34, 214, 26, 6, '#6b4e37');
    rect(g, 34, 214, 26, 1, '#57402d');
    rect(g, 486, 214, 26, 6, '#6b4e37');
    rect(g, 486, 214, 26, 1, '#57402d');
    // cordón
    rect(g, 0, sidewalkBottom, W, 2, '#d9dad5');
    rect(g, 0, sidewalkBottom + 2, W, streetTop - sidewalkBottom - 2, '#8b8d87');

    /* --- calle (hormigón/asfalto) --- */
    rect(g, 0, streetTop, W, H - streetTop, PAL.street);
    rect(g, 0, streetTop, W, 3, '#86938a');
    for (let i = 0; i < 700; i++) {
      rect(g, Math.floor(rng() * W), streetTop + 3 + Math.floor(rng() * (H - streetTop)), 1, 1,
        rng() > 0.5 ? '#8d9a8c' : '#a9b5a8');
    }
    // juntas de las losas (como en la foto)
    for (let x = 40; x < W; x += 128) line(g, x, streetTop + 3, x - 18, H, '#7f8b7f');
    line(g, 0, 272, W, 270, '#86927f');
    // líneas blancas de la calle
    for (let x = 0; x < W; x += 40) rect(g, x, 266, 20, 2, '#f1f1ee');
    // manchas de aceite
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rng() * W), y = 240 + Math.floor(rng() * 40);
      g.fillStyle = 'rgba(60,70,60,0.18)';
      g.fillRect(x, y, 6 + Math.floor(rng() * 8), 2);
    }
    // rejilla de desagüe
    rect(g, 250, streetTop + 1, 16, 3, '#3f4540');
    for (let x = 251; x < 266; x += 2) rect(g, x, streetTop + 1, 1, 3, '#6f776f');

    /* --- cartel de calle (Carlos Gardel) --- */
    rect(g, 350, 126, 2, 100, '#3a3a3a');
    rect(g, 350, 126, 1, 100, '#5a5a5a');
    rect(g, 329, 124, 45, 20, '#0f0f0f');
    rect(g, 330, 125, 43, 18, '#1e1e1e');
    pixelText(g, 'GARDEL', 334, 126, '#f5f5f5');
    pixelText(g, '3546', 340, 135, '#f5f5f5');

    return c;
  }

  /* =======================================================================
   * 5. ELEMENTOS ANIMADOS DEL MUNDO
   * ===================================================================== */

  /* ---------- Sauces llorones (ramas colgantes que se mecen) ---------- */
  function makeWillow(x, baseY, seed, spread = 1) {
    const r = makeRng(seed);
    const strands = [];
    for (let i = 0; i < 46; i++) {
      const sx = x + Math.round((r() - 0.5) * 70 * spread);
      const top = 60 + Math.round(Math.abs(sx - x) * 0.45 + r() * 12);
      strands.push({
        x: sx,
        top,
        len: 60 + Math.round(r() * 60 - Math.abs(sx - x) * 0.4),
        col: pick(PAL.willow.slice(1), r),
        phase: r() * Math.PI * 2,
        leafy: r() > 0.4,
      });
    }
    strands.sort((a, b) => (a.col === PAL.willow[4]) - (b.col === PAL.willow[4]));
    const blobs = [];
    for (let i = 0; i < 16; i++) {
      blobs.push({
        x: x + Math.round((r() - 0.5) * 64 * spread),
        y: 58 + Math.round(r() * 26),
        r: Math.round((7 + r() * 7) * (0.6 + 0.4 * spread)),
        c: i < 6 ? PAL.willow[1] : pick(PAL.willow.slice(1, 4), r),
      });
    }
    return { x, baseY, strands, blobs };
  }

  function drawWillow(g, tree, t) {
    const { x, baseY } = tree;
    // tronco con ramas
    rect(g, x - 3, 80, 6, baseY - 80, '#4f3626');
    rect(g, x - 3, 80, 2, baseY - 80, '#6b4a33');
    rect(g, x + 2, 90, 1, baseY - 90, '#3b281c');
    rect(g, x - 5, baseY - 4, 10, 4, '#4f3626');
    line(g, x, 96, x - 18, 72, '#4f3626');
    line(g, x + 1, 96, x - 17, 72, '#4f3626');
    line(g, x, 100, x + 20, 76, '#4f3626');
    line(g, x + 1, 100, x + 21, 76, '#4f3626');
    // copa
    for (const b of tree.blobs) disc(g, b.x, b.y, b.r, b.c);
    for (const b of tree.blobs) disc(g, b.x - 2, b.y - 3, Math.max(2, b.r - 5), PAL.willow[3]);
    // ramas colgantes (el viento las mueve más cuanto más abajo)
    for (const s of tree.strands) {
      g.fillStyle = s.col;
      for (let d = 0; d < s.len; d += 3) {
        const sway = Math.sin(t * 1.3 + s.phase + d * 0.03) * (d / s.len) * 3.2
          + Math.sin(t * 0.7 + s.phase) * (d / s.len) * 1.5;
        const px = Math.round(s.x + sway);
        g.fillRect(px, s.top + d, 1, 3);
        if (s.leafy && d % 9 === 0) g.fillRect(px + 1, s.top + d + 1, 1, 1);
      }
    }
  }

  /* ---------- Personajes ----------
   * (x, y) = centro de los pies / línea de suelo.
   * o.look: -1 mira a la izquierda, 0 a cámara, 1 a la derecha.
   * o.walk: fase de caminata (número) o null si está quieto.              */

  function legsFrame(walk) {
    if (walk == null) return { l: 0, r: 0, lUp: 0, rUp: 0, bob: 0 };
    const f = Math.floor(walk) % 4;
    return [
      { l: 0, r: 0, lUp: 0, rUp: 0, bob: 0 },
      { l: 1, r: -1, lUp: 1, rUp: 0, bob: -1 },
      { l: 0, r: 0, lUp: 0, rUp: 0, bob: 0 },
      { l: -1, r: 1, lUp: 0, rUp: 1, bob: -1 },
    ][f];
  }

  function drawMel(g, x, y, o = {}) {
    const P = MEL;
    const look = o.look || 0;
    const legs = legsFrame(o.walk);
    const hop = Math.round(o.hop || 0);
    const top = y - 38 + legs.bob - hop;
    const R = (dx, row, w, h, c) => rect(g, x + dx, top + row, w, h, c);

    // pelo largo (capa de atrás)
    R(-5, 2, 10, 17, P.hair);
    R(-4, 19, 8, 1, P.hair);

    // piernas (jean celeste) y zapatos
    const lx = -4 + legs.l, rx = 1 + legs.r;
    R(-4, 23, 8, 4, P.jeans);
    R(lx, 26, 3, 10 - legs.lUp, P.jeans);
    R(rx, 26, 3, 10 - legs.rUp, P.jeans);
    R(lx + 2, 27, 1, 8 - legs.lUp, P.jeansSh);
    R(rx, 27, 1, 8 - legs.rUp, P.jeansSh);
    R(lx, 29, 1, 2, P.jeansHi);
    R(rx + 2, 29, 1, 2, P.jeansHi);
    R(lx - 1, 36 - legs.lUp, 4, 2, P.shoe);
    R(rx, 36 - legs.rUp, 4, 2, P.shoe);

    // campera de cuero negra, polera
    R(-5, 10, 10, 2, P.jacket);
    R(-4, 12, 8, 9, P.jacket);
    R(-5, 20, 10, 2, P.jacket);
    R(-1, 10, 2, 11, P.sweater);
    R(-3, 12, 1, 7, P.jacketHi);
    R(2, 13, 1, 5, P.jacketHi);
    R(-5, 21, 10, 1, '#2c2c32');
    // cinturón con hebilla plateada (como en la foto)
    R(-4, 22, 8, 1, P.belt);
    R(-1, 22, 2, 1, P.buckle);
    R(-2, 23, 1, 2, P.belt);

    // brazos
    if (o.hold) {
      // abrazando el ramo contra el pecho
      R(-6, 11, 2, 6, P.jacket);
      R(4, 11, 2, 6, P.jacket);
      R(-6, 16, 11, 2, P.jacket);
      R(-6, 11, 1, 4, P.jacketHi);
      R(-1, 16, 3, 2, P.skin);
    } else if (o.hug) {
      R(-6, 11, 2, 5, P.jacket);
      R(-12, 15, 8, 2, P.jacket);
      R(-13, 15, 2, 2, P.skin);
      // brazo derecho levantando el ramo
      R(4, 11, 2, 4, P.jacket);
      R(5, 13, 4, 2, P.jacket);
      R(8, 11, 2, 3, P.jacket);
      R(8, 9, 2, 2, P.skin);
    } else {
      R(-6, 11, 2, 10, P.jacket);
      R(-6, 12, 1, 7, P.jacketHi);
      R(-6, 21, 2, 2, P.skin);
      // mano en la cintura (pose de la foto)
      R(4, 11, 2, 5, P.jacket);
      R(5, 15, 2, 4, P.jacket);
      R(4, 19, 2, 2, P.jacket);
      R(3, 20, 2, 2, P.skin);
    }

    // cabeza
    const hx = o.tilt || 0;
    const H2 = (dx, row, w, h, c) => R(dx + hx, row, w, h, c);
    H2(-3, 0, 6, 1, P.hair);
    H2(-4, 1, 8, 1, P.hair);
    H2(-5, 2, 10, 2, P.hair);
    H2(-2, 1, 2, 1, P.hairHi);
    H2(-3, 4, 6, 5, P.skin);
    H2(-2, 3, 4, 1, P.skin);
    H2(-3, 3, 1, 2, P.hair);
    H2(2, 3, 1, 2, P.hair);
    H2(-2, 9, 4, 1, P.skin);
    H2(-3, 8, 1, 1, P.skinSh);
    H2(2, 8, 1, 1, P.skinSh);
    H2(-2, 10, 4, 1, P.sweater);
    // ojos (parpadeo / cerrados de felicidad)
    const ex = look;
    if (o.eyesClosed) {
      H2(-2 + ex, 6, 1, 1, P.eye);
      H2(1 + ex, 6, 1, 1, P.eye);
    } else if (!o.blink) {
      H2(-2 + ex, 5, 1, 2, P.eye);
      H2(1 + ex, 5, 1, 2, P.eye);
    } else {
      H2(-2 + ex, 6, 1, 1, P.skinSh);
      H2(1 + ex, 6, 1, 1, P.skinSh);
    }
    // cachetes
    if ((o.smile || 0) > 0.55) {
      H2(-3, 7, 1, 1, P.blush);
      H2(2, 7, 1, 1, P.blush);
    }
    // boca: la sonrisa crece
    const s = o.smile || 0;
    if (s < 0.3) H2(-1 + (look > 0 ? 1 : 0), 8, 2, 1, P.skinSh);
    else if (s < 0.7) H2(-1, 8, 2, 1, P.lip);
    else {
      H2(-2, 7, 1, 1, P.lip);
      H2(1, 7, 1, 1, P.lip);
      H2(-1, 8, 2, 1, P.lip);
    }
    // mechones de adelante sobre los hombros
    H2(-4, 4, 1, 14, P.hair);
    H2(3, 4, 1, 14, P.hair);
    R(-4 + hx, 10, 2, 7, P.hair);
    R(2 + hx, 10, 2, 7, P.hair);
    R(-4 + hx, 11, 1, 4, P.hairHi);
  }

  // Cabeza de Nahu (compartida entre parado y en moto)
  function drawNahuHead(g, x, top, o) {
    const P = NAHU;
    const look = o.look || 0;
    const R = (dx, row, w, h, c) => rect(g, x + dx, top + row, w, h, c);
    // pelo despeinado
    R(-3, 0, 1, 1, P.hair);
    R(-1, 0, 2, 1, P.hair);
    R(2, 0, 1, 1, P.hair);
    R(-4, 1, 8, 1, P.hair);
    R(-5, 2, 9, 2, P.hair);
    R(-2, 1, 3, 1, P.hairHi);
    R(4, 2, 1, 1, P.hair);
    // cara
    R(-3, 4, 6, 7, P.skin);
    R(-4, 4, 1, 3, P.hair);
    R(3, 4, 1, 2, P.hair);
    R(-3, 4, 3, 1, P.hair);         // flequillo
    R(-4, 7, 1, 2, P.skinSh);       // oreja
    R(3, 7, 1, 2, P.skinSh);
    // lentes: armazón oscuro, vidrios azules
    const gx = look;
    R(-3 + gx, 6, 6, 1, P.frame);
    R(-3 + gx, 7, 1, 1, P.frame);
    R(-1 + gx, 7, 2, 1, P.frame);
    R(2 + gx, 7, 1, 1, P.frame);
    if (o.eyesClosed) {
      R(-2 + gx, 7, 1, 1, '#3a78b8');
      R(1 + gx, 7, 1, 1, '#3a78b8');
    } else {
      R(-2 + gx, 7, 1, 1, P.lens);
      R(1 + gx, 7, 1, 1, P.lens);
    }
    // barba de pocos días
    R(-3, 9, 1, 2, P.beard);
    R(2, 9, 1, 2, P.beard);
    R(-2, 10, 4, 1, P.beard);
    R(-1, 9, 2, 1, (o.smile || 0) > 0.5 ? P.lip : P.skinSh);
    // cuello
    R(-1, 11, 2, 1, P.skinSh);
  }

  function drawNahu(g, x, y, o = {}) {
    const P = NAHU;
    const legs = legsFrame(o.walk);
    const top = y - 40 + legs.bob;
    const R = (dx, row, w, h, c) => rect(g, x + dx, top + row, w, h, c);

    // piernas (pantalón gris) + zapatillas
    const lx = -4 + legs.l, rx = 1 + legs.r;
    R(-4, 26, 8, 3, P.pants);
    R(lx, 28, 3, 10 - legs.lUp, P.pants);
    R(rx, 28, 3, 10 - legs.rUp, P.pants);
    R(lx + 2, 29, 1, 8 - legs.lUp, P.pantsSh);
    R(rx, 29, 1, 8 - legs.rUp, P.pantsSh);
    R(lx, 38 - legs.lUp, 4, 1, P.shoe);
    R(rx, 38 - legs.rUp, 4, 1, P.shoe);
    R(lx, 39 - legs.lUp, 4, 1, P.sole);
    R(rx, 39 - legs.rUp, 4, 1, P.sole);

    // campera Adidas negra
    R(-5, 12, 10, 2, P.jacket);
    R(-4, 14, 8, 11, P.jacket);
    R(-4, 25, 8, 1, P.jacketHi);
    R(-1, 12, 1, 13, '#cfcfcf');     // cierre
    R(1, 14, 2, 1, P.stripe);        // logo
    R(2, 15, 1, 1, P.stripe);
    R(-3, 14, 1, 9, P.jacketHi);
    R(-5, 12, 1, 1, P.stripe);
    R(4, 12, 1, 1, P.stripe);

    // brazos con las tres tiras
    const arm = (side, extended) => {
      const sx = side < 0 ? -6 : 4;
      if (!extended) {
        R(sx, 13, 2, 11, P.jacket);
        R(side < 0 ? sx : sx + 1, 13, 1, 11, P.stripe);
        R(sx, 24, 2, 2, P.skin);
      } else {
        R(sx, 13, 2, 4, P.jacket);
        R(sx, 17, 7, 2, P.jacket);
        R(sx, 17, 7, 1, P.stripe);
        R(sx + 7, 17, 2, 2, P.skin);
      }
    };
    if (o.hang) {
      // colgado de algo con el brazo derecho estirado hacia arriba
      arm(-1, false);
      R(4, -2, 2, 15, P.jacket);
      R(5, -2, 1, 15, P.stripe);
      R(4, -4, 2, 2, P.skin);
    } else if (o.hug) {
      arm(-1, false);
      R(4, 13, 2, 4, P.jacket);
      R(4, 17, 9, 2, P.jacket);
      R(4, 17, 9, 1, P.stripe);
      R(13, 17, 2, 2, P.skin);
    } else {
      arm(-1, false);
      arm(1, !!o.give);
    }

    drawNahuHead(g, x, top, o);
    // mano que sostiene algo (para el ramo)
    return { handX: x + 11, handY: top + 18 };
  }

  // Nahu sentado en la YBR (x, y = posición del asiento)
  function drawNahuRiding(g, sx, sy, o = {}) {
    const P = NAHU;
    const top = sy - 22;
    const R = (dx, row, w, h, c) => rect(g, sx + dx, top + row, w, h, c);
    // pierna: muslo horizontal + canilla hacia el posapié
    R(-3, 20, 11, 3, P.pants);
    R(-3, 22, 11, 1, P.pantsSh);
    R(6, 22, 3, 7, P.pants);
    R(6, 22, 1, 7, P.pantsSh);
    R(6, 29, 5, 1, P.shoe);
    R(6, 30, 5, 1, P.sole);
    // torso (un poco inclinado hacia adelante)
    R(-4, 12, 9, 2, P.jacket);
    R(-4, 14, 8, 7, P.jacket);
    R(-3, 14, 1, 6, P.jacketHi);
    R(0, 12, 1, 8, '#cfcfcf');
    R(2, 14, 2, 1, P.stripe);
    // brazo al manubrio
    for (let i = 0; i <= 8; i++) {
      const ax = sx + 2 + i, ay = top + 13 + Math.round(i * 0.35);
      rect(g, ax, ay, 1, 2, P.jacket);
      rect(g, ax, ay, 1, 1, P.stripe);
    }
    R(11, 16, 2, 2, P.skin);
    drawNahuHead(g, sx + 1, top + 1, { ...o, look: 1 });
  }

  /* ---------- Partículas del mundo ---------- */
  const particles = [];

  function spawn(p) {
    particles.push(Object.assign({ vx: 0, vy: 0, life: 1, age: 0, g: 0 }, p));
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.age += dt;
      if (p.age >= p.life) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.g * dt;
      p.x += p.vx * dt + (p.sway ? Math.sin(p.age * p.sway + p.seed) * 0.35 : 0);
      p.y += p.vy * dt;
    }
  }

  function drawParticles(g) {
    for (const p of particles) {
      const k = p.age / p.life;
      g.globalAlpha = p.fade ? clamp((1 - k) * 2.5, 0, 1) : 1;
      if (p.kind === 'heart') {
        g.drawImage(p.big ? SPR.heartBig : SPR.heart, Math.round(p.x), Math.round(p.y));
      } else if (p.kind === 'puff') {
        g.globalAlpha = 0.45 * (1 - k);
        disc(g, p.x, p.y, Math.round(1 + k * 4), '#e6e6e6');
      } else if (p.kind === 'speed') {
        g.globalAlpha = 0.6 * (1 - k);
        rect(g, p.x, p.y, p.w, 1, '#ffffff');
      } else if (p.kind === 'spark') {
        const s = Math.floor(p.age * 12) % 2;
        rect(g, p.x, p.y, 1, 1, p.c);
        if (s) {
          rect(g, p.x - 1, p.y, 3, 1, p.c);
          rect(g, p.x, p.y - 1, 1, 3, p.c);
        }
      } else {
        rect(g, p.x, p.y, p.w || 1, p.h || 1, p.c);
      }
    }
    g.globalAlpha = 1;
  }

  /* =======================================================================
   * 6. AUDIO (Web Audio sintetizado, sin archivos)
   * ===================================================================== */

  const Sound = {
    ctx: null,
    master: null,
    muted: false,
    engine: null,

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.level();
      this.master.connect(this.ctx.destination);
    },

    ducked: false,

    level() {
      return this.muted ? 0 : this.ducked ? 0.12 : 0.6;
    },

    setMuted(m) {
      this.muted = m;
      if (this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
    },

    // baja los efectos mientras suena la canción
    duck(on) {
      this.ducked = on;
      if (this.master) this.master.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.2);
    },

    tone(freq, dur, { type = 'sine', vol = 0.2, delay = 0, slide = 0, attack = 0.01 } = {}) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const o = this.ctx.createOscillator();
      const gn = this.ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t0);
      if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
      gn.gain.setValueAtTime(0.0001, t0);
      gn.gain.exponentialRampToValueAtTime(vol, t0 + attack);
      gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(gn).connect(this.master);
      o.start(t0);
      o.stop(t0 + dur + 0.05);
    },

    noise(dur, { vol = 0.15, freq = 1200, delay = 0, q = 1 } = {}) {
      if (!this.ctx) return;
      const t0 = this.ctx.currentTime + delay;
      const len = Math.floor(this.ctx.sampleRate * dur);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const gn = this.ctx.createGain();
      gn.gain.value = vol;
      src.connect(f).connect(gn).connect(this.master);
      src.start(t0);
    },

    // Motor de la YBR: dos osciladores con filtro y trémolo
    engineStart() {
      if (!this.ctx || this.engine) return;
      const c = this.ctx, t = c.currentTime;
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o1.type = 'sawtooth';
      o2.type = 'square';
      o1.frequency.value = 48;
      o2.frequency.value = 96.5;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 520;
      const gn = c.createGain();
      gn.gain.setValueAtTime(0.0001, t);
      gn.gain.exponentialRampToValueAtTime(0.09, t + 0.4);
      const lfo = c.createOscillator(), lfoG = c.createGain();
      lfo.frequency.value = 22;
      lfoG.gain.value = 0.03;
      lfo.connect(lfoG).connect(gn.gain);
      o1.connect(lp);
      o2.connect(lp);
      lp.connect(gn).connect(this.master);
      [o1, o2, lfo].forEach((o) => o.start());
      this.engine = { o1, o2, gn, lfo, lp };
    },

    engineSpeed(k) {
      if (!this.engine) return;
      const t = this.ctx.currentTime;
      this.engine.o1.frequency.setTargetAtTime(38 + k * 26, t, 0.1);
      this.engine.o2.frequency.setTargetAtTime(76 + k * 52, t, 0.1);
      this.engine.lp.frequency.setTargetAtTime(380 + k * 400, t, 0.1);
    },

    engineStop() {
      if (!this.engine) return;
      const { o1, o2, gn, lfo } = this.engine;
      const t = this.ctx.currentTime;
      gn.gain.cancelScheduledValues(t);
      gn.gain.setTargetAtTime(0.0001, t, 0.18);
      [o1, o2, lfo].forEach((o) => o.stop(t + 1));
      this.engine = null;
    },

    pop() {
      this.tone(520, 0.12, { type: 'triangle', vol: 0.25, slide: 2.2 });
    },

    sparkle() {
      [1318, 1568, 1760, 2093, 2637].forEach((f, i) => this.tone(f, 0.35, { type: 'triangle', vol: 0.09, delay: i * 0.07 }));
    },

    step() {
      this.noise(0.05, { vol: 0.05, freq: 400, q: 2 });
    },

    clunk() {
      this.noise(0.08, { vol: 0.12, freq: 220, q: 3 });
      this.tone(140, 0.1, { type: 'square', vol: 0.05 });
    },

    paper() {
      this.noise(0.35, { vol: 0.12, freq: 3000, q: 0.7 });
    },

    // Melodía corta de celebración (chiptune)
    celebrate() {
      const notes = [523, 659, 784, 1047, 784, 1047, 1319, 1568];
      notes.forEach((f, i) => this.tone(f, 0.22, { type: 'square', vol: 0.05, delay: i * 0.12 }));
      [262, 330, 392].forEach((f) => this.tone(f, 1.4, { type: 'triangle', vol: 0.06, delay: 0.96, attack: 0.05 }));
      [523, 659, 784].forEach((f) => this.tone(f, 1.4, { type: 'sine', vol: 0.05, delay: 0.96, attack: 0.05 }));
    },
  };

  /* =======================================================================
   * 7. CANVAS, ESCALADO Y DOM
   * ===================================================================== */

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const [world, wg] = makeCanvas(W, H);

  const ui = {
    hint: document.getElementById('hint'),
    action: document.getElementById('actionBtn'),
    heart: document.getElementById('bigHeart'),
    finalBtns: document.getElementById('finalBtns'),
    reread: document.getElementById('rereadBtn'),
    restart: document.getElementById('restartBtn'),
    mute: document.getElementById('muteBtn'),
    fs: document.getElementById('fsBtn'),
    fsHint: document.getElementById('fsHintBtn'),
    music: document.getElementById('musicBtn'),
    musicPanel: document.getElementById('musicPanel'),
    musicFrame: document.getElementById('musicFrame'),
    musicClose: document.getElementById('musicClose'),
    live: document.getElementById('srLive'),
  };

  let viewScale = 1; // pixeles físicos por unidad lógica

  /* ---------- Pantalla completa + horizontal ----------
   * Android/desktop: API de Fullscreen y bloqueo de orientación.
   * iPhone (no tiene esa API para páginas): se rota el juego por CSS.   */
  let fullMode = false;
  const root = document.documentElement;
  const fsSupported = !!(root.requestFullscreen || root.webkitRequestFullscreen);
  const fsElement = () => document.fullscreenElement || document.webkitFullscreenElement;
  if (!fsSupported) root.classList.add('no-fs');

  async function enterFull() {
    fullMode = true;
    try {
      if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) root.webkitRequestFullscreen();
    } catch { /* sin permiso: queda el modo girado */ }
    try {
      if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape');
    } catch { /* no se pudo bloquear: si sigue vertical, se gira por CSS */ }
    updateFullUI();
    resize();
  }

  function exitFull() {
    fullMode = false;
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
    } catch { /* nada */ }
    if (fsElement()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    updateFullUI();
    resize();
  }

  function updateFullUI() {
    root.classList.toggle('full-mode', fullMode);
    ui.fs.textContent = fullMode ? '✕' : '⛶';
    ui.fs.setAttribute('aria-pressed', String(fullMode));
    ui.fs.setAttribute('aria-label', fullMode ? 'Salir de pantalla completa' : 'Pantalla completa');
  }

  function onFullscreenChange() {
    // si el usuario sale con el botón "atrás", salimos también del modo
    if (!fsElement() && fullMode && fsSupported) exitFull();
    else resize();
  }

  function resize() {
    let vw = window.innerWidth, vh = window.innerHeight;
    // modo girado: en vertical se rota todo 90° (ver Fullscreen más abajo)
    const rotated = fullMode && vh > vw;
    document.documentElement.classList.toggle('rotated', rotated);
    if (rotated) {
      document.documentElement.style.setProperty('--rot-w', vh + 'px');
      document.documentElement.style.setProperty('--rot-h', vw + 'px');
      [vw, vh] = [vh, vw];
    }
    const portrait = vh > vw;
    // en pantalla completa sin márgenes; en vertical dejamos lugar para el botón de abajo
    const padX = fullMode || portrait ? 0 : 16;
    const padY = fullMode ? 0 : portrait ? 60 : 16;
    const maxW = Math.min(vw - padX, (vh - padY) * (16 / 9));
    const cssW = Math.max(240, Math.floor(maxW));
    const cssH = Math.round(cssW * 9 / 16);
    document.documentElement.style.setProperty('--stage-w', cssW + 'px');
    document.documentElement.style.setProperty('--stage-h', cssH + 'px');
    document.documentElement.style.setProperty('--u', (cssW / VIEW_W) + 'px');
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }
    viewScale = bw / VIEW_W;
  }

  /* =======================================================================
   * 8. CARTA
   * ===================================================================== */

  const CARD_FRONT = {
    w: 300,
    h: 380,
    // dedicatoria de la tapa
    lines: ['Para la mujer', 'más hermosa', 'de todo Villa Domínico', 'y sus alrededores'],
  };

  const CARD_INSIDE = {
    w: 360,
    h: 450,
    paragraphs: [
      'Mel,',
      '',
      'De alma bonita,',
      'De carácter fuerte,',
      'De mirada brillosa,',
      'De corazón valiente,',
      'De sonrisa inolvidable,',
      '',
      'Gracias por hacer mejor cualquier día común.',
      'Todo lo que hago por vos lo hago con mucho amor ♥',
      '',
      'Tkm',
      'Nahu',
    ],
    lines: [],     // se calcula con wrapText al iniciar
    font: '13px Georgia, "Times New Roman", serif',
    lineH: 13 * 1.8,
    gapH: 10,
    drawingH: 136, // alto del dibujo de Snoopy
  };

  // El dibujo de Snoopy hecho a mano por Nahu (lápiz escaneado, fondo transparente)
  const drawing = new Image();
  drawing.src = 'snoopy-nahu.png';

  function wrapText(g, paragraphs, maxW) {
    const out = [];
    for (const p of paragraphs) {
      if (!p) {
        out.push('');
        continue;
      }
      let cur = '';
      for (const word of p.split(' ')) {
        const test = cur ? cur + ' ' + word : word;
        if (g.measureText(test).width > maxW && cur) {
          out.push(cur);
          cur = word;
        } else cur = test;
      }
      out.push(cur);
    }
    return out;
  }

  function layoutCard() {
    ctx.save();
    ctx.font = CARD_INSIDE.font;
    CARD_INSIDE.lines = wrapText(ctx, CARD_INSIDE.paragraphs, CARD_INSIDE.w - 56);
    ctx.restore();
    // tiempos de aparición: cada línea tarda según su largo
    let t = 0;
    CARD_INSIDE.timeline = CARD_INSIDE.lines.map((ln) => {
      const start = t;
      const dur = ln ? Math.max(0.35, ln.length / TIMING.charsPerSecond) : 0.15;
      t += dur;
      return { start, dur };
    });
    CARD_INSIDE.revealTime = t;
  }

  function paperRect(g, w, h) {
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.3)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 10;
    g.fillStyle = PAL.paper;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
    // textura suave
    g.fillStyle = 'rgba(160,130,80,0.05)';
    for (let y = -h / 2 + 18; y < h / 2; y += 18) g.fillRect(-w / 2 + 12, y, w - 24, 1);
    g.strokeStyle = '#D3D3D3';
    g.lineWidth = 2;
    g.strokeRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    g.strokeStyle = 'rgba(214,160,170,0.55)';
    g.lineWidth = 1;
    g.strokeRect(-w / 2 + 9.5, -h / 2 + 9.5, w - 19, h - 19);
  }

  function drawDrawing(g, cx, top, hgt, t) {
    if (!drawing.complete || !drawing.naturalWidth) return;
    const wd = (drawing.naturalWidth / drawing.naturalHeight) * hgt;
    const bob = Math.sin(t * 2) * 2;
    g.save();
    g.imageSmoothingEnabled = true;
    g.translate(cx, top + hgt / 2 + bob);
    g.rotate(Math.sin(t * 1.3) * 0.02);
    g.drawImage(drawing, -wd / 2, -hgt / 2, wd, hgt);
    g.restore();
  }

  function drawCardFront(g, t) {
    const { w, h } = CARD_FRONT;
    paperRect(g, w, h);
    // sello de corazón (pixel art)
    const hs = SPR.heartBig.width * 6;
    const hb = Math.round(Math.sin(t * 2.4) * 3);
    g.imageSmoothingEnabled = false;
    g.drawImage(SPR.heartBig, -hs / 2, -h / 2 + 40 + hb, hs, hs);
    // dedicatoria
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#2a1a22';
    let y = -h / 2 + 150;
    CARD_FRONT.lines.forEach((ln, i) => {
      g.font = i === 1
        ? 'bold italic 28px Georgia, "Times New Roman", serif'
        : 'italic 21px Georgia, "Times New Roman", serif';
      g.fillStyle = i === 1 ? '#b0284f' : '#2a1a22';
      g.fillText(ln, 0, y);
      y += i === 0 ? 36 : 32;
    });
    // adorno
    g.fillStyle = 'rgba(176,40,79,0.5)';
    g.fillRect(-40, y + 6, 80, 1);
    g.font = 'italic 13px Georgia, "Times New Roman", serif';
    g.fillStyle = '#6a5a5a';
    g.fillText('de Nahu', 0, y + 32);
  }

  function drawCardInside(g, t, revealT) {
    const { w, h } = CARD_INSIDE;
    paperRect(g, w, h);
    // el dibujo de Nahu + corazón flotando
    const top = -h / 2 + 18;
    drawDrawing(g, 0, top, CARD_INSIDE.drawingH, t);
    const hb = Math.round(Math.sin(t * 2.2) * 3);
    const hs = SPR.heartBig.width * 3;
    g.imageSmoothingEnabled = false;
    g.drawImage(SPR.heartBig, Math.round(w / 2 - 66), Math.round(top + 8 + hb), hs, hs);
    // texto línea por línea (centrado, tipo poema)
    g.font = CARD_INSIDE.font;
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    let y = top + CARD_INSIDE.drawingH + 26;
    CARD_INSIDE.lines.forEach((ln, i) => {
      if (!ln) {
        y += CARD_INSIDE.gapH;
        return;
      }
      const tl = CARD_INSIDE.timeline[i];
      const k = clamp((revealT - tl.start) / Math.max(0.3, tl.dur * 0.6), 0, 1);
      if (k > 0) {
        g.globalAlpha = k;
        const isName = ln === 'Mel,' || ln === 'Nahu';
        g.font = isName ? 'bold italic 16px Georgia, "Times New Roman", serif' : CARD_INSIDE.font;
        g.fillStyle = isName ? '#8a2550' : '#2c2c2c';
        g.fillText(ln, 0, y + (1 - k) * 4);
        g.font = CARD_INSIDE.font;
      }
      y += CARD_INSIDE.lineH;
    });
    g.globalAlpha = 1;
    // brillo que recorre la carta
    const sweep = ((t % 3.2) / 3.2) * (w + h) * 1.6 - (w + h) * 0.6;
    g.save();
    g.beginPath();
    g.rect(-w / 2, -h / 2, w, h);
    g.clip();
    g.globalCompositeOperation = 'lighter';
    const grd = g.createLinearGradient(sweep - 60, -h / 2, sweep + 60, h / 2);
    grd.addColorStop(0, 'rgba(255,255,255,0)');
    grd.addColorStop(0.5, 'rgba(255,245,220,0.22)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(-w / 2, -h / 2, w, h);
    g.restore();
  }

  /* =======================================================================
   * 9. CONFETI Y TÍTULO FINAL (alta resolución, pixel style en grilla de 2px)
   * ===================================================================== */

  const confetti = [];
  const CONFETTI_COLORS = [PAL.pink, PAL.red, PAL.yellow, PAL.purple, '#ffffff'];

  function spawnConfetti(initial) {
    confetti.push({
      x: Math.random() * VIEW_W,
      y: initial ? Math.random() * -VIEW_H : -20 - Math.random() * 40,
      vy: 50 + Math.random() * 50,
      vx: (Math.random() - 0.5) * 30,
      shape: Math.floor(Math.random() * 3),
      c: pick(CONFETTI_COLORS),
      s: 2 + Math.floor(Math.random() * 3),
      phase: Math.random() * 6.28,
    });
  }

  function updateConfetti(dt, active) {
    const target = REDUCED_MOTION ? 40 : 110;
    if (active) while (confetti.length < target) spawnConfetti(confetti.length < target / 2);
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.phase += dt * 3;
      c.x += (c.vx + Math.sin(c.phase) * 20) * dt;
      c.y += c.vy * dt;
      if (c.y > VIEW_H + 10) {
        if (active) {
          c.y = -10 - Math.random() * 30;
          c.x = Math.random() * VIEW_W;
        } else confetti.splice(i, 1);
      }
    }
  }

  function drawConfetti(g) {
    for (const c of confetti) {
      const x = Math.round(c.x / 2) * 2, y = Math.round(c.y / 2) * 2;
      const u = c.s;
      g.globalAlpha = clamp(1 - (c.y / VIEW_H - 0.7) / 0.3, 0, 1);
      g.fillStyle = c.c;
      const flip = Math.cos(c.phase) > 0;
      if (c.shape === 0) {
        // cuadradito que "gira"
        g.fillRect(x, y, u * 2, flip ? u * 2 : u);
      } else if (c.shape === 1) {
        // círculo pixelado (cruz)
        g.fillRect(x + u, y, u * 2, u * 4);
        g.fillRect(x, y + u, u * 4, u * 2);
      } else {
        // triángulo pixelado
        g.fillRect(x + u, y, u * 2, u);
        g.fillRect(x, y + u, u * 4, u);
        if (flip) g.fillRect(x - u, y + u * 2, u * 6, u);
      }
    }
    g.globalAlpha = 1;
  }

  function drawFinalTitle(g, t, alpha) {
    if (alpha <= 0) return;
    const text = 'Tkm, Nahu 💙';
    const pulse = 1 + Math.sin(t * 3) * 0.04;
    g.save();
    g.globalAlpha = alpha;
    g.translate(VIEW_W / 2, 112);
    g.scale(pulse, pulse);
    g.font = 'bold 64px Georgia, "Times New Roman", serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const tw = g.measureText(text).width;
    const grd = g.createLinearGradient(-tw / 2, 0, tw / 2, 0);
    grd.addColorStop(0, '#ff69b4');
    grd.addColorStop(0.55, '#d946ef');
    grd.addColorStop(1, '#8b2fc9');
    // glow
    g.shadowColor = 'rgba(255,105,180,0.9)';
    g.shadowBlur = 26 + Math.sin(t * 3) * 8;
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(40,10,50,0.55)';
    g.strokeText(text, 0, 3);
    g.fillStyle = grd;
    g.fillText(text, 0, 0);
    g.shadowBlur = 0;
    g.fillText(text, 0, 0);
    g.restore();
  }

  /* =======================================================================
   * 10. ESTADO DEL JUEGO
   * ===================================================================== */

  const S = {
    WAITING: 'WAITING',
    ARRIVING: 'ARRIVING',
    GIFT: 'GIFT',
    CARD_SHOWN: 'CARD_SHOWN',
    CARD_OPEN: 'CARD_OPEN',
    FINAL: 'FINAL',
  };

  const REDUCED_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const SPR = {};
  const game = {
    state: S.WAITING,
    t: 0,          // tiempo dentro del estado actual
    clock: 0,      // tiempo global
    shake: 0,
    fade: 1,
    cam: { x: W / 2, y: H / 2, z: 1 },       // fundido de entrada desde negro
    wheelAngle: 0,
    motoX: LAYOUT.motoStartX,
    melSmile: 0.2,
    blinkTimer: 2,
    blink: false,
    walkSteps: 0,
    flags: {},
    sunset: 0,
    rereading: false,
    rereadT: 0,
    willows: [],
    clouds: [],
    birds: [],
  };

  function setState(next) {
    game.state = next;
    game.t = 0;
    game.flags = {};
    onEnter(next);
  }

  // Configura la UI al entrar a cada estado
  function onEnter(state) {
    const { hint, heart, finalBtns } = ui;
    switch (state) {
      case S.WAITING:
        hint.textContent = 'Toca la pantalla';
        hint.classList.remove('is-hidden');
        showAction('Comenzar');
        heart.className = 'big-heart';
        finalBtns.hidden = true;
        break;
      case S.ARRIVING:
        hint.classList.add('is-hidden');
        hideAction();
        Sound.engineStart();
        break;
      case S.GIFT:
        hideAction();
        break;
      case S.CARD_SHOWN:
        heart.className = 'big-heart hide';
        hideAction();
        Sound.paper();
        break;
      case S.CARD_OPEN:
        hideAction();
        Sound.paper();
        ui.live.textContent = CARD_INSIDE.paragraphs.filter(Boolean).join(' ');
        break;
      case S.FINAL:
        hideAction();
        Sound.celebrate();
        break;
    }
  }

  function showAction(label, bounce = false) {
    ui.action.textContent = label;
    ui.action.classList.remove('is-hidden');
    ui.action.classList.toggle('bounce', bounce);
  }

  function hideAction() {
    ui.action.classList.add('is-hidden');
    ui.action.classList.remove('bounce');
  }

  const actionVisible = () => !ui.action.classList.contains('is-hidden');

  // Acción principal (botón o toque en la pantalla)
  function primaryAction() {
    Sound.init();
    switch (game.state) {
      case S.WAITING:
        setState(S.ARRIVING);
        break;
      case S.GIFT:
        if (actionVisible()) setState(S.CARD_SHOWN);
        break;
      case S.CARD_SHOWN:
        if (actionVisible()) setState(S.CARD_OPEN);
        break;
    }
  }

  function restart() {
    particles.length = 0;
    confetti.length = 0;
    game.motoX = LAYOUT.motoStartX;
    game.melSmile = 0.2;
    game.sunset = 0;
    game.cam = { x: W / 2, y: H / 2, z: 1 };
    game.rereading = false;
    game.fade = 1;
    ui.finalBtns.hidden = true;
    ui.live.textContent = '';
    setState(S.WAITING);
  }

  /* ---------- Posiciones de la escena de entrega (en función del tiempo) ---------- */
  const GIFT_T = (() => {
    const a = TIMING.dismount;
    const b = a + TIMING.walk;
    const c = b + TIMING.showBouquet;
    const d = c + TIMING.handOver;
    return { walkStart: a, walkEnd: b, bouquetShown: c, handed: d };
  })();

  const standX = () => LAYOUT.melX - 22;

  function nahuPoseGift(t) {
    const mx = LAYOUT.motoEndX;
    const fromX = mx + 12, fromY = LAYOUT.rideY + 6;
    if (t < 0.35) return { mode: 'ride' };
    if (t < GIFT_T.walkStart) {
      // se baja: pequeño saltito desde el asiento
      const k = Ease.inOut(prog(t, 0.35, GIFT_T.walkStart - 0.35));
      return {
        mode: 'stand',
        x: lerp(mx - 4, fromX, k),
        y: lerp(LAYOUT.rideY - 2, fromY, k) - Math.sin(k * Math.PI) * 5,
      };
    }
    if (t < GIFT_T.walkEnd) {
      const k = Ease.inOut(prog(t, GIFT_T.walkStart, TIMING.walk));
      return { mode: 'walk', x: lerp(fromX, standX(), k), y: lerp(fromY, LAYOUT.melY, k), walk: (t - GIFT_T.walkStart) * 8 };
    }
    return { mode: 'stand', x: standX(), y: LAYOUT.melY };
  }

  /* =======================================================================
   * 11. UPDATE
   * ===================================================================== */

  function update(dt) {
    game.clock += dt;
    game.t += dt;
    game.fade = Math.max(0, game.fade - dt * 2.2);
    game.shake = Math.max(0, game.shake - dt);
    const t = game.t;

    // parpadeo de los personajes
    game.blinkTimer -= dt;
    if (game.blinkTimer <= 0) {
      game.blink = !game.blink;
      game.blinkTimer = game.blink ? 0.12 : 2 + Math.random() * 2.5;
    }

    // nubes y pájaros
    for (const c of game.clouds) {
      c.x += c.speed * dt;
      if (c.x > W + 10) c.x = -c.spr.width - 10;
    }
    for (const b of game.birds) {
      b.x += b.speed * dt;
      if (b.x > W + 20) {
        b.x = -40 - Math.random() * 200;
        b.y = 20 + Math.random() * 40;
      }
    }

    switch (game.state) {
      case S.WAITING:
        game.melSmile = 0.25;
        break;

      case S.ARRIVING: {
        const k = prog(t, 0, TIMING.arrive);
        const prev = game.motoX;
        game.motoX = lerp(LAYOUT.motoStartX, LAYOUT.motoEndX, Ease.outSine(k));
        const speed = (game.motoX - prev) / Math.max(dt, 1e-4);
        game.wheelAngle += (speed / WHEELS.r) * dt;
        game.melSmile = lerp(0.25, 0.75, k);
        Sound.engineSpeed(clamp(speed / 70, 0, 1));
        // líneas de velocidad y humito del escape
        if (k < 1 && Math.random() < dt * 30 * (1 - k)) {
          spawn({ kind: 'speed', x: game.motoX - 30 - Math.random() * 20, y: LAYOUT.rideY - 6 - Math.random() * 22, vx: -40, life: 0.35, w: 6 + Math.floor(Math.random() * 10) });
        }
        if (Math.random() < dt * 14) {
          spawn({ kind: 'puff', x: game.motoX - 27, y: LAYOUT.rideY - 9, vx: -12 - Math.random() * 10, vy: -6, life: 0.7 });
        }
        if (k >= 1 && !game.flags.stopped) {
          game.flags.stopped = true;
          game.shake = REDUCED_MOTION ? 0 : 0.25;
          Sound.engineSpeed(0);
        }
        if (t >= TIMING.arrive + TIMING.arrivePause) {
          Sound.engineStop();
          setState(S.GIFT);
        }
        break;
      }

      case S.GIFT: {
        const f = game.flags;
        if (t > 0.3 && !f.kick) {
          f.kick = true;
          Sound.clunk();
        }
        // pasos
        if (t > GIFT_T.walkStart && t < GIFT_T.walkEnd) {
          const steps = Math.floor((t - GIFT_T.walkStart) * 4);
          if (steps !== game.walkSteps) {
            game.walkSteps = steps;
            Sound.step();
          }
        }
        if (t > GIFT_T.walkEnd && !f.shown) {
          f.shown = true;
          Sound.pop();
          const p = nahuPoseGift(t);
          for (let i = 0; i < 10; i++) {
            spawn({ kind: 'spark', x: p.x + 10 + (Math.random() - 0.5) * 20, y: p.y - 30 + (Math.random() - 0.5) * 20, vy: -8, life: 0.6 + Math.random() * 0.4, c: pick([PAL.yellow, '#ffffff', PAL.pink]) });
          }
        }
        game.melSmile = t > GIFT_T.bouquetShown ? 1 : 0.8;
        if (t > GIFT_T.handed && !f.handed) {
          f.handed = true;
          Sound.sparkle();
          ui.heart.className = 'big-heart show';
          for (let i = 0; i < 14; i++) {
            spawn({ kind: 'heart', big: Math.random() > 0.6, x: LAYOUT.melX - 12 + Math.random() * 16, y: LAYOUT.melY - 40, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 25, life: 1.4 + Math.random(), fade: true });
          }
        }
        // pétalos cayendo después de la entrega
        if (f.handed && Math.random() < dt * 10) spawnPetal();
        if (t > GIFT_T.handed + TIMING.cardButtonDelay && !f.button) {
          f.button = true;
          showAction('Ver la carta');
        }
        break;
      }

      case S.CARD_SHOWN:
        if (Math.random() < dt * 6) spawnPetal();
        if (t > TIMING.cardIn && !game.flags.button) {
          game.flags.button = true;
          showAction('Abrir carta', true);
        }
        break;

      case S.CARD_OPEN: {
        const revealT = t - TIMING.cardFlip;
        if (revealT > CARD_INSIDE.revealTime + TIMING.readHold) setState(S.FINAL);
        break;
      }

      case S.FINAL:
        game.sunset = Math.min(1, game.sunset + dt * 0.5);
        if (Math.random() < dt * 2.2) {
          spawn({ kind: 'heart', big: Math.random() > 0.5, x: LAYOUT.melX - 18 + Math.random() * 14, y: LAYOUT.melY - 44, vx: (Math.random() - 0.5) * 16, vy: -14 - Math.random() * 10, life: 2.2, fade: true, sway: 3, seed: Math.random() * 6 });
        }
        if (Math.random() < dt * 8) spawnPetal();
        if (t > 1.2 && !game.flags.btns) {
          game.flags.btns = true;
          ui.finalBtns.hidden = false;
        }
        if (game.rereading) game.rereadT += dt;
        break;
    }

    updateCamera(dt);
    updateParticles(dt);
    updateConfetti(dt, game.state === S.FINAL);
  }

  /* ---------- Cámara: plano general al principio, zoom x1.5 sobre la pareja ---------- */
  const ZOOM_IN = 1.7; // de 2px a 3.4px por pixel del mundo
  const ZOOM_FINAL = 1.38;

  function cameraTarget() {
    const st = game.state;
    if (st === S.WAITING || st === S.ARRIVING || (st === S.GIFT && game.t < 0.5)) {
      return { x: W / 2, y: H / 2, z: 1 };
    }
    // final: plano más abierto para ver el graffiti y el mural del corazón
    if (st === S.FINAL) return { x: 300, y: 180, z: ZOOM_FINAL };
    // encuadre: la pareja + el graffiti completo detrás
    const frameX = 250;
    let x = frameX;
    if (st === S.GIFT) {
      const p = nahuPoseGift(game.t);
      x = p.mode === 'ride' ? LAYOUT.motoEndX + 60 : Math.min(frameX, (p.x + LAYOUT.melX) / 2);
    }
    return { x, y: 176, z: ZOOM_IN };
  }

  function updateCamera(dt) {
    const c = game.cam, tg = cameraTarget();
    const k = 1 - Math.exp(-dt * 2.6);
    c.z += (tg.z - c.z) * k;
    if (Math.abs(tg.z - c.z) < 0.002) c.z = tg.z;
    c.x += (tg.x - c.x) * k;
    c.y += (tg.y - c.y) * k;
    // que la vista nunca se salga del mundo
    const hw = W / c.z / 2, hh = H / c.z / 2;
    c.x = clamp(c.x, hw, W - hw);
    c.y = clamp(c.y, hh, H - hh);
  }

  function spawnPetal() {
    spawn({
      kind: 'petal',
      x: Math.random() * W,
      y: -4,
      vx: 6 + Math.random() * 8,
      vy: 14 + Math.random() * 12,
      life: 12,
      c: pick([PAL.pink, PAL.red, '#ffb6d5', PAL.yellow]),
      w: Math.random() > 0.5 ? 2 : 1,
      h: 1,
      sway: 2 + Math.random() * 2,
      seed: Math.random() * 6,
    });
  }

  /* =======================================================================
   * 12. RENDER
   * ===================================================================== */

  function renderWorld() {
    const g = wg;
    const t = game.clock;

    // cielo (día → atardecer en el final)
    g.globalAlpha = 1;
    g.drawImage(SPR.sky, 0, 0);
    if (game.sunset > 0) {
      g.globalAlpha = game.sunset;
      g.drawImage(SPR.skySunset, 0, 0);
      g.globalAlpha = 1;
    }
    // sol
    const sunY = lerp(30, 70, game.sunset);
    disc(g, 452, sunY, 9, game.sunset > 0.5 ? '#ffd27a' : '#fff6c9');
    disc(g, 452, sunY, 7, game.sunset > 0.5 ? '#ffe7a8' : '#ffffff');

    for (const c of game.clouds) g.drawImage(c.spr, Math.round(c.x), c.y);
    for (const b of game.birds) {
      const up = Math.floor(t * 6 + b.phase) % 2;
      const bx = Math.round(b.x), by = Math.round(b.y);
      rect(g, bx, by, 1, 1, '#2f3a48');
      rect(g, bx - 2, by - up, 2, 1, '#2f3a48');
      rect(g, bx + 1, by - up, 2, 1, '#2f3a48');
    }

    g.drawImage(SPR.bg, 0, 0);

    // sauce izquierdo detrás de todo lo que está en la vereda
    drawWillow(g, game.willows[0], t);

    // entidades ordenadas por profundidad (y)
    const ents = [];
    ents.push({ y: LAYOUT.glhY, draw: () => drawMoto(g, SPR.glh, LAYOUT.glhX, LAYOUT.glhY, 0, 'glh') });
    buildStateEntities(ents, t);
    ents.sort((a, b) => a.y - b.y);
    for (const e of ents) e.draw();

    drawWillow(g, game.willows[1], t);
    drawParticles(g);

    // tinte cálido del atardecer
    if (game.sunset > 0) {
      g.save();
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = `rgba(255,180,150,${0.28 * game.sunset})`;
      g.fillRect(0, 0, W, H);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(80,30,60,${0.12 * game.sunset})`;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  }

  function drawShadow(g, x, y, w) {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(Math.round(x - w / 2), Math.round(y - 1), w, 2);
    g.fillRect(Math.round(x - w / 2) + 2, Math.round(y), w - 4, 1);
  }

  function drawMoto(g, spr, x, groundY, angle, style) {
    const ox = Math.round(x - MOTO_W / 2), oy = Math.round(groundY - MOTO_H);
    drawShadow(g, x, groundY, 48);
    g.drawImage(spr, ox, oy);
    drawWheel(g, ox + WHEELS.rearX, oy + WHEELS.y, angle, style);
    drawWheel(g, ox + WHEELS.frontX, oy + WHEELS.y, angle, style);
    // vuelve a dibujar guardabarros delantero y horquilla sobre la rueda
    g.drawImage(spr, 38, 17, 16, 6, ox + 38, oy + 17, 16, 6);
  }

  function melOpts(extra) {
    return Object.assign({ smile: game.melSmile, blink: game.blink }, extra);
  }

  function buildStateEntities(ents, t) {
    const st = game.state;
    const melX = LAYOUT.melX, melY = LAYOUT.melY;
    const mx = game.motoX;
    const bounceMel = st === S.GIFT && game.flags.handed ? Math.max(0, Math.sin((t - GIFT_T.handed) * 9) * 2 * Math.max(0, 1 - (t - GIFT_T.handed))) : 0;

    if (st === S.FINAL) {
      // abrazo
      ents.push({ y: melY, draw: () => {
        drawShadow(wg, melX - 8, melY, 24);
        drawMel(wg, melX - 4, melY, melOpts({ hug: true, look: -1, eyesClosed: true, smile: 1, tilt: -1 }));
        drawNahu(wg, melX - 13, melY, { hug: true, look: 1, eyesClosed: true, smile: 1 });
        // mano de Mel sobre la espalda de Nahu
        rect(wg, melX - 17, melY - 23, 2, 2, MEL.skin);
      } });
      ents.push({ y: LAYOUT.rideY, draw: () => drawMoto(wg, SPR.ybrParked, LAYOUT.motoEndX, LAYOUT.rideY, 0, 'ybr') });
      // Mel levanta el ramo feliz
      ents.push({ y: melY + 1, draw: () => {
        const sway = Math.round(Math.sin(game.clock * 2.5) * 0.7);
        wg.drawImage(SPR.bouquet, melX - 3 + sway, melY - 46);
        rect(wg, melX + 4, melY - 29, 2, 2, MEL.skin);
      } });
      return;
    }

    // Mel
    const melHolding = st === S.GIFT ? t > GIFT_T.handed : st !== S.WAITING && st !== S.ARRIVING;
    const look = st === S.ARRIVING ? -1 : st === S.GIFT ? -1 : 0;
    ents.push({ y: melY, draw: () => {
      drawShadow(wg, melX, melY, 14);
      drawMel(wg, melX, melY, melOpts({ look, hold: melHolding, hop: bounceMel }));
      if (melHolding) wg.drawImage(SPR.bouquet, melX - 8, melY - 27 - Math.round(bounceMel));
    } });

    // Nahu + YBR
    if (st === S.WAITING) return;
    if (st === S.ARRIVING) {
      ents.push({ y: LAYOUT.rideY, draw: () => {
        const ox = Math.round(mx - MOTO_W / 2), oy = LAYOUT.rideY - MOTO_H;
        const vib = game.t < TIMING.arrive ? Math.round(Math.sin(game.clock * 60) * 0.6) : 0;
        drawMoto(wg, SPR.ybr, mx, LAYOUT.rideY, game.wheelAngle, 'ybr');
        drawNahuRiding(wg, ox + 17, oy + 13 + vib, { smile: 1 });
        // haz del faro
        wg.globalAlpha = 0.18;
        wg.fillStyle = '#fff4b0';
        wg.beginPath();
        wg.moveTo(ox + 48, oy + 10);
        wg.lineTo(ox + 90, oy + 4);
        wg.lineTo(ox + 90, oy + 26);
        wg.closePath();
        wg.fill();
        wg.globalAlpha = 1;
      } });
      return;
    }

    const parked = st !== S.GIFT || t > 0.3;
    const pose = st === S.GIFT ? nahuPoseGift(t) : { mode: 'stand', x: standX(), y: melY };
    ents.push({ y: LAYOUT.rideY, draw: () => {
      const ox = Math.round(mx - MOTO_W / 2), oy = LAYOUT.rideY - MOTO_H;
      drawMoto(wg, parked ? SPR.ybrParked : SPR.ybr, mx, LAYOUT.rideY, game.wheelAngle, 'ybr');
      if (pose.mode === 'ride') drawNahuRiding(wg, ox + 17, oy + 13, { smile: 1 });
    } });
    if (pose.mode === 'ride') return;

    const giving = st === S.GIFT && t > GIFT_T.walkEnd && t <= GIFT_T.handed;
    ents.push({ y: pose.y + 0.5, draw: () => {
      drawShadow(wg, pose.x, pose.y, 14);
      const hand = drawNahu(wg, Math.round(pose.x), Math.round(pose.y), {
        look: 1, walk: pose.walk, give: giving, smile: 1, blink: game.blink,
      });
      if (giving) {
        // el ramo aparece en su mano y viaja hasta Mel
        const k = Ease.inOut(prog(t, GIFT_T.bouquetShown, TIMING.handOver));
        const bx = lerp(hand.handX - 8, melX - 8, k);
        const by = lerp(hand.handY - 17, melY - 27, k) - Math.sin(k * Math.PI) * 6;
        const sway = Math.round(Math.sin(game.clock * 4) * 0.6);
        wg.drawImage(SPR.bouquet, Math.round(bx) + sway, Math.round(by));
      }
    } });
  }

  function render() {
    renderWorld();
    const t = game.clock;
    const g = ctx;
    g.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    g.imageSmoothingEnabled = false;

    // mundo escalado x2 (con temblor al frenar la moto)
    let sx = 0, sy = 0;
    if (game.shake > 0) {
      sx = Math.round((Math.random() - 0.5) * 3) * PX;
      sy = Math.round((Math.random() - 0.5) * 3) * PX;
    }
    const cam = game.cam;
    const sw = W / cam.z, sh = H / cam.z;
    const unit = PX * cam.z; // pixeles de pantalla por pixel del mundo
    const cx0 = clamp(Math.round((cam.x - sw / 2) * unit) / unit, 0, W - sw);
    const cy0 = clamp(Math.round((cam.y - sh / 2) * unit) / unit, 0, H - sh);
    g.drawImage(world, cx0, cy0, sw, sh, sx, sy, VIEW_W, VIEW_H);

    // viñeta suave
    const vg = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(10,0,30,0.28)');
    g.fillStyle = vg;
    g.fillRect(0, 0, VIEW_W, VIEW_H);

    const st = game.state;
    const cx = VIEW_W / 2, cy = VIEW_H / 2 - 18;

    // overlay oscuro detrás de la carta
    let dim = 0;
    if (st === S.CARD_SHOWN) dim = prog(game.t, 0, 0.4) * 0.4;
    else if (st === S.CARD_OPEN) dim = 0.4 + prog(game.t, 0, TIMING.cardFlip) * 0.1;
    else if (st === S.FINAL) dim = game.rereading ? 0.5 : 0.5 * (1 - prog(game.t, 0, 0.6));
    if (dim > 0) {
      g.fillStyle = `rgba(0,0,0,${dim})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }

    if (st === S.CARD_SHOWN) {
      // entrada: fade + escala 0.8 → 1
      const k = Ease.outBack(prog(game.t, 0, TIMING.cardIn));
      const a = prog(game.t, 0, TIMING.cardIn * 0.8);
      g.save();
      g.globalAlpha = a;
      g.translate(cx, cy);
      g.scale(0.8 + 0.2 * k, 0.8 + 0.2 * k);
      g.rotate((1 - k) * -0.05);
      drawCardFront(g, t);
      g.restore();
    } else if (st === S.CARD_OPEN) {
      // "page flip": la tapa gira sobre su eje y aparece el interior más grande
      const half = TIMING.cardFlip / 2;
      g.save();
      g.translate(cx, cy);
      if (game.t < half) {
        const k = Ease.inOut(game.t / half);
        g.scale(Math.max(0.02, 1 - k), 1 + k * 0.04);
        g.transform(1, k * 0.08, 0, 1, 0, 0);
        drawCardFront(g, t);
        g.fillStyle = `rgba(0,0,0,${k * 0.35})`;
        g.fillRect(-CARD_FRONT.w / 2, -CARD_FRONT.h / 2, CARD_FRONT.w, CARD_FRONT.h);
      } else {
        const k = Ease.outCubic(prog(game.t, half, half));
        const s = lerp(CARD_FRONT.h / CARD_INSIDE.h, 1, k);
        g.translate(0, 12 * k);
        g.scale(Math.max(0.02, k) * s, s);
        g.rotate((1 - k) * 0.06);
        g.transform(1, (1 - k) * -0.08, 0, 1, 0, 0);
        drawCardInside(g, t, game.t - TIMING.cardFlip);
      }
      g.restore();
    } else if (st === S.FINAL) {
      // la carta se va achicando hacia arriba
      const k = Ease.inOut(prog(game.t, 0, 0.6));
      if (k < 1) {
        g.save();
        g.globalAlpha = 1 - k;
        g.translate(cx, cy + 12 - k * 60);
        g.scale(1 - k * 0.4, 1 - k * 0.4);
        drawCardInside(g, t, 999);
        g.restore();
      }
    }

    // confeti + título final
    if (st === S.FINAL || confetti.length) drawConfetti(g);
    if (st === S.FINAL) {
      drawFinalTitle(g, t, prog(game.t, 0.4, 0.8) * (game.rereading ? 0.15 : 1));
      if (game.rereading) {
        const k = Ease.outBack(prog(game.rereadT, 0, 0.4));
        g.save();
        g.translate(cx, cy - 8);
        g.scale(0.82 + 0.1 * k, 0.82 + 0.1 * k);
        g.globalAlpha = prog(game.rereadT, 0, 0.25);
        drawCardInside(g, t, 999);
        g.restore();
      }
    }

    // fundido de entrada
    if (game.fade > 0) {
      g.fillStyle = `rgba(10,5,25,${game.fade})`;
      g.fillRect(0, 0, VIEW_W, VIEW_H);
    }
  }

  /* =======================================================================
   * 13. INICIO Y EVENTOS
   * ===================================================================== */

  function buildAssets() {
    SPR.graffiti = buildGraffiti();
    SPR.delSudLogo = buildDelSudLogo();
    SPR.mural = buildMural();
    SPR.sky = buildSky(PAL.sky);
    SPR.skySunset = buildSky(PAL.skySunset);
    SPR.bg = buildBackground();
    SPR.heart = buildHeart(6, '#ff4d6d', '#8e1b3a', '#ffc2cf');
    SPR.heartBig = buildHeart(9, '#ff3b62', '#7d1233', '#ffc2cf');
    SPR.bouquet = buildBouquet();
    SPR.ybr = buildYBR(false);
    SPR.ybrParked = buildYBR(true);
    SPR.glh = buildGLH();

    game.willows = [makeWillow(46, 216, 11), makeWillow(512, 216, 23, 0.5)];
    game.clouds = [
      { spr: buildCloud(1), x: 20, y: 14, speed: 3 },
      { spr: buildCloud(2), x: 200, y: 36, speed: 5 },
      { spr: buildCloud(3), x: 330, y: 8, speed: 2 },
      { spr: buildCloud(4), x: 440, y: 44, speed: 4 },
    ];
    game.birds = [
      { x: 60, y: 30, speed: 14, phase: 0 },
      { x: 72, y: 36, speed: 14, phase: 1 },
    ];
  }

  let last = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(frame);
  }

  function bindEvents() {
    ui.action.addEventListener('click', (e) => {
      e.stopPropagation();
      primaryAction();
    });
    canvas.addEventListener('click', () => {
      if (game.state === S.FINAL && game.rereading) {
        closeReread();
        return;
      }
      if (game.state === S.WAITING || actionVisible()) primaryAction();
    });
    ui.reread.addEventListener('click', () => {
      if (game.rereading) closeReread();
      else {
        game.rereading = true;
        game.rereadT = 0;
        ui.reread.textContent = 'Cerrar la carta ✕';
        Sound.paper();
      }
    });
    ui.restart.addEventListener('click', () => {
      closeReread();
      restart();
    });
    ui.music.addEventListener('click', (e) => {
      e.stopPropagation();
      Sound.init();
      if (ui.musicPanel.hidden) openMusic();
      else closeMusic();
    });
    ui.musicClose.addEventListener('click', closeMusic);
    ui.fs.addEventListener('click', (e) => {
      e.stopPropagation();
      if (fullMode) exitFull();
      else enterFull();
    });
    ui.fsHint.addEventListener('click', enterFull);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    ui.mute.addEventListener('click', () => {
      Sound.init();
      Sound.setMuted(!Sound.muted);
      ui.mute.textContent = Sound.muted ? '🔇' : '🔊';
      ui.mute.setAttribute('aria-pressed', String(Sound.muted));
      ui.mute.setAttribute('aria-label', Sound.muted ? 'Activar sonido' : 'Silenciar sonido');
    });
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ' ') && document.activeElement === document.body) {
        e.preventDefault();
        primaryAction();
      }
    });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', resize);
    document.addEventListener('visibilitychange', () => {
      if (!Sound.ctx) return;
      if (document.hidden) Sound.ctx.suspend();
      else Sound.ctx.resume();
    });
  }

  /* ---------- Música desde YouTube (botón ▶) ----------
   * El reproductor se crea recién al tocar ▶ (así no carga nada de YouTube
   * antes). Mientras suena, los efectos del juego bajan de volumen.        */
  const SONG_ID = 'cvFU75z8Tg8';

  function openMusic() {
    if (!ui.musicFrame.firstChild) {
      const f = document.createElement('iframe');
      f.src = `https://www.youtube-nocookie.com/embed/${SONG_ID}?autoplay=1&playsinline=1&rel=0&modestbranding=1`;
      f.title = 'Música';
      f.allow = 'autoplay; encrypted-media; picture-in-picture';
      f.referrerPolicy = 'strict-origin-when-cross-origin';
      ui.musicFrame.appendChild(f);
    }
    ui.musicPanel.hidden = false;
    ui.music.classList.add('is-playing');
    ui.music.setAttribute('aria-expanded', 'true');
    ui.music.querySelector('.music-icon').textContent = '♪';
    Sound.duck(true);
  }

  function closeMusic() {
    ui.musicFrame.textContent = ''; // quitar el iframe detiene la canción
    ui.musicPanel.hidden = true;
    ui.music.classList.remove('is-playing');
    ui.music.setAttribute('aria-expanded', 'false');
    ui.music.querySelector('.music-icon').textContent = '▶';
    Sound.duck(false);
  }

  function closeReread() {
    game.rereading = false;
    ui.reread.textContent = 'Leer la carta 💌';
  }

  // Salto directo a un estado para pruebas: ?escena=final (también ?t=segundos)
  function debugJump() {
    const params = new URLSearchParams(location.search);
    const scene = (params.get('escena') || '').toUpperCase();
    if (!S[scene]) return;
    const skip = parseFloat(params.get('t') || '0');
    game.fade = 0;
    const order = [S.WAITING, S.ARRIVING, S.GIFT, S.CARD_SHOWN, S.CARD_OPEN, S.FINAL];
    for (const s of order) {
      if (s === S.WAITING && scene !== s) continue;
      setState(s);
      if (s === scene) break;
      // avanza rápido los estados intermedios
      if (s === S.ARRIVING) game.motoX = LAYOUT.motoEndX;
      if (s === S.GIFT) {
        game.t = 99;
        update(0);
      }
    }
    if (scene !== S.GIFT && scene !== S.ARRIVING) game.cam = cameraTarget();
    const steps = Math.round(skip * 60);
    for (let i = 0; i < steps; i++) update(1 / 60);
  }

  function init() {
    buildAssets();
    resize();
    layoutCard();
    bindEvents();
    onEnter(S.WAITING);
    debugJump();
    requestAnimationFrame((now) => {
      last = now;
      frame(now);
    });
  }

  // Georgia es fuente del sistema; igual esperamos a que las fuentes estén listas
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(init);
  else window.addEventListener('load', init);
})();
