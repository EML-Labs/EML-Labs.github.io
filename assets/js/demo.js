/* EML Labs, interactive in-browser model demo.
   Hand-written f32 forward pass of the patient-aware encoder (no ML runtime),
   centroid-based scoring (no classifier), live views + ablation. */
(function () {
  "use strict";

  const SR_COLOR = "#3a9d78", AF_COLOR = "#d15b6b";
  let M = null;                          // loaded demo_model.json
  const state = {
    rr: null, source: "",                // current window + label of its source
    branches: [true, true, true],
    pool: "attention",                   // "attention" | "average"
    noise: 0,
  };

  const $ = (id) => document.getElementById(id);
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------------- math / nn ops ---------------- */
  function conv1d(x, W, b, stride, pad) {
    const Cin = x.length, Lin = x[0].length, Cout = W.length, k = W[0][0].length;
    const Lout = Math.floor((Lin + 2 * pad - k) / stride) + 1;
    const out = new Array(Cout);
    for (let co = 0; co < Cout; co++) {
      const o = new Float64Array(Lout), Wco = W[co], bias = b[co];
      for (let t = 0; t < Lout; t++) {
        let acc = bias; const start = t * stride - pad;
        for (let ci = 0; ci < Cin; ci++) {
          const xi = x[ci], w = Wco[ci];
          for (let j = 0; j < k; j++) { const p = start + j; if (p >= 0 && p < Lin) acc += w[j] * xi[p]; }
        }
        o[t] = acc;
      }
      out[co] = o;
    }
    return out;
  }
  function groupNorm(x, groups, gamma, beta, eps) {
    const C = x.length, L = x[0].length, cpg = C / groups;
    for (let g = 0; g < groups; g++) {
      let sum = 0, n = cpg * L; const c0 = g * cpg;
      for (let c = c0; c < c0 + cpg; c++) { const xc = x[c]; for (let t = 0; t < L; t++) sum += xc[t]; }
      const mean = sum / n; let v = 0;
      for (let c = c0; c < c0 + cpg; c++) { const xc = x[c]; for (let t = 0; t < L; t++) { const d = xc[t] - mean; v += d * d; } }
      const inv = 1 / Math.sqrt(v / n + eps);
      for (let c = c0; c < c0 + cpg; c++) { const xc = x[c], ga = gamma[c], be = beta[c]; for (let t = 0; t < L; t++) xc[t] = (xc[t] - mean) * inv * ga + be; }
    }
    return x;
  }
  function relu(x) { for (const c of x) for (let t = 0; t < c.length; t++) if (c[t] < 0) c[t] = 0; return x; }
  function branchForward(rr, br) {
    let x = [Float64Array.from(rr)];
    const pad = (br.kernel - 1) / 2;
    for (const ly of br.layers) { x = conv1d(x, ly.conv.w, ly.conv.b, 2, pad); groupNorm(x, 8, ly.gn.w, ly.gn.b, 1e-5); relu(x); }
    return x; // [64, 25]
  }

  /* full forward → { pt, cosSR, cosAF, latent, attention[25], x2d, y2d } */
  function forward(rr) {
    const enc = M.encoder;
    // 3 branches (respect ablation: disabled branch contributes zeros)
    let feats = [];
    for (let bi = 0; bi < 3; bi++) {
      const out = state.branches[bi] ? branchForward(rr, enc.branches[bi])
        : Array.from({ length: 64 }, () => new Float64Array(M.meta.L));
      feats = feats.concat(out);
    }                                       // [192, 25]
    let x = conv1d(feats, enc.channel_mix.conv.w, enc.channel_mix.conv.b, 1, 0);
    groupNorm(x, 8, enc.channel_mix.gn.w, enc.channel_mix.gn.b, 1e-5); relu(x);
    const L = x[0].length;
    // attention scores → weights
    const scores = conv1d(x, enc.attention.conv.w, enc.attention.conv.b, 1, 0)[0];
    let w;
    if (state.pool === "average") { w = new Float64Array(L).fill(1 / L); }
    else {
      let mx = -Infinity; for (let t = 0; t < L; t++) if (scores[t] > mx) mx = scores[t];
      let s = 0; w = new Float64Array(L);
      for (let t = 0; t < L; t++) { w[t] = Math.exp(scores[t] - mx); s += w[t]; }
      for (let t = 0; t < L; t++) w[t] /= s;
    }
    const pooled = new Float64Array(192);
    for (let c = 0; c < 192; c++) { let acc = 0; const xc = x[c]; for (let t = 0; t < L; t++) acc += xc[t] * w[t]; pooled[c] = acc; }
    // proj + L2 norm
    const pw = enc.proj.w, pb = enc.proj.b, D = pb.length, z = new Float64Array(D);
    let nrm = 0;
    for (let o = 0; o < D; o++) { let acc = pb[o]; const wo = pw[o]; for (let i = 0; i < 192; i++) acc += wo[i] * pooled[i]; z[o] = acc; nrm += acc * acc; }
    nrm = Math.sqrt(nrm); for (let o = 0; o < D; o++) z[o] /= nrm;
    // scoring against centroids
    const c = M.centroids, lv = M.latent_view;
    const musr = c.mu_sr, muaf = c.mu_af, len = c.axis_len;
    let dotU = 0, dot2 = 0, cs = 0, ca = 0, nz = 0, ns = 0, na = 0;
    for (let o = 0; o < D; o++) {
      const dsr = z[o] - musr[o];
      dotU += dsr * lv.dir1[o]; dot2 += dsr * lv.dir2[o];
      cs += z[o] * musr[o]; ca += z[o] * muaf[o];
      nz += z[o] * z[o]; ns += musr[o] * musr[o]; na += muaf[o] * muaf[o];
    }
    const pt = dotU / len;
    return { pt, x2d: pt, y2d: dot2, cosSR: cs / Math.sqrt(nz * ns), cosAF: ca / Math.sqrt(nz * na), attention: w, latent: z };
  }

  /* ---------------- synthetic generator ---------------- */
  function synth(kind) {
    const N = M.meta.window_size, rr = new Float64Array(N);
    if (kind === "SR") { let v = 0; for (let i = 0; i < N; i++) { v = 0.82 * v + 0.25 * gauss(); rr[i] = v; } }
    else { for (let i = 0; i < N; i++) { rr[i] = 1.05 * gauss() + (Math.random() < 0.12 ? (Math.random() * 3 - 1.5) : 0); } }
    return rr;
  }
  let spare = null;
  function gauss() { if (spare !== null) { const s = spare; spare = null; return s; } let u = 0, v = 0, s = 0; do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s >= 1 || s === 0); const m = Math.sqrt(-2 * Math.log(s) / s); spare = v * m; return u * m; }
  function withNoise(rr) { if (!state.noise) return rr; const o = Float64Array.from(rr); for (let i = 0; i < o.length; i++) o[i] += state.noise * gauss(); return o; }

  /* ---------------- canvas helpers ---------------- */
  function ctxOf(cv) {
    const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h); return { ctx, w, h };
  }
  const lerp = (a, b, t) => a + (b - a) * t;

  function drawTachogram(rr, att) {
    const cv = $("cv-tacho"); if (!cv) return; const { ctx, w, h } = ctxOf(cv);
    const N = rr.length, pad = 8; let mn = Infinity, mx = -Infinity;
    for (const v of rr) { if (v < mn) mn = v; if (v > mx) mx = v; } if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
    const X = (i) => pad + (w - 2 * pad) * i / (N - 1);
    const Y = (v) => pad + (h - 2 * pad) * (1 - (v - mn) / (mx - mn));
    const ds = M.meta.downsample;
    // attention heat bands
    let amx = 0; for (const a of att) if (a > amx) amx = a;
    for (let s = 0; s < att.length; s++) {
      const x0 = X(Math.min(s * ds, N - 1)), x1 = X(Math.min((s + 1) * ds, N - 1));
      ctx.fillStyle = `rgba(47,93,138,${0.05 + 0.6 * (att[s] / amx)})`;
      ctx.fillRect(x0, pad, x1 - x0, h - 2 * pad);
    }
    // line
    ctx.strokeStyle = cssVar("--accent") || "#2f5d8a"; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < N; i++) { const x = X(i), y = Y(rr[i]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }

  function drawPoincare(rr) {
    const cv = $("cv-poincare"); if (!cv) return; const { ctx, w, h } = ctxOf(cv);
    const N = rr.length, pad = 10; let mn = Infinity, mx = -Infinity;
    for (const v of rr) { if (v < mn) mn = v; if (v > mx) mx = v; } if (mx - mn < 1e-6) { mx += 1; mn -= 1; }
    const S = Math.min(w, h) - 2 * pad, ox = (w - S) / 2, oy = (h - S) / 2;
    const P = (v) => (v - mn) / (mx - mn);
    // identity line
    ctx.strokeStyle = cssVar("--border") || "#e6e8ec"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ox, oy + S); ctx.lineTo(ox + S, oy); ctx.stroke();
    ctx.fillStyle = (state.source === "AF") ? AF_COLOR : (state.source === "SR" ? SR_COLOR : (cssVar("--accent") || "#2f5d8a"));
    for (let i = 0; i < N - 1; i++) {
      const x = ox + S * P(rr[i]), y = oy + S * (1 - P(rr[i + 1]));
      ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawLatent(res) {
    const cv = $("cv-latent"); if (!cv) return; const { ctx, w, h } = ctxOf(cv);
    const lv = M.latent_view, cloud = lv.cloud, pad = 16;
    let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
    for (const p of cloud) { if (p.x < mnx) mnx = p.x; if (p.x > mxx) mxx = p.x; if (p.y < mny) mny = p.y; if (p.y > mxy) mxy = p.y; }
    mnx = Math.min(mnx, -0.15, res.x2d); mxx = Math.max(mxx, 1.15, res.x2d);
    mny = Math.min(mny, res.y2d); mxy = Math.max(mxy, res.y2d);
    const X = (x) => pad + (w - 2 * pad) * (x - mnx) / (mxx - mnx);
    const Y = (y) => pad + (h - 2 * pad) * (1 - (y - mny) / (mxy - mny));
    // axis SR->AF
    ctx.strokeStyle = cssVar("--border-strong") || "#d3d7de"; ctx.lineWidth = 1.5; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(X(lv.mu_sr_2d[0]), Y(lv.mu_sr_2d[1])); ctx.lineTo(X(lv.mu_af_2d[0]), Y(lv.mu_af_2d[1])); ctx.stroke(); ctx.setLineDash([]);
    // cloud
    for (const p of cloud) { ctx.globalAlpha = 0.32; ctx.fillStyle = p.l ? AF_COLOR : SR_COLOR; ctx.beginPath(); ctx.arc(X(p.x), Y(p.y), 2.6, 0, 7); ctx.fill(); }
    ctx.globalAlpha = 1;
    // centroids
    for (const [c2, col, lab] of [[lv.mu_sr_2d, SR_COLOR, "SR"], [lv.mu_af_2d, AF_COLOR, "AF"]]) {
      ctx.fillStyle = col; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(c2[0]), Y(c2[1]), 7, 0, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = cssVar("--text-soft") || "#5a6675"; ctx.font = "600 12px Inter, sans-serif";
      ctx.fillText("μ " + lab, X(c2[0]) - 10, Y(c2[1]) - 12);
    }
    // query point
    const qx = X(res.x2d), qy = Y(res.y2d);
    ctx.fillStyle = cssVar("--accent") || "#2f5d8a"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(qx, qy, 8, 0, 7); ctx.fill(); ctx.stroke();
  }

  function renderScore(res) {
    const pt = res.pt, clamped = Math.max(0, Math.min(1, pt));
    $("gauge-marker").style.left = (clamped * 100) + "%";
    $("gauge-val").textContent = pt.toFixed(3);
    const isAF = pt >= 0.5;
    const badge = $("pred-badge");
    badge.textContent = isAF ? "AF" : "SR";
    badge.className = "demo-pred " + (isAF ? "is-af" : "is-sr");
    $("cos-sr").textContent = res.cosSR.toFixed(3);
    $("cos-af").textContent = res.cosAF.toFixed(3);
  }

  /* ---------------- run + wire ---------------- */
  let raf = 0;
  function run() {
    if (!M || !state.rr) return;
    const rr = withNoise(state.rr);
    const res = forward(rr);
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => { drawTachogram(rr, res.attention); drawPoincare(rr); drawLatent(res); renderScore(res); });
  }

  function setWindow(rr, source) { state.rr = rr; state.source = source || ""; run(); }

  function buildPresets() {
    const wrap = $("preset-chips"); if (!wrap) return;
    const srN = M.samples.filter(s => s.label === 0).length;
    M.samples.forEach((s, i) => {
      const b = document.createElement("button");
      b.className = "demo-chip"; const isAF = s.label === 1;
      const n = isAF ? (i - srN + 1) : (i + 1);
      b.innerHTML = `<i class="${isAF ? 'af' : 'sr'}"></i>${isAF ? "AF" : "SR"} #${n}`;
      b.addEventListener("click", () => { setActiveChip(b); setWindow(Float64Array.from(s.rr), isAF ? "AF" : "SR"); });
      wrap.appendChild(b);
      if (i === 0) { b.classList.add("active"); }
    });
  }
  function setActiveChip(btn) { document.querySelectorAll(".demo-chip").forEach(c => c.classList.remove("active")); if (btn) btn.classList.add("active"); }

  function fidelityCheck() {
    let worst = 0;
    for (const s of M.samples) {
      const r = forward(Float64Array.from(s.rr));
      worst = Math.max(worst, Math.abs(r.pt - s.ref_pt));
    }
    console.log("[demo] reference match, max |Δ| =", worst.toExponential(2));
  }

  function wire() {
    // branch toggles
    document.querySelectorAll("[data-branch]").forEach(btn => {
      btn.addEventListener("click", () => {
        const i = +btn.dataset.branch; state.branches[i] = !state.branches[i];
        btn.classList.toggle("off", !state.branches[i]); btn.setAttribute("aria-pressed", state.branches[i]); run();
      });
    });
    // pooling
    document.querySelectorAll("[data-pool]").forEach(btn => {
      btn.addEventListener("click", () => {
        state.pool = btn.dataset.pool;
        document.querySelectorAll("[data-pool]").forEach(b => b.classList.toggle("active", b === btn)); run();
      });
    });
    // noise
    const ns = $("noise"); if (ns) ns.addEventListener("input", () => { state.noise = +ns.value; $("noise-val").textContent = state.noise.toFixed(2); run(); });
    // synthetic
    $("gen-sr")?.addEventListener("click", () => { setActiveChip(null); setWindow(synth("SR"), "SR"); });
    $("gen-af")?.addEventListener("click", () => { setActiveChip(null); setWindow(synth("AF"), "AF"); });
    window.addEventListener("themechange", run);
    window.addEventListener("resize", run);
  }

  fetch("assets/demo/demo_model.json").then(r => r.json()).then(data => {
    M = data;
    $("stat-auroc") && ($("stat-auroc").textContent = M.meta.test_auroc_pt.toFixed(3));
    buildPresets(); wire(); fidelityCheck();
    setWindow(Float64Array.from(M.samples[0].rr), "SR");
  }).catch(e => { console.error("demo load failed", e); const s = $("demo-status"); if (s) s.textContent = "Couldn't load the demonstration data."; });
})();
