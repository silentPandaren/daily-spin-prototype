(() => {
/* ======================= CONFIG ======================= */
/*
 * Single source of truth — edit weights here to change drop rates.
 * weight = chance out of 100 (must sum to 100).
 */
const prizesConfig = [
  { name: '25% Discount',   wheelText: '25%\nDiscount',    color: '#005aff', icon: 'icons/discount.png',  weight:  5 },
  { name: '100 Platinum',   wheelText: '100\nPlatinum',    color: '#642ab5', icon: 'icons/platinum.png',  weight: 15 },
  { name: 'Legendary Item', wheelText: 'Legendary\nItem',  color: '#003dad', icon: 'icons/legendary.png', weight:  5 },
  { name: '8 Spheres',      wheelText: '8\nSpheres',       color: '#51258f', icon: 'icons/spheres.png',   weight:  5 },
  { name: '200 Cores',      wheelText: '200\nCores',       color: '#005aff', icon: 'icons/cores.png',     weight:  5 },
  { name: '4 Spheres',      wheelText: '4\nSpheres',       color: '#642ab5', icon: 'icons/spheres.png',   weight: 10 },
  { name: '50 Platinum',    wheelText: '50\nPlatinum',     color: '#003dad', icon: 'icons/platinum.png',  weight: 30 },
  { name: 'Premium 30 days',wheelText: 'Premium\n30 days', color: '#51258f', icon: 'icons/premium.png',   weight: 25 },
];

/* Build cumulative ranges automatically from weights */
let _cum = 0;
prizesConfig.forEach(p => {
  p.rangeMin = _cum + 1;
  _cum += p.weight;
  p.rangeMax = _cum;
});
// Sanity check
if (_cum !== 100) console.warn(`⚠ prizesConfig weights sum to ${_cum}, expected 100`);

/* Derived arrays used by wheel drawing (keep backward compat) */
const SEGMENTS      = prizesConfig.map(p => ({ text: p.wheelText, color: p.color, icon: p.icon }));
const DISPLAY_NAMES = prizesConfig.map(p => p.name);

const NUM    = SEGMENTS.length;
const ARC    = (2 * Math.PI) / NUM;
const RADIUS = 180;

/* Pity Timer */
const LEGENDARY_IDX   = 2;   // index of 'Legendary Item' in prizesConfig
const PITY_THRESHOLD  = 10;  // guaranteed legendary after this many spins
let spinsSinceLastLegendary = 0;

/* Session analytics */
let totalSpins   = 0;
const sessionStartTime = Date.now();

let coupons   = 3;
let spinning  = false;
let angle     = 0;

/* ======================= DOM ======================= */
const canvas      = document.getElementById('wheel');
const ctx         = canvas.getContext('2d');
const btnSpin     = document.getElementById('btnSpin');
const couponEl    = document.getElementById('couponCount');
const noCoupMsg   = document.getElementById('noCouponsMsg');
const modalOvrl   = document.getElementById('modalOverlay');
const prizeText   = document.getElementById('prizeText');
const btnClaim    = document.getElementById('btnClaim');
const confettiCvs = document.getElementById('confetti');
const confettiCtx = confettiCvs.getContext('2d');

/* ======================= RIM TICKS ======================= */
const ticks = [];
(() => {
  const rim = document.getElementById('wheelRim');
  for (let i = 0; i < 36; i++) {
    const t = document.createElement('div');
    t.className = 'tick';
    t.style.transform = `rotate(${i * 10}deg)`;
    rim.appendChild(t);
    ticks.push(t);
  }
  function updateTickOrigin() {
    const rimH = rim.offsetHeight;
    const origin = (rimH / 2) - 3;
    ticks.forEach(t => { t.style.transformOrigin = `1px ${origin}px`; });
  }
  updateTickOrigin();
  addEventListener('resize', updateTickOrigin);
})();

/* ======================= DRAW WHEEL ======================= */
function drawWheel(rot) {
  const cx = RADIUS, cy = RADIUS;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);

  for (let i = 0; i < NUM; i++) {
    const sa = i * ARC - Math.PI / 2;
    const ea = sa + ARC;

    const g = ctx.createRadialGradient(0, 0, 18, 0, 0, RADIUS);
    g.addColorStop(0, lighten(SEGMENTS[i].color, 20));
    g.addColorStop(0.6, SEGMENTS[i].color);
    g.addColorStop(1, darken(SEGMENTS[i].color, 20));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, RADIUS, sa, ea);
    ctx.closePath();
    ctx.fillStyle = g;
    ctx.fill();

    // Divider
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(sa) * RADIUS, Math.sin(sa) * RADIUS);
    ctx.strokeStyle = 'rgba(255,255,255,.06)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Icon + Text (stacked radially: icon near rim, text near center)
    ctx.save();
    ctx.rotate(sa + ARC / 2);

    const hasIcon = SEGMENTS[i].img && SEGMENTS[i].img.naturalWidth > 0;
    const iconSize = 34;

    // — Icon (near rim, prominent) —
    if (hasIcon) {
      const iconR = RADIUS * 0.73;
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 6;
      ctx.drawImage(SEGMENTS[i].img, iconR - iconSize / 2, -iconSize / 2, iconSize, iconSize);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
    }

    // — Text (closer to center, compact) —
    ctx.textAlign = 'center';
    const lines = SEGMENTS[i].text.split('\n');
    const fs = hasIcon ? 11 : 13;
    const lh = fs + 2;
    const tr = hasIcon ? RADIUS * 0.45 : RADIUS * 0.64;
    const oy = -((lines.length - 1) * lh) / 2;

    // Value line (first) — bolder, white
    ctx.font = `700 ${fs}px Inter, sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.shadowColor = 'rgba(0,0,0,.45)';
    ctx.shadowBlur = 2;
    ctx.fillText(lines[0], tr, oy + fs * 0.35);

    // Label line (second) — lighter, subdued
    if (lines.length > 1) {
      ctx.font = `500 ${fs - 1}px Inter, sans-serif`;
      ctx.fillStyle = 'rgba(255,255,255,.7)';
      ctx.fillText(lines[1], tr, oy + lh + fs * 0.35);
    }

    ctx.restore();
  }

  // Inner shadow (subtle, doesn't darken icons)
  const sh = ctx.createRadialGradient(0, 0, RADIUS * 0.88, 0, 0, RADIUS);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,.2)');
  ctx.beginPath();
  ctx.arc(0, 0, RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = sh;
  ctx.fill();

  ctx.restore();
}

/* ======================= SPIN LOGIC ======================= */
const debugPanel  = document.getElementById('debugPanel');
const debugNumber = document.getElementById('debugNumber');
const debugRange  = document.getElementById('debugRange');
const debugResult = document.getElementById('debugResult');
const debugPity       = document.getElementById('debugPity');
const debugTotalSpins = document.getElementById('debugTotalSpins');
const debugAvgSpins   = document.getElementById('debugAvgSpins');
const analyticsLog    = document.getElementById('analyticsLog');
const pityCounter     = document.getElementById('pityCounter');
const pityBarFill     = document.getElementById('pityBarFill');

/* ======================= ANALYTICS ======================= */
function trackEvent(eventName, data) {
  const ts = new Date().toLocaleTimeString('en-GB');
  const extra = data ? ' ' + JSON.stringify(data) : '';
  const msg = `[Analytics] Event: ${eventName}${extra}`;
  console.log(msg);

  // Append to debug panel log
  const entry = document.createElement('div');
  entry.innerHTML = `<span class="tag">[${ts}]</span> ${eventName}${extra}`;
  analyticsLog.appendChild(entry);
  analyticsLog.scrollTop = analyticsLog.scrollHeight;

  // Show debug panel when events arrive
  debugPanel.style.opacity = '1';
}

function updateSessionStats() {
  debugTotalSpins.textContent = totalSpins;
  const elapsedMin = (Date.now() - sessionStartTime) / 60000;
  const avg = elapsedMin > 0 ? (totalSpins / elapsedMin).toFixed(2) : '0';
  debugAvgSpins.textContent = avg;
}

function updatePityUI() {
  const val = spinsSinceLastLegendary;
  pityCounter.textContent = val;
  pityBarFill.style.width = `${(val / PITY_THRESHOLD) * 100}%`;
  // Glow when close to guarantee
  if (val >= PITY_THRESHOLD) {
    pityBarFill.classList.add('ready');
  } else {
    pityBarFill.classList.remove('ready');
  }
}

btnSpin.addEventListener('click', () => {
  if (coupons <= 0 && !spinning) {
    trackEvent('spin_attempt_no_coupons', { coupons: 0 });
    return;
  }
  startSpin();
});
btnClaim.addEventListener('click', closeModal);
document.getElementById('btnModalClose').addEventListener('click', closeModal);
document.getElementById('btnAddCoupons').addEventListener('click', () => {
  coupons += 10;
  updateCouponsUI();
});

document.getElementById('btnUpsell').addEventListener('click', () => {
  trackEvent('Shop_Redirect_from_Wheel');
});

let _lastPrizeName = '';
let _lastIsPityWin = false;

function rollPrize() {
  const rnd = Math.floor(Math.random() * 100) + 1; // 1–100
  let winIdx = 0;
  for (let i = 0; i < prizesConfig.length; i++) {
    if (rnd >= prizesConfig[i].rangeMin && rnd <= prizesConfig[i].rangeMax) {
      winIdx = i;
      break;
    }
  }
  return { rnd, winIdx };
}

function startSpin() {
  if (spinning || coupons <= 0) return;
  spinning = true;
  coupons--;
  totalSpins++;
  updateCouponsUI();
  updateSessionStats();

  // Analytics: spin started
  trackEvent('spin_started', { spinNumber: totalSpins, couponsLeft: coupons });

  // 1. Determine prize — apply Pity Timer if threshold reached
  let isPityWin = false;
  let rnd, winIdx;

  if (spinsSinceLastLegendary >= PITY_THRESHOLD) {
    // Forced legendary
    isPityWin = true;
    rnd = '—';
    winIdx = LEGENDARY_IDX;
  } else {
    ({ rnd, winIdx } = rollPrize());
  }

  // 2. Update pity counter
  spinsSinceLastLegendary++;
  if (winIdx === LEGENDARY_IDX) {
    spinsSinceLastLegendary = 0;
  }
  updatePityUI();

  const prize = prizesConfig[winIdx];
  const pityTag = isPityWin ? ' ★ PITY WIN!' : '';

  // Store for onSpinEnd analytics
  _lastPrizeName = prize.name;
  _lastIsPityWin = isPityWin;

  // Debug output
  console.log(`[Debug] Number: ${rnd} | Range: ${prize.rangeMin}–${prize.rangeMax} (${prize.weight}%) | Result: ${prize.name}${pityTag} | Pity: ${spinsSinceLastLegendary}/${PITY_THRESHOLD}`);
  debugNumber.textContent  = rnd;
  debugRange.textContent   = `${prize.rangeMin}–${prize.rangeMax} (${prize.weight}%)`;
  debugResult.textContent  = prize.name + pityTag;
  debugPity.textContent    = `${spinsSinceLastLegendary}/${PITY_THRESHOLD}`;
  debugPanel.style.opacity = '1';

  // 2. Calculate target angle so pointer (top) lands in the middle of winIdx sector
  //    Sector i center angle (from 12-o'clock, CW) = i * ARC + ARC/2
  //    Pointer is at top (12-o'clock). After rotation by `angle`, the sector under the
  //    pointer satisfies: (-angle) mod 2π falls inside sector i's arc.
  //    We need: (-targetAngle) mod 2π ≈ winIdx * ARC + ARC/2
  //    So targetAngle ≈ -(winIdx * ARC + ARC/2) + small random jitter inside sector
  const jitter      = (Math.random() - 0.5) * ARC * 0.7;  // stay within sector
  const sectorAngle = winIdx * ARC + ARC / 2 + jitter;
  const targetRaw   = -sectorAngle;

  // 3. Add full turns for impressive spin (5–8 full rotations forward from current)
  const fullTurns = (5 + Math.random() * 3) * Math.PI * 2;
  // Normalize so we always spin forward (increasing angle)
  let target = angle + fullTurns;
  // Adjust final position to match targetRaw mod 2π
  const desiredMod = ((targetRaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const currentMod = ((target  % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let correction   = desiredMod - currentMod;
  if (correction < 0) correction += Math.PI * 2;
  target += correction;

  const start = angle;
  const dist  = target - start;
  const dur   = 5000 + Math.random() * 2000;
  const t0    = performance.now();

  function ease(t) { return 1 - Math.pow(1 - t, 5); }

  function frame(now) {
    const p = Math.min((now - t0) / dur, 1);
    angle = start + dist * ease(p);
    drawWheel(angle);
    if (p < 1) requestAnimationFrame(frame);
    else { spinning = false; onSpinEnd(winIdx); }
  }
  requestAnimationFrame(frame);
}

function onSpinEnd(winIdx) {
  // Analytics: prize received
  trackEvent('prize_received', {
    prize: _lastPrizeName,
    pityWin: _lastIsPityWin
  });
  launchConfetti();
  setTimeout(() => showModal(winIdx), 400);
}

/* ======================= UI ======================= */
const modalPrizeIcon = document.getElementById('modalPrizeIcon');

const upsellOffer = document.getElementById('upsellOffer');

function updateCouponsUI() {
  couponEl.textContent = coupons;
  btnSpin.disabled = coupons <= 0;
  noCoupMsg.classList.toggle('visible', coupons <= 0);
  upsellOffer.classList.toggle('visible', coupons <= 0);
}

function showModal(idx) {
  prizeText.textContent = DISPLAY_NAMES[idx];
  // Show prize icon from icons/ folder
  const iconPath = SEGMENTS[idx].icon;
  if (iconPath) {
    modalPrizeIcon.src = iconPath;
    modalPrizeIcon.style.display = 'block';
  } else {
    modalPrizeIcon.style.display = 'none';
  }
  modalOvrl.classList.add('active');
}

function closeModal() {
  modalOvrl.classList.remove('active');
}

// Close modal when clicking the overlay backdrop
modalOvrl.addEventListener('click', (e) => {
  if (e.target === modalOvrl) closeModal();
});

/* ======================= CONFETTI ======================= */
function resizeConfetti() {
  confettiCvs.width  = innerWidth;
  confettiCvs.height = innerHeight;
}
addEventListener('resize', resizeConfetti);
resizeConfetti();

let parts = [], cAnim = null;

function launchConfetti() {
  parts = [];
  const cols = ['#005aff','#642ab5','#ffc700','#dc0050','#52c41a','#ff5811','#cb2b83','#13a8a8'];
  for (let i = 0; i < 180; i++) {
    parts.push({
      x: innerWidth / 2 + (Math.random() - .5) * 280,
      y: innerHeight / 2 - 180,
      w: 5 + Math.random() * 5, h: 3 + Math.random() * 4,
      vx: (Math.random() - .5) * 15, vy: -(Math.random() * 13 + 4),
      r: Math.random() * 360, rv: (Math.random() - .5) * 11,
      c: cols[Math.floor(Math.random() * cols.length)],
      g: .17 + Math.random() * .07, l: 1, d: .006 + Math.random() * .004,
    });
  }
  if (cAnim) cancelAnimationFrame(cAnim);
  drawConfetti();
}

function drawConfetti() {
  confettiCtx.clearRect(0, 0, confettiCvs.width, confettiCvs.height);
  let alive = false;
  parts.forEach(p => {
    if (p.l <= 0) return;
    alive = true;
    p.vy += p.g; p.x += p.vx; p.y += p.vy;
    p.r += p.rv; p.vx *= .99; p.l -= p.d;
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.r * Math.PI / 180);
    confettiCtx.globalAlpha = Math.max(p.l, 0);
    confettiCtx.fillStyle = p.c;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.restore();
  });
  if (alive) cAnim = requestAnimationFrame(drawConfetti);
  else confettiCtx.clearRect(0, 0, confettiCvs.width, confettiCvs.height);
}

/* ======================= HELPERS ======================= */
function lighten(hex, pct) {
  let [r, g, b] = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16));
  return `rgb(${[r,g,b].map(c => Math.min(255, c + Math.round((255-c)*pct/100))).join(',')})`;
}
function darken(hex, pct) {
  let [r, g, b] = [1,3,5].map(i => parseInt(hex.slice(i, i+2), 16));
  return `rgb(${[r,g,b].map(c => Math.max(0, c - Math.round(c*pct/100))).join(',')})`;
}

/* ======================= PRELOAD ICONS ======================= */
let imagesLoaded = 0;
SEGMENTS.forEach(seg => {
  const img = new Image();
  img.onload = img.onerror = () => {
    imagesLoaded++;
    if (imagesLoaded === NUM) {
      drawWheel(angle);
      updateCouponsUI();
    }
  };
  img.src = seg.icon;
  seg.img = img;
});

/* ======================= INIT (fallback if no images) ======================= */
drawWheel(angle);
updateCouponsUI();
updatePityUI();
updateSessionStats();
trackEvent('page_loaded', { coupons });
})();
