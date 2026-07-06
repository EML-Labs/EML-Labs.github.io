/* EML Labs, results charts (Chart.js). Theme-aware; rebuilds on theme change. */
(function () {
  if (typeof Chart === 'undefined') return;

  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const instances = [];

  function palette() {
    return {
      accent: css('--accent') || '#2f5d8a',
      muted: css('--text-dim') || '#8a94a2',
      text: css('--text-soft') || '#5a6675',
      grid: css('--border') || '#e6e8ec',
      panel: css('--panel') || '#ffffff',
    };
  }

  function baseOptions(p, opts) {
    return Object.assign({
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900, easing: 'easeOutQuart' },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: p.panel,
          titleColor: p.text,
          bodyColor: p.text,
          borderColor: p.grid,
          borderWidth: 1,
          padding: 10,
          displayColors: false,
          titleFont: { family: 'Inter', weight: '600' },
          bodyFont: { family: 'Inter' },
        },
      },
      scales: {
        x: {
          min: opts.min, max: opts.max,
          ticks: { color: p.text, font: { family: 'Inter', size: 12 } },
          grid: { color: p.grid, drawBorder: false },
        },
        y: {
          ticks: { color: p.text, font: { family: 'Inter', size: 13 } },
          grid: { display: false, drawBorder: false },
        },
      },
    }, opts.extra || {});
  }

  function makeLossAuroc(el, p) {
    const std = [0.005, 0.007, 0.012];
    return new Chart(el, {
      type: 'bar',
      data: {
        labels: ['Patient-aware (ours)', 'Supervised contrastive', 'Binary cross-entropy'],
        datasets: [{
          label: 'AUROC',
          data: [0.991, 0.986, 0.980],
          backgroundColor: [p.accent, p.muted, p.muted],
          borderRadius: 5,
          barThickness: 30,
        }],
      },
      options: baseOptions(p, {
        min: 0.972, max: 0.995,
        extra: { plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (c) => 'AUROC: ' + c.parsed.x.toFixed(3) + ' ± ' + std[c.dataIndex].toFixed(3) } } } },
      }),
    });
  }

  function makeCohesion(el, p) {
    return new Chart(el, {
      type: 'bar',
      data: {
        labels: ['Patient-aware (ours)', 'Supervised contrastive', 'Binary cross-entropy'],
        datasets: [{
          label: 'Per-patient SR cohesion',
          data: [0.850, 0.800, 0.772],
          backgroundColor: [p.accent, p.muted, p.muted],
          borderRadius: 5,
          barThickness: 30,
        }],
      },
      options: baseOptions(p, {
        min: 0.70, max: 0.88,
        extra: { plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (c) => 'Cohesion: ' + c.parsed.x.toFixed(3) } } } },
      }),
    });
  }

  function makeAuroc(el, p, inDomain) {
    return new Chart(el, {
      type: 'bar',
      data: {
        labels: ['IRIDIA-AF (in-domain)', 'SHDB-AF (zero-shot)'],
        datasets: [{
          label: 'AUROC',
          data: [inDomain, 0.955],
          backgroundColor: [p.accent, p.accent],
          borderRadius: 5,
          barThickness: 34,
        }],
      },
      options: baseOptions(p, {
        min: 0.90, max: 1.0,
        extra: { plugins: { legend: { display: false },
          tooltip: { callbacks: { label: (c) => 'AUROC: ' + c.parsed.x.toFixed(3) } } } },
      }),
    });
  }

  function build() {
    while (instances.length) instances.pop().destroy();
    const p = palette();

    const lossAuroc = document.getElementById('chart-loss-auroc');
    if (lossAuroc) instances.push(makeLossAuroc(lossAuroc, p));

    const cohesion = document.getElementById('chart-cohesion');
    if (cohesion) instances.push(makeCohesion(cohesion, p));

    // AUROC-by-dataset chart (50-seed MERCon in-domain 0.991), on results + home.
    ['chart-auroc', 'chart-home-auroc'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) instances.push(makeAuroc(el, p, 0.991));
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
  window.addEventListener('themechange', build);
})();
