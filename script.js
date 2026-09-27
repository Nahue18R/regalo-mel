const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const messageEl = document.getElementById('message');
const actionBtn = document.getElementById('actionBtn');

// Configuración del juego
const GAME_WIDTH = 1024;
const GAME_HEIGHT = 576;
const SCALE = 2; // Factor de escala para pixel art

// Estados del juego
const STATES = {
    INTRO: 'intro',
    ARRIVING: 'arriving',
    GIVING_GIFT: 'giving_gift',
    CARD_SHOWN: 'card_shown',
    CARD_OPEN: 'card_open',
    FINAL: 'final'
};

// Estado del juego
let gameState = STATES.INTRO;
let animationFrame = 0;
let nahuelX = -200;
const nahuelStartX = -200;
const nahuelEndX = 350;

// Colores
const COLORS = {
    SKY: '#87CEEB',
    GROUND: '#9BA89A',
    WALL: '#A9A9A9',
    GRAFFITI: '#1a1a1a',
    GRAFFITI_TEXT: '#FFFFFF',
    SAUCO_COLOR: '#2D5016',
    REJA_GRAY: '#4A4A4A',
    MOTO_BLACK: '#1a1a1a',
    MOTO_GRAY: '#808080',
    MOTO_ORANGE: '#FF8C00',
    GIRL_SKIN: '#F4A460',
    GIRL_HAIR: '#1a1a1a',
    BOY_SKIN: '#F4A460',
    BOY_HAIR: '#2C1810',
    RAMO_RED: '#DC143C',
    RAMO_PINK: '#FF69B4',
    RAMO_YELLOW: '#FFD700',
    SNOOPY_WHITE: '#FFFFFF',
    SNOOPY_BLACK: '#000000',
    SNOOPY_BROWN: '#8B4513'
};

// Inicializar
window.addEventListener('load', () => {
    draw();
});

actionBtn.addEventListener('click', handleAction);

function handleAction() {
    if (gameState === STATES.INTRO) {
        gameState = STATES.ARRIVING;
        actionBtn.style.display = 'none';
        messageEl.textContent = '';
    } else if (gameState === STATES.GIVING_GIFT) {
        gameState = STATES.CARD_SHOWN;
        actionBtn.textContent = 'Abrir carta';
        actionBtn.style.display = 'block';
    } else if (gameState === STATES.CARD_SHOWN) {
        gameState = STATES.CARD_OPEN;
        actionBtn.style.display = 'none';
    } else if (gameState === STATES.CARD_OPEN) {
        gameState = STATES.FINAL;
        actionBtn.style.display = 'none';
    }
}

function draw() {
    // Limpiar canvas
    ctx.fillStyle = COLORS.SKY;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // Dibujar elementos de fondo
    drawGround();
    drawWall();
    drawSauces();
    drawReja();
    drawGraffiti();
    drawDrogueriaSign();

    // Dibujar personajes y objetos según estado
    if (gameState === STATES.INTRO) {
        drawMelWaiting(500, 350);
        messageEl.textContent = 'Toca la pantalla';
        actionBtn.textContent = 'Comenzar';
        actionBtn.style.display = 'block';
    } else if (gameState === STATES.ARRIVING) {
        updateArriving();
        drawNahuelOnMoto(nahuelX, 280);
        drawMelWaiting(500, 350);
    } else if (gameState === STATES.GIVING_GIFT) {
        drawNahuel(350, 320);
        drawMelWaiting(500, 350);
        drawRamo(420, 300);
        messageEl.textContent = '💛';
        actionBtn.textContent = 'Ver la carta';
        actionBtn.style.display = 'block';
    } else if (gameState === STATES.CARD_SHOWN) {
        drawNahuel(350, 320);
        drawMelWaiting(500, 350);
        drawCard(GAME_WIDTH / 2 - 150, 150);
        messageEl.textContent = '';
        actionBtn.textContent = 'Abrir carta';
        actionBtn.style.display = 'block';
    } else if (gameState === STATES.CARD_OPEN) {
        drawCardOpen(GAME_WIDTH / 2 - 180, 100);
        messageEl.textContent = '';
        setTimeout(() => {
            gameState = STATES.FINAL;
        }, 100);
    } else if (gameState === STATES.FINAL) {
        drawCardOpen(GAME_WIDTH / 2 - 180, 100);
        messageEl.textContent = 'Tkm, Nahu 💛';
        drawConfetti();
    }

    requestAnimationFrame(draw);
}

function updateArriving() {
    if (nahuelX < nahuelEndX) {
        nahuelX += 4;
    } else if (gameState === STATES.ARRIVING) {
        gameState = STATES.GIVING_GIFT;
    }
}

function drawGround() {
    ctx.fillStyle = COLORS.GROUND;
    ctx.fillRect(0, 450, GAME_WIDTH, 126);
    
    // Líneas de calle
    ctx.strokeStyle = '#6B7A6E';
    ctx.lineWidth = 2;
    for (let i = 0; i < GAME_WIDTH; i += 80) {
        ctx.beginPath();
        ctx.moveTo(i, 500);
        ctx.lineTo(i + 40, 500);
        ctx.stroke();
    }
}

function drawWall() {
    ctx.fillStyle = COLORS.WALL;
    ctx.fillRect(0, 200, GAME_WIDTH, 250);
}

function drawSauces() {
    // Árbol sauco izquierdo
    drawSauceTree(150, 200, 80);
    // Árbol sauco derecho
    drawSauceTree(900, 180, 100);
}

function drawSauceTree(x, y, height) {
    // Tronco
    ctx.fillStyle = '#5C4033';
    ctx.fillRect(x - 8, y + height - 20, 16, 20);
    
    // Follaje
    ctx.fillStyle = COLORS.SAUCO_COLOR;
    for (let i = 0; i < 5; i++) {
        ctx.fillRect(x - 40 + i * 15, y - 30 + i * 10, 50, 35);
    }
    ctx.fillRect(x - 50, y + 20, 100, 40);
}

function drawReja() {
    ctx.strokeStyle = COLORS.REJA_GRAY;
    ctx.lineWidth = 3;
    
    // Barras verticales
    for (let i = 0; i < 15; i++) {
        ctx.beginPath();
        ctx.moveTo(50 + i * 60, 300);
        ctx.lineTo(50 + i * 60, 430);
        ctx.stroke();
    }
    
    // Barras horizontales
    ctx.beginPath();
    ctx.moveTo(50, 330);
    ctx.lineTo(900, 330);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 380);
    ctx.lineTo(900, 380);
    ctx.stroke();
}

function drawGraffiti() {
    ctx.fillStyle = COLORS.GRAFFITI;
    ctx.fillRect(100, 240, 600, 120);
    
    ctx.fillStyle = COLORS.GRAFFITI_TEXT;
    ctx.font = 'bold 32px Arial';
    ctx.textAlign = 'left';
    ctx.fillText('ME GUSTAS MAS QUE', 120, 280);
    ctx.fillText('LEVANTARME TARDE', 120, 320);
}

function drawDrogueriaSign() {
    // Frente droguería
    ctx.fillStyle = '#1a472a';
    ctx.fillRect(750, 250, 200, 180);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('DOC SUR', 850, 320);
}

function drawNahuelOnMoto(x, y) {
    // YBR 125 Negra
    drawYBR(x, y);
    
    // Nahuel en la moto
    // Cabeza
    ctx.fillStyle = COLORS.BOY_SKIN;
    ctx.fillRect(x + 50, y - 80, 24, 26);
    
    // Pelo
    ctx.fillStyle = COLORS.BOY_HAIR;
    ctx.fillRect(x + 48, y - 105, 28, 25);
    
    // Cuerpo (Adidas)
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 45, y - 50, 32, 45);
    
    // Brazos
    ctx.fillStyle = COLORS.BOY_SKIN;
    ctx.fillRect(x + 40, y - 45, 8, 35);
    ctx.fillRect(x + 77, y - 45, 8, 35);
}

function drawYBR(x, y) {
    // Rueda trasera
    ctx.fillStyle = COLORS.MOTO_BLACK;
    ctx.beginPath();
    ctx.arc(x + 20, y + 20, 18, 0, Math.PI * 2);
    ctx.fill();
    
    // Rueda delantera
    ctx.beginPath();
    ctx.arc(x + 80, y + 20, 18, 0, Math.PI * 2);
    ctx.fill();
    
    // Chasis
    ctx.fillStyle = COLORS.MOTO_BLACK;
    ctx.fillRect(x + 25, y, 50, 15);
    
    // Asiento
    ctx.fillStyle = '#333333';
    ctx.fillRect(x + 30, y - 10, 40, 12);
    
    // Depósito
    ctx.fillStyle = COLORS.MOTO_BLACK;
    ctx.fillRect(x + 35, y - 25, 30, 15);
    
    // Manillar
    ctx.strokeStyle = COLORS.MOTO_GRAY;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x + 75, y - 15, 12, 0, Math.PI * 2);
    ctx.stroke();
}

function drawNahuel(x, y) {
    // Cabeza
    ctx.fillStyle = COLORS.BOY_SKIN;
    ctx.fillRect(x - 12, y - 60, 24, 28);
    
    // Pelo
    ctx.fillStyle = COLORS.BOY_HAIR;
    ctx.fillRect(x - 14, y - 85, 28, 25);
    
    // Lentes
    ctx.strokeStyle = COLORS.BOY_HAIR;
    ctx.lineWidth = 2;
    ctx.fillRect(x - 10, y - 50, 6, 6);
    ctx.fillRect(x + 2, y - 50, 6, 6);
    ctx.fillRect(x - 4, y - 48, 8, 2);
    
    // Cuerpo (Adidas negro)
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 16, y - 30, 32, 45);
    
    // Brazos
    ctx.fillStyle = COLORS.BOY_SKIN;
    ctx.fillRect(x - 18, y - 25, 6, 32);
    ctx.fillRect(x + 16, y - 25, 6, 32);
    
    // Piernas
    ctx.fillStyle = '#333333';
    ctx.fillRect(x - 10, y + 15, 8, 25);
    ctx.fillRect(x + 2, y + 15, 8, 25);
    
    // Zapatos
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 11, y + 40, 10, 6);
    ctx.fillRect(x + 1, y + 40, 10, 6);
}

function drawMelWaiting(x, y) {
    // Cabeza
    ctx.fillStyle = COLORS.GIRL_SKIN;
    ctx.fillRect(x - 12, y - 60, 24, 28);
    
    // Pelo largo negro
    ctx.fillStyle = COLORS.GIRL_HAIR;
    // Lado izquierdo
    ctx.fillRect(x - 16, y - 50, 6, 50);
    // Lado derecho
    ctx.fillRect(x + 10, y - 50, 6, 50);
    // Arriba
    ctx.fillRect(x - 14, y - 85, 28, 25);
    
    // Cuerpo (chamarra negra)
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 16, y - 30, 32, 40);
    
    // Brazos
    ctx.fillStyle = COLORS.GIRL_SKIN;
    ctx.fillRect(x - 18, y - 25, 6, 30);
    ctx.fillRect(x + 16, y - 25, 6, 30);
    
    // Pantalón jeans
    ctx.fillStyle = '#1a5a9a';
    ctx.fillRect(x - 12, y + 10, 8, 28);
    ctx.fillRect(x + 4, y + 10, 8, 28);
    
    // Zapatos
    ctx.fillStyle = '#000000';
    ctx.fillRect(x - 13, y + 38, 10, 6);
    ctx.fillRect(x + 3, y + 38, 10, 6);
}

function drawRamo(x, y) {
    // Tallo
    ctx.strokeStyle = '#228B22';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(x, y + 50);
    ctx.quadraticCurveTo(x - 10, y + 25, x, y);
    ctx.stroke();
    
    // Flores
    const flores = [
        { x: x, y: y - 10, color: COLORS.RAMO_RED, type: 'grande' },
        { x: x - 25, y: y + 15, color: COLORS.RAMO_PINK, type: 'mediano' },
        { x: x + 25, y: y + 20, color: COLORS.RAMO_YELLOW, type: 'mediano' },
        { x: x - 15, y: y - 5, color: COLORS.RAMO_RED, type: 'pequeño' },
        { x: x + 15, y: y + 5, color: COLORS.RAMO_PINK, type: 'pequeño' },
    ];
    
    flores.forEach(flor => {
        drawFlor(flor.x, flor.y, flor.color, flor.type);
    });
}

function drawFlor(x, y, color, size) {
    let radius = size === 'grande' ? 12 : size === 'mediano' ? 8 : 5;
    
    // Pétalos
    ctx.fillStyle = color;
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const px = x + Math.cos(angle) * radius;
        const py = y + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.arc(px, py, radius * 0.6, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Centro
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
}

function drawCard(x, y) {
    // Fondo de la carta
    ctx.fillStyle = '#FFF8DC';
    ctx.fillRect(x, y, 300, 320);
    ctx.strokeStyle = '#A9A9A9';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 300, 320);
    
    // Snoopy con flor
    drawSnoopyCard(x + 150, y + 100);
    
    // Texto
    ctx.fillStyle = '#000000';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Para la mujer más linda', x + 150, y + 240);
    ctx.fillText('de Villa Domínico y', x + 150, y + 260);
    ctx.fillText('todos sus alrededores', x + 150, y + 280);
    
    ctx.font = 'italic 14px Arial';
    ctx.fillStyle = '#FF1493';
    ctx.fillText('Tkm Mel 💛', x + 150, y + 300);
}

function drawSnoopyCard(x, y) {
    // Cuerpo (blanco)
    ctx.fillStyle = COLORS.SNOOPY_WHITE;
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 18, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Cabeza
    ctx.beginPath();
    ctx.ellipse(x, y - 15, 16, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Oreja izquierda
    ctx.fillStyle = COLORS.SNOOPY_BLACK;
    ctx.fillRect(x - 12, y - 35, 8, 12);
    
    // Oreja derecha
    ctx.fillRect(x + 4, y - 35, 8, 12);
    
    // Ojo
    ctx.fillStyle = COLORS.SNOOPY_BLACK;
    ctx.beginPath();
    ctx.arc(x - 4, y - 15, 2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.beginPath();
    ctx.arc(x + 4, y - 15, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Nariz
    ctx.beginPath();
    ctx.arc(x, y - 8, 2, 0, Math.PI * 2);
    ctx.fill();
    
    // Boca
    ctx.strokeStyle = COLORS.SNOOPY_BLACK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y - 5, 3, 0, Math.PI);
    ctx.stroke();
    
    // Patitas
    ctx.fillStyle = COLORS.SNOOPY_BLACK;
    ctx.fillRect(x - 12, y + 15, 5, 10);
    ctx.fillRect(x - 4, y + 15, 5, 10);
    ctx.fillRect(x + 4, y + 15, 5, 10);
    ctx.fillRect(x + 12, y + 15, 5, 10);
    
    // Flor en la pata
    ctx.fillStyle = COLORS.RAMO_YELLOW;
    ctx.beginPath();
    ctx.arc(x + 18, y - 10, 8, 0, Math.PI * 2);
    ctx.fill();
    
    // Pétalos de flor
    ctx.fillStyle = COLORS.RAMO_RED;
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const px = x + 18 + Math.cos(angle) * 10;
        const py = y - 10 + Math.sin(angle) * 10;
        ctx.beginPath();
        ctx.ellipse(px, py, 3, 5, angle, 0, Math.PI * 2);
        ctx.fill();
    }
    
    // Centro de flor
    ctx.fillStyle = COLORS.RAMO_YELLOW;
    ctx.beginPath();
    ctx.arc(x + 18, y - 10, 3, 0, Math.PI * 2);
    ctx.fill();
}

function drawCardOpen(x, y) {
    // Cubierta abierta
    ctx.fillStyle = '#FFF8DC';
    ctx.fillRect(x, y, 360, 380);
    ctx.strokeStyle = '#A9A9A9';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, 360, 380);
    
    // Snoopy grande
    drawSnoopyBig(x + 100, y + 80);
    
    // Texto de la carta
    ctx.fillStyle = '#1a1a1a';
    ctx.font = 'italic 14px Arial';
    ctx.textAlign = 'left';
    
    const textLines = [
        'po,',
        '',
        'No es por ninguna fecha',
        'ni por nada en especial.',
        '',
        'Solo quería que, cuando',
        'leas esto, te acuerdes de que',
        'sos hermosa y de que tenés',
        'una sonrisa que me desarma.',
        '',
        'Gracias por hacer mejor',
        'cualquier día común.',
        '',
        'Tkm,',
        'Nahu 💛'
    ];
    
    let lineY = y + 280;
    textLines.forEach((line, i) => {
        if (line !== '') {
            ctx.fillText(line, x + 25, lineY);
        }
        lineY += 16;
    });
}

function drawSnoopyBig(x, y) {
    // Cuerpo
    ctx.fillStyle = COLORS.SNOOPY_WHITE;
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 35, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Cabeza
    ctx.beginPath();
    ctx.ellipse(x, y - 35, 32, 38, 0, 0, Math.PI * 2);
    ctx.fill();
    
    // Orejas
    ctx.fillStyle = COLORS.SNOOPY_BLACK;
    ctx.fillRect(x - 22, y - 70, 14, 20);
    ctx.fillRect(x + 8, y - 70, 14, 20);
    
    // Ojos
    ctx.fillStyle = COLORS.SNOOPY_BLACK;
    ctx.beginPath();
    ctx.arc(x - 10, y - 35, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 8, y - 35, 3, 0, Math.PI * 2);
    ctx.fill();
    
    // Nariz
    ctx.beginPath();
    ctx.arc(x, y - 20, 4, 0, Math.PI * 2);
    ctx.fill();
    
    // Sonrisa
    ctx.strokeStyle = COLORS.SNOOPY_BLACK;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - 10, 6, 0, Math.PI);
    ctx.stroke();
    
    // Patitas
    ctx.fillStyle = COLORS.SNOOPY_BLACK;
    ctx.fillRect(x - 22, y + 35, 8, 16);
    ctx.fillRect(x - 8, y + 35, 8, 16);
    ctx.fillRect(x + 6, y + 35, 8, 16);
    ctx.fillRect(x + 20, y + 35, 8, 16);
    
    // Cola
    ctx.strokeStyle = COLORS.SNOOPY_BLACK;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(x + 35, y + 5, 12, Math.PI, Math.PI * 1.5);
    ctx.stroke();
}

function drawConfetti() {
    // Dibuja confeti aleatorio
    animationFrame++;
    for (let i = 0; i < 50; i++) {
        const x = (Math.sin(animationFrame / 10 + i) * 200 + GAME_WIDTH / 2);
        const y = ((animationFrame * 2 + i * 50) % GAME_HEIGHT);
        
        ctx.fillStyle = `hsla(${(i * 7) % 360}, 100%, 50%, 0.8)`;
        ctx.fillRect(x, y, 10, 10);
    }
}

// Función para guardar en memoria el progreso
function saveToMemory() {
    if (typeof memory_append !== 'undefined') {
        // Opcionalmente guardar datos en memoria
    }
}
