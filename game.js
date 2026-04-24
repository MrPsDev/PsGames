// ── Constants ──────────────────────────────────────────────
const COLS  = 10;
const ROWS  = 20;
const BLOCK = 20;

const COLORS = [
  '#5DCAA5', // teal
  '#378ADD', // blue
  '#E24B4A', // red
  '#EF9F27', // amber
  '#7F77DD', // purple
  '#D4537E', // pink
  '#97C459'  // green
];

const SHAPES = [
  [[1,1,1,1]],           // I
  [[1,1],[1,1]],         // O
  [[0,1,0],[1,1,1]],     // T
  [[1,0,0],[1,1,1]],     // J
  [[0,0,1],[1,1,1]],     // L
  [[1,1,0],[0,1,1]],     // S
  [[0,1,1],[1,1,0]]      // Z
];

// ── DOM refs ────────────────────────────────────────────────
const canvas     = document.getElementById('board');
const ctx        = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nctx       = nextCanvas.getContext('2d');

// ── State ───────────────────────────────────────────────────
let board, piece, next, score, lines, volume, gameLoop, running;
let audioCtx = null;

// ── Audio ───────────────────────────────────────────────────
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}

function playLineClear(vol) {
  try {
    initAudio();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const freq = 220 + vol * 30;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 2, audioCtx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) { /* silence audio errors */ }
}

function playMove() {
  try {
    initAudio();
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.frequency.value = 300;
    gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.05);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  } catch (e) {}
}

// ── Board helpers ────────────────────────────────────────────
function newBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function randomPiece() {
  const i     = Math.floor(Math.random() * SHAPES.length);
  const shape = SHAPES[i];
  return {
    shape,
    color: COLORS[i],
    x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2),
    y: 0
  };
}

function rotate(shape) {
  return shape[0].map((_, c) => shape.map(r => r[c]).reverse());
}

function valid(b, p, ox = 0, oy = 0, ns = null) {
  const sh = ns || p.shape;
  for (let r = 0; r < sh.length; r++) {
    for (let c = 0; c < sh[r].length; c++) {
      if (!sh[r][c]) continue;
      const nx = p.x + c + ox;
      const ny = p.y + r + oy;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false;
      if (ny >= 0 && b[ny][nx]) return false;
    }
  }
  return true;
}

function place(b, p) {
  p.shape.forEach((row, ri) =>
    row.forEach((v, ci) => {
      if (v && p.y + ri >= 0) b[p.y + ri][p.x + ci] = p.color;
    })
  );
}

function clearLines(b) {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (b[r].every(c => c)) {
      b.splice(r, 1);
      b.unshift(Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return cleared;
}

// ── Drawing ──────────────────────────────────────────────────
function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth   = 0.5;
  for (let r = 0; r < ROWS; r++) {
    ctx.beginPath(); ctx.moveTo(0, r * BLOCK); ctx.lineTo(COLS * BLOCK, r * BLOCK); ctx.stroke();
  }
  for (let c = 0; c < COLS; c++) {
    ctx.beginPath(); ctx.moveTo(c * BLOCK, 0); ctx.lineTo(c * BLOCK, ROWS * BLOCK); ctx.stroke();
  }

  // placed blocks
  board.forEach((row, r) =>
    row.forEach((col, c) => {
      if (col) {
        ctx.fillStyle = col;
        ctx.fillRect(c * BLOCK + 0.5, r * BLOCK + 0.5, BLOCK - 1, BLOCK - 1);
      }
    })
  );

  if (!piece) return;

  // ghost piece
  let ghostY = piece.y;
  while (valid(board, piece, 0, ghostY - piece.y + 1)) ghostY++;
  piece.shape.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) {
        ctx.fillStyle = piece.color + '33';
        ctx.fillRect((piece.x + c) * BLOCK + 0.5, (ghostY + r) * BLOCK + 0.5, BLOCK - 1, BLOCK - 1);
      }
    })
  );

  // active piece
  piece.shape.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) {
        ctx.fillStyle = piece.color;
        ctx.fillRect((piece.x + c) * BLOCK + 0.5, (piece.y + r) * BLOCK + 0.5, BLOCK - 1, BLOCK - 1);
      }
    })
  );
}

function drawNext() {
  nctx.clearRect(0, 0, 80, 80);
  if (!next) return;
  const bs = 14;
  const ox = Math.floor((80 - next.shape[0].length * bs) / 2);
  const oy = Math.floor((80 - next.shape.length * bs) / 2);
  next.shape.forEach((row, r) =>
    row.forEach((v, c) => {
      if (v) {
        nctx.fillStyle = next.color;
        nctx.fillRect(ox + c * bs, oy + r * bs, bs - 1, bs - 1);
      }
    })
  );
}

// ── UI update ────────────────────────────────────────────────
function updateUI() {
  document.getElementById('vol-num').textContent  = volume;
  document.getElementById('lines-val').textContent = lines;
  document.getElementById('score-val').textContent = score;

  const pct = Math.min(volume * 5, 100);
  const bar = document.getElementById('vol-bar');
  bar.style.height = pct + '%';
  bar.style.background =
    volume >= 15 ? '#E24B4A' :
    volume >= 10 ? '#EF9F27' :
    '#1D9E75';
}

function setMsg(text, clearAfter = 0) {
  document.getElementById('msg').textContent = text;
  if (clearAfter > 0) {
    setTimeout(() => {
      if (running) document.getElementById('msg').textContent = '';
    }, clearAfter);
  }
}

// ── Game loop ────────────────────────────────────────────────
function tick() {
  if (!piece) return;

  if (valid(board, piece, 0, 1)) {
    piece.y++;
  } else {
    place(board, piece);
    const cleared = clearLines(board);

    if (cleared > 0) {
      lines   += cleared;
      volume  += cleared;
      score   += cleared * 100 * cleared;
      playLineClear(volume);
      updateUI();

      if (volume >= 20) {
        setMsg('MAX VOLUME! ' + volume);
      } else {
        setMsg(`+${cleared} line${cleared > 1 ? 's' : ''}!  Volume → ${volume}`, 1200);
      }
    }

    piece = next;
    next  = randomPiece();
    drawNext();

    // game over check
    if (!valid(board, piece, 0, 0)) {
      running = false;
      clearInterval(gameLoop);
      setMsg('Game over!  Final volume: ' + volume);
      document.getElementById('start-btn').textContent = 'Restart';
      return;
    }
  }

  drawBoard();
}

// ── Start / restart ──────────────────────────────────────────
function startGame() {
  initAudio();
  board   = newBoard();
  score   = 0;
  lines   = 0;
  volume  = 0;
  piece   = randomPiece();
  next    = randomPiece();
  running = true;

  if (gameLoop) clearInterval(gameLoop);
  gameLoop = setInterval(tick, 500);

  setMsg('');
  document.getElementById('start-btn').textContent = 'Restart';
  updateUI();
  drawNext();
  drawBoard();
}

document.getElementById('start-btn').addEventListener('click', startGame);

// ── Keyboard controls ────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!running || !piece) return;

  switch (e.key) {
    case 'ArrowLeft':
    case 'a':
    case 'A':
      if (valid(board, piece, -1, 0)) { piece.x--; playMove(); drawBoard(); }
      e.preventDefault(); break;

    case 'ArrowRight':
    case 'd':
    case 'D':
      if (valid(board, piece, 1, 0)) { piece.x++; playMove(); drawBoard(); }
      e.preventDefault(); break;

    case 'ArrowDown':
    case 's':
    case 'S':
      if (valid(board, piece, 0, 1)) { piece.y++; score++; updateUI(); drawBoard(); }
      e.preventDefault(); break;

    case 'ArrowUp':
    case 'w':
    case 'W': {
      const r = rotate(piece.shape);
      if (valid(board, piece, 0, 0, r)) { piece.shape = r; playMove(); drawBoard(); }
      e.preventDefault(); break;
    }

    case ' ':
      while (valid(board, piece, 0, 1)) { piece.y++; score += 2; }
      tick();
      updateUI();
      e.preventDefault(); break;
  }
});