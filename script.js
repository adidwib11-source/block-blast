(function () {
  'use strict';

  const BOARD_SIZE = 8;
  const MAX_ENERGY = 100;
  const DAILY_TARGET = 1200;
  const MAX_PARTICLES = 320;

  const LS_BEST = 'neongrid.best';
  const LS_SOUND = 'neongrid.sound';
  const LS_DAILY = 'neongrid.daily';

  const COLORS = ['cyan', 'violet', 'pink', 'blue', 'green', 'amber'];

  const COLOR_HEX = {
    cyan: '#22d3ee',
    violet: '#a855f7',
    pink: '#ec4899',
    blue: '#3b82f6',
    green: '#34d399',
    amber: '#fbbf24'
  };

  const SHAPE_DEFS = [
    { id: 'dot',  weight: 3, cells: [[0, 0]] },
    { id: 'h2',   weight: 9, cells: [[0, 0], [0, 1]] },
    { id: 'v2',   weight: 9, cells: [[0, 0], [1, 0]] },
    { id: 'h3',   weight: 7, cells: [[0, 0], [0, 1], [0, 2]] },
    { id: 'v3',   weight: 7, cells: [[0, 0], [1, 0], [2, 0]] },
    { id: 'h4',   weight: 4, cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
    { id: 'v4',   weight: 4, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { id: 'h5',   weight: 2, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
    { id: 'v5',   weight: 2, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    { id: 'sq2',  weight: 8, cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { id: 'sq3',  weight: 1, cells: [
      [0, 0], [0, 1], [0, 2],
      [1, 0], [1, 1], [1, 2],
      [2, 0], [2, 1], [2, 2]
    ] },
    { id: 'cnr1', weight: 8, cells: [[0, 0], [1, 0], [1, 1]] },
    { id: 'cnr2', weight: 8, cells: [[0, 0], [0, 1], [1, 0]] },
    { id: 'cnr3', weight: 8, cells: [[0, 0], [0, 1], [1, 1]] },
    { id: 'cnr4', weight: 8, cells: [[0, 1], [1, 0], [1, 1]] },
    { id: 'bigL1', weight: 3, cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { id: 'bigL2', weight: 3, cells: [[0, 0], [0, 1], [0, 2], [1, 0]] },
    { id: 'bigL3', weight: 3, cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
    { id: 'bigL4', weight: 3, cells: [[0, 2], [1, 0], [1, 1], [1, 2]] },
    { id: 't1',   weight: 3, cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { id: 't2',   weight: 3, cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
    { id: 't3',   weight: 3, cells: [[0, 0], [1, 0], [1, 1], [2, 0]] },
    { id: 't4',   weight: 3, cells: [[0, 1], [1, 0], [1, 1], [2, 1]] },
    { id: 's1',   weight: 3, cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
    { id: 's2',   weight: 3, cells: [[0, 0], [0, 1], [1, 1], [1, 2]] }
  ];

  function $(id) { return document.getElementById(id); }
  function fmt(n) { return Math.round(n).toLocaleString('id-ID'); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function lsGet(key, fallback) {
    try {
      const v = window.localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }

  function lsSet(key, value) {
    try { window.localStorage.setItem(key, String(value)); } catch (e) {}
  }

  function normalizeShape(cells) {
    let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
    for (let i = 0; i < cells.length; i++) {
      const r = cells[i][0], c = cells[i][1];
      if (r < minR) minR = r;
      if (c < minC) minC = c;
      if (r > maxR) maxR = r;
      if (c > maxC) maxC = c;
    }
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      out.push([cells[i][0] - minR, cells[i][1] - minC]);
    }
    return { cells: out, w: maxC - minC + 1, h: maxR - minR + 1 };
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function dailySeed() {
    const d = new Date();
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }

  const SHAPES = SHAPE_DEFS.map(function (def) {
    const n = normalizeShape(def.cells);
    return { id: def.id, weight: def.weight, cells: n.cells, w: n.w, h: n.h };
  });

  const TOTAL_WEIGHT = SHAPES.reduce(function (s, sh) { return s + sh.weight; }, 0);

  let board = [];
  let cellEls = [];
  let tray = [];

  let score = 0;
  let displayedScore = 0;
  let best = 0;
  let combo = 0;
  let energy = 0;

  let selectedIndex = -1;
  let gameOver = false;
  let busy = false;
  let energyMode = false;

  let undoSnapshot = null;
  let undoUsed = false;

  let soundOn = true;
  let mode = 'classic';
  let dailyCleared = false;
  let rng = Math.random;

  let scoreAnimRaf = null;
  let toastTimer = null;

  const boardEl = $('board');
  const trayEl = $('tray');
  const ghostEl = $('dragGhost');
  const toastEl = $('comboToast');

  const scoreValueEl = $('scoreValue');
  const bestValueEl = $('bestValue');
  const comboValueEl = $('comboValue');
  const comboBarFillEl = $('comboBarFill');

  const energyFillEl = $('energyFill');
  const energyPctEl = $('energyPct');
  const energyBtn = $('energyBtn');
  const undoBtn = $('undoBtn');
  const restartBtn = $('restartBtn');

  const soundBtn = $('soundBtn');
  const settingsBtn = $('settingsBtn');
  const modeChipEl = $('modeChip');

  const overlayEl = $('overlay');
  const overlayTitleEl = $('overlayTitle');
  const overlaySubEl = $('overlaySub');
  const finalScoreEl = $('finalScore');
  const finalBestEl = $('finalBest');
  const playAgainBtn = $('playAgainBtn');
  const continueBtn = $('continueBtn');

  const settingsPanelEl = $('settingsPanel');
  const soundSwitchEl = $('soundSwitch');
  const modeClassicBtn = $('modeClassicBtn');
  const modeDailyBtn = $('modeDailyBtn');
  const dailyNoteEl = $('dailyNote');
  const modeDescEl = $('modeDesc');
  const bestDescEl = $('bestDesc');
  const resetBestBtn = $('resetBestBtn');
  const closeSettingsBtn = $('closeSettingsBtn');

  const flashEl = $('screenFlash');
  const particleCanvas = $('particleCanvas');
  const pctx = particleCanvas.getContext('2d');

  let activeOverlay = null;
  let overlayQueue = null;

  let particles = [];
  let particleRaf = null;

  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    particleCanvas.width = Math.round(w * dpr);
    particleCanvas.height = Math.round(h * dpr);
    particleCanvas.style.width = w + 'px';
    particleCanvas.style.height = h + 'px';
    pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function spawnBurst(x, y, color, count) {
    if (particles.length > MAX_PARTICLES) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.2 + Math.random() * 3.6;
      particles.push({
        x: x, y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.2,
        life: 1,
        decay: 0.018 + Math.random() * 0.02,
        size: 1.6 + Math.random() * 2.8,
        color: color
      });
    }
    if (!particleRaf) particleRaf = requestAnimationFrame(particleLoop);
  }

  function particleLoop() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    pctx.clearRect(0, 0, w, h);

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.09;
      p.vx *= 0.975;
      p.vy *= 0.985;
      p.life -= p.decay;

      if (p.life <= 0 || p.y > h + 40) { particles.splice(i, 1); continue; }

      pctx.globalAlpha = p.life;
      pctx.fillStyle = p.color;
      pctx.shadowColor = p.color;
      pctx.shadowBlur = 14;
      pctx.beginPath();
      pctx.arc(p.x, p.y, p.size * (0.4 + p.life * 0.6), 0, Math.PI * 2);
      pctx.fill();
    }

    pctx.globalAlpha = 1;
    pctx.shadowBlur = 0;

    if (particles.length > 0) {
      particleRaf = requestAnimationFrame(particleLoop);
    } else {
      particleRaf = null;
    }
  }

  function burstAtCell(r, c, color, count) {
    const el = cellEls[r] && cellEls[r][c];
    if (!el) return;
    const rect = el.getBoundingClientRect();
    spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, color, count);
  }

  function flashScreen(intensity) {
    flashEl.style.transition = 'none';
    flashEl.style.opacity = String(clamp(intensity || 0.16, 0, 0.5));
    void flashEl.offsetWidth;
    flashEl.style.transition = 'opacity 0.55s ease-out';
    flashEl.style.opacity = '0';
  }

  function spawnScorePopup(clientX, clientY, amount, color) {
    const el = document.createElement('div');
    el.className = 'score-popup';
    el.textContent = '+' + amount;
    el.style.left = clientX + 'px';
    el.style.top = clientY + 'px';
    if (color) el.style.color = color;
    document.body.appendChild(el);
    setTimeout(function () {
      if (el.parentNode) el.parentNode.removeChild(el);
    }, 950);
  }

  function popupAtCells(cells, amount) {
    if (!cells.length) return;
    let sx = 0, sy = 0;
    for (let i = 0; i < cells.length; i++) {
      const el = cellEls[cells[i][0]][cells[i][1]];
      const r = el.getBoundingClientRect();
      sx += r.left + r.width / 2;
      sy += r.top + r.height / 2;
    }
    spawnScorePopup(sx / cells.length, sy / cells.length, amount, '#c4b5fd');
  }

  let audioCtx = null;

  function getAudioCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { audioCtx = new AC(); } catch (e) { return null; }
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  function tone(freq, duration, type, volume, delay) {
    if (!soundOn) return;
    const ctx = getAudioCtx();
    if (!ctx) return;

    const t0 = ctx.currentTime + (delay || 0);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(volume || 0.05, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function playSound(name) {
    if (!soundOn) return;
    switch (name) {
      case 'select':   tone(560, 0.055, 'sine', 0.032); break;
      case 'place':    tone(300, 0.08, 'triangle', 0.05); tone(440, 0.07, 'sine', 0.03, 0.03); break;
      case 'error':    tone(150, 0.14, 'sawtooth', 0.035); break;
      case 'clear':    tone(660, 0.1, 'sine', 0.05); tone(880, 0.13, 'sine', 0.04, 0.06); break;
      case 'combo':
        tone(520, 0.09, 'triangle', 0.05);
        tone(700, 0.09, 'triangle', 0.05, 0.07);
        tone(940, 0.14, 'sine', 0.05, 0.14);
        break;
      case 'fusion':
        tone(220, 0.16, 'sawtooth', 0.045);
        tone(660, 0.2, 'square', 0.03, 0.06);
        tone(1320, 0.2, 'sine', 0.03, 0.12);
        break;
      case 'blast':
        tone(180, 0.2, 'sawtooth', 0.05);
        tone(420, 0.22, 'triangle', 0.045, 0.05);
        tone(900, 0.24, 'sine', 0.04, 0.12);
        break;
      case 'gameover':
        tone(420, 0.22, 'sine', 0.05);
        tone(320, 0.24, 'sine', 0.05, 0.16);
        tone(220, 0.34, 'sine', 0.05, 0.34);
        break;
      case 'win':
        tone(523, 0.12, 'triangle', 0.05);
        tone(659, 0.12, 'triangle', 0.05, 0.1);
        tone(784, 0.14, 'triangle', 0.05, 0.2);
        tone(1046, 0.24, 'sine', 0.05, 0.32);
        break;
      default: break;
    }
  }

  function createEmptyBoard() {
    const b = [];
    for (let r = 0; r < BOARD_SIZE; r++) {
      const row = [];
      for (let c = 0; c < BOARD_SIZE; c++) row.push(null);
      b.push(row);
    }
    return b;
  }

  function countEmptyCells() {
    let n = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (!board[r][c]) n++;
      }
    }
    return n;
  }

  function canPlace(shape, row, col) {
    if (row < 0 || col < 0) return false;
    if (row + shape.h > BOARD_SIZE || col + shape.w > BOARD_SIZE) return false;

    for (let i = 0; i < shape.cells.length; i++) {
      const r = row + shape.cells[i][0];
      const c = col + shape.cells[i][1];
      if (board[r][c]) return false;
    }
    return true;
  }

  function canPlaceAnywhere(shape) {
    const maxRow = BOARD_SIZE - shape.h;
    const maxCol = BOARD_SIZE - shape.w;
    for (let r = 0; r <= maxRow; r++) {
      for (let c = 0; c <= maxCol; c++) {
        if (canPlace(shape, r, c)) return true;
      }
    }
    return false;
  }

  function trayHasFit(items) {
    for (let i = 0; i < items.length; i++) {
      if (canPlaceAnywhere(items[i].shape)) return true;
    }
    return false;
  }

  function anyShapeFits() {
    for (let i = 0; i < tray.length; i++) {
      if (!tray[i].used && canPlaceAnywhere(tray[i].shape)) return true;
    }
    return false;
  }

  function pickShape() {
    let r = rng() * TOTAL_WEIGHT;
    for (let i = 0; i < SHAPES.length; i++) {
      r -= SHAPES[i].weight;
      if (r <= 0) return SHAPES[i];
    }
    return SHAPES[0];
  }

  function generateTray() {
    const items = [];
    let fusionIndex = -1;

    if (rng() < 0.2) fusionIndex = Math.floor(rng() * 3);

    for (let i = 0; i < 3; i++) {
      const def = pickShape();
      items.push({
        shape: def,
        color: COLORS[Math.floor(rng() * COLORS.length)],
        fusion: i === fusionIndex,
        used: false
      });
    }
    return items;
  }

  function generateTrayWithRetry() {
    let items = generateTray();
    let tries = 0;
    while (tries < 15 && !trayHasFit(items) && countEmptyCells() > 16) {
      items = generateTray();
      tries++;
    }
    return items;
  }

  function buildBoardDOM() {
    boardEl.innerHTML = '';
    cellEls = [];
    const frag = document.createDocumentFragment();

    for (let r = 0; r < BOARD_SIZE; r++) {
      const row = [];
      for (let c = 0; c < BOARD_SIZE; c++) {
        const d = document.createElement('div');
        d.className = 'cell';
        d.dataset.r = String(r);
        d.dataset.c = String(c);
        frag.appendChild(d);
        row.push(d);
      }
      cellEls.push(row);
    }
    boardEl.appendChild(frag);
  }

  function renderCell(r, c) {
    const el = cellEls[r][c];
    const cell = board[r][c];
    el.className = 'cell';
    if (cell) {
      el.classList.add('filled', 'c-' + cell.color);
      if (cell.fusion) el.classList.add('fusion');
    }
  }

  function renderBoard() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        renderCell(r, c);
      }
    }
  }

  function markPlacedCells(cells) {
    for (let i = 0; i < cells.length; i++) {
      const el = cellEls[cells[i][0]][cells[i][1]];
      if (!el) continue;
      el.classList.remove('placed');
      void el.offsetWidth;
      el.classList.add('placed');
    }
  }

  function clearPreview() {
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        cellEls[r][c].classList.remove('preview-ok', 'preview-bad');
      }
    }
  }

  function updatePreview(row, col, index) {
    clearPreview();
    const item = tray[index];
    if (!item || item.used) return;

    const shape = item.shape;
    const valid = canPlace(shape, row, col);

    for (let i = 0; i < shape.cells.length; i++) {
      const r = row + shape.cells[i][0];
      const c = col + shape.cells[i][1];
      if (r < 0 || c < 0 || r >= BOARD_SIZE || c >= BOARD_SIZE) continue;
      cellEls[r][c].classList.add(valid ? 'preview-ok' : 'preview-bad');
    }
  }

  function buildShapeGrid(shape, color, fusion) {
    const grid = document.createElement('div');
    grid.className = 'shape-grid';
    grid.style.gridTemplateColumns = 'repeat(' + shape.w + ', var(--sc, 14px))';
    grid.style.gridTemplateRows = 'repeat(' + shape.h + ', var(--sc, 14px))';

    const filled = {};
    for (let i = 0; i < shape.cells.length; i++) {
      filled[shape.cells[i][0] + ',' + shape.cells[i][1]] = true;
    }

    for (let r = 0; r < shape.h; r++) {
      for (let c = 0; c < shape.w; c++) {
        const d = document.createElement('div');
        if (filled[r + ',' + c]) {
          d.className = 'shape-cell on c-' + color + (fusion ? ' fusion' : '');
        } else {
          d.className = 'shape-cell off';
        }
        grid.appendChild(d);
      }
    }
    return grid;
  }

  function renderTray() {
    trayEl.innerHTML = '';
    for (let i = 0; i < tray.length; i++) {
      const item = tray[i];
      const slot = document.createElement('div');
      slot.className = 'tray-slot';
      slot.dataset.index = String(i);

      if (item.used) {
        slot.classList.add('used');
      } else {
        slot.appendChild(buildShapeGrid(item.shape, item.color, item.fusion));
      }
      if (i === selectedIndex) slot.classList.add('selected');

      trayEl.appendChild(slot);
    }
  }

  function updateTrayState() {
    const slots = trayEl.children;
    for (let i = 0; i < slots.length; i++) {
      const item = tray[i];
      slots[i].classList.toggle('used', !item || item.used);
      slots[i].classList.toggle('selected', i === selectedIndex);
      slots[i].classList.remove('dragging');
    }
  }

  function updateHud() {
    if (!scoreAnimRaf) scoreValueEl.textContent = fmt(displayedScore);
    bestValueEl.textContent = fmt(best);

    comboValueEl.textContent = combo > 0 ? 'x' + combo : '—';
    comboValueEl.classList.toggle('on', combo > 0);
    const comboT = clamp(combo, 0, 5) / 5;
    comboBarFillEl.style.width = (comboT * 100) + '%';

    const pct = clamp(energy, 0, MAX_ENERGY);
    energyFillEl.style.width = pct + '%';
    energyFillEl.classList.toggle('full', pct >= MAX_ENERGY);
    energyPctEl.textContent = Math.round(pct) + '%';
    energyPctEl.classList.toggle('full', pct >= MAX_ENERGY);

    const canBlast = energy >= MAX_ENERGY && !gameOver && !busy;
    energyBtn.disabled = !canBlast;
    energyBtn.classList.toggle('ready', energy >= MAX_ENERGY && !gameOver);
    energyBtn.classList.toggle('active', energyMode);

    undoBtn.disabled = undoUsed || !undoSnapshot || gameOver || busy;
    restartBtn.disabled = busy;

    modeChipEl.textContent = mode === 'daily' ? 'DAILY' : 'CLASSIC';
    modeChipEl.classList.toggle('daily', mode === 'daily');

    boardEl.classList.toggle('energy-mode', energyMode);
  }

  function animateScoreTo(to, from) {
    if (scoreAnimRaf) cancelAnimationFrame(scoreAnimRaf);

    const dur = 340;
    const startTime = performance.now();

    scoreValueEl.classList.remove('bump');
    void scoreValueEl.offsetWidth;
    scoreValueEl.classList.add('bump');

    function step(now) {
      const t = Math.min(1, (now - startTime) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      displayedScore = from + (to - from) * eased;
      scoreValueEl.textContent = fmt(displayedScore);

      if (t < 1) {
        scoreAnimRaf = requestAnimationFrame(step);
      } else {
        displayedScore = to;
        scoreValueEl.textContent = fmt(to);
        scoreAnimRaf = null;
      }
    }
    scoreAnimRaf = requestAnimationFrame(step);
  }

  function addScore(amount) {
    if (amount <= 0) return;
    const from = displayedScore;
    score += amount;

    if (score > best) {
      best = score;
      lsSet(LS_BEST, best);
    }

    animateScoreTo(score, from);
    updateHud();
    checkDailyComplete();
  }

  function showToast(text, variant) {
    toastEl.textContent = text;
    toastEl.className = 'combo-toast';
    void toastEl.offsetWidth;
    toastEl.classList.add('show');
    if (variant) toastEl.classList.add(variant);

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.className = 'combo-toast';
    }, 1000);
  }

  function showComboToast(comboCount) {
    const labels = ['', 'NICE!', 'GREAT!', 'AWESOME!', 'BLAZING!', 'UNSTOPPABLE!'];
    const label = labels[clamp(comboCount, 0, labels.length - 1)] || 'UNSTOPPABLE!';
    showToast(comboCount > 1 ? label + ' x' + comboCount : label, '');
  }

  function setSelect