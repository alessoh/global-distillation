// Global Distillation — concept A (editorial data journalism)
import * as THREE from 'three';

/* ------------------------------------------------------------------ */
/* Palette (mirrors styles.css)                                        */
/* ------------------------------------------------------------------ */
const C = {
  paper: '#FAF7F2', paper2: '#F2EDE5', paper3: '#EBE4D9',
  ink: '#1A1814', ink2: '#4E4943', ink3: '#857E74', ink4: '#B3AB9F',
  rule: '#E3DCD1', ruleStrong: '#CFC6B8',
  accent: '#B5451B', accentSoft: '#F5E4DB',
  blue: '#1F6A99', green: '#4F7F3A',
};
const SANS = '"Schibsted Grotesk", "Helvetica Neue", Arial, sans-serif';
const MONO = '"IBM Plex Mono", Menlo, Consolas, monospace';
const SERIF = '"Newsreader", Georgia, serif';
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------------ */
/* Data (illustrative placeholders, see footer)                        */
/* ------------------------------------------------------------------ */
const MODELS = [
  { model: 'GPT-4o mini', vendor: 'OpenAI', teacher: 'GPT-4o', params: null, method: 'Logit + synthetic SFT', retention: 88, price: 0.15, released: '2024-07', open: false },
  { model: 'Claude 3.5 Haiku', vendor: 'Anthropic', teacher: 'Claude 3.5 Sonnet', params: null, method: 'Undisclosed', retention: 84, price: 0.80, released: '2024-11', open: false },
  { model: 'Gemini 1.5 Flash', vendor: 'Google', teacher: 'Gemini 1.5 Pro', params: null, method: 'Online logit distillation', retention: 86, price: 0.075, released: '2024-05', open: false },
  { model: 'Gemini 1.5 Flash-8B', vendor: 'Google', teacher: 'Gemini 1.5 Pro', params: 8, method: 'Online logit distillation', retention: 79, price: 0.0375, released: '2024-10', open: false },
  { model: 'DeepSeek-R1-Distill-Qwen-32B', vendor: 'DeepSeek', teacher: 'DeepSeek-R1', params: 32, method: 'Reasoning-trace SFT', retention: 91, price: 0.12, released: '2025-01', open: true },
  { model: 'DeepSeek-R1-Distill-Qwen-14B', vendor: 'DeepSeek', teacher: 'DeepSeek-R1', params: 14, method: 'Reasoning-trace SFT', retention: 87, price: 0.07, released: '2025-01', open: true },
  { model: 'DeepSeek-R1-Distill-Llama-8B', vendor: 'DeepSeek', teacher: 'DeepSeek-R1', params: 8, method: 'Reasoning-trace SFT', retention: 63, price: 0.04, released: '2025-01', open: true },
  { model: 'Llama 3.2 3B', vendor: 'Meta', teacher: 'Llama 3.1 8B / 70B', params: 3, method: 'Logit distillation + pruning', retention: 55, price: 0.06, released: '2024-09', open: true },
  { model: 'Llama 3.2 1B', vendor: 'Meta', teacher: 'Llama 3.1 8B', params: 1, method: 'Logit distillation + pruning', retention: 41, price: 0.04, released: '2024-09', open: true },
  { model: 'Gemma 2 9B', vendor: 'Google', teacher: 'Gemma 2 27B', params: 9, method: 'Logit distillation', retention: 78, price: 0.20, released: '2024-06', open: true },
  { model: 'Qwen2.5-7B-Instruct', vendor: 'Alibaba', teacher: 'Qwen2.5-72B', params: 7, method: 'Sequence-level KD', retention: 74, price: 0.10, released: '2024-09', open: true },
  { model: 'Phi-4', vendor: 'Microsoft', teacher: 'GPT-4o (synthetic data)', params: 14, method: 'Synthetic-data SFT', retention: 82, price: 0.07, released: '2024-12', open: true },
  { model: 'Minitron-4B', vendor: 'NVIDIA', teacher: 'Nemotron-4 15B', params: 4, method: 'Pruning + logit KD', retention: 71, price: 0.05, released: '2024-07', open: true },
];

const PRICE_PAIRS = [
  { vendor: 'OpenAI', teacher: ['GPT-4o', 2.50], student: ['GPT-4o mini', 0.15] },
  { vendor: 'Anthropic', teacher: ['Claude 3.5 Sonnet', 3.00], student: ['Claude 3.5 Haiku', 0.80] },
  { vendor: 'Google', teacher: ['Gemini 1.5 Pro', 1.25], student: ['Gemini 1.5 Flash', 0.075] },
  { vendor: 'Meta (hosted)', teacher: ['Llama 3.1 405B', 3.00], student: ['Llama 3.1 8B', 0.18] },
  { vendor: 'DeepSeek', teacher: ['DeepSeek-R1', 0.55], student: ['R1-Distill-Qwen-32B', 0.12] },
];

const QUARTERS = [];
for (let y = 2019; y <= 2026; y++) for (let q = 1; q <= 4; q++) { if (y === 2026 && q > 2) break; QUARTERS.push(`${y} Q${q}`); }
const PAPERS_ALL = [120,135,150,170, 190,210,225,250, 270,290,310,340, 360,380,400,440, 500,560,600,650, 700,740,790,840, 880,920,950,1010, 1080,1140];
const PAPERS_LLM = [5,6,8,10, 12,15,18,22, 28,34,40,48, 55,62,70,90, 140,190,230,270, 320,360,400,440, 490,530,560,610, 660,710];

const METHODS = [
  {
    family: 'Logit', fam: 'logit', difficulty: 1, title: 'Soft-target distillation',
    desc: 'Train the student to match the teacher’s temperature-softened output distribution, not just its argmax.',
    cite: 'Hinton, Vinyals & Dean, 2015', year: 2015,
    meta: 'NeurIPS 2014 workshop · 5 pages · cited 20,000+',
    lede: 'The original recipe. Softening the teacher’s logits with a temperature exposes the “dark knowledge” in its near-misses, which carries far more signal per example than a hard label.',
    formula: String.raw`\mathcal{L} = (1-\alpha)\,\mathrm{CE}\big(y,\,\sigma(z_s)\big) + \alpha\,T^{2}\,\mathrm{KL}\!\left(\sigma\!\left(\tfrac{z_t}{T}\right)\,\middle\|\,\sigma\!\left(\tfrac{z_s}{T}\right)\right)`,
    gloss: 'z are logits, T the temperature, α the weight on the distillation term. The T² factor keeps gradient scale constant as T changes.',
    uses: ['Gemma 2 9B and 2B from the 27B teacher', 'Almost every vision classifier shipped on-device', 'The KD term inside most larger recipes below'],
    tradeoffs: 'Needs full teacher logits over a shared vocabulary, so it is unavailable across API boundaries. Works best when teacher and student share a tokenizer.',
  },
  {
    family: 'Data', fam: 'data', difficulty: 2, title: 'Sequence-level KD',
    desc: 'Generate the teacher’s best output for each prompt and fine-tune the student on it as if it were ground truth.',
    cite: 'Kim & Rush, 2016', year: 2016,
    meta: 'EMNLP 2016 · translation origin',
    lede: 'Instead of matching a distribution token by token, the student learns to reproduce whole teacher sequences. Simple, tokenizer-agnostic, and the only method that works when you can only see the teacher’s text.',
    formula: String.raw`\mathcal{L} = -\sum_{t=1}^{|\hat{y}|}\log p_s\big(\hat{y}_t \mid \hat{y}_{<t}, x\big),\qquad \hat{y} = \arg\max_{y} p_t(y \mid x)`,
    gloss: 'The teacher’s decoded sequence ŷ replaces the reference; beam search or sampling produces it.',
    uses: ['Instruction-tuned open models trained on API outputs', 'Qwen2.5 small variants from the 72B model', 'Translation and summarisation students'],
    tradeoffs: 'Exposure bias: the student only sees teacher-quality prefixes and can compound errors at inference. This is also the mode at the centre of the terms-of-service disputes.',
  },
  {
    family: 'Feature', fam: 'feature', difficulty: 3, title: 'Hidden-state matching',
    desc: 'Align intermediate representations layer by layer through a learned projection, then finish with logit KD.',
    cite: 'Romero et al., 2015; Jiao et al., 2020', year: 2020,
    meta: 'FitNets and TinyBERT · two-stage',
    lede: 'Deeper students learn faster when told what the teacher’s internal layers look like. A linear map bridges the width mismatch; a layer map bridges the depth mismatch.',
    formula: String.raw`\mathcal{L}_{\text{hid}} = \sum_{l=1}^{L_s}\big\| W_l\,h_s^{(l)} - h_t^{(g(l))}\big\|_2^{2}`,
    gloss: 'g maps student layer l to a teacher layer; Wₗ projects student width onto teacher width.',
    uses: ['TinyBERT, MobileBERT and most BERT-era compressions', 'Speech encoders for on-device ASR', 'Vision transformers distilled for edge inference'],
    tradeoffs: 'Requires white-box access to the teacher and adds a tuning surface (which layers, which weights). Gains shrink when architectures diverge.',
  },
  {
    family: 'Feature', fam: 'feature', difficulty: 3, title: 'Attention-relation transfer',
    desc: 'Transfer only the self-attention relations of the last layer, so student and teacher can differ in width and depth.',
    cite: 'Wang et al., 2020 (MiniLM)', year: 2020,
    meta: 'NeurIPS 2020 · deep self-attention distillation',
    lede: 'MiniLM showed that the attention pattern of one well-chosen layer carries most of what a student needs, and that matching value-value relations, not just query-key ones, closes the gap further.',
    formula: String.raw`\mathcal{L}_{\text{AT}} = \frac{1}{A\,|x|}\sum_{a=1}^{A}\sum_{i=1}^{|x|}\mathrm{KL}\!\left(A^{t}_{a,i}\,\middle\|\,A^{s}_{a,i}\right)`,
    gloss: 'A is the number of relation heads, |x| the sequence length; the KL runs over each row of the attention matrix.',
    uses: ['MiniLM and its multilingual descendants', 'Embedding models for retrieval', 'Rerankers deployed at search scale'],
    tradeoffs: 'Only the final layer is matched, so very deep students can under-use their lower layers. Sensitive to the number of relation heads.',
  },
  {
    family: 'Logit', fam: 'logit', difficulty: 4, title: 'On-policy distillation',
    desc: 'Sample from the student, score with the teacher, and minimise a divergence on the student’s own trajectories.',
    cite: 'Agarwal et al., 2024 (GKD)', year: 2024,
    meta: 'ICLR 2024 · generalised knowledge distillation',
    lede: 'Training on the student’s own generations removes the train–test mismatch that hurts sequence-level KD. The divergence is a knob: forward KL is mode-covering, reverse KL is mode-seeking.',
    formula: String.raw`\mathcal{L}_{\text{GKD}} = \mathbb{E}_{x\sim\mathcal{D},\;y\sim p_s(\cdot\mid x)}\Big[\,\mathcal{D}_{\mathrm{JSD}(\beta)}\big(p_t(\cdot\mid x)\,\|\,p_s(\cdot\mid x)\big)\Big]`,
    gloss: 'β interpolates between forward and reverse KL; β → 0 recovers reverse KL.',
    uses: ['Gemini 1.5 Flash, per its technical report', 'Gemma 2 training mixture', 'Reasoning students where the teacher can grade partial traces'],
    tradeoffs: 'Expensive: every step needs a teacher forward pass on freshly sampled student text. Requires teacher logits, so it is closed to third parties.',
  },
  {
    family: 'Data', fam: 'data', difficulty: 2, title: 'Reasoning-trace distillation',
    desc: 'Supervised fine-tuning on hundreds of thousands of long chain-of-thought samples from a reasoning teacher.',
    cite: 'DeepSeek-AI, 2025', year: 2025,
    meta: 'Jan 2025 · 800k curated samples · six students',
    lede: 'The R1 paper’s surprise was not the RL recipe but that plain SFT on teacher traces gave a 32B student 91% of the teacher’s AIME score, and beat RL run directly on the same base model.',
    formula: String.raw`\mathcal{L} = -\mathbb{E}_{(x,\,c,\,y)\sim\mathcal{D}_t}\Big[\sum_{k}\log p_s\big(c_k,\,y \mid x,\,c_{<k}\big)\Big]`,
    gloss: 'c is the teacher’s chain of thought, y its final answer; Dₜ is the filtered trace set.',
    uses: ['DeepSeek-R1-Distill Qwen and Llama family', 'Sky-T1, OpenThinker and similar open reproductions', 'Most 2025–2026 small reasoning models'],
    tradeoffs: 'Students inherit the teacher’s verbosity and its mistakes. Trace curation dominates cost, and provenance of traces is where regulators are now looking.',
  },
];

const EVENTS = [
  { date: 'Mar 2015', cat: 'academic', label: 'Academic', title: 'Hinton, Vinyals and Dean name the technique', body: '“Distilling the Knowledge in a Neural Network” introduces soft targets and temperature. The term sticks.' },
  { date: 'Oct 2019', cat: 'academic', label: 'Academic', title: 'DistilBERT keeps 97% at 40% smaller', body: 'Hugging Face ships the first widely used distilled language model; the compression ratio becomes the benchmark.' },
  { date: 'Jul 2024', cat: 'company', label: 'Company', title: 'GPT-4o mini lands at 15 cents', body: 'OpenAI prices its small model at $0.15 per million input tokens, and within a quarter it carries most of the platform’s traffic.' },
  { date: 'Jan 2025', cat: 'financial', label: 'Financial', title: 'R1 distills wipe $590bn off Nvidia', body: 'DeepSeek releases six distilled students alongside R1. The next trading day is the largest single-stock loss on record.' },
  { date: 'Jan 2025', cat: 'political', label: 'Political', title: 'OpenAI alleges DeepSeek distilled its outputs', body: 'The dispute turns a training method into a trade question; Commerce and the White House both weigh in.' },
  { date: 'Aug 2025', cat: 'political', label: 'Political', title: 'EU AI Act obligations reach general-purpose models', body: 'Providers must publish a training-data summary, the first rule to touch where distilled models get their traces.' },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const money = (v) => v < 0.1 ? `$${v.toFixed(3).replace(/0+$/, '')}` : `$${v.toFixed(2)}`;
const fmtNum = (v) => v.toLocaleString('en-US');
const monthName = (ym) => { const [y, m] = ym.split('-'); return new Date(+y, +m - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' }); };

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */
(function nav() {
  const menuBtn = $('#menuBtn'), mobile = $('#mobileNav');
  menuBtn.addEventListener('click', () => {
    const open = mobile.hidden;
    mobile.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.classList.toggle('is-open', open);
  });
  $$('a', mobile).forEach((a) => a.addEventListener('click', () => { mobile.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.classList.remove('is-open'); }));

  // Active link tracking by section
  const links = $$('.nav__links a');
  const targets = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);
  const setActive = (id) => links.forEach((a) => a.classList.toggle('is-active', a.getAttribute('href') === `#${id}`));
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
  }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
  targets.forEach((t) => io.observe(t));
})();

/* ------------------------------------------------------------------ */
/* Hero scene: teacher network flowing into a student network          */
/* ------------------------------------------------------------------ */
(function scene() {
  const host = $('#scene');
  if (!host) return;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 4 / 3, 0.1, 50);
  camera.position.set(0, 0.35, 7.4);
  camera.lookAt(0, 0, 0);

  const world = new THREE.Group();
  scene.add(world);

  // Round, softly feathered point sprite
  const spriteTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.55, 'rgba(255,255,255,1)');
    grd.addColorStop(0.72, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();

  const rand = (() => { let s = 1337; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; })();
  const gauss = () => { let u = 0, v = 0; while (u === 0) u = rand(); while (v === 0) v = rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

  function cluster({ n, radius, center, color, size, edgeDist, edgeColor, edgeOpacity, flatten }) {
    const g = new THREE.Group(); g.position.copy(center);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(gauss(), gauss() * flatten, gauss()).normalize();
      const r = radius * Math.cbrt(rand()) * (0.55 + 0.45 * rand());
      pts.push(v.multiplyScalar(r));
    }
    const pos = new Float32Array(n * 3);
    pts.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; });
    const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pm = new THREE.PointsMaterial({ color, size, map: spriteTex, transparent: true, alphaTest: 0.02, depthWrite: false, sizeAttenuation: true });
    g.add(new THREE.Points(pg, pm));
    // edges to near neighbours
    const ep = [];
    for (let i = 0; i < n; i++) {
      let links = 0;
      for (let j = i + 1; j < n && links < 3; j++) {
        if (pts[i].distanceTo(pts[j]) < edgeDist) { ep.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z); links++; }
      }
    }
    const eg = new THREE.BufferGeometry(); eg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ep), 3));
    g.add(new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: edgeColor, transparent: true, opacity: edgeOpacity, depthWrite: false })));
    return { group: g, pts };
  }

  const teacher = cluster({ n: 560, radius: 1.55, center: new THREE.Vector3(-1.75, 0.05, 0), color: C.ink2, size: 0.055, edgeDist: 0.36, edgeColor: C.ink2, edgeOpacity: 0.16, flatten: 0.9 });
  const student = cluster({ n: 120, radius: 0.72, center: new THREE.Vector3(2.1, -0.1, 0.2), color: C.blue, size: 0.07, edgeDist: 0.36, edgeColor: C.blue, edgeOpacity: 0.28, flatten: 0.95 });
  world.add(teacher.group, student.group);

  // Transit curves and particles (teacher -> student)
  const N_CURVES = 28, SEG = 26, N_PART = 170;
  const curves = [];
  for (let i = 0; i < N_CURVES; i++) {
    const a = teacher.pts[Math.floor(rand() * teacher.pts.length)];
    const b = student.pts[Math.floor(rand() * student.pts.length)];
    curves.push({ a, b, lift: 0.5 + rand() * 1.1, sway: (rand() - 0.5) * 1.6 });
  }
  const curvePos = new Float32Array(N_CURVES * (SEG + 1) * 3);
  const curveIdx = [];
  for (let i = 0; i < N_CURVES; i++) for (let s = 0; s < SEG; s++) { const base = i * (SEG + 1); curveIdx.push(base + s, base + s + 1); }
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(curvePos, 3));
  cg.setIndex(curveIdx);
  world.add(new THREE.LineSegments(cg, new THREE.LineBasicMaterial({ color: C.accent, transparent: true, opacity: 0.16, depthWrite: false })));

  const parts = [];
  for (let i = 0; i < N_PART; i++) parts.push({ c: Math.floor(rand() * N_CURVES), t: rand(), v: 0.05 + rand() * 0.08 });
  const partPos = new Float32Array(N_PART * 3);
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(partPos, 3));
  const particles = new THREE.Points(pg, new THREE.PointsMaterial({ color: C.accent, size: 0.085, map: spriteTex, transparent: true, alphaTest: 0.02, depthWrite: false }));
  world.add(particles);

  const A = new THREE.Vector3(), B = new THREE.Vector3(), Cp = new THREE.Vector3(), P = new THREE.Vector3();
  function bezier(curve, t, out) {
    A.copy(curve.a).applyMatrix4(teacher.group.matrixWorld);
    B.copy(curve.b).applyMatrix4(student.group.matrixWorld);
    Cp.addVectors(A, B).multiplyScalar(0.5); Cp.y += curve.lift; Cp.z += curve.sway;
    const mt = 1 - t;
    out.set(
      mt * mt * A.x + 2 * mt * t * Cp.x + t * t * B.x,
      mt * mt * A.y + 2 * mt * t * Cp.y + t * t * B.y,
      mt * mt * A.z + 2 * mt * t * Cp.z + t * t * B.z,
    );
    return out;
  }
  function updateFlow(dt) {
    teacher.group.updateMatrixWorld(); student.group.updateMatrixWorld();
    for (let i = 0; i < N_CURVES; i++) for (let s = 0; s <= SEG; s++) {
      bezier(curves[i], s / SEG, P); const k = (i * (SEG + 1) + s) * 3;
      curvePos[k] = P.x; curvePos[k + 1] = P.y; curvePos[k + 2] = P.z;
    }
    cg.attributes.position.needsUpdate = true;
    parts.forEach((p, i) => {
      if (dt) { p.t += p.v * dt; if (p.t > 1) { p.t = 0; p.c = Math.floor(Math.random() * N_CURVES); } }
      bezier(curves[p.c], p.t, P);
      partPos[i * 3] = P.x; partPos[i * 3 + 1] = P.y; partPos[i * 3 + 2] = P.z;
    });
    pg.attributes.position.needsUpdate = true;
  }

  // Sizing
  function resize() {
    const w = host.clientWidth || 600, h = host.clientHeight || 450;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // keep the composition in frame on narrow boxes
    camera.position.z = camera.aspect < 1.1 ? 9.4 : 7.4;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(() => { resize(); if (reduceMotion) render(0); }).observe(host);
  resize();

  // Parallax
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  if (!reduceMotion) {
    window.addEventListener('pointermove', (e) => {
      const r = host.getBoundingClientRect();
      target.x = ((e.clientX - (r.left + r.width / 2)) / window.innerWidth) * 0.5;
      target.y = ((e.clientY - (r.top + r.height / 2)) / window.innerHeight) * 0.5;
    }, { passive: true });
  }

  let last = performance.now(), elapsed = 0;
  function render(dt) {
    elapsed += dt;
    cur.x += (target.x - cur.x) * 0.04; cur.y += (target.y - cur.y) * 0.04;
    world.rotation.y = Math.sin(elapsed * 0.12) * 0.16 + cur.x * 0.35;
    world.rotation.x = cur.y * 0.22;
    teacher.group.rotation.y = elapsed * 0.05;
    teacher.group.rotation.z = Math.sin(elapsed * 0.09) * 0.06;
    student.group.rotation.y = -elapsed * 0.09;
    updateFlow(dt);
    renderer.render(scene, camera);
  }
  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(host);
  if (reduceMotion) { elapsed = 4; render(0); return; }
  (function loop(now) {
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (visible && !document.hidden) render(dt);
    requestAnimationFrame(loop);
  })(last);
})();

/* ------------------------------------------------------------------ */
/* Charts                                                              */
/* ------------------------------------------------------------------ */
(function charts() {
  const el = $('#chart');
  if (!el || !window.echarts) return;

  echarts.registerTheme('paper', {
    color: [C.ink, C.accent, C.blue, C.green, C.ink3],
    backgroundColor: 'transparent',
    textStyle: { fontFamily: SANS, color: C.ink2 },
    title: { textStyle: { color: C.ink } },
    line: { symbolSize: 6, smooth: false },
    categoryAxis: { axisLine: { lineStyle: { color: C.ruleStrong } }, axisTick: { show: false }, axisLabel: { color: C.ink3, fontSize: 12 }, splitLine: { show: false } },
    valueAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: C.ink3, fontSize: 12 }, splitLine: { lineStyle: { color: C.rule } } },
    logAxis: { axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: C.ink3, fontSize: 12 }, splitLine: { lineStyle: { color: C.rule } } },
    tooltip: { backgroundColor: C.paper, borderColor: C.ruleStrong, borderWidth: 1, padding: [10, 12], textStyle: { color: C.ink, fontFamily: SANS, fontSize: 13 }, extraCssText: 'box-shadow: 0 8px 24px rgba(26,24,20,.10); border-radius: 4px;' },
  });
  const chart = echarts.init(el, 'paper', { renderer: 'canvas' });
  const isNarrow = () => el.clientWidth < 560;

  const priceOption = () => {
    const narrow = isNarrow();
    const label = (which) => ({
      show: true, position: 'right', distance: 8, fontFamily: SANS,
      formatter: (p) => { const d = PRICE_PAIRS[p.dataIndex][which]; return narrow ? `{v|${money(d[1])}}` : `{n|${d[0]}}  {v|${money(d[1])}}`; },
      rich: { n: { color: C.ink3, fontSize: 12 }, v: { color: C.ink, fontSize: 12.5, fontWeight: 600, fontFamily: MONO } },
    });
    return {
      grid: { left: narrow ? 74 : 104, right: narrow ? 64 : 230, top: 44, bottom: 28 },
      tooltip: { trigger: 'axis', axisPointer: { type: 'none' }, formatter: (ps) => `<b style="font-weight:600">${PRICE_PAIRS[ps[0].dataIndex].vendor}</b><br>${ps.map((p) => { const d = PRICE_PAIRS[p.dataIndex][p.seriesName.toLowerCase()]; return `${d[0]}: <span style="font-family:${MONO}">${money(d[1])}</span>`; }).join('<br>')}` },
      xAxis: { type: 'value', max: 3.6, axisLabel: { formatter: (v) => `$${v.toFixed(2)}`, fontFamily: MONO, fontSize: 11 }, splitNumber: 4 },
      yAxis: { type: 'category', inverse: true, data: PRICE_PAIRS.map((p) => p.vendor), axisLine: { show: false }, axisLabel: { color: C.ink, fontSize: 13, fontWeight: 500, margin: 16 } },
      graphic: [
        { type: 'group', left: narrow ? 74 : 104, top: 0, children: [
          { type: 'rect', shape: { width: 10, height: 10 }, style: { fill: C.ink }, top: 3 },
          { type: 'text', left: 16, style: { text: 'Teacher', fill: C.ink2, fontSize: 12.5, fontFamily: SANS } },
          { type: 'rect', shape: { width: 10, height: 10 }, style: { fill: C.accent }, left: 78, top: 3 },
          { type: 'text', left: 94, style: { text: 'Distilled student', fill: C.ink2, fontSize: 12.5, fontFamily: SANS } },
        ] },
        !narrow && { type: 'text', right: 0, top: 0, style: { text: 'Students list at 3–8% of the\nteacher price per input token', fill: C.ink3, fontSize: 12, lineHeight: 17, fontFamily: SANS, align: 'right' } },
      ].filter(Boolean),
      series: [
        { name: 'Teacher', type: 'bar', data: PRICE_PAIRS.map((p) => p.teacher[1]), barWidth: 14, itemStyle: { color: C.ink }, label: label('teacher') },
        { name: 'Student', type: 'bar', data: PRICE_PAIRS.map((p) => p.student[1]), barWidth: 14, itemStyle: { color: C.accent }, label: label('student') },
      ],
      barGap: '30%', barCategoryGap: '42%',
    };
  };

  const papersOption = () => {
    const narrow = isNarrow();
    const endLabel = (text, color) => ({ show: !narrow, formatter: text, color, fontSize: 12.5, fontWeight: 500, fontFamily: SANS, offset: [8, 0], lineHeight: 16 });
    return {
      grid: { left: 48, right: narrow ? 20 : 190, top: 36, bottom: 32 },
      tooltip: { trigger: 'axis', axisPointer: { lineStyle: { color: C.ruleStrong } }, valueFormatter: (v) => fmtNum(v) },
      xAxis: { type: 'category', boundaryGap: false, data: QUARTERS, axisLabel: { interval: 3, formatter: (v) => v.slice(0, 4), fontFamily: MONO, fontSize: 11 } },
      yAxis: { type: 'value', axisLabel: { formatter: (v) => fmtNum(v), fontFamily: MONO, fontSize: 11 }, splitNumber: 4 },
      series: [
        { name: 'All distillation preprints', type: 'line', data: PAPERS_ALL, symbol: 'none', lineStyle: { color: C.ink, width: 1.75 }, itemStyle: { color: C.ink }, endLabel: endLabel('All distillation\npreprints', C.ink),
          markLine: { silent: true, symbol: 'none', lineStyle: { color: C.ruleStrong, type: [3, 3] }, label: { show: true, position: 'insideEndTop', color: C.ink3, fontSize: 11.5, fontFamily: SANS, lineHeight: 15, distance: [0, 6] },
            data: [
              { xAxis: '2022 Q4', label: { formatter: 'ChatGPT\nreleased' } },
              { xAxis: '2025 Q1', label: { formatter: 'R1 distills\nreleased' } },
            ] } },
        { name: 'Mentioning language models', type: 'line', data: PAPERS_LLM, symbol: 'none', lineStyle: { color: C.accent, width: 1.75 }, itemStyle: { color: C.accent }, areaStyle: { color: C.accentSoft, opacity: 0.55 }, endLabel: endLabel('Of which: language\nmodels', C.accent) },
      ],
    };
  };

  const retentionOption = () => {
    const narrow = isNarrow();
    const rows = MODELS.filter((m) => m.params);
    const toPoint = (m) => ({ name: m.model.replace('DeepSeek-R1-Distill-', 'R1-Distill-').replace('-Instruct', ''), value: [m.params, m.retention], full: m.model });
    const openPts = rows.filter((m) => m.open).map(toPoint);
    const apiPts = rows.filter((m) => !m.open).map(toPoint);
    const trend = [[0.8, 36], [1, 40], [2, 52], [4, 66], [8, 76], [16, 85], [32, 90], [64, 93], [110, 95]];
    const scatter = (name, data, color, anno) => ({
      name, type: 'scatter', data, symbolSize: 11, itemStyle: { color, borderColor: C.paper, borderWidth: 1.5 },
      label: { show: !narrow, position: 'right', distance: 8, formatter: (p) => p.data.name, color: C.ink2, fontSize: 11.5, fontFamily: SANS },
      labelLayout: { hideOverlap: true },
      emphasis: { scale: 1.4 },
      markPoint: { symbol: 'circle', symbolSize: 0, silent: true, label: { show: true, color, fontSize: 12.5, fontWeight: 600, fontFamily: SANS, position: 'top', lineHeight: 16 }, data: [anno] },
    });
    return {
      grid: { left: 52, right: narrow ? 20 : 120, top: 40, bottom: 44 },
      tooltip: { trigger: 'item', formatter: (p) => p.seriesType === 'scatter' ? `<b style="font-weight:600">${p.data.full}</b><br>${p.value[0]}B parameters · ${p.value[1]}% retention` : '' },
      xAxis: { type: 'log', min: 0.7, max: 130, name: 'Student parameters (log scale)', nameLocation: 'middle', nameGap: 30, nameTextStyle: { color: C.ink3, fontSize: 12, fontFamily: SANS },
        axisLabel: { formatter: (v) => [1, 10, 100].includes(v) ? `${v}B` : '', fontFamily: MONO, fontSize: 11 }, splitLine: { show: true, lineStyle: { color: C.rule } }, minorSplitLine: { show: false } },
      yAxis: { type: 'value', min: 30, max: 100, name: 'Retention', nameTextStyle: { color: C.ink3, fontSize: 12, fontFamily: SANS, align: 'left', padding: [0, 0, 0, -36] }, axisLabel: { formatter: (v) => `${v}%`, fontFamily: MONO, fontSize: 11 }, splitNumber: 4 },
      series: [
        { name: 'Fitted trend', type: 'line', data: trend, smooth: 0.5, symbol: 'none', silent: true, lineStyle: { color: C.ink4, width: 1.25, type: [4, 4] }, tooltip: { show: false }, z: 1,
          markLine: { silent: true, symbol: 'none', lineStyle: { color: C.ink4, type: 'solid', width: 1 }, label: { show: !narrow, position: 'end', color: C.ink3, fontSize: 11.5, fontFamily: SANS, formatter: '90% of teacher', distance: 8 }, data: [{ yAxis: 90 }] } },
        scatter('Open-weight student', openPts, C.accent, { coord: [2.4, 62], value: 'Open-weight students' }),
        scatter('API-only student', apiPts, C.ink, { coord: [8, 96], value: 'API-only students' }),
      ],
    };
  };

  const CHARTS = {
    price: { option: priceOption, title: 'Input price, teacher against its distilled student', sub: 'US dollars per million input tokens, list price, September 2026', note: 'Note: published list prices for the standard tier; batch and cached-token discounts excluded. Meta and DeepSeek figures are for the cheapest hosted endpoint. Source: vendor pricing pages.<sup><a href="#src-1">1</a></sup>' },
    papers: { option: papersOption, title: 'The research base is compounding', sub: 'arXiv preprints per quarter with “distillation” in the title or abstract, cs.CL and cs.LG, 2019–2026', note: 'Note: quarterly counts by first submission date; cross-listed papers counted once. 2026 Q2 is partial as of 3 September. Source: arXiv listing API.<sup><a href="#src-3">3</a></sup>' },
    retention: { option: retentionOption, title: 'Retention rises with student size, up to a knee near 30B', sub: 'Benchmark score as a share of the teacher’s, aggregated across MMLU, GPQA and AIME where reported', note: 'Note: each point is one student model; the dashed curve is a smoothed fit, not a model. Models with undisclosed parameter counts are excluded. Source: model cards and technical reports.<sup><a href="#src-2">2</a></sup> <sup><a href="#src-4">4</a></sup>' },
  };
  let current = 'price';
  function show(key) {
    current = key;
    const c = CHARTS[key];
    chart.setOption(c.option(), { notMerge: true });
    $('#chartTitle').textContent = c.title;
    $('#chartSub').textContent = c.sub;
    $('#chartNote').innerHTML = c.note;
    el.setAttribute('aria-label', c.title);
  }
  const tabs = $$('.segmented [role="tab"]');
  tabs.forEach((t) => t.addEventListener('click', () => {
    tabs.forEach((x) => x.setAttribute('aria-selected', String(x === t)));
    show(t.dataset.chart);
  }));
  show(current);
  let raf;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { chart.setOption(CHARTS[current].option(), { notMerge: true }); chart.resize(); }); });
})();

/* ------------------------------------------------------------------ */
/* Comparison table                                                    */
/* ------------------------------------------------------------------ */
(function table() {
  const tbody = $('#table tbody'), ths = $$('#table th[data-key]');
  const state = { key: 'retention', dir: 'desc', vendor: 'all' };

  function row(m) {
    const bar = `<span class="retention"><span class="retention__bar"><i style="width:${m.retention}%"></i></span><span class="retention__val">${m.retention}%</span></span>`;
    return `<tr>
      <td class="model">${m.model}<small>${m.open ? 'Open weights' : 'API only'}</small></td>
      <td>${m.vendor}</td>
      <td class="dim">${m.teacher}</td>
      <td class="num">${m.params ? `${m.params}B` : '<span class="dim">n/d</span>'}</td>
      <td class="method">${m.method}</td>
      <td class="num">${bar}</td>
      <td class="num">${money(m.price)}</td>
      <td class="num dim">${monthName(m.released)}</td>
    </tr>`;
  }
  function render() {
    const th = ths.find((t) => t.dataset.key === state.key);
    ths.forEach((t) => t.setAttribute('aria-sort', t === th ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'));
    const rows = MODELS.filter((m) => state.vendor === 'all' || m.vendor === state.vendor);
    const type = th.dataset.type, k = state.key, s = state.dir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      let va = a[k], vb = b[k];
      if (type === 'num') {
        if (va == null && vb == null) return 0; if (va == null) return 1; if (vb == null) return -1;
        if (k === 'released') { va = va.replace('-', ''); vb = vb.replace('-', ''); return (va < vb ? -1 : va > vb ? 1 : 0) * s; }
        return (va - vb) * s;
      }
      return String(va).localeCompare(String(vb)) * s;
    });
    tbody.innerHTML = rows.length ? rows.map(row).join('') : '<tr class="table__empty"><td colspan="8">No models match this filter.</td></tr>';
    $('#chipCount').textContent = MODELS.length;
  }
  ths.forEach((th) => th.querySelector('button').addEventListener('click', () => {
    if (state.key === th.dataset.key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
    else { state.key = th.dataset.key; state.dir = th.dataset.type === 'num' ? 'desc' : 'asc'; }
    render();
  }));
  $$('#chips .chip').forEach((chip) => chip.addEventListener('click', () => {
    $$('#chips .chip').forEach((c) => c.classList.toggle('is-active', c === chip));
    state.vendor = chip.dataset.vendor; render();
  }));
  // Counts on chips
  $$('#chips .chip').forEach((chip) => { if (chip.dataset.vendor !== 'all') { const n = MODELS.filter((m) => m.vendor === chip.dataset.vendor).length; chip.insertAdjacentHTML('beforeend', ` <span class="chip__count">${n}</span>`); } });
  render();
})();

/* ------------------------------------------------------------------ */
/* Library cards + drawer                                              */
/* ------------------------------------------------------------------ */
(function library() {
  const grid = $('#cards'), drawer = $('#drawer');
  let opener = null;
  grid.innerHTML = METHODS.map((m, i) => `
    <button class="card" type="button" data-i="${i}" aria-haspopup="dialog">
      <div class="card__top">
        <span class="card__family"><i class="fam--${m.fam}"></i>${m.family}</span>
        <span class="dots" role="img" aria-label="Difficulty ${m.difficulty} of 5">${[1,2,3,4,5].map((d) => `<i class="${d <= m.difficulty ? 'on' : ''}"></i>`).join('')}</span>
      </div>
      <h3 class="card__title">${m.title}</h3>
      <p class="card__desc">${m.desc}</p>
      <div class="card__foot"><span>${m.cite}</span><span class="card__open">Open</span></div>
    </button>`).join('');

  function open(i) {
    const m = METHODS[i];
    $('#drawerFamily').innerHTML = `<i class="dot fam--${m.fam}"></i>${m.family} family`;
    $('#drawerTitle').textContent = m.title;
    $('#drawerMeta').innerHTML = `<span>${m.meta}</span>`;
    $('#drawerLede').textContent = m.lede;
    try { katex.render(m.formula, $('#drawerFormula'), { displayMode: true, throwOnError: false }); }
    catch (e) { $('#drawerFormula').textContent = m.formula; }
    $('#drawerGloss').textContent = m.gloss;
    $('#drawerUses').innerHTML = m.uses.map((u) => `<li>${u}</li>`).join('');
    $('#drawerTradeoffs').textContent = m.tradeoffs;
    $('#drawerCite').textContent = m.cite;
    drawer.hidden = false; document.body.classList.add('is-locked');
    $('.drawer__close', drawer).focus();
  }
  function close() { drawer.hidden = true; document.body.classList.remove('is-locked'); opener?.focus(); }
  grid.addEventListener('click', (e) => { const b = e.target.closest('.card'); if (b) { opener = b; open(+b.dataset.i); } });
  $$('[data-close]', drawer).forEach((x) => x.addEventListener('click', close));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !drawer.hidden) close(); });
})();

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */
(function timeline() {
  $('#tl').innerHTML = EVENTS.map((e) => `
    <li class="tl--${e.cat}">
      <p class="tl__date">${e.date}</p>
      <div class="tl__node"></div>
      <p class="tl__cat">${e.label}</p>
      <h3 class="tl__title">${e.title}</h3>
      <p class="tl__body">${e.body}</p>
    </li>`).join('');
})();

/* ------------------------------------------------------------------ */
/* Command palette                                                     */
/* ------------------------------------------------------------------ */
(function palette() {
  const pal = $('#palette'), input = $('#paletteInput'), list = $('#paletteList'), btn = $('#searchBtn');
  const items = [
    ...['Overview', 'Academic', 'Financial', 'Political', 'Company', 'Developer', 'Customer', 'Library', 'Timeline'].map((p) => ({ label: p, kind: 'Perspective', href: `#${p.toLowerCase()}` })),
    { label: 'Compare distilled models', kind: 'Table', href: '#compare' },
    { label: 'Methodology and sources', kind: 'Footer', href: '#methodology' },
    ...MODELS.map((m) => ({ label: m.model, kind: m.vendor, href: '#compare' })),
    ...METHODS.map((m, i) => ({ label: m.title, kind: `${m.family} method`, href: '#library', method: i })),
  ];
  let opener = null;
  function render(q = '') {
    const s = q.trim().toLowerCase();
    const hits = items.filter((it) => !s || it.label.toLowerCase().includes(s) || it.kind.toLowerCase().includes(s)).slice(0, 10);
    list.innerHTML = hits.length ? hits.map((it, i) => `<li><a href="${it.href}" data-i="${i}" ${it.method != null ? `data-method="${it.method}"` : ''}><span>${it.label}</span><span>${it.kind}</span></a></li>`).join('') : '<li class="palette__empty">Nothing matches. Try a vendor, a model or a method.</li>';
  }
  function open() { opener = document.activeElement; pal.hidden = false; document.body.classList.add('is-locked'); input.value = ''; render(); setTimeout(() => input.focus(), 0); }
  function close() { pal.hidden = true; document.body.classList.remove('is-locked'); opener?.focus?.(); }
  btn.addEventListener('click', open);
  $$('[data-close]', pal).forEach((x) => x.addEventListener('click', close));
  input.addEventListener('input', () => render(input.value));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const a = $('a', list); if (a) a.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); $('a', list)?.focus(); }
  });
  list.addEventListener('keydown', (e) => {
    const links = $$('a', list), i = links.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); links[Math.min(i + 1, links.length - 1)]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); if (i <= 0) input.focus(); else links[i - 1].focus(); }
  });
  list.addEventListener('click', (e) => {
    const a = e.target.closest('a'); if (!a) return;
    close();
    if (a.dataset.method != null) setTimeout(() => $$('#cards .card')[+a.dataset.method]?.click(), 350);
  });
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); pal.hidden ? open() : close(); }
    if (e.key === 'Escape' && !pal.hidden) close();
  });
})();
