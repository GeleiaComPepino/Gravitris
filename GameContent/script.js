const canvas = document.getElementById('game-board');
const context = canvas.getContext('2d');
const holdCanvas = document.getElementById('hold-canvas');
const holdContext = holdCanvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextContext = nextCanvas.getContext('2d');

const scoreElement = document.getElementById('score');
const linesElement = document.getElementById('lines');
const levelElement = document.getElementById('level');

const mainMenu = document.getElementById('mainMenu');
const playButton = document.getElementById('play-button');
const restartButton = document.getElementById('restartButton');
const gameOverModal = document.getElementById('gameOverModal');
const gameContainer = document.querySelector('.game-container');

const COLS = 10;
const ROWS = 20;
const BLOCK_SIZE = 30;
const HIDDEN_ROWS = 4;
const TOTAL_ROWS = ROWS + HIDDEN_ROWS;

canvas.width = COLS * BLOCK_SIZE;
canvas.height = ROWS * BLOCK_SIZE;

// Set canvas dimensions for HUD panels to prevent stretching
holdCanvas.width = 120;
holdCanvas.height = 120;
nextCanvas.width = 160;
nextCanvas.height = 400;

let soundsEnabled = false;
const createSynths = (volume) => ({
    lock: new Tone.MetalSynth({ frequency: 50, envelope: { attack: 0.001, decay: 0.1, release: 0.05 }, harmonicity: 3.1, modulationIndex: 16, resonance: 2000, octaves: 0.5, volume }).toDestination(),
    lineClear: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.3, sustain: 0.1, release: 0.2 }, volume }).toDestination(),
    uiHover: new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.1 }, volume: volume + 5 }).toDestination(),
    uiClick: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1 }, volume: volume + 5 }).toDestination(),
    ...(volume === 0 && {
            move: new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.1 } }).toDestination(),
            rotate: new Tone.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.05, sustain: 0, release: 0.1 } }).toDestination(),
            softDrop: new Tone.MembraneSynth({ pitchDecay: 0.01, octaves: 2, envelope: { attack: 0.001, decay: 0.1, sustain: 0 } }).toDestination(),
            hardDrop: new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 10, envelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.4 } }).toDestination(),
            gameOver: new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.1, decay: 1, sustain: 0.2, release: 1 } }).toDestination(),
            blockFall: new Tone.MembraneSynth({ pitchDecay: 0.008, octaves: 1, envelope: { attack: 0.001, decay: 0.05, sustain: 0 } }).toDestination(),
    })
});

const mainSynths = createSynths(0);
const menuSynths = createSynths(-12);

function playSound(sound, note, time, isMenu = false) {
    if (!soundsEnabled) return;
    const synthPack = isMenu ? menuSynths : mainSynths;
    if (synthPack[sound]) {
        try {
            synthPack[sound].triggerAttackRelease(note, '8n', time);
        } catch(e) { console.error(`Sound ${sound} failed`, e); }
    }
}

const COLORS = {
    1: { main: '#00f0f0', light: '#a0ffff', dark: '#00a0a0' },
    2: { main: '#f0f000', light: '#ffffa0', dark: '#a0a000' },
    3: { main: '#a000f0', light: '#e0a0ff', dark: '#6000a0' },
    4: { main: '#00f000', light: '#a0ffa0', dark: '#00a000' },
    5: { main: '#f00000', light: '#ffa0a0', dark: '#a00000' },
    6: { main: '#0000f0', light: '#a0a0ff', dark: '#0000a0' },
    7: { main: '#f0a000', light: '#ffc8a0', dark: '#a06000' }
};
const SHAPES = [
    [], [[1, 1, 1, 1]], [[2, 2], [2, 2]], [[0, 3, 0], [3, 3, 3]],
    [[0, 4, 4], [4, 4, 0]], [[5, 5, 0], [0, 5, 5]], [[6, 0, 0], [6, 6, 6]], [[0, 0, 7], [7, 7, 7]]
];

let grid, currentPiece, nextPieces, heldPiece, canHold, score, lines, level, dropCounter, dropInterval, gameOver, animationFrameId, lastTime;
let gameStarted = false;

const keys = {};
let dasTimers = {};
const DAS_DELAY = 160;
const ARR_RATE = 50;
let effects = [];

class Piece {
    constructor(shape, type) {
        this.shape = shape;
        this.type = type || this.shape.flat().find(v => v > 0);
        this.color = COLORS[this.type];
        this.x = Math.floor(COLS / 2) - Math.floor(this.shape[0].length / 2);
        this.y = 0;
    }

    draw(ctx, options = {}) {
        const { offsetX = 0, offsetY = 0, blockSize = BLOCK_SIZE, alpha = 1.0 } = options;
        ctx.globalAlpha = alpha;
        this.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value > 0) {
                    const drawX = (this.x + x + offsetX) * blockSize;
                    const drawY = (this.y + y + offsetY) * blockSize;
                    const colorSet = COLORS[value];
                    
                    ctx.fillStyle = colorSet.dark;
                    ctx.fillRect(drawX, drawY, blockSize, blockSize);
                    
                    ctx.fillStyle = colorSet.light;
                    ctx.fillRect(drawX + 1, drawY + 1, blockSize - 2, blockSize - 2);

                    ctx.fillStyle = colorSet.main;
                    ctx.fillRect(drawX + 3, drawY + 3, blockSize - 6, blockSize - 6);
                }
            });
        });
        ctx.globalAlpha = 1.0;
    }
}

function init() {
    grid = Array.from({ length: TOTAL_ROWS }, () => Array(COLS).fill(0));
    nextPieces = Array.from({ length: 5 }, () => generateRandomPiece());
    heldPiece = null;
    canHold = true;
    score = 0; lines = 0; level = 1; gameOver = false;
    spawnNewPiece();
    updateStats();
    dropCounter = 0; dropInterval = 1000; lastTime = 0;
    gameOverModal.style.display = 'none';
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    gameLoop();
}

function startGame() {
    mainMenu.style.display = 'none';
    if(menuAnimationId) cancelAnimationFrame(menuAnimationId);
    document.getElementById('menuCanvas').style.display = 'none';
    gameContainer.style.display = 'flex';
    gameStarted = true;
    init();
}

function returnToMenu() {
    if(animationFrameId) cancelAnimationFrame(animationFrameId);
    
    gameStarted = false;
    gameOver = false;
    
    gameContainer.style.display = 'none';
    gameOverModal.style.display = 'none';
    mainMenu.style.display = 'flex';
    document.getElementById('menuCanvas').style.display = 'block';

    Object.values(dasTimers).forEach(timer => {
        clearTimeout(timer);
        clearInterval(timer);
    });
    dasTimers = {};

    if (menuAnimationId) cancelAnimationFrame(menuAnimationId);
    setupMenuCanvas();
    animateMenu();
}

function gameLoop(currentTime = 0) {
    if (gameOver || !gameStarted) {
        if (gameOver) showGameOver();
        return;
    }
    if (!lastTime) lastTime = currentTime;
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    dropCounter += deltaTime;
    if (dropCounter > dropInterval) dropPiece();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop);
}

function spawnNewPiece() {
    currentPiece = nextPieces.shift();
    nextPieces.push(generateRandomPiece());
    canHold = true;
    if (!isValidMove(currentPiece, currentPiece.x, currentPiece.y)) {
        gameOver = true;
    }
}
function generateRandomPiece() {
    const type = Math.floor(Math.random() * 7) + 1;
    return new Piece(JSON.parse(JSON.stringify(SHAPES[type])), type);
}
function movePiece(dx, dy) {
    if (!currentPiece) return false;
    if (isValidMove(currentPiece, currentPiece.x + dx, currentPiece.y + dy)) {
        currentPiece.x += dx;
        currentPiece.y += dy;
        if (dy === 0) playSound('move', 'C2');
        return true;
    }
    return false;
}
function handleRotate(direction) {
    if (!currentPiece) return;
    const originalShape = currentPiece.shape;
    const transposed = originalShape[0].map((_, i) => originalShape.map(row => row[i]));
    if (direction > 0) transposed.forEach(row => row.reverse());
    else transposed.reverse();
    
    const testPiece = { ...currentPiece, shape: transposed };
    if (isValidMove(testPiece, testPiece.x, testPiece.y)) {
        currentPiece.shape = transposed;
        playSound('rotate', 'G4');
    } else {
        const kicks = [-1, 1, -2, 2];
        for (const kick of kicks) {
            if (isValidMove(testPiece, testPiece.x + kick, testPiece.y)) {
                currentPiece.x += kick;
                currentPiece.shape = transposed;
                playSound('rotate', 'G4');
                return;
            }
        }
    }
}
function isValidMove(piece, newX, newY) {
    return piece.shape.every((row, y) => {
        return row.every((value, x) => {
            if (value === 0) return true;
            const boardX = newX + x;
            const boardY = newY + y;
            return boardX >= 0 && boardX < COLS && boardY < TOTAL_ROWS && (!grid[boardY] || grid[boardY][boardX] === 0);
        });
    });
}

function dropPiece() {
    if (!movePiece(0, 1)) {
        lockPiece();
    }
    dropCounter = 0;
}
async function lockPiece() {
    if (!currentPiece) return;
    currentPiece.shape.forEach((row, y) => {
        row.forEach((value, x) => {
            if (value > 0) {
                const boardY = currentPiece.y + y;
                if (boardY >= 0 && boardY < TOTAL_ROWS) grid[boardY][currentPiece.x + x] = currentPiece.type;
            }
        });
    });
    playSound('lock', 'C2');
    currentPiece = null;
    await applyGravityAndClearLines();
    if (!gameOver) {
        spawnNewPiece();
        updateLevel();
    }
}
async function applyGravityAndClearLines() {
    while (true) {
        const blocksFell = await applyGravityToAllBlocks();
        if (blocksFell) {
            await new Promise(res => setTimeout(res, 50));
            draw();
        }
        const clearedCount = clearLines();
        if (clearedCount > 0) {
            lines += clearedCount;
            updateScore(clearedCount);
            await new Promise(res => setTimeout(res, 150));
            draw();
        }
        if (!blocksFell && clearedCount === 0) break;
    }
}
async function applyGravityToAllBlocks() {
    let fell = false;
    for (let y = TOTAL_ROWS - 2; y >= 0; y--) {
        for (let x = 0; x < COLS; x++) {
            if (grid[y][x] > 0 && grid[y + 1][x] === 0) {
                grid[y + 1][x] = grid[y][x];
                grid[y][x] = 0;
                fell = true;
            }
        }
    }
    if (fell) playSound('blockFall', 'C1');
    return fell;
}
function clearLines() {
    let clearedLinesCount = 0;
    for (let y = TOTAL_ROWS - 1; y >= 0; y--) {
        if (grid[y].every(value => value > 0)) {
            clearedLinesCount++;
            grid.splice(y, 1);
            grid.unshift(Array(COLS).fill(0));
            y++;
        }
    }
    if (clearedLinesCount > 0) {
        playSound('lineClear', 'C5');
        if(clearedLinesCount === 4) playSound('lineClear', 'G5', Tone.now() + 0.1);
    }
    return clearedLinesCount;
}
function hardDrop() {
    if (!currentPiece) return;
    const ghostY = getGhostPieceY();
    effects.push({
        type: 'flash', x: currentPiece.x, y: ghostY,
        shape: currentPiece.shape, color: currentPiece.color.main,
        life: 1.0, decay: 0.08
    });
    currentPiece.y = ghostY;
    playSound('hardDrop', 'C3');
    lockPiece();
}
function holdPieceAction() {
    if (!canHold || !currentPiece) return;
    playSound('rotate', 'C4');
    const heldType = currentPiece.type;
    if (heldPiece) {
        currentPiece = new Piece(heldPiece.shape, heldPiece.type);
        heldPiece = new Piece(SHAPES[heldType], heldType);
    } else {
        heldPiece = new Piece(currentPiece.shape, heldType);
        spawnNewPiece();
    }
    canHold = false;
}

function draw() {
    context.clearRect(0, 0, canvas.width, canvas.height);
    drawGridLines();
    drawBoard();
    drawGhostPiece();
    if (currentPiece) currentPiece.draw(context, { offsetY: -HIDDEN_ROWS });
    drawEffects();
    drawPanels();
}
function drawGridLines() {
    context.strokeStyle = 'rgba(252, 163, 17, 0.1)';
    for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) {
        context.strokeRect(c * BLOCK_SIZE, r * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    }
}
function drawBoard() {
    for (let y = HIDDEN_ROWS; y < TOTAL_ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            if (grid[y][x] > 0) {
                const type = grid[y][x];
                const tempPiece = new Piece([ [type] ], type);
                tempPiece.x = x;
                tempPiece.y = y;
                tempPiece.draw(context, { offsetY: -HIDDEN_ROWS });
            }
        }
    }
}
function getGhostPieceY() {
    if (!currentPiece) return 0;
    let y = currentPiece.y;
    while (isValidMove(currentPiece, currentPiece.x, y + 1)) y++;
    return y;
}
function drawGhostPiece() {
    if (!currentPiece) return;
    const ghost = new Piece(currentPiece.shape, currentPiece.type);
    ghost.x = currentPiece.x;
    ghost.y = getGhostPieceY();
    ghost.draw(context, { offsetY: -HIDDEN_ROWS, alpha: 0.3 });
}
function drawEffects() {
    for (let i = effects.length - 1; i >= 0; i--) {
        const effect = effects[i];
        if (effect.type === 'flash') {
            context.globalAlpha = effect.life;
            effect.shape.forEach((row, y) => {
                row.forEach((value, x) => {
                    if (value > 0) {
                        const colorSet = COLORS[value];
                        context.fillStyle = colorSet.light;
                        context.fillRect((effect.x + x) * BLOCK_SIZE, (effect.y + y - HIDDEN_ROWS) * BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
                    }
                });
            });
            effect.life -= effect.decay;
            if (effect.life <= 0) effects.splice(i, 1);
        }
    }
    context.globalAlpha = 1.0;
}
function drawPanels() {
    const drawPieceInPanel = (ctx, piece) => {
        if (!piece) return;
        const bSize = 20;
        const w = piece.shape[0].length * bSize;
        const h = piece.shape.length * bSize;
        const tempPiece = new Piece(piece.shape, piece.type);
        tempPiece.x = 0; tempPiece.y = 0;
        const offsetX = (ctx.canvas.width - w) / 2 / bSize;
        const offsetY = (ctx.canvas.height - h) / 2 / bSize;
        tempPiece.draw(ctx, { offsetX, offsetY, blockSize: bSize });
    };

    holdContext.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
    drawPieceInPanel(holdContext, heldPiece);
    
    nextContext.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
    nextPieces.forEach((p, i) => {
        if (!p) return;
        const bSize = 20;
        const w = p.shape[0].length * bSize;
        const h = p.shape.length * bSize;
        const tempPiece = new Piece(p.shape, p.type);
        tempPiece.x = 0; tempPiece.y = 0;
        const yOffsetPanel = i * (4.5 * bSize);
        const offsetX = (nextCanvas.width - w) / 2 / bSize;
        const offsetY = (yOffsetPanel / bSize) + 2;
        tempPiece.draw(nextContext, { offsetX, offsetY, blockSize: bSize });
    });
}

document.addEventListener('keydown', e => {
    if (e.code === 'Escape' && gameStarted) {
        returnToMenu();
        return;
    }

    if (!gameStarted || gameOver) return;
    
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (keys[e.code]) return; 
        keys[e.code] = true;

        movePiece(e.code === 'ArrowLeft' ? -1 : 1, 0);

        dasTimers[e.code] = setTimeout(() => {
            dasTimers[e.code] = setInterval(() => {
                movePiece(e.code === 'ArrowLeft' ? -1 : 1, 0);
            }, ARR_RATE);
        }, DAS_DELAY);
        return;
    }

    if (keys[e.code]) return;
    keys[e.code] = true;

    switch (e.code) {
        case 'ArrowDown': dropPiece(); playSound('softDrop', 'C1'); break;
        case 'ArrowUp': case 'KeyX': handleRotate(1); break;
        case 'KeyZ': case 'ShiftLeft': case 'ShiftRight': e.preventDefault(); handleRotate(-1); break;
        case 'Space': hardDrop(); break;
        case 'KeyC': holdPieceAction(); break;
    }
});

document.addEventListener('keyup', e => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        if (dasTimers[e.code]) {
            clearTimeout(dasTimers[e.code]);
            clearInterval(dasTimers[e.code]);
            dasTimers[e.code] = null;
        }
    }
    keys[e.code] = false;
});

function updateStats() {
    scoreElement.textContent = score;
    linesElement.textContent = lines;
    levelElement.textContent = level;
}
function updateScore(clearedCount) {
    score += clearedCount * 10;
    updateStats();
}
function updateLevel() {
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 50);
    updateStats();
}
function showGameOver() {
    if (!gameOver) return;
    playSound('gameOver', 'C3');
    document.getElementById('finalScore').textContent = `Sua pontuação: ${score}`;
    gameOverModal.style.display = 'flex';
    cancelAnimationFrame(animationFrameId);
}

async function initAudio() {
    if (soundsEnabled) return;
    try {
        await Tone.start();
        soundsEnabled = true;
        console.log('Audio context started successfully.');
    } catch (e) {
        console.error("Could not start audio context:", e);
    }
}

playButton.addEventListener('click', async () => {
    await initAudio();
    playSound('uiClick', 'C4');
    startGame();
});

restartButton.addEventListener('click', async () => {
    await initAudio();
    playSound('uiClick', 'C4');
    gameOverModal.style.display = 'none';
    init();
});

[playButton, restartButton].forEach(button => {
    button.addEventListener('mouseenter', () => initAudio().then(() => playSound('uiHover', 'C5')));
});


const menuCanvas = document.getElementById('menuCanvas');
const menuCtx = menuCanvas.getContext('2d');
let menuAnimationId;
let menuGrid, menuCurrentPiece, menuBlockSize, menuCols, menuRows;
let menuDropCounter = 0;
const MENU_BOT_SPEED = 100;
let lastMenuTime = 0;

function setupMenuCanvas() {
    menuCanvas.width = window.innerWidth;
    menuCanvas.height = window.innerHeight;
    menuBlockSize = 20;
    menuCols = Math.ceil(menuCanvas.width / menuBlockSize);
    menuRows = Math.ceil(menuCanvas.height / menuBlockSize);
    menuGrid = Array.from({ length: menuRows }, () => Array(menuCols).fill(0));
    menuCurrentPiece = generateRandomMenuPiece(menuCols);
}

function generateRandomMenuPiece(cols) {
    const type = Math.floor(Math.random() * 7) + 1;
    const piece = new Piece(JSON.parse(JSON.stringify(SHAPES[type])), type);
    piece.x = Math.floor(Math.random() * (cols - piece.shape[0].length));
    piece.y = 0;
    return piece;
}

function isMenuMoveValid(piece, grid, newX, newY) {
        return piece.shape.every((row, y) => {
        return row.every((value, x) => {
            if (value === 0) return true;
            const boardX = newX + x;
            const boardY = newY + y;
            return boardX >= 0 && boardX < menuCols && boardY < menuRows && (!grid[boardY] || grid[boardY][boardX] === 0);
        });
    });
}

function findBestMove() {
    let bestMove = { score: -Infinity, x: -1, y: -1, piece: null };
    const originalPiece = menuCurrentPiece;

    for (let r = 0; r < 4; r++) {
        let currentRotationPiece = new Piece(originalPiece.shape, originalPiece.type);
        
        for(let i = 0; i < r; i++) {
                const shape = currentRotationPiece.shape;
                const transposed = shape[0].map((_, c) => shape.map(r => r[c]));
                transposed.forEach(row => row.reverse());
                currentRotationPiece.shape = transposed;
        }

        for (let c = -2; c < menuCols; c++) {
            const testPiece = new Piece(currentRotationPiece.shape, currentRotationPiece.type);
            testPiece.x = c;
            testPiece.y = 0;

            if (!isMenuMoveValid(testPiece, menuGrid, testPiece.x, testPiece.y)) continue;
            
            let y = 0;
            while(isMenuMoveValid(testPiece, menuGrid, testPiece.x, y + 1)) {
                y++;
            }
            testPiece.y = y;

            const tempGrid = menuGrid.map(row => [...row]);
            testPiece.shape.forEach((row, ry) => {
                row.forEach((val, rx) => {
                    if (val > 0) {
                        if (testPiece.y + ry < menuRows) {
                            tempGrid[testPiece.y + ry][testPiece.x + rx] = testPiece.type;
                        }
                    }
                });
            });
            
            const score = scoreMenuPlacement(tempGrid);
            if (score > bestMove.score) {
                bestMove = { score, x: testPiece.x, y: testPiece.y, piece: testPiece };
            }
        }
    }
    return bestMove;
}

function scoreMenuPlacement(grid) {
    let score = 0;
    let heights = Array(menuCols).fill(0);
    let holes = 0;
    let completedLines = 0;

    for (let r = 0; r < menuRows; r++) {
        let isLineFull = true;
        for (let c = 0; c < menuCols; c++) {
            if (grid[r][c] > 0) {
                if (heights[c] === 0) heights[c] = menuRows - r;
            } else {
                isLineFull = false;
                for(let k = r - 1; k >= 0; k--) {
                    if(grid[k][c] > 0) {
                        holes++;
                        break;
                    }
                }
            }
        }
        if (isLineFull) completedLines++;
    }

    const aggregateHeight = heights.reduce((a, b) => a + b, 0);
    let bumpiness = 0;
    for (let i = 0; i < heights.length - 1; i++) {
        bumpiness += Math.abs(heights[i] - heights[i+1]);
    }
    
    score += completedLines * 50;
    score -= aggregateHeight * 0.5;
    score -= holes * 10;
    score -= bumpiness * 0.2;

    return score;
}

function menuBotAction() {
    const bestMove = findBestMove();

    if (bestMove.piece) {
        menuCurrentPiece = bestMove.piece;
        
        menuCurrentPiece.shape.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value > 0) {
                    const gridY = menuCurrentPiece.y + y;
                    const gridX = menuCurrentPiece.x + x;
                    if(gridY >= 0 && gridY < menuRows && gridX >= 0 && gridX < menuCols) {
                        menuGrid[gridY][gridX] = menuCurrentPiece.type;
                    }
                }
            });
        });
        playSound('lock', 'C1', Tone.now(), true);

        let clearedCount = 0;
        for (let y = menuRows - 1; y >= 0; y--) {
            if (menuGrid[y].every(value => value > 0)) {
                clearedCount++;
                menuGrid.splice(y, 1);
                menuGrid.unshift(Array(menuCols).fill(0));
                y++; 
            }
        }
        if (clearedCount > 0) {
            playSound('lineClear', 'C4', Tone.now(), true);
        }
    }
    menuCurrentPiece = generateRandomMenuPiece(menuCols);
}

function animateMenu(currentTime = 0) {
    if (gameStarted) {
        return;
    }
    menuAnimationId = requestAnimationFrame(animateMenu);

    if (!lastMenuTime) lastMenuTime = currentTime;
    const deltaTime = currentTime - lastMenuTime;
    lastMenuTime = currentTime;
    
    menuDropCounter += deltaTime;

    if (menuDropCounter > MENU_BOT_SPEED) {
        menuBotAction();
        menuDropCounter = 0;
    }
    
    menuCtx.clearRect(0, 0, menuCanvas.width, menuCanvas.height);
    
    for(let r=0; r < menuRows; r++) {
        for(let c=0; c < menuCols; c++) {
            if (menuGrid[r][c] > 0) {
                const colorSet = COLORS[menuGrid[r][c]];
                menuCtx.fillStyle = colorSet.main;
                menuCtx.fillRect(c * menuBlockSize, r * menuBlockSize, menuBlockSize, menuBlockSize-1);
            }
        }
    }

    if(menuCurrentPiece){
        const bestMove = findBestMove();
        if (bestMove.piece) {
            bestMove.piece.draw(menuCtx, { blockSize: menuBlockSize, alpha: 0.3 });
        }
        menuCurrentPiece.draw(menuCtx, { blockSize: menuBlockSize });
    }
}

setupMenuCanvas();
animateMenu();