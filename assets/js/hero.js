// Global Distillation — hero scene.
// A dense teacher point cloud on the left transfers accent-coloured soft targets
// along curved Bezier paths into a smaller, denser student cloud on the right.
// One Points draw call per group, hairline LineSegments for the internal mesh,
// and a legend + fact list beneath that carry the same figures in text.
//
// Contract: export mountHero(el) where el is #hero-canvas. See BUILD-CONTRACT.md.

import * as THREE from 'three';
import { data, live, loadPerspective, ROUTES } from './app.js';

/* ------------------------------------------------------------------ */
/* Palette — sRGB values lifted straight from DESIGN.md section 2.      */
/* Point materials write sRGB directly (no colour-space include), so    */
/* these are the exact bytes that land on the paper ground.             */
/* ------------------------------------------------------------------ */
const RGB = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

const INK_3 = 0x6b655c;   // --ink-3
const INK_4 = 0xb2aa9d;   // --ink-4
const ACCENT = 0xb5451b;  // --accent
const CAT_2 = 0x1f6a99;   // --cat-2

const CFG = {
  camZ: 9,
  fov: 45,
  teacher: { n: 900, r: 2.7, cx: -1.95, cy: 0.05, cz: 0, flatY: 0.88, flatZ: 0.74, seeds: 7, size: 0.128 },
  student: { n: 260, r: 1.05, cx: 3.55, cy: -0.1, cz: 0.1, flatY: 0.9, flatZ: 0.86, seeds: 2, size: 0.125 },
  links: { teacher: 1400, student: 380 },
  curves: 24,
  lut: 48,
  signal: { n: 180, size: 0.135, loop: 6 },
  margin: 0.4,
  parallaxDeg: 3,
  parallaxLerp: 0.06,
  studentSpin: 0.06,
  teacherSpin: 0.017,
};

/* ------------------------------------------------------------------ */
/* Legend and facts — text carries every figure the scene implies.      */
/* ------------------------------------------------------------------ */
const LEGEND = [
  { hex: INK_3, name: 'Teacher', value: '671B parameters', sub: 'DeepSeek-R1' },
  { hex: ACCENT, name: 'Soft targets in transit', value: '800k reasoning traces', sub: 'curated by the teacher' },
  { hex: CAT_2, name: 'Student', value: '32B parameters', sub: 'R1-Distill-Qwen-32B' },
];

const hexCss = (hex) => '#' + hex.toString(16).padStart(6, '0');
const fmtInt = (n) => Number(n).toLocaleString('en-US');

function fillLegend() {
  const el = document.getElementById('hero-legend');
  if (!el) return;
  el.innerHTML = LEGEND.map((k) => (
    '<span class="hero__key">' +
      '<svg class="hero__swatch" width="9" height="9" viewBox="0 0 9 9" aria-hidden="true" focusable="false">' +
        '<circle cx="4.5" cy="4.5" r="4.5" fill="' + hexCss(k.hex) + '"></circle></svg>' +
      '<span class="hero__key-name">' + k.name + '</span> ' +
      '<span class="hero__key-value">' + k.value + '</span> ' +
      '<span class="hero__key-sub">' + k.sub + '</span>' +
    '</span>'
  )).join(' ');
}

/** Facts, best available first; every entry is read from loaded data or is
 *  true regardless of what loaded. Nothing here is invented. */
function factCandidates() {
  const out = [];
  const methods = data.library && data.library.extras && data.library.extras.methods;
  if (Array.isArray(methods) && methods.length) out.push(['Methods catalogued', fmtInt(methods.length)]);

  const models = data.customer && data.customer.extras && data.customer.extras.models;
  if (Array.isArray(models) && models.length) out.push(['Models compared', fmtInt(models.length)]);

  const perYear = live && live.arxiv && Array.isArray(live.arxiv.perYear) ? live.arxiv.perYear : null;
  if (perYear && perYear.length) {
    const y = perYear[perYear.length - 1];
    // The academic section reports 709 for the same year: that count is an
    // abstract-only query, this one is a full-text query, and two numbers that
    // differ by 3% have to say why on a site about verifiable figures.
    if (y && typeof y.count === 'number') {
      out.push(['Preprints, ' + y.year + ' to date (full text)', fmtInt(y.count)]);
    }
  }

  const hf = live && live.huggingface && live.huggingface.distillModels;
  if (typeof hf === 'number' && hf > 0) out.push(['Distilled models on Hugging Face', fmtInt(hf)]);

  const sources = Object.values(data).reduce((n, d) => n + ((d && d.sources && d.sources.length) || 0), 0);
  if (sources) out.push(['Primary sources', fmtInt(sources)]);

  // Always-true tail, so three pairs render even before any file has landed.
  const perspectives = ROUTES.filter((r) => r.group === 'perspective' && r.file).length;
  out.push(['Perspectives', String(perspectives || 6)]);
  out.push(['Timeline span', '2006–2026']);
  out.push(['Reference sections', String(ROUTES.filter((r) => r.group === 'reference').length || 3)]);
  return out;
}

function fillFacts() {
  const el = document.getElementById('hero-facts');
  if (!el) return;
  const picked = factCandidates().slice(0, 3);
  el.innerHTML = picked.map(([label, value]) => (
    '<div class="hero__fact">' +
      '<dt class="hero__fact-label">' + label + '</dt>' +
      '<dd class="hero__fact-value">' + value + '</dd>' +
    '</div>'
  )).join('');
}

/* ------------------------------------------------------------------ */
/* Deterministic RNG so the composition is identical on every load.     */
/* ------------------------------------------------------------------ */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ------------------------------------------------------------------ */
/* Point material — one draw call, per-point size and alpha.            */
/* ------------------------------------------------------------------ */
const POINT_VERT = `
attribute float aSize;
attribute float aAlpha;
uniform float uScale;
uniform float uShrink;
varying float vAlpha;
void main() {
  vAlpha = aAlpha;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uShrink * (uScale / -mv.z), 1.0, 48.0);
  gl_Position = projectionMatrix * mv;
}`;

const POINT_FRAG = `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float r = length(gl_PointCoord - vec2(0.5));
  float a = smoothstep(0.5, 0.32, r) * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

function pointMaterial(hex, uScale) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Vector3(...RGB(hex)) },
      uScale: { value: uScale },
      uShrink: { value: 1 },
    },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
}

/* ------------------------------------------------------------------ */
/* Cloud construction                                                   */
/* ------------------------------------------------------------------ */
function buildCloud(cfg, rnd) {
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const inBall = (radius, power) => {
    const v = new THREE.Vector3(gauss(), gauss(), gauss());
    if (v.lengthSq() === 0) v.set(1, 0, 0);
    return v.normalize().multiplyScalar(radius * Math.pow(rnd(), power));
  };

  // A handful of attractors gives the cluster its irregular, networked texture
  // instead of the even fuzz of a plain gaussian ball.
  const seeds = [];
  for (let i = 0; i < cfg.seeds; i++) seeds.push(inBall(cfg.r * 0.62, 0.5));

  const pts = [];
  for (let i = 0; i < cfg.n; i++) {
    let p;
    if (rnd() < 0.62 && seeds.length) {
      const s = seeds[(rnd() * seeds.length) | 0];
      p = s.clone().add(new THREE.Vector3(gauss(), gauss(), gauss()).multiplyScalar(cfg.r * 0.24));
      if (p.length() > cfg.r) p.setLength(cfg.r * (0.86 + 0.14 * rnd()));
    } else {
      p = inBall(cfg.r, 0.42);
    }
    p.y *= cfg.flatY;
    p.z *= cfg.flatZ;
    pts.push(p);
  }

  const n = pts.length;
  const pos = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i * 3] = pts[i].x; pos[i * 3 + 1] = pts[i].y; pos[i * 3 + 2] = pts[i].z;
    size[i] = cfg.size * (0.78 + 0.5 * rnd());
    alpha[i] = 0.68 + 0.32 * rnd();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  return { geo, pts };
}

/** Hairline mesh: up to three near neighbours per node, evenly thinned to cap. */
function buildLinks(pts, dist, cap) {
  const pairs = [];
  const d2 = dist * dist;
  for (let i = 0; i < pts.length; i++) {
    let made = 0;
    for (let j = i + 1; j < pts.length && made < 3; j++) {
      if (pts[i].distanceToSquared(pts[j]) < d2) { pairs.push(i, j); made++; }
    }
  }
  const total = pairs.length / 2;
  const stride = total > cap ? total / cap : 1;
  const keep = Math.min(total, cap);
  const pos = new Float32Array(keep * 6);
  for (let k = 0; k < keep; k++) {
    const idx = Math.min(total - 1, Math.floor(k * stride)) * 2;
    const a = pts[pairs[idx]], b = pts[pairs[idx + 1]];
    const o = k * 6;
    pos[o] = a.x; pos[o + 1] = a.y; pos[o + 2] = a.z;
    pos[o + 3] = b.x; pos[o + 4] = b.y; pos[o + 5] = b.z;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return geo;
}

/* ------------------------------------------------------------------ */
/* Scene                                                                */
/* ------------------------------------------------------------------ */
export function mountHero(el) {
  fillLegend();
  fillFacts();
  // Perspective files land after the hero mounts. These promises are cached in
  // app.js, so this waits on the loads the overview is already doing rather than
  // re-fetching, and resolves to null for any file not written yet.
  Promise.all(ROUTES.filter((r) => r.file).map((r) => loadPerspective(r.file)))
    .then(fillFacts)
    .catch(() => {});

  if (!el || typeof el.appendChild !== 'function') return;

  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch (err) {
    return; // No WebGL: the legend and facts still carry every figure.
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  el.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.fov, 16 / 10, 0.1, 60);
  camera.position.set(0, 0, CFG.camZ);

  const world = new THREE.Group();
  scene.add(world);

  const rnd = mulberry32(20260903);
  const half = Math.tan((CFG.fov / 2) * Math.PI / 180);
  let uScale = 240;

  // --- teacher -----------------------------------------------------------
  const teacher = buildCloud(CFG.teacher, rnd);
  const teacherGroup = new THREE.Group();
  teacherGroup.position.set(CFG.teacher.cx, CFG.teacher.cy, CFG.teacher.cz);
  const teacherMat = pointMaterial(INK_3, uScale);
  const teacherPoints = new THREE.Points(teacher.geo, teacherMat);
  const teacherLinkGeo = buildLinks(teacher.pts, CFG.teacher.r * 0.19, CFG.links.teacher);
  const teacherLinkMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(INK_4), transparent: true, opacity: 0.46, depthWrite: false, depthTest: false,
  });
  teacherGroup.add(teacherPoints, new THREE.LineSegments(teacherLinkGeo, teacherLinkMat));
  world.add(teacherGroup);

  // --- student -----------------------------------------------------------
  const student = buildCloud(CFG.student, rnd);
  const studentGroup = new THREE.Group();
  studentGroup.position.set(CFG.student.cx, CFG.student.cy, CFG.student.cz);
  const studentMat = pointMaterial(CAT_2, uScale);
  const studentPoints = new THREE.Points(student.geo, studentMat);
  const studentLinkGeo = buildLinks(student.pts, CFG.student.r * 0.34, CFG.links.student);
  const studentLinkMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(CAT_2), transparent: true, opacity: 0.34, depthWrite: false, depthTest: false,
  });
  studentGroup.add(studentPoints, new THREE.LineSegments(studentLinkGeo, studentLinkMat));
  world.add(studentGroup);

  // --- transfer paths ----------------------------------------------------
  // Endpoints are baked in world space so the clouds can spin underneath the
  // flow without the paths whipping around with them.
  const NC = CFG.curves, LUT = CFG.lut;
  // Endpoints are chosen on the facing side of each cloud and ordered by height,
  // so the 24 strands run as a calm parallel fan instead of a tangle.
  const pickFace = (pts, sign, targetY, offset) => {
    let best = pts[0], bestScore = -Infinity;
    for (let k = 0; k < 26; k++) {
      const p = pts[(rnd() * pts.length) | 0];
      const s = sign * p.x * 0.9 - Math.abs(p.y - targetY) * 1.7 + rnd() * 0.15;
      if (s > bestScore) { bestScore = s; best = p; }
    }
    return best.clone().add(offset);
  };
  const teacherOff = new THREE.Vector3(CFG.teacher.cx, CFG.teacher.cy, CFG.teacher.cz);
  const studentOff = new THREE.Vector3(CFG.student.cx, CFG.student.cy, CFG.student.cz);

  const lutPos = new Float32Array(NC * (LUT + 1) * 3);
  const curveIdx = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < NC; i++) {
    const u = (i + 0.5) / NC;                       // 0..1 across the fan
    const fan = (u - 0.5) * 2;                      // -1..1
    const a = pickFace(teacher.pts, 1, fan * CFG.teacher.r * 0.72, teacherOff);
    const b = pickFace(student.pts, -1, fan * CFG.student.r * 0.5, studentOff);
    const sway = Math.sin(u * Math.PI * 2) * 0.8 + (rnd() - 0.5) * 0.3;
    const c1 = new THREE.Vector3(a.x + 1.4 + rnd() * 0.5, a.y + fan * 0.75, a.z * 0.5 + sway * 0.6);
    const c2 = new THREE.Vector3(b.x - 2.2 - rnd() * 0.6, b.y + fan * 1.35, b.z * 0.5 + sway);
    const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);
    for (let s = 0; s <= LUT; s++) {
      curve.getPoint(s / LUT, tmp);
      const o = (i * (LUT + 1) + s) * 3;
      lutPos[o] = tmp.x; lutPos[o + 1] = tmp.y; lutPos[o + 2] = tmp.z;
      if (s < LUT) { const base = i * (LUT + 1); curveIdx.push(base + s, base + s + 1); }
    }
  }
  const pathGeo = new THREE.BufferGeometry();
  pathGeo.setAttribute('position', new THREE.BufferAttribute(lutPos, 3));
  pathGeo.setIndex(curveIdx);
  const pathMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(ACCENT), transparent: true, opacity: 0.2, depthWrite: false, depthTest: false,
  });
  world.add(new THREE.LineSegments(pathGeo, pathMat));

  // --- signal particles --------------------------------------------------
  const NP = CFG.signal.n;
  const sigPos = new Float32Array(NP * 3);
  const sigSize = new Float32Array(NP);
  const sigAlpha = new Float32Array(NP);
  const sigCurve = new Int16Array(NP);
  const sigPhase = new Float32Array(NP);
  const perCurve = NP / NC;
  for (let i = 0; i < NP; i++) {
    sigCurve[i] = i % NC;
    // Staggered phase only, so the whole flow repeats exactly every loop.
    sigPhase[i] = (Math.floor(i / NC) + 0.35 * rnd()) / perCurve + (i % NC) * 0.013;
    sigSize[i] = CFG.signal.size * (0.8 + 0.5 * rnd());
    sigAlpha[i] = 0;
  }
  const sigGeo = new THREE.BufferGeometry();
  sigGeo.setAttribute('position', new THREE.BufferAttribute(sigPos, 3));
  sigGeo.setAttribute('aSize', new THREE.BufferAttribute(sigSize, 1));
  sigGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sigAlpha, 1));
  const sigMat = pointMaterial(ACCENT, uScale);
  world.add(new THREE.Points(sigGeo, sigMat));

  function updateSignal(elapsed) {
    for (let i = 0; i < NP; i++) {
      let t = elapsed / CFG.signal.loop + sigPhase[i];
      t -= Math.floor(t);
      const f = t * LUT;
      let i0 = f | 0;
      if (i0 >= LUT) i0 = LUT - 1;
      const fr = f - i0;
      const o = (sigCurve[i] * (LUT + 1) + i0) * 3;
      sigPos[i * 3] = lutPos[o] + (lutPos[o + 3] - lutPos[o]) * fr;
      sigPos[i * 3 + 1] = lutPos[o + 1] + (lutPos[o + 4] - lutPos[o + 1]) * fr;
      sigPos[i * 3 + 2] = lutPos[o + 2] + (lutPos[o + 5] - lutPos[o + 2]) * fr;
      // ease in as it leaves the teacher, ease out as it is absorbed
      const inFade = t < 0.1 ? t / 0.1 : 1;
      const outFade = t > 0.86 ? (1 - t) / 0.14 : 1;
      sigAlpha[i] = 0.95 * inFade * outFade;
    }
    sigGeo.attributes.position.needsUpdate = true;
    sigGeo.attributes.aAlpha.needsUpdate = true;
  }

  /* ---------------- centre and measure ---------------- */
  // Recentre everything on the composition's own bounding box so the scene sits
  // in the middle of whatever box the CSS gives it, and rotates about its centre.
  const lo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const hi = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const grow = (x, y, z) => {
    if (x < lo.x) lo.x = x; if (x > hi.x) hi.x = x;
    if (y < lo.y) lo.y = y; if (y > hi.y) hi.y = y;
    if (z < lo.z) lo.z = z; if (z > hi.z) hi.z = z;
  };
  teacher.pts.forEach((p) => grow(p.x + teacherOff.x, p.y + teacherOff.y, p.z + teacherOff.z));
  student.pts.forEach((p) => grow(p.x + studentOff.x, p.y + studentOff.y, p.z + studentOff.z));
  for (let i = 0; i < lutPos.length; i += 3) grow(lutPos[i], lutPos[i + 1], lutPos[i + 2]);

  const mid = new THREE.Vector3().addVectors(lo, hi).multiplyScalar(0.5);
  teacherGroup.position.sub(mid);
  studentGroup.position.sub(mid);
  for (let i = 0; i < lutPos.length; i += 3) {
    lutPos[i] -= mid.x; lutPos[i + 1] -= mid.y; lutPos[i + 2] -= mid.z;
  }
  pathGeo.attributes.position.needsUpdate = true;
  const halfW0 = (hi.x - lo.x) / 2;
  const halfH0 = (hi.y - lo.y) / 2;

  /* ---------------- sizing ---------------- */
  const bufSize = new THREE.Vector2();
  function fit() {
    if (!el.clientWidth && !el.clientHeight) return;   // hero hidden on another route
    const w = Math.max(1, el.clientWidth || 640);
    let h = el.clientHeight;
    if (h < 40) { h = Math.round(w * 0.6); canvas.style.height = h + 'px'; }
    else { canvas.style.height = '100%'; }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const halfH = CFG.camZ * half;
    const halfW = halfH * camera.aspect;
    const s = Math.max(0.2, Math.min(1.6, (halfW - CFG.margin) / halfW0, (halfH - CFG.margin) / halfH0));
    // The composition is a wide ribbon; in a squarer box it would letterbox, so
    // take back a little of the vertical room. x and z stay equal, which keeps
    // the y-spin free of shear.
    const yBoost = Math.max(1, Math.min(1.28, (halfH - CFG.margin) / (halfH0 * s)));
    world.scale.set(s, s * yBoost, s);
    renderer.getDrawingBufferSize(bufSize);
    uScale = bufSize.y * 0.5;
    // Dots track the composition's scale, so a small canvas reads as the same
    // drawing rather than the same dots on a smaller cloud.
    const shrink = Math.pow(Math.min(1, s), 0.8);
    [teacherMat, studentMat, sigMat].forEach((m) => {
      m.uniforms.uScale.value = uScale;
      m.uniforms.uShrink.value = shrink;
    });
  }

  /* ---------------- motion ---------------- */
  const MAX_TILT = (CFG.parallaxDeg * Math.PI) / 180;
  const aim = { x: 0, y: 0 };
  const tilt = { x: 0, y: 0 };
  let elapsed = 0;

  function draw() {
    world.rotation.y = tilt.x;
    world.rotation.x = tilt.y;
    teacherGroup.rotation.y = elapsed * CFG.teacherSpin;
    teacherGroup.rotation.z = Math.sin(elapsed * 0.11) * 0.035;
    studentGroup.rotation.y = elapsed * CFG.studentSpin;
    updateSignal(elapsed);
    renderer.render(scene, camera);
  }

  function step(dt) {
    elapsed += dt;
    tilt.x += (aim.x * MAX_TILT - tilt.x) * CFG.parallaxLerp;
    tilt.y += (aim.y * MAX_TILT - tilt.y) * CFG.parallaxLerp;
    draw();
  }

  let rafId = 0;
  let last = 0;
  let disposed = false;
  let onScreen = true;

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    step(dt);
  }
  function play() {
    if (rafId || disposed || reduce) return;
    last = performance.now();
    rafId = requestAnimationFrame(tick);
  }
  function pause() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
  }
  function sync() {
    if (onScreen && !document.hidden) play(); else pause();
  }

  const onPointer = (e) => {
    const w = window.innerWidth || 1, h = window.innerHeight || 1;
    aim.x = Math.max(-1, Math.min(1, (e.clientX / w) * 2 - 1));
    aim.y = Math.max(-1, Math.min(1, (e.clientY / h) * 2 - 1));
  };
  const onVisibility = () => sync();

  const ro = new ResizeObserver(() => { fit(); if (reduce || !rafId) draw(); });
  ro.observe(el);
  const io = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); }, { threshold: 0 });
  io.observe(el);

  fit();

  if (reduce) {
    elapsed = 2.4;   // one frame, mid-flight, so the transfer still reads
    draw();
  } else {
    window.addEventListener('pointermove', onPointer, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    elapsed = 2.4;
    draw();
    sync();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    pause();
    ro.disconnect();
    io.disconnect();
    window.removeEventListener('pointermove', onPointer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', dispose);
    [teacher.geo, student.geo, teacherLinkGeo, studentLinkGeo, pathGeo, sigGeo].forEach((g) => g.dispose());
    [teacherMat, studentMat, sigMat, teacherLinkMat, studentLinkMat, pathMat].forEach((m) => m.dispose());
    scene.clear();
    renderer.dispose();
    if (renderer.forceContextLoss) renderer.forceContextLoss();
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }
  window.addEventListener('pagehide', dispose);
}
