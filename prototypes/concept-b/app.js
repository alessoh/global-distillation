/* Global Distillation — concept B app logic (ES module) */
import * as THREE from 'three';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmtNum = (v, dec = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
const money = (v) => (v < 1 ? `$${v.toFixed(v < 0.1 ? 3 : 2)}` : `$${v.toFixed(2)}`);

const C = {
  ink: css('--ink'), ink2: css('--ink-2'), ink3: css('--ink-3'), ink4: css('--ink-4'),
  line: css('--line'), lineStrong: css('--line-strong'), bg: css('--bg'), plane: css('--bg-plane'),
  accent: css('--accent'), s1: css('--series-1'), s2: css('--series-2'), s3: css('--series-3'), s4: css('--series-4'), muted: css('--series-muted'),
  sans: css('--sans'), mono: css('--mono'),
};

/* =========================================================
   DATA
   ========================================================= */
const MODELS = [
  { model: 'GPT-4o', vendor: 'OpenAI', role: 'Teacher', params: null, mmlu: 88.7, input: 2.50, output: 10.00, released: '2024-05' },
  { model: 'GPT-4o mini', vendor: 'OpenAI', role: 'Distilled', params: null, mmlu: 82.0, input: 0.15, output: 0.60, released: '2024-07' },
  { model: 'Claude 3.5 Sonnet', vendor: 'Anthropic', role: 'Teacher', params: null, mmlu: 88.3, input: 3.00, output: 15.00, released: '2024-06' },
  { model: 'Claude 3.5 Haiku', vendor: 'Anthropic', role: 'Small', params: null, mmlu: 77.6, input: 0.80, output: 4.00, released: '2024-10' },
  { model: 'Gemini 1.5 Pro', vendor: 'Google', role: 'Teacher', params: null, mmlu: 85.9, input: 1.25, output: 5.00, released: '2024-05' },
  { model: 'Gemini 1.5 Flash', vendor: 'Google', role: 'Distilled', params: null, mmlu: 78.9, input: 0.075, output: 0.30, released: '2024-05' },
  { model: 'DeepSeek-R1', vendor: 'DeepSeek', role: 'Teacher', params: 671, mmlu: 90.8, input: 0.55, output: 2.19, released: '2025-01' },
  { model: 'R1-Distill-Qwen-32B', vendor: 'DeepSeek', role: 'Distilled', params: 32, mmlu: null, input: 0.12, output: 0.18, released: '2025-01' },
  { model: 'R1-Distill-Llama-8B', vendor: 'DeepSeek', role: 'Distilled', params: 8, mmlu: null, input: 0.04, output: 0.04, released: '2025-01' },
  { model: 'Llama 3.1 405B', vendor: 'Meta', role: 'Teacher', params: 405, mmlu: 88.6, input: 3.00, output: 3.00, released: '2024-07' },
  { model: 'Llama 3.1 8B', vendor: 'Meta', role: 'Small', params: 8, mmlu: 73.0, input: 0.10, output: 0.10, released: '2024-07' },
  { model: 'Qwen2.5 72B', vendor: 'Alibaba', role: 'Teacher', params: 72.7, mmlu: 86.1, input: 0.90, output: 0.90, released: '2024-09' },
  { model: 'Qwen2.5 7B', vendor: 'Alibaba', role: 'Small', params: 7.6, mmlu: 74.2, input: 0.10, output: 0.10, released: '2024-09' },
];

const METHODS = [
  {
    id: 'logit', family: 'Response', name: 'Soft-target (logit) distillation', difficulty: 1,
    ref: 'Hinton, Vinyals & Dean · 2015', cost: '≈ 1× teacher forward per example',
    blurb: 'Match the student’s softened output distribution to the teacher’s, so the “dark knowledge” in the near-miss classes transfers too.',
    formula: '\\mathcal{L} = (1-\\alpha)\\,\\mathrm{CE}\\big(y,\\ \\sigma(z_s)\\big) + \\alpha\\, T^{2}\\, \\mathrm{KL}\\Big(\\sigma\\!\\big(\\tfrac{z_t}{T}\\big)\\ \\Big\\|\\ \\sigma\\!\\big(\\tfrac{z_s}{T}\\big)\\Big)',
    note: 'z are logits, T the temperature; T² rescales gradients so the two terms stay comparable.',
    desc: 'The original recipe. The teacher’s logits are softened with a temperature so that small probabilities become visible; the student is trained to match that distribution alongside the hard labels. Requires white-box access to teacher logits and a shared vocabulary.',
    when: 'You own both models, share a tokenizer, and want the cheapest lift in accuracy for a fixed student size.',
    students: ['DistilBERT', 'TinyBERT (final stage)', 'MobileBERT'],
  },
  {
    id: 'seqkd', family: 'Sequence', name: 'Sequence-level KD', difficulty: 2,
    ref: 'Kim & Rush · 2016', cost: '1 teacher decode per example, once',
    blurb: 'Replace the training targets with the teacher’s own greedy or beam outputs and train the student on those sequences.',
    formula: '\\mathcal{L}_{\\text{seq}} = -\\sum_{x\\in\\mathcal{D}} \\log p_s\\big(\\hat{y}\\mid x\\big),\\qquad \\hat{y}=\\arg\\max_{y}\\ p_t(y\\mid x)',
    note: 'The mode of the teacher stands in for the full distribution; it works because the mode is easier to fit than the tails.',
    desc: 'Instead of matching token-level distributions, the student imitates whole teacher outputs. This is the method behind most “distilled” LLM releases: generate a corpus with the teacher, then fine-tune the student on it. Only needs black-box sampling access.',
    when: 'The teacher is an API, or vocabularies differ, or you want a student that copies the teacher’s style and reasoning traces.',
    students: ['R1-Distill-Qwen-32B', 'R1-Distill-Llama-8B', 'Alpaca 7B', 'Orca 2'],
  },
  {
    id: 'feature', family: 'Feature', name: 'Intermediate-feature distillation', difficulty: 3,
    ref: 'Romero et al. (FitNets) · 2015 · TinyBERT · 2020', cost: '1–2× teacher forward, plus projector params',
    blurb: 'Align hidden states or attention maps layer-by-layer through a learned projector, not just the final output.',
    formula: '\\mathcal{L}_{\\text{hint}} = \\sum_{\\ell} \\big\\| W_{\\ell}\\, h^{s}_{\\ell} - h^{t}_{m(\\ell)} \\big\\|_2^{2} + \\lambda\\, \\mathrm{MSE}\\big(A^{s}_{\\ell},\\ A^{t}_{m(\\ell)}\\big)',
    note: 'm(ℓ) maps a student layer to a teacher layer; W projects the narrower student width up to the teacher’s.',
    desc: 'Rich supervision from inside the teacher: hidden representations, attention distributions, or relational structure between examples. It converges faster and reaches higher accuracy for deep, narrow students, at the cost of architectural coupling and white-box access.',
    when: 'Teacher and student share architecture families and you can afford to run the teacher during training.',
    students: ['TinyBERT', 'MiniLM', 'MobileBERT'],
  },
  {
    id: 'self', family: 'Self', name: 'Self-distillation (born-again)', difficulty: 2,
    ref: 'Furlanello et al. · 2018', cost: '2+ full training runs',
    blurb: 'Train a student with the same architecture as the teacher on the teacher’s soft labels; repeat for several generations.',
    formula: '\\theta_{k+1} = \\arg\\min_{\\theta}\\ \\mathbb{E}_{x}\\Big[\\mathrm{KL}\\big(p_{\\theta_k}(\\cdot\\mid x)\\ \\big\\|\\ p_{\\theta}(\\cdot\\mid x)\\big)\\Big]',
    note: 'Each generation θₖ₊₁ is trained from the previous one; ensembling the generations adds a little more.',
    desc: 'No compression at all. The surprising result is that a student of identical size, trained from the teacher’s soft labels, generalises better than the teacher. Later work explains it as an implicit regulariser and label smoothing on the hard examples.',
    when: 'You want a modest, cheap accuracy gain with no architecture change, or you need cleaner targets for a noisy dataset.',
    students: ['BAN-DenseNet', 'Noisy-Student EfficientNet'],
  },
  {
    id: 'onpolicy', family: 'On-policy', name: 'On-policy / generalized KD', difficulty: 4,
    ref: 'Agarwal et al. (GKD) · 2023 · Gu et al. (MiniLLM) · 2024', cost: 'Student sampling + teacher scoring, every step',
    blurb: 'Sample from the student, then let the teacher correct those samples token by token, closing the exposure-bias gap.',
    formula: '\\mathcal{L}_{\\text{GKD}} = \\mathbb{E}_{x\\sim\\mathcal{D},\\ y\\sim p_s(\\cdot\\mid x)}\\Big[\\sum_{t} D_{\\text{JSD}(\\beta)}\\big(p_t(\\cdot\\mid y_{<t},x)\\ \\big\\|\\ p_s(\\cdot\\mid y_{<t},x)\\big)\\Big]',
    note: 'Training on the student’s own trajectories means it learns to recover from its own mistakes, not the teacher’s.',
    desc: 'Off-policy sequence KD trains only on teacher-shaped prefixes. On-policy variants generate with the student, score each next-token distribution with the teacher, and minimise a divergence that can be tuned between mode-seeking and mass-covering. Reported gains are largest on summarisation and arithmetic.',
    when: 'You have white-box access to both models, a large compute budget, and the student underperforms on its own long generations.',
    students: ['Gemma 2 9B', 'Gemma 2 2B', 'Gemma 3 family'],
  },
  {
    id: 'data', family: 'Data', name: 'Synthetic-data distillation', difficulty: 1,
    ref: 'Taori et al. (Alpaca) · 2023 · Gunasekar et al. (Phi) · 2023', cost: 'Teacher API tokens, once',
    blurb: 'Use the teacher only to author a curated instruction or textbook corpus; the student is then trained on it conventionally.',
    formula: '\\mathcal{D}_{\\text{syn}} = \\big\\{(x_i,\\ y_i)\\ :\\ x_i\\sim q(x),\\ y_i\\sim p_t(\\cdot\\mid x_i)\\big\\},\\qquad \\theta_s=\\arg\\min_{\\theta}\\ \\mathcal{L}_{\\text{LM}}(\\theta;\\ \\mathcal{D}_{\\text{syn}})',
    note: 'q(x) is the prompt distribution; most of the craft is in choosing q and filtering y.',
    desc: 'The cheapest route and the one at the centre of every terms-of-service dispute. Quality depends on prompt diversity, filtering, and de-duplication far more than on the loss. Frequently combined with sequence-level KD for reasoning traces.',
    when: 'You only have API access to the teacher and need a student that follows instructions in a specific domain.',
    students: ['Alpaca 7B', 'Vicuna 13B', 'Phi-3-mini', 'WizardLM'],
  },
];

const EVENTS = [
  { date: 'Mar 2015', cat: 'research', title: 'Distilling the Knowledge in a Neural Network', detail: 'Hinton, Vinyals and Dean formalise soft-target distillation on MNIST and speech, coining “dark knowledge”.' },
  { date: 'Oct 2019', cat: 'research', title: 'DistilBERT ships at 40% smaller, 97% of BERT', detail: 'Hugging Face shows a 6-layer student keeps almost all of GLUE while running 60% faster; distillation becomes a default deployment step.' },
  { date: 'Mar 2023', cat: 'market', title: 'Alpaca 7B trained for under $600 of API calls', detail: 'Stanford fine-tunes LLaMA on 52k GPT-3.5 outputs; the recipe is copied within weeks and OpenAI updates its terms of use.' },
  { date: 'Jul 2024', cat: 'product', title: 'GPT-4o mini launches at $0.15 per 1M input tokens', detail: 'A 16.7× discount to GPT-4o at 82 MMLU; within a quarter it handles the majority of OpenAI API traffic.' },
  { date: 'Jan 2025', cat: 'legal', title: 'DeepSeek releases R1 and six distilled models; OpenAI alleges misuse', detail: 'R1-Distill-Qwen-32B retains ~91% of R1 on AIME. Days later OpenAI says it has evidence its outputs were used, opening the first cross-border distillation dispute.' },
  { date: 'Aug 2025', cat: 'policy', title: 'EU AI Act obligations for general-purpose models apply', detail: 'Providers must publish training-data summaries and respect opt-outs, putting synthetic corpora built from other providers’ outputs under a disclosure regime.' },
];

const CAT_COLOR = { research: css('--cat-research'), product: css('--cat-product'), policy: css('--cat-policy'), market: css('--cat-market'), legal: css('--cat-legal') };

/* =========================================================
   TOPBAR
   ========================================================= */
function initNav() {
  const toggle = $('#menu-toggle'), menu = $('#mobile-menu');
  toggle.addEventListener('click', () => {
    const open = menu.hidden;
    menu.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  });
  $$('a', menu).forEach((a) => a.addEventListener('click', () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); }));

  const links = $$('[data-nav]');
  const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  const update = () => {
    const y = scrollY + 120;
    let current = targets[0];
    for (const t of targets) if (t.offsetTop <= y) current = t;
    links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${current.id}`));
  };
  addEventListener('scroll', update, { passive: true });
  update();
}

/* =========================================================
   THREE.JS SCENE — teacher cloud flowing into student cloud
   ========================================================= */
function initScene() {
  const canvas = $('#scene');
  const host = canvas.parentElement;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (e) { canvas.remove(); return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  camera.position.set(0, 0.35, 7.6);
  camera.lookAt(0, -0.05, 0);
  const group = new THREE.Group();
  scene.add(group);

  const sprite = makeDotTexture();
  const col = (v) => new THREE.Color(v);
  const teacherC = { center: col(C.ink2), edge: col(C.ink4) };
  const studentC = { center: col(C.accent), edge: col('#8b97e8') };
  const white = col(C.bg);

  const TEACHER = { n: 1300, r: 1.5, cx: -1.55 };
  const STUDENT = { n: 320, r: 0.7, cx: 1.8 };

  function cloud(cfg, colors, size, opacity) {
    const pos = new Float32Array(cfg.n * 3), colr = new Float32Array(cfg.n * 3);
    const pts = [];
    for (let i = 0; i < cfg.n; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(cfg.r * Math.pow(Math.random(), 0.42));
      pts.push(v);
      pos.set([v.x + cfg.cx, v.y, v.z], i * 3);
      const t = v.length() / cfg.r;
      const c = colors.center.clone().lerp(colors.edge, Math.pow(t, 1.4));
      colr.set([c.r, c.g, c.b], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colr, 3));
    const mat = new THREE.PointsMaterial({ size, map: sprite, vertexColors: true, transparent: true, opacity, alphaTest: 0.05, depthWrite: false, sizeAttenuation: true });
    return { points: new THREE.Points(geo, mat), pts };
  }

  function links(cfg, pts, maxD, maxN, color, opacity) {
    const segs = [];
    for (let i = 0; i < pts.length && segs.length < maxN * 6; i++) {
      for (let j = i + 1; j < Math.min(pts.length, i + 40); j++) {
        if (pts[i].distanceTo(pts[j]) < maxD && Math.random() < 0.35) {
          segs.push(pts[i].x + cfg.cx, pts[i].y, pts[i].z, pts[j].x + cfg.cx, pts[j].y, pts[j].z);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity }));
  }

  const teacher = cloud(TEACHER, teacherC, 0.052, 0.85);
  const student = cloud(STUDENT, studentC, 0.062, 0.95);
  group.add(teacher.points, student.points);
  group.add(links(TEACHER, teacher.pts, 0.34, 520, C.ink4, 0.28));
  group.add(links(STUDENT, student.pts, 0.28, 220, C.accent, 0.22));

  // soft ring around the student to read as a "compact" target
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(STUDENT.r + 0.22, STUDENT.r + 0.235, 96),
    new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  );
  ring.position.x = STUDENT.cx;
  group.add(ring);

  // flow particles along bezier arcs from teacher surface to student surface
  const FLOW = 240;
  const flow = [];
  const fpos = new Float32Array(FLOW * 3), fcol = new Float32Array(FLOW * 3);
  for (let i = 0; i < FLOW; i++) {
    const a = new THREE.Vector3().randomDirection(); a.x = Math.abs(a.x) * 0.9 + 0.1; a.normalize().multiplyScalar(TEACHER.r * (0.75 + Math.random() * 0.3)); a.x += TEACHER.cx;
    const b = new THREE.Vector3().randomDirection(); b.x = -(Math.abs(b.x) * 0.9 + 0.1); b.normalize().multiplyScalar(STUDENT.r * (0.9 + Math.random() * 0.25)); b.x += STUDENT.cx;
    const mid = a.clone().lerp(b, 0.5); mid.y += (Math.random() - 0.5) * 1.6; mid.z += (Math.random() - 0.5) * 1.6;
    flow.push({ curve: new THREE.QuadraticBezierCurve3(a, mid, b), t: Math.random(), speed: 0.0016 + Math.random() * 0.0022 });
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  fgeo.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
  const fmat = new THREE.PointsMaterial({ size: 0.075, map: sprite, vertexColors: true, transparent: true, opacity: 1, alphaTest: 0.05, depthWrite: false });
  group.add(new THREE.Points(fgeo, fmat));
  const tmp = new THREE.Vector3(), tmpC = new THREE.Color();
  function stepFlow(dt) {
    for (let i = 0; i < FLOW; i++) {
      const f = flow[i];
      f.t += f.speed * dt; if (f.t > 1) f.t -= 1;
      f.curve.getPoint(f.t, tmp);
      fpos.set([tmp.x, tmp.y, tmp.z], i * 3);
      const fade = Math.min(1, Math.min(f.t, 1 - f.t) * 6); // fade in/out to background at both ends
      tmpC.copy(white).lerp(studentC.center, fade);
      fcol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    }
    fgeo.attributes.position.needsUpdate = true;
    fgeo.attributes.color.needsUpdate = true;
  }

  // sizing
  function resize() {
    const w = host.clientWidth, h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // keep the whole composition in frame on narrow viewports
    camera.position.z = w / h < 1.05 ? 9.4 : 7.6;
    if (reduceMotion) render();
  }
  new ResizeObserver(resize).observe(host);

  // pointer parallax + drag orbit
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  let dragging = null, dragRot = { x: 0, y: 0 };
  host.addEventListener('pointermove', (e) => {
    const r = host.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width - 0.5;
    target.y = (e.clientY - r.top) / r.height - 0.5;
    if (dragging) { dragRot.y += (e.clientX - dragging.x) * 0.006; dragRot.x += (e.clientY - dragging.y) * 0.004; dragging = { x: e.clientX, y: e.clientY }; }
  });
  host.addEventListener('pointerleave', () => { target.x = 0; target.y = 0; });
  canvas.addEventListener('pointerdown', (e) => { dragging = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointerup', () => { dragging = null; });
  canvas.addEventListener('pointercancel', () => { dragging = null; });

  const clock = new THREE.Clock();
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.05 }).observe(host);

  function render() { renderer.render(scene, camera); }
  function frame() {
    requestAnimationFrame(frame);
    if (!visible || document.hidden) return;
    const dt = Math.min(2.5, clock.getDelta() * 60);
    cur.x += (target.x - cur.x) * 0.05; cur.y += (target.y - cur.y) * 0.05;
    const t = clock.elapsedTime;
    group.rotation.y = Math.sin(t * 0.11) * 0.22 + cur.x * 0.35 + dragRot.y;
    group.rotation.x = Math.sin(t * 0.07) * 0.06 + cur.y * 0.22 + dragRot.x;
    ring.rotation.y = Math.sin(t * 0.25) * 0.5;
    stepFlow(dt);
    render();
  }

  resize();
  if (reduceMotion) { stepFlow(1); render(); }
  else frame();
}

function makeDotTexture() {
  const s = 64, c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.55, 'rgba(255,255,255,1)'); g.addColorStop(0.72, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* =========================================================
   KPI COUNTERS
   ========================================================= */
function initCounters() {
  const run = (el) => {
    const end = +el.dataset.count, dec = +(el.dataset.decimals || 0);
    if (reduceMotion) { el.textContent = fmtNum(end, dec); return; }
    const t0 = performance.now(), dur = 1100;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmtNum(end * e, dec);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } }), { threshold: 0.3 });
  $$('[data-count]').forEach((el) => io.observe(el));
}

/* =========================================================
   CHARTS (ECharts, custom theme)
   ========================================================= */
function registerTheme() {
  const axisText = { color: C.ink3, fontFamily: C.mono, fontSize: 11 };
  echarts.registerTheme('gd', {
    color: [C.s1, C.s2, C.s3, C.s4],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: C.sans, color: C.ink2 },
    categoryAxis: { axisLine: { show: true, lineStyle: { color: C.lineStrong } }, axisTick: { show: false }, axisLabel: { color: C.ink2, fontSize: 11.5, fontFamily: C.sans }, splitLine: { show: false } },
    valueAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisText, splitLine: { lineStyle: { color: C.line } }, nameTextStyle: { color: C.ink3, fontSize: 11 } },
    logAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: axisText, splitLine: { lineStyle: { color: C.line } }, nameTextStyle: { color: C.ink3, fontSize: 11 } },
    tooltip: {
      backgroundColor: C.bg, borderColor: C.line, borderWidth: 1, padding: [8, 10],
      textStyle: { color: C.ink, fontSize: 12, fontFamily: C.sans },
      extraCssText: 'box-shadow: 0 8px 24px -8px rgba(16,24,40,.18), 0 1px 3px rgba(16,24,40,.06); border-radius: 8px;',
      axisPointer: { lineStyle: { color: C.lineStrong, type: 'solid' }, crossStyle: { color: C.lineStrong }, shadowStyle: { color: 'rgba(16,24,40,.04)' } },
    },
    line: { smooth: false, symbol: 'none', lineStyle: { width: 2 } },
    bar: { itemStyle: { borderRadius: [4, 4, 0, 0] } },
    scatter: { symbolSize: 9 },
  });
}

const PRICE = [
  { label: 'GPT-4o', teacher: 'GPT-4o', student: 'GPT-4o mini', t: 2.50, s: 0.15 },
  { label: 'Claude 3.5', teacher: 'Claude 3.5 Sonnet', student: 'Claude 3.5 Haiku', t: 3.00, s: 0.80 },
  { label: 'Gemini 1.5', teacher: 'Gemini 1.5 Pro', student: 'Gemini 1.5 Flash', t: 1.25, s: 0.075 },
  { label: 'DeepSeek-R1', teacher: 'DeepSeek-R1', student: 'R1-Distill-Qwen-32B', t: 0.55, s: 0.12 },
  { label: 'Llama 3.1', teacher: 'Llama 3.1 405B', student: 'Llama 3.1 8B', t: 3.00, s: 0.10 },
  { label: 'Qwen2.5', teacher: 'Qwen2.5 72B', student: 'Qwen2.5 7B', t: 0.90, s: 0.10 },
];

const QUARTERS = ['Q1 23', 'Q2 23', 'Q3 23', 'Q4 23', 'Q1 24', 'Q2 24', 'Q3 24', 'Q4 24', 'Q1 25', 'Q2 25', 'Q3 25', 'Q4 25', 'Q1 26', 'Q2 26', 'Q3 26'];
const RETENTION = {
  'MMLU': [84, 85, 86, 87, 88, 89, 90, 91, 92, 92, 93, 93, 94, 94, 95],
  'GSM8K': [70, 73, 76, 79, 82, 85, 87, 89, 91, 92, 93, 94, 95, 95, 96],
  'AIME 2024': [22, 26, 31, 37, 44, 51, 58, 66, 91, 90, 91, 92, 92, 93, 94],
};

const SCATTER = {
  Teacher: [
    ['DeepSeek-R1', 671, 90.8, 1], ['Llama 3.1 405B', 405, 88.6, 1], ['Qwen2.5 72B', 72.7, 86.1, 0], ['Llama 3.1 70B', 70, 86.0, 1], ['Mixtral 8x22B', 141, 77.8, 0], ['Gemma 2 27B', 27, 75.2, 1],
  ],
  Distilled: [
    ['R1-Distill-Qwen-32B', 32, 83.3, 1], ['R1-Distill-Qwen-14B', 14, 79.7, 0], ['R1-Distill-Llama-8B', 8, 71.0, 1], ['Gemma 2 9B', 9, 71.3, 1], ['Gemma 2 2B', 2, 51.3, 1], ['Phi-3-mini', 3.8, 68.8, 1], ['MiniCPM-2B', 2.4, 53.5, 0],
  ],
  Small: [
    ['Qwen2.5 14B', 14, 79.7, 0], ['Qwen2.5 7B', 7.6, 74.2, 1], ['Qwen2.5 3B', 3, 65.6, 0], ['Qwen2.5 1.5B', 1.5, 60.9, 1], ['Llama 3.1 8B', 8, 73.0, 1], ['Llama 3.2 3B', 3, 63.4, 0], ['Llama 3.2 1B', 1.2, 49.3, 1],
  ],
};

const CHARTS = {
  price: {
    title: 'Input price, USD per 1M tokens',
    desc: 'Teacher beside its distilled or small sibling. Log scale; label is the teacher-to-student ratio.',
    src: 'Sources: vendor pricing pages, Sep 2026 snapshot. Open-weight prices are the median of three hosted providers.',
    legend: [['Teacher', C.ink4, 'square'], ['Student', C.accent, 'square']],
    option: () => ({
      grid: { left: 56, right: 20, top: 28, bottom: 36 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, formatter: (ps) => {
        const d = PRICE[ps[0].dataIndex];
        return `<div style="font-weight:600;margin-bottom:4px">${d.label}</div>` +
          `<div style="display:flex;justify-content:space-between;gap:16px;color:${C.ink2}"><span>${d.teacher}</span><span style="font-family:${C.mono};color:${C.ink}">${money(d.t)}</span></div>` +
          `<div style="display:flex;justify-content:space-between;gap:16px;color:${C.ink2}"><span>${d.student}</span><span style="font-family:${C.mono};color:${C.ink}">${money(d.s)}</span></div>` +
          `<div style="margin-top:4px;padding-top:4px;border-top:1px solid ${C.line};color:${C.ink3}">Ratio <span style="font-family:${C.mono};color:${C.ink}">${(d.t / d.s).toFixed(1)}×</span></div>`;
      } },
      xAxis: { type: 'category', data: PRICE.map((d) => d.label) },
      yAxis: { type: 'log', min: 0.05, max: 5, logBase: 10, axisLabel: { formatter: (v) => (v >= 1 ? `$${v.toFixed(0)}` : `$${v}`) }, minorSplitLine: { show: false } },
      series: [
        { name: 'Teacher', type: 'bar', data: PRICE.map((d) => d.t), itemStyle: { color: C.ink4 }, barGap: '10%', barCategoryGap: '42%' },
        { name: 'Student', type: 'bar', data: PRICE.map((d) => d.s), itemStyle: { color: C.accent },
          label: { show: true, position: 'top', color: C.ink2, fontFamily: C.mono, fontSize: 11, formatter: (p) => `${(PRICE[p.dataIndex].t / PRICE[p.dataIndex].s).toFixed(PRICE[p.dataIndex].t / PRICE[p.dataIndex].s >= 10 ? 0 : 1)}×` } },
      ],
    }),
    table: () => ({ head: ['Family', 'Teacher', 'Input $/1M', 'Student', 'Input $/1M', 'Ratio'], rows: PRICE.map((d) => [d.label, d.teacher, money(d.t), d.student, money(d.s), `${(d.t / d.s).toFixed(1)}×`]), num: [2, 4, 5] }),
  },
  retention: {
    title: 'Best distilled-model retention by quarter, % of teacher score',
    desc: 'Highest reported student ÷ teacher score among open releases in each quarter. Illustrative series.',
    src: 'Sources: DeepSeek-R1 report Table 5, Gemma 2 and Phi technical reports, Open LLM Leaderboard. Interpolated where no release landed in a quarter.',
    legend: [['MMLU', C.s1, 'line'], ['GSM8K', C.s2, 'line'], ['AIME 2024', C.s3, 'line']],
    option: () => ({
      grid: { left: 48, right: 84, top: 28, bottom: 36 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'line' }, valueFormatter: (v) => `${v}%`, order: 'valueDesc' },
      xAxis: { type: 'category', boundaryGap: false, data: QUARTERS, axisLabel: { interval: 1 } },
      yAxis: { type: 'value', min: 20, max: 100, interval: 20, axisLabel: { formatter: '{value}%' } },
      series: Object.entries(RETENTION).map(([name, data], i) => ({
        name, type: 'line', data, showSymbol: false, lineStyle: { width: 2, color: [C.s1, C.s2, C.s3][i] }, itemStyle: { color: [C.s1, C.s2, C.s3][i] },
        emphasis: { focus: 'series', lineStyle: { width: 2.5 } },
        endLabel: { show: true, formatter: (p) => `${p.seriesName}  ${p.value}%`, color: C.ink2, fontSize: 11, fontFamily: C.sans, offset: [6, 0] },
        markPoint: i === 2 ? { symbol: 'circle', symbolSize: 8, itemStyle: { color: C.bg, borderColor: C.s3, borderWidth: 2 }, label: { show: true, formatter: 'R1-Distill', position: 'top', color: C.ink2, fontSize: 11, distance: 8 }, data: [{ coord: ['Q1 25', 91] }] } : undefined,
      })),
    }),
    table: () => ({ head: ['Quarter', ...Object.keys(RETENTION)], rows: QUARTERS.map((q, i) => [q, ...Object.values(RETENTION).map((s) => `${s[i]}%`)]), num: [1, 2, 3] }),
  },
  scatter: {
    title: 'Parameters vs. MMLU, open-weight models',
    desc: 'Students sit far left of their teachers with a modest drop. Hover for the model; log x-axis.',
    src: 'Sources: model cards and technical reports (5-shot MMLU as published). R1-Distill values use the Qwen2.5 base scores.',
    legend: [['Teacher', C.ink4, 'dot'], ['Distilled student', C.accent, 'dot'], ['Small, not distilled', C.s3, 'dot']],
    option: () => ({
      grid: { left: 48, right: 24, top: 28, bottom: 40 },
      tooltip: { trigger: 'item', formatter: (p) => `<div style="font-weight:600">${p.data[0]}</div><div style="color:${C.ink2}">${p.seriesName} · <span style="font-family:${C.mono};color:${C.ink}">${p.data[1]}B</span> · MMLU <span style="font-family:${C.mono};color:${C.ink}">${p.data[2]}</span></div>` },
      xAxis: { type: 'log', min: 1, max: 1000, name: 'Parameters (B), log', nameLocation: 'middle', nameGap: 26, axisLabel: { formatter: (v) => `${v}B` }, splitLine: { show: true, lineStyle: { color: C.line } }, minorSplitLine: { show: false } },
      yAxis: { type: 'value', min: 40, max: 95, name: 'MMLU', nameLocation: 'end', nameGap: 12 },
      series: [
        ['Teacher', C.ink4, SCATTER.Teacher], ['Distilled student', C.accent, SCATTER.Distilled], ['Small, not distilled', C.s3, SCATTER.Small],
      ].map(([name, color, data]) => ({
        name, type: 'scatter', data: data.map((d) => ({ value: [d[0], d[1], d[2]], label: { show: !!d[3] } })), encode: { x: 1, y: 2 }, symbolSize: 10,
        itemStyle: { color, borderColor: C.bg, borderWidth: 2 },
        label: { position: 'right', formatter: (p) => p.data.value[0], color: C.ink2, fontSize: 11, distance: 6 },
        labelLayout: { hideOverlap: true },
        emphasis: { scale: 1.4 },
      })),
    }),
    table: () => ({ head: ['Model', 'Role', 'Params (B)', 'MMLU'], rows: Object.entries(SCATTER).flatMap(([role, list]) => list.map((d) => [d[0], role, d[1], d[2]])), num: [2, 3] }),
  },
};

function initCharts() {
  registerTheme();
  const el = $('#chart-panel');
  const chart = echarts.init(el, 'gd', { renderer: 'canvas' });
  const tabs = $$('#chart-tabs [role="tab"]');
  const legend = $('#chart-legend'), tableWrap = $('#chart-table'), toggle = $('#toggle-table');
  let current = 'price';

  function renderLegend(items) {
    legend.innerHTML = items.map(([name, color, kind]) => `<span><i class="${kind === 'dot' ? 'round' : kind === 'line' ? 'bar' : ''}" style="--c:${color}"></i>${name}</span>`).join('');
  }
  function renderTable() {
    const t = CHARTS[current].table();
    tableWrap.innerHTML = `<table><thead><tr>${t.head.map((h, i) => `<th class="${t.num.includes(i) ? 'n' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${t.num.includes(i) ? 'n' : ''}">${c}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  }
  function show(key, animate = true) {
    current = key;
    const def = CHARTS[key];
    $('#chart-title').textContent = def.title;
    $('#chart-desc').textContent = def.desc;
    $('#chart-src').textContent = def.src;
    renderLegend(def.legend);
    chart.setOption({ animation: animate && !reduceMotion, animationDuration: 500, animationEasing: 'cubicOut', ...def.option() }, true);
    tabs.forEach((b) => b.setAttribute('aria-selected', String(b.dataset.chart === key)));
    if (!tableWrap.hidden) renderTable();
  }
  tabs.forEach((b) => b.addEventListener('click', () => show(b.dataset.chart)));
  toggle.addEventListener('click', () => {
    const open = tableWrap.hidden;
    tableWrap.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? 'Hide table' : 'View as table';
    if (open) renderTable();
  });
  let raf;
  addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => chart.resize()); });
  show('price', true);
}

/* =========================================================
   MODEL TABLE
   ========================================================= */
function initTable() {
  const tbody = $('#model-table tbody'), ths = $$('#model-table th[data-key]');
  const state = { vendor: 'all', role: 'all', key: 'input', dir: 'asc' };
  const monthName = (ym) => new Date(`${ym}-15`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  function rows() {
    let list = MODELS.filter((m) => (state.vendor === 'all' || m.vendor === state.vendor) && (state.role === 'all' || m.role === state.role));
    const dir = state.dir === 'asc' ? 1 : -1;
    list.sort((a, b) => {
      const va = a[state.key], vb = b[state.key];
      if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
      return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb))) * dir;
    });
    return list;
  }
  function render() {
    const list = rows();
    tbody.innerHTML = list.map((m) => `<tr>
      <td class="model">${m.model}</td>
      <td>${m.vendor}</td>
      <td><span class="role role--${m.role}">${m.role === 'Distilled' ? 'Student' : m.role}</span></td>
      <td class="n ${m.params == null ? 'dim' : ''}">${m.params == null ? '—' : fmtNum(m.params, Number.isInteger(m.params) ? 0 : 1)}</td>
      <td class="n ${m.mmlu == null ? 'dim' : ''}">${m.mmlu == null ? '—' : `<span class="bar-cell"><i style="--w:${((m.mmlu - 40) / 55 * 100).toFixed(0)}%"></i>${m.mmlu.toFixed(1)}</span>`}</td>
      <td class="n">${money(m.input)}</td>
      <td class="n">${money(m.output)}</td>
      <td class="n">${monthName(m.released)}</td>
    </tr>`).join('');
    ths.forEach((th) => th.setAttribute('aria-sort', th.dataset.key === state.key ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'));
    const vendors = new Set(list.map((m) => m.vendor));
    $('#table-count').textContent = `${list.length} of ${MODELS.length} models · ${vendors.size} vendor${vendors.size === 1 ? '' : 's'}`;
  }
  ths.forEach((th) => $('button', th).addEventListener('click', () => {
    const key = th.dataset.key;
    if (state.key === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.key = key; state.dir = ['model', 'vendor', 'role'].includes(key) ? 'asc' : 'desc'; }
    render();
  }));
  $$('#vendor-chips .chip').forEach((chip) => chip.addEventListener('click', () => {
    state.vendor = chip.dataset.vendor;
    $$('#vendor-chips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    render();
  }));
  $$('#role-seg button').forEach((b) => b.addEventListener('click', () => {
    state.role = b.dataset.role;
    $$('#role-seg button').forEach((x) => x.classList.toggle('is-on', x === b));
    render();
  }));
  $('#vendor-chips .chip__n').textContent = MODELS.length;
  render();
}

/* =========================================================
   LIBRARY + DRAWER
   ========================================================= */
const dots = (n) => Array.from({ length: 4 }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
const DIFF = ['', 'Beginner', 'Intermediate', 'Advanced', 'Expert'];

function initLibrary() {
  const grid = $('#lib-grid');
  grid.innerHTML = METHODS.map((m) => `<button class="method card" type="button" data-id="${m.id}" aria-haspopup="dialog">
    <div class="method__top"><span class="tag" data-family="${m.family}">${m.family}</span><span class="dots" title="${DIFF[m.difficulty]}" aria-label="Difficulty: ${DIFF[m.difficulty]}">${dots(m.difficulty)}</span></div>
    <h3>${m.name}</h3>
    <p>${m.blurb}</p>
    <div class="method__foot"><span>${m.ref.split(' · ')[0]} <span class="num">${m.ref.split(' · ')[1]}</span></span><span class="method__open">Open <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4"/></svg></span></div>
  </button>`).join('');

  const drawer = $('#drawer'), backdrop = $('#drawer-backdrop');
  let lastFocus = null;
  function open(id) {
    const m = METHODS.find((x) => x.id === id); if (!m) return;
    lastFocus = document.activeElement;
    $('#drawer-family').textContent = m.family; $('#drawer-family').dataset.family = m.family;
    $('#drawer-dots').innerHTML = dots(m.difficulty); $('#drawer-dots').setAttribute('aria-label', `Difficulty: ${DIFF[m.difficulty]}`);
    $('#drawer-title').textContent = m.name; $('#drawer-ref').textContent = m.ref;
    katex.render(m.formula, $('#drawer-formula'), { displayMode: true, throwOnError: false });
    $('#drawer-formula-note').textContent = m.note; $('#drawer-desc').textContent = m.desc;
    $('#drawer-when').textContent = m.when; $('#drawer-cost').textContent = m.cost;
    $('#drawer-students').innerHTML = m.students.map((s) => `<span class="chip">${s}</span>`).join('');
    drawer.hidden = false; backdrop.hidden = false;
    requestAnimationFrame(() => { drawer.classList.add('is-open'); backdrop.classList.add('is-open'); });
    document.body.style.overflow = 'hidden';
    $('#drawer-close').focus();
  }
  function close() {
    drawer.classList.remove('is-open'); backdrop.classList.remove('is-open');
    document.body.style.overflow = '';
    setTimeout(() => { drawer.hidden = true; backdrop.hidden = true; }, reduceMotion ? 0 : 240);
    lastFocus?.focus?.();
  }
  grid.addEventListener('click', (e) => { const b = e.target.closest('.method'); if (b) open(b.dataset.id); });
  $('#drawer-close').addEventListener('click', close);
  backdrop.addEventListener('click', close);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) close(); });
  return { open };
}

/* =========================================================
   TIMELINE
   ========================================================= */
function initTimeline() {
  $('#tl').innerHTML = EVENTS.map((e) => `<li style="--c:${CAT_COLOR[e.cat]}">
    <article class="tl__card card">
      <div class="tl__date"><span>${e.date}</span><span class="tl__cat">${e.cat}</span></div>
      <h3 class="tl__title">${e.title}</h3>
      <p class="tl__detail">${e.detail}</p>
    </article>
  </li>`).join('');
}

/* =========================================================
   COMMAND PALETTE
   ========================================================= */
function initCmdk(lib) {
  const root = $('#cmdk'), backdrop = $('#cmdk-backdrop'), input = $('#cmdk-input'), list = $('#cmdk-list');
  const items = [
    ...['Overview', 'Academic', 'Financial', 'Political', 'Company', 'Developer', 'Customer', 'Library', 'Timeline'].map((p) => ({ group: 'Perspectives', label: p, hint: 'Section', color: C.ink4, run: () => location.hash = `#${p.toLowerCase()}` })),
    ...METHODS.map((m) => ({ group: 'Methods', label: m.name, hint: m.family, color: C.accent, run: () => { location.hash = '#library'; setTimeout(() => lib.open(m.id), 350); } })),
    ...MODELS.map((m) => ({ group: 'Models', label: m.model, hint: m.vendor, color: m.role === 'Teacher' ? C.ink3 : C.s3, run: () => location.hash = '#company' })),
  ];
  let filtered = items, active = 0, lastFocus = null;

  function render() {
    const q = input.value.trim().toLowerCase();
    filtered = q ? items.filter((i) => `${i.label} ${i.hint} ${i.group}`.toLowerCase().includes(q)) : items;
    active = Math.min(active, Math.max(0, filtered.length - 1));
    if (!filtered.length) { list.innerHTML = '<li class="cmdk__empty">No matches. Try a model, a method or a perspective.</li>'; return; }
    let html = '', group = '';
    filtered.forEach((it, i) => {
      if (it.group !== group) { group = it.group; html += `<li class="cmdk__group" role="presentation">${group}</li>`; }
      html += `<li class="cmdk__item ${i === active ? 'is-active' : ''}" role="option" aria-selected="${i === active}" data-i="${i}"><i style="--c:${it.color}"></i>${it.label}<small>${it.hint}</small></li>`;
    });
    list.innerHTML = html;
    list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' });
  }
  function open() {
    lastFocus = document.activeElement;
    root.hidden = false; backdrop.hidden = false;
    requestAnimationFrame(() => { root.classList.add('is-open'); backdrop.classList.add('is-open'); });
    input.value = ''; active = 0; render(); input.focus();
  }
  function close() {
    root.classList.remove('is-open'); backdrop.classList.remove('is-open');
    setTimeout(() => { root.hidden = true; backdrop.hidden = true; }, reduceMotion ? 0 : 180);
    lastFocus?.focus?.();
  }
  function choose(i) { const it = filtered[i]; if (!it) return; close(); it.run(); }

  $('#open-search').addEventListener('click', open);
  backdrop.addEventListener('click', close);
  input.addEventListener('input', () => { active = 0; render(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % filtered.length; render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + filtered.length) % filtered.length; render(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(active); }
  });
  list.addEventListener('click', (e) => { const li = e.target.closest('.cmdk__item'); if (li) choose(+li.dataset.i); });
  list.addEventListener('mousemove', (e) => { const li = e.target.closest('.cmdk__item'); if (li && +li.dataset.i !== active) { active = +li.dataset.i; render(); } });
  addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); root.hidden ? open() : close(); }
    else if (e.key === 'Escape' && !root.hidden) close();
  });
}

/* =========================================================
   BOOT
   ========================================================= */
initNav();
initCounters();
initTable();
const lib = initLibrary();
initTimeline();
initCmdk(lib);
initScene();
document.fonts.ready.then(initCharts);
