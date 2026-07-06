/* EML Labs, AUROC distribution across 50 seeds (MERCon exp1_auroc.csv).
   Animated box + strip plot on a custom canvas; theme-aware; animates on scroll-in. */
(function () {
  "use strict";
  const DATA = {
    pacl: [0.9951,0.9959,0.9826,0.9848,0.992,0.9936,0.9924,0.9911,0.9884,0.9883,0.9913,0.9868,0.9857,0.9831,0.9933,0.9951,0.9819,0.9853,0.9932,0.9941,0.9895,0.9966,0.9958,0.9938,0.9951,0.9779,0.9913,0.9921,0.996,0.9956,0.9935,0.9882,0.9908,0.9889,0.9944,0.996,0.9902,0.988,0.9902,0.994,0.997,0.9793,0.9894,0.993,0.9942,0.9861,0.9965,0.9926,0.993,0.9928],
    supcon: [0.9731,0.9871,0.9767,0.9875,0.9785,0.9838,0.988,0.9752,0.9957,0.9886,0.9915,0.9853,0.9928,0.9875,0.9815,0.9903,0.9809,0.988,0.9906,0.9927,0.9874,0.99,0.9955,0.9871,0.99,0.9664,0.9939,0.9965,0.9876,0.9933,0.9766,0.9815,0.9838,0.9699,0.981,0.9792,0.9748,0.9847,0.9921,0.9953,0.9852,0.9746,0.9864,0.9788,0.9866,0.9888,0.9973,0.9734,0.991,0.9941],
    bce: [0.9671,0.9818,0.9885,0.9908,0.9868,0.9827,0.9794,0.9772,0.9888,0.9828,0.9946,0.9509,0.9516,0.9767,0.9829,0.9864,0.9834,0.9764,0.9849,0.9754,0.9856,0.9704,0.974,0.9887,0.9956,0.9621,0.9753,0.9978,0.9628,0.9721,0.9623,0.9913,0.9872,0.9706,0.9807,0.9936,0.9891,0.9752,0.9581,0.9942,0.9802,0.9675,0.9834,0.9853,0.9922,0.9935,0.9942,0.966,0.9736,0.9858],
  };
  const ORDER = [
    { key: "pacl", label: ["Patient-aware", "(ours)"], accent: true },
    { key: "supcon", label: ["Supervised", "contrastive"] },
    { key: "bce", label: ["Binary", "cross-entropy"] },
  ];
  const cv = document.getElementById("loss-dist");
  if (!cv) return;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  function stats(a) {
    a = [...a].sort((x, y) => x - y);
    const q = (p) => { const i = (a.length - 1) * p, lo = Math.floor(i); return lo === i ? a[lo] : a[lo] + (a[lo + 1] - a[lo]) * (i - lo); };
    return { min: a[0], max: a[a.length - 1], q1: q(0.25), med: q(0.5), q3: q(0.75), mean: a.reduce((s, x) => s + x, 0) / a.length };
  }
  const S = ORDER.map(o => ({ ...o, s: stats(DATA[o.key]), pts: DATA[o.key] }));
  const YMIN = 0.95, YMAX = 1.0;

  function draw(prog) {
    const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const padL = 46, padR = 14, padT = 12, padB = 50, plotH = H - padT - padB, plotW = W - padL - padR;
    const accent = css("--accent") || "#2f5d8a", muted = css("--text-dim") || "#8a94a2", text = css("--text-soft") || "#5a6675", grid = css("--border") || "#e6e8ec", panel = css("--panel") || "#fff";
    const Y = (v) => padT + plotH * (1 - (v - YMIN) / (YMAX - YMIN));

    ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.fillStyle = muted; ctx.font = "11px Inter, sans-serif"; ctx.textAlign = "right";
    for (let v = 0.95; v <= 1.0001; v += 0.01) { const y = Y(v); ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke(); ctx.globalAlpha = 1; ctx.fillText(v.toFixed(2), padL - 8, y + 3); }

    const colW = plotW / S.length;
    S.forEach((d, i) => {
      const cx = padL + colW * (i + 0.5), col = d.accent ? accent : muted, boxW = Math.min(64, colW * 0.42), s = d.s, p = prog;
      const med = Y(s.med), q1 = Y(s.q1), q3 = Y(s.q3), mn = Y(s.min), mx = Y(s.max), mean = Y(s.mean);
      // whiskers
      ctx.strokeStyle = col; ctx.globalAlpha = 0.45 * p; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx, mx); ctx.lineTo(cx, mn); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx - 7, mx); ctx.lineTo(cx + 7, mx); ctx.moveTo(cx - 7, mn); ctx.lineTo(cx + 7, mn); ctx.stroke();
      // seed points (deterministic jitter, fade in)
      ctx.globalAlpha = 0.4 * p; ctx.fillStyle = col;
      d.pts.forEach((v, k) => { const jx = cx + (((k * 53) % 100) / 100 - 0.5) * boxW * 1.25; ctx.beginPath(); ctx.arc(jx, Y(v), 1.7, 0, 7); ctx.fill(); });
      // box (grows from median)
      const topY = med + (q3 - med) * p, botY = med + (q1 - med) * p;
      ctx.globalAlpha = 0.16 * p; ctx.fillStyle = col; ctx.fillRect(cx - boxW / 2, topY, boxW, botY - topY);
      ctx.globalAlpha = p; ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.strokeRect(cx - boxW / 2, topY, boxW, botY - topY);
      // median
      ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(cx - boxW / 2, med); ctx.lineTo(cx + boxW / 2, med); ctx.stroke();
      // mean diamond
      ctx.globalAlpha = p; ctx.fillStyle = panel; ctx.strokeStyle = col; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(cx, mean - 4); ctx.lineTo(cx + 4, mean); ctx.lineTo(cx, mean + 4); ctx.lineTo(cx - 4, mean); ctx.closePath(); ctx.fill(); ctx.stroke();
      // x labels (two lines)
      ctx.globalAlpha = 1; ctx.fillStyle = d.accent ? accent : text; ctx.textAlign = "center"; ctx.font = (d.accent ? "600 " : "") + "12px Inter, sans-serif";
      d.label.forEach((ln, li) => ctx.fillText(ln, cx, H - padB + 18 + li * 15));
    });
  }

  let last = 1;
  function animateIn() { const t0 = performance.now(), dur = 850; (function step(now) { const p = Math.min((now - t0) / dur, 1); last = 1 - Math.pow(1 - p, 3); draw(last); if (p < 1) requestAnimationFrame(step); })(t0); }
  window.addEventListener("themechange", () => draw(last));
  window.addEventListener("resize", () => draw(last));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  requestAnimationFrame(() => draw(1));   // initial paint so it is never blank
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => es.forEach(e => { if (e.isIntersecting) { animateIn(); io.disconnect(); } }), { threshold: 0.25 });
    io.observe(cv);
  }
})();
