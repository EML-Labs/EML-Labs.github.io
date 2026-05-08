/* ============================================================
   main.js — shared script for every slide page.
   ----------------------------------------------------------
   Each slide HTML sets:
       <html data-slide="N" data-total="14">
   This script reads those values to drive cross-page navigation,
   the progress bar, the nav dots, and to decide which slide-
   specific extras (AFib path, pipeline animation) to run.
   ============================================================ */
(function () {
  const html         = document.documentElement;
  const CURRENT      = parseInt(html.dataset.slide || '1', 10);
  const TOTAL        = parseInt(html.dataset.total || '14', 10);
  const slidePath    = (n) => `slide-${String(n).padStart(2, '0')}.html`;
  const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let navigating = false;

  /* ----------------------------------------------------------
     Page transition styles + entry animation
     ---------------------------------------------------------- */
  (function initPageTransitions() {
    const style = document.createElement('style');
    style.textContent = `
      body.slide-enter {
        opacity: 0;
        transform: translateY(10px) scale(0.995);
      }
      body.slide-enter-active {
        opacity: 1;
        transform: translateY(0) scale(1);
        transition: opacity 300ms cubic-bezier(0.22, 1, 0.36, 1),
                    transform 300ms cubic-bezier(0.22, 1, 0.36, 1);
      }
      body.slide-exit-forward,
      body.slide-exit-backward {
        transition: opacity 220ms cubic-bezier(0.4, 0, 1, 1),
                    transform 220ms cubic-bezier(0.4, 0, 1, 1),
                    filter 220ms cubic-bezier(0.4, 0, 1, 1);
      }
      body.slide-exit-forward {
        opacity: 0;
        transform: translateX(-22px) scale(0.992);
        filter: blur(1.2px);
      }
      body.slide-exit-backward {
        opacity: 0;
        transform: translateX(22px) scale(0.992);
        filter: blur(1.2px);
      }
    `;
    document.head.appendChild(style);

    if (REDUCED_MOTION) return;
    document.body.classList.add('slide-enter');
    requestAnimationFrame(() => {
      document.body.classList.add('slide-enter-active');
      window.setTimeout(() => {
        document.body.classList.remove('slide-enter', 'slide-enter-active');
      }, 340);
    });
  })();

  /* ----------------------------------------------------------
     Navigation — moves between separate HTML files
     ---------------------------------------------------------- */
  function goTo(n) {
    n = Math.max(1, Math.min(TOTAL, n));
    if (n === CURRENT || navigating) return;

    const target = slidePath(n);
    if (REDUCED_MOTION) {
      window.location.href = target;
      return;
    }

    navigating = true;
    const dirClass = n > CURRENT ? 'slide-exit-forward' : 'slide-exit-backward';
    document.body.classList.add(dirClass);
    window.setTimeout(() => {
      window.location.href = target;
    }, 230);
  }
  const next = () => goTo(CURRENT + 1);
  const prev = () => goTo(CURRENT - 1);

  /* Build nav dots (one per slide; current is .active) */
  const nav = document.getElementById('navDots');
  if (nav) {
    nav.innerHTML = '';
    for (let i = 1; i <= TOTAL; i++) {
      const d = document.createElement('button');
      d.className = 'nd' + (i === CURRENT ? ' active' : '');
      d.setAttribute('aria-label', `Go to slide ${i}`);
      d.addEventListener('click', () => goTo(i));
      nav.appendChild(d);
    }
  }

  /* Progress bar — fraction of (CURRENT-1) / (TOTAL-1) */
  const fill = document.getElementById('progressFill');
  if (fill) {
    const pct = TOTAL > 1 ? ((CURRENT - 1) / (TOTAL - 1)) * 100 : 0;
    fill.style.width = pct + '%';
  }

  /* Keyboard navigation */
  document.addEventListener('keydown', (e) => {
    if (e.target.getAttribute && e.target.getAttribute('contenteditable')) return;
    if (['ArrowDown', 'ArrowRight', 'PageDown', ' ', 'Space'].includes(e.key)) {
      e.preventDefault();
      next();
    } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
      e.preventDefault();
      prev();
    } else if (e.key === 'Home') {
      e.preventDefault();
      goTo(1);
    } else if (e.key === 'End') {
      e.preventDefault();
      goTo(TOTAL);
    }
  });

  /* Mouse wheel — debounced */
  let lastWheel = 0;
  document.addEventListener(
    'wheel',
    (e) => {
      const now = Date.now();
      if (now - lastWheel < 700) return;
      lastWheel = now;
      if (e.deltaY > 0) next();
      else if (e.deltaY < 0) prev();
    },
    { passive: true }
  );

  /* Touch swipe */
  let startY = 0;
  document.addEventListener(
    'touchstart',
    (e) => {
      startY = e.touches[0].clientY;
    },
    { passive: true }
  );
  document.addEventListener(
    'touchend',
    (e) => {
      const dy = startY - e.changedTouches[0].clientY;
      if (Math.abs(dy) > 50) {
        if (dy > 0) next();
        else prev();
      }
    },
    { passive: true }
  );

  /* Mark slide as visible immediately so CSS-driven draw animations fire */
  document.querySelectorAll('.slide').forEach((s) => s.classList.add('visible'));

  /* ----------------------------------------------------------
     AFib waveform path generator (used on slide-3)
     ---------------------------------------------------------- */
  function buildAfibPath(W, H, baseline, peaks) {
    let d = `M 0,${baseline}`;
    let x = 0;
    peaks.forEach((px) => {
      while (x < px - 18) {
        const noise = (Math.sin(x * 1.1) * 3.5).toFixed(1);
        d += ` L ${x},${(baseline + parseFloat(noise)).toFixed(1)}`;
        x += 7;
      }
      d += ` L ${px - 7},${baseline + 5} L ${px},${8} L ${px + 8},${H - 5} L ${px + 16},${baseline}`;
      x = px + 16;
    });
    d += ` L ${W},${baseline}`;
    return d;
  }
  (function initAfib() {
    const path = document.getElementById('afibEcgPath');
    if (path) path.setAttribute('d', buildAfibPath(300, 55, 36, [45, 110, 152, 200, 255]));
  })();

  /* ----------------------------------------------------------
     Inline editor — same as before; per-page export.
     ---------------------------------------------------------- */
  class InlineEditor {
    constructor() {
      this.isActive = false;
      this.toggle  = document.getElementById('editToggle');
      this.hotzone = document.getElementById('editHotzone');
      this.banner  = document.getElementById('editBanner');
      if (!this.toggle || !this.hotzone || !this.banner) return;
      this._hideTimeout = null;

      this._setupHotzone();
      this._setupKeyboard();

      this.toggle.addEventListener('click', () => this.toggleEditMode());
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 's' && this.isActive) {
          e.preventDefault();
          this.exportFile();
        }
      });
    }

    _setupHotzone() {
      const show = () => {
        clearTimeout(this._hideTimeout);
        this.toggle.classList.add('show');
      };
      const hide = () => {
        this._hideTimeout = setTimeout(() => {
          if (!this.isActive) this.toggle.classList.remove('show');
        }, 400);
      };
      this.hotzone.addEventListener('mouseenter', show);
      this.hotzone.addEventListener('mouseleave', hide);
      this.toggle.addEventListener('mouseenter', show);
      this.toggle.addEventListener('mouseleave', hide);
      this.hotzone.addEventListener('click', () => this.toggleEditMode());
    }

    _setupKeyboard() {
      document.addEventListener('keydown', (e) => {
        if ((e.key === 'e' || e.key === 'E') && !(e.target.getAttribute && e.target.getAttribute('contenteditable'))) {
          this.toggleEditMode();
        }
      });
    }

    toggleEditMode() {
      this.isActive = !this.isActive;
      document.body.classList.toggle('edit-active', this.isActive);
      this.toggle.classList.toggle('active', this.isActive);
      this.banner.classList.toggle('active', this.isActive);

      const editables = document.querySelectorAll(
        '.slide h1,.slide h2,.slide h3,.slide h4,.slide p,.slide li,.slide .sc-num,.slide .tc-num,.slide .sv,.slide .rm-val,.slide .nm,.slide .ai-txt'
      );
      editables.forEach((el) => {
        if (this.isActive) el.setAttribute('contenteditable', 'true');
        else el.removeAttribute('contenteditable');
      });
    }

    exportFile() {
      const editables = Array.from(document.querySelectorAll('[contenteditable]'));
      editables.forEach((el) => el.removeAttribute('contenteditable'));
      document.body.classList.remove('edit-active');
      this.toggle.classList.remove('active', 'show');
      this.banner.classList.remove('active');

      const html = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;

      document.body.classList.add('edit-active');
      editables.forEach((el) => el.setAttribute('contenteditable', 'true'));
      this.toggle.classList.add('active');
      this.banner.classList.add('active');

      const blob = new Blob([html], { type: 'text/html' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `slide-${String(CURRENT).padStart(2, '0')}-edited.html`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  /* ----------------------------------------------------------
     PipelineAnimation — only initialises if slide-9 is on the page.
     Logic is identical to the original; the only change is that
     it always runs while the page is open (since the slide is
     always in view) instead of starting/stopping on intersection.
     ---------------------------------------------------------- */
  class PipelineAnimation {
    constructor() {
      this.slide  = document.getElementById('slide-9');
      this.canvas = document.getElementById('ppgCanvas');
      if (!this.canvas || !this.slide) return;
      this.ctx       = this.canvas.getContext('2d');
      this.running   = false;
      this._lastReal = performance.now();

      this.t     = 0;
      this.speed = 1.8;
      this.buf   = [];
      this.sBuf  = [];

      this.prevSample  = 0;
      this.rising      = false;
      this.lastPeakT   = -99;
      this.rrList      = [];
      this.peakMarkers = [];
      this.peakRipples = [];
      this.beatCount   = 0;
      this.BATCH       = 7;

      this.mode        = 'normal';
      this.modeRealSec = 0;
      this.MODE_DUR    = 12;
      this._afibSched  = null;

      this.displayScore = 0.12;
      this.targetScore  = 0.12;
      this.modelRunning = false;
      this.modelAnim    = 0;
      this.neuronSpikes = new Array(11).fill(0);
      this.ambientTimer = 0;

      this.lastBPM = 72;
      this.lastRR  = 800;
      this.lastZ   = 0;

      this.sC = {
        capture : document.getElementById('sc-capture'),
        peak    : document.getElementById('sc-peak'),
        rr      : document.getElementById('sc-rr'),
        norm    : document.getElementById('sc-norm'),
        model   : document.getElementById('sc-model'),
        score   : document.getElementById('sc-score'),
      };

      window.addEventListener('resize', () => this._resize());
      this._resize();
      this.start();
    }

    _resize() {
      const mr = this.canvas.parentElement.getBoundingClientRect();
      const mW = Math.max(200, Math.floor(mr.width));
      const mH = Math.max(60,  Math.floor(mr.height || 100));
      this.canvas.width  = mW;
      this.canvas.height = mH;
      if (this.buf.length  !== mW) this.buf  = new Array(mW).fill(0.1);
      const sLen = Math.round(mW * 0.3);
      if (this.sBuf.length !== sLen) this.sBuf = new Array(sLen).fill(0.1);
      Object.values(this.sC).forEach((c) => {
        if (!c) return;
        const cW = Math.max(60, Math.round(parseFloat(getComputedStyle(c).width)  || 100));
        const cH = Math.max(40, Math.round(parseFloat(getComputedStyle(c).height) || 60));
        c.width = cW; c.height = cH;
      });
    }

    start() {
      if (this.running) return;
      this.running = true;
      this._resize();
      this._lastReal = performance.now();
      this._loop();
    }
    stop() { this.running = false; }

    _ppg(t) { return this.mode === 'normal' ? this._ppgNormal(t) : this._ppgAfib(t); }

    _ppgNormal(t) {
      const hr = 72 + Math.sin(t * 0.28) * 4;
      const period = 60 / hr, phase = (t % period) / period;
      const sys   = Math.exp(-Math.pow((phase - 0.18) * 10, 2));
      const dic   = Math.exp(-Math.pow((phase - 0.48) * 22, 2)) * 0.2;
      const noise = (Math.sin(t * 143.7) + Math.sin(t * 97.3)) * 0.01;
      return Math.max(0, Math.min(1, sys + dic + noise));
    }

    _ppgAfib(t) {
      if (!this._afibSched) {
        let cum = 0; this._afibSched = [];
        for (let i = 0; i < 300; i++) {
          cum += (i % 3 === 0)
            ? 0.7  + Math.abs(Math.cos(i * 2.3 + 0.9)) * 0.2
            : 0.32 + Math.abs(Math.sin(i * 3.1 + 1.7)) * 0.18;
          this._afibSched.push(cum);
        }
        this._afibTotal = cum;
      }
      const tMod = t % this._afibTotal;
      let bStart = 0, bPeriod = 0.6;
      for (let i = 0; i < this._afibSched.length - 1; i++) {
        if (this._afibSched[i] <= tMod && tMod < this._afibSched[i + 1]) {
          bStart = this._afibSched[i]; bPeriod = this._afibSched[i + 1] - bStart; break;
        }
      }
      const phase = (tMod - bStart) / Math.max(0.01, bPeriod);
      return Math.max(0, Math.min(1,
        Math.exp(-Math.pow((phase - 0.12) * 16, 2)) * 0.95 +
        Math.sin(tMod * 52) * 0.05 + Math.sin(tMod * 37) * 0.04 + 0.06
      ));
    }

    _detectPeak(sample) {
      if (!this.rising && sample > 0.5) this.rising = true;
      if (this.rising && sample < this.prevSample && this.prevSample > 0.5) {
        const gap = this.t - this.lastPeakT;
        if (gap > 0.28) {
          if (this.lastPeakT > 0) {
            this.rrList.push(gap);
            if (this.rrList.length > 60) this.rrList.shift();
          }
          this.lastPeakT = this.t;
          this.beatCount++;
          this.peakMarkers.push({ age: 0 });
          this.peakRipples.push({
            yFrac:  this.sBuf[this.sBuf.length - 1],
            age:    0,
            maxAge: this.sBuf.length,
          });
          this._onPeak(gap);
        }
        this.rising = false;
      }
      this.prevSample = sample;
    }

    _onPeak(rrSec) {
      const rrMs = Math.round((rrSec / this.speed) * 1000);
      const bpm  = Math.round(60 / (rrSec / this.speed));
      this.lastBPM = bpm; this.lastRR = rrMs;

      if (this.rrList.length >= 4) {
        const mu  = this.rrList.reduce((a, b) => a + b) / this.rrList.length;
        const std = Math.sqrt(this.rrList.reduce((a, b) => a + (b - mu) ** 2, 0) / this.rrList.length);
        this.lastZ = std > 0.001 ? (rrSec - mu) / std : 0;
      }

      this._setVal('pv-capture', `${bpm} BPM`);
      this._setVal('pv-peak',    '\u2713 det.');
      this._setVal('pv-rr',      `${rrMs} ms`);
      this._setVal('pv-norm',    this.rrList.length >= 4 ? `z=${this.lastZ >= 0 ? '+' : ''}${this.lastZ.toFixed(2)}` : '\u2026');

      this._flash('ps-capture');
      setTimeout(() => this._flash('ps-peak'),  150);
      setTimeout(() => this._flash('ps-rr'),    310);
      setTimeout(() => this._flash('ps-norm'),  470);

      if (this.beatCount % this.BATCH === 0 && this.rrList.length >= this.BATCH && !this.modelRunning) {
        setTimeout(() => this._runModel(), 640);
      }
    }

    _runModel() {
      this.modelRunning = true;
      this.modelAnim    = 0;
      this.neuronSpikes = new Array(11).fill(0);
      this._flash('ps-model');
      this._setVal('pv-model', 'Infer\u2026');
    }

    _computeScore() {
      const iv = this.rrList.slice(-this.BATCH);
      if (iv.length < 3) return this.mode === 'normal' ? 0.12 : 0.78;
      const diffs = iv.slice(1).map((v, i) => Math.abs(v - iv[i]));
      const avgD  = diffs.reduce((a, b) => a + b, 0) / diffs.length;
      const mean  = iv.reduce((a, b) => a + b, 0)    / iv.length;
      const cv    = avgD / mean;
      return this.mode === 'normal'
        ? Math.max(0.04, Math.min(0.38, 0.06 + cv * 1.8))
        : Math.max(0.62, Math.min(0.97, 0.68 + cv * 1.2));
    }

    _drawCapture() {
      const c = this.sC.capture; if (!c || !c.width) return;
      const ctx = c.getContext('2d'), W = c.width, H = c.height, m = 3;
      const col = this.mode === 'normal' ? '#22d4a0' : '#ff4f64';
      ctx.fillStyle = 'rgba(20,31,53,0.93)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
      const slice = this.buf.slice(-Math.round(this.buf.length * 0.42));
      ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.shadowBlur = 5; ctx.shadowColor = col;
      ctx.beginPath();
      slice.forEach((v, i) => {
        const x = (i / (slice.length - 1)) * W, y = H - m - v * (H - m * 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke(); ctx.shadowBlur = 0;
      const lv = slice[slice.length - 1] || 0;
      const dy = H - m - lv * (H - m * 2);
      ctx.fillStyle = col; ctx.shadowBlur = 8; ctx.shadowColor = col;
      ctx.beginPath(); ctx.arc(W - 3, dy, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    }

    _drawPeak() {
      const c = this.sC.peak; if (!c || !c.width) return;
      const ctx = c.getContext('2d'), W = c.width, H = c.height, m = 3, N = this.sBuf.length;
      ctx.fillStyle = 'rgba(20,31,53,0.93)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      this.sBuf.forEach((v, i) => {
        const x = (i / (N - 1)) * W, y = H - m - v * (H - m * 2);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();
      this.peakRipples.forEach((r) => {
        const bufPos = Math.max(0, N - 1 - r.age);
        const x = (bufPos / (N - 1)) * W;
        const y = H - m - this.sBuf[bufPos] * (H - m * 2);
        const prog = r.age / r.maxAge;
        const alpha = Math.max(0, 1 - prog);
        const ringR = prog * W * 0.14;
        ctx.strokeStyle = `rgba(255,79,100,${alpha * 0.6})`; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, ringR, 0, Math.PI * 2); ctx.stroke();
        if (prog < 0.55) {
          ctx.strokeStyle = `rgba(255,79,100,${alpha * 0.3})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, ringR * 0.48, 0, Math.PI * 2); ctx.stroke();
        }
        if (prog < 0.4) {
          ctx.fillStyle = `rgba(255,79,100,${alpha})`; ctx.shadowBlur = 10; ctx.shadowColor = '#ff4f64';
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
          ctx.fillStyle = `rgba(255,79,100,${alpha})`;
          ctx.font = `bold ${Math.round(H * 0.22)}px sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          ctx.fillText('\u25B2', x, y - 2); ctx.textBaseline = 'alphabetic';
        }
      });
    }

    _drawRR() {
      const c = this.sC.rr; if (!c || !c.width) return;
      const ctx = c.getContext('2d'), W = c.width, H = c.height;
      ctx.fillStyle = 'rgba(20,31,53,0.93)'; ctx.fillRect(0, 0, W, H);
      if (!this.lastRR) return;
      const gapF = 0.18 + Math.max(0, Math.min(1, (this.lastRR - 300) / 800)) * 0.6;
      const halfG = gapF * W / 2, cx = W / 2;
      const x1 = cx - halfG, x2 = cx + halfG;
      const baseY = H * 0.68, peakH = H * 0.50;
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(W * 0.04, baseY); ctx.lineTo(W * 0.96, baseY); ctx.stroke();
      const drawPk = (x) => {
        ctx.strokeStyle = '#ff4f64'; ctx.lineWidth = 1.8;
        ctx.shadowBlur = 7; ctx.shadowColor = '#ff4f64';
        ctx.beginPath(); ctx.moveTo(x - W * 0.048, baseY); ctx.lineTo(x, baseY - peakH); ctx.lineTo(x + W * 0.048, baseY); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ff4f64'; ctx.beginPath(); ctx.arc(x, baseY - peakH, 2.5, 0, Math.PI * 2); ctx.fill();
      };
      drawPk(x1); drawPk(x2);
      const ay = baseY + H * 0.1;
      ctx.strokeStyle = '#38b6ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x1 + 3, ay); ctx.lineTo(x2 - 3, ay); ctx.stroke();
      ctx.fillStyle = '#38b6ff';
      ctx.beginPath(); ctx.moveTo(x1 + 3, ay - 3); ctx.lineTo(x1 - 6, ay); ctx.lineTo(x1 + 3, ay + 3); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x2 - 3, ay - 3); ctx.lineTo(x2 + 6, ay); ctx.lineTo(x2 - 3, ay + 3); ctx.fill();
      ctx.fillStyle = '#38b6ff'; ctx.font = `700 ${Math.round(H * 0.21)}px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(`${this.lastRR} ms`, cx, ay + 2); ctx.textBaseline = 'alphabetic';
    }

    _drawNorm() {
      const c = this.sC.norm; if (!c || !c.width) return;
      const ctx = c.getContext('2d'), W = c.width, H = c.height;
      ctx.fillStyle = 'rgba(20,31,53,0.93)'; ctx.fillRect(0, 0, W, H);
      if (this.rrList.length < 4) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = `${Math.round(H * 0.2)}px 'JetBrains Mono',monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('collecting\u2026', W / 2, H / 2); ctx.textBaseline = 'alphabetic'; return;
      }
      const z = this.lastZ, mux = W / 2, sigma = W * 0.3, curveH = H * 0.52, base = H * 0.72;
      const fg = ctx.createLinearGradient(0, 0, W, 0);
      fg.addColorStop(0, 'rgba(67,97,238,0)'); fg.addColorStop(.5, 'rgba(67,97,238,.1)'); fg.addColorStop(1, 'rgba(67,97,238,0)');
      ctx.fillStyle = fg; ctx.beginPath(); ctx.moveTo(0, base);
      for (let px = 0; px <= W; px++) { const xi = (px - mux) / sigma; ctx.lineTo(px, base - Math.exp(-.5 * xi * xi) * curveH); }
      ctx.lineTo(W, base); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(67,97,238,.5)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let px = 0; px <= W; px++) { const xi = (px - mux) / sigma, y = base - Math.exp(-.5 * xi * xi) * curveH; px === 0 ? ctx.moveTo(px, y) : ctx.lineTo(px, y); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(56,182,255,.3)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(mux, base - curveH - 2); ctx.lineTo(mux, base); ctx.stroke(); ctx.setLineDash([]);
      const zC = Math.max(-2.2, Math.min(2.2, z));
      const dotX = mux + zC * sigma * 0.65;
      const xiD = (dotX - mux) / sigma;
      const dotY = base - Math.exp(-.5 * xiD * xiD) * curveH - 2;
      const dc = Math.abs(z) < 1.5 ? '#22d4a0' : '#ffa94d';
      ctx.fillStyle = dc; ctx.shadowBlur = 9; ctx.shadowColor = dc;
      ctx.beginPath(); ctx.arc(dotX, dotY, 4, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = dc; ctx.font = `700 ${Math.round(H * 0.2)}px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.fillText(`z=${z >= 0 ? '+' : ''}${z.toFixed(2)}`, W / 2, H - 1); ctx.textBaseline = 'alphabetic';
    }

    _drawModel() {
      const c = this.sC.model; if (!c || !c.width) return;
      const ctx = c.getContext('2d'), W = c.width, H = c.height;
      ctx.fillStyle = 'rgba(20,31,53,0.93)'; ctx.fillRect(0, 0, W, H);

      if (this.modelRunning) {
        this.modelAnim += 0.018;
        const pf = document.getElementById('modelProgFill'); if (pf) pf.style.width = (this.modelAnim * 100) + '%';
        if (this.modelAnim >= 1) {
          this.modelAnim = 0; this.modelRunning = false;
          const score = this._computeScore(); this.targetScore = score;
          this._flash('ps-model'); this._flash('ps-score');
          this._setVal('pv-model', 'Done \u2713'); this._setVal('pv-score', score.toFixed(3));
          const pf2 = document.getElementById('modelProgFill'); if (pf2) pf2.style.width = '0%';
        } else {
          const sp = (v) => Math.sin(v * Math.PI);
          const L1 = Math.max(0, Math.min(1, (this.modelAnim - 0.00) / 0.28));
          const L2 = Math.max(0, Math.min(1, (this.modelAnim - 0.22) / 0.30));
          const L3 = Math.max(0, Math.min(1, (this.modelAnim - 0.58) / 0.32));
          for (let i = 0; i < 4; i++) this.neuronSpikes[i]   = sp(L1);
          for (let i = 4; i < 9; i++) this.neuronSpikes[i]   = sp(L2);
          for (let i = 9; i < 11; i++) this.neuronSpikes[i]  = sp(L3);
        }
      } else {
        this.ambientTimer += 0.035;
        for (let i = 0; i < 11; i++) this.neuronSpikes[i] = Math.max(0, Math.sin(this.ambientTimer * 0.6 + i * 1.4) * 0.22);
      }

      const lx = [W * 0.17, W * 0.5, W * 0.83];
      const nr = Math.min(5, W * 0.038);
      const npos = [
        [{ x: lx[0], y: H * .14 }, { x: lx[0], y: H * .38 }, { x: lx[0], y: H * .62 }, { x: lx[0], y: H * .86 }],
        [{ x: lx[1], y: H * .1 }, { x: lx[1], y: H * .3 }, { x: lx[1], y: H * .5 }, { x: lx[1], y: H * .7 }, { x: lx[1], y: H * .9 }],
        [{ x: lx[2], y: H * .35 }, { x: lx[2], y: H * .65 }],
      ];

      npos[0].forEach((n1, i1) => npos[1].forEach((n2, i2) => {
        const g = (this.neuronSpikes[i1] + this.neuronSpikes[4 + i2]) / 2;
        ctx.strokeStyle = `rgba(67,97,238,${.06 + g * .42})`; ctx.lineWidth = .6 + g * 1.9;
        ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.stroke();
      }));
      npos[1].forEach((n1, i1) => npos[2].forEach((n2, i2) => {
        const g = (this.neuronSpikes[4 + i1] + this.neuronSpikes[9 + i2]) / 2;
        ctx.strokeStyle = `rgba(67,97,238,${.06 + g * .42})`; ctx.lineWidth = .6 + g * 1.9;
        ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.stroke();
      }));

      const drawNode = (n, col, sp) => {
        if (sp > 0.08) {
          ctx.strokeStyle = col; ctx.lineWidth = 1;
          ctx.shadowBlur = sp * 15; ctx.shadowColor = col;
          ctx.beginPath(); ctx.arc(n.x, n.y, nr + sp * nr * 2.5, 0, Math.PI * 2); ctx.stroke();
          ctx.shadowBlur = 0;
        }
        ctx.fillStyle = col; ctx.globalAlpha = .25 + sp * .75;
        ctx.shadowBlur = sp * 9; ctx.shadowColor = col;
        ctx.beginPath(); ctx.arc(n.x, n.y, nr, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      };
      npos[0].forEach((n, i) => drawNode(n, '#38b6ff', this.neuronSpikes[i]));
      npos[1].forEach((n, i) => drawNode(n, '#a855f7', this.neuronSpikes[4 + i]));
      npos[2].forEach((n, i) => drawNode(n, i === 0 ? '#22d4a0' : '#ff4f64', this.neuronSpikes[9 + i]));

      ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.font = `${Math.round(H * .15)}px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ['IN', 'H', 'OUT'].forEach((l, i) => ctx.fillText(l, lx[i], H)); ctx.textBaseline = 'alphabetic';
    }

    _drawScore() {
      const c = this.sC.score; if (!c || !c.width) return;
      const ctx = c.getContext('2d'), W = c.width, H = c.height;
      ctx.fillStyle = 'rgba(20,31,53,0.93)'; ctx.fillRect(0, 0, W, H);
      const s = this.displayScore, cx = W / 2, cy = H * .52;
      const r = Math.min(cx * .82, cy * .9);
      const col = s < .4 ? '#22d4a0' : s < .65 ? '#ffa94d' : '#ff4f64';
      ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = r * .3;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = r * .27; ctx.lineCap = 'round';
      ctx.shadowBlur = 10; ctx.shadowColor = col;
      ctx.beginPath(); ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + s * Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineCap = 'butt';
      ctx.fillStyle = col; ctx.font = `900 ${Math.round(H * .28)}px 'JetBrains Mono',monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.toFixed(2), cx, cy); ctx.textBaseline = 'alphabetic';
    }

    _drawMain() {
      const { ctx, canvas: cv } = this, W = cv.width, H = cv.height, m = 5;
      const col = this.mode === 'normal' ? '#22d4a0' : '#ff4f64';
      ctx.fillStyle = 'rgba(20,31,53,0.88)'; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,.04)'; ctx.lineWidth = 1;
      for (let y = 0; y <= H; y += H / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      for (let x = 0; x < W; x += Math.round(W / 10)) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.shadowBlur = 7; ctx.shadowColor = col;
      ctx.beginPath();
      this.buf.forEach((v, i) => { const x = i, y = H - m - v * (H - m * 2); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
      ctx.stroke(); ctx.restore();
      this.peakMarkers.forEach((p) => {
        const idx = this.buf.length - 1 - p.age; if (idx < 0) return;
        const alpha = Math.max(0, 1 - p.age / (this.buf.length * .6));
        ctx.save(); ctx.fillStyle = `rgba(255,79,100,${alpha})`; ctx.shadowBlur = 8; ctx.shadowColor = '#ff4f64';
        ctx.beginPath(); ctx.arc(idx, H - m - this.buf[idx] * (H - m * 2), 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(W - 2, 0); ctx.lineTo(W - 2, H); ctx.stroke(); ctx.restore();
    }

    _updateScoreBar() {
      this.displayScore += (this.targetScore - this.displayScore) * .035;
      const s = this.displayScore;
      const fill = document.getElementById('scoreFill'), label = document.getElementById('scoreLabel'), num = document.getElementById('scoreNum');
      if (fill) {
        fill.style.width = (s * 100) + '%';
        fill.style.background = s < .4 ? 'linear-gradient(90deg,#22d4a0,#38b6ff)' : s < .65 ? 'linear-gradient(90deg,#ffa94d,#ff7a3d)' : 'linear-gradient(90deg,#ff7a3d,#ff4f64)';
        fill.style.boxShadow = s < .4 ? '0 0 8px rgba(34,212,160,.45)' : s < .65 ? '0 0 8px rgba(255,169,77,.45)' : '0 0 8px rgba(255,79,100,.5)';
      }
      if (label) {
        if (s < .4) { label.textContent = '\u2713 Sinus Rhythm';   label.style.color = '#22d4a0'; }
        else if (s < .65) { label.textContent = '\u26A0 Borderline'; label.style.color = '#ffa94d'; }
        else { label.textContent = '\u2717 AFib Onset';              label.style.color = '#ff4f64'; }
      }
      if (num) { num.textContent = s.toFixed(3); num.style.color = s < .4 ? '#22d4a0' : s < .65 ? '#ffa94d' : '#ff4f64'; }
    }

    _checkMode(rDt) {
      this.modeRealSec += rDt;
      if (this.modeRealSec < this.MODE_DUR) return;
      this.modeRealSec = 0;
      this.mode = this.mode === 'normal' ? 'afib' : 'normal';
      this._afibSched = null;
      this.targetScore = this.mode === 'normal' ? .10 : .83;
      const badge = document.getElementById('modeBadge');
      const modeT = this.slide.querySelector('.pipe-mode-text');
      if (badge) { badge.textContent = this.mode === 'normal' ? 'NORMAL SR' : 'AFib'; badge.className = 'mode-badge ' + (this.mode === 'normal' ? 'sr' : 'af'); }
      if (modeT) { modeT.textContent = this.mode === 'normal' ? '\u25CF Sinus Rhythm' : '\u25CF AFib'; modeT.style.color = this.mode === 'normal' ? '#22d4a0' : '#ff4f64'; }
    }

    _flash(id) { const el = document.getElementById(id); if (!el) return; el.classList.add('active', 'flash'); setTimeout(() => el.classList.remove('flash'), 400); }
    _setVal(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }

    _loop() {
      if (!this.running) return;
      const now = performance.now();
      const rDt = Math.min((now - this._lastReal) / 1000, .05);
      this._lastReal = now;

      this.t += rDt * this.speed;
      const sample = this._ppg(this.t);
      this.buf.push(sample);  this.buf.shift();
      this.sBuf.push(sample); this.sBuf.shift();

      this.peakMarkers.forEach((p) => p.age++);
      this.peakMarkers = this.peakMarkers.filter((p) => p.age < this.buf.length);
      this.peakRipples.forEach((r) => r.age++);
      this.peakRipples = this.peakRipples.filter((r) => r.age <= r.maxAge);

      const psCap = document.getElementById('ps-capture'); if (psCap) psCap.classList.add('active');
      this._detectPeak(sample);

      const hSvg = this.slide.querySelector('.heart-svg');
      if (hSvg) hSvg.style.transform = `scale(${1 + Math.max(0, sample - .5) * .3})`;
      const hBpm = document.getElementById('heartBpm');
      if (hBpm) hBpm.textContent = `${this.lastBPM} BPM`;

      this._drawMain();
      this._drawCapture();
      this._drawPeak();
      this._drawRR();
      this._drawNorm();
      this._drawModel();
      this._drawScore();
      this._updateScoreBar();
      this._checkMode(rDt);

      requestAnimationFrame(() => this._loop());
    }
  }

  /* ----------------------------------------------------------
     GSAP entrance — runs immediately on page load (no observer).
     Slide-specific extras are unchanged from the original.
     ---------------------------------------------------------- */
  function initGSAP() {
    const reveal     = Array.from(document.querySelectorAll('.reveal'));
    const revealLeft = Array.from(document.querySelectorAll('.reveal-left'));

    if (typeof gsap === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      [...reveal, ...revealLeft].forEach((el) => {
        el.style.opacity   = '1';
        el.style.transform = 'none';
      });
      return;
    }

    const EASE = 'power3.out';
    const DUR  = 0.65;
    const STAG = 0.09;

    document.querySelectorAll('.slide').forEach((slide) => _animateSlide(slide));

    function _animateSlide(slide) {
      const up   = Array.from(slide.querySelectorAll('.reveal'));
      const left = Array.from(slide.querySelectorAll('.reveal-left'));
      const tl   = gsap.timeline({ defaults: { ease: EASE, duration: DUR } });

      if (up.length)   tl.to(up,   { opacity: 1, y: 0, stagger: STAG });
      if (left.length) tl.to(left, { opacity: 1, x: 0, stagger: STAG }, '<+0.05');

      slide.querySelectorAll('[data-target]').forEach((el) => {
        const raw   = el.textContent.trim();
        const match = raw.match(/^([^0-9]*)([\d.]+)(.*)$/);
        if (!match) return;
        const prefix = match[1];
        const target = parseFloat(match[2]);
        const sfx    = match[3];
        const isInt  = Number.isInteger(target);
        const proxy  = { val: 0 };
        tl.to(proxy, {
          val      : target,
          duration : 1.4,
          ease     : 'power2.out',
          snap     : isInt ? { val: 1 } : undefined,
          onUpdate() {
            el.textContent = prefix + (isInt ? Math.round(proxy.val) : proxy.val.toFixed(1)) + sfx;
          },
        }, '<+0.25');
      });

      _slideExtras(slide, tl);
    }

    function _slideExtras(slide, tl) {
      const bars = Array.from(slide.querySelectorAll('.rm-bar'));
      if (bars.length) {
        gsap.set(bars, { scaleY: 0, transformOrigin: '50% 100%' });
        tl.to(bars, { scaleY: 1, duration: 0.5, stagger: 0.13, ease: 'back.out(1.5)' }, '<+0.15');
      }

      const progFills = Array.from(slide.querySelectorAll('.rm-prog-fill'));
      if (progFills.length) {
        tl.to(progFills, {
          width   : (i, el) => (el.dataset.pct || 0) + '%',
          duration: 0.9,
          stagger : 0.14,
          ease    : 'power2.out',
        }, '<+0.2');
      }

      const sparkBars = Array.from(slide.querySelectorAll('.sc-spark-bar'));
      if (sparkBars.length) {
        tl.to(sparkBars, {
          scaleY  : 1,
          duration: 0.55,
          stagger : { each: 0.05, from: 'start' },
          ease    : 'power2.out',
        }, '<+0.1');
      }

      const pipeBoxes = Array.from(slide.querySelectorAll('.pb'));
      if (pipeBoxes.length) {
        gsap.set(pipeBoxes, { opacity: 0, y: 14 });
        tl.to(pipeBoxes, { opacity: 1, y: 0, duration: 0.45, stagger: 0.1, ease: EASE }, '<+0.05');
      }

      const srDots = Array.from(slide.querySelectorAll('.axis-vis g:nth-of-type(1) circle'));
      const afDots = Array.from(slide.querySelectorAll('.axis-vis g:nth-of-type(2) circle'));
      if (srDots.length) {
        gsap.set(srDots, { opacity: 0, scale: 0.15, svgOrigin: '112 60' });
        tl.to(srDots, { opacity: 1, scale: 1, duration: 0.55, stagger: 0.06, ease: 'back.out(1.8)' }, '<+0.3');
      }
      if (afDots.length) {
        gsap.set(afDots, { opacity: 0, scale: 0.15, svgOrigin: '527 60' });
        tl.to(afDots, { opacity: 1, scale: 1, duration: 0.55, stagger: 0.06, ease: 'back.out(1.8)' }, '<');
      }

      const checks = Array.from(slide.querySelectorAll('.ci-check'));
      if (checks.length) {
        gsap.set(checks, { scale: 0, opacity: 0 });
        tl.to(checks, { scale: 1, opacity: 1, duration: 0.42, stagger: 0.12, ease: 'back.out(2.2)' }, '<+0.25');
      }

      const statNums = Array.from(slide.querySelectorAll('.sc-num'));
      if (statNums.length && !statNums[0].hasAttribute('data-target')) {
        gsap.set(statNums, { scale: 0.6, opacity: 0 });
        tl.to(statNums, { scale: 1, opacity: 1, duration: 0.5, stagger: 0.12, ease: 'back.out(1.7)' }, '<+0.2');
      }

      const edgeIcons = Array.from(slide.querySelectorAll('.edge-icon'));
      if (edgeIcons.length) {
        gsap.set(edgeIcons, { scale: 0, opacity: 0 });
        tl.to(edgeIcons, { scale: 1, opacity: 1, duration: 0.4, stagger: 0.07, ease: 'back.out(2)' }, '<+0.1');
      }

      const metricVals = Array.from(slide.querySelectorAll('.rm-val[data-target]'));
      metricVals.forEach((el) => {
        const target = parseFloat(el.getAttribute('data-target'));
        const small  = el.querySelector('small');
        const smallHtml = small ? small.outerHTML : '';
        const proxy  = { val: 0.5 };
        tl.to(proxy, {
          val: target, duration: 1.2, ease: 'power2.out',
          onUpdate() { el.innerHTML = proxy.val.toFixed(3) + ' ' + smallHtml; },
        }, '<+0.1');
      });

      const stepNums = Array.from(slide.querySelectorAll('.sn'));
      if (stepNums.length) {
        gsap.set(stepNums, { x: -20, opacity: 0 });
        tl.to(stepNums, { x: 0, opacity: 1, duration: 0.4, stagger: 0.12, ease: 'power3.out' }, '<+0.15');
      }
    }
  }

  /* ----------------------------------------------------------
     Boot
     ---------------------------------------------------------- */
  new InlineEditor();
  new PipelineAnimation();
  initGSAP();
})();
