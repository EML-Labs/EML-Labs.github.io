/* EML Labs site, shared behaviour: nav injection, theme, reveal, mobile menu */
(function () {
  const PAGES = [
    { href: 'index.html', label: 'Home' },
    { href: 'research.html', label: 'Research' },
    { href: 'results.html', label: 'Results' },
    { href: 'demo.html', label: 'Demo' },
    { href: 'publications.html', label: 'Publications' },
    { href: 'team.html', label: 'Team' },
  ];

  const current = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  const heartSVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h4l2-6 4 12 2.5-7 1.5 3H22"/></svg>';

  /* ---- Nav ---- */
  const nav = document.createElement('header');
  nav.className = 'nav';
  nav.innerHTML = `
    <div class="nav-inner">
      <a class="brand" href="index.html">
        <span class="logo-mark">${heartSVG}</span>
        <span>EML&nbsp;Labs<small>AFib · Edge ML</small></span>
      </a>
      <nav class="nav-links" id="navLinks">
        ${PAGES.map(p => `<a href="${p.href}" class="${p.href === current ? 'active' : ''}">${p.label}</a>`).join('')}
      </nav>
      <div class="nav-tools">
        <button class="icon-btn" id="themeBtn" aria-label="Toggle theme">
          <svg class="theme-icon-light" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg class="theme-icon-dark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>
        </button>
        <button class="icon-btn nav-toggle" id="navToggle" aria-label="Menu">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
        </button>
      </div>
    </div>`;
  document.body.prepend(nav);

  /* ---- Footer ---- */
  const footer = document.createElement('footer');
  footer.className = 'footer';
  footer.innerHTML = `
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="brand" href="index.html" style="margin-bottom:14px">
            <span class="logo-mark">${heartSVG}</span>
            <span>EML&nbsp;Labs<small>AFib · Edge ML</small></span>
          </a>
          <p class="muted">Patient-aware machine learning for atrial fibrillation detection and early warning on resource-constrained wearable devices.</p>
          <p class="muted">Department of Computer Science &amp; Engineering,<br>University of Moratuwa, Sri Lanka.</p>
        </div>
        <div>
          <h4>Explore</h4>
          ${PAGES.map(p => `<a href="${p.href}">${p.label}</a>`).join('')}
        </div>
        <div>
          <h4>Resources</h4>
          <a href="publications.html">All publications</a>
          <a href="assets/pdf/paper.pdf" target="_blank" rel="noopener">Paper (PDF)</a>
          <a href="https://arxiv.org/abs/2606.23570" target="_blank" rel="noopener">ICML 2026 Workshop Paper</a>
          <a href="assets/pdf/final_report.pdf" target="_blank" rel="noopener">Dissertation (PDF)</a>
          <a href="https://github.com/EML-Labs/PPG-Peak-Detection-on-FPGA" target="_blank" rel="noopener">FPGA Code (GitHub)</a>
        </div>
      </div>
      <div class="footer-bottom">© ${new Date().getFullYear()} EML Labs, University of Moratuwa. Final Year Research Project.</div>
    </div>`;
  document.body.appendChild(footer);

  /* ---- Theme ---- */
  const root = document.documentElement;
  const saved = localStorage.getItem('eml-theme');
  if (saved) root.setAttribute('data-theme', saved);
  document.getElementById('themeBtn').addEventListener('click', () => {
    const isDark = root.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    localStorage.setItem('eml-theme', next);
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
  });

  /* ---- Mobile menu ---- */
  const links = document.getElementById('navLinks');
  document.getElementById('navToggle').addEventListener('click', () => links.classList.toggle('open'));
  links.querySelectorAll('a').forEach(a => a.addEventListener('click', () => links.classList.remove('open')));

  /* ---- Reveal on scroll ---- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));

  /* ---- Count-up on stat numbers ---- */
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function countUp(el) {
    const raw = el.textContent.trim();
    const m = raw.match(/^([^\d]*)(\d+(?:\.\d+)?)(.*)$/s);   // prefix, number, suffix
    if (!m) return;                                          // non-numeric (e.g. "Edge"), leave as-is
    const [, pre, numStr, suf] = m;
    const target = parseFloat(numStr);
    const decimals = (numStr.split('.')[1] || '').length;
    const dur = 1100, t0 = performance.now();
    function frame(now) {
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = pre + (target * eased).toFixed(decimals) + suf;
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = pre + target.toFixed(decimals) + suf;
    }
    requestAnimationFrame(frame);
  }
  /* ---- Patient-aware concept animation ---- */
  const pac = document.getElementById('pacStage');
  if (pac) {
    if (reduce) {
      pac.setAttribute('data-state', 'patient');
    } else {
      let s = 'global';
      setInterval(() => {
        s = s === 'global' ? 'patient' : 'global';
        pac.setAttribute('data-state', s);
      }, 3000);
    }
  }

  /* ---- Animated ECG viz (regular SR vs irregular AF) ---- */
  const ecg = document.getElementById('ecgViz');
  if (ecg) {
    const beat = (pts, x0, B, w, rH, p) => {
      const add = (fx, fy) => pts.push([+(x0 + fx * w).toFixed(1), +(B + fy * rH).toFixed(1)]);
      add(0, 0); add(0.08, 0);
      if (p) { add(0.15, -0.16); add(0.22, 0); }
      else { add(0.13, -0.05); add(0.20, 0.06); add(0.28, -0.05); add(0.35, 0.06); }
      add(0.40, 0); add(0.45, 0.12); add(0.50, -1); add(0.55, 0.30); add(0.60, 0); add(0.72, -0.16); add(0.82, 0); add(1, 0);
    };
    const dOf = (pts) => 'M' + pts.map(p => p.join(',')).join(' L');
    const sr = []; for (let x = 12; x < 428; x += 70) beat(sr, x, 95, 70, 42, true);
    const ws = [54, 80, 46, 92, 62, 74, 52], hs = [38, 32, 44, 28, 40, 34, 36];
    const af = []; for (let i = 0, xa = 12; i < ws.length && xa < 424; xa += ws[i], i++) beat(af, xa, 210, ws[i], hs[i], false);
    const set = (id, d) => { const e = document.getElementById(id); if (e) { e.setAttribute('d', d); e.setAttribute('pathLength', '100'); } };
    const dsr = dOf(sr), daf = dOf(af);
    set('ecg-sr-base', dsr); set('ecg-sr-pulse', dsr);
    set('ecg-af-base', daf); set('ecg-af-pulse', daf);
  }

  const nums = document.querySelectorAll('.stat .num');
  if (reduce || !('IntersectionObserver' in window)) {
    /* leave static */
  } else {
    const numIO = new IntersectionObserver((entries) => {
      entries.forEach(e => { if (e.isIntersecting) { countUp(e.target); numIO.unobserve(e.target); } });
    }, { threshold: 0.6 });
    nums.forEach(el => numIO.observe(el));
  }
})();
